import * as THREE from 'three';
import { RLMatch, SCENE_SCALE as RL_S } from './rl/rlmode.js';
import { sfx } from './sfx.js';
import { PAD_POSITIONS as RL_PADS, PAD_IS_BIG as RL_PAD_BIG, BALL_RADIUS as RL_BALL_R } from './rl/constants.js';

/* ============================== CONFIG ============================== */

const SKILLS = {
  bronze:        { label: 'BRONZE',        color: '#cd7f32', speed: 20, turn: 1.8, whiff: 0.45, accuracy: 0.18, reaction: 0.65, boost: 0.2,  desc: 'Low speed, poor reads, frequent whiffs. The rookie is out of his depth.' },
  silver:        { label: 'SILVER',        color: '#c8d2de', speed: 23, turn: 2.1, whiff: 0.34, accuracy: 0.30, reaction: 0.50, boost: 0.3,  desc: 'Faster, but still loses track of the ball in the scrum.' },
  gold:          { label: 'GOLD',          color: '#ffd54a', speed: 26, turn: 2.4, whiff: 0.24, accuracy: 0.43, reaction: 0.40, boost: 0.4,  desc: 'Can keep possession and finds the net more often than not.' },
  platinum:      { label: 'PLATINUM',      color: '#7fe3ff', speed: 29, turn: 2.7, whiff: 0.16, accuracy: 0.55, reaction: 0.32, boost: 0.5,  desc: 'Solid rotations, cleaner hits, fewer basic mistakes.' },
  diamond:       { label: 'DIAMOND',       color: '#5aa9ff', speed: 32, turn: 3.0, whiff: 0.11, accuracy: 0.66, reaction: 0.25, boost: 0.6,  desc: 'Confident in the air and dangerous in the final third.' },
  champion:      { label: 'CHAMPION',      color: '#b06bff', speed: 35, turn: 3.2, whiff: 0.07, accuracy: 0.76, reaction: 0.20, boost: 0.7,  desc: 'Fast, clinical and rarely gives the ball away.' },
  grandchampion: { label: 'GRAND CHAMPION',color: '#ff5fa2', speed: 37, turn: 3.4, whiff: 0.04, accuracy: 0.85, reaction: 0.16, boost: 0.8,  desc: 'Elite mechanics and near-perfect decision making.' },
  ssl:           { label: 'SUPERSONIC',    color: '#ff8a3d', speed: 39, turn: 3.6, whiff: 0.02, accuracy: 0.92, reaction: 0.12, boost: 0.9,  desc: 'Flip resets, ceiling shots and laser-guided passing.' },
  pro:           { label: 'PRO LEAGUE',    color: '#ffd700', speed: 41, turn: 3.8, whiff: 0.01, accuracy: 0.97, reaction: 0.09, boost: 1.0,  desc: 'RLCS-level play. Every touch has a purpose.' }
};

const params = new URLSearchParams(location.search);
const MOBILE = window.matchMedia('(pointer: coarse)').matches;
let skillKey = params.get('tier');

if (!skillKey || !SKILLS[skillKey]) {
  try {
    const save = JSON.parse(localStorage.getItem('rl-career-save-v1') || 'null');
    const mmr = save && typeof save.mmr === 'number' ? save.mmr : 0;
    if (mmr < 360) skillKey = 'bronze';
    else if (mmr < 720) skillKey = 'silver';
    else if (mmr < 1080) skillKey = 'gold';
    else if (mmr < 1440) skillKey = 'platinum';
    else if (mmr < 1800) skillKey = 'diamond';
    else if (mmr < 2160) skillKey = 'champion';
    else if (mmr < 2520) skillKey = 'grandchampion';
    else if (mmr < 2760) skillKey = 'ssl';
    else skillKey = 'pro';
  } catch (error) {
    skillKey = 'bronze';
  }
}
if (!SKILLS[skillKey]) skillKey = 'bronze';

let skill = SKILLS[skillKey];

// Default engine; ?engine=classic restores the old one. It is the Rocket League-scale physics (rl/engine.js) driven by the Whiskers neural bot.
// Everything is drawn at 60 / 5120 scene units per Unreal unit, with scene = (rl y, rl z, rl x).
const RL_MODE = params.get('engine') !== 'classic';
const FIELD = RL_MODE
  ? { length: 120, width: 96, goalHalf: 893 * RL_S, goalHeight: 642 * RL_S, ballRadius: RL_BALL_R * RL_S, cornerRadius: 1152 * RL_S }
  : { length: 120, width: 80, goalHalf: 8, goalHeight: 8, ballRadius: 1.7, cornerRadius: 9 };

const HALF_L = FIELD.length / 2;
const HALF_W = FIELD.width / 2;
const CORNER_R = FIELD.cornerRadius;
const GRAVITY = 9.81;
// The ball falls heavier than the cars: it keeps its driven ground speed but
// drops out of the air quickly instead of hanging like a beach ball.
const BALL_GRAVITY = 14.2;
const PHYSICS_SUBSTEPS = 8;
const SOLVER_ITERATIONS = 6;
const CEILING_Y = RL_MODE ? 24 : 52;
const ARENA_WALL_INSET = 0.6;
const WALL_HEIGHT = 24;
const SIDE_RAMP_HEIGHT = RL_MODE ? 3 : 9;
const TARGET_LIMIT_X = HALF_L - 3;
const TARGET_LIMIT_Z = HALF_W - 4;

/* ============================== DOM ============================== */

const dom = {
  container: document.getElementById('scene'),
  loading: document.getElementById('loading'),
  scoreBlue: document.getElementById('scoreBlue'),
  scoreOrange: document.getElementById('scoreOrange'),
  clock: document.getElementById('clock'),
  matchState: document.getElementById('matchState'),
  rankChip: document.getElementById('rankChip'),
  skillSelect: document.getElementById('skillSelect'),
  skillFill: document.getElementById('skillFill'),
  skillDesc: document.getElementById('skillDesc'),
  statSpeed: document.getElementById('statSpeed'),
  statAccuracy: document.getElementById('statAccuracy'),
  statWhiff: document.getElementById('statWhiff'),
  statBoost: document.getElementById('statBoost'),
  boostValue: document.getElementById('boostValue'),
  boostFill: document.getElementById('boostFill'),
  playBtn: document.getElementById('playBtn'),
  replayBtn: document.getElementById('replayBtn'),
  cameraBtn: document.getElementById('cameraBtn'),
  speedBtn: document.getElementById('speedBtn'),
  backBtn: document.getElementById('backBtn'),
  modeSelect: document.getElementById('modeSelect'),
  modeBtn: document.getElementById('modeBtn')
};

/* ============================== UTILS ============================== */

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Pop-up notices (Shot, Save, Goal, Assist...) stacked under the scoreboard.
function notify(title, detail, team) {
  if (title === 'SHOT ON GOAL') sfx.notice('shot');
  else if (title === 'SAVE') sfx.notice('save');
  const box = document.getElementById('notifications');
  if (!box) return;
  const notice = document.createElement('div');
  notice.className = 'notice ' + (team || 'neutral');
  const heading = document.createElement('strong');
  heading.textContent = title;
  notice.appendChild(heading);
  if (detail) {
    const sub = document.createElement('span');
    sub.textContent = detail;
    notice.appendChild(sub);
  }
  box.appendChild(notice);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  window.setTimeout(() => notice.remove(), 2400);
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ============================== THREE SETUP ============================== */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3350);
scene.fog = new THREE.FogExp2(0x2a3350, 0.0008);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1600);
camera.position.set(0, 95, 135);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.outputColorSpace = THREE.SRGBColorSpace;
dom.container.appendChild(renderer.domElement);

// Portrait screens need a wider lens and a little more distance, otherwise the
// car and ball fill the narrow view and the rest of the play is cropped away.
function baseFov(portrait) { return portrait ? (MOBILE ? 68 : 62) : 55; }
function resizeRenderer() {
  // visualViewport tracks the space left by mobile browser chrome. Ignore it
  // while pinch-zoomed so zooming does not shrink the canvas.
  const vv = window.visualViewport;
  const zoomed = vv && Math.abs((vv.scale || 1) - 1) > 0.01;
  const width = Math.max(1, Math.round(vv && !zoomed ? vv.width : window.innerWidth));
  const height = Math.max(1, Math.round(vv && !zoomed ? vv.height : window.innerHeight));
  const portrait = height > width;
  camera.aspect = width / height;
  camera.fov = baseFov(portrait);
  camera.updateProjectionMatrix();
  const maxRatio = MOBILE ? 1.25 : (RL_MODE ? 1.25 : 2);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  renderer.setSize(width, height);
}
resizeRenderer();

/* ============================== LIGHTING ============================== */

scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x6a5a50, 1.5));

const keyLight = new THREE.DirectionalLight(0xfff4e2, 2.6);
keyLight.position.set(65, 150, 55);
keyLight.castShadow = false;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -120;
keyLight.shadow.camera.right = 120;
keyLight.shadow.camera.top = 95;
keyLight.shadow.camera.bottom = -95;
keyLight.shadow.camera.near = 10;
keyLight.shadow.camera.far = 380;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xb9c8ff, 1.2);
fillLight.position.set(-85, 70, -60);
scene.add(fillLight);

/* ============================== SKY ============================== */

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x1c2540) },
      bottomColor: { value: new THREE.Color(0x4a5a85) }
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos; void main(){ float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0); }'
  })
);
scene.add(sky);

/* ============================== FIELD ============================== */

function createFieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 2048, 1350);
  gradient.addColorStop(0, '#1f6a47');
  gradient.addColorStop(0.5, '#1b5e40');
  gradient.addColorStop(1, '#1f654a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2048, 1350);

  for (let x = 0; x < 2048; x += 256) {
    ctx.fillStyle = x % 512 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.025)';
    ctx.fillRect(x, 0, 256, 1350);
  }

  ctx.strokeStyle = 'rgba(226,240,255,0.82)';
  ctx.lineWidth = 7;
  ctx.strokeRect(30, 30, 1988, 1290);

  ctx.beginPath();
  ctx.moveTo(1024, 30);
  ctx.lineTo(1024, 1320);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(1024, 675, 230, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(1024, 675, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(226,240,255,0.9)';
  ctx.fill();

  [90, 1958].forEach(goalX => {
    const dir = goalX < 1024 ? 1 : -1;
    ctx.strokeRect(goalX === 90 ? 30 : 1390, 415, 628, 520);
    ctx.strokeRect(goalX === 90 ? 30 : 1740, 545, 278, 260);
    ctx.beginPath();
    ctx.arc(goalX === 90 ? 658 : 1390, 675, 8, 0, Math.PI * 2);
    ctx.fill();
    void dir;
  });

  ctx.fillStyle = 'rgba(190,140,255,0.07)';
  ctx.font = 'bold 110px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ROAD TO PRO', 1024, 710);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const field = new THREE.Mesh(
  new THREE.PlaneGeometry(FIELD.length, FIELD.width),
  new THREE.MeshStandardMaterial({ map: createFieldTexture(), roughness: 0.92, metalness: 0.02 })
);
field.rotation.x = -Math.PI / 2;
field.receiveShadow = true;
scene.add(field);

/* ============================== WALLS ============================== */

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4466, roughness: 0.45, metalness: 0.35, transparent: true, opacity: 0.22, depthWrite: false });
const trimBlue = new THREE.MeshStandardMaterial({ color: 0x140a24, emissive: 0x7a00ff, emissiveIntensity: 0.85, roughness: 0.4 });

function addWallBox(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const sideWallLength = FIELD.length - CORNER_R * 2;
const endWallDepth = HALF_W - CORNER_R - FIELD.goalHalf;
const endWallZ = FIELD.goalHalf + endWallDepth / 2;
const cornerX = HALF_L - CORNER_R;
const cornerZ = HALF_W - CORNER_R;

addWallBox(sideWallLength, WALL_HEIGHT, 1.2, 0, WALL_HEIGHT / 2, -HALF_W);
addWallBox(sideWallLength, WALL_HEIGHT, 1.2, 0, WALL_HEIGHT / 2, HALF_W);
[-HALF_L, HALF_L].forEach(x => {
  [-endWallZ, endWallZ].forEach(z => addWallBox(1.2, WALL_HEIGHT, endWallDepth, x, WALL_HEIGHT / 2, z));
});

const cornerConfigs = [
  { x: cornerX, z: cornerZ, start: 0 },
  { x: -cornerX, z: cornerZ, start: Math.PI * 1.5 },
  { x: -cornerX, z: -cornerZ, start: Math.PI },
  { x: cornerX, z: -cornerZ, start: Math.PI / 2 }
];
cornerConfigs.forEach(corner => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(CORNER_R, CORNER_R, WALL_HEIGHT, 24, 1, true, corner.start, Math.PI / 2),
    wallMaterial
  );
  mesh.position.set(corner.x, WALL_HEIGHT / 2, corner.z);
  mesh.castShadow = true;
  scene.add(mesh);
});

// Sloped ramps at the base of the side walls let cars drive up.
const rampDepth = SIDE_RAMP_HEIGHT * Math.SQRT2;
[-1, 1].forEach(side => {
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(sideWallLength, 0.45, rampDepth), wallMaterial);
  ramp.rotation.x = side > 0 ? -Math.PI / 4 : Math.PI / 4;
  ramp.position.set(0, SIDE_RAMP_HEIGHT / 2, side * ((HALF_W - ARENA_WALL_INSET) + SIDE_RAMP_HEIGHT / 2));
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  scene.add(ramp);
});

[-HALF_W - 0.2, HALF_W + 0.2].forEach(z => {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(sideWallLength, 0.35, 0.4), trimBlue);
  trim.position.set(0, WALL_HEIGHT + 0.1, z);
  scene.add(trim);
});
[-HALF_L - 0.2, HALF_L + 0.2].forEach(x => {
  [-endWallZ, endWallZ].forEach(z => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, endWallDepth), trimBlue);
    trim.position.set(x, WALL_HEIGHT + 0.1, z);
    scene.add(trim);
  });
});

/* ============================== GOALS ============================== */

function createGoal(side) {
  const group = new THREE.Group();
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0xeef4ff, emissive: side > 0 ? 0x331100 : 0x001a33,
    emissiveIntensity: 0.8, metalness: 0.35, roughness: 0.3
  });

  [-FIELD.goalHalf, FIELD.goalHalf].forEach(z => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, FIELD.goalHeight, 14), postMaterial);
    post.position.set(0, FIELD.goalHeight / 2, z);
    post.castShadow = true;
    group.add(post);
  });

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, FIELD.goalHalf * 2, 14), postMaterial);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.set(0, FIELD.goalHeight, 0);
  crossbar.castShadow = true;
  group.add(crossbar);

  const netPoints = [];
  const goalDepth = RL_MODE ? 880 * RL_S : 5.5;
  const backX = side * goalDepth;
  for (let z = -FIELD.goalHalf; z <= FIELD.goalHalf; z += 1.6) {
    netPoints.push(backX, 0, z, backX, FIELD.goalHeight, z);
  }
  for (let y = 0; y <= FIELD.goalHeight; y += 1.6) {
    netPoints.push(backX, y, -FIELD.goalHalf, backX, y, FIELD.goalHalf);
  }
  [-FIELD.goalHalf, FIELD.goalHalf].forEach(z => {
    for (let y = 0; y <= FIELD.goalHeight; y += 1.6) {
      netPoints.push(0, y, z, backX, y, z);
    }
    for (let x = 0; x <= goalDepth; x += 1.4) {
      netPoints.push(side * x, 0, z, side * x, FIELD.goalHeight, z);
    }
  });

  const netGeometry = new THREE.BufferGeometry();
  netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(netPoints, 3));
  const net = new THREE.LineSegments(netGeometry, new THREE.LineBasicMaterial({
    color: 0x9fb6d8, transparent: true, opacity: 0.32
  }));
  group.add(net);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.goalHalf * 2, FIELD.goalHeight),
    new THREE.MeshBasicMaterial({ color: side > 0 ? 0xff7a1a : 0x00aaff, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
  );
  glow.rotation.y = Math.PI / 2;
  glow.position.set(side * (goalDepth + 0.1), FIELD.goalHeight / 2, 0);
  group.add(glow);

  group.position.x = side * HALF_L;
  scene.add(group);
}

createGoal(-1);
createGoal(1);

