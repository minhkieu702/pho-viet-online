/**
 * The drawable city for the big map and the minimap, derived at runtime from the generated layout (city.ts) and the
 * wired P1 slices (world-map.ts). Client only: big-map.tsx and minimap-districts.tsx load it with a dynamic import()
 * the first time they draw, so the SSR bundle never runs the city generator; game.ts hands districts.ts the wired
 * streets from here (districtStreets) for the HUD's street line. By then the game has built the same modules, so
 * this costs about nothing.
 */
import { BUILDINGS, PLOTS, SCENERY, VENUES, LANDMARKS, type BuildingKind, type PlotStyle } from '../city.ts';
import { LAND, RIVER, type Point, type Rect, type VenueKind } from './consts.ts';
import { STREETS, streetLabel, type Street } from './districts.ts';
import { DISTRICT_BUILDINGS, DISTRICT_PLOTS, DISTRICT_SCENERY, DISTRICT_WATERS, EDGE_INFO, SLICES, WORLD_ROADS } from './world-map.ts';
import type { RoadClass } from './roads.ts';
import type { GenBuilding } from './gen/buildings.ts';
import { QUAN_1_SOUTH_EXTRA } from './layout/quan-1-south.ts';

export type MapLayer = 'landmarks' | 'services' | 'food' | 'nightlife';
export type MapPoiKind = 'cafe' | 'food' | 'shop' | 'market' | 'hotel' | 'mall' | 'theatre' | 'school' | 'pagoda' | 'post' | 'tower'
  | 'hospital' | 'police' | 'bank' | 'atm' | 'dock' | 'boat' | 'gun' | 'bike' | 'venue'
  /** The districts' landmarks: a church, a museum or palace, a metro entrance, a bus terminus. */
  | 'church' | 'museum' | 'metro' | 'bus';
export type MapPoi = { id: string; kind: MapPoiKind; layer: MapLayer; x: number; z: number; name: string; note: string; venue?: VenueKind };
export type BlockTone = 'house' | 'shop' | 'midrise' | 'tower' | 'civic';
export type MapData = {
  land: Rect; promenade: Rect; river: Rect; farBank: Rect;
  parks: { rect: Rect; paved: boolean }[];
  blocks: { rect: Rect; tone: BlockTone }[];
  roads: Street[];
  docks: { pier: Rect; steps: Rect; x: number }[];
  pois: MapPoi[];
  /** The wired slices' land (their bounds polygons, x,z pairs), drawn open over the "Sắp mở" hatching. */
  open: number[][];
  /** The wired slices' waters (canals, banks of the river) as polygons. */
  waters: number[][];
  /** The wired slices' greens and paved yards as polygons. */
  greens: { poly: number[]; paved: boolean }[];
  /** The wired slices' streets: centre lines with their asphalt half-width and sidewalk, class and name. */
  lines: { pts: number[]; half: number; sidewalk: number; cls: RoadClass; name: string }[];
  /** The wired slices' buildings as footprints (x,z pairs of the four corners). */
  footprints: { poly: number[]; tone: BlockTone }[];
  /** The wired slices' named streets (one per name, every stretch of it), for labels and the HUD's street line. */
  streets: Street[];
};

const TONE: Partial<Record<PlotStyle, BlockTone>> = { tower: 'tower', midrise: 'midrise', hospital: 'civic', police: 'civic', school: 'civic', pagoda: 'civic', office: 'civic', kiosk: 'shop' };
const SHOPFRONT: BuildingKind[] = ['shop', 'cafe', 'food', 'gunstore', 'bikeshop', 'post', 'bank', 'hotel', 'mall', 'theatre'];
const POI_KIND: Partial<Record<BuildingKind, [MapPoiKind, MapLayer]>> = {
  cafe: ['cafe', 'food'], food: ['food', 'food'], shop: ['shop', 'food'], hotel: ['hotel', 'landmarks'], mall: ['mall', 'landmarks'],
  theatre: ['theatre', 'landmarks'], school: ['school', 'landmarks'], pagoda: ['pagoda', 'landmarks'], post: ['post', 'services'],
  hospital: ['hospital', 'services'], police: ['police', 'services'], bank: ['bank', 'services'], gunstore: ['gun', 'services'], bikeshop: ['bike', 'services'],
};
const round = (p: Point) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });

