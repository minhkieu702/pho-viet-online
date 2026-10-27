/**
 * The wired P1 districts as draw items for world.ts (WIRING-PLAN §2 Rendering). Each item draws one thing (a
 * building, a tree, a stretch of road, a junction, a bank…) through the world's kit into whatever sink world.ts has
 * set: world.ts sorts the items into tiles, builds the tiles a few milliseconds per frame (the player's slice first)
 * and turns each tile's sink into meshes. Items also run once in a dry pass that lays out every sign, so all district
 * signs share one glyph atlas.
 *
 * Buildings dispatch on GenPlot.typology first, then on their style or stamp: churches get a nave, a gabled front and
 * their slice's towers (EXTRA.towers), pagodas and schools their halls (the compound walls, gate pillars and yards are
 * the generator's props, so no gate is drawn at absolute An Hòa coordinates), chung cư and the CBD stamps go through
 * skyline.ts with a TowerSpec, markets, warehouses, villas and the landmark stamps have their own forms.
 *
 * Ground model (terrain.ts worldTerrain should agree): street level 0.1 (drawn at 0.05..0.08), asphalt within `half`
 * of a road edge's centre line, raised sidewalk (CURB_HEIGHT) from `half` to `half + sidewalk` and nowhere inside
 * another edge's asphalt, hẻm at street level, decks rising linearly from their ramp feet to yHint over the water.
 */
import type { Building, Plot, Prop, Tree, TreeSpecies } from './city';
import { CLOTH, DECAL, type ColorLike, type Frame, type Kit, type Role } from './kit';
import { CURB_HEIGHT } from './map/terrain';
import { cargoShipLayout, type ShipSpec } from './map/ship';
import { LAND, RIVER_BED, WATER_LEVEL } from './map/consts';
import { WATERS } from './map/districts';
import type { RoadEdge, RoadNode } from './map/roads';
import type { GenBuilding, GenPlot, GenSign } from './map/gen/buildings';
import type { Eatery, GenProp } from './map/gen/dressing';
import { FRONT_LIGHT } from './facades';
import { lampSeed, scheduleIndex } from './night';
import { ALL_NIGHT, LOBBY_HOURS, buildingLight, kioskCode, timedCode, windowCode } from './night-hours';
import { HEAD, TONES, aimedLight, bulbGlass, districtTone, makeLight, poolRim, type NightLight, type Tone } from './street-lights';
import {
  DISTRICT_BLOCKS, DISTRICT_BUILDINGS, DISTRICT_DECKS, DISTRICT_PLOTS, DISTRICT_POIS, DISTRICT_SCENERY, DISTRICT_SIGNS, DISTRICT_STAMPS, DISTRICT_WATERS,
  CURB_FLEET, EDGE_INFO, RINGS, SLICES, SLICE_EXTRA, TOWERS, WORKS, WORLD_ROADS, isWired, sliceAt, type SliceKey,
} from './map/world-map';
import { districtApproaches } from './signals';
import { worldBoundsFor } from '../../lib/world-bounds';
import type { RoadApproach } from './map/roads';

const PI = Math.PI, HALF_PI = PI / 2;
/** Heights of the drawn surfaces (terrain: street level 0.1, sidewalks CURB_HEIGHT above it). */
export const Y_GROUND = 0.05, Y_ROAD = 0.08, Y_WALK = 0.08 + CURB_HEIGHT;
const Y_KERB = Y_WALK + 0.015;
const ASPHALT = '#5f6a68', HEM = '#a29d92', KERB = '#d9d5ca', MARK = '#e3d4a7', WHITE_LINE = '#e8e6dc', ZEBRA = '#e4e3d4';
const WATER = '#5f9f98', BED = '#4f8a84', BANK = '#bbaf96', RAIL = '#e2cfaa';

// ---------------------------------------------------------------------------------------------------------------
// What world.ts lends the districts
// ---------------------------------------------------------------------------------------------------------------

/** Vertex-coloured surfaces (merged per tile and role): roads, sidewalks, ground, water, walls. */
export type SurfRole = 'ground' | 'paving' | 'solid' | 'wall' | 'water';
export type Surf = {
  /** A triangle (x,y,z points). A face that lies mostly flat is turned to face up; a wall keeps its winding (CCW = front). */
  tri(role: SurfRole, color: ColorLike, a: number[], b: number[], c: number[]): void;
  /** A quad a-b-c-d (convex, in order), oriented as tri(); `face: 'down'` turns a flat one down (a deck's underside). */
  quad(role: SurfRole, color: ColorLike, a: number[], b: number[], c: number[], d: number[], face?: 'down'): void;
  /** A flat polygon (x,z pairs, simple, any winding) at height y, with optional holes. */
  fill(role: SurfRole, color: ColorLike, poly: readonly number[], y: number, holes?: readonly (readonly number[])[]): void;
};
export type DistrictKit = Kit & {
  surf: Surf;
  /** What follows stands this much higher (furniture on a sidewalk). */
  lift(y: number): void;
  tree(t: Tree, street: boolean): void;
  /** world.ts prop() for the kinds today's map has (shelter, cart, bin, stall, flagpole, stupa, urn, planter, lottery…). */
  prop(pr: Prop, index: number): void;
  bench(x: number, z: number, yaw: number): void;
  stool(x: number, z: number, color?: string): void;
  pot(x: number, z: number, y: number, size: number, seed: number): void;
  flowers(x: number, y: number, z: number, count: number, sx: number, sz: number, seed: number): void;
  plate(n: number, x: number, y: number, z: number, yaw: number): void;
  /** Today's building renderers (dims from the plot's oriented box). */
  house(p: Plot, b: Building): void;
  hospital(p: Plot, b: Building): void;
  police(p: Plot, b: Building): void;
  school(p: Plot, b: Building): void;
  pagoda(p: Plot, b: Building): void;
  office(p: Plot, b: Building): void;
  /** skyline.ts towers (TowerSpec plots) into the current tile. */
  towers(list: { plot: Plot; building: Building }[]): void;
  cable(ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, width: number, color: string, fine: boolean): void;
  /** A low box a falling body lands on (bench seats, stools, tables). */
  seat(x: number, z: number, w: number, d: number, yaw: number, top: number): void;
  /** A signal lens (red, amber, green from the top) of approach `a`, slot 0..2, for the tile's lens mesh. */
  lens(a: RoadApproach, slot: number, x: number, y: number, z: number, yaw: number): void;
  /**
   * A lamp's or bulb's light at night (street-lights.ts tones): its pool on the ground under (x, z), Ø the tone's size ×
   * `scale` and strength × `gain` (0: a halo alone), and a halo at the world height `headY` (none less than 0.5 m over
   * the pool); `groundY` puts the pool on a pier's deck, `color` lights pool and halo in a colour of its own (a coloured
   * bulb). Under the lit scope's code, else the street-lamp switch seeded by (x, z), as a lamp head drawn at (x, z) is:
   * pass the head's own position.
   */
  light(tone: Tone, x: number, z: number, headY: number, scale?: number, gain?: number, groundY?: number, color?: string): void;
  /**
   * A street lamp's light: the halo at its head (hx, hz) `headY` high, the pool out over the road from the pole (px, pz),
   * `scale` times its size (a lamp by the water keeps its pool on the land).
   */
  streetLamp(tone: Tone, px: number, pz: number, hx: number, hz: number, headY: number, scale?: number): void;
  /** A low-detail stand-in (a building's box, a tree's crown) shown in place of the tile's detail beyond its near distance. */
  far(kind: 'box' | 'puff' | 'pyramid' | 'cylinder' | 'gable', color: ColorLike, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw?: number): void;
};

/**
 * One thing to draw: where it is (its tile), whether it lays out signs (the dry sign pass runs it), and how; `hours`
 * when it stands only then (a night market's stalls, a walking street's tables and barriers).
 */
export type DistrictItem = { x: number; z: number; slice: string; signs: boolean; draw: () => void; hours?: [number, number]; tag?: string };

// ---------------------------------------------------------------------------------------------------------------
// Small maths
// ---------------------------------------------------------------------------------------------------------------

const hyp = (x: number, z: number) => Math.sqrt(x * x + z * z);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function seeded(start: number) {
  let v = (Math.abs(Math.floor(start)) % 2147483646) + 1;
  return () => (v = (v * 16807) % 2147483647) / 2147483647;
}
const pickOf = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Distance along line 1 (origin o1, direction h1) to where it meets line 2; NaN when they are parallel (roads.ts meet). */
function meet(o1x: number, o1z: number, h1x: number, h1z: number, o2x: number, o2z: number, h2x: number, h2z: number) {
  const c = h1x * h2z - h1z * h2x;
  if (Math.abs(c) < 1e-6) return NaN;
  return ((o2x - o1x) * h2z - (o2z - o1z) * h2x) / c;
}
function inPoly(p: readonly number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function centroid(p: readonly number[]) {
  let x = 0, z = 0;
  for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; }
  return { x: (x * 2) / p.length, z: (z * 2) / p.length };
}
/** Point and unit tangent at arc length s along a polyline (clamped). */
function along(pts: readonly number[], cum: readonly number[], s: number) {
  const n = cum.length;
  if (s <= 0) { const l = cum[1] || 1; return { x: pts[0], z: pts[1], hx: (pts[2] - pts[0]) / l, hz: (pts[3] - pts[1]) / l }; }
  for (let i = 1; i < n; i++) {
    if (s <= cum[i] || i === n - 1) {
      const l = cum[i] - cum[i - 1] || 1, t = clamp((s - cum[i - 1]) / l, 0, 1);
      const ax = pts[i * 2 - 2], az = pts[i * 2 - 1], bx = pts[i * 2], bz = pts[i * 2 + 1];
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, hx: (bx - ax) / l, hz: (bz - az) / l };
    }
  }
  return { x: pts[0], z: pts[1], hx: 1, hz: 0 };
}
/**
 * Stations along a polyline between arc lengths s0 and s1: every vertex in between plus extra points every `step`
 * (decks), each with the miter offset direction (unit right of travel, scaled to keep the ribbon's width).
 */
function stations(pts: readonly number[], cum: readonly number[], s0: number, s1: number, step = 0) {
  const ss: number[] = [s0];
  for (let i = 1; i < cum.length - 1; i++) if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) ss.push(cum[i]);
  if (step > 0) for (let s = s0 + step; s < s1 - step * 0.5; s += step) ss.push(s);
  ss.push(s1);
  ss.sort((a, b) => a - b);
  const out: { s: number; x: number; z: number; rx: number; rz: number; m: number }[] = [];
  for (let k = 0; k < ss.length; k++) {
    const s = ss[k];
    if (k && s - ss[k - 1] < 0.01) continue;
    const p = along(pts, cum, s);
    // At an interior vertex: average the two segments' rights (miter).
    const vi = cum.findIndex((c) => Math.abs(c - s) < 1e-6);
    let rx = -p.hz, rz = p.hx, m = 1;
    if (vi > 0 && vi < cum.length - 1) {
      const a = along(pts, cum, s - 0.01), b = along(pts, cum, s + 0.01);
      const r1x = -a.hz, r1z = a.hx, r2x = -b.hz, r2z = b.hx, mx = r1x + r2x, mz = r1z + r2z, l = hyp(mx, mz) || 1;
      rx = mx / l; rz = mz / l;
      const cos = rx * r1x + rz * r1z;
      m = Math.min(3, 1 / Math.max(0.33, cos));
    }
    out.push({ s, x: p.x, z: p.z, rx, rz, m });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Decks: the road surface over the water-only bridges
// ---------------------------------------------------------------------------------------------------------------

type DeckOn = { from: number; len: number; s0: number; s1: number; y: number; name: string };
/** Decks per WORLD_ROADS edge id. */
const DECKS = new Map<number, DeckOn[]>();
for (const d of DISTRICT_DECKS) {
  const id = EDGE_INFO.findIndex((e) => e.slice === d.slice && (e.key === d.edge || e.key.startsWith(`${d.edge}:`)));
  if (id < 0) continue;
  const list = DECKS.get(id) ?? [];
  list.push({ from: d.from, len: d.len, s0: d.s0, s1: d.s1, y: d.yHint, name: d.name });
  DECKS.set(id, list);
}
/** Height a deck lifts edge `e` at arc length s (0 off its decks): linear ramps from the feet to yHint over the water. */
export function deckLift(e: number, s: number) {
  const list = DECKS.get(e);
  if (!list) return 0;
  for (const d of list) {
    const u = s - d.from;
    if (u <= 0 || u >= d.len) continue;
    const up = d.s0 > 0.01 ? u / d.s0 : 1, down = d.len - d.s1 > 0.01 ? (d.len - u) / (d.len - d.s1) : 1;
    return d.y * clamp(Math.min(up, down), 0, 1);
  }
  return 0;
}

/**
 * How high furniture at (x, z) stands above street level on district land: on a sidewalk CURB_HEIGHT, on a deck its
 * height (plus the curb on its footways), else 0. Today's land keeps terrain.ts onSidewalk.
 */
export function districtLift(x: number, z: number) {
  let asphalt = false, walk = false, deck = 0;
  for (const h of WORLD_ROADS.edgesNear(x, z, 14)) {
    const e = h.edge, d = Math.abs(h.off);
    if (h.d > e.half + e.sidewalk + 0.01) continue;
    const lift = deckLift(e.id, h.s);
    if (lift > deck) deck = lift;
    if (h.d < e.half) asphalt = true;
    else if (e.cls !== 'hem' && d <= e.half + e.sidewalk) walk = true;
  }
  return deck + (!asphalt && walk ? CURB_HEIGHT : 0);
}

// ---------------------------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------------------------

/** Which slice's sidewalks are granite (downtown Quận 1) and which terracotta. */
const GRANITE = new Set(['quan-1-south']);
const isDistrictEdge = (e: RoadEdge) => EDGE_INFO[e.id].slice !== 'legacy' && !EDGE_INFO[e.id].slice.startsWith('link:');

export function planDistricts(k: DistrictKit): DistrictItem[] {
  const items: DistrictItem[] = [];
  let tag = '';
  const add = (x: number, z: number, slice: string, signs: boolean, draw: () => void, hours?: [number, number]) => items.push({ x, z, slice, signs, draw, hours, tag });
  const { surf } = k;

  // ---- Ground: every block face, the parks, yards and walks on it ----
  tag = 'ground';
  for (const b of DISTRICT_BLOCKS) {
    const c = centroid(b.face);
    const color = b.zone === 'park' ? '#97b384' : b.zone === 'warehouse' ? '#c9c4b4' : b.zone === 'villa' ? '#b9c49e' : '#d7d1bb';
    add(c.x, c.z, b.slice, false, () => surf.fill('ground', color, b.face, Y_GROUND));
  }
  for (const p of DISTRICT_SCENERY.parks) { const c = centroid(p.poly); add(c.x, c.z, p.slice, false, () => surf.fill('ground', '#8fae7f', p.poly, Y_GROUND + 0.04)); }
  for (const p of DISTRICT_SCENERY.yards) { const c = centroid(p.poly); add(c.x, c.z, p.slice, false, () => surf.fill('paving', '#d8cdb8', p.poly, Y_GROUND + 0.05)); }
  for (const p of DISTRICT_SCENERY.walks) { const c = centroid(p.poly); add(c.x, c.z, p.slice, false, () => surf.fill('paving', '#cfc2a6', p.poly, Y_GROUND + 0.06)); }

  // ---- Roads ----
  tag = 'roads';
  const sideStart = planJunctions(k, add);
  for (const e of WORLD_ROADS.edges) {
    if (!isDistrictEdge(e)) continue;
    const info = EDGE_INFO[e.id], slice = info.slice;
    // Long edges come in pieces (each its own item, so a 400 m boulevard is built and culled with its tiles).
    const n = Math.max(1, Math.ceil(e.len / 48));
    for (let i = 0; i < n; i++) {
      const s0 = (e.len * i) / n, s1 = (e.len * (i + 1)) / n, p = along(e.pts, e.cum, (s0 + s1) / 2);
      add(p.x, p.z, slice, false, () => drawEdge(k, e, s0, s1, sideStart));
    }
  }
  for (const c of WORLD_ROADS.crosswalks) {
    if (c.phantom || c.informal || c.edge < 0 || !isDistrictEdge(WORLD_ROADS.edges[c.edge])) continue;
    add((c.ax + c.bx) / 2, (c.az + c.bz) / 2, EDGE_INFO[c.edge].slice, false, () => zebra(surf, c.ax, c.az, c.bx, c.bz, deckLift(c.edge, 0)));
  }
  for (const a of districtApproaches()) {
    const e = WORLD_ROADS.edges[a.edge];
    add(a.pole.x, a.pole.z, EDGE_INFO[a.edge].slice, true, () => signal(k, a, e));
  }

  // ---- Water and banks ----
  tag = 'water';
  // Each waterway's surface once; its banks from every slice that has it, each piece drawn by the slice owning the land
  // behind it (Quận 4 and Thủ Thiêm share the river: a quay on one side, a promenade on the other).
  const surfaced = new Set<string>();
  for (const s of SLICES) for (const w of s.data.waters) {
    if (!surfaced.has(w.id)) {
      surfaced.add(w.id);
      const c = centroid(w.poly);
      add(c.x, c.z, s.key, false, () => { surf.fill('water', WATER, w.poly, WATER_LEVEL); surf.fill('solid', BED, w.poly, RIVER_BED); });
    }
    for (const b of w.banks) {
      const len = hyp(b.bx - b.ax, b.bz - b.az);
      const n = Math.max(1, Math.ceil(len / 40));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, ax = b.ax + (b.bx - b.ax) * t0, az = b.az + (b.bz - b.az) * t0, bx = b.ax + (b.bx - b.ax) * t1, bz = b.az + (b.bz - b.az) * t1;
        // Only where this slice's land lies behind the waterline: another slice's, today's (its own promenade), water on
        // both sides (a canal mouth) or unbuilt land (a far bank, below) is not this slice's to draw.
        const lx = (ax + bx) / 2 - b.nx * 1.5, lz = (az + bz) / 2 - b.nz * 1.5;
        if (sliceAt(lx, lz)?.key !== s.key || !landAt(lx, lz, w.id)) continue;
        add((ax + bx) / 2, (az + bz) / 2, s.key, false, () => bank(k, ax, az, bx, bz, b.nx, b.nz, b.kind));
      }
    }
  }
  for (const [id, list] of DECKS) {
    const e = WORLD_ROADS.edges[id];
    for (const d of list) {
      const p = along(e.pts, e.cum, d.from + (d.s0 + d.s1) / 2);
      add(p.x, p.z, EDGE_INFO[id].slice, true, () => bridge(k, e, d));
    }
  }

  // ---- Buildings ----
  tag = 'buildings';
  const stampOf = new Map(DISTRICT_STAMPS.map((s) => [s.building, s]));
  DISTRICT_BUILDINGS.forEach((b, i) => {
    const p = DISTRICT_PLOTS[i];
    const slice = sliceAt(b.x, b.z)?.key ?? SLICES[0]?.key ?? '';
    const f = Math.sin(b.facing), g = Math.cos(b.facing);
    // Filed at its front (where its signs hang), so a building and its signs land in one tile.
    add(p.box.cx + f * p.box.hz, p.box.cz + g * p.box.hz, slice, true, () => building(k, b, p, stampOf.get(b.id)?.id ?? b.stamp));
  });

  // ---- Dressing ----
  tag = 'dressing';
  DISTRICT_SCENERY.trees.forEach((t) => add(t.x, t.z, t.slice, false, () => {
    const l = districtLift(t.x, t.z);
    k.lift(l); k.tree(t, l >= CURB_HEIGHT - 0.01); k.lift(0);
    if (t.species !== 'bamboo') k.far('puff', t.species === 'flame' ? '#6f8f4f' : '#5f8f55', t.x, (t.species === 'tall' ? 8.6 : t.species === 'palm' ? 6 : 4.8) * t.size, t.z, 2.4 * t.size, 2.2 * t.size, 2.4 * t.size);
  }));
  DISTRICT_SCENERY.lamps.forEach((l) => add(l.x, l.z, l.slice, false, () => lamp(k, l)));
  DISTRICT_SCENERY.props.forEach((pr, i) => add(pr.x, pr.z, pr.slice, true, () => prop(k, pr, i)));
  DISTRICT_SCENERY.benches.forEach((b) => add(b.x, b.z, b.slice, false, () => { k.lift(districtLift(b.x, b.z)); k.bench(b.x, b.z, b.yaw); k.lift(0); }));
  const poiByKey = new Map(DISTRICT_POIS.map((p) => [p.key, p]));
  DISTRICT_SCENERY.eateries.forEach((e) => add(e.x, e.z, e.slice, false, () => eatery(k, e, e.seats.map((s) => poiByKey.get(s)).filter((p): p is NonNullable<typeof p> => !!p))));
  poles(k, add);

  // ---- Signs the generator laid that no renderer draws: light boxes, hẻm arches, the chung cư kiosks' boards ----
  tag = 'signs';
  for (const s of DISTRICT_SIGNS) {
    if (s.kind === 'board' && !/:k\d+:s$/.test(s.key)) continue;
    if (s.kind === 'plate') continue;
    add(s.x, s.z, s.slice, true, () => genSign(k, s));
  }

  // ---- Edge works, towers and the slices' extras ----
  tag = 'extras';
  works(k, add);
  extras(k, add);
  timed(k, add);
  festoons(k, add);

  // ---- Beyond the playable land: the ground, the waters nobody built, their far banks ----
  tag = 'outer';
  const b = worldBoundsFor(SLICES.length);
  const reach = { minX: b.minX - OUTER_REACH, maxX: b.maxX + OUTER_REACH, minZ: b.minZ - OUTER_REACH, maxZ: b.maxZ + OUTER_REACH };
  outerGround(k, add, reach);
  outerWaters(k, add, reach, isWired('thu-thiem') ? null : [-330, 470]);
  return items;
}

// ---------------------------------------------------------------------------------------------------------------
// Beyond the playable land: the ground, the waterways nobody has built, their far banks
// ---------------------------------------------------------------------------------------------------------------

/** How far past the reachable box the outer ground runs (fog far plus a margin: nothing beyond it is ever seen). */
const OUTER_REACH = 380;
const OUTER_GRASS = '#b4b99a';
/** Whether (x, z) is land nobody plays on: not today's land, not a wired slice's, not water. */
function outerLand(x: number, z: number) {
  if (x >= LAND.minX && x <= LAND.maxX && z >= -137.6 && z <= LAND.maxZ) return false;
  if (sliceAt(x, z)) return false;
  for (const w of WATERS) if (inPoly(w.poly, x, z)) return false;
  return true;
}
/**
 * The ground round the playable land at street level, as a quadtree of squares (32 m, down to 2 m along shores and
 * slice edges), filed into tiles by position so the far ones are hidden with the rest.
 */