/* ============================== BOOST PADS ============================== */

const BOOST_MAX = 100;
const SMALL_BOOST_AMOUNT = 12;
const BIG_BOOST_AMOUNT = 100;

const bigPadPositions = [
  [-cornerX, -cornerZ], [-cornerX, cornerZ], [cornerX, -cornerZ], [cornerX, cornerZ],
  [0, -(HALF_W - 6)], [0, HALF_W - 6]
];

// Seven small pads per quadrant, mirrored for balanced coverage: 28 small total.
const smallQuadrantPads = [
  [HALF_L - 6, 12],
  [HALF_L - 10, 24],
  [HALF_L - 18, 16],
  [HALF_L - 24, 32],
  [HALF_L - 34, 12],
  [HALF_L - 42, 30],
  [HALF_L - 50, 18]
];
const smallPadPositions = [];
for (const xSign of [-1, 1]) {
  for (const zSign of [-1, 1]) {
    for (const [x, z] of smallQuadrantPads) smallPadPositions.push([xSign * x, zSign * z]);
  }
}

const padPositions = RL_MODE
  ? RL_PADS.map(p => [p[1] * RL_S, p[0] * RL_S])
  : [...bigPadPositions, ...smallPadPositions];
const bigPadKeys = RL_MODE
  ? new Set(padPositions.filter((_, i) => RL_PAD_BIG[i]).map(([x, z]) => x + ',' + z))
  : new Set(bigPadPositions.map(([x, z]) => x + ',' + z));

const pads = padPositions.map(([x, z]) => {
  const big = bigPadKeys.has(x + ',' + z);
  const blue = x < 0;
  const size = (big ? 3.4 : 2.2) * (RL_MODE ? 0.7 : 1);
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      color: big ? 0xffd54a : (blue ? 0x00c8ff : 0xff7a1a),
      transparent: true,
      opacity: big ? 0.92 : 0.78,
      side: THREE.DoubleSide
    })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(x, 0.08, z);
  scene.add(pad);

  const innerSize = (big ? 2.2 : 1.2) * (RL_MODE ? 0.7 : 1);
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(innerSize, innerSize),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: big ? 0.45 : 0.25, side: THREE.DoubleSide })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(x, 0.1, z);
  scene.add(inner);

  return {
    x, z, big,
    amount: big ? BIG_BOOST_AMOUNT : SMALL_BOOST_AMOUNT,
    radius: big ? 2.8 : 2.0,
    maxCooldown: big ? 10 : 4,
    cooldown: 0,
    mesh: pad,
    inner
  };
});

/* ============================== BALL ============================== */

function createBallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2f5fa';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#121821';
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 64 + (row % 2 ? 32 : 0);
      const y = row * 64 + 12;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const angle = (Math.PI * 2 * k) / 5 - Math.PI / 2;
        const px = x + Math.cos(angle) * 20;
        const py = y + Math.sin(angle) * 20;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(FIELD.ballRadius, 32, 24),
  new THREE.MeshStandardMaterial({ map: createBallTexture(), roughness: 0.45, metalness: 0.05 })
);
ballMesh.castShadow = true;
scene.add(ballMesh);

const ballGlow = new THREE.PointLight(0xffffff, 0.45, 24, 2);
scene.add(ballGlow);

/* ============================== CARS ============================== */

const CAR_VISUAL = RL_MODE ? (118 * RL_S) / 4.1 : 1;

function createCar(team, isPlayer) {
  const color = team === 'blue' ? 0x1f8fff : 0xff6a1a;
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  const wheels = [];

  // The body is a plain box the size of the Octane hitbox (118 x 36 x 84 uu, centred 13.9 uu forward and
  // 20.75 uu above the car origin) with four wheels. unit converts uu to scene units; the chassis origin is
  // on the ground under the car origin, with x shifted so the hitbox is centred.
  const unit = RL_MODE ? RL_S : 4.1 / 118;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(118 * unit, 36.2 * unit, 84.2 * unit),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 })
  );
  body.position.y = (17 + 20.75) * unit;
  body.castShadow = true;
  chassis.add(body);

  // Wheel positions relative to the hitbox centre: front axle forward, rear axle back.
  const wheelRadius = 12 * unit;
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 9 * unit, 16);
  wheelGeometry.rotateX(Math.PI / 2); // axle along z
  const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.5, metalness: 0.4 });
  [[37, 34], [37, -34], [-48, 34], [-48, -34]].forEach(([wx, wz]) => {
    const wheel = new THREE.Group();
    wheel.position.set(wx * unit, wheelRadius, wz * unit);
    wheel.add(new THREE.Mesh(wheelGeometry, tyreMaterial));
    // A light bar across the hub so the wheel's rotation is visible.
    const hub = new THREE.Mesh(new THREE.BoxGeometry(wheelRadius * 1.5, wheelRadius * 0.28, 9.6 * unit), hubMaterial);
    wheel.add(hub);
    chassis.add(wheel);
    wheels.push(wheel);
  });

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 1.6, 10),
    new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9 })
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.set(-2.6, 1.0, 0);
  flame.visible = false;
  if (RL_MODE) {
    flame.scale.setScalar(CAR_VISUAL);
    flame.position.multiplyScalar(CAR_VISUAL);
  }
  chassis.add(flame);

  if (isPlayer) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    if (RL_MODE) ring.scale.setScalar(CAR_VISUAL);
    group.add(ring);
  }

  group.traverse(child => { if (child.isMesh) child.castShadow = true; });
  scene.add(group);

  return {
    team,
    isPlayer,
    mesh: group,
    chassis,
    wheels,
    flame,
    // Car state — 2D physics with 3D orientation for rendering
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    y: 0,
    vy: 0,
    airborne: false,
    heading: 0,
    yawRate: 0,
    pitch: 0,
    roll: 0,
    orientation: new THREE.Quaternion(), // derived from heading/pitch/roll
    flipTimer: 0,
    flipAngle: 0,
    flipRate: 0,
    flipDir: new THREE.Vector3(),
    jumpCooldown: 0,
    reverseTimer: 0,
    stuckTimer: 0,
    speed: 0,
    wheelSpin: 0,
    landImpact: 0,
    steerAngle: 0,
    cooldown: 0,
    lastBallContact: -999,
    lastHitEvent: -999,
    whiffContact: false,
    attackDriving: false,
    hitQuality: 1,
    flameTimer: 0,
    targetError: new THREE.Vector3(),
    targetSmooth: new THREE.Vector3(),
    reactionTimer: 0,
    boost: 33,
    boostHold: 0,
    role: 'attack',
    kickoffRole: 'support',
    roleTimer: 0,
    index: 0
  };
}

// Three cars per side are built once; the selected mode (1v1, 2v2 or 3v3) decides which take part. `cars` holds
// the active ones, blue first then orange, in the same order as the engine's cars.
const allCars = [
  createCar('blue', true), createCar('blue', false), createCar('blue', false),
  createCar('orange', false), createCar('orange', false), createCar('orange', false)
];
const cars = [];
let teamSize = 2;

function setTeamSize(n) {
  teamSize = Math.max(1, Math.min(3, n));
  cars.length = 0;
  for (let i = 0; i < teamSize; i++) cars.push(allCars[i]);
  for (let i = 0; i < teamSize; i++) cars.push(allCars[3 + i]);
  allCars.forEach(car => { car.mesh.visible = cars.includes(car); });
  cars.forEach((car, index) => { car.index = index; car.role = 'attack'; });
  cars.forEach((car, index) => { if (index % teamSize !== 0) car.role = 'support'; });
}

function carLabel(index) {
  return (index < teamSize ? 'Blue ' : 'Orange ') + (index % teamSize + 1);
}

let initialSize = Number(params.get('size') || params.get('mode'));
if (!initialSize) {
  try { initialSize = Number(localStorage.getItem('rtpTeamSize')); } catch (e) { initialSize = 0; }
}
setTeamSize(RL_MODE && initialSize >= 1 && initialSize <= 3 ? initialSize : 2);

/* ============================== MATCH STATE ============================== */

const ball = {
  pos: new THREE.Vector3(0, FIELD.ballRadius, 0),
  vel: new THREE.Vector3(),
  spin: new THREE.Vector3(),
  radius: FIELD.ballRadius,
  mass: 0.42,
  resting: false
};
const lastTouch = { team: null, car: null, time: -999, speed: 0 };
const pinchContacts = [];
let pinchCount = 0;
let lastPinch = null;
let scoreBlue = 0;
let scoreOrange = 0;
let clock = 180;
let paused = false;
let speedMultiplier = 1;
let cameraMode = 'car0';
let matchState = 'KICKOFF';
let kickoffTimer = 1.6;
let kickoffPhase = 0;
let kickoffCount = 0;
let kickoffStage = 9;
let roleUpdateTimer = 0;
let goalTimer = 0;
let goalLocked = false;
let orbitAngle = 0;
let elapsed = 0;

/* ============================== RL ENGINE MODE ============================== */

const rl = RL_MODE ? new RLMatch(skillKey, teamSize) : null;
let rlStatus = RL_MODE ? 'loading' : 'off';
if (rl) {
  rl.loadPolicy('rl/whiskers.bin')
    .then(() => { rlStatus = 'ready'; })
    .catch(error => { rlStatus = 'failed'; console.error(error); notify('BOT FAILED TO LOAD', error.message, 'neutral'); });
  // Nexto drives the Pro tier. It is optional: if it fails to load, Whiskers plays instead.
  rl.loadNexto('rl/nexto.bin')
    .then(() => console.info('Nexto loaded for the Pro tier.'))
    .catch(error => console.warn('Nexto unavailable, using Whiskers for Pro.', error));
}

const rlForward = new THREE.Vector3();
const rlUp = new THREE.Vector3();
const rlSide = new THREE.Vector3();
const rlBasis = new THREE.Matrix4();
const rlTarget = new THREE.Quaternion();
const rlSpin = new THREE.Vector3();
const rlSpinQuat = new THREE.Quaternion();

// Where a sound is relative to the camera: stereo pan, and how much quieter it is when far away.
const sfxVec = new THREE.Vector3();
function sfxSpace(position) {
  sfxVec.copy(position).applyMatrix4(camera.matrixWorldInverse);
  const d = sfxVec.length();
  return { pan: clamp(sfxVec.x / Math.max(8, d), -1, 1), near: clamp(1.15 - d / 120, 0.3, 1) };
}
let sfxBallVel = null;

// Copy the engine state into the scene objects: scene = (rl y, rl z, rl x) scaled by RL_S.
function syncFromRL(snap = false) {
  const engine = rl.engine;
  engine.cars.forEach((rc, i) => {
    const car = cars[i];
    car.pos.set(rc.pos[1] * RL_S, rc.pos[2] * RL_S, rc.pos[0] * RL_S);
    car.vel.set(rc.vel[1] * RL_S, rc.vel[2] * RL_S, rc.vel[0] * RL_S);
    car.y = car.pos.y;
    car.boost = rc.boost;
    rlForward.set(rc.fwd[1], rc.fwd[2], rc.fwd[0]);
    rlUp.set(rc.up[1], rc.up[2], rc.up[0]);
    rlSide.crossVectors(rlForward, rlUp);
    rlBasis.makeBasis(rlForward, rlUp, rlSide);
    car.mesh.position.copy(car.pos);
    rlTarget.setFromRotationMatrix(rlBasis);
    // Smooth the drawn orientation a little so landings and flips do not look like they snap.
    if (snap) car.mesh.quaternion.copy(rlTarget);
    else car.mesh.quaternion.slerp(rlTarget, 0.55);
    car.chassis.rotation.set(0, 0, 0);
    car.chassis.position.set(13.9 * RL_S, -17 * RL_S, 0);
    car.heading = Math.atan2(-rlForward.z, rlForward.x);
    car.flame.visible = !!rc.boosting;
    if (!snap) {
      const space = sfxSpace(car.pos);
      if (rc.hasJumped && !car.sfxJumped) sfx.jump(space.pan, space.near);
      if (rc.isFlipping && !car.sfxFlipping) sfx.flip(space.pan, space.near);
      sfx.boost(i, rc.boosting ? space.near : 0, space.pan);
    } else {
      sfx.boost(i, 0);
    }
    car.sfxJumped = rc.hasJumped;
    car.sfxFlipping = rc.isFlipping;

    // Wheels: front pair steer with the car's steering input, all four roll with the speed along the car.
    const input = rl.controls[i] || {};
    car.steerAngle += ((input.steer || 0) * 0.45 - car.steerAngle) * 0.3;
    const forwardSpeed = rc.vel[0] * rc.fwd[0] + rc.vel[1] * rc.fwd[1] + rc.vel[2] * rc.fwd[2];
    car.wheelSpin = (car.wheelSpin + (forwardSpeed / 12) / 60) % (Math.PI * 2);
    car.wheels.forEach((wheel, index) => {
      wheel.rotation.y = index < 2 ? car.steerAngle : 0;
      wheel.rotation.z = car.wheelSpin;
    });
  });
  const rb = engine.ball;
  ball.pos.set(rb.pos[1] * RL_S, rb.pos[2] * RL_S, rb.pos[0] * RL_S);
  ball.vel.set(rb.vel[1] * RL_S, rb.vel[2] * RL_S, rb.vel[0] * RL_S);
  rlSpin.set(rb.angvel[1], rb.angvel[2], rb.angvel[0]);
  const spinRate = rlSpin.length();
  if (spinRate > 1e-4) {
    rlSpin.multiplyScalar(1 / spinRate);
    rlSpinQuat.setFromAxisAngle(rlSpin, spinRate / 60);
    ballMesh.quaternion.premultiply(rlSpinQuat);
  }
  ballMesh.position.copy(ball.pos);
  ballGlow.position.copy(ball.pos);
  engine.pads.forEach((state, i) => {
    pads[i].mesh.visible = state.active;
    pads[i].inner.visible = state.active;
  });
}

// Shot / Save / Goal / Assist notices, worked out from the engine's ball touches.
let rlLastTouch = null;
let rlPrevTouch = null;
let rlShot = null;

// Will the ball, left alone, reach the goal this team attacks? Rough ballistic path with a floor bounce.
function headingAtGoal(engine, team) {
  const attack = team === 0 ? 1 : -1;
  const ballState = engine.ball;
  const speedToGoal = ballState.vel[1] * attack;
  if (speedToGoal < 400) return false;
  const t = (5120 - attack * ballState.pos[1]) / speedToGoal;
  if (t > 3.5) return false;
  const x = ballState.pos[0] + ballState.vel[0] * t;
  let z;
  if (ballState.pos[2] < 150 && Math.abs(ballState.vel[2]) < 200) z = ballState.pos[2];
  else {
    z = ballState.pos[2] + ballState.vel[2] * t - 325 * t * t;
    if (z < 0) z = -z * 0.6;
  }
  return Math.abs(x) < 950 && z < 730;
}

// Hits, bounces and pad pickups from this step's engine events.
function playEventSounds(events) {
  const ballSpace = sfxSpace(ball.pos);
  for (const touch of events.touches) sfx.hit(touch.speed, ballSpace.pan, ballSpace.near);
  for (const pickup of events.pickups) {
    const space = sfxSpace(cars[pickup.car].pos);
    sfx.pickup(pickup.big, space.pan, space.near);
  }
  const v = rl.engine.ball.vel;
  if (sfxBallVel && !events.touches.length) {
    const change = Math.hypot(v[0] - sfxBallVel[0], v[1] - sfxBallVel[1], v[2] - sfxBallVel[2]);
    if (change > 350) sfx.bounce(change, ballSpace.pan, ballSpace.near);
  }
  sfxBallVel = [v[0], v[1], v[2]];
}

function handleRLEvents(events) {
  const engine = rl.engine;
  const now = engine.time;
  for (const touch of events.touches) {
    const car = engine.cars[touch.car];
    const team = car.team === 0 ? 'blue' : 'orange';
    const name = carLabel(touch.car);
    if (rlShot && rlShot.team !== car.team && now - rlShot.time < 4) {
      notify('SAVE', name, team);
      rlShot = null;
    }
    if (rlLastTouch && rlLastTouch.car !== touch.car) rlPrevTouch = rlLastTouch;
    rlLastTouch = { car: touch.car, team: car.team, time: now };
    const alreadyShooting = rlShot && rlShot.team === car.team && now - rlShot.time < 1.5;
    if (!alreadyShooting && headingAtGoal(engine, car.team)) {
      notify('SHOT ON GOAL', name, team);
      rlShot = { team: car.team, time: now, car: touch.car };
    }
  }
  if (rlShot && now - rlShot.time > 4) rlShot = null;
}

