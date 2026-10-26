/**
 * Story stamps (critique step 13, design 1 §8 and the binding amendment): the campaign's reserved sites at design
 * 1's coordinates, as pure data. A stamp is a footprint (a box `w` along its front and `d` deep around (x, z),
 * facing `yaw`: 0 is +z, PI/2 is +x), a mission anchor and the way in. Building stamps are StampSpecs: the layout
 * of the district that holds them (layout/*.ts, via stampSpec) builds them, and the generator keeps every lot off
 * them. A P2 site has a P1 fallback, so the story never waits for a P2 district. The cargo ship is a moored hull,
 * not a building: step 14 builds it with its gangway from these numbers. All of them are fictional businesses; no
 * story site is a real company, and no crime scene touches a heritage or religious site.
 */
import type { DistrictId } from './districts.ts';
import type { StampSpec } from './layout/types.ts';

export type StoryStampId = 'kho7' | 'cargo-ship' | 'villa' | 'villa-p1' | 'factory' | 'factory-p1';
export type StoryStamp = StampSpec & {
  id: StoryStampId; kind: 'story'; anchor: StoryStampId;
  district: DistrictId; phase: 'P1' | 'P2';
  /** A building a layout builds, or a hull moored at a quay. */
  form: 'building' | 'ship';
  /** The layout (DistrictLayout.key) that builds it (a hull: whose extra data carries its berth), or null while its district is not built. */
  layout: string | null;
  /** Where missions point (design 1's story coordinates) and the way the player faces on arrival. */
  at: { x: number; z: number; yaw: number };
  /** The P1 site standing in for this P2 one, or the P2 site this one stands in for. */
  fallback?: StoryStampId; fallbackFor?: StoryStampId;
  /** Story-side names: the campaign set that dresses it (story-system-campaign.md) and who it belongs to. */
  story: { role: string; set?: string; owner?: string; note?: string };
  /** A private pier (villas): from the bank out to the end, at x. */
  pier?: { x: number; z0: number; z1: number };
  /** A hull's gangway: from the quay edge to the deck. */
  gangway?: { ax: number; az: number; bx: number; bz: number };
  /**
   * A hull's moorings and the other ways aboard: bow and stern lines from quay bollards (fixtures of the layout) to
   * the hull, tyre fenders hung on its quay side (climbable from the water), and a pilot ladder on its river side.
   */
  moor?: { lines: { ax: number; az: number; bx: number; bz: number }[]; fenders: { x: number; z: number }[]; ladder: { x: number; z: number; yaw: number } };
  /** A chimney or mast standing over the roof: where and how tall. */
  chimney?: { x: number; z: number; h: number };
};

