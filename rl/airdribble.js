// Scripted air dribble. The network sometimes jumps for the ball but never carries it, so this takes over for
// one car when the ball is loose in the air in front of it: drive under it, jump, boost up and keep the nose
// pointed just under the ball so each touch pushes it on toward the opponent's goal.
//
// All vectors are world-frame [x, y, z] arrays in Unreal units. "right" follows the engine: up x forward.

import { DT } from './constants.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class AirDribble {
  constructor() {
    this.cooldown = 0;
    this.end();
  }

  get active() {
    return this.phase !== 'idle';
  }

  begin() {
    this.starts = (this.starts || 0) + 1;
    this.phase = 'approach';
    this.timer = 0;
    this.stall = 0;
    this.jumpTicks = 0;
    this.airTime = 0;
  }

  end(cooldown = 2.5, why = '') {
    if (this.phase && this.phase !== 'idle') { this.last = why || 'ended'; this.lastTime = this.timer; }
    this.phase = 'idle';
    this.timer = 0;
    this.stall = 0;
    this.jumpTicks = 0;
    this.airTime = 0;
    this.cooldown = cooldown;
  }
}

/** Is this a good moment for car i to start an air dribble? */
export function canStart(engine, i) {
  const car = engine.cars[i];
  const ball = engine.ball;
  // Only from the floor: the controller assumes a flat surface, and on a wall the car just crawls up and waits below the ball.
  if (car.isDemoed || car.boost < 45 || !car.onGround || car.up[2] < 0.8) return false;
  const dx = ball.pos[0] - car.pos[0];
  const dy = ball.pos[1] - car.pos[1];
  const dist = Math.hypot(dx, dy);
  const height = ball.pos[2];
  // A ball that is only bouncing off the floor is no use: it has to be up there and staying up for a moment.
  const later = height + ball.vel[2] * 0.5 - 0.5 * 650 * 0.25;
  if (height < 200 || later < 220 || height > 1700 || len(ball.vel) > 2400 || dist < 250 || dist > 3200) return false;
  // Only the closest player on the team goes for it.
  for (let j = 0; j < engine.cars.length; j++) {
    if (j === i) continue;
    const other = engine.cars[j];
    if (other.team !== car.team) continue;
    if (Math.hypot(ball.pos[0] - other.pos[0], ball.pos[1] - other.pos[1]) < dist - 100) return false;
  }
  const flat = Math.hypot(car.fwd[0], car.fwd[1]) || 1;
  const facing = (dx * car.fwd[0] + dy * car.fwd[1]) / (dist * flat);
  return facing > 0.3;
}

/**
 * Controls for car i for this tick, or null when the dribble is over (the network then takes back over).
 * error is the car's current misjudgement of the ball position, so weaker players aim worse.
 */
