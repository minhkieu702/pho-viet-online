/**
 * The ground underfoot: water bodies (open water inside the buoys, the wet channel out to the walls, the bed) with
 * typed banks and docks; raised surfaces (lawns, plazas); road strips (asphalt with a raised sidewalk beside it);
 * decks (bridges and ramps) that only carry whoever comes at them from level or above; dry land and the world
 * bounds. Pure data and maths, no three.js, so the game, the tests and the map generators share it.
 * TERRAIN is today's map rebuilt exactly from map/consts.ts; world.ts re-exports its groundHeight, onSidewalk and
 * dockAt. Game coordinates: x east, z south (the river is north, at low z).
 */
import { CITY_PARK, DOCKS, LAND, PARK, PLAZA, RIVER, RIVER_BED, ROADS_X, ROADS_Z, SQUARE, WATER_LEVEL, type Dock as DockSpec, type Rect } from './consts.ts';
import { WORLD_BOUNDS } from '../../../lib/world-bounds.ts';

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

/**
 * An area: an axis-aligned rectangle (its edges count as inside, like city.ts inRect, unless `open`) or a polygon of
 * x,z pairs within its bounding box.
 */
export type Shape = { minX: number; maxX: number; minZ: number; maxZ: number; open: boolean; poly: readonly number[] | null };
export const rectShape = (r: Rect, open = false): Shape => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, open, poly: null });
export function polyShape(poly: readonly number[]): Shape {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]);
    minZ = Math.min(minZ, poly[i + 1]); maxZ = Math.max(maxZ, poly[i + 1]);
  }
  return { minX, maxX, minZ, maxZ, open: false, poly };
}
const inRect = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
/** Whether a point is in a shape, at least `margin` inside its edges. An infinite bound is not tested (so NaN passes it). */
export function inShape(s: Shape, x: number, z: number, margin = 0) {
  return inBox(s, x, z, margin) && (!s.poly || inPolygon(s.poly, x, z, margin));
}
// Kept small so it inlines into the hot paths (groundHeight runs thousands of times a frame).
function inBox(s: Shape, x: number, z: number, m: number) {
  return s.open ? (x > s.minX + m || s.minX === -Infinity) && (x < s.maxX - m || s.maxX === Infinity) && (z > s.minZ + m || s.minZ === -Infinity) && (z < s.maxZ - m || s.maxZ === Infinity)
    : (x >= s.minX + m || s.minX === -Infinity) && (x <= s.maxX - m || s.maxX === Infinity) && (z >= s.minZ + m || s.minZ === -Infinity) && (z <= s.maxZ - m || s.maxZ === Infinity);
}
/** Crossing-number test; with a margin the point must also stay that far from every edge. */
function inPolygon(p: readonly number[], x: number, z: number, margin: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (!inside || margin <= 0) return inside;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if (segmentDistance(x, z, p[j], p[j + 1], p[i], p[i + 1]) < margin) return false;
  return true;
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

/** promenade: the quay wall a swimmer climbs and a walker vaults; far: the fenced far bank; steps: a dock's steps, walked out of. */
export type BankKind = 'promenade' | 'far' | 'steps';
export const BANK_KINDS: Record<BankKind, { climbable: boolean }> = { promenade: { climbable: true }, far: { climbable: false }, steps: { climbable: false } };
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
};
/** The bank nearest a point: `d` is the signed distance to its waterline (+ out over the water), `x, z` the closest waterline point. */
export type BankHit = { bank: Bank; d: number; x: number; z: number };

/** A dock (pier and steps, from map/consts.ts) on a bank, `at` metres along it (x on an east-west bank). */
export type Dock = DockSpec & {
  id: number; water: number; bank: number; at: number;
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
  /** Water surface and bed heights. */
  level: number; bed: number;
  /** Open water a swimmer or boat may use (inside the buoys). */
  open: Shape;
  /** Where there is water, out to the walls' faces (the river runs on past the buoys): the ground is the bed. */
  wet: Shape;
  /** `wet` plus the tops of the walls round it, `top` high: ground here is the water body's (its docks, walls or bed). */
  shore: Shape; top: number;
  banks: Bank[]; docks: Dock[];
};
/** A raised area with a flat top: a lawn, a plaza, a tiled square. */
export type Surface = { shape: Shape; y: number };
/**
 * A straight road along x (`alongX`) or z at `at`: asphalt within `half` of the centre line, raised sidewalk out to
 * `edge`. It runs over lo < along < hi (an infinite bound is not tested).
 */
