import * as THREE from 'three';
import { groundHeight } from './map/terrain';
import type { CarStyle, MotoStyle } from './vehicle-models';
import type { BoatKind, Crew } from './boats';

/**
 * Vehicle lights at night (night plan §7, phase P5): head-lamp beams on the road, red tail-lamp spill behind cars and
 * buses, a glint on every lamp, motorbikes' single head lamp, police light bars flashing red and blue (washing the
 * street round the cruiser), the player's own bike (its battery works in zombie mode too, plan A13/A14) and boats'
 * navigation lights with their reflections on the river.
 *
 * Everything is one InstancedMesh, one draw call, written on the CPU once a frame for the vehicles in view only, and
 * screen-blended (out = dst + src·(1 − dst)): it never clips, and the order of overlapping lights does not matter.
 * No THREE light is added and nothing compiles at runtime: the one program compiles at load with the scene.
 *
 * The lit factor is atmosphere.night (the plan's `nightSky`: not × power), applied on the CPU as each instance is
 * written; city vehicles also take the power (0 in zombie mode, so zombie nights keep their dark streets) and the
 * player's own vehicle does not. Fog fades with three's own fog uniforms (scene.fog, after game.ts's glide
 * adjustment and the weather), so nothing here waits on another module's per-frame writer.
 *
 * game.ts: `scene.add(vehicleLights.mesh)` once; `vehicleLights.begin(...)` before the boats, traffic and buses update;
 * `vehicleLights.end()` after the player's own bike. vehicles.ts, buses.ts and boats.ts call `vehicle()`, `place()` and
 * `boat()` where they pose their bodies, before their own culling: a beam reaches past the body, so the lights cull
 * with their own, wider spheres (the frustum of the camera as it was last drawn).
 *
 * Per instance (16 floats, one interleaved buffer): A = x, y, z, kind; B = four shape numbers; C = up to three more; D =
 * the display-space colour × strength × lit. Kinds:
 *   0 beam    a trapezoid on the road from the bumper (A) along the heading B.xy, B.z long, B.w wide at the bumper and
 *             C.x at its far end, rising C.y per metre (bridge ramps), brightest C.z of the way along
 *   1 spill   an ellipse on the road (tail lamps, the police wash): B.xy its heading, B.z and B.w half sizes
 *   2 glint   a disc at a lamp, facing the eye: B.z its radius, C.x how far it is pulled towards the eye; a lamp shining
 *             one way (B.xy) fades out seen from behind past cos B.w (B.xy = 0: all round)
 *   3 streak  a lamp's reflection lying on water or a wet road, from under the lamp towards the eye: B.z half wide, B.w
 *             long; C.y how much it ripples
 */

/** The vehicle is the player's own (or another player's): lit by its battery, also in zombie mode. */
export const OWN = 1;
/** A police light bar flashing, in one phase or the other (vehicles.ts's flash: left red or left blue). */
export const SIREN_A = 2, SIREN_B = 4;

export type LampStyle = CarStyle | MotoStyle | 'bus';
type V3 = readonly [number, number, number];
type RGB = readonly [number, number, number];
/** What game.ts hands begin() each frame. */
export type LightFrame = {
  /** The camera as it was last drawn (its frustum culls the lights). */
  camera: THREE.Camera;
  /** atmosphere.night 0..1. */
  night: number;
  /** 1, or 0 in zombie mode: no electricity in the city (the player's own vehicle has its battery). */
  power: number;
  /** atmosphere.rain 0..1: wet roads mirror the lamps. */
  wet: number;
  /** The quality level 0 (Cao) .. 5 (Tối thiểu). */
  level: number;
  /** Seconds (ripples on the water). */
  time: number;
};

/** A colour in display space (no conversion in the shader: the output is the screen's own value). */
const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const HEAD = rgb(0xfff1d6), HEAD_LED = rgb(0xeef3ff), HEAD_GLINT = rgb(0xfff6e0), HEAD_GLINT_LED = rgb(0xf4f7ff);
const TAIL = rgb(0xff2a1a), TAIL_SPILL = rgb(0xff3020);
const SIREN_RED = rgb(0xff2a2a), SIREN_BLUE = rgb(0x2a6bff);
const NAV_RED = rgb(0xff3324), NAV_GREEN = rgb(0x3dff8a), NAV_WHITE = rgb(0xfff4e2), LANTERN = rgb(0xffcf87), WINDOWS = rgb(0xffd98a);

