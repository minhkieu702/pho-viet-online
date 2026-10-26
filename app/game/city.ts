/**
 * Layout data for the city: the An Hòa neighbourhood, the downtown district east of it, the river along the
 * north, roads, buildings with their doors, places people visit, street lamps and every collider. Pure and
 * deterministic (seeded), so gameplay, pedestrian routines and the renderer in world.ts all agree on the same
 * city. No three.js in here.
 */
// The constant tables live in map/consts.ts (page.tsx imports them without running this generator).
import {
  CITY_PARK, DOCKS, DOWNTOWN_X, GARDENS, LAND, PARK, PLAZA, PROMENADE, ROADS_X, ROADS_Z, SIDEWALK, SQUARE, STREETS_H, STREETS_V, VENUE_LOOKS, YARDS,
  type Point, type Rect, type VenueKind,
} from './map/consts.ts';
import { MENU, dishOf, type Dish, type LifeKind } from './street-life.ts';
export { DOWNTOWN_X, LAND, PLAY, RIVER, RIVER_BED, ROADS_X, ROADS_Z, SIDEWALK, WATER_LEVEL } from './map/consts.ts';
export type { Dock, Point, Rect, VenueKind } from './map/consts.ts';

/** Whether (x, z) lies inside `r`, at least `margin` from its edges. */
export function inRect(r: Rect, x: number, z: number, margin = 0) {
  return x >= r.minX + margin && x <= r.maxX - margin && z >= r.minZ + margin && z <= r.maxZ - margin;
}

export type BuildingKind = 'home' | 'shop' | 'cafe' | 'food' | 'office' | 'school' | 'hospital' | 'police' | 'post' | 'gunstore' | 'bikeshop' | 'pagoda'
  | 'bank' | 'mall' | 'hotel' | 'theatre';
export type Building = {
  id: number; x: number; z: number; w: number; d: number; h: number; facing: number;
  name: string; subtitle: string; kind: BuildingKind; color: string;
  door: Point; curb: Point; residents: number; jobs: number;
};
export type PoiKind = 'park' | 'square' | 'market' | 'cafe-seat' | 'bench' | 'bus-stop' | 'pagoda-yard' | 'school-yard'
  /** Street life (LIFE.groups): a quán stool, a cờ tướng seat, an onlooker's spot, a dưỡng sinh place, a đá cầu or chase place, a scooter saddle, the karaoke stage. */
  | 'stool' | 'chess' | 'kibitz' | 'exercise' | 'ring' | 'perch' | 'stage';
/**
 * A place to visit. Street-life spots also carry their group and slot in LIFE.groups, the seat height above the
 * ground (`seatH`) and a `via` point their approach from the curb passes (round a table, beside a scooter).
 */
export type Poi = { id: number; kind: PoiKind; x: number; z: number; yaw: number; curb: Point; seat: boolean; group?: number; slot?: number; seatH?: number; via?: Point };

/** Render-only details of a building, parallel to BUILDINGS (same id). */
export type PlotStyle = 'legacy' | 'home' | 'shop' | 'kiosk' | 'hospital' | 'police' | 'school' | 'pagoda' | 'office' | 'tower' | 'midrise';
/** Downtown building shapes (see skyline.ts). */
export type TowerForm = 'glass' | 'stepped' | 'tapered' | 'bundle' | 'twin' | 'apartment' | 'hotel' | 'mall' | 'colonial' | 'midrise';
export type TowerCrown = 'flat' | 'spire' | 'helipad' | 'crown' | 'garden' | 'sign' | 'dome';
/** How a downtown building is drawn: its shape, storey height, glass and frame colours and window pattern. */
export type TowerSpec = { form: TowerForm; floor: number; glass: string; frame: string; pattern: 0 | 1 | 2 | 3; crown: TowerCrown; podium: number };
export type Plot = {
  id: number; style: PlotStyle;
  full: Rect; // upper floors
  ground: Rect; // ground floor = collider; smaller than `full` where an arcade keeps a walking line clear
  h: number; facing: number; // visual front (the legacy post office keeps its old +z front, its door is on the west side)
  legacy: number; // index in the original neighbourhood (canopy colours, balconies), -1 for new buildings
  sign: boolean; signColor: string; number: number; row: number; seed: number;
  tower: TowerSpec | null;
};
export type TreeSpecies = 'round' | 'layered' | 'tall' | 'flame' | 'palm' | 'bamboo';
export type Tree = { species: TreeSpecies; x: number; z: number; size: number; spin: number; tint: number };
export type Lamp = { x: number; z: number; hx: number; hz: number; kind: 'street' | 'post' };
export type PropKind = 'fountain' | 'stall' | 'fence' | 'wall' | 'pillar' | 'urn' | 'stupa' | 'flagpole' | 'shelter' | 'planter' | 'scooter' | 'cart'
  /** Street dressing: a concrete power pole (SCENERY.poles), a wheelie bin, a vé số seller's glass case. */
  | 'pole' | 'bin' | 'lottery';
/** A solid prop: (x, z) centre, sx/sz world-axis collider size, yaw for the model. */
export type Prop = { kind: PropKind; x: number; z: number; sx: number; sz: number; yaw: number; tint: number };
export type Seat = { x: number; z: number; yaw: number };

const PI = Math.PI;
const HALF_PI = PI / 2;
const ROAD_HALF = 10;
const PED = 0.45;
/**
 * Vertical roads (x = r) end in a T at the riverside road; horizontal roads run the full width. Walking lines
 * run the full playable width on both axes (across the riverside promenade too).
 */
const V_ROAD_START = -108;
/** Half width of the carriageway (map/terrain.ts ASPHALT_HALF). */
const CARRIAGE_HALF = 7;
/** Walking lines: x of the north-south ones, z of the east-west ones. */
const LINES_X = ROADS_X.flatMap((r) => [r - SIDEWALK, r + SIDEWALK]);
const LINES_Z = ROADS_Z.flatMap((r) => [r - SIDEWALK, r + SIDEWALK]);

let seed = 240917;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const r2 = (v: number) => Math.round(v * 100) / 100;
const rectAt = (x: number, z: number, sx: number, sz: number): Rect => ({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 });
/** Unit vector a yaw faces (0 => +z, PI/2 => +x), snapped so axis-aligned yaws are exact. */
function forward(yaw: number) {
  return { x: Math.round(Math.sin(yaw) * 1e6) / 1e6, z: Math.round(Math.cos(yaw) * 1e6) / 1e6 };
}
function rectDistance(r: Rect, x: number, z: number) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}
function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

export const COLLIDERS: Rect[] = [];

/** True when a circle of `radius` at (x, z) touches no collider. */
export function pointClear(x: number, z: number, radius = PED) {
  for (const c of COLLIDERS) {
    const nx = Math.max(c.minX, Math.min(c.maxX, x));
    const nz = Math.max(c.minZ, Math.min(c.maxZ, z));
    if ((x - nx) ** 2 + (z - nz) ** 2 < radius * radius) return false;
  }
  return true;
}

const nearColliders: Rect[] = [];
/** True when a circle of `radius` can slide along the straight segment without touching a collider (sampled every 0.25 m). */
export function segmentClear(ax: number, az: number, bx: number, bz: number, radius = PED) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
  // Only colliders within `radius` of the segment's box can touch a sample: gather them in one pass, then test the
  // samples against those (the same test as pointClear, so the answer is unchanged; generation runs this thousands of times).
  const x0 = Math.min(ax, bx) - radius, x1 = Math.max(ax, bx) + radius, z0 = Math.min(az, bz) - radius, z1 = Math.max(az, bz) + radius;
  const near = nearColliders;
  near.length = 0;
  for (const c of COLLIDERS) if (c.maxX >= x0 && c.minX <= x1 && c.maxZ >= z0 && c.minZ <= z1) near.push(c);
  if (!near.length) return true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const c of near) {
      const nx = Math.max(c.minX, Math.min(c.maxX, x));
      const nz = Math.max(c.minZ, Math.min(c.maxZ, z));
      if ((x - nx) ** 2 + (z - nz) ** 2 < radius * radius) return false;
    }
  }
  return true;
}

/** Whether a point on a walking line sits on a crossing (inside another road's band) rather than a sidewalk. */
function onCrossing(lineAxis: 'h' | 'v', lineCoord: number, along: number) {
  if (lineAxis === 'h') return lineCoord >= V_ROAD_START && ROADS_X.some((r) => Math.abs(along - r) < ROAD_HALF);
  return ROADS_Z.some((r) => Math.abs(along - r) < ROAD_HALF);
}
function curbValid(p: Point, lineAxis: 'h' | 'v') {
  if (!inRect(LAND, p.x, p.z)) return false;
  return lineAxis === 'h' ? !onCrossing('h', p.z, p.x) : !onCrossing('v', p.x, p.z);
}

// ---------------------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------------------

type Axis = 'h' | 'v';
type Draft = {
  full: Rect; h: number; facing: number; entrance: number;
  kind: BuildingKind; name: string; subtitle: string; color: string;
  style: PlotStyle; legacy: number; sign: boolean; signColor: string; row: number;
  street: { axis: Axis; road: number; side: number } | null;
  residents: number; jobs: number; seed: number; cart: boolean;
  tower: TowerSpec | null;
};
const drafts: Draft[] = [];
let rowCount = 0;

function draft(d: Partial<Draft> & Pick<Draft, 'full' | 'h' | 'facing' | 'kind' | 'name' | 'subtitle' | 'color' | 'style'>) {
  const item: Draft = {
    entrance: d.facing, legacy: -1, sign: false, signColor: '#245b4f', row: -1, street: null,
    residents: 0, jobs: 0, seed: Math.floor(rand() * 1e6), cart: false, tower: null, ...d,
  };
  drafts.push(item);
  return item;
}

// The original hand-made neighbourhood, kept at exactly the same coordinates.
const LEGACY_SHOPS: [string, string, BuildingKind][] = [
  ['CÀ PHÊ CÔ BA', 'CÀ PHÊ PHIN • TỪ 1998', 'cafe'], ['BÁNH MÌ', 'NÓNG GIÒN MỖI NGÀY', 'food'],
  ['TẠP HÓA', 'CHUYỆN NHỎ MỖI NGÀY', 'shop'], ['TIỆM HOA', 'MỘT CHÚT TƯƠI VUI', 'shop'],
  ['PHỞ CÔ BA', 'PHỞ BÒ • PHỞ GÀ', 'food'], ['XE MÁY', 'SỬA XE • THAY NHỚT', 'shop'],
  ['NHÀ SÁCH', 'SÁCH VÀ NHỮNG GIẤC MƠ', 'shop'], ['BÚN CHẢ', 'BẾP NHÀ • VỊ QUEN', 'food'],
];
const LEGACY_COLORS = ['#ddbd84', '#a1beb1', '#d68f76', '#e4d9ba', '#9eb7bd', '#c9b2bb'];
const LEGACY_X = [-76, -65, -42, -30, -18, 20, 32, 43, 66, 77];
const LEGACY_ROWS: { z: number; xs: number[]; w: number; height: (i: number) => number; facing: number; cafe?: number }[] = [
  { z: -18, xs: [-76, -65, -42, -31, -20, 20, 31, 42, 66, 77], w: 9.7, height: (i) => 7.4 + (i % 3) * 3.15, facing: 0, cafe: -31 },
  { z: 21, xs: LEGACY_X, w: 10, height: (i) => 7.1 + (i % 3) * 2.8, facing: PI, cafe: -30 },
  { z: -72, xs: LEGACY_X, w: 10, height: (i) => 7.3 + (i % 3) * 2.65, facing: 0 },
  { z: 74, xs: LEGACY_X, w: 10, height: (i) => 6.6 + (i % 3) * 2.7, facing: PI },
  { z: -40, xs: [-76, -65, -42, -30, -18, 66, 77], w: 10, height: (i) => 6.8 + (i % 2) * 3, facing: PI },
  { z: 42, xs: [-76, -65, -42, -30, -18, 66, 77], w: 10, height: (i) => 7.2 + (i % 2) * 3, facing: 0 },
];
{
  let index = 0;
  for (const row of LEGACY_ROWS) {
    const rowId = rowCount++;
    for (const x of row.xs) {
      const i = index++;
      const h = row.height(i);
      const full = rectAt(x, row.z, row.w, 11);
      const isPost = x === 66 && row.z === -40;
      const isGun = x === -18 && row.z === 42;
      const shop = LEGACY_SHOPS[x === row.cafe ? 0 : i % LEGACY_SHOPS.length];
      let kind = shop[2];
      if (x === 20 && row.z === -18) kind = 'bikeshop';
      const base = { full, h, legacy: i, row: rowId, style: 'legacy' as const, sign: true, signColor: i % 3 === 0 ? '#b14635' : '#245b4f' };
      if (isPost) {
        // The post office's sign faces +z as before; its door opens west onto the post-office road.
        draft({ ...base, facing: 0, entrance: -HALF_PI, kind: 'post', name: 'BƯU ĐIỆN', subtitle: 'GỬI MỘT CHÚT THƯƠNG', color: '#dfb16f' });
      } else if (isGun) {
        draft({ ...base, facing: row.facing, kind: 'gunstore', name: 'TIỆM SÚNG', subtitle: 'VŨ KHÍ • TRANG BỊ • MỞ CỬA 24/7', color: '#7d8a84', signColor: '#2f4a6b' });
      } else {
        draft({ ...base, facing: row.facing, kind, name: shop[0], subtitle: shop[1], color: LEGACY_COLORS[i % LEGACY_COLORS.length] });
      }
    }
  }
}

