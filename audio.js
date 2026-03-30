// audio.js — lightweight synthesized SFX using Web Audio

let audioCtx = null;
let masterGain = null;
let enabled = true;

function now() {
  return audioCtx ? audioCtx.currentTime : 0;
}

function ensureAudio() {
  if (!enabled) return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.18;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

export async function unlockAudio() {
  const ctx = ensureAudio();
  if (ctx && ctx.state === 'suspended') await ctx.resume();
}

export function setAudioEnabled(on) {
  enabled = !!on;
  if (masterGain) masterGain.gain.value = enabled ? 0.18 : 0;
}

function makeGain(value, when) {
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(value, when);
  g.connect(masterGain);
  return g;
}

function withEnvelope(node, gainNode, start, attack, decay, sustain = 0.0001) {
  gainNode.gain.cancelScheduledValues(start);
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(gainNode.gain.value + attack * 12, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), start + attack + decay);
  node.start(start);
  node.stop(start + attack + decay + 0.02);
}

function tone(freq, type, volume, attack, decay, slideTo = null) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = now();
  const osc = ctx.createOscillator();
  const gain = makeGain(volume, start);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + attack + decay);
  osc.connect(gain);
  withEnvelope(osc, gain, start, attack, decay);
}

function noise(volume, attack, decay, filterFreq = 1200, filterType = 'lowpass') {
  const ctx = ensureAudio();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (attack + decay + 0.04)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, now());
  const gain = makeGain(volume, now());
  src.connect(filter);
  filter.connect(gain);
  withEnvelope(src, gain, now(), attack, decay);
}

function dualTone(f1, f2, type1, type2, volume, attack, decay, slide1 = null, slide2 = null) {
  tone(f1, type1, volume, attack, decay, slide1);
  tone(f2, type2, volume * 0.7, attack, decay, slide2);
}

export function playSfx(name) {
  const ctx = ensureAudio();
  if (!ctx || ctx.state === 'suspended' || !enabled) return;

  switch (name) {
    case 'fire_pistol':
      dualTone(360, 180, 'square', 'triangle', 0.035, 0.003, 0.08, 180, 90);
      noise(0.015, 0.001, 0.05, 2200);
      break;
    case 'fire_shotgun':
      noise(0.05, 0.001, 0.16, 900);
      tone(120, 'triangle', 0.03, 0.001, 0.12, 60);
      break;
    case 'fire_smg':
      dualTone(520, 240, 'square', 'sawtooth', 0.022, 0.001, 0.045, 260, 120);
      break;
    case 'fire_rocket':
      tone(90, 'sawtooth', 0.05, 0.002, 0.18, 40);
      noise(0.022, 0.001, 0.12, 700);
      break;
    case 'fire_plasma':
      dualTone(640, 960, 'sine', 'triangle', 0.03, 0.002, 0.09, 260, 520);
      break;
    case 'fire_bfg':
      dualTone(110, 220, 'sawtooth', 'triangle', 0.055, 0.005, 0.24, 50, 90);
      break;
    case 'fire_railgun':
      dualTone(1800, 600, 'sine', 'triangle', 0.04, 0.001, 0.15, 120, 80);
      break;
    case 'enemy_hit':
      tone(220, 'square', 0.022, 0.001, 0.06, 110);
      break;
    case 'enemy_kill':
      dualTone(180, 120, 'triangle', 'square', 0.03, 0.001, 0.16, 70, 55);
      break;
    case 'explosion':
      noise(0.065, 0.001, 0.28, 520);
      tone(70, 'triangle', 0.035, 0.002, 0.22, 32);
      break;
    case 'player_hit':
      tone(140, 'sawtooth', 0.04, 0.001, 0.12, 60);
      noise(0.018, 0.001, 0.08, 1000);
      break;
    case 'pickup':
      dualTone(660, 990, 'triangle', 'sine', 0.02, 0.002, 0.12, 880, 1320);
      break;
    case 'altar':
      dualTone(420, 630, 'sine', 'triangle', 0.025, 0.005, 0.28, 520, 840);
      break;
    case 'cache_open':
      dualTone(280, 420, 'square', 'triangle', 0.02, 0.002, 0.12, 520, 700);
      break;
    case 'reward':
      dualTone(520, 780, 'triangle', 'sine', 0.022, 0.002, 0.18, 880, 1170);
      break;
    case 'wave':
      dualTone(180, 270, 'triangle', 'triangle', 0.03, 0.004, 0.24, 280, 420);
      break;
    case 'boss':
      dualTone(120, 180, 'sawtooth', 'triangle', 0.05, 0.004, 0.4, 70, 90);
      break;
    case 'floor':
      dualTone(300, 450, 'triangle', 'sine', 0.025, 0.004, 0.22, 520, 780);
      break;
    case 'victory':
      dualTone(520, 780, 'triangle', 'sine', 0.03, 0.004, 0.45, 1040, 1560);
      setTimeout(() => { try { dualTone(660, 990, 'triangle', 'sine', 0.024, 0.004, 0.35, 1320, 1980); } catch {} }, 140);
      break;
    case 'game_over':
      dualTone(180, 110, 'sawtooth', 'triangle', 0.04, 0.003, 0.4, 80, 50);
      break;
  }
}
