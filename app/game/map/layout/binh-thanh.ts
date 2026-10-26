/**
 * D4 BÌNH THẠNH east of x -700 plus the D1 Thị Nghè canal strip x -175..-138 (critique step 15, a P1 slice), at
 * design 1's coordinates: Kênh Thị Nghè x -205..-175 with six water-only decks carrying today's five east-west roads
 * and Võ Thị Sáu over it (Thị Nghè 2 z -108, Thị Nghè z -54, Điện Biên Phủ 0, Bông 54, Kiệu 108, Lê Văn Sỹ 162);
 * the Hoàng Sa strip with its canal park, split north of z -24 into two one-way service carriageways (x -166
 * southbound, x -146 northbound) round the planted median that keeps Cầu Ba Son's ramp corridor (x -163..-151) free
 * for step 20; Trường Sa on the west bank and along Kênh Nhiêu Lộc; Nguyễn Hữu Cảnh curving inland round the
 * riverside park and tower complex with THÁP BỜ SÔNG; Xô Viết Nghệ Tĩnh on its diagonal through Hàng Xanh (signalled
 * at grade, P1) to Bến xe Miền Đông cũ, the coach station with its coach lane, bays and ticket booths; Điện Biên Phủ,
 * Đinh Tiên Hoàng, Phan Đăng Lưu, Phan Xích Long; Đinh Bộ Lĩnh, Lê Quang Định and Nơ Trang Long on the P1 edge;
 * Chợ Bà Chiểu (its night loading lane) facing Lăng Ông across Phan Đăng Lưu, Bệnh viện Bình Thạnh, the district police
 * at Hàng Xanh, chung cư Văn Thánh on Nguyễn Hữu Cảnh, a school, quán nhậu on Phan Xích Long's canal-side rows (its
 * sidewalks 4.5 m, so the stool tables and parked bikes fit in front of them), generated hẻm networks in every deep
 * block, and the Nhiêu Lộc bank as the renovated canal has it: a kè and a linear park along Trường Sa (CÔNG VIÊN BỜ KÊNH
 * TRƯỜNG SA, matching Quận 3's park across the water; the stilt-house typology is Quận 8's, P2). Data only: nothing here
 * is wired into the live map; BINH_THANH_EXTRA lists what the format has no field for (seams, lô cốt, the P1 edge's
 * hoarding, the deck, the dock, corridors, curb hours, the canal park's activity anchors).
 */
import { WATERS } from '../districts.ts';
import type { DistrictLayout, FixtureSpec, StampSpec, WaterwaySpec } from './types.ts';

const H = Math.PI / 2;
const water = (id: string) => WATERS.find((w) => w.id === id)!.poly;
/** The P1 edge's hoarding line, 1 m beyond Nơ Trang Long's west sidewalk (x -700 - 7 - 5.5). */
const P2_EDGE_X = -713.5;

/** Kênh Nhiêu Lộc (design 1: z 200..230, x -1000..-175), its north bank vertices at x -700 and -480 (where the canal park and Trường Sa's bend start). */
const NHIEU_LOC = [-1000, 200, -700, 200, -480, 200, -175, 200, -175, 230, -1000, 230];
const WATERWAYS: WaterwaySpec[] = [
  { id: 'song-sai-gon', name: 'SÔNG SÀI GÒN', kind: 'river', poly: water('song-sai-gon'), bank: 'promenade' },
  { id: 'thi-nghe', name: 'KÊNH THỊ NGHÈ', kind: 'canal', poly: water('thi-nghe'), bank: 'ke' },
  { id: 'nhieu-loc', name: 'KÊNH NHIÊU LỘC', kind: 'canal', poly: NHIEU_LOC, bank: 'ke' },
];

/**
 * Xô Viết Nghệ Tĩnh: design 1's 16° diagonal from Cầu Thị Nghè towards the coach station, turned to 45° for 30 m
 * either side of Hàng Xanh so the boulevards cross at a junction whose crosswalks stay square (a crossing under 42°
 * makes them half as long again as the road is wide). Bends are 40 m fillets (points precomputed, 1 cm), so the
 * sidewalk band and its parked motos follow the curb round them.
 */