/**
 * A road vehicle's lamps in its model's frame (vehicle-models.ts: x to its left, y up from the ground under the
 * wheels, z to the nose), at the lamp faces; `twin` mirrors them across the centre line. beam: length, width at the
 * bumper, width at its end, strength. spill (tail): half length, half width, how far behind the tail lamps, strength.
 * glint: head radius and strength, tail radius and strength. bar: a police light bar (mirrored). size: the radius of
 * a sphere round the body.
 */
export type RoadLamps = {
  head: V3; tail: V3; twin: boolean;
  beam: readonly [number, number, number, number];
  spill: readonly [number, number, number, number] | null;
  glint: readonly [number, number, number, number];
  bar: V3 | null;
  size: number;
};
const CAR_BEAM = [11, 1.6, 4.4, 0.3] as const, MOTO_BEAM = [7.5, 0.6, 2.6, 0.22] as const;
const car = (head: V3, tail: V3, bar: V3 | null = null): RoadLamps => ({ head, tail, twin: true, beam: CAR_BEAM, spill: [1.1, 0.9, 1.0, 0.16], glint: [0.3, 0.8, 0.16, 0.55], bar, size: 2.6 });
const moto = (head: V3, tail: V3): RoadLamps => ({ head, tail, twin: false, beam: MOTO_BEAM, spill: null, glint: [0.26, 0.8, 0.12, 0.55], bar: null, size: 1.3 });
/**
 * Every body style's lamps (vehicle-models.ts CAR_SPECS, the motorbike builders' head lamps and rearEnd(), the city
 * bus's face; scripts/vehicle-lights.test.mjs checks them against the models' lamp geometry).
 */
export const ROAD_LAMPS: Record<LampStyle, RoadLamps> = {
  sedan: car([0.57, 0.69, 2.25], [0.62, 0.87, -2.25]),
  taxi: car([0.57, 0.69, 2.25], [0.62, 0.87, -2.25]),
  hatch: car([0.51, 0.67, 1.87], [0.56, 0.85, -1.87]),
  suv: car([0.63, 0.9, 2.35], [0.68, 1.05, -2.35]),
  pickup: car([0.61, 0.93, 2.39], [0.66, 1.03, -2.39]),
  police: car([0.58, 0.69, 2.25], [0.63, 0.87, -2.25], [0.26, 1.57, -0.35]),
  scooter: moto([0, 1.06, 0.65], [0, 0.7, -0.95]),
  cub: moto([0, 1.04, 0.65], [0, 0.72, -0.94]),
  vespa: moto([0, 1.11, 0.64], [0, 0.69, -0.87]),
  sport: moto([0, 0.92, 0.81], [0, 0.88, -0.95]),
  bus: { head: [0.82, 0.8, 6.06], tail: [1.06, 1.02, -6.06], twin: true, beam: [12, 2, 5, 0.32], spill: [1.2, 1.3, 1.1, 0.18], glint: [0.34, 0.85, 0.22, 0.55], bar: null, size: 7 },
};

/**
 * A boat's light in its frame (boats.ts: x to port, y up from the waterline, z to the bow). `dir` is the way it shines
 * as [to port, ahead] (0, 0: all round) and `edge` the cosine past which it is out of sight (a sidelight's 112.5°
 * sector, the masthead's 225°, the stern light's 135°). `streak` is its reflection on the river [half width, length];
 * a light with `r` 0 is a reflection only (a row of lit cabin windows).
 */
