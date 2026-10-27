/**
 * What the live traffic systems (vehicles.ts, signals.ts, police.ts, zombies.ts, side-missions.ts, transit.ts, buses.ts
 * and nav.ts) drive and walk on: the road graph of the live map and, per edge, what the graph itself does not say
 * (closing hours, the Quận 1 truck ban, bus routes, when its curb bays have something standing in them), plus the bus
 * shelters and the 23/9 terminus of the wired slices.
 *
 * The wiring (world-map.ts, WIRING-PLAN §2) builds it once from the stack with buildWorldRoads() and hands it over with
 * setWorldRoads() before the game is created. Until then, and whenever no slice is wired, it is today's grid
 * (LEGACY_ROADS) with nothing extra, so the legacy area drives, walks and signals exactly as it always has, and
 * tests and tools that import these modules see today's map. Pure data and maths (no three.js); type-only imports
 * of the generator, so importing this file never runs map generation.
 */
import type { BayKind, RoadGraph } from './roads.ts';
import { LEGACY_ROADS } from './roads-legacy.ts';
import { districtAt, type DistrictId } from './districts.ts';
import type { StackSlice } from './stack.ts';

/** A span of game hours [from, to), wrapping past midnight ([19, 2] is 19:00–02:00; [0, 24] all day). */
export type Hours = readonly [number, number];
/** Whether game hour `h` falls in a span. */
export function inHours(span: Hours | null | undefined, h: number) {
  if (!span) return false;
  const [a, b] = span, x = ((h % 24) + 24) % 24;
  if (b - a >= 24 || (a === 0 && b === 24)) return true;
  return a <= b ? x >= a && x < b : x >= a || x < b;
}
/** Game hours from `h` until a span next starts (0 inside it). */
export function hoursUntil(span: Hours | null | undefined, h: number) {
  if (!span) return Infinity;
  if (inHours(span, h)) return 0;
  return (((span[0] - h) % 24) + 24) % 24;
}

/** A curb bay as traffic sees it: where (edge.bays shape) and the hours something stands in it (null: never). */
export type TrafficBay = { side: 1 | -1; s0: number; s1: number; depth: number; kind: BayKind; hours: Hours | null };
/**
 * What the live map knows about one edge of the live graph beyond its geometry (world-map.ts EDGE_INFO is this list):
 * who built it, its generator key and arterial, its district, closing hours, truck ban, bus route, curb uses, the block
 * a hẻm belongs to, and its curb bays with their hours.
 */
export type EdgeInfo = {
  /** Who built it ('legacy', a slice key, or 'link:<id>') and the arterial it was drawn from (legacy: the street name). */
  slice: string; art: string;
  /** Its stable key ('legacy:<id>' for today's, the slice's edge key, `<key>:<s>` for the second half of a seam split). */
  key: string;
  /** The generator's curb uses on its two sides (null on today's edges) and the block a hẻm serves (or null). */
  curb: readonly [string, string] | null; block: string | null;
  /** The district its middle lies in (districts.ts), for the traffic mix and bans. */
  district: DistrictId | null;
  /** Closed to every vehicle in these hours (a walking street, a night market), or null. */
  closed: Hours | null;
  /** No trucks in these hours (Quận 1, 06–22), or null. */
  noTrucks: Hours | null;
  /** A bus route runs along it. */
  bus: boolean;
  /** Its curb bays: edge.bays with their hours, then any the wiring adds (the 23/9 terminus's bus bays). */
  bays: TrafficBay[];
};
/** The name traffic code has always used for it. */
export type EdgeTraffic = EdgeInfo;
/** A bus shelter a slice built (gen/dressing.ts busStops): the bench and the way it faces (towards the road). */
export type WorldShelter = { id: string; name: string; x: number; z: number; yaw: number; slice: string };
/** The 23/9 terminus (QUAN_1_SOUTH_EXTRA.bus): its stop (bench, facing the road), the lines that turn in, its street. */
export type WorldTerminus = { id: string; name: string; x: number; z: number; yaw: number; lines: string[]; road: string };
export type WorldRoads = {
  /** The live road graph (legacy node and edge ids first and unchanged). */
  roads: RoadGraph;
  /** Per edge of `roads`, index for index. */
  edges: EdgeTraffic[];
  /** Bus shelters of the wired slices (today's five are transit.ts BUS_STOPS). */
  shelters: WorldShelter[];
  terminus: WorldTerminus | null;
  /** Wired slice keys, in wiring order (empty: today's map). */
  slices: string[];
};

