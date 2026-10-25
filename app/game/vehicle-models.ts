import * as THREE from 'three';

/**
 * Vehicle models in real-world metres (nose toward +z, wheels standing on y = 0): the four motorbike styles
 * sold in the bike shop and six car bodies. Each model is one merged geometry: vertex colours, a `paint`
 * flag on body panels (they take the instance colour, or a baked one), and a per-vertex `finish`
 * (roughness, metalness, lamp glow) so paint, chrome, rubber and lamps share one material and one draw call.
 */

export type MotoStyle = 'cub' | 'scooter' | 'vespa' | 'sport';
export type CarStyle = 'sedan' | 'hatch' | 'suv' | 'taxi' | 'pickup' | 'police';
export type Vec3 = [number, number, number];

type Finish = 'paint' | 'chrome' | 'metal' | 'rubber' | 'plastic' | 'cloth' | 'lamp' | 'glass';
/** Roughness, metalness and glow of each surface kind. */
const FINISHES: Record<Finish, Vec3> = {
  paint: [0.3, 0.12, 0],
  chrome: [0.2, 0.55, 0],
  metal: [0.45, 0.3, 0],
  rubber: [0.92, 0, 0],
  plastic: [0.62, 0, 0],
  cloth: [0.85, 0, 0],
  lamp: [0.25, 0.05, 1],
  glass: [0.08, 0.35, 0],
};

type PartOptions = {
  at?: Vec3;
  rot?: Vec3;
  scale?: number | Vec3;
  /** Full transform instead of at/rot/scale. */
  matrix?: THREE.Matrix4;
  color?: THREE.ColorRepresentation;
  /** Body panel: multiplied by the paint colour. */
  paint?: boolean;
  finish?: Finish;
  /** Keep the primitive's smooth normals (tyres, rounded panels) instead of flat facets. */
  smooth?: boolean;
};

const tmpMatrix = new THREE.Matrix4(), tmpPosition = new THREE.Vector3(), tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3(), tmpEuler = new THREE.Euler(), tmpColor = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Collects primitives into one non-indexed geometry with colour, paint and finish attributes. */
export class ModelParts {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private paints: number[] = [];
  private finishes: number[] = [];

  add(source: THREE.BufferGeometry, o: PartOptions = {}) {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    if (!o.smooth) { g.deleteAttribute('normal'); g.computeVertexNormals(); }
    if (o.matrix) g.applyMatrix4(o.matrix);
    else {
      const s = o.scale ?? 1;
      tmpEuler.set(...(o.rot ?? [0, 0, 0]));
      tmpMatrix.compose(tmpPosition.set(...(o.at ?? [0, 0, 0])), tmpQuat.setFromEuler(tmpEuler), typeof s === 'number' ? tmpScale.setScalar(s) : tmpScale.set(...s));
      g.applyMatrix4(tmpMatrix);
    }
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    tmpColor.set(o.color ?? '#ffffff');
    const finish = FINISHES[o.finish ?? (o.paint ? 'paint' : 'plastic')];
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i), p.getY(i), p.getZ(i));
      this.normals.push(n.getX(i), n.getY(i), n.getZ(i));
      this.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      this.paints.push(o.paint ? 1 : 0);
      this.finishes.push(...finish);
    }
    g.dispose();
    return this;
  }

  /** A cylinder of radius `r` from point `a` to point `b`. */
  rod(a: Vec3, b: Vec3, r: number, o: PartOptions = {}, segments = 6) {
    return this.add(new THREE.CylinderGeometry(r, r, 1, segments), { ...o, matrix: between(a, b, r, r) });
  }

  /** A box `w` wide and `d` deep stretched from point `a` to point `b` (pillars, struts). */
  beam(a: Vec3, b: Vec3, w: number, d: number, o: PartOptions = {}) {
    return this.add(new THREE.BoxGeometry(1, 1, 1), { ...o, matrix: between(a, b, w, d) });
  }

  /** `paint` bakes a colour into painted panels; without it they stay white for the instance colour. */
  build(paint?: THREE.ColorRepresentation) {
    const colors = this.colors.slice();
    if (paint !== undefined) {
      tmpColor.set(paint);
      for (let i = 0; i < this.paints.length; i++) {
        if (!this.paints[i]) continue;
        colors[i * 3] *= tmpColor.r;
        colors[i * 3 + 1] *= tmpColor.g;
        colors[i * 3 + 2] *= tmpColor.b;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('paint', new THREE.Float32BufferAttribute(this.paints, 1));
    g.setAttribute('finish', new THREE.Float32BufferAttribute(this.finishes, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Transform that stretches a unit primitive (along y) from `a` to `b`, `w` by `d` across. */
function between(a: Vec3, b: Vec3, w: number, d: number) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const length = dir.length();
  return new THREE.Matrix4().compose(from.add(to).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.divideScalar(length)), new THREE.Vector3(w, length, d));
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ball = (w = 10, h = 6) => new THREE.SphereGeometry(1, Math.min(w, 10), Math.min(h, 6));
const cyl = (top: number, bottom: number, height: number, segments = 10) => new THREE.CylinderGeometry(top, bottom, height, Math.min(segments, 12));
/** Rotations that turn a y-axis cylinder to run along x (axles, grips) or along z (exhausts). */
const ALONG_X: Vec3 = [0, 0, Math.PI / 2];
const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0];

/** Shared material for every vehicle model; `lamps` (0..1) brightens head and tail lamps at night. */
export function vehicleMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const lamps = { value: 0.25 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lampGlow = lamps;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paint;\nattribute vec3 finish;\nvarying vec3 vFinish;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n\tvColor.xyz = color.xyz * mix( vec3( 1.0 ), instanceColor.xyz, paint );\n#endif\n\tvFinish = finish;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFinish;\nuniform float lampGlow;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFinish.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vFinish.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * vFinish.z * lampGlow;');
  };
  material.customProgramCacheKey = () => 'vehicle-finish';
  return { material, lamps };
}

/** Tinted window glass, drawn after the bodies. */
export function glassMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#6f8a96', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.55, depthWrite: false });
}

// ---- Colours ----------------------------------------------------------------------------------------

const RUBBER = '#1c1f21';
const TRIM = '#26292b';
const CHROME = '#d9dee0';
const SILVER = '#aab1b4';
const DARK_METAL = '#4a4f52';
const HEAD_LAMP = '#fff4d6';
const TAIL_LAMP = '#e0392f';
const SIGNAL = '#f39a2c';
const PLATE = '#f1f1ea';
const SEAT = '#2a2624';
const CABIN = '#2b2f33';

// ---- Motorbikes -------------------------------------------------------------------------------------

/**
 * Where riders meet every motorbike model: hip above the saddle, grips, and feet on the floorboard
 * (scooters) or on footpegs (manual bikes). The rider figures in figures.ts are posed to these points.
 */
export const MOTO_RIDER = { hip: [0, 0.9, -0.22] as Vec3, grip: [0.36, 1.13, 0.5] as Vec3, board: [0.2, 0.655, 0.2] as Vec3, peg: [0.2, 0.37, -0.03] as Vec3 };
/** Which riders keep their feet on a floorboard. */
export const FLOORBOARD: Record<MotoStyle, boolean> = { scooter: true, vespa: true, cub: false, sport: false };
/** Wheel radius and axle positions (z) for spinning wheels. */
export const MOTO_WHEELS: Record<MotoStyle, { r: number; front: number; rear: number }> = {
  scooter: { r: 0.28, front: 0.66, rear: -0.62 },
  cub: { r: 0.3, front: 0.63, rear: -0.6 },
  vespa: { r: 0.26, front: 0.6, rear: -0.58 },
  sport: { r: 0.3, front: 0.72, rear: -0.64 },
};

type RimStyle = 'alloy' | 'spoke' | 'steel';
/** Off while building a body whose wheels are separate spinning meshes. */
let drawWheels = true;

/** A motorbike wheel centred on the origin (axle along x): rounded tyre, rim and spokes or alloy arms. */
function motoWheel(parts: ModelParts, at: Vec3, r: number, tread: number, rim: RimStyle, disc = false) {
  if (!drawWheels) return;
  const tube = tread / 2;
  parts.add(new THREE.TorusGeometry(r - tube, tube, 4, 14), { at, rot: [0, Math.PI / 2, 0], color: RUBBER, finish: 'rubber', smooth: true });
  // The rim fills the tyre so it reads as solid from any side; a darker inner disc and the hub.
  const rimR = r - tread * 0.95;
  parts.add(cyl(rimR + 0.01, rimR + 0.01, tread * 0.78, 12), { at, rot: ALONG_X, color: rim === 'alloy' ? '#2e3133' : SILVER, finish: rim === 'alloy' ? 'metal' : 'chrome' });
  parts.add(cyl(rimR * 0.88, rimR * 0.88, tread * 0.8, 12), { at, rot: ALONG_X, color: rim === 'spoke' ? '#5b6163' : rim === 'alloy' ? '#3b3f42' : '#8d9497', finish: 'metal' });
  parts.add(cyl(0.05, 0.05, tread + 0.06, 6), { at, rot: ALONG_X, color: SILVER, finish: 'chrome' });
  if (rim === 'spoke') {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, side = k % 2 ? 1 : -1;
      parts.rod([at[0] + side * 0.035, at[1], at[2]], [at[0] + side * 0.012, at[1] + Math.sin(a) * rimR * 0.9, at[2] + Math.cos(a) * rimR * 0.9], 0.007, { color: CHROME, finish: 'chrome' }, 3);
    }
  } else if (rim === 'alloy') {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.beam([at[0], at[1], at[2]], [at[0], at[1] + Math.sin(a) * rimR * 0.92, at[2] + Math.cos(a) * rimR * 0.92], 0.05, 0.035, { color: '#2e3133', finish: 'metal' });
    }
  }
  if (disc) parts.add(cyl(r * 0.55, r * 0.55, 0.012, 10), { at: [at[0] + 0.07, at[1], at[2]], rot: ALONG_X, color: SILVER, finish: 'metal' });
}

/** A mudguard arc over a wheel: from `start` (0 = straight ahead, π/2 = top) through `arc` radians. */
function fender(parts: ModelParts, z: number, y: number, r: number, width: number, start: number, arc: number, o: PartOptions) {
  parts.add(new THREE.TorusGeometry(r, 0.03, 3, 10, arc).rotateZ(start), { ...o, at: [0, y, z], rot: [0, -Math.PI / 2, 0], scale: [1, 1, width / 0.06] });
}

/** Handlebar, grips, levers, mirrors and turn signals shared by every bike. */
function controls(parts: ModelParts, mirrors: 'stalk' | 'round', signals = true) {
  const [gx, gy, gz] = MOTO_RIDER.grip;
  parts.rod([-gx + 0.04, gy - 0.01, gz], [gx - 0.04, gy - 0.01, gz], 0.016, { color: CHROME, finish: 'chrome' });
  for (const s of [-1, 1]) {
    parts.add(cyl(0.024, 0.024, 0.12, 10), { at: [s * (gx - 0.02), gy, gz], rot: ALONG_X, color: RUBBER, finish: 'rubber' });
    parts.add(box(0.12, 0.012, 0.025), { at: [s * (gx - 0.06), gy + 0.01, gz + 0.06], rot: [0, s * 0.25, 0], color: SILVER, finish: 'chrome' });
    const top: Vec3 = [s * (gx - 0.07), gy + 0.17, gz - 0.03];
    parts.rod([s * (gx - 0.15), gy + 0.01, gz], top, 0.016, { color: '#3a3e40', finish: 'metal' }, 6);
    if (mirrors === 'round') parts.add(cyl(0.05, 0.05, 0.022, 12), { at: [top[0], top[1] + 0.03, top[2]], rot: ALONG_Z, color: CHROME, finish: 'chrome' });
    else parts.add(ball(10, 6), { at: [top[0] + s * 0.025, top[1] + 0.02, top[2]], rot: [0, 0, s * 0.25], scale: [0.065, 0.038, 0.022], color: TRIM, finish: 'plastic', smooth: true });
    if (signals) parts.add(box(0.05, 0.035, 0.04), { at: [s * 0.24, gy - 0.07, gz + 0.1], color: SIGNAL, finish: 'lamp' });
  }
}

/** Rear number plate with its holder, tail lamp and indicators. */
function rearEnd(parts: ModelParts, z: number, plateY: number, lampY: number, tilt = 0.3) {
  parts.add(box(0.2, 0.15, 0.012), { at: [0, plateY, z - 0.01], rot: [tilt, 0, 0], color: PLATE, finish: 'plastic' });
  parts.add(box(0.22, 0.17, 0.02), { at: [0, plateY, z + 0.005], rot: [tilt, 0, 0], color: TRIM });
  parts.add(box(0.16, 0.055, 0.05), { at: [0, lampY, z + 0.06], color: TAIL_LAMP, finish: 'lamp' });
  for (const s of [-1, 1]) parts.add(box(0.05, 0.035, 0.05), { at: [s * 0.13, lampY - 0.02, z + 0.08], color: SIGNAL, finish: 'lamp' });
}

