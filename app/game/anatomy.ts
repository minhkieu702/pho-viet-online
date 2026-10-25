import * as THREE from 'three';
import { FIGURE, FINGERS, HAIR_PIVOT, HAND_SOCKET, JOINT, PHALANX, THUMB } from './pose.ts';

/**
 * Geometry of the articulated people: an indexed parts builder, superellipse lofts, and the body (torso,
 * head, face, hair, hats, clothing), arm (five-finger hand and held items), leg (foot and footwear) and
 * umbrella meshes at three levels of detail. Every vertex names a palette slot, an optional part bit (two,
 * when a detail only fits one build), a gloss level and its rig weights (see pose.ts).
 */

export type Detail = 'hero' | 'hi' | 'lo';
export type Rig = [number, number, number, number];
type V3 = [number, number, number];

/** Palette slots of the per-instance look (see figures.ts palette()). FIXED uses the vertex colour as is. */
export const SLOT = { SHIRT: 0, PANTS: 1, SKIN: 2, HAIR: 3, ACCENT: 4, ACCENT2: 5, FIXED: 6 } as const;
/** Arm and leg meshes reuse the slots for their own colours. */
export const ARM_SLOT = { UPPER: 0, LOWER: 1, HAND: 2, CUFF: 3, ITEM: 4, ITEM2: 5 } as const;
export const LEG_SLOT = { THIGH: 0, SHIN: 1, SHOE: 2, SKIN: 3, SOLE: 4, ACCENT2: 5 } as const;

/** Body word A (maskA): hair, hats, face extras. */
export const HEAD = {
  SHORT: 1 << 0, SIDE_PART: 1 << 1, LONG: 1 << 2, BUN: 1 << 3, TAIL: 1 << 4, BOB: 1 << 5, THIN: 1 << 6, BUZZ: 1 << 7,
  /** nón lá */ CONE: 1 << 8, HELMET: 1 << 9, CAP: 1 << 10, SWAT: 1 << 11, BASEBALL: 1 << 12, /** mũ tai bèo */ BUCKET: 1 << 13, /** mũ cối */ PITH: 1 << 14, BANDANA: 1 << 15,
  /** sun-jacket hood over the helmet */ HOOD: 1 << 16,
  /** khẩu trang (accent2) */ MASK: 1 << 17, GLASSES: 1 << 18, BEARD: 1 << 19,
  /** open eyes (default on) */ EYES: 1 << 20, /** closed lids: clear EYES and set BLINK */ BLINK: 1 << 21, /** open mouth while talking */ MOUTH: 1 << 22,
  /** ears (on unless long hair or a bob covers them) */ EARS: 1 << 23,
} as const;
/** Body word B (maskB): torso build and clothing. */
export const TORSO = {
  /** head and upper neck (default on; a ragdoll clears it to drop the head) */ HEAD: 1 << 0, MALE: 1 << 1, FEMALE: 1 << 2,
  COLLAR: 1 << 3, /** áo bà ba */ BA_BA: 1 << 4, /** áo dài: mandarin collar and tà panels */ AO_DAI: 1 << 5, /** áo ba lỗ */ TANK: 1 << 6,
  /** áo chống nắng */ JACKET: 1 << 7, /** khăn rằn */ KHAN_RAN: 1 << 8, /** khăn quàng đỏ */ RED_SCARF: 1 << 9, APRON: 1 << 10, SKIRT: 1 << 11,
  BACKPACK: 1 << 12, KIT: 1 << 13, VEST: 1 << 14, BELT: 1 << 15, TIE: 1 << 16, /** gánh pole on the right shoulder (-x) */ GANH: 1 << 17,
  /** red neck cap shown when HEAD is cleared (and under a loose head) */ STUMP: 1 << 18,
} as const;
/** Arm word A. Items (PHONE..RIFLE) exist on right arms only. */
export const ARM = {
  CUFF: 1 << 0, /** flared sleeve */ WIDE: 1 << 1, WATCH: 1 << 2, BANGLE: 1 << 3,
  PHONE: 1 << 4, /** quạt giấy */ FAN: 1 << 5, BROOM: 1 << 6, /** túi ni lông */ BAG: 1 << 7, /** ly trà đá */ CUP: 1 << 8, /** nón lá held as a fan */ NON_LA: 1 << 9,
  BATON: 1 << 10, PISTOL: 1 << 11, TASER: 1 << 12, RIFLE: 1 << 13,
} as const;
/** Leg word A: footwear and trouser bells. */
export const LEG = { BARE: 1 << 0, SHOE: 1 << 1, /** dép */ DEP: 1 << 2, SANDAL: 1 << 3, BOOT: 1 << 4, /** flared trouser hem over the instep */ WIDE: 1 << 5, HEEL: 1 << 6 } as const;
/** Every held item bit, for clearing a hand. */
export const ARM_ITEMS = ARM.PHONE | ARM.FAN | ARM.BROOM | ARM.BAG | ARM.CUP | ARM.NON_LA | ARM.BATON | ARM.PISTOL | ARM.TASER | ARM.RIFLE;

/** Tessellation per level of detail. */
export const SEG = {
  hero: { limb: 12, finger: 6, palm: 10, torso: 18, head: [18, 14] as const, hair: 6, hat: 16, ring: 12 },
  hi: { limb: 9, finger: 5, palm: 8, torso: 14, head: [14, 10] as const, hair: 4, hat: 9, ring: 9 },
  lo: { limb: 6, finger: 0, palm: 6, torso: 8, head: [10, 7] as const, hair: 2, hat: 8, ring: 6 },
} as const;

const R = FIGURE.headR, HY = FIGURE.headY;
const UA = FIGURE.upperArm, WRIST = JOINT.wrist, TH = FIGURE.thigh, ANKLE = JOINT.ankle, SOLE = -FIGURE.sole;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- Parts builder ------------------------------------------------------------------------------------

export type RigSource = Rig | ((p: THREE.Vector3) => Rig);
export type AddOptions = {
  at?: V3; scale?: number | V3; rot?: V3;
  slot?: number;
  /** One bit of a part table; `wordB` puts it in the second mask word (body TORSO bits). */
  part?: number; wordB?: boolean;
  /** A second bit the vertex also needs (e.g. COLLAR details built once per torso: `also: TORSO.FEMALE`). */
  also?: number; alsoB?: boolean;
  /** Colour multiplier (number = grey); for SLOT.FIXED it is the colour itself. */
  shade?: THREE.ColorRepresentation;
  gloss?: number;
  /** Hard-edged triangles (soles, buttons, checks, ribs, nose planes). */
  flat?: boolean;
  /** Rig weights, or a function of the vertex's final position in limb space. */
  rig?: RigSource;
};

const tmpColor = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();

/** Part index of a bit: 0 = always, 1..24 word A bit (i-1), 25..48 word B bit (i-25). */
export const partIndex = (bit: number | undefined, wordB = false) => (bit ? Math.round(Math.log2(bit)) + 1 + (wordB ? 24 : 0) : 0);

/**
 * Collects primitives into one INDEXED geometry: position, normal, color (shade), tag (slot, part, gloss) and
 * rig. Smooth sources keep their index; a transform with a negative determinant flips the winding.
 */
export class FigureParts {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];
  readonly tag: number[] = [];
  readonly rig: number[] = [];
  readonly idx: number[] = [];
  /** Extra transform applied to everything added. */
  base = new THREE.Matrix4();
  defaultRig: RigSource = [0, 0, 0, 0];
  /** Unique vertices per part index (0 = always shown). */
  readonly partCounts = new Map<number, number>();

  get vertexCount() { return this.pos.length / 3; }

  add(src: THREE.BufferGeometry, o: AddOptions = {}, slots?: ArrayLike<number>, shades?: ArrayLike<number>) {
    let g = src;
    let vSlots = slots, vShades = shades;
    if (o.flat) {
      g = src.index ? src.toNonIndexed() : src.clone();
      if (src.index && (slots || shades)) {
        const ix = src.index.array;
        if (slots) vSlots = Array.from(ix, (i) => slots[i]);
        if (shades) vShades = Array.from(ix, (i) => shades[i]);
      }
      g.deleteAttribute('normal');
      g.computeVertexNormals();
    } else {
      g = src.clone();
      if (!g.getAttribute('normal')) g.computeVertexNormals();
    }
    const s = o.scale ?? 1;
    tmpE.set(...(o.rot ?? [0, 0, 0]));
    tmpM.compose(tmpV.set(...(o.at ?? [0, 0, 0])), tmpQ.setFromEuler(tmpE), typeof s === 'number' ? tmpS.setScalar(s) : tmpS.set(...s)).premultiply(this.base);
    g.applyMatrix4(tmpM);
    const flip = tmpM.determinant() < 0;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const offset = this.pos.length / 3;
    const shade = typeof o.shade === 'number' ? tmpColor.setRGB(o.shade, o.shade, o.shade) : tmpColor.set(o.shade ?? '#ffffff');
    const sr = shade.r, sg = shade.g, sb = shade.b;
    const rig = o.rig ?? this.defaultRig;
    const part = partIndex(o.part, o.wordB) + 64 * partIndex(o.also, o.alsoB);
    const gloss = o.gloss ?? 0;
    const pt = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      pt.set(p.getX(i), p.getY(i), p.getZ(i));
      this.pos.push(pt.x, pt.y, pt.z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const k = vShades ? vShades[i] : 1;
      this.col.push(sr * k, sg * k, sb * k);
      this.tag.push(vSlots ? vSlots[i] : o.slot ?? SLOT.FIXED, part, gloss);
      const r = typeof rig === 'function' ? rig(pt) : rig;
      this.rig.push(r[0], r[1], r[2], r[3]);
    }
    const key = part % 64;
    this.partCounts.set(key, (this.partCounts.get(key) ?? 0) + p.count);
    const index = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
    for (let i = 0; i < index.length; i += 3) {
      if (flip) this.idx.push(index[i] + offset, index[i + 2] + offset, index[i + 1] + offset);
      else this.idx.push(index[i] + offset, index[i + 1] + offset, index[i + 2] + offset);
    }
    g.dispose();
    if (src !== g) src.dispose();
    return this;
  }

  /** Adds a loft result with its per-vertex slots and shades. */
  addLoft(l: Lofted, o: AddOptions = {}) { return this.add(l.g, o, o.slot === undefined ? l.slots : undefined, l.shades); }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('tag', new THREE.Float32BufferAttribute(this.tag, 3));
    g.setAttribute('rig', new THREE.Float32BufferAttribute(this.rig, 4));
    // Triangles in an order that reuses the GPU's post-transform vertex cache (each vertex is shaded about 1.1-1.2
    // times instead of 1.5-1.6 in build order).
    g.setIndex(tipsify(this.idx, this.vertexCount));
    g.userData.partCounts = Object.fromEntries(this.partCounts);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Tipsify (Sander, Nehab and Barczak 2007): reorders triangles for a post-transform vertex cache of `cache` entries
 * by fanning around vertices still in the cache, falling back to recent vertices (then any) at a dead end.
 */
export function tipsify(index: ArrayLike<number>, vertexCount: number, cache = 16): number[] {
  const tris = index.length / 3;
  const live = new Int32Array(vertexCount);
  for (let i = 0; i < index.length; i++) live[index[i]]++;
  const start = new Int32Array(vertexCount + 1);
  for (let v = 0; v < vertexCount; v++) start[v + 1] = start[v] + live[v];
  const adjacent = new Int32Array(index.length), fill = start.slice(0, vertexCount);
  for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) { const v = index[t * 3 + k]; adjacent[fill[v]++] = t; }
  const emitted = new Uint8Array(tris), stamp = new Int32Array(vertexCount).fill(-cache - 1);
  const deadEnd: number[] = [], ring: number[] = [], out: number[] = [];
  let time = 0, cursor = 0, fan = tris ? index[0] : -1;
  while (fan >= 0) {
    ring.length = 0;
    for (let i = start[fan]; i < start[fan + 1]; i++) {
      const t = adjacent[i];
      if (emitted[t]) continue;
      emitted[t] = 1;
      for (let k = 0; k < 3; k++) {
        const v = index[t * 3 + k];
        out.push(v); deadEnd.push(v); ring.push(v); live[v]--;
        if (time - stamp[v] > cache) stamp[v] = time++;
      }
    }
    // Next fan: the ring vertex longest in the cache that will still be there after its own fan.
    let next = -1, best = -1;
    for (const v of ring) {
      if (live[v] <= 0) continue;
      const age = time - stamp[v], priority = age + 2 * live[v] <= cache ? age : 0;
      if (priority > best) { best = priority; next = v; }
    }
    while (next < 0 && deadEnd.length) { const v = deadEnd.pop()!; if (live[v] > 0) next = v; }
    while (next < 0 && cursor < vertexCount) { if (live[cursor] > 0) next = cursor; else cursor++; }
    fan = next;
  }
  return out;
}

// ---- Lofts and primitives -----------------------------------------------------------------------------

/** One ring of a loft: centre (cx, y, cz), radii (rzb behind if different), superellipse exponent, slot, shade. */
export type Ring = { y: number; rx: number; rz: number; rzb?: number; cx?: number; cz?: number; n?: number; slot?: number; shade?: number };
export type Lofted = { g: THREE.BufferGeometry; slots: number[]; shades: number[] };
const se = (t: number, n: number) => (n === 2 ? t : Math.sign(t) * Math.pow(Math.abs(t), 2 / n));

/**
 * A closed tube through `rings` (in order, along y), with optional pole caps. Two consecutive rings at the
 * same y with different slots make a crisp hem or cuff. Winding faces outward, normals are smooth, and
 * there are no seam duplicates. `phase` turns the ring start (radians).
 */
