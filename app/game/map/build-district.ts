/**
 * Generator v2 (critique step 13): buildDistrict(layout, legacy) turns a hand-authored DistrictLayout into the
 * district's data, merged with the legacy road graph at its portals. Pure and deterministic: no three.js, no
 * globals, every random choice from a hash-keyed stream (rng.ts), each block from its own. Nothing here is wired
 * into the live map yet (step 14 does that); the validator (scripts/map-layout.test.mjs, gen/validate.ts) and the
 * preview read it.
 *
 * Order: arterials -> blocks (faces) -> stamps, fence lines, fixtures and bus stops (route level) -> per block: hẻm,
 * lots and the footways through their gaps, buildings, dressing -> hẻm into the graph -> power poles and fence panels
 * (edge level, after crosswalks exist) -> ids, hashes, stats.
 */
import { createRoadGraph, type Bay, type Control, type EdgeSpec, type Footway, type Lane, type NodeSpec, type RoadClass, type RoadGraph, type RoadInput } from './roads.ts';
import type { DistrictId } from './districts.ts';
import type { Point } from '../city.ts';
import { digest, hash01 } from './rng.ts';
import { STORY_STAMPS } from './stamps.ts';
import { BUS_SPACING, DEFAULT_STYLE, type BankKind, type DistrictLayout, type DistrictStyle, type FenceSpec, type StampWay } from './layout/types.ts';
import { attachHems, buildArterials, type HemPlan, type Net } from './gen/arterials.ts';
import { buildBlocks, type Block } from './gen/blocks.ts';
import { planBlock, type Lot, type Reserved } from './gen/lots.ts';
import { buildLots, buildStamp, hemArches, type Draft, type GenBuilding, type GenPlot, type GenSign, type Typology } from './gen/buildings.ts';
import { busStops, createPlacer, dressBlock, edgeLines, emptyDressing, mergeDressing, PED, polesFor, type Dressing, type GenPoi, type Line, type Placer, type Solid } from './gen/dressing.ts';
import { boxOf, hyp, inPoly, polyArea, polylineAt, polylineHit, polylineSlice, r2, r6 } from './gen/geom.ts';

/**
 * Road-graph changes a district makes: legacy nodes and edges keep their ids; new ones are appended. Ids from
 * `base` up are the patch's own (numbered as if applied straight onto the graph it was built against); applyPatch
 * moves them to wherever they land, so slices built alone against today's graph stack in any order.
 */
export type GraphPatch = {
  base: { nodes: number; edges: number };
  nodes: NodeSpec[]; edges: EdgeSpec[];
  /** Legacy nodes whose control changes (fence ends that now lead on), and what they were. */
  control: { node: number; control: Control; from: Control }[];
  /** Legacy edges that start carrying traffic (the stubs that ran into the fence). */
  traffic: number[];
  /** Stable keys of the appended nodes and edges (ids may shift when a layout changes; keys do not). */
  keys: { nodes: string[]; edges: string[] };
  roundabouts: { node: number; radius: number }[];
  /** Per appended edge: the generator's extra data (arterial id, curb use, bus route, closures, decks). */
  extra: { art: string; curb: [string, string]; bus: boolean; closedHours: [number, number] | null; block: string | null }[];
  /** Walking footways the district adds (the gaps between houses, design 1's R4 nav edges). */
  footways: Footway[];
};
export type WaterOut = { id: string; name: string; kind: string; poly: number[]; level: number | null; banks: { ax: number; az: number; bx: number; bz: number; kind: BankKind; nx: number; nz: number }[] };
/**
 * A water-only deck: the edge's centre line from ramp foot to ramp foot (`from`: the arc length on the edge where
 * it starts), the over-water stretch [s0, s1] along it, its height and half-width, and its outline (decks are
 * straight). A ramp longer than the room before its node is cut there (a generator issue).
 */
