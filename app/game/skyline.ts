import * as THREE from 'three';
import type { Building, Plot, TowerSpec } from './city';
import { counterKeyOf } from './counters';
import { FRONT_OF, IRON, LIGHT_BOXES, acUnit, laundry, railing, verticalSign } from './facades';
import { DECAL, type ColorLike, type Kit, type Kind as ShapeKind, type Role } from './kit';

/**
 * Downtown's buildings: glass towers, a New York-style stepped tower, a lotus-bud tower with a helipad, a
 * bundled-tube supertall, apartment slabs, a hotel, a mall and a colonial theatre, plus mid-rise rows and a
 * distant skyline across the river. Facades are one instanced box (and one prism) mesh whose shader draws the
 * window grid from world position: curtain walls, ribbon windows, punched windows or vertical strips, glass
 * that reflects the sky at grazing angles, and windows that light up at random after dark. Details (podiums,
 * canopies, balconies, crowns, signs) go through the world's own batched primitives.
 */
/** What world.ts lends the skyline: its scene root and disposal lists, and kit.ts drawing (frames carry the street dressing). */
export type SkylineKit = Pick<Kit, 'shape' | 'sign' | 'frame' | 'fine'> & {
  root: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  textures: THREE.Texture[];
};

type Facade = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; glass: THREE.Color; frame: THREE.Color; floor: number; bay: number; pattern: number; lit: number; seed: number };

function seeded(start: number) {
  let s = (Math.floor(start) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** The facade material: window grid, sky reflection and lit windows at night, all in the fragment shader. */
function facadeMaterial(uniforms: { night: { value: number }; sky: { value: THREE.Color } }) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78, metalness: 0.04 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { facadeNight: uniforms.night, facadeSky: uniforms.sky });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aGrid;
attribute vec4 aGlass;
attribute vec3 aFrame;
varying vec3 vFacadePos;
varying vec3 vFacadeNormal;
varying vec4 vGrid;
varying vec4 vGlass;
varying vec3 vFrame;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 facadeWorld = vec4(transformed, 1.0);
vec3 facadeNormal = objectNormal;
#ifdef USE_INSTANCING
facadeWorld = instanceMatrix * facadeWorld;
facadeNormal = mat3(instanceMatrix) * facadeNormal;
#endif
facadeWorld = modelMatrix * facadeWorld;
vFacadePos = facadeWorld.xyz;
vFacadeNormal = normalize(mat3(modelMatrix) * facadeNormal);
vGrid = aGrid;
vGlass = aGlass;
vFrame = aFrame;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float facadeNight;
uniform vec3 facadeSky;
varying vec3 vFacadePos;
varying vec3 vFacadeNormal;
varying vec4 vGrid;
varying vec4 vGlass;
varying vec3 vFrame;
float facadeHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 fN = normalize(vFacadeNormal);
float fWall = 1.0 - step(0.7, abs(fN.y));
vec2 fT = normalize(vec2(-fN.z, fN.x) + vec2(1e-4));
float fU = dot(vFacadePos.xz, fT) + vGrid.w;
float fu = fract(fU / vGrid.y), fv = fract(vFacadePos.y / vGrid.x);
vec2 fCell = vec2(floor(fU / vGrid.y), floor(vFacadePos.y / vGrid.x));
float fWin;
if (vGrid.z < 0.5) fWin = step(0.04, fu) * step(fu, 0.96) * step(0.15, fv);
else if (vGrid.z < 1.5) fWin = step(0.36, fv) * step(fv, 0.94);
else if (vGrid.z < 2.5) fWin = step(0.2, fu) * step(fu, 0.8) * step(0.28, fv) * step(fv, 0.86);
else fWin = step(0.32, fu) * step(fu, 0.68) * step(0.07, fv);
fWin *= fWall;
float fHash = facadeHash(fCell + floor(fN.xz * 2.0 + 0.5) * 31.0 + vGrid.w);
vec3 fView = normalize(cameraPosition - vFacadePos);
float fFres = pow(1.0 - clamp(dot(fN, fView), 0.0, 1.0), 3.0);
vec3 fGlass = vGlass.rgb * (0.8 + 0.32 * fHash);
fGlass = mix(fGlass, facadeSky, (0.2 + 0.5 * fFres) * (1.0 - facadeNight * 0.7));
diffuseColor.rgb = mix(vFrame * (0.95 + 0.07 * fHash), fGlass, fWin);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.16, fWin);
metalnessFactor = mix(metalnessFactor, 0.42, fWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec2 fRun = vec2(floor(fU / (vGrid.y * 4.0)), fCell.y);
float fLit = step(1.0 - vGlass.a, facadeHash(fRun * 1.7 + vGrid.w + 3.1)) * step(0.12, facadeHash(fCell + 7.7));
vec3 fWarm = mix(vec3(1.0, 0.8, 0.55), vec3(0.82, 0.9, 1.0), step(0.6, facadeHash(fRun + 2.3)));
totalEmissiveRadiance += fWin * (fLit * (0.55 + 0.25 * fHash) * fWarm + vec3(0.03, 0.05, 0.08)) * facadeNight;`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
float fogFactor = smoothstep(fogNear * 1.7, fogFar * 2.7, vFogDepth);
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.92);
#endif`);
  };
  material.customProgramCacheKey = () => 'tower-facade';
  return material;
}

