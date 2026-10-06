import * as THREE from 'three';
import { easeInOutCubic } from './utils.js';

// Camera хоёр горимтой:
//  follow: тодорхой цэгийг (Энхжин г.м.) зөөлөн дагана
//  tween:  cinematic хэсэгт нэг байрлалаас нөгөө рүү аажмаар шилжинэ
export class CameraRig {
  constructor(camera, cfg) {
    this.camera = camera;
    this.mode = 'follow';
    this.getTarget = () => new THREE.Vector3();
    this.offset = new THREE.Vector3(...cfg.followOffset);
    this.lookOffset = new THREE.Vector3(...cfg.lookOffset);
    this.lerp = cfg.followLerp;
    this.scaleForPortrait = true;
    this.lookAt = new THREE.Vector3();
    this.tween = null;
    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeAmount = 0;
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  follow(getTarget, { offset, lookOffset, lerp, scaleForPortrait = true } = {}) {
    this.mode = 'follow';
    this.getTarget = getTarget;
    if (offset) this.offset.copy(offset);
    if (lookOffset) this.lookOffset.copy(lookOffset);
    if (lerp) this.lerp = lerp;
    this.scaleForPortrait = scaleForPortrait;
  }

  // Босоо утсан дээр арай холоос харуулна
  _distanceScale() {
    if (!this.scaleForPortrait) return 1;
    const a = this.camera.aspect;
    return a < 1 ? 1 + (1 - a) * 0.6 : 1;
  }

  snap() {
    const target = this.getTarget();
    this.camera.position.copy(target).addScaledVector(this.offset, this._distanceScale());
    this.lookAt.copy(target).add(this.lookOffset);
    this.camera.lookAt(this.lookAt);
  }

  animateTo(position, lookAt, duration, ease = easeInOutCubic) {
    return new Promise((resolve) => {
      this.mode = 'tween';
      this.tween = {
        fromPos: this.camera.position.clone(),
        fromLook: this.lookAt.clone(),
        toPos: position.clone(),
        toLook: lookAt.clone(),
        t: 0,
        duration,
        ease,
        resolve,
      };
    });
  }

  // Хүчтэй тэсрэлтийн үед camera бага зэрэг чичирнэ
  shake(amount, duration) {
    this.shakeAmount = amount;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  update(dt) {
    if (this.mode === 'follow') {
      const target = this.getTarget();
      this._desired.copy(target).addScaledVector(this.offset, this._distanceScale());
      this._look.copy(target).add(this.lookOffset);
      const k = 1 - Math.exp(-this.lerp * dt);
      this.camera.position.lerp(this._desired, k);
      this.lookAt.lerp(this._look, k);
    } else if (this.mode === 'tween' && this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = tw.ease(Math.min(1, tw.t / tw.duration));
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
      this.lookAt.lerpVectors(tw.fromLook, tw.toLook, k);
      if (tw.t >= tw.duration) {
        this.mode = 'hold';
        this.tween = null;
        tw.resolve();
      }
    }
    this.camera.lookAt(this.lookAt);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, this.shakeTime / this.shakeDuration);
      const a = this.shakeAmount * k * k;
      this.camera.rotateX((Math.random() - 0.5) * a);
      this.camera.rotateY((Math.random() - 0.5) * a);
      this.camera.rotateZ((Math.random() - 0.5) * a * 0.5);
    }
  }
}
