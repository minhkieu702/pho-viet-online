/**
 * Street addresses across the P1 stack (critique steps 14–18). Each slice numbers its houses alone, by position along
 * the arterial a lot fronts (gen/lots.ts streetNumber): a street authored in stretches (Võ Thị Sáu in three, Trần Hưng
 * Đạo across the Quận 3 / Quận 1 seam, Võ Văn Kiệt through three slices) starts again at 1 on every stretch, generated
 * hẻm are named "HẺM 45" with no street (so "45/14 HẺM 45" turns up in two districts), and a house on an authored hẻm
 * ("HẺM 82 HOÀNG SA") gets a street number on the hẻm rather than "82/20 Hoàng Sa". `readdress` puts the live map's
 * numbering on the slices' builds (buildP1 runs it), as Sài Gòn writes it:
 * - streets: one number line per street name over all its stretches in the stack, chained end to end from the first
 *   authored stretch (a stretch that only touches the line, a one-way carriageway, numbers by its houses' place on the
 *   line; one across a gap, Hàm Nghi past the market, carries on beyond the gap); even numbers on the right of the
 *   line's direction, odd on the left, about one per 4 m, never one number twice on a side;
 * - hẻm: a generated hẻm takes the number of its mouth on its street and the street's name ("HẺM 45 HOÀNG SA"; a
 *   branch or a mouthless spine the name of the hẻm it leaves), an authored "HẺM n STREET" keeps its name; their houses
 *   are "n/k" (k about one per 3.5 m, even on the right, never twice on a side), and the street of the address is the
 *   hẻm's street: "82/20 ĐƯỜNG HOÀNG SA".
 * Names ("NHÀ SỐ …", "BIỆT THỰ …"), subtitles, house-number plates, plot numbers, hẻm arches and the hẻm's road-graph
 * names follow. The generator's own numbering stays what single slices validate with; nothing a block hashes changes.
 * Pure data and maths (no three.js).
 */
import type { StackSlice } from './stack.ts';
import type { GenBuilding, GenPlot, GenSign } from './gen/buildings.ts';
import { hyp, polylineHit } from './gen/geom.ts';

type Stretch = { slice: string; art: string; name: string; pts: number[]; len: number };
/** A stretch on its street's number line: from `offset` metres on, its points run along the line (or against it). */
type Placed = { st: Stretch; offset: number; reversed: boolean };
type Line = { name: string; placed: Placed[]; touching: Stretch[]; pts: number[] };

const lenOf = (p: readonly number[]) => { let l = 0; for (let k = 2; k < p.length; k += 2) l += hyp(p[k] - p[k - 2], p[k + 1] - p[k - 1]); return l; };
const near = (ax: number, az: number, bx: number, bz: number, tol = 0.5) => hyp(ax - bx, az - bz) < tol;
const rev = (p: readonly number[]) => { const o: number[] = []; for (let k = p.length - 2; k >= 0; k -= 2) o.push(p[k], p[k + 1]); return o; };
/** Unit heading at the start (end 0) or towards the end (end 1) of a polyline. */
function heading(p: readonly number[], end: 0 | 1) {
  const [ax, az, bx, bz] = end ? [p[p.length - 4], p[p.length - 3], p[p.length - 2], p[p.length - 1]] : [p[0], p[1], p[2], p[3]];
  const l = hyp(bx - ax, bz - az) || 1;
  return [(bx - ax) / l, (bz - az) / l];
}
/** "ĐƯỜNG BẾN VÂN ĐỒN" -> "BẾN VÂN ĐỒN" (as gen/buildings.ts short). */
export const shortName = (name: string) => name.replace(/^(ĐƯỜNG|ĐẠI LỘ|HẺM)\s+/, '');
/** An authored hẻm named after its street: "HẺM 82 HOÀNG SA" -> { n: '82', street: 'HOÀNG SA' } ("HẺM 24/21 LÊ THÁNH TÔN" too). */
export const hemOf = (name: string) => { const m = /^HẺM (\d+(?:\/\d+)*) (.+)$/.exec(name); return m ? { n: m[1], street: m[2] } : null; };
/** House number from metres along a line and the side (off > 0: right of its direction, even), one per `step` metres. */
const numberAt = (s: number, off: number, step: number) => 2 * Math.max(1, Math.round(s / step)) - (off > 0 ? 0 : 1);