export type DeckOut = { id: string; name: string; edge: string; water: string; pts: number[]; from: number; s0: number; s1: number; len: number; yHint: number; ramp: number; half: number; poly: number[] };
export type DoorOut = { building: number; door: Point; curb: Point; facing: number };
export type StampOut = { id: string; kind: string; name: string; anchor: string | null; x: number; z: number; yaw: number; building: number; door: Point | null; ways: StampWay[] };
/** A fence as laid: its panels are props (kind = the fence's kind) and colliders; `gates` are its authored openings. */
export type FenceOut = { id: string; kind: 'fence' | 'wall'; h: number; panels: number; gates: { name: string; x: number; z: number; w: number }[] };
export type BlockOut = { key: string; zone: string; face: number[]; inner: number[] | null; area: number; buildings: number[]; hems: string[]; hash: string };
export type Stats = {
  ms: number; landM2: number; blocks: number; lots: number; buildings: number; hems: number; hemLength: number;
  byTypology: Record<string, number>; byZone: Record<string, number>; storeys: number;
  colliders: number; trees: number; lamps: number; props: number; parked: number; eateries: number; poles: number; pois: number; signs: number; glyphs: number;
  nodes: number; edges: number; instances: number; instancesPerM2: number; budget: number;
};
export type DistrictData = {
  district: DistrictId; layout: string; idBase: number;
  graphPatch: GraphPatch; graph: RoadGraph;
  waters: WaterOut[]; decks: DeckOut[];
  blocks: BlockOut[]; lots: Lot[]; hems: HemPlan[];
  buildings: GenBuilding[]; plots: GenPlot[]; doors: DoorOut[];
  colliders: Solid[];
  scenery: Omit<Dressing, 'pois' | 'solids'>;
  pois: (GenPoi & { id: number })[];
  /** Lamp heads (city.ts LAMPS shape) for light pools. */
  lamps: Point[];
  signs: GenSign[];
  stamps: StampOut[];
  fences: FenceOut[];
  stats: Stats; hash: string; blockHashes: Record<string, string>;
  /** Problems the generator met (unknown portals, unbridged water, stamps without a way in); the validator fails on any. */
  issues: string[];
};
export type BuildOptions = { idBase?: number; budget?: number };

/**
 * Instances per m² of land the renderer may spend on a district: design 2's Medium preset caps loaded instances at
 * 110k over 20–25 loaded 128 m chunks (about 0.3 per m²). Today's map is 34k instances on 0.134 km² (0.25).
 */
export const INSTANCE_BUDGET = 0.3;
const PER_STOREY: Partial<Record<Typology, [number, number]>> = {
  tube: [10, 8], stilt: [14, 8], shophouse: [12, 9], villa: [30, 10], 'market-hall': [60, 0], warehouse: [22, 0], pagoda: [70, 0], church: [70, 0], school: [50, 4], landmark: [40, 4], police: [40, 4], hospital: [40, 4],
};