function outerGround(k: DistrictKit, add: (x: number, z: number, slice: string, signs: boolean, draw: () => void) => void, reach: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const cells = new Map<string, number[]>();
  const leaf = (x0: number, z0: number, s: number) => {
    const key = `${Math.floor((x0 + s / 2) / 128)}:${Math.floor((z0 + s / 2) / 128)}`;
    const l = cells.get(key);
    if (l) l.push(x0, z0, s); else cells.set(key, [x0, z0, s]);
  };
  const walk = (x0: number, z0: number, s: number) => {
    const probes = [[x0, z0], [x0 + s, z0], [x0, z0 + s], [x0 + s, z0 + s], [x0 + s / 2, z0 + s / 2], [x0 + s / 2, z0], [x0, z0 + s / 2], [x0 + s, z0 + s / 2], [x0 + s / 2, z0 + s]];
    let land = 0;
    for (const [x, z] of probes) if (outerLand(x, z)) land++;
    if (land === probes.length) { leaf(x0, z0, s); return; }
    if (land === 0 && s <= 32) return;
    if (s <= 2) { if (outerLand(x0 + s / 2, z0 + s / 2)) leaf(x0, z0, s); return; }
    const h = s / 2;
    walk(x0, z0, h); walk(x0 + h, z0, h); walk(x0, z0 + h, h); walk(x0 + h, z0 + h, h);
  };
  const S = 64;
  for (let x = Math.floor(reach.minX / S) * S; x < reach.maxX; x += S) for (let z = Math.floor(reach.minZ / S) * S; z < reach.maxZ; z += S) walk(x, z, S);
  for (const list of cells.values()) {
    const cx = list[0] + list[2] / 2, cz = list[1] + list[2] / 2;
    add(cx, cz, '', false, () => {
      for (let i = 0; i < list.length; i += 3) {
        const x0 = list[i], z0 = list[i + 1], s = list[i + 2];
        k.surf.quad('ground', OUTER_GRASS, [x0, -0.01, z0], [x0 + s, -0.01, z0], [x0 + s, -0.01, z0 + s], [x0, -0.01, z0 + s]);
      }
    });
  }
}
/**
 * Waterways no wired slice draws (design 1's, P2's included, within reach): surface and bed; and every waterline with
 * unbuilt land behind it gets a far bank (a fenced wall, as today's across the river) with trees on it. Today's far
 * bank keeps its own wall across from An Hòa while Thủ Thiêm is not built.
 */
function outerWaters(k: DistrictKit, add: (x: number, z: number, slice: string, signs: boolean, draw: () => void) => void, reach: { minX: number; maxX: number; minZ: number; maxZ: number }, legacyFar: [number, number] | null) {
  const drawn = new Set(DISTRICT_WATERS.map((w) => w.id));
  const near = (p: readonly number[]) => { for (let i = 0; i < p.length; i += 2) if (p[i] > reach.minX && p[i] < reach.maxX && p[i + 1] > reach.minZ && p[i + 1] < reach.maxZ) return true; return false; };
  for (const w of WATERS) {
    const boxed = w.poly.length >= 6 && (near(w.poly) || inPoly(w.poly, (reach.minX + reach.maxX) / 2, (reach.minZ + reach.maxZ) / 2));
    if (!boxed) continue;
    if (!drawn.has(w.id)) {
      const c = centroid(w.poly);
      add(c.x, c.z, '', false, () => { k.surf.fill('water', WATER, w.poly, WATER_LEVEL); k.surf.fill('solid', BED, w.poly, RIVER_BED); });
    }
    // Far banks: each edge piece (up to 40 m) whose land side is outer land.
    const p = w.poly, n = p.length / 2;
    let ccw = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; ccw += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1], len = hyp(bx - ax, bz - az);
      if (len < 0.5) continue;
      // The normal out over the water: the polygon's inside.
      let nx = -(bz - az) / len, nz = (bx - ax) / len;
      if (ccw < 0) { nx = -nx; nz = -nz; }
      if (!inPoly(p, (ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3)) { nx = -nx; nz = -nz; }
      const pieces = Math.max(1, Math.ceil(len / 40));
      for (let q = 0; q < pieces; q++) {
        const t0 = q / pieces, t1 = (q + 1) / pieces, px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0, qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
        const mx = (px + qx) / 2, mz = (pz + qz) / 2;
        if (mx < reach.minX || mx > reach.maxX || mz < reach.minZ || mz > reach.maxZ) continue;
        if (!outerLand(mx - nx * 2, mz - nz * 2)) continue;
        if (legacyFar && w.id === 'song-sai-gon' && Math.abs(mz + 203.6) < 0.5 && mx > legacyFar[0] - 1 && mx < legacyFar[1] + 1) continue;
        add(mx, mz, '', false, () => farBank(k, px, pz, qx, qz, nx, nz));
      }
    }
  }
}
/** A far bank: a concrete wall down to the bed, a fence along its top, trees standing back from it. */
function farBank(k: DistrictKit, ax: number, az: number, bx: number, bz: number, nx: number, nz: number) {
  const len = hyp(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, yaw = -Math.atan2(uz, ux);
  wallFace(k.surf, 'wall', BANK, ax, az, bx, bz, RIVER_BED, Y_ROAD, (ax + bx) / 2 + nx, (az + bz) / 2 + nz, true);
  k.surf.quad('solid', '#c9c3b4', [ax, Y_ROAD, az], [bx, Y_ROAD, bz], [bx - nx * 0.8, Y_ROAD, bz - nz * 0.8], [ax - nx * 0.8, Y_ROAD, az - nz * 0.8]);
  const rx = (ax + bx) / 2 - nx * 0.4, rz = (az + bz) / 2 - nz * 0.4;
  k.box('#c9c3b4', rx, 0.55, rz, len, 0.1, 0.12, yaw, false);
  k.box('#c9c3b4', rx, 1.05, rz, len, 0.1, 0.12, yaw, false);
  for (let t = 0; t <= len; t += 3) k.box('#b5ae9e', ax + ux * t - nx * 0.4, 0.6, az + uz * t - nz * 0.4, 0.14, 1.2, 0.14, 0, false);
  // Trees on the bank behind, every 9–15 m (hashed by position, a stream of their own).
  const r = seeded(strHash(`far:${Math.round(ax)}:${Math.round(az)}`));
  for (let t = r() * 6; t < len; t += 9 + r() * 6) {
    const back = 5 + r() * 9, x = ax + ux * t - nx * back, z = az + uz * t - nz * back;
    if (!outerLand(x, z)) continue;
    const s = 0.9 + r() * 0.5, tint = r();
    k.shape('cylinder', '#7a5a48', x, 1.6 * s, z, 0.25 * s, 3.2 * s, 0.25 * s, 0, 0, false);
    k.shape('puff', tint > 0.5 ? '#5c8a53' : '#4f8049', x, 4.5 * s, z, 2.6 * s, 2.4 * s, 2.6 * s, r() * 3, 0, false);
    k.shape('puff', '#78a564', x + 0.8 * s, 5.9 * s, z + 0.3 * s, 1.6 * s, 1.5 * s, 1.6 * s, r() * 3, 0, false);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// What stands only at some hours: night markets, walking-street seating, closure barriers
// ---------------------------------------------------------------------------------------------------------------

type Add = (x: number, z: number, slice: string, signs: boolean, draw: () => void, hours?: [number, number]) => void;
/**
 * Quận 1 south's market stalls (the night market on Phan Bội Châu 18–24, the day stalls on Đề Thám's apron), the book
 * street's kiosks, Bùi Viện's walking-street stool tables (19–02) and the closure barriers; closed streets without
 * authored barriers (Vĩnh Khánh 18–24) get them at the ends where they meet an open street. world.ts shows each only
 * in its hours.
 */
function timed(k: DistrictKit, add: Add) {
  const q1 = SLICE_EXTRA['quan-1-south'];
  const authored = new Set<string>();
  if (q1) {
    const market = timedCode(q1.market.night.hours);
    for (const s of q1.market.night.stalls) add(s.x, s.z, 'quan-1-south', false, () => k.lit(market, () => stall(k, s, true)), q1.market.night.hours);
    for (const s of q1.market.day.stalls) add(s.x, s.z, 'quan-1-south', false, () => stall(k, s, false), q1.market.day.hours);
    for (const s of q1.bookstalls.stalls) add(s.x, s.z, 'quan-1-south', true, () => bookstall(k, s), q1.bookstalls.hours);

    for (const [art, c] of Object.entries(q1.closures)) {
      authored.add(`quan-1-south|${art}`);
      for (const b of c.barriers) add((b.ax + b.bx) / 2, (b.az + b.bz) / 2, 'quan-1-south', true, () => barrier(k, b.ax, b.az, b.bx, b.bz, c.kind === 'chợ đêm' ? 'CHỢ ĐÊM' : 'PHỐ ĐI BỘ'), c.hours);
    }
  }
  // The walking streets' night seating (Bùi Viện 19–02, Vĩnh Khánh's ốc tables 17–01), their neon gateways and the
  // lantern strings over them.
  for (const [slice, ns] of nightStreets()) {
    for (const t of ns.tables) add(t.x, t.z, slice, false, () => seatSet(k, t), ns.hours);
    for (const a of ns.arches) add((a.ax + a.bx) / 2, (a.az + a.bz) / 2, slice, true, () => neonArch(k, a));
    // Strings every 10 m along every stretch of the street between its two gateways.
    if (ns.arches.length >= 2) {
      const [a1, a2] = ns.arches, ax = (a1.ax + a1.bx) / 2, az = (a1.az + a1.bz) / 2, dx = (a2.ax + a2.bx) / 2 - ax, dz = (a2.az + a2.bz) / 2 - az, span = hyp(dx, dz);
      for (const e of WORLD_ROADS.edges) {
        if (EDGE_INFO[e.id].slice !== slice || EDGE_INFO[e.id].art !== ns.road) continue;
        for (let s = 5; s < e.len - 4; s += 10) {
          const [x, z] = pointOn(e, s), t = ((x - ax) * dx + (z - az) * dz) / span;
          if (t > 6 && t < span - 4) add(x, z, slice, false, () => lanternString(k, e, s));
        }
      }
    }
  }
  for (const e of WORLD_ROADS.edges) {
    const info = EDGE_INFO[e.id];
    if (!info.closed || authored.has(`${info.slice}|${info.art}`)) continue;
    for (const end of [0, 1] as const) {
      const n = WORLD_ROADS.nodes[end ? e.b : e.a];
      // Where an open street with traffic meets it (a hẻm brings no cars).
      if (!n.arms.some((a) => a.edge !== e.id && !EDGE_INFO[a.edge].closed && WORLD_ROADS.edges[a.edge].cls !== 'hem' && WORLD_ROADS.edges[a.edge].traffic)) continue;
      const s = end ? e.len - (n.radius + 1.5) : n.radius + 1.5;
      if (s < 0 || s > e.len) continue;
      const p = along(e.pts, e.cum, s), rx = -p.hz, rz = p.hx, w = e.half + 0.2;
      add(p.x, p.z, info.slice, true, () => barrier(k, p.x - rx * w, p.z - rz * w, p.x + rx * w, p.z + rz * w, 'PHỐ ẨM THỰC'), [info.closed[0], info.closed[1]]);
    }
  }
}
/** All night (night-hours.ts ALL_NIGHT), registered once. */
let allNightCode = -1;
const allNight = () => (allNightCode >= 0 ? allNightCode : (allNightCode = scheduleIndex(ALL_NIGHT)));
/** Festoon bulbs by street: Bùi Viện's in colours, Vĩnh Khánh's warm, the night market's on Phan Bội Châu white. */
const FESTOON: Record<string, readonly string[]> = {
  'bui-vien': ['#ff5a5a', '#ffd23d', '#5ad2ff', '#7dff6a', '#ff7ad9'],
  'vinh-khanh': ['#ffe2a8'],
  'phan-boi-chau': ['#fff1c8'],
};
/** Vertical light boxes (the generator's `:v` signs) a festoon's ends keep clear of, in 8 m cells. */
let boxCells: Map<string, { x: number; z: number }[]> | null = null;
function nearBox(x: number, z: number) {
  if (!boxCells) {
    boxCells = new Map();
    for (const g of DISTRICT_SIGNS) {
      if (g.kind !== 'vertical') continue;
      const key = `${Math.floor(g.x / 8)}:${Math.floor(g.z / 8)}`, list = boxCells.get(key);
      if (list) list.push(g); else boxCells.set(key, [g]);
    }
  }
  for (let i = Math.floor(x / 8) - 1; i <= Math.floor(x / 8) + 1; i++) for (let j = Math.floor(z / 8) - 1; j <= Math.floor(z / 8) + 1; j++) {
    for (const g of boxCells.get(`${i}:${j}`) ?? []) if (hyp(g.x - x, g.z - z) < 0.8) return true;
  }
  return false;
}
/**
 * Festoons over the streets closed to traffic at night (EDGE_INFO closed: Bùi Viện, Vĩnh Khánh, Phan Bội Châu): a
 * cable of bulbs across the street, facade to facade at 5.6 m, every 9 m (on a street with lantern strings, halfway
 * between them), lit in the street's hours, with a soft glow below. Timed items: they stand only in those hours.
 */
function festoons(k: DistrictKit, add: Add) {
  // Where the night streets' lantern strings hang (every 10 m from 5 m along their edges): festoons go between.
  const lanterned = new Set(nightStreets().filter(([, ns]) => ns.arches.length >= 2).map(([slice, ns]) => `${slice}|${ns.road}`));
  for (const e of WORLD_ROADS.edges) {
    const info = EDGE_INFO[e.id];
    if (!info.closed || !isDistrictEdge(e)) continue;
    // (closed carries a [from, to] pair: EDGE_INFO's type says Hours)
    const span = info.closed as unknown as [number, number], code = timedCode(span), colors = FESTOON[info.art] ?? ['#ffe9c0'];
    const lantern = lanterned.has(`${info.slice}|${info.art}`);
    const a = WORLD_ROADS.nodes[e.a], b = WORLD_ROADS.nodes[e.b];
    const from = lantern ? 10 : a.radius + 3, to = e.len - (lantern ? 4 : b.radius + 3), step = lantern ? 10 : 9;
    const w = e.half + e.sidewalk - 0.1;
    for (let s = from; s <= to; s += step) {
      // A string whose end would run through a light box slides along the street (up to 3 m) to clear it: Bùi Viện is
      // lined with them, and dropping those strings left its west end bare.
      let p: ReturnType<typeof along> | null = null;
      for (const ds of [0, 1.5, -1.5, 3, -3]) {
        const q = along(e.pts, e.cum, Math.min(to, Math.max(from, s + ds)));
        if (!nearBox(q.x + q.hz * w, q.z - q.hx * w) && !nearBox(q.x - q.hz * w, q.z + q.hx * w)) { p = q; break; }
      }
      if (!p) continue;
      const at = p, rx = -at.hz, rz = at.hx, seed = Math.round(s * 7 + e.id * 13);
      add(at.x, at.z, info.slice, false, () => k.lit(code, () => festoon(k, at.x, at.z, rx, rz, w, colors, seed)), [span[0], span[1]]);
    }
  }
}
/** One festoon: the cable across, bulbs hanging on it every metre or so, each with its glow, the light on the street. */
function festoon(k: DistrictKit, x: number, z: number, rx: number, rz: number, w: number, colors: readonly string[], seed: number) {
  const y = 5.6, sag = 0.35, n = Math.max(5, Math.round((2 * w) / 1.1));
  // Coloured strings (Bùi Viện's) have bigger bulbs and halos: at the 15–25 m they are seen from, the small warm ones'
  // size left them pastel specks.
  const big = colors.length > 1, r = big ? 0.09 : 0.06, halo = big ? 1.6 : 0.95;
  k.cable(x - rx * w, y, z - rz * w, x + rx * w, y, z + rz * w, sag, 0.02, '#2a2a2a', false);
  for (let i = 1; i < n; i++) {
    const t = i / n, bx = x + rx * w * (2 * t - 1), bz = z + rz * w * (2 * t - 1), by = y - sag * 4 * t * (1 - t) - 0.1;
    const color = colors[(seed + i) % colors.length];
    k.shape('ball', bulbGlass(color), bx, by, bz, r, r * 1.25, r, 0, 0, false, 'lamp');
    k.light('bulb', bx, bz, by, halo, 0, undefined, color);
  }
  k.light('bulb', x, z, 0, 7 / TONES.bulb.size, 0.6 / TONES.bulb.strength);
}
/** Every wired slice's night seating (EXTRA.nightSeats): the walking street, its tables, hours and gateways. */
type NightSeating = { road: string; hours: [number, number]; tables: { x: number; z: number; yaw: number; stools: number }[]; arches: { ax: number; az: number; bx: number; bz: number; text: string; sub: string }[] };
function nightStreets(): [string, NightSeating][] {
  const out: [string, NightSeating][] = [];
  const q1 = SLICE_EXTRA['quan-1-south'], q4 = SLICE_EXTRA['quan-4'];
  if (q1) out.push(['quan-1-south', q1.nightSeats]);
  if (q4) out.push(['quan-4', q4.nightSeats]);
  return out;
}
const pointOn = (e: RoadEdge, s: number): [number, number] => { const p = along(e.pts, e.cum, s); return [p.x, p.z]; };
/** A string of lanterns sagging across a night street at arc `s`, house front to house front, red and pink. */
function lanternString(k: DistrictKit, e: RoadEdge, s: number) {
  const p = along(e.pts, e.cum, s), rx = -p.hz, rz = p.hx, w = e.half + e.sidewalk - 0.3, y0 = 5.4;
  k.cable(p.x - rx * w, y0 + 0.15, p.z - rz * w, p.x + rx * w, y0 + 0.15, p.z + rz * w, 0.6, 0.02, '#2a2226', false);
  const n = Math.max(4, Math.floor((2 * w) / 1.2));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = p.x + rx * w * (2 * t - 1), z = p.z + rz * w * (2 * t - 1), y = y0 - Math.sin(t * PI) * 0.6;
    k.shape('ball', i % 2 ? '#ff4f8b' : '#d8402c', x, y, z, 0.2, 0.26, 0.2, 0, 0, false, 'lantern');
  }
  // Their red glow on the street below (with the lamps).
  k.pool(p.x, p.z, 7.5, -1, '#ff9a78', 0.55);
}
/** A walking street's gateway: two posts behind the curbs, a beam across with its name both ways, framed in neon. */
function neonArch(k: DistrictKit, a: { ax: number; az: number; bx: number; bz: number; text: string; sub: string }) {
  const len = hyp(a.bx - a.ax, a.bz - a.az), ux = (a.bx - a.ax) / len, uz = (a.bz - a.az) / len, mx = (a.ax + a.bx) / 2, mz = (a.az + a.bz) / 2;
  // The beam runs across the street; its faces look along it (both ways).
  const yaw = Math.atan2(-uz, ux), face = Math.atan2(uz, -ux), H = 5.6;
  for (const [x, z] of [[a.ax, a.az], [a.bx, a.bz]]) {
    k.lift(districtLift(x, z));
    k.shape('cylinder', '#2b1f2a', x, H / 2, z, 0.16, H, 0.16, 0, 0, true);
    k.box('#ff3d7f', x, H / 2, z, 0.06, H - 0.6, 0.36, yaw, false, 'neon');
    k.lift(0);
  }
  k.box('#22121c', mx, H, mz, len + 0.4, 1.3, 0.3, yaw, true);
  const w = Math.min(len - 0.8, 9.5);
  for (const s of [-1, 1]) {
    const f = s > 0 ? face : face + PI, ox = Math.sin(f) * 0.17, oz = Math.cos(f) * 0.17;
    k.sign(a.text, a.sub, '#ff4f8b', mx + ox, H, mz + oz, w, 1.15, f, '#1a0b16');
    neonFrame(k, mx + ox, H, mz + oz, w, 1.15, f, s > 0 ? '#3dd6ff' : '#ffc23d');
  }
  for (let t = 0.6; t < len - 0.5; t += 1.1) k.shape('ball', '#d8402c', a.ax + ux * t, H - 0.95, a.az + uz * t, 0.2, 0.26, 0.2, 0, 0, false, 'lantern');
}
/** A market stall (sạp): a platform with goods on nia baskets under a striped tarp on four poles. */
function stall(k: DistrictKit, s: { x: number; z: number; w: number; d: number; yaw: number }, night: boolean) {
  const F = k.frame(s.x, s.z, s.yaw), r = seeded(strHash(`${s.x}:${s.z}`)), tarp = pickOf(r, night ? ['#c8322a', '#2f6fb5', '#d9a441', '#3d8a5a'] : ['#4f7fa8', '#d79555', '#5e927c']);
  k.lift(districtLift(s.x, s.z));
  F.part(0, 0.4, 0, s.w, 0.8, s.d, '#9c6f48');
  F.part(0, 0.82, 0, s.w + 0.1, 0.05, s.d + 0.1, '#c49a6c');
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.part(lx * (s.w / 2 - 0.05), 1.3, lz * (s.d / 2 - 0.05), 0.06, 2.6, 0.06, '#8d7458', 'solid', false);
  for (let i = 0; i < 4; i++) F.part(-s.w / 2 + (i + 0.5) * (s.w / 4), 2.6, 0, s.w / 4, 0.06, s.d + 0.6, i % 2 ? '#efdeb9' : tarp, 'solid', false);
  const goods = night ? ['#e8c84a', '#c8553d', '#86a169', '#f4f1e6', '#7a5a48'] : ['#c8553d', '#86a169', '#e4ad58', '#c9d6dc'];
  for (let i = 0; i < 4; i++) {
    const lx = -s.w / 2 + 0.4 + i * ((s.w - 0.8) / 3);
    F.solid('cylinder', lx, 0.87, 0, 0.32, 0.04, 0.32, '#b8925a', 0, false);
    F.solid('ball', lx, 0.98, 0, 0.26, 0.16, 0.26, pickOf(r, goods), 0, false);
  }
  if (night) {
    // Bare bulbs along the tarp's front edge and one hanging over the goods (lit by the market's hours: the scope).
    for (let i = 0; i < 6; i++) F.solid('ball', -s.w / 2 + 0.25 + (i * (s.w - 0.5)) / 5, 2.52, s.d / 2 + 0.25, 0.055, 0.07, 0.055, TONES.bulb.head, 0, false, 0, 'lamp');
    F.part(0, 2.45, 0, 0.02, 0.24, 0.02, '#2a2a2a', 'solid', false);
    F.solid('ball', 0, 2.3, 0, 0.065, 0.08, 0.065, TONES.bulb.head, 0, false, 0, 'lamp');
    const lift = districtLift(s.x, s.z);
    k.light('bulb', s.x, s.z, 2.3 + lift, 4.5 / TONES.bulb.size);
  }
  k.lift(0);
}
/** A book kiosk on the book street: a counter with spines on shelves under a little roof. */
function bookstall(k: DistrictKit, s: { x: number; z: number; w: number; d: number; yaw: number }) {
  const F = k.frame(s.x, s.z, s.yaw), r = seeded(strHash(`book:${s.x}:${s.z}`));
  k.lift(districtLift(s.x, s.z));
  F.part(0, 1.1, -s.d / 2 + 0.2, s.w, 2.2, 0.4, '#6b4a3a');
  F.part(0, 0.45, 0.1, s.w, 0.9, s.d - 0.6, '#7a5a48');
  for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) F.part(-s.w / 2 + 0.2 + i * ((s.w - 0.4) / 8), 0.7 + row * 0.5, -s.d / 2 + 0.43, 0.22, 0.38, 0.06, pickOf(r, ['#c8322a', '#2f6fb5', '#d9a441', '#3d8a5a', '#f4f1e6', '#7d5ba6']), 'solid', false);
  F.part(0, 2.35, 0, s.w + 0.3, 0.1, s.d + 0.3, '#2f5d8a');
  k.lift(0);
}
/** A walking-street stool table: a low table with its long side along the street, three stools. */
function seatSet(k: DistrictKit, t: { x: number; z: number; yaw: number; stools: number }) {
  const F = k.frame(t.x, t.z, t.yaw), r = seeded(strHash(`bv:${t.x}:${t.z}`)), color = pickOf(r, ['#cf6251', '#3f7fbf', '#e0b030', '#5e927c']);
  F.part(0, 0.6, 0, 0.8, 0.04, 0.6, '#e8e2d0');
  for (const [lx, lz] of [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]]) F.part(lx, 0.29, lz, 0.04, 0.58, 0.04, '#8a8f92', 'solid', false);
  for (const [lx, lz] of [[-0.85, 0], [0.85, 0], [0, 0.75]]) { const p = F.at(lx, lz); k.stool(p.x, p.z, color); }
  k.seat(t.x, t.z, 0.8, 0.6, t.yaw, 0.62);
  for (const lx of [-0.2, 0.15]) F.solid('cylinder', lx, 0.68, 0, 0.05, 0.14, 0.05, '#e8c84a', 0, false);
}
/** A closure barrier across a street: striped boards on feet, a sign over the middle. */
function barrier(k: DistrictKit, ax: number, az: number, bx: number, bz: number, text: string) {
  const len = hyp(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, yaw = Math.atan2(-uz, ux);
  const n = Math.max(1, Math.round(len / 2.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * (len / n), x = ax + ux * t, z = az + uz * t;
    k.box(i % 2 ? '#f4f1e6' : '#c8322a', x, 0.9, z, len / n - 0.2, 0.25, 0.06, yaw, false);
    k.box(i % 2 ? '#c8322a' : '#f4f1e6', x, 0.5, z, len / n - 0.2, 0.2, 0.06, yaw, false);
    k.box('#3b3f42', x - ux * (len / n / 2 - 0.2), 0.05, z - uz * (len / n / 2 - 0.2), 0.5, 0.1, 0.6, yaw, false);
    k.box('#3b3f42', x - ux * (len / n / 2 - 0.2), 0.55, z - uz * (len / n / 2 - 0.2), 0.06, 1.1, 0.06, yaw, false);
  }
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (const s of [-1, 1]) k.shape('cylinder', '#5f6a68', mx + ux * s * 1.6, 1.25, mz + uz * s * 1.6, 0.05, 2.5, 0.05, 0, 0, false);
  k.sign(text, 'XE CỘ KHÔNG ĐƯỢC VÀO', '#c8322a', mx, 2.3, mz, 3.2, 0.7, yaw, '#fff6e0');
}

// ---------------------------------------------------------------------------------------------------------------
// Roads: junction corners, edges, zebras, signals
// ---------------------------------------------------------------------------------------------------------------

type Arm = { edge: RoadEdge; end: 0 | 1; hx: number; hz: number; half: number; walk: number; hem: boolean; angle: number };
/** Where each edge's sidewalk strips start, per edge end and side ('<edge>:<end>:<side>', side +1 the edge's right). */
type SideStart = Map<string, number>;

function armsOf(n: RoadNode): Arm[] {
  return n.arms.map((a) => {
    const e = WORLD_ROADS.edges[a.edge];
    return { edge: e, end: a.end, hx: a.hx, hz: a.hz, half: e.half, walk: e.cls === 'hem' ? 0 : e.sidewalk, hem: e.cls === 'hem', angle: a.angle };
  });
}

/**
 * Per node with a district arm: the corners between neighbouring arms (a sidewalk patch where both sidewalks meet,
 * filling round the outside of a bend) and the junction's asphalt; records where every sidewalk strip starts.
 */
function planJunctions(k: DistrictKit, add: (x: number, z: number, slice: string, signs: boolean, draw: () => void) => void): SideStart {
  const start: SideStart = new Map();
  for (const n of WORLD_ROADS.nodes) {
    const arms = armsOf(n);
    if (!arms.some((a) => isDistrictEdge(a.edge))) continue;
    const slice = EDGE_INFO[arms.find((a) => isDistrictEdge(a.edge))!.edge.id].slice;
    const legacyArm = arms.some((a) => !isDistrictEdge(a.edge));
    const m = arms.length;
    const asphalt: number[] = [];
    const patches: (() => void)[] = [];
    const y = n.arms.length ? deckLift(arms[0].edge.id, arms[0].end ? arms[0].edge.len : 0) : 0;
    for (let i = 0; i < m && m >= 2; i++) {
      const a = arms[i], b = arms[(i + 1) % m];
      // Clockwise on the map (north up) from a to b: b is on a's right.
      const theta = (((b.angle - a.angle) % (2 * PI)) + 2 * PI) % (2 * PI);
      // a's right (-hz, hx), b's left (hz, -hx).
      const arx = -a.hz, arz = a.hx, blx = b.hz, blz = -b.hx;
      const reach = 2.5 * Math.max(a.half + a.walk, b.half + b.walk);
      const tCa = meet(n.x + arx * a.half, n.z + arz * a.half, a.hx, a.hz, n.x + blx * b.half, n.z + blz * b.half, b.hx, b.hz);
      const tCb = meet(n.x + blx * b.half, n.z + blz * b.half, b.hx, b.hz, n.x + arx * a.half, n.z + arz * a.half, a.hx, a.hz);
      const convex = theta < PI - 0.12 && tCa > -0.01 && tCb > -0.01 && tCa < reach && tCb < reach;
      const keyA = `${a.edge.id}:${a.end}:${a.end === 0 ? 1 : -1}`, keyB = `${b.edge.id}:${b.end}:${b.end === 0 ? -1 : 1}`;
      if (convex) {
        const pc = { x: n.x + arx * a.half + a.hx * tCa, z: n.z + arz * a.half + a.hz * tCa };
        asphalt.push(pc.x, pc.z);
        const fa = a.half + a.walk, fb = b.half + b.walk;
        const tFa = meet(n.x + arx * fa, n.z + arz * fa, a.hx, a.hz, n.x + blx * fb, n.z + blz * fb, b.hx, b.hz);
        const tFb = meet(n.x + blx * fb, n.z + blz * fb, b.hx, b.hz, n.x + arx * fa, n.z + arz * fa, a.hx, a.hz);
        const sa = Math.max(tCa, Number.isNaN(tFa) ? tCa : tFa, 0), sb = Math.max(tCb, Number.isNaN(tFb) ? tCb : tFb, 0);
        start.set(keyA, sa); start.set(keyB, sb);
        if (a.walk > 0 || b.walk > 0) {
          const pf = Number.isNaN(tFa) ? null : { x: n.x + arx * fa + a.hx * tFa, z: n.z + arz * fa + a.hz * tFa };
          const ac = { x: n.x + arx * a.half + a.hx * sa, z: n.z + arz * a.half + a.hz * sa }, af = { x: n.x + arx * fa + a.hx * sa, z: n.z + arz * fa + a.hz * sa };
          const bc = { x: n.x + blx * b.half + b.hx * sb, z: n.z + blz * b.half + b.hz * sb }, bf = { x: n.x + blx * fb + b.hx * sb, z: n.z + blz * fb + b.hz * sb };
          const granite = GRANITE.has(slice);
          patches.push(() => cornerPatch(k, pc, ac, af, pf, bf, bc, y, granite, n.x, n.z, a, b));
        }
      } else {
        start.set(keyA, 0); start.set(keyB, 0);
        const ac = { x: n.x + arx * a.half, z: n.z + arz * a.half }, bc = { x: n.x + blx * b.half, z: n.z + blz * b.half };
        asphalt.push(ac.x, ac.z);
        if (theta > PI + 0.05) {
          // Round the outside of a bend: an arc of asphalt and one of sidewalk.
          const a0 = Math.atan2(arz, arx), steps = Math.max(2, Math.ceil((theta - PI) / 0.25));
          let a1 = Math.atan2(blz, blx);
          while (a1 > a0) a1 -= 2 * PI;
          for (let s = 1; s < steps; s++) { const t = s / steps, ang = a0 + (a1 - a0) * t, r = a.half + (b.half - a.half) * t; asphalt.push(n.x + Math.cos(ang) * r, n.z + Math.sin(ang) * r); }
          if (a.walk > 0 || b.walk > 0) patches.push(() => wedge(k, n.x, n.z, a0, a1, a.half, a.half + a.walk, b.half, b.half + b.walk, y, GRANITE.has(slice)));
        }
        asphalt.push(bc.x, bc.z);
      }
    }
    if (legacyArm && m <= 2) continue;
    const hemOnly = arms.every((a) => a.hem);
    add(n.x, n.z, slice, false, () => {
      if (m >= 2 && asphalt.length >= 6) {
        const ring = asphalt;
        for (let i = 0; i < ring.length; i += 2) {
          const j = (i + 2) % ring.length;
          k.surf.tri('ground', hemOnly ? HEM : ASPHALT, [n.x, Y_ROAD + y, n.z], [ring[i], Y_ROAD + y, ring[i + 1]], [ring[j], Y_ROAD + y, ring[j + 1]]);
        }
      }
      for (const p of patches) p();
    });
  }
  return start;
}

/** A sidewalk corner between two arms: paving over the shared square, kerb faces along both curbs, frontage faces. */
function cornerPatch(k: DistrictKit, pc: P2, ac: P2, af: P2, pf: P2 | null, bf: P2, bc: P2, y: number, granite: boolean, nx: number, nz: number, a: Arm, b: Arm) {
  const top = Y_WALK + y, color = granite ? '#c4beb2' : '#c49a80';
  const poly = [pc, ac, af, ...(pf ? [pf] : []), bf, bc];
  for (let i = 1; i + 1 < poly.length; i++) k.surf.tri('paving', color, [pc.x, top, pc.z], [poly[i].x, top, poly[i].z], [poly[i + 1].x, top, poly[i + 1].z]);
  // Kerb faces toward the roads (the node's side), the frontage away from them.
  if (a.walk > 0) wallFace(k.surf, 'solid', KERB, pc.x, pc.z, ac.x, ac.z, Y_ROAD + y, top, nx, nz, true);
  if (b.walk > 0) wallFace(k.surf, 'solid', KERB, pc.x, pc.z, bc.x, bc.z, Y_ROAD + y, top, nx, nz, true);
  if (pf) { wallFace(k.surf, 'paving', color, af.x, af.z, pf.x, pf.z, Y_GROUND, top, nx, nz); wallFace(k.surf, 'paving', color, pf.x, pf.z, bf.x, bf.z, Y_GROUND, top, nx, nz); }
}
type P2 = { x: number; z: number };
/** An annular sector of sidewalk round the outside of a bend, from angle a0 to a1 (radians, x/z plane). */
function wedge(k: DistrictKit, x: number, z: number, a0: number, a1: number, r0a: number, r1a: number, r0b: number, r1b: number, y: number, granite: boolean) {
  const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.2)), top = Y_WALK + y, color = granite ? '#c4beb2' : '#c49a80';
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps, t1 = (s + 1) / steps, g0 = a0 + (a1 - a0) * t0, g1 = a0 + (a1 - a0) * t1;
    const i0 = r0a + (r0b - r0a) * t0, o0 = r1a + (r1b - r1a) * t0, i1 = r0a + (r0b - r0a) * t1, o1 = r1a + (r1b - r1a) * t1;
    k.surf.quad('paving', color, [x + Math.cos(g0) * i0, top, z + Math.sin(g0) * i0], [x + Math.cos(g0) * o0, top, z + Math.sin(g0) * o0], [x + Math.cos(g1) * o1, top, z + Math.sin(g1) * o1], [x + Math.cos(g1) * i1, top, z + Math.sin(g1) * i1]);
    k.surf.quad('solid', KERB, [x + Math.cos(g0) * i0, Y_ROAD + y, z + Math.sin(g0) * i0], [x + Math.cos(g1) * i1, Y_ROAD + y, z + Math.sin(g1) * i1], [x + Math.cos(g1) * i1, top, z + Math.sin(g1) * i1], [x + Math.cos(g0) * i0, top, z + Math.sin(g0) * i0]);
  }
}
/** A vertical face from (ax, az) to (bx, bz), y0..y1, facing away from (fx, fz) (or towards it with `toward`). */
function wallFace(surf: Surf, role: SurfRole, color: ColorLike, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, fx: number, fz: number, toward = false) {
  // Wind it so it faces the side of (fx, fz) the caller wants: tri() takes the normal from the winding.
  const side = (bx - ax) * (fz - az) - (bz - az) * (fx - ax);
  const flip = toward ? side < 0 : side > 0;
  if (flip) surf.quad(role, color, [bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz]);
  else surf.quad(role, color, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]);
}

