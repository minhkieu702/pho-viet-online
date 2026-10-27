/**
 * D2 QUẬN 1 south · Bến Thành (critique step 17, P1 slice) at design 1's coordinates: the land between today's south
 * fence (z 137.5, x 135..352) and Kênh Tàu Hũ, the palace and Tao Đàn superblock west of x 135 (x -45..135,
 * z 228.5..368, inside Quận 3's Nguyễn Thị Minh Khai, Trần Quốc Thảo and Trần Hưng Đạo), and the Bến Nghé canal's
 * west half south of z 318. Today's Đồng Khởi, Nguyễn Huệ, Hàm Nghi and x 324 (Hai Bà Trưng) run on from their fence
 * ends: Đồng Khởi to the Công xã Paris roundabout in front of NHÀ THỜ ĐỨC BÀ (the BƯU ĐIỆN beside it, the book street
 * on the post office's far side), Nguyễn Huệ to the ỦY BAN (City Hall) behind Lê Thánh Tôn, Hàm Nghi to the Bến
 * Thành roundabout and CHỢ BẾN THÀNH, whose clock gate faces it. Lê Thánh Tôn z 162, Nguyễn Thị Minh Khai z 216 (to
 * Hàm Nghi), Lê Duẩn z 300 from the DINH ĐỘC LẬP gate (Hàn Thuyên) to the roundabout, Lê Lai on to Võ Văn Kiệt,
 * Trần Hưng Đạo z 385, Võ Văn Kiệt x 372 then z 425 along Tàu Hũ; Phan Bội Châu on the market's west flank closes for
 * the chợ đêm 18–24, Bùi Viện closes to cars 19–02; the Phạm Ngũ Lão hẻm quarter between Hàm Nghi, Lê Thánh Tôn, Lê
 * Lai and the canal strip; Công viên 30/4, 23/9 (the bus terminus) and the Trần Hưng Đạo planted strip. No decks: no
 * road here crosses water (Cầu Chữ Y off Hàm Nghi is P2). Data only: nothing here is wired into the live map.
 *
 * Seams (each slice builds alone against today's graph; integration merges equal coordinates): Quận 3 at x 135 —
 * (135, 162) Lê Thánh Tôn = Võ Thị Sáu, (135, 216) and (135, 385) Nguyễn Thị Minh Khai and Trần Hưng Đạo with Hàn
 * Thuyên's ends (T junctions once merged), (135, 425) Võ Văn Kiệt; Quận 4 on its Võ Văn Kiệt (x 372) — (372, 162)
 * Lê Thánh Tôn onto the Cầu Ông Lãnh node, (372, 300) Lê Lai and this slice's Võ Văn Kiệt onto the Cầu Nguyễn Khoái
 * node, and (372, 250) Bùi Viện, which needs Quận 4's (372,162)-(372,300) edge split there (QUAN_1_SOUTH_EXTRA.seams).
 * The bounds reach those nodes with zero-width spurs (x 352..372 at z 162, 250 and 300; x 352..355 at z 207 for HẺM
 * 24/21's mouth on Võ Văn Kiệt's sidewalk; x 372 from z 318 up to Lê Lai), so the stubs are in the layout without any
 * block reaching into Quận 4's land (its bounds hold x 352..412 to z 318). The P1 stack (p1.ts) welds the seams.
 *
 * Where it leaves design 1 (each checked in the preview): the book street runs on the post office's far side (x 216,
 * as the real Đường sách does), so the block behind it has room for a back alley; Hàn Thuyên (R2, x 135) is new: the
 * palace superblock's east side and the gate plaza, where Lê Duẩn starts; x 324 stops at Lê Thánh Tôn and Đề Thám
 * starts at Lê Lai, because 54 m blocks between x 270, 324 and the canal strip leave no room for lived hẻm, so the
 * quarter is one 82 × 88 m block cut by hẻm; Bùi Viện is at z 250 (not 255) and narrow (7 m of asphalt), so both
 * blocks along it get a back alley (the informant bar's point (345, 262) lies inside its stamp, its door on Bùi Viện);
 * Nguyễn Thị Minh Khai ends at Hàm Nghi; Lê Lai is a plain R1; Pasteur (R2, x 188) gives Phan Bội Châu a shophouse
 * row facing the market, and Công viên 30/4 is x 135..188; CÔNG AN QUẬN 1 faces Hàm Nghi at (250.5, 243); City Hall
 * and the cathedral sit 0.5 m off the Nguyễn Huệ and Đồng Khởi axes so each door's nearest street is unique (a tie
 * put the curb on whichever street came first in the list).
 *
 * After the Sài Gòn review: the CBD core rises along Lê Thánh Tôn as today's downtown does north of it (CAO ỐC SAO MAI
 * 118 m, KHÁCH SẠN HÀM NGHI 80 m, TÒA NHÀ ĐỒNG KHỞI 94 m; their glass forms in QUAN_1_SOUTH_EXTRA.skyline), the tube rows
 * stay in the Phạm Ngũ Lão quarter; the cathedral (a church, its twin spires in EXTRA.towers) stands back to z 238, 22 m
 * from Công xã Paris, and the metro kiosks 27 m or more from Bến Thành's centre, so both rings fit once roads.ts
 * expands roundabouts; Đề Thám has a 9 m asphalt half-width so the 23/9 terminus's bus bays clear its moto lane; Bùi
 * Viện's stools go out on the closed carriageway (EXTRA.nightSeats); HẺM 86 LÊ DUẨN and HẺM 12 NGUYỄN THỊ MINH KHAI
 * cross the block behind the police station.
 */
