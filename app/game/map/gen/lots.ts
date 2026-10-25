/**
 * Generator v2, step 3: hẻm and lots, one block at a time from the block's own stream. A block deeper than two rows
 * of houses and an alley gets a hẻm spine down its middle, through to the side streets where they are streets: a
 * back alley the rows on either side back onto, or, where the block is deep enough for houses facing the hẻm too, a
 * hẻm network with connectors to the frontage streets every 40–80 m and dead-end branches; a shallower block gets
 * through-hẻm across it. Then lots: an institution the zone asks for (market hall, pagoda or church compound,
 * school), frontage lots along every street side (nhà ống 4–6 m wide and 12–18 m deep with 1.8–2.8 m gaps between
 * some of them, wider corner shops; warehouses, chung cư slabs and villas by zone), then lots facing the hẻm. The
 * gaps line up across the block, or reach the back alley, and become footways. Nothing here reads another block, so
 * blocks never disturb each other.
 */
import type { Footway, RoadClass } from '../roads.ts';
import { stream } from '../rng.ts';
import { BANK_SETBACK, ZONE_STYLES, type DistrictLayout, type ZoneKind } from '../layout/types.ts';
import type { HemPlan, Net } from './arterials.ts';
import type { Block, SideTag } from './blocks.ts';
import { corners, grow, hyp, inPoly, obbInPoly, obbOverlap, obbPolylineDist, obbPolyOverlap, obbSegDist, polyEdgeDist, polylineHit, polylineLength, r2, r6, segCross, segDist, segSegDist, yawOf, type OBB } from './geom.ts';

export type LotUse = 'row' | 'hem' | 'market' | 'pagoda' | 'church' | 'school';
export type Lot = {
  key: string; block: string; zone: ZoneKind; use: LotUse;
  /** The zone's name from the layout (a market's or pagoda's name), if any. */
  name: string | null;
  /** Footprint: hx = half the frontage width, hz = half the depth, yaw = the way the front faces. */
  box: OBB; w: number; d: number;
  /** The line it fronts: an arterial id or 'hem:<key>', its class and the walking-line offset from its centre line. */
  line: string; cls: RoadClass; walk: number;
  corner: boolean;
  /** Metres the back may reach out over a mud bank (stilt houses). */
  stilt: number;
};
/** A box nothing else may use: stamps with their yards, institutions, bus stops. */
export type Reserved = { box: OBB; pad: number };
/** A block's hẻm and lots, and the footways through the gaps between its houses. */
export type BlockPlan = { block: Block; hems: HemPlan[]; lots: Lot[]; footways: Footway[] };

const CLS_RANK: Record<RoadClass, number> = { R1: 0, R2: 1, hem: 2 };
const MOUTH_CLEAR = 14;
const HEM_WALL = 0.35;
/** Gaps between houses in a row (today's city.ts addRow): width, and the chance of one after a lot. */
const GAP: [number, number] = [1.8, 2.8], GAP_CHANCE = 0.55;
/** A footway keeps this far off every lot (a person's half-width and a little). */
const WAY_CLEAR = 0.5;

/** Street number of a point along an arterial: even on the right of its direction, odd on the left, about one per 4 m. */
export function streetNumber(net: Net, art: string, x: number, z: number) {
  const a = net.arts.get(art);
  if (!a) return 1;
  const h = polylineHit(a.pts, x, z);
  return 2 * Math.max(1, Math.round(h.s / 4)) - (h.off > 0 ? 0 : 1);
}

type Side = { i: number; tag: SideTag; ax: number; az: number; hx: number; hz: number; nx: number; nz: number; len: number };
function sidesOf(b: Block): Side[] {
  const p = b.inner!, n = p.length / 2;
  return b.sides.map((tag, i) => {
    const j = (i + 1) % n, dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1], len = hyp(dx, dz) || 1;
    // Inside is on the right: (-hz, hx).
    return { i, tag, ax: p[i * 2], az: p[i * 2 + 1], hx: dx / len, hz: dz / len, nx: -dz / len, nz: dx / len, len };
  });
}
/** Where a ray from (x, z) along (dx, dz) first leaves the polygon: distance and side index. */
function rayExit(poly: number[], x: number, z: number, dx: number, dz: number) {
  const n = poly.length / 2, far = 1e4;
  let best = Infinity, side = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, hit = segCross(x, z, x + dx * far, z + dz * far, poly[i * 2], poly[i * 2 + 1], poly[j * 2], poly[j * 2 + 1]);
    if (hit && hit[0] * far > 0.01 && hit[0] * far < best) { best = hit[0] * far; side = i; }
  }
  return { t: best, side };
}
/** Where the line through (x, z) along (dx, dz) meets polyline pts (nearest to the point), or null. */
function lineMeets(pts: readonly number[], x: number, z: number, dx: number, dz: number) {
  let best: { x: number; z: number; t: number } | null = null;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const hit = segCross(x - dx * 400, z - dz * 400, x + dx * 400, z + dz * 400, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]);
    if (!hit) continue;
    const t = hit[0] * 800 - 400;
    if (!best || Math.abs(t) < Math.abs(best.t)) best = { x: x + dx * t, z: z + dz * t, t };
  }
  return best;
}