const XVNT_EAST = [-220, -54, -347.47, -32.15, -352.26, -31.02, -356.87, -29.31, -361.24, -27.05, -365.3, -24.27, -368.99, -21.01, -390, 0];
const XVNT_WEST = [-390, 0, -411.54, 21.54, -415.01, 24.63, -418.82, 27.3, -422.91, 29.5, -427.23, 31.22, -431.71, 32.43, -700, 88];
/**
 * Nguyễn Hữu Cảnh round the riverside tower complex (design 1 curves inland to z -40; z -55 keeps the park its 17 m
 * frontage), past Đinh Bộ Lĩnh before it turns (no junction on a bend), with 30 m and 20 m fillets. From Trường Sa to
 * Đinh Bộ Lĩnh it runs straight on z -108.
 */
const NHC = [
  -440, -108, -447.06, -108, -451.12, -107.72, -455.1, -106.9, -458.94, -105.55, -462.56, -103.68, -465.89, -101.35, -468.88, -98.59,
  -501.12, -64.41, -504.11, -61.65, -507.44, -59.32, -511.06, -57.45, -514.9, -56.1, -518.88, -55.28, -522.94, -55,
  -670.04, -55, -672.67, -55.17, -675.26, -55.69, -677.75, -56.55, -680.12, -57.73, -682.3, -59.2, -684.28, -60.95, -686, -62.95, -700, -81.5,
];

/** Riverside towers of the complex (design 1: 4–6 of 120–180 m), standing back from Nguyễn Hữu Cảnh in the park. */
const TOWERS: [string, number, number, number, number][] = [['A', -665, -108, 26, 175], ['B', -628, -108, 26, 150], ['C', -530, -112, 24, 140], ['D', -495, -121, 18, 120]];
const STAMPS: StampSpec[] = [
  // Design 1: x -600..-560, z -120..-80, 320 m with a second observation deck and the parachute jump (BINH_THANH_EXTRA.deck).
  {
    id: 'thap-bo-song', kind: 'landmark', name: 'THÁP BỜ SÔNG', subtitle: 'ĐÀI QUAN SÁT TẦNG 79 • NHẢY DÙ', x: -580, z: -100, w: 40, d: 40, yaw: 0, h: 320, storeys: 81, building: 'office', color: '#a9c4d6', yard: 4,
    anchor: 'thap-bo-song', ways: [{ kind: 'door', x: -580, z: -120.8, yaw: Math.PI }],
  },
  ...TOWERS.map(([k, x, z, w, h]): StampSpec => ({ id: `can-ho-bo-song-${k.toLowerCase()}`, kind: 'landmark', name: 'CĂN HỘ BỜ SÔNG', subtitle: `THÁP ${k} • KHU ĐÔ THỊ BỜ SÔNG`, x, z, w, d: w, yaw: 0, h, storeys: Math.round(h / 3.3), building: 'home', color: '#cfd8dc', yard: 3 })),
  // The old coach station (design 1: lot x -687..-593, z 100..148, the prologue drop-off at (-640, 124)): the terminal
  // hall fronts the coach lane (its bays), its back door opens on the forecourt and the ticket booths along Xô Viết
  // Nghệ Tĩnh. The yard keeps the precinct (forecourt, bays, the lane's far side) clear of houses.
  {
    id: 'ben-xe-mien-dong', kind: 'landmark', name: 'BẾN XE MIỀN ĐÔNG CŨ', subtitle: 'BẾN XE KHÁCH • VÉ ĐI CÁC TỈNH', x: -644, z: 110.5, w: 80, d: 17, yaw: 0, h: 9, storeys: 1, building: 'office', color: '#d8c9a3', yard: 24,
    anchor: 'ben-xe-mien-dong', ways: [{ kind: 'door', x: -644, z: 101.2, yaw: Math.PI }],
  },
  // Lăng Ông (design 1: x -560..-520, z 68..94) faces Chợ Bà Chiểu across Phan Đăng Lưu. A heritage site: no combat.
  { id: 'lang-ong', kind: 'pagoda', name: 'LĂNG ÔNG BÀ CHIỂU', subtitle: 'LĂNG TẢ QUÂN LÊ VĂN DUYỆT', x: -535, z: 84.25, w: 40, d: 21.5, yaw: 0, h: 9, storeys: 1, color: '#e2b04a', yard: 1, anchor: 'lang-ong' },
  { id: 'benh-vien-binh-thanh', kind: 'hospital', name: 'BỆNH VIỆN BÌNH THẠNH', subtitle: 'CẤP CỨU 24/24 • KHÁM BỆNH', x: -367.5, z: 135, w: 115, d: 28, yaw: Math.PI, h: 18, storeys: 5, color: '#eef1f2', yard: 1 },
  // Design 1 puts the impound at (-400, 130), inside the hospital's footprint; the station and its yard stand at Hàng Xanh.
  { id: 'cong-an-binh-thanh', kind: 'police', name: 'CÔNG AN QUẬN BÌNH THẠNH', subtitle: 'TRỰC BAN 24/7 • BÃI GIỮ XE VI PHẠM', x: -345, z: 30, w: 26, d: 18, yaw: Math.PI, h: 12, storeys: 3, color: '#e9c46a', yard: 1 },
];

