/**
 * Generator v2, step 4: a building on every lot, in today's Building / Plot shapes (city.ts) plus what the new
 * renderer needs (typology, storeys, facade, the oriented footprint). Tube houses fill their lot; warehouses,
 * chung cư and villas stand back from the front; institutions sit at the back of their compound. Doors are on
 * the front wall (searched like city.ts findDoor) and their curb is the matching point on the walking line in
 * front (a hẻm's centre line). Businesses get a shop sign, homes a house-number plate; addresses are by position
 * along the street ("45", "45/12" inside a hẻm), so a block's numbers never depend on another block.
 */
import type { Building, BuildingKind, Plot, PlotStyle, Point, TowerSpec } from '../../city.ts';
import { hashKey, stream, type Rng } from '../rng.ts';
import { ZONE_STYLES, type DistrictLayout, type DistrictStyle, type StampSpec, type StreetMix } from '../layout/types.ts';
import type { HemPlan, Net } from './arterials.ts';
import { streetNumber, type Lot } from './lots.ts';
import { boxOf, hyp, polylineHit, r2, r6, type OBB } from './geom.ts';

export type Typology = 'tube' | 'stilt' | 'shophouse' | 'market-hall' | 'warehouse' | 'apartment' | 'villa' | 'pagoda' | 'church' | 'school' | 'police' | 'hospital' | 'landmark';
export type Facade = 'plain' | 'balcony' | 'tiled' | 'shutter' | 'cage' | 'colonial' | 'modern' | 'shed' | 'gallery' | 'temple';
/** A generated building: today's Building fields plus its key, footprint and look. */
export type GenBuilding = Building & {
  key: string; block: string; lot: string; typology: Typology; storeys: number; facade: Facade;
  box: OBB; address: string; zone: string; stamp: string | null;
};
/** A ground-floor kiosk in a chung cư slab's street front: what it sells, and its counter (on the wall, facing out). */
export type Kiosk = { key: string; kind: BusinessKind; name: string; subtitle: string; x: number; z: number; yaw: number };
export type GenPlot = Plot & { key: string; typology: Typology; storeys: number; facade: Facade; box: OBB; stilt: number; kiosks: Kiosk[] };
export type SignKind = 'board' | 'vertical' | 'plate' | 'arch' | 'gate';
/** A sign for signs.ts sign(text, subtitle, color, x, y, z, w, h, yaw, background), plus what it belongs to. */
export type GenSign = { key: string; kind: SignKind; text: string; subtitle: string; color: string; background: string; x: number; y: number; z: number; w: number; h: number; yaw: number; building: string | null };
/** A building draft before ids are assigned (blocks are built independently). */
export type Draft = { building: Omit<GenBuilding, 'id'>; plot: Omit<GenPlot, 'id'>; signs: GenSign[]; business: boolean };

