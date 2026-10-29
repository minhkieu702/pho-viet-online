import { SECONDS_PER_HOUR } from './clock';
import { DOCKS } from './map/consts';
import { LEGACY_ROADS } from './map/roads-legacy';
import type { RoadEdge, RoadGraph } from './map/roads';
import { worldRoads, type WorldRoads } from './map/world-types';

/**
 * Public transport as pure data and maths (no three.js): city bus lines over a RoadGraph, the river bus (tàu buýt
 * sông) between the docks, and the đò ngang ferry for later. A line is a closed cycle (a bus loop, or a boat's
 * there-and-back) with its stops at arc lengths along it, a timetable of departures from its first stop by
 * hour, and a run-time profile, so where every trip is and when it reaches each stop follow from the clock
 * alone ("on rails"): ETAs hold whether or not the vehicle is near the player. Vehicles wait at their line's
 * terminus between trips (or go to the depot when the next one is far off), queue at shared stops and do not
 * pass each other. One ledger per network seats riders (the player and NPCs) in vehicles: capacity, fares,
 * destinations, the bell, and a change at the terminus for anyone bound further on.
 * Time is game hours since the clock started (day * 24 + hour); run, dwell and turn times are real seconds,
 * turned into game time with SECONDS_PER_HOUR. Headways are in game minutes.
 */

export type TransitMode = 'bus' | 'waterbus' | 'ferry';
export type Pt = { x: number; z: number };
export type StopSpec = {
  id: string; name: string; mode: TransitMode;
  /** Where riders wait: the shelter bench, the pier ring. */
  wait: Pt;
  /** Bus: the bench's yaw (it faces the road). */
  yaw?: number;
  /** Boats: where the hull's centre lies when docked. */
  berth?: Pt;
  /** Not built on today's map yet (no shelter or pier). */
  planned?: boolean;
  /** Bus: pull in only as far as the room before the junction ahead allows (a district shelter near a corner). */
  fit?: boolean;
};
/** Service from `from` to `to` (game hours, [from, to)) with a departure every `every` game minutes. */
export type HeadwayBand = { from: number; to: number; every: number };
export type LineSpec = {
  id: string; name: string; mode: TransitMode;
  /** Stops in service order; the cycle returns to the first, the terminus. */
  stops: string[];
  /**
   * Bus: points the route must pass between stop k and the next (lane side of a road), keyed by k. A point with a
   * heading (hx, hz) is passed driving that way along the road nearest it.
   */
  via?: Record<number, (Pt & { hx?: number; hz?: number })[]>;
  /** Bus: route every leg with a fixed heading at each end (stops, headed via points), never through a street with closing hours. */
  directed?: boolean;
  /** Boats: the closed course as x,z pairs, starting at the terminus berth. */
  course?: number[];
  /** Cruise speed (m/s), acceleration and braking (m/s²). */
  cruise: number; accel: number; decel: number;
  /** Seconds at each stop, extra seconds at the terminus between trips, seconds per radian of turning. */
  dwell: number; layover: number; turn: number;
  /** Fare in game cash (thousand đồng) and seats plus standing room. */
  fare: number; capacity: number;
  headways: HeadwayBand[];
  /** Minutes after the first band opens that the first trip leaves (staggers lines sharing a terminus). */
  offset?: number;
  /** Vehicle length and half width; bus: the front door's distance ahead of the centre (it stops at the shelter). */
  length: number; hw: number; door: number;
  planned?: boolean;
};

export type TransitStop = StopSpec & {
  /** Centre of the docked vehicle and its heading. */
  x: number; z: number; hx: number; hz: number;
  /** Bus: the road edge, the travel direction that serves it (stop on the right) and the centre's arc length. */
  edge: number; dir: 1 | -1; s: number;
  /** Bus: how far right of the road's centre line the docked bus stands. */
  lat?: number;
};
export type Path = { pts: number[]; cum: number[]; len: number };
/** A call at a stop: arc length on the line's path, seconds after the trip leaves the terminus. */
export type Visit = { stop: TransitStop; s: number; arrive: number; depart: number };
type Segment = { s: number; d: number; time: number; trap: number };
export type TransitLine = {
  id: string; name: string; mode: TransitMode; spec: LineSpec;
  path: Path; visits: Visit[]; segments: Segment[];
  /** Seconds from leaving the terminus to arriving back at it. */
  run: number;
  /** Bus: the road plan around the cycle from the terminus, for lane driving. */
  plan: { edge: number; dir: 1 | -1 }[];
};
export type TransitNetwork = { lines: TransitLine[]; stops: Map<string, TransitStop>; issues: string[] };

// ---- Today's stops and lines ----------------------------------------------------------------------------

/** The shelters city.ts builds (busStop()), bench position and facing; named after what stands beside them. */
const BUS_STOPS: StopSpec[] = [
  { id: 'ben-do', name: 'BẾN ĐÒ AN HÒA', mode: 'bus', wait: { x: -76, z: -117.95 }, yaw: 0 },
  { id: 'cong-an', name: 'CÔNG AN PHƯỜNG AN HÒA', mode: 'bus', wait: { x: -117.95, z: -19.5 }, yaw: Math.PI / 2 },
  { id: 'truong-hoc', name: 'TRƯỜNG TIỂU HỌC AN HÒA', mode: 'bus', wait: { x: 38, z: 117.95 }, yaw: Math.PI },
  { id: 'benh-vien', name: 'BỆNH VIỆN AN HÒA', mode: 'bus', wait: { x: 117.95, z: -36 }, yaw: -Math.PI / 2 },
  { id: 'bach-dang', name: 'BẾN BẠCH ĐẰNG', mode: 'bus', wait: { x: 180, z: -117.95 }, yaw: 0 },
];
/** The river bus berths alongside the pier end of the two docks that do not hire out speedboats. */
export const BERTH_Z = -154.8;
const WB_IDS: Record<number, string> = { [-80]: 'wb-an-hoa', 190: 'wb-bach-dang' };
const WATERBUS_STOPS: StopSpec[] = DOCKS.filter((d) => !d.rental).map((d) => ({ id: WB_IDS[d.x] ?? `wb-${d.x}`, name: d.name, mode: 'waterbus', wait: d.ring, berth: { x: d.x, z: BERTH_Z } }));
/** Đò ngang: alongside the west face of the An Hòa pier, across to a landing on the Thủ Thiêm bank (P1). */
const FERRY_STOPS: StopSpec[] = [
  { id: 'do-an-hoa', name: 'BẾN ĐÒ AN HÒA', mode: 'ferry', wait: { x: -80, z: -149.5 }, berth: { x: -83.2, z: -145.5 } },
  { id: 'do-thu-thiem', name: 'BẾN ĐÒ THỦ THIÊM', mode: 'ferry', wait: { x: -80, z: -197.5 }, berth: { x: -83.2, z: -197 }, planned: true },
];
export const STOP_SPECS: StopSpec[] = [...BUS_STOPS, ...WATERBUS_STOPS, ...FERRY_STOPS];

/** Rush hours 06:30-09:00 and 16:30-19:00; no bus runs from 23:00 to 05:00. */
const busHours = (early: number, rush: number, day: number, evening: number): HeadwayBand[] => [
  { from: 5, to: 6.5, every: early }, { from: 6.5, to: 9, every: rush }, { from: 9, to: 16.5, every: day },
  { from: 16.5, to: 19, every: rush }, { from: 19, to: 23, every: evening },
];
const BUS = { mode: 'bus' as const, cruise: 8.5, accel: 1, decel: 1.3, dwell: 10, layover: 20, turn: 2, fare: 7, capacity: 60, length: 12, hw: 1.25, door: 4.8 };
/** The four shelters in loop order; each line starts (and lays over) at a different one. */
const AN_HOA = ['ben-do', 'cong-an', 'truong-hoc', 'benh-vien'];
/**
 * The river bus course, heading east at both berths: from Bạch Đằng on to a U-turn, west along the outer
 * lane, a U-turn into An Hòa, then east along the inner lane and in to Bạch Đằng again.
 */
function waterbusCourse(east = -166, west = -172) {
  const [a, b] = WATERBUS_STOPS.map((s) => s.berth!.x).sort((p, q) => p - q), r = (BERTH_Z - west) / 2, cz = (BERTH_Z + west) / 2, pts: number[] = [];
  const arc = (cx: number, from: number, to: number) => { for (let k = 0; k <= 8; k++) { const t = from + ((to - from) * k) / 8; pts.push(cx + r * Math.sin(t), cz + r * Math.cos(t)); } };
  pts.push(b, BERTH_Z);
  arc(b + 14, 0, Math.PI);
  arc(a - 14, Math.PI, 2 * Math.PI);
  // Long, eased S-curves off and onto the berths: a 22 m hull's stern stays out of the outer run while it swings across.
  pts.push(a, BERTH_Z, a + 8, BERTH_Z, a + 22, BERTH_Z + (east - BERTH_Z) * 0.15, a + 36, east + (BERTH_Z - east) * 0.15, a + 50, east);
  pts.push(b - 48, east, b - 34, east + (BERTH_Z - east) * 0.15, b - 18, BERTH_Z + (east - BERTH_Z) * 0.15, b, BERTH_Z);
  return pts;
}
/** A polyline (x,z pairs) shifted d metres to the right of its direction of travel, corners mitred. */
function offsetLine(pts: number[], d: number) {
  const out: number[] = [], n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const ux = pts[i * 2] - pts[a * 2], uz = pts[i * 2 + 1] - pts[a * 2 + 1], vx = pts[b * 2] - pts[i * 2], vz = pts[b * 2 + 1] - pts[i * 2 + 1];
    const lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1, nx = -(uz / lu + vz / lv), nz = ux / lu + vx / lv, ln = Math.hypot(nx, nz) || 1;
    const cos = Math.max(0.5, (nx / ln) * (i ? -uz / lu : -vz / lv) + (nz / ln) * (i ? ux / lu : vx / lv));
    out.push(pts[i * 2] + (nx / ln) * (d / cos), pts[i * 2 + 1] + (nz / ln) * (d / cos));
  }
  return out;
}
/**
 * The ferry leaves the west face of the An Hòa pier, rounds the stern of a river bus berthed at the pier end,
 * crosses, and comes back on a track 3 m to its right.
 */
function ferryCourse() {
  const [a, b] = FERRY_STOPS.map((s) => s.berth!);
  const out = [a.x, a.z, a.x, -149.4, a.x - 2.4, -150.9, -95, -150.9, -97.5, -153.5, -97.5, -162, b.x - 3.8, b.z + 8, b.x, b.z];
  const back: number[] = [];
  for (let i = out.length - 2; i >= 0; i -= 2) back.push(out[i], out[i + 1]);
  return [...out, ...offsetLine(back, 3), a.x, a.z];
}

