import * as THREE from 'three';
import type { RagdollLook } from './ragdoll';

/**
 * Stylised low-poly people for the instanced crowds (residents, police, ragdolls).
 *
 * Every body part is one merged geometry whose vertices name a palette slot (shirt, pants, skin, hair,
 * accent, or a fixed colour) and optionally an extra part (hair styles, hats, police kit, weapons).
 * Each instance carries its own five-colour palette and a bit mask of the extra parts it shows, so a
 * whole crowd with varied clothes, hair and hats is still one draw call per body part.
 */

/** Palette slots. Body meshes use shirt/pants/skin/hair/accent; limb meshes reuse the first slots for their own colours. */
export const SLOT = { SHIRT: 0, PANTS: 1, SKIN: 2, HAIR: 3, ACCENT: 4, FIXED: 5 } as const;

/** Optional parts, one bit each; an instance shows the parts whose bits are set in its mask. */
export const PART = {
  DOME: 1 << 0, FRINGE: 1 << 1, LONG: 1 << 2, BUN: 1 << 3, TAIL: 1 << 4,
  CONE: 1 << 5, BANDANA: 1 << 6, CAP: 1 << 7, SWAT: 1 << 8, HELMET: 1 << 9,
  KIT: 1 << 10, VEST: 1 << 11,
  STRAIGHT: 1 << 12, BENT: 1 << 13,
  BATON: 1 << 14, PISTOL: 1 << 15, TASER: 1 << 16, RIFLE: 1 << 17,
  THIN: 1 << 18,
  /** Motorbike riders: long sleeves (sun jacket) and a cloth face mask, light or dark. */
  SLEEVE: 1 << 19, MASK: 1 << 20, MASK_DARK: 1 << 21,
} as const;

/** Skeleton of the crowd model (feet at y = 0, facing +z). */
export const FIGURE = { hipX: 0.135, hipY: 0.76, shoulderX: 0.33, shoulderY: 1.47, headY: 1.87, headR: 0.27, sitDrop: 0.14 } as const;

export type FigureStyle = {
  /** Head and torso parts (hair style, hat, police kit...). */
  mask: number;
  hair: string;
  accent: string;
  forearm: 'skin' | 'shirt';
  shin: 'pants' | 'skin';
  shoes: string;
  /** Per-person build: horizontal and vertical scale. */
  width: number;
  height: number;
};

const HAIR = ['#1d1916', '#2a2220', '#33261f', '#3d2b20', '#1a1a1c'];
const GREY = ['#cfcac2', '#a9a49c', '#bdb7ad'];
const SHOES = ['#2b2622', '#3b2f28', '#e9e4da', '#6b4a35', '#26303a', '#8a3f2f'];
const styles = new WeakMap<RagdollLook, FigureStyle>();

function hashOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Deterministic style for a look; `seed` adds per-person variety on top of the look's own colours. */
export function deriveStyle(look: RagdollLook, seed = 0, role = ''): FigureStyle {
  const r = (k: number) => hashOf(`${look.shirt}${look.pants}${look.skin}${look.hat ?? ''}${look.helmet ?? ''}${seed}:${k}`);
  const older = role === 'retiree';
  const roll = r(1);
  let mask: number = PART.DOME;
  if (role === 'vendor') mask |= roll < 0.6 ? PART.BUN : PART.LONG;
  else if (role === 'student') mask |= roll < 0.45 ? PART.TAIL : PART.FRINGE;
  else if (older) mask = roll < 0.35 ? PART.DOME | PART.BUN : roll < 0.75 ? PART.THIN : PART.DOME;
  else mask |= roll < 0.42 ? PART.FRINGE : roll < 0.66 ? PART.LONG : roll < 0.8 ? PART.TAIL : roll < 0.88 ? PART.BUN : 0;
  if (look.hat) mask |= PART.CONE;
  if (look.helmet) mask = PART.HELMET;
  const sleeves = role === 'vendor' ? 0.7 : role === 'student' ? 0 : 0.22;
  return {
    mask,
    hair: (older ? GREY : HAIR)[Math.floor(r(2) * (older ? GREY.length : HAIR.length))],
    accent: look.helmet ?? look.hat ?? '#e5cf92',
    forearm: r(3) < sleeves ? 'shirt' : 'skin',
    shin: role === 'student' || role === 'vendor' || older ? 'pants' : r(4) < 0.14 ? 'skin' : 'pants',
    shoes: role === 'student' ? '#e9e4da' : SHOES[Math.floor(r(5) * SHOES.length)],
    width: (role === 'student' ? 0.92 : 0.94) + r(6) * 0.14,
    height: (role === 'student' ? 0.9 : older ? 0.93 : 0.96) + r(7) * 0.08,
  };
}