/** Ticket booths along the coach station's forecourt (the touts' "vé rẻ" counter is one of them). */
const FIXTURES: FixtureSpec[] = [
  ...[-626, -614, -602].map((x, i): FixtureSpec => ({ id: `quay-ve-${i}`, kind: 'booth', x, z: 92, w: 2.2, d: 2.2, yaw: 0, h: 2.6 })),
  // Bến Bình Thạnh (design 1's waterbus stop at x -600): bollards either side of its gangway on the promenade edge.
  ...[-606, -594].map((x): FixtureSpec => ({ id: `ben-binh-thanh-${-x}`, kind: 'bollard', x, z: -136.9, w: 0.5, d: 0.5, yaw: 0, h: 0.8 })),
];

export const BINH_THANH: DistrictLayout = {
  id: 'D4', key: 'binh-thanh', name: 'BÌNH THẠNH · BỜ KÊNH THỊ NGHÈ',
  // Land: the Thị Nghè strip (x -175..-138 between the river and z 137.5, the seam with Quận 3), a tongue to z 170
  // that carries Cầu Lê Văn Sỹ's east end, and Bình Thạnh x -700..-205 from the river to Kênh Nhiêu Lộc. The outline
  // runs out into the water so the banks, not the bounds, edge the blocks along them; x -700 is Nơ Trang Long's line,
  // and east of x -482 it follows Trường Sa (the 8 m between its curb and the kè hold only the canal walk).
  bounds: [-700, -145, -138, -145, -138, 137.5, -160, 137.5, -160, 170, -190, 170, -190, 192, -460, 192, -480, 185, -482, 185, -482, 210, -700, 210],
  waterways: WATERWAYS,
  arterials: [
    // Today's east-west roads run on from the west fence ends (x -138) to Hoàng Sa, keeping their names.
    { id: 'bo-song', name: 'ĐƯỜNG BỜ SÔNG', cls: 'R1', pts: [-138, -108, -166, -108] },
    { id: 'hoa-sua', name: 'ĐƯỜNG HOA SỮA', cls: 'R1', pts: [-138, -54, -166, -54] },
    { id: 'an-hoa', name: 'ĐƯỜNG AN HÒA', cls: 'R1', pts: [-138, 0, -160, 0], bus: true },
    { id: 'phuong-vi', name: 'ĐƯỜNG PHƯỢNG VĨ', cls: 'R1', pts: [-138, 54, -160, 54] },
    { id: 'cho-cu', name: 'ĐƯỜNG CHỢ CŨ', cls: 'R1', pts: [-138, 108, -160, 108] },
    // Hoàng Sa: two one-way service carriageways north of the Y at z -24 (Ba Son's ramp corridor between them), then two-way to the Quận 3 seam.
    { id: 'hoang-sa-tay', name: 'ĐƯỜNG HOÀNG SA', cls: 'R2', pts: [-166, -108, -166, -44, -160, -24], half: 3, sidewalk: 3, lanes: 1, oneWay: 1, trees: 'round' },
    { id: 'hoang-sa-dong', name: 'ĐƯỜNG HOÀNG SA', cls: 'R2', pts: [-160, -24, -146, -44, -146, -108], half: 3, sidewalk: 3, lanes: 1, oneWay: 1, trees: 'round' },
    // The two-way stretch has Quận 3's cross-section (sidewalk 4.5, tall trees), so the two weld at (-160, 137.5).
    { id: 'hoang-sa', name: 'ĐƯỜNG HOÀNG SA', cls: 'R2', pts: [-160, -24, -160, 137.5], sidewalk: 4.5, trees: 'tall' },
    // The six Thị Nghè bridges, from the strip to Trường Sa on the west bank (Lê Văn Sỹ from Quận 3's Hoàng Sa × Võ Thị Sáu).
    { id: 'cau-thi-nghe-2', name: 'CẦU THỊ NGHÈ 2', cls: 'R1', pts: [-166, -108, -220, -108] },
    { id: 'cau-thi-nghe', name: 'CẦU THỊ NGHÈ', cls: 'R1', pts: [-166, -54, -220, -54], bus: true },
    { id: 'cau-dien-bien-phu', name: 'CẦU ĐIỆN BIÊN PHỦ', cls: 'R1', pts: [-160, 0, -220, 0], bus: true },
    { id: 'cau-bong', name: 'CẦU BÔNG', cls: 'R1', pts: [-160, 54, -220, 54] },
    { id: 'cau-kieu', name: 'CẦU KIỆU', cls: 'R1', pts: [-160, 108, -220, 108] },
    { id: 'cau-le-van-sy', name: 'CẦU LÊ VĂN SỸ', cls: 'R1', pts: [-160, 162, -220, 162] },
    // Bình Thạnh.
    // Streets longer than about 400 m are authored in two stretches (one name): shop names never repeat within a stretch,
    // and a name cycle comes round after 410 m (gen/buildings.ts nameOn); house numbers restart at the joint.
    { id: 'truong-sa', name: 'ĐƯỜNG TRƯỜNG SA', cls: 'R2', pts: [-220, -108, -220, 192, -440, 192], trees: 'round' },
    { id: 'truong-sa-nhieu-loc', name: 'ĐƯỜNG TRƯỜNG SA', cls: 'R2', pts: [-440, 192, -460, 192, -480, 185, -700, 185], trees: 'round' },
    { id: 'nguyen-huu-canh', name: 'ĐẠI LỘ NGUYỄN HỮU CẢNH', cls: 'R1', pts: [-220, -108, -440, -108], half: 11, sidewalk: 6, lanes: 2, trees: 'tall' },
    { id: 'nguyen-huu-canh-bo-song', name: 'ĐẠI LỘ NGUYỄN HỮU CẢNH', cls: 'R1', pts: NHC, half: 11, sidewalk: 6, lanes: 2, trees: 'tall' },
    { id: 'xo-viet-nghe-tinh', name: 'ĐƯỜNG XÔ VIẾT NGHỆ TĨNH', cls: 'R1', pts: XVNT_EAST, bus: true },
    { id: 'xo-viet-nghe-tinh-mien-dong', name: 'ĐƯỜNG XÔ VIẾT NGHỆ TĨNH', cls: 'R1', pts: XVNT_WEST, bus: true },
    { id: 'dien-bien-phu', name: 'ĐƯỜNG ĐIỆN BIÊN PHỦ', cls: 'R1', pts: [-220, 0, -390, 0], half: 11, sidewalk: 6, lanes: 2, bus: true, trees: 'tall' },
    { id: 'dien-bien-phu-hang-xanh', name: 'ĐƯỜNG ĐIỆN BIÊN PHỦ', cls: 'R1', pts: [-390, 0, -700, 0], half: 11, sidewalk: 6, lanes: 2, bus: true, trees: 'tall' },
    { id: 'dinh-tien-hoang', name: 'ĐƯỜNG ĐINH TIÊN HOÀNG', cls: 'R1', pts: [-220, 54, -440, 54] },
    { id: 'phan-dang-luu', name: 'ĐƯỜNG PHAN ĐĂNG LƯU', cls: 'R1', pts: [-220, 108, -440, 108] },
    // In front of Chợ Bà Chiểu (its side, left of the westward line) the curb is a night loading lane (hours: BINH_THANH_EXTRA).
    { id: 'phan-dang-luu-cho', name: 'ĐƯỜNG PHAN ĐĂNG LƯU', cls: 'R1', pts: [-440, 108, -580, 108], curb: ['moto', 'loading'] },
    // The night street: 4.5 m sidewalks (the default 3 m leaves no band for stools or bikes between the shop fronts and the walking line).
    { id: 'phan-xich-long', name: 'ĐƯỜNG PHAN XÍCH LONG', cls: 'R2', pts: [-220, 162, -440, 162], sidewalk: 4.5 },
    { id: 'nguyen-cuu-van', name: 'ĐƯỜNG NGUYỄN CỬU VÂN', cls: 'R2', pts: [-300, -108, -300, 192] },
    { id: 'dinh-bo-linh', name: 'ĐƯỜNG ĐINH BỘ LĨNH', cls: 'R1', pts: [-440, -108, -440, 192] },
    { id: 'le-quang-dinh', name: 'ĐƯỜNG LÊ QUANG ĐỊNH', cls: 'R1', pts: [-580, -55, -580, 185] },
    { id: 'no-trang-long', name: 'ĐƯỜNG NƠ TRANG LONG', cls: 'R1', pts: [-700, -81.5, -700, 185] },
    // The coach lane through the station: 9 m half-width, coach bays both sides (car bays need >= 9).
    { id: 'ben-xe', name: 'ĐƯỜNG BẾN XE', cls: 'R2', pts: [-580, 132, -700, 132], half: 9, sidewalk: 3, lanes: 1, curb: ['car', 'car'], speed: 6 },
  ],
  junctions: [{ x: -390, z: 0, control: 'signal' }],
  bridges: [
    // Canal decks stand 1 m over the street with short humps; the two landing on the 3 m service carriageways are lower and shorter.
    { id: 'cau-thi-nghe-2', name: 'CẦU THỊ NGHÈ 2', road: 'cau-thi-nghe-2', over: 'thi-nghe', yHint: 0.7, ramp: 5.5 },
    { id: 'cau-thi-nghe', name: 'CẦU THỊ NGHÈ', road: 'cau-thi-nghe', over: 'thi-nghe', yHint: 0.7, ramp: 5.5 },
    { id: 'cau-dien-bien-phu', name: 'CẦU ĐIỆN BIÊN PHỦ', road: 'cau-dien-bien-phu', over: 'thi-nghe', yHint: 1, ramp: 8 },
    { id: 'cau-bong', name: 'CẦU BÔNG', road: 'cau-bong', over: 'thi-nghe', yHint: 1, ramp: 8 },
    { id: 'cau-kieu', name: 'CẦU KIỆU', road: 'cau-kieu', over: 'thi-nghe', yHint: 1, ramp: 8 },
    { id: 'cau-le-van-sy', name: 'CẦU LÊ VĂN SỸ', road: 'cau-le-van-sy', over: 'thi-nghe', yHint: 1, ramp: 8 },
  ],
  stamps: STAMPS,
  fixtures: FIXTURES,
  zoning: [
    { zone: 'park', poly: [-176, -150, -160.6, -150, -160.6, 175, -176, 175], name: 'CÔNG VIÊN BỜ KÊNH HOÀNG SA' },
    { zone: 'park', poly: [-165, -110, -147, -110, -147, -26, -165, -26], name: 'DẢI CÂY XANH HOÀNG SA' },
    { zone: 'park', poly: [-705, -150, -137, -150, -137, -110, -705, -110], name: 'CÔNG VIÊN BỜ SÔNG' },
    { zone: 'park', poly: [-219.5, -110, -200, -110, -200, 195, -219.5, 195], name: 'CÔNG VIÊN BỜ KÊNH TRƯỜNG SA' },
    // The Nhiêu Lộc bank west of the bend: the canal park on (the renovated canal's kè and linear park, as Quận 3's bank opposite).
    { zone: 'park', poly: [-705, 188, -478, 188, -478, 205, -705, 205], name: 'CÔNG VIÊN BỜ KÊNH TRƯỜNG SA' },
    { zone: 'park', poly: [-442, -2, -388, -2, -442, 40], name: 'VƯỜN HOA HÀNG XANH' },
    { zone: 'market', at: [-510, 140], name: 'CHỢ BÀ CHIỂU' },
    { zone: 'school', at: [-260, 81], name: 'TRƯỜNG TIỂU HỌC BÌNH HÒA' },
    // Phan Xích Long's canal-side rows: quán nhậu and lẩu facing the street, busy in the evening.
    { zone: 'night', at: [-260, 177] },
    { zone: 'night', at: [-370, 177] },
    { zone: 'apartment', at: [-545, -25], name: 'VĂN THÁNH' },
    { zone: 'apartment', at: [-640, -25], name: 'VĂN THÁNH' },
  ],
  // Bình Thạnh inland is residential: fewer street fronts open a shop than downtown (and the sign glyphs stay in budget).
  style: { business: { R1: 0.5, R2: 0.34, hem: 0.08 } },
  portals: [
    { id: 'p-108', x: -138, z: -108, road: 'bo-song' },
    { id: 'p-54', x: -138, z: -54, road: 'hoa-sua' },
    { id: 'p0', x: -138, z: 0, road: 'an-hoa' },
    { id: 'p54', x: -138, z: 54, road: 'phuong-vi' },
    { id: 'p108', x: -138, z: 108, road: 'cho-cu' },
  ],
};

