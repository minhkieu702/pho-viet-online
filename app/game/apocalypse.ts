/**
 * The ruined city of zombie mode (design.md §6c, §5.6, §9 A4/A12/A15): wrecked and burnt cars, motorbikes and buses
 * strewn and piled on the roads, collapsed building corners and ruined shells with colliders, fallen trees and power
 * poles with snapped cables, vines and moss, weeds through cracked asphalt, overgrown parks, litter, abandoned
 * stalls, barricades, a quarantine checkpoint, broken windows, scorch marks and craters, burning barrels and wrecks.
 *
 * Two halves:
 * - planRuins(input, seed): a pure, deterministic function of the map (roads, plots, trees, poles, lamps, greens,
 *   stalls, keep-clear spots, existing solids). Every client with the same WORLD_VERSION/ZOMBIE_VERSION gets the
 *   same items, colliders and hash. It never imports today's map (apocalypse-inputs.ts builds the input from
 *   city.ts, ruinInputsFromWorld() from the wired districts too), never reads a clock, Math.random, the player or
 *   the quality level, and never branches on Math.sin/cos/exp/pow/hypot/atan2 (engines may differ in the last bit):
 *   yaws are quantised to k·π/32 with a sine table built from + − × ÷ (the districts' rotated buildings and oriented
 *   solids to k·π/2048, a finer table built the same way), distances use Math.sqrt. A global pass over the road
 *   graph (pile-ups, full blocks with a car-connectivity check, bus crashes, the fleet wreck spots) is followed by
 *   one detail pass per 128 m chunk, seeded per (chunk, layer), so planning order never changes a chunk.
 *   Optional inputs (the wired city's): `land` keeps colliders and ruined shells on dry land or a bridge, `lane`
 *   keeps a drive lane clear down every traffic road that is not fully blocked (no road is closed by accident, a
 *   junction keeps at least two open arms), plots with a `box` (rotated buildings) get their collapses, signs,
 *   windows, vines and moss along that box and their rubble within RUBBLE_MARGIN of it.
 * - createApocalypse(scene, solids, opts): draws a plan (one merged opaque geometry per chunk, built off the frame and
 *   time-sliced, the chunks within the fog's reach in a few fixed-size BatchedMesh pages: a draw call a page, each
 *   chunk culled on its own; one BatchedMesh for every vehicle wreck with a full model near the focus and a cheap hull
 *   further out), puts its colliders into the shared collision index under RUIN_OWNER, and takes them out again when
 *   zombie mode ends. Mutants crush (code 0..7) or throw (RUIN_THROWN) wrecks through smash(); only those changes are
 *   networked (zev smash, zdir.ruins). Plans cross to and from ruin-worker.ts packed (ruin-pack.ts).
 *
 * Conventions as map/collision.ts: ground plane x/z, yaw 0 faces +z, forward = (sin yaw, cos yaw); a box's half size
 * hx runs along (cos yaw, −sin yaw) and hz along forward. Heights in a plan are above the ground; the runtime adds
 * opts.ground(x, z).
 */
import * as THREE from 'three';
import type { CollisionIndex } from './map/collision.ts';
import { FLEET, ModelParts, carGeometry, carGlassGeometry, carSpec, fleetGeometry, motoGeometry, type CarStyle, type FleetKind, type MotoStyle } from './vehicle-models.ts';
import { MAX_RUIN_CHANGES, RUIN_THROWN } from '../../lib/zombie-protocol.ts';

export const APOCALYPSE_SEED = 0x5e7a7e;
/** Bump with any change to planRuins output (and bump ZOMBIE_VERSION with it): scripts/apocalypse.test.mjs freezes the hash. */
export const APOCALYPSE_VERSION = 1;
/** Collision-index owner tag: static and below 16 (OWNER.legacy 1, roof 2); chunk keys and dynamic owners take 16 and up. */
export const RUIN_OWNER = 3;
/** Chunk size in metres. */
export const CHUNK = 128;

type Box2 = { minX: number; minZ: number; maxX: number; maxZ: number };
/** An oriented box (map/collision.ts conventions); the planner turns its yaw into a multiple of π/2048. */
export type RuinBox = { cx: number; cz: number; hx: number; hz: number; yaw: number };
/** A solid already in the world: an axis-aligned rect (today's colliders) or an oriented box (the districts'). */
export type RuinSolid = Box2 | RuinBox;
export type RuinRoad = { id: number; pts: readonly number[]; half: number; sidewalk: number; walk: number; cls: 'R1' | 'R2' | 'hem'; traffic: boolean; bridge?: boolean };
export type RuinPlotInput = Box2 & {
  id: number; h: number; facing: number; style: string; sign: boolean; keep: boolean;
  /** The ground-floor footprint when it is smaller than the upper floors (an arcade); moss grows on it. */
  ground?: Box2;
  /**
   * The footprint as an oriented box (the districts' buildings, rotated ones included; Box2 is then its axis box):
   * its front is the box's forward face, and collapses, rubble, signs, windows, vines and moss follow the box, the
   * rubble kept within RUBBLE_MARGIN of it (no axis-aligned heap poking into the street).
   */
  box?: RuinBox;
};
/** A park, square or yard gone wild: its rect, or a polygon (x,z pairs) with that rect as its bounds. */
export type RuinGreen = Box2 & { poly?: readonly number[] };
/** Dry land: the union of `polys` less `holes` (x,z pairs each); bridges (roads flagged `bridge`) count as land. */
export type RuinLand = { polys: readonly (readonly number[])[]; holes?: readonly (readonly number[])[] };
export type RuinInput = {
  bounds: Box2;
  roads: readonly RuinRoad[];
  junctions: readonly { x: number; z: number; r: number; arms: number }[];
  crosswalks: readonly { x: number; z: number; r: number }[];
  plots: readonly RuinPlotInput[];
  trees: readonly { x: number; z: number; size: number; species: string }[];
  poles: readonly { x: number; z: number; yaw: number; line: string }[];
  lamps: readonly { x: number; z: number; hx: number; hz: number }[];
  greens: readonly RuinGreen[];
  stalls: readonly { x: number; z: number; yaw: number; kind: string }[];
  /** Spots kept clear by r; `major` ones (the spawn, the doors players need) also keep full road blocks 60 m away (default: r ≥ 10). */
  keepClear: readonly { x: number; z: number; r: number; major?: boolean }[];
  /** Solids already in the world (colliders), so ruins never overlap them. */
  solids: readonly RuinSolid[];
  /** Every walking leg (sidewalk lines, hẻm centre lines, crosswalks, door and seat paths); derived from the roads when absent. */
  walks?: readonly { ax: number; az: number; bx: number; bz: number }[];
  /** Quarantine checkpoints (white tents) near a hospital, facing the street. */
  checkpoints?: readonly { x: number; z: number; yaw: number }[];
  /** How many fleet wreck spots to plan (vehicles.ts' traffic cars and motorbikes). */
  fleet?: { cars: number; motos: number };
  /** Where colliders and ruined shells may stand (the land, not the river or a canal); everywhere in `bounds` when absent. */
  land?: RuinLand;
  /**
   * Width (m) of a drive lane kept clear of every collider (wrecks, pile-ups, barricades, fallen trees and poles)
   * down the centre line of every traffic road that is not deliberately blocked; full blocks also leave every
   * junction at least two open arms. Absent: today's rules only.
   */
  lane?: number;
};
export type RuinKind = 'car' | 'carBurnt' | 'moto' | 'bus' | 'pile' | 'rubble' | 'slab' | 'shell' | 'rebar' | 'sign' | 'tree' | 'stump' | 'pole'
  | 'cable' | 'vine' | 'moss' | 'weeds' | 'grass' | 'crack' | 'scorch' | 'litter' | 'barricade' | 'stall' | 'window' | 'barrel'
  /** Additive kinds: a collapsed corner overlay, a shell wall, a tower's blown-out windows, glass on the ground, a crater, a tent, a heap of bikes. */
  | 'breach' | 'wall' | 'patch' | 'shards' | 'crater' | 'tent' | 'tangle';
const KINDS: readonly RuinKind[] = ['car', 'carBurnt', 'moto', 'bus', 'pile', 'rubble', 'slab', 'shell', 'rebar', 'sign', 'tree', 'stump', 'pole', 'cable', 'vine', 'moss',
  'weeds', 'grass', 'crack', 'scorch', 'litter', 'barricade', 'stall', 'window', 'barrel', 'breach', 'wall', 'patch', 'shards', 'crater', 'tent', 'tangle'];
const KIND_INDEX = new Map(KINDS.map((k, i) => [k, i] as const));
/**
 * x, z on the ground; y above it; yaw and roll are multiples of π/32; s a size; v a variant (vehicle model, colour,
 * seed); ext extra numbers some kinds need (heights, ends of a cable). collider: index into plan.colliders or -1.
 */
export type RuinItem = { id: number; kind: RuinKind; x: number; z: number; y: number; yaw: number; roll: number; s: number; v: number; collider: number; smash: boolean; ext?: number[] };
export type RuinCollider = { cx: number; cz: number; hx: number; hz: number; yaw: number; top: number; item: number };
export type RuinPlan = {
  version: number; hash: number; seed: number;
  items: RuinItem[];
  colliders: RuinCollider[];
  /** Chunk key → item indices. */
  chunks: Map<number, number[]>;
  /** Fires to keep burning (y: height of the flames above the ground; barrels 0.95). */
  fires: { x: number; z: number; y?: number }[];
  columns: { x: number; z: number; h: number }[];
  /** Where vehicles.ts' fleet wrecks go, cars first then motorbikes (game.ts places them in fleet order). */
  fleetSpots: { x: number; z: number; yaw: number; kind: 'car' | 'moto' }[];
  spawnHoles: { x: number; z: number }[]; craters: { x: number; z: number }[];
  /** Tight groups of colliders (pile-ups, blocks, shells, barricades, checkpoints) with their box, for the no-pocket check. */
  clusters: { minX: number; minZ: number; maxX: number; maxZ: number; colliders: number[] }[];
  stats: { byKind: Record<string, number>; blockedEdges: number; ms: number };
};

// ---------------------------------------------------------------------------------------------------------
// Deterministic maths: quantised yaws with a sine table made of + − × ÷, an integer hash and RNG.
// ---------------------------------------------------------------------------------------------------------

