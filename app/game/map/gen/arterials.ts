/**
 * Generator v2, step 1: the authored streets of a layout become road-graph nodes and edges. Polylines are split
 * where they cross or where one ends on another, ends within 1 m share a node, ends on a portal (a fence end of
 * today's map) become that legacy node and a street running through a portal is cut there, every node gets a
 * control (signal where boulevards and R1 roads meet, priority at minor and hẻm mouths, none elsewhere, or the
 * author's hint), and the stretches over water become bridge decks. A portal off a fence end, a legacy node on a
 * street that does not join it and a ramp with no room before its node are issues. Hẻm the block pass carves are
 * attached later (attachHems), splitting the streets at their mouths.
 */
import { ROAD_CLASSES, type Bay, type Control, type Lane, type RoadClass, type RoadGraph } from '../roads.ts';
import { pointKey } from '../rng.ts';
import { CURB, type ArterialSpec, type CurbRules, type CurbUse, type DistrictLayout, type JunctionHint } from '../layout/types.ts';
import { hyp, polylineAt, polylineHit, polylineInside, polylineLength, polylineSlice, r2, segCross } from './geom.ts';

export type NetNode = {
  key: string; x: number; z: number; control: Control;
  /** The legacy node this is (portals), or -1. */
  legacy: number; portal: string | null;
  /** Roundabout radius from a junction hint (kept as data until roads.ts expands roundabouts), else 0. */
  roundabout: number;
};
/** A water-only deck on an edge: from s0 to s1 (arc length on this edge) the deck stands `yHint` high; ramps run `ramp` metres past each end. */
export type EdgeDeck = { bridge: string; name: string; water: string; s0: number; s1: number; yHint: number; ramp: number };
export type NetEdge = {
  key: string; a: number; b: number; pts: number[]; len: number;
  /** Arterial id (generated hẻm: 'hem:<key>'). */
  art: string; name: string; cls: RoadClass;
  half: number; sidewalk: number; walk: number;
  fwd?: Lane[]; back?: Lane[]; speed: number; traffic: boolean; oneWay: 0 | 1 | -1;
  curb: [CurbUse, CurbUse]; bus: boolean; closedHours: [number, number] | null;
  decks: EdgeDeck[]; bays: Bay[];
  /** Generated hẻm: the block that carved it. */
  block: string | null;
};
/** An arterial stretch over water with no bridge for it (validator error). */
export type WetSpan = { art: string; water: string; x: number; z: number };
export type Net = {
  nodes: NetNode[]; edges: NetEdge[];
  /** The authored arterials after portal snapping (house numbers measure along these). */
  arts: Map<string, ArterialSpec & { len: number }>;
  wet: WetSpan[];
  /** Problems found while building (unknown portals, bridges over nothing). */
  issues: string[];
  curb: CurbRules;
};

const MERGE = 1;
const MOTO_W: Record<RoadClass, number> = { R1: 2.4, R2: 1.6, hem: 1.4 };

/** Lanes for a cross-section the class defaults do not cover (more lanes, wider asphalt, one-way, curb bays). */
export function lanesFor(cls: RoadClass, half: number, lanes: number, oneWay: 0 | 1 | -1, bayR: number, bayL: number): { fwd: Lane[]; back: Lane[] } {
  const mw = MOTO_W[cls];
  if (cls === 'hem') {
    const off = Math.min(0.8, half * 0.46);
    return { fwd: [{ dir: 1, off, w: Math.min(1.4, half), use: 'moto' }], back: [{ dir: -1, off, w: Math.min(1.4, half), use: 'moto' }] };
  }
  const side = (dir: 1 | -1, from: number, to: number, n: number): Lane[] => {
    // From `from` (left edge, offset to the right of travel) to `to` (right edge): n car lanes, then the moto lane.
    const avail = to - from - mw;
    let k = Math.max(1, n);
    while (k > 1 && avail / k < 2.6) k--;
    const w = Math.max(2.4, Math.min(3.6, avail / k)), out: Lane[] = [];
    for (let i = 0; i < k; i++) out.push({ dir, off: r2(from + w * (i + 0.5)), w: r2(w), use: 'car' });
    out.push({ dir, off: r2(Math.min(to - mw / 2, from + w * k + mw / 2)), w: mw, use: 'moto' });
    return out;
  };
  if (oneWay) {
    const lanesOne = side(oneWay, -half + 0.2 + (oneWay > 0 ? bayL : bayR), half - 0.2 - (oneWay > 0 ? bayR : bayL), Math.max(1, lanes) * 2);
    return oneWay > 0 ? { fwd: lanesOne, back: [] } : { fwd: [], back: lanesOne };
  }
  return { fwd: side(1, 0.15, half - 0.2 - bayR, lanes), back: side(-1, 0.15, half - 0.2 - bayL, lanes) };
}