export function buildDistrict(layout: DistrictLayout, legacy: RoadGraph, opts: BuildOptions = {}): DistrictData {
  const t0 = performance.now();
  const idBase = opts.idBase ?? 0;
  const style: DistrictStyle = { ...DEFAULT_STYLE, ...layout.style };
  const waters = (layout.waterways ?? []).map((w) => w.poly);
  const net = buildArterials(layout, legacy);
  const issues = [...net.issues, ...net.wet.map((w) => `arterial ${w.art} crosses waterway ${w.water} at (${w.x}, ${w.z}) with no bridge`)];
  const blocks = buildBlocks(layout, net);
  const faces = blocks.map((b) => b.face);

  // Lines every block keeps off: the authored streets' asphalt and walking lines, and the legacy roads near the district.
  const statics: Line[] = [];
  for (const e of net.edges) statics.push(...edgeLines(e));
  const bb = bbox(layout.bounds, 40);
  for (const e of legacy.edges) if (e.pts.some((v, k) => (k % 2 ? v >= bb.minZ && v <= bb.maxZ : v >= bb.minX && v <= bb.maxX))) statics.push(...edgeLines(e));
  const seedPlacer = (p: Placer, box: Box | null) => { for (const l of statics) if (!box || lineNear(l, box)) p.line(l); return p; };

  // Route level: stamps (authored buildings) and bus stops, before any block.
  const hemsByKey = new Map<string, HemPlan>();
  const G = seedPlacer(createPlacer(waters, layout.bounds), null);
  const doorCheck = (P: Placer) => (door: Point, curb: Point) => P.path(door.x, door.z, curb.x, curb.z) && P.stand(door.x, door.z, 0.3);
  const ctxFor = (P: Placer) => ({ layout, net, hems: hemsByKey, style, door: doorCheck(P) });
  const reserved: Reserved[] = [];
  // Stamp ids key their buildings and anchors key missions: both unique, and a story stamp's id is only its own.
  const ids = new Set<string>(), anchors = new Set<string>(), story = new Set<string>(STORY_STAMPS.map((s) => s.id));
  for (const s of layout.stamps ?? []) {
    if (ids.has(s.id)) issues.push(`stamp ${s.id}: duplicate id`);
    if (s.anchor && anchors.has(s.anchor)) issues.push(`stamp ${s.id}: duplicate anchor ${s.anchor}`);
    if ((story.has(s.id) || (s.anchor && story.has(s.anchor))) && (s.kind !== 'story' || s.anchor !== s.id)) issues.push(`stamp ${s.id}: uses story stamp ${story.has(s.id) ? s.id : s.anchor}'s id`);
    ids.add(s.id);
    if (s.anchor) anchors.add(s.anchor);
  }
  const stampDrafts: { id: string; draft: Draft | null }[] = [];
  const global = emptyDressing();
  for (const s of layout.stamps ?? []) {
    const box = { cx: s.x, cz: s.z, hx: s.w / 2, hz: s.d / 2, yaw: s.yaw };
    reserved.push({ box, pad: s.yard ?? 0 });
    if (s.kind === 'park') {
      const f = Math.sin(s.yaw), g = Math.cos(s.yaw), out: number[] = [];
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(r2(s.x + g * (s.w / 2) * i + f * (s.d / 2) * j), r2(s.z - f * (s.w / 2) * i + g * (s.d / 2) * j));
      global.parks.push(out);
      stampDrafts.push({ id: s.id, draft: null });
      continue;
    }
    const fx = s.x + Math.sin(s.yaw) * (s.d / 2 + 1), fz = s.z + Math.cos(s.yaw) * (s.d / 2 + 1);
    let best: { art: string; walk: number; d: number } | null = null;
    for (const e of net.edges) {
      const h = polylineHit(e.pts, fx, fz);
      if (!best || h.d < best.d) best = { art: e.art, walk: e.walk, d: h.d };
    }
    const draft = best ? buildStamp(ctxFor(G), s, best.art, best.walk) : null;
    if (!draft) issues.push(`stamp ${s.id}: no clear way from its door to a walking line`);
    else {
      global.solids.push(G.add({ ...draft.building.box, top: draft.building.h, kind: 'building', key: draft.building.key }));
      const { door, curb } = draft.building, len = hyp(curb.x - door.x, curb.z - door.z);
      G.line({ ax: door.x, az: door.z, bx: curb.x, bz: curb.z, clear: 0.55, kind: 'path' });
      // No lot may sit across the way in.
      if (len > 0.1) reserved.push({ box: { cx: (door.x + curb.x) / 2, cz: (door.z + curb.z) / 2, hx: 0.9, hz: len / 2 + 0.8, yaw: Math.atan2(curb.x - door.x, curb.z - door.z) }, pad: 0 });
      // Its other ways in (a hatch, a roof ladder) keep 1.2 m clear in front.
      for (const w of s.ways ?? []) {
        G.line({ ax: w.x, az: w.z, bx: w.x + Math.sin(w.yaw) * 1.2, bz: w.z + Math.cos(w.yaw) * 1.2, clear: PED + 0.1, kind: 'path' });
        reserved.push({ box: { cx: w.x, cz: w.z, hx: 0.8, hz: 0.8, yaw: w.yaw }, pad: 0.4 });
        if (!G.stand(w.x, w.z)) issues.push(`stamp ${s.id}: its ${w.kind} at (${w.x}, ${w.z}) has no room to stand`);
      }
    }
    stampDrafts.push({ id: s.id, draft });
  }
  // Fence lines: no lot, fixture or dressing on them (the panels go down last, see layFence).
  for (const f of layout.fences ?? []) {
    for (let k = 0; k + 3 < f.pts.length; k += 2) {
      const ax = f.pts[k], az = f.pts[k + 1], bx = f.pts[k + 2], bz = f.pts[k + 3], len = hyp(bx - ax, bz - az);
      G.line({ ax, az, bx, bz, clear: 0.35, kind: 'fence' });
      reserved.push({ box: { cx: (ax + bx) / 2, cz: (az + bz) / 2, hx: len / 2, hz: 0.1, yaw: Math.atan2(-(bz - az), bx - ax) }, pad: 0.6 });
    }
  }
  // Fixtures (port gear, yard stock): authored colliders, after the stamps and before anything generated.
  for (const f of layout.fixtures ?? []) {
    const box = { cx: f.x, cz: f.z, hx: f.w / 2, hz: f.d / 2, yaw: f.yaw }, key = `fx:${f.id}`, a = boxOf(box);
    if (!G.free(box, 0.05)) issues.push(`fixture ${f.id}: does not fit at (${f.x}, ${f.z}) (a road, a walking line, water, a building or another fixture)`);
    global.solids.push(G.add({ ...box, top: f.h, kind: 'prop', key }));
    global.props.push({ key, kind: f.kind, x: f.x, z: f.z, sx: r2(a.maxX - a.minX), sz: r2(a.maxZ - a.minZ), yaw: f.yaw, tint: r2(hash01(layout.key, 'fixture', f.id)), w: f.w, d: f.d, variant: 0, hours: null });
    reserved.push({ box, pad: 0.6 });
  }
  mergeDressing(global, busStops(layout.key, net, G, BUS_SPACING, faces));
  for (const s of global.solids) if (s.kind === 'prop') reserved.push({ box: s, pad: 0.3 });

  // Blocks: hẻm and lots (all planned before any hẻm enters the graph), then buildings and dressing.
  const plans = blocks.map((b) => planBlock(layout, net, b, reserved));
  for (const p of plans) for (const h of p.hems) hemsByKey.set(h.key, h);
  const perBlock: { block: Block; drafts: Draft[]; dress: Dressing; arches: GenSign[] }[] = [];
  for (const plan of plans) {
    const box = bbox(plan.block.face, 20), P = seedPlacer(createPlacer(waters, layout.bounds), box);
    for (const s of G.solids) if (inBox(boxOf(s), box)) P.add(s);
    for (const l of G.lines) if ((l.kind === 'path' || l.kind === 'fence') && lineNear(l, box)) P.line(l);
    for (const h of plan.hems) for (const l of edgeLines({ pts: h.pts, half: h.half, walk: 0, cls: 'hem' })) P.line(l);
    for (const f of plan.footways) P.line({ ...f, clear: PED + 0.1, kind: 'path' });
    const drafts = buildLots(ctxFor(P), plan.block.key, plan.lots);
    const dress = dressBlock({ layoutKey: layout.key, net, hems: hemsByKey, style, placer: P }, plan.block, plan.lots, drafts.map((d) => d.building));
    perBlock.push({ block: plan.block, drafts, dress, arches: hemArches(net, plan.hems) });
  }

  // Hẻm into the network, the merged graph, then the edge-level dressing that must see the crosswalks.
  const hems = plans.flatMap((p) => p.hems);
  attachHems(net, hems);
  const graphPatch = makePatch(net, legacy, plans.flatMap((p) => p.footways));
  const graph = createRoadGraph(applyPatch(inputOf(legacy), graphPatch));
  const E = seedPlacer(createPlacer(waters, layout.bounds), null);
  for (const s of G.solids) E.add(s);
  for (const l of G.lines) if (l.kind === 'path') E.line(l);
  for (const { dress } of perBlock) for (const s of dress.solids) E.add(s);
  for (const { dress } of perBlock) for (const p of dress.parked) E.add({ cx: p.x, cz: p.z, hx: 0.31, hz: 0.87, yaw: p.yaw, top: 1.2, kind: 'moto', key: p.key });
  for (const { drafts } of perBlock) for (const d of drafts) { E.add({ ...d.building.box, top: d.building.h, kind: 'building', key: d.building.key }); E.line({ ax: d.building.door.x, az: d.building.door.z, bx: d.building.curb.x, bz: d.building.curb.z, clear: 0.55, kind: 'path' }); }
  for (const { dress } of perBlock) for (const p of dress.pois) E.line({ ax: p.x, az: p.z, bx: p.curb.x, bz: p.curb.z, clear: 0.55, kind: 'path' });
  for (const h of hems) for (const l of edgeLines({ pts: h.pts, half: h.half, walk: 0, cls: 'hem' })) E.line(l);
  for (const f of graphPatch.footways) E.line({ ...f, clear: PED + 0.1, kind: 'path' });
  for (const c of graph.crosswalks) E.line({ ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, clear: 1.6, kind: 'cross' });
  const poles = polesFor(layout.key, net, E);
  // Fences last: they must find their whole line clear (their gates aside).
  const fenceDress = emptyDressing(), fences = (layout.fences ?? []).map((f) => layFence(layout.key, f, E, fenceDress, issues));

  // Ids: stamps first, then blocks in key order.
  const buildings: GenBuilding[] = [], plots: GenPlot[] = [], doors: DoorOut[] = [], signs: GenSign[] = [], stamps: StampOut[] = [];
  const addDraft = (d: Draft) => {
    const id = idBase + buildings.length;
    buildings.push({ ...d.building, id } as GenBuilding);
    plots.push({ ...d.plot, id } as GenPlot);
    doors.push({ building: id, door: d.building.door, curb: d.building.curb, facing: d.building.facing });
    signs.push(...d.signs);
    return id;
  };
  for (const [i, s] of (layout.stamps ?? []).entries()) {
    const d = stampDrafts[i].draft;
    const id = d ? addDraft(d) : -1;
    stamps.push({ id: s.id, kind: s.kind, name: s.name, anchor: s.anchor ?? null, x: s.x, z: s.z, yaw: s.yaw, building: id, door: d?.building.door ?? null, ways: (s.ways ?? []).map((w) => ({ ...w })) });
  }
  const scenery = emptyDressing();
  mergeDressing(scenery, global);
  const blocksOut: BlockOut[] = [], blockHashes: Record<string, string> = {};
  for (const { block, drafts, dress, arches } of perBlock) {
    const ids = drafts.map(addDraft);
    mergeDressing(scenery, dress);
    signs.push(...arches);
    const plan = plans.find((p) => p.block === block)!;
    const hash = digest({ lots: plan.lots, footways: plan.footways, drafts: drafts.map((d) => [d.building, d.plot, d.signs]), dress, arches });
    blockHashes[block.key] = hash;
    blocksOut.push({ key: block.key, zone: block.zone, face: block.face, inner: block.inner, area: block.area, buildings: ids, hems: plan.hems.map((h) => h.key), hash });
  }
  mergeDressing(scenery, poles);
  mergeDressing(scenery, fenceDress);
  const { pois: spots, solids, ...rest } = scenery;
  const pois = spots.map((p, i) => ({ ...p, id: i }));
  // The scenery solids already hold every building (blocks and stamps) next to the props, trees and lamps.
  const colliders: Solid[] = solids;

  const waterOut = (layout.waterways ?? []).map((w): WaterOut => {
    const n = w.poly.length / 2, banks: WaterOut['banks'] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = w.poly[i * 2], az = w.poly[i * 2 + 1], bx = w.poly[j * 2], bz = w.poly[j * 2 + 1], l = hyp(bx - ax, bz - az) || 1;
      let nx = -(bz - az) / l, nz = (bx - ax) / l;
      if (!inPoly(w.poly, (ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2)) { nx = -nx; nz = -nz; }
      banks.push({ ax, az, bx, bz, kind: w.banks?.find((b) => i >= b.from && i <= b.to)?.kind ?? w.bank, nx: r2(nx), nz: r2(nz) });
    }
    return { id: w.id, name: w.name, kind: w.kind, poly: w.poly.slice(), level: w.level ?? null, banks };
  });
  const decks: DeckOut[] = [];
  for (const e of net.edges) for (const d of e.decks) {
    const a = Math.max(0, d.s0 - d.ramp), b = Math.min(e.len, d.s1 + d.ramp), pts = polylineSlice(e.pts, a, b).map(r2), w = e.half + e.sidewalk;
    const p0 = polylineAt(e.pts, a), p1 = polylineAt(e.pts, b);
    decks.push({
      id: d.bridge, name: d.name, edge: e.key, water: d.water, pts, from: r2(a), s0: r2(d.s0 - a), s1: r2(d.s1 - a), len: r2(b - a), yHint: d.yHint, ramp: d.ramp, half: w,
      poly: [p0.x - p0.hz * w, p0.z + p0.hx * w, p1.x - p1.hz * w, p1.z + p1.hx * w, p1.x + p1.hz * w, p1.z - p1.hx * w, p0.x + p0.hz * w, p0.z - p0.hx * w].map(r2),
    });
  }

  const landM2 = blocks.reduce((s, b) => s + b.area, 0);
  const byTypology: Record<string, number> = {}, byZone: Record<string, number> = {};
  let instances = 0, storeys = 0, glyphs = 0;
  for (const b of buildings) {
    byTypology[b.typology] = (byTypology[b.typology] ?? 0) + 1;
    byZone[b.zone] = (byZone[b.zone] ?? 0) + 1;
    storeys += b.storeys;
    const [base, per] = b.typology === 'apartment' ? [20, 1.5 * (b.w / 3)] : PER_STOREY[b.typology] ?? [20, 6];
    instances += base + per * b.storeys;
  }
  for (const s of signs) glyphs += s.text.length + s.subtitle.length;
  instances += glyphs + signs.length * 2;
  instances += rest.trees.length * 4 + rest.lamps.length * 3 + rest.poles.length * 8 + rest.props.length * 4 + rest.parked.length + rest.eateries.length * 9;
  for (const e of net.edges) instances += Math.ceil(e.len * 0.4);
  instances += net.nodes.length * 10;
  const budget = opts.budget ?? INSTANCE_BUDGET;
  const ms = performance.now() - t0;
  const stats: Stats = {
    ms: r2(ms), landM2: Math.round(landM2), blocks: blocks.length, lots: plans.reduce((s, p) => s + p.lots.length, 0), buildings: buildings.length, hems: hems.length,
    hemLength: Math.round(hems.reduce((s, h) => s + hyp(h.pts[h.pts.length - 2] - h.pts[0], h.pts[h.pts.length - 1] - h.pts[1]), 0)),
    byTypology, byZone, storeys, colliders: colliders.length, trees: rest.trees.length, lamps: rest.lamps.length, props: rest.props.length, parked: rest.parked.length,
    eateries: rest.eateries.length, poles: rest.poles.length, pois: pois.length, signs: signs.length, glyphs,
    nodes: graphPatch.nodes.length, edges: graphPatch.edges.length, instances, instancesPerM2: r2(instances / Math.max(1, landM2)), budget,
  };
  const data: DistrictData = {
    district: layout.id, layout: layout.key, idBase, graphPatch, graph, waters: waterOut, decks, blocks: blocksOut, lots: plans.flatMap((p) => p.lots), hems,
    buildings, plots, doors, colliders, scenery: rest, pois, lamps: rest.lamps.map((l) => ({ x: l.hx, z: l.hz })), signs, stamps, fences, stats, hash: '', blockHashes, issues,
  };
  // The blocks' own hashes cover their buildings and dressing; the rest is route and edge level.
  data.hash = digest([graphPatch, blockHashes, stamps, stampDrafts.map((s) => s.draft), global, poles, fenceDress, fences, decks, idBase]);
  return data;
}