const STALLS: [string, string][] = [
  ['BÚN RIÊU', 'RIÊU CUA • ỐC • ĐẬU'], ['BÁNH XÈO', 'GIÒN RỤM • RAU RỪNG'], ['XÔI SÁNG', 'XÔI MẶN • XÔI NGỌT'], ['CHÈ', 'CHÈ THẬP CẨM • SƯƠNG SA'],
  ['HỦ TIẾU GÕ', 'MÌ • HOÀNH THÁNH'], ['BÁNH CUỐN', 'NÓNG • CHẢ LỤA'], ['BÁNH CANH', 'BÁNH CANH CUA'], ['CHÁO LÒNG', 'CHÁO • DỒI • LÒNG'],
  ['CƠM TẤM', 'SƯỜN • BÌ • CHẢ'], ['PHỞ BÒ', 'TÁI • NẠM • GẦU'], ['HỦ TIẾU NAM VANG', 'KHÔ • NƯỚC'], ['BÚN BÒ HUẾ', 'GIÒ HEO • CHẢ CUA'],
  ['BÁNH MÌ', 'PATÊ • THỊT NGUỘI • CHẢ'], ['CƠM BÌNH DÂN', 'CƠM NHÀ • CANH CHUA'], ['GÀ NƯỚNG', 'CƠM GÀ XỐI MỠ'], ['BÒ BÍA', 'GỎI CUỐN • BÒ BÍA'],
  ['BÚN THỊT NƯỚNG', 'NEM NƯỚNG • CHẢ GIÒ'], ['MÌ QUẢNG', 'MÌ QUẢNG • CAO LẦU'],
];
/** Vĩnh Khánh's mix: ốc, then seafood and the grill, then beer. */
const OC: [string, string][] = [
  ['ỐC', 'ỐC LEN XÀO DỪA • SÒ ĐIỆP NƯỚNG'], ['ỐC LEN XÀO DỪA', 'ỐC HƯƠNG • SÒ LÔNG'], ['SÒ ỐC NƯỚNG', 'MỠ HÀNH • MUỐI ỚT'], ['ỐC BƯƠU NHỒI THỊT', 'ỐC MÓNG TAY • NGHÊU HẤP'],
  ['ỐC ĐÊM', 'ỐC • SÒ • HẾN • NGHÊU'], ['ỐC XÀO BƠ TỎI', 'ỐC GIÁC • ỐC TỎI'],
];
const SEAFOOD: [string, string][] = [
  ['HẢI SẢN', 'TÔM • CUA • GHẸ • MỰC'], ['HẢI SẢN TƯƠI SỐNG', 'CÀNG GHẸ RANG MUỐI'], ['NƯỚNG NGÓI', 'BÒ • MỰC • TÔM'], ['MỰC NƯỚNG', 'MỰC MỘT NẮNG • KHÔ MỰC'],
  ['TÔM NƯỚNG', 'TÔM CÀNG • TÔM SÚ'], ['LẨU HẢI SẢN', 'LẨU THÁI • LẨU CHUA CAY'],
];
const BEER: [string, string][] = [['QUÁN NHẬU', 'BIA • ĐỒ NƯỚNG • LẨU'], ['BIA HƠI', 'BIA TƯƠI • ĐỒ NHẮM'], ['BIA TƯƠI', 'BIA • KHÔ MỰC • ĐẬU PHỘNG'], ['NHẬU BÌNH DÂN', 'GỎI • LÒNG • ĐỒ NHẮM']];
const NIGHT_FOOD: [string, string][] = [
  ['ỐC', 'ỐC LEN XÀO DỪA • SÒ ĐIỆP NƯỚNG'], ['QUÁN NHẬU', 'BIA • ĐỒ NƯỚNG • LẨU'], ['HẢI SẢN', 'TÔM • CUA • GHẸ • MỰC'], ['LẨU DÊ', 'DÊ NƯỚNG • LẨU DÊ'],
  ['BIA HƠI', 'BIA TƯƠI • ĐỒ NHẮM'], ['NƯỚNG NGÓI', 'BÒ • MỰC • TÔM'], ['LẨU BÒ', 'LẨU • BÒ NHÚNG GIẤM'], ['CHÁO VỊT', 'VỊT LUỘC • GỎI VỊT'],
];
const SHOPS: [string, string][] = [
  ['TẠP HÓA', 'NƯỚC NGỌT • BÁNH KẸO • GẠO'], ['TIỆM MAY', 'MAY ĐO • SỬA ĐỒ'], ['TIỆM TÓC', 'CẮT • GỘI • SẤY'], ['NHÀ THUỐC', 'NHÀ THUỐC TÂY • TƯ VẤN'],
  ['SỬA XE', 'VÁ XE • THAY NHỚT • BƠM'], ['ĐIỆN THOẠI', 'SIM SỐ ĐẸP • PHỤ KIỆN'], ['PHOTO', 'PHOTOCOPY • IN ẤN • ÉP PLASTIC'], ['VĂN PHÒNG PHẨM', 'SÁCH VỞ • BÚT • QUÀ'],
  ['TIỆM VÀNG', 'VÀNG BẠC • ĐÁ QUÝ'], ['ĐIỆN MÁY', 'QUẠT • NỒI CƠM • TIVI'], ['GAS', 'GAS • NƯỚC ĐÁ • NƯỚC BÌNH'], ['KIM KHÍ', 'ĐIỆN NƯỚC • ỐC VÍT'],
  ['TIỆM HOA', 'HOA TƯƠI • VÒNG HOA'], ['GIÀY DÉP', 'GIÀY • DÉP • TÚI XÁCH'], ['QUẦN ÁO', 'THỜI TRANG • GIÁ RẺ'], ['GẠO', 'GẠO NGON • NẾP • ĐẬU'],
  ['ĐỒ ĐIỆN', 'BÓNG ĐÈN • DÂY ĐIỆN'], ['NHÀ SÁCH', 'TRUYỆN • BÁO • SÁCH GIÁO KHOA'], ['NHA KHOA', 'TRÁM RĂNG • NIỀNG RĂNG'], ['TIỆM ẢNH', 'CHỤP ẢNH THẺ • IN ẢNH'],
];
const MARKET_SHOPS: [string, string][] = [
  ['VẢI', 'VẢI SỈ • VẢI LẺ'], ['TẠP HÓA', 'BÁN SỈ • BÁN LẺ'], ['ĐỒ KHÔ', 'TÔM KHÔ • MỰC KHÔ • NẤM'], ['TRÁI CÂY', 'TRÁI CÂY TƯƠI • MIỀN TÂY'],
  ['GIA VỊ', 'NƯỚC MẮM • MẮM RUỐC'], ['ĐỒ NHỰA', 'THAU • RỔ • GHẾ NHỰA'], ['THỊT HEO', 'THỊT TƯƠI MỖI SÁNG'], ['RAU CỦ', 'RAU SẠCH ĐÀ LẠT'],
];
const CAFES: [string, string][] = [
  ['CÀ PHÊ VÕNG', 'CÀ PHÊ • NƯỚC ÉP'], ['CÀ PHÊ SỮA ĐÁ', 'CÀ PHÊ PHIN • BẠC XỈU'], ['TRÀ SỮA', 'TRÀ SỮA • TRÀ TRÁI CÂY'], ['CÀ PHÊ CÓC', 'CÀ PHÊ • TRÀ ĐÁ'],
  ['SINH TỐ', 'SINH TỐ • NƯỚC ÉP'], ['NƯỚC MÍA', 'MÍA ÉP • DỪA TƯƠI'], ['CÀ PHÊ', 'CÀ PHÊ RANG XAY'], ['TRÀ ĐÁ', 'TRÀ CHANH • TRÀ TẮC'],
];
/** Who keeps a shop (sign names "BÁNH XÈO CÔ BA"); generic, none a famous shop's name (no Ốc Oanh, Ốc Đào, Ốc Thảo). */
const OWNERS = [
  'CÔ BA', 'CHỊ HAI', 'BÀ TƯ', 'ANH BẢY', 'CÔ NĂM', 'DÌ SÁU', 'CHÚ TÁM', 'BÁC CHÍN', 'CÔ MƯỜI', 'THANH', 'HẠNH', 'LAN', 'PHÚC', 'LỘC', 'THỊNH', 'HÒA', 'MINH', 'HƯƠNG', 'NGỌC', 'TÂM',
  'HOA', 'CÚC', 'LIÊN', 'HẰNG', 'NGA', 'THU', 'HIỀN', 'TUẤN', 'HÙNG', 'DŨNG', 'SƠN', 'NAM', 'BÌNH', 'AN', 'KHOA', 'QUÂN', 'TRÚC', 'YẾN', 'PHƯƠNG', 'CHÚ TƯ',
];
const PAGODAS = ['CHÙA PHÁP HOA', 'CHÙA LONG HOA', 'CHÙA TỪ QUANG', 'CHÙA AN PHƯỚC', 'CHÙA PHƯỚC LÂM', 'CHÙA BỬU QUANG'];
const SIGN_COLORS = ['#b14635', '#245b4f', '#7a4b8c', '#2f5d8a', '#c27c1a', '#1d6a3a', '#8e2b20'];
const NEON = ['#ff3d7f', '#3dd6ff', '#ffc23d', '#7dff6a', '#ff8a3d', '#b04dff'];
const BOARDS = ['#f3e4c7', '#fff2c4', '#e8f0f4', '#fbe3e0', '#f6f6f0'];