const TONE_OF: Partial<Record<string, BlockTone>> = { tower: 'tower', midrise: 'midrise', office: 'civic', hospital: 'civic', police: 'civic', school: 'civic', pagoda: 'civic', church: 'civic', shop: 'shop' };
const corners = (b: { cx: number; cz: number; hx: number; hz: number; yaw: number }) => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), out: number[] = [];
  // right = (cos, -sin), forward = (sin, cos)
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(Math.round((b.cx + c * b.hx * i + s * b.hz * j) * 10) / 10, Math.round((b.cz - s * b.hx * i + c * b.hz * j) * 10) / 10);
  return out;
};
/** Long street names as Sài Gòn writes them short (on bus signs, in addresses). */
const SHORT: Record<string, string> = {
  'ĐƯỜNG CÁCH MẠNG THÁNG TÁM': 'Đ. CMT8', 'ĐƯỜNG XÔ VIẾT NGHỆ TĨNH': 'Đ. XVNT', 'ĐƯỜNG NGUYỄN THỊ MINH KHAI': 'Đ. NT Minh Khai',
  'ĐƯỜNG NAM KỲ KHỞI NGHĨA': 'Đ. NKKN', 'ĐẠI LỘ NGUYỄN HỮU CẢNH': 'ĐL. N. Hữu Cảnh', 'ĐẠI LỘ NGUYỄN TẤT THÀNH': 'ĐL. N. Tất Thành',
};
let streetsCache: Street[] | null = null;
/**
 * The wired slices' streets, one per name: every stretch of it (centre lines), how far it reaches (asphalt and
 * sidewalk; a hẻm its own width) and its box. registerStreets (districts.ts) takes them for the HUD; the big map labels them.
 */
export function districtStreets(): Street[] {
  if (streetsCache) return streetsCache;
  const byName = new Map<string, { lines: number[][]; reach: number }>();
  WORLD_ROADS.edges.forEach((e, i) => {
    if (EDGE_INFO[i].slice === 'legacy' || !e.name) return;
    const g = byName.get(e.name) ?? { lines: [], reach: 0 };
    g.lines.push(e.pts.slice());
    g.reach = Math.max(g.reach, e.half + e.sidewalk);
    byName.set(e.name, g);
  });
  streetsCache = [...byName].map(([name, g], k) => {
    let x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity;
    for (const p of g.lines) for (let i = 0; i < p.length; i += 2) { x1 = Math.min(x1, p[i]); x2 = Math.max(x2, p[i]); z1 = Math.min(z1, p[i + 1]); z2 = Math.max(z2, p[i + 1]); }
    const label = streetLabel(name);
    const short = SHORT[name] ?? label.replace(/^Đường /, 'Đ. ').replace(/^Đại lộ /, 'ĐL. ').replace(/^Hẻm /, 'H. ');
    return { id: `d${k}:${name}`, name, label, short, x1, z1, x2, z2, lines: g.lines, reach: Math.max(1.75, g.reach) };
  });
  return streetsCache;
}
/** What a district building shows on the map, if anything. */
function districtPoi(b: GenBuilding): [MapPoiKind, MapLayer] | null {
  const n = b.name;
  if (b.stamp) {
    if (/^GA BẾN THÀNH/.test(n)) return ['metro', 'services'];
    if (/^TRẠM XE BUÝT/.test(n)) return ['bus', 'services'];
    if (/^BẾN (ĐÒ|THỦ THIÊM)/.test(n)) return ['dock', 'services'];
    if (/^(DINH ĐỘC LẬP|BẾN NHÀ RỒNG|ỦY BAN)/.test(n)) return ['museum', 'landmarks'];
    if (/^(CAO ỐC|TÒA NHÀ|THÁP BỜ SÔNG)/.test(n)) return ['tower', 'landmarks'];
    if (/^BẾN XE/.test(n)) return ['bus', 'services'];
  }
  if (b.kind === 'pagoda' || /^TU VIỆN/.test(n)) return b.typology === 'church' || /^(NHÀ THỜ|TU VIỆN)/.test(n) ? ['church', 'landmarks'] : ['pagoda', 'landmarks'];
  if (b.typology === 'market-hall') return ['market', 'food'];
  const k = POI_KIND[b.kind];
  return k && b.typology !== 'warehouse' && !(b.kind === 'office' && !b.stamp) ? k : null;
}

