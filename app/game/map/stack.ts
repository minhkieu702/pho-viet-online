/**
 * Stacking district slices (critique steps 14–18): every slice is built alone against today's road graph (plus the
 * links it hangs on, like Thủ Thiêm's ferry), so slices can be authored in parallel. The stack applies their patches
 * in turn, welds the seams the slices agreed by coordinates (two road ends on one point; a road end on another
 * slice's road, which splits it; a hẻm end onto another slice's walking line, which gets a footway) and checks what no
 * single slice can see: seams meet with matching cross-sections, slices do not overlap, no road is built twice or
 * stops short of another slice's road, nothing of one slice stands on another's roads, crosswalks, walking lines or
 * solids, decks never stand over another slice's road, the waterways agree with design 1's, and every door, seat and
 * footway reaches today's map over the welded walking network. Pure data and maths (no three.js). The order slices
 * are stacked in changes ids, never geometry.
 */
import { createRoadGraph, type Control, type EdgeSpec, type Footway, type RoadClass, type RoadEdge, type RoadGraph, type RoadInput, type WalkLeg } from './roads.ts';
import { inputOf, type DistrictData } from './build-district.ts';
import { WATERS } from './districts.ts';
import { STORY_STAMPS } from './stamps.ts';
import { createCollisionIndex } from './collision.ts';
import { CURB, type DistrictLayout } from './layout/types.ts';
import type { Issue } from './gen/validate.ts';
import { HEM_CLEAR, PED, type Solid } from './gen/dressing.ts';
import { boxOf, hyp, inPoly, obbOverlap, obbPolylineDist, obbSegDist, polyArea, polyEdgeDist, polylineHit, r2, segCross, segDist, type OBB } from './gen/geom.ts';

type Point = { x: number; z: number };

/**
 * A link that is not a street: it joins an island slice (no portal on today's grid) to the base graph, so its roads,
 * doors and seats reach today's map. Validation models it as a hẻm-class edge without traffic from today's node at
 * `anchor` along `via` to a fence end at `node`, where the island slice has its portal. P1: the Đò ngang from BẾN ĐÒ AN
 * HÒA to the end of Thủ Thiêm's ĐƯỜNG BẾN ĐÒ. The live map carries it as a ride (the ferry), not a road.
 */
export type DistrictLink = {
  id: string; kind: 'ferry'; name: string;
  /** The island's street that ends at `node` (its portal's road). */
  road: string; node: Point;
  /** Today's junction the link leaves from, and the points it passes on the way (the promenade, the pier). */
  anchor: Point; via: number[];
  /** Boarding points on either bank (consts.ts Dock rings). */
  from: Point & { dock: number }; to: Point;
};
export const isLink = (v: unknown): v is DistrictLink =>
  !!v && typeof v === 'object' && (v as DistrictLink).kind === 'ferry' && typeof (v as DistrictLink).road === 'string' && !!(v as DistrictLink).node && !!(v as DistrictLink).anchor;

/** Today's graph plus the links (each a fence end at its island node and one edge to its anchor), in list order. */
export function linkInput(legacy: RoadGraph, links: readonly DistrictLink[]): RoadInput {
  const input = inputOf(legacy);
  for (const l of links) {
    const anchor = input.nodes.findIndex((n) => Math.abs(n.x - l.anchor.x) < 0.01 && Math.abs(n.z - l.anchor.z) < 0.01);
    if (anchor < 0 || anchor >= legacy.nodes.length) throw new Error(`link ${l.id}: no node of today's graph at (${l.anchor.x}, ${l.anchor.z})`);
    // The link takes the arm a phantom crosswalk stood in for (the riverside T junctions' missing north arm).
    input.phantoms = (input.phantoms ?? []).filter((p) => p.node !== anchor);
    input.nodes.push({ x: l.node.x, z: l.node.z, control: 'fence-end' });
    input.edges.push({ a: anchor, b: input.nodes.length - 1, name: l.name, cls: 'hem', via: l.via.slice(), traffic: false });
  }
  return input;
}
const linkCache = new Map<string, RoadGraph>();
/** linkInput as a road graph, built once per (legacy graph, link list). */
export function linkGraph(legacy: RoadGraph, links: readonly DistrictLink[]): RoadGraph {
  if (!links.length) return legacy;
  const key = `${legacy.nodes.length}:${legacy.edges.length}:${links.map((l) => l.id).join(',')}`;
  let g = linkCache.get(key);
  if (!g) linkCache.set(key, (g = createRoadGraph(linkInput(legacy, links))));
  return g;
}
/** The links a layout hangs on: those whose island node one of its portals stands on. */
export const linksOf = (layout: DistrictLayout, links: readonly DistrictLink[]) =>
  links.filter((l) => layout.portals.some((p) => hyp(p.x - l.node.x, p.z - l.node.z) < 1));

/**
 * A seam two slices agreed on. node: road ends of the slices on one point become one node (straight on, a T or a
 * four-way). split: the road end of slices[0] lands on the middle of a road of slices[1], which is split there.
 * footway: a hẻm end of slices[0] stops short of a street of slices[1]; a footway runs from it to the walking line at `to`.
 * `control` overrides the junction control the arms give (signal where R1 roads meet, priority at minor arms).
 */
