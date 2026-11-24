// Team positioning. The networks play well one on one but, in 2v2, tend to leave one player doing everything
// (both chase, or one hangs back forever). This layer assigns each team a ball-chaser and a supporter, and
// when the supporter is out of position (ahead of the ball, on top of the chaser, or far away) it drives them
// to a covering spot behind the play, picking up boost on the way. The network keeps control whenever the
// supporter is already well placed, or in the air.

import { PAD_POSITIONS, PAD_IS_BIG, FIELD_Y } from './constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class Rotation {
  constructor(carCount) {
    this.chaser = new Array(carCount).fill(false);
    this.override = new Array(carCount).fill(false);
    this.target = this.chaser.map(() => [0, 0]);
    this.obey = this.chaser.map(() => true);
    this.obeyUntil = this.chaser.map(() => 0);
    this.controls = this.chaser.map(() => ({}));
  }

  reset() {
    this.chaser.fill(false);
    this.override.fill(false);
    this.obeyUntil.fill(0);
  }

  /** Decide roles and who needs to be sent back. strength is 0 (never) to 1 (always), by rank. */
  update(engine, strength) {
    const ball = engine.ball.pos;
    const cars = engine.cars;
    for (const team of [0, 1]) {
      const attack = team === 0 ? 1 : -1;
      const members = cars.map((car, i) => i).filter(i => cars[i].team === team && !cars[i].isDemoed);
      if (members.length < 2) {
        members.forEach(i => { this.chaser[i] = true; this.override[i] = false; });
        continue;
      }
      // Who is best placed to go for the ball: nearest, with a penalty for being ahead of it.
      const score = i => {
        const car = cars[i];
        const ahead = attack * (car.pos[1] - ball[1]) > 0 ? 1500 : 0;
        return flat(car.pos, ball) + ahead;
      };
      let best = members[0];
      for (const i of members) if (score(i) < score(best)) best = i;
      const current = members.find(i => this.chaser[i]);
      // Stay with the current chaser unless the other is clearly better placed.
      const chaser = current !== undefined && score(best) > score(current) * 0.75 ? current : best;

      for (const i of members) {
        const car = cars[i];
        this.chaser[i] = i === chaser;
        if (i === chaser) { this.override[i] = false; continue; }

        // The covering spot: well behind the ball towards our own goal, leaning to the ball's side.
        const targetY = clamp(ball[1] - attack * 1800, -4300, 4300);
        const targetX = clamp(ball[0] * 0.4, -2400, 2400);
        let target = [targetX, targetY];

        const mate = cars[chaser];
        const behindBall = attack * (ball[1] - car.pos[1]) > 800;
        const clearOfMate = flat(car.pos, mate.pos) > 900;
        const nearSpot = flat(car.pos, target) < 2200;
        const placed = behindBall && clearOfMate && nearSpot;

        // Re-roll now and then whether this player does as told; weaker ranks ignore it more often.
        if (engine.time > this.obeyUntil[i]) {
          this.obey[i] = Math.random() < strength;
          this.obeyUntil[i] = engine.time + 2 + Math.random() * 2;
        }

        // Low on boost: collect a pad in our own half that is near the car or the spot.
        if (car.boost < 35) {
          let bestPad = null;
          let bestDistance = 2500;
          for (let k = 0; k < PAD_POSITIONS.length; k++) {
            if (!engine.pads[k].active) continue;
            const p = PAD_POSITIONS[k];
            if (attack * (p[1] - ball[1]) > 0) continue; // only pads behind the ball
            const d = flat(car.pos, p) - (PAD_IS_BIG[k] ? 600 : 0);
            if (d < bestDistance) { bestDistance = d; bestPad = p; }
          }
          if (bestPad) target = [bestPad[0], bestPad[1]];
        }

        this.override[i] = this.obey[i] && car.onGround && !placed;
        this.target[i] = target;
      }
    }
  }

  /** Steer car i towards its target on the ground. */
  drive(engine, i, cap) {
    const car = engine.cars[i];
    const target = this.target[i];
    const dx = target[0] - car.pos[0];
    const dy = target[1] - car.pos[1];
    const distance = Math.hypot(dx, dy) || 1;
    const fx = car.fwd[0], fy = car.fwd[1];
    const fl = Math.hypot(fx, fy) || 1;
    // Right is up x forward (the engine's convention).
    const rx = car.up[1] * car.fwd[2] - car.up[2] * car.fwd[1];
    const ry = car.up[2] * car.fwd[0] - car.up[0] * car.fwd[2];
    const ahead = (dx * fx + dy * fy) / (distance * fl);
    const side = (dx * rx + dy * ry) / distance;
    const speed = Math.hypot(car.vel[0], car.vel[1]);
    const turnHard = ahead < 0.3;
    this.controls[i] = {
      throttle: distance < 250 && speed > 600 ? 0 : 1,
      steer: clamp(side * 3, -1, 1),
      pitch: 0, yaw: clamp(side * 3, -1, 1), roll: 0,
      jump: false,
      boost: ahead > 0.96 && distance > 1500 && speed < cap - 150 && car.boost > 25,
      handbrake: turnHard && speed > 500
    };
    return this.controls[i];
  }
}