const H = Math.PI / 2;
export const STORY_STAMPS: StoryStamp[] = [
  {
    // Design 1: KHO 1–9 line the Khánh Hội wharf; KHO 7 is x 560..600, z -132..-80, its doors on Nguyễn Tất Thành
    // behind the port fence's truck gate (quan-4.ts), a river-side hatch onto the quay and a ladder up its east wall.
    id: 'kho7', kind: 'story', anchor: 'kho7', district: 'D5', phase: 'P1', form: 'building', layout: 'quan-4',
    name: 'KHO 7', subtitle: 'KHO RIÊNG • KHÔNG PHẬN SỰ MIỄN VÀO', x: 580, z: -106, w: 40, d: 52, yaw: 0, h: 11, storeys: 1, building: 'office', color: '#9b8f80', yard: 2,
    entrance: { x: 582, z: -79.2 }, at: { x: 580, z: -105, yaw: Math.PI },
    ways: [{ kind: 'hatch', x: 580, z: -132.6, yaw: Math.PI }, { kind: 'ladder', x: 600.6, z: -95, yaw: Math.PI / 2 }],
    story: { role: 'docks warehouse (design 1 §8): the ring\'s cold-chain store on the wharf; closed until act 2', owner: 'TẬP ĐOÀN SEN VÀNG (fictional)', note: 'registry text "Kho riêng · Không phận sự miễn vào" (design 3 A5.2)' },
  },
  {
    // Moored in the Khánh Hội basin, hull 95 × 16, broadside to the wharf; P2 moves it to the Cát Lái quay (x 804..820, z 40..135).
    id: 'cargo-ship', kind: 'story', anchor: 'cargo-ship', district: 'D5', phase: 'P1', form: 'ship', layout: 'quan-4',
    name: 'TÀU HÀNG', subtitle: 'TÀU CONTAINER • CẢNG KHÁNH HỘI', x: 527, z: -158, w: 95, d: 16, yaw: 0, h: 14,
    entrance: { x: 527, z: -136.8 }, at: { x: 527, z: -158, yaw: Math.PI }, gangway: { ax: 527, az: -137.6, bx: 527, bz: -150 },
    moor: {
      lines: [{ ax: 485, az: -136.9, bx: 484, bz: -150 }, { ax: 570, az: -136.9, bx: 571, bz: -150 }],
      fenders: [488, 496, 504, 512, 520, 534, 542, 550, 558, 566].map((x) => ({ x, z: -149.7 })), ladder: { x: 545, z: -166.3, yaw: Math.PI },
    },
    story: { role: 'cargo ship of the finale: "Con tàu container rời cảng là xong đợt cuối" (ch. 8, CS08)', owner: 'TẬP ĐOÀN SEN VÀNG (fictional)', note: 'P1 finale: chase across the basin; P2: sails south under Cầu Phú Mỹ to the buoy line at z 860' },
  },
  {
    // Thảo Điền riverside villa, x -590..-530, z -245..-208, its own pier out to z -188; faces the lane to the north.
    id: 'villa', kind: 'story', anchor: 'villa', district: 'D10', phase: 'P2', form: 'building', layout: null, fallback: 'villa-p1',
    name: 'BIỆT THỰ VEN SÔNG', subtitle: 'NHÀ RIÊNG • CÓ CAMERA', x: -560, z: -226.5, w: 60, d: 37, yaw: Math.PI, h: 10, storeys: 3, building: 'home', color: '#f2e6c9', yard: 4,
    entrance: { x: -560, z: -245.8 }, at: { x: -560, z: -228, yaw: 0 }, pier: { x: -560, z0: -203.6, z1: -188 },
    story: { role: 'the ring boss\'s villa: approach by swimming, sampan or over the wall', set: 'phuong-penthouse', owner: 'Lý Kim Phượng (Bà Phượng Sen Vàng)', note: 'the campaign dresses it as the villa set; until the move it uses CHUNG CƯ SÔNG XANH (≈297, 27)' },
  },
  {
    // P1 fallback on the Thủ Thiêm riverside strip, the same shape, with its pier.
    id: 'villa-p1', kind: 'story', anchor: 'villa-p1', district: 'D9', phase: 'P1', form: 'building', layout: 'thu-thiem', fallbackFor: 'villa',
    name: 'BIỆT THỰ VEN SÔNG', subtitle: 'NHÀ RIÊNG • CÓ CAMERA', x: -380, z: -226.5, w: 50, d: 37, yaw: Math.PI, h: 10, storeys: 3, building: 'home', color: '#f2e6c9', yard: 4,
    entrance: { x: -380, z: -245.8 }, at: { x: -380, z: -228, yaw: 0 }, pier: { x: -380, z0: -203.6, z1: -188 },
    story: { role: 'P1 stand-in for the Thảo Điền villa (Thủ Thiêm riverside, step 18 builds it)', set: 'phuong-penthouse', owner: 'Lý Kim Phượng (Bà Phượng Sen Vàng)' },
  },
  {
    // Thạnh Mỹ Lợi abandoned factory, x 955..1045, z 490..550, a 40 m chimney; its gate faces the port road to the west.
    id: 'factory', kind: 'story', anchor: 'factory', district: 'D9', phase: 'P2', form: 'building', layout: null, fallback: 'factory-p1',
    name: 'NHÀ MÁY BỎ HOANG', subtitle: 'CẤM VÀO • CÔNG TRÌNH NGUY HIỂM', x: 1000, z: 520, w: 60, d: 90, yaw: -H, h: 12, storeys: 2, building: 'office', color: '#8e877b', yard: 6,
    entrance: { x: 954.2, z: 520 }, at: { x: 1000, z: 520, yaw: H }, chimney: { x: 1030, z: 540, h: 40 },
    story: { role: 'abandoned factory: the last holding site', set: 'mai-am-sen-vang', owner: 'MÁI ẤM SEN VÀNG (the ring\'s charity front)' },
  },
  {
    // P1 fallback: a derelict Tân Thuận warehouse on the Quận 4 east quay, its door on Nguyễn Tất Thành.
    id: 'factory-p1', kind: 'story', anchor: 'factory-p1', district: 'D5', phase: 'P1', form: 'building', layout: 'quan-4', fallbackFor: 'factory',
    name: 'KHO BỎ HOANG TÂN THUẬN', subtitle: 'CẤM VÀO • CÔNG TRÌNH NGUY HIỂM', x: 655, z: 380, w: 30, d: 26, yaw: -H, h: 9, storeys: 1, building: 'office', color: '#8e877b', yard: 2,
    entrance: { x: 641.2, z: 386 }, at: { x: 655, z: 380, yaw: H }, chimney: { x: 662, z: 371, h: 18 },
    story: { role: 'P1 stand-in for the Thạnh Mỹ Lợi factory', set: 'mai-am-sen-vang', owner: 'MÁI ẤM SEN VÀNG (the ring\'s charity front)' },
  },
];

export const STORY_STAMP: Record<StoryStampId, StoryStamp> = Object.fromEntries(STORY_STAMPS.map((s) => [s.id, s])) as Record<StoryStampId, StoryStamp>;

/** The StampSpec a layout passes to the generator for a building story stamp (only the layout fields). */
export function stampSpec(id: StoryStampId): StampSpec {
  const s = STORY_STAMP[id];
  if (s.form !== 'building') throw new Error(`stamp ${id} is a ${s.form}, not a building`);
  const { name, subtitle, x, z, w, d, yaw, h, storeys, building, color, entrance, yard, anchor, ways } = s;
  return { id, kind: 'story', name, subtitle, x, z, w, d, yaw, h, storeys, building, color, entrance, yard, anchor, ways };
}