/** The number line of every street name (non-hẻm arterials of all the slices). */
export function streetLines(slices: readonly StackSlice[]): Map<string, Line> {
  const groups = new Map<string, Stretch[]>();
  for (const s of slices) for (const a of s.layout.arterials) {
    if (a.cls === 'hem') continue;
    const st: Stretch = { slice: s.key, art: a.id, name: a.name, pts: a.pts.slice(), len: lenOf(a.pts) };
    (groups.get(a.name) ?? (groups.set(a.name, []), groups.get(a.name)!)).push(st);
  }
  const lines = new Map<string, Line>();
  for (const [name, list] of groups) {
    const used = new Set<Stretch>([list[0]]);
    let chain: { st: Stretch; reversed: boolean }[] = [{ st: list[0], reversed: false }];
    const oriented = (c: { st: Stretch; reversed: boolean }) => (c.reversed ? rev(c.st.pts) : c.st.pts);
    // Grow the chain at either end with the stretch that carries straight on (connected ends only).
    for (const back of [false, true]) {
      for (;;) {
        const endC = back ? chain[0] : chain[chain.length - 1], p = oriented(endC);
        const [x, z] = back ? [p[0], p[1]] : [p[p.length - 2], p[p.length - 1]];
        const [hx, hz] = back ? heading(p, 0).map((v) => -v) : heading(p, 1);
        let best: { st: Stretch; reversed: boolean; dot: number } | null = null;
        for (const st of list) {
          if (used.has(st)) continue;
          for (const reversed of [false, true]) {
            const q = reversed ? rev(st.pts) : st.pts;
            const [jx, jz] = back ? [q[q.length - 2], q[q.length - 1]] : [q[0], q[1]];
            if (!near(x, z, jx, jz)) continue;
            const [gx, gz] = back ? heading(q, 1).map((v) => -v) : heading(q, 0), dot = hx * gx + hz * gz;
            if (!best || dot > best.dot + 1e-9) best = { st, reversed, dot };
          }
        }
        if (!best) break;
        used.add(best.st);
        if (back) chain = [{ st: best.st, reversed: best.reversed }, ...chain]; else chain.push({ st: best.st, reversed: best.reversed });
      }
    }
    const placed: Placed[] = [], pts: number[] = [];
    let offset = 0;
    for (const c of chain) {
      const p = oriented(c);
      placed.push({ st: c.st, offset, reversed: c.reversed });
      pts.push(...(pts.length ? p.slice(2) : p));
      offset += c.st.len;
    }
    // The rest: stretches that touch the line (number by projection), then those beyond a gap (carry on past it).
    const touching: Stretch[] = [];
    for (const st of list) {
      if (used.has(st)) continue;
      const hit = [polylineHit(pts, st.pts[0], st.pts[1]), polylineHit(pts, st.pts[st.pts.length - 2], st.pts[st.pts.length - 1])];
      if (hit.some((h) => h.d < 0.5)) { touching.push(st); used.add(st); }
    }
    for (const st of list) {
      if (used.has(st)) continue;
      const ex = pts[pts.length - 2], ez = pts[pts.length - 1];
      const reversed = hyp(st.pts[st.pts.length - 2] - ex, st.pts[st.pts.length - 1] - ez) < hyp(st.pts[0] - ex, st.pts[1] - ez);
      const p = reversed ? rev(st.pts) : st.pts, gap = hyp(p[0] - ex, p[1] - ez);
      offset += gap;
      placed.push({ st, offset, reversed });
      pts.push(...p);
      offset += st.len;
      used.add(st);
    }
    lines.set(name, { name, placed, touching, pts });
  }
  return lines;
}

/** Metres along a street's number line and the side (right > 0) of a point near stretch `art` of slice `slice`. */
export function alongLine(line: Line, slice: string, art: string, x: number, z: number) {
  const p = line.placed.find((q) => q.st.slice === slice && q.st.art === art);
  if (!p) { const h = polylineHit(line.pts, x, z); return { s: h.s, off: h.off }; }
  const h = polylineHit(p.st.pts, x, z);
  return { s: p.offset + (p.reversed ? p.st.len - h.s : h.s), off: p.reversed ? -h.off : h.off };
}

type Addr = { b: GenBuilding; slice: StackSlice; group: string; s: number; off: number; step: number; head: string | null; street: string };

/**
 * Renumbers the stack's houses and renames its generated hẻm in place (see the module comment). Returns how many
 * addresses and hẻm names changed.
 */
