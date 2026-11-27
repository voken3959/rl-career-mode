// Match driver for the Rocket League-scale engine: runs the physics at 120 Hz and lets the Whiskers policy
// drive every car, deciding every 8 ticks (15 Hz) like it was trained.

import { RLEngine } from './engine.js';
import { WhiskersPolicy, ACTION_TABLE } from './whiskers.js';
import { NextoPolicy } from './nexto.js';
import { FIELD_Y, DT } from './constants.js';
import { AirDribble, canStart, airControls } from './airdribble.js';
import { Rotation } from './rotation.js';
import { CircleGuard } from './circleguard.js';
import { GroundDribble, canStartGround, groundControls } from './dribble.js';
import { landingAssist, rightingRoll } from './recovery.js';

/** Metres-ish scene units per Unreal unit: the 10240 uu long arena becomes 120 scene units. */
export const SCENE_SCALE = 60 / FIELD_Y;

// The network is one strong player. Lower tiers are made weaker in five ways, all scaled by rank
// (these numbers are starting guesses to tune by playing):
//   temperature - how loosely it picks among the network's preferred actions. Nobody plays greedily, so even Pro
//                 samples and every game differs
//   period      - physics ticks (at 120 Hz) between its decisions: strong players decide faster
//   lapse       - chance per decision of a few random inputs (a whiff, a bad touch)
//   misread     - how far (in uu) it can misjudge the ball's position; the error drifts, which produces missed
//                 challenges and poor passes
//   speedCap    - top car speed in uu/s. Everyone is held below the game's 2300 so play does not look frantic;
//                 higher ranks win through faster decisions and better reads rather than raw speed
//   bot         - 'nexto' uses the Nexto network (needs rl/nexto.bin), otherwise Whiskers
//   rotation    - how reliably it holds a covering position when it is not the one on the ball (0 never, 1 always)
//   recovery    - chance per jump that it air-rolls to line the wheels up for landing and flips back over when stuck
//   carry       - how willing it is to dribble the ball along the ground (0 never, 1 whenever it can)
//   air         - how willing it is to try a scripted air dribble (0 never, 1 almost whenever it can). None up to
//                 Platinum, then rising each rank
export const TIER_SETTINGS = {
  bronze:        { carry: 0.25, recovery: 0.1, temperature: 3.0,  period: 24, lapse: 0.12,  misread: 600, speedCap: 900,  air: 0, rotation: 0 },
  silver:        { carry: 0.35, recovery: 0.25, temperature: 2.3,  period: 20, lapse: 0.09,  misread: 450, speedCap: 1000, air: 0, rotation: 0.2 },
  gold:          { carry: 0.5, recovery: 0.45, temperature: 1.8,  period: 16, lapse: 0.07,  misread: 330, speedCap: 1150, air: 0, rotation: 0.4 },
  platinum:      { carry: 0.65, recovery: 0.6, temperature: 1.4,  period: 12, lapse: 0.05,  misread: 250, speedCap: 1300, air: 0, rotation: 0.55 },
  diamond:       { carry: 0.75, recovery: 0.75, temperature: 1.1,  period: 10, lapse: 0.04,  misread: 180, speedCap: 1400, air: 0.3, rotation: 0.7 },
  champion:      { carry: 0.85, recovery: 0.85, temperature: 0.9,  period: 8,  lapse: 0.03,  misread: 130, speedCap: 1500, air: 0.5, rotation: 0.8 },
  grandchampion: { carry: 0.9, recovery: 0.92, temperature: 0.7,  period: 7,  lapse: 0.02,  misread: 90,  speedCap: 1600, air: 0.7, rotation: 0.9 },
  ssl:           { carry: 0.95, recovery: 0.97, temperature: 0.55, period: 6,  lapse: 0.015, misread: 50,  speedCap: 1650, air: 0.9, rotation: 0.95 },
  // Pro is the Nexto network playing as it was trained: full speed, low sampling temperature and none of the scripted
  // ground-dribble / rotation takeovers, which were replacing its touches with cruder ones. Only a light air-dribble
  // helper and the landing assist remain.
  pro:           { carry: 0, recovery: 1, temperature: 0.15, period: 8,  lapse: 0.003, misread: 6,   speedCap: 2300, air: 0.4, bot: 'nexto', rotation: 0 }
};