import { WATERS } from '../districts.ts';
import type { TowerSpec } from '../../city.ts';
import type { DistrictLayout, FenceSpec, StampSpec, WaterwaySpec } from './types.ts';

const H = Math.PI / 2, PI = Math.PI;
const r2 = (v: number) => Math.round(v * 100) / 100;
const water = (id: string) => WATERS.find((w) => w.id === id)!.poly;

const WATERWAYS: WaterwaySpec[] = [
  { id: 'ben-nghe', name: 'KÊNH BẾN NGHÉ', kind: 'canal', poly: water('ben-nghe'), bank: 'ke' },
  { id: 'tau-hu', name: 'KÊNH TÀU HŨ', kind: 'canal', poly: water('tau-hu'), bank: 'ke' },
];

/**
 * Landmarks at design 1's footprints. Heritage sites (no combat, see QUAN_1_SOUTH_EXTRA.heritage): the palace, the
 * cathedral, the post office, City Hall and the market hall. Tao Đàn and the palace forecourt are park stamps (no
 * building). The bar is the story's informant bar on Bùi Viện (design 1 §8, (345, 262)), a fictional business.
 */
const STAMPS: StampSpec[] = [
  { id: 'ubnd-thanh-pho', kind: 'landmark', name: 'ỦY BAN NHÂN DÂN THÀNH PHỐ', subtitle: 'TRỤ SỞ UBND • 1898–1909', x: 216.5, z: 189, w: 70, d: 26, yaw: PI, h: 22, storeys: 3, building: 'office', color: '#f0cf6a', yard: 6 },
  // Its front 22 m from Công xã Paris (z 238): the ring's 14 m kerb and 5.5 m sidewalk leave a forecourt before the doors.
  { id: 'nha-tho-duc-ba', kind: 'church', name: 'NHÀ THỜ ĐỨC BÀ', subtitle: 'VƯƠNG CUNG THÁNH ĐƯỜNG • 1863–1880', x: 161.5, z: 259.5, w: 32, d: 43, yaw: PI, h: 21, storeys: 2, color: '#b5523b', yard: 1 },
  { id: 'buu-dien-thanh-pho', kind: 'landmark', name: 'BƯU ĐIỆN THÀNH PHỐ', subtitle: 'BƯU ĐIỆN TRUNG TÂM • 1886–1891', x: 199, z: 251, w: 26, d: 38, yaw: PI, h: 15, storeys: 2, building: 'post', color: '#f2d58a', yard: 1 },
  { id: 'dinh-doc-lap', kind: 'landmark', name: 'DINH ĐỘC LẬP', subtitle: 'DI TÍCH QUỐC GIA ĐẶC BIỆT • BẢO TÀNG', x: 82, z: 300, w: 64, d: 24, yaw: H, h: 26, storeys: 4, building: 'office', color: '#e8e4d8', yard: 2 },
  { id: 'cong-vien-tao-dan', kind: 'park', name: 'CÔNG VIÊN TAO ĐÀN', x: -11.5, z: 298.25, w: 63, d: 139.5, yaw: 0 },
  { id: 'bai-co-dinh-doc-lap', kind: 'park', name: 'BÃI CỎ DINH ĐỘC LẬP', x: 115.5, z: 300, w: 20, d: 32, yaw: 0, yard: 2 },
  { id: 'cho-ben-thanh', kind: 'market', name: 'CHỢ BẾN THÀNH', subtitle: 'CHỢ NGÀY 6:00–18:00 • CHỢ ĐÊM 18:00–24:00', x: 270.5, z: 348, w: 60, d: 36, yaw: PI, h: 12, storeys: 2, building: 'shop', color: '#e3c48a', yard: 14 },
  // GA BẾN THÀNH (metro line 1, underground at the roundabout, design 1 §9): an entrance kiosk at each corner, every
  // corner at least 27 m from the roundabout's centre (clear of the r 20 ring and its 5.5 m sidewalk once it is built).
  { id: 'ga-ben-thanh-1', kind: 'landmark', name: 'GA BẾN THÀNH', subtitle: 'METRO SỐ 1 • LỐI VÀO 1', x: 247, z: 277.5, w: 6, d: 3.5, yaw: 0, h: 3.6, storeys: 1, building: 'office', color: '#d8dde2', yard: 3 },
  { id: 'ga-ben-thanh-2', kind: 'landmark', name: 'GA BẾN THÀNH', subtitle: 'METRO SỐ 1 • LỐI VÀO 2', x: 294, z: 280, w: 6, d: 3.5, yaw: 0, h: 3.6, storeys: 1, building: 'office', color: '#d8dde2', yard: 1 },
  { id: 'ga-ben-thanh-3', kind: 'landmark', name: 'GA BẾN THÀNH', subtitle: 'METRO SỐ 1 • LỐI VÀO 3', x: 248, z: 322, w: 6, d: 3.5, yaw: PI, h: 3.6, storeys: 1, building: 'office', color: '#d8dde2', yard: 1 },
  { id: 'ga-ben-thanh-4', kind: 'landmark', name: 'GA BẾN THÀNH', subtitle: 'METRO SỐ 1 • LỐI VÀO 4', x: 292, z: 322, w: 6, d: 3.5, yaw: PI, h: 3.6, storeys: 1, building: 'office', color: '#d8dde2', yard: 1 },
  // The CBD core's high-rises along Lê Thánh Tôn, continuing today's downtown towers south of the old fence (fictional
  // names): an office slab tower on the street front of the chung cư block (its slab keeps the hẻm 24/21 side), a hotel
  // tower on the Hàm Nghi corner, an office tower on Đồng Khởi's west corner. Their glass forms for skyline.ts are
  // QUAN_1_SOUTH_EXTRA.skyline; a fourth (Lê Duẩn, Trần Hưng Đạo) would take the last houses of the quarter's hẻm.
  { id: 'cao-oc-sao-mai', kind: 'landmark', name: 'CAO ỐC SAO MAI', subtitle: 'VĂN PHÒNG CHO THUÊ • 32 TẦNG', x: 326, z: 182, w: 40, d: 15, yaw: PI, h: 118, storeys: 32, building: 'office', color: '#9fb7c4', yard: 0.5 },
  { id: 'khach-san-ham-nghi', kind: 'landmark', name: 'KHÁCH SẠN HÀM NGHI', subtitle: 'KHÁCH SẠN • 22 TẦNG • NHÀ HÀNG TẦNG THƯỢNG', x: 290.4, z: 189.6, w: 14, d: 30, yaw: PI, h: 80, storeys: 22, building: 'hotel', color: '#cdbfa8', yard: 0.5 },
  { id: 'toa-nha-dong-khoi', kind: 'landmark', name: 'TÒA NHÀ ĐỒNG KHỞI', subtitle: 'VĂN PHÒNG • NGÂN HÀNG • 26 TẦNG', x: 142.3, z: 189, w: 28, d: 14, yaw: H, h: 94, storeys: 26, building: 'office', color: '#b9c6cc', yard: 0.5 },
  { id: 'cong-an-q1', kind: 'police', name: 'CÔNG AN QUẬN 1', subtitle: 'TRỰC BAN 24/7 • PHƯỜNG BẾN THÀNH', x: 250.5, z: 243, w: 22, d: 14, yaw: H, h: 12, storeys: 3, color: '#e9c46a', yard: 1 },
  { id: 'quan-bar-bui-vien', kind: 'landmark', name: 'BAR ĐÈN LỒNG', subtitle: 'BIA • COCKTAIL • NHẠC SỐNG', x: 345, z: 261.7, w: 9, d: 11, yaw: PI, h: 10, storeys: 3, building: 'food', color: '#3d3550', yard: 0.5, anchor: 'bui-vien-bar' },
  { id: 'tram-xe-buyt-23-9', kind: 'landmark', name: 'TRẠM XE BUÝT 23/9', subtitle: 'ĐIỂM ĐẦU CUỐI • TUYẾN 03 • 08 • 15', x: 346, z: 322, w: 10, d: 5, yaw: PI, h: 4.2, storeys: 1, building: 'office', color: '#5d8fb0', yard: 1 },
];