export const LINE_SPECS: LineSpec[] = [
  { ...BUS, id: '03', name: 'VÒNG AN HÒA', stops: AN_HOA, headways: busHours(110, 70, 100, 120) },
  // From the school: out along Hoa Sữa and up Tôn Đức Thắng, back along the river with a stop at Bến Bạch Đằng.
  { ...BUS, id: '08', name: 'AN HÒA – BẠCH ĐẰNG', stops: ['truong-hoc', 'benh-vien', 'bach-dang', 'ben-do', 'cong-an'], via: { 1: [{ x: 327, z: -81 }] }, headways: busHours(130, 90, 130, 150), offset: 25 },
  // From the hospital: up Nguyễn Huệ to the river and Bến Bạch Đằng, then through the middle of An Hòa (Đường An Hòa, Đường Trung Tâm).
  { ...BUS, id: '15', name: 'BẠCH ĐẰNG – AN HÒA', stops: ['benh-vien', 'bach-dang', 'ben-do', 'cong-an', 'truong-hoc'], via: { 0: [{ x: 219, z: -81 }], 3: [{ x: -27, z: 3 }] }, headways: busHours(120, 80, 110, 130), offset: 50 },
  {
    id: 'W1', name: 'TÀU BUÝT SÔNG BẠCH ĐẰNG – AN HÒA', mode: 'waterbus', stops: ['wb-bach-dang', 'wb-an-hoa'], course: waterbusCourse(),
    cruise: 6, accel: 0.4, decel: 0.5, dwell: 25, layover: 30, turn: 2, fare: 15, capacity: 75, length: 22, hw: 2.5, door: 0,
    headways: [{ from: 6, to: 9, every: 110 }, { from: 9, to: 16, every: 140 }, { from: 16, to: 19, every: 110 }, { from: 19, to: 21.5, every: 140 }],
  },
  {
    id: 'DN', name: 'ĐÒ NGANG AN HÒA – THỦ THIÊM', mode: 'ferry', stops: FERRY_STOPS.map((s) => s.id), course: ferryCourse(), planned: true,
    cruise: 2.5, accel: 0.5, decel: 0.6, dwell: 15, layover: 15, turn: 1.5, fare: 5, capacity: 12, length: 6, hw: 0.75, door: 0,
    headways: [{ from: 5, to: 21, every: 60 }],
  },
];

// ---- Geometry ---------------------------------------------------------------------------------------------

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
function makePath(pts: number[]): Path {
  const cum = [0];
  for (let k = 2; k < pts.length; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
/** Where a closed path is at arc length s (wrapped), with its unit heading. */
export function pathPoint(p: Path, s: number) {
  s = ((s % p.len) + p.len) % p.len;
  let lo = 0, hi = p.cum.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (p.cum[mid] <= s) lo = mid; else hi = mid - 1; }
  const k = lo * 2, dx = p.pts[k + 2] - p.pts[k], dz = p.pts[k + 3] - p.pts[k + 1], l = p.cum[lo + 1] - p.cum[lo] || 1, t = (s - p.cum[lo]) / l;
  return { x: p.pts[k] + dx * t, z: p.pts[k + 1] + dz * t, hx: dx / l, hz: dz / l };
}
/** Arc length of the point of a path nearest (x, z), and how far away it is. */
export function pathProject(p: Path, x: number, z: number) {
  let best = Infinity, at = 0;
  for (let k = 0; k + 3 < p.pts.length; k += 2) {
    const ax = p.pts[k], az = p.pts[k + 1], dx = p.pts[k + 2] - ax, dz = p.pts[k + 3] - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best - 1e-9) { best = d; at = p.cum[k / 2] + t * Math.sqrt(l2); }
  }
  return { s: at, d: best };
}
/** Total turning (radians) of a path between arc lengths s0 and s1. */
function turning(p: Path, s0: number, s1: number) {
  let sum = 0;
  for (let i = 1; i + 1 < p.cum.length; i++) {
    if (p.cum[i] <= s0 + 1e-6 || p.cum[i] > s1 + 1e-6) continue;
    const k = i * 2, a = Math.atan2(p.pts[k + 1] - p.pts[k - 1], p.pts[k] - p.pts[k - 2]), b = Math.atan2(p.pts[k + 3] - p.pts[k + 1], p.pts[k + 2] - p.pts[k]);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    sum += d;
  }
  return sum;
}

// ---- Building lines ---------------------------------------------------------------------------------------

/** A bus stop on the road its bench faces: the edge, the direction with the stop on its right, the docked centre. */
/** Most a bus pulls over from its lane to a stop's curb, unless a bus bay waits there (a boulevard's curb is far out). */
const PULL_IN = 2.6;
function busStop(graph: RoadGraph, spec: StopSpec, line: Pick<LineSpec, 'door' | 'hw'>, issues: string[], bay?: (edge: number, s: number, dir: 1 | -1) => boolean): TransitStop | null {
  const fx = Math.sin(spec.yaw ?? 0), fz = Math.cos(spec.yaw ?? 0);
  // The road the bench faces runs across its line of sight.
  const across = (e: RoadEdge) => { const h = graph.project(e, spec.wait.x, spec.wait.z); return !e.closed && Math.abs(h.hx * fx + h.hz * fz) < 0.3; };
  const hit = graph.nearestEdge(spec.wait.x + fx * 3, spec.wait.z + fz * 3, 12, across);
  if (!hit) { issues.push(`stop ${spec.id}: no road in front of the shelter`); return null; }
  const e = hit.edge, seat = graph.project(e, spec.wait.x, spec.wait.z), dir: 1 | -1 = seat.off > 0 ? 1 : -1;
  if (!e.traffic || !graph.laneFor(e, dir, 'car')) issues.push(`stop ${spec.id}: ${e.name} (edge ${e.id}) carries no traffic ${dir > 0 ? 'a→b' : 'b→a'}`);
  const s = seat.s - dir * line.door, p = graph.pointAt(e, s), hx = p.hx * dir, hz = p.hz * dir;
  // At the curb (a bus bay's middle), or as near it as a pull-in from the curb-side car lane goes.
  const lanes = (dir > 0 ? e.fwd : e.back).filter((l) => l.use !== 'moto'), lane = lanes.length ? Math.max(...lanes.map((l) => l.off)) : 0;
  // A shelter near the junction ahead pulls in less, so the bus is back in its lane before it turns there.
  const ahead = (dir > 0 ? e.len - s : s) - graph.nodes[dir > 0 ? e.b : e.a].radius, room = spec.fit ? Math.max(0.35, Math.min(1, (ahead - 6) / 22)) : 1;
  const curb = e.half - line.hw - 0.75, lat = bay?.(e.id, s, dir) ? curb : Math.min(curb, lane + PULL_IN * room);
  if (s < 0 || s > e.len) issues.push(`stop ${spec.id}: the docked bus would stand past the end of edge ${e.id}`);
  return { ...spec, x: p.x - hz * lat, z: p.z + hx * lat, hx, hz, edge: e.id, dir, s, lat };
}

type Piece = { edge: RoadEdge; dir: 1 | -1; s0: number; s1: number; stop: number };
/** A point on the road graph driven one way: edge, arc from its node a, direction (+1 a→b). */
export type Anchor = { edge: number; s: number; dir: 1 | -1 };
/** Seconds the router adds for a turn at a node (as roads.ts route): right, left. A bus never turns back. */
const TURN_RIGHT = 1, TURN_LEFT = 4;
/**
 * The quickest way for a bus from one anchor to another: leaving the first and reaching the second in their own
 * directions, only on roads that carry traffic and are not `avoid`ed, never turning back at a node (Dijkstra over
 * edges driven one way, with turn delays). On the same edge, straight along it when the second lies ahead.
 */
export function routeDirected(graph: RoadGraph, from: Anchor, to: Anchor, avoid: (e: RoadEdge) => boolean = () => false): { edges: number[]; dirs: (1 | -1)[] } | null {
  const E = graph.edges, ahead = (to.s - from.s) * from.dir;
  if (from.edge === to.edge && from.dir === to.dir && ahead >= 0) return { edges: [from.edge], dirs: [from.dir] };
  const S = E.length * 2, cost = new Float64Array(S).fill(Infinity), parent = new Int32Array(S).fill(-1), done = new Uint8Array(S);
  const key = (e: number, d: number) => e * 2 + (d > 0 ? 0 : 1);
  const fe = E[from.edge], start = key(from.edge, from.dir);
  cost[start] = (from.dir > 0 ? fe.len - from.s : from.s) / fe.speed;
  const heap: number[] = [start];
  const pop = () => { let bi = 0; for (let i = 1; i < heap.length; i++) if (cost[heap[i]] < cost[heap[bi]]) bi = i; const k = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop(); return k; };
  const goal = key(to.edge, to.dir);
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal && k !== start) break;
    const e = E[k >> 1], d = k & 1 ? -1 : 1, node = graph.nodes[d > 0 ? e.b : e.a];
    const inArm = node.arms.find((a) => a.edge === e.id && a.end === (d > 0 ? 1 : 0))!;
    const hx = -inArm.hx, hz = -inArm.hz;
    for (const arm of node.arms) {
      if (arm === inArm) continue;
      const e2 = E[arm.edge], d2: 1 | -1 = arm.end === 0 ? 1 : -1;
      if (!e2.traffic || e2.closed || avoid(e2) || !(d2 > 0 ? e2.fwd : e2.back).some((l) => l.use !== 'moto')) continue;
      const dot = hx * arm.hx + hz * arm.hz;
      if (dot < -0.95) continue;
      const turn = dot > 0.7 ? 0 : hx * arm.hz - hz * arm.hx > 0 ? TURN_RIGHT : TURN_LEFT;
      const k2 = key(arm.edge, d2), g = cost[k] + turn + (k2 === goal ? (d2 > 0 ? to.s : e2.len - to.s) : e2.len) / e2.speed;
      if (g < cost[k2] && !done[k2]) { cost[k2] = g; parent[k2] = k; heap.push(k2); }
    }
  }
  if (!done[goal] || parent[goal] < 0) return null;
  const chain: number[] = [];
  for (let k = goal; k >= 0; k = parent[k]) { chain.push(k); if (k === start) break; }
  if (chain[chain.length - 1] !== start) return null;
  chain.reverse();
  return { edges: chain.map((k) => k >> 1), dirs: chain.map((k) => (k & 1 ? -1 : 1) as 1 | -1) };
}
/**
 * A bus line: road A* (roads.ts route) from stop to stop through its via points, checked to leave and reach
 * every stop in its serving direction with no U-turn, then drawn in the car lane, pulled in to the curb at
 * each stop and rounded through the junctions.
 */
