import { BUILDINGS, COLLIDERS, LAND, LIFE, PLOTS, POIS, ROADS_X, ROADS_Z, SCENERY, pathClearance, type Building, type Rect } from './city';
import { ATM_SPOTS, VENDING_SPOTS } from './counters';
import { ASPHALT_HALF } from './map/terrain';
import { APPROACHES } from './signals';
import type { CarStyle, MotoStyle } from './vehicle-models';

/**
 * Where vehicles stand parked, as deterministic data (no randomness, nothing drawn): the 60 sidewalk scooters of
 * the layout at their exact positions, giữ-xe rows in front of busy places, the school and pagoda gates, the market
 * alley, the nightlife strip, the ward police yard and the open car parks downtown. Motorbikes stand on the
 * sidewalk band 10.2-11.9 m from the road centre, perpendicular to the curb with the nose toward the building, clear
 * of doors (1.7 m), junctions (13 m), the walking line, colliders, signal poles, benches, shelters and café tables.
 * Cars park on the carriageway only in bays where the asphalt half-width is at least 9 m (plan decision 10): today's
 * roads are 7 m, so the only cars are in the off-street car parks. vehicles.ts turns spots into curb vehicles and
 * decides by the hour which are taken (occupancy()).
 */

export type SpotKind = 'home' | 'shop' | 'lot' | 'school' | 'pagoda' | 'market' | 'night' | 'impound' | 'carpark' | 'perch';
/** The occupancy curve a spot follows through the day. */
export type Occ = 'home' | 'shop' | 'food' | 'cafe' | 'hospital' | 'office' | 'bank' | 'hotel' | 'theatre' | 'mall' | 'night' | 'school' | 'pagoda' | 'market' | 'police' | 'impound' | 'carpark'
  /** Always there; a xe ôm driver's scooter in his working hours; a couple's by the river in the evening. */
  | 'always' | 'xeom' | 'couple';
export type ParkSpot = {
  id: number; kind: SpotKind; occ: Occ;
  /** Centre of the vehicle and its heading (nose toward the building for motorbikes); side-stand jitter included. */
  x: number; z: number; yaw: number;
  vehicle: 'moto' | 'car'; style: MotoStyle | CarStyle;
  /** 0..1, picks the paint. */
  tint: number;
  /** Building it belongs to (-1 for none), its lot (-1 for none); one of the layout's 60 scooters. */
  host: number; lot: number; legacy: boolean;
};
/** A giữ-xe row (attendant at the end nearest the door), the police yard, or a car park. */
export type Lot = {
  id: number; kind: 'giuxe' | 'impound' | 'carpark'; host: number; name: string;
  attendant: { x: number; z: number; yaw: number } | null;
  spots: number[];
  /** Thousands of đồng to leave a vehicle, and the hours it is minded. */
  price: number; hours: [number, number];
};