/** Walking-line offset for a cross-section (design 1: asphalt half + min(1.4, sidewalk / 2); hẻm: the centre line). */
export const walkOf = (cls: RoadClass, half: number, sidewalk: number) => (cls === 'hem' ? 0 : r2(half + Math.min(1.4, sidewalk / 2)));

export function buildArterials(layout: DistrictLayout, legacy: RoadGraph): Net {
  const issues: string[] = [];
  const curb: CurbRules = { ...CURB, ...layout.curb };
  const nodes: NetNode[] = [];
  const grid = new Map<string, number[]>();
  const cellOf = (x: number, z: number) => `${Math.floor(x / 4)}:${Math.floor(z / 4)}`;
  function nodeAt(x: number, z: number, make = true): number {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    let best = -1, bd = MERGE;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const id of grid.get(`${cx + i}:${cz + j}`) ?? []) { const d = hyp(nodes[id].x - x, nodes[id].z - z); if (d <= bd) { bd = d; best = id; } }
    }
    if (best >= 0 || !make) return best;
    nodes.push({ key: pointKey(x, z), x: r2(x), z: r2(z), control: 'none', legacy: -1, portal: null, roundabout: 0 });
    const k = cellOf(x, z);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(nodes.length - 1);
    return nodes.length - 1;
  }
  // Portals: legacy nodes first, at their exact coordinates. Only a fence end (a stub running into today's fence)
  // may lead on: anywhere else the district would rewire a junction of today's map.
  for (const p of layout.portals) {
    let hit = -1;
    legacy.nodes.forEach((n) => { if (hyp(n.x - p.x, n.z - p.z) <= MERGE) hit = n.id; });
    if (hit < 0) { issues.push(`portal ${p.id}: no legacy node within ${MERGE} m of (${p.x}, ${p.z})`); continue; }
    const L = legacy.nodes[hit], id = nodeAt(L.x, L.z);
    if (L.control !== 'fence-end' || L.arms.length !== 1) issues.push(`portal ${p.id}: legacy node ${hit} (${L.x}, ${L.z}) is not a fence end`);
    Object.assign(nodes[id], { x: L.x, z: L.z, key: pointKey(L.x, L.z), legacy: hit, portal: p.id, control: L.control });
  }

  // Arterials: snap their ends onto portals and onto other arterials they end against (T junctions).
  const arts = new Map<string, ArterialSpec & { len: number }>();
  const list = layout.arterials.map((a) => ({ ...a, pts: a.pts.slice() }));
  for (const a of list) {
    if (arts.has(a.id)) issues.push(`arterial ${a.id}: duplicate id`);
    for (const end of [0, a.pts.length - 2]) {
      const x = a.pts[end], z = a.pts[end + 1];
      const portal = layout.portals.find((p) => p.road === a.id && hyp(p.x - x, p.z - z) <= MERGE);
      if (portal) {
        const n = nodes.find((m) => m.portal === portal.id);
        if (n) { a.pts[end] = n.x; a.pts[end + 1] = n.z; }
        continue;
      }
      for (const n of legacy.nodes) if (hyp(n.x - x, n.z - z) <= MERGE) issues.push(`arterial ${a.id}: ends on legacy node ${n.id} without a portal`);
      for (const b of list) {
        if (b === a) continue;
        const h = polylineHit(b.pts, x, z);
        if (h.d > 1e-6 && h.d <= 0.75) { a.pts[end] = h.x; a.pts[end + 1] = h.z; }
      }
    }
  }
  for (const a of list) arts.set(a.id, { ...a, len: polylineLength(a.pts) });

  // Split points along every arterial: its ends, its crossings with the others, ends of others lying on it, and
  // the portals it runs through. A legacy node on a street's line that is not a portal is never joined to it.
  const cuts = list.map((a) => [0, polylineLength(a.pts)]);
  list.forEach((a, i) => {
    const len = cuts[i][1];
    for (const n of legacy.nodes) {
      const h = polylineHit(a.pts, n.x, n.z);
      if (h.d > MERGE || h.s <= MERGE || h.s >= len - MERGE) continue;
      if (nodes.some((m) => m.legacy === n.id)) cuts[i].push(h.s);
      else issues.push(`arterial ${a.id}: passes legacy node ${n.id} (${n.x}, ${n.z}) without a portal`);
    }
  });
  const segs: { i: number; k: number; s: number; l: number; ax: number; az: number; bx: number; bz: number }[] = [];
  list.forEach((a, i) => {
    let run = 0;
    for (let k = 0; k + 3 < a.pts.length; k += 2) {
      const l = hyp(a.pts[k + 2] - a.pts[k], a.pts[k + 3] - a.pts[k + 1]);
      segs.push({ i, k, s: run, l, ax: a.pts[k], az: a.pts[k + 1], bx: a.pts[k + 2], bz: a.pts[k + 3] });
      run += l;
    }
  });
  for (let p = 0; p < segs.length; p++) {
    const P = segs[p];
    for (let q = p + 1; q < segs.length; q++) {
      const Q = segs[q];
      if (P.i === Q.i && Math.abs(P.k - Q.k) <= 2) continue;
      if (Math.max(P.ax, P.bx) < Math.min(Q.ax, Q.bx) - 0.01 || Math.max(Q.ax, Q.bx) < Math.min(P.ax, P.bx) - 0.01) continue;
      if (Math.max(P.az, P.bz) < Math.min(Q.az, Q.bz) - 0.01 || Math.max(Q.az, Q.bz) < Math.min(P.az, P.bz) - 0.01) continue;
      const hit = segCross(P.ax, P.az, P.bx, P.bz, Q.ax, Q.az, Q.bx, Q.bz);
      if (!hit) continue;
      cuts[P.i].push(P.s + hit[0] * P.l);
      cuts[Q.i].push(Q.s + hit[1] * Q.l);
    }
  }

  // Nodes at the cuts, then one edge per stretch between consecutive cuts.
  const edges: NetEdge[] = [];
  const wet: WetSpan[] = [];
  list.forEach((a, i) => {
    const c = cuts[i].sort((p, q) => p - q).filter((s, k, all) => k === 0 || s - all[k - 1] > 0.5);
    const len = polylineLength(a.pts);
    if (len - c[c.length - 1] > 1e-6 && len - c[c.length - 1] <= 0.5) c[c.length - 1] = len;
    const ids = c.map((s) => { const p = polylineAt(a.pts, s); return nodeAt(p.x, p.z); });
    const spec = ROAD_CLASSES[a.cls];
    const half = a.half ?? spec.half, sidewalk = a.cls === 'hem' ? 0 : a.sidewalk ?? spec.sidewalk;
    const curbUse = a.curb ?? (a.cls === 'hem' ? ['none', 'none'] as [CurbUse, CurbUse] : ['moto', 'moto'] as [CurbUse, CurbUse]);
    const bayR = curbUse[0] === 'car' && half >= curb.carBayMinHalf ? curb.bayDepth : 0, bayL = curbUse[1] === 'car' && half >= curb.carBayMinHalf ? curb.bayDepth : 0;
    const custom = a.half !== undefined || a.lanes !== undefined || !!a.oneWay || bayR > 0 || bayL > 0;
    const lanes = custom ? lanesFor(a.cls, half, a.lanes ?? 1, a.oneWay ?? 0, bayR, bayL) : null;
    for (let k = 0; k + 1 < c.length; k++) {
      if (ids[k] === ids[k + 1]) continue;
      const pts = polylineSlice(a.pts, c[k], c[k + 1]);
      const A = nodes[ids[k]], B = nodes[ids[k + 1]];
      pts[0] = A.x; pts[1] = A.z; pts[pts.length - 2] = B.x; pts[pts.length - 1] = B.z;
      edges.push({
        key: `${a.id}:${A.key}>${B.key}`, a: ids[k], b: ids[k + 1], pts: pts.map(r2), len: polylineLength(pts),
        art: a.id, name: a.name, cls: a.cls, half, sidewalk, walk: walkOf(a.cls, half, sidewalk),
        fwd: lanes?.fwd, back: lanes?.back, speed: a.speed ?? (a.lanes && a.lanes > 1 ? spec.speed + 2 : spec.speed),
        traffic: a.traffic ?? true, oneWay: a.oneWay ?? 0, curb: curbUse, bus: !!a.bus, closedHours: a.closedHours ?? null,
        decks: [], bays: [], block: null,
      });
    }
  });

  // Decks: stretches over water need a bridge for that arterial and waterway.
  for (const e of edges) {
    for (const w of layout.waterways ?? []) {
      for (const [s0, s1] of polylineInside(e.pts, w.poly)) {
        const bridge = (layout.bridges ?? []).find((b) => b.road === e.art && b.over === w.id);
        if (!bridge) { const m = polylineAt(e.pts, (s0 + s1) / 2); wet.push({ art: e.art, water: w.id, x: r2(m.x), z: r2(m.z) }); continue; }
        e.decks.push({ bridge: bridge.id, name: bridge.name, water: w.id, s0: r2(s0), s1: r2(s1), yHint: bridge.yHint, ramp: bridge.ramp ?? r2(Math.max(4, bridge.yHint / 0.067)) });
      }
    }
  }
  for (const b of layout.bridges ?? []) {
    if (!edges.some((e) => e.decks.some((d) => d.bridge === b.id))) issues.push(`bridge ${b.id}: arterial ${b.road} does not cross waterway ${b.over}`);
  }
  // A ramp must come down before its street's node: past it the deck would stand over a junction (or end in the air).
  const armsAt = (id: number) => edges.filter((e) => e.a === id || e.b === id).length + (nodes[id].legacy >= 0 ? legacy.nodes[nodes[id].legacy].arms.length : 0);
  for (const e of edges) {
    for (const d of e.decks) {
      for (const [over, id] of [[d.ramp - d.s0, e.a], [d.s1 + d.ramp - e.len, e.b]] as const) {
        if (over <= 1e-6) continue;
        const n = nodes[id];
        issues.push(armsAt(id) > 1 ? `bridge ${d.bridge}: ramp runs ${r2(over)} m onto the junction at (${n.x}, ${n.z})` : `bridge ${d.bridge}: ramp runs ${r2(over)} m past the end of ${e.art} at (${n.x}, ${n.z})`);
      }
    }
  }
  // Bays: car bays where the asphalt is wide enough, loading bays where asked; clear of nodes and decks.
  for (const e of edges) {
    e.curb.forEach((use, i) => {
      const side: 1 | -1 = i === 0 ? 1 : -1;
      if (use === 'car' && e.half < curb.carBayMinHalf) { issues.push(`arterial ${e.art}: car bays need asphalt half-width >= ${curb.carBayMinHalf} (has ${e.half})`); return; }
      if (use !== 'car' && use !== 'loading') return;
      let s0 = curb.junctionClear, s1 = e.len - curb.junctionClear;
      for (const d of e.decks) { if (d.s0 - d.ramp < s1 && d.s1 + d.ramp > s0) { if (d.s0 - d.ramp - s0 > s1 - d.s1 - d.ramp) s1 = d.s0 - d.ramp; else s0 = d.s1 + d.ramp; } }
      if (s1 - s0 >= 6) e.bays.push({ side, s0: r2(s0), s1: r2(s1), depth: curb.bayDepth, kind: use === 'car' ? 'car' : 'loading' });
    });
  }
  const net: Net = { nodes, edges, arts, wet, issues, curb };
  classify(net, legacy, layout.junctions ?? []);
  return net;
}

