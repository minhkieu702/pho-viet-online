/**
 * The map validator (critique step 13): checks a generated district against the rules every layout must keep.
 * Buildings never overlap each other, a road (asphalt and sidewalk) or water (stilt houses over mud banks aside);
 * every door and every POI is reachable on foot from the walking network that leads to today's map, by a straight
 * clear path to its curb; no solid or parked moto stands on asphalt, a walking line or a crosswalk, or on another
 * (motos and stool tables in a hẻm keep its middle open); motos stay on the sidewalk band (or against a hẻm's
 * walls) and car bays only on wide asphalt; every new road edge stays inside the layout, off today's land, and
 * connects to the legacy graph through portals on fence ends, changing nothing else of today's graph; junctions
 * have no sharp angles or overlong crosswalks; hẻm never open onto a sidewalk without a mouth; bus routes have
 * stops; footways are clear; decks only over water, with a height, never over another road. Returns the problems
 * found (empty when the district is valid). Uses the game's own collision index for the clear-path tests.
 */
import { createCollisionIndex } from '../collision.ts';
import { LAND } from '../consts.ts';
import type { RoadEdge, RoadGraph, WalkLeg } from '../roads.ts';
import { CURB, type DistrictLayout } from '../layout/types.ts';
import type { DistrictData } from '../build-district.ts';
import { HEM_CLEAR, PED, type Solid } from './dressing.ts';
import { hyp, inPoly, obbOverlap, obbPointDist, obbPolylineDist, obbPolyOverlap, obbSegDist, polyEdgeDist, polylineHit, r2, segCross, segDist, type OBB } from './geom.ts';

export type Issue = { code: string; msg: string; x?: number; z?: number };

/** Arms at a junction meet at no less than this (radians); a crosswalk is at most this many times its road's walk-to-walk width. */
const MIN_ARM_ANGLE = (30 * Math.PI) / 180, CROSSWALK_STRETCH = 1.5;

