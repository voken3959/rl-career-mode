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

const FIELD = { length: 100, width: 66, goalHalf: 8, goalHeight: 8, ballRadius: 1.7 };

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
  commentary: document.getElementById('commentary'),
  playBtn: document.getElementById('playBtn'),
  replayBtn: document.getElementById('replayBtn'),
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
scene.background = new THREE.Color(0x070a12);
scene.fog = new THREE.FogExp2(0x0b0d17, 0.0017);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1600);
camera.position.set(0, 78, 108);
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

scene.add(new THREE.HemisphereLight(0xa9c8ff, 0x2a1108, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff0d8, 2.0);
keyLight.position.set(55, 130, 45);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -90;
keyLight.shadow.camera.right = 90;
keyLight.shadow.camera.top = 70;
keyLight.shadow.camera.bottom = -70;
keyLight.shadow.camera.near = 10;
keyLight.shadow.camera.far = 320;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x4f8dff, 0.65);
fillLight.position.set(-70, 60, -50);
scene.add(fillLight);

/* ============================== BACKDROP FROM YOUR IMAGE ============================== */

const backdropTexture = new THREE.TextureLoader().load('./reference-stadium.png');
backdropTexture.colorSpace = THREE.SRGBColorSpace;
backdropTexture.wrapS = THREE.RepeatWrapping;
backdropTexture.repeat.set(2, 1);
const backdrop = new THREE.Mesh(
  new THREE.CylinderGeometry(330, 330, 170, 72, 1, true),
  new THREE.MeshBasicMaterial({ map: backdropTexture, side: THREE.BackSide, fog: false })
);
backdrop.position.y = 58;
scene.add(backdrop);

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

  ctx.fillStyle = 'rgba(226,240,255,0.06)';
  ctx.font = 'bold 110px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('CAREER MODE', 1024, 710);

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

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.45, metalness: 0.35 });
const trimBlue = new THREE.MeshStandardMaterial({ color: 0x0a2438, emissive: 0x0088cc, emissiveIntensity: 0.8, roughness: 0.4 });

function addWallBox(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

addWallBox(100, 7, 1.2, 0, 3.5, -33);
addWallBox(100, 7, 1.2, 0, 3.5, 33);
addWallBox(1.2, 7, 25, -50, 3.5, -20.5);
addWallBox(1.2, 7, 25, -50, 3.5, 20.5);
addWallBox(1.2, 7, 25, 50, 3.5, -20.5);
addWallBox(1.2, 7, 25, 50, 3.5, 20.5);

const cornerConfigs = [
  { x: 42, z: 25, start: 0 },
  { x: -42, z: 25, start: Math.PI / 2 },
  { x: -42, z: -25, start: Math.PI },
  { x: 42, z: -25, start: Math.PI * 1.5 }
];
cornerConfigs.forEach(corner => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 7, 20, 1, true, corner.start, Math.PI / 2),
    wallMaterial
  );
  mesh.position.set(corner.x, 3.5, corner.z);
  mesh.castShadow = true;
  scene.add(mesh);
});

[-33.2, 33.2].forEach(z => {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(100, 0.35, 0.4), trimBlue);
  trim.position.set(0, 7.1, z);
  scene.add(trim);
});
[-50.2, 50.2].forEach(x => {
  [-20.5, 20.5].forEach(z => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 25), trimBlue);
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

  group.position.x = side * 50;
  scene.add(group);
}

createGoal(-1);
createGoal(1);

/* ============================== BOOST PADS ============================== */

const padPositions = [
  [-42, -25], [-42, 25], [42, -25], [42, 25],
  [-42, 0], [42, 0], [0, -27], [0, 27],
  [-20, -27], [-20, 27], [20, -27], [20, 27],
  [-30, -15], [-30, 15], [30, -15], [30, 15],
  [-10, -15], [-10, 15], [10, -15], [10, 15],
  [0, -10], [0, 10], [-35, -8], [-35, 8], [35, -8], [35, 8]
];

const padGeometry = new THREE.PlaneGeometry(2.2, 2.2);
padPositions.forEach(([x, z]) => {
  const blue = x < 0;
  const pad = new THREE.Mesh(padGeometry, new THREE.MeshBasicMaterial({
    color: blue ? 0x00c8ff : 0xff7a1a,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide
  }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(x, 0.08, z);
  scene.add(pad);

  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide
  }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(x, 0.1, z);
  scene.add(inner);
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

const standMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95, metalness: 0.05 });
for (let row = 0; row < 8; row++) {
  const width = 108 + row * 4.6;
  const height = 74 + row * 4.6;
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
const CROWD_COUNT = 3200;
const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, CROWD_COUNT);
const dummy = new THREE.Object3D();
const crowdPalette = [0xd8552c, 0xff8a3d, 0x8c2f1d, 0xffc46b, 0x27324f, 0x6b2a20, 0xe0a15a];
for (let i = 0; i < CROWD_COUNT; i++) {
  const row = Math.floor(Math.random() * 8);
  const width = 108 + row * 4.6;
  const height = 74 + row * 4.6;
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

const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2636, roughness: 0.6, metalness: 0.6 });
function beamBetween(a, b, radius, material) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  scene.add(mesh);
}

