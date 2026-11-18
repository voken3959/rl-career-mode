'use strict';

/* ============================== DATA ============================== */

const SAVE_KEY = 'rl-career-save-v1';

const RANKS = [
  { name: 'Bronze I', min: 0, color: '#cd7f32' },
  { name: 'Bronze II', min: 120, color: '#cd7f32' },
  { name: 'Bronze III', min: 240, color: '#cd7f32' },
  { name: 'Silver I', min: 360, color: '#c8d2de' },
  { name: 'Silver II', min: 480, color: '#c8d2de' },
  { name: 'Silver III', min: 600, color: '#c8d2de' },
  { name: 'Gold I', min: 720, color: '#ffd54a' },
  { name: 'Gold II', min: 840, color: '#ffd54a' },
  { name: 'Gold III', min: 960, color: '#ffd54a' },
  { name: 'Platinum I', min: 1080, color: '#7fe3ff' },
  { name: 'Platinum II', min: 1200, color: '#7fe3ff' },
  { name: 'Platinum III', min: 1320, color: '#7fe3ff' },
  { name: 'Diamond I', min: 1440, color: '#5aa9ff' },
  { name: 'Diamond II', min: 1560, color: '#5aa9ff' },
  { name: 'Diamond III', min: 1680, color: '#5aa9ff' },
  { name: 'Champion I', min: 1800, color: '#b06bff' },
  { name: 'Champion II', min: 1920, color: '#b06bff' },
  { name: 'Champion III', min: 2040, color: '#b06bff' },
  { name: 'Grand Champion I', min: 2160, color: '#ff5fa2' },
  { name: 'Grand Champion II', min: 2280, color: '#ff5fa2' },
  { name: 'Grand Champion III', min: 2400, color: '#ff5fa2' },
  { name: 'Supersonic Legend', min: 2520, color: '#ff8a3d' },
  { name: 'Pro League', min: 2760, color: '#ff4b4b' },
  { name: 'RLCS Challenger', min: 3000, color: '#ff2e88' },
  { name: 'RLCS Pro', min: 3300, color: '#ffd700' },
  { name: 'World Champion', min: 3700, color: '#fff36b' }
];

const ATTRS = [
  { key: 'speed', label: 'Speed', icon: '⚡', desc: 'Boost routes, rotations and ground speed.' },
  { key: 'aerial', label: 'Aerial', icon: '🛩️', desc: 'Air control, double jumps and aerial shots.' },
  { key: 'shooting', label: 'Shooting', icon: '🎯', desc: 'Power, placement and finishing ability.' },
  { key: 'defense', label: 'Defense', icon: '🛡️', desc: 'Saves, clears and defensive positioning.' },
  { key: 'boost', label: 'Boost Mgmt', icon: '⛽', desc: 'Pad pickup routes and boost conservation.' },
  { key: 'teamwork', label: 'Teamwork', icon: '🤝', desc: 'Rotations, passes and communication.' }
];

const DRILLS = [
  { id: 'freeplay', name: 'Free Play', icon: '🏟️', attr: null, gain: 1, energy: 15, xp: 25, level: 1, desc: 'General practice. Small gains across every attribute.' },
  { id: 'aerial', name: 'Aerial Package', icon: '🛩️', attr: 'aerial', gain: 3, energy: 20, xp: 35, level: 1, desc: 'Air control drills and high aerial finishes.' },
  { id: 'shooting', name: 'Shooting Range', icon: '🎯', attr: 'shooting', gain: 3, energy: 20, xp: 35, level: 1, desc: 'Repetition on power shots and placement.' },
  { id: 'defense', name: 'Defense Drill', icon: '🛡️', attr: 'defense', gain: 3, energy: 20, xp: 35, level: 2, desc: 'Save positioning, backboard reads and clears.' },
  { id: 'boost', name: 'Boost Pad Run', icon: '⛽', attr: 'boost', gain: 3, energy: 18, xp: 30, level: 3, desc: 'Optimize your path around the small pads.' },
  { id: 'scrims', name: 'Team Scrims', icon: '🤝', attr: 'teamwork', gain: 4, energy: 25, xp: 50, level: 5, desc: 'Practice rotations and passing with a squad.' }
];

const PLAYLISTS = [
  {
    id: 'duel', name: '1v1 Duel', icon: '⚔️', energy: 18, mmrBase: 30, diff: 1.15,
    desc: 'No teammates to hide behind. Pure mechanics and decision making.',
    weights: { speed: 0.22, aerial: 0.18, shooting: 0.30, defense: 0.10, boost: 0.18, teamwork: 0.02 }
  },
  {
    id: 'doubles', name: '2v2 Doubles', icon: '👥', energy: 20, mmrBase: 26, diff: 1.0,
    desc: 'Fast, chaotic and rotation-heavy. Teamwork starts to matter.',
    weights: { speed: 0.15, aerial: 0.15, shooting: 0.20, defense: 0.15, boost: 0.15, teamwork: 0.20 }
  },
  {
    id: 'standard', name: '3v3 Standard', icon: '🦓', energy: 22, mmrBase: 24, diff: 0.95,
    desc: 'The full team game. Rotations, chemistry and smart passes win matches.',
    weights: { speed: 0.12, aerial: 0.13, shooting: 0.18, defense: 0.17, boost: 0.15, teamwork: 0.25 }
  },
  {
    id: 'tournament', name: 'Tournament', icon: '🏆', energy: 30, mmrBase: 38, diff: 1.3,
    desc: 'High stakes bracket play. Biggest MMR and credit rewards, toughest opponents.',
    tournament: true,
    weights: { speed: 0.13, aerial: 0.14, shooting: 0.19, defense: 0.16, boost: 0.15, teamwork: 0.23 }
  }
];

