/**
 * Ruin inputs and plans between the main thread and ruin-worker.ts, packed: their long lists as typed arrays (moved to
 * the other side, not copied) and their strings as one table. The wired city's input is ~30 000 small objects and its
 * plan ~35 000 items: a structured clone took ~55 ms on the main thread to send the input and ~110 ms to receive the
 * plan; packing and unpacking take a fraction of that. Unpacked values are the very numbers packed (Float64Array), so
 * the worker plans exactly what the main thread would, and the plan received equals the plan made (same hash).
 */
import type { RuinBox, RuinInput, RuinItem, RuinKind, RuinPlan, RuinPlotInput, RuinSolid } from './apocalypse.ts';

/** A list of records as numbers (stride per record) with strings as indices into the pack's string table. */
type Columns = { n: number; stride: number; data: Float64Array };
export type PackedInput = {
  strings: string[]; rest: Pick<RuinInput, 'bounds' | 'fleet' | 'land' | 'lane'>;
  roads: Columns; roadPts: Float64Array; junctions: Columns; crosswalks: Columns; plots: Columns; trees: Columns; poles: Columns; lamps: Columns;
  greens: Columns; greenPts: Float64Array; stalls: Columns; keepClear: Columns; solids: Columns; walks: Columns | null; checkpoints: Columns | null;
};
export type PackedPlan = Omit<RuinPlan, 'items' | 'colliders' | 'chunks'> & {
  kinds: RuinKind[]; items: Float64Array; ext: Float64Array; colliders: Float64Array; chunkKeys: Int32Array; chunkItems: Int32Array; chunkStarts: Int32Array;
};

function table() {
  const strings: string[] = [], index = new Map<string, number>();
  const id = (s: string) => { let i = index.get(s); if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i); } return i; };
  return { strings, id };
}
function columns<T>(list: readonly T[], stride: number, write: (out: Float64Array, at: number, v: T) => void): Columns {
  const data = new Float64Array(list.length * stride);
  list.forEach((v, i) => write(data, i * stride, v));
  return { n: list.length, stride, data };
}
function rows<T>(c: Columns, read: (d: Float64Array, at: number) => T): T[] {
  const out: T[] = new Array(c.n);
  for (let i = 0; i < c.n; i++) out[i] = read(c.data, i * c.stride);
  return out;
}