export function loft(rings: Ring[], seg: number, capFirst: number | null = null, capLast: number | null = null, phase = 0): Lofted {
  const pos: number[] = [], slots: number[] = [], shades: number[] = [], idx: number[] = [];
  for (const r of rings) {
    const n = r.n ?? 2;
    for (let k = 0; k < seg; k++) {
      const a = phase + (k / seg) * Math.PI * 2;
      const c = Math.cos(a);
      pos.push((r.cx ?? 0) + r.rx * se(Math.sin(a), n), r.y, (r.cz ?? 0) + (c < 0 && r.rzb !== undefined ? r.rzb : r.rz) * se(c, n));
      slots.push(r.slot ?? 0); shades.push(r.shade ?? 1);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + (k + 1) % seg, c = (i + 1) * seg + k, d = (i + 1) * seg + (k + 1) % seg;
    idx.push(a, c, b, b, c, d);
  }
  const pole = (ring: number, y: number, first: boolean) => {
    const r = rings[ring];
    const p = pos.length / 3;
    pos.push(r.cx ?? 0, y, r.cz ?? 0); slots.push(r.slot ?? 0); shades.push(r.shade ?? 1);
    for (let k = 0; k < seg; k++) {
      const a = ring * seg + k, b = ring * seg + (k + 1) % seg;
      if (first) idx.push(p, a, b); else idx.push(p, b, a);
    }
  };
  if (capFirst !== null) pole(0, capFirst, true);
  if (capLast !== null) pole(rings.length - 1, capLast, false);
  orientOutward(pos, idx, (i) => [rings[Math.min(rings.length - 1, Math.floor(i / seg))].cx ?? 0, rings[Math.min(rings.length - 1, Math.floor(i / seg))].cz ?? 0]);
  return { g: indexed(pos, idx), slots, shades };
}

/** Flips every triangle if the first non-degenerate one faces toward the axis (centre given per vertex). */
function orientOutward(pos: number[], idx: number[], centre: (vertex: number) => [number, number]) {
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = P(idx[t]), b = P(idx[t + 1]), c = P(idx[t + 2]);
    const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (nrm.lengthSq() < 1e-14) continue;
    const [cx, cz] = centre(idx[t]);
    const out = new THREE.Vector3(a.x - cx, 0, a.z - cz);
    if (out.lengthSq() < 1e-12) continue;
    if (nrm.dot(out) < 0) for (let i = 0; i < idx.length; i += 3) { const s = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = s; }
    return;
  }
}

function indexed(pos: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A unit sphere as a lat-long grid with single pole vertices (no seams); `deform` reshapes it before normals. */
export function ball(w: number, h: number, deform?: (v: THREE.Vector3) => void) {
  const pos: number[] = [], idx: number[] = [];
  const v = new THREE.Vector3();
  const put = (x: number, y: number, z: number) => { v.set(x, y, z); deform?.(v); pos.push(v.x, v.y, v.z); };
  put(0, 1, 0);
  for (let i = 1; i < h; i++) {
    const phi = (i / h) * Math.PI;
    for (let k = 0; k < w; k++) { const a = (k / w) * Math.PI * 2; put(Math.sin(phi) * Math.sin(a), Math.cos(phi), Math.sin(phi) * Math.cos(a)); }
  }
  put(0, -1, 0);
  const ring = (i: number, k: number) => 1 + (i - 1) * w + (k % w);
  for (let k = 0; k < w; k++) idx.push(0, ring(1, k), ring(1, k + 1));
  for (let i = 1; i < h - 1; i++) for (let k = 0; k < w; k++) {
    const a = ring(i, k), b = ring(i, k + 1), c = ring(i + 1, k), d = ring(i + 1, k + 1);
    idx.push(a, c, b, b, c, d);
  }
  const last = pos.length / 3 - 1;
  for (let k = 0; k < w; k++) idx.push(last, ring(h - 1, k + 1), ring(h - 1, k));
  return indexed(pos, idx);
}

/**
 * A tube swept along a polyline (parallel-transport frames). `size` gives the cross-section half-widths
 * [across, up] at each point (up = the frame's second axis, seeded by `up`). Caps close open ends.
 */
export function sweep(path: V3[], size: (i: number) => [number, number], seg: number, opts: { closed?: boolean; caps?: boolean; up?: V3 } = {}) {
  const pts = path.map((p) => new THREE.Vector3(...p));
  const n = pts.length;
  const tangents = pts.map((p, i) => {
    const a = pts[opts.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[opts.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  let normal = new THREE.Vector3(...(opts.up ?? [0, 1, 0]));
  normal.addScaledVector(tangents[0], -normal.dot(tangents[0]));
  if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3(1, 0, 0).addScaledVector(tangents[0], -tangents[0].x);
  normal.normalize();
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { normal.addScaledVector(tangents[i], -normal.dot(tangents[i])).normalize(); }
    const bin = new THREE.Vector3().crossVectors(tangents[i], normal);
    const [w, h] = size(i);
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const p = pts[i].clone().addScaledVector(bin, Math.cos(a) * w).addScaledVector(normal, Math.sin(a) * h);
      pos.push(p.x, p.y, p.z);
    }
  }
  const rings = opts.closed ? n : n - 1;
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
    const i2 = (i + 1) % n;
    const a = i * seg + k, b = i * seg + (k + 1) % seg, c = i2 * seg + k, d = i2 * seg + (k + 1) % seg;
    idx.push(a, c, b, b, c, d);
  }
  if (opts.caps && !opts.closed) {
    for (const [ring, first] of [[0, true], [n - 1, false]] as const) {
      const p = pos.length / 3;
      pos.push(pts[ring].x, pts[ring].y, pts[ring].z);
      for (let k = 0; k < seg; k++) { const a = ring * seg + k, b = ring * seg + (k + 1) % seg; if (first) idx.push(p, a, b); else idx.push(p, b, a); }
    }
  }
  return indexed(pos, idx);
}

/** A thin two-sided sheet over a grid of points (rows x cols), front facing `out` of the first quad. */
export function sheet(grid: V3[][], thickness: number, normalHint: V3) {
  const rows = grid.length, cols = grid[0].length;
  const pos: number[] = [], idx: number[] = [];
  const hint = new THREE.Vector3(...normalHint);
  for (const layer of [1, -1]) {
    for (const row of grid) for (const p of row) pos.push(p[0] + hint.x * thickness * 0.5 * layer, p[1] + hint.y * thickness * 0.5 * layer, p[2] + hint.z * thickness * 0.5 * layer);
  }
  const at = (layer: number, r: number, c: number) => layer * rows * cols + r * cols + c;
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    idx.push(at(0, r, c), at(0, r + 1, c), at(0, r, c + 1), at(0, r, c + 1), at(0, r + 1, c), at(0, r + 1, c + 1));
    idx.push(at(1, r, c), at(1, r, c + 1), at(1, r + 1, c), at(1, r, c + 1), at(1, r + 1, c + 1), at(1, r + 1, c));
  }
  // Stitch the rim so the edge has a little thickness.
  const rim: [number, number][] = [];
  for (let c = 0; c < cols - 1; c++) rim.push([at(0, 0, c), at(0, 0, c + 1)]);
  for (let r = 0; r < rows - 1; r++) rim.push([at(0, r, cols - 1), at(0, r + 1, cols - 1)]);
  for (let c = cols - 1; c > 0; c--) rim.push([at(0, rows - 1, c), at(0, rows - 1, c - 1)]);
  for (let r = rows - 1; r > 0; r--) rim.push([at(0, r, 0), at(0, r - 1, 0)]);
  const off = rows * cols;
  for (const [a, b] of rim) idx.push(a, b, b + off, a, b + off, a + off);
  // Front faces must point along the hint: check the first quad of the front layer.
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const o = P(at(0, 0, 0));
  const face = new THREE.Vector3().crossVectors(P(at(0, 1, 0)).sub(o), P(at(0, 0, 1)).sub(o));
  if (face.dot(hint) < 0) for (let i = 0; i < idx.length; i += 3) { const s = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = s; }
  return indexed(pos, idx);
}

/** Hard-edged quads, each with its own four vertices and slot (checker cloth). */
function quads(list: { p: [V3, V3, V3, V3]; slot: number; shade?: THREE.ColorRepresentation }[], parts: FigureParts, o: AddOptions) {
  for (const q of list) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(q.p.flat(), 3));
    const [a, b, c] = q.p.map((v) => new THREE.Vector3(...v));
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    g.setIndex(n.dot(new THREE.Vector3(a.x, 0, a.z)) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    parts.add(g, { ...o, slot: q.slot, shade: q.shade ?? o.shade });
  }
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** A small flattened ellipsoid (buttons, badges, nails). */
const dot = (w = 5, h = 3) => ball(w, h);
/** A single-sided quad centred at c spanning +-ax and +-ay, facing ax x ay. */
function plate(c: V3, ax: V3, ay: V3) {
  const P = (i: number, j: number) => [c[0] + ax[0] * i + ay[0] * j, c[1] + ax[1] * i + ay[1] * j, c[2] + ax[2] * i + ay[2] * j];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...P(-1, -1), ...P(1, -1), ...P(1, 1), ...P(-1, 1)], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}
