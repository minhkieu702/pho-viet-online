import * as THREE from 'three';
import { LAND, RIVER, SCENERY, WATER_LEVEL, inRect } from './city';
import { BODY_SCALE, FIGURE, HAND, bakeFigure, chestMatrix, deriveStyle, palettesOf, sideX, type FigureStyle } from './figures';
import { ModelParts, vehicleMaterial, type Vec3 } from './vehicle-models';
import { plantFoot, reachGrip } from './vehicles';

/**
 * Boats on the river: sampans rowed by someone in a conical hat, the river bus that stops at every dock, a
 * dinner-cruise boat strung with lights, sand barges, speedboats and a fishing boat with eyes painted on its
 * bow. Each keeps to its own lane (one direction per lane, so they never meet head-on), bobs on the swell,
 * leaves a wake, slows down for anyone in the water ahead and wraps round far out of sight. One speedboat is
 * kept for the player to hire at a rental dock.
 */
export type BoatKind = 'sampan' | 'waterbus' | 'barge' | 'cruise' | 'speedboat' | 'fishing';
export type Boat = {
  kind: BoatKind;
  x: number; z: number; yaw: number;
  /** Signed speed along the heading (m/s). */
  speed: number;
  cruise: number; dir: number; lane: number; weave: number;
  /** Extra roll (the hire boat banks into its turns). */
  bank: number;
  /** Half beam and half length, for collisions. */
  half: [number, number];
  mode: 'cruise' | 'docked' | 'anchored' | 'player' | 'idle';
  until: number; phase: number;
  group: THREE.Group;
  wake: THREE.Mesh;
  /** Where the helmsman's hips go, in the boat's frame. */
  seat: [number, number, number];
};

const SPEC: Record<BoatKind, { length: number; beam: number }> = {
  sampan: { length: 6, beam: 1.5 }, waterbus: { length: 22, beam: 5 }, barge: { length: 30, beam: 7 },
  cruise: { length: 26, beam: 6.5 }, speedboat: { length: 6.5, beam: 2.2 }, fishing: { length: 10, beam: 3 },
};
/** Boats go round from one end of the river to the other well beyond the fog, then reappear at the far end. */
const WRAP_WEST = LAND.minX - 260, WRAP_EAST = LAND.maxX + 260;

