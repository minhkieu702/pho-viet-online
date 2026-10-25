/**
 * Generator v2, step 2: blocks. The authored streets, the waterway outlines and the layout bounds form a planar
 * subdivision; each bounded face that is neither water nor outside the bounds is a block. A block is moved in
 * from every side (a street by its asphalt and sidewalk, a bank by its setback, the bounds by 1 m) to the land
 * lots may use. Block keys come from the face's corner positions and every face starts at its lowest corner, so a
 * block keeps its key, its sides and its rng stream whatever happens elsewhere in the layout (or the order its
 * streets are listed in). Water inside a face that does not bound it is kept as a hole. Hẻm are carved later
 * (lots.ts) and never change the faces.
 */
import type { RoadClass } from '../roads.ts';
import { hashKey, pointKey } from '../rng.ts';
import { BANK_SETBACK, type BankKind, type DistrictLayout, type ZoneKind } from '../layout/types.ts';
import type { Net } from './arterials.ts';
import { hyp, inPoly, insetPolygon, polyArea, polyEdgeDist, r2, segCross } from './geom.ts';

export type SideTag =
  | { kind: 'road'; art: string; cls: RoadClass; half: number; sidewalk: number; walk: number; front: number }
  | { kind: 'water'; water: string; bank: BankKind; front: number }
  | { kind: 'bound'; front: number };
export type Block = {
  key: string;
  /** The face outline (street centre lines, banks, bounds) and the side tags, side i from vertex i to i+1. */
  face: number[]; faceSides: SideTag[];
  /** The land lots may use, or null where nothing is left (traffic islands, thin bank strips). */
  inner: number[] | null; sides: SideTag[];
  area: number; zone: ZoneKind; zoneName: string | null;
  /** A point inside the face. */
  label: [number, number];
  /** Water lying inside the face without bounding it (a pond, a creek's end): lots and hẻm keep off it. */
  holes: { water: string; bank: BankKind; poly: number[] }[];
};

const PRIORITY = { road: 3, water: 2, bound: 1 } as const;
const BOUND_SETBACK = 1;

type Seg = { ax: number; az: number; bx: number; bz: number; tag: SideTag; cuts: number[] };