type Screen = { at: { x: number; z: number }; y: number; w: number; h: number; yaw: number };

/**
 * Which of the hazy towers across the river and beyond the east fence still stand: a wired district replaces them
 * (WIRING-PLAN §3: Quận 4 the 16 east of the canal, Thủ Thiêm the 34 across the river). Their random draws are
 * made either way, so the ones left never move.
 */
export type SkylineOptions = { hazeEast?: boolean; hazeNorth?: boolean };
/** A downtown plot: today's (its `full` rect) or a district's (its oriented `box`). */
type TowerPlot = { plot: Plot & { box?: { cx: number; cz: number; hx: number; hz: number; yaw: number } }; building: Building };

export function buildSkyline(kit: SkylineKit, plots: TowerPlot[], opts: SkylineOptions = {}) {
  const { shape, sign } = kit;
  let screens: Screen[] = [];
  let boxes: Facade[] = [];
  let prisms: Facade[] = [];
  let beacons: THREE.Vector3[] = [];
  const box = (color: ColorLike, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, shadow = true, role: Role = 'solid') =>
    shape('box', color, x, y, z, w, h, d, yaw, 0, shadow, role);
  const colors = new Map<string, THREE.Color>();
  const color = (hex: string) => { let c = colors.get(hex); if (!c) { c = new THREE.Color(hex); colors.set(hex, c); } return c; };

  /** Local frame of a building: lx along its front, lz towards the front. */
  function frame(x: number, z: number, facing: number) {
    const c = Math.cos(facing), s = Math.sin(facing);
    const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    return {
      at,
      part: (lx: number, ly: number, lz: number, w: number, h: number, d: number, col: ColorLike, role: Role = 'solid', shadow = true) =>
        box(col, x + lx * c + lz * s, ly, z - lx * s + lz * c, w, h, d, facing, shadow, role),
      solid: (kind: ShapeKind, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col: ColorLike, shadow = true, role: Role = 'solid') =>
        shape(kind, col, x + lx * c + lz * s, ly, z - lx * s + lz * c, sx, sy, sz, facing, 0, shadow, role),
      /** A facade block standing on y0 (local centre lx, lz; w along the front, d deep). */
      face: (lx: number, y0: number, lz: number, w: number, h: number, d: number, spec: Partial<Omit<Facade, 'x' | 'y' | 'z' | 'sx' | 'sy' | 'sz' | 'yaw'>> & { glass: THREE.Color; frame: THREE.Color }, prism = false) => {
        const p = at(lx, lz);
        (prism ? prisms : boxes).push({ floor: 3.6, bay: 1.6, pattern: 0, lit: 0.42, seed: 0, ...spec, x: p.x, y: y0 + h / 2, z: p.z, sx: w, sy: h, sz: d, yaw: facing });
      },
    };
  }

  /** Draws the towers of `list` (their facade blocks into the lists above, the rest through the kit). */
  function drawTowers(list: TowerPlot[]) {
  for (const { plot: p, building: b } of list) {
    const spec = p.tower as TowerSpec;
    const f = p.full;
    // A district plot stands at any angle: its oriented box gives the centre and the size along and across its front.
    const ob = p.box;
    const x = ob ? ob.cx : (f.minX + f.maxX) / 2, z = ob ? ob.cz : (f.minZ + f.maxZ) / 2;
    const sideways = Math.abs(Math.sin(p.facing)) > 0.5;
    const w = ob ? ob.hx * 2 : sideways ? f.maxZ - f.minZ : f.maxX - f.minX, d = ob ? ob.hz * 2 : sideways ? f.maxX - f.minX : f.maxZ - f.minZ;
    const h = p.h, front = d / 2;
    const r = seeded(p.seed);
    const F = frame(x, z, p.facing);
    const { part, solid, face, at } = F;
    const glass = color(spec.glass), frameColor = color(spec.frame);
    const darkFrame = frameColor.clone().multiplyScalar(0.82);
    const look = { glass, frame: frameColor, floor: spec.floor, bay: spec.pattern === 3 ? 2.2 : spec.pattern === 2 ? 2.6 : 1.7, pattern: spec.pattern, seed: r() * 40, lit: spec.form === 'apartment' || spec.form === 'twin' ? 0.55 : 0.4 };
    const podiumLook = { ...look, pattern: 1, glass: glass.clone().multiplyScalar(0.85), lit: 0.6 };
    /** Lobby: a lit glass front, a canopy over the door and the name sign above it. */
    const lobby = (width: number, height = 5, signY = height + 1.3) => {
      part(0, height / 2, front + 0.12, width, height, 0.2, '#86a9b8', 'glassLit', false);
      part(0, height + 0.15, front + 2.2, Math.min(width, 9), 0.3, 4.2, '#d8dcdc');
      for (const k of [-3, 0, 3]) part(k, height - 0.05, front + 2.2, 0.5, 0.06, 0.5, '#fff4d8', 'lamp', false);
      for (const k of [-1, 1]) part(k * (Math.min(width, 9) / 2 - 0.3), height / 2, front + 3.9, 0.25, height, 0.25, '#9aa3a6');
      const s = at(0, front + 0.26);
      sign(b.name, b.subtitle, p.signColor, s.x, signY, s.z, Math.min(width * 0.9, 14), 1.6, p.facing, '#f4f7f8');
    };
    // Aviation lights (a district's five-storey chung cư has none).
    const beacon = (lx: number, y: number, lz: number) => { if (ob && y < 45) return; const q = at(lx, lz); beacons.push(new THREE.Vector3(q.x, y, q.z)); };

    if (spec.form === 'glass') {
      const pod = spec.podium;
      if (pod > 0) face(0, 0, 0, w, pod, d, podiumLook);
      const inset = pod > 0 ? 1.8 : 0;
      const sw = w - inset * 2, sd = d - inset * 2;
      const top = spec.crown === 'crown' ? h - 7 : h;
      face(0, pod, 0, sw, top - pod, sd, look);
      if (spec.crown === 'crown') {
        // A lantern crown: a narrower glass box ringed by a band of light.
        face(0, top, 0, sw - 2.4, 7, sd - 2.4, { ...look, pattern: 3, glass: glass.clone().lerp(color('#dfeef5'), 0.4) });
        part(0, top + 0.15, 0, sw + 0.2, 0.3, sd + 0.2, '#eaf6ff', 'lamp', false);
        part(0, h + 0.2, 0, sw - 2.2, 0.4, sd - 2.2, '#dfe6ea');
      }
      part(0, h + 1.4, -sd * 0.12, sw * 0.4, 2.4, sd * 0.4, '#9aa6a9');
      lobby(sw * 0.7, Math.max(5, Math.min(pod, 7)));
      beacon(0, h + 3, 0);
    } else if (spec.form === 'stepped') {
      // New York setbacks: four tiers of stone piers and slim windows, ledges at each step, a crown and spire.
      const tiers: [number, number][] = [[1, 0.42], [0.8, 0.66], [0.62, 0.84], [0.44, 1]];
      let base = 0;
      for (const [k, top] of tiers) {
        const y1 = h * top;
        face(0, base, 0, w * k, y1 - base, d * k, look);
        part(0, y1 + 0.3, 0, w * k + 0.7, 0.6, d * k + 0.7, darkFrame);
        base = y1;
      }
      solid('pyramid', 0, h + 5, 0, w * 0.44, 10, d * 0.44, '#cfd5d8');
      for (let k = 0; k < 4; k++) part(0, h + 1.2 + k * 2.2, 0, w * 0.44 * (1 - k * 0.2) + 0.4, 0.25, d * 0.44 * (1 - k * 0.2) + 0.4, '#f2efe6', 'lamp', false);
      solid('cylinder', 0, h + 22, 0, 0.35, 24, 0.35, '#c9ccce');
      lobby(w * 0.6, 6);
      beacon(0, h + 34.5, 0);
    } else if (spec.form === 'tapered') {
      // A lotus bud: octagonal sections that swell, then narrow towards the top, with a helipad cantilevered out.
      const pod = spec.podium;
      face(0, 0, 0, w, pod, d, podiumLook);
      const R = Math.min(w, d) / 2;
      const sections = 14;
      const span = h - pod;
      for (let k = 0; k < sections; k++) {
        const t = k / (sections - 1);
        const radius = R * (0.86 + 0.14 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5)) * (1 - 0.42 * t * t);
        face(0, pod + (span * k) / sections, 0, radius * 2, span / sections + 0.02, radius * 2, { ...look, bay: 1.4 }, true);
      }
      const padY = pod + span * 0.72;
      const pad = at(0, R * 0.95);
      shape('cylinder', '#565d63', pad.x, padY, pad.z, 8, 0.7, 8, 0, 0, true);
      shape('cylinder', '#3c4247', pad.x, padY + 0.4, pad.z, 7.4, 0.12, 7.4, 0, 0, false);
      shape('cylinder', '#f0f0ea', pad.x, padY + 0.48, pad.z, 5.6, 0.04, 5.6, 0, 0, false);
      shape('cylinder', '#3c4247', pad.x, padY + 0.5, pad.z, 5.1, 0.04, 5.1, 0, 0, false);
      for (const [lx, lz, sx, sz] of [[-1.3, 0, 0.5, 3.4], [1.3, 0, 0.5, 3.4], [0, 0, 2.1, 0.5]]) {
        const q = at(lx, R * 0.95 + lz);
        box('#f4f1e6', q.x, padY + 0.55, q.z, sx, 0.04, sz, p.facing, false);
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        box('#ffe9a8', pad.x + Math.cos(a) * 7.2, padY + 0.5, pad.z + Math.sin(a) * 7.2, 0.3, 0.12, 0.3, 0, false, 'lamp');
      }
      solid('cone', 0, h + 6, 0, R * 0.32, 12, R * 0.32, '#cfd8dc');
      lobby(w * 0.6, Math.min(7, pod));
      beacon(0, h + 12.5, 0);
    } else if (spec.form === 'bundle') {
      // Nine square tubes of different heights, tallest in the middle, on a podium; a spire on top and a band of
      // light at each tube's top. The observation deck is the lit band near the top of the central tube.
      const pod = spec.podium;
      face(0, 0, 0, w, pod, d, podiumLook);
      const t = (w - 2) / 3;
      const heights = [[0.62, 0.8, 0.66], [0.84, 1, 0.9], [0.7, 0.88, 0.74]];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const top = h * heights[i][j];
        const lx = (i - 1) * t, lz = (j - 1) * t;
        face(lx, pod, lz, t - 0.3, top - pod, t - 0.3, look);
        part(lx, top + 0.2, lz, t - 0.1, 0.4, t - 0.1, '#eaf3ff', 'lamp', false);
      }
      face(0, h * 0.9, 0, t + 0.5, 7, t + 0.5, { ...look, pattern: 1, glass: color('#a9cbe0'), lit: 0.95 });
      solid('cylinder', 0, h + 11, 0, 0.6, 22, 0.6, '#d4dadd');
      solid('cone', 0, h + 23, 0, 0.6, 3, 0.6, '#d4dadd');
      lobby(w * 0.62, Math.min(8, pod));
      beacon(0, h + 24.5, 0);
    } else if (spec.form === 'twin' || spec.form === 'apartment') {
      // Apartment slabs with a balcony on every floor; the twins share a podium and a sky bridge.
      const pod = spec.podium;
      if (pod > 0) face(0, 0, 0, w, pod, d, podiumLook);
      const slabs = spec.form === 'twin' ? [[-w * 0.26, w * 0.4, h], [w * 0.26, w * 0.4, h * 0.86]] : [[0, w, h]];
      const sd = spec.form === 'twin' ? d * 0.74 : d;
      for (const [lx, sw, top] of slabs) {
        face(lx, pod, 0, sw, top - pod, sd, look);
        for (let y = pod + spec.floor; y < top - 2; y += spec.floor) {
          for (const side of [1, -1]) {
            part(lx, y, side * (sd / 2 + 0.65), sw - 0.6, 0.18, 1.3, '#ece6da', 'solid', false);
            part(lx, y + 0.55, side * (sd / 2 + 1.28), sw - 0.6, 0.9, 0.06, '#9fb8c0', 'glass', false);
          }
        }
        if (spec.crown === 'garden') {
          part(lx, top + 0.35, 0, sw, 0.7, sd, '#78a35f');
          for (let k = 0; k < 3; k++) solid('puff', lx + (k - 1) * sw * 0.28, top + 1.6, (r() - 0.5) * sd * 0.5, 1.6, 1.4, 1.6, '#5f9a5a', false);
        } else {
          for (let k = 0; k < 2; k++) solid('cylinder', lx + (k - 0.5) * sw * 0.4, top + 1.3, -sd * 0.2, 1.1, 2.6, 1.1, '#cfd3d4');
          part(lx, top + 1.5, sd * 0.15, 4, 3, 4, '#d8d0c0');
        }
        beacon(lx, top + 3, 0);
      }
      if (spec.form === 'twin') face(0, h * 0.62, 0, w * 0.14, 6, sd * 0.4, { ...look, pattern: 1, lit: 0.8 });
      // Shops along the ground floor.
      for (let k = 0; k < 3; k++) part(-w / 3 + (k * w) / 3, 4.1, front + (spec.form === 'twin' ? 0.9 : 1.6), w / 3 - 0.8, 0.15, 1.6, ['#c9493b', '#3f6f9f', '#5e927c'][k]);
      lobby(w * 0.5, Math.max(4.4, Math.min(pod, 6)));
    } else if (spec.form === 'hotel') {
      const pod = spec.podium;
      face(0, 0, 0, w, pod, d, podiumLook);
      face(0, pod, 0, w - 2, h - pod, d - 2, look);
      for (let k = 0; k <= 6; k++) part(-w / 2 + 0.6 + (k * (w - 1.2)) / 6, pod / 2, front + 1.2, 0.6, pod, 0.6, '#efe6d2');
      part(0, pod + 0.3, front + 1.2, w, 0.6, 2.8, '#e2d6bd');
      // A rooftop neon sign facing the river.
      const s = at(0, front - 0.95);
      part(0, h + 3.2, front - 1.4, w * 0.74, 5.2, 0.4, '#2a2228');
      sign(b.name, b.subtitle, p.signColor, s.x, h + 3.2, s.z, w * 0.7, 4.6, p.facing, '#1c1418');
      part(0, h + 5.95, front - 1.2, w * 0.76, 0.18, 0.18, p.signColor, 'neon', false);
      part(0, h + 0.45, front - 1.2, w * 0.76, 0.18, 0.18, p.signColor, 'neon', false);
      lobby(w * 0.5, 5, pod + 1.5);
      beacon(0, h + 6.5, 0);
    } else if (spec.form === 'mall') {
      // A glazed podium of shops with an atrium entrance and a big LED screen, an office tower behind it.
      const pod = spec.podium;
      face(0, 0, 0, w, pod, d, { ...podiumLook, floor: 6, glass: color('#7fa6bb') });
      part(0, pod / 2, front + 0.3, w * 0.36, pod, 0.6, '#9cc3d6', 'glassLit', false);
      part(0, pod + 0.4, 0, w + 0.4, 0.8, d + 0.4, '#d9dde0');
      face(-w * 0.14, pod, -d * 0.14, w * 0.56, h - pod, d * 0.56, look);
      screens.push({ at: at(w * 0.28, front + 0.35), y: pod * 0.58, w: w * 0.36, h: pod * 0.46, yaw: p.facing });
      lobby(w * 0.34, 6, pod - 2.2);
      beacon(-w * 0.14, h + 2, -d * 0.14);
    } else if (spec.form === 'colonial') {
      // A French-era theatre: cream walls, arched bays, a columned porch under a pediment and a small dome.
      const body = 14, cream = '#f0d79a', trim = '#f8ecd2';
      part(0, body / 2, 0, w, body, d, cream);
      part(0, body + 0.3, 0, w + 0.8, 0.6, d + 0.8, trim);
      for (let k = 0; k < 12; k++) part(-w / 2 + 0.6 + (k * (w - 1.2)) / 11, body + 1.0, front + 0.2, 0.35, 0.8, 0.35, trim);
      part(0, body + 0.65, front + 0.2, w, 0.2, 0.4, trim);
      for (let k = 0; k < 9; k++) {
        const lx = -w / 2 + 2 + (k * (w - 4)) / 8;
        if (Math.abs(lx) < 4.5) continue;
        part(lx, 4.6, front + 0.06, 1.7, 3.6, 0.1, '#5a6c78', 'glassLit', false);
        part(lx, 6.6, front + 0.1, 2.0, 0.4, 0.14, trim);
        part(lx, 10.4, front + 0.06, 1.5, 2.6, 0.1, '#5a6c78', 'glass', false);
      }
      const pw = 9.5;
      part(0, 11, front - 1.6, pw, 22, 3.6, '#f3dfa8');
      part(0, 7, front + 0.25, 4.2, 6.5, 0.12, '#4a5a64', 'glassLit', false);
      part(0, 15.5, front + 0.25, 3.2, 4.5, 0.12, '#4a5a64', 'glass', false);
      for (let k = 0; k < 6; k++) solid('cylinder', -pw / 2 + 0.6 + (k * (pw - 1.2)) / 5, 5.2, front + 1.6, 0.42, 10.4, 0.42, trim);
      part(0, 10.7, front + 1.6, pw + 0.6, 0.6, 1.6, trim);
      solid('gable', 0, 22.9, front - 1.6, pw + 0.6, 2.6, 3.8, '#f6e6bf');
      solid('cylinder', 0, 24.9, -1, 2.6, 2.2, 2.6, '#f3dfa8');
      solid('cone', 0, 27.6, -1, 3.0, 3.6, 3.0, '#6f9a8e');
      for (const k of [-1, 1]) part(k * (w / 2 - 2), 15.2, front - 1, 3, 2.4, 3, '#f3dfa8');
      part(0, 0.25, front + 3.2, pw + 3, 0.5, 2.4, '#e9e1cf');
      part(0, 0.5, front + 2.4, pw + 2, 0.5, 1.2, '#e9e1cf');
      const s = at(0, front + 2.45);
      sign(b.name, b.subtitle, p.signColor, s.x, 11.6, s.z, 8.5, 1.3, p.facing, '#fbf3df');
      for (const k of [-1, 1]) {
        const q = at(k * (pw / 2 + 2.6), front + 3.4);
        shape('cylinder', '#2b2f33', q.x, 2, q.z, 0.12, 4, 0.12, 0, 0, false);
        shape('ball', '#fff2c8', q.x, 4.2, q.z, 0.35, 0.35, 0.35, 0, 0, false, 'lamp');
      }
    } else {
      // Mid-rise: a shop on the ground floor, storeys of windows above, and a roof with tanks, a garden or a billboard.
      const shop = spec.podium;
      part(0, shop / 2, 0, w, shop, d, darkFrame);
      face(0, shop, 0, w, h - shop, d, { ...look, lit: 0.5 });
      // The shopfront: glass in bays between dark mullions under a transom, a framed door in the middle bay, goods (or
      // the menu) showing in the glass and a tube light under the transom that glows after dark (not the whole pane).
      const F = kit.frame(x, z, p.facing);
      const paneW = w - 1.2, paneH = shop - 1.4, py = shop / 2 - 0.2, bays = Math.max(2, Math.min(5, Math.round(paneW / 3)));
      part(0, py, front + 0.04, paneW, paneH, 0.08, '#4a5f70', 'solid', false);
      for (let k = 0; k <= bays; k++) part(-paneW / 2 + (k * paneW) / bays, py, front + 0.1, 0.12, paneH, 0.1, darkFrame);
      part(0, py + paneH / 2 - 0.7, front + 0.1, paneW, 0.1, 0.1, darkFrame);
      const doorX = bays % 2 ? 0 : paneW / bays / 2;
      part(doorX, 1.15, front + 0.12, 1.8, 2.3, 0.05, '#33404a', 'solid', false);
      for (const k of [-1, 1]) part(doorX + k * 0.9, 1.15, front + 0.14, 0.1, 2.3, 0.06, darkFrame);
      part(doorX, 2.32, front + 0.14, 1.9, 0.1, 0.06, darkFrame);
      part(0, py + paneH / 2 - 0.82, front + 0.12, paneW - 0.4, 0.07, 0.07, '#eef8ff', 'tube', false);
      kit.fine(true);
      const inside = b.kind === 'food' || b.kind === 'cafe' ? DECAL.menu : DECAL.goods;
      for (let k = 0; k < bays; k++) {
        const cx = -paneW / 2 + ((k + 0.5) * paneW) / bays;
        if (Math.abs(cx - doorX) < 0.95) continue;
        F.decal(inside, cx, py - 0.25, front + 0.095, Math.min(1.7, paneW / bays - 0.6), Math.min(1.5, paneH - 1.7));
      }
      kit.fine(false);
      part(0, shop - 0.4, front + 0.9, w - 0.4, 0.15, 1.8, ['#c9493b', '#3f6f9f', '#5e927c', '#d9a441', '#7d5ba6'][Math.floor(r() * 5)]);
      const s = at(0, front + 0.14);
      sign(b.name, b.subtitle, p.signColor, s.x, shop + 1.0, s.z, Math.min(w - 1, 9), 1.25, p.facing);
      if (b.kind === 'home' || b.kind === 'hotel') {
        for (let y = shop + 3; y < h - 1.5; y += spec.floor) part(0, y, front + 0.5, w - 1.4, 0.15, 1.0, '#e6e0d4', 'solid', false);
      }
      // Life on the facade: iron railings and washing on the flats' balconies (their AC units out there too), AC units
      // under the office windows, a light box beside the shop sign.
      const D = kit.frame(x, z, p.facing), q = seeded(p.seed * 7 + 3), iron = IRON[Math.floor(q() * IRON.length)];
      const flats = b.kind === 'home' || b.kind === 'hotel';
      for (let y = shop + 3; y < h - 1.5; y += spec.floor) {
        if (flats) {
          railing(D, -(w - 1.4) / 2, (w - 1.4) / 2, y + 0.07, front, 1.0, iron, true);
          for (let lx = -w / 2 + 1.6; lx < w / 2 - 1.2; lx += 3.1) if (q() < 0.35) acUnit(D, lx, y + 0.36, front + 0.12);
          if (q() < 0.25) { kit.fine(true); laundry(D, q, (q() - 0.5) * (w - 5), y + 2.3, front + 0.75, Math.min(w - 3, 3.2)); kit.fine(false); }
        } else for (let lx = -w / 2 + 1.3; lx < w / 2 - 1; lx += 2.6) if (q() < 0.25) acUnit(D, lx, y - 0.9, front + 0.02);
      }
      const tag = FRONT_OF[counterKeyOf(b) ?? ''];
      if (tag) verticalSign(D, tag[1], (q() < 0.5 ? -1 : 1) * (w / 2 - 0.35), shop + 2.3, front, ...LIGHT_BOXES[Math.floor(q() * LIGHT_BOXES.length)]);
      if (spec.crown === 'sign') {
        part(0, h + 2.4, -d * 0.1, w * 0.8, 3.4, 0.25, '#2b2f33');
        const ad = at(0, -d * 0.1 + 0.15);
        sign(['NƯỚC MẮM PHÚ QUỐC', 'CÀ PHÊ SỮA ĐÁ', 'ĐIỆN THOẠI GIÁ RẺ', 'BIA SÀI GÒN XANH'][Math.floor(r() * 4)], 'QUẢNG CÁO', ['#b5223b', '#2f5d8a', '#2f7a3a', '#c27c1a'][Math.floor(r() * 4)], ad.x, h + 2.4, ad.z, w * 0.78, 3.2, p.facing, '#fff8e6');
        for (const k of [-1, 1]) part(k * w * 0.35, h + 0.5, -d * 0.1, 0.2, 1.2, 0.2, '#2b2f33');
      } else if (spec.crown === 'garden') {
        part(0, h + 0.3, 0, w - 0.4, 0.6, d - 0.4, '#7aa35f');
        for (let k = 0; k < 2; k++) solid('puff', (k - 0.5) * w * 0.4, h + 1.3, (r() - 0.5) * d * 0.4, 1.2, 1.1, 1.2, '#5f9a5a', false);
      } else {
        solid('cylinder', -w * 0.25, h + 1.0, -d * 0.2, 0.8, 2, 0.8, '#d8dcdd');
        part(w * 0.2, h + 0.5, -d * 0.25, 1.2, 1, 0.8, '#bfc4c6');
      }
      part(0, h + 0.15, 0, w + 0.2, 0.3, d + 0.2, darkFrame);
    }
  }

  }
  drawTowers(plots);

  // ---- Across the river and beyond the east fence: a skyline in the haze (no colliders, nobody goes there). ----
  // Each tower's draws are made whether it stands or not (a wired district took its place), so the rest stay put.
  const far = seeded(4242);
  const farGlass = ['#6f8fa8', '#7d9aa5', '#5d7f96', '#8aa4b0', '#6a8c8a'], farFrame = ['#c8ccd0', '#d6cfc0', '#b9c2c8', '#e0d8c8'];
  // With Thủ Thiêm's strip built (step 18) they stand beyond its P1 edge instead (z -490..-580: the new urban area
  // still going up, P2), so the skyline across the river from Bạch Đằng and An Hòa stays, lit at night.
  for (let i = 0; i < 34; i++) {
    const x = -200 + i * 19 + far() * 8, back = far(), z = opts.hazeNorth === false ? -490 - back * 90 : -226 - back * 70;
    const w = 14 + far() * 12, d = 14 + far() * 10, h = (opts.hazeNorth === false ? 50 : 30) + far() * far() * 150;
    const tower: Facade = { x, y: h / 2, z, sx: w, sy: h, sz: d, yaw: 0, glass: color(farGlass[Math.floor(far() * farGlass.length)]), frame: color(farFrame[Math.floor(far() * farFrame.length)]), floor: 3.6, bay: 1.8, pattern: Math.floor(far() * 4), lit: 0.4, seed: far() * 30 };
    boxes.push(tower);
    if (h > 70) beacons.push(new THREE.Vector3(x, h + 1, z));
  }
  for (let i = 0; i < 16; i++) {
    const x = 380 + far() * 120, z = -120 + i * 17 + far() * 6;
    const w = 14 + far() * 10, d = 14 + far() * 10, h = 24 + far() * far() * 110;
    const tower: Facade = { x, y: h / 2, z, sx: w, sy: h, sz: d, yaw: 0, glass: color(farGlass[Math.floor(far() * farGlass.length)]), frame: color(farFrame[Math.floor(far() * farFrame.length)]), floor: 3.6, bay: 1.8, pattern: Math.floor(far() * 4), lit: 0.4, seed: far() * 30 };
    if (opts.hazeEast !== false) boxes.push(tower);
  }

  // ---- The instanced facade meshes (one shared material; districts add theirs tile by tile). ----
  const uniforms = { night: { value: 0 }, sky: { value: new THREE.Color('#bcd2dc') } };
  const material = facadeMaterial(uniforms);
  kit.materials.push(material);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), size = new THREE.Vector3();
  /** Where facadeMesh and the screens and beacons go (the world's root, or a district tile). */
  let target: THREE.Object3D = kit.root;
  const made: THREE.Object3D[] = [];
  function facadeMesh(base: THREE.BufferGeometry, list: Facade[]) {
    const geometry = base;
    const grid = new Float32Array(list.length * 4), glassA = new Float32Array(list.length * 4), frameA = new Float32Array(list.length * 3);
    list.forEach((f, i) => {
      grid.set([f.floor, f.bay, f.pattern, f.seed], i * 4);
      glassA.set([f.glass.r, f.glass.g, f.glass.b, f.lit], i * 4);
      frameA.set([f.frame.r, f.frame.g, f.frame.b], i * 3);
    });
    geometry.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grid, 4));
    geometry.setAttribute('aGlass', new THREE.InstancedBufferAttribute(glassA, 4));
    geometry.setAttribute('aFrame', new THREE.InstancedBufferAttribute(frameA, 3));
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((f, i) => mesh.setMatrixAt(i, matrix.compose(pos.set(f.x, f.y, f.z), q.setFromAxisAngle(up, f.yaw), size.set(f.sx, f.sy, f.sz))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    kit.geometries.push(geometry);
    target.add(mesh);
    made.push(mesh);
    return mesh;
  }
  if (boxes.length) facadeMesh(new THREE.BoxGeometry(1, 1, 1), boxes);
  // Octagonal sections, flat-shaded so each facet gets its own window grid.
  if (prisms.length) {
    const octagon = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).toNonIndexed();
    octagon.computeVertexNormals();
    facadeMesh(octagon, prisms);
  }

  // ---- LED screens (an animated canvas, scrolled through a few adverts) and red aviation beacons. ----
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let screenTexture: THREE.CanvasTexture | null = null;
  if (canvas) {
    canvas.width = 512; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const ads: [string, string, string, string][] = [['SIÊU SALE', 'GIẢM 50%', '#ff3d7f', '#2a0f3a'], ['PHIM MỚI', 'RẠP TẦNG 5', '#3dd6ff', '#0c2236'], ['ẨM THỰC', 'TẦNG 3 • 30 MÓN', '#ffc23d', '#3a1f0c'], ['SÀI GÒN', 'VUI VẺ MỖI NGÀY', '#7dff9a', '#0c2a1a']];
      ads.forEach(([title, sub, accent, bg], k) => {
        const y = k * 256;
        const g = ctx.createLinearGradient(0, y, 512, y + 256);
        g.addColorStop(0, bg); g.addColorStop(1, '#000000');
        ctx.fillStyle = g; ctx.fillRect(0, y, 512, 256);
        ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 92px Arial, sans-serif'; ctx.fillText(title, 256, y + 100, 480);
        ctx.font = '700 40px Arial, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(sub, 256, y + 190, 470);
      });
      screenTexture = new THREE.CanvasTexture(canvas);
      screenTexture.colorSpace = THREE.SRGBColorSpace;
      screenTexture.repeat.set(1, 0.25);
      kit.textures.push(screenTexture);
    }
  }
  const screenMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', map: screenTexture, toneMapped: false });
  kit.materials.push(screenMaterial);
  const screenGeometry = new THREE.PlaneGeometry(1, 1);
  kit.geometries.push(screenGeometry);
  const beaconGeometry = new THREE.IcosahedronGeometry(0.55, 0);
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: '#ff3a2a', toneMapped: false, fog: false });
  kit.geometries.push(beaconGeometry);
  kit.materials.push(beaconMaterial);
  let beaconMeshes = 0;
  /** The screens and the beacons collected so far, into `target`. */
  function screensAndBeacons() {
    for (const s of screens) {
      const mesh = new THREE.Mesh(screenGeometry, screenMaterial);
      mesh.position.set(s.at.x, s.y, s.at.z);
      mesh.rotation.y = s.yaw;
      mesh.scale.set(s.w, s.h, 1);
      target.add(mesh);
      made.push(mesh);
    }
    if (!beacons.length && (beaconMeshes || target !== kit.root)) return;
    const beaconMesh = new THREE.InstancedMesh(beaconGeometry, beaconMaterial, Math.max(1, beacons.length));
    beacons.forEach((b, i) => beaconMesh.setMatrixAt(i, matrix.makeTranslation(b.x, b.y, b.z)));
    beaconMesh.count = beacons.length;
    beaconMesh.computeBoundingSphere();
    target.add(beaconMesh);
    made.push(beaconMesh);
    beaconMeshes++;
  }
  screensAndBeacons();

  let advert = 0;
  return {
    /** Lit windows after dark (no power in zombie mode), and the sky the glass reflects. */
    setAtmosphere(night: number, power: number, sky: THREE.Color) {
      uniforms.night.value = night * power;
      uniforms.sky.value.copy(sky);
      screenMaterial.color.setScalar(power ? 0.55 + night * 0.45 : 0.04);
      beaconMaterial.visible = power > 0;
    },
    /**
     * Towers of a district tile (chung cư, the CBD stamps): their details through the kit (whatever sink the world
     * has set), their facade blocks, screens and beacons into `into`. `dry` (the sign pass) lays out signs only.
     * Returns the meshes made.
     */
    /**
     * Far stand-ins for the districts' tall buildings: a district tile is hidden past the fog cut, but a tower's facade
     * hazes out far beyond it (its fog is softened), so from across the river the skyline would vanish. One facade box
     * each (lit windows at night) and a beacon on the tall ones, in the world's root; `show(i, on)` hides one while
     * its own tile draws the real building.
     */
    standIns(list: { x: number; z: number; w: number; d: number; h: number; yaw: number; seed: number; glass: string; frame: string; lit: number }[]) {
      if (!list.length) return { show: (() => { /* none */ }) as (i: number, on: boolean) => void };
      const facades: Facade[] = list.map((f) => ({ x: f.x, y: f.h / 2, z: f.z, sx: f.w, sy: f.h, sz: f.d, yaw: f.yaw, glass: color(f.glass), frame: color(f.frame), floor: 3.4, bay: 1.8, pattern: f.seed % 4, lit: f.lit, seed: f.seed % 30 }));
      target = kit.root;
      const mesh = facadeMesh(new THREE.BoxGeometry(1, 1, 1), facades);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      const tall = list.map((f, i) => (f.h >= 70 ? i : -1)).filter((i) => i >= 0);
      const lights = new THREE.InstancedMesh(beaconGeometry, beaconMaterial, Math.max(1, tall.length));
      lights.count = tall.length;
      lights.frustumCulled = false;
      const lightOf = new Map(tall.map((i, k) => [i, k]));
      const place = (i: number, on: boolean) => {
        const f = facades[i];
        mesh.setMatrixAt(i, on ? matrix.compose(pos.set(f.x, f.y, f.z), q.setFromAxisAngle(up, f.yaw), size.set(f.sx, f.sy, f.sz)) : matrix.makeScale(0, 0, 0));
        const k = lightOf.get(i);
        if (k !== undefined) lights.setMatrixAt(k, on ? matrix.makeTranslation(f.x, f.sy + 1, f.z) : matrix.makeScale(0, 0, 0));
      };
      facades.forEach((_, i) => place(i, true));
      kit.root.add(lights);
      const shown = new Uint8Array(facades.length).fill(1);
      return {
        show(i: number, on: boolean) {
          if (shown[i] === (on ? 1 : 0)) return;
          shown[i] = on ? 1 : 0;
          place(i, on);
          mesh.instanceMatrix.needsUpdate = true;
          lights.instanceMatrix.needsUpdate = true;
        },
      };
    },
    addTowers(list: TowerPlot[], into: THREE.Object3D, dry = false) {
      screens = []; boxes = []; prisms = []; beacons = [];
      drawTowers(list);
      made.length = 0;
      if (dry) return [] as THREE.Object3D[];
      target = into;
      if (boxes.length) facadeMesh(new THREE.BoxGeometry(1, 1, 1), boxes);
      if (prisms.length) { const octagon = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).toNonIndexed(); octagon.computeVertexNormals(); facadeMesh(octagon, prisms); }
      screensAndBeacons();
      target = kit.root;
      return made.slice();
    },
    update(time: number) {
      // Beacons blink once a second; the screens change advert every few seconds.
      const on = time % 1.2 < 0.5;
      beaconMaterial.color.setRGB(on ? 1 : 0.18, on ? 0.23 : 0.04, on ? 0.16 : 0.03);
      const next = Math.floor(time / 5) % 4;
      if (screenTexture && next !== advert) { advert = next; screenTexture.offset.y = 0.75 - next * 0.25; }
    },
  };
}