const towerPositions = [
  new THREE.Vector3(-64, 0, -46), new THREE.Vector3(64, 0, -46),
  new THREE.Vector3(-64, 0, 46), new THREE.Vector3(64, 0, 46)
];

towerPositions.forEach((tower, index) => {
  const top = new THREE.Vector3(tower.x, 44, tower.z);
  beamBetween(tower, top, 0.9, beamMaterial);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(11, 3.2, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe0a3, emissiveIntensity: 2.2, roughness: 0.3 })
  );
  panel.position.copy(top).setY(44.8);
  panel.lookAt(0, 0, 0);
  scene.add(panel);

  const spot = new THREE.SpotLight(0xffe8c4, 2.6, 280, 0.58, 0.65, 1.4);
  spot.position.copy(top);
  spot.target.position.set(0, 0, 0);
  scene.add(spot);
  scene.add(spot.target);

  if (index % 2 === 0) {
    const glow = new THREE.PointLight(0xff9b42, 0.7, 90, 2);
    glow.position.copy(top);
    scene.add(glow);
  }
});

for (let i = 0; i < towerPositions.length; i++) {
  const next = towerPositions[(i + 1) % towerPositions.length];
  beamBetween(
    new THREE.Vector3(towerPositions[i].x, 44, towerPositions[i].z),
    new THREE.Vector3(next.x, 44, next.z),
    0.45, beamMaterial
  );
}
beamBetween(new THREE.Vector3(-64, 44, 0), new THREE.Vector3(64, 44, 0), 0.35, beamMaterial);
beamBetween(new THREE.Vector3(0, 44, -46), new THREE.Vector3(0, 44, 46), 0.35, beamMaterial);

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
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1826, roughness: 0.15, metalness: 0.7, transparent: true, opacity: 0.85 });

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
    vel: new THREE.Vector3(),
    heading: 0,
    cooldown: 0,
    flameTimer: 0,
    targetError: new THREE.Vector3(),
    reactionTimer: 0,
    boost: 100,
    role: 'attack'
  };
}

const cars = [
  createCar('blue', true),
  createCar('blue', false),
  createCar('orange', false),
  createCar('orange', false)
];

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
let goalTimer = 0;
let goalLocked = false;
let orbitAngle = 0;
let elapsed = 0;

function resetPositions(message) {
  const starts = [
    { x: -20, z: -10, heading: 0 },
    { x: -34, z: 12, heading: 0 },
    { x: 20, z: 10, heading: Math.PI },
    { x: 34, z: -12, heading: Math.PI }
  ];

  cars.forEach((car, index) => {
    const start = starts[index];
    car.pos.set(start.x, 0, start.z);
    car.vel.set(0, 0, 0);
    car.heading = start.heading;
    car.cooldown = 0;
    car.flameTimer = 0;
    car.boost = 100;
    car.reactionTimer = 0;
    car.targetError.set(0, 0, 0);
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  });

  ball.pos.set(0, FIELD.ballRadius, 0);
  ball.vel.set(0, 0, 0);
  ballMesh.position.copy(ball.pos);
  matchState = 'KICKOFF';
  kickoffTimer = 1.6;
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
  matchState = 'GOAL';
}

/* ============================== SIMULATION ============================== */

function chooseTarget(car) {
  if (car.reactionTimer <= 0) {
    car.reactionTimer = skill.reaction * rand(0.7, 1.3);
    const errorRadius = (1 - skill.accuracy) * 13;
    car.targetError.set(rand(-errorRadius, errorRadius), 0, rand(-errorRadius, errorRadius));
  }

  const target = ball.pos.clone().add(car.targetError);
  target.y = 0;

  if (car.role === 'defend') {
    const ownGoalX = car.team === 'blue' ? -50 : 50;
    const ballInOwnHalf = car.team === 'blue' ? ball.pos.x < -12 : ball.pos.x > 12;
    const veryFar = car.pos.distanceTo(ball.pos) > 44;
    if (ballInOwnHalf || veryFar) {
      target.set(ownGoalX * 0.55, 0, ball.pos.z * 0.4);
    }
  }

  target.x = clamp(target.x, -47, 47);
  target.z = clamp(target.z, -30, 30);
  return target;
}