const STEP = Math.PI / 32;
/** sin and cos of k·π/32 for k = 0..63, from Taylor series (IEEE + − × ÷ are correctly rounded in every engine). */
export const SIN = new Float64Array(64), COS = new Float64Array(64);
{
  const s = new Float64Array(17), c = new Float64Array(17);
  for (let k = 0; k <= 16; k++) {
    const x = k * STEP, x2 = x * x;
    let ts = x, ss = x, tc = 1, cc = 1;
    for (let n = 1; n < 14; n++) { ts *= -x2 / ((2 * n) * (2 * n + 1)); ss += ts; tc *= -x2 / ((2 * n - 1) * (2 * n)); cc += tc; }
    s[k] = k === 0 ? 0 : k === 16 ? 1 : ss; c[k] = k === 0 ? 1 : k === 16 ? 0 : cc;
  }
  for (let k = 0; k < 64; k++) {
    const q = k >> 4, r = k & 15;
    SIN[k] = q === 0 ? s[r] : q === 1 ? c[r] : q === 2 ? -s[r] : -c[r];
    COS[k] = q === 0 ? c[r] : q === 1 ? -s[r] : q === 2 ? -c[r] : s[r];
  }
}
const wrap = (k: number) => ((k % 64) + 64) % 64;
/** Fine yaw steps per STEP: the districts' rotated buildings and oriented solids keep their yaw to π/2048 (0.09°). */
const SUB = 64;
const FSTEP = STEP / SUB;
/** sin and cos of k·π/2048 for k = 0..4095, built as SIN/COS are (FSIN[k·64] === SIN[k]). */
export const FSIN = new Float64Array(64 * SUB), FCOS = new Float64Array(64 * SUB);
{
  const Q = 16 * SUB, s = new Float64Array(Q + 1), c = new Float64Array(Q + 1);
  for (let k = 0; k <= Q; k++) {
    const x = k * FSTEP, x2 = x * x;
    let ts = x, ss = x, tc = 1, cc = 1;
    for (let n = 1; n < 14; n++) { ts *= -x2 / ((2 * n) * (2 * n + 1)); ss += ts; tc *= -x2 / ((2 * n - 1) * (2 * n)); cc += tc; }
    s[k] = k === 0 ? 0 : k === Q ? 1 : ss; c[k] = k === 0 ? 1 : k === Q ? 0 : cc;
  }
  for (let k = 0; k < 4 * Q; k++) {
    const q = Math.floor(k / Q), r = k % Q;
    FSIN[k] = q === 0 ? s[r] : q === 1 ? c[r] : q === 2 ? -s[r] : -c[r];
    FCOS[k] = q === 0 ? c[r] : q === 1 ? -s[r] : q === 2 ? -c[r] : s[r];
  }
}
const wrapF = (k: number) => ((k % (64 * SUB)) + 64 * SUB) % (64 * SUB);
/** The fine yaw index (π/2048 steps) nearest a yaw in radians: + − × ÷ and rounding only. */
export const fineOf = (yaw: number) => wrapF(Math.round(yaw / FSTEP));
/** The yaw index whose forward (sin, cos) points most along (dx, dz); ties keep the lower index. */
export function yawIndexOf(dx: number, dz: number) {
  let best = 0, bestDot = -Infinity;
  for (let k = 0; k < 64; k++) { const d = dx * SIN[k] + dz * COS[k]; if (d > bestDot) { bestDot = d; best = k; } }
  return best;
}
function hash32(...v: number[]) {
  let h = 0x811c9dc5 | 0;
  for (const x of v) { h = Math.imul(h ^ (x | 0), 0x01000193); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
/** Low-discrepancy selection: the rank-th of a sorted candidate list is picked with share p, evenly spread. */
const weyl = (rank: number, p: number, salt: number) => { const x = (rank + 1) * 0.6180339887498949 + salt * 0.7548776662466927; return x - Math.floor(x) < p; };
const q100 = (v: number) => Math.round(v * 100) | 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** FNV-1a over 32-bit words. */
const fnv = (h: number, v: number) => Math.imul(h ^ (v | 0), 16777619) >>> 0;
export const chunkKey = (cx: number, cz: number) => (cx + 64) * 128 + (cz + 64);
export const chunkOf = (x: number, z: number) => chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
const keyX = (key: number) => Math.floor(key / 128) - 64, keyZ = (key: number) => (key % 128) - 64;

// ---------------------------------------------------------------------------------------------------------
// Plan-time spatial helpers (pure, no trigonometry): oriented boxes with exact separating-axis tests, walking legs,
// keep-clear circles.
// ---------------------------------------------------------------------------------------------------------

type OBB = { cx: number; cz: number; hx: number; hz: number; c: number; s: number; ex: number; ez: number };
function obb(cx: number, cz: number, hx: number, hz: number, k: number): OBB {
  const c = COS[wrap(k)], s = SIN[wrap(k)], ac = Math.abs(c), as = Math.abs(s);
  return { cx, cz, hx, hz, c, s, ex: ac * hx + as * hz, ez: as * hx + ac * hz };
}
/** A box turned by fine yaw index kf (k·64 is obb's k: the same box). */
function obbF(cx: number, cz: number, hx: number, hz: number, kf: number): OBB {
  const c = FCOS[wrapF(kf)], s = FSIN[wrapF(kf)], ac = Math.abs(c), as = Math.abs(s);
  return { cx, cz, hx, hz, c, s, ex: ac * hx + as * hz, ez: as * hx + ac * hz };
}
const rectObb = (r: Box2) => obb((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, (r.maxX - r.minX) / 2, (r.maxZ - r.minZ) / 2, 0);
const isRuinBox = (s: RuinSolid): s is RuinBox => (s as RuinBox).cx !== undefined;
/** A solid as a planner box: a rect as is, an oriented box at its fine yaw. */
const solidObb = (s: RuinSolid) => (isRuinBox(s) ? obbF(s.cx, s.cz, s.hx, s.hz, fineOf(s.yaw)) : rectObb(s));
/** A plan collider's box (a coarse yaw k·π/32 is the fine index 64k exactly). */
const colliderObb = (c: { cx: number; cz: number; hx: number; hz: number; yaw: number }) => obbF(c.cx, c.cz, c.hx, c.hz, Math.round(c.yaw / FSTEP));
/** Every corner of b lies within tol of box P. */
function insideObb(b: OBB, P: OBB, tol: number) {
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = b.cx + b.c * b.hx * u + b.s * b.hz * v, z = b.cz - b.s * b.hx * u + b.c * b.hz * v;
    if (dist2(P, x, z) > tol * tol) return false;
  }
  return true;
}
/** Even-odd point in polygon (x,z pairs). */
function inPoly(p: readonly number[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
/** a and b grown by pad overlap (open boxes: touching is not overlapping). */
function overlap(a: OBB, b: OBB, pad: number) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  if (Math.abs(dx) >= a.ex + b.ex + pad || Math.abs(dz) >= a.ez + b.ez + pad) return false;
  // Axes: a's side (c, −s) and forward (s, c), then b's.
  const axes = [a.c, -a.s, a.s, a.c, b.c, -b.s, b.s, b.c];
  for (let i = 0; i < 8; i += 2) {
    const ux = axes[i], uz = axes[i + 1];
    const ra = a.hx * Math.abs(a.c * ux - a.s * uz) + a.hz * Math.abs(a.s * ux + a.c * uz);
    const rb = b.hx * Math.abs(b.c * ux - b.s * uz) + b.hz * Math.abs(b.s * ux + b.c * uz);
    if (Math.abs(dx * ux + dz * uz) >= ra + rb + pad) return false;
  }
  return true;
}
/** Squared distance from a point to a box (0 inside). */
function dist2(b: OBB, x: number, z: number) {
  const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  const ex = Math.max(Math.abs(lx) - b.hx, 0), ez = Math.max(Math.abs(lz) - b.hz, 0);
  return ex * ex + ez * ez;
}
/** The segment passes within m of the box (the box grown square by m: conservative). */
function segHits(b: OBB, ax: number, az: number, bx: number, bz: number, m: number) {
  const pax = ax - b.cx, paz = az - b.cz, pbx = bx - b.cx, pbz = bz - b.cz;
  const x0 = pax * b.c - paz * b.s, z0 = pax * b.s + paz * b.c, x1 = pbx * b.c - pbz * b.s, z1 = pbx * b.s + pbz * b.c;
  const hx = b.hx + m, hz = b.hz + m, dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[x0, dx, hx], [z0, dz, hz]] as const) {
    if (Math.abs(d) < 1e-12) { if (p <= -h || p >= h) return false; continue; }
    let a = (-h - p) / d, c = (h - p) / d;
    if (a > c) { const t = a; a = c; c = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

/** Tag of a box whose piece was taken out again (the no-pocket check): ignored by every query. */
const DEAD = -3;
/** Boxes filed in 16 m cells; tag is a cluster number (−1 none), −2 for reserved space, DEAD for a removed piece. */
class BoxGrid {
  boxes: OBB[] = []; tags: number[] = [];
  private cells = new Map<number, number[]>();
  private stamp: number[] = []; private tick = 0;
  private static key(ix: number, iz: number) { return (ix + 32768) * 65536 + (iz + 32768); }
  add(b: OBB, tag: number) {
    const id = this.boxes.length;
    this.boxes.push(b); this.tags.push(tag); this.stamp.push(0);
    for (let ix = Math.floor((b.cx - b.ex) / 16); ix <= Math.floor((b.cx + b.ex) / 16); ix++) {
      for (let iz = Math.floor((b.cz - b.ez) / 16); iz <= Math.floor((b.cz + b.ez) / 16); iz++) {
        const k = BoxGrid.key(ix, iz), l = this.cells.get(k);
        if (l) l.push(id); else this.cells.set(k, [id]);
      }
    }
    return id;
  }
  /** Calls cb for each box whose bounds reach the area (once each); cb returning true stops and returns true. */
  some(minX: number, minZ: number, maxX: number, maxZ: number, cb: (id: number) => boolean) {
    const t = ++this.tick;
    for (let ix = Math.floor(minX / 16); ix <= Math.floor(maxX / 16); ix++) {
      for (let iz = Math.floor(minZ / 16); iz <= Math.floor(maxZ / 16); iz++) {
        const l = this.cells.get(BoxGrid.key(ix, iz));
        if (!l) continue;
        for (const id of l) {
          if (this.stamp[id] === t) continue;
          this.stamp[id] = t;
          if (cb(id)) return true;
        }
      }
    }
    return false;
  }
  /** Some box overlaps b grown by pad (padSame for boxes of the same cluster tag, when tag ≥ 0). */
  hits(b: OBB, pad: number, tag = -1, padSame = pad) {
    const p = Math.max(pad, padSame) + 0.01;
    return this.some(b.cx - b.ex - p, b.cz - b.ez - p, b.cx + b.ex + p, b.cz + b.ez + p,
      (id) => this.tags[id] !== DEAD && overlap(b, this.boxes[id], tag >= 0 && this.tags[id] === tag ? padSame : pad));
  }
}

/** Segments filed in 16 m cells. */
class SegGrid {
  segs: number[] = [];
  private cells = new Map<number, number[]>();
  private stamp: number[] = []; private tick = 0;
  add(ax: number, az: number, bx: number, bz: number, tag = 0) {
    const id = this.segs.length / 5;
    this.segs.push(ax, az, bx, bz, tag); this.stamp.push(0);
    for (let ix = Math.floor(Math.min(ax, bx) / 16); ix <= Math.floor(Math.max(ax, bx) / 16); ix++) {
      for (let iz = Math.floor(Math.min(az, bz) / 16); iz <= Math.floor(Math.max(az, bz) / 16); iz++) {
        const k = (ix + 32768) * 65536 + (iz + 32768), l = this.cells.get(k);
        if (l) l.push(id); else this.cells.set(k, [id]);
      }
    }
  }
  some(minX: number, minZ: number, maxX: number, maxZ: number, cb: (id: number) => boolean) {
    const t = ++this.tick;
    for (let ix = Math.floor(minX / 16); ix <= Math.floor(maxX / 16); ix++) {
      for (let iz = Math.floor(minZ / 16); iz <= Math.floor(maxZ / 16); iz++) {
        const l = this.cells.get((ix + 32768) * 65536 + (iz + 32768));
        if (!l) continue;
        for (const id of l) { if (this.stamp[id] === t) continue; this.stamp[id] = t; if (cb(id)) return true; }
      }
    }
    return false;
  }
  /** Some segment passes within m of the box. */
  near(b: OBB, m: number) {
    const s = this.segs;
    return this.some(b.cx - b.ex - m, b.cz - b.ez - m, b.cx + b.ex + m, b.cz + b.ez + m, (id) => segHits(b, s[id * 5], s[id * 5 + 1], s[id * 5 + 2], s[id * 5 + 3], m));
  }
  /** Squared distance from a point to the nearest segment, up to max. */
  dist2(x: number, z: number, max: number) {
    let best = max * max;
    const s = this.segs;
    this.some(x - max, z - max, x + max, z + max, (id) => {
      const o = id * 5, ax = s[o], az = s[o + 1], vx = s[o + 2] - ax, vz = s[o + 3] - az, l2 = vx * vx + vz * vz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
      const dx = x - ax - vx * t, dz = z - az - vz * t, d = dx * dx + dz * dz;
      if (d < best) best = d;
      return false;
    });
    return best;
  }
}

/**
 * Dry land on a 2 m grid over the bounds (cell centres): the land's polygons, less its holes, plus the bridges'
 * asphalt and sidewalks. Scanline fill with + − × ÷ only, so every engine marks the same cells.
 */
function landGrid(land: RuinLand, bounds: Box2, bridges: readonly { pts: readonly number[]; half: number; sidewalk: number }[]) {
  const C = 2, x0 = bounds.minX, z0 = bounds.minZ;
  const nx = Math.max(1, Math.ceil((bounds.maxX - x0) / C)), nz = Math.max(1, Math.ceil((bounds.maxZ - z0) / C));
  const cells = new Uint8Array(nx * nz);
  const xs: number[] = [];
  const fill = (poly: readonly number[], value: number) => {
    for (let j = 0; j < nz; j++) {
      const z = z0 + (j + 0.5) * C;
      xs.length = 0;
      for (let i = 0, k = poly.length - 2; i < poly.length; k = i, i += 2) {
        const xi = poly[i], zi = poly[i + 1], xk = poly[k], zk = poly[k + 1];
        if ((zi > z) !== (zk > z)) xs.push(xi + ((z - zi) * (xk - xi)) / (zk - zi));
      }
      xs.sort((a, b) => a - b);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - x0) / C - 0.5)), i1 = Math.min(nx - 1, Math.ceil((xs[m + 1] - x0) / C - 0.5) - 1);
        for (let i = i0; i <= i1; i++) cells[j * nx + i] = value;
      }
    }
  };
  for (const p of land.polys) fill(p, 1);
  for (const p of land.holes ?? []) fill(p, 0);
  for (const r of bridges) {
    const w = r.half + r.sidewalk;
    for (let k = 2; k < r.pts.length; k += 2) {
      const ax = r.pts[k - 2], az = r.pts[k - 1], vx = r.pts[k] - ax, vz = r.pts[k + 1] - az, l2 = vx * vx + vz * vz;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + vx) - w - x0) / C)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, ax + vx) + w - x0) / C));
      const j0 = Math.max(0, Math.floor((Math.min(az, az + vz) - w - z0) / C)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, az + vz) + w - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
        const dx = x - ax - vx * t, dz = z - az - vz * t;
        if (dx * dx + dz * dz <= w * w) cells[j * nx + i] = 1;
      }
    }
  }
  const has = (x: number, z: number) => {
    const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
    return i >= 0 && j >= 0 && i < nx && j < nz && cells[j * nx + i] === 1;
  };
  return {
    has,
    /** The box's centre and its four corners stand on land. */
    box(b: OBB) {
      if (!has(b.cx, b.cz)) return false;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (!has(b.cx + b.c * b.hx * u + b.s * b.hz * v, b.cz - b.s * b.hx * u + b.c * b.hz * v)) return false;
      return true;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Vehicle sizes for footprints (the wreck models are vehicle-models.ts' own).
// ---------------------------------------------------------------------------------------------------------

const CAR_STYLES: readonly CarStyle[] = ['sedan', 'hatch', 'suv', 'taxi', 'pickup'];
const MOTO_STYLES: readonly MotoStyle[] = ['cub', 'scooter', 'vespa'];
const BIG_KINDS: readonly FleetKind[] = ['bus', 'coach', 'truck'];
/** [length, width, height] of each wreck model: cars by CAR_STYLES, motorbikes, big vehicles by BIG_KINDS. */
const CAR_DIMS = CAR_STYLES.map((s) => { const c = carSpec(s); return [c.length, c.width, c.roof] as const; });
const MOTO_DIMS = [1.9, 0.72, 1.12] as const;
const BIG_DIMS = BIG_KINDS.map((k) => [FLEET[k].length, FLEET[k].width, FLEET[k].height] as const);
function dimsOf(kind: RuinKind, v: number): readonly [number, number, number] {
  if (kind === 'moto') return MOTO_DIMS;
  if (kind === 'bus') return BIG_DIMS[v % BIG_DIMS.length];
  return CAR_DIMS[v % CAR_DIMS.length];
}
/** Footprint half sizes and height of a vehicle rolled by roll (index) about its long axis. */
function rolled(kind: RuinKind, v: number, roll: number) {
  const [L, W, H] = dimsOf(kind, v), c = Math.abs(COS[wrap(roll)]), s = Math.abs(SIN[wrap(roll)]);
  return { hx: (c * W + s * H) / 2 + 0.04, hz: L / 2, top: s * W + c * H };
}

// ---------------------------------------------------------------------------------------------------------
// The planner.
// ---------------------------------------------------------------------------------------------------------

/** fy: a fine yaw index (π/2048 steps) when the yaw is not a multiple of π/32 (a rotated building's face), else -1. */
type ColDraft = { cx: number; cz: number; hx: number; hz: number; k: number; fy: number; top: number; idx: number; item: Draft | null; grid: BoxGrid | null; gid: number };
type Draft = { kind: RuinKind; x: number; z: number; y: number; k: number; fy: number; roll: number; s: number; v: number; ext: number[] | null; col: ColDraft | null; smash: boolean; dead: boolean; id: number; idx: number };
/** A plot's street front: start corner (x0, z0), unit along (t) and outward normal (n), width and depth, its yaw (k coarse, fk fine or -1). */
type Face = { q: number; k: number; fk: number; x0: number; z0: number; tx: number; tz: number; nx: number; nz: number; w: number; depth: number };
type Cluster = { cols: ColDraft[] };
type ChunkOut = { key: number; items: Draft[]; clusters: Cluster[]; fires: { x: number; z: number; y: number }[]; columns: { x: number; z: number; h: number }[]; holes: { x: number; z: number }[]; craters: { x: number; z: number }[]; hash: number };
type RoadC = { id: number; pts: number[]; cum: number[]; segK: number[]; len: number; clearA: number; clearB: number; half: number; walk: number; sidewalk: number; cls: 'R1' | 'R2' | 'hem'; traffic: boolean; bridge: boolean; a: number; b: number };

const byXZ = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x - b.x || a.z - b.z;
const byBox = (a: Box2, b: Box2) => a.minX - b.minX || a.minZ - b.minZ || a.maxX - b.maxX || a.maxZ - b.maxZ;
/** Rects first (by box), then oriented boxes (by centre, size, yaw). */
const bySolid = (a: RuinSolid, b: RuinSolid) => {
  const oa = isRuinBox(a), ob = isRuinBox(b);
  if (oa !== ob) return oa ? 1 : -1;
  if (!oa || !ob) return byBox(a as Box2, b as Box2);
  return a.cx - b.cx || a.cz - b.cz || a.hx - b.hx || a.hz - b.hz || a.yaw - b.yaw;
};
const byPoly = (a: readonly number[] | undefined, b: readonly number[] | undefined) => {
  const la = a?.length ?? 0, lb = b?.length ?? 0;
  if (la !== lb) return la - lb;
  for (let i = 0; i < la; i++) if (a![i] !== b![i]) return a![i] - b![i];
  return 0;
};
/** How far a district plot's rubble (its drawn extent) and corner collider may reach beyond its footprint (m). */
export const RUBBLE_MARGIN = 1.2;

/** Per class: [cars, motorbikes] per 100 m of road (§6c.1). */
const WRECKS_PER_100: Record<'R1' | 'R2' | 'hem', [number, number]> = { R1: [2.5, 3], R2: [1.5, 2.5], hem: [0, 1.5] };
const CELL_LEN = 12.5;
/** Layers of the chunk detail pass (their RNG streams). */
const L = { wreck: 0, corner: 1, shell: 2, tower: 3, sign: 4, window: 5, tree: 6, pole: 7, vine: 8, moss: 9, curb: 10, crackTuft: 11, crack: 12, green: 13, litter: 14, stall: 15, barricade: 16, checkpoint: 17, crater: 18, tangle: 20 } as const;
const MAX_ITEMS = 4096;
/** Grass clump candidates the polygon greens (the districts' parks) share in one chunk (a fully green chunk would have 2700). */
const GRASS_CAP = 900;
/** Clumps in one polygon-green strip item at most (about 2,600 triangles: the runtime builds a chunk an item at a time between frames). */
const GRASS_PIECE = 120;

/** Puts the input in a canonical order, so a shuffled input plans identically. */
function canonical(input: RuinInput): RuinInput {
  return {
    bounds: input.bounds,
    roads: [...input.roads].sort((a, b) => a.id - b.id),
    junctions: [...input.junctions].sort(byXZ),
    crosswalks: [...input.crosswalks].sort((a, b) => byXZ(a, b) || a.r - b.r),
    plots: [...input.plots].sort((a, b) => a.id - b.id),
    trees: [...input.trees].sort((a, b) => byXZ(a, b) || a.size - b.size),
    poles: [...input.poles].sort((a, b) => (a.line < b.line ? -1 : a.line > b.line ? 1 : 0) || byXZ(a, b)),
    lamps: [...input.lamps].sort(byXZ),
    greens: [...input.greens].sort((a, b) => byBox(a, b) || byPoly(a.poly, b.poly)),
    stalls: [...input.stalls].sort((a, b) => byXZ(a, b) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)),
    keepClear: [...input.keepClear].sort((a, b) => byXZ(a, b) || a.r - b.r || Number(!!a.major) - Number(!!b.major)),
    solids: [...input.solids].sort(bySolid),
    walks: input.walks ? [...input.walks].sort((a, b) => a.ax - b.ax || a.az - b.az || a.bx - b.bx || a.bz - b.bz) : undefined,
    checkpoints: input.checkpoints ? [...input.checkpoints].sort(byXZ) : undefined,
    fleet: input.fleet,
    // (the land is a union of polygons less holes: their order never matters)
    land: input.land,
    lane: input.lane,
  };
}

export type RuinPlanner = ReturnType<typeof createRuinPlanner>;

/**
 * The planner behind planRuins: the global pass runs once; chunk(key) plans one chunk (cached), in any order;
 * plan(keys) assembles a RuinPlan of the chunks asked for (all of them by default). Pure and deterministic.
 */
export function createRuinPlanner(rawInput: RuinInput, seed = APOCALYPSE_SEED) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const input = canonical(rawInput);
  const base = hash32(seed, APOCALYPSE_VERSION);
  const rngFor = (...v: number[]) => mulberry32(hash32(base, ...v));

  // ---- Roads, nodes (endpoints within 0.5 m are one node), walking legs, keep-clear, solids. ----
  const nodeIds = new Map<string, number>(), nodeXZ: number[] = [];
  const nodeOf = (x: number, z: number) => {
    const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let id = nodeIds.get(key);
    if (id === undefined) { id = nodeXZ.length / 2; nodeIds.set(key, id); nodeXZ.push(x, z); }
    return id;
  };
  const roads: RoadC[] = input.roads.filter((r) => r.pts.length >= 4).map((r) => {
    const pts = r.pts.slice(), cum = [0], segK: number[] = [];
    for (let i = 2; i < pts.length; i += 2) { const dx = pts[i] - pts[i - 2], dz = pts[i + 1] - pts[i - 1]; cum.push(cum[cum.length - 1] + Math.sqrt(dx * dx + dz * dz)); segK.push(yawIndexOf(dx, dz)); }
    const n = pts.length;
    return { id: r.id, pts, cum, segK, len: cum[cum.length - 1], clearA: 0, clearB: 0, half: r.half, walk: r.walk, sidewalk: r.sidewalk, cls: r.cls, traffic: r.traffic, bridge: !!r.bridge, a: nodeOf(pts[0], pts[1]), b: nodeOf(pts[n - 2], pts[n - 1]) };
  });
  /** Point, unit direction and yaw index at arc length s along a road. */
  function at(r: RoadC, s: number) {
    s = Math.max(0, Math.min(r.len, s));
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < s) i++;
    const ax = r.pts[(i - 1) * 2], az = r.pts[(i - 1) * 2 + 1], bx = r.pts[i * 2], bz = r.pts[i * 2 + 1];
    const seg = r.cum[i] - r.cum[i - 1] || 1, t = (s - r.cum[i - 1]) / seg;
    const hx = (bx - ax) / seg, hz = (bz - az) / seg;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, hx, hz, k: r.segK[i - 1] };
  }
  /** A point `off` metres to the side of a road at s: side +1 is (−hz, hx), roads.ts' right of a→b. */
  const beside = (p: { x: number; z: number; hx: number; hz: number }, off: number) => ({ x: p.x - p.hz * off, z: p.z + p.hx * off });

  const walks = new SegGrid();
  if (input.walks) for (const w of input.walks) walks.add(w.ax, w.az, w.bx, w.bz);
  else {
    for (const r of roads) for (let i = 2; i < r.pts.length; i += 2) {
      const ax = r.pts[i - 2], az = r.pts[i - 1], bx = r.pts[i], bz = r.pts[i + 1], l = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) || 1;
      const nx = -(bz - az) / l, nz = (bx - ax) / l;
      if (r.walk > 0) for (const sd of [-1, 1]) walks.add(ax + nx * r.walk * sd, az + nz * r.walk * sd, bx + nx * r.walk * sd, bz + nz * r.walk * sd);
      else walks.add(ax, az, bx, bz);
    }
    // A crosswalk is a disc here: guard it with a cross of two legs.
    for (const c of input.crosswalks) { walks.add(c.x - c.r, c.z, c.x + c.r, c.z); walks.add(c.x, c.z - c.r, c.x, c.z + c.r); }
  }
  // Road centrelines, for "which road is this next to".
  const centre = new SegGrid();
  roads.forEach((r, ri) => { for (let i = 2; i < r.pts.length; i += 2) centre.add(r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1], ri * 65536 + i / 2 - 1); });
  function nearestRoad(x: number, z: number, max: number) {
    let best: { r: RoadC; s: number; off: number; d: number } | null = null, bd = max * max;
    const g = centre.segs;
    centre.some(x - max, z - max, x + max, z + max, (id) => {
      const o = id * 5, ax = g[o], az = g[o + 1], vx = g[o + 2] - ax, vz = g[o + 3] - az, l2 = vx * vx + vz * vz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
      const dx = x - ax - vx * t, dz = z - az - vz * t, d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        const r = roads[Math.floor(g[o + 4] / 65536)], seg = g[o + 4] % 65536, l = Math.sqrt(l2) || 1;
        best = { r, s: r.cum[seg] + t * l, off: (-(vz / l) * (x - ax) + (vx / l) * (z - az)), d: Math.sqrt(d) };
      }
      return false;
    });
    return best as { r: RoadC; s: number; off: number; d: number } | null;
  }
  const solids = new BoxGrid();
  for (const s of input.solids) solids.add(solidObb(s), -1);
  // A plot with an oriented box (the districts'): its box at its fine yaw, its front face along it.
  const plotObb = new Map<RuinPlotInput, OBB>();
  for (const p of input.plots) if (p.box) plotObb.set(p, obbF(p.box.cx, p.box.cz, p.box.hx, p.box.hz, fineOf(p.box.yaw)));
  const plotGrid = new BoxGrid();
  for (const p of input.plots) plotGrid.add(plotObb.get(p) ?? rectObb(p), p.id);
  /** A plot's middle (its box's centre, else its rect's): which chunk plans it. */
  const middle = (p: RuinPlotInput) => (p.box ? [p.box.cx, p.box.cz] : [(p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2]);
  /** The front face of a plot: today's rect plots by `facing` (or quadrant q), box plots along their box. */
  const faceOf = (p: RuinPlotInput, q?: number): Face => {
    const B = plotObb.get(p);
    if (!B || !p.box) return face(q === undefined ? p : p.ground ?? p, q);
    const kf = fineOf(p.box.yaw);
    return { q: -1, k: wrap(Math.round(kf / SUB)), fk: kf % SUB ? kf : -1, x0: B.cx + B.s * B.hz - B.c * B.hx, z0: B.cz + B.c * B.hz + B.s * B.hx, tx: B.c, tz: -B.s, nx: B.s, nz: B.c, w: B.hx * 2, depth: B.hz * 2 };
  };
  /** The solid lies inside the plot (its own building's collider, which ruins against its wall may touch). */
  const ownSolid = (p: RuinPlotInput) => {
    const B = plotObb.get(p);
    return B ? (b: OBB) => insideObb(b, B, 0.05) : (b: OBB) => insideRect(b, p);
  };
  const landAt = input.land ? landGrid(input.land, input.bounds, roads.filter((r) => r.bridge)) : null;
  const keep = input.keepClear;
  const keepGrid = new SegGrid();
  keep.forEach((k, i) => keepGrid.add(k.x, k.z, k.x, k.z, i));
  /** The box comes within the keep-clear radius (+ extra) of some spot. */
  const keepHit = (b: OBB, extra = 0) => keepGrid.some(b.cx - b.ex - 70, b.cz - b.ez - 70, b.cx + b.ex + 70, b.cz + b.ez + 70, (id) => {
    const k = keep[keepGrid.segs[id * 5 + 4]], r = k.r + extra;
    return r > 0 && dist2(b, k.x, k.z) < r * r;
  });
  const juncs = input.junctions;
  const juncGrid = new SegGrid();
  let maxJr = 0;
  juncs.forEach((j, i) => { juncGrid.add(j.x, j.z, j.x, j.z, i); maxJr = Math.max(maxJr, j.r); });
  const junctionNear = (x: number, z: number, extra: number) => {
    const m = maxJr + Math.max(extra, 0) + 1;
    return juncGrid.some(x - m, z - m, x + m, z + m, (id) => { const j = juncs[juncGrid.segs[id * 5 + 4]], dx = x - j.x, dz = z - j.z, r = j.r + extra; return r > 0 && dx * dx + dz * dz < r * r; });
  };
  // Each road's ends inside a junction (its box crossing the other roads): strips start past it.
  for (const r of roads) for (const end of [0, 1] as const) {
    const n = end ? r.b : r.a, x = nodeXZ[n * 2], z = nodeXZ[n * 2 + 1];
    let clear = 0;
    juncGrid.some(x - maxJr - 2, z - maxJr - 2, x + maxJr + 2, z + maxJr + 2, (id) => { const j = juncs[juncGrid.segs[id * 5 + 4]], dx = x - j.x, dz = z - j.z; if (dx * dx + dz * dz <= (j.r + 2) * (j.r + 2)) clear = Math.max(clear, j.r + 0.5); return false; });
    if (end) r.clearB = clear; else r.clearA = clear;
  }
  const inGreen = (x: number, z: number) => input.greens.some((g) => x > g.minX && x < g.maxX && z > g.minZ && z < g.maxZ && (!g.poly || inPoly(g.poly, x, z)));

  // ---- Global pass over the road graph. ----
  const global = new BoxGrid();          // global colliders (tag = cluster) and reserved fleet spots (tag −2)
  const globalDrafts: Draft[] = [], globalClusters: Cluster[] = [];
  let clusterSeq = 0;
  const draft = (kind: RuinKind, x: number, z: number, k: number, extra: Partial<Draft> = {}): Draft =>
    ({ kind, x, z, y: 0, k: wrap(k), fy: -1, roll: 0, s: 1, v: 0, ext: null, col: null, smash: false, dead: false, id: -1, idx: -1, ...extra });
  /** Half the drive lane (input.lane) and its centre lines: every traffic road not fully blocked (set after the full blocks). */
  const laneHalf = input.lane && input.lane > 0 ? input.lane / 2 : 0;
  let drives: SegGrid | null = null;

  /**
   * Gives d a collider (cx, cz, hx, hz, k, top) when the box keeps 1 m from every walking leg, overlaps no solid (pad
   * apart), no other ruin collider (pad apart; padSame inside the same cluster), no keep-clear spot and stays inside
   * `within` (a chunk, less 0.6 m), on land and out of the drive lanes when the input has them. `fy` turns the box by
   * a fine yaw instead (a rotated building's face). Returns false and leaves d without one otherwise.
   */
  function place(d: Draft, cx: number, cz: number, hx: number, hz: number, k: number, top: number, grids: BoxGrid[], o: { pad?: number; padSame?: number; cluster?: number; within?: Box2 | null; keepExtra?: number; ignoreSolid?: (b: OBB) => boolean; fy?: number } = {}) {
    const fy = o.fy ?? -1, b = fy >= 0 ? obbF(cx, cz, hx, hz, fy) : obb(cx, cz, hx, hz, k), pad = o.pad ?? 1.1, cluster = o.cluster ?? -1;
    if (o.within && (b.cx - b.ex < o.within.minX + 0.6 || b.cx + b.ex > o.within.maxX - 0.6 || b.cz - b.ez < o.within.minZ + 0.6 || b.cz + b.ez > o.within.maxZ - 0.6)) return false;
    if (b.cx - b.ex < input.bounds.minX || b.cx + b.ex > input.bounds.maxX || b.cz - b.ez < input.bounds.minZ || b.cz + b.ez > input.bounds.maxZ) return false;
    if (landAt && !landAt.box(b)) return false;
    if (walks.near(b, 1.0)) return false;
    if (drives && drives.near(b, laneHalf)) return false;
    if (keepHit(b, o.keepExtra ?? 0)) return false;
    const ignore = o.ignoreSolid;
    if (solids.some(b.cx - b.ex - pad, b.cz - b.ez - pad, b.cx + b.ex + pad, b.cz + b.ez + pad, (id) => !(ignore && ignore(solids.boxes[id])) && overlap(b, solids.boxes[id], pad))) return false;
    for (const g of grids) if (g.hits(b, pad, cluster, o.padSame ?? pad)) return false;
    const grid = grids[grids.length - 1];
    d.col = { cx, cz, hx, hz, k: wrap(k), fy, top, idx: -1, item: d, grid, gid: grid.add(b, cluster) };
    return true;
  }

  /** Takes a piece out again (its box stays filed but is ignored from now on). */
  function kill(d: Draft) {
    d.dead = true;
    if (d.col?.grid) d.col.grid.tags[d.col.gid] = DEAD;
  }

  /** A vehicle wreck's pose: yaw index, roll index, burnt. */
  function vehiclePose(R: Rng, kind: RuinKind, roadK: number, skew: number) {
    const flip = R() < 0.5 ? 32 : 0, u = R();
    const dev = u < 0.5 ? 0 : u < 0.8 ? (R() < 0.5 ? -1 : 1) * (1 + Math.floor(R() * 3)) : u < 0.95 ? (R() < 0.5 ? -1 : 1) * (5 + Math.floor(R() * 7 * skew)) : 16;
    const w = R();
    let roll = 0;
    if (kind === 'moto') roll = w < 0.55 ? (R() < 0.5 ? -15 : 15) : w < 0.75 ? (R() < 0.5 ? -2 : 2) : 0;
    else roll = w < 0.65 ? 0 : w < 0.75 ? (R() < 0.5 ? -1 : 1) : w < 0.9 ? (R() < 0.5 ? -16 : 16) : 32;
    return { k: wrap(roadK + flip + dev), roll };
  }
  function vehicleDraft(R: Rng, kind: 'car' | 'moto' | 'bus', x: number, z: number, k: number, roll: number, burntShare: number) {
    const burnt = R() < burntShare;
    const v = kind === 'car' ? Math.floor(R() * CAR_STYLES.length) + 8 * Math.floor(R() * 16) : kind === 'moto' ? Math.floor(R() * MOTO_STYLES.length) + 8 * Math.floor(R() * 16) : Math.floor(R() * BIG_KINDS.length) + 8 * Math.floor(R() * 16);
    // v: the model in bits 0-2, a paint index in bits 3-6, bit 7 a wreck still burning, bit 8 a burnt motorbike or bus.
    const burning = burnt && R() < 0.3;
    return draft(kind === 'car' && burnt ? 'carBurnt' : kind, x, z, k, { roll, v: v + (burning ? 128 : 0) + (burnt && kind !== 'car' ? 256 : 0), smash: true });
  }
  const isBurnt = (d: { kind: RuinKind; v: number }) => d.kind === 'carBurnt' || (d.v & 256) !== 0;
  const isBurning = (d: { v: number }) => (d.v & 128) !== 0;

  // Junction approaches: (junction, road, end), the unit direction into the road.
  type Approach = { j: number; r: RoadC; end: 0 | 1 };
  const approaches: Approach[] = [];
  juncs.forEach((j, ji) => {
    if (j.arms < 3) return;
    for (const r of roads) for (const end of [0, 1] as const) {
      const n = end ? r.b : r.a, dx = nodeXZ[n * 2] - j.x, dz = nodeXZ[n * 2 + 1] - j.z;
      if (dx * dx + dz * dz <= (j.r + 2) * (j.r + 2)) approaches.push({ j: ji, r, end });
    }
  });
  const blockedEdges = new Set<number>();
  // Car connectivity: union-find over traffic edges minus the blocked ones.
  const traffic = roads.filter((r) => r.traffic);
  function components(blocked: Set<number>) {
    const parent = nodeXZ.map((_, i) => i).slice(0, nodeXZ.length / 2);
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const used = new Set<number>();
    for (const r of traffic) { used.add(r.a); used.add(r.b); if (!blocked.has(r.id)) { const a = find(r.a), b = find(r.b); if (a !== b) parent[a] = b; } }
    const roots = new Set<number>();
    for (const n of used) roots.add(find(n));
    return roots.size;
  }
  const baseComponents = components(blockedEdges);
  // Traffic arms per node, and how many of them are fully blocked (with a drive lane: a junction keeps two open).
  const armsAt = new Map<number, number>(), blockedAt = new Map<number, number>();
  for (const r of traffic) for (const n of [r.a, r.b]) armsAt.set(n, (armsAt.get(n) ?? 0) + 1);
  const keepsTwoOpen = (n: number) => { const arms = armsAt.get(n) ?? 0; return arms < 3 || arms - (blockedAt.get(n) ?? 0) - 1 >= 2; };

  {
    // Full carriageway blocks: a wall of wrecks across ≤ 10% of R1/R2 edges, never on bridges, never within 60 m of a
    // keep-clear spot, never disconnecting the car graph (with a drive lane, never leaving a junction one open arm).
    const eligible = roads.filter((r) => r.traffic && r.cls !== 'hem' && !r.bridge && r.len >= 40);
    eligible.forEach((r, rank) => {
      if (!weyl(rank, 0.08, 11)) return;
      const R = rngFor(1, r.id);
      const p = at(r, r.len * (0.35 + R() * 0.3));
      if (keep.some((k) => (k.major ?? k.r >= 10) && (k.x - p.x) * (k.x - p.x) + (k.z - p.z) * (k.z - p.z) < (k.r + 60) * (k.r + 60)) || junctionNear(p.x, p.z, 14)) return;
      if (laneHalf && (!keepsTwoOpen(r.a) || !keepsTwoOpen(r.b))) return;
      const trial = new Set(blockedEdges); trial.add(r.id);
      if (components(trial) !== baseComponents) return;
      const cluster = clusterSeq++, cl: Cluster = { cols: [] };
      const made: Draft[] = [];
      const across = r.half > 5 ? [-1, 0, 1] : [-0.5, 0.5];
      let ok = true;
      for (const a of across) {
        const off = a * (r.half > 5 ? 4.6 : 2.3) + (R() - 0.5) * 0.3;
        const q = beside(p, off), k = wrap(p.k + 16 + (R() < 0.5 ? 0 : 32) + Math.floor(R() * 3) - 1), d = vehicleDraft(R, 'car', q.x, q.z, k, 0, 0.45);
        const f = rolled(d.kind, d.v & 7, 0);
        if (!place(d, q.x, q.z, f.hx, f.hz, k, f.top, [global], { cluster, padSame: 0.05 })) { ok = false; break; }
        made.push(d); cl.cols.push(d.col!);
      }
      if (!ok) { for (const d of made) kill(d); return; }
      // Bikes thrown against the wall.
      for (let i = 0; i < 2; i++) {
        const q = beside(at(r, r.len * 0.5), (R() - 0.5) * r.half * 1.6);
        made.push(draft('moto', q.x + (R() - 0.5) * 3, q.z + (R() - 0.5) * 3, Math.floor(R() * 64), { roll: R() < 0.5 ? 15 : -15, v: Math.floor(R() * 3) + 8 * Math.floor(R() * 16), smash: true }));
      }
      blockedEdges.add(r.id);
      blockedAt.set(r.a, (blockedAt.get(r.a) ?? 0) + 1); blockedAt.set(r.b, (blockedAt.get(r.b) ?? 0) + 1);
      globalDrafts.push(...made); globalClusters.push(cl);
    });
  }
  if (laneHalf) {
    // The drive lanes: down the centre line of every traffic road that is not fully blocked (hẻm wrecks are walk-over).
    const lanes = new SegGrid();
    for (const r of roads) {
      if (!r.traffic || r.cls === 'hem' || blockedEdges.has(r.id)) continue;
      for (let i = 2; i < r.pts.length; i += 2) lanes.add(r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1]);
    }
    drives = lanes;
  }
  {
    // Pile-ups (3–6 vehicles, sometimes a motorbike on a car's roof) at 15% of junction approaches; a quarter of them
    // block the inbound side (with a drive lane: up to it, on roads wide enough).
    approaches.forEach((ap, rank) => {
      const r = ap.r;
      if (!r.traffic || r.bridge || r.len < 36 || !weyl(rank, 0.15, 23)) return;
      const R = rngFor(2, ap.j, r.id, ap.end), j = juncs[ap.j];
      const along = j.r + 9 + R() * 9, s = ap.end ? r.len - along : along;
      const p = at(r, s), side = R() < 0.5 ? -1 : 1, block = R() < 0.25 && (!laneHalf || r.half >= 6);
      const cluster = clusterSeq++, cl: Cluster = { cols: [] }, made: Draft[] = [];
      const n = 3 + Math.floor(R() * 4);
      for (let i = 0; i < n * 3 && made.length < n; i++) {
        const first = made.length === 0;
        const lat = block && made.length < 2 ? side * Math.max(r.half * (made.length ? 0.72 : 0.3), laneHalf ? laneHalf + (made.length ? 3.4 : 2.45) : 0)
          : side * (laneHalf ? laneHalf + 1 + R() * Math.max(0, r.half - laneHalf - 2) : 0.6 + R() * (r.half - 1.6));
        const q = beside(p, lat), ds = (R() - 0.5) * 9;
        const x = q.x + p.hx * ds, z = q.z + p.hz * ds;
        const kind: 'car' | 'moto' | 'bus' = R() < 0.18 ? 'moto' : 'car';
        const pose = block && made.length < 2 ? { k: wrap(p.k + 16 + Math.floor(R() * 5) - 2), roll: 0 } : vehiclePose(R, kind, p.k, 1.5);
        const d = vehicleDraft(R, kind, x, z, pose.k, pose.roll, 0.4);
        const f = rolled(d.kind, d.v & 7, pose.roll);
        if (place(d, x, z, f.hx, f.hz, pose.k, f.top, [global], { cluster, padSame: first ? 1.1 : 0.15 })) { made.push(d); cl.cols.push(d.col!); }
      }
      if (made.length < 2) { for (const d of made) kill(d); return; }
      // A motorbike on the roof of an upright car.
      const host = made.find((d) => d.kind !== 'moto' && d.roll === 0);
      if (host && R() < 0.4) {
        const f = rolled(host.kind, host.v & 7, 0);
        made.push(draft('moto', host.x, host.z, host.k + 8 + Math.floor(R() * 16), { y: f.top - 0.05, roll: 15, v: Math.floor(R() * 3) + 8 * Math.floor(R() * 16), smash: true }));
      }
      // Glass and scrap round it, scorch under the burnt ones.
      made.push(draft('shards', p.x + p.hx * 2, p.z + p.hz * 2, Math.floor(R() * 64), { s: 3 + R() * 2, v: Math.floor(R() * 1000) }));
      for (const d of made) if (isBurnt(d) && d.kind !== 'moto') made.push(draft('scorch', d.x, d.z, d.k, { s: r2(1.4 + R() * 0.5), v: Math.floor(R() * 1000) }));
      globalDrafts.push(...made); globalClusters.push(cl);
    });
  }
  {
    // A bus, coach or truck crash per ~600 m of R1: on its side, or skewed into the kerb.
    const r1 = roads.filter((r) => r.cls === 'R1' && !r.bridge && r.len > 30);
    const total = r1.reduce((sum, r) => sum + r.len, 0), n = total >= 300 ? Math.round(total / 600) : 0;
    for (let i = 0; i < n; i++) {
      const R = rngFor(3, i);
      let target = (i + 0.25 + R() * 0.5) * (total / n);
      for (let tries = 0; tries < 8; tries++, target += 17) {
        let acc = 0, road: RoadC | null = null, s = 0;
        for (const r of r1) { if (target - acc <= r.len) { road = r; s = target - acc; break; } acc += r.len; }
        if (!road) break;
        const p = at(road, s);
        if (junctionNear(p.x, p.z, 10)) continue;
        const kind = Math.floor(R() * 3), side = R() < 0.5 ? -1 : 1, onSide = R() < 0.5;
        const flip = R() < 0.5 ? 0 : 32;
        // (beside a drive lane on a 7 m road, a skewed bus turns at most two steps)
        const turn = onSide ? Math.floor(R() * 3) - 1 : side * (laneHalf && road.half < 9 ? 1 + (Math.floor(R() * 4) & 1) : 2 + Math.floor(R() * 4));
        const roll = onSide ? (side > 0 ? 16 : -16) : 0, k = wrap(p.k + flip + turn);
        const f = rolled('bus', kind, roll);
        const q = beside(p, side * Math.max(0, road.half - f.hx - 0.6 - (onSide ? 0 : 1.6)));
        const d = draft('bus', q.x, q.z, k, { roll, v: kind + 8 * Math.floor(R() * 16) + (R() < 0.35 ? 256 : 0), smash: true });
        const cluster = clusterSeq++;
        if (!place(d, q.x, q.z, f.hx, f.hz, k, f.top, [global], { cluster })) continue;
        globalDrafts.push(d, draft('shards', q.x + p.hx * 3, q.z + p.hz * 3, Math.floor(R() * 64), { s: 4, v: Math.floor(R() * 1000) }));
        if (isBurnt(d)) globalDrafts.push(draft('scorch', q.x, q.z, k, { s: 3, v: Math.floor(R() * 1000) }));
        globalClusters.push({ cols: [d.col!] });
        break;
      }
    }
  }
  // Fleet wreck spots: vehicles.ts' own traffic cars and motorbikes, abandoned in the lanes (reserved space, no collider).
  const fleetSpots: RuinPlan['fleetSpots'] = [];
  {
    const want = { car: input.fleet?.cars ?? 10, moto: input.fleet?.motos ?? 28 };
    const lanes = roads.filter((r) => r.traffic && !r.bridge && r.cls !== 'hem' && r.len > 20);
    const total = lanes.reduce((sum, r) => sum + r.len, 0), count = want.car + want.moto;
    const R = rngFor(4);
    for (let i = 0, tries = 0; fleetSpots.length < count && tries < count * 12 && total > 0; tries++) {
      const kind: 'car' | 'moto' = i < want.car ? 'car' : 'moto';
      let target = ((tries * 0.6180339887498949 + R() * 0.05) % 1) * total, road = lanes[0];
      for (const r of lanes) { if (target <= r.len) { road = r; break; } target -= r.len; }
      const p = at(road, target);
      if (junctionNear(p.x, p.z, 6)) continue;
      // (a car beside a drive lane keeps its whole turned footprint out of it)
      const lat = kind === 'car' ? (laneHalf ? Math.max(road.half * 0.43, laneHalf + 2.75) : road.half * 0.43) : road.half * 0.77;
      const side = R() < 0.5 ? -1 : 1, q = beside(p, side * lat + (R() - 0.5));
      const k = wrap(p.k + (side > 0 ? 0 : 32) + Math.floor(R() * 9) - 4);
      const b = obb(q.x, q.z, kind === 'car' ? 1.3 : 0.6, kind === 'car' ? 2.7 : 1.3, k);
      if (walks.near(b, 0.6) || keepHit(b) || global.hits(b, 2.0) || solids.hits(b, 0.8)) continue;
      if ((drives && drives.near(b, laneHalf)) || (landAt && !landAt.box(b))) continue;
      global.add(b, -2);
      fleetSpots.push({ x: r2(q.x), z: r2(q.z), yaw: k * STEP, kind });
      i++;
    }
    fleetSpots.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'car' ? -1 : 1));
  }
  // Global drafts by chunk (in global order).
  const globalByChunk = new Map<number, Draft[]>();
  for (const d of globalDrafts) {
    if (d.dead) continue;
    const key = chunkOf(d.x, d.z), l = globalByChunk.get(key);
    if (l) l.push(d); else globalByChunk.set(key, [d]);
  }
  const clusterOfCol = new Map<ColDraft, Cluster>();
  for (const c of globalClusters) for (const col of c.cols) clusterOfCol.set(col, c);

  // ---- Shared candidate lists for the chunk passes (global ranks keep selections even and order-free). ----
  const lowPlots = input.plots.filter((p) => p.h <= 40 && p.h >= 3 && p.style !== 'tower');
  const cornerPlots = lowPlots.filter((p) => !p.keep && p.h >= 5 && p.style !== 'kiosk');
  const towers = input.plots.filter((p) => p.h > 40 || p.style === 'tower');
  const signPlots = input.plots.filter((p) => p.sign && p.h <= 40);
  const rankOf = <T>(list: readonly T[]) => new Map(list.map((v, i) => [v, i] as const));
  const cornerRank = rankOf(cornerPlots), lowRank = rankOf(lowPlots), towerRank = rankOf(towers), signRank = rankOf(signPlots);
  // Street trees by road side, and the gaps between consecutive ones.
  type Gap = { r: RoadC; s: number; off: number; len: number; species: string; size: number };
  const treeGaps: Gap[] = [];
  {
    const sides = new Map<string, { r: RoadC; s: number; off: number; t: (typeof input.trees)[number] }[]>();
    for (const t of input.trees) {
      const n = nearestRoad(t.x, t.z, 16);
      if (!n || Math.abs(n.off) < n.r.half || Math.abs(n.off) > n.r.half + n.r.sidewalk + 1.5) continue;
      const key = `${n.r.id}:${n.off > 0 ? 1 : -1}`, l = sides.get(key);
      const e = { r: n.r, s: n.s, off: n.off, t };
      if (l) l.push(e); else sides.set(key, [e]);
    }
    for (const key of [...sides.keys()].sort()) {
      const l = sides.get(key)!.sort((a, b) => a.s - b.s);
      for (let i = 1; i < l.length; i++) {
        const gap = l[i].s - l[i - 1].s;
        if (gap >= 6 && gap <= 40) treeGaps.push({ r: l[i].r, s: (l[i].s + l[i - 1].s) / 2, off: (l[i].off + l[i - 1].off) / 2, len: gap, species: l[i].t.species, size: l[i].t.size });
      }
    }
  }
  // Power-pole spans: consecutive poles of one line.
  type Span = { ax: number; az: number; bx: number; bz: number };
  const spans: Span[] = [];
  for (let i = 1; i < input.poles.length; i++) {
    const a = input.poles[i - 1], b = input.poles[i];
    if (a.line !== b.line) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 >= 12 * 12 && d2 <= 42 * 42) spans.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
  }
  // Road cells: (road, index) with their middle's chunk.
  const roadCells = new Map<number, { r: RoadC; j: number }[]>();
  for (const r of roads) for (let j = 0; j * CELL_LEN < r.len; j++) {
    const m = at(r, Math.min(r.len, (j + 0.5) * CELL_LEN)), key = chunkOf(m.x, m.z), l = roadCells.get(key);
    if (l) l.push({ r, j }); else roadCells.set(key, [{ r, j }]);
  }
  const R1_TOTAL = roads.reduce((sum, r) => sum + (r.cls === 'R1' ? r.len : 0), 0);
  // Shell slots: one per 250 m of road, counted along all the roads in order (most edges are shorter than that).
  const shellSlots: { r: RoadC; s: number; i: number; side: number }[] = [];
  {
    let acc = 0, next = 125;
    for (const r of roads) {
      if (r.cls === 'hem') continue;
      while (next < acc + r.len) { const i = shellSlots.length; shellSlots.push({ r, s: next - acc, i, side: hash32(r.id, i) & 1 ? 1 : -1 }); next += 250; }
      acc += r.len;
    }
  }

  // ---- The chunk detail pass. ----
  const cache = new Map<number, ChunkOut>();
  function chunk(key: number): ChunkOut {
    const hit = cache.get(key);
    if (hit) return hit;
    const cx = keyX(key), cz = keyZ(key);
    const box: Box2 = { minX: cx * CHUNK, minZ: cz * CHUNK, maxX: (cx + 1) * CHUNK, maxZ: (cz + 1) * CHUNK };
    const inChunk = (x: number, z: number) => x >= box.minX && x < box.maxX && z >= box.minZ && z < box.maxZ;
    const local = new BoxGrid();
    const grids = [global, local];
    const items: Draft[] = (globalByChunk.get(key) ?? []).slice();
    const clusters: Cluster[] = [];
    const fires: ChunkOut['fires'] = [], columns: ChunkOut['columns'] = [], holes: ChunkOut['holes'] = [], craters: ChunkOut['craters'] = [];
    let localCluster = 1_000_000 + key * 64;
    const push = (d: Draft) => { if (items.length < MAX_ITEMS) items.push(d); return d; };
    /** A lone collider kept closer to its neighbours (pad), checked for pockets as a cluster of one. */
    const solo = (d: Draft, x: number, z: number, hx: number, hz: number, k: number, top: number, pad: number, ignoreSolid?: (b: OBB) => boolean, fy = -1) => {
      const cluster = localCluster++;
      if (!place(d, x, z, hx, hz, k, top, grids, { within: box, pad, cluster, ignoreSolid, fy })) return false;
      clusters.push({ cols: [d.col!] });
      return true;
    };
    const cells = roadCells.get(key) ?? [];
    /** A road cell's middle and the part of it (u0..u1 along the road from there) clear of the junctions at the road's ends. */
    const cellSpan = (r: RoadC, j: number) => {
      const s0 = Math.max(j * CELL_LEN, r.clearA), s1 = Math.min((j + 1) * CELL_LEN, r.len - r.clearB);
      if (s1 - s0 < 1) return null;
      const mid = j * CELL_LEN + Math.min(CELL_LEN, r.len - j * CELL_LEN) / 2, p = at(r, mid);
      return { p, u0: s0 - mid, u1: s1 - mid };
    };
    const asphalt = (R: Rng, r: RoadC, j: number) => {
      const s = Math.min(r.len, (j + R()) * CELL_LEN), p = at(r, s);
      return { p, q: beside(p, (R() * 2 - 1) * (r.half - 0.3)) };
    };

    // Barricades at 30% of the junctions: sandbags, a plank barrier and oil drums (one burning) across part of an arm.
    // Planned before the lone wrecks, so they get their pick of the arms.
    juncs.forEach((jn, rank) => {
      if (!inChunk(jn.x, jn.z) || !weyl(rank, 0.3, 67)) return;
      const R = rngFor(5, cx, cz, L.barricade, rank);
      const arms = approaches.filter((a) => a.j === rank);
      if (!arms.length) return;
      const first = Math.floor(R() * arms.length), side0 = R() < 0.5 ? -1 : 1, len = 4 + R() * 3;
      const cluster = localCluster++, cl: Cluster = { cols: [] };
      for (let attempt = 0; attempt < 12 && !cl.cols.length; attempt++) {
        const ap = arms[(first + attempt) % arms.length], r = ap.r, along = jn.r + 4 + (Math.floor(attempt / arms.length) % 3) * 2.5, s = ap.end ? r.len - along : along;
        if (s < 4 || s > r.len - 4) continue;
        // (with a drive lane the bags stop short of it)
        const p = at(r, s), side = attempt % 2 ? -side0 : side0, l = laneHalf ? Math.min(r.half * 1.1, len, r.half - laneHalf - 0.3) : Math.min(r.half * 1.1, len);
        if (l < 1) continue;
        // Every piece runs across the road: its long axis is the box's side axis, so the yaw is the road's.
        const c = beside(p, side * (r.half - l / 2 - 0.3)), k = p.k, back = ap.end ? 1 : -1;
        const bags = draft('barricade', c.x, c.z, k, { s: r2(l), v: 0 + 4 * Math.floor(R() * 1000) });
        if (!place(bags, c.x, c.z, l / 2, 0.45, k, 0.8, grids, { cluster, within: box, padSame: 0 })) continue;
        push(bags); cl.cols.push(bags.col!);
        const b2 = beside(p, side * (r.half - l - 2.6)), q2x = b2.x - p.hx * back * 2.4, q2z = b2.z - p.hz * back * 2.4;
        const planks = draft('barricade', q2x, q2z, k + Math.floor(R() * 5) - 2, { s: 2.2, v: 1 + 4 * Math.floor(R() * 1000) });
        if (place(planks, q2x, q2z, 1.15, 0.3, planks.k, 1.1, grids, { cluster, within: box, padSame: 1.1 })) { push(planks); cl.cols.push(planks.col!); }
        const drums = 2 + Math.floor(R() * 3);
        for (let i = 0; i < drums; i++) {
          const q = beside(p, side * (r.half - 0.6 - R() * 1.2)), dx = q.x + p.hx * back * (1.3 + i * 0.75), dz = q.z + p.hz * back * (1.3 + i * 0.75);
          const burning = i === 0 && R() < 0.6;
          const drum = draft('barrel', dx, dz, 0, { v: (burning ? 1 : 0) + 2 * Math.floor(R() * 1000) });
          if (place(drum, dx, dz, 0.32, 0.32, 0, 0.92, grids, { cluster, within: box, padSame: 0.05 })) { push(drum); cl.cols.push(drum.col!); if (burning) fires.push({ x: r2(dx), z: r2(dz), y: 0.95 }); }
        }
        const wire = beside(p, side * (r.half - l / 2 - 0.3));
        push(draft('barricade', wire.x - p.hx * back * 1.1, wire.z - p.hz * back * 1.1, k, { s: r2(l), v: 3 + 4 * Math.floor(R() * 1000) }));
      }
      if (cl.cols.length) clusters.push(cl);
    });
    // Lone wrecks in the lanes: cars and motorbikes by class density.
    {
      const R = rngFor(5, cx, cz, L.wreck), debt = { car: 0, moto: 0 };
      let lastRoad: RoadC | null = null;
      for (const { r, j } of cells) {
        if (r !== lastRoad) { debt.car = 0; debt.moto = 0; lastRoad = r; }
        const cellLen = Math.min(CELL_LEN, r.len - j * CELL_LEN);
        const [cars, motos] = WRECKS_PER_100[r.cls];
        for (const kind of ['car', 'moto'] as const) {
          // A wreck that found no room is owed to the next cells of the chunk, so crowded streets keep their density.
          const lambda = (kind === 'car' ? cars : motos) * cellLen / 100, n = Math.floor(lambda + R()) + debt[kind];
          debt[kind] = 0;
          for (let i = 0; i < n; i++) {
            let placed = false;
            for (let attempt = 0; attempt < 6 && !placed; attempt++) {
              const s = j * CELL_LEN + R() * cellLen, p = at(r, s);
              if (junctionNear(p.x, p.z, 3)) continue;
              // (beside a drive lane a car keeps to the outer part of its half, and on a boulevard a motorbike keeps
              // inside the curb bays)
              const side = R() < 0.5 ? -1 : 1, lane = kind === 'car' ? (laneHalf && r.cls !== 'hem' ? Math.max(0.43, (laneHalf + 1.15) / r.half) : 0.43) : laneHalf && r.half >= 9 ? 7 / r.half : 0.77;
              const q = beside(p, side * (r.half * lane + (R() - 0.5) * 1.0));
              const pose = vehiclePose(R, kind, p.k, 1);
              const d = vehicleDraft(R, kind, q.x, q.z, pose.k, pose.roll, kind === 'car' ? 0.35 : 0.15);
              const f = rolled(d.kind, d.v & 7, pose.roll);
              // A hẻm is too narrow for a collider 1 m off its centre line: its fallen bikes are walk-over (never at a door).
              if (r.cls === 'hem') {
                if (keepHit(obb(q.x, q.z, f.hx, f.hz, pose.k))) continue;
                d.smash = true; push(d); placed = true; break;
              }
              if (!place(d, q.x, q.z, f.hx, f.hz, pose.k, f.top, grids, { within: box, pad: 1.0 })) continue;
              push(d); placed = true;
              if (isBurnt(d) && d.kind !== 'moto') push(draft('scorch', q.x, q.z, d.k, { s: r2(1.3 + R() * 0.5), v: Math.floor(R() * 1000) }));
              else if (d.kind === 'car' && pose.roll === 0 && R() < 0.1) {
                // Nose down in a crater: pitched 2 steps (11°), the crater under its front.
                d.ext = [2];
                const L2 = dimsOf(d.kind, d.v & 7)[0] / 2;
                push(draft('crater', q.x + SIN[pose.k] * L2, q.z + COS[pose.k] * L2, Math.floor(R() * 64), { s: 1.6, v: Math.floor(R() * 1000) }));
              }
            }
            if (!placed) debt[kind] = Math.min(3, debt[kind] + 1);
          }
        }
      }
    }
    // Half-collapsed corners: a breach painted on the corner, slabs and rebar, a rubble slope with a collider core.
    for (const p of cornerPlots) {
      const [mx, mz] = middle(p);
      if (!inChunk(mx, mz) || !weyl(cornerRank.get(p)!, 0.06, 31)) continue;
      const R = rngFor(5, cx, cz, L.corner, p.id);
      const f = faceOf(p), end = R() < 0.5, cxp = end ? f.x0 + f.tx * f.w : f.x0, czp = end ? f.z0 + f.tz * f.w : f.z0;
      const wFront = Math.min(f.w * 0.6, 2.5 + R() * 2), frac = 0.3 + R() * 0.2;
      const sideW = Math.min(f.depth * 0.6, 2 + R() * 1.5);
      if (p.box) {
        // A district building (its box, rotated or not): the rubble heaps against the corner, inside the footprint
        // but for RUBBLE_MARGIN in front and to the side, on the end (and at the size, smaller near a door) whose heap
        // keeps a metre off the doors and off the walking lines and door paths.
        const M = RUBBLE_MARGIN, vBreach = Math.floor(R() * 1000), sRaw = 2.2 + R() * 1.4, vHeap = Math.floor(R() * 1000), H = 1.2 + R() * 0.6;
        const burn = R() < 0.35, colH = 40 + R() * 30;
        const tries: [boolean, number][] = [];
        for (const e of end ? [true, false] : [false, true]) for (const size of [sRaw, sRaw * 0.75, 1.6, 1.3]) tries.push([e, size]);
        for (const [e, size] of tries) {
          const ex = e ? f.x0 + f.tx * f.w : f.x0, ez = e ? f.z0 + f.tz * f.w : f.z0, inward = e ? -1 : 1;
          const s = Math.min(size, f.w / 2 + M, f.depth / 2 + M), bx = ex + f.tx * inward * (s - M) + f.nx * (M - s), bz = ez + f.tz * inward * (s - M) + f.nz * (M - s);
          const disc = f.fk >= 0 ? obbF(bx, bz, s, s, f.fk) : obb(bx, bz, s, s, f.k);
          if (keepHit(disc, -1.5) || walks.near(disc, 0.2)) continue;
          push(draft('breach', ex, ez, f.k, { fy: f.fk, s: p.h, v: (vBreach << 1) | (e ? 1 : 0), ext: [r2(frac), r2(wFront), r2(sideW), M] }));
          const heap = push(draft('rubble', bx, bz, f.k, { fy: f.fk, s: r2(s), v: vHeap, ext: [r2(H), 1, 1] }));
          const along = wFront * 0.5;
          solo(heap, ex + f.tx * inward * along + f.nx * 0.6, ez + f.tz * inward * along + f.nz * 0.6, along, 0.6, f.k, 1.4, 0.3, ownSolid(p), f.fk);
          holes.push({ x: r2(ex + f.nx * 2.2 + f.tx * inward * along), z: r2(ez + f.nz * 2.2 + f.tz * inward * along) });
          if (burn) {
            fires.push({ x: r2(ex + f.tx * inward + f.nx * 0.5), z: r2(ez + f.tz * inward + f.nz * 0.5), y: 0.4 });
            if (columns.length < 1) columns.push({ x: r2(ex), z: r2(ez), h: r2(colH) });
          }
          break;
        }
        continue;
      }
      push(draft('breach', cxp, czp, f.k, { s: p.h, v: (Math.floor(R() * 1000) << 1) | (end ? 1 : 0), ext: [r2(frac), r2(wFront), r2(sideW)] }));
      // The slope spills from the corner over the sidewalk; its high core hugs the wall (inside the plot + 1.2 m).
      const inward = end ? -1 : 1, along = wFront * 0.5;
      const bx = cxp + f.tx * inward * along + f.nx * 1.6, bz = czp + f.tz * inward * along + f.nz * 1.6;
      const heap = push(draft('rubble', bx, bz, f.k, { s: 2.2 + R() * 1.4, v: Math.floor(R() * 1000), ext: [r2(1.2 + R() * 0.6), 1] }));
      const ccx = cxp + f.tx * inward * along + f.nx * 0.6, ccz = czp + f.tz * inward * along + f.nz * 0.6;
      solo(heap, ccx, ccz, wFront * 0.5, 0.6, f.k, 1.4, 0.3, ownSolid(p));
      holes.push({ x: r2(cxp + f.nx * 2.2 + f.tx * inward * along), z: r2(czp + f.nz * 2.2 + f.tz * inward * along) });
      if (R() < 0.35) {
        fires.push({ x: r2(bx), z: r2(bz), y: 0.4 });
        if (columns.length < 1) columns.push({ x: r2(cxp), z: r2(czp), h: r2(40 + R() * 30) });
      }
    }
    // Ruined shells in gaps along the roads: side and back walls (colliders), the road side collapsed into low rubble.
    for (const slot of shellSlots) {
      const r = slot.r, mid = at(r, slot.s);
      if (!inChunk(mid.x, mid.z)) continue;
      const R = rngFor(5, cx, cz, L.shell, r.id, slot.i);
      const w = 8 + R() * 3, depth = 6 + R() * 2, setback = r.half + r.sidewalk + 0.6;
      for (let tries = 0; tries < 30; tries++) {
        const side = tries >= 15 ? -slot.side : slot.side, t = tries % 15;
        const s = slot.s + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 3;
        if (s < r.clearA + 6 || s > r.len - r.clearB - 6) continue;
        const p = at(r, s), c = beside(p, side * (setback + depth / 2));
        if (!inChunk(c.x, c.z) || junctionNear(c.x, c.z, 8)) continue;
        const k = wrap(p.k + (side > 0 ? 16 : 48));            // faces the road
        const gap = obb(c.x, c.z, (w + 4) / 2, depth / 2 + 0.6, k);
        if (solids.hits(gap, 1.1) || plotGrid.hits(gap, 0.4) || global.hits(gap, 1.1) || local.hits(gap, 1.1) || keepHit(gap) || walks.near(gap, 1.0) || inGreen(c.x, c.z)) continue;
        if (landAt && !landAt.box(gap)) continue;
        const cluster = localCluster++, cl: Cluster = { cols: [] };
        const fx = SIN[k], fz = COS[k];                       // toward the road
        const tx = COS[k], tz = -SIN[k];                      // along the road
        const shell = push(draft('shell', c.x, c.z, k, { s: r2(w), v: Math.floor(R() * 1000), ext: [r2(depth)] }));
        const walls: [number, number, number, number][] = [
          [c.x + tx * w / 2, c.z + tz * w / 2, depth / 2, 0], [c.x - tx * w / 2, c.z - tz * w / 2, depth / 2, 0], [c.x - fx * depth / 2, c.z - fz * depth / 2, w / 2, 16],
        ];
        if (R() < 0.35) walls.splice(Math.floor(R() * 2), 1);
        let n = 0;
        for (const [x, z, half, turn] of walls) {
          const wall = draft('wall', x, z, k + turn, { s: r2(half * 2), v: Math.floor(R() * 1000), ext: [r2(2.6 + R() * 2)] });
          if (place(wall, x, z, 0.16, half, k + turn, wall.ext![0], grids, { cluster, padSame: 0, within: box })) { push(wall); cl.cols.push(wall.col!); n++; }
        }
        if (!n) { kill(shell); continue; }
        clusters.push(cl);
        holes.push({ x: r2(c.x + fx * (depth / 2 + 0.8)), z: r2(c.z + fz * (depth / 2 + 0.8)) });
        break;
      }
    }
    // Towers: blown-out dark windows on a few lower floors with scorch streaks, glass on the ground.
    for (const p of towers) {
      const [mx, mz] = middle(p);
      if (!inChunk(mx, mz) || !weyl(towerRank.get(p)!, 0.3, 37)) continue;
      const R = rngFor(5, cx, cz, L.tower, p.id), f = faceOf(p);
      const n = 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const a = 0.15 + R() * 0.7, x = f.x0 + f.tx * f.w * a, z = f.z0 + f.tz * f.w * a;
        push(draft('patch', x, z, f.k, { fy: f.fk, y: r2(4 + R() * Math.min(12, p.h - 8)), s: r2(2 + R() * 3), v: Math.floor(R() * 1000), ext: [r2(1.4 + R() * 1.6)] }));
      }
      push(draft('shards', f.x0 + f.tx * f.w * 0.5 + f.nx * 2.5, f.z0 + f.tz * f.w * 0.5 + f.nz * 2.5, f.k, { fy: f.fk, s: Math.min(6, f.w * 0.4), v: Math.floor(R() * 1000) }));
    }
    // Fallen shop signs lying tilted at the facade base (a low collider).
    for (const p of signPlots) {
      const [mx, mz] = middle(p);
      if (!inChunk(mx, mz) || !weyl(signRank.get(p)!, 0.2, 41)) continue;
      const R = rngFor(5, cx, cz, L.sign, p.id), f = faceOf(p);
      const w = Math.min(f.w - 1, 1.8 + R() * 1.6), a = 0.2 + R() * 0.6;
      const x = f.x0 + f.tx * f.w * a + f.nx * 0.55, z = f.z0 + f.tz * f.w * a + f.nz * 0.55;
      const d = push(draft('sign', x, z, f.k, { fy: f.fk, s: r2(w), v: Math.floor(R() * 1000), roll: Math.floor(R() * 4) }));
      solo(d, x, z, w / 2, 0.5, f.k, 0.6, 0.3, ownSolid(p), f.fk);
    }
    // Broken and boarded windows: one per 6 m of frontage on 40% of the plots.
    for (const p of lowPlots) {
      const [mx, mz] = middle(p);
      if (!inChunk(mx, mz) || !weyl(lowRank.get(p)!, 0.4, 43)) continue;
      const R = rngFor(5, cx, cz, L.window, p.id), f = faceOf(p), n = Math.max(1, Math.floor(f.w / 6));
      for (let i = 0; i < n; i++) {
        const a = (i + 0.2 + R() * 0.6) / n, ground = p.h < 6 || (R() < 0.3 && (p.style === 'home' || p.style === 'legacy'));
        const y = ground ? 1.3 + R() * 0.6 : 4.2 + R() * Math.min(1.2, p.h - 5.4);
        push(draft('window', f.x0 + f.tx * f.w * a, f.z0 + f.tz * f.w * a, f.k, { fy: f.fk, y: r2(y), s: r2(0.9 + R() * 0.8), v: Math.floor(R() * 1000) * 2 + (R() < 0.1 ? 1 : 0), ext: [r2(0.8 + R() * 0.5)] }));
      }
    }
    // Fallen street trees in 8% of the gaps between consecutive ones, across the sidewalk into the carriageway.
    treeGaps.forEach((g, rank) => {
      const root = at(g.r, g.s), base = beside(root, g.off);
      if (!inChunk(base.x, base.z) || !weyl(rank, 0.08, 47)) return;
      const R = rngFor(5, cx, cz, L.tree, rank), side = g.off > 0 ? 1 : -1;
      const len = 5 + R() * 3, dev = Math.floor(R() * 9) - 4;
      // Toward the road centre: side −1 is (hz, −hx) from the road's own direction.
      const k = wrap(yawIndexOf(root.hz * side, -root.hx * side) + dev);
      const d = push(draft('tree', base.x, base.z, k, { s: r2(len), v: Math.floor(R() * 1000), ext: [r2(g.size)] }));
      d.ext!.push(g.species === 'palm' ? 1 : g.species === 'bamboo' ? 2 : 0);
      // Collider: the trunk and crown beyond 1 m from the walking line, over the carriageway (the part over the
      // walking line is walk-over).
      // (beside a drive lane the collider starts half a metre further out: a metre off the walking line however the
      // tree turned; a tree that then finds no room (the lane, a wreck) lies shorter, down to 3 m, or is not felled)
      const reach = Math.max(0, Math.abs(g.off) - (g.r.walk - 1.0)) + 0.3 + (laneHalf ? 0.45 : 0);
      for (let l = len; ; l -= 1.5) {
        const usable = l + 1.2 - reach;                                // the crown reaches ~1.2 m past the tip
        if (usable <= 1.5) { d.s = r2(l); break; }
        const mid = reach + usable / 2;
        if (solo(d, base.x + SIN[k] * mid, base.z + COS[k] * mid, 1.0, usable / 2, k, 1.3, 0.6)) { d.s = r2(l); break; }
        if (!laneHalf) break;
        if (l - 1.5 < 3) { kill(d); break; }
      }
    });
    // Fallen power poles mid-span, with snapped cables drooping from the poles either side.
    spans.forEach((sp, rank) => {
      const mx = (sp.ax + sp.bx) / 2, mz = (sp.az + sp.bz) / 2;
      if (!inChunk(mx, mz) || !weyl(rank, 0.1, 53)) return;
      const R = rngFor(5, cx, cz, L.pole, rank), n = nearestRoad(mx, mz, 14);
      if (!n) return;
      const rp = at(n.r, n.s), toward = n.off > 0 ? -1 : 1;           // side −1 of the road is (hz, −hx)
      const k = wrap(yawIndexOf(-rp.hz * toward, rp.hx * toward) + Math.floor(R() * 7) - 3);
      let flat = R() < 0.7, lean = flat ? 16 : 6 + Math.floor(R() * 7);
      const len = 7.5;
      const d = push(draft('pole', mx, mz, k, { roll: lean, s: len, v: Math.floor(R() * 1000) }));
      if (flat) {
        const reach = Math.abs(n.off) - (n.r.walk - 1.0), usable = len - reach;
        // With a drive lane a pole with no room to lie (the lane, a wreck) leans over the street instead (no collider).
        if (usable > 1.2 && !solo(d, mx + SIN[k] * (reach + usable / 2), mz + COS[k] * (reach + usable / 2), 0.25, usable / 2, k, 0.45, 0.6) && laneHalf) { flat = false; lean = 10; d.roll = lean; }
      }
      const tipH = flat ? 0.3 : COS[lean] * len, tipD = flat ? len : SIN[lean] * len;
      const tx = mx + SIN[k] * tipD, tz = mz + COS[k] * tipD;
      for (const [px, pz] of [[sp.ax, sp.az], [sp.bx, sp.bz]]) {
        const m = 1 + Math.floor(R() * 2);
        for (let i = 0; i < m; i++) push(draft('cable', px, pz, 0, { y: r2(6.3 - i * 0.35), v: Math.floor(R() * 1000), ext: [r2(tx + (R() - 0.5) * 2), r2(tz + (R() - 0.5) * 2), r2(tipH)] }));
      }
    });
    // Vines down 35% of the street fronts, moss along 60% of the wall bases.
    for (const p of lowPlots) {
      const [mx, mz] = middle(p);
      if (!inChunk(mx, mz)) continue;
      const rank = lowRank.get(p)!, f = faceOf(p);
      if (weyl(rank, 0.35, 59)) {
        const R = rngFor(5, cx, cz, L.vine, p.id);
        push(draft('vine', f.x0 + f.tx * f.w / 2, f.z0 + f.tz * f.w / 2, f.k, { fy: f.fk, s: r2(f.w), v: Math.floor(R() * 1000), ext: [p.h, r2(0.3 + R() * 0.4)] }));
      }
      if (weyl(rank, 0.6, 61)) {
        const R = rngFor(5, cx, cz, L.moss, p.id), g = faceOf(p, f.q);
        push(draft('moss', g.x0 + g.tx * g.w / 2, g.z0 + g.tz * g.w / 2, g.k, { fy: g.fk, s: r2(g.w), v: Math.floor(R() * 1000), ext: [r2(0.3 + R() * 0.6)] }));
      }
    }
    // Weeds along the curbs (0.35 per metre of curb) and through cracks (1 per 30 m² of lane), cracks (1 per 20 m²):
    // one strip item per road cell and layer (ext = [count, lateral offset or half width, u0, u1]); the builder scatters them.
    {
      const Rc = rngFor(5, cx, cz, L.curb), Rt = rngFor(5, cx, cz, L.crackTuft), Rk = rngFor(5, cx, cz, L.crack);
      for (const { r, j } of cells) {
        const span = cellSpan(r, j);
        if (!span) continue;
        const { p, u0, u1 } = span, len = u1 - u0, area = len * r.half * 2;
        for (const side of [-1, 1]) {
          const n = Math.floor(0.35 * len + Rc());
          if (n) push(draft('weeds', p.x, p.z, p.k, { s: 1, v: Math.floor(Rc() * 1000) * 2, ext: [n, r2(side * (r.half + 0.12)), r2(u0), r2(u1)] }));
        }
        const tufts = Math.floor(area / 30 + Rt());
        if (tufts) push(draft('weeds', p.x, p.z, p.k, { s: 1, v: Math.floor(Rt() * 1000) * 2 + 1, ext: [tufts, r2(r.half - 0.3), r2(u0), r2(u1)] }));
        const cracks = Math.floor(area / 20 + Rk());
        if (cracks) push(draft('crack', p.x, p.z, p.k, { s: 1, v: Math.floor(Rk() * 1000), ext: [cracks, r2(r.half - 0.3), r2(u0), r2(u1)] }));
      }
    }
    // Parks and squares gone wild: a clump of tall grass or a shrub per 6 m².
    {
      const R = rngFor(5, cx, cz, L.green);
      // Polygon greens (the districts' parks and lawns) share GRASS_CAP clumps a chunk, in proportion to their areas
      // here: their big lawns would otherwise fill the chunk's triangle budget many times over (and the plan with items).
      let polyArea = 0;
      for (const g of input.greens) if (g.poly) polyArea += Math.max(0, Math.min(g.maxX, box.maxX) - Math.max(g.minX, box.minX)) * Math.max(0, Math.min(g.maxZ, box.maxZ) - Math.max(g.minZ, box.minZ));
      const polyShare = Math.min(1, GRASS_CAP * 6 / Math.max(1, polyArea));
      for (const g of input.greens) {
        const x0 = Math.max(g.minX, box.minX), x1 = Math.min(g.maxX, box.maxX), z0 = Math.max(g.minZ, box.minZ), z1 = Math.min(g.maxZ, box.maxZ);
        if (x1 <= x0 || z1 <= z0) continue;
        if (g.poly) {
          // A polygon's clumps here are strip items (as the weeds and cracks are), the builder scattering them in
          // its bounds and keeping them to it: one per 6 m² of the polygon, less over GRASS_CAP, GRASS_PIECE at most
          // an item. ext = [count, x0, z0, x1, z1, ...polygon].
          const n = Math.floor((x1 - x0) * (z1 - z0) / 6 * polyShare + R());
          for (let left = n, k = Math.ceil(n / GRASS_PIECE); k > 0; k--) {
            const m = Math.ceil(left / k);
            left -= m;
            push(draft('grass', (x0 + x1) / 2, (z0 + z1) / 2, 0, { s: 1, v: Math.floor(R() * 1000) * 2, ext: [m, x0, z0, x1, z1, ...g.poly] }));
          }
          continue;
        }
        const n = Math.floor((x1 - x0) * (z1 - z0) / 6 + R());
        for (let i = 0; i < n; i++) {
          const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), u = R(), sz = R();
          if (solids.hits(obb(x, z, 0.2, 0.2, 0), 0.2)) continue;
          push(draft('grass', x, z, Math.floor(R() * 64), { s: r2(0.6 + sz * 0.9), v: Math.floor(R() * 1000) * 2 + (u < 0.28 ? 1 : 0) }));
        }
      }
    }
    // Litter: paper, bags, styrofoam, rubble chips; scorch and craters.
    {
      const R = rngFor(5, cx, cz, L.litter), Rc = rngFor(5, cx, cz, L.crater);
      for (const { r, j } of cells) {
        const cellLen = Math.min(CELL_LEN, r.len - j * CELL_LEN), span = cellSpan(r, j);
        // Paper, bags, styrofoam, nón lá and rubble chips over the road and its sidewalks (one strip item per cell).
        const n = span ? Math.floor((span.u1 - span.u0) / 7 + R()) : 0;
        if (span && n) push(draft('litter', span.p.x, span.p.z, span.p.k, { s: 1, v: 8 * Math.floor(R() * 1000), ext: [n, r2(r.half + r.sidewalk * 0.9), r2(span.u0), r2(span.u1)] }));
        if (r.cls !== 'hem' && Rc() < cellLen / 150) {
          const { q } = asphalt(Rc, r, j);
          if (!junctionNear(q.x, q.z, 4)) { push(draft('crater', q.x, q.z, Math.floor(Rc() * 64), { s: r2(1.3 + Rc() * 0.9), v: Math.floor(Rc() * 1000) })); craters.push({ x: r2(q.x), z: r2(q.z) }); }
        }
      }
    }
    // Abandoned street life: stools and tables knocked over, carts on their side, nón lá blown about.
    {
      const R = rngFor(5, cx, cz, L.stall);
      const here = input.stalls.filter((s) => inChunk(s.x, s.z));
      for (const s of here) {
        // Most stools and tables are knocked about; a hawker's stop keeps its cart only now and then.
        if (R() < (s.kind === 'cart' ? 0.88 : 0.35)) continue;
        const sub = s.kind === 'cart' || s.kind === 'stall' ? 2 : s.kind === 'table' ? 1 : 0;
        push(draft('stall', s.x + (R() - 0.5) * 1.6, s.z + (R() - 0.5) * 1.6, Math.floor(R() * 64), { v: sub + 4 * Math.floor(R() * 1000), roll: R() < 0.6 ? 16 : 0 }));
        if (R() < 0.25) push(draft('litter', s.x + (R() - 0.5) * 3, s.z + (R() - 0.5) * 3, Math.floor(R() * 64), { v: 3 + 8 * Math.floor(R() * 1000) }));
      }
      // A heap of fallen motorbikes where people crowded: by a school's front, or among 3+ market stalls.
      const Rt = rngFor(5, cx, cz, L.tangle);
      const spots: { x: number; z: number; k: number }[] = [];
      for (const p of input.plots) {
        if (p.style !== 'school') continue;
        const [mx, mz] = middle(p);
        if (!inChunk(mx, mz)) continue;
        const f = faceOf(p), a = Rt() < 0.5 ? 0.22 : 0.78;
        spots.push({ x: f.x0 + f.tx * f.w * a + f.nx * 1.9, z: f.z0 + f.tz * f.w * a + f.nz * 1.9, k: f.k + 16 });
      }
      const market = here.filter((s) => s.kind === 'stall');
      if (market.length >= 3) { const m = market[Math.floor(market.length / 2)]; spots.push({ x: m.x, z: m.z, k: Math.floor(Rt() * 64) }); }
      for (const sp of spots) {
        const size = r2(1.5 + Rt() * 0.5), v = 8 + Math.floor(Rt() * 8) + 16 * Math.floor(Rt() * 1000);
        for (let tries = 0; tries < 33; tries++) {
          const rr = tries === 0 ? 0 : 2.5 * Math.ceil(tries / 8), x = sp.x + SIN[(tries % 8) * 8] * rr, z = sp.z + COS[(tries % 8) * 8] * rr;
          const b = obb(x, z, size, size * 0.6, sp.k);
          if (!inChunk(x, z) || keepHit(b) || solids.hits(b, 0.3) || global.hits(b, 0.6) || local.hits(b, 0.6)) continue;
          const d = push(draft('tangle', x, z, sp.k, { s: size, v }));
          solo(d, x, z, size * 0.8, size * 0.5, sp.k, 0.7, 0.6);
          break;
        }
      }
    }
    // The quarantine checkpoint: two white tents with a red cross, sandbags and a barrier, clear of the door.
    for (const cp of input.checkpoints ?? []) {
      if (!inChunk(cp.x, cp.z)) continue;
      const R = rngFor(5, cx, cz, L.checkpoint, Math.floor(cp.x), Math.floor(cp.z));
      const k = wrap(Math.round(cp.yaw / STEP)), tx = COS[k], tz = -SIN[k];
      const cluster = localCluster++, cl: Cluster = { cols: [] };
      for (const a of [-1, 1]) {
        // Each tent slides along the frontage until it finds room (doors, trees and benches stay clear).
        for (let m = 0; m < 6; m++) {
          const u = a * (2.1 + 1.4 * m), x = cp.x + tx * u, z = cp.z + tz * u, tent = draft('tent', x, z, k, { s: 1, v: Math.floor(R() * 1000) });
          if (place(tent, x, z, 1.6, 1.2, k, 2.4, grids, { cluster, within: box, padSame: 1.1, pad: 0.05 })) { push(tent); cl.cols.push(tent.col!); break; }
        }
      }
      if (cl.cols.length) clusters.push(cl);
    }
    // Burning wrecks keep their fires.
    for (const d of items) if ((d.kind === 'carBurnt' || d.kind === 'bus') && isBurning(d) && !d.dead) fires.push({ x: r2(d.x), z: r2(d.z), y: 0.7 });

    // No pockets: every free cell in a cluster must be reachable from outside by a path 1 m wide; a piece that closes
    // one is taken out.
    const allClusters = [...clusters];
    for (const cl of allClusters) {
      for (let guard = 0; guard < 8; guard++) {
        const live = cl.cols.filter((c) => !c.item!.dead);
        if (!live.length) break;
        const pocket = pocketIn(live, (minX, minZ, maxX, maxZ, cb) => {
          solids.some(minX, minZ, maxX, maxZ, (id) => { cb(solids.boxes[id]); return false; });
          for (const g of grids) g.some(minX, minZ, maxX, maxZ, (id) => { if (g.tags[id] !== -2 && g.tags[id] !== DEAD) cb(g.boxes[id]); return false; });
        }, (b) => live.some((c) => c.item && !c.item.dead && sameBox(b, c)));
        if (!pocket) break;
        let worst: ColDraft | null = null, wd = Infinity;
        for (const c of live) { const dx = c.cx - pocket.x, dz = c.cz - pocket.z, d = dx * dx + dz * dz; if (d < wd) { wd = d; worst = c; } }
        kill(worst!.item!);
      }
    }
    const out: ChunkOut = { key, items: items.filter((d) => !d.dead), clusters, fires, columns, holes, craters, hash: 0 };
    out.hash = hashChunk(out);
    cache.set(key, out);
    return out;
  }

  // Global clusters get their pocket check against global colliders and the solids.
  for (const cl of globalClusters) {
    for (let guard = 0; guard < 8; guard++) {
      const live = cl.cols.filter((c) => !c.item!.dead);
      if (!live.length) break;
      const pocket = pocketIn(live, (minX, minZ, maxX, maxZ, cb) => {
        solids.some(minX, minZ, maxX, maxZ, (id) => { cb(solids.boxes[id]); return false; });
        global.some(minX, minZ, maxX, maxZ, (id) => { if (global.tags[id] !== -2 && global.tags[id] !== DEAD) cb(global.boxes[id]); return false; });
      }, (b) => live.some((c) => sameBox(b, c)));
      if (!pocket) break;
      let worst: ColDraft | null = null, wd = Infinity;
      for (const c of live) { const dx = c.cx - pocket.x, dz = c.cz - pocket.z, d = dx * dx + dz * dz; if (d < wd) { wd = d; worst = c; } }
      kill(worst!.item!);
    }
  }
  for (const [key, list] of globalByChunk) globalByChunk.set(key, list.filter((d) => !d.dead));

  function hashChunk(c: ChunkOut) {
    let h = fnv(0x811c9dc5, c.key);
    const localCol = new Map<ColDraft, number>();
    c.items.forEach((d) => { if (d.col) localCol.set(d.col, localCol.size); });
    for (const d of c.items) {
      h = fnv(h, KIND_INDEX.get(d.kind)!); h = fnv(h, q100(d.x)); h = fnv(h, q100(d.z)); h = fnv(h, q100(d.y)); h = fnv(h, d.k); h = fnv(h, wrap(d.roll));
      if (d.fy >= 0) h = fnv(h, 0x10000 + d.fy);
      h = fnv(h, q100(d.s)); h = fnv(h, d.v); h = fnv(h, d.smash ? 1 : 0);
      if (d.ext) for (const e of d.ext) h = fnv(h, q100(e));
      if (d.col) {
        const k = d.col; h = fnv(h, q100(k.cx)); h = fnv(h, q100(k.cz)); h = fnv(h, q100(k.hx)); h = fnv(h, q100(k.hz)); h = fnv(h, k.k); h = fnv(h, q100(k.top));
        if (k.fy >= 0) h = fnv(h, 0x10000 + k.fy);
      }
    }
    for (const f of c.fires) { h = fnv(h, q100(f.x)); h = fnv(h, q100(f.z)); }
    for (const f of c.holes) { h = fnv(h, q100(f.x)); h = fnv(h, q100(f.z)); }
    return h;
  }
  let globalHash = fnv(0x811c9dc5, APOCALYPSE_VERSION);
  globalHash = fnv(globalHash, seed);
  for (const s of fleetSpots) { globalHash = fnv(globalHash, q100(s.x)); globalHash = fnv(globalHash, q100(s.z)); globalHash = fnv(globalHash, Math.round(s.yaw / STEP)); }
  for (const id of [...blockedEdges].sort((a, b) => a - b)) globalHash = fnv(globalHash, id);

  /** Every chunk key the bounds touch, ascending. */
  function keys() {
    const b = input.bounds, out: number[] = [];
    for (let x = Math.floor(b.minX / CHUNK); x <= Math.floor(b.maxX / CHUNK); x++) for (let z = Math.floor(b.minZ / CHUNK); z <= Math.floor(b.maxZ / CHUNK); z++) out.push(chunkKey(x, z));
    return out.sort((a, b2) => a - b2);
  }
  const globalMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;

  /** Assembles a plan of the given chunks (ascending key order), item ids = chunkKey × 4096 + index. */
  function plan(which: readonly number[] = keys()): RuinPlan {
    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    const sorted = [...new Set(which)].sort((a, b) => a - b);
    const out: RuinPlan = { version: APOCALYPSE_VERSION, hash: 0, seed, items: [], colliders: [], chunks: new Map(), fires: [], columns: [], fleetSpots: fleetSpots.map((s) => ({ ...s })), spawnHoles: [], craters: [], clusters: [], stats: { byKind: {}, blockedEdges: blockedEdges.size, ms: 0 } };
    let h = globalHash;
    const colIndex = new Map<ColDraft, number>();
    for (const key of sorted) {
      const c = chunk(key);
      h = fnv(h, c.hash);
      if (!c.items.length) continue;
      const list: number[] = [];
      c.items.forEach((d, i) => {
        const idx = out.items.length, item: RuinItem = { id: key * 4096 + i, kind: d.kind, x: r2(d.x), z: r2(d.z), y: r2(d.y), yaw: d.fy >= 0 ? d.fy * FSTEP : d.k * STEP, roll: wrap(d.roll) * STEP, s: r2(d.s), v: d.v, collider: -1, smash: d.smash };
        if (d.ext) item.ext = d.ext.map(r2);
        if (d.col) {
          item.collider = out.colliders.length;
          colIndex.set(d.col, out.colliders.length);
          out.colliders.push({ cx: r2(d.col.cx), cz: r2(d.col.cz), hx: r2(d.col.hx), hz: r2(d.col.hz), yaw: d.col.fy >= 0 ? d.col.fy * FSTEP : d.col.k * STEP, top: r2(d.col.top), item: idx });
        }
        out.items.push(item); list.push(idx);
        out.stats.byKind[d.kind] = (out.stats.byKind[d.kind] ?? 0) + 1;
      });
      out.chunks.set(key, list);
      out.fires.push(...c.fires.map((f) => ({ ...f })));
      out.columns.push(...c.columns.map((f) => ({ ...f })));
      out.spawnHoles.push(...c.holes.map((f) => ({ ...f })));
      out.craters.push(...c.craters.map((f) => ({ ...f })));
    }
    for (const cl of [...globalClusters, ...sorted.flatMap((k) => chunk(k).clusters)]) {
      const cols = cl.cols.map((c) => colIndex.get(c)).filter((i): i is number => i !== undefined);
      if (!cols.length) continue;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const i of cols) { const b = colliderObb(out.colliders[i]); minX = Math.min(minX, b.cx - b.ex); maxX = Math.max(maxX, b.cx + b.ex); minZ = Math.min(minZ, b.cz - b.ez); maxZ = Math.max(maxZ, b.cz + b.ez); }
      out.clusters.push({ minX: r2(minX), minZ: r2(minZ), maxX: r2(maxX), maxZ: r2(maxZ), colliders: cols });
    }
    out.hash = h >>> 0;
    out.stats.ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : 0) - t1 + globalMs) * 10) / 10;
    return out;
  }

  return { input, keys, chunk: (key: number) => chunk(key).items.length, plan, blockedEdges: () => [...blockedEdges].sort((a, b) => a - b), r1Length: R1_TOTAL, traffic: () => traffic.map((r) => ({ id: r.id, a: r.a, b: r.b })) };
}

