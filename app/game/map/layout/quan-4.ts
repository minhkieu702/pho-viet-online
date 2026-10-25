/**
 * D5 QUẬN 4 · Khánh Hội (critique step 14, first P1 slice) plus the Bến Nghé canal strip between today's east edge
 * (x 352) and the canal, at design 1's coordinates: Kênh Bến Nghé x 392..432 with kè banks; Đại lộ Võ Văn Kiệt
 * along its west bank at x 372, fed by today's five east-west roads; water-only bridge decks Cầu Khánh Hội (z -108),
 * Cầu Mống (z -30, the steel footbridge motos sneak over), Calmette (54), Ông Lãnh (162) and Nguyễn Khoái (300);
 * the Khánh Hội wharf on the river with Bến Nhà Rồng, KHO 1–9 with the story's KHO 7, the cargo-ship berth and
 * cranes; the east quay with the container yard; Bến Vân Đồn on the canal bank, Nguyễn Tất Thành round the bend,
 * Khánh Hội, Hoàng Diệu, Tôn Đản, Đoàn Văn Bơ, Vĩnh Khánh (the seafood night street), Nguyễn Khoái, Xóm Chiếu with
 * its market and night unloading bays, Tôn Thất Thuyết on Kênh Tẻ; chung cư cũ, the Xóm Chiếu church, a pagoda, a
 * school, the district police, and generated hẻm networks in the deep blocks. Data only: nothing here is wired into
 * the live map (step 14 does that after the humans build merges).
 */
import { WATERS } from '../districts.ts';
import { stampSpec, STORY_STAMP } from '../stamps.ts';
import type { DistrictLayout, FenceSpec, FixtureSpec, WaterwaySpec } from './types.ts';

const H = Math.PI / 2;
const r2 = (v: number) => Math.round(v * 100) / 100;
const water = (id: string) => WATERS.find((w) => w.id === id)!.poly;
/** Design 1's river, with the south bank split where its bank kind changes (Quận 1 promenade, canal mouth, wharf). */
function river(): number[] {
  const p = water('song-sai-gon'), out: number[] = [];
  for (let k = 0; k < p.length; k += 2) {
    if (k && p[k] === out[out.length - 2] && p[k + 1] === out[out.length - 1]) continue;
    out.push(p[k], p[k + 1]);
    if (k === 0) out.push(352, -137.6, 392, -137.6, 432, -137.6);
  }
  return out;
}
const RIVER = river();

const WATERWAYS: WaterwaySpec[] = [
  // Edges 0–1 run along today's promenade and the Quận 1 strip, 2 crosses the canal mouth, the rest of the south bank is quay.
  { id: 'song-sai-gon', name: 'SÔNG SÀI GÒN', kind: 'river', poly: RIVER, bank: 'wharf', banks: [{ from: 0, to: 2, kind: 'promenade' }] },
  { id: 'ben-nghe', name: 'KÊNH BẾN NGHÉ', kind: 'canal', poly: water('ben-nghe'), bank: 'ke' },
  { id: 'kenh-te', name: 'KÊNH TẺ', kind: 'canal', poly: water('kenh-te'), bank: 'ke' },
];

/** Nguyễn Tất Thành round the river bend: (500,-60) → (570,-60), a 50 m quarter arc, then south on x 620. */
const NTT = [450, -108, 500, -60, 570, -60, 582.94, -58.3, 595, -53.3, 605.36, -45.36, 613.3, -35, 618.3, -22.94, 620, -10, 620, 425];

/**
 * The Khánh Hội port behind its fence (the story's KHO 7 stealth site, the cargo ship's berth, design 3's A5.2 yard).
 * The fence runs from the quay edge east of Bến Nhà Rồng behind the public sheds (KHO SỐ …) to KHO 7, then from
 * KHO 7's front along Nguyễn Tất Thành's river-side frontage round the bend and down the east quay to the CẢNG KHÁNH
 * HỘI gate office, and on round the container yard. Gates: the truck gate in front of KHO 7 (its guard booth just
 * inside) and CỔNG SỐ 3 by the gate office; the river, the hatch on KHO 7's quay side, its roof ladder and the
 * ship's lines are the other ways in. Inside: crate and pallet stacks with 1.5 m lanes on the west apron (a clear
 * lane to the gangway at x 527), reefers along KHO 7's east wall, container stacks in two staggered rings round the
 * bend (1.7 m slots) and two columns down the east quay, oil drums, bollards every 15 m along the quay edge, and
 * the gantry cranes' legs.
 */