/**
 * The lot box with its front centre at (fx, fz), facing out along -(nx, nz), w wide and d deep. Neighbours keep
 * 4 cm apart, so rounding to 1 cm never makes party walls overlap.
 */
const lotBox = (fx: number, fz: number, nx: number, nz: number, w: number, d: number): OBB =>
  ({ cx: r2(fx + nx * d / 2), cz: r2(fz + nz * d / 2), hx: r2(w / 2 - 0.02), hz: r2(d / 2 - 0.02), yaw: r6(yawOf(-nx, -nz)) });

export function planBlock(layout: DistrictLayout, net: Net, block: Block, reserved: Reserved[]): BlockPlan {
  const plan: BlockPlan = { block, hems: [], lots: [], footways: [] };
  if (!block.inner || block.zone === 'park') return plan;
  const inner = block.inner, style = ZONE_STYLES[block.zone], rng = stream(layout.key, 'block', block.key);
  const sides = sidesOf(block), roads = sides.filter((s) => s.tag.kind === 'road');
  if (!roads.length) return plan;
  const weight = (s: Side) => s.len * (s.tag.kind === 'road' ? [1.3, 1, 0.7][CLS_RANK[s.tag.cls]] : 0);
  // The main street: the heaviest side, ties to the street id, then the corner (never to the order of a list).
  const artOf = (s: Side) => (s.tag.kind === 'road' ? s.tag.art : '');
  const heavier = (s: Side, m: Side) => {
    const d = weight(s) - weight(m);
    return Math.abs(d) > 1e-9 ? d > 0 : artOf(s) !== artOf(m) ? artOf(s) < artOf(m) : s.ax < m.ax || (s.ax === m.ax && s.az < m.az);
  };
  const main = roads.reduce((m, s) => (heavier(s, m) ? s : m));
  // Block frame: u along the main side, n into the block; T is the depth, [s0, s1] the length.
  let T = 0, s0 = Infinity, s1 = -Infinity;
  for (let k = 0; k < inner.length; k += 2) {
    const dx = inner[k] - main.ax, dz = inner[k + 1] - main.az;
    T = Math.max(T, dx * main.nx + dz * main.nz);
    s0 = Math.min(s0, dx * main.hx + dz * main.hz); s1 = Math.max(s1, dx * main.hx + dz * main.hz);
  }
  const at = (s: number, t: number) => [main.ax + main.hx * s + main.nx * t, main.az + main.hz * s + main.nz * t] as const;
  const uOf = (x: number, z: number) => (x - main.ax) * main.hx + (z - main.az) * main.hz;
  const corridors: { pts: number[]; half: number }[] = [];
  // Streets that end inside the block (dead ends do not bound faces) keep lots off their asphalt and sidewalks;
  // houses face an authored dead-end hẻm like a generated one.
  const alleys: { pts: number[]; half: number; art: string }[] = [];
  for (const e of net.edges) {
    for (let k = 0; k + 3 < e.pts.length; k += 2) {
      const mx = (e.pts[k] + e.pts[k + 2]) / 2, mz = (e.pts[k + 1] + e.pts[k + 3]) / 2;
      if (!inPoly(block.face, mx, mz) || polyEdgeDist(block.face, mx, mz) <= 0.5) continue;
      corridors.push({ pts: e.pts, half: e.cls === 'hem' ? e.half : e.half + e.sidewalk - HEM_WALL });
      if (e.cls === 'hem') alleys.push({ pts: e.pts, half: e.half, art: e.art });
      break;
    }
  }
  const keep: Reserved[] = reserved.filter((r) => inPoly(block.face, r.box.cx, r.box.cz) || obbInPolyLoose(r.box, block.face));
  // Water near the block: no hẻm or footway crosses it (a pond or a creek's end inside the block, see clear()).
  const fb = polyBox(block.face, 4);
  const waters = (layout.waterways ?? []).map((w) => w.poly).filter((p) => { const b = polyBox(p, 0); return b.maxX >= fb.minX && b.minX <= fb.maxX && b.maxZ >= fb.minZ && b.minZ <= fb.maxZ; });
  const dry = (pts: readonly number[]) => {
    if (!waters.length) return true;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const n = Math.max(1, Math.ceil(hyp(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1])));
      for (let i = 0; i <= n; i++) {
        const x = pts[k] + ((pts[k + 2] - pts[k]) * i) / n, z = pts[k + 1] + ((pts[k + 3] - pts[k + 1]) * i) / n;
        if (waters.some((w) => inPoly(w, x, z))) return false;
      }
    }
    return true;
  };

  // ---- hẻm ----
  /**
   * The street mouth for a hẻm leaving the block across side `si` along (dx, dz) from (x, z): the point on the
   * street's centre line and the street edge; `near` is the node closer than MOUTH_CLEAR that refuses a mouth there
   * (-1: a mouth may go there). Null where there is no street (or a bridge ramp is).
   */
  const mouth = (si: number, x: number, z: number, dx: number, dz: number) => {
    const tag = sides[si]?.tag;
    if (!tag || tag.kind !== 'road') return null;
    const a = net.arts.get(tag.art);
    if (!a) return null;
    const m = lineMeets(a.pts, x, z, dx, dz);
    if (!m) return null;
    let edge = -1, bd = Infinity;
    net.edges.forEach((e, ei) => {
      if (e.art !== tag.art) return;
      const d = polylineHit(e.pts, m.x, m.z).d;
      if (d < bd - 1e-9 || (d < bd + 1e-9 && e.key < net.edges[edge].key)) { bd = Math.min(bd, d); edge = ei; }
    });
    if (edge < 0) return null;
    const e = net.edges[edge], h = polylineHit(e.pts, m.x, m.z);
    if (e.decks.some((d) => h.s > d.s0 - d.ramp - 4 && h.s < d.s1 + d.ramp + 4)) return null;
    // A hẻm meets its street at no less than 35° (a sharper mouth makes a sliver junction and a long crosswalk).
    if (Math.abs(dx * h.hz - dz * h.hx) < 0.57 * hyp(dx, dz)) return null;
    // Not through a shelter on the sidewalk or a stamp's yard.
    if (keep.some((r) => obbSegDist(r.box, x, z, m.x, m.z) < 2.5)) return null;
    let near = -1, nd = Infinity;
    for (const id of [e.a, e.b]) {
      const n = net.nodes[id], d = hyp(n.x - m.x, n.z - m.z);
      if (d < MOUTH_CLEAR + (n.roundabout || 0) && d < nd) { near = id; nd = d; }
    }
    return { x: r2(m.x), z: r2(m.z), edge, near };
  };
  /** Whether node `id` is a hẻm's mouth on the far side of side `si`'s street (nothing else meets there). */
  const mouthAcross = (id: number, si: number) => {
    if (net.nodes[id].legacy >= 0) return false;
    const there = net.edges.filter((e) => e.a === id || e.b === id), hem = there.filter((e) => e.cls === 'hem');
    if (hem.length !== 1 || new Set(there.filter((e) => e.cls !== 'hem').map((e) => e.art)).size !== 1) return false;
    const h = hem[0], k = h.a === id ? 2 : h.pts.length - 4, n = net.nodes[id];
    return (h.pts[k] - n.x) * sides[si].nx + (h.pts[k + 1] - n.z) * sides[si].nz < 0;
  };
  const hemName = (x: number, z: number, art: string) => `HẺM ${streetNumber(net, art, x, z)}`;
  const corridorOf = new Map<string, { pts: number[]; half: number }>();
  const addHem = (pts: number[], half: number, kind: HemPlan['kind'], ends: [number, number], joins: [string | null, string | null], nameAt: [number, number, string]) => {
    // Never over water, a stamp or its yard, or a shelter.
    if (!dry(pts) || keep.some((r) => obbPolylineDist(grow(r.box, r.pad), pts) < half + HEM_WALL)) return null;
    const key = `${block.key}:h${plan.hems.length}`, c = { pts, half };
    plan.hems.push({ key, block: block.key, pts: pts.map(r2), half, kind, ends, joins, name: hemName(...nameAt) });
    corridors.push(c);
    corridorOf.set(key, c);
    return key;
  };
  const dropHem = (key: string) => {
    corridors.splice(corridors.indexOf(corridorOf.get(key)!), 1);
    plan.hems.splice(plan.hems.findIndex((h) => h.key === key), 1);
  };
  /**
   * A hẻm along the block at depth t, clipped to the block. Each end runs on to its street as a mouth. Where a node
   * there refuses one, it crosses the sidewalk to the hẻm mouth opposite (a staggered crossing) or stops a lot's
   * depth short of the street, so a frontage lot closes it (a hẻm cụt): it never opens onto a sidewalk unlinked.
   * With `needMouth`, a lane no street end reaches is not made.
   */
  const lane = (t: number, half: number, needMouth: boolean) => {
    const [ox, oz] = at(0, t), hits: { s: number; side: number }[] = [];
    sides.forEach((sd, i) => {
      const hit = segCross(ox - main.hx * 1e4, oz - main.hz * 1e4, ox + main.hx * 1e4, oz + main.hz * 1e4, sd.ax, sd.az, sd.ax + sd.hx * sd.len, sd.az + sd.hz * sd.len);
      if (hit) hits.push({ s: hit[0] * 2e4 - 1e4, side: i });
    });
    hits.sort((p, q) => p.s - q.s);
    if (hits.length < 2) return null;
    const end = (hit: { s: number; side: number }, dir: 1 | -1) => {
      const m = mouth(hit.side, ox + main.hx * hit.s, oz + main.hz * hit.s, main.hx, main.hz);
      const art = artOf(sides[hit.side]);
      if (m && m.near < 0) return { pts: [m.x, m.z], edge: m.edge, pull: 0, name: [m.x, m.z, art] as [number, number, string] };
      if (m && mouthAcross(m.near, hit.side)) {
        const n = net.nodes[m.near], [fx, fz] = at(hit.s, t);
        return { pts: dir > 0 ? [n.x, n.z, fx, fz] : [fx, fz, n.x, n.z], edge: m.edge, pull: 0, name: [n.x, n.z, art] as [number, number, string] };
      }
      // Measured across the side: a hẻm meeting it at a slant stops farther back along its own line.
      const sd = sides[hit.side], slant = Math.max(0.3, Math.abs(main.hx * sd.hz - main.hz * sd.hx));
      const pull = sd.tag.kind === 'road' ? (style.depth[0] + half + HEM_WALL) / slant : 0.3;
      return { pts: [...at(hit.s + dir * pull, t)], edge: -1, pull, name: null };
    };
    const a = hits[0], b = hits[hits.length - 1], A = end(a, 1), B = end(b, -1);
    if (b.s - a.s - A.pull - B.pull < 12 || (needMouth && A.edge < 0 && B.edge < 0)) return null;
    const art = A.name?.[2] ?? B.name?.[2] ?? artOf(main);
    const key = addHem([...A.pts, ...B.pts], half, 'spine', [A.edge, B.edge], [null, null], A.name ?? B.name ?? [...at(0, 0), art]);
    // [a, b]: the stretch along the block the lane really covers (connectors and branches join it there).
    return key ? { key, a: a.s + A.pull, b: b.s - B.pull, ox, oz, mouth: A.name ?? B.name, art, ends: [A.edge, B.edge] } : null;
  };
  // An authored street ending inside the block is its way in: the generator carves no hẻm across it.
  let backAlley = false;
  if (style.hem && !corridors.length && block.zone === 'apartment') {
    // Chung cư: parallel courtyard lanes, slabs facing them from both sides, through to the side streets.
    const slab = style.depth[1] + style.setback, pitch = 2 * (slab + HEM_WALL + style.spineHalf);
    for (let t = slab + HEM_WALL + style.spineHalf; t + style.spineHalf + HEM_WALL + slab <= T + 0.01 && s1 - s0 >= 40; t += pitch) lane(t, style.spineHalf, true);
  } else if (style.hem && !corridors.length) {
    const Dmin = style.depth[0], Dh = style.hemDepth[0];
    // Design 1: a block deeper than two rows of houses and the alley gets a spine. Too shallow for houses facing it
    // as well, it is a back alley the rows back onto; deeper, a hẻm network with its own houses.
    const backNeed = 2 * Dmin + 2 * style.spineHalf + 2 * HEM_WALL, fullNeed = backNeed + 2 * Dh;
    // A back alley runs through any block long enough for its two mouths; a network needs a longer one.
    if (T >= backNeed && s1 - s0 >= (T < fullNeed ? 24 : 40)) {
      backAlley = T < fullNeed;
      const tS = T / 2 + rng.jitter(Math.min(T * 0.05, (T - (backAlley ? backNeed : fullNeed)) / 2));
      const L = lane(tS, style.spineHalf, false);
      if (L) {
        const { key: spineKey, a: sa, b: sb, ox, oz, art } = L;
        // Connectors every 40–80 m, alternating towards the main street and the far side.
        const step = rng.range(40, 80);
        let k = 0;
        for (let s = sa + step * 0.6; s < sb - 18; s += step * rng.range(0.85, 1.15), k++) {
          const [cx, cz] = at(s, tS);
          for (const dir of k % 2 === 0 ? [-1, 1] : [1, -1]) {
            const ex = rayExit(inner, cx, cz, main.nx * dir, main.nz * dir);
            const m = ex.side >= 0 ? mouth(ex.side, cx, cz, main.nx * dir, main.nz * dir) : null;
            if (!m || m.near >= 0) continue;
            if (!addHem([m.x, m.z, cx, cz], Math.min(1.5, style.spineHalf), 'connector', [m.edge, -1], [null, spineKey], [m.x, m.z, artOf(sides[ex.side])])) continue;
            if (rng.chance(0.55)) break;
          }
        }
        if (L.ends[0] < 0 && L.ends[1] < 0 && !plan.hems.some((h) => h.kind === 'connector')) dropHem(spineKey);
        else if (!backAlley) {
          // Dead-end branches (hẻm cụt, 2.2 m) off the spine where the land between it and the street rows is deep.
          const reach = tS - style.spineHalf - HEM_WALL - Dmin - 1.5;
          if (reach >= 14 && style.spineHalf < 2) {
            // Branch joints keep 9 m from connectors and 4 m from each other (joints closer than 3 m share a node).
            const joints = plan.hems.filter((h) => h.kind === 'connector').map((h) => (h.pts[2] - ox) * main.hx + (h.pts[3] - oz) * main.hz), twigs: number[] = [];
            const spineName = plan.hems.find((h) => h.key === spineKey)!.name;
            for (const dir of [-1, 1]) {
              for (let s = sa + rng.range(14, 24); s < sb - 12; s += rng.range(24, 34)) {
                if (joints.some((j) => Math.abs(j - s) < 9) || twigs.some((j) => Math.abs(j - s) < 4)) continue;
                const [cx, cz] = at(s, tS), len = reach * rng.range(0.7, 1);
                const ex = rayExit(inner, cx, cz, main.nx * dir, main.nz * dir);
                if (ex.t < len + Dmin) continue;
                if (!addHem([cx, cz, cx + main.nx * dir * len, cz + main.nz * dir * len], 1.1, 'branch', [-1, -1], [spineKey, null], [...(L.mouth ? [L.mouth[0], L.mouth[1]] : [cx, cz]), art] as [number, number, string])) continue;
                plan.hems[plan.hems.length - 1].name = spineName;
                twigs.push(s);
              }
            }
          }
        }
      }
    } else if (s1 - s0 >= 40 && T >= 2 * Dmin) {
      // Through-hẻm across the block, from the main street to whatever is behind it (one in the middle of a short block).
      const step = rng.range(55, 85), short = s1 - s0 < 75;
      for (let s = s0 + (short ? (s1 - s0) / 2 : step * 0.55) + rng.jitter(short ? 4 : 6); s < s1 - (short ? 15 : 30); s += step) {
        const [fx, fz] = at(s, 0.01);
        const m = mouth(main.i, fx, fz, -main.nx, -main.nz);
        if (!m || m.near >= 0) continue;
        const ex = rayExit(inner, fx, fz, main.nx, main.nz);
        if (ex.side < 0) continue;
        const far = mouth(ex.side, fx + main.nx * ex.t, fz + main.nz * ex.t, main.nx, main.nz), open = !!far && far.near < 0;
        // Refused at the far street, it stops a lot's depth short of it (a hẻm cụt), never on the sidewalk.
        const fs = sides[ex.side], back = open ? 0 : fs.tag.kind === 'road' ? (Dmin + 1.5 + HEM_WALL) / Math.max(0.3, Math.abs(main.nx * fs.hz - main.nz * fs.hx)) : 0.3;
        if (ex.t - back < 8) continue;
        const end = open ? [far!.x, far!.z] : [fx + main.nx * (ex.t - back), fz + main.nz * (ex.t - back)];
        addHem([m.x, m.z, end[0], end[1]], 1.5, 'through', [m.edge, open ? far!.edge : -1], [null, null], [m.x, m.z, artOf(main)]);
      }
    }
  }

  // ---- lots ----
  const placed: OBB[] = [];
  const convex = isConvex(inner);
  const grown = keep.map((r) => ({ ...r.box, hx: r.box.hx + r.pad, hz: r.box.hz + r.pad }));
  const clear = (b: OBB) => {
    if (!(convex ? cornersIn(b, inner) : obbInPoly(b, inner, 0))) return false;
    const reach = b.hx + b.hz;
    for (const c of corridors) {
      // Cheap reject first: the corridor's centre line is farther than the box can reach.
      let near = Infinity;
      for (let k = 0; k + 3 < c.pts.length; k += 2) near = Math.min(near, segDist(b.cx, b.cz, c.pts[k], c.pts[k + 1], c.pts[k + 2], c.pts[k + 3]));
      if (near - reach < c.half + HEM_WALL && obbPolylineDist(b, c.pts) < c.half + HEM_WALL - 0.01) return false;
    }
    for (const g of grown) if (obbOverlap(b, g)) return false;
    for (const p of placed) if (obbOverlap(b, p, -0.005)) return false;
    // Water inside the block (a pond, a creek's end): its bank's setback all round.
    for (const h of block.holes) if (obbPolyOverlap(grow(b, BANK_SETBACK[h.bank]), h.poly)) return false;
    return true;
  };
  const push = (box: OBB, w: number, d: number, use: LotUse, line: string, cls: RoadClass, walk: number, corner: boolean) => {
    placed.push(box);
    plan.lots.push({ key: `${block.key}:${plan.lots.length}`, block: block.key, zone: block.zone, use, name: block.zoneName, box, w: r2(w), d: r2(d), line, cls, walk, corner, stilt: 0 });
  };

  // Institutions first, centred on the main street.
  const inst: LotUse | null = block.zone === 'market' ? 'market' : block.zone === 'pagoda' ? 'pagoda' : block.zone === 'church' ? 'church' : block.zone === 'school' ? 'school' : null;
  if (inst && main.tag.kind === 'road') {
    const [w0, d0] = { market: [46, 32], pagoda: [28, 32], church: [26, 36], school: [40, 28] }[inst as 'market'];
    const tag = main.tag;
    found: for (let shrink = 1; shrink >= 0.55; shrink -= 0.15) {
      const w = Math.min(w0 * shrink, main.len - 12), d = Math.min(d0 * shrink, T - 2);
      if (w < 14 || d < 12) break;
      for (const off of [0, 6, -6, 12, -12, 18, -18]) {
        const c = main.len / 2 + off;
        const box = lotBox(main.ax + main.hx * c, main.az + main.hz * c, main.nx, main.nz, w, d);
        if (clear(box)) { push(box, w, d, inst, tag.art, tag.cls, tag.walk, false); break found; }
      }
    }
  }

  // Frontage rows, the most important street first. Rows of narrow houses along the main street's direction leave
  // gaps; with a spine every gap reaches it, without one the row opposite leaves its gaps where the first one did.
  const gapRows = style.width[1] <= 7, spine = plan.hems.find((h) => h.kind === 'spine') ?? null;
  const passages: { u: number; w: number }[] = [];
  const gaps: { sd: Side; s: number; line: string; walk: number; pass: number }[] = [];
  const order = sides.filter((s) => s.tag.kind === 'road').sort((p, q) => CLS_RANK[(p.tag as { cls: RoadClass }).cls] - CLS_RANK[(q.tag as { cls: RoadClass }).cls] || q.len - p.len || p.i - q.i);
  const n = sides.length;
  for (const sd of order) {
    const tag = sd.tag as Extract<SideTag, { kind: 'road' }>;
    const prevRoad = sides[(sd.i + n - 1) % n].tag.kind === 'road', nextRoad = sides[(sd.i + 1) % n].tag.kind === 'road';
    row(sd, tag.art, tag.cls, tag.walk, style.width, style.depth, prevRoad, nextRoad, 'row');
  }
  // Lots along each hẻm, both sides.
  for (const h of [...plan.hems.map((p) => ({ pts: p.pts, half: p.half, line: `hem:${p.key}` })), ...alleys.map((a) => ({ pts: a.pts, half: a.half, line: a.art }))]) {
    const pts = h.pts, len = polylineLength(pts);
    if (len < 8) continue;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const dx = pts[k + 2] - pts[k], dz = pts[k + 3] - pts[k + 1], l = hyp(dx, dz);
      if (l < 6) continue;
      for (const side of [1, -1]) {
        const nx = (-dz / l) * side, nz = (dx / l) * side, off = h.half + HEM_WALL;
        const sd: Side = { i: -1, tag: { kind: 'bound', front: 0 }, ax: pts[k] + nx * off, az: pts[k + 1] + nz * off, hx: dx / l, hz: dz / l, nx, nz, len: l };
        if (side < 0) { sd.ax += sd.hx * l; sd.az += sd.hz * l; sd.hx = -sd.hx; sd.hz = -sd.hz; }
        row(sd, h.line, 'hem', 0, style.hemWidth, style.hemDepth, false, false, 'hem');
      }
    }
  }
  // Stilt houses: lots whose back meets a mud bank reach out over the water.
  for (const lot of plan.lots) {
    if (lot.use !== 'row' && lot.use !== 'hem') continue;
    const ex = rayExit(inner, lot.box.cx, lot.box.cz, -Math.sin(lot.box.yaw), -Math.cos(lot.box.yaw));
    if (ex.side < 0) continue;
    const tag = sides[ex.side].tag, gap = ex.t - lot.box.hz;
    if (tag.kind === 'water' && tag.bank === 'mud' && gap < 1.5) lot.stilt = r2(gap + tag.front + rng.range(2.5, 5.5));
  }

  // Footways through the gaps (design 1: the gaps become R4 nav edges): from the street's walking line through the
  // gap to the back alley's centre line, or on through the gap opposite to the far street's walking line.
  const walkAt = (g: (typeof gaps)[number]) => {
    const x = g.sd.ax + g.sd.hx * g.s, z = g.sd.az + g.sd.hz * g.s, h = polylineHit(net.arts.get(g.line)!.pts, x, z), side = h.off >= 0 ? 1 : -1;
    return { x, z, wx: h.x - h.hz * side * g.walk, wz: h.z + h.hx * side * g.walk };
  };
  const wayClear = (ax: number, az: number, bx: number, bz: number, skip: string | null) => {
    if (!dry([ax, az, bx, bz])) return false;
    for (const l of plan.lots) if (obbSegDist(l.box, ax, az, bx, bz) < WAY_CLEAR) return false;
    for (const r of keep) if (obbSegDist(r.box, ax, az, bx, bz) < WAY_CLEAR + 0.1) return false;
    for (const c of corridors) {
      if (skip && c === corridorOf.get(skip)) continue;
      for (let k = 0; k + 3 < c.pts.length; k += 2) if (segSegDist(ax, az, bx, bz, c.pts[k], c.pts[k + 1], c.pts[k + 2], c.pts[k + 3]) < c.half + 0.1) return false;
    }
    return true;
  };
  const way = (ax: number, az: number, bx: number, bz: number, skip: string | null) => {
    if (hyp(bx - ax, bz - az) > 2 && wayClear(ax, az, bx, bz, skip)) plan.footways.push({ ax: r2(ax), az: r2(az), bx: r2(bx), bz: r2(bz) });
  };
  passages.forEach((_, id) => {
    const gs = gaps.filter((g) => g.pass === id);
    if (spine) {
      for (const g of gs) {
        const w = walkAt(g), m = lineMeets(spine.pts, w.x, w.z, g.sd.nx, g.sd.nz);
        if (m && m.t > 0) way(w.wx, w.wz, m.x, m.z, spine.key);
      }
    } else if (gs.length === 2) { const a = walkAt(gs[0]), b = walkAt(gs[1]); way(a.wx, a.wz, b.wx, b.wz, null); }
  });
  return plan;

  /** A row of lots along side `sd` (its line runs from (ax, az) along (hx, hz); the block is towards (nx, nz)). */
  function row(sd: Side, line: string, cls: RoadClass, walk: number, widths: [number, number], depths: [number, number], cornerA: boolean, cornerB: boolean, use: LotUse) {
    const wmin = widths[0];
    // Gaps (today's addRow): 1.8–2.8 m after about every other house, at least one in a row of three or more, on the
    // rows along the main street's direction. A row that follows another without a spine between them keeps to its
    // passages instead, so each gap lines up with one opposite.
    const along = sd.hx * main.hx + sd.hz * main.hz, par = use === 'row' && gapRows && Math.abs(along) > 0.97;
    const lead = par && (!!spine || !passages.length), u0 = uOf(sd.ax, sd.az);
    const due = par && !lead ? passages.map((p, pass) => ({ s: (p.u - u0) / along, w: p.w, pass })).filter((p) => p.s - p.w / 2 > 1 && p.s + p.w / 2 < sd.len - 1).sort((p, q) => p.s - q.s) : [];
    let s = 0, k = 0, misses = 0, made = 0;
    while (s < sd.len - wmin * 0.8) {
      while (due.length && s > due[0].s + due[0].w / 2) due.shift();
      const first = k === 0 && s < 1;
      let w = first && cornerA ? rng.range(...style.corner) : rng.range(...widths);
      const left = sd.len - s - w;
      if (left < wmin && left > -w * 0.4) w = sd.len - s;
      const next = due[0];
      if (next && s + w > next.s - next.w / 2 - 0.3) {
        // A passage: end this lot where it begins, or step straight over it.
        const room = next.s - next.w / 2 - s;
        if (room < wmin * 0.8) { gaps.push({ sd, s: next.s, line, walk, pass: next.pass }); s = next.s + next.w / 2; due.shift(); continue; }
        w = room;
      }
      if (w < wmin * 0.8) break;
      const fx = sd.ax + sd.hx * (s + w / 2), fz = sd.az + sd.hz * (s + w / 2);
      // Depth: the zone's target, at most half the way to a street behind (back to back), or to the spine.
      const ex = rayExit(inner, fx + sd.nx * 0.02, fz + sd.nz * 0.02, sd.nx, sd.nz);
      let cap = ex.t;
      if (ex.side >= 0 && sides[ex.side].tag.kind === 'road' && use === 'row') cap = ex.t / 2;
      for (const c of corridors) {
        const m = lineMeets(c.pts, fx, fz, sd.nx, sd.nz);
        if (m && m.t > 0 && m.t < cap + c.half + HEM_WALL) {
          // A back alley takes the rows right up to it; a hẻm with houses of its own leaves them room.
          const room = m.t - c.half - HEM_WALL - (use === 'row' && !backAlley ? style.hemDepth[0] : 0);
          if (room >= depths[0] * 0.6) cap = Math.min(cap, room);
        }
      }
      // Rows meet their neighbours behind (back to back, or the hẻm lots): fill to the cap when it is close.
      const want = cap <= depths[1] + 4 ? cap : Math.min(rng.range(...depths), cap), dmin = depths[0] * 0.55;
      let done = false;
      if (want >= dmin) {
        let d = want;
        if (!clear(lotBox(fx, fz, sd.nx, sd.nz, w, d))) {
          // The deepest lot that fits: binary search (clear() only gets harder with depth).
          let lo = dmin, hi = want;
          if (!clear(lotBox(fx, fz, sd.nx, sd.nz, w, lo))) lo = -1;
          else for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (clear(lotBox(fx, fz, sd.nx, sd.nz, w, mid))) lo = mid; else hi = mid; }
          d = lo;
        }
        if (d >= dmin) {
          const corner = (first && cornerA) || (sd.len - s - w < 0.5 && cornerB);
          push(lotBox(fx, fz, sd.nx, sd.nz, w, d), w, d, use, line, cls, walk, corner);
          done = true;
        }
      }
      // Creep past a corner a quarter metre at a time, then stride over hẻm mouths.
      if (!done) { s += misses++ < 3 ? 0.25 : 0.75; continue; }
      s += w; k++; misses = 0;
      if (next && Math.abs(s - (next.s - next.w / 2)) < 0.05) { gaps.push({ sd, s: next.s, line, walk, pass: next.pass }); s = next.s + next.w / 2; due.shift(); continue; }
      if (!lead) continue;
      const g = rng.range(...GAP);
      if (sd.len - s - g < wmin * 1.2 || !(rng.chance(GAP_CHANCE) || (k >= 2 && !made))) continue;
      gaps.push({ sd, s: s + g / 2, line, walk, pass: passages.length });
      passages.push({ u: uOf(sd.ax + sd.hx * (s + g / 2), sd.az + sd.hz * (s + g / 2)), w: g });
      s += g; made++;
    }
  }
}