/**
 * What the layout format has no field for yet, for the integrator (step 15's wiring, step 20's crossings, P2):
 * the seams, what goes from today's west edge, the lô cốt on the P1 edge, the tower's observation deck, the
 * waterbus stop, the metro station's place, corridors kept free for later ramps, curb hours, and the coach
 * station's drop-off. Coordinates are game metres like the layout's.
 */
export const BINH_THANH_EXTRA = {
  /** Today's west edge (x -138): the five fence ends are this slice's portals; what world.ts / city.ts drop when it lands. */
  westEdge: {
    portals: [-108, -54, 0, 54, 108].map((z) => ({ x: -138, z })),
    remove: [
      'the west fence along x -138 (z -135..137.5) and the road barriers at the five fence ends',
      'the west edge ring and filler beyond x -138 (z -137.6..137.5)',
      'legacy decorations generated beyond LAND at x -199..-141 on the east-west roads (filter the output; keep them in generation, city.ts draws from one rng)',
      'the asphalt bamboo clump at (-137.5, -55) (plan decision 13: a post-filter)',
    ],
  },
  /**
   * Seams with the Quận 3 slice (none joins through today's graph, so the integrator welds them): Hoàng Sa stops on
   * the D1/D3 line; Cầu Lê Văn Sỹ (this slice owns all six Thị Nghè decks) ends on Quận 3's Hoàng Sa × Võ Thị Sáu
   * junction; Cầu Công Lý over Nhiêu Lộc lands on Trường Sa, whose edge the integrator splits there.
   */
  quan3: [
    { x: -160, z: 137.5, road: 'hoang-sa', note: 'Hoàng Sa (R2, two-way) runs on south through Võ Thị Sáu to z 245 in Quận 3' },
    { x: -160, z: 162, road: 'cau-le-van-sy', note: 'Võ Thị Sáu (z 162) comes in from the east and Hoàng Sa goes on south: a four-way once welded' },
    { x: -270, z: 192, road: 'truong-sa', note: 'Cầu Công Lý (x -270) from Quận 3-west: 8 m from the kè (z 200) to this node, so its deck takes a 0.5 m hump with 3 m ramps' },
  ],
  /** The P1 edge on Nơ Trang Long (x -700): where P2 (Bình Thạnh west, Phú Nhuận) carries on, and the lô cốt until then. */
  p2: {
    nodes: [
      { x: -700, z: -81.5, road: 'nguyen-huu-canh-bo-song', toward: [-720, -108] },
      { x: -700, z: 0, road: 'dien-bien-phu-hang-xanh', toward: [-760, -40] },
      { x: -700, z: 88, road: 'xo-viet-nghe-tinh-mien-dong', toward: [-800, 120] },
      { x: -700, z: 185, road: 'truong-sa-nhieu-loc', toward: [-970, 185] },
    ],
    /**
     * "LÔ CỐT" road-works barricades signed "CÔNG TRÌNH ĐANG THI CÔNG" where each continuation will cross the edge
     * hoarding (below), on its line beyond Nơ Trang Long's west sidewalk: each as long along the line as the
     * continuation's asphalt cuts it (its width over the cosine of its angle to the line's normal), so hoarding and
     * lô cốt together close the edge.
     */
    loCot: [
      { x: P2_EDGE_X, z: -99.4, w: 36.5, yaw: H },
      { x: P2_EDGE_X, z: -9, w: 26.4, yaw: H },
      { x: P2_EDGE_X, z: 92.3, w: 14.7, yaw: H },
      { x: P2_EDGE_X, z: 185, w: 9, yaw: H },
    ],
    /**
     * The P1 edge's project hoarding (KHU ĐẤT DỰ ÁN) along x -713.5, just beyond Nơ Trang Long's west sidewalk, from the
     * river park's bank (z -137.6) to the Nhiêu Lộc kè (z 200), a belt of tall trees in P2 land behind it; the lô cốt
     * above stand in its openings. Wiring data: outside the layout's bounds (Nơ Trang Long is centred on the edge).
     */
    edge: { x: P2_EDGE_X, z0: -137.6, z1: 200, h: 2.6, sign: 'KHU ĐẤT DỰ ÁN', signEvery: 60, belt: { x: -718, step: 7, species: 'tall' as const } },
  },
  /** THÁP BỜ SÔNG's observation deck (design 1: a second deck and the parachute jump; design 3 A6.5): the ticket counter at its river-side lobby door, the jump off the north face over the park. */
  deck: { stamp: 'thap-bo-song', floor: 79, y: 310, w: 40, d: 40, counter: { x: -580, z: -121.4, yaw: 0 }, jump: { x: -580, z: -120.5, y: 310, yaw: Math.PI }, price: 200 },
  /** Waterbus main line (design 1 §9): Bạch Đằng – Đò An Hòa – Bến Bình Thạnh – Bến Bình An; its bollards are fixtures. */
  docks: [{ id: 'ben-binh-thanh', name: 'BẾN BÌNH THẠNH', bank: 'S' as const, x: -600 }],
  /** Metro line 1 (step 20): GA VĂN THÁNH over Nguyễn Hữu Cảnh's median (design 1 (-560, -40); the boulevard runs at z -55 here). */
  metro: [{ id: 'ga-van-thanh', name: 'GA VĂN THÁNH', x: -560, z: -55 }],
  /**
   * The Nhiêu Lộc canal park on Trường Sa (x -700..-482, between the street's south sidewalk at z 192.5 and the kè at
   * z 200; the park zone of the layout): design 3 A6.6's anchors, mirroring Quận 3's CÔNG VIÊN BỜ KÊNH NHIÊU LỘC across
   * the water: dawn joggers on the canal walk, men fishing off the kè, a đá cầu circle in the evening.
   */
  canalPark: {
    name: 'CÔNG VIÊN BỜ KÊNH TRƯỜNG SA', rect: { x0: -700, x1: -482, z0: 192.5, z1: 200 },
    jog: { pts: [-700, 196.5, -482, 196.5], hours: [5, 8] as [number, number] },
    fishing: { spots: [[-668, 199.3], [-631, 199.3], [-597, 199.3], [-556, 199.3], [-519, 199.3]] as [number, number][], hours: [5, 10] as [number, number] },
    daCau: { x: -610, z: 196.3, r: 2.8, hours: [16, 19] as [number, number] },
  },
  /** Kept free of buildings for step 20 (parks and medians only, trees there come out with the ramps). */
  reserve: [
    { id: 'cau-ba-son', poly: [-163, -137.6, -151, -137.6, -151, -40, -163, -40], note: 'Cầu Ba Son ramp between the Hoàng Sa carriageways, over z -108 at 4.5 m' },
    { id: 'cau-thu-thiem', poly: [-446, -137.6, -434, -137.6, -434, -108, -446, -108], note: 'Cầu Thủ Thiêm from Đinh Bộ Lĩnh over Nguyễn Hữu Cảnh' },
  ],
  /** Hàng Xanh: signalled at grade in P1; P2 adds the flyover carrying Điện Biên Phủ over Xô Viết Nghệ Tĩnh (5.5 m, ramps x -310..-470). */
  hangXanh: { x: -390, z: 0, control: 'signal' as const, flyover: { roads: ['dien-bien-phu', 'dien-bien-phu-hang-xanh'], y: 5.5, from: -310, to: -470 } },
  /** Curb hours: Bà Chiểu's night loading lane (design 1 §10: 22:00–05:00); the coach bays all day. */
  curbHours: { 'phan-dang-luu-cho': { loading: [22, 5] as [number, number] }, 'ben-xe': { car: [0, 24] as [number, number] } },
  /**
   * Design 1 §8's prologue drop-off at Bến xe Miền Đông: the coach stops westbound in the north bay of Đường Bến Xe,
   * its door on the terminal side. (The campaign's decision 19 moved the arrival to Bến xe An Hòa; the stop stays for
   * the station's porter and tout activities and post-game content.)
   */
  dropOff: { x: -640, z: 124, yaw: -H, stamp: 'ben-xe-mien-dong' },
};
