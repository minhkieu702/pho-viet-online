/**
 * D9 THỦ THIÊM, the P1 north-bank strip (critique step 18), at design 1's coordinates: x -440..680, from the far bank
 * (z -203.6, the Khánh Hội basin's taper to z -260 and the outer bend) inland to the P1 edge on z -420. Đại lộ Vòng
 * Cung (R0) on z -320 swinging round the bend 60 m off the bank, Trần Não on the west edge (x -440), Trần Bạch Đằng
 * (R0, x -157) where Cầu Ba Son will land, the R1 streets on x 0 and x 200 and Tố Hữu on the P1 edge (z -420): the
 * empty boulevards of the night races. Between the bank and Vòng Cung the riverside park, cut by a 5 m riverside
 * walk 14.4 m off the bank: treed at both ends, open lawns facing downtown for kites, fireworks and wedding shoots.
 * Inland, sparse on purpose: two condo towers and their sales gallery behind the Trần Não shophouses, the old An Khánh and parish xóm
 * (nhà ống and hẻm) round NHÀ THỜ THỦ THIÊM and its convent, the ward police with its impound yard and the health
 * station on Tố Hữu among new villas, the fenced site of THÁP ĐÔI ĐANG XÂY with its climbable tower crane at
 * (300, -380), the empty project land over the Mai Chí Thọ tunnel line, a 24 h petrol stop where the racers meet
 * and a driving-test yard (sa hình). The story's P1 villa (stamps.ts villa-p1, (-380, -228)) stands walled on the
 * bank with its private pier. No road crosses the river in P1 (amendment: water-only decks, Ba Son and Cầu Thủ
 * Thiêm wait for step 20): the river crossings are the Đò ngang at x -80 (piers on both banks: today's BẾN ĐÒ AN
 * HÒA and BẾN ĐÒ THỦ THIÊM at the end of ĐƯỜNG BẾN ĐÒ) and the waterbus stops at x -80 and x 200 (BẾN THỦ THIÊM).
 * The corridors the step-20 ramps and the P2 tunnel portal need are kept free of buildings (THU_THIEM_EXTRA.keep).
 *
 * The slice is an island: no road joins it to today's grid. Its one portal is the end of ĐƯỜNG BẾN ĐÒ at the north
 * pier head, where THU_THIEM_LINK (the Đò ngang) lands: the layout is built and validated on today's graph plus that
 * link (stack.ts linkGraph; scripts/map-layout.test.mjs does so for every layout whose portal is a link's node), so
 * every road, door and seat must reach today's map over the ferry. Data only: nothing here is wired into the live map.
 */
import { WATERS } from '../districts.ts';
import { STORY_STAMP, stampSpec } from '../stamps.ts';
import type { DistrictLink } from '../stack.ts';
import type { ArterialSpec, DistrictLayout, FenceSpec, FixtureSpec, StampSpec, WaterwaySpec, ZoningSpec } from './types.ts';

const H = Math.PI / 2, PI = Math.PI;
const r2 = (v: number) => Math.round(v * 100) / 100;
const water = (id: string) => WATERS.find((w) => w.id === id)!.poly;

/** The far bank on today's map (z -203.6 for x <= 470) and the river bend's centre (design 1). */
const BANK = -203.6, BEND = { x: 620, z: -77.6 };
/** The riverside walk runs this far inland of the bank (the promenade bank's 8 m setback, a lawn strip, then the walk). */
const WALK_OFF = 14.4;
/** A point `r` from the bend's centre at `deg` (-90: due north of it), and the point at x on that circle (north side). */
const onBend = (r: number, deg: number) => { const a = (deg * PI) / 180; return [r2(BEND.x + r * Math.cos(a)), r2(BEND.z + r * Math.sin(a))]; };
const bendAtX = (r: number, x: number) => [x, r2(BEND.z - Math.sqrt(r * r - (x - BEND.x) ** 2))];
/** A stretch of the circle round the bend from due north (x 620) to the P1 edge (x 680), every 5°. */
const bendTo680 = (r: number) => [...[-85, -80, -75].filter((d) => BEND.x + r * Math.cos((d * PI) / 180) < 679.5).flatMap((d) => onBend(r, d)), ...bendAtX(r, 680)];