function busLine(graph: RoadGraph, spec: LineSpec, stops: Map<string, TransitStop>, issues: string[], avoid: (e: RoadEdge) => boolean = () => false): TransitLine | null {
  const fail = (m: string) => { issues.push(`line ${spec.id}: ${m}`); return null; };
  type Way = { x: number; z: number; stop: number; hx?: number; hz?: number };
  const ways: Way[] = [];
  for (const [k, id] of spec.stops.entries()) {
    const st = stops.get(id);
    if (!st) return fail(`unknown stop ${id}`);
    const p = graph.pointAt(graph.edges[st.edge], st.s);
    ways.push({ x: p.x, z: p.z, stop: k });
    for (const v of spec.via?.[k] ?? []) ways.push({ x: v.x, z: v.z, stop: -1, hx: v.hx, hz: v.hz });
  }
  /** Where a way is on the road graph and which way it is driven (a stop's serving direction, a via point's heading). */
  const anchor = (w: Way): Anchor | null => {
    if (w.stop >= 0) { const st = stops.get(spec.stops[w.stop])!; return { edge: st.edge, s: st.s, dir: st.dir }; }
    const hit = graph.nearestEdge(w.x, w.z, 12, (e) => e.traffic && !e.closed && !avoid(e));
    if (!hit) return null;
    // Headed: driven that way; else on the lane side of its road (right of the way it is driven).
    if (w.hx === undefined || w.hz === undefined) return Math.abs(hit.off) < 0.5 ? null : { edge: hit.edge.id, s: hit.s, dir: hit.off > 0 ? 1 : -1 };
    return { edge: hit.edge.id, s: hit.s, dir: hit.hx * w.hx + hit.hz * w.hz >= 0 ? 1 : -1 };
  };
  const pieces: Piece[] = [];
  for (let w = 0; w < ways.length; w++) {
    const a = ways[w], b = ways[(w + 1) % ways.length];
    let r: { edges: number[]; dirs: (1 | -1)[] } | null = null;
    if (spec.directed) {
      const from = anchor(a), to = anchor(b);
      if (!from || !to) return fail(`waypoint ${w} has no road and heading`);
      r = routeDirected(graph, from, to, avoid);
    } else r = graph.route(a.x, a.z, b.x, b.z, { use: 'car', snap: 12 });
    if (!r) return fail(`no road route from waypoint ${w}`);
    const first = graph.edges[r.edges[0]], last = graph.edges[r.edges[r.edges.length - 1]];
    const sa = graph.project(first, a.x, a.z).s, sb = graph.project(last, b.x, b.z).s;
    if (a.stop >= 0) {
      const st = stops.get(spec.stops[a.stop])!;
      if (first.id !== st.edge || r.dirs[0] !== st.dir) return fail(`leaves ${st.id} the wrong way`);
    }
    if (b.stop >= 0) {
      const st = stops.get(spec.stops[b.stop])!;
      if (last.id !== st.edge || r.dirs[r.dirs.length - 1] !== st.dir) return fail(`reaches ${st.id} the wrong way`);
    }
    r.edges.forEach((id, i) => {
      const e = graph.edges[id], dir = r!.dirs[i], s0 = i === 0 ? sa : dir > 0 ? 0 : e.len, s1 = i === r!.edges.length - 1 ? sb : dir > 0 ? e.len : 0;
      if (Math.abs(s1 - s0) < 1e-6) return;
      const prev = pieces[pieces.length - 1];
      // A via point splits nothing: the same edge carries on in the same direction.
      if (prev && i === 0 && a.stop < 0 && prev.edge === e && prev.dir === dir && Math.abs(prev.s1 - s0) < 1e-6) { prev.s1 = s1; return; }
      pieces.push({ edge: e, dir, s0, s1, stop: i === 0 ? a.stop : -1 });
    });
  }
  // A sharp bend inside an edge (Võ Văn Kiệt round the canal corner) is a corner like a node's: split the piece there.
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i], e = p.edge, lo = Math.min(p.s0, p.s1), hi = Math.max(p.s0, p.s1);
    for (let k = 1; k + 1 < e.cum.length; k++) {
      const at = p.dir > 0 ? e.cum[k] : e.cum[e.cum.length - 1 - k];
      if (at <= lo + 3 || at >= hi - 3) continue;
      const j = p.dir > 0 ? k : e.cum.length - 1 - k;
      const ax = e.pts[j * 2] - e.pts[j * 2 - 2], az = e.pts[j * 2 + 1] - e.pts[j * 2 - 1], bx = e.pts[j * 2 + 2] - e.pts[j * 2], bz = e.pts[j * 2 + 3] - e.pts[j * 2 + 1];
      if ((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1) > Math.cos(0.35)) continue;
      pieces.splice(i + 1, 0, { edge: e, dir: p.dir, s0: at, s1: p.s1, stop: -1 });
      p.s1 = at;
      break;
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i], q = pieces[(i + 1) % pieces.length];
    if (!p.edge.traffic || p.edge.closed || !graph.laneFor(p.edge, p.dir, 'car')) return fail(`uses ${p.edge.name} (edge ${p.edge.id}), which carries no traffic`);
    const end = p.dir > 0 ? p.edge.b : p.edge.a, start = q.dir > 0 ? q.edge.a : q.edge.b;
    const joined = p.edge === q.edge && p.dir === q.dir && Math.abs(p.s1 - q.s0) < 1e-6;
    if (!joined && (end !== start || Math.abs(p.s1 - (p.dir > 0 ? p.edge.len : 0)) > 1e-6 || Math.abs(q.s0 - (q.dir > 0 ? 0 : q.edge.len)) > 1e-6)) return fail(`breaks between edges ${p.edge.id} and ${q.edge.id}`);
    if (p.edge === q.edge && p.dir !== q.dir) return fail(`U-turns on edge ${p.edge.id}`);
  }
  // Car-lane polyline, pulled to the berth lateral at stops; junction corners trimmed and rounded.
  const heading = (p: Piece, s: number) => { const c = graph.pointAt(p.edge, s); return { x: c.x, z: c.z, hx: c.hx * p.dir, hz: c.hz * p.dir }; };
  /** The heading leaving a piece's end and entering the next piece, across its corner (a node or a bend inside an edge). */
  const headings = (i: number) => {
    const p = pieces[i], q = pieces[(i + 1) % pieces.length], e = p.edge;
    if (e !== q.edge) return [heading(p, p.s1), heading(q, q.s0)];
    // The two segments either side of the bend.
    const step = 0.5 * p.dir;
    return [heading(p, p.s1 - step), heading(q, q.s0 + step)];
  };
  const bend = (i: number) => { const p = pieces[i], q = pieces[(i + 1) % pieces.length]; return p.edge === q.edge && p.dir === q.dir && Math.abs(p.s1 - q.s0) < 1e-6; };
  const turnAt = (i: number) => {
    const p = pieces[i], q = pieces[(i + 1) % pieces.length];
    if (p.edge === q.edge && !bend(i)) return false;
    const [a, b] = headings(i);
    return a.hx * b.hx + a.hz * b.hz < 0.95;
  };
  /** How far before and after a node a turn's corner reaches: the junction's radius, less for a shallow turn (a 12 m radius). */
  const trimAt = (i: number, room: number) => {
    const p = pieces[i], [a, b] = headings(i);
    const turn = Math.acos(Math.max(-1, Math.min(1, a.hx * b.hx + a.hz * b.hz)));
    return Math.min(bend(i) ? Infinity : graph.nodes[p.dir > 0 ? p.edge.b : p.edge.a].radius, room, 12 * Math.tan(turn / 2));
  };
  type Sample = { x: number; z: number; hx: number; hz: number; arc: number; lane: number; half: number; stop: number };
  const samples: (Sample | null)[] = [];
  const stopArc = new Array<number>(spec.stops.length).fill(0), stopWide = new Array<number>(spec.stops.length).fill(2);
  /** Where each turn's corner starts and ends along the line (a pull into the curb is done with before the corner). */
  const corners: [number, number][] = [];
  let arc = 0;
  pieces.forEach((p, i) => {
    const len = Math.abs(p.s1 - p.s0), node = graph.nodes[p.dir > 0 ? p.edge.b : p.edge.a], startNode = graph.nodes[p.dir > 0 ? p.edge.a : p.edge.b];
    const before = (i + pieces.length - 1) % pieces.length;
    const trimIn = turnAt(before) ? Math.min(bend(before) ? Infinity : startNode.radius, len * 0.45, trimAt(before, Infinity)) : 0;
    const trimOut = turnAt(i) ? Math.min(bend(i) ? Infinity : node.radius, len * 0.45, trimAt(i, Infinity)) : 0;
    // The curb-side car lane (a boulevard's outer one).
    const lane = Math.max(...(p.dir > 0 ? p.edge.fwd : p.edge.back).filter((l) => l.use !== 'moto').map((l) => l.off)), from = trimIn, to = len - trimOut, n = Math.max(1, Math.ceil((to - from) / 4));
    if (p.stop >= 0) { stopArc[p.stop] = arc; stopWide[p.stop] = (stops.get(spec.stops[p.stop])!.lat ?? p.edge.half - spec.hw - 0.75) - lane; }
    if (trimIn > 0) samples.push(null);
    if (trimOut > 0) corners.push([arc + len - trimOut, arc + len + trimOut]);

    for (let j = 0; j <= n; j++) {
      if (j === n && trimOut === 0 && i !== pieces.length - 1) continue;
      const u = from + ((to - from) * j) / n, c = heading(p, p.s0 + p.dir * u);
      samples.push({ ...c, arc: arc + u, lane, half: p.edge.half, stop: j === 0 && trimIn === 0 ? p.stop : -1 });
    }
    arc += len;
  });
  const cycle = arc;
  // Into the curb at each stop and out again, over a run as long as the move across asks (29 m in, 20 m out for today's
  // 2 m), but done with between the corners either side of it.
  const ramps = stopArc.map((sa, k) => {
    const rin = Math.max(29, 12 * stopWide[k]), rout = Math.max(20, 8 * stopWide[k]);
    if (!spec.directed) return [rin, rout];
    const ahead = (a: number) => (((a - sa) % cycle) + cycle) % cycle, behind = (a: number) => (((sa - a) % cycle) + cycle) % cycle;
    const next = Math.min(...corners.map(([c0]) => ahead(c0)), cycle), prev = Math.min(...corners.map(([, c1]) => behind(c1)), cycle);
    return [Math.max(29, Math.min(rin, prev - 8)), Math.max(20, Math.min(rout, next - 8))];
  });
  /** How far right of its lane a sample is pulled: towards each stop's berth, the most of any. */
  const pull = (a: number) => {
    let m = 0;
    stopArc.forEach((sa, k) => {
      const d = ((a - sa + cycle * 1.5) % cycle) - cycle / 2, [rin, rout] = ramps[k];
      m = Math.max(m, stopWide[k] * (d < 0 ? smooth((d + 6 + rin) / rin) : 1 - smooth((d - 6) / rout)));
    });
    return m;
  };
  const pts: number[] = [], stopIndex: number[] = [];
  const out = (s: Sample) => { const lat = s.lane + pull(s.arc); return { x: s.x - s.hz * lat, z: s.z + s.hx * lat, hx: s.hx, hz: s.hz }; };
  let prev: { x: number; z: number; hx: number; hz: number } | null = null, gap = false;
  for (const s of samples) {
    if (!s) { gap = true; continue; }
    const p = out(s);
    if (gap && prev) {
      // Quadratic corner from the end of one lane line to the start of the next, its control where they meet.
      const c = prev.hx * p.hz - prev.hz * p.hx, t = Math.abs(c) < 1e-6 ? NaN : ((p.x - prev.x) * p.hz - (p.z - prev.z) * p.hx) / c;
      const cx = Number.isNaN(t) ? (prev.x + p.x) / 2 : prev.x + prev.hx * t, cz = Number.isNaN(t) ? (prev.z + p.z) / 2 : prev.z + prev.hz * t;
      for (let k = 1; k < 6; k++) { const u = k / 6, v = 1 - u; pts.push(v * v * prev.x + 2 * u * v * cx + u * u * p.x, v * v * prev.z + 2 * u * v * cz + u * u * p.z); }
    }
    gap = false;
    if (s.stop >= 0) stopIndex[s.stop] = pts.length / 2;
    pts.push(p.x, p.z);
    prev = p;
  }
  // The first piece leaves the terminus, so the path is closed: its last point is its first.
  if (Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]) > 1e-6) pts.push(pts[0], pts[1]);
  const path = makePath(pts);
  const at = spec.stops.map((_, k) => path.cum[stopIndex[k]]);
  const plan: TransitLine['plan'] = [];
  for (const p of pieces) { const l = plan[plan.length - 1]; if (!l || l.edge !== p.edge.id || l.dir !== p.dir) plan.push({ edge: p.edge.id, dir: p.dir }); }
  if (plan.length > 1 && plan[0].edge === plan[plan.length - 1].edge && plan[0].dir === plan[plan.length - 1].dir) plan.pop();
  return timed(spec, path, spec.stops.map((id, k) => ({ stop: stops.get(id)!, s: at[k] })), plan);
}

