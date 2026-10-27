/**
 * What the ruins of zombie mode are planned from (apocalypse.ts planRuins), read from a map. This is the one place that
 * knows the maps: ruinInputsFromCity() reads today's (city.ts: plots, trees, poles, lamps, greens, street life, doors),
 * the parking spots and kiosks, the story sites and the road graph with its walking network; ruinInputsFromWorld()
 * merges the wired districts into it (map/world-map.ts): their plots as oriented boxes, scenery, places, doors, solids,
 * the welded road graph, the land and its waters. ruinInputsFromRoads() turns any road graph into the road part.
 */
import { BUILDINGS, COLLIDERS, LAND, LIFE, PLOTS, POIS, RIVER, SCENERY, type Building, type Rect } from './city.ts';
import { LEGACY_ROADS } from './map/roads-legacy.ts';
import type { RoadGraph } from './map/roads.ts';
import { buildNav, createNav } from './nav.ts';
import { KIOSK_RECTS, LEGACY_SPOT_COUNT, SPOTS, spotRect } from './parking.ts';
import { SITES } from './story/sites.ts';
import type { RuinBox, RuinInput, RuinPlotInput, RuinSolid } from './apocalypse.ts';
import { worldRoads } from './map/world-types.ts';
import { WATERS } from './map/districts.ts';
import {
  DISTRICT_BUILDINGS, DISTRICT_COLLIDERS, DISTRICT_DOORS, DISTRICT_PLOTS, DISTRICT_POIS, DISTRICT_SCENERY, DISTRICT_STAMPS, DISTRICT_WATERS,
  LEGACY_HIDDEN, SLICES, SLICE_EXTRA, WORLD_ROADS, genBuilding, sliceAt, type WorldSolid,
} from './map/world-map.ts';

/** game.ts' START and BIKE_START, and the gameplay rings city.ts keeps clear (spawn, mission pickups, shop rings, receivers). */
const SPAWN = { x: 12.6, z: 12.4 }, BIKE = { x: 12.4, z: 14.2 };
const RINGS: readonly (readonly [number, number])[] = [[-32, 7], [-30, 13], [-18, 49.6], [20, -10.9], [22.5, -10.3], [54, -35], [28, -24], [-36.5, 35], [36, 33], [-20, -83.5], [32, 13.5]];

/**
 * The road part of a ruin input from any road graph: every edge with its cross-section, the junctions (nodes where
 * three or more roads meet), the crosswalks, and the walking network (buildNav legs) as walking lines. The live
 * graph's walking network is the shared one (nav.ts createNav), already built.
 */
export function ruinInputsFromRoads(roads: RoadGraph): Pick<RuinInput, 'roads' | 'junctions' | 'crosswalks' | 'walks'> {
  const nav = roads === worldRoads().roads ? createNav() : buildNav(roads);
  return {
    roads: roads.edges.map((e) => ({ id: e.id, pts: e.pts, half: e.half, sidewalk: e.sidewalk, walk: e.walk, cls: e.cls, traffic: e.traffic && !e.closed, bridge: /^CẦU /.test(e.name) })),
    junctions: roads.nodes.filter((n) => n.arms.length >= 3).map((n) => ({ x: n.x, z: n.z, r: Math.max(n.radius, 6), arms: n.arms.length })),
    crosswalks: roads.crosswalks.filter((c) => !c.phantom).map((c) => ({ x: (c.ax + c.bx) / 2, z: (c.az + c.bz) / 2, r: Math.hypot(c.bx - c.ax, c.bz - c.az) / 2 })),
    walks: nav.legs().map((l) => ({ ax: l.ax, az: l.az, bx: l.bx, bz: l.bz })),
  };
}

const box = (r: Rect) => ({ minX: r.minX, minZ: r.minZ, maxX: r.maxX, maxZ: r.maxZ });
/** Buildings players need in zombie mode and landmarks: never collapsed (fallen signs, vines and moss are fine). */
const KEEP_KINDS = new Set(['hospital', 'gunstore', 'bikeshop', 'pagoda', 'bank']);

/**
 * Today's map as a ruin input. `solids` are the world's colliders (game.ts passes world.colliders, which adds the
 * signal poles to city.ts COLLIDERS); parked vehicles' spots and kiosks are added to them, so ruins never stand where
 * a curb-parked car or an ATM is.
 */