/** Design 1's river (as quan-4.ts splits it, so both layouts number its edges alike). */
function river(): number[] {
  const p = water('song-sai-gon'), out: number[] = [];
  for (let k = 0; k < p.length; k += 2) {
    if (k && p[k] === out[out.length - 2] && p[k + 1] === out[out.length - 1]) continue;
    out.push(p[k], p[k + 1]);
    if (k === 0) out.push(352, -137.6, 392, -137.6, 432, -137.6);
    // The villa's own frontage (x -414..-346) is its private landing, not the park's promenade.
    if (p[k] === 470 && p[k + 1] === BANK) out.push(-346, BANK, -414, BANK);
  }
  return out;
}
const RIVER = river();
/** Edge index of the vertex at (x, z) in RIVER. */
const vertexAt = (x: number, z: number) => { for (let k = 0; k < RIVER.length; k += 2) if (Math.abs(RIVER[k] - x) < 0.05 && Math.abs(RIVER[k + 1] - z) < 0.05) return k / 2; throw new Error(`no river vertex at (${x}, ${z})`); };

const WATERWAYS: WaterwaySpec[] = [
  // As quan-4.ts on the south bank (today's promenade and the Quận 1 strip, the canal mouth, then quay); on this side
  // the outer bend, the basin's taper and the far bank from Cát Lái round to the west buoy line are the park's promenade,
  // except the villa's frontage (a wharf: its private landing and pier, no public walk or benches).
  { id: 'song-sai-gon', name: 'SÔNG SÀI GÒN', kind: 'river', poly: RIVER, bank: 'wharf', banks: [
    { from: 0, to: 2, kind: 'promenade' }, { from: vertexAt(802.4, -77.6), to: vertexAt(-346, BANK) - 1, kind: 'promenade' },
    { from: vertexAt(-414, BANK), to: vertexAt(-1000, BANK) - 1, kind: 'promenade' },
  ] },
];

// ---- Streets ----
/** The riverside walk: 14.4 m inland of the far bank, of the basin's taper (470,-203.6)→(560,-260) and of the outer bend. */
function riversideWalk(): number[] {
  const dx = 560 - 470, dz = -260 - BANK, l = Math.sqrt(dx * dx + dz * dz), ux = dx / l, uz = dz / l, nx = uz, nz = -ux;
  const ox = 470 + nx * WALK_OFF, oz = BANK + nz * WALK_OFF, at = (z: number) => r2(ox + ux * ((z - oz) / uz));
  const z0 = BANK - WALK_OFF, z1 = -260 - WALK_OFF;
  return [-330, z0, at(z0), z0, at(z1), z1, BEND.x, z1, ...bendTo680(BEND.z - z1)];
}
const VEN_SONG = riversideWalk();
/** Vòng Cung: z -320 to x 620, then round the bend (radius 242.4, always 60 m off the bank) to the P1 edge at x 680. */
const VONG_CUNG = [-440, -320, 620, -320, ...bendTo680(242.4)];
/** The P1 edge's hoarding lines: beyond Trần Não's west sidewalk, Tố Hữu's north sidewalk, and the road ends at x 680. */
const EDGE = { west: -452.5, north: -432.5, east: 680.5 };
/** Ferry and waterbus streets end 2 m short of the bank, where the pier deck starts (piers: THU_THIEM_EXTRA). */
const PIER_HEAD = -205.6;