export type BusinessKind = 'food' | 'shop' | 'cafe';
type Pick = { kind: BusinessKind; list: [string, string][]; tag: string };
/**
 * Street mixes (ArterialSpec.mix): the share of a street's frontage lots that open a business, then what they sell,
 * by weight. 'oc' is Vĩnh Khánh: ốc first, then seafood and the grill, then beer, hardly a café.
 */
const STREET_MIXES: Record<StreetMix, { share: number; picks: [Pick, number][] }> = {
  oc: { share: 0.9, picks: [[{ kind: 'food', list: OC, tag: 'oc' }, 0.45], [{ kind: 'food', list: SEAFOOD, tag: 'sea' }, 0.3], [{ kind: 'food', list: BEER, tag: 'beer' }, 0.15], [{ kind: 'cafe', list: CAFES, tag: 'cafe' }, 0.05], [{ kind: 'shop', list: SHOPS, tag: 'shop' }, 0.05]] },
};
/** Kind of a frontage lot (and what it sells): its street's mix, else a business share by street class and zone; corner lots always open a business. */
function kindOfLot(r: Rng, lot: Lot, style: DistrictStyle, mix: StreetMix | undefined): Pick | null {
  const m = lot.cls !== 'hem' && mix ? STREET_MIXES[mix] : null;
  const share = m ? m.share : lot.zone === 'night' ? 0.8 : lot.zone === 'market' ? 0.85 : style.business[lot.cls];
  if (!lot.corner && !r.chance(share)) return null;
  let roll = r.next();
  if (m) { for (const [p, w] of m.picks) { if (roll < w) return p; roll -= w; } return m.picks[m.picks.length - 1][0]; }
  const kind: BusinessKind = lot.zone === 'night' ? (roll < 0.7 ? 'food' : roll < 0.88 ? 'cafe' : 'shop') : lot.zone === 'market' ? (roll < 0.65 ? 'shop' : roll < 0.9 ? 'food' : 'cafe') : roll < 0.38 ? 'food' : roll < 0.78 ? 'shop' : 'cafe';
  return kind === 'food' ? (lot.zone === 'night' ? { kind, list: NIGHT_FOOD, tag: 'night' } : { kind, list: STALLS, tag: 'stall' }) : kind === 'cafe' ? { kind, list: CAFES, tag: 'cafe' } : lot.zone === 'market' ? { kind, list: MARKET_SHOPS, tag: 'market' } : { kind, list: SHOPS, tag: 'shop' };
}

