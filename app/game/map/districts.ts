/**
 * Districts of the planned city (design 1: ten districts, phases P0/P1/P2), the named areas of today's map and of
 * the wired P1 slices, waterways and street names, as small pure tables. No generation: page.tsx and the SSR bundle
 * may import it. Lookups are rectangle unions, first match wins, half-open [min, max). The streets of the wired
 * slices are handed over at run time (registerStreets, from map/mapdata.ts on the client).
 */
import { CITY_PARK, DOCKS, LAND, PARK, PLAZA, RIVER, ROADS_X, ROADS_Z, SQUARE, STREETS_H, STREETS_V, type Rect } from './consts.ts';
import { isWired, type SliceKey } from './wiring.ts';

// Which slices are wired (their land, zones and streets are live): map/wiring.ts, the one source the map reads too.
export { P1_ORDER, WIRED_KEYS, isWired, type SliceKey } from './wiring.ts';

export type Phase = 'P0' | 'P1' | 'P2';
export type DistrictId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9' | 'D10';
/**
 * One rectangle of a district, the phase that builds it, the ward shown after the district name ("QUẬN 1 · BẾN
 * NGHÉ") and the P1 slice that builds most of it (its land is open once that slice is wired).
 */
export type DistrictPart = { rect: Rect; phase: Phase; ward?: string; slice?: SliceKey };
export type District = { id: DistrictId; name: string; subtitle: string; color: string; phase: Phase; parts: DistrictPart[]; label: { x: number; z: number } };
/** A named area inside a district (today's sub-zones and the wired slices'), used by the HUD line and banners. */
export type Zone = { id: string; name: string; district: DistrictId; rects: Rect[]; phase: Phase; slice?: SliceKey };
/** A river, canal or lake: a polygon (x, z pairs), its label positions, and whether it is open today (P0). */
export type Water = { id: string; name: string; subtitle: string; poly: number[]; labels: { x: number; z: number; vertical?: boolean }[]; phase: Phase };
/**
 * A named street: today's run straight from (x1, z1) to (x2, z2); a district street follows its centre lines `lines`
 * (x,z pairs each) and reaches `reach` metres from them (its asphalt and sidewalk), its box in x1..x2, z1..z2.
 */
export type Street = { id: string; name: string; label: string; short: string; x1: number; z1: number; x2: number; z2: number; lines?: number[][]; reach?: number };
export type Area = { title: string; subtitle: string; zone: string; district: DistrictId | null; water: string | null; key: string };

const r = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });
const inside = (b: Rect, x: number, z: number) => x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
const part = (rect: Rect, phase: Phase, ward?: string, slice?: SliceKey): DistrictPart => ({ rect, phase, ...(ward ? { ward } : {}), ...(slice ? { slice } : {}) });

/** The whole planned city (design 1, phase P2). */
export const CITY_BOUNDS = r(-1000, 1150, -620, 860);