// Landmarks in the outer ring.
const hospital = draft({
  full: { minX: 120.5, maxX: 135.5, minZ: -42, maxZ: -12 }, h: 13.6, facing: -HALF_PI, kind: 'hospital', style: 'hospital',
  name: 'BỆNH VIỆN AN HÒA', subtitle: 'CẤP CỨU 24/7 • KHÁM BỆNH • TIÊM CHỦNG', color: '#eef0e8', sign: true, signColor: '#1f6b5c', jobs: 7,
});
const police = draft({
  full: { minX: -133, maxX: -120.5, minZ: -38, maxZ: -16 }, h: 10.4, facing: HALF_PI, kind: 'police', style: 'police',
  name: 'CÔNG AN PHƯỜNG', subtitle: 'PHƯỜNG AN HÒA • TRỰC BAN 24/7', color: '#e9c46a', sign: true, signColor: '#a8322a', jobs: 5,
});
draft({
  full: { minX: 12, maxX: 42, minZ: 127, maxZ: 137 }, h: 10.6, facing: PI, kind: 'school', style: 'school',
  name: 'TRƯỜNG TIỂU HỌC', subtitle: 'TRƯỜNG TIỂU HỌC AN HÒA', color: '#f2d58a', sign: true, signColor: '#2c5d8f', jobs: 5,
});
draft({
  full: { minX: -35, maxX: -19, minZ: 127, maxZ: 136 }, h: 9.6, facing: PI, entrance: PI, kind: 'pagoda', style: 'pagoda',
  name: 'CHÙA AN HÒA', subtitle: 'NAM MÔ A DI ĐÀ PHẬT', color: '#e7b75f', sign: true, signColor: '#8e2b20',
});
draft({
  full: { minX: 120.5, maxX: 134.5, minZ: -94, maxZ: -68 }, h: 26, facing: -HALF_PI, kind: 'office', style: 'office',
  name: 'VĂN PHÒNG', subtitle: 'TÒA NHÀ AN HÒA • 8 TẦNG', color: '#c9d4d6', sign: true, signColor: '#27455e', jobs: 7,
});
draft({
  full: { minX: -2, maxX: 2, minZ: -124, maxZ: -121 }, h: 3.4, facing: 0, kind: 'food', style: 'kiosk',
  name: 'NƯỚC MÍA', subtitle: 'MÍA ÉP • DỪA TƯƠI', color: '#e9c873', sign: true, signColor: '#3e7a3a', jobs: 1,
});

// New rows of tube houses facing the roads, in attached groups with alleys between them (street names: STREETS_H/V).
const HOME_COLORS = ['#e9cf8f', '#f0dcae', '#cfe0c8', '#e3b9a3', '#c9d7e3', '#efe6d2', '#d9a6a0', '#bcd0b5', '#f2c47a', '#d7c4dd', '#a9c9c2', '#e6c3a0'];
const NEW_SHOPS: [string, string, BuildingKind][] = [
  ['TIỆM MAY', 'MAY ĐO • SỬA ĐỒ', 'shop'], ['QUÁN CƠM', 'CƠM TẤM • CƠM NHÀ', 'food'],
  ['TIỆM TÓC', 'CẮT • GỘI • SẤY', 'shop'], ['NHÀ THUỐC', 'NHÀ THUỐC TÂY • TƯ VẤN', 'shop'],
];
const STALL_NAMES = ['BÚN RIÊU CÔ HAI', 'BÁNH XÈO', 'XÔI SÁNG', 'CHÈ BÀ TƯ', 'HỦ TIẾU GÕ', 'BÁNH CUỐN', 'BÁNH CANH', 'CHÁO LÒNG'];
let shopIndex = 0;
let stallIndex = 0;

type RowSpec = { axis: Axis; road: number; side: 1 | -1; from: number; to: number; maxDepth: number; front?: number; shop?: boolean; midrise?: boolean };
function addRow(spec: RowSpec) {
  const { axis, road, side, from, to } = spec;
  const rowId = rowCount++;
  const frontDist = spec.front ?? 12.5;
  const len = to - from;
  const n = Math.max(1, Math.round(len / (spec.midrise ? 12.5 : 9.2)));
  const gaps: number[] = [];
  for (let k = 0; k < n - 1; k++) gaps.push(rand() < 0.55 ? between(1.8, 2.8) : 0);
  if (n >= 3 && Math.max(...gaps) === 0) gaps[Math.floor(n / 2) - 1] = 2.2;
  const free = len - gaps.reduce((a, b) => a + b, 0);
  const weights = Array.from({ length: n }, () => between(0.8, 1.25));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.min(spec.midrise ? 15 : 11.5, Math.max(5.5, (free * w) / weightSum)));
  const used = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  let a = from + Math.max(0, len - used) / 2;
  const facing = axis === 'h' ? (side > 0 ? PI : 0) : (side > 0 ? -HALF_PI : HALF_PI);
  const street = (axis === 'h' ? STREETS_H : STREETS_V).get(road) ?? 'ĐƯỜNG AN HÒA';
  const shopAt = spec.shop ? Math.floor(n / 2) : -1;
  for (let k = 0; k < n; k++) {
    const w = r2(widths[k]);
    const d = r2(Math.min(spec.maxDepth, between(9.5, 12)));
    const front = road + side * frontDist;
    const back = front + side * d;
    const lo = r2(a), hi = r2(a + w);
    const full = axis === 'h'
      ? { minX: lo, maxX: hi, minZ: Math.min(front, back), maxZ: Math.max(front, back) }
      : { minX: Math.min(front, back), maxX: Math.max(front, back), minZ: lo, maxZ: hi };
    const floors = pick([2, 2, 3, 3, 3, 4]);
    const h = r2(floors * 3.2 + between(0.5, 1.1));
    const color = pick(HOME_COLORS);
    const roll = rand();
    if (spec.midrise) {
      // Downtown: five to nine storeys over a shopfront, a hotel, office or flats above shops.
      const [name, subtitle, kind] = DOWNTOWN_SHOPS[downtownIndex++ % DOWNTOWN_SHOPS.length];
      const storeys = 5 + Math.floor(rand() * 5);
      const tower: TowerSpec = { form: 'midrise', floor: 3.4, glass: pick(['#6f8fa8', '#7d97a3', '#5f7d92', '#8aa2ad']), frame: pick(MIDRISE_COLORS), pattern: pick([1, 2, 2, 3] as const), crown: pick(['flat', 'flat', 'garden', 'sign'] as const), podium: 4.6 };
      draft({ full, h: r2(storeys * 3.4 + 1.4), facing, kind, name, subtitle, color: tower.frame, style: 'midrise', sign: true, signColor: pick(['#b14635', '#245b4f', '#7a4b8c', '#2f5d8a', '#c27c1a']), row: rowId, street: { axis, road, side }, tower });
    } else if (k === shopAt) {
      const [name, subtitle, kind] = NEW_SHOPS[shopIndex++ % NEW_SHOPS.length];
      draft({ full, h, facing, kind, name, subtitle, color, style: 'shop', sign: true, signColor: pick(['#b14635', '#245b4f', '#7a4b8c', '#2f5d8a']), row: rowId, street: { axis, road, side } });
    } else if (roll < 0.16) {
      draft({ full, h, facing, kind: 'food', name: STALL_NAMES[stallIndex++ % STALL_NAMES.length], subtitle: street, color, style: 'home', row: rowId, street: { axis, road, side }, cart: true });
    } else {
      draft({ full, h, facing, kind: 'home', name: 'NHÀ', subtitle: street, color, style: 'home', row: rowId, street: { axis, road, side } });
    }
    a += w + (gaps[k] ?? 0);
  }
}
const BLOCKS = [[-97, -65], [-43, -11], [11, 43], [65, 97]];
// Inner blocks: houses facing the riverside road and road 108.
BLOCKS.forEach(([from, to], i) => addRow({ axis: 'h', road: -108, side: 1, from, to, maxDepth: 11, shop: i === 1 }));
BLOCKS.forEach(([from, to], i) => addRow({ axis: 'h', road: 108, side: -1, from, to, maxDepth: 11, shop: i === 2 }));
// The original rows continue to the new outer roads.
for (const [from, to] of [[-97, -82.8], [83.6, 97]]) {
  addRow({ axis: 'h', road: 0, side: -1, from, to, maxDepth: 11 });
  addRow({ axis: 'h', road: 0, side: 1, from, to, maxDepth: 11, front: 15.5 });
  addRow({ axis: 'h', road: -54, side: -1, from, to, maxDepth: 11 });
  addRow({ axis: 'h', road: -54, side: 1, from, to, maxDepth: 11 });
  addRow({ axis: 'h', road: 54, side: -1, from, to, maxDepth: 11 });
  addRow({ axis: 'h', road: 54, side: 1, from, to, maxDepth: 11, front: 14.5 });
}
// Outer strips.
addRow({ axis: 'v', road: 108, side: 1, from: 11, to: 43, maxDepth: 12.5, shop: true });
addRow({ axis: 'v', road: 108, side: 1, from: 65, to: 97, maxDepth: 12.5 });
addRow({ axis: 'v', road: -108, side: -1, from: -97, to: -65, maxDepth: 12.5 });
addRow({ axis: 'v', road: -108, side: -1, from: 11, to: 43, maxDepth: 12.5, shop: true });
addRow({ axis: 'v', road: -108, side: -1, from: 65, to: 97, maxDepth: 12.5 });
addRow({ axis: 'h', road: 108, side: 1, from: -97, to: -65, maxDepth: 12.5 });
addRow({ axis: 'h', road: 108, side: 1, from: 65, to: 97, maxDepth: 12.5 });

// ---------------------------------------------------------------------------------------------------------
// Downtown ("Quận Trung Tâm"): towers on the twelve blocks between roads 162 and 324, mid-rise rows on the
// strips along its edges, a walking-street plaza and a park.
// ---------------------------------------------------------------------------------------------------------
const MIDRISE_COLORS = ['#d9cbb3', '#c9c2b6', '#e3d6bd', '#b9c3c4', '#d6b9a2', '#c4ccd4', '#e7dfcf', '#a9b4b8'];
const DOWNTOWN_SHOPS: [string, string, BuildingKind][] = [
  ['KHÁCH SẠN SAO MAI', 'HOTEL • PHÒNG ĐÔI • VIEW SÔNG', 'hotel'], ['CÀ PHÊ SÂN THƯỢNG', 'CÀ PHÊ • NHẠC ACOUSTIC', 'cafe'],
  ['MINI MART 24H', 'TIỆN LỢI • MỞ CẢ ĐÊM', 'shop'], ['NHÀ HÀNG SÀI GÒN XƯA', 'CƠM NIÊU • LẨU • HẢI SẢN', 'food'],
  ['TIỆM VÀNG KIM HOÀN', 'VÀNG BẠC • ĐÁ QUÝ', 'shop'], ['VĂN PHÒNG CHO THUÊ', 'TÒA NHÀ HẠNG B', 'office'],
  ['PHỞ HÀ NỘI', 'PHỞ BÒ TÁI NẠM', 'food'], ['CĂN HỘ DỊCH VỤ', 'CHO THUÊ THEO THÁNG', 'home'],
  ['TRÀ SỮA', 'TRÀ SỮA • TRÀ TRÁI CÂY', 'cafe'], ['THỜI TRANG', 'QUẦN ÁO • GIÀY DÉP', 'shop'],
  ['KHÁCH SẠN HOA SEN', 'HOTEL ★★★', 'hotel'], ['CĂN HỘ CHO THUÊ', 'CĂN HỘ STUDIO', 'home'],
];
let downtownIndex = 0;
for (const [from, to] of [[-97, -65], [-43, -11], [11, 43], [65, 97]]) {
  addRow({ axis: 'v', road: 162, side: -1, from, to, maxDepth: 12, midrise: true });
  addRow({ axis: 'v', road: 324, side: 1, from, to, maxDepth: 13, midrise: true });
}
for (const [from, to] of [[174.5, 203.5], [228.5, 257.5], [282.5, 311.5], [336.5, 349.5]]) addRow({ axis: 'h', road: 108, side: 1, from, to, maxDepth: 13, midrise: true });