const ARTERIALS: ArterialSpec[] = [
  // The racing roads: the boulevard round the peninsula, Trần Bạch Đằng, Tố Hữu on the P1 edge, Trần Não on the west edge.
  { id: 'vong-cung', name: 'ĐẠI LỘ VÒNG CUNG', cls: 'R1', pts: VONG_CUNG, half: 11, sidewalk: 6, lanes: 2, trees: 'palm', curb: ['car', 'car'] },
  { id: 'tran-bach-dang', name: 'ĐƯỜNG TRẦN BẠCH ĐẰNG', cls: 'R1', pts: [-157, -420, -157, -320], half: 11, sidewalk: 6, lanes: 2, trees: 'palm', curb: ['car', 'car'] },
  { id: 'to-huu', name: 'ĐƯỜNG TỐ HỮU', cls: 'R1', pts: [-440, -420, 680, -420], trees: 'tall' },
  { id: 'tran-nao', name: 'ĐƯỜNG TRẦN NÃO', cls: 'R1', pts: [-440, -420, -440, -320], trees: 'tall' },
  { id: 'luong-dinh-cua', name: 'ĐƯỜNG LƯƠNG ĐỊNH CỦA', cls: 'R1', pts: [0, -420, 0, -320], trees: 'round' },
  { id: 'nguyen-co-thach', name: 'ĐƯỜNG NGUYỄN CƠ THẠCH', cls: 'R1', pts: [200, -420, 200, -320], trees: 'flame' },
  // Minor streets: the old hẻm behind Trần Não, the street east of the tunnel line, the villa street and its lane.
  { id: 'hem-vc-69', name: 'HẺM 69 VÒNG CUNG', cls: 'hem', pts: [-300, -320, -300, -420], half: 1.75, traffic: false },
  { id: 'so-10', name: 'ĐƯỜNG SỐ 10', cls: 'R2', pts: [470, -420, 470, -320] },
  { id: 'so-1', name: 'ĐƯỜNG SỐ 1', cls: 'R2', pts: [-330, -320, -330, BANK - WALK_OFF] },
  { id: 'so-1-biet-thu', name: 'ĐƯỜNG SỐ 1', cls: 'R2', pts: [-330, -258, -418, -258], traffic: false },
  // The old xóm's hẻm either side of Trần Bạch Đằng: through An Khánh to Hẻm 69, through the parish to Bến Đò
  // by the church (motos and people only).
  { id: 'hem-tbd-26', name: 'HẺM 26 TRẦN BẠCH ĐẰNG', cls: 'hem', pts: [-300, -370, -157, -370], half: 1.75, traffic: false },
  { id: 'hem-tbd-25', name: 'HẺM 25 TRẦN BẠCH ĐẰNG', cls: 'hem', pts: [-157, -370, -80, -370], half: 1.75, traffic: false },
  // Down to the river: the ferry street through the parish xóm and the park to the Đò ngang, the waterbus street.
  { id: 'ben-do', name: 'ĐƯỜNG BẾN ĐÒ', cls: 'R2', pts: [-80, -420, -80, PIER_HEAD], speed: 7 },
  { id: 'ben-thu-thiem', name: 'ĐƯỜNG BẾN THỦ THIÊM', cls: 'R2', pts: [200, -320, 200, PIER_HEAD], speed: 7 },
  // The park: the riverside walk, and the walk where Cầu Ba Son's north ramp will come down (step 20).
  { id: 'ven-song', name: 'ĐƯỜNG DẠO VEN SÔNG', cls: 'hem', pts: VEN_SONG, half: 2.5, traffic: false },
  // Its west end steps down to the bank beside the villa (it parts the bank's lawn strip from the villa's lawn).
  { id: 'ven-song-tay', name: 'ĐƯỜNG DẠO VEN SÔNG', cls: 'hem', pts: [-330, BANK - WALK_OFF, -330, BANK], half: 2.5, traffic: false },
  { id: 'loi-ba-son', name: 'LỐI ĐI CÔNG VIÊN BA SON', cls: 'hem', pts: [-157, BANK - WALK_OFF, -157, -320], half: 2.5, traffic: false },
];

// ---- Stamps: landmarks, story, services, and the open lawns (park stamps keep their ground free of lots) ----
/** A park stamp over an axis-aligned rectangle. */
const lawn = (id: string, name: string, x0: number, x1: number, z0: number, z1: number): StampSpec =>
  ({ id, kind: 'park', name, x: r2((x0 + x1) / 2), z: r2((z0 + z1) / 2), w: r2(x1 - x0), d: r2(z1 - z0), yaw: 0 });

