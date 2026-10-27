import * as THREE from 'three';
import { audioBus } from './audio.ts';
import type { AttackId, MutantKind, ZombieKind } from '../../lib/zombie-protocol.ts';

/**
 * Zombie mode's sounds, synthesized like audio.ts (no assets) on its shared output (audioBus()): every kind's voice
 * (moans, panting, bellows, chittering, gurgles, hisses, a dead police radio, a delivery app's two-tone, sobbing,
 * echolocation clicks, breathing), every attack's tell, the mutants' roars, footsteps and tremor, the screamer's
 * shriek, bursts and pops, and the player's own heartbeat and breath, a low dread drone and distant screams.
 * Positional: panned by the bearing from the listener (who looks along (sin yaw, cos yaw); yawOf() reads it off a
 * camera), gain 1 / (1 + d / 8), a low-pass from 12 kHz at 0 m to 900 Hz at 60 m, muffled out of sight. At most 12
 * zombie voices at once, ranked by threat over distance; tells always get a voice. Everything is a no-op until
 * audio is unlocked.
 */
export type HorrorAudio = ReturnType<typeof createHorrorAudio>;
type Cue = 'idle' | 'alert' | 'tell' | 'attack' | 'hurt' | 'die' | 'step';
type Kind = ZombieKind | MutantKind;
const MAX_VOICES = 12;
const BIG: Record<Kind, number> = {
  walker: 1, runner: 1.2, brute: 1.6, crawler: 0.8, spitter: 1.2, bloater: 1.4, riot: 1.1, shipper: 1, screamer: 1.5, hunter: 1.5, stalker: 2,
  colossus: 4, leaper: 3, matriarch: 3.5,
};

/** The listener's yaw from a camera (it looks along (sin yaw, cos yaw)). */
const look = new THREE.Vector3();
export function yawOf(camera: THREE.Camera) {
  camera.getWorldDirection(look);
  return Math.atan2(look.x, look.z);
}

