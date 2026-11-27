// Spots a car that keeps driving in circles (turning round and round without getting anywhere, whatever the
// cause) so the match driver can break it out: end any scripted dribble and send it towards the ball or its
// covering spot with arrival-aware driving.

const SAMPLE_TICKS = 10;          // one sample every 1/12 s
const WINDOW = 36;                // about 3 s of samples
const TURN_LIMIT = 4.6;           // radians turned within the window (a bit over 260 degrees)
const EXTENT_LIMIT = 1400;        // uu: a circle this small is going nowhere

export class CircleGuard {
  constructor(carCount) {
    this.history = Array.from({ length: carCount }, () => []);
    this.until = new Array(carCount).fill(0);
    this.quietUntil = new Array(carCount).fill(0);
  }

  reset() {
    this.history.forEach(h => { h.length = 0; });
    this.until.fill(0);
    this.quietUntil.fill(0);
  }

  /** Call every tick; returns the indices of cars newly judged to be circling. */
  sample(engine, tick) {
    const found = [];
    if (tick % SAMPLE_TICKS !== 0) return found;
    const ball = engine.ball.pos;
    engine.cars.forEach((car, i) => {
      const history = this.history[i];
      if (car.isDemoed || !car.onGround) { history.length = 0; return; }
      history.push({ x: car.pos[0], y: car.pos[1], h: Math.atan2(car.fwd[1], car.fwd[0]), bd: Math.hypot(ball[0] - car.pos[0], ball[1] - car.pos[1]), s: Math.hypot(car.vel[0], car.vel[1]) });
      if (history.length > WINDOW) history.shift();
      if (history.length < WINDOW || engine.time < this.quietUntil[i]) return;

      let turned = 0;
      let cx = 0;
      let cy = 0;
      let minBall = Infinity;
      let speed = 0;
      for (let k = 0; k < history.length; k++) {
        const p = history[k];
        if (k > 0) {
          let d = p.h - history[k - 1].h;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          turned += d;
        }
        cx += p.x; cy += p.y;
        minBall = Math.min(minBall, p.bd);
        speed += p.s;
      }
      cx /= history.length; cy /= history.length;
      speed /= history.length;
      let extent = 0;
      for (const p of history) extent = Math.max(extent, Math.hypot(p.x - cx, p.y - cy));

      if (Math.abs(turned) > TURN_LIMIT && extent < EXTENT_LIMIT && speed > 350 && minBall > 330) {
        this.until[i] = engine.time + 1.8;
        this.quietUntil[i] = engine.time + 4;
        history.length = 0;
        found.push(i);
      }
    });
    return found;
  }
}