/** A boat line along its course: stops where the course passes their berths. */
function boatLine(spec: LineSpec, stops: Map<string, TransitStop>, issues: string[]): TransitLine | null {
  const path = makePath(spec.course!);
  const calls: { stop: TransitStop; s: number }[] = [];
  for (const id of spec.stops) {
    const st = stops.get(id);
    if (!st) { issues.push(`line ${spec.id}: unknown stop ${id}`); return null; }
    const hit = pathProject(path, st.x, st.z);
    if (hit.d > 0.5) { issues.push(`line ${spec.id}: the course misses ${id} by ${hit.d.toFixed(1)} m`); return null; }
    const p = pathPoint(path, hit.s);
    Object.assign(st, { hx: p.hx, hz: p.hz });
    calls.push({ stop: st, s: hit.s < path.len - 1e-6 ? hit.s : 0 });
  }
  return timed(spec, path, calls, []);
}

/** Seconds to cover d metres from standstill to standstill (trapezoid, or triangle when too short to reach v). */
function trapTime(d: number, v: number, a: number, b: number) {
  if (d >= (v * v) / (2 * a) + (v * v) / (2 * b)) return v / a + v / b + (d - (v * v) / (2 * a) - (v * v) / (2 * b)) / v;
  const peak = Math.sqrt((2 * d * a * b) / (a + b));
  return peak / a + peak / b;
}
/** Distance covered after t seconds of a standstill-to-standstill run of d metres. */
function trapDistance(t: number, d: number, v: number, a: number, b: number) {
  const total = trapTime(d, v, a, b), peak = Math.min(v, Math.sqrt((2 * d * a * b) / (a + b)));
  if (t <= 0) return 0;
  if (t >= total) return d;
  if (t < peak / a) return 0.5 * a * t * t;
  const left = total - t;
  if (left < peak / b) return d - 0.5 * b * left * left;
  return (peak * peak) / (2 * a) + peak * (t - peak / a);
}
/** Run times: each leg from stop to stop is a trapezoid run plus its turning time; the stop dwell follows. */
function timed(spec: LineSpec, path: Path, calls: { stop: TransitStop; s: number }[], plan: TransitLine['plan']): TransitLine {
  const segments: Segment[] = [], visits: Visit[] = [];
  let clock = 0;
  calls.forEach((c, k) => {
    const next = k + 1 < calls.length ? calls[k + 1].s : path.len, d = next - c.s;
    const trap = trapTime(d, spec.cruise, spec.accel, spec.decel), time = trap + spec.turn * turning(path, c.s, next);
    if (k > 0) clock += spec.dwell;
    visits.push({ stop: c.stop, s: c.s, arrive: k === 0 ? 0 : clock - spec.dwell, depart: clock });
    segments.push({ s: c.s, d, time, trap });
    clock += time;
  });
  return { id: spec.id, name: spec.name, mode: spec.mode, spec, path, visits, segments, run: clock, plan };
}

/**
 * Builds the network's stops and lines on a road graph. Planned lines and stops (not on today's map) are left
 * out unless `planned`. `issues` lists anything that keeps a stop or line from working: a stop on a road that
 * carries no traffic, a route leaving a stop the wrong way, a line breaking between edges.
 */
export function buildNetwork(graph: RoadGraph = LEGACY_ROADS, specs: LineSpec[] = LINE_SPECS, stopSpecs: StopSpec[] = STOP_SPECS, opts: { planned?: boolean; avoid?: (e: RoadEdge) => boolean; bay?: (edge: number, s: number, dir: 1 | -1) => boolean } = {}): TransitNetwork {
  const issues: string[] = [], stops = new Map<string, TransitStop>();
  const lineOf = (id: string) => specs.find((l) => l.stops.includes(id));
  for (const spec of stopSpecs) {
    if (spec.planned && !opts.planned) continue;
    const line = lineOf(spec.id);
    if (spec.mode === 'bus') {
      const st = busStop(graph, spec, line ?? BUS, issues, opts.bay);
      if (st) stops.set(spec.id, st);
    } else stops.set(spec.id, { ...spec, x: spec.berth!.x, z: spec.berth!.z, hx: 1, hz: 0, edge: -1, dir: 1, s: 0 });
  }
  const lines: TransitLine[] = [];
  for (const spec of specs) {
    if (spec.planned && !opts.planned) continue;
    const line = spec.mode === 'bus' ? busLine(graph, spec, stops, issues, opts.avoid) : boatLine(spec, stops, issues);
    if (line) lines.push(line);
  }
  // A built stop that only planned lines (left out) call at waits for them: the ferry's An Hòa landing.
  for (const id of [...stops.keys()]) {
    const callers = specs.filter((l) => l.stops.includes(id));
    if (callers.length && callers.every((l) => l.planned && !opts.planned)) stops.delete(id);
  }
  return { lines, stops, issues };
}

// ---- The live map's lines ---------------------------------------------------------------------------------

/** A heading for a via point (unit vector of travel). */
const EAST = { hx: 1, hz: 0 }, WEST = { hx: -1, hz: 0 }, NORTH = { hx: 0, hz: -1 }, SOUTH = { hx: 0, hz: 1 };
type Via = Pt & { hx?: number; hz?: number };
/**
 * How each line runs on with the wired slices: its name once it starts from the 23/9 terminus, and headed via points
 * after a stop (an index into the line's stops of today; -1: after the terminus), each needing a slice wired; `replace`
 * drops today's via points after that stop. Line 15 runs from the terminus up Hàm Nghi; 08 comes back along Trần Hưng
 * Đạo and, with Quận 4, runs on along Hoa Sữa into Khánh Hội, round it on Nguyễn Tất Thành and up Võ Văn Kiệt to the
 * river instead of up Tôn Đức Thắng; 03 runs out along Điện Biên Phủ past Hàng Xanh and back along Xô Viết Nghệ Tĩnh (Bình Thạnh), and returns to
 * the terminus along Lê Lai. Every line comes into the terminus up Đề Thám from the south (the last via point, a
 * straight run in to its bays). Via points after the same stop are passed in list order.
 */
/** After the line's last stop of today (back to its first: the terminus), and up Đề Thám from the south into its bays. */
const LAST = 99, INTO_TERMINUS: Via = { x: 324, z: 405, ...NORTH };
const EXTENSIONS: Record<string, { name: string; via: { after: number; slice: string; at: Via; replace?: boolean }[] }> = {
  '03': { name: 'CÔNG VIÊN 23/9 – VÒNG AN HÒA', via: [
    { after: 1, slice: 'binh-thanh', at: { x: -520, z: 0, ...WEST } }, { after: 1, slice: 'binh-thanh', at: { x: -500, z: 57.3, hx: 0.979, hz: -0.203 } },
    { after: 3, slice: 'quan-1-south', at: { x: 300, z: 300, ...EAST } },
    { after: LAST, slice: 'quan-1-south', at: INTO_TERMINUS },
  ] },
  '08': { name: 'CÔNG VIÊN 23/9 – BẠCH ĐẰNG – AN HÒA', via: [
    { after: 1, slice: 'quan-4', replace: true, at: { x: 200, z: -54, ...EAST } }, { after: 1, slice: 'quan-4', at: { x: 620, z: 125, ...SOUTH } },
    { after: 1, slice: 'quan-4', at: { x: 420, z: 300, ...WEST } },
    { after: 1, slice: 'quan-4', at: { x: 372, z: 225, ...NORTH } },
    { after: 4, slice: 'quan-1-south', at: { x: 250, z: 385, ...EAST } },
    { after: LAST, slice: 'quan-1-south', at: INTO_TERMINUS },
  ] },
  '15': { name: 'CÔNG VIÊN 23/9 – HÀM NGHI – AN HÒA', via: [{ after: -1, slice: 'quan-1-south', at: { x: 270, z: 230, ...NORTH } }, { after: LAST, slice: 'quan-1-south', at: INTO_TERMINUS }] },
};
/** A bus shelter of a wired slice (or the terminus) as a stop. */
const shelterSpec = (s: { id: string; name: string; x: number; z: number; yaw: number }): StopSpec => ({ id: s.id, name: s.name, mode: 'bus', wait: { x: s.x, z: s.z }, yaw: s.yaw, fit: true });

/**
 * Transit on the live map (map/world-types.ts). Until Quận 1 south and its 23/9 terminus are wired: today's lines and
 * stops, exactly (on the live roads). Then the bus lines run from the terminus and on as EXTENSIONS says, routed with a
 * fixed heading at every stop and via point and never along a street with closing hours, and each calls at the
 * slices' shelters it passes on the side they serve (40 m or more from its other calls). The river bus is today's.
 */