export function createHorrorAudio() {
  let lx = 0, lz = 0, lyaw = 0;
  let master: GainNode | null = null, bed: GainNode | null = null;
  let shaper: WaveShaperNode | null = null;
  const voices: { end: number; tell: boolean }[] = [];
  // Loops made on first use.
  let tremorGain: GainNode | null = null, ambienceGain: GainNode | null = null, breathGain: GainNode | null = null, bossGain: GainNode | null = null;
  const loops: AudioScheduledSourceNode[] = [];
  let duckUntil = 0, nextBeat = 0, lastScream = -99;

  function bus() {
    const b = audioBus();
    if (!b) return null;
    if (!master || master.context !== b.context) {
      master = b.context.createGain();
      master.gain.value = 0.9;
      master.connect(b.context.destination);
      // The drone and tremor bed ducks on its own (silence before a roar).
      bed = b.context.createGain();
      bed.connect(master);
      shaper = b.context.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 2.6); }
      shaper.curve = curve;
      shaper.connect(master);
      tremorGain = ambienceGain = breathGain = bossGain = null;
      loops.length = 0;
    }
    return { ...b, master: master!, bed: bed!, shaper: shaper! };
  }

  /** A positional chain at (x, z): returns the node to connect sources to (or null when silent or unavailable). */
  function place(x: number, z: number, loud: number, muffled = false, distort = false) {
    const b = bus();
    if (!b) return null;
    const ctx = b.context;
    const dx = x - lx, dz = z - lz, d = Math.hypot(dx, dz);
    const gain = loud / (1 + d / 8) * (muffled ? 0.5 : 1);
    if (gain < 0.004) return null;
    // The listener's right is (-cos yaw, sin yaw).
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * -Math.cos(lyaw) + dz * Math.sin(lyaw)) / d)) : 0;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muffled ? 800 : Math.max(900, 12000 * Math.pow(900 / 12000, Math.min(1, d / 60)));
    const p = ctx.createStereoPanner();
    p.pan.value = pan * 0.85;
    g.connect(lp).connect(p).connect(distort ? b.shaper : b.master);
    return { ctx, node: g as AudioNode, now: ctx.currentTime, noise: b.noise };
  }
  type Out = NonNullable<ReturnType<typeof place>>;
  const env = (o: Out, g: GainNode, at: number, attack: number, peak: number, hold: number, release: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    return at + attack + hold + release;
  };
  /** An oscillator through an envelope, with a pitch glide and optional vibrato and band-pass. */
  function tone(o: Out, type: OscillatorType, f0: number, f1: number, start: number, attack: number, peak: number, hold: number, release: number, opts: { vib?: [number, number]; band?: [number, number]; am?: [number, number] } = {}) {
    const osc = o.ctx.createOscillator(), g = o.ctx.createGain();
    osc.type = type;
    const at = o.now + start, end = at + attack + hold + release;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), end);
    let head: AudioNode = osc;
    if (opts.vib) { const l = o.ctx.createOscillator(), lg = o.ctx.createGain(); l.frequency.value = opts.vib[0]; lg.gain.value = opts.vib[1]; l.connect(lg).connect(osc.frequency); l.start(at); l.stop(end + 0.05); }
    if (opts.band) { const bp = o.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = opts.band[0]; bp.Q.value = opts.band[1]; head.connect(bp); head = bp; }
    if (opts.am) {
      const l = o.ctx.createOscillator(), lg = o.ctx.createGain(), am = o.ctx.createGain();
      l.frequency.value = opts.am[0]; lg.gain.value = opts.am[1]; am.gain.value = 1 - opts.am[1];
      l.connect(lg).connect(am.gain); head.connect(am); head = am; l.start(at); l.stop(end + 0.05);
    }
    head.connect(g).connect(o.node);
    env(o, g, at, attack, peak, hold, release);
    osc.start(at);
    osc.stop(end + 0.05);
    return end;
  }
  /** Filtered noise through an envelope (type 'lowpass' | 'bandpass' | 'highpass'), with optional amplitude flutter. */
  function hiss(o: Out, type: BiquadFilterType, f0: number, f1: number, q: number, start: number, attack: number, peak: number, hold: number, release: number, am?: [number, number]) {
    const src = o.ctx.createBufferSource(), f = o.ctx.createBiquadFilter(), g = o.ctx.createGain();
    src.buffer = o.noise;
    src.loop = true;
    const at = o.now + start, end = at + attack + hold + release;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), end);
    let head: AudioNode = f;
    src.connect(f);
    if (am) {
      const l = o.ctx.createOscillator(), lg = o.ctx.createGain(), a = o.ctx.createGain();
      l.frequency.value = am[0]; lg.gain.value = am[1]; a.gain.value = 1 - am[1];
      l.connect(lg).connect(a.gain); f.connect(a); head = a; l.start(at); l.stop(end + 0.05);
    }
    head.connect(g).connect(o.node);
    env(o, g, at, attack, peak, hold, release);
    src.start(at, Math.random() * 0.4);
    src.stop(end + 0.05);
    return end;
  }
  const thump = (o: Out, f: number, start: number, peak: number, len: number) => tone(o, 'sine', f, f * 0.55, start, 0.005, peak, 0.02, len);
  const clicks = (o: Out, n: number, gap: number, start = 0, peak = 0.25, f = 3800) => { for (let k = 0; k < n; k++) hiss(o, 'highpass', f, f, 0.7, start + k * gap * (1 - k * 0.04), 0.002, peak, 0.004, 0.02); };

  /** Voice budget: tells always play; others only while fewer than 12 sound (ranked by loudness over distance). */
  function claim(x: number, z: number, kind: Kind, tell: boolean, length: number) {
    const b = audioBus();
    if (!b) return false;
    const t = b.context.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < t) voices.splice(i, 1);
    if (!tell && voices.length >= MAX_VOICES) {
      const rank = BIG[kind] / (1 + Math.hypot(x - lx, z - lz));
      if (rank < 0.12) return false;
      const drop = voices.findIndex((v) => !v.tell);
      if (drop < 0) return false;
      voices.splice(drop, 1);
    }
    voices.push({ end: t + length, tell });
    return true;
  }

  const audio = {
    setListener(x: number, z: number, yaw: number) { lx = x; lz = z; lyaw = yaw; },
    /** A kind's voice for a cue; `intensity` scales loudness; `muffled` when there is no line of sight. */
    voice(kind: Kind, cue: Cue, x: number, z: number, intensity = 1, muffled = false) {
      if (cue === 'step') { if (kind === 'colossus' || kind === 'matriarch' || kind === 'brute' || kind === 'leaper') { const o = place(x, z, 0.5 * intensity * (kind === 'brute' ? 0.4 : kind === 'leaper' ? 0.3 : 1), muffled); if (o) { thump(o, kind === 'colossus' ? 55 : kind === 'matriarch' ? 48 : 80, 0, 0.9, 0.35); if (kind === 'colossus') hiss(o, 'lowpass', 220, 120, 0.7, 0.01, 0.01, 0.3, 0.05, 0.4); } } return; }
      if (!claim(x, z, kind, cue === 'tell', 1.4)) return;
      const big = BIG[kind];
      const o = place(x, z, (cue === 'idle' ? 0.32 : 0.55) * intensity * Math.min(1.6, 0.7 + big * 0.2), muffled, kind === 'brute' || kind === 'colossus');
      if (!o) return;
      const r = Math.random();
      if (cue === 'hurt') { tone(o, 'sawtooth', 160 / big, 90 / big, 0, 0.01, 0.25, 0.05, 0.25, { band: [700 / Math.sqrt(big), 1.5] }); return; }
      if (cue === 'die') { tone(o, 'sawtooth', 140 / big, 55 / big, 0, 0.05, 0.3, 0.3, 0.9, { band: [500, 1.2], vib: [5, 6] }); hiss(o, 'lowpass', 900, 200, 0.7, 0.2, 0.1, 0.12, 0.3, 0.6); return; }
      if (cue === 'attack') { hiss(o, 'bandpass', 1400, 400, 1, 0, 0.02, 0.35, 0.05, 0.15); if (big > 1.3) thump(o, 70, 0.08, 0.6, 0.3); return; }
      switch (kind) {
        case 'walker':
          tone(o, 'sawtooth', 105 + r * 30, 80 + r * 20, 0, 0.25, 0.22, 0.5 + r * 0.5, 0.6, { band: [520 + r * 200, 2.2], vib: [4.5, 5] });
          if (r < 0.4) hiss(o, 'bandpass', 380, 250, 3, 0.4, 0.05, 0.12, 0.3, 0.3, [7, 0.7]);
          break;
        case 'runner':
          if (cue === 'alert') tone(o, 'sawtooth', 600, 1500, 0, 0.03, 0.3, 0.25, 0.2, { band: [1600, 1.2] });
          else for (let k = 0; k < 4; k++) hiss(o, 'bandpass', 1300, 900, 1.5, k * 0.28, 0.04, 0.2, 0.06, 0.12);
          break;
        case 'brute':
          tone(o, 'sawtooth', 62, 48, 0, 0.12, 0.45, 0.6, 0.5, { band: [300, 1.2], vib: [3, 3] });
          break;
        case 'crawler': clicks(o, 6 + Math.floor(r * 6), 0.045, 0, 0.2, 3000); hiss(o, 'highpass', 5000, 3000, 1, 0, 0.02, 0.06, 0.25, 0.1); break;
        case 'spitter': hiss(o, 'bandpass', 420, 300, 4, 0, 0.1, 0.3, 0.6, 0.3, [8, 0.8]); break;
        case 'bloater': hiss(o, 'bandpass', 200, 320, 3, 0, 0.2, 0.25, 0.5, 0.4, [3, 0.6]); hiss(o, 'highpass', 3000, 6000, 0.7, 0.3, 0.3, 0.06, 0.3, 0.2); break;
        case 'riot':
          tone(o, 'sawtooth', 95, 80, 0, 0.2, 0.18, 0.4, 0.4, { band: [380, 3] });
          // The dead police radio still crackling on the vest.
          for (let k = 0; k < 3; k++) hiss(o, 'bandpass', 1800, 1700, 2, 0.15 + k * 0.17 + r * 0.05, 0.005, 0.12, 0.06 + r * 0.05, 0.02);
          break;
        case 'shipper':
          // A delivery app's two-tone, detuned and slowed.
          tone(o, 'sine', 1240 + r * 30, 1180, 0, 0.01, 0.14, 0.09, 0.15);
          tone(o, 'sine', 1640 + r * 30, 1560, 0.18, 0.01, 0.12, 0.09, 0.25);
          if (cue !== 'alert') tone(o, 'sawtooth', 120, 95, 0.45, 0.2, 0.15, 0.3, 0.4, { band: [500, 2] });
          break;
        case 'screamer': tone(o, 'triangle', 310 + r * 40, 260, 0, 0.2, 0.18, 0.5, 0.5, { am: [6, 0.6], vib: [5, 9] }); break;
        case 'hunter': clicks(o, cue === 'alert' ? 14 : 7, cue === 'alert' ? 0.03 : 0.07, 0, 0.3, 4200); if (cue === 'alert') tone(o, 'sawtooth', 900, 1800, 0.35, 0.02, 0.3, 0.3, 0.1, { band: [2000, 1] }); break;
        case 'stalker': hiss(o, 'lowpass', 500, 300, 0.7, 0, 0.8, 0.18, 0.4, 1.0); tone(o, 'sine', 70, 64, 0.2, 0.6, 0.08, 0.4, 0.8); break;
        case 'colossus': tone(o, 'sawtooth', 58, 44, 0, 0.15, 0.55, 0.5, 0.6, { band: [240, 1] }); break;
        case 'leaper': hiss(o, 'bandpass', 2600, 2200, 2, 0, 0.05, 0.3, 0.6, 0.2, [18, 0.9]); break;
        case 'matriarch': hiss(o, 'bandpass', 300, 220, 3, 0, 0.2, 0.35, 0.8, 0.5, [6, 0.8]); tone(o, 'sawtooth', 70, 60, 0, 0.3, 0.2, 0.8, 0.5, { band: [260, 2] }); break;
      }
    },
    /** An attack's tell at (x, z) (always voiced): inhales, hisses, rising shrieks, rumbles. */
    tell(a: AttackId, x: number, z: number) {
      const big = a === 'swipe' || a === 'slam' || a === 'charge' || a === 'throw' || a === 'roar' || a === 'brood' || a === 'exhale' || a === 'deathburst' || a === 'bile' || a === 'pounce' || a === 'slash';
      if (!claim(x, z, big ? 'colossus' : 'walker', true, 1.5)) return;
      const o = place(x, z, big ? 0.9 : 0.6);
      if (!o) return;
      switch (a) {
        case 'claw': case 'bash': case 'grab': hiss(o, 'bandpass', 700, 1500, 2, 0, 0.12, 0.25, 0.1, 0.12); break;
        case 'lunge': case 'bite': tone(o, 'sawtooth', 300, 700, 0, 0.05, 0.3, 0.2, 0.1, { band: [1200, 1.5] }); break;
        case 'spit': case 'bile': hiss(o, 'bandpass', 250, 500, 4, 0, 0.3, 0.45, 0.2, 0.2, [9, 0.8]); break;
        case 'burst': case 'deathburst': hiss(o, 'highpass', 1500, 7000, 0.8, 0, a === 'burst' ? 0.95 : 1.4, 0.35, 0.05, 0.1); tone(o, 'sine', 80, 160, 0, 0.9, 0.2, 0.1, 0.2); break;
        case 'scream': audio.scream(x, z); break;
        case 'swipe': case 'slash': hiss(o, 'bandpass', 500, 1600, 1.5, 0, 0.35, 0.35, 0.1, 0.1); tone(o, 'sawtooth', 70, 55, 0, 0.2, 0.4, 0.3, 0.2, { band: [260, 1] }); break;
        case 'slam': case 'charge': tone(o, 'sawtooth', 50, 36, 0, 0.3, 0.6, 0.4, 0.3, { band: [180, 1] }); hiss(o, 'lowpass', 300, 120, 0.7, 0, 0.5, 0.35, 0.3, 0.3); break;
        case 'throw': tone(o, 'sawtooth', 60, 80, 0, 0.3, 0.45, 0.3, 0.2, { band: [240, 1] }); hiss(o, 'bandpass', 900, 300, 1, 0.2, 0.2, 0.2, 0.2, 0.2); break;
        case 'roar': audio.roar(x, z, true); break;
        case 'pounce': hiss(o, 'bandpass', 2600, 2000, 2, 0, 0.1, 0.4, 0.5, 0.15, [18, 0.9]); break;
        case 'brood': hiss(o, 'bandpass', 220, 140, 2, 0, 0.3, 0.45, 0.6, 0.3, [11, 0.9]); break;
        case 'exhale': hiss(o, 'bandpass', 700, 1800, 1.2, 0, 0.6, 0.35, 0.3, 0.2); break;
      }
    },
    /** A mutant's roar (big) or a brute's bellow: layered low saws, band-passed noise, soft clipping. */
    roar(x: number, z: number, big: boolean) {
      const o = place(x, z, big ? 1.4 : 0.8, false, true);
      if (!o) return;
      const len = big ? 1.6 : 0.9;
      for (const [f0, f1] of [[80, 45], [62, 40], [96, 58]] as const) tone(o, 'sawtooth', f0 * (big ? 1 : 1.6), f1 * (big ? 1 : 1.6), 0, 0.12, 0.35, len * 0.6, len * 0.35, { vib: [7, 4] });
      hiss(o, 'bandpass', 700, 260, 0.9, 0, 0.1, 0.4, len * 0.6, len * 0.35);
      if (big) audio.duck(0);
    },
    /** The screamer's shriek (rising over 1.1 s, the tell of its summon). */
    scream(x: number, z: number) {
      const o = place(x, z, 1.1, false, true);
      if (!o) return;
      tone(o, 'sawtooth', 620, 1500, 0, 0.9, 0.35, 0.25, 0.35, { vib: [9, 40], band: [1400, 1.1] });
      tone(o, 'sine', 900, 2100, 0, 0.9, 0.2, 0.25, 0.35, { vib: [11, 60] });
      hiss(o, 'bandpass', 2000, 3500, 1.5, 0.3, 0.6, 0.2, 0.25, 0.3);
    },
    /** A blind hunter's echolocation click train. */
    click(x: number, z: number) { const o = place(x, z, 0.5); if (o) clicks(o, 6, 0.05, 0, 0.3, 4400); },
    /** Something heavy landing (a roof drop): thud and grit. */
    drop(x: number, z: number) { const o = place(x, z, 1); if (o) { thump(o, 70, 0, 0.9, 0.4); hiss(o, 'lowpass', 1400, 300, 0.7, 0.02, 0.01, 0.4, 0.1, 0.6); } },
    /** A bloater bursting: a wet pop and a gas hiss. */
    burst(x: number, z: number) { const o = place(x, z, 1.1); if (o) { thump(o, 110, 0, 0.8, 0.25); hiss(o, 'bandpass', 900, 400, 1, 0, 0.005, 0.5, 0.05, 0.3); hiss(o, 'highpass', 3000, 1800, 0.7, 0.1, 0.05, 0.2, 0.8, 0.8); } },
    /** A weak spot or sac popping. */
    pop(x: number, z: number) { const o = place(x, z, 0.9); if (o) { thump(o, 140, 0, 0.6, 0.18); hiss(o, 'bandpass', 1200, 500, 1.2, 0.02, 0.005, 0.35, 0.05, 0.25); } },
    /** The ground's tremor before and around a mutant (0..1): a 32 Hz sine and brown rumble. */
    tremor(level: number) {
      const b = bus();
      if (!b) return;
      if (!tremorGain) {
        tremorGain = b.context.createGain(); tremorGain.gain.value = 0; tremorGain.connect(b.bed);
        const osc = b.context.createOscillator(); osc.frequency.value = 32; osc.connect(tremorGain); osc.start();
        const src = b.context.createBufferSource(); src.buffer = b.noise; src.loop = true;
        const lp = b.context.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
        const ng = b.context.createGain(); ng.gain.value = 2.5;
        src.connect(lp).connect(ng).connect(tremorGain); src.start();
        loops.push(osc, src);
      }
      tremorGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.35, b.context.currentTime, 0.25);
    },
    /** The player's heartbeat (lub-dub at `bpm`), silent at volume 0. Call every frame. */
    heartbeat(bpm: number, volume: number) {
      const b = bus();
      if (!b || volume < 0.01) { nextBeat = 0; return; }
      const t = b.context.currentTime;
      if (nextBeat < t) nextBeat = t + 0.05;
      if (nextBeat > t + 0.15) return;
      const o = { ctx: b.context, node: b.master as AudioNode, now: nextBeat - 0, noise: b.noise };
      const v = Math.min(1, volume) * 0.6;
      thump({ ...o, now: nextBeat }, 52, 0, v, 0.16);
      thump({ ...o, now: nextBeat }, 46, 0.17, v * 0.7, 0.2);
      nextBeat += 60 / Math.max(40, Math.min(180, bpm));
    },
    /** Heavy breathing (0..1): a filtered-noise loop swelling in and out. */
    breath(level: number) {
      const b = bus();
      if (!b) return;
      if (!breathGain) {
        breathGain = b.context.createGain(); breathGain.gain.value = 0; breathGain.connect(b.master);
        const src = b.context.createBufferSource(); src.buffer = b.noise; src.loop = true;
        const bp = b.context.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.9;
        const swell = b.context.createGain(); swell.gain.value = 0.5;
        const lfo = b.context.createOscillator(); lfo.frequency.value = 0.42; const lg = b.context.createGain(); lg.gain.value = 0.5;
        lfo.connect(lg).connect(swell.gain);
        src.connect(bp).connect(swell).connect(breathGain);
        src.start(); lfo.start();
        loops.push(src, lfo);
      }
      breathGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.08, b.context.currentTime, 0.4);
    },
    /** A scream far away, from `bearing` (radians relative to where the listener looks; + to the right). */
    distantScream(bearing: number) {
      const b = bus();
      if (!b || b.context.currentTime - lastScream < 3) return;
      lastScream = b.context.currentTime;
      // Placed 70 m out along the bearing, so it pans and low-passes like any far sound.
      const a = lyaw - bearing;
      const o = place(lx + Math.sin(a) * 70, lz + Math.cos(a) * 70, 3);
      if (!o) return;
      // The scream and two fainter echoes off the facades.
      for (const [delay, k] of [[0, 1], [0.26, 0.35], [0.55, 0.15]] as const) tone(o, 'sawtooth', 700, 1250, delay, 0.5, 0.25 * k, 0.5, 0.8, { vib: [8, 30], band: [1100, 1.2] });
    },
    /** The dread drone (0..1); boss waves add a dissonant third. */
    ambience(level: number, boss: boolean) {
      const b = bus();
      if (!b) return;
      if (!ambienceGain) {
        ambienceGain = b.context.createGain(); ambienceGain.gain.value = 0; ambienceGain.connect(b.bed);
        bossGain = b.context.createGain(); bossGain.gain.value = 0; bossGain.connect(b.bed);
        const lp = b.context.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
        lp.connect(ambienceGain);
        for (const f of [55, 58.3]) { const o = b.context.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); loops.push(o); }
        const wind = b.context.createBufferSource(); wind.buffer = b.noise; wind.loop = true;
        const wf = b.context.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.5;
        const wg = b.context.createGain(); wg.gain.value = 0.35; wind.connect(wf).connect(wg).connect(ambienceGain); wind.start(); loops.push(wind);
        const third = b.context.createOscillator(); third.type = 'sawtooth'; third.frequency.value = 77.8;
        const tl = b.context.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 260;
        third.connect(tl).connect(bossGain); third.start(); loops.push(third);
      }
      const t = b.context.currentTime, quiet = t < duckUntil ? 0.05 : 1;
      ambienceGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.06 * quiet, t, 0.6);
      bossGain!.gain.setTargetAtTime((boss ? 0.035 : 0) * quiet, t, 1.2);
    },
    /** Near silence for `seconds` (the drone and the tremor bed): the beat before a mutant roars. */
    duck(seconds: number) {
      const b = bus();
      if (!b) return;
      const t = b.context.currentTime;
      duckUntil = Math.max(duckUntil, t + seconds);
      b.bed.gain.cancelScheduledValues(t);
      b.bed.gain.setTargetAtTime(seconds > 0 ? 0.04 : 1, t, seconds > 0 ? 0.15 : 0.6);
      if (seconds > 0) b.bed.gain.setTargetAtTime(1, t + seconds, 0.4);
    },
    dispose() {
      for (const l of loops) { try { l.stop(); } catch { /* already stopped */ } }
      loops.length = 0;
      try { master?.disconnect(); } catch { /* gone */ }
      master = bed = shaper = null;
      tremorGain = ambienceGain = breathGain = bossGain = null;
    },
  };
  return audio;
}
