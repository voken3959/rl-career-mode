import * as THREE from 'three';

/* ============================== CONFIG ============================== */

const SKILLS = {
  bronze:        { label: 'BRONZE',        color: '#cd7f32', speed: 20, turn: 1.8, whiff: 0.45, accuracy: 0.18, spread: 0.55, power: 24, loft: 0.04, reaction: 0.65, boost: 0.2,  desc: 'Low speed, poor reads, frequent whiffs. The rookie is out of his depth.' },
  silver:        { label: 'SILVER',        color: '#c8d2de', speed: 23, turn: 2.1, whiff: 0.34, accuracy: 0.30, spread: 0.40, power: 28, loft: 0.08, reaction: 0.50, boost: 0.3,  desc: 'Faster, but still loses track of the ball in the scrum.' },
  gold:          { label: 'GOLD',          color: '#ffd54a', speed: 26, turn: 2.4, whiff: 0.24, accuracy: 0.43, spread: 0.30, power: 32, loft: 0.12, reaction: 0.40, boost: 0.4,  desc: 'Can keep possession and finds the net more often than not.' },
  platinum:      { label: 'PLATINUM',      color: '#7fe3ff', speed: 29, turn: 2.7, whiff: 0.16, accuracy: 0.55, spread: 0.22, power: 36, loft: 0.18, reaction: 0.32, boost: 0.5,  desc: 'Solid rotations, cleaner hits, fewer basic mistakes.' },
  diamond:       { label: 'DIAMOND',       color: '#5aa9ff', speed: 32, turn: 3.0, whiff: 0.11, accuracy: 0.66, spread: 0.16, power: 40, loft: 0.24, reaction: 0.25, boost: 0.6,  desc: 'Confident in the air and dangerous in the final third.' },
  champion:      { label: 'CHAMPION',      color: '#b06bff', speed: 35, turn: 3.2, whiff: 0.07, accuracy: 0.76, spread: 0.11, power: 44, loft: 0.30, reaction: 0.20, boost: 0.7,  desc: 'Fast, clinical and rarely gives the ball away.' },
  grandchampion: { label: 'GRAND CHAMPION',color: '#ff5fa2', speed: 37, turn: 3.4, whiff: 0.04, accuracy: 0.85, spread: 0.07, power: 47, loft: 0.36, reaction: 0.16, boost: 0.8,  desc: 'Elite mechanics and near-perfect decision making.' },
  ssl:           { label: 'SUPERSONIC',    color: '#ff8a3d', speed: 39, turn: 3.6, whiff: 0.02, accuracy: 0.92, spread: 0.04, power: 50, loft: 0.42, reaction: 0.12, boost: 0.9,  desc: 'Flip resets, ceiling shots and laser-guided passing.' },
  pro:           { label: 'PRO LEAGUE',    color: '#ffd700', speed: 41, turn: 3.8, whiff: 0.01, accuracy: 0.97, spread: 0.02, power: 54, loft: 0.48, reaction: 0.09, boost: 1.0,  desc: 'RLCS-level play. Every touch has a purpose.' }
};

const params = new URLSearchParams(location.search);
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

const FIELD = { length: 120, width: 80, goalHalf: 8, goalHeight: 8, ballRadius: 1.7, cornerRadius: 9 };

const HALF_L = FIELD.length / 2;
const HALF_W = FIELD.width / 2;
const CORNER_R = FIELD.cornerRadius;
const CAR_LIMIT_X = HALF_L - 1.5;
const CAR_LIMIT_Z = HALF_W - 1.5;
const BALL_LIMIT_X = HALF_L - 0.8;
const BALL_LIMIT_Z = HALF_W - 0.8;
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
  commentary: document.getElementById('commentary'),
  playBtn: document.getElementById('playBtn'),
  replayBtn: document.getElementById('replayBtn'),
  cameraBtn: document.getElementById('cameraBtn'),
  speedBtn: document.getElementById('speedBtn'),
  backBtn: document.getElementById('backBtn')
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

function addCommentary(text, goal) {
  const line = document.createElement('div');
  line.className = 'comment-line' + (goal ? ' goal' : '');
  line.textContent = text;
  dom.commentary.insertBefore(line, dom.commentary.firstChild);
  while (dom.commentary.children.length > 14) dom.commentary.removeChild(dom.commentary.lastChild);
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ============================== THREE SETUP ============================== */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08060c);
scene.fog = new THREE.FogExp2(0x0c0816, 0.0014);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1600);
camera.position.set(0, 95, 135);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
dom.container.appendChild(renderer.domElement);

/* ============================== LIGHTING ============================== */

scene.add(new THREE.HemisphereLight(0xb6b4ff, 0x2a1108, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff0d8, 2.0);
keyLight.position.set(65, 150, 55);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -120;
keyLight.shadow.camera.right = 120;
keyLight.shadow.camera.top = 95;
keyLight.shadow.camera.bottom = -95;
keyLight.shadow.camera.near = 10;
keyLight.shadow.camera.far = 380;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8f5cff, 0.65);
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
      topColor: { value: new THREE.Color(0x05030a) },
      bottomColor: { value: new THREE.Color(0x1a0f24) }
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
  gradient.addColorStop(0, '#123a28');
  gradient.addColorStop(0.5, '#0f3223');
  gradient.addColorStop(1, '#123526');
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

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x171122, roughness: 0.45, metalness: 0.35 });
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

addWallBox(sideWallLength, 7, 1.2, 0, 3.5, -HALF_W);
addWallBox(sideWallLength, 7, 1.2, 0, 3.5, HALF_W);
[-HALF_L, HALF_L].forEach(x => {
  [-endWallZ, endWallZ].forEach(z => addWallBox(1.2, 7, endWallDepth, x, 3.5, z));
});

const cornerConfigs = [
  { x: cornerX, z: cornerZ, start: 0 },
  { x: -cornerX, z: cornerZ, start: Math.PI / 2 },
  { x: -cornerX, z: -cornerZ, start: Math.PI },
  { x: cornerX, z: -cornerZ, start: Math.PI * 1.5 }
];
cornerConfigs.forEach(corner => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(CORNER_R, CORNER_R, 7, 24, 1, true, corner.start, Math.PI / 2),
    wallMaterial
  );
  mesh.position.set(corner.x, 3.5, corner.z);
  mesh.castShadow = true;
  scene.add(mesh);
});

