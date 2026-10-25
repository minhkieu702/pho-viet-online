import { SECONDS_PER_HOUR } from './clock';
import { DOCKS } from './map/consts';
import { LEGACY_ROADS } from './map/roads-legacy';
import type { RoadEdge, RoadGraph } from './map/roads';

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
};
/** Service from `from` to `to` (game hours, [from, to)) with a departure every `every` game minutes. */
export type HeadwayBand = { from: number; to: number; every: number };
export type LineSpec = {
  id: string; name: string; mode: TransitMode;
  /** Stops in service order; the cycle returns to the first, the terminus. */
  stops: string[];
  /** Bus: points the route must pass between stop k and the next (lane side of a road), keyed by k. */
  via?: Record<number, Pt[]>;
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

/** The 4 shelters city.ts builds (busStop()), bench position and facing; named after what stands beside them. */
const BUS_STOPS: StopSpec[] = [
  { id: 'ben-do', name: 'BẾN ĐÒ AN HÒA', mode: 'bus', wait: { x: -76, z: -117.95 }, yaw: 0 },
  { id: 'cong-an', name: 'CÔNG AN PHƯỜNG AN HÒA', mode: 'bus', wait: { x: -117.95, z: -19.5 }, yaw: Math.PI / 2 },
  { id: 'truong-hoc', name: 'TRƯỜNG TIỂU HỌC AN HÒA', mode: 'bus', wait: { x: 38, z: 117.95 }, yaw: Math.PI },
  { id: 'benh-vien', name: 'BỆNH VIỆN AN HÒA', mode: 'bus', wait: { x: 117.95, z: -36 }, yaw: -Math.PI / 2 },
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
const startAt = (k: number) => [...AN_HOA.slice(k), ...AN_HOA.slice(0, k)];
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
  pts.push(a, BERTH_Z, a + 8, BERTH_Z, a + 18, BERTH_Z + (east - BERTH_Z) * 0.15, a + 28, east + (BERTH_Z - east) * 0.15, a + 38, east);
  pts.push(b - 32, east, b - 22, east + (BERTH_Z - east) * 0.15, b - 12, BERTH_Z + (east - BERTH_Z) * 0.15, b, BERTH_Z);
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
  // From the school: out along Hoa Sữa and up Tôn Đức Thắng, back along the river past Bến Bạch Đằng.
  { ...BUS, id: '08', name: 'AN HÒA – TÔN ĐỨC THẮNG', stops: startAt(2), via: { 1: [{ x: 327, z: -81 }] }, headways: busHours(130, 90, 130, 150), offset: 25 },
  // From the hospital: up Nguyễn Huệ to the river, then through the middle of An Hòa (Đường An Hòa, Đường Trung Tâm).
  { ...BUS, id: '15', name: 'AN HÒA – NGUYỄN HUỆ', stops: startAt(3), via: { 0: [{ x: 219, z: -81 }], 2: [{ x: -27, z: 3 }] }, headways: busHours(120, 80, 110, 130), offset: 50 },
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
function busStop(graph: RoadGraph, spec: StopSpec, line: Pick<LineSpec, 'door' | 'hw'>, issues: string[]): TransitStop | null {
  const fx = Math.sin(spec.yaw ?? 0), fz = Math.cos(spec.yaw ?? 0);
  // The road the bench faces runs across its line of sight.
  const across = (e: RoadEdge) => { const h = graph.project(e, spec.wait.x, spec.wait.z); return !e.closed && Math.abs(h.hx * fx + h.hz * fz) < 0.3; };
  const hit = graph.nearestEdge(spec.wait.x + fx * 3, spec.wait.z + fz * 3, 12, across);
  if (!hit) { issues.push(`stop ${spec.id}: no road in front of the shelter`); return null; }
  const e = hit.edge, seat = graph.project(e, spec.wait.x, spec.wait.z), dir: 1 | -1 = seat.off > 0 ? 1 : -1;
  if (!e.traffic || !graph.laneFor(e, dir, 'car')) issues.push(`stop ${spec.id}: ${e.name} (edge ${e.id}) carries no traffic ${dir > 0 ? 'a→b' : 'b→a'}`);
  const s = seat.s - dir * line.door, p = graph.pointAt(e, s), hx = p.hx * dir, hz = p.hz * dir, lat = e.half - line.hw - 0.75;
  if (s < 0 || s > e.len) issues.push(`stop ${spec.id}: the docked bus would stand past the end of edge ${e.id}`);
  return { ...spec, x: p.x - hz * lat, z: p.z + hx * lat, hx, hz, edge: e.id, dir, s };
}

type Piece = { edge: RoadEdge; dir: 1 | -1; s0: number; s1: number; stop: number };
/**
 * A bus line: road A* (roads.ts route) from stop to stop through its via points, checked to leave and reach
 * every stop in its serving direction with no U-turn, then drawn in the car lane, pulled in to the curb at
 * each stop and rounded through the junctions.
 */
function busLine(graph: RoadGraph, spec: LineSpec, stops: Map<string, TransitStop>, issues: string[]): TransitLine | null {
  const fail = (m: string) => { issues.push(`line ${spec.id}: ${m}`); return null; };
  type Way = { x: number; z: number; stop: number };
  const ways: Way[] = [];
  for (const [k, id] of spec.stops.entries()) {
    const st = stops.get(id);
    if (!st) return fail(`unknown stop ${id}`);
    const p = graph.pointAt(graph.edges[st.edge], st.s);
    ways.push({ x: p.x, z: p.z, stop: k });
    for (const v of spec.via?.[k] ?? []) ways.push({ x: v.x, z: v.z, stop: -1 });
  }
  const pieces: Piece[] = [];
  for (let w = 0; w < ways.length; w++) {
    const a = ways[w], b = ways[(w + 1) % ways.length];
    const r = graph.route(a.x, a.z, b.x, b.z, { use: 'car', snap: 12 });
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
      const e = graph.edges[id], dir = r.dirs[i], s0 = i === 0 ? sa : dir > 0 ? 0 : e.len, s1 = i === r.edges.length - 1 ? sb : dir > 0 ? e.len : 0;
      if (Math.abs(s1 - s0) < 1e-6) return;
      const prev = pieces[pieces.length - 1];
      // A via point splits nothing: the same edge carries on in the same direction.
      if (prev && i === 0 && a.stop < 0 && prev.edge === e && prev.dir === dir && Math.abs(prev.s1 - s0) < 1e-6) { prev.s1 = s1; return; }
      pieces.push({ edge: e, dir, s0, s1, stop: i === 0 ? a.stop : -1 });
    });
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
  const turnAt = (i: number) => {
    const p = pieces[i], q = pieces[(i + 1) % pieces.length];
    if (p.edge === q.edge) return false;
    const a = heading(p, p.s1), b = heading(q, q.s0);
    return a.hx * b.hx + a.hz * b.hz < 0.95;
  };
  type Sample = { x: number; z: number; hx: number; hz: number; arc: number; lane: number; half: number; stop: number };
  const samples: (Sample | null)[] = [];
  const stopArc = new Array<number>(spec.stops.length).fill(0);
  let arc = 0;
  pieces.forEach((p, i) => {
    const len = Math.abs(p.s1 - p.s0), node = graph.nodes[p.dir > 0 ? p.edge.b : p.edge.a], startNode = graph.nodes[p.dir > 0 ? p.edge.a : p.edge.b];
    const trimIn = turnAt((i + pieces.length - 1) % pieces.length) ? Math.min(startNode.radius, len * 0.45) : 0, trimOut = turnAt(i) ? Math.min(node.radius, len * 0.45) : 0;
    if (p.stop >= 0) stopArc[p.stop] = arc;
    const lane = graph.laneFor(p.edge, p.dir, 'car')!.off, from = trimIn, to = len - trimOut, n = Math.max(1, Math.ceil((to - from) / 4));
    if (trimIn > 0) samples.push(null);
    for (let j = 0; j <= n; j++) {
      if (j === n && trimOut === 0 && i !== pieces.length - 1) continue;
      const u = from + ((to - from) * j) / n, c = heading(p, p.s0 + p.dir * u);
      samples.push({ ...c, arc: arc + u, lane, half: p.edge.half, stop: j === 0 && trimIn === 0 ? p.stop : -1 });
    }
    arc += len;
  });
  const cycle = arc, berth = (s: Sample) => s.half - spec.hw - 0.75;
  const bump = (a: number) => {
    let m = 0;
    for (const sa of stopArc) {
      const d = ((a - sa + cycle * 1.5) % cycle) - cycle / 2;
      m = Math.max(m, d < 0 ? smooth((d + 35) / 29) : 1 - smooth((d - 6) / 20));
    }
    return m;
  };
  const pts: number[] = [], stopIndex: number[] = [];
  const out = (s: Sample) => { const lat = s.lane + (berth(s) - s.lane) * bump(s.arc); return { x: s.x - s.hz * lat, z: s.z + s.hx * lat, hx: s.hx, hz: s.hz }; };
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
export function buildNetwork(graph: RoadGraph = LEGACY_ROADS, specs: LineSpec[] = LINE_SPECS, stopSpecs: StopSpec[] = STOP_SPECS, opts: { planned?: boolean } = {}): TransitNetwork {
  const issues: string[] = [], stops = new Map<string, TransitStop>();
  const lineOf = (id: string) => specs.find((l) => l.stops.includes(id));
  for (const spec of stopSpecs) {
    if (spec.planned && !opts.planned) continue;
    const line = lineOf(spec.id);
    if (spec.mode === 'bus') {
      const st = busStop(graph, spec, line ?? BUS, issues);
      if (st) stops.set(spec.id, st);
    } else stops.set(spec.id, { ...spec, x: spec.berth!.x, z: spec.berth!.z, hx: 1, hz: 0, edge: -1, dir: 1, s: 0 });
  }
  const lines: TransitLine[] = [];
  for (const spec of specs) {
    if (spec.planned && !opts.planned) continue;
    const line = spec.mode === 'bus' ? busLine(graph, spec, stops, issues) : boatLine(spec, stops, issues);
    if (line) lines.push(line);
  }
  // A built stop that only planned lines (left out) call at waits for them: the ferry's An Hòa landing.
  for (const id of [...stops.keys()]) {
    const callers = specs.filter((l) => l.stops.includes(id));
    if (callers.length && callers.every((l) => l.planned && !opts.planned)) stops.delete(id);
  }
  return { lines, stops, issues };
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
  type Day = { trips: Trip[]; fleet: number };
  const dayCache = new Map<string, Day>();
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
    const key = `${lineId}:${d}`;
    let got = dayCache.get(key);
    if (!got) {
      const line = lines.get(lineId)!, runH = line.run / sph, list = base.get(lineId)!;
      got = { trips: list.map((t, index) => ({ line: lineId, day: d, index, vehicle: t.vehicle, depart: d * 24 + t.m / 60, end: d * 24 + t.m / 60 + runH })), fleet: Math.max(0, ...list.map((t) => t.vehicle + 1)) };
      dayCache.set(key, got);
      if (dayCache.size > 64) dayCache.delete(dayCache.keys().next().value!);
    }
    return got;
  }
  const keyOf = (lineId: string, vehicle: number) => `${lineId}-${vehicle + 1}`;
  /** A vehicle waits at the terminus at most this long (game hours); with a longer gap it goes to the depot. */
  const maxWait = (line: TransitLine) => (3 * line.spec.layover) / sph;
  /** The vehicle's next trip, when it stays at the terminus for it (same day, within the longest wait). */
  const continues = (trip: Trip) => {
    const next = day(trip.line, trip.day).trips.find((o) => o.vehicle === trip.vehicle && o.depart >= trip.end - 1e-9);
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
    const line = lines.get(lineId)!, trips = tripsAround(lineId, t).filter((tr) => tr.vehicle === vehicle);
    const key = keyOf(lineId, vehicle), riding = aboard.get(key)?.size ?? 0;
    const mk = (trip: Trip | null, phase: VehicleState['phase'], s: number, speed: number, visit: number, crowdVisit: number): VehicleState => {
      const p = pathPoint(line.path, s);
      return { key, line: lineId, vehicle, trip, phase, s: ((s % line.path.len) + line.path.len) % line.path.len, x: p.x, z: p.z, hx: p.hx, hz: p.hz, speed, visit, load: (trip ? crowd(line, trip, crowdVisit) : 0) + riding };
    };
    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      if (t >= trip.depart && t < trip.end) {
        const at = onTrip(line, trip, t);
        return mk(trip, at.phase, at.s, at.speed, at.visit, at.phase === 'dwell' ? at.visit : (at.visit + line.visits.length - 1) % line.visits.length);
      }
      // Waiting at the terminus for this trip: since the last one ended, or come from the depot a layover before it.
      const prev = i > 0 && trips[i - 1].day === trip.day ? trips[i - 1] : null;
      const before = prev && continues(prev) === trip ? prev.end : trip.depart - line.spec.layover / sph;
      if (t >= before && t < trip.depart) return mk(trip, 'layover', 0, 0, 0, 0);
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
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i], b = out[j], need = (lineOf(a).spec.length + lineOf(b).spec.length) / 2 + 2;
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
          if (lineOf(a).mode !== lineOf(b).mode || d >= need - 1e-6 || a.hx * b.hx + a.hz * b.hz < 0.2) continue;
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
