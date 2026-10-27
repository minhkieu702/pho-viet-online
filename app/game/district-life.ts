/**
 * The districts the live map has wired so far (WIRING-PLAN §2, world-map.ts), as the people, parking, counter and
 * map tables read them: buildings and plots with ids after today's BUILDINGS, their POIs with ids after today's POIS
 * (one id space for every seat and spot, so a stool in Quận 4 and one in An Hòa never share an id), the eateries
 * with their seats, carts, stalls, kiosks, parked bikes and stamps, all without the dressing the stack trimmed at its
 * seams, and what a place is like at an hour (its district's character) for the crowd that lives round the player.
 * Pure data and maths: no three.js, no DOM (counters.ts, parking.ts and the interact audit read it in node).
 */
import { BUILDINGS, PLOTS, POIS, type Point, type Poi } from './city';
import type { DistrictId } from './map/districts';
import type { RoadGraph } from './map/roads';
import type { DistrictData, StampOut } from './map/build-district';
import type { GenBuilding, GenPlot, Kiosk } from './map/gen/buildings';
import type { Eatery, GenProp, Parked } from './map/gen/dressing';
import { dishOf, type Dish } from './street-life';
import { QUAN_1_SOUTH_EXTRA } from './map/layout/quan-1-south';
import { QUAN_4_EXTRA } from './map/layout/quan-4';
import { QUAN_3_EXTRA } from './map/layout/quan-3';
import { BINH_THANH_EXTRA } from './map/layout/binh-thanh';
import { THU_THIEM_EXTRA } from './map/layout/thu-thiem';
import { P1_LAYOUTS, buildP1 } from './map/p1';
import { LEGACY_ROADS } from './map/roads-legacy';
import { liveInput } from './map/stack';
import { createRoadGraph } from './map/roads';
import { RINGS, WORLD_MAP, WORLD_ROADS } from './map/world-map';
import { createCollisionIndex } from './map/collision';

/** What a slice's build carries that the people and places read (world-map.ts's SliceData without its graph patch). */
export type LiveSliceData = Omit<DistrictData, 'graph' | 'graphPatch'>;
export type LiveSlice = { key: string; data: LiveSliceData };
/** The wired slices in wiring order, the dressing the stack trimmed at its seams, and the welded road graph. */
export type LiveWorld = { slices: readonly LiveSlice[]; trimmed: readonly { slice: string; key: string }[]; roads: RoadGraph | null };

/** A district POI: today's Poi shape with its id after POIS, plus where it comes from and when it is out. */
export type DPoi = Poi & { slice: string; key: string; district: DistrictId; hours: [number, number] | null; eatery: number; building: number };
/** A plastic-stool eatery (or café table): its seats as POI ids, its building id, what it serves and when. */
export type DEatery = {
  index: number; slice: string; key: string; district: DistrictId; x: number; z: number; yaw: number;
  variant: Eatery['variant']; hours: [number, number]; seats: number[]; building: number; name: string; dish: Dish | null; night: boolean;
};
export type DProp = GenProp & { slice: string; district: DistrictId; id: string };
export type DParked = Parked & { slice: string; district: DistrictId; building: number };
export type DKiosk = Kiosk & { slice: string; district: DistrictId; building: number };
export type DStamp = StampOut & { slice: string; district: DistrictId };
/** A low plastic stool's seat above the ground (crowd-props.ts stoolGeometry, city.ts street-life stools): Bùi Viện's night stools. */
export const STOOL_TOP = 0.28;
/** The district quán stools' seat (district-render.ts eatery draws world.ts stool(), SEAT_TOP.stool; crowd-props 'stool42' the extra ones). */
export const QUAN_STOOL_TOP = 0.42;
/** A night seat on a walking street's carriageway (Bùi Viện 19–02): a stool POI and the table it is at. */
export type NightTable = { slice: string; x: number; z: number; yaw: number; seats: number[]; hours: [number, number] };

export type DistrictView = {
  world: LiveWorld;
  /** Every wired building in id order (ids from `buildingBase`), and their plots. */
  buildings: GenBuilding[]; plots: GenPlot[]; buildingBase: number;
  pois: DPoi[]; poiBase: number;
  eateries: DEatery[]; props: DProp[]; parked: DParked[]; kiosks: DKiosk[]; stamps: DStamp[]; nightTables: NightTable[];
  benches: { slice: string; x: number; z: number; yaw: number }[];
  /** Xe ôm corners: a parked bike (index in `parked`) by an R1 junction and the saddle its driver sits on (a perch POI). */
  perches: { parked: number; poi: number }[];
  /** Keys of the slices wired here. */
  keys: Set<string>;
};

const ZERO: LiveWorld = { slices: [], trimmed: [], roads: null };

/**
 * Builds a world of P1 slices the way the live map does (buildP1 on today's graph, the ferry link out again, the
 * welded graph), for tests and sims that need other wiring steps than the live one (the whole of P1, say).
 */