export const DISTRICTS: District[] = [
  { id: 'D1', name: 'AN HÒA', subtitle: 'Phường An Hòa · ven kênh Thị Nghè', color: '#5f9846', phase: 'P0', label: { x: -30, z: -81 },
    parts: [part(r(LAND.minX, 135, -137.6, 137.5), 'P0'), part(r(-175, LAND.minX, -137.6, 137.5), 'P1', undefined, 'binh-thanh')] },
  { id: 'D2', name: 'QUẬN 1', subtitle: 'Trung tâm thành phố · ven sông Sài Gòn', color: '#db683f', phase: 'P0', label: { x: 243, z: -81 },
    parts: [part(r(135, LAND.maxX, -137.6, 137.5), 'P0', 'BẾN NGHÉ'), part(r(LAND.maxX, 392, -137.6, 137.5), 'P1', 'BẾN NGHÉ', 'quan-4'), part(r(135, 392, 137.5, 216), 'P1', 'BẾN NGHÉ', 'quan-1-south'),
      part(r(135, 392, 216, 440), 'P1', 'BẾN THÀNH', 'quan-1-south'), part(r(-54, 135, 216, 385), 'P1', 'BẾN THÀNH', 'quan-1-south')] },
  { id: 'D3', name: 'QUẬN 3', subtitle: 'Biệt thự · hẻm · cà phê', color: '#8a6fb0', phase: 'P1', label: { x: -150, z: 330 },
    parts: [part(r(-175, 135, 137.5, 216), 'P1', undefined, 'quan-3'), part(r(-175, -54, 216, 440), 'P1', undefined, 'quan-3'), part(r(-54, 135, 385, 440), 'P1', undefined, 'quan-3'), part(r(-380, -175, 230, 440), 'P1', undefined, 'quan-3')] },
  { id: 'D4', name: 'BÌNH THẠNH', subtitle: 'Bờ sông · Hàng Xanh · Bà Chiểu', color: '#2f8f83', phase: 'P1', label: { x: -480, z: 40 },
    parts: [part(r(-700, -205, -137.6, 200), 'P1', undefined, 'binh-thanh'), part(r(-970, -700, -137.6, 200), 'P2')] },
  { id: 'D5', name: 'QUẬN 4', subtitle: 'Khánh Hội · bến cảng', color: '#3f68b8', phase: 'P1', label: { x: 540, z: 190 },
    parts: [part(r(432, 680, -137.6, 440), 'P1', undefined, 'quan-4')] },
  { id: 'D6', name: 'CHỢ LỚN', subtitle: 'Quận 5 · phố chợ', color: '#c0392b', phase: 'P2', label: { x: -690, z: 335 },
    parts: [part(r(-1000, -380, 230, 440), 'P2')] },
  { id: 'D7', name: 'QUẬN 8', subtitle: 'Kênh rạch · chợ đầu mối', color: '#a0773f', phase: 'P2', label: { x: -380, z: 620 },
    parts: [part(r(-1000, 240, 480, 860), 'P2')] },
  { id: 'D8', name: 'QUẬN 7', subtitle: 'Phú Mỹ Hưng · Tân Thuận', color: '#c39a1c', phase: 'P2', label: { x: 470, z: 600 },
    parts: [part(r(280, 680, 480, 860), 'P2')] },
  { id: 'D9', name: 'THỦ THIÊM · CÁT LÁI', subtitle: 'Đô thị mới bên kia sông', color: '#3fa0c8', phase: 'P1', label: { x: 140, z: -330 },
    parts: [part(r(-440, 470, -420, RIVER.minZ), 'P1', undefined, 'thu-thiem'), part(r(470, 680, -420, RIVER.minZ), 'P1', undefined, 'thu-thiem'), part(r(-440, 1150, -620, -420), 'P2'), part(r(680, 1150, -420, -260), 'P2'),
      part(r(680, 1150, -260, -77.6), 'P2'), part(r(802.4, 1150, -77.6, 860), 'P2')] },
  { id: 'D10', name: 'THẢO ĐIỀN', subtitle: 'Biệt thự ven sông', color: '#b0607a', phase: 'P2', label: { x: -690, z: -300 },
    parts: [part(r(-1000, -440, -620, RIVER.minZ), 'P2')] },
];
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<DistrictId, District>;
/** Whether a part of a district is open: today's map, or built by a wired slice. */
export const partOpen = (p: DistrictPart) => p.phase === 'P0' || (!!p.slice && isWired(p.slice));
/** Whether any of a district is open. */
export const districtOpen = (d: District) => d.parts.some(partOpen);

