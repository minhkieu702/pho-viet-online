import * as THREE from 'three';
import { TERRAIN, navigable, waterLevel } from './map/terrain';
import { SECONDS_PER_HOUR } from './clock';
import { LINE_SPECS, MOORINGS, STOP_SPECS, buildNetwork, createTransit, pathAhead, pathPoint, type Trip } from './transit';
import { BODY_SCALE, FIGURE, HAND, bakeFigure, chestMatrix, deriveStyle, palettesOf, sideX, type FigureLook, type FigureStyle } from './figures';
import { ModelParts, vehicleMaterial, type Vec3 } from './vehicle-models';
import { plantFoot, reachGrip } from './vehicles';

/**
 * Boats on the river (map/terrain.ts water): sampans rowed by someone in a conical hat, the river bus (driven on its
 * timetable by buses.ts, berthing at the piers), a dinner-cruise boat strung with lights, sand barges, speedboats
 * and a fishing boat with eyes painted on its bow. Each keeps to its own lane (one direction per lane, so they never
 * meet head-on), bobs on the swell, leaves a wake, slows down for anyone in the water ahead and goes round far out
 * of sight of the player. Two sampans are moored for people to use (transit.ts MOORINGS): the đò at the An Hòa pier
 * and a fishing ghe off the promenade. One speedboat is kept for the player to hire at a rental dock.
 */
export type BoatKind = 'sampan' | 'waterbus' | 'barge' | 'cruise' | 'speedboat' | 'fishing';
/** Who is aboard a sampan: rowing it with a guest, rowing a fare (the guest's place left for them), sitting at the stern by the oar (the đò's boatman), fishing, or nobody. */
export type Crew = 'rower' | 'rowing' | 'boatman' | 'fisher' | 'none';
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
  /** `docked`: a river bus alongside a pier; `moored`: tied up (or at anchor), facing `moor`. */
  mode: 'cruise' | 'docked' | 'anchored' | 'moored' | 'player' | 'idle';
  until: number; phase: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  wake: THREE.Mesh;
  /** Where the helmsman's hips go, in the boat's frame. */
  seat: [number, number, number];
  crew: Crew;
  /** A moored boat: its mooring (transit.ts MOORINGS id), heading, and how far it swings on its rope. */
  moor: { id: string; yaw: number; swing: number } | null;
  /** A river bus on its line: see WaterRun. */
  run: WaterRun | null;
};
/**
 * A river bus on line W1 (transit.ts): its timetable vehicle, the arc it has reached on the course, the call it is at or
 * heading for, the pier it lies alongside, whether its timetable has it in service, the trip, when it tied up, and
 * whether it is off to the depot (out of service, on along the course until out of sight).
 */
export type WaterRun = { key: string; s: number; visit: number; stop: string | null; service: boolean; trip: Trip | null; docked: number; depot: boolean; since: number };

const SPEC: Record<BoatKind, { length: number; beam: number }> = {
  sampan: { length: 6, beam: 1.5 }, waterbus: { length: 22, beam: 5 }, barge: { length: 30, beam: 7 },
  cruise: { length: 26, beam: 6.5 }, speedboat: { length: 6.5, beam: 2.2 }, fishing: { length: 10, beam: 3 },
};
/**
 * River traffic goes round out of the player's sight: a boat farther than this along the river from the player
 * reappears as far on the other side (the fog closes at 260 m), wherever the map's river reaches.
 */
const WRAP_REACH = 420;
/** The river's surface (map/terrain.ts), and the level to use off its water. */
const RIVER_LEVEL = TERRAIN.waters[0]?.level ?? -0.8;
/** The river bus line and its timetable (transit.ts W1); boats drive its course to it (buses.ts keeps the clock). */
const WATER_NET = buildNetwork(undefined, LINE_SPECS.filter((l) => l.mode === 'waterbus'), STOP_SPECS.filter((st) => st.mode === 'waterbus'));
export const WATER_LINE = WATER_NET.lines[0] ?? null;
function surface(x: number, z: number) { const y = waterLevel(x, z); return y > -1e6 ? y : RIVER_LEVEL; }
/**
 * Lanes across the river (design-real 7), from the promenade out to the far bank: sampans east, the river bus's
 * east and west runs (transit.ts W1 course), the cruise boat, speedboats both ways, the barge, sampans west and the
 * anchored fishing boats. The river bus berths alongside the pier ends at BERTH_Z (transit.ts).
 */
