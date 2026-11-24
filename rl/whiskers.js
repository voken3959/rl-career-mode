// JavaScript port of the Whiskers V5 Rocket League bot (https://github.com/adventure-gpt/whiskers-v5-bot,
// MIT licence, copy in rl/WHISKERS-LICENSE.txt). It ports the observation builder (obs.py), the 90-action
// table (actions.py) and the plain feed-forward actor network (model.py) so the policy can run in the browser.
//
// The checkpoint is a set-structured MLP: a shared per-car encoder over the 5 other-car slots, masked
// mean+max pooling for teammates and opponents, then a 1024-1024-512 trunk that outputs 90 action logits.
// Its saved config has ball_pred on and attention, memory and opp_inputs off, so no recurrent state is needed.

import {
  FIELD_X, FIELD_Y, FIELD_Z, GOAL_CENTER_Z, DODGE_WINDOW, DEMO_TIME, PAD_POSITIONS, NUM_PADS
} from './constants.js';

export const OBS_DIM = 462;
export const NUM_ACTIONS = 90;
const GLOBAL_DIM = 297;
const CAR_FEAT = 33;
const ENC = 192;
const MAX_CARS = 6;
const OTHER_SLOTS = MAX_CARS - 1;

const DIST = 5000;
const VEL = 2300;
const BALL_VEL = 6000;
const ANG = 5.5;
const BALL_ANG = 6.0;

// The bot's own ball-flight constants for its look-ahead (not the engine's physical radius).
const PRED_BALL_R = 92.75;
const PRED_GRAVITY = 650;
const PRED_RESTITUTION = 0.6;
const PRED_DRAG = 0.03;
const PRED_TIMES = [0.5, 1.0, 1.5, 2.0];

/* ------------------------------ action table ------------------------------ */

function makeActionTable() {
  const rows = [];
  for (const throttle of [-1, 0, 1]) {
    for (const steer of [-1, 0, 1]) {
      for (const boost of [0, 1]) {
        for (const handbrake of [0, 1]) {
          if (boost === 1 && throttle !== 1) continue;
          rows.push([throttle, steer, 0, steer, 0, 0, boost, handbrake]);
        }
      }
    }
  }
  for (const pitch of [-1, 0, 1]) {
    for (const yaw of [-1, 0, 1]) {
      for (const roll of [-1, 0, 1]) {
        for (const jump of [0, 1]) {
          for (const boost of [0, 1]) {
            if (jump === 1 && yaw !== 0) continue;
            if (pitch === 0 && roll === 0 && jump === 0) continue;
            const handbrake = jump === 1 && (pitch !== 0 || yaw !== 0 || roll !== 0) ? 1 : 0;
            rows.push([boost, yaw, pitch, yaw, roll, jump, boost, handbrake]);
          }
        }
      }
    }
  }
  if (rows.length !== NUM_ACTIONS) throw new Error('Whiskers action table has ' + rows.length + ' rows');
  return rows;
}

export const ACTION_TABLE = makeActionTable();

/* ------------------------------ pad mirror ------------------------------ */

// padMirror[i] = index of the pad located at (-x, -y) of pad i (orange sees the field rotated 180 degrees).
const PAD_MIRROR = PAD_POSITIONS.map(([x, y]) => {
  let best = 0;
  let bestDistance = Infinity;
  PAD_POSITIONS.forEach(([px, py], j) => {
    const d = Math.abs(px + x) + Math.abs(py + y);
    if (d < bestDistance) { bestDistance = d; best = j; }
  });
  return best;
});

/* ------------------------------ ball look-ahead ------------------------------ */

function fold(x, lim) {
  const period = 4 * lim;
  const m = (((x + lim) % period) + period) % period;
  return m < 2 * lim ? m - lim : 3 * lim - m;
}

