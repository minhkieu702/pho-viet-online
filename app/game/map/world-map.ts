/**
 * The live map (WIRING-PLAN §2): today's city (city.ts, frozen) plus the wired P1 slices, as the tables every system
 * reads. Client only: page.tsx and the SSR bundle never import it (map generation must not run in the Cloudflare
 * worker); node tests may (generation then runs in-process).
 *
 * Generation runs off the frame at load: world-map-worker.ts in a module worker (main-thread fallback, one slice per
 * task). This module waits for it with a top-level await, so whoever imports it reads final tables synchronously:
 * WORLD_ROADS (the welded road graph; link edges out), WORLD_BUILDINGS / WORLD_PLOTS (today's ids 0..163, then the
 * districts' in wiring order, `WORLD_BUILDINGS[id].id === id`), DISTRICT_COLLIDERS (oriented boxes with yaw, keys
 * namespaced `slice/key`), DISTRICT_SCENERY, WORLD_POIS, WORLD_LAMPS, DISTRICT_SIGNS, waters, decks, stamps, fences,
 * blocks, each slice's EXTRA and the edge works (lô cốt, hoardings, temporary fences) of this wiring step. Everything
 * a slice laid that the stack trimmed at a seam is left out. Today's scenery beyond the fences that now stands on a
 * district's land is listed in LEGACY_HIDDEN (city.ts keeps generating it; consumers filter).
 *
 * WIRED is driven by one constant, world-map-start.ts P1_WIRED (equal to lib/world-bounds.ts WIRED_SLICES, which the
 * bounds and WORLD_VERSION follow): the integrator steps both 1 (step 14, Quận 4) .. 5 (step 18, Thủ Thiêm). On localhost
 * `?wired=N` (or PVO_WIRED=N in node) overrides it for testing; nothing else changes it.
 */
import { BUILDINGS, COLLIDERS, LAND, LAMPS, PLOTS, POIS, SCENERY, type Building, type Plot, type Poi, type Point, type TreeSpecies } from '../city.ts';
import { createRoadGraph, type RoadEdge, type RoadGraph } from './roads.ts';
import { P1_LAYOUTS, P1_SEAMS } from './p1.ts';
import { stackKey, type Origin, type Trim } from './stack.ts';
import type { DistrictLayout } from './layout/types.ts';
import { QUAN_4_EXTRA } from './layout/quan-4.ts';
import { BINH_THANH_EXTRA } from './layout/binh-thanh.ts';
import { QUAN_3_EXTRA } from './layout/quan-3.ts';
import { QUAN_1_SOUTH_EXTRA } from './layout/quan-1-south.ts';
import { THU_THIEM_EXTRA } from './layout/thu-thiem.ts';
import type { BlockOut, DeckOut, DistrictData, DoorOut, FenceOut, StampOut, WaterOut } from './build-district.ts';
import { buildWorldRoads, setWorldRoads, type EdgeInfo, type SliceTrafficExtra, type WorldRoads } from './world-types.ts';
import { createTerrain, installTerrain, worldTerrain, type SliceTerrainExtra } from './terrain.ts';
import type { GenBuilding, GenPlot, GenSign } from './gen/buildings.ts';
import type { Eatery, GenLamp, GenPoi, GenProp, Parked, Pole, SolidKind } from './gen/dressing.ts';
import type { OBB } from './gen/geom.ts';
import type { MapPayload, SliceData } from './world-map-worker.ts';
import { cargoShipLayout } from './ship.ts';
import { curbFleet } from './curb-fleet.ts';
import { expandRoundabouts, type Ring, type RingSpec } from './roundabouts.ts';
import { MAP_PROMISE, MAP_STARTED, generate } from './world-map-start.ts';
import { P1_ORDER, WIRED_COUNT, WIRED_KEYS, isWired, type SliceKey } from './wiring.ts';

export type { MapPayload, SliceData } from './world-map-worker.ts';

// ---------------------------------------------------------------------------------------------------------------
// Which slices are live, and their generation (started by world-map-start.ts before city.ts was evaluated)
// ---------------------------------------------------------------------------------------------------------------

// Which slices are wired: map/wiring.ts (lib/world-bounds.ts WIRED_SLICES; `?wired=` / PVO_WIRED for testing).
export { P1_WIRED, WIRED_COUNT, WIRED_KEYS, isWired, type SliceKey } from './wiring.ts';
if (P1_ORDER.join() !== P1_LAYOUTS.map((l) => l.key).join()) throw new Error(`world-map: map/wiring.ts orders the P1 slices ${P1_ORDER.join()}, p1.ts ${P1_LAYOUTS.map((l) => l.key).join()}`);
/** The wired layouts, in wiring order. */
export const WIRED: readonly DistrictLayout[] = P1_LAYOUTS.slice(0, WIRED_COUNT);

const RINGS_BUILT: Ring[] = [];
/** Today's BUILDINGS.length: district ids start here (buildP1's idBase). */
export const ID_BASE = BUILDINGS.length;
/** The generator's output for the wired slices (raw; the tables below are built from it). */
export const WORLD_MAP: MapPayload = await (async () => {
  const payload = await MAP_PROMISE;
  if (payload.idBase === ID_BASE && payload.count === WIRED_COUNT) return payload;
  console.warn(`world-map: city.ts has ${ID_BASE} buildings, not ${payload.idBase}: generating again`);
  return generate(ID_BASE);
})();
/** Milliseconds from the start of generation to the map being ready here (generation plus transfer), for the HUD and benches. */
export const WORLD_MAP_MS = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - MAP_STARTED);
if (WORLD_MAP.issues.length) console.warn(`world-map: the stack reports ${WORLD_MAP.issues.length} issues`, WORLD_MAP.issues.slice(0, 8));