/** One downtown block: x and z of its centre (blocks are 29 m square between the sidewalks). */
const BLOCK_X = [189, 243, 297], BLOCK_Z = [-81, -27, 27, 81];
type TowerDraft = { bx: number; bz: number; w: number; d: number; h: number; facing: number; kind: BuildingKind; name: string; subtitle: string; signColor: string; tower: TowerSpec; jobs?: number; residents?: number };
const towers: TowerDraft[] = [
  { bx: 0, bz: 0, w: 25, d: 25, h: 232, facing: PI, kind: 'office', name: 'THÁP PHƯƠNG NAM', subtitle: 'ĐÀI QUAN SÁT TẦNG 68 • NHẢY DÙ', signColor: '#1f4f7a',
    tower: { form: 'bundle', floor: 3.9, glass: '#5d86a6', frame: '#c7d0d6', pattern: 0, crown: 'spire', podium: 14 }, jobs: 5 },
  { bx: 1, bz: 0, w: 22, d: 22, h: 168, facing: PI, kind: 'office', name: 'TÒA THÁP TÀI CHÍNH', subtitle: 'TRUNG TÂM TÀI CHÍNH • SÂN ĐỖ TRỰC THĂNG', signColor: '#2b5d72',
    tower: { form: 'tapered', floor: 4, glass: '#7aa3a8', frame: '#d7dcd8', pattern: 0, crown: 'helipad', podium: 10 }, jobs: 4 },
  { bx: 2, bz: 0, w: 26, d: 16, h: 96, facing: PI, kind: 'hotel', name: 'KHÁCH SẠN BẾN NGHÉ', subtitle: 'HOTEL ★★★★★ • ROOFTOP BAR', signColor: '#8a2f3a',
    tower: { form: 'hotel', floor: 3.5, glass: '#8a9ea6', frame: '#e9dfcc', pattern: 2, crown: 'sign', podium: 9 }, jobs: 3 },
  { bx: 0, bz: 1, w: 24, d: 24, h: 172, facing: 0, kind: 'office', name: 'CAO ỐC SÀI THÀNH', subtitle: 'VĂN PHÒNG HẠNG A', signColor: '#5a4632',
    tower: { form: 'stepped', floor: 3.8, glass: '#7f8f99', frame: '#cfc3a8', pattern: 3, crown: 'spire', podium: 16 }, jobs: 4 },
  { bx: 1, bz: 1, w: 27, d: 18, h: 22, facing: 0, kind: 'theatre', name: 'NHÀ HÁT THÀNH PHỐ', subtitle: 'XÂY NĂM 1900 • BIỂU DIỄN MỖI TỐI', signColor: '#8e2b20',
    tower: { form: 'colonial', floor: 5.5, glass: '#5f7484', frame: '#f0d79a', pattern: 2, crown: 'dome', podium: 0 }, jobs: 2 },
  { bx: 2, bz: 1, w: 22, d: 22, h: 88, facing: -HALF_PI, kind: 'bank', name: 'NGÂN HÀNG PHƯƠNG NAM', subtitle: 'GIAO DỊCH • KÉT SẮT • ATM 24/7', signColor: '#1d5a3c',
    tower: { form: 'glass', floor: 3.8, glass: '#4f7f7a', frame: '#b8c4c2', pattern: 1, crown: 'crown', podium: 8 }, jobs: 3 },
  { bx: 0, bz: 2, w: 27, d: 27, h: 66, facing: HALF_PI, kind: 'mall', name: 'TRUNG TÂM THƯƠNG MẠI', subtitle: 'MUA SẮM • RẠP PHIM • ẨM THỰC', signColor: '#b5223b',
    tower: { form: 'mall', floor: 4.2, glass: '#6e8fa3', frame: '#e4e1da', pattern: 1, crown: 'flat', podium: 24 }, jobs: 4 },
  { bx: 2, bz: 2, w: 26, d: 24, h: 78, facing: -HALF_PI, kind: 'home', name: 'CHUNG CƯ SÔNG XANH', subtitle: 'CĂN HỘ CAO CẤP • HỒ BƠI', signColor: '#2f6a5a',
    tower: { form: 'twin', floor: 3.2, glass: '#86a5b0', frame: '#efe9dc', pattern: 2, crown: 'garden', podium: 6 }, residents: 6 },
  { bx: 0, bz: 3, w: 24, d: 24, h: 120, facing: PI, kind: 'office', name: 'TÒA NHÀ KIM CƯƠNG', subtitle: 'VĂN PHÒNG • NGÂN HÀNG', signColor: '#2a4f8a',
    tower: { form: 'glass', floor: 3.9, glass: '#5e8fb8', frame: '#c4ccd4', pattern: 0, crown: 'crown', podium: 0 }, jobs: 4 },
  { bx: 2, bz: 3, w: 26, d: 18, h: 64, facing: PI, kind: 'home', name: 'CHUNG CƯ PHÚ MỸ', subtitle: 'CĂN HỘ • KHU DÂN CƯ', signColor: '#6a4a2f',
    tower: { form: 'apartment', floor: 3.2, glass: '#8ea5ad', frame: '#e8d9bf', pattern: 2, crown: 'flat', podium: 0 }, residents: 6 },
];
for (const t of towers) {
  const x = BLOCK_X[t.bx], z = BLOCK_Z[t.bz];
  // Towers face their front road and stand back a little; their footprint is the ground-floor collider.
  const f = forward(t.facing);
  const ox = f.x * (14.5 - (Math.abs(f.x) > 0.5 ? t.d : t.w) / 2 - 1), oz = f.z * (14.5 - (Math.abs(f.z) > 0.5 ? t.d : t.w) / 2 - 1);
  const sx = Math.abs(f.x) > 0.5 ? t.d : t.w, sz = Math.abs(f.x) > 0.5 ? t.w : t.d;
  const full = rectAt(r2(x + ox), r2(z + oz), sx, sz);
  draft({ full, h: t.h, facing: t.facing, kind: t.kind, name: t.name, subtitle: t.subtitle, color: t.tower.frame, style: 'tower', sign: true, signColor: t.signColor, tower: t.tower, jobs: t.jobs ?? 0, residents: t.residents ?? 0 });
}

/**
 * Ground-floor footprint. Where an original house reaches over a walking line, its ground floor is recessed
 * into an arcade (upper floors overhang) so the sidewalk stays walkable; the door side keeps room for a door.
 */
function groundOf(full: Rect, entrance: number): Rect {
  const g = { ...full };
  const e = forward(entrance);
  for (const L of LINES_X) {
    if (full.minX < L + 0.5 && full.maxX > L - 0.5) {
      if ((full.minX + full.maxX) / 2 < L) g.maxX = Math.min(g.maxX, L - (e.x > 0.5 ? 1.6 : 0.6), full.maxX - 1.2);
      else g.minX = Math.max(g.minX, L + (e.x < -0.5 ? 1.6 : 0.6), full.minX + 1.2);
    }
  }
  for (const L of LINES_Z) {
    if (full.minZ < L + 0.5 && full.maxZ > L - 0.5) {
      if ((full.minZ + full.maxZ) / 2 < L) g.maxZ = Math.min(g.maxZ, L - (e.z > 0.5 ? 1.6 : 0.6), full.maxZ - 1.2);
      else g.minZ = Math.max(g.minZ, L + (e.z < -0.5 ? 1.6 : 0.6), full.minZ + 1.2);
    }
  }
  return g;
}
const grounds = drafts.map((d) => groundOf(d.full, d.entrance));
grounds.forEach((g) => COLLIDERS.push(g));

// ---------------------------------------------------------------------------------------------------------
// Fixed scenery: the original park, square, market and street trees, plus the new landmarks' grounds.
// ---------------------------------------------------------------------------------------------------------

const trees: Tree[] = [];
const props: Prop[] = [];
const lamps: Lamp[] = [];
const benches: Seat[] = [];
const busStops: Seat[] = [];

/** Tops of the low props (world.ts draws them this tall); a ragdoll coming from above lands on them. */
const PROP_TOP: Partial<Record<PropKind, number>> = { fountain: 0.6, planter: 0.5, stall: 0.8, fence: 1.6, urn: 1.6, scooter: 1.0, cart: 1.0, bin: 1.1, lottery: 1.3 };
function addProp(kind: PropKind, x: number, z: number, sx: number, sz: number, yaw = 0, tint = rand()) {
  props.push({ kind, x, z, sx, sz, yaw, tint });
  const top = PROP_TOP[kind];
  COLLIDERS.push(top === undefined ? rectAt(x, z, sx, sz) : { ...rectAt(x, z, sx, sz), top });
}
function trunkSize(t: Tree) {
  return t.species === 'bamboo' ? 1.1 : t.species === 'palm' ? 0.5 : 0.65;
}
function addTree(species: TreeSpecies, x: number, z: number, size: number, tint = rand()) {
  const t = { species, x: r2(x), z: r2(z), size: r2(size), spin: r2(rand() * PI * 2), tint: r2(tint) };
  trees.push(t);
  // Beyond the playable edge nothing can bump into a trunk, so skip the collider.
  if (!inRect(LAND, t.x, t.z, -2)) return;
  const s = trunkSize(t);
  COLLIDERS.push(rectAt(t.x, t.z, s, s));
}
function addLamp(x: number, z: number, hx: number, hz: number, kind: Lamp['kind'] = 'street') {
  lamps.push({ x: r2(x), z: r2(z), hx: r2(hx), hz: r2(hz), kind });
  const s = kind === 'post' ? 0.3 : 0.24;
  COLLIDERS.push(rectAt(x, z, s, s));
}
const insideAnyFull = (x: number, z: number, margin = 0) => drafts.some((d) => rectDistance(d.full, x, z) <= margin);

// Park block (PARK): lawn, fountain and trees (legacy positions); two of the old trees are now flame trees.
addProp('fountain', 28, -33, 7, 7);
([[17, -40, 'round'], [39, -40, 'flame'], [17, -26, 'flame'], [39, -26, 'round']] as const).forEach(([x, z, s]) => addTree(s, x, z, 1.15));
for (const [x, z] of [[17, 33], [42, 33], [17, 44], [42, 44]]) addTree('palm', x, z, 1);
benches.push({ x: 22, z: -38, yaw: 0 }, { x: 34, z: -28, yaw: PI }, { x: 35, z: -37, yaw: HALF_PI });
benches.push({ x: 23, z: 43, yaw: 0 }, { x: 35, z: 43, yaw: 0 }, { x: 42, z: 38, yaw: HALF_PI });
const CAFE_TABLES: Point[] = [{ x: -39, z: -9.5 }, { x: -26, z: -9.5 }, { x: -38, z: 11 }, { x: -24, z: 11 }];
for (let i = 0; i < 3; i++) addProp('stall', -42 + i * 11, 32, 4.7, 2.4, 0);

// Original street trees (road + 9.2) and lamps (road - 9.2). The few that stood inside a house are dropped,
// and the lamp that grew through a café table moves 3 m east.
for (const road of [-54, 0, 54]) {
  for (const along of [-81, -61, -42, -16, 18, 43, 68, 84]) {
    if (ROADS_X.some((r) => Math.abs(r - along) < 10)) continue;
    if (!(road === 0 && (along === -42 || along === -16)) && !insideAnyFull(along, road + 9.2)) addTree('round', along, road + 9.2, 0.72);
    const lx = road === 0 && along === -42 ? along + 6.4 : along + 3.4;
    if (!insideAnyFull(lx, road - 9.2)) addLamp(lx, road - 9.2, lx + 1.1, road - 9.2);
  }
}

// School: yard behind a fence with a wide gate, a flag pole and a flame tree.
addProp('fence', 16.15, 120, 10.3, 0.3);
addProp('fence', 37.85, 120, 10.3, 0.3);
addProp('fence', 11, 123.5, 0.3, 7);
addProp('fence', 43, 123.5, 0.3, 7);
addProp('pillar', 21.65, 120, 0.7, 0.7);
addProp('pillar', 32.35, 120, 0.7, 0.7);
addProp('flagpole', 38.5, 123.5, 0.3, 0.3);
addTree('flame', 15.5, 123.6, 1.15);
// Pagoda: walled yard, three-way gate, bronze urn, stupa and a bodhi tree.
addProp('wall', -36.5, 120, 9, 0.5);
addProp('wall', -17.5, 120, 9, 0.5);
addProp('wall', -41, 128.5, 0.5, 17);
addProp('wall', -13, 128.5, 0.5, 17);
addProp('pillar', -31.5, 120, 1, 1);
addProp('pillar', -22.5, 120, 1, 1);
addProp('urn', -27, 123.6, 1, 1);
addProp('stupa', -37.2, 124.6, 2.4, 2.4);
addTree('round', -17.4, 124.6, 1.35, 0.15);
// Riverside market stalls on the promenade.
for (const x of [66, 76, 86]) addProp('stall', x, -124.5, 4.7, 2.4, 0);
// Bus stops: shelter back panel on the building side of the walking line, bench facing the road.
function busStop(axis: Axis, road: number, side: 1 | -1, along: number) {
  const yaw = axis === 'h' ? (side > 0 ? PI : 0) : (side > 0 ? -HALF_PI : HALF_PI);
  const seat = road + side * 9.95;
  const back = road + side * 11.1;
  if (axis === 'h') {
    busStops.push({ x: along, z: seat, yaw });
    addProp('shelter', along, back, 4.4, 0.25, yaw);
  } else {
    busStops.push({ x: seat, z: along, yaw });
    addProp('shelter', back, along, 0.25, 4.4, yaw);
  }
}
busStop('h', -108, -1, -76);
busStop('h', 108, 1, 38);
busStop('v', 108, 1, -36);
busStop('v', -108, -1, -19.5);
// Corner gardens (GARDENS) and the promenade.
addTree('flame', 130, 130, 1.25);
addTree('flame', -130, 130, 1.25);
benches.push({ x: 121.6, z: 127.5, yaw: -HALF_PI }, { x: 127.5, z: 121.6, yaw: PI });
benches.push({ x: -121.6, z: 127.5, yaw: HALF_PI }, { x: -127.5, z: 121.6, yaw: PI });
const PROMENADE_BENCHES = [-122, -86, -42, -14, 14, 42, 92, 122];
for (const x of PROMENADE_BENCHES) benches.push({ x, z: -133, yaw: PI });
for (const x of [-104, -64, -28, 28, 104]) addTree('palm', x, -131, 1);
// Pagoda and school yards (YARDS) are paved; the promenade runs the whole northern edge.

// Downtown: the walking-street plaza (PLAZA) in front of the theatre, a fountain in the middle, palms at the corners.
addProp('fountain', 243, 27, 7, 7);
for (const [x, z] of [[231.5, 15.5], [254.5, 15.5], [231.5, 38.5], [254.5, 38.5]]) addTree('palm', x, z, 1.1);
for (const [x, z] of [[236, 19], [250, 19], [236, 35], [250, 35]]) addProp('planter', x, z, 2.2, 1.1, 0);
benches.push({ x: 232.5, z: 22, yaw: HALF_PI }, { x: 232.5, z: 32, yaw: HALF_PI }, { x: 253.5, z: 22, yaw: -HALF_PI }, { x: 253.5, z: 32, yaw: -HALF_PI });
// The city park (CITY_PARK): shade trees, a lawn and benches along its paths.
for (const [x, z, sp] of [[233, 71, 'round'], [253, 71, 'flame'], [233, 91, 'flame'], [253, 91, 'round'], [243, 76, 'tall'], [238, 86, 'round'], [249, 86, 'tall']] as const) addTree(sp, x, z, 1.2);
benches.push({ x: 243, z: 70.5, yaw: 0 }, { x: 243, z: 91.5, yaw: PI }, { x: 234, z: 81, yaw: HALF_PI }, { x: 252, z: 81, yaw: -HALF_PI });
// The riverfront continues downtown: benches facing the water and palms.
for (const x of [150, 176, 230, 262, 286, 336]) benches.push({ x, z: -133, yaw: PI });
for (const x of [160, 214, 250, 278, 326]) addTree('palm', x, -131, 1);