/** Arms at a node: the net's edges plus, at a portal, the legacy edges already there. */
function armsAt(net: Net, legacy: RoadGraph, id: number) {
  const n = net.nodes[id], arms: { cls: RoadClass; road: string }[] = [];
  for (const e of net.edges) if (e.a === id || e.b === id) arms.push({ cls: e.cls, road: e.art });
  if (n.legacy >= 0) for (const arm of legacy.nodes[n.legacy].arms) arms.push({ cls: legacy.edges[arm.edge].cls, road: `legacy:${legacy.edges[arm.edge].name}` });
  return arms;
}

/** Node control: the author's hint, else signals where R1 roads meet, priority where a smaller road joins, none on bends and ends. */
export function classify(net: Net, legacy: RoadGraph, hints: JunctionHint[]) {
  net.nodes.forEach((n, id) => {
    const arms = armsAt(net, legacy, id);
    const hint = hints.find((h) => hyp(h.x - n.x, h.z - n.z) <= 4);
    if (hint) {
      n.control = hint.control === 'roundabout' ? 'priority' : hint.control;
      n.roundabout = hint.control === 'roundabout' ? hint.radius ?? 14 : 0;
      return;
    }
    const roads = new Set(arms.map((a) => a.road));
    if (arms.length <= 2 || roads.size < 2) { n.control = 'none'; return; }
    const classes = new Set(arms.map((a) => a.cls));
    n.control = classes.has('hem') ? 'priority' : classes.size === 1 ? (classes.has('R1') ? 'signal' : 'none') : 'priority';
  });
}

