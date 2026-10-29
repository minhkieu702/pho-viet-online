import * as THREE from 'three';
import { FIGURE, FigureBatch, HAND, JOINT, applyRig, figureMaterial, gait, limbMatrix, newGait, swingCode } from './figures.ts';
import { MUTANT_LOOKS, SHAPE, bendLimit, eyeWorld, mutantDress, newTwitch, twitch, zombieGeometry, type GrowthSite, type MutantLook, type ZombieDress } from './zombie-looks.ts';
import type { HorrorFx } from './horror-fx.ts';
import type { HorrorAudio } from './horror-audio.ts';
import { SEE_THROUGH, seeThrough } from './see-through.ts';
import type { RoadGraph } from './map/roads.ts';
import {
  ATTACKS, MF, MPHASES, MUTANT_ID_BASE, MUTANT_KINDS, MAX_MUTANTS, RUIN_THROWN,
  type AttackId, type MPhase, type MutantKind, type NetMutant, type ZEvent, type ZHitKind, type ZombieKind,
} from '../../lib/zombie-protocol.ts';

/**
 * The giant mutants (design §3): Đại Hộ Pháp (colossus: a 6 m hunched giant with a club arm that swipes, slams,
 * charges down the road and throws wrecks), Nhện Mái (leaper: a long-limbed thing on all fours that climbs facades,
 * runs over roofs and drops on the team) and Mẹ Bầy (matriarch: a swollen brood mother that lobs bile, gasses anyone
 * close and births crawlers). The host simulates them ('sim'); everyone else draws puppets from snapshots and turns
 * the host's events into the same tells ('puppet'). Every attack is telegraphed (a pose, a sound and a ground marker)
 * for at least its TELL_MIN, plus the latency allowance for a remote victim and 0.5 s when the victim cannot see the
 * attacker. Victims confirm their own damage (§1.5), so a hit event carries a shape and the candidates inside it.
 *
 * Drawn on the figure system: the zombie variant geometry at 'hi' scaled up per kind, the limbs scaled per side
 * (within §9 A13's limits), plus growths and glowing weak spots through horror-fx: 4 figure draws, only while a
 * mutant exists, and the growths and glows shared with the zombies.
 */

export type MutantWorld = {
  ground(x: number, z: number): number;
  /** True = blocked by terrain, water or a building footprint (never props, vehicles or ruin wrecks). */
  hard(x: number, z: number, r: number): boolean;
  /** True = clear: a fat ray of radius r against the building footprints. */
  castHard(x1: number, z1: number, x2: number, z2: number, r: number): boolean;
  sight(x1: number, z1: number, x2: number, z2: number): boolean;
  /** Roof height at (x, z), or null off the roofs. */
  roofAt(x: number, z: number): number | null;
  /** The facade nearest (x, z) within r: the foot of the wall, its outward normal and its top. */
  wallNear(x: number, z: number, r: number): { x: number; z: number; nx: number; nz: number; top: number } | null;
  /** A walking line for a mutant of `radius` (createMutantRouter), [] when there is none. */
  route(fx: number, fz: number, tx: number, tz: number, radius?: number): { x: number; z: number }[];
  smashables(x: number, z: number, r: number, cb: (kind: 'car' | 'ruin', id: number, x: number, z: number) => void): void;
  /** Whether any player sees the point (camera frustum locally, the ±40° camera cone for remote players). */
  seenBy(x: number, z: number, y: number): boolean;
};
/**
 * A player or a player's dog the mutants may hunt. Optional: the victim's camera yaw (an attacker outside its ±40°
 * view gets a windup of at least 0.5 s), extra windup for a remote victim (latency allowance, seconds), and for a dog
 * the mutant index it bites (-1).
 */
export type MutantTarget = { slot: number; dog: boolean; x: number; z: number; vx: number; vz: number; down: boolean; inVehicle: boolean; camYaw?: number; lag?: number; biting?: number };
export type MutantOut = {
  events: ZEvent[];                                   // tele, hit, proj, cloud, roar, smash, shove, kill, loot
  spawns: { kind: ZombieKind; x: number; z: number; how: 'burst' | 'brood' }[];
};
export type MutantView = { i: number; kind: MutantKind; x: number; z: number; y: number; hp: number; max: number; weak: number; phase: MPhase; telling: AttackId | null };
type Zone = 'body' | 'head' | 'weak' | 'limb';
type Point = { x: number; z: number };

// ---- Rules ------------------------------------------------------------------------------------------------------

export const MUTANT_SPEC: Record<MutantKind, { hp: number; radius: number; walk: number; run: number; climb: number; height: number; name: string; weakHp: number; loot: string }> = {
  colossus: { hp: 2600, radius: 1.6, walk: 2.2, run: 9, climb: 0, height: 6.0, name: 'ĐẠI HỘ PHÁP', weakHp: 350, loot: 'rpg' },
  leaper: { hp: 1600, radius: 0.9, walk: 3.0, run: 7.5, climb: 4, height: 4.2, name: 'NHỆN MÁI', weakHp: 300, loot: 'crate' },
  matriarch: { hp: 3000, radius: 1.9, walk: 1.4, run: 1.4, climb: 0, height: 5.2, name: 'MẸ BẦY', weakHp: 260, loot: 'bandages' },
};
/** Weak-point hints for the boss bars. */
export const MUTANT_HINTS: Record<MutantKind, string> = {
  colossus: 'Điểm yếu: bọc mủ sau vai',
  leaper: 'Điểm yếu: túi gai sống lưng, lộ ra khi nó chồm tới',
  matriarch: 'Điểm yếu: ba bọc độc trên bụng',
};
const WEAK_COUNT: Record<MutantKind, number> = { colossus: 1, leaper: 1, matriarch: 3 };
/** Every mutant attack: tell (s, never shortened), cooldown (s), damage, knockback (m/s), shape (radius, arc). */
export const MUTANT_ATTACKS = {
  swipe: { tell: 0.7, cd: 2.4, dmg: 30, kb: 6, r: 3.4, arc: 2.09 },
  slam: { tell: 0.9, cd: 12, dmg: 45, edge: 12, kb: 6, r: 7, knock: 5 },
  charge: { tell: 0.8, cd: 9, dmg: 40, kb: 9, r: 25, arc: 1.2, speed: 9 },
  throw: { tell: 0.7, cd: 10, dmg: 30, kb: 3, r: 3 },
  roar: { tell: 1.2, cd: 25, r: 50 },
  pounce: { tell: 0.7, cd: 5, dmg: 35, kb: 5, r: 2.5, drop: 30, dropR: 2 },
  slash: { tell: 0.45, cd: 1.4, dmg: 16, kb: 0, r: 2.6, arc: 1.9 },
  bile: { tell: 0.6, cd: 3.5, dmg: 18, kb: 0, r: 3 },
  exhale: { tell: 1.0, cd: 7, dps: 6, s: 4, r: 8, arc: Math.PI / 3 },
  brood: { tell: 1.0, cd: 15 },
  deathburst: { tell: 1.5, dmg: 25, kb: 4, r: 4, cloudR: 9, cloudS: 8, dps: 7 },
} as const;
type MutantAttack = keyof typeof MUTANT_ATTACKS;
/** Which attacks each mutant uses (the death burst is the matriarch's dying act). */
export const MUTANT_MOVES: Record<MutantKind, readonly MutantAttack[]> = {
  colossus: ['swipe', 'slam', 'charge', 'throw', 'roar'],
  leaper: ['pounce', 'slash'],
  matriarch: ['bile', 'exhale', 'brood', 'deathburst', 'roar'],
};
/** Seconds of the scripted death, the time the body lies, and how long it sinks. */
export const DEATH = { dying: 2.6, lie: 25, sink: 4 } as const;
/** Gravity of thrown wrecks and bile (horror-fx flies them with the same). */
export const LOB_GRAVITY = 14;
/** No single hit above 60% of a player's max health (and the event cap). */
export const MAX_MUTANT_HIT = 60;
const HIT_MARGIN = 2;

/**
 * Damage a victim at distance d from a hit's centre takes, and whether it knocks them down: the slam falls off from
 * 45 at the centre to 12 at its 7 m edge and knocks down within 5 m; swipes, charges and pounces knock down.
 */
export function mutantHitAt(a: AttackId, dmg: number, d: number) {
  if (a === 'slam') {
    const s = MUTANT_ATTACKS.slam, k = Math.min(1, Math.max(0, d / s.r));
    return { dmg: Math.min(MAX_MUTANT_HIT, dmg * (1 + (s.edge / s.dmg - 1) * k)), knock: d <= s.knock };
  }
  return { dmg: Math.min(MAX_MUTANT_HIT, dmg), knock: a === 'swipe' || a === 'charge' || a === 'pounce' || a === 'deathburst' };
}

/** The windup an attack gets against a victim: its tell, at least 0.5 s if the victim's camera cannot see the attacker, plus the latency allowance. */
export function windupFor(tell: number, attacker: Point, victim: MutantTarget | null) {
  if (!victim) return tell;
  let t = tell;
  if (victim.camYaw !== undefined) {
    const bearing = Math.atan2(attacker.x - victim.x, attacker.z - victim.z);
    if (Math.abs(wrap(bearing - victim.camYaw)) > 40 * Math.PI / 180) t = Math.max(t, 0.5);
  }
  return t + Math.min(0.2, Math.max(0, victim.lag ?? 0));
}

/** A ballistic lob from (x, y, z) landing at (tx, ty, tz), its apex `rise` above the higher end: velocity and flight time. */
export function lobVelocity(x: number, y: number, z: number, tx: number, ty: number, tz: number, rise: number) {
  const top = Math.max(y, ty) + rise, g = LOB_GRAVITY;
  const up = Math.sqrt(2 * g * Math.max(0.1, top - y)), down = Math.sqrt(2 * Math.max(0.1, top - ty) / g);
  const t = up / g + down;
  return { vx: (tx - x) / t, vy: up, vz: (tz - z) / t, t };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const q2 = (v: number) => Math.round(v * 100) / 100, q3 = (v: number) => Math.round(v * 1000) / 1000;
const bitOf = (t: MutantTarget) => (t.dog ? 1 << (8 + t.slot) : 1 << t.slot);
const keyOf = (t: MutantTarget) => t.slot + (t.dog ? 8 : 0);

// ---- Routing on the road graph (MutantWorld.route) -------------------------------------------------------------------

/**
 * A mutant's router over the live road graph (LEGACY_ROADS today, worldRoads().roads after the district merge): A*
 * over the nodes, both directions of every edge (it is not a car), skipping closed edges and edges too narrow for its
 * radius (half < radius + 0.5), along each edge's polyline. Routes are cached per (from node, to node, radius) for 3 s.
 */
export function createMutantRouter(graph: Pick<RoadGraph, 'nodes' | 'edges' | 'nearestEdge'>, now: () => number = () => performance.now() / 1000) {
  const adjacency: number[][] = graph.nodes.map(() => []);
  for (const e of graph.edges) { adjacency[e.a].push(e.id); adjacency[e.b].push(e.id); }
  const cache = new Map<string, { at: number; nodes: number[] | null }>();
  const fits = (radius: number) => (e: { half: number; closed: boolean }) => !e.closed && e.half >= radius + 0.5;
  /** Node path from any of `starts` (with costs) to any of `goals` (with costs), or null. */
  function search(starts: [number, number][], goals: Map<number, number>, radius: number) {
    const ok = fits(radius), n = graph.nodes.length;
    const g = new Float64Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const open: number[] = [];
    const goalNode = [...goals.keys()][0], gx = graph.nodes[goalNode].x, gz = graph.nodes[goalNode].z;
    const h = (i: number) => Math.hypot(graph.nodes[i].x - gx, graph.nodes[i].z - gz) * 0.9;
    for (const [s, c] of starts) if (c < g[s]) { g[s] = c; open.push(s); }
    let best = -1, bestCost = Infinity;
    while (open.length) {
      let k = 0;
      for (let j = 1; j < open.length; j++) if (g[open[j]] + h(open[j]) < g[open[k]] + h(open[k])) k = j;
      const u = open[k];
      open[k] = open[open.length - 1]; open.pop();
      if (closed[u]) continue;
      closed[u] = 1;
      const tail = goals.get(u);
      if (tail !== undefined && g[u] + tail < bestCost) { bestCost = g[u] + tail; best = u; }
      if (g[u] >= bestCost) continue;
      for (const id of adjacency[u]) {
        const e = graph.edges[id];
        if (!ok(e)) continue;
        const v = e.a === u ? e.b : e.a;
        const c = g[u] + e.len;
        if (c < g[v]) { g[v] = c; came[v] = id; open.push(v); }
      }
    }
    if (best < 0) return null;
    const path: number[] = [best];
    let u = best;
    while (came[u] >= 0) { const e = graph.edges[came[u]]; u = e.a === u ? e.b : e.a; path.push(u); }
    return path.reverse();
  }
  /** Points of edge e between arc lengths s0 and s1 (either order). */
  function along(e: { pts: number[]; cum: number[] }, s0: number, s1: number, out: Point[]) {
    const p = e.pts, c = e.cum, fwd = s1 >= s0;
    const at = (s: number) => {
      let k = 0;
      while (k < c.length - 2 && c[k + 1] < s) k++;
      const l = c[k + 1] - c[k] || 1, t = clamp((s - c[k]) / l, 0, 1);
      return { x: p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * t, z: p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * t };
    };
    out.push(at(s0));
    if (fwd) { for (let k = 1; k < c.length - 1; k++) if (c[k] > s0 && c[k] < s1) out.push({ x: p[k * 2], z: p[k * 2 + 1] }); }
    else for (let k = c.length - 2; k >= 1; k--) if (c[k] < s0 && c[k] > s1) out.push({ x: p[k * 2], z: p[k * 2 + 1] });
    out.push(at(s1));
  }
  return {
    /** The walking line from (fx, fz) to (tx, tz) for a mutant of `radius`: on-road points ending at the target, or [] if unreachable. */
    route(fx: number, fz: number, tx: number, tz: number, radius = 1): Point[] {
      const ok = fits(radius);
      const from = graph.nearestEdge(fx, fz, 80, ok), to = graph.nearestEdge(tx, tz, 80, ok);
      if (!from || !to) return [];
      const pts: Point[] = [];
      if (from.edge.id === to.edge.id) {
        along(from.edge, from.s, to.s, pts);
        pts.push({ x: tx, z: tz });
        return pts;
      }
      const fe = from.edge, te = to.edge;
      const key = `${fe.id}:${Math.round(from.s / 20)}>${te.id}:${Math.round(to.s / 20)}:${radius}`;
      let hit = cache.get(key);
      if (!hit || now() - hit.at > 3) {
        const goals = new Map<number, number>([[te.a, to.s], [te.b, te.len - to.s]]);
        hit = { at: now(), nodes: search([[fe.a, from.s], [fe.b, fe.len - from.s]], goals, radius) };
        cache.set(key, hit);
        if (cache.size > 256) cache.delete(cache.keys().next().value!);
      }
      const nodes = hit.nodes;
      if (!nodes) return [];
      const first = nodes[0], last = nodes[nodes.length - 1];
      along(fe, from.s, first === fe.a ? 0 : fe.len, pts);
      for (let k = 0; k + 1 < nodes.length; k++) {
        const u = nodes[k], v = nodes[k + 1];
        const e = graph.edges.find((x) => ok(x) && ((x.a === u && x.b === v) || (x.a === v && x.b === u)));
        if (!e) return [];
        along(e, e.a === u ? 0 : e.len, e.a === u ? e.len : 0, pts);
      }
      along(te, last === te.a ? 0 : te.len, to.s, pts);
      pts.push({ x: tx, z: tz });
      // Drop consecutive duplicates.
      return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05);
    },
    /** Total length of a route. */
    length(pts: readonly Point[]) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return l; },
  };
}

