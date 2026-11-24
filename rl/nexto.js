// JavaScript port of Nexto (https://github.com/Rolv-Arild/Necto), a Grand Champion level Rocket League bot.
// Licensed CC BY-NC-SA 4.0: non-commercial use only, share-alike. See rl/NEXTO-LICENSE.txt.
//
// Nexto is an attention network. Every car, the ball and every boost pad is an "entity" row of 24 numbers
// in the acting car's frame (nexto_obs.py). A 32-number query describing the acting car attends over the
// entity rows through two perceiver blocks, and the result is scored against an embedding of each of the 90
// actions. The weights in rl/nexto.bin come from tools/extract_nexto.py.

import { PAD_POSITIONS, PAD_IS_BIG } from './constants.js';
import { ACTION_TABLE } from './whiskers.js';

const D = 128;
const HEADS = 4;
const HEAD_DIM = D / HEADS;
const FF = 512;
const QIN = 32;
const KIN = 24;
const ACT = 32;
const LN_EPS = 1e-5;

// Entity row layout (nexto_obs.py).
const IS_SELF = 0, IS_MATE = 1, IS_OPP = 2, IS_BALL = 3, IS_BOOST = 4;
const POS = 5, VEL = 8, FWD = 11, UPV = 14, ANG = 17;
const BOOST = 20, DEMO = 21, ON_GROUND = 22, HAS_FLIP = 23;
const POS_NORM = 2300;
const ANG_NORM = 5.5;

// y = W x + b for a row-major weight matrix W of shape (outDim, inDim) that starts at W.
function matvec(W, b, x, xOff, out, outOff, outDim, inDim, relu) {
  const tail = inDim - (inDim % 4);
  for (let o = 0; o < outDim; o++) {
    let a = 0, c = 0, d = 0, e = 0;
    let row = o * inDim;
    let i = 0;
    for (; i < tail; i += 4, row += 4) {
      a += W[row] * x[xOff + i];
      c += W[row + 1] * x[xOff + i + 1];
      d += W[row + 2] * x[xOff + i + 2];
      e += W[row + 3] * x[xOff + i + 3];
    }
    let sum = b[o] + a + c + d + e;
    for (; i < inDim; i++, row++) sum += W[row] * x[xOff + i];
    out[outOff + o] = relu && sum < 0 ? 0 : sum;
  }
}

function layerNorm(x, xOff, w, b, out, outOff) {
  let mean = 0;
  for (let i = 0; i < D; i++) mean += x[xOff + i];
  mean /= D;
  let variance = 0;
  for (let i = 0; i < D; i++) { const v = x[xOff + i] - mean; variance += v * v; }
  const scale = 1 / Math.sqrt(variance / D + LN_EPS);
  for (let i = 0; i < D; i++) out[outOff + i] = (x[xOff + i] - mean) * scale * w[i] + b[i];
}

export class NextoPolicy {
  constructor(buffer) {
    const all = new Float32Array(buffer);
    let offset = 0;
    const take = count => { const view = all.subarray(offset, offset + count); offset += count; return view; };
    this.q0 = { w: take(D * QIN), b: take(D) };
    this.q1 = { w: take(D * D), b: take(D) };
    this.kv0 = { w: take(D * KIN), b: take(D) };
    this.kv1 = { w: take(D * D), b: take(D) };
    this.blocks = [0, 1].map(() => ({
      inW: take(3 * D * D), inB: take(3 * D),
      outW: take(D * D), outB: take(D),
      l1W: take(FF * D), l1B: take(FF),
      l2W: take(D * FF), l2B: take(D),
      n1W: take(D), n1B: take(D), n2W: take(D), n2B: take(D), n3W: take(D), n3B: take(D)
    }));
    this.a0 = { w: take(ACT * 8), b: take(ACT) };
    this.a1 = { w: take(ACT * ACT), b: take(ACT) };
    this.a2 = { w: take(ACT * ACT), b: take(ACT) };
    this.emb = { w: take(ACT * D), b: take(ACT) };
    if (offset !== all.length) throw new Error('Nexto weight file has ' + all.length + ' floats, expected ' + offset);

    // The action side does not depend on the observation, so embed all 90 actions once.
    const n = ACTION_TABLE.length;
    this.actionEmb = new Float32Array(n * ACT);
    const row = new Float32Array(8);
    const h0 = new Float32Array(ACT);
    const h1 = new Float32Array(ACT);
    for (let a = 0; a < n; a++) {
      row.set(ACTION_TABLE[a]);
      matvec(this.a0.w, this.a0.b, row, 0, h0, 0, ACT, 8, true);
      matvec(this.a1.w, this.a1.b, h0, 0, h1, 0, ACT, ACT, true);
      matvec(this.a2.w, this.a2.b, h1, 0, this.actionEmb, a * ACT, ACT, ACT, true);
    }

    this.logits = new Float32Array(n);
    this.q = new Float32Array(QIN);
    this.qe = new Float32Array(D);
    this.tmpQ = new Float32Array(D);
    this.queryNorm = new Float32Array(D);
    this.attnOut = new Float32Array(D);
    this.projected = new Float32Array(D);
    this.ffHidden = new Float32Array(FF);
    this.ffOut = new Float32Array(D);
    this.out32 = new Float32Array(ACT);
    this.scores = new Float32Array(HEADS * 64);
    this.sized = 0;
  }