export function buildWorld(layouts = P1_LAYOUTS): LiveWorld {
  if (!layouts.length) return ZERO;
  const p1 = buildP1(LEGACY_ROADS, { idBase: BUILDINGS.length, layouts });
  const roads = createRoadGraph(liveInput(p1.stack, LEGACY_ROADS).input);
  return { slices: p1.slices.map((s) => ({ key: s.key, data: s.data })), trimmed: p1.stack.trimmed.map((t) => ({ slice: t.slice, key: t.key })), roads };
}

/** Night food (ốc, nhậu, lẩu, nướng) and Bùi Viện's bar: busy after dark. */
const NIGHT_FOOD = /^(ỐC|SÒ ỐC|HẢI SẢN|NƯỚNG NGÓI|MỰC NƯỚNG|TÔM NƯỚNG|LẨU|QUÁN NHẬU|NHẬU|BIA|BAR)/;

/** The district tables of a world: ids after `base` (today's BUILDINGS and POIS by default). */
export function viewOf(world: LiveWorld, base = { buildings: BUILDINGS.length, pois: POIS.length }): DistrictView {
  const trimmed = new Set(world.trimmed.map((t) => `${t.slice}/${t.key}`));
  const kept = (slice: string, key: string) => !trimmed.has(`${slice}/${key}`);
  const view: DistrictView = {
    world, buildings: [], plots: [], buildingBase: base.buildings, pois: [], poiBase: base.pois,
    eateries: [], props: [], parked: [], kiosks: [], stamps: [], nightTables: [], benches: [], perches: [], keys: new Set(world.slices.map((s) => s.key)),
  };
  for (const s of world.slices) {
    const d = s.data, district = d.district;
    const byKey = new Map(d.buildings.map((b) => [b.key, b]));
    view.buildings.push(...d.buildings);
    view.plots.push(...d.plots);
    // POIs: ids after today's, in slice order; an eatery's seats find theirs by key.
    const poiId = new Map<string, number>();
    for (const p of d.pois) {
      if (!kept(s.key, p.key)) continue;
      const id = base.pois + view.pois.length;
      poiId.set(p.key, id);
      view.pois.push({ id, kind: p.kind, x: p.x, z: p.z, yaw: p.yaw, curb: { ...p.curb }, seat: p.seat, seatH: p.kind === 'cafe-seat' ? QUAN_STOOL_TOP : undefined, slice: s.key, key: p.key, district, hours: p.hours, eatery: -1, building: -1 });
    }
    for (const e of d.scenery.eateries) {
      if (!kept(s.key, e.key)) continue;
      const b = byKey.get(e.building), seats = e.seats.map((k) => poiId.get(k)).filter((id): id is number => id !== undefined);
      const index = view.eateries.length, name = b?.name ?? '';
      view.eateries.push({
        index, slice: s.key, key: e.key, district, x: e.x, z: e.z, yaw: e.yaw, variant: e.variant, hours: e.hours, seats, building: b?.id ?? -1, name,
        dish: eateryDish(name, e.variant), night: b?.zone === 'night' || NIGHT_FOOD.test(name),
      });
      for (const id of seats) { const p = view.pois[id - base.pois]; p.eatery = index; p.building = b?.id ?? -1; }
    }
    for (const p of d.scenery.props) if (kept(s.key, p.key)) view.props.push({ ...p, slice: s.key, district, id: `${s.key}/${p.key}` });
    for (const p of d.scenery.parked) if (kept(s.key, p.key) && !inHemMouth(world.roads, p.x, p.z)) view.parked.push({ ...p, slice: s.key, district, building: nearestDoor(d.buildings, p.x, p.z) });
    for (const pl of d.plots) for (const k of pl.kiosks) view.kiosks.push({ ...k, slice: s.key, district, building: pl.id });
    for (const st of d.stamps) view.stamps.push({ ...st, slice: s.key, district });
    for (const b of d.scenery.benches) view.benches.push({ slice: s.key, x: b.x, z: b.z, yaw: b.yaw });
  }
  extraSeats(view);
  for (const [slice, ns] of NIGHT_STREETS) if (view.keys.has(slice)) nightSeats(view, slice, ns);
  // Hồ Con Rùa's pool rim, where students sit of an evening (only where the live map built the ring).
  if (world.roads === WORLD_ROADS) for (const r of RINGS) if (r.pool > 0 && view.keys.has(r.slice)) rimSeats(view, r);
  xeOmCorners(view);
  return view;
}

/**
 * Stools for the eatery tables the generator could seat nobody at (gen/dressing.ts drops a stool it cannot reach
 * from a walking line; on the 4.5 m sidewalks of Vĩnh Khánh and Phan Xích Long most tables end up with none). Round
 * each such table, at the generator's own four stool places, a stool is kept where it stands clear of every solid
 * and parked bike, off the asphalt (a hẻm keeps its middle free), off the walking lines, clear of the doors and of
 * every other seat or spot and their paths, and where a straight path leads from it to the walking line beside it.
 */
