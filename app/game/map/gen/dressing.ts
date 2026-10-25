/**
 * Generator v2, step 5: street dressing as data. Along each block's street fronts: street trees and staggered lamps
 * (spaced by position along the street, so the rhythm runs on across blocks), plastic-stool eateries in front of
 * food stalls and cafés with their hours, food carts near corners, parked motos on the 10.2–11.9 m sidewalk band
 * (on today's R1 roads), bins; along hẻm: motos against the walls (one side at a time), wall lamps, stool tables by
 * hẻm eateries, the back alleys lit from the rows' back walls; inside blocks: pagoda yards, market stalls, school
 * yards, parks, canal walks. Route level: bus shelters. Edge level: power poles in the curb band and at hẻm mouths.
 * Everything solid is placed by spotFree-style rules (createPlacer): never on asphalt, walking lines, crosswalks,
 * door or seat paths, in water, or on another solid.
 */
import type { Lamp, Point, PoiKind, PropKind, Seat, Tree, TreeSpecies } from '../../city.ts';
import { stream } from '../rng.ts';
import { CURB, type DistrictStyle, type FixtureKind } from '../layout/types.ts';
import type { HemPlan, Net } from './arterials.ts';
import type { Block, SideTag } from './blocks.ts';
import { curbOf, type GenBuilding } from './buildings.ts';
import type { Lot } from './lots.ts';
import { boxOf, hyp, inPoly, obbOverlap, obbPointDist, obbSegDist, polylineAt, polylineHit, polylineLength, r2, r6, segDist, yawOf, type OBB } from './geom.ts';

export const PED = 0.45;
/**
 * Inside a hẻm, motos parked against the walls and stool tables keep this far off the centre line (people and
 * motos pass down the middle); motos stand on one side at a time, so at least 2 m of a 2.8 m hẻm stays clear.
 */
export const HEM_CLEAR = 0.7;
/** The narrowest hẻm (asphalt half-width) that takes parked motos and stool tables against its walls. */
export const HEM_PARK_HALF = 1.4, HEM_TABLE_HALF = 1.4;
/**
 * Where along a hẻm (s, metres down its line) motos may park: on the right of its direction for 4 m of every 12 m
 * and on the left for 4 m opposite, 2 m apart, so no two (1.74 m long) ever stand side by side across it.
 */
export const hemParkSide = (s: number): 1 | -1 | 0 => { const m = ((s % 12) + 12) % 12; return m >= 0.75 && m <= 4.75 ? 1 : m >= 6.75 && m <= 10.75 ? -1 : 0; };
export type SolidKind = 'building' | 'tree' | 'lamp' | 'pole' | 'prop' | 'table' | 'moto';
/** A collider for collision.ts addBox(cx, cz, hx, hz, yaw, -Infinity, top, owner, key). */
export type Solid = OBB & { top: number; kind: SolidKind; key: string };
export type GenPropKind = PropKind | FixtureKind | 'pole' | 'eatery' | 'bin' | 'gate';
/** A solid prop in city.ts Prop shape (sx/sz: world-axis size) plus its model size, hours and variant. */
export type GenProp = { key: string; kind: GenPropKind; x: number; z: number; sx: number; sz: number; yaw: number; tint: number; w: number; d: number; variant: number; hours: [number, number] | null };
/** A motorbike parked on the sidewalk band: a curb vehicle for vehicles.ts (there 06–22 for homes, shop hours for customers). */
export type Parked = { key: string; x: number; z: number; yaw: number; model: 'scooter' | 'cub'; tint: number; hours: [number, number] };
/** A plastic-stool eatery: its table, hours and the seats (POI keys) around it. */
export type Eatery = { key: string; x: number; z: number; yaw: number; variant: 'stools' | 'grill' | 'hotpot' | 'coffee'; hours: [number, number]; seats: string[]; building: string };
/**
 * A power pole in the curb band; consecutive poles on one `line` carry the cables. A pole beside a hẻm mouth has
 * line 'hem:<key or arterial>': its cables run down that hẻm (along its centre line, on the house fronts).
 */
export type Pole = { key: string; x: number; z: number; yaw: number; line: string; main: boolean; transformer: boolean };
export type GenPoi = { key: string; kind: PoiKind; x: number; z: number; yaw: number; curb: Point; seat: boolean; hours: [number, number] | null };
/** A lamp in city.ts Lamp shape; 'wall' ones hang on a house front 3 m up (hẻm), (x, z) on the wall, the head out over the hẻm. */
export type GenLamp = Omit<Lamp, 'kind'> & { kind: Lamp['kind'] | 'wall' };
export type Dressing = {
  trees: Tree[]; lamps: GenLamp[]; props: GenProp[]; benches: Seat[]; busStops: Seat[]; parked: Parked[]; eateries: Eatery[]; poles: Pole[];
  pois: GenPoi[]; solids: Solid[];
  /** Green and paved areas the renderer fills (x,z polygons). */
  parks: number[][]; yards: number[][]; walks: number[][];
};
export const emptyDressing = (): Dressing => ({ trees: [], lamps: [], props: [], benches: [], busStops: [], parked: [], eateries: [], poles: [], pois: [], solids: [], parks: [], yards: [], walks: [] });

// ---------------------------------------------------------------------------------------------------------------
// Placer: a small hash of solids and of lines things must keep off.
// ---------------------------------------------------------------------------------------------------------------