/** Remembers how a look is dressed so its ragdoll matches the standing person. */
export function setStyle(look: RagdollLook, style: FigureStyle) { styles.set(look, style); }
export function styleOf(look: RagdollLook) {
  let style = styles.get(look);
  if (!style) { style = deriveStyle(look); styles.set(look, style); }
  return style;
}

const tmp = new THREE.Color();
/** Packs five slot colours and a part mask into the 16 floats one instance needs. */
export function palette(colors: (THREE.ColorRepresentation | undefined)[], mask = 0, out = new Float32Array(16)) {
  for (let k = 0; k < 5; k++) {
    tmp.set(colors[k] ?? '#ffffff');
    out[k * 3] = tmp.r; out[k * 3 + 1] = tmp.g; out[k * 3 + 2] = tmp.b;
  }
  out[15] = mask;
  return out;
}

// ---- Geometry assembly ----------------------------------------------------------------------------

type AddOptions = {
  at?: [number, number, number];
  scale?: number | [number, number, number];
  rot?: [number, number, number];
  slot?: number;
  part?: number;
  /** Colour multiplier (number = grey level); for SLOT.FIXED this is the colour itself. */
  shade?: THREE.ColorRepresentation;
  smooth?: boolean;
};

const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scaling = new THREE.Vector3(), euler = new THREE.Euler();

/** Collects primitives into one non-indexed geometry with colour and palette-tag attributes. */
export class FigureParts {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private tags: number[] = [];
  /** Extra transform applied to everything added (e.g. to place a head on a body). */
  base = new THREE.Matrix4();

  add(source: THREE.BufferGeometry, o: AddOptions = {}) {
    const g = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    if (!o.smooth) { g.deleteAttribute('normal'); g.computeVertexNormals(); }
    const s = o.scale ?? 1;
    euler.set(...(o.rot ?? [0, 0, 0]));
    matrix.compose(position.set(...(o.at ?? [0, 0, 0])), quaternion.setFromEuler(euler), typeof s === 'number' ? scaling.setScalar(s) : scaling.set(...s));
    g.applyMatrix4(matrix.premultiply(this.base));
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const shade = typeof o.shade === 'number' ? tmp.setRGB(o.shade, o.shade, o.shade) : tmp.set(o.shade ?? '#ffffff');
    const part = o.part ? Math.log2(o.part) + 1 : 0;
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i), p.getY(i), p.getZ(i));
      this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
      this.colors.push(shade.r, shade.g, shade.b);
      this.tags.push(o.slot ?? SLOT.FIXED, part);
    }
    g.dispose();
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('tag', new THREE.Float32BufferAttribute(this.tags, 2));
    return g;
  }
}

const sphere = (r: number, w = 8, h = 6, thetaLength = Math.PI) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, thetaLength);
const cyl = (top: number, bottom: number, height: number, seg = 8) => new THREE.CylinderGeometry(top, bottom, height, seg);
/** A tube without end caps, for segments whose ends are hidden inside joints. */
const tube = (top: number, bottom: number, height: number, seg = 8) => new THREE.CylinderGeometry(top, bottom, height, seg, 1, true);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const lathe = (profile: number[], seg = 10) => {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < profile.length; i += 2) points.push(new THREE.Vector2(profile[i], profile[i + 1]));
  return new THREE.LatheGeometry(points, seg, Math.PI / seg);
};
/** Front half of a flat disc (cap visors and helmet peaks). */
const halfDisc = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 10, 1, false, -Math.PI / 2, Math.PI);

/**
 * Head of radius 1 centred on the origin: face, then every hair style and hat the `set` allows.
 * 'rider' is a motorbike rider: the face, a half helmet and optional face masks, no loose hair.
 */