  static async load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load ' + url + ' (' + response.status + ')');
    return new NextoPolicy(await response.arrayBuffer());
  }

  _size(entities) {
    if (this.sized === entities) return;
    this.sized = entities;
    this.kv = new Float32Array(entities * KIN);
    this.kve = new Float32Array(entities * D);
    this.mid = new Float32Array(D);
    this.kvNorm = new Float32Array(entities * D);
    this.keys = new Float32Array(entities * D);
    this.values = new Float32Array(entities * D);
    this.scores = new Float32Array(HEADS * entities);
  }

  /** Fill this.kv (entity rows) and this.q for the car at selfIndex, in its own team's view of the field. */
  buildObservation(world, selfIndex, prev) {
    const cars = world.cars;
    const me = cars[selfIndex];
    const orange = me.team === 1;
    const sx = orange ? -1 : 1;
    const nCars = cars.length;
    const entities = nCars + 1 + PAD_POSITIONS.length;
    this._size(entities);
    const kv = this.kv;
    kv.fill(0);

    const setVec = (row, col, v, norm) => {
      kv[row * KIN + col] = sx * v[0] / norm;
      kv[row * KIN + col + 1] = sx * v[1] / norm;
      kv[row * KIN + col + 2] = v[2] / norm;
    };

    for (let j = 0; j < nCars; j++) {
      const car = cars[j];
      const base = j * KIN;
      kv[base + IS_SELF] = j === selfIndex ? 1 : 0;
      const mate = car.team === me.team ? 1 : 0;
      kv[base + IS_MATE] = mate;
      kv[base + IS_OPP] = 1 - mate;
      setVec(j, POS, car.pos, POS_NORM);
      setVec(j, VEL, car.vel, POS_NORM);
      setVec(j, FWD, car.fwd, 1);
      setVec(j, UPV, car.up, 1);
      setVec(j, ANG, car.angvel, ANG_NORM);
      kv[base + BOOST] = car.boost / 100;
      kv[base + DEMO] = car.isDemoed ? 1 : 0;
      kv[base + ON_GROUND] = car.onGround ? 1 : 0;
      kv[base + HAS_FLIP] = car.onGround || car.canDodge ? 1 : 0;
    }

    const ballRow = nCars;
    kv[ballRow * KIN + IS_BALL] = 1;
    setVec(ballRow, POS, world.ball.pos, POS_NORM);
    setVec(ballRow, VEL, world.ball.vel, POS_NORM);
    setVec(ballRow, ANG, world.ball.angvel, ANG_NORM);

    for (let k = 0; k < PAD_POSITIONS.length; k++) {
      const row = nCars + 1 + k;
      kv[row * KIN + IS_BOOST] = 1;
      setVec(row, POS, PAD_POSITIONS[k], POS_NORM);
      kv[row * KIN + BOOST] = PAD_IS_BIG[k] ? 1 : 0.12;
      kv[row * KIN + DEMO] = world.pads[k].active ? 1 : 0;
    }

    // The query is the acting car's own row, absolute, followed by its previous action.
    const q = this.q;
    for (let c = 0; c < KIN; c++) q[c] = kv[selfIndex * KIN + c];
    for (let c = 0; c < 8; c++) q[KIN + c] = prev[c];

    // Everything else is expressed relative to the acting car: positions are offsets, and all vectors are
    // rotated about the vertical axis so that the car's forward direction is +y.
    const px = q[POS], py = q[POS + 1], pz = q[POS + 2];
    const theta = Math.atan2(q[FWD], q[FWD + 1]);
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    for (let r = 0; r < entities; r++) {
      const base = r * KIN;
      kv[base + POS] -= px;
      kv[base + POS + 1] -= py;
      kv[base + POS + 2] -= pz;
      for (const col of [POS, VEL, FWD, UPV, ANG]) {
        const x = kv[base + col];
        const y = kv[base + col + 1];
        kv[base + col] = ct * x - st * y;
        kv[base + col + 1] = st * x + ct * y;
      }
    }
    return entities;
  }

  forward(entities) {
    const { kv, kve, q } = this;
    const mid = this.mid;

    // Query and key/value embeddings.
    matvec(this.q0.w, this.q0.b, q, 0, this.tmpQ, 0, D, QIN, true);
    matvec(this.q1.w, this.q1.b, this.tmpQ, 0, this.qe, 0, D, D, true);
    for (let r = 0; r < entities; r++) {
      matvec(this.kv0.w, this.kv0.b, kv, r * KIN, mid, 0, D, KIN, true);
      matvec(this.kv1.w, this.kv1.b, mid, 0, kve, r * D, D, D, true);
    }

    const x = this.qe;
    const scale = 1 / Math.sqrt(HEAD_DIM);
    for (const block of this.blocks) {
      // Cross attention from the query to every entity, with pre-norm and a residual connection.
      layerNorm(x, 0, block.n1W, block.n1B, this.queryNorm, 0);
      for (let r = 0; r < entities; r++) layerNorm(kve, r * D, block.n2W, block.n2B, this.kvNorm, r * D);

      const Wq = block.inW.subarray(0, D * D);
      const Wk = block.inW.subarray(D * D, 2 * D * D);
      const Wv = block.inW.subarray(2 * D * D, 3 * D * D);
      const bq = block.inB.subarray(0, D);
      const bk = block.inB.subarray(D, 2 * D);
      const bv = block.inB.subarray(2 * D, 3 * D);
      const Q = this.tmpQ;
      matvec(Wq, bq, this.queryNorm, 0, Q, 0, D, D, false);
      for (let r = 0; r < entities; r++) {
        matvec(Wk, bk, this.kvNorm, r * D, this.keys, r * D, D, D, false);
        matvec(Wv, bv, this.kvNorm, r * D, this.values, r * D, D, D, false);
      }

      const scores = this.scores;
      for (let h = 0; h < HEADS; h++) {
        const off = h * HEAD_DIM;
        let top = -Infinity;
        for (let r = 0; r < entities; r++) {
          let s = 0;
          for (let i = 0; i < HEAD_DIM; i++) s += Q[off + i] * this.keys[r * D + off + i];
          s *= scale;
          scores[h * entities + r] = s;
          if (s > top) top = s;
        }
        let total = 0;
        for (let r = 0; r < entities; r++) {
          const e = Math.exp(scores[h * entities + r] - top);
          scores[h * entities + r] = e;
          total += e;
        }
        for (let i = 0; i < HEAD_DIM; i++) this.attnOut[off + i] = 0;
        for (let r = 0; r < entities; r++) {
          const w = scores[h * entities + r] / total;
          for (let i = 0; i < HEAD_DIM; i++) this.attnOut[off + i] += w * this.values[r * D + off + i];
        }
      }
      matvec(block.outW, block.outB, this.attnOut, 0, this.projected, 0, D, D, false);
      for (let i = 0; i < D; i++) x[i] += this.projected[i];

      // Feed-forward with pre-norm and a residual connection.
      layerNorm(x, 0, block.n3W, block.n3B, this.queryNorm, 0);
      matvec(block.l1W, block.l1B, this.queryNorm, 0, this.ffHidden, 0, FF, D, true);
      matvec(block.l2W, block.l2B, this.ffHidden, 0, this.ffOut, 0, D, FF, false);
      for (let i = 0; i < D; i++) x[i] += this.ffOut[i];
    }

    // ReLU, project to the action embedding size and score every action by dot product.
    for (let i = 0; i < D; i++) if (x[i] < 0) x[i] = 0;
    matvec(this.emb.w, this.emb.b, x, 0, this.out32, 0, ACT, D, false);
    const n = ACTION_TABLE.length;
    for (let a = 0; a < n; a++) {
      let s = 0;
      for (let k = 0; k < ACT; k++) s += this.actionEmb[a * ACT + k] * this.out32[k];
      this.logits[a] = s;
    }
    return this.logits;
  }

  /**
   * Choose an action index. Same contract as WhiskersPolicy.decide: temperature 0 is greedy, higher values
   * sample from softmax(logits / temperature).
   */
  decide(world, selfIndex, prev, temperature) {
    const entities = this.buildObservation(world, selfIndex, prev);
    const logits = this.forward(entities);
    const n = ACTION_TABLE.length;
    if (!(temperature > 0)) {
      let best = 0;
      for (let i = 1; i < n; i++) if (logits[i] > logits[best]) best = i;
      return best;
    }
    let top = -Infinity;
    for (let i = 0; i < n; i++) if (logits[i] > top) top = logits[i];
    let total = 0;
    const weights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      weights[i] = Math.exp((logits[i] - top) / temperature);
      total += weights[i];
    }
    let pick = Math.random() * total;
    for (let i = 0; i < n; i++) {
      pick -= weights[i];
      if (pick <= 0) return i;
    }
    return n - 1;
  }
}