export type BoatLight = { at: V3; dir: readonly [number, number]; edge: number; c: RGB; r: number; s: number; streak: readonly [number, number] | null };
const ALL_ROUND = [0, 0] as const, AHEAD = [0, 1] as const, ASTERN = [0, -1] as const, PORT = [0.83, 0.56] as const, STARBOARD = [-0.83, 0.56] as const;
const nav = (at: V3, dir: readonly [number, number], edge: number, c: RGB, r: number, s: number, streak: readonly [number, number] | null = [0.35, 10]): BoatLight => ({ at, dir, edge, c, r, s, streak });
const windows = (x: number, zs: number[], c: RGB, s: number): BoatLight[] => zs.flatMap((z) => [x, -x].map((sx) => nav([sx, 0, z], ALL_ROUND, -1, c, 0, s, [1.1, 8])));
/** Each kind's lights (boats.ts boatGeometry): masthead, sidelights (red to port, green to starboard), stern light. */
export const BOAT_LIGHTS: Record<BoatKind, BoatLight[]> = {
  // A lantern under the bow end of the bamboo canopy.
  sampan: [nav([0, 0.72, 1.3], ALL_ROUND, -1, LANTERN, 0.3, 0.8, [0.3, 6])],
  waterbus: [
    nav([0, 5.3, -7.92], AHEAD, -0.38, NAV_WHITE, 0.42, 0.9), nav([2.3, 3.5, 6.5], PORT, 0.56, NAV_RED, 0.38, 0.85), nav([-2.3, 3.5, 6.5], STARBOARD, 0.56, NAV_GREEN, 0.38, 0.85),
    nav([0, 1.4, -11.05], ASTERN, 0.38, NAV_WHITE, 0.34, 0.8), nav([0, 0.95, 10.15], AHEAD, 0, HEAD_GLINT, 0.36, 0.8, [0.35, 8]),
    ...windows(2.75, [-4, 2.5], LANTERN, 0.2),
  ],
  barge: [
    nav([0, 3.75, -12.4], AHEAD, -0.38, NAV_WHITE, 0.42, 0.9), nav([1.9, 3.35, -10.45], PORT, 0.56, NAV_RED, 0.38, 0.85), nav([-1.9, 3.35, -10.45], STARBOARD, 0.56, NAV_GREEN, 0.38, 0.85),
    nav([0, 2.2, -14.45], ASTERN, 0.38, NAV_WHITE, 0.34, 0.8),
  ],
  cruise: [
    nav([0, 6.3, 11.8], AHEAD, -0.38, NAV_WHITE, 0.42, 0.9), nav([3.1, 3.65, 9.5], PORT, 0.56, NAV_RED, 0.38, 0.85), nav([-3.1, 3.65, 9.5], STARBOARD, 0.56, NAV_GREEN, 0.38, 0.85),
    nav([0, 1.4, -12.9], ASTERN, 0.38, NAV_WHITE, 0.34, 0.8),
    ...windows(3.55, [-7, -1, 5], WINDOWS, 0.4),
  ],
  speedboat: [
    nav([0.35, 0.62, 2.85], PORT, 0.56, NAV_RED, 0.24, 0.85, [0.25, 5]), nav([-0.35, 0.62, 2.85], STARBOARD, 0.56, NAV_GREEN, 0.24, 0.85, [0.25, 5]),
    nav([0, 1.05, -3.3], ALL_ROUND, -1, NAV_WHITE, 0.3, 0.85, [0.3, 6]),
  ],
  // At anchor: the white anchor light at the masthead and a work lamp over the wheelhouse door.
  fishing: [nav([0, 5.6, 1.2], ALL_ROUND, -1, NAV_WHITE, 0.4, 0.9), nav([0, 2.2, -1.65], ALL_ROUND, -1, LANTERN, 0.42, 0.9, [0.5, 8])],
};
/** Half lengths of the boats (boats.ts SPEC), for culling. */
const BOAT_REACH: Record<BoatKind, number> = { sampan: 3, waterbus: 11, barge: 15, cruise: 13, speedboat: 3.3, fishing: 5 };

/**
 * The player's own head lamp reaches further, wider and brighter than traffic's: it lights the way ahead, and from the
 * chase camera behind and above it a beam is seen at a glancing angle.
 */