export class RLMatch {
  constructor(tier, perTeam = 2) {
    this.policy = null;
    this.nexto = null;
    this.tierName = tier;
    this.initCars(perTeam);
    this.setTier(tier);
  }

  /** (Re)build the engine and all per-car state for perTeam cars on each side. The networks are kept. */
  initCars(perTeam) {
    this.perTeam = perTeam;
    this.engine = new RLEngine(perTeam);
    this.prev = this.engine.cars.map(() => new Float32Array(8));
    this.controls = this.engine.cars.map(() => ({}));
    this.tickCount = 0;
    this.error = this.engine.cars.map(() => [0, 0, 0]);
    this.lapseLeft = this.engine.cars.map(() => 0);
    this.lapseAction = this.engine.cars.map(() => 0);
    this.air = this.engine.cars.map(() => new AirDribble());
    this.ground = this.engine.cars.map(() => new GroundDribble());
    this.rotation = new Rotation(this.engine.cars.length);
    this.guard = new CircleGuard(this.engine.cars.length);
    this.wasGround = this.engine.cars.map(() => true);
    this.assistOn = this.engine.cars.map(() => false);
    this.flipTicks = this.engine.cars.map(() => 0);
    this.final = this.engine.cars.map(() => ({}));
  }

  /** Switch to 1v1, 2v2 or 3v3. */
  resize(perTeam) {
    this.initCars(perTeam);
    this.setTier(this.tierName);
  }

  setTier(tier) {
    this.tierName = tier;
    this.settings = TIER_SETTINGS[tier] || TIER_SETTINGS.bronze;
    if (this.engine) this.engine.cars.forEach(car => { car.speedCap = this.settings.speedCap; });
  }

  async loadPolicy(url) {
    this.policy = await WhiskersPolicy.load(url);
  }

  /** Nexto (Grand Champion level, CC BY-NC-SA) drives the tiers marked bot: 'nexto'. Optional; falls back to Whiskers. */
  async loadNexto(url) {
    this.nexto = await NextoPolicy.load(url);
  }

  /** Reset to a fresh kickoff. */
  reset() {
    this.engine.resetKickoff();
    this.tickCount = 0;
    this.prev.forEach(p => p.fill(0));
    this.error.forEach(e => { e[0] = e[1] = e[2] = 0; });
    this.lapseLeft.fill(0);
    this.air.forEach(a => a.end(2));
    this.ground.forEach(g => g.end(2));
    this.rotation.reset();
    this.guard.reset();
    this.wasGround.fill(true);
    this.assistOn.fill(false);
    this.flipTicks.fill(0);
    this.setTier(this.tierName);
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
      const brain = this.settings.bot === 'nexto' && this.nexto ? this.nexto : this.policy;
      action = brain.decide(world, i, this.prev[i], temperature);
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
    const cars = this.engine.cars;
    if (this.policy) {
      // Each car decides on its own tick so only about one network pass runs per frame.
      const period = this.settings.period;
      const spread = Math.max(1, Math.floor(period / cars.length));
      for (let i = 0; i < cars.length; i++) {
        const dribble = this.air[i];
        const carry = this.ground[i];
        if (dribble.cooldown > 0) dribble.cooldown -= DT;
        if (carry.cooldown > 0) carry.cooldown -= DT;
        if (dribble.active || carry.active) continue;
        if ((this.tickCount + i * spread) % period === 0) {
          // Maybe start an air dribble or a ground dribble instead of asking the network.
          if (dribble.cooldown <= 0 && Math.random() < Math.min(1, this.settings.air * 1.2) && canStart(this.engine, i)) {
            dribble.begin();
          } else if (carry.cooldown <= 0 && Math.random() < this.settings.carry * 0.6 && canStartGround(this.engine, i)) {
            carry.begin();
          } else {
            this.decideCar(i);
          }
        }
      }
      // Ground dribbles drive every tick too.
      for (let i = 0; i < cars.length; i++) {
        const carry = this.ground[i];
        if (!carry.active) continue;
        const ctl = groundControls(this.engine, i, carry, this.error[i]);
        if (ctl) this.controls[i] = ctl;
        else this.decideCar(i);
      }
      // Active dribbles steer every tick, because aerial control needs a faster loop than the network's.
      for (let i = 0; i < cars.length; i++) {
        const dribble = this.air[i];
        if (!dribble.active) continue;
        const ctl = airControls(this.engine, i, dribble, this.error[i]);
        if (ctl) this.controls[i] = ctl;
        else this.decideCar(i);
      }
    }
    // Team positioning: every few ticks reassign roles, then drive out-of-position supporters back.
    if (this.policy) {
      if (this.tickCount % 8 === 0) this.rotation.update(this.engine, this.settings.rotation);
      if (this.tickCount % 4 === 0) {
        for (let i = 0; i < cars.length; i++) {
          if (this.rotation.override[i] && !this.air[i].active && !this.ground[i].active) this.rotation.drive(this.engine, i, this.settings.speedCap);
        }
      }
      for (let i = 0; i < cars.length; i++) {
        if (this.rotation.override[i] && !this.air[i].active && !this.ground[i].active) this.controls[i] = this.rotation.controls[i];
      }
    }
    // Anti-circling: a car that keeps spinning round without getting anywhere is sent at the ball (or back to its
    // covering spot) with arrival-aware driving for a moment, and any scripted dribble it was in is dropped.
    if (this.policy) {
      const ball = this.engine.ball;
      for (const i of this.guard.sample(this.engine, this.tickCount)) {
        this.air[i].end(4);
        this.ground[i].end(5);
      }
      for (let i = 0; i < cars.length; i++) {
        if (this.guard.until[i] <= this.engine.time) continue;
        if (!cars[i].onGround || cars[i].isDemoed) { this.guard.until[i] = 0; continue; }
        if (this.rotation.chaser[i]) {
          this.rotation.target[i] = [ball.pos[0] + ball.vel[0] * 0.3, ball.pos[1] + ball.vel[1] * 0.3];
          this.rotation.arrive[i] = 350;
        }
        if (this.tickCount % 4 === 0) this.rotation.drive(this.engine, i, this.settings.speedCap);
        if (this.rotation.done[i]) this.guard.until[i] = 0;
        else if (this.rotation.controls[i].steer !== undefined) this.controls[i] = this.rotation.controls[i];
      }
    }
    this.engine.tick(this.recover());
    this.tickCount++;
  }

