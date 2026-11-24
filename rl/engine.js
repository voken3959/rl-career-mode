// Rocket League-scale physics for the 3D match viewer.
//
// This is a compact re-implementation written for this project, not a port of RocketSim. It follows the
// published Rocket League handling model (throttle and steering curves, boost, jump and flip impulses, air
// control rates, ball-hit impulse) closely enough that a policy trained in RocketSim, such as Whiskers V5,
// can drive it. Constants were filled in from community documentation of the game's physics; they are the
// first thing to tune if the cars do not feel right.
//
// World: right-handed, z up, blue defends -y. Cars and the ball are rigid bodies; every vector is a plain
// [x, y, z] array. One tick is 1/120 s.

import {
  FIELD_X, FIELD_Y, FIELD_Z, GOAL_HALF_WIDTH, GOAL_HEIGHT, GOAL_DEPTH, CORNER_RADIUS, RAMP_RADIUS,
  GRAVITY, DT, BALL_RADIUS, BALL_MASS, BALL_MAX_SPEED, BALL_MAX_ANG, BALL_DRAG, BALL_RESTITUTION,
  BALL_FRICTION, CAR_MASS, CAR_MAX_SPEED, SUPERSONIC_START, CAR_MAX_ANG, CAR_REST_HEIGHT, HITBOX_HALF,
  HITBOX_OFFSET, BOOST_MAX, BOOST_USE_RATE, BOOST_ACCEL, DODGE_WINDOW, PAD_POSITIONS, PAD_IS_BIG, NUM_PADS
} from './constants.js';

/* ------------------------------ vector helpers ------------------------------ */

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(a[0], a[1], a[2]);
const normalize = (a, fallback = [0, 0, 1]) => {
  const l = length(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Rotate v about the unit axis by angle (Rodrigues).
function rotateAround(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot(axis, v) * (1 - c);
  const x = cross(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * d, v[1] * c + x[1] * s + axis[1] * d, v[2] * c + x[2] * s + axis[2] * d];
}

function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const t = (x - table[i - 1][0]) / (table[i][0] - table[i - 1][0]);
      return table[i - 1][1] + (table[i][1] - table[i - 1][1]) * t;
    }
  }
  return table[table.length - 1][1];
}

/* ------------------------------ arena ------------------------------ */

// Distance from a point to the arena surface, positive inside. The main arena is a box with rounded vertical
// corners and curved floor and ceiling edges. The two goals are boxes behind the back walls.
function edgeDistance(u, v, r) {
  if (u < r && v < r) return r - Math.hypot(r - u, r - v);
  return Math.min(u, v);
}

function mainDistance(x, y, z) {
  const qx = Math.abs(x) - (FIELD_X - CORNER_RADIUS);
  const qy = Math.abs(y) - (FIELD_Y - CORNER_RADIUS);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  const wall = CORNER_RADIUS - outside - inside;
  return Math.min(edgeDistance(wall, z, RAMP_RADIUS), edgeDistance(wall, FIELD_Z - z, RAMP_RADIUS));
}

function goalDistance(x, y, z) {
  return Math.min(GOAL_HALF_WIDTH - Math.abs(x), GOAL_HEIGHT - z, z, FIELD_Y + GOAL_DEPTH - Math.abs(y));
}

// The goal mouth is a hole in the back wall. Points inside the mouth use the goal box so the ball can enter.
function inGoalZone(x, y, z) {
  return Math.abs(x) < GOAL_HALF_WIDTH && z < GOAL_HEIGHT && Math.abs(y) > FIELD_Y - 120;
}

function distanceAt(zone, x, y, z) {
  return zone ? goalDistance(x, y, z) : mainDistance(x, y, z);
}

/** Signed distance to the arena surface and the inward unit normal at that point. */
export function arenaQuery(x, y, z) {
  const zone = inGoalZone(x, y, z);
  const d = distanceAt(zone, x, y, z);
  // Callers only use the normal near a surface, so skip the six extra distance evaluations when far away.
  if (d > 150) return { d, n: [0, 0, 1] };
  const e = 2;
  const n = normalize([
    distanceAt(zone, x + e, y, z) - distanceAt(zone, x - e, y, z),
    distanceAt(zone, x, y + e, z) - distanceAt(zone, x, y - e, z),
    distanceAt(zone, x, y, z + e) - distanceAt(zone, x, y, z - e)
  ]);
  return { d, n };
}