/** One stretch [s0, s1] of a district edge: asphalt (or hẻm concrete), kerbs, sidewalks, markings, bays. */
function drawEdge(k: DistrictKit, e: RoadEdge, s0: number, s1: number, start: SideStart) {
  const { surf } = k, hem = e.cls === 'hem', info = EDGE_INFO[e.id], granite = GRANITE.has(info.slice);
  // A hẻm stops at the curb of the street it opens onto (the street's asphalt is the junction's).
  const trimA = hem ? mouthTrim(e, 0) : 0, trimB = hem ? mouthTrim(e, 1) : 0;
  const a0 = Math.max(s0, trimA), a1 = Math.min(s1, e.len - trimB);
  const decked = DECKS.has(e.id), step = decked ? 2 : 0;
  const yAt = (s: number) => deckLift(e.id, s);
  if (a1 - a0 > 0.05) ribbon(surf, 'ground', hem ? HEM : ASPHALT, e, a0, a1, -e.half, e.half, (s) => Y_ROAD + yAt(s) + (hem ? 0.004 : 0), step);
  if (!hem && e.sidewalk > 0) {
    for (const side of [1, -1] as const) {
      const lo = Math.max(s0, start.get(`${e.id}:0:${side}`) ?? 0), hi = Math.min(s1, e.len - (start.get(`${e.id}:1:${side}`) ?? 0));
      if (hi - lo < 0.05) continue;
      const o0 = side * e.half, o1 = side * (e.half + 0.3), o2 = side * (e.half + e.sidewalk);
      ribbon(surf, 'solid', KERB, e, lo, hi, Math.min(o0, o1), Math.max(o0, o1), (s) => Y_KERB + yAt(s), step);
      ribbon(surf, 'paving', granite ? '#c4beb2' : vary('#c49a80', strHash(`${e.id}:${side}`)), e, lo, hi, Math.min(o1, o2), Math.max(o1, o2), (s) => Y_WALK + yAt(s), step);
      edgeWall(surf, 'solid', KERB, e, lo, hi, o0, (s) => Y_ROAD + yAt(s), (s) => Y_KERB + yAt(s), side === 1 ? -1 : 1, step);
      edgeWall(surf, 'paving', granite ? '#bdb6a8' : '#b98f76', e, lo, hi, o2, () => Y_GROUND, (s) => Y_WALK + yAt(s), side, step);
    }
  }
  if (!hem && e.traffic) markings(surf, e, Math.max(s0, 0), Math.min(s1, e.len), yAt);
  for (const b of e.bays) {
    const lo = Math.max(s0, b.s0), hi = Math.min(s1, b.s1);
    if (hi - lo < 1 || b.kind === 'moto') continue;
    const off = b.side * (e.half - b.depth), color = b.kind === 'loading' || b.kind === 'bus' ? '#e8c84a' : WHITE_LINE;
    ribbon(surf, 'ground', color, e, lo, hi, off - 0.06, off + 0.06, (s) => Y_ROAD + 0.006 + yAt(s), step);
  }
}
/** How far a hẻm's concrete stays off the node at its end `end`: the half-width of the widest street there. */
function mouthTrim(e: RoadEdge, end: 0 | 1) {
  const n = WORLD_ROADS.nodes[end ? e.b : e.a];
  let t = 0;
  for (const a of n.arms) { const o = WORLD_ROADS.edges[a.edge]; if (o.id !== e.id && o.cls !== 'hem') t = Math.max(t, o.half); }
  return t;
}
/** A ribbon along edge e between arc lengths s0..s1 and lateral offsets o0 < o1 (right of a→b positive). */
function ribbon(surf: Surf, role: SurfRole, color: ColorLike, e: RoadEdge, s0: number, s1: number, o0: number, o1: number, y: (s: number) => number, step = 0) {
  const st = stations(e.pts, e.cum, s0, s1, step);
  for (let i = 0; i + 1 < st.length; i++) {
    const p = st[i], q = st[i + 1], yp = y(p.s), yq = y(q.s);
    surf.quad(role, color,
      [p.x + p.rx * o0 * p.m, yp, p.z + p.rz * o0 * p.m], [p.x + p.rx * o1 * p.m, yp, p.z + p.rz * o1 * p.m],
      [q.x + q.rx * o1 * q.m, yq, q.z + q.rz * o1 * q.m], [q.x + q.rx * o0 * q.m, yq, q.z + q.rz * o0 * q.m]);
  }
}
/** A vertical strip along edge e at lateral offset `off`, from y0(s) up to y1(s), facing `face` (+1 the edge's right). */
function edgeWall(surf: Surf, role: SurfRole, color: ColorLike, e: RoadEdge, s0: number, s1: number, off: number, y0: (s: number) => number, y1: (s: number) => number, face: 1 | -1, step = 0) {
  const st = stations(e.pts, e.cum, s0, s1, step);
  for (let i = 0; i + 1 < st.length; i++) {
    const p = st[i], q = st[i + 1];
    const ax = p.x + p.rx * off * p.m, az = p.z + p.rz * off * p.m, bx = q.x + q.rx * off * q.m, bz = q.z + q.rz * off * q.m;
    const fx = (ax + bx) / 2 + p.rx * face, fz = (az + bz) / 2 + p.rz * face;
    const side = (bx - ax) * (fz - az) - (bz - az) * (fx - ax);
    // Wound so its normal points to the `face` side.
    if (side > 0) surf.quad(role, color, [ax, y0(p.s), az], [bx, y0(q.s), bz], [bx, y1(q.s), bz], [ax, y1(p.s), az]);
    else surf.quad(role, color, [bx, y0(q.s), bz], [ax, y0(p.s), az], [ax, y1(p.s), az], [bx, y1(q.s), bz]);
  }
}
/** Centre dashes (two-way streets), lane lines on boulevards, the moto-lane line, kept off the junctions. */
function markings(surf: Surf, e: RoadEdge, s0: number, s1: number, yAt: (s: number) => number) {
  const na = WORLD_ROADS.nodes[e.a], nb = WORLD_ROADS.nodes[e.b];
  const clearA = na.arms.length > 2 ? na.radius + 3 : 0, clearB = nb.arms.length > 2 ? nb.radius + 3 : 0;
  const lo = Math.max(s0, clearA), hi = Math.min(s1, e.len - clearB);
  if (hi - lo < 3) return;
  const twoWay = e.fwd.length > 0 && e.back.length > 0;
  const dash = (off: number, color: string, len: number, gap: number, w: number) => {
    for (let s = Math.ceil(lo / gap) * gap; s + len <= hi; s += gap) {
      const a = along(e.pts, e.cum, s), b = along(e.pts, e.cum, s + len), rx = -a.hz, rz = a.hx, ya = Y_ROAD + 0.005 + yAt(s), yb = Y_ROAD + 0.005 + yAt(s + len);
      surf.quad('ground', color, [a.x + rx * (off - w), ya, a.z + rz * (off - w)], [a.x + rx * (off + w), ya, a.z + rz * (off + w)], [b.x + rx * (off + w), yb, b.z + rz * (off + w)], [b.x + rx * (off - w), yb, b.z + rz * (off - w)]);
    }
  };
  if (twoWay) dash(0, MARK, 3.2, 9, 0.085);
  for (const lanes of [e.fwd, e.back]) {
    const cars = lanes.filter((l) => l.use === 'car').sort((p, q) => p.off - q.off), moto = lanes.find((l) => l.use === 'moto');
    const sign = lanes === e.fwd ? 1 : -1;
    for (let i = 0; i + 1 < cars.length; i++) dash(sign * (cars[i].off + cars[i].w / 2), WHITE_LINE, 3, 9, 0.06);
    if (moto && cars.length && e.half >= 6) dash(sign * (moto.off - moto.w / 2), WHITE_LINE, 6, 6.05, 0.05);
  }
}
/** Zebra stripes along a crosswalk (0.7 m stripes every 1.375 m, 2.6 m long along the road). */
function zebra(surf: Surf, ax: number, az: number, bx: number, bz: number, lift: number) {
  const len = hyp(bx - ax, bz - az);
  if (len < 1) return;
  const ux = (bx - ax) / len, uz = (bz - az) / len, vx = -uz, vz = ux, y = Y_ROAD + 0.006 + lift;
  for (let t = 0.9; t < len - 0.5; t += 1.375) {
    const cx = ax + ux * t, cz = az + uz * t;
    surf.quad('ground', ZEBRA, [cx - ux * 0.35 - vx * 1.3, y, cz - uz * 0.35 - vz * 1.3], [cx + ux * 0.35 - vx * 1.3, y, cz + uz * 0.35 - vz * 1.3], [cx + ux * 0.35 + vx * 1.3, y, cz + uz * 0.35 + vz * 1.3], [cx - ux * 0.35 + vx * 1.3, y, cz - uz * 0.35 + vz * 1.3]);
  }
}
/** A signal pole at a district approach: arm over the lanes, two heads facing the arriving traffic, the street's name plate. */
function signal(k: DistrictKit, a: RoadApproach, e: RoadEdge) {
  const hx = a.hx, hz = a.hz, rx = -hz, rz = hx;
  const yaw = Math.atan2(-hx, -hz);
  const base = districtLift(a.pole.x, a.pole.z);
  k.lift(base);
  k.shape('cylinder', '#4a5458', a.pole.x, 3.1, a.pole.z, 0.11, 6.2, 0.11);
  k.shape('cylinder', '#3d4549', a.pole.x, 0.15, a.pole.z, 0.2, 0.3, 0.2);
  // The arm reaches back over the lanes to 2.4 m right of the centre line (the pole stands half + 0.7 out).
  const side = e.half + 0.7, reach = side - Math.min(2.4, e.half * 0.4);
  const ex = a.pole.x - rx * reach, ez = a.pole.z - rz * reach;
  k.box('#4a5458', (a.pole.x + ex) / 2, 6.0, (a.pole.z + ez) / 2, 0.12, 0.12, reach, Math.atan2(rx, rz), false);
  const heads = [{ x: a.pole.x - rx * (reach + 0.6), y: 5.25, z: a.pole.z - rz * (reach + 0.6) }, { x: a.pole.x - hx * 0.25, y: 2.9, z: a.pole.z - hz * 0.25 }];
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (const h of heads) {
    k.box('#1f2326', h.x, h.y, h.z, 0.44, 1.18, 0.3, yaw, false);
    k.box('#e9c84a', h.x - fx * 0.03, h.y, h.z - fz * 0.03, 0.56, 1.3, 0.04, yaw, false);
    for (let s = 0; s < 3; s++) {
      const ly = h.y + 0.37 - s * 0.37;
      k.box('#15181a', h.x + fx * 0.22, ly + 0.14, h.z + fz * 0.22, 0.34, 0.04, 0.16, yaw, false);
      k.lens(a, s, h.x + fx * 0.16, ly + base, h.z + fz * 0.16, yaw);
    }
  }
  // The name of the street this pole stands on.
  // On a bracket out along the street (its face across it), readable from both sides.
  const across = Math.atan2(rx, rz);
  k.box('#4a5458', a.pole.x - hx * 0.4, 3.62, a.pole.z - hz * 0.4, 0.04, 0.04, 0.8, Math.atan2(hx, hz), false);
  k.tag('plate', shortName(e.name), '#ffffff', '#1d4f9c', a.pole.x - hx * 0.78, 3.4 + base, a.pole.z - hz * 0.78, 1.5, 0.32, across, 0.25);
  k.lift(0);
}
const shortName = (name: string) => name.replace(/^(ĐƯỜNG|ĐẠI LỘ)\s+/, '');

// ---------------------------------------------------------------------------------------------------------------
// Water: banks and bridges
// ---------------------------------------------------------------------------------------------------------------