const OWN_REACH = 2, OWN_WIDTH = 1.4, OWN_GAIN = 1.6;
/** Where along its length a beam is brightest: near the bumper for traffic, a low beam's hot spot ahead for the player. */
const HOT = 0.12, OWN_HOT = 0.32;
/** Vehicle models stand this far into the road (vehicles.ts pose); the light lies this far above it. */
const SINK = 0.04, LIFT = 0.05;
/** Instances (≈ 300 at the busiest High view with rain; the rest is room) and floats per instance. */
export const CAPACITY = 1024;
const STRIDE = 16;
const KIND_BEAM = 0, KIND_SPILL = 1, KIND_GLINT = 2, KIND_STREAK = 3;

const VERTEX = /* glsl */ `
attribute vec4 vlA;
attribute vec4 vlB;
attribute vec4 vlC;
attribute vec4 vlD;
uniform float fogNear;
uniform float fogFar;
varying vec3 vTint;
varying vec4 vQ;
varying vec4 vShape;
varying float vKind;
void main() {
  vec3 c = vlA.xyz, tint = vlD.rgb;
  vec2 q = position.xy;
  float kind = vlA.w, dist = distance(cameraPosition, c), fogged = smoothstep(fogNear, fogFar, dist);
  vec4 mv;
  vKind = kind;
  vShape = vec4(1.0);
  if (kind < 0.5) {
    // Beam: its own frame (across, along, metres) goes to the fragment, exact on both triangles of the trapezoid.
    vec2 h = vlB.xy, s = vec2(h.y, -h.x);
    float t = q.y * 0.5 + 0.5, along = t * vlB.z, lat = q.x * 0.5 * mix(vlB.w, vlC.x, t);
    vQ = vec4(lat, along, 0.0, 0.0);
    vShape = vec4(vlB.z, vlB.w, vlC.x, max(vlC.z, 0.05));
    tint *= 1.0 - fogged;
    mv = viewMatrix * vec4(c + vec3(h.x * along + s.x * lat, vlC.y * along, h.y * along + s.y * lat), 1.0);
  } else if (kind < 1.5) {
    vec2 h = vlB.xy, s = vec2(h.y, -h.x), o = h * (q.y * vlB.z) + s * (q.x * vlB.w);
    vQ = vec4(q, 0.0, 0.0);
    tint *= 1.0 - fogged;
    mv = viewMatrix * vec4(c.x + o.x, c.y, c.z + o.y, 1.0);
  } else if (kind < 2.5) {
    // Glint: lamps that shine one way fade out from behind; far off a lamp stays a few pixels wide (a point of light
    // reads at any distance) and shows through the fog at 40 %, as lights do.
    vec2 toEye = cameraPosition.xz - c.xz;
    float facing = dot(vlB.xy, toEye / max(length(toEye), 0.001));
    tint *= smoothstep(vlB.w - 0.15, vlB.w + 0.15, facing) * (1.0 - 0.6 * fogged);
    mv = viewMatrix * vec4(c, 1.0);
    mv.xyz += normalize(-mv.xyz) * vlC.x;
    mv.xy += q * max(vlB.z, 0.0045 * dist);
    vQ = vec4(q, 0.0, 0.0);
  } else {
    // Streak: from just behind the point under the lamp towards the eye (never past it). On rippling water it reaches
    // further the further off it is, as a lamp's reflection on a river does (seen at a glancing angle).
    vec2 toEye = cameraPosition.xz - c.xz;
    float le = max(length(toEye), 0.001), len = min(vlC.y > 0.5 ? max(vlB.w, 0.3 * le) : vlB.w, le * 0.8);
    float along = (q.y * 0.5 + 0.5) * len * 1.1 - 0.1 * len;
    vec2 d = toEye / le, s = vec2(d.y, -d.x), o = d * along + s * (q.x * max(vlB.z, 0.003 * le));
    vQ = vec4(q, c.x * 1.7 + c.z * 0.9, vlC.y);
    tint *= 1.0 - fogged;
    mv = viewMatrix * vec4(c.x + o.x, c.y, c.z + o.y, 1.0);
  }
  vTint = tint;
  // Unlit (faded out by the fog or facing away): off screen, no fragments.
  gl_Position = dot(tint, tint) < 1e-7 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform float vlTime;
varying vec3 vTint;
varying vec4 vQ;
varying vec4 vShape;
varying float vKind;
void main() {
  float a;
  if (vKind < 0.5) {
    // Beam: rising to its hot spot ahead of the bumper, fading with the distance after it, soft at the sides.
    float t = clamp(vQ.y / vShape.x, 0.0, 1.0);
    float s = min(1.0, abs(vQ.x) / (0.5 * mix(vShape.y, vShape.z, t)));
    a = smoothstep(0.0, vShape.w, t) * pow(1.0 - t, 1.2) * (1.0 - smoothstep(0.4, 1.0, s)) * (1.0 - 0.3 * s * s);
  } else if (vKind < 2.5) {
    float r2 = dot(vQ.xy, vQ.xy);
    if (r2 >= 1.0) discard;
    // Spill: a soft disc. Glint: a hot core in a wider bloom.
    a = vKind < 1.5 ? (1.0 - r2) * (1.0 - r2) : max(0.0, 0.9 * exp(-12.0 * r2) + 0.2 * exp(-3.0 * r2) - 0.01);
  } else {
    // Streak: a soft line towards the eye, broken into moving ripples on water.
    float v = vQ.y * 0.5 + 0.5, u2 = vQ.x * vQ.x;
    a = exp(-3.0 * u2) * (1.0 - u2) * smoothstep(0.0, 0.12, v) * (1.0 - v);
    a *= mix(1.0, 0.55 + 0.45 * sin(v * 34.0 - vlTime * 2.6 + vQ.z), vQ.w);
  }
  gl_FragColor = vec4(vTint * a, 1.0);
}`;