/* ------------------------------ car data ------------------------------ */

const WHEELS = [[51, 30, -CAR_REST_HEIGHT], [51, -30, -CAR_REST_HEIGHT], [-34, 30, -CAR_REST_HEIGHT], [-34, -30, -CAR_REST_HEIGHT]];
const WHEELBASE = 85;
const STEER_TABLE = [[0, 0.53356], [500, 0.3193], [1000, 0.18203], [1500, 0.1057], [1750, 0.08507], [3000, 0.03454]];
const HIT_FACTOR_TABLE = [[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.3]];

const THROTTLE_ACCEL = 1600;
const THROTTLE_MAX_SPEED = 1410;
const BRAKE_ACCEL = 3500;
const COAST_DECEL = 525;
const JUMP_IMPULSE = 292;
const JUMP_HOLD_ACCEL = 1458.333;
const JUMP_HOLD_MAX = 0.2;
const FLIP_IMPULSE = 500;
const FLIP_TIME = 0.65;
// Air control: angular acceleration per unit input and damping per axis (roll, pitch, yaw).
const AIR_ROLL = 36.08;
const AIR_PITCH = 12.146;
const AIR_YAW = 8.92;
const DAMP_ROLL = 4.472;
const DAMP_PITCH = 2.798;
const DAMP_YAW = 1.886;

export function newCar(team) {
  return {
    team,                       // 0 blue, 1 orange
    present: true,
    pos: [0, 0, CAR_REST_HEIGHT],
    vel: [0, 0, 0],
    angvel: [0, 0, 0],
    fwd: [0, 1, 0],
    up: [0, 0, 1],
    boost: 33.333,
    onGround: true,
    hasJumped: false,
    hasDoubleJumped: false,
    hasFlipped: false,
    isJumping: false,
    isFlipping: false,
    canDodge: false,
    dodgeTimeLeft: 0,
    isSupersonic: false,
    isDemoed: false,
    demoTimeLeft: 0,
    // internal
    yawRate: 0,
    jumpTimer: 0,
    timeSinceJump: 0,
    flipTimer: 0,
    flipLocal: [0, 0],
    leaveTimer: 0,
    jumpHeldPrev: false,
    touchingBall: false,
    boosting: false,
    lastTouchTime: -999
  };
}

// Same convention as the bot's observations: right = up x forward. Positive yaw, steer and roll input
// turn toward it, positive angular velocity about 'up' is a turn toward it.
const carRight = car => cross(car.up, car.fwd);
const localPoint = (car, right, p) => [
  car.pos[0] + car.fwd[0] * p[0] + right[0] * p[1] + car.up[0] * p[2],
  car.pos[1] + car.fwd[1] * p[0] + right[1] * p[1] + car.up[1] * p[2],
  car.pos[2] + car.fwd[2] * p[0] + right[2] * p[1] + car.up[2] * p[2]
];

function hitboxCenter(car, right) {
  return localPoint(car, right, HITBOX_OFFSET);
}

function canDodgeNow(car) {
  return !car.hasDoubleJumped && !car.hasFlipped && car.timeSinceJump < DODGE_WINDOW;
}

function landCar(car) {
  car.hasJumped = false;
  car.hasDoubleJumped = false;
  car.hasFlipped = false;
  car.isJumping = false;
  car.isFlipping = false;
  car.flipTimer = 0;
  car.timeSinceJump = 0;
  car.jumpTimer = 0;
}

function updateFlags(car) {
  const speed = length(car.vel);
  car.isSupersonic = car.isSupersonic ? speed > SUPERSONIC_START - 50 : speed >= SUPERSONIC_START;
  car.canDodge = !car.onGround && canDodgeNow(car);
  car.dodgeTimeLeft = car.canDodge ? Math.max(0, DODGE_WINDOW - car.timeSinceJump) : 0;
}

/* ------------------------------ car dynamics ------------------------------ */