const CLUBS = [
  { name: 'Free Agent', short: 'FA', req: 0, roster: 0, salary: 0, color: '#5d6b85', desc: 'You are currently unsigned.' },
  { name: 'Bronze Bulldogs', short: 'BB', req: 0, roster: 30, salary: 25, signBonus: 100, color: '#cd7f32', desc: 'A scrappy amateur squad with heart.' },
  { name: 'Silver Streak', short: 'SS', req: 360, roster: 42, salary: 45, signBonus: 200, color: '#c8d2de', desc: 'Fast starters looking for a striker.' },
  { name: 'Gold Miners', short: 'GM', req: 720, roster: 55, salary: 70, signBonus: 350, color: '#ffd54a', desc: 'Well-organized club with solid fundamentals.' },
  { name: 'Platinum Panthers', short: 'PP', req: 1080, roster: 68, salary: 100, signBonus: 500, color: '#7fe3ff', desc: 'Semi-pro academy with serious coaching.' },
  { name: 'Diamond Dynamics', short: 'DD', req: 1440, roster: 80, salary: 140, signBonus: 750, color: '#5aa9ff', desc: 'A dominant ranked squad chasing pro status.' },
  { name: 'Champion Crew', short: 'CC', req: 1800, roster: 90, salary: 190, signBonus: 1000, color: '#b06bff', desc: 'One step from the professional circuit.' },
  { name: 'GC Galaxy', short: 'GG', req: 2160, roster: 98, salary: 250, signBonus: 1400, color: '#ff5fa2', desc: 'Elite players, elite expectations.' },
  { name: 'SSL Syndicate', short: 'SL', req: 2520, roster: 106, salary: 320, signBonus: 1900, color: '#ff8a3d', desc: 'The best of the best in ranked play.' },
  { name: 'RLCS Academy', short: 'RA', req: 2760, roster: 114, salary: 420, signBonus: 2600, color: '#ff4b4b', desc: 'Official pro-league development team.' },
  { name: 'World Elite', short: 'WE', req: 3300, roster: 125, salary: 600, signBonus: 4000, color: '#fff36b', desc: 'A genuine championship contender.' }
];

const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Blood', icon: '🥅', desc: 'Win your first match.', check: s => s.wins >= 1 },
  { id: 'silver', name: 'Silver Bound', icon: '🥈', desc: 'Reach Silver I.', check: s => rankIndex(s.mmr) >= 3 },
  { id: 'gold', name: 'Gold Rush', icon: '🥇', desc: 'Reach Gold I.', check: s => rankIndex(s.mmr) >= 6 },
  { id: 'platinum', name: 'Platinum Player', icon: '💎', desc: 'Reach Platinum I.', check: s => rankIndex(s.mmr) >= 9 },
  { id: 'diamond', name: 'Diamond Hands', icon: '🔷', desc: 'Reach Diamond I.', check: s => rankIndex(s.mmr) >= 12 },
  { id: 'champion', name: 'Champion Material', icon: '👑', desc: 'Reach Champion I.', check: s => rankIndex(s.mmr) >= 15 },
  { id: 'gc', name: 'Grand Champion', icon: '🌟', desc: 'Reach Grand Champion I.', check: s => rankIndex(s.mmr) >= 18 },
  { id: 'ssl', name: 'Supersonic', icon: '🚀', desc: 'Reach Supersonic Legend.', check: s => rankIndex(s.mmr) >= 21 },
  { id: 'pro', name: 'Going Pro', icon: '🏅', desc: 'Reach Pro League.', check: s => rankIndex(s.mmr) >= 22 },
  { id: 'worldchamp', name: 'World Champion', icon: '🌍', desc: 'Reach the World Champion rank.', check: s => rankIndex(s.mmr) >= 25 },
  { id: 'century', name: 'Century Club', icon: '🎯', desc: 'Score 100 career goals.', check: s => s.goals >= 100 },
  { id: 'tourney', name: 'Cup Winner', icon: '🏆', desc: 'Win a tournament.', check: s => s.tournamentWins >= 1 },
  { id: 'signed', name: 'Club Player', icon: '🛡️', desc: 'Sign with any club.', check: s => s.team !== 'Free Agent' },
  { id: 'level10', name: 'Veteran', icon: '⭐', desc: 'Reach level 10.', check: s => s.level >= 10 },
  { id: 'trainer', name: 'Grind Set', icon: '🏋️', desc: 'Complete 25 training sessions.', check: s => s.trainingCount >= 25 }
];

const ROLES = {
  striker: { name: 'Striker', perks: '+shooting, +aerial, +speed' },
  midfielder: { name: 'Midfielder', perks: '+teamwork, +boost, +speed' },
  defender: { name: 'Defender', perks: '+defense, +teamwork, +aerial' },
  allrounder: { name: 'All-Rounder', perks: 'balanced boost to all stats' }
};

const ROLE_BONUSES = {
  striker: { shooting: 6, aerial: 3, speed: 2 },
  midfielder: { teamwork: 6, boost: 4, speed: 2 },
  defender: { defense: 6, teamwork: 3, aerial: 2 },
  allrounder: { speed: 2, aerial: 2, shooting: 2, defense: 2, boost: 2, teamwork: 2 }
};

const BOT_NAMES = [
  'KickoffKing', 'BoostBandit', 'AerialAce', 'FlipReset', 'SonicStriker', 'PADCollector',
  'DemoDemon', 'BackboardHero', 'ZeroSecond', 'CeilingShot', 'TurboToast', 'WallRider',
  'NoseDive', 'QuickChat', 'GrandLancer', 'RocketRogue', 'MidfieldMaya', 'DoubleJumpDan',
  'SupersonicSam', 'ShadowDef', 'ClubCrusher', 'PassMaster', 'NitroNora', 'GhostGoalie'
];

/* ============================== UTILS ============================== */

const $ = selector => document.querySelector(selector);

function esc(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function formatNum(num) {
  return Math.round(num).toLocaleString();
}

function rankIndex(mmr) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (mmr >= RANKS[i].min) index = i;
  }
  return index;
}

function rankInfo(mmr) {
  const index = rankIndex(mmr);
  const current = RANKS[index];
  return {
    ...current,
    index,
    next: RANKS[index + 1] || null
  };
}

function rankColor(mmr) {
  return rankInfo(mmr).color;
}

function xpNeeded(level) {
  return 100 + level * 60;
}

function overall(state) {
  const values = ATTRS.map(a => state.attributes[a.key]);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roleBonus(state, key) {
  return (ROLE_BONUSES[state.role] || {})[key] || 0;
}

function playlistPower(state, playlist) {
  let power = 0;
  ATTRS.forEach(attr => {
    power += (state.attributes[attr.key] + roleBonus(state, attr.key)) * (playlist.weights[attr.key] || 0);
  });
  if (state.team !== 'Free Agent') {
    const club = CLUBS.find(c => c.name === state.team);
    if (club) power += club.roster * 0.22 + state.chemistry * 0.12;
  }
  power += (state.morale - 50) * 0.06;
  return power;
}

function opponentPower(state, playlist) {
  return 26 + state.mmr / 26 + playlist.diff * 6 + randInt(-7, 7);
}

/* ============================== STATE ============================== */

function defaultState() {
  const state = {
    name: 'Rookie',
    role: 'allrounder',
    mmr: 0,
    xp: 0,
    level: 1,
    skillPoints: 0,
    credits: 500,
    energy: 100,
    morale: 70,
    week: 1,
    season: 1,
    team: 'Free Agent',
    chemistry: 0,
    attributes: { speed: 30, aerial: 26, shooting: 30, defense: 26, boost: 26, teamwork: 28 },
    wins: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    mvp: 0,
    tournamentWins: 0,
    trainingCount: 0,
    achievements: [],
    history: [],
    contract: null
  };
  state.contract = generateContract(state);
  return state;
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      attributes: { ...base.attributes, ...(parsed.attributes || {}) },
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      contract: parsed.contract || base.contract
    };
  } catch (error) {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast('Could not save progress in this browser.', 'warn');
  }
}