/** An 8-vertex box with smooth corner normals: for props that are a few pixels tall. */
function cheapBox(w: number, h: number, d: number) {
  const pos: number[] = [];
  for (const z of [-1, 1]) for (const y of [-1, 1]) for (const x of [-1, 1]) pos.push((x * w) / 2, (y * h) / 2, (z * d) / 2);
  const idx = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
  return indexed(pos, idx);
}
/** A flat-shaded prism: a polygon in the (y, z) plane extruded across x from -w/2 to w/2. */
function extrude(outline: [number, number][], w: number) {
  const pos: number[] = [], idx: number[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [y0, z0] = outline[i], [y1, z1] = outline[(i + 1) % n];
    const b = pos.length / 3;
    pos.push(-w / 2, y0, z0, w / 2, y0, z0, w / 2, y1, z1, -w / 2, y1, z1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const tris = THREE.ShapeUtils.triangulateShape(outline.map(([y, z]) => new THREE.Vector2(y, z)), []);
  for (const x of [-w / 2, w / 2]) {
    const b = pos.length / 3;
    for (const [y, z] of outline) pos.push(x, y, z);
    for (const [a, c, d] of tris) idx.push(b + a, b + c, b + d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Side quads and caps each face away from the prism's centre.
  const cy = outline.reduce((t, p) => t + p[0], 0) / n, cz = outline.reduce((t, p) => t + p[1], 0) / n;
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = P(idx[t]), b = P(idx[t + 1]), c = P(idx[t + 2]);
    const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const out = a.clone().add(b).add(c).divideScalar(3).sub(new THREE.Vector3(0, cy, cz));
    if (t >= n * 6) out.set(Math.sign(a.x), 0, 0);
    if (nrm.dot(out) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- Torso --------------------------------------------------------------------------------------------

/** The torso's rings for a build: pants below the belt at 1.16, shirt above, skin from the collar line. */
export function torsoRings(fem: boolean): Ring[] {
  const k = fem
    ? { hip: 0.178, waist: 0.13, chest: 0.162, sh: 0.182, bust: 0.03, seat: 0.118 }
    : { hip: 0.168, waist: 0.148, chest: 0.178, sh: 0.2, bust: 0, seat: 0.112 };
  const { PANTS, SHIRT, SKIN } = SLOT;
  return [
    // The crotch: low and flat in front, so trousers run smoothly into the thighs (no pouch).
    { y: 0.935, rx: 0.045, rz: 0.038, cz: -0.014, n: 2, slot: PANTS },
    { y: 0.962, rx: 0.12, rz: 0.066, rzb: 0.08, cz: -0.01, n: 2, slot: PANTS },
    { y: 1.0, rx: k.hip - 0.002, rz: 0.092, rzb: k.seat - 0.004, cz: -0.008, n: 2.2, slot: PANTS },
    { y: 1.045, rx: k.hip + 0.022, rz: 0.097, rzb: k.seat, cz: -0.008, n: 2.3, slot: PANTS },
    { y: 1.16, rx: k.hip - 0.012, rz: 0.098, rzb: 0.1, n: 2.4, slot: PANTS, shade: 0.94 },
    { y: 1.16, rx: k.hip - 0.007, rz: 0.102, rzb: 0.104, n: 2.4, slot: SHIRT },
    { y: 1.26, rx: k.waist, rz: 0.094, rzb: 0.092, cz: 0.004, n: 2.4, slot: SHIRT },
    { y: 1.38, rx: k.chest - 0.012, rz: 0.104 + k.bust * 0.3, rzb: 0.098, cz: 0.006, n: 2.4, slot: SHIRT },
    { y: 1.49, rx: k.chest, rz: 0.11 + k.bust, rzb: 0.104, cz: 0.006, n: 2.4, slot: SHIRT },
    { y: 1.6, rx: k.sh - 0.012, rz: 0.102 + k.bust * 0.15, rzb: 0.1, cz: 0.002, n: 2.4, slot: SHIRT },
    { y: 1.67, rx: k.sh - 0.032, rz: 0.086, rzb: 0.088, n: 2.4, slot: SHIRT },
    { y: 1.715, rx: 0.118, rz: 0.068, n: 2.2, slot: SHIRT },
    { y: 1.735, rx: 0.066, rz: 0.058, n: 2, slot: SHIRT, shade: 0.9 },
    { y: 1.735, rx: 0.058, rz: 0.056, cz: -0.004, n: 2, slot: SKIN },
    { y: 1.78, rx: 0.054, rz: 0.053, cz: -0.006, n: 2, slot: SKIN },
  ];
}
const TORSO_M = torsoRings(false), TORSO_F = torsoRings(true);

/** A point on the torso surface at height y and angle a (0 = front, + toward +x), lifted outward by `lift`. */
export function torsoPoint(fem: boolean, y: number, a: number, lift = 0): V3 {
  const rings = fem ? TORSO_F : TORSO_M;
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1].y < y) i++;
  let r0 = rings[i], r1 = rings[i + 1];
  if (r1.y === r0.y && i + 2 < rings.length) { r0 = rings[i + 1]; r1 = rings[i + 2]; }
  const t = r1.y === r0.y ? 0 : Math.max(0, Math.min(1, (y - r0.y) / (r1.y - r0.y)));
  const c = Math.cos(a), s = Math.sin(a);
  const ring = (r: Ring) => {
    const n = r.n ?? 2;
    return [(r.cx ?? 0) + (r.rx + lift) * se(s, n), (r.cz ?? 0) + ((c < 0 && r.rzb !== undefined ? r.rzb : r.rz) + lift) * se(c, n)];
  };
  const [x0, z0] = ring(r0), [x1, z1] = ring(r1);
  return [lerp(x0, x1, t), y, lerp(z0, z1, t)];
}
/** The torso ring at height y (interpolated), grown by `grow`. */
function torsoRingAt(fem: boolean, y: number, grow: number, extra: Partial<Ring> = {}): Ring {
  const front = torsoPoint(fem, y, 0, grow), back = torsoPoint(fem, y, Math.PI, grow), side = torsoPoint(fem, y, Math.PI / 2, grow);
  const cz = (front[2] + back[2]) / 2;
  return { y, rx: side[0], rz: front[2] - cz, cz, n: 2.3, ...extra };
}

const bodyRig = (p: THREE.Vector3): Rig => [smooth(FIGURE.neckY - 0.02, FIGURE.headPivotY + 0.02, p.y), smooth(1.12, 1.4, p.y), 0, 0];
const headRig: Rig = [1, 1, 0, 0];

// ---- Head ----------------------------------------------------------------------------------------------

/** Base unit sphere direction -> skull surface (head units): narrower, taller, a tapered jaw and chin, a rounder occiput. */
function skullShape(v: THREE.Vector3) {
  const jaw = smooth(-0.15, -0.95, v.y);
  let { x, z } = v;
  x *= 1 - 0.22 * jaw;
  z += 0.06 * jaw * Math.max(0, z);
  if (z < 0) z *= 1 + 0.08 * smooth(-0.6, -0.2, v.y);
  // A slightly flatter face plane and fuller cheeks below the eyes.
  if (z > 0) z *= 1 - 0.05 * smooth(0.4, 0.95, z / Math.max(1e-6, Math.hypot(x, z))) * (1 - jaw);
  v.set(x * 0.9, v.y * 1.08, z);
}
/** Head-unit point for a base-sphere direction (azimuth th from +z toward +x, elevation e), pushed out by `lift`. */
function skullAt(th: number, e: number, lift: number): V3 {
  const v = new THREE.Vector3(Math.cos(e) * Math.sin(th), Math.sin(e), Math.cos(e) * Math.cos(th));
  skullShape(v);
  return [v.x * (1 + lift), v.y * (1 + lift), v.z * (1 + lift)];
}
/** Body-space point from head units. */
const hp = (p: V3): V3 => [p[0] * R, HY + p[1] * R, p[2] * R];

/** Piecewise-linear profile over |azimuth| in [0, pi]. */
function profile(points: [number, number][]) {
  return (th: number) => {
    let a = Math.abs(th) % (Math.PI * 2);
    if (a > Math.PI) a = Math.PI * 2 - a;
    for (let i = 1; i < points.length; i++) if (a <= points[i][0]) {
      const [a0, v0] = points[i - 1], [a1, v1] = points[i];
      return lerp(v0, v1, (a - a0) / (a1 - a0));
    }
    return points[points.length - 1][1];
  };
}

type Shell = {
  /** Azimuths of the columns (full circle when `strip` is false). */
  az: number[];
  strip?: boolean;
  /** Upper edge elevation (strips), or the crown pole when omitted. */
  top?: (th: number) => number;
  bottom: (th: number) => number;
  /** Lift off the skull at column th, row t (0 top .. 1 hairline). */
  lift: (th: number, t: number, e: number) => number;
  rings: number;
  /** Edges hang free with an inner lip at this lift (bob, helmets) instead of tucking into the skin. */
  lip?: (th: number) => number;
  shade?: (th: number, t: number) => number;
};

/**
 * A shell over the skull (hair, helmets, masks) built in head units. Edges end just above the skin (further
 * than the skull's facet sag), so the hairline is a clean line instead of a jagged intersection.
 */
function shell(s: Shell): { g: THREE.BufferGeometry; shades: number[] } {
  const pos: number[] = [], idx: number[] = [], shades: number[] = [];
  const cols = s.az.length;
  const rowsT: number[] = [];
  // Rows bunch toward the edge, where the shell meets the skin; chords between rows sag less there.
  for (let j = s.top ? 0 : 1; j <= s.rings; j++) rowsT.push(s.top ? j / s.rings : 1 - Math.pow(1 - j / s.rings, 1.3));
  const TUCK = 0.028;
  // Every shell folds under at its lower edge: a free edge to the given lip, a hairline just under the skin.
  const lipOf = s.lip ?? (() => -0.01);
  const put = (th: number, t: number, lip = false) => {
    const top = s.top ? s.top(th) : Math.PI / 2;
    const e = lerp(top, s.bottom(th), t);
    const edge = t >= 1 || (s.top && t <= 0) || (s.strip && (th === s.az[0] || th === s.az[cols - 1]));
    let lift = s.lift(th, t, e);
    if (lip) lift = lipOf(th);
    else if (edge && !(s.lip && t >= 1)) lift = TUCK;
    const p = skullAt(th, e, lift);
    pos.push(...p);
    shades.push(s.shade ? s.shade(th, t) : 1);
  };
  if (!s.top) { pos.push(...skullAt(0, Math.PI / 2, s.lift(0, 0, Math.PI / 2))); shades.push(s.shade ? s.shade(0, 0) : 1); }
  for (const t of rowsT) for (const th of s.az) put(th, t);
  for (const th of s.az) put(th, 1, true);
  const base = s.top ? 0 : 1;
  const at = (row: number, col: number) => base + row * cols + (s.strip ? col : col % cols);
  const nRows = rowsT.length + 1;
  const span = s.strip ? cols - 1 : cols;
  if (!s.top) for (let k = 0; k < span; k++) idx.push(0, at(0, k), at(0, k + 1));
  for (let r = 0; r < nRows - 1; r++) for (let k = 0; k < span; k++) {
    const a = at(r, k), b = at(r, k + 1), c = at(r + 1, k), d = at(r + 1, k + 1);
    idx.push(a, c, b, b, c, d);
  }
  const g = indexed(pos, idx);
  // Outward: the first triangle's normal must point away from the head centre.
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = P(idx[t]), b = P(idx[t + 1]), c = P(idx[t + 2]);
    const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (nrm.lengthSq() < 1e-12) continue;
    if (nrm.dot(a) < 0) { for (let i = 0; i < idx.length; i += 3) { const x = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = x; } g.setIndex(idx); g.computeVertexNormals(); }
    break;
  }
  return { g, shades };
}

/** Symmetric azimuth columns: the given half-angles mirrored, plus front and back. */
function azimuths(half: number[]) {
  const out = [0, ...half, Math.PI, ...[...half].reverse().map((a) => Math.PI * 2 - a)];
  return out;
}
const AZ = {
  hero: azimuths([0.32, 0.65, 0.95, 1.18, 1.36, 1.52, 1.72, 1.98, 2.3, 2.72]),
  hi: azimuths([0.4, 0.82, 1.15, 1.36, 1.55, 1.85, 2.25, 2.7]),
  // lo: the skull's own columns, so hair chords run parallel to the skull's and never dip under it.
  lo: Array.from({ length: SEG.lo.head[0] }, (_, k) => (k / SEG.lo.head[0]) * Math.PI * 2),
};

// Hairlines (elevation over |azimuth|): forehead, temples, sideburn, above the ear, behind the ear, nape.
// Behind the ears the hair follows the round of the skull down to the nape (no bare occiput under a cap).
const HAIRLINE_SHORT = profile([[0, 0.6], [0.45, 0.5], [0.85, 0.3], [1.15, 0.05], [1.32, -0.12], [1.5, 0.3], [1.8, 0.24], [2.1, -0.25], [2.6, -0.58], [Math.PI, -0.68]]);
const HAIRLINE_BACK = profile([[0, 0.55], [0.5, 0.45], [0.9, 0.25], [1.2, 0.05], [1.36, -0.08], [1.52, 0.22], [1.85, 0.16], [2.2, -0.28], [2.7, -0.58], [Math.PI, -0.66]]);

/** Every hair style, built as shells and lofts on the head (body space). */
function addHair(parts: FigureParts, detail: Detail) {
  const az = AZ[detail], rings = SEG[detail].hair + (detail === 'lo' ? 1 : 0);
  const at: V3 = [0, HY, 0];
  // The coarse lo skull needs a thicker shell to stay covered between rows (invisible at crowd distance).
  const thick = detail === 'lo' ? 0.06 : 0;
  const add = (g: THREE.BufferGeometry, bit: number, shades?: number[], o: AddOptions = {}) =>
    parts.add(g, { at, scale: R, slot: SLOT.HAIR, part: bit, rig: headRig, ...o }, undefined, shades);
  const crown = (t: number) => 1 - t;
  // Short crop: a little volume on top.
  let s = shell({ az, bottom: HAIRLINE_SHORT, rings, lift: (th, t) => thick + 0.05 + 0.04 * crown(t) + 0.02 * Math.max(0, Math.cos(th)) * crown(t) });
  add(s.g, HEAD.SHORT, s.shades);
  // Side part: fuller, swept to one side with a quiff over the forehead.
  s = shell({ az, bottom: profile([[0, 0.55], [0.45, 0.46], [0.85, 0.28], [1.15, 0.05], [1.32, -0.12], [1.5, 0.3], [1.8, 0.24], [2.1, -0.25], [2.6, -0.58], [Math.PI, -0.68]]), rings,
    lift: (th, t) => thick + 0.06 + 0.06 * crown(t) * (1 + 0.5 * Math.sin(th)) + 0.04 * Math.max(0, Math.cos(th)) * Math.sin(Math.PI * Math.min(1, t * 1.3)) });
  add(s.g, HEAD.SIDE_PART, s.shades);
  // Buzz cut: a thin even layer.
  s = shell({ az, bottom: profile([[0, 0.66], [0.45, 0.55], [0.85, 0.32], [1.15, 0.08], [1.32, -0.05], [1.5, 0.3], [1.8, 0.24], [2.1, -0.22], [2.6, -0.55], [Math.PI, -0.64]]), rings, lift: (_, t) => thick + 0.04 + 0.03 * (1 - t) });
  add(s.g, HEAD.BUZZ, s.shades);
  // Thinning: only the back and sides; the crown stays bare.
  s = shell({ az: azStrip(1.15, Math.PI * 2 - 1.15, detail), strip: true, top: profile([[0, 0.2], [1.15, 0.15], [1.6, 0.34], [Math.PI, 0.45]]), bottom: HAIRLINE_SHORT, rings: Math.max(2, rings - 1), lift: () => thick + 0.045 });
  add(s.g, HEAD.THIN, s.shades);
  // Tied-back cap shared by bun and ponytail: pulled tight, the ears show.
  const tight = (bit: number) => {
    const t = shell({ az, bottom: HAIRLINE_BACK, rings, lift: (th, tt) => thick + 0.045 + 0.03 * crown(tt) });
    add(t.g, bit, t.shades);
  };
  tight(HEAD.BUN);
  add(ball(detail === 'lo' ? 6 : 8, detail === 'lo' ? 4 : 6), HEAD.BUN, undefined, { at: hp([0, 0.42, -0.9]), scale: [0.36 * R, 0.32 * R, 0.33 * R] });
  tight(HEAD.TAIL);
  // Ponytail: a band at the tie, then a tapering tail that swings (secondary group 2).
  const tieY = HAIR_PIVOT[1], tieZ = HAIR_PIVOT[2];
  const tailSeg = detail === 'lo' ? 4 : 6;
  const tail = loft([
    { y: tieY + 0.012, rx: 0.02, rz: 0.02, cz: tieZ - 0.01 }, { y: tieY - 0.01, rx: 0.026, rz: 0.024, cz: tieZ - 0.03 },
    { y: tieY - 0.07, rx: 0.03, rz: 0.026, cz: tieZ - 0.045 }, { y: tieY - 0.16, rx: 0.026, rz: 0.022, cz: tieZ - 0.045 },
    { y: tieY - 0.24, rx: 0.014, rz: 0.012, cz: tieZ - 0.03 },
  ], tailSeg, null, tieY - 0.27);
  parts.addLoft(tail, { slot: SLOT.HAIR, part: HEAD.TAIL, rig: (p) => [1, 1, smooth(tieY, tieY - 0.2, p.y), 2] });
  // Bob: chin-length all round with a fringe; the ends hang free.
  s = shell({ az, bottom: profile([[0, 0.32], [0.45, 0.26], [0.75, 0.0], [1.0, -0.55], [1.3, -0.78], [2.0, -0.8], [Math.PI, -0.74]]), rings: rings + 1,
    lift: (th, t, e) => thick + 0.075 + 0.03 * crown(t) + 0.34 * Math.pow(Math.max(0, -Math.sin(e)), 1.25), lip: () => 0.02,
    shade: (_, t) => 1 - 0.08 * t });
  add(s.g, HEAD.BOB, s.shades);
  // Long: a parted cap that hangs over the ears, then a curtain down the back (secondary group 2).
  s = shell({ az, bottom: profile([[0, 0.5], [0.4, 0.42], [0.75, 0.15], [1.0, -0.35], [1.3, -0.62], [2.0, -0.6], [Math.PI, -0.45]]), rings: rings + 1,
    lift: (th, t, e) => thick + 0.06 + 0.03 * crown(t) + 0.26 * Math.pow(Math.max(0, -Math.sin(e)), 1.3) - 0.02 * Math.exp(-((th * th) / 0.02)) * crown(t), lip: () => 0.02 });
  add(s.g, HEAD.LONG, s.shades);
  const back = loft([
    { y: HY + 0.02, rx: 0.105, rz: 0.03, cz: -0.1 }, { y: HY - 0.07, rx: 0.112, rz: 0.034, cz: -0.12 }, { y: 1.76, rx: 0.11, rz: 0.03, cz: -0.13 },
    { y: 1.64, rx: 0.104, rz: 0.024, cz: -0.13 }, { y: 1.53, rx: 0.094, rz: 0.018, cz: -0.13 }, { y: 1.47, rx: 0.07, rz: 0.012, cz: -0.125 },
  ], detail === 'lo' ? 6 : detail === 'hi' ? 8 : 10, null, 1.45);
  parts.addLoft(back, { slot: SLOT.HAIR, part: HEAD.LONG, rig: (p) => [1 - 0.5 * smooth(1.8, 1.5, p.y), 1, smooth(1.85, 1.5, p.y), 2] });
}

function azStrip(from: number, to: number, detail: Detail) {
  const n = detail === 'lo' ? 6 : detail === 'hi' ? 9 : 12;
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
}

/** Hats, hood, mask, glasses and beard (body space). */
function addHeadwear(parts: FigureParts, detail: Detail) {
  const seg = SEG[detail].hat, az = AZ[detail];
  const lo = detail === 'lo';
  const at: V3 = [0, HY, 0];
  const hat = (g: THREE.BufferGeometry | Lofted, bit: number, o: AddOptions = {}) => {
    const opts: AddOptions = { at, scale: R, slot: SLOT.ACCENT, part: bit, rig: headRig, ...o };
    if ('slots' in g) parts.add(g.g, opts, undefined, g.shades); else parts.add(g, opts);
  };
  const strap = (path: V3[], bit: number, o: AddOptions = {}) => parts.add(sweep(path, () => [0.035, 0.012], lo ? 3 : 4), { at, scale: R, slot: SLOT.FIXED, shade: '#1d1d1f', part: bit, rig: headRig, ...o });

  // Nón lá: a wide straw cone with rib bands; the underside folds in to a headband that rests on the head.
  const coneRings: Ring[] = lo
    ? [{ y: 1.04, rx: 1.08, rz: 1.08 }, { y: 0.36, rx: 2.3, rz: 2.3 }, { y: 0.32, rx: 2.32, rz: 2.32, shade: 0.72 }, { y: 0.98, rx: 1.06, rz: 1.06, shade: 0.42 }, { y: 0.6, rx: 0.84, rz: 0.93, cz: -0.03, shade: 0.38 }]
    : [
      { y: 1.38, rx: 0.5, rz: 0.5, shade: 0.94 }, { y: 1.04, rx: 1.08, rz: 1.08, shade: 1.0 }, { y: 0.7, rx: 1.68, rz: 1.68, shade: 0.9 },
      { y: 0.36, rx: 2.3, rz: 2.3, shade: 1.0 }, { y: 0.32, rx: 2.32, rz: 2.32, shade: 0.72 }, { y: 0.37, rx: 2.12, rz: 2.12, shade: 0.5 },
      { y: 0.98, rx: 1.06, rz: 1.06, shade: 0.42 }, { y: 0.6, rx: 0.84, rz: 0.93, cz: -0.03, shade: 0.38 },
    ];
  hat(loft(coneRings, lo ? 8 : seg, 1.7, null), HEAD.CONE);
  if (!lo) parts.add(sweep([[0.86, 0.6, -0.02], [0.9, -0.15, 0.02], [0.74, -0.78, 0.2], [0.0, -1.12, 0.36], [-0.74, -0.78, 0.2], [-0.9, -0.15, 0.02], [-0.86, 0.6, -0.02]], () => [0.025, 0.01], 3),
    { at, scale: R, slot: SLOT.ACCENT2, part: HEAD.CONE, rig: headRig });

  // Motorbike half helmet: a glossy shell with a short peak and a dark chin strap.
  const helmet = shell({ az, bottom: profile([[0, 0.5], [0.8, 0.38], [1.3, 0.16], [1.7, 0.12], [2.4, -0.1], [Math.PI, -0.22]]), rings: lo ? 2 : 3,
    lift: (_, t) => 0.24 + 0.04 * (1 - t), lip: () => 0.1, shade: (_, t) => 1 - 0.06 * t });
  hat(helmet.g, HEAD.HELMET, { gloss: 1 });
  parts.add(peak(0.95, 0.5, 0.4, 0.28, lo ? 2 : 3), { at, scale: R, slot: SLOT.ACCENT, shade: 0.92, part: HEAD.HELMET, rig: headRig, gloss: 1 });
  if (!lo) strap([[0.97, 0.15, -0.02], [0.88, -0.5, 0.06], [0.55, -0.98, 0.2], [0.0, -1.13, 0.3], [-0.55, -0.98, 0.2], [-0.88, -0.5, 0.06], [-0.97, 0.15, -0.02]], HEAD.HELMET);

  // Hood of a sun jacket pulled over the helmet: frames the face and drapes to the shoulders.
  const hood = shell({ az, bottom: profile([[0, 0.62], [0.5, 0.45], [0.8, -0.1], [1.0, -0.95], [1.3, -1.3], [Math.PI, -1.3]]), rings: lo ? 3 : 4,
    lift: (th, t, e) => 0.38 + 0.9 * Math.pow(Math.max(0, -Math.sin(e) - 0.35), 1.2), lip: (th) => (Math.abs(Math.cos(th)) > 0.5 ? 0.3 : 0.6), shade: (_, t) => 1 - 0.1 * t });
  hat(hood.g, HEAD.HOOD, { slot: SLOT.SHIRT });

  // Police peaked cap: red band, flared crown, black glossy visor and a gold badge.
  const cap = loft([
    { y: 0.3, rx: 1.02, rz: 1.1, cz: -0.03, slot: SLOT.FIXED }, { y: 0.62, rx: 1.04, rz: 1.12, cz: -0.03, slot: SLOT.FIXED },
    { y: 0.62, rx: 1.05, rz: 1.13, cz: -0.03, slot: SLOT.ACCENT }, { y: 0.95, rx: 1.2, rz: 1.33, cz: -0.06, slot: SLOT.ACCENT }, { y: 1.1, rx: 1.26, rz: 1.42, cz: -0.08, slot: SLOT.ACCENT },
    { y: 1.15, rx: 1.12, rz: 1.26, cz: -0.08, slot: SLOT.ACCENT, shade: 0.95 },
  ], lo ? 8 : seg, null, 1.2);
  parts.add(cap.g, { at, scale: R, part: HEAD.CAP, rig: headRig }, cap.slots, cap.shades);
  colorFixed(parts, cap, '#9c3a32');
  parts.add(peak(1.0, 0.33, 0.75, 0.32, lo ? 2 : 3), { at, scale: R, slot: SLOT.FIXED, shade: '#151a22', part: HEAD.CAP, rig: headRig, gloss: 1 });
  if (!lo) parts.add(plate(hp([0, 0.8, 1.22]), [0.13 * R, 0, 0], [0, 0.13 * R, 0.03 * R]), { slot: SLOT.FIXED, shade: '#d9b44a', part: HEAD.CAP, rig: headRig, gloss: 1 });

  // SWAT helmet: a deep shell over the ears with a short peak.
  const swat = shell({ az, bottom: profile([[0, 0.42], [0.8, 0.25], [1.2, -0.3], [1.9, -0.35], [Math.PI, -0.4]]), rings: lo ? 2 : 3,
    lift: (_, t) => 0.3 + 0.04 * (1 - t), lip: () => 0.12, shade: (_, t) => 1 - 0.1 * t });
  hat(swat.g, HEAD.SWAT, { gloss: 0.5 });
  parts.add(peak(1.0, 0.43, 0.3, 0.2, lo ? 2 : 3), { at, scale: R, slot: SLOT.ACCENT, shade: 0.85, part: HEAD.SWAT, rig: headRig });

  // Baseball cap: a soft crown and a long bill.
  const baseball = shell({ az, bottom: profile([[0, 0.42], [0.8, 0.3], [1.4, 0.2], [2.2, 0.08], [Math.PI, 0.02]]), rings: lo ? 2 : 3,
    lift: (_, t) => 0.12 + 0.05 * (1 - t), lip: () => 0.05 });
  hat(baseball.g, HEAD.BASEBALL);
  parts.add(peak(0.92, 0.44, 0.85, 0.12, lo ? 2 : 3), { at, scale: R, slot: SLOT.ACCENT, shade: 0.9, part: HEAD.BASEBALL, rig: headRig });

  // Mũ tai bèo: a soft crown sitting on the head and a floppy brim drooping all round above the eyes; a dark
  // lining closes it underneath, so it reads as a hat (not a ring) from below or behind.
  const bucket = loft([
    { y: 1.2, rx: 0.6, rz: 0.64 }, { y: 1.0, rx: 0.92, rz: 0.97 }, { y: 0.58, rx: 0.99, rz: 1.04, shade: 0.85 },
    { y: 0.47, rx: 1.3, rz: 1.34 }, { y: 0.3, rx: 1.6, rz: 1.64, shade: 0.95 },
    { y: 0.27, rx: 1.58, rz: 1.62, shade: 0.7 }, { y: 0.5, rx: 1.0, rz: 1.04, shade: 0.4 },
  ], lo ? 8 : seg, 1.24, 0.62);
  hat(bucket, HEAD.BUCKET);

  // Mũ cối: a pith helmet, its brim longer front and back, lined inside.
  const pith = loft([
    { y: 1.3, rx: 0.5, rz: 0.55 }, { y: 1.12, rx: 0.95, rz: 1.02 }, { y: 0.82, rx: 1.18, rz: 1.26 }, { y: 0.45, rx: 1.26, rz: 1.36, shade: 0.94 },
    { y: 0.34, rx: 1.5, rz: 1.78, shade: 0.98 }, { y: 0.29, rx: 1.5, rz: 1.78, shade: 0.75 }, { y: 0.37, rx: 1.24, rz: 1.34, shade: 0.4 },
  ], lo ? 8 : seg, 1.36, 0.5);
  hat(pith, HEAD.PITH);
  if (!lo) parts.add(dot(), { at: hp([0, 0.66, 1.33]), scale: [0.14 * R, 0.14 * R, 0.05 * R], rot: [0.3, 0, 0], slot: SLOT.FIXED, shade: '#c8a838', part: HEAD.PITH, rig: headRig });

  // Bandana: a band round the forehead, knotted at the back with two tails.
  const band = shell({ az, strip: false, top: profile([[0, 0.75], [1.6, 0.62], [Math.PI, 0.38]]), bottom: profile([[0, 0.42], [1.6, 0.3], [Math.PI, 0.05]]), rings: 2,
    lift: () => 0.09 });
  hat(band.g, HEAD.BANDANA);
  if (!lo) for (const side of [-1, 1]) parts.add(sweep([[0, 0.22, -1.08], [side * 0.18, -0.12, -1.18], [side * 0.26, -0.5, -1.12]], (i) => [0.12 - i * 0.03, 0.03], 3), { at, scale: R, slot: SLOT.ACCENT, part: HEAD.BANDANA, rig: headRig });

  // Khẩu trang over nose, mouth and chin, with ear loops.
  const mask = shell({ az: azStrip(-1.3, 1.3, detail), strip: true, top: profile([[0, -0.1], [0.8, -0.08], [1.3, -0.05]]), bottom: profile([[0, -1.0], [0.8, -0.78], [1.3, -0.5]]), rings: lo ? 2 : 4,
    lift: (th, t, e) => 0.04 + 0.13 * Math.exp(-((th / 0.4) ** 2) - ((e + 0.18) / 0.32) ** 2) + 0.03 * Math.cos(th) });
  hat(mask.g, HEAD.MASK, { slot: SLOT.ACCENT2 });
  if (!lo) for (const side of [-1, 1]) strap([[side * 0.92, -0.32, 0.36], [side * 0.99, -0.05, 0.05], [side * 0.92, 0.1, -0.14]], HEAD.MASK, { slot: SLOT.ACCENT2, shade: 0.9 });

  // Glasses: two rims, a bridge and the temples.
  if (!lo) {
    for (const side of [-1, 1]) {
      const rim: V3[] = Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return [side * 0.36 + Math.cos(a) * 0.21, 0.04 + Math.sin(a) * 0.15, 1.03 - 0.06 * Math.abs(Math.cos(a))]; });
      parts.add(sweep(rim, () => [0.022, 0.022], 3, { closed: true, up: [0, 0, 1] }), { at, scale: R, slot: SLOT.FIXED, shade: '#1c1c1e', part: HEAD.GLASSES, rig: headRig, gloss: 1 });
      parts.add(sweep([[side * 0.57, 0.07, 0.98], [side * 0.92, 0.09, 0.45], [side * 0.93, 0.02, -0.05]], () => [0.018, 0.018], 3), { at, scale: R, slot: SLOT.FIXED, shade: '#1c1c1e', part: HEAD.GLASSES, rig: headRig, gloss: 1 });
    }
    parts.add(sweep([[-0.15, 0.08, 1.04], [0, 0.11, 1.07], [0.15, 0.08, 1.04]], () => [0.02, 0.02], 3), { at, scale: R, slot: SLOT.FIXED, shade: '#1c1c1e', part: HEAD.GLASSES, rig: headRig });
  }

  // A short beard on the chin and a moustache (hair slot).
  const beard = shell({ az: azStrip(-1.15, 1.15, detail), strip: true, top: profile([[0, -0.6], [0.6, -0.52], [1.15, -0.25]]), bottom: profile([[0, -1.05], [0.6, -0.95], [1.15, -0.62]]), rings: lo ? 2 : 3, lift: () => 0.035 });
  hat(beard.g, HEAD.BEARD, { slot: SLOT.HAIR });
  if (!lo) parts.add(sweep([[-0.24, -0.4, 0.86], [0, -0.34, 0.95], [0.24, -0.4, 0.86]], (i) => [i === 1 ? 0.05 : 0.03, 0.03], 4, { caps: true }), { at, scale: R, slot: SLOT.HAIR, part: HEAD.BEARD, rig: headRig });
}

/** Re-tints the FIXED-slot vertices of a just-added loft (shade from the ring is a colour, not a grey). */
function colorFixed(parts: FigureParts, l: Lofted, color: string) {
  const c = new THREE.Color(color);
  const n = l.g.getAttribute('position')?.count ?? l.slots.length;
  const start = parts.vertexCount - l.slots.length;
  for (let i = 0; i < l.slots.length && i < n; i++) if (l.slots[i] === SLOT.FIXED) {
    const v = start + i;
    parts.col[v * 3] = c.r; parts.col[v * 3 + 1] = c.g; parts.col[v * 3 + 2] = c.b;
  }
}

/** A curved peak (visor, cap bill) in head units: an arc of `half` radians at elevation e, sticking out `reach`, drooping `droop`. */
function peak(lift: number, e: number, reach: number, droop: number, cols: number) {
  const grid: V3[][] = [];
  const half = 0.85;
  for (const out of [0, 1]) {
    const row: V3[] = [];
    for (let k = 0; k <= cols * 2; k++) {
      const th = -half + (k / (cols * 2)) * half * 2;
      const p = skullAt(th, e, lift * 0.25 - 0.02);
      const n = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
      const r = out * reach * (0.55 + 0.45 * Math.cos((th / half) * Math.PI * 0.5));
      row.push([p[0] + n.x * r, p[1] - out * droop * r, p[2] + n.z * r]);
    }
    grid.push(row);
  }
  return sheet(grid, 0.05, [0, 1, 0]);
}

/** Skull, ears, eyes, brows, nose, lips, the upper neck, and the face's optional parts. */
function addHead(parts: FigureParts, detail: Detail) {
  const [w, h] = SEG[detail].head;
  const lo = detail === 'lo';
  const head = { part: TORSO.HEAD, wordB: true, rig: headRig } as const;
  parts.add(ball(w, h, skullShape), { at: [0, HY, 0], scale: R, slot: SLOT.SKIN, ...head });
  // Upper neck: belongs to the head, so a ragdoll that loses the head keeps a clean stump at 1.78.
  const neck = loft([{ y: 1.78, rx: 0.054, rz: 0.053, cz: -0.006 }, { y: 1.83, rx: 0.051, rz: 0.051, cz: -0.004 }, { y: 1.88, rx: 0.048, rz: 0.048, cz: -0.004 }], SEG[detail].ring + 3);
  parts.add(neck.g, { slot: SLOT.SKIN, part: TORSO.HEAD, wordB: true, rig: bodyRig });
  const f = (x: number, y: number, z: number): V3 => hp([x, y, z]);
  const s = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];
  for (const side of [-1, 1]) {
    // Ears: a flattened shell angled back (their own bit: long hair and bobs cover them).
    parts.add(ball(lo ? 5 : 7, lo ? 3 : 5), { at: f(side * 0.86, -0.06, -0.06), scale: s(0.12, 0.27, 0.19), rot: [0, side * -0.35, 0], slot: SLOT.SKIN, shade: 0.94, ...head, part: HEAD.EARS, wordB: false, also: TORSO.HEAD, alsoB: true });
    // Brows (hair slot): a tapered arch.
    parts.add(sweep([[side * 0.14, 0.29, 0.99], [side * 0.36, 0.33, 0.985], [side * 0.6, 0.27, 0.88]], (i) => [i === 0 ? 0.03 : i === 1 ? 0.032 : 0.02, 0.026], lo ? 3 : 4, { caps: true, up: [0, 0, 1] }),
      { at: [0, HY, 0], scale: R, slot: SLOT.HAIR, shade: 0.9, ...head });
  }
  // Nose: a small flat-shaded wedge.
  const nose = new THREE.BufferGeometry();
  const N = (x: number, y: number, z: number) => [x, y, z];
  nose.setAttribute('position', new THREE.Float32BufferAttribute([
    ...N(0, 0.02, 0.95), ...N(-0.1, -0.27, 0.98), ...N(0, -0.25, 1.1),
    ...N(0, 0.02, 0.95), ...N(0, -0.25, 1.1), ...N(0.1, -0.27, 0.98),
    ...N(-0.1, -0.27, 0.98), ...N(0, -0.31, 0.97), ...N(0, -0.25, 1.1),
    ...N(0.1, -0.27, 0.98), ...N(0, -0.25, 1.1), ...N(0, -0.31, 0.97),
  ], 3));
  nose.computeVertexNormals();
  parts.add(nose, { at: [0, HY, 0], scale: R, slot: SLOT.SKIN, shade: 0.98, ...head, flat: true });
  // Lips: a thin upper and a fuller lower lip, a muted rose close to the skin (a linear multiplier that cools the
  // skin's orange a little), not a painted red.
  parts.add(ball(lo ? 5 : 7, 3), { at: f(0, -0.46, 0.9), scale: s(0.18, 0.032, 0.055), slot: SLOT.SKIN, shade: new THREE.Color(0.9, 0.82, 1.08), ...head });
  if (!lo) parts.add(ball(7, 3), { at: f(0, -0.522, 0.872), scale: s(0.165, 0.045, 0.058), slot: SLOT.SKIN, shade: new THREE.Color(0.95, 0.89, 1.14), ...head });

  // Eyes (default on): almond sclera, iris and an upper lid line; lo uses a dark almond.
  const eyes = { part: HEAD.EYES, rig: headRig } as const;
  for (const side of [-1, 1]) {
    if (!lo) {
      parts.add(ball(8, 4), { at: f(side * 0.34, 0.03, 0.86), scale: s(0.16, 0.085, 0.08), slot: SLOT.FIXED, shade: '#efe9e1', ...eyes });
      parts.add(ball(6, 3), { at: f(side * 0.33, 0.03, 0.925), scale: s(0.07, 0.072, 0.035), slot: SLOT.FIXED, shade: '#2a1d16', ...eyes, gloss: 1 });
      parts.add(sweep([[side * 0.18, 0.06, 0.92], [side * 0.34, 0.115, 0.95], [side * 0.5, 0.07, 0.87]], () => [0.02, 0.015], 3, { up: [0, 0, 1] }),
        { at: [0, HY, 0], scale: R, slot: SLOT.HAIR, shade: 0.7, ...eyes });
    } else parts.add(ball(6, 3), { at: f(side * 0.34, 0.03, 0.88), scale: s(0.15, 0.075, 0.07), slot: SLOT.FIXED, shade: '#2a1d16', ...eyes });
    // Closed lids (BLINK): skin over the eye with a dark lash line.
    parts.add(ball(lo ? 5 : 6, 3), { at: f(side * 0.34, 0.035, 0.87), scale: s(0.17, 0.095, 0.08), slot: SLOT.SKIN, shade: 0.93, part: HEAD.BLINK, rig: headRig });
    if (!lo) parts.add(sweep([[side * 0.2, 0.0, 0.94], [side * 0.34, -0.01, 0.955], [side * 0.48, 0.01, 0.9]], () => [0.016, 0.012], 3, { up: [0, 0, 1] }),
      { at: [0, HY, 0], scale: R, slot: SLOT.HAIR, shade: 0.7, part: HEAD.BLINK, rig: headRig });
  }
  // Talking: a dark open mouth between the lips.
  parts.add(ball(lo ? 5 : 6, 3), { at: f(0, -0.49, 0.905), scale: s(0.12, 0.045, 0.03), slot: SLOT.FIXED, shade: '#4a2220', part: HEAD.MOUTH, rig: headRig });
}

