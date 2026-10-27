import * as THREE from 'three';
import { BUILDINGS, COLLIDERS, DOWNTOWN_X, LAMPS, LAND, PLOTS, RIVER, RIVER_BED, ROADS_X, ROADS_Z, SCENERY, VENUES, inRect, pathClearance, pointClear, type Building, type Plot, type Pole, type Prop, type Rect, type Tree } from './city';
import { buildSkyline } from './skyline';
import { APPROACHES, lightFor, type Light } from './signals';
import { createSigns } from './map/signs';
import { STREETS_H, STREETS_V } from './map/consts';
import { ASPHALT_HALF, CURB_HEIGHT, PIER_DECK, SIDEWALK_EDGE, STEPS_DROP, STEPS_TOP, groundHeight, onSidewalk } from './map/terrain';
import { COUNTERS, PLACES, counterKeyOf, isOpen, type Hours } from './counters';
import { LOTS, SPOTS } from './parking';
import { MODE_LEVEL, detectStartLevel } from './quality';
import { CLOTH, DECAL, type ClothCell, type ClothOpts, type ColorLike, type DecalCell, type DecalOpts, type Frame, type Kind, type Role, type SmokeKind, type TagStyle } from './kit';
import { patchGlow, patchRoofTiles, patchTiles, patchWall, surfaceDetail, surfaceNoise } from './surfaces';
import { buildCables, buildCloth, buildDecals, buildSmoke, cableUniforms, clothAtlas, clothMaterial, decalAtlas, type Cable, type ClothItem, type DecalQuad, type Emitter } from './street-dressing';
import { FRONT_OF, IRON, LAUNDRY, LED_COLORS, LIGHT_BOXES, ROOF_TILES, TON, acUnit, cage, grille, houseFlag, laundry, ledBorder, maiThai, openFront, pillarWidth, railing, rooftop, thoThien, verticalSign, type FrontKind } from './facades';

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number; top?: number };

// The ground (sidewalks, raised squares, docks, the river bed) lives in map/terrain.ts; it stays importable from here.
export { CURB_HEIGHT, PIER_DECK, dockAt, groundHeight, onSidewalk } from './map/terrain';
const ROAD_FIRST = ROADS_Z[0];

/** Seat tops of the street furniture above its base (the base is world y 0 on the road, sunk 0.08 below the asphalt). */
export const SEAT_TOP = { bench: 0.46, stool: 0.42 } as const;
/** How far furniture at (x, z) is raised: it stands on the walkable surface there (sidewalk, lawn, plaza). */
export const furnitureLift = (x: number, z: number) => groundHeight(x, z) - 0.1;
/** Height of a seat above the ground a sitter at (x, z) stands on (groundHeight there): what npcs sit at. */
export const seatHeight = (seat: keyof typeof SEAT_TOP, x: number, z: number) => SEAT_TOP[seat] + furnitureLift(x, z) - groundHeight(x, z);

const PI = Math.PI;
const HALF_PI = PI / 2;
const AWNINGS = ['#cf795d', '#5e927c', '#d9a441', '#4f7fa8', '#b8574f', '#7d9a52'];
const DOORS = ['#7a5a3f', '#5d7f86', '#8a6b4a', '#6c7a5a', '#4f6577', '#9b5b46'];
const SHUTTERS = ['#5f8f7a', '#7aa0b8', '#b0774f', '#6f8f5a', '#4f7a8a'];
const FLOWERS = ['#ef8fb0', '#e5484d', '#f5c84a', '#f4f1e8', '#a07cc5', '#f08c3a', '#ff6f91'];
const LEAVES = ['#689b6b', '#87b477', '#4f875c', '#5e9a5a', '#76a86a'];
const BAY_COLORS = ['#e9cf8f', '#f0dcae', '#cfe0c8', '#e3b9a3', '#c9d7e3', '#efe6d2', '#d9a6a0', '#bcd0b5', '#f2c47a', '#d7c4dd', '#a9c9c2', '#e6c3a0'];
/** Buildings with a counter: game.ts pulls a roller shutter over their front outside opening hours (with its drum). */
const COUNTERED = new Set(PLACES.filter((p) => p.kind === 'counter' && p.building >= 0).map((p) => p.building));
/** Each counter building's opening hours (its light pool goes dark when it is closed). */
const HOURS = new Map<number, Hours>(PLACES.filter((p) => p.kind === 'counter' && p.building >= 0 && COUNTERS[p.key]).map((p) => [p.building, COUNTERS[p.key].hours]));
const VENUE_OF = new Map(VENUES.map((v) => [v.building.id, v]));
/** Decals that light up after dark: what is inside a lit shop front, and the vé số board in its glass case. */
const GLOWING = new Set<DecalCell>([DECAL.goods, DECAL.snacks, DECAL.menu, DECAL.fridge, DECAL.familyAltar, DECAL.poster, DECAL.lottery, DECAL.thanTai]);

/**
 * Where a shophouse's sign board hangs, in its local frame (lz is the sign's face). An original shophouse with
 * balconies hangs it on the first balcony's front, where it used to be half hidden behind the balcony; the others
 * over the door. A tube house's sign sits over its open front.
 */
export function signSpot(p: Plot) {
  const sideways = Math.abs(Math.sin(p.facing)) > 0.5;
  const w = sideways ? p.full.maxZ - p.full.minZ : p.full.maxX - p.full.minX, front = (sideways ? p.full.maxX - p.full.minX : p.full.maxZ - p.full.minZ) / 2;
  if (p.style !== 'legacy') return { balcony: false, y: 4.05, lz: front + 0.25, w: w - 0.6, h: 1.1 };
  if (p.legacy % 3 !== 1 && p.h - 0.8 > 5.2) return { balcony: true, y: 4.45, lz: front + 1.36, w: w - 1.1, h: 1.0 };
  return { balcony: false, y: Math.min(p.h - 0.65, 3.8), lz: front + 0.36, w: w - 0.65, h: 1.1 };
}

/**
 * A palm frond along +x (length 1, rooted at the origin): it rises a little, then arches down, folds along
 * the midrib and has a ragged leaflet edge. Both faces are modelled so it reads from above and below.
 */