function announceGoal(team) {
  const now = rl.engine.time;
  const side = team === 'blue' ? 0 : 1;
  if (rlLastTouch) {
    const name = carLabel(rlLastTouch.car);
    const scorerTeam = rlLastTouch.team === 0 ? 'blue' : 'orange';
    if (rlLastTouch.team === side) {
      notify('GOAL', name, scorerTeam);
      if (rlPrevTouch && rlPrevTouch.team === side && rlPrevTouch.car !== rlLastTouch.car && now - rlPrevTouch.time < 6) {
        notify('ASSIST', carLabel(rlPrevTouch.car), scorerTeam);
      }
    } else {
      notify('OWN GOAL', name, scorerTeam);
    }
  } else {
    notify('GOAL', '', team);
  }
  rlLastTouch = null;
  rlPrevTouch = null;
  rlShot = null;
}

function stepRL(dt) {
  elapsed += dt;
  if (rlStatus !== 'ready') {
    matchState = rlStatus === 'failed' ? 'ERROR' : 'LOADING';
    return;
  }
  const ticks = Math.max(1, Math.round(dt * 120));

  if (goalTimer > 0) {
    goalTimer -= dt;
    if (goalTimer <= 0) {
      if (replayBuffer.length > 40) {
        goalTimer = 0;
        startReplay();
      } else {
        resetPositions('Back to the kickoff. Reset and go again.');
      }
      return;
    }
    for (let i = 0; i < ticks; i++) rl.idle();
    rl.engine.consumeEvents();
    syncFromRL();
    return;
  }

  if (replay.active) {
    if (stepReplay(dt)) {
      endReplay();
      resetPositions('Back to the kickoff. Reset and go again.');
    }
    return;
  }

  if (kickoffTimer > 0) {
    kickoffTimer -= dt;
    matchState = kickoffTimer > 0 ? 'KICKOFF' : 'PLAYING';
    // Countdown ticks at 1.8, 1.2 and 0.6 s, then the go tone.
    const stage = kickoffTimer <= 0 ? -1 : Math.floor(kickoffTimer / 0.6);
    if (stage !== kickoffStage) {
      kickoffStage = stage;
      if (stage === -1) sfx.beep(true);
      else if (stage <= 2) sfx.beep(false);
    }
    return;
  }

  matchState = 'PLAYING';
  clock -= dt;
  for (let i = 0; i < ticks; i++) rl.tick();
  const events = rl.engine.consumeEvents();
  syncFromRL();
  recordReplayFrame();
  playEventSounds(events);
  handleRLEvents(events);

  if (events.goal) {
    scoreGoal(events.goal);
    return;
  }

  if (clock <= 0) {
    clock = 180;
    const result = scoreBlue === scoreOrange ? 'DRAW' : (scoreBlue > scoreOrange ? 'BLUE WIN' : 'ORANGE WIN');
    notify('FULL TIME', result, 'neutral');
    scoreBlue = 0;
    scoreOrange = 0;
    resetPositions('New match starting.');
  }
}

function resetPositions(message) {
  if (RL_MODE) {
    kickoffCount++;
    kickoffStage = 9;
    sfxBallVel = null;
    replayBuffer.length = 0;
    if (replay.active) endReplay();
    rl.reset();
    rlLastTouch = null;
    rlPrevTouch = null;
    rlShot = null;
    matchState = 'KICKOFF';
    kickoffTimer = 2.4;
    goalTimer = 0;
    goalLocked = false;
    ballMesh.quaternion.identity();
    syncFromRL(true);
    return;
  }
  const starts = [
    { x: -24, z: -12, heading: 0 },
    { x: -42, z: 14, heading: 0 },
    { x: 24, z: 12, heading: Math.PI },
    { x: 42, z: -14, heading: Math.PI }
  ];

  kickoffCount++;
  const takers = kickoffCount % 2 === 1 ? [0, 2] : [1, 3];

  cars.forEach((car, index) => {
    const start = starts[index];
    car.pos.set(start.x, 0, start.z);
    car.y = 0;
    car.vy = 0;
    car.vel.set(0, 0, 0);
    car.airborne = false;
    car.flipTimer = 0;
    car.flipAngle = 0;
    car.flipRate = 0;
    car.flipDir.set(0, 0, 0);
    car.jumpCooldown = 0;
    car.reverseTimer = 0;
    car.stuckTimer = 0;
    car.speed = 0;
    car.heading = start.heading;
    car.yawRate = 0;
    car.steerAngle = 0;
    car.wheelSpin = 0;
    car.pitch = 0;
    car.roll = 0;
    car.landImpact = 0;
    car.cooldown = 0;
    car.ballContactDecided = false;
    car.commitToRun = false;
    car.roleTimer = 0;
    car.flameTimer = 0;
    car.boost = 33;
    car.boostHold = 0;
    car.reactionTimer = 0;
    car.attackDriving = false;
    car.targetError.set(0, 0, 0);
    car.targetSmooth.copy(car.pos);
    car.role = index % 2 === 0 ? 'attack' : 'support';
    car.kickoffRole = takers.includes(index) ? 'kickoff' : 'support';
    car.orientation.set(0, Math.sin(start.heading / 2), 0, Math.cos(start.heading / 2));
    car.mesh.position.set(start.x, 0, start.z);
    car.mesh.rotation.set(0, start.heading, 0);
    car.chassis.rotation.set(0, 0, 0);
  });

  pads.forEach(pad => {
    pad.cooldown = 0;
    pad.mesh.visible = true;
    pad.inner.visible = true;
  });

  ball.pos.set(0, FIELD.ballRadius, 0);
  ball.vel.set(0, 0, 0);
  ball.spin.set(0, 0, 0);
  ball.resting = false;
  ballMesh.position.copy(ball.pos);
  ballMesh.quaternion.identity();
  matchState = 'KICKOFF';
  kickoffTimer = 1.6;
  kickoffPhase = 3.4;
  roleUpdateTimer = 0;
  goalTimer = 0;
  goalLocked = false;

  syncTransforms();
}

function scoreGoal(team) {
  if (team === 'blue') scoreBlue++; else scoreOrange++;
  const flash = document.createElement('div');
  flash.className = 'goal-flash show';
  flash.innerHTML = '<div>GOAL!</div>';
  document.body.appendChild(flash);
  window.setTimeout(() => flash.remove(), 1100);

  if (RL_MODE) {
    replay.focus = rlLastTouch ? rlLastTouch.car : 0;
    replay.team = team;
    explodeAt(ball.pos, team);
    sfx.goal();
    announceGoal(team);
  }
  goalTimer = 1.8;
  goalLocked = true;
  if (RL_MODE) {
    matchState = 'GOAL';
    return;
  }
  ball.vel.set(0, 0, 0);
  ball.spin.set(0, 0, 0);
  // Settle the ball deep in the net, clear of the frozen cars and the back netting.
  ball.pos.x = team === 'blue' ? HALF_L + 3.3 : -(HALF_L + 3.3);
  ball.pos.y = FIELD.ballRadius;
  ballMesh.position.copy(ball.pos);
  ballGlow.position.copy(ball.pos);
  for (let i = 0; i < 4; i++) resolveCarCarCollisions();
  syncTransforms();
  matchState = 'GOAL';
}

/* ============================== SIMULATION ============================== */

function assignRoles() {
  ['blue', 'orange'].forEach(team => {
    const mates = cars.filter(car => car.team === team);
    const attacker = mates.find(car => car.role === 'attack') || mates[0];
    const support = mates.find(car => car !== attacker);
    const attackerDistance = attacker.pos.distanceTo(ball.pos);
    const supportDistance = support.pos.distanceTo(ball.pos);

    // Only swap roles when the support is clearly much closer (8+ units) AND
    // the cooldown has elapsed, so both teammates don't pile into the ball.
    if (support.roleTimer <= 0 && supportDistance + 8 < attackerDistance) {
      attacker.role = 'support';
      support.role = 'attack';
      attacker.roleTimer = 1.5;
      support.roleTimer = 1.5;
    } else {
      attacker.role = 'attack';
      support.role = 'support';
    }
  });
}

function reflectWithinArena(value, limit) {
  const span = limit * 2;
  const wrapped = ((value + limit) % span + span) % span;
  return wrapped - limit;
}

function futureBallPosition(seconds, target) {
  return target.set(
    reflectWithinArena(ball.pos.x + ball.vel.x * seconds, HALF_L - BALL_RADIUS),
    FIELD.ballRadius,
    reflectWithinArena(ball.pos.z + ball.vel.z * seconds, HALF_W - BALL_RADIUS)
  );
}

// Closest boost pad that is ready to collect, with big pads worth a longer detour.
function nearestActivePad(car, maxDistance) {
  let best = null;
  let bestScore = Infinity;
  for (const pad of pads) {
    if (pad.cooldown > 0) continue;
    const distance = Math.hypot(pad.x - car.pos.x, pad.z - car.pos.z);
    if (distance > maxDistance) continue;
    const score = distance - (pad.big ? 14 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = pad;
    }
  }
  return best;
}

function chooseTarget(car) {
  if (car.reactionTimer <= 0) {
    car.reactionTimer = skill.reaction * rand(0.7, 1.3);
    const errorRadius = (1 - skill.accuracy) * 9;
    car.targetError.set(rand(-errorRadius, errorRadius), 0, rand(-errorRadius, errorRadius));
  }

  const ownGoalX = car.team === 'blue' ? -HALF_L : HALF_L;
  const attackDir = car.team === 'blue' ? 1 : -1;
  const target = new THREE.Vector3();
  const mate = cars.find(other => other.team === car.team && other !== car);
  const ballSpeed = Math.hypot(ball.vel.x, ball.vel.z);

  if (kickoffPhase > 0 && car.kickoffRole === 'kickoff') {
    target.copy(ball.pos);
  } else if (kickoffPhase > 0) {
    // The non-taker breaks wide instead of swarming the centre spot.
    target.set(ownGoalX * 0.5, 0, car.index === 1 ? -28 : 28);
  } else if (car.role === 'attack') {
    // Simpler, more direct attacker: aim at the ball and drive through it
    // toward the opponent goal. The contact geometry sends the ball where the
    // car is pointing, so approaching at an angle naturally angles the shot.
    const goalX = car.team === 'blue' ? HALF_L : -HALF_L;
    const lead = clamp((car.pos.distanceTo(ball.pos) - 3.5) / 55, 0, 0.4);
    const bx = ball.pos.x + ball.vel.x * lead;
    const bz = ball.pos.z + ball.vel.z * lead;
    const shotX = goalX - bx;
    const shotZ = (car.index % 2 === 0 ? -4 : 4) - bz;
    const shotLength = Math.hypot(shotX, shotZ) || 1;
    const sx = shotX / shotLength;
    const sz = shotZ / shotLength;
    const px = -sz;
    const pz = sx;
    const relX = car.pos.x - bx;
    const relZ = car.pos.z - bz;
    const along = relX * sx + relZ * sz;
    const side = relX * px + relZ * pz;
    const ballGap = Math.hypot(relX, relZ);

    // Commit to driving through the ball until overshoot or lost line.
    if (car.attackDriving) {
      if (along > 2 || Math.abs(side) > 8 || ballGap > 24) car.attackDriving = false;
    } else if (along < -0.5 && Math.abs(side) < 5 && ballGap < 20) {
      car.attackDriving = true;
    }

    if (car.attackDriving || ballGap < 5) {
      const glance = (Math.abs(side) < 0.5 ? (car.index % 2 === 0 ? 1 : -1) : Math.sign(side)) * 1.0;
      target.set(bx + sx * 14 + px * glance, 0, bz + sz * 14 + pz * glance);
    } else {
      const sideSign = Math.abs(side) < 0.5 ? (car.index % 2 === 0 ? 1 : -1) : Math.sign(side);
      const route = clamp((along + 2) / 10, 0, 1);
      const depth = 4 + route * 4;
      target.set(
        bx - sx * depth + px * sideSign * (2 + route * 5),
        0,
        bz - sz * depth + pz * sideSign * (2 + route * 5)
      );
    }
  } else {
    const mateZ = mate ? mate.pos.z : 0;
    const side = car.pos.z === mateZ
      ? (car.index % 2 === 0 ? 1 : -1)
      : Math.sign(car.pos.z - mateZ);
    const dangerZone = car.team === 'blue' ? ball.pos.x < -HALF_L + 24 : ball.pos.x > HALF_L - 24;
    const touchedByUs = lastTouch.team === car.team;
    const ballDistance = car.pos.distanceTo(ball.pos);

    const lowBoostPad = car.boost < 40 && !dangerZone && ballDistance > 14 && ballSpeed < 25
      ? nearestActivePad(car, 45)
      : null;

    if (lowBoostPad) {
      // Running low: rotate through a boost pad while the attacker holds the ball.
      target.set(lowBoostPad.x, 0, lowBoostPad.z);
    } else if (ballDistance > 26) {
      // Do not spectate from the other end: get back into the play.
      futureBallPosition(clamp(0.15 + ballSpeed * 0.005, 0.2, 0.45), target);
      target.z += side * 4;
    } else if (dangerZone) {
      // No keeper: sit upfield of the clearance instead of guarding the net.
      target.set(ball.pos.x + attackDir * 14, 0, ball.pos.z + side * 10);
    } else if (ballSpeed > 9) {
      // A big touch just happened. If it was ours, trail the ball for the
      // rebound; if it was theirs, cut the ball off along its path.
      const readTime = clamp(0.22 + ballSpeed * 0.006, 0.25, 0.6);
      futureBallPosition(readTime, target);
      const shift = touchedByUs ? -6 : 5;
      const inverseSpeed = 1 / Math.max(1, ballSpeed);
      target.x += ball.vel.x * inverseSpeed * shift;
      target.z += ball.vel.z * inverseSpeed * shift;
      target.z += side * (touchedByUs ? 7 : 3);
    } else {
      // Slow or contested ball: stay close behind the play as the second
      // option, offset to the side for a rebound or pass.
      target.set(ball.pos.x - attackDir * 9, 0, ball.pos.z + side * 8);
      // Only challenge when the partner is not already closer, so the two team
      // mates stop piling into the same ball.
      const mateBallDistance = mate ? mate.pos.distanceTo(ball.pos) : Infinity;
      if (ballDistance < 9 && mateBallDistance > ballDistance) target.copy(ball.pos);
    }
  }

  target.y = 0;
  // Aim error fades as the attacker closes in, so rank shows up in reads and
  // whiffs rather than in cars driving visibly past a ball they are touching.
  const closeness = clamp(car.pos.distanceTo(ball.pos) / 12, 0.4, 1);
  const errorScale = car.kickoffRole === 'kickoff' ? 1 : (car.role === 'attack' ? 0.8 * closeness : 0.35);
  target.addScaledVector(car.targetError, errorScale);
  target.x = clamp(target.x, -TARGET_LIMIT_X, TARGET_LIMIT_X);
  target.z = clamp(target.z, -TARGET_LIMIT_Z, TARGET_LIMIT_Z);
  return target;
}

