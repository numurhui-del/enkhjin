import * as THREE from 'three';
import { damp, dampAngle } from './utils.js';

// Chibi character: том дугуй толгой, жижиг бөөрөнхий бие, богино гар хөл.
// Бүх хэсэг нь энгийн Three.js geometry, тул model файл шаардлагагүй.
// Өнгө, үс, хувцсыг config.js доторх look объектоор өөрчилнө.

const DEFAULT_LOOK = {
  skin: '#ffdcc8',
  hair: '#3a2018',
  hairStyle: 'short',
  outfit: 'shirt',
  top: '#ff8fb8',
  bottom: '#34446a',
  shoes: '#ffffff',
  cheeks: '#ff8fa3',
  eyes: '#24161a',
  accessory: 'none',
  accessoryColor: '#ff4f7b',
  scale: 1,
};

const HIP_Y = 0.36;        // хөлний эргэлтийн цэг
const SHOULDER_Y = 0.8;    // мөрний эргэлтийн цэг
const NECK_Y = 0.92;       // толгойн эргэлтийн цэг
const HEAD_RADIUS = 0.5;
export const BODY_RADIUS = 0.42;

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export class Character {
  constructor(look = {}) {
    this.look = { ...DEFAULT_LOOK, ...look };

    this.root = new THREE.Group();   // дэлхий дээрх байрлал, эргэлт
    this.body = new THREE.Group();   // үсрэх, суух хөдөлгөөн
    this.root.add(this.body);
    this.root.scale.setScalar(this.look.scale);
    this.radius = BODY_RADIUS * this.look.scale;

    this.state = 'idle';             // idle | walk | cheer | happy | sit
    this.time = Math.random() * 10;
    this.walkPhase = 0;
    this.moveAmount = 0;
    this.targetFacing = 0;
    this.holding = false;
    this.lean = 0;
    this.sitBlend = 0;
    this.sitTarget = 0;
    this.sitOffset = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.blinkTime = 0;
    this.talking = false;
    this.eyesClosed = false;

    this.path = null;
    this.pathResolve = null;
    this.slide = null;

    this._build();
  }

  _build() {
    const L = this.look;
    const skin = lambert(L.skin);
    const top = lambert(L.top);
    const bottom = lambert(L.bottom);
    const shoes = lambert(L.shoes);
    const hair = lambert(L.hair);
    const accessory = lambert(L.accessoryColor);
    const eyeMat = new THREE.MeshBasicMaterial({ color: L.eyes });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cheekMat = new THREE.MeshBasicMaterial({ color: L.cheeks, transparent: true, opacity: 0.8 });
    const mouthMat = new THREE.MeshBasicMaterial({ color: '#7a2b3a' });

    // ----- Хөл -----
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.14, 4, 10);
    const shoeGeo = new THREE.SphereGeometry(0.115, 12, 10);
    const legMat = L.outfit === 'dress' ? skin : bottom;
    const makeLeg = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, HIP_Y, 0);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.y = -0.17;
      const shoe = new THREE.Mesh(shoeGeo, shoes);
      shoe.position.set(0, -0.29, 0.035);
      shoe.scale.set(0.95, 0.65, 1.3);
      pivot.add(leg, shoe);
      this.body.add(pivot);
      return pivot;
    };
    this.legL = makeLeg(0.13);
    this.legR = makeLeg(-0.13);

    // ----- Бие -----
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), top);
    torso.position.y = 0.66;
    torso.scale.set(1, 1.02, 0.88);
    this.body.add(torso);

    if (L.outfit === 'dress') {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.46, 0.34, 18), bottom);
      skirt.position.y = 0.44;
      this.body.add(skirt);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.025, 6, 24), white);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.28;
      this.body.add(trim);
    } else {
      const pants = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.3, 0.2, 16), bottom);
      pants.position.y = 0.42;
      this.body.add(pants);
      // цамцны жижиг тэмдэг
      const badge = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), white);
      badge.position.set(0.12, 0.74, 0.3);
      badge.scale.set(1, 1, 0.4);
      this.body.add(badge);
    }

    // ----- Гар -----
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.16, 4, 10);
    const handGeo = new THREE.SphereGeometry(0.095, 12, 10);
    const makeArm = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, SHOULDER_Y, 0);
      const arm = new THREE.Mesh(armGeo, top);
      arm.position.y = -0.16;
      const hand = new THREE.Mesh(handGeo, skin);
      hand.position.y = -0.33;
      pivot.add(arm, hand);
      this.body.add(pivot);
      return pivot;
    };
    this.armL = makeArm(0.34);
    this.armR = makeArm(-0.34);
    this.armL.rotation.z = 0.22;
    this.armR.rotation.z = -0.22;

    // ----- Толгой -----
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = NECK_Y;
    this.body.add(this.headPivot);
    const head = new THREE.Group();
    head.position.y = 0.4;
    this.headPivot.add(head);
    this.head = head;

    head.add(new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 28, 22), skin));

    // Нүд (анивчина)
    const eyeGeo = new THREE.SphereGeometry(0.068, 12, 10);
    const shineGeo = new THREE.SphereGeometry(0.022, 8, 6);
    const lidGeo = new THREE.TorusGeometry(0.055, 0.014, 6, 14, Math.PI);
    this.eyes = [];
    this.lids = [];
    for (const x of [0.17, -0.17]) {
      const eye = new THREE.Group();
      eye.position.set(x, 0.0, 0.465);
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      ball.scale.set(0.9, 1.25, 0.5);
      const shine = new THREE.Mesh(shineGeo, white);
      shine.position.set(0.02, 0.035, 0.03);
      eye.add(ball, shine);
      head.add(eye);
      this.eyes.push(eye);

      // Анисан нүд (зөөлөн нуман зураас)
      const lid = new THREE.Mesh(lidGeo, eyeMat);
      lid.rotation.z = Math.PI;
      lid.position.set(x, 0.0, 0.478);
      lid.visible = false;
      head.add(lid);
      this.lids.push(lid);
    }

    // Хацар
    const cheekGeo = new THREE.SphereGeometry(0.075, 12, 8);
    for (const x of [0.29, -0.29]) {
      const c = new THREE.Mesh(cheekGeo, cheekMat);
      c.position.set(x, -0.12, 0.39);
      c.scale.set(1.3, 0.75, 0.35);
      head.add(c);
    }

    // Инээмсэглэл (ярихад ам хөдөлнө)
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 14, Math.PI), mouthMat);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.1, 0.488);
    head.add(mouth);
    this.mouth = mouth;

    this._buildHair(head, hair, accessory);
    if (L.accessory === 'bow') this._buildBow(head, accessory);

    // ----- Сүүдэр (хямд blob shadow) -----
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    this.root.add(shadow);
    this.shadow = shadow;
  }

  _buildHair(head, hair, accessory) {
    const style = this.look.hairStyle;

    // Үсний малгай хэсэг (духыг ил гаргахаар хойш хазайлгасан)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.535, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hair
    );
    cap.rotation.x = -0.38;
    head.add(cap);

    // Хөмсөг дээгүүрх үс
    const bangGeo = new THREE.SphereGeometry(0.16, 12, 10);
    for (const [x, y, z] of [[-0.2, 0.3, 0.4], [0, 0.34, 0.42], [0.2, 0.3, 0.4]]) {
      const b = new THREE.Mesh(bangGeo, hair);
      b.position.set(x, y, z);
      b.scale.set(1, 0.6, 0.6);
      head.add(b);
    }

    if (style === 'long') {
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), hair);
      back.position.set(0, -0.22, -0.2);
      back.scale.set(1.08, 1.3, 0.62);
      head.add(back);
    } else if (style === 'pigtails') {
      const tailGeo = new THREE.SphereGeometry(0.19, 14, 12);
      const tieGeo = new THREE.SphereGeometry(0.06, 10, 8);
      for (const s of [1, -1]) {
        const tail = new THREE.Mesh(tailGeo, hair);
        tail.position.set(0.52 * s, -0.1, -0.12);
        tail.scale.set(0.85, 1.15, 0.85);
        const tie = new THREE.Mesh(tieGeo, accessory);
        tie.position.set(0.44 * s, 0.06, -0.1);
        head.add(tail, tie);
      }
    } else if (style === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), hair);
      bun.position.set(0, 0.5, -0.18);
      head.add(bun);
    } else {
      // short: оройдоо жижиг сэртэгнэсэн үстэй
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), hair);
      tuft.position.set(0.05, 0.56, 0.02);
      tuft.rotation.z = -0.45;
      head.add(tuft);
    }
  }

  _buildBow(head, mat) {
    const bow = new THREE.Group();
    const wingGeo = new THREE.ConeGeometry(0.1, 0.18, 8);
    const left = new THREE.Mesh(wingGeo, mat);
    left.rotation.z = -Math.PI / 2;
    left.position.x = -0.09;
    const right = new THREE.Mesh(wingGeo, mat);
    right.rotation.z = Math.PI / 2;
    right.position.x = 0.09;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat);
    bow.add(left, right, knot);
    bow.position.set(0.32, 0.36, 0.2);
    bow.rotation.set(0, 0.5, -0.4);
    head.add(bow);
  }

  // ---------- Public API ----------

  get position() {
    return this.root.position;
  }

  setState(state) {
    this.state = state;
  }

  setFacing(angle) {
    this.targetFacing = angle;
    this.root.rotation.y = angle;
  }

  faceTowards(x, z) {
    const p = this.root.position;
    this.targetFacing = Math.atan2(x - p.x, z - p.z);
  }

  setLean(amount) {
    this.lean = amount;
  }

  // Ярьж байх үед толгой, ам нь бага зэрэг хөдөлнө
  setTalking(on) {
    this.talking = on;
  }

  // Хүсэл шивнэх үед нүдээ анина
  setEyesClosed(closed) {
    this.eyesClosed = closed;
  }

  // Ямар нэг объект (бялуу) хоёр гараараа урдаа барина
  holdItem(object3d) {
    object3d.position.set(0, 0.72, 0.52);
    this.body.add(object3d);
    this.holding = true;
  }

  // Цэгүүдийг дагаж алхана. Хүрээд очиход Promise resolve болно.
  walkPath(points, speed = 1.5) {
    return new Promise((resolve) => {
      this._progressTime = 0;
      this._bestDist = Infinity;
      this.path = points.map((p) => p.clone());
      this.pathSpeed = speed;
      this.pathResolve = resolve;
    });
  }

  // Сандал дээр суух: worldPos руу гулсаж очоод доошоо сууна
  sitDown(worldPos, facing, seatTop, duration = 0.8) {
    this.targetFacing = facing;
    this.state = 'sit';
    this.sitTarget = 1;
    // хонго суудлын гадаргаас дээш хөлний зузааны хэмжээгээр байна
    this.sitOffset = seatTop / this.look.scale + 0.09 - HIP_Y;
    return new Promise((resolve) => {
      this.slide = {
        from: this.root.position.clone(),
        to: worldPos.clone(),
        t: 0,
        duration,
        resolve,
      };
    });
  }

  // ---------- Update ----------

  _updatePath(dt) {
    if (!this.path) return;
    const target = this.path[0];
    const pos = this.root.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = this.pathSpeed * dt;

    // Гацахаас хамгаалах: 1 секундын дотор бараг ойртохгүй бол энэ цэгийг алгасна
    this._progressTime += dt;
    if (this._progressTime > 1) {
      if (this._bestDist - dist < 0.08) {
        this.path.shift();
        this._progressTime = 0;
        this._bestDist = Infinity;
        if (this.path.length === 0) this._finishPath();
        return;
      }
      this._bestDist = dist;
      this._progressTime = 0;
    } else if (this._bestDist === Infinity) {
      this._bestDist = dist;
    }

    if (dist <= Math.max(step, 0.04)) {
      pos.x = target.x;
      pos.z = target.z;
      this.path.shift();
      this._progressTime = 0;
      this._bestDist = Infinity;
      if (this.path.length === 0) this._finishPath();
    } else {
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      this.targetFacing = Math.atan2(dx, dz);
      this.state = 'walk';
      this.moveAmount = Math.min(1, this.pathSpeed / 3);
    }
  }

  _finishPath() {
    this.path = null;
    this.state = 'idle';
    this.moveAmount = 0;
    const resolve = this.pathResolve;
    this.pathResolve = null;
    if (resolve) resolve();
  }

  _updateSlide(dt) {
    if (!this.slide) return;
    const s = this.slide;
    s.t += dt;
    const k = Math.min(1, s.t / s.duration);
    const e = k * k * (3 - 2 * k);
    this.root.position.x = s.from.x + (s.to.x - s.from.x) * e;
    this.root.position.z = s.from.z + (s.to.z - s.from.z) * e;
    if (k >= 1) {
      this.slide = null;
      s.resolve();
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    this._updatePath(dt);
    this._updateSlide(dt);
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.targetFacing, 10, dt);

    let legL = 0, legR = 0;
    let armLx = 0, armRx = 0, armLz = 0.22, armRz = -0.22;
    let bodyY = 0, bodyRz = 0, bodyRx = 0;
    let headX = 0, headZ = 0;

    switch (this.state) {
      case 'walk': {
        this.walkPhase += dt * 14 * Math.max(0.45, this.moveAmount);
        const s = Math.sin(this.walkPhase);
        legL = s * 0.75;
        legR = -s * 0.75;
        armLx = -s * 0.7;
        armRx = s * 0.7;
        bodyY = Math.abs(Math.cos(this.walkPhase)) * 0.07;
        bodyRz = s * 0.06;
        bodyRx = 0.08;
        headZ = -s * 0.04;
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(t * 6.5));
        bodyY = hop * 0.28;
        armLz = 2.5 + Math.sin(t * 13) * 0.25;
        armRz = -armLz;
        legL = legR = -hop * 0.35;
        headX = -0.12;
        headZ = Math.sin(t * 6.5) * 0.08;
        break;
      }
      case 'happy': {
        bodyY = Math.abs(Math.sin(t * 5.5)) * 0.12;
        headZ = Math.sin(t * 5.5) * 0.1;
        break;
      }
      case 'sit': {
        legL = legR = -1.5 + Math.sin(t * 2.2) * 0.08;
        armLx = armRx = -0.55;
        armLz = 0.12;
        armRz = -0.12;
        bodyY = Math.sin(t * 1.8) * 0.008;
        break;
      }
      default: {
        // idle: зөөлөн амьсгал, толгойгоо бага зэрэг хазайлгана
        bodyY = Math.sin(t * 2.4) * 0.012;
        armLz = 0.22 + Math.sin(t * 2.4) * 0.04;
        armRz = -armLz;
        headZ = Math.sin(t * 1.3) * 0.05;
        headX = Math.sin(t * 0.9) * 0.03;
      }
    }

    if (this.holding) {
      const sway = this.state === 'walk' ? Math.sin(this.walkPhase) * 0.05 : 0;
      armLx = -1.45 + sway;
      armRx = -1.45 - sway;
      armLz = -0.32;
      armRz = 0.32;
    }

    if (this.talking) {
      headX += Math.sin(t * 11) * 0.06;
      headZ += Math.sin(t * 5.5) * 0.05;
      bodyY += Math.abs(Math.sin(t * 5.5)) * 0.02;
    }
    if (this.eyesClosed) headX += 0.12;
    headZ += this.lean;
    bodyRz += this.lean * 0.25;

    const k = 14;
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, k, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, k, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, armLx, k, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armRx, k, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, armLz, k, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, armRz, k, dt);
    this.body.rotation.z = damp(this.body.rotation.z, bodyRz, 8, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyRx, 8, dt);
    this.headPivot.rotation.x = damp(this.headPivot.rotation.x, headX, 8, dt);
    this.headPivot.rotation.z = damp(this.headPivot.rotation.z, headZ, 6, dt);

    this.sitBlend = damp(this.sitBlend, this.sitTarget, 5, dt);
    this.bob = damp(this.bob ?? 0, bodyY, 20, dt);
    this.body.position.y = this.bob + this.sitBlend * this.sitOffset;

    // Сүүдэр үсрэх үед жижгэрнэ
    const sh = 1 - Math.min(0.4, this.bob * 1.2);
    this.shadow.scale.set(sh, sh, sh);

    // Ярихад ам нь ангайж хаагдана
    const talk = this.talking ? 1 + Math.abs(Math.sin(t * 14)) * 1.2 : 1;
    this.mouth.scale.y = damp(this.mouth.scale.y, talk, 20, dt);

    // Нүд анивчих, анис
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTime = 0.13;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    if (this.blinkTime > 0) this.blinkTime -= dt;
    const closed = this.eyesClosed;
    const eyeY = this.blinkTime > 0 ? 0.12 : 1;
    for (const eye of this.eyes) {
      eye.visible = !closed;
      eye.scale.y = eyeY;
    }
    for (const lid of this.lids) lid.visible = closed;
  }
}
