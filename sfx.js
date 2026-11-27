// Procedural sound effects (Web Audio, no audio files): ball hits and bounces, boost, boost pickups, jumps and flips,
// goals, the kickoff countdown, replay whoosh and shot/save pings. Everything is synthesised from oscillators and
// filtered noise, so nothing has to be downloaded. Browsers only allow audio after a click or key press, so the
// context is created on the first one.

let ctx = null;
let master = null;
let noise = null;
let muted = false;
let volume = 0.5;
const lastPlayed = {};
const boostVoices = [];

try {
  muted = localStorage.getItem('rtpMuted') === '1';
  const v = parseFloat(localStorage.getItem('rtpVolume'));
  if (v >= 0 && v <= 1) volume = v;
} catch (e) { /* storage unavailable */ }

function ensure() {
  if (ctx) return true;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
  } catch (e) {
    return false;
  }
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 6;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  // One second of white noise, reused by every noise-based sound.
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

function ready() {
  return ctx && ctx.state === 'running' && !muted;
}

// Do not stack the same sound more often than every `gap` seconds.
function throttle(name, gap) {
  const now = ctx.currentTime;
  if (lastPlayed[name] !== undefined && now - lastPlayed[name] < gap) return false;
  lastPlayed[name] = now;
  return true;
}

function output(pan, gain) {
  const g = ctx.createGain();
  g.gain.value = gain;
  let tail = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    g.connect(p);
    tail = p;
  }
  tail.connect(master);
  return g;
}

function tone(type, from, to, duration, gain, dest, delay = 0) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.008, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function burst(type, freqFrom, freqTo, q, duration, gain, dest, delay = 0) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freqFrom, t);
  if (freqTo !== freqFrom) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, duration / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter);
  filter.connect(env);
  env.connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.05);
}

export const sfx = {
  /** Call from a click or key press so the browser lets the audio start. */
  unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  },

  get muted() { return muted; },

  setMuted(value) {
    muted = !!value;
    try { localStorage.setItem('rtpMuted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    if (muted) this.silenceBoost();
  },

  suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
  resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },

  /** A car touching the ball. speed is the relative speed in uu/s, gain/pan from where it happened. */
  hit(speed, pan = 0, near = 1) {
    if (!ready() || !throttle('hit', 0.05)) return;
    const power = Math.max(0.15, Math.min(1, speed / 2800));
    const out = output(pan, 0.6 * power * near);
    tone('sine', 190 + power * 60, 45, 0.16 + power * 0.1, 1, out);
    burst('bandpass', 1400 + power * 1800, 500, 1.2, 0.07, 0.8, out);
    if (power > 0.6) burst('highpass', 3500, 3500, 0.5, 0.04, 0.5, out);
  },

  /** Ball off a wall, the floor or the ceiling. */
  bounce(strength, pan = 0, near = 1) {
    if (!ready() || !throttle('bounce', 0.07)) return;
    const power = Math.max(0.1, Math.min(1, strength / 2200));
    const out = output(pan, 0.7 * power * near);
    tone('sine', 140, 60, 0.12, 1, out);
    burst('lowpass', 900, 300, 0.7, 0.06, 0.5, out);
  },

  /** Picking up a boost pad. */
  pickup(big, pan = 0, near = 1) {
    if (!ready() || !throttle('pickup', 0.12)) return;
    const out = output(pan, (big ? 0.16 : 0.09) * near);
    tone('sine', big ? 392 : 523, big ? 392 : 523, 0.18, 1, out);
    tone('sine', big ? 587 : 784, big ? 587 : 784, 0.22, 0.6, out, 0.06);
  },

  jump(pan = 0, near = 1) {
    if (!ready() || !throttle('jump', 0.12)) return;
    const out = output(pan, 0.35 * near);
    tone('sine', 220, 120, 0.09, 0.8, out);
    burst('bandpass', 600, 1400, 1.5, 0.12, 0.35, out);
  },

  flip(pan = 0, near = 1) {
    if (!ready() || !throttle('flip', 0.15)) return;
    const out = output(pan, 0.4 * near);
    burst('bandpass', 500, 2600, 2, 0.28, 0.6, out);
    tone('sawtooth', 300, 700, 0.18, 0.12, out);
  },

  /** Boost loop for car `index`. level 0..1 is how loud it should be; pan -1..1. */
  boost(index, level, pan = 0) {
    if (!ctx) return;
    let voice = boostVoices[index];
    if (!voice) {
      if (level <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 420;
      band.Q.value = 0.5;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const rumble = ctx.createOscillator();
      rumble.type = 'sine';
      rumble.frequency.value = 58 + index * 3;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.05;
      let tail = gain;
      let panner = null;
      if (ctx.createStereoPanner) { panner = ctx.createStereoPanner(); gain.connect(panner); tail = panner; }
      src.connect(band); band.connect(low); low.connect(gain);
      rumble.connect(rumbleGain); rumbleGain.connect(gain);
      tail.connect(master);
      src.start(0, Math.random() * 0.5);
      rumble.start();
      voice = { gain, panner };
      boostVoices[index] = voice;
    }
    const target = muted || ctx.state !== 'running' ? 0 : 0.06 * Math.max(0, Math.min(1, level));
    // Skip redundant updates: this is called every simulation step.
    const key = Math.round(target * 40) + ':' + Math.round(pan * 10);
    if (voice.key === key) return;
    voice.key = key;
    voice.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.04);
    if (voice.panner) voice.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.05);
  },

  silenceBoost() {
    if (!ctx) return;
    boostVoices.forEach(voice => { if (voice) { voice.key = ''; voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03); } });
  },

  /** Goal: a deep boom, a burst of noise and a rising horn chord. quiet is used for the replay's repeat. */
  goal(quiet = false) {
    if (!ready()) return;
    const level = quiet ? 0.5 : 1;
    const out = output(0, 0.3 * level);
    tone('sine', 90, 36, 0.9, 1, out);
    burst('lowpass', 1200, 150, 0.7, 0.7, 0.25, out);
    // A short rising major chord, soft sines.
    const chime = output(0, 0.13 * level);
    [392, 494, 587, 784].forEach((f, k) => tone('sine', f, f, 0.9, 0.7, chime, 0.1 + k * 0.09));
  },

  /** Kickoff countdown tick, and the longer one when play starts. */
  beep(go = false) {
    if (!ready()) return;
    const out = output(0, 0.35);
    tone('sine', go ? 1040 : 660, go ? 1040 : 660, go ? 0.38 : 0.14, 1, out);
    if (go) tone('sine', 1560, 1560, 0.3, 0.4, out);
  },

  /** Replay start/end swoosh. */
  whoosh() {
    if (!ready()) return;
    const out = output(0, 0.5);
    burst('bandpass', 300, 3200, 1.2, 0.6, 0.9, out);
    tone('sine', 180, 520, 0.5, 0.25, out);
  },

  /** Ping for the Shot / Save notices. */
  notice(kind) {
    if (!ready() || !throttle('notice', 0.2)) return;
    const out = output(0, 0.35);
    if (kind === 'save') {
      tone('square', 330, 330, 0.09, 0.5, out);
      tone('square', 495, 495, 0.14, 0.5, out, 0.09);
    } else {
      tone('triangle', 740, 740, 0.1, 0.8, out);
      tone('triangle', 988, 988, 0.16, 0.8, out, 0.09);
    }
  }
};