[-HALF_W - 0.2, HALF_W + 0.2].forEach(z => {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(sideWallLength, 0.35, 0.4), trimBlue);
  trim.position.set(0, 7.1, z);
  scene.add(trim);
});
[-HALF_L - 0.2, HALF_L + 0.2].forEach(x => {
  [-endWallZ, endWallZ].forEach(z => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, endWallDepth), trimBlue);
    trim.position.set(x, 7.1, z);
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
  const backX = side * 5.5;
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
    for (let x = 0; x <= 5.5; x += 1.4) {
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
  glow.position.set(side * 5.6, FIELD.goalHeight / 2, 0);
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

const padPositions = [...bigPadPositions, ...smallPadPositions];
const bigPadKeys = new Set(bigPadPositions.map(([x, z]) => x + ',' + z));

const pads = padPositions.map(([x, z]) => {
  const big = bigPadKeys.has(x + ',' + z);
  const blue = x < 0;
  const size = big ? 3.4 : 2.2;
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

  const innerSize = big ? 2.2 : 1.2;
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

/* ============================== STANDS & CROWD ============================== */

function perimeterPoint(t, width, height, radius) {
  const straightW = width - 2 * radius;
  const straightH = height - 2 * radius;
  const arc = Math.PI * radius / 2;
  const total = 2 * straightW + 2 * straightH + 4 * arc;
  let distance = (((t % 1) + 1) % 1) * total;

  if (distance < straightW) {
    return { x: -straightW / 2 + distance, z: -height / 2, nx: 0, nz: -1 };
  }
  distance -= straightW;

  if (distance < arc) {
    const angle = -Math.PI / 2 + distance / radius;
    return { x: straightW / 2 + radius * Math.cos(angle), z: -straightH / 2 + radius * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) };
  }
  distance -= arc;

  if (distance < straightH) {
    return { x: width / 2, z: -straightH / 2 + distance, nx: 1, nz: 0 };
  }
  distance -= straightH;

  if (distance < arc) {
    const angle = distance / radius;
    return { x: straightW / 2 + radius * Math.cos(angle), z: straightH / 2 + radius * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) };
  }
  distance -= arc;

  if (distance < straightW) {
    return { x: straightW / 2 - distance, z: height / 2, nx: 0, nz: 1 };
  }
  distance -= straightW;

  if (distance < arc) {
    const angle = Math.PI / 2 + distance / radius;
    return { x: -straightW / 2 + radius * Math.cos(angle), z: straightH / 2 + radius * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) };
  }
  distance -= arc;

  if (distance < straightH) {
    return { x: -width / 2, z: straightH / 2 - distance, nx: -1, nz: 0 };
  }
  distance -= straightH;

  const angle = Math.PI + distance / radius;
  return { x: -straightW / 2 + radius * Math.cos(angle), z: -straightH / 2 + radius * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) };
}

const STAND_W = FIELD.length + 20;
const STAND_H = FIELD.width + 16;
const standMaterial = new THREE.MeshStandardMaterial({ color: 0x0f0a18, roughness: 0.95, metalness: 0.05 });
for (let row = 0; row < 8; row++) {
  const width = STAND_W + row * 4.6;
  const height = STAND_H + row * 4.6;
  const radius = 11 + row * 1.2;
  const y = 7.5 + row * 2.1;

  [-1, 1].forEach(sideZ => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(width, 2.1, 4.6), standMaterial);
    box.position.set(0, y, sideZ * (height / 2));
    box.receiveShadow = true;
    scene.add(box);
  });
  [-1, 1].forEach(sideX => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.1, height), standMaterial);
    box.position.set(sideX * (width / 2), y, 0);
    box.receiveShadow = true;
    scene.add(box);
  });
}

const crowdGeometry = new THREE.BoxGeometry(0.9, 1.25, 0.9);
const crowdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 });
const CROWD_COUNT = 4200;
const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, CROWD_COUNT);
const dummy = new THREE.Object3D();
const crowdPalette = [0xd8552c, 0xff8a3d, 0x8c2f1d, 0xffc46b, 0x3b1a66, 0x6b2a20, 0xe0a15a];
for (let i = 0; i < CROWD_COUNT; i++) {
  const row = Math.floor(Math.random() * 8);
  const width = STAND_W + row * 4.6;
  const height = STAND_H + row * 4.6;
  const radius = 11 + row * 1.2;
  const point = perimeterPoint(Math.random(), width, height, radius);
  const outward = rand(0.2, 2.0);
  dummy.position.set(
    point.x + point.nx * outward + rand(-0.7, 0.7),
    9.2 + row * 2.1 + rand(-0.25, 0.25),
    point.z + point.nz * outward + rand(-0.7, 0.7)
  );
  dummy.rotation.y = rand(0, Math.PI * 2);
  dummy.scale.setScalar(rand(0.75, 1.15));
  dummy.updateMatrix();
  crowd.setMatrixAt(i, dummy.matrix);
  crowd.setColorAt(i, new THREE.Color(crowdPalette[Math.floor(Math.random() * crowdPalette.length)]));
}
crowd.instanceMatrix.needsUpdate = true;
scene.add(crowd);

/* ============================== ROOF & FLOODLIGHTS ============================== */

const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1228, roughness: 0.6, metalness: 0.6 });
function beamBetween(a, b, radius, material) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  scene.add(mesh);
}

const TOWER_X = HALF_L + 16;
const TOWER_Z = HALF_W + 14;
const TOWER_H = 50;
const towerPositions = [
  new THREE.Vector3(-TOWER_X, 0, -TOWER_Z), new THREE.Vector3(TOWER_X, 0, -TOWER_Z),
  new THREE.Vector3(-TOWER_X, 0, TOWER_Z), new THREE.Vector3(TOWER_X, 0, TOWER_Z)
];