/** Whether (x, z) is land a bank wall stands on: wired district land or today's, and not another waterway. */
function landAt(x: number, z: number, water: string) {
  const onLand = (x >= LAND.minX && x <= LAND.maxX && z >= -137.6 && z <= LAND.maxZ) || !!sliceAt(x, z);
  if (!onLand) return false;
  for (const w of DISTRICT_WATERS) if (w.id !== water && inPoly(w.poly, x, z)) return false;
  for (const w of WATERS) if (w.id !== water && inPoly(w.poly, x, z)) return false;
  return true;
}
/** A bank along a waterline (n: unit normal out over the water): the wall down to the bed, and its railing or quay edge. */
function bank(k: DistrictKit, ax: number, az: number, bx: number, bz: number, nx: number, nz: number, kind: string) {
  const len = hyp(bx - ax, bz - az);
  if (len < 0.1) return;
  const top = Y_ROAD + 0.02;
  // The wall's face, from the bed up to the street, facing the water; a coping strip on top.
  wallFace(k.surf, 'wall', BANK, ax, az, bx, bz, RIVER_BED, top, (ax + bx) / 2 + nx, (az + bz) / 2 + nz, true);
  const cx = -nx * 0.3, cz = -nz * 0.3;
  k.surf.quad('solid', '#cfc6b2', [ax, top + 0.06, az], [bx, top + 0.06, bz], [bx + cx, top + 0.06, bz + cz], [ax + cx, top + 0.06, az + cz]);
  const yaw = Math.atan2(bz - az, bx - ax), ux = (bx - ax) / len, uz = (bz - az) / len;
  if (kind === 'wharf') {
    // A quay edge: black and yellow kerb blocks; the bollards are the layout's fixtures.
    for (let t = 0.5; t < len; t += 2) k.box(t % 4 < 2 ? '#2b2b2b' : '#e8c03a', ax + ux * t - nx * 0.25, top + 0.12, az + uz * t - nz * 0.25, 1.9, 0.18, 0.35, -yaw, false);
    return;
  }
  // Kè and promenade: a railing on top, its posts every 2.5 m.
  const rx = ax - nx * 0.25, rz = az - nz * 0.25;
  k.box(RAIL, rx + ux * len / 2, 0.55, rz + uz * len / 2, len, 0.1, 0.16, -yaw, false);
  k.box(RAIL, rx + ux * len / 2, 1.05, rz + uz * len / 2, len, 0.1, 0.14, -yaw, false);
  for (let t = 0; t <= len; t += 2.5) k.box('#d6c4a1', rx + ux * t, 0.55, rz + uz * t, 0.14, 1.0, 0.14, -yaw, false);
  // Globe lamps along the promenade every 18 m, 1.2 m inland of the railing (unless a street lamp of the layout stands
  // near), their pools further in, on the land (night plan A7).
  for (let t = Math.min(9, len / 2); t < len; t += 18) {
    const x = ax + ux * t - nx * 1.45, z = az + uz * t - nz * 1.45;
    if (lampNear(x, z, 12)) continue;
    k.shape('cylinder', '#3f5a52', x, 1.9, z, 0.07, 3.8, 0.07);
    k.shape('cylinder', '#3f5a52', x, 0.15, z, 0.2, 0.3, 0.2);
    k.shape('cone', '#3f5a52', x, 4.38, z, 0.36, 0.25, 0.36);
    k.lit(lampSeed(x, z), () => {
      k.shape('ball', TONES.park.head, x, HEAD.post, z, 0.32, 0.36, 0.32, 0, 0, false, 'lamp');
      k.light('park', x, z, HEAD.post, 1, 0);
      k.light('park', ax + ux * t - nx * 3.6, az + uz * t - nz * 3.6, 0, 7 / TONES.park.size);
    });
  }
}
/** Layout lamps (DISTRICT_SCENERY.lamps) in 16 m cells, for the promenade posts to keep their distance from. */
let lampCells: Map<string, { x: number; z: number }[]> | null = null;
function lampNear(x: number, z: number, r: number) {
  if (!lampCells) {
    lampCells = new Map();
    for (const l of DISTRICT_SCENERY.lamps) { const key = `${Math.floor(l.x / 16)}:${Math.floor(l.z / 16)}`, list = lampCells.get(key); if (list) list.push(l); else lampCells.set(key, [l]); }
  }
  for (let i = Math.floor((x - r) / 16); i <= Math.floor((x + r) / 16); i++) for (let j = Math.floor((z - r) / 16); j <= Math.floor((z + r) / 16); j++) {
    for (const l of lampCells.get(`${i}:${j}`) ?? []) if (hyp(l.x - x, l.z - z) < r) return true;
  }
  return false;
}
/** A bridge deck's body over the water: girders under both edges, piers every 12 m down to the bed, railings. */
/** A straight member from a to b (a box along it, `t` thick): truss chords, posts, braces. */
function strut(k: DistrictKit, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: string) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, run = hyp(dx, dz), len = Math.sqrt(run * run + dy * dy);
  if (len < 1e-3) return;
  // (a box long along its own x: yawed so x runs along the member's plan, then pitched up by its rise)
  k.shape('box', color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, len, t, t, run > 1e-6 ? Math.atan2(-dz, dx) : 0, Math.atan2(dy, run || 1e-6), false);
}
function bridge(k: DistrictKit, e: RoadEdge, d: DeckOn) {
  const s0 = d.from + d.s0, s1 = d.from + d.s1, half = e.half + e.sidewalk;
  const st = stations(e.pts, e.cum, d.from, d.from + d.len, 2);
  // Cầu Mống: the 1890s steel footbridge, its bowstring trusses arching over the canal either side ("mống": rainbow).
  const mong = d.name === 'CẦU MỐNG', STEEL = '#55605f', fascia = mong ? '#5e6a68' : '#c8c0ae';
  if (mong) {
    const span = s1 - s0, rise = 3.1, n = Math.max(4, Math.round(span / 2.5));
    for (const side of [1, -1]) {
      let last: { x: number; z: number; yb: number; yt: number } | null = null;
      for (let i = 0; i <= n; i++) {
        const s = s0 + (span * i) / n, p = along(e.pts, e.cum, s), ox = -p.hz * side * (half + 0.12), oz = p.hx * side * (half + 0.12);
        const x = p.x + ox, z = p.z + oz, yb = Y_ROAD + deckLift(e.id, s) + 0.15, yt = yb + 0.9 + rise * Math.sin((PI * i) / n);
        strut(k, x, yb, z, x, yt, z, 0.12, STEEL);
        if (last) {
          strut(k, last.x, last.yt, last.z, x, yt, z, 0.22, STEEL);
          strut(k, last.x, last.yb, last.z, x, yb, z, 0.18, STEEL);
          // Braces leaning to mid-span.
          if (i <= n / 2) strut(k, last.x, last.yb, last.z, x, yt, z, 0.08, STEEL); else strut(k, last.x, last.yt, last.z, x, yb, z, 0.08, STEEL);
        }
        last = { x, z, yb, yt };
      }
    }
    // A few cross ties overhead at mid-span (high enough to walk under).
    for (const f of [0.35, 0.5, 0.65]) {
      const s = s0 + span * f, p = along(e.pts, e.cum, s), y = Y_ROAD + deckLift(e.id, s) + 0.15 + 0.9 + rise * Math.sin(PI * f);
      if (y > Y_ROAD + deckLift(e.id, s) + 2.6) strut(k, p.x - p.hz * (half + 0.12), y, p.z + p.hx * (half + 0.12), p.x + p.hz * (half + 0.12), y, p.z - p.hx * (half + 0.12), 0.1, STEEL);
    }
  }
  for (let i = 0; i + 1 < st.length; i++) {
    const p = st[i], q = st[i + 1], yp = Y_ROAD + deckLift(e.id, p.s), yq = Y_ROAD + deckLift(e.id, q.s);
    for (const side of [1, -1]) {
      const pxo = p.x + p.rx * side * half * p.m, pzo = p.z + p.rz * side * half * p.m, qxo = q.x + q.rx * side * half * q.m, qzo = q.z + q.rz * side * half * q.m;
      // Fascia: from the walking surface down 0.9 m (only over the water and the ramps, where it shows).
      k.surf.quad('wall', fascia, [pxo, yp - 0.9, pzo], [qxo, yq - 0.9, qzo], [qxo, yq + CURB_HEIGHT, qzo], [pxo, yp + CURB_HEIGHT, pzo]);
      k.surf.quad('wall', fascia, [qxo, yq - 0.9, qzo], [pxo, yp - 0.9, pzo], [pxo, yp + CURB_HEIGHT, pzo], [qxo, yq + CURB_HEIGHT, qzo]);
      // Railing on the outer edge.
      const mx = (pxo + qxo) / 2 - p.rx * side * 0.12, mz = (pzo + qzo) / 2 - p.rz * side * 0.12, len = hyp(qxo - pxo, qzo - pzo), yaw = Math.atan2(qxo - pxo, qzo - pzo);
      k.box('#5d6b6e', mx, (yp + yq) / 2 + CURB_HEIGHT + 1.05, mz, 0.1, 0.1, len, yaw, false);
      k.box('#5d6b6e', mx, (yp + yq) / 2 + CURB_HEIGHT + 0.55, mz, 0.06, 0.06, len, yaw, false);
      k.box('#4d5a5d', pxo - p.rx * side * 0.12, yp + CURB_HEIGHT + 0.55, pzo - p.rz * side * 0.12, 0.1, 1.1, 0.1, yaw, false);
    }
    // The deck's underside.
    if (p.s >= s0 - 2 && q.s <= s1 + 2) {
      const L = (o: number, s: typeof p, y: number) => [s.x + s.rx * o * s.m, y, s.z + s.rz * o * s.m];
      k.surf.quad('solid', '#8f8a80', L(-half, q, yq - 0.9), L(half, q, yq - 0.9), L(half, p, yp - 0.9), L(-half, p, yp - 0.9), 'down');
    }
  }
  // LED lamp posts on the fascia every 24 m, alternating sides (outside the railing: no collider); the head on an arm
  // over the footway, its pool 2.5 m further in, so no light hangs beside the deck over the water (night plan A7).
  if (!mong) for (let s = s0 + Math.min(12, (s1 - s0) / 2), i = 0; s < s1 - 4; s += 24, i++) {
    const p = along(e.pts, e.cum, s), side = i % 2 ? 1 : -1, rx = -p.hz * side, rz = p.hx * side, yp = Y_ROAD + deckLift(e.id, s);
    const px = p.x + rx * (half + 0.05), pz = p.z + rz * (half + 0.05), top = yp + CURB_HEIGHT + 6.3;
    const hx = p.x + rx * (half - 1.35), hz = p.z + rz * (half - 1.35), yaw = Math.atan2(hx - px, hz - pz);
    k.shape('cylinder', '#586c65', px, (yp - 0.9 + top) / 2, pz, 0.075, top - (yp - 0.9), 0.075, 0, 0, false);
    k.box('#586c65', (px + hx) / 2, top - 0.05, (pz + hz) / 2, 0.13, 0.13, 1.55, yaw, false);
    k.lit(lampSeed(hx, hz), () => {
      k.box(TONES.led.head, hx, top - 0.15, hz, 0.35, 0.12, 0.65, yaw, false, 'lamp');
      k.light('led', hx, hz, top - 0.15, 1, 0);
      k.light('led', p.x + rx * (half - 3.85), p.z + rz * (half - 3.85), 0, 7.5 / TONES.led.size);
    });
  }
  // Piers in the water (the trusses of Cầu Mống span the canal on their own).
  for (let s = s0 + 6; !mong && s < s1 - 4; s += 12) {
    const p = along(e.pts, e.cum, s), yaw = Math.atan2(p.hx, p.hz);
    k.box('#a9a293', p.x, (RIVER_BED + Y_ROAD + d.y - 0.9) / 2, p.z, half * 1.6, Y_ROAD + d.y - 0.9 - RIVER_BED, 1.2, yaw, true);
  }
  k.sign(d.name, '', '#2f4f6a', ...namePlate(e, d.from + d.s0 + 1, half, d.y));
}
/** A bridge's name plate on its railing at the start of the span. */
function namePlate(e: RoadEdge, s: number, half: number, y: number): [number, number, number, number, number, number, string] {
  const p = along(e.pts, e.cum, s), rx = -p.hz, rz = p.hx;
  return [p.x + rx * (half + 0.05), Y_ROAD + y + CURB_HEIGHT + 0.8, p.z + rz * (half + 0.05), 2.6, 0.45, Math.atan2(rx, rz), '#f1ead8'];
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------------------------

/** A plot's local frame and size from its oriented box: lx along the front, lz out of it. */
function dimsOf(p: GenPlot) {
  return { x: p.box.cx, z: p.box.cz, w: p.box.hx * 2, d: p.box.hz * 2, facing: p.box.yaw };
}
const CBD = new Map<string, NonNullable<Plot['tower']>>();
const q1 = SLICE_EXTRA['quan-1-south'];
if (q1) for (const s of q1.skyline) CBD.set(s.stamp, s.tower);
/** TowerSpecs for the landmark towers whose layout gives none. */
const TOWER_OF: Record<string, NonNullable<Plot['tower']>> = {
  'thap-bo-song': { form: 'bundle', floor: 3.8, glass: '#7f9fb4', frame: '#c9d2d8', pattern: 1, crown: 'spire', podium: 14 },
};
/** The TowerSpec a district plot's tall building is drawn with (landmark(), the apartment typology), or null: none. */
export function towerSpecOf(p: GenPlot, stamp: string | null): NonNullable<Plot['tower']> | null {
  const id = stamp ?? '';
  return CBD.get(id) ?? TOWER_OF[id] ?? p.tower ?? null;
}

function building(k: DistrictKit, b: GenBuilding, p: GenPlot, stamp: string | null) {
  // Its stand-in's windows at night keep the hours of what it is (none for a warehouse, pagoda, church, market, school).
  k.lit(windowCode(b.id), () => farBuilding(k, b, p, stamp));
  switch (p.typology) {
    case 'church': k.lit(scheduleIndex(LOBBY_HOURS), () => church(k, b, p, stamp)); return;
    case 'pagoda': k.pagoda(p, b); compoundGate(k, b, p, 'pagoda'); return;
    case 'school': k.school(p, b); compoundGate(k, b, p, 'school'); return;
    case 'market-hall': k.lit(buildingLight(b.id).code, () => marketHall(k, b, p, stamp)); return;
    case 'warehouse': warehouse(k, b, p); return;
    case 'apartment': k.towers([{ plot: p, building: b }]); kiosks(k, p, sliceOfId(b.id)); return;
    case 'villa': villa(k, b, p); return;
    case 'police': k.police(p, b); return;
    case 'hospital': k.hospital(p, b); return;
    case 'landmark': k.lit(buildingLight(b.id).code, () => landmark(k, b, p, stamp)); return;
    default: k.house(p, b);
  }
}
/** The slice that built a district building (by its id range). */
const sliceOfId = (id: number) => SLICES.find((s) => id >= s.ids[0] && id < s.ids[1])?.key ?? '';

/**
 * A building's stand-in: its box (roofs as a gable or a darker cap), a church's towers; towers drawn by skyline.ts need
 * none, nor do the towers under construction (world.ts gives every building of 40 m or more a skyline stand-in).
 */
function farBuilding(k: DistrictKit, b: GenBuilding, p: GenPlot, stamp: string | null) {
  const id = stamp ?? '';
  if (p.typology === 'apartment' || CBD.has(id) || TOWER_OF[id] || (p.typology === 'landmark' && p.tower && id !== 'villa-p1') || id.startsWith('thap-doi')) return;
  const r = p.box, h = Math.max(3, Math.min(b.h, 40));
  k.far('box', b.color || '#d8cbb0', r.cx, h / 2, r.cz, r.hx * 2, h, r.hz * 2, r.yaw);
  if (p.typology === 'tube' || p.typology === 'villa' || p.typology === 'shophouse') k.far('box', (p.seed % 3) === 0 ? '#b65d3d' : '#d9cfbd', r.cx, h + 0.2, r.cz, r.hx * 2 + 0.3, 0.4, r.hz * 2 + 0.3, r.yaw);
  else if (p.typology === 'church' || p.typology === 'pagoda' || p.typology === 'market-hall' || p.typology === 'warehouse') k.far('gable', p.typology === 'warehouse' ? '#8e959a' : '#9a4a33', r.cx, h + 1.6, r.cz, r.hz * 2 + 0.6, 3.2, r.hx * 2 + 0.6, r.yaw + HALF_PI);
  for (const t of towersOf(stamp)) { k.far('box', b.color || '#e8dcc4', t.x, t.h * 0.35, t.z, t.w, t.h * 0.7, t.d, r.yaw); k.far('pyramid', '#6f7a80', t.x, t.h * 0.85, t.z, t.w, t.h * 0.3, t.d, r.yaw); }
}

function landmark(k: DistrictKit, b: GenBuilding, p: GenPlot, stamp: string | null) {
  const id = stamp ?? '';
  const spec = CBD.get(id) ?? TOWER_OF[id];
  if (spec) { k.towers([{ plot: { ...p, style: 'tower', tower: spec } as GenPlot, building: b }]); return; }
  if (id === 'villa-p1' || id === 'biet-thu-hoa-su') { villa(k, b, { ...p, facade: 'colonial' }); return; }
  if (p.tower) { k.towers([{ plot: p, building: b }]); return; }
  if (id.startsWith('thap-doi')) { construction(k, b, p); return; }
  if (id === 'kho7' || id === 'factory-p1' || id === 'ben-xe-mien-dong' || id === 'sat-hach-lai-xe') { warehouse(k, b, p); return; }
  if (id === 'nha-rong' || id === 'ubnd-thanh-pho' || id === 'buu-dien-thanh-pho' || id === 'tu-vien-thu-thiem') { colonial(k, b, p, id); return; }
  if (id === 'dinh-doc-lap') { palace(k, b, p); return; }
  if (id === 'can-cau-thap') { k.box('#7d7f7a', b.x, 0.6, b.z, b.w, 1.2, b.d, b.facing, true); return; }
  if (b.w <= 10 || b.h <= 5) { pavilion(k, b, p, id); return; }
  if (b.kind === 'food' || b.kind === 'shop') { k.house({ ...p, style: 'shop' }, b); return; }
  k.office(p, b);
}

/** Towers (EXTRA.towers) on a stamp, by kind: spires, bell towers, clock towers, the bảo tháp. */
const towersOf = (stamp: string | null) => (stamp ? TOWERS.filter((t) => t.stamp === stamp && !t.on) : []);

/**
 * A church (Đức Bà, Tân Định, Xóm Chiếu, Thủ Thiêm): a nave under a steep tiled roof, aisles either side, buttresses
 * and lancet windows, a gabled front with a rose window and three doors, and its towers from EXTRA.towers (Đức Bà's
 * twin spires, the bell towers) inside its footprint.
 */
function church(k: DistrictKit, b: GenBuilding, p: GenPlot, stamp: string | null) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2;
  const brick = stamp === 'nha-tho-duc-ba', pink = stamp === 'nha-tho-tan-dinh';
  const wall = brick ? '#b5553c' : pink ? '#e9a7ad' : b.color || '#efe4cf', trim = brick ? '#e8dcc4' : '#f6efe2', roof = brick ? '#6f7a80' : '#9a4a33';
  const naveW = w * 0.5, aisleW = (w - naveW) / 2, H = Math.max(9, Math.min(b.h, 22)), aisleH = H * 0.58;
  // Plinth, aisles and nave.
  F.part(0, 0.3, 0, w + 0.6, 0.6, d + 0.6, '#cfc4ae');
  for (const s of [-1, 1]) {
    F.part(s * (naveW / 2 + aisleW / 2), aisleH / 2, -0.5, aisleW, aisleH, d - 3, wall, 'solid');
    F.solid('gable', s * (naveW / 2 + aisleW / 2), aisleH + 0.9, -0.5, d - 2.6, 1.8, aisleW + 0.5, roof, 0, true, HALF_PI, 'roofTile');
    // Buttresses and lancet windows down each side.
    for (let lz = -front + 3; lz < front - 4; lz += 4.2) {
      F.part(s * (w / 2 + 0.25), aisleH * 0.45, lz, 0.5, aisleH * 0.9, 0.7, trim);
      F.part(s * (w / 2 + 0.02), aisleH * 0.55, lz + 2.1, 0.06, aisleH * 0.5, 1.1, '#5a7e9a', 'glassLit', false);
      F.part(s * (naveW / 2 + 0.02), aisleH + (H - aisleH) * 0.5, lz + 2.1, 0.06, (H - aisleH) * 0.55, 0.9, '#5a7e9a', 'glassLit', false);
    }
  }
  F.part(0, H / 2, -0.5, naveW, H, d - 3, wall, 'solid');
  F.solid('gable', 0, H + 2.2, -0.5, d - 2.4, 4.4, naveW + 0.6, roof, 0, true, HALF_PI, 'roofTile');
  // Apse at the back.
  F.solid('cylinder', 0, H * 0.4, -front + 1.5, naveW * 0.48, H * 0.8, naveW * 0.48, wall, 0, true);
  F.solid('cone', 0, H * 0.8 + 1.6, -front + 1.5, naveW * 0.52, 3.2, naveW * 0.52, roof);
  // The gabled front: a taller screen wall with a pediment, a rose window and three arched doors.
  const fh = H + 3;
  F.part(0, fh / 2, front - 1.4, naveW + aisleW, fh, 1.2, brick ? wall : trim, 'solid');
  F.solid('gable', 0, fh + 1.6, front - 1.4, naveW + aisleW, 3.2, 1.2, brick ? wall : trim, 0, true, 0);
  F.part(0, fh, front - 0.78, naveW + aisleW + 0.2, 0.35, 0.2, trim);
  F.solid('cylinder', 0, fh + 3.8, front - 1.4, 0.12, 2.0, 0.12, '#d8c27a', 0, false);
  F.part(0, fh + 4.2, front - 1.4, 1.1, 0.12, 0.12, '#d8c27a', 'solid', false);
  F.solid('cylinder', 0, H * 0.72, front - 0.75, 1.6, 0.12, 1.6, '#3f6f9a', HALF_PI, false, HALF_PI, 'glassLit');
  F.solid('cylinder', 0, H * 0.72, front - 0.72, 1.85, 0.08, 1.85, trim, HALF_PI, false, HALF_PI);
  for (const lx of [-aisleW, 0, aisleW]) {
    const dw = lx ? 1.6 : 2.4;
    F.part(lx, 1.8, front - 0.75, dw, 3.6, 0.1, '#5b3a28');
    F.solid('cylinder', lx, 3.6, front - 0.76, dw / 2, 0.1, dw / 2, '#5b3a28', HALF_PI, false, HALF_PI);
  }
  F.part(0, 0.75, front + 1.5, naveW + aisleW, 0.3, 3, '#d9cfbb');
  // Towers inside the footprint (EXTRA.towers), else one bell tower over the front.
  const list = towersOf(stamp);
  const towers = list.length ? list : [{ kind: 'bell tower', x: F.at(0, front - 3).x, z: F.at(0, front - 3).z, w: 5, d: 5, h: H + 12 }];
  for (const t of towers) churchTower(k, t, facing, wall, trim, roof, brick);
  // The name board over the doors.
  const sp = F.at(0, front - 0.68), floodlit = stamp === 'nha-tho-duc-ba';
  nameBoard(k, floodlit, b.name, b.subtitle, brick ? '#7a2e22' : '#3f3a6a', sp.x, 5.4, sp.z, Math.min(naveW + aisleW - 1, 11), 1.1, facing, '#f6efe2');
  if (floodlit) uplights(k, F, naveW + aisleW + 6, front + 3.4, { lz: front - 0.8, w: naveW + aisleW, h: fh + 1 });
}
/**
 * Floodlights for a heritage front after dark (Đức Bà, the post office, Bến Thành's gate): a row of lamps at the foot
 * of the front, aimed up, and warm light on the paving before it (lit all night).
 */