let state = loadState();
let currentTab = 'dashboard';
let modalButtons = [];
let modalClosable = true;

/* ============================== GAME LOGIC ============================== */

function addXp(target, amount) {
  target.xp += amount;
  while (target.xp >= xpNeeded(target.level)) {
    target.xp -= xpNeeded(target.level);
    target.level++;
    target.skillPoints++;
    target.credits += 150;
    target.energy = clamp(target.energy + 25, 0, 100);
    showToast('Level ' + target.level + '! +1 skill point, +150 credits', 'success');
  }
}

function advanceWeek() {
  state.week++;
  if (state.team !== 'Free Agent') {
    const club = CLUBS.find(c => c.name === state.team);
    if (club) {
      state.credits += club.salary;
    }
  }
  if (state.week > 40) {
    state.week = 1;
    state.season++;
    showToast('Season ' + state.season + ' has begun!', 'info');
  }
}

function generateContract(target) {
  const level = target.level || 1;
  const currentRank = rankIndex(target.mmr || 0);
  const kinds = ['wins', 'goals', 'rank'];
  if (currentRank >= 12) kinds.push('tournament');
  const kind = kinds[randInt(0, kinds.length - 1)];

  let title;
  let desc;
  let goal;

  if (kind === 'wins') {
    goal = randInt(3, 5) + Math.floor(level / 3);
    title = 'Win Streak Deal';
    desc = 'Win ' + goal + ' matches';
  } else if (kind === 'goals') {
    goal = randInt(8, 14) + level * 2;
    title = 'Goal Scorer Deal';
    desc = 'Score ' + goal + ' goals';
  } else if (kind === 'rank') {
    goal = Math.min(currentRank + 2, RANKS.length - 1);
    title = 'Promotion Bonus';
    desc = 'Reach ' + RANKS[goal].name;
  } else {
    goal = 1;
    title = 'Cup Contender';
    desc = 'Win a tournament';
  }

  const scale = 1 + level * 0.15 + currentRank * 0.05;
  return {
    kind,
    title,
    desc,
    target: goal,
    progress: 0,
    claimed: false,
    reward: {
      credits: Math.round((180 + randInt(0, 120)) * scale),
      xp: Math.round((120 + randInt(0, 80)) * scale)
    }
  };
}

function updateContract(data) {
  const contract = state.contract;
  if (!contract || contract.claimed || contract.progress >= contract.target) return;

  if (contract.kind === 'wins' && data.win) contract.progress++;
  if (contract.kind === 'goals') contract.progress += data.goals;
  if (contract.kind === 'tournament' && data.tournament && data.win) contract.progress++;
  if (contract.kind === 'rank' && rankIndex(state.mmr) >= contract.target) contract.progress = contract.target;

  contract.progress = Math.min(contract.progress, contract.target);
}

function claimContract() {
  const contract = state.contract;
  if (!contract || contract.claimed || contract.progress < contract.target) return;
  state.credits += contract.reward.credits;
  addXp(state, contract.reward.xp);
  showToast('Contract complete: +' + contract.reward.credits + ' credits, +' + contract.reward.xp + ' XP', 'success');
  state.contract = generateContract(state);
  saveState();
  render();
}

function checkAchievements() {
  const unlocked = [];
  ACHIEVEMENTS.forEach(achievement => {
    if (!state.achievements.includes(achievement.id) && achievement.check(state)) {
      state.achievements.push(achievement.id);
      unlocked.push(achievement);
    }
  });
  unlocked.forEach(achievement => {
    showToast('Achievement unlocked: ' + achievement.name, 'success');
  });
  return unlocked;
}

function simulateMatch(playlistId) {
  const playlist = PLAYLISTS.find(p => p.id === playlistId);
  if (!playlist) return;

  if (state.energy < playlist.energy) {
    showToast('Not enough energy. Rest by training less or wait for the next season.', 'warn');
    return;
  }

  const myPower = playlistPower(state, playlist);
  const theirPower = opponentPower(state, playlist);
  const winChance = 1 / (1 + Math.exp(-(myPower - theirPower) / 13));
  const won = Math.random() < winChance;
  const powerGap = Math.abs(myPower - theirPower);

  const winnerScore = clamp(1 + Math.floor(powerGap / 11) + randInt(0, 3), 1, 8);
  const loserScore = randInt(0, Math.max(0, winnerScore - 1));
  const yourScore = won ? winnerScore : loserScore;
  const theirScore = won ? loserScore : winnerScore;

  const goalChance = clamp(0.28 + state.attributes.shooting / 220 + (won ? 0.18 : 0), 0.2, 0.9);
  let goals = 0;
  for (let i = 0; i < yourScore; i++) {
    if (Math.random() < goalChance) goals++;
  }
  if (!won) goals = Math.min(goals, yourScore);
  if (won && goals === 0 && Math.random() < 0.55) goals = 1;

  const assists = randInt(0, clamp(winnerScore, 0, 4));
  const saves = clamp(Math.round(state.attributes.defense / 14) + randInt(0, 3) + (won ? 0 : 2), 0, 12);

  let mmrDelta = won
    ? Math.round(playlist.mmrBase * (1 + (1 - winChance) * 0.7))
    : -Math.round(playlist.mmrBase * (0.65 + winChance * 0.55));
  if (playlist.tournament) mmrDelta = Math.round(mmrDelta * 1.35);
  mmrDelta = clamp(mmrDelta, -60, 65);

  const oldRank = rankIndex(state.mmr);
  state.mmr = Math.max(0, state.mmr + mmrDelta);
  const newRank = rankIndex(state.mmr);

  const xpGain = 35 + (won ? 45 : 15) + goals * 12 + (playlist.tournament ? 55 : 0);
  const creditGain = 18 + (won ? 38 : 8) + goals * 6 + (playlist.tournament ? 60 : 0);

  state.energy = clamp(state.energy - playlist.energy, 0, 100);
  state.morale = clamp(state.morale + (won ? 4 : -3), 0, 100);
  state.wins += won ? 1 : 0;
  state.losses += won ? 0 : 1;
  state.goals += goals;
  state.assists += assists;
  state.saves += saves;
  if (won && goals >= 2 && Math.random() < 0.6) state.mvp++;
  if (playlist.tournament && won) state.tournamentWins++;
  if (state.team !== 'Free Agent') {
    state.chemistry = clamp(state.chemistry + (won ? 3 : -2), 0, 100);
  }

  advanceWeek();
  addXp(state, xpGain);
  state.credits += creditGain;
  updateContract({ win: won, goals, tournament: !!playlist.tournament });
  checkAchievements();

  const commentary = [
    'Kickoff whistle blows and both teams push forward.',
    won
      ? 'You find space on the flank and thread a pass through the defense.'
      : 'The opposition catches you out of position on a quick counter-attack.',
    goals > 0
      ? 'You get on the scoresheet with ' + goals + ' goal' + (goals === 1 ? '' : 's') + '.'
      : 'You create chances but cannot find the back of the net.',
    'Your keeper comes up with ' + saves + ' crucial save' + (saves === 1 ? '' : 's') + '.',
    won ? 'Final whistle — the crowd erupts!' : 'Final whistle — a tough result to swallow.'
  ];

  state.history.unshift({
    won,
    playlist: playlist.name,
    score: yourScore + ' - ' + theirScore,
    goals,
    assists,
    saves,
    mmrDelta,
    week: state.week,
    season: state.season
  });
  state.history = state.history.slice(0, 25);

  saveState();
  render();

  showMatchModal({
    playlist,
    won,
    yourScore,
    theirScore,
    goals,
    assists,
    saves,
    mmrDelta,
    xpGain,
    creditGain,
    commentary,
    rankUp: newRank > oldRank,
    oldRankName: RANKS[oldRank].name,
    newRankName: RANKS[newRank].name
  });
}

