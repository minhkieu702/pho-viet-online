/**
 * D3 QUẬN 3 (critique step 16, a P1 slice) at design 1's coordinates: the land south of today's map between the
 * Thị Nghè canal (x -175) and Quận 1 (x 135), down to the Tàu Hũ canal (z 440), with Quận 3's west arm south of
 * Kênh Nhiêu Lộc out to the P1 edge at x -380. Today's five south fence ends (x -108..108, z 137.5) become portals:
 * the legacy roads keep their names to Võ Thị Sáu and run on south as Nam Kỳ Khởi Nghĩa (to Võ Văn Kiệt), Trần Quốc
 * Thảo, Bà Huyện Thanh Quan, Trần Quang Khải and Đinh Công Tráng. Tân Định (z < 216): Võ Thị Sáu and Nguyễn Thị
 * Minh Khai under tall trees, Chợ Tân Định's hall and stalls, the pink Tân Định church, villas round the Hồ Con Rùa
 * roundabout (-108, 216) with corner gardens. South of it: a walled villa with its guard booth, Công an Quận 3 with
 * its impound yard, a school, Kỳ Đồng, and Cách Mạng Tháng Tám from the Dân Chủ roundabout (-108, 385) on design 1's
 * 28° line through (-257, 300), squared up to 45° where it meets Dân Chủ, the Nguyễn Trãi / Lý Chính Thắng five-way
 * and Hoàng Sa (sharper junctions fail the crosswalk rule), ending at Hoàng Sa by the canal where Cầu CMT8's works
 * close it (lô cốt, QUAN_3_EXTRA). Bàn Cờ: hẻm parallel to the streets (houses back to back on both sides), hẻm of
 * hẻm between them (82/22, 96/9) and connectors, motos only, round the chung cư cũ Bàn Cờ on Hoàng Sa (two slabs on a
 * courtyard lane, kiosk cafés, HẺM 120 on their west side); garden villas on Trần Quốc Thảo opposite Tao Đàn's south
 * half; Chùa Vĩnh Nghiêm in its walled compound on Trần Hưng Đạo; the Nhiêu Lộc and Thị Nghè canal walks; Trần Hưng
 * Đạo and Võ Văn Kiệt with the planted strip between; on the P1 edge facing Chợ Lớn (x -380) a project hoarding
 * between the road ends' lô cốt, so the edge is closed from the Nhiêu Lộc kè to Tàu Hũ. Addresses in Bàn Cờ are
 * nested ("82/22/5 ĐƯỜNG HOÀNG SA") by the P1 stack's numbering (addresses.ts).
 * Seams (agreed by coordinates with the other P1 slices, see QUAN_3_EXTRA.seams): Hoàng Sa at (-160, 137.5) and Cầu
 * Lê Văn Sỹ onto Võ Thị Sáu at (-160, 162) with Bình Thạnh; Lê Thánh Tôn (135, 162), Nguyễn Thị Minh Khai (135, 216),
 * Trần Hưng Đạo (135, 385) and Võ Văn Kiệt (135, 425) with Quận 1 south, whose palace superblock starts at the
 * frontages of the boundary roads built here. No decks: Cầu Lê Văn Sỹ is Bình Thạnh's, Cầu Công Lý and Cầu CMT8 wait.
 * Data only: nothing here is wired into the live map.
 */
import { WATERS } from '../districts.ts';
import type { DistrictLayout, FenceSpec, FixtureSpec, StampSpec, WaterwaySpec } from './types.ts';

const H = Math.PI / 2;
const r2 = (v: number) => Math.round(v * 100) / 100;
const water = (id: string) => WATERS.find((w) => w.id === id)!.poly;

const WATERWAYS: WaterwaySpec[] = [
  { id: 'thi-nghe', name: 'KÊNH THỊ NGHÈ', kind: 'canal', poly: water('thi-nghe'), bank: 'ke' },
  { id: 'nhieu-loc', name: 'KÊNH NHIÊU LỘC', kind: 'canal', poly: water('nhieu-loc'), bank: 'ke' },
  { id: 'tau-hu', name: 'KÊNH TÀU HŨ', kind: 'canal', poly: water('tau-hu'), bank: 'ke' },
];