/** Today's named areas, most specific first; the last one of a district is its default (Quận 1 has none). */
const DOCK_ZONES: Record<number, [string, DistrictId]> = { [-80]: ['Bến đò An Hòa', 'D1'], 2: ['Bến ca nô An Hòa', 'D1'], 190: ['Bến tàu Bạch Đằng', 'D2'], 300: ['Bến du thuyền', 'D2'] };
export const ZONES: Zone[] = [
  ...DOCKS.map((d): Zone => ({ id: `dock${d.x}`, name: DOCK_ZONES[d.x][0], district: DOCK_ZONES[d.x][1], rects: [r(d.x - 10, d.x + 10, -153, -126)], phase: 'P0' })),
  { id: 'cho-ven-song', name: 'Chợ ven sông', district: 'D1', rects: [r(60, 93, -130, -118)], phase: 'P0' },
  { id: 'bo-song-an-hoa', name: 'Bờ sông An Hòa', district: 'D1', rects: [r(LAND.minX, 135, -137.6, -118)], phase: 'P0' },
  { id: 'bach-dang', name: 'Bến Bạch Đằng', district: 'D2', rects: [r(135, LAND.maxX, -137.6, -95.5)], phase: 'P0' },
  { id: 'cho-an-hoa', name: 'Chợ An Hòa', district: 'D1', rects: [r(-49, -13, 26, 38)], phase: 'P0' },
  { id: 'quang-truong-an-hoa', name: 'Quảng trường An Hòa', district: 'D1', rects: [SQUARE], phase: 'P0' },
  { id: 'cong-vien-an-hoa', name: 'Công viên An Hòa', district: 'D1', rects: [PARK], phase: 'P0' },
  { id: 'pho-dem', name: 'Phố đêm Phượng Vĩ', district: 'D1', rects: [r(56, 101, 36, 80)], phase: 'P0' },
  { id: 'quang-truong-nha-hat', name: 'Quảng trường Nhà hát', district: 'D2', rects: [PLAZA], phase: 'P0' },
  { id: 'cong-vien-thanh-pho', name: 'Công viên Thành phố', district: 'D2', rects: [CITY_PARK], phase: 'P0' },
  { id: 'xom-bo-song', name: 'Xóm Bờ Sông', district: 'D1', rects: [r(LAND.minX, 135, -118, -81)], phase: 'P0' },
  { id: 'xom-tre', name: 'Xóm Tre', district: 'D1', rects: [r(LAND.minX, -81, -81, 137.5)], phase: 'P0' },
  { id: 'khu-cho-cu', name: 'Khu Chợ Cũ', district: 'D1', rects: [r(-81, 135, 81, 137.5)], phase: 'P0' },
  { id: 'trung-tam-an-hoa', name: 'Trung tâm An Hòa', district: 'D1', rects: [r(-81, 135, -81, 81)], phase: 'P0' },
  { id: 'bo-kenh-hoang-sa', name: 'Bờ kênh Hoàng Sa', district: 'D1', rects: [r(-175, LAND.minX, -137.6, 137.5)], phase: 'P1', slice: 'binh-thanh' },
  ...SLICE_ZONES(),
];
/**
 * The wired slices' named areas, most specific first (WIRING-PLAN §3 zones per step; QUAN_3_EXTRA.zones and
 * THU_THIEM_EXTRA.zones as authored there, districts.test checks they match; design 1's for Quận 4, Bình Thạnh
 * and Quận 1). They name an area only once their slice is wired.
 */
function SLICE_ZONES(): Zone[] {
  const z = (slice: SliceKey, district: DistrictId, id: string, name: string, ...rects: Rect[]): Zone => ({ id, name, district, rects, phase: 'P1', slice });
  return [
    // Step 14, Quận 4 and the Bến Nghé strip (design 1, D5 Khánh Hội).
    z('quan-4', 'D2', 'cong-vien-ben-nghe', 'Công viên Bến Nghé', r(LAND.maxX, 392, -137.6, -96)),
    z('quan-4', 'D5', 'ben-nha-rong', 'Bến Nhà Rồng', r(455, 520, -137.6, -112)),
    z('quan-4', 'D5', 'cang-khanh-hoi', 'Cảng Khánh Hội', r(530, 680, -137.6, -62)),
    z('quan-4', 'D5', 'pho-oc-vinh-khanh', 'Phố ốc Vĩnh Khánh', r(450, 625, -30, 32)),
    z('quan-4', 'D5', 'cho-xom-chieu', 'Chợ Xóm Chiếu', r(545, 600, 378, 425)),
    z('quan-4', 'D5', 'xom-chieu', 'Xóm Chiếu', r(432, 680, 300, 440)),
    z('quan-4', 'D5', 'khanh-hoi', 'Khánh Hội', r(432, 680, -62, 300)),
    // Step 15, Bình Thạnh east.
    z('binh-thanh', 'D4', 'khu-do-thi-bo-song', 'Khu đô thị Bờ Sông', r(-700, -470, -137.6, -62)),
    z('binh-thanh', 'D4', 'hang-xanh', 'Ngã tư Hàng Xanh', r(-445, -335, -30, 45)),
    z('binh-thanh', 'D4', 'ben-xe-mien-dong', 'Bến xe Miền Đông cũ', r(-700, -585, 92, 150)),
    z('binh-thanh', 'D4', 'cong-vien-truong-sa', 'Công viên bờ kênh Trường Sa', r(-700, -482, 185, 200)),
    z('binh-thanh', 'D4', 'ba-chieu', 'Bà Chiểu', r(-585, -440, 55, 192)),
    // Step 16, Quận 3 (QUAN_3_EXTRA.zones).
    z('quan-3', 'D3', 'ho-con-rua', 'Hồ Con Rùa', r(-140, -76, 184, 248)),
    z('quan-3', 'D3', 'tan-dinh', 'Tân Định', r(-175, 135, 137.5, 216)),
    z('quan-3', 'D3', 'ban-co', 'Bàn Cờ', r(-270, -160, 245, 350)),
    z('quan-3', 'D3', 'vinh-nghiem', 'Vĩnh Nghiêm', r(-380, -175, 230, 440)),
    // Step 17, Quận 1 south: the walking street, Bến Thành, Phạm Ngũ Lão, the palace and the cathedral square.
    z('quan-1-south', 'D2', 'pho-di-bo-bui-vien', 'Phố đi bộ Bùi Viện', r(278, 372, 241, 259)),
    z('quan-1-south', 'D2', 'ben-thanh', 'Bến Thành', r(182, 300, 266, 372)),
    z('quan-1-south', 'D2', 'pham-ngu-lao', 'Phạm Ngũ Lão', r(282, 392, 228, 368)),
    z('quan-1-south', 'D2', 'dinh-doc-lap', 'Dinh Độc Lập', r(26, 126, 229.5, 367)),
    z('quan-1-south', 'D2', 'cong-xa-paris', 'Công xã Paris', r(126, 214, 228.5, 283)),
    z('quan-1-south', 'D2', 'cong-vien-tao-dan', 'Công viên Tao Đàn', r(-45, 22, 228.5, 368)),
    // Step 18, the Thủ Thiêm strip (THU_THIEM_EXTRA.zones).
    z('thu-thiem', 'D9', 'ben-do-thu-thiem', 'Bến đò Thủ Thiêm', r(-90, -70, -218, -192)),
    z('thu-thiem', 'D9', 'quang-truong-bo-song', 'Quảng trường Bờ Sông', r(-80, 200, -320, -203.6)),
    z('thu-thiem', 'D9', 'cong-vien-bo-song', 'Công viên bờ sông Thủ Thiêm', r(-440, 680, -320, -203.6)),
    z('thu-thiem', 'D9', 'xom-dao-thu-thiem', 'Xóm đạo Thủ Thiêm', r(-157, 0, -420, -320)),
    z('thu-thiem', 'D9', 'thap-doi', 'Công trường Tháp Đôi', r(200, 340, -420, -320)),
    z('thu-thiem', 'D9', 'ban-dao-thu-thiem', 'Bán đảo Thủ Thiêm', r(-440, 680, -420, -203.6)),
  ];
}