function train(drillId) {
  const drill = DRILLS.find(d => d.id === drillId);
  if (!drill) return;

  if (state.level < drill.level) {
    showToast('Requires level ' + drill.level + '.', 'warn');
    return;
  }
  if (state.energy < drill.energy) {
    showToast('Not enough energy for this drill.', 'warn');
    return;
  }

  const keys = drill.attr ? [drill.attr] : ATTRS.map(a => a.key);
  const gains = [];
  keys.forEach(key => {
    const attr = ATTRS.find(a => a.key === key);
    const effectiveness = 1 - Math.max(0, state.attributes[key] - 80) / 70;
    const gain = Math.max(1, Math.round(drill.gain * effectiveness));
    const before = state.attributes[key];
    state.attributes[key] = Math.min(99, before + gain);
    gains.push(attr.label + ' +' + (state.attributes[key] - before));
  });

  state.energy = clamp(state.energy - drill.energy, 0, 100);
  state.morale = clamp(state.morale + 2, 0, 100);
  state.trainingCount++;
  advanceWeek();
  addXp(state, drill.xp);
  checkAchievements();
  saveState();
  render();
  showToast(drill.name + ' complete — ' + gains.join(', '), 'success');
}

function spendPoint(key) {
  if (state.skillPoints <= 0) return;
  if (state.attributes[key] >= 99) return;
  const attr = ATTRS.find(a => a.key === key);
  state.skillPoints--;
  state.attributes[key] = Math.min(99, state.attributes[key] + 3);
  saveState();
  render();
  showToast(attr.label + ' upgraded to ' + state.attributes[key], 'success');
}

function joinClub(clubName) {
  const club = CLUBS.find(c => c.name === clubName);
  if (!club || club.name === 'Free Agent') return;
  if (state.mmr < club.req) {
    showToast('Requires ' + club.req + ' MMR to sign.', 'warn');
    return;
  }
  if (state.team === club.name) return;

  state.team = club.name;
  state.chemistry = 35;
  state.credits += club.signBonus || 0;
  checkAchievements();
  saveState();
  render();
  showToast('Signed with ' + club.name + '! Signing bonus: ' + (club.signBonus || 0) + ' credits.', 'success');
}

function leaderboardRows() {
  const rows = BOT_NAMES.map((name, index) => {
    const noise = ((name.charCodeAt(0) * 7 + name.length * 13) % 190) - 95;
    return {
      name,
      mmr: clamp(Math.round(state.mmr + (index - 11) * 95 + noise), 0, 3800),
      you: false
    };
  });
  rows.push({ name: state.name + ' (You)', mmr: state.mmr, you: true });
  rows.sort((a, b) => b.mmr - a.mmr);
  return rows;
}

/* ============================== MODALS & TOASTS ============================== */

let toastTimer = 0;

function showToast(message, type) {
  const wrap = $('#toastWrap');
  if (!wrap) return;
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  toast.textContent = message;
  wrap.appendChild(toast);
  toastTimer++;
  const thisTimer = toastTimer;
  window.setTimeout(() => {
    toast.remove();
  }, 4200);
  void thisTimer;
}

function openModal(options) {
  const buttons = options.buttons || [];
  modalButtons = buttons;
  modalClosable = options.closable !== false;

  const buttonsHtml = buttons.length
    ? '<div class="modal-foot">' + buttons.map((button, index) =>
        '<button class="btn ' + esc(button.class || '') + '" data-modal-btn="' + index + '">' + esc(button.label) + '</button>'
      ).join('') + '</div>'
    : '';

  $('#modal').innerHTML =
    '<div class="modal-head">' +
      '<div class="modal-title">' + esc(options.title) + '</div>' +
      (modalClosable ? '<button class="modal-close" data-action="closeModal" aria-label="Close">✕</button>' : '') +
    '</div>' +
    '<div class="modal-body">' + options.html + '</div>' +
    buttonsHtml;

  $('#modalBackdrop').classList.remove('hidden');
}

function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
  modalButtons = [];
  modalClosable = true;
}

function showOnboarding() {
  const roleOptions = Object.keys(ROLES).map(key =>
    '<option value="' + key + '"' + (state.role === key ? ' selected' : '') + '>' +
    esc(ROLES[key].name) + ' — ' + esc(ROLES[key].perks) +
    '</option>'
  ).join('');

  openModal({
    title: 'WELCOME TO THE CLUB',
    closable: false,
    html:
      '<p class="card-desc">You are a raw Bronze rookie with a rocket-powered dream. Train, play matches, climb the ranks and eventually sign with a pro club. Every match matters.</p>' +
      '<div class="field" style="margin-top:18px"><label>Player name</label>' +
      '<input class="input" id="onbName" maxlength="16" value="' + esc(state.name) + '" placeholder="Enter your name" /></div>' +
      '<div class="field"><label>Play style</label><select class="select" id="onbRole">' + roleOptions + '</select></div>' +
      '<p class="card-note">Tip: Free Play and 1v1s are great early ways to build mechanical skill.</p>',
    buttons: [{
      label: 'START CAREER',
      class: 'btn-primary',
      onClick: () => {
        const nameInput = $('#onbName');
        const roleInput = $('#onbRole');
        state.name = (nameInput && nameInput.value.trim().slice(0, 16)) || 'Rookie';
        state.role = (roleInput && roleInput.value) || 'allrounder';
        saveState();
        closeModal();
        render();
        showToast('Career started. Good luck out there, ' + state.name + '!', 'success');
      }
    }]
  });
}