towerPositions.forEach((tower, index) => {
  const top = new THREE.Vector3(tower.x, TOWER_H, tower.z);
  beamBetween(tower, top, 0.9, beamMaterial);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(11, 3.2, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe0a3, emissiveIntensity: 2.2, roughness: 0.3 })
  );
  panel.position.copy(top).setY(TOWER_H + 0.8);
  panel.lookAt(0, 0, 0);
  scene.add(panel);

  const spot = new THREE.SpotLight(0xffe8c4, 2.6, 320, 0.58, 0.65, 1.4);
  spot.position.copy(top);
  spot.target.position.set(0, 0, 0);
  scene.add(spot);
  scene.add(spot.target);

  if (index % 2 === 0) {
    const glow = new THREE.PointLight(0xff9b42, 0.7, 105, 2);
    glow.position.copy(top);
    scene.add(glow);
  }
});

for (let i = 0; i < towerPositions.length; i++) {
  const next = towerPositions[(i + 1) % towerPositions.length];
  beamBetween(
    new THREE.Vector3(towerPositions[i].x, TOWER_H, towerPositions[i].z),
    new THREE.Vector3(next.x, TOWER_H, next.z),
    0.45, beamMaterial
  );
}
beamBetween(new THREE.Vector3(-TOWER_X, TOWER_H, 0), new THREE.Vector3(TOWER_X, TOWER_H, 0), 0.35, beamMaterial);
beamBetween(new THREE.Vector3(0, TOWER_H, -TOWER_Z), new THREE.Vector3(0, TOWER_H, TOWER_Z), 0.35, beamMaterial);

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

function createCar(team, isPlayer) {
  const color = team === 'blue' ? 0x1f8fff : 0xff6a1a;
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111722, roughness: 0.5, metalness: 0.4 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x120a20, roughness: 0.15, metalness: 0.7, transparent: true, opacity: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1.1, 2.4), bodyMaterial);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.2), bodyMaterial);
  hood.position.set(1.25, 1.62, 0);
  hood.castShadow = true;
  group.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 2.0), glassMaterial);
  cabin.position.set(-0.3, 1.85, 0);
  cabin.castShadow = true;
  group.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 2.3), darkMaterial);
  spoiler.position.set(-1.95, 1.85, 0);
  group.add(spoiler);

  const wheels = [];
  const wheelGeometry = new THREE.CylinderGeometry(0.62, 0.62, 0.48, 16);
  [[1.35, 1.25], [1.35, -1.25], [-1.35, 1.25], [-1.35, -1.25]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, darkMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.62, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  });

  const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 });
  [-0.8, 0.8].forEach(z => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.28, 0.5), headlightMaterial);
    light.position.set(2.08, 1.25, z);
    group.add(light);
  });

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 1.6, 10),
    new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9 })
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.set(-2.6, 1.0, 0);
  flame.visible = false;
  group.add(flame);

  if (isPlayer) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);
  }

  group.traverse(child => { if (child.isMesh) child.castShadow = true; });
  scene.add(group);

  return {
    team,
    isPlayer,
    mesh: group,
    wheels,
    flame,
    pos: new THREE.Vector3(),
    y: 0,
    vy: 0,
    airborne: false,
    flipTimer: 0,
    flipAngle: 0,
    flipDir: new THREE.Vector3(),
    jumpCooldown: 0,
    reverseTimer: 0,
    stuckTimer: 0,
    speed: 0,
    heading: 0,
    cooldown: 0,
    flameTimer: 0,
    targetError: new THREE.Vector3(),
    reactionTimer: 0,
    boost: 33,
    boostHold: 0,
    role: 'attack',
    kickoffRole: 'support',
    roleTimer: 0,
    index: 0
  };
}

const cars = [
  createCar('blue', true),
  createCar('blue', false),
  createCar('orange', false),
  createCar('orange', false)
];

cars.forEach((car, index) => { car.index = index; });
cars[1].role = 'defend';
cars[3].role = 'defend';

/* ============================== MATCH STATE ============================== */

const ball = { pos: new THREE.Vector3(0, FIELD.ballRadius, 0), vel: new THREE.Vector3() };
let scoreBlue = 0;
let scoreOrange = 0;
let clock = 180;
let paused = false;
let speedMultiplier = 1;
let cameraMode = 'broadcast';
let matchState = 'KICKOFF';
let kickoffTimer = 1.6;
let kickoffPhase = 0;
let kickoffCount = 0;
let roleUpdateTimer = 0;
let goalTimer = 0;
let goalLocked = false;
let orbitAngle = 0;
let elapsed = 0;

function resetPositions(message) {
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
    car.airborne = false;
    car.flipTimer = 0;
    car.flipAngle = 0;
    car.flipDir.set(0, 0, 0);
    car.jumpCooldown = 0;
    car.reverseTimer = 0;
    car.stuckTimer = 0;
    car.speed = 0;
    car.heading = start.heading;
    car.cooldown = 0;
    car.flameTimer = 0;
    car.boost = 33;
    car.boostHold = 0;
    car.reactionTimer = 0;
    car.targetError.set(0, 0, 0);
    car.role = index % 2 === 0 ? 'attack' : 'defend';
    car.kickoffRole = takers.includes(index) ? 'kickoff' : 'support';
    car.mesh.position.set(start.x, 0, start.z);
    car.mesh.rotation.set(0, start.heading, 0);
  });

  pads.forEach(pad => {
    pad.cooldown = 0;
    pad.mesh.visible = true;
    pad.inner.visible = true;
  });

  ball.pos.set(0, FIELD.ballRadius, 0);
  ball.vel.set(0, 0, 0);
  ballMesh.position.copy(ball.pos);
  matchState = 'KICKOFF';
  kickoffTimer = 1.6;
  kickoffPhase = 3.4;
  roleUpdateTimer = 0;
  goalTimer = 0;
  goalLocked = false;

  if (message) addCommentary(message);
}

