// Air-roll recovery for bots: lines the car's wheels up with the surface it is about to land on (the floor,
// a wall or the ceiling) using pitch and roll, so landings are clean, and flips an upside-down car back over
// once the engine gives the flip back after its cooldown. Vectors are world-frame arrays in Unreal units;
// "right" follows the engine (up x forward).

import { arenaQuery } from './engine.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Normal of the surface the car will land on: the nearest one along its path over the next half second. */
function landingNormal(car) {
  let best = null;
  for (let k = 0; k <= 6; k++) {
    const t = k * 0.1;
    const x = car.pos[0] + car.vel[0] * t;
    const y = car.pos[1] + car.vel[1] * t;
    const z = car.pos[2] + car.vel[2] * t - 325 * t * t;
    const q = arenaQuery(x, y, z, true);
    if (q.d < 120) return q.n;
    if (!best || q.d < best.d) best = q;
  }
  return best && best.d < 700 ? best.n : null;
}

/** Pitch/roll/yaw inputs that turn the car's wheels toward the landing surface, or null when it is far from any. */
export function landingAssist(car) {
  const n = landingNormal(car);
  if (!n) return null;
  const right = cross(car.up, car.fwd);
  const e = cross(car.up, n); // axis (world) that rotates up onto n, magnitude = sin(angle)
  const flipped = dot(car.up, n) < 0;
  // Upside down the error axis vanishes, so push around the roll axis instead.
  const ef = flipped && Math.abs(dot(e, car.fwd)) < 0.2 ? (right[2] >= 0 ? 1 : -1) : dot(e, car.fwd);
  const er = dot(e, right);
  const rollRate = -dot(car.angvel, car.fwd);
  const pitchRate = -dot(car.angvel, right);
  const yawRate = dot(car.angvel, car.up);
  return {
    roll: clamp(1.4 * (-3 * ef - rollRate), -1, 1),
    pitch: clamp(1.4 * (-3 * er - pitchRate), -1, 1),
    yaw: clamp(-0.8 * yawRate, -1, 1),
    upright: dot(car.up, n)
  };
}

/** Roll direction (+1/-1) that gets an upside-down car back over fastest. */
export function rightingRoll(car) {
  const right = cross(car.up, car.fwd);
  return right[2] >= 0 ? 1 : -1;
}