export type Seam = { id: string; kind: 'node' | 'split' | 'footway'; x: number; z: number; slices: [string, string]; to?: Point; control?: Control; note: string };
/** A slice to stack: its layout, its build, and the links it was built on (their ids, in its base graph's order). */
export type StackSlice = { key: string; layout: DistrictLayout; data: DistrictData; links?: string[] };
export type Origin = { slice: string; key: string };
export type Stack = {
  input: RoadInput; graph: RoadGraph;
  /** Who built each node and edge of the graph: 'legacy', 'link:<id>' or a slice key, with a stable key. */
  nodeOf: Origin[]; edgeOf: (Origin & { art: string })[];
  roundabouts: { node: number; radius: number; slice: string }[];
  /** The node each seam made (footway seams: the hẻm end) and the bays a split cut back from the new junction. */
  welds: { seam: string; node: number; cut: number }[];
  footways: Footway[];
  /**
   * Dressing a slice laid near a seam where another slice's road now runs (it was built not knowing that road): a
   * prop, tree, lamp, pole, table, parked moto or seat within SEAM_TRIM of a seam that stands on the welded graph's
   * asphalt, a crosswalk or a walking line. The live map leaves these out (like today's decorations beyond LAND).
   * Buildings are never trimmed: one in the way is an issue.
   */
  trimmed: Trim[];
  issues: Issue[];
};
export type Trim = { slice: string; key: string; kind: string; why: string; x: number; z: number };
/** Dressing this close to a seam may give way to the welded roads; anything farther that conflicts is an issue. */
export const SEAM_TRIM = 30;
/** Collider and prop keys of a stack: slice keys prefix the generator's (route-level keys such as 'pole:an-hoa:1:0' repeat across slices). */
export const stackKey = (slice: string, key: string) => `${slice}/${key}`;

/** Junction control from the arms (gen/arterials.ts classify): signal where R1 roads meet, priority at a smaller road or hẻm, none on bends and ends. */
function controlOf(arms: { cls: RoadClass; road: string }[]): Control {
  const roads = new Set(arms.map((a) => a.road));
  if (arms.length <= 2 || roads.size < 2) return 'none';
  const classes = new Set(arms.map((a) => a.cls));
  return classes.has('hem') ? 'priority' : classes.size === 1 ? (classes.has('R1') ? 'signal' : 'none') : 'priority';
}

/** Polyline arc lengths (bit-exact maths, as the generator). */
function cumOf(pts: readonly number[]) {
  const cum = [0];
  for (let k = 2; k < pts.length; k += 2) cum.push(cum[cum.length - 1] + hyp(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]));
  return cum;
}

/**
 * Applies the slices' patches onto today's graph and the links (in list order), then welds the seams. A seam whose
 * nodes or road are missing, or a portal two slices both took, is an issue (not a throw), so a broken stack reports
 * everything it finds.
 */