/** Top-view outline of a hull, bow towards +z once extruded (shape y maps to -z). */
function hullShape(length: number, beam: number, bow = 0.3, stern = 0.82) {
  const s = new THREE.Shape();
  const hb = beam / 2, hl = length / 2;
  s.moveTo(-hb * stern, hl);
  s.lineTo(hb * stern, hl);
  s.lineTo(hb, hl - length * 0.22);
  s.lineTo(hb, -hl + length * bow);
  s.quadraticCurveTo(hb * 0.82, -hl + length * 0.05, 0, -hl);
  s.quadraticCurveTo(-hb * 0.82, -hl + length * 0.05, -hb, -hl + length * bow);
  s.lineTo(-hb, hl - length * 0.22);
  s.closePath();
  return s;
}
function hull(parts: ModelParts, length: number, beam: number, height: number, y0: number, color: string, trim: string, bow = 0.3) {
  parts.add(new THREE.ExtrudeGeometry(hullShape(length, beam, bow), { depth: height, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), { at: [0, y0, 0], color, finish: 'paint' });
  // A gunwale round the top edge, a little proud of the hull: a ring, open over the deck.
  const rim = hullShape(length * 1.02, beam * 1.05, bow);
  rim.holes.push(hullShape(length * 0.93, beam * 0.84, bow));
  parts.add(new THREE.ExtrudeGeometry(rim, { depth: 0.14, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), { at: [0, y0 + height - 0.07, 0], color: trim, finish: 'paint' });
}
/** Deck planking in the hull's own outline (a box would poke out where the bow narrows). */
function deck(parts: ModelParts, length: number, beam: number, bow: number, y: number, thick: number, color: string) {
  parts.add(new THREE.ExtrudeGeometry(hullShape(length * 0.94, beam * 0.86, bow), { depth: thick, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), { at: [0, y, 0], color, finish: 'cloth' });
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);

// ---- People aboard -------------------------------------------------------------------------------------------

/**
 * A person posed once and baked into the boat's geometry (they ride along with its bob and roll). Everything is
 * in the person's own frame: the deck they stand or sit on is y = 0, they face +z, the data's +x is their right (mirrored to -x when solved); `at`
 * and `yaw` put that frame on the boat. `hip` is for a build of height 1 (scaled by the person's height). Feet
 * are planted by IK; hands close on an oar (a point on the shaft and the shaft's direction through the fist) or
 * rest just beyond the knees.
 */
type Aboard = {
  style: FigureStyle;
  at: Vec3; yaw: number;
  hip: Vec3; lean: number; twist?: number; pitch?: number; look?: number;
  feet: [Vec3, Vec3]; knee: Vec3; elbow: Vec3;
  oar?: [[Vec3, Vec3], [Vec3, Vec3]];
};
/** vehicle-models' 'cloth' finish (roughness, metalness, lamp glow) for the baked people. */
const CLOTH: Vec3 = [0.85, 0, 0];

/** Solves and bakes one person (lo detail, vertex coloured, indexed). */
function bakedPerson(p: Aboard) {
  const s = BODY_SCALE, { width: w, height: h, shoulderX } = p.style;
  const body = new THREE.Matrix4().compose(new THREE.Vector3(...p.hip).multiplyScalar(h), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.lean), new THREE.Vector3(s * w, s * h, s * w))
    .multiply(new THREE.Matrix4().makeTranslation(0, -FIGURE.hipY, 0));
  const inv = body.clone().invert();
  const chest = chestMatrix(body, p.twist ?? 0), chestInv = chest.clone().invert();
  // The data is written with the right side at +x; people face +z, so their right is at -x (sideX).
  const hint = (v: Vec3, side: number) => new THREE.Vector3(sideX(side) * v[0], v[1], v[2]);
  const legs = ([-1, 1] as const).map((side, k) => plantFoot(body, inv, side, new THREE.Vector3(-p.feet[k][0], p.feet[k][1], p.feet[k][2]), hint(p.knee, side)));
  const arms = ([-1, 1] as const).map((side, k) => {
    if (p.oar) {
      const [point, along] = p.oar[k];
      return reachGrip(chest, chestInv, side, shoulderX, new THREE.Vector3(...point), new THREE.Vector3(...along).normalize(), hint(p.elbow, side), HAND.GRIP, 0, null);
    }
    const knee = new THREE.Vector3(0, -FIGURE.thigh, 0).applyMatrix4(legs[k].matrix);
    return reachGrip(chest, chestInv, side, shoulderX, knee.add(new THREE.Vector3(sideX(side) * 0.02, 0.03, 0.09)), new THREE.Vector3(0, 0, 1), hint(p.elbow, side), HAND.RELAXED, 0.3, [0.6, 0]);
  });
  const place = new THREE.Matrix4().compose(new THREE.Vector3(...p.at), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(1, 1, 1));
  const on = (m: THREE.Matrix4) => m.clone().premultiply(place);
  const looks = palettesOf(p.style);
  return bakeFigure([
    { piece: 'body', matrix: on(body), look: looks.body, pose: [p.look ?? 0, p.pitch ?? 0, p.twist ?? 0, 0] },
    { piece: 'armL', matrix: on(arms[0].matrix), look: looks.armL, pose: arms[0].pose },
    { piece: 'armR', matrix: on(arms[1].matrix), look: looks.armR, pose: arms[1].pose },
    { piece: 'leg', matrix: on(legs[0].matrix), look: looks.legs, pose: legs[0].pose },
    { piece: 'leg', matrix: on(legs[1].matrix), look: looks.legs, pose: legs[1].pose },
  ]);
}

/** The boat (non-indexed ModelParts) and its people (indexed) as one indexed geometry for the vehicle material. */
function withPeople(boat: THREE.BufferGeometry, people: THREE.BufferGeometry[]) {
  const all = [boat, ...people];
  const total = all.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), color = new Float32Array(total * 3);
  const paint = new Float32Array(total), finish = new Float32Array(total * 3);
  const index: number[] = [];
  let at = 0;
  for (const g of all) {
    const n = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, at * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, at * 3);
    color.set(g.getAttribute('color').array as Float32Array, at * 3);
    if (g === boat) {
      paint.set(g.getAttribute('paint').array as Float32Array, at);
      finish.set(g.getAttribute('finish').array as Float32Array, at * 3);
      for (let i = 0; i < n; i++) index.push(at + i);
    } else {
      for (let i = 0; i < n; i++) finish.set(CLOTH, (at + i) * 3);
      for (const i of g.index!.array) index.push(at + i);
    }
    at += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
  out.setAttribute('finish', new THREE.BufferAttribute(finish, 3));
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

/**
 * The sampan's rower stands at the stern working one long oar (chèo) that pivots on the stern post, both fists on
 * the shaft, in áo bà ba and nón lá. Returns the baked person and the oar's handle end, pivot and blade end
 * (boat frame) so the boat can draw the oar through the hands.
 */
function rower(deck: number, z: number) {
  const style = deriveStyle({ shirt: '#3f5a6a', pants: '#1d1b1a', skin: '#c58f69', hat: '#e8d9a8' }, 'sampan-rower', 'vendor', { fem: true });
  // Handle top in front of the chest on the right, through the pivot on the stern post and down into the river.
  const top = new THREE.Vector3(0.12, 1.06, 0.42), pivot = new THREE.Vector3(0.5, 0.2, -0.56);
  const shaft = pivot.clone().sub(top).normalize(), up = shaft.clone().negate();
  const at = (k: number) => top.clone().addScaledVector(shaft, k).toArray() as Vec3;
  const person = bakedPerson({
    style, at: [0, deck, z], yaw: 0,
    hip: [0, 0.8, 0], lean: 0.12, twist: 0.3, pitch: -0.02, look: 0.2,
    feet: [[-0.12, 0, 0.26], [0.14, 0, -0.24]], knee: [0.15, 0, 1], elbow: [0.6, -0.6, -0.5],
    oar: [[at(0.38), up.toArray() as Vec3], [at(0.05), up.toArray() as Vec3]],
  });
  const lift = new THREE.Vector3(0, deck, z);
  return { person, grip: top.clone().addScaledVector(shaft, -0.1).add(lift), pivot: pivot.clone().add(lift), blade: pivot.clone().addScaledVector(shaft, 0.95).add(lift) };
}

/** A passenger sitting on the deck with knees drawn up and hands on them, under a nón lá. */
function sitter(deck: number, at: Vec3, yaw: number) {
  const style = deriveStyle({ shirt: '#b8463a', pants: '#2a2522', skin: '#d3a179', hat: '#e8d9a8' }, 'sampan-guest', 'retiree', { fem: true });
  return bakedPerson({
    style, at: [at[0], deck + at[1], at[2]], yaw,
    hip: [0, FIGURE.seatClear * BODY_SCALE, 0], lean: -0.08, pitch: 0.1, look: -0.3,
    feet: [[-0.12, 0, 0.44], [0.12, 0, 0.46]], knee: [0.2, 1, 0.2], elbow: [0.5, -0.6, -0.4],
  });
}

/** A fisherman squatting on the deck the way people rest everywhere in Việt Nam, forearms on his knees. */
function squatter(deck: number, at: Vec3, yaw: number) {
  const style = deriveStyle({ shirt: '#86a799', pants: '#3a3f48', skin: '#b98260', hat: '#e8d9a8' }, 'fisher', 'vendor', { fem: false });
  return bakedPerson({
    style, at: [at[0], deck + at[1], at[2]], yaw,
    hip: [0, 0.33, -0.08], lean: 0.42, pitch: -0.3, look: 0.25,
    feet: [[-0.15, 0, 0.12], [0.15, 0, 0.14]], knee: [0.35, 0.6, 1], elbow: [0.4, -0.8, 0.2],
  });
}

function boatGeometry(kind: BoatKind) {
  const parts = new ModelParts();
  const { length: L, beam: B } = SPEC[kind];
  if (kind === 'sampan') {
    hull(parts, L, B, 0.58, -0.32, '#7a5536', '#5a3c26', 0.36);
    deck(parts, L, B, 0.36, 0.09, 0.06, '#8a6a46');
    // The arched bamboo canopy over the middle.
    parts.add(new THREE.CylinderGeometry(0.7, 0.7, 2.3, 10, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), { at: [0, 0.2, 0.2], color: '#b08a4e', finish: 'cloth' });
    // The rower's oar through both fists, pivoting on a post at the stern, its blade in the water.
    const row = rower(0.15, -2.05);
    parts.rod(row.grip.toArray() as Vec3, row.blade.toArray() as Vec3, 0.034, { color: '#8a6a46', finish: 'cloth' });
    parts.add(box(0.05, 0.36, 0.05), { at: [row.pivot.x + 0.02, row.pivot.y - 0.1, row.pivot.z], color: '#5a3c26', finish: 'cloth' });
    parts.beam(row.blade.clone().lerp(row.pivot, 0.45).toArray() as Vec3, row.blade.toArray() as Vec3, 0.15, 0.03, { color: '#8a6a46', finish: 'cloth' });
    return withPeople(parts.build(), [row.person, sitter(0.15, [0.05, 0, 1.75], 0)]);
  } else if (kind === 'waterbus') {
    hull(parts, L, B, 1.5, -0.65, '#f2f1ec', '#1f5a8a', 0.26);
    parts.add(box(B * 0.98, 0.32, L * 0.62), { at: [0, 0.32, -0.6], color: '#1f5a8a', finish: 'paint' });
    parts.add(box(B - 0.7, 2.3, L * 0.62), { at: [0, 2.0, -0.6], color: '#f4f3ee', finish: 'paint' });
    for (const side of [-1, 1]) parts.add(box(0.06, 1.0, L * 0.58), { at: [side * (B / 2 - 0.33), 2.25, -0.6], color: '#2d4552', finish: 'glass' });
    parts.add(box(B - 0.7, 0.9, 0.06), { at: [0, 2.3, L * 0.31 - 0.6 + 0.03], color: '#2d4552', finish: 'glass' });
    parts.add(box(B - 0.3, 0.22, L * 0.66), { at: [0, 3.27, -0.6], color: '#1f5a8a', finish: 'paint' });
    for (let k = 0; k < 8; k++) parts.add(box(0.18, 0.08, 0.18), { at: [B / 2 - 0.2, 3.2, -L * 0.3 + k * L * 0.085], color: '#fff2c8', finish: 'lamp' });
    for (let k = 0; k < 8; k++) parts.add(box(0.18, 0.08, 0.18), { at: [-B / 2 + 0.2, 3.2, -L * 0.3 + k * L * 0.085], color: '#fff2c8', finish: 'lamp' });
    parts.rod([0, 3.4, -L * 0.36], [0, 5.2, -L * 0.36], 0.04, { color: '#cfd3d4', finish: 'metal' });
    parts.add(box(0.02, 0.5, 0.8), { at: [0, 4.9, -L * 0.36 - 0.4], color: '#c8322a', finish: 'cloth' });
    parts.add(box(0.5, 0.3, 0.3), { at: [0, 0.95, L / 2 - 0.9], color: '#fff4d6', finish: 'lamp' });
  } else if (kind === 'barge') {
    hull(parts, L, B, 1.4, -0.95, '#3c3a36', '#7a2f26', 0.14);
    parts.add(box(B - 0.6, 0.1, L * 0.7), { at: [0, 0.42, 1.5], color: '#4a4640', finish: 'metal' });
    // Two heaps of sand and the wheelhouse at the stern.
    parts.add(new THREE.ConeGeometry(2.8, 2.4, 6).scale(1, 1, 2.6), { at: [0, 1.6, 6], color: '#c9a55e', finish: 'cloth' });
    parts.add(new THREE.ConeGeometry(2.6, 2.0, 6).scale(1, 1, 2.2), { at: [0, 1.4, -4], color: '#bf9a52', finish: 'cloth' });
    parts.add(box(3.2, 2.6, 3.4), { at: [0, 1.75, -L / 2 + 2.6], color: '#e9e4d6', finish: 'paint' });
    parts.add(box(3.24, 0.8, 3.44), { at: [0, 2.4, -L / 2 + 2.6], color: '#2d4552', finish: 'glass' });
    parts.add(box(3.8, 0.2, 4), { at: [0, 3.15, -L / 2 + 2.6], color: '#7a2f26', finish: 'paint' });
    parts.add(box(0.3, 0.3, 0.3), { at: [0, 3.5, -L / 2 + 2.6], color: '#fff4d6', finish: 'lamp' });
  } else if (kind === 'cruise') {
    hull(parts, L, B, 1.7, -0.75, '#f6f2e6', '#c49a3a', 0.24);
    parts.add(box(B - 0.5, 2.4, L * 0.76), { at: [0, 2.15, -0.8], color: '#f3ead6', finish: 'paint' });
    for (const side of [-1, 1]) parts.add(box(0.06, 1.3, L * 0.72), { at: [side * (B / 2 - 0.23), 2.25, -0.8], color: '#ffd98a', finish: 'lamp' });
    parts.add(box(B - 0.2, 0.2, L * 0.8), { at: [0, 3.45, -0.8], color: '#8e2b20', finish: 'paint' });
    parts.add(box(B - 1.6, 2.0, L * 0.42), { at: [0, 4.55, -2.5], color: '#f3ead6', finish: 'paint' });
    for (const side of [-1, 1]) parts.add(box(0.06, 1.0, L * 0.38), { at: [side * (B / 2 - 0.83), 4.6, -2.5], color: '#ffd98a', finish: 'lamp' });
    parts.add(box(B - 1.2, 0.18, L * 0.46), { at: [0, 5.65, -2.5], color: '#8e2b20', finish: 'paint' });
    // Strings of bulbs from bow to stern over the top deck.
    for (let k = 0; k < 22; k++) {
      const t = k / 21;
      const zz = -L / 2 + 1 + t * (L - 2), yy = 6.1 + Math.sin(t * Math.PI) * 0.9;
      parts.add(new THREE.OctahedronGeometry(0.12, 0), { at: [0, yy, zz], color: ['#ffd25a', '#ff6a5a', '#7adfff', '#9dff7a'][k % 4], finish: 'lamp' });
    }
    parts.rod([0, 3.5, -L / 2 + 1], [0, 6.2, -L / 2 + 1], 0.05, { color: '#cfd3d4', finish: 'metal' });
    parts.rod([0, 3.5, L / 2 - 1.2], [0, 6.2, L / 2 - 1.2], 0.05, { color: '#cfd3d4', finish: 'metal' });
    parts.add(box(0.02, 0.6, 0.9), { at: [0, 6.0, L / 2 - 1.65], color: '#da251d', finish: 'cloth' });
  } else if (kind === 'speedboat') {
    hull(parts, L, B, 0.85, -0.38, '#f4f3ee', '#c8322a', 0.34);
    parts.add(box(B * 0.8, 0.08, L * 0.62), { at: [0, 0.38, -0.5], color: '#d8d2c2', finish: 'cloth' });
    parts.add(box(B * 0.92, 0.12, 0.1), { at: [0, 0.18, L * 0.2], color: '#c8322a', finish: 'paint' });
    // Windscreen, two seats, the wheel and an outboard motor.
    parts.add(box(B * 0.78, 0.5, 0.05), { at: [0, 0.75, 0.55], rot: [-0.45, 0, 0], color: '#5f7f8f', finish: 'glass' });
    for (const sx of [-0.45, 0.45]) {
      parts.add(box(0.62, 0.22, 0.62), { at: [sx, 0.52, -0.6], color: '#2f3a48', finish: 'cloth' });
      parts.add(box(0.62, 0.6, 0.14), { at: [sx, 0.85, -0.95], color: '#2f3a48', finish: 'cloth' });
    }
    parts.add(new THREE.TorusGeometry(0.17, 0.03, 5, 12), { at: [-0.45, 0.9, 0.18], rot: [-0.6, 0, 0], color: '#1d2024', finish: 'rubber', smooth: true });
    parts.add(box(0.5, 0.75, 0.42), { at: [0, 0.6, -L / 2 - 0.1], color: '#1d2024', finish: 'plastic' });
    parts.add(box(0.14, 0.9, 0.18), { at: [0, -0.2, -L / 2 - 0.15], color: '#2b2f33', finish: 'metal' });
    parts.add(box(0.28, 0.12, 0.2), { at: [0, 0.55, L / 2 - 0.5], color: '#fff4d6', finish: 'lamp' });
  } else {
    hull(parts, L, B, 1.1, -0.55, '#2f6fa8', '#c8322a', 0.3);
    deck(parts, L, B, 0.3, 0.46, 0.08, '#9a7a4e');
    parts.add(box(2.0, 1.7, 2.2), { at: [0, 1.4, -L / 2 + 2], color: '#e9e4d6', finish: 'paint' });
    parts.add(box(2.04, 0.6, 2.24), { at: [0, 1.75, -L / 2 + 2], color: '#2d4552', finish: 'glass' });
    parts.add(box(2.4, 0.16, 2.6), { at: [0, 2.3, -L / 2 + 2], color: '#c8322a', finish: 'paint' });
    parts.rod([0, 0.5, 1.2], [0, 5.5, 1.2], 0.07, { color: '#8a6a46', finish: 'cloth' });
    parts.rod([0, 4.8, 1.2], [0, 1.2, 4.4], 0.03, { color: '#cfd3d4', finish: 'metal' });
    parts.add(new THREE.SphereGeometry(0.9, 8, 5).scale(1.4, 0.5, 1), { at: [0, 0.75, 2.6], color: '#5d7a4a', finish: 'cloth' });
    // The painted eyes on both sides of the bow, as on boats from the central coast.
    for (const side of [-1, 1]) {
      parts.add(cyl(0.24, 0.04, 12).rotateZ(Math.PI / 2), { at: [side * (B / 2 - 0.62), 0.25, L / 2 - 1.55], color: '#f4f1e6', finish: 'paint' });
      parts.add(cyl(0.12, 0.05, 10).rotateZ(Math.PI / 2), { at: [side * (B / 2 - 0.6), 0.25, L / 2 - 1.5], color: '#1d1f22', finish: 'paint' });
    }
    // Squatting by the rail, looking out over the water.
    return withPeople(parts.build(), [squatter(0.54, [0.75, 0, 0.2], Math.PI / 2)]);
  }
  return parts.build();
}

/** A V of foam: two bright arms spreading from the stern and a churned middle, fading out behind. */
function wakeTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) {
    const t = y / 127; // 0 at the stern, 1 far behind
    const spread = 0.18 + 0.8 * t, fade = Math.pow(1 - t, 1.6);
    for (let x = 0; x < 64; x++) {
      const u = Math.abs(x / 63 - 0.5) * 2;
      const arm = Math.exp(-(((u - spread) / 0.07) ** 2));
      const churn = u < spread ? 0.35 * (1 - u / spread) * Math.max(0, 1 - t * 1.6) : 0;
      const i = (y * 64 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(Math.min(1, (arm * 0.85 + churn) * fade) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A single hire speedboat (another player's), sharing nothing with the river traffic. */
export function makeBoatMesh() {
  const mesh = new THREE.Mesh(boatGeometry('speedboat'), vehicleMaterial().material);
  mesh.castShadow = true;
  return mesh;
}

export function createBoats(scene: THREE.Scene) {
  const { material, lamps } = vehicleMaterial();
  const wakeGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  const wakeMaterial = new THREE.MeshBasicMaterial({ color: '#f2fbf8', transparent: true, opacity: 0.8, depthWrite: false, map: wakeTexture() });
  const geometries = new Map<BoatKind, THREE.BufferGeometry>();
  const geometryOf = (kind: BoatKind) => {
    let g = geometries.get(kind);
    if (!g) { g = boatGeometry(kind); geometries.set(kind, g); }
    return g;
  };
  const boats: Boat[] = [];
  function make(kind: BoatKind, x: number, lane: number, dir: number, cruise: number, mode: Boat['mode'] = 'cruise', weave = 0): Boat {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometryOf(kind), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
    wake.renderOrder = 1;
    scene.add(group, wake);
    const { length, beam } = SPEC[kind];
    const boat: Boat = {
      kind, x, z: lane, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, speed: mode === 'cruise' ? cruise : 0, cruise, dir, lane, weave,
      half: [beam / 2, length / 2], mode, until: 0, phase: boats.length * 1.7, group, wake, seat: [-0.45, 0.42, -0.6], bank: 0,
    };
    boats.push(boat);
    return boat;
  }
  // One lane per boat, one direction per lane: from the promenade side out to the far bank.
  make('sampan', 40, -156.5, 1, 1.8);
  make('waterbus', -60, -161.5, 1, 6);
  make('waterbus', 260, -167.5, -1, 6);
  make('cruise', 120, -174, -1, 2.6);
  make('speedboat', -20, -180, 1, 11, 'cruise', 1.2);
  make('speedboat', 300, -184.5, -1, 10, 'cruise', 1.2);
  make('barge', -120, -191, 1, 3);
  make('sampan', 210, -197.5, -1, 1.6);
  make('fishing', 150, -200.5, -1, 0, 'anchored');
  make('fishing', -40, -200.5, 1, 0, 'anchored');
  /** The speedboat the player hires; out of sight until it is. */
  const rental = make('speedboat', 0, -150, 1, 0, 'idle');
  rental.group.visible = false;
  rental.wake.visible = false;

  const stops = SCENERY.docks.map((d) => d.x);
  const local = { x: 0, z: 0 };
  /** A point in a boat's frame (x to its right... its own +x, z towards the bow). */
  function toLocal(b: Boat, x: number, z: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
    local.x = dx * c - dz * s;
    local.z = dx * s + dz * c;
    return local;
  }
  function shown(b: Boat) { return b.mode !== 'idle'; }

  return {
    boats,
    rental,
    /** The boat whose hull (grown by `radius`) covers a point, ignoring `except`. */
    hit(x: number, z: number, radius: number, except: Boat | null = null) {
      for (const b of boats) {
        if (b === except || !shown(b)) continue;
        if (Math.abs(x - b.x) > b.half[1] + radius + 1 || Math.abs(z - b.z) > b.half[1] + radius + 1) continue;
        const p = toLocal(b, x, z);
        if (Math.abs(p.x) < b.half[0] + radius && Math.abs(p.z) < b.half[1] + radius) return b;
      }
      return null;
    },
    /** Pushes a point (a swimmer) out of any hull it is inside; returns the boat that pushed, if any. */
    pushOut(point: { x: number; z: number }, radius: number, except: Boat | null = null) {
      for (const b of boats) {
        if (b === except || !shown(b)) continue;
        if (Math.abs(point.x - b.x) > b.half[1] + radius + 1 || Math.abs(point.z - b.z) > b.half[1] + radius + 1) continue;
        const p = toLocal(b, point.x, point.z);
        const ox = b.half[0] + radius - Math.abs(p.x), oz = b.half[1] + radius - Math.abs(p.z);
        if (ox <= 0 || oz <= 0) continue;
        // Out through the nearer side, back in world space.
        const lx = ox < oz ? Math.sign(p.x || 1) * ox : 0, lz = ox < oz ? 0 : Math.sign(p.z || 1) * oz;
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        point.x += lx * c + lz * s;
        point.z += -lx * s + lz * c;
        return b;
      }
      return null;
    },
    /** Puts the hire boat in the water beside a dock, bow out to the river. */
    launch(x: number, z: number, yaw: number) {
      Object.assign(rental, { x, z, yaw, speed: 0, mode: 'player' as const });
      rental.group.visible = true;
      rental.wake.visible = true;
    },
    /** Takes the hire boat back (it drifts no more). */
    dock() { rental.mode = 'idle'; rental.group.visible = false; rental.wake.visible = false; },
    /** `swimmer` is the player in the water (or in the hire boat): river traffic slows down for them. */
    update(dt: number, time: number, swimmer: { x: number; z: number } | null) {
      for (const b of boats) {
        if (b.mode === 'idle') continue;
        if (b.mode === 'cruise' || b.mode === 'docked') {
          // The river bus slows into each dock, waits there a few seconds, then carries on.
          let target = b.cruise;
          if (b.kind === 'waterbus') {
            if (b.mode === 'docked') {
              target = 0;
              if (time > b.until) { b.mode = 'cruise'; b.x += b.dir * 0.6; }
            } else {
              const next = stops.filter((sx) => (sx - b.x) * b.dir > 0).sort((p, q) => (p - q) * b.dir)[0];
              if (next !== undefined) {
                const gap = Math.abs(next - b.x);
                if (gap < 26) target = Math.max(0.8, b.cruise * (gap / 26));
                if (gap < 0.5) { b.mode = 'docked'; b.until = time + 9; }
              }
            }
          }
          if (swimmer) {
            const p = toLocal(b, swimmer.x, swimmer.z);
            if (p.z > 0 && p.z < b.half[1] + 16 && Math.abs(p.x) < b.half[0] + 2.5) target = Math.min(target, 0.3);
          }
          b.speed = THREE.MathUtils.damp(b.speed, target, target < b.speed ? 1.6 : 0.6, dt);
          b.x += b.dir * b.speed * dt;
          if (b.x > WRAP_EAST) b.x = WRAP_WEST;
          if (b.x < WRAP_WEST) b.x = WRAP_EAST;
          b.z = b.lane + Math.sin(time * 0.35 + b.phase) * b.weave;
          // Heading follows the motion: along the lane, swinging a little with the weave.
          b.yaw = Math.atan2(b.dir * Math.max(0.5, b.speed), Math.cos(time * 0.35 + b.phase) * b.weave * 0.35);
        } else if (b.mode === 'anchored') {
          // Swinging slowly on its anchor rope.
          b.yaw = (b.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(time * 0.07 + b.phase) * 0.5;
        }
        // Bobbing on the swell; small boats more than big ones, and the bow lifts at speed.
        const size = Math.min(1, 6 / b.half[1]);
        const bob = Math.sin(time * 1.4 + b.phase) * 0.06 * (0.4 + size);
        const roll = Math.sin(time * 1.1 + b.phase * 1.3) * 0.035 * (0.3 + size);
        const pitch = Math.sin(time * 0.9 + b.phase) * 0.02 * size - (b.kind === 'speedboat' ? Math.min(0.09, Math.abs(b.speed) * 0.007) : 0);
        b.group.position.set(b.x, WATER_LEVEL + bob, b.z);
        b.group.rotation.set(pitch, b.yaw, roll + b.bank, 'YXZ');
        // A wake trailing behind, longer and fainter the faster the boat goes.
        const pace = Math.abs(b.speed);
        b.wake.visible = pace > 0.4;
        b.wake.position.set(b.x - Math.sin(b.yaw) * b.half[1] * Math.sign(b.speed || 1), WATER_LEVEL + 0.03, b.z - Math.cos(b.yaw) * b.half[1] * Math.sign(b.speed || 1));
        b.wake.rotation.y = b.yaw + (b.speed < 0 ? Math.PI : 0);
        b.wake.scale.set(b.half[0] * 2 * (1.3 + pace * 0.18), 1, 4 + pace * 2.2);
      }
    },
    /** Cabin windows, deck lights and bulbs glow after dark. */
    setNight(night: number) { lamps.value = 0.15 + night * 1.1; },
    /** Whether a point is open water a boat can be in (inside the buoys, clear of piers and steps). */
    water(x: number, z: number, margin: number) {
      if (!inRect(RIVER, x, z, margin)) return false;
      for (const d of SCENERY.docks) {
        if (x > d.pier.minX - margin && x < d.steps.maxX + margin && z > d.pier.minZ - margin) return false;
      }
      return true;
    },
    dispose() {
      for (const b of boats) scene.remove(b.group, b.wake);
      for (const g of geometries.values()) g.dispose();
      wakeGeometry.dispose();
      wakeMaterial.map?.dispose();
      wakeMaterial.dispose();
      material.dispose();
    },
  };
}