/** A segment to keep clear: walking lines and paths (0.55 m), asphalt (half + 0.3 from the centre line), crosswalks. */
export type Line = { ax: number; az: number; bx: number; bz: number; clear: number; kind: 'walk' | 'path' | 'asphalt' | 'hem' | 'cross' | 'fence' };
export type Placer = ReturnType<typeof createPlacer>;
export function createPlacer(waters: readonly number[][], bounds: readonly number[]) {
  const CELL = 8, solids: Solid[] = [], lines: Line[] = [];
  const sCells = new Map<number, number[]>(), lCells = new Map<number, number[]>();
  const key = (ix: number, iz: number) => (ix + 8192) * 16384 + iz + 8192;
  const insert = (cells: Map<number, number[]>, id: number, x0: number, x1: number, z0: number, z1: number) => {
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      const k = key(ix, iz), l = cells.get(k);
      if (l) l.push(id); else cells.set(k, [id]);
    }
  };
  let stamp = 0;
  const sMark: number[] = [], lMark: number[] = [];
  function each(cells: Map<number, number[]>, marks: number[], x0: number, x1: number, z0: number, z1: number, fn: (id: number) => boolean) {
    stamp++;
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      const l = cells.get(key(ix, iz));
      if (l) for (const id of l) { if (marks[id] === stamp) continue; marks[id] = stamp; if (fn(id)) return true; }
    }
    return false;
  }
  const wet = (x: number, z: number) => waters.some((w) => inPoly(w, x, z));
  return {
    solids, lines,
    add(s: Solid) { const b = boxOf(s); solids.push(s); insert(sCells, solids.length - 1, b.minX, b.maxX, b.minZ, b.maxZ); return s; },
    line(l: Line) { lines.push(l); const m = l.clear; insert(lCells, lines.length - 1, Math.min(l.ax, l.bx) - m, Math.max(l.ax, l.bx) + m, Math.min(l.az, l.bz) - m, Math.max(l.az, l.bz) + m); },
    /**
     * Whether a solid box may stand here (spotFree): off every line by its clearance, off solids by `pad`, dry, in
     * bounds. `hem` replaces the clearance of hẻm lines (things parked against a hẻm's walls), `path` that of door
     * and seat paths (a moto beside a door in a hẻm: a person's half-width is enough).
     */
    free(b: OBB, pad = 0.1, skip = '', hem = 0, path = 0) {
      if (!inPoly(bounds, b.cx, b.cz) || wet(b.cx, b.cz)) return false;
      const a = boxOf(b), g = { ...b, hx: b.hx + pad, hz: b.hz + pad }, reach = hyp(b.hx, b.hz);
      if (each(sCells, sMark, a.minX - pad, a.maxX + pad, a.minZ - pad, a.maxZ + pad, (id) => solids[id].key !== skip && obbOverlap(g, solids[id], 0))) return false;
      // Lines are filed in every cell their clearance reaches, so the box's own cells are enough.
      return !each(lCells, lMark, a.minX, a.maxX, a.minZ, a.maxZ, (id) => {
        const l = lines[id], clear = hem && l.kind === 'hem' ? hem : path && l.kind === 'path' ? path : l.clear;
        return segDist(b.cx, b.cz, l.ax, l.az, l.bx, l.bz) - reach < clear && obbSegDist(b, l.ax, l.az, l.bx, l.bz) < clear;
      });
    },
    /** Whether a person (radius r) can stand at (x, z): off solids and asphalt, dry. */
    stand(x: number, z: number, r = PED) {
      if (!inPoly(bounds, x, z) || wet(x, z)) return false;
      if (each(sCells, sMark, x - r, x + r, z - r, z + r, (id) => obbPointDist(solids[id], x, z) < r)) return false;
      return !each(lCells, lMark, x, x, z, z, (id) => { const l = lines[id]; return l.kind === 'asphalt' && segDist(x, z, l.ax, l.az, l.bx, l.bz) < l.clear - 0.3; });
    },
    /** Whether a person (radius r) can walk straight from a to b without touching a solid or the water (city.ts segmentClear). */
    path(ax: number, az: number, bx: number, bz: number, r = PED, skip = '') {
      const n = Math.max(1, Math.ceil(hyp(bx - ax, bz - az) / 0.5));
      for (let i = 0; i <= n; i++) if (wet(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
      const x0 = Math.min(ax, bx) - r, x1 = Math.max(ax, bx) + r, z0 = Math.min(az, bz) - r, z1 = Math.max(az, bz) + r;
      return !each(sCells, sMark, x0, x1, z0, z1, (id) => solids[id].key !== skip && solids[id].kind !== 'moto' && obbSegDist(solids[id], ax, az, bx, bz) < r);
    },
  };
}

/** Walking lines and asphalt of a road edge as placer lines (block items keep off both). */
export function edgeLines(e: { pts: readonly number[]; half: number; walk: number; cls: string }): Line[] {
  const out: Line[] = [];
  for (let k = 0; k + 3 < e.pts.length; k += 2) {
    const ax = e.pts[k], az = e.pts[k + 1], bx = e.pts[k + 2], bz = e.pts[k + 3], l = hyp(bx - ax, bz - az) || 1, rx = -(bz - az) / l, rz = (bx - ax) / l;
    // A hẻm is shared space: nothing stands on it, but people (doors, seats) may.
    out.push({ ax, az, bx, bz, clear: e.half + (e.cls === 'hem' ? 0.2 : 0.3), kind: e.cls === 'hem' ? 'hem' : 'asphalt' });
    if (e.walk > 0) for (const s of [1, -1]) out.push({ ax: ax + rx * e.walk * s, az: az + rz * e.walk * s, bx: bx + rx * e.walk * s, bz: bz + rz * e.walk * s, clear: PED + 0.1, kind: 'walk' });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Block dressing.
// ---------------------------------------------------------------------------------------------------------------

export type DressCtx = { layoutKey: string; net: Net; hems: Map<string, HemPlan>; style: DistrictStyle; placer: Placer };
type Front = { tag: Extract<SideTag, { kind: 'road' }>; ax: number; az: number; hx: number; hz: number; nx: number; nz: number; len: number };
const HOURS = {
  home: [6, 22] as [number, number], morning: [6, 10] as [number, number], lunch: [10, 14] as [number, number], evening: [16, 23] as [number, number],
  night: [17, 2] as [number, number], cafe: [6, 22] as [number, number], market: [5, 12] as [number, number], shop: [7, 21] as [number, number],
};
const MORNING = /PHỞ|HỦ TIẾU|BÁNH MÌ|BÁNH CUỐN|XÔI|CHÁO|BÚN BÒ|BÚN RIÊU|MÌ QUẢNG/;

/** Everything a block puts on its sidewalks and in its yards; returns its own Dressing (keys start with the block key). */
export function dressBlock(ctx: DressCtx, block: Block, lots: Lot[], buildings: Omit<GenBuilding, 'id'>[]): Dressing {
  const out = emptyDressing(), r = stream(ctx.layoutKey, 'dress', block.key), P = ctx.placer;
  let n = 0;
  const id = (what: string) => `${block.key}:${what}${n++}`;
  const solid = (b: OBB, top: number, kind: Solid['kind'], key: string) => { const s = P.add({ ...b, cx: r2(b.cx), cz: r2(b.cz), hx: r2(b.hx), hz: r2(b.hz), yaw: r6(b.yaw), top, kind, key }); if (kind !== 'moto') out.solids.push(s); return s; };
  const prop = (kind: GenPropKind, b: OBB, top: number, variant = 0, hours: [number, number] | null = null) => {
    const key = id(kind), a = boxOf(b);
    solid(b, top, kind === 'eatery' ? 'table' : 'prop', key);
    out.props.push({ key, kind, x: r2(b.cx), z: r2(b.cz), sx: r2(a.maxX - a.minX), sz: r2(a.maxZ - a.minZ), yaw: r6(b.yaw), tint: r2(r.next()), w: r2(b.hx * 2), d: r2(b.hz * 2), variant, hours });
    return key;
  };
  const tree = (species: TreeSpecies, x: number, z: number, size: number) => {
    const s = species === 'bamboo' ? 1.1 : species === 'palm' ? 0.5 : 0.65, b: OBB = { cx: x, cz: z, hx: s / 2, hz: s / 2, yaw: 0 };
    if (!P.free(b, 0.1)) return false;
    solid(b, Infinity, 'tree', id('t'));
    out.trees.push({ species, x: r2(x), z: r2(z), size: r2(size), spin: r2(r.next() * Math.PI * 2), tint: r2(r.next()) });
    return true;
  };
  const lamp = (x: number, z: number, hx: number, hz: number, kind: Lamp['kind']) => {
    const s = kind === 'post' ? 0.3 : 0.24, b: OBB = { cx: x, cz: z, hx: s / 2, hz: s / 2, yaw: 0 };
    if (!P.free(b, 0.1)) return false;
    solid(b, Infinity, 'lamp', id('l'));
    out.lamps.push({ x: r2(x), z: r2(z), hx: r2(hx), hz: r2(hz), kind });
    return true;
  };
  /** A POI (seat or standing spot) with its curb on the nearest walking line it can walk straight to. */
  const poi = (kind: PoiKind, x: number, z: number, yaw: number, seat: boolean, lines: string[], hours: [number, number] | null = null, walks: number[] = []) => {
    if (!P.stand(x, z)) return null;
    let best: Point | null = null, bl = Infinity;
    lines.forEach((line, i) => {
      const c = curbOf(ctx.net, ctx.hems, line, walks[i] ?? walkOfLine(ctx, line), x, z), l = hyp(c.x - x, c.z - z);
      if (l < bl && P.stand(c.x, c.z, 0.3) && P.path(x, z, c.x, c.z)) { best = c; bl = l; }
    });
    if (!best) return null;
    const key = id('p'), c = best as Point;
    out.pois.push({ key, kind, x: r2(x), z: r2(z), yaw: r6(yaw), curb: c, seat, hours });
    P.line({ ax: x, az: z, bx: c.x, bz: c.z, clear: PED + 0.1, kind: 'path' });
    return key;
  };

  // Buildings are solids; their door paths are lines.
  buildings.forEach((b) => {
    solid(b.box, b.h, 'building', b.key);
    P.line({ ax: b.door.x, az: b.door.z, bx: b.curb.x, bz: b.curb.z, clear: PED + 0.1, kind: 'path' });
  });
  const roadLines = [...new Set(block.sides.filter((s) => s.kind === 'road').map((s) => (s as { art: string }).art))];
  /** House walls along hẻm (fronts and back-alley backs), collected for the wall lamps. */
  const walls: { line: string; side: number; lo: number; hi: number; ds: number; len: number; spot: (s: number, out: number) => { x: number; z: number } }[] = [];
  const lotOf = new Map(lots.map((l) => [l.key, l]));

  // Institutions: yards, walls, stalls.
  for (const b of buildings) {
    const lot = lotOf.get(b.lot);
    if (!lot) continue;
    if (lot.use === 'pagoda' || lot.use === 'church' || lot.use === 'school') compound(lot, b);
    if (lot.use === 'market') marketStalls(lot, b);
  }

  // Street fronts, then the hẻm fronts.
  const fronts = frontsOf(block);
  for (const f of fronts) streetFront(f);
  for (const b of buildings) { const lot = lotOf.get(b.lot); if (lot?.cls === 'hem') hemFront(lot, b); }
  // Rows backing onto the block's back alley light it from their back walls and park a few bikes at the back doors.
  const backs = [...ctx.hems.values()].filter((h) => h.block === block.key && h.kind === 'spine');
  for (const b of buildings) {
    const lot = lotOf.get(b.lot);
    if (!lot || lot.use !== 'row' || !backs.length) continue;
    const bx = lot.box.cx - Math.sin(lot.box.yaw) * lot.box.hz, bz = lot.box.cz - Math.cos(lot.box.yaw) * lot.box.hz;
    const alley = backs.find((h) => polylineHit(h.pts, bx, bz).d < h.half + 0.65);
    if (alley) hemFront(lot, b, alley);
  }
  // Wall lamps down each hẻm every 17 m on alternating walls (by position, so the rhythm runs on across blocks), off
  // the doors; inside the block's own hẻm a missing wall on one side hands the lamp to the wall opposite.
  for (const [line, list] of Map.groupBy(walls, (w) => w.line)) {
    const len = list[0].len;
    for (let k = 0, s = 8; s < len - 2; k++, s += 17) {
      const want: 1 | -1 = k % 2 === 0 ? 1 : -1;
      const pick = (side: number) => list.find((w) => w.side === side && s > w.lo + 0.3 && s < w.hi - 0.3);
      const w = pick(want) ?? (line.startsWith('hem:') ? pick(-want) : undefined);
      if (!w) continue;
      const at = Math.abs(s - w.ds) >= 0.8 ? s : Math.max(w.lo + 0.3, Math.min(w.hi - 0.3, w.ds + (s >= w.ds ? 1 : -1)));
      const p = w.spot(at, 0), head = w.spot(at, 0.6);
      out.lamps.push({ x: r2(p.x), z: r2(p.z), hx: r2(head.x), hz: r2(head.z), kind: 'wall' });
    }
  }
  if (block.zone === 'park' || (!lots.length && block.inner)) green();
  return out;

  /**
   * A house wall on a hẻm (its front, or with `back` its back on the block's back alley): motos parked along it (one
   * side of the hẻm at a time, see hemParkSide; never in the first 6 m from an end), a wall lamp where the hẻm's
   * 17 m rhythm puts one on this wall, and a stool table against the wall by a hẻm eatery.
   */
  function hemFront(lot: Lot, b: Omit<GenBuilding, 'id'>, back: HemPlan | null = null) {
    const plan = back ?? (lot.line.startsWith('hem:') ? ctx.hems.get(lot.line.slice(4)) : null);
    const pts = plan ? plan.pts : ctx.net.arts.get(lot.line)?.pts, half = plan ? plan.half : ctx.net.edges.find((e) => e.art === lot.line)?.half;
    if (!pts || half === undefined) return;
    const len = polylineLength(pts), f = Math.sin(lot.box.yaw) * (back ? -1 : 1), g = Math.cos(lot.box.yaw) * (back ? -1 : 1);
    const h0 = polylineHit(pts, lot.box.cx + f * lot.box.hz, lot.box.cz + g * lot.box.hz), side: 1 | -1 = h0.off >= 0 ? 1 : -1;
    const lo = h0.s - lot.w / 2, hi = h0.s + lot.w / 2, ds = back ? -1e9 : polylineHit(pts, b.door.x, b.door.z).s;
    const wall = polylineHit(pts, b.box.cx + f * b.box.hz, b.box.cz + g * b.box.hz).d;
    /** The point `off` metres out from the centre line on this lot's side, s along the hẻm, and the hẻm's heading. */
    const spot = (s: number, off: number) => { const p = polylineAt(pts, s); return { x: p.x - p.hz * side * off, z: p.z + p.hx * side * off, hx: p.hx, hz: p.hz }; };
    // The eatery's stool table first (beside its door), then the bikes.
    if (!back && (b.kind === 'food' || b.kind === 'cafe') && half >= HEM_TABLE_HALF) {
      const hours: [number, number] = b.zone === 'night' ? HOURS.night : b.kind === 'cafe' ? HOURS.cafe : MORNING.test(b.name) ? HOURS.morning : HOURS.evening;
      for (const off of [1.7, -1.7, 2.5, -2.5]) {
        const s = ds + off;
        // Clear of the stretches where motos park opposite, so 2 m stay open beside the table.
        if (s < 4 || s > len - 4 || [s - 1.5, s, s + 1.5].some((q) => hemParkSide(q) === -side)) continue;
        const p = spot(s, half - 0.35), yaw = yawOf(p.hz * side, -p.hx * side), table: OBB = { cx: p.x, cz: p.z, hx: 0.4, hz: 0.3, yaw };
        if (!P.free(table, 0.15, '', HEM_CLEAR)) continue;
        const variant: Eatery['variant'] = b.kind === 'cafe' ? 'coffee' : 'stools', key = prop('eatery', table, 0.75, ['stools', 'grill', 'hotpot', 'coffee'].indexOf(variant), hours), seats: string[] = [];
        for (const d of [-0.85, 0.85]) {
          const q = spot(s + d, half - 0.35), seat = poi('cafe-seat', q.x, q.z, yawOf(p.x - q.x, p.z - q.z), true, [lot.line], hours, [0]);
          if (seat) seats.push(seat);
        }
        out.eateries.push({ key, x: r2(p.x), z: r2(p.z), yaw: r6(yaw), variant, hours, seats, building: b.key });
        break;
      }
    }
    if (half >= HEM_PARK_HALF) {
      const want = back ? (b.kind === 'home' && r.chance(0.35) ? 1 : 0) : b.typology === 'apartment' ? Math.floor(lot.w / 3) : b.kind === 'home' ? (r.chance(0.6) ? 1 + r.int(2) : 0) : 2 + r.int(2);
      let placed = 0;
      for (let s = lo + 0.5; s <= hi - 0.5 && placed < want; s += 0.1) {
        if (s < 6 || s > len - 6 || hemParkSide(s) !== side) continue;
        const p = spot(s, half - 0.35), yaw = yawOf(p.hx, p.hz), m: OBB = { cx: p.x, cz: p.z, hx: 0.31, hz: 0.87, yaw };
        if (!P.free(m, 0.04, '', HEM_CLEAR, PED + 0.02)) continue;
        if (r.chance(0.5)) m.yaw += Math.PI;
        const key = id('m');
        solid(m, 1.2, 'moto', key);
        out.parked.push({ key, x: r2(p.x), z: r2(p.z), yaw: r6(m.yaw), model: r.chance(0.7) ? 'scooter' : 'cub', tint: r2(r.next()), hours: b.kind === 'home' || back ? HOURS.home : HOURS.shop });
        placed++; s += 1.4;
      }
    }
    walls.push({ line: plan ? `hem:${plan.key}` : lot.line, side, lo, hi, ds, len, spot: (s: number, out: number) => spot(s, wall - out) });
  }

  function frontsOf(b: Block): Front[] {
    if (!b.inner) return [];
    const p = b.inner, m = p.length / 2, list: Front[] = [];
    b.sides.forEach((tag, i) => {
      if (tag.kind !== 'road' || tag.cls === 'hem') return;
      const j = (i + 1) % m, dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1], len = hyp(dx, dz);
      if (len < 3) return;
      list.push({ tag, ax: p[i * 2], az: p[i * 2 + 1], hx: dx / len, hz: dz / len, nx: dz / len, nz: -dx / len, len });
    });
    return list;
  }

  /** The sidewalk in front of one street side: (s along the frontage line, o metres out from it towards the street). */
  function streetFront(f: Front) {
    const { tag } = f, art = ctx.net.arts.get(tag.art);
    const at = (s: number, o: number) => [f.ax + f.hx * s + f.nx * o, f.az + f.hz * s + f.nz * o] as const;
    const yawOut = yawOf(f.nx, f.nz);
    // Out from the frontage: the walking line is at `walkAt`; the house band runs from 0 to walkAt - 0.55.
    const walkAt = tag.front - tag.walk, band = walkAt - PED - 0.1, [m0, m1] = [CURB.motoBand[1], CURB.motoBand[0]];
    const motoOK = band >= m1 - 0.05, motoMid = (m0 + m1) / 2;
    const treeAt = band - 0.45 >= m1 + 0.3 ? (m1 + 0.33 + band - 0.33) / 2 : motoOK ? motoMid : band / 2;
    const artS = (s: number) => { const [x, z] = at(s, 0); return art ? polylineHit(art.pts, x, z) : null; };
    const h0 = artS(0), h1 = artS(f.len);
    const right = (h0?.off ?? 1) > 0, sA = h0?.s ?? 0, sB = h1?.s ?? f.len, k = (sB - sA) / f.len || 1;
    const sAt = (artPos: number) => (artPos - sA) / k;
    // Buildings fronting this street (set-back ones too: villas, yards, warehouse aprons).
    const doors = buildings.filter((b) => lotOf.get(b.lot)?.line === tag.art && along(b.door) > -1 && along(b.door) < f.len + 1 && Math.abs((b.door.x - f.ax) * f.nx + (b.door.z - f.az) * f.nz) < 40);
    function along(p: Point) { return (p.x - f.ax) * f.hx + (p.z - f.az) * f.hz; }
    const nearDoor = (s: number, gap: number) => doors.some((d) => Math.abs(along(d.door) - s) < gap);
    const showcase = (s: number) => doors.some((d) => Math.abs(along(d.door) - s) < (d.kind === 'home' ? 0 : d.typology === 'tube' || d.typology === 'stilt' ? 2.6 : 6));

    // Lamps every 28 m, staggered across the street; trees every 13.5 m between them.
    const lampPhase = right ? 0 : 14, treePhase = right ? 6.75 : 0;
    const species = tag.cls === 'R1' ? art?.trees ?? ctx.style.trees.R1 : art?.trees ?? ctx.style.trees.R2;
    for (let p = Math.ceil((Math.min(sA, sB) - lampPhase) / 28) * 28 + lampPhase; p <= Math.max(sA, sB); p += 28) {
      const s = sAt(p);
      if (s < 2 || s > f.len - 2) continue;
      for (const ds of [0, 1.5, -1.5, 3, -3]) {
        const [x, z] = at(s + ds, treeAt);
        if (!nearDoor(s + ds, 1.2) && lamp(x, z, x + f.nx * 1.1, z + f.nz * 1.1, 'street')) break;
      }
    }
    if (species) {
      for (let p = Math.ceil((Math.min(sA, sB) - treePhase) / 13.5) * 13.5 + treePhase; p <= Math.max(sA, sB); p += 13.5) {
        const s = sAt(p);
        if (s < 1.5 || s > f.len - 1.5 || showcase(s) || nearDoor(s, 1.3) || r.chance(0.12)) continue;
        const [x, z] = at(s, treeAt);
        tree(species, x, z, r.range(0.68, 0.86));
      }
    }
    // Eateries in front of food stalls and cafés, carts near the corners, then the parked bikes.
    for (const b of doors) {
      if (b.kind !== 'food' && b.kind !== 'cafe') continue;
      const night = b.zone === 'night', ds = along(b.door);
      const hours: [number, number] = night ? HOURS.night : b.kind === 'cafe' ? HOURS.cafe : MORNING.test(b.name) ? HOURS.morning : r.chance(0.5) ? HOURS.lunch : HOURS.evening;
      const variant: Eatery['variant'] = b.kind === 'cafe' ? 'coffee' : night ? (r.chance(0.5) ? 'grill' : 'hotpot') : r.chance(0.35) ? 'grill' : 'stools';
      let sets = night ? 2 + r.int(2) : 1 + (r.chance(0.4) ? 1 : 0);
      for (const off of [2.6, -2.6, 4.4, -4.4, 6.2, -6.2]) {
        if (sets <= 0) break;
        const s = ds + off;
        if (s < 1.2 || s > f.len - 1.2 || nearDoor(s, 1.6)) continue;
        if (eatery(at, yawOut, s, Math.min(motoMid, band - 1.3), variant, hours, b.key, tag.art, tag.walk)) sets--;
      }
    }
    if ((block.zone === 'tube' || block.zone === 'night' || block.zone === 'market' || block.zone === 'school') && r.chance(0.55)) {
      const s = r.chance(0.5) ? r.range(2.5, 6) : f.len - r.range(2.5, 6), [x, z] = at(s, Math.min(motoMid, band - 0.6));
      const variant = r.int(5), hours: [number, number] = [[6, 10], [7, 19], [16, 22], [14, 22], [5, 10]][variant] as [number, number];
      const b: OBB = { cx: x, cz: z, hx: 0.95, hz: 0.5, yaw: yawOut };
      if (!nearDoor(s, 1.8) && P.free(b)) prop('cart', b, 1.6, variant, hours);
    }
    if (motoOK) {
      for (const b of doors) {
        const lot = lotOf.get(b.lot);
        if (!lot || b.typology === 'warehouse' || b.typology === 'pagoda' || b.typology === 'church') continue;
        const want = b.typology === 'apartment' ? Math.floor(lot.w / 6) : b.kind === 'home' ? (r.chance(0.45) ? 1 + r.int(2) : 0) : b.typology === 'market-hall' ? 10 : b.typology === 'school' ? 8 : 3 + r.int(5);
        const lo = along(b.door) - lot.w / 2, hi = along(b.door) + lot.w / 2, ds = along(b.door);
        let placed = 0;
        for (let s = lo + 0.45; s <= hi - 0.45 && placed < want; s += 0.75) {
          if (Math.abs(s - ds) < 1.3 || s < 0.6 || s > f.len - 0.6) continue;
          const [x, z] = at(s, motoMid), yaw = yawOut + r.jitter(0.12), m: OBB = { cx: x, cz: z, hx: 0.31, hz: 0.87, yaw };
          if (!P.free(m, 0.04)) continue;
          const key = id('m');
          solid(m, 1.2, 'moto', key);
          out.parked.push({ key, x: r2(x), z: r2(z), yaw: r6(yaw), model: r.chance(0.7) ? 'scooter' : 'cub', tint: r2(r.next()), hours: b.kind === 'home' ? HOURS.home : b.typology === 'market-hall' ? HOURS.market : HOURS.shop });
          placed++;
        }
      }
    }
    // A bin near each end of the front.
    for (const s of [r.range(3, 7), f.len - r.range(3, 7)]) {
      if (r.chance(0.5) || nearDoor(s, 1.5)) continue;
      const [x, z] = at(s, Math.max(0.5, band - 0.45)), b: OBB = { cx: x, cz: z, hx: 0.35, hz: 0.35, yaw: yawOut };
      if (P.free(b)) prop('bin', b, 1.1, r.chance(0.25) ? 1 : 0);
    }
  }

  function eatery(at: (s: number, o: number) => readonly [number, number], yaw: number, s: number, o: number, variant: Eatery['variant'], hours: [number, number], building: string, line: string, walk: number) {
    const [x, z] = at(s, o), table: OBB = { cx: x, cz: z, hx: 0.4, hz: 0.3, yaw };
    if (!P.free(table, 0.15)) return false;
    const seats: string[] = [];
    const key = prop('eatery', table, 0.75, ['stools', 'grill', 'hotpot', 'coffee'].indexOf(variant), hours);
    // Stools on the four sides, facing the table; keep those a person can sit on and walk away from.
    for (const [ds, dout] of [[-0.85, 0], [0.85, 0], [0, -0.75], [0, 0.75]] as const) {
      const [sx, sz] = at(s + ds, o + dout);
      const p = poi('cafe-seat', sx, sz, yawOf(x - sx, z - sz), true, [line], hours, [walk]);
      if (p) seats.push(p);
    }
    out.eateries.push({ key, x: r2(x), z: r2(z), yaw: r6(yaw), variant, hours, seats, building });
    return true;
  }

  /** A walled compound in front of a pagoda, church or school: wall with a gate on the street, yard spots, the yard furniture. */
  function compound(lot: Lot, b: Omit<GenBuilding, 'id'>) {
    const L = lot.box, f = Math.sin(L.yaw), g = Math.cos(L.yaw), rx = g, rz = -f;
    const fx = L.cx + f * L.hz, fz = L.cz + g * L.hz, yardD = L.hz * 2 - b.box.hz * 2 - 1.5;
    const wall = (cx: number, cz: number, len: number, yawW: number, kind: GenPropKind) => {
      const box: OBB = { cx, cz, hx: len / 2, hz: kind === 'fence' ? 0.15 : 0.25, yaw: yawW };
      if (len > 0.6 && P.free(box, 0.02, b.key)) prop(kind, box, kind === 'fence' ? 1.8 : 2.2);
    };
    const kind: GenPropKind = lot.use === 'school' ? 'fence' : 'wall';
    const gate = Math.min(7, L.hx), side = (L.hx - gate / 2) - 0.6;
    // Front wall either side of the gate (just inside the lot), side walls along the yard.
    for (const s of [-1, 1]) {
      wall(fx - f * 0.3 + rx * s * (gate / 2 + side / 2), fz - g * 0.3 + rz * s * (gate / 2 + side / 2), side, L.yaw, kind);
      wall(fx - f * (0.3 + yardD / 2) + rx * s * (L.hx - 0.3), fz - g * (0.3 + yardD / 2) + rz * s * (L.hx - 0.3), yardD - 0.6, L.yaw + Math.PI / 2, kind);
      const pb: OBB = { cx: fx - f * 0.3 + rx * s * (gate / 2 + 0.2), cz: fz - g * 0.3 + rz * s * (gate / 2 + 0.2), hx: 0.45, hz: 0.45, yaw: L.yaw };
      if (P.free(pb, 0.02)) prop('pillar', pb, 3.2);
    }
    out.yards.push(rectPoly(fx - f * (yardD / 2), fz - g * (yardD / 2), L.hx, yardD / 2, L.yaw));
    const yard = (u: number, v: number) => [fx - f * v + rx * u, fz - g * v + rz * u] as const;
    if (lot.use === 'pagoda') {
      const [ux, uz] = yard(-L.hx * 0.45, yardD * 0.5);
      const urn: OBB = { cx: fx - f * yardD * 0.45, cz: fz - g * yardD * 0.45, hx: 0.5, hz: 0.5, yaw: L.yaw };
      if (P.free(urn, 0.1)) prop('urn', urn, 1.4);
      const stupa: OBB = { cx: ux, cz: uz, hx: 1.2, hz: 1.2, yaw: L.yaw };
      if (P.free(stupa, 0.1)) prop('stupa', stupa, 7);
      const [tx, tz] = yard(L.hx * 0.5, yardD * 0.55);
      tree('round', tx, tz, 1.35);
    } else if (lot.use === 'school') {
      const [px, pz] = yard(L.hx * 0.7, yardD * 0.3), fp: OBB = { cx: px, cz: pz, hx: 0.15, hz: 0.15, yaw: 0 };
      if (P.free(fp, 0.1)) prop('flagpole', fp, 9);
      const [tx, tz] = yard(-L.hx * 0.7, yardD * 0.35);
      tree('flame', tx, tz, 1.15);
    } else {
      const [tx, tz] = yard(L.hx * 0.6, yardD * 0.5);
      tree('palm', tx, tz, 1.1);
    }
    const kindPoi: PoiKind = lot.use === 'school' ? 'school-yard' : 'pagoda-yard';
    for (let i = 0; i < 4; i++) {
      const [x, z] = yard(r.range(-L.hx * 0.5, L.hx * 0.5), r.range(yardD * 0.25, yardD * 0.75));
      poi(kindPoi, x, z, r.range(-Math.PI, Math.PI), false, [lot.line], lot.use === 'school' ? [7, 17] : [5, 21]);
    }
  }

  /** Market stalls along the hall's front, customers in front of each. */
  function marketStalls(lot: Lot, b: Omit<GenBuilding, 'id'>) {
    const L = lot.box, f = Math.sin(L.yaw), g = Math.cos(L.yaw), rx = g, rz = -f, fx = L.cx + f * L.hz, fz = L.cz + g * L.hz;
    const tag = block.sides.find((s) => s.kind === 'road' && s.art === lot.line) as Extract<SideTag, { kind: 'road' }> | undefined;
    if (!tag) return;
    const band = tag.front - tag.walk - PED - 0.1;
    if (band < 2.6) return;
    const du = (b.door.x - fx) * rx + (b.door.z - fz) * rz;
    for (let u = -L.hx + 3; u <= L.hx - 3; u += 4.6) {
      if (Math.abs(u - du) < 3.4) continue;
      const box: OBB = { cx: fx + f * 1.05 + rx * u, cz: fz + g * 1.05 + rz * u, hx: 1.8, hz: 0.9, yaw: L.yaw };
      if (!P.free(box, 0.05)) continue;
      prop('stall', box, 2.4, r.int(4), HOURS.market);
      poi('market', fx + f * 2.5 + rx * u, fz + g * 2.5 + rz * u, L.yaw + Math.PI, false, [lot.line], HOURS.market);
    }
  }

  /** Parks and leftover green: paths, benches, trees, lamp posts; canal walks along kè and promenade banks. */
  function green() {
    const face = block.face, inner = block.inner ?? face;
    const banks = block.faceSides.map((t, i) => ({ t, i })).filter((s) => s.t.kind === 'water' && (s.t.bank === 'ke' || s.t.bank === 'promenade'));
    const m = face.length / 2;
    for (const { i } of banks) {
      const j = (i + 1) % m, ax = face[i * 2], az = face[i * 2 + 1], dx = face[j * 2] - ax, dz = face[j * 2 + 1] - az, len = hyp(dx, dz);
      if (len < 8) continue;
      const hx = dx / len, hz = dz / len, nx = -hz, nz = hx, yawWater = yawOf(-nx, -nz);
      out.walks.push([ax, az, ax + dx, az + dz, ax + dx + nx * 3, az + dz + nz * 3, ax + nx * 3, az + nz * 3]);
      for (let s = 6; s < len - 4; s += 9) {
        const x = ax + hx * s, z = az + hz * s;
        if (Math.round(s / 9) % 2 === 0) {
          const bx = x + nx * 1.7, bz = z + nz * 1.7;
          if (poi('bench', bx + hx * 0.65, bz + hz * 0.65, yawWater, true, roadLines) && poi('bench', bx - hx * 0.65, bz - hz * 0.65, yawWater, true, roadLines)) out.benches.push({ x: r2(bx), z: r2(bz), yaw: r6(yawWater) });
        } else if (Math.round(s / 9) % 3 === 0) poi('park', x + nx * 0.8, z + nz * 0.8, yawWater, false, roadLines, [5, 20]);
        tree(r.chance(0.5) ? 'palm' : 'round', x + hx * 4.5 + nx * 3.4, z + hz * 4.5 + nz * 3.4, r.range(0.8, 1));
        if (Math.round(s / 9) % 3 === 1) lamp(x + nx * 2.6, z + nz * 2.6, x + nx * 2.6, z + nz * 2.6, 'post');
      }
    }
    if (block.zone !== 'park' || !block.inner) return;
    out.parks.push(inner.slice());
    // A cross of paths through the middle, benches beside them, then trees wherever there is room.
    const [cx, cz] = centroid(inner);
    for (const [ux, uz] of [[1, 0], [0, 1]]) {
      for (let s = -60; s <= 60; s += 7) {
        const x = cx + ux * s, z = cz + uz * s;
        if (!inPoly(inner, x, z)) continue;
        if (Math.abs(s) > 4 && Math.round(s / 7) % 3 === 0) {
          const bx = x - uz * 1.6, bz = z + ux * 1.6, yaw = yawOf(uz, -ux);
          if (poi('bench', bx + ux * 0.65, bz + uz * 0.65, yaw, true, roadLines) && poi('bench', bx - ux * 0.65, bz - uz * 0.65, yaw, true, roadLines)) out.benches.push({ x: r2(bx), z: r2(bz), yaw: r6(yaw) });
        } else if (Math.round(s / 7) % 4 === 1) lamp(x + uz * 1.4, z - ux * 1.4, x + uz * 1.4, z - ux * 1.4, 'post');
        else if (Math.round(s / 7) % 5 === 2) poi('park', x + uz * 0.9, z - ux * 0.9, r.range(-Math.PI, Math.PI), false, roadLines, [5, 21]);
      }
    }
    const fountain: OBB = { cx, cz, hx: 3, hz: 3, yaw: 0 };
    if (P.free(fountain, 0.6)) prop('fountain', fountain, 1.2);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < inner.length; k += 2) { x0 = Math.min(x0, inner[k]); x1 = Math.max(x1, inner[k]); z0 = Math.min(z0, inner[k + 1]); z1 = Math.max(z1, inner[k + 1]); }
    for (let x = x0 + 3; x < x1 - 2; x += 6.5) for (let z = z0 + 3; z < z1 - 2; z += 6.5) {
      const tx = x + r.jitter(2), tz = z + r.jitter(2);
      if (!inPoly(inner, tx, tz) || Math.abs(tx - cx) < 3.2 || Math.abs(tz - cz) < 3.2 || r.chance(0.25)) continue;
      tree(r.pick(['round', 'round', 'flame', 'tall', 'layered'] as const), tx, tz, r.range(0.9, 1.3));
    }
  }
}

/** Walking-line offset of a line id (an arterial: its walk; a hẻm: 0). */
function walkOfLine(ctx: DressCtx, line: string) {
  if (line.startsWith('hem:')) return 0;
  return ctx.net.edges.find((e) => e.art === line)?.walk ?? 0;
}
function centroid(p: readonly number[]) {
  let x = 0, z = 0;
  for (let k = 0; k < p.length; k += 2) { x += p[k]; z += p[k + 1]; }
  return [x / (p.length / 2), z / (p.length / 2)] as const;
}
function rectPoly(cx: number, cz: number, hx: number, hz: number, yaw: number) {
  const s = Math.sin(yaw), c = Math.cos(yaw), out: number[] = [];
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(r2(cx + c * hx * i + s * hz * j), r2(cz - s * hx * i + c * hz * j));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Route and edge level: bus stops (before blocks), power poles (after the hẻm are in the graph).
// ---------------------------------------------------------------------------------------------------------------

/** The authored arterials in id order (never the order of the layout's list). */
const artsById = (net: Net) => [...net.arts].sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0));
/**
 * Shelters along bus routes, about every `spacing` metres (searched up to half that either way), alternating sides,
 * clear of decks and water, 24 m from junctions (three roads or a signal: mid-block on today's 54 m grid) and 8 m from a hẻm mouth.
 */
