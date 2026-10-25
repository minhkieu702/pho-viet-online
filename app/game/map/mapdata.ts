/**
 * The drawable city for the big map, derived at runtime from the generated layout (city.ts). Client only:
 * big-map.tsx loads it with a dynamic import() the first time the map opens, so the SSR bundle never runs the
 * city generator. By then game.ts has already built the same city.ts module, so this costs about nothing.
 */
import { BUILDINGS, PLOTS, SCENERY, VENUES, LANDMARKS, type BuildingKind, type PlotStyle } from '../city.ts';
import { LAND, RIVER, type Point, type Rect, type VenueKind } from './consts.ts';
import { STREETS, type Street } from './districts.ts';

export type MapLayer = 'landmarks' | 'services' | 'food' | 'nightlife';
export type MapPoiKind = 'cafe' | 'food' | 'shop' | 'market' | 'hotel' | 'mall' | 'theatre' | 'school' | 'pagoda' | 'post' | 'tower'
  | 'hospital' | 'police' | 'bank' | 'atm' | 'dock' | 'boat' | 'gun' | 'bike' | 'venue';
export type MapPoi = { id: string; kind: MapPoiKind; layer: MapLayer; x: number; z: number; name: string; note: string; venue?: VenueKind };
export type BlockTone = 'house' | 'shop' | 'midrise' | 'tower' | 'civic';
export type MapData = {
  land: Rect; promenade: Rect; river: Rect; farBank: Rect;
  parks: { rect: Rect; paved: boolean }[];
  blocks: { rect: Rect; tone: BlockTone }[];
  roads: Street[];
  docks: { pier: Rect; steps: Rect; x: number }[];
  pois: MapPoi[];
};

const TONE: Partial<Record<PlotStyle, BlockTone>> = { tower: 'tower', midrise: 'midrise', hospital: 'civic', police: 'civic', school: 'civic', pagoda: 'civic', office: 'civic', kiosk: 'shop' };
const SHOPFRONT: BuildingKind[] = ['shop', 'cafe', 'food', 'gunstore', 'bikeshop', 'post', 'bank', 'hotel', 'mall', 'theatre'];
const POI_KIND: Partial<Record<BuildingKind, [MapPoiKind, MapLayer]>> = {
  cafe: ['cafe', 'food'], food: ['food', 'food'], shop: ['shop', 'food'], hotel: ['hotel', 'landmarks'], mall: ['mall', 'landmarks'],
  theatre: ['theatre', 'landmarks'], school: ['school', 'landmarks'], pagoda: ['pagoda', 'landmarks'], post: ['post', 'services'],
  hospital: ['hospital', 'services'], police: ['police', 'services'], bank: ['bank', 'services'], gunstore: ['gun', 'services'], bikeshop: ['bike', 'services'],
};
const round = (p: Point) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });

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
  };
  return cached;
}
