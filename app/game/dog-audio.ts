import * as audio from './audio.ts';

/**
 * The companion dog's voice (design.md §6b): barks, a growl, whimpers, a yelp and panting, synthesized like
 * audio.ts (no assets) and placed around the listener: stereo pan from the bearing, gain 1 / (1 + d / 8) and a
 * low-pass that closes from 12 kHz at 0 m to 900 Hz at 60 m. Built on audio.ts' shared output (`audioBus()`);
 * every call is a silent no-op until the audio is unlocked, in node and when audio.ts has no bus.
 */
type Bus = { context: AudioContext; noise: AudioBuffer };
// audioBus() is the shared-output hook added to audio.ts for the synth modules (design.md §5.3); read through the
// namespace so this module also loads (silently) against an audio.ts without it.
const bus = (): Bus | null => (audio as unknown as { audioBus?: () => Bus | null }).audioBus?.() ?? null;

let lx = 0, lz = 0, lyaw = 0;
/** Where the ears are: the camera's focus and the heading it looks along (forward = (sin yaw, cos yaw)). */
export function setListener(x: number, z: number, yaw: number) { lx = x; lz = z; lyaw = yaw; }

const AUDIBLE = 70;
/** A gain → low-pass → pan chain at (x, z) feeding the speakers, or null when silent or out of earshot. */
function place(b: Bus, x: number, z: number, volume: number, length: number) {
  const dx = x - lx, dz = z - lz, d = Math.hypot(dx, dz);
  if (d > AUDIBLE) return null;
  const c = b.context;
  const gain = c.createGain();
  gain.gain.value = volume / (1 + d / 8);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 12000 * Math.pow(900 / 12000, Math.min(d, 60) / 60);
  gain.connect(filter);
  let tail: AudioNode = filter;
  if (typeof c.createStereoPanner === 'function') {
    const pan = c.createStereoPanner();
    // Right of the view is -x when looking along +z: (-cos yaw, sin yaw).
    pan.pan.value = d < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * -Math.cos(lyaw) + dz * Math.sin(lyaw)) / d)) * 0.85;
    filter.connect(pan);
    tail = pan;
  }
  tail.connect(c.destination);
  // Disconnect the chain once the sound is over so nodes do not pile up.
  setTimeout(() => { try { gain.disconnect(); filter.disconnect(); tail.disconnect(); } catch { /* already gone */ } }, (length + 0.3) * 1000);
  return gain;
}

/** One voiced yap: a falling sawtooth through a nasal formant, with a breath of noise for the rasp. */
function yap(b: Bus, out: GainNode, at: number, from: number, to: number, length: number, level: number, rasp: number) {
  const c = b.context;
  const osc = c.createOscillator(), osc2 = c.createOscillator();
  osc.type = 'sawtooth'; osc2.type = 'square';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  osc2.frequency.setValueAtTime(from * 1.5, at);
  osc2.frequency.exponentialRampToValueAtTime(to * 1.5, at + length);
  const formant = c.createBiquadFilter();
  formant.type = 'bandpass'; formant.frequency.value = 1100; formant.Q.value = 1.3;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0008, at + length + 0.03);
  const mix2 = c.createGain();
  mix2.gain.value = 0.35;
  osc.connect(formant); osc2.connect(mix2).connect(formant);
  formant.connect(env).connect(out);
  osc.start(at); osc2.start(at); osc.stop(at + length + 0.05); osc2.stop(at + length + 0.05);
  if (rasp > 0) {
    const n = c.createBufferSource();
    n.buffer = b.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(level * rasp, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + length * 0.7);
    n.connect(f).connect(g).connect(out);
    n.start(at, Math.random() * 0.3); n.stop(at + length);
  }
}

/** "Gâu gâu!": an alert double bark, a happy yip, or a low growl (a threat it will not go near). */
export function bark(x: number, z: number, kind: 'alert' | 'happy' | 'growl' = 'alert') {
  const b = bus();
  if (!b) return;
  const now = b.context.currentTime;
  if (kind === 'growl') { growl(b, x, z, now); return; }
  const out = place(b, x, z, 0.5, 0.5);
  if (!out) return;
  const pitch = 0.92 + Math.random() * 0.16;
  if (kind === 'happy') {
    yap(b, out, now, 680 * pitch, 470 * pitch, 0.08, 0.5, 0.25);
    yap(b, out, now + 0.13, 720 * pitch, 520 * pitch, 0.07, 0.4, 0.2);
  } else {
    yap(b, out, now, 470 * pitch, 290 * pitch, 0.12, 0.7, 0.45);
    yap(b, out, now + 0.21, 450 * pitch, 280 * pitch, 0.13, 0.65, 0.45);
  }
}