function extraSeats(view: DistrictView) {
  const roads = view.world.roads;
  if (!roads) return;
  const solids = createCollisionIndex();
  for (const s of view.world.slices) {
    for (const c of s.data.colliders) if (c.kind !== 'moto') solids.addBox(c.cx, c.cz, c.hx, c.hz, c.yaw);
    for (const p of s.data.scenery.parked) solids.addBox(p.x, p.z, 0.31, 0.875, p.yaw);
  }
  const paths: number[][] = [];
  for (const b of view.buildings) paths.push([b.door.x, b.door.z, b.curb.x, b.curb.z]);
  for (const p of view.pois) paths.push([p.x, p.z, p.curb.x, p.curb.z]);
  const segDist = (x: number, z: number, s: number[]) => {
    const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2)) : 0;
    return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t);
  };
  const nearPath = (x: number, z: number, r: number) => paths.some((s) => Math.min(s[0], s[2]) - r < x && Math.max(s[0], s[2]) + r > x && Math.min(s[1], s[3]) - r < z && Math.max(s[1], s[3]) + r > z && segDist(x, z, s) < r);
  /** Where a stool at (x, z) joins the walking network (its line's nearest point), or null if it stands where it may not. */
  const curbOf = (x: number, z: number): Point | null => {
    const hits = roads.edgesNear(x, z, 16);
    if (!hits.length) return null;
    for (const h of hits) {
      const e = h.edge, d = Math.abs(h.off);
      if (e.cls === 'hem' ? d < 0.75 : d < e.half + 0.35) return null;
      if (e.cls !== 'hem' && Math.abs(d - e.walk) < 0.6) return null;
    }
    const h = hits[0], e = h.edge;
    // The nearest walking line: a hẻm's middle, or the road's line on the stool's side.
    const side = h.off >= 0 ? 1 : -1, w = e.cls === 'hem' ? 0 : e.walk;
    return { x: h.x - h.hz * side * w, z: h.z + h.hx * side * w };
  };
  const clearWay = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.3));
    for (let i = 1; i <= n; i++) { const t = i / n; if (!solids.clear(ax + (bx - ax) * t, az + (bz - az) * t, 0.2)) return false; }
    return true;
  };
  const placed: Point[] = view.pois.map((p) => ({ x: p.x, z: p.z }));
  for (const e of view.eateries) {
    if (e.seats.length) continue;
    const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    for (const [a, o] of [[0.85, 0], [-0.85, 0], [0, -0.75], [0, 0.75]] as const) {
      const x = e.x + rx * a + fx * o, z = e.z + rz * a + fz * o;
      if (!solids.clear(x, z, 0.24) || nearPath(x, z, 0.75) || placed.some((p) => Math.abs(p.x - x) < 0.6 && Math.abs(p.z - z) < 0.6)) continue;
      const curb = curbOf(x, z);
      if (!curb || !clearWay(x, z, curb.x, curb.z)) continue;
      const id = view.poiBase + view.pois.length;
      view.pois.push({ id, kind: 'cafe-seat', x: r2(x), z: r2(z), yaw: Math.atan2(e.x - x, e.z - z), curb: { x: r2(curb.x), z: r2(curb.z) }, seat: true, seatH: QUAN_STOOL_TOP, slice: e.slice, key: `${e.key}:stool${a}:${o}`, district: e.district, hours: e.hours, eatery: e.index, building: e.building });
      e.seats.push(id);
      placed.push({ x, z });
    }
  }
}

/** A parked bike's heading as parking.ts stands it: nose toward the building it belongs to. */
export function noseYaw(p: { x: number; z: number; yaw: number }, door: Point | null) {
  let yaw = p.yaw;
  if (door && Math.sin(yaw) * (door.x - p.x) + Math.cos(yaw) * (door.z - p.z) < 0) yaw += Math.PI;
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}
/**
 * Xe ôm corners: by each signalled junction of the wired slices, the parked bike on a sidewalk band nearest the
 * corner (8–24 m from the junction, at most one per junction and six per slice) becomes a xe ôm driver's: he sits on
 * its saddle (a perch POI, like today's corners), and parking.ts keeps the bike there in his working hours.
 */