export function stackSlices(legacy: RoadGraph, links: readonly DistrictLink[], slices: readonly StackSlice[], seams: readonly Seam[]): Stack {
  const issues: Issue[] = [];
  const bad = (code: string, msg: string, x?: number, z?: number) => issues.push({ code, msg, x, z });
  const input = linkInput(legacy, links);
  const L = legacy.nodes.length, LE = legacy.edges.length;
  const nodeOf: Origin[] = input.nodes.map((_, i) => (i < L ? { slice: 'legacy', key: `legacy:${i}` } : { slice: `link:${links[i - L].id}`, key: `link:${links[i - L].id}` }));
  const edgeOf: Stack['edgeOf'] = input.edges.map((e, i) => (i < LE ? { slice: 'legacy', key: `legacy:${i}`, art: `legacy:${e.name}` } : { slice: `link:${links[i - LE].id}`, key: `link:${links[i - LE].id}`, art: links[i - LE].id }));
  const roundabouts: Stack['roundabouts'] = [];
  input.footways = input.footways ?? [];
  for (const s of slices) {
    const p = s.data.graphPatch, own = (s.links ?? []).map((id) => links.findIndex((l) => l.id === id));
    if (own.some((i) => i < 0)) { bad('stack-link', `slice ${s.key} was built on a link the stack lacks (${s.links})`); continue; }
    if (p.base.nodes !== L + own.length || p.base.edges !== LE + own.length) { bad('stack-base', `slice ${s.key} was built on another graph (${p.base.nodes} nodes, ${p.base.edges} edges)`); continue; }
    const n0 = input.nodes.length;
    // The slice's base: today's nodes and edges, then its own links; patch-own ids follow.
    const node = (n: number) => (n < L ? n : n < p.base.nodes ? L + own[n - L] : n0 + n - p.base.nodes);
    const edge = (e: number) => (e < LE ? e : LE + own[e - LE]);
    for (const c of p.control) {
      const n = input.nodes[node(c.node)];
      if (n.control !== c.from) { bad('stack-portal', `slice ${s.key}: node ${node(c.node)} (${n.x}, ${n.z}) is ${n.control}, not ${c.from} (another slice took this portal)`, n.x, n.z); continue; }
      n.control = c.control;
    }
    for (const t of p.traffic) input.edges[edge(t)].traffic = true;
    p.nodes.forEach((n, j) => { input.nodes.push({ ...n }); nodeOf.push({ slice: s.key, key: p.keys.nodes[j] }); });
    p.edges.forEach((e, j) => { input.edges.push({ ...e, a: node(e.a), b: node(e.b) }); edgeOf.push({ slice: s.key, key: p.keys.edges[j], art: p.extra[j].art }); });
    for (const r of p.roundabouts) roundabouts.push({ node: node(r.node), radius: r.radius, slice: s.key });
    input.footways.push(...p.footways);
  }

  // ---- Seams ----
  const removed = new Set<number>();
  const nodesAt = (x: number, z: number, slice: string) => input.nodes.flatMap((n, i) => (!removed.has(i) && nodeOf[i].slice === slice && hyp(n.x - x, n.z - z) < 0.01 ? [i] : []));
  const merge = (m: number, keep: number) => {
    for (const e of input.edges) { if (e.a === m) e.a = keep; if (e.b === m) e.b = keep; }
    for (const r of roundabouts) if (r.node === m) r.node = keep;
    removed.add(m);
  };
  const armsAt = (n: number) => input.edges.flatMap((e, i) => (e.a === n || e.b === n ? [{ cls: e.cls ?? 'R1', road: e.name, edge: i }] : []));
  const welds: Stack['welds'] = [], footways: Footway[] = [];
  for (const seam of seams) {
    const [first, second] = seam.slices;
    if (seam.kind === 'node') {
      const ids = [...nodesAt(seam.x, seam.z, first), ...nodesAt(seam.x, seam.z, second)];
      const found = new Set(ids.map((i) => nodeOf[i].slice));
      if (found.size < 2) { bad('seam-missing', `seam ${seam.id}: no road end of ${[first, second].filter((k) => !found.has(k)).join(' and ')} at (${seam.x}, ${seam.z})`, seam.x, seam.z); continue; }
      const keep = Math.min(...ids);
      for (const m of ids) if (m !== keep) merge(m, keep);
      input.nodes[keep].control = seam.control ?? controlOf(armsAt(keep));
      welds.push({ seam: seam.id, node: keep, cut: 0 });
    } else if (seam.kind === 'split') {
      const ends = nodesAt(seam.x, seam.z, first);
      let hit: { e: number; s: number } | null = null;
      input.edges.forEach((e, i) => {
        if (hit || edgeOf[i].slice !== second) return;
        const A = input.nodes[e.a], B = input.nodes[e.b], pts = [A.x, A.z, ...(e.via ?? []), B.x, B.z], h = polylineHit(pts, seam.x, seam.z);
        if (h.d < 0.01 && h.s > 0.5 && h.s < cumOf(pts).at(-1)! - 0.5) hit = { e: i, s: h.s };
      });
      if (!ends.length || !hit) { bad('seam-missing', `seam ${seam.id}: ${!ends.length ? `no road end of ${first}` : `no road of ${second} through`} (${seam.x}, ${seam.z})`, seam.x, seam.z); continue; }
      const { e, s } = hit as { e: number; s: number };
      const n = input.nodes.push({ x: seam.x, z: seam.z, control: 'none' }) - 1;
      nodeOf.push({ slice: second, key: `seam:${seam.id}` });
      const cut = splitEdge(input, edgeOf, e, s, n);
      for (const m of ends) merge(m, n);
      input.nodes[n].control = seam.control ?? controlOf(armsAt(n));
      welds.push({ seam: seam.id, node: n, cut });
    } else {
      const ends = nodesAt(seam.x, seam.z, first);
      if (!ends.length || !seam.to) { bad('seam-missing', `seam ${seam.id}: no hẻm end of ${first} at (${seam.x}, ${seam.z})`, seam.x, seam.z); continue; }
      const f = { ax: seam.x, az: seam.z, bx: seam.to.x, bz: seam.to.z };
      footways.push(f);
      input.footways.push(f);
      welds.push({ seam: seam.id, node: ends[0], cut: 0 });
    }
  }

  // ---- Drop the welded-away nodes and renumber ----
  const id = new Int32Array(input.nodes.length).fill(-1);
  let k = 0;
  input.nodes.forEach((_, i) => { if (!removed.has(i)) id[i] = k++; });
  input.nodes = input.nodes.filter((_, i) => !removed.has(i));
  const nodeOut = nodeOf.filter((_, i) => !removed.has(i));
  for (const e of input.edges) { e.a = id[e.a]; e.b = id[e.b]; }
  for (const r of roundabouts) r.node = id[r.node];
  for (const w of welds) w.node = id[w.node];
  input.phantoms = (input.phantoms ?? []).map((p) => ({ ...p, node: id[p.node] }));
  const graph = createRoadGraph(input), net = walkNet(graph.walkLegs());

  // ---- Seam trim: dressing near a seam that the welded roads displace ----
  const points = [...welds.map((w) => graph.nodes[w.node]), ...footways.flatMap((f) => [{ x: f.ax, z: f.az }, { x: f.bx, z: f.bz }])];
  const nearSeam = (x: number, z: number) => points.some((p) => hyp(p.x - x, p.z - z) < SEAM_TRIM);
  const trimmed: Trim[] = [];
  for (const s of slices) {
    for (const c of solidsOf(s)) {
      if (c.kind === 'building' || !nearSeam(c.cx, c.cz)) continue;
      const why = conflict(graph, net, c);
      if (why) trimmed.push({ slice: s.key, key: c.key, kind: c.kind, why: why.msg, x: r2(c.cx), z: r2(c.cz) });
    }
    for (const p of s.data.pois) {
      if (!nearSeam(p.x, p.z)) continue;
      const road = graph.edgeAt(p.x, p.z);
      if (road && road.edge.cls !== 'hem' && Math.abs(road.off) < road.edge.half - 0.1) trimmed.push({ slice: s.key, key: p.key, kind: `poi:${p.kind}`, why: `on the asphalt of ${road.edge.name}`, x: p.x, z: p.z });
    }
  }
  return { input, graph, nodeOf: nodeOut, edgeOf, roundabouts, welds, footways, trimmed, issues };
}

/**
 * The road input the live map builds from a stack: the links come out again (the ferry is a ride, not a road; its
 * island node stays as the end of the island's street) and today's phantom crosswalks at their anchors come back.
 * Node and edge ids after a link shift down; `edgeOf` and `nodeOf` filtered alike keep their order.
 */
