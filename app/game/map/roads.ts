/**
 * The road network as a graph: nodes (junctions, bends, fence ends) joined by edges, each a centreline polyline
 * with a cross-section (asphalt, sidewalk, walking lines, lanes per direction), a class, a street name and a
 * speed. Signal approaches, crosswalks and the corners where walking lines meet are derived from the geometry.
 * An edge grid answers "which road is here", and a road A* plans routes for the GPS and, later, traffic.
 * Pure data and maths, no three.js, so the game, the tests and the map generators share it.
 * Game coordinates: x east, z south (the river is north, at low z); yaw 0 faces +z and PI/2 faces +x.
 */

export type Control = 'signal' | 'priority' | 'none' | 'fence-end';
export type RoadClass = 'R1' | 'R2' | 'hem';
export type LaneUse = 'car' | 'moto' | 'any';
/** A travel lane `off` metres to the right of the centreline for its direction of travel (dir +1: from a to b). */
export type Lane = { dir: 1 | -1; off: number; w: number; use: LaneUse };
export type BayKind = 'moto' | 'car' | 'bus' | 'taxi' | 'loading';
/** A curb bay on `side` (+1: right of a→b) from s0 to s1 along the edge, reaching `depth` metres in from the curb. */
export type Bay = { side: 1 | -1; s0: number; s1: number; depth: number; kind: BayKind };
export type RoadEdge = {
  id: number; a: number; b: number;
  /** Centreline from node a to node b as x,z pairs, and the arc length at each point. */
  pts: number[]; cum: number[]; len: number;
  cls: RoadClass; name: string;
  /** Asphalt half-width; paved sidewalk width beyond the curb; walking-line offset (0: one line down the middle). */
  half: number; sidewalk: number; walk: number;
  fwd: Lane[]; back: Lane[];
  /** Cruising speed, m/s. */
  speed: number;
  /** AI traffic spawns and routes here (false for the stubs that run into a fence). */
  traffic: boolean;
  closed: boolean;
  bays: Bay[];
};
/**
 * One road leaving a node: its edge and which end of it is here (0: a, 1: b), the unit direction it leaves in,
 * its signal group, the stop line (distance from the node centre), the approach and crosswalk on it (or -1),
 * and where the walking lines on its left and right end (distances along the arm).
 */
export type Arm = {
  edge: number; end: 0 | 1; hx: number; hz: number; angle: number;
  group: number; setback: number; approach: number; crosswalk: number; trim: [number, number];
};
/** `phases`: signal phases (2, or 3 where roads meet from three directions); 0 when not signalled. */
export type RoadNode = { id: number; x: number; z: number; control: Control; arms: Arm[]; phases: number; radius: number };
/** Traffic arriving at a signalled node along an edge: travel direction and heading, stop line and pole. */
export type RoadApproach = { id: number; node: number; arm: number; edge: number; dir: 1 | -1; group: number; stop: number; hx: number; hz: number; pole: { x: number; z: number } };
/**
 * A crosswalk over one arm of a junction, from the corner on the arm's left to the one on its right, held by
 * the arm's signal group. `phantom` ones cross an arm that does not exist (edge and arm -1): legacy data.
 */
export type Crosswalk = { id: number; node: number; arm: number; edge: number; group: number; ax: number; az: number; bx: number; bz: number; phantom: boolean };
/** A crosswalk over a road that is not there (direction from the node), kept for parity with the old walking graph. */
export type Phantom = { node: number; hx: number; hz: number; walk: number };
export type Footway = { ax: number; az: number; bx: number; bz: number };
export type WalkLeg = Footway & { crossing: boolean };
/** Closest point of an edge's centreline: arc length `s` from node a, signed offset (+: right of a→b), distance. */
export type EdgeHit = { edge: RoadEdge; s: number; off: number; d: number; x: number; z: number; hx: number; hz: number };
/** A lane position: where, the heading of travel and its yaw. */
export type LaneFrame = { x: number; z: number; hx: number; hz: number; yaw: number };
export type RoadRoute = { edges: number[]; dirs: (1 | -1)[]; points: { x: number; z: number }[]; length: number; time: number };
export type RouteOptions = { use?: LaneUse; all?: boolean; snap?: number };