export function addHead(parts: FigureParts, set: 'civil' | 'police' | 'all' | 'rider') {
  const { SKIN, HAIR, ACCENT, SHIRT } = SLOT;
  const rider = set === 'rider';
  parts.add(sphere(1, 12, 8), { scale: [1, 1.07, 0.97], slot: SKIN, smooth: true });
  for (const side of [-1, 1]) {
    parts.add(sphere(0.2, 5, 3), { at: [side * 0.97, -0.04, 0.02], scale: [0.6, 1, 0.75], slot: SKIN, shade: 0.93 });
    parts.add(sphere(0.13, 7, 4), { at: [side * 0.36, 0.03, 0.885], scale: [0.95, 1.3, 0.5], shade: '#2a201b' });
    parts.add(box(0.32, 0.075, 0.09), { at: [side * 0.37, 0.33, 0.855], rot: [-0.25, 0, side * -0.1], slot: HAIR, shade: 0.85 });
  }
  parts.add(sphere(0.13, 5, 3), { at: [0, -0.14, 0.95], scale: [1, 0.85, 0.85], slot: SKIN, shade: 0.97 });
  parts.add(box(0.24, 0.05, 0.06), { at: [0, -0.43, 0.875], rot: [0.35, 0, 0], slot: SKIN, shade: 0.55 });

  if (!rider) {
    // Hair: a chunky dome tilted back so the forehead stays clear, with sideburns, plus a style-specific extra.
    parts.add(sphere(1.07, 12, 6, Math.PI * 0.56), { scale: [1, 1.07, 0.99], rot: [-0.5, 0, 0], slot: HAIR, part: PART.DOME });
    for (const side of [-1, 1]) parts.add(box(0.14, 0.4, 0.3), { at: [side * 0.93, -0.06, 0.22], rot: [0, side * 0.35, 0], slot: HAIR, part: PART.DOME });
    // Thinning hair for older people: only the back and sides.
    parts.add(sphere(1.07, 12, 5, Math.PI * 0.5), { scale: [1, 1.07, 0.99], rot: [-1.0, 0, 0], at: [0, -0.04, 0], slot: HAIR, part: PART.THIN });
  }
  if (set === 'civil' || set === 'all') {
    parts.add(sphere(0.5, 6, 4), { at: [0.22, 0.6, 0.66], scale: [1.4, 0.5, 0.75], rot: [-0.55, 0, -0.3], slot: HAIR, part: PART.FRINGE });
    parts.add(sphere(1, 8, 6), { at: [0, -0.5, -0.36], scale: [1.08, 1.0, 0.74], slot: HAIR, part: PART.LONG });
    for (const side of [-1, 1]) parts.add(sphere(0.5, 5, 4), { at: [side * 0.84, -0.42, 0.14], scale: [0.62, 1.4, 0.95], slot: HAIR, part: PART.LONG });
    parts.add(sphere(0.42, 7, 5), { at: [0, 0.55, -0.95], slot: HAIR, part: PART.BUN });
    parts.add(sphere(0.3, 6, 4), { at: [0, -0.32, -1.18], scale: [1, 2.2, 1], rot: [0.35, 0, 0], slot: HAIR, part: PART.TAIL });
    parts.add(sphere(0.2, 5, 3), { at: [0, 0.32, -1.06], slot: HAIR, shade: 0.7, part: PART.TAIL });
    // Nón lá: a wide straw cone.
    parts.add(new THREE.ConeGeometry(2.05, 1.15, 14), { at: [0, 1.1, 0], slot: ACCENT, part: PART.CONE });
    parts.add(new THREE.CylinderGeometry(1.12, 1.15, 0.32, 12), { at: [0, 0.3, 0], rot: [-0.12, 0, 0], slot: ACCENT, part: PART.BANDANA });
    for (const side of [-1, 1]) parts.add(box(0.16, 0.5, 0.08), { at: [side * 0.14, 0.02, -1.12], rot: [0.35, 0, side * 0.35], slot: ACCENT, part: PART.BANDANA });
  }
  if (set === 'police' || set === 'all') {
    // Peaked police cap: flared crown, red band, dark visor and a gold badge.
    parts.add(cyl(1.24, 1.08, 0.5, 14), { at: [0, 0.68, -0.02], rot: [-0.08, 0, 0], slot: ACCENT, part: PART.CAP });
    parts.add(cyl(1.1, 1.1, 0.16, 14), { at: [0, 0.48, -0.01], rot: [-0.08, 0, 0], shade: '#9c3a32', part: PART.CAP });
    parts.add(halfDisc(0.95, 0.07), { at: [0, 0.42, 0.62], scale: [1, 1, 0.78], rot: [0.28, 0, 0], shade: '#151a22', part: PART.CAP });
    parts.add(sphere(0.17, 6, 4), { at: [0, 0.74, 1.08], scale: [1, 1, 0.45], shade: '#d9b44a', part: PART.CAP });
    // SWAT helmet with ear guards and a short peak.
    parts.add(sphere(1.2, 12, 6, Math.PI * 0.54), { at: [0, 0.1, -0.04], scale: [1, 0.95, 1.04], rot: [-0.32, 0, 0], slot: ACCENT, part: PART.SWAT });
    parts.add(halfDisc(1.0, 0.08), { at: [0, 0.4, 0.68], scale: [1, 1, 0.55], rot: [0.15, 0, 0], slot: ACCENT, shade: 0.8, part: PART.SWAT });
    for (const side of [-1, 1]) parts.add(box(0.2, 0.62, 0.62), { at: [side * 1.08, -0.08, -0.02], slot: ACCENT, shade: 0.85, part: PART.SWAT });
  }
  if (set === 'all' || rider) {
    // Motorbike half helmet with a peak and a stripe in the shirt colour.
    parts.add(sphere(1.15, 12, 6, Math.PI * 0.52), { at: [0, 0.06, -0.02], scale: [1, 1.0, 1.02], rot: [-0.3, 0, 0], slot: ACCENT, part: PART.HELMET });
    parts.add(sphere(1.17, 12, 6, Math.PI * 0.5), { at: [0, 0.06, -0.02], scale: [0.2, 1.0, 1.03], rot: [-0.3, 0, 0], slot: SHIRT, part: PART.HELMET });
    parts.add(halfDisc(0.85, 0.07), { at: [0, 0.36, 0.86], scale: [1, 1, 0.6], rot: [0.15, 0, 0], slot: ACCENT, shade: 0.9, part: PART.HELMET });
  }
  if (rider) {
    // A cloth face mask (khẩu trang) over nose and mouth: light surgical blue or dark cloth.
    for (const [part, shade] of [[PART.MASK, '#b4cfdc'], [PART.MASK_DARK, '#2c3036']] as const) {
      parts.add(new THREE.SphereGeometry(1.04, 12, 4, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.53, Math.PI * 0.28), { scale: [1, 1.07, 0.97], shade, part });
      parts.add(sphere(0.2, 6, 4), { at: [0, -0.17, 0.93], scale: [1, 0.9, 0.75], shade, part });
      for (const side of [-1, 1]) parts.add(box(0.05, 0.05, 0.5), { at: [side * 0.97, -0.12, 0.2], rot: [0.3, side * 0.2, 0], shade, part });
    }
  }
  return parts;
}