  /** Air-roll layer: landing assist and getting back onto the wheels. Returns the controls to actually apply. */
  recover() {
    const cars = this.engine.cars;
    const chance = this.settings.recovery || 0;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const ctl = this.controls[i];
      this.final[i] = ctl;
      if (car.isDemoed || car.onGround) {
        this.wasGround[i] = true;
        this.flipTicks[i] = 0;
        continue;
      }
      if (this.wasGround[i]) { this.assistOn[i] = Math.random() < chance; this.wasGround[i] = false; }
      if (!this.assistOn[i] || car.isFlipping || this.air[i].active) continue;

      // Stuck on its roof or side with the flip back: jump while rolling the right way to flip over.
      if (this.flipTicks[i] > 0 || (car.contactNow && car.up[2] < -0.3 && car.canDodge && car.surfaceTime > 0.5)) {
        if (this.flipTicks[i] === 0) this.flipTicks[i] = 4;
        this.flipTicks[i]--;
        this.final[i] = { ...ctl, jump: this.flipTicks[i] > 1, roll: rightingRoll(car), pitch: 0, yaw: 0, boost: false };
        continue;
      }
      // Coming down (or tumbling near a surface): roll and pitch the wheels toward whatever is below.
      const falling = car.vel[2] < 0 || car.up[2] < 0.5;
      const ballNear = Math.hypot(this.engine.ball.pos[0] - car.pos[0], this.engine.ball.pos[1] - car.pos[1], this.engine.ball.pos[2] - car.pos[2]) < 450;
      if (falling && !ballNear && !ctl.jump) {
        const a = landingAssist(car);
        if (a) this.final[i] = { ...ctl, pitch: a.pitch, roll: a.roll, yaw: a.yaw };
      }
    }
    return this.final;
  }

  /** One line per car describing the scripted dribbles, for the ?debug overlay. */
  debugText() {
    return this.air.map((a, i) => `car ${i + 1}  air: ${a.active ? a.phase + ' ' + a.timer.toFixed(1) + 's' : 'idle'}  starts ${a.starts || 0}  last: ${a.last || '-'}  boost ${Math.round(this.engine.cars[i].boost)}  ground: ${this.ground[i].active ? 'on' : 'off'}`).join('\n');
  }

  /** Stop the cars acting but keep the physics running (used after a goal). */
  idle() {
    this.controls = this.engine.cars.map(() => ({}));
    this.engine.tick(this.controls);
  }
}