// ---- Torso clothing --------------------------------------------------------------------------------------

function addClothing(parts: FigureParts, detail: Detail) {
  const seg = SEG[detail].torso, lo = detail === 'lo', ringSeg = SEG[detail].ring;
  const B = (bit: number, o: AddOptions = {}): AddOptions => ({ part: bit, wordB: true, rig: bodyRig, ...o });
  const both = [false, true] as const;
  const build = (fem: boolean) => ({ also: fem ? TORSO.FEMALE : TORSO.MALE, alsoB: true });
  const surf = (fem: boolean, y: number, a: number, lift: number) => torsoPoint(fem, y, a, lift);
  // A small square lying on the torso surface (buttons, badges, pockets, tabs): single-sided, 4 vertices.
  const tile = (fem: boolean, y: number, a: number, lift: number, w: number, h: number, o: AddOptions) => {
    const c = surf(fem, y, a, lift);
    const nx = Math.sin(a), nz = Math.cos(a);
    parts.add(plate(c, [nz * w, 0, -nx * w], [0, h, 0]), o);
  };
  // A patch lying on the torso surface: rows over y0..y1, columns over angles a0..a1 (single-sided).
  const patch = (fem: boolean, y0: number, y1: number, a0: number, a1: number, lift: number, rows: number, cols: number, o: AddOptions) => {
    const pos: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) pos.push(...surf(fem, lerp(y0, y1, r / rows), lerp(a0, a1, c / cols), lift));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, b, e, a, e, d);
    }
    parts.add(outward(pos, idx), o);
  };
  const band = (y0: number, y1: number, r0: number, r1: number, s: number) =>
    loft([{ y: y0, rx: r0 * 1.08, rz: r0, cz: -0.004 }, { y: y1, rx: r1 * 1.05, rz: r1, cz: -0.006 }], s);

  // Shirt collar: a band round the neck with two points; the placket and buttons sit on each build's chest.
  parts.add(band(1.725, 1.782, 0.064, 0.057, ringSeg + 1).g, B(TORSO.COLLAR, { slot: SLOT.SHIRT, shade: 0.97 }));
  for (const side of [-1, 1]) parts.add(plate([side * 0.034, 1.716, 0.08], [side * 0.022, 0.006, -0.008], [side * 0.008, 0.022, -0.012]), B(TORSO.COLLAR, { slot: SLOT.SHIRT, shade: 0.93 }));
  for (const fem of both) {
    patch(fem, 1.17, 1.71, -0.055, 0.055, 0.005, lo ? 1 : 3, 1, B(TORSO.COLLAR, { slot: SLOT.SHIRT, shade: 0.9, ...build(fem) }));
    if (!lo) for (const y of [1.64, 1.5, 1.36]) tile(fem, y, 0, 0.004, 0.006, 0.006, B(TORSO.COLLAR, { slot: SLOT.FIXED, shade: '#e8e4da', ...build(fem) }));
  }

  // A loose hem over the hips (áo bà ba, sun jacket), fitted to the wider female hips.
  const hem = (flare: number) => loft([
    { ...torsoRingAt(true, 1.2, 0.005), n: 2.6 }, { y: 1.08, rx: 0.2, rz: 0.118, cz: -0.01, n: 2.4 }, { y: 0.975, rx: 0.2 + flare, rz: 0.124 + flare * 0.6, cz: -0.012, n: 2.3 },
  ], seg);
  // Áo bà ba: collarless, five dark buttons, two low pockets and a hip-length flared hem.
  parts.add(hem(0.022).g, B(TORSO.BA_BA, { slot: SLOT.SHIRT }));
  if (!lo) for (let k = 0; k < 5; k++) tile(true, 1.7 - k * 0.11, 0.05, 0.006, 0.006, 0.006, B(TORSO.BA_BA, { slot: SLOT.FIXED, shade: '#2b2522' }));
  for (const side of [-1, 1]) tile(true, 1.1, side * 0.5, 0.03, 0.045, 0.04, B(TORSO.BA_BA, { slot: SLOT.SHIRT, shade: 0.86 }));

  // Áo dài: a mandarin collar, a raglan seam, and front and back tà from the waist slit to mid-calf.
  parts.add(band(1.73, 1.8, 0.06, 0.054, ringSeg + 1).g, B(TORSO.AO_DAI, { slot: SLOT.SHIRT, shade: 0.96 }));
  // The opening runs from the collar to the right armpit (-x).
  if (!lo) parts.add(sweep([surf(true, 1.73, -0.4, 0.003), surf(true, 1.66, -0.95, 0.003), surf(true, 1.55, -1.45, 0.003)], () => [0.004, 0.003], 3), B(TORSO.AO_DAI, { slot: SLOT.SHIRT, shade: 0.75 }));
  const cols = lo ? 2 : 4, rows = lo ? 2 : 4;
  for (const sgn of [1, -1]) {
    const grid: V3[][] = [];
    for (let r = 0; r <= rows; r++) {
      // Rows bunch toward the hips, where the panel leaves the body.
      const t = Math.pow(r / rows, 1.4);
      const y = lerp(FIGURE.panelY + 0.01, 0.42, t);
      const width = lerp(0.15, 0.175, t);
      const zc = sgn > 0 ? lerp(0.108, 0.116, t) : -lerp(0.132, 0.126, t);
      const row: V3[] = [];
      for (let c = 0; c <= cols; c++) {
        const u = lerp(-1, 1, c / cols);
        // At the waist the panel follows the hips; lower down it hangs in a gentle curve.
        row.push(r === 0 ? surf(true, y, sgn > 0 ? u * 0.95 : Math.PI - u * 0.95, 0.006) : [u * width, y, zc - sgn * 0.045 * u * u * (1 - t * 0.6)]);
      }
      grid.push(row);
    }
    parts.add(sheet(grid, 0.008, [0, 0, sgn]), B(TORSO.AO_DAI, { slot: SLOT.SHIRT, rig: (p) => [0, sgn, smooth(FIGURE.panelY, 0.55, p.y), 1] }));
  }

  // Áo ba lỗ (male build): a scooped neckline and deep armholes show the skin.
  patch(false, 1.6, 1.728, -0.62, 0.62, 0.005, lo ? 1 : 3, lo ? 2 : 3, B(TORSO.TANK, { slot: SLOT.SKIN }));
  patch(false, 1.65, 1.728, Math.PI - 0.5, Math.PI + 0.5, 0.005, lo ? 1 : 2, 2, B(TORSO.TANK, { slot: SLOT.SKIN }));
  for (const side of [-1, 1]) patch(false, 1.47, 1.69, side * Math.PI / 2 - 0.42, side * Math.PI / 2 + 0.42, 0.005, lo ? 1 : 3, 2, B(TORSO.TANK, { slot: SLOT.SKIN }));

  // Áo chống nắng: a high zipped collar and a hem over the hips.
  parts.add(band(1.72, 1.815, 0.072, 0.06, ringSeg + 1).g, B(TORSO.JACKET, { slot: SLOT.SHIRT, shade: 0.95 }));
  parts.add(hem(0.002).g, B(TORSO.JACKET, { slot: SLOT.SHIRT }));
  for (const fem of both) patch(fem, 1.0, 1.72, -0.02, 0.02, 0.007, lo ? 1 : 3, 1, B(TORSO.JACKET, { slot: SLOT.FIXED, shade: '#3a3c40', ...build(fem) }));

  // Khăn rằn: a soft checked scarf (dark and white) rolled loosely round the base of the neck, knotted at the
  // throat with two short ends hanging.
  const kr: { p: [V3, V3, V3, V3]; slot: number; shade?: THREE.ColorRepresentation }[] = [];
  const krCols = lo ? 6 : 10, krRows = lo ? 1 : 2;
  const krAt = (c: number, r: number): V3 => {
    const a = (c / krCols) * Math.PI * 2;
    // The roll: its outer face from the shoulders up to the top of the neck band, sagging a little in front.
    const t = r / krRows, sag = 0.012 * (1 + Math.cos(a));
    const y = lerp(1.7, 1.765, t) - sag, out = Math.sin(t * Math.PI) * 0.012;
    const rx = lerp(0.112, 0.08, t) + out, rz = lerp(0.094, 0.074, t) + out;
    return [Math.sin(a) * rx, y, Math.cos(a) * rz - 0.006];
  };
  for (let r = 0; r < krRows; r++) for (let c = 0; c < krCols; c++) {
    const white = (r + c) % 2 === 1;
    kr.push({ p: [krAt(c, r), krAt(c + 1, r), krAt(c + 1, r + 1), krAt(c, r + 1)], slot: white ? SLOT.FIXED : SLOT.ACCENT2, shade: white ? '#e4ded2' : 1 });
  }
  if (!lo) for (const side of [-1, 1]) {
    const top = [side * 0.012, 1.705, 0.095] as V3, end = surf(true, 1.6, side * 0.16, 0.012);
    kr.push({ p: [top, [top[0] + side * 0.03, top[1], top[2] - 0.004], [end[0] + side * 0.02, end[1], end[2]], [end[0] - side * 0.01, end[1], end[2]]], slot: side > 0 ? SLOT.ACCENT2 : SLOT.FIXED, shade: side > 0 ? 1 : '#e4ded2' });
  }
  quads(kr, parts, B(TORSO.KHAN_RAN));

  // Khăn quàng đỏ: a red band under the collar, a knot at the throat and two tails.
  const red = '#d0261d';
  const loop: V3[] = Array.from({ length: lo ? 6 : 8 }, (_, k) => { const a = (k / (lo ? 6 : 8)) * Math.PI * 2; return [Math.sin(a) * 0.078, 1.722 - 0.012 * Math.cos(a), Math.cos(a) * 0.072 - 0.006]; });
  parts.add(sweep(loop, () => [0.012, 0.006], 3, { closed: true }), B(TORSO.RED_SCARF, { slot: SLOT.FIXED, shade: red }));
  if (!lo) parts.add(dot(4, 2), { at: [0, 1.7, 0.088], scale: [0.018, 0.016, 0.012], ...B(TORSO.RED_SCARF, { slot: SLOT.FIXED, shade: red }) });
  for (const side of [-1, 1]) {
    const top = surf(true, 1.69, side * 0.08, 0.028), mid = surf(true, 1.6, side * 0.18, 0.022), end = surf(true, 1.53, side * 0.27, 0.02);
    parts.add(sweep([top, mid, end], (i) => [0.016 - i * 0.004, 0.004], 3), B(TORSO.RED_SCARF, { slot: SLOT.FIXED, shade: red }));
  }

  // Tạp dề: an apron panel from the waist to the knee (secondary group 1).
  {
    const grid: V3[][] = [];
    const ac = lo ? 2 : 3, ar = lo ? 2 : 3;
    for (let r = 0; r <= ar; r++) {
      const y = lerp(1.21, 0.66, r / ar), row: V3[] = [];
      for (let c = 0; c <= ac; c++) {
        const u = lerp(-1, 1, c / ac);
        row.push(r === 0 ? [u * 0.13, y, 0.125 - 0.04 * u * u] : [u * lerp(0.15, 0.16, r / ar), y, 0.16 - 0.03 * u * u]);
      }
      grid.push(row);
    }
    parts.add(sheet(grid, 0.006, [0, 0, 1]), B(TORSO.APRON, { slot: SLOT.ACCENT2, rig: (p) => [0, 1, smooth(1.12, 0.7, p.y), 1] }));
  }

  // Skirt: A-line from the waist to the knee; the front and back flare apart with the stride (group 1).
  const skirt = loft([
    { ...torsoRingAt(true, 1.19, 0.005), n: 2.6 }, { y: 1.06, rx: 0.208, rz: 0.12, cz: -0.01, n: 2.4 }, { y: 0.9, rx: 0.23, rz: 0.142, cz: -0.01, n: 2.2 },
    { y: 0.64, rx: 0.248, rz: 0.165, cz: -0.008, n: 2.1 },
  ], seg);
  parts.add(skirt.g, B(TORSO.SKIRT, { slot: SLOT.PANTS, rig: (p) => [0, Math.max(-1, Math.min(1, (p.z + 0.006) / 0.05)), smooth(1.1, 0.7, p.y), 1] }));

  // Backpack (accent2): a rounded bag on the back with two straps.
  const pack = loft([
    { y: 1.62, rx: 0.1, rz: 0.035, cz: -0.15, n: 3 }, { y: 1.58, rx: 0.13, rz: 0.06, cz: -0.165, n: 3 }, { y: 1.3, rx: 0.135, rz: 0.065, cz: -0.17, n: 3 },
    { y: 1.24, rx: 0.12, rz: 0.05, cz: -0.16, n: 3 },
  ], lo ? 6 : 8, 1.64, 1.22);
  parts.add(pack.g, B(TORSO.BACKPACK, { slot: SLOT.ACCENT2 }));
  if (!lo) for (const side of [-1, 1]) {
    parts.add(sweep([[side * 0.09, 1.58, -0.12], [side * 0.11, 1.7, -0.04], [side * 0.11, 1.66, 0.08], surf(false, 1.45, side * 0.55, 0.012), [side * 0.1, 1.3, -0.08]], () => [0.016, 0.005], 3),
      B(TORSO.BACKPACK, { slot: SLOT.FIXED, shade: '#2a2b2e' }));
  }

  // A belt (male build) with a buckle.
  const belt = (bit: number, color: string, buckle: string) => {
    const b = loft([torsoRingAt(false, 1.14, 0.008), torsoRingAt(false, 1.19, 0.008)], seg);
    parts.add(b.g, B(bit, { slot: SLOT.FIXED, shade: color, gloss: 0.6 }));
    tile(false, 1.165, 0, 0.012, 0.022, 0.017, B(bit, { slot: SLOT.FIXED, shade: buckle, gloss: 1 }));
  };
  // Police kit: duty belt, a badge, epaulettes and red collar tabs.
  belt(TORSO.KIT, '#1c1f24', '#c9a640');
  tile(false, 1.52, 0.42, 0.007, 0.014, 0.017, B(TORSO.KIT, { slot: SLOT.FIXED, shade: '#d9b44a', gloss: 1 }));
  for (const side of [-1, 1]) {
    parts.add(plate([side * 0.15, 1.7, -0.004], [side * 0.026, -side * 0.011, 0], [0, 0, 0.038]), B(TORSO.KIT, { slot: SLOT.SHIRT, shade: 0.7 }));
    tile(false, 1.705, side * 0.5, 0.014, 0.013, 0.01, B(TORSO.KIT, { slot: SLOT.FIXED, shade: '#b8232a' }));
  }

  // SWAT vest: a thick shell over the torso with pouches and a radio.
  const vest = loft([
    torsoRingAt(false, 1.12, 0.03), torsoRingAt(false, 1.25, 0.034), torsoRingAt(false, 1.45, 0.034), torsoRingAt(false, 1.6, 0.028),
    { ...torsoRingAt(false, 1.68, 0.02), rx: 0.15 }, { y: 1.715, rx: 0.1, rz: 0.075, cz: -0.004, n: 2.2 },
  ], seg);
  parts.add(vest.g, B(TORSO.VEST, { slot: SLOT.SHIRT, shade: 0.55 }));
  if (!lo) {
    for (const x of [-0.09, 0, 0.09]) parts.add(dot(4, 2), { at: [x, 1.24, torsoPoint(false, 1.24, 0, 0.05)[2]], scale: [0.036, 0.04, 0.02], ...B(TORSO.VEST, { slot: SLOT.SHIRT, shade: 0.42 }) });
    parts.add(dot(4, 2), { at: surf(false, 1.5, 0.45, 0.05), scale: [0.018, 0.04, 0.016], ...B(TORSO.VEST, { slot: SLOT.FIXED, shade: '#2a2d31' }) });
  }

  belt(TORSO.BELT, '#3a2a20', '#b8a070');

  // Tie (accent2): knot and blade down the placket (male build).
  parts.add(dot(4, 2), { at: [0, 1.712, surf(false, 1.712, 0, 0.012)[2]], scale: [0.016, 0.014, 0.01], ...B(TORSO.TIE, { slot: SLOT.ACCENT2 }) });
  const tie: V3[][] = [];
  for (const y of [1.7, 1.55, 1.36, 1.24]) tie.push([[-0.012 - (1.7 - y) * 0.035, y], [0.012 + (1.7 - y) * 0.035, y]].map(([x, yy]) => [x, yy, torsoPoint(false, yy, 0, 0.008)[2]] as V3));
  parts.add(sheet(tie, 0.004, [0, 0, 1]), B(TORSO.TIE, { slot: SLOT.ACCENT2 }));

  // Gánh: a bamboo pole across the right shoulder (-x); from each end a cord carries a woven basket (thúng) whose
  // load is covered with a cloth (accent2). All of it rides the chest, so the load turns with the shoulders.
  const ganh = (o: AddOptions) => B(TORSO.GANH, { slot: SLOT.FIXED, rig: [0, 1, 0, 0], ...o });
  const gx = -0.16;
  parts.add(loft([{ y: -0.78, rx: 0.016, rz: 0.016 }, { y: 0.78, rx: 0.016, rz: 0.016 }], lo ? 4 : 6, -0.79, 0.79).g,
    { at: [gx, 1.715, 0], rot: [Math.PI / 2 - 0.06, 0, 0], ...ganh({ shade: '#b89a5a' }) });
  const around = lo ? 4 : 5;
  for (const z of [-0.74, 0.74]) {
    parts.add(sweep([[gx, 1.715 + z * 0.06, z], [gx, 0.85, z]], () => [0.004, 0.004], 3), ganh({ shade: '#7a6a4a' }));
    parts.add(loft([{ y: 0.8, rx: 0.2, rz: 0.2 }, { y: 0.6, rx: 0.14, rz: 0.14 }], around, null, 0.585).g, { at: [gx, 0, z], ...ganh({ shade: '#a8874a' }) });
    parts.add(loft([{ y: 0.795, rx: 0.195, rz: 0.195 }, { y: 0.84, rx: 0.12, rz: 0.12 }], around, null, 0.86).g, { at: [gx, 0, z], ...ganh({ slot: SLOT.ACCENT2 }) });
  }

  // Stump: a red cap at the neck cut, facing up (torso) and down (loose head).
  for (const dir of [1, -1]) {
    const g = loft([{ y: 0, rx: 0.054, rz: 0.053, cz: -0.006, shade: 0.6 }, { y: 0.004 * dir, rx: 0.04, rz: 0.04, cz: -0.006 }], ringSeg, null, 0.006 * dir);
    parts.add(g.g, { at: [0, 1.78, 0], ...B(TORSO.STUMP, { slot: SLOT.FIXED, shade: '#7a1712' }) }, undefined, g.shades);
  }
}