/** CMT8's line (design 1: from Dân Chủ through Nguyễn Trãi at (-257, 300) to Hoàng Sa near x -363), z at x. */
const M = 55 / 106;
const onCmt8 = (x: number) => r2(300 + M * (x + 257));
/** Where CMT8 leaves Dân Chủ at 45° and joins its line. */
const K1x = (300 + 257 * M - 493) / (1 - M);
/** The five-way at Lý Chính Thắng, where CMT8 turns to meet Hoàng Sa at 45° (at x -318.25). */
const NGA_5 = { x: -270, z: onCmt8(-270) };
/**
 * CMT8: Dân Chủ, 45° out of the roundabout, the 28° line, 45° again from the five-way to Hoàng Sa; a vertex wherever
 * a street or hẻm ends on it, so they meet at the same point whatever order the streets are listed in.
 */
const CMT8 = [-108, 385, r2(K1x), r2(K1x + 493), ...[-160, -188, -200, -218, -244, -270].flatMap((x) => [x, onCmt8(x)]), -291.25, 272, r2(NGA_5.x - (NGA_5.z - 245)), 245];

/** Corner gardens round a roundabout: lots keep off the ring and its sidewalk (front + 5.5 m), quadrant by quadrant. */
function plazas(id: string, name: string, x: number, z: number, quads: [number, number][], front = 12.5): StampSpec[] {
  return quads.map(([sx, sz]) => ({ id: `${id}-${sx > 0 ? 'e' : 'w'}${sz > 0 ? 's' : 'n'}`, kind: 'park', name, x: x + sx * (front + 5.5), z: z + sz * (front + 5.5), w: 11, d: 11, yaw: 0 }));
}

const STAMPS: StampSpec[] = [
  // Design 1: x 64..94, z 176..202 (narrowed to 30 m so Trần Quang Khải's sidewalk stays clear); it faces Võ Thị Sáu.
  { id: 'nha-tho-tan-dinh', kind: 'church', name: 'NHÀ THỜ TÂN ĐỊNH', subtitle: 'GIÁO XỨ TÂN ĐỊNH • THÁNH LỄ 5:00 • 17:30', x: 81, z: 189, w: 30, d: 26, yaw: Math.PI, h: 18, storeys: 2, color: '#e79fb3', yard: 1 },
  // Design 1: x -350..-290, z 315..365 (the wall); the hall faces Trần Hưng Đạo across its forecourt.
  { id: 'chua-vinh-nghiem', kind: 'pagoda', name: 'CHÙA VĨNH NGHIÊM', subtitle: 'NAM MÔ A DI ĐÀ PHẬT • LỄ VU LAN', x: -320, z: 338, w: 34, d: 26, yaw: 0, h: 16, storeys: 2, color: '#e3b35a', yard: 4 },
  { id: 'vuon-chua-tay', kind: 'park', name: 'VƯỜN CHÙA VĨNH NGHIÊM', x: -340, z: 360, w: 18, d: 10, yaw: 0 },
  { id: 'vuon-chua-dong', kind: 'park', name: 'VƯỜN CHÙA VĨNH NGHIÊM', x: -300, z: 360, w: 18, d: 10, yaw: 0 },
  // The ground the seven-storey bảo tháp stands on (QUAN_3_EXTRA.towers), kept free of anything generated.
  { id: 'san-bao-thap-vinh-nghiem', kind: 'park', name: 'BẢO THÁP VĨNH NGHIÊM', x: -344, z: 335, w: 9, d: 9, yaw: 0 },
  // Design 1: about (-75, 300); it faces Nam Kỳ Khởi Nghĩa at Kỳ Đồng, 12 m deep so its block keeps a back alley, its impound yard behind on Trần Quốc Thảo.
  { id: 'cong-an-q3', kind: 'police', name: 'CÔNG AN QUẬN 3', subtitle: 'TRỰC BAN 24/7 • BÃI GIỮ XE VI PHẠM', x: -89.5, z: 322, w: 26, d: 12, yaw: -H, h: 12, storeys: 3, color: '#e9c46a', yard: 0.5 },
  // A walled villa behind its gate and guard booth on Nam Kỳ Khởi Nghĩa (Quận 3's consulate-like compounds), its garden inside the wall.
  { id: 'biet-thu-hoa-su', kind: 'landmark', name: 'BIỆT THỰ HOA SỨ', subtitle: 'KHÁCH CÔNG VỤ • CÓ BẢO VỆ 24/7', x: -137, z: 277, w: 16, d: 13, yaw: H, h: 10.5, storeys: 3, building: 'office', color: '#f2e2b6', yard: 3 },
  { id: 'vuon-hoa-su', kind: 'park', name: 'VƯỜN BIỆT THỰ HOA SỨ', x: -135.75, z: 276.25, w: 26.5, d: 26.5, yaw: 0 },
  ...plazas('ho-con-rua', 'CÔNG TRƯỜNG HỒ CON RÙA', -108, 216, [[-1, -1], [1, -1], [-1, 1], [1, 1]]),
  // Dân Chủ's other corners are the planted strip and the 45° bends of CMT8 (no lot reaches the ring there).
  ...plazas('dan-chu', 'VÒNG XOAY DÂN CHỦ', -108, 385, [[1, -1]], 17),
];