const NONE: Omit<EdgeTraffic, 'slice' | 'art' | 'district' | 'key'> = { closed: null, noTrucks: null, bus: false, bays: [], curb: null, block: null };
const midOf = (roads: RoadGraph, id: number) => { const e = roads.edges[id], p = roads.pointAt(e, e.len / 2); return p; };
/** Today's grid with nothing extra: no closures, no bays, no bans. */
export function legacyWorld(roads: RoadGraph = LEGACY_ROADS): WorldRoads {
  return {
    roads, shelters: [], terminus: null, slices: [],
    edges: roads.edges.map((e) => { const m = midOf(roads, e.id); return { ...NONE, slice: 'legacy', key: `legacy:${e.id}`, art: e.name, district: districtAt(m.x, m.z)?.district.id ?? null, bays: [] }; }),
  };
}

let current: WorldRoads | null = null;
let version = 0;
/** The live roads (today's grid until the wiring sets the wired map). */
export function worldRoads(): WorldRoads {
  if (!current) current = legacyWorld();
  return current;
}
/** Bumped by every setWorldRoads: consumers that cache anything per graph compare it. */
export const worldVersion = () => version;
/**
 * Hands the live map to the traffic systems. Call it before the game is created (createGame builds vehicles, buses and
 * the walking network from it); a later call is picked up by signals.ts at once and by vehicles.ts on its next update.
 */
export function setWorldRoads(next: WorldRoads) {
  if (next.edges.length !== next.roads.edges.length) throw new Error(`world roads: ${next.edges.length} edge records for ${next.roads.edges.length} edges`);
  current = next;
  version++;
}

/** Per-slice data the layout format has no field for (each slice's *_EXTRA), as buildWorldRoads reads it. */
export type SliceTrafficExtra = {
  /** Bays of an arterial's side live in these hours, by arterial id and bay kind (QUAN_4_EXTRA.curbHours). */
  curbHours?: Record<string, Partial<Record<BayKind, Hours>>>;
  /** Trucks banned in the slice's district in these hours (QUAN_1_SOUTH_EXTRA.truckBan). */
  truckBan?: Hours;
  /**
   * A bus terminus (QUAN_1_SOUTH_EXTRA.bus): its stop, the lines, the arterial `route` it stands on and its bays
   * (`side` 'east'/'west'/'north'/'south' of that street, from z0 to z1 or x0 to x1).
   */
  bus?: {
    terminus: string; routes: string[]; route: string; stop: { x: number; z: number; yaw: number };
    bays: { road: string; side: 'east' | 'west' | 'north' | 'south'; z0?: number; z1?: number; x0?: number; x1?: number; depth: number; kind: BayKind }[];
  };
};
/** A street's name on a stop sign: without ĐƯỜNG or ĐẠI LỘ (a bridge keeps CẦU). */
const short = (name: string) => name.replace(/^(ĐƯỜNG|ĐẠI LỘ) /, '');

/**
 * The traffic data of a stacked map. `roads` is the live graph built from liveInput(stack, legacy).input and
 * `edgeOf` its origins (liveInput's edgeOf, index for index); `slices` the stack's slices (their graph patches carry
 * each new edge's closing hours and bus flag); `extras` each slice's *_EXTRA by slice key. The truck ban covers its
 * whole district, today's part included (Quận 1 · Bến Nghé north of the old south fence).
 */
