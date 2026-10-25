/**
 * Constant tables of today's map: pure literals with no generation, so page.tsx (and the SSR bundle it
 * pulls in) can import them without running the city layout. city.ts imports and re-exports them.
 */

/** Axis-aligned footprint; the same shape as world.ts' Collider. */
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number;
  /** Height of a low solid (a planter, a stall counter) a falling body can land on; walls without one are infinitely tall. */
  top?: number };
export type Point = { x: number; z: number };

/** North-south road centre lines (x). The four east of 108 run through downtown. Roads are 20 m wide, asphalt 14 m. */
export const ROADS_X = [-108, -54, 0, 54, 108, 162, 216, 270, 324];
/** East-west road centre lines (z); they cross the whole map, An Hòa and downtown alike. */
export const ROADS_Z = [-108, -54, 0, 54, 108];
export const SIDEWALK = 8.4; // pedestrians walk on lines at road centre ± 8.4
/** Dry land inside the fences: An Hòa (x -135..135) and downtown (x 135..351). The river lies north of it. */
export const LAND: Rect = { minX: -138, maxX: 352, minZ: -135, maxZ: 137.5 };
/** Open water from the promenade wall to the far bank's wall, between the buoy lines at either end. */
export const RIVER: Rect = { minX: -138, maxX: 352, minZ: -203.6, maxZ: -137.6 };
/** Everything the player can reach. */
export const PLAY: Rect = { minX: LAND.minX, maxX: LAND.maxX, minZ: RIVER.minZ, maxZ: LAND.maxZ };
export const WATER_LEVEL = -0.8;
export const RIVER_BED = -2.8;
/** Where downtown (Quận 1 · Bến Nghé) begins, east of An Hòa. */
export const DOWNTOWN_X = 135;

/** Street names by road centre line (house subtitles use them too): east-west roads by z, north-south by x. */
export const STREETS_H = new Map([[-108, 'ĐƯỜNG BỜ SÔNG'], [-54, 'ĐƯỜNG HOA SỮA'], [0, 'ĐƯỜNG AN HÒA'], [54, 'ĐƯỜNG PHƯỢNG VĨ'], [108, 'ĐƯỜNG CHỢ CŨ']]);
export const STREETS_V = new Map([[-108, 'ĐƯỜNG TRE XANH'], [-54, 'ĐƯỜNG BÀNG LĂNG'], [0, 'ĐƯỜNG TRUNG TÂM'], [54, 'ĐƯỜNG BƯU ĐIỆN'], [108, 'ĐƯỜNG BỆNH VIỆN'],
  [162, 'ĐƯỜNG ĐỒNG KHỞI'], [216, 'ĐẠI LỘ NGUYỄN HUỆ'], [270, 'ĐƯỜNG HÀM NGHI'], [324, 'ĐƯỜNG TÔN ĐỨC THẮNG']]);

/** An Hòa's park block (lawn and fountain) and the tiled square by the market lane. */
export const PARK: Rect = { minX: 13, maxX: 43, minZ: -44, maxZ: -22 };
export const SQUARE: Rect = { minX: 14.5, maxX: 43.5, minZ: 29.5, maxZ: 46.5 };
/** Corner gardens at the two southern corners of An Hòa. */
export const GARDENS: Rect[] = [{ minX: 118.6, maxX: 137, minZ: 118.6, maxZ: 137 }, { minX: -137, maxX: -118.6, minZ: 118.6, maxZ: 137 }];
/** Pagoda and school yards are paved. */
export const YARDS: Rect[] = [{ minX: -41, maxX: -13, minZ: 120, maxZ: 137 }, { minX: 11, maxX: 43, minZ: 120, maxZ: 137 }];
/** Downtown: the walking-street plaza in front of the theatre, and the city park. */
export const PLAZA: Rect = { minX: 228.5, maxX: 257.5, minZ: 12.5, maxZ: 41.5 };
export const CITY_PARK: Rect = { minX: 228.5, maxX: 257.5, minZ: 66.5, maxZ: 95.5 };
/** The riverside promenade along the whole northern edge. */
export const PROMENADE: Rect = { minX: -200, maxX: LAND.maxX + 70, minZ: -136.5, maxZ: -118 };

/**
 * Docks on the river: a pier out over the water and steps beside it down to the waterline (where a swimmer
 * climbs out). `rental` docks hire out speedboats; the river bus stops at the others.
 */
export type Dock = { x: number; name: string; rental: boolean; pier: Rect; steps: Rect; ring: Point };
export const DOCKS: Dock[] = ([[-80, 'BẾN ĐÒ AN HÒA', false], [2, 'BẾN AN HÒA • THUÊ CA NÔ', true], [190, 'BẾN BẠCH ĐẰNG', false], [300, 'BẾN DU THUYỀN • THUÊ CA NÔ', true]] as const).map(([x, name, rental]) => ({
  x, name, rental,
  pier: { minX: x - 2, maxX: x + 2, minZ: -152, maxZ: -134.6 },
  steps: { minX: x + 2.6, maxX: x + 5, minZ: -140.5, maxZ: -134.6 },
  ring: { x, z: -149.5 },
}));

/** The nightlife strip ("phố đèn đỏ") on the road at z = 54: what each venue is called and its neon colour. */
export type VenueKind = 'bar' | 'karaoke' | 'motel' | 'club' | 'spa' | 'beer';
export const VENUE_LOOKS: Record<VenueKind, { name: string; subtitle: string; neon: string }> = {
  bar: { name: 'BAR NEON', subtitle: 'COCKTAIL • RƯỢU • 18+', neon: '#ff3d7f' },
  karaoke: { name: 'KARAOKE ÁNH SAO', subtitle: 'PHÒNG VIP • ÂM THANH CHUẨN', neon: '#b04dff' },
  motel: { name: 'NHÀ NGHỈ HOA HỒNG', subtitle: 'THEO GIỜ • QUA ĐÊM', neon: '#ff4a4a' },
  club: { name: 'VŨ TRƯỜNG MOONLIGHT', subtitle: 'DJ • NHẢY TỚI SÁNG • 18+', neon: '#3dd6ff' },
  spa: { name: 'SPA & MASSAGE', subtitle: 'THƯ GIÃN • XÔNG HƠI', neon: '#ff8ad1' },
  beer: { name: 'BIA HƠI HÀ NỘI', subtitle: 'BIA TƯƠI • ĐỒ NHẮM', neon: '#ffc23d' },
};