export function validateDistrict(layout: DistrictLayout, data: DistrictData, legacy: RoadGraph): Issue[] {
  const out: Issue[] = [];
  const bad = (code: string, msg: string, x?: number, z?: number) => { if (out.length < 400) out.push({ code, msg, x, z }); };
  for (const m of data.issues) bad('generator', m);
  const g = data.graph, waters = layout.waterways ?? [];
  const wet = (x: number, z: number) => waters.some((w) => inPoly(w.poly, x, z));
  const base = data.graphPatch.base;
  const isNew = (edgeId: number) => edgeId >= base.edges;
  const artOf = (edgeId: number) => (isNew(edgeId) ? data.graphPatch.extra[edgeId - base.edges].art : `legacy:${edgeId}`);

  // ---- Road graph: joined to the legacy grid at fence ends named as portals, changing nothing else of it. ----
  const portalNodes = new Set<number>();
  for (const p of layout.portals) {
    for (const n of legacy.nodes) {
      if (hyp(n.x - p.x, n.z - p.z) > 1) continue;
      portalNodes.add(n.id);
      if (n.control !== 'fence-end' || n.arms.length !== 1) bad('portal-not-fence-end', `portal ${p.id} is on legacy node ${n.id}, which is not a fence end`, n.x, n.z);
    }
  }
  data.graphPatch.edges.forEach((e, i) => {
    for (const n of [e.a, e.b]) if (n < base.nodes && !portalNodes.has(n)) bad('edge-off-portal', `edge ${data.graphPatch.keys.edges[i]} joins legacy node ${n}, which is not a portal`);
  });
  for (const id of portalNodes) if (!data.graphPatch.edges.some((e) => e.a === id || e.b === id)) bad('portal-unused', `portal node ${id} has no district road`);
  for (const c of data.graphPatch.control) {
    const n = legacy.nodes[c.node];
    if (!portalNodes.has(c.node) || n.control !== 'fence-end' || (c.control !== 'none' && c.control !== 'priority')) bad('control-change', `legacy node ${c.node} goes from ${n.control} to ${c.control}`, n.x, n.z);
  }
  for (const t of data.graphPatch.traffic) {
    const e = legacy.edges[t];
    if (![e.a, e.b].some((n) => portalNodes.has(n) && legacy.nodes[n].arms.length === 1)) bad('traffic-change', `legacy edge ${t} (${e.name}) starts carrying traffic but is no portal's stub`, e.pts[0], e.pts[1]);
  }
  const seen = new Uint8Array(g.nodes.length), queue = [0];
  seen[0] = 1;
  while (queue.length) {
    const n = queue.pop()!;
    for (const arm of g.nodes[n].arms) { const e = g.edges[arm.edge], m = e.a === n ? e.b : e.a; if (!seen[m]) { seen[m] = 1; queue.push(m); } }
  }
  // Roads meet only at nodes: no two centre lines cross between their ends, and nothing ends on a road it does not
  // join (a legacy fence end on a new street's line counts as such an end).
  const newEdges = g.edges.filter((e) => isNew(e.id));
  for (const e of newEdges) {
    for (const h of g.edgesNear(e.pts[0], e.pts[1], e.len + 30)) {
      const f = h.edge;
      if (f.id <= e.id && isNew(f.id)) continue;
      if (f.a === e.a || f.a === e.b || f.b === e.a || f.b === e.b) continue;
      const fence: [boolean, boolean] = isNew(f.id) ? [false, false] : [g.nodes[f.a].control === 'fence-end', g.nodes[f.b].control === 'fence-end'];
      const x = crossing(e.pts, f.pts, fence);
      if (x) bad('edge-crossing', `${e.name} crosses ${f.name} with no node`, x[0], x[1]);
    }
  }
  for (const n of legacy.nodes) {
    if (portalNodes.has(n.id)) continue;
    const on = g.edgesNear(n.x, n.z, 16, (e) => isNew(e.id)).find((h) => h.d < h.edge.half);
    if (on) bad('legacy-node-on-road', `legacy node ${n.id} lies on ${on.edge.name}, which does not join it (no portal)`, n.x, n.z);
  }
  // New roads stay inside the layout's bounds and their corridors off today's land (the portal's own metre aside).
  const inLand = (x: number, z: number) => x > LAND.minX + 0.05 && x < LAND.maxX - 0.05 && z > LAND.minZ + 0.05 && z < LAND.maxZ - 0.05;
  for (const e of newEdges) {
    let outside = false, onLand = false;
    for (let s = 0; s <= e.len + 0.5 && !(outside && onLand); s += 1) {
      const p = g.pointAt(e, s), w = e.half + e.sidewalk;
      const atPortal = [e.a, e.b].some((n) => portalNodes.has(n) && hyp(g.nodes[n].x - p.x, g.nodes[n].z - p.z) < 1.01);
      if (!outside && !atPortal && !inPoly(layout.bounds, p.x, p.z) && polyEdgeDist(layout.bounds, p.x, p.z) > 0.5) { bad('road-outside', `${e.name} runs outside the layout bounds`, p.x, p.z); outside = true; }
      if (!onLand && [-w, 0, w].some((o) => inLand(p.x - p.hz * o, p.z + p.hx * o))) { bad('road-on-legacy-land', `${e.name} runs over today's map`, p.x, p.z); onLand = true; }
    }
  }
  for (const e of g.edges) if (isNew(e.id) && !seen[e.a]) bad('edge-disconnected', `edge ${e.name} (${e.id}) is not connected to today's roads`, e.pts[0], e.pts[1]);
  for (const e of g.edges) for (const b of e.bays) if (b.kind === 'car' && e.half < CURB.carBayMinHalf) bad('car-bay-narrow', `car bay on ${e.name} with asphalt half-width ${e.half}`, e.pts[0], e.pts[1]);

  // ---- Junction shape: no sharp angles between arms, no crosswalk far longer than the road it crosses. ----
  for (const n of g.nodes) {
    if (n.id < base.nodes && !portalNodes.has(n.id)) continue;
    if (n.arms.length >= 3) {
      for (let i = 0; i < n.arms.length; i++) {
        const a = n.arms[i], b = n.arms[(i + 1) % n.arms.length], gap = i + 1 < n.arms.length ? b.angle - a.angle : b.angle + 2 * Math.PI - a.angle;
        if (gap < MIN_ARM_ANGLE) bad('junction-angle', `${g.edges[a.edge].name} and ${g.edges[b.edge].name} meet at ${Math.round((gap * 180) / Math.PI)}°`, n.x, n.z);
      }
    }
  }
  for (const c of g.crosswalks) {
    if (c.edge < 0 || (c.node < base.nodes && !portalNodes.has(c.node))) continue;
    const e = g.edges[c.edge], len = hyp(c.bx - c.ax, c.bz - c.az);
    if (len > CROSSWALK_STRETCH * 2 * e.walk) bad('crosswalk-long', `the crosswalk over ${e.name} is ${r2(len)} m long (road ${r2(2 * e.walk)} m walk to walk)`, (c.ax + c.bx) / 2, (c.az + c.bz) / 2);
  }

  // ---- Bridges: water only under decks; decks over water, with a height, never over another road. ----
  for (const e of newEdges) {
    const key = data.graphPatch.keys.edges[e.id - base.edges], decks = data.decks.filter((d) => d.edge === key);
    for (let s = 0.5; s < e.len; s += 1) {
      const p = g.pointAt(e, s);
      if (!wet(p.x, p.z)) continue;
      const ok = decks.some((d) => { const h = polylineHit(d.pts, p.x, p.z); return h.d < 0.5 && h.s >= d.s0 - 0.6 && h.s <= d.s1 + 0.6; });
      if (!ok) { bad('road-in-water', `${e.name} runs over water without a deck`, p.x, p.z); break; }
    }
  }
  const maxHalf = g.edges.reduce((m, e) => Math.max(m, e.half), 0);
  for (const d of data.decks) {
    if (!(d.yHint > 0 && Number.isFinite(d.yHint))) bad('deck-height', `deck ${d.id} has no yHint`);
    const mid = midPoint(d.pts, (d.s0 + d.s1) / 2);
    if (!wet(mid.x, mid.z)) bad('deck-not-over-water', `deck ${d.id} is not over water`, mid.x, mid.z);
    // The whole deck as authored, ramps and all (past the edge's ends if a ramp is longer than the room there): any
    // other road's asphalt under a part of it above the ground is a deck over a road.
    const own = data.graphPatch.keys.edges.indexOf(d.edge) + base.edges, e = g.edges[own], art = artOf(own);
    const lo = d.from + d.s0 - d.ramp, hi = d.from + d.s1 + d.ramp;
    let hit = false;
    for (let s = lo + 0.25; s < hi && !hit; s += 0.5) {
      const y = d.yHint * Math.min(1, (s - lo) / d.ramp, (hi - s) / d.ramp);
      if (y < 0.05) continue;
      const p = spanPoint(g, e, s);
      for (const o of [-d.half, 0, d.half]) {
        const x = p.x - p.hz * o, z = p.z + p.hx * o;
        // A road's end at a junction is cut square (as corridorHit): its round cap there is the other roads' ground.
        const under = g.edgesNear(x, z, maxHalf + 1).find((h) => h.d < h.edge.half && artOf(h.edge.id) !== art && !((h.s < 1e-6 && g.nodes[h.edge.a].arms.length > 1) || (h.s > h.edge.len - 1e-6 && g.nodes[h.edge.b].arms.length > 1)));
        if (under) { bad('deck-over-road', `deck ${d.id} stands ${r2(y)} m over ${under.edge.name}`, x, z); hit = true; break; }
      }
    }
  }

  // ---- Walking network: components of the walk legs; the main one reaches today's map. ----
  const legs = g.walkLegs(), net = walkNet(legs);
  const spawn = net.nearest(12.6, 12.4), main = spawn >= 0 ? net.comp(spawn) : -1;
  const onMain = (x: number, z: number) => { const l = net.nearest(x, z, 0.08); return l >= 0 && net.comp(l) === main; };

  // ---- Solids: one collision index (buildings, props, motos) for clear-path tests. ----
  const index = createCollisionIndex();
  const solids: Solid[] = [...data.colliders, ...data.scenery.parked.map((p): Solid => ({ cx: p.x, cz: p.z, hx: 0.31, hz: 0.87, yaw: p.yaw, top: 1.2, kind: 'moto', key: p.key }))];
  solids.forEach((s) => index.addBox(s.cx, s.cz, s.hx, s.hz, s.yaw, -Infinity, s.top, 0, s));
  const pathClear = (ax: number, az: number, bx: number, bz: number, r = PED) => {
    const n = Math.max(1, Math.ceil(hyp(bx - ax, bz - az) / 0.25));
    for (let i = 0; i <= n; i++) { const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n; if (!index.clear(x, z, r) || wet(x, z)) return false; }
    return true;
  };
  const keys = new Map<string, number>();
  for (const s of solids) keys.set(s.key, (keys.get(s.key) ?? 0) + 1);
  for (const [k, n] of keys) if (n > 1) bad('duplicate-key', `${n} solids share the key ${k}`);

  // ---- Buildings ----
  const grid = boxGrid(solids);
  for (const b of data.buildings) {
    if (!inPoly(layout.bounds, b.box.cx, b.box.cz)) bad('building-outside', `${b.name} stands outside the layout bounds`, b.x, b.z);
    for (const e of g.edgesNear(b.box.cx, b.box.cz, hyp(b.box.hx, b.box.hz) + 20)) {
      const need = e.edge.cls === 'hem' ? e.edge.half + 0.2 : e.edge.half + e.edge.sidewalk - 0.05;
      if (corridorHit(g, e.edge.id, b.box, need)) { bad('building-on-road', `${b.name} (${b.key}) reaches ${e.edge.name}`, b.x, b.z); break; }
    }
    for (const w of waters) {
      if (!obbPolyOverlap(b.box, w.poly)) continue;
      const mud = w.bank === 'mud' || (w.banks ?? []).some((s) => s.kind === 'mud');
      if (b.typology !== 'stilt' || !mud || wet(b.door.x, b.door.z)) bad('building-in-water', `${b.name} (${b.key}) stands in ${w.name}`, b.x, b.z);
    }
    if (!onMain(b.curb.x, b.curb.z)) bad('door-unreachable', `${b.name} (${b.key}): curb (${b.curb.x}, ${b.curb.z}) is not on the walking network`, b.door.x, b.door.z);
    else if (!pathClear(b.door.x, b.door.z, b.curb.x, b.curb.z)) bad('door-blocked', `${b.name} (${b.key}): the way from the door to the curb is blocked`, b.door.x, b.door.z);
  }

  // ---- Solids and parked motos: off asphalt, walking lines, crosswalks and each other. ----
  const order = new Map(solids.map((s, i) => [s, i]));
  solids.forEach((s, i) => {
    grid.near(s, (o) => { if (order.get(o)! < i && obbOverlap(s, o, 0.01)) bad(s.kind === 'building' && o.kind === 'building' ? 'building-overlap' : 'solid-overlap', `${s.key} overlaps ${o.key}`, s.cx, s.cz); });
    if (s.kind === 'building') return;
    if (wet(s.cx, s.cz)) bad('solid-in-water', `${s.key} (${s.kind}) stands in the water`, s.cx, s.cz);
    for (const h of g.edgesNear(s.cx, s.cz, Math.max(s.hx, s.hz) + 16)) {
      // A hẻm's middle stays open; motos and stool tables may stand against its walls.
      const e = h.edge, need = e.cls === 'hem' ? (s.kind === 'moto' || s.kind === 'table' ? HEM_CLEAR : e.half + 0.2) : e.half + 0.3;
      if (obbPolylineDist(s, e.pts) < need - 0.01) { bad('solid-on-asphalt', `${s.key} (${s.kind}) is on the asphalt of ${e.name}`, s.cx, s.cz); break; }
    }
    // A crosswalk is its zebra (on the asphalt, kept clear above) and the walking path across it.
    for (const c of g.crosswalks) if (Math.abs(c.ax - s.cx) < 30 && Math.abs(c.az - s.cz) < 30 && obbSegDist(s, c.ax, c.az, c.bx, c.bz) < PED + 0.1) { bad('solid-on-crosswalk', `${s.key} (${s.kind}) is on a crosswalk`, s.cx, s.cz); break; }
    net.each(s, 1, (l) => { if (obbSegDist(s, l.ax, l.az, l.bx, l.bz) < PED + 0.05) { bad('solid-on-walkway', `${s.key} (${s.kind}) stands on a walking line`, s.cx, s.cz); return true; } return false; });
  });
  // Parked motos stand across the sidewalk band of the street they face (10.2–11.9 m from the centre of an R1 road),
  // or along a hẻm against its wall; two in a hẻm never stand side by side across it (2 m stay open beside each).
  const inHem: { e: RoadEdge; s: number; off: number; key: string }[] = [];
  for (const p of data.scenery.parked) {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const band = g.edgesNear(p.x, p.z, 30, (e) => e.cls !== 'hem').some((h) => {
      const front = h.edge.half + h.edge.sidewalk, d = Math.abs(h.off);
      return Math.abs(fx * h.hx + fz * h.hz) < 0.3 && d >= front - CURB.motoBand[0] - 0.06 && d <= front - CURB.motoBand[1] + 0.06;
    });
    const hem = band ? null : g.edgesNear(p.x, p.z, 4, (e) => e.cls === 'hem').find((h) => Math.abs(fx * h.hx + fz * h.hz) > 0.95 && Math.abs(Math.abs(h.off) - (h.edge.half - 0.35)) < 0.08);
    if (hem) inHem.push({ e: hem.edge, s: hem.s, off: hem.off, key: p.key });
    else if (!band) bad('moto-off-band', `${p.key} is not on the sidewalk band of the street it faces, nor against a hẻm wall`, p.x, p.z);
  }
  for (const a of inHem) for (const b of inHem) if (a.e === b.e && a.key < b.key && a.off * b.off < 0 && Math.abs(a.s - b.s) < 1.75) bad('hem-narrowed', `${a.key} and ${b.key} face each other across ${a.e.name}`, a.e.pts[0], a.e.pts[1]);

  // ---- POIs and seats ----
  for (const p of data.pois) {
    if (wet(p.x, p.z) || !inPoly(layout.bounds, p.x, p.z)) { bad('poi-wet', `${p.key} (${p.kind}) is in the water or outside`, p.x, p.z); continue; }
    let blocked = false;
    grid.nearPoint(p.x, p.z, 1, (o) => { if (obbPointDist(o, p.x, p.z) < 0.3) blocked = true; });
    if (blocked) bad('poi-blocked', `${p.key} (${p.kind}) stands inside a solid`, p.x, p.z);
    const road = g.edgeAt(p.x, p.z);
    if (road && road.edge.cls !== 'hem' && Math.abs(road.off) < road.edge.half - 0.1) bad('poi-on-road', `${p.key} (${p.kind}) is on the asphalt of ${road.edge.name}`, p.x, p.z);
    if (!onMain(p.curb.x, p.curb.z)) bad('poi-unreachable', `${p.key} (${p.kind}): curb (${p.curb.x}, ${p.curb.z}) is not on the walking network`, p.x, p.z);
    else if (!pathClear(p.x, p.z, p.curb.x, p.curb.z, 0.3)) bad('poi-path-blocked', `${p.key} (${p.kind}): the way to the curb is blocked`, p.x, p.z);
  }

  // ---- Footways (the gaps between houses): clear, and joined to the walking network at both ends. ----
  for (const f of data.graphPatch.footways) {
    if (!pathClear(f.ax, f.az, f.bx, f.bz, 0.4)) bad('footway-blocked', `the footway (${f.ax}, ${f.az})-(${f.bx}, ${f.bz}) is blocked`, (f.ax + f.bx) / 2, (f.az + f.bz) / 2);
    for (const [x, z] of [[f.ax, f.az], [f.bx, f.bz]]) if (!onMain(x, z)) bad('footway-unjoined', `the footway end (${x}, ${z}) is not on the walking network`, x, z);
  }
  // ---- Hẻm: an end with no mouth stops short of the street (a frontage lot closes it), never on its sidewalk. ----
  for (const h of data.hems) {
    for (const k of [0, 1] as const) {
      if (h.ends[k] >= 0 || h.joins[k] !== null) continue;
      const x = k ? h.pts[h.pts.length - 2] : h.pts[0], z = k ? h.pts[h.pts.length - 1] : h.pts[1];
      const street = g.edgesNear(x, z, 30, (e) => e.cls !== 'hem').find((r) => r.d < r.edge.half + r.edge.sidewalk + 2);
      if (street) bad('hem-open-end', `${h.name} (${h.key}) ends on the sidewalk of ${street.edge.name} with no mouth`, x, z);
    }
  }
  // ---- Stamps' other ways in (hatches, ladders): somewhere to stand in front of them. ----
  for (const st of data.stamps) for (const w of st.ways) if (wet(w.x, w.z) || !index.clear(w.x, w.z, PED)) bad('way-blocked', `${st.id}: its ${w.kind} at (${w.x}, ${w.z}) has no room to stand`, w.x, w.z);
  // ---- Bus routes: a stop on every route longer than 120 m. ----
  const routes = new Map<string, number>();
  data.graphPatch.extra.forEach((x, i) => { if (x.bus) routes.set(x.art, (routes.get(x.art) ?? 0) + g.edges[base.edges + i].len); });
  for (const [art, len] of routes) if (len > 120 && !data.scenery.props.some((p) => p.kind === 'shelter' && p.key.startsWith(`bus:${art}:`))) bad('bus-no-stop', `bus route ${art} (${Math.round(len)} m) has no stop`);
  return out;
}