function updateCar(car, dt) {
  car.cooldown = Math.max(0, car.cooldown - dt);
  car.reactionTimer -= dt;
  car.flameTimer = Math.max(0, car.flameTimer - dt);
  car.jumpCooldown = Math.max(0, car.jumpCooldown - dt);
  car.reverseTimer = Math.max(0, car.reverseTimer - dt);
  car.boostHold = Math.max(0, car.boostHold - dt);
  car.flame.visible = car.flameTimer > 0;

  const rawTarget = chooseTarget(car);
  if (car.targetSmooth.lengthSq() === 0) car.targetSmooth.copy(rawTarget);
  // Faster target tracking so cars don't lag behind their intended position.
  car.targetSmooth.lerp(rawTarget, Math.min(1, dt * 15));
  const target = car.targetSmooth;
  const toTarget = new THREE.Vector3().subVectors(target, car.pos);
  toTarget.y = 0;
  const distance = toTarget.length();

  let forward = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  let right = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const vForward = car.vel.x * forward.x + car.vel.z * forward.z;
  const horizontalSpeed = Math.hypot(car.vel.x, car.vel.z);
  const onGround = !car.airborne && car.y <= 0.001;

  let difference = 0;
  if (distance > 0.1) {
    // The car mesh points along its local +X axis, so world forward is (cos h, -sin h).
    const desiredHeading = Math.atan2(-toTarget.z, toTarget.x);
    difference = angleDelta(car.heading, desiredHeading);
  }
  const alignment = Math.cos(difference);

  // Decide in short holds so boost is a sustained burn, not per-frame flicker.
  if (car.boostHold <= 0 && car.boost > 0 && onGround && distance > 12 && alignment > 0.6) {
    if (Math.random() < 0.35 + skill.boost * 0.65) {
      car.boostHold = 0.4 + skill.boost * 0.5;
    }
  }
  const boosting = car.boostHold > 0 && car.boost > 0;
  const baseSpeed = skill.speed * (car.isPlayer ? 1 : 0.96);
  const maxSpeed = baseSpeed * (boosting ? 1.55 : 1);

  const ballDistance = Math.hypot(ball.pos.x - car.pos.x, ball.pos.z - car.pos.z);

  // Jumping and front flips — kickoff takers launch into the ball, field players challenge aerials.
  if (onGround && car.jumpCooldown <= 0 && !goalLocked) {
    // Jump only when the ball is ahead and contact is about to happen. Before,
    // any bouncing ball within 10 units made the car leap at once, and it then
    // floated for over a second with almost no steering.
    const toBallX = ball.pos.x - car.pos.x;
    const toBallZ = ball.pos.z - car.pos.z;
    const ballAhead = ballDistance > 0.01 ? (toBallX * forward.x + toBallZ * forward.z) / ballDistance : 1;
    const reach = 2.5 + Math.max(0, car.speed) * 0.35;
    // Convert "chance per 0.15 s" into a chance for this physics step.
    const roll = chance => Math.random() < 1 - Math.pow(1 - chance, dt / 0.15);
    const kickoffFlip = kickoffPhase > 1.6 && car.kickoffRole === 'kickoff' && ballDistance < 7 && car.speed > 6;
    const aerialChallenge = ball.pos.y > 3.5 && ballDistance < reach + 4 && ballAhead > 0.7 && car.speed > 6 &&
      (car.role === 'attack' || car.kickoffRole === 'kickoff') && roll(0.45 + skill.accuracy * 0.5);
    const defensiveAerial = car.role === 'support' && ball.pos.y > 3 && ballDistance < reach + 2 && ballAhead > 0.8 &&
      (car.team === 'blue' ? ball.pos.x < 0 : ball.pos.x > 0) && roll(0.3 + skill.accuracy * 0.4);
    const lowFlip = ball.pos.y > FIELD.ballRadius + 1 && ballDistance < reach && ballAhead > 0.85 && car.speed > 10 &&
      roll(0.15 + skill.accuracy * 0.3);
    if (kickoffFlip || aerialChallenge || defensiveAerial || lowFlip) {
      const flip = kickoffFlip || lowFlip || defensiveAerial || ball.pos.y > 4.5;
      car.vel.y = flip ? JUMP_SPEED * 0.72 : JUMP_SPEED;
      car.airborne = true;
      car.jumpCooldown = 0.8;
      if (flip) {
        // A front flip rotates the nose down and carries momentum along the nose.
        car.flipDir.copy(forward);
        car.flipTimer = FLIP_DURATION;
        car.flipRate = -(Math.PI * 2) / FLIP_DURATION;
        car.flipAngle = 0;
        car.vel.x += forward.x * FLIP_FORWARD_BOOST;
        car.vel.z += forward.z * FLIP_FORWARD_BOOST;
      }
    }
  }

  // Steering: yaw rate builds with speed and is limited by tyre grip and inertia.
  const speedAbs = Math.hypot(car.vel.x, car.vel.z);
  const speedRatio = clamp(speedAbs / Math.max(4, maxSpeed), 0, 1);
  const againstWall = Math.abs(car.pos.x) > TARGET_LIMIT_X || Math.abs(car.pos.z) > TARGET_LIMIT_Z;
  const wallEscape = againstWall && speedAbs < 5 && !car.airborne;
  // Tyres only steer a car that is rolling: authority builds with speed so cars
  // swing through an arc instead of pivoting on the spot like a tank.
  const steerAuthority = car.airborne ? 0.4 : 0.3 + 0.7 * clamp(speedAbs / 10, 0, 1);
  const turnScale = 1 - speedRatio * 0.38;
  const targetYaw = clamp(difference / 0.55, -1, 1) * skill.turn * (car.isPlayer ? 1 : 0.95) *
    steerAuthority * turnScale * (wallEscape ? 2.0 : 1);
  const yawAccel = car.airborne ? 7 : (wallEscape ? 20 : 11);
  car.yawRate += clamp(targetYaw - car.yawRate, -yawAccel * dt, yawAccel * dt);
  car.yawRate = clamp(car.yawRate, -6, 6);
  const turned = car.yawRate * dt;
  car.heading += turned;
  car.heading = Math.atan2(Math.sin(car.heading), Math.cos(car.heading));
  if (onGround && !wallEscape) {
    // Tyres carry momentum around a corner: the velocity swings with the nose
    // instead of bleeding speed away. A car that is already sliding sideways
    // (after a hit) gets no help, so impacts still send it spinning off line.
    const slipNow = Math.abs(car.vel.x * right.x + car.vel.z * right.z);
    const follow = 0.85 * clamp(1 - slipNow / 5, 0, 1);
    const cosT = Math.cos(turned * follow);
    const sinT = Math.sin(turned * follow);
    const vx = car.vel.x;
    const vz = car.vel.z;
    car.vel.x = vx * cosT + vz * sinT;
    car.vel.z = -vx * sinT + vz * cosT;
  }
  car.steerAngle += (clamp(difference / 0.5, -1, 1) * 0.45 - car.steerAngle) * Math.min(1, dt * 10);

  if (car.flipTimer > 0) {
    car.flipTimer = Math.max(0, car.flipTimer - dt);
    car.flipAngle += car.flipRate * dt;
    if (car.flipTimer === 0) {
      car.flipAngle = 0;
      car.flipRate = 0;
    }
  }

  // Gravity and vertical integration.
  if (car.airborne || car.y > 0) {
    car.vel.y -= GRAVITY * dt;
  } else {
    car.vel.y = 0;
  }
  car.y += car.vel.y * dt;
  if (car.y <= 0) {
    if (car.airborne && car.vel.y < -3) {
      // Landing compresses the suspension and scrubs a little speed.
      car.landImpact = clamp(-car.vel.y / 14, 0, 1);
      car.vel.x *= 0.94;
      car.vel.z *= 0.94;
    }
    car.y = 0;
    car.vel.y = 0;
    car.airborne = false;
    car.flipTimer = 0;
    car.flipAngle = 0;
    car.flipRate = 0;
  }
  car.landImpact = Math.max(0, car.landImpact - dt * 3.5);

  // Recompute the basis after steering before applying drive forces.
  forward = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  right = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));

  const cornering = clamp(0.4 + 0.6 * alignment, 0.4, 1);
  const approachSpeed = Math.min(maxSpeed, Math.max(6, distance * 2.4) * (boosting ? 1.4 : 1));
  let desiredSpeed = approachSpeed * cornering;
  // Chasers keep rolling while they line up instead of crawling to a stop at
  // every waypoint and then having to accelerate again for the touch.
  const chasing = car.role === 'attack' || (kickoffPhase > 0 && car.kickoffRole === 'kickoff');
  if (chasing && alignment > 0.5 && ballDistance < 30) desiredSpeed = Math.max(desiredSpeed, maxSpeed * 0.55);
  if (car.reverseTimer > 0) desiredSpeed = -Math.min(10, baseSpeed * 0.35);
  desiredSpeed = clamp(desiredSpeed, -maxSpeed * 0.45, maxSpeed);

  const speedError = desiredSpeed - vForward;
  let throttleAccel = 0;
  if (car.reverseTimer > 0) {
    throttleAccel = -REVERSE_ACCEL;
  } else if (Math.abs(speedError) > 0.15) {
    throttleAccel = clamp(speedError * 4.2, -BRAKE_DECEL, DRIVE_ACCEL);
    // Never add drive above top speed, but still brake hard when the next
    // touch is behind us or the car is carrying too much speed into a turn.
    if (vForward > maxSpeed && throttleAccel > 0) throttleAccel = 0;
  }

  if (onGround) {
    car.vel.x += forward.x * throttleAccel * dt;
    car.vel.z += forward.z * throttleAccel * dt;

    const speedNow = Math.hypot(car.vel.x, car.vel.z);
    if (boosting && vForward < maxSpeed) {
      const falloff = 1 - clamp((vForward - baseSpeed * 0.75) / Math.max(1, maxSpeed - baseSpeed * 0.75), 0, 1) * 0.75;
      car.vel.x += forward.x * BOOST_ACCEL * falloff * dt;
      car.vel.z += forward.z * BOOST_ACCEL * falloff * dt;
    }

    // Tyre grip keeps the car planted through corners. A large sideways
    // velocity can only come from a bump or wall hit, so let those slide a
    // little before the tyres bite instead of snapping the car in place.
    const lateralNow = car.vel.x * right.x + car.vel.z * right.z;
    const slideGrip = Math.abs(lateralNow) > 5 ? LATERAL_SLIDE_GRIP : LATERAL_GRIP;
    const grip = slideGrip * (1 - 0.2 * clamp(speedNow / Math.max(1, maxSpeed), 0, 1));
    const lateralCorrection = clamp(-lateralNow, -grip * dt, grip * dt);
    car.vel.x += right.x * lateralCorrection;
    car.vel.z += right.z * lateralCorrection;

    // Rolling resistance plus aerodynamic drag.
    const speedAfter = Math.hypot(car.vel.x, car.vel.z);
    if (speedAfter > 0.0001) {
      const dragAccel = 0.28 + 0.0021 * speedAfter * speedAfter;
      const drop = Math.min(speedAfter, dragAccel * dt);
      car.vel.x -= (car.vel.x / speedAfter) * drop;
      car.vel.z -= (car.vel.z / speedAfter) * drop;
    }
  } else {
    // Aerial control: pitch, yaw and roll let the car fly toward the ball
    // instead of just arcing under gravity. Steering already updates yaw;
    // pitch and roll follow the target so the nose points where it needs to.
    const aerialTarget = new THREE.Vector3().subVectors(target, car.pos);
    aerialTarget.y -= 1.2;
    const aerialDist = aerialTarget.length();
    if (aerialDist > 0.5) {
      const desiredPitch = clamp(aerialTarget.y / aerialDist * 0.6, -0.5, 0.5);
      const desiredRoll = clamp(-car.yawRate * 0.05, -0.4, 0.4);
      car.pitch += (desiredPitch - car.pitch) * Math.min(1, dt * 6);
      car.roll += (desiredRoll - car.roll) * Math.min(1, dt * 6);
    }
    // Keep boosting in the air when the ball is ahead and boost is available.
    if (car.boostHold <= 0 && car.boost > 0 && ballDistance < 20) {
      const toBallX = ball.pos.x - car.pos.x;
      const toBallZ = ball.pos.z - car.pos.z;
      const ballAhead = toBallX * forward.x + toBallZ * forward.z > 0;
      if (ballAhead) car.boostHold = 0.3;
    }
    if (boosting) {
      // Boost in the air is stronger and steerable, letting cars fly to the ball.
      const boostScale = 1.35;
      car.vel.x += forward.x * BOOST_ACCEL * boostScale * dt;
      car.vel.z += forward.z * BOOST_ACCEL * boostScale * dt;
      car.vel.y += 0.15 * BOOST_ACCEL * dt;
    }
    const airDrag = 1 - Math.min(0.25, 0.12 * dt);
    car.vel.x *= airDrag;
    car.vel.z *= airDrag;
    car.vel.y *= 1 - Math.min(0.08, 0.04 * dt);
  }

  // Self-propelled speed is capped, but collisions may briefly carry a car faster.
  const forwardNow = car.vel.x * forward.x + car.vel.z * forward.z;
  if (forwardNow > maxSpeed + 4) {
    const over = (forwardNow - maxSpeed - 4) * Math.min(0.4, 1.6 * dt);
    car.vel.x -= forward.x * over;
    car.vel.z -= forward.z * over;
  }

  car.pos.x += car.vel.x * dt;
  car.pos.z += car.vel.z * dt;
  resolveCarSideRamps(car);
  clampCarToArena(car);
  car.speed = car.vel.x * forward.x + car.vel.z * forward.z;
  car.vy = car.vel.y;

  // Detect being wedged against a wall or another car, then reverse out.
  const pointingOut = (Math.abs(car.pos.x) > HALF_L - 4 && forward.x * car.pos.x > 0) ||
    (Math.abs(car.pos.z) > HALF_W - 4 && forward.z * car.pos.z > 0);
  const barelyMoving = Math.abs(car.speed) < 2.5 && distance > 6 && !car.airborne;
  if (barelyMoving || (againstWall && pointingOut && distance > 6)) {
    car.stuckTimer += dt;
  } else {
    car.stuckTimer = Math.max(0, car.stuckTimer - dt * 2);
  }
  if (car.stuckTimer > 0.7 && car.reverseTimer <= 0) {
    car.reverseTimer = 1.1;
    car.stuckTimer = 0;
  }

  if (boosting) {
    car.boost = Math.max(0, car.boost - 28 * dt);
    car.flameTimer = 0.12;
  }
  car.boost = clamp(car.boost, 0, BOOST_MAX);

  // Suspension lean, body roll and wheel rotation for the renderer.
  const visualAccel = onGround ? throttleAccel + (boosting ? BOOST_ACCEL * 0.6 : 0) : 0;
  const targetPitch = clamp(visualAccel * 0.006, -0.11, 0.11);
  const targetRoll = clamp(-car.yawRate * Math.max(0, car.speed) * 0.008, -0.18, 0.18);
  car.pitch += (targetPitch - car.pitch) * Math.min(1, dt * 7);
  car.roll += (targetRoll - car.roll) * Math.min(1, dt * 7);
  car.wheelSpin = (car.wheelSpin + (car.speed / 0.62) * dt) % (Math.PI * 2);
}

/* ============================== COLLISIONS ============================== */

const CAR_HALF_LENGTH = 2.05;
const CAR_HALF_WIDTH = 1.45;
const CAR_HALF_HEIGHT = 1.2;
const CAR_HEIGHT = CAR_HALF_HEIGHT * 2;
const CAR_MASS = 1.5;
const CAR_YAW_INERTIA = 7.5;
const BALL_MASS = ball.mass;
const BALL_RADIUS = ball.radius;
const BALL_INERTIA = 0.4 * BALL_MASS * BALL_RADIUS * BALL_RADIUS;
const BALL_MAX_SPEED = 85;
const CAR_RESTITUTION = 0.28;
const CAR_BALL_RESTITUTION = 0.58;
const BALL_WALL_RESTITUTION = 0.68;
const BALL_GROUND_RESTITUTION = 0.54;
const BALL_WALL_FRICTION = 0.26;
const BALL_GROUND_FRICTION = 1.0;
const ROLLING_RESISTANCE = 0.16;
const AIR_DRAG = 0.0016;
const MAGNUS = 0.0019;
const SPIN_DAMPING = 0.32;
const WALL_X = HALF_L - ARENA_WALL_INSET;
const WALL_Z = HALF_W - ARENA_WALL_INSET;
const CORNER_CENTER_X = HALF_L - CORNER_R;
const CORNER_CENTER_Z = HALF_W - CORNER_R;
const GOAL_FRAME_RADIUS = 0.28;

const DRIVE_ACCEL = 16;
const BRAKE_DECEL = 32;
const REVERSE_ACCEL = 9;
const BOOST_ACCEL = 20;
const LATERAL_GRIP = 78;
const LATERAL_SLIDE_GRIP = 26;
const JUMP_SPEED = 9.0;
const FLIP_DURATION = 0.55;
const FLIP_FORWARD_BOOST = 5.5;