export function worldNetwork(world: WorldRoads = worldRoads()): TransitNetwork {
  // Until the terminus is built (WIRING-PLAN step 17) the lines run as today, on the live roads.
  if (!world.terminus || !world.slices.includes('quan-1-south')) return buildNetwork(world.roads);
  const graph = world.roads, wired = new Set(world.slices);
  // Never along a street with closing hours, nor into one too narrow for a 12 m bus to turn into (a 9 m R2).
  const avoid = (e: RoadEdge) => !!world.edges[e.id]?.closed || (e.cls !== 'R1' && e.half < 5);
  // A bus bay (the terminus's) on the stop's side round where the bus stands.
  const bay = (edge: number, s: number, dir: 1 | -1) => (world.edges[edge]?.bays ?? []).some((b) => b.kind === 'bus' && b.side === dir && s > b.s0 - 2 && s < b.s1 + 2);
  const terminus = world.terminus;
  const stopSpecs: StopSpec[] = [...STOP_SPECS, ...(terminus ? [shelterSpec(terminus)] : [])];
  const specs: LineSpec[] = LINE_SPECS.map((l) => {
    const ext = EXTENSIONS[l.id];
    if (l.mode !== 'bus' || !ext) return l;
    const head = terminus && terminus.lines.includes(l.id) ? [terminus.id] : [];
    const via: Record<number, Via[]> = {};
    // Today's via points (their stop indices move on by the terminus), then the slices' in order.
    for (const [k, list] of Object.entries(l.via ?? {})) via[Number(k) + head.length] = list.slice();
    for (const v of ext.via) {
      if (!wired.has(v.slice) || (v.after < 0 && !head.length)) continue;
      const k = v.after === LAST ? head.length + l.stops.length - 1 : v.after + head.length;
      if (v.replace) via[k] = (via[k] ?? []).filter((p) => p.hx !== undefined);
      (via[k] ??= []).push(v.at);
    }
    return { ...l, name: head.length ? ext.name : l.name, stops: [...head, ...l.stops], via, directed: true };
  });
  // First the lines through their main stops; then each calls at the shelters it passes.
  const first = buildNetwork(graph, specs, stopSpecs, { avoid, bay });
  const shelters = world.shelters.map(shelterSpec), probe = buildNetwork(graph, [], shelters, { avoid, bay });
  const extra: StopSpec[] = [];
  const out = specs.map((spec) => {
    const line = first.lines.find((l) => l.id === spec.id);
    if (!line || spec.mode !== 'bus') return spec;
    // Every way in path order: the stops (their visits' arcs) and the via points (where the path passes them).
    type Way = { s: number; stop?: string; via?: Via };
    const ways: Way[] = [];
    spec.stops.forEach((id, k) => {
      ways.push({ s: line.visits[k].s, stop: id });
      for (const v of spec.via?.[k] ?? []) ways.push({ s: pathProject(line.path, v.x, v.z).s, via: v });
    });
    const calls = ways.filter((w) => w.stop).map((w) => w.s);
    const served = new Set(line.plan.map((p) => `${p.edge}:${p.dir}`));
    for (const sh of shelters) {
      const st = probe.stops.get(sh.id);
      if (!st || !served.has(`${st.edge}:${st.dir}`)) continue;
      const p = graph.pointAt(graph.edges[st.edge], st.s), hit = pathProject(line.path, p.x, p.z);
      if (hit.d > graph.edges[st.edge].half || calls.some((c) => Math.min(Math.abs(c - hit.s), line.path.len - Math.abs(c - hit.s)) < 40)) continue;
      ways.push({ s: hit.s, stop: sh.id });
      calls.push(hit.s);
      if (!extra.includes(sh)) extra.push(sh);
    }
    // In path order from the first stop (the start of the path).
    const s0 = ways[0].s, len = line.path.len, at = (w: Way) => (((w.s - s0) % len) + len) % len;
    const ordered = [ways[0], ...ways.slice(1).sort((a, b) => at(a) - at(b))];
    const stopsOut: string[] = [], viaOut: Record<number, Via[]> = {};
    for (const w of ordered) {
      if (w.stop) stopsOut.push(w.stop);
      else (viaOut[stopsOut.length - 1] ??= []).push(w.via!);
    }
    return { ...spec, stops: stopsOut, via: viaOut };
  });
  const net = buildNetwork(graph, out, [...stopSpecs, ...extra], { avoid, bay });
  // A line that no longer builds with its shelters runs as it did without them.
  for (const spec of specs) {
    if (net.lines.some((l) => l.id === spec.id)) continue;
    const fallback = first.lines.find((l) => l.id === spec.id);
    if (fallback) {
      net.lines.push(fallback);
      for (const v of fallback.visits) if (!net.stops.has(v.stop.id)) net.stops.set(v.stop.id, v.stop);
    }
  }
  for (const i of first.issues) if (!net.issues.includes(i)) net.issues.push(i);
  return net;
}

// ---- Timetables, positions and riders ---------------------------------------------------------------------

export type Trip = { line: string; day: number; index: number; vehicle: number; depart: number; end: number };
export type VehicleState = {
  key: string; line: string; vehicle: number; trip: Trip | null;
  phase: 'run' | 'dwell' | 'layover';
  /** Arc length on the line's path, position, heading, speed (m/s). */
  s: number; x: number; z: number; hx: number; hz: number; speed: number;
  /** The visit it is docked at (dwell, layover: 0) or heading for (run). */
  visit: number;
  /** People aboard: the background crowd plus registered riders. */
  load: number;
};
export type Arrival = { line: string; name: string; vehicle: string; trip: Trip; stop: string; visit: number; at: number; leaves: number; eta: number };
export type RiderId = string | number;
export type RiderOptions = { lines?: string[]; to?: string; pass?: boolean };
export type Rider = {
  id: RiderId; state: 'waiting' | 'aboard'; stop: string | null; vehicle: string | null; line: string | null;
  lines: string[] | null; to: string | null; ring: boolean; pass: boolean; since: number; seq: number; refused: string;
};
export type TransitEvent = {
  type: 'arrive' | 'depart' | 'board' | 'alight' | 'full';
  t: number; line: string; vehicle: string; stop: string; trip: Trip;
  rider?: RiderId; fare?: number;
  /** Why someone got off: reached their stop, rang the bell, or the vehicle went out of service. */
  reason?: 'dest' | 'bell' | 'end';
};
export type BoardResult = { ok: true; line: string; vehicle: string; stop: string; fare: number } | { ok: false; reason: 'unknown' | 'aboard' | 'not-docked' | 'full' };

/** Small integer hash for the background crowd (deterministic across runs and platforms). */
function hash(...xs: number[]) {
  let h = 0x811c9dc5;
  for (const x of xs) { h ^= x | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; }
  return (h >>> 0) / 4294967296;
}
/** How full the background crowd makes a vehicle by hour: peaks at the rush hours. */
export function demand(hour: number) {
  const peak = (c: number, w: number) => Math.exp(-(((hour - c) / w) ** 2));
  return 0.12 + 0.62 * peak(7.6, 1.1) + 0.66 * peak(17.6, 1.2) + 0.2 * peak(12, 2.5);
}

/**
 * The live network: timetables by day, vehicles on rails, arrivals at stops, and the riders' ledger.
 * Call update(t) as the clock moves (every frame, or once after a time skip); it returns what happened.
 */