const BEND = { x: 620, z: -77.6 };
/** A fixture centred `r` m from the bend's centre at `deg` (0: east, -90: north), its w along the bend. */
const onBend = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: r2(BEND.x + r * Math.cos(a)), z: r2(BEND.z + r * Math.sin(a)), yaw: Math.round(Math.atan2(-Math.cos(a), -Math.sin(a)) * 1e6) / 1e6 };
};
const CRANES = [
  { id: 'cau-truc-1', x: 516, z: -131.5, yaw: Math.PI, gauge: 10, span: 14, h: 38 },
  { id: 'cau-truc-2', x: 545, z: -131.5, yaw: Math.PI, gauge: 10, span: 14, h: 38 },
  { id: 'cau-truc-3', x: 654.07, z: -118.2, yaw: 2.443461, gauge: 10, span: 14, h: 38 },
  { id: 'cau-truc-4', x: 674.5, z: 60, yaw: H, gauge: 9, span: 14, h: 38 },
  { id: 'cau-truc-5', x: 674.5, z: 150, yaw: H, gauge: 9, span: 14, h: 38 },
];
function port(): FixtureSpec[] {
  const out: FixtureSpec[] = [];
  const box = (id: string, kind: FixtureSpec['kind'], x: number, z: number, w: number, d: number, yaw: number, h: number) => out.push({ id, kind, x: r2(x), z: r2(z), w, d, yaw, h });
  // Gantry legs: `gauge` apart across the quay (forward) and `span` along it.
  for (const c of CRANES) {
    const f = [Math.sin(c.yaw), Math.cos(c.yaw)], rt = [Math.cos(c.yaw), -Math.sin(c.yaw)];
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(`${c.id}:${i}:${j}`, 'crane-leg', c.x + (f[0] * c.gauge * i) / 2 + (rt[0] * c.span * j) / 2, c.z + (f[1] * c.gauge * i) / 2 + (rt[1] * c.span * j) / 2, 1.2, 1.2, c.yaw, c.h);
  }
  // West apron: 2.4 m crate and pallet stacks on a 3.9 m grid (1.5 m lanes), a few left out; the gangway lane stays open.
  const xs = [509.2, 513.1, 517, 520.9, 532.4, 536.3, 540.2, 544.1, 548, 551.9, 555.8], zs = [-122.6, -118.7, -114.8, -110.9];
  xs.forEach((x, i) => zs.forEach((z, j) => {
    if ((i * 3 + j * 5) % 7 === 0) return;
    const h = [1.2, 2.6, 1.8, 2.2][(i + 2 * j) % 4];
    box(`crate-${i}-${j}`, h < 1.5 ? 'pallet' : 'crate', x, z, 2.4, 2.4, 0, h);
  }));
  // Reefers along KHO 7's east wall (a lane to its roof ladder between).
  for (const [k, z] of [-122, -108, -94].entries()) box(`reefer-${k}`, 'reefer', 606, z, 12.2, 2.44, H, 2.6);
  // The bend: two staggered rings of 2-wide container stacks, 1.7 m slots between the rings.
  [-86, -66, -46, -26, -6].forEach((deg, k) => { const p = onBend(44, deg); box(`bend-a${k}`, 'container', p.x, p.z, 12.2, 4.88, p.yaw, 2.6 * [3, 2, 4, 2, 3][k]); });
  [-78, -53, -28, -3].forEach((deg, k) => { const p = onBend(36.92, deg); box(`bend-b${k}`, 'container', p.x, p.z, 12.2, 4.88, p.yaw, 2.6 * [2, 4, 3, 2][k]); });
  // Single boxes on chassis waiting in the truck yard inside the gate, and a few crate and pallet stacks.
  [-82, -50, -18].forEach((deg, k) => { const p = onBend(26, deg); box(`chassis-${k}`, 'container', p.x, p.z, 12.2, 2.44, p.yaw, 3.6); });
  for (const [k, [x, z, h]] of [[614.5, -73.5, 2.6], [614.5, -69.6, 1.2], [618.4, -73.5, 1.8], [624, -82, 2.2], [627.9, -82, 1.2]].entries()) box(`yard-crate-${k}`, h < 1.5 ? 'pallet' : 'crate', x, z, 2.4, 2.4, 0, h);
  // The east quay and the container yard behind CẢNG KHÁNH HỘI: two columns of 4-wide stacks, 1.7 m apart.
  [-55, -33, -11, 9, 30, 52, 74, 128, 150, 172].forEach((z, i) => {
    box(`yard-a${i}`, 'container', 652, z, 12.2, 9.8, H, 2.6 * (2 + (i % 3)));
    box(`yard-b${i}`, 'container', 663.5, z, 12.2, 9.8, H, 2.6 * (1 + ((i + 1) % 4)));
  });
  for (const [k, [x, z]] of [[612, -90], [628, -62], [646, -46], [611, -129]].entries()) box(`drums-${k}`, 'drums', x, z, 1.3, 1.3, 0, 0.95);
  // Bollards every 15 m along the quay edge (the ship's bow and stern lines on those at x 485 and 570).
  for (const x of [485, 500, 531, 557, 570, 585, 600, 615]) box(`bollard-${x}`, 'bollard', x, -136.9, 0.5, 0.5, 0, 0.8);
  for (const deg of [-75, -60, -45, -30, -15]) { const p = onBend(59.2, deg); box(`bollard-b${-deg}`, 'bollard', p.x, p.z, 0.5, 0.5, 0, 0.8); }
  for (let z = -60; z <= 195; z += 15) if (![53, 67, 143, 157].some((c) => Math.abs(c - z) < 2)) box(`bollard-e${z}`, 'bollard', 679.2, z, 0.5, 0.5, 0, 0.8);
  // The guard booth at KHO 7's gate.
  box('booth-kho7', 'booth', 590.6, -77.9, 2.2, 2.2, 0, 2.6);
  return out;
}
/** The fence on Nguyễn Tất Thành's river side, 0.5 m inside its frontage: radius 67.5 round the bend (centre (570, -10)). */
const bendFence = [-90, -75, -60, -45, -30, -15, 0].flatMap((deg) => { const a = (deg * Math.PI) / 180; return [r2(570 + 67.5 * Math.cos(a)), r2(-10 + 67.5 * Math.sin(a))]; });
const FENCES: FenceSpec[] = [
  { id: 'cang-tay', kind: 'fence', h: 2.4, pts: [506, -137, 506, -105, 559.6, -105] },
  {
    id: 'cang-ntt', kind: 'fence', h: 2.4, pts: [559.6, -80, 559.6, -77.5, ...bendFence, 637.5, 102.8],
    gates: [{ name: 'CỔNG KHO 7', x: 580, z: -76.2, w: 12 }, { name: 'CỔNG SỐ 3', x: 637.5, z: 96, w: 9 }],
  },
  { id: 'cang-bai', kind: 'fence', h: 2.4, pts: [637.5, 117.2, 637.5, 198, 679.4, 198] },
];