function forwardOf(car) {
  return { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
}

function rightOf(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

function carSupportRadius(car, nx, nz) {
  const f = forwardOf(car);
  const r = rightOf(car);
  return Math.abs(f.x * nx + f.z * nz) * CAR_HALF_LENGTH +
    Math.abs(r.x * nx + r.z * nz) * CAR_HALF_WIDTH;
}

function sideRampOffset(y) {
  return Math.min(SIDE_RAMP_HEIGHT, Math.max(0, y));
}

// A car that is in the air above the side ramp rests on the ramp surface instead
// of being snapped sideways: it is lifted out along the ramp normal and its
// velocity into the slope is removed, so it slides back down under gravity.
// Grounded cars (y = 0) hit the plain wall, which clampCarToArena handles.
function resolveCarSideRamps(car) {
  if (car.y <= 0.001 || car.y >= SIDE_RAMP_HEIGHT) return;
  const support = carSupportRadius(car, 0, 1);
  for (const side of [-1, 1]) {
    // How far the car's outer edge sticks out past the ramp surface at its height.
    const overlap = side * car.pos.z + support - (WALL_Z + car.y);
    if (overlap <= 0) continue;
    // Moving out along the 45° normal by overlap / 2 in y and z cancels the overlap.
    car.y += overlap * 0.5;
    car.pos.z -= side * overlap * 0.5;
    const vn = (car.vel.y - side * car.vel.z) / Math.SQRT2;
    if (vn < 0) {
      car.vel.y -= (vn * 1.05) / Math.SQRT2;
      car.vel.z += (side * vn * 1.05) / Math.SQRT2;
    }
  }
}

function clampCarToArena(car) {
  const limitX = WALL_X - carSupportRadius(car, 1, 0);
  const sideOffset = sideRampOffset(car.y);
  const limitZ = WALL_Z + sideOffset - carSupportRadius(car, 0, 1);

  if (car.pos.x > limitX) {
    car.pos.x = limitX;
    if (car.vel.x > 0) car.vel.x *= -0.18;
  } else if (car.pos.x < -limitX) {
    car.pos.x = -limitX;
    if (car.vel.x < 0) car.vel.x *= -0.18;
  }
  if (car.pos.z > limitZ) {
    car.pos.z = limitZ;
    if (car.vel.z > 0) car.vel.z *= -0.18;
  } else if (car.pos.z < -limitZ) {
    car.pos.z = -limitZ;
    if (car.vel.z < 0) car.vel.z *= -0.18;
  }

  // The four corner walls are quarter cylinders, so use a radial constraint there.
  if (Math.abs(car.pos.x) > CORNER_CENTER_X && Math.abs(car.pos.z) > CORNER_CENTER_Z) {
    const cx = Math.sign(car.pos.x) * CORNER_CENTER_X;
    const cz = Math.sign(car.pos.z) * CORNER_CENTER_Z;
    const dx = car.pos.x - cx;
    const dz = car.pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;
      const maxRadius = CORNER_R - ARENA_WALL_INSET - carSupportRadius(car, nx, nz);
      if (dist > maxRadius) {
        car.pos.x = cx + nx * maxRadius;
        car.pos.z = cz + nz * maxRadius;
        const vn = car.vel.x * nx + car.vel.z * nz;
        if (vn > 0) {
          car.vel.x -= nx * vn * 1.18;
          car.vel.z -= nz * vn * 1.18;
        }
      }
    }
  }
}

function resolveCarCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.y >= b.y + CAR_HEIGHT || b.y >= a.y + CAR_HEIGHT) continue;

      const af = forwardOf(a);
      const ar = rightOf(a);
      const bf = forwardOf(b);
      const br = rightOf(b);
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;

      // Separating-axis test on the two oriented car footprints.
      const axes = [[af.x, af.z], [ar.x, ar.z], [bf.x, bf.z], [br.x, br.z]];
      let minOverlap = Infinity;
      let nx = 0;
      let nz = 0;
      let separated = false;

      for (const [ax, az] of axes) {
        const centreDistance = dx * ax + dz * az;
        const overlap = carSupportRadius(a, ax, az) + carSupportRadius(b, ax, az) - Math.abs(centreDistance);
        if (overlap <= 0) {
          separated = true;
          break;
        }
        if (overlap < minOverlap) {
          minOverlap = overlap;
          const sign = centreDistance >= 0 ? 1 : -1;
          nx = ax * sign;
          nz = az * sign;
        }
      }
      if (separated || minOverlap <= 0) continue;
      if (dx * nx + dz * nz < 0) {
        nx = -nx;
        nz = -nz;
      }

      // A faster car carries more effective mass, so it bulldozes a slower one
      // while still losing speed itself. Both cars always feel the impact.
      const speedA = Math.abs(a.speed);
      const speedB = Math.abs(b.speed);
      const speedSum = speedA + speedB + 1;
      const massA = CAR_MASS * (0.9 + 0.5 * speedA / speedSum);
      const massB = CAR_MASS * (0.9 + 0.5 * speedB / speedSum);

      const penetration = minOverlap * 0.92;
      const pushA = massB / (massA + massB);
      const pushB = massA / (massA + massB);
      a.pos.x -= nx * penetration * pushA;
      a.pos.z -= nz * penetration * pushA;
      b.pos.x += nx * penetration * pushB;
      b.pos.z += nz * penetration * pushB;
      clampCarToArena(a);
      clampCarToArena(b);

      // Contact patch near the middle of the overlapping faces.
      const supportA = carSupportRadius(a, nx, nz);
      const supportB = carSupportRadius(b, nx, nz);
      const contactX = (a.pos.x + nx * supportA + b.pos.x - nx * supportB) * 0.5;
      const contactZ = (a.pos.z + nz * supportA + b.pos.z - nz * supportB) * 0.5;
      const rax = contactX - a.pos.x;
      const raz = contactZ - a.pos.z;
      const rbx = contactX - b.pos.x;
      const rbz = contactZ - b.pos.z;

      const vaX = a.vel.x + a.yawRate * raz;
      const vaZ = a.vel.z - a.yawRate * rax;
      const vbX = b.vel.x + b.yawRate * rbz;
      const vbZ = b.vel.z - b.yawRate * rbx;
      const relativeX = vbX - vaX;
      const relativeZ = vbZ - vaZ;
      const closingSpeed = relativeX * nx + relativeZ * nz;
      if (closingSpeed >= 0) continue;

      const raCrossN = rax * nz - raz * nx;
      const rbCrossN = rbx * nz - rbz * nx;
      const denominator = 1 / massA + 1 / massB +
        (raCrossN * raCrossN + rbCrossN * rbCrossN) / CAR_YAW_INERTIA;
      const impulse = (-(1 + CAR_RESTITUTION) * closingSpeed) / denominator;

      a.vel.x -= (nx * impulse) / massA;
      a.vel.z -= (nz * impulse) / massA;
      b.vel.x += (nx * impulse) / massB;
      b.vel.z += (nz * impulse) / massB;
      a.yawRate = clamp(a.yawRate - (raCrossN * impulse) / CAR_YAW_INERTIA, -3.5, 3.5);
      b.yawRate = clamp(b.yawRate + (rbCrossN * impulse) / CAR_YAW_INERTIA, -3.5, 3.5);

      const afNow = forwardOf(a);
      const bfNow = forwardOf(b);
      a.speed = a.vel.x * afNow.x + a.vel.z * afNow.z;
      b.speed = b.vel.x * bfNow.x + b.vel.z * bfNow.z;
    }
  }
}

function resolveCarBallCollision(car) {
  if (goalLocked) return;

  const f = forwardOf(car);
  const r = rightOf(car);
  const centreY = car.y + CAR_HALF_HEIGHT;
  const rx = ball.pos.x - car.pos.x;
  const ry = ball.pos.y - centreY;
  const rz = ball.pos.z - car.pos.z;

  // Ball position in the car's oriented box (local X = nose, Y = up, Z = side).
  const localX = rx * f.x + rz * f.z;
  const localY = ry;
  const localZ = rx * r.x + rz * r.z;
  const clampedX = clamp(localX, -CAR_HALF_LENGTH, CAR_HALF_LENGTH);
  const clampedY = clamp(localY, -CAR_HALF_HEIGHT, CAR_HALF_HEIGHT);
  const clampedZ = clamp(localZ, -CAR_HALF_WIDTH, CAR_HALF_WIDTH);

  const offsetX = localX - clampedX;
  const offsetY = localY - clampedY;
  const offsetZ = localZ - clampedZ;
  const distance = Math.hypot(offsetX, offsetY, offsetZ);
  if (distance >= BALL_RADIUS) return;

  let localNormalX = 0;
  let localNormalY = 0;
  let localNormalZ = 0;
  let penetration;

  if (distance > 0.0001) {
    localNormalX = offsetX / distance;
    localNormalY = offsetY / distance;
    localNormalZ = offsetZ / distance;
    penetration = BALL_RADIUS - distance;
  } else {
    // Ball centre is inside the box: eject through the nearest face.
    const faceX = CAR_HALF_LENGTH - Math.abs(localX);
    const faceY = CAR_HALF_HEIGHT - Math.abs(localY);
    const faceZ = CAR_HALF_WIDTH - Math.abs(localZ);
    if (faceX <= faceY && faceX <= faceZ) {
      localNormalX = localX >= 0 ? 1 : -1;
      penetration = BALL_RADIUS + faceX;
    } else if (faceY <= faceZ) {
      localNormalY = localY >= 0 ? 1 : -1;
      penetration = BALL_RADIUS + faceY;
    } else {
      localNormalZ = localZ >= 0 ? 1 : -1;
      penetration = BALL_RADIUS + faceZ;
    }
  }

  const nx = f.x * localNormalX + r.x * localNormalZ;
  const ny = localNormalY;
  const nz = f.z * localNormalX + r.z * localNormalZ;

  // Hard separation: no contact can ever leave the ball inside the bodywork.
  // The light ball takes most of the correction, the heavy car a small share.
  const carShare = BALL_MASS / (BALL_MASS + CAR_MASS);
  ball.pos.x += nx * penetration * (1 - carShare);
  ball.pos.y += ny * penetration * (1 - carShare);
  ball.pos.z += nz * penetration * (1 - carShare);
  car.pos.x -= nx * penetration * carShare;
  car.pos.z -= nz * penetration * carShare;
  clampCarToArena(car);

  // A contact session lasts while the ball stays against the car. Whether the
  // rookie whiffs is decided once per session, so a car driving into the ball
  // gets one consistent response instead of a fresh dice roll every substep.
  if (elapsed - car.lastBallContact > 0.15) {
    car.whiffContact = Math.random() < skill.whiff;
  }
  car.lastBallContact = elapsed;

  const contactX = car.pos.x + f.x * clampedX + r.x * clampedZ;
  const contactY = centreY + clampedY;
  const contactZ = car.pos.z + f.z * clampedX + r.z * clampedZ;
  const rax = contactX - car.pos.x;
  const raz = contactZ - car.pos.z;
  const carPointVX = car.vel.x + car.yawRate * raz;
  const carPointVZ = car.vel.z - car.yawRate * rax;

  const relativeX = ball.vel.x - carPointVX;
  const relativeY = ball.vel.y - car.vel.y;
  const relativeZ = ball.vel.z - carPointVZ;
  const approach = relativeX * nx + relativeY * ny + relativeZ * nz;
  // Only a ball moving into the car gets an impulse, so no hit cooldown is needed
  // and the ball can never slip through the bodywork between touches.
  if (approach > -0.02) return;

  const whiffed = car.whiffContact;
  // Restitution fades in with impact speed: hard hits bounce, while a slow ball
  // carried on the nose or roof settles instead of jittering.
  const closingSpeed = -approach;
  const restitution = whiffed ? 0.08 : CAR_BALL_RESTITUTION * clamp((closingSpeed - 0.4) / 2.2, 0, 1);
  const raCrossN = raz * nx - rax * nz;
  const denominator = 1 / BALL_MASS + 1 / CAR_MASS + (raCrossN * raCrossN) / CAR_YAW_INERTIA;
  const impulse = (-(1 + restitution) * approach) / denominator;
  const effectiveImpulse = whiffed ? impulse * 0.18 : impulse;

  // A front flip should not launch the ball like a trampoline: the nose-down
  // rotation eats a little of the transfer instead of adding free speed.
  const flipTouch = car.flipTimer > 0;
  const ballImpulse = effectiveImpulse * (flipTouch ? 0.8 : 1);
  const contactSpeed = Math.hypot(car.vel.x, car.vel.z);
  const contactVX = car.vel.x;
  const contactVZ = car.vel.z;

  ball.vel.x += (nx * ballImpulse) / BALL_MASS;
  ball.vel.y += (ny * ballImpulse) / BALL_MASS;
  ball.vel.z += (nz * ballImpulse) / BALL_MASS;
  car.vel.x -= (nx * effectiveImpulse) / CAR_MASS;
  car.vel.z -= (nz * effectiveImpulse) / CAR_MASS;
  car.yawRate = clamp(car.yawRate - (raCrossN * effectiveImpulse) / CAR_YAW_INERTIA, -4, 4);

  // Tangential friction turns glancing hits into realistic spin.
  const tangentX = relativeX - nx * approach;
  const tangentY = relativeY - ny * approach;
  const tangentZ = relativeZ - nz * approach;
  const tangentSpeed = Math.hypot(tangentX, tangentY, tangentZ);
  if (!whiffed && tangentSpeed > 0.001) {
    const jt = Math.min(0.45 * impulse, (tangentSpeed * BALL_MASS) / 3.5);
    const ux = tangentX / tangentSpeed;
    const uy = tangentY / tangentSpeed;
    const uz = tangentZ / tangentSpeed;
    ball.vel.x -= (ux * jt) / BALL_MASS;
    ball.vel.y -= (uy * jt) / BALL_MASS;
    ball.vel.z -= (uz * jt) / BALL_MASS;
    const bx = -nx * BALL_RADIUS;
    const by = -ny * BALL_RADIUS;
    const bz = -nz * BALL_RADIUS;
    const ix = -ux * jt;
    const iy = -uy * jt;
    const iz = -uz * jt;
    ball.spin.x += (by * iz - bz * iy) / BALL_INERTIA;
    ball.spin.y += (bz * ix - bx * iz) / BALL_INERTIA;
    ball.spin.z += (bx * iy - by * ix) / BALL_INERTIA;
  }

  // Effects, commentary and pinch tracking fire once per real hit, not on every
  // substep of a slow carry.
  const newHit = closingSpeed > 1.0 && elapsed - car.lastHitEvent > 0.25;
  if (newHit) car.lastHitEvent = elapsed;

  if (!whiffed) {
    // The contact itself decides where the ball goes: no scripted aim force.
    // Better players start from a cleaner approach angle and hit harder.
    // No scripted spin: rotation comes only from the tangential contact above.
    if (newHit) {
      car.flameTimer = Math.max(car.flameTimer, 0.14);
      ballGlow.intensity = 1.5;

      if (car.isPlayer && skillKey === 'bronze' && Math.random() < 0.12) {
      }
    }
  } else if (newHit && car.isPlayer && Math.random() < 0.18) {
  }

  if (ball.spin.lengthSq() > 2025) ball.spin.setLength(45);
  const speed = ball.vel.length();
  if (speed > BALL_MAX_SPEED) ball.vel.multiplyScalar(BALL_MAX_SPEED / speed);

  if (!whiffed && newHit) {
    pinchContacts.push({
      car: car.index,
      nx, ny, nz,
      speed: contactSpeed,
      vx: contactVX,
      vz: contactVZ,
      time: elapsed,
      pinched: false
    });
  }

  lastTouch.team = car.team;
  lastTouch.car = car.index;
  lastTouch.time = elapsed;
  lastTouch.speed = ball.vel.length();

  const cf = forwardOf(car);
  car.speed = car.vel.x * cf.x + car.vel.z * cf.z;
}

