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
}

export function playThud() {
  burst(0.16, 500, 0.5, 70);
}
