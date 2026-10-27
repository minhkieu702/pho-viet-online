import * as THREE from 'three';
import {
  ARM_SLOT, FigureParts, HEAD, LEG, LEG_SLOT, SLOT, TORSO, ball, figureGeometry, loft, partIndex, registerFigureVariant, sheet, sweep, torsoPoint,
  type Detail, type FigurePiece, type Rig,
} from './anatomy.ts';
import { FIGURE, FINGERS, JOINT, THUMB, applyRig } from './pose.ts';
import { deriveStyle, packColor, palettesOf, setStyle, zombify, type FigureLook, type FigurePalettes, type FigureStyle, type WardrobeRole } from './wardrobe.ts';
import type { MutantKind, ZombieKind } from '../../lib/zombie-protocol.ts';
import type { HorrorFx } from './horror-fx.ts';

/**
 * How the undead look: the zombie variant of the shared figure geometry (a grotesque face, exposed ribs, a hunched
 * spine, bloated bellies, tatters, sores, arm stumps, claws, bones, rags and clawed feet on the free mask bits, and
 * mottled, veined skin), the per-kind silhouettes (limb lengths, thicknesses and dropped shoulders through instance
 * matrices), deterministic dresses per kind, the giant mutants' looks (growths and glowing weak spots) and the
 * twitchy, stop-motion animation layer. Only zombie, mutant and zombie-corpse batches use the variant: the human
 * builds (residents, police, players) are untouched. Horror, not gore: bones and dark cavities, no red meat.
 */

/**
 * Zombie body parts on mask word B. SORES sits on TORSO.KIT's bit (13), whose police-kit parts the variant never
 * builds, not on bit 23: the figure shader reads a mask as int(word + 0.5), and in float32 an odd value at or above
 * 2^23 plus 0.5 rounds to the next even number, so word B (always odd: TORSO.HEAD is bit 0) must stay below 2^23
 * (with bit 23 every sore-covered zombie lost its head). For the same reason a dress's word A is kept even (HEAD.EARS
 * is bit 23, so HEAD.SHORT, bit 0, would turn into another hair style): see evenMasks().
 */
export const ZT = { RIBS: 1 << 19, HUNCH: 1 << 20, BLOAT: 1 << 21, TATTERS: 1 << 22, SORES: 1 << 13, /** a torn cheek, molars showing (TIE's bit) */ GASH: 1 << 16, /** a scalp torn off the skull (GANH's bit) */ SCALP: 1 << 17 } as const;
/** Zombie parts on bits of human parts the variant never builds (it skips those, never these). */
const OWN_B = ZT.SORES | ZT.GASH | ZT.SCALP;
/**
 * Every zombie bit of word B: clear them (and HEAD.BLINK, the missing jaw) before drawing a zombie dress on the HUMAN
 * geometry, where bits 13, 16 and 17 are the police kit, the tie and the gánh.
 */
export const ZT_ALL = ZT.RIBS | ZT.HUNCH | ZT.BLOAT | ZT.TATTERS | ZT.SORES | ZT.GASH | ZT.SCALP;
export const ZA = { FOREARM: 1 << 14, STUMP: 1 << 15, CLAWS: 1 << 16, BONE: 1 << 17, RAGS: 1 << 18 } as const;
export const ZL = { BONE: 1 << 7, RAGS: 1 << 8, CLAWFOOT: 1 << 9 } as const;

type V3 = [number, number, number];
const BONE = '#d8cfb4', CAVITY = '#2a1a18', TEETH = '#cfc7a8', SOCKET = '#150e0d', THROAT = '#120807', NAIL = '#2a221c', STRAND = '#4a2a24';
const R = FIGURE.headR, HY = FIGURE.headY, UA = FIGURE.upperArm, TH = FIGURE.thigh, W = JOINT.wrist, ANKLE = JOINT.ankle, SOLE = -FIGURE.sole;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const hp = (x: number, y: number, z: number): V3 => [x * R, HY + y * R, z * R];
const hs = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];
// Rigs as anatomy.ts builds them (head and chest weights; elbow and wrist; knee and ankle; toes).
const HEAD_RIG: Rig = [1, 1, 0, 0];
const bodyRig = (p: THREE.Vector3): Rig => [smooth(FIGURE.neckY - 0.02, FIGURE.headPivotY + 0.02, p.y), smooth(1.12, 1.4, p.y), 0, 0];
const armRig = (side: 1 | -1) => (p: THREE.Vector3): Rig => [smooth(-UA + 0.05, -UA - 0.05, p.y), smooth(W + 0.02, W - 0.025, p.y), side, 0];
const legRig = (p: THREE.Vector3): Rig => [smooth(-TH + 0.05, -TH - 0.05, p.y), smooth(ANKLE + 0.045, ANKLE - 0.02, p.y), 0, 0];
const footRig = (p: THREE.Vector3): Rig => [1, 1, smooth(FIGURE.ball - 0.02, FIGURE.ball + 0.02, p.z), 0];

function geo(pos: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** The outer of the two torso builds at (y, angle), so one piece sits on both (no doubled parts). */
function outer(y: number, a: number, lift: number): V3 {
  const m = torsoPoint(false, y, a, lift), f = torsoPoint(true, y, a, lift);
  return m[0] * m[0] + m[2] * m[2] >= f[0] * f[0] + f[2] * f[2] ? m : f;
}
/** A single-sided patch on the torso (rows over y, columns over angle), facing away from the body axis. */
function torsoPatch(y0: number, y1: number, a0: number, a1: number, lift: number, rows: number, cols: number) {
  const pos: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) pos.push(...outer(lerp(y0, y1, r / rows), lerp(a0, a1, c / cols), lift));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
    for (const [i, j, k] of [[a, b, e], [a, e, d]]) {
      const P = (n: number) => new THREE.Vector3(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
      const n = new THREE.Vector3().crossVectors(P(j).sub(P(i)), P(k).sub(P(i))), mid = P(i).add(P(j)).add(P(k));
      if (n.x * mid.x + n.z * mid.z < 0) idx.push(i, k, j); else idx.push(i, j, k);
    }
  }
  return geo(pos, idx);
}
/** A hanging strip of cloth: top edge from a to b, falling `len` and out by `out` (x, z) at its foot. */
function strip(a: V3, b: V3, len: number, out: [number, number]) {
  const foot = (p: V3): V3 => [p[0] + out[0], p[1] - len, p[2] + out[1]];
  const fa = foot(a), fb = foot(b), nx = out[0] || a[0] + b[0], nz = out[1] || a[2] + b[2], l = Math.hypot(nx, nz) || 1;
  // The tip narrows to a ragged point.
  const mid: V3 = [(fa[0] + fb[0]) / 2, fa[1] - len * 0.25, (fa[2] + fb[2]) / 2];
  return sheet([[a, b], [lerp3(fa, mid, 0.4), lerp3(fb, mid, 0.4)]], 0.004, [nx / l, 0, nz / l]);
}
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** A small bicone along -y from `top` to `-len` (claws, toes, bone tips). */
const spike = (rx: number, rz: number, len: number, seg = 3) => loft([{ y: 0, rx, rz }], seg, rx * 0.8, -len).g;
const eulerOf = (dir: THREE.Vector3): V3 => {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize()));
  return [e.x, e.y, e.z];
};

// ---- The zombie face (replaces the human eyes, brows, lips, lids and mouth) ----------------------------------

/** Eye centres in head units [x, y, z, size]: the person's left eye (+x) sits lower and bulges, the right is small. */
const EYES: readonly (readonly [number, number, number, number])[] = [[0.34, -0.03, 0.9, 1.15], [-0.33, 0.05, 0.9, 0.88]];
/**
 * Eye glint positions relative to the head pivot (0, FIGURE.headPivotY, 0), FIGURE units, before the head's
 * pitch and yaw: [left (+x), right]. eyeWorld() places them on a posed figure.
 */
export const EYE_SOCKETS: readonly (readonly [number, number, number])[] = EYES.map(([x, y, z]) => [x * R, HY + y * R - FIGURE.headPivotY, (z + 0.06) * R] as const);