function uplights(k: DistrictKit, F: Frame, width: number, lz: number, wash?: { lz: number; w: number; h: number; y0?: number }) {
  // Floodlights burn dusk to dawn with the street lamps, whatever the building's own hours (the lit scope it is drawn
  // in: a post office's, a market's, a church's lobby): code 0 gives the lamp boxes and their pools the lamp switch.
  k.lit(0, () => {
    // The warm light the lamps throw up the front (shows after dark only: the 'wash' role).
    if (wash) F.part(0, (wash.y0 ?? 0) + wash.h / 2, wash.lz + 0.06, wash.w, wash.h, 0.02, '#ffffff', 'wash', false);
    const n = Math.max(3, Math.round(width / 3.2));
    for (let i = 0; i < n; i++) {
      const lx = -width / 2 + (i + 0.5) * (width / n);
      F.part(lx, 0.22, lz, 0.32, 0.28, 0.32, '#3b3f42', 'solid', false);
      F.part(lx, 0.4, lz - 0.05, 0.26, 0.06, 0.2, '#fff1c8', 'lamp', false);
      if (i % 2 === 0) { const p = F.at(lx, lz + 1.2); k.pool(p.x, p.z, 4.2, -1, '#ffcf8a'); }
    }
  });
}
/**
 * A heritage front's name board: lit with its floodlights all night where the front has them (code 0: on with the
 * night), else by the building's hours like any shop board (the lit scope it is drawn in).
 */
function nameBoard(k: DistrictKit, floodlit: boolean, ...a: Parameters<DistrictKit['sign']>) {
  if (floodlit) k.lit(0, () => k.sign(...a));
  else k.sign(...a);
}
function churchTower(k: DistrictKit, t: { kind: string; x: number; z: number; w: number; d: number; h: number }, facing: number, wall: string, trim: string, roof: string, slate: boolean) {
  const spire = t.kind === 'spire';
  const shaft = spire ? t.h * 0.62 : t.h * 0.78;
  const T = k.frame(t.x, t.z, facing);
  T.part(0, shaft / 2, 0, t.w, shaft, t.d, wall, 'solid');
  // Cornices and the belfry's louvred openings.
  for (const y of [shaft * 0.35, shaft * 0.7, shaft]) T.part(0, y, 0, t.w + 0.4, 0.35, t.d + 0.4, trim);
  for (const [lx, lz, yaw] of [[0, t.d / 2 + 0.02, 0], [0, -t.d / 2 - 0.02, PI], [t.w / 2 + 0.02, 0, HALF_PI], [-t.w / 2 - 0.02, 0, -HALF_PI]] as const) {
    const p = T.at(lx, lz);
    k.box('#3a3330', p.x, shaft * 0.85, p.z, t.w * 0.45, shaft * 0.16, 0.06, facing + yaw, false);
  }
  T.solid('cylinder', 0, shaft * 0.55, t.d / 2 + 0.03, 0.9, 0.08, 0.9, '#f4f1e6', HALF_PI, false, HALF_PI);
  T.solid('cylinder', 0, shaft * 0.55, t.d / 2 + 0.08, 0.06, 0.02, 0.06, '#222222', HALF_PI, false, HALF_PI);
  if (spire) {
    T.solid('pyramid', 0, shaft + (t.h - shaft) / 2, 0, t.w * 1.05, t.h - shaft, t.d * 1.05, slate ? '#6f7a80' : roof);
  } else {
    T.solid('pyramid', 0, shaft + 2.2, 0, t.w + 0.6, 4.4, t.d + 0.6, roof);
  }
  T.solid('cylinder', 0, t.h + 1.1, 0, 0.1, 2.2, 0.1, '#d8c27a', 0, false);
  T.part(0, t.h + 1.5, 0, 1.0, 0.1, 0.1, '#d8c27a', 'solid', false);
}

/** The tam quan over a district pagoda's compound gate (between the generator's gate pillars), or a school's gate arch. */
function compoundGate(k: DistrictKit, b: GenBuilding, p: GenPlot, kind: 'pagoda' | 'school') {
  const { x, z, d, facing } = dimsOf(p);
  const f = Math.sin(facing), g = Math.cos(facing);
  // The gate pillars stand on the lot's front, in front of the building, either side of its axis.
  const pillars = DISTRICT_SCENERY.props.filter((pr) => pr.kind === 'pillar' && Math.abs((pr.x - x) * g - (pr.z - z) * f) < 7 && (pr.x - x) * f + (pr.z - z) * g > d / 2 && (pr.x - x) * f + (pr.z - z) * g < d / 2 + 40);
  if (pillars.length < 2) return;
  pillars.sort((a, c) => ((a.x - x) * g - (a.z - z) * f) - ((c.x - x) * g - (c.z - z) * f));
  const L = pillars[0], R = pillars[pillars.length - 1], cx = (L.x + R.x) / 2, cz = (L.z + R.z) / 2, span = hyp(R.x - L.x, R.z - L.z);
  if (span < 2 || span > 10) return;
  const G = k.frame(cx, cz, facing);
  if (kind === 'pagoda') {
    G.part(0, 4.15, 0, span + 1.4, 0.7, 0.6, '#e7b75f');
    G.solid('hip', 0, 5.05, 0, span + 3.4, 1.1, 2.6, '#8e4a33', 0, true, 0, 'roofTile');
    for (const s of [-1, 1]) G.solid('cone', s * (span / 2 + 1.7), 5.0, 0, 0.15, 0.5, 0.15, '#d8a531', -s * 0.7, false);
    const sp = G.at(0, 0.32);
    k.sign(b.name, b.subtitle, '#f0c75a', sp.x, 3.45, sp.z, Math.min(span + 0.4, 7), 0.9, facing, '#8e2b20');
  } else {
    G.part(0, 3.6, 0, span + 1.4, 0.6, 0.5, '#f4ecd6');
    const sp = G.at(0, 0.28);
    k.sign(b.name, b.subtitle, p.signColor, sp.x, 3.6, sp.z, Math.min(span, 9.6), 0.9, facing, '#fff8e6');
  }
}

/**
 * A chợ: a long hall under a tall pitched roof with a clerestory, a gallery round the ground floor, the market's name
 * over the main gate; Chợ Bến Thành's clock gate (EXTRA.towers) on its front.
 */
function marketHall(k: DistrictKit, b: GenBuilding, p: GenPlot, stamp: string | null) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2, H = Math.max(7, Math.min(b.h, 12));
  const wall = stamp === 'cho-ben-thanh' ? '#e9d9a8' : '#d9c39a';
  F.part(0, 0.25, 0, w + 0.4, 0.5, d + 0.4, '#c9bda5');
  F.part(0, H * 0.4, 0, w - 1.2, H * 0.8, d - 1.2, wall, 'solid');
  F.solid('gable', 0, H * 0.8 + 1.6, 0, w + 0.8, 3.2, d + 0.6, '#9a5a3c', 0, true, 0, 'roofTile');
  F.part(0, H * 0.8 + 3.6, 0, w * 0.35, 1.4, d * 0.8, '#d6c9a8');
  F.solid('gable', 0, H * 0.8 + 4.9, 0, w * 0.38, 1.4, d * 0.82, '#8e4f35', 0, true, 0, 'roofTile');
  // Gallery: pillars round the edge, an awning over the stalls.
  for (let lx = -w / 2 + 1; lx <= w / 2 - 1; lx += 3.2) for (const s of [-1, 1]) F.part(lx, 1.7, s * (front - 0.3), 0.4, 3.4, 0.4, '#efe6d0');
  for (const s of [-1, 1]) F.part(0, 3.5, s * (front + 0.6), w, 0.15, 1.8, s > 0 ? '#3f7fa8' : '#c8553d', 'solid', false);
  const gate = F.at(0, front + 0.05);
  k.box('#4a3a2a', gate.x, 1.8, gate.z, 4.2, 3.6, 0.1, facing, false);
  const sp = F.at(0, front + 0.12), floodlit = stamp === 'cho-ben-thanh';
  nameBoard(k, floodlit, b.name, b.subtitle, '#8e2b20', sp.x, Math.min(H * 0.8 - 0.8, 6), sp.z, Math.min(w - 2, 14), 1.4, facing, '#fff2c4');
  if (floodlit) uplights(k, F, Math.min(w, 24), front + 2.2, { lz: front + 0.15, w: w - 1.4, h: H * 0.8 });
  for (const t of towersOf(stamp)) {
    const T = k.frame(t.x, t.z, facing);
    T.part(0, t.h / 2, 0, t.w, t.h, t.d, '#f0e3b8', 'solid');
    T.part(0, t.h * 0.82, t.d / 2 + 0.02, 2.8, 2.8, 0.1, '#f4f1e6');
    T.solid('cylinder', 0, t.h * 0.82, t.d / 2 + 0.1, 1.2, 0.06, 1.2, '#f4f1e6', HALF_PI, false, HALF_PI);
    T.part(0, t.h * 0.82, t.d / 2 + 0.14, 0.08, 0.9, 0.04, '#222222', 'solid', false);
    T.part(0.3, t.h * 0.82, t.d / 2 + 0.14, 0.6, 0.08, 0.04, '#222222', 'solid', false);
    T.solid('hip', 0, t.h + 0.9, 0, t.w + 0.8, 1.8, t.d + 0.8, '#8e4f35', 0, true, 0, 'roofTile');
    // The south gate's arched entrances at street level (the central one under the clock, two smaller beside it),
    // pilasters up the shaft and a cornice below the clock: a solid, decorated tower, no void up its face.
    const fz = t.d / 2 + 0.05, trim = '#fbf4dc';
    T.part(0, 2.6, fz, 3.2, 5.2, 0.1, '#3a2c22', 'solid', false);
    T.solid('cylinder', 0, 5.2, fz, 1.6, 0.1, 1.6, '#3a2c22', HALF_PI, false, HALF_PI);
    for (const s of [-1, 1]) {
      T.part(s * 3.3, 1.8, fz, 1.8, 3.6, 0.1, '#3a2c22', 'solid', false);
      T.solid('cylinder', s * 3.3, 3.6, fz, 0.9, 0.1, 0.9, '#3a2c22', HALF_PI, false, HALF_PI);
      T.part(s * (t.w / 2 - 0.45), t.h * 0.42, fz + 0.12, 0.7, t.h * 0.84, 0.24, trim);
      T.part(s * 1.9, t.h * 0.5, fz + 0.08, 0.45, t.h * 0.42, 0.16, trim);
    }
    T.part(0, 6.4, fz + 0.1, t.w + 0.2, 0.35, 0.3, trim);
    T.part(0, t.h * 0.68, fz + 0.1, t.w + 0.3, 0.4, 0.34, trim);
    T.part(0, t.h * 0.96, fz + 0.1, t.w + 0.4, 0.45, 0.36, trim);
    for (const y of [8.6, 11.4]) for (const s of [-1, 1]) T.part(s * 0.95, y, fz + 0.02, 0.7, 1.6, 0.08, '#6f8c96', 'glassLit', false);
  }
}

/** A port or yard shed: a long box with a low corrugated roof, roller doors and its board. */
function warehouse(k: DistrictKit, b: GenBuilding, p: GenPlot) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2, H = Math.max(4, b.h);
  const r = seeded(p.seed || strHash(b.key));
  const wall = b.color || '#a9a59a', ton = pickOf(r, ['#7f8c8f', '#8e959a', '#9a5a3c', '#5f7f8e']);
  F.part(0, H / 2, 0, w, H, d, wall, 'solid');
  F.solid('gable', 0, H + 0.9, 0, d + 0.6, 1.8, w + 0.6, ton, 0, true, HALF_PI);
  for (let lx = -w / 2 + 2; lx < w / 2 - 1; lx += 4) F.part(lx, H / 2, front + 0.12, 0.25, H, 0.24, '#8a8f90');
  const doors = Math.max(1, Math.floor(w / 9));
  for (let i = 0; i < doors; i++) {
    const lx = -w / 2 + (i + 0.5) * (w / doors);
    F.decal(DECAL.shutter, lx, 2.2, front + 0.03, Math.min(5, w / doors - 1.5), 4.2, { tint: pickOf(r, ['#c9cfd2', '#b9c4c8', '#d0c6aa']) });
    F.part(lx, 4.45, front + 0.18, Math.min(5.4, w / doors - 1), 0.4, 0.35, '#7d8487');
  }
  for (let lx = -w / 2 + 3; lx < w / 2 - 2; lx += 6) F.part(lx, H - 1.2, front + 0.04, 2.4, 0.8, 0.06, '#7fa0aa', 'glass', false);
  const sp = F.at(0, front + 0.2);
  k.sign(b.name, b.subtitle, p.signColor, sp.x, Math.min(H - 0.9, 6.4), sp.z, Math.min(w - 1, 11), 1.3, facing, '#f3e4c7');
}

/** A biệt thự: two or three storeys, colonial (ochre, green shutters, hip roof) or modern (white, flat roof, glass). */
function villa(k: DistrictKit, b: GenBuilding, p: GenPlot) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2, storeys = Math.max(2, Math.min(3, p.storeys || 2)), H = storeys * 3.4;
  const r = seeded(p.seed || strHash(b.key)), colonial = p.facade === 'colonial';
  const wall = colonial ? b.color || '#e9d9b0' : b.color || '#f5f0e6', trim = colonial ? '#f8f2e2' : '#d9dcd8';
  F.part(0, 0.3, 0, w + 0.4, 0.6, d + 0.4, '#cfc4ae');
  F.part(0, H / 2, 0, w, H, d, wall, 'solid');
  if (colonial) {
    F.solid('hip', 0, H + 1.3, 0, w + 1.2, 2.6, d + 1.2, pickOf(r, ['#b65d3d', '#a5533a', '#c06a45']), 0, true, 0, 'roofTile');
    // A porch with columns and a balcony over it.
    F.part(0, 3.3, front + 1.4, w * 0.4, 0.25, 2.8, trim);
    for (const s of [-1, 1]) F.solid('cylinder', s * w * 0.18, 1.65, front + 2.5, 0.22, 3.3, 0.22, trim);
  } else {
    F.part(0, H + 0.2, 0, w + 0.3, 0.4, d + 0.3, trim);
    F.part(w * 0.15, H + 1.6, -d * 0.1, w * 0.5, 2.8, d * 0.6, wall, 'solid');
  }
  for (let fl = 0; fl < storeys; fl++) {
    const y = fl * 3.4 + 1.8;
    for (let lx = -w / 2 + 1.6; lx <= w / 2 - 1.6; lx += 2.6) {
      if (fl === 0 && Math.abs(lx) < 1.4) continue;
      const wp = F.at(lx, front);
      F.part(lx, y, front + 0.05, colonial ? 1.1 : 1.9, 1.7, 0.06, '#56717a', (wp.x + y + wp.z) % 2 < 1 ? 'glassLit' : 'glass', false);
      if (colonial) for (const s of [-1, 1]) F.part(lx + s * 0.8, y, front + 0.08, 0.45, 1.75, 0.05, '#4f7a5a');
    }
    if (fl > 0) F.part(0, fl * 3.4, front + 0.6, w * 0.6, 0.15, 1.2, trim);
  }
  F.part(0, 1.25, front + 0.06, 1.4, 2.5, 0.08, colonial ? '#5b3a28' : '#3a3f44');
  if (r() < 0.6) F.cloth(CLOTH.flag, w / 2 - 0.6, H - 0.4, front + 0.3, 1.2, 0.8, { mode: 0, amp: 0.08 });
}

/** A colonial landmark (Nhà Rồng, City Hall, the post office, the convent): arcaded front, pilasters, tiled roof, a pediment. */
function colonial(k: DistrictKit, b: GenBuilding, p: GenPlot, id: string) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2, H = Math.max(8, Math.min(b.h, 24));
  const wall = id === 'ubnd-thanh-pho' ? '#f0d68c' : id === 'buu-dien-thanh-pho' ? '#e8c9a0' : b.color || '#e9d9b0', trim = '#fbf5e6';
  F.part(0, 0.4, 0, w + 0.8, 0.8, d + 0.8, '#d4c8b0');
  F.part(0, H / 2, 0, w, H, d, wall, 'solid');
  if (id === 'nha-rong') {
    // Nhà Rồng: a tiled roof whose ridge runs along the front, and on it the two dragons facing the moon (lưỡng long
    // chầu nguyệt), green with gold crests, readable from the quay and the street; the ridge ends turn up.
    F.solid('gable', 0, H + 1.6, 0, d + 1, 3.2, w + 1, '#a24a2c', 0, true, HALF_PI, 'roofTile');
    const ridge = H + 3.2, green = '#3f8f6a', gold = '#d8b04a', reach = Math.min(w / 2 - 0.6, 6.2);
    for (const s of [-1, 1]) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        // (sized to read from the quay and the street, some 60 m off)
        const t = i / (n - 1), lx = s * (1.8 + t * (reach - 1.8)), size = 1.1 - t * 0.6;
        const y = ridge + 0.45 + 0.45 * Math.sin(t * PI * 2.2) + (i === 0 ? 0.8 : 0) + (i === n - 1 ? 0.7 : 0);
        F.solid('ball', lx, y, 0, size * (i === 0 ? 1.35 : 1.15), size * (i === 0 ? 1.1 : 0.9), size, green, 0, true);
        if (i % 2 === 0 || i === 0) F.solid('cone', lx, y + size * 0.55, 0, 0.12, size * 0.7, 0.24, gold, 0, false);
      }
      // The head: a jaw and two horns, turned to the moon.
      F.solid('cone', s * 1.15, ridge + 1.25, 0, 0.5, 1.1, 0.5, green, s * 1.2, false);
      F.solid('cone', s * 1.9, ridge + 2.2, 0.22, 0.12, 0.9, 0.12, gold, -s * 0.5, false);
      F.solid('cone', s * 1.9, ridge + 2.2, -0.22, 0.12, 0.9, 0.12, gold, -s * 0.5, false);
      // The ridge's upturned end.
      F.solid('cone', s * (w / 2 + 0.35), ridge + 0.35, 0, 0.35, 1.3, 0.35, green, -s * 0.75, false);
    }
    // The moon on a short post at mid-ridge, its disc to the street.
    F.solid('cylinder', 0, ridge + 0.75, 0, 0.12, 1.5, 0.12, gold, 0, false);
    F.solid('cylinder', 0, ridge + 2.25, 0, 0.85, 0.12, 0.85, gold, HALF_PI, true, HALF_PI);
    // (lit dusk to dawn like the floodlights, not by the museum's hours)
    k.lit(0, () => F.solid('cylinder', 0, ridge + 2.25, 0.07, 0.66, 0.12, 0.66, '#f2d27a', HALF_PI, false, HALF_PI, 'lamp'));
  } else F.solid('hip', 0, H + 1.6, 0, w + 1, 3.2, d + 1, '#b65d3d', 0, true, 0, 'roofTile');
  const floors = Math.max(1, Math.floor(H / 4.5));
  for (let fl = 0; fl < floors; fl++) {
    const y = fl * (H / floors);
    for (let lx = -w / 2 + 1.8; lx <= w / 2 - 1.8; lx += 3.2) {
      F.part(lx, y + (H / floors) * 0.5, front + 0.05, 1.6, (H / floors) * 0.62, 0.06, fl ? '#4f6e7a' : '#3a3530', fl ? 'glassLit' : 'solid', false);
      F.solid('cylinder', lx, y + (H / floors) * 0.81, front + 0.06, 0.8, 0.06, 0.8, trim, HALF_PI, false, HALF_PI);
      F.part(lx + 1.6, y + (H / floors) / 2, front + 0.18, 0.5, H / floors, 0.3, trim);
    }
    F.part(0, y + H / floors - 0.15, front + 0.25, w + 0.2, 0.3, 0.5, trim);
  }
  // A central pediment over the entrance.
  F.part(0, H + 0.9, front + 0.3, Math.min(w * 0.35, 14), 1.8, 0.8, trim);
  F.solid('gable', 0, H + 2.4, front + 0.3, Math.min(w * 0.38, 15), 1.6, 0.9, trim, 0, true, 0);
  const sp = F.at(0, front + 0.75), floodlit = id === 'buu-dien-thanh-pho' || id === 'ubnd-thanh-pho' || id === 'nha-rong';
  nameBoard(k, floodlit, b.name, b.subtitle, '#7a2e22', sp.x, Math.min(H - 1.2, 6.2), sp.z, Math.min(w * 0.5, 14), 1.3, facing, '#fbf5e6');
  if (floodlit) uplights(k, F, w * 0.8, front + 1.2, { lz: front + 0.3, w: w - 0.4, h: H, y0: 0.8 });
  for (const t of towersOf(id)) {
    const T = k.frame(t.x, t.z, facing);
    T.part(0, t.h / 2, 0, t.w, t.h, t.d, wall, 'solid');
    T.part(0, t.h * 0.8, t.d / 2 + 0.03, 2.2, 2.2, 0.08, '#f4f1e6');
    T.part(0, t.h * 0.8, t.d / 2 + 0.09, 0.08, 0.8, 0.04, '#222222', 'solid', false);
    T.solid('pyramid', 0, t.h + 2, 0, t.w + 0.4, 4, t.d + 0.4, '#5f6f74');
    T.solid('cylinder', 0, t.h + 4.6, 0, 0.08, 1.4, 0.08, '#c9a641', 0, false);
  }
  if (id !== 'nha-rong') { const fp = F.at(0, -front + 2); k.shape('cylinder', '#d9d9d2', fp.x, H + 3.5, fp.z, 0.07, 6, 0.07); k.cloth(CLOTH.flag, fp.x + 0.9, H + 5.8, fp.z, 1.8, 1.2, 0, { mode: 0, amp: 0.1 }); }
}

/** The Independence Palace: a long modernist block, a lattice of slim fins over its front, a canopy and roof terrace. */
function palace(k: DistrictKit, b: GenBuilding, p: GenPlot) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2, H = Math.min(b.h, 26);
  F.part(0, 0.6, 0, w + 2, 1.2, d + 2, '#ded7c6');
  F.part(0, H / 2, 0, w, H, d, '#efe9dc', 'solid');
  for (let lx = -w / 2 + 0.8; lx <= w / 2 - 0.8; lx += 1.6) F.part(lx, H * 0.55, front + 0.9, 0.22, H * 0.7, 0.5, '#f6f2e8');
  for (const y of [H * 0.2, H * 0.5, H * 0.8]) F.part(0, y, front + 0.6, w, 0.3, 1.4, '#f6f2e8');
  F.part(0, H + 0.4, 0, w + 0.6, 0.8, d + 0.6, '#e2dccd');
  F.part(0, 4.5, front + 5, w * 0.35, 0.5, 9, '#efe9dc');
  for (const s of [-1, 1]) F.part(s * w * 0.15, 2.2, front + 8.6, 0.6, 4.4, 0.6, '#efe9dc');
  for (let lx = -w / 2 + 3; lx < w / 2 - 2; lx += 4) F.part(lx, H * 0.55, front + 0.1, 2.8, H * 0.6, 0.06, '#7a8f8c', 'glassLit', false);
  const fp = F.at(0, -2);
  k.shape('cylinder', '#d9d9d2', fp.x, H + 5, fp.z, 0.08, 9, 0.08);
  k.cloth(CLOTH.flag, fp.x + 1.2, H + 8.6, fp.z, 2.4, 1.6, 0, { mode: 0, amp: 0.1 });
  const sp = F.at(0, front + 0.95);
  k.sign(b.name, b.subtitle, '#7a2e22', sp.x, 5.4, sp.z, 12, 1.2, facing, '#fbf5e6');
}