/** The tower crane: its mast base and ballast at (300, -380), the ladder cage on its east face. */
const CRANE = { x: 300, z: -380, base: 6, mast: 2.2, h: 62, jib: 52, counter: 16, jibYaw: -H };
const STAMPS: StampSpec[] = [
  stampSpec('villa-p1'),
  { id: 'ben-do-thu-thiem', kind: 'landmark', name: 'BẾN ĐÒ THỦ THIÊM', subtitle: 'ĐÒ NGANG • TÀU BUÝT SÔNG', x: -92, z: -210.5, w: 7, d: 4.5, yaw: PI, h: 3.8, storeys: 1, building: 'office', color: '#e8d9b5' },
  { id: 'ben-thu-thiem', kind: 'landmark', name: 'BẾN THỦ THIÊM', subtitle: 'TÀU BUÝT SÔNG • BẠCH ĐẰNG – NHÀ RỒNG', x: 212, z: -210.5, w: 7, d: 4.5, yaw: PI, h: 3.8, storeys: 1, building: 'office', color: '#cfe0e6' },
  // The parish: the church (design 1: x -70..-50, z -385..-355) facing the boulevard and the river, its convent beside it.
  { id: 'nha-tho-thu-thiem', kind: 'church', name: 'NHÀ THỜ THỦ THIÊM', subtitle: 'GIÁO XỨ THỦ THIÊM • 1859', x: -60, z: -370, w: 20, d: 30, yaw: 0, h: 15, storeys: 2, color: '#f1e7cf', yard: 5, entrance: { x: -60, z: -354.4 } },
  { id: 'tu-vien-thu-thiem', kind: 'landmark', name: 'TU VIỆN THỦ THIÊM', subtitle: 'NHÀ DÒNG • TRƯỜNG MẪU GIÁO', x: -31, z: -372, w: 22, d: 16, yaw: 0, h: 8, storeys: 2, building: 'school', color: '#efe0bf', yard: 2 },
  // THÁP ĐÔI ĐANG XÂY (design 1: x 220..280, z -405..-350): two bare concrete frames inside the site fence.
  { id: 'thap-doi-a', kind: 'landmark', name: 'THÁP ĐÔI ĐANG XÂY', subtitle: 'THÁP A • CÔNG TRÌNH ĐANG THI CÔNG', x: 233, z: -377, w: 26, d: 26, yaw: -H, h: 96, storeys: 28, building: 'office', color: '#b9b5ab', yard: 1 },
  { id: 'thap-doi-b', kind: 'landmark', name: 'THÁP ĐÔI ĐANG XÂY', subtitle: 'THÁP B • CÔNG TRÌNH ĐANG THI CÔNG', x: 267, z: -377, w: 26, d: 26, yaw: PI, h: 82, storeys: 24, building: 'office', color: '#b9b5ab', yard: 1 },
  {
    id: 'can-cau-thap', kind: 'landmark', name: 'CẦN CẨU THÁP', subtitle: 'CÔNG TRƯỜNG THÁP ĐÔI • CẤM LEO TRÈO', x: CRANE.x, z: CRANE.z, w: CRANE.base, d: CRANE.base, yaw: PI, h: 3.2, storeys: 1, building: 'office', color: '#e3b021',
    ways: [{ kind: 'ladder', x: CRANE.x + CRANE.base / 2 + 0.6, z: CRANE.z, yaw: H }],
  },
  // New town by Trần Não: two condo towers and their sales gallery on the boulevard.
  { id: 'can-ho-ban-dao-a', kind: 'apartment', name: 'CĂN HỘ BÁN ĐẢO', subtitle: 'THÁP A • 30 TẦNG', x: -400, z: -375, w: 32, d: 28, yaw: -H, h: 102, storeys: 30, color: '#dfe3e6', yard: 5 },
  { id: 'can-ho-ban-dao-b', kind: 'apartment', name: 'CĂN HỘ BÁN ĐẢO', subtitle: 'THÁP B • 26 TẦNG', x: -350, z: -386, w: 30, d: 24, yaw: PI, h: 88, storeys: 26, color: '#e6e1d8', yard: 4 },
  { id: 'nha-mau-ban-dao', kind: 'landmark', name: 'NHÀ MẪU BÁN ĐẢO', subtitle: 'TRUNG TÂM GIAO DỊCH • ĐANG MỞ BÁN', x: -345, z: -350, w: 34, d: 12, yaw: 0, h: 8, storeys: 2, building: 'office', color: '#f4f4f0', yard: 3 },
  // Ward services on Tố Hữu (design 1: TRẠM Y TẾ THỦ THIÊM (60, -420), the impound beside the police (100, -430)).
  { id: 'cong-an-thu-thiem', kind: 'police', name: 'CÔNG AN PHƯỜNG THỦ THIÊM', subtitle: 'TRỰC BAN 24/7 • BÃI GIỮ XE VI PHẠM', x: 100, z: -397, w: 26, d: 18, yaw: PI, h: 12, storeys: 3, color: '#e9c46a', yard: 1 },
  { id: 'tram-y-te-thu-thiem', kind: 'hospital', name: 'TRẠM Y TẾ PHƯỜNG THỦ THIÊM', subtitle: 'KHÁM BỆNH • CẤP CỨU 115', x: 50, z: -398, w: 22, d: 16, yaw: PI, h: 9, storeys: 2, color: '#f1f1ec', yard: 1 },
  // The racers' meet: a petrol stop with its 24 h mini mart on the corner of Vòng Cung and Đường số 10.
  { id: 'cay-xang-vong-cung', kind: 'landmark', name: 'MINI MART 24H', subtitle: 'CÂY XĂNG • MỞ CỬA SUỐT ĐÊM', x: 500, z: -351, w: 18, d: 10, yaw: 0, h: 4.5, storeys: 1, building: 'shop', color: '#e7ecef', yard: 9 },
  { id: 'sat-hach-lai-xe', kind: 'landmark', name: 'SÂN SÁT HẠCH LÁI XE', subtitle: 'TẬP LÁI • SA HÌNH • THI BẰNG A1 – B2', x: 560, z: -395, w: 16, d: 9, yaw: PI, h: 4.2, storeys: 1, building: 'office', color: '#dfe9f2', yard: 1 },
  // Open ground: the riverside lawns facing downtown, the project land over the tunnel line, the sa hình course.
  lawn('bai-co-biet-thu', 'BÃI CỎ VEN SÔNG', -439, -337.6, -302.9, -265.6),
  lawn('bai-co-cau-thu-thiem', 'BÃI CỎ VEN SÔNG', -439, -410.2, -250.4, -212),
  lawn('bai-co-so-1', 'BÃI CỎ VEN SÔNG', -349.8, -337.6, -250.4, -212),
  lawn('bai-co-ba-son', 'BÃI CỎ VEN SÔNG', -154.1, -87.6, -302.9, -220.9),
  lawn('bai-co-quang-truong', 'BÃI CỎ BỜ SÔNG', -72.4, 192.4, -302.9, -220.9),
  // The church square: the parish keeps the ground between the church, its convent and the boulevard open.
  lawn('san-nha-tho', 'SÂN NHÀ THỜ', -72.4, -12.6, -354.6, -337.1),
  lawn('dat-du-an-ham', 'ĐẤT DỰ ÁN • BÃI THẢ DIỀU', 333, 462.4, -407.4, -337.1),
  lawn('san-tap-lai', 'SA HÌNH', 546, 664, -385.5, -343),
];