export const QUAN_4: DistrictLayout = {
  id: 'D5', key: 'quan-4', name: 'QUẬN 4 · KHÁNH HỘI',
  // Land: the Quận 1 canal strip (x 352..392, to z 318 where Quận 1 south takes over) and Quận 4 (x 432..680, z -137.6..440);
  // the outline runs out into the water so the banks, not the bounds, edge the blocks along them.
  bounds: [352, -145, 700, -145, 700, 445, 412, 445, 412, 318, 352, 318],
  waterways: WATERWAYS,
  arterials: [
    // Today's east-west roads run on from the fence ends at x 352 to Võ Văn Kiệt, keeping their names (z -108 is
    // still Bờ Sông; step 14 renames it Tôn Đức Thắng with the rest of design 1's renames).
    { id: 'bo-song', name: 'ĐƯỜNG BỜ SÔNG', cls: 'R1', pts: [352, -108, 372, -108] },
    { id: 'hoa-sua', name: 'ĐƯỜNG HOA SỮA', cls: 'R1', pts: [352, -54, 372, -54] },
    { id: 'an-hoa', name: 'ĐƯỜNG AN HÒA', cls: 'R1', pts: [352, 0, 372, 0] },
    { id: 'phuong-vi', name: 'ĐƯỜNG PHƯỢNG VĨ', cls: 'R1', pts: [352, 54, 372, 54] },
    { id: 'cho-cu', name: 'ĐƯỜNG CHỢ CŨ', cls: 'R1', pts: [352, 108, 372, 108] },
    { id: 'vo-van-kiet', name: 'ĐẠI LỘ VÕ VĂN KIỆT', cls: 'R1', pts: [372, -108, 372, 300], half: 11, sidewalk: 6, lanes: 2, bus: true, trees: 'tall' },
    // The bridges over Kênh Bến Nghé.
    { id: 'cau-khanh-hoi', name: 'CẦU KHÁNH HỘI', cls: 'R1', pts: [372, -108, 450, -108] },
    { id: 'cau-mong', name: 'CẦU MỐNG', cls: 'hem', pts: [372, -30, 450, -30], half: 1.6, traffic: false },
    { id: 'cau-calmette', name: 'CẦU CALMETTE', cls: 'R1', pts: [372, 54, 450, 54] },
    { id: 'cau-ong-lanh', name: 'CẦU ÔNG LÃNH', cls: 'R1', pts: [372, 162, 450, 162], bus: true },
    { id: 'cau-nguyen-khoai', name: 'CẦU NGUYỄN KHOÁI', cls: 'R1', pts: [372, 300, 450, 300] },
    // Quận 4: the canal bank, the port boulevard round the bend, and the streets between them.
    { id: 'ben-van-don', name: 'ĐƯỜNG BẾN VÂN ĐỒN', cls: 'R1', pts: [450, -108, 450, 425] },
    { id: 'nguyen-tat-thanh', name: 'ĐẠI LỘ NGUYỄN TẤT THÀNH', cls: 'R1', pts: NTT, half: 11, sidewalk: 6, lanes: 2, bus: true, trees: 'tall', curb: ['moto', 'loading'] },
    { id: 'khanh-hoi', name: 'ĐƯỜNG KHÁNH HỘI', cls: 'R1', pts: [520, -60, 520, 425] },
    // Vĩnh Khánh at z 0, not design 1's z 20: 20 m off Hoàng Diệu's houses left a 12 m strip with no room for a row on
    // either street. A narrow two-lane street, but classed R1 so its frontage rows come first and line it end to end.
    { id: 'vinh-khanh', name: 'ĐƯỜNG VĨNH KHÁNH', cls: 'R1', pts: [450, 0, 620, 0], half: 5, sidewalk: 4.5, lanes: 1, speed: 8, trees: 'round', closedHours: [18, 24], mix: 'oc' },
    { id: 'hoang-dieu', name: 'ĐƯỜNG HOÀNG DIỆU', cls: 'R1', pts: [450, 54, 620, 54] },
    { id: 'doan-van-bo', name: 'ĐƯỜNG ĐOÀN VĂN BƠ', cls: 'R2', pts: [450, 108, 620, 108], sidewalk: 4.5 },
    { id: 'ton-dan', name: 'ĐƯỜNG TÔN ĐẢN', cls: 'R1', pts: [450, 162, 620, 162], bus: true },
    { id: 'nguyen-khoai', name: 'ĐƯỜNG NGUYỄN KHOÁI', cls: 'R1', pts: [450, 300, 620, 300] },
    // Xóm Chiếu: narrow, classed R1 like Vĩnh Khánh so the market hall fronts it (not Tôn Thất Thuyết behind), with a
    // sidewalk wide enough for the stalls; its market-side curb is a night loading bay (hours in QUAN_4_EXTRA).
    { id: 'xom-chieu', name: 'ĐƯỜNG XÓM CHIẾU', cls: 'R1', pts: [450, 378, 620, 378], half: 5.5, sidewalk: 5.5, lanes: 1, speed: 9, curb: ['loading', 'moto'] },
    { id: 'ton-that-thuyet', name: 'ĐƯỜNG TÔN THẤT THUYẾT', cls: 'R2', pts: [450, 425, 620, 425], sidewalk: 4.5 },
    // Hẻm through the 54 m blocks between the old streets (the deep blocks get theirs from the generator).
    { id: 'hem-vk-17', name: 'HẺM 17 VĨNH KHÁNH', cls: 'hem', pts: [485, 0, 485, -22, 480, -28], half: 1.4, traffic: false },
    { id: 'hem-vk-53', name: 'HẺM 53 VĨNH KHÁNH', cls: 'hem', pts: [556, 0, 556, -20], half: 1.4, traffic: false },
    { id: 'hem-vk-38', name: 'HẺM 38 VĨNH KHÁNH', cls: 'hem', pts: [572, 0, 572, 24, 568, 30, 568, 54], half: 1.5, traffic: false },
    { id: 'hem-hd-58', name: 'HẺM 58 HOÀNG DIỆU', cls: 'hem', pts: [568, 54, 568, 79, 575, 84, 575, 108], half: 1.75, traffic: false },
    { id: 'hem-dvb-60', name: 'HẺM 60 ĐOÀN VĂN BƠ', cls: 'hem', pts: [562, 108, 562, 162], half: 1.75, traffic: false },
    { id: 'hem-bvd-120', name: 'HẺM 120 BẾN VÂN ĐỒN', cls: 'hem', pts: [450, 81, 482, 81, 486, 77, 520, 77], half: 1.4, traffic: false },
    { id: 'hem-kh-75', name: 'HẺM 75 KHÁNH HỘI', cls: 'hem', pts: [520, 135, 492, 135], half: 1.4, traffic: false },
  ],
  bridges: [
    // Design 1: canal decks stand 1 m over the street with short humps (ramps stop short of the bank roads' asphalt).
    { id: 'cau-khanh-hoi', name: 'CẦU KHÁNH HỘI', road: 'cau-khanh-hoi', over: 'ben-nghe', yHint: 1, ramp: 8 },
    { id: 'cau-mong', name: 'CẦU MỐNG', road: 'cau-mong', over: 'ben-nghe', yHint: 1.4, ramp: 8 },
    { id: 'cau-calmette', name: 'CẦU CALMETTE', road: 'cau-calmette', over: 'ben-nghe', yHint: 1, ramp: 8 },
    { id: 'cau-ong-lanh', name: 'CẦU ÔNG LÃNH', road: 'cau-ong-lanh', over: 'ben-nghe', yHint: 1, ramp: 8 },
    { id: 'cau-nguyen-khoai', name: 'CẦU NGUYỄN KHOÁI', road: 'cau-nguyen-khoai', over: 'ben-nghe', yHint: 1, ramp: 8 },
  ],
  stamps: [
    { id: 'nha-rong', kind: 'landmark', name: 'BẾN NHÀ RỒNG', subtitle: 'BẢO TÀNG • DI TÍCH LỊCH SỬ', x: 486.5, z: -129.5, w: 37, d: 13, yaw: 0, h: 13, storeys: 2, building: 'office', color: '#e9d9b0', yard: 2 },
    stampSpec('kho7'),
    // The container yard behind its gate office: the apron keeps every lot off the quay at z 20..200 (stacks: QUAN_4_EXTRA).
    { id: 'cang-khanh-hoi', kind: 'warehouse', name: 'CẢNG KHÁNH HỘI', subtitle: 'BÃI CONTAINER • CỔNG SỐ 3', x: 641.5, z: 110, w: 14, d: 8, yaw: -H, h: 4.2, storeys: 1, building: 'office', color: '#3d6f9e', yard: 83 },
    { id: 'cong-an-q4', kind: 'police', name: 'CÔNG AN QUẬN 4', subtitle: 'TRỰC BAN 24/7 • BÃI GIỮ XE VI PHẠM', x: 542.5, z: 233, w: 26, d: 18, yaw: -H, h: 12, storeys: 3, color: '#e9c46a', yard: 1 },
    stampSpec('factory-p1'),
  ],
  zoning: [
    { zone: 'park', at: [380, -125], name: 'CÔNG VIÊN BẾN NGHÉ' },
    { zone: 'warehouse', at: [600, -100], name: 'CẢNG KHÁNH HỘI' },
    { zone: 'night', at: [485, -20] },
    { zone: 'night', at: [550, -20] },
    { zone: 'night', at: [485, 27] },
    { zone: 'night', at: [545, 27] },
    { zone: 'night', at: [595, 27] },
    { zone: 'pagoda', at: [485, 150], name: 'CHÙA AN PHƯỚC' },
    { zone: 'apartment', at: [485, 230], name: 'KHÁNH HỘI' },
    { zone: 'church', at: [485, 340], name: 'NHÀ THỜ XÓM CHIẾU' },
    { zone: 'school', at: [485, 400], name: 'TRƯỜNG TIỂU HỌC XÓM CHIẾU' },
    { zone: 'market', at: [570, 400], name: 'CHỢ XÓM CHIẾU' },
  ],
  fixtures: port(),
  fences: FENCES,
  portals: [
    { id: 'p-108', x: 352, z: -108, road: 'bo-song' },
    { id: 'p-54', x: 352, z: -54, road: 'hoa-sua' },
    { id: 'p0', x: 352, z: 0, road: 'an-hoa' },
    { id: 'p54', x: 352, z: 54, road: 'phuong-vi' },
    { id: 'p108', x: 352, z: 108, road: 'cho-cu' },
  ],
};

/**
 * What the layout format has no field for yet, for step 14: curb hours (bays carry none), the gantry cranes above
 * their legs (the legs, the container stacks and the rest of the port gear are QUAN_4.fixtures) and the cargo
 * ship's berth with its moorings.
 */
export const QUAN_4_EXTRA = {
  /** Loading bays per arterial side are live in these hours (design 1 §10: market curb lanes 22:00–05:00; the port all day). */
  curbHours: { 'xom-chieu': { loading: [22, 5] as [number, number] }, 'nguyen-tat-thanh': { loading: [0, 24] as [number, number] } },
  /** Ship-to-shore gantries: legs `gauge` apart across the quay and `span` along it, the boom reaching out over the water at `yaw`. */
  cranes: CRANES,
  /** The cargo ship's berth, lines, fenders and pilot ladder (stamps.ts 'cargo-ship'). */
  ship: STORY_STAMP['cargo-ship'],
};