function showMatchModal(match) {
  const rankUpHtml = match.rankUp
    ? '<div class="rankup"><div class="rankup-title">PROMOTED!</div>' +
      '<div style="color:var(--muted);font-size:12px">' + esc(match.oldRankName) + ' → <strong style="color:var(--gold)">' + esc(match.newRankName) + '</strong></div></div>'
    : '';

  const rewardHtml =
    '<div class="reward-grid">' +
      '<div class="reward"><div class="reward-label">MMR</div><div class="reward-value" style="color:' + (match.mmrDelta >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (match.mmrDelta >= 0 ? '+' : '') + match.mmrDelta + '</div></div>' +
      '<div class="reward"><div class="reward-label">XP</div><div class="reward-value">+' + match.xpGain + '</div></div>' +
      '<div class="reward"><div class="reward-label">Credits</div><div class="reward-value">+' + match.creditGain + '</div></div>' +
      '<div class="reward"><div class="reward-label">Goals</div><div class="reward-value">' + match.goals + '</div></div>' +
    '</div>';

  const commentaryHtml = '<div class="commentary">' + match.commentary.map(line => '<p>' + esc(line) + '</p>').join('') + '</div>';

  openModal({
    title: esc(match.playlist.name).toUpperCase(),
    html:
      rankUpHtml +
      '<div class="result-banner' + (match.won ? '' : ' loss') + '">' +
        '<div class="result-title">' + (match.won ? 'VICTORY' : 'DEFEAT') + '</div>' +
        '<div class="result-score">' + match.yourScore + ' — ' + match.theirScore + '</div>' +
        '<div class="result-sub">' + match.assists + ' assists · ' + match.saves + ' saves · Season ' + state.season + ', Week ' + state.week + '</div>' +
      '</div>' +
      rewardHtml +
      '<div class="card-title" style="font-size:15px">Match Commentary</div>' +
      commentaryHtml,
    buttons: [
      { label: 'CONTINUE', class: 'btn-primary', onClick: closeModal },
      { label: 'PLAY AGAIN', onClick: () => { closeModal(); simulateMatch(match.playlist.id); } }
    ]
  });
}

/* ============================== RENDERING ============================== */

function renderHeader() {
  const rank = rankInfo(state.mmr);
  const chips = [
    { icon: '◆', label: 'Rank', value: rank.name, color: rank.color },
    { icon: '📊', label: 'MMR', value: formatNum(state.mmr) },
    { icon: '⭐', label: 'Level', value: String(state.level) },
    { icon: '💰', label: 'Credits', value: formatNum(state.credits) },
    { icon: '⚡', label: 'Energy', value: state.energy + '/100' },
    { icon: '🛡️', label: 'Club', value: state.team }
  ];

  $('#headerStats').innerHTML = chips.map(chip =>
    '<div class="hstat">' +
      '<span class="hstat-icon"' + (chip.color ? ' style="color:' + chip.color + '"' : '') + '>' + chip.icon + '</span>' +
      '<div><div class="hstat-label">' + esc(chip.label) + '</div>' +
      '<div class="hstat-value">' + esc(chip.value) + '</div></div>' +
    '</div>'
  ).join('');

  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === currentTab);
  });
}