/** A tower under construction (Thủ Thiêm's twins): core, bare floor slabs and columns, green safety netting at the top. */
function construction(k: DistrictKit, b: GenBuilding, p: GenPlot) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), H = b.h;
  F.part(0, H / 2, 0, w * 0.35, H, d * 0.35, '#a7a39a', 'solid');
  for (let y = 4; y < H - 6; y += 3.6) {
    F.part(0, y, 0, w, 0.35, d, '#b9b5ab');
    if (y > H * 0.25) continue;
    for (const s of [-1, 1]) F.part(0, y + 1.3, s * (d / 2 - 0.1), w - 0.6, 2.2, 0.08, '#6f8c8f', 'glass', false);
  }
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.part(lx * (w / 2 - 0.4), H / 2 - 3, lz * (d / 2 - 0.4), 0.8, H - 6, 0.8, '#b0aca2');
  F.part(0, H - 3, 0, w + 0.4, 6, d + 0.4, '#3f7a4a', 'solid', false);
  const sp = F.at(0, d / 2 + 0.4);
  k.sign('CÔNG TRÌNH ĐANG THI CÔNG', b.name, '#c8322a', sp.x, 4.2, sp.z, Math.min(w - 2, 12), 1.6, facing, '#fff6e0');
}

/** A small pavilion: a metro entrance, a ticket booth at a pier, the bus terminus office, the sales gallery. */
function pavilion(k: DistrictKit, b: GenBuilding, p: GenPlot, id: string) {
  const { x, z, w, d, facing } = dimsOf(p);
  const F = k.frame(x, z, facing), front = d / 2, H = Math.max(2.8, b.h);
  if (id.startsWith('ga-ben-thanh')) {
    F.part(0, 0.15, 0, w, 0.3, d, '#9aa1a3');
    F.part(0, H - 0.2, 0, w + 0.4, 0.3, d + 0.4, '#d8dcdc');
    for (const s of [-1, 1]) F.part(s * (w / 2 - 0.1), H / 2, 0, 0.12, H, d, '#9fc2d4', 'glass', false);
    F.part(0, H / 2, -d / 2 + 0.1, w, H, 0.12, '#9fc2d4', 'glass', false);
    F.part(0, 0.2, 0.2, w - 0.6, 0.1, d - 1, '#4a4f52');
    const sp = F.at(0, front + 0.15);
    k.sign('GA BẾN THÀNH', 'METRO SỐ 1 • BẾN THÀNH – SUỐI TIÊN', '#ffffff', sp.x, H - 0.75, sp.z, w - 0.4, 0.7, facing, '#1d6fb8');
    return;
  }
  F.part(0, H / 2, 0, w, H, d, b.color || '#e8e2d0', 'solid');
  F.part(0, H + 0.15, 0, w + 0.6, 0.3, d + 0.6, '#3f6f9a');
  F.part(0, 1.4, front + 0.05, Math.min(w - 1, 3), 1.2, 0.06, '#5d8580', 'glassLit', false);
  const sp = F.at(0, front + 0.2);
  k.sign(b.name, b.subtitle, p.signColor, sp.x, H - 0.55, sp.z, Math.min(w - 0.4, 8), 0.8, facing);
}

/**
 * Kiosk fronts in a chung cư's ground floor: an awning over each counter (their boards are the generator's signs); lit
 * by their counter's hours (game.ts pulls no shutter over a kiosk: a closed one goes dark by its code).
 */
function kiosks(k: DistrictKit, p: GenPlot, slice: string) {
  for (const q of p.kiosks) {
    const F = k.frame(q.x, q.z, q.yaw), r = seeded(strHash(q.key)), light = FRONT_LIGHT[q.kind === 'food' ? 'food' : q.kind === 'cafe' ? 'cafe' : 'goods'];
    k.lit(kioskCode(slice, q.key), () => {
      F.part(0, 1.5, -0.05, 3.4, 2.6, 0.08, '#6a8a86', 'glassLit', false);
      const awning = pickOf(r, ['#cf795d', '#5e927c', '#d9a441', '#4f7fa8']);
      for (let i = 0; i < 4; i++) F.part(-1.5 + i, 2.85, 0.6, 1, 0.08, 1.3, i % 2 ? '#f3e6ca' : awning, 'solid', false);
      k.pool(F.at(0, 1.6).x, F.at(0, 1.6).z, 4.5, -1, light.pool, light.s);
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Dressing
// ---------------------------------------------------------------------------------------------------------------

/**
 * A layout lamp (street-lights.ts tones): a hẻm wall lamp warm, a globe post in a park or yard, a street lamp white LED
 * on an arterial and in Quận 1 south and Thủ Thiêm, warm sodium on the other streets. Its head glows in the tone's
 * colour, with a halo, and its pool lies under it; each lamp switches on at its own moment at dusk.
 */
function lamp(k: DistrictKit, l: { x: number; z: number; hx: number; hz: number; kind: string; slice: string }) {
  if (l.kind === 'wall') {
    // A bracket lamp on a house front over a hẻm: (x, z) on the wall, the head out over the lane, 3 m up.
    const yaw = Math.atan2(l.hx - l.x, l.hz - l.z), len = hyp(l.hx - l.x, l.hz - l.z);
    k.box('#3f4446', (l.x + l.hx) / 2, 3.1, (l.z + l.hz) / 2, 0.05, 0.05, len, yaw, false);
    k.box(TONES.warm.head, l.hx, HEAD.wall, l.hz, 0.28, 0.12, 0.2, yaw, false, 'lamp');
    k.light('warm', l.hx, l.hz, HEAD.wall, dryScale(makeLight(l.hx, 0, l.hz, TONES.warm.size, 0, 0, '#000000', 0, '#000000', 0)));
    return;
  }
  const lift = districtLift(l.x, l.z);
  k.lift(lift);
  if (l.kind === 'street') {
    const tone = districtTone('street', l.slice, WORLD_ROADS.edgesNear(l.hx, l.hz, 14)[0]?.edge.cls ?? null);
    k.shape('cylinder', '#586c65', l.x, 3.2, l.z, 0.075, 6.4, 0.075);
    const yaw = Math.atan2(l.hx - l.x, l.hz - l.z), len = hyp(l.hx - l.x, l.hz - l.z);
    k.box('#586c65', (l.x + l.hx) / 2 + (l.hx - l.x) * 0.05, 6.35, (l.z + l.hz) / 2 + (l.hz - l.z) * 0.05, 0.13, 0.13, len + 0.15, yaw);
    k.box(TONES[tone].head, l.hx, HEAD.street, l.hz, 0.35, 0.12, 0.65, yaw, false, 'lamp');
    k.streetLamp(tone, l.x, l.z, l.hx, l.hz, HEAD.street + lift, dryScale(aimedLight(tone, l.x, l.z, l.hx, l.hz, 0, 0, 0)));
  } else {
    k.shape('cylinder', '#3f5a52', l.x, 1.9, l.z, 0.07, 3.8, 0.07);
    k.shape('cylinder', '#3f5a52', l.x, 0.15, l.z, 0.2, 0.3, 0.2);
    k.shape('ball', TONES.park.head, l.x, HEAD.post, l.z, 0.32, 0.36, 0.32, 0, 0, false, 'lamp');
    k.shape('cone', '#3f5a52', l.x, 4.38, l.z, 0.36, 0.25, 0.36);
    k.light('park', l.x, l.z, HEAD.post + lift, dryScale(makeLight(l.x, 0, l.z, TONES.park.size, 0, 0, '#000000', 0, '#000000', 0)));
  }
  k.lift(0);
}
/** Waterways (design 1's and the wired slices') with their bounding boxes, for the pools to keep off. */
let waterBoxes: { poly: readonly number[]; minX: number; maxX: number; minZ: number; maxZ: number }[] | null = null;
function overWater(x: number, z: number) {
  if (!waterBoxes) {
    waterBoxes = [...WATERS, ...DISTRICT_WATERS].map((w) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < w.poly.length; i += 2) { minX = Math.min(minX, w.poly[i]); maxX = Math.max(maxX, w.poly[i]); minZ = Math.min(minZ, w.poly[i + 1]); maxZ = Math.max(maxZ, w.poly[i + 1]); }
      return { poly: w.poly, minX, maxX, minZ, maxZ };
    });
  }
  for (const w of waterBoxes) if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && inPoly(w.poly, x, z)) return true;
  return false;
}
/**
 * How far a lamp's pool must shrink to stay on land (night plan A7: no light disc hangs over the water, a metre above
 * it): 1 when its rim is dry, else the largest of 0.9, 0.8 … 0.3 that is (0.3 at the least).
 */
function dryScale(l: NightLight) {
  const centre = { x: l.x, z: l.z };
  for (let k = 1; k > 0.25; k -= 0.1) {
    const probe: NightLight = { ...l, size: l.size * k, len: l.len * k };
    // (an aimed pool shrinks toward its head as its reach does)
    if (l.hx !== l.x || l.hz !== l.z) { probe.x = l.hx + (centre.x - l.hx) * k; probe.z = l.hz + (centre.z - l.hz) * k; }
    if (!poolRim(probe).some(([x, z]) => overWater(x, z))) return k;
  }
  return 0.3;
}

const FIXTURE_COLORS = ['#c8553d', '#2f6fb5', '#3d8a5a', '#d9a441', '#8e959a', '#b14635', '#245b4f', '#e07a1f'];
/** Generator props: today's kinds through world.ts prop(), the rest (fences and walls at any angle, port gear, gates…) here. */
function prop(k: DistrictKit, pr: GenProp & { slice: string }, index: number) {
  const lift = districtLift(pr.x, pr.z);
  k.lift(lift);
  const F = k.frame(pr.x, pr.z, pr.yaw), r = seeded(Math.floor(pr.tint * 2147483) + 7 + index);
  switch (pr.kind) {
    case 'fence': {
      const len = pr.w, id = pr.key.split('/').pop()!.split(':')[1] ?? '';
      if (id.startsWith('rao-du-an')) hoardingPanel(k, F, len, 2.6, pr.tint);
      else if (id.startsWith('cang') || id.startsWith('bai-giu') || id.startsWith('cong-truong') || id.startsWith('san-sat-hach')) chainFence(F, len, id.startsWith('san-sat-hach') ? 1.8 : 2.4);
      else {
        F.part(0, 0.35, 0, len, 0.7, 0.3, '#f4ecd6');
        F.part(0, 1.55, 0, len, 0.08, 0.08, '#2c5d8f');
        for (let t = -len / 2 + 0.2; t <= len / 2; t += 0.45) F.part(t, 1.1, 0, 0.05, 0.8, 0.05, '#2c5d8f');
      }
      break;
    }
    case 'wall': {
      const len = pr.w, h = pr.d > 0.4 ? 2.4 : 2.2;
      const pagoda = !pr.key.includes('tuong-biet-thu') && !pr.key.includes('tuong-hoa-su');
      F.part(0, h / 2, 0, len, h, Math.max(0.3, pr.d), pagoda ? '#e7b75f' : '#efe6d2', 'solid');
      F.part(0, h + 0.1, 0, len + 0.25, 0.22, Math.max(0.3, pr.d) + 0.25, pagoda ? '#8e4a33' : '#b65d3d');
      break;
    }
    case 'pillar':
      if (pr.w < 0.9) { F.part(0, 1.9, 0, pr.w, 3.8, pr.d, '#f4ecd6'); F.part(0, 3.95, 0, pr.w + 0.15, 0.2, pr.d + 0.15, '#2c5d8f'); }
      else { F.part(0, 1.6, 0, pr.w, 3.2, pr.d, '#efe6d2'); F.part(0, 3.3, 0, pr.w + 0.2, 0.2, pr.d + 0.2, '#b65d3d'); F.solid('ball', 0, 3.6, 0, 0.35, 0.35, 0.35, '#d8a531'); }
      break;
    case 'container': case 'reefer': {
      const tiers = Math.max(1, Math.round((colliderTop(pr) ?? 2.6) / 2.6)), color = pickOf(r, FIXTURE_COLORS);
      k.far('box', color, pr.x, (tiers * 2.6) / 2 + lift, pr.z, pr.w, tiers * 2.6, pr.d, pr.yaw);
      const n = pr.kind === 'reefer' ? 1 : Math.max(1, Math.round(pr.d / 2.44));
      for (let t = 0; t < tiers; t++) for (let i = 0; i < n; i++) {
        const lz = -pr.d / 2 + 1.22 + i * 2.44, c = t || i ? pickOf(r, FIXTURE_COLORS) : color;
        F.part(0, t * 2.6 + 1.3, lz, pr.w - 0.05, 2.55, 2.38, pr.kind === 'reefer' ? '#e8e8e2' : c);
        F.decal(DECAL.ton, pr.w / 2 * 0, t * 2.6 + 1.3, lz + 1.2, pr.w - 0.4, 2.3, { tint: pr.kind === 'reefer' ? '#e8e8e2' : c });
      }
      break;
    }
    case 'crate': case 'pallet': {
      const h = colliderTop(pr) ?? 1.2;
      for (let y = 0; y < h - 0.05; y += 1.2) {
        F.part(0, y + 0.07, 0, pr.w, 0.14, pr.d, '#a07a4a');
        if (pr.kind === 'crate') F.part(0, y + 0.66, 0, pr.w - 0.1, Math.min(1.05, h - y - 0.15), pr.d - 0.1, pickOf(r, ['#b98f5a', '#c9a46a', '#8f9a8c']));
        else F.part(0, y + 0.5, 0, pr.w - 0.2, 0.7, pr.d - 0.2, pickOf(r, ['#e8e2d0', '#d0c6aa', '#9fb8c0']));
      }
      break;
    }
    case 'drums':
      for (const [dx, dz] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) F.solid('cylinder', dx, 0.45, dz, 0.29, 0.9, 0.29, pickOf(r, ['#2f6fb5', '#c8553d', '#3d8a5a']));
      break;
    case 'bollard':
      F.solid('cylinder', 0, 0.35, 0, 0.22, 0.7, 0.22, '#2b2f33');
      F.solid('cylinder', 0, 0.75, 0, 0.3, 0.12, 0.3, '#2b2f33');
      break;
    case 'booth':
      F.part(0, 1.25, 0, pr.w, 2.5, pr.d, '#e8e2d0', 'solid');
      k.lit(allNight(), () => F.part(0, 1.5, pr.d / 2 + 0.02, pr.w * 0.7, 0.9, 0.05, '#5d8580', 'glassLit', false));
      F.part(0, 2.65, 0, pr.w + 0.4, 0.2, pr.d + 0.4, '#2f5d8a');
      break;
    case 'crane-leg':
      F.part(0, (colliderTop(pr) ?? 30) / 2, 0, pr.w * 0.8, colliderTop(pr) ?? 30, pr.d * 0.8, '#e0b030');
      break;
    case 'eatery': case 'pole': break; // eateries and poles are drawn from their own lists
    case 'gate':
      F.part(0, 1.2, 0, pr.w, 2.4, 0.1, '#3a3f44');
      break;
    case 'fountain': {
      const R = Math.max(1.5, Math.min(pr.w, pr.d) / 2);
      F.solid('cylinder', 0, 0.35, 0, R, 0.7, R, '#d9d2c2');
      F.solid('cylinder', 0, 0.66, 0, R - 0.3, 0.04, R - 0.3, '#6fb0b4', 0, true, 0, 'water');
      F.solid('cylinder', 0, 1.2, 0, 0.35, 1.4, 0.35, '#d9d2c2');
      F.solid('cylinder', 0, 2.2, 0, 0.12, 1.2, 0.12, '#bfe3e6', 0, false, 0, 'water');
      break;
    }
    default: k.lit(pr.hours ? timedCode(pr.hours) : 0, () => k.prop({ kind: pr.kind as Prop['kind'], x: pr.x, z: pr.z, sx: pr.sx, sz: pr.sz, yaw: pr.yaw, tint: pr.tint }, -1 - index));
  }
  k.lift(0);
}
const COLLIDER_TOP = new Map<string, number>();
/** A prop's height from its collider (the generator keeps it there). */
function colliderTop(pr: GenProp) {
  if (!COLLIDER_TOP.size) for (const s of SLICES) for (const c of s.data.colliders) COLLIDER_TOP.set(`${s.key}/${c.key}`, c.top);
  return COLLIDER_TOP.get(pr.key);
}
/** A chain-link fence panel on posts (the port, the impound yards, the building sites). */
function chainFence(F: Frame, len: number, h: number) {
  F.part(0, h / 2, 0, len, h - 0.1, 0.03, '#9aa3a6', 'glass', false);
  F.part(0, h - 0.05, 0, len, 0.06, 0.06, '#6b7275');
  F.part(0, 0.1, 0, len, 0.2, 0.12, '#8a8f90');
  F.part(-len / 2, h / 2, 0, 0.08, h, 0.08, '#6b7275');
}
/** A project hoarding panel: corrugated sheet in green and white bands. */
function hoardingPanel(k: DistrictKit, F: Frame, len: number, h: number, tint: number) {
  F.part(0, h / 2, 0, len, h, 0.06, tint > 0.5 ? '#2f7a4a' : '#2a6f9e', 'solid');
  F.part(0, h - 0.25, 0.04, len, 0.5, 0.02, '#f4f1e6', 'solid', false);
  F.part(-len / 2, h / 2, 0, 0.1, h + 0.1, 0.1, '#6b7275');
}

/**
 * A plastic-stool eatery: its low table, a stool at every seat, and by variant a grill, a hot pot or a coffee glass;
 * a bare bulb on a cord from its shop's door over the table, lit while it sells (night plan §6.8).
 */
function eatery(k: DistrictKit, e: Eatery & { slice: string }, seats: { x: number; z: number }[]) {
  const lift = districtLift(e.x, e.z), r = seeded(strHash(e.key));
  k.lift(lift);
  const F = k.frame(e.x, e.z, e.yaw);
  const top = e.variant === 'coffee' ? 0.45 : 0.62, color = pickOf(r, ['#cf6251', '#3f7fbf', '#e0b030', '#e8e2d0', '#5e927c']);
  F.part(0, top - 0.02, 0, 0.8, 0.04, 0.6, e.variant === 'coffee' ? '#d9cfb8' : '#e8e2d0');
  for (const [lx, lz] of [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]]) F.part(lx, (top - 0.04) / 2, lz, 0.04, top - 0.04, 0.04, '#8a8f92', 'solid', false);
  k.seat(e.x, e.z, 0.8, 0.6, e.yaw, top);
  for (const s of seats) { k.lift(districtLift(s.x, s.z)); k.stool(s.x, s.z, color); }
  k.lift(lift);
  if (e.variant === 'grill') { F.solid('cylinder', 0.15, top + 0.08, 0, 0.18, 0.14, 0.18, '#2b2b2b', 0, false); F.smoke('grill', 0.15, top + 0.2, 0); }
  else if (e.variant === 'hotpot') { F.solid('cylinder', 0, top + 0.1, 0, 0.17, 0.18, 0.17, '#c7ccce', 0, false); F.smoke('steam', 0, top + 0.3, 0); }
  else if (e.variant === 'coffee') for (const lx of [-0.2, 0.2]) F.solid('cylinder', lx, top + 0.06, 0, 0.04, 0.12, 0.04, '#7a4a2a', 0, false);
  else for (const lx of [-0.22, 0.12]) F.solid('cylinder', lx, top + 0.05, 0.05, 0.09, 0.08, 0.09, '#f4f1e6', 0, false);
  const b = e.building ? BUILDING_BY_KEY.get(`${e.slice}|${e.building}`) : undefined;
  if (b) k.lit(timedCode(e.hours), () => {
    // The cord leaves the wall over the door (the door stands 0.8 m out from the front).
    const f = Math.sin(b.facing), g = Math.cos(b.facing), ax = b.door.x - f * 0.8, az = b.door.z - g * 0.8;
    k.lift(0);
    k.cable(ax, 3.3, az, e.x, lift + 2.97, e.z, 0.25, 0.018, '#2a2a2a', false);
    k.lift(lift);
    k.shape('cylinder', '#2a2a2a', e.x, 2.9, e.z, 0.01, 0.16, 0.01, 0, 0, false);
    k.shape('ball', TONES.bulb.head, e.x, 2.75, e.z, 0.06, 0.075, 0.06, 0, 0, false, 'lamp');
    k.light('bulb', e.x, e.z, lift + 2.75);
  });
  k.lift(0);
}

