/**
 * The zombie wave director (design.md §2): how big each wave is, which kinds come, when the giant mutants arrive and
 * how long the rests last, as pure formulas of the wave number `w` and the player count `n`. Solo and online share
 * one schedule: online only scales counts, the alive cap, HP, speed and spawn pressure, never which kinds exist or
 * when they unlock. One director runs on the host (or solo); its state travels in zdir (toNet/fromNet carry the
 * RNG), so any client can take over mid-wave. Also here: the fairness rules every attack obeys (TELL_MIN, the
 * view and latency allowances, the chase-speed cap), the victim's damage governor and the host's real-time step.
 * Pure: no three.js, no DOM (scripts/zombie-director.test.mjs imports it).
 */
import { MUTANT_KINDS, ZOMBIE_KINDS, type AttackId, type MutantKind, type ZDirector, type ZPhase, type ZombieKind } from '../../lib/zombie-protocol.ts';

/** How a zombie enters the street (§2.3): out of the ground, a doorway, off a roof, an alley, rubble, a mutant's brood. */
export type SpawnHow = 'rise' | 'door' | 'drop' | 'alley' | 'burst' | 'brood';

// ---- §2.1 formulas ----------------------------------------------------------------------------------------------

/** Eases the online extras in over waves 1-3. */
export const ramp = (w: number) => Math.min(1, (w + 1) / 4);
export const waveSize = (w: number, n: number) => Math.round((10 + 6 * w) * (1 + 0.6 * (n - 1) * ramp(w)));
/** Zombies standing at once: solo up to 64, online up to 120. */
export const aliveCap = (w: number, n: number, online = n > 1) =>
  online ? Math.min(120, Math.round((20 + 4 * w) * (1 + 0.3 * (n - 1)))) : Math.min(64, 20 + 4 * w);
export const hpMul = (w: number, n: number) => (1 + 0.06 * (w - 1)) * (1 + 0.12 * (n - 1) * ramp(w));
export const speedMul = (w: number, n: number) => Math.min(1.25, (1 + 0.012 * (w - 1)) * (1 + 0.02 * (n - 1)));
/** The same solo and online: more pressure, never one-shots. */
export const damageMul = (w: number) => Math.min(1.3, 1 + 0.03 * (w - 1));
export const spawnInterval = (w: number, n: number) => Math.max(0.12, (0.9 - 0.05 * (w - 1)) / (1 + 0.35 * (n - 1)));
/** Non-walker weights grow a little with the team. */
export const specialMul = (n: number) => 1 + 0.08 * (n - 1);
export const restSeconds = (online: boolean, boss: boolean) => (online ? 25 : 20) + (boss ? 10 : 0);
export const mutantHpMul = (w: number, n: number) => (1 + 0.06 * (w - 1)) * (1 + 0.75 * (n - 1));
/** Waves 3, 5, 8, 10, then every third (13, 16, ...). */
export const isBossWave = (w: number) => w === 3 || w === 5 || w === 8 || w === 10 || (w > 10 && (w - 10) % 3 === 0);
/** Mutants in a boss wave: one at wave 3 (the introduction), then 1 + floor((n - 1) / 3), one more from wave 10; capped. */
export function mutantCount(w: number, n: number) {
  if (!isBossWave(w)) return 0;
  if (w === 3) return 1;
  return Math.min(n > 1 ? 3 : 2, 1 + Math.floor((n - 1) / 3) + (w >= 10 ? 1 : 0));
}
/** Solo base HP at wave 1 (§3.1), before mutantHpMul; a u16 on the wire. */
export const MUTANT_HP: Record<MutantKind, number> = { colossus: 2600, leaper: 1600, matriarch: 3000 };
export const MAX_MUTANT_HP = 65_000;
export const mutantHp = (kind: MutantKind, w: number, n: number) => Math.min(MAX_MUTANT_HP, Math.round(MUTANT_HP[kind] * mutantHpMul(w, n)));
/** Where each mutant comes out (§3.4). */
export const MUTANT_AT: Record<MutantKind, 'hole' | 'crater' | 'roof'> = { colossus: 'hole', leaper: 'roof', matriarch: 'crater' };