let cached: MapData | null = null;
export function mapData(): MapData {
  if (cached) return cached;
  const venueIds = new Set(VENUES.map((v) => v.building.id));
  const pois: MapPoi[] = [];
  for (const b of BUILDINGS) {
    if (venueIds.has(b.id)) continue;
    const kind = b.id === LANDMARKS.tower.id ? (['tower', 'landmarks'] as const) : POI_KIND[b.kind];
    if (!kind) continue;
    // The bike shop's sign still reads "XE MÁY" from the old neighbourhood; the map uses the shop's full name.
    pois.push({ id: `b${b.id}`, kind: kind[0], layer: kind[1], ...round(b.door), name: b.kind === 'bikeshop' ? 'CỬA HÀNG XE MÁY' : b.name, note: b.subtitle });
    if (b.kind === 'bank') {
      // The ATM ("ATM 24/7" on the sign) sits on the bank's front wall, beside the door.
      const along = Math.abs(Math.sin(b.facing)) > 0.5 ? { x: 0, z: 4 } : { x: 4, z: 0 };
      pois.push({ id: `atm${b.id}`, kind: 'atm', layer: 'services', ...round({ x: b.door.x + along.x, z: b.door.z + along.z }), name: 'ATM 24/7', note: b.name });
    }
  }
  // The beer garden has no door to walk into yet, so it gets no marker (the minimap skips it too).
  for (const v of VENUES) if (v.kind !== 'beer') pois.push({ id: `v${v.kind}`, kind: 'venue', layer: 'nightlife', ...round(v.door), name: v.name, note: v.building.subtitle, venue: v.kind });
  for (const d of SCENERY.docks) {
    pois.push({ id: `d${d.x}`, kind: d.rental ? 'boat' : 'dock', layer: 'services', x: d.x, z: -136, name: d.name.split(' • ')[0], note: d.rental ? 'Thuê ca nô' : 'Tàu buýt sông' });
  }
  // Market stalls: the lane behind road 0 and the stalls on the riverside promenade.
  const stalls = SCENERY.props.filter((p) => p.kind === 'stall');
  const market = (name: string, list: typeof stalls) => list.length && pois.push({
    id: `m${name}`, kind: 'market', layer: 'food', name, note: `${list.length} sạp hàng`,
    ...round({ x: list.reduce((s, p) => s + p.x, 0) / list.length, z: list.reduce((s, p) => s + p.z, 0) / list.length }),
  });
  market('CHỢ AN HÒA', stalls.filter((p) => p.z > 0));
  market('CHỢ VEN SÔNG', stalls.filter((p) => p.z < 0));
  // The wired slices: their shops, quán, chợ and landmarks, the night streets.
  for (const b of DISTRICT_BUILDINGS) {
    const kind = districtPoi(b);
    if (kind) pois.push({ id: `b${b.id}`, kind: kind[0], layer: kind[1], ...round(b.door), name: b.name, note: b.subtitle });
  }
  const wired = new Set(SLICES.map((s) => s.key));
  if (wired.has('quan-4')) pois.push({ id: 'n-vinh-khanh', kind: 'venue', layer: 'nightlife', x: 535, z: 6, name: 'PHỐ ỐC VĨNH KHÁNH', note: 'Ốc, hải sản, bia · đông nhất từ 18:00' });
  if (wired.has('quan-1-south')) {
    pois.push({ id: 'n-bui-vien', kind: 'venue', layer: 'nightlife', x: 318, z: 250, name: 'PHỐ ĐI BỘ BÙI VIỆN', note: 'Phố đi bộ 19:00–02:00' });
    const night = (QUAN_1_SOUTH_EXTRA as { market: { night: { stalls: { x: number; z: number }[] } } }).market.night.stalls;
    if (night.length) pois.push({ id: 'm-cho-dem-ben-thanh', kind: 'market', layer: 'food', name: 'CHỢ ĐÊM BẾN THÀNH', note: `${night.length} sạp · 18:00–24:00`, ...round({ x: night.reduce((a, p) => a + p.x, 0) / night.length, z: night.reduce((a, p) => a + p.z, 0) / night.length }) });
  }

  cached = {
    land: LAND, river: RIVER, promenade: SCENERY.promenade,
    farBank: { minX: RIVER.minX - 60, maxX: RIVER.maxX + 60, minZ: RIVER.minZ - 14, maxZ: RIVER.minZ },
    parks: [
      ...[SCENERY.park, SCENERY.cityPark, ...SCENERY.gardens].map((rect) => ({ rect, paved: false })),
      ...[SCENERY.square, SCENERY.plaza, ...SCENERY.yards].map((rect) => ({ rect, paved: true })),
    ],
    blocks: PLOTS.map((p) => ({ rect: p.full, tone: TONE[p.style] ?? (SHOPFRONT.includes(BUILDINGS[p.id].kind) ? 'shop' : 'house') })),
    roads: STREETS,
    docks: SCENERY.docks.map((d) => ({ pier: d.pier, steps: d.steps, x: d.x })),
    pois,
    open: SLICES.map((s) => s.bounds.slice()),
    waters: DISTRICT_WATERS.map((w) => w.poly.slice()),
    greens: [...DISTRICT_SCENERY.parks.map((p) => ({ poly: p.poly, paved: false })), ...DISTRICT_SCENERY.yards.map((p) => ({ poly: p.poly, paved: true })), ...DISTRICT_SCENERY.walks.map((p) => ({ poly: p.poly, paved: true }))],
    lines: WORLD_ROADS.edges.flatMap((e, i) => (EDGE_INFO[i].slice === 'legacy' ? [] : [{ pts: e.pts, half: e.half, sidewalk: e.sidewalk, cls: e.cls, name: e.name }])),
    footprints: DISTRICT_BUILDINGS.map((b, i) => ({ poly: corners(b.box), tone: TONE_OF[DISTRICT_PLOTS[i].style] ?? (b.kind === 'home' ? 'house' : 'shop') })),
    streets: districtStreets(),
  };
  return cached;
}