export function readdress(slices: readonly StackSlice[]) {
  const lines = streetLines(slices);
  const fullName = new Map<string, string>();
  for (const s of slices) for (const a of s.layout.arterials) if (a.cls !== 'hem' && !fullName.has(shortName(a.name))) fullName.set(shortName(a.name), a.name);
  let hemNames = 0, changed = 0;

  // ---- Generated hẻm: the number of the mouth on the street, the street's name ----
  type HemName = { n: string; street: string; name: string };
  const hemName = new Map<string, HemName>();
  // Hẻm numbers taken on each street: the authored ones first (a generated hẻm never takes "82" beside HẺM 82 HOÀNG SA).
  const taken = new Map<string, Set<string>>();
  const take = (street: string) => taken.get(street) ?? (taken.set(street, new Set()), taken.get(street)!);
  for (const s of slices) for (const a of s.layout.arterials) { const o = hemOf(a.name), full = o && fullName.get(o.street); if (o && full) take(full).add(o.n.split('/')[0]); }
  for (const s of slices) {
    const own = new Map(s.data.hems.map((h) => [h.key, h]));
    const arts = s.layout.arterials;
    const mouthOf = (key: string): HemName | null => {
      const h = own.get(key);
      if (!h) return null;
      for (const end of [0, 1] as const) {
        if (h.ends[end] < 0) continue;
        const n = h.pts.length, x = end ? h.pts[n - 2] : h.pts[0], z = end ? h.pts[n - 1] : h.pts[1];
        const ix = end ? h.pts[n - 4] : h.pts[2], iz = end ? h.pts[n - 3] : h.pts[3];
        const a = arts.find((q) => polylineHit(q.pts, x, z).d < 0.1);
        if (!a) continue;
        if (a.cls === 'hem') {
          // Off an authored hẻm: a hẻm of that hẻm ("HẺM 82/15 HOÀNG SA"), numbered at its mouth along the parent.
          const o = hemOf(a.name);
          if (!o) return null;
          const street = fullName.get(o.street) ?? `ĐƯỜNG ${o.street}`, used = take(`${street}|${o.n}`);
          let k = numberAt(polylineHit(a.pts, x, z).s, polylineHit(a.pts, ix, iz).off, 3.5);
          while (used.has(String(k))) k += 2;
          used.add(String(k));
          return { n: `${o.n}/${k}`, street, name: `HẺM ${o.n}/${k} ${o.street}` };
        }
        const line = lines.get(a.name)!, at = alongLine(line, s.key, a.id, x, z), side = alongLine(line, s.key, a.id, ix, iz).off;
        const used = take(a.name);
        let num = numberAt(at.s, side, 4);
        while (used.has(String(num))) num += 2;
        used.add(String(num));
        return { n: String(num), street: a.name, name: `HẺM ${num} ${shortName(a.name)}` };
      }
      return null;
    };
    /** A hẻm of hẻm `parent` (its line `pts`), numbered where it leaves it at (x, z) to side `side` (right > 0). */
    const offHem = (parent: HemName, pts: readonly number[], x: number, z: number, side: number): HemName => {
      const used = take(`${parent.street}|${parent.n}`);
      let k = numberAt(polylineHit(pts, x, z).s, side, 3.5);
      while (used.has(String(k))) k += 2;
      used.add(String(k));
      return { n: `${parent.n}/${k}`, street: parent.street, name: `HẺM ${parent.n}/${k} ${shortName(parent.street)}` };
    };
    const resolve = (key: string, depth = 0): HemName | null => {
      const k = `${s.key}/${key}`;
      if (hemName.has(k)) return hemName.get(k)!;
      const h = own.get(key);
      if (!h || depth > 8) return null;
      // A spine, connector or through-hẻm names itself from its own mouth; a branch (or a mouthless hẻm) is a hẻm of the
      // hẻm it leaves ("HẺM 45/12 HOÀNG SA"), numbered where it leaves it; a mouthless spine is one of the connector into it.
      let got = h.kind === 'branch' ? null : mouthOf(key);
      for (const end of [0, 1] as const) {
        const j = h.joins[end], parent = !got && j ? resolve(j, depth + 1) : null, q = j ? own.get(j) : null;
        if (!parent || !q) continue;
        const n = h.pts.length, x = end ? h.pts[n - 2] : h.pts[0], z = end ? h.pts[n - 1] : h.pts[1];
        got = offHem(parent, q.pts, x, z, polylineHit(q.pts, end ? h.pts[n - 4] : h.pts[2], end ? h.pts[n - 3] : h.pts[3]).off);
      }
      if (!got) {
        const into = s.data.hems.find((c) => c.key !== key && c.joins.includes(key) && c.kind !== 'branch');
        const parent = into ? resolve(into.key, depth + 1) : null;
        if (into && parent) {
          // the spine runs on both sides of the connector's end: it takes the even side
          const end = into.joins[1] === key ? 1 : 0, n = into.pts.length;
          got = offHem(parent, into.pts, end ? into.pts[n - 2] : into.pts[0], end ? into.pts[n - 1] : into.pts[1], 1);
        }
      }
      if (got) hemName.set(k, got);
      return got;
    };
    for (const h of s.data.hems) resolve(h.key);
  }
  for (const s of slices) {
    const patch = s.data.graphPatch, base = patch.base.edges;
    for (const h of s.data.hems) {
      const got = hemName.get(`${s.key}/${h.key}`);
      if (!got || got.name === h.name) continue;
      h.name = got.name; hemNames++;
      patch.extra.forEach((x, j) => { if (x.art === `hem:${h.key}`) { patch.edges[j].name = got.name; const e = s.data.graph.edges[base + j]; if (e) e.name = got.name; } });
      for (const sg of s.data.signs) if (sg.key === `${h.key}:arch0` || sg.key === `${h.key}:arch1`) sg.text = `HẺM ${got.n}`;
    }
  }

  // ---- Houses: where each stands on its street's or hẻm's line ----
  const addrs: Addr[] = [];
  const plotOf = new Map<string, GenPlot>(), plateOf = new Map<string, GenSign>();
  for (const s of slices) {
    for (const p of s.data.plots) plotOf.set(`${s.key}/${p.key}`, p);
    for (const sg of s.data.signs) if (sg.key.endsWith(':p')) plateOf.set(`${s.key}/${sg.key}`, sg);
  }
  for (const s of slices) {
    const lots = new Map(s.data.lots.map((l) => [l.key, l]));
    const hems = new Map(s.data.hems.map((h) => [h.key, h]));
    const arts = new Map(s.layout.arterials.map((a) => [a.id, a]));
    for (const b of s.data.buildings) {
      const lot = b.stamp ? null : lots.get(b.lot);
      if (!lot) continue;
      const { x, z } = b.door;
      if (lot.line.startsWith('hem:')) {
        const h = hems.get(lot.line.slice(4)), got = hemName.get(`${s.key}/${lot.line.slice(4)}`);
        if (!h || !got) continue;
        const hit = polylineHit(h.pts, x, z);
        addrs.push({ b, slice: s, group: `hem:${s.key}/${h.key}`, s: hit.s, off: hit.off, step: 3.5, head: got.n, street: got.street });
        continue;
      }
      const a = arts.get(lot.line);
      if (!a) continue;
      if (a.cls === 'hem') {
        const o = hemOf(a.name);
        if (!o) continue;
        const hit = polylineHit(a.pts, x, z);
        addrs.push({ b, slice: s, group: `art:${s.key}/${a.id}`, s: hit.s, off: hit.off, step: 3.5, head: o.n, street: fullName.get(o.street) ?? `ĐƯỜNG ${o.street}` });
        continue;
      }
      const at = alongLine(lines.get(a.name)!, s.key, a.id, x, z);
      addrs.push({ b, slice: s, group: `street:${a.name}`, s: at.s, off: at.off, step: 4, head: null, street: a.name });
    }
  }
  // Numbers by position, then each side of each line made unique in order along it (a clash steps on to the next free number).
  const bySide = new Map<string, Addr[]>();
  for (const a of addrs) { const k = `${a.group}|${a.off > 0 ? 'R' : 'L'}|${a.head ?? ''}|${a.street}`; (bySide.get(k) ?? (bySide.set(k, []), bySide.get(k)!)).push(a); }
  for (const list of bySide.values()) {
    list.sort((p, q) => p.s - q.s || p.b.id - q.b.id);
    let last = -Infinity;
    for (const a of list) {
      let n = numberAt(a.s, a.off, a.step);
      if (n <= last) n = last + 2;
      last = n;
      if (apply(a, n)) changed++;
    }
  }
  return { addresses: changed, hems: hemNames };

  function apply(a: Addr, n: number) {
    const b = a.b, address = a.head ? `${a.head}/${n}` : String(n), old = b.address;
    // A house's own subtitle is its address and street (a shop's is what it sells).
    const ownSub = b.subtitle.startsWith(`${old} `) && !b.subtitle.includes('•');
    if (old === address && (!ownSub || b.subtitle === `${address} ${a.street}`)) return false;
    if (b.name === `NHÀ SỐ ${old}`) b.name = `NHÀ SỐ ${address}`;
    else if (b.name === `BIỆT THỰ ${old}`) b.name = `BIỆT THỰ ${address}`;
    if (ownSub) b.subtitle = `${address} ${a.street}`;
    b.address = address;
    const plot = plotOf.get(`${a.slice.key}/${b.key}`);
    if (plot) plot.number = n;
    const plate = plateOf.get(`${a.slice.key}/${b.key}:p`);
    if (plate) plate.text = address;
    return true;
  }
}