/**
 * Where a mutant may appear (§3.4): 45-80 m from the team's centroid, at least 35 m from every player, preferring
 * ruin spawn holes and road craters; on land, clear of buildings by radius + 0.5, within 8 m of a road edge it fits,
 * and with a route to a standing player. A centroid in the river or in a block falls back to the nearest such road
 * point. Deterministic in `rng`.
 */
export function mutantSpawnPoint(kind: MutantKind, opts: {
  players: readonly Point[]; graph: Pick<RoadGraph, 'edges' | 'nearestEdge'>; walkable(x: number, z: number): boolean; hard(x: number, z: number, r: number): boolean;
  route(fx: number, fz: number, tx: number, tz: number, radius: number): Point[]; holes?: readonly Point[]; rng: () => number; keepClear?: readonly { x: number; z: number; r: number }[];
}): Point | null {
  const r = MUTANT_SPEC[kind].radius, players = opts.players;
  if (!players.length) return null;
  const cx = players.reduce((s, p) => s + p.x, 0) / players.length, cz = players.reduce((s, p) => s + p.z, 0) / players.length;
  const fitsEdge = (e: { half: number; closed: boolean }) => !e.closed && e.half >= r + 0.5;
  const ok = (x: number, z: number, near: number) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d < near || d > 80) return false;
    if (players.some((p) => Math.hypot(p.x - x, p.z - z) < 35)) return false;
    if (opts.keepClear?.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) return false;
    if (!opts.walkable(x, z) || opts.hard(x, z, r + 0.5)) return false;
    const edge = opts.graph.nearestEdge(x, z, 8 + 40, fitsEdge);
    if (!edge || edge.d > 8 + edge.edge.half) return false;
    return opts.route(x, z, players[0].x, players[0].z, r).length > 0;
  };
  // Spawn holes first (rubble and craters in range), then points on fitting roads around the centroid.
  const holes = [...(opts.holes ?? [])].sort(() => opts.rng() - 0.5);
  for (const h of holes) if (ok(h.x, h.z, 45)) return { x: h.x, z: h.z };
  for (let attempt = 0; attempt < 160; attempt++) {
    const a = opts.rng() * Math.PI * 2, d = 45 + opts.rng() * 35;
    const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
    const e = opts.graph.nearestEdge(px, pz, 60, fitsEdge);
    if (!e) continue;
    // On the carriageway, a little off the centre line.
    const off = (opts.rng() - 0.5) * Math.max(0, e.edge.half - r) ;
    const x = e.x - e.hz * off, z = e.z + e.hx * off;
    if (ok(x, z, attempt < 120 ? 45 : 30)) return { x, z };
  }
  return null;
}

// ---- Ray tests -------------------------------------------------------------------------------------------------

/** Distance along a normalised ray to a capsule (a, b, radius r), or -1. */
function rayCapsule(o: THREE.Vector3, d: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z, oax = o.x - a.x, oay = o.y - a.y, oaz = o.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * d.x + bay * d.y + baz * d.z, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
    if (y > 0 && y < baba && t > 0) return t;
    const cx = y <= 0 ? oax : o.x - b.x, cy = y <= 0 ? oay : o.y - b.y, cz = y <= 0 ? oaz : o.z - b.z;
    const b2 = d.x * cx + d.y * cy + d.z * cz, c2 = cx * cx + cy * cy + cz * cz - r * r, h2 = b2 * b2 - c2;
    if (h2 > 0) { const t2 = -b2 - Math.sqrt(h2); if (t2 > 0) return t2; }
  }
  return -1;
}
function raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : -1;
}

// ---- The mutants ---------------------------------------------------------------------------------------------------

type Tell = { a: MutantAttack; start: number; impact: number; x: number; z: number; yaw: number; r: number; arc: number; tx: number; tz: number; ty: number; to: number; second: boolean; fromRoof: boolean; quiet: boolean };
type Mutant = {
  i: number; on: boolean; kind: MutantKind; look: MutantLook; dress: ZombieDress; seed: number; spec: (typeof MUTANT_SPEC)[MutantKind];
  x: number; z: number; y: number; yaw: number; pace: number; stride: number;
  hp: number; max: number; weak: number; weakHp: number[]; slow: number;
  phase: MPhase; phaseAt: number; phaseEnd: number;
  tell: Tell | null; cd: Partial<Record<MutantAttack, number>>;
  target: number; switchAt: number; thinkAt: number; hits: { key: number; amt: number; t: number }[];
  route: Point[]; routeAt: number; checkAt: number; checkD: number; reroutes: number;
  staggerLog: { t: number; amt: number }[]; staggerReady: number; enraged: boolean; roarNext: number; roarAt: number; broodAt: number; slamAt: number; climbHp: number;
  wall: { x: number; z: number; nx: number; nz: number; top: number } | null;
  /** A leap's flight; a pounce lands short of the marked spot (hx, hz), where its blow lands. */
  leap: { fx: number; fz: number; fy: number; tx: number; tz: number; ty: number; t0: number; dur: number; a: MutantAttack | null; hx?: number; hz?: number } | null;
  charge: { left: number; hit: number; next: number; lx: number; lz: number } | null;
  dyingAt: number; looted: boolean; by: number; lastHitDir: Point; climbAt: number; appliedAt: number;
  flags: number; prog: number; attack: AttackId | null;
  local: { a: AttackId; until: number; start: number; yaw: number } | null;
  stepped: number; idleAt: number; swell: number;
  // Drawing cache (world): body base and limb matrices, poses, head, weak spots and capsules for ray tests.
  base: THREE.Matrix4; frame: THREE.Matrix4; chest: THREE.Matrix4; arm: [THREE.Matrix4, THREE.Matrix4]; leg: [THREE.Matrix4, THREE.Matrix4];
  bodyPose: number[]; armPose: [number[], number[]]; legPose: [number[], number[]];
  head: THREE.Vector3; hip: THREE.Vector3; neck: THREE.Vector3; hand: [THREE.Vector3, THREE.Vector3]; shoulder: [THREE.Vector3, THREE.Vector3]; foot: [THREE.Vector3, THREE.Vector3];
  weakAt: THREE.Vector3[]; weakR: number[];
};

const KIND_INDEX = Object.fromEntries(MUTANT_KINDS.map((k, i) => [k, i])) as Record<MutantKind, number>;
const PHASE_INDEX = Object.fromEntries(MPHASES.map((p, i) => [p, i])) as Record<MPhase, number>;
const ATTACK_INDEX = Object.fromEntries(ATTACKS.map((a, i) => [a, i])) as Record<AttackId, number>;