// ---------------------------------------------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------------------------------------------

/** Roundabout hints (node ids: the junction each ring replaces, left with no roads in WORLD_ROADS). */
export const ROUNDABOUTS = WORLD_MAP.roundabouts;
/**
 * The roundabouts as rings (map/roundabouts.ts): each hint's outer kerb radius from the junction hint, its island
 * and name from the slice's EXTRA (Hồ Con Rùa and Dân Chủ in Quận 3; Công xã Paris and Quách Thị Trang in Quận 1
 * south). The live graph's input is rewritten before WORLD_ROADS is made, and the dressing the generator laid inside
 * a ring (a tree, a lamp, a bin, a parked bike on the old corners) is trimmed like dressing at a seam.
 */
const RING_DATA: { x: number; z: number; island: number; name: string; id: string; pool: number; monument: number; statue: string | null }[] = [
  ...(isWired('quan-3') ? QUAN_3_EXTRA.roundabouts.map((r) => ({ x: r.x, z: r.z, island: r.island, name: r.id === 'ho-con-rua' ? 'VÒNG XOAY HỒ CON RÙA' : r.name, id: r.id, pool: r.pool, monument: r.monument.h, statue: null })) : []),
  ...(isWired('quan-1-south') ? QUAN_1_SOUTH_EXTRA.statues.map((s) => ({ x: s.x, z: s.z, island: s.island, name: s.x < 200 ? 'VÒNG XOAY CÔNG XÃ PARIS' : 'VÒNG XOAY QUÁCH THỊ TRANG', id: s.x < 200 ? 'cong-xa-paris' : 'quach-thi-trang', pool: 0, monument: 0, statue: s.name })) : []),
];
const ringSpecs: RingSpec[] = [];
for (const r of WORLD_MAP.roundabouts) {
  const n = WORLD_MAP.live.input.nodes[r.node], d = n ? RING_DATA.find((q) => Math.hypot(q.x - n.x, q.z - n.z) < 1) : null;
  if (d && d.island < r.radius - 3) ringSpecs.push({ node: r.node, radius: r.radius, island: d.island, name: d.name, slice: r.slice, id: d.id });
}
{
  const ex = expandRoundabouts(WORLD_MAP.live.input, WORLD_MAP.live.edgeOf, WORLD_MAP.live.nodeOf, ringSpecs);
  WORLD_MAP.live = { input: ex.input, edgeOf: ex.edgeOf, nodeOf: ex.nodeOf };
  RINGS_BUILT.push(...ex.rings);
  // What the generator laid where a ring's asphalt now runs (inside its outer kerb, but not on its island): trimmed.
  for (const ring of ex.rings) {
    const inRing = (x: number, z: number, m = 0) => { const d = Math.hypot(x - ring.x, z - ring.z); return d < ring.radius + 0.4 + m && d > ring.island - 0.3 - m; };
    const s = WORLD_MAP.slices.find((q) => q.key === ring.slice);
    if (!s) continue;
    const sc = s.data.scenery, trim = (key: string, kind: string, x: number, z: number) => WORLD_MAP.trimmed.push({ slice: s.key, key, kind, why: `in the ${ring.name} ring`, x, z });
    for (const t of sc.trees) if (inRing(t.x, t.z, 0.6)) trim(`ring-tree:${t.x}:${t.z}`, 'tree', t.x, t.z);
    for (const l of sc.lamps) if (inRing(l.x, l.z, 0.3)) trim(`ring-lamp:${l.x}:${l.z}`, 'lamp', l.x, l.z);
    for (const p of [...sc.props, ...sc.parked, ...sc.eateries, ...sc.poles]) if (inRing(p.x, p.z, 0.5)) trim(p.key, 'prop', p.x, p.z);
    for (const p of s.data.pois) if (inRing(p.x, p.z, 0.3)) trim(p.key, 'poi', p.x, p.z);
    for (const c of s.data.colliders) if (c.kind !== 'building' && inRing(c.cx, c.cz, Math.max(c.hx, c.hz))) trim(c.key, 'collider', c.cx, c.cz);
  }
}
/** The live road graph: today's grid with every wired slice's patch applied and the seams among them welded (no link edges), roundabouts built as rings. */
export const WORLD_ROADS: RoadGraph = createRoadGraph(WORLD_MAP.live.input);
/** Per WORLD_ROADS node (same index): who built it and its stable key ('legacy:<id>', a slice node key, 'seam:<id>', 'ring:<id>:<k>'). */
export const NODE_INFO: readonly Origin[] = WORLD_MAP.live.nodeOf;
/** The rings with their islands, what stands on each, and their ring nodes and arcs. */
export const RINGS: readonly (Ring & { pool: number; monument: number; statue: string | null })[] = RINGS_BUILT.map((r) => { const d = RING_DATA.find((q) => q.id === r.id)!; return { ...r, pool: d.pool, monument: d.monument, statue: d.statue }; });

// ---------------------------------------------------------------------------------------------------------------
// The slices
// ---------------------------------------------------------------------------------------------------------------

