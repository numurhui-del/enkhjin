// Энхжингийн удирдлага: controls-оос чиглэл аваад character-ийг хөдөлгөнө,
// мод, сандал зэрэгтэй мөргөлдөхөөс сэргийлнэ.

const DEAD_ZONE = 0.12;

export class Player {
  constructor(character, controls, colliders, config) {
    this.character = character;
    this.controls = controls;
    this.colliders = colliders;
    this.speed = config.player.speed;
    this.radius = config.player.radius;
    this.walkRadius = config.world.walkRadius;
    this.enabled = true;
  }

  update(dt) {
    const ch = this.character;
    if (!this.enabled) return;

    const input = this.controls.getVector();
    const mag = Math.min(1, Math.hypot(input.x, input.y));
    if (mag < DEAD_ZONE) {
      ch.setState('idle');
      ch.moveAmount = 0;
      return;
    }

    // Camera үргэлж Энхжингийн ард (+Z тал) байдаг тул
    // дэлгэцийн "дээш" нь дэлхийн -Z чиглэл болно.
    const dirX = input.x / mag;
    const dirZ = -input.y / mag;
    const amount = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
    const step = this.speed * amount * dt;

    const pos = ch.root.position;
    pos.x += dirX * step;
    pos.z += dirZ * step;
    this._resolveCollisions(pos);

    ch.targetFacing = Math.atan2(dirX, dirZ);
    ch.moveAmount = amount;
    ch.setState('walk');
  }

  _resolveCollisions(pos) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + this.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > this.walkRadius) {
      pos.x *= this.walkRadius / r;
      pos.z *= this.walkRadius / r;
    }
  }
}