export function busStops(layoutKey: string, net: Net, placer: Placer, spacing: number, faces: readonly number[][]): Dressing {
  const out = emptyDressing();
  const clearOf = net.nodes.map((n, id) => {
    const at = net.edges.filter((e) => e.a === id || e.b === id), roads = at.filter((e) => e.cls !== 'hem').length + (n.legacy >= 0 ? 1 : 0);
    return roads >= 3 || n.control === 'signal' ? 24 : at.some((e) => e.cls === 'hem') ? 8 : 0;
  });
  const steps = [0];
  for (let d = 4; d <= spacing / 2; d += 4) steps.push(d, -d);
  for (const [art, a] of artsById(net)) {
    if (!a.bus || a.cls === 'hem') continue;
    const edges = net.edges.filter((e) => e.art === art), r = stream(layoutKey, 'bus', art);
    const e0 = edges[0];
    if (!e0) continue;
    const walk = e0.walk, front = e0.half + e0.sidewalk, seatOff = walk + 1.55, backOff = walk + 2.7;
    if (front - backOff < 0.3) continue;
    let side = r.chance(0.5) ? 1 : -1, k = 0;
    for (let s = spacing * 0.4; s < a.len - 30; s += spacing, side = -side) {
      for (const ds of steps) {
        const p = s + ds;
        if (p < 4 || p > a.len - 4) continue;
        const at = polylineAtLocal(a.pts, p);
        if (net.nodes.some((n, id) => clearOf[id] > 0 && hyp(n.x - at.x, n.z - at.z) < clearOf[id])) continue;
        if (edges.some((e) => e.decks.some((d) => { const h = polylineHit(e.pts, at.x, at.z); return h.d < 1 && h.s > d.s0 - d.ramp - 6 && h.s < d.s1 + d.ramp + 6; }))) continue;
        const rx = -at.hz * side, rz = at.hx * side, yaw = yawOf(-rx, -rz);
        const sx = at.x + rx * seatOff, sz = at.z + rz * seatOff, bx = at.x + rx * backOff, bz = at.z + rz * backOff;
        if (!faces.some((f) => inPoly(f, bx, bz))) continue;
        const shelter: OBB = { cx: bx, cz: bz, hx: 2.2, hz: 0.125, yaw };
        if (!placer.free(shelter, 0.1)) continue;
        const key = `bus:${art}:${k++}`, c = { x: r2(at.x + rx * walk), z: r2(at.z + rz * walk) };
        const s0 = placer.add({ ...shelter, cx: r2(bx), cz: r2(bz), top: 2.6, kind: 'prop', key });
        out.solids.push(s0);
        const ab = boxOf(shelter);
        out.props.push({ key, kind: 'shelter', x: r2(bx), z: r2(bz), sx: r2(ab.maxX - ab.minX), sz: r2(ab.maxZ - ab.minZ), yaw: r6(yaw), tint: r2(r.next()), w: 4.4, d: 0.25, variant: 0, hours: null });
        out.busStops.push({ x: r2(sx), z: r2(sz), yaw: r6(yaw) });
        for (const l of [-0.7, 0.7]) {
          const px = sx + at.hx * l, pz = sz + at.hz * l, curb = { x: r2(c.x + at.hx * l), z: r2(c.z + at.hz * l) };
          out.pois.push({ key: `${key}:${l > 0 ? 'b' : 'a'}`, kind: 'bus-stop', x: r2(px), z: r2(pz), yaw: r6(yaw), curb, seat: true, hours: null });
          placer.line({ ax: px, az: pz, bx: curb.x, bz: curb.z, clear: PED + 0.1, kind: 'path' });
        }
        break;
      }
    }
  }
  return out;
}
function polylineAtLocal(pts: readonly number[], s: number) {
  let run = 0;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const dx = pts[k + 2] - pts[k], dz = pts[k + 3] - pts[k + 1], l = hyp(dx, dz);
    if (s <= run + l || k + 4 >= pts.length) { const t = Math.max(0, Math.min(1, (s - run) / (l || 1))); return { x: pts[k] + dx * t, z: pts[k + 1] + dz * t, hx: dx / (l || 1), hz: dz / (l || 1) }; }
    run += l;
  }
  return { x: pts[0], z: pts[1], hx: 1, hz: 0 };
}