/** Honda Vision / Lead style automatic scooter. */
function scooter(parts: ModelParts) {
  const w = MOTO_WHEELS.scooter;
  motoWheel(parts, [0, w.r, w.front], w.r, 0.11, 'alloy', true);
  motoWheel(parts, [0, w.r, w.rear], w.r, 0.12, 'alloy');
  for (const s of [-1, 1]) parts.rod([s * 0.07, w.r, w.front], [s * 0.06, 0.66, w.front - 0.12], 0.025, { color: '#2c2f31', finish: 'metal' });
  fender(parts, w.front, w.r, w.r + 0.05, 0.15, 0.2, 2.1, { paint: true });
  // Front apron with a rounded nose, the inner leg shield and the floorboard tunnel.
  parts.add(box(0.46, 0.6, 0.1), { at: [0, 0.83, 0.43], rot: [-0.32, 0, 0], paint: true });
  parts.add(ball(14, 10), { at: [0, 0.84, 0.47], rot: [-0.32, 0, 0], scale: [0.23, 0.3, 0.08], paint: true, smooth: true });
  parts.add(box(0.07, 0.4, 0.02), { at: [0, 0.86, 0.545], rot: [-0.32, 0, 0], color: TRIM });
  parts.add(box(0.42, 0.5, 0.03), { at: [0, 0.84, 0.36], rot: [-0.32, 0, 0], color: '#3a3d40' });
  parts.add(box(0.34, 0.05, 0.48), { at: [0, 0.578, 0.13], color: '#45484a' });
  parts.add(box(0.4, 0.18, 0.52), { at: [0, 0.47, 0.13], paint: true });
  parts.add(box(0.42, 0.04, 0.54), { at: [0, 0.37, 0.13], color: TRIM });
  // Rear body: a smooth pod under the saddle tapering to the tail, side skirts below.
  parts.add(ball(16, 10), { at: [0, 0.62, -0.42], scale: [0.21, 0.2, 0.52], paint: true, smooth: true });
  parts.add(box(0.36, 0.2, 0.62), { at: [0, 0.5, -0.36], paint: true });
  parts.add(ball(12, 8), { at: [0, 0.67, -0.88], scale: [0.15, 0.1, 0.16], paint: true, smooth: true });
  parts.add(box(0.37, 0.03, 0.64), { at: [0, 0.6, -0.36], color: TRIM });
  // Saddle, grab rail.
  parts.add(box(0.33, 0.06, 0.64), { at: [0, 0.79, -0.33], color: SEAT, finish: 'cloth' });
  parts.add(ball(12, 8), { at: [0, 0.81, -0.33], scale: [0.17, 0.055, 0.34], color: SEAT, finish: 'cloth', smooth: true });
  parts.rod([-0.14, 0.82, -0.68], [-0.12, 0.84, -0.88], 0.015, { color: TRIM });
  parts.rod([0.14, 0.82, -0.68], [0.12, 0.84, -0.88], 0.015, { color: TRIM });
  // Belt drive and engine on the left, exhaust on the right.
  parts.add(box(0.09, 0.19, 0.56), { at: [0.15, 0.31, -0.44], color: '#55595b', finish: 'metal' });
  parts.add(cyl(0.05, 0.05, 0.38, 10), { at: [-0.17, 0.33, -0.62], rot: ALONG_Z, color: CHROME, finish: 'chrome' });
  parts.add(box(0.035, 0.09, 0.3), { at: [-0.22, 0.35, -0.6], color: TRIM });
  // Rear hugger and plate.
  parts.add(box(0.14, 0.04, 0.24), { at: [0, 0.5, -0.86], rot: [0.5, 0, 0], color: TRIM });
  rearEnd(parts, -0.98, 0.5, 0.7);
  // Steering column, handlebar cover with headlight and speedometer.
  parts.add(box(0.56, 0.1, 0.18), { at: [0, 1.08, 0.5], paint: true });
  parts.add(ball(12, 8), { at: [0, 1.11, 0.52], scale: [0.15, 0.08, 0.14], paint: true, smooth: true });
  parts.add(box(0.16, 0.05, 0.1), { at: [0, 1.15, 0.45], rot: [0.5, 0, 0], color: '#1d2224', finish: 'glass' });
  parts.add(ball(12, 8), { at: [0, 1.06, 0.6], scale: [0.11, 0.055, 0.05], color: HEAD_LAMP, finish: 'lamp', smooth: true });
  controls(parts, 'stalk');
}

/** Wave / Super Cub style step-through with spoked wheels. */
function cub(parts: ModelParts) {
  const w = MOTO_WHEELS.cub;
  motoWheel(parts, [0, w.r, w.front], w.r, 0.08, 'spoke');
  motoWheel(parts, [0, w.r, w.rear], w.r, 0.09, 'spoke');
  for (const s of [-1, 1]) parts.rod([s * 0.065, w.r, w.front], [s * 0.06, 0.96, w.front - 0.15], 0.022, { color: CHROME, finish: 'chrome' });
  fender(parts, w.front, w.r, w.r + 0.04, 0.12, 0.25, 2.0, { paint: true });
  fender(parts, w.rear, w.r, w.r + 0.04, 0.12, 0.9, 1.9, { paint: true });
  // Underbone frame and leg shield.
  parts.rod([0, 0.98, 0.47], [0, 0.52, 0.14], 0.045, { paint: true });
  parts.rod([0, 0.52, 0.14], [0, 0.55, -0.12], 0.045, { paint: true });
  parts.add(box(0.44, 0.5, 0.05), { at: [0, 0.76, 0.35], rot: [-0.25, 0, 0], paint: true });
  parts.add(box(0.32, 0.22, 0.04), { at: [0, 0.48, 0.42], rot: [-0.6, 0, 0], color: '#3a3d40' });
  // Engine: crankcase, horizontal cylinder and a chrome side cover.
  parts.add(box(0.24, 0.24, 0.34), { at: [0, 0.34, 0.0], color: '#7a8083', finish: 'metal' });
  parts.add(cyl(0.08, 0.08, 0.24, 10), { at: [0, 0.33, 0.22], rot: ALONG_Z, color: '#8b9194', finish: 'metal' });
  for (let k = 0; k < 4; k++) parts.add(cyl(0.095, 0.095, 0.015, 8), { at: [0, 0.33, 0.14 + k * 0.05], rot: ALONG_Z, color: '#7a8083', finish: 'metal' });
  parts.add(ball(12, 8), { at: [0.13, 0.33, 0.0], scale: [0.03, 0.12, 0.13], color: CHROME, finish: 'chrome', smooth: true });
  // Body covers, tail cowl and saddle.
  parts.add(ball(14, 10), { at: [0, 0.64, -0.3], scale: [0.19, 0.16, 0.36], paint: true, smooth: true });
  parts.add(ball(12, 8), { at: [0, 0.7, -0.66], scale: [0.16, 0.12, 0.3], paint: true, smooth: true });
  parts.add(box(0.3, 0.07, 0.7), { at: [0, 0.8, -0.38], color: SEAT, finish: 'cloth' });
  parts.add(ball(12, 8), { at: [0, 0.835, -0.38], scale: [0.15, 0.05, 0.36], color: SEAT, finish: 'cloth', smooth: true });
  // Rear rack, shocks, swingarm, chain guard, footpegs.
  parts.add(box(0.28, 0.025, 0.3), { at: [0, 0.83, -0.88], color: TRIM, finish: 'metal' });
  for (const s of [-1, 1]) {
    parts.rod([s * 0.12, 0.34, w.rear], [s * 0.12, 0.74, w.rear + 0.12], 0.022, { color: CHROME, finish: 'chrome' });
    parts.rod([s * 0.1, 0.32, w.rear], [s * 0.1, 0.36, -0.05], 0.018, { color: TRIM, finish: 'metal' });
    parts.add(cyl(0.02, 0.02, 0.12, 8), { at: [s * 0.2, 0.34, -0.03], rot: ALONG_X, color: RUBBER, finish: 'rubber' });
  }
  parts.add(box(0.03, 0.08, 0.58), { at: [0.13, 0.35, -0.3], color: TRIM });
  // Exhaust down the right side.
  parts.rod([-0.06, 0.27, 0.3], [-0.15, 0.26, -0.15], 0.022, { color: CHROME, finish: 'chrome' });
  parts.add(cyl(0.055, 0.05, 0.42, 10), { at: [-0.17, 0.3, -0.42], rot: [Math.PI / 2 + 0.12, 0, 0], color: CHROME, finish: 'chrome' });
  rearEnd(parts, -0.97, 0.56, 0.72, 0.2);
  // Headlight cowl on the bars.
  parts.add(box(0.48, 0.1, 0.16), { at: [0, 1.06, 0.48], paint: true });
  parts.add(ball(12, 8), { at: [0, 1.08, 0.52], scale: [0.14, 0.08, 0.13], paint: true, smooth: true });
  parts.add(box(0.14, 0.045, 0.08), { at: [0, 1.15, 0.44], rot: [0.5, 0, 0], color: '#1d2224', finish: 'glass' });
  parts.add(ball(12, 8), { at: [0, 1.04, 0.6], scale: [0.1, 0.06, 0.05], color: HEAD_LAMP, finish: 'lamp', smooth: true });
  controls(parts, 'stalk');
}

/** Classic Vespa: bulbous side cowls, a tall leg shield, round headlamp on the headset. */
function vespa(parts: ModelParts) {
  const w = MOTO_WHEELS.vespa;
  motoWheel(parts, [0, w.r, w.front], w.r, 0.11, 'steel');
  motoWheel(parts, [0, w.r, w.rear], w.r, 0.11, 'steel');
  parts.rod([0.08, w.r, w.front], [0.06, 0.66, w.front - 0.08], 0.03, { color: '#3b3f42', finish: 'metal' });
  // Wheel-hugging front mudguard.
  fender(parts, w.front, w.r, w.r + 0.05, 0.19, 0.05, 2.3, { paint: true });
  parts.add(ball(12, 8), { at: [0, w.r + 0.3, w.front - 0.02], scale: [0.11, 0.05, 0.18], paint: true, smooth: true });
  // Leg shield with a chrome horn cast badge and a centre tie.
  parts.add(box(0.5, 0.74, 0.05), { at: [0, 0.88, 0.42], rot: [-0.22, 0, 0], paint: true });
  parts.add(ball(16, 10), { at: [0, 0.86, 0.45], rot: [-0.22, 0, 0], scale: [0.25, 0.39, 0.06], paint: true, smooth: true });
  parts.add(box(0.06, 0.5, 0.02), { at: [0, 0.94, 0.505], rot: [-0.22, 0, 0], color: CHROME, finish: 'chrome' });
  parts.add(box(0.46, 0.66, 0.02), { at: [0, 0.88, 0.395], rot: [-0.22, 0, 0], color: '#e8e2d0' });
  // Floorboard with rubber runners.
  parts.add(box(0.4, 0.15, 0.46), { at: [0, 0.5, 0.13], paint: true });
  parts.add(box(0.36, 0.04, 0.42), { at: [0, 0.59, 0.13], color: '#5b5f60' });
  for (let k = -1; k <= 1; k++) parts.add(box(0.025, 0.015, 0.4), { at: [k * 0.1, 0.615, 0.13], color: RUBBER, finish: 'rubber' });
  // Side cowls and the centre body.
  for (const s of [-1, 1]) parts.add(ball(18, 12), { at: [s * 0.13, 0.58, -0.42], scale: [0.19, 0.22, 0.44], paint: true, smooth: true });
  parts.add(box(0.28, 0.26, 0.52), { at: [0, 0.62, -0.36], paint: true });
  for (const s of [-1, 1]) parts.add(box(0.012, 0.02, 0.5), { at: [s * 0.3, 0.6, -0.42], color: CHROME, finish: 'chrome' });
  // Brown saddle, chrome rack, round tail light.
  parts.add(box(0.32, 0.06, 0.64), { at: [0, 0.8, -0.34], color: '#5a3a28', finish: 'cloth' });
  parts.add(ball(12, 8), { at: [0, 0.825, -0.34], scale: [0.16, 0.06, 0.34], color: '#5a3a28', finish: 'cloth', smooth: true });
  parts.add(box(0.28, 0.02, 0.24), { at: [0, 0.86, -0.82], color: CHROME, finish: 'chrome' });
  parts.rod([-0.13, 0.86, -0.7], [-0.13, 0.86, -0.94], 0.012, { color: CHROME, finish: 'chrome' });
  parts.rod([0.13, 0.86, -0.7], [0.13, 0.86, -0.94], 0.012, { color: CHROME, finish: 'chrome' });
  parts.add(ball(12, 8), { at: [0, 0.68, -0.84], scale: [0.1, 0.09, 0.08], paint: true, smooth: true });
  rearEnd(parts, -0.9, 0.5, 0.69, 0.15);
  parts.add(cyl(0.06, 0.06, 0.3, 10), { at: [-0.17, 0.3, -0.62], rot: ALONG_Z, color: CHROME, finish: 'chrome' });
  // Headset with a round chrome-ringed headlamp and round mirrors.
  parts.add(box(0.5, 0.09, 0.16), { at: [0, 1.09, 0.5], paint: true });
  parts.add(ball(14, 10), { at: [0, 1.11, 0.52], scale: [0.13, 0.09, 0.13], paint: true, smooth: true });
  parts.add(cyl(0.085, 0.085, 0.03, 16), { at: [0, 1.11, 0.62], rot: ALONG_Z, color: CHROME, finish: 'chrome' });
  parts.add(cyl(0.07, 0.07, 0.035, 16), { at: [0, 1.11, 0.625], rot: ALONG_Z, color: HEAD_LAMP, finish: 'lamp' });
  controls(parts, 'round');
}

/** Exciter / Winner style manual sport bike: fairing, sculpted tank, upswept tail and exhaust. */
function sport(parts: ModelParts) {
  const w = MOTO_WHEELS.sport;
  motoWheel(parts, [0, w.r, w.front], w.r, 0.11, 'alloy', true);
  motoWheel(parts, [0, w.r, w.rear], w.r, 0.14, 'alloy', true);
  for (const s of [-1, 1]) {
    parts.rod([s * 0.08, w.r, w.front], [s * 0.08, 0.98, w.front - 0.18], 0.03, { color: '#c8a24a', finish: 'chrome' });
    parts.rod([s * 0.08, w.r, w.front], [s * 0.08, w.r + 0.2, w.front - 0.05], 0.036, { color: TRIM, finish: 'metal' });
  }
  fender(parts, w.front, w.r, w.r + 0.03, 0.12, 0.6, 1.4, { paint: true });
  // A pointed fairing with twin lamps, a smoked screen and slim side panels.
  parts.add(ball(14, 10), { at: [0, 0.97, 0.6], rot: [-0.45, 0, 0], scale: [0.15, 0.13, 0.25], paint: true, smooth: true });
  for (const s of [-1, 1]) {
    parts.add(box(0.03, 0.22, 0.36), { at: [s * 0.15, 0.82, 0.44], rot: [-0.35, s * 0.2, 0], paint: true });
    parts.add(box(0.07, 0.035, 0.03), { at: [s * 0.06, 0.92, 0.79], rot: [-0.45, s * 0.3, 0], color: HEAD_LAMP, finish: 'lamp' });
  }
  parts.add(box(0.2, 0.15, 0.012), { at: [0, 1.1, 0.62], rot: [-0.8, 0, 0], color: '#2c3a42', finish: 'glass' });
  // Sculpted tank and shrouds.
  parts.add(ball(16, 10), { at: [0, 0.92, 0.18], scale: [0.2, 0.13, 0.3], paint: true, smooth: true });
  parts.add(box(0.012, 0.06, 0.4), { at: [0.17, 0.9, 0.2], rot: [-0.15, 0, 0], color: TRIM });
  parts.add(box(0.012, 0.06, 0.4), { at: [-0.17, 0.9, 0.2], rot: [-0.15, 0, 0], color: TRIM });
  // Twin-spar frame, engine with a forward-leaning cylinder and a radiator.
  for (const s of [-1, 1]) parts.rod([s * 0.05, 0.98, 0.5], [s * 0.13, 0.6, -0.12], 0.03, { color: DARK_METAL, finish: 'metal' });
  parts.add(box(0.26, 0.3, 0.36), { at: [0, 0.44, 0.1], color: '#3b3f42', finish: 'metal' });
  parts.add(cyl(0.09, 0.09, 0.22, 10), { at: [0, 0.64, 0.22], rot: [0.4, 0, 0], color: '#55595b', finish: 'metal' });
  parts.add(box(0.3, 0.22, 0.04), { at: [0, 0.62, 0.42], rot: [-0.3, 0, 0], color: TRIM });
  // Step saddle and the upswept tail.
  parts.add(box(0.28, 0.07, 0.42), { at: [0, 0.8, -0.2], color: SEAT, finish: 'cloth' });
  parts.add(ball(12, 8), { at: [0, 0.83, -0.2], scale: [0.14, 0.05, 0.22], color: SEAT, finish: 'cloth', smooth: true });
  parts.add(box(0.22, 0.06, 0.26), { at: [0, 0.89, -0.52], rot: [0.12, 0, 0], color: SEAT, finish: 'cloth' });
  parts.add(box(0.24, 0.14, 0.46), { at: [0, 0.83, -0.6], rot: [0.18, 0, 0], paint: true });
  parts.add(box(0.12, 0.08, 0.16), { at: [0, 0.89, -0.85], rot: [0.25, 0, 0], paint: true });
  parts.add(box(0.12, 0.03, 0.26), { at: [0, 0.7, -0.88], rot: [0.6, 0, 0], color: TRIM });
  rearEnd(parts, -0.98, 0.62, 0.88, 0.45);
  // Swingarm, red shock, chain, pegs, upswept exhaust.
  for (const s of [-1, 1]) {
    parts.beam([s * 0.1, 0.4, -0.05], [s * 0.1, w.r, w.rear], 0.04, 0.08, { color: SILVER, finish: 'metal' });
    parts.add(cyl(0.018, 0.018, 0.12, 8), { at: [s * 0.2, 0.38, -0.05], rot: ALONG_X, color: DARK_METAL, finish: 'metal' });
  }
  parts.rod([0, 0.42, -0.18], [0, 0.72, -0.34], 0.03, { color: '#c9493b', finish: 'metal' });
  parts.add(box(0.02, 0.06, 0.62), { at: [0.13, 0.34, -0.32], color: TRIM, finish: 'metal' });
  parts.rod([-0.05, 0.4, 0.3], [-0.16, 0.36, -0.2], 0.026, { color: CHROME, finish: 'chrome' });
  parts.add(cyl(0.075, 0.065, 0.42, 12), { at: [-0.18, 0.5, -0.45], rot: [Math.PI / 2 - 0.35, 0, 0], color: '#3a3e41', finish: 'metal' });
  parts.add(cyl(0.05, 0.05, 0.06, 10), { at: [-0.18, 0.58, -0.66], rot: [Math.PI / 2 - 0.35, 0, 0], color: CHROME, finish: 'chrome' });
  controls(parts, 'stalk');
}

