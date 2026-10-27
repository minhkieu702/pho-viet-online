/**
 * Roundabouts (WIRING-PLAN §6.3): the slices author a junction hint `control: 'roundabout'` with the ring's outer kerb
 * radius, and their EXTRA the island inside it. The generator built them as plain priority crossroads; here the live
 * graph's input is rewritten so each becomes a ring: every road into it is cut back to the ring's centre line, a ring
 * node stands where it meets the ring, and one-way arcs join the ring nodes counter-clockwise (right-hand traffic, as
 * seen on the map with north up). The ring is the main road at every ring node (it outranks the roads coming in by
 * name and class), so traffic entering gives way, and everything turns right. The node in the middle keeps its index
 * (nothing joins it any more), so node and edge ids before the expansion are unchanged; the arcs are appended.
 *
 * Only district nodes are expanded (today's map has no roundabout), so the legacy graph's ids and bytes stay as they
 * are. Pure data and maths.
 */
import type { Bay, EdgeSpec, Lane, NodeSpec, RoadInput } from './roads.ts';
import { lanesFor, walkOf } from './gen/arterials.ts';

/** A ring to build: the hint's node, outer kerb radius, the island's radius, and who built it. */
export type RingSpec = { node: number; radius: number; island: number; name: string; slice: string; id: string };
/** A built ring: centre, outer kerb, island, centre line radius and half-width; its ring nodes and arc edges (ids in the new graph). */
export type Ring = { id: string; name: string; slice: string; x: number; z: number; radius: number; island: number; rc: number; half: number; nodes: number[]; arcs: number[] };
type Origin = { slice: string; key: string };

const r2 = (v: number) => Math.round(v * 100) / 100;
/** The ring's sidewalk (R1's): its outer one meets the corners' sidewalks, its inner one paves the island's edge. */
const RING_SIDEWALK = 5.5;
/** The ring's speed (m/s): slow, it is a tight circle. */
const RING_SPEED = 7;

/**
 * The input with every ring in `specs` built, its edge and node origins kept in step (arcs: `ring:<id>:<k>`, art the
 * ring's id), and the rings. Bays on a road cut back keep their place along it (those inside the ring are dropped).
 */