// Two cars meeting on opposite sides of the ball squeeze it upward. The pop
// comes from the contact speeds alone, so it is identical at every rank.
function resolveBallPinch() {
  for (let i = pinchContacts.length - 1; i >= 0; i--) {
    if (elapsed - pinchContacts[i].time > 0.05) pinchContacts.splice(i, 1);
  }
  if (pinchContacts.length < 2) return;
  for (let i = 0; i < pinchContacts.length; i++) {
    const a = pinchContacts[i];
    if (a.pinched || Math.abs(a.ny) > 0.6) continue;
    for (let j = i + 1; j < pinchContacts.length; j++) {
      const b = pinchContacts[j];
      if (b.pinched || b.car === a.car || Math.abs(b.ny) > 0.6) continue;
      if (elapsed - b.time > 0.05) continue;
      // Only count contacts pushing from opposite sides of the ball.
      if (a.nx * b.nx + a.nz * b.nz > -0.35) continue;
      const closing = a.speed + b.speed;
      if (closing < 14) continue;
      const pop = closing * 0.3;
      // Cancel the sideways squirt from resolving the two hits in sequence;
      // the ball should rise out of the pinch with the net push, not fire
      // out of one side at full speed.
      const total = a.speed + b.speed;
      const netX = (a.vx * a.speed + b.vx * b.speed) / total;
      const netZ = (a.vz * a.speed + b.vz * b.speed) / total;
      ball.vel.x = netX * 0.35;
      ball.vel.z = netZ * 0.35;
      ball.vel.y = Math.max(ball.vel.y, pop);
      a.pinched = true;
      b.pinched = true;
      pinchCount++;
      lastPinch = {
        a: a.car, b: b.car,
        closing: +closing.toFixed(1),
        vy: +pop.toFixed(1),
        time: +elapsed.toFixed(2)
      };
      return;
    }
  }
}

function syncTransforms() {
  cars.forEach(car => {
    car.mesh.position.set(car.pos.x, car.y, car.pos.z);
    car.mesh.rotation.set(0, car.heading, 0);
    car.chassis.rotation.set(car.roll, 0, car.flipAngle + car.pitch);
    car.chassis.position.y = -car.landImpact * 0.18;
    car.wheels.forEach((wheel, index) => {
      wheel.rotation.y = index < 2 ? car.steerAngle : 0;
      wheel.rotation.z = car.wheelSpin;
    });
    const f = forwardOf(car);
    car.speed = car.vel.x * f.x + car.vel.z * f.z;
  });
  ballMesh.position.copy(ball.pos);
  ballGlow.position.copy(ball.pos);
}

function updateBoostPads(dt) {
  for (const pad of pads) {
    if (pad.cooldown > 0) {
      pad.cooldown -= dt;
      if (pad.cooldown <= 0) {
        pad.cooldown = 0;
        pad.mesh.visible = true;
        pad.inner.visible = true;
      }
      continue;
    }

    for (const car of cars) {
      if (car.y > 2.2 || car.boost >= BOOST_MAX) continue;
      const distance = Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z);
      if (distance > pad.radius) continue;

      car.boost = Math.min(BOOST_MAX, car.boost + pad.amount);
      pad.cooldown = pad.maxCooldown;
      pad.mesh.visible = false;
      pad.inner.visible = false;
      if (car.isPlayer) {
      }
      break;
    }
  }
}

function resolveBallStaticContact(nx, ny, nz, penetration, restitution, friction) {
  if (penetration <= 0) return;
  ball.pos.x += nx * penetration;
  ball.pos.y += ny * penetration;
  ball.pos.z += nz * penetration;

  const normalSpeed = ball.vel.x * nx + ball.vel.y * ny + ball.vel.z * nz;
  if (normalSpeed >= 0) return;

  // Surface velocity at the contact point, including spin.
  const bx = -nx * BALL_RADIUS;
  const by = -ny * BALL_RADIUS;
  const bz = -nz * BALL_RADIUS;
  const contactX = ball.vel.x + (ball.spin.y * bz - ball.spin.z * by);
  const contactY = ball.vel.y + (ball.spin.z * bx - ball.spin.x * bz);
  const contactZ = ball.vel.z + (ball.spin.x * by - ball.spin.y * bx);
  const contactNormal = contactX * nx + contactY * ny + contactZ * nz;
  const tangentX = contactX - nx * contactNormal;
  const tangentY = contactY - ny * contactNormal;
  const tangentZ = contactZ - nz * contactNormal;
  const tangentSpeed = Math.hypot(tangentX, tangentY, tangentZ);

  const normalImpulse = -(1 + restitution) * normalSpeed * BALL_MASS;
  ball.vel.x += (nx * normalImpulse) / BALL_MASS;
  ball.vel.y += (ny * normalImpulse) / BALL_MASS;
  ball.vel.z += (nz * normalImpulse) / BALL_MASS;

  if (tangentSpeed > 1e-4 && friction > 0) {
    const frictionImpulse = Math.min(friction * normalImpulse, (tangentSpeed * BALL_MASS) / 3.5);
    const ux = tangentX / tangentSpeed;
    const uy = tangentY / tangentSpeed;
    const uz = tangentZ / tangentSpeed;
    ball.vel.x -= (ux * frictionImpulse) / BALL_MASS;
    ball.vel.y -= (uy * frictionImpulse) / BALL_MASS;
    ball.vel.z -= (uz * frictionImpulse) / BALL_MASS;

    // Friction at the ball surface converts tangential slip into spin.
    const ix = -ux * frictionImpulse;
    const iy = -uy * frictionImpulse;
    const iz = -uz * frictionImpulse;
    ball.spin.x += (by * iz - bz * iy) / BALL_INERTIA;
    ball.spin.y += (bz * ix - bx * iz) / BALL_INERTIA;
    ball.spin.z += (bx * iy - by * ix) / BALL_INERTIA;
  }
}

function collideBallGround(dt) {
  if (ball.pos.y > BALL_RADIUS) return;

  const impactSpeed = -ball.vel.y;
  const restitution = impactSpeed > 1.1 ? BALL_GROUND_RESTITUTION : 0;
  // Tangential friction is handled below using the true contact-point velocity.
  resolveBallStaticContact(0, 1, 0, BALL_RADIUS - ball.pos.y, restitution, 0);

  // Rolling contact: friction drives the surface slip to zero, then a small
  // rolling resistance lets the ball coast for a very long time.
  const slipX = ball.vel.x + ball.spin.z * BALL_RADIUS;
  const slipZ = ball.vel.z - ball.spin.x * BALL_RADIUS;
  const slipSpeed = Math.hypot(slipX, slipZ);
  if (slipSpeed > 1e-4) {
    const maxImpulse = BALL_GROUND_FRICTION * BALL_MASS * BALL_GRAVITY * dt;
    const neededImpulse = (slipSpeed * BALL_MASS) / 3.5;
    const frictionImpulse = Math.min(maxImpulse, neededImpulse);
    const ux = slipX / slipSpeed;
    const uz = slipZ / slipSpeed;
    ball.vel.x -= (ux * frictionImpulse) / BALL_MASS;
    ball.vel.z -= (uz * frictionImpulse) / BALL_MASS;
    const jx = -ux * frictionImpulse;
    const jz = -uz * frictionImpulse;
    ball.spin.x += (-BALL_RADIUS * jz) / BALL_INERTIA;
    ball.spin.z += (BALL_RADIUS * jx) / BALL_INERTIA;
  }

  const horizontalSpeed = Math.hypot(ball.vel.x, ball.vel.z);
  if (horizontalSpeed > 0.001) {
    const drop = Math.min(horizontalSpeed, ROLLING_RESISTANCE * dt);
    ball.vel.x -= (ball.vel.x / horizontalSpeed) * drop;
    ball.vel.z -= (ball.vel.z / horizontalSpeed) * drop;
    ball.resting = horizontalSpeed < 0.05;
  } else {
    ball.resting = true;
  }
  ball.spin.y *= Math.pow(0.6, dt);
}

function collideBallGoalFrame() {
  const collisionRadius = BALL_RADIUS + GOAL_FRAME_RADIUS;
  for (const side of [-1, 1]) {
    const goalX = side * HALF_L;

    // Posts: vertical cylinders that stop shots clipping through the frame.
    for (const postZ of [-FIELD.goalHalf, FIELD.goalHalf]) {
      if (ball.pos.y - BALL_RADIUS > FIELD.goalHeight + GOAL_FRAME_RADIUS) continue;
      const dx = ball.pos.x - goalX;
      const dz = ball.pos.z - postZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.0001 && dist < collisionRadius) {
        resolveBallStaticContact(dx / dist, 0, dz / dist, collisionRadius - dist, 0.72, 0.2);
      }
    }

    // Crossbar: horizontal cylinder across the mouth.
    if (Math.abs(ball.pos.z) < FIELD.goalHalf + collisionRadius) {
      const dx = ball.pos.x - goalX;
      const dy = ball.pos.y - FIELD.goalHeight;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0001 && dist < collisionRadius) {
        resolveBallStaticContact(dx / dist, dy / dist, 0, collisionRadius - dist, 0.72, 0.2);
      }
    }
  }
}

function collideBallArena() {
  const r = BALL_RADIUS;

  // Side walls: a sloped ramp at the base lets the ball (and cars) climb,
  // then a vertical wall above it.
  // The arena cross-section is convex (floor, 45° ramp, vertical wall), so the
  // ball is the intersection of two half-spaces, each pushed in by the ball
  // radius. Each plane is resolved by true distance along its own normal.
  if (Math.abs(ball.pos.x) <= CORNER_CENTER_X) {
    for (const side of [-1, 1]) {
      // Signed distance from the ball centre to the ramp plane (z = side * (WALL_Z + y)).
      const rampDistance = (ball.pos.y + WALL_Z - side * ball.pos.z) / Math.SQRT2;
      if (rampDistance < r) {
        resolveBallStaticContact(0, 1 / Math.SQRT2, -side / Math.SQRT2, r - rampDistance,
          BALL_WALL_RESTITUTION, BALL_WALL_FRICTION);
      }
      // Vertical wall above the top of the ramp.
      const wallDistance = WALL_Z + SIDE_RAMP_HEIGHT - side * ball.pos.z;
      if (wallDistance < r) {
        resolveBallStaticContact(0, 0, -side, r - wallDistance, BALL_WALL_RESTITUTION, BALL_WALL_FRICTION);
      }
    }
  }

  // End walls, with the goal mouth left open below the crossbar.
  if (Math.abs(ball.pos.z) <= CORNER_CENTER_Z) {
    const goalOpen = Math.abs(ball.pos.z) < FIELD.goalHalf && ball.pos.y < FIELD.goalHeight;
    if (!goalOpen) {
      if (ball.pos.x > WALL_X - r) {
        resolveBallStaticContact(-1, 0, 0, ball.pos.x - (WALL_X - r), BALL_WALL_RESTITUTION, BALL_WALL_FRICTION);
      } else if (ball.pos.x < -WALL_X + r) {
        resolveBallStaticContact(1, 0, 0, (-WALL_X + r) - ball.pos.x, BALL_WALL_RESTITUTION, BALL_WALL_FRICTION);
      }
    }
  }

  // Rounded corner walls.
  if (Math.abs(ball.pos.x) > CORNER_CENTER_X && Math.abs(ball.pos.z) > CORNER_CENTER_Z) {
    const cx = Math.sign(ball.pos.x) * CORNER_CENTER_X;
    const cz = Math.sign(ball.pos.z) * CORNER_CENTER_Z;
    const dx = ball.pos.x - cx;
    const dz = ball.pos.z - cz;
    const dist = Math.hypot(dx, dz);
    const maxRadius = CORNER_R - ARENA_WALL_INSET - r;
    if (dist > maxRadius && dist > 0.0001) {
      resolveBallStaticContact(-dx / dist, 0, -dz / dist, dist - maxRadius, BALL_WALL_RESTITUTION, BALL_WALL_FRICTION);
    }
  }

  // Invisible ceiling above the arena.
  if (ball.pos.y > CEILING_Y - r) {
    resolveBallStaticContact(0, -1, 0, ball.pos.y - (CEILING_Y - r), 0.6, 0.1);
  }
}

const spinAxis = new THREE.Vector3();
const spinQuat = new THREE.Quaternion();

function updateBall(dt) {
  if (goalLocked) {
    ballMesh.position.copy(ball.pos);
    ballGlow.position.copy(ball.pos);
    return;
  }

  ball.vel.y -= BALL_GRAVITY * dt;

  // Quadratic aerodynamic drag.
  const speed = ball.vel.length();
  if (speed > 0.001) {
    const dragAccel = AIR_DRAG * speed * speed;
    const drop = Math.min(speed, dragAccel * dt);
    ball.vel.multiplyScalar((speed - drop) / speed);
  }

  // Magnus effect: spin curves the flight path.
  if (ball.spin.lengthSq() > 0.05) {
    const mx = ball.spin.y * ball.vel.z - ball.spin.z * ball.vel.y;
    const my = ball.spin.z * ball.vel.x - ball.spin.x * ball.vel.z;
    const mz = ball.spin.x * ball.vel.y - ball.spin.y * ball.vel.x;
    ball.vel.x += mx * MAGNUS * dt;
    ball.vel.y += my * MAGNUS * dt;
    ball.vel.z += mz * MAGNUS * dt;
  }
  // Only airborne spin decays to drag; rolling spin is managed by ground friction.
  if (ball.pos.y > BALL_RADIUS + 0.02) {
    ball.spin.multiplyScalar(Math.exp(-SPIN_DAMPING * dt));
  }

  ball.pos.addScaledVector(ball.vel, dt);

  collideBallGround(dt);
  collideBallGoalFrame();
  collideBallArena();

  if (!goalLocked) {
    const inGoalMouth = Math.abs(ball.pos.z) < FIELD.goalHalf && ball.pos.y < FIELD.goalHeight;
    if (inGoalMouth) {
      if (ball.pos.x - BALL_RADIUS > HALF_L) scoreGoal('blue');
      else if (ball.pos.x + BALL_RADIUS < -HALF_L) scoreGoal('orange');
    }
  }

  if (ball.vel.lengthSq() > BALL_MAX_SPEED * BALL_MAX_SPEED) {
    ball.vel.setLength(BALL_MAX_SPEED);
  }

  ballMesh.position.copy(ball.pos);
  const spinRate = ball.spin.length();
  if (spinRate > 1e-5) {
    spinAxis.copy(ball.spin).multiplyScalar(1 / spinRate);
    spinQuat.setFromAxisAngle(spinAxis, spinRate * dt);
    ballMesh.quaternion.premultiply(spinQuat);
  }
  ballGlow.position.copy(ball.pos);
  ballGlow.intensity += (0.45 - ballGlow.intensity) * Math.min(1, dt * 5);
}

function step(dt) {
  if (RL_MODE) {
    stepRL(dt);
    return;
  }
  elapsed += dt;

  if (goalTimer > 0) {
    goalTimer -= dt;
    if (goalTimer <= 0) resetPositions('Back to the kickoff. ' + (skillKey === 'bronze' ? 'Try to stay near the ball this time.' : 'Reset and go again.'));
    updateBall(dt);
    return;
  }

  if (kickoffTimer > 0) {
    kickoffTimer -= dt;
    matchState = kickoffTimer > 0 ? 'KICKOFF' : 'PLAYING';
    updateBall(dt);
    return;
  }

  matchState = 'PLAYING';
  clock -= dt;
  kickoffPhase = Math.max(0, kickoffPhase - dt);

  roleUpdateTimer -= dt;
  if (roleUpdateTimer <= 0) {
    assignRoles();
    roleUpdateTimer = 0.45;
  }

  // Substepping keeps fast cars and the ball from tunnelling through each other.
  const subDt = dt / PHYSICS_SUBSTEPS;
  for (let i = 0; i < PHYSICS_SUBSTEPS; i++) {
    cars.forEach(car => updateCar(car, subDt));
    updateBall(subDt);
    if (!goalLocked) {
      // Iterative solver settles car↔car and car↔ball constraints together.
      for (let solver = 0; solver < SOLVER_ITERATIONS; solver++) {
        resolveCarCarCollisions();
        cars.forEach(car => resolveCarBallCollision(car));
      }
    }
    updateBoostPads(subDt);
    syncTransforms();
  }

  resolveBallPinch();

  if (clock <= 0) {
    clock = 180;
    const result = scoreBlue === scoreOrange ? 'DRAW' : (scoreBlue > scoreOrange ? 'BLUE WIN' : 'ORANGE WIN');
    notify('FULL TIME', result, 'neutral');
    scoreBlue = 0;
    scoreOrange = 0;
    resetPositions('New match starting.');
  }
}

/* ============================== CAMERA ============================== */

const desiredCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const currentLook = new THREE.Vector3();

const camOffset = new THREE.Vector3();

// Player cameras always sit behind a car on the line from the ball through the car and look at the ball.
// They only use positions, never the car's orientation, so flips and wall rides do not turn the camera.
/* ---- Director camera: an automatic broadcast view, like Rocket League's ---- */