export type Strip = { alongX: boolean; at: number; lo: number; hi: number; half: number; edge: number };
/** A bridge deck or ramp over `shape`, its surface `y(x, z)` high. */
export type Deck = { id: number; shape: Shape; y: (x: number, z: number) => number };

export type TerrainSpec = {
  /** Street level (asphalt and open ground) and the sidewalk's height above it. */
  base: number; curb: number;
  land: Shape[]; waters: WaterBody[]; surfaces: Surface[]; strips: Strip[]; decks?: Deck[];
  /** Everything a player can reach. */
  bounds: Rect;
};
export type Terrain = ReturnType<typeof createTerrain>;

export function createTerrain(spec: TerrainSpec) {
  const { base, curb, land, waters, surfaces, strips, bounds } = spec;
  const decks: Deck[] = [...(spec.decks ?? [])];
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

  /** Whether a point is on a raised sidewalk (crossings over the carriageway stay at road level). */
  function onSidewalk(x: number, z: number) {
    let side = false;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const along = g.alongX ? x : z;
      if ((g.lo !== -Infinity && !(along > g.lo)) || (g.hi !== Infinity && !(along < g.hi))) continue;
      const v = g.alongX ? z : x;
      let d = Infinity;
      for (const at of g.at) d = Math.min(d, Math.abs(v - at));
      if (d < g.half) return false;
      if (d < g.edge) side = true;
    }
    return side;
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
  /** The ground ignoring decks. */
  function ground(x: number, z: number) {
    for (let i = 0; i < waters.length; i++) {
      const s = waters[i].shore;
      if (inBox(s, x, z, 0) && (!s.poly || inPolygon(s.poly, x, z, 0))) return shoreHeight(waters[i], x, z);
    }
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i].shape;
      if (inBox(s, x, z, 0) && (!s.poly || inPolygon(s.poly, x, z, 0))) return surfaces[i].y;
    }
    return onSidewalk(x, z) ? base + curb : base;
  }
  /**
   * Walkable surface height: sidewalks, lawns and plazas above the street, piers and steps on the shore, the bed
   * under water. A deck carries a body whose height `yHint` is no more than DECK_STEP below its surface (or any
   * body when yHint is omitted); a body further below (a swimmer, a boat, a ragdoll under a bridge) gets the ground.
   */
  function groundHeight(x: number, z: number, yHint?: number) {
    if (!decks.length) return ground(x, z);
    let top = -Infinity;
    for (const d of decks) {
      if (!inShape(d.shape, x, z)) continue;
      const y = d.y(x, z);
      if ((yHint ?? Infinity) >= y - DECK_STEP && y > top) top = y;
    }
    const below = ground(x, z);
    return top > below ? top : below;
  }
  /** The dock (pier or steps) under a point, if any. */
  function dockAt(x: number, z: number) {
    if (!(x >= dockBox.minX && x <= dockBox.maxX && z >= dockBox.minZ && z <= dockBox.maxZ)) return null;
    for (const d of docks) if (inRect(d.pier, x, z) || inRect(d.steps, x, z)) return d;
    return null;
  }
  /** The water body whose shore a point is on (decks do not matter: water runs under them). */
  function waterAt(x: number, z: number) {
    for (const w of waters) if (inShape(w.shore, x, z)) return w;
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
  /** Whether a point is open water (inside the buoys), at least `margin` from its edges. */
  function inWater(x: number, z: number, margin = 0) {
    for (const w of waters) if (inShape(w.open, x, z, margin)) return true;
    return false;
  }
  /** A dock whose pier is within `reach` of a point (the pier reaches back to the bank), if any. */
  function pierNear(x: number, z: number, reach: number) {
    for (const d of docks) if (nearRect(d.pier, d.nx, d.nz, x, z, reach)) return d;
    return null;
  }
  /** Open water a hull of radius `margin` fits in, clear of the piers and steps. */
  function navigable(x: number, z: number, margin: number) {
    for (const w of waters) {
      if (!inShape(w.open, x, z, margin)) continue;
      for (const d of w.docks) if (nearRect(d.berth, d.nx, d.nz, x, z, margin)) return false;
      return true;
    }
    return false;
  }
  /** The nearest bank within `reach` of a point (only climbable ones if asked), or null. */
  function bankNear(x: number, z: number, reach = Infinity, climbable = false): BankHit | null {
    let best: BankHit | null = null;
    for (const b of banks) {
      if (climbable && !b.climbable) continue;
      // East-west and north-south waterlines are measured exactly (no projection rounding).
      let px: number, pz: number, side: number, abreast: boolean;
      if (b.nx === 0) { px = Math.max(Math.min(b.ax, b.bx), Math.min(Math.max(b.ax, b.bx), x)); pz = b.az; side = (z - pz) * b.nz; abreast = px === x; }
      else if (b.nz === 0) { px = b.ax; pz = Math.max(Math.min(b.az, b.bz), Math.min(Math.max(b.az, b.bz), z)); side = (x - px) * b.nx; abreast = pz === z; }
      else {
        const dx = b.bx - b.ax, dz = b.bz - b.az;
        const u = ((x - b.ax) * dx + (z - b.az) * dz) / (dx * dx + dz * dz), t = Math.max(0, Math.min(1, u));
        px = b.ax + t * dx; pz = b.az + t * dz; side = (x - px) * b.nx + (z - pz) * b.nz; abreast = t === u;
      }
      // Off the end of the waterline the distance is to its end point; the sign still says which side.
      const d = abreast ? side : Math.sign(side || 1) * Math.hypot(x - px, z - pz);
      if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { bank: b, d, x: px, z: pz };
    }
    return best;
  }
  /** Whether a point is dry land, at least `r` inside it. */
  function walkable(x: number, z: number, r = 0) {
    for (const s of land) if (inShape(s, x, z, r)) return true;
    return false;
  }
  /** Whether a point is inside the world bounds, at least `margin` from their edges. */
  function inBounds(x: number, z: number, margin = 0) {
    return x >= bounds.minX + margin && x <= bounds.maxX - margin && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;
  }
  let nextDeck = decks.reduce((n, d) => Math.max(n, d.id + 1), 0);
  return {
    base, curb, bounds, waters, docks, banks, surfaces, strips, land, decks: decks as readonly Deck[],
    groundHeight, onSidewalk, dockAt, waterAt, waterLevel, deep, inWater, pierNear, navigable, bankNear, walkable, inBounds,
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
  const docks: Dock[] = DOCKS.map((d, id) => {
    bank('steps', id, d.steps.minX, d.steps.minZ, d.steps.maxX, d.steps.minZ, 0, -1);
    // Standing spots stop 0.5 m inside the edges, and on the river side of the wall's top (z -136.4).
    const landing = (r: Rect) => ({ minX: r.minX + 0.5, maxX: r.maxX - 0.5, minZ: r.minZ + 0.5, maxZ: Math.min(r.maxZ - 0.5, -136.6) });
    return {
      ...d, id, water: 0, bank: quay.id, at: d.x, nx: quay.nx, nz: quay.nz,
      deckY: PIER_DECK, stepsY: 0.1, stepsX: d.x, stepsZ: STEPS_TOP, drop: STEPS_DROP,
      berth: { minX: d.pier.minX, maxX: d.steps.maxX, minZ: Math.min(d.pier.minZ, d.steps.minZ), maxZ: Math.max(d.pier.maxZ, d.steps.maxZ) },
      landings: [landing(d.pier), landing(d.steps)],
    };
  });
  const river: WaterBody = {
    id: 0, name: 'SÔNG SÀI GÒN', level: WATER_LEVEL, bed: RIVER_BED,
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
    strips, bounds: WORLD_BOUNDS,
  };
}

export const TERRAIN = createTerrain(legacyTerrain());
export const { groundHeight, onSidewalk, dockAt, waterAt, waterLevel, deep, inWater, pierNear, navigable, bankNear, walkable, inBounds, bounds } = TERRAIN;