/**
 * A sign name and subtitle from `list` for a business at (x, z) on `line`, never twice on one street: every name
 * with every owner (or none) is a slot in a cycle the street's own key shuffles, and a business takes the slot of
 * its place along the street (2.5 m steps, narrower than any lot, both sides interleaved), so the choice depends on
 * nothing else; the cycle comes round only after a few hundred metres (the shortest list, 4 names, after 205 m).
 */
function nameOn(ctx: Ctx, pick: Pick, line: string, x: number, z: number): [string, string] {
  const pts = line.startsWith('hem:') ? ctx.hems.get(line.slice(4))?.pts : ctx.net.arts.get(line)?.pts;
  const h = pts ? polylineHit(pts, x, z) : { s: x + z, off: 1 };
  const slot = 2 * Math.floor(h.s / 2.5) + (h.off > 0 ? 0 : 1), n = pick.list.length * (OWNERS.length + 1);
  const seed = hashKey(ctx.layout.key, 'names', line, pick.tag);
  let step = 1 + (seed % (n - 1));
  while (gcd(step, n) !== 1) step++;
  const k = (((seed >>> 8) % n) + slot * step) % n, [name, sub] = pick.list[k % pick.list.length], owner = Math.floor(k / pick.list.length);
  return [owner ? `${name} ${OWNERS[owner - 1]}` : name, sub];
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Where a door at (x, z) meets the walking line of the line it fronts (a hẻm's centre line), on its own side. */
export function curbOf(net: Net, hems: Map<string, HemPlan>, line: string, walk: number, x: number, z: number): Point {
  const pts = line.startsWith('hem:') ? hems.get(line.slice(4))?.pts : net.arts.get(line)?.pts;
  if (!pts) return { x, z };
  const h = polylineHit(pts, x, z), side = h.off >= 0 ? 1 : -1;
  return { x: r2(h.x - h.hz * side * walk), z: r2(h.z + h.hx * side * walk) };
}

export type DoorCheck = (door: Point, curb: Point, own: OBB) => boolean;
/** The door on a box's front wall (middle first, then stepping sideways, like city.ts findDoor) whose way to the curb is clear. */
export function findDoor(net: Net, hems: Map<string, HemPlan>, box: OBB, line: string, walk: number, ok: DoorCheck) {
  const f = Math.sin(box.yaw), g = Math.cos(box.yaw), rx = g, rz = -f;
  for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, 3.2, -3.2, 4, -4, 5, -5, 6, -6]) {
    if (Math.abs(off) > box.hx - 0.9) continue;
    const door = { x: r2(box.cx + f * (box.hz + 0.8) + rx * off), z: r2(box.cz + g * (box.hz + 0.8) + rz * off) };
    const curb = curbOf(net, hems, line, walk, door.x, door.z);
    if (ok(door, curb, box)) return { door, curb };
  }
  return null;
}

export type Ctx = { layout: DistrictLayout; net: Net; hems: Map<string, HemPlan>; style: DistrictStyle; door: DoorCheck };

/** Buildings for a block's lots, in lot order. Lots whose door finds no clear way out are left empty. */
export function buildLots(ctx: Ctx, block: string, lots: Lot[]): Draft[] {
  const r = stream(ctx.layout.key, 'buildings', block), out: Draft[] = [];
  // Chung cư slabs take their lô letters A, B, C… in lot order within the block.
  let slab = 0;
  for (const lot of lots) {
    const d = draftLot(ctx, r, lot, slab);
    if (!d) continue;
    out.push(d);
    if (d.building.typology === 'apartment') slab++;
  }
  return out;
}

function addressOf(ctx: Ctx, lot: Lot, x: number, z: number) {
  const { net, hems } = ctx;
  if (!lot.line.startsWith('hem:')) { const n = streetNumber(net, lot.line, x, z); return { number: n, address: String(n), street: net.arts.get(lot.line)?.name ?? '' }; }
  const h = hems.get(lot.line.slice(4))!;
  const head = Number(/\d+/.exec(h.name)?.[0] ?? 1), hit = polylineHit(h.pts, x, z);
  const sub = 2 * Math.max(1, Math.round(hit.s / 3.5)) - (hit.off > 0 ? 0 : 1);
  return { number: sub, address: `${head}/${sub}`, street: h.name };
}