/** Torso of the crowd model in model units (pelvis, shirt, neck), plus police kit and SWAT vest. */
export function addTorso(parts: FigureParts, police: boolean) {
  const { SHIRT, PANTS, SKIN } = SLOT;
  parts.add(lathe([0, 0.67, 0.2, 0.67, 0.245, 0.73, 0.25, 0.88, 0, 0.88], 10), { scale: [1, 1, 0.66], slot: PANTS });
  parts.add(lathe([0, 0.83, 0.262, 0.83, 0.262, 0.9, 0.245, 1.03, 0.258, 1.2, 0.287, 1.36, 0.287, 1.45, 0.235, 1.525, 0.11, 1.565, 0, 1.565], 10), { scale: [1, 1, 0.64], slot: SHIRT });
  parts.add(cyl(0.11, 0.125, 0.05, 10), { at: [0, 1.55, 0], scale: [1, 1, 0.8], slot: SHIRT, shade: 0.86 });
  parts.add(tube(0.072, 0.08, 0.16, 8), { at: [0, 1.62, 0], slot: SKIN });
  if (!police) return parts;
  parts.add(cyl(0.258, 0.258, 0.07, 10), { at: [0, 0.87, 0], scale: [1, 1, 0.68], shade: '#1c1f24', part: PART.KIT });
  parts.add(box(0.08, 0.06, 0.03), { at: [0, 0.87, 0.172], shade: '#d9b44a', part: PART.KIT });
  parts.add(box(0.07, 0.08, 0.02), { at: [-0.13, 1.33, 0.172], rot: [-0.12, 0, 0], shade: '#d9b44a', part: PART.KIT });
  for (const side of [-1, 1]) parts.add(box(0.14, 0.03, 0.17), { at: [side * 0.2, 1.505, 0], rot: [0, 0, side * -0.45], slot: SHIRT, shade: 0.7, part: PART.KIT });
  parts.add(lathe([0, 0.95, 0.29, 0.95, 0.3, 1.2, 0.31, 1.42, 0.24, 1.5, 0, 1.5], 10), { scale: [1, 1, 0.7], slot: SHIRT, shade: 0.62, part: PART.VEST });
  for (const x of [-0.15, 0, 0.15]) parts.add(box(0.11, 0.13, 0.06), { at: [x, 1.08, 0.215], slot: SHIRT, shade: 0.45, part: PART.VEST });
  parts.add(box(0.06, 0.14, 0.05), { at: [0.17, 1.38, 0.21], shade: '#2a2d31', part: PART.VEST });
  return parts;
}

