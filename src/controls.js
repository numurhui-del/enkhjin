// Удирдлага
//  Утас: дэлгэцийн хаана ч хуруугаа тавиад чирэхэд virtual joystick гарч ирнэ
//  Компьютер: WASD эсвэл сумтай товчнууд (туршихад)

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export class Controls {
  constructor(joystickEl) {
    this.enabled = false;
    this.el = joystickEl;
    this.knob = joystickEl.querySelector('.joystick-knob');
    this.maxRadius = 56;
    this.keys = { up: false, down: false, left: false, right: false };
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };
    this.touch = { x: 0, y: 0 };
    this.onFirstMove = null;

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => {
      for (const k in this.keys) this.keys[k] = false;
      this._release();
    });

    // Утсан дээр хоёр товшилтоор томрох, удаан дарж цэс гаргах зэргийг хаана
    const block = (e) => e.preventDefault();
    document.addEventListener('gesturestart', block);
    document.addEventListener('dblclick', block);
    document.addEventListener('contextmenu', block);

    const surface = document.getElementById('app');
    surface.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    for (const k in this.keys) this.keys[k] = false;
    this._release();
  }

  _key(e, pressed) {
    const dir = KEY_MAP[e.code];
    if (!dir) return;
    e.preventDefault();
    if (!this.enabled && pressed) return;
    this.keys[dir] = pressed;
  }

  _down(e) {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.origin.x = e.clientX;
    this.origin.y = e.clientY;
    this.touch.x = 0;
    this.touch.y = 0;
    this.el.style.left = `${e.clientX}px`;
    this.el.style.top = `${e.clientY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.el.classList.add('active');
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.maxRadius) {
      dx = (dx / len) * this.maxRadius;
      dy = (dy / len) * this.maxRadius;
    }
    this.touch.x = dx / this.maxRadius;
    this.touch.y = -dy / this.maxRadius;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    this._release();
  }

  _release() {
    this.pointerId = null;
    this.touch.x = 0;
    this.touch.y = 0;
    this.el.classList.remove('active');
  }

  // { x: баруун(+)/зүүн(-), y: урагш(+)/хойш(-) }, урт нь 0..1
  getVector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let y = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    } else {
      x = this.touch.x;
      y = this.touch.y;
    }
    if ((x !== 0 || y !== 0) && this.onFirstMove) {
      this.onFirstMove();
      this.onFirstMove = null;
    }
    return { x, y };
  }
}
