import * as THREE from 'three';

// Canvas дээр зурсан жижиг texture-ууд (зураг файл шаардлагагүй)

let heartTexture = null;

// Гэрэлтэх эффект (дэнлүү, сар, лаа). Зураг (texture) ашиглахгүй, shader-ээр
// шууд тооцоолж зурна. Safari дээр зургийн гэрэлтэлт өнгөт дугуй үүсгэдэг
// асуудлыг ингэж арилгасан. Үргэлж camera руу харна (billboard).
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = clamp(1.0 - d, 0.0, 1.0);
  a = a * a * (0.6 + 0.4 * a);
  // жигд бус шат шат гэрэлтэлт (banding) үүсэхгүйн тулд бага зэрэг шуугиан нэмнэ
  a = max(0.0, a + (rand(gl_FragCoord.xy) - 0.5) / 160.0);
  gl_FragColor = vec4(uColor, a * uOpacity);
  #include <colorspace_fragment>
}`;

const glowGeometry = new THREE.PlaneGeometry(1, 1);

export function makeGlow(color, { opacity = 1, additive = true } = {}) {
  const material = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  // бусад код material.opacity гэж өөрчлөхөд shader-ийн утга шинэчлэгдэнэ
  Object.defineProperty(material, 'opacity', {
    get: () => material.uniforms.uOpacity.value,
    set: (v) => {
      material.uniforms.uOpacity.value = v;
    },
    configurable: true,
  });
  const mesh = new THREE.Mesh(glowGeometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function getHeartTexture() {
  if (heartTexture) return heartTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 70);
  const heartPath = (s) => {
    g.beginPath();
    g.moveTo(0, 30 * s);
    g.bezierCurveTo(-60 * s, -10 * s, -30 * s, -58 * s, 0, -28 * s);
    g.bezierCurveTo(30 * s, -58 * s, 60 * s, -10 * s, 0, 30 * s);
    g.closePath();
  };
  g.shadowColor = 'rgba(255,90,140,0.9)';
  g.shadowBlur = 14;
  heartPath(1);
  g.fillStyle = '#ff5c8a';
  g.fill();
  g.shadowBlur = 0;
  g.beginPath();
  g.ellipse(-18, -22, 9, 6, -0.6, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fill();
  heartTexture = new THREE.CanvasTexture(c);
  heartTexture.colorSpace = THREE.SRGBColorSpace;
  return heartTexture;
}

// Character-ийн толгой дээр хөвөх нэрийн шошго
export class NameTag {
  constructor(scene, camera, character, text, { color = '#ff5c8a', height = 2.3 } = {}) {
    this.camera = camera;
    this.character = character;
    this.ratio = 3;
    this.text = text;
    this.color = color;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false, fog: false })
    );
    this.sprite.renderOrder = 20;
    scene.add(this.sprite);
    this.fading = false;
    this._draw();
    // Comfortaa font ачаалагдмагц дахин зурна
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 56px Comfortaa', text).then(() => this._draw()).catch(() => {});
    }
  }

  _draw() {
    const font = '700 56px Comfortaa, "Trebuchet MS", sans-serif';
    const c = this.canvas;
    let g = c.getContext('2d');
    g.font = font;
    const h = 96;
    const w = Math.ceil(g.measureText(this.text).width) + 70;
    c.width = w;
    c.height = h;
    g = c.getContext('2d');
    const r = h / 2 - 6;
    g.beginPath();
    g.moveTo(6 + r, 6);
    g.lineTo(w - 6 - r, 6);
    g.arc(w - 6 - r, h / 2, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(6 + r, h - 6);
    g.arc(6 + r, h / 2, r, Math.PI / 2, (Math.PI * 3) / 2);
    g.closePath();
    g.fillStyle = 'rgba(18, 14, 48, 0.62)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = this.color;
    g.stroke();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = this.color;
    g.shadowBlur = 12;
    g.fillStyle = '#ffffff';
    g.fillText(this.text, w / 2, h / 2 + 3);
    this.texture.needsUpdate = true;
    this.ratio = w / h;
  }

  hide() {
    this.fading = true;
  }

  update(t, dt) {
    const p = this.character.root.position;
    const s = this.character.look.scale;
    this.sprite.position.set(p.x, p.y + (this.height + this.character.body.position.y) * s, p.z);
    // Холоос ч уншигдахуйц хэмжээтэй байлгана
    const d = this.sprite.position.distanceTo(this.camera.position);
    const worldH = Math.max(0.3, d * 0.03);
    this.sprite.scale.set(worldH * this.ratio, worldH, 1);
    if (this.fading) {
      const m = this.sprite.material;
      m.opacity = Math.max(0, m.opacity - dt * 1.5);
      this.sprite.visible = m.opacity > 0;
    }
  }
}

// Алхах үед хөлийн доороос гарах зөөлөн тоос
export class DustPuffs {
  constructor(scene, count = 14) {
    this.items = [];
    this.cursor = 0;
    for (let i = 0; i < count; i++) {
      const sprite = makeGlow('#e9e4ff', { opacity: 0, additive: false });
      sprite.visible = false;
      scene.add(sprite);
      this.items.push({ sprite, life: 0 });
    }
  }

  puff(position) {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    p.sprite.position.set(
      position.x + (Math.random() - 0.5) * 0.25,
      0.08,
      position.z + (Math.random() - 0.5) * 0.25
    );
    p.life = 0.6;
    p.sprite.visible = true;
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const k = p.life / 0.6;
      p.sprite.position.y += dt * 0.25;
      p.sprite.scale.setScalar(0.25 + (1 - k) * 0.35);
      p.sprite.material.opacity = k * 0.35;
    }
  }
}

// Interaction үед дээшээ хөвөх жижиг зүрхнүүд
export class HeartParticles {
  constructor(scene, count = 30) {
    this.items = [];
    const tex = getHeartTexture();
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      sprite.visible = false;
      scene.add(sprite);
      this.items.push({ sprite, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.3 });
    }
  }

  burst(position, n = 10) {
    let spawned = 0;
    for (const p of this.items) {
      if (spawned >= n) break;
      if (p.life > 0) continue;
      p.sprite.position.copy(position);
      p.sprite.position.x += (Math.random() - 0.5) * 0.6;
      p.sprite.position.z += (Math.random() - 0.5) * 0.6;
      p.vx = (Math.random() - 0.5) * 1.2;
      p.vz = (Math.random() - 0.5) * 1.2;
      p.vy = 0.9 + Math.random() * 0.9;
      p.max = p.life = 1.4 + Math.random() * 0.8;
      p.size = 0.18 + Math.random() * 0.2;
      p.sprite.visible = true;
      spawned++;
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const s = p.sprite;
      s.position.x += p.vx * dt;
      s.position.y += p.vy * dt;
      s.position.z += p.vz * dt;
      p.vx *= 0.97;
      p.vz *= 0.97;
      const k = p.life / p.max;
      const grow = Math.min(1, (1 - k) * 6);
      s.scale.setScalar(p.size * grow);
      s.material.opacity = Math.min(1, k * 2);
    }
  }
}
