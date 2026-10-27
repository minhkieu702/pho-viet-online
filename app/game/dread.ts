import type { MutantKind, ZombieKind } from '../../lib/zombie-protocol.ts';

/**
 * The dread director (presentation only, per client): turns how close the threats are, the player's health, an
 * announced mutant, a stalker and roars into heartbeat, breathing, camera shake, vignettes, night fog, flickering
 * lamps and flashlight, a drone that falls silent before a roar, and the bearing of the director's distant screams
 * (omens are host events, §9 A21: dread only voices them). It never deals damage and never fakes a telegraph: a
 * flicker or a scream is not a tell, and every tell comes from the attack itself.
 */
export type DreadInput = {
  now: number; dt: number; night: number; health: number; boss: boolean; reducedMotion: boolean;
  player: { x: number; z: number; camYaw: number; sprinting: boolean; inCloud: boolean };
  /** Threats within 60 m (zombies of special kinds, every mutant). */
  threats: readonly { x: number; z: number; kind: ZombieKind | MutantKind; big: boolean; seen: boolean; telling: boolean }[];
  quake: number;          // 0..1 ramp of an announced mutant
  stalker: number;        // distance to the nearest stalker (Infinity: none)
  roarAt: number;         // time of the last roar heard
  /** Optional extras: where the last roar was heard from (m), a slam's or burst's jolt felt this frame (0..1), when the player was last hit hard, omen screams received this frame, downed. */
  roarDist?: number; impact?: number; hurtAt?: number; omens?: readonly { x: number; z: number }[]; down?: boolean;
};
export type DreadOutput = {
  shake: number; vignette: number; tint: 'none' | 'blood' | 'toxic' | 'stalk';
  fogNear: number | null; fogFar: number | null;
  heartbeat: { bpm: number; volume: number }; breath: number; tremor: number; ambience: number;
  torchFlicker: number; lampFlicker: number; blackout: boolean;
  distantScream: number | null;   // bearing, when one should play this frame
};