/** The hoarding line on the P1 edge (x -380) and its runs between the road corridors (Hoàng Sa, Nguyễn Trãi, Trần Hưng Đạo, Võ Văn Kiệt: half-width plus sidewalk either side). */
const EDGE_X = -379.9;
const P1_EDGE: [number, number][] = [[230.5, 235.6], [254.4, 287.1], [312.9, 367.6], [402.4, 409.6]];
const FENCES: FenceSpec[] = [
  { id: 'tuong-hoa-su', kind: 'wall', h: 2.6, pts: [-122, 263, -149.5, 263, -149.5, 290, -122, 290, -122, 263], gates: [{ name: 'CỔNG BIỆT THỰ HOA SỨ', x: -122, z: 277, w: 6 }] },
  // The district police's impound yard (design 1 §10), behind the station, its gate on Trần Quốc Thảo.
  { id: 'bai-giu-xe-q3', kind: 'fence', h: 2.2, pts: [-73, 310.5, -64.5, 310.5, -64.5, 333.5, -73, 333.5, -73, 310.5], gates: [{ name: 'CỔNG BÃI GIỮ XE VI PHẠM', x: -64.5, z: 322, w: 6 }] },
  // Vĩnh Nghiêm's compound wall, its tam quan gate on Trần Hưng Đạo.
  { id: 'tuong-vinh-nghiem', kind: 'wall', h: 2.4, pts: [-352, 367, -352, 314, -288, 314, -288, 367, -352, 367], gates: [{ name: 'TAM QUAN CHÙA VĨNH NGHIÊM', x: -320, z: 367, w: 10 }] },
  // The P1 edge facing Chợ Lớn (P2): a project hoarding ("KHU ĐẤT DỰ ÁN") 0.1 m inside the edge, between the road
  // corridors (each road end is closed by its lô cốt on the hoarding line, QUAN_3_EXTRA.loCot), so the house backs and
  // HẺM 472's dead end face a wall, not open land.
  ...P1_EDGE.map(([z0, z1], i): FenceSpec => ({ id: `rao-du-an-cho-lon-${i}`, kind: 'fence', h: 2.6, pts: [EDGE_X, z0, EDGE_X, z1] })),
];
const FIXTURES: FixtureSpec[] = [{ id: 'chot-hoa-su', kind: 'booth', x: -125, z: 271.5, w: 2.2, d: 2.2, yaw: H, h: 2.6 }];