// Closed-form ball flight: gravity, linear drag, one floor bounce, walls as mirrors. Positions at each time.
function ballPath(pos, vel, times) {
  const out = [];
  for (const t of times) {
    const f = (1 - Math.exp(-PRED_DRAG * t)) / PRED_DRAG;
    const x = fold(pos[0] + vel[0] * f, FIELD_X - PRED_BALL_R);
    const y = fold(pos[1] + vel[1] * f, FIELD_Y - PRED_BALL_R);
    const z0 = Math.max(pos[2], PRED_BALL_R);
    const vz = vel[2];
    const tb = (vz + Math.sqrt(vz * vz + 2 * PRED_GRAVITY * (z0 - PRED_BALL_R))) / PRED_GRAVITY;
    const zFree = z0 + vz * t - 0.5 * PRED_GRAVITY * t * t;
    const rebound = -PRED_RESTITUTION * (vz - PRED_GRAVITY * tb);
    const s = Math.max(t - tb, 0);
    const z = t < tb ? zFree : PRED_BALL_R + rebound * s - 0.5 * PRED_GRAVITY * s * s;
    out.push([x, y, Math.min(Math.max(z, PRED_BALL_R), FIELD_Z - PRED_BALL_R)]);
  }
  return out;
}

/* ------------------------------ observation ------------------------------ */

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);

/**
 * Build the 462-number observation for one car.
 * world: { ball: {pos, vel, angvel}, pads: [{active, timeLeft}] in canonical order,
 *          cars: [{team, present, pos, vel, angvel, fwd, up, boost, onGround, hasJumped, hasDoubleJumped,
 *                  hasFlipped, isJumping, isFlipping, canDodge, dodgeTimeLeft, isSupersonic, isDemoed,
 *                  demoTimeLeft}] with up to 6 entries, blue slots first then orange }
 * self: index of the acting car in world.cars; prev: its previous 8 controls.
 */