// ---- Fences: the villa's garden wall, the tower site, the impound yard, the sa hình yard ----
const FENCES: FenceSpec[] = [
  // The villa's garden wall in two runs (generator panels meeting square at a corner touch): round the garden, and
  // 2 m in from the kè edge with the gate to the private pier; the joints leave 0.4 m, too narrow to slip through.
  { id: 'tuong-biet-thu', kind: 'wall', h: 2.8, pts: [-351.5, -206, -351.5, -248.6, -408.5, -248.6, -408.5, -206], gates: [{ name: 'CỔNG CHÍNH', x: -380, z: -248.6, w: 4.6 }] },
  { id: 'tuong-biet-thu-ben', kind: 'wall', h: 2.8, pts: [-351.5, -205.6, -408.5, -205.6], gates: [{ name: 'CỔNG BẾN RIÊNG', x: -380, z: -205.6, w: 2.4 }] },
  {
    id: 'cong-truong-thap-doi', kind: 'fence', h: 2.6, pts: [214, -406, 214, -339.6, 330, -339.6, 330, -406, 214, -406],
    gates: [{ name: 'CỔNG SỐ 1', x: 214, z: -377, w: 6 }, { name: 'CỔNG SỐ 2', x: 267, z: -406, w: 9 }, { name: 'CỔNG SỐ 3', x: CRANE.x, z: -406, w: 3.2 }],
  },
  { id: 'bai-giu-xe', kind: 'fence', h: 2.4, pts: [116, -406.2, 116, -381, 152, -381, 152, -406.2, 116, -406.2], gates: [{ name: 'CỔNG BÃI GIỮ XE', x: 134, z: -406.2, w: 6 }] },
  { id: 'san-sat-hach', kind: 'fence', h: 1.8, pts: [544, -405.6, 544, -341.4, 666, -341.4, 666, -405.6, 544, -405.6], gates: [{ name: 'CỔNG SÂN TẬP', x: 560, z: -405.6, w: 8 }] },
];