function xeOmCorners(view: DistrictView) {
  const roads = view.world.roads;
  if (!roads) return;
  const perSlice = new Map<string, number>(), used = new Set<number>();
  for (const n of roads.nodes) {
    if (n.control !== 'signal' || n.arms.length < 3) continue;
    let best = -1, bestD = Infinity;
    view.parked.forEach((p, i) => {
      if (used.has(i) || Math.abs(p.x - n.x) > 24 || Math.abs(p.z - n.z) > 24) return;
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      const e = roads.nearestEdge(p.x, p.z, 16);
      if (d < 8 || d > 24 || !e || e.edge.cls === 'hem' || d >= bestD) return;
      best = i; bestD = d;
    });
    if (best < 0) continue;
    const p = view.parked[best];
    if ((perSlice.get(p.slice) ?? 0) >= 6) continue;
    const b = p.building >= view.buildingBase ? view.buildings[p.building - view.buildingBase] : null;
    const yaw = noseYaw(p, b?.door ?? null), fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const hit = roads.nearestEdge(p.x, p.z, 16)!, side = hit.off >= 0 ? 1 : -1, w = hit.edge.walk;
    const curb = { x: r2(hit.x - hit.hz * side * w), z: r2(hit.z + hit.hx * side * w) };
    // Beside the scooter on the side of the walking line, to swing a leg over.
    const toCurb = rx * (curb.x - p.x) + rz * (curb.z - p.z) >= 0 ? 1 : -1;
    const id = view.poiBase + view.pois.length;
    view.pois.push({
      id, kind: 'perch', x: r2(p.x - fx * 0.25), z: r2(p.z - fz * 0.25), yaw, curb, seat: true, seatH: 0.8, via: { x: r2(p.x + rx * 0.65 * toCurb), z: r2(p.z + rz * 0.65 * toCurb) },
      slice: p.slice, key: `${p.key}:xeom`, district: p.district, hours: [5.8, 21.2], eatery: -1, building: -1,
    });
    view.perches.push({ parked: best, poi: id });
    used.add(best);
    perSlice.set(p.slice, (perSlice.get(p.slice) ?? 0) + 1);
  }
}

/** What an eatery serves, from its building's sign (cafés by their table). */
function eateryDish(name: string, variant: Eatery['variant']): Dish | null {
  const n = name.toUpperCase();
  if (/^(ỐC|SÒ ỐC)/.test(n)) return 'oc';
  if (/^(LẨU|NƯỚNG NGÓI|MỰC NƯỚNG|TÔM NƯỚNG|HẢI SẢN)/.test(n)) return n.startsWith('LẨU') ? 'lau' : 'nuong';
  if (/^(QUÁN NHẬU|NHẬU|BIA|BAR)/.test(n)) return 'bia';
  if (/^(SINH TỐ|NƯỚC MÍA|TRÀ ĐÁ)/.test(n)) return 'trasua';
  if (/^(CƠM|GÀ NƯỚNG)/.test(n)) return 'com';
  if (/^(BÚN|MÌ QUẢNG)/.test(n)) return dishOf(n) ?? 'bun';
  if (n.startsWith('BÒ BÍA')) return 'banhcuon';
  return dishOf(n) ?? (variant === 'coffee' ? 'cafe' : variant === 'hotpot' ? 'lau' : variant === 'grill' ? 'nuong' : null);
}

/**
 * A bike the generator left across a hẻm's way (its mouth on the street front, where the hẻm's line starts): within
 * 0.6 m of a hẻm's centre line. Such a bike would block the hẻm; the live map leaves it out (parking.ts's rule).
 */
function inHemMouth(roads: RoadGraph | null, x: number, z: number) {
  if (!roads) return false;
  for (const h of roads.edgesNear(x, z, 4)) if (h.edge.cls === 'hem' && Math.abs(h.off) < 0.6 && h.d < 0.9) return true;
  return false;
}
function nearestDoor(list: readonly GenBuilding[], x: number, z: number) {
  let best = -1, bestD = 14;
  for (const b of list) { const d = Math.abs(b.door.x - x) + Math.abs(b.door.z - z); if (d < bestD) { best = b.id; bestD = d; } }
  return best;
}

/**
 * Bùi Viện's walking-street seating (QUAN_1_SOUTH_EXTRA.nightSeats, 19–02): stool tables in two rows on the
 * carriageway, a lane between, as district-render.ts seatSet draws them (three stools a table: either end, then the
 * side away from the lane). Each stool is a cafe-seat POI facing its table; its curb is the stool itself (the street
 * is closed to traffic then, people walk straight up).
 */