/** Scales the vertical part of each normal by keep(y) (0 = horizontal) and renormalises. */
function flattenNormals(g: THREE.BufferGeometry, keep: (y: number) => number) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const k = keep(p.getY(i));
    if (k >= 1) continue;
    const x = n.getX(i), y = n.getY(i) * k, z = n.getZ(i), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
  }
}

/** Indexed geometry whose triangles all face away from the body's vertical axis. */
function outward(pos: number[], idx: number[]) {
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = P(idx[t]), b = P(idx[t + 1]), c = P(idx[t + 2]);
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const mid = a.add(b).add(c);
    if (n.dot(new THREE.Vector3(mid.x, 0, mid.z)) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  return indexed(pos, idx);
}

// ---- Body ----------------------------------------------------------------------------------------------

/** The crowd body: both torso builds, the head and face, every hair style, hat and clothing part. */
export function bodyGeometry(detail: Detail = 'hi') {
  const parts = new FigureParts();
  parts.defaultRig = bodyRig;
  const seg = SEG[detail].torso;
  for (const fem of [false, true]) {
    const t = loft(torsoRings(fem), seg, 0.92, null);
    // Below the hip joints the pelvis meets the thighs: level its normals so the shading runs on into the legs
    // instead of drawing a crease (the "brief" outline).
    flattenNormals(t.g, (y) => smooth(0.93, 1.07, y));
    parts.add(t.g, { part: fem ? TORSO.FEMALE : TORSO.MALE, wordB: true, rig: bodyRig }, t.slots, t.shades);
  }
  addHead(parts, detail);
  addHair(parts, detail);
  addHeadwear(parts, detail);
  addClothing(parts, detail);
  return parts.build();
}

// ---- Hand and arm ----------------------------------------------------------------------------------------

/** A hand hanging from the wrist (arm space, the unmirrored +x build), palm facing -x; lo detail is a mitten with a free index finger. */
function addHand(parts: FigureParts, detail: Detail, side: 1 | -1) {
  const S = SEG[detail];
  const slot = ARM_SLOT.HAND;
  const W = WRIST;
  const lo = detail === 'lo', hero = detail === 'hero';
  const level = (y: number, mcp: number, pip: number, dip: number) =>
    y > mcp + 0.006 ? 0.25 : y > mcp - 0.004 ? 0.5 : y > pip + 0.004 ? 1 : y > pip - 0.004 ? 1.5 : y > dip + 0.004 ? 2 : y > dip - 0.004 ? 2.5 : 3;
  const fingerRings = (mcp: number, pip: number, dip: number, tip: number, r: number, z: number, wide = 1): Ring[] => {
    const rings: Ring[] = [{ y: mcp + 0.012, rx: r * 1.1, rz: r * 1.12 * wide }, { y: mcp, rx: r * 1.02, rz: r * 1.06 * wide }];
    if (hero) rings.push({ y: (mcp + pip) / 2, rx: r * 0.96, rz: r * wide });
    rings.push({ y: pip, rx: r * 0.97, rz: r * wide });
    if (hero) rings.push({ y: (pip + dip) / 2, rx: r * 0.9, rz: r * 0.93 * wide });
    rings.push({ y: dip, rx: r * 0.86, rz: r * 0.9 * wide });
    if (!lo) rings.push({ y: tip + r * 0.55, rx: r * 0.8, rz: r * 0.84 * wide });
    return rings.map((ring) => ({ ...ring, cz: z, cx: -0.002 }));
  };
  for (const fi of lo ? [0] : [0, 1, 2, 3]) {
    const [z, mcp0, len, r] = FINGERS[fi];
    const mcp = mcp0 + W, pip = mcp - len * PHALANX[0], dip = pip - len * PHALANX[1], tip = mcp - len;
    const g = loft(fingerRings(mcp, pip, dip, tip, r, z), lo ? 4 : S.finger, null, tip);
    parts.add(g.g, { slot, rig: (p) => [1, 1, side * (fi + 3), level(p.y, mcp, pip, dip)] });
    if (hero) parts.add(dot(4, 2), { at: [0.007 * side, tip + r * 0.9, z], scale: [0.003, r * 0.8, r * 0.7], slot, shade: 1.1, rig: [1, 1, side * (fi + 3), 3] });
  }
  if (lo) {
    // Mitten: middle, ring and little fingers as one paddle curling with the middle finger's joints.
    const [, mcp0, len] = FINGERS[1];
    const mcp = mcp0 + W, pip = mcp - len * PHALANX[0], dip = pip - len * PHALANX[1], tip = mcp - len;
    const m = loft(fingerRings(mcp, pip, dip, tip + 0.01, 0.014, -0.012, 2.1), S.palm, null, tip);
    parts.add(m.g, { slot, rig: (p) => [1, 1, side * 4, level(p.y, mcp, pip, dip)] });
  }
  // Thumb: from the thenar bulge down along the index.
  const { base, dir, seg, r } = THUMB;
  const L = seg[0] + seg[1] + seg[2];
  const thumbRings: Ring[] = [{ y: 0.012, rx: r * 1.55, rz: r * 1.4 }, { y: -seg[0] * 0.5, rx: r * 1.45, rz: r * 1.3 }, { y: -seg[0], rx: r * 1.02, rz: r * 1.05 }];
  if (hero) thumbRings.push({ y: -seg[0] - seg[1] * 0.5, rx: r * 0.95, rz: r });
  thumbRings.push({ y: -seg[0] - seg[1], rx: r * 0.92, rz: r * 0.95 });
  if (!lo) thumbRings.push({ y: -L + seg[2] * 0.4, rx: r * 0.86, rz: r * 0.88 });
  const tg = loft(thumbRings, lo ? 4 : S.finger, null, -L);
  const d = new THREE.Vector3(...dir), b = new THREE.Vector3(base[0], base[1] + W, base[2]);
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
  parts.add(tg.g, {
    slot, at: [b.x, b.y, b.z], rot: new THREE.Euler().setFromQuaternion(align).toArray().slice(0, 3) as V3,
    rig: (p) => {
      const t = new THREE.Vector3(p.x * side, p.y, p.z).sub(b).dot(d);
      return [1, 1, side * 2, t < seg[0] * 0.8 ? Math.max(0.2, t / seg[0]) : t < seg[0] + 0.004 ? 1.5 : t < seg[0] + seg[1] - 0.004 ? 2 : t < seg[0] + seg[1] + 0.004 ? 2.5 : 3];
    },
  });
}

/** Rig of the arm loft: elbow and wrist weights, finger 0 on this side. */
const armWeights = (side: 1 | -1) => (p: THREE.Vector3): Rig => [smooth(-UA + 0.05, -UA - 0.05, p.y), smooth(WRIST + 0.02, WRIST - 0.025, p.y), side, 0];

/**
 * An arm hanging from the shoulder pivot: one loft from the deltoid through the elbow and wrist into the palm
 * (no wrist seam), five fingers, optional cuff, flared sleeve, watch and bangle, and with `items` the held
 * things at the hand sockets. `side` is the x sign the arm hangs at: +1 the unmirrored build (a left arm),
 * -1 the mirrored one (a right arm, which carries the items). Slots: 0 upper sleeve, 1 lower arm, 2 hand,
 * 3 cuff, 4/5 item colours.
 */
export function armGeometry(side: 1 | -1, detail: Detail = 'hi', items = side < 0) {
  const parts = new FigureParts();
  if (side < 0) parts.base.makeScale(-1, 1, 1);
  const S = SEG[detail];
  const hero = detail === 'hero';
  const W = WRIST;
  const { UPPER, LOWER, HAND } = ARM_SLOT;
  // The deltoid cap tops out just below the shoulder pivot, under the torso's sloping shoulder line (a cap
  // above it reads as shoulder pads); the sleeve hem is only a faint step.
  const rings: (Ring | false)[] = [
    { y: -0.012, rx: 0.03, rz: 0.04, slot: UPPER }, { y: -0.042, rx: 0.054, rz: 0.06, slot: UPPER }, hero && { y: -0.085, rx: 0.055, rz: 0.059, slot: UPPER },
    { y: -0.13, rx: 0.0525, rz: 0.0565, slot: UPPER, shade: 0.97 }, { y: -0.13, rx: 0.05, rz: 0.054, slot: LOWER },
    { y: -0.2, rx: 0.05, rz: 0.057, cz: 0.002, slot: LOWER }, { y: -0.27, rx: 0.045, rz: 0.049, slot: LOWER }, { y: -UA + 0.025, rx: 0.042, rz: 0.045, slot: LOWER },
    { y: -UA - 0.025, rx: 0.044, rz: 0.048, cz: -0.004, slot: LOWER }, { y: -UA - 0.08, rx: 0.045, rz: 0.05, cz: 0.002, slot: LOWER }, { y: -UA - 0.16, rx: 0.037, rz: 0.043, slot: LOWER },
    hero && { y: -UA - 0.235, rx: 0.028, rz: 0.035, slot: LOWER }, { y: W + 0.01, rx: 0.022, rz: 0.031, slot: LOWER }, { y: W + 0.01, rx: 0.022, rz: 0.031, slot: HAND },
    { y: W - 0.025, rx: 0.023, rz: 0.04, cx: -0.002, slot: HAND }, detail !== 'lo' && { y: W - 0.06, rx: 0.021, rz: 0.046, cx: -0.001, slot: HAND },
    { y: W - 0.092, rx: 0.018, rz: 0.047, slot: HAND },
  ];
  const arm = loft(rings.filter((r): r is Ring => !!r).map((r) => ({ ...r, n: r.y > W ? 2.2 : 2.4 })), S.limb, -0.004, W - 0.106);
  parts.add(arm.g, { rig: armWeights(side) }, arm.slots, arm.shades);
  addHand(parts, detail, side);
  const band = (y0: number, y1: number, r0: number, r1: number, z = 1.18) => loft([{ y: y0, rx: r0, rz: r0 * z }, { y: y1, rx: r1, rz: r1 * z }], S.limb);
  // Long-sleeve cuff at the wrist (slot 3), a flared sleeve end (slot 1), a watch and a bangle.
  parts.add(band(W + 0.045, W + 0.012, 0.03, 0.029).g, { slot: ARM_SLOT.CUFF, part: ARM.CUFF, rig: armWeights(side) });
  const wide = loft([{ y: -UA - 0.03, rx: 0.048, rz: 0.052 }, { y: -UA - 0.17, rx: 0.052, rz: 0.058 }, { y: W + 0.03, rx: 0.058, rz: 0.064 }], S.limb);
  parts.add(wide.g, { slot: LOWER, part: ARM.WIDE, rig: armWeights(side) });
  parts.add(band(W + 0.03, W + 0.012, 0.027, 0.026).g, { slot: SLOT.FIXED, shade: '#2a2522', part: ARM.WATCH, rig: armWeights(side) });
  if (detail !== 'lo') parts.add(plate([0.0275, W + 0.021, 0], [0, 0, 0.011], [0, 0.011, 0]), { slot: SLOT.FIXED, shade: '#c9ccd0', part: ARM.WATCH, rig: armWeights(side), gloss: 1 });
  parts.add(band(W + 0.012, W - 0.002, 0.028, 0.029).g, { slot: SLOT.FIXED, shade: '#5f9e7a', part: ARM.BANGLE, rig: armWeights(side), gloss: 1 });
  if (items) addItems(parts, detail, side);
  return parts.build();
}

/** Held items riding the hand rigidly, placed in hand space (relative to the wrist; mirrored with the arm). */
function addItems(parts: FigureParts, detail: Detail, side: 1 | -1) {
  const lo = detail === 'lo';
  const rig: Rig = [1, 1, side, 0];
  const W = WRIST;
  const [gx, gy, gz] = HAND_SOCKET.GRIP;
  const at = (x: number, y: number, z: number): V3 => [x, W + y, z];
  const item = (bit: number, o: AddOptions = {}): AddOptions => ({ part: bit, rig, ...o });
  const block = (w: number, h: number, d: number) => (lo ? cheapBox(w, h, d) : box(w, h, d));

  // Phone: resting on the curled fingers, screen facing out of the palm.
  parts.add(block(0.011, 0.125, 0.062), { at: at(-0.072, -0.1, 0.0), ...item(ARM.PHONE, { slot: ARM_SLOT.ITEM, gloss: 0.8 }) });
  parts.add(plate(at(-0.0782, -0.1, 0.0), [0, 0, -0.027], [0, 0.055, 0]), item(ARM.PHONE, { slot: SLOT.FIXED, shade: '#8fb2d8', gloss: 1 }));

  // Paper fan: ribs gathered in the fist, the pleated leaf fanned out past the thumb (both faces).
  {
    const ribs = lo ? 4 : 7, rad = 0.2, inner = 0.04;
    const grid: V3[][] = [[], []];
    for (let k = 0; k <= ribs; k++) {
      const a = lerp(-1.05, 1.05, k / ribs);
      const pleat = (k % 2 ? 1 : -1) * 0.006;
      grid[0].push([gx + pleat * 0.3, W + gy - Math.sin(a) * inner, gz + Math.cos(a) * inner]);
      grid[1].push([gx + pleat, W + gy - Math.sin(a) * rad, gz + Math.cos(a) * rad]);
    }
    parts.add(sheet(grid, 0.003, [1, 0, 0]), item(ARM.FAN, { slot: ARM_SLOT.ITEM2 }));
  }

  // Broom: a long handle through the fist, angled down past the little finger, and a bundle of straw.
  {
    const dir = new THREE.Vector3(0, -0.5, -0.87).normalize();
    const start = new THREE.Vector3(gx, gy, gz).addScaledVector(dir, -0.1), end = new THREE.Vector3(gx, gy, gz).addScaledVector(dir, 1.18);
    const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)).toArray().slice(0, 3) as V3;
    const len = start.distanceTo(end);
    parts.add(loft([{ y: 0, rx: 0.011, rz: 0.011 }, { y: -len, rx: 0.011, rz: 0.011 }], lo ? 3 : 5, 0.004, -len).g, { at: [start.x, W + start.y, start.z], rot, ...item(ARM.BROOM, { slot: SLOT.FIXED, shade: '#9a7a4e' }) });
    parts.add(loft([{ y: 0, rx: 0.026, rz: 0.026 }, { y: -0.08, rx: 0.04, rz: 0.03 }, { y: -0.3, rx: 0.11, rz: 0.04 }], lo ? 4 : 6, 0.01, -0.31).g,
      { at: [end.x, W + end.y, end.z], rot, ...item(ARM.BROOM, { slot: SLOT.FIXED, shade: '#c9a85e' }) });
  }

  // Plastic bag hanging from the fist by its handles.
  {
    const bag = loft([{ y: -0.11, rx: 0.02, rz: 0.06 }, { y: -0.16, rx: 0.04, rz: 0.095 }, { y: -0.3, rx: 0.05, rz: 0.1 }, { y: -0.4, rx: 0.042, rz: 0.088 }].slice(lo ? 1 : 0), lo ? 4 : 5, null, -0.42);
    parts.add(bag.g, { at: [gx, W, gz], ...item(ARM.BAG, { slot: ARM_SLOT.ITEM2, gloss: 0.6 }) });
    if (!lo) parts.add(sweep([[gx, W - 0.115, gz - 0.05], [gx, W + gy + 0.012, gz - 0.012], [gx, W + gy + 0.012, gz + 0.02], [gx, W - 0.115, gz + 0.05]], () => [0.006, 0.003], 3), item(ARM.BAG, { slot: ARM_SLOT.ITEM2 }));
  }

  // Ly trà đá: a plastic cup of iced tea, its axis along the fist.
  {
    const cup = loft([{ y: -0.06, rx: 0.028, rz: 0.028, shade: 0.8 }, { y: 0.06, rx: 0.034, rz: 0.034, shade: 1 }, { y: 0.068, rx: 0.034, rz: 0.034, shade: 1.4 }], lo ? 5 : 7, -0.06, 0.068);
    parts.add(cup.g, { at: at(-0.05, -0.075, 0.012), rot: [Math.PI / 2, 0, 0], ...item(ARM.CUP, { slot: SLOT.FIXED, shade: '#b06a2c', gloss: 0.8 }) }, undefined, cup.shades);
  }

  // Nón lá held by the brim as a fan: the cone hangs past the fingers, its hollow toward the body.
  {
    const cone = loft([{ y: 0.17, rx: 0.06, rz: 0.06 }, { y: 0.0, rx: 0.31, rz: 0.31 }, { y: 0.012, rx: 0.29, rz: 0.29, shade: 0.55 }, { y: 0.16, rx: 0.04, rz: 0.04, shade: 0.5 }], lo ? 5 : 8, 0.18, 0.17);
    parts.add(cone.g, { at: at(gx - 0.01, gy - 0.29, gz), rot: [0, 0, Math.PI / 2], ...item(ARM.NON_LA, { slot: SLOT.FIXED, shade: '#e6d3a0' }) }, undefined, cone.shades);
  }

  // Baton: a rod through the fist, out past the thumb.
  parts.add(loft([{ y: 0.09, rx: 0.014, rz: 0.014 }, { y: -0.42, rx: 0.012, rz: 0.012 }], lo ? 3 : 6, lo ? null : 0.095, lo ? null : -0.425).g,
    { at: at(gx, gy, gz), rot: [-Math.PI / 2, 0, 0], ...item(ARM.BATON, { slot: SLOT.FIXED, shade: '#1d1f22', gloss: 0.5 }) });

  // Guns: the grip runs through the fist channel, the slide or receiver sits above the thumb along the fingers.
  // Outlines are (y, z) in hand space; y < 0 is toward the muzzle.
  const gun = (bit: number, outline: [number, number][], color: string, accent?: string) => {
    if (lo) {
      const ys = outline.map((p) => p[0]), zs = outline.map((p) => p[1]);
      parts.add(cheapBox(0.026, 0.05, 0.08), { at: at(gx - 0.002, gy + 0.004, gz - 0.008), ...item(bit, { slot: SLOT.FIXED, shade: color }) });
      parts.add(cheapBox(0.026, Math.max(...ys) - Math.min(...ys), 0.034), { at: at(gx - 0.002, (Math.max(...ys) + Math.min(...ys)) / 2, gz + 0.052), ...item(bit, { slot: SLOT.FIXED, shade: accent ?? color }) });
      void zs;
      return;
    }
    parts.add(extrude(outline, 0.026), { at: [gx - 0.002, W, 0], ...item(bit, { slot: SLOT.FIXED, shade: color, gloss: 0.8 }) });
  };
  const pistol: [number, number][] = [[gy + 0.03, gz - 0.05], [gy - 0.02, gz - 0.044], [gy - 0.018, gz + 0.035], [gy - 0.17, gz + 0.035], [gy - 0.17, gz + 0.069], [gy + 0.035, gz + 0.069]];
  gun(ARM.PISTOL, pistol, '#2b2f33');
  gun(ARM.TASER, pistol, '#e0b92e', '#24272b');
  gun(ARM.RIFLE, [[gy + 0.03, gz - 0.05], [gy - 0.02, gz - 0.044], [gy - 0.02, gz + 0.035], [gy - 0.55, gz + 0.045], [gy - 0.55, gz + 0.075], [gy + 0.33, gz + 0.085], [gy + 0.33, gz + 0.03], [gy + 0.06, gz + 0.04]], '#24282c', '#2f3337');
}