/** Faces of the arterial network (before hẻm), clipped to the bounds, minus water. */
export function buildBlocks(layout: DistrictLayout, net: Net): Block[] {
  const segs: Seg[] = [];
  const push = (ax: number, az: number, bx: number, bz: number, tag: SideTag) => {
    if (hyp(bx - ax, bz - az) > 1e-6) segs.push({ ax, az, bx, bz, tag, cuts: [0, 1] });
  };
  for (const e of net.edges) {
    // Houses along a hẻm keep their walls 0.35 m off its asphalt (gen/lots.ts HEM_WALL).
    const tag: SideTag = { kind: 'road', art: e.art, cls: e.cls, half: e.half, sidewalk: e.sidewalk, walk: e.walk, front: r2(e.cls === 'hem' ? e.half + 0.35 : e.half + e.sidewalk) };
    for (let k = 0; k + 3 < e.pts.length; k += 2) push(e.pts[k], e.pts[k + 1], e.pts[k + 2], e.pts[k + 3], tag);
  }
  for (const w of layout.waterways ?? []) {
    const n = w.poly.length / 2;
    for (let i = 0; i < n; i++) {
      const bank = w.banks?.find((b) => i >= b.from && i <= b.to)?.kind ?? w.bank, j = (i + 1) % n;
      push(w.poly[i * 2], w.poly[i * 2 + 1], w.poly[j * 2], w.poly[j * 2 + 1], { kind: 'water', water: w.id, bank, front: BANK_SETBACK[bank] });
    }
  }
  const nb = layout.bounds.length / 2;
  for (let i = 0; i < nb; i++) { const j = (i + 1) % nb; push(layout.bounds[i * 2], layout.bounds[i * 2 + 1], layout.bounds[j * 2], layout.bounds[j * 2 + 1], { kind: 'bound', front: BOUND_SETBACK }); }

  // Split every segment where another crosses or touches it, and at the ends of collinear overlaps.
  for (let p = 0; p < segs.length; p++) {
    const P = segs[p];
    for (let q = p + 1; q < segs.length; q++) {
      const Q = segs[q];
      if (Math.max(P.ax, P.bx) < Math.min(Q.ax, Q.bx) - 0.05 || Math.max(Q.ax, Q.bx) < Math.min(P.ax, P.bx) - 0.05) continue;
      if (Math.max(P.az, P.bz) < Math.min(Q.az, Q.bz) - 0.05 || Math.max(Q.az, Q.bz) < Math.min(P.az, P.bz) - 0.05) continue;
      const hit = segCross(P.ax, P.az, P.bx, P.bz, Q.ax, Q.az, Q.bx, Q.bz, 1e-7);
      if (hit) { P.cuts.push(hit[0]); Q.cuts.push(hit[1]); continue; }
      // Parallel: if collinear, each cuts the other at its ends.
      for (const [A, B] of [[P, Q], [Q, P]] as const) {
        const dx = A.bx - A.ax, dz = A.bz - A.az, l2 = dx * dx + dz * dz;
        for (const [x, z] of [[B.ax, B.az], [B.bx, B.bz]]) {
          const t = ((x - A.ax) * dx + (z - A.az) * dz) / l2, d = Math.abs((x - A.ax) * dz - (z - A.az) * dx) / Math.sqrt(l2);
          if (d < 0.05 && t > 1e-6 && t < 1 - 1e-6) A.cuts.push(t);
        }
      }
    }
  }
  // Vertices merged within 6 cm; undirected edges deduplicated, the higher-priority tag kept (road over bank over bounds).
  const vx: number[] = [], vz: number[] = [];
  const vgrid = new Map<string, number[]>();
  const vertex = (x: number, z: number) => {
    const cx = Math.round(x * 10), cz = Math.round(z * 10);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const id of vgrid.get(`${cx + i}:${cz + j}`) ?? []) if (hyp(vx[id] - x, vz[id] - z) < 0.06) return id;
    vx.push(x); vz.push(z);
    const k = `${cx}:${cz}`;
    (vgrid.get(k) ?? (vgrid.set(k, []), vgrid.get(k)!)).push(vx.length - 1);
    return vx.length - 1;
  };
  const edgeTag = new Map<string, { u: number; v: number; tag: SideTag }>();
  for (const s of segs) {
    const ts = [...new Set(s.cuts)].sort((a, b) => a - b);
    let prev = vertex(s.ax, s.az);
    for (let k = 1; k < ts.length; k++) {
      const t = ts[k], v = k === ts.length - 1 ? vertex(s.bx, s.bz) : vertex(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t);
      if (v !== prev) {
        const key = prev < v ? `${prev}:${v}` : `${v}:${prev}`, old = edgeTag.get(key);
        if (!old || PRIORITY[old.tag.kind] < PRIORITY[s.tag.kind]) edgeTag.set(key, { u: prev, v, tag: s.tag });
      }
      prev = v;
    }
  }
  // Adjacency, with dead ends pruned (a road ending inside a block does not bound it).
  const adj = new Map<number, { to: number; tag: SideTag }[]>();
  for (const { u, v, tag } of edgeTag.values()) {
    (adj.get(u) ?? (adj.set(u, []), adj.get(u)!)).push({ to: v, tag });
    (adj.get(v) ?? (adj.set(v, []), adj.get(v)!)).push({ to: u, tag });
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [v, list] of adj) {
      if (list.length > 1) continue;
      for (const { to } of list) { const l = adj.get(to)!; l.splice(l.findIndex((h) => h.to === v), 1); }
      adj.delete(v); changed = true;
    }
  }
  for (const [v, list] of adj) list.sort((p, q) => Math.atan2(vz[p.to] - vz[v], vx[p.to] - vx[v]) - Math.atan2(vz[q.to] - vz[v], vx[q.to] - vx[v]));

  // Faces: leave each vertex by the next half-edge clockwise from the one we came in on; bounded faces have positive area.
  const seen = new Set<string>();
  const blocks: Block[] = [];
  for (const [u0, list0] of adj) {
    for (const h0 of list0) {
      if (seen.has(`${u0}>${h0.to}`)) continue;
      const face: number[] = [], tags: SideTag[] = [];
      let u = u0, h = h0, guard = 0;
      while (!seen.has(`${u}>${h.to}`) && guard++ < 4096) {
        seen.add(`${u}>${h.to}`);
        face.push(r2(vx[u]), r2(vz[u])); tags.push(h.tag);
        const v = h.to, out = adj.get(v)!, i = out.findIndex((g) => g.to === u);
        u = v; h = out[(i - 1 + out.length) % out.length];
      }
      if (face.length < 6 || polyArea(face) <= 1) continue;
      // The walk starts wherever the adjacency map does (the order of the arterial list): start every face at its
      // lowest-x (then lowest-z) corner, so a block's sides, and the stream spent on them, never depend on that order.
      const simple = canonical(simplify(face, tags));
      const label = inside(simple.face);
      if (!label || !inPoly(layout.bounds, label[0], label[1])) continue;
      if ((layout.waterways ?? []).some((w) => inPoly(w.poly, label[0], label[1]))) continue;
      blocks.push(makeBlock(layout, simple, label));
    }
  }
  return blocks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The face rotated (with its tags) to start at its lowest-x, then lowest-z, vertex. */
