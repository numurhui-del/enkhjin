import * as THREE from 'three';

// Бодит салютын систем.
//
// Пуужин (shell) газраас хөөрч, хүндийн хүчээр удааширсаар оргил цэгтээ
// хүрээд дэлбэрнэ. Дэлбэрэхэд "од" (star) тархаж, агаарын эсэргүүцэлд
// удааширч, аажмаар доошоо унаж, шатаж дуусна. Төрөл бүрийн салют:
//
//  peony         бөмбөрцөг, ул мөргүй тод од, дотроо өөр өнгийн цөмтэй
//  chrysanthemum бөмбөрцөг, од бүр оч цацруулан ул мөр үлдээнэ
//  willow        алтан бургас: урт унжсан алтан ул мөр, удаан
//  kamuro        өтгөн алтан титэм, гялалзан унана
//  palm          далдуу мод: цөөн бүдүүн алтан мөчир
//  crossette     од бүр хагас замдаа дахин 4 хуваагдана
//  multibreak    дэлбэрээд, дотроос нь хэдэн жижиг бөмбөг дахин дэлбэрнэ
//  crackle       алтан од шатаж дуусахдаа тачигнан хагарна
//  strobe        мөнгөлөг од анивчина
//  ring          цагираг
//  colorchange   од шатах явцдаа өнгөө солино
//  salute        хүчтэй цагаан гялбаа, чанга буу
//  heart, bigHeart, flash

export const VERT = /* glsl */ `
attribute float pSize;
attribute float pAlpha;
attribute vec3 pColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pColor;
  vAlpha = pAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(pSize * uScale / -mv.z, 1.0, 90.0);
  gl_Position = projectionMatrix * mv;
}`;