function updateCar(car, dt) {
  car.cooldown = Math.max(0, car.cooldown - dt);
  car.reactionTimer -= dt;
  car.flameTimer = Math.max(0, car.flameTimer - dt);
  car.flame.visible = car.flameTimer > 0;

  const target = chooseTarget(car);
  const toTarget = new THREE.Vector3().subVectors(target, car.pos);
  toTarget.y = 0;
  const distance = toTarget.length();

  if (distance > 0.1) {
    const desiredHeading = Math.atan2(toTarget.x, toTarget.z);
    const difference = angleDelta(car.heading, desiredHeading);
    const turnRate = skill.turn * (car.isPlayer ? 1 : 0.92);
    car.heading += clamp(difference, -turnRate * dt, turnRate * dt);
    car.heading = Math.atan2(Math.sin(car.heading), Math.cos(car.heading));
  }

  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const wantsBoost = distance > 18 && car.boost > 0 && Math.random() < skill.boost * dt * 2;
  const boosting = wantsBoost || car.flameTimer > 0;
  const baseSpeed = skill.speed * (car.isPlayer ? 1 : 0.96);
  const maxSpeed = baseSpeed * (boosting ? 1.45 : 1);

  const speedCap = Math.min(maxSpeed, Math.max(5, distance * 2.4));
  const desiredVelocity = toTarget.lengthSq() > 0 ? toTarget.clone().normalize().multiplyScalar(speedCap) : new THREE.Vector3();
  car.vel.lerp(desiredVelocity, clamp((boosting ? 2.6 : 1.9) * dt, 0, 1));
  if (car.vel.length() > maxSpeed) car.vel.setLength(maxSpeed);

  car.pos.addScaledVector(car.vel, dt);
  car.pos.x = clamp(car.pos.x, -48.5, 48.5);
  car.pos.z = clamp(car.pos.z, -31.5, 31.5);

  if (boosting) {
    car.boost = Math.max(0, car.boost - 22 * dt);
    car.flameTimer = 0.14;
  } else {
    car.boost = Math.min(100, car.boost + 7 * dt);
  }

  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  car.wheels.forEach(wheel => { wheel.rotation.x += car.vel.length() * dt * 1.6; });

  const ballDistance = Math.hypot(car.pos.x - ball.pos.x, car.pos.z - ball.pos.z);
  const maxHitHeight = 3.6 + skill.loft * 5;
  if (ballDistance < 3.5 && ball.pos.y < maxHitHeight && car.cooldown <= 0) {
    car.cooldown = 0.45 + (1 - skill.accuracy) * 0.5;

    if (Math.random() < skill.whiff) {
      if (car.isPlayer && Math.random() < 0.18) {
        addCommentary('The rookie swings at nothing. That whiff sums up Bronze.');
      }
      ball.vel.x += rand(-2, 2);
      ball.vel.z += rand(-2, 2);
      return;
    }

    const attackX = car.team === 'blue' ? 50 : -50;
    const aim = new THREE.Vector3(attackX, 0, rand(-FIELD.goalHalf * 0.8, FIELD.goalHalf * 0.8)).sub(ball.pos).normalize();
    const direction = forward.clone().lerp(aim, skill.accuracy).normalize();
    direction.x += rand(-skill.spread, skill.spread);
    direction.z += rand(-skill.spread, skill.spread);
    direction.y = skill.loft * rand(0.2, 1) + (ball.pos.y > 2 ? 0.25 : 0);
    direction.normalize();

    const power = skill.power + rand(0, 7);
    ball.vel.copy(direction.multiplyScalar(power));
    ball.pos.y = Math.max(ball.pos.y, FIELD.ballRadius + 0.35);
    car.flameTimer = 0.22;

    if (car.isPlayer && skillKey === 'bronze' && Math.random() < 0.12) {
      addCommentary('He actually made clean contact! Don\'t get used to it.');
    }
  }
}