/** A point at arc length s along an edge, carried on straight past either end along the end's direction. */
function spanPoint(g: RoadGraph, e: RoadEdge, s: number) {
  const p = g.pointAt(e, s), over = s < 0 ? s : s > e.len ? s - e.len : 0;
  return { x: p.x + p.hx * over, z: p.z + p.hz * over, hx: p.hx, hz: p.hz };
}

/**
 * Whether a box reaches within `need` of an edge's centre line. Ends at a junction are cut square (the ground past
 * the node belongs to the other roads there); a dead end keeps its round cap. Sampled every 0.5 m round the box.
 */
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

/**
 * Where two polylines cross or one ends on the other away from a shared node, or null. A touch at an end of p, or
 * at an end of q, is where they meet at a node; `qOpen` marks ends of q that join nothing new (legacy fence ends).
 */
function crossing(p: readonly number[], q: readonly number[], qOpen: [boolean, boolean]): [number, number] | null {
  for (let i = 0; i + 3 < p.length; i += 2) for (let j = 0; j + 3 < q.length; j += 2) {
    const hit = segCross(p[i], p[i + 1], p[i + 2], p[i + 3], q[j], q[j + 1], q[j + 2], q[j + 3]);
    if (!hit) continue;
    const x = p[i] + (p[i + 2] - p[i]) * hit[0], z = p[i + 1] + (p[i + 3] - p[i + 1]) * hit[0];
    const near = (pts: readonly number[], k: number) => hyp(pts[k] - x, pts[k + 1] - z) < 0.5;
    const atP = near(p, 0) || near(p, p.length - 2), atQ = (near(q, 0) && !qOpen[0]) || (near(q, q.length - 2) && !qOpen[1]);
    if (!atP && !atQ) return [x, z];
  }
  return null;
}