/** Points of an arc around (cx, cz) from angle a0 to a1 (radians, 0 = +x, PI/2 = +z). */
function arc(cx: number, cz: number, radius: number, a0: number, a1: number, steps = 10) {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push(Math.round((cx + Math.cos(a) * radius) * 10) / 10, Math.round((cz + Math.sin(a) * radius) * 10) / 10);
  }
  return out;
}
const box = (b: Rect) => [b.minX, b.minZ, b.maxX, b.minZ, b.maxX, b.maxZ, b.minX, b.maxZ];
const H = Math.PI / 2;
/** Waterways of design 1. Today only the river between the buoy lines is open; the rest is drawn as the city to come. */
export const WATERS: Water[] = [
  { id: 'song-sai-gon', name: 'SÔNG SÀI GÒN', subtitle: 'Tàu buýt sông · ca nô cho thuê', phase: 'P0',
    labels: [{ x: 108, z: -170.6 }, { x: -620, z: -170.6 }, { x: 741, z: 420, vertical: true }],
    poly: [-1000, -137.6, 620, -137.6, ...arc(620, -77.6, 60, -H, 0), 680, 860, 802.4, 860, ...arc(620, -77.6, 182.4, 0, -H), 560, -260, 470, -203.6, -1000, -203.6] },
  { id: 'thi-nghe', name: 'KÊNH THỊ NGHÈ', subtitle: 'Kênh Nhiêu Lộc – Thị Nghè', phase: 'P1', labels: [{ x: -190, z: 20, vertical: true }], poly: box(r(-205, -175, -137.6, 230)) },
  { id: 'nhieu-loc', name: 'KÊNH NHIÊU LỘC', subtitle: 'Kênh Nhiêu Lộc – Thị Nghè', phase: 'P1', labels: [{ x: -560, z: 215 }], poly: box(r(-1000, -175, 200, 230)) },
  { id: 'ben-nghe', name: 'KÊNH BẾN NGHÉ', subtitle: 'Ranh giới Quận 1 – Quận 4', phase: 'P1', labels: [{ x: 412, z: 160, vertical: true }], poly: box(r(392, 432, -137.6, 480)) },
  { id: 'tau-hu', name: 'KÊNH TÀU HŨ', subtitle: 'Bến Bình Đông', phase: 'P2', labels: [{ x: -300, z: 460 }], poly: box(r(-1000, 392, 440, 480)) },
  { id: 'kenh-te', name: 'KÊNH TẺ', subtitle: 'Ranh giới Quận 4 – Quận 7', phase: 'P2', labels: [{ x: 556, z: 460 }], poly: box(r(432, 680, 440, 480)) },
  { id: 'ong-lon', name: 'RẠCH ÔNG LỚN', subtitle: 'Quận 7 · Quận 8', phase: 'P2', labels: [{ x: 260, z: 640, vertical: true }], poly: box(r(240, 280, 480, 860)) },
  { id: 'kenh-doi', name: 'KÊNH ĐÔI', subtitle: 'Quận 8', phase: 'P2', labels: [{ x: -200, z: 705 }], poly: box(r(-640, 240, 690, 720)) },
  { id: 'xom-cui', name: 'RẠCH XÓM CỦI', subtitle: 'Quận 8', phase: 'P2', labels: [], poly: box(r(-320, -300, 480, 690)) },
  { id: 'thanh-da', name: 'KÊNH THANH ĐA', subtitle: 'Bình Thạnh', phase: 'P2', labels: [], poly: box(r(-1000, -970, -137.6, 200)) },
  { id: 'ban-nguyet', name: 'HỒ BÁN NGUYỆT', subtitle: 'Phú Mỹ Hưng', phase: 'P2', labels: [], poly: arc(400, 690, 50, 0, Math.PI * 2, 24).slice(0, -2) },
];