export function buildObservation(world, selfIndex, prev, out) {
  const me = world.cars[selfIndex];
  const orange = me.team === 1;
  const flip = v => (orange ? [-v[0], -v[1], v[2]] : [v[0], v[1], v[2]]);

  const pos = flip(me.pos);
  const vel = flip(me.vel);
  const angvel = flip(me.angvel);
  const fwd = flip(me.fwd);
  const up = flip(me.up);
  const right = cross(up, fwd);
  const local = v => [dot(fwd, v), dot(right, v), dot(up, v)];

  const bpos = flip(world.ball.pos);
  const bvel = flip(world.ball.vel);
  const bang = flip(world.ball.angvel);
  const rel = sub(bpos, pos);
  const rvel = sub(bvel, vel);

  let n = 0;
  const push = (v, scale) => { for (let i = 0; i < v.length; i++) out[n++] = v[i] / scale; };
  const pushRaw = v => { for (let i = 0; i < v.length; i++) out[n++] = v[i]; };

  push(pos, 1); out[n - 3] = pos[0] / FIELD_X; out[n - 2] = pos[1] / FIELD_Y; out[n - 1] = pos[2] / FIELD_Z;
  push(vel, VEL);
  push(angvel, ANG);
  pushRaw(fwd);
  pushRaw(up);
  push(local(vel), VEL);
  push(local(angvel), ANG);
  out[n++] = me.boost / 100;
  out[n++] = me.onGround ? 1 : 0;
  out[n++] = me.hasJumped ? 1 : 0;
  out[n++] = me.hasDoubleJumped ? 1 : 0;
  out[n++] = me.hasFlipped ? 1 : 0;
  out[n++] = me.isJumping ? 1 : 0;
  out[n++] = me.isFlipping ? 1 : 0;
  out[n++] = me.canDodge ? 1 : 0;
  out[n++] = me.isSupersonic ? 1 : 0;
  out[n++] = me.isDemoed ? 1 : 0;
  out[n++] = me.dodgeTimeLeft / DODGE_WINDOW;
  out[n++] = me.demoTimeLeft / DEMO_TIME;
  out[n++] = bpos[0] / FIELD_X; out[n++] = bpos[1] / FIELD_Y; out[n++] = bpos[2] / FIELD_Z;
  push(bvel, BALL_VEL);
  push(bang, BALL_ANG);
  push(rel, DIST);
  push(local(rel), DIST);
  push(rvel, VEL);
  push(local(rvel), VEL);
  out[n++] = norm(rel) / DIST;
  push(local(sub([0, FIELD_Y, GOAL_CENTER_Z], pos)), DIST);
  push(local(sub([0, -FIELD_Y, GOAL_CENTER_Z], pos)), DIST);
  for (let i = 0; i < NUM_PADS; i++) out[n++] = world.pads[orange ? PAD_MIRROR[i] : i].active ? 1 : 0;
  for (let i = 0; i < NUM_PADS; i++) out[n++] = world.pads[orange ? PAD_MIRROR[i] : i].timeLeft / 10;
  pushRaw(prev);
  const padRel = PAD_POSITIONS.map(p => sub(p, pos));
  for (const r of padRel) push(local(r), DIST);
  for (const r of padRel) out[n++] = norm(r) / DIST;

  // Ball look-ahead: absolute and car-relative predicted positions at 0.5, 1, 1.5 and 2 s.
  const path = ballPath(bpos, bvel, PRED_TIMES);
  for (const p of path) { out[n++] = p[0] / FIELD_X; out[n++] = p[1] / FIELD_Y; out[n++] = p[2] / FIELD_Z; }
  for (const p of path) push(local(sub(p, pos)), DIST);

  if (n !== GLOBAL_DIM) throw new Error('Whiskers global observation has ' + n + ' numbers, expected ' + GLOBAL_DIM);

  // Other car slots, in slot order with this car left out.
  for (let slot = 0; slot < MAX_CARS; slot++) {
    if (slot === selfIndex) continue;
    const car = world.cars[slot];
    const start = n;
    if (!car || !car.present) {
      for (let i = 0; i < CAR_FEAT; i++) out[n++] = 0;
      continue;
    }
    const opos = flip(car.pos);
    const ovel = flip(car.vel);
    const ofwd = flip(car.fwd);
    const oup = flip(car.up);
    const orel = sub(opos, pos);
    const orvel = sub(ovel, vel);
    const oball = sub(bpos, opos);
    out[n++] = 1;
    out[n++] = car.team === me.team ? 1 : 0;
    push(orel, DIST);
    push(local(orel), DIST);
    push(orvel, VEL);
    push(local(orvel), VEL);
    push(ovel, VEL);
    pushRaw(ofwd);
    pushRaw(oup);
    out[n++] = car.boost / 100;
    out[n++] = car.onGround ? 1 : 0;
    out[n++] = car.canDodge ? 1 : 0;
    out[n++] = car.isSupersonic ? 1 : 0;
    out[n++] = car.isDemoed ? 1 : 0;
    out[n++] = norm(orel) / DIST;
    push(oball, DIST);
    out[n++] = norm(oball) / DIST;
    if (n - start !== CAR_FEAT) throw new Error('Whiskers car row has ' + (n - start) + ' numbers');
  }
  // Pad the slots that do not exist (the fixed layout always has 5 other-car rows).
  while (n < OBS_DIM) out[n++] = 0;
  return out;
}

/* ------------------------------ network ------------------------------ */

function linear(input, weights, bias, outDim, inDim, output, relu) {
  for (let o = 0; o < outDim; o++) {
    let sum = bias[o];
    const row = o * inDim;
    for (let i = 0; i < inDim; i++) sum += weights[row + i] * input[i];
    output[o] = relu && sum < 0 ? 0 : sum;
  }
}