// Docks on the river (DOCKS): piers, steps for swimmers, speedboat hire and the river bus.

// ---------------------------------------------------------------------------------------------------------
// Doors and curbs.
// ---------------------------------------------------------------------------------------------------------

function findDoor(g: Rect, entrance: number) {
  const e = forward(entrance);
  const alongX = Math.abs(e.z) > 0.5;
  const wall = e.x > 0.5 ? g.maxX : e.x < -0.5 ? g.minX : e.z > 0.5 ? g.maxZ : g.minZ;
  const lo = alongX ? g.minX : g.minZ, hi = alongX ? g.maxX : g.maxZ;
  const mid = (lo + hi) / 2, half = (hi - lo) / 2 - 0.9;
  const dir = alongX ? e.z : e.x;
  for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, 3.2, -3.2, 4, -4, 5, -5, 6, -6]) {
    if (Math.abs(off) > half) continue;
    const along = r2(mid + off);
    const coord = r2(wall + dir * 0.8);
    const L = (alongX ? LINES_Z : LINES_X).filter((v) => (v - coord) * dir > 0.01).sort((a, b) => (a - b) * dir)[0];
    if (L === undefined) continue;
    const door = alongX ? { x: along, z: coord } : { x: coord, z: along };
    const curb = alongX ? { x: along, z: r2(L) } : { x: r2(L), z: along };
    if (!curbValid(curb, alongX ? 'h' : 'v')) continue;
    if (pointClear(door.x, door.z) && pointClear(curb.x, curb.z) && segmentClear(door.x, door.z, curb.x, curb.z)) return { door, curb };
  }
  return null;
}
// Family shops of An Hòa: the trade on the sign, then whose shop it is, so the ward reads as neighbours rather than a
// chain (counters.ts and street-life.ts key on the trade prefix). The two Cô Ba cafés of the delivery mission keep
// their name; no sign repeats within 120 m.
{
  const TRADES: Record<string, { prefix: string; subtitles: string[] }> = {
    'CÀ PHÊ CÔ BA': { prefix: 'CÀ PHÊ', subtitles: ['CÀ PHÊ PHIN • TỪ 1998', 'CÀ PHÊ VỢT • TRÀ ĐÁ', 'SỮA ĐÁ • BẠC XỈU', 'CÀ PHÊ MUỐI • CA CAO'] },
    'PHỞ CÔ BA': { prefix: 'PHỞ', subtitles: ['PHỞ BÒ • PHỞ GÀ', 'PHỞ TÁI • NẠM • GẦU', 'PHỞ BÒ VIÊN • QUẨY'] },
    'BÁNH MÌ': { prefix: 'BÁNH MÌ', subtitles: ['NÓNG GIÒN MỖI NGÀY', 'PATE • CHẢ LỤA • THỊT NGUỘI', 'BÁNH MÌ ỐP LA • XÍU MẠI'] },
    'TẠP HÓA': { prefix: 'TẠP HÓA', subtitles: ['CHUYỆN NHỎ MỖI NGÀY', 'BÁNH KẸO • NƯỚC NGỌT • VÉ SỐ', 'GẠO • NƯỚC MẮM • ĐỒ KHÔ'] },
    'BÚN CHẢ': { prefix: 'BÚN CHẢ', subtitles: ['BẾP NHÀ • VỊ QUEN', 'CHẢ NƯỚNG THAN HOA', 'BÚN CHẢ • NEM RÁN'] },
    'TIỆM HOA': { prefix: 'TIỆM HOA', subtitles: ['MỘT CHÚT TƯƠI VUI', 'HOA TƯƠI MỖI SÁNG', 'HOA CƯỚI • HOA SINH NHẬT'] },
    'NHÀ SÁCH': { prefix: 'NHÀ SÁCH', subtitles: ['SÁCH VÀ NHỮNG GIẤC MƠ', 'SÁCH CŨ • BÁO SÁNG', 'VĂN PHÒNG PHẨM'] },
    'XE MÁY': { prefix: 'XE MÁY', subtitles: ['SỬA XE • THAY NHỚT', 'VÁ XE • BƠM HƠI', 'SỬA XE LẤY LIỀN'] },
    'QUÁN CƠM': { prefix: 'QUÁN CƠM', subtitles: ['CƠM TẤM • CƠM NHÀ', 'CƠM TẤM SƯỜN BÌ CHẢ', 'CƠM VĂN PHÒNG'] },
    'TIỆM MAY': { prefix: 'TIỆM MAY', subtitles: ['MAY ĐO • SỬA ĐỒ', 'ÁO DÀI • ĐỒ TÂY', 'NHẬN MAY ĐỒNG PHỤC'] },
    'TIỆM TÓC': { prefix: 'TIỆM TÓC', subtitles: ['CẮT • GỘI • SẤY', 'HỚT TÓC NAM', 'UỐN • NHUỘM • DUỖI'] },
    'NHÀ THUỐC': { prefix: 'NHÀ THUỐC', subtitles: ['NHÀ THUỐC TÂY • TƯ VẤN', 'THUỐC TÂY • DƯỢC SĨ TRỰC', 'THIẾT BỊ Y TẾ'] },
  };
  const OWNERS = ['CÔ BA', 'CHÚ TƯ', 'BÀ NĂM', 'DÌ SÁU', 'ANH HAI', 'CÔ THU', 'HẠNH', 'HÙNG', 'LAN', 'PHÚC', 'BA MIỀN', 'CHỊ BẢY', 'MINH', 'NGỌC'];
  const mission = new Set(LEGACY_ROWS.flatMap((row) => (row.cafe === undefined ? [] : [`${row.cafe},${row.z}`])));
  const centre = (d: Draft) => ({ x: (d.full.minX + d.full.maxX) / 2, z: (d.full.minZ + d.full.maxZ) / 2 });
  drafts.forEach((d, i) => {
    const trade = TRADES[d.name];
    if (!trade) return;
    const c = centre(d);
    if (d.name === 'CÀ PHÊ CÔ BA' && d.style === 'legacy' && mission.has(`${Math.round(c.x)},${Math.round(c.z)}`)) return;
    const taken = (name: string) => drafts.some((o, k) => k !== i && o.name === name && Math.hypot(centre(o).x - c.x, centre(o).z - c.z) < 120);
    for (let k = 0; k < OWNERS.length; k++) {
      const owner = OWNERS[(i * 5 + k) % OWNERS.length];
      if (trade.prefix === 'PHỞ' && owner === 'BA MIỀN') continue;
      const name = `${trade.prefix} ${owner}`;
      if (taken(name)) continue;
      d.name = name;
      d.subtitle = trade.subtitles[i % trade.subtitles.length];
      break;
    }
  });
}
const doors = drafts.map((d, i) => findDoor(grounds[i], d.entrance));

// ---------------------------------------------------------------------------------------------------------
// Places to visit.
// ---------------------------------------------------------------------------------------------------------

type PoiSpec = { kind: PoiKind; x: number; z: number; yaw: number; seat: boolean; group?: number; slot?: number; seatH?: number; via?: Point };
const poiSpecs: PoiSpec[] = [];
function seatsOf(b: Seat, kind: PoiKind, spread = 0.65) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  for (const lx of [-spread, spread]) {
    poiSpecs.push({ kind, x: r2(b.x + lx * c + 0.12 * s), z: r2(b.z - lx * s + 0.12 * c), yaw: b.yaw, seat: true });
  }
}
benches.forEach((b) => seatsOf(b, 'bench'));
busStops.forEach((b) => seatsOf(b, 'bus-stop', 0.7));
for (const t of CAFE_TABLES) {
  poiSpecs.push({ kind: 'cafe-seat', x: t.x - 1.25, z: t.z, yaw: HALF_PI, seat: true });
  poiSpecs.push({ kind: 'cafe-seat', x: t.x + 1.25, z: t.z, yaw: -HALF_PI, seat: true });
}
for (const x of [-42, -31, -20]) {
  poiSpecs.push({ kind: 'market', x, z: 29.55, yaw: 0, seat: false });
  poiSpecs.push({ kind: 'market', x, z: 34.45, yaw: PI, seat: false });
}
for (const x of [66, 76, 86]) {
  poiSpecs.push({ kind: 'market', x, z: -122, yaw: PI, seat: false });
  poiSpecs.push({ kind: 'market', x: x + 2.95, z: -124.5, yaw: -HALF_PI, seat: false });
}
poiSpecs.push(
  { kind: 'park', x: 28, z: -38.4, yaw: 0, seat: false },
  { kind: 'park', x: 22.4, z: -31.5, yaw: HALF_PI, seat: false },
  { kind: 'park', x: 33.6, z: -34.5, yaw: -HALF_PI, seat: false },
  { kind: 'square', x: 25.5, z: 36.5, yaw: 0.5, seat: false },
  { kind: 'square', x: 32.5, z: 36.5, yaw: -0.5, seat: false },
  { kind: 'square', x: 29, z: 41.5, yaw: PI, seat: false },
  { kind: 'park', x: 124.5, z: 124.5, yaw: PI / 4, seat: false },
  { kind: 'park', x: -124.5, z: 124.5, yaw: -PI / 4, seat: false },
  { kind: 'pagoda-yard', x: -27, z: 122.4, yaw: 0, seat: false },
  { kind: 'pagoda-yard', x: -24.6, z: 125.3, yaw: 0, seat: false },
  { kind: 'pagoda-yard', x: -30, z: 123.2, yaw: 0.2, seat: false },
  { kind: 'pagoda-yard', x: -25, z: 121.4, yaw: -0.7, seat: false },
  { kind: 'school-yard', x: 24.2, z: 122.6, yaw: 1.2, seat: false },
  { kind: 'school-yard', x: 29.8, z: 122.6, yaw: -1.2, seat: false },
  { kind: 'school-yard', x: 25.6, z: 124.9, yaw: 2.6, seat: false },
  { kind: 'school-yard', x: 28.4, z: 124.9, yaw: -2.6, seat: false },
);
// People leaning on the river railing.
for (const x of [-56, -24, 24, 112, 205, 248, 316]) poiSpecs.push({ kind: 'park', x, z: -134.5, yaw: PI, seat: false });
// Around the plaza fountain and in the city park.
poiSpecs.push(
  { kind: 'square', x: 238.6, z: 27, yaw: HALF_PI, seat: false }, { kind: 'square', x: 247.4, z: 27, yaw: -HALF_PI, seat: false },
  { kind: 'square', x: 243, z: 22.6, yaw: 0, seat: false }, { kind: 'square', x: 243, z: 31.4, yaw: PI, seat: false },
  { kind: 'park', x: 240, z: 80, yaw: 0.6, seat: false }, { kind: 'park', x: 247, z: 79, yaw: -0.8, seat: false }, { kind: 'park', x: 244, z: 88, yaw: 2.8, seat: false },
);

/** Shortest straight, collider-free way from a spot to a walking line. */
function findCurb(x: number, z: number): Point | null {
  let best: Point | null = null;
  let bestLen = Infinity;
  const options: [Point, 'h' | 'v'][] = [...LINES_Z.map((L): [Point, 'h'] => [{ x, z: r2(L) }, 'h']), ...LINES_X.map((L): [Point, 'v'] => [{ x: r2(L), z }, 'v'])];
  {
    for (const [curb, axis] of options) {
      const len = Math.hypot(curb.x - x, curb.z - z);
      if (len >= bestLen || !curbValid(curb, axis)) continue;
      if (pointClear(curb.x, curb.z) && segmentClear(curb.x, curb.z, x, z)) {
        best = curb;
        bestLen = len;
      }
    }
  }
  return best;
}
// Someone waiting for the boat at each dock, by the head of the pier.
for (const dock of DOCKS) {
  const spot = [dock.x - 3.4, dock.x + 6.2, dock.x - 5.5].map((x) => ({ x, z: -134.3 })).find((p) => pointClear(p.x, p.z) && findCurb(p.x, p.z));
  if (spot) poiSpecs.push({ kind: 'park', x: spot.x, z: spot.z, yaw: PI, seat: false });
}
const poiCurbs = poiSpecs.map((p) => (pointClear(p.x, p.z) ? findCurb(p.x, p.z) : null));

// Paths people use: door->curb and curb->spot. New scenery keeps clear of them and of the walking lines.
const segments: [number, number, number, number][] = [];
doors.forEach((d) => { if (d) segments.push([d.door.x, d.door.z, d.curb.x, d.curb.z]); });
poiSpecs.forEach((p, i) => { const c = poiCurbs[i]; if (c) segments.push([c.x, c.z, p.x, p.z]); });
// Hard-coded gameplay spots (spawn, mission pickup, shop rings, delivery receivers) stay uncluttered.
const KEEP_CLEAR: Point[] = [
  { x: 12.6, z: 12.4 }, { x: 12.4, z: 14.2 }, { x: -32, z: 7 }, { x: -30, z: 13 }, { x: -18, z: 49.6 }, { x: 20, z: -10.9 },
  { x: 22.5, z: -10.3 }, { x: 54, z: -35 }, { x: 28, z: -24 }, { x: -36.5, z: 35 }, { x: 36, z: 33 }, { x: -20, z: -83.5 }, { x: 32, z: 13.5 },
];

