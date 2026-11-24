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
export const TIER_SETTINGS = {
  bronze:        { temperature: 3.0, hold: 3 },
  silver:        { temperature: 2.3, hold: 3 },
  gold:          { temperature: 1.8, hold: 2 },
  platinum:      { temperature: 1.4, hold: 2 },
  diamond:       { temperature: 1.1, hold: 1 },
  champion:      { temperature: 0.8, hold: 1 },
  grandchampion: { temperature: 0.5, hold: 1 },
  ssl:           { temperature: 0.25, hold: 1 },
  pro:           { temperature: 0, hold: 1 }
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
    this.controls = this.engine.cars.map(() => ({}));
  }

  decideCar(i) {
    const world = { ball: this.engine.ball, pads: this.engine.pads, cars: this.engine.cars };
    const action = this.policy.decide(world, i, this.prev[i], this.settings.temperature);
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