export function createTransit(network: TransitNetwork = buildNetwork(), opts: { secondsPerHour?: number; seed?: number } = {}) {
  const sph = opts.secondsPerHour ?? SECONDS_PER_HOUR, seed = opts.seed ?? 1;
  const lines = new Map(network.lines.map((l) => [l.id, l]));
  const order = new Map(network.lines.map((l, i) => [l.id, i]));
  /** One service day of a line: its trips in departure order, the same trips by vehicle (in order), and its fleet size. */
  type Day = { trips: Trip[]; fleet: number; byVehicle: Trip[][] };
  /** Days built so far, per line by day number (a few kept per line). */
  const dayCache = new Map<string, Map<number, Day>>();
  /** Departures for one service day in whole minutes after midnight, and the vehicle each runs on. */
  const base = new Map<string, { m: number; vehicle: number }[]>();
  for (const line of network.lines) {
    const bands = [...line.spec.headways].sort((p, q) => p.from - q.from), out: { m: number; vehicle: number }[] = [];
    const runM = (line.run / sph) * 60, restM = (line.spec.layover / sph) * 60, endM = Math.round(Math.max(...bands.map((b) => b.to)) * 60), free: number[] = [];
    let m = Math.round(bands[0].from * 60) + (line.spec.offset ?? 0);
    while (m < endM) {
      const band = bands.find((b) => m >= Math.round(b.from * 60) && m < Math.round(b.to * 60));
      if (!band) { const next = bands.find((b) => Math.round(b.from * 60) > m); if (!next) break; m = Math.round(next.from * 60); continue; }
      if (m + runM > endM + 1e-9) break;
      // First in, first out: the vehicle that has waited longest at the terminus takes the trip.
      let v = -1;
      free.forEach((f, i) => { if (f <= m + 1e-9 && (v < 0 || f < free[v])) v = i; });
      if (v < 0) { v = free.length; free.push(0); }
      free[v] = m + runM + restM;
      out.push({ m, vehicle: v });
      m += band.every;
    }
    base.set(line.id, out);
  }
  function day(lineId: string, d: number): Day {
    let days = dayCache.get(lineId);
    if (!days) dayCache.set(lineId, (days = new Map()));
    let got = days.get(d);
    if (!got) {
      const line = lines.get(lineId)!, runH = line.run / sph, list = base.get(lineId)!;
      const trips = list.map((t, index) => ({ line: lineId, day: d, index, vehicle: t.vehicle, depart: d * 24 + t.m / 60, end: d * 24 + t.m / 60 + runH }));
      const fleet = Math.max(0, ...list.map((t) => t.vehicle + 1)), byVehicle: Trip[][] = Array.from({ length: fleet }, () => []);
      for (const trip of trips) byVehicle[trip.vehicle].push(trip);
      got = { trips, fleet, byVehicle };
      days.set(d, got);
      if (days.size > 8) days.delete(days.keys().next().value!);
    }
    return got;
  }
  const keyOf = (lineId: string, vehicle: number) => `${lineId}-${vehicle + 1}`;
  /** A vehicle waits at the terminus at most this long (game hours); with a longer gap it goes to the depot. */
  const maxWait = (line: TransitLine) => (3 * line.spec.layover) / sph;
  /** The vehicle's next trip, when it stays at the terminus for it (same day, within the longest wait). */
  const continues = (trip: Trip) => {
    const next = day(trip.line, trip.day).byVehicle[trip.vehicle]?.find((o) => o.depart >= trip.end - 1e-9);
    return next && next.depart - trip.end <= maxWait(lines.get(trip.line)!) + 1e-9 ? next : null;
  };
  const visitTime = (trip: Trip, line: TransitLine, k: number, which: 'arrive' | 'depart') => trip.depart + line.visits[k][which] / sph;
  /** The background crowd aboard after the turnover at visit k. */
  function crowd(line: TransitLine, trip: Trip, k: number) {
    const hour = (trip.depart + line.visits[k].depart / sph) % 24, noise = 0.55 + 0.8 * hash(seed, order.get(line.id)!, trip.day, trip.index, k);
    return Math.min(line.spec.capacity, Math.floor(line.spec.capacity * demand(hour) * noise));
  }
  /** Where a trip is `t` game hours in: running between visits, or dwelling at one. */
  function onTrip(line: TransitLine, trip: Trip, t: number) {
    const e = (t - trip.depart) * sph, v = line.visits;
    let k = v.length - 1;
    while (k > 0 && v[k].arrive > e) k--;
    if (k > 0 && e < v[k].depart) return { phase: 'dwell' as const, s: v[k].s, speed: 0, visit: k };
    const seg = line.segments[k], tau = Math.max(0, e - v[k].depart), scale = seg.trap / seg.time, sp = line.spec;
    const along = trapDistance(tau * scale, seg.d, sp.cruise, sp.accel, sp.decel), ahead = trapDistance(tau * scale + 0.05, seg.d, sp.cruise, sp.accel, sp.decel);
    return { phase: 'run' as const, s: seg.s + along, speed: ((ahead - along) / 0.05) * scale, visit: (k + 1) % v.length };
  }
  function tripsAround(lineId: string, t: number) {
    const d = Math.floor(t / 24);
    return [...day(lineId, d - 1).trips, ...day(lineId, d).trips, ...day(lineId, d + 1).trips];
  }

  // ---- Riders ----
  const riders = new Map<RiderId, Rider>();
  const aboard = new Map<string, Set<RiderId>>();
  let seq = 0, last = NaN;
  const seat = (key: string) => { let s = aboard.get(key); if (!s) { s = new Set(); aboard.set(key, s); } return s; };
  const serves = (line: TransitLine, stopId: string | null) => !stopId || line.visits.some((v) => v.stop.id === stopId);
  const accepts = (r: Rider, line: TransitLine, here: string) => (!r.lines || r.lines.includes(line.id)) && serves(line, r.to) && r.to !== here;
  /** The vehicle's state at t, or null when it is out of service (at the depot). */
  function vehicleAt(lineId: string, vehicle: number, t: number): VehicleState | null {
    const line = lines.get(lineId)!, d0 = Math.floor(t / 24);
    const key = keyOf(lineId, vehicle), riding = aboard.get(key)?.size ?? 0;
    const mk = (trip: Trip | null, phase: VehicleState['phase'], s: number, speed: number, visit: number, crowdVisit: number): VehicleState => {
      const p = pathPoint(line.path, s);
      return { key, line: lineId, vehicle, trip, phase, s: ((s % line.path.len) + line.path.len) % line.path.len, x: p.x, z: p.z, hx: p.hx, hz: p.hz, speed, visit, load: (trip ? crowd(line, trip, crowdVisit) : 0) + riding };
    };
    // Its trips of yesterday, today and tomorrow in order (each day's own list: nothing is copied or filtered per frame).
    let last: Trip | null = null;
    for (let d = d0 - 1; d <= d0 + 1; d++) {
      const trips = day(lineId, d).byVehicle[vehicle];
      if (!trips) continue;
      for (let i = 0; i < trips.length; i++) {
        const trip = trips[i];
        if (t >= trip.depart && t < trip.end) {
          const at = onTrip(line, trip, t);
          return mk(trip, at.phase, at.s, at.speed, at.visit, at.phase === 'dwell' ? at.visit : (at.visit + line.visits.length - 1) % line.visits.length);
        }
        // Waiting at the terminus for this trip: since the last one ended, or come from the depot a layover before it.
        // (continues(prev) === trip, without its search: the vehicle's trips are in departure order, so the first of them
        // to leave after prev ends is this one exactly when this one leaves after prev ends.)
        const prev = last && last.day === trip.day ? last : null;
        const before = prev && trip.depart >= prev.end - 1e-9 && trip.depart - prev.end <= maxWait(line) + 1e-9 ? prev.end : trip.depart - line.spec.layover / sph;
        if (t >= before && t < trip.depart) return mk(trip, 'layover', 0, 0, 0, 0);
        last = trip;
      }
    }
    return null;
  }
  /** Distance along a line's path going forward from arc length a to b. */
  const ahead = (line: TransitLine, a: number, b: number) => (((b - a) % line.path.len) + line.path.len) % line.path.len;
  /**
   * Every vehicle in service at t, all lines together. Vehicles standing at a stop (dwelling, or waiting at a
   * terminus) queue back from its berth, the one leaving first in front; they move up behind one pulling away,
   * and one coming in holds at the back of the queue. Lines that share a stop share its queue.
   */
  function fleetAt(t: number): VehicleState[] {
    const out: VehicleState[] = [];
    for (const line of network.lines) {
      const d = Math.floor(t / 24), fleet = Math.max(day(line.id, d - 1).fleet, day(line.id, d).fleet);
      for (let v = 0; v < fleet; v++) { const st = vehicleAt(line.id, v, t); if (st) out.push(st); }
    }
    const lineOf = (st: VehicleState) => lines.get(st.line)!, gapOf = (st: VehicleState) => lineOf(st).spec.length + 2;
    const leaves = (st: VehicleState) => (st.phase === 'layover' ? st.trip!.depart : visitTime(st.trip!, lineOf(st), st.visit, 'depart'));
    const place = (st: VehicleState, at: number) => {
      const l = lineOf(st), p = pathPoint(l.path, at);
      Object.assign(st, { s: ((at % l.path.len) + l.path.len) % l.path.len, x: p.x, z: p.z, hx: p.hx, hz: p.hz });
    };
    // Stops with someone standing at them, or just pulling away from them.
    const docked = new Map<string, VehicleState[]>();
    for (const st of out) {
      const l = lineOf(st), k = st.phase === 'run' ? (st.visit + l.visits.length - 1) % l.visits.length : st.visit, id = l.visits[k].stop.id;
      if (!docked.has(id)) docked.set(id, []);
      if (st.phase !== 'run') docked.get(id)!.push(st);
    }
    for (const [id, list] of docked) {
      list.sort((p, q) => leaves(p) - leaves(q) || order.get(p.line)! - order.get(q.line)! || p.vehicle - q.vehicle);
      let front = 0;
      for (const r of out) {
        const l = lineOf(r), prev = l.visits[(r.visit + l.visits.length - 1) % l.visits.length];
        if (r.phase === 'run' && prev.stop.id === id) front = Math.min(front, ahead(l, prev.s, r.s) - gapOf(r));
      }
      for (const st of list) { if (front < 0) place(st, lineOf(st).visits[st.visit].s + front); front = Math.min(front, 0) - gapOf(st); }
      for (const r of out) {
        const l = lineOf(r), berth = l.visits[r.visit].s;
        if (r.phase === 'run' && l.visits[r.visit].stop.id === id && ahead(l, r.s, berth) < -front) { place(r, berth + front); r.speed = 0; }
      }
    }
    // No passing where lines share a road or merge: of two vehicles heading much the same way closer than their
    // lengths, the one behind waits (level with each other, the one that left its last stop later).
    const left = (st: VehicleState) => {
      const l = lineOf(st), n = l.visits.length;
      return st.phase === 'run' ? visitTime(st.trip!, l, (st.visit + n - 1) % n, 'depart') : Infinity;
    };
    // (Each vehicle's line looked up once, and pairs apart along either axis passed over before any square root.)
    const lens = out.map((st) => lineOf(st).spec.length), modes = out.map((st) => lineOf(st).mode);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          if (modes[i] !== modes[j]) continue;
          const a = out[i], b = out[j], need = (lens[i] + lens[j]) / 2 + 2;
          const dx = b.x - a.x, dz = b.z - a.z;
          if (dx >= need || dx <= -need || dz >= need || dz <= -need) continue;
          const d = Math.hypot(dx, dz);
          if (d >= need - 1e-6 || a.hx * b.hx + a.hz * b.hz < 0.2) continue;
          const along = dx * (a.hx + b.hx) + dz * (a.hz + b.hz), behind = Math.abs(along) > 1 ? (along > 0 ? a : b) : left(a) > left(b) ? a : b;
          place(behind, behind.s - (need - d));
          behind.speed = 0;
        }
      }
    }
    return out;
  }
  const vehicles = (lineId: string, t: number) => fleetAt(t).filter((st) => st.line === lineId);
  /** Docking events (arrive at a stop, leave a stop) of every line in (t0, t1], in time order. */
  function stopEvents(t0: number, t1: number) {
    const out: { t: number; line: TransitLine; trip: Trip; visit: number; kind: 'arrive' | 'depart' | 'end' }[] = [];
    for (const line of network.lines) {
      const trips: Trip[] = [];
      for (let d = Math.floor(t0 / 24) - 1; d <= Math.floor(t1 / 24); d++) trips.push(...day(line.id, d).trips);
      for (const trip of trips) {
        if (trip.end <= t0 || trip.depart > t1) continue;
        line.visits.forEach((v, k) => {
          const arrive = visitTime(trip, line, k, 'arrive'), leave = visitTime(trip, line, k, 'depart');
          if (k > 0 && arrive > t0 && arrive <= t1) out.push({ t: arrive, line, trip, visit: k, kind: 'arrive' });
          if (leave > t0 && leave <= t1) out.push({ t: leave, line, trip, visit: k, kind: 'depart' });
        });
        if (trip.end > t0 && trip.end <= t1) out.push({ t: trip.end, line, trip, visit: 0, kind: 'end' });
      }
    }
    const rank = { end: 0, arrive: 1, depart: 2 };
    return out.sort((p, q) => p.t - q.t || order.get(p.line.id)! - order.get(q.line.id)! || p.trip.vehicle - q.trip.vehicle || rank[p.kind] - rank[q.kind]);
  }
  function boardWaiting(ev: { t: number; line: TransitLine; trip: Trip; visit: number }, events: TransitEvent[]) {
    const line = ev.line, stop = line.visits[ev.visit].stop.id, key = keyOf(line.id, ev.trip.vehicle), tag = `${key}:${ev.trip.day}:${ev.trip.index}:${ev.visit}`;
    const queue = [...riders.values()].filter((r) => r.state === 'waiting' && r.stop === stop && accepts(r, line, stop)).sort((p, q) => p.since - q.since || p.seq - q.seq);
    for (const r of queue) {
      const ref = { t: ev.t, line: line.id, vehicle: key, stop, trip: ev.trip, rider: r.id };
      if (crowd(line, ev.trip, ev.visit) + seat(key).size >= line.spec.capacity) {
        if (r.refused !== tag) { r.refused = tag; events.push({ type: 'full', ...ref }); }
        continue;
      }
      Object.assign(r, { state: 'aboard', stop: null, vehicle: key, line: line.id, refused: '' });
      seat(key).add(r.id);
      events.push({ type: 'board', ...ref, fare: r.pass ? 0 : line.spec.fare });
    }
  }
  function alightAt(ev: { t: number; line: TransitLine; trip: Trip; visit: number }, events: TransitEvent[], end: boolean) {
    const line = ev.line, stop = line.visits[ev.visit].stop.id, key = keyOf(line.id, ev.trip.vehicle), on = aboard.get(key);
    if (!on) return;
    const depot = end && !continues(ev.trip);
    for (const id of [...on]) {
      const r = riders.get(id)!;
      const reason = r.to === stop ? 'dest' : r.ring ? 'bell' : depot ? 'end' : null;
      if (!reason) continue;
      on.delete(id);
      events.push({ type: 'alight', t: ev.t, line: line.id, vehicle: key, stop, trip: ev.trip, rider: id, reason });
      // Bound further on: change here to the line's next departure.
      if (reason === 'end' && r.to) Object.assign(r, { state: 'waiting', stop, vehicle: null, line: null, lines: [line.id], ring: false, since: ev.t, seq: seq++, refused: '' });
      else riders.delete(id);
    }
  }

  return {
    network,
    lines: network.lines,
    stops: network.stops,
    secondsPerHour: sph,
    line: (id: string) => lines.get(id) ?? null,
    /** The trips of a line on a day (departure from the terminus, end back there, game hours). */
    trips: (lineId: string, d: number) => day(lineId, d).trips,
    /** Vehicles a line needs on a day. */
    fleet: (lineId: string, d = 0) => day(lineId, d).fleet,
    /**
     * Minutes between departures at an hour of the day, from the timetable as built: the band's headway while a
     * departure is still to come in it, else null (out of service, or the band's last trip has left: a line too long
     * for the evening band runs none in it, and a shelter sign must not promise one).
     */
    headway(lineId: string, hour: number) {
      const h = ((hour % 24) + 24) % 24, b = lines.get(lineId)?.spec.headways.find((band) => h >= band.from && h < band.to);
      return b && base.get(lineId)!.some((t) => t.m / 60 >= h - 1e-9 && t.m / 60 < b.to) ? b.every : null;
    },
    /** Lines calling at a stop (the shelter sign: "TUYẾN 03 • 08 • 15"). */
    linesAt: (stopId: string) => network.lines.filter((l) => l.visits.some((v) => v.stop.id === stopId)).map((l) => l.id),
    /** The next `n` vehicles to dock at a stop after t, soonest first; `eta` in real seconds. */
    arrivals(stopId: string, t: number, n = 3): Arrival[] {
      const out: Arrival[] = [];
      for (const line of network.lines) {
        line.visits.forEach((v, k) => {
          if (v.stop.id !== stopId) return;
          for (const trip of [...tripsAround(line.id, t), ...day(line.id, Math.floor(t / 24) + 2).trips]) {
            const at = k === 0 ? trip.depart : visitTime(trip, line, k, 'arrive'), leaves = visitTime(trip, line, k, 'depart');
            if (leaves > t) out.push({ line: line.id, name: line.name, vehicle: keyOf(line.id, trip.vehicle), trip, stop: stopId, visit: k, at, leaves, eta: Math.max(0, (at - t) * sph) });
          }
        });
      }
      return out.sort((p, q) => p.leaves - q.leaves || order.get(p.line)! - order.get(q.line)!).slice(0, n);
    },
    vehicles,
    vehicle: (key: string, t: number) => { const i = key.lastIndexOf('-'); return lines.has(key.slice(0, i)) ? vehicleAt(key.slice(0, i), +key.slice(i + 1) - 1, t) : null; },
    /** Every vehicle in service at t, all lines. */
    fleetAt,
    /** Vehicles standing at a stop with their doors open at t, the one at the berth first. */
    docked(stopId: string, t: number) {
      return fleetAt(t).filter((v) => v.phase !== 'run' && lines.get(v.line)!.visits[v.visit].stop.id === stopId).sort((p, q) => ahead(lines.get(q.line)!, q.s, lines.get(q.line)!.visits[q.visit].s) - ahead(lines.get(p.line)!, p.s, lines.get(p.line)!.visits[p.visit].s));
    },
    /** Seconds on board from one stop to the next call at another (the same trip, or on through the terminus after the shortest layover). */
    rideTime(lineId: string, from: string, to: string) {
      const line = lines.get(lineId);
      if (!line) return null;
      const a = line.visits.findIndex((v) => v.stop.id === from), b = line.visits.findIndex((v) => v.stop.id === to);
      if (a < 0 || b < 0 || a === b) return null;
      return b > a ? line.visits[b].arrive - line.visits[a].depart : line.run - line.visits[a].depart + line.spec.layover + line.visits[b].arrive;
    },

    // ---- Riders: the player and NPCs ----
    /** Someone starts waiting at a stop, for any line (or `lines`) that goes to `to` (or anywhere). */
    wait(id: RiderId, stopId: string, o: RiderOptions = {}, t = last) {
      if (!network.stops.has(stopId)) return false;
      const r = riders.get(id);
      if (r?.state === 'aboard') return false;
      riders.set(id, { id, state: 'waiting', stop: stopId, vehicle: null, line: null, lines: o.lines ?? null, to: o.to ?? null, ring: false, pass: !!o.pass, since: Number.isNaN(t) ? 0 : t, seq: seq++, refused: '' });
      return true;
    },
    /** Stops waiting (walked away). */
    cancel(id: RiderId) { const r = riders.get(id); if (r?.state !== 'waiting') return false; riders.delete(id); return true; },
    /** Gets on a vehicle that stands at a stop with its doors open (the player's E). The caller charges `fare`. */
    board(id: RiderId, key: string, t: number, o: RiderOptions = {}): BoardResult {
      const i = key.lastIndexOf('-'), lineId = key.slice(0, i), line = lines.get(lineId);
      if (!line) return { ok: false, reason: 'unknown' };
      if (riders.get(id)?.state === 'aboard') return { ok: false, reason: 'aboard' };
      const st = vehicleAt(lineId, +key.slice(i + 1) - 1, t);
      if (!st || st.phase === 'run' || !st.trip) return { ok: false, reason: 'not-docked' };
      if (crowd(line, st.trip, st.visit) + seat(key).size >= line.spec.capacity) return { ok: false, reason: 'full' };
      const stop = line.visits[st.visit].stop.id;
      riders.set(id, { id, state: 'aboard', stop: null, vehicle: key, line: lineId, lines: o.lines ?? null, to: o.to ?? null, ring: false, pass: !!o.pass, since: t, seq: seq++, refused: '' });
      seat(key).add(id);
      return { ok: true, line: lineId, vehicle: key, stop, fare: o.pass ? 0 : line.spec.fare };
    },
    /** Gets off while the vehicle stands at a stop; returns that stop, or null while it moves. */
    alight(id: RiderId, t: number) {
      const r = riders.get(id);
      if (r?.state !== 'aboard') return null;
      const st = vehicleAt(r.line!, +r.vehicle!.slice(r.vehicle!.lastIndexOf('-') + 1) - 1, t);
      if (st && st.phase === 'run') return null;
      const stop = st ? lines.get(r.line!)!.visits[st.visit].stop.id : lines.get(r.line!)!.visits[0].stop.id;
      aboard.get(r.vehicle!)?.delete(id);
      riders.delete(id);
      return stop;
    },
    /** Rings the bell ("xin xuống"): off at the next stop. */
    ring(id: RiderId) { const r = riders.get(id); if (r?.state !== 'aboard') return false; r.ring = true; return true; },
    /**
     * Sets where an aboard rider gets off; returns when they get there (game hours), for fast travel. Past the
     * terminus that is on the same vehicle if it waits there for its next trip, else on the line's next departure.
     */
    rideTo(id: RiderId, stopId: string, t: number) {
      const r = riders.get(id);
      if (r?.state !== 'aboard') return null;
      const line = lines.get(r.line!)!, k = line.visits.findIndex((v) => v.stop.id === stopId), vehicle = +r.vehicle!.slice(r.vehicle!.lastIndexOf('-') + 1) - 1;
      if (k < 0) return null;
      const nextOut = (after: number) => tripsAround(line.id, after).filter((tr) => tr.depart >= after - 1e-9).sort((p, q) => p.depart - q.depart)[0] ?? null;
      let trip: Trip | null = tripsAround(line.id, t).filter((tr) => tr.vehicle === vehicle && tr.end > t).sort((p, q) => p.depart - q.depart)[0] ?? null;
      for (let hop = 0; trip && hop < 3; hop++, trip = continues(trip) ?? nextOut(trip.end)) {
        const at = k === 0 ? trip.end : visitTime(trip, line, k, 'arrive');
        if (at > t) { r.to = stopId; return at; }
      }
      return null;
    },
    rider: (id: RiderId) => riders.get(id) ?? null,
    riders: () => [...riders.values()],
    /** Runs the ledger to t: riders get off at their stops, waiting riders get on, full vehicles refuse. */
    update(t: number): TransitEvent[] {
      const events: TransitEvent[] = [];
      if (Number.isNaN(last) || t < last) { last = t; return events; }
      for (const ev of stopEvents(last, t)) {
        const key = keyOf(ev.line.id, ev.trip.vehicle), stop = ev.line.visits[ev.visit].stop.id;
        if (ev.kind !== 'depart') {
          events.push({ type: 'arrive', t: ev.t, line: ev.line.id, vehicle: key, stop, trip: ev.trip });
          alightAt(ev, events, ev.kind === 'end');
          // Back at the terminus the doors open for the next trip's riders when it leaves.
          if (ev.kind === 'arrive') boardWaiting(ev, events);
        } else {
          boardWaiting(ev, events);
          events.push({ type: 'depart', t: ev.t, line: ev.line.id, vehicle: key, stop, trip: ev.trip });
        }
      }
      last = t;
      return events;
    },
  };
}
export type Transit = ReturnType<typeof createTransit>;