/**
 * Distance from (x, z) to the nearest thing people walk on: a walking line, a door/spot path or a POI.
 * world.ts uses it to keep soft decoration (shrubs, flowers, puddles) off the paths.
 */
export function pathClearance(x: number, z: number) {
  let best = Infinity;
  if (x >= LAND.minX - 1 && x <= LAND.maxX + 1) for (const L of LINES_Z) best = Math.min(best, Math.abs(z - L));
  if (z >= LAND.minZ - 1 && z <= LAND.maxZ + 1) for (const L of LINES_X) best = Math.min(best, Math.abs(x - L));
  for (const [ax, az, bx, bz] of segments) best = Math.min(best, segmentDistance(x, z, ax, az, bx, bz));
  for (const p of poiSpecs) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
  return best;
}

/** Whether a solid square of half-size `half` can stand at (x, z) without blocking anything. */
function spotFree(x: number, z: number, half: number, clearOfFull = 0) {
  if (pathClearance(x, z) < half + PED + 0.1) return false;
  for (const c of COLLIDERS) {
    if (x + half + 0.1 > c.minX && x - half - 0.1 < c.maxX && z + half + 0.1 > c.minZ && z - half - 0.1 < c.maxZ) return false;
  }
  if (clearOfFull > 0 && insideAnyFull(x, z, clearOfFull)) return false;
  if (KEEP_CLEAR.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) return false;
  for (const b of benches) if (Math.hypot(b.x - x, b.z - z) < 2.4) return false;
  for (const b of busStops) if (Math.hypot(b.x - x, b.z - z) < 3.8) return false;
  for (const t of CAFE_TABLES) if (Math.hypot(t.x - x, t.z - z) < 3) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// New street trees and lamps along every road, then shop-front planters, parked scooters and bamboo.
// ---------------------------------------------------------------------------------------------------------

// Landmark entrances and shop signs stay visible from the street: no street trees right in front of them.
const SHOWCASE = drafts.flatMap((d, i) => {
  const door = doors[i];
  if (!door) return [];
  const r = ['hospital', 'police', 'office', 'school', 'pagoda', 'kiosk', 'tower'].includes(d.style) ? 7 : d.style === 'shop' || d.style === 'midrise' ? 3.2 : 0;
  return r ? [{ x: door.curb.x, z: door.curb.z, r }] : [];
});
function speciesFor(axis: Axis, road: number, side: number, along: number): TreeSpecies {
  // Downtown's boulevards are lined with tall shade trees, and palms along the riverfront.
  if (axis === 'v' && road > DOWNTOWN_X) return road === 216 ? 'palm' : 'tall';
  if (axis === 'h' && along > DOWNTOWN_X + 5) return road === -108 ? 'palm' : 'tall';
  if (axis === 'h' && road === -108) return side < 0 ? 'palm' : 'tall';
  if (Math.abs(road) === 108) return axis === 'h' ? 'layered' : 'tall';
  if (axis === 'v') return Math.abs(road) === 54 ? 'layered' : 'round';
  return 'round';
}
for (const axis of ['h', 'v'] as Axis[]) {
  for (const road of axis === 'h' ? ROADS_Z : ROADS_X) {
    for (const side of [-1, 1]) {
      const legacyRoad = axis === 'h' && Math.abs(road) <= 54;
      const promenade = axis === 'h' && road === -108 && side < 0;
      const start = axis === 'v' ? V_ROAD_START + ROAD_HALF + 2 : LAND.minX - 61;
      const end = axis === 'v' ? LAND.maxZ + 61 : LAND.maxX + 61;
      const crossing = axis === 'h' ? ROADS_X : ROADS_Z;
      let lastTree = -Infinity;
      // Lamps are staggered between the two sides of a road.
      let lastLamp = side > 0 ? -Infinity : start - 14;
      for (let along = start; along <= end; along += 1) {
        if (legacyRoad && Math.abs(along) <= 88) continue;
        // No crossing roads on the river side of the riverside road; everywhere else keep junctions open.
        if (!promenade && crossing.some((r) => Math.abs(along - r) < 12)) continue;
        const species = speciesFor(axis, road, side, along);
        const beyond = axis === 'h' ? along < LAND.minX - 3 || along > LAND.maxX + 3 : along > LAND.maxZ + 3;
        const offset = promenade ? 9.6 : 9.4;
        const tx = axis === 'h' ? along : road + side * offset;
        const tz = axis === 'h' ? road + side * offset : along;
        const half = species === 'palm' ? 0.25 : 0.33;
        const showcase = SHOWCASE.some((p) => Math.hypot(p.x - tx, p.z - tz) < p.r);
        if (along - lastTree >= (promenade ? 15 : 13.5) && !showcase && (beyond ? !insideAnyFull(tx, tz, 1.4) : spotFree(tx, tz, half, 1.4))) {
          addTree(species, tx, tz, between(0.68, 0.86));
          lastTree = along;
          continue;
        }
        const lampOffset = 9.3;
        const lx = axis === 'h' ? along : road + side * lampOffset;
        const lz = axis === 'h' ? road + side * lampOffset : along;
        if (!beyond && along - lastLamp >= 28 && along - lastTree >= 5 && spotFree(lx, lz, 0.12, 0.5)) {
          const hx = axis === 'h' ? lx : lx - side * 1.1;
          const hz = axis === 'h' ? lz - side * 1.1 : lz;
          addLamp(lx, lz, hx, hz);
          lastLamp = along;
        }
      }
    }
  }
}
// Decorative lamp posts on the promenade, in the park, the square, the yards and gardens.
for (let x = -130; x <= LAND.maxX - 5; x += 13) if (spotFree(x, -127.5, 0.2)) addLamp(x, -127.5, x, -127.5, 'post');
for (const [x, z] of [[14.2, -43], [41.8, -43], [14.2, -23.5], [15.6, 30.6], [42.4, 30.6], [12.2, 126.2], [41.8, 126.2], [-39.8, 126.2], [-14.2, 126.2], [133, 121], [-133, 121]]) {
  if (spotFree(x, z, 0.2)) addLamp(x, z, x, z, 'post');
}

// Flower planters, parked scooters and street-food carts in front of houses.
drafts.forEach((d, i) => {
  const door = doors[i];
  if (!door || d.style === 'hospital' || d.style === 'school' || d.style === 'pagoda' || d.style === 'office' || d.style === 'kiosk' || d.style === 'tower') return;
  const g = grounds[i];
  const e = forward(d.entrance);
  const alongX = Math.abs(e.z) > 0.5;
  const wall = e.x > 0.5 ? g.maxX : e.x < -0.5 ? g.minX : e.z > 0.5 ? g.maxZ : g.minZ;
  const lo = alongX ? g.minX : g.minZ, hi = alongX ? g.maxX : g.maxZ;
  const doorAlong = alongX ? door.door.x : door.door.z;
  const place = (kind: PropKind, along: number, out: number, sAlong: number, sOut: number) => {
    const coord = wall + (alongX ? e.z : e.x) * out;
    const x = alongX ? along : coord, z = alongX ? coord : along;
    const sx = alongX ? sAlong : sOut, sz = alongX ? sOut : sAlong;
    if (Math.abs(along - doorAlong) < sAlong / 2 + 1.7) return false;
    if (!spotFree(x, z, Math.max(sx, sz) / 2)) return false;
    addProp(kind, r2(x), r2(z), sx, sz, d.entrance);
    return true;
  };
  if (d.cart) {
    const first = rand() < 0.5 ? -1 : 1;
    if (!place('cart', doorAlong + first * 2.9, 1.3, 1.9, 1.0)) place('cart', doorAlong - first * 2.9, 1.3, 1.9, 1.0);
  }
  const roll = rand();
  if (d.legacy < 0 && roll < 0.7) place('planter', lo + 0.75, 0.35, 1.1, 0.5);
  if (d.legacy < 0 && roll > 0.35) place('planter', hi - 0.75, 0.35, 1.1, 0.5);
  const bikes = d.legacy >= 0 ? (rand() < 0.45 ? 2 : 0) : rand() < 0.55 ? 1 + Math.floor(rand() * 3) : 0;
  for (let k = 0; k < bikes; k++) place('scooter', between(lo + 0.6, hi - 0.6), 1.45, 0.62, 1.75);
});

// Bamboo clumps in the back alleys between rows of houses.
for (const z of [-81.2, -29, 31.5, 82.2]) {
  for (let x = -128; x <= 128; x += 9) {
    const bx = x + between(-2.5, 2.5);
    if (rand() < 0.32 && ROADS_X.every((r) => Math.abs(bx - r) > 11) && rectDistance(PARK, bx, z) > 1.5 && rectDistance(SQUARE, bx, z) > 1.5 && spotFree(bx, z, 0.6, -1) && !insideAnyFull(bx, z, 0.4)) {
      addTree('bamboo', bx, z, between(0.85, 1.15));
    }
  }
}
for (let z = -95; z <= 95; z += 10) {
  for (const x of [-137.5]) if (rand() < 0.35 && spotFree(x, z, 0.6, -1) && !insideAnyFull(x, z, 0.4)) addTree('bamboo', x, z, between(0.9, 1.2));
}
// Bamboo never stands on a carriageway (the fence-line clump at (-137.5, -55) did): removed after the loops, with its
// trunk's collider, so the random sequence and everything placed above stay as they were.
for (let i = trees.length - 1; i >= 0; i--) {
  const t = trees[i];
  if (t.species !== 'bamboo' || !(ROADS_Z.some((r) => Math.abs(t.z - r) < 7) || (t.z > ROADS_Z[0] - 7 && ROADS_X.some((r) => Math.abs(t.x - r) < 7)))) continue;
  trees.splice(i, 1);
  const s = trunkSize(t), c = COLLIDERS.findIndex((r) => Math.abs(r.minX - (t.x - s / 2)) < 1e-6 && Math.abs(r.maxX - (t.x + s / 2)) < 1e-6 && Math.abs(r.minZ - (t.z - s / 2)) < 1e-6 && Math.abs(r.maxZ - (t.z + s / 2)) < 1e-6);
  if (c >= 0) COLLIDERS.splice(c, 1);
}

// Downtown on the river road by the Bạch Đằng pier, the river bus interchange: lines 08 and 15 call here on their way
// back west. Added after the rest of the scenery (with its seats and their paths), so nothing placed above moves.
{
  busStop('h', -108, -1, 180);
  const first = poiSpecs.length;
  seatsOf(busStops[busStops.length - 1], 'bus-stop', 0.7);
  for (let i = first; i < poiSpecs.length; i++) {
    const p = poiSpecs[i], c = pointClear(p.x, p.z) ? findCurb(p.x, p.z) : null;
    poiCurbs.push(c);
    if (c) segments.push([c.x, c.z, p.x, p.z]);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Street life (street-life.ts, npcs.ts, crowd-props.ts): quán cóc stools and low tables, cờ tướng boards,
// dưỡng sinh troupes, đá cầu rings and a chase track, a sidewalk karaoke, couples' and xe ôm scooters, giữ xe
// posts, doorstep stools, ông Địa altars and hawker stops. Placed after every other piece of scenery with its own
// random stream, so nothing above moves; its spots are appended to POIS and their paths join `segments`, so soft
// decoration keeps off them. Any scenery added later must go above this block.
// ---------------------------------------------------------------------------------------------------------

export type LifeSpot = { x: number; z: number; yaw: number };
export type LifeGroup = {
  id: number; kind: LifeKind; x: number; z: number; yaw: number;
  /** The building it belongs to (eateries, karaoke), else -1. */
  building: number;
  dish: Dish | null;
  /** When its furniture is out (stools are stacked otherwise); null: always. */
  hours: [number, number][] | null;
  /** Under an awning or a tarp, so it stays open in the rain. */
  covered: boolean;
  /** POI ids in slot order: the `seats` seats first, then places to stand (onlookers, troupe, ring, stage). */
  slots: number[]; seats: number;
  /** The table each slot sits at (eateries), else 0. */
  table: number[];
  tables: LifeSpot[];
  /** Where the cook stands at the pot, and where a vé số seller stops by the tables (eateries). */
  cook: LifeSpot | null; vend: LifeSpot | null;
  /** The chase track's radius, a ring's, or how far the scene spreads. */
  radius: number;
};
export type LifeFurnitureKind = 'stool' | 'table' | 'chess' | 'altar' | 'stand' | 'speaker' | 'stack';
/** Street furniture (crowd-props.ts draws it): `tint` is a colour index; with a `group` (else -1) it is out or stacked by the hour. */
export type LifeFurniture = { kind: LifeFurnitureKind; x: number; z: number; yaw: number; tint: number; group: number };
/** A giữ xe attendant's chair by a parking row, and when it is manned. */
export type LifePost = { x: number; z: number; yaw: number; curb: Point; hours: [number, number]; name: string };
export type HawkerStop = { x: number; z: number; yaw: number; curb: Point; axis: Axis; road: number; side: number };

/** The nightlife strip's six shophouses on the road at z = 54, in VENUES order (bar, karaoke, motel; club, spa, beer). */
function stripOf<T>(list: readonly T[], door: (t: T) => Point): { item: T; kind: VenueKind }[] {
  const strip = list.filter((t) => { const d = door(t); return d.x > 58 && d.x < 96 && Math.abs(d.z - 54) < 14; });
  const side = (north: boolean) => strip.filter((t) => (door(t).z > 54) === north).sort((a, b) => door(a).x - door(b).x);
  const order: [T[], VenueKind[]][] = [[side(true), ['bar', 'karaoke', 'motel']], [side(false), ['club', 'spa', 'beer']]];
  return order.flatMap(([row, kinds]) => row.slice(0, 3).map((item, i) => ({ item, kind: kinds[i] })));
}

const lifeGroups: LifeGroup[] = [];
const lifeFurniture: LifeFurniture[] = [];
const lifeAltars: (LifeSpot | null)[] = drafts.map(() => null);
const lifeDoorsteps: number[] = drafts.map(() => 0);
const hawkerStops: HawkerStop[] = [];
const lifePosts: LifePost[] = [];
{
  let lifeSeed = 77031;
  const lifeRand = () => { lifeSeed = (lifeSeed * 16807) % 2147483647; return (lifeSeed - 1) / 2147483646; };
  const placed: { x: number; z: number; r: number }[] = [];
  const lineDistance = (x: number, z: number) => Math.min(...LINES_Z.map((L) => Math.abs(z - L)), ...LINES_X.map((L) => Math.abs(x - L)));
  const edgeOf = (r: Rect, x: number, z: number) => (inRect(r, x, z) ? Math.min(x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z) : Infinity);
  const AREAS = [PARK, SQUARE, PLAZA, CITY_PARK, ...GARDENS];
  /** Whether a life item of half-size `half` fits at (x, z): off colliders, paths, walking lines, mission spots, lawn edges and other items. */
  function lifeFree(x: number, z: number, half: number, pad = 0.55) {
    if (!inRect(LAND, x, z, 1) || !pointClear(x, z, half + 0.05)) return false;
    if (KEEP_CLEAR.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) return false;
    if (benches.some((b) => Math.hypot(b.x - x, b.z - z) < 2.4) || busStops.some((b) => Math.hypot(b.x - x, b.z - z) < 3.8)) return false;
    if (CAFE_TABLES.some((t) => Math.hypot(t.x - x, t.z - z) < 3) || lineDistance(x, z) < half + pad) return false;
    for (const [ax, az, bx, bz] of segments) if (segmentDistance(x, z, ax, az, bx, bz) < half + pad) return false;
    if (AREAS.some((r) => edgeOf(r, x, z) < 1.5)) return false;
    return !placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + half + 0.05);
  }
  type Spot = { kind: PoiKind; x: number; z: number; yaw: number; seat: boolean; seatH?: number; via?: Point; r: number; curb?: Point };
  /** Fills each spot's curb (from its via when it has one); false if any has none. */
  const reach = (spots: Spot[]) => spots.every((s) => { const from = s.via ?? s; s.curb = findCurb(from.x, from.z) ?? undefined; return !!s.curb; });
  /** Adds the spots as POIs of group `gid` from slot `slot0` on, with their paths. */
  function addSpots(gid: number, slot0: number, spots: Spot[]) {
    spots.forEach((s, k) => {
      const via = s.via ? { x: r2(s.via.x), z: r2(s.via.z) } : undefined, c = s.curb!;
      poiSpecs.push({ kind: s.kind, x: r2(s.x), z: r2(s.z), yaw: r2(s.yaw), seat: s.seat, group: gid, slot: slot0 + k, seatH: s.seatH, via });
      poiCurbs.push(c);
      if (via) segments.push([c.x, c.z, via.x, via.z], [via.x, via.z, s.x, s.z]);
      else segments.push([c.x, c.z, s.x, s.z]);
      placed.push({ x: s.x, z: s.z, r: s.r });
    });
  }
  const furnish = (kind: LifeFurnitureKind, x: number, z: number, yaw: number, tint: number, group: number, r: number) => {
    lifeFurniture.push({ kind, x: r2(x), z: r2(z), yaw: r2(yaw), tint, group });
    placed.push({ x, z, r });
    segments.push([x, z, x, z]);
  };
  function group(g: Omit<LifeGroup, 'id' | 'slots' | 'seats' | 'table' | 'tables' | 'cook' | 'vend' | 'building' | 'dish' | 'hours' | 'covered'> & Partial<LifeGroup>, spots: Spot[], table: number[] = []) {
    const id = lifeGroups.length;
    const first = poiSpecs.length;
    addSpots(id, 0, spots);
    lifeGroups.push({
      building: -1, dish: null, hours: null, covered: false, tables: [], cook: null, vend: null, ...g,
      id, slots: spots.map((_, k) => first + k), seats: spots.filter((s) => s.seat).length, table: spots.map((_, k) => table[k] ?? 0),
    });
    return id;
  }
  /** Offsets round a seed, nearest first (up to `max` metres). */
  const around = (max: number) => {
    const out: [number, number][] = [[0, 0]];
    for (let r = 0.5; r <= max + 1e-9; r += 0.5) for (let a = 0; a < 16; a++) out.push([r2(r * Math.sin((a * PI) / 8)), r2(r * Math.cos((a * PI) / 8))]);
    return out;
  };
  /** The first place round a seed where `build` gives spots that all fit and reach a curb. */
  function search(x0: number, z0: number, max: number, build: (x: number, z: number) => Spot[] | null) {
    for (const [dx, dz] of around(max)) {
      const spots = build(x0 + dx, z0 + dz);
      if (spots && reach(spots)) return { x: x0 + dx, z: z0 + dz, spots };
    }
    return null;
  }
  const facingTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  const lateralOf = (f: number) => ({ c: Math.cos(f), s: Math.sin(f) });

  // Quán cóc: low tables and plastic stools out front of food places and cafés (and the bia hơi), a pot on a stand
  // for noodle shops, and a stack of stools by the wall for when they are closed.
  const venueOf = new Map(stripOf(drafts.map((_, i) => i).filter((i) => doors[i]), (i) => doors[i]!.door).map((v) => [v.item, v.kind]));
  const NOODLES = new Set<Dish>(['pho', 'bun', 'bunrieu', 'hutieu', 'chao', 'banhcanh']);
  drafts.forEach((d, i) => {
    const door = doors[i];
    const venue = venueOf.get(i);
    if (!door || (venue && venue !== 'beer')) return;
    if (!venue && !((d.kind === 'food' || d.kind === 'cafe') && ['legacy', 'home', 'shop', 'midrise'].includes(d.style))) return;
    const dish: Dish | null = venue ? 'bia' : dishOf(d.name);
    if (!dish) return;
    const { c, s } = lateralOf(d.entrance);
    // Along the facade is (cos, -sin) of the facing, out to the street (sin, cos); the wall is 0.8 behind the door.
    const at = (lat: number, out: number) => ({ x: door.door.x - s * 0.8 + c * lat + s * out, z: door.door.z - c * 0.8 - s * lat + c * out });
    const cap = dish === 'bia' ? 3 : ['pho', 'bun', 'cafe', 'com'].includes(dish) ? 2 : 1;
    const gid = lifeGroups.length, first = poiSpecs.length;
    const tint = Math.floor(lifeRand() * 5), tableTint = Math.floor(lifeRand() * 3);
    const tables: (LifeSpot & { lat: number; out: number })[] = [], table: number[] = [];
    let slots = 0;
    for (const lat of [2.4, -2.4, 3.6, -3.6, 4.8, -4.8]) {
      if (tables.length >= cap) break;
      for (const out of [1.75, 2.1, 1.45]) {
        const t = at(lat, out);
        if (!lifeFree(t.x, t.z, 0.42)) continue;
        const sign = lat > 0 ? 1 : -1;
        const stools: Spot[] = [];
        for (const [dl, dout] of [[-0.62, 0], [0.62, 0], [0, -0.6], [0, 0.6]]) {
          const p = at(lat + dl, out + dout);
          if (!lifeFree(p.x, p.z, 0.3)) continue;
          // From the wall side the way out goes round the table.
          const via = dout < 0 ? at(lat + 0.7 * sign, out + dout) : undefined;
          if (via && !lifeFree(via.x, via.z, 0.25)) continue;
          const spot: Spot = { kind: 'stool', x: p.x, z: p.z, yaw: facingTo(p.x, p.z, t.x, t.z), seat: true, seatH: 0.28, via, r: 0.3 };
          if (reach([spot])) stools.push(spot);
        }
        if (stools.length < 2) continue;
        const k = tables.length;
        tables.push({ x: r2(t.x), z: r2(t.z), yaw: d.entrance, lat, out });
        furnish('table', t.x, t.z, d.entrance, tableTint, gid, 0.42);
        for (const st of stools) { furnish('stool', st.x, st.z, st.yaw, tint, gid, 0.01); table.push(k); }
        addSpots(gid, slots, stools);
        slots += stools.length;
        break;
      }
    }
    if (!tables.length) return;
    let cook: LifeSpot | null = null;
    const side = tables[0].lat > 0 ? 1 : -1;
    if (NOODLES.has(dish)) {
      // A pot on a glass-fronted stand between the door and the tables; the cook stands behind it, facing the street.
      for (const lat of [1.35, 1.2, 1.55]) {
        const st = at(side * lat, 1.0), cs = at(side * lat, 0.42);
        const fits = [-0.3, 0, 0.3].every((o) => { const p = at(side * lat + o, 1.0); return pointClear(p.x, p.z, 0.22); }) && pointClear(cs.x, cs.z, 0.25)
          && !placed.some((p) => Math.hypot(p.x - st.x, p.z - st.z) < p.r + 0.4);
        if (!fits) continue;
        furnish('stand', st.x, st.z, d.entrance, 0, gid, 0.45);
        cook = { x: r2(cs.x), z: r2(cs.z), yaw: d.entrance };
        break;
      }
    }
    if (!cook && d.cart) {
      // A street-food cart in front: the cook stands behind it, facing the street.
      const cart = props.find((p) => p.kind === 'cart' && Math.hypot(p.x - door.door.x, p.z - door.door.z) < 4);
      if (cart) {
        const lat = (cart.x - door.door.x) * c - (cart.z - door.door.z) * s;
        const p = at(lat, 0.35);
        if (pointClear(p.x, p.z, 0.25)) cook = { x: r2(p.x), z: r2(p.z), yaw: d.entrance };
      }
    }
    // Stools stacked by the wall behind each table while closed.
    tables.forEach((t) => {
      const p = at(t.lat, 0.35);
      const free = pointClear(p.x, p.z, 0.24) && !placed.some((q) => q.r > 0.05 && Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.2);
      furnish('stack', free ? p.x : t.x, free ? p.z : t.z, d.entrance, tint, gid, free ? 0.22 : 0.01);
    });
    // Where a vé số seller stops: a step off the first table's street side.
    const v = at(tables[0].lat, tables[0].out + 1.25);
    const vend = pointClear(v.x, v.z, 0.3) && lineDistance(v.x, v.z) > 0.6 ? { x: r2(v.x), z: r2(v.z), yaw: d.entrance + PI } : null;
    lifeGroups.push({
      id: gid, kind: dish === 'bia' ? 'beer' : 'eatery', x: r2(at(0, 1.75).x), z: r2(at(0, 1.75).z), yaw: d.entrance, building: i, dish, hours: MENU[dish],
      covered: d.style === 'legacy' || d.style === 'shop' || dish === 'bia', slots: Array.from({ length: slots }, (_, k) => first + k), seats: slots, table,
      tables: tables.map(({ x, z, yaw }) => ({ x, z, yaw })), cook, vend, radius: 4,
    });
  });

  // Dưỡng sinh: a leader out front facing two rows of four (1.5 m apart) in the park, the square and on the promenade.
  // People standing on open ground may stand by a path (pad 0.1), just not on it.
  for (const [x0, z0, yaw] of [[30, -40.5, 0], [-24, -124.5, PI], [56, -124.5, PI], [29, 37, 0], [244.5, 75.5, 0]]) {
    const found = search(x0, z0, 5, (x, z) => {
      const f = forward(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
      const lead = { x: x + f.x * 3.35, z: z + f.z * 3.35 };
      const spots: Spot[] = [{ kind: 'exercise', x: lead.x, z: lead.z, yaw: yaw + PI, seat: false, r: 0.42 }];
      for (const row of [0.75, -0.75]) for (const col of [-2.25, -0.75, 0.75, 2.25]) spots.push({ kind: 'exercise', x: x + f.x * row + lx * col, z: z + f.z * row + lz * col, yaw, seat: false, r: 0.42 });
      return spots.every((p) => lifeFree(p.x, p.z, 0.42, 0.1)) ? spots : null;
    });
    if (found) group({ kind: 'exercise', x: r2(found.x), z: r2(found.z), yaw, radius: 4 }, found.spots);
  }

  // Đá cầu: four kids round a ring in the school yard, the square and the plaza.
  for (const [x0, z0, R] of [[27, 123, 1.7], [24, 123.4, 1.6], [21, 36, 1.9], [33.5, 40.5, 1.9], [242, 20, 2]]) {
    const found = search(x0, z0, 6, (x, z) => {
      const spots: Spot[] = [0, 1, 2, 3].map((k) => { const a = (k * PI) / 2 + 0.4; return { kind: 'ring' as const, x: x + R * Math.sin(a), z: z + R * Math.cos(a), yaw: a + PI, seat: false, r: 0.3 }; });
      return pointClear(x, z, 0.3) && spots.every((p) => lifeFree(p.x, p.z, 0.3, 0.1)) ? spots : null;
    });
    if (found) group({ kind: 'ring', x: r2(found.x), z: r2(found.z), yaw: 0, radius: R }, found.spots);
  }

  // Cờ tướng: a board on a low table, a stool either side and room for onlookers.
  for (const [x0, z0] of [[27, 31.5], [-44, -121.5], [-20, -121.5], [30, -121.5], [131, 129], [-124, 134]]) {
    const found = search(x0, z0, 4, (x, z) => {
      if (!lifeFree(x, z, 0.5)) return null;
      const spots: Spot[] = [
        { kind: 'chess', x: x - 0.65, z, yaw: PI / 2, seat: true, seatH: 0.28, r: 0.3 },
        { kind: 'chess', x: x + 0.65, z, yaw: -PI / 2, seat: true, seatH: 0.28, r: 0.3 },
      ];
      for (const [kx, kz] of [[0, 1.0], [-0.9, -1.0], [0.9, -1.0]]) spots.push({ kind: 'kibitz', x: x + kx, z: z + kz, yaw: facingTo(x + kx, z + kz, x, z), seat: false, r: 0.3 });
      return spots.every((p) => lifeFree(p.x, p.z, 0.3)) ? spots : null;
    });
    if (!found) continue;
    const id = group({ kind: 'chess', x: r2(found.x), z: r2(found.z), yaw: 0, radius: 1.6 }, found.spots);
    furnish('chess', found.x, found.z, 0, 0, id, 0.5);
    for (const p of found.spots.slice(0, 2)) furnish('stool', p.x, p.z, p.yaw, 1, id, 0.01);
  }

  // Chase: kids running round the fountains (the track must be clear all the way round).
  for (const [cx, cz] of [[28, -33], [243, 27]]) {
    let radius = 0;
    for (let r = 5.3; r <= 6.5 + 1e-9 && !radius; r += 0.2) {
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) ok = pointClear(cx + r * Math.sin((k * PI) / 12), cz + r * Math.cos((k * PI) / 12), 0.4);
      if (ok) radius = r2(r);
    }
    if (!radius) continue;
    const spots: Spot[] = [];
    for (let k = 0; k < 16 && spots.length < 4; k++) {
      const a = (k * PI) / 8 + PI / 16, x = cx + radius * Math.sin(a), z = cz + radius * Math.cos(a);
      const spot: Spot = { kind: 'ring', x, z, yaw: a + PI / 2, seat: false, r: 0.3 };
      if (spots.every((p) => Math.hypot(p.x - x, p.z - z) > 3) && lifeFree(x, z, 0.3) && reach([spot])) spots.push(spot);
    }
    if (spots.length >= 3) group({ kind: 'chase', x: cx, z: cz, yaw: 0, radius }, spots);
  }

  // Sidewalk karaoke in front of a house near the market lane: a loudspeaker, the singer, stools for the audience.
  {
    const homes = drafts.map((d, i) => ({ d, i })).filter(({ d, i }) => doors[i] && d.kind === 'home' && (d.style === 'home' || d.style === 'legacy') && Math.abs(doors[i]!.door.x) < 100);
    homes.sort((a, b) => Math.hypot(doors[a.i]!.door.x, doors[a.i]!.door.z - 54) - Math.hypot(doors[b.i]!.door.x, doors[b.i]!.door.z - 54));
    for (const { d, i } of homes) {
      const door = doors[i]!.door, { c, s } = lateralOf(d.entrance);
      const at = (lat: number, out: number) => ({ x: door.x - s * 0.8 + c * lat + s * out, z: door.z - c * 0.8 - s * lat + c * out });
      const speaker = at(2.2, 0.5), stage = at(2.2, 1.9);
      if (!lifeFree(speaker.x, speaker.z, 0.3) || !lifeFree(stage.x, stage.z, 0.35)) continue;
      const seats: Spot[] = [];
      for (const lat of [-0.6, -1.4, -2.2, -3.0]) {
        const p = at(lat, 1.8);
        const spot: Spot = { kind: 'stool', x: p.x, z: p.z, yaw: Math.atan2(c, -s), seat: true, seatH: 0.28, r: 0.3 };
        if (lifeFree(p.x, p.z, 0.3) && reach([spot])) seats.push(spot);
      }
      const singer: Spot = { kind: 'stage', x: stage.x, z: stage.z, yaw: Math.atan2(-c, s), seat: false, r: 0.35 };
      if (seats.length < 3 || !reach([singer])) continue;
      const id = group({ kind: 'karaoke', x: r2(stage.x), z: r2(stage.z), yaw: d.entrance, building: i, hours: [[19, 23]], radius: 3 }, [...seats, singer]);
      furnish('speaker', speaker.x, speaker.z, Math.atan2(-c, s), 0, -1, 0.3);
      for (const p of seats) furnish('stool', p.x, p.z, p.yaw, 3, id, 0.01);
      break;
    }
  }

  /** A parked scooter someone sits on (its saddle 0.25 m behind the centre), reached from beside it at `via`. */
  function perch(cx: number, cz: number, yaw: number, viaX: number, viaZ: number): Spot | null {
    const along = Math.abs(Math.sin(yaw)) > 0.5, sx = along ? 1.75 : 0.62, sz = along ? 0.62 : 1.75;
    const box = rectAt(cx, cz, sx + 0.1, sz + 0.1);
    if (!inRect(LAND, cx, cz, 1) || COLLIDERS.some((q) => box.minX < q.maxX && box.maxX > q.minX && box.minZ < q.maxZ && box.maxZ > q.minZ)) return null;
    if (lineDistance(cx, cz) < 1.0 || KEEP_CLEAR.some((p) => Math.hypot(p.x - cx, p.z - cz) < 2.6) || placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + 0.95)) return null;
    if (!lifeFree(viaX, viaZ, 0.25)) return null;
    const f = forward(yaw);
    return { kind: 'perch', x: cx - f.x * 0.25, z: cz - f.z * 0.25, yaw, seat: true, seatH: 0.8, via: { x: viaX, z: viaZ }, r: 0.5 };
  }
  const park = (s: Spot, yaw: number) => {
    const f = forward(yaw), along = Math.abs(f.x) > 0.5;
    const cx = s.x + f.x * 0.25, cz = s.z + f.z * 0.25;
    addProp('scooter', r2(cx), r2(cz), along ? 1.75 : 0.62, along ? 0.62 : 1.75, yaw, r2(lifeRand()));
  };

  // Couples on their scooters by the river at night, side by side, facing the water.
  for (const x0 of [-40, -4, 32]) {
    for (const dx of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const x = x0 + dx, z = -129.6;
      // Two scooters side by side, each got onto from behind its outer side (so the way to the curb clears the other).
      const a = perch(x - 0.48, z, PI, x - 1.23, z + 1.25), b = a && perch(x + 0.48, z, PI, x + 1.23, z + 1.25);
      if (!a || !b || !reach([a, b])) continue;
      park(a, PI);
      park(b, PI);
      group({ kind: 'couple', x, z, yaw: PI, hours: [[19, 23.5]], radius: 1 }, [a, b]);
      break;
    }
  }

  // Xe ôm: drivers waiting on their scooters at street corners, facing the junction.
  for (const [x0, z0, yaw, n] of [[10.6, -10.9, -PI / 2, 2], [97.4, -10.9, PI / 2, 2], [-10.6, 118.9, PI / 2, 1], [-64.6, -118.9, PI / 2, 1]] as const) {
    const out = Math.sign(z0 - Math.round(z0 / 54) * 54) || 1;
    for (const dx of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4]) {
      const x = x0 + dx;
      const spots: Spot[] = [];
      for (let k = 0; k < n; k++) {
        const z = z0 + out * 0.95 * k;
        // The way on and off is on the open side: toward the road for the first, away from it for the second.
        const viaZ = k === 0 ? z - out * 0.75 : z + out * 0.75;
        const p = perch(x, z, yaw, x + forward(yaw).x * -0.25, viaZ);
        if (!p) break;
        spots.push(p);
      }
      if (spots.length < n || !reach(spots)) continue;
      for (const p of spots) park(p, yaw);
      group({ kind: 'xeom', x: r2(x), z: z0, yaw, hours: [[6, 21]], radius: 1.5 }, spots);
      break;
    }
  }

  // Giữ xe posts: an attendant's chair at the end of a parking row (hospital, school gate, market lane, nightlife strip).
  for (const [x0, z0, name, from, to] of [[117.8, -22, 'BỆNH VIỆN', 6, 21], [19.5, 118.4, 'TRƯỜNG HỌC', 6.3, 17.5], [-25.5, 30.6, 'CHỢ', 5.5, 18.5], [62.2, 64.8, 'PHỐ ĐÊM', 18.5, 1.5]] as const) {
    const kerb = (x: number, z: number) => !ROADS_Z.some((r) => Math.abs(z - r) < CARRIAGE_HALF + 0.9) && !(z > V_ROAD_START - CARRIAGE_HALF && ROADS_X.some((r) => Math.abs(x - r) < CARRIAGE_HALF + 0.9));
    const found = search(x0, z0, 3, (x, z) => (lifeFree(x, z, 0.3) && kerb(x, z) ? [{ kind: 'stool' as const, x, z, yaw: 0, seat: true, r: 0.35 }] : null));
    if (!found) continue;
    const s = found.spots[0];
    // Facing the street (the nearest walking line).
    const lx = LINES_X.reduce((a, b) => (Math.abs(b - s.x) < Math.abs(a - s.x) ? b : a)), lz = LINES_Z.reduce((a, b) => (Math.abs(b - s.z) < Math.abs(a - s.z) ? b : a));
    const yaw = Math.abs(lx - s.x) < Math.abs(lz - s.z) ? (lx > s.x ? PI / 2 : -PI / 2) : lz > s.z ? 0 : PI;
    lifePosts.push({ x: r2(s.x), z: r2(s.z), yaw, curb: s.curb!, hours: [from, to], name });
    placed.push({ x: s.x, z: s.z, r: 0.35 });
    segments.push([s.curb!.x, s.curb!.z, s.x, s.z]);
  }

  // Doorstep stools beside house doors (the side that is clear), then an ông Địa altar beside each shop door.
  drafts.forEach((d, i) => {
    const door = doors[i];
    if (!door || !['legacy', 'home', 'shop'].includes(d.style)) return;
    const { c, s } = lateralOf(d.entrance);
    const at = (lat: number, out: number) => ({ x: door.door.x - s * 0.8 + c * lat + s * out, z: door.door.z - c * 0.8 - s * lat + c * out });
    for (const side of [1, -1]) {
      const p = at(side, 0.35);
      if (pointClear(p.x, p.z, 0.32) && !placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.3)) {
        lifeDoorsteps[i] = side;
        placed.push({ x: p.x, z: p.z, r: 0.3 });
        break;
      }
    }
  });
  drafts.forEach((d, i) => {
    const door = doors[i];
    if (!door || !['shop', 'food', 'cafe', 'bikeshop'].includes(d.kind) || !['legacy', 'home', 'shop', 'midrise'].includes(d.style) || venueOf.has(i)) return;
    const { c, s } = lateralOf(d.entrance);
    const at = (lat: number, out: number) => ({ x: door.door.x - s * 0.8 + c * lat + s * out, z: door.door.z - c * 0.8 - s * lat + c * out });
    for (const lat of [-1.15, 1.15, -1.6, 1.6]) {
      const p = at(lat, 0.3);
      if (!pointClear(p.x, p.z, 0.2) || placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.22)) continue;
      lifeAltars[i] = { x: r2(p.x), z: r2(p.z), yaw: d.entrance };
      furnish('altar', p.x, p.z, d.entrance, 0, -1, 0.2);
      break;
    }
  });

  // Hawker stops on the sidewalk by the curb, every 6 m, clear of junctions and bus stops (not on the river side).
  for (const axis of ['h', 'v'] as Axis[]) {
    for (const road of axis === 'h' ? ROADS_Z : ROADS_X) {
      for (const side of [-1, 1]) {
        if (axis === 'h' && road === V_ROAD_START && side < 0) continue;
        const from = axis === 'h' ? LAND.minX + 6 : V_ROAD_START + 14, to = axis === 'h' ? LAND.maxX - 6 : LAND.maxZ - 6;
        for (let along = from; along <= to; along += 6) {
          if ((axis === 'h' ? ROADS_X : ROADS_Z).some((r) => Math.abs(along - r) < 14)) continue;
          const x = axis === 'h' ? along : road + side * 7.75, z = axis === 'h' ? road + side * 7.75 : along;
          const cx = axis === 'h' ? along : road + side * SIDEWALK, cz = axis === 'h' ? road + side * SIDEWALK : along;
          if (!pointClear(x, z, 0.45) || !pointClear(cx, cz) || busStops.some((b) => Math.hypot(b.x - x, b.z - z) < 3.8) || KEEP_CLEAR.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
          if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.6)) continue;
          const yaw = axis === 'h' ? (side > 0 ? 0 : PI) : side > 0 ? HALF_PI : -HALF_PI;
          hawkerStops.push({ x: r2(x), z: r2(z), yaw, curb: { x: r2(cx), z: r2(cz) }, axis, road, side });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Street dressing (spec-streets): concrete power poles in An Hòa's curb bands (world.ts hangs the cable bundles
// between consecutive poles of a line), green wheelie bins at street corners and vé số cases where people pass.
// Placed after street life with its own random stream, so every table above (doors, POIs, life) stays as it was;
// everything keeps clear of colliders, walking lines, door and POI paths (street-life furniture included), hawker
// stops, doorstep stools, giữ xe chairs and the gameplay rings. parking.ts places its rows round these colliders.
// ---------------------------------------------------------------------------------------------------------

/** A power pole; consecutive poles of one `line` carry the cables (map/gen/dressing.ts Pole without its key). */
export type Pole = { x: number; z: number; yaw: number; line: string; main: boolean; transformer: boolean };
const poles: Pole[] = [];
{
  let dressSeed = 53117;
  const dressRand = () => { dressSeed = (dressSeed * 16807) % 2147483647; return (dressSeed - 1) / 2147483646; };
  const stoops = drafts.flatMap((d, i) => {
    const side = lifeDoorsteps[i], door = doors[i];
    if (!side || !door) return [];
    const c = Math.cos(d.entrance), s = Math.sin(d.entrance);
    return [{ x: door.door.x - s * 0.8 + c * side + s * 0.35, z: door.door.z - c * 0.8 - s * side + c * 0.35 }];
  });
  /** spotFree plus the street-life spots that are not paths: hawker stops, giữ xe chairs, doorstep stools. */
  const dressFree = (x: number, z: number, half: number) =>
    inRect(LAND, x, z, 1) && spotFree(x, z, half)
    && !hawkerStops.some((h) => Math.hypot(h.x - x, h.z - z) < 1.2 + half)
    && !lifePosts.some((p) => Math.hypot(p.x - x, p.z - z) < 1.0 + half)
    && !stoops.some((p) => Math.hypot(p.x - x, p.z - z) < 0.8 + half)
    && !lifeFurniture.some((f) => Math.hypot(f.x - x, f.z - z) < 0.7 + half);

  // Poles 7.6 m from the centre line (the walking line keeps 0.8 m), 14 m clear of crossing roads (signal poles,
  // crosswalks) and off the trees and lamps of their side: on a street's main side one near each end of every block
  // (spans of 22-32 m, the cables crossing the junctions), on the other side one per block for the telecom bundle.
  const POLE_OFFSET = 7.6;
  const line = (axis: Axis, road: number, side: number, main: boolean) => {
    const crossing = axis === 'h' ? ROADS_X : ROADS_Z;
    const from = axis === 'h' ? LAND.minX + 3 : V_ROAD_START + 14, to = axis === 'h' ? DOWNTOWN_X - 2 : LAND.maxZ - 3;
    const off = road + side * POLE_OFFSET;
    const sameSide = (p: { x: number; z: number }) => Math.abs((axis === 'h' ? p.z : p.x) - road - side * 9.4) < 1.2;
    const alongOf = (p: { x: number; z: number }) => (axis === 'h' ? p.x : p.z);
    const sideTrees = trees.filter(sameSide), sideLamps = lamps.filter(sameSide);
    const fits = (along: number) => {
      if (crossing.some((r) => Math.abs(along - r) < 14)) return false;
      if (sideTrees.some((t) => Math.abs(alongOf(t) - along) < 2) || sideLamps.some((l) => Math.abs(alongOf(l) - along) < 1.8)) return false;
      return dressFree(axis === 'h' ? along : off, axis === 'h' ? off : along, 0.15);
    };
    /** The first spot that fits walking from `start` by `dir` for up to `reach` metres. */
    const seek = (start: number, dir: number, reach: number) => {
      for (let d = 0; d <= reach; d += 0.5) if (fits(start + dir * d)) return start + dir * d;
      return null;
    };
    const cuts = [from - 14, ...crossing.filter((r) => r > from && r < to), to + 14];
    const spots: number[] = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = Math.max(from, cuts[k] + 14), b = Math.min(to, cuts[k + 1] - 14);
      if (b < a) continue;
      if (main && b - a >= 18) {
        const first = seek(a, 1, (b - a) / 2 - 4), second = seek(b, -1, first === null ? b - a : b - first - 14);
        if (first !== null) spots.push(first);
        if (second !== null) spots.push(second);
      } else {
        const mid = seek((a + b) / 2, 1, (b - a) / 2) ?? seek((a + b) / 2, -1, (b - a) / 2);
        if (mid !== null) spots.push(mid);
      }
    }
    const yaw = axis === 'h' ? (side > 0 ? PI : 0) : side > 0 ? -HALF_PI : HALF_PI;
    const placed: Pole[] = spots.map((along) => ({ x: r2(axis === 'h' ? along : off), z: r2(axis === 'h' ? off : along), yaw, line: `${axis}${road}:${side}`, main, transformer: false }));
    // Every fifth main pole carries a transformer, where the line runs on to the next pole.
    placed.forEach((p, k) => {
      const next = placed[k + 1];
      p.transformer = main && k % 5 === 2 && !!next && Math.hypot(next.x - p.x, next.z - p.z) < 30;
      addProp('pole', p.x, p.z, 0.3, 0.3, p.yaw, r2(dressRand()));
      poles.push(p);
    });
  };
  ROADS_Z.forEach((road, i) => {
    const main = road === V_ROAD_START ? 1 : i % 2 ? -1 : 1;
    line('h', road, main, true);
    if (road !== V_ROAD_START) line('h', road, -main, false);
  });
  ROADS_X.filter((r) => r < DOWNTOWN_X - 1).forEach((road, i) => {
    const main = i % 2 ? 1 : -1;
    line('v', road, main, true);
    line('v', road, -main, false);
  });

  // Wheelie bins (240 l, green or orange) tucked into street corners, short of the parking band, and not where E
  // would open a nightlife door instead (the strip's door rings, 1.6 m out from the door, 2.6 m round).
  const venueRings = stripOf(drafts.map((_, i) => i).filter((i) => doors[i]), (i) => doors[i]!.door).filter((v) => v.kind !== 'beer')
    .map((v) => { const e = forward(drafts[v.item].entrance), d = doors[v.item]!.door; return { x: d.x + e.x * 1.6, z: d.z + e.z * 1.6 }; });
  for (const rx of ROADS_X) for (const rz of ROADS_Z) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (rz === V_ROAD_START && sz < 0) continue;
    if (dressRand() > 0.35) continue;
    let ringed = false;
    for (const [ox, oz] of [[11.2, 11.2], [11.6, 10.8], [10.8, 11.6], [11.9, 11.2], [11.2, 11.9]]) {
      const x = rx + sx * ox, z = rz + sz * oz;
      if (!dressFree(x, z, 0.35)) continue;
      if (venueRings.some((v) => Math.hypot(v.x - x, v.z - z) < 2.9)) { ringed = true; continue; }
      addProp('bin', r2(x), r2(z), 0.7, 0.7, sz > 0 ? PI : 0, r2(dressRand()));
      ringed = false;
      break;
    }
    // A corner given up for a door ring still draws its tint, so the bins and cases after it stay as they were.
    if (ringed) dressRand();
  }

  // Vé số sellers' glass cases where people pass: the market lane, the square, the pagoda gate, by the river docks.
  // On the kerb band, never on the carriageway (0.9 m clear of the asphalt edge).
  const onRoad = (x: number, z: number) => ROADS_Z.some((r) => Math.abs(z - r) < CARRIAGE_HALF + 0.9) || (z > V_ROAD_START - CARRIAGE_HALF && ROADS_X.some((r) => Math.abs(x - r) < CARRIAGE_HALF + 0.9));
  for (const [x0, z0, yaw] of [[-45.9, 27, HALF_PI], [-12.5, 36, -HALF_PI], [16.5, 45.4, PI], [-44, 117.5, PI], [-8.6, 117.5, PI], [-76, -120, 0], [8, -120, 0], [45.4, 63.5, HALF_PI]] as const) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [1.5, 1], [-1.5, -1]]) {
      const x = x0 + dx, z = z0 + dz;
      if (!dressFree(x, z, 0.35) || onRoad(x, z) || venueRings.some((v) => Math.hypot(v.x - x, v.z - z) < 3.4)) continue;
      const across = Math.abs(Math.sin(yaw)) > 0.5;
      addProp('lottery', r2(x), r2(z), across ? 0.5 : 0.6, across ? 0.6 : 0.5, yaw, r2(dressRand()));
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Final data.
// ---------------------------------------------------------------------------------------------------------

/** House numbers along each street: odd on one side, even on the other. */
const numbers = new Map<number, number>();
{
  const byStreet = new Map<string, number[]>();
  drafts.forEach((d, i) => {
    if (!d.street) return;
    const key = `${d.street.axis}:${d.street.road}:${d.street.side}`;
    if (!byStreet.has(key)) byStreet.set(key, []);
    byStreet.get(key)!.push(i);
  });
  for (const [key, list] of byStreet) {
    const axis = key[0];
    list.sort((a, b) => (axis === 'h' ? drafts[a].full.minX - drafts[b].full.minX : drafts[a].full.minZ - drafts[b].full.minZ));
    const odd = key.endsWith(':-1');
    list.forEach((i, k) => numbers.set(i, k * 2 + (odd ? 1 : 2) + (Math.abs(drafts[i].street!.road) === 108 ? 40 : 0)));
  }
}

// Residents (~96) and jobs (~72) across the city; apartment towers come with their own residents and the
// downtown towers with their own jobs.
{
  const homes = drafts.filter((d) => d.kind === 'home' && (d.style === 'home' || d.style === 'legacy'));
  homes.forEach((d) => { d.residents = 1; });
  drafts.filter((d) => d.kind === 'home' && d.style === 'midrise').forEach((d) => { d.residents = 2; });
  const shops = drafts.filter((d) => ['shop', 'cafe', 'food', 'bikeshop', 'hotel'].includes(d.kind) && d.style !== 'kiosk');
  let extra = 96 - drafts.reduce((sum, d) => sum + d.residents, 0);
  const families = homes.filter((_, k) => k % 5 === 2);
  for (const d of families) if (extra > 8) { d.residents = 2; extra--; }
  for (let k = 0; k < shops.length && extra > 0; k += 2) { shops[k].residents = 1; extra--; }
  for (let k = 1; k < shops.length && extra > 0; k += 2) { shops[k].residents = 1; extra--; }
  const fixed: [BuildingKind, number][] = [['post', 2], ['gunstore', 1], ['bikeshop', 1]];
  for (const [kind, jobs] of fixed) drafts.filter((d) => d.kind === kind).forEach((d) => { d.jobs = jobs; });
  // The two Cô Ba cafés that the delivery mission uses are the busiest.
  drafts.filter((d) => d.kind === 'cafe' && d.legacy >= 0 && (d.legacy === 3 || d.legacy === 13)).forEach((d) => { d.jobs = 2; });
  let jobs = drafts.reduce((sum, d) => sum + d.jobs, 0);
  const employers = drafts.filter((d) => ['shop', 'cafe', 'food', 'hotel', 'office'].includes(d.kind) && d.jobs === 0);
  for (let k = 0; k < employers.length && jobs < 72; k += 2) { employers[k].jobs = 1; jobs++; }
  for (let k = 1; k < employers.length && jobs < 72; k += 2) { employers[k].jobs = 1; jobs++; }
}

export const BUILDINGS: Building[] = [];
export const PLOTS: Plot[] = [];
const house = (d: Draft) => d.kind === 'home' && (d.style === 'home' || d.style === 'legacy');
drafts.forEach((d, i) => {
  const door = doors[i];
  if (!door) throw new Error(`city: no door for building ${i} (${d.name})`);
  const f = d.full;
  const sideways = Math.abs(forward(d.entrance).x) > 0.5;
  const sx = f.maxX - f.minX, sz = f.maxZ - f.minZ;
  const number = numbers.get(i) ?? 0;
  const id = BUILDINGS.length;
  BUILDINGS.push({
    id, x: r2((f.minX + f.maxX) / 2), z: r2((f.minZ + f.maxZ) / 2), w: r2(sideways ? sz : sx), d: r2(sideways ? sx : sz), h: d.h,
    facing: d.entrance, name: house(d) ? `NHÀ SỐ ${number}` : d.name, subtitle: house(d) || d.cart ? `${number} ${d.subtitle}` : d.subtitle,
    kind: d.kind, color: d.color, door: door.door, curb: door.curb, residents: d.residents, jobs: d.jobs,
  });
  PLOTS.push({ id, style: d.style, full: f, ground: grounds[i], h: d.h, facing: d.facing, legacy: d.legacy, sign: d.sign, signColor: d.signColor, number, row: d.row, seed: d.seed, tower: d.tower });
});

export const POIS: Poi[] = [];
poiSpecs.forEach((p, i) => {
  const curb = poiCurbs[i];
  if (!curb) throw new Error(`city: no curb for ${p.kind} at ${p.x}, ${p.z}`);
  // Street-life fields stay undefined on the other POIs.
  POIS.push({ id: POIS.length, kind: p.kind, x: p.x, z: p.z, yaw: p.yaw, curb, seat: p.seat, group: p.group, slot: p.slot, seatH: p.seatH, via: p.via });
});

export const LAMPS: Point[] = lamps.map((l) => ({ x: l.hx, z: l.hz }));
const byName = (name: string) => BUILDINGS.find((b) => b.name === name)!;
export const LANDMARKS: { hospital: Point; police: Point; tower: Building; bank: Building } = {
  hospital: { ...BUILDINGS[drafts.indexOf(hospital)].door },
  police: { ...BUILDINGS[drafts.indexOf(police)].door },
  /** The supertall with the observation deck (and the parachute jump). */
  tower: byName('THÁP PHƯƠNG NAM'),
  bank: byName('NGÂN HÀNG PHƯƠNG NAM'),
};

/** Everything world.ts draws that is not a building; solid items here are already in COLLIDERS. */
export const SCENERY = {
  trees, lamps, props, benches, busStops, tables: CAFE_TABLES, poles,
  park: PARK, square: SQUARE, gardens: GARDENS, yards: YARDS,
  promenade: PROMENADE,
  plaza: PLAZA, cityPark: CITY_PARK, docks: DOCKS,
};

/**
 * Street life (see the block above Final data): groups with their POIs in slot order, the furniture to draw, the
 * altar and doorstep stool of each building (by id), hawkers' stops on the curb band and the giữ xe posts.
 */
export const LIFE = { groups: lifeGroups, furniture: lifeFurniture, altars: lifeAltars, doorsteps: lifeDoorsteps, hawkerStops, posts: lifePosts };

// ---- The nightlife strip ("phố đèn đỏ"): the six shophouses on the road at z = 54, east of x = 54 (looks: VENUE_LOOKS). ----
export type Venue = { kind: VenueKind; building: Building; door: Point; name: string; neon: string };
/** The venues west to east: bar, karaoke and motel face the road from the north, club, spa and beer from the south. */
export const VENUES: Venue[] = [];
for (const { item: b, kind } of stripOf(BUILDINGS, (b) => b.door)) {
  const look = VENUE_LOOKS[kind];
  b.name = look.name;
  b.subtitle = look.subtitle;
  PLOTS[b.id].signColor = look.neon;
  VENUES.push({ kind, building: b, door: { ...b.door }, name: look.name, neon: look.neon });
}