/** Crowd body: torso and head in one piece (it never bends at the neck). */
export function bodyGeometry(set: 'civil' | 'police') {
  const parts = new FigureParts();
  addTorso(parts, set === 'police');
  parts.base.compose(position.set(0, FIGURE.headY, 0.015), quaternion.identity(), scaling.setScalar(FIGURE.headR));
  addHead(parts, set);
  return parts.build();
}

/**
 * Leg hanging from the hip pivot: slot 0 thigh, 1 shin, 2 shoe. Two variants share the hip joint:
 * STRAIGHT for standing and walking, BENT (thigh forward, shin down) for sitting.
 */
export function legGeometry() {
  const parts = new FigureParts();
  parts.add(sphere(0.118, 7, 5), { at: [0, -0.02, 0], slot: 0 });
  const shoe = (y: number, z: number, part: number) => {
    parts.add(box(0.15, 0.1, 0.25), { at: [0, y + 0.05, z + 0.04], slot: 2, part });
    parts.add(sphere(0.075, 6, 3), { at: [0, y + 0.045, z + 0.165], scale: [1, 0.7, 1.1], slot: 2, part });
    parts.add(box(0.16, 0.03, 0.29), { at: [0, y + 0.012, z + 0.06], slot: 2, shade: 0.55, part });
  };
  parts.add(tube(0.116, 0.1, 0.36, 8), { at: [0, -0.18, 0], slot: 0, part: PART.STRAIGHT });
  parts.add(tube(0.098, 0.082, 0.33, 8), { at: [0, -0.495, 0], slot: 1, part: PART.STRAIGHT });
  shoe(-0.755, 0, PART.STRAIGHT);
  parts.add(tube(0.104, 0.116, 0.38, 8), { at: [0, -0.01, 0.17], rot: [Math.PI / 2, 0, 0], slot: 0, part: PART.BENT });
  parts.add(sphere(0.104, 6, 4), { at: [0, -0.01, 0.36], slot: 0, part: PART.BENT });
  parts.add(tube(0.096, 0.082, 0.5, 8), { at: [0, -0.28, 0.37], slot: 1, part: PART.BENT });
  shoe(-0.61, 0.36, PART.BENT);
  return parts.build();
}

/** Arm hanging from the shoulder pivot: slot 0 sleeve, 1 forearm, 2 hand; police arms can hold a weapon. */
export function armGeometry(weapons: boolean) {
  const parts = new FigureParts();
  parts.add(sphere(0.092, 7, 5), { at: [0, -0.02, 0], slot: 0 });
  parts.add(tube(0.092, 0.08, 0.3, 7), { at: [0, -0.15, 0], slot: 0 });
  parts.add(cyl(0.09, 0.09, 0.05, 7), { at: [0, -0.28, 0], slot: 0, shade: 0.88 });
  parts.add(tube(0.072, 0.061, 0.28, 7), { at: [0, -0.43, 0], slot: 1 });
  parts.add(sphere(0.078, 6, 4), { at: [0, -0.6, 0.005], scale: [0.85, 1.12, 0.95], slot: 2 });
  if (weapons) {
    parts.add(cyl(0.024, 0.024, 0.56, 6), { at: [0, -0.86, 0.03], shade: '#1d1f22', part: PART.BATON });
    parts.add(box(0.05, 0.26, 0.085), { at: [0, -0.72, 0.03], shade: '#2b2f33', part: PART.PISTOL });
    parts.add(box(0.052, 0.2, 0.09), { at: [0, -0.7, 0.03], shade: '#e0b92e', part: PART.TASER });
    parts.add(box(0.054, 0.08, 0.092), { at: [0, -0.84, 0.03], shade: '#24272b', part: PART.TASER });
    parts.add(box(0.065, 0.66, 0.1), { at: [0, -0.88, 0.035], shade: '#24282c', part: PART.RIFLE });
    parts.add(box(0.05, 0.16, 0.12), { at: [0, -0.84, 0.1], shade: '#2f3337', part: PART.RIFLE });
  }
  return parts.build();
}

