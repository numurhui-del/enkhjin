import * as THREE from 'three';
import { getGlowTexture } from './effects.js';

// Төрсөн өдрийн бялуу: таваг, хоёр давхар, крем, жимс, лаа, дөл.
export class Cake {
  constructor(colors) {
    const group = new THREE.Group();
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const plateMat = lam(colors.plate);
    const spongeMat = lam(colors.sponge);
    const frostMat = lam(colors.frosting);
    const berryMat = lam(colors.berries);
    const candleMat = lam(colors.candle);

    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.03, 20), plateMat);
    plate.position.y = 0.015;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.16, 20), spongeMat);
    base.position.y = 0.11;
    const baseFrost = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.04, 20), frostMat);
    baseFrost.position.y = 0.2;

    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 18), spongeMat);
    top.position.y = 0.27;
    const topFrost = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.035, 18), frostMat);
    topFrost.position.y = 0.33;

    group.add(plate, base, baseFrost, top, topFrost);

    // Кремний дусал
    const dripGeo = new THREE.SphereGeometry(0.035, 8, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = new THREE.Mesh(dripGeo, frostMat);
      d.position.set(Math.cos(a) * 0.205, 0.175, Math.sin(a) * 0.205);
      d.scale.set(1, 1.4, 1);
      group.add(d);
    }

    // Жимс
    const berryGeo = new THREE.SphereGeometry(0.03, 8, 6);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const b = new THREE.Mesh(berryGeo, berryMat);
      b.position.set(Math.cos(a) * 0.17, 0.235, Math.sin(a) * 0.17);
      group.add(b);
    }

    // Лаа ба дөл
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 8), candleMat);
    candle.position.y = 0.41;
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: colors.flame })
    );
    flame.position.y = 0.505;
    flame.scale.set(1, 1.7, 1);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: colors.flame,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.position.y = 0.505;
    glow.scale.setScalar(0.35);
    group.add(candle, flame, glow);

    // Лаа үлээхэд гарах утаа
    this.smoke = [];
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: getGlowTexture(), color: '#d8d4e6', transparent: true, opacity: 0, depthWrite: false })
      );
      s.visible = false;
      group.add(s);
      this.smoke.push({ sprite: s, delay: i * 0.18 });
    }

    group.scale.setScalar(1.05);
    this.group = group;
    this.flame = flame;
    this.glow = glow;
    this.blown = false;
    this.blowTime = 0;
  }

  // Лаагаа үлээх: дөл унтарч, нимгэн утаа дээшээ хөвнө
  blowOut() {
    this.blown = true;
    this.blowTime = 0;
    for (const p of this.smoke) {
      p.sprite.visible = true;
      p.sprite.position.set(0, 0.5, 0);
    }
  }

  update(t, dt = 0.016) {
    if (!this.blown) {
      const f = 1 + Math.sin(t * 17) * 0.08 + Math.sin(t * 29) * 0.05;
      this.flame.scale.set(f, 1.7 * f, f);
      this.glow.scale.setScalar(0.32 + (f - 1) * 0.6);
      return;
    }
    this.blowTime += dt;
    // дөл хэдхэн агшинд жижгэрч унтарна
    const k = Math.max(0, 1 - this.blowTime / 0.25);
    this.flame.scale.set(k, 1.7 * k, k);
    this.glow.material.opacity = k;
    this.flame.visible = k > 0;
    for (const p of this.smoke) {
      const st = this.blowTime - p.delay;
      if (st < 0) continue;
      const life = 2.2;
      const s = p.sprite;
      if (st > life) {
        s.visible = false;
        continue;
      }
      const f = st / life;
      s.position.set(Math.sin(st * 3 + p.delay * 10) * 0.06 * f, 0.5 + st * 0.35, 0);
      s.scale.setScalar(0.06 + f * 0.25);
      s.material.opacity = (1 - f) * 0.45;
    }
  }
}