/** Hash of two integers to 0..1 (the same mixer as vehicles.ts). */
export function hash01(k: number, salt: number) {
  let h = Math.imul(k ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Centre line of the parking band, from the road centre: 10.175-11.925 for a 1.75 m bike. */
export const BAND = 11.05;
/** Bike footprint (half across, half along) as the layout's scooter rects; giữ-xe rows run at 0.8 m. */
const BIKE_HALF = [0.31, 0.875] as const, PITCH = 0.8;
/** Side-stand jitter of a parked bike's heading (radians each way). */
const JITTER = 0.07;
/** Gameplay rings and the spawn that city.ts keeps clear (its KEEP_CLEAR list). */
const KEEP_CLEAR = [
  [12.6, 12.4], [12.4, 14.2], [-32, 7], [-30, 13], [-18, 49.6], [20, -10.9], [22.5, -10.3], [54, -35], [28, -24], [-36.5, 35], [36, 33], [-20, -83.5], [32, 13.5],
];
const MOTO_MIX: [MotoStyle, number][] = [['scooter', 0.42], ['cub', 0.33], ['sport', 0.15], ['vespa', 0.1]];
const CAR_MIX: [CarStyle, number][] = [['sedan', 0.34], ['hatch', 0.24], ['suv', 0.22], ['pickup', 0.12], ['taxi', 0.08]];
function pickMix<T>(mix: [T, number][], u: number) {
  for (const [v, w] of mix) { if (u < w) return v; u -= w; }
  return mix[mix.length - 1][0];
}

export const SPOTS: ParkSpot[] = [];
export const LOTS: Lot[] = [];

function addSpot(kind: SpotKind, occ: Occ, x: number, z: number, yaw: number, vehicle: 'moto' | 'car', host: number, lot: number, legacy = false) {
  const id = SPOTS.length;
  const jitter = vehicle === 'moto' ? (hash01(id, 11) * 2 - 1) * JITTER : (hash01(id, 11) * 2 - 1) * 0.02;
  const style = vehicle === 'moto' ? pickMix(MOTO_MIX, hash01(id, 12)) : pickMix(CAR_MIX, hash01(id, 12));
  SPOTS.push({ id, kind, occ, x, z, yaw: yaw + jitter, vehicle, style, tint: hash01(id, 13), host, lot, legacy });
  return id;
}

const nearestDoor = (x: number, z: number) => BUILDINGS.reduce((best, b) => (Math.hypot(b.door.x - x, b.door.z - z) < Math.hypot(best.door.x - x, best.door.z - z) ? b : best), BUILDINGS[0]);
function occOf(b: Building): Occ {
  switch (b.kind) {
    case 'home': return 'home';
    case 'food': return 'food';
    case 'cafe': return 'cafe';
    case 'hotel': return 'hotel';
    case 'office': return 'office';
    default: return 'shop';
  }
}

// ---- The layout's scooters, at their exact positions: parked nose toward the house, or (a street-life perch, with a
// POI on its saddle) facing the way its rider sits, and always there. ----
for (const p of SCENERY.props) {
  if (p.kind !== 'scooter') continue;
  const perch = POIS.find((q) => (q.kind as string) === 'perch' && Math.hypot(q.x - p.x, q.z - p.z) < 0.5);
  if (perch) {
    const kind = perch.group !== undefined ? LIFE.groups[perch.group]?.kind : undefined;
    addSpot('perch', kind === 'xeom' ? 'xeom' : kind === 'couple' ? 'couple' : 'always', p.x, p.z, p.yaw, 'moto', -1, -1, true);
    continue;
  }
  const b = nearestDoor(p.x, p.z);
  addSpot(b.kind === 'home' ? 'home' : 'shop', occOf(b), p.x, p.z, p.yaw + Math.PI, 'moto', b.id, -1, true);
}

// ---- Rows on the sidewalk band. ----

/** The ATMs and drink machines (counters.ts): 0.9 x 0.7 boxes that game.ts adds to its colliders at runtime. */
export const KIOSK_RECTS: Rect[] = [...ATM_SPOTS, ...VENDING_SPOTS].map((k) => {
  const side = Math.abs(Math.sin(k.yaw)) > 0.5, hx = side ? 0.35 : 0.45, hz = side ? 0.45 : 0.35;
  return { minX: k.x - hx, maxX: k.x + hx, minZ: k.z - hz, maxZ: k.z + hz };
});
/** Rects a parked vehicle must stay clear of: the layout's colliders (the 60 scooters and the carts included) and the kiosks. */
function rectFree(x: number, z: number, hx: number, hz: number) {
  for (const c of COLLIDERS) if (x + hx + 0.1 > c.minX && x - hx - 0.1 < c.maxX && z + hz + 0.1 > c.minZ && z - hz - 0.1 < c.maxZ) return false;
  for (const c of KIOSK_RECTS) if (x + hx + 0.1 > c.minX && x - hx - 0.1 < c.maxX && z + hz + 0.1 > c.minZ && z - hz - 0.1 < c.maxZ) return false;
  return true;
}
const onAsphalt = (x: number, z: number, margin = 0) =>
  ROADS_Z.some((r) => Math.abs(z - r) < ASPHALT_HALF + margin) || (z > ROADS_Z[0] - ASPHALT_HALF && ROADS_X.some((r) => Math.abs(x - r) < ASPHALT_HALF + margin));
/** Whether a bike can stand at (x, z) facing along x (`alongX`) or z without blocking anything people use. */
function bikeFree(x: number, z: number, noseAlongX: boolean) {
  const [hAcross, hAlong] = BIKE_HALF;
  const hx = noseAlongX ? hAlong : hAcross, hz = noseAlongX ? hAcross : hAlong;
  if (!rectFree(x, z, hx, hz) || onAsphalt(x, z, 0.9)) return false;
  // Nor on a spot already taken out (rows that meet: a shop's own bikes and a giữ-xe row).
  for (const s of SPOTS) {
    const r = spotRect(s);
    if (x + hx + 0.1 > r.minX && x - hx - 0.1 < r.maxX && z + hz + 0.1 > r.minZ && z - hz - 0.1 < r.maxZ) return false;
  }
  // Walking lines, door and POI paths along the whole bike, not just its centre.
  for (const t of [-0.6, 0, 0.6]) if (pathClearance(x + (noseAlongX ? t : 0), z + (noseAlongX ? 0 : t)) < 0.78) return false;
  if (KEEP_CLEAR.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < 2.6)) return false;
  if (SCENERY.benches.some((b) => Math.hypot(b.x - x, b.z - z) < 2.4)) return false;
  if (SCENERY.busStops.some((b) => Math.hypot(b.x - x, b.z - z) < 3.8)) return false;
  if (SCENERY.tables.some((t) => Math.hypot(t.x - x, t.z - z) < 3)) return false;
  if (APPROACHES.some((a) => Math.hypot(a.pole.x - x, a.pole.z - z) < 1.1)) return false;
  return x > LAND.minX + 2 && x < LAND.maxX - 2 && z > LAND.minZ + 2 && z < LAND.maxZ - 2;
}

type RowSpec = {
  /** Road the row runs beside: east-west roads ('x') at z = road, north-south ('z') at x = road. */
  axis: 'x' | 'z'; road: number; side: 1 | -1;
  from: number; to: number; max: number; occ: Occ; kind: SpotKind;
  /** The door the row is for: slots nearest it are taken first, and none within 1.7 m of it. */
  door: number | null;
  /** Along-road intervals to leave free (gates). */
  skip?: [number, number][];
  /** Distance of the bikes' centres from the road centre (or from `line`, a fixed coordinate). */
  offset?: number;
};
/** Free slots of a row at 0.8 m, nearest the door first; doors of every building along it stay clear. */
function rowSlots(r: RowSpec) {
  const cross = r.axis === 'x' ? ROADS_X : ROADS_Z;
  const line = r.road + r.side * (r.offset ?? BAND);
  const doors = BUILDINGS.filter((b) => Math.abs((r.axis === 'x' ? b.door.z : b.door.x) - line) < 3.5).map((b) => (r.axis === 'x' ? b.door.x : b.door.z));
  const slots: number[] = [];
  for (let a = r.from + BIKE_HALF[0]; a <= r.to - BIKE_HALF[0] + 1e-6; a += PITCH) {
    if (cross.some((c) => Math.abs(a - c) < 13)) continue;
    if (doors.some((d) => Math.abs(a - d) < 1.7 + BIKE_HALF[0])) continue;
    if (r.skip?.some(([lo, hi]) => a > lo - BIKE_HALF[0] && a < hi + BIKE_HALF[0])) continue;
    const x = r.axis === 'x' ? a : line, z = r.axis === 'x' ? line : a;
    if (bikeFree(x, z, r.axis === 'z')) slots.push(a);
  }
  const near = r.door ?? (r.from + r.to) / 2;
  return slots.sort((p, q) => Math.abs(p - near) - Math.abs(q - near)).slice(0, r.max).sort((p, q) => p - q);
}
/** Adds a row's slots as spots (and as a lot with an attendant when it holds 6 or more). */
function addRow(r: RowSpec, name: string, host: number, lotKind: Lot['kind'] = 'giuxe', price = 5, hours: [number, number] = [6, 22]) {
  const slots = rowSlots(r);
  if (!slots.length) return [];
  const line = r.road + r.side * (r.offset ?? BAND);
  // Nose away from the road: toward the building.
  const yaw = r.axis === 'x' ? (r.side > 0 ? 0 : Math.PI) : (r.side > 0 ? Math.PI / 2 : -Math.PI / 2);
  const lot = slots.length >= 6 ? LOTS.length : -1;
  const ids = slots.map((a) => addSpot(r.kind, r.occ, r.axis === 'x' ? a : line, r.axis === 'x' ? line : a, yaw, 'moto', host, lot));
  if (lot >= 0) {
    // The minder sits at the row's end nearest the door, a little further from the road, facing it.
    const near = r.door ?? (slots[0] + slots[slots.length - 1]) / 2;
    const end = Math.abs(slots[0] - near) < Math.abs(slots[slots.length - 1] - near) ? slots[0] - 0.9 : slots[slots.length - 1] + 0.9;
    const across = r.road + r.side * ((r.offset ?? BAND) + 0.4);
    LOTS.push({
      id: lot, kind: lotKind, host, name, spots: ids, price, hours,
      attendant: { x: r.axis === 'x' ? end : across, z: r.axis === 'x' ? across : end, yaw: yaw + Math.PI },
    });
  }
  return ids;
}
/** The row along a building's frontage: the road it faces, the side, its extent along the road. */
function frontRow(b: Building, occ: Occ, max: number, kind: SpotKind = 'lot', extra: Partial<RowSpec> = {}): RowSpec {
  const ex = Math.sin(b.facing), ez = Math.cos(b.facing);
  const g = PLOTS[b.id].ground;
  if (Math.abs(ez) > 0.5) {
    const road = ROADS_Z.reduce((best, r) => (Math.abs(b.door.z + ez * 12.5 - r) < Math.abs(b.door.z + ez * 12.5 - best) ? r : best));
    return { axis: 'x', road, side: ez > 0 ? -1 : 1, from: g.minX, to: g.maxX, max, occ, kind, door: b.door.x, ...extra };
  }
  const road = ROADS_X.reduce((best, r) => (Math.abs(b.door.x + ex * 12.5 - r) < Math.abs(b.door.x + ex * 12.5 - best) ? r : best));
  return { axis: 'z', road, side: ex > 0 ? -1 : 1, from: g.minZ, to: g.maxZ, max, occ, kind, door: b.door.z, ...extra };
}
const byName = (name: string, near?: [number, number]) => BUILDINGS.filter((b) => b.name === name)
  .sort((a, b) => (near ? Math.hypot(a.door.x - near[0], a.door.z - near[1]) - Math.hypot(b.door.x - near[0], b.door.z - near[1]) : 0))[0];

// Giữ-xe rows in front of the busy places (rows of 6 or more get an attendant).
for (const [name, occ, max, hours] of [
  ['BỆNH VIỆN AN HÒA', 'hospital', 24, [0, 24]], ['NHÀ HÁT THÀNH PHỐ', 'theatre', 24, [17, 23]], ['TRUNG TÂM THƯƠNG MẠI', 'mall', 24, [9, 22]],
  ['NGÂN HÀNG PHƯƠNG NAM', 'bank', 16, [7.5, 17.5]], ['VĂN PHÒNG', 'office', 20, [7, 18]], ['CAO ỐC SÀI THÀNH', 'office', 18, [7, 18]], ['THÁP PHƯƠNG NAM', 'office', 14, [7, 22]],
] as [string, Occ, number, [number, number]][]) {
  const b = byName(name);
  if (b) addRow(frontRow(b, occ, max), `GIỮ XE · ${name}`, b.id, 'giuxe', 5, hours);
}
// The Cô Ba cafés on the busy corners.
for (const at of [[-76, -11.7], [-31, -11.7], [-18, -65.7]] as [number, number][]) {
  const b = BUILDINGS.filter((c) => c.kind === 'cafe').sort((p, q) => Math.hypot(p.door.x - at[0], p.door.z - at[1]) - Math.hypot(q.door.x - at[0], q.door.z - at[1]))[0];
  if (b && Math.hypot(b.door.x - at[0], b.door.z - at[1]) < 3) addRow(frontRow(b, 'cafe', 8), `GIỮ XE · ${b.name}`, b.id, 'giuxe', 5, [6, 22.5]);
}
// The ward police: visitors' bikes nearest the door, confiscated ones (xe tạm giữ) further along.
{
  const b = byName('CÔNG AN PHƯỜNG');
  if (b) {
    const ids = addRow(frontRow(b, 'police', 18), 'CÔNG AN PHƯỜNG · XE TẠM GIỮ', b.id, 'impound', 0, [0, 24]);
    const door = b.door.z;
    for (const id of [...ids].sort((p, q) => Math.abs(SPOTS[q].z - door) - Math.abs(SPOTS[p].z - door)).slice(0, Math.floor(ids.length / 2))) {
      SPOTS[id].kind = 'impound';
      SPOTS[id].occ = 'impound';
    }
  }
}
// The owner's and the customers' bikes in front of shops, eateries and cafés (up to three, nearest the door).
for (const b of BUILDINGS) {
  if (!['shop', 'food', 'cafe', 'bikeshop', 'post', 'hotel'].includes(b.kind) || !['legacy', 'shop', 'home', 'midrise'].includes(PLOTS[b.id].style)) continue;
  if (SPOTS.some((s) => s.host === b.id)) continue;
  addRow(frontRow(b, occOf(b), 3, 'shop'), b.name, b.id);
}
// Parents' and teachers' bikes at the school gate, worshippers' at the pagoda gate (the gates stay open).
{
  const school = byName('TRƯỜNG TIỂU HỌC');
  // A little nearer the road than the band: the fence and the gate walls stand at 12 m.
  if (school) addRow(frontRow(school, 'school', 12, 'school', { skip: [[21, 33]], offset: 10.75 }), 'GIỮ XE · TRƯỜNG TIỂU HỌC', school.id, 'giuxe', 3, [6, 17.5]);
  const pagoda = byName('CHÙA AN HÒA');
  if (pagoda) addRow(frontRow(pagoda, 'pagoda', 20, 'pagoda', { from: -41, to: -13, skip: [[-32.5, -21.5]], offset: 10.75 }), 'GIỮ XE · CHÙA AN HÒA', pagoda.id, 'giuxe', 3, [5, 20]);
}
// The market alley: bikes along both house backs in the gap between the second and third sạp only, so the lane in
// front of the stalls stays for the shoppers (the attendant's chair is in the gap, city.ts LIFE.posts).
for (const [line, side] of [[28.95, -1], [35.05, 1]] as [number, 1 | -1][]) {
  addRow({ axis: 'x', road: line, side, offset: 0, from: -28.3, to: -22.7, max: 6, occ: 'market', kind: 'market', door: -25.5 }, 'GIỮ XE · CHỢ', -1, 'giuxe', 3, [5, 19]);
}
// The nightlife strip fills up after dark: both sides of the road at z = 54 between x 58 and 96.
for (const side of [-1, 1] as const) addRow({ axis: 'x', road: 54, side, from: 58, to: 96, max: 18, occ: 'night', kind: 'night', door: 77 }, 'GIỮ XE · PHỐ ĐÊM', -1, 'giuxe', 10, [19, 2]);

// ---- Off-street car parks downtown (open lots beside the towers), cars nose-in at 2.6 m. ----
function carPark(name: string, x0: number, x1: number, z: number, yaw: number, occ: Occ) {
  const lot = LOTS.length, ids: number[] = [];
  for (let x = x0 + 1.3; x <= x1 - 1.3 + 1e-6; x += 2.6) {
    const hz = Math.abs(Math.cos(yaw)) > 0.5 ? 2.3 : 1.0, hx = Math.abs(Math.cos(yaw)) > 0.5 ? 1.0 : 2.3;
    if (!rectFree(x, z, hx, hz) || onAsphalt(x, z, 1) || pathClearance(x, z) < 1.2) continue;
    ids.push(addSpot('carpark', occ, x, z, yaw, 'car', -1, lot));
  }
  if (ids.length) LOTS.push({ id: lot, kind: 'carpark', host: -1, name, spots: ids, price: 25, hours: [6, 23], attendant: { x: x0 + 0.8, z: z + 2.6 * Math.cos(yaw + Math.PI), yaw: yaw + Math.PI } });
}
carPark('BÃI ĐỖ XE Ô TÔ · HÀM NGHI', 284.5, 309.5, 91.4, Math.PI, 'carpark');
carPark('BÃI ĐỖ XE Ô TÔ · KHÁCH SẠN', 284.5, 309.5, -75.9, Math.PI, 'hotel');
carPark('BÃI ĐỖ XE Ô TÔ · TÀI CHÍNH', 232.5, 253.5, -70.0, Math.PI, 'carpark');

/** The rects of every spot (for tests and for anyone placing things on the sidewalk). */
export function spotRect(s: ParkSpot): Rect {
  const [ha, hl] = s.vehicle === 'moto' ? BIKE_HALF : [1.0, 2.3];
  const alongX = Math.abs(Math.sin(s.yaw)) > 0.5;
  return { minX: s.x - (alongX ? hl : ha), maxX: s.x + (alongX ? hl : ha), minZ: s.z - (alongX ? ha : hl), maxZ: s.z + (alongX ? ha : hl) };
}

// ---- Occupancy. ----

const between = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
/** Share of an occupancy curve's spots taken at an hour of a day (design 4.2); lunar days 1 and 15 fill the pagoda. */
export function occupancy(occ: Occ, hour: number, day = 0): number {
  const h = ((hour % 24) + 24) % 24;
  switch (occ) {
    case 'home': return between(h, 6, 7.5) ? 0.9 : between(h, 7.5, 11) ? 0.3 : between(h, 11, 13) ? 0.6 : between(h, 13, 17) ? 0.3 : between(h, 17, 22) ? 0.85 : 0;
    case 'shop': return between(h, 7, 21.5) ? 0.9 : 0;
    case 'food': return between(h, 6, 22) ? 0.9 : 0;
    case 'cafe': return between(h, 6, 9) ? 0.7 : between(h, 9, 15) ? 0.4 : between(h, 15, 22.5) ? 0.8 : 0;
    case 'hospital': return between(h, 7, 20) ? 0.8 : 0.3;
    case 'office': case 'bank': return between(h, 8, 17.5) ? 0.85 : 0.05;
    case 'hotel': return between(h, 7, 18) ? 0.5 : 0.7;
    case 'theatre': return between(h, 18.5, 22.5) ? 0.9 : 0.05;
    case 'mall': return between(h, 10, 18) ? 0.5 : between(h, 18, 22) ? 0.9 : 0;
    case 'night': return between(h, 19, 20) ? 0.4 : between(h, 20, 23.5) ? 0.9 : between(h, 23.5, 1) ? 0.6 : between(h, 1, 2) ? 0.3 : 0;
    case 'school': return between(h, 6.5, 11.5) || between(h, 13, 17) ? 0.75 : between(h, 11.5, 13) ? 0.5 : 0;
    case 'pagoda': {
      const lunar = day % 15 === 0 ? 1.4 : 1;
      return Math.min(0.95, lunar * (between(h, 5.5, 8) ? 0.8 : between(h, 8, 17) ? 0.25 : between(h, 17, 20) ? 0.5 : 0));
    }
    case 'market': return between(h, 5, 11) ? 0.85 : between(h, 11, 17) ? 0.4 : between(h, 17, 19) ? 0.6 : 0;
    case 'police': return between(h, 7.5, 17) ? 0.5 : 0.1;
    case 'impound': return 0.8;
    case 'carpark': return between(h, 7, 19) ? 0.75 : between(h, 19, 23) ? 0.45 : 0.3;
    case 'always': return 1;
    case 'xeom': return between(h, 5.8, 21.2) ? 1 : 0;
    case 'couple': return between(h, 18.8, 23.2) ? 1 : 0;
  }
}
/** Whether a spot is taken at an hour of a day: a hash per spot and hour slot against the curve, so it is stable within the hour. */
export function wanted(s: ParkSpot, hour: number, day = 0) {
  const h = ((hour % 24) + 24) % 24;
  return hash01(s.id * 131 + 7, day * 24 + Math.floor(h)) < occupancy(s.occ, h, day);
}
