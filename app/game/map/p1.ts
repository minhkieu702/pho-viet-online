/**
 * Phase 1 of design 1's city as one stack (critique steps 14–18): Quận 4 with the Bến Nghé strip, Bình Thạnh east
 * with the Thị Nghè strip, Quận 3, Quận 1 south and the Thủ Thiêm strip, each built alone against today's road graph
 * (Thủ Thiêm on the Đò ngang link), stacked in this order and welded at the seams their authors agreed by coordinates.
 * The wiring steps build the live map from buildP1; scripts/map-layout.test.mjs checks the stack with validateStack.
 * Pure data and maths (no three.js).
 */
import type { RoadGraph } from './roads.ts';
import { buildDistrict } from './build-district.ts';
import { readdress } from './addresses.ts';
import { linkGraph, linksOf, stackSlices, type DistrictLink, type Seam, type StackSlice } from './stack.ts';
import type { DistrictLayout } from './layout/types.ts';
import { QUAN_4 } from './layout/quan-4.ts';
import { BINH_THANH } from './layout/binh-thanh.ts';
import { QUAN_3 } from './layout/quan-3.ts';
import { QUAN_1_SOUTH } from './layout/quan-1-south.ts';
import { THU_THIEM, THU_THIEM_LINK } from './layout/thu-thiem.ts';

/** The P1 slices in wiring order (step 14 first, then steps 15–18). */
export const P1_LAYOUTS: readonly DistrictLayout[] = [QUAN_4, BINH_THANH, QUAN_3, QUAN_1_SOUTH, THU_THIEM];
/** Links that are not streets: the ferry to Thủ Thiêm (no road crosses the river until step 20). */
export const P1_LINKS: readonly DistrictLink[] = [THU_THIEM_LINK];

/**
 * The seams between slices, from their EXTRA notes (BINH_THANH_EXTRA.quan3, QUAN_3_EXTRA.seams, QUAN_1_SOUTH_EXTRA.seams).
 * Each slice ends its road on the agreed point; the stack welds them. Cầu Công Lý (-270, 192) is built by neither
 * slice in P1 (QUAN_3_EXTRA.deferred), so it is no seam.
 */
export const P1_SEAMS: readonly Seam[] = [
  { id: 'hoang-sa', kind: 'node', x: -160, z: 137.5, slices: ['binh-thanh', 'quan-3'], note: 'Đường Hoàng Sa straight on at the D1/D3 line (R2, sidewalk 4.5 both sides)' },
  { id: 'le-van-sy', kind: 'node', x: -160, z: 162, slices: ['binh-thanh', 'quan-3'], note: 'Cầu Lê Văn Sỹ lands on Võ Thị Sáu × Hoàng Sa: a four-way' },
  { id: 'le-thanh-ton-q3', kind: 'node', x: 135, z: 162, slices: ['quan-3', 'quan-1-south'], note: 'Võ Thị Sáu becomes Lê Thánh Tôn, straight on' },
  { id: 'nguyen-thi-minh-khai', kind: 'node', x: 135, z: 216, slices: ['quan-3', 'quan-1-south'], note: 'Nguyễn Thị Minh Khai straight on, Hàn Thuyên leaves south: a T' },
  { id: 'tran-hung-dao', kind: 'node', x: 135, z: 385, slices: ['quan-3', 'quan-1-south'], note: 'Trần Hưng Đạo straight on, Hàn Thuyên arrives from the north: a T' },
  { id: 'vo-van-kiet-q3', kind: 'node', x: 135, z: 425, slices: ['quan-3', 'quan-1-south'], note: 'Võ Văn Kiệt straight on along Tàu Hũ' },
  { id: 'le-thanh-ton-q4', kind: 'node', x: 372, z: 162, slices: ['quan-1-south', 'quan-4'], note: 'Lê Thánh Tôn onto Võ Văn Kiệt × Cầu Ông Lãnh: a signalled four-way' },
  { id: 'bui-vien', kind: 'split', x: 372, z: 250, slices: ['quan-1-south', 'quan-4'], note: 'Bùi Viện onto the middle of Quận 4\'s Võ Văn Kiệt: a T' },
  { id: 'le-lai', kind: 'node', x: 372, z: 300, slices: ['quan-1-south', 'quan-4'], note: 'Lê Lai and Võ Văn Kiệt south onto Võ Văn Kiệt × Cầu Nguyễn Khoái: a signalled four-way' },
  { id: 'hem-24-21', kind: 'footway', x: 355, z: 207, to: { x: 359.6, z: 207 }, slices: ['quan-1-south', 'quan-4'], note: 'HẺM 24/21 LÊ THÁNH TÔN steps out onto Võ Văn Kiệt\'s west walking line' },
  { id: 'hem-24-35', kind: 'footway', x: 350.7, z: 225.97, to: { x: 359.6, z: 225.97 }, slices: ['quan-1-south', 'quan-4'], note: 'the generated HẺM 24/35 LÊ THÁNH TÔN (Phạm Ngũ Lão quarter, off the authored HẺM 24; the generator named it HẺM 31) ends at the block edge 4 m short of Võ Văn Kiệt\'s sidewalk: a footway across' },
];

/** The seams between slices that are all in `keys` (a wiring step welds only the seams both of whose sides are built). */
export const seamsAmong = (keys: Iterable<string>) => { const k = new Set(keys); return P1_SEAMS.filter((s) => s.slices.every((x) => k.has(x))); };
/** The links the given slices hang on. */
export const linksAmong = (layouts: readonly DistrictLayout[]) => P1_LINKS.filter((l) => layouts.some((x) => linksOf(x, [l]).length));

/**
 * Builds P1 slices (default all, in wiring order; a wiring step passes the slices built so far) with building ids from
 * `idBase` on, slice after slice, as the live map numbers them after today's BUILDINGS, gives them the stack's street
 * addresses (addresses.ts: one number line per street across its stretches and seams, hẻm named after their street,
 * "82/20 ĐƯỜNG HOÀNG SA" on a hẻm) and stacks them on `legacy` with their links, welding the seams among them.
 */
export function buildP1(legacy: RoadGraph, opts: { idBase?: number; layouts?: readonly DistrictLayout[] } = {}) {
  let idBase = opts.idBase ?? 0;
  const layouts = opts.layouts ?? P1_LAYOUTS;
  const slices: StackSlice[] = layouts.map((layout) => {
    const links = linksOf(layout, P1_LINKS);
    const data = buildDistrict(layout, linkGraph(legacy, links), { idBase });
    idBase += data.buildings.length;
    return { key: layout.key, layout, data, links: links.map((l) => l.id) };
  });
  const addresses = readdress(slices);
  const seams = seamsAmong(slices.map((s) => s.key));
  return { slices, seams, addresses, stack: stackSlices(legacy, linksAmong(layouts), slices, seams) };
}