function renderDashboard() {
  const rank = rankInfo(state.mmr);
  const next = rank.next;
  const progress = next ? clamp((state.mmr - rank.min) / (next.min - rank.min) * 100, 0, 100) : 100;
  const played = state.wins + state.losses;
  const winRate = played ? Math.round(state.wins / played * 100) : 0;
  const club = CLUBS.find(c => c.name === state.team);
  const goal = state.contract;
  const goalProgress = goal ? clamp(goal.progress / goal.target * 100, 0, 100) : 0;

  const ladderStart = Math.max(0, rank.index - 2);
  const ladderHtml = RANKS.slice(ladderStart, ladderStart + 7).map((rung, offset) => {
    const absolute = ladderStart + offset;
    const cls = absolute === rank.index ? ' current' : (absolute < rank.index ? ' passed' : '');
    return '<div class="rung' + cls + '">' +
      '<span class="rung-dot" style="color:' + rung.color + '"></span>' +
      '<span class="rung-name">' + esc(rung.name) + '</span>' +
      '<span class="rung-mmr">' + formatNum(rung.min) + '</span>' +
    '</div>';
  }).join('');

  const historyHtml = state.history.length
    ? state.history.slice(0, 5).map(match =>
        '<div class="match-row">' +
          '<div class="result-pill ' + (match.won ? 'win' : 'loss') + '">' + (match.won ? 'W' : 'L') + '</div>' +
          '<div class="match-main"><div class="match-name">' + esc(match.playlist) + '</div>' +
          '<div class="match-meta">S' + match.season + ' · W' + match.week + ' · ' + match.goals + ' goals · ' + match.assists + ' assists</div></div>' +
          '<div class="match-score">' + esc(match.score) + '</div>' +
          '<div class="mmr-delta ' + (match.mmrDelta >= 0 ? 'pos' : 'neg') + '">' + (match.mmrDelta >= 0 ? '+' : '') + match.mmrDelta + '</div>' +
        '</div>'
      ).join('')
    : '<div class="empty">No matches played yet. Hit the pitch to start your career.</div>';

  const contractHtml = goal
    ? '<div class="contract-body">' +
        '<div class="contract-top"><div><div class="contract-name">' + esc(goal.title) + '</div>' +
        '<div class="contract-desc">' + esc(goal.desc) + '</div></div>' +
        '<div class="reward-tag">+' + formatNum(goal.reward.credits) + ' ¢</div></div>' +
        '<div class="contract-goal"><span>Progress</span><span>' + goal.progress + ' / ' + goal.target + '</span></div>' +
        '<div class="progress"><div class="progress-fill" style="width:' + goalProgress + '%"></div></div>' +
        '<div style="margin-top:14px">' +
          (goal.progress >= goal.target
            ? '<button class="btn btn-primary btn-block" data-action="claim">CLAIM REWARD · +' + goal.reward.xp + ' XP</button>'
            : '<button class="btn btn-block" disabled>IN PROGRESS</button>') +
        '</div>' +
      '</div>'
    : '<div class="empty">No active contract.</div>';

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">CAREER DASHBOARD</h1>' +
    '<div class="page-sub">Season ' + state.season + ' · Week ' + state.week + ' of 40 · ' + esc(state.name) + ' · ' + esc(ROLES[state.role].name) + '</div></div>' +
    '<div class="card-note">Overall rating <strong style="color:var(--cyan);font-size:18px">' + overall(state) + '</strong></div></div>' +

    '<section class="hero">' +
      '<div><div class="hero-label">Current Rank</div>' +
      '<div class="hero-rank" style="color:' + rank.color + '">' + esc(rank.name) + '</div>' +
      '<div class="hero-mmr"><strong>' + formatNum(state.mmr) + ' MMR</strong> · ' + (next ? esc(next.name) + ' at ' + formatNum(next.min) : 'Top rank reached') + '</div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
      '<div class="progress-labels"><span>' + esc(rank.name) + '</span><span>' + (next ? esc(next.name) : 'MAX') + '</span></div>' +
      '</div>' +
      '<div class="hero-side">' +
        '<div class="hero-chip"><div class="hero-chip-label">Club</div><div class="hero-chip-value">' + esc(state.team) + '</div></div>' +
        '<div class="hero-chip"><div class="hero-chip-label">Chemistry</div><div class="hero-chip-value">' + state.chemistry + '%</div></div>' +
        '<div class="hero-chip"><div class="hero-chip-label">Morale</div><div class="hero-chip-value">' + state.morale + '%</div></div>' +
        '<div class="hero-chip"><div class="hero-chip-label">Skill Points</div><div class="hero-chip-value">' + state.skillPoints + '</div></div>' +
      '</div>' +
    '</section>' +

    '<div class="stat-grid">' +
      '<div class="stat"><div class="stat-label">Record</div><div class="stat-value">' + state.wins + ' – ' + state.losses + '</div><div class="stat-foot">' + winRate + '% win rate</div></div>' +
      '<div class="stat"><div class="stat-label">Goals</div><div class="stat-value">' + state.goals + '</div><div class="stat-foot">' + state.assists + ' assists</div></div>' +
      '<div class="stat"><div class="stat-label">Saves</div><div class="stat-value">' + state.saves + '</div><div class="stat-foot">' + state.mvp + ' MVP awards</div></div>' +
      '<div class="stat"><div class="stat-label">Next Level</div><div class="stat-value">' + state.xp + ' / ' + xpNeeded(state.level) + '</div><div class="stat-foot">XP to level ' + (state.level + 1) + '</div></div>' +
    '</div>' +

    '<div class="quick-actions">' +
      '<button class="quick" data-action="train" data-id="freeplay"><div class="quick-icon">🏟️</div><div class="quick-name">Free Play</div><div class="quick-desc">Quick general practice</div></button>' +
      '<button class="quick" data-action="play" data-id="duel"><div class="quick-icon">⚔️</div><div class="quick-name">1v1 Duel</div><div class="quick-desc">Prove yourself solo</div></button>' +
      '<button class="quick" data-action="play" data-id="standard"><div class="quick-icon">🦓</div><div class="quick-name">3v3 Standard</div><div class="quick-desc">Full team match</div></button>' +
      '<button class="quick" data-action="play" data-id="tournament"><div class="quick-icon">🏆</div><div class="quick-name">Tournament</div><div class="quick-desc">High-risk, high-reward</div></button>' +
    '</div>' +

    '<div class="two-col">' +
      '<div class="card"><div class="card-head"><div class="card-title">CAREER LADDER</div><div class="card-note">Bronze → Pro</div></div><div class="ladder">' + ladderHtml + '</div></div>' +
      '<div>' +
        '<div class="card" style="margin-bottom:16px"><div class="card-head"><div class="card-title">ACTIVE CONTRACT</div>' +
        '<span class="tag gold">' + esc(goal ? goal.kind.toUpperCase() : '') + '</span></div>' + contractHtml + '</div>' +
        '<div class="card"><div class="card-head"><div class="card-title">RECENT RESULTS</div><div class="card-note">Last 5 matches</div></div>' + historyHtml + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="card" style="margin-top:16px"><div class="card-pad card-note">Current club: <strong style="color:' + (club ? club.color : 'var(--text)') + '">' + esc(state.team) + '</strong>' +
    (club && club.name !== 'Free Agent' ? ' · Weekly salary: ' + club.salary + ' credits · Roster rating: ' + club.roster : '') +
    ' · Achievements unlocked: ' + state.achievements.length + '/' + ACHIEVEMENTS.length + '</div></div>';
}

function renderTraining() {
  const attrsHtml = ATTRS.map(attr => {
    const value = state.attributes[attr.key];
    return '<div class="attr-card">' +
      '<div class="attr-top"><span class="attr-icon">' + attr.icon + '</span>' +
      '<span class="attr-name">' + esc(attr.label) + '</span>' +
      '<span class="attr-value">' + value + '</span></div>' +
      '<div class="attr-desc">' + esc(attr.desc) + '</div>' +
      '<div class="attr-bottom"><div class="progress"><div class="progress-fill" style="width:' + value + '%"></div></div>' +
      '<button class="btn btn-sm" data-action="spend" data-key="' + attr.key + '"' +
      (state.skillPoints <= 0 || value >= 99 ? ' disabled' : '') + '>+3</button></div>' +
    '</div>';
  }).join('');

  const drillsHtml = DRILLS.map(drill => {
    const locked = state.level < drill.level;
    const tired = state.energy < drill.energy;
    return '<div class="drill-card">' +
      '<div class="card-icon">' + drill.icon + '</div>' +
      '<div class="card-title-lg">' + esc(drill.name) + '</div>' +
      '<div class="card-desc">' + esc(drill.desc) + '</div>' +
      '<div class="card-meta">' +
        '<span class="tag cyan">' + (drill.attr ? esc(ATTRS.find(a => a.key === drill.attr).label) : 'All stats') + '</span>' +
        '<span class="tag">+' + drill.xp + ' XP</span>' +
        '<span class="tag">- ' + drill.energy + ' energy</span>' +
        (locked ? '<span class="tag red">Level ' + drill.level + '</span>' : '') +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-action="train" data-id="' + drill.id + '"' + (locked || tired ? ' disabled' : '') + '>' +
      (locked ? 'LOCKED' : (tired ? 'TOO TIRED' : 'START DRILL')) + '</button>' +
    '</div>';
  }).join('');

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">TRAINING GROUND</h1>' +
    '<div class="page-sub">Build your mechanics. Training advances the week by 1.</div></div>' +
    '<div class="card-note">Energy <strong style="color:var(--orange);font-size:18px">' + state.energy + '/100</strong></div></div>' +

    (state.skillPoints > 0
      ? '<div class="notice"><span style="font-size:20px">⭐</span><div><strong>' + state.skillPoints + ' skill point' + (state.skillPoints === 1 ? '' : 's') + ' available!</strong>' +
        '<div style="color:var(--muted)">Spend them below for an instant +3 to any attribute.</div></div></div>'
      : '') +

    '<div class="card" style="margin-bottom:16px"><div class="card-head"><div class="card-title">PLAYER ATTRIBUTES</div>' +
    '<div class="card-note">Overall ' + overall(state) + '</div></div>' +
    '<div class="card-pad three-col" style="padding:14px">' + attrsHtml + '</div></div>' +

    '<div class="page-head" style="margin-top:22px"><div><h1 class="page-title" style="font-size:24px">DRILLS</h1>' +
    '<div class="page-sub">Consistent practice is how Bronze players become pros.</div></div></div>' +
    '<div class="three-col">' + drillsHtml + '</div>';
}