/** A walking street's night seating (a slice's EXTRA.nightSeats): its tables, stools, hours, what is served and where. */
type NightStreet = { hours: [number, number]; stool: { along: number; lane: number }; tables: { x: number; z: number; yaw: number; stools: number }[]; name: string; dish: Dish; district: DistrictId };
/** Every slice's night seating (Bùi Viện 19–02, Vĩnh Khánh's ốc tables 17–01). */
export const NIGHT_STREETS: readonly [string, NightStreet][] = [['quan-1-south', QUAN_1_SOUTH_EXTRA.nightSeats], ['quan-4', QUAN_4_EXTRA.nightSeats]];
function nightSeats(view: DistrictView, slice: string, ns: NightStreet) {
  for (const t of ns.tables) {
    const seats: number[] = [], index = view.eateries.length;
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), rx = Math.cos(t.yaw), rz = -Math.sin(t.yaw);
    // Stools round the table: either end along the row, then the side away from the lane.
    const spots: [number, number][] = [[ns.stool.along, 0], [-ns.stool.along, 0], [0, ns.stool.lane], [0, -ns.stool.lane]].slice(0, t.stools) as [number, number][];
    for (const [a, o] of spots) {
      const x = t.x + rx * a + fx * o, z = t.z + rz * a + fz * o, id = view.poiBase + view.pois.length;
      view.pois.push({ id, kind: 'cafe-seat', x: r2(x), z: r2(z), yaw: Math.atan2(t.x - x, t.z - z), curb: { x: r2(x), z: r2(z) }, seat: true, seatH: QUAN_STOOL_TOP, slice, key: `night:${t.x}:${t.z}:${a}:${o}`, district: ns.district, hours: ns.hours, eatery: index, building: -1 });
      seats.push(id);
    }
    view.nightTables.push({ slice, x: t.x, z: t.z, yaw: t.yaw, seats, hours: ns.hours });
    // As a quán table for the crowd (district-render.ts seatSet draws it: top 0.62, a stool at each of these seats).
    view.eateries.push({ index, slice, key: `night:${t.x}:${t.z}`, district: ns.district, x: t.x, z: t.z, yaw: t.yaw, variant: 'stools', hours: ns.hours, seats, building: -1, name: ns.name, dish: ns.dish, night: true });
  }
}
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Seats round a roundabout's pool, on its rim (0.55 m up), facing out, reached from the island's lawn. */
function rimSeats(view: DistrictView, r: { id: string; slice: string; x: number; z: number; pool: number }) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), at = r.pool + 0.55, out = r.pool + 1.6;
    view.pois.push({
      id: view.poiBase + view.pois.length, kind: 'bench', x: r2(r.x + c * at), z: r2(r.z + s * at), yaw: Math.atan2(c, s), curb: { x: r2(r.x + c * out), z: r2(r.z + s * out) },
      seat: true, seatH: 0.55, slice: r.slice, key: `ring-rim:${r.id}:${i}`, district: 'D3', hours: [16, 24], eatery: -1, building: -1,
    });
  }
}

// ---- The live districts ------------------------------------------------------------------------------------------

/** The world the live map has wired: world-map.ts's slices (generated once, off the frame), its trims and its roads. */
const live: LiveWorld = WORLD_MAP.slices.length ? { slices: WORLD_MAP.slices, trimmed: WORLD_MAP.trimmed, roads: WORLD_ROADS } : ZERO;
let view: DistrictView | null = null;
export const liveWorld = (): LiveWorld => live;
/** The district tables of the live world (built on first use). */
export function district(): DistrictView {
  if (!view) view = viewOf(live);
  return view;
}

// ---- Today's and the districts' POIs as one table -------------------------------------------------------------------

/** A POI by id in the one id space (today's POIS, then the districts'). */
export function poiById(v: DistrictView, id: number): Poi | undefined { return id < v.poiBase ? POIS[id] : v.pois[id - v.poiBase]; }
/** A building by id (today's BUILDINGS, then the districts'). */
export function buildingById(v: DistrictView, id: number) { return id < v.buildingBase ? BUILDINGS[id] : v.buildings[id - v.buildingBase]; }

// ---- What a place is like --------------------------------------------------------------------------------------------

/**
 * A district's character for the crowd round the player (design 3; districts-design-district.md): how many people
 * are out at an hour (0..1 of the busiest), and what they mostly do there. `zone` is the block's zone kind or a named
 * hot spot (Bến Thành, Bùi Viện, Vĩnh Khánh, the chợ, the cafés of Quận 3, Thủ Thiêm's parks).
 */