/** The ruins of a map: pure and deterministic (see the file comment). */
export function planRuins(input: RuinInput, seed = APOCALYPSE_SEED): RuinPlan {
  return createRuinPlanner(input, seed).plan();
}

/** The face of an axis-aligned plot facing `facing` (or quadrant q): start corner, unit along (t), outward normal (n). */
function face(p: Box2 & { facing?: number }, q?: number): Face {
  if (q === undefined) {
    const a = (((p.facing ?? 0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    q = Math.round(a / (Math.PI / 2)) % 4;
  }
  const w = q % 2 ? p.maxZ - p.minZ : p.maxX - p.minX, depth = q % 2 ? p.maxX - p.minX : p.maxZ - p.minZ;
  const nx = q === 1 ? 1 : q === 3 ? -1 : 0, nz = q === 0 ? 1 : q === 2 ? -1 : 0;
  const x0 = q === 0 || q === 3 ? p.minX : p.maxX, z0 = q === 0 || q === 1 ? p.maxZ : p.minZ;
  return { q, k: q * 16, fk: -1, x0, z0, tx: nz, tz: -nx, nx, nz, w, depth };
}
/** The box lies inside the rectangle (a plot's own ground collider, which ruins against its wall may touch). */
const insideRect = (b: OBB, r: Box2) => b.cx - b.ex >= r.minX - 0.01 && b.cx + b.ex <= r.maxX + 0.01 && b.cz - b.ez >= r.minZ - 0.01 && b.cz + b.ez <= r.maxZ + 0.01;
const sameBox = (b: OBB, c: { cx: number; cz: number; hx: number; hz: number }) => b.cx === c.cx && b.cz === c.cz && b.hx === c.hx && b.hz === c.hz;

/**
 * A cell where a person can stand (0.3 m from every box) that no path 1.0 m wide from outside the cluster's box
 * (+3 m) comes within 1 m of, or null. `gather` lists every box near the area; `own` says which belong to the cluster.
 */
function pocketIn(cols: readonly { cx: number; cz: number; hx: number; hz: number; k: number; fy: number }[], gather: (minX: number, minZ: number, maxX: number, maxZ: number, cb: (b: OBB) => void) => void, own: (b: OBB) => boolean) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const c of cols) { const b = c.fy >= 0 ? obbF(c.cx, c.cz, c.hx, c.hz, c.fy) : obb(c.cx, c.cz, c.hx, c.hz, c.k); minX = Math.min(minX, b.cx - b.ex); maxX = Math.max(maxX, b.cx + b.ex); minZ = Math.min(minZ, b.cz - b.ez); maxZ = Math.max(maxZ, b.cz + b.ez); }
  return pocketScan(minX, minZ, maxX, maxZ, gather, own);
}
function pocketScan(minX: number, minZ: number, maxX: number, maxZ: number, gather: (minX: number, minZ: number, maxX: number, maxZ: number, cb: (b: OBB) => void) => void, own: ((b: OBB) => boolean) | null) {
  const C = 0.5, pad = 2.5, x0 = minX - pad, z0 = minZ - pad;
  const nx = Math.ceil((maxX - minX + pad * 2) / C), nz = Math.ceil((maxZ - minZ + pad * 2) / C);
  if (nx * nz > 40000) return null;
  const blocked = new Uint8Array(nx * nz), solid = new Uint8Array(nx * nz);
  let ownCount = 0;
  gather(x0, z0, x0 + nx * C, z0 + nz * C, (b) => {
    if (own && own(b)) ownCount++;
    const i0 = Math.max(0, Math.floor((b.cx - b.ex - 0.6 - x0) / C)), i1 = Math.min(nx - 1, Math.floor((b.cx + b.ex + 0.6 - x0) / C));
    const j0 = Math.max(0, Math.floor((b.cz - b.ez - 0.6 - z0) / C)), j1 = Math.min(nz - 1, Math.floor((b.cz + b.ez + 0.6 - z0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = dist2(b, x0 + (i + 0.5) * C, z0 + (j + 0.5) * C), c = j * nx + i;
      if (d < 0.25) blocked[c] = 1;
      if (d < 0.09) solid[c] = 1;
    }
  });
  if (own && !ownCount) return null;
  const reached = new Uint8Array(nx * nz), queue: number[] = [];
  for (let i = 0; i < nx; i++) for (const j of [0, nz - 1]) { const c = j * nx + i; if (!blocked[c] && !reached[c]) { reached[c] = 1; queue.push(c); } }
  for (let j = 0; j < nz; j++) for (const i of [0, nx - 1]) { const c = j * nx + i; if (!blocked[c] && !reached[c]) { reached[c] = 1; queue.push(c); } }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h], i = c % nx, j = (c - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (!blocked[n] && !reached[n]) { reached[n] = 1; queue.push(n); }
    }
  }
  // A standable cell is fine when a reached cell lies within 1 m (2 cells) of it (a zombie's reach is 1.2 m).
  const ci0 = Math.floor((minX - 1 - x0) / C), ci1 = Math.ceil((maxX + 1 - x0) / C), cj0 = Math.floor((minZ - 1 - z0) / C), cj1 = Math.ceil((maxZ + 1 - z0) / C);
  for (let j = Math.max(0, cj0); j <= Math.min(nz - 1, cj1); j++) for (let i = Math.max(0, ci0); i <= Math.min(nx - 1, ci1); i++) {
    const c = j * nx + i;
    if (solid[c] || reached[c]) continue;
    let near = false;
    for (let b = Math.max(0, j - 2); b <= Math.min(nz - 1, j + 2) && !near; b++) for (let a = Math.max(0, i - 2); a <= Math.min(nx - 1, i + 2); a++) if (reached[b * nx + a]) { near = true; break; }
    if (!near) return { x: x0 + (i + 0.5) * C, z: z0 + (j + 0.5) * C };
  }
  return null;
}

/**
 * Pockets left in a plan's clusters (for tests and tools): for each cluster, the boxes of the input solids and of every
 * plan collider near it are rasterised and flood-filled as planRuins does. Empty when every cluster is open.
 */
export function findPockets(plan: RuinPlan, input: RuinInput) {
  const all = new BoxGrid();
  for (const s of input.solids) all.add(solidObb(s), -1);
  for (const c of plan.colliders) all.add(colliderObb(c), -1);
  const out: { cluster: number; x: number; z: number }[] = [];
  plan.clusters.forEach((cl, i) => {
    const p = pocketScan(cl.minX, cl.minZ, cl.maxX, cl.maxZ, (minX, minZ, maxX, maxZ, cb) => { all.some(minX, minZ, maxX, maxZ, (id) => { cb(all.boxes[id]); return false; }); }, null);
    if (p) out.push({ cluster: i, ...p });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Chunk geometry: every non-vehicle item of a chunk merged into one non-indexed mesh with vertex colours. Built
// from a few primitive templates transformed per piece (Math.sin/cos are fine here: drawing never feeds the plan).
// ---------------------------------------------------------------------------------------------------------

type Ground = (x: number, z: number) => number;
type Col = readonly [number, number, number];
const lin = (hex: string): Col => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] as const; };
const mix = (a: Col, b: Col, t: number): Col => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a: Col, k: number): Col => [a[0] * k, a[1] * k, a[2] * k];
/** 0..1 from integers (an avalanche mix). */
const h01 = (...v: number[]) => hash32(...v) / 4294967296;

let palette: Record<string, Col> | null = null;
function pal() {
  return palette ??= {
    concrete: lin('#8f897e'), concrete2: lin('#a59d8f'), plaster: lin('#c9bca4'), brick: lin('#8b5140'), brick2: lin('#a0634b'), dark: lin('#5d574e'),
    void: lin('#191715'), soot: lin('#2b2622'), sootRim: lin('#4a423a'), rust: lin('#6e3f25'), slab: lin('#9b958a'),
    moss: lin('#4c5a2c'), moss2: lin('#66713a'), leaf: lin('#3d5a26'), leaf2: lin('#56702e'), leafDry: lin('#7c7234'), leafDead: lin('#8a6a3c'),
    vine: lin('#2f4a20'), vine2: lin('#46612a'), weed: lin('#5e7a2e'), weed2: lin('#8d8f3e'), weedDry: lin('#9d8b56'),
    bark: lin('#4f3b2b'), soil: lin('#43342a'), pole: lin('#9c988f'), cable: lin('#141414'),
    asphaltCrack: lin('#1c1a18'), scorch: lin('#231e1a'), crater: lin('#2c2620'), paper: lin('#d6d0bf'), bag: lin('#1f2224'), bag2: lin('#2c3e5a'),
    foam: lin('#e9e6dc'), straw: lin('#d4c088'), sand: lin('#b29e76'), sand2: lin('#9e8b66'), plank: lin('#6d5235'), red: lin('#b8352c'), white: lin('#e4e1d8'),
    drum: lin('#6e4a30'), drum2: lin('#2f5578'), wire: lin('#5a5a58'), tent: lin('#dcdad2'), tentRed: lin('#c0281f'), glassShard: lin('#b8c7c9'),
    stoolRed: lin('#c23a2f'), stoolBlue: lin('#2f62b0'), cart: lin('#2f6fb5'), cartTop: lin('#d6e8ee'),
  };
}
let signColors: Col[] | null = null;
const SIGN_HEX = ['#c8352b', '#e0b22c', '#2a5ea8', '#2f7d4a', '#d0622a', '#8c2f8a'];
const MOTO_PAINTS = ['#b8231f', '#1e4f9a', '#1d1d1f', '#e8e6df', '#8a8f94', '#d9a31a', '#2f7a46', '#6a2f7a'];
const CAR_PAINTS = ['#e8e8e4', '#b8bcc0', '#2b2f33', '#9c2b25', '#2d4f8a', '#c9b48e', '#4b6b3e', '#d4a017', '#6b6f73', '#7a2f2f', '#e6d9b8', '#1f3d2e'];
const BUS_PAINTS = ['#1d8a4e', '#1d5fb8', '#d6d2c4', '#c8402c'];

type Templates = { box: Float32Array; rock: Float32Array; dodec: Float32Array; octa: Float32Array; cyl6: Float32Array; cyl8: Float32Array; cone8: Float32Array; tcyl: Float32Array; prism: Float32Array };
let templates: Templates | null = null;
function tpl() {
  if (templates) return templates;
  const flat = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; const a = new Float32Array(n.getAttribute('position').array); g.dispose(); if (n !== g) n.dispose(); return a; };
  // A triangular prism (a gable roof) one unit each way, the ridge along z at the top.
  const prism = new Float32Array([
    -0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, 0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0, 1, 0.5, 0.5, 0, 0.5,
  ]);
  return templates = {
    box: flat(new THREE.BoxGeometry(1, 1, 1)), rock: flat(new THREE.IcosahedronGeometry(1, 0)), dodec: flat(new THREE.DodecahedronGeometry(1, 0)),
    octa: flat(new THREE.OctahedronGeometry(1, 0)), cyl6: flat(new THREE.CylinderGeometry(1, 1, 1, 6)), cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8)),
    cone8: flat(new THREE.ConeGeometry(1, 1, 8)), tcyl: flat(new THREE.CylinderGeometry(0.62, 1, 1, 6)), prism,
  };
}

