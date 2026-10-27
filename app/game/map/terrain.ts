/**
 * The ground underfoot: water bodies (open water inside the buoys, the wet channel out to the walls, the bed) with
 * typed banks and docks; raised surfaces (lawns, plazas); road strips (asphalt with a raised sidewalk beside it);
 * decks (bridges and ramps) that only carry whoever comes at them from level or above; dry land and the world
 * bounds. Pure data and maths, no three.js, so the game, the tests and the map generators share it.
 *
 * TERRAIN is today's map rebuilt exactly from map/consts.ts (legacyTerrain). worldTerrain() is today's map plus the
 * wired P1 slices (WIRING-PLAN §2 Terrain): their waters (canals and the rest of the river, banks typed kè, promenade,
 * wharf or mud by the slice that owns the land behind them, "far" where nobody has built yet), the district docks
 * (Bến Nhà Rồng, Bến Bình Thạnh, the Thủ Thiêm piers), the cargo ship's hull, the water-only bridge decks with their
 * ramps, the district roads' raised sidewalks, and the land: the union of today's LAND, the slices' bounds and their
 * roads, less the water. The wiring (world-map.ts) builds it once the map is generated and hands it over with
 * installTerrain(); the exported functions below (groundHeight, walkable, …) always answer for the live terrain, so
 * code that captured them before the install sees the wired map too. world.ts re-exports groundHeight, onSidewalk
 * and dockAt. Game coordinates: x east, z south (the river is north, at low z).
 */
import { CITY_PARK, DOCKS, LAND, PARK, PLAZA, RIVER, RIVER_BED, ROADS_X, ROADS_Z, SQUARE, WATER_LEVEL, type Dock as DockSpec, type Point, type Rect } from './consts.ts';
import { worldBoundsFor } from '../../../lib/world-bounds.ts';
import { WATERS } from './districts.ts';
import type { DeckOut, WaterOut } from './build-district.ts';
import { cargoShipLayout, gangwayY, type ShipSpec } from './ship.ts';

/** Sidewalks stand this much above the carriageway, behind a stone curb. */
export const CURB_HEIGHT = 0.14;
/** Today's roads (class R1): asphalt half-width, and the paved sidewalk out to the house fronts. */
export const ASPHALT_HALF = 7, SIDEWALK_EDGE = 12.5;
/** Pier decks stand a little above the promenade; the steps beside them run down into the water. */
export const PIER_DECK = 0.28;
export const STEPS_TOP = -136, STEPS_DROP = 1.8 / 4.5;
/** Ground this far below the water surface is deep: someone on foot there swims. */
export const SWIM_DEPTH = 0.55;
/** A body up to this far below a deck's surface steps (or is lifted) onto it; anyone lower passes underneath. */
export const DECK_STEP = 0.75;
/** Street level (asphalt, open ground, the tops of the river walls). */
export const BASE = 0.1;

/**
 * An area: an axis-aligned rectangle (its edges count as inside, like city.ts inRect, unless `open`) or a polygon of
 * x,z pairs within its bounding box. A polygon's `soft` edges (1 per edge from vertex i to i + 1) are where the area
 * runs on into another one (a canal's mouth on the river): a margin is not kept from them.
 */
export type Shape = {
  minX: number; maxX: number; minZ: number; maxZ: number; open: boolean; poly: readonly number[] | null;
  soft?: Uint8Array | null;
  /** A polygon cut to a rectangle (a waterway inside the buoy lines): its edges are hard, and keep the margin. */
  clip?: Rect | null;
  /** The polygon's edge index (polyIndex), cached on first use (undefined: not looked up yet). */
  idx?: PolyIndex | null;
};
export const rectShape = (r: Rect, open = false): Shape => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, open, poly: null });
export function polyShape(poly: readonly number[], soft: Uint8Array | null = null, clip: Rect | null = null): Shape {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]);
    minZ = Math.min(minZ, poly[i + 1]); maxZ = Math.max(maxZ, poly[i + 1]);
  }
  if (clip) { minX = Math.max(minX, clip.minX); maxX = Math.min(maxX, clip.maxX); minZ = Math.max(minZ, clip.minZ); maxZ = Math.min(maxZ, clip.maxZ); }
  return { minX, maxX, minZ, maxZ, open: false, poly, soft, clip };
}
const inRect = (r: Rect, x: number, z: number, m = 0) => x >= r.minX + m && x <= r.maxX - m && z >= r.minZ + m && z <= r.maxZ - m;
/** Whether a point is in a shape, at least `margin` inside its (hard) edges. An infinite bound is not tested (so NaN passes it). */
export function inShape(s: Shape, x: number, z: number, margin = 0) {
  if (!s.poly) return inBox(s, x, z, margin);
  if (!inBox(s, x, z, 0)) return false;
  if (s.clip && !inRect(s.clip, x, z, margin)) return false;
  return inPolygon(s, x, z, margin);
}
// Kept small so it inlines into the hot paths (groundHeight runs thousands of times a frame).
function inBox(s: Shape, x: number, z: number, m: number) {
  return s.open ? (x > s.minX + m || s.minX === -Infinity) && (x < s.maxX - m || s.maxX === Infinity) && (z > s.minZ + m || s.minZ === -Infinity) && (z < s.maxZ - m || s.maxZ === Infinity)
    : (x >= s.minX + m || s.minX === -Infinity) && (x <= s.maxX - m || s.maxX === Infinity) && (z >= s.minZ + m || s.minZ === -Infinity) && (z <= s.maxZ - m || s.maxZ === Infinity);
}

/**
 * Polygons with many edges (the river, a slice's bounds) get an index: the edges overlapping each 8 m band of z (for
 * the crossing test) and each 8 m cell (for the margin test). Built on first use, kept beside the shape.
 */
type PolyIndex = { z0: number; bands: Int32Array[]; cells: Map<number, Int32Array> };
const POLY_INDEX = new WeakMap<readonly number[], PolyIndex | null>();
const BAND = 8;
const cellKey = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096);
function polyIndex(p: readonly number[]): PolyIndex | null {
  let idx = POLY_INDEX.get(p);
  if (idx !== undefined) return idx;
  idx = null;
  const n = p.length / 2;
  if (n > 12) {
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 1; i < p.length; i += 2) { z0 = Math.min(z0, p[i]); z1 = Math.max(z1, p[i]); }
    const bands: number[][] = Array.from({ length: Math.floor((z1 - z0) / BAND) + 1 }, () => []);
    const cells = new Map<number, number[]>();
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = p[j * 2], az = p[j * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
      for (let b = Math.floor((Math.min(az, bz) - z0) / BAND); b <= Math.floor((Math.max(az, bz) - z0) / BAND); b++) bands[b].push(j);
      for (let ix = Math.floor(Math.min(ax, bx) / BAND); ix <= Math.floor(Math.max(ax, bx) / BAND); ix++) {
        for (let iz = Math.floor(Math.min(az, bz) / BAND); iz <= Math.floor(Math.max(az, bz) / BAND); iz++) {
          const k = cellKey(ix, iz), list = cells.get(k);
          if (list) list.push(j); else cells.set(k, [j]);
        }
      }
    }
    idx = { z0, bands: bands.map((b) => Int32Array.from(b)), cells: new Map([...cells].map(([k, v]) => [k, Int32Array.from(v)])) };
  }
  POLY_INDEX.set(p, idx);
  return idx;
}
/**
 * Crossing-number test; with a margin the point must also stay that far from every hard edge (edge j runs from vertex j
 * to j + 1). Plain loops, no closures: it runs hundreds of times a frame under groundHeight and walkable.
 */