/**
 * Lays a fence along its line in panels of at most 2.5 m with 0.24 m posts between them (corners stay clear). A
 * panel in a gate is left out; one that meets anything else is a layout issue (the perimeter would have a hole).
 */
function layFence(layoutKey: string, f: FenceSpec, P: Placer, out: Dressing, issues: string[]): FenceOut {
  let panels = 0, run = 0;
  const gates = (f.gates ?? []).map((g) => ({ ...g, s: polylineHit(f.pts, g.x, g.z).s }));
  for (let k = 0; k + 3 < f.pts.length; k += 2) {
    const ax = f.pts[k], az = f.pts[k + 1], dx = f.pts[k + 2] - ax, dz = f.pts[k + 3] - az, len = hyp(dx, dz), n = Math.max(1, Math.ceil(len / 2.5)), L = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) * L, s = run + t;
      if (gates.some((g) => Math.abs(g.s - s) < g.w / 2 + L / 2 - 0.12)) continue;
      const box = { cx: r2(ax + (dx / len) * t), cz: r2(az + (dz / len) * t), hx: r2(L / 2 - 0.12), hz: 0.1, yaw: r6(Math.atan2(-dz, dx)) };
      if (!P.free(box, 0.02)) { issues.push(`fence ${f.id}: blocked at (${box.cx}, ${box.cz})`); continue; }
      const key = `fence:${f.id}:${panels++}`, a = boxOf(box);
      out.solids.push(P.add({ ...box, top: f.h, kind: 'prop', key }));
      out.props.push({ key, kind: f.kind, x: box.cx, z: box.cz, sx: r2(a.maxX - a.minX), sz: r2(a.maxZ - a.minZ), yaw: box.yaw, tint: r2(hash01(layoutKey, 'fence', f.id)), w: r2(box.hx * 2), d: 0.2, variant: 0, hours: null });
    }
    run += len;
  }
  return { id: f.id, kind: f.kind, h: f.h, panels, gates: (f.gates ?? []).map((g) => ({ ...g })) };
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
function bbox(poly: readonly number[], pad: number): Box {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let k = 0; k < poly.length; k += 2) { b.minX = Math.min(b.minX, poly[k]); b.maxX = Math.max(b.maxX, poly[k]); b.minZ = Math.min(b.minZ, poly[k + 1]); b.maxZ = Math.max(b.maxZ, poly[k + 1]); }
  return { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad };
}
const inBox = (a: Box, b: Box) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
const lineNear = (l: Line, b: Box) => Math.max(l.ax, l.bx) + l.clear >= b.minX && Math.min(l.ax, l.bx) - l.clear <= b.maxX && Math.max(l.az, l.bz) + l.clear >= b.minZ && Math.min(l.az, l.bz) - l.clear <= b.maxZ;

