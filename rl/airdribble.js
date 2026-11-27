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
    this.phase = 'approach';
    this.timer = 0;
    this.stall = 0;
    this.jumpTicks = 0;
    this.airTime = 0;
  }

  end(cooldown = 2.5) {
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
  if (car.isDemoed || car.boost < 30 || !car.onGround || car.up[2] < 0.8) return false;
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
  if (car.isDemoed || state.timer > 8 || car.boost < 5 || dist3 > 3600 || (state.phase !== 'approach' && ball.pos[2] < 130)) {
    state.end();
    return null;
  }

  const right = cross(car.up, car.fwd);

  if (state.phase === 'approach') {
    if (!car.onGround) { state.phase = 'air'; return airControls(engine, i, state, error); }
    // Went up a wall, took too long, or is hanging about instead of closing on the ball: leave it to the network.
    const flatSpeed = Math.hypot(car.vel[0], car.vel[1]);
    state.stall = flatSpeed < 250 ? state.stall + DT : 0;
    if (car.up[2] < 0.75 || state.timer > 3.5 || state.stall > 0.7) {
      state.end(3);
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
    if (flatDist < 700 && ball.pos[2] > 230 && ballLater > 200 && alongFwd > 0.8) {
      state.phase = 'launch';
      state.jumpTicks = 14;
    }
    return {
      throttle: 1, steer: clamp(alongRight * 3, -1, 1), pitch: 0, yaw: clamp(alongRight * 3, -1, 1), roll: 0,
      jump: false, boost: alongFwd > 0.9 && speed < 1500 && car.boost > 10, handbrake: false
    };
  }

  if (state.phase === 'launch') {
    if (state.jumpTicks > 0) {
      state.jumpTicks--;
      return { throttle: 1, steer: 0, pitch: 0.4, yaw: 0, roll: 0, jump: state.jumpTicks > 3, boost: true, handbrake: false };
    }
    state.phase = 'air';
  }

  // In the air: point the nose just under and behind the ball so contact lifts it toward goal.
  state.airTime += DT;
  if (car.onGround && state.airTime > 0.3) {
    state.end();
    return null;
  }

  const lead = [seen[0] + ball.vel[0] * 0.12, seen[1] + ball.vel[1] * 0.12, seen[2] + ball.vel[2] * 0.12];
  const aim = [lead[0], lead[1] - attack * 70, lead[2] - 40];
  const toAim = sub(aim, car.pos);
  const aimDist = len(toAim) || 1;
  const d = [toAim[0] / aimDist, toAim[1] / aimDist, toAim[2] / aimDist];

  const local = [dot(d, car.fwd), dot(d, right), dot(d, car.up)];
  const pitchRate = -dot(car.angvel, right);
  const yawRate = dot(car.angvel, car.up);
  const rollRate = -dot(car.angvel, car.fwd);

  // Pitch up is angular velocity about -right, yaw is about up, roll about -forward. Gains are chosen so the
  // response is about critically damped given the engine's air-control rates.
  const pitch = clamp(4 * local[2] - 1.1 * pitchRate, -1, 1);
  const yaw = clamp(4 * local[1] - 1.3 * yawRate, -1, 1);
  const roll = clamp(3 * right[2] - 0.6 * rollRate, -1, 1);

  // Boost only while pointing at the ball and closing slower than we want to, so it is nudged rather than hit.
  const closing = dot(sub(car.vel, ball.vel), d);
  const wanted = clamp(aimDist * 1.5, 100, 700);
  const boost = local[0] > 0.8 && closing < wanted && car.boost > 0;

  return { throttle: 0, steer: 0, pitch, yaw, roll, jump: false, boost, handbrake: false };
}