export function liveInput(stack: Stack, legacy: RoadGraph) {
  const dropE = new Set(stack.edgeOf.flatMap((o, i) => (o.slice.startsWith('link:') ? [i] : [])));
  const input: RoadInput = { ...stack.input, nodes: stack.input.nodes.map((n) => ({ ...n })), edges: stack.input.edges.filter((_, i) => !dropE.has(i)).map((e) => ({ ...e })) };
  const anchors = new Set(stack.input.edges.flatMap((e, i) => (dropE.has(i) ? [e.a, e.b] : [])).filter((n) => n < legacy.nodes.length));
  input.phantoms = [...(stack.input.phantoms ?? []), ...legacy.phantoms.filter((p) => anchors.has(p.node)).map((p) => ({ ...p }))];
  // An island node is no fence end any more: a dead end of its street.
  for (const [i, o] of stack.nodeOf.entries()) if (o.slice.startsWith('link:') && input.nodes[i].control === 'fence-end') input.nodes[i].control = 'none';
  return { input, edgeOf: stack.edgeOf.filter((_, i) => !dropE.has(i)), nodeOf: stack.nodeOf };
}

/** A slice's solids for the cross-slice checks: its colliders and its parked motos (as the validator boxes them). */
function solidsOf(s: StackSlice): Solid[] {
  return [...s.data.colliders, ...s.data.scenery.parked.map((p): Solid => ({ cx: p.x, cz: p.z, hx: 0.31, hz: 0.87, yaw: p.yaw, top: 1.2, kind: 'moto', key: p.key }))];
}
/** Why a non-building solid cannot stand where it is on a graph (asphalt, a crosswalk, a walking line), as gen/validate.ts judges it; null when it can. */
function conflict(g: RoadGraph, net: WalkNet, s: Solid): { code: string; msg: string } | null {
  for (const h of g.edgesNear(s.cx, s.cz, Math.max(s.hx, s.hz) + 16)) {
    const e = h.edge, need = e.cls === 'hem' ? (s.kind === 'moto' || s.kind === 'table' ? HEM_CLEAR : e.half + 0.2) : e.half + 0.3;
    if (obbPolylineDist(s, e.pts) < need - 0.01) return { code: 'solid-on-asphalt', msg: `on the asphalt of ${e.name}` };
  }
  for (const c of g.crosswalks) if (Math.abs(c.ax - s.cx) < 30 && Math.abs(c.az - s.cz) < 30 && obbSegDist(s, c.ax, c.az, c.bx, c.bz) < PED + 0.1) return { code: 'solid-on-crosswalk', msg: 'on a crosswalk' };
  let leg = false;
  net.each(s, 1, (l) => (leg = obbSegDist(s, l.ax, l.az, l.bx, l.bz) < PED + 0.05));
  return leg ? { code: 'solid-on-walkway', msg: 'on a walking line' } : null;
}

/** Splits edge e at arc length s onto node n: the first part keeps its id, the second is appended. Bays clear the new junction. */
function splitEdge(input: RoadInput, edgeOf: Stack['edgeOf'], e: number, s: number, n: number) {
  const spec = input.edges[e], A = input.nodes[spec.a], B = input.nodes[spec.b];
  const pts = [A.x, A.z, ...(spec.via ?? []), B.x, B.z], cum = cumOf(pts);
  const via1: number[] = [], via2: number[] = [];
  for (let i = 1; i + 1 < cum.length; i++) (cum[i] < s ? via1 : via2).push(pts[i * 2], pts[i * 2 + 1]);
  const clear = CURB.junctionClear;
  let cut = 0;
  const bays1: NonNullable<EdgeSpec['bays']> = [], bays2: NonNullable<EdgeSpec['bays']> = [];
  for (const b of spec.bays ?? []) {
    const p = { ...b, s1: Math.min(b.s1, s - clear) }, q = { ...b, s0: Math.max(b.s0, s + clear) - s, s1: b.s1 - s };
    if (p.s1 - p.s0 > 1) bays1.push({ ...p, s0: r2(p.s0), s1: r2(p.s1) });
    if (q.s1 - q.s0 > 1) bays2.push({ ...q, s0: r2(q.s0), s1: r2(q.s1) });
    if (b.s0 < s + clear && b.s1 > s - clear) cut++;
  }
  input.edges[e] = { ...spec, b: n, via: via1, bays: bays1 };
  input.edges.push({ ...spec, a: n, via: via2, bays: bays2 });
  edgeOf.push({ ...edgeOf[e], key: `${edgeOf[e].key}:${r2(s)}` });
  return cut;
}

/**
 * Cross-slice checks on a stack (each slice already passes gen/validate.ts on its own graph). Returns the problems
 * found; empty when the slices fit together.
 */