// ---- The mesh (made on first use) -------------------------------------------------------------------------------

/** Localhost only: `?vlights=off` starts with the vehicle lights off (A/B benches against the same code). */
const OFF_IN_URL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('vlights') === 'off';

let data = new Float32Array(0);
let buffer: THREE.InstancedInterleavedBuffer | null = null;
let mesh: THREE.InstancedMesh | null = null;
const uniforms = { vlTime: { value: 0 }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) };

function ensure() {
  if (mesh) return mesh;
  data = new Float32Array(CAPACITY * STRIDE);
  buffer = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1);
  buffer.setUsage(THREE.DynamicDrawUsage);
  // A unit quad (-1..1); every kind shapes it in the vertex shader.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  for (const [k, name] of ['vlA', 'vlB', 'vlC', 'vlD'].entries()) geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, 4, k * 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const material = new THREE.ShaderMaterial({
    name: 'vehicle-lights', uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, depthTest: true, fog: true, side: THREE.DoubleSide, toneMapped: false,
    // Screen: out = dst + src·(1 − dst).
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
    // The beams and spills lie a few centimetres over the asphalt: kept off it in the depth test too.
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  material.customProgramCacheKey = () => 'vehicle-lights';
  const m = new THREE.InstancedMesh(geometry, material, CAPACITY);
  m.name = 'Vehicle lights';
  m.count = 0;
  m.visible = false;
  m.frustumCulled = false;
  m.castShadow = m.receiveShadow = false;
  m.matrixAutoUpdate = false;
  m.renderOrder = 2;
  // Its instance data is not a transform: nothing may ray-test it.
  m.raycast = () => {};
  m.userData.off = OFF_IN_URL;
  mesh = m;
  return m;
}

// ---- Per frame -----------------------------------------------------------------------------------------------