function stepCar(car, ctl, dt) {
  const jumpPressed = !!ctl.jump && !car.jumpHeldPrev;
  car.jumpHeldPrev = !!ctl.jump;
  if (car.leaveTimer > 0) car.leaveTimer -= dt;

  // Find the lowest wheel to see whether the car is resting on a surface.
  let right = carRight(car);
  let lowest = null;
  for (const wheel of WHEELS) {
    const p = localPoint(car, right, wheel);
    const q = arenaQuery(p[0], p[1], p[2]);
    if (!lowest || q.d < lowest.d) lowest = q;
  }
  const grounded = car.leaveTimer <= 0 && lowest.d <= 3 && dot(car.up, lowest.n) > 0.35 && lowest.n[2] > -0.3;

  const boosting = !!ctl.boost && car.boost > 0;
  car.boosting = boosting;
  if (boosting) car.boost = Math.max(0, car.boost - BOOST_USE_RATE * dt);

  if (grounded) {
    if (!car.onGround) landCar(car);
    car.onGround = true;
    const n = lowest.n;

    // Settle onto the surface: align the car with it and put the lowest wheel on it.
    car.up = normalize(add(car.up, mul(sub(n, car.up), Math.min(1, 18 * dt))));
    car.fwd = normalize(sub(car.fwd, mul(car.up, dot(car.fwd, car.up))), [0, 1, 0]);
    car.pos = sub(car.pos, mul(n, lowest.d));
    car.vel = sub(car.vel, mul(n, dot(car.vel, n)));

    // Throttle, brake, coast and boost along the car's forward direction.
    const vf = dot(car.vel, car.fwd);
    const throttle = ctl.throttle || 0;
    let accel = 0;
    if (Math.abs(throttle) > 0.01) {
      accel = vf * throttle >= 0
        ? throttle * THROTTLE_ACCEL * Math.max(0, 1 - Math.abs(vf) / THROTTLE_MAX_SPEED)
        : throttle * BRAKE_ACCEL;
    } else {
      accel = -Math.sign(vf) * COAST_DECEL;
    }
    let vfNew = vf + accel * dt;
    if (Math.abs(throttle) <= 0.01 && vf * vfNew < 0) vfNew = 0;
    if (boosting) vfNew += BOOST_ACCEL * dt;
    car.vel = add(car.vel, mul(car.fwd, vfNew - vf));

    // Steering turns the car at a rate set by the steer angle for its speed, and carries the velocity round.
    const vfNow = dot(car.vel, car.fwd);
    const angle = lerpTable(STEER_TABLE, Math.abs(vfNow)) * (ctl.handbrake ? 1.5 : 1);
    const targetYaw = vfNow * Math.tan(angle * (ctl.steer || 0)) / WHEELBASE;
    car.yawRate += (targetYaw - car.yawRate) * Math.min(1, 16 * dt);
    const turn = car.yawRate * dt;
    car.fwd = rotateAround(car.fwd, car.up, turn);
    car.vel = rotateAround(car.vel, car.up, turn * (ctl.handbrake ? 0.15 : 1));

    // Sideways grip: strong normally, almost none during a handbrake slide.
    const side = cross(car.fwd, car.up);
    const slip = dot(car.vel, side);
    car.vel = sub(car.vel, mul(side, slip * (1 - Math.exp(-(ctl.handbrake ? 1.2 : 14) * dt))));

    // Gravity along the surface (zero on the floor, pulls the car down a wall).
    const g = [0, 0, -GRAVITY];
    car.vel = add(car.vel, mul(sub(g, mul(n, dot(g, n))), dt));
    car.angvel = mul(car.up, car.yawRate);

    if (jumpPressed) {
      car.vel = add(car.vel, mul(car.up, JUMP_IMPULSE));
      car.isJumping = true;
      car.jumpTimer = 0;
      car.hasJumped = true;
      car.timeSinceJump = 0;
      car.leaveTimer = 0.08;
      car.onGround = false;
    }
  } else {
    car.onGround = false;
    car.yawRate = 0;
    car.timeSinceJump += dt;

    // Holding jump extends the first jump for a short time.
    if (car.isJumping) {
      if (ctl.jump && car.jumpTimer < JUMP_HOLD_MAX) {
        car.vel = add(car.vel, mul(car.up, JUMP_HOLD_ACCEL * dt));
        car.jumpTimer += dt;
      } else if (!ctl.jump && car.jumpTimer >= 0.025) {
        car.isJumping = false;
      }
      if (car.jumpTimer >= JUMP_HOLD_MAX) car.isJumping = false;
    }

    // A second press is a double jump with no direction input, or a flip with one.
    if (jumpPressed && canDodgeNow(car)) {
      const dirIn = [-(ctl.pitch || 0), ctl.roll || 0];
      const magnitude = Math.hypot(dirIn[0], dirIn[1]);
      car.hasJumped = true;
      if (magnitude < 0.1) {
        car.vel = add(car.vel, mul(car.up, JUMP_IMPULSE));
        car.hasDoubleJumped = true;
      } else {
        const d = [dirIn[0] / magnitude, dirIn[1] / magnitude];
        const flatFwd = normalize([car.fwd[0], car.fwd[1], 0], [0, 1, 0]);
        const flatRight = [-flatFwd[1], flatFwd[0], 0];
        const vf = dot(car.vel, flatFwd);
        const ratio = Math.min(1, Math.abs(vf) / CAR_MAX_SPEED);
        let impulseForward = FLIP_IMPULSE * d[0];
        if (d[0] * vf >= 0) impulseForward *= 1 + 0.9 * ratio;
        const impulseSide = FLIP_IMPULSE * d[1] * 0.9;
        car.vel = add(car.vel, add(mul(flatFwd, impulseForward), mul(flatRight, impulseSide)));
        car.hasFlipped = true;
        car.isFlipping = true;
        car.isJumping = false;
        car.flipTimer = 0;
        car.flipLocal = d;
      }
    }

    car.vel[2] -= GRAVITY * dt;
    if (boosting) car.vel = add(car.vel, mul(car.fwd, BOOST_ACCEL * dt));

    right = carRight(car);
    if (car.isFlipping) {
      car.flipTimer += dt;
      if (car.flipTimer < FLIP_TIME) {
        // The flip spins the car about the axis perpendicular to the flip direction. Pitching the opposite
        // way during the flip cancels its pitch rotation.
        const d = car.flipLocal;
        let cancel = 0;
        if (Math.abs(d[0]) > 0.1) cancel = clamp((ctl.pitch || 0) * Math.sign(d[0]), 0, 1);
        const wRight = CAR_MAX_ANG * d[0] * (1 - cancel);
        const wFwd = -CAR_MAX_ANG * d[1];
        car.angvel = add(mul(right, wRight), mul(car.fwd, wFwd));
        // The flip also bleeds off some vertical speed early on.
        if (car.flipTimer < 0.2) car.vel[2] *= Math.pow(0.5, dt / 0.2);
      } else {
        car.isFlipping = false;
      }
    } else {
      const pitch = ctl.pitch || 0;
      const roll = ctl.roll || 0;
      const yaw = ctl.yaw || 0;
      let wF = dot(car.angvel, car.fwd);
      let wR = dot(car.angvel, right);
      let wU = dot(car.angvel, car.up);
      wR += (-pitch * AIR_PITCH - DAMP_PITCH * wR * (1 - Math.abs(pitch))) * dt;
      wF += (-roll * AIR_ROLL - DAMP_ROLL * wF * (1 - Math.abs(roll))) * dt;
      wU += (yaw * AIR_YAW - DAMP_YAW * wU * (1 - Math.abs(yaw))) * dt;
      car.angvel = add(add(mul(car.fwd, wF), mul(right, wR)), mul(car.up, wU));
    }
    const spin = length(car.angvel);
    if (spin > CAR_MAX_ANG) car.angvel = mul(car.angvel, CAR_MAX_ANG / spin);

    // Turn the car by its angular velocity.
    if (spin > 1e-6) {
      const axis = mul(car.angvel, 1 / length(car.angvel));
      const angle = length(car.angvel) * dt;
      car.fwd = rotateAround(car.fwd, axis, angle);
      car.up = rotateAround(car.up, axis, angle);
      car.up = normalize(sub(car.up, mul(car.fwd, dot(car.up, car.fwd))));
      car.fwd = normalize(car.fwd, [0, 1, 0]);
    }
  }

  // Speed limit and movement.
  const speed = length(car.vel);
  if (speed > CAR_MAX_SPEED) car.vel = mul(car.vel, CAR_MAX_SPEED / speed);
  car.pos = add(car.pos, mul(car.vel, dt));

  // Keep the body out of the walls. Wheels are checked always, the roof and corners only in the air.
  right = carRight(car);
  const probes = grounded ? [] : WHEELS.concat(hitboxCorners());
  for (const probe of probes) {
    const p = localPoint(car, right, probe);
    const q = arenaQuery(p[0], p[1], p[2]);
    if (q.d < 0) {
      car.pos = sub(car.pos, mul(q.n, q.d));
      const vn = dot(car.vel, q.n);
      if (vn < 0) car.vel = sub(car.vel, mul(q.n, vn * 1.1));
    }
  }
  updateFlags(car);
}