function inPolygon(s: Shape, x: number, z: number, margin: number) {
  const p = s.poly!, n = p.length / 2;
  let idx = s.idx;
  if (idx === undefined) idx = s.idx = polyIndex(p);
  let inside = false;
  if (idx) {
    const b = Math.floor((z - idx.z0) / BAND);
    if (b >= 0 && b < idx.bands.length) {
      const band = idx.bands[b];
      for (let q = 0; q < band.length; q++) {
        const j = band[q], i = j + 1 === n ? 0 : j + 1;
        const xj = p[j * 2], zj = p[j * 2 + 1], xi = p[i * 2], zi = p[i * 2 + 1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
    }
  } else {
    for (let j = 0; j < n; j++) {
      const i = j + 1 === n ? 0 : j + 1;
      const xj = p[j * 2], zj = p[j * 2 + 1], xi = p[i * 2], zi = p[i * 2 + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
  }
  if (!inside || margin <= 0) return inside;
  if (idx && margin <= BAND) {
    const x0 = Math.floor((x - margin) / BAND), x1 = Math.floor((x + margin) / BAND), z0 = Math.floor((z - margin) / BAND), z1 = Math.floor((z + margin) / BAND);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const list = idx.cells.get(cellKey(ix, iz));
      if (list) for (let q = 0; q < list.length; q++) if (edgeNear(s, p, n, list[q], x, z, margin)) return false;
    }
    return true;
  }
  for (let j = 0; j < n; j++) if (edgeNear(s, p, n, j, x, z, margin)) return false;
  return true;
}
/** Whether hard edge j of a shape's polygon passes nearer than `margin` to (x, z) (a soft edge never does). */
function edgeNear(s: Shape, p: readonly number[], n: number, j: number, x: number, z: number, margin: number) {
  if (s.soft && s.soft[j]) return false;
  const i = j + 1 === n ? 0 : j + 1;
  return segmentDistance(x, z, p[j * 2], p[j * 2 + 1], p[i * 2], p[i * 2 + 1]) < margin;
}
function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
/**
 * Inside `r` grown by `reach` (edges excluded), except on its landward side (opposite the normal n out over the
 * water), which stays open: a pier or a berth reaches all the way back to the bank.
 */
function nearRect(r: Rect, nx: number, nz: number, x: number, z: number, reach: number) {
  return (nx > 0 || x > r.minX - reach) && (nx < 0 || x < r.maxX + reach) && (nz > 0 || z > r.minZ - reach) && (nz < 0 || z < r.maxZ + reach);
}

/**
 * promenade: the quay wall a swimmer climbs and a walker vaults (a railing along it); far: a bank nobody can land on
 * (the fenced far bank, unbuilt land); steps: a dock's steps, walked out of. District banks (layout/types.ts BankKind):
 * ke, the canal's concrete wall with a railing and a narrow walk; wharf, an open quay apron (no railing: a walker can
 * step off it into the water); mud, a muddy bank under stilt houses (none in P1).
 */
export type BankKind = 'promenade' | 'far' | 'steps' | 'ke' | 'wharf' | 'mud';
/**
 * Per kind: climbable; a swimmer within `reach` of the waterline climbs out `land` metres behind it; a walker up to
 * `vault` metres behind it vaults in, landing `drop` metres out; walkers keep `inset` metres back from the waterline
 * (the railing); `open`: no railing, a walker steps off the edge into the water.
 */
export const BANK_KINDS: Record<BankKind, { climbable: boolean; reach: number; land: number; vault: number; drop: number; inset: number; open: boolean }> = {
  promenade: { climbable: true, reach: 1.6, land: 3.1, vault: 4.4, drop: 1, inset: 2.6, open: false },
  far: { climbable: false, reach: 0, land: 0, vault: 0, drop: 0, inset: 0, open: false },
  steps: { climbable: false, reach: 0, land: 0, vault: 0, drop: 0, inset: 0, open: false },
  ke: { climbable: true, reach: 1.6, land: 1.7, vault: 2.8, drop: 1, inset: 1.15, open: false },
  wharf: { climbable: true, reach: 1.6, land: 2.2, vault: 2.4, drop: 1.2, inset: 0.55, open: true },
  mud: { climbable: false, reach: 0, land: 0, vault: 0, drop: 0, inset: 0.5, open: false },
};
export type Bank = {
  /** `dock`: the dock whose steps this is, or -1. */
  id: number; kind: BankKind; water: number; dock: number; climbable: boolean;
  /** The waterline along the wall's face from a to b, and the unit normal (perpendicular to it) from the land out over the water. */
  ax: number; az: number; bx: number; bz: number; nx: number; nz: number;
  /**
   * A swimmer within `reach` metres of the waterline can climb out, landing `land` metres behind it; a walker up to
   * `vault` metres behind it, facing the water, can vault in, landing `drop` metres out.
   */
  reach: number; land: number; vault: number; drop: number;
  /** Walkers keep this far back from the waterline (0: the land shape already does); `open`: they may step off it into the water. */
  inset?: number; open?: boolean;
};
/** The bank nearest a point: `d` is the signed distance to its waterline (+ out over the water), `x, z` the closest waterline point. */
export type BankHit = { bank: Bank; d: number; x: number; z: number };

/** What a dock is for: the river bus (and the đò ngang at a ferry pier), hiring speedboats, or a private landing. */
export type DockRole = 'waterbus' | 'rental' | 'private';
/** A dock (pier and steps, from map/consts.ts or a slice's EXTRA) on a bank, `at` metres along it (x on an east-west bank). */
export type Dock = DockSpec & {
  id: number; water: number; bank: number; at: number;
  /** Stable name ('an-hoa', 'ben-nha-rong', …), the bank it stands on ('S' south, 'N' north), its use, and whether the đò ngang lands here. */
  key: string; side: 'S' | 'N'; role: DockRole; ferry: boolean;
  /** Unit normal out over the water. */
  nx: number; nz: number;
  /** Height of the pier deck; the steps fall `drop` per metre out from (stepsX, stepsZ), where they stand `stepsY` high. */
  deckY: number; stepsY: number; stepsX: number; stepsZ: number; drop: number;
  /** The water boats keep clear of: the pier and the steps together. */
  berth: Rect;
  /** Where someone stepping off a boat or climbing from the water stands: on the pier, on the steps. */
  landings: Rect[];
};

export type WaterBody = {
  id: number; name: string;
  /** Stable key (districts.ts WATERS id: 'song-sai-gon', 'ben-nghe', …). */
  key?: string;
  /** Water surface and bed heights. */
  level: number; bed: number;
  /** Open water a swimmer or boat may use (inside the buoys). Several shapes: their union. */
  open: Shape; more?: Shape[];
  /** Where there is water, out to the walls' faces (the river runs on past the buoys): the ground is the bed. */
  wet: Shape;
  /** `wet` plus the tops of the walls round it, `top` high: ground here is the water body's (its docks, walls or bed). */
  shore: Shape; shores?: Shape[]; top: number;
  banks: Bank[]; docks: Dock[];
};
/** A raised area with a flat top: a lawn, a plaza, a tiled square. */
export type Surface = { shape: Shape; y: number };
/**
 * A straight road along x (`alongX`) or z at `at`: asphalt within `half` of the centre line, raised sidewalk out to
 * `edge`. It runs over lo < along < hi (an infinite bound is not tested).
 */
export type Strip = { alongX: boolean; at: number; lo: number; hi: number; half: number; edge: number };
/**
 * A district road: its centre polyline, asphalt within `half`, a raised sidewalk from there out to half + sidewalk
 * (a hẻm has none). Straight runs end square at their nodes; bends inside the polyline (and two-armed nodes) are round.
 */
export type RoadStrip = { pts: readonly number[]; half: number; sidewalk: number };
/**
 * A bridge deck or ramp over `shape`, its surface `y(x, z)` high. A `fill` deck is a water-only bridge: where it is
 * not over water its ramps stand on solid fill (the abutment), so anyone there is on it; over the water there is
 * room underneath.
 */
export type Deck = { id: number; shape: Shape; y: (x: number, z: number) => number; fill?: boolean; name?: string };
/** Something moored that nobody passes through: the cargo ship's hull. */
export type Hull = { id: string; name: string; rect: Rect; yaw: number };
/** A way up out of the water that is not a bank (a ship's tyre fenders, its pilot ladder): from (x, z) onto (toX, toZ). */
export type Climb = { x: number; z: number; toX: number; toZ: number; name: string };

export type TerrainSpec = {
  /** Street level (asphalt and open ground) and the sidewalk's height above it. */
  base: number; curb: number;
  /** Dry land (its union); water inside it is cut out by the waters' `wet` shapes. */
  land: Shape[]; waters: WaterBody[]; surfaces: Surface[]; strips: Strip[]; decks?: Deck[];
  /** District roads (their raised sidewalks, and land wherever they run). */
  roads?: RoadStrip[];
  /** Hulls moored in the water (swimmers and boats go round them). */
  hulls?: Hull[];
  /** Climbing points out of the water (a moored ship's fenders and ladder). */
  climbs?: Climb[];
  /** Everything a player can reach (the network sanity box: walking is clamped to the land). */
  bounds: Rect;
  /** The P1 slices this terrain wires (empty: today's map). */
  slices?: string[];
};
export type Terrain = ReturnType<typeof createTerrain>;

/** Uniform grid of item ids by 16 m cell (district roads, banks). */
function grid<T>(items: readonly T[], box: (t: T) => Rect, cell = 16) {
  const cells = new Map<number, number[]>();
  items.forEach((t, id) => {
    const b = box(t);
    for (let ix = Math.floor(b.minX / cell); ix <= Math.floor(b.maxX / cell); ix++) {
      for (let iz = Math.floor(b.minZ / cell); iz <= Math.floor(b.maxZ / cell); iz++) {
        const k = cellKey(ix, iz), list = cells.get(k);
        if (list) list.push(id); else cells.set(k, [id]);
      }
    }
  });
  const packed = new Map([...cells].map(([k, v]) => [k, Int32Array.from(v)]));
  const EMPTY = new Int32Array(0);
  return { cell, at: (x: number, z: number) => packed.get(cellKey(Math.floor(x / cell), Math.floor(z / cell))) ?? EMPTY };
}
/** A road piece: a straight run (square ends) or a round joint, with asphalt half-width and sidewalk edge. */
type RoadPiece = { ax: number; az: number; ux: number; uz: number; len: number; half: number; edge: number; disc: boolean };

export function createTerrain(spec: TerrainSpec) {
  const { base, curb, land, waters, surfaces, strips, bounds } = spec;
  const decks: Deck[] = [...(spec.decks ?? [])];
  const hulls: Hull[] = [...(spec.hulls ?? [])];
  const climbs: Climb[] = [...(spec.climbs ?? [])];
  const slices: readonly string[] = [...(spec.slices ?? [])];
  const docks = waters.flatMap((w) => w.docks);
  const banks = waters.flatMap((w) => w.banks);
  // Every pier and steps lies in this box: a quick reject for dockAt.
  const dockBox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const d of docks) for (const r of [d.pier, d.steps]) {
    dockBox.minX = Math.min(dockBox.minX, r.minX); dockBox.maxX = Math.max(dockBox.maxX, r.maxX);
    dockBox.minZ = Math.min(dockBox.minZ, r.minZ); dockBox.maxZ = Math.max(dockBox.maxZ, r.maxZ);
  }
  // Strips sharing a direction, span and cross-section are tested together on the nearest centre line.
  const groups: (Omit<Strip, 'at'> & { at: number[] })[] = [];
  for (const s of strips) {
    const g = groups.find((q) => q.alongX === s.alongX && q.lo === s.lo && q.hi === s.hi && q.half === s.half && q.edge === s.edge);
    if (g) g.at.push(s.at); else groups.push({ alongX: s.alongX, lo: s.lo, hi: s.hi, half: s.half, edge: s.edge, at: [s.at] });
  }
  // District roads: straight runs and round joints in a 16 m grid.
  const pieces: RoadPiece[] = [];
  const roads = spec.roads ?? [];
  {
    const ends = new Map<string, { x: number; z: number; half: number; edge: number; n: number }>();
    const end = (x: number, z: number, half: number, edge: number) => {
      const k = `${Math.round(x * 20)}:${Math.round(z * 20)}`, e = ends.get(k);
      if (e) { e.n++; e.half = Math.min(e.half, half); e.edge = Math.min(e.edge, edge); } else ends.set(k, { x, z, half, edge, n: 1 });
    };
    for (const r of roads) {
      const p = r.pts, edge = r.half + Math.max(0, r.sidewalk);
      for (let k = 0; k + 3 < p.length; k += 2) {
        const dx = p[k + 2] - p[k], dz = p[k + 3] - p[k + 1], len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        pieces.push({ ax: p[k], az: p[k + 1], ux: dx / len, uz: dz / len, len, half: r.half, edge, disc: false });
        if (k > 0) pieces.push({ ax: p[k], az: p[k + 1], ux: 0, uz: 0, len: 0, half: r.half, edge, disc: true });
      }
      if (p.length >= 4) { end(p[0], p[1], r.half, edge); end(p[p.length - 2], p[p.length - 1], r.half, edge); }
    }
    // A node where exactly two roads meet (a bend, a seam where a street runs straight on) is round like a bend.
    for (const e of ends.values()) if (e.n === 2) pieces.push({ ax: e.x, az: e.z, ux: 0, uz: 0, len: 0, half: e.half, edge: e.edge, disc: true });
  }
  const roadGrid = grid(pieces, (q) => ({
    minX: Math.min(q.ax, q.ax + q.ux * q.len) - q.edge, maxX: Math.max(q.ax, q.ax + q.ux * q.len) + q.edge,
    minZ: Math.min(q.az, q.az + q.uz * q.len) - q.edge, maxZ: Math.max(q.az, q.az + q.uz * q.len) + q.edge,
  }));
  /** District road surface at a point: 0 none, 1 asphalt, 2 sidewalk (asphalt wins where roads overlap). */
  function roadAt(x: number, z: number) {
    if (!pieces.length) return 0;
    let side = 0;
    for (const id of roadGrid.at(x, z)) {
      const q = pieces[id];
      const dx = x - q.ax, dz = z - q.az;
      let d: number;
      if (q.disc) d = Math.sqrt(dx * dx + dz * dz);
      else {
        const t = dx * q.ux + dz * q.uz;
        if (!(t >= 0 && t <= q.len)) continue;
        d = Math.abs(dz * q.ux - dx * q.uz);
      }
      if (d < q.half) return 1;
      if (d < q.edge) side = 2;
    }
    return side;
  }
  // Banks with an inset, in a grid (walkers keep back from the waterline).
  const insetBanks = banks.filter((b) => (b.inset ?? 0) > 0);
  const bankGrid = grid(insetBanks, (b) => {
    const r = b.inset ?? 0;
    return { minX: Math.min(b.ax, b.bx) - r, maxX: Math.max(b.ax, b.bx) + r, minZ: Math.min(b.az, b.bz) - r, maxZ: Math.max(b.az, b.bz) + r };
  });
  const allBankGrid = grid(banks, (b) => ({ minX: Math.min(b.ax, b.bx) - 6, maxX: Math.max(b.ax, b.bx) + 6, minZ: Math.min(b.az, b.bz) - 6, maxZ: Math.max(b.az, b.bz) + 6 }));

  /** Legacy road strips at a point: 0 none, 1 asphalt, 2 sidewalk (crossings over the carriageway stay at road level). */
  function stripAt(x: number, z: number) {
    let side = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const along = g.alongX ? x : z;
      if ((g.lo !== -Infinity && !(along > g.lo)) || (g.hi !== Infinity && !(along < g.hi))) continue;
      const v = g.alongX ? z : x;
      let d = Infinity;
      for (const at of g.at) d = Math.min(d, Math.abs(v - at));
      if (d < g.half) return 1;
      if (d < g.edge) side = 2;
    }
    return side;
  }
  /** Whether a point is on a raised sidewalk (crossings over the carriageway stay at road level). */
  function onSidewalk(x: number, z: number) {
    const s = stripAt(x, z);
    if (s === 1) return false;
    if (!pieces.length) return s === 2;
    const r = roadAt(x, z);
    return r === 1 ? false : s === 2 || r === 2;
  }
  /** Ground of a water body at a point on its shore: a pier, the steps, the wall top or the bed. */
  function shoreHeight(w: WaterBody, x: number, z: number) {
    for (let i = 0; i < w.docks.length; i++) {
      const d = w.docks[i];
      if (inRect(d.pier, x, z)) return d.deckY;
      if (inRect(d.steps, x, z)) return d.stepsY - Math.max(0, (x - d.stepsX) * d.nx + (z - d.stepsZ) * d.nz) * d.drop;
    }
    return inShape(w.wet, x, z) ? w.bed : w.top;
  }
  function onShore(w: WaterBody, x: number, z: number) {
    const s = w.shore;
    if (inBox(s, x, z, 0) && (!s.poly || inShape(s, x, z))) return true;
    if (w.shores) for (const t of w.shores) if (inShape(t, x, z)) return true;
    return false;
  }
  /** The ground ignoring decks. */
  function ground(x: number, z: number) {
    for (let i = 0; i < waters.length; i++) if (onShore(waters[i], x, z)) return shoreHeight(waters[i], x, z);
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i].shape;
      if (inBox(s, x, z, 0) && (!s.poly || inShape(s, x, z))) return surfaces[i].y;
    }
    return onSidewalk(x, z) ? base + curb : base;
  }
  /** Whether a point is in the water's channel (wet: the bed is the ground), whatever the decks over it. */
  function wetAt(x: number, z: number) {
    for (const w of waters) if (inShape(w.wet, x, z)) return true;
    return false;
  }
  /**
   * Walkable surface height: sidewalks, lawns and plazas above the street, piers and steps on the shore, the bed
   * under water. A deck carries a body whose height `yHint` is no more than DECK_STEP below its surface (or any
   * body when yHint is omitted); a body further below (a swimmer, a boat, a ragdoll under a bridge) gets the ground.
   * A fill deck's ramps on dry land carry everyone on them.
   */
  function groundHeight(x: number, z: number, yHint?: number) {
    if (!decks.length) return ground(x, z);
    let top = -Infinity, wet = -1;
    for (const d of decks) {
      if (!inShape(d.shape, x, z)) continue;
      const y = d.y(x, z);
      if (y <= top) continue;
      if (yHint === undefined || yHint >= y - DECK_STEP) { top = y; continue; }
      if (d.fill) { if (wet < 0) wet = wetAt(x, z) ? 1 : 0; if (!wet) top = y; }
    }
    const below = ground(x, z);
    return top > below ? top : below;
  }
  /** The deck under a point (its id, name and surface there), the highest one when several are stacked. */
  function deckAt(x: number, z: number) {
    let best: { deck: Deck; y: number } | null = null;
    for (const d of decks) if (inShape(d.shape, x, z)) { const y = d.y(x, z); if (!best || y > best.y) best = { deck: d, y }; }
    return best;
  }
  /** The dock (pier or steps) under a point, if any. */
  function dockAt(x: number, z: number) {
    if (!(x >= dockBox.minX && x <= dockBox.maxX && z >= dockBox.minZ && z <= dockBox.maxZ)) return null;
    for (const d of docks) if (inRect(d.pier, x, z) || inRect(d.steps, x, z)) return d;
    return null;
  }
  /** The water body whose shore a point is on (decks do not matter: water runs under them). */
  function waterAt(x: number, z: number) {
    for (const w of waters) if (onShore(w, x, z)) return w;
    return null;
  }
  /** Height of the water surface at a point, -Infinity where there is none. */
  function waterLevel(x: number, z: number) {
    const w = waterAt(x, z);
    return w ? w.level : -Infinity;
  }
  /** Whether the ground is deep under water here: someone on foot swims. */
  function deep(x: number, z: number, yHint?: number) {
    return groundHeight(x, z, yHint) < waterLevel(x, z) - SWIM_DEPTH;
  }
  function inOpen(w: WaterBody, x: number, z: number, margin: number) {
    if (inShape(w.open, x, z, margin)) return true;
    if (w.more) for (const s of w.more) if (inShape(s, x, z, margin)) return true;
    return false;
  }
  /** Whether a point is open water (inside the buoys), at least `margin` from its edges. */
  function inWater(x: number, z: number, margin = 0) {
    for (const w of waters) if (inOpen(w, x, z, margin)) return true;
    return false;
  }
  /** A dock whose pier is within `reach` of a point (the pier reaches back to the bank), if any. */
  function pierNear(x: number, z: number, reach: number) {
    for (const d of docks) if (nearRect(d.pier, d.nx, d.nz, x, z, reach)) return d;
    return null;
  }
  /** The climbing point (a ship's fender or ladder) within `reach` of a swimmer, if any. */
  function climbNear(x: number, z: number, reach: number) {
    let best: Climb | null = null, bd = reach;
    for (const c of climbs) { const d = Math.hypot(c.x - x, c.z - z); if (d <= bd) { best = c; bd = d; } }
    return best;
  }
  /** The moored hull within `margin` of a point, if any (the cargo ship: swimmers and boats go round it). */
  function hullAt(x: number, z: number, margin = 0) {
    for (const h of hulls) if (x > h.rect.minX - margin && x < h.rect.maxX + margin && z > h.rect.minZ - margin && z < h.rect.maxZ + margin) return h;
    return null;
  }
  /** Open water a hull of radius `margin` fits in, clear of the piers, steps and moored hulls. */
  function navigable(x: number, z: number, margin: number) {
    for (const w of waters) {
      if (!inOpen(w, x, z, margin)) continue;
      for (const d of w.docks) if (nearRect(d.berth, d.nx, d.nz, x, z, margin)) return false;
      return !hulls.length || !hullAt(x, z, margin);
    }
    return false;
  }
  /** Distance from a point to a bank's waterline, signed (+ out over the water); the closest point in HIT. */
  const HIT = { x: 0, z: 0 };
  function bankDistance(b: Bank, x: number, z: number) {
    // East-west and north-south waterlines are measured exactly (no projection rounding).
    let px: number, pz: number, side: number, abreast: boolean;
    if (b.nx === 0) { px = Math.max(Math.min(b.ax, b.bx), Math.min(Math.max(b.ax, b.bx), x)); pz = b.az; side = (z - pz) * b.nz; abreast = px === x; }
    else if (b.nz === 0) { px = b.ax; pz = Math.max(Math.min(b.az, b.bz), Math.min(Math.max(b.az, b.bz), z)); side = (x - px) * b.nx; abreast = pz === z; }
    else {
      const dx = b.bx - b.ax, dz = b.bz - b.az;
      const u = ((x - b.ax) * dx + (z - b.az) * dz) / (dx * dx + dz * dz), t = Math.max(0, Math.min(1, u));
      px = b.ax + t * dx; pz = b.az + t * dz; side = (x - px) * b.nx + (z - pz) * b.nz; abreast = t === u;
    }
    HIT.x = px; HIT.z = pz;
    // Off the end of the waterline the distance is to its end point; the sign still says which side.
    return abreast ? side : Math.sign(side || 1) * Math.hypot(x - px, z - pz);
  }
  /** The nearest bank within `reach` of a point (only climbable ones if asked), or null. */
  function bankNear(x: number, z: number, reach = Infinity, climbable = false): BankHit | null {
    // (plain loops, no closure: openEdge calls it for every step a walker takes)
    let bank: Bank | null = null, bd = 0, bx = 0, bz = 0;
    if (reach <= 6) {
      const ids = allBankGrid.at(x, z);
      for (let q = 0; q < ids.length; q++) {
        const b = banks[ids[q]];
        if (climbable && !b.climbable) continue;
        const d = bankDistance(b, x, z);
        if (Math.abs(d) <= reach && (!bank || Math.abs(d) < Math.abs(bd))) { bank = b; bd = d; bx = HIT.x; bz = HIT.z; }
      }
    } else {
      for (let q = 0; q < banks.length; q++) {
        const b = banks[q];
        if (climbable && !b.climbable) continue;
        const d = bankDistance(b, x, z);
        if (Math.abs(d) <= reach && (!bank || Math.abs(d) < Math.abs(bd))) { bank = b; bd = d; bx = HIT.x; bz = HIT.z; }
      }
    }
    return bank ? { bank, d: bd, x: bx, z: bz } : null;
  }
  /** Within a bank's inset behind its waterline (the railing): walkers keep out. */
  function behindRail(x: number, z: number) {
    if (!insetBanks.length) return false;
    for (const id of bankGrid.at(x, z)) {
      const b = insetBanks[id], d = bankDistance(b, x, z);
      // (a hair inside the inset, so a walker exactly at it, LAND.minZ on today's promenade, is clear of it)
      if (d <= 0 && -d < (b.inset ?? 0) - 1e-9) return true;
    }
    return false;
  }
  function onDeck(x: number, z: number, margin = 0) {
    for (const d of decks) if (inShape(d.shape, x, z, margin)) return true;
    return false;
  }
  /** Dry land at a point: a deck, or on the land (or a district road) and neither in the water nor behind a railing. */
  function landAt(x: number, z: number) {
    if (decks.length && onDeck(x, z)) return true;
    let on = false;
    for (const s of land) if (inShape(s, x, z)) { on = true; break; }
    if (!on && !(pieces.length && roadAt(x, z))) return false;
    if (waters.length > 1 || pieces.length) {
      if (wetAt(x, z)) return false;
      if (behindRail(x, z)) return false;
    }
    return true;
  }
  const D = Math.SQRT1_2;
  /** Whether a point is dry land, at least `r` inside it (the centre and eight points round it; exact on rectangles). */
  function walkable(x: number, z: number, r = 0) {
    // Today's map is one rectangle of land: exactly city.ts inRect(LAND, x, z, r).
    if (land.length === 1 && !land[0].poly && waters.length <= 1 && !pieces.length && !decks.length) return inShape(land[0], x, z, r);
    if (r <= 0) return landAt(x, z);
    if (decks.length && onDeck(x, z, r)) return true;
    return landAt(x, z) && landAt(x + r, z) && landAt(x - r, z) && landAt(x, z + r) && landAt(x, z - r)
      && landAt(x + r * D, z + r * D) && landAt(x - r * D, z + r * D) && landAt(x + r * D, z - r * D) && landAt(x - r * D, z - r * D);
  }
  /** A bank with no railing (a wharf) within reach of a walker here: they may step off into the water. */
  function openEdge(x: number, z: number, reach = 1.2) {
    const hit = bankNear(x, z, (BANK_KINDS.wharf.inset + reach), false);
    return !!hit && !!hit.bank.open && hit.d <= 0;
  }
  /** Land (its railings and wall tops too), a road, a deck, a dock or water. */
  function somewhere(x: number, z: number) {
    for (const s of land) if (inShape(s, x, z)) return true;
    if (pieces.length && roadAt(x, z)) return true;
    if (decks.length && onDeck(x, z)) return true;
    return !!waterAt(x, z) || !!dockAt(x, z);
  }
  /**
   * Somewhere a body may come down (the glide's fence): within 2 m of land, a road, a deck, a dock or water. Not the
   * unbuilt land beyond the project hoardings.
   */
  function inPlay(x: number, z: number) {
    return somewhere(x, z) || somewhere(x + 2, z) || somewhere(x - 2, z) || somewhere(x, z + 2) || somewhere(x, z - 2);
  }
  /** Whether a point is inside the world bounds, at least `margin` from their edges. */
  function inBounds(x: number, z: number, margin = 0) {
    return x >= bounds.minX + margin && x <= bounds.maxX - margin && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;
  }
  let nextDeck = decks.reduce((n, d) => Math.max(n, d.id + 1), 0);
  return {
    base, curb, bounds, waters, docks, banks, surfaces, strips, land, decks: decks as readonly Deck[], hulls: hulls as readonly Hull[], climbs: climbs as readonly Climb[], slices, roads: roads as readonly RoadStrip[],
    groundHeight, onSidewalk, dockAt, waterAt, waterLevel, deep, inWater, pierNear, climbNear, navigable, bankNear, walkable, inBounds,
    wetAt, deckAt, onDeck, hullAt, landAt, openEdge, inPlay, roadAt,
    /** Adds a deck (a bridge or ramp built at run time); returns its id. */
    addDeck(shape: Shape, y: (x: number, z: number) => number) { decks.push({ id: nextDeck, shape, y }); return nextDeck++; },
    removeDeck(id: number) { const i = decks.findIndex((d) => d.id === id); if (i >= 0) decks.splice(i, 1); return i >= 0; },
  };
}