/** Power poles in the curb band, the cables along each line, service drops to the tube houses near them. */
function poles(k: DistrictKit, add: (x: number, z: number, slice: string, signs: boolean, draw: () => void) => void) {
  const list = DISTRICT_SCENERY.poles;
  const lines = new Map<string, typeof list>();
  for (const p of list) { const l = lines.get(p.line); if (l) l.push(p); else lines.set(p.line, [p]); }
  const dark = ['#26282a', '#2e2f31', '#1f2122', '#3a3632', '#2b2d30'];
  for (const p of list) add(p.x, p.z, p.slice, false, () => {
    const base = districtLift(p.x, p.z), ax = Math.sin(p.yaw), az = Math.cos(p.yaw), H = p.main ? 8.8 : 7.2, r = seeded(strHash(p.key));
    k.lift(base);
    k.shape('trunk', '#bdb9ae', p.x, H / 2, p.z, 0.15, H, 0.15, p.yaw, 0, true);
    k.box('#9c978c', p.x, 0.35, p.z, 0.4, 0.7, 0.4, p.yaw);
    if (p.main) for (const [y, len] of [[8.25, 1.4], [7.45, 1.0]]) k.box('#77736c', p.x, y, p.z, 0.1, 0.1, len, p.yaw, false);
    k.box('#4a4c4e', p.x, 5.85, p.z, 0.32, 0.22, 0.32, p.yaw, false);
    k.box('#8c9096', p.x - ax * 0.2, 2.6, p.z - az * 0.2, 0.36, 0.5, 0.22, p.yaw, false);
    k.fine(true);
    k.decal(DECAL.stickers, p.x - ax * 0.17, 1.6 + r() * 0.6, p.z - az * 0.17, 0.32, 0.9, p.yaw + PI);
    if (r() < 0.2) k.decal(DECAL.meters, p.x - ax * 0.17, 3.3, p.z - az * 0.17, 0.8, 0.8, p.yaw + PI);
    k.fine(false);
    if (p.transformer) {
      k.box('#6f6c66', p.x - ax * 0.45, 6.4, p.z - az * 0.45, 0.5, 0.1, 1.3, p.yaw + HALF_PI, false);
      for (const q of [-0.42, 0, 0.42]) k.shape('cylinder', '#8e9396', p.x - ax * 0.45 + az * q, 6.85, p.z - az * 0.45 - ax * q, 0.17, 0.8, 0.17, 0, 0, true);
      k.decal(DECAL.danger, p.x - ax * 0.17, 3.35, p.z - az * 0.17, 0.42, 0.42, p.yaw + PI);
    }
    k.lift(0);
  });
  // Cables between consecutive poles of a line, filed with the first pole.
  for (const line of lines.values()) for (let i = 0; i + 1 < line.length; i++) {
    const pa = line[i], pb = line[i + 1], span = hyp(pb.x - pa.x, pb.z - pa.z);
    if (span > (pa.main ? 40 : 62) || span < 1) continue;
    add(pa.x, pa.z, pa.slice, false, () => {
      const r = seeded(strHash(pa.key) + 3), ya = districtLift(pa.x, pa.z), yb = districtLift(pb.x, pb.z), sagK = span / 28;
      const aa = { x: Math.sin(pa.yaw), z: Math.cos(pa.yaw) }, ab = { x: Math.sin(pb.yaw), z: Math.cos(pb.yaw) };
      const wire = (y: number, oa: number, ob: number, sag: number, width: number, color: string, dy = 0) =>
        k.cable(pa.x + aa.x * oa, y + ya + dy, pa.z + aa.z * oa, pb.x + ab.x * ob, y + yb - dy, pb.z + ab.z * ob, sag * sagK, width, color, false);
      if (pa.main && pb.main) { for (const q of [-0.48, 0, 0.48]) wire(8.33, (q * 1.4) / 1.2, (q * 1.4) / 1.2, 0.35 + r() * 0.15, 0.022, dark[0]); for (const q of [-0.35, 0.35]) wire(7.53, q, q, 0.45 + r() * 0.2, 0.022, dark[1]); }
      const n = 4 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) { const o = (r() - 0.5) * 0.3; wire(5.85, o, o + (r() - 0.5) * 0.2, 0.45 + r() * 0.95, 0.025 + r() * 0.02, r() < 0.18 ? '#cfcfc6' : pickOf(r, dark), (r() - 0.5) * 0.09); }
    });
  }
  // Civic banners (khẩu hiệu) across the main streets from some main poles, as on today's map.
  const SLOGANS: Record<string, string[]> = {
    'quan-4': ['QUẬN 4 XANH – SẠCH – ĐẸP', 'KHU PHỐ VĂN HÓA KHÁNH HỘI'],
    'binh-thanh': ['BÌNH THẠNH VĂN MINH – HIỆN ĐẠI', 'CHÀO MỪNG NGÀY QUỐC KHÁNH 2-9'],
    'quan-3': ['QUẬN 3 – ĐÔ THỊ VĂN MINH', 'GIỮ GÌN VỆ SINH CHUNG'],
    'quan-1-south': ['THÀNH PHỐ HỒ CHÍ MINH VĂN MINH – HIỆN ĐẠI – NGHĨA TÌNH', 'CHÀO MỪNG NGÀY QUỐC KHÁNH 2-9'],
    'thu-thiem': ['THỦ THIÊM – ĐÔ THỊ SÁNG TẠO', 'GIỮ GÌN CẢNH QUAN BỜ SÔNG'],
  };
  const COMMON = ['AN TOÀN GIAO THÔNG LÀ HẠNH PHÚC CỦA MỌI NHÀ', 'ĐÃ UỐNG RƯỢU BIA – KHÔNG LÁI XE', 'CHÚC MỪNG NĂM MỚI'];
  for (const p of list) {
    if (!p.main || strHash(p.key) % 7 !== 0) continue;
    const near = WORLD_ROADS.nearestEdge(p.x, p.z, 16, (e) => e.cls !== 'hem' && e.traffic);
    if (!near || near.edge.half < 4) continue;
    const e = near.edge, w = Math.min(11, e.half * 2 - 1.5), yaw = Math.atan2(near.hx, near.hz), r = seeded(strHash(p.key) + 5);
    const pool = [...(SLOGANS[p.slice] ?? []), ...COMMON], text = pool[Math.floor(r() * pool.length)];
    add(near.x, near.z, p.slice, true, () => {
      const y = 6.3 + deckLift(e.id, near.s);
      k.tag('banner', text, '#ffd75e', '#c8322a', near.x, y, near.z, w, 0.85, yaw, 0.3);
      // Its ties: to the pole on one side, to the far curb's lamp line on the other.
      const rx = -near.hz, rz = near.hx, side = Math.sign((p.x - near.x) * rx + (p.z - near.z) * rz) || 1;
      for (const dy of [0.38, -0.38]) {
        const ex = near.x + rx * side * (w / 2), ez = near.z + rz * side * (w / 2);
        k.box('#d9d4c4', (ex + p.x) / 2, y + dy, (ez + p.z) / 2, 0.02, 0.02, hyp(p.x - ex, p.z - ez), Math.atan2(p.x - ex, p.z - ez), false);
      }
    });
  }
  // Service drops: one to three cables from the nearest pole to each tube house's front.
  const near = (x: number, z: number) => { let best: (typeof list)[number] | null = null, bd = 30; for (const q of list) { const d = hyp(q.x - x, q.z - z); if (d < bd) { bd = d; best = q; } } return best; };
  DISTRICT_BUILDINGS.forEach((b, i) => {
    const p = DISTRICT_PLOTS[i];
    if (p.typology !== 'tube' && p.typology !== 'shophouse') return;
    const pole = near(b.door.x, b.door.z);
    if (!pole) return;
    add(b.door.x, b.door.z, pole.slice, false, () => {
      const r = seeded(strHash(b.key) + 11), y0 = districtLift(pole.x, pole.z), f = Math.sin(b.facing), g = Math.cos(b.facing);
      const wx = b.door.x - f * 0.75, wz = b.door.z - g * 0.75, n = 1 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const off = (r() - 0.5) * (b.w - 2);
        k.cable(pole.x, 5.8 + y0 + (r() - 0.5) * 0.2, pole.z, wx + g * off + f * 0.05, Math.min(b.h - 0.5, 3.7 + r() * 1.6), wz - f * off + g * 0.05, 0.25 + r() * 0.45, 0.025, dark[j % dark.length], true);
      }
    });
  });
}

/** A generator sign no renderer draws: a vertical light box, a hẻm arch on its posts, a kiosk board. */
/** District buildings by `slice|key` (a sign names its building by key). */
const BUILDING_BY_KEY = new Map<string, GenBuilding>(SLICES.flatMap((s) => DISTRICT_BUILDINGS.slice(s.ids[0] - (SLICES[0]?.ids[0] ?? 0), s.ids[1] - (SLICES[0]?.ids[0] ?? 0)).map((b): [string, GenBuilding] => [`${s.key}|${b.key}`, b])));
/** A business in a night zone (Bùi Viện, Vĩnh Khánh, Phan Xích Long): its sign is framed in neon, its door throws coloured light. */
function nightVenue(s: GenSign & { slice: string }) {
  if (!s.building) return null;
  const b = BUILDING_BY_KEY.get(`${s.slice}|${s.building}`);
  return b && b.zone === 'night' && (b.kind === 'food' || b.kind === 'cafe' || b.kind === 'shop') ? b : null;
}
/** Neon tubes round a board facing `yaw`, `w` × `h` at (x, y, z), in `color` (the 'neon' role glows at night). */
function neonFrame(k: DistrictKit, x: number, y: number, z: number, w: number, h: number, yaw: number, color: string) {
  const fx = Math.sin(yaw) * 0.08, fz = Math.cos(yaw) * 0.08, rx = Math.cos(yaw), rz = -Math.sin(yaw);
  for (const s of [-1, 1]) {
    k.box(color, x + fx, y + s * (h / 2 + 0.1), z + fz, w + 0.3, 0.07, 0.07, yaw, false, 'neon');
    k.box(color, x + fx + rx * s * (w / 2 + 0.12), y, z + fz + rz * s * (w / 2 + 0.12), 0.07, h + 0.27, 0.07, yaw, false, 'neon');
  }
}
function genSign(k: DistrictKit, s: GenSign & { slice: string }) {
  // Lit by its building's hours (a kiosk board by its kiosk's counter); a hẻm arch with the lamps.
  const owner = s.building && s.kind !== 'arch' ? BUILDING_BY_KEY.get(`${s.slice}|${s.building}`) : undefined;
  const kiosk = s.kind === 'board' && /:k\d+:s$/.test(s.key) ? kioskCode(s.slice, s.key.slice(s.slice.length + 1, -2)) : 0;
  k.lit(kiosk || (owner ? buildingLight(owner.id).code : 0), () => drawGenSign(k, s));
}
function drawGenSign(k: DistrictKit, s: GenSign & { slice: string }) {
  const venue = s.kind === 'board' || s.kind === 'vertical' ? nightVenue(s) : null;
  if (venue) {
    neonFrame(k, s.x, s.y, s.z, s.w, s.h, s.yaw, s.color);
    // Coloured light on the pavement before its door after dark, while it is open (its board's: one a building).
    if (s.kind === 'board') {
      const fx = Math.sin(venue.facing), fz = Math.cos(venue.facing);
      k.pool(venue.door.x + fx * 1.6, venue.door.z + fz * 1.6, 5, venue.id, s.color);
    }
  }
  if (s.kind === 'arch') {
    // Cổng hẻm: two slim posts at the mouth and a lintel carrying the name.
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw), half = s.w / 2;
    const lift = districtLift(s.x, s.z);
    for (const side of [-1, 1]) k.box('#d9cfba', s.x + rx * side * half, 2.05 + lift / 2, s.z + rz * side * half, 0.22, 4.1 + lift, 0.22, s.yaw);
    k.box('#d9cfba', s.x, s.y + 0.1, s.z, s.w + 0.3, 0.75, 0.25, s.yaw);
    k.sign(s.text, s.subtitle, s.color, s.x + Math.sin(s.yaw) * 0.14, s.y + 0.1, s.z + Math.cos(s.yaw) * 0.14, s.w, s.h + 0.1, s.yaw, s.background);
    k.sign(s.text, s.subtitle, s.color, s.x - Math.sin(s.yaw) * 0.14, s.y + 0.1, s.z - Math.cos(s.yaw) * 0.14, s.w, s.h + 0.1, s.yaw + PI, s.background);
    k.shape('ball', '#d8402c', s.x, s.y - 0.55, s.z, 0.18, 0.24, 0.18, 0, 0, false, 'lantern');
    return;
  }
  if (s.kind === 'vertical') {
    k.box('#e7d9bd', s.x - Math.sin(s.yaw) * 0.04, s.y, s.z - Math.cos(s.yaw) * 0.04, s.w + 0.12, s.h + 0.12, 0.14, s.yaw);
    k.tag('vertical', s.text, s.color, s.background, s.x, s.y, s.z, s.w, s.h, s.yaw, 0.6);
    return;
  }
  k.sign(s.text, s.subtitle, s.color, s.x, s.y, s.z, s.w, s.h, s.yaw, s.background);
}

// ---------------------------------------------------------------------------------------------------------------
// Edge works and extras
// ---------------------------------------------------------------------------------------------------------------

function works(k: DistrictKit, add: (x: number, z: number, slice: string, signs: boolean, draw: () => void) => void) {
  for (const l of WORKS.loCot) add(l.x, l.z, l.slice, true, () => loCot(k, l));
  for (const run of WORKS.runs) {
    const [ax, az, bx, bz] = run.pts, len = hyp(bx - ax, bz - az);
    if (len < 0.5) continue;
    const n = Math.max(1, Math.ceil(len / 30));
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * len, t1 = ((i + 1) / n) * len, ux = (bx - ax) / len, uz = (bz - az) / len;
      add(ax + ux * (t0 + t1) / 2, az + uz * (t0 + t1) / 2, run.slice, !!run.sign, () => {
        const yaw = Math.atan2(-uz, ux), lift = districtLift(ax + ux * (t0 + t1) / 2, az + uz * (t0 + t1) / 2);
        k.lift(lift);
        for (let t = t0; t < t1 - 0.05; t += 2.5) {
          const L = Math.min(2.5, t1 - t), cx = ax + ux * (t + L / 2), cz = az + uz * (t + L / 2), F = k.frame(cx, cz, yaw);
          if (run.kind === 'hoarding') hoardingPanel(k, F, L, run.h, (strHash(run.id) % 100) / 100);
          else { F.part(0, run.h / 2, 0, L, run.h, 0.05, '#2a6f9e', 'solid'); F.part(0, 0.15, 0, L, 0.3, 0.12, '#f4f1e6'); F.part(-L / 2, run.h / 2, 0, 0.08, run.h + 0.1, 0.08, '#6b7275'); }
        }
        if (run.sign) for (let t = Math.ceil(t0 / run.signEvery) * run.signEvery + run.signEvery / 2; t < t1; t += run.signEvery) {
          const cx = ax + ux * t, cz = az + uz * t;
          for (const side of [1, -1]) k.sign(run.sign, run.temporary ? 'XIN LỖI VÌ SỰ BẤT TIỆN NÀY' : 'CÔNG TRÌNH ĐANG THI CÔNG', '#c8322a', cx - uz * side * 0.06, 1.6, cz + ux * side * 0.06, 4.2, 1.0, yaw + (side > 0 ? 0 : PI) - HALF_PI + HALF_PI, '#f4f1e6');
        }
        k.lift(0);
      });
    }
  }
  for (const t of WORKS.belts) add(t.x, t.z, t.slice, false, () => k.tree({ species: t.species, x: t.x, z: t.z, size: t.size, spin: (t.x * 0.37 + t.z * 0.11) % 6.28, tint: ((t.x * 7.1 + t.z * 3.3) % 1 + 1) % 1 }, false));
  for (const s of WORKS.signs) add(s.x, s.z, sliceAt(s.x, s.z)?.key ?? '', true, () => {
    k.shape('cylinder', '#6b7275', s.x, 1.5, s.z, 0.06, 3, 0.06);
    k.sign(s.text, s.subtitle, '#c8322a', s.x, 2.6, s.z, 5, 1.1, s.yaw, '#f4f1e6');
  });
}
/** A lô cốt: a road-works enclosure of corrugated panels striped red and white, blinking lamps, its sign on both long sides. */
function loCot(k: DistrictKit, l: { x: number; z: number; yaw: number; w: number; d: number; h: number; text: string }) {
  // yaw is the road's heading; w runs across it (the box's right axis), d along it.
  const F = k.frame(l.x, l.z, l.yaw), lift = districtLift(l.x, l.z);
  k.lift(lift);
  for (const s of [-1, 1]) {
    F.part(0, l.h / 2, s * l.d / 2, l.w, l.h, 0.06, '#e8e2d0', 'solid');
    for (let t = -l.w / 2 + 0.6; t < l.w / 2; t += 2.4) F.part(t, 0.6, s * (l.d / 2 + 0.04), 1.2, 0.4, 0.02, '#c8322a', 'solid', false);
    F.part(0, l.h - 0.15, s * (l.d / 2 + 0.04), l.w, 0.3, 0.02, '#2a6f9e', 'solid', false);
  }
  for (const s of [-1, 1]) F.part(s * l.w / 2, l.h / 2, 0, 0.06, l.h, l.d, '#e8e2d0', 'solid');
  for (let t = -l.w / 2 + 1; t <= l.w / 2 - 1; t += Math.max(2, l.w / 4)) for (const s of [-1, 1]) F.part(t, l.h + 0.12, s * l.d / 2, 0.18, 0.18, 0.18, '#ffb43a', 'lamp', false);
  for (const s of [-1, 1]) {
    const p = F.at(0, s * (l.d / 2 + 0.08));
    k.sign(l.text.split(' • ').slice(-1)[0], l.text.includes(' • ') ? l.text.split(' • ')[0] : 'XIN LỖI VÌ SỰ BẤT TIỆN NÀY', '#c8322a', p.x, l.h * 0.55, p.z, Math.min(l.w - 0.6, 6), 0.9, l.yaw + (s > 0 ? 0 : PI), '#fff6e0');
  }
  k.lift(0);
}

/** A circle as a polygon (x,z pairs). */
function disc(x: number, z: number, r: number, n = 40) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; out.push(x + r * Math.cos(a), z + r * Math.sin(a)); }
  return out;
}
/**
 * A roundabout's island (world-map.ts RINGS; the ring's inner sidewalk paves its edge): a lawn, and on it Hồ Con Rùa's
 * pool with its rim and the lotus monument, Dân Chủ's planted fountain, or a statue on its plinth (Đức Mẹ Hòa Bình at
 * Công xã Paris, Trần Nguyên Hãn at Quách Thị Trang). The rim, planter and plinths are solid (world-map.ts).
 */
