import * as THREE from 'three';
import { VERT, FRAG } from './fireworks.js';

// Тэнгэрт салютын очоор бичиг бичнэ.
// Пуужингууд хөөрч дэлбэрээд оч нь үсгийн хэлбэрт нисч очно,
// хэсэг гялалзаж байгаад зүүнээс баруун тийш бороо шиг унаж сарнина.

const FLY = 1.0;    // оч үсэг рүү нисэх хугацаа
const HOLD = 1.8;   // бичиг харагдах хугацаа
const WAVE = 0.5;   // зүүнээс баруун тийш сарних долгионы урт
const FADE = 1.2;   // унаж алга болох хугацаа
const GRAVITY = 1.6;
const MAX_POINTS = 2600;
const FONT_FAMILY = 'Comfortaa, "Trebuchet MS", sans-serif';

// Canvas дээр бичгийг зураад, үсэг дээр байгаа цэгүүдийг түүнэ
function sampleText(lines) {
  const base = 120;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const fonts = lines.map((l) => `700 ${Math.round(base * l.scale)}px ${FONT_FAMILY}`);
  const heights = lines.map((l) => base * l.scale * 1.3);
  let width = 0;
  lines.forEach((l, i) => {
    g.font = fonts[i];
    width = Math.max(width, g.measureText(l.text).width);
  });
  const pad = 24;
  canvas.width = Math.ceil(width + pad * 2);
  canvas.height = Math.ceil(heights.reduce((a, b) => a + b, 0) + pad * 2);

  const bounds = [];
  let y = pad;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = fonts[i];
    g.fillText(l.text, canvas.width / 2, y + heights[i] / 2);
    y += heights[i];
    bounds.push(y);
  });

  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let filled = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) filled++;
  const step = Math.max(2, Math.sqrt(filled / MAX_POINTS));

  const pts = [];
  let row = 0;
  for (let py = 0; py < canvas.height; py += step, row++) {
    const lineIndex = bounds.findIndex((b) => py < b);
    for (let px = row % 2 ? step / 2 : 0; px < canvas.width; px += step) {
      const a = data[(Math.floor(py) * canvas.width + Math.floor(px)) * 4 + 3];
      if (a > 128) {
        pts.push({ x: px - canvas.width / 2, y: canvas.height / 2 - py, line: Math.max(0, lineIndex) });
      }
    }
  }
  return { pts, width: canvas.width, height: canvas.height, step };
}