function hitboxCorners() {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push([HITBOX_OFFSET[0] + sx * HITBOX_HALF[0], HITBOX_OFFSET[1] + sy * HITBOX_HALF[1], HITBOX_OFFSET[2] + sz * HITBOX_HALF[2]]);
      }
    }
  }
  return out;
}

/* ------------------------------ collisions ------------------------------ */

function obbAxes(car) {
  return [car.fwd, carRight(car), car.up];
}

// Separating-axis test between two car hitboxes. Returns { depth, normal } with the normal pointing from a to b.
function carCarOverlap(a, b) {
  const ra = carRight(a);
  const rb = carRight(b);
  const ca = hitboxCenter(a, ra);
  const cb = hitboxCenter(b, rb);
  const axesA = [a.fwd, ra, a.up];
  const axesB = [b.fwd, rb, b.up];
  const centre = sub(cb, ca);
  if (length(centre) > 200) return null;
  const candidates = axesA.concat(axesB);
  for (const x of axesA) for (const y of axesB) {
    const c = cross(x, y);
    if (length(c) > 1e-4) candidates.push(normalize(c));
  }
  let best = null;
  for (const axis of candidates) {
    let radiusA = 0;
    let radiusB = 0;
    for (let i = 0; i < 3; i++) {
      radiusA += Math.abs(dot(axesA[i], axis)) * HITBOX_HALF[i];
      radiusB += Math.abs(dot(axesB[i], axis)) * HITBOX_HALF[i];
    }
    const distance = dot(centre, axis);
    const overlap = radiusA + radiusB - Math.abs(distance);
    if (overlap <= 0) return null;
    if (!best || overlap < best.depth) best = { depth: overlap, normal: distance >= 0 ? axis : mul(axis, -1) };
  }
  return best;
}