/** A RoadInput that rebuilds `graph` exactly (createRoadGraph(inputOf(g)) gives g again). */
export function inputOf(graph: RoadGraph): RoadInput {
  return {
    nodes: graph.nodes.map((n) => ({ x: n.x, z: n.z, control: n.control })),
    edges: graph.edges.map((e) => ({
      a: e.a, b: e.b, name: e.name, cls: e.cls, via: e.pts.slice(2, -2), half: e.half, sidewalk: e.sidewalk, walk: e.walk,
      fwd: e.fwd.map((l) => ({ ...l })), back: e.back.map((l) => ({ ...l })), speed: e.speed, traffic: e.traffic, closed: e.closed, bays: e.bays.map((b) => ({ ...b })),
    })),
    phantoms: graph.phantoms.map((p) => ({ ...p })), footways: graph.footways.map((f) => ({ ...f })),
  };
}
/**
 * A road input with a district's patch applied (controls, traffic flags, appended nodes, edges and footways).
 * Slices compose: each is built alone against today's graph, and applying several in turn moves each patch's own
 * nodes (ids >= base.nodes) to the end of what is there; edges onto legacy nodes keep those. A legacy node that an
 * earlier slice already changed (two slices on one portal) throws. Roundabout and key ids in the patch stay its own.
 */