const BOSS_CYCLE: MutantKind[][] = [['leaper', 'matriarch'], ['colossus', 'matriarch'], ['colossus', 'leaper', 'matriarch']];
/** The kinds a boss wave is built from, before trimming or repeating to the count. */
export function bossBase(w: number): MutantKind[] {
  if (w === 3) return ['colossus'];
  if (w === 5) return ['leaper'];
  if (w === 8) return ['matriarch'];
  if (w === 10) return ['colossus', 'leaper'];
  if (w > 10 && (w - 10) % 3 === 0) return BOSS_CYCLE[((w - 13) / 3) % 3];
  return [];
}
/**
 * The mutants of wave w: a boss wave's list trimmed (or repeated) to mutantCount, else from wave 6 a 25% chance of one
 * wandering mutant (rotating kind). Draws exactly one random number whatever n is, so solo and online runs with the
 * same seed meet the same mutants.
 */
export function bossesFor(w: number, n: number, rng: () => number): MutantKind[] {
  const roll = rng();
  const base = bossBase(w);
  if (!base.length) return w >= 6 && roll < 0.25 ? [MUTANT_KINDS[w % 3]] : [];
  const count = mutantCount(w, n);
  return Array.from({ length: count }, (_, i) => base[i % base.length]);
}

// ---- §2.3 kind mix ----------------------------------------------------------------------------------------------

/** [unlock wave, weight at unlock, weight from wave 12]. The stalker is not weighted (one per wave, see stalkersFor). */
export const KIND_MIX: Record<ZombieKind, readonly [number, number, number]> = {
  walker: [1, 100, 30], runner: [2, 10, 18], crawler: [2, 10, 10], shipper: [2, 8, 10], brute: [3, 5, 8], spitter: [3, 6, 7],
  bloater: [4, 5, 6], riot: [4, 6, 8], screamer: [5, 2, 3], hunter: [6, 3, 5], stalker: [7, 0, 0],
};
/** Most standing at once [solo, online] (Infinity: no cap of its own). */
export const MAX_ALIVE: Record<ZombieKind, readonly [number, number]> = {
  walker: [Infinity, Infinity], runner: [Infinity, Infinity], crawler: [15, 30], shipper: [Infinity, Infinity], brute: [4, 8], spitter: [3, 6],
  bloater: [3, 6], riot: [6, 12], screamer: [1, 2], hunter: [2, 4], stalker: [1, 2],
};
/** Packs: crawlers come 3-5 at a time, shippers in pairs, riot police in squads of 2-3. */
export const PACK: Record<ZombieKind, readonly [number, number]> = {
  walker: [1, 1], runner: [1, 1], crawler: [3, 5], shipper: [2, 2], brute: [1, 1], spitter: [1, 1], bloater: [1, 1], riot: [2, 3], screamer: [1, 1], hunter: [1, 1], stalker: [1, 1],
};
/** How each kind may arrive (§2.3); the first ambush style in the list is used for ambushes. */
export const SPAWN_STYLES: Record<ZombieKind, readonly SpawnHow[]> = {
  walker: ['rise', 'door', 'alley'], runner: ['rise', 'alley', 'drop'], crawler: ['rise', 'alley'], shipper: ['alley', 'door'],
  brute: ['door', 'burst'], spitter: ['drop', 'door'], bloater: ['rise', 'door'], riot: ['alley'], screamer: ['door', 'drop'],
  hunter: ['rise', 'alley'], stalker: ['alley'],
};
const AMBUSH: readonly SpawnHow[] = ['drop', 'alley'];
/** Share of spawns that are ambushes (roof drops, alley bursts): none before wave 3, 15%, 25% from wave 8. */
export const ambushShare = (w: number) => (w >= 8 ? 0.25 : w >= 3 ? 0.15 : 0);