function updateBall(dt) {
  if (goalLocked) {
    ballMesh.position.copy(ball.pos);
    ballGlow.position.copy(ball.pos);
    return;
  }

  ball.vel.y -= 42 * dt;
  ball.pos.addScaledVector(ball.vel, dt);

  if (ball.pos.y < FIELD.ballRadius) {
    ball.pos.y = FIELD.ballRadius;
    ball.vel.y = Math.abs(ball.vel.y) * 0.7;
    ball.vel.x *= 0.985;
    ball.vel.z *= 0.985;
    if (ball.vel.y < 1.4) ball.vel.y = 0;
  }

  const ballX = ball.pos.x;
  const ballZ = ball.pos.z;
  const inGoalMouth = Math.abs(ballZ) < FIELD.goalHalf && ball.pos.y < FIELD.goalHeight;

  if (ballX > 50 && inGoalMouth) {
    scoreGoal('blue');
  } else if (ballX < -50 && inGoalMouth) {
    scoreGoal('orange');
  } else {
    if (ballX > 49.2) { ball.pos.x = 49.2; ball.vel.x = -Math.abs(ball.vel.x) * 0.78; }
    if (ballX < -49.2) { ball.pos.x = -49.2; ball.vel.x = Math.abs(ball.vel.x) * 0.78; }
    if (ballZ > 32.2) { ball.pos.z = 32.2; ball.vel.z = -Math.abs(ball.vel.z) * 0.78; }
    if (ballZ < -32.2) { ball.pos.z = -32.2; ball.vel.z = Math.abs(ball.vel.z) * 0.78; }
    if (ball.pos.y > 45) { ball.pos.y = 45; ball.vel.y = -Math.abs(ball.vel.y) * 0.7; }
  }

  ballMesh.position.copy(ball.pos);
  ballMesh.rotation.x += ball.vel.z * dt * 0.25;
  ballMesh.rotation.z -= ball.vel.x * dt * 0.25;
  ballGlow.position.copy(ball.pos);
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
    if (kickoffTimer <= 0) addCommentary('Kickoff! The rookie is already scrambling.');
    updateBall(dt);
    return;
  }

  matchState = 'PLAYING';
  clock -= dt;
  cars.forEach(car => updateCar(car, dt));
  updateBall(dt);

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
    desiredCamera.set(0, 80, 112);
    lookTarget.set(0, 0, 0);
  } else if (cameraMode === 'chase') {
    const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    desiredCamera.copy(player.pos).addScaledVector(forward, -17).add(new THREE.Vector3(0, 9, 0));
    lookTarget.copy(player.pos).addScaledVector(forward, 14).add(new THREE.Vector3(0, 2, 0));
  } else if (cameraMode === 'ball') {
    desiredCamera.copy(ball.pos).add(new THREE.Vector3(0, 12, 24));
    lookTarget.copy(ball.pos);
  } else if (cameraMode === 'orbit') {
    orbitAngle += dt * 0.22;
    desiredCamera.set(Math.cos(orbitAngle) * 112, 56, Math.sin(orbitAngle) * 112);
    lookTarget.set(0, 0, 0);
  } else {
    desiredCamera.set(0, 155, 0.1);
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

dom.playBtn.addEventListener('click', () => {
  paused = !paused;
  dom.playBtn.textContent = paused ? '▶ PLAY' : '⏸ PAUSE';
});

dom.replayBtn.addEventListener('click', () => {
  scoreBlue = 0;
  scoreOrange = 0;
  clock = 180;
  resetPositions('Match restarted.');
});

dom.speedBtn.addEventListener('click', () => {
  speedMultiplier = speedMultiplier === 1 ? 2 : (speedMultiplier === 2 ? 4 : 1);
  dom.speedBtn.textContent = '⏩ SPEED ' + speedMultiplier + '×';
});

dom.backBtn.addEventListener('click', () => {
  window.location.href = 'index.html';
});

document.addEventListener('keydown', event => {
  if (event.key === ' ') {
    event.preventDefault();
    dom.playBtn.click();
  } else if (event.key.toLowerCase() === 'c') {
    const modes = ['broadcast', 'chase', 'ball', 'orbit', 'top'];
    setCameraMode(modes[(modes.indexOf(cameraMode) + 1) % modes.length]);
  } else if (event.key.toLowerCase() === 'r') {
    dom.replayBtn.click();
  } else if (event.key === '+' || event.key === '=') {
    speedMultiplier = Math.min(4, speedMultiplier * 2);
    dom.speedBtn.textContent = '⏩ SPEED ' + speedMultiplier + '×';
  } else if (event.key === '-') {
    speedMultiplier = Math.max(1, speedMultiplier / 2);
    dom.speedBtn.textContent = '⏩ SPEED ' + speedMultiplier + '×';
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
  get cars() { return cars.map(c => { const t = chooseTarget(c); return { team: c.team, x: c.pos.x, z: c.pos.z, heading: c.heading, speed: c.vel.length(), targetX: t.x, targetZ: t.z, errorX: c.targetError.x, errorZ: c.targetError.z }; }); },
  get score() { return { blue: scoreBlue, orange: scoreOrange, clock }; }
};

applySkillUI();
resetPositions('Kickoff! The Bronze rookie looks completely lost already.');
requestAnimationFrame(animate);