function canonical({ face, tags }: { face: number[]; tags: SideTag[] }) {
  const n = tags.length;
  let k = 0;
  for (let i = 1; i < n; i++) if (face[i * 2] < face[k * 2] || (face[i * 2] === face[k * 2] && face[i * 2 + 1] < face[k * 2 + 1])) k = i;
  return { face: [...face.slice(k * 2), ...face.slice(0, k * 2)], tags: [...tags.slice(k), ...tags.slice(0, k)] };
}

/** Merges consecutive collinear sides with the same tag kind and street (a T from across the street splits a side). */
function simplify(face: number[], tags: SideTag[]) {
  const n = tags.length, keep: number[] = [];
  const same = (a: SideTag, b: SideTag) => a.kind === b.kind && (a.kind !== 'road' || (b.kind === 'road' && a.art === b.art)) && (a.kind !== 'water' || (b.kind === 'water' && a.water === b.water && a.bank === b.bank));
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, j = (i + 1) % n;
    const ux = face[i * 2] - face[p * 2], uz = face[i * 2 + 1] - face[p * 2 + 1], wx = face[j * 2] - face[i * 2], wz = face[j * 2 + 1] - face[i * 2 + 1];
    const cr = (ux * wz - uz * wx) / ((hyp(ux, uz) * hyp(wx, wz)) || 1);
    if (Math.abs(cr) < 1e-3 && ux * wx + uz * wz > 0 && same(tags[p], tags[i])) continue;
    keep.push(i);
  }
  return { face: keep.flatMap((i) => [face[i * 2], face[i * 2 + 1]]), tags: keep.map((i) => tags[i]) };
}

/** A point just inside a face (beside the middle of its longest side). */
function inside(face: number[]): [number, number] | null {
  const n = face.length / 2, order = Array.from({ length: n }, (_, i) => i);
  const len = (i: number) => hyp(face[((i + 1) % n) * 2] - face[i * 2], face[((i + 1) % n) * 2 + 1] - face[i * 2 + 1]);
  order.sort((a, b) => len(b) - len(a));
  for (const i of order) {
    const j = (i + 1) % n, dx = face[j * 2] - face[i * 2], dz = face[j * 2 + 1] - face[i * 2 + 1], l = hyp(dx, dz);
    for (const step of [2, 0.5, 0.05]) {
      const x = face[i * 2] + dx / 2 - (dz / l) * step, z = face[i * 2 + 1] + dz / 2 + (dx / l) * step;
      if (inPoly(face, x, z)) return [x, z];
    }
  }
  return null;
}

function makeBlock(layout: DistrictLayout, { face, tags }: { face: number[]; tags: SideTag[] }, label: [number, number]): Block {
  const keys = [];
  for (let i = 0; i < face.length; i += 2) keys.push(pointKey(face[i], face[i + 1], 1));
  keys.sort();
  const key = `b${hashKey(layout.key, ...keys).toString(36)}`;
  const inset = insetPolygon(face, tags.map((t) => t.front));
  const inner = inset && polyArea(inset.poly) >= 30 ? inset.poly.map(r2) : null;
  const sides = inner && inset ? inset.from.map((i) => tags[i]) : [];
  let zone: ZoneKind = layout.zone ?? 'tube', zoneName: string | null = null;
  for (const z of layout.zoning ?? []) {
    if ((z.poly && inPoly(z.poly, label[0], label[1])) || (z.at && inPoly(face, z.at[0], z.at[1]))) { zone = z.zone; zoneName = z.name ?? null; break; }
  }
  // Water that does not bound the face but reaches into it: an outline corner inside the face, clear of its sides.
  const holes: Block['holes'] = [];
  for (const w of layout.waterways ?? []) {
    let wet = false;
    for (let k = 0; k < w.poly.length && !wet; k += 2) wet = inPoly(face, w.poly[k], w.poly[k + 1]) && polyEdgeDist(face, w.poly[k], w.poly[k + 1]) > 0.1;
    if (wet) holes.push({ water: w.id, bank: w.bank, poly: w.poly });
  }
  return { key, face, faceSides: tags, inner, sides, area: r2(polyArea(face)), zone, zoneName, label: [r2(label[0]), r2(label[1])], holes };
}