/**
 * Tao Đàn and the palace grounds behind one railing on the three sides facing Quận 3's streets, with gates; the
 * Hàn Thuyên side stays open (the gate plaza: a railing there would cut the park's paths to the street).
 */
const FENCES: FenceSpec[] = [
  {
    id: 'rao-tao-dan-dinh', kind: 'fence', h: 2.2, pts: [125.5, 229.5, -44, 229.5, -44, 367, 125.5, 367],
    gates: [
      { name: 'CỔNG DINH (NGUYỄN THỊ MINH KHAI)', x: 78, z: 229.5, w: 6 }, { name: 'CỔNG TAO ĐÀN (NGUYỄN THỊ MINH KHAI)', x: -10, z: 229.5, w: 6 },
      { name: 'CỔNG TAO ĐÀN (TRẦN QUỐC THẢO)', x: -44, z: 298, w: 6 }, { name: 'CỔNG TAO ĐÀN (TRẦN HƯNG ĐẠO)', x: -10, z: 367, w: 6 }, { name: 'CỔNG DINH (TRẦN HƯNG ĐẠO)', x: 78, z: 367, w: 6 },
    ],
  },
];

export const QUAN_1_SOUTH: DistrictLayout = {
  id: 'D2', key: 'quan-1-south', name: 'QUẬN 1 · BẾN THÀNH',
  bounds: [
    135, 137.5, 352, 137.5, 352, 162, 372, 162, 352, 162, 352, 207, 355, 207, 352, 207, 352, 250, 372, 250, 352, 250, 352, 300, 372, 300, 352, 300,
    352, 318, 372, 318, 372, 300, 372, 318, 412, 318, 412, 445, 135, 445, 135, 368, -45, 368, -45, 228.5, 135, 228.5,
  ],
  waterways: WATERWAYS,
  arterials: [
    // Today's north-south roads on from their fence ends (x 324's legacy name ĐƯỜNG TÔN ĐỨC THẮNG becomes Hai Bà Trưng with design 1's renames).
    { id: 'dong-khoi', name: 'ĐƯỜNG ĐỒNG KHỞI', cls: 'R1', pts: [162, 137.5, 162, 216] },
    { id: 'nguyen-hue', name: 'ĐẠI LỘ NGUYỄN HUỆ', cls: 'R1', pts: [216, 137.5, 216, 162] },
    { id: 'ham-nghi', name: 'ĐƯỜNG HÀM NGHI', cls: 'R1', pts: [270, 137.5, 270, 300] },
    { id: 'hai-ba-trung', name: 'ĐƯỜNG HAI BÀ TRƯNG', cls: 'R1', pts: [324, 137.5, 324, 162] },
    { id: 'le-thanh-ton', name: 'ĐƯỜNG LÊ THÁNH TÔN', cls: 'R1', pts: [135, 162, 372, 162], trees: 'tall' },
    { id: 'nguyen-thi-minh-khai', name: 'ĐƯỜNG NGUYỄN THỊ MINH KHAI', cls: 'R1', pts: [135, 216, 270, 216], trees: 'tall' },
    { id: 'han-thuyen', name: 'ĐƯỜNG HÀN THUYÊN', cls: 'R2', pts: [135, 216, 135, 385], sidewalk: 4.5, trees: 'tall' },
    // Lê Duẩn's car bays (design 1 §10; half-width 11 >= the 9 m rule), the bus routes 15 (Lê Duẩn) and 08 (Trần Hưng Đạo) and the 23/9 terminus.
    { id: 'le-duan', name: 'ĐẠI LỘ LÊ DUẨN', cls: 'R1', pts: [135, 300, 270, 300], half: 11, sidewalk: 6, lanes: 2, curb: ['car', 'car'], bus: true, trees: 'tall' },
    { id: 'le-lai', name: 'ĐƯỜNG LÊ LAI', cls: 'R1', pts: [270, 300, 372, 300], bus: true, trees: 'tall' },
    { id: 'tran-hung-dao', name: 'ĐẠI LỘ TRẦN HƯNG ĐẠO', cls: 'R1', pts: [135, 385, 372, 385], half: 11, sidewalk: 6, lanes: 2, bus: true, trees: 'tall' },
    // Võ Văn Kiệt on from Quận 4's end at (372, 300), round the canal corner and west along Tàu Hũ (its 4 m canal-side walk; no shelters fit).
    { id: 'vo-van-kiet', name: 'ĐẠI LỘ VÕ VĂN KIỆT', cls: 'R1', pts: [372, 300, 372, 425, 135, 425], half: 11, sidewalk: 4, lanes: 2, trees: 'tall' },
    // The 23/9 terminus street: asphalt half-width 9 (the bay rule), so its park-side curb holds the terminus's bus bays
    // clear of the moto lane (QUAN_1_SOUTH_EXTRA.bus: the generator lays no 'bus' bays and puts no shelter on a 125 m
    // street, so the bays, the terminus stop and the routes' turn in come from there).
    { id: 'de-tham', name: 'ĐƯỜNG ĐỀ THÁM', cls: 'R1', pts: [324, 300, 324, 425], half: 9, curb: ['loading', 'bus'] },
    { id: 'ham-nghi-nam', name: 'ĐƯỜNG HÀM NGHI', cls: 'R1', pts: [270, 385, 270, 425] },
    { id: 'pasteur', name: 'ĐƯỜNG PASTEUR', cls: 'R2', pts: [188, 300, 188, 385], trees: 'round' },
    { id: 'phan-boi-chau', name: 'ĐƯỜNG PHAN BỘI CHÂU', cls: 'R2', pts: [232, 300, 232, 385], speed: 7, closedHours: [18, 24], trees: 'round' },
    { id: 'bui-vien', name: 'ĐƯỜNG BÙI VIỆN', cls: 'R2', pts: [270, 250, 372, 250], half: 3.5, sidewalk: 2.5, speed: 7, closedHours: [19, 2], trees: 'round', mix: 'pho-tay' },
    // Lanes for people and motos only: the book street, the palace's drive round its fountain lawn, the hẻm of the Phạm Ngũ Lão quarter.
    { id: 'duong-sach', name: 'ĐƯỜNG SÁCH NGUYỄN VĂN BÌNH', cls: 'hem', pts: [216, 216, 216, 300], half: 3.5, traffic: false },
    { id: 'loi-vao-dinh', name: 'LỐI VÀO DINH ĐỘC LẬP', cls: 'hem', pts: [135, 280, 102, 280, 102, 320, 135, 320], half: 3, traffic: false },
    { id: 'hem-24-le-thanh-ton', name: 'HẺM 24 LÊ THÁNH TÔN', cls: 'hem', pts: [300, 162, 300, 250], half: 1.75, traffic: false },
    { id: 'hem-24-21-le-thanh-ton', name: 'HẺM 24/21 LÊ THÁNH TÔN', cls: 'hem', pts: [300, 207, 355, 207], half: 1.6, traffic: false },
    { id: 'hem-40-bui-vien', name: 'HẺM 40 BÙI VIỆN', cls: 'hem', pts: [300, 250, 300, 300], half: 1.6, traffic: false, mix: 'pho-tay' },
    { id: 'hem-72-bui-vien', name: 'HẺM 72 BÙI VIỆN', cls: 'hem', pts: [338, 250, 338, 300], half: 1.6, traffic: false, mix: 'pho-tay' },
    // Through the block behind the police station, from Lê Duẩn and Nguyễn Thị Minh Khai to a shared corner.
    { id: 'hem-86-le-duan', name: 'HẺM 86 LÊ DUẨN', cls: 'hem', pts: [238, 300, 238, 262], half: 1.5, traffic: false },
    { id: 'hem-12-ntmk', name: 'HẺM 12 NGUYỄN THỊ MINH KHAI', cls: 'hem', pts: [238, 216, 238, 262], half: 1.5, traffic: false },
  ],
  // Công xã Paris (its statue in the island) and Quách Thị Trang, kept as data until roads.ts expands roundabouts.
  junctions: [{ x: 162, z: 216, control: 'roundabout', radius: 14 }, { x: 270, z: 300, control: 'roundabout', radius: 20 }],
  stamps: STAMPS,
  fences: FENCES,
  zoning: [
    { zone: 'apartment', at: [330, 195], name: 'LÊ THÁNH TÔN' },
    { zone: 'park', at: [0, 300], name: 'CÔNG VIÊN TAO ĐÀN' },
    { zone: 'park', at: [140, 290], name: 'CÔNG TRƯỜNG CÔNG XÃ PARIS' },
    { zone: 'park', at: [160, 340], name: 'CÔNG VIÊN 30/4' },
    { zone: 'park', at: [345, 345], name: 'CÔNG VIÊN 23/9' },
    { zone: 'park', at: [200, 405], name: 'DẢI CÂY XANH TRẦN HƯNG ĐẠO' },
    { zone: 'park', at: [297, 405], name: 'DẢI CÂY XANH TRẦN HƯNG ĐẠO' },
    { zone: 'park', at: [348, 405], name: 'DẢI CÂY XANH TRẦN HƯNG ĐẠO' },
    // Phố Tây: Bùi Viện's blocks and the hẻm behind them (food, beer, bars; the neon of a night street).
    { zone: 'night', poly: [270, 208, 352, 208, 352, 300, 270, 300] },
  ],
  portals: [
    { id: 'p162', x: 162, z: 137.5, road: 'dong-khoi' },
    { id: 'p216', x: 216, z: 137.5, road: 'nguyen-hue' },
    { id: 'p270', x: 270, z: 137.5, road: 'ham-nghi' },
    { id: 'p324', x: 324, z: 137.5, road: 'hai-ba-trung' },
  ],
  // Quận 1: colonial ochre and cream among the pastels, dầu trees on the boulevards, more shops on every frontage.
  style: {
    palette: ['#f2d58a', '#efe2c4', '#e8c47c', '#f4ecd8', '#d9b48a', '#e4d2b0', '#c9d7e3', '#f0dcae', '#e3b9a3', '#bcd0b5', '#f3e3a0', '#d7c4dd', '#e6c3a0', '#cfe0c8'],
    trees: { R1: 'tall', R2: 'round', hem: null },
    business: { R1: 0.78, R2: 0.62, hem: 0.3 },
  },
};