export function validateStack(stack: Stack, slices: readonly StackSlice[], seams: readonly Seam[]): Issue[] {
  const out: Issue[] = [...stack.issues];
  const bad = (code: string, msg: string, x?: number, z?: number) => { if (out.length < 400) out.push({ code, msg, x, z }); };
  const g = stack.graph, sliceOf = (e: RoadEdge) => stack.edgeOf[e.id].slice;
  const isSlice = (k: string) => k !== 'legacy' && !k.startsWith('link:');
  const welded = new Set(stack.welds.map((w) => w.node));
  const footwaySeam = (x: number, z: number) => seams.some((s) => s.kind === 'footway' && hyp(s.x - x, s.z - z) < 0.01);

  // ---- Land: no two slices build on the same dry ground (1 m samples, water left out). ----
  const wet = (polys: number[][], x: number, z: number) => polys.some((p) => inPoly(p, x, z));
  for (let i = 0; i < slices.length; i++) for (let j = i + 1; j < slices.length; j++) {
    const a = slices[i].layout, b = slices[j].layout, A = bbox(a.bounds), B = bbox(b.bounds);
    const x0 = Math.max(A.minX, B.minX), x1 = Math.min(A.maxX, B.maxX), z0 = Math.max(A.minZ, B.minZ), z1 = Math.min(A.maxZ, B.maxZ);
    if (x0 >= x1 || z0 >= z1) continue;
    const waters = [...(a.waterways ?? []), ...(b.waterways ?? [])].map((w) => w.poly);
    let n = 0, at: Point | null = null;
    for (let x = Math.floor(x0) + 0.5; x < x1; x += 1) for (let z = Math.floor(z0) + 0.5; z < z1; z += 1) {
      if (inPoly(a.bounds, x, z) && inPoly(b.bounds, x, z) && !wet(waters, x, z)) { n++; at ??= { x, z }; }
    }
    if (n) bad('slice-overlap', `${a.key} and ${b.key} both build on about ${n} m² of land`, at!.x, at!.z);
  }

  // ---- Seams: straight-on welds keep one cross-section; no unwelded ends meet or stop short of another slice. ----
  for (const w of stack.welds) {
    const seam = seams.find((s) => s.id === w.seam)!;
    if (seam.kind === 'footway') continue;
    const n = g.nodes[w.node], arms = n.arms.map((a) => g.edges[a.edge]);
    if (!seam.slices.every((k) => arms.some((e) => sliceOf(e) === k))) bad('seam-arms', `seam ${seam.id}: the node at (${n.x}, ${n.z}) lacks an arm of ${seam.slices.find((k) => !arms.some((e) => sliceOf(e) === k))}`, n.x, n.z);
    if (seam.kind === 'node' && arms.length === 2) {
      const [p, q] = arms;
      if (p.cls !== q.cls || p.half !== q.half || p.sidewalk !== q.sidewalk || p.walk !== q.walk) bad('seam-section', `seam ${seam.id}: ${p.name} (${p.cls}, half ${p.half}, sidewalk ${p.sidewalk}) meets ${q.name} (${q.cls}, half ${q.half}, sidewalk ${q.sidewalk})`, n.x, n.z);
    }
  }
  for (const n of g.nodes) {
    const own = stack.nodeOf[n.id].slice;
    if (!isSlice(own)) continue;
    for (const m of g.nodes) if (m.id > n.id && isSlice(stack.nodeOf[m.id].slice) && stack.nodeOf[m.id].slice !== own && hyp(m.x - n.x, m.z - n.z) < 0.5) bad('seam-unwelded', `${own} and ${stack.nodeOf[m.id].slice} both end a road at (${n.x}, ${n.z}) with no seam`, n.x, n.z);
    if (n.arms.length !== 1 || n.control === 'fence-end' || welded.has(n.id) || footwaySeam(n.x, n.z)) continue;
    const near = g.edgesNear(n.x, n.z, 30, (e) => isSlice(sliceOf(e)) && sliceOf(e) !== own).find((h) => h.d < h.edge.half + h.edge.sidewalk + 16);
    if (near) bad('seam-gap', `${g.edges[n.arms[0].edge].name} (${own}) stops ${r2(near.d)} m from ${near.edge.name} (${sliceOf(near.edge)}) with no seam`, n.x, n.z);
  }

  // ---- Roads: no two slices' streets cross between nodes or run on one another (a road built twice). ----
  const ends = (e: RoadEdge) => [e.a, e.b];
  for (const e of g.edges) {
    if (!isSlice(sliceOf(e))) continue;
    for (const h of g.edgesNear(e.pts[0], e.pts[1], e.len + 40)) {
      const f = h.edge;
      if (f.id <= e.id || !isSlice(sliceOf(f)) || sliceOf(f) === sliceOf(e)) continue;
      const shared = ends(e).filter((n) => ends(f).includes(n));
      const x = crossing(e.pts, f.pts, shared.map((n) => g.nodes[n]));
      if (x) bad('edge-crossing', `${e.name} (${sliceOf(e)}) crosses ${f.name} (${sliceOf(f)}) with no node`, x[0], x[1]);
    }
    for (let s = 1; s < e.len; s += 2) {
      const p = g.pointAt(e, s);
      if ([e.a, e.b].some((n) => hyp(g.nodes[n].x - p.x, g.nodes[n].z - p.z) < e.half + 24)) continue;
      const dup = g.edgesNear(p.x, p.z, 12, (f) => isSlice(sliceOf(f)) && sliceOf(f) !== sliceOf(e)).find((h) => h.d < Math.max(h.edge.half, e.half));
      if (dup) { bad('road-duplicate', `${e.name} (${sliceOf(e)}) runs on ${dup.edge.name} (${sliceOf(dup.edge)})`, p.x, p.z); break; }
    }
  }
  const seen = new Uint8Array(g.nodes.length), queue = [0];
  seen[0] = 1;
  while (queue.length) { const n = queue.pop()!; for (const arm of g.nodes[n].arms) { const e = g.edges[arm.edge], m = e.a === n ? e.b : e.a; if (!seen[m]) { seen[m] = 1; queue.push(m); } } }
  for (const e of g.edges) if (!seen[e.a]) bad('edge-disconnected', `${e.name} (${sliceOf(e)}) is not connected to today's roads in the stack`, e.pts[0], e.pts[1]);

  // ---- Junctions the seams made: no sharp arms, no overlong crosswalks. ----
  for (const id of welded) {
    const n = g.nodes[id];
    if (!n || n.arms.length < 3) continue;
    for (let i = 0; i < n.arms.length; i++) {
      const a = n.arms[i], b = n.arms[(i + 1) % n.arms.length], gap = i + 1 < n.arms.length ? b.angle - a.angle : b.angle + 2 * Math.PI - a.angle;
      if (gap < Math.PI / 6) bad('junction-angle', `${g.edges[a.edge].name} and ${g.edges[b.edge].name} meet at ${Math.round((gap * 180) / Math.PI)}°`, n.x, n.z);
    }
  }
  for (const c of g.crosswalks) {
    if (c.edge < 0 || !welded.has(c.node)) continue;
    const e = g.edges[c.edge], len = hyp(c.bx - c.ax, c.bz - c.az);
    if (len > 3 * e.walk) bad('crosswalk-long', `the crosswalk over ${e.name} at a seam is ${r2(len)} m long`, (c.ax + c.bx) / 2, (c.az + c.bz) / 2);
  }

  // ---- Decks: none stands over another slice's road. ----
  const maxHalf = g.edges.reduce((m, e) => Math.max(m, e.half), 0);
  for (const s of slices) for (const d of s.data.decks) {
    const lo = d.s0 - d.ramp, hi = d.s1 + d.ramp, cum = cumOf(d.pts);
    let hit = false;
    for (let t = Math.max(0, lo) + 0.25; t < Math.min(cum.at(-1)!, hi) && !hit; t += 0.5) {
      if (d.yHint * Math.min(1, (t - lo) / d.ramp, (hi - t) / d.ramp) < 0.05) continue;
      const p = along(d.pts, cum, t);
      for (const o of [-d.half, 0, d.half]) {
        const x = p.x - p.hz * o, z = p.z + p.hx * o;
        const under = g.edgesNear(x, z, maxHalf + 1, (e) => isSlice(sliceOf(e)) && sliceOf(e) !== s.key).find((h) => h.d < h.edge.half && !((h.s < 1e-6 && g.nodes[h.edge.a].arms.length > 1) || (h.s > h.edge.len - 1e-6 && g.nodes[h.edge.b].arms.length > 1)));
        if (under) { bad('deck-over-road', `deck ${d.id} (${s.key}) stands over ${under.edge.name} (${sliceOf(under.edge)})`, x, z); hit = true; break; }
      }
    }
  }

  // ---- Waterways: each slice's copy covers the same water as design 1's (extra vertices on its outline only). ----
  for (const s of slices) for (const w of s.layout.waterways ?? []) {
    const ref = WATERS.find((v) => v.id === w.id);
    if (!ref) { bad('water-unknown', `${s.key}: waterway ${w.id} is not one of design 1's`); continue; }
    const off = (p: number[], q: number[]) => { for (let k = 0; k < p.length; k += 2) if (polyEdgeDist(q, p[k], p[k + 1]) > 0.01) return [p[k], p[k + 1]]; return null; };
    const v = off(w.poly, ref.poly) ?? off(ref.poly, w.poly);
    if (v || Math.abs(Math.abs(polyArea(w.poly)) - Math.abs(polyArea(ref.poly))) > 1) bad('water-mismatch', `${s.key}: ${w.id} differs from design 1's outline`, v?.[0], v?.[1]);
  }

  // ---- Stamps: ids and mission anchors unique across slices; each story stamp built by the layout stamps.ts names. ----
  const stampIds = new Map<string, string>(), anchorIds = new Map<string, string>();
  for (const s of slices) for (const st of s.data.stamps) {
    if (stampIds.has(st.id)) bad('stamp-duplicate', `stamp ${st.id} is built by ${stampIds.get(st.id)} and ${s.key}`, st.x, st.z);
    stampIds.set(st.id, s.key);
    if (st.anchor) { if (anchorIds.has(st.anchor)) bad('anchor-duplicate', `anchor ${st.anchor} is in ${anchorIds.get(st.anchor)} and ${s.key}`, st.x, st.z); anchorIds.set(st.anchor, s.key); }
  }
  for (const st of STORY_STAMPS) {
    if (st.form !== 'building' || !st.layout) continue;
    const s = slices.find((x) => x.layout.key === st.layout);
    if (s && !s.data.stamps.some((o) => o.id === st.id && o.building >= 0)) bad('story-stamp', `${st.layout} does not build story stamp ${st.id}`, st.x, st.z);
  }
  for (const s of slices) for (const st of s.data.stamps) {
    const story = STORY_STAMPS.find((x) => x.id === st.id);
    if (story && story.layout !== s.layout.key) bad('story-stamp', `${s.key} builds story stamp ${st.id}, which stamps.ts gives to ${story.layout}`, st.x, st.z);
  }

  // ---- Solids of every slice (the seam trim left out) against the welded graph and each other. ----
  type Tagged = Solid & { slice: string };
  const trim = new Set(stack.trimmed.map((t) => stackKey(t.slice, t.key)));
  const solids: Tagged[] = slices.flatMap((s) => solidsOf(s).filter((c) => !trim.has(stackKey(s.key, c.key))).map((c) => ({ ...c, slice: s.key })));
  const index = createCollisionIndex();
  for (const s of solids) index.addBox(s.cx, s.cz, s.hx, s.hz, s.yaw, -Infinity, s.top, 0, s);
  const grid = boxGrid(solids);
  const legs = g.walkLegs(), net = walkNet(legs);
  const spawn = net.nearest(12.6, 12.4), main = spawn >= 0 ? net.comp(spawn) : -1;
  const onMain = (x: number, z: number) => { const l = net.nearest(x, z, 0.08); return l >= 0 && net.comp(l) === main; };
  const allWater = slices.flatMap((s) => (s.layout.waterways ?? []).map((w) => w.poly));
  const pathClear = (ax: number, az: number, bx: number, bz: number, r = PED) => {
    const n = Math.max(1, Math.ceil(hyp(bx - ax, bz - az) / 0.25));
    for (let i = 0; i <= n; i++) { const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n; if (!index.clear(x, z, r) || wet(allWater, x, z)) return false; }
    return true;
  };
  solids.forEach((s) => {
    grid.near(s, (o) => { if (o.slice !== s.slice && o.slice < s.slice && obbOverlap(s, o, 0.01)) bad(s.kind === 'building' && o.kind === 'building' ? 'building-overlap' : 'solid-overlap', `${s.key} (${s.slice}) overlaps ${o.key} (${o.slice})`, s.cx, s.cz); });
    if (s.kind === 'building') {
      for (const h of g.edgesNear(s.cx, s.cz, hyp(s.hx, s.hz) + 20, (e) => sliceOf(e) !== s.slice && isSlice(sliceOf(e)))) {
        const need = h.edge.cls === 'hem' ? h.edge.half + 0.2 : h.edge.half + h.edge.sidewalk - 0.05;
        if (corridorHit(g, h.edge.id, s, need)) { bad('building-on-road', `${s.key} (${s.slice}) reaches ${h.edge.name} (${sliceOf(h.edge)})`, s.cx, s.cz); break; }
      }
      return;
    }
    const why = conflict(g, net, s);
    if (why) bad(why.code, `${s.key} (${s.slice}, ${s.kind}) is ${why.msg} in the stack`, s.cx, s.cz);
  });
  // Trimmed dressing stays near its seam and few (a seam that displaces a street's worth is a layout problem).
  for (const t of stack.trimmed) if (!stack.welds.some((w) => hyp(g.nodes[w.node].x - t.x, g.nodes[w.node].z - t.z) < SEAM_TRIM + 10)) bad('trim-far', `${t.key} (${t.slice}) is trimmed far from any seam`, t.x, t.z);
  const perSlice = new Map<string, number>();
  for (const t of stack.trimmed) perSlice.set(t.slice, (perSlice.get(t.slice) ?? 0) + 1);
  for (const [k, n] of perSlice) if (n > 4 * seams.length) bad('trim-many', `${n} pieces of ${k}'s dressing give way to other slices' roads`);

  // ---- Doors, seats and footways: on the welded walking network that leads to today's map, their ways clear. ----
  for (const s of slices) {
    for (const b of s.data.buildings) {
      if (!onMain(b.curb.x, b.curb.z)) bad('door-unreachable', `${b.name} (${s.key} ${b.key}): curb (${b.curb.x}, ${b.curb.z}) is off the stacked walking network`, b.door.x, b.door.z);
      else if (!pathClear(b.door.x, b.door.z, b.curb.x, b.curb.z)) bad('door-blocked', `${b.name} (${s.key} ${b.key}): the way from its door is blocked in the stack`, b.door.x, b.door.z);
    }
    for (const p of s.data.pois) {
      if (trim.has(stackKey(s.key, p.key))) continue;
      const road = g.edgeAt(p.x, p.z);
      if (road && road.edge.cls !== 'hem' && Math.abs(road.off) < road.edge.half - 0.1) bad('poi-on-road', `${p.key} (${s.key}) is on the asphalt of ${road.edge.name} in the stack`, p.x, p.z);
      if (!onMain(p.curb.x, p.curb.z)) bad('poi-unreachable', `${p.key} (${s.key}): curb off the stacked walking network`, p.x, p.z);
      else if (!pathClear(p.x, p.z, p.curb.x, p.curb.z, 0.3)) bad('poi-path-blocked', `${p.key} (${s.key}): the way to its curb is blocked in the stack`, p.x, p.z);
    }
    for (const h of s.data.hems) for (const k of [0, 1] as const) {
      if (h.ends[k] >= 0 || h.joins[k] !== null) continue;
      const x = k ? h.pts[h.pts.length - 2] : h.pts[0], z = k ? h.pts[h.pts.length - 1] : h.pts[1];
      const street = g.edgesNear(x, z, 30, (e) => e.cls !== 'hem' && isSlice(sliceOf(e)) && sliceOf(e) !== s.key).find((r) => r.d < r.edge.half + r.edge.sidewalk + 2);
      if (street) bad('hem-open-end', `${h.name} (${s.key}) ends on the sidewalk of ${street.edge.name} (${sliceOf(street.edge)}) with no mouth`, x, z);
    }
  }
  for (const f of g.footways) {
    if (!pathClear(f.ax, f.az, f.bx, f.bz, 0.4)) bad('footway-blocked', `the footway (${f.ax}, ${f.az})-(${f.bx}, ${f.bz}) is blocked in the stack`, (f.ax + f.bx) / 2, (f.az + f.bz) / 2);
    for (const [x, z] of [[f.ax, f.az], [f.bx, f.bz]]) if (!onMain(x, z)) bad('footway-unjoined', `the footway end (${r2(x)}, ${r2(z)}) is off the stacked walking network`, x, z);
  }
  return out;
}