export class FireworkText {
  constructor(scene, camera, fireworks, audio) {
    this.scene = scene;
    this.camera = camera;
    this.fireworks = fireworks;
    this.audio = audio;
    this.time = 0;
    this.active = false;
    this.points = null;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  // lines: [{ text, scale, colors: [зүүн өнгө, баруун өнгө] }]
  async play(lines) {
    this._clear();
    try {
      await document.fonts.load(`700 100px ${FONT_FAMILY}`, lines.map((l) => l.text).join(' '));
    } catch (err) {
      // font ачаалагдаагүй бол системийн font ашиглана
    }

    const cam = this.camera;
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).normalize().negate();

    // Дэлгэцэнд багтахаар хэмжээг тооцно
    const dist = 32;
    const halfH = dist * Math.tan((cam.fov * Math.PI) / 360);
    const halfW = halfH * cam.aspect;
    const sample = sampleText(lines);
    const scale = Math.min((halfW * 2 * 0.9) / sample.width, (halfH * 2 * 0.5) / sample.height);
    const center = cam.position.clone().addScaledVector(fwd, dist).addScaledVector(up, halfH * 0.14);

    const n = sample.pts.length;
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.target = new Float32Array(n * 3);
    this.origin = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.start = new Float32Array(n).fill(Infinity);
    this.wave = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.group = new Uint8Array(n);
    this.baseSize = sample.step * scale * 2.4;

    const rockets = Math.max(3, Math.min(6, Math.round((sample.width * scale) / 5)));
    const textW = sample.width * scale;
    const cA = new THREE.Color();
    const cB = new THREE.Color();

    sample.pts.forEach((p, i) => {
      const t = new THREE.Vector3()
        .copy(center)
        .addScaledVector(right, p.x * scale)
        .addScaledVector(up, p.y * scale);
      this.target.set([t.x, t.y, t.z], i * 3);
      const nx = p.x / sample.width + 0.5;
      this.wave[i] = nx * WAVE + Math.random() * 0.25;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.group[i] = Math.min(rockets - 1, Math.floor(nx * rockets));
      const colors = lines[p.line].colors;
      cA.set(colors[0]);
      cB.set(colors[1]);
      cA.lerp(cB, nx);
      this.col.set([cA.r, cA.g, cA.b], i * 3);
      // сарних үеийн хурд
      this.vel.set([(Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8], i * 3);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('pAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
    this.scene.add(this.points);

    this.active = true;
    this.crackled = false;

    // Бичгийн дагуу пуужингууд хөөрнө
    for (let r = 0; r < rockets; r++) {
      const burst = center
        .clone()
        .addScaledVector(right, ((r + 0.5) / rockets - 0.5) * textW * 0.85)
        .addScaledVector(up, (Math.random() - 0.5) * 1.5);
      const from = burst.clone().addScaledVector(right, (Math.random() - 0.5) * 2);
      from.y = 0;
      this.fireworks.launch(from, burst, {
        shape: 'flash',
        flight: 0.95 + r * 0.06,
        onBurst: (p) => this._release(r, p),
      });
    }

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  _release(groupIndex, p) {
    if (!this.active) return;
    for (let i = 0; i < this.n; i++) {
      if (this.group[i] !== groupIndex) continue;
      this.origin.set([p.x, p.y, p.z], i * 3);
      this.start[i] = this.time + Math.random() * 0.12;
    }
  }

  _clear() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points = null;
    }
    this.active = false;
  }

  update(dt) {
    this.time += dt;
    if (!this.active) return;
    const { pos, target, origin, vel, alpha, size, start, wave, phase } = this;
    const time = this.time;
    let alive = 0;
    let fading = false;

    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const t = time - start[i];
      if (!(t >= 0)) {
        alpha[i] = 0;
        alive++;
        continue;
      }
      if (t < FLY) {
        const k = t / FLY;
        const e = 1 - Math.pow(1 - k, 3);
        pos[i3] = origin[i3] + (target[i3] - origin[i3]) * e;
        pos[i3 + 1] = origin[i3 + 1] + (target[i3 + 1] - origin[i3 + 1]) * e;
        pos[i3 + 2] = origin[i3 + 2] + (target[i3 + 2] - origin[i3 + 2]) * e;
        alpha[i] = 1;
        size[i] = this.baseSize * (1.6 - 0.6 * e);
        alive++;
        continue;
      }
      const holdEnd = FLY + HOLD + wave[i];
      if (t < holdEnd) {
        pos[i3] = target[i3];
        pos[i3 + 1] = target[i3 + 1];
        pos[i3 + 2] = target[i3 + 2];
        const sparkle = Math.random() < 0.003 ? 1.8 : 1;
        alpha[i] = Math.min(1, (0.85 + 0.15 * Math.sin(time * 5 + phase[i])) * sparkle);
        size[i] = this.baseSize * sparkle;
        alive++;
        continue;
      }
      const td = t - holdEnd;
      if (td < FADE) {
        fading = true;
        pos[i3] = target[i3] + vel[i3] * td;
        pos[i3 + 1] = target[i3 + 1] + vel[i3 + 1] * td - 0.5 * GRAVITY * td * td;
        pos[i3 + 2] = target[i3 + 2] + vel[i3 + 2] * td;
        const f = 1 - td / FADE;
        alpha[i] = f * f * (Math.random() < 0.3 ? 0.4 : 1);
        size[i] = this.baseSize * (0.6 + 0.4 * f);
        alive++;
      } else {
        alpha[i] = 0;
      }
    }

    if (fading && !this.crackled) {
      this.crackled = true;
      if (this.audio) this.audio.play('firework', { volume: 0.35, rate: 1.5 });
    }

    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.pAlpha.needsUpdate = true;
    geo.attributes.pSize.needsUpdate = true;

    if (alive === 0) {
      this._clear();
      const resolve = this.resolve;
      this.resolve = null;
      if (resolve) resolve();
    }
  }
}
