import { LEGACY_ROADS } from './map/roads-legacy.ts';
import type { Footway, RoadGraph } from './map/roads.ts';

/** A step of a walking route; `crossing` marks legs over a carriageway (on a crosswalk). */
export type Waypoint = { x: number; z: number; crossing: boolean };
/**
 * What a walking leg is: part of a walking line along a road ('sidewalk'; 'hem' for the one line down the middle of
 * a road without sidewalks, as in a hẻm), a crosswalk, a footway, or a join between walking lines that do not meet.
 */
export type LegKind = 'sidewalk' | 'hem' | 'crossing' | 'footway' | 'join';
/**
 * A walking leg from node a (its west end, or its north end if it runs more north-south than east-west) to node b.
 * `ref` is the road edge a 'sidewalk' or 'hem' leg runs along, the crosswalk a 'crossing' is (index into
 * roads.crosswalks) or the footway a 'footway' is (into roads.footways); -1 for a join.
 */
export type Segment = { ax: number; az: number; bx: number; bz: number; a: number; b: number; crossing: boolean; kind: LegKind; ref: number };
type Leg = Omit<Segment, 'a' | 'b'>;
type Edge = { to: number; cost: number; crossing: boolean };
export type Nav = ReturnType<typeof buildNav>;

const CELL = 16;
/** A leg that ends within this distance of another leg's interior splits that leg there, so the two connect. */
const TEE = 0.05;
// A* heuristic: straight-line distance to the destination. Every leg costs at least its length (crosswalks 1.4x, no
// waits in the cost), so it is admissible and consistent; the hair under 1 keeps float rounding from breaking that.
const HEURISTIC = 1 - 1e-9;
const STAMP_LIMIT = 0xffffffff;

let shared: Nav | null = null;

/**
 * Pedestrian network over the road graph: the walking lines along every road (both sidewalks, or one down the middle
 * of a hẻm) broken at nodes into legs, the crosswalks over junction arms, footways, and joins between walking lines.
 * Routes follow walking lines and only cross roads on crosswalks. It depends only on the road graph (today's grid,
 * LEGACY_ROADS) and searches keep no state between calls, so all callers share one.
 */
export function createNav() {
  if (!shared) shared = buildNav();
  return shared;
}

/** A leg that ends on another one's interior (a footway meeting a sidewalk mid-block) splits it at that end. */
function splitTees(legs: Leg[]) {
  // Legs by 16 m cell; keys stay small integers (cells within ±32 km of the origin), so lookups never box a number.
  const cells = new Map<number, number[]>(), key = (cx: number, cz: number) => (cx + 2048) * 4096 + cz + 2048;
  legs.forEach((l, i) => {
    const x1 = Math.floor((Math.max(l.ax, l.bx) + TEE) / CELL), z0 = Math.floor((Math.min(l.az, l.bz) - TEE) / CELL), z1 = Math.floor((Math.max(l.az, l.bz) + TEE) / CELL);
    for (let cx = Math.floor((Math.min(l.ax, l.bx) - TEE) / CELL); cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const list = cells.get(key(cx, cz));
      if (list) list.push(i); else cells.set(key(cx, cz), [i]);
    }
  });
  const cuts = new Map<number, { t: number; x: number; z: number }[]>();
  for (const l of legs) for (let end = 0; end < 2; end++) {
    const x = end ? l.bx : l.ax, z = end ? l.bz : l.az, near = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (near) for (const i of near) {
      // Along and across the leg, both scaled by its length: past TEE from either end and within TEE of it.
      const m = legs[i], dx = m.bx - m.ax, dz = m.bz - m.az, len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
      const along = (x - m.ax) * dx + (z - m.az) * dz, across = (x - m.ax) * dz - (z - m.az) * dx;
      if (along <= TEE * len || along >= len2 - TEE * len || across * across > TEE * TEE * len2) continue;
      const list = cuts.get(i), t = along / len2;
      if (list) list.push({ t, x, z }); else cuts.set(i, [{ t, x, z }]);
    }
  }
  if (!cuts.size) return legs;
  return legs.flatMap((l, i) => {
    const at = cuts.get(i)?.sort((p, q) => p.t - q.t);
    if (!at) return [l];
    const out: Leg[] = [];
    let x = l.ax, z = l.az;
    for (const c of at) if (c.x !== x || c.z !== z) { out.push({ ...l, ax: x, az: z, bx: c.x, bz: c.z }); x = c.x; z = c.z; }
    out.push({ ...l, ax: x, az: z });
    return out;
  });
}