export type SliceInfo = {
  key: SliceKey; layout: DistrictLayout; district: string; name: string;
  /** The land the slice builds on (x,z pairs: the layout's bounds; its waters are cut out of it by the blocks). */
  bounds: number[];
  /** Building ids [from, to). */
  ids: [number, number];
  /** Axis box of the bounds. */
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  data: SliceData;
};
export const SLICES: readonly SliceInfo[] = WORLD_MAP.slices.map((s) => {
  const layout = WIRED.find((l) => l.key === s.key)!;
  const b = layout.bounds;
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let k = 0; k < b.length; k += 2) { box.minX = Math.min(box.minX, b[k]); box.maxX = Math.max(box.maxX, b[k]); box.minZ = Math.min(box.minZ, b[k + 1]); box.maxZ = Math.max(box.maxZ, b[k + 1]); }
  const from = s.data.idBase;
  return { key: s.key as SliceKey, layout, district: layout.id, name: layout.name, bounds: b.slice(), ids: [from, from + s.data.buildings.length] as [number, number], box, data: s.data };
});
const inPolygon = (p: readonly number[], x: number, z: number) => {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
/** The wired slice whose bounds hold (x, z) (water inside them included), or null (today's land, the river, unbuilt land). */
export function sliceAt(x: number, z: number): SliceInfo | null {
  for (const s of SLICES) if (x >= s.box.minX && x <= s.box.maxX && z >= s.box.minZ && z <= s.box.maxZ && inPolygon(s.bounds, x, z)) return s;
  return null;
}
/** The slice that built district building `id`, or null for today's buildings. */
export const sliceOfBuilding = (id: number) => SLICES.find((s) => id >= s.ids[0] && id < s.ids[1]) ?? null;

/** Each wired slice's EXTRA (what the layout format has no field for: towers, cranes, docks, curb hours, zones, edge works…). */
export const SLICE_EXTRA: {
  'quan-4'?: typeof QUAN_4_EXTRA; 'binh-thanh'?: typeof BINH_THANH_EXTRA; 'quan-3'?: typeof QUAN_3_EXTRA; 'quan-1-south'?: typeof QUAN_1_SOUTH_EXTRA; 'thu-thiem'?: typeof THU_THIEM_EXTRA;
} = {
  ...(isWired('quan-4') ? { 'quan-4': QUAN_4_EXTRA } : {}),
  ...(isWired('binh-thanh') ? { 'binh-thanh': BINH_THANH_EXTRA } : {}),
  ...(isWired('quan-3') ? { 'quan-3': QUAN_3_EXTRA } : {}),
  ...(isWired('quan-1-south') ? { 'quan-1-south': QUAN_1_SOUTH_EXTRA } : {}),
  ...(isWired('thu-thiem') ? { 'thu-thiem': THU_THIEM_EXTRA } : {}),
};
/** Every wired slice's EXTRA.towers (spires, bell towers, clock towers, the bảo tháp), with its slice. */
/**
 * The live roads as every system sees them (map/world-types.ts WorldRoads: the graph, per-edge info, the wired shelters
 * and the 23/9 terminus), handed to the traffic systems (worldRoads()) at once, before the game is created.
 */
export const WORLD_TRAFFIC: WorldRoads = buildWorldRoads(
  WORLD_ROADS, WORLD_MAP.live.edgeOf,
  SLICES.map((s) => ({ key: s.key, layout: s.layout, data: s.data as unknown as DistrictData, links: [] })),
  SLICE_EXTRA as unknown as Record<string, SliceTrafficExtra | undefined>,
);
setWorldRoads(WORLD_TRAFFIC);
/**
 * Per WORLD_ROADS edge (same index), the one edge record (world-types.ts EdgeInfo, the same objects worldRoads().edges
 * holds): who built it ('legacy', a slice key), its stable key, arterial, district, closing hours, truck ban, bus
 * route, curb uses, hẻm block and bays with their hours.
 */
export const EDGE_INFO: readonly EdgeInfo[] = WORLD_TRAFFIC.edges;
/** WORLD_ROADS edges that are legacy (built by today's grid). */
export const isLegacyEdge = (e: RoadEdge | number) => EDGE_INFO[typeof e === 'number' ? e : e.id].slice === 'legacy';
export type { EdgeInfo } from './world-types.ts';
export const TOWERS: readonly { slice: SliceKey; stamp: string; kind: string; x: number; z: number; w: number; d: number; h: number; on?: string }[] = SLICES.flatMap((s) =>
  ((SLICE_EXTRA[s.key] as { towers?: { stamp: string; kind: string; x: number; z: number; w: number; d: number; h: number; on?: string }[] } | undefined)?.towers ?? []).map((t) => ({ ...t, slice: s.key })));

// ---------------------------------------------------------------------------------------------------------------
// What the stack trimmed at the seams
// ---------------------------------------------------------------------------------------------------------------

const trimmedKeys = new Set(WORLD_MAP.trimmed.map((t) => `${t.slice}|${t.key}`));
const trimmedAt = (slice: string, kind: string) => WORLD_MAP.trimmed.filter((t) => t.slice === slice && t.kind === kind);
const isTrimmed = (slice: string, key: string) => trimmedKeys.has(`${slice}|${key}`);
/** Trees and lamps carry no key: a trimmed one is matched by the position of its collider. */
const trimmedNear = (list: Trim[], x: number, z: number) => list.some((t) => Math.abs(t.x - x) < 0.02 && Math.abs(t.z - z) < 0.02);
export const TRIMMED: readonly Trim[] = WORLD_MAP.trimmed;

// ---------------------------------------------------------------------------------------------------------------
// Buildings, plots, doors
// ---------------------------------------------------------------------------------------------------------------

/** District buildings (GenBuilding: today's Building plus key, typology, storeys, facade, oriented box, address…), ids from ID_BASE on. */
export const DISTRICT_BUILDINGS: readonly GenBuilding[] = SLICES.flatMap((s) => s.data.buildings);
/** District plots (GenPlot), index for index with DISTRICT_BUILDINGS. Churches have style 'church' (gen/buildings.ts). */
export const DISTRICT_PLOTS: readonly GenPlot[] = SLICES.flatMap((s) => s.data.plots);
/** Today's buildings then the districts': WORLD_BUILDINGS[id].id === id. */
export const WORLD_BUILDINGS: readonly Building[] = [...BUILDINGS, ...DISTRICT_BUILDINGS];
export const WORLD_PLOTS: readonly Plot[] = [...PLOTS, ...DISTRICT_PLOTS];
/** A district building (or null for today's): its GenBuilding. */
export const genBuilding = (id: number): GenBuilding | null => (id >= ID_BASE ? (DISTRICT_BUILDINGS[id - ID_BASE] ?? null) : null);
export const genPlot = (id: number): GenPlot | null => (id >= ID_BASE ? (DISTRICT_PLOTS[id - ID_BASE] ?? null) : null);
/** Doors of the district buildings: the building id, the door (just outside the front wall), its curb on the walking line, facing. */
export const DISTRICT_DOORS: readonly (DoorOut & { slice: SliceKey })[] = SLICES.flatMap((s) => s.data.doors.map((d) => ({ ...d, slice: s.key })));
/** Stamps (authored buildings: landmarks, story sites, markets, churches, pagodas…): `building` is the WORLD id, -1 for a park. */
export const DISTRICT_STAMPS: readonly (StampOut & { slice: SliceKey })[] = SLICES.flatMap((s) => s.data.stamps.map((t) => ({ ...t, slice: s.key })));
/** Blocks (the faces between streets, banks and bounds; `buildings` are WORLD ids). */
export const DISTRICT_BLOCKS: readonly (BlockOut & { slice: SliceKey })[] = SLICES.flatMap((s) => s.data.blocks.map((b) => ({ ...b, slice: s.key })));

// ---------------------------------------------------------------------------------------------------------------
// Solids
// ---------------------------------------------------------------------------------------------------------------

/**
 * An oriented box (collision.ts addBox(cx, cz, hx, hz, yaw, -Infinity, top, owner, ref)): hx along its right
 * (cos yaw, -sin yaw), hz along its forward (sin yaw, cos yaw). `kind` is the generator's (building, tree, lamp, pole,
 * prop, table) or 'works' (lô cốt, hoardings, temporary fences) or 'legacy' (today's COLLIDERS as yaw-0 boxes); `key`
 * is namespaced `slice/key` ('legacy:<index>' for today's); top is the height (Infinity for today's untopped ones).
 */
export type WorldSolid = OBB & { top: number; kind: SolidKind | 'works' | 'legacy'; key: string; slice: string };
/** The districts' solids (buildings, trees, lamps, poles, props, tables; no parked motos: those are vehicles), plus WORKS'. */
export const DISTRICT_COLLIDERS: WorldSolid[] = [];
for (const s of SLICES) {
  const trees = trimmedAt(s.key, 'tree'), lamps = trimmedAt(s.key, 'lamp');
  for (const c of s.data.colliders) {
    if (c.kind === 'moto') continue;
    if (isTrimmed(s.key, c.key) || (c.kind === 'tree' && trimmedNear(trees, c.cx, c.cz)) || (c.kind === 'lamp' && trimmedNear(lamps, c.cx, c.cz))) continue;
    DISTRICT_COLLIDERS.push({ cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz, yaw: c.yaw, top: c.top, kind: c.kind, key: stackKey(s.key, c.key), slice: s.key });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Scenery, places, lamps, signs, waters, decks, fences
// ---------------------------------------------------------------------------------------------------------------

type Tagged<T> = T & { slice: SliceKey };
export type DistrictScenery = {
  trees: Tagged<{ species: TreeSpecies; x: number; z: number; size: number; spin: number; tint: number }>[];
  lamps: Tagged<GenLamp>[]; props: Tagged<GenProp>[]; benches: Tagged<{ x: number; z: number; yaw: number }>[]; busStops: Tagged<{ x: number; z: number; yaw: number }>[];
  /** Curb motos (vehicles.ts curb mode): never drawn as scenery. */
  parked: Tagged<Parked>[]; eateries: Tagged<Eatery>[]; poles: Tagged<Pole>[];
  parks: Tagged<{ poly: number[] }>[]; yards: Tagged<{ poly: number[] }>[]; walks: Tagged<{ poly: number[] }>[];
};
/** Everything the districts dress their streets and blocks with; keys (props, parked, eateries, poles, POIs) are namespaced `slice/key`. */
export const DISTRICT_SCENERY: DistrictScenery = { trees: [], lamps: [], props: [], benches: [], busStops: [], parked: [], eateries: [], poles: [], parks: [], yards: [], walks: [] };
for (const s of SLICES) {
  const sc = s.data.scenery, k = s.key, trees = trimmedAt(k, 'tree'), lamps = trimmedAt(k, 'lamp');
  const key = (x: string) => stackKey(k, x);
  for (const t of sc.trees) if (!trimmedNear(trees, t.x, t.z)) DISTRICT_SCENERY.trees.push({ ...t, slice: k });
  for (const l of sc.lamps) if (!trimmedNear(lamps, l.x, l.z)) DISTRICT_SCENERY.lamps.push({ ...l, slice: k });
  for (const p of sc.props) if (!isTrimmed(k, p.key)) DISTRICT_SCENERY.props.push({ ...p, key: key(p.key), slice: k });
  for (const b of sc.benches) DISTRICT_SCENERY.benches.push({ ...b, slice: k });
  for (const b of sc.busStops) DISTRICT_SCENERY.busStops.push({ ...b, slice: k });
  for (const p of sc.parked) if (!isTrimmed(k, p.key)) DISTRICT_SCENERY.parked.push({ ...p, key: key(p.key), slice: k });
  for (const e of sc.eateries) if (!isTrimmed(k, e.key)) DISTRICT_SCENERY.eateries.push({ ...e, key: key(e.key), seats: e.seats.map(key), building: e.building, slice: k });
  for (const p of sc.poles) if (!isTrimmed(k, p.key)) DISTRICT_SCENERY.poles.push({ ...p, key: key(p.key), line: `${k}:${p.line}`, slice: k });
  for (const poly of sc.parks) DISTRICT_SCENERY.parks.push({ poly, slice: k });
  for (const poly of sc.yards) DISTRICT_SCENERY.yards.push({ poly, slice: k });
  for (const poly of sc.walks) DISTRICT_SCENERY.walks.push({ poly, slice: k });
}
/** District places (seats, stalls, yards, bus stops…) with their slice, namespaced key and opening hours; `id` is the WORLD_POIS id. */
export type DistrictPoi = GenPoi & { id: number; slice: SliceKey };
export const DISTRICT_POIS: DistrictPoi[] = [];
/** Today's POIS then the districts': WORLD_POIS[id].id === id. */
export const WORLD_POIS: Poi[] = [...POIS];
for (const s of SLICES) for (const p of s.data.pois) {
  if (isTrimmed(s.key, p.key)) continue;
  const id = WORLD_POIS.length;
  DISTRICT_POIS.push({ ...p, key: stackKey(s.key, p.key), id, slice: s.key });
  WORLD_POIS.push({ id, kind: p.kind, x: p.x, z: p.z, yaw: p.yaw, curb: { ...p.curb }, seat: p.seat });
}
/** Lamp heads for light pools: today's LAMPS then the districts' (street and post lamps, wall lamps over hẻm). */
export const DISTRICT_LAMPS: readonly Point[] = DISTRICT_SCENERY.lamps.map((l) => ({ x: l.hx, z: l.hz }));
export const WORLD_LAMPS: readonly Point[] = [...LAMPS, ...DISTRICT_LAMPS];
/** District sign boards (shop boards, vertical light boxes, plates, hẻm arches, gates) as laid by the generator, readdressed. */
export const DISTRICT_SIGNS: readonly Tagged<GenSign>[] = SLICES.flatMap((s) => s.data.signs.map((g) => ({ ...g, key: stackKey(s.key, g.key), slice: s.key })));
/**
 * Waterways of the wired slices, each once (a canal two slices share comes from the first wired one): polygon, kind
 * and typed banks (kè, promenade, wharf, mud) with the normal out over the water.
 */
export const DISTRICT_WATERS: readonly Tagged<WaterOut>[] = (() => {
  const seen = new Set<string>(), out: Tagged<WaterOut>[] = [];
  for (const s of SLICES) for (const w of s.data.waters) if (!seen.has(w.id)) { seen.add(w.id); out.push({ ...w, slice: s.key }); }
  return out;
})();
/** Water-only bridge decks (yHint over the water, ramps either side), WORLD_ROADS edge keys namespaced. */
export const DISTRICT_DECKS: readonly Tagged<DeckOut>[] = SLICES.flatMap((s) => s.data.decks.map((d) => ({ ...d, slice: s.key })));
/** Fences and walls the layouts laid (port fences, compound walls, the Chợ Lớn edge hoarding): their panels are DISTRICT_SCENERY props of kind fence/wall. */
export const DISTRICT_FENCES: readonly Tagged<FenceOut>[] = SLICES.flatMap((s) => s.data.fences.map((f) => ({ ...f, slice: s.key })));

// ---------------------------------------------------------------------------------------------------------------
// Today's scenery on district land
// ---------------------------------------------------------------------------------------------------------------

/**
 * Today's scenery generated beyond the fences (x -199..-141 and the like) that now stands on a wired slice's land,
 * by index into SCENERY.trees / .lamps / .props / .poles and into COLLIDERS. city.ts keeps generating it (one rng);
 * world.ts skips drawing it and its colliders, and other consumers should skip it too.
 */
export const LEGACY_HIDDEN = (() => {
  const hide = (x: number, z: number) => !(x >= LAND.minX && x <= LAND.maxX && z >= LAND.minZ && z <= LAND.maxZ) && !!sliceAt(x, z);
  const trees = new Set<number>(), lamps = new Set<number>(), props = new Set<number>(), poles = new Set<number>(), colliders = new Set<number>();
  SCENERY.trees.forEach((t, i) => { if (hide(t.x, t.z)) trees.add(i); });
  SCENERY.lamps.forEach((l, i) => { if (hide(l.x, l.z)) lamps.add(i); });
  SCENERY.props.forEach((p, i) => { if (hide(p.x, p.z)) props.add(i); });
  SCENERY.poles.forEach((p, i) => { if (hide(p.x, p.z)) poles.add(i); });
  COLLIDERS.forEach((c, i) => { if (hide((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2)) colliders.add(i); });
  return { trees, lamps, props, poles, colliders };
})();

// ---------------------------------------------------------------------------------------------------------------
// Edge works: lô cốt and hoardings where wired land faces unbuilt land
// ---------------------------------------------------------------------------------------------------------------

/** A lô cốt (road-works enclosure "CÔNG TRÌNH ĐANG THI CÔNG"): centre, heading of the road it closes (yaw), `w` across it, `d` along it. */
export type LoCot = { id: string; x: number; z: number; yaw: number; w: number; d: number; h: number; text: string; slice: string; temporary: boolean };
/** A hoarding or fence run along `pts` (cut where roads cross it), `h` tall; `sign` repeats every `signEvery` m facing `face` (+1: right of the run). */
export type Run = { id: string; pts: number[]; h: number; kind: 'hoarding' | 'fence'; sign: string | null; signEvery: number; face: 1 | -1; slice: string; temporary: boolean };
export type BeltTree = { x: number; z: number; species: TreeSpecies; size: number; slice: string };
export type WorksSign = { x: number; z: number; yaw: number; text: string; subtitle: string };
export type Works = { loCot: LoCot[]; runs: Run[]; belts: BeltTree[]; signs: WorksSign[]; colliders: WorldSolid[] };

/** Temporary fences of the wiring steps (WIRING-PLAN §3), live while `has` are wired and `not` are not. */
const TEMP_RUNS: { id: string; has: SliceKey[]; not: SliceKey[]; pts: number[] }[] = [
  // Step 14: Quận 1 south's land is not built (west of the canal strip and north of the canal's bend).
  { id: 'tam-q1-x352', has: ['quan-4'], not: ['quan-1-south'], pts: [352, 137.5, 352, 318, 392, 318] },
  // Step 15: Quận 3 is not built: round Bình Thạnh's tongue and along the D1/D3 line.
  { id: 'tam-bt-luoi', has: ['binh-thanh'], not: ['quan-3'], pts: [-138, 137.5, -160, 137.5, -160, 170, -190, 170] },
  // Step 16: Quận 1 south is not built: the palace superblock and the x 135 line.
  { id: 'tam-q3-dinh', has: ['quan-3'], not: ['quan-1-south'], pts: [-45, 228.5, 135, 228.5, 135, 368, -45, 368, -45, 228.5] },
  { id: 'tam-q3-x135-bac', has: ['quan-3'], not: ['quan-1-south'], pts: [135, 137.5, 135, 228.5] },
  { id: 'tam-q3-x135-nam', has: ['quan-3'], not: ['quan-1-south'], pts: [135, 368, 135, 445] },
];
const H = Math.PI / 2;
const hyp = (x: number, z: number) => Math.sqrt(x * x + z * z);
const r2 = (v: number) => Math.round(v * 100) / 100;

function buildWorks(): Works {
  const works: Works = { loCot: [], runs: [], belts: [], signs: [], colliders: [] };
  const wired = new Set<string>(WIRED_KEYS);
  // Open road ends at seams whose other side is not wired: a lô cốt across the end, as wide as its asphalt and sidewalks.
  for (const seam of P1_SEAMS) {
    if (seam.kind === 'footway') continue;
    const on = seam.slices.filter((k) => wired.has(k));
    if (on.length !== 1) continue;
    for (const n of WORLD_ROADS.nodes) {
      if (n.arms.length !== 1 || Math.abs(n.x - seam.x) > 0.05 || Math.abs(n.z - seam.z) > 0.05) continue;
      const arm = n.arms[0], e = WORLD_ROADS.edges[arm.edge];
      const yaw = Math.atan2(-arm.hx, -arm.hz);
      works.loCot.push({ id: `lo-cot-${seam.id}`, x: n.x - arm.hx * 1.3, z: n.z - arm.hz * 1.3, yaw, w: r2(2 * (e.half + e.sidewalk) + 0.8), d: 2.4, h: 2.3, text: 'CÔNG TRÌNH ĐANG THI CÔNG', slice: on[0], temporary: true });
    }
  }
  for (const t of TEMP_RUNS) {
    if (!t.has.every((k) => wired.has(k)) || t.not.some((k) => wired.has(k))) continue;
    works.runs.push({ id: t.id, pts: t.pts.slice(), h: 2.4, kind: 'fence', sign: 'CÔNG TRƯỜNG • CẤM VÀO', signEvery: 45, face: 1, slice: t.has[0], temporary: true });
  }
  // Bình Thạnh's P1 edge on Nơ Trang Long: KHU ĐẤT DỰ ÁN along x -713.5, its lô cốt in the openings, tall trees behind.
  const bt = SLICE_EXTRA['binh-thanh'];
  if (bt) {
    const e = bt.p2.edge;
    bt.p2.loCot.forEach((l, i) => works.loCot.push({ id: `lo-cot-p2-${i}`, x: l.x, z: l.z, yaw: l.yaw, w: l.w, d: 2.4, h: 2.3, text: 'CÔNG TRÌNH ĐANG THI CÔNG', slice: 'binh-thanh', temporary: false }));
    works.runs.push({ id: 'rao-du-an-no-trang-long', pts: [e.x, e.z1, e.x, e.z0], h: e.h, kind: 'hoarding', sign: e.sign, signEvery: e.signEvery, face: 1, slice: 'binh-thanh', temporary: false });
    for (let z = e.z0 + 3; z <= e.z1; z += e.belt.step) works.belts.push({ x: e.belt.x - ((z * 7.31) % 1.5), z, species: e.belt.species, size: 1 + ((z * 3.17) % 0.35), slice: 'binh-thanh' });
  }
  // Quận 3's Chợ Lớn edge: the hoarding runs are layout fences; the lô cốt on their line, the signs, the tree belt, Cầu CMT8's works.
  const q3 = SLICE_EXTRA['quan-3'];
  if (q3) {
    q3.loCot.forEach((l) => works.loCot.push({ id: `lo-cot-${l.road}`, x: l.x, z: l.z, yaw: l.yaw, w: l.w, d: l.d, h: 2.3, text: 'ĐI CHỢ LỚN • CÔNG TRÌNH ĐANG THI CÔNG', slice: 'quan-3', temporary: false }));
    for (const s of q3.edge.signs) works.signs.push({ x: s.x, z: s.z, yaw: s.yaw, text: s.text, subtitle: 'CÔNG TRÌNH ĐANG THI CÔNG' });
    for (const [x, z] of q3.edge.belt) works.belts.push({ x, z, species: 'tall', size: 1 + ((z * 3.17) % 0.35), slice: 'quan-3' });
    const c = q3.cmt8Works;
    works.loCot.push({ id: 'cong-truong-cau-cmt8', x: c.x, z: c.z, yaw: c.yaw + H, w: c.d, d: c.w, h: 2.3, text: 'CẦU CÁCH MẠNG THÁNG TÁM', slice: 'quan-3', temporary: false });
    works.signs.push({ x: c.sign.x, z: c.sign.z, yaw: c.sign.yaw, text: 'CẦU CÁCH MẠNG THÁNG TÁM', subtitle: 'CÔNG TRÌNH ĐANG THI CÔNG' });
  }
  // Quận 1 south: the lô cốt at the foot of the future Cầu Chữ Y.
  const q1 = SLICE_EXTRA['quan-1-south'];
  if (q1) q1.locot.forEach((l, i) => works.loCot.push({ id: `lo-cot-chu-y-${i}`, x: l.x, z: l.z, yaw: l.yaw, w: l.w, d: 2.4, h: 2.3, text: 'CẦU CHỮ Y • CÔNG TRÌNH ĐANG THI CÔNG', slice: 'quan-1-south', temporary: false }));
  // Thủ Thiêm's edges: hoardings beyond the outer sidewalks, the lô cốt in their openings.
  const tt = SLICE_EXTRA['thu-thiem'];
  if (tt) {
    tt.loCot.forEach((l, i) => works.loCot.push({ id: `lo-cot-tt-${i}`, x: l.x, z: l.z, yaw: l.yaw, w: l.w, d: 2.4, h: 2.3, text: 'CÔNG TRÌNH ĐANG THI CÔNG', slice: 'thu-thiem', temporary: false }));
    for (const r of tt.edge.runs) works.runs.push({ id: r.id, pts: r.pts.slice(), h: tt.edge.h, kind: 'hoarding', sign: tt.edge.sign, signEvery: tt.edge.signEvery, face: 1, slice: 'thu-thiem', temporary: false });
  }
  // Cut every run where a lô cốt stands on it and where a live road's asphalt and sidewalks cross it.
  const cutRuns: Run[] = [];
  for (const run of works.runs) {
    for (let k = 0; k + 3 < run.pts.length; k += 2) {
      const ax = run.pts[k], az = run.pts[k + 1], bx = run.pts[k + 2], bz = run.pts[k + 3], len = hyp(bx - ax, bz - az);
      if (len < 0.05) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, gaps: [number, number][] = [];
      for (const l of works.loCot) {
        const t = (l.x - ax) * ux + (l.z - az) * uz, off = Math.abs(-(l.x - ax) * uz + (l.z - az) * ux);
        if (off < l.d / 2 + 0.6 && t > -l.w && t < len + l.w) { const half = Math.abs(Math.cos(l.yaw) * ux - Math.sin(l.yaw) * uz) * (l.w / 2) + Math.abs(Math.sin(l.yaw) * ux + Math.cos(l.yaw) * uz) * (l.d / 2); gaps.push([t - half, t + half]); }
      }
      for (const e of WORLD_ROADS.edgesNear((ax + bx) / 2, (az + bz) / 2, len / 2 + 30)) {
        const edge = e.edge, reach = edge.half + edge.sidewalk;
        for (let j = 0; j + 3 < edge.pts.length; j += 2) {
          const hit = crossAt(ax, az, bx, bz, edge.pts[j], edge.pts[j + 1], edge.pts[j + 2], edge.pts[j + 3]);
          if (!hit) continue;
          const ex = edge.pts[j + 2] - edge.pts[j], ez = edge.pts[j + 3] - edge.pts[j + 1], el = hyp(ex, ez) || 1, sin = Math.abs((ux * ez - uz * ex) / el) || 1;
          gaps.push([hit * len - reach / sin, hit * len + reach / sin]);
        }
      }
      // An open road end on the run (a lô cốt stands there) is covered above; one just short of it leaves its corridor too.
      gaps.sort((p, q) => p[0] - q[0]);
      let from = 0;
      for (const [g0, g1] of [...gaps, [len, len] as [number, number]]) {
        if (g0 - from > 0.6) cutRuns.push({ ...run, id: `${run.id}:${cutRuns.length}`, pts: [r2(ax + ux * from), r2(az + uz * from), r2(ax + ux * Math.min(g0, len)), r2(az + uz * Math.min(g0, len))] });
        from = Math.max(from, g1);
      }
    }
  }
  works.runs = cutRuns;
  // Colliders: lô cốt boxes and the runs as thin walls.
  for (const l of works.loCot) works.colliders.push({ cx: l.x, cz: l.z, hx: l.w / 2, hz: l.d / 2, yaw: l.yaw, top: l.h, kind: 'works', key: `works/${l.id}`, slice: l.slice });
  for (const r of works.runs) {
    const [ax, az, bx, bz] = r.pts, len = hyp(bx - ax, bz - az);
    works.colliders.push({ cx: (ax + bx) / 2, cz: (az + bz) / 2, hx: len / 2, hz: 0.12, yaw: Math.atan2(-(bz - az), bx - ax), top: r.h, kind: 'works', key: `works/${r.id}`, slice: r.slice });
  }
  return works;
}
/** Where a->b crosses c->d: the fraction along a->b, or null. */
function crossAt(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? t : null;
}
/** The edge works of this wiring step (lô cốt, hoardings, temporary fences, their signs and tree belts), with their colliders. */
export const WORKS: Works = buildWorks();
DISTRICT_COLLIDERS.push(...WORKS.colliders);
// The walking streets' neon gateways (EXTRA.nightSeats.arches: Bùi Viện, Vĩnh Khánh): their posts behind the curbs.
for (const [slice, ns] of [['quan-1-south', SLICE_EXTRA['quan-1-south']?.nightSeats], ['quan-4', SLICE_EXTRA['quan-4']?.nightSeats]] as const) {
  if (!ns) continue;
  ns.arches.forEach((a, i) => { for (const [x, z, end] of [[a.ax, a.az, 'a'], [a.bx, a.bz, 'b']] as const) DISTRICT_COLLIDERS.push({ cx: x, cz: z, hx: 0.2, hz: 0.2, yaw: 0, top: 5.6, kind: 'prop', key: `${slice}/night-arch:${i}:${end}`, slice }); });
}
/** Coaches in Bến xe Miền Đông's bays and container trucks in the port's loading bays (map/curb-fleet.ts): drawn by district-render.ts. */
export const CURB_FLEET = WIRED_COUNT ? curbFleet(WORLD_ROADS) : [];
CURB_FLEET.forEach((b, i) => DISTRICT_COLLIDERS.push({ cx: b.x, cz: b.z, hx: b.width / 2, hz: b.len / 2, yaw: b.yaw, top: b.kind === 'coach' ? 3.6 : 4.1, kind: 'prop', key: `${b.kind === 'coach' ? 'binh-thanh' : 'quan-4'}/curb-fleet:${i}`, slice: b.kind === 'coach' ? 'binh-thanh' : 'quan-4' }));
// The roundabout islands: Hồ Con Rùa's pool rim (people sit on it; nobody walks into the water), Dân Chủ's planter,
// the statues' plinths at Công xã Paris and Quách Thị Trang (district-render.ts island draws them).
for (const r of RINGS) {
  const solid = (cx: number, cz: number, hx: number, hz: number, yaw: number, top: number, key: string) => DISTRICT_COLLIDERS.push({ cx, cz, hx, hz, yaw, top, kind: 'prop', key: `${r.slice}/ring:${r.id}:${key}`, slice: r.slice });
  if (r.pool > 0) {
    const n = 16, rr = r.pool + 0.2;
    for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * Math.PI * 2; solid(r.x + rr * Math.cos(a), r.z + rr * Math.sin(a), rr * Math.sin(Math.PI / n) + 0.08, 0.28, Math.atan2(-Math.cos(a), -Math.sin(a)), 0.55, `rim${i}`); }
  } else if (r.statue) solid(r.x, r.z, r.island > 9 ? 2.2 : 1.6, r.island > 9 ? 2.2 : 1.6, 0, 2.4, 'plinth');
  else solid(r.x, r.z, 2.6, 2.6, Math.PI / 4, 0.9, 'planter');
}
// The cargo ship's bridge house and container stacks stand solid on its deck (map/ship.ts: the deck and gangway are terrain decks).
{
  const ship = SLICE_EXTRA['quan-4']?.ship;
  if (ship) {
    const lay = cargoShipLayout(ship);
    [lay.house, ...lay.stacks].forEach((b, i) => DISTRICT_COLLIDERS.push({ cx: b.cx, cz: b.cz, hx: b.hx, hz: b.hz, yaw: b.yaw, top: b.y0 + b.h, kind: 'building', key: `quan-4/ship:${i === 0 ? 'house' : `stack${i}`}`, slice: 'quan-4' }));
  }
}

/**
 * Every static solid of the live map as oriented boxes: today's COLLIDERS (minus the parked scooters, which are
 * vehicles, and LEGACY_HIDDEN) and DISTRICT_COLLIDERS. world.ts hands game.ts today's as world.colliders (plus the
 * signal poles) and the districts' as world.districtColliders.
 */
export const WORLD_COLLIDERS: readonly WorldSolid[] = (() => {
  const parked = SCENERY.props.filter((p) => p.kind === 'scooter');
  const isParked = (c: { minX: number; maxX: number; minZ: number; maxZ: number; top?: number }) => c.top !== undefined && parked.some((p) => Math.abs((c.minX + c.maxX) / 2 - p.x) < 1e-6 && Math.abs((c.minZ + c.maxZ) / 2 - p.z) < 1e-6);
  const out: WorldSolid[] = [];
  COLLIDERS.forEach((c, i) => {
    if (isParked(c) || LEGACY_HIDDEN.colliders.has(i)) return;
    out.push({ cx: (c.minX + c.maxX) / 2, cz: (c.minZ + c.maxZ) / 2, hx: (c.maxX - c.minX) / 2, hz: (c.maxZ - c.minZ) / 2, yaw: 0, top: c.top ?? Infinity, kind: 'legacy', key: `legacy:${i}`, slice: 'legacy' });
  });
  out.push(...DISTRICT_COLLIDERS);
  return out;
})();

// The terrain (map/terrain.ts worldTerrain): the wired waters, banks, docks, decks, raised sidewalks and the land union.
if (SLICES.length) {
  installTerrain(createTerrain(worldTerrain({
    slices: SLICES.map((s) => ({ key: s.key, bounds: s.bounds, waters: s.data.waters, decks: s.data.decks, extra: (SLICE_EXTRA[s.key] ?? null) as SliceTerrainExtra | null })),
    roads: WORLD_ROADS.edges.filter((e) => EDGE_INFO[e.id].slice !== 'legacy').map((e) => ({ pts: e.pts, half: e.half, sidewalk: e.cls === 'hem' ? 0 : e.sidewalk })),
    wired: WIRED_COUNT,
    islands: RINGS.map((r) => ({ x: r.x, z: r.z, r: r.island })),
  })));
}

/** Resolves once the map is ready (already resolved for importers: this module awaits generation at load). */
export const WORLD_READY: Promise<void> = Promise.resolve();
/** Debug summary (window.__pvo.info and benches). */
export const WORLD_MAP_INFO = {
  wired: WIRED_KEYS, generation: { ms: WORLD_MAP.ms, where: WORLD_MAP.where, totalMs: WORLD_MAP_MS }, issues: WORLD_MAP.issues.length, trimmed: WORLD_MAP.trimmed.length,
  buildings: DISTRICT_BUILDINGS.length, colliders: DISTRICT_COLLIDERS.length, nodes: WORLD_ROADS.nodes.length, edges: WORLD_ROADS.edges.length,
};