/**
 * Today's map. The river: open water inside the buoys (RIVER), wet everywhere north of the promenade wall's face
 * (z < -137.6; it runs on past the buoys, and the far bank is not built yet), the wall's top 1.2 m wide at street
 * level. Its banks are the promenade wall, the fenced far wall and each dock's steps; its docks are map/consts.ts
 * DOCKS. The raised park, plaza, city park and square; the road grid (north-south roads start at the riverside
 * road); the land inside the fences; the world bounds (lib/world-bounds.ts).
 */
export function legacyTerrain(): TerrainSpec {
  const all = { minX: -Infinity, maxX: Infinity, minZ: -Infinity };
  const banks: Bank[] = [];
  const bank = (kind: BankKind, dock: number, ax: number, az: number, bx: number, bz: number, nx: number, nz: number, reach = 0, landAt = 0, vault = 0, drop = 0) =>
    banks[banks.push({ id: banks.length, kind, water: 0, dock, climbable: BANK_KINDS[kind].climbable, ax, az, bx, bz, nx, nz, reach, land: landAt, vault, drop }) - 1];
  // The promenade wall's face is the river's edge; a swimmer climbs out onto the promenade (LAND.minZ + 0.5).
  const quay = bank('promenade', -1, RIVER.minX, RIVER.maxZ, RIVER.maxX, RIVER.maxZ, 0, -1, 1.6, 3.1, 4.4, 1);
  bank('far', -1, RIVER.minX, RIVER.minZ, RIVER.maxX, RIVER.minZ, 0, 1);
  const docks: Dock[] = DOCKS.map((d, id): Dock => {
    bank('steps', id, d.steps.minX, d.steps.minZ, d.steps.maxX, d.steps.minZ, 0, -1);
    // Standing spots stop 0.5 m inside the edges, and on the river side of the wall's top (z -136.4).
    const landing = (r: Rect) => ({ minX: r.minX + 0.5, maxX: r.maxX - 0.5, minZ: r.minZ + 0.5, maxZ: Math.min(r.maxZ - 0.5, -136.6) });
    return {
      ...d, id, water: 0, bank: quay.id, at: d.x, nx: quay.nx, nz: quay.nz,
      key: LEGACY_DOCK_KEYS[d.x] ?? `dock-${d.x}`, side: 'S', role: d.rental ? 'rental' : 'waterbus', ferry: d.x === -80,
      deckY: PIER_DECK, stepsY: 0.1, stepsX: d.x, stepsZ: STEPS_TOP, drop: STEPS_DROP,
      berth: { minX: d.pier.minX, maxX: d.steps.maxX, minZ: Math.min(d.pier.minZ, d.steps.minZ), maxZ: Math.max(d.pier.maxZ, d.steps.maxZ) },
      landings: [landing(d.pier), landing(d.steps)],
    };
  });
  const river: WaterBody = {
    id: 0, name: 'SÔNG SÀI GÒN', key: 'song-sai-gon', level: WATER_LEVEL, bed: RIVER_BED,
    open: rectShape(RIVER), wet: rectShape({ ...all, maxZ: RIVER.maxZ }, true), shore: rectShape({ ...all, maxZ: -136.4 }, true), top: 0.1,
    banks, docks,
  };
  const strips: Strip[] = [
    ...ROADS_Z.map((at) => ({ alongX: true, at, lo: -Infinity, hi: Infinity, half: ASPHALT_HALF, edge: SIDEWALK_EDGE })),
    ...ROADS_X.map((at) => ({ alongX: false, at, lo: ROADS_Z[0], hi: Infinity, half: ASPHALT_HALF, edge: SIDEWALK_EDGE })),
  ];
  return {
    base: 0.1, curb: CURB_HEIGHT,
    land: [rectShape(LAND)], waters: [river],
    surfaces: [{ shape: rectShape(PARK, true), y: 0.24 }, { shape: rectShape(PLAZA, true), y: 0.26 }, { shape: rectShape(CITY_PARK, true), y: 0.25 }, { shape: rectShape(SQUARE, true), y: 0.27 }],
    strips, bounds: WORLD_BOUNDS_TODAY,
  };
}
/** Today's PLAY rectangle (lib/world-bounds.ts with no slice wired). */
const WORLD_BOUNDS_TODAY: Rect = worldBoundsFor(0);
const LEGACY_DOCK_KEYS: Record<number, string> = { [-80]: 'an-hoa', 2: 'an-hoa-ca-no', 190: 'bach-dang', 300: 'du-thuyen' };