/**
 * Power poles in the curb band (between the curb and the walking line) of every street: every 24 m on the side the
 * street's hash picks, every 48 m on the other; every 5th main pole carries a transformer. Placed after the hẻm
 * are in the graph, so they keep off every crosswalk and hẻm mouth.
 */
export function polesFor(layoutKey: string, net: Net, placer: Placer): Dressing {
  const out = emptyDressing();
  for (const [art, a] of artsById(net)) {
    if (a.cls === 'hem') continue;
    const e0 = net.edges.find((e) => e.art === art);
    if (!e0 || e0.walk - e0.half < 1.2) continue;
    const r = stream(layoutKey, 'poles', art), mainSide = r.chance(0.5) ? 1 : -1, off = r2(e0.half + 0.5);
    for (const side of [mainSide, -mainSide]) {
      const main = side === mainSide, step = main ? 24 : 48;
      let count = 0;
      for (let s = r.range(4, 12); s < a.len - 2; s += step) {
        for (const ds of [0, 2, -2, 4, -4]) {
          const at = polylineAtLocal(a.pts, s + ds), rx = -at.hz * side, rz = at.hx * side;
          const x = at.x + rx * off, z = at.z + rz * off;
          if (net.nodes.some((n) => n.control !== 'none' && hyp(n.x - x, n.z - z) < Math.max(14, e0.half + 7))) continue;
          if (net.edges.some((e) => e.art === art && e.decks.some((d) => { const h = polylineHit(e.pts, x, z); return h.d < e.half + 3 && h.s > d.s0 - d.ramp - 2 && h.s < d.s1 + d.ramp + 2; }))) continue;
          const b: OBB = { cx: x, cz: z, hx: 0.15, hz: 0.15, yaw: 0 };
          if (!placer.free(b, 0.1)) continue;
          const key = `pole:${art}:${side}:${count}`, yaw = r6(yawOf(-rx, -rz));
          out.solids.push(placer.add({ ...b, cx: r2(x), cz: r2(z), top: 8.8, kind: 'pole', key }));
          out.poles.push({ key, x: r2(x), z: r2(z), yaw, line: `${art}:${side}`, main, transformer: main && count % 5 === 4 });
          count++;
          break;
        }
      }
    }
  }
  // A pole in the curb band beside every hẻm mouth, carrying the cables down the hẻm.
  for (const e of [...net.edges].sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0))) {
    if (e.cls !== 'hem') continue;
    for (const end of [0, 1] as const) {
      const id = end ? e.b : e.a, n = net.nodes[id], street = net.edges.find((t) => t.cls !== 'hem' && (t.a === id || t.b === id));
      if (!street || street.walk - street.half < 1.2) continue;
      const k = end ? e.pts.length - 4 : 2, h = polylineHit(street.pts, n.x, n.z), side = (e.pts[k] - n.x) * -h.hz + (e.pts[k + 1] - n.z) * h.hx >= 0 ? 1 : -1, off = street.half + 0.5;
      for (const ds of [2.6, -2.6, 3.6, -3.6, 4.8, -4.8]) {
        const x = n.x + h.hx * ds - h.hz * side * off, z = n.z + h.hz * ds + h.hx * side * off, b: OBB = { cx: x, cz: z, hx: 0.15, hz: 0.15, yaw: 0 };
        if (!placer.free(b, 0.1)) continue;
        const key = `pole:${e.key}:${end}`;
        out.solids.push(placer.add({ ...b, cx: r2(x), cz: r2(z), top: 8.8, kind: 'pole', key }));
        out.poles.push({ key, x: r2(x), z: r2(z), yaw: r6(yawOf(h.hz * side, -h.hx * side)), line: e.art.startsWith('hem:') ? e.art : `hem:${e.art}`, main: false, transformer: false });
        break;
      }
    }
  }
  return out;
}

/** Merges dressings in order. */
export function mergeDressing(into: Dressing, d: Dressing) {
  for (const k of Object.keys(into) as (keyof Dressing)[]) (into[k] as unknown[]).push(...(d[k] as unknown[]));
  return into;
}