export type Spot = 'ben-thanh' | 'bui-vien' | 'vinh-khanh' | 'cho' | 'cafe-q3' | 'cbd' | 'port' | 'park-tt' | 'canal-bt' | 'residential' | 'villa';
/** The busiest the crowd round the player gets (people within CROWD_RADIUS) at a spot's peak. */
export const PEAK: Record<Spot, number> = {
  'ben-thanh': 56, 'bui-vien': 64, 'vinh-khanh': 62, cho: 50, 'cafe-q3': 36, cbd: 32, port: 10, 'park-tt': 16, 'canal-bt': 24, residential: 28, villa: 12,
};
/** Hourly shape (0..1) of each spot's crowd: 24 values, hour h covers [h, h+1). */
export const CURVE: Record<Spot, number[]> = {
  //               0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23
  'ben-thanh':  [0.10,0.05,0.02,0.02,0.05,0.25,0.65,0.85,0.95,1.00,1.00,1.00,0.90,0.80,0.80,0.85,0.90,0.95,0.85,0.80,0.75,0.60,0.40,0.20],
  'bui-vien':   [0.70,0.45,0.20,0.05,0.02,0.05,0.10,0.15,0.20,0.25,0.30,0.30,0.30,0.25,0.25,0.30,0.35,0.45,0.60,0.85,1.00,1.00,1.00,0.90],
  'vinh-khanh': [0.30,0.10,0.03,0.02,0.02,0.05,0.10,0.15,0.20,0.20,0.25,0.30,0.30,0.25,0.25,0.30,0.45,0.70,0.90,1.00,1.00,1.00,0.80,0.55],
  cho:          [0.05,0.02,0.02,0.05,0.30,0.75,1.00,1.00,0.95,0.85,0.70,0.55,0.45,0.35,0.35,0.40,0.50,0.60,0.50,0.35,0.25,0.15,0.08,0.05],
  'cafe-q3':    [0.05,0.02,0.02,0.02,0.05,0.25,0.75,1.00,1.00,0.85,0.70,0.60,0.55,0.50,0.55,0.65,0.70,0.75,0.70,0.80,0.80,0.65,0.40,0.15],
  cbd:          [0.05,0.02,0.02,0.02,0.05,0.10,0.35,0.80,1.00,0.75,0.65,0.85,1.00,0.80,0.65,0.65,0.70,0.90,0.80,0.55,0.40,0.30,0.20,0.10],
  port:         [0.05,0.05,0.05,0.05,0.10,0.30,0.70,0.90,1.00,1.00,0.90,0.80,0.70,0.80,0.90,0.90,0.80,0.60,0.40,0.25,0.15,0.10,0.05,0.05],
  'park-tt':    [0.02,0.01,0.01,0.01,0.10,0.70,1.00,0.70,0.40,0.25,0.20,0.15,0.10,0.10,0.15,0.30,0.70,1.00,0.95,0.70,0.45,0.25,0.10,0.05],
  'canal-bt':   [0.05,0.02,0.02,0.02,0.20,0.85,1.00,0.75,0.45,0.30,0.25,0.25,0.20,0.20,0.25,0.40,0.80,1.00,0.95,0.80,0.65,0.40,0.20,0.10],
  residential:  [0.05,0.02,0.02,0.02,0.05,0.35,0.80,0.90,0.70,0.55,0.50,0.60,0.70,0.50,0.45,0.55,0.75,0.95,1.00,0.90,0.75,0.55,0.30,0.12],
  villa:        [0.02,0.01,0.01,0.01,0.03,0.25,0.60,0.80,0.60,0.40,0.35,0.35,0.40,0.30,0.30,0.35,0.55,0.80,0.80,0.60,0.40,0.25,0.10,0.05],
};
/** The crowd round the player: people within this many metres (spawned out of sight, let go beyond DROP_RADIUS). */
export const CROWD_RADIUS = 45;
export const DROP_RADIUS = 85;
/** How much of a spot's crowd walks about (door to door, in and out of the chợ) rather than sits or keeps a post. */
export const WALKERS: Record<Spot, number> = {
  'ben-thanh': 0.6, 'bui-vien': 0.3, 'vinh-khanh': 0.2, cho: 0.55, 'cafe-q3': 0.3, cbd: 0.6, port: 0.5, 'park-tt': 0.3, 'canal-bt': 0.4, residential: 0.45, villa: 0.4,
};

type HotSpot = { spot: Spot; x0: number; x1: number; z0: number; z1: number; slice: string };
/** Named hot spots (rects in game metres), most specific first; their slice must be wired. */
const HOT: HotSpot[] = [
  // Quận 1 south: Bùi Viện (the walking street and its blocks), Chợ Bến Thành and its night market, the CBD.
  { spot: 'bui-vien', slice: 'quan-1-south', x0: 278, x1: 372, z0: 236, z1: 266 },
  { spot: 'ben-thanh', slice: 'quan-1-south', x0: 182, x1: 305, z0: 266, z1: 372 },
  { spot: 'cbd', slice: 'quan-1-south', x0: 135, x1: 372, z0: 137.5, z1: 228 },
  // Quận 4: Vĩnh Khánh (the ốc street), the port and its warehouses north of Nguyễn Tất Thành.
  { spot: 'vinh-khanh', slice: 'quan-4', x0: 445, x1: 630, z0: -32, z1: 34 },
  { spot: 'port', slice: 'quan-4', x0: 432, x1: 700, z0: -145, z1: -62 },
  { spot: 'cho', slice: 'quan-4', x0: 530, x1: 620, z0: 370, z1: 445 },
  // Quận 3: Bàn Cờ and Tân Định markets, the café streets elsewhere; villas on Trần Quốc Thảo.
  { spot: 'cho', slice: 'quan-3', x0: -10, x1: 70, z0: 170, z1: 215 },
  { spot: 'villa', slice: 'quan-3', x0: -175, x1: -54, z0: 216, z1: 300 },
  { spot: 'cafe-q3', slice: 'quan-3', x0: -380, x1: 135, z0: 137.5, z1: 445 },
  // Bình Thạnh: Chợ Bà Chiểu, the canal park, the riverside towers.
  { spot: 'cho', slice: 'binh-thanh', x0: -585, x1: -440, z0: 90, z1: 170 },
  { spot: 'canal-bt', slice: 'binh-thanh', x0: -700, x1: -482, z0: 185, z1: 210 },
  { spot: 'cbd', slice: 'binh-thanh', x0: -700, x1: -470, z0: -145, z1: -62 },
  // Thủ Thiêm: the riverside parks and the empty project land; the old parish is a quiet village.
  { spot: 'park-tt', slice: 'thu-thiem', x0: -440, x1: 680, z0: -320, z1: -195 },
  { spot: 'residential', slice: 'thu-thiem', x0: -440, x1: 680, z0: -420, z1: -320 },
];
const inBox = (b: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, pad = 0) => x >= b.x0 - pad && x < b.x1 + pad && z >= b.z0 - pad && z < b.z1 + pad;
/** Each slice's land: its layout's bounds polygon (x,z pairs; the one the map wires, world-map.ts sliceAt) and that polygon's box. */
const SLICE_LAND = P1_LAYOUTS.map((l) => {
  const p = l.bounds, b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < p.length; i += 2) { b.x0 = Math.min(b.x0, p[i]); b.x1 = Math.max(b.x1, p[i]); b.z0 = Math.min(b.z0, p[i + 1]); b.z1 = Math.max(b.z1, p[i + 1]); }
  return { key: l.key, poly: p, box: b };
});
/** The box of each slice's land, for "is the player in or by this slice" at a glance. */
export const SLICE_BOX: Record<string, { x0: number; x1: number; z0: number; z1: number }> = Object.fromEntries(SLICE_LAND.map((s) => [s.key, s.box]));
function inPolygon(p: readonly number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Whether (x, z) is within `pad` of a polygon's outline. */
function nearOutline(p: readonly number[], x: number, z: number, pad: number) {
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], dx = p[i] - ax, dz = p[i + 1] - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= pad) return true;
  }
  return false;
}
/**
 * The wired slice (of `keys`) whose land holds (or is within `pad` of) (x, z), or null (today's map, the river,
 * unbuilt land). The land is each layout's bounds polygon, the same test as world-map.ts sliceAt.
 */