export function kindWeights(w: number, n: number, night: number): Record<ZombieKind, number> {
  const out = {} as Record<ZombieKind, number>;
  let total = 0;
  for (const kind of ZOMBIE_KINDS) {
    const [unlock0, a, b] = KIND_MIX[kind];
    const unlock = kind === 'runner' && night > 0.5 ? 1 : unlock0;
    let weight = w < unlock || kind === 'stalker' ? 0 : a + (b - a) * Math.min(1, Math.max(0, (w - unlock) / Math.max(1, 12 - unlock)));
    if (kind !== 'walker') weight *= specialMul(n);
    out[kind] = weight;
    total += weight;
  }
  // Night: runners take 15% more of the spawns (as today).
  if (out.runner > 0) out.runner += 0.15 * Math.max(0, Math.min(1, night)) * total;
  return out;
}
/** Stalkers per wave from wave 7: one solo, one per three players online (at most two standing). */
export const stalkersFor = (w: number, n: number, online: boolean) => (w < 7 ? 0 : online ? Math.min(2, Math.ceil(n / 3)) : 1);
/** Points for a kill (head shots +50%); mutants 1000, 2000 from wave 10. */
export const KILL_SCORE: Record<ZombieKind, number> = {
  walker: 10, runner: 15, crawler: 8, shipper: 15, brute: 40, spitter: 30, bloater: 30, riot: 35, screamer: 50, hunter: 45, stalker: 80,
};
export const killScore = (kind: ZombieKind | MutantKind, w: number, head: boolean) =>
  Math.round(((MUTANT_KINDS as readonly string[]).includes(kind) ? (w >= 10 ? 2000 : 1000) : KILL_SCORE[kind as ZombieKind]) * (head ? 1.5 : 1));

// ---- §2.4 fairness ----------------------------------------------------------------------------------------------

/** The shortest telegraph of every attack (seconds). */
export const TELL_MIN: Record<AttackId, number> = {
  claw: 0.25, bash: 0.25, lunge: 0.35, bite: 0.3, spit: 0.6, burst: 1.0, scream: 1.1, grab: 0.5, swipe: 0.7, slam: 0.9, charge: 0.8,
  throw: 0.7, roar: 1.2, pounce: 0.7, slash: 0.45, bile: 0.6, brood: 1.0, exhale: 1.0, deathburst: 1.5,
};
/** The longest regular-zombie chase after every multiplier, below the player's 6.8 m/s sprint. */
export const CHASE_CAP = 6.4;
/** A player's view cone for 'seen' checks (radians either side) and the longest sight line. */
export const VIEW_HALF = (40 * Math.PI) / 180;
export const VIEW_RANGE = 70;
/**
 * The windup an attack gets: its own, never under TELL_MIN; an attacker the victim cannot see waits at least 0.5 s;
 * a remote victim gets half its round trip plus 50 ms more (at most 0.2 s), since it sees the tell that much later.
 */
export function tellFor(attack: AttackId, windup: number, opts: { offscreen?: boolean; remote?: boolean; rtt?: number } = {}) {
  let t = Math.max(windup, TELL_MIN[attack]);
  if (opts.offscreen) t = Math.max(t, 0.5);
  if (opts.remote) t += Math.min(0.2, Math.max(0, opts.rtt ?? 0) / 2 + 0.05);
  return t;
}
/** Is (x, z) inside the view cone of someone at (px, pz) whose camera faces `yaw` (atan2(dx, dz) convention)? */
export function inViewCone(px: number, pz: number, yaw: number, x: number, z: number, range = VIEW_RANGE) {
  const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 1.5) return true;
  const a = Math.atan2(dx, dz) - yaw;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= VIEW_HALF;
}

/**
 * The victim's damage governor (§1.5, §2.4): regular zombies deal at most 45 per rolling second, one hit at most 60,
 * a knockdown or heavy hit gives 1.5 s at half damage with no new knockdown, and downed players take nothing.
 * `source` 'zombie' counts toward the 45 dps; mutants and the environment do not.
 */
export function createGovernor() {
  const recent: { t: number; d: number }[] = [];
  let softUntil = -Infinity;
  return {
    apply(now: number, damage: number, source: 'zombie' | 'mutant' | 'other', knock: boolean, down = false): { damage: number; knock: boolean } {
      if (down || !(damage > 0)) return { damage: 0, knock: false };
      let d = Math.min(60, damage);
      const soft = now < softUntil;
      if (soft) d *= 0.5;
      if (source === 'zombie') {
        while (recent.length && now - recent[0].t >= 1) recent.shift();
        let sum = 0;
        for (const r of recent) sum += r.d;
        d = Math.max(0, Math.min(d, 45 - sum));
        if (d > 0) recent.push({ t: now, d });
      }
      const heavy = knock || damage >= 30;
      const knocked = knock && !soft && d > 0;
      if (heavy && !soft && d > 0) softUntil = now + 1.5;
      return { damage: d, knock: knocked };
    },
    /** Invulnerable (a fresh respawn) or softened for a while. */
    soften(until: number) { softUntil = Math.max(softUntil, until); },
    reset() { recent.length = 0; softUntil = -Infinity; },
  };
}
export type Governor = ReturnType<typeof createGovernor>;