function midPoint(pts: readonly number[], s: number) {
  let run = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const dx = pts[k + 2] - pts[k], dz = pts[k + 3] - pts[k + 1], l = hyp(dx, dz);
    if (s <= run + l || k + 4 >= pts.length) { const t = l ? Math.max(0, Math.min(1, (s - run) / l)) : 0; return { x: pts[k] + dx * t, z: pts[k + 1] + dz * t }; }
    run += l;
  }
  return { x: pts[0], z: pts[1] };
}

/** Walk legs joined into components (shared end points, and ends that land on another leg's middle). */
function walkNet(legs: WalkLeg[]) {
  const parent = legs.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number) => { const p = find(a), q = find(b); if (p !== q) parent[Math.max(p, q)] = Math.min(p, q); };
  const CELL = 16, cells = new Map<string, number[]>();
  legs.forEach((l, i) => {
    for (let ix = Math.floor(Math.min(l.ax, l.bx) / CELL); ix <= Math.floor(Math.max(l.ax, l.bx) / CELL); ix++) {
      for (let iz = Math.floor(Math.min(l.az, l.bz) / CELL); iz <= Math.floor(Math.max(l.az, l.bz) / CELL); iz++) {
        const k = `${ix}:${iz}`;
        (cells.get(k) ?? (cells.set(k, []), cells.get(k)!)).push(i);
      }
    }
  });
  const around = (x: number, z: number, r: number, fn: (i: number) => boolean | void) => {
    const done = new Set<number>();
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      for (const i of cells.get(`${ix}:${iz}`) ?? []) { if (done.has(i)) continue; done.add(i); if (fn(i)) return; }
    }
  };
  legs.forEach((l, i) => {
    for (const [x, z] of [[l.ax, l.az], [l.bx, l.bz]]) around(x, z, 0.1, (j) => { if (j !== i && segDist(x, z, legs[j].ax, legs[j].az, legs[j].bx, legs[j].bz) < 0.06) join(i, j); });
  });
  return {
    comp: (i: number) => find(i),
    /** The leg nearest (x, z) within maxD, or -1. */
    nearest(x: number, z: number, maxD = 30) {
      let best = -1, bd = maxD;
      around(x, z, maxD, (j) => { const d = segDist(x, z, legs[j].ax, legs[j].az, legs[j].bx, legs[j].bz); if (d < bd) { bd = d; best = j; } });
      return best;
    },
    each(b: OBB, pad: number, fn: (l: WalkLeg) => boolean) {
      const r = hyp(b.hx, b.hz) + pad;
      around(b.cx, b.cz, r, (j) => fn(legs[j]));
    },
  };
}