// ---------------------------------------------------------------------------------------------------------------
// The wired map
// ---------------------------------------------------------------------------------------------------------------

type DockExtra = { id: string; name: string; bank: 'S' | 'N'; x: number; pier?: Rect; steps?: Rect; ring?: Point };
/** What a slice's EXTRA adds to the terrain (world-map.ts SLICE_EXTRA[key]; fields the terrain does not read are ignored). */
export type SliceTerrainExtra = {
  /** Waterbus piers (QUAN_4_EXTRA.docks with their rectangles; BINH_THANH_EXTRA.docks by x only: the standard pier). */
  docks?: readonly DockExtra[];
  /** Thủ Thiêm's waterbus stops (THU_THIEM_EXTRA.waterbus): the đò ngang lands at the one on its ferry street. */
  waterbus?: readonly DockExtra[];
  ferry?: { north?: { x: number } };
  /** The story villa's private pier (THU_THIEM_EXTRA.villaPier). */
  villaPier?: { x: number; z0: number; z1: number };
  /** The cargo ship moored in the basin (QUAN_4_EXTRA.ship: stamps.ts cargo-ship), with its gangway and moorings. */
  ship?: ShipSpec;
  /** Bình Thạnh's P1 edge (BINH_THANH_EXTRA.p2.edge): the project hoarding along x, z0..z1; the land runs on to it. */
  p2?: { edge?: { x: number; z0: number; z1: number } };
};
/** One wired slice as the terrain reads it: its key, the land it builds (layout bounds), its waters and decks, its EXTRA. */
export type TerrainSlice = { key: string; bounds: readonly number[]; waters: readonly WaterOut[]; decks: readonly DeckOut[]; extra?: SliceTerrainExtra | null };
export type WorldTerrainInput = {
  /** The wired slices in wiring order (world-map.ts SLICES). */
  slices: readonly TerrainSlice[];
  /** Every road edge the slices built (world-map.ts WORLD_ROADS edges whose EDGE_INFO slice is not 'legacy'). */
  roads: readonly RoadStrip[];
  /** The wired count lib/world-bounds.ts reads the bounds by (default: slices.length). */
  wired?: number;
  /** Roundabout islands (world-map.ts RINGS): a raised disc inside each ring, at sidewalk height. */
  islands?: readonly { x: number; z: number; r: number }[];
};