export function sliceAt(keys: ReadonlySet<string>, x: number, z: number, pad = 0): string | null {
  for (const s of SLICE_LAND) if (keys.has(s.key) && inBox(s.box, x, z, pad) && inPolygon(s.poly, x, z)) return s.key;
  if (pad > 0) for (const s of SLICE_LAND) if (keys.has(s.key) && inBox(s.box, x, z, pad) && nearOutline(s.poly, x, z, pad)) return s.key;
  return null;
}
/** What kind of crowd lives at (x, z) in the wired slices (null where there is no district land). */
export function spotAt(keys: ReadonlySet<string>, x: number, z: number): Spot | null {
  const slice = sliceAt(keys, x, z);
  if (!slice) return null;
  for (const h of HOT) if (h.slice === slice && inBox(h, x, z)) return h.spot;
  return 'residential';
}
/** How many people the crowd keeps round (x, z) at `hour` (rain halves it, people stay in or under an awning). */
export function crowdTarget(keys: ReadonlySet<string>, x: number, z: number, hour: number, raining = false) {
  const spot = spotAt(keys, x, z);
  if (!spot) return 0;
  const h = ((hour % 24) + 24) % 24, i = Math.floor(h), f = h - i, c = CURVE[spot];
  const shape = c[i] * (1 - f) + c[(i + 1) % 24] * f;
  return Math.round(PEAK[spot] * shape * (raining ? 0.55 : 1));
}

// ---- Street life in the districts (EXTRA data the crowd uses) ----------------------------------------------------------