function draftLot(ctx: Ctx, r: Rng, lot: Lot, slab: number): Draft | null {
  const { net, hems, style } = ctx, zs = ZONE_STYLES[lot.zone];
  const f = Math.sin(lot.box.yaw), g = Math.cos(lot.box.yaw);
  // Footprint: the lot, set back from the front where the zone wants a yard; institutions sit at the back of theirs.
  let setback = lot.use === 'row' || lot.use === 'hem' ? zs.setback : 0, w = lot.box.hx * 2, depth = lot.box.hz * 2 - setback, typology: Typology = 'tube';
  let kind: BuildingKind = 'home', storeys = 1, facade: Facade = 'plain', name = '', subtitle = '', tower: TowerSpec | null = null, pstyle: PlotStyle = 'home';
  let color = r.pick(style.palette), residents = 0, jobs = 0;
  const signColor = r.pick(SIGN_COLORS);
  if (lot.use === 'market') {
    typology = 'market-hall'; kind = 'shop'; storeys = 2; facade = 'gallery'; pstyle = 'shop'; jobs = 8; color = '#d9c39a';
    name = zoneName(ctx, lot) ?? `CHỢ ${short(net.arts.get(lot.line)?.name ?? 'XÓM')}`; subtitle = 'CHỢ SÁNG • HÀNG TƯƠI SỐNG • ĐỒ KHÔ';
  } else if (lot.use === 'pagoda' || lot.use === 'church') {
    const church = lot.use === 'church';
    typology = church ? 'church' : 'pagoda'; kind = 'pagoda'; pstyle = 'pagoda'; facade = church ? 'colonial' : 'temple'; storeys = church ? 2 : 1;
    w = lot.w * (church ? 0.5 : 0.62); setback = lot.d * (church ? 0.32 : 0.45); depth = lot.box.hz * 2 - setback - 1.5;
    color = church ? '#e8d5c0' : '#e7b75f'; residents = church ? 0 : 2; jobs = 1;
    name = zoneName(ctx, lot) ?? (church ? `NHÀ THỜ ${short(net.arts.get(lot.line)?.name ?? 'GIÁO XỨ')}` : r.pick(PAGODAS));
    subtitle = church ? 'THÁNH LỄ 5:00 • 17:30' : 'NAM MÔ A DI ĐÀ PHẬT';
  } else if (lot.use === 'school') {
    typology = 'school'; kind = 'school'; pstyle = 'school'; facade = 'gallery'; storeys = 3; color = '#f2d58a'; jobs = 5;
    setback = lot.d * 0.55; depth = Math.min(11, lot.box.hz * 2 - setback - 1);
    name = zoneName(ctx, lot) ?? 'TRƯỜNG TIỂU HỌC'; subtitle = `TRƯỜNG TIỂU HỌC ${short(net.arts.get(lot.line)?.name ?? '')}`.trim();
  } else if (lot.zone === 'warehouse') {
    typology = 'warehouse'; kind = 'office'; pstyle = 'office'; facade = 'shed'; storeys = 1; jobs = 4;
    color = r.pick(['#a9a59a', '#b8b2a2', '#9aa3a6', '#c2a77f', '#8f9a8c']);
    name = `KHO SỐ ${streetNumber(net, lot.line, lot.box.cx, lot.box.cz)}`; subtitle = r.pick(['CẢNG • HÀNG HÓA', 'KHO BÃI • VẬN TẢI', 'HÀNG XUẤT NHẬP KHẨU', 'CHO THUÊ KHO']);
  } else if (lot.zone === 'apartment') {
    typology = 'apartment'; kind = 'home'; pstyle = 'midrise'; facade = 'gallery'; storeys = r.int(zs.storeys[1] - zs.storeys[0] + 1) + zs.storeys[0]; residents = 4;
    color = r.pick(['#d9cbb3', '#c9c2b6', '#e3d6bd', '#b9c3c4', '#d6b9a2', '#c4ccd4']);
    tower = { form: 'apartment', floor: 3.2, glass: '#8ea5ad', frame: color, pattern: 2, crown: 'flat', podium: 0 };
    // The complex takes its zone's name (else the street it fronts); each slab is a lô.
    name = `CHUNG CƯ ${zoneName(ctx, lot) ?? short(net.arts.get(lot.line)?.name ?? hems.get(lot.line.slice(4))?.name ?? '')}`.trim(); subtitle = `LÔ ${String.fromCharCode(65 + (slab % 26))} • CHUNG CƯ CŨ`;
  } else if (lot.zone === 'villa') {
    typology = 'villa'; kind = 'home'; facade = r.pick(['colonial', 'modern'] as const); storeys = r.int(2) + 2; residents = 3;
    color = r.pick(['#f2e6c9', '#e9d9b0', '#f5f0e6', '#e4cfc0', '#dfe6d6']);
  } else {
    const pick = kindOfLot(r, lot, style, lot.cls === 'hem' ? undefined : net.arts.get(lot.line)?.mix);
    kind = pick?.kind ?? 'home';
    typology = lot.stilt > 0 ? 'stilt' : 'tube';
    const [lo, hi] = zs.storeys, bonus = lot.cls === 'R1' ? 1 : lot.cls === 'hem' ? -1 : 0;
    storeys = Math.max(1, Math.min(hi + (lot.cls === 'R1' ? 1 : 0), lo + r.int(hi - lo + 1) + (r.chance(0.5) ? bonus : 0)));
    if (typology === 'stilt') storeys = Math.min(storeys, 2);
    facade = r.pick(['plain', 'balcony', 'balcony', 'tiled', 'cage', kind === 'home' ? 'shutter' : 'balcony'] as const);
    residents = kind === 'home' ? 1 + (r.chance(0.35) ? 1 : 0) : r.chance(0.6) ? 1 : 0;
    jobs = kind === 'home' ? 0 : 1 + (r.chance(0.3) ? 1 : 0);
    pstyle = kind === 'home' ? 'home' : 'shop';
    if (pick) [name, subtitle] = nameOn(ctx, pick, lot.line, lot.box.cx + f * lot.box.hz, lot.box.cz + g * lot.box.hz);
  }
  if (!storeys) storeys = 1;
  const front = { x: lot.box.cx + f * lot.box.hz, z: lot.box.cz + g * lot.box.hz };
  const box: OBB = { cx: r2(front.x - f * (setback + depth / 2)), cz: r2(front.z - g * (setback + depth / 2)), hx: r2(w / 2), hz: r2(depth / 2), yaw: lot.box.yaw };
  const full: OBB = lot.stilt > 0 ? { ...box, cx: r2(box.cx - f * lot.stilt / 2), cz: r2(box.cz - g * lot.stilt / 2), hz: r2(box.hz + lot.stilt / 2) } : box;
  const found = findDoor(net, hems, box, lot.line, lot.walk, ctx.door);
  if (!found) return null;
  const { number, address, street } = addressOf(ctx, lot, found.door.x, found.door.z);
  if (!name) { name = typology === 'villa' ? `BIỆT THỰ ${address}` : `NHÀ SỐ ${address}`; subtitle = `${address} ${street}`; }
  // A chung cư slab on a street opens kiosks along its ground floor (the street's usual mix), either side of its stairs.
  const kiosks: Kiosk[] = [], kioskSigns: GenSign[] = [];
  if (typology === 'apartment' && lot.cls !== 'hem') {
    const rx = g, rz = -f, fx = box.cx + f * box.hz, fz = box.cz + g * box.hz, du = (found.door.x - fx) * rx + (found.door.z - fz) * rz;
    for (let u = -box.hx + 2.4; u <= box.hx - 2.4; u += 4.6) {
      if (Math.abs(u - du) < 3 || !r.chance(0.8)) continue;
      const roll = r.next(), pick: Pick = roll < 0.38 ? { kind: 'food', list: STALLS, tag: 'stall' } : roll < 0.78 ? { kind: 'shop', list: SHOPS, tag: 'shop' } : { kind: 'cafe', list: CAFES, tag: 'cafe' };
      const x = fx + rx * u, z = fz + rz * u, [n, sub] = nameOn(ctx, pick, lot.line, x, z), key = `${lot.key}:k${kiosks.length}`;
      kiosks.push({ key, kind: pick.kind, name: n, subtitle: sub, x: r2(x + f * 0.3), z: r2(z + g * 0.3), yaw: r6(lot.box.yaw) });
      kioskSigns.push({ key: `${key}:s`, kind: 'board', text: n, subtitle: sub, color: r.pick(SIGN_COLORS), background: r.pick(BOARDS), x: r2(x + f * 0.15), y: 3.1, z: r2(z + g * 0.15), w: 3.6, h: 0.8, yaw: r6(lot.box.yaw), building: lot.key });
    }
    jobs += kiosks.length;
  }
  const floor = typology === 'warehouse' ? 8 + r.range(0, 2.5) : typology === 'market-hall' ? 9.5 : typology === 'pagoda' ? 9.6 : typology === 'church' ? 16 : typology === 'school' ? 10.6 : storeys * 3.3 + r.range(0.4, 1.1);
  const h = r2(floor);
  const business = kind === 'food' || kind === 'shop' || kind === 'cafe' || typology === 'market-hall';
  const box2 = boxOf(full), ground = boxOf(box);
  const building: Omit<GenBuilding, 'id'> = {
    x: full.cx, z: full.cz, w: r2(w), d: r2(full.hz * 2), h, facing: r6(lot.box.yaw), name, subtitle, kind, color,
    door: found.door, curb: found.curb, residents, jobs,
    key: lot.key, block: lot.block, lot: lot.key, typology, storeys, facade, box: full, address, zone: lot.zone, stamp: null,
  };
  const plot: Omit<GenPlot, 'id'> = {
    style: pstyle, full: rect(box2), ground: rect(ground), h, facing: r6(lot.box.yaw), legacy: -1,
    sign: business || typology !== 'tube', signColor: lot.zone === 'night' && business ? r.pick(NEON) : signColor, number, row: -1, seed: Math.floor(r.next() * 1e6), tower,
    key: lot.key, typology, storeys, facade, box: full, stilt: lot.stilt, kiosks,
  };
  return { building, plot, signs: [...signsFor(r, building, plot, business), ...kioskSigns], business };
}