/** A growing triangle soup: position, flat normal and colour per vertex. */
class Geo {
  p: Float32Array; n: Float32Array; c: Float32Array; v = 0;
  private m = new Float64Array(12);
  private P = new Float64Array(9);
  constructor(cap = 6144) { this.p = new Float32Array(cap * 3); this.n = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3); }
  get tris() { return this.v / 3; }
  private need(extra: number) {
    if ((this.v + extra) * 3 <= this.p.length) return;
    const size = Math.max(this.p.length * 2, (this.v + extra) * 3);
    for (const k of ['p', 'n', 'c'] as const) { const a = new Float32Array(size); a.set(this[k]); this[k] = a; }
  }
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, ca: Col, cb: Col = ca, cc: Col = ca) {
    this.need(3);
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = this.v * 3, p = this.p, n = this.n, c = this.c;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz; p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    for (let i = 0; i < 9; i += 3) { n[o + i] = nx; n[o + i + 1] = ny; n[o + i + 2] = nz; }
    c[o] = ca[0]; c[o + 1] = ca[1]; c[o + 2] = ca[2]; c[o + 3] = cb[0]; c[o + 4] = cb[1]; c[o + 5] = cb[2]; c[o + 6] = cc[0]; c[o + 7] = cc[1]; c[o + 8] = cc[2];
    this.v += 3;
  }
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], col: Col, col2: Col = col) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col, col, col2);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], col, col2, col2);
  }
  /**
   * A template placed at (x, y, z), turned by yaw (about y), pitch (about its x) and roll (about its z), scaled.
   * vary shades each triangle a little; jitter dents the vertices (rocks); y0/aoH darken it toward the ground;
   * moss greens some upward faces.
   */
  shape(t: Float32Array, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx: number, sy: number, sz: number, col: Col,
    o: { vary?: number; seed?: number; jitter?: number; y0?: number; aoH?: number; moss?: number } = {}) {
    const m = this.m, P = this.P, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    m[0] = (cyw * cr + syw * sp * sr) * sx; m[1] = (-cyw * sr + syw * sp * cr) * sy; m[2] = syw * cp * sz; m[3] = x;
    m[4] = cp * sr * sx; m[5] = cp * cr * sy; m[6] = -sp * sz; m[7] = y;
    m[8] = (-syw * cr + cyw * sp * sr) * sx; m[9] = (syw * sr + cyw * sp * cr) * sy; m[10] = cyw * cp * sz; m[11] = z;
    const seed = o.seed ?? 0, vary = o.vary ?? 0.12, jit = o.jitter ?? 0, y0 = o.y0 ?? -1e9, aoH = o.aoH ?? 0.9, moss = o.moss ?? 0;
    const mc = pal().moss;
    for (let i = 0; i < t.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        let px = t[i + k * 3], py = t[i + k * 3 + 1], pz = t[i + k * 3 + 2];
        if (jit) { const f = 1 + jit * (h01(seed, Math.round(px * 997), Math.round(py * 991), Math.round(pz * 983)) - 0.5); px *= f; py *= f; pz *= f; }
        P[k * 3] = m[0] * px + m[1] * py + m[2] * pz + m[3];
        P[k * 3 + 1] = m[4] * px + m[5] * py + m[6] * pz + m[7];
        P[k * 3 + 2] = m[8] * px + m[9] * py + m[10] * pz + m[11];
      }
      const shade = 1 + vary * (h01(seed, i) - 0.5) * 2;
      let base = scale3(col, shade);
      if (moss) {
        const ax = P[3] - P[0], ay = P[4] - P[1], az = P[5] - P[2], bx = P[6] - P[0], by = P[7] - P[1], bz = P[8] - P[2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        if (ny / l > 0.55 && h01(seed, i, 7) < moss) base = mix(base, mc, 0.75);
      }
      const a0 = Math.min(1, 0.62 + 0.38 * Math.max(0, (P[1] - y0) / aoH)), a1 = Math.min(1, 0.62 + 0.38 * Math.max(0, (P[4] - y0) / aoH)), a2 = Math.min(1, 0.62 + 0.38 * Math.max(0, (P[7] - y0) / aoH));
      this.tri(P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8], scale3(base, a0), scale3(base, a1), scale3(base, a2));
    }
  }
  /** A flat polygon on the ground (fan from the first point), each vertex lifted above the ground there. */
  decal(pts: readonly number[], col: Col, lift: number, ground: Ground, col2: Col = col) {
    const n = pts.length / 2, cx = pts[0], cz = pts[1], cy = ground(cx, cz) + lift;
    for (let i = 1; i < n - 1; i++) {
      const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3];
      this.tri(cx, cy, cz, bx, ground(bx, bz) + lift, bz, ax, ground(ax, az) + lift, az, col, col2, col2);
    }
  }
  /** A ribbon along a ground polyline, width w (tapering to taper × w at the end). */
  ribbon(pts: readonly number[], w: number, col: Col, lift: number, ground: Ground, taper = 1) {
    const n = pts.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3], dx = bx - ax, dz = bz - az, l = Math.sqrt(dx * dx + dz * dz) || 1;
      const wa = (w * (1 - (1 - taper) * (i / (n - 1)))) / 2, wb = (w * (1 - (1 - taper) * ((i + 1) / (n - 1)))) / 2, px = -dz / l, pz = dx / l;
      const ya = ground(ax, az) + lift, yb = ground(bx, bz) + lift;
      this.quad([ax + px * wa, ya, az + pz * wa], [ax - px * wa, ya, az - pz * wa], [bx - px * wb, yb, bz - pz * wb], [bx + px * wb, yb, bz + pz * wb], col);
    }
  }
  /** A polygon on a wall: (u, y) pairs along t from (x0, z0), pushed out along n by off; fan from the first point. */
  wall(x0: number, z0: number, tx: number, tz: number, nx: number, nz: number, uy: readonly number[], off: number, col: Col, col2: Col = col) {
    const n = uy.length / 2, ax = x0 + tx * uy[0] + nx * off, az = z0 + tz * uy[0] + nz * off;
    for (let i = 1; i < n - 1; i++) {
      const u1 = uy[i * 2], y1 = uy[i * 2 + 1], u2 = uy[i * 2 + 2], y2 = uy[i * 2 + 3];
      this.tri(ax, uy[1], az, x0 + tx * u1 + nx * off, y1, z0 + tz * u1 + nz * off, x0 + tx * u2 + nx * off, y2, z0 + tz * u2 + nz * off, col, col2, col2);
    }
  }
}