export class WhiskersPolicy {
  constructor(buffer) {
    const all = new Float32Array(buffer);
    let offset = 0;
    const take = count => { const view = all.subarray(offset, offset + count); offset += count; return view; };
    this.enc0 = { w: take(ENC * CAR_FEAT), b: take(ENC) };
    this.enc1 = { w: take(ENC * ENC), b: take(ENC) };
    const trunkIn = GLOBAL_DIM + 4 * ENC;
    this.trunk0 = { w: take(1024 * trunkIn), b: take(1024) };
    this.trunk1 = { w: take(1024 * 1024), b: take(1024) };
    this.trunk2 = { w: take(512 * 1024), b: take(512) };
    this.out = { w: take(NUM_ACTIONS * 512), b: take(NUM_ACTIONS) };
    if (offset !== all.length) throw new Error('Whiskers weight file has ' + all.length + ' floats, expected ' + offset);
    this.trunkIn = trunkIn;
    this.obs = new Float32Array(OBS_DIM);
    this.input = new Float32Array(trunkIn);
    this.h1 = new Float32Array(1024);
    this.h2 = new Float32Array(1024);
    this.h3 = new Float32Array(512);
    this.logits = new Float32Array(NUM_ACTIONS);
    this.e0 = new Float32Array(ENC);
    this.e1 = new Float32Array(ENC);
  }

  static async load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load ' + url + ' (' + response.status + ')');
    return new WhiskersPolicy(await response.arrayBuffer());
  }

  /** Action logits for one observation (a Float32Array of 462 numbers). */
  forward(obs) {
    const input = this.input;
    input.set(obs.subarray(0, GLOBAL_DIM), 0);

    // Per-car encoder, then masked mean and max pooling over teammates and opponents.
    const mean = [new Float32Array(ENC), new Float32Array(ENC)];
    const max = [new Float32Array(ENC), new Float32Array(ENC)];
    const count = [0, 0];
    for (let slot = 0; slot < OTHER_SLOTS; slot++) {
      const row = obs.subarray(GLOBAL_DIM + slot * CAR_FEAT, GLOBAL_DIM + (slot + 1) * CAR_FEAT);
      if (row[0] < 0.5) continue;
      linear(row, this.enc0.w, this.enc0.b, ENC, CAR_FEAT, this.e0, true);
      linear(this.e0, this.enc1.w, this.enc1.b, ENC, ENC, this.e1, true);
      const group = row[1] > 0.5 ? 0 : 1;
      count[group]++;
      for (let i = 0; i < ENC; i++) {
        mean[group][i] += this.e1[i];
        if (this.e1[i] > max[group][i]) max[group][i] = this.e1[i];
      }
    }
    for (let g = 0; g < 2; g++) {
      const base = GLOBAL_DIM + g * 2 * ENC;
      const divisor = Math.max(count[g], 1);
      for (let i = 0; i < ENC; i++) {
        input[base + i] = mean[g][i] / divisor;
        input[base + ENC + i] = max[g][i];
      }
    }

    linear(input, this.trunk0.w, this.trunk0.b, 1024, this.trunkIn, this.h1, true);
    linear(this.h1, this.trunk1.w, this.trunk1.b, 1024, 1024, this.h2, true);
    linear(this.h2, this.trunk2.w, this.trunk2.b, 512, 1024, this.h3, true);
    linear(this.h3, this.out.w, this.out.b, NUM_ACTIONS, 512, this.logits, false);
    return this.logits;
  }

  /**
   * Choose an action index for car `selfIndex` of `world`.
   * temperature 0 plays the most likely action; higher values sample from softmax(logits / temperature).
   */
  decide(world, selfIndex, prev, temperature) {
    buildObservation(world, selfIndex, prev, this.obs);
    const logits = this.forward(this.obs);
    if (!(temperature > 0)) {
      let best = 0;
      for (let i = 1; i < NUM_ACTIONS; i++) if (logits[i] > logits[best]) best = i;
      return best;
    }
    let top = -Infinity;
    for (let i = 0; i < NUM_ACTIONS; i++) if (logits[i] > top) top = logits[i];
    let total = 0;
    const weights = new Float32Array(NUM_ACTIONS);
    for (let i = 0; i < NUM_ACTIONS; i++) {
      weights[i] = Math.exp((logits[i] - top) / temperature);
      total += weights[i];
    }
    let pick = Math.random() * total;
    for (let i = 0; i < NUM_ACTIONS; i++) {
      pick -= weights[i];
      if (pick <= 0) return i;
    }
    return NUM_ACTIONS - 1;
  }
}