const rect = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => ({ minX: r2(b.minX), maxX: r2(b.maxX), minZ: r2(b.minZ), maxZ: r2(b.maxZ) });
const zoneName = (_ctx: Ctx, lot: Lot) => lot.name;
/** "ĐƯỜNG BẾN VÂN ĐỒN" -> "BẾN VÂN ĐỒN". */
const short = (name: string) => name.replace(/^(ĐƯỜNG|ĐẠI LỘ|HẺM)\s+/, '');

function signsFor(r: Rng, b: Omit<GenBuilding, 'id'>, p: Omit<GenPlot, 'id'>, business: boolean): GenSign[] {
  const f = Math.sin(b.facing), g = Math.cos(b.facing), fb = b.box;
  const fx = fb.cx + f * fb.hz, fz = fb.cz + g * fb.hz, out: GenSign[] = [];
  if (b.typology === 'pagoda' || b.typology === 'church' || b.typology === 'school' || b.typology === 'market-hall' || b.typology === 'apartment' || b.typology === 'warehouse') {
    const w = r2(Math.min(fb.hx * 2 - 1, b.typology === 'market-hall' ? 16 : 11)), lo = b.typology === 'apartment' ? b.subtitle.split(' • ')[0] : '';
    // A chung cư slab's sign is its lô letter, the complex under it.
    out.push({ key: `${b.key}:s`, kind: 'board', text: lo || b.name, subtitle: lo ? b.name : b.subtitle, color: p.signColor, background: '#f3e4c7', x: r2(fx + f * 0.15), y: r2(Math.min(b.h - 1, b.typology === 'warehouse' ? 6.4 : 5.2)), z: r2(fz + g * 0.15), w, h: 1.3, yaw: b.facing, building: b.key });
    return out;
  }
  if (business) {
    out.push({ key: `${b.key}:s`, kind: 'board', text: b.name, subtitle: b.subtitle, color: p.signColor, background: r.pick(BOARDS), x: r2(fx + f * 0.15), y: 3.75, z: r2(fz + g * 0.15), w: r2(Math.min(fb.hx * 2 - 0.4, 9)), h: 0.95, yaw: b.facing, building: b.key });
    if (r.chance(0.45) && b.storeys >= 2) {
      // Vertical light box at the edge of the front, readable from along the street.
      const rx = Math.cos(b.facing), rz = -Math.sin(b.facing), side = r.chance(0.5) ? 1 : -1, off = fb.hx - 0.35;
      out.push({ key: `${b.key}:v`, kind: 'vertical', text: b.name.split(' ').slice(0, 2).join(' '), subtitle: '', color: p.signColor, background: '#fff8e8', x: r2(fx + f * 0.55 + rx * off * side), y: 5.2, z: r2(fz + g * 0.55 + rz * off * side), w: 0.6, h: 1.9, yaw: r6(b.facing + Math.PI / 2), building: b.key });
    }
  } else if (b.typology !== 'villa') {
    out.push({ key: `${b.key}:p`, kind: 'plate', text: b.address, subtitle: '', color: '#1d4f9c', background: '#f6f6f0', x: r2(fx + f * 0.05 + Math.cos(b.facing) * 0.9), y: 2.55, z: r2(fz + g * 0.05 - Math.sin(b.facing) * 0.9), w: 0.5, h: 0.25, yaw: b.facing, building: b.key });
  }
  return out;
}