const VEHICLES = new Set<RuinKind>(['car', 'carBurnt', 'moto', 'bus']);
/** Small kinds, drawn after everything else in a chunk (and dropped first when it is over its triangle budget). */
const FINE = new Set<RuinKind>(['vine', 'window', 'weeds', 'litter', 'grass', 'crack', 'shards', 'cable', 'stall']);
/** Kinds left out at quality levels 4-5 (no vines, grass tufts, litter or window patches there). */
const LOW_SKIP = new Set<RuinKind>(['vine', 'window', 'weeds', 'litter', 'shards', 'stall']);
/** Triangles per chunk mesh: High (levels 0-3) and Low (4-5). */
export const CHUNK_TRIS = { high: 30_000, low: 12_000 } as const;
const skipLow = (it: RuinItem) => LOW_SKIP.has(it.kind) || (it.kind === 'grass' && !it.ext && (it.v & 1) === 0 && it.id % 3 !== 0);

/** Appends one item's pieces (vehicles are drawn by the wreck pool, not here). */
function buildItem(g: Geo, it: RuinItem, ground: Ground, low: boolean, budget = 0) {
  const C = pal(), T = tpl(), seed = it.v * 7 + (it.id % 100003);
  const R = mulberry32(hash32(it.id, it.v));
  const y0 = ground(it.x, it.z), yaw = it.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), tx = Math.cos(yaw), tz = -Math.sin(yaw);
  const pick = <V>(list: readonly V[]) => list[Math.floor(R() * list.length)];
  switch (it.kind) {
    case 'rubble': {
      // A mound of broken concrete, plaster and brick, the biggest blocks in the middle; slabs and rebar where a wall
      // came down; moss on the old ones.
      // ext[2] > 0: a district building's heap, every piece kept within s of its middle (planRuins' RUBBLE_MARGIN).
      const s = it.s, H = it.ext?.[0] ?? 0.5, wall = (it.ext?.[1] ?? 0) > 0, held = (it.ext?.[2] ?? 0) > 0;
      const n = Math.min(low ? 10 : 20, 5 + Math.round(s * 5));
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d0 = i === 0 ? 0 : s * Math.sqrt(R()) * 0.92, r = s * (i < 3 ? 0.2 + R() * 0.12 : 0.08 + R() * 0.14);
        // (a rock is at most 1.4 r across its scale and 1.225 its jitter: 1.75 r from its middle)
        const d = held ? Math.min(d0, Math.max(0, s - r * 1.75)) : d0;
        const mound = H * (1 - (d / (s + 0.01)) * (d / (s + 0.01)));
        const u = R(), col = u < 0.55 ? (R() < 0.5 ? C.concrete : C.concrete2) : u < 0.7 ? C.plaster : u < 0.92 ? (R() < 0.5 ? C.brick : C.brick2) : C.dark;
        g.shape(R() < 0.5 ? T.rock : T.dodec, it.x + Math.sin(a) * d, y0 + Math.max(r * 0.35, mound - r * 0.4), it.z + Math.cos(a) * d, R() * 6, (R() - 0.5) * 0.8, (R() - 0.5) * 0.8,
          r * (0.9 + R() * 0.5), r * (0.6 + R() * 0.4), r * (0.8 + R() * 0.5), col, { vary: 0.16, seed: seed + i, jitter: 0.45, y0, moss: 0.3 });
      }
      // (slabs and rebar reach 0.8 m from their middles)
      const reach = held ? Math.max(0, s - 0.8) : Infinity;
      if (wall || s > 1.6) for (let i = 0; i < (low ? 2 : 4); i++) {
        const a = R() * Math.PI * 2, d = Math.min(reach, s * R() * 0.6);
        g.shape(T.box, it.x + Math.sin(a) * d, y0 + H * (0.25 + R() * 0.35), it.z + Math.cos(a) * d, R() * 6, (R() - 0.5) * 1.0, (R() - 0.5) * 0.6, 0.6 + R() * 0.7, 0.12, 0.4 + R() * 0.5, C.slab, { seed: seed + 50 + i, y0 });
      }
      if (wall) for (let i = 0; i < (low ? 3 : 8); i++) {
        const a = R() * Math.PI * 2, d = Math.min(reach, s * R() * 0.6);
        g.shape(T.box, it.x + Math.sin(a) * d, y0 + 0.3 + R() * H * 0.6, it.z + Math.cos(a) * d, R() * 6, (R() - 0.5) * 2.2, (R() - 0.5) * 1.6, 0.035, 0.035, 0.7 + R() * 0.9, C.rust, { vary: 0.2, seed: seed + 80 + i });
      }
      break;
    }
    case 'breach': {
      // The corner came down: a dark jagged hole over the top corner of the front and side walls, the roof gone above
      // it, broken floor slabs sticking out, one hanging, rebar, a soot rim.
      const h = it.s, end = (it.v & 1) === 1, frac = it.ext?.[0] ?? 0.4, wF = it.ext?.[1] ?? 3, wS = it.ext?.[2] ?? 2.5;
      const nx = fx, nz = fz, ttx = nz, ttz = -nx, sv = end ? 1 : -1;     // the corner is at +sv·t of the face's middle
      const yLow = y0 + h * (1 - frac), top = y0 + h + 0.35, roof = y0 + h;
      const jag = (w: number, n: number) => {
        const uy: number[] = [0, top, w, top];
        for (let i = n; i >= 0; i--) {
          const u = (w * i) / n, inner = i > 0 && i < n, rise = (u / w) * (roof - yLow) * 0.75;
          uy.push(u + (inner ? (R() - 0.5) * 0.25 : 0), yLow + rise + (inner ? (R() - 0.3) * 0.9 : 0));
        }
        return uy;
      };
      const front = jag(wF, low ? 4 : 7), side = jag(wS, low ? 3 : 5);
      const rimOf = (uy: number[]) => uy.map((v, i) => (i % 2 ? (v < top - 0.01 ? v - 0.45 : v) : v * 1.12 + 0.1));
      // Front face: u runs from the corner inward (−sv·t); the side face: u runs from the corner back (−n). Both stand
      // 0.4 m proud of the wall line, in front of window surrounds, grilles, pilasters and the cornice (world.ts), with
      // the broken wall's thickness drawn round the hole.
      const OFF = 0.42;
      g.wall(it.x, it.z, -sv * ttx, -sv * ttz, nx, nz, rimOf(front), OFF - 0.02, C.sootRim, C.soot);
      g.wall(it.x, it.z, -sv * ttx, -sv * ttz, nx, nz, front, OFF, C.void);
      g.wall(it.x, it.z, -nx, -nz, sv * ttx, sv * ttz, rimOf(side), OFF - 0.02, C.sootRim, C.soot);
      g.wall(it.x, it.z, -nx, -nz, sv * ttx, sv * ttz, side, OFF, C.void);
      for (let i = 6; i < front.length - 2; i += 2) {
        // The jagged edge's broken wall thickness, back from the hole to the wall.
        const ua = front[i], ya = front[i + 1], ub = front[i + 2], yb = front[i + 3];
        const P = (u: number, y: number, o: number) => [it.x - sv * ttx * u + nx * o, y, it.z - sv * ttz * u + nz * o];
        g.quad(P(ua, ya, OFF), P(ub, yb, OFF), P(ub, yb, 0), P(ua, ya, 0), C.slab, C.dark);
      }
      // The roof over the corner fell in (above the roof tiles at +0.37).
      const rx = it.x - sv * ttx * wF * 0.5 - nx * wS * 0.5, rz = it.z - sv * ttz * wF * 0.5 - nz * wS * 0.5;
      g.shape(T.box, rx + nx * OFF * 0.5 - sv * ttx * 0, roof + 0.43, rz + nz * OFF * 0.5, yaw, 0, 0, wF * 0.95 + 0.2, 0.05, wS * 0.95 + OFF, C.void, { vary: 0 });
      // Floor slab edges at every storey inside the hole, one sagging out and down, rebar.
      for (let y = y0 + Math.ceil((h * (1 - frac)) / 3.2) * 3.2; y < roof - 0.4; y += 3.2) {
        const len = wF * (0.4 + R() * 0.5), u = len / 2 + R() * (wF - len);
        g.shape(T.box, it.x - sv * ttx * u + nx * 0.35, y, it.z - sv * ttz * u + nz * 0.35, yaw, -0.08 - R() * 0.15, 0, len, 0.2, 0.8 + R() * 0.5, C.slab, { seed: seed + Math.round(y), y0 });
        if (!low) for (let i = 0; i < 4; i++) {
          const uu = u + (R() - 0.5) * len, out = 0.8 + R() * 0.4;
          g.shape(T.box, it.x - sv * ttx * uu + nx * out, y + (R() - 0.5) * 0.15, it.z - sv * ttz * uu + nz * out, yaw + (R() - 0.5) * 0.8, (R() - 0.5) * 0.6, 0, 0.03, 0.03, 0.6 + R() * 0.7, C.rust, { seed: seed + i });
        }
      }
      const sagU = wF * 0.5, ang = 0.6 + R() * 0.5;
      g.shape(T.box, it.x - sv * ttx * sagU + nx * (0.15 + Math.sin(ang) * 0.9), yLow + 0.2 - Math.cos(ang) * 0.9, it.z - sv * ttz * sagU + nz * (0.15 + Math.sin(ang) * 0.9), yaw, ang, (R() - 0.5) * 0.3, wF * 0.6, 0.18, 1.9, C.slab, { seed: seed + 9 });
      // The wall that came off: the storey's facade hinged down from the bottom of the hole, its far end on the rubble
      // out on the sidewalk, windows dark, top edge broken, rebar out of its sides.
      // (ext[3]: how far out it may reach, a district building's RUBBLE_MARGIN; it then leans on the wall)
      const out = Math.min(2.6 + R() * 0.8, it.ext?.[3] ?? Infinity), pu = wF * (0.45 + R() * 0.15), bx = it.x - sv * ttx * pu + nx * out, bz = it.z - sv * ttz * pu + nz * out, by = y0 + 1.0;
      const topY = yLow + 0.1, dn = OFF + 0.15 - out, dy = topY - by, len = Math.sqrt(dn * dn + dy * dy), tilt = Math.atan2(dn, dy);
      const pw = Math.min(wF * 0.85, 3.6), mx = bx + nx * dn / 2, my = by + dy / 2, mz = bz + nz * dn / 2, twist = (R() - 0.5) * 0.25;
      const wallCol = mix(pick([C.plaster, C.concrete2, C.plaster]), C.soot, 0.22);
      g.shape(T.box, mx, my, mz, yaw + twist, tilt, (R() - 0.5) * 0.12, pw, len, 0.24, wallCol, { seed: seed + 11, y0, vary: 0.08 });
      for (const a of [-0.25, 0.25]) g.shape(T.box, mx + (-sv * ttx) * pw * a, my + dy * 0.12, mz + (-sv * ttz) * pw * a, yaw + twist, tilt, 0, pw * 0.26, len * 0.32, 0.28, C.void, { seed, vary: 0 });
      for (let i = 0; i < (low ? 2 : 4); i++) {
        const a = (R() - 0.5) * pw, ex = mx + nx * dn * 0.5 + (-sv * ttx) * a, ey = my + dy * 0.5, ez = mz + nz * dn * 0.5 + (-sv * ttz) * a;
        g.shape(R() < 0.5 ? T.rock : T.box, ex, ey, ez, yaw + R(), R(), R(), 0.25 + R() * 0.3, 0.2 + R() * 0.25, 0.22, wallCol, { seed: seed + 60 + i, jitter: 0.4 });
        if (!low) g.shape(T.box, ex + (R() - 0.5) * 0.4, ey + 0.2, ez, yaw + (R() - 0.5), (R() - 0.5) * 1.2, 0, 0.03, 0.9, 0.03, C.rust, { seed: seed + 70 + i });
      }
      break;
    }
    case 'shell': {
      // Inside a ruined shell: the bare floor, the pancaked roof slab leaning on rubble, heaps, the collapsed road side.
      const w = it.s, d = it.ext?.[0] ?? 7, hw = w / 2, hd = d / 2;
      const corner = (a: number, b: number) => [it.x + tx * a * hw + fx * b * hd, it.z + tz * a * hw + fz * b * hd];
      g.decal([it.x, it.z, ...corner(1, 1), ...corner(-1, 1), ...corner(-1, -1), ...corner(1, -1), ...corner(1, 1)], C.dark, 0.025, ground);
      // The roof came down in pieces: one leaning on the back wall, one lying on the rubble.
      g.shape(T.box, it.x - fx * d * 0.22 + tx * w * 0.15, y0 + 1.15, it.z - fz * d * 0.22 + tz * w * 0.15, yaw + (R() - 0.5) * 0.2, -(0.45 + R() * 0.2), (R() - 0.5) * 0.25, w * 0.42, 0.2, d * 0.5, C.slab, { seed, y0, moss: 0.35 });
      g.shape(T.box, it.x + fx * d * 0.05 - tx * w * 0.18, y0 + 0.45, it.z + fz * d * 0.05 - tz * w * 0.18, yaw + (R() - 0.5) * 0.5, (R() - 0.5) * 0.25, (R() - 0.5) * 0.25, w * 0.36, 0.2, d * 0.38, C.slab, { seed: seed + 1, y0, moss: 0.35 });
      for (let i = 0; i < (low ? 3 : 6); i++) {
        const u = (R() - 0.5) * w * 0.8, v = (R() - 0.3) * d;
        g.shape(T.dodec, it.x + tx * u + fx * v * 0.5, y0 + 0.2, it.z + tz * u + fz * v * 0.5, R() * 6, 0, 0, 0.5 + R() * 0.6, 0.35 + R() * 0.3, 0.5 + R() * 0.6, pick([C.brick, C.concrete, C.plaster]), { seed: seed + i, jitter: 0.5, y0, moss: 0.3 });
      }
      for (let i = 0; i < (low ? 4 : 8); i++) {
        const u = (i / 7 - 0.5) * w;
        g.shape(T.rock, it.x + tx * u + fx * (hd - 0.2), y0 + 0.12, it.z + tz * u + fz * (hd - 0.2), R() * 6, 0, 0, 0.45 + R() * 0.4, 0.25 + R() * 0.25, 0.4 + R() * 0.3, pick([C.brick, C.brick2, C.plaster]), { seed: seed + 30 + i, jitter: 0.4, y0 });
      }
      break;
    }
    case 'wall': {
      // A broken wall along its forward axis: a jagged top, window holes, moss at the foot.
      const len = it.s, H = it.ext?.[0] ?? 3.5, n = Math.max(2, Math.round(len / 0.8)), seg = len / n;
      const col = R() < 0.6 ? C.brick : C.plaster;
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * seg, edge = Math.min(i, n - 1 - i);
        const hTop = H * (edge === 0 ? 0.45 + R() * 0.4 : 0.7 + R() * 0.3) - (R() < 0.2 ? R() * 1.4 : 0);
        const window = i % 3 === 1 && hTop > 2.5 && edge > 0;
        for (const [a, b] of window ? [[0, 0.95], [2.2, hTop]] : [[0, hTop]]) {
          if (b - a < 0.15) continue;
          g.shape(T.box, it.x + fx * u, y0 + (a + b) / 2, it.z + fz * u, yaw, 0, 0, 0.3, b - a, seg + 0.02, R() < 0.25 ? C.brick2 : col, { seed: seed + i, y0, aoH: 1.2, vary: 0.1 });
        }
        if (!low && R() < 0.5) g.shape(T.box, it.x + fx * u + tx * 0.17, y0 + 0.3, it.z + fz * u + tz * 0.17, yaw, 0, 0, 0.04, 0.4 + R() * 0.5, seg, C.moss, { seed: seed + i + 99 });
      }
      break;
    }
    case 'tree': {
      // Uprooted: the root ball standing on edge, the trunk across the street, the crown flattened at its tip.
      const len = it.s, size = Math.max(0.7, Math.min(1.6, it.ext?.[0] ?? 1)), species = it.ext?.[1] ?? 0, r = 0.16 + 0.1 * size;
      g.shape(T.dodec, it.x - fx * 0.15, y0 + 0.8 * size, it.z - fz * 0.15, yaw, Math.PI / 2, R(), 1.05 * size, 0.32, 1.05 * size, C.soil, { seed, jitter: 0.55, vary: 0.25 });
      const hole: number[] = [it.x - fx * 1.0, it.z - fz * 1.0];
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2; hole.push(it.x - fx * 1.0 + Math.sin(a) * 0.9 * size * (i % 8 ? 0.8 + R() * 0.4 : 1), it.z - fz * 1.0 + Math.cos(a) * 0.9 * size * (i % 8 ? 0.8 + R() * 0.4 : 1)); }
      g.decal(hole, scale3(C.soil, 0.6), 0.02, ground, C.soil);
      for (let i = 0; i < (low ? 2 : 5); i++) g.shape(T.box, it.x - fx * 0.3, y0 + 0.3 + R() * 1.2 * size, it.z - fz * 0.3, yaw + (R() - 0.5) * 2.4, (R() - 0.5) * 1.5, 0, 0.08, 0.08, 0.9 + R() * 0.6, C.bark, { seed: seed + i });
      const midY = y0 + 0.45;
      g.shape(T.cyl6, it.x + fx * len / 2, midY, it.z + fz * len / 2, yaw, Math.PI / 2, 0, r, len, r, C.bark, { seed: seed + 3, vary: 0.15 });
      const tipX = it.x + fx * len, tipZ = it.z + fz * len;
      if (species === 1) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.shape(T.box, tipX + Math.sin(yaw + a) * 1.1, y0 + 0.35 + Math.abs(Math.cos(a)) * 0.4, tipZ + Math.cos(yaw + a) * 1.1, yaw + a, 0.15, 0, 0.5, 0.04, 2.4, pick([C.leafDry, C.leaf2, C.leafDead]), { seed: seed + i });
        }
      } else if (species === 2) {
        for (let i = 0; i < 7; i++) g.shape(T.cyl6, tipX - fx * 2 + (R() - 0.5) * 1.5, y0 + 0.3, tipZ - fz * 2 + (R() - 0.5) * 1.5, yaw + (R() - 0.5) * 0.6, Math.PI / 2, 0, 0.05, 5, 0.05, C.leafDry, { seed: seed + i });
      } else {
        // The crown crushed flat on the street: clumps of leaves, greener inside, dry at the edges.
        for (let i = 0; i < (low ? 4 : 9); i++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 1.9 * size, u = R();
          const col = d < size ? (u < 0.6 ? C.leaf : C.leaf2) : u < 0.4 ? C.leaf2 : u < 0.75 ? C.leafDry : C.leafDead;
          g.shape(T.rock, tipX - fx * 0.9 + Math.sin(a) * d, y0 + 0.45 + R() * 0.45 * size, tipZ - fz * 0.9 + Math.cos(a) * d, R() * 6, R() - 0.5, R() - 0.5, (0.6 + R() * 0.45) * size, (0.38 + R() * 0.22) * size, (0.6 + R() * 0.45) * size, col, { seed: seed + 20 + i, jitter: 0.6, y0, vary: 0.22 });
        }
        for (let i = 0; i < (low ? 1 : 3); i++) {
          const along = len * (0.45 + R() * 0.35), side = R() < 0.5 ? -1 : 1;
          g.shape(T.cyl6, it.x + fx * along + tx * side * 0.8, midY + 0.3, it.z + fz * along + tz * side * 0.8, yaw + side * (0.6 + R() * 0.4), Math.PI / 2 - 0.25, 0, 0.06, 1.9, 0.06, C.bark, { seed: seed + 40 + i });
        }
      }
      break;
    }
    case 'pole': {
      // A snapped concrete pole: the stump with a broken top, the rest leaning or lying across the street.
      const lean = it.roll, len = it.s, flat = Math.abs(Math.sin(lean)) > 0.97;
      g.shape(T.tcyl, it.x, y0 + 0.5, it.z, 0, 0, 0, 0.17, 1.0, 0.17, C.pole, { seed });
      g.shape(T.cone8, it.x, y0 + 1.1, it.z, R() * 6, (R() - 0.5) * 0.4, 0, 0.15, 0.25, 0.15, C.slab, { seed, jitter: 0.6 });
      const bx = it.x + fx * (flat ? 0.4 : 0.1), by = flat ? y0 + 0.2 : y0 + 0.95, bz = it.z + fz * (flat ? 0.4 : 0.1);
      const dy = flat ? 0 : Math.cos(lean), dh = flat ? 1 : Math.sin(lean);
      g.shape(T.tcyl, bx + fx * dh * len / 2, by + dy * len / 2, bz + fz * dh * len / 2, yaw, flat ? Math.PI / 2 : lean, 0, 0.15, len, 0.15, C.pole, { seed: seed + 1 });
      const ex = bx + fx * dh * (len - 0.5), ey = by + dy * (len - 0.5), ez = bz + fz * dh * (len - 0.5);
      g.shape(T.box, ex, ey + (flat ? 0.15 : 0), ez, yaw + Math.PI / 2, 0, 0, 1.6, 0.1, 0.1, C.dark, { seed: seed + 2 });
      break;
    }
    case 'cable': {
      // A snapped cable sagging from the next pole's top down to the street.
      const ax = it.x, ay = y0 + it.y, az = it.z, bx = it.ext?.[0] ?? ax, bz = it.ext?.[1] ?? az, by = ground(bx, bz) + (it.ext?.[2] ?? 0) + 0.05;
      const n = low ? 5 : 9, w = 0.035;
      let px = ax, py = ay, pz = az;
      for (let i = 1; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t - Math.sin(Math.PI * t) * 0.9 * (1 - t * 0.5);
        g.quad([px, py + w, pz], [x, y + w, z], [x, y - w, z], [px, py - w, pz], C.cable);
        g.quad([px - w, py, pz - w], [x - w, y, z - w], [x + w, y, z + w], [px + w, py, pz + w], C.cable);
        px = x; py = y; pz = z;
      }
      break;
    }
    case 'vine': {
      // Curtains of creeper hanging from the roof edge, dark at the top, a mat of leaves along the edge.
      const w = it.s, H = y0 + (it.ext?.[0] ?? 8), frac = it.ext?.[1] ?? 0.5, x0 = it.x - tx * w / 2, z0 = it.z - tz * w / 2, h = it.ext?.[0] ?? 8;
      const n = Math.max(3, Math.round(w / 0.75));
      for (let i = 0; i < n; i++) {
        if (R() < 0.3) continue;
        // In front of window surrounds and grilles (world.ts' facades reach +0.37), behind the balcony fronts.
        const u = (i + 0.2 + R() * 0.6) * (w / n), sw = 0.28 + R() * 0.45, L = h * frac * (0.4 + R() * 0.6), segs = 4, off = 0.32 + R() * 0.1;
        const P = (uu: number, y: number, o: number) => [x0 + tx * uu + fx * o, y, z0 + tz * uu + fz * o];
        for (let s = 0; s < segs; s++) {
          const ya = H + 0.15 - (L * s) / segs, yb = H + 0.15 - (L * (s + 1)) / segs, wa = sw * (1 - s * 0.12), wb = s === segs - 1 ? 0.04 : sw * (1 - (s + 1) * 0.12);
          const oa = off + 0.04 * Math.sin(s + i), ob = off + 0.04 * Math.sin(s + 1 + i);
          g.quad(P(u - wa / 2, ya, oa), P(u + wa / 2, ya, oa), P(u + wb / 2, yb, ob), P(u - wb / 2, yb, ob), mix(C.vine, C.vine2, s / segs), mix(C.vine, C.vine2, (s + 1) / segs));
        }
        if (R() < 0.6) g.shape(T.octa, x0 + tx * u + fx * (off + 0.08), H - L * (0.3 + R() * 0.5), z0 + tz * u + fz * (off + 0.08), R() * 6, R(), 0, 0.22, 0.3, 0.12, pick([C.leaf, C.leaf2, C.vine2]), { seed: seed + i });
      }
      g.shape(T.box, it.x + fx * 0.3, H + 0.3, it.z + fz * 0.3, yaw, 0, 0, w * 0.96, 0.3, 0.7, C.vine, { seed, vary: 0.25 });
      break;
    }
    case 'moss': {
      // A green band at the foot of the wall with a ragged top, and a strip of moss on the paving.
      const w = it.s, H = it.ext?.[0] ?? 0.6, x0 = it.x - tx * w / 2, z0 = it.z - tz * w / 2, n = Math.max(3, Math.round(w / 0.7));
      const uy: number[] = [w / 2, y0 + H * 0.2];
      for (let i = 0; i <= n; i++) uy.push((w * i) / n, y0 + H * (0.45 + R() * 0.8));
      uy.push(w, y0 - 0.05, 0, y0 - 0.05, 0, y0 + H * 0.6);
      g.wall(x0, z0, tx, tz, fx, fz, uy, 0.12, C.moss, C.moss2);
      if (!low) g.ribbon([x0 + fx * 0.25, z0 + fz * 0.25, x0 + tx * w + fx * 0.25, z0 + tz * w + fz * 0.25], 0.45, scale3(C.moss, 0.8), 0.012, ground, 0.6);
      break;
    }
    case 'weeds': {
      // A strip of tufts along a road cell: along the curb (ext[1] = its offset) or through cracks in the lane (ext[1] = half width).
      const crack = (it.v & 1) === 1, [count, off, u0, u1] = it.ext ?? [1, 0, 0, 0];
      for (let i = 0; i < count; i++) {
        const u = u0 + R() * (u1 - u0), lat = crack ? (R() * 2 - 1) * off : off + (R() - 0.5) * 0.24, x = it.x + fx * u - fz * lat, z = it.z + fz * u + fx * lat;
        const size = crack ? 0.2 + R() * 0.25 : 0.25 + R() * 0.35, n = crack ? 4 : 5, gy = ground(x, z);
        for (let b = 0; b < n; b++) {
          const a = (b / n) * Math.PI * 2 + R(), h = size * (0.6 + R() * 0.6), r = size * 0.45, col = crack ? pick([C.weed, C.weedDry]) : pick([C.weed, C.weed2, C.weedDry, C.leaf2]);
          const bx = x + Math.sin(a) * 0.05, bz = z + Math.cos(a) * 0.05, w = 0.05 + R() * 0.05;
          g.tri(bx - Math.cos(a) * w, gy, bz + Math.sin(a) * w, bx + Math.cos(a) * w, gy, bz - Math.sin(a) * w, x + Math.sin(a) * r, gy + h, z + Math.cos(a) * r, scale3(col, 0.6), scale3(col, 0.6), col);
        }
      }
      break;
    }
    case 'grass': {
      const clump = (x: number, gy: number, z: number, s: number, shrub: boolean, sd: number) => {
        if (shrub) {
          // A shrub run wild.
          for (let i = 0; i < 3; i++) g.shape(T.rock, x + (R() - 0.5) * s * 0.6, gy + s * 0.35, z + (R() - 0.5) * s * 0.6, R() * 6, 0, 0, s * (0.45 + R() * 0.25), s * (0.38 + R() * 0.2), s * (0.45 + R() * 0.25), pick([C.leaf, C.leaf2, C.leafDry]), { seed: sd + i, jitter: 0.5, y0: gy, vary: 0.25 });
        } else {
          for (let i = 0; i < (low ? 4 : 7); i++) {
            const a = R() * Math.PI * 2, h = s * (0.7 + R() * 0.6), r = s * 0.35, w = 0.07, col = pick([C.weed, C.weed2, C.weedDry, C.leafDry]);
            g.tri(x - Math.cos(a) * w, gy, z + Math.sin(a) * w, x + Math.cos(a) * w, gy, z - Math.sin(a) * w, x + Math.sin(a) * r, gy + h, z + Math.cos(a) * r, scale3(col, 0.55), scale3(col, 0.55), col);
          }
        }
      };
      if (it.ext) {
        // A polygon green's clumps in this chunk (ext = [count, x0, z0, x1, z1, ...polygon]): scattered in the bounds,
        // kept to the polygon, a third of the tufts at Low, no more than the chunk's triangle budget allows.
        const [count, x0, z0, x1, z1] = it.ext, poly = it.ext.slice(5);
        for (let i = 0; i < count; i++) {
          if (budget && g.tris > budget - 400) break;
          const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), shrub = R() < 0.28, s = 0.6 + R() * 0.9;
          if (!inPoly(poly, x, z) || (low && !shrub && i % 3 !== 0)) continue;
          clump(x, ground(x, z), z, s, shrub, seed + i * 7);
        }
        break;
      }
      clump(it.x, y0, it.z, it.s, (it.v & 1) === 1, seed);
      break;
    }
    case 'crack': {
      // Branching cracks scattered over a road cell's asphalt (ext = [count, half width, u0, u1]); half of them at Low.
      const [count, half, u0, u1] = it.ext ?? [1, 0, 0, 0];
      for (let c = 0; c < count; c++) {
        const u = u0 + R() * (u1 - u0), lat = (R() * 2 - 1) * half, len = 1.2 + R() * 2.8, n = 4 + Math.floor(R() * 3), seg = len / n;
        let x = it.x + fx * u - fz * lat, z = it.z + fz * u + fx * lat, a = R() * Math.PI * 2;
        const width = 0.1 + R() * 0.06, branches = R() < 0.6 ? 2 : 1;
        if (low && c % 2) { for (let i = 0; i < n * 2 + branches * 2; i++) R(); continue; }
        const pts = [x, z];
        for (let i = 0; i < n; i++) { a += (R() - 0.5) * 0.9; x += Math.sin(a) * seg; z += Math.cos(a) * seg; pts.push(x, z); }
        g.ribbon(pts, width, C.asphaltCrack, 0.012, ground, 0.3);
        for (let b = 0; b < branches; b++) {
          const i = 1 + Math.floor(R() * (n - 1)), bx = pts[i * 2], bz = pts[i * 2 + 1], ba = a + (R() < 0.5 ? -1 : 1) * (0.7 + R() * 0.6), bl = seg * (0.8 + R());
          if (!low) g.ribbon([bx, bz, bx + Math.sin(ba) * bl * 0.5, bz + Math.cos(ba) * bl * 0.5, bx + Math.sin(ba + 0.3) * bl, bz + Math.cos(ba + 0.3) * bl], 0.07, C.asphaltCrack, 0.012, ground, 0.2);
        }
      }
      break;
    }
    case 'scorch': case 'crater': {
      // Soot fading out to a ragged ash-grey edge (a crater: a dark pit ringed with broken asphalt).
      const crater = it.kind === 'crater', r = it.s, n = 14, ring: number[] = [it.x, it.z], inner: number[] = [it.x, it.z];
      let first = 0;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 + yaw, rr = i === n ? first : r * (0.62 + R() * 0.5);
        if (i === 0) first = rr;
        ring.push(it.x + Math.sin(a) * rr, it.z + Math.cos(a) * rr); inner.push(it.x + Math.sin(a) * rr * 0.55, it.z + Math.cos(a) * rr * 0.55);
      }
      g.decal(ring, crater ? scale3(C.crater, 0.7) : mix(C.scorch, C.sootRim, 0.35), crater ? 0.016 : 0.013, ground, crater ? C.crater : mix(C.sootRim, C.concrete, 0.35));
      g.decal(inner, crater ? scale3(C.crater, 0.4) : scale3(C.scorch, 0.75), crater ? 0.019 : 0.016, ground, crater ? scale3(C.crater, 0.7) : C.scorch);
      if (crater) for (let i = 0; i < (low ? 5 : 9); i++) {
        const a = (i / 9) * Math.PI * 2 + R() * 0.4;
        g.shape(T.rock, it.x + Math.sin(a) * r * 1.05, y0 + 0.06, it.z + Math.cos(a) * r * 1.05, R() * 6, 0, 0, 0.3 + R() * 0.3, 0.14 + R() * 0.1, 0.25 + R() * 0.2, pick([C.dark, C.concrete, C.crater]), { seed: seed + i, jitter: 0.5 });
      }
      break;
    }
    case 'shards': {
      for (let i = 0; i < (low ? 6 : 14); i++) {
        const a = R() * Math.PI * 2, d = R() * it.s, x = it.x + Math.sin(a) * d, z = it.z + Math.cos(a) * d, y = ground(x, z) + 0.015, s = 0.06 + R() * 0.12, b = R() * 6;
        g.tri(x, y, z, x + Math.sin(b + 1.9) * s, y, z + Math.cos(b + 1.9) * s, x + Math.sin(b) * s, y, z + Math.cos(b) * s, C.glassShard);
      }
      break;
    }
    case 'litter': {
      // A road cell's litter (ext = [count, lateral reach, u0, u1]), or one piece (no ext, v & 7 its type).
      const [count, reach, u0, u1] = it.ext ?? [1, 0, 0, 0];
      for (let i = 0; i < count; i++) {
        const u = it.ext ? u0 + R() * (u1 - u0) : 0, lat = it.ext ? (R() * 2 - 1) * reach : 0, x = it.x + fx * u - fz * lat, z = it.z + fz * u + fx * lat, gy = ground(x, z);
        const t = R(), type = it.ext ? (t < 0.5 ? 0 : t < 0.72 ? 1 : t < 0.82 ? 2 : t < 0.88 ? 3 : 4) : it.v & 7, a = R() * 6.3, ca = Math.cos(a), sa = Math.sin(a);
        if (type === 0) {
          const s = 0.18 + R() * 0.12, w = s * 0.75;
          g.decal([x + sa * s + ca * w, z + ca * s - sa * w, x - sa * s + ca * w, z - ca * s - sa * w, x - sa * s - ca * w, z - ca * s + sa * w, x + sa * s - ca * w, z + ca * s + sa * w], scale3(C.paper, 0.75 + R() * 0.25), 0.016, ground);
        } else if (type === 1) g.shape(T.octa, x, gy + 0.16, z, a, 0, 0, 0.3, 0.2, 0.26, R() < 0.75 ? C.bag : C.bag2, { seed: seed + i, jitter: 0.4 });
        else if (type === 2) g.shape(T.box, x, gy + 0.07, z, a, (R() - 0.5) * 0.4, 0, 0.36, 0.12, 0.26, C.foam, { seed: seed + i });
        else if (type === 3) g.shape(T.cone8, x, gy + 0.12, z, a, 1.2 + R() * 0.6, 0, 0.24, 0.2, 0.24, C.straw, { seed: seed + i });
        else for (let k = 0; k < 3; k++) g.shape(T.rock, x + (R() - 0.5) * 0.5, gy + 0.06, z + (R() - 0.5) * 0.5, R() * 6, 0, 0, 0.12 + R() * 0.12, 0.08 + R() * 0.06, 0.12 + R() * 0.1, pick([C.concrete, C.brick, C.dark]), { seed: seed + i * 3 + k, jitter: 0.4 });
      }
      break;
    }
    case 'stall': {
      const sub = it.v & 3, over = Math.abs(Math.sin(it.roll)) > 0.5;
      if (sub === 0) {
        const col = R() < 0.5 ? C.stoolRed : C.stoolBlue;
        g.shape(T.box, it.x, y0 + (over ? 0.15 : 0.45), it.z, yaw, over ? Math.PI / 2 : 0, 0, 0.3, 0.05, 0.3, col, { seed });
        g.shape(T.box, it.x - (over ? fx * 0.2 : 0), y0 + (over ? 0.15 : 0.22), it.z - (over ? fz * 0.2 : 0), yaw, over ? Math.PI / 2 : 0, 0, 0.26, 0.42, 0.26, scale3(col, 0.85), { seed: seed + 1 });
      } else if (sub === 1) {
        g.shape(T.box, it.x, y0 + (over ? 0.04 : 0.62), it.z, yaw, 0, over ? Math.PI : 0, 0.8, 0.04, 0.6, C.white, { seed });
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.shape(T.box, it.x + tx * a * 0.35 + fx * b * 0.25, y0 + (over ? 0.36 : 0.3), it.z + tz * a * 0.35 + fz * b * 0.25, yaw, 0, 0, 0.04, 0.62, 0.04, C.dark, { seed });
      } else {
        g.shape(T.box, it.x, y0 + 0.3, it.z, yaw, 0, Math.PI / 2, 0.55, 0.55, 0.85, C.cart, { seed });
        g.shape(T.box, it.x + tx * 0.5, y0 + 0.28, it.z + tz * 0.5, yaw, 0, Math.PI / 2, 0.5, 0.36, 0.8, C.cartTop, { seed: seed + 1 });
        g.shape(T.cyl8, it.x - tx * 0.05 + fx * 0.15, y0 + 0.6, it.z - tz * 0.05 + fz * 0.15, yaw, 0, 0, 0.2, 0.05, 0.2, C.bag, { seed });
      }
      break;
    }
    case 'barricade': {
      const sub = it.v & 3, len = it.s;
      if (sub === 0) {
        // Sandbags in two rows along the box's side axis, a third row part of the way.
        const n = Math.max(2, Math.round(len / 0.55));
        for (let row = 0; row < 3; row++) {
          const m = row === 2 ? Math.floor(n * 0.6) : n;
          for (let i = 0; i < m; i++) {
            const u = -len / 2 + (i + 0.5 + (row % 2) * 0.4) * (len / n);
            if (u > len / 2) continue;
            g.shape(T.box, it.x + tx * u + fx * (R() - 0.5) * 0.08, y0 + 0.13 + row * 0.24, it.z + tz * u + fz * (R() - 0.5) * 0.08, yaw + Math.PI / 2 + (R() - 0.5) * 0.25, 0, (R() - 0.5) * 0.1, 0.36, 0.24, 0.56, R() < 0.5 ? C.sand : C.sand2, { seed: seed + row * 50 + i, vary: 0.1 });
          }
        }
      } else if (sub === 1) {
        // A sawhorse barrier with striped planks.
        for (const a of [-1, 1]) for (const b of [-1, 1]) g.shape(T.box, it.x + tx * a * (len / 2 - 0.15) + fx * b * 0.18, y0 + 0.45, it.z + tz * a * (len / 2 - 0.15) + fz * b * 0.18, yaw, b * 0.35, 0, 0.06, 0.95, 0.06, C.plank, { seed });
        for (const y of [0.55, 0.85]) for (let i = 0; i < 6; i++) {
          const u = -len / 2 + (i + 0.5) * (len / 6);
          g.shape(T.box, it.x + tx * u, y0 + y, it.z + tz * u, yaw, 0, (R() - 0.5) * 0.05, len / 6 + 0.01, 0.14, 0.04, i % 2 ? C.red : C.white, { seed: seed + i, vary: 0.05 });
        }
      } else {
        // Coiled razor wire: rings along the side axis.
        const n = low ? 6 : Math.max(6, Math.round(len / 0.3));
        for (let i = 0; i < n; i++) {
          const u = -len / 2 + (i + 0.5) * (len / n), cx = it.x + tx * u, cz = it.z + tz * u, r = 0.32, segs = 7;
          for (let s = 0; s < segs; s++) {
            const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
            const p0 = [cx + fx * Math.sin(a0) * r, y0 + r + Math.cos(a0) * r, cz + fz * Math.sin(a0) * r], p1 = [cx + fx * Math.sin(a1) * r, y0 + r + Math.cos(a1) * r, cz + fz * Math.sin(a1) * r];
            g.quad([p0[0], p0[1] + 0.02, p0[2]], [p1[0], p1[1] + 0.02, p1[2]], [p1[0], p1[1] - 0.02, p1[2]], [p0[0], p0[1] - 0.02, p0[2]], C.wire);
          }
        }
      }
      break;
    }
    case 'barrel': {
      const burning = (it.v & 1) === 1, col = R() < 0.6 ? C.drum : C.drum2;
      g.shape(T.cyl8, it.x, y0 + 0.45, it.z, R() * 6, 0, 0, 0.3, 0.9, 0.3, burning ? scale3(col, 0.55) : col, { seed, vary: 0.15, y0 });
      g.shape(T.cyl8, it.x, y0 + 0.91, it.z, 0, 0, 0, 0.27, 0.02, 0.27, burning ? C.void : C.dark, { seed });
      break;
    }
    case 'tent': {
      // A white quarantine tent with a red cross on both long sides and a dark doorway.
      // 3.2 m along the street (its side axis), 2.4 m deep, the ridge along the street.
      g.shape(T.box, it.x, y0 + 0.85, it.z, yaw, 0, 0, 3.2, 1.7, 2.4, C.tent, { seed, vary: 0.05, y0 });
      g.shape(T.prism, it.x, y0 + 1.7, it.z, yaw + Math.PI / 2, 0, 0, 2.5, 0.7, 3.3, C.tent, { seed: seed + 1, vary: 0.05 });
      g.shape(T.box, it.x + fx * 1.22, y0 + 1.1, it.z + fz * 1.22, yaw, 0, 0, 0.8, 0.22, 0.03, C.tentRed, { seed });
      g.shape(T.box, it.x + fx * 1.22, y0 + 1.1, it.z + fz * 1.22, yaw, 0, 0, 0.22, 0.8, 0.03, C.tentRed, { seed });
      g.wall(it.x + fx * 1.21 + tx * 0.7, it.z + fz * 1.21 + tz * 0.7, tx, tz, fx, fz, [0, y0, 0.9, y0, 0.9, y0 + 1.5, 0, y0 + 1.5], 0, C.dark);
      break;
    }
    case 'window': {
      // A blown-out window: a ragged dark hole with a soot rim, boarded over now and then.
      // In front of the window glass (+0.26 in world.ts), behind the grilles.
      const w = it.s, h = it.ext?.[0] ?? 1, yc = y0 + it.y, boarded = (it.v & 1) === 1, x0 = it.x - tx * w / 2, z0 = it.z - tz * w / 2;
      g.wall(x0, z0, tx, tz, fx, fz, [w / 2, yc, -0.18, yc - h / 2 - 0.15, w + 0.2, yc - h / 2 - 0.12, w + 0.18, yc + h / 2 + 0.5, w * 0.5, yc + h / 2 + 0.9, -0.15, yc + h / 2 + 0.45, -0.18, yc - h / 2 - 0.15], 0.28, C.sootRim, C.soot);
      g.wall(x0, z0, tx, tz, fx, fz, [w / 2, yc, 0, yc - h / 2 + (R() - 0.5) * 0.15, w * 0.3, yc - h / 2 - R() * 0.12, w * 0.7, yc - h / 2 + R() * 0.1, w, yc - h / 2, w + R() * 0.12, yc, w, yc + h / 2,
        w * 0.6, yc + h / 2 + R() * 0.15, w * 0.25, yc + h / 2 - R() * 0.1, 0, yc + h / 2, -R() * 0.12, yc, 0, yc - h / 2], 0.3, C.void);
      if (boarded) for (let i = 0; i < 3; i++) g.shape(T.box, it.x + fx * 0.34, yc - h * 0.3 + i * h * 0.3, it.z + fz * 0.11, yaw, 0, (R() - 0.5) * 0.5, w * 1.15, 0.16, 0.04, C.plank, { seed: seed + i });
      break;
    }
    case 'patch': {
      // A tower's blown-out windows over a few floors and the soot plume above them.
      const w = it.s, h = it.ext?.[0] ?? 2, yb = y0 + it.y, x0 = it.x - tx * w / 2, z0 = it.z - tz * w / 2;
      g.wall(x0, z0, tx, tz, fx, fz, [w / 2, yb + h + 2, -0.4, yb - 0.3, w + 0.4, yb - 0.3, w + 0.9, yb + h + 1.5, w * 0.7, yb + h + 4.5, w * 0.3, yb + h + 5.2, -0.6, yb + h + 2, -0.4, yb - 0.3], 0.28, C.sootRim, C.soot);
      g.wall(x0, z0, tx, tz, fx, fz, [w / 2, yb + h / 2, 0, yb, w * 0.4, yb + R() * 0.2, w, yb, w + 0.1, yb + h * 0.6, w * 0.8, yb + h, w * 0.3, yb + h - R() * 0.3, 0, yb + h, 0, yb], 0.3, C.void);
      break;
    }
    case 'sign': {
      // A shop sign leaning against the wall it fell from, its lettering faded.
      signColors ??= SIGN_HEX.map(lin);
      const w = it.s, col = scale3(signColors[it.v % signColors.length], 0.7), tilt = 0.35 + (it.roll % 4) * 0.12;
      g.shape(T.box, it.x - fx * 0.15, y0 + 0.5, it.z - fz * 0.15, yaw, -tilt, (R() - 0.5) * 0.15, w, 1.05, 0.1, col, { seed, vary: 0.08 });
      for (let i = 0; i < 2; i++) g.shape(T.box, it.x - fx * 0.08, y0 + 0.35 + i * 0.32, it.z - fz * 0.08, yaw, -tilt, 0, w * (0.5 + R() * 0.35), 0.11, 0.11, C.white, { seed: seed + i, vary: 0.1 });
      break;
    }
    case 'tangle': {
      // Fallen motorbikes in a heap: each a low body and two wheels (≤ 60 triangles).
      const n = it.v & 15;
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d = R() * it.s * 0.8, x = it.x + Math.sin(a) * d * 1.2, z = it.z + Math.cos(a) * d * 0.7, by = yaw + R() * 6.3, tier = i > n * 0.6 ? 0.35 : 0;
        const col = mix(lin(MOTO_PAINTS[Math.floor(R() * MOTO_PAINTS.length)]), C.sand2, 0.45);
        g.shape(T.box, x, y0 + 0.28 + tier, z, by, 0, Math.PI / 2 - 0.2, 0.4, 0.32, 1.35, col, { seed: seed + i });
        for (const e of [-0.62, 0.62]) g.shape(T.cyl6, x + Math.sin(by) * e, y0 + 0.12 + tier, z + Math.cos(by) * e, by + Math.PI / 2, 0, Math.PI / 2 - 0.2, 0.28, 0.09, 0.28, C.bag, { seed });
      }
      break;
    }
    default: break;
  }
}