/** A hẻm a block carves: its centre line, half-width and the street (or other hẻm) each end joins. */
export type HemPlan = {
  key: string; block: string; pts: number[]; half: number; name: string; kind: 'spine' | 'connector' | 'through' | 'branch';
  /** Per end (0: first point, 1: last): the street edge (index into net.edges at planning time) it meets, or -1. */
  ends: [number, number];
  /** Per end: the hẻm (key) it meets, or null. */
  joins: [string | null, string | null];
};

/**
 * Adds the blocks' hẻm to the network: streets are split at every hẻm mouth (mouths within 3 m share a node,
 * control priority), hẻm that meet a spine split it, and each hẻm stretch becomes a 'hem' edge carrying motos
 * only (AI traffic stays out; the player's motorbike escape route).
 */
export function attachHems(net: Net, plans: HemPlan[]) {
  type Cut = { s: number; node: number };
  const cutsOf = new Map<string, Cut[]>();
  const ends = plans.map(() => [-1, -1]);
  /**
   * The node where a hẻm meets line `k` (street 'e<i>' or hẻm key) at arc length s; mouths within `merge` metres
   * share one (3 m on a street, where the hẻm bends to it inside the sidewalk; on a hẻm, with no sidewalk to bend
   * in, only mouths that coincide: two hẻm a little apart make two T junctions rather than a sliver).
   */
  const add = (k: string, s: number, x: number, z: number, control: Control, merge = 3) => {
    const list = cutsOf.get(k) ?? (cutsOf.set(k, []), cutsOf.get(k)!);
    const near = list.find((c) => Math.abs(c.s - s) < merge);
    if (near) return near.node;
    net.nodes.push({ key: pointKey(x, z), x: r2(x), z: r2(z), control, legacy: -1, portal: null, roundabout: 0 });
    list.push({ s, node: net.nodes.length - 1 });
    return net.nodes.length - 1;
  };
  const byKey = new Map(plans.map((p, i) => [p.key, i]));
  const endPt = (p: HemPlan, end: 0 | 1) => (end ? [p.pts[p.pts.length - 2], p.pts[p.pts.length - 1]] : [p.pts[0], p.pts[1]]);
  // Mouths on streets first (a mouth within 3 m of a street's end node uses that node), then hẻm meeting hẻm.
  plans.forEach((p, i) => {
    for (const end of [0, 1] as const) {
      const ei = p.ends[end];
      if (ei < 0) continue;
      const [x, z] = endPt(p, end), e = net.edges[ei], h = polylineHit(e.pts, x, z);
      const merge = e.cls === 'hem' ? 0.5 : 3;
      ends[i][end] = h.s < merge ? e.a : h.s > e.len - merge ? e.b : add(`e${ei}`, h.s, h.x, h.z, 'priority', merge);
    }
  });
  // Free ends (dead ends) get their own node; a hẻm joining another near its end shares that end's node.
  plans.forEach((p, i) => {
    for (const end of [0, 1] as const) if (ends[i][end] < 0 && (p.joins[end] === null || !byKey.has(p.joins[end]!))) ends[i][end] = addEnd(net, ...endPt(p, end) as [number, number]);
  });
  for (let pass = 0; pass < 3; pass++) {
    plans.forEach((p, i) => {
      for (const end of [0, 1] as const) {
        const other = p.joins[end], j = other === null ? undefined : byKey.get(other);
        if (j === undefined || ends[i][end] >= 0) continue;
        const [x, z] = endPt(p, end), h = polylineHit(plans[j].pts, x, z), len = polylineLength(plans[j].pts);
        if (h.s < 1.5 || h.s > len - 1.5) { const n = ends[j][h.s < 1.5 ? 0 : 1]; if (n >= 0) ends[i][end] = n; continue; }
        ends[i][end] = add(other!, h.s, h.x, h.z, 'none');
      }
    });
  }
  plans.forEach((p, i) => { for (const end of [0, 1] as const) if (ends[i][end] < 0) ends[i][end] = addEnd(net, ...endPt(p, end) as [number, number]); });
  // Split the streets.
  const out: NetEdge[] = [];
  net.edges.forEach((e, ei) => {
    const cuts = (cutsOf.get(`e${ei}`) ?? []).sort((p, q) => p.s - q.s);
    if (!cuts.length) { out.push(e); return; }
    let s = 0, a = e.a;
    for (const c of [...cuts, { s: e.len, node: e.b }]) {
      const pts = polylineSlice(e.pts, s, c.s);
      pts[0] = net.nodes[a].x; pts[1] = net.nodes[a].z; pts[pts.length - 2] = net.nodes[c.node].x; pts[pts.length - 1] = net.nodes[c.node].z;
      out.push({
        ...e, key: `${e.art}:${net.nodes[a].key}>${net.nodes[c.node].key}`, a, b: c.node, pts: pts.map(r2), len: polylineLength(pts),
        decks: e.decks.filter((d) => d.s1 > s && d.s0 < c.s).map((d) => ({ ...d, s0: r2(d.s0 - s), s1: r2(d.s1 - s) })),
        bays: e.bays.filter((b) => b.s1 > s && b.s0 < c.s).map((b) => ({ ...b, s0: r2(Math.max(0, b.s0 - s)), s1: r2(Math.min(c.s - s, b.s1 - s)) })),
      });
      s = c.s; a = c.node;
    }
  });
  // The hẻm themselves, split where others join them.
  plans.forEach((p, i) => {
    const len = polylineLength(p.pts), first = ends[i][0], last = ends[i][1];
    const cuts = (cutsOf.get(p.key) ?? []).filter((c) => c.s > 0.5 && c.s < len - 0.5).sort((x, y) => x.s - y.s);
    let s = 0, a = first;
    for (const c of [...cuts, { s: len, node: last }]) {
      let pts = polylineSlice(p.pts, s, c.s);
      // A mouth that shares a node with another (or a street end) bends only inside the street: the hẻm keeps its
      // line up to the frontage, then turns to the node.
      const bend = (end: 0 | 1, node: number) => {
        const ei = p.ends[end], k = end ? pts.length - 2 : 0, n = net.nodes[node];
        if (ei < 0 || hyp(pts[k] - n.x, pts[k + 1] - n.z) < 0.05) return;
        const e = net.edges[ei], step = e.half + e.sidewalk, q = end ? pts.length - 4 : 2;
        const dx = pts[q] - pts[k], dz = pts[q + 1] - pts[k + 1], l = hyp(dx, dz);
        if (l <= step + 0.5) return;
        const fx = pts[k] + (dx / l) * step, fz = pts[k + 1] + (dz / l) * step;
        pts = end ? [...pts.slice(0, -2), fx, fz, pts[k], pts[k + 1]] : [pts[0], pts[1], fx, fz, ...pts.slice(2)];
      };
      if (s === 0) bend(0, a);
      if (c.s === len) bend(1, c.node);
      pts[0] = net.nodes[a].x; pts[1] = net.nodes[a].z; pts[pts.length - 2] = net.nodes[c.node].x; pts[pts.length - 1] = net.nodes[c.node].z;
      const l = polylineLength(pts);
      if (l > 0.3 && a !== c.node) {
        const lanes = lanesFor('hem', p.half, 1, 0, 0, 0);
        out.push({
          key: `hem:${p.key}:${net.nodes[a].key}>${net.nodes[c.node].key}`, a, b: c.node, pts: pts.map(r2), len: l,
          art: `hem:${p.key}`, name: p.name, cls: 'hem', half: p.half, sidewalk: 0, walk: 0, fwd: lanes.fwd, back: lanes.back,
          speed: ROAD_CLASSES.hem.speed, traffic: false, oneWay: 0, curb: ['none', 'none'], bus: false, closedHours: null, decks: [], bays: [], block: p.block,
        });
      }
      s = c.s; a = c.node;
    }
  });
  net.edges = out;
}
function addEnd(net: Net, x: number, z: number) {
  net.nodes.push({ key: pointKey(x, z), x: r2(x), z: r2(z), control: 'none', legacy: -1, portal: null, roundabout: 0 });
  return net.nodes.length - 1;
}