function island(k: DistrictKit, r: (typeof RINGS)[number]) {
  const top = Y_WALK, x = r.x, z = r.z;
  k.surf.fill('ground', '#8fb07a', disc(x, z, r.island - 1.6), top + 0.012);
  if (r.pool > 0) {
    // The turtle lake: a round basin, water a little below its rim (people sit on it at night), the lotus monument rising from it.
    k.surf.fill('paving', '#d9d2c2', disc(x, z, r.pool + 0.9), top + 0.016);
    k.surf.fill('solid', '#4f8a84', disc(x, z, r.pool), top - 0.5);
    k.surf.fill('water', '#6fb0b4', disc(x, z, r.pool), top + 0.2);
    const n = 32;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * PI * 2, rr = r.pool + 0.2, len = 2 * rr * Math.sin(PI / n) + 0.1;
      k.box('#d9d2c2', x + rr * Math.cos(a), top + 0.27, z + rr * Math.sin(a), len, 0.55, 0.45, Math.atan2(-Math.cos(a), -Math.sin(a)), false);
    }
    const H = r.monument || 9;
    k.shape('cylinder', '#d6d2c6', x, top + 0.4, z, 2.2, 0.8, 2.2, 0, 0, true);
    k.shape('cylinder', '#e2ded4', x, top + H / 2, z, 0.55, H, 0.55, 0, 0, true);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      k.shape('cone', '#e8e4da', x + Math.cos(a) * 0.9, top + H * 0.62, z + Math.sin(a) * 0.9, 0.9, H * 0.55, 0.35, Math.atan2(Math.cos(a), -Math.sin(a)), 0.32, true);
    }
    k.shape('ball', '#e8e4da', x, top + H + 0.3, z, 0.9, 0.7, 0.9, 0, 0, true);
    k.shape('ball', '#7d8a6a', x + 1.6, top + 0.95, z, 0.9, 0.5, 1.2, 0, 0, true);
    k.shape('ball', '#7d8a6a', x + 2.4, top + 1.05, z, 0.35, 0.3, 0.35, 0, 0, false);
  } else if (r.statue) {
    // A statue on a stone plinth, with its name, a ring of flowers round it.
    const big = r.island > 9, w = big ? 4.4 : 3.2;
    k.box('#cfc6b2', x, top + 1.2, z, w, 2.4, w, 0, true);
    k.box('#e0d8c4', x, top + 2.5, z, w + 0.3, 0.2, w + 0.3, 0, false);
    for (const s of [0, PI / 2, PI, -PI / 2]) k.sign(r.statue, '', '#7a5a2a', x + Math.sin(s) * (w / 2 + 0.03), top + 1.5, z + Math.cos(s) * (w / 2 + 0.03), w - 0.4, 0.35, s, '#e9e1cc');
    if (big) {
      // Trần Nguyên Hãn on horseback, in bronze.
      const bronze = '#6d5a3c';
      k.box(bronze, x, top + 4.1, z, 1.1, 1.3, 3, 0, true);
      for (const [dx, dz] of [[-0.4, -1.1], [0.4, -1.1], [-0.4, 1.1], [0.4, 1.1]]) k.box(bronze, x + dx, top + 3.05, z + dz, 0.22, 1.1, 0.22, 0, false);
      k.box(bronze, x, top + 5.2, z + 1.5, 0.6, 1.2, 0.9, 0, false);
      k.shape('cylinder', bronze, x, top + 5.3, z - 0.2, 0.35, 1.5, 0.35, 0, 0, true);
      k.shape('ball', bronze, x, top + 6.25, z - 0.2, 0.32, 0.36, 0.32, 0, 0, false);
    } else {
      // Đức Mẹ Hòa Bình in white granite, hands joined, facing the cathedral.
      k.shape('cone', '#f2efe6', x, top + 4.1, z, 0.7, 3, 0.7, 0, 0, true);
      k.shape('cylinder', '#f2efe6', x, top + 4.6, z, 0.38, 1.6, 0.38, 0, 0, true);
      k.shape('ball', '#f2efe6', x, top + 5.75, z, 0.28, 0.34, 0.28, 0, 0, false);
    }
    k.flowers(x, top + 0.02, z, 26, r.island * 0.75, r.island * 0.75, strHash(r.id));
  } else {
    // Dân Chủ: a raised planter with a low fountain in the middle and shrubs round it.
    k.box('#cfc6b2', x, top + 0.45, z, 5.2, 0.9, 5.2, PI / 4, true);
    k.shape('cylinder', '#9fc7c9', x, top + 1.1, z, 1.4, 0.3, 1.4, 0, 0, false, 'water');
    k.shape('cylinder', '#bfe3e6', x, top + 1.9, z, 0.12, 1.5, 0.12, 0, 0, false, 'water');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; k.shape('puff', '#5f8f55', x + Math.cos(a) * (r.island - 3), top + 0.8, z + Math.sin(a) * (r.island - 3), 1.1, 1, 1.1, a, 0, false); }
  }
}
/** Destinations on the coaches' boards (Bến xe Miền Đông served the east and the highlands). */
const COACH_ROUTES = ['SÀI GÒN – ĐÀ LẠT', 'SÀI GÒN – VŨNG TÀU', 'SÀI GÒN – NHA TRANG', 'SÀI GÒN – BUÔN MA THUỘT', 'SÀI GÒN – QUY NHƠN', 'SÀI GÒN – PHAN THIẾT'];
const COACH_LIVERY = [['#f4f1ea', '#e07a1f'], ['#f4f1ea', '#2f6fb5'], ['#3d8a5a', '#f4f1ea'], ['#c8322a', '#f4f1ea'], ['#245b4f', '#e8c84a']];
/** A parked sleeper coach (xe giường nằm): long body, a band of tinted windows, its route board over the windscreen. */
function coachBody(k: DistrictKit, b: { x: number; z: number; yaw: number; len: number; width: number; seed: number }) {
  const F = k.frame(b.x, b.z, b.yaw), L = b.len, W = b.width, [body, stripe] = COACH_LIVERY[b.seed % COACH_LIVERY.length];
  k.lift(0);
  F.part(0, 1.95, 0, W, 2.9, L, body);
  F.part(0, 0.75, 0, W + 0.02, 0.5, L - 0.2, '#2b2f33');
  for (const s of [-1, 1]) {
    F.part(s * (W / 2 + 0.01), 2.55, -0.4, 0.04, 1.1, L - 2.4, '#2c3d47', 'glassLit', false);
    F.part(s * (W / 2 + 0.01), 1.55, 0, 0.04, 0.3, L - 0.4, stripe, 'solid', false);
    for (const lz of [-L / 2 + 2.2, L / 2 - 2.6]) F.solid('cylinder', s * (W / 2 - 0.2), 0.5, lz, 0.5, 0.32, 0.5, '#1f2224', HALF_PI, false);
  }
  F.part(0, 2.25, L / 2 + 0.01, W - 0.2, 1.5, 0.04, '#2c3d47', 'glassLit', false);
  const sp = F.at(0, L / 2 + 0.03);
  k.sign(COACH_ROUTES[b.seed % COACH_ROUTES.length], '', '#ffc23d', sp.x, 3.1, sp.z, W - 0.3, 0.32, b.yaw, '#1a1a1a');
}
/** A container truck in a loading bay: the tractor's cab and a 40-foot box on its skeleton trailer. */
function truckBody(k: DistrictKit, b: { x: number; z: number; yaw: number; len: number; width: number; seed: number }) {
  const F = k.frame(b.x, b.z, b.yaw), L = b.len, W = b.width, cab = ['#c8322a', '#2f6fb5', '#f1efe8', '#e0b030'][b.seed % 4];
  const box = FIXTURE_COLORS[(b.seed >> 3) % FIXTURE_COLORS.length];
  k.lift(0);
  F.part(0, 1.85, L / 2 - 1.5, W, 2.5, 2.9, cab);
  F.part(0, 2.45, L / 2 + 0.0, W - 0.2, 1.0, 0.04, '#2c3d47', 'glass', false);
  F.part(0, 1.15, -1.6, 0.9, 0.3, L - 4.4, '#2b2f33');
  F.part(0, 2.6, -1.9, W, 2.6, 12.2, box);
  for (let lz = -7.6; lz <= 4.4; lz += 1.5) F.part(0, 2.6, lz, W + 0.04, 2.5, 0.06, box, 'solid', false);
  for (const s of [-1, 1]) for (const lz of [L / 2 - 2.2, -5.5, -6.8]) F.solid('cylinder', s * (W / 2 - 0.25), 0.52, lz, 0.52, 0.34, 0.52, '#1f2224', HALF_PI, false);
}
/** The slices' extras: Quận 4's gantry cranes, cargo ship and Bến Nhà Rồng pier; Thủ Thiêm's tower crane and piers; the bảo tháp. */
function extras(k: DistrictKit, add: (x: number, z: number, slice: string, signs: boolean, draw: () => void) => void) {
  for (const r of RINGS) add(r.x, r.z, r.slice, true, () => island(k, r));
  for (const b of CURB_FLEET) add(b.x, b.z, b.kind === 'coach' ? 'binh-thanh' : 'quan-4', b.kind === 'coach', () => (b.kind === 'coach' ? k.lit(-1, () => coachBody(k, b)) : truckBody(k, b)));
  const q4 = SLICE_EXTRA['quan-4'];
  if (q4) {
    for (const c of q4.cranes) add(c.x, c.z, 'quan-4', true, () => k.lit(allNight(), () => gantry(k, c)));
    add(q4.ship.x, q4.ship.z, 'quan-4', true, () => k.lit(allNight(), () => ship(k, q4.ship)));
    for (const d of q4.docks) add(d.x, -140, 'quan-4', true, () => pier(k, d.pier, d.steps, d.name, 'TÀU BUÝT SÔNG • BẠCH ĐẰNG – THỦ THIÊM'));
  }
  // Bến Bình Thạnh: the standard waterbus pier on the south bank (consts.ts Dock shape at its x).
  const bt = SLICE_EXTRA['binh-thanh'];
  if (bt) for (const d of bt.docks) add(d.x, -140, 'binh-thanh', true, () => pier(k, { minX: d.x - 2, maxX: d.x + 2, minZ: -152, maxZ: -134.6 }, { minX: d.x + 2.6, maxX: d.x + 5, minZ: -140.5, maxZ: -134.6 }, d.name, 'TÀU BUÝT SÔNG • BẠCH ĐẰNG – BÌNH AN'));
  // The palace's fountain (QUAN_1_SOUTH_EXTRA.fountains).
  const q1x = SLICE_EXTRA['quan-1-south'];
  if (q1x) for (const f of q1x.fountains) add(f.x, f.z, 'quan-1-south', false, () => fountain(k, f.x, f.z, f.r));
  const tt = SLICE_EXTRA['thu-thiem'];
  if (tt) {
    add(tt.crane.x, tt.crane.z, 'thu-thiem', false, () => towerCrane(k, tt.crane));
    for (const w of tt.waterbus) add(w.x ?? 0, -200, 'thu-thiem', true, () => northPier(k, w));
    const vp = tt.villaPier;
    add(vp.x, (vp.z0 + vp.z1) / 2, 'thu-thiem', false, () => privatePier(k, vp));
    const pc = tt.petrol.canopy;
    add((pc.x0 + pc.x1) / 2, (pc.z0 + pc.z1) / 2, 'thu-thiem', true, () => petrol(k, tt.petrol));
  }
  // The bảo tháp of Vĩnh Nghiêm on its own ground (EXTRA.towers with `on`).
  for (const t of TOWERS) if (t.on) add(t.x, t.z, t.slice, false, () => stupa(k, t));
}
function gantry(k: DistrictKit, c: { x: number; z: number; yaw: number; gauge: number; span: number; h: number }) {
  const F = k.frame(c.x, c.z, c.yaw), y = c.h - 4;
  for (const j of [-1, 1]) { const p = F.at((c.span / 2) * j, 0); k.far('box', '#e0b030', p.x, y / 2, p.z, 1, y, c.gauge, c.yaw); }
  { const p = F.at(0, 18); k.far('box', '#e0b030', p.x, y + 2.4, p.z, 3.2, 1.6, 52, c.yaw); }
  // Legs (the fixtures stand at the bottom), the portal beams, the boom out over the water and the backreach.
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.part((c.span / 2) * j, y / 2, (c.gauge / 2) * i, 0.9, y, 0.9, '#e0b030');
  for (const i of [-1, 1]) F.part(0, y, (c.gauge / 2) * i, c.span + 1, 1.4, 1.2, '#e0b030');
  for (const j of [-1, 1]) F.part((c.span / 2) * j, y - 6, 0, 0.8, 0.8, c.gauge, '#d4a52a');
  F.part(0, y + 2.4, 18, 3.2, 1.6, 52, '#e0b030');
  F.part(0, y + 4.5, -2, 4, 5, 6, '#e8e2d0', 'solid');
  F.part(0, y + 4.5, 5, 2.4, 2.2, 3, '#5d8580', 'glassLit', false);
  for (const j of [-1, 1]) F.part(j * 1.2, y + 7.5, 4, 0.3, 0.3, 26, '#c79a24');
  F.part(0, y + 0.7, 30, 2.4, 1.2, 1.6, '#3a3f44');
  k.cable(F.at(0, 30).x, y + 0.2, F.at(0, 30).z, F.at(0, 30).x, 6, F.at(0, 30).z + 0.01, 0, 0.05, '#2b2b2b', false);
}
function ship(k: DistrictKit, s: ShipSpec) {
  // Hull 95 × 16 broadside to the wharf, its deck about 4 m over the water, a white bridge house aft, containers in two
  // rows of stacks with a walkway along each side (map/ship.ts: the same layout is the terrain's deck and the colliders).
  const lay = cargoShipLayout(s), F = k.frame(s.x, s.z, s.yaw), L = s.w, B = s.d, deck = lay.deckY, top = lay.top;
  k.far('box', '#3a4a5a', s.x, (WATER_LEVEL - 2 + deck) / 2, s.z, L, deck - WATER_LEVEL + 2, B, s.yaw);
  { const p = F.at(-L / 2 + 10, 0); k.far('box', '#f1efe8', p.x, top + 6, p.z, 10, 12, B - 4, s.yaw); }
  F.part(0, (WATER_LEVEL - 2 + deck) / 2, 0, L - 6, deck - WATER_LEVEL + 2, B, '#3a4a5a');
  F.part(0, WATER_LEVEL + 0.4, 0, L - 5.6, 0.8, B + 0.1, '#9a2f2a');
  F.solid('cone', L / 2 - 3, (WATER_LEVEL - 2 + deck) / 2, 0, B * 0.58, deck - WATER_LEVEL + 2, 6, '#3a4a5a', 0, true, -HALF_PI);
  F.part(0, deck + 0.1, 0, L - 6, 0.2, B - 0.4, '#7a5a48');
  // Bridge house: decks of windows, wings, the funnel.
  F.part(-L / 2 + 10, top + 6, 0, 10, 12, B - 4, '#f1efe8', 'solid');
  for (let y = top + 2; y < top + 11; y += 2.6) F.part(-L / 2 + 15.05, y, 0, 0.06, 1.1, B - 5, '#4f6f7a', 'glassLit', false);
  F.part(-L / 2 + 13, top + 10.4, 0, 4, 0.25, B - 0.6, '#f1efe8');
  F.part(-L / 2 + 8, top + 14, 0, 2, 4, 2, '#c8322a');
  // Containers (their stacks are the deck's colliders).
  for (const c of lay.stacks) {
    const tiers = Math.round(c.h / 2.6), color = FIXTURE_COLORS[c.color % FIXTURE_COLORS.length];
    for (let t = 0; t < tiers; t++) k.box(t % 2 ? color : FIXTURE_COLORS[(c.color + 3) % FIXTURE_COLORS.length], c.cx, top + t * 2.6 + 1.3, c.cz, c.hx * 2, 2.55, c.hz * 2 - 0.1, c.yaw);
    k.far('box', color, c.cx, top + c.h / 2, c.cz, c.hx * 2, c.h, c.hz * 2, c.yaw);
  }
  // Railings round the deck (open where the gangway lands).
  for (const r of lay.rails) for (let i = 0; i + 3 < r.length; i += 2) {
    const ax = r[i], az = r[i + 1], bx = r[i + 2], bz = r[i + 3], len = hyp(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    if (len < 0.2) continue;
    k.box('#d8d4c8', (ax + bx) / 2, top + 1.0, (az + bz) / 2, 0.06, 0.06, len, yaw, false);
    k.box('#d8d4c8', (ax + bx) / 2, top + 0.55, (az + bz) / 2, 0.05, 0.05, len, yaw, false);
    for (let t = 0; t <= len; t += 2) k.box('#d8d4c8', ax + ((bx - ax) * t) / len, top + 0.5, az + ((bz - az) * t) / len, 0.06, 1.0, 0.06, 0, false);
  }
  const sp = F.at(-L / 2 + 18, B / 2 + 0.05);
  k.sign('SEN VÀNG 07', 'SÀI GÒN', '#ffffff', sp.x, deck - 1.2, sp.z, 9, 1.4, s.yaw, '#3a4a5a');
  // The gangway: a sloped walkway with handrails from the quay up to the deck (the terrain's ramp).
  const g = lay.gangway;
  if (g) {
    const run = hyp(g.bx - g.ax, g.bz - g.az), ux = (g.bx - g.ax) / run, uz = (g.bz - g.az) / run, rise = g.y1 - g.y0, len = hyp(run, rise);
    const yaw = Math.atan2(-uz, ux), tilt = Math.atan2(rise, run), mx = (g.ax + g.bx) / 2, mz = (g.az + g.bz) / 2, my = (g.y0 + g.y1) / 2;
    k.shape('box', '#8a8f90', mx, my - 0.06, mz, len + 0.4, 0.12, 1.3, yaw, tilt, true);
    for (const side of [-0.62, 0.62]) {
      const ox = -uz * side, oz = ux * side;
      k.shape('box', '#c8ccce', mx + ox, my + 0.95, mz + oz, len, 0.05, 0.05, yaw, tilt, false);
      for (let t = 0.5; t < run; t += 1.6) k.box('#c8ccce', g.ax + ux * t + ox, g.y0 + (rise * t) / run + 0.48, g.az + uz * t + oz, 0.05, 0.95, 0.05, 0, false);
    }
    // Its foot on the quay: a little landing and a chain post either side.
    for (const side of [-0.9, 0.9]) k.shape('cylinder', '#e2b53a', g.ax - ux * 0.6 - uz * side, 0.5, g.az - uz * 0.6 + ux * side, 0.08, 0.9, 0.08, 0, 0, false);
  }
  // Moorings: the lines from the quay's bollards to the bow and stern, tyre fenders down the quay side, the pilot ladder.
  if (s.moor) {
    for (const m of s.moor.lines) {
      k.shape('cylinder', '#2b2f33', m.ax, 0.45, m.az, 0.22, 0.7, 0.22, 0, 0, true);
      k.cable(m.ax, 0.75, m.az, m.bx, deck + 0.4, m.bz, 0.8, 0.06, '#d8c9a0', false);
    }
    for (const f of s.moor.fenders) {
      // Three old tyres down the hull's side, on a rope from the rail.
      k.cable(f.x, top + 0.9, f.z - 0.2, f.x, WATER_LEVEL + 0.6, f.z, 0, 0.03, '#6b5a3a', false);
      for (let i = 0; i < 3; i++) k.shape('cylinder', '#1f2224', f.x, deck - 0.9 - i * 1.15, f.z, 0.5, 0.32, 0.5, HALF_PI, HALF_PI, true);
    }
    const l = s.moor.ladder, side = l.z < s.z ? -1 : 1;
    for (const dx of [-0.32, 0.32]) k.cable(l.x + dx, top + 0.9, l.z - side * 0.15, l.x + dx, WATER_LEVEL - 0.4, l.z, 0, 0.03, '#c9b78a', false);
    for (let y = WATER_LEVEL - 0.2; y < top + 0.6; y += 0.38) k.box('#8a5a3a', l.x, y, l.z, 0.72, 0.05, 0.12, 0, false);
  }
}
/** A waterbus pier on the south bank (consts.ts Dock shape): deck on piles out over the water, steps beside it, a gate with its name. */
function pier(k: DistrictKit, pier: { minX: number; maxX: number; minZ: number; maxZ: number }, steps: { minX: number; maxX: number; minZ: number; maxZ: number }, name: string, sub: string) {
  const px = (pier.minX + pier.maxX) / 2, pw = pier.maxX - pier.minX, from = pier.maxZ, to = pier.minZ, deckY = 0.28;
  k.box('#8a6a4c', px, deckY - 0.09, (from + to) / 2, pw, 0.18, from - to, 0, true);
  for (let z = from - 1.5; z > to; z -= 3) for (const s of [-1, 1]) k.shape('cylinder', '#5a4330', px + s * (pw / 2 - 0.2), -1.4, z, 0.16, 3.4, 0.16, 0, 0, false);
  for (const s of [-1, 1]) { k.box('#6e5238', px + s * (pw / 2 - 0.05), deckY + 0.95, (from + to) / 2 - 1, 0.08, 0.08, from - to - 2.4, 0, false); for (let z = from - 0.6; z > to + 2.4; z -= 2) k.box('#6e5238', px + s * (pw / 2 - 0.05), deckY + 0.5, z, 0.1, 0.95, 0.1, 0, false); }
  for (const s of [-1, 1]) { k.shape('cylinder', '#2b2f33', px + s * (pw / 2 - 0.2), deckY + 1.3, to + 1, 0.06, 2.6, 0.06, 0, 0, false); k.shape('ball', '#fff2c8', px + s * (pw / 2 - 0.2), deckY + 2.7, to + 1, 0.22, 0.25, 0.22, 0, 0, false, 'lamp'); k.light('park', px + s * (pw / 2 - 0.2), to + 1, deckY + 2.7, 1, 0, deckY + 0.02); }
  k.lit(lampSeed(px - pw / 2 + 0.2, to + 1), () => k.light('park', px, to + 1.6, 0, Math.min(6, pw - 0.4) / TONES.park.size, 1, deckY + 0.02));
  const sx = (steps.minX + steps.maxX) / 2, sw = steps.maxX - steps.minX;
  for (let i = 0; i < 9; i++) { const z0 = steps.maxZ - 1.4 - i * 0.5, top = 0.1 - i * 0.5 * 0.4; k.box('#c2b59a', sx, (top - 2.9) / 2, z0 - 0.25, sw, top + 2.9, 0.5, 0, false); }
  for (const s of [-1, 1]) k.box('#7a4a2e', px + s * (pw / 2 + 0.25), 1.6, from - 0.8, 0.3, 3.2, 0.3);
  k.box('#7a4a2e', px, 3.25, from - 0.8, pw + 1.2, 0.35, 0.4);
  k.sign(name, sub, '#8e2b20', px, 3.9, from - 0.6, Math.max(pw + 1.4, 6.2), 0.9, PI, '#f6efe0');
}
/** A pier on Thủ Thiêm's bank (reaching south over the river), as the south bank's but turned round. */
function northPier(k: DistrictKit, w: { name: string; x?: number; pier?: { minX: number; maxX: number; minZ: number; maxZ: number } }) {
  const p = w.pier;
  if (!p) return;
  const px = (p.minX + p.maxX) / 2, pw = p.maxX - p.minX, deckY = 0.28;
  k.box('#8a6a4c', px, deckY - 0.09, (p.minZ + p.maxZ) / 2, pw, 0.18, p.maxZ - p.minZ, 0, true);
  for (let z = p.minZ + 1.5; z < p.maxZ; z += 3) for (const s of [-1, 1]) k.shape('cylinder', '#5a4330', px + s * (pw / 2 - 0.2), -1.4, z, 0.16, 3.4, 0.16, 0, 0, false);
  for (const s of [-1, 1]) k.box('#6e5238', px + s * (pw / 2 - 0.05), deckY + 0.95, (p.minZ + p.maxZ) / 2 + 1, 0.08, 0.08, p.maxZ - p.minZ - 2.4, 0, false);
  // Two lamps at its end over the water, as the south bank's piers have: halos at their heads, one pool on the deck.
  for (const s of [-1, 1]) {
    const lx = px + s * (pw / 2 - 0.2), lz = p.maxZ - 1;
    k.shape('cylinder', '#2b2f33', lx, deckY + 1.3, lz, 0.06, 2.6, 0.06, 0, 0, false);
    k.shape('ball', '#fff2c8', lx, deckY + 2.7, lz, 0.22, 0.25, 0.22, 0, 0, false, 'lamp');
    k.light('park', lx, lz, deckY + 2.7, 1, 0, deckY + 0.02);
  }
  k.lit(lampSeed(px - pw / 2 + 0.2, p.maxZ - 1), () => k.light('park', px, p.maxZ - 1.6, 0, Math.min(6, pw - 0.4) / TONES.park.size, 1, deckY + 0.02));
  for (const s of [-1, 1]) k.box('#7a4a2e', px + s * (pw / 2 + 0.25), 1.6, p.minZ + 0.8, 0.3, 3.2, 0.3);
  k.box('#7a4a2e', px, 3.25, p.minZ + 0.8, pw + 1.2, 0.35, 0.4);
  k.sign(w.name, 'TÀU BUÝT SÔNG • ĐÒ NGANG', '#8e2b20', px, 3.9, p.minZ + 0.6, Math.max(pw + 1.4, 6.2), 0.9, 0, '#f6efe0');
  // Steps down to the waterline beside it, going out from the bank (z -203.6) towards the river.
  const st = (w as { steps?: { minX: number; maxX: number; minZ: number; maxZ: number } }).steps;
  if (st) {
    const sx = (st.minX + st.maxX) / 2, sw = st.maxX - st.minX;
    for (let i = 0; i < 9; i++) { const z0 = -203.6 + i * 0.5, top = 0.1 - i * 0.5 * 0.4; k.box('#c2b59a', sx, (top - 2.9) / 2, z0 + 0.25, sw, top + 2.9, 0.5, 0, false); }
  }
}
/** A round fountain: a stone basin, the water, a bowl on a column and jets. */
function fountain(k: DistrictKit, x: number, z: number, r: number) {
  k.lift(districtLift(x, z));
  k.shape('cylinder', '#d9d2c2', x, 0.35, z, r, 0.7, r);
  k.shape('cylinder', '#6fb0b4', x, 0.66, z, r - 0.35, 0.04, r - 0.35, 0, 0, true, 'water');
  k.shape('cylinder', '#d9d2c2', x, 1.4, z, 0.5, 2.2, 0.5);
  k.shape('cylinder', '#d9d2c2', x, 2.55, z, 2, 0.24, 2);
  k.shape('cylinder', '#7fc0c4', x, 2.68, z, 1.8, 0.04, 1.8, 0, 0, false, 'water');
  k.shape('cylinder', '#bfe3e6', x, 3.6, z, 0.12, 1.8, 0.12, 0, 0, false, 'water');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; k.shape('cylinder', '#bfe3e6', x + Math.cos(a) * (r - 1.2), 1.2, z + Math.sin(a) * (r - 1.2), 0.05, 1.1, 0.05, -a, 0.35, false, 'water'); }
  k.lift(0);
}
function privatePier(k: DistrictKit, v: { x: number; z0: number; z1: number }) {
  const len = Math.abs(v.z1 - v.z0), z = (v.z0 + v.z1) / 2;
  k.box('#7a5c40', v.x, 0.19, z, 2.4, 0.18, len, 0, true);
  for (let t = 1; t < len; t += 3) for (const s of [-1, 1]) k.shape('cylinder', '#4a3828', v.x + s * 1.0, -1.4, Math.min(v.z0, v.z1) + t, 0.14, 3.4, 0.14, 0, 0, false);
}
function towerCrane(k: DistrictKit, c: { x: number; z: number; base: number; mast: number; h: number; jib: number; counter: number; jibYaw: number }) {
  const yaw = c.jibYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (let y = 1.2; y < c.h; y += 3) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box('#e0b030', c.x + dx * c.mast / 2, y + 1.5, c.z + dz * c.mast / 2, 0.18, 3, 0.18, 0, false);
    k.box('#e0b030', c.x, y, c.z, c.mast, 0.12, c.mast, 0, false);
  }
  k.box('#e0b030', c.x + fx * (c.jib / 2 - c.counter / 2), c.h + 0.6, c.z + fz * (c.jib / 2 - c.counter / 2), 1.2, 1.2, c.jib + c.counter, yaw, true);
  k.box('#d4d0c4', c.x - fx * (c.counter - 2), c.h - 0.6, c.z - fz * (c.counter - 2), 3, 2.4, 4, yaw, true);
  k.box('#e8e2d0', c.x + fx * 2, c.h - 2, c.z + fz * 2, 2.2, 2.2, 2.4, yaw, true);
  k.box('#e0b030', c.x, c.h + 4, c.z, 0.6, 7, 0.6, 0, false);
  const tip = { x: c.x + fx * (c.jib - 4), z: c.z + fz * (c.jib - 4) };
  k.cable(tip.x, c.h, tip.z, tip.x, c.h * 0.55, tip.z + 0.01, 0, 0.05, '#2b2b2b', false);
  k.box('#3a3f44', tip.x, c.h * 0.55 - 0.6, tip.z, 1.2, 1.2, 1.2, 0, false);
}
function petrol(k: DistrictKit, p: { canopy: { x0: number; x1: number; z0: number; z1: number }; pumps: { x: number; z: number }[] }) {
  const c = p.canopy, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
  k.box('#f4f1e6', cx, 5.3, cz, c.x1 - c.x0, 0.6, c.z1 - c.z0);
  k.box('#c8322a', cx, 5.3, cz, c.x1 - c.x0 + 0.1, 0.25, c.z1 - c.z0 + 0.1, 0, false);
  for (let x = c.x0 + 2; x < c.x1; x += (c.x1 - c.x0 - 4) / 2) k.box('#d9d9d2', x, 2.5, cz, 0.4, 5, 0.4);
  for (const q of p.pumps) { k.box('#e8e2d0', q.x, 0.9, q.z, 1.2, 1.8, 0.6); k.box('#c8322a', q.x, 1.5, q.z, 1.25, 0.4, 0.62, 0, false); k.box('#d8e8f0', q.x, 5.0, q.z, 1.5, 0.08, 1.5, 0, false, 'lamp'); k.light('led', q.x, q.z, 5.0, 9 / TONES.led.size); }
  k.sign('XĂNG DẦU', 'RON 95 • E5 • DẦU DO', '#ffffff', cx, 5.3, c.z1 + 0.06, 8, 0.55, 0, '#c8322a');
}
function stupa(k: DistrictKit, t: { x: number; z: number; w: number; h: number }) {
  const tiers = 7, th = (t.h - 6) / tiers;
  k.box('#d6c2a0', t.x, 0.5, t.z, t.w + 2, 1, t.w + 2);
  for (let i = 0; i < tiers; i++) {
    const s = t.w * (1 - i * 0.09);
    k.box(i % 2 ? '#d6c2a0' : '#e7d3ad', t.x, 1 + i * th + th / 2, t.z, s, th - 0.4, s);
    k.shape('hip', '#8e4a33', t.x, 1 + (i + 1) * th - 0.2, t.z, s + 1.4, 0.8, s + 1.4, 0, 0, true, 'roofTile');
  }
  k.shape('cone', '#d8a531', t.x, t.h - 2.5, t.z, 0.6, 5, 0.6);
}

/** A colour nudged by a hash (paving shades). */
function vary(hex: string, h: number) {
  const v = parseInt(hex.slice(1), 16), d = ((h % 21) - 10) * 1.5;
  const c = (s: number) => clamp(Math.round(((v >> s) & 255) + d), 0, 255);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

/** Slices whose land the player can be on now (for the tile builder's order). */
export const sliceKeys = () => SLICES.map((s) => s.key);
export { isWired };
export type { SliceKey, TreeSpecies, Role };