/** Build order within a chunk: everything else, then the small kinds, the overgrown parks' grass last (the first dropped). */
const phaseOf = (kind: RuinKind) => (!FINE.has(kind) ? 0 : kind === 'grass' ? 2 : 1);

/** Builds one chunk's mesh geometry at once (tests and tools; the runtime builds it in time slices). */
export function buildChunkGeometry(plan: RuinPlan, key: number, ground: Ground, level = 0) {
  const g = new Geo(), low = level >= 4, budget = low ? CHUNK_TRIS.low : CHUNK_TRIS.high;
  const list = plan.chunks.get(key) ?? [];
  for (let phase = 0; phase < 3; phase++) for (const i of list) {
    const it = plan.items[i];
    if (VEHICLES.has(it.kind) || phaseOf(it.kind) !== phase || (low && skipLow(it))) continue;
    if (phase > 0 && g.tris > budget - 400) break;
    buildItem(g, it, ground, low, budget);
  }
  return { geometry: geometryOf(g), triangles: g.tris };
}
function geometryOf(g: Geo) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(g.p.slice(0, g.v * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(g.n.slice(0, g.v * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(g.c.slice(0, g.v * 3), 3));
  geometry.computeBoundingSphere();
  return geometry;
}
/**
 * A builder's triangles in the chunk pages' compact form: positions, normals as 8-bit signed and colours as 16-bit
 * unsigned normalized quads (24 bytes a vertex instead of 36; 16 bits keep the dark soot and voids from banding as 8
 * would), padded with degenerate zero vertices to `count` (a page slot's size: copied whole with one typed-array set,
 * where three.js would zero the rest of the slot a component at a time), its bounding sphere that of its own vertices.
 */
function compactGeometry(g: Geo, count = g.v) {
  const n = g.v, position = new Float32Array(count * 3), normal = new Int8Array(count * 4), color = new Uint16Array(count * 4), P = g.p, N = g.n, Cc = g.c;
  position.set(P.subarray(0, n * 3));
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0, j = 0, k = 0; i < n; i++, j += 3, k += 4) {
    const x = P[j], y = P[j + 1], z = P[j + 2];
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    normal[k] = Math.round(N[j] * 127); normal[k + 1] = Math.round(N[j + 1] * 127); normal[k + 2] = Math.round(N[j + 2] * 127);
    color[k] = Math.round(Math.min(1, Math.max(0, Cc[j])) * 65535); color[k + 1] = Math.round(Math.min(1, Math.max(0, Cc[j + 1])) * 65535);
    color[k + 2] = Math.round(Math.min(1, Math.max(0, Cc[j + 2])) * 65535); color[k + 3] = 65535;
  }
  // The bounding sphere as three.js computes it (the box's middle, the farthest vertex), straight off the array.
  const cx = n ? (x0 + x1) / 2 : 0, cy = n ? (y0 + y1) / 2 : 0, cz = n ? (z0 + z1) / 2 : 0;
  let r2 = 0;
  for (let j = 0; j < n * 3; j += 3) {
    const dx = P[j] - cx, dy = P[j + 1] - cy, dz = P[j + 2] - cz;
    r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 4, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 4, true));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(r2));
  return geometry;
}

