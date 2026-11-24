// Shared constants for the Rocket League-scale physics engine and the Whiskers bot.
// Units are Unreal units (uu), seconds, radians. The world is right-handed with z up,
// blue defends -y and attacks +y (same numeric axes as RocketSim, which the bot trained in).

export const FIELD_X = 4096;          // half width (side walls)
export const FIELD_Y = 5120;          // half length (back walls / goal line)
export const FIELD_Z = 2044;          // ceiling height
export const GOAL_HALF_WIDTH = 893;
export const GOAL_HEIGHT = 642;
export const GOAL_DEPTH = 880;
export const GOAL_CENTER_Z = 321;
export const CORNER_RADIUS = 1152;    // vertical corner cut seen from above
export const RAMP_RADIUS = 260;       // floor/wall and wall/ceiling curve

export const GRAVITY = 650;
export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;

export const BALL_RADIUS = 91.25;
export const BALL_MASS = 30;
export const BALL_MAX_SPEED = 6000;
export const BALL_MAX_ANG = 6;
export const BALL_DRAG = 0.03;
export const BALL_RESTITUTION = 0.6;
export const BALL_FRICTION = 0.35;

export const CAR_MASS = 180;
export const CAR_MAX_SPEED = 2300;
export const SUPERSONIC_START = 2200;
export const CAR_MAX_ANG = 5.5;
export const CAR_REST_HEIGHT = 17;
// Octane hitbox: half extents and centre offset from the car origin, in the car frame (fwd, right, up).
export const HITBOX_HALF = [59.0, 42.1, 18.1];
export const HITBOX_OFFSET = [13.9, 0, 20.75];

export const BOOST_MAX = 100;
export const BOOST_USE_RATE = 100 / 3;
export const BOOST_ACCEL = 991.667;
export const DODGE_WINDOW = 1.25;
export const DEMO_TIME = 3.0;

// Boost pads in the canonical order the Whiskers network expects (34 pads).
export const PAD_POSITIONS = [
  [0, -4240, 70], [-1792, -4184, 70], [1792, -4184, 70], [-3072, -4096, 73], [3072, -4096, 73],
  [-940, -3308, 70], [940, -3308, 70], [0, -2816, 70], [-3584, -2484, 70], [3584, -2484, 70],
  [-1788, -2300, 70], [1788, -2300, 70], [-2048, -1036, 70], [2048, -1036, 70], [0, -1024, 70],
  [-3584, 0, 73], [-1024, 0, 70], [1024, 0, 70], [3584, 0, 73], [0, 1024, 70],
  [-2048, 1036, 70], [2048, 1036, 70], [-1788, 2300, 70], [1788, 2300, 70], [-3584, 2484, 70],
  [3584, 2484, 70], [0, 2816, 70], [-940, 3308, 70], [940, 3308, 70], [-3072, 4096, 73],
  [3072, 4096, 73], [-1792, 4184, 70], [1792, 4184, 70], [0, 4240, 70]
];
export const PAD_IS_BIG = PAD_POSITIONS.map(p => Math.abs(p[2] - 73) < 0.5);
export const NUM_PADS = PAD_POSITIONS.length;
