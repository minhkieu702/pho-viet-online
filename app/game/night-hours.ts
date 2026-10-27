/**
 * When each lit thing is lit (night plan §4.2): one source for both renderers (today's map and the districts).
 * The hours are the counters' hours (counters.ts COUNTERS[key].hours): every shop on today's map and every district
 * business already has a counter, and game.ts's roller shutters follow the same hours, so a sign, light box or spill
 * pool outside the shutter goes dark when the counter closes. Venues use VENUE_HOURS; homes, offices and flats their
 * rhythm (night.ts HOME, OFFICE, FLATS).
 *
 * Every schedule the map uses is registered with night.ts at module init (counters, venues, the districts' timed
 * items and the fixed ones), so no tile build registers one mid-game. No three.js beyond night.ts's math types.
 */
import { COUNTERS, PLACES, type CounterDef, type CounterKind, type Hours, type Place } from './counters';
import { FRONT_OF, type FrontKind } from './facades';
import { DISTRICT_SCENERY, EDGE_INFO, SLICE_EXTRA, WORLD_BUILDINGS, genBuilding } from './map/world-map';
import type { VenueRoom } from './venues';
import { FLATS, HOME, OFFICE, scheduleCount, scheduleIndex } from './night';

/** The nightlife venues' hours: their neon and light here, and game.ts's venue doors (it imports this table). */
export const VENUE_HOURS: Record<VenueRoom, Hours> = { bar: [[17, 27]], karaoke: [[14, 26]], club: [[20, 28]], spa: [[9, 23]], motel: [[0, 24]] };
/** Fixed schedules the renderers use: tower lobbies, office lobbies, all night, the vé số case. */
export const LOBBY_HOURS: Hours = [[6, 23]];
export const OFFICE_LOBBY_HOURS: Hours = [[6, 22.5]];
export const ALL_NIGHT: Hours = [[0, 24]];
export const LOTTERY_HOURS: Hours = [[6, 21]];

/** What a counter's open front shows when facades.ts FRONT_OF has no entry for its key (the districts' trades). */
const FRONT_BY_KIND: Partial<Record<CounterKind, FrontKind>> = {
  food: 'food', beer: 'food', cart: 'food', stall: 'food',
  cafe: 'cafe',
  taphoa: 'goods', mart: 'goods', books: 'goods', shop: 'goods', market: 'goods', hotel: 'goods', kiosk: 'goods',
  pharmacy: 'pharmacy', clinic: 'pharmacy',
  gold: 'gold', barber: 'barber', tailor: 'tailor', fashion: 'tailor', florist: 'florist', repair: 'repair',
};

const placeById = new Map<string, Place>();
const venueByBuilding = new Map<number, VenueRoom>();
for (const p of PLACES) {
  placeById.set(p.id, p);
  if (p.kind === 'venue' && p.building >= 0 && p.key in VENUE_HOURS) venueByBuilding.set(p.building, p.key as VenueRoom);
}

export type CounterOf = { key: string; base: string; def: CounterDef; place: Place };
/** A counter key without its hours (`@…`) and price (`*…`) suffixes: 'oc@16-26*1.3' → 'oc'. */
export const baseKey = (key: string) => key.split(/[@*]/)[0];

/**
 * A building's own counter: `b<id>` on today's map, `d<id>` in the districts (never an eatery table `dt:` or a chung
 * cư kiosk `dk:`, which only share the building, nor a cart or stall). Null for a home, a venue or a notice.
 */
export function counterOf(buildingId: number): CounterOf | null {
  const place = placeById.get(`b${buildingId}`) ?? placeById.get(`d${buildingId}`);
  if (!place || place.kind !== 'counter' || place.building !== buildingId) return null;
  const def = COUNTERS[place.key];
  return def ? { key: place.key, base: baseKey(place.key), def, place } : null;
}

/**
 * The open front a counter shows and the words on its light box: FRONT_OF for today's keys, else by the counter's
 * kind (a district trade: no light-box words, the generator lays its own vertical sign). Null: not a shop front.
 */
export function frontOfCounter(base: string, def: CounterDef): [FrontKind, string | null] | null {
  const known = FRONT_OF[base];
  if (known) return [known[0], known[1]];
  const kind = FRONT_BY_KIND[def.kind];
  return kind ? [kind, null] : null;
}

/** The building record (today's or a district's) by id. */
function buildingOf(id: number) {
  const b = WORLD_BUILDINGS[id];
  return b && b.id === id ? b : WORLD_BUILDINGS.find((x) => x.id === id) ?? null;
}