const LANES = { sampanEast: -160.5, cruise: -178.5, speedEast: -184, speedWest: -188.5, barge: -194, sampanWest: -199, anchored: -201.8 } as const;
/** Bow benches on the river bus's foredeck, in front of the cabin: the passenger's seat, boat frame (seat top). */
export const WATERBUS_SEAT: Vec3 = [0.55, 1.3, 7.05];
/** A passenger's seat on a moored sampan: on the thwart in the bow, facing forward. */
export const SAMPAN_SEAT: Vec3 = [0.05, 0.6, 1.65];

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
function sitter(deck: number, at: Vec3, yaw: number, look: FigureLook = { shirt: '#b8463a', pants: '#2a2522', skin: '#d3a179', hat: '#e8d9a8' }, fem = true) {
  const style = deriveStyle(look, fem ? 'sampan-guest' : 'boatman', 'retiree', { fem });
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

/** A rod of radius r from a to b (ModelParts.rod scales its unit cylinder by r twice). */
const pole = (parts: ModelParts, a: Vec3, b: Vec3, r: number, color: string, finish: 'cloth' | 'metal' = 'cloth') => parts.add(new THREE.CylinderGeometry(1, 1, 1, 6), { color, finish, matrix: new THREE.Matrix4().compose(
  new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()),
  new THREE.Vector3(r, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), r)) });