/** A 32 m grid over the network's edges: which edges pass near a point (results in a reused array). */
export function edgeGrid(edges: readonly NetEdge[]) {
  const CELL = 32, cells = new Map<number, number[]>();
  const key = (ix: number, iz: number) => (ix + 4096) * 8192 + iz + 4096;
  edges.forEach((e, id) => {
    const m = e.half + e.sidewalk + 2;
    for (let k = 0; k + 3 < e.pts.length; k += 2) {
      const x0 = Math.floor((Math.min(e.pts[k], e.pts[k + 2]) - m) / CELL), x1 = Math.floor((Math.max(e.pts[k], e.pts[k + 2]) + m) / CELL);
      const z0 = Math.floor((Math.min(e.pts[k + 1], e.pts[k + 3]) - m) / CELL), z1 = Math.floor((Math.max(e.pts[k + 1], e.pts[k + 3]) + m) / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const list = cells.get(key(ix, iz)) ?? (cells.set(key(ix, iz), []), cells.get(key(ix, iz))!);
        if (list[list.length - 1] !== id) list.push(id);
      }
    }
  });
  const marks = new Uint32Array(edges.length), out: number[] = [];
  let stamp = 0;
  /** Edge indices whose cells a square of half-size r around (x, z) touches, into `out` (valid until the next call). */
  function near(x: number, z: number, r: number) {
    stamp++;
    out.length = 0;
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const list = cells.get(key(ix, iz));
        if (list) for (const id of list) if (marks[id] !== stamp) { marks[id] = stamp; out.push(id); }
      }
    }
    return out;
  }
  return { near };
}