export function ruinInputsFromCity(opts: { solids?: readonly Rect[]; roads?: RoadGraph } = {}): RuinInput {
  const graph = opts.roads ?? LEGACY_ROADS;
  const road = ruinInputsFromRoads(graph);
  const keepClear: { x: number; z: number; r: number; major?: boolean }[] = [
    { ...SPAWN, r: 12, major: true }, { ...BIKE, r: 4 },
    ...RINGS.map(([x, z]) => ({ x, z, r: 3 })),
    ...SCENERY.busStops.map((b) => ({ x: b.x, z: b.z, r: 4 })),
    ...SCENERY.docks.map((d) => ({ x: d.ring.x, z: d.ring.z, r: 6 })),
  ];
  for (const b of BUILDINGS) {
    // Shop doors people must reach stay wide open; every other door keeps a person's width.
    const needed = b.kind === 'hospital' || b.kind === 'gunstore' || b.kind === 'bikeshop';
    keepClear.push({ x: b.door.x, z: b.door.z, r: needed ? 6 : 2.5, major: needed });
  }
  for (const s of Object.values(SITES)) {
    if (s.phase !== 'P0' || s.x < LAND.minX || s.x > LAND.maxX || s.z < LAND.minZ || s.z > LAND.maxZ) continue;
    keepClear.push({ x: s.x, z: s.z, r: 4 });
  }
  // Door and seat paths are walked too (people in the living city, zombies here): ruins keep 1 m off them.
  const walks = [...road.walks!];
  for (const b of BUILDINGS) walks.push({ ax: b.door.x, az: b.door.z, bx: b.curb.x, bz: b.curb.z });
  for (const p of POIS) walks.push({ ax: p.curb.x, az: p.curb.z, bx: p.x, bz: p.z });
  const solids = [...(opts.solids ?? COLLIDERS).map(box), ...SPOTS.map((s) => box(spotRect(s))), ...KIOSK_RECTS.map(box)];
  const greens = [SCENERY.park, SCENERY.square, ...SCENERY.gardens, ...SCENERY.yards, SCENERY.plaza, SCENERY.cityPark].map(box);
  const stalls = [
    ...SCENERY.props.filter((p) => p.kind === 'stall' || p.kind === 'cart').map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, kind: p.kind })),
    ...LIFE.furniture.filter((f) => f.kind === 'stool' || f.kind === 'table').map((f) => ({ x: f.x, z: f.z, yaw: f.yaw, kind: f.kind })),
    ...LIFE.hawkerStops.map((h) => ({ x: h.x, z: h.z, yaw: h.yaw, kind: 'cart' })),
  ];
  // The quarantine checkpoint stands on the hospital's street, beside its door (6 m clear), facing the road.
  const hospital = BUILDINGS.find((b) => b.kind === 'hospital');
  const checkpoints = hospital ? [checkpointOf(hospital)] : [];
  return {
    bounds: { minX: LAND.minX, minZ: LAND.minZ, maxX: LAND.maxX, maxZ: LAND.maxZ },
    ...road,
    walks,
    plots: PLOTS.map((p) => {
      const b = BUILDINGS[p.id];
      return { ...box(p.full), id: p.id, h: p.h, facing: p.facing, style: p.style, sign: p.sign, keep: KEEP_KINDS.has(b.kind) || p.style === 'pagoda', ground: box(p.ground) };
    }),
    trees: SCENERY.trees.map((t) => ({ x: t.x, z: t.z, size: t.size, species: t.species })),
    poles: SCENERY.poles.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, line: p.line })),
    lamps: SCENERY.lamps.map((l) => ({ x: l.x, z: l.z, hx: l.hx, hz: l.hz })),
    greens, stalls, keepClear, solids, checkpoints,
    fleet: { cars: 8, motos: 25 },
  };
}