// ---- Fixtures: the tower site's yard stock and the ferry's bollards ----
function fixtures(): FixtureSpec[] {
  const out: FixtureSpec[] = [];
  const box = (id: string, kind: FixtureSpec['kind'], x: number, z: number, w: number, d: number, yaw: number, h: number) => out.push({ id, kind, x: r2(x), z: r2(z), w, d, yaw, h });
  // Site offices: containers (one two high) by the river-side fence; guard booths inside the gates on x 200 and Tố Hữu.
  box('van-phong-cong-truong', 'container', 300, -346.5, 12.2, 2.44, 0, 5.2);
  box('kho-cong-truong', 'container', 300, -351, 12.2, 2.44, 0, 2.6);
  box('chot-bao-ve-2', 'booth', 278, -402.5, 2.2, 2.2, 0, 2.6);
  box('chot-bao-ve-1', 'booth', 217.6, -388, 2.2, 2.2, 0, 2.6);
  // Rebar and brick pallets, formwork crates and drums along the towers, lanes of 1.5 m between them.
  [[226, -357.5], [229.9, -357.5], [237.7, -357.5], [258.3, -357.5], [262.2, -357.5], [270, -357.5], [313, -366], [316.9, -366], [313, -393], [316.9, -393], [320.8, -393]].forEach(([x, z], i) => {
    const h = [0.9, 1.6, 1.2, 2.2][i % 4];
    box(`vat-tu-${i}`, h < 1.5 ? 'pallet' : 'crate', x, z, 2.4, 2.4, 0, h);
  });
  for (const [k, [x, z]] of [[249.6, -392], [312, -380.5], [289.5, -355]].entries()) box(`thung-${k}`, 'drums', x, z, 1.3, 1.3, 0, 0.95);
  // The villa's landing: a mooring post either side of its pier on the kè top, outside the wall (they also keep the
  // park's seat paths from running along the kè inside the wall line).
  for (const x of [-384, -376]) box(`coc-biet-thu-${x}`, 'bollard', x, -204.9, 0.5, 0.5, 0, 0.8);
  // The ferry and waterbus piers' heads: a bollard either side on the bank top.
  for (const x of [-80, 200]) for (const s of [-1, 1]) box(`coc-${x}-${s > 0 ? 'e' : 'w'}`, 'bollard', x + s * 6.5, -204.3, 0.5, 0.5, 0, 0.8);
  return out;
}

const ZONING: ZoningSpec[] = [
  { zone: 'park', at: [-250, -260], name: 'CÔNG VIÊN BỜ SÔNG THỦ THIÊM' },
  { zone: 'park', at: [400, -290], name: 'CÔNG VIÊN BỜ SÔNG THỦ THIÊM' },
  // Trần Não is an old road: nhà ống shophouses line it, the condo towers rise behind them.
  { zone: 'tube', at: [-370, -370], name: 'TRẦN NÃO' },
  { zone: 'tube', at: [-230, -345], name: 'XÓM AN KHÁNH' },
  { zone: 'tube', at: [-230, -395], name: 'XÓM AN KHÁNH' },
  { zone: 'tube', at: [-120, -345], name: 'XÓM ĐẠO THỦ THIÊM' },
  { zone: 'tube', at: [-120, -395], name: 'XÓM ĐẠO THỦ THIÊM' },
  { zone: 'tube', at: [-40, -400], name: 'XÓM ĐẠO THỦ THIÊM' },
];

export const THU_THIEM: DistrictLayout = {
  id: 'D9', key: 'thu-thiem', name: 'THỦ THIÊM · BÁN ĐẢO',
  // Land: the strip x -440..680 from the river (the outline runs out into the water so the bank, not the bounds,
  // edges the blocks on it) to the P1 edge on z -420; Trần Não and Tố Hữu run on its west and north edges.
  bounds: [-440, -195, 680, -195, 680, -420, -440, -420],
  waterways: WATERWAYS,
  arterials: ARTERIALS,
  stamps: STAMPS,
  fixtures: fixtures(),
  fences: FENCES,
  zoning: ZONING,
  // New town: villas (and their gardens) wherever the zoning names nothing else.
  zone: 'villa',
  // The ferry's landing (THU_THIEM_LINK.node): the island's only way to today's map in P1.
  portals: [{ id: 'do-ngang', x: -80, z: PIER_HEAD, road: 'ben-do' }],
  style: {
    palette: ['#f2efe8', '#e7e4dc', '#dfe6ea', '#efe3cc', '#e9d6b8', '#d8e2d4', '#f0dcae', '#cfe0c8', '#e3b9a3', '#c9d7e3', '#f3e3a0', '#b9d3e8'],
    trees: { R1: 'tall', R2: 'round', hem: null },
    business: { R1: 0.5, R2: 0.45, hem: 0.25 },
  },
};

/**
 * The slice's one link to today's map. In P1 nothing joins it by road: the Đò ngang does, from BẾN ĐÒ AN HÒA
 * (consts.ts DOCKS x -80, boarding ring (-80, -149.5)) to the north pier at the end of ĐƯỜNG BẾN ĐÒ. `node` is the
 * layout's portal (the street's end at the pier head); validation runs the link from today's riverside T at (-54,
 * -108) along the promenade and out along the pier (stack.ts linkInput). The live map carries it as the ferry ride.
 */