// ---------------------------------------------------------------------------------------------------------
// The wreck pool: every vehicle wreck in one BatchedMesh. Near the focus a wreck shows its full model (dusty, or
// burnt black with rust), further out a cheap hull, beyond the fog nothing. Painted panels take the instance colour.
// ---------------------------------------------------------------------------------------------------------

type PoolKind = 0 | 1 | 2;        // car, motorbike, big
const DUST: Col = [0.42, 0.37, 0.29];
/** Strips a vehicle model to position/normal/colour/paint and weathers its colours. */
function wreckGeometry(src: THREE.BufferGeometry, glass: THREE.BufferGeometry | null, burnt: boolean, seed: number) {
  const parts = glass ? [src, glass] : [src];
  const count = parts.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), paint = new Float32Array(count);
  const moss = lin('#4c5a2c'), soot = lin('#25211e'), rust = lin('#5e321d'), rust2 = lin('#7a4a2c'), ash = lin('#6b665f'), mud = lin('#4e4031'), glassDusty = lin('#2f363b'), glassBurnt = lin('#0e0d0c');
  let o = 0;
  for (const [pi, g] of parts.entries()) {
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), Cc = g.getAttribute('color'), Pa = g.getAttribute('paint'), F = g.getAttribute('finish');
    for (let i = 0; i < P.count; i++, o++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N.getY(i);
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z; nor[o * 3] = N.getX(i); nor[o * 3 + 1] = ny; nor[o * 3 + 2] = N.getZ(i);
      let c: Col = [Cc.getX(i), Cc.getY(i), Cc.getZ(i)];
      const isGlass = pi === 1 || (F && F.getX(i) < 0.1), lamp = F ? F.getZ(i) > 0.5 : false;
      let p = Pa ? Pa.getX(i) : 0;
      const noise = h01(seed, Math.round(x * 3), Math.round(y * 3), Math.round(z * 3)), fine = h01(seed + 1, Math.round(x * 9), Math.round(y * 9), Math.round(z * 9));
      if (burnt) {
        c = isGlass ? glassBurnt : noise > 0.8 ? mix(rust, rust2, fine * 0.6) : mix(soot, ash, ny > 0.6 ? fine * 0.55 : fine * 0.2);
        p = 0;
      } else if (isGlass || lamp) { c = isGlass ? scale3(glassDusty, 0.8 + fine * 0.4) : lin('#3a3833'); p = 0; }
      else {
        if (!p) { const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; c = mix(scale3(mix(c, [l, l, l], 0.5), 0.8), DUST, 0.25); }
        else c = scale3(c, 0.92);
        if (noise > 0.88) { c = mix(rust, rust2, fine); p = 0; }
        if (y < 0.45) { c = mix(c, mud, 0.4 * (1 - y / 0.45)); }
        if (ny > 0.6 && fine > 0.6) c = mix(c, DUST, 0.3);
        // Moss on the roofs of the ones left longest.
        if (ny > 0.75 && y > 1.0 && noise < 0.12) { c = mix(c, moss, 0.7); p = 0; }
      }
      col[o * 3] = c[0]; col[o * 3 + 1] = c[1]; col[o * 3 + 2] = c[2]; paint[o] = p;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
/** A cheap stand-in: a body, a cabin and four wheels in painted panels (the instance colour), for far wrecks. */
function hullGeometry(kind: PoolKind, model: number) {
  const parts = new ModelParts();
  if (kind === 0) {
    const [L, W, H] = CAR_DIMS[model];
    parts.add(new THREE.BoxGeometry(W, H * 0.42, L), { at: [0, 0.3 + H * 0.21, 0], paint: true });
    parts.add(new THREE.BoxGeometry(W * 0.84, H * 0.36, L * 0.48), { at: [0, H * 0.82, -L * 0.06], color: '#3a3f42' });
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.add(new THREE.BoxGeometry(0.22, 0.6, 0.6), { at: [x * W * 0.42, 0.3, z * L * 0.3], color: '#1c1f21' });
  } else if (kind === 1) {
    parts.add(new THREE.BoxGeometry(0.34, 0.5, 1.3), { at: [0, 0.62, 0], paint: true });
    for (const z of [-0.65, 0.65]) parts.add(new THREE.BoxGeometry(0.12, 0.56, 0.56), { at: [0, 0.28, z], color: '#1c1f21' });
  } else {
    const [L, W, H] = BIG_DIMS[model];
    parts.add(new THREE.BoxGeometry(W, H - 0.45, L), { at: [0, 0.45 + (H - 0.45) / 2, 0], paint: true });
    parts.add(new THREE.BoxGeometry(W + 0.02, 0.7, L * 0.9), { at: [0, H * 0.62, 0], color: '#2b3033' });
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.add(new THREE.BoxGeometry(0.3, 0.9, 0.9), { at: [x * W * 0.4, 0.45, z * L * 0.3], color: '#1c1f21' });
  }
  const g = parts.build();
  g.deleteAttribute('finish');
  g.computeBoundingBox();
  return g;
}

/** The material of the wreck pool: vertex colours, the instance colour on painted panels only. */
function wreckMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.08 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paint;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_BATCHING_COLOR\n\tvColor.xyz = color.xyz * mix( vec3( 1.0 ), batchingColor.xyz, paint );\n#endif');
  };
  material.customProgramCacheKey = () => 'ruin-wreck';
  return material;
}

// ---------------------------------------------------------------------------------------------------------
// The runtime.
// ---------------------------------------------------------------------------------------------------------

export type ApocalypseStats = { chunks: number; drawn: number; calls: number; triangles: number; colliders: number; buildMs: number };
/** Full-model wrecks drawn per quality band: count and range for cars, motorbikes and big vehicles. */
const POOL_CAPS = [
  { cars: 70, motos: 60, big: 6, carRange: 150, motoRange: 80, bigRange: 150 },
  { cars: 45, motos: 35, big: 4, carRange: 110, motoRange: 60, bigRange: 110 },
  { cars: 25, motos: 15, big: 3, carRange: 70, motoRange: 70, bigRange: 70 },
] as const;
const capsFor = (level: number) => POOL_CAPS[level >= 4 ? 2 : level >= 3 ? 1 : 0];

/**
 * Draws a ruin plan and owns its colliders. `now` is the simulation clock in seconds (zombie-coop's simTime: it stops
 * while a solo game is paused, and so do crush animations). Nothing is built until setEnabled(true, plan); chunks then
 * build nearest-first within the fog, one time-sliced chunk per frame (the slices are wall-clock budgets).
 */