/** A pier and steps on a bank at x, as consts.ts builds today's (south bank) or mirrored on the north bank (thu-thiem.ts northPier). */
export function standardPier(x: number, side: 'S' | 'N') {
  return side === 'S'
    ? { pier: { minX: x - 2, maxX: x + 2, minZ: -152, maxZ: -134.6 }, steps: { minX: x + 2.6, maxX: x + 5, minZ: -140.5, maxZ: -134.6 }, ring: { x, z: -149.5 } }
    : { pier: { minX: x - 2, maxX: x + 2, minZ: -206.6, maxZ: -195.6 }, steps: { minX: x + 2.6, maxX: x + 5, minZ: -206.6, maxZ: -200.7 }, ring: { x, z: -198.1 } };
}

/** Intersections and touching points of segment a→b with segment c→d, as fractions along a→b. */
function splitsOn(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number, out: number[]) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, rr = rx * rx + rz * rz;
  if (rr < 1e-12) return;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) > 1e-9) {
    const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) out.push(t);
    return;
  }
  // Parallel: the other segment's ends that lie on this one (collinear overlaps).
  for (const [px, pz] of [[cx, cz], [dx, dz]]) {
    const t = ((px - ax) * rx + (pz - az) * rz) / rr;
    if (t > 1e-9 && t < 1 - 1e-9 && Math.abs((px - ax) * rz - (pz - az) * rx) / Math.sqrt(rr) < 1e-6) out.push(t);
  }
}
const ringOf = (r: Rect) => [r.minX, r.minZ, r.maxX, r.minZ, r.maxX, r.maxZ, r.minX, r.maxZ];
function inPoly(p: readonly number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Today's map plus the wired P1 slices (WIRING-PLAN §2 Terrain):
 * - Waters: each waterway once (the canonical polygon of districts.ts WATERS), open inside the world bounds. Its
 *   outline is cut wherever the land behind it changes hands; each piece is a bank of the kind the slice owning that
 *   land gave it (kè, promenade, wharf; mud has stilt houses), "far" (not climbable) where nothing is built yet, and no
 *   bank at all where it runs on into other water (a canal's mouth). Today's promenade quay keeps its own bank.
 * - Docks: today's four, then the slices' (Bến Nhà Rồng, Bến Bình Thạnh, Bến Đò Thủ Thiêm, Bến Thủ Thiêm, the villa's
 *   private pier); the cargo ship's hull.
 * - Decks: the water-only bridges, ramped down at either end onto solid fill, their sidewalks a curb above the road.
 * - Land: today's LAND, the slices' bounds and every district road (the wet channel and the railings cut out of it);
 *   today's road strips stop at today's land, and the district roads' sidewalks are raised as today's are.
 * - Bounds: lib/world-bounds.ts for the wired count.
 */
export function worldTerrain(input: WorldTerrainInput): TerrainSpec {
  const legacy = legacyTerrain();
  const slices = input.slices;
  if (!slices.length) return legacy;
  const bounds = worldBoundsFor(input.wired ?? slices.length);
  const keys = slices.map((s) => s.key);
  const eps = 1e-9;
  // Today's roads stop at today's land: the slices' roads carry on from the old fences.
  const strips = legacy.strips.map((s) => (s.alongX ? { ...s, lo: LAND.minX - eps, hi: LAND.maxX + eps } : { ...s, hi: LAND.maxZ + eps }));
  const roads = input.roads.map((r) => ({ pts: r.pts.slice(), half: r.half, sidewalk: r.sidewalk }));

  // ---- Waters: one body per waterway id (the river first: it is today's body 0) ----
  const order: { key: string; name: string; poly: number[]; level: number; owners: Map<string, WaterOut> }[] = [];
  for (const s of slices) for (const w of s.waters) {
    let o = order.find((q) => q.key === w.id);
    if (!o) {
      const canon = WATERS.find((q) => q.id === w.id);
      o = { key: w.id, name: w.name, poly: (canon?.poly ?? w.poly).slice(), level: w.level ?? WATER_LEVEL, owners: new Map() };
      order.push(o);
    }
    o.owners.set(s.key, w);
  }
  if (!order.some((o) => o.key === 'song-sai-gon')) {
    const canon = WATERS.find((q) => q.id === 'song-sai-gon')!;
    order.push({ key: 'song-sai-gon', name: 'SÔNG SÀI GÒN', poly: canon.poly.slice(), level: WATER_LEVEL, owners: new Map() });
  }
  order.sort((a, b) => (a.key === 'song-sai-gon' ? -1 : b.key === 'song-sai-gon' ? 1 : 0));
  const landPolys = slices.map((s) => ({ key: s.key, poly: s.bounds.slice() }));
  const LAND_RING = ringOf(LAND);
  const ownerOf = (x: number, z: number) => landPolys.find((l) => inPoly(l.poly, x, z))?.key ?? null;
  const otherWater = (self: number, x: number, z: number) => order.some((o, k) => k !== self && inPoly(o.poly, x, z));

  const banks: Bank[] = [];
  const waters: WaterBody[] = [];
  /** The strips between a bank and its slice's bounds when they stop short of it (land, walked to the railing). */
  const bankLand: Shape[] = [];
  const legacyRiver = legacy.waters[0];
  order.forEach((o, wi) => {
    const p = o.poly, n = p.length / 2, isRiver = o.key === 'song-sai-gon';
    const own: Bank[] = [];
    // The waterline of every edge, cut where the land behind it changes owner (slice bounds, today's land, other water).
    const cuts: number[][] = [];
    // (the slices' own outlines of this water too: their vertices are where a bank changes kind)
    const others: (readonly number[])[] = [...landPolys.map((l) => l.poly), LAND_RING, ...order.filter((_, k) => k !== wi).map((q) => q.poly), ...[...o.owners.values()].map((w) => w.poly)];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const ts: number[] = [];
      for (const q of others) for (let k = 0; k < q.length; k += 2) {
        const l = (k + 2) % q.length;
        splitsOn(ax, az, bx, bz, q[k], q[k + 1], q[l], q[l + 1], ts);
      }
      if (isRiver && az === RIVER.maxZ && bz === RIVER.maxZ) for (const x of [RIVER.minX, RIVER.maxX]) { const t = (x - ax) / (bx - ax); if (t > eps && t < 1 - eps) ts.push(t); }
      cuts.push([0, ...ts.sort((u, v) => u - v).filter((t, k, a) => k === 0 || t - a[k - 1] > 1e-7), 1]);
    }
    // The outline again with every cut as a vertex (the same shape), each piece soft where it borders other water.
    const refined: number[] = [], softs: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1], l = Math.hypot(bx - ax, bz - az);
      if (l < 1e-6) continue; // a repeated vertex (an arc starting where the last edge ended)
      // The normal out over the water (into the polygon).
      let nx = -(bz - az) / l, nz = (bx - ax) / l;
      if (!inPoly(p, (ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2)) { nx = -nx; nz = -nz; }
      nx = Math.round(nx * 1e9) / 1e9 || 0; nz = Math.round(nz * 1e9) / 1e9 || 0;
      const ts = cuts[i];
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1], mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        const px = k === 0 ? ax : ax + (bx - ax) * t0, pz = k === 0 ? az : az + (bz - az) * t0;
        const qx = k + 2 === ts.length ? bx : ax + (bx - ax) * t1, qz = k + 2 === ts.length ? bz : az + (bz - az) * t1;
        refined.push(px, pz);
        // What lies 4 m behind the waterline: other water (no bank), today's promenade, a slice's land, or nothing built.
        const lx = mx - nx * 4, lz = mz - nz * 4;
        if (otherWater(wi, lx, lz)) { softs.push(1); continue; }
        softs.push(0);
        if (isRiver && az === RIVER.maxZ && bz === RIVER.maxZ && mx > RIVER.minX && mx < RIVER.maxX) continue; // today's quay: its own bank below
        // The slice whose land is behind it. A slice's bounds may stop short of its bank (Bình Thạnh's follow Trường Sa's
        // curb, the canal walk and kè beyond it): the walk between them is that slice's land too.
        let owner: string | null = null;
        for (const depth of [2, 4, 8, 14, 20]) {
          owner = ownerOf(mx - nx * depth, mz - nz * depth);
          if (!owner) continue;
          if (depth > 2) bankLand.push(polyShape([px, pz, qx, qz, qx - nx * (depth + 1), qz - nz * (depth + 1), px - nx * (depth + 1), pz - nz * (depth + 1)]));
          break;
        }
        let kind: BankKind = 'far';
        if (owner) {
          const w = o.owners.get(owner);
          const seg = w?.banks.find((b) => segmentDistance(mx, mz, b.ax, b.az, b.bx, b.bz) < 0.05);
          kind = (seg?.kind ?? (w?.banks[0]?.kind ?? 'ke')) as BankKind;
        }
        const K = BANK_KINDS[kind];
        own.push({ id: 0, kind, water: wi, dock: -1, climbable: K.climbable, ax: px, az: pz, bx: qx, bz: qz, nx, nz, reach: K.reach, land: K.land, vault: K.vault, drop: K.drop, inset: K.inset, open: K.open });
      }
    }
    const soft = Uint8Array.from(softs);
    const wet = polyShape(refined, soft);
    const clip: Rect = { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ };
    const open = polyShape(refined, soft, clip);
    const body: WaterBody = {
      id: wi, name: o.name, key: o.key, level: o.level, bed: RIVER_BED, open, wet, shore: wet, top: BASE, banks: own, docks: [],
    };
    if (isRiver) {
      // Today's river exactly where it was: open inside the old buoys too, the promenade wall's top on the shore.
      body.more = [legacyRiver.open];
      // (open on its inland side as today's shore is: z < -136.4; it overlaps the channel so the wall's face is shore too)
      body.shores = [rectShape({ minX: p.reduce((m, v, k) => (k % 2 ? m : Math.min(m, v)), Infinity), maxX: 620, minZ: RIVER.maxZ - 2, maxZ: -136.4 }, true)];
      body.name = 'SÔNG SÀI GÒN';
    }
    waters.push(body);
  });
  // The river's banks: today's quay first (its legacy id 0), then the rest; the steps of every dock after them.
  const river = waters[0];
  const riverQuay: Bank = { ...legacyRiver.banks[0], inset: BANK_KINDS.promenade.inset, open: false };
  river.banks = [riverQuay, ...river.banks];
  const stepsBanks: Bank[] = [];

  // ---- Docks ----
  const docks: Dock[] = [];
  const dockBank = new Map<Dock, Bank>();
  const addDock = (spec: DockSpec, key: string, side: 'S' | 'N', role: DockRole, ferry: boolean, steps: boolean) => {
    const nx = 0, nz = side === 'S' ? -1 : 1, waterline = side === 'S' ? RIVER.maxZ : RIVER.minZ, id = docks.length;
    const landing = (r: Rect) => (side === 'S'
      ? { minX: r.minX + 0.5, maxX: r.maxX - 0.5, minZ: r.minZ + 0.5, maxZ: Math.min(r.maxZ - 0.5, waterline + 1) }
      : { minX: r.minX + 0.5, maxX: r.maxX - 0.5, minZ: Math.max(r.minZ + 0.5, waterline - 1), maxZ: r.maxZ - 0.5 });
    // The steps' outer end, facing out over the water (as today's steps banks).
    if (steps) stepsBanks.push({ id: 0, kind: 'steps', water: 0, dock: id, climbable: false, ax: spec.steps.minX, az: side === 'S' ? spec.steps.minZ : spec.steps.maxZ, bx: spec.steps.maxX, bz: side === 'S' ? spec.steps.minZ : spec.steps.maxZ, nx, nz, reach: 0, land: 0, vault: 0, drop: 0 });
    const berth = steps
      ? { minX: Math.min(spec.pier.minX, spec.steps.minX), maxX: Math.max(spec.pier.maxX, spec.steps.maxX), minZ: Math.min(spec.pier.minZ, spec.steps.minZ), maxZ: Math.max(spec.pier.maxZ, spec.steps.maxZ) }
      : { ...spec.pier };
    const dock: Dock = {
      ...spec, id, water: 0, bank: 0, at: spec.x, key, side, role, ferry, nx, nz,
      deckY: PIER_DECK, stepsY: BASE, stepsX: spec.x, stepsZ: waterline - (STEPS_TOP - RIVER.maxZ) * nz, drop: STEPS_DROP,
      berth, landings: steps ? [landing(spec.pier), landing(spec.steps)] : [landing(spec.pier)],
    };
    if (!steps) dock.steps = { minX: spec.x, maxX: spec.x, minZ: spec.pier.minZ, maxZ: spec.pier.minZ };
    dockBank.set(dock, bankFor(river, spec.x, waterline) ?? riverQuay);
    docks.push(dock);
    return dock;
  };
  for (const d of legacyRiver.docks) {
    const spec: DockSpec = { x: d.x, name: d.name, rental: d.rental, pier: d.pier, steps: d.steps, ring: d.ring };
    addDock(spec, d.key, d.side, d.role, d.ferry, true);
  }
  const ttFerryX = slices.find((s) => s.key === 'thu-thiem')?.extra?.ferry?.north?.x ?? -80;
  for (const s of slices) {
    const x = s.extra ?? {};
    for (const d of [...(x.docks ?? []), ...(x.waterbus ?? [])]) {
      const std = standardPier(d.x, d.bank);
      const spec: DockSpec = { x: d.x, name: d.name, rental: false, pier: d.pier ?? std.pier, steps: d.steps ?? std.steps, ring: d.ring ?? std.ring };
      addDock(spec, d.id, d.bank, 'waterbus', s.key === 'thu-thiem' && d.bank === 'N' && d.x === ttFerryX, true);
    }
    if (x.villaPier) {
      const v = x.villaPier;
      // A 2.4 m timber jetty from the garden wall's river gate out to its end (no steps: a swimmer climbs on alongside).
      addDock({ x: v.x, name: 'BẾN RIÊNG BIỆT THỰ', rental: false, pier: { minX: v.x - 1.2, maxX: v.x + 1.2, minZ: Math.min(v.z0, v.z1) - 2, maxZ: Math.max(v.z0, v.z1) }, steps: { minX: v.x, maxX: v.x, minZ: 0, maxZ: 0 }, ring: { x: v.x, z: Math.max(v.z0, v.z1) - 1.5 } }, 'biet-thu', v.z1 > v.z0 ? 'N' : 'S', 'private', false, false);
    }
  }
  river.docks = docks;
  river.banks.push(...stepsBanks);
  // Bank ids are their index in the terrain's flat list (waters in order); docks point at the bank they stand on.
  for (const w of waters) for (const b of w.banks) { b.id = banks.length; b.water = w.id; banks.push(b); }
  for (const d of docks) d.bank = dockBank.get(d)!.id;
  // Hulls: the cargo ship.
  const hulls: Hull[] = [];
  for (const s of slices) {
    const sh = s.extra?.ship;
    if (!sh) continue;
    const c = Math.abs(Math.cos(sh.yaw)), sn = Math.abs(Math.sin(sh.yaw)), hx = (sh.w * c + sh.d * sn) / 2, hz = (sh.w * sn + sh.d * c) / 2;
    hulls.push({ id: 'cargo-ship', name: sh.name, rect: { minX: sh.x - hx, maxX: sh.x + hx, minZ: sh.z - hz, maxZ: sh.z + hz }, yaw: sh.yaw });
  }

  // ---- Decks: water-only bridges with their ramps; the cargo ship's deck and gangway ----
  const decks: Deck[] = [];
  for (const s of slices) for (const d of s.decks) decks.push(deckOf(decks.length, d, roads));
  const climbs: Climb[] = [];
  for (const s of slices) {
    const sh = s.extra?.ship;
    if (!sh) continue;
    const lay = cargoShipLayout(sh), top = lay.top;
    decks.push({ id: decks.length, shape: polyShape(lay.deck), y: () => top, name: sh.name });
    const gw = lay.gangway;
    if (gw) decks.push({ id: decks.length, shape: polyShape(gw.poly), y: (x, z) => gangwayY(gw, x, z), name: 'CẦU THANG TÀU' });
    climbs.push(...lay.climbs);
  }

  // ---- Land: today's LAND, the slices' bounds (the river and canals cut out by the waters) ----
  const land: Shape[] = [rectShape(LAND), ...landPolys.map((l) => polyShape(l.poly)), ...bankLand];
  // A slice whose P1 edge hoarding stands beyond its bounds (Bình Thạnh's on Nơ Trang Long's far side): the land runs
  // on to the hoarding (the ground drawn there is walked; only the hoarding closes the edge).
  for (const s of slices) {
    const e = s.extra?.p2?.edge;
    if (!e) continue;
    let minX = Infinity;
    for (let k = 0; k < s.bounds.length; k += 2) minX = Math.min(minX, s.bounds[k]);
    if (e.x < minX) land.push(rectShape({ minX: e.x + 0.12, maxX: minX + 0.5, minZ: e.z0, maxZ: e.z1 }));
  }
  // Roundabout islands: flat at sidewalk height all the way across (the ring's inner sidewalk paves only their edge).
  const surfaces = [...legacy.surfaces, ...(input.islands ?? []).map((i) => ({ shape: polyShape(Array.from({ length: 32 }, (_, k) => [i.x + i.r * Math.cos((k / 32) * Math.PI * 2), i.z + i.r * Math.sin((k / 32) * Math.PI * 2)]).flat()), y: BASE + CURB_HEIGHT }))];
  return { ...legacy, land, waters, strips, decks, roads, hulls, climbs, surfaces, bounds, slices: keys };
}
/** The bank of a water body whose waterline passes nearest (x, z). */
function bankFor(w: WaterBody, x: number, z: number) {
  let best: Bank | null = null, bd = Infinity;
  for (const b of w.banks) {
    if (b.kind === 'steps') continue;
    const d = segmentDistance(x, z, b.ax, b.az, b.bx, b.bz);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
/**
 * A water-only bridge (build-district.ts DeckOut): `yHint` over the water between the banks, ramped linearly down to
 * street level at either foot (`s0` and `len - s1` long), its sidewalks a curb above the carriageway (the asphalt
 * half-width from the road it carries). Outside the water it stands on fill.
 */
function deckOf(id: number, d: DeckOut, roads: readonly RoadStrip[]): Deck {
  const ax = d.pts[0], az = d.pts[1], bx = d.pts[d.pts.length - 2], bz = d.pts[d.pts.length - 1];
  const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  // The asphalt half-width: the road whose centre line runs through the deck's middle along it.
  let asphalt = d.half;
  for (const r of roads) {
    for (let k = 0; k + 3 < r.pts.length; k += 2) {
      const qx = r.pts[k + 2] - r.pts[k], qz = r.pts[k + 3] - r.pts[k + 1], ql = Math.hypot(qx, qz) || 1;
      if (Math.abs((qx * uz - qz * ux) / ql) > 0.02) continue;
      if (segmentDistance(mx, mz, r.pts[k], r.pts[k + 1], r.pts[k + 2], r.pts[k + 3]) < 0.3) { asphalt = Math.min(d.half, r.half); break; }
    }
  }
  const rise = d.yHint, s0 = Math.max(0, d.s0), s1 = Math.min(d.len, d.s1), len = d.len;
  const y = (x: number, z: number) => {
    const s = (x - ax) * ux + (z - az) * uz, off = Math.abs(-(x - ax) * uz + (z - az) * ux);
    const k = s < s0 ? (s0 > 0 ? Math.max(0, s) / s0 : 1) : s > s1 ? (len > s1 ? Math.max(0, len - s) / (len - s1) : 1) : 1;
    return BASE + rise * k + (off > asphalt && asphalt < d.half ? CURB_HEIGHT : 0);
  };
  return { id, shape: polyShape(d.poly), y, fill: true, name: d.name };
}

// ---------------------------------------------------------------------------------------------------------------
// The live terrain
// ---------------------------------------------------------------------------------------------------------------

/** Today's map (tests and tools read it; the game reads the live terrain through the functions below). */
export const LEGACY_TERRAIN = createTerrain(legacyTerrain());
/**
 * The live terrain: today's map until the wiring installs the wired map (installTerrain). An ES live binding, so
 * `TERRAIN.docks` read at use time is the wired map's.
 */
export let TERRAIN: Terrain = LEGACY_TERRAIN;
let live: Terrain = LEGACY_TERRAIN;
/** The live world bounds: one object, updated in place on install (ragdolls and boats read it). */
export const bounds: Rect = { ...LEGACY_TERRAIN.bounds };
const installed = new Set<(t: Terrain) => void>();
/**
 * Makes `t` the live terrain (world-map.ts, once the wired slices are generated, before the game is created). The
 * exported functions answer for it from then on, however they were imported.
 */
export function installTerrain(t: Terrain) {
  live = t;
  TERRAIN = t;
  Object.assign(bounds, t.bounds);
  for (const cb of installed) cb(t);
}
/** Called with the new terrain whenever one is installed; returns a function that stops it. */
export function onTerrain(cb: (t: Terrain) => void) { installed.add(cb); return () => { installed.delete(cb); }; }
/** The live terrain object. */
export const liveTerrain = () => live;

export function groundHeight(x: number, z: number, yHint?: number) { return live.groundHeight(x, z, yHint); }
export function onSidewalk(x: number, z: number) { return live.onSidewalk(x, z); }
export function dockAt(x: number, z: number) { return live.dockAt(x, z); }
export function waterAt(x: number, z: number) { return live.waterAt(x, z); }
export function waterLevel(x: number, z: number) { return live.waterLevel(x, z); }
export function deep(x: number, z: number, yHint?: number) { return live.deep(x, z, yHint); }
export function inWater(x: number, z: number, margin = 0) { return live.inWater(x, z, margin); }
export function pierNear(x: number, z: number, reach: number) { return live.pierNear(x, z, reach); }
export function navigable(x: number, z: number, margin: number) { return live.navigable(x, z, margin); }
export function bankNear(x: number, z: number, reach = Infinity, climbable = false) { return live.bankNear(x, z, reach, climbable); }
export function walkable(x: number, z: number, r = 0) { return live.walkable(x, z, r); }
export function inBounds(x: number, z: number, margin = 0) { return live.inBounds(x, z, margin); }
export function wetAt(x: number, z: number) { return live.wetAt(x, z); }
export function deckAt(x: number, z: number) { return live.deckAt(x, z); }
export function hullAt(x: number, z: number, margin = 0) { return live.hullAt(x, z, margin); }
export function climbNear(x: number, z: number, reach: number) { return live.climbNear(x, z, reach); }
export function openEdge(x: number, z: number, reach?: number) { return live.openEdge(x, z, reach); }
export function inPlay(x: number, z: number) { return live.inPlay(x, z); }
/** The P1 slices the live terrain wires (empty: today's map). */
export function wiredSlices() { return live.slices; }
/** Builds and installs the wired map's terrain (world-map.ts: once, after generation, before the game is created). */
export function installWorldTerrain(input: WorldTerrainInput) {
  const t = createTerrain(worldTerrain(input));
  installTerrain(t);
  return t;
}