/**
 * The host's simulation steps for one frame (§1.10, A7): the real interval (seconds), clamped to 0.1 s and cut into
 * substeps of at most 0.05 s, so a slow host never slows the room. Solo keeps the weapon bag's slow motion (×0.25);
 * online it has none.
 */
export function simSteps(interval: number, opts: { online: boolean; bag?: boolean }, out: number[] = []) {
  out.length = 0;
  const total = Math.min(0.1, Math.max(0, interval)) * (!opts.online && opts.bag ? 0.25 : 1);
  if (!(total > 0)) return out;
  const parts = Math.max(1, Math.ceil(total / 0.05 - 1e-9));
  for (let i = 0; i < parts; i++) out.push(total / parts);
  return out;
}

// ---- the director -----------------------------------------------------------------------------------------------

export type DirectorPlayer = { slot: number; x: number; z: number; up: boolean; calm?: boolean };
export type DirectorCtx = {
  /** Seconds on the director's clock (server seconds online, performance.now() / 1000 solo). */
  time: number; players: readonly DirectorPlayer[]; night: number;
  alive: number; aliveOf(kind: ZombieKind): number; mutants: number;
};
export type DirectorStep = {
  spawns: { kind: ZombieKind; near: number; how: SpawnHow }[];
  mutants: { kind: MutantKind; hp: number; at: 'hole' | 'crater' | 'roof' }[];
  quake: MutantKind | null; waveStarted: number; waveCleared: number; bossWave: boolean; over: boolean; restart: boolean;
  /** Distant screams the host plays near a calm player (A21); `follow`: a screamer or runner pack comes from there. */
  omens: { near: number; follow: boolean }[];
};
type SlotStats = [number, number, number, number]; // kills, damage dealt, downs, revives

const PREP_SECONDS = 6;
/**
 * Online, a new room's first wave waits for the team: up to PREP_WAIT_S, cut to PREP_TEAM_S once two players are in
 * (wave 1 is then sized for them), or to PREP_GO_S when anyone presses "Bắt đầu" (§4.1). A restart after a wipe keeps
 * the short prep.
 */
export const PREP_WAIT_S = 90, PREP_TEAM_S = 10, PREP_GO_S = 3;
const OVER_SECONDS = 10;
/** A boss wave's mutants arrive 14 s in and every 28 s after; the quake warns 6 s ahead. */
const BOSS_FIRST = 14, BOSS_GAP = 28, QUAKE_LEAD = 6;

/** mulberry32: a 32-bit state that serializes as one number. */
function rngFrom(state: number) {
  let s = state >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, get state() { return s; }, set state(v: number) { s = v >>> 0; } };
}