/** Cổng hẻm: an arch sign "HẺM 45" over every hẻm mouth, where the hẻm leaves the street's sidewalk. */
export function hemArches(net: Net, hems: HemPlan[]): GenSign[] {
  const out: GenSign[] = [];
  for (const h of hems) {
    for (const end of [0, 1] as const) {
      const ei = h.ends[end];
      if (ei < 0) continue;
      const e = net.edges[ei], n = h.pts.length, k = end ? n - 2 : 0, q = end ? n - 4 : 2;
      const dx = h.pts[q] - h.pts[k], dz = h.pts[q + 1] - h.pts[k + 1], l = hyp(dx, dz), front = e.half + e.sidewalk;
      if (l <= front + 1) continue;
      out.push({
        key: `${h.key}:arch${end}`, kind: 'arch', text: h.name, subtitle: short(e.name), color: '#8e2b20', background: '#ffe9a8',
        x: r2(h.pts[k] + (dx / l) * front), y: 3.9, z: r2(h.pts[k + 1] + (dz / l) * front), w: r2(2 * h.half + 0.6), h: 0.55, yaw: r6(Math.atan2(-dx, -dz)), building: null,
      });
    }
  }
  return out;
}

/** A stamp's building: the authored footprint, kind and name; its door on the front wall, its curb on the nearest walking line. */
export function buildStamp(ctx: Ctx, s: StampSpec, line: string, walk: number): Draft | null {
  const typology: Typology = s.kind === 'story' || s.kind === 'landmark' ? 'landmark' : s.kind === 'park' ? 'landmark' : s.kind === 'market' ? 'market-hall' : s.kind as Typology;
  const kind: BuildingKind = s.building ?? (s.kind === 'market' ? 'shop' : s.kind === 'pagoda' || s.kind === 'church' ? 'pagoda' : s.kind === 'school' ? 'school' : s.kind === 'police' ? 'police' : s.kind === 'hospital' ? 'hospital' : s.kind === 'apartment' ? 'home' : 'office');
  const pstyle: PlotStyle = kind === 'pagoda' ? 'pagoda' : kind === 'school' ? 'school' : kind === 'police' ? 'police' : kind === 'hospital' ? 'hospital' : kind === 'home' ? 'midrise' : kind === 'shop' ? 'shop' : 'office';
  const box: OBB = { cx: s.x, cz: s.z, hx: s.w / 2, hz: s.d / 2, yaw: s.yaw };
  const entrance = s.entrance ? { door: { x: r2(s.entrance.x), z: r2(s.entrance.z) }, curb: curbOf(ctx.net, ctx.hems, line, walk, s.entrance.x, s.entrance.z) } : null;
  const found = entrance ? (ctx.door(entrance.door, entrance.curb, box) ? entrance : null) : findDoor(ctx.net, ctx.hems, box, line, walk, ctx.door);
  if (!found) return null;
  const storeys = s.storeys ?? Math.max(1, Math.round((s.h ?? 9) / 3.6));
  const h = s.h ?? storeys * 3.6;
  const r = stream(ctx.layout.key, 'stamp', s.id);
  const building: Omit<GenBuilding, 'id'> = {
    x: s.x, z: s.z, w: s.w, d: s.d, h, facing: r6(s.yaw), name: s.name, subtitle: s.subtitle ?? '', kind, color: s.color ?? '#c9c2b6',
    door: found.door, curb: found.curb, residents: kind === 'home' ? 6 : 0, jobs: kind === 'home' ? 0 : 3,
    key: `stamp:${s.id}`, block: '', lot: '', typology, storeys, facade: typology === 'warehouse' ? 'shed' : 'plain', box, address: '', zone: s.kind, stamp: s.id,
  };
  const plot: Omit<GenPlot, 'id'> = {
    style: pstyle, full: rect(boxOf(box)), ground: rect(boxOf(box)), h, facing: r6(s.yaw), legacy: -1, sign: true, signColor: r.pick(SIGN_COLORS), number: 0, row: -1, seed: Math.floor(r.next() * 1e6),
    tower: kind === 'home' ? { form: 'apartment', floor: 3.2, glass: '#8ea5ad', frame: s.color ?? '#d9cbb3', pattern: 2, crown: 'flat', podium: 0 } : null,
    key: building.key, typology, storeys, facade: building.facade, box, stilt: 0, kiosks: [],
  };
  const f = Math.sin(s.yaw), g = Math.cos(s.yaw);
  const signs: GenSign[] = [{ key: `${building.key}:s`, kind: 'board', text: s.name, subtitle: s.subtitle ?? '', color: plot.signColor, background: '#f3e4c7', x: r2(s.x + f * (s.d / 2 + 0.15)), y: r2(Math.min(h - 1, 6)), z: r2(s.z + g * (s.d / 2 + 0.15)), w: r2(Math.min(s.w - 1, 14)), h: 1.4, yaw: r6(s.yaw), building: building.key }];
  return { building, plot, signs, business: kind === 'shop' };
}