function inPoly(p: number[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** The district (and its part) at (x, z), ignoring water; null outside the planned city. */
export function districtAt(x: number, z: number): { district: District; part: DistrictPart } | null {
  for (const district of DISTRICTS) for (const p of district.parts) if (inside(p.rect, x, z)) return { district, part: p };
  return null;
}
/** The named area at (x, z) (docks, parks, the market, the nightlife strip, the promenade…), or null. */
export function zoneAt(x: number, z: number): Zone | null {
  for (const zone of ZONES) {
    if (zone.slice && !isWired(zone.slice)) continue;
    for (const b of zone.rects) if (inside(b, x, z)) return zone;
  }
  return null;
}
/** The waterway at (x, z), or null. Today's river is exactly RIVER between the buoy lines. */
export function waterAt(x: number, z: number): Water | null {
  for (const w of WATERS) if (inPoly(w.poly, x, z)) return w;
  return null;
}

/** What the HUD calls (x, z): a pier or named area first, then open water, then the district. */
export function areaAt(x: number, z: number): Area {
  const zone = zoneAt(x, z);
  const water = zone ? null : waterAt(x, z);
  if (water) return { title: water.name, subtitle: water.subtitle, zone: '', district: null, water: water.id, key: `w:${water.id}` };
  const under = districtAt(x, z);
  const district = zone ? DISTRICT_BY_ID[zone.district] : under?.district;
  if (!district) return { title: '', subtitle: '', zone: '', district: null, water: null, key: '' };
  // A pier stands over the water, outside every district rectangle: it takes the district's first ward.
  const ward = (under?.district === district ? under.part.ward : undefined) ?? district.parts.find((q) => q.ward)?.ward;
  return {
    title: ward ? `${district.name} · ${ward}` : district.name, subtitle: district.subtitle, zone: zone?.name ?? '',
    district: district.id, water: null, key: `${district.id}:${ward ?? ''}:${zone?.id ?? ''}`,
  };
}

const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
/** Each zone's narrowest width (m). */
const ZONE_SPAN = new Map(ZONES.map((zone) => [zone.name, Math.min(...zone.rects.map((q) => Math.min(q.maxX - q.minX, q.maxZ - q.minZ)))]));
/**
 * Hysteresis: the previous area holds while any spot within `margin` metres still belongs to it, so walking
 * along a border never flickers; a jump (teleport, respawn) switches at once. A zone narrower than twice the
 * margin inside the same district (the market lane) is never that far from its surroundings, so it takes over
 * once every spot within a quarter of its width is in it.
 */
export function settleArea(prev: Area | null, x: number, z: number, margin = 8): Area {
  const now = areaAt(x, z);
  if (!prev || prev.key === now.key) return now;
  const span = ZONE_SPAN.get(now.zone) ?? Infinity;
  if (prev.title === now.title && span < 2 * margin && RING.every(([dx, dz]) => areaAt(x + dx * span / 4, z + dz * span / 4).key === now.key)) return now;
  for (const k of [0.5, 1]) for (const [dx, dz] of RING) if (areaAt(x + dx * margin * k, z + dz * margin * k).key === prev.key) return prev;
  return now;
}

/** "ĐƯỜNG HOA SỮA" -> "Đường Hoa Sữa", "ĐẠI LỘ NGUYỄN HUỆ" -> "Đại lộ Nguyễn Huệ". */
export function streetLabel(name: string) {
  const words = name.toLocaleLowerCase('vi').split(' ').map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1));
  if (words[0] === 'Đại' && words[1] === 'Lộ') words[1] = 'lộ';
  return words.join(' ');
}
const shortLabel = (label: string) => label.replace(/^Đường /, 'Đ. ').replace(/^Đại lộ /, 'ĐL. ');
function street(id: string, name: string, x1: number, z1: number, x2: number, z2: number): Street {
  const label = streetLabel(name);
  return { id, name, label, short: shortLabel(label), x1, z1, x2, z2 };
}
/**
 * Today's streets with the names city.ts gives them (house subtitles use the same). East-west roads cross the
 * whole map; north-south roads start at the riverside road.
 */