const MOTO_BUILDERS: Record<MotoStyle, (parts: ModelParts) => void> = { scooter, cub, vespa, sport };

/** A motorbike model, wheels included. Without `paint` its panels stay white for instance colours. */
export function motoGeometry(style: MotoStyle, paint?: THREE.ColorRepresentation) {
  const parts = new ModelParts();
  MOTO_BUILDERS[style](parts);
  return parts.build(paint);
}

/** The body of a motorbike without wheels, and one wheel centred on its axle, for bikes whose wheels spin. */
export function motoParts(style: MotoStyle, paint: THREE.ColorRepresentation) {
  const w = MOTO_WHEELS[style];
  const parts = new ModelParts();
  drawWheels = false;
  try { MOTO_BUILDERS[style](parts); } finally { drawWheels = true; }
  // Same tyres and rims as the builders use for this style.
  const wheel = new ModelParts();
  const front = style === 'cub' ? 0.08 : 0.11;
  motoWheel(wheel, [0, 0, 0], w.r, front, style === 'cub' ? 'spoke' : style === 'vespa' ? 'steel' : 'alloy', style !== 'cub' && style !== 'vespa');
  return { body: parts.build(paint), wheel: wheel.build(paint), wheels: w };
}

// ---- Cars -------------------------------------------------------------------------------------------

type CarSpec = {
  length: number; width: number; wheel: number; clearance: number; front: number; rear: number;
  /** Nose: top of the front face, front edge of the hood; windshield base (u, y); rear window base (u, y). */
  noseTop: number; hoodFront: number; screenBase: [number, number]; backBase: [number, number];
  /** Height of the trunk lid, and the cabin: rear and front ends of the roof and its height. */
  trunk: number; roofBack: number; roofFront: number; roof: number;
  /** Driver's hip position (left-hand seat). */
  seat: Vec3;
  /** B-pillar position along the car. */
  pillar: number;
};

const CAR_SPECS: Record<CarStyle, CarSpec> = {
  sedan: { length: 4.42, width: 1.74, wheel: 0.31, clearance: 0.22, front: 1.36, rear: -1.32, noseTop: 0.74, hoodFront: 0.83, screenBase: [0.78, 0.98], backBase: [-1.3, 1.0], trunk: 1.0, roofBack: -0.82, roofFront: 0.12, roof: 1.44, seat: [-0.38, 0.5, -0.22], pillar: -0.32 },
  hatch: { length: 3.66, width: 1.62, wheel: 0.29, clearance: 0.2, front: 1.2, rear: -1.18, noseTop: 0.72, hoodFront: 0.8, screenBase: [0.62, 0.95], backBase: [-1.72, 0.98], trunk: 0.98, roofBack: -1.55, roofFront: 0.0, roof: 1.48, seat: [-0.36, 0.5, -0.3], pillar: -0.45 },
  suv: { length: 4.62, width: 1.86, wheel: 0.37, clearance: 0.3, front: 1.44, rear: -1.4, noseTop: 0.95, hoodFront: 1.04, screenBase: [0.82, 1.15], backBase: [-2.18, 1.18], trunk: 1.18, roofBack: -2.08, roofFront: 0.02, roof: 1.76, seat: [-0.4, 0.68, -0.25], pillar: -0.3 },
  taxi: { length: 4.42, width: 1.74, wheel: 0.31, clearance: 0.22, front: 1.36, rear: -1.32, noseTop: 0.74, hoodFront: 0.83, screenBase: [0.78, 0.98], backBase: [-1.3, 1.0], trunk: 1.0, roofBack: -0.82, roofFront: 0.12, roof: 1.44, seat: [-0.38, 0.5, -0.22], pillar: -0.32 },
  pickup: { length: 4.7, width: 1.82, wheel: 0.36, clearance: 0.32, front: 1.52, rear: -1.5, noseTop: 0.98, hoodFront: 1.06, screenBase: [0.86, 1.18], backBase: [-0.72, 1.18], trunk: 1.16, roofBack: -0.62, roofFront: 0.12, roof: 1.8, seat: [-0.4, 0.7, -0.02], pillar: -0.18 },
  police: { length: 4.42, width: 1.76, wheel: 0.31, clearance: 0.22, front: 1.36, rear: -1.32, noseTop: 0.74, hoodFront: 0.83, screenBase: [0.78, 0.98], backBase: [-1.3, 1.0], trunk: 1.0, roofBack: -0.82, roofFront: 0.12, roof: 1.44, seat: [-0.38, 0.5, -0.22], pillar: -0.32 },
};

/** Driver's hip, roof height and the middle of the roof (for light bars) of each car body. */
export function carSpec(style: CarStyle) {
  const s = CAR_SPECS[style];
  return { seat: s.seat, roof: s.roof, roofMid: (s.roofBack + s.roofFront) / 2, length: s.length, width: s.width };
}
/** How far the rounded edges push a body's outline out of its side profile. */
const OUT = 0.028;

/** Extrudes a side profile (u along the car, v up) across the car, `width` wide, with rounded edges. */
function sideExtrude(shape: THREE.Shape, width: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: Math.min(OUT, bevel * 0.7), bevelSegments: 1, curveSegments: 5 });
  // Shape x (along the car) becomes world z; the extrusion depth becomes world x, centred.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate((width - bevel * 2) / 2, 0, 0);
  return geometry;
}

/** The painted lower body: bumpers, hood, trunk and both wheel arches. */
function lowerBody(s: CarSpec) {
  const nose = s.length / 2, tail = -s.length / 2, base = s.clearance, arch = s.wheel + 0.1;
  const shape = new THREE.Shape();
  shape.moveTo(tail + 0.12, base);
  for (const axle of [s.rear, s.front]) {
    shape.lineTo(axle - arch, base);
    shape.lineTo(axle - arch, s.wheel);
    shape.absarc(axle, s.wheel, arch, Math.PI, 0, true);
    shape.lineTo(axle + arch, base);
  }
  shape.lineTo(nose - 0.12, base);
  shape.quadraticCurveTo(nose, base, nose, base + 0.14);
  shape.lineTo(nose, s.noseTop);
  shape.quadraticCurveTo(nose, s.hoodFront, nose - 0.24, s.hoodFront + 0.02);
  shape.lineTo(s.screenBase[0], s.screenBase[1]);
  shape.lineTo(s.backBase[0], s.backBase[1]);
  if (s.backBase[0] - tail > 0.3) {
    shape.lineTo(tail + 0.2, s.trunk);
    shape.quadraticCurveTo(tail, s.trunk, tail, s.trunk - 0.14);
  } else shape.lineTo(tail, s.backBase[1] - 0.02);
  shape.lineTo(tail, base + 0.14);
  shape.quadraticCurveTo(tail, base, tail + 0.12, base);
  return sideExtrude(shape, s.width, 0.08);
}

/** The cabin as one glass volume, a little narrower than the body. */
function cabinShape(s: CarSpec, inset = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(s.backBase[0] + inset, s.backBase[1] - 0.04);
  shape.lineTo(s.roofBack + inset * 0.5, s.roof - 0.05 - inset);
  shape.lineTo(s.roofFront - inset * 0.5, s.roof - 0.05 - inset);
  shape.lineTo(s.screenBase[0] - inset, s.screenBase[1] - 0.04);
  shape.closePath();
  return shape;
}

/** A car wheel at `x` on the side `side` (±1): tyre, rim on the outer face, hub cap and wheel nuts. */
function carWheel(parts: ModelParts, x: number, z: number, r: number, side: number, rimColor: string) {
  parts.add(cyl(r, r, 0.22, 12), { at: [x, r, z], rot: ALONG_X, color: RUBBER, finish: 'rubber', smooth: true });
  parts.add(cyl(r * 0.64, r * 0.64, 0.02, 10), { at: [x + side * 0.112, r, z], rot: ALONG_X, color: rimColor, finish: 'chrome' });
  parts.add(cyl(r * 0.2, r * 0.2, 0.03, 6), { at: [x + side * 0.125, r, z], rot: ALONG_X, color: '#6d7477', finish: 'metal' });
}

