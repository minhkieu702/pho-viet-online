import * as THREE from 'three';
import { BUILDINGS, COLLIDERS, LAMPS, PLOTS, ROADS, SCENERY, pathClearance, type Building, type Plot, type Prop, type Rect, type Tree } from './city';

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Sidewalks stand this much above the carriageway, behind a stone curb. */
export const CURB_HEIGHT = 0.14;
const ASPHALT_HALF = 7; // carriageway half-width
const SIDEWALK_EDGE = 12.5; // the paved sidewalk runs from the curb to the house fronts
const ROAD_SPACING = ROADS[1] - ROADS[0];
const ROAD_FIRST = ROADS[0];
const ROAD_LAST = ROADS[ROADS.length - 1];
/** Distance from a coordinate to the nearest road centre line on that axis. */
const roadDistance = (v: number) => Math.abs(v - Math.min(ROAD_LAST, Math.max(ROAD_FIRST, ROAD_FIRST + Math.round((v - ROAD_FIRST) / ROAD_SPACING) * ROAD_SPACING)));

/** Whether a point is on a raised sidewalk (crossings over the carriageway stay at road level). */
export function onSidewalk(x: number, z: number) {
  const dz = roadDistance(z);
  // North-south roads start at the riverside road, so south of it only the riverside sidewalk exists.
  const dx = z > ROAD_FIRST ? roadDistance(x) : Infinity;
  if (dz < ASPHALT_HALF || dx < ASPHALT_HALF) return false;
  return dz < SIDEWALK_EDGE || dx < SIDEWALK_EDGE;
}

/** Walkable surface height: sidewalks, the park lawn and the tiled square sit above the street. */
export function groundHeight(x: number, z: number) {
  if (x > 13 && x < 43 && z > -44 && z < -22) return 0.24;
  if (x > 14.5 && x < 43.5 && z > 29.5 && z < 46.5) return 0.27;
  return onSidewalk(x, z) ? 0.1 + CURB_HEIGHT : 0.1;
}

type Kind = 'box' | 'cylinder' | 'cone' | 'ball' | 'bead' | 'gable' | 'hip' | 'pyramid' | 'puff' | 'trunk' | 'frond';
/** Material families: each is one shared material, so colour variety costs no extra draw calls. */
type Role = 'solid' | 'ground' | 'glass' | 'glassLit' | 'lamp' | 'lantern' | 'water';
type ColorLike = string | THREE.Color;
type Quad = { cell: number; x: number; y: number; z: number; w: number; h: number; yaw: number };