/** Activities in the slices' EXTRA that the crowd plays out: where, when, what. */
export type Doing = { slice: string; what: 'jog' | 'fish' | 'dacau' | 'kite' | 'picnic' | 'taichi' | 'chess' | 'promoter' | 'photo' | 'incense' | 'bet' | 'wait'; x: number; z: number; yaw: number; hours: [number, number]; pts?: number[] };
/** Landmarks people photograph from the square in front, and the hours they do (a stamp's door and facing place them). */
const SIGHTS: Record<string, [number, number]> = {
  'cho-ben-thanh': [7, 19], 'nha-tho-duc-ba': [7, 18], 'buu-dien-thanh-pho': [7, 19], 'dinh-doc-lap': [8, 16.5], 'ubnd-thanh-pho': [17, 22],
  'nha-tho-tan-dinh': [7, 18], 'chua-vinh-nghiem': [6, 19], 'lang-ong': [6, 18], 'nha-rong': [7.5, 17], 'nha-tho-thu-thiem': [7, 18],
};
export function doings(keys: ReadonlySet<string>, stamps: readonly { id: string; x: number; z: number; yaw: number; door: Point | null }[] = []): Doing[] {
  const out: Doing[] = [];
  // Photographs in front of the landmarks (the square before the door), people waiting at the chợ's gate.
  for (const st of stamps) {
    const hours = SIGHTS[st.id];
    if (!hours || !st.door) continue;
    const slice = sliceAt(keys, st.door.x, st.door.z);
    if (!slice) continue;
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    for (const [ahead, side] of [[11, -5], [13, 4], [9, 9]] as const) out.push({ slice, what: 'photo', x: st.door.x + fx * ahead + rx * side, z: st.door.z + fz * ahead + rz * side, yaw: st.yaw + Math.PI, hours });
    if (st.id === 'cho-ben-thanh') for (const side of [-4, 4]) out.push({ slice, what: 'wait', x: st.door.x + fx * 3.5 + rx * side, z: st.door.z + fz * 3.5 + rz * side, yaw: st.yaw, hours: [6, 18] });
  }
  if (keys.has('binh-thanh')) {
    const cp = BINH_THANH_EXTRA.canalPark as { jog: { pts: number[]; hours: [number, number] }; fishing: { spots: [number, number][]; hours: [number, number] }; daCau: { x: number; z: number; hours: [number, number] } };
    out.push({ slice: 'binh-thanh', what: 'jog', x: cp.jog.pts[0], z: cp.jog.pts[1], yaw: Math.PI / 2, hours: cp.jog.hours, pts: cp.jog.pts });
    for (const [x, z] of cp.fishing.spots) out.push({ slice: 'binh-thanh', what: 'fish', x, z: z - 0.9, yaw: 0, hours: cp.fishing.hours });
    out.push({ slice: 'binh-thanh', what: 'dacau', x: cp.daCau.x, z: cp.daCau.z, yaw: 0, hours: cp.daCau.hours });
  }
  if (keys.has('quan-1-south')) {
    const a = QUAN_1_SOUTH_EXTRA.activities as unknown as { 'tai-chi': { hours: [number, number]; x: number; z: number }; 'co-tuong': { x: number; z: number }; 'bui-vien-promoters': { hours: [number, number]; spots: number[][] } };
    out.push({ slice: 'quan-1-south', what: 'taichi', x: a['tai-chi'].x, z: a['tai-chi'].z, yaw: 0, hours: a['tai-chi'].hours });
    out.push({ slice: 'quan-1-south', what: 'chess', x: a['co-tuong'].x, z: a['co-tuong'].z, yaw: 0, hours: [14, 19] });
    for (const [x, z] of a['bui-vien-promoters'].spots) out.push({ slice: 'quan-1-south', what: 'promoter', x, z, yaw: z > 250 ? Math.PI : 0, hours: a['bui-vien-promoters'].hours });
    // Cà phê bệt: a coffee on the paving of the park by the cathedral and along Công xã Paris after dark.
    const bet = (QUAN_1_SOUTH_EXTRA.activities as unknown as { 'ca-phe-bet': { hours: [number, number]; spots: number[][] } })['ca-phe-bet'];
    for (const [x, z] of bet.spots) out.push({ slice: 'quan-1-south', what: 'bet', x, z, yaw: 0, hours: bet.hours });
  }
  if (keys.has('quan-3')) {
    const a = QUAN_3_EXTRA.activities as { vinhNghiemIncense: { yard: Point }; tanDinhWeddings: { photo: Point } };
    out.push({ slice: 'quan-3', what: 'incense', x: a.vinhNghiemIncense.yard.x, z: a.vinhNghiemIncense.yard.z, yaw: 0, hours: [5, 20] });
    out.push({ slice: 'quan-3', what: 'photo', x: a.tanDinhWeddings.photo.x, z: a.tanDinhWeddings.photo.z, yaw: Math.PI, hours: [8, 17] });
  }
  if (keys.has('thu-thiem')) {
    for (const p of THU_THIEM_EXTRA.picnic as Point[]) out.push({ slice: 'thu-thiem', what: 'picnic', x: p.x, z: p.z, yaw: 0, hours: [15.5, 19] });
    // Kites over the riverside lawns and the empty project land in the late afternoon breeze.
    for (const id of THU_THIEM_EXTRA.kites as string[]) {
      const st = stamps.find((t) => t.id === id);
      if (st) out.push({ slice: 'thu-thiem', what: 'kite', x: st.x, z: st.z, yaw: 0, hours: [16, 18.6] });
    }
    for (const p of THU_THIEM_EXTRA.photos as { x: number; z: number; yaw: number }[]) out.push({ slice: 'thu-thiem', what: 'photo', x: p.x, z: p.z, yaw: p.yaw, hours: [6, 18] });
    const race = THU_THIEM_EXTRA.race as { loop: number[] };
    out.push({ slice: 'thu-thiem', what: 'jog', x: race.loop[0], z: race.loop[1], yaw: 0, hours: [5, 7.5], pts: race.loop });
    out.push({ slice: 'thu-thiem', what: 'jog', x: race.loop[0], z: race.loop[1], yaw: 0, hours: [16.5, 19], pts: race.loop });
  }
  return out;
}

// ---- Today's and the districts' buildings by id (for code written against BUILDINGS / PLOTS) -------------------------

/** A building by WORLD id: today's (BUILDINGS) or a wired district's. */
export function worldBuilding(id: number) { return id < BUILDINGS.length ? BUILDINGS[id] : district().buildings[id - BUILDINGS.length]; }
/** A plot by WORLD id: today's (PLOTS) or a wired district's. */
export function worldPlot(id: number) { return id < PLOTS.length ? PLOTS[id] : district().plots[id - PLOTS.length]; }