// ---- Leg and feet ------------------------------------------------------------------------------------------

/** Leg weights: knee, ankle (the lower shin follows the foot a little) and toe. */
const legWeights = (p: THREE.Vector3): Rig => [smooth(-TH + 0.05, -TH - 0.05, p.y), smooth(ANKLE + 0.045, ANKLE - 0.02, p.y), 0, 0];
const footRig = (p: THREE.Vector3): Rig => [1, 1, smooth(FIGURE.ball - 0.02, FIGURE.ball + 0.02, p.z), 0];

/**
 * A leg hanging from the hip pivot: one loft to the ankle with a calf and a hem ring at the knee (slot 0
 * thigh, 1 shin), the foot along +z bending at the ball, and the footwear parts.
 */
export function legGeometry(detail: Detail = 'hi') {
  const parts = new FigureParts();
  const S = SEG[detail];
  const lo = detail === 'lo';
  const { THIGH, SHIN } = LEG_SLOT;
  const leg = loft([
    { y: 0.07, rx: 0.06, rz: 0.064, slot: THIGH }, { y: 0.01, rx: 0.086, rz: 0.09, slot: THIGH }, { y: -0.09, rx: 0.084, rz: 0.087, rzb: 0.092, slot: THIGH },
    { y: -0.2, rx: 0.077, rz: 0.08, slot: THIGH }, { y: -0.32, rx: 0.065, rz: 0.068, slot: THIGH }, { y: -TH + 0.04, rx: 0.058, rz: 0.06, cz: 0.003, slot: THIGH },
    { y: -TH + 0.01, rx: 0.0575, rz: 0.0595, cz: 0.004, slot: THIGH, shade: 0.96 }, { y: -TH + 0.01, rx: 0.0565, rz: 0.0585, cz: 0.004, slot: SHIN },
    { y: -TH - 0.05, rx: 0.052, rz: 0.054, slot: SHIN }, { y: -TH - 0.13, rx: 0.053, rz: 0.05, rzb: 0.07, cz: -0.004, slot: SHIN },
    { y: -TH - 0.25, rx: 0.044, rz: 0.042, rzb: 0.056, cz: -0.004, slot: SHIN }, { y: -TH - 0.38, rx: 0.034, rz: 0.036, slot: SHIN },
    { y: ANKLE + 0.02, rx: 0.03, rz: 0.032, slot: SHIN },
  ].map((r) => ({ ...r, n: 2.2 })), S.limb, 0.08, ANKLE - 0.025);
  flattenNormals(leg.g, (y) => (y > -0.12 ? 0.2 : 1));
  parts.add(leg.g, { rig: legWeights }, leg.slots, leg.shades);
  // Feet are lofted along +z (heel to toe): loft y becomes +z and loft z becomes -y, so cz > 0 lowers the forefoot.
  const footRot: V3 = [Math.PI / 2, 0, 0];
  const foot = loft([
    { y: -0.05, rx: 0.028, rz: 0.03 }, { y: 0.0, rx: 0.035, rz: 0.038, cz: -0.004 }, { y: 0.07, rx: 0.041, rz: 0.03, cz: 0.003 }, { y: 0.15, rx: 0.047, rz: 0.021, cz: 0.012 },
    { y: 0.2, rx: 0.047, rz: 0.017, cz: 0.017 }, { y: 0.232, rx: 0.04, rz: 0.014, cz: 0.019 },
  ].filter((_, i) => !lo || i !== 4), lo ? 6 : 8, -0.062, 0.252);
  parts.add(foot.g, { at: [0, SOLE + 0.036, 0], rot: footRot, slot: LEG_SLOT.SKIN, part: LEG.BARE, rig: footRig });
  if (!lo) parts.add(ball(5, 3), { at: [0.024, SOLE + 0.02, 0.24], scale: [0.016, 0.012, 0.022], slot: LEG_SLOT.SKIN, shade: 0.95, part: LEG.BARE, rig: footRig });

  const shoeShell = (top: number, toe: number, rise = 0) => loft([
    { y: -0.068, rx: 0.034, rz: 0.04 + rise * 0.3, cz: -rise * 0.3 }, { y: -0.02, rx: 0.044, rz: 0.05 + rise * 0.5, cz: -rise * 0.5 }, { y: 0.07, rx: 0.05, rz: top },
    { y: 0.17, rx: 0.054, rz: 0.03, cz: 0.008 }, { y: toe - 0.03, rx: 0.048, rz: 0.024, cz: 0.012 },
  ].filter((_, i) => !lo || i !== 0), S.limb, -0.078, toe);
  // Soles: a flat rounded slab (four sides, corners at 45 degrees).
  const sole = (y0: number, y1: number, thick: number) => loft([
    { y: y0, rx: 0.036, rz: thick, n: 3 }, { y: 0.0, rx: 0.046, rz: thick, n: 3 }, { y: 0.16, rx: 0.054, rz: thick, n: 3 }, { y: y1 - 0.02, rx: 0.046, rz: thick, n: 3 },
  ].filter((_, i) => !lo || i !== 1), 4, y0 - 0.01, y1, Math.PI / 4);
  const strap = (path: V3[], w: number) => sweep(path, () => [w, 0.004], lo ? 3 : 4);
  // Sneakers and leather shoes: a shell over the foot and a sole (slot 4).
  parts.add(shoeShell(0.042, 0.27).g, { at: [0, SOLE + 0.044, 0], rot: footRot, slot: LEG_SLOT.SHOE, part: LEG.SHOE, rig: footRig, gloss: 0.5 });
  parts.add(sole(-0.075, 0.28, 0.011).g, { at: [0, SOLE + 0.011, 0], rot: footRot, slot: LEG_SLOT.SOLE, part: LEG.SHOE, rig: footRig });
  // Dép: a thin sole and a V strap over bare toes.
  parts.add(sole(-0.07, 0.27, 0.007).g, { at: [0, SOLE + 0.007, 0], rot: footRot, slot: LEG_SLOT.SOLE, part: LEG.DEP, rig: footRig });
  parts.add(strap([[-0.042, SOLE + 0.012, 0.1], [-0.02, SOLE + 0.05, 0.13], [0.0, SOLE + 0.035, 0.2], [0.02, SOLE + 0.05, 0.13], [0.044, SOLE + 0.012, 0.1]], 0.009), { slot: LEG_SLOT.SHOE, part: LEG.DEP, rig: footRig });
  // Sandal: sole, a band over the forefoot and an ankle strap.
  parts.add(sole(-0.07, 0.27, 0.01).g, { at: [0, SOLE + 0.01, 0], rot: footRot, slot: LEG_SLOT.SOLE, part: LEG.SANDAL, rig: footRig });
  parts.add(strap([[-0.05, SOLE + 0.012, 0.14], [-0.03, SOLE + 0.055, 0.15], [0.03, SOLE + 0.055, 0.15], [0.05, SOLE + 0.012, 0.14]], 0.012), { slot: LEG_SLOT.SHOE, part: LEG.SANDAL, rig: footRig });
  if (!lo) parts.add(sweep(Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2; return [Math.sin(a) * 0.036, ANKLE + 0.005, Math.cos(a) * 0.038 - 0.006] as V3; }), () => [0.006, 0.003], 3, { closed: true }),
    { slot: LEG_SLOT.SHOE, part: LEG.SANDAL, rig: [1, 1, 0, 0] });
  // Boots: a tall glossy shell to mid-calf.
  const boot = loft([{ y: -TH - 0.2, rx: 0.052, rz: 0.05, rzb: 0.066, cz: -0.004 }, { y: ANKLE + 0.01, rx: 0.042, rz: 0.046 }], S.limb);
  parts.add(boot.g, { slot: LEG_SLOT.SHOE, part: LEG.BOOT, rig: legWeights, gloss: 0.7 });
  parts.add(shoeShell(0.046, 0.275, 0.02).g, { at: [0, SOLE + 0.046, 0], rot: footRot, slot: LEG_SLOT.SHOE, part: LEG.BOOT, rig: footRig, gloss: 0.7 });
  parts.add(sole(-0.078, 0.285, 0.014).g, { at: [0, SOLE + 0.013, 0], rot: footRot, slot: LEG_SLOT.SOLE, part: LEG.BOOT, rig: footRig });
  // Wide trousers: a bell that falls over the instep (it does not turn with the foot).
  const wide = loft([{ y: -TH - 0.01, rx: 0.059, rz: 0.061 }, { y: -TH - 0.22, rx: 0.068, rz: 0.072, cz: 0.004 }, { y: ANKLE + 0.02, rx: 0.077, rz: 0.082, cz: 0.012 }, { y: ANKLE - 0.035, rx: 0.08, rz: 0.088, cz: 0.02 }], S.limb);
  parts.add(wide.g, { slot: SHIN, part: LEG.WIDE, rig: [1, 0, 0, 0] });
  // Low heels: a pointed shell and a heel block.
  parts.add(shoeShell(0.038, 0.262).g, { at: [0, SOLE + 0.04, 0], rot: footRot, slot: LEG_SLOT.SHOE, part: LEG.HEEL, rig: footRig, gloss: 0.6 });
  parts.add(lo ? cheapBox(0.03, 0.035, 0.04) : box(0.03, 0.035, 0.04), { at: [0, SOLE + 0.017, -0.035], slot: LEG_SLOT.SOLE, part: LEG.HEEL, rig: footRig });
  return parts.build();
}