const director = {
  shot: '', t: 0, since: 0, orbit: 0, cut: true,
  pos: new THREE.Vector3(), look: new THREE.Vector3(), target: new THREE.Vector3(), aim: new THREE.Vector3(), fov: 50
};

// Which shot suits what is happening: a wide sideline view that pans and zooms with the play, a view from behind
// the goal when the ball is down at that end, a low corner view at kickoff, an orbit round the ball after a goal,
// and during a replay a sideline view, then the goal, then the scorer's chase camera.
function chooseDirectorShot() {
  if (replay.active) {
    const p = replay.frames ? Math.min(1, replay.pos / Math.max(1, replay.frames.length - 1)) : 1;
    return p < 0.45 ? 'side' : (p < 0.8 ? 'goal' : 'chase');
  }
  if (matchState === 'GOAL') return 'orbit';
  if (matchState === 'KICKOFF') return 'kickoff';
  const x = Math.abs(ball.pos.x);
  if (director.shot === 'goal') return x > HALF_L - 30 ? 'goal' : 'side';
  return x > HALF_L - 18 ? 'goal' : 'side';
}

// Returns false when the shot is the chase camera, which the normal camera code then handles.
function updateDirector(dt) {
  director.t += dt;
  const want = chooseDirectorShot();
  const free = matchState !== 'PLAYING' || replay.active || director.shot === '' || director.shot === 'kickoff' || director.shot === 'orbit';
  if (want !== director.shot && (free || director.t - director.since > 1.1)) {
    director.shot = want;
    director.since = director.t;
    director.cut = true;
  }
  const portrait = camera.aspect < 1;
  const shot = director.shot;
  if (shot === 'chase') {
    if (Math.abs(camera.fov - baseFov(portrait)) > 0.05) { camera.fov = baseFov(portrait); camera.updateProjectionMatrix(); }
    return false;
  }

  const target = director.target;
  const aim = director.aim;
  let posRate = 2;
  let lookRate = 7;
  let fovTarget = 50;
  aim.copy(ball.pos);
  if (shot === 'side') {
    // High TV position on the sideline, drifting along with the ball; the lens zooms to keep the ball and the
    // nearest cars in frame.
    target.set(clamp(ball.pos.x * 0.8, -HALF_L * 0.8, HALF_L * 0.8), 26 + ball.pos.y * 0.4, HALF_W + 18);
    posRate = 1.6;
    let near = 40;
    for (const car of cars) near = Math.min(near, car.pos.distanceTo(ball.pos));
    const span = clamp(near * 2.4 + 24, 36, 95);
    fovTarget = THREE.MathUtils.radToDeg(2 * Math.atan(span * 0.5 / Math.max(10, target.distanceTo(ball.pos))));
  } else if (shot === 'goal') {
    const sign = replay.active ? (replay.team === 'blue' ? 1 : -1) : (ball.pos.x >= 0 ? 1 : -1);
    target.set(sign * (HALF_L + 16), 6 + ball.pos.y * 0.25, clamp(ball.pos.z * 0.35, -10, 10));
    posRate = 3;
    lookRate = 9;
    fovTarget = THREE.MathUtils.radToDeg(2 * Math.atan(34 / Math.max(10, target.distanceTo(ball.pos))));
  } else if (shot === 'kickoff') {
    target.set(kickoffCount % 2 ? -24 : 24, 8, HALF_W + 8);
    aim.set(0, 3, 0);
    posRate = 1.2;
    lookRate = 5;
    fovTarget = 48;
  } else { // orbit
    director.orbit += dt * 0.7;
    target.set(ball.pos.x + Math.cos(director.orbit) * 13, ball.pos.y + 6, ball.pos.z + Math.sin(director.orbit) * 13);
    posRate = 6;
    fovTarget = 55;
  }
  fovTarget = clamp(fovTarget, 24, 58) * (portrait ? 1.35 : 1);

  if (director.cut) {
    // Real cuts, as on TV: jump straight to the new shot instead of gliding there.
    director.cut = false;
    director.pos.copy(target);
    director.look.copy(aim);
    director.fov = fovTarget;
  } else {
    director.pos.lerp(target, 1 - Math.exp(-dt * posRate));
    director.look.lerp(aim, 1 - Math.exp(-dt * lookRate));
    director.fov += (fovTarget - director.fov) * (1 - Math.exp(-dt * 2.5));
  }
  camera.position.copy(director.pos);
  camera.lookAt(director.look);
  currentLook.copy(director.look);
  if (Math.abs(camera.fov - director.fov) > 0.05) {
    camera.fov = director.fov;
    camera.updateProjectionMatrix();
  }
  return true;
}

function updateCamera(dt) {
  if (cameraMode === 'director' && updateDirector(dt)) return;
  const player = replay.active ? (cars[replay.focus] || cars[0]) : (cars[Number(cameraMode.slice(3))] || cars[0]);
  const portrait = camera.aspect < 1;
  const widen = portrait ? 1.15 : 1;
  const above = Math.max(0, ball.pos.y - player.pos.y);
  // Sit low behind the car. When the ball is high, back off so the car and the ball both fit in view.
  const back = ((RL_MODE ? 5.5 : 15) + above * 0.5) * widen;
  const height = (RL_MODE ? 1.5 : 5.5) * widen;

  camOffset.set(player.pos.x - ball.pos.x, 0, player.pos.z - ball.pos.z);
  if (camOffset.lengthSq() < 0.25) camOffset.set(-Math.cos(player.heading), 0, Math.sin(player.heading));
  camOffset.normalize();

  desiredCamera.copy(player.pos).addScaledVector(camOffset, back);
  desiredCamera.y = Math.max(player.pos.y, 0) + height;

  // Look at the ball, but never tilt up so far that the car leaves the bottom of the screen.
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const carAngle = Math.atan2(height, back);
  const maxPitch = Math.max(0, halfFov * 0.75 - carAngle);
  const toBallX = ball.pos.x - desiredCamera.x;
  const toBallZ = ball.pos.z - desiredCamera.z;
  const flat = Math.hypot(toBallX, toBallZ) || 1;
  const ballPitch = Math.atan2(ball.pos.y - desiredCamera.y, flat);
  lookTarget.copy(ball.pos);
  if (ballPitch > maxPitch) lookTarget.y = desiredCamera.y + Math.tan(maxPitch) * flat;

  const cameraBlend = 1 - Math.exp(-dt * 8);
  camera.position.lerp(desiredCamera, cameraBlend);
  currentLook.lerp(lookTarget, cameraBlend);
  camera.lookAt(currentLook);
}

/* ============================== UI ============================== */

// Only touch the DOM when a value changed: rewriting text and styles every frame forces needless style work.
const uiShown = {};
function setText(key, element, value) {
  if (!element || uiShown[key] === value) return;
  uiShown[key] = value;
  element.textContent = value;
}

function updateUI() {
  setText('blue', dom.scoreBlue, scoreBlue);
  setText('orange', dom.scoreOrange, scoreOrange);
  setText('clock', dom.clock, formatClock(clock));
  setText('state', dom.matchState, matchState);
  const boost = Math.round(clamp(cars[0].boost, 0, 100));
  setText('statBoost', dom.statBoost, boost + '%');
  setText('boostValue', dom.boostValue, boost + '%');
  if (dom.boostFill && uiShown.boostFill !== boost) {
    uiShown.boostFill = boost;
    dom.boostFill.style.width = boost + '%';
  }
}

function applySkillUI() {
  const keys = Object.keys(SKILLS);
  const index = keys.indexOf(skillKey);
  dom.skillSelect.value = skillKey;
  dom.rankChip.textContent = skill.label;
  dom.rankChip.style.setProperty('--rank-color', skill.color);
  dom.skillFill.style.width = (10 + (index / (keys.length - 1)) * 90) + '%';
  dom.skillDesc.textContent = skill.desc;
  dom.statSpeed.textContent = skill.speed + ' u/s';
  dom.statAccuracy.textContent = Math.round(skill.accuracy * 100) + '%';
  dom.statWhiff.textContent = Math.round(skill.whiff * 100) + '%';
}

function setCameraMode(mode) {
  const wasDirector = cameraMode === 'director';
  cameraMode = mode;
  if (mode === 'director') director.shot = '';
  else if (wasDirector) resizeRenderer();
  document.querySelectorAll('.cam-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.cam === mode);
  });
  if (dom.cameraBtn) dom.cameraBtn.textContent = (MOBILE ? 'Cam · ' : 'Camera · ') + (mode === 'director' ? 'Director' : carLabel(Number(mode.slice(3))));
}

function cycleCameraMode() {
  const modes = cars.map((car, i) => 'car' + i).concat('director');
  setCameraMode(modes[(modes.indexOf(cameraMode) + 1) % modes.length]);
}

// Camera buttons follow the cars in the current mode.
function refreshCameraButtons() {
  document.querySelectorAll('.cam-btn').forEach(button => {
    const index = Number(button.dataset.cam.slice(3));
    button.hidden = index >= cars.length;
    if (index < cars.length) button.innerHTML = '<span>' + (index + 1) + '</span> ' + carLabel(index);
  });
  if (Number(cameraMode.slice(3)) >= cars.length) setCameraMode('car0');
  else setCameraMode(cameraMode);
  if (dom.modeSelect) dom.modeSelect.value = String(teamSize);
  if (dom.modeBtn) dom.modeBtn.textContent = teamSize + 'v' + teamSize;
}

function setMode(n) {
  if (!RL_MODE || n === teamSize) { refreshCameraButtons(); return; }
  try { localStorage.setItem('rtpTeamSize', String(n)); } catch (e) { /* private mode */ }
  setTeamSize(n);
  rl.resize(n);
  refreshCameraButtons();
  scoreBlue = 0;
  scoreOrange = 0;
  clock = 180;
  if (replay.active) endReplay();
  resetPositions('New ' + n + 'v' + n + ' match.');
}

refreshCameraButtons();
if (dom.modeSelect) dom.modeSelect.addEventListener('change', () => setMode(Number(dom.modeSelect.value)));
if (dom.modeBtn) dom.modeBtn.addEventListener('click', () => setMode(teamSize % 3 + 1));

dom.skillSelect.addEventListener('change', () => {
  skillKey = dom.skillSelect.value;
  skill = SKILLS[skillKey];
  if (rl) rl.setTier(skillKey);
  applySkillUI();
  scoreBlue = 0;
  scoreOrange = 0;
  clock = 180;
  resetPositions('Fresh kickoff at ' + skill.label + ' level.');
});

document.querySelectorAll('.cam-btn').forEach(button => {
  button.addEventListener('click', () => setCameraMode(button.dataset.cam));
});

if (dom.cameraBtn) dom.cameraBtn.addEventListener('click', cycleCameraMode);

dom.playBtn.addEventListener('click', () => {
  paused = !paused;
  if (paused) sfx.silenceBoost();
  dom.playBtn.textContent = paused ? 'Resume' : 'Pause';
});

dom.replayBtn.addEventListener('click', () => {
  scoreBlue = 0;
  scoreOrange = 0;
  clock = 180;
  resetPositions('Match restarted.');
});

dom.speedBtn.addEventListener('click', () => {
  speedMultiplier = speedMultiplier === 1 ? 2 : (speedMultiplier === 2 ? 4 : 1);
  dom.speedBtn.textContent = 'Speed ' + speedMultiplier + '×';
});

dom.backBtn.addEventListener('click', () => {
  window.location.href = 'index.html';
});

// Sound: the browser only starts audio after a click or key press, so unlock on the first one.
const soundBtn = document.getElementById('soundBtn');
function refreshSoundButton() { if (soundBtn) soundBtn.classList.toggle('muted', sfx.muted); }
['pointerdown', 'keydown', 'touchstart'].forEach(name => window.addEventListener(name, () => sfx.unlock(), { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden) sfx.suspend(); else sfx.resume(); });
if (soundBtn) soundBtn.addEventListener('click', () => { sfx.setMuted(!sfx.muted); refreshSoundButton(); });
refreshSoundButton();

document.addEventListener('keydown', event => {
  if (event.key === ' ') {
    event.preventDefault();
    dom.playBtn.click();
  } else if (event.key >= '1' && event.key <= String(cars.length)) {
    setCameraMode('car' + (Number(event.key) - 1));
  } else if (event.key.toLowerCase() === 'd') {
    setCameraMode('director');
  } else if (event.key.toLowerCase() === 'm') {
    sfx.setMuted(!sfx.muted);
    refreshSoundButton();
  } else if (event.key.toLowerCase() === 'c') {
    cycleCameraMode();
  } else if (event.key.toLowerCase() === 'r') {
    dom.replayBtn.click();
  } else if (event.key === '+' || event.key === '=') {
    speedMultiplier = Math.min(4, speedMultiplier * 2);
    dom.speedBtn.textContent = 'Speed ' + speedMultiplier + '×';
  } else if (event.key === '-') {
    speedMultiplier = Math.max(1, speedMultiplier / 2);
    dom.speedBtn.textContent = 'Speed ' + speedMultiplier + '×';
  }
});

let resizeQueued = false;
function queueResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    resizeRenderer();
  });
}
window.addEventListener('resize', queueResize);
window.addEventListener('orientationchange', () => window.setTimeout(resizeRenderer, 250));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', queueResize);
}

/* ============================== GOAL EXPLOSION AND REPLAY ============================== */

// Goal explosion: a burst of glowing sparks, a flash and an expanding shockwave at the ball. One Points object and
// two meshes, no lights, so it adds almost nothing to the frame cost.
const FX_COUNT = 180;
const FX_LIFE = 1.5;
const fx = {
  t: FX_LIFE, active: false,
  pos: new Float32Array(FX_COUNT * 3),
  vel: new Float32Array(FX_COUNT * 3),
  col: new Float32Array(FX_COUNT * 3),
  base: new Float32Array(FX_COUNT * 3)
};
const fxTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
})();
const fxGeometry = new THREE.BufferGeometry();
fxGeometry.setAttribute('position', new THREE.BufferAttribute(fx.pos, 3));
fxGeometry.setAttribute('color', new THREE.BufferAttribute(fx.col, 3));
const fxPoints = new THREE.Points(fxGeometry, new THREE.PointsMaterial({
  size: 2.2, map: fxTexture, vertexColors: true, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false
}));
fxPoints.frustumCulled = false;
fxPoints.visible = false;
scene.add(fxPoints);
const fxFlash = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
);
const fxWave = new THREE.Mesh(
  new THREE.SphereGeometry(1, 28, 18),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false })
);
fxFlash.visible = fxWave.visible = false;
scene.add(fxFlash, fxWave);

function explodeAt(position, team) {
  const color = new THREE.Color(team === 'blue' ? 0x2f9bff : 0xff7a1f);
  const white = new THREE.Color(0xfff4d0);
  for (let i = 0; i < FX_COUNT; i++) {
    // Random direction on a sphere, biased upward a little so the burst fans out over the net.
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const speed = rand(8, 38);
    fx.pos[i * 3] = position.x;
    fx.pos[i * 3 + 1] = position.y;
    fx.pos[i * 3 + 2] = position.z;
    fx.vel[i * 3] = Math.cos(a) * r * speed;
    fx.vel[i * 3 + 1] = (u + 0.25) * speed;
    fx.vel[i * 3 + 2] = Math.sin(a) * r * speed;
    const mix = Math.random() < 0.3 ? white : color;
    fx.base[i * 3] = mix.r;
    fx.base[i * 3 + 1] = mix.g;
    fx.base[i * 3 + 2] = mix.b;
  }
  fx.t = 0;
  fx.active = true;
  fxPoints.visible = fxFlash.visible = fxWave.visible = true;
  fxFlash.position.copy(position);
  fxWave.position.copy(position);
  fxWave.material.color.copy(color);
}

