// Match driver for the Rocket League-scale engine: runs the physics at 120 Hz and lets the Whiskers policy
// drive every car, deciding every 8 ticks (15 Hz) like it was trained.

import { RLEngine } from './engine.js';
import { WhiskersPolicy, ACTION_TABLE } from './whiskers.js';
import { FIELD_Y } from './constants.js';

/** Metres-ish scene units per Unreal unit: the 10240 uu long arena becomes 120 scene units. */
export const SCENE_SCALE = 60 / FIELD_Y;

// The network is one strong player. Lower tiers are made by sampling its actions with a higher temperature
// (more mistakes) and by letting it react less often (it holds each action for `hold` decisions).
// These numbers are starting guesses to be tuned by playing.
// Nobody plays greedily, so even the top tier samples (temperature above 0) and every game differs.
// Three kinds of mistake scale with the tier:
//   temperature - how loosely it picks among the network's preferred actions
//   lapse       - chance per decision of a few random inputs (a whiff, a bad touch)
//   misread     - how far (in uu) it can misjudge the ball's position; the error drifts and is bigger for weaker tiers,
//                 which produces missed challenges and poor passes
export const TIER_SETTINGS = {
  bronze:        { temperature: 3.0,  hold: 3, lapse: 0.12,  misread: 600 },
  silver:        { temperature: 2.3,  hold: 3, lapse: 0.09,  misread: 450 },
  gold:          { temperature: 1.8,  hold: 2, lapse: 0.07,  misread: 330 },
  platinum:      { temperature: 1.4,  hold: 2, lapse: 0.05,  misread: 250 },
  diamond:       { temperature: 1.1,  hold: 1, lapse: 0.04,  misread: 180 },
  champion:      { temperature: 0.9,  hold: 1, lapse: 0.03,  misread: 130 },
  grandchampion: { temperature: 0.7,  hold: 1, lapse: 0.02,  misread: 90 },
  ssl:           { temperature: 0.55, hold: 1, lapse: 0.015, misread: 60 },
  pro:           { temperature: 0.45, hold: 1, lapse: 0.012, misread: 40 }
};

const DECISION_TICKS = 8;

export class RLMatch {
  constructor(tier) {
    this.engine = new RLEngine(2);
    this.policy = null;
    this.setTier(tier);
    this.prev = this.engine.cars.map(() => new Float32Array(8));
    this.controls = this.engine.cars.map(() => ({}));
    this.tickCount = 0;
    this.error = this.engine.cars.map(() => [0, 0, 0]);
    this.lapseLeft = this.engine.cars.map(() => 0);
    this.lapseAction = this.engine.cars.map(() => 0);
  }

  setTier(tier) {
    this.settings = TIER_SETTINGS[tier] || TIER_SETTINGS.bronze;
  }

  async loadPolicy(url) {
    this.policy = await WhiskersPolicy.load(url);
  }

  /** Reset to a fresh kickoff. */
  reset() {
    this.engine.resetKickoff();
    this.tickCount = 0;
    this.prev.forEach(p => p.fill(0));
    this.error.forEach(e => { e[0] = e[1] = e[2] = 0; });
    this.lapseLeft.fill(0);
    this.controls = this.engine.cars.map(() => ({}));
  }

  decideCar(i) {
    const { temperature, lapse, misread } = this.settings;

    // The car sees the ball where it thinks it is: the true position plus a slowly drifting error.
    const error = this.error[i];
    const ball = this.engine.ball;
    for (let k = 0; k < 3; k++) {
      const limit = k === 2 ? misread * 0.4 : misread;
      error[k] = Math.max(-limit, Math.min(limit, error[k] * 0.9 + (Math.random() - 0.5) * misread * 0.5));
    }
    const seenBall = {
      pos: [ball.pos[0] + error[0], ball.pos[1] + error[1], Math.max(92, ball.pos[2] + error[2])],
      vel: ball.vel,
      angvel: ball.angvel
    };
    const world = { ball: seenBall, pads: this.engine.pads, cars: this.engine.cars };

    let action;
    if (this.lapseLeft[i] > 0) {
      this.lapseLeft[i]--;
      action = this.lapseAction[i];
    } else if (Math.random() < lapse) {
      // A lapse: a random input held for one to three decisions.
      this.lapseLeft[i] = Math.floor(Math.random() * 3);
      this.lapseAction[i] = Math.floor(Math.random() * ACTION_TABLE.length);
      action = this.lapseAction[i];
    } else {
      action = this.policy.decide(world, i, this.prev[i], temperature);
    }
    const row = ACTION_TABLE[action];
    this.prev[i].set(row);
    this.controls[i] = {
      throttle: row[0], steer: row[1], pitch: row[2], yaw: row[3],
      roll: row[4], jump: row[5] === 1, boost: row[6] === 1, handbrake: row[7] === 1
    };
  }

  /** One 1/120 s physics tick. With no policy loaded yet the cars sit still. */
  tick() {
    if (this.policy) {
      // Each car decides on its own tick (2 ticks apart) so only one network pass runs per frame.
      const period = DECISION_TICKS * this.settings.hold;
      for (let i = 0; i < this.engine.cars.length; i++) {
        if ((this.tickCount + i * 2) % period === 0) this.decideCar(i);
      }
    }
    this.engine.tick(this.controls);
    this.tickCount++;
  }

  /** Stop the cars acting but keep the physics running (used after a goal). */
  idle() {
    this.controls = this.engine.cars.map(() => ({}));
    this.engine.tick(this.controls);
  }
}