/** Umbrella in crowd model units: handle at the origin, shaft up +y, canopy on top (`length` is handle to tip). */
export const UMBRELLA = { length: 1.64, radius: 0.84, drop: 0.36 } as const;

/** An open umbrella: J handle, shaft, eight faceted canopy panels alternating palette slots 0 and 1, a darker underside. */
export function umbrellaGeometry(panels = 8) {
  const parts = new FigureParts();
  const top = UMBRELLA.length, r = UMBRELLA.radius, rim = top - UMBRELLA.drop;
  parts.add(cyl(0.034, 0.034, 0.22, 6), { at: [0, -0.01, 0], shade: '#4a3324' });
  parts.add(new THREE.TorusGeometry(0.06, 0.026, 4, 8, Math.PI), { at: [-0.06, -0.12, 0], rot: [0, 0, Math.PI], shade: '#4a3324' });
  parts.add(cyl(0.017, 0.017, top + 0.1, 5), { at: [0, (top + 0.1) / 2, 0], shade: '#2c2c2e' });
  // Profile from the rim up to the tip (outer surface), and the same points reversed for the underside.
  const outside = [new THREE.Vector2(r, rim), new THREE.Vector2(r * 0.7, rim + 0.21), new THREE.Vector2(r * 0.36, top - 0.05), new THREE.Vector2(0.001, top)];
  const inside = [...outside].reverse().map((p) => new THREE.Vector2(p.x, p.y - 0.015));
  const step = (Math.PI * 2) / panels;
  for (let k = 0; k < panels; k++) {
    parts.add(new THREE.LatheGeometry(outside, 1, k * step, step), { slot: k % 2 });
    parts.add(new THREE.LatheGeometry(inside, 1, k * step, step), { slot: k % 2, shade: 0.6 });
    parts.add(sphere(0.028, 4, 3), { at: [Math.sin(k * step) * r, rim - 0.01, Math.cos(k * step) * r], shade: '#2c2c2e' });
  }
  parts.add(cyl(0.024, 0.012, 0.14, 5), { at: [0, top + 0.06, 0], shade: '#2c2c2e' });
  return parts.build();
}

/**
 * Where a traffic rider sits on the scooter model, in moto-local metres (the model is real-world size:
 * seat top 0.82 m, floorboard 0.65 m, handlebar 1.12 m high at z 0.52, grips about 0.36 m out).
 */
export type RiderPose = {
  scale: number; hipY: number; hipZ: number; lean: number;
  grip: number[]; foot: number[];
  /** Which way knees and elbows bend (x is mirrored per side). */
  knee: number[]; elbow: number[];
};
export const RIDER: RiderPose = {
  scale: 0.82, hipY: 0.9, hipZ: -0.22, lean: 0.34,
  grip: [0.36, 1.13, 0.5],
  foot: [0.2, 0.655, 0.2],
  knee: [0.9, 0.55, 0.25],
  elbow: [0.9, -0.45, -0.2],
};
/** The same rider on a manual bike: feet on the footpegs beside the engine instead of a floorboard. */
export const PEG_RIDER: RiderPose = { ...RIDER, foot: [0.2, 0.37, -0.03], knee: [0.9, 0.35, 0.6] };
/**
 * A car driver relative to their hip (the seat position is added by the caller): leaning back a little,
 * hands on the wheel, feet on the pedals. Smaller, so the stylised head clears a sedan roof.
 */
export const CAR_DRIVER: RiderPose = {
  scale: 0.62, hipY: 0, hipZ: 0, lean: -0.12,
  grip: [0.17, 0.4, 0.3],
  foot: [0.14, -0.36, 0.26],
  knee: [0.3, 0.7, 0.6],
  elbow: [0.9, -0.45, -0.2],
};

/** Two-bone joint (elbow or knee) between `a` and `b` for segment lengths l1, l2, bent toward `hint`. */
function joint(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a);
  const dist = d.length();
  d.divideScalar(dist);
  if (dist >= l1 + l2) return a.clone().addScaledVector(d, dist * l1 / (l1 + l2));
  const p = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - p * p));
  const n = hint.clone().addScaledVector(d, -hint.dot(d)).normalize();
  return a.clone().addScaledVector(d, p).addScaledVector(n, h);
}