export const THU_THIEM_LINK: DistrictLink = {
  id: 'do-ngang', kind: 'ferry', name: 'ĐÒ NGANG THỦ THIÊM', road: 'ben-do', node: { x: -80, z: PIER_HEAD },
  anchor: { x: -54, z: -108 }, via: [-54, -126, -80, -126], from: { dock: -80, x: -80, z: -149.5 }, to: { x: -80, z: -198.1 },
};

/** A pier on the north bank, the mirror of consts.ts Dock: deck from 3 m inland out 8 m over the water, steps beside it, the boarding ring near its end. */
const northPier = (x: number) => ({
  x, bank: 'N' as const,
  pier: { minX: x - 2, maxX: x + 2, minZ: -206.6, maxZ: -195.6 }, steps: { minX: x + 2.6, maxX: x + 5, minZ: -206.6, maxZ: -200.7 }, ring: { x, z: -198.1 },
});

/**
 * What the layout format has no field for yet, for the wiring wave (step 18): the ferry and waterbus piers, the
 * villa's pier (stamps.ts), the crane above its base, the step-20 and P2 corridors kept clear, the activity ground
 * (race loop, kite lawns, picnic and photo spots, the sa hình course, the petrol forecourt), HUD sub-zones and the
 * lô cốt barricades where streets run on into unbuilt land.
 */