function polyBox(p: readonly number[], pad: number) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < p.length; k += 2) { minX = Math.min(minX, p[k]); maxX = Math.max(maxX, p[k]); minZ = Math.min(minZ, p[k + 1]); maxZ = Math.max(maxZ, p[k + 1]); }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}
function isConvex(p: number[]) {
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2, c = ((i + 2) % n) * 2;
    if ((p[b] - p[a]) * (p[c + 1] - p[b + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[b]) < -1e-9) return false;
  }
  return true;
}
const CK = new Float64Array(8);
/** All four corners inside a convex polygon (inside on the right of each side, as blocks are walked). */
function cornersIn(b: OBB, p: number[]) {
  corners(b, CK);
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const a = i * 2, c = ((i + 1) % n) * 2, dx = p[c] - p[a], dz = p[c + 1] - p[a + 1];
    for (let k = 0; k < 8; k += 2) if (dx * (CK[k + 1] - p[a + 1]) - dz * (CK[k] - p[a]) < -1e-6) return false;
  }
  return true;
}

/** Whether any corner of a box lies in a face (a stamp straddling a block edge still bars its lots). */
function obbInPolyLoose(b: OBB, face: number[]) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (inPoly(face, b.cx + c * b.hx * i + s * b.hz * j, b.cz - s * b.hx * i + c * b.hz * j)) return true;
  return false;
}