function resolveCarCar(a, b) {
  const hit = carCarOverlap(a, b);
  if (!hit) return;
  const half = hit.depth / 2 + 0.01;
  a.pos = sub(a.pos, mul(hit.normal, half));
  b.pos = add(b.pos, mul(hit.normal, half));
  const closing = dot(sub(b.vel, a.vel), hit.normal);
  if (closing < 0) {
    const j = -(1 + 0.15) * closing / 2;
    a.vel = sub(a.vel, mul(hit.normal, j));
    b.vel = add(b.vel, mul(hit.normal, j));
  }
}

/* ------------------------------ ball ------------------------------ */

function newBall() {
  return { pos: [0, 0, BALL_RADIUS], vel: [0, 0, 0], angvel: [0, 0, 0] };
}

// Frictional bounce of the ball against a surface with inward normal n.
function ballSurfaceContact(ball, n, penetration) {
  ball.pos = add(ball.pos, mul(n, penetration));
  const vn = dot(ball.vel, n);
  if (vn >= 0) return;
  const jn = -(1 + BALL_RESTITUTION) * vn * BALL_MASS;
  ball.vel = add(ball.vel, mul(n, -(1 + BALL_RESTITUTION) * vn));
  // Friction at the contact point: slows sliding and spins the ball.
  const contactOffset = mul(n, -BALL_RADIUS);
  const surfaceVel = add(ball.vel, cross(ball.angvel, contactOffset));
  const tangent = sub(surfaceVel, mul(n, dot(surfaceVel, n)));
  const slide = length(tangent);
  if (slide > 1e-6) {
    const direction = mul(tangent, 1 / slide);
    const needed = slide * BALL_MASS / 3.5;
    const impulse = Math.min(needed, BALL_FRICTION * jn);
    const jt = mul(direction, -impulse);
    ball.vel = add(ball.vel, mul(jt, 1 / BALL_MASS));
    const inertia = 0.4 * BALL_MASS * BALL_RADIUS * BALL_RADIUS;
    ball.angvel = add(ball.angvel, mul(cross(contactOffset, jt), 1 / inertia));
  }
}