function carBody(parts: ModelParts, style: CarStyle) {
  const s = CAR_SPECS[style];
  const nose = s.length / 2, tail = -s.length / 2, half = s.width / 2;
  parts.add(lowerBody(s), { paint: true });
  // Cabin frame: roof panel, A, B and C pillars on both sides (the glass is a separate model).
  const roofShape = new THREE.Shape();
  roofShape.moveTo(s.roofBack - 0.04, s.roof - 0.07);
  roofShape.lineTo(s.roofFront + 0.04, s.roof - 0.07);
  roofShape.lineTo(s.roofFront - 0.02, s.roof);
  roofShape.lineTo(s.roofBack + 0.02, s.roof);
  roofShape.closePath();
  parts.add(sideExtrude(roofShape, s.width - 0.16, 0.04), { paint: true });
  const side = half - 0.1;
  for (const sx of [-1, 1]) {
    const x = sx * (side + 0.012);
    parts.beam([x, s.screenBase[1] - 0.02, s.screenBase[0] - 0.02], [x, s.roof - 0.05, s.roofFront], 0.05, 0.07, { paint: true });
    parts.beam([x, s.backBase[1] - 0.02, s.backBase[0] + 0.03], [x, s.roof - 0.05, s.roofBack], 0.05, style === 'hatch' || style === 'suv' ? 0.2 : 0.12, { paint: true });
    parts.beam([x, s.screenBase[1] - 0.03, s.pillar], [x, s.roof - 0.05, s.pillar], 0.05, 0.09, { color: TRIM });
    if (style === 'suv') parts.beam([x, s.screenBase[1] - 0.03, -1.3], [x, s.roof - 0.05, -1.3], 0.05, 0.12, { paint: true });
    // Mirror on a stalk at the base of the A pillar.
    parts.add(box(0.12, 0.08, 0.14), { at: [sx * (half + 0.07), s.screenBase[1] + 0.12, s.screenBase[0] - 0.12], paint: true });
    parts.add(box(0.06, 0.03, 0.04), { at: [sx * (half + 0.02), s.screenBase[1] + 0.08, s.screenBase[0] - 0.1], color: TRIM });
    parts.add(box(0.008, 0.06, 0.1), { at: [sx * (half + 0.13), s.screenBase[1] + 0.12, s.screenBase[0] - 0.13], color: '#95a7ad', finish: 'glass' });
    // Door seams and handles, side skirt.
    const doors = style === 'hatch' ? [s.screenBase[0] - 0.02, s.pillar - 0.02, -1.25] : style === 'pickup' ? [s.screenBase[0] - 0.02, s.pillar, s.backBase[0] + 0.05] : [s.screenBase[0] - 0.02, s.pillar, s.backBase[0] + 0.25];
    for (const u of doors) parts.add(box(0.006, s.screenBase[1] - s.clearance - 0.2, 0.012), { at: [sx * (half + 0.002), (s.screenBase[1] + s.clearance) / 2 + 0.04, u], color: '#1f2224' });
    for (const u of [s.pillar + 0.12, style === 'pickup' ? s.backBase[0] + 0.2 : s.pillar - 0.62]) parts.add(box(0.03, 0.03, 0.14), { at: [sx * (half + 0.01), s.screenBase[1] - 0.12, u], color: CHROME, finish: 'chrome' });
    parts.add(box(0.03, 0.08, s.front - s.rear - (s.wheel + 0.1) * 2 - 0.04), { at: [sx * (half + 0.005), s.clearance + 0.04, (s.front + s.rear) / 2], color: TRIM });
    // Wheels.
    for (const z of [s.front, s.rear]) carWheel(parts, sx * (half - 0.12), z, s.wheel, sx, style === 'police' ? '#c9cfd2' : SILVER);
  }
  // Interior seen through the glass: dark trim on the belt line, seat backs, headrests, dashboard, wheel.
  // The body's top along the windows sits OUT above the profile's belt line.
  const belt = Math.max(s.screenBase[1], s.backBase[1]) + OUT;
  const cabinLength = s.screenBase[0] - s.backBase[0];
  parts.add(box(s.width - 0.24, 0.012, cabinLength - 0.1), { at: [0, belt + 0.008, (s.screenBase[0] + s.backBase[0]) / 2], color: CABIN, finish: 'cloth' });
  const room = s.roof - 0.07 - belt;
  const rows = style === 'pickup' ? [s.seat[2] - 0.22] : [s.seat[2] - 0.22, s.seat[2] - (style === 'hatch' ? 0.9 : 1.0)];
  rows.forEach((u, row) => {
    for (const sx of row === 0 ? [-1, 1] : [0]) {
      const w = row === 0 ? 0.48 : s.width - 0.4;
      parts.add(box(w, room * 0.62, 0.1), { at: [sx * Math.abs(s.seat[0]), belt + room * 0.27, u], rot: [-0.15, 0, 0], color: '#34383c', finish: 'cloth' });
      if (row === 0) parts.add(box(0.24, room * 0.24, 0.1), { at: [sx * Math.abs(s.seat[0]), belt + room * 0.72, u - 0.05], rot: [-0.15, 0, 0], color: '#34383c', finish: 'cloth' });
    }
  });
  parts.add(box(s.width - 0.3, 0.1, 0.34), { at: [0, belt + 0.04, s.screenBase[0] - 0.2], color: CABIN });
  parts.add(new THREE.TorusGeometry(0.14, 0.022, 3, 10), { at: [s.seat[0], belt + 0.1, s.screenBase[0] - 0.4], rot: [-0.45, 0, 0], color: '#1d2022' });
  // Nose: grille, head lamps, bumper lip, number plate.
  const front = nose + OUT, back = tail - OUT;
  parts.add(box(s.width * 0.4, 0.13, 0.04), { at: [0, s.noseTop - 0.14, front], color: '#1d2022' });
  parts.add(box(s.width * 0.4, 0.015, 0.045), { at: [0, s.noseTop - 0.09, front + 0.004], color: CHROME, finish: 'chrome' });
  for (const sx of [-1, 1]) {
    parts.add(box(0.36, 0.1, 0.06), { at: [sx * (half - 0.3), s.noseTop - 0.05, front - 0.02], rot: [0, sx * 0.12, 0], color: HEAD_LAMP, finish: 'lamp' });
    parts.add(box(0.12, 0.05, 0.05), { at: [sx * (half - 0.1), s.noseTop - 0.06, front - 0.06], rot: [0, sx * 0.4, 0], color: SIGNAL, finish: 'lamp' });
    parts.add(box(0.3, 0.12, 0.05), { at: [sx * (half - 0.25), s.trunk - 0.13, back + 0.015], color: TAIL_LAMP, finish: 'lamp' });
  }
  parts.add(box(s.width - 0.1, 0.12, 0.1), { at: [0, s.clearance + 0.05, front - 0.04], color: TRIM });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, s.clearance + 0.24, front + 0.01], color: PLATE });
  // Tail: bumper lip, plate, exhaust tip.
  parts.add(box(s.width - 0.1, 0.12, 0.1), { at: [0, s.clearance + 0.05, back + 0.04], color: TRIM });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, s.clearance + 0.32, back - 0.01], color: PLATE });
  parts.add(cyl(0.035, 0.035, 0.12, 8), { at: [half - 0.35, s.clearance + 0.01, back + 0.02], rot: ALONG_Z, color: SILVER, finish: 'chrome' });

  if (style === 'police') {
    // White and blue livery with a red pinstripe, push bar, roof light bar base.
    for (const sx of [-1, 1]) {
      parts.add(box(0.012, 0.16, s.length - 0.9), { at: [sx * (half + 0.004), s.screenBase[1] - 0.26, 0.05], color: '#1f4fa8', finish: 'paint' });
      parts.add(box(0.012, 0.03, s.length - 0.9), { at: [sx * (half + 0.004), s.screenBase[1] - 0.15, 0.05], color: '#c9302c', finish: 'paint' });
    }
    parts.add(box(s.width * 0.55, 0.22, 0.06), { at: [0, s.clearance + 0.3, nose + 0.08], color: '#1d2022', finish: 'metal' });
    parts.add(box(1.0, 0.07, 0.34), { at: [0, s.roof + 0.035, (s.roofBack + s.roofFront) / 2], color: '#2a2f33' });
  } else if (style === 'taxi') {
    parts.add(box(0.62, 0.16, 0.24), { at: [0, s.roof + 0.08, (s.roofBack + s.roofFront) / 2 + 0.1], color: '#f2c94c', finish: 'lamp' });
    parts.add(box(0.64, 0.04, 0.26), { at: [0, s.roof + 0.01, (s.roofBack + s.roofFront) / 2 + 0.1], color: '#2a2f33' });
    for (const sx of [-1, 1]) parts.add(box(0.012, 0.07, s.length - 1.2), { at: [sx * (half + 0.004), s.screenBase[1] - 0.2, 0.0], color: '#f2c94c', finish: 'paint' });
  } else if (style === 'suv') {
    for (const sx of [-1, 1]) parts.add(box(0.04, 0.04, s.roofFront - s.roofBack - 0.1), { at: [sx * (half - 0.2), s.roof + 0.04, (s.roofBack + s.roofFront) / 2], color: TRIM, finish: 'metal' });
    parts.add(box(s.width - 0.2, 0.06, 0.4), { at: [0, s.clearance + 0.02, nose - 0.3], color: SILVER, finish: 'metal' });
  } else if (style === 'pickup') {
    // Tonneau cover over the bed, bed rails and the cab's back wall.
    const bedLength = s.backBase[0] - tail - 0.1;
    parts.add(box(s.width - 0.2, 0.03, bedLength - 0.1), { at: [0, s.trunk + 0.015, tail + 0.05 + bedLength / 2], color: '#2a2e31' });
    for (const sx of [-1, 1]) parts.add(box(0.06, 0.05, bedLength), { at: [sx * (half - 0.05), s.trunk + 0.02, tail + 0.05 + bedLength / 2], color: TRIM });
  }
}

/** A car body (everything but its glass). */
export function carGeometry(style: CarStyle, paint?: THREE.ColorRepresentation) {
  const parts = new ModelParts();
  carBody(parts, style);
  return parts.build(paint);
}

/** The glass volume of a car's cabin. */
export function carGlassGeometry(style: CarStyle) {
  const s = CAR_SPECS[style];
  const parts = new ModelParts();
  parts.add(sideExtrude(cabinShape(s), s.width - 0.2, 0.03), { color: '#ffffff', finish: 'glass' });
  return parts.build();
}

// ---- Fleet: buses, trucks and Sài Gòn work vehicles ------------------------------------------------------

/**
 * The working fleet: a 12 m city bus, a 29-seat xe khách (inter-district coach), a light truck with a cargo box,
 * a tow truck, a ba gác (three-wheel cargo motorbike), a xích lô (cyclo) and a garbage push-cart. Same
 * conventions as the cars (nose toward +z, wheels on y = 0, one merged geometry; painted panels stay white for
 * the instance colour unless `paint` is given, and FLEET[kind].paint is the usual livery). In model space +x
 * is the vehicle's left, the driver's side in Vietnam, and -x its right: the curb side in right-hand traffic,
 * where the bus doors are.
 */
export type FleetKind = 'bus' | 'coach' | 'truck' | 'tow' | 'bagac' | 'cyclo' | 'trashcart';
/**
 * Where a person meets a vehicle: hip joint, height of the seat top (0 when standing), left and right foot
 * (the pedals at crank angle 0 for 'pedal') and left and right hand.
 */
export type FleetSeat = { hip: Vec3; top: number; feet: [Vec3, Vec3]; hands?: [Vec3, Vec3]; pose: 'sit' | 'ride' | 'pedal' | 'stand' | 'push' };
/** A way in: the sill or step on the body (`side` -1 right, +1 left, 0 front or back) and its width. */
export type FleetDoor = { kind: 'front' | 'middle' | 'driver' | 'passenger' | 'rear' | 'bed'; at: Vec3; side: -1 | 0 | 1; width: number };
/** One axle: position along the body, wheel radius, track (centre to centre, 0 for a single wheel), tyre width. */
export type FleetAxle = { z: number; r: number; track: number; tread: number; dual: boolean; steer: boolean };
export type FleetSpec = {
  length: number; width: number; height: number; wheelbase: number; axles: FleetAxle[];
  /** Collision half-width and half-length (every body is centred on the origin). */
  hw: number; hl: number; mass: number;
  /** Usual colour of the painted panels. */
  paint: string;
  driver: FleetSeat; passengers: FleetSeat[]; doors: FleetDoor[];
  /** Where someone stands to get on: on the ground outside the main door. */
  board: Vec3;
  /** The load space: middle of its floor and its size (x, y, z). */
  cargo?: { at: Vec3; size: Vec3 };
  /** Tow truck: where a towed car's lifted wheels sit. */
  hitch?: Vec3;
  /** Xích lô: crank axle and crank length. */
  pedals?: { crank: Vec3; r: number };
};
export type FleetLoad = 'none' | 'mixed' | 'sacks' | 'crates' | 'water';
export type FleetOptions = {
  /** Bakes the painted panels in this colour (else white, for instance colours). */
  paint?: THREE.ColorRepresentation;
  /** Bus line number on the LED boards ('03'). */
  route?: string;
  /** Bus and coach doors drawn open. */
  doorsOpen?: boolean;
  /** Goods on a ba gác bed or a coach roof rack. */
  load?: FleetLoad;
  /** Light truck body: closed aluminium box or a tarp over a frame. */
  cargo?: 'box' | 'tarp';
  /** Xích lô folding hood up (default) or folded down. */
  hood?: boolean;
  /** False leaves the wheels out (for spinning wheels from fleetWheelGeometry). */
  wheels?: boolean;
};

const seat = (hip: Vec3, top: number, feet: [Vec3, Vec3], pose: FleetSeat['pose'], hands?: [Vec3, Vec3]): FleetSeat => ({ hip, top, feet, hands, pose });
/** A left and right point mirrored across the centre line. */
const pair = (x: number, y: number, z: number): [Vec3, Vec3] => [[x, y, z], [-x, y, z]];
/** A seat at (x, z) whose hip is `hip` high, feet `reach` ahead on a floor at `floor`. */
const bench = (x: number, z: number, hip: number, floor: number, reach: number) => seat([x, hip, z], hip - 0.08, [[x + 0.1, floor, z + reach], [x - 0.1, floor, z + reach]], 'sit');
const axle = (z: number, r: number, track: number, tread: number, dual = false, steer = false): FleetAxle => ({ z, r, track, tread, dual, steer });
/** A round tube of radius r from a to b (ModelParts.rod scales its radius by r a second time). */
const tube = (parts: ModelParts, a: Vec3, b: Vec3, r: number, o: PartOptions = {}, segments = 6) => parts.add(new THREE.CylinderGeometry(1, 1, 1, segments), { ...o, matrix: between(a, b, r, r) });

export const FLEET: Record<FleetKind, FleetSpec> = {
  bus: {
    length: 12, width: 2.5, height: 3.24, wheelbase: 6, axles: [axle(3.4, 0.5, 2.06, 0.3, false, true), axle(-2.6, 0.5, 1.84, 0.56, true)],
    hw: 1.25, hl: 6, mass: 11000, paint: '#1d8a4e',
    driver: seat([0.66, 1.1, 4.95], 1.02, [[0.76, 0.56, 5.6], [0.56, 0.56, 5.6]], 'sit', [[0.86, 1.44, 5.42], [0.46, 1.44, 5.42]]),
    passengers: [
      ...[2.2, -1.4, -2.6, -3.8].flatMap((z) => [0.85, 0.4, -0.85].map((x) => bench(x, z, 0.94, 0.4, 0.45))),
      seat([-0.3, 0.95, 0.4], 0, [[-0.18, 0.37, 0.4], [-0.42, 0.37, 0.4]], 'stand', [[-0.3, 1.9, 0.62], [-0.3, 1.9, 0.18]]),
      seat([0.3, 0.95, 1.4], 0, [[0.42, 0.37, 1.4], [0.18, 0.37, 1.4]], 'stand', [[0.3, 1.9, 1.62], [0.3, 1.9, 1.18]]),
    ],
    doors: [{ kind: 'front', at: [-1.25, 0.37, 4.8], side: -1, width: 1.1 }, { kind: 'middle', at: [-1.25, 0.37, 0.4], side: -1, width: 1.2 }],
    board: [-1.85, 0, 4.8],
  },
  coach: {
    length: 7.1, width: 2.04, height: 3.36, wheelbase: 4.1, axles: [axle(2.25, 0.37, 1.66, 0.24, false, true), axle(-1.85, 0.37, 1.5, 0.42, true)],
    hw: 1.02, hl: 3.55, mass: 5600, paint: '#1d5fb8',
    driver: seat([0.48, 1.12, 2.62], 1.04, [[0.58, 0.58, 3.25], [0.38, 0.58, 3.25]], 'sit', [[0.66, 1.42, 3.05], [0.3, 1.42, 3.05]]),
    passengers: [1.55, 0.7, -0.15, -1.0, -1.85, -2.7].flatMap((z) => [0.66, -0.66].map((x) => bench(x, z, 1.1, 0.62, 0.42))),
    doors: [{ kind: 'front', at: [-1.02, 0.42, 1.38], side: -1, width: 0.76 }],
    board: [-1.55, 0, 1.38],
    cargo: { at: [0, 2.86, -0.5], size: [1.7, 0.5, 5.2] },
  },
  truck: {
    length: 5.4, width: 1.86, height: 2.56, wheelbase: 2.78, axles: [axle(1.68, 0.34, 1.44, 0.2, false, true), axle(-1.1, 0.34, 1.36, 0.38, true)],
    hw: 0.93, hl: 2.7, mass: 3300, paint: '#2a5cb0',
    driver: seat([0.42, 1.18, 1.82], 1.1, [[0.5, 0.8, 2.32], [0.34, 0.8, 2.32]], 'sit', [[0.6, 1.5, 2.18], [0.24, 1.5, 2.18]]),
    passengers: [seat([-0.42, 1.18, 1.82], 1.1, [[-0.34, 0.8, 2.32], [-0.5, 0.8, 2.32]], 'sit')],
    doors: [{ kind: 'driver', at: [0.86, 0.62, 1.82], side: 1, width: 0.9 }, { kind: 'passenger', at: [-0.86, 0.62, 1.82], side: -1, width: 0.9 }, { kind: 'rear', at: [0, 0.84, -2.7], side: 0, width: 1.7 }],
    board: [1.3, 0, 1.82],
    cargo: { at: [0, 0.84, -0.96], size: [1.76, 1.66, 3.48] },
  },
  tow: {
    length: 6, width: 1.86, height: 2.72, wheelbase: 2.9, axles: [axle(1.95, 0.34, 1.44, 0.2, false, true), axle(-0.95, 0.34, 1.36, 0.38, true)],
    hw: 0.93, hl: 3, mass: 3800, paint: '#f0b323',
    driver: seat([0.42, 1.18, 2.12], 1.1, [[0.5, 0.8, 2.62], [0.34, 0.8, 2.62]], 'sit', [[0.6, 1.5, 2.48], [0.24, 1.5, 2.48]]),
    passengers: [seat([-0.42, 1.18, 2.12], 1.1, [[-0.34, 0.8, 2.62], [-0.5, 0.8, 2.62]], 'sit')],
    doors: [{ kind: 'driver', at: [0.86, 0.62, 2.12], side: 1, width: 0.9 }, { kind: 'passenger', at: [-0.86, 0.62, 2.12], side: -1, width: 0.9 }],
    board: [1.3, 0, 2.12],
    hitch: [0, 0.42, -2.85],
  },
  bagac: {
    length: 3.32, width: 1.32, height: 1.37, wheelbase: 2.12, axles: [axle(1.32, 0.29, 0, 0.09, false, true), axle(-0.8, 0.28, 1.0, 0.11)],
    hw: 0.66, hl: 1.66, mass: 380, paint: '#c7362f',
    driver: seat([0, 0.93, 0.42], 0.85, pair(0.2, 0.38, 0.66), 'ride', pair(0.34, 1.13, 0.95)),
    passengers: [seat([0.36, 0.84, -1.15], 0.76, [[0.46, 0.76, -0.75], [0.26, 0.76, -0.75]], 'sit'), seat([-0.36, 0.84, -1.15], 0.76, [[-0.26, 0.76, -0.75], [-0.46, 0.76, -0.75]], 'sit')],
    doors: [{ kind: 'bed', at: [0, 0.76, -1.6], side: 0, width: 1.3 }],
    board: [0.7, 0, 0.42],
    cargo: { at: [0, 0.76, -0.7], size: [1.28, 0.8, 1.8] },
  },
  cyclo: {
    length: 2.5, width: 1.06, height: 1.56, wheelbase: 1.63, axles: [axle(0.7, 0.32, 1.0, 0.045, false, true), axle(-0.93, 0.33, 0, 0.045)],
    hw: 0.53, hl: 1.25, mass: 70, paint: '#24508f',
    driver: seat([0, 1.1, -0.62], 1.02, [[0.16, 0.32, -0.04], [-0.16, 0.32, -0.36]], 'pedal', pair(0.3, 0.98, 0.1)),
    passengers: [seat([0, 0.6, 0.47], 0.52, pair(0.12, 0.27, 1.06), 'sit', pair(0.3, 0.76, 0.62))],
    doors: [{ kind: 'front', at: [0, 0.26, 1.24], side: 0, width: 0.6 }],
    board: [0, 0, 1.55],
    pedals: { crank: [0, 0.32, -0.2], r: 0.16 },
  },
  trashcart: {
    length: 2.0, width: 1.06, height: 1.36, wheelbase: 0, axles: [axle(0.25, 0.33, 1.0, 0.06)],
    hw: 0.53, hl: 1.0, mass: 120, paint: '#e8762a',
    driver: seat([0, 0.95, -1.38], 0, pair(0.15, 0, -1.42), 'push', pair(0.3, 1.0, -1.02)),
    passengers: [],
    doors: [],
    board: [0, 0, -1.45],
    cargo: { at: [0, 0.45, 0.25], size: [0.8, 0.7, 1.34] },
  },
};

