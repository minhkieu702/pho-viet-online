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
