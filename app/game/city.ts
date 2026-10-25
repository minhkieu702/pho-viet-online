/**
 * Layout data for the city: the An Hòa neighbourhood, the downtown district east of it, the river along the
 * north, roads, buildings with their doors, places people visit, street lamps and every collider. Pure and
 * deterministic (seeded), so gameplay, pedestrian routines and the renderer in world.ts all agree on the same
 * city. No three.js in here.
 */

/** North-south road centre lines (x). The four east of 108 run through downtown. Roads are 20 m wide, asphalt 14 m. */
export const ROADS_X = [-108, -54, 0, 54, 108, 162, 216, 270, 324];
/** East-west road centre lines (z); they cross the whole map, An Hòa and downtown alike. */
export const ROADS_Z = [-108, -54, 0, 54, 108];
export const SIDEWALK = 8.4; // pedestrians walk on lines at road centre ± 8.4
/** Dry land inside the fences: An Hòa (x -135..135) and downtown (x 135..351). The river lies north of it. */
export const LAND: Rect = { minX: -138, maxX: 352, minZ: -135, maxZ: 137.5 };
/** Open water from the promenade wall to the far bank's wall, between the buoy lines at either end. */
export const RIVER: Rect = { minX: -138, maxX: 352, minZ: -203.6, maxZ: -137.6 };
/** Everything the player can reach. */
export const PLAY: Rect = { minX: LAND.minX, maxX: LAND.maxX, minZ: RIVER.minZ, maxZ: LAND.maxZ };
export const WATER_LEVEL = -0.8;
export const RIVER_BED = -2.8;
/** Where downtown ("Quận Trung Tâm") begins, east of An Hòa. */
export const DOWNTOWN_X = 135;
/** Whether (x, z) lies inside `r`, at least `margin` from its edges. */
export function inRect(r: Rect, x: number, z: number, margin = 0) {
  return x >= r.minX + margin && x <= r.maxX - margin && z >= r.minZ + margin && z <= r.maxZ - margin;
}

export type BuildingKind = 'home' | 'shop' | 'cafe' | 'food' | 'office' | 'school' | 'hospital' | 'police' | 'post' | 'gunstore' | 'bikeshop' | 'pagoda'
  | 'bank' | 'mall' | 'hotel' | 'theatre';
export type Point = { x: number; z: number };
export type Building = {
  id: number; x: number; z: number; w: number; d: number; h: number; facing: number;
  name: string; subtitle: string; kind: BuildingKind; color: string;
  door: Point; curb: Point; residents: number; jobs: number;
};
export type PoiKind = 'park' | 'square' | 'market' | 'cafe-seat' | 'bench' | 'bus-stop' | 'pagoda-yard' | 'school-yard';
export type Poi = { id: number; kind: PoiKind; x: number; z: number; yaw: number; curb: Point; seat: boolean };

/** Axis-aligned footprint; the same shape as world.ts' Collider. */
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number;
  /** Height of a low solid (a planter, a stall counter) a falling body can land on; walls without one are infinitely tall. */
  top?: number };
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
export type PropKind = 'fountain' | 'stall' | 'fence' | 'wall' | 'pillar' | 'urn' | 'stupa' | 'flagpole' | 'shelter' | 'planter' | 'scooter' | 'cart';
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

/** True when a circle of `radius` can slide along the straight segment without touching a collider (sampled every 0.25 m). */
export function segmentClear(ax: number, az: number, bx: number, bz: number, radius = PED) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!pointClear(ax + (bx - ax) * t, az + (bz - az) * t, radius)) return false;
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