const CREAM = '#f1ede0';
const DARK_GLASS = '#587582';
const LED = '#ffb21c';
const AMBER = '#ffae2b';

/** A truck or bus wheel at x on side `side` (±1): tyre, steel rim and hub on the outer face. */
function bigWheel(parts: ModelParts, x: number, z: number, r: number, tread: number, side: number, rim = SILVER) {
  if (!drawWheels) return;
  parts.add(cyl(r, r, tread, 12), { at: [x, r, z], rot: ALONG_X, color: RUBBER, finish: 'rubber', smooth: true });
  parts.add(cyl(r * 0.62, r * 0.62, 0.02, 10), { at: [x + side * (tread / 2 + 0.006), r, z], rot: ALONG_X, color: rim, finish: 'chrome' });
  parts.add(cyl(r * 0.22, r * 0.26, 0.07, 8), { at: [x + side * (tread / 2 + 0.035), r, z], rot: ALONG_X, color: DARK_METAL, finish: 'metal' });
}
/** Every wheel of a four-wheeled fleet vehicle, from its axle table. */
function fleetWheels(parts: ModelParts, kind: FleetKind) {
  for (const a of FLEET[kind].axles) for (const s of [-1, 1]) bigWheel(parts, (s * a.track) / 2, a.z, a.r, a.tread, s, a.dual ? '#8f979a' : SILVER);
}

/** Seven-segment patterns of the digits 0-9. */
const SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
/**
 * LED digits on a destination board: `at` is the middle of the text, `u` the reading direction (x, z) as seen
 * by someone facing the board, `h` the digit height.
 */
function ledDigits(parts: ModelParts, text: string, at: Vec3, u: [number, number], h: number) {
  const w = h * 0.52, t = h * 0.14, pitch = w + h * 0.3, yaw = Math.atan2(-u[1], u[0]);
  [...text].forEach((ch, i) => {
    const on = SEGMENTS[ch.charCodeAt(0) - 48] ?? 'g', cu = (i - (text.length - 1) / 2) * pitch;
    const seg = (du: number, dv: number, flat: boolean) => parts.add(box(flat ? w - t * 0.6 : t, flat ? t : h / 2 - t * 0.4, 0.02), {
      at: [at[0] + u[0] * (cu + du), at[1] + dv, at[2] + u[1] * (cu + du)], rot: [0, yaw, 0], color: LED, finish: 'lamp',
    });
    if (on.includes('a')) seg(0, h / 2 - t / 2, true);
    if (on.includes('g')) seg(0, 0, true);
    if (on.includes('d')) seg(0, -h / 2 + t / 2, true);
    if (on.includes('b')) seg(w / 2 - t / 2, h / 4, false);
    if (on.includes('c')) seg(w / 2 - t / 2, -h / 4, false);
    if (on.includes('f')) seg(-w / 2 + t / 2, h / 4, false);
    if (on.includes('e')) seg(-w / 2 + t / 2, -h / 4, false);
  });
}
/** A run of LED dashes standing in for the destination name, `len` long along `u`. */
function ledText(parts: ModelParts, at: Vec3, u: [number, number], len: number, h: number) {
  const yaw = Math.atan2(-u[1], u[0]), widths = [0.7, 0.45, 0.9, 0.3, 0.6, 0.8, 0.4, 0.65, 0.5];
  const k = len / (widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 0.25);
  let c = -len / 2;
  for (const w of widths) {
    const m = c + (w * k) / 2;
    parts.add(box(w * k, h, 0.02), { at: [at[0] + u[0] * m, at[1], at[2] + u[1] * m], rot: [0, yaw, 0], color: LED, finish: 'lamp' });
    c += (w + 0.25) * k;
  }
}
/** A row of `n` windows at x between z0 and z1, from y0 to y1. */
function windowRow(parts: ModelParts, x: number, z0: number, z1: number, n: number, y0: number, y1: number, gap = 0.12) {
  const pitch = (z1 - z0) / n;
  for (let k = 0; k < n; k++) parts.add(box(0.03, y1 - y0, pitch - gap), { at: [x, (y0 + y1) / 2, z0 + pitch * (k + 0.5)], color: DARK_GLASS, finish: 'glass' });
}
/** Reverses a geometry's winding so its inside renders (the inner skin of a hood). */
function flipped(g: THREE.BufferGeometry) {
  const index = g.index!;
  for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b); }
  return g;
}

/**
 * A bus door on the right side (-x) centred at z: closed, two glazed leaves; open, the leaves swung out on
 * their hinges, showing the lit doorway, the step and the grab pole.
 */
function busDoor(parts: ModelParts, half: number, z: number, w: number, top: number, open: boolean) {
  const x = -(half + 0.006), sill = 0.38;
  if (open) {
    parts.add(box(0.02, top - sill, w), { at: [x, (top + sill) / 2, z], color: '#22272a' });
    parts.add(box(0.03, 0.05, w - 0.25), { at: [x - 0.01, top - 0.1, z], color: HEAD_LAMP, finish: 'lamp' });
    parts.add(box(0.32, 0.07, w - 0.06), { at: [x - 0.12, sill, z], color: '#8c9396', finish: 'metal' });
    for (const s of [-1, 1]) parts.add(box(0.33, 0.02, 0.05), { at: [x - 0.12, sill + 0.045, z + s * (w / 2 - 0.06)], color: '#f2c230' });
    tube(parts, [x - 0.05, sill + 0.05, z + w / 2 - 0.14], [x - 0.05, top - 0.15, z + w / 2 - 0.14], 0.022, { color: '#f2c230', finish: 'paint' });
    for (const s of [-1, 1]) {
      // Each leaf swings 80 degrees out about the hinge at its edge of the doorway.
      const hz = z + s * (w / 2), a = 1.4, dx = -Math.sin(a), dz = -s * Math.cos(a), l = w / 2 - 0.02, yaw = Math.atan2(dx, dz);
      parts.add(box(0.035, top - sill - 0.1, l), { at: [x + (dx * l) / 2, (top + sill) / 2, hz + (dz * l) / 2], rot: [0, yaw, 0], color: TRIM });
      parts.add(box(0.045, (top - sill) * 0.62, l - 0.1), { at: [x + (dx * l) / 2, (top + sill) / 2 + 0.2, hz + (dz * l) / 2], rot: [0, yaw, 0], color: DARK_GLASS, finish: 'glass' });
    }
  } else {
    for (const s of [-1, 1]) {
      parts.add(box(0.03, top - sill - 0.04, w / 2 - 0.015), { at: [x - 0.006, (top + sill) / 2, z + (s * w) / 4], color: TRIM });
      parts.add(box(0.012, (top - sill) * 0.64, w / 2 - 0.12), { at: [x - 0.025, (top + sill) / 2 + 0.22, z + (s * w) / 4], color: DARK_GLASS, finish: 'glass' });
    }
    parts.add(box(0.035, top - sill, 0.02), { at: [x - 0.01, (top + sill) / 2, z], color: RUBBER, finish: 'rubber' });
  }
  // The door lamp above the opening.
  parts.add(box(0.03, 0.05, 0.16), { at: [x - 0.012, top + 0.07, z], color: AMBER, finish: 'lamp' });
}

/** Rabbit-ear mirrors: arms from the front roof corners curving forward to mirrors hanging in front of the cab. */
function busMirrors(parts: ModelParts, half: number, nose: number, top: number, drop: number) {
  for (const s of [-1, 1]) {
    const root: Vec3 = [s * (half - 0.08), top, nose - 0.2], elbow: Vec3 = [s * (half + 0.16), top + 0.08, nose + 0.22], foot: Vec3 = [s * (half + 0.18), top - drop + 0.3, nose + 0.32];
    tube(parts, root, elbow, 0.025, { color: TRIM, finish: 'metal' });
    tube(parts, elbow, foot, 0.025, { color: TRIM, finish: 'metal' });
    parts.add(box(0.07, 0.42, 0.24), { at: [foot[0], foot[1] - 0.2, foot[2] + 0.02], rot: [0, s * 0.35, 0], color: TRIM });
    parts.add(box(0.012, 0.36, 0.2), { at: [foot[0] - s * 0.01, foot[1] - 0.2, foot[2] - 0.08], rot: [0, s * 0.35, 0], color: '#95a7ad', finish: 'glass' });
  }
}

/** Sài Gòn city bus: a green and white low-floor 12 m body, two curbside doors, LED route boards front, side and back. */
function bus(parts: ModelParts, o: FleetOptions) {
  const half = 1.25, nose = 6, tail = -6, base = 0.32, roof = 3.0, r = 0.5, arch = r + 0.1, route = o.route ?? '03';
  const shape = new THREE.Shape();
  shape.moveTo(tail + 0.15, base);
  for (const z of [-2.6, 3.4]) { shape.lineTo(z - arch, base); shape.lineTo(z - arch, r); shape.absarc(z, r, arch, Math.PI, 0, true); shape.lineTo(z + arch, base); }
  shape.lineTo(nose - 0.15, base);
  shape.quadraticCurveTo(nose, base, nose, base + 0.15);
  shape.lineTo(nose - 0.04, roof - 0.18);
  shape.quadraticCurveTo(nose - 0.06, roof, nose - 0.3, roof);
  shape.lineTo(tail + 0.3, roof);
  shape.quadraticCurveTo(tail, roof, tail, roof - 0.25);
  shape.lineTo(tail, base + 0.15);
  shape.quadraticCurveTo(tail, base, tail + 0.15, base);
  parts.add(sideExtrude(shape, 2 * half, 0.1), { paint: true });
  const side = half + 0.014, front = nose + 0.03, back = tail - 0.03;
  // A white band round the windows over a yellow pinstripe, a white roof and a dark skirt between the wheels.
  for (const sx of [-1, 1]) {
    parts.add(box(0.02, 1.52, 11.4), { at: [sx * side, 1.99, -0.15], color: CREAM });
    parts.add(box(0.022, 0.07, 11.4), { at: [sx * (side + 0.002), 1.19, -0.15], color: '#f4c63a' });
    for (const [z0, z1] of [[-5.85, -3.25], [-1.95, 2.75], [4.05, 5.85]]) parts.add(box(0.03, 0.12, z1 - z0), { at: [sx * (side - 0.004), base + 0.08, (z0 + z1) / 2], color: TRIM });
  }
  parts.add(box(2 * half - 0.1, 0.03, 11.5), { at: [0, roof + 0.015, -0.1], color: CREAM });
  parts.add(box(2 * half - 0.3, 0.4, 0.02), { at: [0, roof - 0.42, back], color: CREAM });
  // Windows: the driver's side runs nose to tail; the curb side breaks for the two doors.
  const wy0 = 1.34, wy1 = 2.62, doorTop = 2.66;
  windowRow(parts, side + 0.01, -5.55, 4.25, 7, wy0, wy1);
  windowRow(parts, side + 0.01, 4.3, 5.7, 1, wy0 + 0.12, wy1);
  windowRow(parts, -(side + 0.01), -5.55, -0.35, 4, wy0, wy1);
  windowRow(parts, -(side + 0.01), 1.15, 4.1, 2, wy0, wy1);
  windowRow(parts, -(side + 0.01), 5.45, 5.75, 1, wy0 + 0.12, wy1, 0.06);
  busDoor(parts, half, 4.8, 1.1, doorTop, !!o.doorsOpen);
  busDoor(parts, half, 0.4, 1.2, doorTop, !!o.doorsOpen);
  // Route number board behind the first curbside window.
  parts.add(box(0.03, 0.26, 0.62), { at: [-(side + 0.03), 2.38, 3.7], color: '#111314' });
  ledDigits(parts, route, [-(side + 0.05), 2.38, 3.7], [0, 1], 0.17);
  // Front: one big windshield with a centre post, the LED destination board, lamps low on the face.
  parts.add(box(2 * half - 0.26, 1.58, 0.04), { at: [0, 1.85, front], color: DARK_GLASS, finish: 'glass' });
  parts.add(box(0.05, 1.58, 0.05), { at: [0, 1.85, front + 0.005], color: TRIM });
  parts.add(box(2 * half - 0.2, 0.32, 0.06), { at: [0, 2.82, front - 0.01], color: '#111314' });
  ledDigits(parts, route, [-0.72, 2.82, front + 0.025], [1, 0], 0.22);
  ledText(parts, [0.32, 2.82, front + 0.025], [1, 0], 1.3, 0.1);
  for (const sx of [-1, 1]) {
    tube(parts, [sx * 0.08, 1.12, front + 0.03], [sx * 0.62, 1.6, front + 0.03], 0.012, { color: TRIM });
    parts.add(box(0.46, 0.15, 0.05), { at: [sx * 0.82, 0.8, front], color: HEAD_LAMP, finish: 'lamp' });
    parts.add(box(0.15, 0.13, 0.05), { at: [sx * 1.12, 0.8, front - 0.01], color: SIGNAL, finish: 'lamp' });
    parts.add(box(0.2, 0.08, 0.05), { at: [sx * 0.82, 0.62, front], color: '#f6f2e4', finish: 'lamp' });
  }
  parts.add(box(2 * half - 0.05, 0.3, 0.14), { at: [0, base + 0.17, nose + 0.02], color: TRIM });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, base + 0.2, nose + 0.1], color: PLATE });
  busMirrors(parts, half, nose, roof - 0.35, 1.0);
  // Back: engine grille, a small window, the route board, tall tail lamps, bumper and plate.
  parts.add(box(1.7, 0.62, 0.03), { at: [0, 1.25, back], color: '#2d3236' });
  for (let k = 0; k < 5; k++) parts.add(box(1.62, 0.03, 0.03), { at: [0, 1.0 + k * 0.12, back - 0.02], color: '#5c6366', finish: 'metal' });
  parts.add(box(1.7, 0.62, 0.04), { at: [0, 2.12, back], color: DARK_GLASS, finish: 'glass' });
  parts.add(box(0.62, 0.26, 0.04), { at: [0, 2.72, back - 0.01], color: '#111314' });
  ledDigits(parts, route, [0, 2.72, back - 0.035], [-1, 0], 0.17);
  for (const sx of [-1, 1]) {
    parts.add(box(0.16, 0.62, 0.05), { at: [sx * 1.06, 1.02, back], color: TAIL_LAMP, finish: 'lamp' });
    parts.add(box(0.16, 0.16, 0.05), { at: [sx * 1.06, 1.45, back], color: SIGNAL, finish: 'lamp' });
  }
  parts.add(box(2 * half - 0.05, 0.3, 0.14), { at: [0, base + 0.17, tail - 0.02], color: TRIM });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, base + 0.42, tail - 0.1], color: PLATE });
  // Roof: the air-conditioning pod and two hatches.
  parts.add(box(1.7, 0.2, 3.3), { at: [0, roof + 0.11, 1.4], color: '#d6dad8', finish: 'metal' });
  parts.add(box(1.5, 0.05, 3.0), { at: [0, roof + 0.23, 1.4], color: '#b9bec0', finish: 'metal' });
  for (const z of [-2.4, -4.4]) parts.add(box(0.62, 0.06, 0.62), { at: [0, roof + 0.03, z], color: '#c9cdcc' });
  fleetWheels(parts, 'bus');
}