export function buildWorldRoads(
  roads: RoadGraph, edgeOf: readonly { slice: string; key: string; art: string }[], slices: readonly StackSlice[],
  extras: Readonly<Record<string, SliceTrafficExtra | undefined>> = {},
): WorldRoads {
  if (edgeOf.length !== roads.edges.length) throw new Error(`world roads: ${edgeOf.length} origins for ${roads.edges.length} edges`);
  const patchExtra = new Map<string, { art: string; bus: boolean; closedHours: [number, number] | null; curb: [string, string]; block: string | null }>();
  for (const s of slices) s.data.graphPatch.keys.edges.forEach((k, j) => patchExtra.set(`${s.key}|${k}`, s.data.graphPatch.extra[j]));
  /** A slice edge's generator extra: its own key, or (a seam split appends ":<s>", once per split) its original's. */
  const extraOf = (slice: string, key: string) => {
    for (let k = key; ; k = k.replace(/:[\d.]+$/, '')) {
      const x = patchExtra.get(`${slice}|${k}`);
      if (x || !/:[\d.]+$/.test(k)) return x;
    }
  };
  const districtOfSlice = new Map(slices.map((s) => [s.key, s.layout.id] as const));
  const bans = new Map<DistrictId, Hours>();
  for (const s of slices) { const b = extras[s.key]?.truckBan; if (b) bans.set(s.layout.id, b); }
  const edges: EdgeTraffic[] = roads.edges.map((e, i) => {
    const o = edgeOf[i], m = midOf(roads, i);
    const district = o.slice === 'legacy' || o.slice.startsWith('link:') ? districtAt(m.x, m.z)?.district.id ?? null : districtOfSlice.get(o.slice) ?? districtAt(m.x, m.z)?.district.id ?? null;
    // A split edge's key is its original's plus ":<arc>" (stack.ts splitEdge).
    const x = o.slice === 'legacy' ? undefined : extraOf(o.slice, o.key);
    const hours = extras[o.slice]?.curbHours?.[x?.art ?? ''] ?? {};
    return {
      slice: o.slice, key: o.key, art: x?.art ?? o.art.replace(/^legacy:/, ''), district,
      curb: x ? [x.curb[0], x.curb[1]] as const : null, block: x?.block ?? null,
      closed: x?.closedHours ?? null, noTrucks: district ? bans.get(district) ?? null : null, bus: !!x?.bus,
      // Car and coach bays hold parked vehicles all day unless the slice says otherwise; loading bays only in their hours.
      bays: e.bays.map((b) => ({ ...b, hours: hours[b.kind] ?? (b.kind === 'car' || b.kind === 'taxi' ? [0, 24] as const : null) })),
    };
  });
  // The terminus: its stop and bus bays on its street (the generator lays no 'bus' bays).
  let terminus: WorldTerminus | null = null;
  for (const s of slices) {
    const bus = extras[s.key]?.bus;
    if (!bus) continue;
    terminus = { id: bus.terminus, name: 'TRẠM XE BUÝT CÔNG VIÊN 23/9', ...bus.stop, lines: bus.routes.slice(), road: bus.route };
    for (const bay of bus.bays) {
      edges.forEach((info, i) => {
        if (info.slice !== s.key || info.art !== bay.road) return;
        const e = roads.edges[i];
        // The bay's ends as arc lengths along this edge (clamped to it), and its side relative to a→b.
        const ns = bay.z0 !== undefined, lo = ns ? bay.z0! : bay.x0!, hi = ns ? bay.z1! : bay.x1!;
        const a = roads.project(e, ns ? e.pts[0] : lo, ns ? lo : e.pts[1]), b = roads.project(e, ns ? e.pts[0] : hi, ns ? hi : e.pts[1]);
        const s0 = Math.min(a.s, b.s), s1 = Math.max(a.s, b.s);
        if (s1 - s0 < 6) return;
        const p = roads.pointAt(e, (s0 + s1) / 2), want = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }[bay.side];
        // Right of a→b is (-hz, hx).
        const side: 1 | -1 = -p.hz * want[0] + p.hx * want[1] > 0 ? 1 : -1;
        info.bays.push({ side, s0, s1, depth: bay.depth, kind: bay.kind, hours: [5, 23] });
      });
    }
  }
  // Shelters of the wired slices, named as Sài Gòn names its stops: the street and the nearest street crossing it
  // ("ĐIỆN BIÊN PHỦ – XÔ VIẾT NGHỆ TĨNH"), numbered only where two would read the same.
  const shelters: WorldShelter[] = [];
  for (const s of slices) {
    s.data.scenery.busStops.forEach((b, k) => {
      const h = roads.nearestEdge(b.x, b.z, 20, (e) => e.traffic);
      if (!h) return;
      const e = h.edge, ends = [roads.nodes[e.a], roads.nodes[e.b]].sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
      let cross = '';
      for (const n of ends) {
        for (const arm of n.arms) { const o = roads.edges[arm.edge]; if (o.traffic && o.cls !== 'hem' && o.name !== e.name) { cross = o.name; break; } }
        if (cross) break;
      }
      shelters.push({ id: `${s.key}:bus:${k}`, name: `TRẠM ${short(e.name)}${cross ? ` – ${short(cross)}` : ''}`, x: b.x, z: b.z, yaw: b.yaw, slice: s.key });
    });
  }
  for (const sh of shelters) {
    const same = shelters.filter((o) => o.name === sh.name);
    if (same.length > 1) same.forEach((o, i) => { o.name = `${o.name.replace(/ \d+$/, '')} ${i + 1}`; });
  }
  return { roads, edges, shelters, terminus, slices: slices.map((s) => s.key) };
}