export function airControls(engine, i, state, error) {
  const car = engine.cars[i];
  const ball = engine.ball;
  const attack = car.team === 0 ? 1 : -1;
  state.timer += DT;

  const seen = [ball.pos[0] + error[0], ball.pos[1] + error[1], ball.pos[2] + error[2]];
  const toBallFlat = [seen[0] - car.pos[0], seen[1] - car.pos[1]];
  const flatDist = Math.hypot(toBallFlat[0], toBallFlat[1]);
  const dist3 = len(sub(seen, car.pos));

  // The ball dropping to the floor only ends it once the car has actually left the ground after it.
  if (car.isDemoed || state.timer > 8 || car.boost < 5 || dist3 > 3600 || (state.phase !== 'approach' && ball.pos[2] < 130 && state.airTime > 0.8)) {
    state.end(2.5, car.boost < 5 ? 'out of boost' : state.timer > 8 ? 'timeout' : dist3 > 3600 ? 'ball too far' : car.isDemoed ? 'demoed' : 'ball fell');
    return null;
  }

  const right = cross(car.up, car.fwd);

  if (state.phase === 'approach') {
    if (!car.onGround) { state.phase = 'air'; return airControls(engine, i, state, error); }
    // Went up a wall, took too long, or is hanging about instead of closing on the ball: leave it to the network.
    const flatSpeed = Math.hypot(car.vel[0], car.vel[1]);
    state.stall = flatSpeed < 250 ? state.stall + DT : 0;
    if (car.up[2] < 0.75 || state.timer > 3.5 || state.stall > 0.7) {
      state.end(3, car.up[2] < 0.75 ? 'left the floor' : state.timer > 3.5 ? 'approach too slow' : 'stalled');
      return null;
    }
    // Drive to where the ball will be, then jump when it is close enough to reach.
    const target = [seen[0] + ball.vel[0] * 0.5, seen[1] + ball.vel[1] * 0.5];
    const dir = [target[0] - car.pos[0], target[1] - car.pos[1]];
    const dirLen = Math.hypot(dir[0], dir[1]) || 1;
    const alongRight = (dir[0] * right[0] + dir[1] * right[1]) / dirLen;
    const alongFwd = (dir[0] * car.fwd[0] + dir[1] * car.fwd[1]) / (dirLen * (Math.hypot(car.fwd[0], car.fwd[1]) || 1));
    const speed = len(car.vel);
    const ballLater = ball.pos[2] + ball.vel[2] * 0.4 - 0.5 * 650 * 0.16;
    if (flatDist < 900 && ball.pos[2] > 230 && ballLater > 200 && alongFwd > 0.6) {
      state.phase = 'launch';
      state.jumpTicks = 14;
    }
    return {
      throttle: 1, steer: clamp(alongRight * 3, -1, 1), pitch: 0, yaw: clamp(alongRight * 3, -1, 1), roll: 0,
      jump: false, boost: alongFwd > 0.9 && speed < 1500 && car.boost > 10, handbrake: false
    };
  }

  if (state.phase === 'launch') {
    // Straight into the aerial controller so the nose starts coming up (and boost starts) the moment the car leaves
    // the ground, with the first jump held for its full height.
    state.phase = 'air';
    state.jumpHold = 0.2;
  }

  // In the air: point the nose just under and behind the ball so contact lifts it toward goal.
  state.airTime += DT;
  if (car.onGround && state.airTime > 0.3) {
    state.end(2.5, 'landed');
    return null;
  }

  const lead = [seen[0] + ball.vel[0] * 0.12, seen[1] + ball.vel[1] * 0.12, seen[2] + ball.vel[2] * 0.12];
  // A ball low on the ground is scooped: aim above it so the nose comes up under it instead of diving at it.
  const scoop = clamp((300 - seen[2]) / 200, 0, 1) * 230;
  const ku = 0;
  const aim = [lead[0] - car.up[0] * ku, lead[1] - attack * (70) - car.up[1] * ku, lead[2] - (60) + scoop - car.up[2] * ku];
  const gap = sub(aim, car.pos);
  const aimDist = len(gap) || 1;

  // Boost only pushes along the nose, and a car already flying sideways keeps flying sideways, so pointing at the
  // ball is not enough: aim the nose along the acceleration that closes the gap AND cancels the velocity difference
  // (plus enough to hold against gravity and a little push toward the opponent's goal).
  // Velocity tracking: the car wants to move at the ball's velocity plus a closing speed proportional to the gap
  // (capped), and pushes along the acceleration that gets it there, plus gravity hold and a little push toward goal.
  // Far away this is "fly at the ball"; at contact it is "match the ball's velocity" with no braking in between.
  const closeSpeed = Math.min(1100, aimDist * (2));
  const vDes = [ball.vel[0] + gap[0] / aimDist * closeSpeed, ball.vel[1] + gap[1] / aimDist * closeSpeed, ball.vel[2] + gap[2] / aimDist * closeSpeed];
  const want = [
    (vDes[0] - car.vel[0]) * (4),
    (vDes[1] - car.vel[1]) * (4) + attack * (250),
    (vDes[2] - car.vel[2]) * (4) + 650
  ];
  const wantLen = len(want) || 1;
  let d = [want[0] / wantLen, want[1] / wantLen, want[2] / wantLen];
  // Close in, the ball is carried rather than chased: point the nose at the spot just under and behind the ball so
  // the ball stays on the hood, and burn according to how far ahead of the nose it is getting.
  const near = aimDist < (450);
  if (near) {
    // Keep the nose between about 35 and 55 degrees up: flatter and the push no longer holds the pair up, steeper and
    // it stops moving forward and the ball slides off the back.
    const hLen = Math.hypot(gap[0], gap[1]) || 1;
    const elev = clamp(Math.atan2(gap[2], hLen), 0.2, 1.5);
    d = [gap[0] / hLen * Math.cos(elev), gap[1] / hLen * Math.cos(elev), Math.sin(elev)];
  }

  const local = [dot(d, car.fwd), dot(d, right), dot(d, car.up)];
  const pitchRate = -dot(car.angvel, right);
  const yawRate = dot(car.angvel, car.up);
  const rollRate = -dot(car.angvel, car.fwd);

  // Pitch up is angular velocity about -right, yaw is about up, roll about -forward. Gains are chosen so the
  // response is about critically damped given the engine's air-control rates.
  const pitch = clamp((4) * local[2] - (1.1) * pitchRate, -1, 1);
  const yaw = clamp((4) * local[1] - (1.1) * yawRate, -1, 1);
  const roll = clamp(3 * right[2] - 0.6 * rollRate, -1, 1);

  // Burn only when pointing roughly where the acceleration is wanted and a decent push is needed, so it is
  // pulsed to hold the ball up rather than blasting through it.
  let boost = local[0] > (0.85) && dot(want, car.fwd) > (450) && car.boost > 0;
  if (near) {
    const relBall = sub(ball.pos, car.pos);
    const bx = dot(relBall, car.fwd);
    const vf = dot(sub(ball.vel, car.vel), car.fwd);
    const push = bx + (0.2) * vf > (150);
    // The pair also has to be held up against gravity: with the ball pressed on the nose, keep burning while it is
    // not rising, and ease off when it is climbing fast.
    const hold = bx < 300 && ball.vel[2] < (-100) && car.fwd[2] > 0.35;
    boost = car.boost > 0 && local[0] > (0.6) && (push || hold);
  }

  const hold = state.jumpHold > 0;
  if (hold) state.jumpHold -= DT;
  return { throttle: 0, steer: 0, pitch, yaw, roll, jump: hold, boost, handbrake: false };
}