/** Xe khách: a 29-seat white minibus with the operator's swoosh, tinted windows, a roof rack and a rear ladder. */
function coach(parts: ModelParts, o: FleetOptions) {
  const half = 1.02, nose = 3.55, tail = -3.55, base = 0.32, roof = 2.72, r = 0.37, arch = r + 0.09;
  const shape = new THREE.Shape();
  shape.moveTo(tail + 0.12, base);
  for (const z of [-1.85, 2.25]) { shape.lineTo(z - arch, base); shape.lineTo(z - arch, r); shape.absarc(z, r, arch, Math.PI, 0, true); shape.lineTo(z + arch, base); }
  shape.lineTo(nose - 0.12, base);
  shape.quadraticCurveTo(nose, base, nose, base + 0.14);
  shape.lineTo(nose, 0.98);
  shape.lineTo(nose - 0.24, 2.46);
  shape.quadraticCurveTo(nose - 0.3, roof, nose - 0.6, roof);
  shape.lineTo(tail + 0.2, roof);
  shape.quadraticCurveTo(tail, roof, tail, roof - 0.18);
  shape.lineTo(tail, base + 0.12);
  shape.quadraticCurveTo(tail, base, tail + 0.12, base);
  parts.add(sideExtrude(shape, 2 * half, 0.09), { color: '#f4f3ee' });
  const side = half + 0.014, back = tail - 0.03, lean = Math.atan2(0.24, 1.48);
  // Tinted window band (the curb side leaves room for the door) and the operator's swoosh sweeping up at the back.
  for (const sx of [-1, 1]) {
    windowRow(parts, sx * (side + 0.008), -3.2, sx > 0 ? 2.75 : 0.95, sx > 0 ? 6 : 4, 1.42, 2.36, 0.07);
    parts.add(box(0.02, 0.16, 4.6), { at: [sx * side, 1.0, 0.65], paint: true });
    parts.add(box(0.02, 0.06, 4.6), { at: [sx * side, 1.2, 0.65], paint: true });
    parts.add(box(0.02, 0.16, 1.9), { at: [sx * side, 1.2, -2.42], rot: [0.22, 0, 0], paint: true });
    parts.add(box(0.02, 0.06, 1.75), { at: [sx * side, 1.42, -2.4], rot: [0.22, 0, 0], paint: true });
    parts.add(box(0.03, 0.1, 6.6), { at: [sx * (side - 0.004), base + 0.06, 0.1], color: '#9aa1a4' });
  }
  windowRow(parts, -(side + 0.008), 1.83, 2.75, 1, 1.42, 2.36, 0.07);
  // The door: a glazed leaf, or the open doorway with its step and the leaf swung forward.
  const dz = 1.38, dw = 0.76;
  if (o.doorsOpen) {
    parts.add(box(0.02, 2.0, dw), { at: [-(side - 0.004), 1.4, dz], color: '#3b4247' });
    parts.add(box(0.3, 0.06, dw - 0.06), { at: [-(side + 0.1), 0.44, dz], color: '#8c9396', finish: 'metal' });
    parts.add(box(0.035, 1.95, dw - 0.04), { at: [-(side + 0.16), 1.4, dz + dw - 0.06], rot: [0, 0.35, 0], color: '#f4f3ee' });
    parts.add(box(0.04, 0.95, dw - 0.18), { at: [-(side + 0.17), 1.85, dz + dw - 0.06], rot: [0, 0.35, 0], color: DARK_GLASS, finish: 'glass' });
  } else {
    parts.add(box(0.03, 1.98, dw), { at: [-(side + 0.004), 1.4, dz], color: '#e2e1dc' });
    parts.add(box(0.035, 0.95, dw - 0.14), { at: [-(side + 0.006), 1.86, dz], color: DARK_GLASS, finish: 'glass' });
  }
  parts.add(box(0.03, 0.04, 0.12), { at: [-(side + 0.02), 1.3, dz + dw / 2 - 0.1], color: CHROME, finish: 'chrome' });
  for (const z of [2.72, 3.36]) parts.add(box(0.006, 1.3, 0.012), { at: [side + 0.004, 1.1, z], color: '#5d6264' });
  // Front: raked windshield with a route placard, grille, lamps, bumper, rabbit-ear mirrors.
  parts.add(box(2 * half - 0.2, 1.48, 0.04), { at: [0, 1.72, nose - 0.09], rot: [-lean, 0, 0], color: DARK_GLASS, finish: 'glass' });
  parts.add(box(0.62, 0.2, 0.02), { at: [-0.5, 1.12, nose + 0.02], rot: [-lean, 0, 0], color: '#f6f6f2' });
  parts.add(box(0.5, 0.05, 0.02), { at: [-0.5, 1.15, nose + 0.03], rot: [-lean, 0, 0], color: '#c9302c' });
  parts.add(box(0.9, 0.26, 0.04), { at: [0, 0.74, nose + 0.03], color: '#1d2022' });
  for (let k = 0; k < 3; k++) parts.add(box(0.88, 0.025, 0.05), { at: [0, 0.66 + k * 0.08, nose + 0.035], color: CHROME, finish: 'chrome' });
  for (const sx of [-1, 1]) {
    parts.add(box(0.34, 0.14, 0.05), { at: [sx * 0.72, 0.78, nose + 0.02], color: HEAD_LAMP, finish: 'lamp' });
    parts.add(box(0.12, 0.1, 0.05), { at: [sx * 0.95, 0.78, nose + 0.01], color: SIGNAL, finish: 'lamp' });
    parts.add(box(0.16, 0.5, 0.05), { at: [sx * 0.88, 1.15, back], color: TAIL_LAMP, finish: 'lamp' });
  }
  parts.add(box(2 * half, 0.26, 0.14), { at: [0, base + 0.13, nose + 0.03], color: '#c8ccce', finish: 'metal' });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, base + 0.16, nose + 0.11], color: PLATE });
  busMirrors(parts, half, nose - 0.3, 2.3, 0.85);
  // Back: window, bumper, plate and the ladder up to the roof rack.
  parts.add(box(1.6, 0.7, 0.04), { at: [0, 1.95, back], color: DARK_GLASS, finish: 'glass' });
  parts.add(box(2 * half, 0.26, 0.14), { at: [0, base + 0.13, tail - 0.03], color: '#c8ccce', finish: 'metal' });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, base + 0.42, tail - 0.1], color: PLATE });
  for (const sx of [0.45, 0.85]) tube(parts, [sx, 0.9, back - 0.08], [sx, roof + 0.18, back - 0.08], 0.018, { color: CHROME, finish: 'chrome' });
  for (let k = 0; k < 6; k++) tube(parts, [0.45, 1.05 + k * 0.3, back - 0.08], [0.85, 1.05 + k * 0.3, back - 0.08], 0.012, { color: CHROME, finish: 'chrome' });
  // Roof rack with luggage: boxes, a sack and a bundle under a blue tarp.
  for (const sx of [-1, 1]) {
    parts.add(box(0.04, 0.04, 5.2), { at: [sx * 0.85, roof + 0.16, -0.5], color: CHROME, finish: 'chrome' });
    for (const z of [-3.0, -1.3, 0.3, 1.9]) parts.add(box(0.03, 0.14, 0.03), { at: [sx * 0.85, roof + 0.07, z], color: CHROME, finish: 'chrome' });
  }
  for (let k = 0; k < 6; k++) parts.add(box(1.7, 0.03, 0.03), { at: [0, roof + 0.13, -2.9 + k * 0.96], color: '#aeb4b6', finish: 'metal' });
  if ((o.load ?? 'mixed') !== 'none') {
    parts.add(box(0.7, 0.36, 0.62), { at: [-0.4, roof + 0.33, -1.6], color: '#b08a5a' });
    parts.add(box(0.62, 0.3, 0.55), { at: [0.42, roof + 0.3, -1.45], color: '#c49a64' });
    parts.add(ball(10, 6), { at: [0.35, roof + 0.32, -0.6], scale: [0.4, 0.2, 0.42], color: '#e9e4d6', finish: 'cloth', smooth: true });
    parts.add(ball(10, 6), { at: [-0.4, roof + 0.35, -0.2], scale: [0.48, 0.28, 0.6], color: '#2f62a8', finish: 'cloth', smooth: true });
    parts.add(box(0.5, 0.42, 0.5), { at: [0.35, roof + 0.36, 0.5], color: '#d24a3a' });
  }
  fleetWheels(parts, 'coach');
}

/** A cab-over light truck cab (Porter style) whose front axle sits under the seats; `nose` is its front face. */
function truckCab(parts: ModelParts, nose: number, frontAxle: number, r: number) {
  const back = nose - 1.72, floor = 0.5, roof = 2.14, half = 0.86, arch = r + 0.08;
  const lift = Math.asin(Math.min(1, (floor - r) / arch));
  const shape = new THREE.Shape();
  shape.moveTo(back + 0.06, floor);
  shape.lineTo(frontAxle - arch * Math.cos(lift), floor);
  shape.absarc(frontAxle, r, arch, Math.PI - lift, lift, true);
  shape.lineTo(nose - 0.08, floor);
  shape.quadraticCurveTo(nose, floor, nose, floor + 0.1);
  shape.lineTo(nose, 1.12);
  shape.lineTo(nose - 0.2, 1.98);
  shape.quadraticCurveTo(nose - 0.24, roof, nose - 0.4, roof);
  shape.lineTo(back + 0.06, roof);
  shape.quadraticCurveTo(back, roof, back, roof - 0.08);
  shape.lineTo(back, floor + 0.06);
  shape.quadraticCurveTo(back, floor, back + 0.06, floor);
  parts.add(sideExtrude(shape, 2 * half, 0.08), { paint: true });
  const side = half + 0.012, lean = Math.atan2(0.2, 0.86);
  parts.add(box(2 * half - 0.18, 0.8, 0.04), { at: [0, 1.56, nose - 0.08], rot: [-lean, 0, 0], color: DARK_GLASS, finish: 'glass' });
  for (const sx of [-1, 1]) {
    parts.add(box(0.03, 0.56, 1.12), { at: [sx * side, 1.66, nose - 0.94], color: DARK_GLASS, finish: 'glass' });
    for (const z of [nose - 1.55, nose - 0.4]) parts.add(box(0.006, 1.42, 0.012), { at: [sx * (side + 0.004), 1.2, z], color: '#1f2224' });
    parts.add(box(0.03, 0.03, 0.14), { at: [sx * (side + 0.012), 1.26, nose - 1.38], color: CHROME, finish: 'chrome' });
    // Step under the door, a mirror on a bent arm.
    parts.add(box(0.2, 0.05, 0.42), { at: [sx * (half - 0.02), 0.42, nose - 0.86], color: TRIM, finish: 'metal' });
    tube(parts, [sx * side, 1.55, nose - 0.32], [sx * (half + 0.2), 1.64, nose - 0.16], 0.016, { color: TRIM, finish: 'metal' });
    tube(parts, [sx * (half + 0.2), 1.64, nose - 0.16], [sx * (half + 0.22), 1.3, nose - 0.16], 0.016, { color: TRIM, finish: 'metal' });
    parts.add(box(0.06, 0.34, 0.2), { at: [sx * (half + 0.23), 1.5, nose - 0.14], color: TRIM });
    parts.add(box(0.012, 0.3, 0.16), { at: [sx * (half + 0.2), 1.5, nose - 0.14], color: '#95a7ad', finish: 'glass' });
    // Head lamps either side of the grille, signals at the corners.
    parts.add(box(0.32, 0.16, 0.05), { at: [sx * 0.56, 0.9, nose + 0.02], color: HEAD_LAMP, finish: 'lamp' });
    parts.add(box(0.1, 0.16, 0.05), { at: [sx * 0.8, 0.9, nose + 0.01], color: SIGNAL, finish: 'lamp' });
  }
  parts.add(box(0.72, 0.2, 0.04), { at: [0, 0.9, nose + 0.025], color: '#1d2022' });
  for (let k = 0; k < 3; k++) parts.add(box(0.7, 0.02, 0.045), { at: [0, 0.84 + k * 0.06, nose + 0.03], color: '#5b6163', finish: 'metal' });
  parts.add(box(2 * half - 0.04, 0.2, 0.14), { at: [0, 0.56, nose + 0.04], color: TRIM });
  parts.add(box(0.52, 0.12, 0.015), { at: [0, 0.6, nose + 0.115], color: PLATE });
  // The chassis rails run from under the cab to the tail.
  for (const sx of [-1, 1]) parts.add(box(0.08, 0.18, 5.2), { at: [sx * 0.4, 0.62, nose - 2.7], color: '#26292b', finish: 'metal' });
  return back;
}