/** A grid of solids for neighbour tests. */
function boxGrid(solids: Solid[]) {
  const CELL = 8, cells = new Map<string, Solid[]>();
  for (const s of solids) {
    const r = hyp(s.hx, s.hz);
    for (let ix = Math.floor((s.cx - r) / CELL); ix <= Math.floor((s.cx + r) / CELL); ix++) for (let iz = Math.floor((s.cz - r) / CELL); iz <= Math.floor((s.cz + r) / CELL); iz++) {
      const k = `${ix}:${iz}`;
      (cells.get(k) ?? (cells.set(k, []), cells.get(k)!)).push(s);
    }
  }
  const visit = (x0: number, x1: number, z0: number, z1: number, fn: (o: Solid) => void) => {
    const done = new Set<Solid>();
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      for (const o of cells.get(`${ix}:${iz}`) ?? []) if (!done.has(o)) { done.add(o); fn(o); }
    }
  };
  return {
    near: (s: Solid, fn: (o: Solid) => void) => { const r = hyp(s.hx, s.hz); visit(s.cx - r, s.cx + r, s.cz - r, s.cz + r, fn); },
    nearPoint: (x: number, z: number, r: number, fn: (o: Solid) => void) => visit(x - r, x + r, z - r, z + r, fn),
  };
}
