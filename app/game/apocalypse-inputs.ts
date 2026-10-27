/**
 * What the ruins of zombie mode are planned from (apocalypse.ts planRuins), read from a map. This is the one place that
 * knows today's map: ruinInputsFromCity() reads city.ts (plots, trees, poles, lamps, greens, street life, doors), the
 * parking spots and kiosks, the story sites and the road graph with its walking network. The wired districts add a
 * ruinInputsFromWorld() next to it that calls ruinInputsFromRoads() with worldRoads().roads and their own lists.
 */
import { BUILDINGS, COLLIDERS, LAND, LIFE, PLOTS, POIS, SCENERY, type Rect } from './city.ts';
import { LEGACY_ROADS } from './map/roads-legacy.ts';
import type { RoadGraph } from './map/roads.ts';
import { buildNav } from './nav.ts';
import { KIOSK_RECTS, SPOTS, spotRect } from './parking.ts';
import { SITES } from './story/sites.ts';
import type { RuinInput } from './apocalypse.ts';

/** game.ts' START and BIKE_START, and the gameplay rings city.ts keeps clear (spawn, mission pickups, shop rings, receivers). */
const SPAWN = { x: 12.6, z: 12.4 }, BIKE = { x: 12.4, z: 14.2 };
const RINGS: readonly (readonly [number, number])[] = [[-32, 7], [-30, 13], [-18, 49.6], [20, -10.9], [22.5, -10.3], [54, -35], [28, -24], [-36.5, 35], [36, 33], [-20, -83.5], [32, 13.5]];

/**
 * The road part of a ruin input from any road graph: every edge with its cross-section, the junctions (nodes where
 * three or more roads meet), the crosswalks, and the walking network (buildNav legs) as walking lines.
 */
export function ruinInputsFromRoads(roads: RoadGraph): Pick<RuinInput, 'roads' | 'junctions' | 'crosswalks' | 'walks'> {
  return {
    roads: roads.edges.map((e) => ({ id: e.id, pts: e.pts, half: e.half, sidewalk: e.sidewalk, walk: e.walk, cls: e.cls, traffic: e.traffic && !e.closed, bridge: /^CẦU /.test(e.name) })),
    junctions: roads.nodes.filter((n) => n.arms.length >= 3).map((n) => ({ x: n.x, z: n.z, r: Math.max(n.radius, 6), arms: n.arms.length })),
    crosswalks: roads.crosswalks.filter((c) => !c.phantom).map((c) => ({ x: (c.ax + c.bx) / 2, z: (c.az + c.bz) / 2, r: Math.hypot(c.bx - c.ax, c.bz - c.az) / 2 })),
    walks: buildNav(roads).legs().map((l) => ({ ax: l.ax, az: l.az, bx: l.bx, bz: l.bz })),
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
  const checkpoints: { x: number; z: number; yaw: number }[] = [];
  if (hospital) {
    // In the near lane of the hospital's street, 8 m along from its door (giữ xe rows line the wall itself).
    const fx = Math.sin(hospital.facing), fz = Math.cos(hospital.facing), tx = Math.cos(hospital.facing), tz = -Math.sin(hospital.facing);
    const out = Math.hypot(hospital.curb.x - hospital.door.x, hospital.curb.z - hospital.door.z) + 4.5;
    checkpoints.push({ x: hospital.door.x + tx * 8 + fx * out, z: hospital.door.z + tz * 8 + fz * out, yaw: hospital.facing });
  }
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