/** Points `parts.base` along a limb segment: model y = `from` lands on `a` and y = `from - length` on `b` (limbs hang along -y). */
function alongSegment(parts: FigureParts, a: THREE.Vector3, b: THREE.Vector3, scale: number, from: number, length: number) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.divideScalar(len));
  parts.base.compose(a, q, new THREE.Vector3(scale, len / length, scale)).multiply(new THREE.Matrix4().makeTranslation(0, -from, 0));
}

/**
 * A seated motorbike rider in one piece, posed on the traffic scooter: torso leaning toward the bars,
 * head up looking down the road under a half helmet, elbows bent to the grips, knees up and feet on the
 * floorboard. Built in moto-local metres so the scooter's own instance matrix (with its lean) places it.
 * Palette: shirt, pants, skin, hair (brows), helmet; parts SLEEVE, MASK, MASK_DARK and HELMET.
 */
export function riderGeometry(pose: RiderPose = RIDER, head: 'rider' | 'all' = 'rider') {
  const parts = new FigureParts();
  const { SHIRT, PANTS, SKIN } = SLOT;
  const S = pose.scale;
  const xAxis = new THREE.Vector3(1, 0, 0);
  const body = new THREE.Matrix4()
    .compose(new THREE.Vector3(0, pose.hipY, pose.hipZ), new THREE.Quaternion().setFromAxisAngle(xAxis, pose.lean), new THREE.Vector3(S, S, S))
    .multiply(new THREE.Matrix4().makeTranslation(0, -FIGURE.hipY, 0));
  parts.base.copy(body);
  addTorso(parts, false);
  // The head tips back up so the rider looks down the road rather than at the handlebar.
  parts.base.copy(body).multiply(new THREE.Matrix4().compose(
    new THREE.Vector3(0, FIGURE.headY, 0.015), new THREE.Quaternion().setFromAxisAngle(xAxis, -pose.lean * 0.85), new THREE.Vector3(FIGURE.headR, FIGURE.headR, FIGURE.headR)));
  addHead(parts, head);
  for (const side of [-1, 1]) {
    // Arm: shoulder to grip, elbow bent outward and down.
    const shoulder = new THREE.Vector3(side * FIGURE.shoulderX, FIGURE.shoulderY, 0).applyMatrix4(body);
    const grip = new THREE.Vector3(side * pose.grip[0], pose.grip[1], pose.grip[2]);
    const elbow = joint(shoulder, grip, 0.29 * S * 1.08, 0.31 * S * 1.08, new THREE.Vector3(side * pose.elbow[0], pose.elbow[1], pose.elbow[2]));
    alongSegment(parts, shoulder, elbow, S, 0, 0.29);
    parts.add(sphere(0.092, 7, 5), { at: [0, -0.02, 0], slot: SHIRT });
    parts.add(tube(0.092, 0.08, 0.3, 7), { at: [0, -0.15, 0], slot: SHIRT });
    parts.add(cyl(0.09, 0.09, 0.05, 7), { at: [0, -0.28, 0], slot: SHIRT, shade: 0.88 });
    alongSegment(parts, elbow, grip, S, -0.29, 0.31);
    parts.add(sphere(0.07, 6, 4), { at: [0, -0.29, 0], slot: SKIN });
    parts.add(sphere(0.083, 6, 4), { at: [0, -0.29, 0], slot: SHIRT, part: PART.SLEEVE });
    parts.add(tube(0.072, 0.061, 0.29, 7), { at: [0, -0.435, 0], slot: SKIN });
    parts.add(tube(0.082, 0.07, 0.27, 7), { at: [0, -0.425, 0], slot: SHIRT, part: PART.SLEEVE });
    parts.add(sphere(0.078, 6, 4), { at: [0, -0.6, 0.005], scale: [0.85, 1.12, 0.95], slot: SKIN });
    // Leg: hip to ankle with the knee up and out, the foot flat on the floorboard.
    const hip = new THREE.Vector3(side * FIGURE.hipX, FIGURE.hipY, 0).applyMatrix4(body);
    const ankle = new THREE.Vector3(side * pose.foot[0], pose.foot[1] + 0.098 * S, pose.foot[2] - 0.05 * S);
    const knee = joint(hip, ankle, 0.345 * S, 0.315 * S, new THREE.Vector3(side * pose.knee[0], pose.knee[1], pose.knee[2]));
    alongSegment(parts, hip, knee, S, 0, 0.345);
    parts.add(sphere(0.118, 7, 5), { at: [0, -0.02, 0], slot: PANTS });
    parts.add(tube(0.116, 0.104, 0.36, 8), { at: [0, -0.18, 0], slot: PANTS });
    alongSegment(parts, knee, ankle, S, -0.345, 0.315);
    parts.add(sphere(0.106, 6, 4), { at: [0, -0.345, 0], slot: PANTS });
    parts.add(tube(0.098, 0.082, 0.33, 8), { at: [0, -0.495, 0], slot: PANTS });
    parts.base.compose(ankle, new THREE.Quaternion(), new THREE.Vector3(S, S, S));
    parts.add(box(0.15, 0.1, 0.25), { at: [0, -0.048, 0.05], shade: '#2b2622' });
    parts.add(sphere(0.075, 6, 3), { at: [0, -0.053, 0.175], scale: [1, 0.7, 1.1], shade: '#2b2622' });
    parts.add(box(0.16, 0.03, 0.29), { at: [0, -0.086, 0.07], shade: '#1b1816' });
  }
  return parts.build();
}