/** Totals of a stack's slices (DistrictData.stats summed), for the budget checks. */
export function stackTotals(slices: readonly StackSlice[]) {
  const t = { slices: slices.length, landM2: 0, buildings: 0, colliders: 0, instances: 0, signs: 0, glyphs: 0, pois: 0, trees: 0, lamps: 0, props: 0, parked: 0, hems: 0, ms: 0 };
  for (const s of slices) {
    const st = s.data.stats;
    for (const k of ['landM2', 'buildings', 'colliders', 'instances', 'signs', 'glyphs', 'pois', 'trees', 'lamps', 'props', 'parked', 'hems', 'ms'] as const) t[k] += st[k];
  }
  t.instances = Math.round(t.instances);
  t.ms = r2(t.ms);
  return t;
}

// ---- helpers (as gen/validate.ts, which keeps its own private) ----

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
function bbox(poly: readonly number[]): Bounds {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let k = 0; k < poly.length; k += 2) { b.minX = Math.min(b.minX, poly[k]); b.maxX = Math.max(b.maxX, poly[k]); b.minZ = Math.min(b.minZ, poly[k + 1]); b.maxZ = Math.max(b.maxZ, poly[k + 1]); }
  return b;
}
function along(pts: readonly number[], cum: readonly number[], s: number) {
  let i = 0;
  while (i + 2 < cum.length && cum[i + 1] < s) i++;
  const k = i * 2, dx = pts[k + 2] - pts[k], dz = pts[k + 3] - pts[k + 1], l = cum[i + 1] - cum[i] || 1, t = Math.max(0, Math.min(1, (s - cum[i]) / l));
  return { x: pts[k] + dx * t, z: pts[k + 1] + dz * t, hx: dx / l, hz: dz / l };
}
/** Where two polylines cross or one ends on the other away from the nodes they share, or null. */
function crossing(p: readonly number[], q: readonly number[], shared: Point[]): [number, number] | null {
  for (let i = 0; i + 3 < p.length; i += 2) for (let j = 0; j + 3 < q.length; j += 2) {
    const hit = segCross(p[i], p[i + 1], p[i + 2], p[i + 3], q[j], q[j + 1], q[j + 2], q[j + 3]);
    if (!hit) continue;
    const x = p[i] + (p[i + 2] - p[i]) * hit[0], z = p[i + 1] + (p[i + 3] - p[i + 1]) * hit[0];
    if (!shared.some((n) => hyp(n.x - x, n.z - z) < 0.5)) return [x, z];
  }
  return null;
}
/** A box within `need` of an edge's centre line; ends at a junction are cut square (validate.ts corridorHit). */
function corridorHit(g: RoadGraph, edgeId: number, b: OBB, need: number) {
  const e = g.edges[edgeId];
  if (obbPolylineDist(b, e.pts) >= need) return false;
  const flatA = g.nodes[e.a].arms.length > 1, flatB = g.nodes[e.b].arms.length > 1;
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  for (const [u0, v0, u1, v1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    const n = Math.max(1, Math.ceil((Math.abs(u1 - u0) * b.hx + Math.abs(v1 - v0) * b.hz) / 0.5));
    for (let i = 0; i <= n; i++) {
      const u = (u0 + ((u1 - u0) * i) / n) * b.hx, v = (v0 + ((v1 - v0) * i) / n) * b.hz;
      const h = polylineHit(e.pts, b.cx + c * u + s * v, b.cz - s * u + c * v);
      if (h.d >= need) continue;
      if ((h.s < 1e-6 && flatA) || (h.s > e.len - 1e-6 && flatB)) continue;
      return true;
    }
  }
  return false;
}
type WalkNet = ReturnType<typeof walkNet>;
/** Walk legs joined into components (shared end points, and ends on another leg's middle). */
function walkNet(legs: WalkLeg[]) {
  const parent = legs.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number) => { const p = find(a), q = find(b); if (p !== q) parent[Math.max(p, q)] = Math.min(p, q); };
  const CELL = 16, cells = new Map<string, number[]>();
  legs.forEach((l, i) => {
    for (let ix = Math.floor(Math.min(l.ax, l.bx) / CELL); ix <= Math.floor(Math.max(l.ax, l.bx) / CELL); ix++) for (let iz = Math.floor(Math.min(l.az, l.bz) / CELL); iz <= Math.floor(Math.max(l.az, l.bz) / CELL); iz++) {
      const k = `${ix}:${iz}`;
      (cells.get(k) ?? (cells.set(k, []), cells.get(k)!)).push(i);
    }
  });
  const around = (x: number, z: number, r: number, fn: (i: number) => boolean | void) => {
    const done = new Set<number>();
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      for (const i of cells.get(`${ix}:${iz}`) ?? []) { if (done.has(i)) continue; done.add(i); if (fn(i)) return; }
    }
  };
  legs.forEach((l, i) => { for (const [x, z] of [[l.ax, l.az], [l.bx, l.bz]]) around(x, z, 0.1, (j) => { if (j !== i && segDist(x, z, legs[j].ax, legs[j].az, legs[j].bx, legs[j].bz) < 0.06) join(i, j); }); });
  return {
    comp: (i: number) => find(i),
    nearest(x: number, z: number, maxD = 30) {
      let best = -1, bd = maxD;
      around(x, z, maxD, (j) => { const d = segDist(x, z, legs[j].ax, legs[j].az, legs[j].bx, legs[j].bz); if (d < bd) { bd = d; best = j; } });
      return best;
    },
    each(b: OBB, pad: number, fn: (l: WalkLeg) => boolean) { around(b.cx, b.cz, hyp(b.hx, b.hz) + pad, (j) => fn(legs[j])); },
  };
}
function boxGrid<T extends OBB>(solids: T[]) {
  const CELL = 8, cells = new Map<string, T[]>();
  for (const s of solids) {
    const b = boxOf(s);
    for (let ix = Math.floor(b.minX / CELL); ix <= Math.floor(b.maxX / CELL); ix++) for (let iz = Math.floor(b.minZ / CELL); iz <= Math.floor(b.maxZ / CELL); iz++) {
      const k = `${ix}:${iz}`;
      (cells.get(k) ?? (cells.set(k, []), cells.get(k)!)).push(s);
    }
  }
  return {
    near(s: T, fn: (o: T) => void) {
      const b = boxOf(s), done = new Set<T>();
      for (let ix = Math.floor(b.minX / CELL); ix <= Math.floor(b.maxX / CELL); ix++) for (let iz = Math.floor(b.minZ / CELL); iz <= Math.floor(b.maxZ / CELL); iz++) {
        for (const o of cells.get(`${ix}:${iz}`) ?? []) if (o !== s && !done.has(o)) { done.add(o); fn(o); }
      }
    },
  };
}