/** A separate network over any road graph, for tests and tools; the game uses the shared one from createNav(). */
export function buildNav(roads: RoadGraph = LEGACY_ROADS) {
  const nodes: { x: number; z: number; edges: Edge[] }[] = [];
  const ids = new Map<string, number>();
  const segments: Segment[] = [];

  function node(x: number, z: number) {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    let id = ids.get(key);
    if (id === undefined) { id = nodes.length; nodes.push({ x, z, edges: [] }); ids.set(key, id); }
    return id;
  }
  function link({ ax, az, bx, bz, crossing, kind, ref }: Leg) {
    const a = node(ax, az), b = node(bx, bz);
    if (a === b) return;
    // A leg laid twice (the two crosswalks over the straight-on arms where a hẻm meets a road) counts once.
    for (const e of nodes[a].edges) if (e.to === b && e.crossing === crossing) return;
    const cost = Math.hypot(bx - ax, bz - az) * (crossing ? 1.4 : 1);
    nodes[a].edges.push({ to: b, cost, crossing });
    nodes[b].edges.push({ to: a, cost, crossing });
    segments.push({ ax, az, bx, bz, a, b, crossing, kind, ref });
  }
  // walkLegs() lists each edge's walking lines (right side, then left, or the one down a hẻm; a leg per polyline
  // piece), then the crosswalks (phantom ones too), the footways and the joins. Crosswalks and footways come out as
  // stored, which checks that order.
  const raw = roads.walkLegs(), tagged: Leg[] = [];
  let i = 0;
  const take = (kind: LegKind, ref: number, crossing: boolean) => {
    const l = raw[i++];
    tagged.push({ ax: l.ax, az: l.az, bx: l.bx, bz: l.bz, crossing, kind, ref });
  };
  const expect = (p: Footway) => {
    const l = raw[i];
    if (!l || l.ax !== p.ax || l.az !== p.az || l.bx !== p.bx || l.bz !== p.bz) throw new Error('nav: walkLegs() no longer lists edges, crosswalks, footways, joins in order');
  };
  for (const e of roads.edges) for (let n = (e.walk > 0 ? 2 : 1) * (e.pts.length / 2 - 1); n > 0; n--) take(e.walk > 0 ? 'sidewalk' : 'hem', e.id, false);
  for (const c of roads.crosswalks) { expect(c); take('crossing', c.id, true); }
  roads.footways.forEach((f, n) => { expect(f); take('footway', n, false); });
  while (i < raw.length) take('join', -1, raw[i].crossing);
  // Sweep order, whatever order the road graph lists its edges in: legs running east-west first, row by row from the
  // north, each from its west end; then north-south ones column by column from the west, each from its north end.
  // The old grid builder laid its walking lines in this order, so on today's map every node and leg keeps its index
  // (and snap() and route() break ties as before).
  const ew = (l: Leg) => Math.abs(l.bx - l.ax) >= Math.abs(l.bz - l.az);
  const swept = splitTees(tagged);
  for (const l of swept) if (ew(l) ? l.bx < l.ax : l.bz < l.az) [l.ax, l.az, l.bx, l.bz] = [l.bx, l.bz, l.ax, l.az];
  swept.sort((p, q) => Number(ew(q)) - Number(ew(p))
    || (ew(p) ? p.az - q.az || p.ax - q.ax || p.bz - q.bz || p.bx - q.bx : p.ax - q.ax || p.az - q.az || p.bx - q.bx || p.bz - q.bz));
  swept.forEach(link);

  // Packed for searching: node coordinates plus one virtual node, `goal`, placed on the destination point per route;
  // adjacency in CSR form, in the same edge order as above.
  const count = nodes.length, goal = count;
  const nodeX = new Float64Array(count + 1), nodeZ = new Float64Array(count + 1), first = new Int32Array(count + 1);
  nodes.forEach((n, i) => { nodeX[i] = n.x; nodeZ[i] = n.z; first[i + 1] = first[i] + n.edges.length; });
  const edgeTo = new Int32Array(first[count]), edgeCost = new Float64Array(first[count]), edgeCrossing = new Uint8Array(first[count]);
  nodes.forEach((n, i) => n.edges.forEach((e, k) => { edgeTo[first[i] + k] = e.to; edgeCost[first[i] + k] = e.cost; edgeCrossing[first[i] + k] = e.crossing ? 1 : 0; }));

  // Snap grid: each 16 m cell lists the segments passing through it.
  const segAX = Float64Array.from(segments, (s) => s.ax), segAZ = Float64Array.from(segments, (s) => s.az);
  const segBX = Float64Array.from(segments, (s) => s.bx), segBZ = Float64Array.from(segments, (s) => s.bz);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.ax, s.bx); maxX = Math.max(maxX, s.ax, s.bx);
    minZ = Math.min(minZ, s.az, s.bz); maxZ = Math.max(maxZ, s.az, s.bz);
  }
  const cols = Math.floor((maxX - minX) / CELL) + 1, rows = Math.floor((maxZ - minZ) / CELL) + 1;
  const col = (x: number) => Math.max(0, Math.min(cols - 1, Math.floor((x - minX) / CELL)));
  const row = (z: number) => Math.max(0, Math.min(rows - 1, Math.floor((z - minZ) / CELL)));
  const cellFirst = new Int32Array(cols * rows + 1);
  const eachCell = (i: number, fn: (cell: number) => void) => {
    for (let r = row(Math.min(segAZ[i], segBZ[i])); r <= row(Math.max(segAZ[i], segBZ[i])); r++)
      for (let c = col(Math.min(segAX[i], segBX[i])); c <= col(Math.max(segAX[i], segBX[i])); c++) fn(r * cols + c);
  };
  segments.forEach((_, i) => eachCell(i, (cell) => cellFirst[cell + 1]++));
  for (let k = 0; k < cols * rows; k++) cellFirst[k + 1] += cellFirst[k];
  const cellSegments = new Int32Array(cellFirst[cols * rows]), fill = cellFirst.slice(0, -1);
  segments.forEach((_, i) => eachCell(i, (cell) => { cellSegments[fill[cell]++] = i; }));

  // Per-search scratch, valid only where its stamp matches the current search, so nothing is cleared or allocated.
  const segStamp = new Uint32Array(segments.length);
  const g = new Float64Array(count + 1), previous = new Int32Array(count + 1), crossingInto = new Uint8Array(count + 1);
  const seen = new Uint32Array(count + 1), closed = new Uint32Array(count + 1);
  let snapStamp = 0, stamp = 0;
  // Open list: binary min-heap on g + h with lazy deletion. A node is expanded once and pushes at most once per leg,
  // plus two seeds and two finishes, so it only grows if float rounding ever reopens a node.
  let heapNode = new Int32Array(edgeTo.length + 8), heapKey = new Float64Array(edgeTo.length + 8);
  let heapSize = 0;
  // Result of the last nearest(): segment index, closest point and squared distance.
  let nearSeg = 0, nearX = 0, nearZ = 0, nearD = Infinity;

  function consider(i: number, x: number, z: number) {
    const ax = segAX[i], az = segAZ[i], dx = segBX[i] - ax, dz = segBZ[i] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + dx * t, pz = az + dz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < nearD || (d === nearD && i < nearSeg)) { nearSeg = i; nearX = px; nearZ = pz; nearD = d; }
  }
  function scanCell(cell: number, x: number, z: number) {
    for (let k = cellFirst[cell]; k < cellFirst[cell + 1]; k++) {
      const i = cellSegments[k];
      if (segStamp[i] !== snapStamp) { segStamp[i] = snapStamp; consider(i, x, z); }
    }
  }
  /** Closest segment, searched in growing rings of cells; on ties the lowest index wins, as in a linear scan. */
  function nearest(x: number, z: number) {
    nearSeg = 0; nearX = x; nearZ = z; nearD = Infinity;
    if (!(Math.abs(x) < 1e9 && Math.abs(z) < 1e9)) { for (let i = 0; i < segments.length; i++) consider(i, x, z); return; }
    if (++snapStamp === STAMP_LIMIT) { segStamp.fill(0); snapStamp = 1; }
    const cx = col(x), cz = row(z);
    for (let ring = 0; ; ring++) {
      const c0 = cx - ring, c1 = cx + ring, r0 = cz - ring, r1 = cz + ring;
      for (let r = Math.max(r0, 0); r <= Math.min(r1, rows - 1); r++) {
        if (r === r0 || r === r1) for (let c = Math.max(c0, 0); c <= Math.min(c1, cols - 1); c++) scanCell(r * cols + c, x, z);
        else {
          if (c0 >= 0) scanCell(r * cols + c0, x, z);
          if (c1 < cols) scanCell(r * cols + c1, x, z);
        }
      }
      // Any segment not seen yet only passes through cells outside this block, so it is at least `reach` away.
      let reach = Infinity;
      if (c0 > 0) reach = x - (minX + c0 * CELL);
      if (c1 < cols - 1) reach = Math.min(reach, minX + (c1 + 1) * CELL - x);
      if (r0 > 0) reach = Math.min(reach, z - (minZ + r0 * CELL));
      if (r1 < rows - 1) reach = Math.min(reach, minZ + (r1 + 1) * CELL - z);
      if (reach === Infinity || (reach > 1e-6 && nearD < (reach - 1e-6) ** 2)) return;
    }
  }

  function push(id: number, key: number) {
    if (heapSize === heapNode.length) {
      const nodes = new Int32Array(heapSize * 2), keys = new Float64Array(heapSize * 2);
      nodes.set(heapNode); keys.set(heapKey); heapNode = nodes; heapKey = keys;
    }
    let i = heapSize++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heapKey[up] <= key) break;
      heapNode[i] = heapNode[up]; heapKey[i] = heapKey[up]; i = up;
    }
    heapNode[i] = id; heapKey[i] = key;
  }
  function pop() {
    const top = heapNode[0], id = heapNode[--heapSize], key = heapKey[heapSize];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= heapSize) break;
      if (c + 1 < heapSize && heapKey[c + 1] < heapKey[c]) c++;
      if (heapKey[c] >= key) break;
      heapNode[i] = heapNode[c]; heapKey[i] = heapKey[c]; i = c;
    }
    heapNode[i] = id; heapKey[i] = key;
    return top;
  }
  function open(id: number, cost: number, via: number, crossing: number) {
    if (seen[id] === stamp) {
      if (cost > g[id]) return;
      if (cost === g[id]) {
        // An equal-cost way in: keep the one Dijkstra kept, through the node it settles first (lower cost, then lower
        // index), so routes stay the same as before the rewrite. Every such node is expanded before the goal.
        const prev = previous[id];
        if (prev >= 0 && (g[via] < g[prev] || (g[via] === g[prev] && via < prev))) { previous[id] = via; crossingInto[id] = crossing; }
        return;
      }
      closed[id] = 0;
    }
    seen[id] = stamp; g[id] = cost; previous[id] = via; crossingInto[id] = crossing;
    const dx = nodeX[id] - nodeX[goal], dz = nodeZ[id] - nodeZ[goal];
    push(id, cost + HEURISTIC * Math.sqrt(dx * dx + dz * dz));
  }

  /** Closest point on the walking network. */
  function snap(x: number, z: number) {
    nearest(x, z);
    return { x: nearX, z: nearZ, segment: segments[nearSeg], d: nearD };
  }

  /** Walking route between two points on (or near) the network; the start point itself is not included. */
  function route(fromX: number, fromZ: number, toX: number, toZ: number): Waypoint[] {
    nearest(fromX, fromZ);
    const from = segments[nearSeg], fx = nearX, fz = nearZ;
    nearest(toX, toZ);
    const to = segments[nearSeg], tx = nearX, tz = nearZ;
    if (from === to) return [{ x: tx, z: tz, crossing: to.crossing }];
    if (++stamp === STAMP_LIMIT) { seen.fill(0); closed.fill(0); stamp = 1; }
    heapSize = 0;
    nodeX[goal] = tx; nodeZ[goal] = tz;
    const scale = from.crossing ? 1.4 : 1, crossing = from.crossing ? 1 : 0;
    open(from.a, Math.hypot(nodeX[from.a] - fx, nodeZ[from.a] - fz) * scale, -1, crossing);
    open(from.b, Math.hypot(nodeX[from.b] - fx, nodeZ[from.b] - fz) * scale, -1, crossing);
    while (heapSize > 0) {
      const u = pop();
      if (closed[u] === stamp) continue;
      closed[u] = stamp;
      if (u === goal) break;
      const gu = g[u];
      for (let k = first[u]; k < first[u + 1]; k++) open(edgeTo[k], gu + edgeCost[k], u, edgeCrossing[k]);
      // Finish through whichever end of the destination leg is cheaper (its `a` end on a tie).
      if (u === to.a || u === to.b) {
        const tail = gu + Math.hypot(nodeX[u] - tx, nodeZ[u] - tz);
        if (seen[goal] !== stamp || tail < g[goal] || (tail === g[goal] && u === to.a)) {
          seen[goal] = stamp; g[goal] = tail; previous[goal] = u; push(goal, tail);
        }
      }
    }
    if (seen[goal] !== stamp) return [{ x: nodeX[to.a], z: nodeZ[to.a], crossing: false }, { x: tx, z: tz, crossing: to.crossing }];
    // A destination exactly on the `a` end ties with the goal in the heap and may not be expanded yet; its g is final.
    if (seen[to.a] === stamp && g[to.a] + Math.hypot(nodeX[to.a] - tx, nodeZ[to.a] - tz) <= g[goal]) previous[goal] = to.a;
    const path: Waypoint[] = [{ x: tx, z: tz, crossing: to.crossing }];
    for (let v = previous[goal]; v >= 0; v = previous[v]) path.push({ x: nodeX[v], z: nodeZ[v], crossing: crossingInto[v] === 1 });
    return path.reverse();
  }

  /** Every walking leg, in index order; read-only. */
  const legs = (): readonly Segment[] => segments;

  return { route, snap, nodeCount: () => count, legs, roads };
}