export const QUAN_3: DistrictLayout = {
  id: 'D3', key: 'quan-3', name: 'QUẬN 3 · BIỆT THỰ · HẺM · CÀ PHÊ',
  // Design 1's D3 rectangles: Tân Định south of today's fence (z 137.5..216, x to 135), the strip west of the palace
  // superblock (x -175..-54), the Trần Hưng Đạo / Võ Văn Kiệt band (z 385..440) and the west arm south of Nhiêu Lộc
  // (x -380..-175); the roads on the Quận 1 line (Nguyễn Thị Minh Khai, Trần Quốc Thảo, Trần Hưng Đạo) are built
  // here, the palace superblock itself is Quận 1's. Bình Thạnh's Thị Nghè strip keeps x < -160 north of z 170 (the
  // Cầu Lê Văn Sỹ approach). The outline runs out into the canals so their banks, not the bounds, edge the blocks.
  bounds: [-160, 137.5, 135, 137.5, 135, 216, -54, 216, -54, 385, 135, 385, 135, 445, -380, 445, -380, 225, -180, 225, -180, 170, -160, 170],
  waterways: WATERWAYS,
  arterials: [
    // Hoàng Sa runs on from the Bình Thạnh slice's canal strip (its cross-section at the seam), round the canal corner and west along Nhiêu Lộc.
    { id: 'hoang-sa', name: 'ĐƯỜNG HOÀNG SA', cls: 'R2', pts: [-160, 137.5, -160, 245, -380, 245], sidewalk: 4.5, trees: 'tall' },
    // Võ Thị Sáu, its sidewalk broad along Chợ Tân Định's block (6.4 m: the block is then too shallow for a back alley, so the hall fits; its stalls face Nguyễn Thị Minh Khai).
    { id: 'vo-thi-sau', name: 'ĐƯỜNG VÕ THỊ SÁU', cls: 'R1', pts: [-160, 162, 0, 162], trees: 'tall' },
    { id: 'vo-thi-sau-cho', name: 'ĐƯỜNG VÕ THỊ SÁU', cls: 'R1', pts: [0, 162, 54, 162], sidewalk: 6.4, trees: 'tall' },
    { id: 'vo-thi-sau-tan-dinh', name: 'ĐƯỜNG VÕ THỊ SÁU', cls: 'R1', pts: [54, 162, 135, 162], trees: 'tall' },
    { id: 'nguyen-thi-minh-khai', name: 'ĐƯỜNG NGUYỄN THỊ MINH KHAI', cls: 'R1', pts: [-160, 216, 135, 216], trees: 'tall' },
    // Today's north-south roads keep their names to Võ Thị Sáu, then take Quận 3's.
    { id: 'tre-xanh', name: 'ĐƯỜNG TRE XANH', cls: 'R1', pts: [-108, 137.5, -108, 162] },
    { id: 'nam-ky-khoi-nghia', name: 'ĐƯỜNG NAM KỲ KHỞI NGHĨA', cls: 'R1', pts: [-108, 162, -108, 425], trees: 'tall' },
    { id: 'bang-lang', name: 'ĐƯỜNG BÀNG LĂNG', cls: 'R1', pts: [-54, 137.5, -54, 162] },
    { id: 'tran-quoc-thao', name: 'ĐƯỜNG TRẦN QUỐC THẢO', cls: 'R2', pts: [-54, 162, -54, 385], sidewalk: 4.5, trees: 'tall' },
    { id: 'trung-tam', name: 'ĐƯỜNG TRUNG TÂM', cls: 'R1', pts: [0, 137.5, 0, 162] },
    { id: 'ba-huyen-thanh-quan', name: 'ĐƯỜNG BÀ HUYỆN THANH QUAN', cls: 'R2', pts: [0, 162, 0, 216], sidewalk: 4.5, trees: 'tall' },
    { id: 'buu-dien', name: 'ĐƯỜNG BƯU ĐIỆN', cls: 'R1', pts: [54, 137.5, 54, 162] },
    { id: 'tran-quang-khai', name: 'ĐƯỜNG TRẦN QUANG KHẢI', cls: 'R2', pts: [54, 162, 54, 216], sidewalk: 4.5 },
    { id: 'benh-vien', name: 'ĐƯỜNG BỆNH VIỆN', cls: 'R1', pts: [108, 137.5, 108, 162] },
    { id: 'dinh-cong-trang', name: 'ĐƯỜNG ĐINH CÔNG TRÁNG', cls: 'R2', pts: [108, 162, 108, 216], sidewalk: 4.5 },
    // The boulevards to the P1 edge (Chợ Lớn comes in P2), bus 08 on Trần Hưng Đạo; Võ Văn Kiệt's south sidewalk is the canal walk.
    { id: 'tran-hung-dao', name: 'ĐẠI LỘ TRẦN HƯNG ĐẠO', cls: 'R1', pts: [-380, 385, 135, 385], half: 11, sidewalk: 6, lanes: 2, bus: true, trees: 'tall' },
    { id: 'vo-van-kiet', name: 'ĐẠI LỘ VÕ VĂN KIỆT', cls: 'R1', pts: [-380, 425, 135, 425], half: 11, sidewalk: 4, lanes: 2, trees: 'tall' },
    { id: 'nguyen-van-cu', name: 'ĐƯỜNG NGUYỄN VĂN CỪ', cls: 'R1', pts: [0, 385, 0, 425] },
    { id: 'cach-mang-thang-tam', name: 'ĐƯỜNG CÁCH MẠNG THÁNG TÁM', cls: 'R1', pts: CMT8 },
    // Nguyễn Trãi from the P1 edge, turning up into the five-way (design 1 has it meet CMT8 at (-257, 300)).
    { id: 'nguyen-trai', name: 'ĐƯỜNG NGUYỄN TRÃI', cls: 'R1', pts: [-380, 300, -281.69, 300, NGA_5.x, NGA_5.z] },
    { id: 'ly-chinh-thang', name: 'ĐƯỜNG LÝ CHÍNH THẮNG', cls: 'R2', pts: [-270, 245, -270, 425], sidewalk: 4.5 },
    // Its west sidewalk 5.5 m: the school's block stays shallow enough to keep its yard (no through-hẻm).
    { id: 'huynh-tinh-cua', name: 'ĐƯỜNG HUỲNH TỊNH CỦA', cls: 'R2', pts: [-160, 245, -160, onCmt8(-160)], sidewalk: 5.5 },
    { id: 'ky-dong', name: 'ĐƯỜNG KỲ ĐỒNG', cls: 'R2', pts: [-160, 300, -54, 300], sidewalk: 4.5 },
    { id: 'cao-thang', name: 'ĐƯỜNG CAO THẮNG', cls: 'R2', pts: [-200, 385, -200, onCmt8(-200)], sidewalk: 4.5 },
    // Bàn Cờ: hẻm parallel to Hoàng Sa and Kỳ Đồng (houses back to back with the street rows) and the connectors
    // between them; 2.8–3 m wide, so motos only (the police cars' dead end).
    { id: 'hem-82-hs', name: 'HẺM 82 HOÀNG SA', cls: 'hem', pts: [-218, 245, -218, onCmt8(-218)], half: 1.5, traffic: false },
    { id: 'hem-96-hs', name: 'HẺM 96 HOÀNG SA', cls: 'hem', pts: [-244, 245, -244, onCmt8(-244)], half: 1.4, traffic: false },
    { id: 'hem-13-lct', name: 'HẺM 13 LÝ CHÍNH THẮNG', cls: 'hem', pts: [-270, 271, -218, 271], half: 1.5, traffic: false },
    { id: 'hem-1-kd', name: 'HẺM 1 KỲ ĐỒNG', cls: 'hem', pts: [-218, 300, -160, 300], half: 1.5, traffic: false },
    { id: 'hem-418-cmt8', name: 'HẺM 418 CÁCH MẠNG THÁNG TÁM', cls: 'hem', pts: [-188, 300, -188, onCmt8(-188)], half: 1.4, traffic: false },
    // Hẻm of hẻm between 96 and 82 (the maze the deliveries run in: "96/9/4 Hoàng Sa", "82/22/7 Hoàng Sa").
    { id: 'hem-96-9-hs', name: 'HẺM 96/9 HOÀNG SA', cls: 'hem', pts: [-244, 262, -218, 262], half: 1.2, traffic: false },
    { id: 'hem-82-22-hs', name: 'HẺM 82/22 HOÀNG SA', cls: 'hem', pts: [-244, 286, -218, 286], half: 1.2, traffic: false },
    // Between hẻm 82 and the chung cư: the slabs keep the east half of their block, nhà ống face this hẻm on the west half.
    { id: 'hem-120-hs', name: 'HẺM 120 HOÀNG SA', cls: 'hem', pts: [-188, 245, -188, 300], half: 1.4, traffic: false },
    // West of CMT8: a hẻm from CMT8 to a dead end at the P1 edge's hoarding, one from Hoàng Sa through to Nguyễn Trãi
    // across it, and one through Vĩnh Nghiêm's west side.
    { id: 'hem-102-hs', name: 'HẺM 102 HOÀNG SA', cls: 'hem', pts: [-340, 245, -340, 300], half: 1.5, traffic: false },
    { id: 'hem-472-cmt8', name: 'HẺM 472 CÁCH MẠNG THÁNG TÁM', cls: 'hem', pts: [-291.25, 272, -375.5, 272], half: 1.5, traffic: false },
    { id: 'hem-7-nt', name: 'HẺM 7 NGUYỄN TRÃI', cls: 'hem', pts: [-366, 300, -366, 385], half: 1.5, traffic: false },
  ],
  junctions: [
    { x: -108, z: 216, control: 'roundabout', radius: 18 },
    { x: -108, z: 385, control: 'roundabout', radius: 18 },
    { x: NGA_5.x, z: NGA_5.z, control: 'signal' },
  ],
  stamps: STAMPS,
  fences: FENCES,
  fixtures: FIXTURES,
  zoning: [
    { zone: 'park', poly: [-400, 386, 150, 386, 150, 424, -400, 424], name: 'DẢI CÂY XANH TRẦN HƯNG ĐẠO' },
    { zone: 'park', at: [-300, 234], name: 'CÔNG VIÊN BỜ KÊNH NHIÊU LỘC' },
    { zone: 'park', at: [-285, 255], name: 'VƯỜN HOA CÁCH MẠNG THÁNG TÁM' },
    { zone: 'market', at: [27, 189], name: 'CHỢ TÂN ĐỊNH' },
    { zone: 'villa', at: [-81, 189] },
    { zone: 'villa', at: [-134, 189] },
    { zone: 'villa', at: [-134, 258] },
    // Trần Quốc Thảo opposite Tao Đàn's south half: garden villas behind their walls round the police station and its
    // impound yard. (The block north of Kỳ Đồng keeps its nhà ống and HẺM 39: as villas it took the wall lamps the
    // lived-in hẻm check needs.)
    { zone: 'villa', at: [-81, 342] },
    { zone: 'school', at: [-134, 320], name: 'TRƯỜNG TIỂU HỌC LÊ QUÝ ĐÔN' },
    { zone: 'apartment', at: [-175, 262], name: 'BÀN CỜ' },
  ],
  portals: [
    { id: 'p-108', x: -108, z: 137.5, road: 'tre-xanh' },
    { id: 'p-54', x: -54, z: 137.5, road: 'bang-lang' },
    { id: 'p0', x: 0, z: 137.5, road: 'trung-tam' },
    { id: 'p54', x: 54, z: 137.5, road: 'buu-dien' },
    { id: 'p108', x: 108, z: 137.5, road: 'benh-vien' },
  ],
};

