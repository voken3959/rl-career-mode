// Scripted ground dribble. The networks chase and hit the ball but rarely keep it close and rolling, so when the
// ball is loose on the ground in front of the car this takes over: sit behind the ball on the line to goal, match
// its speed so it stays just ahead of the nose, steer it toward the opponent's goal, and finish with a boosted
// shot once in range. The network gets control back when an opponent challenges, the ball pops up or escapes.
//
// World-frame [x, y, z] arrays in Unreal units; "right" follows the engine: up x forward.

import { DT, FIELD_Y } from './constants.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const HOLD_GAP = 175;       // ball centre this far in front of the car origin while carrying it
const MAX_TIME = 7;

export class GroundDribble {
  constructor() {
    this.cooldown = 0;
    this.end(0);
  }

  get active() {
    return this.phase !== 'idle';
  }

  begin() {
    this.phase = 'carry';
    this.timer = 0;
    this.turnTime = 0;
    this.stall = 0;
  }

  end(cooldown = 3) {
    this.phase = 'idle';
    this.timer = 0;
    this.turnTime = 0;
    this.stall = 0;
    this.cooldown = cooldown;
  }
}

/** Is this a good moment for car i to start dribbling the ball along the ground? */
export function canStartGround(engine, i) {
  const car = engine.cars[i];
  const ball = engine.ball;
  if (car.isDemoed || !car.onGround || car.up[2] < 0.7) return false;
  const attack = car.team === 0 ? 1 : -1;
  const dx = ball.pos[0] - car.pos[0];
  const dy = ball.pos[1] - car.pos[1];
  const dist = Math.hypot(dx, dy);
  if (ball.pos[2] > 230 || Math.abs(ball.vel[2]) > 450 || Math.hypot(ball.vel[0], ball.vel[1]) > 1700) return false;
  if (dist < 180 || dist > 1500) return false;
  // Kickoff: the ball is still, in the middle. Let the network take it (flip, speed, hit); carrying a ball that is not
  // moving only made the car slow down and stop in front of it.
  if (Math.hypot(ball.vel[0], ball.vel[1]) < 60 && Math.hypot(ball.pos[0], ball.pos[1]) < 300) return false;
  if (attack * ball.pos[1] < -3200) return false; // deep in our own end: clear it rather than carry it
  const flat = Math.hypot(car.fwd[0], car.fwd[1]) || 1;
  if ((dx * car.fwd[0] + dy * car.fwd[1]) / (dist * flat) < 0.6) return false;
  // Only the closest player on the team, and not with an opponent already on the ball.
  for (let j = 0; j < engine.cars.length; j++) {
    if (j === i) continue;
    const other = engine.cars[j];
    const d = Math.hypot(ball.pos[0] - other.pos[0], ball.pos[1] - other.pos[1]);
    if (other.team === car.team && d < dist - 100) return false;
    if (other.team !== car.team && !other.isDemoed && d < Math.max(700, dist)) return false;
  }
  return true;
}

/**
 * Controls for car i this tick, or null when the dribble is over. error is the car's current misjudgement of the
 * ball position, so weaker players carry it less cleanly.
 */
export function groundControls(engine, i, state, error) {
  const car = engine.cars[i];
  const ball = engine.ball;
  const attack = car.team === 0 ? 1 : -1;
  state.timer += DT;

  const seen = [ball.pos[0] + error[0] * 0.5, ball.pos[1] + error[1] * 0.5];
  const toBall = [seen[0] - car.pos[0], seen[1] - car.pos[1]];
  const dist = Math.hypot(toBall[0], toBall[1]) || 1;
  const fwdFlat = Math.hypot(car.fwd[0], car.fwd[1]) || 1;
  const fwd = [car.fwd[0] / fwdFlat, car.fwd[1] / fwdFlat];
  const facing = (toBall[0] * fwd[0] + toBall[1] * fwd[1]) / dist;

  let challenged = false;
  for (const other of engine.cars) {
    if (other.team === car.team || other.isDemoed) continue;
    if (Math.hypot(ball.pos[0] - other.pos[0], ball.pos[1] - other.pos[1]) < Math.min(450, dist * 0.8)) challenged = true;
  }
  if (car.isDemoed || state.timer > MAX_TIME || ball.pos[2] > 340 || dist > 1700 || facing < 0.1 || challenged ||
      (!car.onGround && state.timer > 0.3)) {
    state.end(challenged ? 2 : 3);
    return null;
  }

  // Which way we want the ball to go: at the middle of the goal, bending in from the sides.
  const goal = [0, attack * (FIELD_Y + 300)];
  let want = [goal[0] - seen[0], goal[1] - seen[1]];
  const wantLen = Math.hypot(want[0], want[1]) || 1;
  want = [want[0] / wantLen, want[1] / wantLen];
  const toGoal = wantLen;
  const shooting = toGoal < 2600 && dist < 330;

  // Aim a little behind the ball (relative to where we want it to go) so contact pushes it that way.
  const lead = [ball.vel[0] * 0.12, ball.vel[1] * 0.12];
  const back = shooting ? 0 : 120;
  const aim = [seen[0] + lead[0] - want[0] * back, seen[1] + lead[1] - want[1] * back];
  const toAim = [aim[0] - car.pos[0], aim[1] - car.pos[1]];

  const right = cross(car.up, car.fwd);
  const rightFlat = Math.hypot(right[0], right[1]) || 1;
  const localFwd = toAim[0] * fwd[0] + toAim[1] * fwd[1];
  const localRight = (toAim[0] * right[0] + toAim[1] * right[1]) / rightFlat;
  const angle = Math.atan2(localRight, Math.max(localFwd, 1));
  const steer = clamp(angle * 2.4, -1, 1);
  // Steering hard for a long time means going round the ball rather than at it: give up and let the network play.
  state.turnTime = Math.abs(angle) > 0.9 ? state.turnTime + DT : Math.max(0, state.turnTime - DT);
  if (state.turnTime > 0.9) {
    state.end(5);
    return null;
  }

  // Speed: match the ball along our heading and close or open the gap to HOLD_GAP. Charge it when shooting.
  const speed = car.vel[0] * fwd[0] + car.vel[1] * fwd[1];
  const ballAlong = ball.vel[0] * fwd[0] + ball.vel[1] * fwd[1];
  const gap = dist * Math.max(0.2, facing) - HOLD_GAP;
  // Always keep closing on the ball by at least a little: matching its speed exactly stops the car just short of
  // a ball that is still, where it would wait in front of it instead of pushing it on.
  let target = shooting ? 2000 : ballAlong + clamp(gap * 2.2, 280, 750);
  // Turn first when the ball is well off to the side: slow down so it is not driven past.
  if (Math.abs(angle) > 0.7 && !shooting) target = Math.min(target, 500 + Math.abs(ballAlong));
  target = clamp(target, 0, 1900);
  const throttle = clamp((target - speed) / 160, -1, 1);
  // Barely moving while right behind the ball means it is waiting rather than carrying: give up.
  state.stall = Math.abs(speed) < 150 && dist < 600 ? state.stall + DT : Math.max(0, state.stall - DT);
  if (state.stall > 0.7) {
    state.end(5);
    return null;
  }
  const boost = (shooting || target - speed > 350) && Math.abs(angle) < 0.35 && car.boost > 0 && speed < 1900;

  return { throttle, steer, pitch: 0, yaw: steer, roll: 0, jump: false, boost, handbrake: false };
}