/** A stall row: boxes `w` along the row, `d` deep, facing `yaw`, at the given points (x, z). */
type Stall = { x: number; z: number; w: number; d: number; yaw: number };
const row = (x: number, z0: number, z1: number, step: number, yaw: number, skip: (z: number) => boolean = () => false): Stall[] => {
  const out: Stall[] = [];
  for (let z = z0; z <= z1 + 1e-6; z += step) if (!skip(z)) out.push({ x, z: r2(z), w: 2.6, d: 1.8, yaw });
  return out;
};
/** Phan Bội Châu's carriageway between the Lê Duẩn and Trần Hưng Đạo crosswalks, clear of the hẻm mouth and crosswalk at z 336.2. */
const PBC_CLEAR = (z: number) => Math.abs(z - 336.23) < 3.6;

/**
 * A stool table set out on a closed street: the table (0.8 × 0.6 m) at (x, z) with its long side along the street,
 * facing the lane (`yaw`), three stools: one either end along the street (0.85 m out) and one on the lane side (0.75 m).
 */
type SeatSet = { x: number; z: number; yaw: number; stools: number };
/**
 * Bùi Viện's walking-street seating (19–02): a row of stool tables against each curb of its 7 m carriageway, every 3 m
 * between the barriers; none in front of a hẻm mouth (x 300 both sides, 338 south), the bar's door (345, south) or the
 * fire-breather's pitch (318, in the lane). A table's curb side keeps 0.4 m off the curb, its lane-side stool (0.25 m
 * across) reaches 1 m into the street, so 3.4 m stays clear between the rows.
 */