const PI = Math.PI;
const HALF_PI = PI / 2;
const AWNINGS = ['#cf795d', '#5e927c', '#d9a441', '#4f7fa8', '#b8574f', '#7d9a52'];
const DOORS = ['#7a5a3f', '#5d7f86', '#8a6b4a', '#6c7a5a', '#4f6577', '#9b5b46'];
const SHUTTERS = ['#5f8f7a', '#7aa0b8', '#b0774f', '#6f8f5a', '#4f7a8a'];
const FLOWERS = ['#ef8fb0', '#e5484d', '#f5c84a', '#f4f1e8', '#a07cc5', '#f08c3a', '#ff6f91'];
const LEAVES = ['#689b6b', '#87b477', '#4f875c', '#5e9a5a', '#76a86a'];

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
  const root = new THREE.Group();
  root.name = 'Pho Viet neighbourhood';
  scene.add(root);
  const colliders: Collider[] = COLLIDERS.map((c) => ({ ...c }));
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
  };
  materials.push(...Object.values(roles));

  const batches = new Map<string, { kind: Kind; role: Role; shadow: boolean; m: number[]; c: number[]; big: boolean[] }>();
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
  const onPavement = (x: number, z: number) => (onSidewalk(x, z) ? CURB_HEIGHT : 0);
  function shape(kind: Kind, color: ColorLike, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tilt = 0, shadow = true, role: Role = 'solid') {
    const key = `${kind}|${role}|${shadow ? 1 : 0}`;
    let batch = batches.get(key);
    if (!batch) { batch = { kind, role, shadow, m: [], c: [], big: [] }; batches.set(key, batch); }
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
  /** Local frame of a building or prop: lx along its front, lz towards its front. */
  function frame(x: number, z: number, facing: number) {
    const c = Math.cos(facing), s = Math.sin(facing);
    return {
      at: (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }),
      local: (wx: number, wz: number) => ({ x: (wx - x) * c - (wz - z) * s, z: (wx - x) * s + (wz - z) * c }),
      part: (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: ColorLike, role: Role = 'solid', shadow = true) =>
        box(color, x + lx * c + lz * s, ly, z - lx * s + lz * c, w, h, d, facing, shadow, role),
      solid: (kind: Kind, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: ColorLike, tilt = 0, shadow = true, yaw = 0) =>
        shape(kind, color, x + lx * c + lz * s, ly, z - lx * s + lz * c, sx, sy, sz, facing + yaw, tilt, shadow),
    };
  }
  const glassRole = (x: number, y: number, z: number): Role => (hash(x, y, z) < 0.55 ? 'glassLit' : 'glass');
  function flowers(x: number, y: number, z: number, count: number, spreadX: number, spreadZ: number, seed: number) {
    const r = seeded(seed * 7919 + 13);
    for (let i = 0; i < count; i++) {
      shape('bead', pickOf(r, FLOWERS), x + (r() - 0.5) * spreadX, y + r() * 0.12, z + (r() - 0.5) * spreadZ, 0.13 + r() * 0.06, 0.11, 0.13 + r() * 0.06, 0, 0, false);
    }
  }

  // ---- Canvas signs and number plates, packed into texture atlases and drawn as merged quads. ----
  const signCells: { text: string; subtitle: string; color: string; background: string }[] = [];
  const signKeys = new Map<string, number>();
  const signQuads: Quad[] = [];
  function sign(text: string, subtitle: string, color: string, x: number, y: number, z: number, w: number, h: number, yaw = 0, background = '#f3e4c7') {
    const key = `${text}|${subtitle}|${color}|${background}`;
    let cell = signKeys.get(key);
    if (cell === undefined) { cell = signCells.length; signCells.push({ text, subtitle, color, background }); signKeys.set(key, cell); }
    signQuads.push({ cell, x, y, z, w, h, yaw });
  }
  const plateCells: number[] = [];
  const plateKeys = new Map<number, number>();
  const plateQuads: Quad[] = [];
  function plate(n: number, x: number, y: number, z: number, yaw: number) {
    let cell = plateKeys.get(n);
    if (cell === undefined) { cell = plateCells.length; plateCells.push(n); plateKeys.set(n, cell); }
    plateQuads.push({ cell, x, y, z, w: 0.5, h: 0.25, yaw });
  }
  const glowMaterials: { material: THREE.MeshStandardMaterial; strength: number }[] = [];
  function buildAtlas(count: number, cellW: number, cellH: number, pageW: number, pageH: number, quads: Quad[], draw: (ctx: CanvasRenderingContext2D, index: number) => void, glow: number, doubleSide: boolean) {
    const cols = pageW / cellW, perPage = cols * (pageH / cellH);
    for (let first = 0; first < count; first += perPage) {
      const n = Math.min(perPage, count - first);
      let height = cellH;
      while (height < Math.ceil(n / cols) * cellH) height *= 2;
      const canvas = document.createElement('canvas');
      canvas.width = pageW;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      for (let k = 0; k < n; k++) {
        ctx.save();
        ctx.translate((k % cols) * cellW, Math.floor(k / cols) * cellH);
        draw(ctx, first + k);
        ctx.restore();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      textures.push(texture);
      const list = quads.filter((q) => q.cell >= first && q.cell < first + n);
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], index: number[] = [];
      for (const q of list) {
        const k = q.cell - first;
        const u0 = ((k % cols) * cellW) / pageW, u1 = u0 + cellW / pageW;
        const v1 = 1 - (Math.floor(k / cols) * cellH) / height, v0 = v1 - cellH / height;
        const c = Math.cos(q.yaw), s = Math.sin(q.yaw);
        const base = positions.length / 3;
        for (const [lx, ly, u, v] of [[-q.w / 2, q.h / 2, u0, v1], [q.w / 2, q.h / 2, u1, v1], [-q.w / 2, -q.h / 2, u0, v0], [q.w / 2, -q.h / 2, u1, v0]]) {
          positions.push(q.x + lx * c, q.y + ly, q.z - lx * s);
          normals.push(s, 0, c);
          uvs.push(u, v);
        }
        index.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.95, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
      geometries.push(geometry);
      materials.push(material);
      glowMaterials.push({ material, strength: glow });
      root.add(new THREE.Mesh(geometry, material));
    }
  }

  // ---- Small furniture shared by many places. ----
  function bench(x: number, z: number, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const part = (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: string) => box(color, x + lx * c + lz * s, ly, z - lx * s + lz * c, w, h, d, yaw);
    part(0, 0.7, 0, 2.7, 0.22, 0.8, '#b58255');
    part(0, 1.3, -0.35, 2.7, 0.85, 0.15, '#b58255');
    part(-1, 0.35, 0, 0.12, 0.7, 0.65, '#51645d');
    part(1, 0.35, 0, 0.12, 0.7, 0.65, '#51645d');
  }
  function stool(x: number, z: number, color = '#cf6251') {
    box(color, x, 0.5, z, 0.65, 0.16, 0.65);
    for (const dx of [-0.23, 0.23]) for (const dz of [-0.23, 0.23]) box(color, x + dx, 0.24, z + dz, 0.1, 0.48, 0.1);
  }
  function table(x: number, z: number) {
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
    if (street && t.species !== 'palm' && t.species !== 'bamboo') streetPit(t);
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
    const { part, at } = frame(x, z, facing);
    const g = localRect(p.ground, x, z, facing);
    const AH = 3.2;
    const cuts = { front: g.z1 < front - 0.05, back: g.z0 > -front + 0.05, left: g.x0 > -w / 2 + 0.05, right: g.x1 < w / 2 - 0.05 };
    const cut = cuts.front || cuts.back || cuts.left || cuts.right;
    const gw = g.x1 - g.x0, gd = g.z1 - g.z0, gx = (g.x0 + g.x1) / 2, gz = (g.z0 + g.z1) / 2;
    if (!cut) part(0, h / 2, 0, w, h, d, color);
    else {
      part(gx, AH / 2, gz, gw, AH, gd, color);
      part(0, AH + (h - AH) / 2, 0, w, h - AH, d, color);
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
    for (let floor = 5.2; floor < h - 0.8; floor += 3.2) {
      for (const dx of [-w * 0.24, w * 0.24]) {
        const wp = at(dx, front);
        part(dx, floor, front + 0.1, w * 0.29, 2.3, 0.15, '#e8ddc4');
        part(dx, floor, front + 0.2, w * 0.24, 1.95, 0.12, '#527a73', glassRole(wp.x, floor, wp.z), false);
        part(dx, floor, front + 0.29, 0.08, 2, 0.1, '#d4c9ae');
        part(dx, floor, front + 0.29, w * 0.24, 0.08, 0.1, '#d4c9ae');
      }
      if (index % 3 !== 1) {
        part(0, floor - 1.2, front + 0.55, w - 0.9, 0.18, 1.5, '#e7d9bd');
        part(0, floor - 0.5, front + 1.2, w - 1.05, 0.08, 0.08, '#516e62');
        for (let k = -w / 2 + 0.75; k < w / 2 - 0.5; k += 0.6) part(k, floor - 0.85, front + 1.2, 0.055, 0.7, 0.055, '#516e62');
        part(w * 0.25, floor - 0.95, front + 0.75, 0.55, 0.4, 0.5, '#bd7956');
        shape('ball', '#659671', x + w * 0.25 * c + (front + 0.75) * s, floor - 0.55, z - w * 0.25 * s + (front + 0.75) * c, 0.45, 0.5, 0.45);
        const fb = at(-w * 0.22, front + 1.0);
        part(-w * 0.22, floor - 0.98, front + 1.0, 1.2, 0.3, 0.3, '#a8664a');
        flowers(fb.x, floor - 0.78, fb.z, 5, 1.0, 0.25, index * 31 + floor);
      }
    }
    const sy = Math.min(h - 0.65, 3.8);
    part(0, sy, front + 0.23, w - 0.45, 1.25, 0.22, '#e7d9bd');
    sign(b.name, b.subtitle, p.signColor, x + (front + 0.36) * s, sy, z + (front + 0.36) * c, w - 0.65, 1.1, facing);
    if (!cuts.front) {
      // Segmented striped shop canopy.
      for (let aw = 0; aw < 8; aw++) {
        const stripe = aw % 2 ? '#f3e6ca' : index % 2 ? '#5e927c' : '#cf795d';
        part(-w / 2 + 0.35 + (aw + 0.5) * (w - 0.7) / 8, 2.98, front + 1.2, (w - 0.7) / 8, 0.16, 2, stripe);
        part(-w / 2 + 0.35 + (aw + 0.5) * (w - 0.7) / 8, 2.78, front + 2.12, (w - 0.7) / 8, 0.35, 0.1, stripe);
      }
    }
    if (index % 2 === 0) {
      shape('cylinder', '#a8bcb9', x - w * 0.22, h + 0.95, z - 1, 0.85, 1.5, 0.85);
      box('#758e86', x - w * 0.22, h + 0.24, z - 1, 2, 0.16, 2);
      part(w * 0.23, h + 0.45, -1, 2.2, 0.4, 1.4, '#c5b99f');
    }
    // A door on another side (the post office opens onto the post-office road).
    if (Math.abs(Math.sin(b.facing - facing)) > 0.5) {
      const e = { x: Math.round(Math.sin(b.facing)), z: Math.round(Math.cos(b.facing)) };
      const wallX = e.x < 0 ? p.ground.minX : e.x > 0 ? p.ground.maxX : b.door.x;
      const wallZ = e.z < 0 ? p.ground.minZ : e.z > 0 ? p.ground.maxZ : b.door.z;
      const side = frame(e.x ? wallX : b.door.x, e.z ? wallZ : b.door.z, b.facing);
      side.part(0, 1.6, 0.04, 3.4, 3.0, 0.12, '#365d57');
      side.part(-0.8, 1.4, 0.1, 1.4, 2.5, 0.06, '#527a73', 'glassLit', false);
      side.part(0.8, 1.4, 0.1, 1.4, 2.5, 0.06, '#527a73', 'glassLit', false);
      const fx = e.x < 0 ? p.full.minX : e.x > 0 ? p.full.maxX : b.door.x;
      const fz = e.z < 0 ? p.full.minZ : e.z > 0 ? p.full.maxZ : b.door.z;
      const signAt = frame(e.x ? fx : x, e.z ? fz : z, b.facing);
      const pos = signAt.at(0, 0.36);
      signAt.part(0, sy, 0.23, Math.min(b.w, 9.4), 1.25, 0.22, '#e7d9bd');
      sign(b.name, b.subtitle, p.signColor, pos.x, sy, pos.z, Math.min(b.w, 9.4) - 0.3, 1.1, b.facing);
    }
  }

  /** A narrow Vietnamese tube house: home, shop or street-food front, with balconies, plants and a roof garden or tank. */
  function newHouse(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const r = seeded(p.seed);
    const { part, at, local, solid } = frame(x, z, p.facing);
    const trim = pickOf(r, ['#efe5cf', '#f4ecdc', '#e2d6bd', '#fbf6ea']);
    const wall = vary(b.color, r(), 0.6);
    part(0, h / 2, 0, w, h, d, wall);
    part(0, 0.25, 0, w + 0.1, 0.5, d + 0.08, '#cdbda4');
    for (const side of [-1, 1]) part(side * (w / 2 - 0.1), h / 2 + 0.1, front + 0.05, 0.22, h - 0.2, 0.14, trim);
    const doorX = THREE.MathUtils.clamp(local(b.door.x, b.door.z).x, -w / 2 + 1, w / 2 - 1);
    const shopFront = p.style === 'shop' || b.kind === 'food';
    if (shopFront) {
      part(0, 1.75, front + 0.03, w - 0.7, 3.2, 0.1, '#3f5853');
      part(0, 1.3, front + 0.08, w - 1.1, 2.2, 0.05, '#2b3533');
      part(0, 2.85, front + 0.1, w - 1.0, 0.9, 0.06, pickOf(r, ['#9fb7ae', '#b9c2c4', '#a7b9c9']));
      part(-w * 0.22, 0.55, front + 0.3, w * 0.34, 0.95, 0.55, '#d9c9a8');
      const awning = pickOf(r, AWNINGS);
      for (let k = 0; k < 6; k++) {
        const ax = -w / 2 + 0.35 + (k + 0.5) * (w - 0.7) / 6;
        part(ax, 3.05, front + 0.9, (w - 0.7) / 6, 0.14, 1.6, k % 2 ? '#f3e6ca' : awning);
        part(ax, 2.88, front + 1.68, (w - 0.7) / 6, 0.3, 0.08, k % 2 ? '#f3e6ca' : awning);
      }
      if (p.sign) {
        const pos = at(0, front + 0.25);
        part(0, 3.95, front + 0.12, w - 0.4, 1.2, 0.2, '#e7d9bd');
        sign(b.name, b.subtitle, p.signColor, pos.x, 3.95, pos.z, w - 0.6, 1.0, p.facing);
      }
    } else {
      part(doorX, 1.4, front + 0.04, 1.8, 2.8, 0.1, '#46524f');
      part(doorX, 1.35, front + 0.09, 1.5, 2.6, 0.05, pickOf(r, DOORS));
      part(doorX, 0.14, front + 0.45, 2.0, 0.18, 0.8, '#cbbfae');
      part(doorX, 3.0, front + 0.55, 2.3, 0.1, 1.1, trim);
      const wx = doorX > 0 ? doorX - 2.4 : doorX + 2.4;
      if (Math.abs(wx) < w / 2 - 0.9) {
        const wp = at(wx, front);
        part(wx, 1.7, front + 0.05, 1.7, 1.5, 0.1, trim);
        part(wx, 1.7, front + 0.09, 1.4, 1.2, 0.05, '#4f6f6c', glassRole(wp.x, 1.7, wp.z), false);
        for (let k = -0.5; k <= 0.51; k += 0.25) part(wx + k, 1.7, front + 0.13, 0.04, 1.2, 0.04, '#3d4a48');
      }
    }
    if (p.number > 0) {
      const lx = doorX + (doorX > 0 ? -1.25 : 1.25);
      const pos = at(lx, front + 0.08);
      plate(p.number, pos.x, 2.25, pos.z, p.facing);
    }
    part(0, 3.42, front + 0.07, w, 0.16, 0.14, trim);
    const floors = Math.max(2, Math.round((h - 0.6) / 3.2));
    const shutter = pickOf(r, SHUTTERS);
    for (let k = 1; k < floors; k++) {
      const base = k * 3.2 + 0.2;
      const balcony = r() < 0.55;
      if (balcony) {
        part(0, base + 0.05, front + 0.55, w - 0.3, 0.16, 1.1, trim);
        if (r() < 0.5) part(0, base + 0.55, front + 1.07, w - 0.4, 0.85, 0.06, pickOf(r, ['#e9e1cc', '#d7e3df', '#efd9c4']));
        else for (let bx = -w / 2 + 0.35; bx <= w / 2 - 0.3; bx += 0.55) part(bx, base + 0.55, front + 1.07, 0.05, 0.9, 0.05, '#4f5d5a');
        part(0, base + 1.02, front + 1.07, w - 0.35, 0.07, 0.09, '#4f5d5a');
        const gp = at(0, front);
        part(0, base + 1.25, front + 0.05, Math.min(2.2, w * 0.4), 2.2, 0.08, '#4f6f6c', glassRole(gp.x, base, gp.z), false);
        const fb = at(w * 0.28, front + 0.95);
        part(w * 0.28, base + 0.32, front + 0.95, 1.3, 0.3, 0.32, '#a8664a');
        flowers(fb.x, base + 0.52, fb.z, 6, 1.1, 0.25, p.seed + k);
        if (r() < 0.5) pot(at(-w * 0.32, front + 0.75).x, at(-w * 0.32, front + 0.75).z, base + 0.13, 0.9, p.seed + k * 7);
      } else {
        const count = w > 7.5 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const lx = count === 1 ? 0 : (i ? 1 : -1) * w * 0.24;
          const wp = at(lx, front);
          part(lx, base + 1.5, front + 0.05, 1.5, 1.9, 0.1, trim);
          part(lx, base + 1.5, front + 0.09, 1.2, 1.6, 0.05, '#4f6f6c', glassRole(wp.x, base, wp.z), false);
          for (const sd of [-1, 1]) part(lx + sd * 0.92, base + 1.5, front + 0.12, 0.42, 1.6, 0.05, shutter);
          part(lx, base + 0.5, front + 0.3, 1.3, 0.22, 0.42, '#a8664a');
          const fb = at(lx, front + 0.3);
          flowers(fb.x, base + 0.68, fb.z, 4, 1.0, 0.2, p.seed + k * 3 + i);
        }
      }
      if (r() < 0.35) part((r() < 0.5 ? -1 : 1) * (w / 2 - 0.75), base + 2.45, front + 0.22, 0.8, 0.55, 0.36, '#e3e4df');
      part(0, base + 3.2 - 0.02, front + 0.07, w, 0.12, 0.12, trim);
    }
    // Roof: tiled gable, water tank with solar heater, or a little roof garden.
    const roof = r();
    if (roof < 0.32) {
      solid('gable', 0, h + 0.85, 0, w + 0.5, 1.7, d + 0.4, pickOf(r, ['#b65d3d', '#a5533a', '#c06a45']));
    } else {
      part(0, h + 0.05, 0, w + 0.25, 0.14, d + 0.25, trim);
      part(0, h + 0.45, front - 0.08, w, 0.7, 0.16, trim);
      part(0, h + 0.45, -front + 0.08, w, 0.7, 0.16, trim);
      if (roof < 0.68) {
        solid('cylinder', -w * 0.22, h + 1.05, -d * 0.2, 0.55, 1.1, 0.55, '#d5dadb');
        part(-w * 0.22, h + 0.3, -d * 0.2, 1.3, 0.4, 1.3, '#9aa6a3');
        solid('box', w * 0.18, h + 0.75, -d * 0.15, 1.6, 0.08, 1.1, '#2f4f6a', 0.45);
      } else {
        for (let i = 0; i < 4; i++) {
          const pp = at(-w / 2 + 1 + i * (w - 2) / 3, front - 0.9 - (i % 2) * 0.6);
          pot(pp.x, pp.z, h + 0.1, 1.2, p.seed + i * 11);
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(sx * w * 0.3, h + 1.2, -d * 0.15 + sz * 1.2, 0.1, 2.2, 0.1, '#7b5a3f');
        part(0, h + 2.3, -d * 0.15, w * 0.62, 0.08, 2.7, '#8a6a4c');
      }
    }
  }

  function hospitalBuilding(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const { part, at } = frame(x, z, p.facing);
    part(0, h / 2, 0, w, h, d, '#eef0e8');
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
    part(0, h / 2, 0, w, h, d, '#e9c46a');
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
    flag.part(0.85, h + 4.4, 0, 1.7, 1.1, 0.04, '#d62f2a');
    flag.part(0.85, h + 4.4, 0.03, 0.4, 0.4, 0.02, '#ffd75e');
  }

  function schoolBuilding(p: Plot, b: Building) {
    const { x, z, w, d } = dims(p);
    const h = p.h, front = d / 2;
    const { part, at, solid } = frame(x, z, p.facing);
    part(0, h / 2, 0, w, h, d, '#f2d58a');
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
    solid('hip', 0, h + 1.2, 0, w + 1.2, 2.4, d + 1.6, '#b5583a');
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
    part(0, 3.2, 0, w, 4.6, d, '#e7b75f');
    for (let i = 0; i < 6; i++) part(-w / 2 + 0.6 + i * (w - 1.2) / 5, 3.0, front + 0.6, 0.45, 4.2, 0.45, '#a8432f');
    for (const lx of [-4.4, 0, 4.4]) {
      part(lx, 2.3, front + 0.06, 2.2, 2.9, 0.1, '#7a2e22');
      part(lx, 2.3, front + 0.1, 0.06, 2.9, 0.06, '#d8a531');
    }
    part(0, 5.45, front + 0.35, w + 0.6, 0.35, 1.2, '#8e3b28');
    // Two curved-looking tiers: hip roofs with upturned dragon-tail corners and a ridge ornament.
    const roofs: [number, number, number, number][] = [[5.65, w + 3.2, d + 3.4, 2.2], [8.2, w * 0.62, d * 0.62, 1.9]];
    roofs.forEach(([y, rw, rd, rh], i) => {
      solid('hip', 0, y + rh / 2, 0, rw, rh, rd, i ? '#7f3f2c' : '#8e4a33');
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
    shape('hip', '#8e4a33', -27, 5.05, 120, 11.6, 1.1, 2.6);
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
    part(0, h / 2, 0, w, h, d, '#c9d4d6');
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

  BUILDINGS.forEach((b, i) => {
    const p = PLOTS[i];
    if (p.style === 'legacy') legacyHouse(p, b);
    else if (p.style === 'hospital') hospitalBuilding(p, b);
    else if (p.style === 'police') policeStation(p, b);
    else if (p.style === 'school') schoolBuilding(p, b);
    else if (p.style === 'pagoda') pagodaBuilding(p, b);
    else if (p.style === 'office') officeBuilding(p, b);
    else if (p.style === 'kiosk') kiosk(p, b);
    else newHouse(p, b);
  });

  // ---- Ground, roads, markings and crosswalks. ----
  box('#b4b99a', 0, -0.22, 96.7, 660, 0.42, 466.6, 0, false);
  box('#b4b99a', 0, -0.22, -272.5, 660, 0.42, 135, 0, false);
  box('#d7d1bb', 0, -0.01, 39.25, 440, 0.12, 351.5, 0, false, 'ground');
  const roads = ROADS;
  for (const road of roads) {
    box('#5f6a68', 0, 0.04, road, 442, 0.08, ASPHALT_HALF * 2, 0, false, 'ground');
    box('#5f6a68', road, 0.039, 56, ASPHALT_HALF * 2, 0.08, 328, 0, false, 'ground');
    for (let i = -211; i < 216; i += 9) {
      if (roads.every((r) => Math.abs(r - i) > 10)) {
        box('#e3d4a7', i, 0.076, road, 3.2, 0.015, 0.17, 0, false, 'ground');
        if (i > -98) box('#e3d4a7', road, 0.075, i, 0.17, 0.015, 3.2, 0, false, 'ground');
      }
    }
    for (const crossing of roads) {
      // Zebra crossings sit on the walking lines, just outside the junction.
      for (const side of [-1, 1]) for (let stripe = -5.5; stripe <= 5.5; stripe += 1.375) {
        if (!(crossing === ROAD_FIRST && side < 0)) box('#e4e3d4', road + stripe, 0.078, crossing + side * 8.6, 0.7, 0.015, 2.6, 0, false, 'ground');
        box('#e4e3d4', road + side * 8.6, 0.079, crossing + stripe, 2.6, 0.015, 0.7, 0, false, 'ground');
      }
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
    const place = (a: number, along: number, c: number, across: number, h: number, color: ColorLike) =>
      alongX ? box(color, a, h / 2, c, along, h, across, 0, false, 'ground') : box(color, c, h / 2, a, across, h, along, 0, false, 'ground');
    for (const [a, b] of spansBetween(cuts, slabCut, from, to)) {
      // Slabs about 3 m long in slightly different shades read as paving without a texture.
      const count = Math.max(1, Math.round((b - a) / 3));
      const step = (b - a) / count;
      for (let i = 0; i < count; i++) place(a + step * (i + 0.5), step, mid, depth, slabTop, vary('#bea58d', slabRandom(), 0.7));
    }
    for (const [a, b] of spansBetween(cuts, ASPHALT_HALF, from, to)) place((a + b) / 2, b - a, curbAt, 0.36, slabTop + 0.015, '#d9d5ca');
  }
  for (const road of roads) for (const side of [-1, 1]) {
    // East-west roads: cut where north-south carriageways cross (none south of the riverside road).
    pavement(true, road, side, -220, 220, road === ROAD_FIRST && side < 0 ? [] : roads, ASPHALT_HALF);
    // North-south roads: from the riverside road to the north edge, leaving the corners to the east-west pavements.
    pavement(false, road, side, ROAD_FIRST, 215, roads, SIDEWALK_EDGE);
  }

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
    lift = onPavement(t.x, t.z);
    table(t.x, t.z);
    stool(t.x - 1.25, t.z);
    stool(t.x + 1.25, t.z, '#698b81');
  }
  for (const b of SCENERY.benches) {
    lift = onPavement(b.x, b.z);
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
  const nearRoad = (t: Tree) => roads.some((r) => Math.abs(Math.abs(t.x - r) - 9.3) < 0.6 || Math.abs(Math.abs(t.z - r) - 9.3) < 0.6);
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

  // ---- Solid props from the layout. ----
  function prop(pr: Prop) {
    const { part, at, solid } = frame(pr.x, pr.z, pr.yaw);
    const r = seeded(pr.x * 977 + pr.z * 131);
    switch (pr.kind) {
      case 'fountain': break; // drawn with the park
      case 'stall': {
        const x = pr.x, z = pr.z;
        box('#ba8b61', x, 1, z, 4.7, 1.5, 2.4);
        for (const dx of [-2.1, 2.1]) box('#8d7458', x + dx, 1.8, z, 0.12, 3.2, 0.12);
        const canopy = z < 0 ? '#4f7fa8' : '#d79555';
        for (let stripe = 0; stripe < 6; stripe++) box(stripe % 2 ? '#efdeb9' : canopy, x - 2.5 + (stripe + 0.5) * 5 / 6, 3.5, z, 5 / 6, 0.2, 3.6);
        for (let n = 0; n < 8; n++) shape('ball', n % 3 ? (z < 0 ? '#c9d6dc' : '#e4ad58') : '#86a169', x - 1.7 + (n % 4) * 1.1, 1.93, z - 0.4 + Math.floor(n / 4) * 0.7, 0.38, 0.33, 0.38);
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
        box('#d62f2a', pr.x + 0.85, 7.3, pr.z, 1.7, 1.1, 0.04, 0, false);
        box('#ffd75e', pr.x + 0.85, 7.3, pr.z - 0.03, 0.4, 0.4, 0.02, 0, false);
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
        sign('TRẠM XE BUÝT', 'TUYẾN 03 • 08 • 15', '#ffffff', sp.x, 2.75, sp.z, 3.6, 0.6, pr.yaw, '#2c64a8');
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
      case 'scooter': {
        const body = pickOf(r, ['#c9493b', '#3f6f9f', '#e8d6a8', '#2f3a40', '#f0f0ea', '#8c6fae', '#5e927c', '#d98c3c']);
        part(0, 0.55, -0.1, 0.42, 0.36, 1.1, body);
        part(0, 0.3, 0.1, 0.36, 0.08, 0.7, '#3a3a3a');
        part(0, 0.83, -0.25, 0.36, 0.12, 0.65, '#2c2b2a');
        part(0, 0.75, 0.5, 0.44, 0.75, 0.12, body);
        part(0, 1.15, 0.52, 0.62, 0.05, 0.05, '#3a3a3a');
        part(0, 0.95, 0.6, 0.18, 0.1, 0.06, '#fff4d8');
        for (const lz of [-0.6, 0.62]) solid('cylinder', 0, 0.26, lz, 0.26, 0.1, 0.26, '#232323', HALF_PI);
        break;
      }
      case 'cart': {
        const tint = pickOf(r, ['#4f7fa8', '#c9493b', '#d9a441', '#c8ccc9']);
        part(0, 0.55, 0, 1.8, 0.75, 0.9, tint);
        part(0, 1.2, 0, 1.6, 0.55, 0.75, '#bcd3d6', 'glass', false);
        part(0, 1.5, 0, 1.75, 0.06, 0.85, '#e7e3d8');
        for (const lx of [-0.75, 0.75]) solid('cylinder', lx, 0.18, 0.46, 0.18, 0.06, 0.18, '#232323', HALF_PI, true, HALF_PI);
        part(-0.6, 1.95, 0, 0.05, 2.0, 0.05, '#6b6b6b');
        const u = at(-0.6, 0);
        shape('cone', pickOf(r, ['#e5484d', '#3f8fc9', '#f5c84a', '#5e927c']), u.x, 2.95, u.z, 1.35, 0.55, 1.35, pr.yaw, 0, true);
        for (let i = 0; i < 4; i++) {
          const f = at(-0.6 + i * 0.35, 0.05);
          shape('ball', pickOf(r, ['#f5d36b', '#e88f4a', '#f1e6c8', '#9cc46b']), f.x, 1.12, f.z, 0.14, 0.1, 0.14, 0, 0, false);
        }
        break;
      }
    }
  }
  SCENERY.props.forEach((pr) => {
    lift = onPavement(pr.x, pr.z);
    prop(pr);
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
      if (gap < 1 || gap > 4.5 || hash(a.full.minX, a.full.minZ, 5) < 0.3) continue;
      const fa = a.full, fb = b.full;
      const e = { x: Math.round(Math.sin(a.facing)), z: Math.round(Math.cos(a.facing)) };
      const frontCoord = alongX ? (e.z > 0 ? Math.min(fa.maxZ, fb.maxZ) : Math.max(fa.minZ, fb.minZ)) : (e.x > 0 ? Math.min(fa.maxX, fb.maxX) : Math.max(fa.minX, fb.minX));
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

  // ---- Riverside promenade, the river and the far bank. ----
  for (let x = -198; x <= 198; x += 4) box('#cfc2a6', x, 0.056, -127, 0.06, 0.01, 18, 0, false, 'ground');
  box('#cfc2a6', 0, 0.057, -119.8, 400, 0.01, 0.06, 0, false, 'ground');
  box('#cfc2a6', 0, 0.057, -133.9, 400, 0.01, 0.06, 0, false, 'ground');
  box('#bbaf96', 0, -0.55, -137.1, 660, 1.3, 1.2, 0, true);
  box('#e2cfaa', 0, 0.45, -136.1, 400, 0.12, 0.2);
  box('#e2cfaa', 0, 0.95, -136.1, 400, 0.1, 0.16);
  for (let x = -198; x <= 198; x += 2.5) box('#d6c4a1', x, 0.5, -136.1, 0.16, 0.95, 0.16);
  for (let x = -190; x <= 190; x += 3.2) {
    const fx = x + decor() * 1.2;
    if (softFree(fx, -120.4, 0.6)) {
      box('#a58b6b', fx, 0.2, -120.4, 1.6, 0.3, 0.7, 0, false);
      flowers(fx, 0.38, -120.4, 6, 1.4, 0.5, Math.floor(fx * 10));
    }
  }
  box('#5f9f98', 0, -0.95, -171, 660, 0.3, 67.6, 0, false, 'water');
  box('#bbaf96', 0, -0.55, -205, 660, 1.3, 1.4, 0, false);
  const farTrees = seeded(77);
  for (let i = 0; i < 46; i++) {
    const x = -300 + i * 13.3 + farTrees() * 6;
    const s = 0.9 + farTrees() * 0.5;
    const tz = -211 - farTrees() * 8, tint = farTrees();
    farTrees();
    const yaw = farTrees() * 3;
    shape('cylinder', '#7a5a48', x, 1.6 * s, tz, 0.25 * s, 3.2 * s, 0.25 * s, 0, 0, false);
    shape('puff', leaf('#4f8049', '#78a564', 0.35, tint), x, 4.5 * s, tz, 2.6 * s, 2.4 * s, 2.6 * s, yaw, 0, false);
    shape('puff', leaf('#4f8049', '#78a564', 0.95, tint), x + 0.8 * s, 5.9 * s, tz + 0.3 * s, 1.6 * s, 1.5 * s, 1.6 * s, yaw + 1, 0, false);
  }
  for (let i = 0; i < 26; i++) {
    const x = -260 + i * 21;
    const h = 14 + ((i * 13) % 30);
    const zz = -232 - (i % 3) * 12;
    box(i % 2 ? '#b9c4b6' : '#c6c6b5', x, h / 2, zz, 12 + (i % 4) * 2, h, 12, 0, false);
    for (let floor = 3; floor < h - 1; floor += 3.6) box('#a4b7af', x, floor, zz + 6.05, 9, 0.9, 0.08, 0, false, hash(x, floor) < 0.5 ? 'glassLit' : 'glass');
  }
  // Two sampans moored on the river.
  for (const [bx, bz, yaw] of [[-48, -146, 0.2], [74, -152, -0.3]]) {
    const { part } = frame(bx, bz, yaw + HALF_PI);
    part(0, -0.55, 0, 1.6, 0.5, 6, '#6e4f36');
    part(0, -0.3, 0, 1.7, 0.1, 6.1, '#8a6a4c');
    for (const sz of [-1, 1]) part(0, -0.25, sz * 3.2, 1.0, 0.4, 0.9, '#6e4f36');
    part(0, 0.35, -0.6, 1.5, 0.08, 2.6, '#c9b07a');
    shape('gable', '#a58d5c', bx, 0.65, bz, 1.6, 0.6, 2.6, yaw, 0, false);
  }
  const waves: { x: number; z: number; width: number }[] = [];
  for (let i = 0; i < 46; i++) waves.push({ x: -200 + ((i * 37) % 400), z: -141 - ((i * 11) % 60), width: 2 + (i % 4) * 1.4 });
  const waveGeometry = new THREE.PlaneGeometry(1, 0.14).rotateX(-HALF_PI);
  const waveMaterial = new THREE.MeshBasicMaterial({ color: '#b5d2b7', transparent: true, opacity: 0.32 });
  geometries.push(waveGeometry);
  materials.push(waveMaterial);
  const waveMesh = new THREE.InstancedMesh(waveGeometry, waveMaterial, waves.length);
  waveMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  waveMesh.frustumCulled = false;
  root.add(waveMesh);

  // ---- Edge scenery: a quieter ring of houses and trees beyond the playable streets. ----
  const edge = seeded(911);
  const BACKGROUND = ['#d8c7a8', '#c9d1c4', '#d9b9a3', '#c6cdd6', '#e0d4b8', '#bfcab5'];
  for (let gx = -212; gx <= 212; gx += 17) {
    for (let gz = -134; gz <= 212; gz += 17) {
      const x = gx + (edge() - 0.5) * 4, z = gz + (edge() - 0.5) * 4;
      if (Math.max(Math.abs(x), Math.abs(z)) < 149 || z < -112) continue;
      if (roads.some((r) => Math.abs(x - r) < 17 || Math.abs(z - r) < 17)) continue;
      if (edge() < 0.25) {
        const s = 1 + edge() * 0.5;
        const tint = edge(), yaw = edge() * 3;
        shape('cylinder', '#7a5a48', x, 1.8 * s, z, 0.25 * s, 3.6 * s, 0.25 * s, 0, 0, false);
        shape('puff', leaf('#4f8049', '#7aa766', 0.35, tint), x, 4.9 * s, z, 2.8 * s, 2.6 * s, 2.8 * s, yaw, 0, false);
        shape('puff', leaf('#4f8049', '#7aa766', 0.95, tint), x - 0.7 * s, 6.4 * s, z + 0.4 * s, 1.7 * s, 1.6 * s, 1.7 * s, yaw + 1, 0, false);
        continue;
      }
      const w = 9 + edge() * 5, d = 9 + edge() * 5, h = 7 + edge() * 15;
      box(pickOf(edge, BACKGROUND), x, h / 2, z, w, h, d, 0, false);
      if (edge() < 0.4) shape('gable', '#a5533a', x, h + 0.8, z, w + 0.4, 1.6, d + 0.4, 0, 0, false);
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
  for (let i = 0; i < 90; i++) {
    const road = pickOf(pr, roads), along = (pr() - 0.5) * 2 * 128;
    const offset = (pr() < 0.5 ? -1 : 1) * (4.2 + pr() * 2.4);
    const horizontal = pr() < 0.5;
    if (roads.some((r) => Math.abs(along - r) < 9)) continue;
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

  // ---- Build atlases and instanced batches. ----
  buildAtlas(signCells.length, 1024, 256, 2048, 2048, signQuads, (ctx, i) => {
    const { text, subtitle, color, background } = signCells[i];
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.strokeRect(16, 16, 992, 224);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 94px Arial, sans-serif';
    ctx.fillText(text, 512, 107, 930);
    ctx.font = '500 31px Arial, sans-serif';
    ctx.fillText(subtitle, 512, 194, 900);
  }, 0.5, true);
  buildAtlas(plateCells.length, 128, 64, 1024, 1024, plateQuads, (ctx, i) => {
    ctx.fillStyle = '#1d4f9c';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, 118, 54);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 13px Arial, sans-serif';
    ctx.fillText('SỐ NHÀ', 64, 17);
    ctx.font = '900 30px Arial, sans-serif';
    ctx.fillText(String(plateCells[i]), 64, 41, 108);
  }, 0.25, false);

  // Instances are bucketed into 160 m tiles so off-screen parts of the city are frustum-culled.
  const TILE = 160;
  for (const batch of batches.values()) {
    const count = batch.c.length / 3;
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < count; i++) {
      const tx = batch.m[i * 16 + 12], tz = batch.m[i * 16 + 14];
      const key = count < 600 || batch.big[i] ? 'all' : `${Math.floor((tx + 80) / TILE)}:${Math.floor((tz + 80) / TILE)}`;
      let list = buckets.get(key);
      if (!list) { list = []; buckets.set(key, list); }
      list.push(i);
    }
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(primitives[batch.kind], roles[batch.role], list.length);
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
      root.add(mesh);
    }
  }
  // Cutaway: when a building stands between the camera and the player, everything in front of the player
  // inside a soft circle around them on screen is discarded (dithered at the rim), so they stay visible.
  const cut = { center: { value: new THREE.Vector2() }, depth: { value: 0 }, radius: { value: 0 }, aspect: { value: 1 } };
  const uncut = new Set<THREE.Material>([roles.ground, poolMaterial, puddleMaterial, waveMaterial]);
  for (const material of materials) {
    if (uncut.has(material)) continue;
    material.onBeforeCompile = (shader) => {
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

  // Nothing in the neighbourhood moves, so skip per-frame matrix recomputation for the whole tree.
  root.traverse((object) => { object.updateMatrix(); object.matrixAutoUpdate = false; });
  root.updateMatrixWorld(true);

  const identity = new THREE.Quaternion();
  const groundBase = new THREE.Color('#ffffff');
  let lastNight = -1, lastWet = -1;
  return {
    colliders,
    update(time: number) {
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
      if (enabled) for (const p of PLOTS) if (segmentHitsBlock(cx, cy, cz, x, y, z, p.full, p.h + 2.5)) { hidden = true; break; }
      cutStrength += ((hidden ? 1 : 0) - cutStrength) * (1 - Math.exp(-dt * 8));
      if (cutStrength < 0.01) { cut.radius.value = 0; return; }
      const depth = -focusPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z;
      focusPoint.set(x, y, z).project(camera);
      cut.center.value.set(focusPoint.x, focusPoint.y);
      cut.depth.value = depth - 1.2;
      cut.aspect.value = camera.aspect;
      cut.radius.value = (CUT_RADIUS * cutStrength) / Math.max(1, depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
    /** `night` 0..1 lights windows, lamps, signs and light pools; `wet` 0..1 darkens and glosses the paving. */
    setAtmosphere(a: { night: number; wet: number }) {
      const night = Math.min(1, Math.max(0, a.night || 0));
      const wet = Math.min(1, Math.max(0, a.wet || 0));
      if (Math.abs(night - lastNight) < 0.004 && Math.abs(wet - lastWet) < 0.004) return;
      lastNight = night;
      lastWet = wet;
      roles.glass.emissiveIntensity = night * 0.28;
      roles.glassLit.emissiveIntensity = night * 1.25;
      roles.lamp.emissiveIntensity = night * 2.6;
      roles.lantern.emissiveIntensity = night * 1.1;
      for (const g of glowMaterials) g.material.emissiveIntensity = night * g.strength;
      poolMaterial.opacity = night * 0.5;
      pools.visible = night > 0.02;
      roles.ground.color.copy(groundBase).multiplyScalar(1 - 0.38 * wet);
      roles.ground.roughness = 0.9 - 0.62 * wet;
      roles.ground.metalness = 0.12 * wet;
      puddleMaterial.opacity = wet * 0.6;
      puddles.visible = wet > 0.02;
    },
    dispose() {
      scene.remove(root);
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      root.clear();
    },
  };
}