function renderMatches() {
  const cards = PLAYLISTS.map(playlist => {
    const tired = state.energy < playlist.energy;
    return '<div class="playlist-card">' +
      '<div class="card-icon">' + playlist.icon + '</div>' +
      '<div class="card-title-lg">' + esc(playlist.name) + '</div>' +
      '<div class="card-desc">' + esc(playlist.desc) + '</div>' +
      '<div class="card-meta">' +
        '<span class="tag cyan">±' + playlist.mmrBase + ' base MMR</span>' +
        '<span class="tag">- ' + playlist.energy + ' energy</span>' +
        (playlist.tournament ? '<span class="tag gold">1.35× rewards</span>' : '') +
      '</div>' +
      '<button class="btn ' + (playlist.tournament ? 'btn-orange' : 'btn-primary') + ' btn-block" data-action="play" data-id="' + playlist.id + '"' + (tired ? ' disabled' : '') + '>' +
      (tired ? 'TOO TIRED' : 'QUEUE UP') + '</button>' +
    '</div>';
  }).join('');

  const historyHtml = state.history.length
    ? state.history.slice(0, 10).map(match =>
        '<div class="match-row"><div class="result-pill ' + (match.won ? 'win' : 'loss') + '">' + (match.won ? 'W' : 'L') + '</div>' +
        '<div class="match-main"><div class="match-name">' + esc(match.playlist) + '</div>' +
        '<div class="match-meta">' + match.goals + ' goals · ' + match.assists + ' assists · ' + match.saves + ' saves</div></div>' +
        '<div class="match-score">' + esc(match.score) + '</div>' +
        '<div class="mmr-delta ' + (match.mmrDelta >= 0 ? 'pos' : 'neg') + '">' + (match.mmrDelta >= 0 ? '+' : '') + match.mmrDelta + '</div></div>'
      ).join('')
    : '<div class="empty">Your match history will appear here.</div>';

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">MATCHMAKING</h1>' +
    '<div class="page-sub">Every result moves your MMR. Win to climb, lose to slide.</div></div>' +
    '<div class="card-note">Win rate: ' + (state.wins + state.losses ? Math.round(state.wins / (state.wins + state.losses) * 100) : 0) + '%</div></div>' +
    '<div class="three-col">' + cards + '</div>' +
    '<div class="card" style="margin-top:18px"><div class="card-head"><div class="card-title">MATCH HISTORY</div>' +
    '<div class="card-note">Last 10 results</div></div>' + historyHtml + '</div>';
}

function renderClubs() {
  const cards = CLUBS.filter(club => club.name !== 'Free Agent').map(club => {
    const eligible = state.mmr >= club.req;
    const current = state.team === club.name;
    return '<div class="club-card' + (current ? ' current' : '') + '">' +
      '<div class="club-row">' +
        '<div class="club-mark" style="background:' + club.color + '">' + esc(club.short) + '</div>' +
        '<div style="flex:1"><div class="card-title-lg" style="margin-top:0">' + esc(club.name) + '</div>' +
        '<div class="card-note">' + esc(club.desc) + '</div></div>' +
      '</div>' +
      '<div class="card-meta" style="margin-top:14px">' +
        '<span class="tag ' + (eligible ? 'green' : 'red') + '">' + formatNum(club.req) + ' MMR required</span>' +
        '<span class="tag cyan">Roster ' + club.roster + '</span>' +
        '<span class="tag">' + club.salary + ' ¢/week</span>' +
        '<span class="tag gold">' + formatNum(club.signBonus || 0) + ' ¢ signing</span>' +
      '</div>' +
      '<button class="btn ' + (current ? '' : 'btn-primary') + ' btn-block" data-action="join" data-team="' + esc(club.name) + '"' +
      (!eligible || current ? ' disabled' : '') + '>' +
      (current ? 'YOUR CLUB' : (eligible ? 'SIGN WITH CLUB' : 'LOCKED')) + '</button>' +
    '</div>';
  }).join('');

  const currentClub = CLUBS.find(c => c.name === state.team);

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">CLUBS & CONTRACTS</h1>' +
    '<div class="page-sub">Signing with a club boosts your team power and pays a weekly salary.</div></div>' +
    '<div class="card-note">Current MMR <strong style="color:var(--cyan);font-size:18px">' + formatNum(state.mmr) + '</strong></div></div>' +
    (currentClub && currentClub.name !== 'Free Agent'
      ? '<div class="notice" style="border-color:' + currentClub.color + '55;background:' + currentClub.color + '12;color:' + currentClub.color + '">' +
        '<span style="font-size:20px">🛡️</span><div><strong>Playing for ' + esc(currentClub.name) + '</strong>' +
        '<div style="color:var(--muted)">Chemistry ' + state.chemistry + '% · Weekly salary ' + currentClub.salary + ' credits · Roster rating ' + currentClub.roster + '</div></div></div>'
      : '') +
    '<div class="three-col">' + cards + '</div>';
}

function renderLeaderboard() {
  const rows = leaderboardRows();
  const yourPosition = rows.findIndex(row => row.you) + 1;

  const tableRows = rows.map((row, index) =>
    '<tr class="' + (row.you ? 'you' : '') + '">' +
      '<td class="pos">' + (index + 1) + (index < 3 ? [' 🥇', ' 🥈', ' 🥉'][index] : '') + '</td>' +
      '<td>' + esc(row.name) + (row.you ? ' <span class="tag cyan">YOU</span>' : '') + '</td>' +
      '<td><div class="rank-cell"><span class="rank-chip" style="background:' + rankColor(row.mmr) + '"></span>' + esc(rankInfo(row.mmr).name) + '</div></td>' +
      '<td class="num">' + formatNum(row.mmr) + '</td>' +
    '</tr>'
  ).join('');

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">GLOBAL LEADERBOARD</h1>' +
    '<div class="page-sub">Simulated ladder around your current MMR.</div></div>' +
    '<div class="card-note">Your position: <strong style="color:var(--cyan);font-size:18px">#' + yourPosition + '</strong> of ' + rows.length + '</div></div>' +
    '<div class="card"><div class="table-wrap"><table><thead><tr>' +
      '<th>#</th><th>Player</th><th>Rank</th><th>MMR</th>' +
    '</tr></thead><tbody>' + tableRows + '</tbody></table></div></div>';
}