// ---- Driving a bus line (pure helpers for buses.ts) -------------------------------------------------------

/**
 * The bus as buses.ts drives it: the rear axle runs on the line's path (so the rear wheels never slip and the
 * body swings wide at the front through a turn, like a real 12 m bus), the centre REAR metres ahead of it and the
 * nose NOSE metres ahead of the centre. A bus docked at visit s has its centre at s, so its rear axle at s - REAR.
 */
export const BUS_GEOMETRY = { REAR: 2.6, WHEELBASE: 6, NOSE: 6, HW: 1.25 } as const;
/** Where a bus whose rear axle is at arc s (moved `lat` metres to the right of the path) stands: centre, heading, nose. */
export function busPose(p: Path, s: number, lat = 0) {
  const r = pathPoint(p, s), rx = r.x - r.hz * lat, rz = r.z + r.hx * lat;
  return { x: rx + r.hx * BUS_GEOMETRY.REAR, z: rz + r.hz * BUS_GEOMETRY.REAR, hx: r.hx, hz: r.hz, yaw: Math.atan2(r.hx, r.hz), rx, rz };
}
/** Curvature (1/m, + turning right) of a path at s, from the heading change over `d` metres either side. */
export function curvature(p: Path, s: number, d = 2) {
  const a = pathPoint(p, s - d), b = pathPoint(p, s + d);
  // x east and z south: a right turn (clockwise seen from above, east to south) has a positive cross of the headings.
  return Math.atan2(a.hx * b.hz - a.hz * b.hx, a.hx * b.hx + a.hz * b.hz) / (2 * d);
}
/** Highest speed (m/s) for the rear axle's path from s to s + ahead, holding sideways acceleration to `lat` m/s². */
export function curveSpeed(p: Path, s: number, ahead: number, lat = 1.6) {
  let v = Infinity;
  for (let d = 0; d <= ahead; d += 2) {
    const k = Math.abs(curvature(p, s + d));
    if (k > 1e-4) v = Math.min(v, Math.sqrt(lat / k) + d * 0.25);
  }
  return v;
}
/** A traffic light on a bus line: the arc where the nose meets its stop line, the node and the signal group facing it. */
export type SignalPoint = { s: number; node: number; group: number };
/**
 * The stop lines a bus line crosses heading into a signalled junction, in path order: the arc of `path` (the line's
 * own, or a bus's rear-axle path) at which `probe(s)` (the path point, or the bus's nose) is level with the line.
 */