let used = 0, on = false, frame = 0, lastTime = NaN, dt = 0;
let lit = 0, cityLit = 0, wet = 0, level = 0, far = 280, beamFar = 120, wetFar = 70, waterFar = 120;
const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), eye = new THREE.Vector3(), sphere = new THREE.Sphere();
const placed = new THREE.Matrix4(), at3 = new THREE.Vector3(), quat = new THREE.Quaternion(), euler = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1);
/** Brake lamps and LED head lamps: per vehicle, kept across frames. */
type LampState = { v: number; frame: number; brake: number; led: boolean };
let states = new WeakMap<object, LampState>();
let made = 0;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function put(kind: number, x: number, y: number, z: number, b0: number, b1: number, b2: number, b3: number, c0: number, c1: number, c: RGB, s: number, c2 = 0) {
  if (used >= CAPACITY || s < 0.004) return;
  const a = data, o = used++ * STRIDE;
  a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = kind;
  a[o + 4] = b0; a[o + 5] = b1; a[o + 6] = b2; a[o + 7] = b3;
  a[o + 8] = c0; a[o + 9] = c1; a[o + 10] = c2; a[o + 11] = 0;
  a[o + 12] = c[0] * s; a[o + 13] = c[1] * s; a[o + 14] = c[2] * s; a[o + 15] = 0;
}
/** How much of a one-way lamp (dx, dz) the eye sees from (x, z): the shader's glint fade, for streaks written here. */
function facing(x: number, z: number, dx: number, dz: number, edge: number) {
  if (!dx && !dz) return 1;
  const ex = eye.x - x, ez = eye.z - z, l = Math.hypot(ex, ez) || 1;
  return smooth(edge - 0.15, edge + 0.15, (dx * ex + dz * ez) / l);
}

function stateOf(key: object, speed: number) {
  let s = states.get(key);
  const v = Math.abs(speed);
  if (!s) { s = { v, frame: -9, brake: 0, led: made++ % 3 === 0 }; states.set(key, s); }
  // Brake lamps: stopped (a foot on the brake at a light, in a queue) or slowing hard; out quickly once it pulls away.
  const slowing = s.frame === frame - 1 && dt > 0 ? (s.v - v) / dt : 0;
  s.brake = v < 0.4 || slowing > 1.6 ? 1 : Math.max(0, s.brake - dt * 5);
  s.v = v;
  s.frame = frame;
  return s;
}

/** A lamp at (lx, ly, lz) in the frame `e`: its glint, and its streak on a wet road. */
function lamp(e: ArrayLike<number>, lx: number, ly: number, lz: number, dx: number, dz: number, r: number, push: number, c: RGB, s: number, roadY: number, streaks: boolean) {
  const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], y = e[1] * lx + e[5] * ly + e[9] * lz + e[13], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
  put(KIND_GLINT, x, y, z, dx, dz, r, -0.15, push, 0, c, s);
  if (streaks) put(KIND_STREAK, x, roadY, z, 0, 0, 0.22, 3.2 + 2 * wet, 0, 0.15, c, s * 0.42 * wet * facing(x, z, dx, dz, -0.15));
}

/**
 * How the road rises (per metre) from (x, y, z) to `length` ahead along (hx, hz), or NaN when it does not get there
 * (a deck's edge, a step): one probe, which takes a deck under the beam's end but not an overpass above it.
 */
function beamRise(x: number, y: number, z: number, hx: number, hz: number, length: number) {
  const g = groundHeight(x + hx * length, z + hz * length, y + 1.2) + LIFT;
  return Math.abs(g - y) > 0.8 ? NaN : (g - y) / length;
}