function growl(b: Bus, x: number, z: number, now: number) {
  const length = 0.95;
  const out = place(b, x, z, 0.55, length);
  if (!out) return;
  const c = b.context;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(92, now);
  osc.frequency.linearRampToValueAtTime(110, now + length * 0.6);
  osc.frequency.linearRampToValueAtTime(96, now + length);
  // The rattle: amplitude modulation at ~27 Hz.
  const am = c.createGain();
  am.gain.value = 0.5;
  const lfo = c.createOscillator(), depth = c.createGain();
  lfo.frequency.value = 27; depth.gain.value = 0.45;
  lfo.connect(depth).connect(am.gain);
  const low = c.createBiquadFilter();
  low.type = 'lowpass'; low.frequency.value = 650;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.6, now + 0.08);
  env.gain.setValueAtTime(0.6, now + length - 0.2);
  env.gain.exponentialRampToValueAtTime(0.0008, now + length);
  osc.connect(am).connect(low).connect(env).connect(out);
  const n = c.createBufferSource();
  n.buffer = b.noise; n.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = 'lowpass'; nf.frequency.value = 480;
  const ng = c.createGain();
  ng.gain.value = 0.5;
  n.connect(nf).connect(ng).connect(am);
  osc.start(now); lfo.start(now); n.start(now);
  osc.stop(now + length); lfo.stop(now + length); n.stop(now + length);
}

/** A thin, wavering whine (hurt, down, its owner out of reach in the water, the ground starting to shake). */
export function whimper(x: number, z: number) {
  const b = bus();
  if (!b) return;
  const c = b.context, now = c.currentTime;
  const out = place(b, x, z, 0.32, 1.1);
  if (!out) return;
  for (const [at, f0, f1, f2] of [[0, 900, 1320, 820], [0.55, 860, 1180, 760]] as const) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now + at);
    osc.frequency.linearRampToValueAtTime(f1, now + at + 0.22);
    osc.frequency.linearRampToValueAtTime(f2, now + at + 0.45);
    const vib = c.createOscillator(), depth = c.createGain();
    vib.frequency.value = 7; depth.gain.value = 22;
    vib.connect(depth).connect(osc.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, now + at);
    env.gain.exponentialRampToValueAtTime(0.25, now + at + 0.06);
    env.gain.exponentialRampToValueAtTime(0.0008, now + at + 0.46);
    osc.connect(env).connect(out);
    osc.start(now + at); vib.start(now + at); osc.stop(now + at + 0.5); vib.stop(now + at + 0.5);
  }
}

/** A sharp cry of pain when it is hit. */
export function yelp(x: number, z: number) {
  const b = bus();
  if (!b) return;
  const now = b.context.currentTime;
  const out = place(b, x, z, 0.5, 0.3);
  if (!out) return;
  yap(b, out, now, 1350, 640, 0.15, 0.6, 0.2);
}

let panting: { source: AudioBufferSourceNode; lfo: OscillatorNode; gain: GainNode } | null = null;
/** Panting after a run (0..1, the own dog only, so not positional); 0 fades it out. */
export function pant(level: number) {
  const b = bus();
  if (!b) return;
  const c = b.context;
  if (!panting && level > 0.02) {
    const source = c.createBufferSource();
    source.buffer = b.noise; source.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    // Breaths in and out at ~3.4 Hz.
    const breath = c.createGain();
    breath.gain.value = 0.5;
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 3.4; depth.gain.value = 0.5;
    lfo.connect(depth).connect(breath.gain);
    const gain = c.createGain();
    gain.gain.value = 0;
    source.connect(f).connect(breath).connect(gain).connect(c.destination);
    source.start(); lfo.start();
    panting = { source, lfo, gain };
  }
  if (panting) panting.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.035, c.currentTime, 0.4);
}

/** Stops the panting loop (the dog is gone or zombie mode ended). */
export function silence() {
  if (!panting) return;
  try { panting.source.stop(); panting.lfo.stop(); panting.gain.disconnect(); } catch { /* already stopped */ }
  panting = null;
}