/** Packs a ruin input for the worker; send it with inputTransfer(packed) as the transfer list. */
export function packInput(input: RuinInput): PackedInput {
  const S = table();
  const roadPts: number[] = [];
  const roads = columns(input.roads, 9, (d, o, r) => {
    d[o] = r.id; d[o + 1] = r.half; d[o + 2] = r.sidewalk; d[o + 3] = r.walk; d[o + 4] = S.id(r.cls); d[o + 5] = r.traffic ? 1 : 0;
    d[o + 6] = r.bridge === undefined ? -1 : r.bridge ? 1 : 0; d[o + 7] = roadPts.length; d[o + 8] = r.pts.length;
    for (const v of r.pts) roadPts.push(v);
  });
  const greenPts: number[] = [];
  const greens = columns(input.greens, 6, (d, o, g) => {
    d[o] = g.minX; d[o + 1] = g.minZ; d[o + 2] = g.maxX; d[o + 3] = g.maxZ; d[o + 4] = g.poly ? greenPts.length : -1; d[o + 5] = g.poly ? g.poly.length : 0;
    if (g.poly) for (const v of g.poly) greenPts.push(v);
  });
  return {
    strings: S.strings, rest: { bounds: input.bounds, fleet: input.fleet, land: input.land, lane: input.lane },
    roads, roadPts: Float64Array.from(roadPts),
    junctions: columns(input.junctions, 4, (d, o, j) => { d[o] = j.x; d[o + 1] = j.z; d[o + 2] = j.r; d[o + 3] = j.arms; }),
    crosswalks: columns(input.crosswalks, 3, (d, o, c) => { d[o] = c.x; d[o + 1] = c.z; d[o + 2] = c.r; }),
    plots: columns(input.plots, 21, (d, o, p) => {
      d[o] = p.id; d[o + 1] = p.h; d[o + 2] = p.facing; d[o + 3] = S.id(p.style); d[o + 4] = p.sign ? 1 : 0; d[o + 5] = p.keep ? 1 : 0;
      d[o + 6] = p.minX; d[o + 7] = p.minZ; d[o + 8] = p.maxX; d[o + 9] = p.maxZ;
      d[o + 10] = p.ground ? 1 : 0;
      if (p.ground) { d[o + 11] = p.ground.minX; d[o + 12] = p.ground.minZ; d[o + 13] = p.ground.maxX; d[o + 14] = p.ground.maxZ; }
      d[o + 15] = p.box ? 1 : 0;
      if (p.box) { d[o + 16] = p.box.cx; d[o + 17] = p.box.cz; d[o + 18] = p.box.hx; d[o + 19] = p.box.hz; d[o + 20] = p.box.yaw; }
    }),
    trees: columns(input.trees, 4, (d, o, t) => { d[o] = t.x; d[o + 1] = t.z; d[o + 2] = t.size; d[o + 3] = S.id(t.species); }),
    poles: columns(input.poles, 4, (d, o, p) => { d[o] = p.x; d[o + 1] = p.z; d[o + 2] = p.yaw; d[o + 3] = S.id(p.line); }),
    lamps: columns(input.lamps, 4, (d, o, l) => { d[o] = l.x; d[o + 1] = l.z; d[o + 2] = l.hx; d[o + 3] = l.hz; }),
    greens, greenPts: Float64Array.from(greenPts),
    stalls: columns(input.stalls, 4, (d, o, s) => { d[o] = s.x; d[o + 1] = s.z; d[o + 2] = s.yaw; d[o + 3] = S.id(s.kind); }),
    keepClear: columns(input.keepClear, 4, (d, o, k) => { d[o] = k.x; d[o + 1] = k.z; d[o + 2] = k.r; d[o + 3] = k.major === undefined ? -1 : k.major ? 1 : 0; }),
    solids: columns(input.solids, 6, (d, o, s) => {
      if ('cx' in s) { d[o] = 1; d[o + 1] = s.cx; d[o + 2] = s.cz; d[o + 3] = s.hx; d[o + 4] = s.hz; d[o + 5] = s.yaw; }
      else { d[o] = 0; d[o + 1] = s.minX; d[o + 2] = s.minZ; d[o + 3] = s.maxX; d[o + 4] = s.maxZ; }
    }),
    walks: input.walks ? columns(input.walks, 4, (d, o, w) => { d[o] = w.ax; d[o + 1] = w.az; d[o + 2] = w.bx; d[o + 3] = w.bz; }) : null,
    checkpoints: input.checkpoints ? columns(input.checkpoints, 3, (d, o, c) => { d[o] = c.x; d[o + 1] = c.z; d[o + 2] = c.yaw; }) : null,
  };
}
/** The buffers a packed input moves to the worker. */
export const inputTransfer = (p: PackedInput): ArrayBuffer[] =>
  [p.roads, p.junctions, p.crosswalks, p.plots, p.trees, p.poles, p.lamps, p.greens, p.stalls, p.keepClear, p.solids, p.walks, p.checkpoints].filter((c): c is Columns => !!c).map((c) => c.data.buffer as ArrayBuffer)
    .concat([p.roadPts.buffer as ArrayBuffer, p.greenPts.buffer as ArrayBuffer]);

