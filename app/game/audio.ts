import type { WeaponId } from './weapons';

/** Tiny synthesized sound effects, so the game ships no audio assets. */
let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export function unlockAudio() {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

function burst(duration: number, cutoff: number, volume: number, thump: number) {
  if (!context || !noise || context.state !== 'running') return;
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noise;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.15), now + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
  source.stop(now + duration);
  if (thump > 0) {
    const osc = context.createOscillator();
    const body = context.createGain();
    osc.frequency.setValueAtTime(thump, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + duration * 0.8);
    body.gain.setValueAtTime(volume * 0.9, now);
    body.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);
    osc.connect(body).connect(context.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
}

export function playShot(id: WeaponId) {
  if (id === 'pistol') burst(0.2, 2600, 0.45, 150);
  else if (id === 'shotgun') burst(0.45, 1500, 0.7, 90);
  else if (id === 'smg') burst(0.12, 3200, 0.28, 170);
  else if (id === 'grenade') burst(0.3, 700, 0.5, 95);
  else if (id === 'rpg') burst(0.7, 1800, 0.55, 60);
}

export function playThud() {
  burst(0.16, 500, 0.5, 70);
}

/** A crash: a crunch of noise, metal ringing at a few clashing pitches and, when hard, glass tinkling after. */
export function playCrash(strength: number) {
  if (!context || !noise || context.state !== 'running') return;
  const s = Math.max(0.15, Math.min(1, strength));
  burst(0.25 + s * 0.35, 1800 + s * 2200, 0.35 + s * 0.45, 60 + s * 30);
  const now = context.currentTime;
  for (const f of [310, 517, 739]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * (0.9 + Math.random() * 0.2), now);
    gain.gain.setValueAtTime(0.06 * s, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + s * 0.3);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.7);
  }
  if (s > 0.55) {
    // Glass: a few short bright clicks just after the hit.
    for (let k = 0; k < 4; k++) {
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 5000;
      const gain = context.createGain();
      const t = now + 0.08 + k * 0.05 + Math.random() * 0.04;
      gain.gain.setValueAtTime(0.12 * s, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start(t, Math.random() * 0.3);
      source.stop(t + 0.06);
    }
  }
}

/** A car horn: two slightly detuned tones (a long one, or two short toots). */
export function playHorn(long = false) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const toots: [number, number][] = long ? [[0, 0.7]] : [[0, 0.16], [0.22, 0.2]];
  for (const [start, length] of toots) {
    for (const f of [415, 494]) {
      const osc = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.05, now + start + 0.02);
      gain.gain.setValueAtTime(0.05, now + start + length - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(filter).connect(gain).connect(context.destination);
      osc.start(now + start);
      osc.stop(now + start + length + 0.02);
    }
  }
}

export function playBoom() {
  burst(1.1, 900, 0.95, 55);
}

let rainSource: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
/** A looping filtered-noise hiss whose volume follows the rain (0..1). */
export function setRain(level: number) {
  if (!context || !noise || context.state !== 'running') return;
  if (!rainSource && level > 0.02) {
    rainSource = context.createBufferSource();
    rainSource.buffer = noise;
    rainSource.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.4;
    rainGain = context.createGain();
    rainGain.gain.value = 0;
    rainSource.connect(filter).connect(rainGain).connect(context.destination);
    rainSource.start();
  }
  if (rainGain) rainGain.gain.setTargetAtTime(level * 0.12, context.currentTime, 0.5);
}