function boatGeometry(kind: BoatKind, crew: Crew = 'rower') {
  const parts = new ModelParts();
  const { length: L, beam: B } = SPEC[kind];
  if (kind === 'sampan') {
    hull(parts, L, B, 0.58, -0.32, '#7a5536', '#5a3c26', 0.36);
    deck(parts, L, B, 0.36, 0.09, 0.06, '#8a6a46');
    // The arched bamboo canopy over the middle, and a thwart across the bow to sit on.
    parts.add(new THREE.CylinderGeometry(0.7, 0.7, 2.3, 10, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), { at: [0, 0.2, 0.2], color: '#b08a4e', finish: 'cloth' });
    parts.add(box(B * 0.62, 0.06, 0.32), { at: [0, SAMPAN_SEAT[1] - 0.03, SAMPAN_SEAT[2] - 0.05], color: '#8a6a46', finish: 'cloth' });
    for (const sx of [-1, 1]) parts.add(box(0.06, SAMPAN_SEAT[1] - 0.15, 0.06), { at: [sx * B * 0.26, (SAMPAN_SEAT[1] + 0.12) / 2, SAMPAN_SEAT[2] - 0.05], color: '#5a3c26', finish: 'cloth' });
    // The stern post the oar pivots on.
    parts.add(box(0.05, 0.36, 0.05), { at: [0.52, 0.1, -2.61], color: '#5a3c26', finish: 'cloth' });
    if (crew === 'rower' || crew === 'rowing') {
      // The rower's oar through both fists, pivoting on the post, its blade in the water; a guest in the bow.
      const row = rower(0.15, -2.05);
      parts.rod(row.grip.toArray() as Vec3, row.blade.toArray() as Vec3, 0.034, { color: '#8a6a46', finish: 'cloth' });
      parts.beam(row.blade.clone().lerp(row.pivot, 0.45).toArray() as Vec3, row.blade.toArray() as Vec3, 0.15, 0.03, { color: '#8a6a46', finish: 'cloth' });
      return withPeople(parts.build(), crew === 'rower' ? [row.person, sitter(0.15, [0.05, 0, 1.75], 0)] : [row.person]);
    }
    // Tied up: the oar shipped along the gunwale, its blade over the stern.
    pole(parts, [0.5, 0.3, 1.6], [0.55, 0.3, -3.2], 0.034, '#8a6a46');
    parts.beam([0.55, 0.3, -2.6], [0.56, 0.3, -3.35], 0.15, 0.03, { color: '#8a6a46', finish: 'cloth' });
    if (crew === 'boatman') {
      // The boatman waits for a fare at the stern, in áo bà ba and nón lá.
      return withPeople(parts.build(), [sitter(0.15, [-0.05, 0, -1.95], 0, { shirt: '#3a4a52', pants: '#1d1b1a', skin: '#b98260', hat: '#e8d9a8' }, false)]);
    }
    if (crew === 'fisher') {
      // The owner squats by the side with a bamboo rod over the water and its line down into it.
      pole(parts, [0.48, 0.62, -1.45], [2.9, 1.55, -1.1], 0.016, '#b89a5e');
      pole(parts, [2.9, 1.55, -1.1], [2.9, -0.4, -1.1], 0.003, '#e8e8e0');
      parts.add(box(0.36, 0.24, 0.28), { at: [-0.35, 0.27, -1.0], color: '#3d6f8f', finish: 'plastic' });
      return withPeople(parts.build(), [squatter(0.15, [0.15, 0, -1.6], Math.PI / 2)]);
    }
    return parts.build();
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
    // Two benches on the foredeck for riders who like the breeze, and a rail round the bow.
    for (const z of [WATERBUS_SEAT[2], WATERBUS_SEAT[2] + 1.25]) {
      const w = z > WATERBUS_SEAT[2] ? 2.2 : 2.9;
      parts.add(box(w, 0.07, 0.42), { at: [0, WATERBUS_SEAT[1] - 0.035, z - 0.02], color: '#2f6f9f', finish: 'paint' });
      parts.add(box(w, 0.36, 0.06), { at: [0, WATERBUS_SEAT[1] + 0.17, z - 0.24], color: '#2f6f9f', finish: 'paint' });
      for (const sx of [-1, 1]) parts.add(box(0.06, WATERBUS_SEAT[1] - 0.85, 0.06), { at: [sx * (w / 2 - 0.1), (WATERBUS_SEAT[1] + 0.85) / 2, z], color: '#cfd3d4', finish: 'metal' });
    }
    for (const sx of [-1, 1]) {
      pole(parts, [sx * (B / 2 - 0.3), 1.55, L * 0.31 - 0.4], [sx * 1.2, 1.55, L / 2 - 1.6], 0.035, '#cfd3d4', 'metal');
      pole(parts, [sx * 1.2, 1.55, L / 2 - 1.6], [0, 1.55, L / 2 - 0.5], 0.035, '#cfd3d4', 'metal');
      for (const z of [L * 0.31 - 0.4, L / 2 - 1.6]) pole(parts, [z > L * 0.4 ? sx * 1.2 : sx * (B / 2 - 0.3), 0.85, z], [z > L * 0.4 ? sx * 1.2 : sx * (B / 2 - 0.3), 1.55, z], 0.03, '#cfd3d4', 'metal');
    }
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
  const geometries = new Map<string, THREE.BufferGeometry>();
  const geometryOf = (kind: BoatKind, crew: Crew) => {
    const key = kind === 'sampan' ? `${kind}:${crew}` : kind;
    let g = geometries.get(key);
    if (!g) { g = boatGeometry(kind, crew); geometries.set(key, g); }
    return g;
  };
  const boats: Boat[] = [];
  function make(kind: BoatKind, x: number, lane: number, dir: number, cruise: number, mode: Boat['mode'] = 'cruise', weave = 0, crew: Crew = 'rower'): Boat {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometryOf(kind, crew), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
    wake.renderOrder = 1;
    scene.add(group, wake);
    const { length, beam } = SPEC[kind];
    const boat: Boat = {
      kind, x, z: lane, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, speed: mode === 'cruise' ? cruise : 0, cruise, dir, lane, weave,
      half: [beam / 2, length / 2], mode, until: 0, phase: boats.length * 1.7, group, mesh, wake, seat: [-0.45, 0.42, -0.6], bank: 0, crew, moor: null, run: null,
    };
    boats.push(boat);
    return boat;
  }
  // One lane per boat, one direction per lane: from the promenade side out to the far bank.
  make('sampan', 40, LANES.sampanEast, 1, 1.8);
  make('cruise', 120, LANES.cruise, -1, 2.6);
  make('speedboat', -20, LANES.speedEast, 1, 11, 'cruise', 1.2);
  make('speedboat', 300, LANES.speedWest, -1, 10, 'cruise', 1.2);
  make('barge', -120, LANES.barge, 1, 3);
  make('sampan', 210, LANES.sampanWest, -1, 1.6);
  make('fishing', 150, LANES.anchored, -1, 0, 'anchored');
  make('fishing', -40, LANES.anchored, 1, 0, 'anchored');
  /** The river buses (transit.ts line W1), one per timetable vehicle: out of sight until their first trip. */
  const timetable = WATER_LINE ? createTransit(WATER_NET) : null;
  const waterbuses = Array.from({ length: WATER_LINE ? Math.max(1, timetable!.fleet(WATER_LINE.id, 0)) : 0 }, (_, v) => {
    const b = make('waterbus', 0, -166, 1, WATER_LINE!.spec.cruise, 'idle');
    b.group.visible = b.wake.visible = false;
    b.run = { key: `${WATER_LINE!.id}-${v + 1}`, s: 0, visit: 0, stop: null, service: false, trip: null, docked: 0, depot: false, since: 0 };
    return b;
  });
  /** The game clock the river buses keep to (buses.ts sets it; until then it runs from 08:00). */
  let clockH = 8, clockDay = 0, clockSet = false, service = true;
  /** The moored đò and fishing ghe (transit.ts MOORINGS), empty until buses.ts puts their people aboard. */
  const moored = MOORINGS.map((m) => {
    const b = make('sampan', m.x, m.z, 1, 0, 'moored', 0, 'none');
    b.yaw = m.yaw;
    b.moor = { id: m.id, yaw: m.yaw, swing: m.kind === 'fishing' ? 0.12 : 0 };
    return b;
  });
  /** The speedboat the player hires; out of sight until it is. */
  const rental = make('speedboat', 0, -150, 1, 0, 'idle');
  rental.group.visible = false;
  rental.wake.visible = false;

  const local = { x: 0, z: 0 };
  /** A point in a boat's frame (x to its right... its own +x, z towards the bow). */
  function toLocal(b: Boat, x: number, z: number) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
    local.x = dx * c - dz * s;
    local.z = dx * s + dz * c;
    return local;
  }
  function shown(b: Boat) { return b.mode !== 'idle'; }
  /** Where the river traffic is kept: round the player (buses.ts passes their position). */
  let focusX = (TERRAIN.bounds.minX + TERRAIN.bounds.maxX) / 2;
  /** Bob, roll and pitch on the swell, and the wake: a boat drawn where it is now. */
  function pose(b: Boat, time: number) {
    // Small boats bob more than big ones, and the bow lifts at speed.
    const size = Math.min(1, 6 / b.half[1]);
    const bob = Math.sin(time * 1.4 + b.phase) * 0.06 * (0.4 + size);
    const roll = Math.sin(time * 1.1 + b.phase * 1.3) * 0.035 * (0.3 + size);
    const pitch = Math.sin(time * 0.9 + b.phase) * 0.02 * size - (b.kind === 'speedboat' ? Math.min(0.09, Math.abs(b.speed) * 0.007) : 0);
    const level = surface(b.x, b.z);
    b.group.position.set(b.x, level + bob, b.z);
    b.group.rotation.set(pitch, b.yaw, roll + b.bank, 'YXZ');
    // A wake trailing behind, longer and fainter the faster the boat goes.
    const pace = Math.abs(b.speed);
    b.wake.visible = pace > 0.4 && b.group.visible;
    b.wake.position.set(b.x - Math.sin(b.yaw) * b.half[1] * Math.sign(b.speed || 1), level + 0.03, b.z - Math.cos(b.yaw) * b.half[1] * Math.sign(b.speed || 1));
    b.wake.rotation.y = b.yaw + (b.speed < 0 ? Math.PI : 0);
    b.wake.scale.set(b.half[0] * 2 * (1.3 + pace * 0.18), 1, 4 + pace * 2.2);
  }
  const at = new THREE.Vector3();
  function hide(b: Boat) { b.mode = 'idle'; b.speed = 0; b.group.visible = b.wake.visible = false; }
  /**
   * A river bus along its course: in to each pier and alongside it while its timetable stands there, away when the
   * timetable leaves, a little faster when running late, slowing for a swimmer ahead and holding off a pier the other
   * boat lies at. Far from the player it is where the timetable says; out of service it finishes at its pier, then
   * goes on to the depot out of sight.
   */
  function driveWater(b: Boat, dt: number, time: number, swimmer: { x: number; z: number } | null) {
    const run = b.run!, line = WATER_LINE!, path = line.path, n = line.visits.length, spec = line.spec;
    if (!service) { run.service = false; if (b.mode !== 'idle') hide(b); return; }
    const st = timetable!.vehicle(run.key, clockDay * 24 + clockH);
    const far = Math.abs(b.x - focusX) > 300 || b.mode === 'idle';
    run.service = !!st;
    if (st) { run.trip = st.trip; run.depot = false; }
    if (st && far) {
      // Where the timetable has it (unseen): on the course, or alongside the pier of its call.
      Object.assign(run, { s: st.s, visit: st.visit, stop: st.phase === 'run' ? null : line.visits[st.visit].stop.id, docked: time });
      b.mode = st.phase === 'run' ? 'cruise' : 'docked';
      b.speed = st.speed;
      b.group.visible = true;
    } else if (!st && (b.mode === 'idle' || (far && b.mode !== 'docked') || (run.depot && (time - run.since > 120 || Math.abs(b.x - focusX) > 200)))) { hide(b); return; }
    else if (b.mode === 'docked') {
      b.speed = 0;
      // Away once its timetable has left this pier; out of service, off to the depot after a while.
      if (st ? st.visit !== run.visit : time - run.docked > 12) {
        b.mode = 'cruise';
        run.stop = null;
        run.visit = (run.visit + 1) % n;
        if (!st) { run.depot = true; run.since = time; }
      }
    } else if (b.mode === 'cruise') {
      const berth = line.visits[run.visit].s, d = pathAhead(path, run.s, berth), toBerth = d > path.len - 0.5 ? 0 : d;
      if (toBerth < 0.3 && b.speed < 0.6 && !run.depot) {
        Object.assign(run, { s: berth, stop: line.visits[run.visit].stop.id, docked: time });
        b.mode = 'docked';
        b.speed = 0;
      } else {
        // Keep to the timetable: behind it (or its call) a little faster.
        let behind = st ? pathAhead(path, run.s, st.phase === 'run' ? st.s : line.visits[st.visit].s) : 0;
        if (behind > path.len / 2) behind -= path.len;
        let target = spec.cruise * Math.min(1.3, Math.max(0.75, 1 + behind / 60));
        if (!run.depot) {
          target = Math.min(target, Math.sqrt(2 * spec.decel * Math.max(0, toBerth - 0.2)) + 0.15);
          // The other boat alongside this pier: hold off until it leaves.
          if (toBerth < 45 && waterbuses.some((o) => o !== b && o.mode === 'docked' && o.run!.visit === run.visit)) target = Math.min(target, Math.sqrt(2 * spec.decel * Math.max(0, toBerth - 40)));
        }
        if (swimmer) {
          const p = toLocal(b, swimmer.x, swimmer.z);
          if (p.z > 0 && p.z < b.half[1] + 16 && Math.abs(p.x) < b.half[0] + 2.5) target = Math.min(target, 0.3);
        }
        b.speed = THREE.MathUtils.damp(b.speed, target, target < b.speed ? 1.6 : 0.6, dt);
        run.s = (run.s + b.speed * dt) % path.len;
      }
    }
    const p = pathPoint(path, run.s);
    b.x = p.x; b.z = p.z; b.yaw = Math.atan2(p.hx, p.hz);
  }

  return {
    boats,
    rental,
    waterbuses,
    moored,
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
    /** Where the river traffic goes round: kept within WRAP_REACH of this point along the river (the player). */
    setFocus(x: number) { focusX = x; },
    /**
     * Puts a boat its line drives (a river bus) at a spot, or (null) takes it out of service; it is drawn there at
     * once, bobbing as it should.
     */
    /** The game clock (hours of the day and day count) the river buses keep to. */
    setClock(hours: number, day: number) { clockH = hours; clockDay = day; clockSet = true; },
    /** The river bus runs (false: zombie mode, it is gone from the river). */
    setService(on: boolean) { service = on; },
    /** Who is aboard a moored sampan (the boatman, the fisherman, nobody). */
    setCrew(b: Boat, crew: Crew) {
      if (b.crew === crew) return;
      b.crew = crew;
      b.mesh.geometry = geometryOf(b.kind, crew);
    },
    /** Takes a moored boat out on the water (the đò setting off with a fare), or back to its mooring (null). */
    cast(b: Boat, to: { x: number; z: number; yaw: number; speed: number } | null, time: number) {
      if (!b.moor) return;
      if (to) Object.assign(b, { x: to.x, z: to.z, yaw: to.yaw, speed: to.speed });
      else {
        const m = MOORINGS.find((q) => q.id === b.moor!.id)!;
        Object.assign(b, { x: m.x, z: m.z, yaw: m.yaw, speed: 0 });
      }
      pose(b, time);
    },
    /** A point in a boat's own frame (x left, y up from the waterline, z to the bow) where it is drawn now, and its heading. */
    worldPoint(b: Boat, p: Vec3) {
      b.group.updateMatrixWorld();
      at.set(p[0], p[1], p[2]).applyMatrix4(b.group.matrixWorld);
      return { x: at.x, y: at.y, z: at.z, yaw: b.yaw };
    },
    /** `swimmer` is the player in the water (or in the hire boat): river traffic slows down for them. */
    update(dt: number, time: number, swimmer: { x: number; z: number } | null) {
      if (!clockSet) { clockH += dt / SECONDS_PER_HOUR; if (clockH >= 24) { clockH -= 24; clockDay++; } }
      for (const b of waterbuses) driveWater(b, dt, time, swimmer);
      for (const b of boats) {
        if (b.mode === 'idle' || b.run) { if (b.run && b.mode !== 'idle') pose(b, time); continue; }
        if (b.mode === 'cruise') {
          let target = b.cruise;
          if (swimmer) {
            const p = toLocal(b, swimmer.x, swimmer.z);
            if (p.z > 0 && p.z < b.half[1] + 16 && Math.abs(p.x) < b.half[0] + 2.5) target = Math.min(target, 0.3);
          }
          b.speed = THREE.MathUtils.damp(b.speed, target, target < b.speed ? 1.6 : 0.6, dt);
          b.x += b.dir * b.speed * dt;
          // Round the far side of the river from the player, well out of sight.
          if (b.x - focusX > WRAP_REACH) b.x -= 2 * WRAP_REACH;
          else if (b.x - focusX < -WRAP_REACH) b.x += 2 * WRAP_REACH;
          b.z = b.lane + Math.sin(time * 0.35 + b.phase) * b.weave;
          // Heading follows the motion: along the lane, swinging a little with the weave.
          b.yaw = Math.atan2(b.dir * Math.max(0.5, b.speed), Math.cos(time * 0.35 + b.phase) * b.weave * 0.35);
        } else if (b.mode === 'anchored') {
          // Swinging slowly on its anchor rope.
          b.yaw = (b.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(time * 0.07 + b.phase) * 0.5;
        } else if (b.mode === 'moored' && b.moor && b.speed === 0) b.yaw = b.moor.yaw + Math.sin(time * 0.09 + b.phase) * b.moor.swing;
        pose(b, time);
      }
    },
    /** Cabin windows, deck lights and bulbs glow after dark. */
    setNight(night: number) { lamps.value = 0.15 + night * 1.1; },
    /** Whether a point is open water a boat can be in (inside the buoys, clear of piers and steps). */
    water(x: number, z: number, margin: number) { return navigable(x, z, margin); },
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
export type Boats = ReturnType<typeof createBoats>;
