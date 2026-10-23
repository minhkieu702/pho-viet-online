import { BOUND, ROADS, SIDEWALK } from './city';

/** A step of a walking route; `crossing` marks legs over a carriageway (on a crosswalk). */
export type Waypoint = { x: number; z: number; crossing: boolean };
type Edge = { to: number; cost: number; crossing: boolean };
type Segment = { ax: number; az: number; bx: number; bz: number; a: number; b: number; crossing: boolean };

/**
 * Pedestrian network: walking lines on both sides of every road, broken at junctions into
 * sidewalk legs and crosswalk legs. Routes follow sidewalks and only cross roads on crosswalks.
 */
export function createNav() {
  const nodes: { x: number; z: number; edges: Edge[] }[] = [];
  const ids = new Map<string, number>();
  const segments: Segment[] = [];
  const end = BOUND - 1;

  function node(x: number, z: number) {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    let id = ids.get(key);
    if (id === undefined) { id = nodes.length; nodes.push({ x, z, edges: [] }); ids.set(key, id); }
    return id;
  }
  function link(ax: number, az: number, bx: number, bz: number, crossing: boolean) {
    const a = node(ax, az), b = node(bx, bz);
    const cost = Math.hypot(bx - ax, bz - az) * (crossing ? 1.4 : 1);
    nodes[a].edges.push({ to: b, cost, crossing });
    nodes[b].edges.push({ to: a, cost, crossing });
    segments.push({ ax, az, bx, bz, a, b, crossing });
  }
  const breaks = [-end, ...ROADS.flatMap((r) => [r - SIDEWALK, r + SIDEWALK]), end].sort((p, q) => p - q);
  for (const road of ROADS) {
    for (const side of [-1, 1]) {
      const line = road + side * SIDEWALK;
      for (let i = 0; i < breaks.length - 1; i++) {
        const from = breaks[i], to = breaks[i + 1];
        const crossing = ROADS.some((r) => Math.abs(from - (r - SIDEWALK)) < 0.01 && Math.abs(to - (r + SIDEWALK)) < 0.01);
        link(line, from, line, to, crossing);
        link(from, line, to, line, crossing);
      }
    }
  }

  /** Closest point on the walking network. */
  function snap(x: number, z: number) {
    let best = { x, z, segment: segments[0], d: Infinity };
    for (const s of segments) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      const px = s.ax + dx * t, pz = s.az + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best.d) best = { x: px, z: pz, segment: s, d };
    }
    return best;
  }

  /** Walking route between two points on (or near) the network; the start point itself is not included. */
  function route(fromX: number, fromZ: number, toX: number, toZ: number): Waypoint[] {
    const from = snap(fromX, fromZ), to = snap(toX, toZ);
    if (from.segment === to.segment) return [{ x: to.x, z: to.z, crossing: to.segment.crossing }];
    const count = nodes.length;
    const dist = new Float64Array(count).fill(Infinity);
    const previous = new Int32Array(count).fill(-1);
    const crossingInto = new Uint8Array(count);
    const done = new Uint8Array(count);
    const seed = (id: number, x: number, z: number) => {
      const cost = Math.hypot(nodes[id].x - x, nodes[id].z - z) * (from.segment.crossing ? 1.4 : 1);
      if (cost < dist[id]) { dist[id] = cost; crossingInto[id] = from.segment.crossing ? 1 : 0; }
    };
    seed(from.segment.a, from.x, from.z);
    seed(from.segment.b, from.x, from.z);
    for (let n = 0; n < count; n++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < count; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const edge of nodes[u].edges) {
        const next = dist[u] + edge.cost;
        if (next < dist[edge.to]) { dist[edge.to] = next; previous[edge.to] = u; crossingInto[edge.to] = edge.crossing ? 1 : 0; }
      }
    }
    // Finish through whichever end of the destination leg is cheaper.
    const tail = (id: number) => dist[id] + Math.hypot(nodes[id].x - to.x, nodes[id].z - to.z);
    let last = tail(to.segment.a) <= tail(to.segment.b) ? to.segment.a : to.segment.b;
    const path: Waypoint[] = [{ x: to.x, z: to.z, crossing: to.segment.crossing }];
    while (last >= 0) {
      path.unshift({ x: nodes[last].x, z: nodes[last].z, crossing: crossingInto[last] === 1 });
      last = previous[last];
    }
    return path;
  }

  return { route, snap, nodeCount: () => nodes.length };
}