function zombieFace(parts: FigureParts, detail: Detail) {
  const lo = detail === 'lo';
  const head = { part: TORSO.HEAD, wordB: true, rig: HEAD_RIG } as const;
  const tied = (bit: number) => ({ part: bit, also: TORSO.HEAD, alsoB: true, rig: HEAD_RIG }) as const;
  for (const [x, y, z, k] of EYES) {
    // A sunken dark socket, and in it a small bright eyeball (the eye colour: accent2).
    parts.add(ball(lo ? 5 : 7, lo ? 3 : 4), { at: hp(x, y - 0.01, z - 0.06), scale: hs(0.2 * k, 0.15 * k, 0.09), slot: SLOT.FIXED, shade: SOCKET, ...head });
    parts.add(ball(lo ? 5 : 6, lo ? 3 : 4), { at: hp(x, y, z), scale: hs(0.085 * k, 0.075 * k, 0.05), slot: SLOT.ACCENT2, shade: 1.35, gloss: 1, ...tied(HEAD.EYES) });
  }
  // A heavy, uneven brow ridge.
  parts.add(sweep([[-0.62, 0.15, 0.82], [-0.32, 0.25, 0.97], [0, 0.17, 1.0], [0.3, 0.2, 0.98], [0.62, 0.1, 0.83]], () => [0.06, 0.045], lo ? 3 : 4),
    { at: [0, HY, 0], scale: R, slot: SLOT.SKIN, shade: 0.8, ...head });
  // Lips pulled back from the teeth into a grimace; the upper teeth always show.
  const teeth = (y: number, z: number, w: number) => {
    const n = lo ? 4 : 7;
    return sweep(Array.from({ length: n }, (_, k) => { const t = (k / (n - 1)) * 2 - 1; return [t * w, y + (lo ? 0 : (k % 2 ? 0.02 : -0.02)), z - 0.14 * t * t] as V3; }), () => [0.02, 0.05], 3);
  };
  parts.add(ball(lo ? 5 : 7, 3), { at: hp(0, -0.5, 0.86), scale: hs(0.22, 0.045, 0.06), slot: SLOT.FIXED, shade: '#2a1414', ...head });
  parts.add(teeth(-0.47, 0.935, 0.15), { at: [0, HY, 0], scale: R, slot: SLOT.FIXED, shade: TEETH, ...head });
  // MOUTH: the jaw hangs open over a dark throat, the lower teeth below.
  parts.add(ball(lo ? 6 : 8, lo ? 3 : 4), { at: hp(0, -0.66, 0.84), scale: hs(0.22, 0.17, 0.085), slot: SLOT.FIXED, shade: THROAT, ...tied(HEAD.MOUTH) });
  parts.add(teeth(-0.79, 0.9, 0.13), { at: [0, HY, 0], scale: R, slot: SLOT.FIXED, shade: TEETH, ...tied(HEAD.MOUTH) });
  // BLINK (in this variant): the lower jaw is gone, a dark hollow under the upper teeth with strands hanging.
  parts.add(ball(lo ? 6 : 8, lo ? 4 : 5), { at: hp(0, -0.76, 0.7), scale: hs(0.36, 0.36, 0.26), slot: SLOT.FIXED, shade: '#1a0d0b', ...tied(HEAD.BLINK) });
  for (const side of [-1, 1]) {
    parts.add(sweep([[side * 0.17, -0.55, 0.9], [side * 0.2, -0.85, 0.93], [side * 0.15, -1.2, 0.84]], (i) => [0.026 - 0.008 * i, 0.02], 3),
      { at: [0, HY, 0], scale: R, slot: SLOT.FIXED, shade: STRAND, ...tied(HEAD.BLINK) });
  }
  ownPass = true;
  const own = (bit: number) => ({ part: bit, wordB: true, also: TORSO.HEAD, alsoB: true, rig: HEAD_RIG }) as const;
  // GASH: the right cheek torn open to the molars.
  parts.add(ball(lo ? 5 : 7, lo ? 3 : 4), { at: hp(-0.5, -0.42, 0.68), scale: hs(0.22, 0.17, 0.16), rot: [0, -0.5, 0.3], slot: SLOT.FIXED, shade: '#1c0f0d', ...own(ZT.GASH) });
  parts.add(sweep([[-0.36, -0.48, 0.86], [-0.5, -0.47, 0.8], [-0.64, -0.43, 0.66]], () => [0.018, 0.045], 3), { at: [0, HY, 0], scale: R, slot: SLOT.FIXED, shade: TEETH, ...own(ZT.GASH) });
  // SCALP: skin and hair torn off the crown, the skull showing through with a dark crack.
  parts.add(ball(lo ? 6 : 8, 3, (v) => { v.y = Math.max(v.y, -0.2); }), { at: hp(0.22, 0.9, -0.12), scale: hs(0.42, 0.22, 0.4), rot: [-0.3, 0, -0.35], slot: SLOT.FIXED, shade: '#cdbf9c', ...own(ZT.SCALP) });
  parts.add(sweep([[0.05, 1.06, 0.1], [0.2, 1.08, -0.08], [0.32, 1.02, -0.28]], () => [0.012, 0.012], 3), { at: [0, HY, 0], scale: R, slot: SLOT.FIXED, shade: '#3a2a22', ...own(ZT.SCALP) });
  ownPass = false;
}

// ---- Body, arm and leg deformities ----------------------------------------------------------------------

/** True while the variant adds its own parts on bits of skipped human parts (ZT.SORES, GASH, SCALP). */
let ownPass = false;
function zombieBody(parts: FigureParts, detail: Detail) {
  const lo = detail === 'lo';
  const B = (bit: number) => ({ part: bit, wordB: true, rig: bodyRig }) as const;
  // Exposed ribs: a torn hole in the shirt over the left flank (+x), curved bones over a dark cavity.
  parts.add(torsoPatch(1.33, 1.57, 0.3, 1.05, 0.006, lo ? 2 : 3, lo ? 2 : 4), { slot: SLOT.FIXED, shade: CAVITY, ...B(ZT.RIBS) });
  const ribs = lo ? 4 : 5;
  for (let k = 0; k < ribs; k++) {
    const y = 1.365 + k * (0.17 / (ribs - 1)), n = lo ? 3 : 4;
    const path = Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return outer(y - 0.02 * t * t, lerp(0.34, 1.0, t), 0.012 + 0.008 * Math.sin(Math.PI * t)); });
    parts.add(sweep(path, () => [0.0085, 0.0075], 3), { slot: SLOT.FIXED, shade: BONE, ...B(ZT.RIBS) });
  }
  // A hunched spine: knotted vertebrae through the back of the shirt and a tumour on the left shoulder.
  const purple = new THREE.Color(0.82, 0.72, 0.86);
  const verts = lo ? 4 : 6;
  for (let k = 0; k < verts; k++) {
    const y = lerp(1.3, 1.7, k / (verts - 1));
    parts.add(ball(lo ? 4 : 5, 3), { at: outer(y, Math.PI, -0.006), scale: [0.032, 0.03, 0.036], slot: SLOT.SKIN, shade: purple, ...B(ZT.HUNCH) });
  }
  const lump = outer(1.62, 0.95, 0.0);
  parts.add(ball(lo ? 5 : 7, lo ? 3 : 4), { at: [lump[0], lump[1] + 0.04, lump[2] - 0.02], scale: [0.075, 0.065, 0.07], slot: SLOT.SKIN, shade: purple, ...B(ZT.HUNCH) });
  // A bloated belly: the shirt stretched over its top, bare skin with stretch marks below.
  {
    const g = ball(lo ? 8 : 10, lo ? 5 : 6);
    const p = g.getAttribute('position');
    const slots: number[] = [], shades: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i);
      const skin = y < 0.2;
      slots.push(skin ? SLOT.SKIN : SLOT.SHIRT);
      shades.push(skin ? (Math.abs(Math.sin(y * 13 + x * 4)) < 0.3 ? 0.74 : 0.96) : 0.92);
    }
    parts.add(g, { at: [0, 1.27, 0.035], scale: [0.205, 0.165, 0.16], ...B(ZT.BLOAT) }, slots, shades);
  }
  // Tatters: torn strips hanging from the hem, and ripped flaps at the shoulders.
  const strips = lo ? 4 : 7;
  for (let k = 0; k < strips; k++) {
    const a = (k / strips) * Math.PI * 2 + 0.4 * Math.sin(k * 2.3), w = 0.07;
    const p = outer(1.17, a, 0.01), q = outer(1.17, a + w / 0.17, 0.01);
    parts.add(strip(p, q, 0.12 + 0.09 * ((k * 7) % 3) / 2, [Math.sin(a) * 0.025, Math.cos(a) * 0.025]), { slot: SLOT.SHIRT, shade: 0.82, ...B(ZT.TATTERS) });
  }
  if (!lo) for (const side of [-1, 1]) {
    const p = outer(1.66, side * 1.35, 0.012), q = outer(1.62, side * 1.75, 0.012);
    parts.add(strip(p, q, 0.11, [side * 0.03, 0]), { slot: SLOT.SHIRT, shade: 0.8, ...B(ZT.TATTERS) });
  }
  // Sores: raised boils on the neck, shoulders, chest and cheeks.
  const sore = new THREE.Color(0.78, 0.52, 0.46);
  // On the skin only (the neck and the face), never on clothes.
  const spots: [V3, boolean][] = [
    [outer(1.755, 0.7, 0.004), false], [outer(1.77, -1.6, 0.004), false], [hp(0.55, -0.32, 0.74), true], [hp(-0.6, -0.15, 0.7), true],
    [hp(0.25, 0.55, 0.88), true], [hp(0.05, -0.85, 0.66), true],
  ];
  if (!lo) spots.push([outer(1.745, 2.6, 0.004), false], [outer(1.79, -0.4, 0.004), false], [hp(-0.3, 0.68, 0.8), true], [hp(0.7, 0.05, 0.6), true], [hp(-0.42, -0.66, 0.62), true]);
  ownPass = true;
  spots.forEach(([at, onHead], k) => {
    const s = 0.017 + 0.009 * ((k * 5) % 3) / 2;
    parts.add(ball(lo ? 4 : 5, lo ? 2 : 3), { at, scale: [s, s * 0.8, s], slot: SLOT.SKIN, shade: sore, part: ZT.SORES, wordB: true, rig: onHead ? HEAD_RIG : bodyRig });
  });
  ownPass = false;
}