/** Seconds between two distant screams voiced by one client (the director decides when they happen). */
export const SCREAM_GAP = 8;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createDread(seed: number) {
  // The colossus footstep phase starts per client from the seed.
  let sprintFor = 0, lastScream = -Infinity, step = (Math.abs(seed) % 997) / 997, shake = 0, vignette = 0, breath = 0, heart = 0;
  const out: DreadOutput = {
    shake: 0, vignette: 0, tint: 'none', fogNear: null, fogFar: null, heartbeat: { bpm: 60, volume: 0 }, breath: 0, tremor: 0, ambience: 0,
    torchFlicker: 0, lampFlicker: 0, blackout: false, distantScream: null,
  };
  return {
    update(i: DreadInput): DreadOutput {
      const dt = clamp(i.dt, 0, 0.25), motion = i.reducedMotion ? 0.5 : 1;
      sprintFor = i.player.sprinting ? sprintFor + dt : Math.max(0, sprintFor - dt * 2);
      // How close the big things are (mutants, and the specials that matter): 1 on top of you, 0 beyond 30 m.
      let big = 0, near20 = false, colossus = 0;
      for (const t of i.threats) {
        const d = Math.hypot(t.x - i.player.x, t.z - i.player.z);
        if (t.big) { big = Math.max(big, clamp(1 - d / 30, 0, 1)); if (d < 20) near20 = true; }
        if (t.kind === 'colossus' && d < 30) colossus = Math.max(colossus, 1 - d / 30);
      }
      const lowHealth = clamp((30 - i.health) / 30, 0, 1), down = !!i.down || i.health <= 0;
      // Heartbeat: 60 + 80 x the worse of a big threat close by and low health; silent otherwise.
      const pulse = Math.max(big, lowHealth, down ? 0.8 : 0);
      heart += (pulse - heart) * Math.min(1, dt * 2);
      out.heartbeat.bpm = Math.round(60 + 80 * heart);
      out.heartbeat.volume = heart < 0.03 ? 0 : clamp(0.25 + 0.75 * heart, 0, 1);
      // Heavy breathing: a long sprint, something big within 20 m, or downed.
      const wantBreath = Math.max(sprintFor > 4 ? clamp((sprintFor - 4) / 2, 0, 1) : 0, near20 ? 0.8 : 0, down ? 1 : 0, i.stalker < 18 ? 0.5 : 0);
      breath += (wantBreath - breath) * Math.min(1, dt * 1.5);
      out.breath = clamp(breath, 0, 1);
      // Ground shake: the quake ramp (<= 0.15), colossus footsteps (0.05), slams (<= 0.6), roars (<= 0.45 within 40 m).
      step += dt * 1.6;
      const sinceRoar = i.now - i.roarAt;
      const roar = sinceRoar >= 0 && sinceRoar < 1.6 ? 0.45 * clamp(1 - (i.roarDist ?? 0) / 40, 0, 1) * (1 - sinceRoar / 1.6) : 0;
      const footsteps = colossus > 0 ? 0.05 * colossus * Math.max(0, Math.sin(step * Math.PI * 2)) ** 8 : 0;
      const want = Math.max(clamp(i.quake, 0, 1) * 0.15, footsteps, clamp(i.impact ?? 0, 0, 1) * 0.6, roar);
      shake = Math.max(want, shake - dt * 1.5);
      out.shake = clamp(shake * motion, 0, 0.6);
      out.tremor = clamp(Math.max(i.quake * 0.8, colossus * 0.4, roar * 1.5), 0, 1);
      // Vignettes: low-health red pulse, the stalker's dark breathing edge, toxic green, a dark flash on a heavy hit.
      const hurt = i.hurtAt !== undefined ? clamp(1 - (i.now - i.hurtAt) / 0.35, 0, 1) : 0;
      let v = 0;
      out.tint = 'none';
      if (i.player.inCloud) { out.tint = 'toxic'; v = 0.55; }
      else if (i.stalker < 18) { out.tint = 'stalk'; v = 0.35 + 0.4 * (1 - i.stalker / 18) * (i.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(i.now * 2.4)); }
      else if (lowHealth > 0 || down) { out.tint = 'blood'; v = (down ? 0.7 : 0.25 + 0.5 * lowHealth) * (i.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(i.now * (5 + 4 * lowHealth))); }
      v = Math.max(v, hurt * 0.8);
      vignette += (v - vignette) * Math.min(1, dt * 6);
      out.vignette = clamp(vignette, 0, 1);
      // Fog: zombie nights close in; boss waves bring a nearer, heavier haze (by day too, a little).
      const n = clamp(i.night, 0, 1);
      if (i.boss) { out.fogNear = 30 + (16 - 30) * n; out.fogFar = 140 + (85 - 140) * n; }
      else if (n > 0.05) { out.fogNear = 70 + (22 - 70) * n; out.fogFar = 220 + (95 - 220) * n; }
      else { out.fogNear = null; out.fogFar = null; }
      // Lights: lamps flicker at night (heavily with a stalker near or a quake building), all out for 0.6 s on a roar;
      // the flashlight flickers only as a tell of the stalker or the quake.
      const warn = Math.max(i.stalker < 18 ? 1 : 0, clamp(i.quake * 2, 0, 1));
      out.lampFlicker = n * Math.max(0.15, warn);
      out.torchFlicker = warn;
      out.blackout = sinceRoar >= 0 && sinceRoar < 0.6;
      // The drone: low by day, more at night; near silence the moment before a mutant's roar.
      out.ambience = (0.35 + 0.4 * n + (i.boss ? 0.15 : 0)) * (i.quake > 0.85 ? 0.05 : 1) * (sinceRoar >= 0 && sinceRoar < 1 ? 0.2 : 1);
      // Distant screams: the director's omens, voiced from their bearing, at most one per SCREAM_GAP s.
      out.distantScream = null;
      if (i.omens) for (const o of i.omens) {
        const d = Math.hypot(o.x - i.player.x, o.z - i.player.z);
        if (d > 80 || i.now - lastScream < SCREAM_GAP) continue;
        lastScream = i.now;
        out.distantScream = wrap(i.player.camYaw - Math.atan2(o.x - i.player.x, o.z - i.player.z));
        break;
      }
      return out;
    },
  };
}