function scoreGoal(team) {
  if (team === 'blue') scoreBlue++; else scoreOrange++;
  const flash = document.createElement('div');
  flash.className = 'goal-flash show';
  flash.innerHTML = '<div>GOAL!</div>';
  document.body.appendChild(flash);
  window.setTimeout(() => flash.remove(), 1100);

  const rookieText = skillKey === 'bronze'
    ? 'The rookie completely misjudged that one — lucky bounce finds the net.'
    : 'Clinical finish from the attack.';
  addCommentary((team === 'blue' ? 'BLUE' : 'ORANGE') + ' SCORES! ' + rookieText, true);
  goalTimer = 1.8;
  goalLocked = true;
  ball.vel.set(0, 0, 0);
  // Settle the ball deep in the net so it stays clear of the frozen cars.
  ball.pos.x = team === 'blue' ? HALF_L + 4 : -(HALF_L + 4);
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
    mates.sort((a, b) => a.pos.distanceTo(ball.pos) - b.pos.distanceTo(ball.pos));
    mates[0].role = 'attack';
    mates[1].role = 'defend';
  });
}

function chooseTarget(car) {
  if (car.reactionTimer <= 0) {
    car.reactionTimer = skill.reaction * rand(0.7, 1.3);
    const errorRadius = (1 - skill.accuracy) * 13;
    car.targetError.set(rand(-errorRadius, errorRadius), 0, rand(-errorRadius, errorRadius));
  }

  const ownGoalX = car.team === 'blue' ? -HALF_L : HALF_L;
  const target = new THREE.Vector3();

  if (kickoffPhase > 0 && car.kickoffRole === 'kickoff') {
    target.copy(ball.pos);
  } else if (kickoffPhase > 0) {
    // The non-taker breaks wide instead of swarming the centre spot.
    target.set(ownGoalX * 0.5, 0, car.index === 1 ? -28 : 28);
  } else if (car.role === 'defend') {
    const defensiveLine = HALF_L - 18;
    const nearOwnGoal = car.team === 'blue' ? ball.pos.x < -defensiveLine : ball.pos.x > defensiveLine;
    const zBias = car.index === 1 ? 9 : car.index === 3 ? -9 : 0;
    target.set(ownGoalX * 0.68 + (ball.pos.x - ownGoalX) * 0.16, 0, ball.pos.z * 0.55 + zBias);
    if (nearOwnGoal && car.pos.distanceTo(ball.pos) < 18) target.copy(ball.pos);
  } else {
    const mate = cars.find(other => other.team === car.team && other !== car);
    const mateCloser = mate && mate.pos.distanceTo(ball.pos) + 2 < car.pos.distanceTo(ball.pos);
    if (mateCloser) {
      const behind = car.team === 'blue' ? -1 : 1;
      const side = car.index % 2 === 0 ? 1 : -1;
      target.set(ball.pos.x + behind * 10, 0, ball.pos.z + side * 12);
    } else {
      target.copy(ball.pos);
    }
  }

  target.y = 0;
  const errorScale = car.kickoffRole === 'kickoff' ? 1 : (car.role === 'attack' ? 0.8 : 0.35);
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

  const target = chooseTarget(car);
  const toTarget = new THREE.Vector3().subVectors(target, car.pos);
  toTarget.y = 0;
  const distance = toTarget.length();

  let difference = 0;
  if (distance > 0.1) {
    // The car mesh points along its local +X axis, so world forward is (cos h, -sin h).
    const desiredHeading = Math.atan2(-toTarget.z, toTarget.x);
    difference = angleDelta(car.heading, desiredHeading);
    const airSteer = car.airborne ? 0.35 : 1;
    const turnRate = skill.turn * (car.isPlayer ? 1 : 0.92) * airSteer *
      (1 - Math.min(0.42, (Math.abs(car.speed) / Math.max(1, skill.speed * 1.45)) * 0.38));
    const steerInput = clamp(difference / 0.42, -1, 1);
    car.heading += steerInput * turnRate * dt;
    car.heading = Math.atan2(Math.sin(car.heading), Math.cos(car.heading));
  }

  const alignment = Math.cos(difference);

  // Decide in short holds so boost is a sustained burn, not per-frame flicker.
  if (car.boostHold <= 0 && car.boost > 0 && !car.airborne && distance > 12 && alignment > 0.6) {
    if (Math.random() < 0.35 + skill.boost * 0.65) {
      car.boostHold = 0.4 + skill.boost * 0.5;
    }
  }
  const boosting = car.boostHold > 0 && car.boost > 0;
  const baseSpeed = skill.speed * (car.isPlayer ? 1 : 0.96);
  const maxSpeed = baseSpeed * (boosting ? 1.55 : 1);

  const forward = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  const ballDistance = Math.hypot(ball.pos.x - car.pos.x, ball.pos.z - car.pos.z);

  // Jumping and front flips — kickoff takers launch into the ball, field players challenge aerials.
  if (!car.airborne && car.jumpCooldown <= 0 && !goalLocked) {
    const kickoffFlip = kickoffPhase > 1.6 && car.kickoffRole === 'kickoff' && ballDistance < 7 && car.speed > 6;
    const aerialChallenge = ball.pos.y > 3 && ballDistance < 10 && car.speed > 8 &&
      (car.role === 'attack' || car.kickoffRole === 'kickoff') && Math.random() < 0.4 + skill.accuracy * 0.6;
    const defensiveAerial = car.role === 'defend' && ball.pos.y > 2.5 && ballDistance < 10 &&
      (car.team === 'blue' ? ball.pos.x < 0 : ball.pos.x > 0) && Math.random() < 0.35 + skill.accuracy * 0.5;
    const lowFlip = ball.pos.y > FIELD.ballRadius + 1 && ballDistance < 10 && car.speed > 10 && Math.random() < 0.18 + skill.accuracy * 0.35;
    if (kickoffFlip || aerialChallenge || defensiveAerial || lowFlip) {
      const flip = kickoffFlip || lowFlip || defensiveAerial || ball.pos.y > 4.5;
      car.vy = flip ? 19 : 22;
      car.airborne = true;
      car.jumpCooldown = 0.8;
      if (flip) {
        // A front flip rotates the nose down and pushes along the nose direction.
        car.flipDir.copy(forward).normalize();
        car.flipTimer = 0.55;
        car.speed = Math.min(maxSpeed * 1.3, car.speed + 6);
      }
    }
  }

  if (car.airborne || car.vy > 0) {
    car.vy -= 58 * dt;
    car.y += car.vy * dt;
    if (car.y <= 0) {
      car.y = 0;
      car.vy = 0;
      car.airborne = false;
      car.flipTimer = 0;
      car.flipAngle = 0;
    }
  }
  if (car.flipTimer > 0) {
    car.flipTimer = Math.max(0, car.flipTimer - dt);
    // Negative Z rotation tips the nose down: a real front flip.
    car.flipAngle = -(1 - car.flipTimer / 0.55) * Math.PI * 2;
    car.pos.addScaledVector(car.flipDir, 9 * dt);
  } else {
    car.flipAngle *= Math.max(0, 1 - 8 * dt);
  }

  // Detect being wedged against a wall or another car, then reverse out.
  const atWall = Math.abs(car.pos.x) > TARGET_LIMIT_X || Math.abs(car.pos.z) > TARGET_LIMIT_Z;
  const pointingOut = (Math.abs(car.pos.x) > HALF_L - 4 && forward.x * car.pos.x > 0) ||
    (Math.abs(car.pos.z) > HALF_W - 4 && forward.z * car.pos.z > 0);
  const barelyMoving = Math.abs(car.speed) < 2.5 && distance > 6 && !car.airborne;
  if (barelyMoving || (atWall && pointingOut && distance > 6)) {
    car.stuckTimer += dt;
  } else {
    car.stuckTimer = Math.max(0, car.stuckTimer - dt * 2);
  }
  if (car.stuckTimer > 0.7 && car.reverseTimer <= 0) {
    car.reverseTimer = 0.75;
    car.stuckTimer = 0;
  }

  // Cars only ever drive along their own forward axis — no sideways movement.
  const cornering = clamp(0.32 + 0.68 * alignment, 0.32, 1);
  const approachSpeed = Math.min(maxSpeed, Math.max(7, distance * 2.2) * (boosting ? 1.45 : 1));
  let desiredSpeed = approachSpeed * cornering;
  if (car.reverseTimer > 0) desiredSpeed = -Math.min(11, maxSpeed * 0.35);

  const changingDirection = Math.sign(desiredSpeed) !== Math.sign(car.speed) && car.speed !== 0;
  const rate = car.reverseTimer > 0 ? 90 : (changingDirection ? 85 : 48 * (boosting ? 1.7 : 1));
  car.speed += clamp(desiredSpeed - car.speed, -rate * dt, rate * dt);
  const minSpeed = car.reverseTimer > 0 ? -Math.min(11, maxSpeed * 0.35) : -8;
  car.speed = clamp(car.speed, minSpeed, maxSpeed);

  car.pos.addScaledVector(forward, car.speed * dt);
  car.pos.x = clamp(car.pos.x, -CAR_LIMIT_X, CAR_LIMIT_X);
  car.pos.z = clamp(car.pos.z, -CAR_LIMIT_Z, CAR_LIMIT_Z);

  if (boosting) {
    car.boost = Math.max(0, car.boost - 28 * dt);
    car.flameTimer = 0.12;
  }
  car.boost = clamp(car.boost, 0, BOOST_MAX);

  car.wheels.forEach(wheel => { wheel.rotation.x += Math.abs(car.speed) * dt * 1.6; });
}