export type NodeSpec = { x: number; z: number; control: Control };
export type EdgeSpec = {
  a: number; b: number; name: string; cls?: RoadClass;
  /** Interior centreline points, x,z pairs. */
  via?: number[];
  half?: number; sidewalk?: number; walk?: number; fwd?: Lane[]; back?: Lane[];
  speed?: number; traffic?: boolean; closed?: boolean; bays?: Bay[];
};
export type RoadInput = { nodes: NodeSpec[]; edges: EdgeSpec[]; phantoms?: Phantom[]; footways?: Footway[] };

type ClassSpec = { half: number; sidewalk: number; walk: number; speed: number; lanes: Omit<Lane, 'dir'>[] };
/** Cross-sections by class (design 1). R1 is today's road: 14 m of asphalt, cars 3.0 m and motos 5.4 m right of the centre. */
export const ROAD_CLASSES: Record<RoadClass, ClassSpec> = {
  R1: { half: 7, sidewalk: 5.5, walk: 8.4, speed: 13, lanes: [{ off: 3.0, w: 3.0, use: 'car' }, { off: 5.4, w: 2.4, use: 'moto' }] },
  R2: { half: 4.5, sidewalk: 3, walk: 5.9, speed: 9, lanes: [{ off: 2.0, w: 2.6, use: 'car' }, { off: 3.6, w: 1.6, use: 'moto' }] },
  // A hẻm: motorbikes both ways, people walk down the middle.
  hem: { half: 1.75, sidewalk: 0, walk: 0, speed: 6, lanes: [{ off: 0.8, w: 1.4, use: 'moto' }] },
};

const PI = Math.PI, HALF_PI = PI / 2;
/** Walking lines stop this far short of a fence. */
const FENCE_TRIM = 1;
/** The stop line stands this far back from the walking lines of the road crossed (11.2 = 8.4 + 2.8 on today's grid). */
const STOP_GAP = 2.8;
const CELL = 32;
/** Seconds the road A* adds for turning at a node (right-hand traffic: lefts cross the oncoming lanes). */
const TURN_RIGHT = 1, TURN_LEFT = 4, TURN_U = 8;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Heading angle in [-PI, PI): arms sort west, north, east, south on today's grid. */
const angleOf = (hx: number, hz: number) => { const a = Math.atan2(hz, hx); return a >= PI ? a - 2 * PI : a; };
/** Distance along line 1 (origin o1, direction h1) to where it meets line 2; NaN when they are parallel. */
function meet(o1x: number, o1z: number, h1x: number, h1z: number, o2x: number, o2z: number, h2x: number, h2z: number) {
  const c = h1x * h2z - h1z * h2x;
  if (Math.abs(c) < 1e-6) return NaN;
  const dx = o2x - o1x, dz = o2z - o1z;
  return (dx * h2z - dz * h2x) / c;
}

export type RoadGraph = ReturnType<typeof createRoadGraph>;