export function createDirector(seed: number, online: boolean) {
  const rng = rngFrom(seed);
  const random = () => rng.next();
  let wave = 0, phase: ZPhase = 'prep', until = 0, toSpawn = 0, spawned = 0, kills = 0, score = 0, best = 0, n = 1;
  let spawnAt = 0, bossWave = false, left = 0, stalkers = 0, stalkerAt = 0;
  let boss: MutantKind[] = [], bossAt: number[] = [], quaked: boolean[] = [];
  let rr = 0;
  const stats = new Map<number, SlotStats>();
  const omenAt = new Map<number, number>();
  const step: DirectorStep = { spawns: [], mutants: [], quake: null, waveStarted: 0, waveCleared: 0, bossWave: false, over: false, restart: false, omens: [] };
  const slot = (s: number) => { let row = stats.get(s); if (!row) stats.set(s, (row = [0, 0, 0, 0])); return row; };

  function pickKind(ctx: DirectorCtx): ZombieKind {
    const weights = kindWeights(wave, n, ctx.night);
    let total = 0;
    for (const kind of ZOMBIE_KINDS) {
      if (ctx.aliveOf(kind) >= MAX_ALIVE[kind][online ? 1 : 0]) weights[kind] = 0;
      total += weights[kind];
    }
    let r = random() * total;
    for (const kind of ZOMBIE_KINDS) { r -= weights[kind]; if (r <= 0 && weights[kind] > 0) return kind; }
    return 'walker';
  }
  function pickHow(kind: ZombieKind): SpawnHow {
    const styles = SPAWN_STYLES[kind], ambush = styles.filter((s) => AMBUSH.includes(s)), plain = styles.filter((s) => !AMBUSH.includes(s));
    const r = random(), r2 = random();
    if (ambush.length && (r < ambushShare(wave) || !plain.length)) return ambush[Math.floor(r2 * ambush.length)];
    return plain[Math.floor(r2 * plain.length)];
  }
  function nearPlayer(ctx: DirectorCtx) {
    const up = ctx.players.filter((p) => p.up);
    const list = up.length ? up : ctx.players;
    if (!list.length) return 0;
    return list[rr++ % list.length].slot;
  }
  function beginWave(ctx: DirectorCtx) {
    wave++;
    n = Math.max(1, Math.min(8, ctx.players.length));
    toSpawn = waveSize(wave, n);
    spawned = 0;
    boss = bossesFor(wave, n, random);
    bossWave = isBossWave(wave);
    bossAt = boss.map((_, i) => ctx.time + BOSS_FIRST + BOSS_GAP * i);
    quaked = boss.map(() => false);
    stalkers = stalkersFor(wave, n, online);
    stalkerAt = ctx.time + 18 + random() * 22;
    spawnAt = ctx.time + 0.5;
    phase = 'wave';
    step.waveStarted = wave;
  }
  function reset(time: number, wait = false) {
    wave = 0; phase = 'prep'; until = time + (wait && online ? PREP_WAIT_S : PREP_SECONDS); toSpawn = 0; spawned = 0; kills = 0; score = 0;
    boss = []; bossAt = []; quaked = []; stalkers = 0; bossWave = false; left = 0;
    stats.clear(); omenAt.clear();
  }

  return {
    get wave() { return wave; },
    get phase() { return phase; },
    get bossWave() { return bossWave; },
    get best() { return best; },
    set best(v: number) { best = Math.max(best, v); },
    get n() { return n; },
    /** A new run: online it waits for the team (PREP_WAIT_S, PREP_TEAM_S once two are in), solo PREP_SECONDS. */
    start(time: number) { reset(time, true); },
    /** Back to wave 1 after a wipe (online) or a solo death; the room's best wave is kept. */
    restart(time: number) { reset(time); },
    /** "Bắt đầu" on the waiting card: the first wave comes in PREP_GO_S (no-op once it started). */
    startSoon(time: number) { if (phase === 'prep') until = Math.min(until, time + PREP_GO_S); },
    update(_dt: number, ctx: DirectorCtx): DirectorStep {
      step.spawns.length = 0; step.mutants.length = 0; step.omens.length = 0;
      step.quake = null; step.waveStarted = 0; step.waveCleared = 0; step.over = false; step.restart = false;
      const t = ctx.time;
      // The team is here: the waiting room counts down from PREP_TEAM_S (never extends a shorter countdown).
      if (phase === 'prep' && online && ctx.players.length >= 2) until = Math.min(until, t + PREP_TEAM_S);
      if (phase === 'over') {
        if (t >= until) { reset(t); step.restart = true; }
      } else if (phase === 'prep' || phase === 'rest') {
        if (t >= until) beginWave(ctx);
      } else if (online && ctx.players.length > 0 && ctx.players.every((p) => !p.up)) {
        // The whole team is down at once: game over, then wave 1 again after 10 s.
        phase = 'over';
        until = t + OVER_SECONDS;
        step.over = true;
      }
      if (phase === 'wave') {
        const cap = aliveCap(wave, n, online);
        let alive = ctx.alive;
        while (toSpawn > 0 && t >= spawnAt && alive < cap) {
          const kind = pickKind(ctx);
          const [lo, hi] = PACK[kind];
          const pack = Math.min(toSpawn, lo + Math.floor(random() * (hi - lo + 1)), Math.max(1, cap - alive));
          const how = pickHow(kind), near = nearPlayer(ctx);
          for (let i = 0; i < pack; i++) step.spawns.push({ kind, near, how });
          toSpawn -= pack; spawned += pack; alive += pack;
          spawnAt = t + spawnInterval(wave, n) * pack;
        }
        if (stalkers > 0 && t >= stalkerAt && ctx.aliveOf('stalker') < MAX_ALIVE.stalker[online ? 1 : 0]) {
          step.spawns.push({ kind: 'stalker', near: nearPlayer(ctx), how: 'alley' });
          stalkers--; spawned++;
          stalkerAt = t + 20 + random() * 20;
        }
        for (let i = 0; i < boss.length; i++) {
          if (!quaked[i] && t >= bossAt[i] - QUAKE_LEAD) { quaked[i] = true; step.quake = boss[i]; }
          if (t >= bossAt[i]) {
            const kind = boss[i];
            step.mutants.push({ kind, hp: mutantHp(kind, wave, n), at: MUTANT_AT[kind] });
            boss.splice(i, 1); bossAt.splice(i, 1); quaked.splice(i, 1); i--;
          }
        }
        // Omens: every 25-60 s per calm player, a distant scream off their view; half the time something follows.
        for (const p of ctx.players) {
          if (!p.up) continue;
          const next = omenAt.get(p.slot);
          if (next === undefined) { omenAt.set(p.slot, t + 25 + random() * 35); continue; }
          if (t < next) continue;
          omenAt.set(p.slot, t + 25 + random() * 35);
          if (p.calm !== false) step.omens.push({ near: p.slot, follow: random() < 0.5 });
        }
        left = ctx.alive + toSpawn + boss.length + ctx.mutants + stalkers;
        if (left === 0) {
          step.waveCleared = wave;
          best = Math.max(best, wave);
          phase = 'rest';
          until = t + restSeconds(online, bossWave);
        }
      } else left = 0;
      step.bossWave = bossWave;
      return step;
    },
    /** Nothing more comes this wave (tests): it clears once the standing ones are down. */
    finish() { toSpawn = 0; boss = []; bossAt = []; quaked = []; stalkers = 0; },
    /** A spawn the director asked for could not be placed: it comes back later. */
    refund(count = 1) { if (phase === 'wave') { toSpawn += count; spawned = Math.max(0, spawned - count); } },
    onKill(kind: ZombieKind | MutantKind, by: number, head: boolean) {
      kills++;
      score += killScore(kind, wave, head);
      if (by >= 0 && by < 8) slot(by)[0]++;
    },
    onDamage(by: number, amount: number) { if (by >= 0 && by < 8 && amount > 0) slot(by)[1] += amount; },
    onDown(s: number) { slot(s)[2]++; },
    onRevive(by: number) { slot(by)[3]++; },
    /** Screamer, roar and brood extras join the wave (they are spawned at once by the caller). */
    onSummon(count: number) { spawned += count; },
    stats(time: number) {
      return { wave, left, kills, score, phase, breakLeft: phase === 'prep' || phase === 'rest' || phase === 'over' ? Math.max(0, Math.ceil(until - time)) : 0 };
    },
    slotStats(): [number, number, number, number, number][] {
      return [...stats.entries()].sort((a, b) => a[0] - b[0]).map(([s, r]) => [s, r[0], Math.round(r[1]), r[2], r[3]]);
    },
    toNet(): ZDirector {
      return {
        wave, phase, until: Math.round(until * 1000), left, spawned, toSpawn: toSpawn + stalkers, kills, score, best,
        boss: [...boss], mutants: [], stats: this.slotStats(), ruins: [], rng: rng.state, n,
      };
    },
    /** Takes over a director from the net (a promoted host): same wave, timers, counters and RNG. */
    fromNet(d: ZDirector, time: number) {
      wave = d.wave; phase = d.phase; until = d.until / 1000; left = d.left; spawned = d.spawned; toSpawn = d.toSpawn;
      kills = d.kills; score = d.score; best = Math.max(best, d.best); n = Math.max(1, d.n);
      rng.state = d.rng;
      boss = [...d.boss];
      bossAt = boss.map((_, i) => time + 8 + BOSS_GAP * i);
      quaked = boss.map(() => false);
      bossWave = isBossWave(wave);
      stalkers = 0;
      spawnAt = time + 0.3;
      stats.clear();
      for (const [s, k, dmg, downs, revives] of d.stats) stats.set(s, [k, dmg, downs, revives]);
    },
    /** Reconciles counters with what happened after the zdir a promoted host took over from (A2). */
    reconcile(killsSince: number, spawnsSince: number, alive: number) {
      kills += Math.max(0, killsSince);
      toSpawn = Math.max(0, toSpawn - Math.max(0, spawnsSince));
      left = alive + toSpawn + boss.length;
    },
    /** A promoted host with nothing to go on (a restarted room): carry on from the last wave shown, resting. */
    resume(lastWave: number, time: number, delay = restSeconds(online, false)) {
      reset(time);
      wave = Math.max(0, lastWave - 1);
      phase = 'rest';
      until = time + delay;
    },
    random,
  };
}
export type Director = ReturnType<typeof createDirector>;