export const THU_THIEM_EXTRA = {
  /** Đò ngang: a row-boat ferry carrying people and motorbikes, 2-minute crossing (design 3 A7.5). */
  ferry: { id: 'do-ngang-thu-thiem', name: 'ĐÒ NGANG THỦ THIÊM', fare: 5, minutes: 2, south: { dock: 'BẾN ĐÒ AN HÒA', ring: { x: -80, z: -149.5 } }, north: { stamp: 'ben-do-thu-thiem', street: 'ben-do', ...northPier(-80) } },
  /** Waterbus stops on this bank (east spur Bạch Đằng – Bến Thủ Thiêm – Bến Nhà Rồng; the main line may call at the đò pier too). */
  waterbus: [
    { id: 'ben-do-thu-thiem', name: 'BẾN ĐÒ THỦ THIÊM', stamp: 'ben-do-thu-thiem', street: 'ben-do', ...northPier(-80) },
    { id: 'ben-thu-thiem', name: 'BẾN THỦ THIÊM', stamp: 'ben-thu-thiem', street: 'ben-thu-thiem', ...northPier(200) },
  ],
  /** The story villa's private pier and its river gate in the garden wall (fence tuong-biet-thu). */
  villaPier: { ...STORY_STAMP['villa-p1'].pier!, gate: { x: -380, z: -205.6 }, bollards: [{ x: -384, z: -204.9 }, { x: -376, z: -204.9 }] },
  /** The tower crane over its base stamp: mast, cab, jib towards the towers, counter-jib, the ladder's landings. */
  crane: { ...CRANE, stamp: 'can-cau-thap', cab: { y: CRANE.h - 3 }, ladder: { x: CRANE.x + CRANE.base / 2 + 0.6, z: CRANE.z, yaw: H, landings: [10, 20, 30, 40, 50, 59] }, tip: { x: CRANE.x - CRANE.jib, z: CRANE.z, y: CRANE.h } },
  /**
   * Ground kept free of buildings for later steps: Cầu Ba Son's north ramp (x -157, bank to grade at z -300; the park
   * walk there passes under it), Cầu Thủ Thiêm's (x -440; the west half is D10), the Mai Chí Thọ tunnel portal
   * (x 372, z -337..-420, P2). Trees in the two ramp corridors are park dressing step 20 drops.
   */
  keep: [
    { id: 'ram-ba-son', x0: -172, x1: -142, z0: -300, z1: BANK },
    { id: 'ram-cau-thu-thiem', x0: -452.5, x1: -427.5, z0: -300, z1: BANK },
    { id: 'cua-ham-mai-chi-tho', x0: 357, x1: 387, z0: -420, z1: -337 },
  ],
  /** Night racing (design 3 A7.2, 23:00–03:00): the meet at the petrol stop, a loop of the empty boulevards. */
  race: { meet: { x: 500, z: -339.5 }, loop: [470, -320, -157, -320, -157, -420, 470, -420, 470, -320], laps: 2 },
  /** Kite lawns (A7.1, 16:00–18:30) and the riverside picnic and wedding-photo spots facing the Quận 1 skyline (A7.4). */
  kites: ['bai-co-quang-truong', 'bai-co-ba-son', 'dat-du-an-ham'],
  picnic: [{ x: 20, z: -232 }, { x: 80, z: -236 }, { x: 140, z: -232 }, { x: -120, z: -234 }],
  photos: [{ x: 60, z: -224, yaw: 0 }, { x: -60, z: -350, yaw: PI }, { x: 233, z: -334.5, yaw: PI }],
  /** The sa hình course inside its fence (figure 8, lanes 3.5 m), the gate and the examiner's office. */
  saHinh: { stamp: 'sat-hach-lai-xe', lawn: 'san-tap-lai', fence: 'san-sat-hach', eights: [{ x: 580, z: -364, r: 12 }, { x: 628, z: -364, r: 12 }] },
  /** The petrol forecourt in front of MINI MART 24H: canopy over two pump islands. */
  petrol: { stamp: 'cay-xang-vong-cung', canopy: { x0: 488, x1: 512, z0: -344.5, z1: -338 }, pumps: [{ x: 494, z: -341.3 }, { x: 506, z: -341.3 }] },
  /** BÃI GIỮ XE VI PHẠM: the impound yard beside the ward police (fence bai-giu-xe). */
  impound: { fence: 'bai-giu-xe', x0: 116.5, x1: 151.5, z0: -405.7, z1: -381.5 },
  /** HUD sub-zones (districts.ts ZONES), most specific first. */
  zones: [
    { id: 'ben-do-thu-thiem', name: 'Bến đò Thủ Thiêm', x0: -90, x1: -70, z0: -218, z1: -192 },
    { id: 'quang-truong-bo-song', name: 'Quảng trường Bờ Sông', x0: -80, x1: 200, z0: -320, z1: BANK },
    { id: 'cong-vien-bo-song', name: 'Công viên bờ sông Thủ Thiêm', x0: -440, x1: 680, z0: -320, z1: BANK },
    { id: 'xom-dao-thu-thiem', name: 'Xóm đạo Thủ Thiêm', x0: -157, x1: 0, z0: -420, z1: -320 },
    { id: 'thap-doi', name: 'Công trường Tháp Đôi', x0: 200, x1: 340, z0: -420, z1: -320 },
    { id: 'ban-dao-thu-thiem', name: 'Bán đảo Thủ Thiêm', x0: -440, x1: 680, z0: -420, z1: BANK },
  ],
  /**
   * LÔ CỐT "CÔNG TRÌNH ĐANG THI CÔNG" where streets run on into unbuilt land (design 1 §11: Thủ Thiêm z -420 and x 680),
   * each on the edge hoarding's line (below) and as wide as the hoarding's opening there: the north ones across the
   * continuing streets' asphalt beyond Tố Hữu's far sidewalk, the east ones across Tố Hữu's and Vòng Cung's whole
   * cross-section at their ends.
   */
  loCot: [
    ...[-440, -157, 0, 200].map((x) => ({ x, z: EDGE.north, yaw: 0, w: x === -157 ? 22 : 14 })),
    { x: EDGE.east, z: -420, yaw: H, w: 25 }, { x: EDGE.east, z: bendAtX(242.4, 680)[1], yaw: H, w: 34 },
  ],
  /**
   * The P1 edges facing unbuilt land (D10 west of Trần Não, P2 north of Tố Hữu, east of x 680): project hoardings
   * signed KHU ĐẤT DỰ ÁN beyond the outer sidewalks (Trần Não and Tố Hữu are R1 roads centred on x -440 and z -420, so a
   * fence on those lines would run down their middles), from the river bank round to the bend's bank; the lô cốt above
   * stand in its openings. Wiring data (outside the layout's bounds, so the generator does not lay them).
   */
  edge: {
    ...EDGE,
    runs: [
      { id: 'rao-du-an-tran-nao', pts: [EDGE.west, BANK, EDGE.west, EDGE.north] },
      { id: 'rao-du-an-to-huu', pts: [EDGE.west, EDGE.north, EDGE.east, EDGE.north] },
      { id: 'rao-du-an-mui-den-do', pts: [EDGE.east, EDGE.north, EDGE.east, r2(BEND.z - Math.sqrt(182.4 ** 2 - (680 - BEND.x) ** 2))] },
    ],
    h: 2.6, sign: 'KHU ĐẤT DỰ ÁN', signEvery: 60,
  },
  /** The parish church's bell tower over its entrance (inside the stamp's footprint), for the church renderer (WIRING-PLAN §2). */
  towers: [{ stamp: 'nha-tho-thu-thiem', kind: 'bell tower', x: -60, z: -358.5, w: 6, d: 6, h: 32 }],
};