export function applyPatch(input: RoadInput, patch: GraphPatch): RoadInput {
  const { base } = patch;
  if (input.nodes.length < base.nodes || input.edges.length < base.edges) throw new Error(`applyPatch: the input (${input.nodes.length} nodes, ${input.edges.length} edges) lacks the graph the patch was built on`);
  const shift = input.nodes.length - base.nodes, node = (n: number) => (n >= base.nodes ? n + shift : n);
  const nodes = input.nodes.map((n) => ({ ...n })), edges = input.edges.map((e) => ({ ...e }));
  for (const c of patch.control) {
    if (nodes[c.node].control !== c.from) throw new Error(`applyPatch: node ${c.node} is ${nodes[c.node].control}, not ${c.from} (another slice took this portal)`);
    nodes[c.node].control = c.control;
  }
  for (const t of patch.traffic) edges[t].traffic = true;
  return {
    ...input, nodes: [...nodes, ...patch.nodes], edges: [...edges, ...patch.edges.map((e) => ({ ...e, a: node(e.a), b: node(e.b) }))],
    footways: [...(input.footways ?? []), ...patch.footways],
  };
}

function makePatch(net: Net, legacy: RoadGraph, footways: Footway[]): GraphPatch {
  const base = { nodes: legacy.nodes.length, edges: legacy.edges.length };
  const nodes: NodeSpec[] = [], keys: GraphPatch['keys'] = { nodes: [], edges: [] };
  const control: GraphPatch['control'] = [], traffic: number[] = [], roundabouts: GraphPatch['roundabouts'] = [];
  // Legacy nodes keep their ids; new nodes some edge uses are appended in order (a merged hẻm mouth may be left unused).
  const used = new Set<number>();
  for (const e of net.edges) { used.add(e.a); used.add(e.b); }
  const id = new Map<number, number>();
  net.nodes.forEach((n, i) => {
    if (n.legacy >= 0) {
      id.set(i, n.legacy);
      if (n.control !== legacy.nodes[n.legacy].control) control.push({ node: n.legacy, control: n.control, from: legacy.nodes[n.legacy].control });
      for (const arm of legacy.nodes[n.legacy].arms) if (!legacy.edges[arm.edge].traffic && !traffic.includes(arm.edge)) traffic.push(arm.edge);
    } else if (used.has(i)) {
      id.set(i, base.nodes + nodes.length);
      nodes.push({ x: n.x, z: n.z, control: n.control });
      keys.nodes.push(n.key);
    } else return;
    if (n.roundabout) roundabouts.push({ node: id.get(i)!, radius: n.roundabout });
  });
  const edges: EdgeSpec[] = [], extra: GraphPatch['extra'] = [];
  for (const e of net.edges) {
    const spec: EdgeSpec = { a: id.get(e.a)!, b: id.get(e.b)!, name: e.name, cls: e.cls as RoadClass, via: e.pts.slice(2, -2), half: e.half, sidewalk: e.sidewalk, walk: e.walk, speed: e.speed, traffic: e.traffic, bays: e.bays.map((b): Bay => ({ ...b })) };
    if (e.fwd) spec.fwd = e.fwd.map((l): Lane => ({ ...l }));
    if (e.back) spec.back = e.back.map((l): Lane => ({ ...l }));
    edges.push(spec);
    keys.edges.push(e.key);
    extra.push({ art: e.art, curb: [e.curb[0], e.curb[1]], bus: e.bus, closedHours: e.closedHours, block: e.block });
  }
  return { base, nodes, edges, control, traffic, keys, roundabouts, extra, footways };
}

/** Footprint area of a polygon, for stats and tests. */
export const areaOf = (poly: readonly number[]) => Math.abs(polyArea(poly));