// ---- Umbrella ----------------------------------------------------------------------------------------------

/** Umbrella in crowd model units: handle at the origin, shaft up +y, canopy on top (`length` is handle to tip). */
export const UMBRELLA = { length: 1.15, radius: 0.84, drop: 0.32 } as const;

/** An open umbrella: J handle, shaft, faceted canopy panels alternating palette slots 0 and 1, a darker underside. */
export function umbrellaGeometry(panels = 8) {
  const parts = new FigureParts();
  const top = UMBRELLA.length, r = UMBRELLA.radius, rim = top - UMBRELLA.drop;
  const cyl = (rt: number, rb: number, h: number, s: number) => new THREE.CylinderGeometry(rt, rb, h, s);
  parts.add(cyl(0.022, 0.022, 0.18, 6), { at: [0, -0.02, 0], shade: '#4a3324' });
  parts.add(new THREE.TorusGeometry(0.045, 0.018, 4, 8, Math.PI), { at: [-0.045, -0.11, 0], rot: [0, 0, Math.PI], shade: '#4a3324' });
  parts.add(cyl(0.012, 0.012, top + 0.1, 5), { at: [0, (top + 0.1) / 2, 0], shade: '#2c2c2e' });
  const outside = [new THREE.Vector2(r, rim), new THREE.Vector2(r * 0.7, rim + 0.19), new THREE.Vector2(r * 0.36, top - 0.04), new THREE.Vector2(0.001, top)];
  const inside = [...outside].reverse().map((p) => new THREE.Vector2(p.x, p.y - 0.015));
  const step = (Math.PI * 2) / panels;
  for (let k = 0; k < panels; k++) {
    parts.add(new THREE.LatheGeometry(outside, 1, k * step, step), { slot: k % 2, flat: true });
    parts.add(new THREE.LatheGeometry(inside, 1, k * step, step), { slot: k % 2, shade: 0.6, flat: true });
    parts.add(ball(4, 3), { at: [Math.sin(k * step) * r, rim - 0.01, Math.cos(k * step) * r], scale: 0.022, shade: '#2c2c2e' });
  }
  parts.add(cyl(0.02, 0.01, 0.12, 5), { at: [0, top + 0.05, 0], shade: '#2c2c2e' });
  return parts.build();
}

// ---- Shared builds ---------------------------------------------------------------------------------------------

export type FigurePiece = 'body' | 'armL' | 'armR' | 'leg';
const cache = new Map<string, THREE.BufferGeometry>();
/** Geometry built once per piece and detail (a module-wide cache; never dispose these). */
export function figureGeometry(piece: FigurePiece, detail: Detail) {
  const key = `${piece}:${detail}`;
  let g = cache.get(key);
  if (!g) {
    // Right arms hang at -x (people face +z), mirrored, with the held items; left arms are the plain build.
    g = piece === 'body' ? bodyGeometry(detail) : piece === 'leg' ? legGeometry(detail) : piece === 'armR' ? armGeometry(-1, detail, true) : armGeometry(1, detail, false);
    g.userData.sharedGeometry = true;
    cache.set(key, g);
  }
  return g;
}