function updateFx(dt) {
  if (!fx.active) return;
  fx.t += dt;
  const life = fx.t / FX_LIFE;
  if (life >= 1) {
    fx.active = false;
    fxPoints.visible = fxFlash.visible = fxWave.visible = false;
    return;
  }
  const drag = Math.exp(-dt * 1.6);
  const fade = (1 - life) * (1 - life);
  for (let i = 0; i < FX_COUNT; i++) {
    const k = i * 3;
    fx.vel[k] *= drag;
    fx.vel[k + 1] = fx.vel[k + 1] * drag - 14 * dt;
    fx.vel[k + 2] *= drag;
    fx.pos[k] += fx.vel[k] * dt;
    fx.pos[k + 1] = Math.max(0.2, fx.pos[k + 1] + fx.vel[k + 1] * dt);
    fx.pos[k + 2] += fx.vel[k + 2] * dt;
    fx.col[k] = fx.base[k] * fade;
    fx.col[k + 1] = fx.base[k + 1] * fade;
    fx.col[k + 2] = fx.base[k + 2] * fade;
  }
  fxGeometry.attributes.position.needsUpdate = true;
  fxGeometry.attributes.color.needsUpdate = true;
  const flashT = Math.min(1, fx.t / 0.35);
  fxFlash.scale.setScalar(1 + flashT * 7);
  fxFlash.material.opacity = 0.85 * (1 - flashT);
  const waveT = Math.min(1, fx.t / 0.9);
  fxWave.scale.setScalar(2 + waveT * 22);
  fxWave.material.opacity = 0.5 * (1 - waveT) * (1 - waveT);
}

// Replay: the last few seconds before every goal are recorded as car/ball transforms and played back in slow motion
// from the scorer's chase camera.
const REPLAY_FRAMES = 300;       // 5 s at 60 steps per second
const REPLAY_SPEED = 0.7;        // frames advanced per step
const REPLAY_STRIDE = 8;        // per car: position (3), rotation (4), flame (1)
const replayBuffer = [];
const replay = { active: false, frames: null, pos: 0, hold: 0, focus: 0, ending: false, exploded: false };
const replayQuatA = new THREE.Quaternion();
const replayQuatB = new THREE.Quaternion();
const replayBadge = document.getElementById('replayBadge');
const replaySkip = document.getElementById('replaySkip');

function recordReplayFrame() {
  const frame = new Float32Array(cars.length * REPLAY_STRIDE + 7);
  let o = 0;
  for (const car of cars) {
    car.mesh.position.toArray(frame, o);
    car.mesh.quaternion.toArray(frame, o + 3);
    frame[o + 7] = car.flame.visible ? 1 : 0;
    o += REPLAY_STRIDE;
  }
  ballMesh.position.toArray(frame, o);
  ballMesh.quaternion.toArray(frame, o + 3);
  replayBuffer.push(frame);
  if (replayBuffer.length > REPLAY_FRAMES) replayBuffer.shift();
}

function applyReplayFrame(position) {
  const frames = replay.frames;
  const i = Math.min(frames.length - 1, Math.floor(position));
  const j = Math.min(frames.length - 1, i + 1);
  const t = position - i;
  const a = frames[i];
  const b = frames[j];
  const place = (mesh, o) => {
    mesh.position.set(
      a[o] + (b[o] - a[o]) * t,
      a[o + 1] + (b[o + 1] - a[o + 1]) * t,
      a[o + 2] + (b[o + 2] - a[o + 2]) * t
    );
    replayQuatA.fromArray(a, o + 3);
    replayQuatB.fromArray(b, o + 3);
    mesh.quaternion.copy(replayQuatA.slerp(replayQuatB, t));
  };
  let o = 0;
  for (const car of cars) {
    place(car.mesh, o);
    car.pos.copy(car.mesh.position);
    car.y = car.pos.y;
    car.flame.visible = a[o + 7] === 1;
    sfx.boost(cars.indexOf(car), car.flame.visible ? sfxSpace(car.pos).near : 0, sfxSpace(car.pos).pan);
    o += REPLAY_STRIDE;
  }
  place(ballMesh, o);
  ball.pos.copy(ballMesh.position);
  ballGlow.position.copy(ball.pos);
}

function startReplay() {
  replay.frames = replayBuffer.slice();
  replay.pos = 0;
  replay.hold = 0;
  replay.exploded = false;
  replay.active = true;
  matchState = 'REPLAY';
  sfx.whoosh();
  if (replayBadge) replayBadge.hidden = false;
  applyReplayFrame(0);
}

function endReplay() {
  replay.active = false;
  replay.frames = null;
  if (replayBadge) replayBadge.hidden = true;
}

if (replaySkip) replaySkip.addEventListener('click', () => {
  if (replay.active) replay.hold = 0.001, replay.pos = Infinity;
});

// One step of replay playback; returns true when it is finished and the kickoff should start.
function stepReplay(dt) {
  if (replay.pos !== Infinity && replay.pos < replay.frames.length - 1) {
    replay.pos += REPLAY_SPEED * dt * 60;
    applyReplayFrame(Math.min(replay.pos, replay.frames.length - 1));
    return false;
  }
  // Reached the goal again: let the explosion play out before the kickoff.
  if (replay.pos === Infinity) return true;
  if (!replay.exploded) {
    replay.exploded = true;
    explodeAt(ball.pos, replay.team);
    sfx.goal(true);
  }
  replay.hold += dt;
  return replay.hold > 1.2;
}

/* ============================== LOOP ============================== */

let lastTime = performance.now();
let accumulator = 0;
let loadingHidden = false;

// The simulation runs at 60 Hz and nothing is interpolated, so drawing faster than that only repeats frames. On
// 120/144 Hz monitors this halves the rendering work; the schedule keeps the average at 60 without judder.
const FRAME_MS = 1000 / 60;
let nextFrameAt = 0;

function animate(now) {
  requestAnimationFrame(animate);
  if (now < nextFrameAt - 1) return;
  nextFrameAt = nextFrameAt && now - nextFrameAt < 50 ? nextFrameAt + FRAME_MS : now + FRAME_MS;
  const frameDelta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) {
    accumulator += frameDelta * speedMultiplier;
    let iterations = 0;
    while (accumulator >= 1 / 60 && iterations < 3 + 3 * speedMultiplier) {
      step(1 / 60);
      accumulator -= 1 / 60;
      iterations++;
    }
    // Running slow: drop the backlog rather than spending the next frames catching up (which makes it slower still).
    if (accumulator > 2 / 60 * speedMultiplier) accumulator = 0;
  }

  updateCamera(frameDelta);
  updateFx(frameDelta);
  updateUI();
  renderer.render(scene, camera);

  if (!loadingHidden) {
    loadingHidden = true;
    window.setTimeout(() => dom.loading.classList.add('hidden'), 350);
  }
}

function carOverlapDepth(a, b) {
  if (a.y >= b.y + CAR_HEIGHT || b.y >= a.y + CAR_HEIGHT) return 0;
  const af = forwardOf(a);
  const ar = rightOf(a);
  const bf = forwardOf(b);
  const br = rightOf(b);
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const axes = [[af.x, af.z], [ar.x, ar.z], [bf.x, bf.z], [br.x, br.z]];
  let minOverlap = Infinity;
  for (const [ax, az] of axes) {
    const overlap = carSupportRadius(a, ax, az) + carSupportRadius(b, ax, az) -
      Math.abs(dx * ax + dz * az);
    if (overlap <= 0) return 0;
    if (overlap < minOverlap) minOverlap = overlap;
  }
  return minOverlap;
}

window.__rl3d = {
  get ball() {
    return {
      x: ball.pos.x, y: ball.pos.y, z: ball.pos.z,
      vx: ball.vel.x, vy: ball.vel.y, vz: ball.vel.z,
      spinX: ball.spin.x, spinY: ball.spin.y, spinZ: ball.spin.z,
      speed: ball.vel.length()
    };
  },
  get cars() {
    return cars.map(c => {
      const t = chooseTarget(c);
      const f = forwardOf(c);
      return {
        team: c.team, role: c.role, kickoffRole: c.kickoffRole,
        x: c.pos.x, y: c.y, z: c.pos.z, heading: c.heading,
        vx: c.vel.x, vy: c.vel.y, vz: c.vel.z,
        speed: c.vel.x * f.x + c.vel.z * f.z,
        yawRate: c.yawRate, steer: c.steerAngle,
        boost: +c.boost.toFixed(1), boosting: c.boostHold > 0 && c.boost > 0,
        airborne: c.airborne, flipping: c.flipTimer > 0, flipAngle: c.flipAngle,
        reversing: c.reverseTimer > 0,
        targetX: t.x, targetZ: t.z, errorX: c.targetError.x, errorZ: c.targetError.z
      };
    });
  },
  forceStuck(index) {
    cars[index].vel.x = 0;
    cars[index].vel.z = 0;
    cars[index].speed = 0;
    cars[index].stuckTimer = 1;
  },
  forceFlip(index) {
    const car = cars[index];
    const f = forwardOf(car);
    car.flipDir.set(f.x, 0, f.z);
    car.flipTimer = FLIP_DURATION;
    car.flipRate = -(Math.PI * 2) / FLIP_DURATION;
    car.flipAngle = 0;
    car.vel.x += f.x * FLIP_FORWARD_BOOST;
    car.vel.z += f.z * FLIP_FORWARD_BOOST;
    car.vel.y = JUMP_SPEED;
    car.airborne = true;
  },
  forceCarCollision(indexA, indexB, speedA, speedB, headingB = 0) {
    const a = cars[indexA];
    const b = cars[indexB];
    a.pos.set(0, 0, 0); a.y = 0; a.heading = 0; a.yawRate = 0;
    a.vel.set(speedA, 0, 0); a.speed = speedA;
    b.pos.set(2.0, 0, 0); b.y = 0; b.heading = headingB; b.yawRate = 0;
    b.vel.set(Math.cos(headingB) * speedB, 0, -Math.sin(headingB) * speedB); b.speed = speedB;
    syncTransforms();
  },
  startPlay() {
    kickoffTimer = 0;
    kickoffPhase = 0;
    goalTimer = 0;
    goalLocked = false;
    matchState = 'PLAYING';
    clock = 180;
  },
  simulate(seconds) {
    const frames = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < frames; i++) step(1 / 60);
    syncTransforms();
    return { frames, state: matchState, score: { blue: scoreBlue, orange: scoreOrange, clock } };
  },
  render() {
    syncTransforms();
    renderer.render(scene, camera);
  },
  camera(mode) {
    setCameraMode(mode);
    updateCamera(1 / 60);
    syncTransforms();
    renderer.render(scene, camera);
  },
  cameraAt(x, y, z, tx, ty, tz) {
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  },
  audit(seconds) {
    const frames = Math.max(1, Math.round(seconds * 60));
    const startBlue = scoreBlue;
    const startOrange = scoreOrange;
    let maxCarOverlap = 0;
    let maxBallPenetration = 0;
    let maxCarSpeed = 0;
    let maxBallSpeed = 0;
    let nan = false;
    for (let i = 0; i < frames; i++) {
      step(1 / 60);
      for (let a = 0; a < cars.length; a++) {
        for (let b = a + 1; b < cars.length; b++) {
          maxCarOverlap = Math.max(maxCarOverlap, carOverlapDepth(cars[a], cars[b]));
        }
        const car = cars[a];
        const f = forwardOf(car);
        const r = rightOf(car);
        const centreY = car.y + CAR_HALF_HEIGHT;
        const dx = ball.pos.x - car.pos.x;
        const dy = ball.pos.y - centreY;
        const dz = ball.pos.z - car.pos.z;
        const localX = dx * f.x + dz * f.z;
        const localY = dy;
        const localZ = dx * r.x + dz * r.z;
        const edge = Math.hypot(
          localX - clamp(localX, -CAR_HALF_LENGTH, CAR_HALF_LENGTH),
          localY - clamp(localY, -CAR_HALF_HEIGHT, CAR_HALF_HEIGHT),
          localZ - clamp(localZ, -CAR_HALF_WIDTH, CAR_HALF_WIDTH)
        );
        maxBallPenetration = Math.max(maxBallPenetration, BALL_RADIUS - edge);
        maxCarSpeed = Math.max(maxCarSpeed, Math.hypot(car.vel.x, car.vel.z));
      }
      maxBallSpeed = Math.max(maxBallSpeed, ball.vel.length());
      if (!isFinite(ball.pos.x + ball.pos.y + ball.pos.z + ball.vel.x + ball.vel.y + ball.vel.z)) nan = true;
    }
    return {
      frames,
      goals: (scoreBlue - startBlue) + (scoreOrange - startOrange),
      score: { blue: scoreBlue, orange: scoreOrange, clock },
      maxCarOverlap: +maxCarOverlap.toFixed(3),
      maxBallPenetration: +maxBallPenetration.toFixed(3),
      maxCarSpeed: +maxCarSpeed.toFixed(1),
      maxBallSpeed: +maxBallSpeed.toFixed(1),
      nan,
      state: matchState
    };
  },
  setBall(x, y, z, vx = 0, vy = 0, vz = 0, spinX = 0, spinY = 0, spinZ = 0) {
    ball.pos.set(x, y, z);
    ball.vel.set(vx, vy, vz);
    ball.spin.set(spinX, spinY, spinZ);
    ball.resting = false;
    syncTransforms();
  },
  setCar(index, x, z, heading, speed, boost) {
    const car = cars[index];
    car.pos.set(x, 0, z);
    car.y = 0;
    car.heading = heading;
    car.vel.set(Math.cos(heading) * speed, 0, -Math.sin(heading) * speed);
    car.speed = speed;
    car.vy = 0;
    car.yawRate = 0;
    car.airborne = false;
    car.flipTimer = 0;
    car.flipAngle = 0;
    car.flipRate = 0;
    car.cooldown = 0;
    if (typeof boost === 'number') car.boost = boost;
    syncTransforms();
  },
  teleportCar(index, x, z, boost) {
    const car = cars[index];
    car.pos.set(x, 0, z);
    car.y = 0;
    car.vy = 0;
    car.vel.set(0, 0, 0);
    car.airborne = false;
    car.flipTimer = 0;
    car.flipAngle = 0;
    car.flipRate = 0;
    car.speed = 0;
    car.yawRate = 0;
    car.boostHold = 0;
    car.flameTimer = 0;
    if (typeof boost === 'number') car.boost = boost;
    syncTransforms();
  },
  get pads() {
    return {
      total: pads.length,
      big: pads.filter(p => p.big).length,
      small: pads.filter(p => !p.big).length,
      active: pads.filter(p => p.cooldown <= 0).length,
      positions: pads.map(p => ({ x: p.x, z: p.z, big: p.big, amount: p.amount, cooldown: +p.cooldown.toFixed(1) }))
    };
  },
  get collisions() {
    const carPairs = [];
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const overlap = carOverlapDepth(cars[i], cars[j]);
        carPairs.push({
          pair: i + '-' + j,
          distance: +Math.hypot(cars[j].pos.x - cars[i].pos.x, cars[j].pos.z - cars[i].pos.z).toFixed(2),
          overlap: +overlap.toFixed(2),
          overlapping: overlap > 0.01
        });
      }
    }
    const ballContacts = cars.map((car, index) => {
      const f = forwardOf(car);
      const r = rightOf(car);
      const centreY = car.y + CAR_HALF_HEIGHT;
      const dx = ball.pos.x - car.pos.x;
      const dy = ball.pos.y - centreY;
      const dz = ball.pos.z - car.pos.z;
      const localX = dx * f.x + dz * f.z;
      const localY = dy;
      const localZ = dx * r.x + dz * r.z;
      const edge = Math.hypot(
        localX - clamp(localX, -CAR_HALF_LENGTH, CAR_HALF_LENGTH),
        localY - clamp(localY, -CAR_HALF_HEIGHT, CAR_HALF_HEIGHT),
        localZ - clamp(localZ, -CAR_HALF_WIDTH, CAR_HALF_WIDTH)
      );
      return {
        car: index,
        gap: +(edge - BALL_RADIUS).toFixed(2),
        overlapping: edge - BALL_RADIUS < -0.01
      };
    });
    return { carPairs, ballContacts };
  },
  get score() { return { blue: scoreBlue, orange: scoreOrange, clock }; },
  get state() { return matchState; },
  get touch() { return { team: lastTouch.team, car: lastTouch.car, age: +(elapsed - lastTouch.time).toFixed(2), speed: +lastTouch.speed.toFixed(1) }; },
  get pinch() { return { count: pinchCount, last: lastPinch }; }
};

applySkillUI();
resetPositions(skillKey === 'bronze'
  ? 'Kickoff! The Bronze rookie looks completely lost already.'
  : 'Kickoff at ' + skill.label + ' level. Play is under way.');
requestAnimationFrame(animate);