/** In the near lane of a hospital's street, 8 m along from its door (giữ xe rows line the wall itself), facing the road. */
function checkpointOf(hospital: Pick<Building, 'facing' | 'door' | 'curb'>) {
  const fx = Math.sin(hospital.facing), fz = Math.cos(hospital.facing), tx = Math.cos(hospital.facing), tz = -Math.sin(hospital.facing);
  const out = Math.hypot(hospital.curb.x - hospital.door.x, hospital.curb.z - hospital.door.z) + 4.5;
  return { x: hospital.door.x + tx * 8 + fx * out, z: hospital.door.z + tz * 8 + fz * out, yaw: hospital.facing };
}

// ---------------------------------------------------------------------------------------------------------------
// The wired city
// ---------------------------------------------------------------------------------------------------------------

/** Typologies that never collapse: places of worship, markets, hospitals, police stations and the authored landmarks. */
const KEEP_TYPOLOGIES = new Set(['pagoda', 'church', 'market-hall', 'hospital', 'police', 'landmark']);
/** The drive lane every traffic road keeps clear down its centre line (m): a car and a little room either side. */
export const RUIN_LANE = 2.6;
/** Coordinates to the millimetre and yaws to the micro-radian: a value computed with trig at load (a roundabout's arc, a water's bend) plans the same in every engine. */
const mm = (v: number) => Math.round(v * 1000) / 1000;
const micro = (v: number) => Math.round(v * 1e6) / 1e6;
const ring = (r: Rect) => [r.minX, r.minZ, r.maxX, r.minZ, r.maxX, r.maxZ, r.minX, r.maxZ];
const boundsOf = (poly: readonly number[]) => {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < poly.length; i += 2) { minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]); minZ = Math.min(minZ, poly[i + 1]); maxZ = Math.max(maxZ, poly[i + 1]); }
  return { minX, minZ, maxX, maxZ };
};
const inPoly = (p: readonly number[], x: number, z: number) => {
  let hit = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit;
  return hit;
};
const obox = (cx: number, cz: number, hx: number, hz: number, yaw: number): RuinBox => ({ cx: mm(cx), cz: mm(cz), hx: mm(hx), hz: mm(hz), yaw: micro(yaw) });
/** Outside today's land and on a wired slice's: today's scenery there is hidden (map/world-map.ts LEGACY_HIDDEN's rule). */
const underDistrict = (x: number, z: number) => !(x >= LAND.minX && x <= LAND.maxX && z >= LAND.minZ && z <= LAND.maxZ) && !!sliceAt(x, z);

/**
 * The live map as a ruin input: today's (ruinInputsFromCity's lists, less the scenery LEGACY_HIDDEN hides under wired
 * land) merged with every wired district's. `solids` are today's colliders (game.ts: world.colliders, signal poles
 * included) and `districtSolids` the districts' oriented ones (world.districtColliders: buildings, trees, lamps, poles,
 * props, works, the curb fleet, ring islands, signal poles), with every parked vehicle's spot, the kiosks, the walking
 * streets' night tables and Bến Thành's stalls added. District plots carry their oriented box (rotated buildings
 * collapse along it); landmarks, places of worship, markets, hospitals, police stations, story stamps and the heritage
 * sites keep (never collapse). Doors and places are walking lines and keep-clear spots (the doors players need, the
 * story sites and the heritage entrances wide); the roads are the welded live graph (`roads`, nav.roads in game.ts);
 * bounds are the land union's box and the land itself (the slices less their waters, plus the bridges) is passed on,
 * so nothing stands in the river or a canal; every traffic road keeps a RUIN_LANE drive lane. The fleet's wreck spots
 * scale with the traffic lanes' length (up to vehicles.ts' fleet: 13 cars, 50 motorbikes). With nothing wired it is
 * ruinInputsFromCity().
 */