/** Ragdoll torso: the crowd torso re-centred between hip and shoulder joints, which sit at y = ±0.5. */
export function ragdollTorsoGeometry() {
  const parts = new FigureParts();
  const span = FIGURE.shoulderY - FIGURE.hipY, mid = (FIGURE.shoulderY + FIGURE.hipY) / 2;
  parts.base.compose(position.set(0, -mid / span, 0), quaternion.identity(), scaling.set(1, 1 / span, 1));
  addTorso(parts, true);
  return parts.build();
}

/** Ragdoll limb segment along +y from -0.5 to 0.5, radius 0.5; slot 1 colours the far end (hand or shoe). */
export function ragdollLimbGeometry() {
  const parts = new FigureParts();
  parts.add(cyl(0.44, 0.5, 0.82, 7), { at: [0, -0.09, 0], slot: 0 });
  parts.add(cyl(0.4, 0.46, 0.2, 7), { at: [0, 0.4, 0], slot: 1 });
  return parts.build();
}

export function ragdollHeadGeometry() {
  return addHead(new FigureParts(), 'all').build();
}

/** Shared look for every figure mesh: vertex colours pick a slot from the instance palette; parts are masked. */
export function figureMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 tag;\nattribute vec3 c0;\nattribute vec3 c1;\nattribute vec3 c2;\nattribute vec3 c3;\nattribute vec4 c4;')
      .replace('#include <color_vertex>', 'vColor = color * ( tag.x < 0.5 ? c0 : tag.x < 1.5 ? c1 : tag.x < 2.5 ? c2 : tag.x < 3.5 ? c3 : tag.x < 4.5 ? c4.rgb : vec3( 1.0 ) );')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tint figurePart = int( tag.y + 0.5 );\n\tif ( figurePart > 0 && ( ( int( c4.a + 0.5 ) >> ( figurePart - 1 ) ) & 1 ) == 0 ) transformed = vec3( 0.0 );');
  };
  material.customProgramCacheKey = () => 'figure-palette';
  return material;
}

/** An instanced figure part with per-instance palettes; `push` packs visible instances so hidden ones cost nothing. */
export class FigureBatch {
  readonly mesh: THREE.InstancedMesh;
  private readonly slots: THREE.InstancedBufferAttribute[];
  private n = 0;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number) {
    this.slots = [0, 1, 2, 3, 4].map((k) => {
      const size = k === 4 ? 4 : 3;
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size).fill(1), size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(`c${k}`, attribute);
      return attribute;
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin() { this.n = 0; }

  /** Writes one instance at `index`; `look` is a packed palette from `palette()`. */
  set(index: number, transform: THREE.Matrix4, look: Float32Array) {
    this.mesh.setMatrixAt(index, transform);
    const s = this.slots;
    for (let k = 0; k < 4; k++) (s[k].array as Float32Array).set(look.subarray(k * 3, k * 3 + 3), index * 3);
    (s[4].array as Float32Array).set(look.subarray(12, 16), index * 4);
  }

  push(transform: THREE.Matrix4, look: Float32Array) {
    if (this.n < this.capacity) this.set(this.n++, transform, look);
  }

  /** Finishes a frame; `count` overrides the packed count when slots are fixed. */
  end(count = this.n) {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const attribute of this.slots) attribute.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