export const STREETS: Street[] = [
  ...ROADS_Z.map((z) => street(`h${z}`, STREETS_H.get(z) ?? 'ĐƯỜNG AN HÒA', LAND.minX, z, LAND.maxX, z)),
  ...ROADS_X.map((x) => street(`v${x}`, STREETS_V.get(x) ?? 'ĐƯỜNG AN HÒA', x, ROADS_Z[0], x, LAND.maxZ)),
];
function streetDistance(s: Street, x: number, z: number) {
  const dx = Math.max(Math.min(s.x1, s.x2) - x, 0, x - Math.max(s.x1, s.x2));
  const dz = Math.max(Math.min(s.z1, s.z2) - z, 0, z - Math.max(s.z1, s.z2));
  if (!s.lines) return Math.hypot(dx, dz);
  // A district street: to its nearest centre line, less how far its asphalt and sidewalk reach (12.5 on today's roads).
  if (Math.hypot(dx, dz) > 30) return Infinity;
  let best = Infinity;
  for (const p of s.lines) for (let k = 0; k + 3 < p.length; k += 2) {
    const ax = p[k], az = p[k + 1], ex = p[k + 2] - ax, ez = p[k + 3] - az, l2 = ex * ex + ez * ez;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best - (s.reach ?? 12.5) + 12.5;
}
/** The wired slices' streets (registerStreets), by 32 m cell of their boxes. */
let districtStreets: Street[] = [];
const streetCells = new Map<number, Street[]>();
const cellOf = (cx: number, cz: number) => (cx + 1024) * 2048 + cz + 1024;
/**
 * Hands the HUD the wired slices' streets (map/mapdata.ts districtStreets() on the client, before the game starts):
 * each a name with its centre lines and reach. settleStreet then names them like today's roads.
 */
export function registerStreets(list: readonly Street[]) {
  districtStreets = list.slice();
  streetCells.clear();
  for (const s of districtStreets) {
    for (let cx = Math.floor((Math.min(s.x1, s.x2) - 16) / 32); cx <= Math.floor((Math.max(s.x1, s.x2) + 16) / 32); cx++) {
      for (let cz = Math.floor((Math.min(s.z1, s.z2) - 16) / 32); cz <= Math.floor((Math.max(s.z1, s.z2) + 16) / 32); cz++) {
        const k = cellOf(cx, cz), list2 = streetCells.get(k);
        if (list2) list2.push(s); else streetCells.set(k, [s]);
      }
    }
  }
}
/** The streets handed over so far (big map labels, tests). */
export const registeredStreets = (): readonly Street[] => districtStreets;
/**
 * The street at (x, z): the nearest one within the sidewalk (12.5 m of its centre line). The previous street
 * holds out to 14 m, so a junction keeps the name of the road you came along.
 */
export function settleStreet(prev: Street | null, x: number, z: number): Street | null {
  if (prev && streetDistance(prev, x, z) <= 14) return prev;
  let best: Street | null = null, bestD = 12.5;
  for (const s of STREETS) {
    const d = streetDistance(s, x, z);
    if (d <= bestD) { best = s; bestD = d; }
  }
  const near = streetCells.get(cellOf(Math.floor(x / 32), Math.floor(z / 32)));
  if (near) for (const s of near) {
    const d = streetDistance(s, x, z);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}