export function ruinInputsFromWorld(opts: { solids?: readonly Rect[]; districtSolids?: readonly WorldSolid[]; roads?: RoadGraph } = {}): RuinInput {
  if (!SLICES.length) return ruinInputsFromCity({ solids: opts.solids, roads: opts.roads });
  const graph = opts.roads ?? WORLD_ROADS;
  const road = ruinInputsFromRoads(graph);
  const hidden = LEGACY_HIDDEN;
  const heritage = ((SLICE_EXTRA['quan-1-south'] as { heritage?: { poly: number[]; indestructible?: boolean }[] } | undefined)?.heritage ?? []).filter((h) => h.indestructible);
  const inHeritage = (x: number, z: number) => heritage.some((h) => inPoly(h.poly, x, z));

  // ---- Keep-clear spots and walking lines ----
  const keepClear: { x: number; z: number; r: number; major?: boolean }[] = [
    { ...SPAWN, r: 12, major: true }, { ...BIKE, r: 4 },
    ...RINGS.map(([x, z]) => ({ x, z, r: 3 })),
    ...SCENERY.busStops.filter((b) => !underDistrict(b.x, b.z)).map((b) => ({ x: b.x, z: b.z, r: 4 })),
    ...SCENERY.docks.map((d) => ({ x: d.ring.x, z: d.ring.z, r: 6 })),
    ...DISTRICT_SCENERY.busStops.map((b) => ({ x: b.x, z: b.z, r: 4 })),
  ];
  for (const b of BUILDINGS) {
    const needed = b.kind === 'hospital' || b.kind === 'gunstore' || b.kind === 'bikeshop';
    keepClear.push({ x: b.door.x, z: b.door.z, r: needed ? 6 : 2.5, major: needed });
  }
  for (const d of DISTRICT_DOORS) {
    // The doors players need (a hospital to come back at, a police station) and the heritage sites' stay wide open.
    const b = genBuilding(d.building);
    const needed = !!b && (b.kind === 'hospital' || b.kind === 'police' || b.typology === 'hospital' || inHeritage(b.box.cx, b.box.cz));
    keepClear.push({ x: d.door.x, z: d.door.z, r: needed ? 6 : 2.5, major: needed });
  }
  for (const s of DISTRICT_STAMPS) {
    // A landmark's or story stamp's way in (its door, hatch, dock or ladder).
    if (s.door) keepClear.push({ x: s.door.x, z: s.door.z, r: 4 });
    for (const w of s.ways) keepClear.push({ x: w.x, z: w.z, r: 3 });
  }
  for (const s of Object.values(SITES)) {
    // Story sites on the live map: today's (P0, inside today's land) and the wired districts' (P1), with their doors.
    const today = s.phase === 'P0' && s.x >= LAND.minX && s.x <= LAND.maxX && s.z >= LAND.minZ && s.z <= LAND.maxZ;
    if (!today && !(s.phase === 'P1' && sliceAt(s.x, s.z))) continue;
    keepClear.push({ x: s.x, z: s.z, r: 4 });
    if (s.door && !today) keepClear.push({ x: s.door.x, z: s.door.z, r: 4 });
  }
  const walks = [...road.walks!];
  for (const b of BUILDINGS) walks.push({ ax: b.door.x, az: b.door.z, bx: b.curb.x, bz: b.curb.z });
  for (const p of POIS) walks.push({ ax: p.curb.x, az: p.curb.z, bx: p.x, bz: p.z });
  for (const d of DISTRICT_DOORS) walks.push({ ax: d.door.x, az: d.door.z, bx: d.curb.x, bz: d.curb.z });
  for (const p of DISTRICT_POIS) walks.push({ ax: p.curb.x, az: p.curb.z, bx: p.x, bz: p.z });

  // ---- Solids: today's rects, the districts' oriented boxes, parked vehicles, kiosks, night tables, market stalls ----
  const parked = SCENERY.props.filter((p) => p.kind === 'scooter');
  const isParked = (c: Rect) => c.top !== undefined && parked.some((p) => Math.abs((c.minX + c.maxX) / 2 - p.x) < 1e-6 && Math.abs((c.minZ + c.maxZ) / 2 - p.z) < 1e-6);
  const todaySolids = opts.solids ?? COLLIDERS.filter((c, i) => !isParked(c) && !hidden.colliders.has(i));
  const solids: RuinSolid[] = [...todaySolids.map(box), ...(opts.districtSolids ?? DISTRICT_COLLIDERS).map((c) => obox(c.cx, c.cz, c.hx, c.hz, c.yaw)), ...KIOSK_RECTS.map(box)];
  SPOTS.forEach((s, i) => {
    // Today's spots as today's input has them; the districts' (any heading) as turned boxes.
    if (i < LEGACY_SPOT_COUNT) solids.push(box(spotRect(s)));
    else solids.push(obox(s.x, s.z, s.vehicle === 'moto' ? 0.31 : 1.0, s.vehicle === 'moto' ? 0.875 : 2.3, s.yaw));
  });
  type Night = { tables: { x: number; z: number; yaw: number }[] };
  const nightTables = (['quan-1-south', 'quan-4'] as const).flatMap((k) => ((SLICE_EXTRA[k] as { nightSeats?: Night } | undefined)?.nightSeats?.tables ?? []));
  // A walking street's table and its stools (out on the carriageway after dark): 2.2 m along the street, 2 m across.
  for (const t of nightTables) solids.push(obox(t.x, t.z, 1.1, 1.0, t.yaw));
  type Stall = { x: number; z: number; w: number; d: number; yaw: number };
  const q1 = SLICE_EXTRA['quan-1-south'] as { market?: { night: { stalls: Stall[] }; day: { stalls: Stall[] } }; bookstalls?: { stalls: Stall[] } } | undefined;
  const marketStalls = [...(q1?.market?.night.stalls ?? []), ...(q1?.market?.day.stalls ?? []), ...(q1?.bookstalls?.stalls ?? [])];
  for (const s of marketStalls) solids.push(obox(s.x, s.z, s.w / 2, s.d / 2, s.yaw));

  // ---- Plots: today's as rects, the districts' with their oriented boxes ----
  const plots: RuinPlotInput[] = PLOTS.map((p) => {
    const b = BUILDINGS[p.id];
    return { ...box(p.full), id: p.id, h: p.h, facing: p.facing, style: p.style, sign: p.sign, keep: KEEP_KINDS.has(b.kind) || p.style === 'pagoda', ground: box(p.ground) };
  });
  DISTRICT_PLOTS.forEach((p, i) => {
    const b = DISTRICT_BUILDINGS[i], B = p.box;
    const keep = KEEP_KINDS.has(b.kind) || b.kind === 'police' || KEEP_TYPOLOGIES.has(p.typology) || p.style === 'pagoda' || p.style === 'church' || b.stamp !== null || inHeritage(B.cx, B.cz);
    plots.push({ minX: mm(p.full.minX), minZ: mm(p.full.minZ), maxX: mm(p.full.maxX), maxZ: mm(p.full.maxZ), id: p.id, h: p.h, facing: micro(p.facing), style: p.style, sign: p.sign, keep, box: obox(B.cx, B.cz, B.hx, B.hz, B.yaw) });
  });

  // ---- Scenery: today's (less what LEGACY_HIDDEN hides) and the districts' ----
  const trees = [
    ...SCENERY.trees.filter((_, i) => !hidden.trees.has(i)).map((t) => ({ x: t.x, z: t.z, size: t.size, species: t.species })),
    ...DISTRICT_SCENERY.trees.map((t) => ({ x: mm(t.x), z: mm(t.z), size: t.size, species: t.species })),
  ];
  const poles = [
    ...SCENERY.poles.filter((_, i) => !hidden.poles.has(i)).map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, line: p.line })),
    ...DISTRICT_SCENERY.poles.map((p) => ({ x: mm(p.x), z: mm(p.z), yaw: micro(p.yaw), line: p.line })),
  ];
  const lamps = [
    ...SCENERY.lamps.filter((_, i) => !hidden.lamps.has(i)).map((l) => ({ x: l.x, z: l.z, hx: l.hx, hz: l.hz })),
    ...DISTRICT_SCENERY.lamps.map((l) => ({ x: mm(l.x), z: mm(l.z), hx: mm(l.hx), hz: mm(l.hz) })),
  ];
  const greens = [
    ...[SCENERY.park, SCENERY.square, ...SCENERY.gardens, ...SCENERY.yards, SCENERY.plaza, SCENERY.cityPark].map(box),
    ...[...DISTRICT_SCENERY.parks, ...DISTRICT_SCENERY.yards].map((g) => { const poly = g.poly.map(mm); return { ...boundsOf(poly), poly }; }),
  ];
  const stalls = [
    ...SCENERY.props.filter((p, i) => (p.kind === 'stall' || p.kind === 'cart') && !hidden.props.has(i)).map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, kind: p.kind as string })),
    ...LIFE.furniture.filter((f) => (f.kind === 'stool' || f.kind === 'table') && !underDistrict(f.x, f.z)).map((f) => ({ x: f.x, z: f.z, yaw: f.yaw, kind: f.kind as string })),
    ...LIFE.hawkerStops.filter((h) => !underDistrict(h.x, h.z)).map((h) => ({ x: h.x, z: h.z, yaw: h.yaw, kind: 'cart' })),
    // The districts' carts and market stalls, the quán tables and their stools, the walking streets' night tables.
    ...DISTRICT_SCENERY.props.filter((p) => p.kind === 'stall' || p.kind === 'cart').map((p) => ({ x: mm(p.x), z: mm(p.z), yaw: micro(p.yaw), kind: p.kind as string })),
    ...DISTRICT_SCENERY.eateries.map((e) => ({ x: mm(e.x), z: mm(e.z), yaw: micro(e.yaw), kind: 'table' })),
    ...DISTRICT_POIS.filter((p) => p.kind === 'cafe-seat').map((p) => ({ x: mm(p.x), z: mm(p.z), yaw: micro(p.yaw), kind: 'stool' })),
    ...nightTables.map((t) => ({ x: mm(t.x), z: mm(t.z), yaw: micro(t.yaw), kind: 'table' })),
  ];

  // ---- Checkpoints at every hospital (today's and the districts'), the land, the fleet ----
  const checkpoints = [...BUILDINGS.filter((b) => b.kind === 'hospital'), ...DISTRICT_BUILDINGS.filter((b) => b.kind === 'hospital')].map(checkpointOf);
  const union = [LAND, ...SLICES.map((s) => s.box)];
  const bounds = { minX: Math.min(...union.map((b) => b.minX)), minZ: Math.min(...union.map((b) => b.minZ)), maxX: Math.max(...union.map((b) => b.maxX)), maxZ: Math.max(...union.map((b) => b.maxZ)) };
  // Water: today's river and every waterway the wired slices have, as the terrain has them (map/districts.ts WATERS).
  const waterIds = new Set(['song-sai-gon', ...DISTRICT_WATERS.map((w) => w.id)]);
  const holes = [ring(RIVER), ...WATERS.filter((w) => waterIds.has(w.id)).map((w) => w.poly), ...DISTRICT_WATERS.filter((w) => !WATERS.some((c) => c.id === w.id)).map((w) => w.poly)];
  const land = { polys: [ring(LAND), ...SLICES.map((s) => s.bounds)].map((p) => p.map(mm)), holes: holes.map((p) => p.map(mm)) };
  // Wreck spots for vehicles.ts' fleet (13 cars, 50 motorbikes) in proportion to the traffic lanes (today's 8 and 25).
  const laneLength = (g: RoadGraph) => g.edges.reduce((s, e) => s + (e.traffic && !e.closed && e.cls !== 'hem' ? e.len : 0), 0);
  const scale = laneLength(graph) / Math.max(1, laneLength(LEGACY_ROADS));
  const fleet = { cars: Math.min(13, Math.round(8 * scale)), motos: Math.min(50, Math.round(25 * scale)) };

  const xz = <T extends { x: number; z: number }>(p: T): T => ({ ...p, x: mm(p.x), z: mm(p.z) });
  return {
    bounds,
    roads: road.roads.map((r) => ({ ...r, pts: r.pts.map(mm) })),
    junctions: road.junctions.map((j) => ({ ...xz(j), r: mm(j.r) })),
    crosswalks: road.crosswalks.map((c) => ({ ...xz(c), r: mm(c.r) })),
    walks: walks.map((w) => ({ ax: mm(w.ax), az: mm(w.az), bx: mm(w.bx), bz: mm(w.bz) })),
    plots, trees, poles, lamps, greens, stalls,
    keepClear: keepClear.map((k) => ({ ...xz(k), r: mm(k.r) })),
    solids: solids.map((s) => ('cx' in s ? s : { minX: mm(s.minX), minZ: mm(s.minZ), maxX: mm(s.maxX), maxZ: mm(s.maxZ) })),
    checkpoints: checkpoints.map((c) => ({ ...xz(c), yaw: micro(c.yaw) })),
    fleet, land, lane: RUIN_LANE,
  };
}