/* ============================== COLLISIONS ============================== */

const CAR_COLLISION_RADIUS = 2.35;
const CAR_HALF_LENGTH = 2.05;
const CAR_HALF_WIDTH = 1.45;
const CAR_HEIGHT = 2.4;
const CAR_MASS = 1.5;
const BALL_MASS = 0.42;
const BALL_RESTITUTION = 0.8;
const CAR_RESTITUTION = 0.35;
const BALL_MAX_SPEED = 80;

function forwardOf(car) {
  return { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
}

function rightOf(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

function clampCar(car) {
  car.pos.x = clamp(car.pos.x, -CAR_LIMIT_X, CAR_LIMIT_X);
  car.pos.z = clamp(car.pos.z, -CAR_LIMIT_Z, CAR_LIMIT_Z);
}

function resolveCarCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (Math.abs(a.y - b.y) > CAR_HEIGHT * 0.85) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const minDist = CAR_COLLISION_RADIUS * 2;
      if (dist >= minDist) continue;

      let nx = 1;
      let nz = 0;
      if (dist > 0.0001) {
        nx = dx / dist;
        nz = dz / dist;
      }

      // A faster car carries more effective mass, so it bulldozes a slower one
      // while still losing speed itself. Both cars always feel the impact.
      const speedA = Math.abs(a.speed);
      const speedB = Math.abs(b.speed);
      const speedSum = speedA + speedB + 2;
      const massA = CAR_MASS * (0.85 + 0.75 * speedA / speedSum);
      const massB = CAR_MASS * (0.85 + 0.75 * speedB / speedSum);

      // Mass-weighted separation: the lighter/slower car is shoved further.
      const penetration = minDist - dist;
      const pushA = massB / (massA + massB);
      const pushB = massA / (massA + massB);
      a.pos.x -= nx * penetration * pushA;
      a.pos.z -= nz * penetration * pushA;
      b.pos.x += nx * penetration * pushB;
      b.pos.z += nz * penetration * pushB;
      clampCar(a);
      clampCar(b);

      const af = forwardOf(a);
      const bf = forwardOf(b);
      const closing = (af.x * a.speed - bf.x * b.speed) * nx + (af.z * a.speed - bf.z * b.speed) * nz;
      if (closing <= 0) continue;

      const impulse = ((1 + CAR_RESTITUTION) * closing) / (1 / massA + 1 / massB);
      const changeA = (impulse * (af.x * nx + af.z * nz)) / massA;
      const changeB = (impulse * (bf.x * nx + bf.z * nz)) / massB;
      const knockLimit = Math.max(18, skill.speed * 0.9);

      // Signed speeds allow a stationary/slower car to be knocked backwards.
      a.speed = clamp(a.speed - changeA, -knockLimit, knockLimit);
      b.speed = clamp(b.speed + changeB, -knockLimit, knockLimit);
    }
  }
}