function stepBall(ball, dt) {
  ball.vel[2] -= GRAVITY * dt;
  ball.vel = mul(ball.vel, Math.pow(1 - BALL_DRAG, dt));
  const speed = length(ball.vel);
  if (speed > BALL_MAX_SPEED) ball.vel = mul(ball.vel, BALL_MAX_SPEED / speed);
  const spin = length(ball.angvel);
  if (spin > BALL_MAX_ANG) ball.angvel = mul(ball.angvel, BALL_MAX_ANG / spin);
  ball.pos = add(ball.pos, mul(ball.vel, dt));
  const q = arenaQuery(ball.pos[0], ball.pos[1], ball.pos[2]);
  if (q.d < BALL_RADIUS) ballSurfaceContact(ball, q.n, BALL_RADIUS - q.d);
}

// Sphere against a car's oriented hitbox. Returns { normal, penetration, point } with the normal from car to ball.
function ballCarContact(ball, car) {
  const right = carRight(car);
  const centre = hitboxCenter(car, right);
  const rel = sub(ball.pos, centre);
  if (length(rel) > 300) return null;
  const axes = [car.fwd, right, car.up];
  const local = axes.map(axis => dot(axis, rel));
  const clamped = local.map((v, i) => clamp(v, -HITBOX_HALF[i], HITBOX_HALF[i]));
  const delta = local.map((v, i) => v - clamped[i]);
  let distance = Math.hypot(delta[0], delta[1], delta[2]);
  let normal;
  if (distance < 1e-6) {
    // Centre inside the box: push out through the nearest face.
    let axisIndex = 0;
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const gap = HITBOX_HALF[i] - Math.abs(local[i]);
      if (gap < best) { best = gap; axisIndex = i; }
    }
    normal = mul(axes[axisIndex], local[axisIndex] >= 0 ? 1 : -1);
    distance = -best;
  } else {
    normal = normalize(add(add(mul(axes[0], delta[0]), mul(axes[1], delta[1])), mul(axes[2], delta[2])));
  }
  if (distance >= BALL_RADIUS) return null;
  const point = add(centre, add(add(mul(axes[0], clamped[0]), mul(axes[1], clamped[1])), mul(axes[2], clamped[2])));
  return { normal, penetration: BALL_RADIUS - distance, point, centre, relPos: rel };
}

function resolveBallCar(engine, ball, car) {
  const contact = ballCarContact(ball, car);
  if (!contact) { car.touchingBall = false; return; }
  const n = contact.normal;
  ball.pos = add(ball.pos, mul(n, contact.penetration));

  // Velocity of the car's surface at the contact point.
  const lever = sub(contact.point, car.pos);
  const carPointVel = add(car.vel, cross(car.angvel, lever));
  const relVel = sub(ball.vel, carPointVel);
  const closing = dot(relVel, n);
  if (closing < 0) {
    const effectiveMass = 1 / (1 / BALL_MASS + 1 / CAR_MASS);
    const j = -(1 + 0.1) * closing * effectiveMass;
    ball.vel = add(ball.vel, mul(n, j / BALL_MASS));
    car.vel = sub(car.vel, mul(n, j / CAR_MASS));
  }

  // Rocket League's extra hit impulse, applied once when contact begins.
  if (!car.touchingBall) {
    const relSpeed = Math.min(length(relVel), 4600);
    const scaled = [contact.relPos[0], contact.relPos[1], contact.relPos[2] * 0.35];
    let hitDir = normalize(scaled);
    hitDir = normalize(sub(hitDir, mul(car.fwd, dot(car.fwd, hitDir) * 0.35)));
    ball.vel = add(ball.vel, mul(hitDir, relSpeed * lerpTable(HIT_FACTOR_TABLE, relSpeed)));
    engine.events.touches.push({ car: engine.cars.indexOf(car), speed: relSpeed });
    car.lastTouchTime = engine.time;
  }
  car.touchingBall = true;
  const speed = length(ball.vel);
  if (speed > BALL_MAX_SPEED) ball.vel = mul(ball.vel, BALL_MAX_SPEED / speed);
}