/** Arm extras in the unmirrored arm space (armGeometry mirrors right arms through `parts.base`). */
function zombieArm(parts: FigureParts, side: 1 | -1, detail: Detail) {
  const lo = detail === 'lo';
  const rig = armRig(side), upper: Rig = [0, 0, side, 0];
  // Stump: what is left of an arm torn off at the elbow (the forearm, tagged ZA.FOREARM, is hidden with it).
  parts.add(spike(0.022, 0.024, 0.07, lo ? 4 : 5), { at: [0.002, -UA + 0.035, 0], slot: SLOT.FIXED, shade: BONE, part: ZA.STUMP, rig: upper });
  parts.add(ball(lo ? 5 : 6, 3), { at: [0, -UA + 0.03, 0.002], scale: [0.047, 0.012, 0.05], slot: SLOT.FIXED, shade: CAVITY, part: ZA.STUMP, rig: upper });
  {
    const n = lo ? 6 : 8, pos: number[] = [], idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      pos.push(s * 0.052, -UA + 0.075, c * 0.057, s * 0.056, -UA + (k % 2 ? 0.0 : 0.04), c * 0.061);
    }
    for (let k = 0; k < n; k++) { const a = k * 2, b = ((k + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = geo(pos, idx);
    // Facing outward: the first triangle's normal against the radial direction.
    const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const nrm = new THREE.Vector3().crossVectors(P(1).sub(P(0)), P(2).sub(P(0)));
    if (nrm.dot(new THREE.Vector3(pos[0], 0, pos[2])) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    parts.add(g, { slot: ARM_SLOT.UPPER, shade: 0.82, part: ZA.STUMP, rig: upper });
  }
  // Claws: long dark nails curling toward the palm (-x), bending with each finger's last joint.
  const claw = (x: number, y: number, z: number, dir: THREE.Vector3, len: number, r: Rig) =>
    parts.add(spike(0.0068, 0.0058, len), { at: [x, y, z], rot: eulerOf(dir), slot: SLOT.FIXED, shade: NAIL, gloss: 0.6, part: ZA.CLAWS, rig: r });
  const curl = new THREE.Vector3(-0.38, -1, 0);
  if (lo) {
    const [z0, m0, l0, r0] = FINGERS[0];
    claw(-0.004, m0 + W - l0 + r0 * 0.6, z0, curl, 0.04, [1, 1, side * 3, 3]);
    const [, m1, l1] = FINGERS[1];
    for (const z of [0.004, -0.026]) claw(-0.004, m1 + W - l1 + 0.012, z, curl, 0.04, [1, 1, side * 4, 3]);
  } else FINGERS.forEach(([z, m, l, r], fi) => claw(-0.004, m + W - l + r * 0.6, z, curl, 0.042 - fi * 0.003, [1, 1, side * (fi + 3), 3]));
  {
    const L = THUMB.seg[0] + THUMB.seg[1] + THUMB.seg[2], d = new THREE.Vector3(...THUMB.dir);
    const tip = new THREE.Vector3(THUMB.base[0], THUMB.base[1] + W, THUMB.base[2]).addScaledVector(d, L - 0.006);
    claw(tip.x, tip.y, tip.z, d.clone().add(new THREE.Vector3(-0.3, 0, 0)), 0.035, [1, 1, side * 2, 3]);
  }
  // A bone strip along the ulna, through torn skin.
  parts.add(sweep([[0.044, -UA - 0.03, -0.024], [0.04, -UA - 0.15, -0.028], [0.029, W + 0.035, -0.021]], () => [0.009, 0.0075], 3, { caps: true }),
    { slot: SLOT.FIXED, shade: BONE, part: ZA.BONE, rig });
  // Rags: torn sleeve strips hanging toward the elbow.
  const rags = lo ? 2 : 3;
  for (let k = 0; k < rags; k++) {
    const a = 0.6 + k * 2.1, da = 0.75;
    const p: V3 = [Math.sin(a) * 0.055, -0.12, Math.cos(a) * 0.059], q: V3 = [Math.sin(a + da) * 0.055, -0.12, Math.cos(a + da) * 0.059];
    parts.add(strip(p, q, 0.1 + 0.04 * k, [Math.sin(a + da / 2) * 0.012, Math.cos(a + da / 2) * 0.012]), { slot: ARM_SLOT.UPPER, shade: 0.85, part: ZA.RAGS, rig });
  }
}

function zombieLeg(parts: FigureParts) {
  // A shin bone showing through the skin.
  parts.add(sweep([[0.002, -TH - 0.06, 0.054], [0.005, -TH - 0.2, 0.052], [0.002, -TH - 0.36, 0.04]], () => [0.009, 0.008], 3, { caps: true }),
    { slot: SLOT.FIXED, shade: BONE, part: ZL.BONE, rig: legRig });
  // Trouser legs torn off at the knee into rags.
  for (const [a, da] of [[0.35, 0.9], [Math.PI - 0.2, 0.8]]) {
    const p: V3 = [Math.sin(a) * 0.06, -TH + 0.02, Math.cos(a) * 0.062], q: V3 = [Math.sin(a + da) * 0.06, -TH + 0.02, Math.cos(a + da) * 0.062];
    parts.add(strip(p, q, 0.13, [Math.sin(a + da / 2) * 0.01, Math.cos(a + da / 2) * 0.01]), { slot: LEG_SLOT.THIGH, shade: 0.85, part: ZL.RAGS, rig: legRig });
  }
  // Clawed feet: four long toes past the front of a bare foot.
  for (const x of [-0.032, -0.011, 0.011, 0.032]) {
    parts.add(spike(0.011, 0.008, 0.075 - Math.abs(x) * 0.6), { at: [x, SOLE + 0.024, 0.215], rot: eulerOf(new THREE.Vector3(x * 0.8, -0.28, 1)), slot: LEG_SLOT.SKIN, shade: 0.78, part: ZL.CLAWFOOT, rig: footRig });
  }
}

// ---- Finishing: forearm tags and mottled, veined skin ------------------------------------------------------

const FOREARM_INDEX = partIndex(ZA.FOREARM);
/** Multiplier for skin at a rest position: blotches 0.78..1, darker purple-blue vein lines. */
function mottle(x: number, y: number, z: number, out: [number, number, number]) {
  const blotch = 0.5 + 0.5 * Math.sin(x * 17.3 + Math.sin(y * 11.7) * 1.3) * Math.sin(y * 13.1 + z * 9.7) * Math.sin(z * 15.9 - x * 7.1 + 1.7);
  const vein = Math.abs(Math.sin(y * 41 + Math.sin(x * 23 + z * 7) * 2.1 + z * 17 + x * 11));
  const k = 0.78 + 0.22 * blotch;
  if (vein < 0.13) { out[0] = k * 0.8; out[1] = k * 0.74; out[2] = k * 0.95; } else { out[0] = out[1] = out[2] = k; }
  return out;
}
const SKIN_SLOTS: Record<FigurePiece, readonly number[]> = { body: [SLOT.SKIN], armL: [ARM_SLOT.LOWER, ARM_SLOT.HAND], armR: [ARM_SLOT.LOWER, ARM_SLOT.HAND], leg: [LEG_SLOT.SHIN, LEG_SLOT.SKIN] };

function zombieFinish(piece: FigurePiece, g: THREE.BufferGeometry) {
  const tag = g.getAttribute('tag') as THREE.BufferAttribute, rig = g.getAttribute('rig') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute, pos = g.getAttribute('position') as THREE.BufferAttribute;
  const skin = SKIN_SLOTS[piece], m: [number, number, number] = [1, 1, 1];
  for (let i = 0; i < tag.count; i++) {
    const slot = Math.round(tag.getX(i));
    if (piece === 'armL' || piece === 'armR') {
      // Every forearm and hand vertex (it bends with the elbow) vanishes when ZA.FOREARM is cleared: as its part,
      // or as the second bit of one that already has a part (cuffs, bangles, claws, bones).
      if (rig.getX(i) >= 0.5) {
        const t = Math.round(tag.getY(i)), part = t % 64, also = Math.floor(t / 64);
        if (part === 0) tag.setY(i, FOREARM_INDEX + 64 * also);
        else if (also === 0) tag.setY(i, part + 64 * FOREARM_INDEX);
      }
    }
    if (slot === SLOT.FIXED) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    mottle(x, y, z, m);
    if (skin.includes(slot)) { col.setXYZ(i, col.getX(i) * m[0], col.getY(i) * m[1], col.getZ(i) * m[2]); continue; }
    // Clothes: grime, and dark old stains (brown-black, never fresh red) soaked down from the collar and in blotches.
    const stain = Math.sin(x * 9.1 + z * 6.3 + 1.1) * Math.sin(y * 7.7 - x * 3.3) * Math.sin(z * 8.9 + y * 2.1 + 0.7);
    const soak = piece === 'body' ? smooth(1.45, 1.72, y) * (0.5 + 0.5 * Math.sin(x * 14 + z * 5)) : 0;
    const dark = Math.max(stain > 0.28 ? Math.min(1, (stain - 0.28) * 4) : 0, soak);
    col.setXYZ(i, col.getX(i) * lerp(lerp(1, m[0], 0.7), 0.42, dark), col.getY(i) * lerp(lerp(1, m[1], 0.7), 0.33, dark), col.getZ(i) * lerp(lerp(1, m[2], 0.7), 0.28, dark));
  }
  tag.needsUpdate = true;
  col.needsUpdate = true;
}

/** Body parts no zombie or mutant style ever shows: the variant's body build leaves them out (34% of its vertices). */
const SKIP_HEAD = HEAD.CAP | HEAD.BASEBALL | HEAD.BUCKET | HEAD.PITH | HEAD.BANDANA | HEAD.HOOD | HEAD.MASK | HEAD.GLASSES | HEAD.CONE;
const SKIP_TORSO = TORSO.AO_DAI | TORSO.KHAN_RAN | TORSO.RED_SCARF | TORSO.APRON | TORSO.BACKPACK | TORSO.KIT | TORSO.TIE | TORSO.GANH;
const SKIP_TORSO_PARTS = SKIP_TORSO & ~OWN_B;

registerFigureVariant('zombie', {
  face: zombieFace, body: zombieBody, arm: zombieArm, leg: zombieLeg, finish: zombieFinish,
  // The kit's, tie's and gánh's parts are skipped; the sores, gash and scalp reuse their bits and are not.
  skip: (bit, wordB) => ((wordB ? SKIP_TORSO : SKIP_HEAD) & bit) !== 0 && !(wordB && (bit & OWN_B) && ownPass),
});

/** The zombie variant of a figure piece (built once, cached with the human builds). */
export function zombieGeometry(piece: FigurePiece, detail: Detail) { return figureGeometry(piece, detail, 'zombie'); }

// ---- Per-kind silhouettes ----------------------------------------------------------------------------------

export type KindLook = {
  scale: number; width: number;
  /** Instance scale of each limb: [length, thickness]. */
  armL: [number, number]; armR: [number, number]; legL: [number, number]; legR: [number, number];
  /** Shoulder heights (FIGURE units, negative = dropped) and resting hunch/tilt. */
  shoulder: [number, number]; lean: number; tilt: number;
  /** Eye colour (accent2 slot) and glint strength 0..1 (night ×1.6). */
  eye: string; glow: number;
  /** Chance of each deformity part per dress ('BONE' and 'RAGS' are the arm's; the legs take half the chance). */
  parts: Partial<Record<keyof typeof ZT | keyof typeof ZA | keyof typeof ZL | 'JAWLESS' | 'GAPE', number>>;
};
const EYE = { yellow: '#d8d24a', red: '#d2422e', milky: '#d9dccf', white: '#f0efe0', green: '#9fd04a' } as const;
const look = (scale: number, width: number, armL: [number, number], armR: [number, number], legs: [number, number], shoulder: [number, number], lean: number, eye: string, glow: number, parts: KindLook['parts'], tilt = 0.06): KindLook =>
  ({ scale, width, armL, armR, legL: [...legs], legR: [...legs], shoulder, lean, tilt, eye, glow, parts });

/**
 * §6a.2's starting numbers, with the screamer's and stalker's limbs thickened just enough to keep length/thickness
 * within §9 A13's 0.7-1.5 (their bodies are 0.72 and 0.68 wide, so they still read as thin).
 */
export const KIND_LOOKS: Record<ZombieKind, KindLook> = {
  // The walker is the first thing a player meets: a deeper hunch, a dropped shoulder, one arm longer than the other,
  // and always one or two strong deformities (WALKER_STRONG) on top of these chances.
  walker: look(0.98, 1.05, [0.94, 1.0], [1.12, 1.0], [1, 1], [0.02, -0.09], 0.34, EYE.yellow, 0.6, { TATTERS: 0.7, SORES: 0.55, RIBS: 0.2, JAWLESS: 0.12, STUMP: 0.08, GASH: 0.3, SCALP: 0.15, RAGS: 0.3 }, 0.09),
  runner: look(0.98, 0.78, [1.25, 0.85], [1.25, 0.85], [1.08, 0.9], [0, 0], 0.38, EYE.red, 0.9, { RIBS: 0.6, CLAWS: 1, BONE: 0.3, CLAWFOOT: 0.5, GASH: 0.25, TATTERS: 0.4, SCALP: 0.15 }),
  brute: look(1.42, 1.6, [1.1, 1.3], [1.15, 1.35], [0.95, 1.3], [-0.04, 0], 0.2, EYE.yellow, 0.5, { BLOAT: 1, HUNCH: 0.7, SORES: 0.6, TATTERS: 0.8, GASH: 0.25, SCALP: 0.25 }, 0.04),
  crawler: look(0.95, 0.9, [1.2, 0.9], [1.2, 0.9], [1, 0.9], [0, 0], 1.35, EYE.yellow, 0.8, { CLAWS: 1, RIBS: 0.4, JAWLESS: 0.25, GASH: 0.35, SCALP: 0.25, TATTERS: 0.5 }),
  spitter: look(1.0, 1.15, [1, 1], [1, 1], [1, 1], [-0.06, 0], 0.35, EYE.green, 0.9, { HUNCH: 0.6, SORES: 0.8, GAPE: 1, GASH: 0.3, TATTERS: 0.4 }),
  bloater: look(1.12, 1.75, [0.85, 1.1], [0.85, 1.1], [0.9, 1.2], [0, 0], 0.1, EYE.yellow, 0.6, { BLOAT: 1, SORES: 1, TATTERS: 0.7, SCALP: 0.2 }, 0.03),
  riot: look(1.05, 1.15, [1, 1.05], [1, 1.05], [1, 1.05], [0, 0], 0.15, EYE.red, 0.5, { TATTERS: 0.3 }, 0.03),
  shipper: look(0.98, 1.0, [1.05, 1], [1, 1], [1, 1], [0, -0.03], 0.3, EYE.yellow, 0.7, { RAGS: 0.5, SORES: 0.4, GASH: 0.25, TATTERS: 0.3 }),
  screamer: look(1.05, 0.72, [1.3, 0.87], [1.3, 0.87], [1.1, 0.85], [0, 0], 0.15, EYE.white, 1.0, { RIBS: 0.5, GAPE: 1, CLAWS: 0.6 }),
  hunter: look(1.08, 0.85, [1.15, 0.9], [1.15, 0.9], [1.05, 0.95], [-0.03, 0], 0.45, EYE.milky, 0, { RIBS: 0.7, HUNCH: 0.5, CLAWS: 1, GASH: 0.35, SCALP: 0.5 }),
  stalker: look(1.42, 0.68, [1.45, 0.97], [1.45, 0.97], [1.25, 0.84], [0, 0], 0.05, EYE.white, 0.4, { CLAWS: 1, BONE: 0.5, CLAWFOOT: 1, JAWLESS: 0.35, GASH: 0.3 }, 0.1),
};

export type GrowthSite = 'spine' | 'shoulderL' | 'shoulderR' | 'armR' | 'fist' | 'belly' | 'head';
export type Growth = { at: GrowthSite; shape: number; size: number; count: number; color: string };
export type MutantLook = KindLook & { growths: Growth[]; weak: { at: string; r: number }[] };
/** Growth shapes (horror-fx growths mesh): 0 a lumpy tumour, 1 a bone spur, 2 a hanging hair clump. */
export const SHAPE = { LUMP: 0, SPUR: 1, HAIR: 2 } as const;

export const MUTANT_LOOKS: Record<MutantKind, MutantLook> = {
  // Đại Hộ Pháp: a hunched 6 m giant, its right arm a gigantic club wrapped in growths, the left withered.
  colossus: {
    ...look(2.9, 1.5, [0.8, 0.7], [1.6, 1.6], [1.0, 1.15], [-0.07, 0.05], 0.55, EYE.yellow, 1.0, { TATTERS: 1, SORES: 1, HUNCH: 1, RIBS: 0.5 }, 0.08),
    growths: [
      { at: 'spine', shape: SHAPE.SPUR, size: 0.11, count: 6, color: '#cbbf9e' },
      { at: 'shoulderR', shape: SHAPE.LUMP, size: 0.12, count: 3, color: '#7d6f7a' },
      { at: 'armR', shape: SHAPE.LUMP, size: 0.1, count: 8, color: '#6f6370' },
      { at: 'fist', shape: SHAPE.SPUR, size: 0.07, count: 4, color: '#d3c7a6' },
      { at: 'head', shape: SHAPE.LUMP, size: 0.07, count: 2, color: '#7a6b75' },
    ],
    weak: [{ at: 'backR', r: 0.42 }],
  },
  // Nhện Mái: spider-long limbs on all fours, a flat skull and a split jaw; climbs walls and drops from roofs.
  leaper: {
    ...look(2.0, 0.75, [1.25, 0.85], [1.25, 0.85], [1.2, 1.0], [0, 0], 1.25, EYE.red, 1.0, { RIBS: 1, CLAWS: 1, CLAWFOOT: 1, BONE: 0.5, GAPE: 1 }, 0),
    growths: [
      { at: 'spine', shape: SHAPE.SPUR, size: 0.08, count: 8, color: '#c9bd9a' },
      { at: 'head', shape: SHAPE.SPUR, size: 0.05, count: 3, color: '#c9bd9a' },
    ],
    weak: [{ at: 'spine', r: 0.32 }],
  },
  // Mẹ Bầy: swollen to bursting, three glowing sacs on the belly, short arms, long matted hair.
  matriarch: {
    ...look(2.5, 2.1, [0.8, 0.8], [0.8, 0.8], [0.85, 1.0], [0, 0], 0.15, EYE.green, 0.9, { BLOAT: 1, SORES: 1, TATTERS: 1, HUNCH: 1 }, 0.03),
    growths: [
      { at: 'head', shape: SHAPE.HAIR, size: 0.1, count: 10, color: '#1c1a17' },
      { at: 'belly', shape: SHAPE.LUMP, size: 0.06, count: 6, color: '#8e8a5a' },
      { at: 'shoulderL', shape: SHAPE.LUMP, size: 0.09, count: 2, color: '#6a7a68' },
      { at: 'shoulderR', shape: SHAPE.LUMP, size: 0.08, count: 2, color: '#6a7a68' },
    ],
    weak: [{ at: 'belly0', r: 0.3 }, { at: 'belly1', r: 0.3 }, { at: 'belly2', r: 0.3 }],
  },
};

/**
 * The most an elbow or knee may bend on a limb scaled [length, thickness] (§9 A13): the instance scale is applied
 * after the shader bends the joint, so a bent segment of a non-uniformly scaled limb is stretched by the thickness.
 */
export function bendLimit(ls: readonly [number, number]) { const k = ls[0] / ls[1]; return k < 0.85 || k > 1.2 ? 0.5 : Math.PI; }
/** True when a [length, thickness] scale is allowed at all (0.7..1.5). */
export const limbScaleOk = (ls: readonly [number, number]) => ls[0] / ls[1] >= 0.7 - 1e-9 && ls[0] / ls[1] <= 1.5 + 1e-9;
const limbS = new THREE.Matrix4();
/** Post-multiplies a limb's instance matrix by its [length, thickness] scale. */
export function scaleLimb(m: THREE.Matrix4, ls: readonly [number, number]) { return m.multiply(limbS.makeScale(ls[1], ls[0], ls[1])); }

// ---- Dresses -----------------------------------------------------------------------------------------------

export const DRESS_PER_KIND = 24;
/** The walker's strong deformities and their weights (sum 1): exposed ribs, a missing jaw, a torn-off forearm, a torn cheek, a torn scalp. */
export const WALKER_STRONG: readonly (readonly ['RIBS' | 'JAWLESS' | 'STUMP' | 'GASH' | 'SCALP', number])[] = [['RIBS', 0.24], ['JAWLESS', 0.16], ['STUMP', 0.14], ['GASH', 0.28], ['SCALP', 0.18]];
export type ZombieProp = 'shield' | 'box' | null;
export type ZombieDress = {
  kind: ZombieKind | MutantKind; look: FigureLook; style: FigureStyle; palettes: FigurePalettes; limbs: KindLook; seed: number;
  /** Eye colour, packed rgb. */
  eye: number;
  /** Glint strength 0..1 (night ×1.6 by the caller). */
  glow: number;
  /** The mouth hangs open for good (keep HEAD.MOUTH on). */
  gape: boolean;
  /** A rigid prop the kind carries (riot shield on the left forearm, a shipper's insulated box on the back) and its colour. */
  prop: ZombieProp; propColor: number;
};

function hash32(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
const hash01 = (seed: number, k: number) => {
  let h = Math.imul(seed ^ Math.imul(k + 0x9e37, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const ZSKINS = ['#9aa88a', '#8e9c80', '#a7ad92', '#8d8794', '#7f8f86', '#95a08a'];
const SHIRTS = ['#6f5a52', '#5f6d73', '#7a6a4c', '#4f5a4c', '#8a5a4f', '#5b5168', '#6d6a63', '#7d4a40', '#4d5f6a', '#8f8576', '#6b3a32', '#9a8f7a'];
const PANTS = ['#3a3f45', '#4a4238', '#2f3540', '#504a40', '#3d4a4a', '#5a4a3c'];
const ROLES: WardrobeRole[] = ['worker', 'student', 'vendor', 'retiree', 'owl'];
/** Generic delivery colours (no brand): green, orange, red. */
const DELIVERY = ['#2f8f4e', '#d9701e', '#b8322a'];
const RIOT = [['#2c3326', '#23281f'], ['#1f2633', '#1a1f29']];
const HAIRS = ['#141110', '#1d1916', '#221a16', '#3a3530'];
const ALL_HATS = HEAD.CAP | HEAD.SWAT | HEAD.HELMET | HEAD.HOOD | HEAD.BASEBALL | HEAD.BUCKET | HEAD.PITH | HEAD.BANDANA | HEAD.MASK | HEAD.CONE | HEAD.GLASSES;

/**
 * Masks the figure shader reads exactly (int(word + 0.5) in float32 needs word < 2^23 or even): word A swaps HEAD.SHORT
 * (bit 0) for the buzz cut when HEAD.EARS (bit 23) is on; word B must stay below 2^23.
 */
export function evenMasks(head: number, torso: number): [number, number] {
  if (head >= 1 << 23 && head & HEAD.SHORT) head = (head & ~HEAD.SHORT) | HEAD.BUZZ;
  if (torso >= 1 << 23) throw new Error('zombie dress: word B above bit 22');
  return [head, torso];
}
/** True when the shader reads this mask word exactly. */
export const maskExact = (word: number) => word < 1 << 23 || word % 2 === 0;

const grimeColor = new THREE.Color();
/** A colour darkened by k and pulled toward grey by `grey`. */
function grime(hex: string, k: number, grey: number) {
  grimeColor.set(hex);
  const l = (grimeColor.r + grimeColor.g + grimeColor.b) / 3;
  grimeColor.setRGB((grimeColor.r + (l - grimeColor.r) * grey) * k, (grimeColor.g + (l - grimeColor.g) * grey) * k, (grimeColor.b + (l - grimeColor.b) * grey) * k);
  return `#${grimeColor.getHexString()}`;
}

const dresses = new Map<string, ZombieDress>();
/** The dress of zombie `index` (0..255 on the wire, taken modulo DRESS_PER_KIND) of a kind: deterministic, cached. */
export function zombieDress(kind: ZombieKind, index: number): ZombieDress {
  const i = ((Math.floor(index) % DRESS_PER_KIND) + DRESS_PER_KIND) % DRESS_PER_KIND;
  const key = `${kind}:${i}`;
  const cached = dresses.get(key);
  if (cached) return cached;
  const seed = hash32(`zombie:${key}`);
  const r = (k: number) => hash01(seed, k);
  const pick = <T,>(list: readonly T[], k: number) => list[Math.floor(r(k) * list.length) % list.length];
  const L = KIND_LOOKS[kind];
  const look: FigureLook = { shirt: pick(SHIRTS, 1), pants: pick(PANTS, 2), skin: pick(ZSKINS, 3) };
  let role: WardrobeRole = ROLES[i % ROLES.length];
  let fem: boolean | undefined;
  if (kind === 'riot') { role = 'swat'; fem = false; }
  else if (kind === 'shipper') { role = 'rider'; }
  else if (kind === 'brute' || kind === 'hunter') { role = kind === 'hunter' ? 'retiree' : pick(['worker', 'vendor'] as WardrobeRole[], 4); fem = false; }
  else if (kind === 'bloater') role = pick(['retiree', 'vendor', 'worker'] as WardrobeRole[], 4);
  else if (kind === 'screamer') { role = 'owl'; fem = true; }
  else if (kind === 'runner') role = pick(['owl', 'student'] as WardrobeRole[], 4);
  else if (kind === 'stalker') { role = 'worker'; fem = r(4) < 0.3; }
  const base = zombify(deriveStyle(look, `z${key}`, role, fem === undefined ? {} : { fem }), seed);
  const c = { ...base.colors };
  let head = base.head & ~ALL_HATS, torso = base.torso & ~SKIP_TORSO, armL = base.armL, armR = base.armR, legs = base.legs;
  let prop: ZombieProp = null, propColor = 0;
  if (r(5) < 0.5) c.lower = c.skin;
  if (r(6) < 0.35) c.shin = c.skin;
  switch (kind) {
    case 'riot': {
      // Riot police: a visored helmet, a vest, boots, all in dark olive or navy; a shield on the left forearm.
      const [top, low] = pick(RIOT, 7);
      head |= HEAD.SWAT; torso |= TORSO.VEST; legs = LEG.BOOT;
      c.shirt = c.upper = c.lower = top; c.pants = c.thigh = c.shin = low; c.accent = pick(['#16191c', '#22262a', '#2c3326'], 9); c.hands = '#1a1b1d'; c.shoes = '#121315'; c.sole = '#0c0d0e';
      // Some lost the vest, some had the sleeves torn and the gloves off.
      if (r(10) < 0.25) torso &= ~TORSO.VEST;
      if (r(11) < 0.3) { c.lower = c.skin; c.hands = c.skin; }
      prop = 'shield'; propColor = packColor('#3c4652');
      break;
    }
    case 'shipper': {
      const color = pick(DELIVERY, 7);
      head |= HEAD.HELMET; c.accent = r(9) < 0.75 ? color : pick(['#f2efe6', '#2b2f33'], 10); c.shirt = c.upper = color; if (r(8) < 0.5) c.lower = color;
      if (r(12) < 0.8) torso |= TORSO.JACKET; else torso |= TORSO.COLLAR;
      prop = 'box'; propColor = packColor(color);
      break;
    }
    case 'screamer':
      head = (head & ~(HEAD.SHORT | HEAD.SIDE_PART | HEAD.BUN | HEAD.TAIL | HEAD.BOB | HEAD.THIN | HEAD.BUZZ | HEAD.EARS)) | HEAD.LONG; c.hair = '#121010';
      c.shirt = c.upper = pick(['#d8d4c8', '#cfcabf', '#e2ddd2'], 7); c.pants = c.thigh = pick(['#c9c4b8', '#bdb6a8'], 8); c.lower = c.skin;
      break;
    case 'hunter':
      head = (head & ~(HEAD.SHORT | HEAD.SIDE_PART | HEAD.LONG | HEAD.BUN | HEAD.TAIL | HEAD.BOB | HEAD.BUZZ)) | HEAD.THIN | HEAD.EARS; c.hair = '#6b655c';
      c.lower = c.skin; c.hands = c.skin;
      break;
    case 'stalker':
      c.shirt = c.upper = pick(['#1e1d22', '#2a2622', '#24252b'], 7); c.pants = c.thigh = c.shin = '#18181b'; c.hair = pick(HAIRS, 8);
      c.lower = c.hands = c.skin;
      break;
    case 'brute':
      if (r(7) < 0.5) { torso |= TORSO.TANK; c.upper = c.skin; }
      break;
    default:
  }
  // A walker never reads as a green-tinted resident: one strong deformity always, a second 45% of the time.
  const forced = new Set<string>();
  if (kind === 'walker') {
    const strong = (u: number) => { let acc = 0; for (const [name, w] of WALKER_STRONG) { acc += w; if (u < acc) return name; } return WALKER_STRONG[0][0]; };
    forced.add(strong(r(60)));
    if (r(61) < 0.45) forced.add(strong(r(62)));
  }
  const chance = (name: keyof KindLook['parts'], k: number, scale = 1) => forced.has(name) || r(k) < (L.parts[name] ?? 0) * scale;
  // Months of grime: every cloth colour darker and greyer than the turned resident wore it.
  for (const key of ['shirt', 'pants', 'upper', 'thigh', 'shin', 'lower'] as const) if (c[key] !== c.skin) c[key] = grime(c[key], 0.8, 0.35);
  // Deformities by the kind's chances.
  if (chance('RIBS', 20)) torso |= ZT.RIBS;
  if (chance('HUNCH', 21)) torso |= ZT.HUNCH;
  if (chance('BLOAT', 22)) torso |= ZT.BLOAT;
  if (chance('TATTERS', 23)) torso |= ZT.TATTERS;
  if (chance('SORES', 24)) torso |= ZT.SORES;
  if (chance('JAWLESS', 25)) head |= HEAD.BLINK;
  if (chance('GASH', 55)) torso |= ZT.GASH;
  if (chance('SCALP', 56)) torso |= ZT.SCALP;
  head |= HEAD.EYES;
  const gape = chance('GAPE', 26);
  // Arms: the forearm is on unless this arm was torn off at the elbow (never the shield arm of a riot zombie).
  const stump = chance('STUMP', 27) ? (kind === 'riot' || r(28) < 0.6 ? 'R' : 'L') : null;
  const armBits = (k: number, gone: boolean) => {
    let m = gone ? ZA.STUMP : ZA.FOREARM;
    if (!gone && chance('CLAWS', k)) m |= ZA.CLAWS;
    if (!gone && chance('BONE', k + 1)) m |= ZA.BONE;
    if (chance('RAGS', k + 2) && !(m & ZA.STUMP)) m |= ZA.RAGS;
    return m;
  };
  armL = (armL & ((1 << 14) - 1)) | armBits(30, stump === 'L');
  armR = (armR & ((1 << 14) - 1)) | armBits(33, stump === 'R');
  if (chance('CLAWFOOT', 36)) legs = (legs & LEG.WIDE) | LEG.BARE | ZL.CLAWFOOT;
  if (chance('BONE', 37, 0.5)) legs |= ZL.BONE;
  if (chance('RAGS', 38) || (torso & ZT.TATTERS && r(39) < 0.3)) { legs |= ZL.RAGS; c.shin = c.skin; }
  if (legs & LEG.BARE) c.shin = r(40) < 0.6 ? c.skin : c.shin;
  // Nothing that paints with accent2 (it is the eye colour) and nothing the variant build leaves out.
  head &= ~ALL_HATS | (kind === 'riot' ? HEAD.SWAT : 0) | (kind === 'shipper' ? HEAD.HELMET : 0);
  torso &= ~SKIP_TORSO_PARTS;
  [head, torso] = evenMasks(head, torso);
  c.accent2 = L.eye;
  // Per dress, the asymmetry flips side half the time and the limbs vary a little (within the A13 limits).
  const flip = r(41) < 0.5, jitter = (ls: [number, number], k: number): [number, number] => {
    const len = ls[0] * (0.97 + 0.06 * r(k)), thick = ls[1] * (0.97 + 0.06 * r(k + 1));
    return [clamp(len, thick * 0.7, thick * 1.5), thick];
  };
  const limbs: KindLook = {
    ...L,
    armL: jitter(flip ? L.armR : L.armL, 42), armR: jitter(flip ? L.armL : L.armR, 44), legL: jitter(L.legL, 46), legR: jitter(L.legR, 48),
    shoulder: flip ? [L.shoulder[1], L.shoulder[0]] : [...L.shoulder], tilt: L.tilt * (r(50) < 0.5 ? -1 : 1), lean: L.lean * (0.92 + 0.16 * r(51)),
  };
  const style: FigureStyle = {
    ...base, head, torso, armL, armR, legs, colors: c,
    width: base.width * (0.96 + 0.08 * r(52)), height: base.height * (0.97 + 0.06 * r(53)),
  };
  setStyle(look, style);
  const dress: ZombieDress = { kind, look, style, palettes: palettesOf(style), limbs, seed, eye: packColor(L.eye), glow: L.glow, gape, prop, propColor };
  dresses.set(key, dress);
  return dress;
}

/** A mutant's dress: rags in the colours of the residents it was, mottled purple-grey skin. */
export function mutantDress(kind: MutantKind): ZombieDress {
  const key = `mutant:${kind}`;
  const cached = dresses.get(key);
  if (cached) return cached;
  const seed = hash32(key);
  const L = MUTANT_LOOKS[kind];
  const skin = kind === 'leaper' ? '#6a7a68' : '#7d6f7a';
  const look: FigureLook = { shirt: kind === 'matriarch' ? '#6b5a4a' : '#4f4a44', pants: '#3a3632', skin };
  const base = zombify(deriveStyle(look, key, kind === 'matriarch' ? 'vendor' : 'worker', { fem: kind === 'matriarch' }), seed);
  const c = { ...base.colors, skin, lower: skin, hands: skin, accent2: L.eye, shin: skin };
  let head = (base.head & ~ALL_HATS) | HEAD.EYES | HEAD.MOUTH;
  if (kind === 'matriarch') head = (head & ~(HEAD.SHORT | HEAD.SIDE_PART | HEAD.BUN | HEAD.TAIL | HEAD.BOB | HEAD.EARS)) | HEAD.LONG;
  if (kind === 'leaper') head = (head & ~(HEAD.SHORT | HEAD.SIDE_PART | HEAD.LONG | HEAD.BUN | HEAD.TAIL | HEAD.BOB | HEAD.BUZZ)) | HEAD.THIN | HEAD.EARS;
  let torso = (base.torso & ~SKIP_TORSO_PARTS & ~ZT.SORES) | ZT.TATTERS | ZT.SORES;
  if (L.parts.HUNCH) torso |= ZT.HUNCH;
  if (L.parts.BLOAT) torso |= ZT.BLOAT;
  if (L.parts.RIBS) torso |= ZT.RIBS;
  if (kind === 'colossus') torso |= ZT.GASH;
  if (kind !== 'leaper') torso |= ZT.SCALP;
  if (kind !== 'matriarch') { torso |= TORSO.TANK; c.upper = skin; }
  const claws = L.parts.CLAWS ? ZA.CLAWS : 0;
  [head, torso] = evenMasks(head, torso);
  const style: FigureStyle = {
    ...base, head, torso, colors: c, width: 1, height: 1,
    armL: ZA.FOREARM | claws | ZA.RAGS, armR: ZA.FOREARM | claws | (kind === 'colossus' ? ZA.BONE : ZA.RAGS),
    legs: LEG.BARE | ZL.RAGS | (L.parts.CLAWFOOT ? ZL.CLAWFOOT : 0) | (kind === 'leaper' ? ZL.BONE : 0),
  };
  setStyle(look, style);
  const dress: ZombieDress = { kind, look, style, palettes: palettesOf(style), limbs: L, seed, eye: packColor(L.eye), glow: L.glow, gape: !!L.parts.GAPE, prop: null, propColor: 0 };
  dresses.set(key, dress);
  return dress;
}

// ---- Placing eyes and props on a posed figure -------------------------------------------------------------------

const HEAD_PIVOT = FIGURE.headPivotY;
const eyeRest = EYE_SOCKETS.map(([x, y, z]) => new THREE.Vector3(x, y + HEAD_PIVOT, z));
/** World position of eye k (0 left, 1 right) of a body instance (`base` matrix, body pose [headYaw, headPitch, twist, swing]). */
export function eyeWorld(base: THREE.Matrix4, pose: ArrayLike<number>, k: 0 | 1, out: THREE.Vector3) {
  return applyRig('body', HEAD_RIG, pose, eyeRest[k], out).applyMatrix4(base);
}

const propQ = new THREE.Quaternion(), propV = new THREE.Vector3(), propS = new THREE.Vector3();
const forearm = new THREE.Vector3(), propR = new THREE.Matrix4(), propB = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
/**
 * Where a dress's rigid prop goes (horror-fx props, unit box scaled by the matrix): the shipper's insulated box rides
 * the chest on the back (shape 0); the riot shield (shape 1: wide along x, tall along y, thin along z) is strapped
 * to the outside of the left forearm, its face turning with the elbow, so a forearm held across the chest holds it
 * upright in front. `chest` is the chest matrix (figure units), `armL`/`armLPose` the left arm's instance matrix and
 * shader pose. Returns false when the dress has none (or the arm that would hold it is a stump).
 */
export function propMatrix(dress: ZombieDress, chest: THREE.Matrix4, armL: THREE.Matrix4, armLPose: ArrayLike<number>, out: THREE.Matrix4) {
  if (dress.prop === 'box') {
    out.compose(propV.set(0, 1.4, -0.27), propQ.identity(), propS.set(0.42, 0.42, 0.34));
    out.premultiply(chest);
    return true;
  }
  if (dress.prop === 'shield') {
    if (dress.style.armL & ZA.STUMP) return false;
    // Mid-forearm, just outside it (+x is the back of the unmirrored left forearm), placed as the shader bends it.
    applyRig('arm', [1, 0, 1, 0], armLPose, forearm.set(0.085, -UA - 0.14, 0), forearm);
    out.makeTranslation(forearm.x, forearm.y, forearm.z)
      .multiply(propR.makeRotationX(armLPose[0] ?? 0))
      .multiply(propB)
      .multiply(propR.makeScale(0.62, 1.0, 0.07));
    out.premultiply(armL);
    return true;
  }
  return false;
}

const xm = new THREE.Matrix4(), xv = new THREE.Vector3(), xd = new THREE.Vector3(), xq = new THREE.Quaternion(), xs = new THREE.Vector3(), xp = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const CHEST_RIG: [number, number, number, number] = [0, 1, 0, 0];
/**
 * Everything a regular zombie shows besides its five figure instances, pushed into horror-fx: its eye glints (fog-free;
 * pass night 0..1 for the ×1.6 night glow; the hunter's milky eyes give none), its rigid prop (riot shield, shipper's
 * box; not when `bare`, the shipper's helmet popped or the riot shield broken), and its kind's growths: the spitter's
 * throat sac and the bloater's belly pustules (both glow while `telling` 0..1 runs: the spit's inhale, the burst's
 * swelling), the screamer's hair hanging over its face. `base` is the body instance matrix, `chest` the chest matrix
 * the arms hang from, `armL`/`armLPose` the left arm's instance and pose. Call between the fx lists' begin and end
 * (or before fx.update).
 */
export function zombieExtras(fx: Pick<HorrorFx, 'eyes' | 'growths' | 'glows' | 'props'>, d: ZombieDress, base: THREE.Matrix4, chest: THREE.Matrix4, bodyPose: ArrayLike<number>,
  armL: THREE.Matrix4, armLPose: ArrayLike<number>, o: { time: number; night?: number; telling?: number; bare?: boolean; eyes?: boolean }) {
  const night = o.night ?? 0, tell = clamp(o.telling ?? 0, 0, 1);
  if (o.eyes !== false && d.glow > 0) for (const k of [0, 1] as const) { eyeWorld(base, bodyPose, k, xv); fx.eyes.push(xv.x, xv.y, xv.z, d.eye, d.glow * (1 + 0.6 * night) * (1 + 0.6 * tell)); }
  if (!o.bare && propMatrix(d, chest, armL, armLPose, xm)) fx.props.push(xm, d.propColor, d.prop === 'box' ? 0 : 1);
  const s = d.limbs.scale * d.style.height;
  const put = (x: number, y: number, z: number, rig: [number, number, number, number], size: number, rgb: number, shape: number, glow: number) => {
    // The growth's +y follows the body there (hair hangs along the head's own down, whatever its pitch).
    applyRig('body', rig, bodyPose, xp.set(x, y + 0.1, z), xd).applyMatrix4(base);
    applyRig('body', rig, bodyPose, xp.set(x, y, z), xv).applyMatrix4(base);
    xq.setFromUnitVectors(UP, xd.sub(xv).normalize());
    xm.compose(xv, xq, xs.set(size * s, size * s * (shape === SHAPE.HAIR ? 1.6 : 1), size * s));
    if (glow > 0) fx.glows.push(xm, rgb, glow); else fx.growths.push(xm, rgb, shape);
  };
  switch (d.kind) {
    case 'spitter': {
      // A swollen sac under the jaw, glowing green as it fills.
      const pulse = tell > 0 ? 0.4 + 0.6 * tell + 0.2 * Math.sin(o.time * 18) : 0;
      put(0, 1.73, 0.075, [0.6, 1, 0, 0], 0.075 + 0.03 * tell, tell > 0 ? 0x9fe04a : 0x8fa868, SHAPE.LUMP, pulse);
      break;
    }
    case 'bloater': {
      // Pustules over the belly; they glow and throb while it swells to burst.
      for (let k = 0; k < 5; k++) {
        const a = (k / 4 - 0.5) * 1.6;
        const glow = tell > 0 ? 0.3 + 0.7 * tell * (0.6 + 0.4 * Math.sin(o.time * 14 + k * 2)) : 0;
        put(Math.sin(a) * 0.2, 1.18 + 0.06 * (k % 3), 0.035 + Math.cos(a) * 0.17, CHEST_RIG, 0.035 + 0.01 * (k % 2) + 0.015 * tell, tell > 0 ? 0xd8e05a : 0xb9b26a, SHAPE.LUMP, glow);
      }
      break;
    }
    case 'screamer': {
      // Long black hair hanging in front of the face.
      for (let k = 0; k < 3; k++) put((k - 1) * 0.06, FIGURE.headY + 0.04, 0.15, [1, 1, 0, 0], 0.055, 0x121010, SHAPE.HAIR, 0);
      break;
    }
    default:
  }
}

// ---- Twitchy, unnatural motion ----------------------------------------------------------------------------------

export type Twitch = {
  headYaw: number; headPitch: number; tilt: number; armL: number; armR: number;
  /** The whole pose holds still (stop-motion glitch). */
  freeze: boolean;
  /** Stride phase to add once when the freeze ends (constant while it lasts, 0 otherwise). */
  skip: number;
};
type TwitchSpec = { jerk: [number, number]; period: [number, number]; spasm: number; glitch: number; shake: number };
const TWITCH: Record<ZombieKind | MutantKind, TwitchSpec> = {
  walker: { jerk: [0.9, 0.5], period: [2.5, 0.9], spasm: 0.25, glitch: 0.03, shake: 0 },
  runner: { jerk: [0.7, 0.4], period: [1.4, 0.4], spasm: 0.3, glitch: 0.03, shake: 1 },
  brute: { jerk: [0.5, 0.3], period: [2.5, 1.4], spasm: 0.15, glitch: 0.02, shake: 0 },
  crawler: { jerk: [0.9, 0.5], period: [1.2, 0.4], spasm: 0.35, glitch: 0.05, shake: 0.4 },
  spitter: { jerk: [0.6, 0.5], period: [1.8, 0.7], spasm: 0.2, glitch: 0.03, shake: 0 },
  bloater: { jerk: [0.4, 0.3], period: [2.5, 1.5], spasm: 0.1, glitch: 0.02, shake: 0 },
  riot: { jerk: [0.5, 0.3], period: [2.5, 1.2], spasm: 0.15, glitch: 0.02, shake: 0 },
  shipper: { jerk: [0.9, 0.5], period: [1.8, 0.6], spasm: 0.3, glitch: 0.03, shake: 0.3 },
  screamer: { jerk: [0.8, 0.5], period: [2.2, 0.8], spasm: 0.2, glitch: 0.04, shake: 0.2 },
  hunter: { jerk: [0.9, 0.4], period: [1.6, 0.4], spasm: 0.15, glitch: 0.03, shake: 0 },
  // The stalker barely moves on its own: when it does, it is slow and wrong.
  stalker: { jerk: [0.6, 0.3], period: [4, 2.5], spasm: 0.05, glitch: 0.06, shake: 0 },
  colossus: { jerk: [0.35, 0.2], period: [3, 1.6], spasm: 0.1, glitch: 0.01, shake: 0 },
  leaper: { jerk: [0.8, 0.45], period: [1.2, 0.35], spasm: 0.3, glitch: 0.04, shake: 0.4 },
  matriarch: { jerk: [0.4, 0.25], period: [3, 2], spasm: 0.1, glitch: 0.02, shake: 0 },
};
/** A short bump from 0 to 1 and back over `len` seconds starting at 0. */
const bump = (u: number, len: number) => (u <= 0 || u >= len ? 0 : Math.sin((u / len) * Math.PI));

/**
 * The twitch layer for a zombie or mutant at `time` (seconds), stateless (a pure function of seed and time):
 * neck jerks that snap in 60 ms, hold and relax (more often when `alert` is 1), arm spasms, torso flicks, a
 * locked-on head shake for some kinds, and stop-motion glitches (a few per minute) in which the whole pose holds
 * for 0.15-0.35 s and then skips ahead. Telegraph poses must override it (the caller's job).
 */
export function twitch(seed: number, time: number, kind: ZombieKind | MutantKind, alert: number, out: Twitch): Twitch {
  const s = TWITCH[kind], a = clamp(alert, 0, 1);
  const period = lerp(s.period[0], s.period[1], a);
  const t = time + hash01(seed, 1) * 7;
  const k = Math.floor(t / period), u = t - k * period;
  const yaw = (hash01(seed, k * 4 + 2) * 2 - 1) * s.jerk[0], pitch = (hash01(seed, k * 4 + 3) * 2 - 1) * s.jerk[1];
  const hold = 0.12 + 0.4 * hash01(seed, k * 4 + 4);
  const amount = smooth(0, 0.06, u) * (u < hold ? 1 : Math.exp(-(u - hold) / 0.45));
  out.headYaw = yaw * amount + s.shake * a * 0.22 * Math.sin(time * Math.PI * 20) * (hash01(seed, k * 4 + 5) < 0.6 ? 1 : 0);
  out.headPitch = pitch * amount;
  // Spasms and flicks: per second, a chance of a 0.15 s arm spike and a torso flick.
  const sec = Math.floor(t), v = t - sec;
  const armAt = hash01(seed, sec * 5 + 7) * 0.85, flickAt = hash01(seed, sec * 5 + 8) * 0.85;
  const spasm = hash01(seed, sec * 5 + 6) < s.spasm * (0.6 + 0.8 * a);
  const left = hash01(seed, sec * 5 + 9) < 0.5;
  const spike = spasm ? 0.6 * bump(v - armAt, 0.15) : 0;
  out.armL = left ? spike : 0;
  out.armR = left ? 0 : spike;
  out.tilt = hash01(seed, sec * 5 + 10) < s.spasm ? (hash01(seed, sec * 5 + 11) < 0.5 ? -0.15 : 0.15) * bump(v - flickAt, 0.2) : 0;
  // Stop-motion glitch: a few times a minute the pose holds, then jumps ahead.
  const glitch = hash01(seed, sec * 5 + 12) < s.glitch;
  const start = hash01(seed, sec * 5 + 13) * 0.6, len = 0.15 + 0.2 * hash01(seed, sec * 5 + 14);
  out.freeze = glitch && v >= start && v < start + len;
  out.skip = out.freeze ? 0.6 + 0.8 * hash01(seed, sec * 5 + 15) : 0;
  return out;
}
export const newTwitch = (): Twitch => ({ headYaw: 0, headPitch: 0, tilt: 0, armL: 0, armR: 0, freeze: false, skip: 0 });