function resolveCarBallCollision(car) {
  if (goalLocked) return;
  const contactRadius = FIELD.ballRadius + 0.06; // small clearance so contacts never register as interpenetration
  const carBottom = car.y;
  const carTop = car.y + CAR_HEIGHT;
  if (ball.pos.y - contactRadius > carTop || ball.pos.y + contactRadius < carBottom) return;

  const forward = forwardOf(car);
  const right = rightOf(car);
  const dx = ball.pos.x - car.pos.x;
  const dz = ball.pos.z - car.pos.z;

  // Ball in the car's local frame (local X = nose direction, local Z = side).
  const localX = dx * forward.x + dz * forward.z;
  const localZ = dx * right.x + dz * right.z;
  if (Math.abs(localX) > CAR_HALF_LENGTH + contactRadius || Math.abs(localZ) > CAR_HALF_WIDTH + contactRadius) return;

  const clampedX = clamp(localX, -CAR_HALF_LENGTH, CAR_HALF_LENGTH);
  const clampedZ = clamp(localZ, -CAR_HALF_WIDTH, CAR_HALF_WIDTH);
  const offsetX = localX - clampedX;
  const offsetZ = localZ - clampedZ;
  const offsetLength = Math.hypot(offsetX, offsetZ);

  let nx;
  let nz;
  let penetration;

  if (offsetLength > 0.0001) {
    if (offsetLength >= contactRadius) return;
    penetration = contactRadius - offsetLength;
    nx = (forward.x * offsetX + right.x * offsetZ) / offsetLength;
    nz = (forward.z * offsetX + right.z * offsetZ) / offsetLength;
  } else if (Math.abs(localX) > Math.abs(localZ) * (CAR_HALF_LENGTH / CAR_HALF_WIDTH)) {
    const sign = localX >= 0 ? 1 : -1;
    nx = forward.x * sign;
    nz = forward.z * sign;
    penetration = CAR_HALF_LENGTH - Math.abs(localX) + contactRadius;
  } else {
    const sign = localZ >= 0 ? 1 : -1;
    nx = right.x * sign;
    nz = right.z * sign;
    penetration = CAR_HALF_WIDTH - Math.abs(localZ) + contactRadius;
  }

  // Hard separation: the ball can never remain inside a car or vice versa.
  ball.pos.x += nx * penetration;
  ball.pos.z += nz * penetration;
  car.pos.x -= nx * penetration * 0.18;
  car.pos.z -= nz * penetration * 0.18;
  clampCar(car);

  if (car.cooldown > 0) return;

  const carVelX = forward.x * car.speed;
  const carVelZ = forward.z * car.speed;
  const approach = -((ball.vel.x - carVelX) * nx + (ball.vel.z - carVelZ) * nz);
  if (approach <= 0.6) return;

  car.cooldown = 0.4 + (1 - skill.accuracy) * 0.45;

  const impulse = ((1 + BALL_RESTITUTION) * approach) / (1 / CAR_MASS + 1 / BALL_MASS);
  const whiffed = Math.random() < skill.whiff;
  const effectiveImpulse = whiffed ? impulse * 0.12 : impulse;

  // Base momentum transfer from the actual impact.
  ball.vel.x += (nx * effectiveImpulse) / BALL_MASS;
  ball.vel.z += (nz * effectiveImpulse) / BALL_MASS;
  car.speed = Math.max(0, car.speed - (effectiveImpulse * (nx * forward.x + nz * forward.z)) / CAR_MASS);

  if (!whiffed) {
    const attackX = car.team === 'blue' ? HALF_L : -HALF_L;
    const aim = new THREE.Vector3(attackX, 0, rand(-FIELD.goalHalf * 0.8, FIELD.goalHalf * 0.8)).sub(ball.pos).normalize();
    const hitDirection = new THREE.Vector3(forward.x, 0, forward.z).multiplyScalar(0.55);
    hitDirection.x += nx * 0.45;
    hitDirection.z += nz * 0.45;
    hitDirection.lerp(aim, skill.accuracy * 0.55).normalize();
    hitDirection.x += rand(-skill.spread, skill.spread);
    hitDirection.z += rand(-skill.spread, skill.spread);
    hitDirection.y = skill.loft * rand(0.15, 1) + (ball.pos.y > 2 ? 0.2 : 0);
    hitDirection.normalize();

    const transferredSpeed = car.speed * (0.7 + skill.power * 0.005) + skill.power * 0.2 + rand(0, 4);
    ball.vel.lerp(hitDirection.multiplyScalar(Math.max(transferredSpeed, ball.vel.length())), 0.78);
    ball.pos.y = Math.max(ball.pos.y, FIELD.ballRadius + 0.25);
    car.flameTimer = 0.22;
    ballGlow.intensity = 1.6;

    if (car.isPlayer && skillKey === 'bronze' && Math.random() < 0.12) {
      addCommentary('He actually made clean contact! Don\'t get used to it.');
    }
  } else if (car.isPlayer && Math.random() < 0.18) {
    addCommentary('Mistimed challenge — only a glancing touch.');
  }

  const horizontalSpeed = Math.hypot(ball.vel.x, ball.vel.z);
  if (horizontalSpeed > BALL_MAX_SPEED) {
    const scale = BALL_MAX_SPEED / horizontalSpeed;
    ball.vel.x *= scale;
    ball.vel.z *= scale;
  }
}

function syncTransforms() {
  cars.forEach(car => {
    car.mesh.position.set(car.pos.x, car.y, car.pos.z);
    car.mesh.rotation.set(0, car.heading, car.flipAngle);
  });
  if (!goalLocked) {
    const inMouth = Math.abs(ball.pos.z) < FIELD.goalHalf && ball.pos.y < FIELD.goalHeight;
    if (!inMouth) ball.pos.x = clamp(ball.pos.x, -BALL_LIMIT_X, BALL_LIMIT_X);
    ball.pos.z = clamp(ball.pos.z, -BALL_LIMIT_Z, BALL_LIMIT_Z);
  }
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
        addCommentary(pad.big ? 'Big pad — boost tank refilled!' : 'Small boost pad collected.');
      }
      break;
    }
  }
}