export function expandRoundabouts(input: RoadInput, edgeOf: readonly (Origin & { art: string })[], nodeOf: readonly Origin[], specs: readonly RingSpec[]) {
  const nodes: NodeSpec[] = input.nodes.map((n) => ({ ...n }));
  const edges: EdgeSpec[] = input.edges.map((e) => ({ ...e, via: e.via?.slice(), bays: e.bays?.map((b) => ({ ...b })) }));
  const eo = edgeOf.map((o) => ({ ...o })), no = nodeOf.map((o) => ({ ...o }));
  const rings: Ring[] = [];
  for (const spec of specs) {
    const c = nodes[spec.node];
    if (!c) continue;
    const rc = (spec.radius + spec.island) / 2, half = (spec.radius - spec.island) / 2;
    const ends: { node: number; angle: number }[] = [];
    edges.forEach((e, id) => {
      for (const end of [0, 1] as const) {
        if ((end === 0 ? e.a : e.b) !== spec.node) continue;
        // The polyline from the centre outwards, and where it first leaves the ring's centre line.
        const other = nodes[end === 0 ? e.b : e.a], via = e.via ?? [];
        const pts = end === 0 ? [c.x, c.z, ...via, other.x, other.z] : [c.x, c.z, ...pairsReversed(via), other.x, other.z];
        let cut: { x: number; z: number; k: number; s: number } | null = null, run = 0;
        for (let k = 0; k + 3 < pts.length && !cut; k += 2) {
          const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3], seg = Math.hypot(bx - ax, bz - az);
          const da = Math.hypot(ax - c.x, az - c.z), db = Math.hypot(bx - c.x, bz - c.z);
          if (db >= rc) {
            // Solve |a + t (b - a) - c| = rc for t in [0, 1].
            const dx = bx - ax, dz = bz - az, fx = ax - c.x, fz = az - c.z, A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - rc * rc;
            const t = da >= rc ? 0 : (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
            cut = { x: ax + dx * t, z: az + dz * t, k, s: run + seg * t };
          }
          run += seg;
        }
        if (!cut) continue;
        const nid = nodes.length;
        nodes.push({ x: r2(cut.x), z: r2(cut.z), control: 'priority' });
        no.push({ slice: spec.slice, key: `ring:${spec.id}:${ends.length}` });
        // The edge now runs from the ring node: its interior points beyond the cut, its bays shifted (or clipped).
        const keep = pts.slice(cut.k + 2, pts.length - 2);
        const len0 = polylineLength(pts);
        if (end === 0) {
          e.a = nid;
          e.via = keep;
          e.bays = (e.bays ?? []).map((b): Bay => ({ ...b, s0: b.s0 - cut!.s, s1: b.s1 - cut!.s })).filter((b) => b.s1 > 1).map((b) => ({ ...b, s0: Math.max(0, b.s0) }));
        } else {
          e.b = nid;
          e.via = pairsReversed(keep);
          const len1 = len0 - cut.s;
          e.bays = (e.bays ?? []).filter((b) => b.s0 < len1 - 1).map((b) => ({ ...b, s1: Math.min(len1, b.s1) }));
        }
        ends.push({ node: nid, angle: Math.atan2(-(cut.z - c.z), cut.x - c.x) });
        void id;
      }
    });
    if (ends.length < 2) continue;
    ends.sort((p, q) => p.angle - q.angle);
    const lanes = lanesFor('R1', half, 1, 1, 0, 0);
    const ring: Ring = { id: spec.id, name: spec.name, slice: spec.slice, x: c.x, z: c.z, radius: spec.radius, island: spec.island, rc, half, nodes: ends.map((e) => e.node), arcs: [] };
    ends.forEach((from, k) => {
      const to = ends[(k + 1) % ends.length];
      let a1 = to.angle;
      while (a1 <= from.angle + 1e-6) a1 += 2 * Math.PI;
      const span = a1 - from.angle, steps = Math.max(2, Math.ceil((span * rc) / 2.5)), via: number[] = [];
      for (let i = 1; i < steps; i++) { const a = from.angle + (span * i) / steps; via.push(r2(c.x + rc * Math.cos(a)), r2(c.z - rc * Math.sin(a))); }
      ring.arcs.push(edges.length);
      edges.push({
        a: from.node, b: to.node, name: spec.name, cls: 'R1', via, half: r2(half), sidewalk: RING_SIDEWALK, walk: walkOf('R1', half, RING_SIDEWALK),
        fwd: lanes.fwd as Lane[], back: [], speed: RING_SPEED, traffic: true, closed: false, bays: [],
        // One zebra over the ring at each ring node (where the arc leaves it), not a V of two.
        walkCross: 1,
      });
      eo.push({ slice: spec.slice, key: `ring:${spec.id}:${k}`, art: `vong-xoay:${spec.id}` });
    });
    rings.push(ring);
  }
  return { input: { ...input, nodes, edges } as RoadInput, edgeOf: eo, nodeOf: no, rings };
}
function pairsReversed(p: readonly number[]) {
  const out: number[] = [];
  for (let k = p.length - 2; k >= 0; k -= 2) out.push(p[k], p[k + 1]);
  return out;
}
function polylineLength(p: readonly number[]) {
  let s = 0;
  for (let k = 0; k + 3 < p.length; k += 2) s += Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
  return s;
}
/** A circle as a polygon (x,z pairs), `n` sides. */
export function circlePoly(x: number, z: number, r: number, n = 24) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(r2(x + r * Math.cos(a)), r2(z + r * Math.sin(a))); }
  return out;
}