/** Xe tải nhẹ: a blue cab-over light truck with an aluminium box (or a tarp over a frame) and red-white tape. */
function truck(parts: ModelParts, o: FleetOptions) {
  const s = FLEET.truck, nose = 2.6, tail = -2.7;
  const back = truckCab(parts, nose, s.axles[0].z, s.axles[0].r);
  const z0 = back - 0.08, len = z0 - tail, mid = (z0 + tail) / 2, half = 0.93, floor = 0.84, top = 2.56;
  parts.add(box(2 * half, 0.1, len), { at: [0, floor - 0.05, mid], color: '#3a3f42', finish: 'metal' });
  if ((o.cargo ?? 'box') === 'box') {
    parts.add(box(2 * half, top - floor, len), { at: [0, (top + floor) / 2, mid], color: '#cfd4d6', finish: 'metal' });
    for (const sx of [-1, 1]) {
      for (let k = 1; k < 8; k++) parts.add(box(0.025, top - floor - 0.12, 0.05), { at: [sx * (half + 0.012), (top + floor) / 2, tail + (len * k) / 8], color: '#aeb5b8', finish: 'metal' });
      parts.add(box(0.03, 0.08, len), { at: [sx * (half + 0.012), top - 0.04, mid], color: '#9aa1a4', finish: 'metal' });
    }
    // Rear doors: two leaves, lock bars with handles.
    parts.add(box(0.02, top - floor - 0.1, 0.02), { at: [0, (top + floor) / 2, tail - 0.012], color: '#5d6466' });
    for (const x of [-0.62, -0.28, 0.28, 0.62]) {
      tube(parts, [x, floor + 0.08, tail - 0.03], [x, top - 0.08, tail - 0.03], 0.014, { color: CHROME, finish: 'chrome' });
      parts.add(box(0.05, 0.16, 0.04), { at: [x + 0.05, floor + 0.62, tail - 0.05], color: SILVER, finish: 'chrome' });
    }
  } else {
    // Mui bạt: low drop sides in the cab colour, then a green tarp lashed over hoops.
    parts.add(box(2 * half, 0.42, len), { at: [0, floor + 0.21, mid], paint: true });
    parts.add(box(2 * half - 0.04, top - floor - 0.62, len - 0.04), { at: [0, (top + floor + 0.22) / 2, mid], color: '#2f5a3a', finish: 'cloth' });
    parts.add(new THREE.CylinderGeometry(half - 0.02, half - 0.02, len - 0.04, 8, 1, false, -Math.PI / 2, Math.PI), { at: [0, top - 0.2, mid], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.22], color: '#2f5a3a', finish: 'cloth' });
    for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) parts.add(box(0.02, top - floor - 0.62, 0.02), { at: [sx * (half - 0.01), (top + floor + 0.22) / 2, tail + 0.3 + (k * (len - 0.6)) / 4], color: '#1f2a22' });
  }
  // Red-white reflective tape, side guards, mud flaps, tail lamps and the rear plate.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) parts.add(box(0.03, 0.06, len / 8 - 0.02), { at: [sx * (half + 0.02), floor + 0.12, tail + (len * (k + 0.5)) / 8], color: k % 2 ? '#f2f2ee' : '#d0302a', finish: 'lamp' });
    parts.add(box(0.04, 0.08, 1.2), { at: [sx * (half - 0.04), 0.52, -0.1], color: '#d9dcda' });
    parts.add(box(0.36, 0.42, 0.02), { at: [sx * 0.68, 0.3, -1.62], color: RUBBER, finish: 'rubber' });
    parts.add(box(0.2, 0.1, 0.05), { at: [sx * 0.7, 0.62, tail - 0.03], color: TAIL_LAMP, finish: 'lamp' });
  }
  parts.add(box(1.5, 0.1, 0.08), { at: [0, 0.48, tail + 0.05], color: '#d9dcda' });
  parts.add(box(0.33, 0.165, 0.015), { at: [0, 0.6, tail - 0.01], color: PLATE });
  parts.add(cyl(0.18, 0.18, 0.6, 10), { at: [0.6, 0.55, 0.2], rot: ALONG_Z, color: SILVER, finish: 'metal' });
  fleetWheels(parts, 'truck');
}

/** Xe cứu hộ: the light-truck cab in yellow with a beacon bar, a flat deck, a boom with hook and a wheel lift. */
function tow(parts: ModelParts) {
  const s = FLEET.tow, nose = 2.9, tail = -2.2;
  const back = truckCab(parts, nose, s.axles[0].z, s.axles[0].r);
  const z0 = back - 0.08, len = z0 - tail, mid = (z0 + tail) / 2, half = 0.9, deck = 0.98;
  parts.add(box(2 * half, 0.14, len), { at: [0, deck - 0.07, mid], color: '#6b7276', finish: 'metal' });
  for (const sx of [-1, 1]) {
    parts.add(box(0.36, 0.36, 1.1), { at: [sx * (half - 0.2), deck - 0.34, 0.1], color: '#aeb4b6', finish: 'metal' });
    parts.add(box(0.03, 0.08, len), { at: [sx * (half + 0.01), deck - 0.07, mid], paint: true });
    parts.add(box(0.012, 0.1, 1.5), { at: [sx * 0.875, 1.02, nose - 0.86], color: '#c9302c' });
  }
  // Amber beacon bar on the cab roof.
  parts.add(box(1.2, 0.08, 0.26), { at: [0, 2.2, back + 0.6], color: '#2a2f33' });
  for (const sx of [-1, 1]) parts.add(box(0.42, 0.12, 0.22), { at: [sx * 0.34, 2.3, back + 0.6], color: AMBER, finish: 'lamp' });
  // Boom: turret, raked arm and its ram, the sheave, the cable and hook.
  const pivot: Vec3 = [0, 1.55, -0.75], tip: Vec3 = [0, 2.55, -2.45];
  parts.add(box(0.7, 0.62, 0.7), { at: [0, deck + 0.31, -0.75], paint: true });
  parts.beam(pivot, tip, 0.2, 0.26, { paint: true });
  tube(parts, [0, deck + 0.3, -0.37], [0, 2.02, -1.68], 0.06, { color: '#2c3033', finish: 'metal' });
  tube(parts, [0, 1.86, -1.48], [0, 2.1, -1.84], 0.038, { color: CHROME, finish: 'chrome' });
  parts.add(cyl(0.16, 0.16, 0.12, 10), { at: [tip[0], tip[1], tip[2] - 0.08], rot: ALONG_X, color: '#2c3033', finish: 'metal' });
  tube(parts, [0, tip[1] - 0.1, tip[2] - 0.2], [0, 1.25, tip[2] - 0.2], 0.02, { color: '#1a1c1d', finish: 'metal' }, 4);
  parts.add(new THREE.TorusGeometry(0.08, 0.02, 4, 8, Math.PI * 1.5), { at: [0, 1.17, tip[2] - 0.2], rot: [0, Math.PI / 2, 0], color: '#c9302c', finish: 'metal' });
  // Wheel lift: an arm under the deck, the cross bar and two forks.
  parts.beam([0, 0.55, tail + 0.6], [0, 0.42, tail - 0.45], 0.18, 0.14, { color: '#26292b', finish: 'metal' });
  parts.add(box(1.5, 0.12, 0.14), { at: [0, 0.4, tail - 0.45], paint: true });
  for (const sx of [-1, 1]) {
    parts.add(box(0.1, 0.07, 0.4), { at: [sx * 0.55, 0.38, tail - 0.62], color: '#26292b', finish: 'metal' });
    parts.add(box(0.07, 0.16, 0.07), { at: [sx * 0.55, 0.45, tail - 0.78], color: '#26292b', finish: 'metal' });
    parts.add(box(0.2, 0.12, 0.05), { at: [sx * 0.66, deck - 0.12, tail - 0.03], color: TAIL_LAMP, finish: 'lamp' });
  }
  // Chevrons across the back of the deck.
  for (let k = 0; k < 6; k++) parts.add(box(0.26, 0.07, 0.02), { at: [-0.75 + k * 0.3, deck - 0.07, tail - 0.012], rot: [0, 0, 0.6], color: k % 2 ? '#1d2022' : '#f0b323', finish: k % 2 ? 'plastic' : 'lamp' });
  fleetWheels(parts, 'tow');
}

/** Goods on a bed whose floor is at `y`, from z0 (front) back to z1. */
function goods(parts: ModelParts, load: FleetLoad, y: number, z0: number, z1: number) {
  if (load === 'none') return;
  const sacks = (n: number, zs: number) => {
    for (let k = 0; k < n; k++) {
      const row = k % 3, layer = Math.floor(k / 3);
      parts.add(ball(7, 4), { at: [(row - 1) * 0.4, y + 0.12 + layer * 0.2, zs - layer * 0.04 + (row % 2) * 0.05], scale: [0.21, 0.13, 0.36], color: layer ? '#e9e3d0' : '#d9d0b8', finish: 'cloth', smooth: true });
    }
  };
  const crates = (x: number, z: number, n: number, color: string) => {
    for (let k = 0; k < n; k++) {
      parts.add(box(0.5, 0.26, 0.36), { at: [x, y + 0.13 + k * 0.27, z], color, finish: 'plastic' });
      parts.add(box(0.44, 0.06, 0.37), { at: [x, y + 0.2 + k * 0.27, z], color: '#2a2a2a' });
    }
  };
  const bottles = (x: number, z: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const bx = x + (k % 2) * 0.3, bz = z - Math.floor(k / 2) * 0.3;
      parts.add(cyl(0.13, 0.13, 0.38, 8), { at: [bx, y + 0.19, bz], color: '#4f9fd8', finish: 'glass' });
      parts.add(cyl(0.04, 0.04, 0.06, 6), { at: [bx, y + 0.41, bz], color: '#1f64b5' });
    }
  };
  if (load === 'sacks') { sacks(9, z0 - 0.45); sacks(6, z0 - 1.25); }
  else if (load === 'crates') { crates(-0.28, z0 - 0.35, 3, '#d23a2f'); crates(0.28, z0 - 0.35, 3, '#2a63b8'); crates(-0.28, z0 - 0.8, 2, '#2a63b8'); crates(0.28, z0 - 0.8, 2, '#3c9a4e'); crates(0, z1 + 0.35, 1, '#d23a2f'); }
  else if (load === 'water') { bottles(-0.45, z0 - 0.25, 8); bottles(0.15, z0 - 0.25, 8); }
  else {
    sacks(6, z0 - 0.42);
    crates(-0.3, z0 - 1.15, 2, '#d23a2f');
    crates(0.28, z0 - 1.15, 1, '#2a63b8');
    bottles(0.15, z1 + 0.3, 2);
    parts.add(box(0.5, 0.42, 0.44), { at: [-0.28, y + 0.21, z1 + 0.3], color: '#b08a5a' });
  }
}

/** Ba gác: a Wave-style motorbike front pulling a flat timber bed on two wheels, with a headboard and goods. */
function bagac(parts: ModelParts, o: FleetOptions) {
  const s = FLEET.bagac, fz = s.axles[0].z, fr = s.axles[0].r, rz = s.axles[1].z, rr = s.axles[1].r, bedFront = 0.2, bedBack = -1.6, bed = 0.72;
  motoWheel(parts, [0, fr, fz], fr, 0.09, 'spoke');
  for (const sx of [-1, 1]) tube(parts, [sx * 0.065, fr, fz], [sx * 0.06, 0.98, fz - 0.17], 0.024, { color: CHROME, finish: 'chrome' });
  fender(parts, fz, fr, fr + 0.04, 0.12, 0.25, 2.0, { paint: true });
  // Headlight cowl, leg shield, underbone frame, engine and saddle.
  parts.add(box(0.48, 0.1, 0.16), { at: [0, 1.06, 0.98], paint: true });
  parts.add(ball(12, 8), { at: [0, 1.08, 1.02], scale: [0.14, 0.08, 0.13], paint: true, smooth: true });
  parts.add(ball(12, 8), { at: [0, 1.03, 1.1], scale: [0.1, 0.06, 0.05], color: HEAD_LAMP, finish: 'lamp', smooth: true });
  parts.add(box(0.44, 0.5, 0.05), { at: [0, 0.76, 0.84], rot: [-0.25, 0, 0], paint: true });
  tube(parts, [0, 1.0, 0.95], [0, 0.5, 0.62], 0.045, { paint: true });
  tube(parts, [0, 0.5, 0.62], [0, 0.55, bedFront], 0.045, { paint: true });
  parts.add(box(0.26, 0.26, 0.36), { at: [0, 0.38, 0.45], color: '#7a8083', finish: 'metal' });
  parts.add(cyl(0.08, 0.08, 0.22, 10), { at: [0, 0.37, 0.66], rot: ALONG_Z, color: '#8b9194', finish: 'metal' });
  parts.add(ball(12, 8), { at: [0, 0.68, 0.38], scale: [0.18, 0.13, 0.3], paint: true, smooth: true });
  parts.add(box(0.3, 0.07, 0.56), { at: [0, 0.82, 0.38], color: SEAT, finish: 'cloth' });
  parts.add(ball(10, 6), { at: [0, 0.855, 0.38], scale: [0.15, 0.05, 0.28], color: SEAT, finish: 'cloth', smooth: true });
  for (const sx of [-1, 1]) parts.add(cyl(0.02, 0.02, 0.12, 8), { at: [sx * 0.2, 0.38, 0.66], rot: ALONG_X, color: RUBBER, finish: 'rubber' });
  tube(parts, [-0.06, 0.3, 0.7], [-0.16, 0.3, 0.2], 0.022, { color: CHROME, finish: 'chrome' });
  parts.add(cyl(0.05, 0.045, 0.34, 8), { at: [-0.2, 0.33, 0.02], rot: ALONG_Z, color: CHROME, finish: 'chrome' });
  // Handlebar with grips, mirrors on stalks.
  tube(parts, [-0.32, 1.12, 0.95], [0.32, 1.12, 0.95], 0.016, { color: CHROME, finish: 'chrome' });
  for (const sx of [-1, 1]) {
    parts.add(cyl(0.024, 0.024, 0.12, 8), { at: [sx * 0.34, 1.13, 0.95], rot: ALONG_X, color: RUBBER, finish: 'rubber' });
    tube(parts, [sx * 0.22, 1.13, 0.95], [sx * 0.28, 1.3, 0.92], 0.012, { color: '#3a3e40', finish: 'metal' }, 4);
    parts.add(ball(8, 5), { at: [sx * 0.3, 1.33, 0.92], scale: [0.06, 0.035, 0.02], color: TRIM, smooth: true });
  }
  // Bed: steel frame and drawbar, planks, blue side rails and stakes, the tall headboard behind the rider.
  const len = bedFront - bedBack, mid = (bedFront + bedBack) / 2, rail = '#3a6fb0';
  for (const sx of [-1, 1]) {
    parts.add(box(0.06, 0.08, len), { at: [sx * 0.6, bed - 0.08, mid], color: '#2c3033', finish: 'metal' });
    parts.add(box(0.05, 0.05, len), { at: [sx * 0.63, bed + 0.24, mid], color: rail, finish: 'metal' });
    for (const z of [bedFront - 0.03, mid, bedBack + 0.03]) parts.add(box(0.05, 0.28, 0.05), { at: [sx * 0.63, bed + 0.12, z], color: rail, finish: 'metal' });
  }
  for (let k = 0; k < 6; k++) parts.add(box(1.3, 0.05, len / 6 - 0.02), { at: [0, bed - 0.02, bedBack + (len * (k + 0.5)) / 6], color: k % 2 ? '#8a6a45' : '#7a5b3a' });
  parts.add(box(0.06, 0.06, 0.6), { at: [0, bed - 0.12, bedFront + 0.12], color: '#2c3033', finish: 'metal' });
  for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) parts.add(box(0.035, 0.62, 0.035), { at: [x, bed + 0.31, bedFront + 0.02], color: rail, finish: 'metal' });
  for (const y of [0.3, 0.6]) parts.add(box(1.26, 0.035, 0.035), { at: [0, bed + y, bedFront + 0.02], color: rail, finish: 'metal' });
  // Rear axle under the bed with its springs, a tail lamp and the plate on the back rail.
  parts.add(cyl(0.035, 0.035, 1.0, 6), { at: [0, rr, rz], rot: ALONG_X, color: '#2c3033', finish: 'metal' });
  for (const sx of [-1, 1]) parts.add(box(0.05, 0.06, 0.7), { at: [sx * 0.45, bed - 0.16, rz], color: '#2c3033', finish: 'metal' });
  parts.add(box(0.14, 0.06, 0.04), { at: [-0.4, bed - 0.04, bedBack - 0.03], color: TAIL_LAMP, finish: 'lamp' });
  parts.add(box(0.2, 0.15, 0.012), { at: [0.35, bed - 0.12, bedBack - 0.04], color: PLATE });
  goods(parts, o.load ?? 'mixed', bed + 0.005, bedFront - 0.05, bedBack + 0.05);
  for (const sx of [-1, 1]) motoWheel(parts, [sx * 0.5, rr, rz], rr, 0.11, 'steel');
}