export const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * (0.65 + core * 0.9), vAlpha * core * core);
  #include <colorspace_fragment>
}`;

// Од бүрийн шинж чанар (bit flag)
const F_TRAIL = 1;      // ул мөр үлдээнэ
const F_FLICKER = 2;    // шатаж дуусахдаа гялалзана
const F_STROBE = 4;     // анивчина
const F_CRACKLE = 8;    // шатаж дуусахдаа тачигнана
const F_SPLIT = 16;     // дахин хуваагдана / дэлбэрнэ
const F_CHANGE = 32;    // өнгөө солино
const F_GOLD = 64;      // ул мөр нь алтан
const F_HIDDEN = 128;   // үл харагдах тээгч (multibreak-ийн жижиг бөмбөг)

const SPLIT_CROSSETTE = 1;
const SPLIT_SUBSHELL = 2;

const SHELL_TYPES = [
  'peony', 'peony', 'chrysanthemum', 'chrysanthemum', 'willow', 'kamuro', 'palm',
  'crossette', 'multibreak', 'crackle', 'strobe', 'ring', 'colorchange',
];

const RISE_GRAVITY = 5;
const BURST_SCALE = 1.4;     // тэсрэлтийн хэмжээ (том болгох бол ихэсгэ)
const STAR_SIZE = 1.3;       // одны хэмжээ
const LIFE_SCALE = 0.72;     // од агаарт хэр удаан байх (бага бол хурдан унтарна)       // пуужин хөөрөхөд нөлөөлөх хүндийн хүч
const SOUND_PER_UNIT = 0.018; // дуу гэрлээс хоцорч ирэх хугацаа (зайнаас хамаарна)

const GOLD = new THREE.Color('#ffc46b');
const WARM = new THREE.Color('#ffe2a8');
const WHITE = new THREE.Color('#ffffff');
const SILVER = new THREE.Color('#e8eeff');

export class Fireworks {
  constructor(scene, camera, cfg, audio) {
    this.camera = camera;
    this.audio = audio;
    this.palette = cfg.colors.map((c) => new THREE.Color(c));
    const cap = (this.cap = cfg.maxParticles);

    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.col2 = new Float32Array(cap * 3);
    this.alpha = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.baseSize = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.flags = new Uint8Array(cap);
    this.trailLife = new Float32Array(cap);
    this.trailTimer = new Float32Array(cap);
    this.splitKind = new Uint8Array(cap);
    this.splitAt = new Float32Array(cap);
    this.cursor = 0;
    this.time = 0;

    const geo = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.posAttr = mk(this.pos, 3);
    this.colAttr = mk(this.col, 3);
    this.alphaAttr = mk(this.alpha, 1);
    this.sizeAttr = mk(this.size, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('pColor', this.colAttr);
    geo.setAttribute('pAlpha', this.alphaAttr);
    geo.setAttribute('pSize', this.sizeAttr);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);

    this.rockets = [];
    this.queue = [];
    this.show = null;
    this.showPaused = false;
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  randomColor() {
    return this.palette[Math.floor(Math.random() * this.palette.length)];
  }

  _otherColor(c) {
    let o = this.randomColor();
    for (let i = 0; i < 4 && o.equals(c); i++) o = this.randomColor();
    return o;
  }

  // ---------------- Particle үүсгэх ----------------

  _spawn(px, py, pz, vx, vy, vz, color, size, life, drag, grav, flags = 0, extra = null) {
    const cap = this.cap;
    let i = this.cursor;
    for (let n = 0; n < cap; n++) {
      const k = (this.cursor + n) % cap;
      if (this.life[k] <= 0) {
        i = k;
        break;
      }
    }
    this.cursor = (i + 1) % cap;
    const i3 = i * 3;
    this.pos[i3] = px;
    this.pos[i3 + 1] = py;
    this.pos[i3 + 2] = pz;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i3] = color.r;
    this.col[i3 + 1] = color.g;
    this.col[i3 + 2] = color.b;
    const c2 = extra && extra.color2 ? extra.color2 : color;
    this.col2[i3] = c2.r;
    this.col2[i3 + 1] = c2.g;
    this.col2[i3 + 2] = c2.b;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = flags & F_HIDDEN ? 0 : 1;
    this.life[i] = this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.flags[i] = flags;
    this.trailLife[i] = extra && extra.trailLife ? extra.trailLife : 0;
    this.trailTimer[i] = Math.random() * 0.03;
    this.splitKind[i] = extra && extra.splitKind ? extra.splitKind : 0;
    this.splitAt[i] = extra && extra.splitAt ? extra.splitAt : 0;
    this.colorDirty = true;
    return i;
  }

  // Бөмбөрцгийн гадаргуу дээр жигд тархсан чиглэл (жинхэнэ салют шиг)
  _evenDirs(n) {
    const dirs = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const offset = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * golden + offset;
      const j = 0.06;
      dirs.push([
        Math.cos(a) * r + (Math.random() - 0.5) * j,
        y + (Math.random() - 0.5) * j,
        Math.sin(a) * r + (Math.random() - 0.5) * j,
      ]);
    }
    return dirs;
  }

  // Бөмбөрцөг хэлбэрээр од тараана
  _sphere(p, n, speed, color, o = {}) {
    const dirs = this._evenDirs(n);
    const [l0, l1] = o.life || [1.6, 2.2];
    for (const d of dirs) {
      const sp = speed * (0.93 + Math.random() * 0.07);
      this._spawn(
        p.x, p.y, p.z,
        d[0] * sp, d[1] * sp + (o.lift || 0), d[2] * sp,
        color, (o.size || 0.38) * STAR_SIZE, (l0 + Math.random() * (l1 - l0)) * LIFE_SCALE,
        o.drag || 1.5, o.grav ?? 1.8, o.flags || 0,
        { color2: o.color2, trailLife: o.trailLife, splitKind: o.splitKind, splitAt: o.splitAt }
      );
    }
  }

  // ---------------- Хөөргөх ----------------

  _pan(p) {
    const ndc = this._tmp.copy(p).project(this.camera);
    if (!Number.isFinite(ndc.x)) return 0;
    return Math.max(-0.85, Math.min(0.85, ndc.x * 0.85));
  }

  _soundDelay(p) {
    return Math.min(1.1, p.distanceTo(this.camera.position) * SOUND_PER_UNIT);
  }

  // from: газрын цэг, to: дэлбэрэх цэг
  launch(from, to, opts = {}) {
    const shape = opts.shape ?? SHELL_TYPES[Math.floor(Math.random() * SHELL_TYPES.length)];
    const dy = Math.max(1, to.y - from.y);
    // Бодит хөөрөлт: оргил цэгтээ хүрэх хугацаа ойролцоогоор 1.8 аас 2.6 секунд
    const flight = opts.flight ?? Math.sqrt((2 * dy) / RISE_GRAVITY) * (0.95 + Math.random() * 0.1);
    const g = (2 * dy) / (flight * flight);
    const color = opts.color ? new THREE.Color(opts.color) : this.randomColor().clone();
    this.rockets.push({
      pos: from.clone(),
      vel: new THREE.Vector3((to.x - from.x) / flight, g * flight, (to.z - from.z) / flight),
      g,
      t: 0,
      flight,
      trailTimer: 0,
      // ихэнх пуужин бүдэг алтан ул мөртэй, заримынх нь тод сүүлтэй
      tail: opts.tail ?? (shape === 'flash' || Math.random() < 0.35),
      opts: {
        shape,
        color,
        color2: opts.color2 ? new THREE.Color(opts.color2) : this._otherColor(color).clone(),
        scale: opts.scale ?? 1,
        radius: opts.radius ?? 8,
        quiet: opts.quiet ?? false,
      },
      onBurst: opts.onBurst || null,
    });
    if (this.audio && !opts.quiet) {
      this.audio.play('launch', {
        pan: this._pan(from) * 0.7,
        delay: this._soundDelay(from),
        duration: flight,
        whistle: opts.whistle ?? Math.random() < 0.15,
        volume: shape === 'bigHeart' ? 1.4 : 0.8 + Math.random() * 0.3,
      });
    }
  }

  // ---------------- Дэлбэрэлт ----------------

  burst(p, { shape = 'peony', color, color2 = null, scale = 1, radius = 8, quiet = false }) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const right = this._right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const up = this._up.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const fwd = this._fwd.setFromMatrixColumn(cam.matrixWorld, 2).normalize();
    const c2 = color2 || this._otherColor(color);
    const s = shape === 'flash' || shape === 'heart' ? scale : scale * BURST_SCALE;

    // Дэлбэрэх агшны гялбаа
    const flashSize = shape === 'salute' ? 9 : 4.5 * s;
    this._spawn(p.x, p.y, p.z, 0, 0, 0, WHITE, flashSize, shape === 'salute' ? 0.16 : 0.12, 0, 0);

    let bang = 1;
    let extraSound = null;

    switch (shape) {
      case 'flash':
        this._sphere(p, 24, 2.5 * s, GOLD, { size: 0.28, life: [0.6, 1.0], drag: 1.4, grav: 1.2, flags: F_FLICKER });
        bang = 0.6;
        break;

      case 'chrysanthemum':
        this._sphere(p, 110, 10 * s, color, {
          size: 0.36, life: [2.0, 2.6], drag: 1.5, grav: 1.8,
          flags: F_TRAIL | F_FLICKER, trailLife: 0.45,
        });
        this._sphere(p, 30, 4.2 * s, c2, { size: 0.34, life: [1.6, 2.0], drag: 1.6 });
        break;

      case 'willow':
        this._sphere(p, 90, 7.5 * s, GOLD, {
          size: 0.3, life: [4.4, 5.4], drag: 1.1, grav: 2.4,
          flags: F_TRAIL | F_GOLD | F_FLICKER, trailLife: 1.3,
        });
        bang = 0.8;
        extraSound = { name: 'sizzle', at: 0.2, duration: 3.2, volume: 0.9 };
        break;

      case 'kamuro':
        this._sphere(p, 150, 8.5 * s, WARM, {
          size: 0.32, life: [3.0, 3.8], drag: 1.4, grav: 1.8,
          flags: F_TRAIL | F_GOLD | F_FLICKER, trailLife: 0.9,
        });
        bang = 0.9;
        extraSound = { name: 'sizzle', at: 0.2, duration: 2.4, volume: 0.8 };
        break;

      case 'palm': {
        const arms = 7 + Math.floor(Math.random() * 3);
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2 + Math.random() * 0.3;
          const el = 0.25 + Math.random() * 0.55;
          const sp = 11 * s;
          this._spawn(
            p.x, p.y, p.z,
            Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
            WARM, 0.9, (2.3 + Math.random() * 0.4) * LIFE_SCALE, 0.9, 3.2,
            F_TRAIL | F_GOLD, { trailLife: 0.9 }
          );
        }
        this._sphere(p, 20, 3 * s, color, { size: 0.4, life: [1.2, 1.5] });
        bang = 1.1;
        break;
      }

      case 'crossette':
        this._sphere(p, 22, 9 * s, color, {
          size: 0.42, life: [1.6, 1.8], drag: 1.2, grav: 1.6,
          flags: F_TRAIL | F_GOLD | F_SPLIT, trailLife: 0.3,
          splitKind: SPLIT_CROSSETTE, splitAt: 0.6,
        });
        bang = 0.85;
        extraSound = { name: 'crackle', at: 0.55, duration: 0.25, count: 22, volume: 0.9 };
        break;

      case 'multibreak': {
        this._sphere(p, 70, 7 * s, color, { size: 0.36, life: [1.4, 1.8] });
        const subs = 4 + Math.floor(Math.random() * 2);
        const dirs = this._evenDirs(subs);
        for (const d of dirs) {
          this._spawn(
            p.x, p.y, p.z, d[0] * 7 * s, d[1] * 7 * s + 1.5, d[2] * 7 * s,
            color, 0.2, 0.85 + Math.random() * 0.2, 1.2, 1.5,
            F_HIDDEN | F_SPLIT, { color2: this._otherColor(color), splitKind: SPLIT_SUBSHELL, splitAt: 0.0001 }
          );
        }
        bang = 0.9;
        break;
      }

      case 'crackle':
        this._sphere(p, 80, 8 * s, GOLD, {
          size: 0.32, life: [1.4, 1.9], drag: 1.5, grav: 1.6,
          flags: F_TRAIL | F_GOLD | F_CRACKLE, trailLife: 0.35,
        });
        bang = 0.9;
        extraSound = { name: 'crackle', at: 1.0, duration: 0.6, count: 60, volume: 1 };
        break;

      case 'strobe':
        this._sphere(p, 90, 7.5 * s, SILVER, { size: 0.34, life: [2.8, 3.4], drag: 1.4, grav: 1.4, flags: F_STROBE });
        bang = 0.8;
        break;

      case 'ring': {
        const n = 90;
        const tilt = (Math.random() - 0.5) * 1.2;
        const ax = this._a.copy(up).multiplyScalar(Math.cos(tilt)).addScaledVector(fwd, Math.sin(tilt));
        const sp = 9 * s;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const c = Math.cos(a) * sp;
          const si = Math.sin(a) * sp;
          this._spawn(
            p.x, p.y, p.z,
            right.x * c + ax.x * si, right.y * c + ax.y * si, right.z * c + ax.z * si,
            color, 0.4, 1.9 + Math.random() * 0.4, 1.6, 1.4, F_FLICKER
          );
        }
        this._sphere(p, 30, 3.5 * s, c2, { size: 0.34, life: [1.4, 1.7] });
        break;
      }

      case 'colorchange':
        this._sphere(p, 130, 9.5 * s, color, {
          size: 0.38, life: [2.2, 2.8], drag: 1.5, grav: 1.6, flags: F_CHANGE | F_FLICKER, color2: c2,
        });
        break;

      case 'salute':
        this._sphere(p, 40, 6, WHITE, { size: 0.3, life: [0.3, 0.6], drag: 2.5, grav: 1 });
        bang = 1.6;
        break;

      case 'heart': {
        const n = 130;
        const sp = 7 * s;
        for (let i = 0; i < n; i++) {
          const [hx, hy] = heartXY((i / n) * Math.PI * 2);
          const j = 0.97 + Math.random() * 0.06;
          this._spawn(
            p.x, p.y, p.z,
            (right.x * hx + up.x * hy) * sp * j, (right.y * hx + up.y * hy) * sp * j, (right.z * hx + up.z * hy) * sp * j,
            color, 0.42, 2.4 + Math.random() * 0.3, 1.5, 0.6, F_FLICKER
          );
        }
        break;
      }

      case 'bigHeart': {
        // Зүрх шиг дэлбэрэлт: од бүр зүрхний чиглэлд нисэх ч хурд, чиглэл,
        // гүн нь санамсаргүй ялгаатай тул бусад салют шиг чөлөөтэй тархана.
        // Төгс зураас биш, холоос харахад зүрх шиг санагдана.
        const drag = 1.5;
        const sp = radius * drag;
        const n = 190;
        const pink = new THREE.Color('#ff4d86');
        const soft = new THREE.Color('#ff9ec7');
        for (let i = 0; i < n; i++) {
          const t = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
          const [hx, hy] = heartXY(t);
          const k = 0.78 + Math.random() * 0.32;
          const jx = (Math.random() - 0.5) * 0.14;
          const jy = (Math.random() - 0.5) * 0.14;
          const jz = (Math.random() - 0.5) * 0.35;
          const x = (hx + jx) * k;
          const y = (hy + jy) * k;
          this._spawn(
            p.x, p.y, p.z,
            (right.x * x + up.x * y + fwd.x * jz) * sp,
            (right.y * x + up.y * y + fwd.y * jz) * sp,
            (right.z * x + up.z * y + fwd.z * jz) * sp,
            Math.random() < 0.8 ? pink : soft, 0.5, (1.9 + Math.random() * 0.7), drag, 1.4, F_FLICKER
          );
        }
        // голд нь бусад салют шиг жижиг цөм
        this._sphere(p, 30, 3.2, WARM, { size: 0.32, life: [1.0, 1.4], drag: 1.6, flags: F_FLICKER });
        bang = 1.1;
        break;
      }

      default:
        // peony: жигд бөмбөрцөг + дотроо өөр өнгийн цөм
        this._sphere(p, 130, 10 * s, color, { size: 0.4, life: [1.6, 2.2], drag: 1.5, grav: 1.8, flags: F_FLICKER });
        this._sphere(p, 40, 4.5 * s, c2, { size: 0.36, life: [1.3, 1.7], drag: 1.6 });
    }

    if (this.audio && !quiet) {
      const pan = this._pan(p);
      const delay = this._soundDelay(p);
      if (shape === 'salute') this.audio.play('salute', { pan, delay });
      else this.audio.play('firework', { pan, delay, size: bang * s, rate: 0.9 + Math.random() * 0.2 });
      if (extraSound) {
        this.audio.play(extraSound.name, {
          pan,
          delay: delay + extraSound.at,
          duration: extraSound.duration,
          count: extraSound.count,
          volume: extraSound.volume,
        });
      }
    }
  }

  // Од хагас замдаа хуваагдах / жижиг бөмбөг дэлбэрэх
  _split(i) {
    const i3 = i * 3;
    const p = this._b.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
    const color = new THREE.Color(this.col[i3], this.col[i3 + 1], this.col[i3 + 2]);
    if (this.splitKind[i] === SPLIT_CROSSETTE) {
      const v = this._a.set(this.vel[i3], this.vel[i3 + 1], this.vel[i3 + 2]).normalize();
      const u1 = new THREE.Vector3(0, 1, 0).cross(v);
      if (u1.lengthSq() < 1e-4) u1.set(1, 0, 0);
      u1.normalize();
      const u2 = new THREE.Vector3().crossVectors(v, u1).normalize();
      const sp = 5;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        this._spawn(
          p.x, p.y, p.z,
          (u1.x * a + u2.x * b) * sp + v.x * 1.5,
          (u1.y * a + u2.y * b) * sp + v.y * 1.5,
          (u1.z * a + u2.z * b) * sp + v.z * 1.5,
          color, 0.34, 1.0 + Math.random() * 0.3, 1.5, 1.6,
          F_TRAIL | F_GOLD | F_FLICKER, { trailLife: 0.3 }
        );
      }
    } else if (this.splitKind[i] === SPLIT_SUBSHELL) {
      const c2 = new THREE.Color(this.col2[i3], this.col2[i3 + 1], this.col2[i3 + 2]);
      this._spawn(p.x, p.y, p.z, 0, 0, 0, WHITE, 2.4, 0.1, 0, 0);
      this._sphere(p, 45, 6, c2, { size: 0.34, life: [1.3, 1.7], drag: 1.6, grav: 1.6, flags: F_FLICKER });
      if (this.audio) {
        this.audio.play('firework', { pan: this._pan(p), delay: this._soundDelay(p), size: 0.5, volume: 0.6, rate: 1.2 });
      }
    }
  }

  // ---------------- Автомат шоу ----------------
  // getSpot(u, heightScale) => { from, to }. u нь -1 (зүүн) ээс 1 (баруун)

  startShow(getSpot) {
    this.show = { timer: 0.3, getSpot, count: 0 };
    this.showPaused = false;
  }

  pauseShow() {
    this.showPaused = true;
    this.queue.length = 0;
  }

  resumeShow() {
    this.showPaused = false;
    if (this.show) this.show.timer = 0.8;
  }

  _queue(delay, spot, opts) {
    this.queue.push({ t: delay, spot, opts });
  }

  // Бодит шоу шиг төрөл бүрийн дараалал сонгоно
  // Бодит шоу шиг төрөл бүрийн дараалал. Аль нь гарахыг санамсаргүй сонгоно,
  // нэг дарааллыг дараалан хоёр удаа давтахгүй, тоо, байрлал, өнгө нь бүгд санамсаргүй.
  _nextPattern() {
    const s = this.show;
    s.count++;
    const r = Math.random;
    const type = () => SHELL_TYPES[Math.floor(r() * SHELL_TYPES.length)];
    const u = () => r() * 2 - 1;
    const patterns = [
      ['single', 3], ['scatter', 3], ['pair', 2], ['fan', 1.2], ['willowCurtain', 1],
      ['chain', 1.4], ['salute', 0.8], ['ringTrio', 1], ['colorWave', 1],
    ];
    let pick;
    for (let tries = 0; tries < 5; tries++) {
      const total = patterns.reduce((a, [, w]) => a + w, 0);
      let x = r() * total;
      pick = patterns.find(([, w]) => (x -= w) < 0)[0];
      if (pick !== s.last) break;
    }
    s.last = pick;

    switch (pick) {
      case 'single':
        this._queue(0, s.getSpot(u()), { shape: type() });
        return 0.6 + r() * 0.8;
      case 'scatter': {
        // 3 аас 5 салют санамсаргүй цагт, санамсаргүй газар
        const n = 3 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) this._queue(r() * 0.9, s.getSpot(u(), 0.85 + r() * 0.3), { shape: type() });
        return 1.0 + r() * 0.8;
      }
      case 'pair': {
        const t = type();
        const k = 0.3 + r() * 0.6;
        const color = this.randomColor().getStyle();
        this._queue(0, s.getSpot(-k), { shape: t, color });
        this._queue(0.04 + r() * 0.1, s.getSpot(k), { shape: t, color });
        return 0.9 + r() * 0.8;
      }
      case 'fan': {
        // сэнс шиг ар араасаа, чиглэл, тоо, хурд нь санамсаргүй
        const n = 6 + Math.floor(r() * 6);
        const dir = r() < 0.5 ? 1 : -1;
        const gap = 0.09 + r() * 0.08;
        const t = r() < 0.5 ? 'peony' : 'chrysanthemum';
        for (let i = 0; i < n; i++) {
          const k = dir * (-0.9 + (1.8 * i) / (n - 1));
          this._queue(i * gap, s.getSpot(k, 0.75 + r() * 0.3), { shape: t, scale: 0.6 + r() * 0.2, tail: true });
        }
        return n * gap + 0.8 + r() * 0.6;
      }
      case 'willowCurtain': {
        const n = 3 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) {
          const k = -0.8 + (1.6 * i) / (n - 1) + (r() - 0.5) * 0.2;
          this._queue(r() * 0.4, s.getSpot(k, 1 + r() * 0.1), { shape: r() < 0.7 ? 'willow' : 'kamuro' });
        }
        return 1.8 + r() * 0.8;
      }
      case 'chain': {
        // дэлбэрээд дахин дэлбэрдэг төрлүүд ар араасаа
        const kinds = ['multibreak', 'crossette', 'crackle', 'colorchange'].sort(() => r() - 0.5);
        const n = 2 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) this._queue(i * (0.25 + r() * 0.2), s.getSpot(u()), { shape: kinds[i] });
        return 1.2 + r() * 0.6;
      }
      case 'salute':
        this._queue(0, s.getSpot(u() * 0.6, 0.9), { shape: 'salute' });
        if (r() < 0.6) this._queue(0.12, s.getSpot(u()), { shape: type() });
        return 0.7 + r() * 0.5;
      case 'ringTrio': {
        const color = this.randomColor().getStyle();
        for (const k of [-0.6, 0, 0.6]) this._queue(r() * 0.2, s.getSpot(k + (r() - 0.5) * 0.2), { shape: 'ring', color });
        return 1.1 + r() * 0.5;
      }
      default: {
        // colorWave: нэг өнгийн салютууд зүүнээс баруун тийш (эсвэл эсрэгээр)
        const color = this.randomColor().getStyle();
        const n = 4 + Math.floor(r() * 3);
        const dir = r() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) {
          const k = dir * (-0.85 + (1.7 * i) / (n - 1));
          this._queue(i * 0.18, s.getSpot(k, 0.9 + r() * 0.25), { shape: 'peony', color, scale: 0.8 });
        }
        return n * 0.18 + 0.8;
      }
    }
  }



  // ---------------- Update ----------------

  update(dt) {
    this.time += dt;

    // Шоу
    if (this.show && !this.showPaused) {
      this.show.timer -= dt;
      if (this.show.timer <= 0) this.show.timer = this._nextPattern();
    }
    for (let q = this.queue.length - 1; q >= 0; q--) {
      const item = this.queue[q];
      item.t -= dt;
      if (item.t <= 0) {
        this.queue.splice(q, 1);
        this.launch(item.spot.from, item.spot.to, item.opts);
      }
    }

    // Пуужин
    for (let r = this.rockets.length - 1; r >= 0; r--) {
      const rk = this.rockets[r];
      rk.t += dt;
      rk.vel.y -= rk.g * dt;
      rk.pos.addScaledVector(rk.vel, dt);
      rk.trailTimer -= dt;
      if (rk.trailTimer <= 0) {
        rk.trailTimer = rk.tail ? 0.016 : 0.04;
        const p = rk.pos;
        if (rk.tail) {
          this._spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.5, -0.6 - Math.random(), (Math.random() - 0.5) * 0.5,
            GOLD, 0.3, 0.5 + Math.random() * 0.3, 1.6, 1.4, F_FLICKER);
        } else {
          this._spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.3, -0.3, (Math.random() - 0.5) * 0.3,
            WARM, 0.16, 0.22 + Math.random() * 0.15, 2, 1);
        }
      }
      if (rk.tail) this._spawn(rk.pos.x, rk.pos.y, rk.pos.z, 0, 0, 0, WARM, 0.42, 0.04, 0, 0);
      if (rk.t >= rk.flight) {
        this.rockets.splice(r, 1);
        this.burst(rk.pos, rk.opts);
        if (rk.onBurst) {
          try {
            rk.onBurst(rk.pos);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }

    // Од
    const { pos, vel, col, col2, life, maxLife, alpha, size, baseSize, drag, grav, flags, trailLife, trailTimer } = this;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const fl = flags[i];
      const i3 = i * 3;

      if (fl & F_SPLIT && life[i] <= this.splitAt[i]) {
        this._split(i);
        life[i] = 0;
        alpha[i] = 0;
        continue;
      }
      if (life[i] <= 0) {
        alpha[i] = 0;
        if (fl & F_CRACKLE) {
          for (let k = 0; k < 3; k++) {
            this._spawn(
              pos[i3] + (Math.random() - 0.5) * 0.5, pos[i3 + 1] + (Math.random() - 0.5) * 0.5, pos[i3 + 2] + (Math.random() - 0.5) * 0.5,
              0, 0, 0, WHITE, 0.55, 0.05 + Math.random() * 0.06, 0, 0
            );
          }
        }
        continue;
      }

      const kd = Math.exp(-drag[i] * dt);
      vel[i3] *= kd;
      vel[i3 + 1] = vel[i3 + 1] * kd - grav[i] * dt;
      vel[i3 + 2] *= kd;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      const f = life[i] / maxLife[i];
      if (fl & F_CHANGE && f < 0.5) {
        col[i3] = col2[i3];
        col[i3 + 1] = col2[i3 + 1];
        col[i3 + 2] = col2[i3 + 2];
        flags[i] = fl & ~F_CHANGE;
        this.colorDirty = true;
      }

      let a = Math.min(1, f * 2.4);
      if (fl & F_FLICKER && f < 0.45 && Math.random() < 0.4) a *= 0.25;
      if (fl & F_STROBE && ((this.time * 13 + i * 0.37) | 0) % 2) a *= 0.06;
      if (fl & F_HIDDEN) a = 0;
      alpha[i] = a;
      size[i] = baseSize[i] * (0.5 + 0.5 * f);

      // Ул мөрийн оч
      if (trailLife[i] > 0 && f > 0.15) {
        trailTimer[i] -= dt;
        if (trailTimer[i] <= 0) {
          trailTimer[i] = 0.035;
          const gold = fl & F_GOLD;
          const c = gold ? GOLD : this._tmpColor(i3);
          this._spawn(
            pos[i3], pos[i3 + 1], pos[i3 + 2],
            vel[i3] * 0.08 + (Math.random() - 0.5) * 0.3, vel[i3 + 1] * 0.08 - 0.2, vel[i3 + 2] * 0.08 + (Math.random() - 0.5) * 0.3,
            c, baseSize[i] * 0.55, trailLife[i] * (0.6 + Math.random() * 0.4), 2.2, 0.8, F_FLICKER
          );
        }
      }
    }

    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    if (this.colorDirty) {
      this.colAttr.needsUpdate = true;
      this.colorDirty = false;
    }
  }

  _tmpColor(i3) {
    if (!this._tc) this._tc = new THREE.Color();
    return this._tc.setRGB(this.col[i3] * 0.85, this.col[i3 + 1] * 0.85, this.col[i3 + 2] * 0.85);
  }
}

// Зүрхний хүрээг олон өнцөгтөөр төлөөлүүлж, цэг дотор нь байгаа эсэхийг шалгана
const HEART_POLY = Array.from({ length: 160 }, (_, i) => heartXY((i / 160) * Math.PI * 2));
function insideHeart(x, y) {
  let inside = false;
  for (let i = 0, j = HEART_POLY.length - 1; i < HEART_POLY.length; j = i++) {
    const [xi, yi] = HEART_POLY[i];
    const [xj, yj] = HEART_POLY[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function heartXY(t) {
  return [
    Math.pow(Math.sin(t), 3),
    (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16,
  ];
}