function updateBall(dt) {
  if (goalLocked) {
    ballMesh.position.copy(ball.pos);
    ballGlow.position.copy(ball.pos);
    return;
  }

  const airborne = ball.pos.y > FIELD.ballRadius + 0.02;
  ball.vel.y -= 42 * dt;

  // Very low rolling resistance on the carpet, minimal drag in the air.
  const groundFriction = Math.pow(0.68, dt);
  const airDrag = Math.pow(0.94, dt);
  const drag = airborne ? airDrag : groundFriction;
  ball.vel.x *= drag;
  ball.vel.z *= drag;

  ball.pos.addScaledVector(ball.vel, dt);

  if (ball.pos.y < FIELD.ballRadius) {
    ball.pos.y = FIELD.ballRadius;
    ball.vel.y = Math.abs(ball.vel.y) * 0.74;
    if (ball.vel.y < 1.1) ball.vel.y = 0;
  }

  // Solid goal frame — the ball cannot slip through posts or the crossbar.
  if (!goalLocked) {
    const frameRadius = FIELD.ballRadius + 0.28;
    for (const side of [-1, 1]) {
      const postX = side * HALF_L;
      for (const postZ of [-FIELD.goalHalf, FIELD.goalHalf]) {
        const dx = ball.pos.x - postX;
        const dz = ball.pos.z - postZ;
        const dist = Math.hypot(dx, dz);
        if (ball.pos.y < FIELD.goalHeight + frameRadius && dist > 0.0001 && dist < frameRadius) {
          const nx = dx / dist;
          const nz = dz / dist;
          ball.pos.x = postX + nx * frameRadius;
          ball.pos.z = postZ + nz * frameRadius;
          const normalSpeed = ball.vel.x * nx + ball.vel.z * nz;
          if (normalSpeed < 0) {
            ball.vel.x -= 1.8 * normalSpeed * nx;
            ball.vel.z -= 1.8 * normalSpeed * nz;
          }
        }
      }
      const barX = ball.pos.x - postX;
      if (Math.abs(barX) < frameRadius && Math.abs(ball.pos.z) < FIELD.goalHalf && Math.abs(ball.pos.y - FIELD.goalHeight) < frameRadius) {
        const ny = ball.pos.y >= FIELD.goalHeight ? 1 : -1;
        ball.pos.y = FIELD.goalHeight + ny * frameRadius;
        if (ball.vel.y * ny < 0) ball.vel.y *= -0.8;
      }
    }
  }

  const ballX = ball.pos.x;
  const ballZ = ball.pos.z;
  const inGoalMouth = Math.abs(ballZ) < FIELD.goalHalf && ball.pos.y < FIELD.goalHeight;

  if (inGoalMouth) {
    if (ballX > HALF_L) scoreGoal('blue');
    else if (ballX < -HALF_L) scoreGoal('orange');
  } else {
    if (ballX > BALL_LIMIT_X) { ball.pos.x = BALL_LIMIT_X; ball.vel.x = -Math.abs(ball.vel.x) * 0.86; }
    if (ballX < -BALL_LIMIT_X) { ball.pos.x = -BALL_LIMIT_X; ball.vel.x = Math.abs(ball.vel.x) * 0.86; }
  }
  if (ballZ > BALL_LIMIT_Z) { ball.pos.z = BALL_LIMIT_Z; ball.vel.z = -Math.abs(ball.vel.z) * 0.86; }
  if (ballZ < -BALL_LIMIT_Z) { ball.pos.z = -BALL_LIMIT_Z; ball.vel.z = Math.abs(ball.vel.z) * 0.86; }
  if (ball.pos.y > 52) { ball.pos.y = 52; ball.vel.y = -Math.abs(ball.vel.y) * 0.72; }

  ballMesh.position.copy(ball.pos);
  const rollRate = 1 / FIELD.ballRadius;
  ballMesh.rotation.x += ball.vel.z * rollRate * dt;
  ballMesh.rotation.z -= ball.vel.x * rollRate * dt;
  ballGlow.position.copy(ball.pos);
  ballGlow.intensity += (0.45 - ballGlow.intensity) * Math.min(1, dt * 5);
}

function step(dt) {
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
    if (kickoffTimer <= 0) addCommentary(skillKey === 'bronze' ? 'Kickoff! The rookie is already scrambling.' : 'Kickoff! Both teams break from the centre in formation.');
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
  const substeps = 4;
  const subDt = dt / substeps;
  for (let i = 0; i < substeps; i++) {
    cars.forEach(car => updateCar(car, subDt));
    updateBall(subDt);
    if (!goalLocked) {
      // A few solver passes settle car↔car and car↔ball constraints together.
      for (let solver = 0; solver < 5; solver++) {
        resolveCarCarCollisions();
        cars.forEach(car => resolveCarBallCollision(car));
      }
    }
    updateBoostPads(subDt);
    syncTransforms();
  }

  if (clock <= 0) {
    clock = 180;
    const result = scoreBlue === scoreOrange ? 'DRAW' : (scoreBlue > scoreOrange ? 'BLUE WIN' : 'ORANGE WIN');
    addCommentary('FULL TIME — ' + result + '.', true);
    scoreBlue = 0;
    scoreOrange = 0;
    resetPositions('New match starting.');
  }
}

/* ============================== CAMERA ============================== */

const desiredCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const currentLook = new THREE.Vector3();

function updateCamera(dt) {
  const player = cars[0];

  if (cameraMode === 'broadcast') {
    desiredCamera.set(0, 95, 135);
    lookTarget.set(0, 0, 0);
  } else if (cameraMode === 'chase') {
    const forward = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
    desiredCamera.copy(player.pos).addScaledVector(forward, -17).add(new THREE.Vector3(0, 9, 0));
    lookTarget.copy(player.pos).addScaledVector(forward, 14).add(new THREE.Vector3(0, 2, 0));
  } else if (cameraMode === 'ball') {
    desiredCamera.copy(ball.pos).add(new THREE.Vector3(0, 12, 24));
    lookTarget.copy(ball.pos);
  } else if (cameraMode === 'orbit') {
    orbitAngle += dt * 0.22;
    desiredCamera.set(Math.cos(orbitAngle) * 135, 68, Math.sin(orbitAngle) * 135);
    lookTarget.set(0, 0, 0);
  } else {
    desiredCamera.set(0, 185, 0.1);
    lookTarget.set(0, 0, 0);
  }

  camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, dt));
  currentLook.lerp(lookTarget, 1 - Math.pow(0.001, dt));
  camera.lookAt(currentLook);
}