/** Xích lô: the passenger's bucket seat between two front wheels under a folding hood, the driver pedalling behind. */
function cyclo(parts: ModelParts, o: FleetOptions) {
  const s = FLEET.cyclo, fz = s.axles[0].z, fr = s.axles[0].r, rz = s.axles[1].z, rr = s.axles[1].r, crank = s.pedals!.crank;
  for (const sx of [-1, 1]) motoWheel(parts, [sx * 0.5, fr, fz], fr, 0.045, 'spoke');
  motoWheel(parts, [0, rr, rz], rr, 0.045, 'spoke');
  // Bucket: pan, red cushion, raked back, sides with chrome rails, front apron and footboard with a lamp.
  parts.add(box(0.7, 0.06, 0.62), { at: [0, 0.4, 0.55], paint: true });
  parts.add(box(0.62, 0.1, 0.5), { at: [0, 0.48, 0.55], color: '#a8232a', finish: 'cloth' });
  parts.add(box(0.7, 0.62, 0.06), { at: [0, 0.72, 0.24], rot: [-0.2, 0, 0], paint: true });
  parts.add(box(0.6, 0.48, 0.05), { at: [0, 0.74, 0.29], rot: [-0.2, 0, 0], color: '#a8232a', finish: 'cloth' });
  for (const sx of [-1, 1]) {
    parts.add(box(0.05, 0.36, 0.66), { at: [sx * 0.35, 0.58, 0.55], paint: true });
    parts.add(box(0.05, 0.12, 0.3), { at: [sx * 0.35, 0.82, 0.37], paint: true });
    tube(parts, [sx * 0.37, 0.77, 0.86], [sx * 0.37, 0.88, 0.5], 0.016, { color: CHROME, finish: 'chrome' });
    tube(parts, [sx * 0.37, 0.88, 0.5], [sx * 0.36, 1.0, 0.26], 0.016, { color: CHROME, finish: 'chrome' });
    // A mudguard over each front wheel, braced to the bucket.
    parts.add(new THREE.TorusGeometry(fr + 0.04, 0.03, 3, 10, 2.4).rotateZ(0.1), { at: [sx * 0.5, fr, fz], rot: [0, -Math.PI / 2, 0], scale: [1, 1, 1.4], paint: true });
    tube(parts, [sx * 0.36, 0.42, fz], [sx * 0.5, fr, fz], 0.018, { color: DARK_METAL, finish: 'metal' });
  }
  parts.add(box(0.7, 0.28, 0.05), { at: [0, 0.34, 0.9], rot: [0.5, 0, 0], paint: true });
  parts.add(box(0.62, 0.04, 0.3), { at: [0, 0.24, 1.08], color: '#3a3e40', finish: 'metal' });
  parts.add(box(0.64, 0.08, 0.04), { at: [0, 0.27, 1.23], paint: true });
  parts.add(box(0.6, 0.02, 0.02), { at: [0, 0.3, 1.255], color: CHROME, finish: 'chrome' });
  parts.add(cyl(0.05, 0.05, 0.04, 10), { at: [0.24, 0.3, 1.26], rot: ALONG_Z, color: HEAD_LAMP, finish: 'lamp' });
  // Hood: a canvas quarter-dome on bows, raised over the passenger or folded down behind the seat back.
  const hood = '#e8dfc6';
  if (o.hood ?? true) {
    const shell = () => new THREE.SphereGeometry(1, 8, 4, Math.PI, Math.PI, 0, Math.PI / 2);
    const at: Vec3 = [0, 0.9, 0.5], scale: Vec3 = [0.39, 0.62, 0.36];
    parts.add(shell(), { at, scale, color: hood, finish: 'cloth' });
    parts.add(flipped(shell()), { at, scale: [scale[0] - 0.01, scale[1] - 0.01, scale[2] - 0.01], color: '#b9ae93', finish: 'cloth' });
    // Bows follow the shell: the front rim and two more folded back toward the seat.
    for (const a of [0, 0.7, 1.25]) {
      const bow = (t: number): Vec3 => [at[0] + (scale[0] + 0.005) * Math.cos(t), at[1] + (scale[1] + 0.005) * Math.sin(t) * Math.cos(a), at[2] - (scale[2] + 0.005) * Math.sin(t) * Math.sin(a)];
      for (let k = 0; k < 6; k++) tube(parts, bow((k * Math.PI) / 6), bow(((k + 1) * Math.PI) / 6), 0.012, { color: '#2a2a2a', finish: 'metal' }, 4);
    }
  } else {
    parts.add(ball(10, 6), { at: [0, 1.0, 0.16], scale: [0.38, 0.1, 0.16], color: hood, finish: 'cloth', smooth: true });
  }
  // Steering bar behind the seat back, frame tubes to the crank, saddle and rear wheel.
  const frame = { paint: true };
  for (const sx of [-1, 1]) tube(parts, [sx * 0.2, 0.86, 0.17], [sx * 0.22, 0.98, 0.1], 0.016, frame);
  tube(parts, [-0.3, 0.98, 0.1], [0.3, 0.98, 0.1], 0.016, { color: CHROME, finish: 'chrome' });
  for (const sx of [-1, 1]) parts.add(cyl(0.022, 0.022, 0.11, 8), { at: [sx * 0.3, 0.98, 0.1], rot: ALONG_X, color: RUBBER, finish: 'rubber' });
  const saddle: Vec3 = [0, 0.98, -0.6];
  tube(parts, [0, 0.44, 0.24], crank, 0.024, frame);
  tube(parts, [0, 0.86, 0.18], [0, 0.92, -0.5], 0.022, frame);
  tube(parts, crank, [0, saddle[1] - 0.04, saddle[2] + 0.02], 0.022, frame);
  tube(parts, [0, saddle[1] - 0.04, saddle[2] + 0.02], [0, saddle[1] - 0.02, saddle[2]], 0.02, { color: SILVER, finish: 'chrome' });
  for (const sx of [-1, 1]) {
    tube(parts, [sx * 0.04, crank[1], crank[2]], [sx * 0.05, rr, rz], 0.013, frame);
    tube(parts, [sx * 0.03, saddle[1] - 0.08, saddle[2] + 0.02], [sx * 0.05, rr, rz], 0.013, frame);
  }
  fender(parts, rz, rr, rr + 0.04, 0.08, 0.6, 1.9, { color: '#2a2d2f', finish: 'metal' });
  parts.add(box(0.2, 0.06, 0.26), { at: saddle, color: '#4a3020', finish: 'cloth' });
  parts.add(ball(8, 5), { at: [saddle[0], saddle[1] + 0.03, saddle[2]], scale: [0.11, 0.04, 0.15], color: '#4a3020', finish: 'cloth', smooth: true });
  // Crank: chainring and chain on the right, arms and pedals at angle 0 (left pedal forward).
  parts.add(cyl(0.1, 0.1, 0.012, 12), { at: [-0.07, crank[1], crank[2]], rot: ALONG_X, color: SILVER, finish: 'chrome' });
  for (const [dy, tilt] of [[0.07, -0.04], [-0.06, 0.03]]) parts.add(box(0.012, 0.012, crank[2] - rz - 0.02), { at: [-0.07, crank[1] + dy, (rz + crank[2]) / 2], rot: [tilt, 0, 0], color: '#1a1c1d', finish: 'metal' });
  parts.add(cyl(0.025, 0.025, 0.2, 6), { at: crank, rot: ALONG_X, color: SILVER, finish: 'metal' });
  for (const sx of [-1, 1]) {
    const pz = crank[2] + sx * s.pedals!.r;
    parts.beam([sx * 0.1, crank[1], crank[2]], [sx * 0.1, crank[1], pz], 0.025, 0.012, { color: SILVER, finish: 'chrome' });
    parts.add(box(0.1, 0.025, 0.06), { at: [sx * 0.16, crank[1], pz], color: RUBBER, finish: 'rubber' });
  }
  parts.add(box(0.06, 0.04, 0.04), { at: [0, rr + 0.3, rz - 0.3], color: TAIL_LAMP, finish: 'lamp' });
}

/** Xe rác đẩy tay: an orange steel bin on two wheels with handlebars and a front leg, heaped with rubbish bags. */
function trashcart(parts: ModelParts) {
  const s = FLEET.trashcart, wz = s.axles[0].z, r = s.axles[0].r, z0 = -0.42, z1 = 0.92, y0 = 0.42, y1 = 1.14, half = 0.43;
  const len = z1 - z0, mid = (z0 + z1) / 2, steel = { color: DARK_METAL, finish: 'metal' as const };
  parts.add(box(2 * half, 0.04, len), { at: [0, y0, mid], paint: true });
  for (const sx of [-1, 1]) {
    parts.add(box(0.04, y1 - y0, len), { at: [sx * half, (y0 + y1) / 2, mid], paint: true });
    parts.add(box(0.02, 0.08, len - 0.1), { at: [sx * (half + 0.025), y1 - 0.2, mid], color: '#f2f2ee', finish: 'lamp' });
    tube(parts, [sx * (half - 0.02), y1 - 0.05, z0 + 0.02], [sx * 0.3, 1.0, -0.98], 0.02, steel);
    parts.add(box(0.05, 0.05, len + 0.05), { at: [sx * half, y1, mid], ...steel });
  }
  for (const z of [z0, z1]) {
    parts.add(box(2 * half, y1 - y0, 0.04), { at: [0, (y0 + y1) / 2, z], paint: true });
    parts.add(box(2 * half, 0.05, 0.05), { at: [0, y1, z], ...steel });
  }
  parts.add(box(2 * half - 0.06, 0.02, len - 0.06), { at: [0, y1 - 0.1, mid], color: '#3b3a34' });
  for (const [x, z, sx, sy, sz, c] of [[-0.2, 0.0, 0.26, 0.2, 0.3, '#1f2224'], [0.18, 0.3, 0.24, 0.22, 0.28, '#2f5a3a'], [-0.1, 0.62, 0.28, 0.18, 0.26, '#1f2224'], [0.2, -0.22, 0.2, 0.16, 0.2, '#e9e5d8']] as const) {
    parts.add(ball(8, 5), { at: [x, y1 + 0.04, z], scale: [sx, sy, sz], color: c, finish: 'plastic', smooth: true });
  }
  parts.add(cyl(0.022, 0.022, 0.64, 6), { at: [0, 1.0, -0.99], rot: ALONG_X, ...steel });
  for (const sx of [-1, 1]) parts.add(cyl(0.026, 0.026, 0.13, 8), { at: [sx * 0.22, 1.0, -0.99], rot: ALONG_X, color: RUBBER, finish: 'rubber' });
  tube(parts, [0, y0, z1 - 0.06], [0, 0.03, z1 - 0.04], 0.025, steel);
  parts.add(box(0.16, 0.03, 0.1), { at: [0, 0.015, z1 - 0.04], color: RUBBER, finish: 'rubber' });
  parts.add(cyl(0.025, 0.025, 2 * half + 0.16, 6), { at: [0, r, wz], rot: ALONG_X, ...steel });
  for (const sx of [-1, 1]) motoWheel(parts, [sx * 0.5, r, wz], r, 0.06, 'spoke');
}

const FLEET_BUILDERS: Record<FleetKind, (parts: ModelParts, o: FleetOptions) => void> = { bus, coach, truck, tow, bagac, cyclo, trashcart };

/** A fleet vehicle's model. Without `o.paint` its painted panels stay white for instance colours. */
export function fleetGeometry(kind: FleetKind, o: FleetOptions = {}) {
  const parts = new ModelParts();
  drawWheels = o.wheels ?? true;
  try { FLEET_BUILDERS[kind](parts, o); } finally { drawWheels = true; }
  return parts.build(o.paint);
}

/** One wheel of axle `index`, centred on its hub with the axle along x and the rim facing +x, for wheels that spin. */
export function fleetWheelGeometry(kind: FleetKind, index = 0) {
  const a = FLEET[kind].axles[index], parts = new ModelParts();
  if (kind === 'bagac' || kind === 'cyclo' || kind === 'trashcart') motoWheel(parts, [0, 0, 0], a.r, a.tread, kind === 'bagac' && index ? 'steel' : 'spoke');
  else bigWheel(parts, 0, 0, a.r, a.tread, 1, a.dual ? '#8f979a' : SILVER);
  const g = parts.build();
  if (kind !== 'bagac' && kind !== 'cyclo' && kind !== 'trashcart') g.translate(0, -a.r, 0);
  return g;
}