/**
 * The code for a building's windows by what it is (far stand-ins, plan §6.7): −1 never lit (warehouses, pagodas,
 * churches, market halls, schools), OFFICE for offices and public offices, FLATS for hotels, apartments and hospitals,
 * HOME otherwise. A rhythm base: the batch adds each window's seed.
 */
export function windowCode(buildingId: number): number {
  const b = buildingOf(buildingId), t = genBuilding(buildingId)?.typology;
  if (t === 'warehouse' || t === 'pagoda' || t === 'church' || t === 'market-hall' || t === 'school') return -1;
  if (!b) return HOME;
  if (b.kind === 'pagoda' || b.kind === 'school') return -1;
  if (b.kind === 'hotel' || b.kind === 'hospital' || t === 'apartment' || t === 'hospital') return FLATS;
  if (b.kind === 'office' || b.kind === 'bank' || b.kind === 'post' || b.kind === 'police' || b.kind === 'mall' || b.kind === 'theatre') return OFFICE;
  return HOME;
}

export type BuildingLight = {
  /** The light code of the building's shop parts (front, signs, light box, LED border, spill pool). */
  code: number;
  /** Its open front's kind (null: no shop front, or not a counter). */
  kind: FrontKind | null;
  /** The words on its light box (null: none; district trades carry the generator's own sign). */
  words: string | null;
};
const lightCache = new Map<number, BuildingLight>();
/**
 * When a building's shop parts are lit: its counter's hours, else its venue's hours, else its windows' rhythm
 * (windowCode). Memoized by id.
 */
export function buildingLight(buildingId: number): BuildingLight {
  const hit = lightCache.get(buildingId);
  if (hit) return hit;
  let light: BuildingLight;
  const c = counterOf(buildingId);
  if (c) {
    const front = frontOfCounter(c.base, c.def);
    light = { code: scheduleIndex(c.def.hours), kind: front?.[0] ?? null, words: front?.[1] ?? null };
  } else {
    const venue = venueByBuilding.get(buildingId);
    light = venue ? { code: scheduleIndex(VENUE_HOURS[venue]), kind: null, words: null } : { code: windowCode(buildingId), kind: null, words: null };
  }
  lightCache.set(buildingId, light);
  return light;
}

/** A chung cư kiosk's code (its `dk:<slice>/<key>` counter's hours); 0 (on with the night) if it has none. */
export function kioskCode(slice: string, key: string): number {
  const place = placeById.get(`dk:${slice}/${key}`);
  const def = place ? COUNTERS[place.key] : undefined;
  return def ? scheduleIndex(def.hours) : 0;
}

/** A district timed item's code: the night market, a walking or food street, an eatery, the book street, night seats. */
export function timedCode(span: readonly [number, number]): number {
  return scheduleIndex([span]);
}

// ---- Registration at module init ---------------------------------------------------------------------------------

type Spanish = readonly [number, number] | Hours | null | undefined;
/** Registers a `[from, to]` pair or an Hours list (EDGE_INFO.closed is typed Hours but carries a pair). */
function register(h: Spanish) {
  if (!h || !h.length) return;
  if (typeof h[0] === 'number') scheduleIndex([h as readonly [number, number]]);
  else scheduleIndex(h as Hours);
}
for (const p of PLACES) if (p.kind === 'counter') register(COUNTERS[p.key]?.hours);
for (const h of Object.values(VENUE_HOURS)) register(h);
for (const h of [LOBBY_HOURS, OFFICE_LOBBY_HOURS, ALL_NIGHT, LOTTERY_HOURS]) register(h);
for (const e of EDGE_INFO) register(e.closed as Spanish);
for (const e of DISTRICT_SCENERY.eateries) register(e.hours);
for (const p of DISTRICT_SCENERY.props) register(p.hours);
{
  // The slices' timed extras: night seats on closed streets, the closures, Bến Thành's markets, the book street.
  type Timed = { hours?: [number, number]; stalls?: unknown };
  for (const extra of Object.values(SLICE_EXTRA) as Record<string, unknown>[]) {
    const x = extra as { nightSeats?: Timed; closures?: Record<string, Timed>; market?: Record<string, Timed>; bookstalls?: Timed };
    register(x.nightSeats?.hours);
    register(x.bookstalls?.hours);
    for (const c of Object.values(x.closures ?? {})) register(c.hours);
    for (const m of Object.values(x.market ?? {})) if (m.stalls) register(m.hours);
  }
}
/** How many schedules the map registered at load (night.test.mjs: at most 90). */
export const SCHEDULES_AT_LOAD = scheduleCount();