function frondGeometry() {
  const N = 8;
  const station = (i: number) => {
    const u = i / N;
    const y = 0.18 * u - 0.55 * u * u;
    const w = (0.035 + 0.19 * Math.sin(PI * Math.min(1, u * 1.06))) * (i % 2 ? 0.62 : 1);
    return { mid: [u, y, 0], left: [u, y - w * 0.4, -w], right: [u, y - w * 0.4, w] };
  };
  const top: number[][] = [];
  for (let i = 0; i < N; i++) {
    const a = station(i), b = station(i + 1);
    top.push(a.mid, b.left, a.left, a.mid, b.mid, b.left, a.mid, a.right, b.right, a.mid, b.right, b.mid);
  }
  const under = top.map(([x, y, z]) => [x, y - 0.012, z]);
  for (let i = 0; i < under.length; i += 3) [under[i + 1], under[i + 2]] = [under[i + 2], under[i + 1]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...top, ...under].flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A roof prism with its ridge along x; `inset` > 0 hips the ends. Unit size, centred on the origin. */
function roofGeometry(inset: number) {
  const a = [-0.5, -0.5, 0.5], b = [0.5, -0.5, 0.5], c = [0.5, -0.5, -0.5], d = [-0.5, -0.5, -0.5];
  const r1 = [-0.5 + inset, 0.5, 0], r2 = [0.5 - inset, 0.5, 0];
  const faces = [a, b, r2, a, r2, r1, c, d, r1, c, r1, r2, d, a, r1, b, c, r2, a, d, c, a, c, b];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function seeded(start: number) {
  let v = Math.abs(Math.floor(start)) % 2147483646 + 1;
  return () => (v = (v * 16807) % 2147483647) / 2147483647;
}
const pickOf = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
const centre = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/** Whether the segment a->b passes through the box over `r` from the ground up to `top` (slab test). */
function segmentHitsBlock(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: Rect, top: number) {
  let near = 0, far = 1;
  const slab = (origin: number, delta: number, lo: number, hi: number) => {
    if (Math.abs(delta) < 1e-6) return origin >= lo && origin <= hi;
    let ta = (lo - origin) / delta, tb = (hi - origin) / delta;
    if (ta > tb) [ta, tb] = [tb, ta];
    near = Math.max(near, ta);
    far = Math.min(far, tb);
    return near <= far;
  };
  return slab(ax, bx - ax, r.minX, r.maxX) && slab(az, bz - az, r.minZ, r.maxZ) && slab(ay, by - ay, 0, top);
}

/** World radius of the see-through hole cut around the player when a building is in the way. */
const CUT_RADIUS = 3.6;

/** The An Hòa neighbourhood, drawn from the layout in city.ts. All artwork is generated locally. */
export function buildWorld(scene: THREE.Scene) {
  const buildStart = performance.now();
  const root = new THREE.Group();
  root.name = 'Pho Viet neighbourhood';
  scene.add(root);
  /** Small detail (washing, antennas, coils, service drops, stickers) that lower quality levels hide. */
  const fineRoot = new THREE.Group();
  fineRoot.name = 'Fine detail';
  root.add(fineRoot);
  // Props on a sidewalk are drawn on the raised pavement: their tops are that much higher too.
  // The parked scooters are vehicles now (vehicles.ts curb spots): they are neither drawn nor solid here.
  const parked = SCENERY.props.filter((p) => p.kind === 'scooter');
  const isParked = (c: Rect) => c.top !== undefined && parked.some((p) => Math.abs((c.minX + c.maxX) / 2 - p.x) < 1e-6 && Math.abs((c.minZ + c.maxZ) / 2 - p.z) < 1e-6 && Math.abs(c.maxX - c.minX - p.sx) < 1e-6 && Math.abs(c.maxZ - c.minZ - p.sz) < 1e-6);
  const colliders: Collider[] = COLLIDERS.filter((c) => !isParked(c)).map((c) => (c.top === undefined ? { ...c } : { ...c, top: c.top + (onSidewalk((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2) ? CURB_HEIGHT : 0) }));
  /** Bench seats, stools and café tables as low boxes with a top, for ragdolls only (people walk round them anyway). */
  const seats: Collider[] = [];
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const primitives: Record<Kind, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 7),
    ball: new THREE.IcosahedronGeometry(1, 0),
    bead: new THREE.OctahedronGeometry(1, 0),
    gable: roofGeometry(0),
    hip: roofGeometry(0.28),
    pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(PI / 4),
    // Foliage and wood: a soft twelve-sided leaf clump, a tapered trunk or branch, and a palm frond.
    puff: new THREE.DodecahedronGeometry(1, 0),
    trunk: new THREE.CylinderGeometry(0.62, 1, 1, 7),
    frond: frondGeometry(),
  };
  geometries.push(...Object.values(primitives));
  const roles: Record<Role, THREE.MeshStandardMaterial> = {
    solid: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 }),
    ground: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffbf73', emissiveIntensity: 0 }),
    glassLit: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffc77f', emissiveIntensity: 0 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: '#ffdca0', emissiveIntensity: 0 }),
    lantern: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: '#ff5a2c', emissiveIntensity: 0 }),
    water: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0.08 }),
    // Neon tubes glow in their own (instance) colour, brighter at night.
    neon: new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.5 }),
    // Weathered render, sidewalk paving (never cut away), tiled roof decks and cladding, barrel roof tiles.
    wall: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93 }),
    paving: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 }),
    tiles: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 }),
    roofTile: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    // Shop fluorescent tubes and blinking LED borders, lit in their instance colour after dark.
    tube: new THREE.MeshStandardMaterial({ color: '#d8dde0', roughness: 0.5, emissive: '#e8f4ff', emissiveIntensity: 0 }),
    led: new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0 }),
  };
  roles.neon.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;');
  };
  roles.neon.customProgramCacheKey = () => 'neon-tubes';
  const surfNoise = surfaceNoise();
  textures.push(surfNoise);
  patchWall(roles.wall, surfNoise);
  patchTiles(roles.paving, surfNoise, 'surf-paving', false);
  patchTiles(roles.tiles, surfNoise, 'surf-tiles', true);
  patchRoofTiles(roles.roofTile, surfNoise);
  /** Seconds (wrapped) for everything that moves in a shader: LEDs, cloth, cables, smoke. */
  const shaderTime = { value: 0 };
  patchGlow(roles.tube, 'tube-glow');
  patchGlow(roles.led, 'led-glow', shaderTime);
  for (const [name, material] of Object.entries(roles)) material.name = name;
  materials.push(...Object.values(roles));

  const batches = new Map<string, { kind: Kind; role: Role; shadow: boolean; fine: boolean; m: number[]; c: number[]; big: boolean[] }>();
  const colorCache = new Map<string, THREE.Color>();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const rotation = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const toColor = (c: ColorLike) => {
    if (typeof c !== 'string') return c;
    let v = colorCache.get(c);
    if (!v) { v = new THREE.Color(c); colorCache.set(c, v); }
    return v;
  };
  /** A colour nudged in hue/lightness by `t` (0..1) for natural variation without new materials. */
  const vary = (hex: string, t: number, amount = 1) => new THREE.Color(hex).offsetHSL((t - 0.5) * 0.04 * amount, (t - 0.5) * 0.08 * amount, (((t * 7.31) % 1) - 0.5) * 0.09 * amount);

  // Street furniture drawn while `lift` is set stands on the raised sidewalk.
  let lift = 0;
  // Small detail drawn while `fine` is set goes into the layer lower quality levels hide (setDetail).
  let fine = false;
  const setFine = (on: boolean) => { fine = on; };
  const onPavement = (x: number, z: number) => (onSidewalk(x, z) ? CURB_HEIGHT : 0);
  function shape(kind: Kind, color: ColorLike, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tilt = 0, shadow = true, role: Role = 'solid') {
    const key = `${kind}|${role}|${shadow ? 1 : 0}|${fine ? 1 : 0}`;
    let batch = batches.get(key);
    if (!batch) { batch = { kind, role, shadow, fine, m: [], c: [], big: [] }; batches.set(key, batch); }
    rotation.set(0, yaw, tilt);
    quaternion.setFromEuler(rotation);
    matrix.compose(position.set(x, y + lift, z), quaternion, scale.set(sx, sy, sz));
    for (let i = 0; i < 16; i++) batch.m.push(matrix.elements[i]);
    const col = toColor(color);
    batch.c.push(col.r, col.g, col.b);
    batch.big.push(sx > 60 || sz > 60);
  }
  function box(color: ColorLike, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, shadow = true, role: Role = 'solid') {
    shape('box', color, x, y, z, w, h, d, yaw, 0, shadow, role);
  }
  // ---- Street dressing collected while the city is drawn (built after the batches; see street-dressing.ts). ----
  const WHITE = new THREE.Color('#ffffff');
  const decals: { base: DecalQuad[]; fine: DecalQuad[] } = { base: [], fine: [] };
  const cloths: { base: ClothItem[]; fine: ClothItem[] } = { base: [], fine: [] };
  const cables: { base: Cable[]; fine: Cable[] } = { base: [], fine: [] };
  const emitters: Emitter[] = [];
  /** Shop light pools on the pavement: where, how big, and the building whose hours switch it (-1: always). */
  const shopPools: { x: number; z: number; size: number; shop: number }[] = [];
  function decal(cell: DecalCell, x: number, y: number, z: number, w: number, h: number, yaw: number, opts: DecalOpts = {}) {
    (opts.fine ?? fine ? decals.fine : decals.base).push({ cell, x, y: y + lift, z, w, h, yaw, pitch: opts.pitch ?? 0, color: opts.tint ? toColor(opts.tint) : WHITE, glow: GLOWING.has(cell) ? 1 : 0 });
  }
  function cloth(cell: ClothCell, x: number, y: number, z: number, w: number, h: number, yaw: number, opts: ClothOpts) {
    (opts.fine ?? fine ? cloths.fine : cloths.base).push({ x, y: y + lift, z, w, h, yaw, cell, mode: opts.mode, amp: opts.amp ?? 0.05, color: opts.tint ? toColor(opts.tint) : WHITE });
  }
  const smoke = (kind: SmokeKind, x: number, y: number, z: number) => { emitters.push({ kind, x, y: y + lift, z }); };
  const pool = (x: number, z: number, size: number, shop: number) => { shopPools.push({ x, z, size, shop }); };
  function tag(style: TagStyle, text: string, fg: string, bg: string, x: number, y: number, z: number, w: number, h: number, yaw: number, glow = 0) {
    signs.tag(style, text, fg, bg, x, y + lift, z, w, h, yaw, glow);
  }
  /** Local frame of a building or prop: lx along its front, lz towards its front. */
  function frame(x: number, z: number, facing: number): Frame {
    const c = Math.cos(facing), s = Math.sin(facing);
    const wx = (lx: number, lz: number) => x + lx * c + lz * s, wz = (lx: number, lz: number) => z - lx * s + lz * c;
    return {
      facing,
      at: (lx: number, lz: number) => ({ x: wx(lx, lz), z: wz(lx, lz) }),
      local: (px: number, pz: number) => ({ x: (px - x) * c - (pz - z) * s, z: (px - x) * s + (pz - z) * c }),
      part: (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: ColorLike, role: Role = 'solid', shadow = true) =>
        box(color, wx(lx, lz), ly, wz(lx, lz), w, h, d, facing, shadow, role),
      solid: (kind: Kind, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: ColorLike, tilt = 0, shadow = true, yaw = 0, role: Role = 'solid') =>
        shape(kind, color, wx(lx, lz), ly, wz(lx, lz), sx, sy, sz, facing + yaw, tilt, shadow, role),
      decal: (cell, lx, ly, lz, w, h, opts = {}) => decal(cell, wx(lx, lz), ly, wz(lx, lz), w, h, facing + (opts.yaw ?? 0), opts),
      cloth: (cell, lx, ly, lz, w, h, opts) => cloth(cell, wx(lx, lz), ly, wz(lx, lz), w, h, facing + (opts.yaw ?? 0), opts),
      smoke: (kind, lx, ly, lz) => smoke(kind, wx(lx, lz), ly, wz(lx, lz)),
      tag: (style, text, fg, bg, lx, ly, lz, w, h, opts = {}) => tag(style, text, fg, bg, wx(lx, lz), ly, wz(lx, lz), w, h, facing + (opts.yaw ?? 0), opts.glow ?? 0),
      pool: (lx, lz, size, shop) => pool(wx(lx, lz), wz(lx, lz), size, shop),
    };
  }
  const glassRole = (x: number, y: number, z: number): Role => (hash(x, y, z) < 0.55 ? 'glassLit' : 'glass');
  function flowers(x: number, y: number, z: number, count: number, spreadX: number, spreadZ: number, seed: number) {
    const r = seeded(seed * 7919 + 13);
    for (let i = 0; i < count; i++) {
      shape('bead', pickOf(r, FLOWERS), x + (r() - 0.5) * spreadX, y + r() * 0.12, z + (r() - 0.5) * spreadZ, 0.13 + r() * 0.06, 0.11, 0.13 + r() * 0.06, 0, 0, false);
    }
  }

  // ---- Signs and number plates: box boards with instanced glyph-atlas text (map/signs.ts). ----
  const signs = createSigns();
  function sign(text: string, subtitle: string, color: string, x: number, y: number, z: number, w: number, h: number, yaw = 0, background = '#f3e4c7') {
    signs.sign(text, subtitle, color, x, y, z, w, h, yaw, background);
  }
  function plate(n: number, x: number, y: number, z: number, yaw: number) {
    signs.plate(n, x, y, z, yaw);
  }
  const glowMaterials: { material: THREE.MeshStandardMaterial; strength: number }[] = [];

  // ---- Small furniture shared by many places (drawn with `lift` = furnitureLift where it stands). ----
  /** A low box with a top (axis-aligned footprint w x d turned by yaw) that a falling body can land on. */
  const seatBox = (x: number, z: number, w: number, d: number, yaw: number, top: number) => {
    const across = Math.abs(Math.sin(yaw)) > 0.5, hw = (across ? d : w) / 2, hd = (across ? w : d) / 2;
    seats.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, top: top + lift });
  };
  // Seat top SEAT_TOP.bench (npcs.ts sits people on it), so a seated adult's feet rest on the ground.
  function bench(x: number, z: number, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const part = (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: string) => box(color, x + lx * c + lz * s, ly, z - lx * s + lz * c, w, h, d, yaw);
    part(0, SEAT_TOP.bench - 0.06, 0, 2.7, 0.12, 0.6, '#b58255');
    part(0, 0.86, -0.27, 2.7, 0.56, 0.1, '#b58255');
    part(-1, 0.2, 0, 0.12, 0.4, 0.5, '#51645d');
    part(1, 0.2, 0, 0.12, 0.4, 0.5, '#51645d');
    seatBox(x, z, 2.7, 0.6, yaw, SEAT_TOP.bench);
  }
  /** A small plastic café stool (ghế nhựa), as on every Vietnamese sidewalk: a square seat on splayed legs. */
  function stool(x: number, z: number, color = '#cf6251') {
    const top = SEAT_TOP.stool;
    box(color, x, top - 0.025, z, 0.36, 0.05, 0.36);
    box(color, x, top - 0.075, z, 0.33, 0.05, 0.33);
    for (const dx of [-0.13, 0.13]) for (const dz of [-0.13, 0.13]) box(color, x + dx * 1.08, (top - 0.08) / 2, z + dz * 1.08, 0.05, top - 0.08, 0.05);
    seatBox(x, z, 0.36, 0.36, 0, top);
  }
  function table(x: number, z: number) {
    seatBox(x, z, 1.5, 1.5, 0, 0.96);
    shape('cylinder', '#dfd3ba', x, 0.9, z, 0.85, 0.12, 0.85);
    shape('cylinder', '#65766c', x, 0.48, z, 0.09, 0.85, 0.09);
    shape('cylinder', '#65766c', x, 0.1, z, 0.45, 0.12, 0.45);
    shape('cylinder', '#dfc19a', x + 0.2, 1.06, z, 0.11, 0.22, 0.11);
    shape('cylinder', '#684932', x + 0.2, 1.18, z, 0.09, 0.02, 0.09);
  }
  function pot(x: number, z: number, y: number, size: number, seed: number) {
    const r = seeded(seed);
    shape('cylinder', pickOf(r, ['#b96f4e', '#c98a5c', '#8f6b55', '#d2c3a8']), x, y + 0.22 * size, z, 0.26 * size, 0.44 * size, 0.26 * size);
    if (r() < 0.45) flowers(x, y + 0.55 * size, z, 4, 0.4 * size, 0.4 * size, seed);
    else shape('ball', pickOf(r, LEAVES), x, y + 0.7 * size, z, 0.38 * size, 0.42 * size, 0.38 * size);
  }

  // ---- Trees: several species from a handful of primitives, varied in size, spin and colour. ----
  function streetPit(t: Tree) {
    box('#d5c7b3', t.x, 0.17, t.z, 2.5 * t.size, 0.28, 2.5 * t.size, 0, false, 'ground');
    box('#8a996e', t.x, 0.32, t.z, 2.1 * t.size, 0.05, 2.1 * t.size);
  }
  const leafDark = new THREE.Color(), leafLight = new THREE.Color();
  /** A green between shade and sunlight by height `f` in the crown, nudged in hue and lightness by `t`. */
  const leaf = (dark: string, light: string, f: number, t: number) =>
    leafDark.set(dark).lerp(leafLight.set(light), Math.min(1, Math.max(0, f))).clone()
      .offsetHSL((t - 0.5) * 0.05, (t - 0.5) * 0.1, (((t * 7.31) % 1) - 0.5) * 0.07);
  /** A tapered branch from a base point, heading `dir` (yaw) and leaning `lean` from vertical. */
  function branch(bx: number, by: number, bz: number, radius: number, length: number, dir: number, lean: number, color: string, shadow = true) {
    const dx = Math.sin(lean) * Math.cos(dir), dy = Math.cos(lean), dz = -Math.sin(lean) * Math.sin(dir);
    shape('trunk', color, bx + dx * length / 2, by + dy * length / 2, bz + dz * length / 2, radius, length, radius, dir, -lean, shadow);
  }
  function tree(t: Tree, street: boolean) {
    const { x, z, size: s, spin, tint } = t;
    const c = Math.cos(spin), sn = Math.sin(spin);
    const off = (dx: number, dz: number) => ({ x: x + dx * c + dz * sn, z: z - dx * sn + dz * c });
    const jitter = (i: number) => hash(x * 0.37 + i, z * 0.61 - i, tint);
    // A leaf clump in tree units: darker low in the crown, lighter on top, each one slightly different.
    const clump = (dx: number, y: number, dz: number, r: number, h: number, dark: string, light: string, f: number, i: number, shadow = true) => {
      const p = off(dx * s, dz * s);
      shape('puff', leaf(dark, light, f, (tint + jitter(i) * 0.6) % 1), p.x, y * s, p.z, r * s, h * s, r * s * (0.9 + jitter(i + 9) * 0.2), spin + i * 1.7, 0, shadow);
    };
    if (street && t.species !== 'palm' && t.species !== 'bamboo') {
      streetPit(t);
      // Street trees have their trunks whitewashed (quét vôi) to a metre or so.
      const R = t.species === 'flame' ? 0.3 : t.species === 'round' ? 0.23 : t.species === 'layered' ? 0.2 : 0.19;
      setFine(true);
      shape('trunk', '#f1eee4', x, 0.62, z, R * s * 1.06, 1.1, R * s * 1.06, spin, 0, false);
      setFine(false);
    }
    if (t.species === 'round') {
      // Sấu / me: a tapered trunk forking into a cloud of leaf clumps; some trees grow a little taller.
      const k = 0.92 + tint * 0.16;
      const bark = '#86604a';
      shape('trunk', bark, x, 1.75 * s * k, z, 0.23 * s, 3.5 * s * k, 0.23 * s, spin);
      shape('cone', bark, x, 0.2 * s, z, 0.4 * s, 0.4 * s, 0.4 * s, spin, 0, false);
      const blobs: [number, number, number, number, number][] = [
        [0, 4.7, 0, 2.0, 1.75], [-1.25, 4.35, 0.45, 1.35, 1.15], [1.3, 4.45, -0.3, 1.4, 1.2], [0.3, 4.25, 1.3, 1.3, 1.1],
        [-0.35, 4.3, -1.3, 1.3, 1.1], [-0.55, 5.65, -0.2, 1.4, 1.2], [0.6, 5.85, 0.45, 1.15, 1.0],
      ];
      blobs.forEach(([dx, y, dz, r, h], i) => clump(dx, y * k, dz, r, h, '#44774f', '#8fbd78', (y - 4.2) / 1.7, i));
    } else if (t.species === 'layered') {
      // Bàng: a straight trunk carrying flat, horizontal tiers of leaves; some trees turn red in the dry season.
      const bark = '#7a5a45';
      shape('trunk', bark, x, 2.8 * s, z, 0.2 * s, 5.6 * s, 0.2 * s, spin);
      shape('cone', bark, x, 0.2 * s, z, 0.36 * s, 0.4 * s, 0.36 * s, spin, 0, false);
      const autumn = tint > 0.8;
      const tiers: [number, number][] = [[3.0, 2.8], [4.1, 2.2], [5.1, 1.55], [5.85, 0.9]];
      tiers.forEach(([y, r], i) => {
        const f = i / 3;
        clump(0.2 * (i - 1.5), y, -0.15 * (i - 1.5), r, 0.48, '#4a8250', '#86b56c', f, i * 3);
        if (i === 3) return;
        for (let k = 0; k < 2; k++) {
          const a = i * 2.1 + k * PI + tint * 3;
          const red = autumn && i < 2 && k === 0;
          clump(Math.cos(a) * r * 0.62, y + 0.08, Math.sin(a) * r * 0.62, r * 0.55, 0.4, red ? '#b2502f' : '#4a8250', red ? '#e0884a' : '#86b56c', f + 0.15, i * 3 + k + 1);
        }
      });
    } else if (t.species === 'tall') {
      // Sao / dầu: a tall, pale, clean trunk with a narrow crown of stacked clumps.
      const bark = '#8d7864';
      shape('trunk', bark, x, 4.4 * s, z, 0.19 * s, 8.8 * s, 0.19 * s, spin);
      shape('cone', bark, x, 0.22 * s, z, 0.34 * s, 0.44 * s, 0.34 * s, spin, 0, false);
      const blobs: [number, number, number, number, number][] = [
        [0, 8.5, 0, 1.45, 2.3], [0.55, 9.9, 0.2, 1.1, 1.7], [-0.6, 7.6, -0.35, 1.15, 1.3],
        [0.2, 11.0, -0.15, 0.8, 1.2], [-0.45, 9.4, 0.6, 0.95, 1.4], [0.75, 8.0, -0.6, 0.9, 1.1],
      ];
      blobs.forEach(([dx, y, dz, r, h], i) => clump(dx, y, dz, r, h, '#3b6a45', '#74a265', (y - 7.4) / 3.6, i));
    } else if (t.species === 'flame') {
      // Phượng vĩ: a short trunk splitting into three limbs under a wide umbrella of leaves and red-orange blossom.
      const bark = '#73563f';
      shape('trunk', bark, x, 1.5 * s, z, 0.3 * s, 3 * s, 0.3 * s, spin);
      shape('cone', bark, x, 0.22 * s, z, 0.5 * s, 0.44 * s, 0.5 * s, spin, 0, false);
      for (let k = 0; k < 3; k++) branch(x, 2.8 * s, z, 0.15 * s, 2.3 * s, spin + k * 2.09, 0.85, bark);
      // The umbrella: a domed core ringed by lower, drooping clumps that break up the outline.
      clump(0, 4.45, 0, 2.5, 1.15, '#4b7a42', '#7fab5c', 0.55, 0);
      clump(0.2, 5.0, -0.1, 1.7, 0.8, '#4b7a42', '#7fab5c', 1, 1);
      for (let k = 0; k < 7; k++) {
        const a = k * (PI * 2 / 7) + tint * 2;
        const d = 2.3 + jitter(k) * 0.5;
        clump(Math.cos(a) * d, 4.0 + jitter(k + 3) * 0.3, Math.sin(a) * d, 1.35 + jitter(k + 5) * 0.35, 0.8, '#4b7a42', '#7fab5c', 0.25, k + 2);
      }
      // Blossom: many small red-orange clusters over the top and down the rim.
      const r = seeded(x * 31 + z * 17);
      for (let i = 0; i < 24; i++) {
        const a = r() * PI * 2, d = 0.2 + r() * 3.0, w = (0.5 + r() * 0.4) * s;
        const y = 5.72 - d * d * 0.12 + r() * 0.12;
        shape('puff', pickOf(r, ['#e2462f', '#f0672f', '#d93a2a', '#f58a3a', '#ff7b47', '#c8352a']), x + Math.sin(a) * d * s, y * s, z + Math.cos(a) * d * s, w, 0.3 * s, w, a, 0, false);
      }
    } else if (t.species === 'palm') {
      // Cau / dừa: a ringed trunk curving gently, a crown of arching fronds and a few coconuts.
      const lean = (tint - 0.5) * 0.24;
      const H = 6.2 * s, N = 5;
      const node = (k: number) => ({ o: Math.sin(lean) * H * (k / N) ** 2, y: H * k / N });
      for (let k = 0; k < N; k++) {
        const a = node(k), b = node(k + 1);
        const bend = Math.atan2(b.o - a.o, b.y - a.y);
        const mid = off((a.o + b.o) / 2, 0), ring = off(b.o, 0);
        const radius = 0.24 * s * (1 - k * 0.07);
        shape('cylinder', k % 2 ? '#b8a07a' : '#ab926d', mid.x, (a.y + b.y) / 2, mid.z, radius, Math.hypot(b.o - a.o, b.y - a.y) * 1.02, radius, spin, -bend);
        if (k < N - 1) shape('cylinder', '#96805e', ring.x, b.y, ring.z, radius * 1.06, 0.08 * s, radius * 1.06, spin, -bend);
      }
      const top = node(N), crown = off(top.o, 0);
      shape('puff', '#6b7f45', crown.x, top.y + 0.05 * s, crown.z, 0.38 * s, 0.42 * s, 0.38 * s, spin, 0, false);
      const r = seeded(x * 23 + z * 29);
      for (let i = 0; i < 9; i++) {
        const a = spin + i * (PI * 2 / 9) + (r() - 0.5) * 0.35;
        const length = (2.9 + r() * 0.7) * s;
        shape('frond', leaf('#3f7a48', '#6fa860', i % 2 ? 0.8 : 0.25, (tint + r() * 0.4) % 1), crown.x, top.y, crown.z, length, length, length * 0.95, a, (i % 2 ? 0.34 : -0.1) + (r() - 0.5) * 0.15);
      }
      for (let i = 0; i < 4; i++) shape('ball', '#7b5a36', crown.x + Math.sin(i * 1.7 + spin) * 0.32 * s, top.y - 0.3 * s, crown.z + Math.cos(i * 1.7 + spin) * 0.32 * s, 0.2 * s, 0.22 * s, 0.2 * s, 0, 0, false);
    } else {
      // Tre: a clump of culms leaning outward, with feathery leaf sprays towards their tips.
      shape('puff', '#7d8a5a', x, 0.15, z, 0.9 * s, 0.32, 0.9 * s, spin, 0, false);
      const r = seeded(x * 13 + z * 7);
      for (let i = 0; i < 7; i++) {
        const a = spin + i * 0.9 + r() * 0.4, lean = 0.06 + r() * 0.14, h = (5.4 + r() * 2.8) * s;
        const along = (d: number) => ({ x: x + Math.sin(a) * (0.22 + Math.sin(lean) * d), y: Math.cos(lean) * d, z: z + Math.cos(a) * (0.22 + Math.sin(lean) * d) });
        const mid = along(h / 2);
        shape('cylinder', i % 2 ? '#8fae5c' : '#7c9e4f', mid.x, mid.y, mid.z, 0.065, h, 0.065, a + HALF_PI, lean, false);
        for (let k = 0; k < 3; k++) {
          const n = along(h * (0.62 + k * 0.15)), out = 0.35 + k * 0.1;
          shape('ball', leaf('#5a8c44', '#8fbb5e', k / 2, r()), n.x + Math.sin(a + k) * out, n.y - 0.15, n.z + Math.cos(a + k) * out, 0.85 - k * 0.12, 0.3, 0.42, a + k, 0.45, i === 0 && k === 0);
        }
      }
    }
  }

  // ---- Buildings ----
  function localRect(r: Rect, x: number, z: number, facing: number) {
    const c = Math.cos(facing), s = Math.sin(facing);
    const p = [[r.minX, r.minZ], [r.maxX, r.maxZ]].map(([wx, wz]) => [(wx - x) * c - (wz - z) * s, (wx - x) * s + (wz - z) * c]);
    return { x0: Math.min(p[0][0], p[1][0]), x1: Math.max(p[0][0], p[1][0]), z0: Math.min(p[0][1], p[1][1]), z1: Math.max(p[0][1], p[1][1]) };
  }
  function dims(p: Plot) {
    const f = p.full, { x, z } = centre(f);
    const sideways = Math.abs(Math.sin(p.facing)) > 0.5;
    return { x, z, w: sideways ? f.maxZ - f.minZ : f.maxX - f.minX, d: sideways ? f.maxX - f.minX : f.maxZ - f.minZ };
  }

  /** The original shophouse design, with a recessed arcade where its ground floor had to make room for a sidewalk. */
  function legacyHouse(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const { h, legacy: index, facing } = p;
    const color = b.color;
    const front = d / 2;
    const c = Math.cos(facing), s = Math.sin(facing);
    const F = frame(x, z, facing);
    const { part, at } = F;
    const q = seeded(index * 131 + 17);
    const g = localRect(p.ground, x, z, facing);
    const AH = 3.2;
    const cuts = { front: g.z1 < front - 0.05, back: g.z0 > -front + 0.05, left: g.x0 > -w / 2 + 0.05, right: g.x1 < w / 2 - 0.05 };
    const cut = cuts.front || cuts.back || cuts.left || cuts.right;
    const gw = g.x1 - g.x0, gd = g.z1 - g.z0, gx = (g.x0 + g.x1) / 2, gz = (g.z0 + g.z1) / 2;
    const iron = pickOf(q, IRON);
    if (!cut) part(0, h / 2, 0, w, h, d, color, 'wall');
    else {
      part(gx, AH / 2, gz, gw, AH, gd, color, 'wall');
      part(0, AH + (h - AH) / 2, 0, w, h - AH, d, color, 'wall');
      // Beams under the overhang and a warm light for the covered walkway.
      if (cuts.front) {
        for (let k = -w / 2 + 0.4; k <= w / 2 - 0.3; k += 2.4) part(k, AH - 0.2, (g.z1 + front) / 2, 0.16, 0.4, front - g.z1, '#e7d9bd');
        part(0, AH - 0.05, (g.z1 + front) / 2, 0.5, 0.06, 0.3, '#fff1c9', 'lamp', false);
      }
      if (cuts.back) for (let k = -w / 2 + 0.4; k <= w / 2 - 0.3; k += 2.4) part(k, AH - 0.2, (g.z0 - front) / 2, 0.16, 0.4, g.z0 + front, '#e7d9bd');
      for (const [on, edge, outer] of [[cuts.left, g.x0, -w / 2], [cuts.right, g.x1, w / 2]] as const) {
        if (!on) continue;
        const width = Math.abs(outer - edge), mid = (outer + edge) / 2;
        for (let k = -front + 0.5; k <= front - 0.4; k += 2.4) part(mid, AH - 0.2, k, width, 0.4, 0.16, '#e7d9bd');
        part(mid, AH - 0.05, 0, 0.3, 0.06, 0.5, '#fff1c9', 'lamp', false);
      }
    }
    part(gx, 0.25, gz, gw + 0.12, 0.5, gd + 0.1, '#d1bea5');
    part(0, h + 0.18, 0, w + 0.45, 0.35, d + 0.5, '#e7d9bd');
    part(0, h + 0.365, 0, w + 0.25, 0.02, d + 0.3, '#b47a62', 'tiles', false);
    part(0, h + 0.45, -d / 2 + 0.13, w, 0.55, 0.27, color);
    const pilasterBase = cuts.front ? AH : 0;
    for (const side of [-1, 1]) part(side * (w / 2 - 0.12), (pilasterBase + h) / 2, front + 0.06, 0.27, h - pilasterBase, 0.19, '#eadfc9');
    // Shop entrance and folding shutters on the ground floor.
    const gf = g.z1;
    part(gx, 1.8, gf + 0.035, gw - 0.9, 3.25, 0.12, '#365d57');
    part(gx - gw * 0.22, 1.8, gf + 0.13, gw * 0.27, 2.8, 0.06, '#7caaa1');
    part(gx + gw * 0.16, 1.8, gf + 0.13, gw * 0.32, 2.8, 0.06, '#90b5a8');
    part(gx, 1.8, gf + 0.2, 0.12, 3.1, 0.08, '#e7d9bd');
    part(gx - gw * 0.09, 1.6, gf + 0.26, 0.08, 0.45, 0.08, '#e7d9bd');
    // A fluorescent tube over the entrance and its light on the pavement after dark.
    part(gx, 3.05, gf + 0.3, 1.2, 0.05, 0.1, '#eef8ff', 'tube', false);
    { const pp = at(gx, gf + 2.4); pool(pp.x, pp.z, 4.6, b.id); }
    const balconies = index % 3 !== 1;
    const spot = signSpot(p);
    for (let floor = 5.2; floor < h - 0.8; floor += 3.2) {
      const first = floor === 5.2;
      for (const dx of [-w * 0.24, w * 0.24]) {
        const wp = at(dx, front);
        part(dx, floor, front + 0.1, w * 0.29, 2.3, 0.15, '#e8ddc4');
        part(dx, floor, front + 0.2, w * 0.24, 1.95, 0.12, '#527a73', glassRole(wp.x, floor, wp.z), false);
        part(dx, floor, front + 0.29, 0.08, 2, 0.1, '#d4c9ae');
        part(dx, floor, front + 0.29, w * 0.24, 0.08, 0.1, '#d4c9ae');
        // Window cages and grilles where no balcony stands in front.
        const roll = q();
        if (!balconies && roll < 0.3) cage(F, dx, floor - 1.45, front + 0.17, w * 0.3, iron, pickOf(q, TON));
        else if (roll < 0.6) grille(F, dx, floor, front + 0.37, w * 0.25, 2.0, iron, q() < 0.4);
      }
      if (balconies) {
        part(0, floor - 1.2, front + 0.55, w - 0.9, 0.18, 1.5, '#e7d9bd');
        railing(F, -(w - 1.05) / 2, (w - 1.05) / 2, floor - 1.24, front, 1.2, '#516e62', index % 2 === 0);
        // The first balcony carries the shop sign (legacySignSpot), so it keeps no flowers.
        if (!first) {
          part(w * 0.25, floor - 0.95, front + 0.75, 0.55, 0.4, 0.5, '#bd7956');
          shape('ball', '#659671', x + w * 0.25 * c + (front + 0.75) * s, floor - 0.55, z - w * 0.25 * s + (front + 0.75) * c, 0.45, 0.5, 0.45);
          const fb = at(-w * 0.22, front + 1.0);
          part(-w * 0.22, floor - 0.98, front + 1.0, 1.2, 0.3, 0.3, '#a8664a');
          flowers(fb.x, floor - 0.78, fb.z, 5, 1.0, 0.25, index * 31 + floor);
        } else if (q() < 0.45) thoThien(F, (q() < 0.5 ? -1 : 1) * (w / 2 - 0.55), floor - 0.35, front + 0.17);
        if (q() < 0.3) { setFine(true); laundry(F, q, 0, floor + 0.75, front + 0.9, w - 2); setFine(false); }
      }
      if (q() < 0.4) acUnit(F, (q() < 0.5 ? -1 : 1) * (w / 2 - 0.75), floor + 1.45, front + 0.02);
    }
    if (!spot.balcony) part(0, spot.y, front + 0.23, w - 0.45, 1.25, 0.22, '#e7d9bd');
    else part(0, spot.y, spot.lz - 0.13, spot.w + 0.2, spot.h + 0.15, 0.06, '#e7d9bd');
    { const sp = at(0, spot.lz); sign(b.name, b.subtitle, p.signColor, sp.x, spot.y, sp.z, spot.w, spot.h, facing); }
    if (!VENUE_OF.has(b.id) && q() < 0.3) ledBorder(F, 0, spot.y, spot.lz + 0.02, spot.w + 0.2, spot.h + 0.15, pickOf(q, LED_COLORS));
    if (!cuts.front) {
      // Segmented striped shop canopy.
      for (let aw = 0; aw < 8; aw++) {
        const stripe = aw % 2 ? '#f3e6ca' : index % 2 ? '#5e927c' : '#cf795d';
        part(-w / 2 + 0.35 + (aw + 0.5) * (w - 0.7) / 8, 2.98, front + 1.2, (w - 0.7) / 8, 0.16, 2, stripe);
        part(-w / 2 + 0.35 + (aw + 0.5) * (w - 0.7) / 8, 2.78, front + 2.12, (w - 0.7) / 8, 0.35, 0.1, stripe);
      }
    }
    // A light box beside the shop sign, the national flag, and the roof: tiles, a stair hut, the inox tank.
    const look = FRONT_OF[counterKeyOf(b) ?? ''];
    const flagSide = q() < 0.5 ? -1 : 1;
    if (look) verticalSign(F, look[1], -flagSide * (w / 2 - 0.35), Math.min(h - 1.0, spot.balcony ? 6.0 : 5.6), front, ...pickOf(q, LIGHT_BOXES));
    if (q() < 0.6) houseFlag(F, flagSide * (w / 2 - 0.7), front + 0.15, balconies ? 5.6 : 4.9);
    rooftop(F, q, { lx: 0, w: w - 0.3, d: d - 0.6, front: front - 0.3, floor: h + 0.37, wall: color, trim: '#e7d9bd' }, setFine);
    if (q() < 0.25) maiThai(F, 0, w + 0.2, h + 0.2, front + 0.1, pickOf(q, ROOF_TILES));
    // A door on another side (the post office opens onto the post-office road).
    if (Math.abs(Math.sin(b.facing - facing)) > 0.5) {
      const e = { x: Math.round(Math.sin(b.facing)), z: Math.round(Math.cos(b.facing)) };
      const wallX = e.x < 0 ? p.ground.minX : e.x > 0 ? p.ground.maxX : b.door.x;
      const wallZ = e.z < 0 ? p.ground.minZ : e.z > 0 ? p.ground.maxZ : b.door.z;
      const side = frame(e.x ? wallX : b.door.x, e.z ? wallZ : b.door.z, b.facing);
      side.part(0, 1.6, 0.04, 3.4, 3.0, 0.12, '#365d57');
      side.part(-0.8, 1.4, 0.1, 1.4, 2.5, 0.06, '#527a73', 'glassLit', false);
      side.part(0.8, 1.4, 0.1, 1.4, 2.5, 0.06, '#527a73', 'glassLit', false);
      const sy = Math.min(h - 0.65, 3.8);
      const fx = e.x < 0 ? p.full.minX : e.x > 0 ? p.full.maxX : b.door.x;
      const fz = e.z < 0 ? p.full.minZ : e.z > 0 ? p.full.maxZ : b.door.z;
      const signAt = frame(e.x ? fx : x, e.z ? fz : z, b.facing);
      const pos = signAt.at(0, 0.36);
      signAt.part(0, sy, 0.23, Math.min(b.w, 9.4), 1.25, 0.22, '#e7d9bd');
      sign(b.name, b.subtitle, p.signColor, pos.x, sy, pos.z, Math.min(b.w, 9.4) - 0.3, 1.1, b.facing);
    }
  }

  /**
   * A narrow Vietnamese tube house: home, shop or street-food front. A wide home splits into two tube-house bays
   * (each its own colour, height and floors); the ground floor is an open front lit by a tube (shops always, homes
   * often, behind a folding gate), or a door and window, or a roller shutter; upper floors have balconies with iron
   * railings, washing, cages or grilles and AC units; flat roofs carry a stair hut, the inox tank and the rest.
   */
  function newHouse(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const r = seeded(p.seed), q = seeded(p.seed * 7 + 3);
    const F = frame(x, z, p.facing);
    const { part, at, local, solid } = F;
    const trim = pickOf(r, ['#efe5cf', '#f4ecdc', '#e2d6bd', '#fbf6ea']);
    const wall = vary(b.color, r(), 0.6);
    const doorX = THREE.MathUtils.clamp(local(b.door.x, b.door.z).x, -w / 2 + 1, w / 2 - 1);
    const venue = VENUE_OF.get(b.id);
    const shopFront = p.style === 'shop' || b.kind === 'food' || !!venue;
    const look = venue ? (venue.kind === 'beer' ? FRONT_OF.biahoi : undefined) : FRONT_OF[counterKeyOf(b) ?? ''];
    const floors = Math.max(2, Math.round((h - 0.6) / 3.2));
    const iron = pickOf(q, IRON);
    // Bays: the door bay, and on a wide home a neighbour bay (42-58 % of the width, the door well inside its own).
    type Bay = { lx: number; w: number; h: number; wall: THREE.Color; door: boolean; open: boolean };
    let bays: Bay[] = [{ lx: 0, w, h, wall, door: true, open: (shopFront && venue?.kind !== 'motel') || (!shopFront && q() < 0.55) }];
    if (!shopFront && w >= 8.4 && q() < 0.7) {
      const dw = w * (0.42 + q() * 0.16), left = doorX < 0, cut = left ? -w / 2 + dw : w / 2 - dw;
      if (Math.abs(doorX - cut) > 1.4) {
        const other = vary(pickOf(q, BAY_COLORS), q(), 0.6), otherH = floors >= 3 && q() < 0.4 ? h - 3.2 : h;
        const doorBay: Bay = { lx: left ? (-w / 2 + cut) / 2 : (cut + w / 2) / 2, w: left ? cut + w / 2 : w / 2 - cut, h, wall, door: true, open: bays[0].open };
        const next: Bay = { lx: left ? (cut + w / 2) / 2 : (-w / 2 + cut) / 2, w: left ? w / 2 - cut : cut + w / 2, h: otherH, wall: other, door: false, open: q() < 0.3 };
        bays = [doorBay, next];
      }
    }
    part(0, 0.25, 0, w + 0.1, 0.5, d + 0.08, '#cdbda4');
    const signed = shopFront && (p.sign || !!venue);
    for (const bay of bays) {
      const { lx, w: bw, h: bh } = bay;
      const bayTrim = bay.door ? trim : pickOf(q, ['#efe5cf', '#f4ecdc', '#e2d6bd', '#fbf6ea']);
      for (const side of [-1, 1]) part(lx + side * (bw / 2 - 0.1), bh / 2 + 0.1, front + 0.05, 0.22, bh - 0.2, 0.14, bayTrim);
      // ---- Ground floor ----
      if (bay.open) {
        const kind: FrontKind = bay.door && look ? look[0] : shopFront ? 'food' : 'home';
        const counter = bay.door && COUNTERED.has(b.id);
        openFront(F, q, { lx, w: bw, h: bh, d, front, wall: bay.wall, kind, shop: bay.door && look ? b.id : -1, drum: !counter, maxOpening: counter ? Math.min(b.w - 0.7, 9) - 0.1 : undefined, fine: setFine });
      } else {
        part(lx, bh / 2, 0, bw, bh, d, bay.wall, 'wall');
        if (bay.door) {
          part(doorX, 1.4, front + 0.04, 1.8, 2.8, 0.1, '#46524f');
          if (q() < 0.5) F.decal(DECAL.door, doorX, 1.35, front + 0.1, 1.5, 2.6);
          else part(doorX, 1.35, front + 0.09, 1.5, 2.6, 0.05, pickOf(r, DOORS));
          part(doorX, 0.14, front + 0.45, 2.0, 0.18, 0.8, '#cbbfae');
          part(doorX, 3.0, front + 0.55, 2.3, 0.1, 1.1, bayTrim);
          const wx = doorX > lx ? doorX - 2.4 : doorX + 2.4;
          if (Math.abs(wx - lx) < bw / 2 - 0.9) {
            const wp = at(wx, front);
            part(wx, 1.7, front + 0.05, 1.7, 1.5, 0.1, bayTrim);
            part(wx, 1.7, front + 0.09, 1.4, 1.2, 0.05, '#4f6f6c', glassRole(wp.x, 1.7, wp.z), false);
            grille(F, wx, 1.7, front + 0.13, 1.45, 1.25, iron, q() < 0.4);
          }
        } else {
          // A garage bay behind a roller shutter (cửa cuốn), its drum on top.
          F.decal(DECAL.shutter, lx, 1.9, front + 0.02, bw - 0.6, 2.8, { tint: pickOf(q, ['#d9dcdc', '#b9c4c8', '#c9c2b0']) });
          part(lx, 3.38, front + 0.12, bw - 0.4, 0.28, 0.26, '#a3a9ab');
        }
      }
      if (shopFront && q() < 0.65) {
        // A canvas awning over the shop front, under the sign.
        const awning = pickOf(r, AWNINGS), n = Math.max(3, Math.round(bw / 1.3));
        for (let k = 0; k < n; k++) {
          const ax = lx - bw / 2 + 0.3 + ((k + 0.5) * (bw - 0.6)) / n;
          part(ax, 3.36, front + 0.85, (bw - 0.6) / n, 0.08, 1.6, k % 2 ? '#f3e6ca' : awning, 'solid', false);
          part(ax, 3.2, front + 1.63, (bw - 0.6) / n, 0.26, 0.06, k % 2 ? '#f3e6ca' : awning, 'solid', false);
        }
      }
      // House number on the pillar of an open front, else beside the door.
      if (bay.door && p.number > 0) {
        const side = doorX > lx ? -1 : 1;
        const pillar = pillarWidth(bw, COUNTERED.has(b.id) ? Math.min(b.w - 0.7, 9) - 0.1 : undefined);
        const pos = bay.open ? at(lx + side * (bw / 2 - pillar / 2), front + 0.015) : at(doorX + (doorX > lx ? -1.25 : 1.25), front + 0.08);
        plate(p.number, pos.x, bay.open ? 2.35 : 2.25, pos.z, p.facing);
      }
      part(lx, 3.42, front + 0.07, bw, 0.16, 0.14, bayTrim);
      if (bay.door && signed) {
        // The shop sign over the opening; the first floor above it keeps clear (no balcony there).
        const pos = at(0, front + 0.25);
        part(0, 4.05, front + 0.12, w - 0.4, 1.3, 0.2, '#e7d9bd');
        sign(b.name, b.subtitle, p.signColor, pos.x, 4.05, pos.z, w - 0.6, 1.1, p.facing);
        if (!venue && q() < 0.3) ledBorder(F, 0, 4.05, front + 0.24, w - 0.4, 1.3, pickOf(q, LED_COLORS));
      }
      // ---- Upper floors ----
      const bf = Math.max(2, Math.round((bh - 0.6) / 3.2));
      const rr = bay.door ? r : q;
      const shutter = pickOf(rr, SHUTTERS);
      let altar = q() < 0.45;
      for (let k = 1; k < bf; k++) {
        const base = k * 3.2 + 0.2;
        const underSign = signed && bay.door && k === 1;
        const balcony = rr() < 0.55 && !underSign;
        if (balcony) {
          part(lx, base + 0.05, front + 0.55, bw - 0.3, 0.16, 1.1, bayTrim);
          if (rr() < 0.3) part(lx, base + 0.55, front + 1.07, bw - 0.4, 0.85, 0.06, pickOf(rr, ['#e9e1cc', '#d7e3df', '#efd9c4']));
          else railing(F, lx - bw / 2 + 0.2, lx + bw / 2 - 0.2, base, front, 1.07, iron, q() < 0.5);
          const gp = at(lx, front);
          part(lx, base + 1.25, front + 0.05, Math.min(2.2, bw * 0.4), 2.2, 0.08, '#4f6f6c', glassRole(gp.x, base, gp.z), false);
          if (bw > 3.6) {
            const fb = at(lx + bw * 0.28, front + 0.95);
            part(lx + bw * 0.28, base + 0.32, front + 0.95, Math.min(1.3, bw * 0.3), 0.3, 0.32, '#a8664a');
            flowers(fb.x, base + 0.52, fb.z, 5, 1.0, 0.25, p.seed + k);
          }
          if (rr() < 0.5) pot(at(lx - bw * 0.32, front + 0.75).x, at(lx - bw * 0.32, front + 0.75).z, base + 0.13, 0.9, p.seed + k * 7);
          if (altar && bw > 3.4) { thoThien(F, lx - (doorX > lx ? -1 : 1) * (bw / 2 - 0.5), base + 1.55, front + 0.17); altar = false; }
          setFine(true);
          if (q() < 0.35 && k + 1 < bf) laundry(F, q, lx, base + 2.55, front + 0.75, bw - 1.2);
          else if (q() < 0.12) F.cloth(CLOTH.sheet, lx + (q() - 0.5) * (bw - 2), base + 0.78, front + 1.13, 1.3, 0.75, { mode: 1, amp: 0.03, tint: pickOf(q, LAUNDRY) });
          setFine(false);
        } else {
          const count = bw > 7.5 ? 2 : 1;
          const cy = underSign ? base + 2.05 : base + 1.5, wh = underSign ? 1.3 : 1.9;
          const caged = q() < 0.3 && !underSign;
          for (let i = 0; i < count; i++) {
            const wx = count === 1 ? lx : lx + (i ? 1 : -1) * bw * 0.24;
            const wp = at(wx, front);
            part(wx, cy, front + 0.05, 1.5, wh, 0.1, bayTrim);
            part(wx, cy, front + 0.09, 1.2, wh - 0.3, 0.05, '#4f6f6c', glassRole(wp.x, base, wp.z), false);
            if (caged) cage(F, wx, base, front + 0.1, 1.7, iron, pickOf(q, TON));
            else {
              for (const sd of [-1, 1]) part(wx + sd * 0.92, cy, front + 0.12, 0.42, wh - 0.3, 0.05, shutter);
              if (q() < 0.45) grille(F, wx, cy, front + 0.14, 1.25, wh - 0.25, iron, q() < 0.4);
              else if (!underSign) {
                part(wx, base + 0.5, front + 0.3, 1.3, 0.22, 0.42, '#a8664a');
                const fb = at(wx, front + 0.3);
                flowers(fb.x, base + 0.68, fb.z, 4, 1.0, 0.2, p.seed + k * 3 + i);
              }
            }
          }
        }
        if (q() < 0.5) acUnit(F, lx + (q() < 0.5 ? -1 : 1) * (bw / 2 - 0.75), base + 2.45, front + 0.02);
        part(lx, base + 3.2 - 0.02, front + 0.07, bw, 0.12, 0.12, bayTrim);
      }
      // ---- Roof: a tiled gable, or a flat roof with its clutter (and sometimes a mái thái along the front) ----
      const roof = rr();
      if (roof < 0.32) {
        solid('gable', lx, bh + 0.85, 0, bw + 0.5, 1.7, d + 0.4, pickOf(rr, ROOF_TILES), 0, true, 0, 'roofTile');
      } else {
        part(lx, bh + 0.05, 0, bw + 0.25, 0.14, d + 0.25, bayTrim);
        part(lx, bh + 0.13, 0, bw + 0.05, 0.02, d + 0.05, '#b47a62', 'tiles', false);
        part(lx, bh + 0.45, front - 0.08, bw, 0.7, 0.16, bayTrim);
        part(lx, bh + 0.45, -front + 0.08, bw, 0.7, 0.16, bayTrim);
        if (bh < h) {
          // A low bay is a terrace under the taller neighbour's bare side wall, with a line of washing.
          setFine(true);
          laundry(F, q, lx, bh + 1.9, 0, Math.min(bw - 1, 3));
          for (const k of [-1, 1]) part(lx + k * Math.min(bw - 1, 3) / 2, bh + 1.0, 0, 0.05, 1.8, 0.05, '#6b6f70', 'solid', false);
          setFine(false);
        } else {
          if (roof >= 0.8) for (let i = 0; i < 3; i++) {
            const pp = at(lx - bw / 2 + 0.9 + (i * (bw - 1.8)) / 2, front - 0.8);
            pot(pp.x, pp.z, bh + 0.1, 1.1, p.seed + i * 11);
          }
          rooftop(F, q, { lx, w: bw, d, front, floor: bh + 0.14, wall: bay.wall, trim: bayTrim }, setFine);
          if (q() < 0.25) maiThai(F, lx, bw, bh, front, pickOf(q, ROOF_TILES));
        }
      }
    }
    // The national flag from the first floor, and a light box beside the shop sign.
    const flagSide = doorX > 0 ? -1 : 1;
    if (q() < 0.6) houseFlag(F, flagSide * (w / 2 - 0.7), front + 0.12, signed ? 5.5 : 4.7);
    if (shopFront && look) verticalSign(F, look[1], -flagSide * (w / 2 - 0.35), Math.min(h - 1.0, signed ? 5.75 : 4.6), front, ...pickOf(q, LIGHT_BOXES));
  }

  function hospitalBuilding(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const { part, at } = frame(x, z, p.facing);
    part(0, h / 2, 0, w, h, d, '#eef0e8', 'wall');
    part(0, 0.25, 0, w + 0.2, 0.5, d + 0.2, '#cfd3cc');
    part(0, h + 0.3, 0, w + 0.4, 0.6, d + 0.4, '#dfe3dc');
    // Entrance hall, canopy and sign band.
    part(0, 1.7, front + 0.05, 8.4, 3.2, 0.1, '#527a73', 'glassLit', false);
    part(0, 1.7, front + 0.1, 0.12, 3.2, 0.06, '#d9ddd6');
    part(0, 3.75, front + 2.1, 10, 0.32, 4.2, '#f6f6f2');
    part(0, 3.95, front + 4.15, 10, 0.35, 0.12, '#2f8f83');
    for (const k of [-3, 0, 3]) part(k, 3.56, front + 2.1, 0.6, 0.06, 0.6, '#fff4d8', 'lamp', false);
    const signPos = at(0, front + 0.06);
    sign(b.name, b.subtitle, p.signColor, signPos.x, 5.0, signPos.z, 15, 1.8, p.facing, '#ffffff');
    for (let k = 0; k < 3; k++) {
      const y = 7.4 + k * 2.6;
      for (let i = 0; i < 7; i++) {
        const lx = -w / 2 + 2.4 + i * (w - 4.8) / 6;
        const wp = at(lx, front);
        part(lx, y, front + 0.06, 3.0, 1.6, 0.08, '#5d8580', glassRole(wp.x, y, wp.z), false);
      }
      part(0, y + 1.1, front + 0.07, w, 0.3, 0.1, '#2f8f83');
    }
    for (let i = 0; i < 4; i++) {
      const lx = -w / 2 + 2.6 + i * 3.4;
      if (Math.abs(lx) < 5) continue;
      part(lx, 1.8, front + 0.05, 2.2, 1.8, 0.08, '#5d8580', 'glass', false);
      part(-lx, 1.8, front + 0.05, 2.2, 1.8, 0.08, '#5d8580', 'glass', false);
    }
    // Red crosses on the facade and the roof.
    part(w / 2 - 2.6, 6.2, front + 0.1, 2.4, 2.4, 0.08, '#ffffff');
    part(w / 2 - 2.6, 6.2, front + 0.16, 0.6, 1.8, 0.06, '#d63b35');
    part(w / 2 - 2.6, 6.2, front + 0.16, 1.8, 0.6, 0.06, '#d63b35');
    part(0, h + 1.6, front - 2.5, 3.2, 2.0, 1.2, '#ffffff');
    part(0, h + 1.6, front - 1.86, 0.7, 1.6, 0.1, '#d63b35');
    part(0, h + 1.6, front - 1.86, 1.6, 0.7, 0.1, '#d63b35');
    for (const k of [-8, 8]) part(k, h + 1.0, -2, 3, 1.4, 2.4, '#c9cfcb');
  }

  function policeStation(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const { part, at, solid } = frame(x, z, p.facing);
    part(0, h / 2, 0, w, h, d, '#e9c46a', 'wall');
    part(0, 0.3, 0, w + 0.2, 0.6, d + 0.2, '#c9b28a');
    part(0, h + 0.25, 0, w + 0.4, 0.5, d + 0.4, '#f4ecd6');
    for (const k of [-1, 1]) part(k * (w / 2 - 0.3), h / 2, front + 0.1, 0.6, h, 0.2, '#f4ecd6');
    part(0, 1.6, front + 0.05, 4.2, 3.0, 0.1, '#527a73', 'glassLit', false);
    part(0, 3.55, front + 1.6, 7, 0.3, 3.2, '#f4ecd6');
    part(0, 3.4, front + 1.6, 0.6, 0.06, 0.6, '#fff4d8', 'lamp', false);
    const signPos = at(0, front + 0.08);
    sign(b.name, b.subtitle, '#ffd75e', signPos.x, 4.55, signPos.z, 11, 1.5, p.facing, '#a8322a');
    for (let k = 0; k < 3; k++) {
      const y = k === 0 ? 1.8 : 3.1 * k + 3.2;
      for (let i = 0; i < 6; i++) {
        const lx = -w / 2 + 2 + i * (w - 4) / 5;
        if (k === 0 && Math.abs(lx) < 3.5) continue;
        if (k === 1 && Math.abs(lx) < 2.5) continue;
        const wp = at(lx, front);
        part(lx, y, front + 0.05, 1.7, 1.8, 0.1, '#f4ecd6');
        part(lx, y, front + 0.1, 1.35, 1.5, 0.05, '#4f6f6c', glassRole(wp.x, y, wp.z), false);
        for (const sd of [-1, 1]) part(lx + sd * 0.95, y, front + 0.12, 0.4, 1.5, 0.05, '#2f5d4a');
      }
    }
    // Gold emblem with a red star, and the flag on the roof.
    solid('ball', 0, 7.7, front + 0.12, 1.0, 1.0, 0.16, '#d8a531');
    solid('ball', 0, 7.7, front + 0.2, 0.7, 0.7, 0.12, '#c0392b');
    solid('ball', 0, 7.7, front + 0.26, 0.3, 0.3, 0.08, '#ffd75e');
    const pole = at(0, front - 2);
    shape('cylinder', '#d9d9d2', pole.x, h + 2.6, pole.z, 0.06, 5, 0.06);
    const flag = frame(pole.x, pole.z, p.facing + HALF_PI);
    flag.cloth(CLOTH.flag, 0.87, h + 4.45, 0, 1.65, 1.1, { mode: 0, amp: 0.1 });
  }

  function schoolBuilding(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const { part, at, solid } = frame(x, z, p.facing);
    part(0, h / 2, 0, w, h, d, '#f2d58a', 'wall');
    part(0, 0.25, 0, w + 0.2, 0.5, d + 0.2, '#d8c9a8');
    for (let k = 0; k < 3; k++) {
      const base = k * 3.4;
      for (let i = 0; i < 8; i++) {
        const lx = -w / 2 + 2 + i * (w - 4) / 7;
        const wp = at(lx, front);
        if (i % 3 === 1) part(lx, base + 1.3, front + 0.05, 1.1, 2.3, 0.08, '#4a6f8f');
        else {
          part(lx, base + 1.9, front + 0.05, 2.1, 1.5, 0.1, '#ffffff');
          part(lx, base + 1.9, front + 0.09, 1.8, 1.2, 0.05, '#4f6f8c', glassRole(wp.x, base, wp.z), false);
        }
      }
      if (k > 0) {
        part(0, base + 0.05, front + 0.75, w, 0.18, 1.5, '#f6f0e0');
        part(0, base + 0.6, front + 1.48, w, 0.9, 0.08, '#e8eef2');
        part(0, base + 1.08, front + 1.48, w, 0.08, 0.14, '#2c5d8f');
      }
    }
    solid('hip', 0, h + 1.2, 0, w + 1.2, 2.4, d + 1.6, '#b5583a', 0, true, 0, 'roofTile');
    part(0, h - 0.7, front + 0.05, 9, 1.0, 0.1, '#2c5d8f');
    part(0, h - 0.7, front + 0.1, 8.6, 0.12, 0.04, '#ffd75e');
    // Gate arch over the yard entrance carries the school's name.
    box('#f4ecd6', 27, 3.6, 120, 11.4, 0.6, 0.5);
    sign(b.name, b.subtitle, p.signColor, 27, 3.6, 119.72, 9.6, 1.0, PI, '#fff8e6');
  }

  function pagodaBuilding(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const { part, solid } = frame(x, z, p.facing);
    const front = d / 2;
    part(0, 0.45, 0, w + 1.6, 0.9, d + 1.6, '#b9a58a');
    part(0, 0.95, front + 1.0, 6, 0.3, 1.0, '#c8b597');
    part(0, 3.2, 0, w, 4.6, d, '#e7b75f', 'wall');
    for (let i = 0; i < 6; i++) part(-w / 2 + 0.6 + i * (w - 1.2) / 5, 3.0, front + 0.6, 0.45, 4.2, 0.45, '#a8432f');
    for (const lx of [-4.4, 0, 4.4]) {
      part(lx, 2.3, front + 0.06, 2.2, 2.9, 0.1, '#7a2e22');
      part(lx, 2.3, front + 0.1, 0.06, 2.9, 0.06, '#d8a531');
    }
    part(0, 5.45, front + 0.35, w + 0.6, 0.35, 1.2, '#8e3b28');
    // Two curved-looking tiers: hip roofs with upturned dragon-tail corners and a ridge ornament.
    const roofs: [number, number, number, number][] = [[5.65, w + 3.2, d + 3.4, 2.2], [8.2, w * 0.62, d * 0.62, 1.9]];
    roofs.forEach(([y, rw, rd, rh], i) => {
      solid('hip', 0, y + rh / 2, 0, rw, rh, rd, i ? '#7f3f2c' : '#8e4a33', 0, true, 0, 'roofTile');
      if (i === 1) part(0, y - 0.6, 0, rw * 0.7, 1.2, rd * 0.7, '#e7b75f');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        solid('box', sx * (rw / 2 - 0.2), y + 0.45, sz * (rd / 2 - 0.2), 0.25, 1.1, 0.25, '#8e4a33', sx * 0.6);
        solid('cone', sx * (rw / 2 + 0.1), y + 1.0, sz * (rd / 2 + 0.05), 0.18, 0.6, 0.18, '#d8a531', sx * 0.7);
      }
      part(0, y + rh + 0.05, 0, rw * (i ? 0.25 : 0.42), 0.22, 0.22, '#a8432f');
    });
    solid('ball', 0, 8.2 + 1.9 + 0.45, 0, 0.4, 0.4, 0.4, '#d8a531');
    for (const sx of [-1, 1]) solid('cone', sx * 1.4, 10.4, 0, 0.18, 0.7, 0.18, '#d8a531', -sx * 0.8);
    // Gate (tam quan) with its own small roof and the name board.
    for (const px of [-31.5, -22.5]) {
      box('#a8432f', px, 2.1, 120, 0.9, 4.2, 0.9);
      box('#d8a531', px, 4.3, 120, 1.05, 0.2, 1.05);
    }
    box('#e7b75f', -27, 4.15, 120, 9.4, 0.7, 0.6);
    shape('hip', '#8e4a33', -27, 5.05, 120, 11.6, 1.1, 2.6, 0, 0, true, 'roofTile');
    for (const sx of [-1, 1]) shape('cone', '#d8a531', -27 + sx * 5.9, 5.0, 120, 0.15, 0.5, 0.15, 0, -sx * 0.7);
    sign(b.name, b.subtitle, '#f0c75a', -27, 3.45, 119.68, 6.6, 1.0, PI, '#8e2b20');
    // Lanterns along the hall front and incense pots by the doors.
    for (const lx of [-6, -2, 2, 6]) {
      const lp = frame(x, z, p.facing).at(lx, front + 1.1);
      shape('cylinder', '#7a2e22', lp.x, 4.6, lp.z, 0.02, 0.5, 0.02, 0, 0, false);
      shape('ball', '#d8402c', lp.x, 4.15, lp.z, 0.3, 0.38, 0.3, 0, 0, false, 'lantern');
    }
  }

  function officeBuilding(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const { part, at } = frame(x, z, p.facing);
    part(0, h / 2, 0, w, h, d, '#c9d4d6', 'wall');
    part(0, 2.2, front + 0.06, w - 1, 4.2, 0.1, '#5f8a8f', 'glassLit', false);
    part(0, 4.6, front + 2.0, 12, 0.35, 4.0, '#e4e9ea');
    for (const k of [-4, 0, 4]) part(k, 4.4, front + 2.0, 0.6, 0.06, 0.6, '#fff4d8', 'lamp', false);
    const signPos = at(0, front + 4.02);
    sign(b.name, b.subtitle, p.signColor, signPos.x, 5.35, signPos.z, 10, 1.3, p.facing, '#f4f7f8');
    for (let y = 6.2; y < h - 1; y += 3.4) {
      for (let i = 0; i < 4; i++) {
        const lx = -w / 2 + w / 8 + (i * w) / 4;
        const wp = at(lx, front);
        part(lx, y, front + 0.06, w / 4 - 0.25, 2.5, 0.1, '#5f8a8f', glassRole(wp.x, y, wp.z), false);
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const lz = -d / 2 + d / 6 + (i * d) / 3;
          const wp = at(side * (w / 2), lz);
          part(side * (w / 2 + 0.05), y, lz, 0.1, 2.5, d / 3 - 0.3, '#5f8a8f', glassRole(wp.x, y, wp.z), false);
        }
      }
      part(0, y + 1.5, front + 0.1, w + 0.1, 0.45, 0.12, '#e4e9ea');
    }
    for (let i = 0; i <= 8; i++) part(-w / 2 + (i * w) / 8, h / 2 + 2.5, front + 0.18, 0.18, h - 5, 0.18, '#aeb9bc');
    part(0, h + 0.6, 0, w + 0.3, 1.2, d + 0.3, '#aeb9bc');
    part(0, h + 1.8, -1, w * 0.5, 1.4, d * 0.5, '#9aa6a9');
  }

  function kiosk(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const front = d / 2;
    const { part, at } = frame(x, z, p.facing);
    part(0, 1.3, 0, w, 2.6, d, b.color);
    part(0, 1.35, front + 0.04, w - 0.6, 1.0, 0.08, '#2b3533');
    part(0, 0.95, front + 0.25, w - 0.4, 0.12, 0.5, '#e7d9bd');
    for (let k = 0; k < 5; k++) part(-w / 2 + (k + 0.5) * w / 5, 2.75, front + 0.6, w / 5, 0.12, 1.4, k % 2 ? '#f3e6ca' : '#3e7a3a');
    part(0, 2.75, -0.2, w + 0.3, 0.2, d + 0.2, '#e7d9bd');
    const pos = at(0, front + 0.06);
    sign(b.name, b.subtitle, p.signColor, pos.x, 3.35, pos.z, w - 0.2, 0.8, p.facing);
    for (let k = 0; k < 6; k++) {
      const sp = at(w / 2 + 0.25, -0.8 + k * 0.3);
      shape('cylinder', '#8fae5c', sp.x, 1.2, sp.z, 0.05, 2.4, 0.05, 0, (k - 2.5) * 0.04, false);
    }
  }

  const downtown: { plot: Plot; building: Building }[] = [];
  BUILDINGS.forEach((b, i) => {
    const p = PLOTS[i];
    if (p.style === 'legacy') legacyHouse(p, b);
    else if (p.style === 'hospital') hospitalBuilding(p, b);
    else if (p.style === 'police') policeStation(p, b);
    else if (p.style === 'school') schoolBuilding(p, b);
    else if (p.style === 'pagoda') pagodaBuilding(p, b);
    else if (p.style === 'office') officeBuilding(p, b);
    else if (p.style === 'kiosk') kiosk(p, b);
    else if (p.style === 'tower' || p.style === 'midrise') downtown.push({ plot: p, building: b });
    else newHouse(p, b);
  });
  const skyline = buildSkyline({ root, materials, geometries, textures, shape, sign, frame, fine: setFine }, downtown);
  {
    // The walking-street plaza: pale granite in a grid, and the city park's lawn with gravel paths.
    const { plaza, cityPark: park } = SCENERY;
    const pc = centre(plaza), kc = centre(park);
    box('#ddd6c6', pc.x, 0.17, pc.z, plaza.maxX - plaza.minX, 0.18, plaza.maxZ - plaza.minZ, 0, false, 'ground');
    for (let x = plaza.minX + 2.9; x < plaza.maxX; x += 2.9) box('#c9c1af', x, 0.265, pc.z, 0.08, 0.01, plaza.maxZ - plaza.minZ, 0, false, 'ground');
    for (let z = plaza.minZ + 2.9; z < plaza.maxZ; z += 2.9) box('#c9c1af', pc.x, 0.266, z, plaza.maxX - plaza.minX, 0.01, 0.08, 0, false, 'ground');
    // The walking street's fountain: a wide basin, a bowl on a column and jets of water.
    shape('cylinder', '#d9d2c2', pc.x, 0.55, pc.z, 3.5, 0.6, 3.5);
    shape('cylinder', '#6fb0b4', pc.x, 0.86, pc.z, 3.15, 0.04, 3.15, 0, 0, true, 'water');
    shape('cylinder', '#d9d2c2', pc.x, 1.5, pc.z, 0.45, 1.8, 0.45);
    shape('cylinder', '#d9d2c2', pc.x, 2.45, pc.z, 1.7, 0.22, 1.7);
    shape('cylinder', '#7fc0c4', pc.x, 2.58, pc.z, 1.5, 0.04, 1.5, 0, 0, false, 'water');
    shape('cylinder', '#bfe3e6', pc.x, 3.4, pc.z, 0.1, 1.6, 0.1, 0, 0, false, 'water');
    shape('ball', '#d7f0f2', pc.x, 4.25, pc.z, 0.32, 0.36, 0.32, 0, 0, false, 'water');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2;
      shape('cylinder', '#bfe3e6', pc.x + Math.cos(a) * 2.3, 1.35, pc.z + Math.sin(a) * 2.3, 0.05, 1.0, 0.05, -a, 0.35, false, 'water');
    }
    box('#8fae7f', kc.x, 0.15, kc.z, park.maxX - park.minX, 0.2, park.maxZ - park.minZ, 0, false);
    box('#d8cfb2', kc.x, 0.26, kc.z, 2.6, 0.04, park.maxZ - park.minZ, 0, false, 'ground');
    box('#d8cfb2', kc.x, 0.261, kc.z, park.maxX - park.minX, 0.04, 2.6, 0, false, 'ground');
  }

  // ---- Ground, roads, markings and crosswalks. ----
  // East-west roads run on past the fences into the haze; north-south ones from the riverside road south.
  const WEST = LAND.minX - 85, EAST = LAND.maxX + 85, SOUTH = LAND.maxZ + 80;
  const groundWest = -330, groundEast = LAND.maxX + 260;
  box('#b4b99a', (groundWest + groundEast) / 2, -0.22, 96.7, groundEast - groundWest, 0.42, 466.6, 0, false);
  box('#b4b99a', (groundWest + groundEast) / 2, -0.22, -272.5, groundEast - groundWest, 0.42, 135, 0, false);
  box('#d7d1bb', (WEST + EAST) / 2, -0.01, (-136.5 + SOUTH) / 2, EAST - WEST, 0.12, SOUTH + 136.5, 0, false, 'ground');
  for (const road of ROADS_Z) {
    box('#5f6a68', (WEST + EAST) / 2, 0.04, road, EAST - WEST, 0.08, ASPHALT_HALF * 2, 0, false, 'ground');
    for (let i = WEST + 4; i < EAST; i += 9) if (ROADS_X.every((r) => Math.abs(r - i) > 10)) box('#e3d4a7', i, 0.076, road, 3.2, 0.015, 0.17, 0, false, 'ground');
  }
  for (const road of ROADS_X) {
    box('#5f6a68', road, 0.039, (ROAD_FIRST + SOUTH) / 2, ASPHALT_HALF * 2, 0.08, SOUTH - ROAD_FIRST, 0, false, 'ground');
    for (let i = ROAD_FIRST + 10; i < SOUTH; i += 9) if (ROADS_Z.every((r) => Math.abs(r - i) > 10)) box('#e3d4a7', road, 0.075, i, 0.17, 0.015, 3.2, 0, false, 'ground');
  }
  // Zebra crossings sit on the walking lines, just outside each junction.
  for (const rx of ROADS_X) for (const rz of ROADS_Z) {
    for (const side of [-1, 1]) for (let stripe = -5.5; stripe <= 5.5; stripe += 1.375) {
      if (!(rz === ROAD_FIRST && side < 0)) box('#e4e3d4', rx + stripe, 0.078, rz + side * 8.6, 0.7, 0.015, 2.6, 0, false, 'ground');
      box('#e4e3d4', rx + side * 8.6, 0.079, rz + stripe, 2.6, 0.015, 0.7, 0, false, 'ground');
    }
  }
  // Raised sidewalks: paving slabs from the curb to the house fronts, with a pale stone curb along the
  // carriageway. East-west sidewalks run through the corners; north-south ones stop at them.
  const slabTop = 0.08 + CURB_HEIGHT;
  const slabRandom = seeded(7331);
  const spansBetween = (cuts: readonly number[], half: number, from: number, to: number) => {
    const spans: [number, number][] = [];
    let start = from;
    for (const c of [...cuts].sort((a, b) => a - b)) {
      if (c + half <= start || c - half >= to) continue;
      if (c - half > start) spans.push([start, c - half]);
      start = Math.max(start, c + half);
    }
    if (start < to) spans.push([start, to]);
    return spans;
  };
  function pavement(alongX: boolean, line: number, side: number, from: number, to: number, cuts: readonly number[], slabCut: number) {
    const inner = line + side * ASPHALT_HALF, outer = line + side * SIDEWALK_EDGE;
    const mid = (inner + outer) / 2, depth = SIDEWALK_EDGE - ASPHALT_HALF;
    const curbAt = inner + side * 0.18;
    const place = (a: number, along: number, c: number, across: number, h: number, color: ColorLike, role: Role = 'ground') =>
      alongX ? box(color, a, h / 2, c, along, h, across, 0, false, role) : box(color, c, h / 2, a, across, h, along, 0, false, role);
    for (const [a, b] of spansBetween(cuts, slabCut, from, to)) {
      // One tiled box per stretch (the paving shader lays the tiles): terracotta in An Hòa, pale granite downtown.
      const pieces = alongX ? [[a, Math.min(b, DOWNTOWN_X)], [Math.max(a, DOWNTOWN_X), b]] : [[a, b]];
      for (const [s0, s1] of pieces) {
        if (s1 - s0 < 0.01) continue;
        const downtown = (alongX ? (s0 + s1) / 2 : line) > DOWNTOWN_X;
        place((s0 + s1) / 2, s1 - s0, mid, depth, slabTop, downtown ? '#c4beb2' : vary('#c49a80', slabRandom(), 0.35), 'paving');
      }
    }
    for (const [a, b] of spansBetween(cuts, ASPHALT_HALF, from, to)) place((a + b) / 2, b - a, curbAt, 0.36, slabTop + 0.015, '#d9d5ca');
  }
  // East-west roads: cut where north-south carriageways cross (none south of the riverside road).
  for (const road of ROADS_Z) for (const side of [-1, 1]) pavement(true, road, side, WEST + 2, EAST - 2, road === ROAD_FIRST && side < 0 ? [] : ROADS_X, ASPHALT_HALF);
  // North-south roads: from the riverside road to the edge, leaving the corners to the east-west pavements.
  for (const road of ROADS_X) for (const side of [-1, 1]) pavement(false, road, side, ROAD_FIRST, SOUTH - 5, ROADS_Z, SIDEWALK_EDGE);

  // ---- The original park block and tiled square. ----
  const { park } = SCENERY;
  box('#91ad83', 28, 0.14, -33, 30, 0.2, 22, 0, false);
  box('#d8cfb2', 28, 0.25, -33, 28, 0.05, 3, 0, false, 'ground');
  box('#d8cfb2', 28, 0.251, -33, 3, 0.05, 20, 0, false, 'ground');
  shape('cylinder', '#d6c8ad', 28, 0.42, -33, 3.5, 0.42, 3.5);
  shape('cylinder', '#78a9a0', 28, 0.66, -33, 3.1, 0.04, 3.1, 0, 0, true, 'water');
  shape('cylinder', '#d6c8ad', 28, 1, -33, 0.75, 1.1, 0.75);
  shape('ball', '#e7d7b0', 28, 1.8, -33, 0.55, 0.6, 0.55);
  sign('CÔNG VIÊN NHỎ', 'HẸN NHAU DƯỚI TÁN CÂY', '#315b49', 28, 2.4, -22.3, 6.8, 1.25);
  box('#567465', 25.2, 1.2, -22.4, 0.12, 2.4, 0.12);
  box('#567465', 30.8, 1.2, -22.4, 0.12, 2.4, 0.12);
  box('#d9cbb3', 29, 0.16, 38, 29, 0.22, 17, 0, false, 'ground');
  for (let i = 0; i < 7; i++) box('#c3bca6', 16 + i * 4.2, 0.28, 38, 0.055, 0.015, 16.8, 0, false, 'ground');
  for (let i = 0; i < 4; i++) box('#c3bca6', 29, 0.28, 30 + i * 5.2, 28.8, 0.015, 0.055, 0, false, 'ground');
  // Café furniture, kept away from the mission pickup at (-32, 7).
  for (const t of SCENERY.tables) {
    lift = furnitureLift(t.x, t.z);
    table(t.x, t.z);
    stool(t.x - 1.25, t.z);
    stool(t.x + 1.25, t.z, '#698b81');
  }
  // Benches stand on whatever is under them: the sidewalk, the park lawn, the plaza tiles.
  for (const b of SCENERY.benches) {
    lift = furnitureLift(b.x, b.z);
    bench(b.x, b.z, b.yaw);
  }
  lift = 0;

  // Soft decoration only goes where nobody walks and nothing solid stands.
  function softFree(x: number, z: number, r: number) {
    if (pathClearance(x, z) < r + 0.55) return false;
    for (const c of COLLIDERS) {
      if (x + r > c.minX - 0.05 && x - r < c.maxX + 0.05 && z + r > c.minZ - 0.05 && z - r < c.maxZ + 0.05) return false;
    }
    return true;
  }
  const decor = seeded(4242);
  // Hedges and shrubs along the park edges (gaps open where paths cross), grass patches and flower beds.
  const parkEdges: [number, number, number, number][] = [[park.minX + 0.6, park.minZ + 0.6, park.maxX - 0.6, park.minZ + 0.6], [park.minX + 0.6, park.minZ + 0.6, park.minX + 0.6, park.maxZ - 2], [park.maxX - 0.6, park.minZ + 0.6, park.maxX - 0.6, park.maxZ - 2]];
  for (const [ax, az, bx, bz] of parkEdges) {
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += 1.1) {
      const hx = ax + ((bx - ax) * t) / len, hz = az + ((bz - az) * t) / len;
      if (!softFree(hx, hz, 0.5)) continue;
      box(vary('#5f8f55', decor()), hx, 0.62, hz, bx === ax ? 0.8 : 1.15, 0.7, bx === ax ? 1.15 : 0.8);
      shape('puff', vary('#6d9d5e', decor()), hx, 0.98, hz, 0.62, 0.32, 0.62, decor() * 3);
      if (decor() < 0.3) flowers(hx, 1.08, hz, 3, 0.7, 0.7, Math.floor(hx * 100 + hz));
    }
  }
  for (let i = 0; i < 26; i++) {
    const gx = park.minX + 1.5 + decor() * (park.maxX - park.minX - 3), gz = park.minZ + 1.5 + decor() * (park.maxZ - park.minZ - 3);
    if (Math.abs(gx - 28) < 2 || Math.abs(gz + 33) < 2) continue;
    box(vary('#a3c08a', decor()), gx, 0.245, gz, 1.5 + decor() * 2.5, 0.02, 1.2 + decor() * 2, decor() * PI, false);
  }
  for (const g of [...SCENERY.gardens]) {
    box('#93b083', (g.minX + g.maxX) / 2, 0.075, (g.minZ + g.maxZ) / 2, g.maxX - g.minX, 0.06, g.maxZ - g.minZ, 0, false);
    for (let i = 0; i < 40; i++) {
      const fx = g.minX + 0.8 + decor() * (g.maxX - g.minX - 1.6), fz = g.minZ + 0.8 + decor() * (g.maxZ - g.minZ - 1.6);
      if (!softFree(fx, fz, 0.6)) continue;
      if (decor() < 0.5) {
        box('#8a6f52', fx, 0.15, fz, 1.4, 0.16, 0.9, 0, false);
        flowers(fx, 0.3, fz, 7, 1.2, 0.7, i * 97 + Math.floor(fx));
      } else {
        shape('puff', vary('#5f9a55', decor()), fx, 0.45, fz, 0.7, 0.55, 0.7, decor() * 3);
        shape('puff', vary('#7fb06a', hash(fx, fz)), fx + 0.18, 0.78, fz - 0.12, 0.42, 0.34, 0.42, hash(fz, fx) * 3, 0, false);
      }
    }
  }
  for (const y of SCENERY.yards) {
    box(y.minX < 0 ? '#c9a989' : '#d9d0bd', (y.minX + y.maxX) / 2, 0.065, (y.minZ + y.maxZ) / 2, y.maxX - y.minX, 0.05, y.maxZ - y.minZ, 0, false, 'ground');
  }
  // School yard markings and a pagoda lotus basin.
  for (let i = 0; i < 5; i++) box('#ffffff', 22.5 + i * 1.6, 0.095, 124.8, 1.2, 0.01, 1.2, 0, false, 'ground');
  shape('cylinder', '#b9a58a', -16, 0.3, 131.5, 1.6, 0.6, 1.6);
  shape('cylinder', '#5f9f98', -16, 0.58, 131.5, 1.4, 0.05, 1.4, 0, 0, false, 'water');
  for (let i = 0; i < 5; i++) shape('ball', i % 2 ? '#f2a7c0' : '#6d9d5e', -16 + Math.sin(i * 1.3) * 0.8, 0.66, 131.5 + Math.cos(i * 1.3) * 0.8, 0.28, 0.08, 0.28, 0, 0, false);
  // Flower planters dotted around the square.
  for (const [fx, fz] of [[19.5, 31], [38.5, 31], [19.5, 41], [38.5, 41], [29, 31]]) {
    if (!softFree(fx, fz, 0.7)) continue;
    box('#cbb89a', fx, 0.5, fz, 1.6, 0.45, 1.6);
    flowers(fx, 0.8, fz, 9, 1.3, 1.3, Math.floor(fx * 10 + fz));
  }

  // ---- Street trees, park trees and bamboo. ----
  const nearRoad = (t: Tree) => ROADS_X.some((r) => Math.abs(Math.abs(t.x - r) - 9.3) < 0.6) || ROADS_Z.some((r) => Math.abs(Math.abs(t.z - r) - 9.3) < 0.6);
  for (const t of SCENERY.trees) {
    lift = onPavement(t.x, t.z);
    tree(t, nearRoad(t));
  }
  lift = 0;

  // ---- Street lamps and their night-time light pools. ----
  for (const l of SCENERY.lamps) {
    lift = onPavement(l.x, l.z);
    if (l.kind === 'street') {
      shape('cylinder', '#586c65', l.x, 3.2, l.z, 0.075, 6.4, 0.075);
      const yaw = Math.atan2(l.hx - l.x, l.hz - l.z);
      const len = Math.hypot(l.hx - l.x, l.hz - l.z);
      box('#586c65', (l.x + l.hx) / 2 + (l.hx - l.x) * 0.05, 6.35, (l.z + l.hz) / 2 + (l.hz - l.z) * 0.05, 0.13, 0.13, len + 0.15, yaw);
      box('#e9d8a7', l.hx, 6.25, l.hz, 0.35, 0.12, 0.65, yaw, false, 'lamp');
    } else {
      shape('cylinder', '#3f5a52', l.x, 1.9, l.z, 0.07, 3.8, 0.07);
      shape('cylinder', '#3f5a52', l.x, 0.15, l.z, 0.2, 0.3, 0.2);
      shape('ball', '#fff3d2', l.x, 3.95, l.z, 0.32, 0.36, 0.32, 0, 0, false, 'lamp');
      shape('cone', '#3f5a52', l.x, 4.38, l.z, 0.36, 0.25, 0.36);
    }
  }
  lift = 0;
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = poolCanvas.height = 64;
  {
    const ctx = poolCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const poolTexture = new THREE.CanvasTexture(poolCanvas);
  textures.push(poolTexture);
  const poolGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-HALF_PI);
  const poolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture, color: '#ffc477', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  geometries.push(poolGeometry);
  materials.push(poolMaterial);
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, LAMPS.length);
  SCENERY.lamps.forEach((l, i) => {
    const size = l.kind === 'street' ? 10.5 : 6.5;
    matrix.compose(position.set(l.hx, groundHeight(l.hx, l.hz) + 0.035, l.hz), quaternion.identity(), scale.set(size, 1, size));
    pools.setMatrixAt(i, matrix);
  });
  pools.instanceMatrix.needsUpdate = true;
  pools.computeBoundingSphere();
  pools.visible = false;
  pools.renderOrder = 2;
  root.add(pools);

  // ---- Traffic lights: a pole at the near right-hand corner of each approach, an arm over the lane with a
  // signal head, and a second head low on the pole. The lenses are one instanced mesh recoloured as they change.
  const LENS_ON: Record<Light, THREE.Color> = { red: new THREE.Color('#ff2a1a'), yellow: new THREE.Color('#ffb21a'), green: new THREE.Color('#2bff74') };
  const LENS_OFF = [new THREE.Color('#3a1412'), new THREE.Color('#3a2c12'), new THREE.Color('#123a1e')];
  const lensSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  for (const a of APPROACHES) {
    const { pole, dir } = a;
    const alongX = a.axis === 'x';
    // The heads face the oncoming traffic.
    const yaw = alongX ? (dir > 0 ? -HALF_PI : HALF_PI) : dir > 0 ? PI : 0;
    lift = onPavement(pole.x, pole.z);
    shape('cylinder', '#4a5458', pole.x, 3.1, pole.z, 0.11, 6.2, 0.11);
    shape('cylinder', '#3d4549', pole.x, 0.15, pole.z, 0.2, 0.3, 0.2);
    const armEnd = alongX ? { x: pole.x, z: a.rz + dir * 2.4 } : { x: a.rx - dir * 2.4, z: pole.z };
    box('#4a5458', (pole.x + armEnd.x) / 2, 6.0, (pole.z + armEnd.z) / 2, alongX ? 0.12 : Math.abs(pole.x - armEnd.x), 0.12, alongX ? Math.abs(pole.z - armEnd.z) : 0.12, 0, false);
    const heads = [
      alongX ? { x: pole.x, y: 5.25, z: a.rz + dir * 3.0 } : { x: a.rx - dir * 3.0, y: 5.25, z: pole.z },
      { x: pole.x - Math.sin(yaw) * -0.25, y: 2.9, z: pole.z - Math.cos(yaw) * -0.25 },
    ];
    for (const h of heads) {
      box('#1f2326', h.x, h.y, h.z, 0.44, 1.18, 0.3, yaw, false);
      box('#e9c84a', h.x - Math.sin(yaw) * 0.03, h.y, h.z - Math.cos(yaw) * 0.03, 0.56, 1.3, 0.04, yaw, false);
      for (let k = 0; k < 3; k++) {
        const ly = h.y + 0.37 - k * 0.37;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        box('#15181a', h.x + fx * 0.22, ly + 0.14, h.z + fz * 0.22, 0.34, 0.04, 0.16, yaw, false);
        lensSpots.push({ x: h.x + fx * 0.16, y: ly + lift, z: h.z + fz * 0.16, yaw });
      }
    }
    lift = 0;
    colliders.push({ minX: pole.x - 0.17, maxX: pole.x + 0.17, minZ: pole.z - 0.17, maxZ: pole.z + 0.17 });
  }
  const lensGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12).rotateX(HALF_PI);
  const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  geometries.push(lensGeometry);
  materials.push(lensMaterial);
  const lenses = new THREE.InstancedMesh(lensGeometry, lensMaterial, lensSpots.length);
  lensSpots.forEach((l, i) => {
    rotation.set(0, l.yaw, 0);
    lenses.setMatrixAt(i, matrix.compose(position.set(l.x, l.y, l.z), quaternion.setFromEuler(rotation), scale.set(1, 1, 1)));
    lenses.setColorAt(i, LENS_OFF[i % 3]);
  });
  lenses.computeBoundingSphere();
  root.add(lenses);
  const shown: (Light | 'off')[] = APPROACHES.map(() => 'off');
  /** Lights each approach's lenses for the current phase (dark when the power is out). */
  function updateSignals(time: number) {
    let changed = false;
    APPROACHES.forEach((a, n) => {
      const light: Light | 'off' = apocalypse ? 'off' : lightFor(a.rx, a.rz, a.axis, time);
      if (light === shown[n]) return;
      shown[n] = light;
      changed = true;
      for (let k = 0; k < 6; k++) {
        const slot = k % 3, on = (slot === 0 && light === 'red') || (slot === 1 && light === 'yellow') || (slot === 2 && light === 'green');
        lenses.setColorAt(n * 6 + k, on ? LENS_ON[light as Light] : LENS_OFF[slot]);
      }
    });
    if (changed && lenses.instanceColor) lenses.instanceColor.needsUpdate = true;
  }

  // ---- The nightlife strip ("phố đèn đỏ"): banners across the road at both ends, strings of red lanterns,
  // neon frames on every venue's sign, canopy and door, "18+" badges, and coloured light pools at night. ----
  const neonPools: { x: number; z: number; color: string; size: number }[] = [];
  for (const v of VENUES) {
    const b = v.building, f = b.facing, s = Math.sin(f), c = Math.cos(f);
    const front = b.d / 2;
    const at = (lx: number, lz: number) => ({ x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c });
    const tube = (lx: number, y: number, lz: number, length: number, vertical: boolean) => {
      const p = at(lx, lz);
      box(v.neon, p.x, y, p.z, vertical ? 0.07 : length, vertical ? length : 0.07, 0.07, f, false, 'neon');
    };
    // Around the shop sign (signSpot: on the first balcony, or over the door).
    const plot = PLOTS[b.id], spot = signSpot(plot), sw = spot.w + 0.25, sy = spot.y, sz = spot.lz + 0.07, half = spot.h / 2 + 0.14;
    tube(0, sy + half, sz, sw + 0.1, false);
    tube(0, sy - half, sz, sw + 0.1, false);
    tube(-sw / 2 - 0.05, sy, sz, half * 2, true);
    tube(sw / 2 + 0.05, sy, sz, half * 2, true);
    // Along the canopy edge (the original shophouses' striped canopy) and round the door, on the wall.
    if (plot.style === 'legacy') tube(0, 2.58, front + 2.2, b.w - 0.7, false);
    const doorLx = (v.door.x - b.x) * c - (v.door.z - b.z) * s;
    const doorLz = (v.door.x - b.x) * s + (v.door.z - b.z) * c - 0.72;
    for (const dx of [-0.95, 0.95]) tube(doorLx + dx, 1.3, doorLz, 2.3, true);
    tube(doorLx, 2.48, doorLz, 1.97, false);
    if (v.kind !== 'beer' && v.kind !== 'spa') {
      const badge = at(sw / 2 - 0.6, sz + 0.02);
      sign('18+', 'NGƯỜI LỚN', '#ffffff', badge.x, sy + half + 0.4, badge.z, 0.9, 0.5, f, v.neon);
    }
    const glow = at(doorLx, front + 1.6);
    neonPools.push({ x: glow.x, z: glow.z, color: v.neon, size: 5.5 });
  }
  const STRIP_Z = 54;
  // Banners across the road, hung between the facades at each end of the strip.
  for (const bx of [63, 94]) {
    box('#22121c', bx, 6.6, STRIP_Z + 4, 0.25, 0.9, 20.6, 0, false);
    sign('PHỐ ĐÊM PHƯỢNG VĨ', 'ẨM THỰC • BIA • KARAOKE • ÂM NHẠC', '#ff4f8b', bx - 0.14, 6.6, STRIP_Z + 4, 9.5, 1.4, -HALF_PI, '#1a0b16');
    sign('PHỐ ĐÊM PHƯỢNG VĨ', 'ẨM THỰC • BIA • KARAOKE • ÂM NHẠC', '#ff4f8b', bx + 0.14, 6.6, STRIP_Z + 4, 9.5, 1.4, HALF_PI, '#1a0b16');
    for (const dy of [-0.5, 0.5]) for (const dx of [-0.16, 0.16]) box('#ff3d7f', bx + dx, 6.6 + dy, STRIP_Z + 4, 0.06, 0.06, 20.4, 0, false, 'neon');
  }
  // Strings of lanterns sagging across the road between the banners.
  for (let lx = 68; lx <= 90; lx += 5.5) {
    box('#2a2226', lx, 5.75, STRIP_Z + 4, 0.03, 0.03, 20.8, 0, false);
    for (let t = 0.06; t < 1; t += 0.085) {
      const lz = STRIP_Z - 6.4 + t * 20.8, ly = 5.55 - Math.sin(t * PI) * 0.55;
      shape('ball', t * 12 % 2 < 1 ? '#d8402c' : '#ff4f8b', lx, ly, lz, 0.2, 0.26, 0.2, 0, 0, false, 'lantern');
    }
  }
  const neonPoolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  materials.push(neonPoolMaterial);
  const neonPoolMesh = new THREE.InstancedMesh(poolGeometry, neonPoolMaterial, neonPools.length);
  neonPools.forEach((pool, i) => {
    matrix.compose(position.set(pool.x, groundHeight(pool.x, pool.z) + 0.04, pool.z), quaternion.identity(), scale.set(pool.size, 1, pool.size));
    neonPoolMesh.setMatrixAt(i, matrix);
    neonPoolMesh.setColorAt(i, tmpColor.set(pool.color));
  });
  neonPoolMesh.instanceMatrix.needsUpdate = true;
  if (neonPoolMesh.instanceColor) neonPoolMesh.instanceColor.needsUpdate = true;
  neonPoolMesh.computeBoundingSphere();
  neonPoolMesh.visible = false;
  neonPoolMesh.renderOrder = 2;
  root.add(neonPoolMesh);

  // ---- Solid props from the layout. ----
  /** What each food cart sells (counters.ts places), so the cart shows that dish. */
  const cartKeys = new Map(PLACES.filter((p) => p.id.startsWith('cart')).map((p) => [Number(p.id.slice(4)), p.key]));
  function prop(pr: Prop, index: number) {
    const F = frame(pr.x, pr.z, pr.yaw);
    const { part, at, solid } = F;
    // Seeded from the prop's own tint: a seed linear in its position gave whole rows of neighbours the same colour.
    const r = seeded(Math.floor(pr.tint * 2147483) + 1);
    switch (pr.kind) {
      case 'fountain': break; // drawn with the park
      case 'stall': {
        // A sạp: a low wooden platform the vendor sells over (and sits beside), goods heaped on flat nia baskets.
        const x = pr.x, z = pr.z;
        box('#9c6f48', x, 0.38, z, 4.7, 0.76, 2.4);
        box('#c49a6c', x, 0.785, z, 4.8, 0.05, 2.5);
        for (const dx of [-2.1, 2.1]) box('#8d7458', x + dx, 1.8, z, 0.12, 3.2, 0.12);
        const canopy = z < 0 ? '#4f7fa8' : '#d79555';
        for (let stripe = 0; stripe < 6; stripe++) box(stripe % 2 ? '#efdeb9' : canopy, x - 2.5 + (stripe + 0.5) * 5 / 6, 3.5, z, 5 / 6, 0.2, 3.6);
        for (let n = 0; n < 8; n++) {
          const bx = x - 1.65 + (n % 4) * 1.1, bz = z - 0.5 + Math.floor(n / 4) * 1.0;
          shape('cylinder', '#b8925a', bx, 0.84, bz, 0.78, 0.05, 0.78);
          const produce = n % 3 ? (z < 0 ? '#c9d6dc' : '#e4ad58') : n % 2 ? '#86a169' : '#c8553d';
          for (let k = 0; k < 3; k++) shape('ball', produce, bx + (k - 1) * 0.17, 0.93 + (k === 1 ? 0.05 : 0), bz + (k === 1 ? 0.08 : -0.05), 0.24, 0.2, 0.24);
        }
        break;
      }
      case 'fence': {
        const along = pr.sx > pr.sz;
        const len = along ? pr.sx : pr.sz;
        box('#f4ecd6', pr.x, 0.35, pr.z, pr.sx, 0.7, pr.sz);
        box('#2c5d8f', pr.x, 1.55, pr.z, along ? len : 0.08, 0.08, along ? 0.08 : len);
        for (let t = -len / 2 + 0.2; t <= len / 2; t += 0.45) box('#2c5d8f', pr.x + (along ? t : 0), 1.1, pr.z + (along ? 0 : t), 0.05, 0.8, 0.05);
        break;
      }
      case 'wall':
        box('#e7b75f', pr.x, 0.9, pr.z, pr.sx, 1.8, pr.sz);
        box('#8e4a33', pr.x, 1.9, pr.z, pr.sx + 0.25, 0.22, pr.sz + 0.25);
        break;
      case 'pillar':
        if (pr.sx < 0.9) {
          box('#f4ecd6', pr.x, 1.9, pr.z, pr.sx, 3.8, pr.sz);
          box('#2c5d8f', pr.x, 3.95, pr.z, pr.sx + 0.15, 0.2, pr.sz + 0.15);
        }
        break; // the pagoda gate pillars are drawn with the pagoda
      case 'urn':
        shape('cylinder', '#6f5a3a', pr.x, 0.45, pr.z, 0.45, 0.9, 0.45);
        shape('ball', '#8a6a3c', pr.x, 1.05, pr.z, 0.55, 0.5, 0.55);
        shape('cylinder', '#6f5a3a', pr.x, 1.45, pr.z, 0.3, 0.4, 0.3);
        for (let i = 0; i < 3; i++) shape('cylinder', '#c0392b', pr.x + Math.sin(i * 2.1) * 0.15, 1.85, pr.z + Math.cos(i * 2.1) * 0.15, 0.015, 0.45, 0.015, 0, 0, false, 'lantern');
        smoke('incense', pr.x, 2.1, pr.z);
        break;
      case 'stupa':
        for (let i = 0; i < 5; i++) {
          const s = 2.3 - i * 0.35;
          box(i % 2 ? '#d6c2a0' : '#e7d3ad', pr.x, 0.55 + i * 1.1, pr.z, s, 1.0, s);
          box('#8e4a33', pr.x, 1.1 + i * 1.1, pr.z, s + 0.3, 0.12, s + 0.3);
        }
        shape('pyramid', '#8e4a33', pr.x, 6.3, pr.z, 0.8, 1.2, 0.8);
        shape('ball', '#d8a531', pr.x, 7.0, pr.z, 0.18, 0.25, 0.18);
        break;
      case 'flagpole': {
        shape('cylinder', '#d9d9d2', pr.x, 4, pr.z, 0.06, 8, 0.06);
        cloth(CLOTH.flag, pr.x + 0.87, 7.35, pr.z, 1.65, 1.1, 0, { mode: 0, amp: 0.1 });
        shape('cylinder', '#b9ad96', pr.x, 0.2, pr.z, 0.5, 0.4, 0.5);
        break;
      }
      case 'shelter': {
        // Bus stop: back panel on the building side, cantilevered roof over the bench, name board facing the road.
        part(0, 1.3, 0, 4.4, 2.2, 0.08, '#9fc2d4', 'glass', false);
        for (const sx of [-2.15, 2.15]) part(sx, 1.35, 0, 0.12, 2.7, 0.14, '#3f5a6a');
        part(0, 2.75, 0.95, 4.7, 0.12, 2.3, '#3f6f9a');
        part(0, 2.66, 0.95, 0.4, 0.05, 1.4, '#fff4d8', 'lamp', false);
        bench(at(0, 1.15).x, at(0, 1.15).z, pr.yaw);
        const sp = at(0, 2.12);
        // Line 03 loops An Hòa only; 08 and 15 also call at the Bạch Đằng shelter downtown (transit.ts LINE_SPECS).
        sign('TRẠM XE BUÝT', pr.x > DOWNTOWN_X ? 'TUYẾN 08 • 15' : 'TUYẾN 03 • 08 • 15', '#ffffff', sp.x, 2.75, sp.z, 3.6, 0.6, pr.yaw, '#2c64a8');
        break;
      }
      case 'planter':
        part(0, 0.27, 0, 1.1, 0.45, 0.5, pickOf(r, ['#cbb89a', '#b7a58b', '#c98a5c']));
        part(0, 0.5, 0, 0.95, 0.04, 0.38, '#6b5440');
        if (r() < 0.6) {
          const f = at(0, 0);
          flowers(f.x, 0.6, f.z, 7, 0.9, 0.35, Math.floor(pr.x * 13 + pr.z * 7));
        } else for (const k of [-0.25, 0.25]) {
          const f = at(k, 0);
          shape('ball', vary('#5f9a55', r()), f.x, 0.72, f.z, 0.32, 0.34, 0.3);
        }
        break;
      case 'scooter': break; // a real vehicle (vehicles.ts curb spots)
      case 'cart': {
        // A street-food cart: what it shows matches what its counter sells (bánh mì in a glass case, a pot of soup...).
        const key = cartKeys.get(index) ?? 'banhmi';
        const tint = pickOf(r, ['#4f7fa8', '#c9493b', '#d9a441', '#c8ccc9']);
        part(0, 0.55, 0, 1.8, 0.75, 0.9, tint);
        part(0, 1.2, 0, 1.6, 0.55, 0.75, '#bcd3d6', 'glass', false);
        part(0, 1.5, 0, 1.75, 0.06, 0.85, '#e7e3d8');
        for (const lx of [-0.75, 0.75]) solid('cylinder', lx, 0.18, 0.46, 0.18, 0.06, 0.18, '#232323', HALF_PI, true, HALF_PI);
        part(-0.6, 1.95, 0, 0.05, 2.0, 0.05, '#6b6b6b');
        const u = at(-0.6, 0);
        shape('cone', pickOf(r, ['#e5484d', '#3f8fc9', '#f5c84a', '#5e927c']), u.x, 2.95, u.z, 1.35, 0.55, 1.35, pr.yaw, 0, true);
        F.tag('box', FRONT_OF[key]?.[1] ?? 'BÁNH MÌ', '#c8322a', '#fff6dc', 0, 1.2, 0.39, 1.5, 0.32, { glow: 0.6 });
        if (key === 'banhmi') for (let i = 0; i < 5; i++) solid('ball', -0.55 + i * 0.27, 1.06, -0.05, 0.05, 0.05, 0.2, '#e3a957', 0, false, HALF_PI);
        else if (key === 'che' || key === 'xoi') for (let i = 0; i < 4; i++) solid('cylinder', -0.5 + i * 0.33, 1.1, -0.05, 0.11, 0.18, 0.11, pickOf(r, ['#7fb04a', '#e8c04a', '#c8504a', '#f1e6c8', '#6a4fa0']), 0, false);
        else {
          solid('cylinder', 0.45, 1.68, 0, 0.26, 0.32, 0.26, '#c7ccce', 0, false);
          F.smoke('steam', 0.45, 1.9, 0);
        }
        if (key === 'banhxeo' || key === 'banhmi') { solid('cylinder', -0.35, 1.56, 0.1, 0.22, 0.05, 0.22, '#2b2b2b', 0, false); F.smoke('grill', -0.35, 1.7, 0.1); }
        break;
      }
      case 'pole': break; // drawn with the cables (street dressing below)
      case 'bin': {
        // A 240 l wheelie bin, green (a quarter orange): body, lid, wheels.
        const color = pr.tint < 0.25 ? '#e0782a' : '#2f7d4f';
        part(0, 0.56, 0, 0.58, 0.96, 0.68, color);
        part(0, 1.06, -0.03, 0.62, 0.06, 0.74, vary(color, 0.3, 0.6));
        part(0, 0.98, -0.36, 0.5, 0.05, 0.05, '#3a3d3c', 'solid', false);
        for (const k of [-1, 1]) solid('cylinder', k * 0.24, 0.1, -0.3, 0.1, 0.06, 0.1, '#1f2224', HALF_PI, false, HALF_PI);
        break;
      }
      case 'lottery': {
        // A vé số seller's glass case on legs, the day's tickets clipped inside, VÉ SỐ on top.
        for (const a of [-0.22, 0.22]) for (const b of [-0.16, 0.16]) part(a, 0.42, b, 0.03, 0.84, 0.03, '#8a8f92', 'solid', false);
        part(0, 0.9, 0, 0.56, 0.12, 0.42, '#3f6f9a');
        part(0, 1.12, 0, 0.54, 0.32, 0.4, '#cfe0e4', 'glass', false);
        F.decal(DECAL.lottery, 0, 1.12, 0.205, 0.5, 0.3);
        F.decal(DECAL.lottery, 0, 1.12, -0.205, 0.5, 0.3, { yaw: PI });
        F.tag('box', 'VÉ SỐ', '#ffffff', '#c8322a', 0, 1.42, 0, 0.56, 0.2, { glow: 0.5 });
        break;
      }
    }
  }
  SCENERY.props.forEach((pr, i) => {
    lift = onPavement(pr.x, pr.z);
    prop(pr, i);
  });
  lift = 0;

  // Potted plants by doors, and lanterns strung across the alleys between houses.
  BUILDINGS.forEach((b, i) => {
    const p = PLOTS[i];
    if (p.style !== 'legacy' && p.style !== 'home' && p.style !== 'shop') return;
    const e = { x: Math.round(Math.sin(b.facing)), z: Math.round(Math.cos(b.facing)) };
    const lateral = { x: Math.abs(e.z), z: Math.abs(e.x) };
    for (const side of [-1, 1]) {
      if (hash(b.x, b.z, side) < 0.45) continue;
      const px = b.door.x - e.x * 0.45 + lateral.x * side * 1.9, pz = b.door.z - e.z * 0.45 + lateral.z * side * 1.9;
      if (softFree(px, pz, 0.3)) pot(px, pz, 0.08, 1, i * 13 + side);
    }
  });
  const rows = new Map<number, number[]>();
  PLOTS.forEach((p, i) => { if (p.row >= 0) { if (!rows.has(p.row)) rows.set(p.row, []); rows.get(p.row)!.push(i); } });
  for (const list of rows.values()) {
    const alongX = Math.abs(Math.cos(PLOTS[list[0]].facing)) > 0.5;
    list.sort((a, b) => (alongX ? PLOTS[a].full.minX - PLOTS[b].full.minX : PLOTS[a].full.minZ - PLOTS[b].full.minZ));
    for (let k = 0; k + 1 < list.length; k++) {
      const a = PLOTS[list[k]], b = PLOTS[list[k + 1]];
      const gap = alongX ? b.full.minX - a.full.maxX : b.full.minZ - a.full.maxZ;
      if (gap < 1 || gap > 4.5) continue;
      const fa = a.full, fb = b.full;
      const e = { x: Math.round(Math.sin(a.facing)), z: Math.round(Math.cos(a.facing)) };
      const frontCoord = alongX ? (e.z > 0 ? Math.min(fa.maxZ, fb.maxZ) : Math.max(fa.minZ, fb.minZ)) : (e.x > 0 ? Math.min(fa.maxX, fb.maxX) : Math.max(fa.minX, fb.minX));
      if (hash(a.full.minX, a.full.minZ, 7) < 0.3 && a.number > 0) {
        // A cổng hẻm over the alley mouth: two slim posts against the walls, a lintel with the alley's number, a lantern.
        const lo = alongX ? fa.maxX : fa.maxZ, hi = alongX ? fb.minX : fb.minZ, mid = (lo + hi) / 2;
        const c0 = frontCoord - (alongX ? e.z : e.x) * 0.25;
        const at = (t: number) => (alongX ? { x: t, z: c0 } : { x: c0, z: t });
        for (const t of [lo + 0.12, hi - 0.12]) { const pp = at(t); box('#d9cfba', pp.x, 1.9, pp.z, 0.22, 3.8, 0.22); }
        const m = at(mid);
        box('#d9cfba', m.x, 3.9, m.z, alongX ? gap : 0.3, 0.3, alongX ? 0.3 : gap);
        const yaw = Math.atan2(e.x, e.z);
        tag('box', `HẺM ${a.number}`, '#ffffff', hash(fa.minX, fa.minZ, 9) < 0.5 ? '#1d4f9c' : '#a8322a', m.x + e.x * 0.17, 3.9, m.z + e.z * 0.17, Math.min(gap - 0.3, 1.6), 0.26, yaw, 0.4);
        shape('ball', '#d8402c', m.x, 3.45, m.z, 0.18, 0.24, 0.18, 0, 0, false, 'lantern');
      }
      if (hash(a.full.minX, a.full.minZ, 11) < 0.4) {
        // A tradesman's ad painted on the side wall down the alley (made-up numbers).
        const ads = ['KHOAN CẮT BÊ TÔNG|ĐT: 09xx.xxx.xxx', 'CHỐNG THẤM – SƠN NƯỚC|ĐT: 09xx.xxx.xxx', 'HÚT HẦM CẦU|THÔNG CỐNG NGHẸT 09xx.xxx.xxx', 'SỬA ỐNG NƯỚC – ĐIỆN|09xx.xxx.xxx'];
        const text = ads[Math.floor(hash(fa.minX, fa.minZ, 13) * ads.length)];
        const c0 = frontCoord - (alongX ? e.z : e.x) * 2.8, wallAt = alongX ? fa.maxX + 0.01 : fa.maxZ + 0.01;
        tag('paint', text, hash(fa.minX, fa.minZ, 17) < 0.5 ? '#1d4f9c' : '#b3261e', '#ece8dc', alongX ? wallAt : c0, Math.min(a.h - 1, 4.3), alongX ? c0 : wallAt, 2.6, 0.8, alongX ? HALF_PI : 0);
      }
      if (hash(a.full.minX, a.full.minZ, 5) < 0.3) continue;
      const y = Math.max(4.4, Math.min(a.h, b.h) - 1.6);
      for (const depth of [0.8, 3.2]) {
        const c0 = frontCoord - (alongX ? e.z : e.x) * depth;
        const lo = alongX ? fa.maxX : fa.maxZ, hi = alongX ? fb.minX : fb.minZ;
        const mid = (lo + hi) / 2;
        const wx = alongX ? mid : c0, wz = alongX ? c0 : mid;
        box('#3d3a35', wx, y + 0.35, wz, alongX ? gap : 0.03, 0.03, alongX ? 0.03 : gap, 0, false);
        const n = gap > 2.6 ? 3 : 2;
        for (let j = 0; j < n; j++) {
          const t = lo + (gap * (j + 1)) / (n + 1);
          const lx = alongX ? t : c0, lz = alongX ? c0 : t;
          shape('ball', j % 2 ? '#e8b03a' : '#d8402c', lx, y, lz, 0.24, 0.3, 0.24, 0, 0, false, 'lantern');
          box('#e8c66a', lx, y + 0.3, lz, 0.14, 0.06, 0.14, 0, false);
        }
      }
    }
  }
  // Bunting over the market alley behind the café row.
  const bunting = ['#e5484d', '#f5c84a', '#3f8fc9', '#5e9a5a', '#f4f1e8'];
  for (const bx of [-36.5, -25.5, -13.6]) {
    box('#3d3a35', bx, 5.25, 31.5, 0.03, 0.03, 10, 0, false);
    for (let i = 0; i < 14; i++) shape('cone', bunting[i % bunting.length], bx, 4.98 - Math.sin((i / 13) * PI) * 0.25, 26.9 + i * 0.7, 0.22, 0.42, 0.04, HALF_PI, PI, false);
  }
  // Tarps over the market alley between the stalls, and a string of bulbs along it.
  for (const [tx, color] of [[-36.5, '#2f6fb5'], [-25.5, '#d9a441'], [-47, '#2f6fb5']] as const) {
    box(color, tx, 4.3, 31.5, 3.4, 0.03, 4.8, 0, false);
    decal(DECAL.ton, tx, 4.28, 31.5, 3.4, 4.8, 0, { pitch: -HALF_PI, tint: color });
    for (const sx of [-1.6, 1.6]) for (const sz of [-2.3, 2.3]) box('#6b6f70', tx + sx, 2.15, 31.5 + sz, 0.05, 4.3, 0.05, 0, false);
  }
  box('#3d3a35', -31, 3.74, 31.5, 34, 0.02, 0.02, 0, false);
  for (let lx = -47.5; lx <= -14.5; lx += 1.5) shape('ball', '#fff2c8', lx, 3.66, 31.5, 0.07, 0.09, 0.07, 0, 0, false, 'lamp');

  // ---- Street dressing: concrete power poles carrying sagging bundles of cables, with service drops to the
  // houses and bundles across the street; civic banners, street-name plates and flags on the downtown lamp posts. ----
  {
    const rr = seeded(8128);
    const dark = ['#26282a', '#2e2f31', '#1f2122', '#3a3632', '#2b2d30'].map((c) => new THREE.Color(c));
    const pale = new THREE.Color('#cfcfc6');
    const across = (p: Pole) => ({ x: Math.sin(p.yaw), z: Math.cos(p.yaw) });
    const base = (p: Pole) => onPavement(p.x, p.z);
    SCENERY.poles.forEach((p) => {
      lift = base(p);
      const a = across(p), H = p.main ? 8.8 : 7.2;
      shape('trunk', '#bdb9ae', p.x, H / 2, p.z, 0.15, H, 0.15, p.yaw, 0, true);
      box('#9c978c', p.x, 0.35, p.z, 0.4, 0.7, 0.4, p.yaw);
      const arm = (y: number, len: number) => {
        box('#77736c', p.x, y, p.z, 0.1, 0.1, len, p.yaw, false);
        setFine(true);
        for (const k of [-0.42, 0, 0.42]) shape('bead', '#e8e4d8', p.x + a.x * k * len / 1.2, y + 0.1, p.z + a.z * k * len / 1.2, 0.07, 0.12, 0.07, 0, 0, false);
        setFine(false);
      };
      if (p.main) { arm(8.25, 1.4); arm(7.45, 1.0); }
      box('#4a4c4e', p.x, 5.85, p.z, 0.32, 0.22, 0.32, p.yaw, false);
      box('#8c9096', p.x - a.x * 0.2, 2.6, p.z - a.z * 0.2, 0.36, 0.5, 0.22, p.yaw, false);
      setFine(true);
      // A coil of spare cable, flyers pasted on the shaft, and on some a row of electricity meters.
      if (p.main) shape('cylinder', '#2a2b2c', p.x - a.x * 0.28, 4.6, p.z - a.z * 0.28, 0.32, 0.16, 0.32, p.yaw + 0.4, 0.2, false);
      decal(DECAL.stickers, p.x - a.x * 0.17, 1.6 + rr() * 0.6, p.z - a.z * 0.17, 0.32, 0.9, p.yaw + PI);
      if (rr() < 0.2) decal(DECAL.meters, p.x - a.x * 0.17, 3.3, p.z - a.z * 0.17, 0.8, 0.8, p.yaw + PI);
      setFine(false);
      if (p.transformer) {
        // A pole-top transformer bank: a platform, three grey pots, a danger sign.
        box('#6f6c66', p.x - a.x * 0.45, 6.4, p.z - a.z * 0.45, 0.5, 0.1, 1.3, p.yaw + HALF_PI, false);
        for (const k of [-0.42, 0, 0.42]) shape('cylinder', '#8e9396', p.x - a.x * 0.45 + a.z * k, 6.85, p.z - a.z * 0.45 - a.x * k, 0.17, 0.8, 0.17, 0, 0, true);
        decal(DECAL.danger, p.x - a.x * 0.17, 3.35, p.z - a.z * 0.17, 0.42, 0.42, p.yaw + PI);
      }
      lift = 0;
    });
    // Cables along each line of poles: three power lines and two lower ones on the main side, and on every pole the
    // telecom bundle, six to ten loose cables of different sag, a few pale.
    const lines = new Map<string, Pole[]>();
    for (const p of SCENERY.poles) { let l = lines.get(p.line); if (!l) { l = []; lines.set(p.line, l); } l.push(p); }
    for (const list of lines.values()) for (let i = 0; i + 1 < list.length; i++) {
      const pa = list[i], pb = list[i + 1], span = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      if (span > (pa.main ? 40 : 62)) continue;
      const aa = across(pa), ab = across(pb), ya = base(pa), yb = base(pb), sagK = span / 28;
      const wire = (y: number, offA: number, offB: number, sag: number, width: number, color: THREE.Color, dy = 0) =>
        cables.base.push({ ax: pa.x + aa.x * offA, ay: y + ya + dy, az: pa.z + aa.z * offA, bx: pb.x + ab.x * offB, by: y + yb - dy, bz: pb.z + ab.z * offB, sag: sag * sagK, width, color });
      if (pa.main && pb.main) {
        for (const k of [-0.48, 0, 0.48]) wire(8.33, (k * 1.4) / 1.2, (k * 1.4) / 1.2, 0.35 + rr() * 0.15, 0.022, dark[0]);
        for (const k of [-0.35, 0.35]) wire(7.53, k, k, 0.45 + rr() * 0.2, 0.022, dark[1]);
      }
      const n = 4 + Math.floor(rr() * 4);
      for (let k = 0; k < n; k++) {
        const o = (rr() - 0.5) * 0.3;
        wire(5.85, o, o + (rr() - 0.5) * 0.2, 0.45 + rr() * 0.95, 0.025 + rr() * 0.02, rr() < 0.18 ? pale : dark[Math.floor(rr() * dark.length)], (rr() - 0.5) * 0.09);
      }
    }
    const anHoa = BUILDINGS.map((b, i) => ({ b, p: PLOTS[i] })).filter(({ b, p }) => (p.style === 'legacy' || p.style === 'home' || p.style === 'shop') && b.x < DOWNTOWN_X);
    // Service drops: one to three cables from the nearest pole to each house front.
    for (const { b, p } of anHoa) {
      const e = { x: Math.round(Math.sin(b.facing)), z: Math.round(Math.cos(b.facing)) };
      const wall = { x: b.door.x - e.x * 0.75, z: b.door.z - e.z * 0.75 };
      let best: Pole | null = null, bd = 40;
      for (const q of SCENERY.poles) { const dd = Math.hypot(q.x - wall.x, q.z - wall.z); if (dd < bd) { bd = dd; best = q; } }
      if (!best) continue;
      const lat = { x: Math.abs(e.z), z: Math.abs(e.x) }, n = 1 + Math.floor(rr() * 3), y0 = base(best);
      for (let k = 0; k < n; k++) {
        const off = (rr() - 0.5) * (b.w - 2);
        cables.fine.push({ ax: best.x, ay: 5.8 + y0 + (rr() - 0.5) * 0.2, az: best.z, bx: wall.x + lat.x * off + e.x * 0.05, by: Math.min(p.h - 0.5, 3.7 + rr() * 1.6), bz: wall.z + lat.z * off + e.z * 0.05, sag: 0.25 + rr() * 0.45, width: 0.025, color: dark[k % dark.length] });
      }
    }
    // Bundles across the street from every third main pole, to a pole or a house wall on the other side.
    for (const list of lines.values()) list.forEach((p, k) => {
      if (!p.main || k % 3 !== 1) return;
      const a = across(p);
      const far = { x: p.x + a.x * 20.05, z: p.z + a.z * 20.05 };
      const opposite = SCENERY.poles.find((q) => q !== p && Math.hypot(q.x - p.x - a.x * 15.2, q.z - p.z - a.z * 15.2) < 10);
      const to = opposite ? { x: opposite.x, y: 5.85 + base(opposite), z: opposite.z } : { x: far.x, y: 5.6, z: far.z };
      const n = 2 + Math.floor(rr() * 3);
      for (let j = 0; j < n; j++) {
        const o = (rr() - 0.5) * 0.3;
        cables.fine.push({ ax: p.x + a.z * o, ay: 5.85 + base(p) + (rr() - 0.5) * 0.15, az: p.z - a.x * o, bx: to.x + a.z * o, by: to.y + (rr() - 0.5) * 0.15, bz: to.z - a.x * o, sag: 0.6 + rr() * 0.4, width: 0.03, color: dark[j % dark.length] });
      }
    });
    // Civic banners (khẩu hiệu) across the east-west streets, between a pole and the facade opposite.
    const SLOGANS = ['CHÀO MỪNG NGÀY QUỐC KHÁNH 2-9', 'PHƯỜNG AN HÒA XANH – SẠCH – ĐẸP', 'AN TOÀN GIAO THÔNG LÀ HẠNH PHÚC CỦA MỌI NHÀ', 'ĐÃ UỐNG RƯỢU BIA – KHÔNG LÁI XE', 'CHÚC MỪNG NĂM MỚI', 'KHU PHỐ VĂN HÓA AN HÒA'];
    let slogan = 0;
    const hung = new Set<Pole>();
    for (const road of [-54, 0, 54]) for (const bx of [-81, -27, 27, 81]) {
      const near = SCENERY.poles.filter((p) => p.main && !hung.has(p) && p.line.startsWith(`h${road}:`) && Math.abs(p.x - bx) < 14);
      const pole = near.sort((a, b) => Math.abs(a.x - bx) - Math.abs(b.x - bx))[0];
      if (!pole) continue;
      hung.add(pole);
      const side = Math.sign(pole.z - road), x = pole.x;
      tag('banner', SLOGANS[slogan++ % SLOGANS.length], '#ffd75e', '#c8322a', x, 6.3, road, 11, 0.85, HALF_PI, 0.3);
      for (const dy of [0.38, -0.38]) {
        box('#d9d4c4', x, 6.3 + dy, (road + side * 5.5 + pole.z) / 2, 0.02, 0.02, Math.abs(pole.z - road - side * 5.5), 0, false);
        box('#d9d4c4', x, 6.3 + dy, (road - side * 5.5 + road - side * 12.45) / 2, 0.02, 0.02, 6.95, 0, false);
      }
    }
    // Street-name plates on the signal poles: the name of the street each one stands on.
    for (const ap of APPROACHES) {
      const name = ap.axis === 'x' ? STREETS_H.get(ap.rz) : STREETS_V.get(ap.rx);
      if (!name) continue;
      lift = onPavement(ap.pole.x, ap.pole.z);
      const yaw = ap.axis === 'x' ? 0 : HALF_PI, rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const out = ap.axis === 'x' ? Math.sign(ap.rx - ap.pole.x) || 1 : Math.sign(ap.rz - ap.pole.z) || 1;
      box('#4a5458', ap.pole.x + rx * out * 0.4, 3.62, ap.pole.z + rz * out * 0.4, ap.axis === 'x' ? 0.8 : 0.04, 0.04, ap.axis === 'x' ? 0.04 : 0.8, 0, false);
      tag('plate', name, '#ffffff', '#1d4f9c', ap.pole.x + rx * out * 0.78, 3.4, ap.pole.z + rz * out * 0.78, 1.3, 0.32, yaw, 0.25);
      lift = 0;
    }
    // Downtown lamp posts fly two national flags each, out along the street.
    for (const l of SCENERY.lamps) {
      if (l.kind !== 'street' || l.x < DOWNTOWN_X) continue;
      lift = onPavement(l.x, l.z);
      const alongX = Math.abs(l.hz - l.z) > Math.abs(l.hx - l.x);
      const dir = alongX ? 0 : -HALF_PI;
      box('#586c65', l.x, 4.62, l.z, alongX ? 0.9 : 0.05, 0.05, alongX ? 0.05 : 0.9, 0, false);
      for (const s of [1, -1]) {
        const ox = alongX ? s * (0.06 + 0.375) : 0, oz = alongX ? 0 : s * (0.06 + 0.375);
        cloth(CLOTH.flag, l.x + ox, 4.3, l.z + oz, 0.75, 0.5, dir + (s < 0 ? PI : 0), { mode: 0, amp: 0.06 });
      }
      lift = 0;
    }
    // The open car parks downtown (parking.ts lots): painted bays round every car spot and a blue P sign at the row's end.
    for (const lot of LOTS) {
      if (lot.kind !== 'carpark') continue;
      const spots = lot.spots.map((id) => SPOTS[id]);
      for (const s of spots) {
        const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw), y = groundHeight(s.x, s.z) + 0.006;
        for (const k of [-1.3, 1.3]) box('#e8e6dc', s.x + rx * k, y, s.z + rz * k, 0.1, 0.012, 5.0, s.yaw, false, 'ground');
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        box('#e8e6dc', s.x + fx * 2.5, y, s.z + fz * 2.5, 2.7, 0.012, 0.1, s.yaw, false, 'ground');
      }
      const first = spots.reduce((a, b) => (a.x < b.x ? a : b)), px = first.x - 2.3, pz = first.z;
      lift = groundHeight(px, pz);
      shape('cylinder', '#8a8f92', px, 1.2, pz, 0.05, 2.4, 0.05, 0, 0, false);
      tag('box', 'P|BÃI ĐỖ XE', '#ffffff', '#1d4f9c', px, 2.25, pz, 1.1, 0.8, first.yaw + PI, 0.5);
      lift = 0;
    }
    // Strings of small Buddhist flags across the pagoda yard.
    for (const [x0, z0, x1, z1] of [[-31.5, 120.4, -27, 126.4], [-22.5, 120.4, -27, 126.4], [-40.5, 121, -13.5, 121]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 0.55), yaw = Math.atan2(x1 - x0, z1 - z0) - HALF_PI;
      for (let i = 1; i < n; i++) {
        const t = i / n, sag = Math.sin(t * PI) * 0.45;
        cloth(CLOTH.buddhist, x0 + (x1 - x0) * t, 4.55 - sag - 0.17, z0 + (z1 - z0) * t, 0.36, 0.26, yaw, { mode: 1, amp: 0.04 });
      }
      cables.base.push({ ax: x0, ay: 4.6, az: z0, bx: x1, by: 4.6, bz: z1, sag: 0.45, width: 0.012, color: dark[0] });
    }
  }

  // ---- Riverside promenade, the river and the far bank. ----
  const promenadeEast = LAND.maxX + 60;
  const midX = (groundWest + groundEast) / 2, spanX = groundEast - groundWest;
  for (let x = -198; x <= promenadeEast; x += 4) box('#cfc2a6', x, 0.056, -127, 0.06, 0.01, 18, 0, false, 'ground');
  box('#cfc2a6', (-200 + promenadeEast) / 2, 0.057, -119.8, promenadeEast + 200, 0.01, 0.06, 0, false, 'ground');
  box('#cfc2a6', (-200 + promenadeEast) / 2, 0.057, -133.9, promenadeEast + 200, 0.01, 0.06, 0, false, 'ground');
  box('#bbaf96', midX, -0.55, -137.1, spanX, 1.3, 1.2, 0, true);
  // The railing, with openings onto each pier and its steps.
  const gaps = SCENERY.docks.flatMap((d) => [[d.pier.minX - 0.2, d.pier.maxX + 0.2], [d.steps.minX - 0.2, d.steps.maxX + 0.2]]).sort((a, b) => a[0] - b[0]);
  let railFrom = -200;
  for (const [g0, g1] of [...gaps, [promenadeEast, promenadeEast]]) {
    if (g0 > railFrom) {
      box('#e2cfaa', (railFrom + g0) / 2, 0.45, -136.1, g0 - railFrom, 0.12, 0.2);
      box('#e2cfaa', (railFrom + g0) / 2, 0.95, -136.1, g0 - railFrom, 0.1, 0.16);
      for (let x = railFrom; x <= g0; x += 2.5) box('#d6c4a1', x, 0.5, -136.1, 0.16, 0.95, 0.16);
      box('#d6c4a1', g0, 0.5, -136.1, 0.16, 0.95, 0.16);
    }
    railFrom = g1;
  }
  for (let x = -190; x <= promenadeEast - 20; x += 3.2) {
    const fx = x + decor() * 1.2;
    if (softFree(fx, -120.4, 0.6)) {
      box('#a58b6b', fx, 0.2, -120.4, 1.6, 0.3, 0.7, 0, false);
      flowers(fx, 0.38, -120.4, 6, 1.4, 0.5, Math.floor(fx * 10));
    }
  }
  box('#5f9f98', midX, -0.95, -171, spanX, 0.3, 67.6, 0, false, 'water');
  box('#4f8a84', midX, RIVER_BED - 0.1, -171, spanX, 0.2, 67.6, 0, false);
  box('#bbaf96', midX, -0.55, -205, spanX, 1.3, 1.4, 0, false);
  // The far bank is fenced off: a railing along the top of its wall.
  box('#c9c3b4', midX, 0.55, -204.6, spanX, 0.1, 0.12, 0, false);
  box('#c9c3b4', midX, 1.05, -204.6, spanX, 0.1, 0.12, 0, false);
  for (let x = LAND.minX - 60; x <= LAND.maxX + 60; x += 3) box('#b5ae9e', x, 0.6, -204.6, 0.14, 1.2, 0.14, 0, false);
  // Buoy lines across the river where the playable water ends (a swimmer or a boat turns back there).
  for (const bx of [RIVER.minX, RIVER.maxX]) {
    for (let z = RIVER.maxZ - 0.6; z > RIVER.minZ; z -= 2.6) {
      shape('ball', '#f07a2a', bx, -0.72, z, 0.45, 0.4, 0.45, 0, 0, false);
      shape('cylinder', '#f4f1e6', bx, -0.5, z, 0.2, 0.18, 0.2, 0, 0, false);
    }
    box('#e9e1cf', bx, -0.62, (RIVER.minZ + RIVER.maxZ) / 2, 0.06, 0.06, RIVER.maxZ - RIVER.minZ, 0, false);
  }
  // Docks: a timber pier on piles out over the water, steps down beside it, a gate with the dock's name and lamps.
  for (const dock of SCENERY.docks) {
    const { pier, steps } = dock;
    const px = (pier.minX + pier.maxX) / 2, pw = pier.maxX - pier.minX;
    const deckFrom = -136.4, deckTo = pier.minZ;
    box('#8a6a4c', px, PIER_DECK - 0.09, (deckFrom + deckTo) / 2, pw, 0.18, deckFrom - deckTo, 0, true);
    for (let z = deckFrom - 0.3; z > deckTo; z -= 0.6) box('#7a5c40', px, PIER_DECK + 0.005, z, pw - 0.1, 0.012, 0.06, 0, false);
    for (let z = deckFrom - 1.5; z > deckTo; z -= 3) for (const side of [-1, 1]) shape('cylinder', '#5a4330', px + side * (pw / 2 - 0.2), -1.4, z, 0.16, 3.4, 0.16, 0, 0, false);
    for (const side of [-1, 1]) {
      box('#6e5238', px + side * (pw / 2 - 0.05), PIER_DECK + 0.95, (deckFrom + deckTo) / 2 - 1, 0.08, 0.08, deckFrom - deckTo - 2.4, 0, false);
      for (let z = deckFrom - 0.6; z > deckTo + 2.4; z -= 2) box('#6e5238', px + side * (pw / 2 - 0.05), PIER_DECK + 0.5, z, 0.1, 0.95, 0.1, 0, false);
    }
    // Mooring posts and tyres along the open end.
    for (const side of [-1, 1]) shape('cylinder', '#3b3f42', px + side * (pw / 2 - 0.3), PIER_DECK + 0.3, deckTo + 0.4, 0.18, 0.6, 0.18, 0, 0, false);
    for (const side of [-1, 1]) shape('cylinder', '#1f2224', px + side * (pw / 2 + 0.1), PIER_DECK - 0.45, deckTo + 3, 0.35, 0.18, 0.35, 0, HALF_PI, false);
    // Stone steps down to the waterline.
    const sx = (steps.minX + steps.maxX) / 2, sw = steps.maxX - steps.minX;
    for (let k = 0; k < 9; k++) {
      const z0 = STEPS_TOP - k * 0.5, top = 0.1 - k * 0.5 * STEPS_DROP;
      box('#c2b59a', sx, (top - 2.9) / 2, z0 - 0.25, sw, top + 2.9, 0.5, 0, false);
    }
    for (const side of [-1, 1]) box('#d6c4a1', sx + side * (sw / 2 + 0.08), -0.4, -138.3, 0.12, 1.2, 4.4, 0, false);
    // The gate: two posts and a lintel with the dock's name.
    for (const side of [-1, 1]) box('#7a4a2e', px + side * (pw / 2 + 0.25), 1.6, -135.4, 0.3, 3.2, 0.3);
    box('#7a4a2e', px, 3.25, -135.4, pw + 1.2, 0.35, 0.4);
    // The đò is moored at An Hòa (buses.ts); Bạch Đằng only has the river bus.
    sign(dock.name, dock.rental ? 'CA NÔ • 30.000Đ / LƯỢT' : dock.x < 0 ? 'TÀU BUÝT SÔNG • ĐÒ NGANG' : 'TÀU BUÝT SÔNG', dock.rental ? '#1f5a8a' : '#8e2b20', px, 3.9, -135.2, Math.max(pw + 1.4, 6.2), 0.9, PI, '#f6efe0');
    for (const side of [-1, 1]) {
      shape('cylinder', '#2b2f33', px + side * (pw / 2 - 0.2), PIER_DECK + 1.3, deckTo + 1, 0.06, 2.6, 0.06, 0, 0, false);
      shape('ball', '#fff2c8', px + side * (pw / 2 - 0.2), PIER_DECK + 2.7, deckTo + 1, 0.22, 0.25, 0.22, 0, 0, false, 'lamp');
    }
    if (dock.rental) {
      // The rental kiosk at the head of the pier and a stack of life rings.
      box('#e8e2d0', px - pw / 2 - 2.6, 1.2, -132.4, 2.4, 2.4, 1.8);
      box('#1f5a8a', px - pw / 2 - 2.6, 2.55, -132.4, 2.8, 0.3, 2.2);
      shape('cylinder', '#f05a2a', px - pw / 2 - 1.1, 0.5, -134, 0.35, 0.1, 0.35, 0, HALF_PI, false);
    }
  }
  const farTrees = seeded(77);
  for (let i = 0; i < 64; i++) {
    const x = -300 + i * 13.3 + farTrees() * 6;
    const s = 0.9 + farTrees() * 0.5;
    const tz = -211 - farTrees() * 8, tint = farTrees();
    farTrees();
    const yaw = farTrees() * 3;
    shape('cylinder', '#7a5a48', x, 1.6 * s, tz, 0.25 * s, 3.2 * s, 0.25 * s, 0, 0, false);
    shape('puff', leaf('#4f8049', '#78a564', 0.35, tint), x, 4.5 * s, tz, 2.6 * s, 2.4 * s, 2.6 * s, yaw, 0, false);
    shape('puff', leaf('#4f8049', '#78a564', 0.95, tint), x + 0.8 * s, 5.9 * s, tz + 0.3 * s, 1.6 * s, 1.5 * s, 1.6 * s, yaw + 1, 0, false);
  }
  for (let i = 0; i < 40; i++) {
    const x = -260 + i * 21;
    const h = 14 + ((i * 13) % 30);
    const zz = -232 - (i % 3) * 12;
    box(i % 2 ? '#b9c4b6' : '#c6c6b5', x, h / 2, zz, 12 + (i % 4) * 2, h, 12, 0, false);
    for (let floor = 3; floor < h - 1; floor += 3.6) box('#a4b7af', x, floor, zz + 6.05, 9, 0.9, 0.08, 0, false, hash(x, floor) < 0.5 ? 'glassLit' : 'glass');
  }
  // The moored sampans are boats now (boats.ts), not scenery.
  const waves: { x: number; z: number; width: number }[] = [];
  for (let i = 0; i < 80; i++) waves.push({ x: -200 + ((i * 37) % (LAND.maxX + 260)), z: -141 - ((i * 11) % 60), width: 2 + (i % 4) * 1.4 });
  const waveGeometry = new THREE.PlaneGeometry(1, 0.14).rotateX(-HALF_PI);
  const waveMaterial = new THREE.MeshBasicMaterial({ color: '#b5d2b7', transparent: true, opacity: 0.32 });
  geometries.push(waveGeometry);
  materials.push(waveMaterial);
  const waveMesh = new THREE.InstancedMesh(waveGeometry, waveMaterial, waves.length);
  waveMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  waveMesh.frustumCulled = false;
  root.add(waveMesh);

  // ---- The fence round the land: a rendered wall with a tiled cap, and striped barriers where a road runs out. ----
  const fenceLines: { alongX: boolean; at: number; from: number; to: number; roads: number[] }[] = [
    { alongX: false, at: LAND.minX - 0.6, from: -136, to: LAND.maxZ + 0.6, roads: ROADS_Z },
    { alongX: false, at: LAND.maxX + 0.6, from: -136, to: LAND.maxZ + 0.6, roads: ROADS_Z },
    { alongX: true, at: LAND.maxZ + 0.6, from: LAND.minX - 0.6, to: LAND.maxX + 0.6, roads: ROADS_X },
  ];
  for (const line of fenceLines) {
    const put = (along: number, length: number, y: number, h: number, depth: number, color: string, role: 'solid' | 'lamp' = 'solid', shadow = true) =>
      line.alongX ? box(color, along, y, line.at, length, h, depth, 0, shadow, role) : box(color, line.at, y, along, depth, h, length, 0, shadow, role);
    let from = line.from;
    const cuts = line.roads.map((r) => [r - 7.2, r + 7.2]).filter(([a, b]) => b > line.from && a < line.to);
    for (const [a, b] of [...cuts, [line.to, line.to]]) {
      if (a > from) {
        put((from + a) / 2, a - from, 1.1, 2.2, 0.3, '#e6dccb');
        put((from + a) / 2, a - from + 0.1, 2.28, 0.16, 0.44, '#a5533a');
        for (let k = from; k <= a; k += 3.2) put(k, 0.4, 1.15, 2.3, 0.42, '#d2c5ae');
      }
      if (b > a && b !== line.to) {
        // A road barrier: red and white striped boards on posts, a no-entry sign and blinking lamps.
        const mid = (a + b) / 2;
        for (let k = -2; k < 2; k++) put(mid + (k + 0.5) * 3.4, 3.2, 0.95, 0.42, 0.14, k % 2 ? '#f4f1e6' : '#c8322a', 'solid', false);
        for (let k = -2; k < 2; k++) put(mid + (k + 0.5) * 3.4, 3.2, 0.45, 0.32, 0.14, k % 2 ? '#c8322a' : '#f4f1e6', 'solid', false);
        for (const k of [-6.8, -3.4, 0, 3.4, 6.8]) put(mid + k, 0.12, 0.6, 1.2, 0.12, '#3b3f42', 'solid', false);
        for (const k of [-5, 5]) put(mid + k, 0.22, 1.32, 0.18, 0.22, '#ffb43a', 'lamp', false);
        const sx = line.alongX ? mid + 4.6 : line.at, sz = line.alongX ? line.at : mid + 4.6;
        shape('cylinder', '#5f6a68', sx, 1.2, sz, 0.06, 2.4, 0.06, 0, 0, false);
        shape('cylinder', '#c8322a', sx, 2.6, sz, 0.45, 0.06, 0.45, 0, HALF_PI, false);
        const face = line.alongX ? PI : line.at < 0 ? HALF_PI : -HALF_PI;
        sign('ĐƯỜNG CẤM', 'HẾT KHU VỰC', '#c8322a', sx - Math.sin(face) * -0.1, 3.4, sz - Math.cos(face) * -0.1, 1.9, 0.48, face, '#f4f1e6');
      }
      from = Math.max(from, b);
    }
  }

  // ---- Edge scenery: a quieter ring of houses and trees beyond the fences. ----
  const edge = seeded(911);
  const BACKGROUND = ['#d8c7a8', '#c9d1c4', '#d9b9a3', '#c6cdd6', '#e0d4b8', '#bfcab5'];
  for (let gx = LAND.minX - 72; gx <= LAND.maxX + 40; gx += 17) {
    for (let gz = -134; gz <= LAND.maxZ + 72; gz += 17) {
      const x = gx + (edge() - 0.5) * 4, z = gz + (edge() - 0.5) * 4;
      if ((x > LAND.minX - 12 && x < LAND.maxX + 12 && z < LAND.maxZ + 12) || z < -112) continue;
      if (x > LAND.maxX + 12 && z < LAND.maxZ + 12) continue;
      if (ROADS_X.some((r) => Math.abs(x - r) < 17) || ROADS_Z.some((r) => Math.abs(z - r) < 17)) continue;
      if (edge() < 0.25) {
        const s = 1 + edge() * 0.5;
        const tint = edge(), yaw = edge() * 3;
        shape('cylinder', '#7a5a48', x, 1.8 * s, z, 0.25 * s, 3.6 * s, 0.25 * s, 0, 0, false);
        shape('puff', leaf('#4f8049', '#7aa766', 0.35, tint), x, 4.9 * s, z, 2.8 * s, 2.6 * s, 2.8 * s, yaw, 0, false);
        shape('puff', leaf('#4f8049', '#7aa766', 0.95, tint), x - 0.7 * s, 6.4 * s, z + 0.4 * s, 1.7 * s, 1.6 * s, 1.7 * s, yaw + 1, 0, false);
        continue;
      }
      const w = 9 + edge() * 5, d = 9 + edge() * 5, h = 7 + edge() * 15;
      box(pickOf(edge, BACKGROUND), x, h / 2, z, w, h, d, 0, false, 'wall');
      if (edge() < 0.4) shape('gable', '#a5533a', x, h + 0.8, z, w + 0.4, 1.6, d + 0.4, 0, 0, false, 'roofTile');
      else box('#d7cfbd', x, h + 0.2, z, w + 0.3, 0.4, d + 0.3, 0, false);
      const toward = Math.abs(x) > Math.abs(z) ? { x: -Math.sign(x), z: 0 } : { x: 0, z: -Math.sign(z) };
      for (let y = 2.4; y < h - 1; y += 3.3) {
        box('#7f9c98', x + toward.x * (w / 2 + 0.04), y, z + toward.z * (d / 2 + 0.04), toward.x ? 0.06 : w * 0.7, 1.1, toward.z ? 0.06 : d * 0.7, 0, false, hash(x, y, z) < 0.5 ? 'glassLit' : 'glass');
      }
    }
  }

  // ---- Rain puddles (shown only when wet). ----
  const puddleSpots: { x: number; z: number; s: number; yaw: number }[] = [];
  const pr = seeded(2026);
  for (let i = 0; i < 160; i++) {
    const horizontal = pr() < 0.5;
    const road = pickOf(pr, horizontal ? ROADS_Z : ROADS_X);
    const along = horizontal ? LAND.minX + 5 + pr() * (LAND.maxX - LAND.minX - 10) : ROAD_FIRST + 12 + pr() * (LAND.maxZ - ROAD_FIRST - 16);
    const offset = (pr() < 0.5 ? -1 : 1) * (4.2 + pr() * 2.4);
    if ((horizontal ? ROADS_X : ROADS_Z).some((r) => Math.abs(along - r) < 9)) continue;
    puddleSpots.push({ x: horizontal ? along : road + offset, z: horizontal ? road + offset : along, s: 1.2 + pr() * 2.4, yaw: pr() * PI });
  }
  const puddleGeometry = new THREE.CircleGeometry(0.5, 14).rotateX(-HALF_PI);
  const puddleMaterial = new THREE.MeshStandardMaterial({ color: '#4a5658', roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  geometries.push(puddleGeometry);
  materials.push(puddleMaterial);
  const puddles = new THREE.InstancedMesh(puddleGeometry, puddleMaterial, puddleSpots.length);
  puddleSpots.forEach((p, i) => {
    rotation.set(0, p.yaw, 0);
    matrix.compose(position.set(p.x, 0.072, p.z), quaternion.setFromEuler(rotation), scale.set(p.s, 1, p.s * (0.55 + hash(p.x, p.z) * 0.4)));
    puddles.setMatrixAt(i, matrix);
  });
  puddles.instanceMatrix.needsUpdate = true;
  puddles.computeBoundingSphere();
  puddles.visible = false;
  puddles.receiveShadow = true;
  root.add(puddles);

  // ---- Build the signs, then the instanced batches. ----
  const signMeshes = signs.build();
  root.add(...signMeshes.meshes);
  textures.push(...signMeshes.textures);
  materials.push(...signMeshes.materials);
  geometries.push(...signMeshes.geometries);
  for (const material of signMeshes.materials) glowMaterials.push({ material, strength: 1 });

  // Instances are bucketed into 160 m tiles so off-screen parts of the city are frustum-culled, where a batch has
  // enough vertices for culling to beat the extra draw calls (60k indices: 1,666 boxes, 625 cylinders, 555 puffs).
  const TILE = 160;
  for (const batch of batches.values()) {
    const count = batch.c.length / 3;
    const whole = count * (primitives[batch.kind].index?.count ?? primitives[batch.kind].attributes.position.count) < 60000;
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < count; i++) {
      const tx = batch.m[i * 16 + 12], tz = batch.m[i * 16 + 14];
      const key = whole || batch.big[i] ? 'all' : `${Math.floor((tx + 80) / TILE)}:${Math.floor((tz + 80) / TILE)}`;
      let list = buckets.get(key);
      if (!list) { list = []; buckets.set(key, list); }
      list.push(i);
    }
    for (const list of buckets.values()) {
      // Each mesh its own copy of the (tiny) primitive: three.js caches vertex array state per geometry and program, so
      // meshes sharing one geometry but not their instance buffers re-bind every attribute on every draw.
      const geometry = primitives[batch.kind].clone();
      geometries.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, roles[batch.role], list.length);
      mesh.name = `${batch.kind} ${batch.role}${batch.shadow ? ' shadow' : ''}${batch.fine ? ' fine' : ''}`;
      list.forEach((i, k) => {
        matrix.fromArray(batch.m, i * 16);
        mesh.setMatrixAt(k, matrix);
        mesh.setColorAt(k, tmpColor.setRGB(batch.c[i * 3], batch.c[i * 3 + 1], batch.c[i * 3 + 2]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = batch.shadow;
      mesh.receiveShadow = batch.role !== 'lamp';
      mesh.computeBoundingSphere();
      (batch.fine ? fineRoot : root).add(mesh);
    }
  }
  // Decals (grilles, railings, AC fronts, shutters, goods...) and cloth (flags, washing), base and fine layers.
  const decalTexture = decalAtlas();
  const decalMaterial = new THREE.MeshStandardMaterial({ map: decalTexture, alphaTest: 0.5, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  // What hangs inside a shop front lights up with it after dark (aGlow), the iron outside does not.
  const decalNight = { value: 0 };
  decalMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.decalNight = decalNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vDecalGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDecalGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float decalNight;\nvarying float vDecalGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vDecalGlow * decalNight;');
  };
  decalMaterial.customProgramCacheKey = () => 'street-decals';
  const clothTex = clothAtlas();
  const clothMat = clothMaterial(clothTex.texture, shaderTime);
  textures.push(decalTexture, clothTex.texture);
  materials.push(decalMaterial, clothMat);
  for (const [layer, quads] of [[root, decals.base], [fineRoot, decals.fine]] as const) {
    if (!quads.length) continue;
    const built = buildDecals(quads, decalMaterial, layer === root ? 'Decals' : 'Decals (fine)');
    layer.add(...built.meshes);
    geometries.push(...built.geometries);
  }
  const clothMeshes: THREE.InstancedMesh[] = [];
  for (const [layer, items] of [[root, cloths.base], [fineRoot, cloths.fine]] as const) {
    if (!items.length) continue;
    const built = buildCloth(items, clothMat, clothTex.cells, layer === root ? 'Flags' : 'Washing');
    layer.add(built.mesh);
    geometries.push(built.geometry);
    clothMeshes.push(built.mesh);
  }
  // Shop light pools on the pavement after dark, each switched by its shop's opening hours.
  const shopPoolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture, color: '#d9ecff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  materials.push(shopPoolMaterial);
  const shopPoolMesh = new THREE.InstancedMesh(poolGeometry, shopPoolMaterial, Math.max(1, shopPools.length));
  shopPoolMesh.name = 'Shop light';
  const placeShopPools = (hour: number | null) => {
    shopPools.forEach((sp, i) => {
      const hours = sp.shop >= 0 ? HOURS.get(sp.shop) : undefined;
      const lit = hour === null || !hours || isOpen(hours, hour);
      const size = lit ? sp.size : 0;
      shopPoolMesh.setMatrixAt(i, matrix.compose(position.set(sp.x, groundHeight(sp.x, sp.z) + 0.037, sp.z), quaternion.identity(), scale.set(size, 1, size)));
    });
    shopPoolMesh.instanceMatrix.needsUpdate = true;
  };
  placeShopPools(null);
  shopPoolMesh.count = shopPools.length;
  shopPoolMesh.computeBoundingSphere();
  shopPoolMesh.visible = false;
  shopPoolMesh.renderOrder = 2;
  root.add(shopPoolMesh);
  // Cutaway: when a building stands between the camera and the player, everything in front of the player
  // inside a soft circle around them on screen is discarded (dithered at the rim), so they stay visible.
  const cut = { center: { value: new THREE.Vector2() }, depth: { value: 0 }, radius: { value: 0 }, aspect: { value: 1 } };
  const uncut = new Set<THREE.Material>([roles.ground, roles.paving, poolMaterial, neonPoolMaterial, shopPoolMaterial, puddleMaterial, waveMaterial]);
  for (const material of materials) {
    if (uncut.has(material)) continue;
    const previous = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      Object.assign(shader.uniforms, { cutCenter: cut.center, cutDepth: cut.depth, cutRadius: cut.radius, cutAspect: cut.aspect });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vCutClip;\nvarying float vCutDepth;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCutClip = gl_Position;\nvCutDepth = -mvPosition.z;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vCutClip;\nvarying float vCutDepth;\nuniform vec2 cutCenter;\nuniform float cutDepth;\nuniform float cutRadius;\nuniform float cutAspect;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (cutRadius > 0.0 && vCutDepth < cutDepth) {
            float cutEdge = length((vCutClip.xy / vCutClip.w - cutCenter) * vec2(cutAspect, 1.0)) / cutRadius;
            float cutNoise = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (cutEdge < 1.0 && cutNoise > smoothstep(0.6, 1.0, cutEdge)) discard;
          }`);
    };
  }
  let cutStrength = 0;
  const focusPoint = new THREE.Vector3();
  // Cables and smoke are unlit shader materials (outside the cutaway): setAtmosphere dims them at night.
  const cableShared = cableUniforms();
  cableShared.time = shaderTime;
  const cableMeshes: THREE.Mesh[] = [];
  for (const [layer, list] of [[root, cables.base], [fineRoot, cables.fine]] as const) {
    if (!list.length) continue;
    const built = buildCables(list, cableShared);
    layer.add(built.mesh);
    materials.push(built.material);
    geometries.push(built.geometry);
    cableMeshes.push(built.mesh);
  }
  const smokeTime = { value: 0 };
  const smokeBuilt = buildSmoke(emitters, smokeTime);
  root.add(smokeBuilt.mesh);
  materials.push(smokeBuilt.material);
  geometries.push(smokeBuilt.geometry);
  let detail = 0;

  // Nothing in the neighbourhood moves, so skip per-frame matrix recomputation for the whole tree.
  root.traverse((object) => { object.updateMatrix(); object.matrixAutoUpdate = false; });
  root.updateMatrixWorld(true);

  const identity = new THREE.Quaternion();
  const groundBase = new THREE.Color('#ffffff');
  let lastNight = -1, lastWet = -1, poolHour = -1;

  // ---- Zombie mode: the power is out, everything is dusty, and the streets are full of debris. ----
  let apocalypse = false;
  let wreckage: THREE.Group | null = null;
  const fires: { x: number; z: number }[] = [];
  function buildWreckage() {
    const group = new THREE.Group();
    group.name = 'Apocalypse debris';
    const r = seeded(6660);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
    const decal = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -3 });
    materials.push(mat, decal);
    const kinds = {
      rubble: { geometry: new THREE.DodecahedronGeometry(1, 0), material: mat, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
      bag: { geometry: new THREE.CapsuleGeometry(0.17, 0.42, 3, 8).rotateZ(Math.PI / 2), material: mat, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
      trash: { geometry: new THREE.SphereGeometry(1, 7, 5), material: mat, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
      plank: { geometry: new THREE.BoxGeometry(1, 1, 1), material: mat, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
      barrel: { geometry: new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), material: mat, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
      stain: { geometry: new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), material: decal, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
      paper: { geometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material: decal, items: [] as THREE.Matrix4[], colors: [] as THREE.Color[] },
    };
    const put = (kind: keyof typeof kinds, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, hex: string, tilt = 0) => {
      kinds[kind].items.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0)), new THREE.Vector3(sx, sy, sz)));
      kinds[kind].colors.push(vary(hex, r()));
    };
    /** A random spot on a road or its sidewalks, clear of buildings. */
    const streetSpot = (margin: number) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const horizontal = r() < 0.5;
        const list = horizontal ? ROADS_Z : ROADS_X;
        const road = list[Math.floor(r() * list.length)];
        const across = (r() * 2 - 1) * 12;
        const along = horizontal ? LAND.minX + 6 + r() * (LAND.maxX - LAND.minX - 12) : ROAD_FIRST - 12 + r() * (LAND.maxZ - ROAD_FIRST + 6);
        const [x, z] = horizontal ? [along, road + across] : [road + across, along];
        if (z < ROAD_FIRST - 12 || !inRect(LAND, x, z, 2) || !pointClear(x, z, margin)) continue;
        return { x, z, y: groundHeight(x, z) };
      }
      return null;
    };
    for (let i = 0; i < 260; i++) {
      const p = streetSpot(0.6);
      if (!p) continue;
      // Rubble piles: a few broken chunks heaped together.
      const n = 1 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const s = 0.12 + r() * 0.35;
        put('rubble', p.x + (r() - 0.5) * 1.2, p.y + s * 0.3, p.z + (r() - 0.5) * 1.2, s * (1 + r()), s * 0.6, s * (1 + r() * 0.6), r() * PI, r() < 0.5 ? '#8f877a' : '#6f675c', r());
      }
    }
    for (let i = 0; i < 150; i++) {
      const p = streetSpot(0.5);
      if (p) put('trash', p.x, p.y + 0.22, p.z, 0.34 + r() * 0.12, 0.28, 0.32, r() * PI, r() < 0.7 ? '#1f2224' : '#2f3a2c');
    }
    for (let i = 0; i < 140; i++) {
      const p = streetSpot(0.3);
      if (p) put('stain', p.x, p.y + 0.012, p.z, 0.4 + r() * 1.1, 1, 0.3 + r() * 0.8, r() * PI, r() < 0.75 ? '#4a1510' : '#2a221e');
    }
    for (let i = 0; i < 280; i++) {
      const p = streetSpot(0.2);
      if (p) put('paper', p.x, p.y + 0.014, p.z, 0.25 + r() * 0.2, 1, 0.3 + r() * 0.2, r() * PI, r() < 0.6 ? '#d9d4c4' : '#b9b09a');
    }
    // Sandbag walls and plank barriers across the roads near some junctions, with a burning barrel.
    for (const cx of ROADS_X) for (const cz of ROADS_Z) {
      if (r() < 0.55) continue;
      const alongX = r() < 0.5, side = r() < 0.5 ? -1 : 1;
      const at = (u: number, v: number) => (alongX ? { x: cx + side * 13 + v, z: cz + u } : { x: cx + u, z: cz + side * 13 + v });
      const start = -5 + r() * 2, length = 4 + Math.floor(r() * 4);
      for (let k = 0; k < length; k++) for (let row = 0; row < 2; row++) {
        const p = at(start + k * 0.62 + row * 0.31, 0);
        if (!pointClear(p.x, p.z, 0.3)) continue;
        put('bag', p.x, groundHeight(p.x, p.z) + 0.17 + row * 0.3, p.z, 1, 1, 1, alongX ? 0 : PI / 2, '#b3a07a');
      }
      for (const u of [2.5, 5.2]) {
        const p = at(u, 0.4);
        if (!pointClear(p.x, p.z, 0.4)) continue;
        const y = groundHeight(p.x, p.z);
        for (const leg of [-0.7, 0.7]) put('plank', p.x + (alongX ? 0 : leg), y + 0.45, p.z + (alongX ? leg : 0), 0.08, 0.9, 0.08, 0, '#5a4330');
        put('plank', p.x, y + 0.82, p.z, alongX ? 0.06 : 1.8, 0.16, alongX ? 1.8 : 0.06, 0, r() < 0.5 ? '#c9b24a' : '#8a6a46');
      }
      const b = at(start - 1.2, 1.2);
      if (pointClear(b.x, b.z, 0.5)) {
        put('barrel', b.x, groundHeight(b.x, b.z) + 0.45, b.z, 1, 1, 1, 0, '#7a4a2e');
        fires.push({ x: b.x, z: b.z });
      }
    }
    for (const kind of Object.values(kinds)) {
      if (!kind.items.length) continue;
      const mesh = new THREE.InstancedMesh(kind.geometry, kind.material, kind.items.length);
      kind.items.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, kind.colors[i]); });
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      geometries.push(kind.geometry);
    }
    group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    group.updateMatrixWorld(true);
    root.add(group);
    return group;
  }
  const sky = new THREE.Color('#bcd2dc');
  const api = {
    colliders,
    /** Seats and tables a ragdoll can land on (not obstacles for walking, shooting or the camera). */
    seats,
    update(time: number) {
      skyline.update(time);
      updateSignals(time);
      // Flags, washing, cables and LEDs move in their shaders; the lowest levels hold them still.
      const t = time % 3600;
      if (detail < 4) shaderTime.value = t;
      smokeTime.value = t;
      waves.forEach((wave, i) => {
        matrix.compose(position.set(wave.x + Math.sin(time * 0.3 + i) * 0.6, -0.78, wave.z), identity, scale.set(wave.width, 1, 1));
        waveMesh.setMatrixAt(i, matrix);
      });
      waveMesh.instanceMatrix.needsUpdate = true;
    },
    /**
     * Opens the cutaway around (x, y, z) while a building blocks the camera's view of it; call after the
     * camera has moved this frame. `enabled` false closes it.
     */
    focus(camera: THREE.PerspectiveCamera, x: number, y: number, z: number, dt: number, enabled = true) {
      const { x: cx, y: cy, z: cz } = camera.position;
      let hidden = false;
      if (enabled) for (const p of PLOTS) if (segmentHitsBlock(cx, cy, cz, x, y, z, p.full, p.h + 3.8)) { hidden = true; break; }
      cutStrength += ((hidden ? 1 : 0) - cutStrength) * (1 - Math.exp(-dt * 8));
      if (cutStrength < 0.01) { cut.radius.value = 0; return; }
      const depth = -focusPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z;
      focusPoint.set(x, y, z).project(camera);
      cut.center.value.set(focusPoint.x, focusPoint.y);
      cut.depth.value = depth - 1.2;
      cut.aspect.value = camera.aspect;
      cut.radius.value = (CUT_RADIUS * cutStrength) / Math.max(1, depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
    /**
     * Zombie mode on or off: power cut, dust over everything, debris and fire barrels in the streets. `debris` false
     * leaves the legacy street debris and its barrels out (apocalypse.ts draws the ruins and their fires instead).
     */
    setApocalypse(on: boolean, debris = true) {
      apocalypse = on;
      if (on && debris && !wreckage) wreckage = buildWreckage();
      if (wreckage) wreckage.visible = on && debris;
      roles.solid.color.set(on ? '#b9af9d' : '#ffffff');
      roles.glass.color.set(on ? '#8c8b86' : '#ffffff');
      roles.glassLit.color.set(on ? '#8c8b86' : '#ffffff');
      for (const role of [roles.wall, roles.tiles, roles.roofTile] as const) role.color.set(on ? '#b9af9d' : '#ffffff');
      groundBase.set(on ? '#aaa395' : '#ffffff');
      smokeBuilt.mesh.visible = !on && detail <= 2;
      lastNight = -1;
    },
    /**
     * Quality level (game.ts applyLevel, 0 best .. 5): the fine layer (washing, antennas, service drops, stickers) and
     * shop light pools show up to level 3, smoke up to 2; from level 4 flags, cables and LEDs hold still and walls,
     * paving and roofs drop their painted patterns for plain colours; the last level hides the cables too.
     */
    setDetail(level: number) {
      detail = level;
      fineRoot.visible = level <= 3;
      const flat = level >= 4;
      if ((surfaceDetail.value < 0.5) !== flat) {
        surfaceDetail.value = flat ? 0 : 1;
        for (const m of [roles.wall, roles.paving, roles.tiles, roles.roofTile]) m.needsUpdate = true;
      }
      smokeBuilt.mesh.visible = level <= 2 && !apocalypse;
      cableShared.sway.value = level >= 4 ? 0 : 1;
      for (const mesh of cableMeshes) if (mesh.parent === root) mesh.visible = level <= 4;
      lastNight = -1;
    },
    /** Burning barrels of zombie mode (empty in the normal city). */
    get fires() { return apocalypse && wreckage?.visible ? fires : []; },
    /** `night` 0..1 lights windows, lamps, signs and light pools; `wet` 0..1 darkens and glosses the paving. */
    setAtmosphere(a: { night: number; wet: number; sky?: THREE.Color; hours?: number }) {
      if (a.sky) sky.copy(a.sky);
      const night = Math.min(1, Math.max(0, a.night || 0));
      const wet = Math.min(1, Math.max(0, a.wet || 0));
      // Shop light pools follow their shops' hours when the clock is given (a closed shop's shutter is down).
      if (a.hours !== undefined) {
        const hour = Math.floor(a.hours * 4) / 4;
        if (hour !== poolHour) { poolHour = hour; placeShopPools(hour); }
      }
      if (Math.abs(night - lastNight) < 0.004 && Math.abs(wet - lastWet) < 0.004) return;
      lastNight = night;
      lastWet = wet;
      // No electricity in zombie mode: dark windows, lamps and signs.
      const power = apocalypse ? 0 : 1;
      roles.glass.emissiveIntensity = night * 0.28 * power;
      roles.glassLit.emissiveIntensity = night * 1.25 * power;
      roles.lamp.emissiveIntensity = night * 2.6 * power;
      roles.lantern.emissiveIntensity = night * 1.1 * power;
      for (const g of glowMaterials) g.material.emissiveIntensity = night * g.strength * power;
      poolMaterial.opacity = night * 0.5;
      pools.visible = night > 0.02 && !apocalypse;
      roles.neon.emissiveIntensity = (0.45 + night * 1.9) * (apocalypse ? 0.03 : 1);
      neonPoolMaterial.opacity = night * 0.75;
      neonPoolMesh.visible = night > 0.02 && !apocalypse;
      skyline.setAtmosphere(night, power, sky);
      roles.ground.color.copy(groundBase).multiplyScalar(1 - 0.38 * wet);
      roles.ground.roughness = 0.9 - 0.62 * wet;
      roles.ground.metalness = 0.12 * wet;
      puddleMaterial.opacity = wet * 0.6;
      puddles.visible = wet > 0.02;
      // Shop tubes and LED borders, the pools of shop light, and the unlit cables and smoke dimmed at night.
      roles.tube.emissiveIntensity = (0.1 + night * 2.2) * power;
      roles.led.emissiveIntensity = (0.25 + night * 1.8) * power;
      shopPoolMaterial.opacity = night * 0.45;
      decalNight.value = night * 0.75 * power;
      shopPoolMesh.visible = night > 0.02 && !apocalypse && detail <= 3;
      cableShared.shade.value = 1 - 0.78 * night;
      smokeBuilt.light.value = 1 - 0.55 * night;
      // Rain darkens and glosses the paving, the roof decks and tiles, and soaks the walls a little.
      roles.paving.color.copy(groundBase).multiplyScalar(1 - 0.3 * wet);
      roles.paving.roughness = 0.88 - 0.6 * wet;
      roles.tiles.roughness = 0.88 - 0.6 * wet;
      roles.roofTile.roughness = 0.8 - 0.5 * wet;
      roles.wall.color.set(apocalypse ? '#b9af9d' : '#ffffff').multiplyScalar(1 - 0.12 * wet);
    },
    dispose() {
      scene.remove(root);
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      root.clear();
    },
  };
  // Until game.ts passes its quality level (applyLevel -> setDetail), start at the level it will start at.
  api.setDetail(startDetail());
  root.userData.build = { ms: Math.round(performance.now() - buildStart), decals: decals.base.length + decals.fine.length, cloth: cloths.base.length + cloths.fine.length, cables: cables.base.length + cables.fine.length, smoke: emitters.length, pools: shopPools.length };
  return api;
}

/** The quality level game.ts starts at: the saved preset, else what the GPU suggests (quality.ts). */
function startDetail() {
  try {
    const saved = localStorage.getItem('pvo-quality');
    if (saved === 'high' || saved === 'medium' || saved === 'low') return MODE_LEVEL[saved];
  } catch { /* no storage: guess from the GPU */ }
  return detectStartLevel();
}