export function createMutants(scene: THREE.Scene, world: MutantWorld, fx: HorrorFx | null, audio: HorrorAudio | null) {
  let authority: 'sim' | 'puppet' = 'sim';
  let seed = 7331;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const matrices = () => [new THREE.Matrix4(), new THREE.Matrix4()] as [THREE.Matrix4, THREE.Matrix4];
  const vectors = () => [new THREE.Vector3(), new THREE.Vector3()] as [THREE.Vector3, THREE.Vector3];
  const mutants: Mutant[] = Array.from({ length: MAX_MUTANTS }, (_, i) => ({
    i, on: false, kind: 'colossus', look: MUTANT_LOOKS.colossus, dress: mutantDress('colossus'), seed: 0, spec: MUTANT_SPEC.colossus,
    x: 0, z: 0, y: 0, yaw: 0, pace: 0, stride: 0, hp: 1, max: 1, weak: 0, weakHp: [], slow: 1,
    phase: 'idle', phaseAt: 0, phaseEnd: 0, tell: null, cd: {}, target: -1, switchAt: -99, thinkAt: 0, hits: [],
    route: [], routeAt: 0, checkAt: 0, checkD: Infinity, reroutes: 0, staggerLog: [], staggerReady: 0, enraged: false, roarNext: 0.75, roarAt: 0, broodAt: 0, slamAt: 0, climbHp: 0,
    wall: null, leap: null, charge: null, dyingAt: 0, looted: false, by: -1, lastHitDir: { x: 0, z: 1 }, climbAt: 0, appliedAt: 0, flags: 0, prog: 0, attack: null, local: null, stepped: 0, idleAt: 0, swell: 0,
    base: new THREE.Matrix4(), frame: new THREE.Matrix4(), chest: new THREE.Matrix4(), arm: matrices(), leg: matrices(),
    bodyPose: [0, 0, 0, 0], armPose: [[0, 0, 0, HAND.RELAXED], [0, 0, 0, HAND.RELAXED]], legPose: [[0, 0, 0, 0], [0, 0, 0, 0]],
    head: new THREE.Vector3(), hip: new THREE.Vector3(), neck: new THREE.Vector3(), hand: vectors(), shoulder: vectors(), foot: vectors(), weakAt: [], weakR: [],
  }));
  const views: MutantView[] = [];
  const pending: ZEvent[] = [];
  const smashed = new Set<number>();
  const shovedAt = new Map<number, number>();
  let projectileId = 1;
  let clock = 0;
  let lastTargets: readonly MutantTarget[] | null = null;
  const xraySize = new THREE.Vector2(), xrayP = new THREE.Vector3();

  // Four figure batches of the zombie variant at 'hi' (capacity 4 people, 8 legs), see-through around the player.
  const materials = { body: seeThrough(figureMaterial('body')), arm: seeThrough(figureMaterial('arm')), leg: seeThrough(figureMaterial('leg')) };
  const bodies = new FigureBatch(zombieGeometry('body', 'hi'), materials.body, MAX_MUTANTS);
  const armsL = new FigureBatch(zombieGeometry('armL', 'hi'), materials.arm, MAX_MUTANTS);
  const armsR = new FigureBatch(zombieGeometry('armR', 'hi'), materials.arm, MAX_MUTANTS);
  const legs = new FigureBatch(zombieGeometry('leg', 'hi'), materials.leg, MAX_MUTANTS * 2);
  const batches = [bodies, armsL, armsR, legs];
  for (const b of batches) { b.mesh.castShadow = false; b.mesh.receiveShadow = true; b.begin(); b.end(); scene.add(b.mesh); }
  let growthLevel = 1;

  const emit = (e: ZEvent) => { pending.push(e); if (authority === 'sim') present(e, clock); };
  const w = (m: Mutant) => MUTANT_ID_BASE + m.i;
  const setPhase = (m: Mutant, p: MPhase, time: number, len = 0) => { m.phase = p; m.phaseAt = time; m.phaseEnd = time + len; };

  // ---- Targets --------------------------------------------------------------------------------------------------

  /** Picks whom to hunt (every 0.5 s): recent damage dealt counts double, nearness counts, drivers less, dogs less (unless biting it or close); switches only for 1.3x and after 3 s. */
  function chooseTarget(m: Mutant, targets: readonly MutantTarget[], time: number) {
    m.thinkAt = time + 0.5;
    m.hits = m.hits.filter((h) => time - h.t < 8);
    let best = -1, bestScore = -Infinity, current = -Infinity;
    for (let k = 0; k < targets.length; k++) {
      const t = targets[k];
      if (t.down) continue;
      const d = Math.hypot(t.x - m.x, t.z - m.z);
      let score = 2 * m.hits.reduce((s, h) => s + (h.key === keyOf(t) ? h.amt : 0), 0) + 40 / (1 + d) - (t.inVehicle ? 10 : 0);
      if (t.dog && t.biting !== m.i && d > 4) score *= 0.4;
      if (keyOf(t) === m.target) current = score;
      if (score > bestScore) { bestScore = score; best = keyOf(t); }
    }
    if (best < 0) { m.target = -1; return; }
    if (m.target < 0 || current === -Infinity || (best !== m.target && bestScore > 1.3 * current && time - m.switchAt >= 3)) {
      if (best !== m.target) { m.target = best; m.switchAt = time; }
    }
  }
  const targetOf = (m: Mutant, targets: readonly MutantTarget[]) => targets.find((t) => keyOf(t) === m.target && !t.down) ?? null;
  /** Bit mask of the targets (players, then dogs) inside a test, grown by HIT_MARGIN. */
  function candidates(targets: readonly MutantTarget[], inside: (x: number, z: number, margin: number) => boolean) {
    let mask = 0;
    for (const t of targets) if (!t.down && inside(t.x, t.z, HIT_MARGIN)) mask |= bitOf(t);
    return mask;
  }
  const inCircle = (cx: number, cz: number, r: number) => (x: number, z: number, g: number) => Math.hypot(x - cx, z - cz) <= r + g;
  const inCone = (cx: number, cz: number, yaw: number, r: number, arc: number) => (x: number, z: number, g: number) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d > r + g) return false;
    if (d < g + 0.5) return true;
    return Math.abs(wrap(Math.atan2(x - cx, z - cz) - yaw)) <= arc / 2 + g / Math.max(d, 1);
  };
  const inLine = (cx: number, cz: number, yaw: number, len: number, half: number) => (x: number, z: number, g: number) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), dx = x - cx, dz = z - cz;
    const s = dx * fx + dz * fz, o = Math.abs(dx * fz - dz * fx);
    return s >= -g && s <= len + g && o <= half + g;
  };

  // ---- Telegraphs and hits --------------------------------------------------------------------------------------

  /** Starts an attack: the tell event (with its candidates and target point), the pose, the marker; the hit follows at `impact`. */
  function tell(m: Mutant, a: MutantAttack, time: number, targets: readonly MutantTarget[], victim: MutantTarget | null, at: { tx?: number; tz?: number; ty?: number; second?: boolean; fromRoof?: boolean; quiet?: boolean } = {}) {
    const spec = MUTANT_ATTACKS[a];
    const base = spec.tell / (a === 'swipe' || a === 'slam' ? m.slow : 1);
    const t = windupFor(base, m, victim);
    const yaw = victim ? Math.atan2(victim.x - m.x, victim.z - m.z) : m.yaw;
    m.yaw = a === 'roar' || a === 'brood' || a === 'deathburst' ? m.yaw : yaw;
    let r: number = 0, arc = 0, tx = m.x, tz = m.z, ty = 0, mask = 0;
    switch (a) {
      case 'swipe': r = MUTANT_ATTACKS.swipe.r; arc = MUTANT_ATTACKS.swipe.arc; mask = candidates(targets, inCone(m.x, m.z, yaw, r, arc)); break;
      case 'slash': r = MUTANT_ATTACKS.slash.r; arc = MUTANT_ATTACKS.slash.arc; mask = candidates(targets, inCone(m.x, m.z, yaw, r, arc)); break;
      case 'slam': r = MUTANT_ATTACKS.slam.r; mask = candidates(targets, inCircle(m.x, m.z, r)); break;
      case 'charge': r = MUTANT_ATTACKS.charge.r; arc = MUTANT_ATTACKS.charge.arc; mask = candidates(targets, inLine(m.x, m.z, yaw, r, arc)); break;
      case 'exhale': r = MUTANT_ATTACKS.exhale.r; arc = MUTANT_ATTACKS.exhale.arc; mask = candidates(targets, inCone(m.x, m.z, yaw, r, arc)); break;
      case 'deathburst': r = MUTANT_ATTACKS.deathburst.r; mask = candidates(targets, inCircle(m.x, m.z, MUTANT_ATTACKS.deathburst.cloudR)); break;
      case 'pounce': case 'throw': case 'bile': {
        // Where it lands: the victim's position led by its velocity (a sidestep after the tell still escapes).
        const lead = a === 'pounce' ? 0.25 : 0.4;
        tx = at.tx ?? (victim ? victim.x + victim.vx * lead : m.x + Math.sin(yaw) * 10);
        tz = at.tz ?? (victim ? victim.z + victim.vz * lead : m.z + Math.cos(yaw) * 10);
        ty = at.ty ?? world.ground(tx, tz);
        r = a === 'pounce' ? (at.fromRoof ? MUTANT_ATTACKS.pounce.dropR : MUTANT_ATTACKS.pounce.r) : a === 'throw' ? MUTANT_ATTACKS.throw.r : MUTANT_ATTACKS.bile.r;
        mask = candidates(targets, inCircle(tx, tz, r));
        break;
      }
      case 'roar': r = MUTANT_ATTACKS.roar.r; break;
      default:
    }
    m.tell = { a, start: time, impact: time + t, x: m.x, z: m.z, yaw, r, arc, tx, tz, ty, to: mask, second: !!at.second, fromRoof: !!at.fromRoof, quiet: !!at.quiet };
    m.attack = a;
    setPhase(m, 'tele', time, t);
    const e: ZEvent = { k: 'tele', w: w(m), a, x: q2(m.x), z: q2(m.z), yaw: q3(yaw), r: q2(r), arc: q3(arc), t: q2(t) };
    if (mask) e.to = mask;
    if (a === 'pounce' || a === 'throw' || a === 'bile') { e.tx = q2(tx); e.tz = q2(tz); }
    emit(e);
  }

  function hit(m: Mutant, a: MutantAttack, x: number, z: number, yaw: number, r: number, arc: number, dmg: number, kb: number, to: number) {
    if (!to) return;
    emit({ k: 'hit', w: w(m), a, x: q2(x), z: q2(z), yaw: q3(yaw), r: q2(r), arc: q3(arc), dmg: Math.min(MAX_MUTANT_HIT, Math.round(dmg)), kb: q2(kb), to });
  }

  /** The tell ran out: the blow lands (or the projectile leaves, the cloud spreads, the brood is born). */
  function resolve(m: Mutant, time: number, targets: readonly MutantTarget[], out: MutantOut) {
    const t = m.tell!;
    m.tell = null;
    const a = t.a;
    // Recheck candidates at impact: whoever is inside now (grown by the margin); the victims confirm themselves.
    switch (a) {
      case 'swipe': {
        hit(m, a, m.x, m.z, t.yaw, t.r, t.arc, MUTANT_ATTACKS.swipe.dmg, MUTANT_ATTACKS.swipe.kb, candidates(targets, inCone(m.x, m.z, t.yaw, t.r, t.arc)));
        setPhase(m, 'attack', time, 0.35); m.cd.swipe = time + MUTANT_ATTACKS.swipe.cd * (m.enraged ? 0.7 : 1);
        smashAround(m, m.x + Math.sin(t.yaw) * 2, m.z + Math.cos(t.yaw) * 2, 2.2, time);
        break;
      }
      case 'slash': {
        hit(m, a, m.x, m.z, t.yaw, t.r, t.arc, MUTANT_ATTACKS.slash.dmg, 0, candidates(targets, inCone(m.x, m.z, t.yaw, t.r, t.arc)));
        if (!t.second) {
          // The second slash, telegraphed again.
          const v = targetOf(m, targets);
          tell(m, 'slash', time, targets, v, { second: true });
          return;
        }
        setPhase(m, 'recover', time, 0.5); m.cd.slash = time + MUTANT_ATTACKS.slash.cd * (m.enraged ? 0.7 : 1);
        break;
      }
      case 'slam': {
        const s = MUTANT_ATTACKS.slam;
        hit(m, a, m.x, m.z, 0, s.r, 0, s.dmg, s.kb, candidates(targets, inCircle(m.x, m.z, s.r)));
        // Wrecks within 6 m are crushed flat away from it; cars are shoved.
        smashAround(m, m.x, m.z, 6, time);
        emit({ k: 'shove', x: q2(m.x), z: q2(m.z), r: 6, f: 9 });
        setPhase(m, 'attack', time, 0.6); m.slamAt = time; m.cd.slam = time + s.cd * (m.enraged ? 0.7 : 1);
        break;
      }
      case 'charge': {
        m.charge = { left: MUTANT_ATTACKS.charge.r, hit: 0, next: time, lx: m.x, lz: m.z };
        setPhase(m, 'run', time, 4);
        m.cd.charge = time + MUTANT_ATTACKS.charge.cd * (m.enraged ? 0.7 : 1);
        break;
      }
      case 'throw': case 'bile': {
        const s = a === 'throw' ? MUTANT_ATTACKS.throw : MUTANT_ATTACKS.bile;
        const h = m.spec.height * (a === 'throw' ? 0.95 : 0.78);
        const fx = m.x + Math.sin(t.yaw) * 1.2, fz = m.z + Math.cos(t.yaw) * 1.2, fy = world.ground(m.x, m.z) + h;
        const v = lobVelocity(fx, fy, fz, t.tx, t.ty, t.tz, a === 'throw' ? 3 : 4);
        emit({ k: 'proj', id: projectileId++ & 0xffff, w: w(m), a, x: q2(fx), y: q2(fy), z: q2(fz), vx: q2(v.vx), vy: q2(v.vy), vz: q2(v.vz), r: s.r, dmg: s.dmg });
        setPhase(m, 'attack', time, 0.4);
        m.cd[a] = time + s.cd * (m.enraged ? 0.7 : 1) * (a === 'bile' ? 1 + 0.2 * popped(m) : 1);
        break;
      }
      case 'exhale': {
        const s = MUTANT_ATTACKS.exhale;
        emit({ k: 'cloud', x: q2(m.x + Math.sin(t.yaw) * s.r * 0.5), z: q2(m.z + Math.cos(t.yaw) * s.r * 0.5), r: q2(s.r * 0.55), s: s.s, dps: s.dps });
        setPhase(m, 'attack', time, 0.8); m.cd.exhale = time + s.cd;
        break;
      }
      case 'brood': {
        const n = Math.max(0, 3 + Math.floor(random() * 3) - popped(m));
        for (let k = 0; k < n; k++) {
          const ang = random() * Math.PI * 2, d = 1.5 + random() * 2;
          out.spawns.push({ kind: 'crawler', x: m.x + Math.sin(ang) * d, z: m.z + Math.cos(ang) * d, how: 'brood' });
        }
        setPhase(m, 'attack', time, 0.6);
        m.broodAt = time + MUTANT_ATTACKS.brood.cd + 3 * popped(m);
        break;
      }
      case 'roar': {
        emit({ k: 'roar', w: w(m), x: q2(m.x), z: q2(m.z), r: MUTANT_ATTACKS.roar.r });
        m.roarAt = time;
        // The colossus calls six of the horde out of the rubble around it (never within 12 m of a player).
        if (m.kind === 'colossus' && !t.quiet) for (let k = 0; k < 6; k++) {
          const ang = random() * Math.PI * 2, d = 6 + random() * 8, x = m.x + Math.sin(ang) * d, z = m.z + Math.cos(ang) * d;
          if (targets.every((p) => p.dog || Math.hypot(p.x - x, p.z - z) >= 12) && !world.hard(x, z, 0.5)) out.spawns.push({ kind: 'walker', x, z, how: 'burst' });
        }
        setPhase(m, 'attack', time, 0.4);
        m.cd.roar = time + MUTANT_ATTACKS.roar.cd;
        break;
      }
      case 'pounce': {
        // The leap: from where it crouched (or the roof edge) to just short of the marked spot (the blow lands on the
        // mark; the body, long limbs and all, never comes down on top of the player).
        const fy = m.y, d = Math.hypot(t.tx - m.x, t.tz - m.z), back = d > 0.01 ? Math.min(m.spec.radius + 1, d * 0.5) / d : 0;
        const lx = t.tx - (t.tx - m.x) * back, lz = t.tz - (t.tz - m.z) * back;
        m.leap = { fx: m.x, fz: m.z, fy, tx: lx, tz: lz, ty: 0, t0: time, dur: clamp(d / 12, 0.45, 1.3) + (t.fromRoof ? 0.15 : 0), a: 'pounce', hx: t.tx, hz: t.tz };
        setPhase(m, 'leap', time, m.leap.dur);
        m.flags |= MF.AIR;
        m.cd.pounce = time + MUTANT_ATTACKS.pounce.cd * (m.enraged ? 0.7 : 1);
        if (t.fromRoof) m.wall = null;
        break;
      }
      case 'deathburst': {
        const s = MUTANT_ATTACKS.deathburst;
        hit(m, a, m.x, m.z, 0, s.r, 0, s.dmg, s.kb, candidates(targets, inCircle(m.x, m.z, s.r)));
        emit({ k: 'cloud', x: q2(m.x), z: q2(m.z), r: s.cloudR, s: s.cloudS, dps: s.dps });
        m.swell = 0;
        break;
      }
    }
  }
  const popped = (m: Mutant) => (m.kind === 'matriarch' ? 3 - bitCount(m.weak) : 0);
  const bitCount = (v: number) => { let n = 0; while (v) { n += v & 1; v >>= 1; } return n; };

  /** Crushes ruin wrecks (flat, away from the mutant) and shoves cars within r of (x, z). */
  function smashAround(m: Mutant, x: number, z: number, r: number, time: number) {
    world.smashables(x, z, r, (kind, id, px, pz) => {
      if (kind === 'ruin') {
        if (smashed.has(id)) return;
        smashed.add(id);
        const code = (Math.round(Math.atan2(px - m.x, pz - m.z) / (Math.PI / 4)) + 8) & 7;
        emit({ k: 'smash', ruin: id, code, x: q2(px), z: q2(pz) });
      } else {
        if ((shovedAt.get(id) ?? -99) > time - 1.5) return;
        shovedAt.set(id, time);
        emit({ k: 'shove', x: q2(px), z: q2(pz), r: 2.5, f: 7 });
      }
    });
  }

  // ---- Movement ----------------------------------------------------------------------------------------------

  /** Walks toward (tx, tz) at speed: straight while the fat ray is clear, else along its road route; slides along buildings. */
  function move(m: Mutant, tx: number, tz: number, speed: number, dt: number, time: number) {
    const r = m.spec.radius;
    let gx = tx, gz = tz;
    if (!world.castHard(m.x, m.z, tx, tz, r * 0.8)) {
      if (time > m.routeAt || !m.route.length) { m.route = world.route(m.x, m.z, tx, tz, r); m.routeAt = time + 3; }
      while (m.route.length > 1 && Math.hypot(m.route[0].x - m.x, m.route[0].z - m.z) < r + 0.8) m.route.shift();
      if (m.route.length) { gx = m.route[0].x; gz = m.route[0].z; }
    } else m.route.length = 0;
    let dx = gx - m.x, dz = gz - m.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { m.pace = 0; return; }
    dx /= d; dz /= d;
    const turn = Math.atan2(dx, dz);
    m.yaw += wrap(turn - m.yaw) * Math.min(1, dt * (m.kind === 'leaper' ? 8 : 2.5));
    const step = Math.min(d, speed * dt);
    const nx = m.x + dx * step, nz = m.z + dz * step;
    // Never onto a standing player: no step brings the body within radius + 0.5 of one (it strikes from there).
    if (crowds(m, nx, nz)) { m.pace = 0; return; }
    if (!world.hard(nx, nz, r * 0.75)) { m.x = nx; m.z = nz; }
    else if (!world.hard(nx, m.z, r * 0.75)) m.x = nx;
    else if (!world.hard(m.x, nz, r * 0.75)) m.z = nz;
    m.pace = speed;
    m.stride += dt * speed * (m.kind === 'colossus' ? 0.75 : m.kind === 'matriarch' ? 1.4 : 1.6);
    smashAround(m, m.x, m.z, r + 0.3, time);
  }

  /** True when a step to (x, z) would bring the body closer than radius + 0.5 to a standing player it is not already moving away from. */
  function crowds(m: Mutant, x: number, z: number) {
    const keep = m.spec.radius + 0.5;
    for (const t of lastTargets ?? []) {
      if (t.dog || t.down) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < keep && d < Math.hypot(t.x - m.x, t.z - m.z)) return true;
    }
    return false;
  }

  /**
   * Never stuck (§3.3): re-route after 4 s without 2 m of progress; after two failures warp unseen, or roar and break
   * away. With no road route at all and the straight line blocked, it checks every 2 s and counts each miss double (a
   * colossus no longer stands 12-16 s against a block), and the warp falls back to the straight line toward the target.
   */
  function antiStuck(m: Mutant, target: MutantTarget, players: readonly MutantTarget[], time: number, targets: readonly MutantTarget[]) {
    const d = Math.hypot(target.x - m.x, target.z - m.z);
    if (time < m.checkAt) return;
    const progressed = m.checkD - d >= 2 || d < m.spec.radius + 4;
    const routeless = !m.route.length && !world.castHard(m.x, m.z, target.x, target.z, m.spec.radius * 0.8);
    m.checkAt = time + (routeless ? 2 : 4);
    m.checkD = d;
    if (progressed) { m.reroutes = 0; return; }
    m.reroutes += routeless ? 2 : 1;
    m.routeAt = 0;
    if (m.reroutes < 3) return;
    m.reroutes = 0;
    const far = players.every((p) => Math.hypot(p.x - m.x, p.z - m.z) >= 30);
    if (far && !world.seenBy(m.x, m.z, m.spec.height * 0.5)) {
      // Warp along its route toward the target, to the furthest point still unseen and 30 m from every player.
      const unseen = (p: Point) => players.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 30) && !world.seenBy(p.x, p.z, m.spec.height * 0.5);
      const path = world.route(m.x, m.z, target.x, target.z, m.spec.radius);
      for (let k = path.length - 1; k >= 0; k--) {
        const p = path[k];
        if (unseen(p)) { m.x = p.x; m.z = p.z; m.route = []; return; }
      }
      // No road leads there: the furthest open, unseen spot on the straight line (past the block that stopped it).
      if (!path.length) for (let s = d - 30; s > 4; s -= 4) {
        const p = { x: m.x + ((target.x - m.x) / d) * s, z: m.z + ((target.z - m.z) / d) * s };
        if (unseen(p) && !world.hard(p.x, p.z, m.spec.radius)) { m.x = p.x; m.z = p.z; m.route = []; return; }
      }
      return;
    }
    // Seen: roar and break away from the wall (charge or leap), shedding facade dust.
    const wall = world.wallNear(m.x, m.z, m.spec.radius + 3);
    if (wall) { fx?.dust(wall.x, wall.z, time, 14); m.yaw = Math.atan2(wall.nx, wall.nz); }
    if (m.kind === 'colossus' && (m.cd.roar ?? 0) <= time) tell(m, 'roar', time, targets, null);
    else if (m.kind === 'leaper' && wall) {
      m.leap = { fx: m.x, fz: m.z, fy: m.y, tx: m.x + wall.nx * 8, tz: m.z + wall.nz * 8, ty: 0, t0: time, dur: 0.8, a: null };
      setPhase(m, 'leap', time, 0.8);
    }
  }

  // ---- Simulation per kind ---------------------------------------------------------------------------------------

  function simulate(m: Mutant, dt: number, time: number, targets: readonly MutantTarget[], out: MutantOut) {
    const players = targets.filter((t) => !t.dog);
    // Scripted states first.
    if (m.phase === 'dying') {
      if (m.kind === 'matriarch') { m.swell = Math.min(1, (time - m.dyingAt) / MUTANT_ATTACKS.deathburst.tell); if (m.tell && time >= m.tell.impact) resolve(m, time, targets, out); }
      if (time >= m.dyingAt + DEATH.dying) {
        setPhase(m, 'dead', time, DEATH.lie + DEATH.sink);
        if (!m.looted) { m.looted = true; emit({ k: 'loot', x: q2(m.x), z: q2(m.z), kind: m.kind }); }
      }
      return;
    }
    if (m.phase === 'dead') { if (time >= m.phaseEnd) off(m); return; }
    if (m.phase === 'emerge') {
      // Up out of the rubble or crater, or down off the roof edge; then the roar.
      m.y = m.y > 0 ? Math.max(0, m.y - dt * 12) : Math.min(0, m.y + dt * m.spec.height / 1.8);
      if (time >= m.phaseEnd) { m.y = 0; if (m.kind === 'leaper') { audio?.drop(m.x, m.z); fx?.dust(m.x, m.z, time, 16); } tell(m, 'roar', time, targets, null, { quiet: true }); }
      return;
    }
    if (m.phase === 'stagger' || m.phase === 'recover' || m.phase === 'attack') {
      if (time >= m.phaseEnd) { m.flags &= ~(MF.STAGGER | MF.EXPOSED); setPhase(m, m.wall ? 'roof' : 'idle', time); }
      m.pace = 0;
      return;
    }
    if (m.phase === 'tele') {
      // The tell holds its pose; a victim that moved is the victim's luck.
      if (time >= m.tell!.impact) resolve(m, time, targets, out);
      return;
    }
    if (m.phase === 'leap' && m.leap) {
      const l = m.leap, k = clamp((time - l.t0) / l.dur, 0, 1);
      m.x = lerp(l.fx, l.tx, k); m.z = lerp(l.fz, l.tz, k);
      m.y = lerp(l.fy, l.ty, k) + Math.sin(k * Math.PI) * (2 + Math.hypot(l.tx - l.fx, l.tz - l.fz) * 0.12);
      m.yaw = Math.atan2(l.tx - l.fx, l.tz - l.fz) || m.yaw;
      if (k >= 1) {
        m.y = 0; m.leap = null; m.flags &= ~MF.AIR;
        audio?.drop(m.x, m.z); fx?.dust(m.x, m.z, time, 16);
        if (l.a === 'pounce') {
          const fromRoof = l.fy > 1.5, s = MUTANT_ATTACKS.pounce, r = fromRoof ? s.dropR : s.r, hx = l.hx ?? m.x, hz = l.hz ?? m.z;
          hit(m, 'pounce', hx, hz, m.yaw, r, 0, fromRoof ? s.drop : s.dmg, s.kb, candidates(targets, inCircle(hx, hz, r)));
          // Landed: the spine sac shows for a second.
          setPhase(m, 'recover', time, 1.0); m.flags |= MF.EXPOSED;
        } else setPhase(m, 'idle', time);
      }
      return;
    }
    if (m.charge) { runCharge(m, dt, time, targets); return; }
    if (m.kind === 'leaper' && (m.phase === 'climb' || m.phase === 'roof')) { leaperHigh(m, dt, time, targets, out); return; }

    if (time >= m.thinkAt) chooseTarget(m, targets, time);
    const target = targetOf(m, targets);
    if (m.enraged === false && m.hp < m.max * 0.3) { m.enraged = true; m.flags |= MF.ENRAGED; }
    // Roars at 75/50/25% HP and every 25 s (colossus and matriarch; the leaper screeches as it climbs).
    if (m.kind !== 'leaper' && (m.hp <= m.max * m.roarNext || ((m.cd.roar ?? 0) <= time && time - m.roarAt > MUTANT_ATTACKS.roar.cd && target))) {
      while (m.roarNext > 0.2 && m.hp <= m.max * m.roarNext) m.roarNext -= 0.25;
      tell(m, 'roar', time, targets, null);
      return;
    }
    if (!target) { m.pace = 0; m.stride += dt * 0.2; return; }
    const d = Math.hypot(target.x - m.x, target.z - m.z);
    const facing = Math.abs(wrap(Math.atan2(target.x - m.x, target.z - m.z) - m.yaw));
    const ready = (a: MutantAttack) => (m.cd[a] ?? 0) <= time;
    const speedK = m.enraged ? 1.2 : 1;
    switch (m.kind) {
      case 'colossus': {
        const near = targets.filter((t) => !t.down && Math.hypot(t.x - m.x, t.z - m.z) <= MUTANT_ATTACKS.slam.r).length;
        if (ready('slam') && (near >= 2 || (d < 5 && time - m.slamAt > 12))) { tell(m, 'slam', time, targets, target); return; }
        if (ready('swipe') && d <= MUTANT_ATTACKS.swipe.r + 0.4 && (facing < 1.0 || d < 1.5)) { tell(m, 'swipe', time, targets, target); return; }
        if (ready('charge') && d >= 10 && d <= 30 && world.castHard(m.x, m.z, target.x, target.z, MUTANT_ATTACKS.charge.arc)) { tell(m, 'charge', time, targets, target); return; }
        if (ready('throw') && d >= 12 && d <= 35) {
          let piece: Point | null = null;
          world.smashables(m.x, m.z, 4, (kind, id, x, z) => { if (!piece && kind === 'ruin' && !smashed.has(id)) { piece = { x, z }; smashed.add(id); emit({ k: 'smash', ruin: id, code: RUIN_THROWN, x: q2(x), z: q2(z) }); } });
          if (piece) { tell(m, 'throw', time, targets, target); return; }
          m.cd.throw = time + 2;
        }
        if (d > MUTANT_ATTACKS.swipe.r - 0.6) move(m, target.x, target.z, m.spec.walk * speedK, dt, time); else { m.pace = 0; m.yaw += wrap(Math.atan2(target.x - m.x, target.z - m.z) - m.yaw) * Math.min(1, dt * 3); }
        break;
      }
      case 'leaper': {
        if (ready('slash') && d <= MUTANT_ATTACKS.slash.r && (facing < 1.2 || d < 1.2)) { tell(m, 'slash', time, targets, target); return; }
        if (ready('pounce') && d >= 6 && d <= 18 && world.castHard(m.x, m.z, target.x, target.z, 0.6)) { m.flags |= MF.EXPOSED; tell(m, 'pounce', time, targets, target); return; }
        // Climb over the block when the road goes the long way round, or to get away when hurt.
        const hurt = m.climbHp - m.hp >= m.max * 0.3;
        if (time >= m.climbAt && (hurt || (m.route.length > 0 && routeLength(m) >= 1.6 * d && d > 20))) {
          m.climbAt = time + 6;
          const wall = world.wallNear(m.x, m.z, 14);
          if (wall && wall.top > 3) { m.wall = wall; m.climbHp = m.hp; setPhase(m, 'climb', time); m.flags |= MF.WALL | MF.EXPOSED; return; }
        }
        // Up to striking distance, never onto its prey: it waits there, facing it, for the next slash or pounce.
        if (d > m.spec.radius + 1) move(m, target.x, target.z, (d > 8 ? m.spec.run : m.spec.walk) * speedK, dt, time);
        else { m.pace = 0; m.yaw += wrap(Math.atan2(target.x - m.x, target.z - m.z) - m.yaw) * Math.min(1, dt * 8); }
        break;
      }
      case 'matriarch': {
        if (ready('exhale') && d <= 6) { tell(m, 'exhale', time, targets, target); return; }
        if (time >= m.broodAt) { tell(m, 'brood', time, targets, null); return; }
        if (ready('bile') && d >= 8 && d <= 30 && world.sight(m.x, m.z, target.x, target.z)) { tell(m, 'bile', time, targets, target); return; }
        // It keeps to 12-20 m, behind its brood, and never runs; from beyond its bile's 30 m it lumbers faster (its
        // boss wave would otherwise be a minute of boss bar and no boss).
        if (d > 18) move(m, target.x, target.z, m.spec.walk * (d > 30 ? 1.7 : 1) * speedK, dt, time);
        else { m.pace = 0; m.yaw += wrap(Math.atan2(target.x - m.x, target.z - m.z) - m.yaw) * Math.min(1, dt * 1.5); }
        break;
      }
    }
    if (m.pace > 0) antiStuck(m, target, players, time, targets);
    else { m.checkAt = time + 4; m.checkD = d; }
  }
  const routeLength = (m: Mutant) => { let l = Math.hypot(m.route[0].x - m.x, m.route[0].z - m.z); for (let k = 1; k < m.route.length; k++) l += Math.hypot(m.route[k].x - m.route[k - 1].x, m.route[k].z - m.route[k - 1].z); return l; };

  /** The colossus' charge: 9 m/s down the line, hitting whoever is in its 2.4 m path once, shoving cars; a stumble at the end. */
  function runCharge(m: Mutant, dt: number, time: number, targets: readonly MutantTarget[]) {
    const c = m.charge!, s = MUTANT_ATTACKS.charge;
    const step = Math.min(c.left, s.speed * dt), fxv = Math.sin(m.yaw), fzv = Math.cos(m.yaw);
    const nx = m.x + fxv * step, nz = m.z + fzv * step;
    const blocked = world.hard(nx, nz, m.spec.radius * 0.7);
    if (!blocked) { m.x = nx; m.z = nz; c.left -= step; }
    m.pace = s.speed; m.stride += dt * s.speed * 0.6;
    smashAround(m, m.x, m.z, m.spec.radius + 0.6, time);
    if (time >= c.next) {
      c.next = time + 0.2;
      // The stretch covered since the last check plus the body ahead: whoever is in it and not hit yet this charge.
      const len = Math.hypot(m.x - c.lx, m.z - c.lz) + m.spec.radius + 1;
      const mask = candidates(targets, inLine(c.lx, c.lz, m.yaw, len, s.arc)) & ~c.hit;
      if (mask) { hit(m, 'charge', c.lx, c.lz, m.yaw, len, s.arc, s.dmg, s.kb, mask); c.hit |= mask; }
      c.lx = m.x; c.lz = m.z;
    }
    if (c.left <= 0.01 || blocked) {
      m.charge = null;
      if (blocked) { fx?.dust(nx, nz, time, 20); audio?.drop(nx, nz); }
      // The stumble: the weak point is exposed (x3) for 1.2 s.
      setPhase(m, 'recover', time, 1.2); m.flags |= MF.EXPOSED;
    }
  }

  /** The leaper on a facade or the roofs: climbs at 4 m/s, screeches for runners, runs over the roofs, drops on its prey. */
  function leaperHigh(m: Mutant, dt: number, time: number, targets: readonly MutantTarget[], out: MutantOut) {
    const wall = m.wall!;
    if (time >= m.thinkAt) chooseTarget(m, targets, time);
    const target = targetOf(m, targets);
    if (m.phase === 'climb') {
      // To the foot of the wall, then up it.
      const fx0 = wall.x + wall.nx * (m.spec.radius * 0.6), fz0 = wall.z + wall.nz * (m.spec.radius * 0.6);
      if (Math.hypot(fx0 - m.x, fz0 - m.z) > 0.4 && m.y < 0.1) {
        // Straight to the foot of the wall (it is next to the building, where routes and fat rays give up).
        const dx = fx0 - m.x, dz = fz0 - m.z, d = Math.hypot(dx, dz), step = Math.min(d, m.spec.run * dt);
        m.x += (dx / d) * step; m.z += (dz / d) * step; m.yaw = Math.atan2(dx, dz); m.pace = m.spec.run; m.stride += step * 1.6;
        if (time - m.phaseAt > 8) { m.wall = null; m.flags &= ~(MF.WALL | MF.EXPOSED); setPhase(m, 'idle', time); }
        return;
      }
      m.x = fx0; m.z = fz0; m.yaw = Math.atan2(-wall.nx, -wall.nz);
      m.y += m.spec.climb * dt; m.pace = m.spec.climb; m.stride += dt * 6;
      if (m.y >= wall.top) {
        // Over the edge onto the roof, and a screech that calls four runners.
        m.y = wall.top; m.x -= wall.nx * 1.6; m.z -= wall.nz * 1.6;
        setPhase(m, 'roof', time); m.flags = (m.flags & ~MF.WALL) | MF.EXPOSED;
        audio?.voice('leaper', 'alert', m.x, m.z, 1.4);
        for (let k = 0; k < 4; k++) {
          const ang = random() * Math.PI * 2, d = 8 + random() * 8, x = m.x + wall.nx * 6 + Math.sin(ang) * d, z = m.z + wall.nz * 6 + Math.cos(ang) * d;
          if (targets.every((p) => p.dog || Math.hypot(p.x - x, p.z - z) >= 12) && !world.hard(x, z, 0.5)) out.spawns.push({ kind: 'runner', x, z, how: 'burst' });
        }
      }
      return;
    }
    // On the roofs: run toward the prey; at an edge above it within 10 m, the drop.
    if (!target) { m.pace = 0; return; }
    const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz);
    const step = m.spec.run * 0.8 * dt, nx = m.x + (dx / d) * step, nz = m.z + (dz / d) * step;
    const roof = world.roofAt(nx, nz);
    m.yaw += wrap(Math.atan2(dx, dz) - m.yaw) * Math.min(1, dt * 8);
    if (roof !== null && d > 4) { m.x = nx; m.z = nz; m.y = roof; m.pace = m.spec.run * 0.8; m.stride += dt * m.pace * 1.6; return; }
    m.pace = 0;
    if (d <= 10 + m.y * 0.5 && (m.cd.pounce ?? 0) <= time) {
      tell(m, 'pounce', time, targets, target, { fromRoof: true });
      return;
    }
    // No prey below: drop off the edge where no player is within 10 m.
    if (targets.every((p) => p.dog || Math.hypot(p.x - nx, p.z - nz) >= 10)) {
      m.leap = { fx: m.x, fz: m.z, fy: m.y, tx: nx + (dx / d) * 2, tz: nz + (dz / d) * 2, ty: 0, t0: time, dur: 0.7, a: null };
      m.wall = null; m.flags &= ~(MF.WALL | MF.EXPOSED);
      setPhase(m, 'leap', time, 0.7);
    }
  }

  function off(m: Mutant) {
    m.on = false; m.tell = null; m.charge = null; m.leap = null; m.wall = null; m.local = null;
  }

  // ---- Death ------------------------------------------------------------------------------------------------------

  function die(m: Mutant, by: number, wp: number, weakKill: boolean, from: Point, force: number, time: number, targets: readonly MutantTarget[] | null) {
    m.hp = 0; m.tell = null; m.charge = null; m.leap = null; m.local = null;
    m.flags &= ~(MF.EXPOSED | MF.WALL | MF.AIR);
    setPhase(m, 'dying', time, DEATH.dying);
    m.dyingAt = time; m.by = by; m.looted = false;
    const dx = m.x - from.x, dz = m.z - from.z, l = Math.hypot(dx, dz) || 1;
    m.lastHitDir = { x: dx / l, z: dz / l };
    const e: ZEvent = { k: 'kill', w: w(m), kind: m.kind, by, wp, dx: q3(dx / l), dz: q3(dz / l), f: q2(force) };
    if (weakKill) e.weak = 1;
    emit(e);
    // The matriarch swells for 1.5 s and bursts (telegraphed like any attack).
    if (m.kind === 'matriarch') {
      tell(m, 'deathburst', time, targets ?? [], null);
      setPhase(m, 'dying', time, DEATH.dying);
    }
    // A leaper on a wall or a roof falls from where it is.
    audio?.voice(m.kind, 'die', m.x, m.z, 1.5);
  }

  // ---- Puppets and presentation -----------------------------------------------------------------------------------

  /** What every client shows for an event (the host for its own, the others from the stream): markers, sounds, dust. */
  function present(e: ZEvent, now: number) {
    switch (e.k) {
      case 'tele': {
        const t = e.t, a = e.a as MutantAttack;
        const color = a === 'bile' || a === 'exhale' || a === 'deathburst' ? '#9cd64a' : '#ff5a2a';
        if (a === 'swipe' || a === 'slash' || a === 'exhale') fx?.marker('cone', e.x, e.z, e.r, e.yaw, e.arc, now, now + t, color);
        else if (a === 'slam' || a === 'deathburst') fx?.marker('ring', e.x, e.z, a === 'deathburst' ? MUTANT_ATTACKS.deathburst.cloudR : e.r, 0, 0, now, now + t, color);
        else if (a === 'charge') fx?.marker('line', e.x, e.z, e.r, e.yaw, e.arc, now, now + t + e.r / MUTANT_ATTACKS.charge.speed, color);
        else if ((a === 'pounce' || a === 'throw' || a === 'bile') && e.tx !== undefined && e.tz !== undefined) {
          const flight = a === 'pounce' ? clamp(Math.hypot(e.tx - e.x, e.tz - e.z) / 12, 0.45, 1.3) : 1.3;
          fx?.marker('circle', e.tx, e.tz, e.r, 0, 0, now, now + t + flight, a === 'pounce' ? '#3a0d0a' : color);
        }
        audio?.tell(e.a, e.x, e.z);
        if (a === 'roar') audio?.duck(0.9);
        break;
      }
      case 'hit': {
        const who = mutants[e.w - MUTANT_ID_BASE];
        if (e.a === 'slam') { fx?.crack(e.x, e.z, e.r, now); fx?.dust(e.x, e.z, now, 24); audio?.drop(e.x, e.z); }
        else if (e.a === 'deathburst') { fx?.shock(e.x, e.z, e.r, now); audio?.burst(e.x, e.z); }
        else if (who) audio?.voice(who.kind, 'attack', e.x, e.z, 0.8);
        break;
      }
      case 'proj': fx?.projectile(e.id, e.a, e.x, e.y, e.z, e.vx, e.vy, e.vz, now); break;
      case 'cloud': fx?.cloud(e.x, e.z, e.r, now + e.s, 'toxic'); break;
      case 'roar': audio?.roar(e.x, e.z, true); fx?.dust(e.x, e.z, now, 10); break;
      case 'smash': fx?.dust(e.x, e.z, now, e.code === RUIN_THROWN ? 6 : 12); break;
      case 'shove': fx?.dust(e.x, e.z, now, 4); break;
      case 'spawn': if (e.w >= MUTANT_ID_BASE) { fx?.dust(e.x, e.z, now, 30); fx?.shock(e.x, e.z, 6, now); } break;
      default:
    }
  }

  // ---- Drawing -------------------------------------------------------------------------------------------------

  const hips = new THREE.Matrix4(), uni = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), growM = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), turnQ = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3(), euler = new THREE.Euler();
  const pivot = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), v2 = new THREE.Vector3(), gq = new THREE.Quaternion(), gs = new THREE.Vector3();
  const walk = newGait(), tw = newTwitch();
  const armL: number[] = [0, 0, 0, 0, 0, 0, 0], armR: number[] = [0, 0, 0, 0, 0, 0, 0];
  const set = (out: number[], s: number, ab: number, roll: number, el: number, twist: number, flex: number, hand: number) => { out[0] = s; out[1] = ab; out[2] = roll; out[3] = el; out[4] = twist; out[5] = flex; out[6] = hand; return out; };

  /** The phase and attack a client shows: a tell received ahead of the snapshot wins until it runs out. */
  function shown(m: Mutant, time: number): { phase: MPhase; attack: AttackId | null; k: number } {
    if (authority === 'puppet' && m.local && time < m.local.until && m.phase !== 'dying' && m.phase !== 'dead') return { phase: 'tele', attack: m.local.a, k: clamp((time - m.local.start) / Math.max(0.05, m.local.until - m.local.start), 0, 1) };
    if (m.phase === 'tele' && m.tell) return { phase: 'tele', attack: m.tell.a, k: clamp((time - m.tell.start) / Math.max(0.05, m.tell.impact - m.tell.start), 0, 1) };
    const k = m.phaseEnd > m.phaseAt ? clamp((time - m.phaseAt) / (m.phaseEnd - m.phaseAt), 0, 1) : authority === 'puppet' ? m.prog / 255 : 0;
    return { phase: m.phase, attack: m.attack, k };
  }

  /** Joint angles of a mutant this frame (pure in its state and time; the A13 bend limits applied). */
  function poseOf(m: Mutant, time: number) {
    const L = m.look, s = shown(m, time), a = s.attack, k = s.k;
    const go = clamp(m.pace / (m.kind === 'colossus' ? 2.2 : m.kind === 'matriarch' ? 1.4 : 3), 0, 1);
    const run = m.kind === 'leaper' ? clamp((m.pace - 3) / 4.5, 0, 1) : m.charge ? 0.6 : 0;
    const g = gait(m.stride, run, go, walk);
    twitch(m.seed, time, m.kind, m.target >= 0 ? 1 : 0.3, tw);
    const sw = Math.sin(m.stride);
    let lean = L.lean, tilt = L.tilt + sw * 0.05 * go, headYaw = tw.headYaw * 0.6, headPitch = -L.lean * 0.7 + tw.headPitch * 0.5, twist = g.chest * 0.6, scaleY = 1, sink = 0;
    let thighL = g.thighL, thighR = g.thighR, kneeL = g.kneeL, kneeR = g.kneeR, ankleL = g.ankleL, ankleR = g.ankleR;
    const legOut = m.kind === 'matriarch' ? 0.18 : m.kind === 'colossus' ? 0.1 : 0.05;
    if (m.kind === 'colossus') {
      // The club arm drags along the ground; the withered left is folded to the chest.
      set(armR, -0.3 + sw * 0.12 * go, 0.25, 0.1, -0.25, 0.4, 0.2, HAND.FIST);
      set(armL, -0.7 + tw.armL, 0.08, -0.7, -1.55, 0.6, 0.6, HAND.CLAW);
      if (s.phase === 'tele' && a === 'swipe') { set(armR, lerp(-0.3, 1.1, smooth(0, 0.6, k)), lerp(0.25, 0.8, k), -0.3, -0.35, 0, 0, HAND.FIST); twist = -0.5 * k; lean = L.lean + 0.1; }
      else if (s.phase === 'attack' && a === 'swipe') { set(armR, -1.3, 0.3, 0.8, -0.2, 0, 0, HAND.FIST); twist = 0.6; }
      else if (s.phase === 'tele' && a === 'slam') { set(armR, lerp(-0.3, -2.9, smooth(0, 0.7, k)), 0.2, 0, -0.3, 0, 0, HAND.FIST); set(armL, -2.4 * k, 0.3, 0, -0.9, 0, 0, HAND.CLAW); lean = lerp(L.lean, -0.15, k); headPitch = -0.6; }
      else if (s.phase === 'attack' && a === 'slam') { set(armR, -0.75, 0.2, 0, -0.1, 0, 0, HAND.FIST); set(armL, -0.9, 0.3, 0, -0.5, 0, 0, HAND.CLAW); lean = 1.0; sink = 0.08; }
      else if ((s.phase === 'tele' && a === 'charge') || m.charge) { lean = 0.9; headPitch = -0.9; set(armR, -0.9 + sw * 0.4, 0.3, 0, -0.3, 0, 0, HAND.FIST); }
      else if (s.phase === 'tele' && a === 'throw') { set(armR, lerp(-0.6, -2.7, smooth(0.3, 1, k)), 0.15, 0, -0.4, 0, 0, HAND.GRIP); lean = lerp(1.0, 0.1, smooth(0.2, 1, k)); }
      else if (s.phase === 'recover' && m.flags & MF.EXPOSED) { lean = 1.1; set(armR, -1.1, 0.4, 0, -0.1, 0, 0, HAND.OPEN); set(armL, -1.2, 0.3, 0, -0.3, 0, 0, HAND.OPEN); headPitch = -0.3; }
    } else if (m.kind === 'leaper') {
      // On all fours: the long arms are the front legs, hands planted ahead.
      set(armL, -1.0 + g.thighR * 0.9, 0.22, 0, -0.35, 0.3, -0.6, HAND.CLAW);
      set(armR, -1.0 + g.thighL * 0.9, 0.22, 0, -0.35, 0.3, -0.6, HAND.CLAW);
      thighL = -1.45 + g.thighL * 0.7; thighR = -1.45 + g.thighR * 0.7; kneeL = 2.1 + g.kneeL * 0.3; kneeR = 2.1 + g.kneeR * 0.3; ankleL = ankleR = 0.6;
      sink = 0.62; headPitch = -1.0 + tw.headPitch * 0.4; headYaw = tw.headYaw;
      if (s.phase === 'tele' && a === 'pounce') { sink = 0.85; lean = 1.4; set(armL, -0.7, 0.3, 0, -0.5, 0, -0.8, HAND.CLAW); set(armR, -0.7, 0.3, 0, -0.5, 0, -0.8, HAND.CLAW); headPitch = -1.2; }
      else if (s.phase === 'leap') { lean = 0.55; sink = 0.2; set(armL, -2.5, 0.35, 0, -0.2, 0, -0.4, HAND.CLAW); set(armR, -2.5, 0.35, 0, -0.2, 0, -0.4, HAND.CLAW); thighL = thighR = 0.5; kneeL = kneeR = 0.4; }
      else if (s.phase === 'tele' && a === 'slash') { lean = lerp(L.lean, 0.35, k); sink = lerp(0.62, 0.2, k); set(armL, -2.7, 0.4, 0, -0.45, 0, -0.5, HAND.CLAW); set(armR, -2.6, 0.4, 0, -0.45, 0, -0.5, HAND.CLAW); thighL = thighR = -0.6; kneeL = kneeR = 1.0; }
      else if (s.phase === 'climb') { lean = 0.15; sink = 0; set(armL, -2.8 + Math.sin(m.stride) * 0.4, 0.3, 0, -0.4, 0, -0.5, HAND.CLAW); set(armR, -2.8 - Math.sin(m.stride) * 0.4, 0.3, 0, -0.4, 0, -0.5, HAND.CLAW); thighL = -0.9 + Math.sin(m.stride) * 0.5; thighR = -0.9 - Math.sin(m.stride) * 0.5; kneeL = kneeR = 1.4; headPitch = -0.4; }
    } else {
      // The matriarch: short arms held off the swollen belly, a wide waddle.
      set(armL, -0.35 + g.armL * 0.3, 0.55, 0, -0.4, 0.2, 0.3, HAND.CLAW);
      set(armR, -0.35 + g.armR * 0.3, 0.55, 0, -0.4, 0.2, 0.3, HAND.CLAW);
      scaleY = 1 + 0.02 * Math.sin(time * 3.1 + m.seed);
      if (s.phase === 'tele' && a === 'bile') { headPitch = lerp(0, -0.7, k); lean = -0.1; }
      else if (s.phase === 'attack' && a === 'bile') { headPitch = 0.3; lean = 0.3; }
      else if (s.phase === 'tele' && a === 'exhale') { headPitch = 0.35; lean = 0.35; set(armL, -0.2, 0.9, 0, -0.3, 0, 0, HAND.OPEN); set(armR, -0.2, 0.9, 0, -0.3, 0, 0, HAND.OPEN); }
      else if (s.phase === 'tele' && a === 'brood') { scaleY = 1 + 0.06 * Math.sin(time * 22) * k; lean = 0.25; }
      if (m.phase === 'dying' && m.kind === 'matriarch') scaleY = 1 + 0.15 * Math.min(1, m.swell) - (time - m.dyingAt > 1.6 ? 0.25 : 0);
    }
    if (s.phase === 'roar' || (s.phase === 'tele' && a === 'roar')) {
      headPitch = -0.9; headYaw = Math.sin(time * 11) * 0.08;
      if (m.kind !== 'leaper') { lean = 0.05; armL[0] = -0.9; armL[1] = 1.0; armR[0] = m.kind === 'colossus' ? -0.6 : -0.9; armR[1] = 1.0; }
    }
    if (s.phase === 'stagger') { lean = L.lean - 0.4; headPitch = 0.3; armL[0] -= 0.6; armR[0] -= 0.6; }
    if (s.phase === 'emerge') { lean = L.lean + 0.3; headPitch = -0.5; armL[0] = -2.5 + Math.sin(time * 7) * 0.3; armR[0] = -2.4 + Math.cos(time * 6) * 0.3; }
    if (s.phase === 'dying' || s.phase === 'dead') {
      // Scripted deaths: the colossus kneels, slams and topples; the leaper curls up; the matriarch collapses.
      const t = s.phase === 'dead' ? 1 : clamp((time - m.dyingAt) / DEATH.dying, 0, 1);
      if (m.kind === 'colossus') { thighL = thighR = -1.4 * smooth(0, 0.35, t); kneeL = kneeR = 2.4 * smooth(0, 0.35, t); sink = 0.42 * smooth(0, 0.35, t); lean = lerp(0.6, 1.55, smooth(0.55, 1, t)); armR[0] = t < 0.5 ? -2.8 * smooth(0.2, 0.4, t) : -0.6; }
      else if (m.kind === 'leaper') { lean = lerp(1.25, 1.5, t); sink = lerp(0.62, 0.8, t); armL[0] = armR[0] = -0.4; armL[3] = armR[3] = -0.5; }
      else { lean = lerp(0.15, 1.45, smooth(0.6, 1, t)); thighL = thighR = -1.2 * smooth(0.6, 0.9, t); kneeL = kneeR = 2.2 * smooth(0.6, 0.9, t); sink = 0.3 * smooth(0.6, 0.9, t); }
      headYaw = 0; tw.freeze = false;
    }
    if (s.phase !== 'tele') { armL[0] += tw.armL; armR[0] += tw.armR; tilt += tw.tilt; }
    // A13: bends limited on limbs scaled out of proportion.
    const elL = bendLimit(L.armL), elR = bendLimit(L.armR), knL = bendLimit(L.legL), knR = bendLimit(L.legR);
    armL[3] = Math.max(-elL, armL[3]); armR[3] = Math.max(-elR, armR[3]);
    kneeL = Math.min(knL, kneeL); kneeR = Math.min(knR, kneeR);
    return { lean, tilt, headYaw, headPitch, twist, scaleY, sink, thighL, thighR, kneeL, kneeR, ankleL, ankleR, legOut, toeL: g.toeL, toeR: g.toeR };
  }

  function draw(m: Mutant, time: number) {
    const L = m.look, p = m.dress.palettes, S = L.scale, W = L.width;
    const P = poseOf(m, time);
    const sy = S * P.scaleY, sx = S * W;
    const deadSink = m.phase === 'dead' && m.phaseEnd - time < DEATH.sink ? (1 - (m.phaseEnd - time) / DEATH.sink) * m.spec.height * 0.6 : 0;
    const emergeSink = m.phase === 'emerge' && m.y < 0 ? -m.y : 0;
    const feet = world.ground(m.x, m.z) + Math.max(0, m.y) - emergeSink - deadSink - P.sink * FIGURE.hipY * sy;
    // The body: hunched about the hip pivot, width on x and z; limbs hang from a uniformly scaled frame (no shear).
    euler.set(P.lean, m.yaw, P.tilt, 'YXZ');
    quat.setFromEuler(euler);
    const hip = FIGURE.hipY * sy;
    pivot.set(0, hip, 0).applyQuaternion(quat);
    pos.set(m.x, feet + hip, m.z).sub(pivot);
    m.base.compose(pos, quat, size.set(sx, sy, sx));
    uni.compose(pos, quat, size.set(sy, sy, sy));
    m.frame.copy(uni);
    m.chest.multiplyMatrices(uni, tmpM.makeRotationY(P.twist));
    m.bodyPose[0] = P.headYaw; m.bodyPose[1] = P.headPitch; m.bodyPose[2] = P.twist; m.bodyPose[3] = swingCode(0.1, 0.25 + 0.2 * Math.sin(time * 1.3));
    bodies.push(m.base, p.body, m.bodyPose);
    // Arms: shoulders at the widened chest's edge, dropped per side, each scaled [length, thickness].
    const thickK = 1 + (W - 1) * 0.5;
    for (const side of [-1, 1] as const) {
      const a = side < 0 ? armL : armR, ls = side < 0 ? L.armL : L.armR, drop = L.shoulder[side < 0 ? 0 : 1];
      const mat = m.arm[side < 0 ? 0 : 1], pose = m.armPose[side < 0 ? 0 : 1];
      limbMatrix(m.chest, -side * m.dress.style.shoulderX * W, FIGURE.shoulderY + drop, a[0], -side * a[1], -side * a[2], mat);
      mat.multiply(tmpM.makeScale(ls[1] * thickK, ls[0], ls[1] * thickK));
      pose[0] = a[3]; pose[1] = a[4]; pose[2] = a[5]; pose[3] = a[6];
      (side < 0 ? armsL : armsR).push(mat, side < 0 ? p.armL : p.armR, pose);
      m.shoulder[side < 0 ? 0 : 1].set(0, 0, 0).applyMatrix4(mat);
      applyRig('arm', [1, 1, side < 0 ? 1 : -1, 0], pose, v.set(0, JOINT.wrist - 0.08, 0), m.hand[side < 0 ? 0 : 1]).applyMatrix4(mat);
    }
    // Legs from the uniformly scaled hips, spread wider for the wide.
    hips.compose(pos.set(m.x, feet, m.z), turnQ.setFromAxisAngle(up, m.yaw), size.set(sy, sy, sy));
    const legThick = 1 + (W - 1) * 0.55;
    for (const side of [-1, 1] as const) {
      const ls = side < 0 ? L.legL : L.legR, mat = m.leg[side < 0 ? 0 : 1], pose = m.legPose[side < 0 ? 0 : 1];
      limbMatrix(hips, -side * FIGURE.hipX * (1 + (W - 1) * 0.6), FIGURE.hipY, side < 0 ? P.thighL : P.thighR, side * -P.legOut, 0, mat);
      mat.multiply(tmpM.makeScale(ls[1] * legThick, ls[0], ls[1] * legThick));
      pose[0] = side < 0 ? P.kneeL : P.kneeR; pose[1] = side < 0 ? P.ankleL : P.ankleR; pose[2] = side < 0 ? P.toeL : P.toeR; pose[3] = 0;
      legs.push(mat, p.legs, pose);
      m.foot[side < 0 ? 0 : 1].set(0, -FIGURE.sole + 0.05, 0.08).applyMatrix4(mat);
    }
    // Landmarks for ray tests: hips, neck, head.
    applyRig('body', [0, 1, 0, 0], m.bodyPose, v.set(0, FIGURE.hipY, 0), m.hip).applyMatrix4(m.base);
    applyRig('body', [0, 1, 0, 0], m.bodyPose, v.set(0, FIGURE.neckY, 0), m.neck).applyMatrix4(m.base);
    applyRig('body', [1, 1, 0, 0], m.bodyPose, v.set(0, FIGURE.headY, 0.02), m.head).applyMatrix4(m.base);
    // Eyes glint (×1.6 at night is the caller's eye strength; here the kind's own).
    if (fx && m.phase !== 'dead') for (const k of [0, 1] as const) { eyeWorld(m.base, m.bodyPose, k, v); fx.eyes.push(v.x, v.y, v.z, m.dress.eye, m.dress.glow * (m.phase === 'dying' ? 1 - shown(m, time).k : 1.2), 0.07 * S); }
    drawGrowths(m, time);
    // Held chunk while winding up a throw.
    if (fx && shown(m, time).phase === 'tele' && shown(m, time).attack === 'throw') {
      const h = m.hand[1];
      growM.compose(h, gq.setFromEuler(euler.set(time * 0.5, 0.3, 0.2)), gs.set(1.9, 0.9, 1.4));
      fx.props.push(growM, 0x5a544c, 3);
    }
  }

  /** Growths and weak spots on the posed body (horror-fx growths and glows), and the weak spots' world positions. */
  function drawGrowths(m: Mutant, time: number) {
    const L = m.look, S = L.scale;
    let n = 0;
    for (const g of L.growths) {
      const count = growthLevel < 1 ? Math.ceil(g.count / 2) : g.count;
      for (let k = 0; k < count; k++, n++) {
        const h = (m.seed * 31 + n * 17) % 97 / 97;
        const placed = site(m, g.at, k, count, v, v2);
        if (!placed) continue;
        // Spurs point out along the site's normal (world); hair hangs; lumps sit.
        gq.setFromUnitVectors(up, v2.normalize());
        const s = g.size * S * (0.75 + 0.5 * h);
        growM.compose(v, gq, gs.set(s, s * (g.shape === SHAPE.HAIR ? 1.6 : 1), s));
        fx?.growths.push(growM, new THREE.Color(g.color).getHex(), g.shape);
      }
    }
    // Weak spots: glowing, pulsing (faster when exposed).
    const W = MUTANT_LOOKS[m.kind].weak;
    m.weakAt.length = W.length; m.weakR.length = W.length;
    for (let k = 0; k < W.length; k++) {
      const at = m.weakAt[k] ?? (m.weakAt[k] = new THREE.Vector3());
      weakSite(m, W[k].at, at);
      m.weakR[k] = W[k].r * (S / 2.5);
      if (!(m.weak & (1 << k)) || !fx || m.phase === 'dead') continue;
      const exposed = m.kind !== 'leaper' || (m.flags & (MF.EXPOSED | MF.WALL)) !== 0;
      if (!exposed) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time * (m.flags & MF.EXPOSED ? 9 : 4) + k * 2);
      const rgb = m.kind === 'matriarch' ? 0x9be04a : 0xe8a33a;
      if (m.kind === 'colossus') {
        // A cluster of pustules rather than one ball, each throbbing on its own beat.
        for (let j = 0; j < 4; j++) {
          const a = j * 1.9, rr = m.weakR[k] * (j ? 0.45 : 0.6), off = j ? m.weakR[k] * 0.55 : 0;
          v.set(Math.cos(a) * off, Math.sin(a) * off, 0).applyQuaternion(gq.setFromRotationMatrix(tmpM.extractRotation(m.frame))).add(at);
          growM.compose(v, gq.identity(), gs.setScalar(rr * (0.9 + 0.15 * Math.sin(time * 5 + j * 2.3))));
          fx.glows.push(growM, rgb, 0.5 + 0.5 * Math.sin(time * (m.flags & MF.EXPOSED ? 9 : 4) + j));
        }
        continue;
      }
      growM.compose(at, gq.identity(), gs.setScalar(m.weakR[k] * (0.9 + 0.12 * pulse)));
      fx.glows.push(growM, rgb, pulse);
    }
  }
  /** A growth site's k-th point (world) and its outward direction. */
  function site(m: Mutant, at: GrowthSite, k: number, count: number, out: THREE.Vector3, dir: THREE.Vector3) {
    const t = count > 1 ? k / (count - 1) : 0.5, alt = k % 2 ? 1 : -1;
    switch (at) {
      case 'spine': rigPoint(m, 'body', [0, 1, 0, 0], 0.02 * alt, lerp(1.28, 1.74, t), -0.15, out); dir.set(0, 0.6, -1).transformDirection(m.base); return true;
      case 'shoulderL': case 'shoulderR': { const sx = at === 'shoulderL' ? 1 : -1; rigPoint(m, 'body', [0, 1, 0, 0], sx * (0.16 + 0.04 * t), 1.68 + 0.04 * Math.sin(k * 2.1), -0.03 + 0.05 * alt, out); dir.set(sx * 0.6, 1, 0).transformDirection(m.base); return true; }
      case 'belly': { const a = (t - 0.5) * 1.8; rigPoint(m, 'body', [0, 0.3, 0, 0], Math.sin(a) * 0.19, 1.16 + 0.12 * ((k * 7) % 3) / 2, 0.035 + Math.cos(a) * 0.17, out); dir.set(Math.sin(a), 0, Math.cos(a)).transformDirection(m.base); return true; }
      case 'head': {
        const a = (t - 0.5) * 3.6 + Math.PI, hy = FIGURE.headY + (m.kind === 'matriarch' ? -0.02 : 0.1);
        if (m.kind === 'matriarch') {
          // Hair clumps hang along the head's own down (their shape droops along -y): +y is the head's up.
          rigPoint(m, 'body', [1, 1, 0, 0], Math.sin(a) * 0.12, hy + 0.1, Math.cos(a) * 0.12, dir);
          rigPoint(m, 'body', [1, 1, 0, 0], Math.sin(a) * 0.12, hy, Math.cos(a) * 0.12, out);
          dir.sub(out);
        } else {
          rigPoint(m, 'body', [1, 1, 0, 0], Math.sin(a) * 0.12, hy, Math.cos(a) * 0.12, out);
          dir.set(Math.sin(a), 1.2, Math.cos(a)).transformDirection(m.base);
        }
        return true;
      }
      case 'armR': case 'fist': {
        const mat = m.arm[1], pose = m.armPose[1];
        if (at === 'armR') applyRig('arm', [t > 0.35 ? 1 : 0, 0, -1, 0], pose, v2.set(-0.05 * alt - 0.02, lerp(-0.12, JOINT.wrist + 0.02, t), 0.035 * Math.cos(k * 2.3)), out);
        else applyRig('arm', [1, 1, -1, 0], pose, v2.set(-0.02 + 0.02 * alt, JOINT.wrist - 0.1, -0.03 + 0.03 * k), out);
        out.applyMatrix4(mat);
        dir.set(at === 'fist' ? 0 : -alt, at === 'fist' ? -1 : 0.2, at === 'fist' ? 0.3 : 0.4).transformDirection(mat);
        return true;
      }
    }
    return false;
  }
  function weakSite(m: Mutant, at: string, out: THREE.Vector3) {
    if (at === 'backR') return rigPoint(m, 'body', [0, 1, 0, 0], -0.12, 1.56, -0.16, out);
    if (at === 'spine') return rigPoint(m, 'body', [0, 1, 0, 0], 0, 1.6, -0.15, out);
    const k = Number(at.slice(-1));
    return rigPoint(m, 'body', [0, 0.3, 0, 0], [-0.1, 0.1, 0][k] ?? 0, [1.33, 1.25, 1.13][k] ?? 1.2, 0.19, out);
  }
  const rp = new THREE.Vector3();
  function rigPoint(m: Mutant, kind: 'body', rig: [number, number, number, number], x: number, y: number, z: number, out: THREE.Vector3) {
    return applyRig(kind, rig, m.bodyPose, rp.set(x, y, z), out).applyMatrix4(m.base);
  }

  // ---- Public ---------------------------------------------------------------------------------------------------

  function spawnInto(m: Mutant, kind: MutantKind, x: number, z: number, max: number, time: number) {
    const spec = MUTANT_SPEC[kind];
    Object.assign(m, {
      on: true, kind, look: MUTANT_LOOKS[kind], dress: mutantDress(kind), seed: Math.floor(random() * 1e6), spec,
      x, z, y: 0, yaw: random() * Math.PI * 2, pace: 0, stride: 0, hp: Math.min(65_000, max), max: Math.min(65_000, max),
      weak: (1 << WEAK_COUNT[kind]) - 1, weakHp: Array.from({ length: WEAK_COUNT[kind] }, () => spec.weakHp), slow: 1,
      tell: null, cd: { roar: time + 4, charge: time + 4, throw: time + 6, pounce: time + 2, bile: time + 2, exhale: time + 2 }, target: -1, switchAt: -99, thinkAt: time,
      hits: [], route: [], routeAt: 0, checkAt: time + 4, checkD: Infinity, reroutes: 0, staggerLog: [], staggerReady: time, enraged: false, roarNext: 0.75, roarAt: time,
      broodAt: time + 6, slamAt: time, climbHp: max, climbAt: time + 3, appliedAt: time, wall: null, leap: null, charge: null, dyingAt: 0, looted: false, by: -1, flags: 0, prog: 0, attack: null, local: null, swell: 0,
    } satisfies Partial<Mutant>);
  }

  const mutantsApi = {
    get mutants(): readonly { readonly on: boolean }[] { return mutants; },
    setAuthority(mode: 'sim' | 'puppet') { authority = mode; },
    get authority() { return authority; },
    /** A new mutant (host/solo): 'emerge' bursts from rubble, 'crater' heaves up out of a road crater, 'drop' falls from a roof. Returns its index, or -1. */
    spawn(kind: MutantKind, x: number, z: number, max: number, how: 'emerge' | 'drop' | 'crater', time: number) {
      const m = mutants.find((c) => !c.on);
      if (!m) return -1;
      clock = time;
      spawnInto(m, kind, x, z, max, time);
      m.y = how === 'drop' ? 8 : -m.spec.height;
      setPhase(m, 'emerge', time, how === 'drop' ? 0.9 : 2.0);
      present({ k: 'spawn', w: w(m), how: 'emerge', x, z }, time);
      audio?.voice(kind, 'alert', x, z, 1.5);
      return m.i;
    },
    update(dt: number, time: number, targets: readonly MutantTarget[], out: MutantOut) {
      clock = time;
      lastTargets = targets;
      for (const b of batches) b.begin();
      for (const m of mutants) {
        if (!m.on) continue;
        if (authority === 'sim') simulate(m, dt, time, targets, out);
        else if (m.local && time >= m.local.until) m.local = null;
        if (!m.on) continue;
        // Footsteps and idle growls.
        const step = Math.floor(m.stride / Math.PI);
        if (step !== m.stepped) { m.stepped = step; if (m.pace > 0.3) audio?.voice(m.kind, 'step', m.x, m.z, 1); }
        if (time > m.idleAt && m.phase !== 'dying' && m.phase !== 'dead') { m.idleAt = time + 4 + (m.seed % 5); audio?.voice(m.kind, 'idle', m.x, m.z, 1.2); }
        draw(m, time);
      }
      for (const b of batches) b.end();
      if (pending.length) { out.events.push(...pending); pending.length = 0; }
    },
    /**
     * Damage to mutant i (host/solo): base damage before the zone rules (head x2 leaper / x1.5; limbs x0.75; an intact,
     * visible weak point x2.5, x3 in the colossus' stumble, and its pool breaks it), with the stagger and enrage rules.
     */
    damage(i: number, base: number, zone: Zone, weak: number, from: { x: number; z: number }, kind: ZHitKind, by: number, time: number, wp = 0) {
      const m = mutants[i];
      clock = time;
      if (!m || !m.on || m.phase === 'dying' || m.phase === 'dead' || (m.phase === 'emerge' && time - m.phaseAt < 0.6)) return { dealt: 0, killed: false, weakBroken: 0 };
      let mult = 1, weakBroken = 0, weakHit = false;
      if (zone === 'weak') {
        const bit = weak & m.weak;
        const exposed = m.kind !== 'leaper' || (m.flags & (MF.EXPOSED | MF.WALL)) !== 0;
        if (bit && exposed) {
          weakHit = true;
          const k = Math.log2(bit & -bit);
          mult = m.kind === 'matriarch' ? 2 : m.kind === 'colossus' && m.phase === 'recover' && m.flags & MF.EXPOSED ? 3 : 2.5;
          m.weakHp[k] -= base * mult;
          if (m.weakHp[k] <= 0) {
            m.weak &= ~(1 << k); weakBroken = 1 << k;
            audio?.pop(m.x, m.z);
            m.tell = null; m.charge = null;
            if (m.kind === 'colossus') m.slow = 0.7;
            setPhase(m, 'stagger', time, m.kind === 'matriarch' ? 1.5 : 2); m.flags |= MF.STAGGER;
            if (m.kind === 'matriarch') { m.hp -= 320; }
          }
        } else zone = 'body';
      }
      if (zone === 'head') mult = m.kind === 'leaper' ? 2 : 1.5;
      else if (zone === 'limb') mult = 0.75;
      const dealt = base * mult;
      m.hp -= dealt;
      // A dog's bites count for the dog (wp 7 is 'dog' in WEAPON_CODES).
      m.hits.push({ key: wp === 7 ? by + 8 : by, amt: dealt, t: time });
      // Stagger: 12% of max HP within 3 s (8 s cooldown); an explosion of 150+ flinches it for 0.6 s.
      m.staggerLog = m.staggerLog.filter((h) => time - h.t < 3);
      m.staggerLog.push({ t: time, amt: dealt });
      if (!weakBroken && m.hp > 0 && m.phase !== 'stagger' && m.phase !== 'leap' && m.phase !== 'climb' && m.phase !== 'roof') {
        const recent = m.staggerLog.reduce((s, h) => s + h.amt, 0);
        if (recent >= m.max * 0.12 && time >= m.staggerReady) { m.tell = null; m.charge = null; setPhase(m, 'stagger', time, 1.2); m.flags |= MF.STAGGER; m.staggerReady = time + 8; }
        else if (kind === 'blast' && base >= 150 && m.phase !== 'tele') { setPhase(m, 'stagger', time, 0.6); m.flags |= MF.STAGGER; }
      }
      if (!m.enraged && m.hp < m.max * 0.3 && m.hp > 0) { m.enraged = true; m.flags |= MF.ENRAGED; }
      if (Math.random() < 0.3) audio?.voice(m.kind, 'hurt', m.x, m.z, 1);
      if (m.hp <= 0) { die(m, by, wp, weakHit, from, Math.min(40, base / 5), time, lastTargets); return { dealt, killed: true, weakBroken }; }
      return { dealt, killed: false, weakBroken };
    },
    /** The nearest mutant part along a ray: weak spots first (when intact and visible), then head, body, limbs. */
    /**
     * Each frame after the camera moved: a giant between the camera and the player (x, y, z: its chest) opens the
     * see-through hole around the player (fading in and out over ~0.15 s); otherwise it closes.
     */
    xray(camera: THREE.Camera, x: number, y: number, z: number, renderer: THREE.WebGLRenderer, dt: number) {
      const c = camera.position, dx = x - c.x, dy = y - c.y, dz = z - c.z, len = Math.hypot(dx, dz);
      let block = false;
      for (const m of mutants) {
        if (!m.on || m.phase === 'dead' || len < 1) continue;
        // The camera→player line's closest point to the mutant's axis, before the player, inside its bulk and height.
        const t = clamp(((m.x - c.x) * dx + (m.z - c.z) * dz) / (len * len), 0, 1);
        if (t * len > len - 0.8) continue;
        const g = world.ground(m.x, m.z) + m.y, py = c.y + dy * t;
        if (Math.hypot(c.x + dx * t - m.x, c.z + dz * t - m.z) < m.spec.radius * 1.4 + 0.4 && py < g + m.spec.height * 1.05 && py > g - 0.5) { block = true; break; }
      }
      const on = SEE_THROUGH.on;
      on.value += ((block ? 1 : 0) - on.value) * Math.min(1, dt * 8);
      if (on.value < 0.02) { on.value = 0; return; }
      renderer.getDrawingBufferSize(xraySize);
      const depth = -xrayP.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z;
      xrayP.set(x, y, z).project(camera);
      SEE_THROUGH.hole.value.set((xrayP.x * 0.5 + 0.5) * xraySize.x, (xrayP.y * 0.5 + 0.5) * xraySize.y, xraySize.y * 0.2, depth - 0.8);
    },
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { i: number; t: number; zone: Zone; weak: number } | null = null;
      const consider = (i: number, t: number, zone: Zone, weak: number) => { if (t > 0 && t < maxT && (!best || t < best.t - (zone === 'weak' ? 0.3 : 0))) best = { i, t, zone, weak }; };
      for (const m of mutants) {
        if (!m.on || m.phase === 'dead' || (m.phase === 'emerge' && m.y < -m.spec.height * 0.5)) continue;
        const S = m.look.scale, W = m.look.width;
        // Broad phase: a sphere around the whole body.
        const c = v.copy(m.hip).lerp(m.neck, 0.5);
        if (raySphere(origin, dir, c, m.spec.height * 0.75) < 0 && c.distanceTo(origin) > m.spec.height) continue;
        for (let k = 0; k < m.weakAt.length; k++) {
          if (!(m.weak & (1 << k))) continue;
          if (m.kind === 'leaper' && !(m.flags & (MF.EXPOSED | MF.WALL))) continue;
          consider(m.i, raySphere(origin, dir, m.weakAt[k], m.weakR[k] * 1.1), 'weak', 1 << k);
        }
        consider(m.i, raySphere(origin, dir, m.head, 0.16 * S * (1 + (W - 1) * 0.4)), 'head', 0);
        consider(m.i, rayCapsule(origin, dir, m.hip, m.neck, 0.2 * S * W), 'body', 0);
        for (const k of [0, 1] as const) {
          const thick = (k === 0 ? m.look.armL : m.look.armR)[1];
          consider(m.i, rayCapsule(origin, dir, m.shoulder[k], m.hand[k], 0.06 * S * thick * (1 + (W - 1) * 0.5) + 0.05), m.kind === 'colossus' && k === 1 ? 'body' : 'limb', 0);
          consider(m.i, rayCapsule(origin, dir, v2.setFromMatrixPosition(m.leg[k]), m.foot[k], 0.08 * S * (1 + (W - 1) * 0.5)), 'limb', 0);
        }
      }
      return best as { i: number; t: number; zone: Zone; weak: number } | null;
    },
    near(x: number, z: number, r: number, cb: (m: MutantView) => void) {
      for (const view of mutantsApi.list()) if (Math.hypot(view.x - x, view.z - z) <= r + MUTANT_SPEC[view.kind].radius) cb(view);
    },
    /** Upright capsules for aiming and blasts: centre, feet, top, radius. */
    forEachCapsule(cb: (x: number, z: number, y0: number, y1: number, r: number, i: number) => void) {
      for (const m of mutants) {
        if (!m.on || m.phase === 'dead') continue;
        const y0 = world.ground(m.x, m.z) + Math.max(0, m.y);
        cb(m.x, m.z, y0, Math.max(y0 + 1, m.head.y + 0.3 * m.look.scale), m.spec.radius, m.i);
      }
    },
    list(): readonly MutantView[] {
      views.length = 0;
      for (const m of mutants) if (m.on) views.push({ i: m.i, kind: m.kind, x: m.x, z: m.z, y: m.y, hp: Math.max(0, m.hp), max: m.max, weak: m.weak, phase: m.phase, telling: m.local?.a ?? (m.tell ? m.tell.a : null) });
      return views;
    },
    /** Snapshot records (host): returns how many it wrote. */
    netExport(out: NetMutant[]) {
      let n = 0;
      for (const m of mutants) {
        if (!m.on) continue;
        const s = shown(m, clock);
        const rec = out[n] ?? (out[n] = { i: 0, kind: 0, phase: 0, attack: 255, x: 0, z: 0, y: 0, yaw: 0, prog: 0, hp: 0, max: 1, weak: 0, target: 255, flags: 0 });
        rec.i = m.i; rec.kind = KIND_INDEX[m.kind]; rec.phase = PHASE_INDEX[m.phase]; rec.attack = m.tell ? ATTACK_INDEX[m.tell.a] : 255;
        rec.x = m.x; rec.z = m.z; rec.y = m.y; rec.yaw = m.yaw; rec.prog = Math.round(s.k * 255);
        rec.hp = Math.max(0, Math.round(m.hp)); rec.max = Math.round(m.max); rec.weak = m.weak; rec.target = m.target < 0 ? 255 : m.target; rec.flags = m.flags & 0xff;
        n++;
      }
      return n;
    },
    /** Puppets from the interpolated records at render time (every mutant is in every snapshot: one missing is gone). */
    netApply(records: readonly NetMutant[], renderTime?: number) {
      void renderTime;
      const seen = new Set<number>();
      for (const r of records) {
        const m = mutants[r.i];
        if (!m) continue;
        seen.add(r.i);
        const kind = MUTANT_KINDS[r.kind] ?? 'colossus';
        if (!m.on || m.kind !== kind) { spawnInto(m, kind, r.x, r.z, r.max, clock); }
        const phase = MPHASES[r.phase] ?? 'idle';
        const moved = Math.hypot(r.x - m.x, r.z - m.z), elapsed = Math.max(1e-3, clock - m.appliedAt);
        m.appliedAt = clock;
        if (phase === 'dying' && m.phase !== 'dying') { m.dyingAt = clock - (r.prog / 255) * DEATH.dying; }
        m.pace = phase === 'walk' || phase === 'run' || phase === 'idle' || phase === 'roof' ? m.pace + (Math.min(12, moved / elapsed) - m.pace) * 0.25 : 0;
        if (moved > 0.01) m.stride += moved * (m.kind === 'colossus' ? 0.75 : m.kind === 'matriarch' ? 1.4 : 1.6);
        m.x = r.x; m.z = r.z; m.y = r.y; m.yaw = r.yaw; m.hp = r.hp; m.max = r.max; m.weak = r.weak; m.flags = r.flags; m.prog = r.prog;
        m.target = r.target === 255 ? -1 : r.target;
        m.phase = phase; m.phaseAt = clock; m.phaseEnd = clock;
        m.attack = r.attack === 255 ? null : ATTACKS[r.attack] ?? null;
        if (phase === 'dead') m.phaseEnd = clock + DEATH.sink * (1 - r.prog / 255);
      }
      for (const m of mutants) if (m.on && !seen.has(m.i)) off(m);
    },
    /** Promotion (this client becomes the host): puppets become the simulation; a mid-attack mutant starts its tell again. */
    adopt(records: readonly NetMutant[], time: number) {
      clock = time;
      for (const m of mutants) off(m);
      for (const r of records) {
        const m = mutants[r.i];
        if (!m) continue;
        const kind = MUTANT_KINDS[r.kind] ?? 'colossus';
        spawnInto(m, kind, r.x, r.z, r.max, time);
        m.hp = r.hp; m.weak = r.weak; m.y = r.y; m.yaw = r.yaw; m.flags = r.flags & ~(MF.STAGGER); m.target = r.target === 255 ? -1 : r.target;
        for (let k = 0; k < m.weakHp.length; k++) if (!(m.weak & (1 << k))) m.weakHp[k] = 0;
        const phase = MPHASES[r.phase] ?? 'idle';
        if (phase === 'dying' || phase === 'dead') { setPhase(m, phase, time, phase === 'dying' ? DEATH.dying * (1 - r.prog / 255) : DEATH.lie + DEATH.sink); m.dyingAt = time - DEATH.dying * (r.prog / 255); m.looted = phase === 'dead'; }
        else if (phase === 'climb' || phase === 'roof' || m.flags & MF.WALL || m.y > 1.5) {
          // A leaper up high: back on its wall or roof.
          const wall = world.wallNear(m.x, m.z, 6);
          if (wall) { m.wall = wall; setPhase(m, m.y >= wall.top - 0.2 ? 'roof' : 'climb', time); } else { m.y = 0; setPhase(m, 'idle', time); }
        } else setPhase(m, 'idle', time);
        // A tell the old host never resolved is never resolved here: cooldowns restart a second later.
        for (const a of MUTANT_MOVES[kind]) m.cd[a] = Math.max(m.cd[a] ?? 0, time + 1);
      }
    },
    /** A host event on this client: tells switch the puppet to its windup at once (snapshots are 220 ms behind); markers, sounds, dust. */
    applyEvent(e: ZEvent, now: number) {
      clock = now;
      if ((e.k === 'tele' || e.k === 'hit' || e.k === 'roar' || e.k === 'kill') && e.w >= MUTANT_ID_BASE && e.w < MUTANT_ID_BASE + MAX_MUTANTS) {
        const m = mutants[e.w - MUTANT_ID_BASE];
        if (m.on && e.k === 'tele') { m.local = { a: e.a, start: now, until: now + e.t, yaw: e.yaw }; m.yaw = e.a === 'roar' || e.a === 'brood' || e.a === 'deathburst' ? m.yaw : e.yaw; }
        if (m.on && e.k === 'kill') { m.local = null; setPhase(m, 'dying', now, DEATH.dying); m.dyingAt = now; audio?.voice(m.kind, 'die', m.x, m.z, 1.5); }
      }
      present(e, now);
    },
    stop() {
      for (const m of mutants) off(m);
      smashed.clear(); shovedAt.clear(); pending.length = 0;
      for (const b of batches) { b.begin(); b.end(); }
    },
    /** Growth density by quality level (≥ 4: half the growths, the lever of §8). */
    setDetail(level: number) { growthLevel = level >= 4 ? 0 : 1; },
    dispose() {
      mutantsApi.stop();
      for (const b of batches) { scene.remove(b.mesh); b.dispose(); }
      for (const mtl of Object.values(materials)) mtl.dispose();
    },
    /** Test hooks: the pose angles a mutant shows in a phase (for the A13 limits) and its internal state. */
    __test: {
      state: (i: number) => mutants[i],
      pose: (kind: MutantKind, phase: MPhase, attack: AttackId | null, time: number) => {
        const m = mutants.find((c) => !c.on) ?? mutants[0];
        const was = { on: m.on, kind: m.kind, look: m.look, phase: m.phase, tell: m.tell, attack: m.attack, local: m.local, flags: m.flags };
        m.kind = kind; m.look = MUTANT_LOOKS[kind]; m.phase = phase; m.attack = attack; m.tell = null; m.local = null; m.flags = phase === 'recover' ? MF.EXPOSED : 0;
        m.phaseAt = time - 0.3; m.phaseEnd = time + 0.3; m.dyingAt = time - 1;
        if (phase === 'tele' && attack) m.tell = { a: attack as MutantAttack, start: time - 0.3, impact: time + 0.3, x: 0, z: 0, yaw: 0, r: 1, arc: 1, tx: 0, tz: 0, ty: 0, to: 0, second: false, fromRoof: false, quiet: false };
        const p = poseOf(m, time);
        const arms = { elL: armL[3], elR: armR[3] };
        Object.assign(m, was);
        return { ...p, ...arms };
      },
    },
  };
  return mutantsApi;
}
export type Mutants = ReturnType<typeof createMutants>;