// New rows of tube houses facing the roads, in attached groups with alleys between them.
const STREETS_H = new Map([[-108, 'ĐƯỜNG BỜ SÔNG'], [-54, 'ĐƯỜNG HOA SỮA'], [0, 'ĐƯỜNG AN HÒA'], [54, 'ĐƯỜNG PHƯỢNG VĨ'], [108, 'ĐƯỜNG CHỢ CŨ']]);
const STREETS_V = new Map([[-108, 'ĐƯỜNG TRE XANH'], [-54, 'ĐƯỜNG BÀNG LĂNG'], [0, 'ĐƯỜNG TRUNG TÂM'], [54, 'ĐƯỜNG BƯU ĐIỆN'], [108, 'ĐƯỜNG BỆNH VIỆN'],
  [162, 'ĐƯỜNG ĐỒNG KHỞI'], [216, 'ĐẠI LỘ NGUYỄN HUỆ'], [270, 'ĐƯỜNG HÀM NGHI'], [324, 'ĐƯỜNG TÔN ĐỨC THẮNG']]);
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
const PROP_TOP: Partial<Record<PropKind, number>> = { fountain: 0.6, planter: 0.5, stall: 1.75, fence: 1.6, urn: 1.6, scooter: 1.0, cart: 1.0 };
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

// Park block: lawn, fountain and trees (legacy positions); two of the old trees are now flame trees.
const PARK: Rect = { minX: 13, maxX: 43, minZ: -44, maxZ: -22 };
const SQUARE: Rect = { minX: 14.5, maxX: 43.5, minZ: 29.5, maxZ: 46.5 };
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
// Corner gardens and the promenade.
const GARDENS: Rect[] = [{ minX: 118.6, maxX: 137, minZ: 118.6, maxZ: 137 }, { minX: -137, maxX: -118.6, minZ: 118.6, maxZ: 137 }];
addTree('flame', 130, 130, 1.25);
addTree('flame', -130, 130, 1.25);
benches.push({ x: 121.6, z: 127.5, yaw: -HALF_PI }, { x: 127.5, z: 121.6, yaw: PI });
benches.push({ x: -121.6, z: 127.5, yaw: HALF_PI }, { x: -127.5, z: 121.6, yaw: PI });
const PROMENADE_BENCHES = [-122, -86, -42, -14, 14, 42, 92, 122];
for (const x of PROMENADE_BENCHES) benches.push({ x, z: -133, yaw: PI });
for (const x of [-104, -64, -28, 28, 104]) addTree('palm', x, -131, 1);
// Pagoda and school yards are paved; the promenade runs the whole northern edge.
const YARDS: Rect[] = [{ minX: -41, maxX: -13, minZ: 120, maxZ: 137 }, { minX: 11, maxX: 43, minZ: 120, maxZ: 137 }];

// Downtown: the walking-street plaza in front of the theatre, a fountain in the middle, palms at the corners.
const PLAZA: Rect = { minX: 228.5, maxX: 257.5, minZ: 12.5, maxZ: 41.5 };
addProp('fountain', 243, 27, 7, 7);
for (const [x, z] of [[231.5, 15.5], [254.5, 15.5], [231.5, 38.5], [254.5, 38.5]]) addTree('palm', x, z, 1.1);
for (const [x, z] of [[236, 19], [250, 19], [236, 35], [250, 35]]) addProp('planter', x, z, 2.2, 1.1, 0);
benches.push({ x: 232.5, z: 22, yaw: HALF_PI }, { x: 232.5, z: 32, yaw: HALF_PI }, { x: 253.5, z: 22, yaw: -HALF_PI }, { x: 253.5, z: 32, yaw: -HALF_PI });
// The city park: shade trees, a lawn and benches along its paths.
const CITY_PARK: Rect = { minX: 228.5, maxX: 257.5, minZ: 66.5, maxZ: 95.5 };
for (const [x, z, sp] of [[233, 71, 'round'], [253, 71, 'flame'], [233, 91, 'flame'], [253, 91, 'round'], [243, 76, 'tall'], [238, 86, 'round'], [249, 86, 'tall']] as const) addTree(sp, x, z, 1.2);
benches.push({ x: 243, z: 70.5, yaw: 0 }, { x: 243, z: 91.5, yaw: PI }, { x: 234, z: 81, yaw: HALF_PI }, { x: 252, z: 81, yaw: -HALF_PI });
// The riverfront continues downtown: benches facing the water and palms.
for (const x of [150, 176, 230, 262, 286, 336]) benches.push({ x, z: -133, yaw: PI });
for (const x of [160, 214, 250, 278, 326]) addTree('palm', x, -131, 1);