export const vehicleLights = {
  /** The one mesh (add it to the scene once; it is shared by every game made in this page). */
  get mesh() { return ensure(); },
  /** Instances written this frame. */
  get count() { return used; },
  /** A new frame: the night, the power, the weather, the quality level and the camera's last view. */
  begin(f: LightFrame) {
    const m = ensure();
    used = 0;
    frame++;
    dt = Number.isFinite(lastTime) ? Math.min(0.1, Math.max(0, f.time - lastTime)) : 0;
    lastTime = f.time;
    lit = clamp01(f.night);
    cityLit = lit * clamp01(f.power);
    // Daytime costs a comparison per vehicle; userData.off is the A/B switch for benches.
    on = lit > 0.02 && !m.userData.off;
    if (!on) return;
    wet = clamp01(f.wet);
    level = f.level;
    uniforms.vlTime.value = f.time % 3600;
    projScreen.multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    eye.setFromMatrixPosition(f.camera.matrixWorld);
    // As far as the world is drawn (the fog's far end and world.ts's margin); beams and reflections nearer, and fewer
    // on the fast presets (plan §9: glints only at Tối thiểu).
    const fog = (m.parent as THREE.Scene | null)?.fog as THREE.Fog | null | undefined;
    far = fog && 'far' in fog ? fog.far + 20 : 280;
    beamFar = Math.min(far, level >= 3 ? 80 : 120);
    wetFar = level <= 2 ? 70 : 0;
    waterFar = level >= 5 ? 0 : level >= 3 ? 70 : 120;
  },
  /**
   * A road vehicle drawn with model frame `m` (vehicle-models.ts: nose +z, standing SINK into the road; a motorbike's
   * lean included). `key` is the vehicle (its brake lamps are kept on it); `speed` m/s; `flags` OWN, SIREN_A, SIREN_B.
   */
  vehicle(key: object, m: THREE.Matrix4, style: LampStyle, speed: number, flags = 0) {
    if (!on) return;
    const own = (flags & OWN) !== 0, k = own ? lit : cityLit, L = ROAD_LAMPS[style];
    if (k < 0.02 || !L) return;
    const e = m.elements, x = e[12], z = e[14], d = Math.hypot(x - eye.x, z - eye.z);
    if (d > far) return;
    let hx = e[8], hz = e[10];
    const hn = Math.hypot(hx, hz);
    if (hn < 1e-6) return;
    hx /= hn; hz /= hn;
    const beams = level < 5 && d < beamFar, siren = flags & (SIREN_A | SIREN_B);
    const G = L.glint, H = L.head, T = L.tail, hX = H[0], hY = H[1], hZ = H[2], tX = T[0], tY = T[1], tZ = T[2];
    const reach = beams ? L.beam[0] * (own ? OWN_REACH : 1) : 0, width = L.beam[2] * (own ? OWN_WIDTH : 1);
    // In view: everything along the body's axis, from behind the tail spill to the end of the beam (and the police
    // wash round the cruiser).
    const front = hZ + reach, back = L.spill && beams ? tZ - L.spill[2] - L.spill[0] : tZ, mid = (front + back) / 2;
    sphere.center.set(x + hx * mid, e[13] + 1, z + hz * mid);
    // (+1.5 m: the frustum is the one last drawn, and the camera has moved on since.)
    sphere.radius = Math.max((front - back) / 2 + Math.max(width / 2, L.size * 0.5), siren && beams ? Math.abs(mid) + 5.5 : 0) + 1.5;
    if (!frustum.intersectsSphere(sphere)) return;
    const state = stateOf(key, speed), road = e[13] + SINK + LIFT, streaks = wet > 0.15 && d < wetFar;
    const led = state.led || style === 'sport';
    if (beams) {
      // The beam from the bumper; up or down a ramp with the road (one probe at its end), shortened at a deck's edge.
      const ax = x + hx * hZ, az = z + hz * hZ;
      let length = reach, rise = beamRise(ax, road, az, hx, hz, length);
      if (Number.isNaN(rise)) { length *= 0.5; rise = beamRise(ax, road, az, hx, hz, length); }
      if (!Number.isNaN(rise)) put(KIND_BEAM, ax, road, az, hx, hz, length, L.beam[1], width, Math.max(-0.3, Math.min(0.3, rise)), led ? HEAD_LED : HEAD, L.beam[3] * k * (own ? OWN_GAIN : 1), own ? OWN_HOT : HOT);
      if (L.spill) {
        // Red on the road behind, brighter while braking.
        const S = L.spill, sz = tZ - S[2];
        put(KIND_SPILL, x + hx * sz, road, z + hz * sz, hx, hz, S[0], S[1], 0, 0, TAIL_SPILL, S[3] * k * (1 + 0.6 * state.brake));
      }
    }
    const headC = led ? HEAD_GLINT_LED : HEAD_GLINT, headS = G[1] * k, tailS = G[3] * k * (1 + 0.8 * state.brake);
    lamp(e, hX, hY, hZ, hx, hz, G[0], 0.25, headC, headS, road, streaks);
    lamp(e, tX, tY, tZ, -hx, -hz, G[2], 0.15, TAIL, tailS, road, streaks);
    if (L.twin) {
      lamp(e, -hX, hY, hZ, hx, hz, G[0], 0.25, headC, headS, road, streaks);
      lamp(e, -tX, tY, tZ, -hx, -hz, G[2], 0.15, TAIL, tailS, road, streaks);
    }
    if (L.bar && siren) {
      // The light bar flashing (as vehicles.ts colours its boxes), and the street round the cruiser washed red, blue.
      const a = (flags & SIREN_A) !== 0, B = L.bar;
      lamp(e, B[0], B[1], B[2], 0, 0, 0.42, 0.25, a ? SIREN_RED : SIREN_BLUE, 0.95 * k, road, false);
      lamp(e, -B[0], B[1], B[2], 0, 0, 0.42, 0.25, a ? SIREN_BLUE : SIREN_RED, 0.95 * k, road, false);
      if (beams && level <= 3) put(KIND_SPILL, x, road, z, hx, hz, 5.5, 5.5, 0, 0, a ? SIREN_RED : SIREN_BLUE, 0.2 * k);
    }
  },
  /** vehicle() for a body without a matrix of its own: standing on the road at height `ground`, heading `yaw`, leaning `lean`. */
  place(key: object, x: number, ground: number, z: number, yaw: number, lean: number, style: LampStyle, speed: number, flags = 0) {
    if (!on) return;
    quat.setFromEuler(euler.set(0, yaw, lean, 'YXZ'));
    placed.compose(at3.set(x, ground - SINK, z), quat, ONE);
    vehicleLights.vehicle(key, placed, style, speed, flags);
  },
  /**
   * A boat (its group: position on the water, bob and roll included): navigation lights by kind, their reflections on
   * the river, and the player's hire boat's searchlight on the water ahead. A sampan shows its lantern only with
   * somebody aboard.
   */
  boat(group: THREE.Object3D, kind: BoatKind, crew: Crew, flags = 0) {
    if (!on) return;
    const own = (flags & OWN) !== 0, k = own ? lit : cityLit, list = BOAT_LIGHTS[kind];
    if (k < 0.02 || !list || (kind === 'sampan' && crew === 'none')) return;
    const p = group.position, d = Math.hypot(p.x - eye.x, p.z - eye.z);
    if (d > far) return;
    const search = own && kind === 'speedboat' && level < 5 && d < beamFar;
    sphere.center.copy(p);
    sphere.radius = BOAT_REACH[kind] + 4 + (search ? 18 : 0);
    if (!frustum.intersectsSphere(sphere)) return;
    placed.compose(p, group.quaternion, ONE);
    const e = placed.elements, water = p.y + 0.03, streaks = d < waterFar;
    // Port (+x) and ahead (+z) on the water.
    const px = e[0], pz = e[2], fx = e[8], fz = e[10];
    for (const b of list) {
      const lx = b.at[0], ly = b.at[1], lz = b.at[2];
      const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], y = e[1] * lx + e[5] * ly + e[9] * lz + e[13], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      const dx = b.dir[0] * px + b.dir[1] * fx, dz = b.dir[0] * pz + b.dir[1] * fz;
      if (b.r > 0) put(KIND_GLINT, x, y, z, dx, dz, b.r, b.edge, 0.2, 0, b.c, b.s * k);
      if (streaks && b.streak) put(KIND_STREAK, x, water, z, 0, 0, b.streak[0], b.streak[1], 0, 1, b.c, b.s * k * 0.9 * facing(x, z, dx, dz, b.edge));
    }
    if (search) {
      const hn = Math.hypot(fx, fz) || 1, hx = fx / hn, hz = fz / hn;
      put(KIND_BEAM, p.x + hx * 3.2, water, p.z + hz * 3.2, hx, hz, 18, 0.8, 6, 0, HEAD, 0.2 * k, OWN_HOT);
    }
  },
  /** The frame's lights to the GPU (only the part written). */
  end() {
    if (!mesh || !buffer) return;
    mesh.count = used;
    mesh.visible = used > 0;
    if (!used) return;
    buffer.clearUpdateRanges();
    buffer.addUpdateRange(0, used * STRIDE);
    buffer.needsUpdate = true;
  },
  /** Tests: forget every vehicle's lamp state. */
  reset() { states = new WeakMap(); made = 0; used = 0; on = false; lastTime = NaN; },
};