/** The ruin input a packed one stands for (the same numbers, records in the same order). */
export function unpackInput(p: PackedInput): RuinInput {
  const S = p.strings;
  const input: RuinInput = {
    bounds: p.rest.bounds,
    roads: rows(p.roads, (d, o) => {
      const r: RuinInput['roads'][number] = { id: d[o], pts: Array.from(p.roadPts.subarray(d[o + 7], d[o + 7] + d[o + 8])), half: d[o + 1], sidewalk: d[o + 2], walk: d[o + 3], cls: S[d[o + 4]] as 'R1' | 'R2' | 'hem', traffic: d[o + 5] === 1 };
      if (d[o + 6] >= 0) r.bridge = d[o + 6] === 1;
      return r;
    }),
    junctions: rows(p.junctions, (d, o) => ({ x: d[o], z: d[o + 1], r: d[o + 2], arms: d[o + 3] })),
    crosswalks: rows(p.crosswalks, (d, o) => ({ x: d[o], z: d[o + 1], r: d[o + 2] })),
    plots: rows(p.plots, (d, o) => {
      const plot: RuinPlotInput = { minX: d[o + 6], minZ: d[o + 7], maxX: d[o + 8], maxZ: d[o + 9], id: d[o], h: d[o + 1], facing: d[o + 2], style: S[d[o + 3]], sign: d[o + 4] === 1, keep: d[o + 5] === 1 };
      if (d[o + 10]) plot.ground = { minX: d[o + 11], minZ: d[o + 12], maxX: d[o + 13], maxZ: d[o + 14] };
      if (d[o + 15]) plot.box = { cx: d[o + 16], cz: d[o + 17], hx: d[o + 18], hz: d[o + 19], yaw: d[o + 20] };
      return plot;
    }),
    trees: rows(p.trees, (d, o) => ({ x: d[o], z: d[o + 1], size: d[o + 2], species: S[d[o + 3]] })),
    poles: rows(p.poles, (d, o) => ({ x: d[o], z: d[o + 1], yaw: d[o + 2], line: S[d[o + 3]] })),
    lamps: rows(p.lamps, (d, o) => ({ x: d[o], z: d[o + 1], hx: d[o + 2], hz: d[o + 3] })),
    greens: rows(p.greens, (d, o) => {
      const g: RuinInput['greens'][number] = { minX: d[o], minZ: d[o + 1], maxX: d[o + 2], maxZ: d[o + 3] };
      return d[o + 4] >= 0 ? { ...g, poly: Array.from(p.greenPts.subarray(d[o + 4], d[o + 4] + d[o + 5])) } : g;
    }),
    stalls: rows(p.stalls, (d, o) => ({ x: d[o], z: d[o + 1], yaw: d[o + 2], kind: S[d[o + 3]] })),
    keepClear: rows(p.keepClear, (d, o) => (d[o + 3] < 0 ? { x: d[o], z: d[o + 1], r: d[o + 2] } : { x: d[o], z: d[o + 1], r: d[o + 2], major: d[o + 3] === 1 })),
    solids: rows(p.solids, (d, o): RuinSolid => (d[o] === 1 ? ({ cx: d[o + 1], cz: d[o + 2], hx: d[o + 3], hz: d[o + 4], yaw: d[o + 5] } as RuinBox) : { minX: d[o + 1], minZ: d[o + 2], maxX: d[o + 3], maxZ: d[o + 4] })),
  };
  if (p.walks) input.walks = rows(p.walks, (d, o) => ({ ax: d[o], az: d[o + 1], bx: d[o + 2], bz: d[o + 3] }));
  if (p.checkpoints) input.checkpoints = rows(p.checkpoints, (d, o) => ({ x: d[o], z: d[o + 1], yaw: d[o + 2] }));
  if (p.rest.fleet) input.fleet = p.rest.fleet;
  if (p.rest.land) input.land = p.rest.land;
  if (p.rest.lane !== undefined) input.lane = p.rest.lane;
  return input;
}