export function createApocalypse(scene: THREE.Scene, solids: CollisionIndex, opts: { ground(x: number, z: number): number; budgetMs?: number; level?: number }) {
  const ground = opts.ground, budgetMs = opts.budgetMs ?? 4;
  const group = new THREE.Group();
  group.name = 'Ruins';
  group.visible = false;
  scene.add(group);
  const chunkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  let plan: RuinPlan | null = null, enabled = false, level = opts.level ?? 0, disposeTimer: ReturnType<typeof setTimeout> | null = null;
  let solidIds = new Int32Array(0), colliderCount = 0, lastBuildMs = 0, lastBuildAt = 0, lastNow = 0, lruTick = 0;
  const frames: number[] = [];
  /**
   * A built chunk is a range of a page (its slot: a geometry and its instance in one of the chunk pages, BatchedMeshes),
   * so all the chunks in view are a multi-draw call or two, each chunk still culled on its own. Slots are reused (best
   * fit) once their chunk is dropped.
   */
  type Page = { mesh: THREE.BatchedMesh; used: number; slots: number };
  type Slot = { page: Page; geo: number; inst: number; reserve: number; st: ChunkState | null };
  type ChunkState = { key: number; list: number[]; minX: number; minZ: number; maxX: number; maxZ: number; built: boolean; slot: Slot | null; shown: boolean; tris: number; seen: number; work: { g: Geo; phase: number; i: number; ms: number } | null };
  const pages: Page[] = [], slots: Slot[] = [];
  /** Where update() last looked from and how far the ruins showed (a chunk built out of view is dropped first). */
  let lookX = 0, lookZ = 0, viewNow = Infinity;
  const chunks = new Map<number, ChunkState>();
  const idIndex = new Map<number, number>();

  // ---- Wreck pool ----
  type Wreck = { item: number; id: number; kind: PoolKind; full: number; hull: number; x: number; y: number; z: number; yaw: number; roll: number; pitch: number; lift: number; color: THREE.Color; state: 0 | 1 | 2; anim: { from: number; code: number } | null; shown: number; tris: number[] };
  type PoolGeoms = { full: Map<string, number>; hull: Map<string, number>; tris: Map<number, number>; box: Map<number, THREE.Box3>; list: { key: string; g: THREE.BufferGeometry; hull: boolean }[] };
  let pool: THREE.BatchedMesh | null = null, wrecks: Wreck[] = [], poolGeoms: PoolGeoms | null = null;
  const wreckOf = new Map<number, number>();       // item id → wreck index
  const wreckCells = new Map<number, number[]>();
  let poolFocusX = Infinity, poolFocusZ = Infinity, poolDirty = true;
  const smashes: number[] = [];
  /** Wrecks whose crush is still animating. */
  const animating = new Set<number>();
  const material = wreckMaterial();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Vector3();
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();

  function poolKindOf(it: RuinItem): PoolKind { return it.kind === 'moto' ? 1 : it.kind === 'bus' ? 2 : 0; }
  // The wreck models, built one by one (prepare() spreads them over idle time while the lobby is up; the first zombie
  // entry used to build all of them, and the plan, inside the click: a 0.5-2 s freeze).
  type PoolEntry = { key: string; g: THREE.BufferGeometry; hull: boolean };
  let poolBuilders: (() => PoolEntry)[] | null = null;
  const poolBuilt: PoolEntry[] = [];
  function builders() {
    const out: (() => PoolEntry)[] = [];
    CAR_STYLES.forEach((s, m) => {
      for (const burnt of [false, true]) out.push(() => ({ key: `0:${m}:${burnt ? 1 : 0}`, g: wreckGeometry(carGeometry(s), carGlassGeometry(s), burnt, 17 + m), hull: false }));
      out.push(() => ({ key: `0:${m}`, g: hullGeometry(0, m), hull: true }));
    });
    MOTO_STYLES.forEach((s, m) => {
      for (const burnt of [false, true]) out.push(() => ({ key: `1:${m}:${burnt ? 1 : 0}`, g: wreckGeometry(motoGeometry(s), null, burnt, 31 + m), hull: false }));
      out.push(() => ({ key: `1:${m}`, g: hullGeometry(1, 0), hull: true }));
    });
    BIG_KINDS.forEach((k, m) => {
      for (const burnt of [false, true]) out.push(() => ({ key: `2:${m}:${burnt ? 1 : 0}`, g: wreckGeometry(fleetGeometry(k, { doorsOpen: true }), null, burnt, 43 + m), hull: false }));
      out.push(() => ({ key: `2:${m}`, g: hullGeometry(2, m), hull: true }));
    });
    return out;
  }
  /** Builds the wreck models while `more()` allows (all of them without it); true once every one is built. */
  function buildPoolGeometry(more?: () => boolean) {
    if (poolGeoms) return true;
    const list = poolBuilders ??= builders();
    while (poolBuilt.length < list.length) {
      if (more && !more()) return false;
      poolBuilt.push(list[poolBuilt.length]());
    }
    poolGeoms = { full: new Map(), hull: new Map(), tris: new Map(), box: new Map(), list: poolBuilt };
    return true;
  }
  function ensurePoolGeometry() { buildPoolGeometry(); return poolGeoms!; }

  // Shader warm-up: one-triangle stand-ins of a chunk page and of the wreck pool (a BatchedMesh, with instance colours
  // for the pool, is its own program variant), hidden; game.ts' startup prewarm draws hidden objects once, so both
  // programs are compiled and linked at load instead of on the first zombie frame.
  const warmTri = new THREE.BufferGeometry();
  warmTri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -50, 0, 0.01, -50, 0, 0, -50, 0.01]), 3));
  warmTri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  warmTri.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.5), 3));
  const warmWreck = warmTri.clone();
  warmWreck.setAttribute('paint', new THREE.BufferAttribute(new Float32Array(3), 1));
  const warmPool = new THREE.BatchedMesh(1, 3, 0, material);
  warmPool.setColorAt(warmPool.addInstance(warmPool.addGeometry(warmWreck)), new THREE.Color('#808080'));
  warmPool.perObjectFrustumCulled = false; // really drawn (ANGLE finishes a program at its first draw)
  const warmChunks = new THREE.BatchedMesh(1, 3, 0, chunkMaterial), warmCompact = new Geo(3);
  warmCompact.tri(0, -50, 0, 0.01, -50, 0, 0, -50, 0.01, [0.5, 0.5, 0.5]);
  const warmChunk = compactGeometry(warmCompact);
  warmChunks.addInstance(warmChunks.addGeometry(warmChunk));
  warmChunk.dispose();
  warmChunks.perObjectFrustumCulled = false;
  for (const o of [warmChunks, warmPool]) { o.name = 'Ruin warm-up'; o.visible = false; o.frustumCulled = false; o.receiveShadow = true; o.castShadow = true; group.add(o); }
  function buildPool() {
    disposePool();
    if (!plan) return;
    const items = plan.items;
    const vehicles = items.map((it, i) => (VEHICLES.has(it.kind) ? i : -1)).filter((i) => i >= 0);
    if (!vehicles.length) return;
    const geo = ensurePoolGeometry();
    const vertices = geo.list.reduce((s, e) => s + e.g.getAttribute('position').count, 0);
    pool = new THREE.BatchedMesh(vehicles.length, vertices, 0, material);
    pool.name = 'Ruin wrecks';
    pool.frustumCulled = false;
    pool.sortObjects = false;
    pool.castShadow = level <= 2; pool.receiveShadow = true;
    geo.full.clear(); geo.hull.clear(); geo.tris.clear(); geo.box.clear();
    for (const e of geo.list) {
      const id = pool.addGeometry(e.g);
      (e.hull ? geo.hull : geo.full).set(e.key, id);
      geo.tris.set(id, e.g.getAttribute('position').count / 3);
      geo.box.set(id, e.g.boundingBox!.clone());
    }
    wrecks = [];
    for (const i of vehicles) {
      const it = items[i], kind = poolKindOf(it), model = (it.v & 7) % (kind === 0 ? CAR_STYLES.length : kind === 1 ? MOTO_STYLES.length : BIG_KINDS.length);
      const burnt = it.kind === 'carBurnt' || (it.v & 256) !== 0;
      const full = geo.full.get(`${kind}:${model}:${burnt ? 1 : 0}`)!, hull = geo.hull.get(`${kind}:${model}`)!;
      const paints = kind === 0 ? CAR_PAINTS : kind === 1 ? MOTO_PAINTS : BUS_PAINTS, paintIndex = (it.v >> 3) & 15;
      const color = burnt ? new THREE.Color('#2b2724') : new THREE.Color(paints[paintIndex % paints.length]);
      if (!burnt) color.lerp(new THREE.Color(DUST[0], DUST[1], DUST[2]), 0.3).multiplyScalar(0.85);
      const pitch = (it.ext?.[0] ?? 0) * STEP;
      const w: Wreck = { item: i, id: it.id, kind, full, hull, x: it.x, y: it.y, z: it.z, yaw: it.yaw, roll: it.roll, pitch, lift: 0, color, state: 0, anim: null, shown: -1, tris: [geo.tris.get(full)!, geo.tris.get(hull)!] };
      // A pitched (nose-down) wreck rests on its rear wheels with its nose sunk into the crater.
      w.lift = liftOf(geo.box.get(full)!, it.roll, 1, pitch) - (pitch ? Math.sin(pitch) * dimsOf(it.kind, model)[0] * 0.42 : 0);
      const index = pool.addInstance(hull);
      pool.setColorAt(index, color);
      pool.setVisibleAt(index, false);
      wreckOf.set(it.id, wrecks.length);
      const cell = (Math.floor(it.x / 16) + 4096) * 8192 + Math.floor(it.z / 16) + 4096, l = wreckCells.get(cell);
      if (l) l.push(wrecks.length); else wreckCells.set(cell, [wrecks.length]);
      wrecks.push(w);
      placeWreck(index, w);
    }
    pool.visible = enabled;
    group.add(pool);
    poolDirty = true;
  }
  /** Lift that rests a model pitched, rolled by `roll` (and squashed by sy) on the ground (rotation Ry·Rx·Rz). */
  function liftOf(box: THREE.Box3, roll: number, sy: number, pitch = 0) {
    const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
    let min = Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y * sy, box.max.y * sy]) for (const z of [box.min.z, box.max.z]) min = Math.min(min, cp * sr * x + cp * cr * y - sp * z);
    return -min;
  }
  /** Writes a wreck's matrix: its plan pose, or (t > 0 for a smash) blended toward its crushed pose. */
  function placeWreck(index: number, w: Wreck) {
    if (!pool) return;
    let x = w.x, z = w.z, yaw = w.yaw, sy = 1, sxz = 1, lift = w.lift;
    if (w.anim && w.state === 1) {
      const code = w.anim.code, t = Math.min(1, Math.max(0, (lastNow - w.anim.from) / 0.45)), e = 1 - (1 - t) * (1 - t);
      const push = 0.8 + h01(w.id, 1) * 0.8, twist = (h01(w.id, 2) - 0.5) * 0.6, squash = 0.38 + h01(w.id, 3) * 0.12;
      x += Math.sin(code * Math.PI / 4) * push * e; z += Math.cos(code * Math.PI / 4) * push * e; yaw += twist * e;
      sy = 1 - (1 - squash) * e; sxz = 1 + 0.06 * e;
      const box = poolGeoms?.box.get(w.full);
      if (box) lift = liftOf(box, w.roll, sy, w.pitch);
    }
    tmpE.set(w.pitch, yaw, w.roll, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, ground(w.x, w.z) + w.y + lift, z), tmpQ, tmpS.set(sxz, sy, sxz));
    pool.setMatrixAt(index, tmpM);
  }
  function disposePool() {
    if (pool) { group.remove(pool); pool.dispose(); pool = null; }
    wrecks = []; wreckOf.clear(); wreckCells.clear();
  }
  /** Full models for the nearest wrecks within each category's cap and range, hulls up to the view distance. */
  function updatePool(fx: number, fz: number, view: number) {
    if (!pool) return;
    const caps = capsFor(level);
    const order = wrecks.map((w, i) => ({ i, d: (w.x - fx) * (w.x - fx) + (w.z - fz) * (w.z - fz) })).sort((a, b) => a.d - b.d);
    const used = [0, 0, 0], cap = [caps.cars, caps.motos, caps.big], range = [caps.carRange, caps.motoRange, caps.bigRange];
    for (const { i, d } of order) {
      const w = wrecks[i];
      let show = -1;
      if (w.state !== 2 && d <= view * view) {
        if (used[w.kind] < cap[w.kind] && d <= range[w.kind] * range[w.kind]) { show = w.full; used[w.kind]++; } else show = w.hull;
      }
      if (show === w.shown) continue;
      w.shown = show;
      if (show >= 0) pool.setGeometryIdAt(i, show);
      pool.setVisibleAt(i, show >= 0);
    }
  }

  // ---- Chunks ----
  /**
   * Chunk pages: BatchedMeshes of PAGE_VERTICES compact vertices each (positions, 8-bit normals, 16-bit colours: 24
   * bytes, 9.4 MB a page), a dozen chunks or so a page. A page is uploaded once, when first drawn; chunks that do not fit
   * take the slots of chunks past the build margin or a new page, so nothing is ever uploaded whole again. Pages are
   * made as the first chunks are built and freed 30 s after zombie mode ends.
   */
  const PAGE_VERTICES = 393216, PAGE_SLOTS = 32;
  /** How far round the player zombie mode's prep phase builds ahead (the fog's 169 m in zombie mode, + 20, + the 40 m build margin). */
  const PREBUILD_REACH = 230;
  /** Chunks are built this far past the view, ready before they come into it. */
  const BUILD_MARGIN = 40;
  const inView = (st: ChunkState) => rectDist(st, lookX, lookZ) <= viewNow;
  /** Puts a built chunk's triangles in a page: the free slot that fits them best, else the end of a page with room, else a new page. */
  function store(st: ChunkState, g: Geo) {
    // A slot is drawn whole, its padding past the chunk's own vertices too (degenerate, but vertex work): slots come in
    // steps of 1,024 vertices, and a loose fit is taken only when no page has room at its end.
    const n = g.v, reserve = Math.max(1024, Math.ceil(n / 1024) * 1024);
    const fit = () => { let best: Slot | null = null; for (const s of slots) if (!s.st && s.reserve >= n && (!best || s.reserve < best.reserve)) best = s; return best; };
    const roomy = () => pages.find((p) => p.used + reserve <= PAGE_VERTICES && p.slots < PAGE_SLOTS) ?? null;
    let slot = fit();
    if (slot && slot.reserve - n > 8192 && roomy()) slot = null;
    if (!slot && !roomy()) {
      // Every page full: the least recently seen chunks past the build margin give up their slots first (one within it
      // would only be built again at once, and take another's slot back).
      const idle = [...chunks.values()].filter((c) => c.slot && rectDist(c, lookX, lookZ) > viewNow + BUILD_MARGIN).sort((a, b) => a.seen - b.seen);
      for (const c of idle) { release(c); c.built = false; if ((slot = fit())) break; }
    }
    // The geometry fills its whole slot (degenerate zero vertices past the chunk's own), so the page copies it in one set.
    const geometry = compactGeometry(g, slot ? slot.reserve : reserve);
    if (slot) slot.page.mesh.setGeometryAt(slot.geo, geometry);
    else {
      let page = roomy();
      if (!page) {
        const mesh = new THREE.BatchedMesh(PAGE_SLOTS, PAGE_VERTICES, 0, chunkMaterial);
        mesh.name = 'Ruin chunks';
        mesh.frustumCulled = false;
        mesh.receiveShadow = true; mesh.castShadow = level <= 2;
        mesh.matrixAutoUpdate = false;
        mesh.visible = true;
        group.add(mesh);
        pages.push(page = { mesh, used: 0, slots: 0 });
      }
      const geo = page.mesh.addGeometry(geometry, reserve);
      slot = { page, geo, inst: page.mesh.addInstance(geo), reserve, st: null };
      slots.push(slot);
      page.used += reserve; page.slots++;
    }
    geometry.dispose();
    slot.st = st; st.slot = slot; st.shown = inView(st);
    slot.page.mesh.setVisibleAt(slot.inst, st.shown);
  }
  /** Takes a chunk out of its page (its slot is free for another). */
  function release(st: ChunkState) {
    if (st.slot) { st.slot.page.mesh.setVisibleAt(st.slot.inst, false); st.slot.st = null; st.slot = null; }
    st.shown = false;
  }
  /** Drops every built chunk (and with `free` the pages themselves and their memory). */
  function dropChunks(free: boolean) {
    for (const st of chunks.values()) { st.work = null; release(st); st.built = false; }
    if (!free) return;
    for (const p of pages) { group.remove(p.mesh); p.mesh.dispose(); }
    pages.length = 0; slots.length = 0;
  }
  function resetChunks() {
    dropChunks(false);
    chunks.clear();
    if (!plan) return;
    for (const [key, list] of plan.chunks) {
      const own = list.filter((i) => !VEHICLES.has(plan!.items[i].kind));
      if (!own.length) continue;
      const cx = keyX(key) * CHUNK, cz = keyZ(key) * CHUNK;
      chunks.set(key, { key, list: own, minX: cx - 16, minZ: cz - 16, maxX: cx + CHUNK + 16, maxZ: cz + CHUNK + 16, built: false, slot: null, shown: false, tris: 0, seen: 0, work: null });
    }
  }
  /** Continues building a chunk for up to `ms`; true once it is in a page. */
  function buildStep(st: ChunkState, ms: number) {
    if (st.built) return true;
    const start = performance.now(), low = level >= 4, budget = low ? CHUNK_TRIS.low : CHUNK_TRIS.high;
    const work = st.work ??= { g: new Geo(8192), phase: 0, i: 0, ms: 0 };
    const items = plan!.items;
    while (work.phase < 3) {
      if (work.i >= st.list.length) { work.phase++; work.i = 0; continue; }
      const it = items[st.list[work.i++]];
      if (phaseOf(it.kind) !== work.phase || (low && skipLow(it))) continue;
      if (work.phase > 0 && work.g.tris > budget - 400) { work.phase = 3; break; }
      buildItem(work.g, it, ground, low, budget);
      if (performance.now() - start > ms) { work.ms += performance.now() - start; return false; }
    }
    // Into a page (up to 90k vertices converted and copied) in a frame of its own when this one has had half its share.
    if (work.g.tris && performance.now() - start > ms / 2) { work.ms += performance.now() - start; return false; }
    if (work.g.tris) store(st, work.g);
    st.built = true; st.tris = work.g.tris;
    work.ms += performance.now() - start;
    lastBuildMs = work.ms;
    st.work = null;
    return true;
  }
  const rectDist = (st: { minX: number; minZ: number; maxX: number; maxZ: number }, x: number, z: number) => {
    const dx = Math.max(st.minX - x, 0, x - st.maxX), dz = Math.max(st.minZ - z, 0, z - st.maxZ);
    return Math.sqrt(dx * dx + dz * dz);
  };
  const viewDistance = () => ((scene.fog as THREE.Fog | null)?.far ?? 230) + 20;

  // ---- Colliders ----
  function addColliders() {
    if (!plan) return;
    solids.removeOwner(RUIN_OWNER);
    solidIds = new Int32Array(plan.colliders.length).fill(-1);
    colliderCount = 0;
    plan.colliders.forEach((c, i) => {
      const w = wreckOf.get(plan!.items[c.item].id);
      if (w !== undefined && wrecks[w].state !== 0) return;
      solidIds[i] = solids.addBox(c.cx, c.cz, c.hx, c.hz, c.yaw, -Infinity, ground(c.cx, c.cz) + c.top, RUIN_OWNER, refOf(c, plan!.items[c.item].id));
      colliderCount++;
    });
  }
  /** A ragdoll-readable ref (an axis-aligned Collider) for pieces within 10° of an axis; skewed ones carry only their id. */
  function refOf(c: RuinCollider, id: number) {
    const k = wrap(Math.round(c.yaw / STEP)), m = k % 16;
    if (m > 1 && m < 15) return { ruin: id };
    const swap = (k + 1) % 32 >= 16 ? 1 : 0, ex = swap ? c.hz : c.hx, ez = swap ? c.hx : c.hz;
    return { minX: c.cx - ex, maxX: c.cx + ex, minZ: c.cz - ez, maxZ: c.cz + ez, top: ground(c.cx, c.cz) + c.top, ruin: id };
  }
  function removeCollider(itemIndex: number) {
    const c = plan?.items[itemIndex].collider ?? -1;
    if (c < 0 || solidIds[c] < 0) return;
    solids.remove(solidIds[c]);
    solidIds[c] = -1;
    colliderCount--;
  }

  function setPlan(next: RuinPlan) {
    plan = next;
    idIndex.clear();
    next.items.forEach((it, i) => idIndex.set(it.id, i));
    resetChunks();
    buildPool();
    smashes.length = 0;
  }
  function disposeChunks() { dropChunks(true); }
  /** Applies a smash at once or animated (code 0..7 crushed toward k·45°, RUIN_THROWN gone). */
  function applySmash(id: number, code: number, now: number, instant: boolean) {
    const wi = wreckOf.get(id);
    if (wi === undefined || !plan) return false;
    const w = wrecks[wi];
    if (w.state === 2 || (w.state === 1 && code !== RUIN_THROWN) || !(code >= 0 && code <= RUIN_THROWN)) return false;
    removeCollider(w.item);
    if (code === RUIN_THROWN) { w.state = 2; w.anim = null; }
    else { w.state = 1; w.anim = { from: instant ? now - 10 : now, code }; if (!instant) animating.add(wi); }
    smashes.push(id * 16 + code);
    if (smashes.length > 4 * MAX_RUIN_CHANGES) smashes.splice(0, smashes.length - 4 * MAX_RUIN_CHANGES);
    if (pool) { const save = lastNow; lastNow = now; placeWreck(wi, w); lastNow = save; }
    w.shown = -2;
    poolDirty = true;
    return true;
  }

  const api = {
    /** Zombie mode on (with the plan to draw: colliders go in at once, chunks build from the next update) or off. */
    setEnabled(on: boolean, next?: RuinPlan) {
      if (next && next !== plan) setPlan(next);
      if (disposeTimer) { clearTimeout(disposeTimer); disposeTimer = null; }
      enabled = on && !!plan;
      group.visible = enabled;
      if (pool) pool.visible = enabled;
      if (enabled) { addColliders(); poolDirty = true; return; }
      solids.removeOwner(RUIN_OWNER);
      solidIds.fill(-1); colliderCount = 0;
      // Forget the smashes: every wreck is back in its plan pose for next time.
      smashes.length = 0;
      wrecks.forEach((w, i) => { if (w.state) { w.state = 0; w.anim = null; w.shown = -2; placeWreck(i, w); } });
      disposeTimer = setTimeout(() => { disposeTimer = null; if (!enabled) disposeChunks(); }, 30_000);
      (disposeTimer as { unref?: () => void }).unref?.();
    },
    /** Builds ≤ 1 chunk per call within budgetMs (paced by frame times), culls by the fog, swaps wreck models, animates smashes. */
    update(camera: THREE.Camera, focusX: number, focusZ: number, now: number) {
      if (!enabled || !plan) return;
      const dt = lastNow ? now - lastNow : 1 / 60;
      lastNow = now;
      frames.push(dt);
      if (frames.length > 30) frames.shift();
      const view = viewDistance();
      lookX = focusX; lookZ = focusZ; viewNow = view;
      camera.updateMatrixWorld();
      projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projView);
      let nearest: ChunkState | null = null, nd = Infinity;
      for (const st of chunks.values()) {
        const d = rectDist(st, focusX, focusZ);
        if (st.built) {
          const show = d <= view;
          if (st.slot && show !== st.shown) { st.slot.page.mesh.setVisibleAt(st.slot.inst, show); st.shown = show; }
          if (show) st.seen = now;
        } else if (d <= view + BUILD_MARGIN && d < nd) { nd = d; nearest = st; }
      }
      // Build when this frame was not slow (≤ 1.25 × the median of the last 30), or nothing was built for 250 ms.
      const sorted = [...frames].sort((a, b) => a - b), median = sorted[sorted.length >> 1] ?? 1 / 60;
      if (nearest && (nearest.work || dt <= median * 1.25 || now - lastBuildAt > 0.25)) {
        if (buildStep(nearest, budgetMs)) { lastBuildAt = now; nearest.seen = now; }
        else lastBuildAt = now;
      }
      // Least recently seen chunks beyond 400 m go first; never more than 30 kept (checked twice a second).
      const built = ++lruTick % 30 ? [] : [...chunks.values()].filter((s) => s.built);
      if (built.length > 30 || built.some((s) => rectDist(s, focusX, focusZ) > 400)) {
        built.sort((a, b) => a.seen - b.seen);
        for (let i = 0; i < built.length; i++) {
          const st = built[i];
          if (built.length - i <= 30 && rectDist(st, focusX, focusZ) <= 400) continue;
          release(st); st.built = false;
        }
      }
      if (pool) {
        for (const i of animating) {
          const w = wrecks[i];
          placeWreck(i, w);
          if (!w.anim || now - w.anim.from >= 0.5) animating.delete(i);
        }
        const moved = (focusX - poolFocusX) * (focusX - poolFocusX) + (focusZ - poolFocusZ) * (focusZ - poolFocusZ) > 24 * 24;
        if (moved || poolDirty) { poolFocusX = focusX; poolFocusZ = focusZ; poolDirty = false; updatePool(focusX, focusZ, view); }
      }
    },
    /**
     * Idle-time preparation (game.ts): the wreck models a few at a time while `more()` allows, then (with `pool`) the
     * plan's pool and chunk list (hidden); true once setEnabled(true, next) has nothing left to build at once.
     */
    prepare(next: RuinPlan, more: () => boolean, pool = true) {
      if (plan === next) return true;
      if (!buildPoolGeometry(more) || !more() || !pool) return false;
      if (!enabled) setPlan(next);
      return true;
    },
    /** Every wreck model is built (prepare's last step, the pool, may still be due). */
    get modelsReady() { return poolGeoms !== null; },
    /** Builds every chunk within radius of (x, z) (zombie mode's prep phase; no further than the ruins show), yielding between slices. */
    async prebuild(x: number, z: number, radius: number) {
      if (!plan) return;
      const reach = Math.min(radius, PREBUILD_REACH);
      if (!Number.isFinite(viewNow)) { lookX = x; lookZ = z; viewNow = reach; }
      const list = [...chunks.values()].filter((s) => !s.built && rectDist(s, x, z) <= reach).sort((a, b) => rectDist(a, x, z) - rectDist(b, x, z));
      for (const st of list) {
        while (plan && !st.built && !buildStep(st, 8)) await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      }
      lastBuildAt = lastNow;
    },
    get plan() { return plan; },
    /** The clock of the last update (seconds): what smash() expects as `now` from code without its own. */
    get time() { return lastNow; },
    /** Fires to keep burning while zombie mode is on (barrels, burning wrecks and ruins). */
    get fires(): readonly { x: number; z: number; y?: number }[] { return enabled && plan ? plan.fires : []; },
    get group() { return group; },
    /** A mutant crushes a wreck (code 0..7, pushed toward code·45°) or throws it (RUIN_THROWN): animated, collider out. */
    smash(id: number, code: number, now: number) { return applySmash(id, code, now, false); },
    /** Applies a director's ruin list (zdir.ruins, packed id·16 + code) at once: what a late joiner missed. */
    syncSmashed(list: readonly number[]) {
      for (const p of list) { const id = Math.floor(p / 16), code = p - id * 16; if (!smashes.includes(p)) applySmash(id, code, lastNow, true); }
    },
    /** Smashable wrecks within r of (x, z) that are still there (crushed ones can still be thrown). */
    smashables(x: number, z: number, r: number, cb: (id: number, x: number, z: number) => void) {
      for (let ix = Math.floor((x - r) / 16); ix <= Math.floor((x + r) / 16); ix++) for (let iz = Math.floor((z - r) / 16); iz <= Math.floor((z + r) / 16); iz++) {
        for (const i of wreckCells.get((ix + 4096) * 8192 + iz + 4096) ?? []) {
          const w = wrecks[i];
          if (w.state === 2 || !plan!.items[w.item].smash) continue;
          if ((w.x - x) * (w.x - x) + (w.z - z) * (w.z - z) <= r * r) cb(w.id, w.x, w.z);
        }
      }
    },
    /** Smashes so far, packed id·16 + code, oldest first (zdir.ruins keeps the last MAX_RUIN_CHANGES). */
    smashed(): number[] { return smashes.slice(); },
    /** The plan item with this id (a smashable's kind and pose), or null. */
    item(id: number) { const i = idIndex.get(id); return i === undefined || !plan ? null : plan.items[i]; },
    stats(): ApocalypseStats {
      let chunksBuilt = 0, drawn = 0, triangles = 0;
      const drawnPages = new Set<Page>();
      for (const st of chunks.values()) {
        if (!st.built) continue;
        chunksBuilt++;
        if (!enabled || !st.shown || !st.slot) continue;
        if (!frustum.intersectsSphere(st.slot.page.mesh.getBoundingSphereAt(st.slot.geo, sphere) ?? sphere)) continue;
        drawn++; triangles += st.tris; drawnPages.add(st.slot.page);
      }
      let poolOn = false;
      if (pool && enabled) for (let i = 0; i < wrecks.length; i++) {
        const w = wrecks[i];
        if (w.shown < 0) continue;
        pool.getMatrixAt(i, tmpM);
        tmpC.setFromMatrixPosition(tmpM);
        if (!frustum.intersectsSphere(sphere.set(tmpC, w.kind === 2 ? 7 : 3))) continue;
        poolOn = true; triangles += w.shown === w.full ? w.tris[0] : w.tris[1];
      }
      // The chunks in view are a multi-draw call per page they are in; the wrecks one more.
      return { chunks: chunksBuilt, drawn, calls: drawnPages.size + (poolOn ? 1 : 0), triangles, colliders: colliderCount, buildMs: Math.round(lastBuildMs * 10) / 10 };
    },
    /** Quality level 0-5: from 4 the chunks drop vines, tufts, litter and window patches (rebuilt) and fewer full wrecks show. */
    setDetail(next: number) {
      const band = next >= 4, was = level >= 4;
      level = next;
      for (const p of pages) p.mesh.castShadow = level <= 2;
      if (pool) pool.castShadow = level <= 2;
      if (band !== was) dropChunks(false);
      poolDirty = true;
    },
    dispose() {
      if (disposeTimer) clearTimeout(disposeTimer);
      if (enabled) solids.removeOwner(RUIN_OWNER);
      disposeChunks(); disposePool();
      scene.remove(group);
      chunkMaterial.dispose(); material.dispose();
      for (const e of poolBuilt) e.g.dispose();
      poolBuilt.length = 0; poolGeoms = null; poolBuilders = null;
      warmPool.dispose(); warmChunks.dispose(); warmTri.dispose(); warmWreck.dispose();
      plan = null; enabled = false;
    },
  };
  return api;
}
export type Apocalypse = ReturnType<typeof createApocalypse>;