const BV_ROWS: [number, number[]][] = [[247.2, [300, 318]], [252.8, [300, 318, 338, 345]]];
const bvSeats = (): SeatSet[] => BV_ROWS.flatMap(([z, skip]) => {
  const out: SeatSet[] = [];
  for (let x = 284; x <= 354 + 1e-6; x += 3) if (!skip.some((s) => Math.abs(x - s) < 3.2)) out.push({ x, z, yaw: z < 250 ? 0 : PI, stools: 3 });
  return out;
});

/**
 * What the layout format has no field for yet: seam nodes with Quận 3 and Quận 4, closure barriers, the night
 * market's stalls, heritage (no-combat) zones, towers and statues above or beside the stamps, the metro station and
 * bus terminus, curb hours, the activity anchors of design 3 (A2.1–A2.6), and the P1 edge's road-works barricade.
 */
export const QUAN_1_SOUTH_EXTRA = {
  seams: [
    { x: 135, z: 162, slice: 'quan-3', mine: 'le-thanh-ton', theirs: 'vo-thi-sau', join: 'straight on (no signal)' },
    { x: 135, z: 216, slice: 'quan-3', mine: 'nguyen-thi-minh-khai + han-thuyen', theirs: 'nguyen-thi-minh-khai', join: 'T junction, priority (Hàn Thuyên R2 yields)' },
    { x: 135, z: 385, slice: 'quan-3', mine: 'tran-hung-dao + han-thuyen', theirs: 'tran-hung-dao', join: 'T junction, priority (Hàn Thuyên R2 yields)' },
    { x: 135, z: 425, slice: 'quan-3', mine: 'vo-van-kiet', theirs: 'vo-van-kiet', join: 'straight on' },
    { x: 372, z: 162, slice: 'quan-4', mine: 'le-thanh-ton', theirs: 'vo-van-kiet + cau-ong-lanh (node at (372, 162))', join: 'four-way, signal' },
    { x: 372, z: 250, slice: 'quan-4', mine: 'bui-vien', theirs: 'vo-van-kiet', join: 'split Quận 4\'s vo-van-kiet edge (372, 162)-(372, 300) at z 250; T, priority' },
    { x: 372, z: 300, slice: 'quan-4', mine: 'le-lai + vo-van-kiet', theirs: 'vo-van-kiet + cau-nguyen-khoai (node at (372, 300))', join: 'four-way, signal' },
    { x: 355, z: 207, slice: 'quan-4', mine: 'hem-24-21-le-thanh-ton', theirs: 'vo-van-kiet west sidewalk', join: 'footway (355, 207)-(359.6, 207) onto its walking line' },
  ],
  /** Streets closed to vehicles on a schedule (ArterialSpec.closedHours) and the barriers rolled out across them. */
  closures: {
    'bui-vien': { hours: [19, 2] as [number, number], kind: 'walking street', barriers: [{ ax: 280.2, az: 246.5, bx: 280.2, bz: 253.5 }, { ax: 357.6, az: 246.5, bx: 357.6, bz: 253.5 }] },
    'phan-boi-chau': { hours: [18, 24] as [number, number], kind: 'chợ đêm', barriers: [{ ax: 227.5, az: 314.6, bx: 236.5, bz: 314.6 }, { ax: 227.5, az: 370.4, bx: 236.5, bz: 370.4 }] },
  },
  /**
   * Chợ Bến Thành: the night market fills Phan Bội Châu's carriageway (two rows against the curbs, a 5.4 m walk down the
   * middle) while it is closed, 18–24; the day stalls stand on the hall's 11 m apron on Đề Thám and stay on at night.
   * The hall's 40 counters, food court and gates are its interior (design 3 A2.1).
   */
  market: {
    night: { hours: [18, 24] as [number, number], stalls: [...row(228.4, 316.6, 368.6, 3, H, PBC_CLEAR), ...row(235.6, 316.6, 368.6, 3, -H, PBC_CLEAR)] },
    day: { hours: [6, 24] as [number, number], stalls: row(302, 333, 363, 3, H) },
    loading: { road: 'de-tham', side: 'west', hours: [22, 5] as [number, number] },
    taxiRank: { road: 'le-lai', side: 'south', x0: 284, x1: 306, z: 305.9 },
  },
  /**
   * Phố Tây at night: Bùi Viện's sidewalks are only 2.5 m (the generator's tables and parked bikes need the band in
   * front of the shops, which a street this narrow does not have), so while it is closed (19–02) its bars and quán
   * put their stools out on the carriageway, as the real street does: two rows against the curbs, a lane between.
   * Each stool is a 'cafe-seat' POI for the wiring (hours as the closure). The street's businesses keep the generator's
   * night mix until a 'pho-tay' street mix (bars, hostels, tour offices, massage, money exchange) exists in gen/buildings.ts.
   */
  nightSeats: {
    road: 'bui-vien', hours: [19, 2] as [number, number], lane: 2.4, table: { w: 0.8, d: 0.6 }, stool: { along: 0.85, lane: 0.75, r: 0.25 }, tables: bvSeats(), name: 'BÙI VIỆN', dish: 'bia' as const, district: 'D2' as const,
    /** The walking street's neon gateways just inside its barriers, the posts behind the curbs. */
    arches: [{ ax: 281.6, az: 246.15, bx: 281.6, bz: 253.85, text: 'PHỐ ĐI BỘ BÙI VIỆN', sub: 'PHỐ TÂY • ẨM THỰC • ÂM NHẠC' }, { ax: 356.2, az: 246.15, bx: 356.2, bz: 253.85, text: 'PHỐ ĐI BỘ BÙI VIỆN', sub: 'PHỐ TÂY • ẨM THỰC • ÂM NHẠC' }],
  },
  /** The book street's kiosks against the post office's side wall (8–21), a 5 m lane left open. */
  bookstalls: { hours: [8, 21] as [number, number], stalls: row(213.4, 233, 266, 3.3, H).map((s) => ({ ...s, w: 2.8, d: 1.6 })) },
  /**
   * Heritage sites: no combat (design 1 §8 sensitivity): weapons holstered inside, firing there is 3 wanted stars at
   * once, nothing breakable. The market allows chases (shoplifters, pickpockets: design 3 A2.1) but no gunfire.
   */
  heritage: [
    { id: 'dinh-doc-lap', name: 'DINH ĐỘC LẬP', poly: [26, 229.5, 126, 229.5, 126, 367, 26, 367], noCombat: true, noWeapons: true, indestructible: true, wanted: 3 },
    { id: 'nha-tho-duc-ba', name: 'NHÀ THỜ ĐỨC BÀ', poly: [142.5, 229, 182, 229, 182, 283, 142.5, 283], noCombat: true, noWeapons: true, indestructible: true, wanted: 3 },
    { id: 'buu-dien-thanh-pho', name: 'BƯU ĐIỆN THÀNH PHỐ', poly: [184, 228.5, 214, 228.5, 214, 272, 184, 272], noCombat: true, noWeapons: true, indestructible: true, wanted: 3 },
    { id: 'ubnd-thanh-pho', name: 'ỦY BAN NHÂN DÂN THÀNH PHỐ', poly: [175, 170, 258, 170, 258, 206, 175, 206], noCombat: true, noWeapons: true, indestructible: true, wanted: 3 },
    { id: 'cho-ben-thanh', name: 'CHỢ BẾN THÀNH', poly: [240.5, 330, 300.5, 330, 300.5, 366, 240.5, 366], noCombat: true, noWeapons: false, indestructible: true, wanted: 2 },
  ],
  /**
   * Parts that stand above or beside a stamp's box, inside its footprint (the renderer's colonial forms): the church
   * renderer (WIRING-PLAN §2, by typology 'church') raises the cathedral's twin spires over its gabled front.
   */
  towers: [
    { stamp: 'ubnd-thanh-pho', kind: 'clock tower', x: 216.5, z: 179.5, w: 6, d: 6, h: 40 },
    { stamp: 'nha-tho-duc-ba', kind: 'spire', x: 153, z: 240.5, w: 5, d: 5, h: 46 },
    { stamp: 'nha-tho-duc-ba', kind: 'spire', x: 170, z: 240.5, w: 5, d: 5, h: 46 },
    { stamp: 'cho-ben-thanh', kind: 'clock gate', x: 270.5, z: 332, w: 10, d: 4, h: 24 },
  ],
  /**
   * The CBD towers' forms for skyline.ts (city.ts TowerSpec): the wiring renders these stamps as 'tower' plots like
   * today's downtown, not as officeBuilding boxes.
   */
  skyline: [
    { stamp: 'cao-oc-sao-mai', tower: { form: 'glass', floor: 3.7, glass: '#7fa3b8', frame: '#9fb7c4', pattern: 1, crown: 'spire', podium: 2 } },
    { stamp: 'khach-san-ham-nghi', tower: { form: 'hotel', floor: 3.6, glass: '#8aa0a8', frame: '#cdbfa8', pattern: 2, crown: 'sign', podium: 1 } },
    { stamp: 'toa-nha-dong-khoi', tower: { form: 'stepped', floor: 3.6, glass: '#6f93a6', frame: '#b9c6cc', pattern: 0, crown: 'flat', podium: 2 } },
  ] satisfies { stamp: string; tower: TowerSpec }[],
  /**
   * Statues on roundabout islands: held until roads.ts expands roundabouts (today both nodes are priority crossroads
   * and an island would stand on the crossing lanes), so no wiring step spawns them (WIRING-PLAN step 17).
   */
  statues: [
    { name: 'TƯỢNG ĐỨC MẸ HÒA BÌNH', x: 162, z: 216, island: 7, until: 'roundabout' },
    { name: 'TƯỢNG ĐÀI TRẦN NGUYÊN HÃN', x: 270, z: 300, island: 11, until: 'roundabout' },
  ],
  fountains: [{ name: 'HỒ PHUN NƯỚC DINH ĐỘC LẬP', x: 115.5, z: 300, r: 6 }],
  /** GA BẾN THÀNH, metro line 1 (P1 fast travel, step 20): underground at the roundabout, entered at its corner kiosks. */
  metro: { station: 'GA BẾN THÀNH', x: 270, z: 300, entrances: ['ga-ben-thanh-1', 'ga-ben-thanh-2', 'ga-ben-thanh-3', 'ga-ben-thanh-4'] },
  /**
   * The 23/9 terminus (routes 03, 08, 15): buses wait along Đề Thám's park-side curb (its 'bus' curb use; Đề Thám's
   * asphalt half-width is 9, so a 2.2 m bay stays clear of the moto lane). The generator lays no 'bus' bays and puts no
   * shelter on a 125 m street, so the wiring builds these bays as kind 'bus', treats \`route\` as a bus edge for
   * transit.ts (lines 03, 08 and 15 turn in from Lê Lai and stop at the terminus) and puts the stop at the stamp.
   */
  bus: { terminus: 'tram-xe-buyt-23-9', routes: ['03', '08', '15'], route: 'de-tham', stop: { x: 336.4, z: 330, yaw: -H }, bays: [{ road: 'de-tham', side: 'east', z0: 322, z1: 364, depth: 2.2, kind: 'bus' as const }] },
  /** Trucks are banned in Quận 1 06:00–22:00 (design 1 §10). */
  truckBan: [6, 22] as [number, number],
  /** Road-works barricade at the foot of the future Cầu Chữ Y (P2), across Hàm Nghi's line on the canal walk. */
  locot: [{ name: 'CÔNG TRÌNH ĐANG THI CÔNG • CẦU CHỮ Y', x: 270, z: 438, w: 9, yaw: 0 }],
  /** Anchors for design 3's activities (A2.2–A2.6): where each happens. */
  activities: {
    'ca-phe-bet': { hours: [18, 23] as [number, number], spots: [[145.5, 322], [145.5, 334], [145.5, 346], [145.5, 358], [150, 230], [173, 230]] },
    'bird-cafe': { day: 'sunday', hours: [7, 10] as [number, number], x: -10, z: 255 },
    'tai-chi': { hours: [5, 8] as [number, number], x: -10, z: 335 },
    'co-tuong': { x: -28, z: 300 },
    'palace-placards': { count: 12, ring: { x: 82, z: 300, rx: 20, rz: 40 } },
    'bui-vien-promoters': { hours: [19, 2] as [number, number], spots: [[284, 254.8], [314, 254.8], [345, 254.8], [326, 245.2], [290, 245.2]] },
    'fire-breather': { hours: [20, 1] as [number, number], x: 318, z: 250 },
    'post-counter': { stamp: 'buu-dien-thanh-pho' },
    'bus-rides': { stamp: 'tram-xe-buyt-23-9' },
  },
  /** The story's reserved informant bar (design 1 §8): mission point and door. */
  story: { 'bui-vien-bar': { stamp: 'quan-bar-bui-vien', at: { x: 345, z: 262, yaw: PI }, door: { x: 345, z: 255.4 } } },
};