/** Item columns: id, kind, x, z, y, yaw, roll, s, v, collider, smash, ext start, ext length (-1: none). */
const ITEM = 13, COLLIDER = 7;
/** Packs a plan in the worker; post it with planTransfer(packed) as the transfer list. */
export function packPlan(plan: RuinPlan): PackedPlan {
  const kinds: RuinKind[] = [], kindIndex = new Map<RuinKind, number>();
  const items = new Float64Array(plan.items.length * ITEM), ext: number[] = [];
  plan.items.forEach((it, i) => {
    let k = kindIndex.get(it.kind);
    if (k === undefined) { k = kinds.length; kinds.push(it.kind); kindIndex.set(it.kind, k); }
    const o = i * ITEM;
    items[o] = it.id; items[o + 1] = k; items[o + 2] = it.x; items[o + 3] = it.z; items[o + 4] = it.y; items[o + 5] = it.yaw; items[o + 6] = it.roll;
    items[o + 7] = it.s; items[o + 8] = it.v; items[o + 9] = it.collider; items[o + 10] = it.smash ? 1 : 0;
    items[o + 11] = ext.length; items[o + 12] = it.ext ? it.ext.length : -1;
    if (it.ext) for (const e of it.ext) ext.push(e);
  });
  const colliders = new Float64Array(plan.colliders.length * COLLIDER);
  plan.colliders.forEach((c, i) => { const o = i * COLLIDER; colliders[o] = c.cx; colliders[o + 1] = c.cz; colliders[o + 2] = c.hx; colliders[o + 3] = c.hz; colliders[o + 4] = c.yaw; colliders[o + 5] = c.top; colliders[o + 6] = c.item; });
  const keys = [...plan.chunks.keys()], starts = new Int32Array(keys.length + 1), list: number[] = [];
  keys.forEach((k, i) => { starts[i] = list.length; for (const v of plan.chunks.get(k)!) list.push(v); });
  starts[keys.length] = list.length;
  const { version, hash, seed, fires, columns: smoke, fleetSpots, spawnHoles, craters, clusters, stats } = plan;
  return { version, hash, seed, fires, columns: smoke, fleetSpots, spawnHoles, craters, clusters, stats, kinds, items, ext: Float64Array.from(ext), colliders, chunkKeys: Int32Array.from(keys), chunkItems: Int32Array.from(list), chunkStarts: starts };
}
/** The buffers a packed plan moves back to the main thread. */
export const planTransfer = (p: PackedPlan): ArrayBuffer[] => [p.items, p.ext, p.colliders, p.chunkKeys, p.chunkItems, p.chunkStarts].map((a) => a.buffer as ArrayBuffer);

/** The plan a packed one stands for (equal to the plan the worker made). */
export function unpackPlan(p: PackedPlan): RuinPlan {
  const n = p.items.length / ITEM, items: RuinItem[] = new Array(n), d = p.items;
  for (let i = 0; i < n; i++) {
    const o = i * ITEM;
    const it: RuinItem = { id: d[o], kind: p.kinds[d[o + 1]], x: d[o + 2], z: d[o + 3], y: d[o + 4], yaw: d[o + 5], roll: d[o + 6], s: d[o + 7], v: d[o + 8], collider: d[o + 9], smash: d[o + 10] === 1 };
    if (d[o + 12] >= 0) it.ext = Array.from(p.ext.subarray(d[o + 11], d[o + 11] + d[o + 12]));
    items[i] = it;
  }
  const m = p.colliders.length / COLLIDER, colliders: RuinPlan['colliders'] = new Array(m), c = p.colliders;
  for (let i = 0; i < m; i++) { const o = i * COLLIDER; colliders[i] = { cx: c[o], cz: c[o + 1], hx: c[o + 2], hz: c[o + 3], yaw: c[o + 4], top: c[o + 5], item: c[o + 6] }; }
  const chunks = new Map<number, number[]>();
  p.chunkKeys.forEach((k, i) => chunks.set(k, Array.from(p.chunkItems.subarray(p.chunkStarts[i], p.chunkStarts[i + 1]))));
  return { version: p.version, hash: p.hash, seed: p.seed, items, colliders, chunks, fires: p.fires, columns: p.columns, fleetSpots: p.fleetSpots, spawnHoles: p.spawnHoles, craters: p.craters, clusters: p.clusters, stats: p.stats };
}