/** A lô cốt (road-works enclosure, "CÔNG TRÌNH ĐANG THI CÔNG") across a road end: centre, heading of the road, width across it. */
type LoCot = { road: string; x: number; z: number; yaw: number; w: number; d: number; note: string };
const loCot = (road: string, x: number, z: number, w: number, note: string): LoCot => ({ road, x, z, yaw: H, w, d: 2.4, note });
/** Tall trees in P2 land behind the hoarding, every 7 m (rendered only: nobody can reach them). */
const belt = (x: number, z0: number, z1: number) => { const out: [number, number][] = []; for (let z = z0; z <= z1 + 1e-6; z += 7) out.push([x, r2(z)]); return out; };

/**
 * What the layout format has no field for yet, for the integration step: the seams with the other P1 slices (shared
 * node coordinates; each slice ends its road there), the lô cốt at the P1 edge and Cầu CMT8's works, the roundabout
 * islands, the landmarks' towers, Quận 3's sub-zones for the HUD and the anchors of design 3's Quận 3 activities.
 */
export const QUAN_3_EXTRA = {
  seams: [
    { slice: 'binh-thanh', x: -160, z: 137.5, road: 'hoang-sa', theirs: 'hoang-sa', note: 'Hoàng Sa, R2 (half 4.5, sidewalk 4.5, tall trees) on both sides' },
    { slice: 'binh-thanh', x: -160, z: 162, road: 'vo-thi-sau', theirs: 'cau-le-van-sy', note: 'their deck over Thị Nghè lands on this junction (Võ Thị Sáu × Hoàng Sa); its ramp ends at x -167' },
    { slice: 'quan-1-south', x: 135, z: 162, road: 'vo-thi-sau-tan-dinh', theirs: 'le-thanh-ton', note: 'R1 both sides; Võ Thị Sáu becomes Lê Thánh Tôn' },
    { slice: 'quan-1-south', x: 135, z: 216, road: 'nguyen-thi-minh-khai', theirs: 'nguyen-thi-minh-khai', note: 'R1; their Hàn Thuyên leaves this node south' },
    { slice: 'quan-1-south', x: 135, z: 385, road: 'tran-hung-dao', theirs: 'tran-hung-dao', note: 'half 11, sidewalk 6, 2 lanes; their Hàn Thuyên arrives from the north' },
    { slice: 'quan-1-south', x: 135, z: 425, road: 'vo-van-kiet', theirs: 'vo-van-kiet', note: 'half 11, sidewalk 4, 2 lanes' },
  ],
  /** Roads on the Quận 1 line built by this slice; Quận 1 south's bounds start at their far frontage (x -45, z 228.5, z 368). */
  boundaryRoads: ['tran-quoc-thao', 'nguyen-thi-minh-khai', 'tran-hung-dao'],
  /**
   * P1 edge (design 1 §11: "Q3→Chợ Lớn x -380" and Cầu CMT8): each road end closed by a lô cốt on the hoarding line
   * across its asphalt and both sidewalks (half-width plus sidewalk either side: the hoarding runs stop 0.4 m short of
   * each, closer than a person's width); colliders.
   */
  loCot: [
    loCot('hoang-sa', EDGE_X, 245, 18, 'ĐI CHỢ LỚN • CÔNG TRÌNH ĐANG THI CÔNG'),
    loCot('nguyen-trai', EDGE_X, 300, 25, 'ĐI CHỢ LỚN • CÔNG TRÌNH ĐANG THI CÔNG'),
    loCot('tran-hung-dao', EDGE_X, 385, 34, 'ĐI CHỢ LỚN • CÔNG TRÌNH ĐANG THI CÔNG'),
    loCot('vo-van-kiet', EDGE_X, 425, 30, 'ĐI CHỢ LỚN • CÔNG TRÌNH ĐANG THI CÔNG'),
  ],
  /**
   * The rest of the P1 edge: the hoarding runs (QUAN_3.fences rao-du-an-cho-lon-*, from the kè at z 230.5 to Võ Văn
   * Kiệt's sidewalk) signed KHU ĐẤT DỰ ÁN facing in, and a belt of tall trees in P2 land behind them, so the edge reads as
   * a project site, not the end of the world. Together with the lô cốt the line is closed from the Nhiêu Lộc kè to Tàu Hũ.
   */
  edge: {
    x: EDGE_X, fences: P1_EDGE.map((_, i) => `rao-du-an-cho-lon-${i}`),
    signs: [[270.75, 'KHU ĐẤT DỰ ÁN'], [340.25, 'KHU ĐẤT DỰ ÁN • CẤM VÀO'], [406, 'KHU ĐẤT DỰ ÁN']].map(([z, text]) => ({ x: EDGE_X + 0.2, z: z as number, yaw: H, text: text as string })),
    belt: belt(-384, 231, 440),
  },
  /**
   * Cầu CMT8 (design 1: over Nhiêu Lộc, closed at the P1 edge, on to Tân Bình in P3): its works fill the canal walk
   * across Hoàng Sa from where CMT8 ends (on the line it would take, x -330 at the bank), a lô cốt hoarding round the
   * abutment between Hoàng Sa's sidewalk (z 236) and the kè (z 230), its sign facing down CMT8. The canal walk's
   * dressing inside it (benches, trees, lamps) is dropped there.
   */
  cmt8Works: { x: -330, z: 233, w: 22, d: 5.5, yaw: 0, sign: { x: -322, z: 236.2, yaw: Math.PI / 4, text: 'CẦU CÁCH MẠNG THÁNG TÁM • CÔNG TRÌNH ĐANG THI CÔNG' } },
  /**
   * Roundabouts (junction hints, priority): ring outer kerb `radius`; the island and what stands on it. Held until
   * roads.ts expands roundabouts: on today's priority crossroads an island would stand on the crossing lanes, so no
   * wiring step spawns these islands, monuments or the Hồ Con Rùa rim seats (WIRING-PLAN step 16).
   */
  roundabouts: [
    { id: 'ho-con-rua', name: 'HỒ CON RÙA', x: -108, z: 216, radius: 18, island: 10.5, pool: 8, until: 'roundabout', monument: { h: 9, note: 'the turtle-lake fountain and the concrete lotus monument; students sit on the rim at night' } },
    { id: 'dan-chu', name: 'VÒNG XOAY DÂN CHỦ', x: -108, z: 385, radius: 18, island: 9, pool: 0, until: 'roundabout', monument: { h: 4, note: 'a planted island with a low fountain; five arms (CMT8 enters at 45°)' } },
  ],
  /** Tall parts of the landmark stamps the box does not show. */
  towers: [
    { stamp: 'nha-tho-tan-dinh', kind: 'bell tower', x: 81, z: 179.5, w: 6, d: 6, h: 52, note: 'the pink bell tower and spire over the entrance (inside the church footprint; the church renderer, WIRING-PLAN §2)' },
    { stamp: 'chua-vinh-nghiem', on: 'san-bao-thap-vinh-nghiem', kind: 'stupa', x: -344, z: 335, w: 7, d: 7, h: 40, note: 'the seven-storey bảo tháp inside the wall, west of the hall, on its own reserved ground' },
  ],
  /** Design 1's Quận 3 sub-zones for the HUD (rectangles, first match wins). */
  zones: [
    { id: 'ho-con-rua', name: 'Hồ Con Rùa', rects: [{ minX: -140, maxX: -76, minZ: 184, maxZ: 248 }] },
    { id: 'tan-dinh', name: 'Tân Định', rects: [{ minX: -175, maxX: 135, minZ: 137.5, maxZ: 216 }] },
    { id: 'ban-co', name: 'Bàn Cờ', rects: [{ minX: -270, maxX: -160, minZ: 245, maxZ: 350 }] },
    { id: 'vinh-nghiem', name: 'Vĩnh Nghiêm', rects: [{ minX: -380, maxX: -175, minZ: 230, maxZ: 440 }] },
  ],
  /** Anchors for design 3's Quận 3 activities (A3.1–A3.5), re-keyed to this layout. */
  activities: {
    banCoDeliveries: {
      rect: { minX: -270, maxX: -160, minZ: 245, maxZ: 385 }, gpsOff: true,
      note: 'nested addresses (addresses.ts readdress: "82/22/5 ĐƯỜNG HOÀNG SA") on the authored hẻm (13 LCT, 82, 96, 120 HS, 1 KĐ, 418 CMT8), their hẻm 82/22 and 96/9, the chung cư lanes and the generated hẻm south of CMT8',
    },
    // the rim seats wait with the island (roundabouts above): until then the snack carts stand on the corner gardens
    hoConRuaSnacks: { x: -108, z: 216, rim: 18, until: 'roundabout', hours: [18, 24] as [number, number], corners: 'ho-con-rua-*' },
    vinhNghiemIncense: { stamp: 'chua-vinh-nghiem', yard: { x: -320, z: 359 } },
    tanDinhWeddings: { stamp: 'nha-tho-tan-dinh', photo: { x: 81, z: 170.5 }, days: 'weekends' },
    tanDinhTailor: { market: 'CHỢ TÂN ĐỊNH', at: { x: 27, z: 189 } },
  },
  /** Crossings left for later: Cầu Công Lý would carry Lý Chính Thắng over Nhiêu Lộc to Bình Thạnh's Trường Sa (z 192). */
  deferred: [
    { id: 'cau-cong-ly', from: { x: -270, z: 245 }, to: { x: -270, z: 192 }, over: 'nhieu-loc', note: 'a water-only deck; needs a seam node on Trường Sa' },
    { id: 'cau-cmt8', from: { x: -318.25, z: 245 }, over: 'nhieu-loc', note: 'P3: on to Tân Bình' },
  ],
};