/* ============================== UI ============================== */

function updateUI() {
  dom.scoreBlue.textContent = scoreBlue;
  dom.scoreOrange.textContent = scoreOrange;
  dom.clock.textContent = formatClock(clock);
  dom.matchState.textContent = matchState;
  const boost = clamp(cars[0].boost, 0, 100);
  if (dom.statBoost) dom.statBoost.textContent = Math.round(boost) + '%';
  if (dom.boostValue) dom.boostValue.textContent = Math.round(boost) + '%';
  if (dom.boostFill) dom.boostFill.style.width = boost + '%';
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
  cameraMode = mode;
  document.querySelectorAll('.cam-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.cam === mode);
  });
  const label = mode.charAt(0).toUpperCase() + mode.slice(1);
  if (dom.cameraBtn) dom.cameraBtn.textContent = 'Camera · ' + label;
}

function cycleCameraMode() {
  const modes = ['broadcast', 'chase', 'ball', 'orbit', 'top'];
  setCameraMode(modes[(modes.indexOf(cameraMode) + 1) % modes.length]);
}

dom.skillSelect.addEventListener('change', () => {
  skillKey = dom.skillSelect.value;
  skill = SKILLS[skillKey];
  applySkillUI();
  scoreBlue = 0;
  scoreOrange = 0;
  clock = 180;
  addCommentary('Skill changed to ' + skill.label + '. Restarting the match.');
  resetPositions('Fresh kickoff at ' + skill.label + ' level.');
});

document.querySelectorAll('.cam-btn').forEach(button => {
  button.addEventListener('click', () => setCameraMode(button.dataset.cam));
});

if (dom.cameraBtn) dom.cameraBtn.addEventListener('click', cycleCameraMode);

dom.playBtn.addEventListener('click', () => {
  paused = !paused;
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

document.addEventListener('keydown', event => {
  if (event.key === ' ') {
    event.preventDefault();
    dom.playBtn.click();
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================== LOOP ============================== */

let lastTime = performance.now();
let accumulator = 0;
let loadingHidden = false;

function animate(now) {
  requestAnimationFrame(animate);
  const frameDelta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) {
    accumulator += frameDelta * speedMultiplier;
    let iterations = 0;
    while (accumulator >= 1 / 60 && iterations < 10) {
      step(1 / 60);
      accumulator -= 1 / 60;
      iterations++;
    }
  }

  updateCamera(frameDelta);
  updateUI();
  renderer.render(scene, camera);

  if (!loadingHidden) {
    loadingHidden = true;
    window.setTimeout(() => dom.loading.classList.add('hidden'), 350);
  }
}

window.__rl3d = {
  get ball() { return { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z, vx: ball.vel.x, vz: ball.vel.z }; },
  get cars() { return cars.map(c => { const t = chooseTarget(c); return { team: c.team, role: c.role, kickoffRole: c.kickoffRole, x: c.pos.x, y: c.y, z: c.pos.z, heading: c.heading, speed: c.speed, boost: +c.boost.toFixed(1), boosting: c.boostHold > 0 && c.boost > 0, airborne: c.airborne, flipping: c.flipTimer > 0, flipAngle: c.flipAngle, reversing: c.reverseTimer > 0, targetX: t.x, targetZ: t.z, errorX: c.targetError.x, errorZ: c.targetError.z }; }); },
  forceStuck(index) { cars[index].speed = 0; cars[index].stuckTimer = 1; },
  forceFlip(index) {
    const car = cars[index];
    const f = forwardOf(car);
    car.flipDir.set(f.x, 0, f.z);
    car.flipTimer = 0.55;
    car.vy = 19;
    car.airborne = true;
  },
  forceCarCollision(indexA, indexB, speedA, speedB, headingB = 0) {
    const a = cars[indexA];
    const b = cars[indexB];
    a.pos.set(0, 0, 0); a.y = 0; a.heading = 0; a.speed = speedA;
    b.pos.set(2.0, 0, 0); b.y = 0; b.heading = headingB; b.speed = speedB;
    syncTransforms();
  },
  teleportCar(index, x, z, boost) {
    const car = cars[index];
    car.pos.set(x, 0, z);
    car.y = 0;
    car.vy = 0;
    car.airborne = false;
    car.speed = 0;
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
        const distance = Math.hypot(cars[j].pos.x - cars[i].pos.x, cars[j].pos.z - cars[i].pos.z);
        carPairs.push({
          pair: i + '-' + j,
          distance: +distance.toFixed(2),
          minDistance: +(CAR_COLLISION_RADIUS * 2).toFixed(2),
          overlapping: distance < CAR_COLLISION_RADIUS * 2 - 0.01 && Math.abs(cars[i].y - cars[j].y) <= CAR_HEIGHT * 0.85
        });
      }
    }
    const ballContacts = cars.map((car, index) => {
      const f = forwardOf(car);
      const r = rightOf(car);
      const dx = ball.pos.x - car.pos.x;
      const dz = ball.pos.z - car.pos.z;
      const localX = dx * f.x + dz * f.z;
      const localZ = dx * r.x + dz * r.z;
      const edge = Math.hypot(localX - clamp(localX, -CAR_HALF_LENGTH, CAR_HALF_LENGTH), localZ - clamp(localZ, -CAR_HALF_WIDTH, CAR_HALF_WIDTH));
      return {
        car: index,
        gap: +(edge - FIELD.ballRadius).toFixed(2),
        overlapping: edge - FIELD.ballRadius < -0.01 &&
          ball.pos.y - FIELD.ballRadius <= car.y + CAR_HEIGHT &&
          ball.pos.y + FIELD.ballRadius >= car.y
      };
    });
    return { carPairs, ballContacts };
  },
  get score() { return { blue: scoreBlue, orange: scoreOrange, clock }; }
};

applySkillUI();
resetPositions(skillKey === 'bronze'
  ? 'Kickoff! The Bronze rookie looks completely lost already.'
  : 'Kickoff at ' + skill.label + ' level. Play is under way.');
requestAnimationFrame(animate);