export function createRoadGraph(input: RoadInput) {
  const nodes: RoadNode[] = input.nodes.map((n, id) => ({ id, x: n.x, z: n.z, control: n.control, arms: [], phases: 0, radius: 0 }));
  const edges: RoadEdge[] = input.edges.map((e, id) => {
    const cls = e.cls ?? 'R1', spec = ROAD_CLASSES[cls], A = nodes[e.a], B = nodes[e.b];
    const pts = [A.x, A.z, ...(e.via ?? []), B.x, B.z];
    const cum = [0];
    for (let k = 2; k < pts.length; k += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]));
    return {
      id, a: e.a, b: e.b, pts, cum, len: cum[cum.length - 1], cls, name: e.name,
      half: e.half ?? spec.half, sidewalk: e.sidewalk ?? spec.sidewalk, walk: e.walk ?? spec.walk,
      fwd: e.fwd ?? spec.lanes.map((l) => ({ dir: 1 as const, ...l })), back: e.back ?? spec.lanes.map((l) => ({ dir: -1 as const, ...l })),
      speed: e.speed ?? spec.speed, traffic: e.traffic ?? true, closed: e.closed ?? false, bays: e.bays ?? [],
    };
  });
  for (const e of edges) {
    for (const end of [0, 1] as const) {
      const p = e.pts, k = end === 0 ? 0 : p.length - 2, q = end === 0 ? 2 : p.length - 4;
      const dx = p[q] - p[k], dz = p[q + 1] - p[k + 1], l = Math.hypot(dx, dz);
      nodes[end === 0 ? e.a : e.b].arms.push({ edge: e.id, end, hx: dx / l, hz: dz / l, angle: angleOf(dx, dz), group: 0, setback: 0, approach: -1, crosswalk: -1, trim: [0, 0] });
    }
  }
  const phantoms = input.phantoms ?? [];
  const footways = input.footways ?? [];
  const approaches: RoadApproach[] = [];
  const crosswalks: Crosswalk[] = [];
  const joins: WalkLeg[] = [];

  // Per node: arms sorted by angle, phantom crosswalk arms beside them, signal groups, corners, stop lines,
  // approaches and crosswalks.
  type WalkArm = { hx: number; hz: number; angle: number; walk: number; half: number; arm: number; group: number; trim: [number, number] };
  for (const node of nodes) {
    node.arms.sort((p, q) => p.angle - q.angle);
    const list: WalkArm[] = node.arms.map((a, i) => ({ hx: a.hx, hz: a.hz, angle: a.angle, walk: edges[a.edge].walk, half: edges[a.edge].half, arm: i, group: 0, trim: a.trim }));
    for (const p of phantoms) {
      if (p.node === node.id) { const l = Math.hypot(p.hx, p.hz); list.push({ hx: p.hx / l, hz: p.hz / l, angle: angleOf(p.hx, p.hz), walk: p.walk, half: 0, arm: -1, group: 0, trim: [0, 0] }); }
    }
    list.sort((p, q) => p.angle - q.angle);
    // Signal groups: arms along one direction share a phase, the cluster nearest north-south first (as today).
    const reps: number[] = [];
    const cluster = list.map((a) => {
      const th = ((Math.atan2(a.hz, a.hx) % PI) + PI) % PI;
      let c = reps.findIndex((r) => Math.min(Math.abs(r - th), PI - Math.abs(r - th)) < 0.35);
      if (c < 0) { c = reps.length; reps.push(th); }
      return c;
    });
    const order = reps.map((_, c) => c).sort((p, q) => Math.abs(reps[p] - HALF_PI) - Math.abs(reps[q] - HALF_PI) || reps[p] - reps[q]);
    const phases = Math.min(3, Math.max(2, reps.length));
    list.forEach((a, k) => { a.group = order.indexOf(cluster[k]) % phases; if (a.arm >= 0) node.arms[a.arm].group = a.group; });
    node.phases = node.control === 'signal' ? phases : 0;
    // Corners: where the walking line on one side of an arm meets its neighbour's (the next arm clockwise on a
    // map with north up is on its right). Straight on there is no corner and the lines run through the node.
    const n = list.length;
    let radius = n ? Math.max(...list.map((a) => a.half)) : 0;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (n === 1) { a.trim[0] = a.trim[1] = node.control === 'fence-end' ? FENCE_TRIM : 0; continue; }
      const r = list[(i + 1) % n], l = list[(i + n - 1) % n];
      const right = meet(-a.hz * a.walk, a.hx * a.walk, a.hx, a.hz, r.hz * r.walk, -r.hx * r.walk, r.hx, r.hz);
      const left = meet(a.hz * a.walk, -a.hx * a.walk, a.hx, a.hz, -l.hz * l.walk, l.hx * l.walk, l.hx, l.hz);
      const cap = 2 * Math.max(a.walk, l.walk, r.walk);
      a.trim[0] = Number.isNaN(left) ? 0 : Math.max(-cap, left);
      a.trim[1] = Number.isNaN(right) ? 0 : Math.max(-cap, right);
      const corner = meet(-a.hz * a.half, a.hx * a.half, a.hx, a.hz, r.hz * r.half, -r.hx * r.half, r.hx, r.hz);
      if (!Number.isNaN(corner) && corner > 0) radius = Math.max(radius, Math.hypot(corner, a.half));
    }
    node.radius = r2(radius);
    const junction = n >= 3 && node.control !== 'fence-end';
    /** The end of an arm's walking line on its left (0) or right (1); a centre line (hẻm) ends at the farther trim. */
    const corner = (a: WalkArm, side: 0 | 1) => {
      const t = a.walk > 0 ? a.trim[side] : Math.max(a.trim[0], a.trim[1]), s = side ? a.walk : -a.walk;
      return { x: node.x + a.hx * t + -a.hz * s, z: node.z + a.hz * t + a.hx * s };
    };
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (a.arm >= 0 && junction) node.arms[a.arm].setback = r2(Math.max(a.trim[0], a.trim[1], 0) + STOP_GAP);
      // Where neighbouring walking lines do not meet (a hẻm's centre line beside a sidewalk), a short leg joins them.
      if (n >= 2) {
        const p = corner(a, 1), q = corner(list[(i + 1) % n], 0), mx = (p.x + q.x) / 2 - node.x, mz = (p.z + q.z) / 2 - node.z;
        if (Math.hypot(p.x - q.x, p.z - q.z) > 0.01) joins.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, crossing: Math.hypot(mx, mz) < Math.max(a.half, list[(i + 1) % n].half) });
      }
      if (!junction || a.walk <= 0) continue;
      const p = corner(a, 0), q = corner(a, 1), arm = a.arm >= 0 ? node.arms[a.arm] : null;
      if (arm) arm.crosswalk = crosswalks.length;
      crosswalks.push({ id: crosswalks.length, node: node.id, arm: a.arm, edge: arm ? arm.edge : -1, group: a.group, ax: p.x, az: p.z, bx: q.x, bz: q.z, phantom: !arm });
    }
    if (node.control !== 'signal') continue;
    node.arms.forEach((arm, i) => {
      const e = edges[arm.edge], dir: 1 | -1 = arm.end === 1 ? 1 : -1;
      if (!e.traffic || !(dir > 0 ? e.fwd : e.back).length) return;
      // Traffic arrives heading into the node; the pole stands at the near right-hand corner, past the curb.
      const hx = -arm.hx, hz = -arm.hz, back = r2(arm.setback + 0.4), side = r2(e.half + 0.7);
      arm.approach = approaches.length;
      approaches.push({ id: approaches.length, node: node.id, arm: i, edge: e.id, dir, group: arm.group, stop: arm.setback, hx, hz, pole: { x: node.x - hx * back + -hz * side, z: node.z - hz * back + hx * side } });
    });
  }

  // ---- Edge and node grids (32 m cells) ----
  // Keys stay small integers (cells within ±65 km of the origin), so map lookups never box a number.
  const cellKey = (ix: number, iz: number) => (ix + 2048) * 4096 + (iz + 2048);
  const edgeCells = new Map<number, number[]>(), nodeCells = new Map<number, number[]>();
  const insert = (cells: Map<number, number[]>, id: number, minX: number, maxX: number, minZ: number, maxZ: number) => {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const key = cellKey(ix, iz), list = cells.get(key);
        if (!list) cells.set(key, [id]); else if (list[list.length - 1] !== id) list.push(id);
      }
    }
  };
  let reach = 0, maxRadius = 0;
  for (const e of edges) {
    const m = e.half + e.sidewalk, p = e.pts;
    reach = Math.max(reach, m);
    for (let k = 0; k + 3 < p.length; k += 2) insert(edgeCells, e.id, Math.min(p[k], p[k + 2]) - m, Math.max(p[k], p[k + 2]) + m, Math.min(p[k + 1], p[k + 3]) - m, Math.max(p[k + 1], p[k + 3]) + m);
  }
  for (const n of nodes) { insert(nodeCells, n.id, n.x, n.x, n.z, n.z); maxRadius = Math.max(maxRadius, n.radius); }
  const edgeStamp = new Uint32Array(edges.length), nodeStamp = new Uint32Array(nodes.length);
  let stamp = 0;
  /** Calls `visit` once for every id in the cells a square of half-size r around (x, z) touches. */
  function scan(cells: Map<number, number[]>, marks: Uint32Array, x: number, z: number, r: number, visit: (id: number) => void) {
    stamp++;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > marks.length * 4) { for (let id = 0; id < marks.length; id++) visit(id); return; }
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = cells.get(cellKey(ix, iz));
        if (list) for (const id of list) if (marks[id] !== stamp) { marks[id] = stamp; visit(id); }
      }
    }
  }

  // The per-frame queries (project, nearestEdge, edgeAt) allocate nothing but their one result: closest() leaves
  // the closest point in AT and the best edge so far is copied to BEST, both [s, off, x, z, hx, hz, d] (typed
  // arrays, so storing a double never boxes it).
  const AT = new Float64Array(7), BEST = new Float64Array(7);
  let bestEdge = -1;
  /** Distance from (x, z) to an edge's centreline; the closest point is left in AT. */
  function closest(e: RoadEdge, x: number, z: number) {
    const p = e.pts;
    AT[0] = AT[1] = 0; AT[2] = p[0]; AT[3] = p[1]; AT[4] = 1; AT[5] = 0; AT[6] = Infinity;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], az = p[k + 1], dx = p[k + 2] - ax, dz = p[k + 3] - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2) || 1;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const qx = ax + dx * t, qz = az + dz * t, ex = x - qx, ez = z - qz, d = Math.sqrt(ex * ex + ez * ez);
      if (d < AT[6]) {
        const hx = dx / l, hz = dz / l;
        AT[0] = e.cum[k / 2] + t * l; AT[1] = ex * -hz + ez * hx; AT[2] = qx; AT[3] = qz; AT[4] = hx; AT[5] = hz; AT[6] = d;
      }
    }
    return AT[6];
  }
  const hitOf = (edge: RoadEdge, h: Float64Array): EdgeHit => ({ edge, s: h[0], off: h[1], d: h[6], x: h[2], z: h[3], hx: h[4], hz: h[5] });
  /** Closest point on an edge's centreline (`d` is the distance to it). */
  function project(e: RoadEdge, x: number, z: number): EdgeHit {
    closest(e, x, z);
    return hitOf(e, AT);
  }
  /**
   * The best edge among those whose cells a square of half-size r around (x, z) touches (each tried once, in the
   * order scan() visits them): the nearest within maxD (mode 0, optionally among those `filter` accepts), or the
   * nearest whose carriageway widened by maxD holds the point (mode 1). Loops inline: no closure per call.
   */
  function bestEdgeNear(x: number, z: number, r: number, mode: 0 | 1, maxD: number, filter?: (e: RoadEdge) => boolean) {
    bestEdge = -1; BEST[6] = Infinity;
    stamp++;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    const all = (x1 - x0 + 1) * (z1 - z0 + 1) > edgeStamp.length * 4;
    for (let ix = all ? 0 : x0; ix <= (all ? 0 : x1); ix++) {
      for (let iz = all ? 0 : z0; iz <= (all ? 0 : z1); iz++) {
        const list = all ? null : edgeCells.get(cellKey(ix, iz));
        const n = all ? edges.length : list ? list.length : 0;
        for (let j = 0; j < n; j++) {
          const id = list ? list[j] : j;
          if (edgeStamp[id] === stamp) continue;
          edgeStamp[id] = stamp;
          const e = edges[id];
          if (filter && !filter(e)) continue;
          const d = closest(e, x, z);
          if ((mode === 0 ? d <= maxD : d < e.half + maxD) && d < BEST[6]) { bestEdge = id; BEST.set(AT); }
        }
      }
    }
    return bestEdge < 0 ? null : hitOf(edges[bestEdge], BEST);
  }
  /** The nearest edge centreline within maxD of (x, z), optionally among the edges `filter` accepts. */
  function nearestEdge(x: number, z: number, maxD = 64, filter?: (e: RoadEdge) => boolean): EdgeHit | null {
    return bestEdgeNear(x, z, maxD, 0, maxD, filter);
  }
  /** The road whose carriageway (widened by `margin`; the sidewalk with margin = sidewalk width) holds (x, z). */
  function edgeAt(x: number, z: number, margin = 0): EdgeHit | null {
    return bestEdgeNear(x, z, reach + Math.max(0, margin), 1, margin);
  }
  /** Every edge within r of (x, z), nearest first. */
  function edgesNear(x: number, z: number, r: number, filter?: (e: RoadEdge) => boolean): EdgeHit[] {
    const out: EdgeHit[] = [];
    scan(edgeCells, edgeStamp, x, z, r, (id) => {
      if (filter && !filter(edges[id])) return;
      const hit = project(edges[id], x, z);
      if (hit.d <= r) out.push(hit);
    });
    return out.sort((p, q) => p.d - q.d);
  }
  const isJunction = (n: RoadNode) => n.arms.length >= 3 && n.control !== 'fence-end';
  /** Junctions (three or more roads) whose centre is within r of (x, z), nearest first. */
  function junctionsNear(x: number, z: number, r: number): RoadNode[] {
    const out: RoadNode[] = [];
    scan(nodeCells, nodeStamp, x, z, r, (id) => { const n = nodes[id]; if (isJunction(n) && Math.hypot(n.x - x, n.z - z) <= r) out.push(n); });
    return out.sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z) || p.id - q.id);
  }
  /** The junction (x, z) stands in: within its asphalt radius of the centre, or within r when given. */
  function junctionAt(x: number, z: number, r?: number): RoadNode | null {
    for (const n of junctionsNear(x, z, r ?? maxRadius)) if (Math.hypot(n.x - x, n.z - z) <= (r ?? n.radius)) return n;
    return null;
  }

  /** The centreline point at arc length s (clamped to the edge), with the unit tangent from a towards b. */
  function pointAt(e: RoadEdge, s: number) {
    const p = e.pts, c = e.cum;
    s = Math.max(0, Math.min(e.len, s));
    let lo = 0, hi = c.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid] <= s) lo = mid; else hi = mid - 1; }
    const k = lo * 2, dx = p[k + 2] - p[k], dz = p[k + 3] - p[k + 1], l = c[lo + 1] - c[lo] || 1, t = (s - c[lo]) / l;
    return { x: p[k] + dx * t, z: p[k + 1] + dz * t, hx: dx / l, hz: dz / l };
  }
  /** Where a vehicle in `lane` is at arc length s (from node a, whichever way the lane runs), facing its travel. */
  function laneFrame(e: RoadEdge, s: number, lane: Lane): LaneFrame {
    const p = pointAt(e, s), hx = p.hx * lane.dir, hz = p.hz * lane.dir;
    return { x: p.x - hz * lane.off, z: p.z + hx * lane.off, hx, hz, yaw: Math.atan2(hx, hz) };
  }
  /** The first lane in a direction a vehicle kind may use ('car' takes car lanes, 'moto' moto lanes). */
  function laneFor(e: RoadEdge, dir: 1 | -1, use: LaneUse): Lane | null {
    for (const l of dir > 0 ? e.fwd : e.back) if (l.use === use || l.use === 'any' || use === 'any') return l;
    return null;
  }

  /** Where a walking line along an arm's road ends at the node: on its right (+1), left (-1) or centre line (0). */
  function corner(node: RoadNode, arm: Arm, side: -1 | 0 | 1) {
    const w = side ? edges[arm.edge].walk : 0, t = side > 0 ? arm.trim[1] : side < 0 ? arm.trim[0] : Math.max(arm.trim[0], arm.trim[1]);
    return { x: node.x + arm.hx * t + -arm.hz * side * w, z: node.z + arm.hz * t + arm.hx * side * w };
  }
  const armAt = (nodeId: number, edgeId: number, end: 0 | 1) => {
    const arms = nodes[nodeId].arms;
    for (let i = 0; i < arms.length; i++) if (arms[i].edge === edgeId && arms[i].end === end) return arms[i];
    throw new Error(`road graph: no arm of edge ${edgeId} at node ${nodeId}`);
  };
  /**
   * The walking network: the walking lines along both sides of every road (one down the middle of a hẻm),
   * running from corner to corner, every crosswalk (phantoms included), the footways and the joins between
   * walking lines that do not meet at a node (none on today's grid).
   */
  function walkLegs(): WalkLeg[] {
    const legs: WalkLeg[] = [];
    for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b], armA = armAt(e.a, e.id, 0), armB = armAt(e.b, e.id, 1);
      for (const side of e.walk > 0 ? ([1, -1] as const) : ([0] as const)) {
        // The right of a→b is the right of the arm leaving a and the left of the arm leaving b.
        const pts = [corner(A, armA, side)];
        for (let k = 2; k + 3 < e.pts.length; k += 2) {
          // Interior bends: offset along the mitred normal.
          const ux = e.pts[k] - e.pts[k - 2], uz = e.pts[k + 1] - e.pts[k - 1], vx = e.pts[k + 2] - e.pts[k], vz = e.pts[k + 3] - e.pts[k + 1];
          const lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1;
          let nx = -uz / lu - vz / lv, nz = ux / lu + vx / lv;
          const ln = Math.hypot(nx, nz) || 1, cos = (nx / ln) * (-uz / lu) + (nz / ln) * (ux / lu);
          nx = (nx / ln) * (side * e.walk) / Math.max(0.3, cos); nz = (nz / ln) * (side * e.walk) / Math.max(0.3, cos);
          pts.push({ x: e.pts[k] + nx, z: e.pts[k + 1] + nz });
        }
        pts.push(corner(B, armB, side === 0 ? 0 : side > 0 ? -1 : 1));
        for (let k = 1; k < pts.length; k++) legs.push({ ax: pts[k - 1].x, az: pts[k - 1].z, bx: pts[k].x, bz: pts[k].z, crossing: false });
      }
    }
    for (const c of crosswalks) legs.push({ ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, crossing: true });
    for (const f of footways) legs.push({ ax: f.ax, az: f.az, bx: f.bx, bz: f.bz, crossing: false });
    for (const j of joins) legs.push({ ...j });
    return legs;
  }

  // ---- Road A*: states are edges traversed in a direction (arriving at the far node), so turns can cost time. ----
  const S = edges.length * 2;
  const gCost = new Float64Array(S), parent = new Int32Array(S), seen = new Uint32Array(S), done = new Uint32Array(S);
  const heapK: number[] = [], heapF: number[] = [];
  let generation = 0;
  const vmax = edges.reduce((m, e) => Math.max(m, e.speed), 1);
  function push(k: number, f: number) {
    let i = heapK.length;
    heapK.push(k); heapF.push(f);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heapF[up] <= f) break;
      heapK[i] = heapK[up]; heapF[i] = heapF[up]; i = up;
    }
    heapK[i] = k; heapF[i] = f;
  }
  function pop() {
    const top = heapK[0], k = heapK.pop()!, f = heapF.pop()!, n = heapK.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= f) break;
        heapK[i] = heapK[c]; heapF[i] = heapF[c]; i = c;
      }
      heapK[i] = k; heapF[i] = f;
    }
    return top;
  }
  /** Seconds added for leaving a node along `arm` after arriving heading (hx, hz). */
  function turnCost(hx: number, hz: number, arm: Arm, uTurn: boolean) {
    if (uTurn) return TURN_U;
    const dot = hx * arm.hx + hz * arm.hz;
    if (dot > 0.7) return 0;
    if (dot < -0.95) return TURN_U;
    return hx * arm.hz - hz * arm.hx > 0 ? TURN_RIGHT : TURN_LEFT;
  }
  /**
   * The quickest road route between two points (each snapped to the nearest open road within opts.snap, 60 m),
   * for vehicles of kind opts.use ('car'). Only traffic roads are used between the ends unless opts.all.
   * Cost: length / speed plus turn delays. Points follow the centrelines. Null when there is no way.
   */
  function route(fromX: number, fromZ: number, toX: number, toZ: number, opts: RouteOptions = {}): RoadRoute | null {
    const use = opts.use ?? 'car', open = (e: RoadEdge) => !e.closed;
    const from = nearestEdge(fromX, fromZ, opts.snap ?? 60, open), to = nearestEdge(toX, toZ, opts.snap ?? 60, open);
    if (!from || !to) return null;
    const can = (e: RoadEdge, dir: 1 | -1) => !e.closed && !!laneFor(e, dir, use);
    const endOf = (k: number) => nodes[k & 1 ? edges[k >> 1].a : edges[k >> 1].b];
    const h = (n: RoadNode) => Math.hypot(n.x - to.x, n.z - to.z) / vmax;
    generation++;
    heapK.length = heapF.length = 0;
    let best = Infinity, bestK = -1, bestArm: Arm | null = null, direct = false;
    if (from.edge === to.edge) {
      const dir = to.s >= from.s ? 1 : -1;
      if (can(from.edge, dir)) { best = Math.abs(to.s - from.s) / from.edge.speed; direct = true; }
    }
    for (const dir of [1, -1] as const) {
      if (!can(from.edge, dir)) continue;
      const k = from.edge.id * 2 + (dir > 0 ? 0 : 1), g = (dir > 0 ? from.edge.len - from.s : from.s) / from.edge.speed;
      gCost[k] = g; parent[k] = -1; seen[k] = generation;
      push(k, g + h(endOf(k)));
    }
    while (heapK.length) {
      const k = pop();
      if (done[k] === generation) continue;
      done[k] = generation;
      const node = endOf(k), g = gCost[k];
      if (g + h(node) >= best) break;
      const e = edges[k >> 1], dir = k & 1 ? -1 : 1;
      // Arriving heading: the reverse of the arm this edge leaves the node by.
      const inArm = armAt(node.id, e.id, dir > 0 ? 1 : 0);
      for (const arm of node.arms) {
        const e2 = edges[arm.edge], dir2: 1 | -1 = arm.end === 0 ? 1 : -1;
        if (!can(e2, dir2)) continue;
        const g2 = g + turnCost(-inArm.hx, -inArm.hz, arm, arm === inArm);
        if (e2 === to.edge) {
          const total = g2 + (dir2 > 0 ? to.s : e2.len - to.s) / e2.speed;
          if (total < best) { best = total; bestK = k; bestArm = arm; direct = false; }
        }
        if (!opts.all && !e2.traffic) continue;
        const k2 = e2.id * 2 + (dir2 > 0 ? 0 : 1), ng = g2 + e2.len / e2.speed;
        if (seen[k2] === generation && ng >= gCost[k2]) continue;
        seen[k2] = generation; gCost[k2] = ng; parent[k2] = k;
        push(k2, ng + h(endOf(k2)));
      }
    }
    if (best === Infinity) return null;
    const points = [{ x: from.x, z: from.z }];
    /** Interior polyline points strictly between arc lengths s0 and s1, then the point at s1. */
    const run = (e: RoadEdge, s0: number, s1: number) => {
      const dir = s1 >= s0 ? 1 : -1, c = e.cum, n = c.length;
      for (let j = 0; j < n; j++) {
        const i = dir > 0 ? j : n - 1 - j;
        if ((c[i] - s0) * dir > 1e-9 && (s1 - c[i]) * dir > 1e-9) points.push({ x: e.pts[i * 2], z: e.pts[i * 2 + 1] });
      }
      const p = pointAt(e, s1);
      points.push({ x: p.x, z: p.z });
    };
    if (direct) {
      run(from.edge, from.s, to.s);
      return { edges: [from.edge.id], dirs: [to.s >= from.s ? 1 : -1], points, length: Math.abs(to.s - from.s), time: best };
    }
    const chain: number[] = [];
    for (let k = bestK; k >= 0; k = parent[k]) chain.push(k);
    chain.reverse();
    const out: RoadRoute = { edges: [], dirs: [], points, length: 0, time: best };
    chain.forEach((k, i) => {
      const e = edges[k >> 1], dir: 1 | -1 = k & 1 ? -1 : 1, s0 = i === 0 ? from.s : dir > 0 ? 0 : e.len, s1 = dir > 0 ? e.len : 0;
      out.edges.push(e.id); out.dirs.push(dir); out.length += Math.abs(s1 - s0);
      run(e, s0, s1);
    });
    const s0 = bestArm!.end === 0 ? 0 : to.edge.len;
    out.edges.push(to.edge.id); out.dirs.push(bestArm!.end === 0 ? 1 : -1); out.length += Math.abs(to.s - s0);
    run(to.edge, s0, to.s);
    return out;
  }

  return { nodes, edges, approaches, crosswalks, phantoms, footways, project, nearestEdge, edgeAt, edgesNear, junctionAt, junctionsNear, pointAt, laneFrame, laneFor, corner, walkLegs, route };
}