/* ------------------------------ engine ------------------------------ */

export class RLEngine {
  /** carsPerTeam cars for each team: blue cars first, then orange. */
  constructor(carsPerTeam = 2) {
    this.carsPerTeam = carsPerTeam;
    this.cars = [];
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < carsPerTeam; i++) this.cars.push(newCar(team));
    }
    this.ball = newBall();
    this.pads = PAD_POSITIONS.map(() => ({ active: true, timeLeft: 0 }));
    this.time = 0;
    this.events = { touches: [], pickups: [], goal: null };
    this.resetKickoff();
  }

  /** Put the ball on the centre spot and the cars on their kickoff spawns. */
  resetKickoff() {
    const spawns = [[-2048, -2560], [2048, -2560], [-256, -3840], [256, -3840], [0, -4608]];
    this.cars.forEach((car, index) => {
      const slot = index % this.carsPerTeam;
      const base = spawns[slot % spawns.length];
      const sign = car.team === 0 ? 1 : -1;
      const pos = [base[0] * sign, base[1] * sign, CAR_REST_HEIGHT];
      const toBall = normalize([-pos[0], -pos[1], 0], [0, 1, 0]);
      Object.assign(car, newCar(car.team));
      car.pos = pos;
      car.fwd = toBall;
    });
    this.ball = newBall();
    this.pads.forEach(pad => { pad.active = true; pad.timeLeft = 0; });
    this.events = { touches: [], pickups: [], goal: null };
  }

  /** Advance one 1/120 s tick. controls[i] = { throttle, steer, pitch, yaw, roll, jump, boost, handbrake } for car i. */
  tick(controls) {
    const dt = DT;
    this.time += dt;
    this.cars.forEach((car, i) => stepCar(car, controls[i] || {}, dt));
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) resolveCarCar(this.cars[i], this.cars[j]);
    }
    stepBall(this.ball, dt);
    for (const car of this.cars) resolveBallCar(this, this.ball, car);
    this.updatePads(dt);
    if (!this.events.goal) {
      if (this.ball.pos[1] > FIELD_Y + BALL_RADIUS) this.events.goal = 'blue';
      else if (this.ball.pos[1] < -FIELD_Y - BALL_RADIUS) this.events.goal = 'orange';
    }
  }

  updatePads(dt) {
    for (let i = 0; i < NUM_PADS; i++) {
      const pad = this.pads[i];
      if (!pad.active) {
        pad.timeLeft -= dt;
        if (pad.timeLeft <= 0) { pad.active = true; pad.timeLeft = 0; }
        continue;
      }
      const position = PAD_POSITIONS[i];
      const radius = PAD_IS_BIG[i] ? 208 : 144;
      for (const car of this.cars) {
        if (car.boost >= BOOST_MAX) continue;
        if (Math.abs(car.pos[2] - position[2]) > 165) continue;
        if (Math.hypot(car.pos[0] - position[0], car.pos[1] - position[1]) > radius) continue;
        car.boost = Math.min(BOOST_MAX, car.boost + (PAD_IS_BIG[i] ? 100 : 12));
        pad.active = false;
        pad.timeLeft = PAD_IS_BIG[i] ? 10 : 4;
        this.events.pickups.push({ car: this.cars.indexOf(car), pad: i, big: PAD_IS_BIG[i] });
        break;
      }
    }
  }

  /** Return and clear the touches, pad pickups and goal recorded since the last call. */
  consumeEvents() {
    const events = this.events;
    this.events = { touches: [], pickups: [], goal: null };
    return events;
  }
}