export function signalPoints(line: TransitLine, graph: RoadGraph = LEGACY_ROADS, path: Path = line.path, probe = (s: number) => pathPoint(path, s)): SignalPoint[] {
  const out: SignalPoint[] = [];
  // The probe along the whole path once (every 0.25 m), not once per signalled approach (a city line has dozens: that
  // was seconds of the game's load); each approach then looks only at the samples within reach of its node, the only
  // place the probe can be level with its stop line (a sample there and the one before it are always looked at).
  let samples: Float64Array | null = null, count = 0;
  for (const step of line.plan) {
    const e = graph.edges[step.edge], node = step.dir > 0 ? e.b : e.a;
    const a = graph.approaches.find((q) => q.node === node && q.edge === e.id && q.dir === step.dir);
    if (!a) continue;
    if (!samples) {
      const list: number[] = [];
      for (let s = 0; s <= path.len; s += 0.25) { const p = probe(s); list.push(p.x, p.z, p.hx, p.hz); }
      samples = Float64Array.from(list);
      count = list.length / 4;
    }
    // Along the path, where the distance to the node centre (measured along the road) drops through the stop line.
    const n = graph.nodes[node], reach = Math.max(0, a.stop) + e.half + 30, reach2 = reach * reach;
    let prev = Infinity, s = 0;
    for (let k = 0; k < count; k++, s += 0.25) {
      const px = samples[k * 4], pz = samples[k * 4 + 1];
      if ((n.x - px) * (n.x - px) + (n.z - pz) * (n.z - pz) > reach2) { prev = Infinity; continue; }
      const h = graph.project(e, px, pz);
      const along = (n.x - px) * a.hx + (n.z - pz) * a.hz, aligned = samples[k * 4 + 2] * a.hx + samples[k * 4 + 3] * a.hz > 0.9;
      if (aligned && Math.abs(h.off) < e.half && prev > a.stop && along <= a.stop && along > a.stop - 2) { out.push({ s, node, group: a.group }); break; }
      prev = aligned ? along : Infinity;
    }
  }
  return out.sort((p, q) => p.s - q.s);
}
/**
 * How a 12 m bus drives a line: the path its rear axle follows, built by running the line's lane path with a guide
 * point. Through right turns the rear axle is the guide (the nose swings wide, over the oncoming lanes of the
 * street it turns into, and the rear wheels clear the corner kerb); through left turns the front axle is (the rear
 * cuts in towards the middle of the junction and the nose stays off the far kerb), easing between the two on the
 * straights. Then, on that rear path: the arc to dock at each visit (centre at the stop), the stop lines the nose
 * must wait at, and a table from the line's own arc lengths (the timetable's) to rear-path arcs.
 */
export function busCourse(line: TransitLine, graph: RoadGraph = LEGACY_ROADS) {
  const p = line.path, W = BUS_GEOMETRY.WHEELBASE, n = Math.ceil(p.len);
  const left = new Uint8Array(n + 1);
  for (let i = 0; i <= n; i++) left[i] = curvature(p, i) < -0.03 ? 1 : 0;
  // The guide's distance ahead of the rear axle per metre of the line: full through a left corner, easing in over
  // the 14 m before it and out over the 8 m after it.
  const guide = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    let g = 0;
    for (let d = 0; d <= 18; d++) if (left[(i + d) % (n + 1)]) { g = Math.max(g, 1 - smooth((d - 4) / 14)); break; }
    for (let d = 1; d <= 10; d++) if (left[(i - d + n + 1) % (n + 1)]) { g = Math.max(g, 1 - smooth((d - 2) / 8)); break; }
    guide[i] = g * W;
  }
  const gOf = (s: number) => { const i = Math.floor(s), f = s - i; return guide[i % (n + 1)] * (1 - f) + guide[(i + 1) % (n + 1)] * f; };
  // The rear axle trails the guide at the guide's distance; one lap settles it, the second is recorded.
  const start = pathPoint(p, 0), pts: number[] = [];
  let rx = start.x, rz = start.z;
  for (let s = 0.1; s <= 2 * p.len + 1e-6; s += 0.1) {
    const q = pathPoint(p, s), g = gOf(s % p.len);
    if (g < 0.01) { rx = q.x; rz = q.z; } else {
      const dx = q.x - rx, dz = q.z - rz, l = Math.hypot(dx, dz) || 1;
      rx = q.x - (dx / l) * g; rz = q.z - (dz / l) * g;
    }
    if (s < p.len) continue;
    if (!pts.length || Math.hypot(rx - pts[pts.length - 2], rz - pts[pts.length - 1]) >= 0.5) pts.push(rx, rz);
  }
  if (Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]) > 1e-6) pts.push(pts[0], pts[1]);
  const path = makePath(pts);
  const nose = (s: number) => { const b = busPose(path, s); return { x: b.x + b.hx * BUS_GEOMETRY.NOSE, z: b.z + b.hz * BUS_GEOMETRY.NOSE, hx: b.hx, hz: b.hz }; };
  // Line arc -> rear arc, every metre (the centre of a bus at line arc s has its rear axle REAR behind it). Each metre
  // follows the last one's hit along the rear path (a window of segments round it, wider if that misses, the whole
  // path only as a last resort): a line that passes the same street twice (03 and 08 in the districts) never jumps
  // to the other pass, and the table costs milliseconds, not seconds.
  const map = new Float32Array(n + 1), segs = path.pts.length / 2 - 1;
  let near = -1;
  const hit = { best: Infinity, at: 0, k: -1 };
  const scan = (x: number, z: number, from: number, to: number) => {
    hit.best = Infinity; hit.at = 0; hit.k = -1;
    for (let w = from; w <= to; w++) {
      const k = (((near + w) % segs) + segs) % segs, j = k * 2;
      const ax = path.pts[j], az = path.pts[j + 1], dx = path.pts[j + 2] - ax, dz = path.pts[j + 3] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0, d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < hit.best - 1e-9) { hit.best = d; hit.at = path.cum[k] + t * Math.sqrt(l2); hit.k = k; }
    }
  };
  for (let i = 0; i <= n; i++) {
    const c = pathPoint(p, i), x = c.x - c.hx * BUS_GEOMETRY.REAR, z = c.z - c.hz * BUS_GEOMETRY.REAR;
    if (near >= 0) { scan(x, z, -6, 12); if (hit.best > 1) scan(x, z, -40, 80); }
    if (near < 0 || hit.best > 4) {
      const g = pathProject(path, x, z);
      let lo = 0, hi = segs - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (path.cum[m] <= g.s) lo = m; else hi = m - 1; }
      hit.best = g.d; hit.at = g.s; hit.k = lo;
    }
    map[i] = hit.at;
    near = hit.k;
  }
  const rearOf = (s: number) => { const w = ((s % p.len) + p.len) % p.len, i = Math.floor(w), a = map[i], b = map[Math.min(n, i + 1)]; return b >= a ? a + (b - a) * (w - i) : a; };
  // A berth's rear arc: its own projection, unless that lands on the other pass of a doubled street (then the table's).
  const docks = line.visits.map((v) => {
    const c = pathPoint(p, v.s), g = pathProject(path, c.x - c.hx * BUS_GEOMETRY.REAR, c.z - c.hz * BUS_GEOMETRY.REAR).s, t = rearOf(v.s);
    return Math.abs(g - t) > 5 && Math.abs(Math.abs(g - t) - path.len) > 5 ? t : g;
  });
  return {
    path, docks, signals: signalPoints(line, graph, path, nose), guide,
    /** The rear-path arc of a bus whose centre the timetable puts at line arc s. */
    rearOf,
  };
}
export type BusCourse = ReturnType<typeof busCourse>;
/** Forward distance along a closed path from arc a to arc b. */
export const pathAhead = (p: Path, a: number, b: number) => (((b - a) % p.len) + p.len) % p.len;
/** Where a rider waiting for a bus line stands: the shelter (its back panel), from the bench and the way it faces. */
export function shelterOf(spec: StopSpec) {
  const yaw = spec.yaw ?? 0;
  return { x: spec.wait.x - Math.sin(yaw) * 1.15, z: spec.wait.z - Math.cos(yaw) * 1.15, yaw };
}
/** "TUYẾN 03 • 08 • 15": the route numbers a shelter's sign may show (the lines that call there). */
export function shelterSign(network: TransitNetwork, stopId: string) {
  const ids = network.lines.filter((l) => l.mode === 'bus' && l.visits.some((v) => v.stop.id === stopId)).map((l) => l.id);
  return ids.length ? `TUYẾN ${ids.join(' • ')}` : 'TẠM NGƯNG PHỤC VỤ';
}
/** A stop's name for people: "BẾN ĐÒ AN HÒA" reads "Bến Đò An Hòa". */
export function stopTitle(name: string) {
  return name.toLocaleLowerCase('vi').replace(/(^|[\s–-])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('vi'));
}
/**
 * Moored boats the player can use (boats.ts draws them): the đò at the west face of the An Hòa pier, and a fishing
 * sampan anchored off the promenade that is only reached from the water.
 */
export const MOORINGS = [
  { id: 'do-an-hoa', kind: 'ferry' as const, x: -83.2, z: -145.5, yaw: 0, name: 'ĐÒ BẾN AN HÒA' },
  { id: 'ghe-cau', kind: 'fishing' as const, x: 74, z: -150, yaw: -0.3, name: 'GHE CÂU' },
];
/**
 * Everything transit answers with E, as pure data for the interact audit (interact.ts auditEntries): each shelter's
 * timetable and route sign, each waterbus pier's ring, the moored đò and ghe. buses.ts registers the same places.
 */
export const AUDIT_ENTRIES: { id: string; covers: ('transit' | 'boat')[]; x: number; z: number; r: number }[] = [
  ...STOP_SPECS.filter((s) => s.mode === 'bus' && !s.planned).map((s) => ({ id: `transit:shelter:${s.id}`, covers: ['transit' as const], ...xz(shelterOf(s)), r: 3.2 })),
  ...STOP_SPECS.filter((s) => s.mode === 'waterbus' && !s.planned).map((s) => ({ id: `transit:pier:${s.id}`, covers: ['transit' as const], x: s.wait.x, z: s.wait.z, r: 4 })),
  ...MOORINGS.map((m) => ({ id: `transit:boat:${m.id}`, covers: ['boat' as const], x: m.x, z: m.z, r: 3.5 })),
];
function xz(p: Pt) { return { x: p.x, z: p.z }; }