function renderAchievements() {
  const cards = ACHIEVEMENTS.map(achievement => {
    const unlocked = state.achievements.includes(achievement.id);
    return '<div class="ach-card' + (unlocked ? ' unlocked' : '') + '">' +
      '<div class="ach-icon">' + achievement.icon + '</div>' +
      '<div><div class="ach-name">' + esc(achievement.name) + '</div>' +
      '<div class="ach-desc">' + esc(achievement.desc) + '</div>' +
      '<div class="ach-status">' + (unlocked ? '✓ Unlocked' : 'Locked') + '</div></div>' +
    '</div>';
  }).join('');

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">ACHIEVEMENTS</h1>' +
    '<div class="page-sub">Milestones from your road to the pros.</div></div>' +
    '<div class="card-note"><strong style="color:var(--gold);font-size:18px">' + state.achievements.length + ' / ' + ACHIEVEMENTS.length + '</strong> unlocked</div></div>' +
    '<div class="three-col">' + cards + '</div>';
}

function renderSettings() {
  const roleOptions = Object.keys(ROLES).map(key =>
    '<option value="' + key + '"' + (state.role === key ? ' selected' : '') + '>' + esc(ROLES[key].name) + '</option>'
  ).join('');

  $('#app').innerHTML =
    '<div class="page-head"><div><h1 class="page-title">SETTINGS</h1>' +
    '<div class="page-sub">Manage your profile and save data.</div></div></div>' +
    '<div class="settings-grid">' +
      '<div class="card card-pad">' +
        '<div class="card-title" style="margin-bottom:16px">PLAYER PROFILE</div>' +
        '<div class="field"><label>Player name</label><input class="input" id="setName" maxlength="16" value="' + esc(state.name) + '" /></div>' +
        '<div class="field"><label>Play style</label><select class="select" id="setRole">' + roleOptions + '</select></div>' +
        '<button class="btn btn-primary" data-action="saveSettings">SAVE PROFILE</button>' +
      '</div>' +
      '<div class="card card-pad">' +
        '<div class="card-title" style="margin-bottom:16px">SAVE DATA</div>' +
        '<p class="card-desc">Progress is saved automatically in this browser. Export a backup so you can move it between devices.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
          '<button class="btn" data-action="export">EXPORT SAVE</button>' +
          '<button class="btn" data-action="import">IMPORT SAVE</button>' +
        '</div>' +
        '<div class="card-title" style="margin:22px 0 14px;color:var(--red)">DANGER ZONE</div>' +
        '<button class="btn btn-danger" data-action="reset">RESET CAREER</button>' +
      '</div>' +
    '</div>';
}

function render() {
  renderHeader();
  switch (currentTab) {
    case 'training': renderTraining(); break;
    case 'matches': renderMatches(); break;
    case 'clubs': renderClubs(); break;
    case 'leaderboard': renderLeaderboard(); break;
    case 'achievements': renderAchievements(); break;
    case 'settings': renderSettings(); break;
    default: renderDashboard(); break;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================== EVENTS ============================== */

function handleAction(action, element) {
  switch (action) {
    case 'settings': currentTab = 'settings'; render(); break;
    case 'closeModal': closeModal(); break;
    case 'train': train(element.dataset.id); break;
    case 'spend': spendPoint(element.dataset.key); break;
    case 'play': simulateMatch(element.dataset.id); break;
    case 'join': joinClub(element.dataset.team); break;
    case 'claim': claimContract(); break;
    case 'saveSettings': {
      const nameInput = $('#setName');
      const roleInput = $('#setRole');
      state.name = (nameInput && nameInput.value.trim().slice(0, 16)) || 'Rookie';
      state.role = (roleInput && roleInput.value) || 'allrounder';
      saveState();
      render();
      showToast('Profile updated.', 'success');
      break;
    }
    case 'export': {
      const json = JSON.stringify(state, null, 2);
      openModal({
        title: 'EXPORT SAVE',
        html: '<p class="card-desc">Copy this JSON and keep it somewhere safe.</p>' +
          '<textarea class="textarea" id="exportText" readonly>' + esc(json) + '</textarea>',
        buttons: [{
          label: 'COPY TO CLIPBOARD',
          class: 'btn-primary',
          onClick: () => {
            const text = $('#exportText');
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text.value)
                .then(() => showToast('Save copied to clipboard.', 'success'))
                .catch(() => { text.select(); showToast('Press Ctrl+C to copy.', 'info'); });
            } else {
              text.select();
              showToast('Press Ctrl+C to copy.', 'info');
            }
          }
        }]
      });
      break;
    }
    case 'import':
      openModal({
        title: 'IMPORT SAVE',
        html: '<p class="card-desc">Paste a previously exported save JSON below. This replaces your current progress.</p>' +
          '<textarea class="textarea" id="importText" placeholder="Paste save JSON here..."></textarea>',
        buttons: [{
          label: 'IMPORT SAVE',
          class: 'btn-primary',
          onClick: () => {
            try {
              const parsed = JSON.parse($('#importText').value);
              if (!parsed || typeof parsed !== 'object') throw new Error('Invalid');
              localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
              state = loadState();
              closeModal();
              currentTab = 'dashboard';
              render();
              showToast('Save imported successfully.', 'success');
            } catch (error) {
              showToast('Invalid save JSON.', 'warn');
            }
          }
        }]
      });
      break;
    case 'reset':
      openModal({
        title: 'RESET CAREER?',
        html: '<p class="card-desc">This permanently deletes your current career: rank, stats, club, achievements and contracts.</p>' +
          '<p class="card-note" style="margin-top:12px;color:var(--red)">This cannot be undone unless you exported a backup.</p>',
        buttons: [
          { label: 'CANCEL', onClick: closeModal },
          {
            label: 'YES, RESET',
            class: 'btn-danger',
            onClick: () => {
              localStorage.removeItem(SAVE_KEY);
              state = defaultState();
              closeModal();
              currentTab = 'dashboard';
              render();
              showOnboarding();
            }
          }
        ]
      });
      break;
    default: break;
  }
}

document.addEventListener('click', event => {
  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    currentTab = tabButton.dataset.tab;
    render();
    return;
  }

  const modalButton = event.target.closest('[data-modal-btn]');
  if (modalButton) {
    const button = modalButtons[Number(modalButton.dataset.modalBtn)];
    if (button && typeof button.onClick === 'function') button.onClick();
    return;
  }

  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    handleAction(actionElement.dataset.action, actionElement);
  }
});

$('#modalBackdrop').addEventListener('click', event => {
  if (event.target.id === 'modalBackdrop' && modalClosable) closeModal();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modalClosable && !$('#modalBackdrop').classList.contains('hidden')) closeModal();
});

/* ============================== BOOT ============================== */

render();

const hasSavedGame = (() => {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (error) {
    return false;
  }
})();

if (!hasSavedGame) showOnboarding();