/**
 * Docks on the river: a pier out over the water and steps beside it down to the waterline (where a swimmer
 * climbs out). `rental` docks hire out speedboats; the river bus stops at the others.
 */
export type Dock = { x: number; name: string; rental: boolean; pier: Rect; steps: Rect; ring: Point };
const DOCKS: Dock[] = ([[-80, 'BẾN ĐÒ AN HÒA', false], [2, 'BẾN AN HÒA • THUÊ CA NÔ', true], [190, 'BẾN BẠCH ĐẰNG', false], [300, 'BẾN DU THUYỀN • THUÊ CA NÔ', true]] as const).map(([x, name, rental]) => ({
  x, name, rental,
  pier: { minX: x - 2, maxX: x + 2, minZ: -152, maxZ: -134.6 },
  steps: { minX: x + 2.6, maxX: x + 5, minZ: -140.5, maxZ: -134.6 },
  ring: { x, z: -149.5 },
}));

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
const doors = drafts.map((d, i) => findDoor(grounds[i], d.entrance));

// ---------------------------------------------------------------------------------------------------------
// Places to visit.
// ---------------------------------------------------------------------------------------------------------

type PoiSpec = { kind: PoiKind; x: number; z: number; yaw: number; seat: boolean };
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
  POIS.push({ id: POIS.length, kind: p.kind, x: p.x, z: p.z, yaw: p.yaw, curb, seat: p.seat });
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
  trees, lamps, props, benches, busStops, tables: CAFE_TABLES,
  park: PARK, square: SQUARE, gardens: GARDENS, yards: YARDS,
  promenade: { minX: -200, maxX: LAND.maxX + 70, minZ: -136.5, maxZ: -118 } as Rect,
  plaza: PLAZA, cityPark: CITY_PARK, docks: DOCKS,
};

// ---- The nightlife strip ("phố đèn đỏ"): the six shophouses on the road at z = 54, east of x = 54. ----
export type VenueKind = 'bar' | 'karaoke' | 'motel' | 'club' | 'spa' | 'beer';
export type Venue = { kind: VenueKind; building: Building; door: Point; name: string; neon: string };
const VENUE_LOOKS: Record<VenueKind, { name: string; subtitle: string; neon: string }> = {
  bar: { name: 'BAR NEON', subtitle: 'COCKTAIL • RƯỢU • 18+', neon: '#ff3d7f' },
  karaoke: { name: 'KARAOKE ÁNH SAO', subtitle: 'PHÒNG VIP • ÂM THANH CHUẨN', neon: '#b04dff' },
  motel: { name: 'NHÀ NGHỈ HOA HỒNG', subtitle: 'THEO GIỜ • QUA ĐÊM', neon: '#ff4a4a' },
  club: { name: 'VŨ TRƯỜNG MOONLIGHT', subtitle: 'DJ • NHẢY TỚI SÁNG • 18+', neon: '#3dd6ff' },
  spa: { name: 'SPA & MASSAGE', subtitle: 'THƯ GIÃN • XÔNG HƠI', neon: '#ff8ad1' },
  beer: { name: 'BIA HƠI HÀ NỘI', subtitle: 'BIA TƯƠI • ĐỒ NHẮM', neon: '#ffc23d' },
};
/** The venues west to east: bar, karaoke and motel face the road from the north, club, spa and beer from the south. */
export const VENUES: Venue[] = [];
{
  const strip = BUILDINGS.filter((b) => b.door.x > 58 && b.door.x < 96 && Math.abs(b.door.z - 54) < 14);
  const side = (north: boolean) => strip.filter((b) => (b.door.z > 54) === north).sort((a, b) => a.door.x - b.door.x);
  const order: [Building[], VenueKind[]][] = [[side(true), ['bar', 'karaoke', 'motel']], [side(false), ['club', 'spa', 'beer']]];
  for (const [row, kinds] of order) row.slice(0, 3).forEach((b, i) => {
    const look = VENUE_LOOKS[kinds[i]];
    b.name = look.name;
    b.subtitle = look.subtitle;
    PLOTS[b.id].signColor = look.neon;
    VENUES.push({ kind: kinds[i], building: b, door: { ...b.door }, name: look.name, neon: look.neon });
  });
}
