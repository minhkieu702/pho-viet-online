// node --experimental-transform-types --test scripts/interact-audit.test.mjs        (report only)
// STRICT=1 node --experimental-transform-types --test scripts/interact-audit.test.mjs (fails on any dead facade)
// VERBOSE=1 also lists every dead facade with its position.
//
// Lists everything on the map that LOOKS interactable but has no E handler (plan decision 8, "no dead facades"):
// café/food/shop counters, carts, market stalls, the beer garden, benches, bus-stop seats and their route signs,
// café tables, the river docks (waterbus signs), the bank ATM, the moored sampans, the parked scooters and the
// doors of public buildings. Facades come from data (city.ts BUILDINGS/SCENERY/VENUES/LANDMARKS, world.ts for the
// hard-coded sampans and sign texts); handlers come from two places:
//  1. game.ts action(): the legacy branches listed in LEGACY below, each found by its source pattern, so a branch
//     that moves out of action() stops counting here.
//  2. The interaction registry (Wave B, step 7). app/game/interact.ts, when present, must export a pure
//     `auditEntries()` (or an `AUDIT_ENTRIES` array) listing its static entries:
//        { id: string; covers: FacadeKind | FacadeKind[]; x: number; z: number; r: number }
//     FacadeKind = 'counter' | 'door' | 'seat' | 'transit' | 'atm' | 'boat' | 'vehicle'. Its module scope must not
//     touch three.js or the DOM (type-only imports are fine; './city'-style imports are resolved here). A facade is
//     handled when an entry covering its kind lies within r of it. A thing that stays decorative on purpose (a
//     shutter that is down, a reworded sign) gets an entry too, with the prompt that says so (design-real C3).
// Facade points: a building's door, a prop's centre, a bench or table, a dock's pier-end ring.
// The wired districts (WIRING-PLAN §2, app/game/district-life.ts) are audited the same way: every door that is not a
// home, the chung cư kiosks, carts, market stalls, the EXTRA stalls (Bến Thành's night market, the book street), every
// seat, every parked bike and car, the bus shelters. Twice: the live wiring step (world-map.ts, against the registry's
// live tables) and the whole of P1 (every slice and seam, against districtPlaces/districtSpots of that world), so a
// slice has no dead facade before it is wired.
import test from 'node:test';
import module from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const tsFallback = (specifier) => /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier);
if (module.registerHooks) {
  module.registerHooks({
    resolve(specifier, context, next) {
      try { return next(specifier, context); } catch (e) {
        if (e?.code === 'ERR_MODULE_NOT_FOUND' && tsFallback(specifier)) return next(`${specifier}.ts`, context);
        throw e;
      }
    },
  });
} else {
  module.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
    try { return await n(s, c); } catch (e) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return n(s + '.ts', c);
      throw e;
    }
  }`)}`);
}

const GAME_DIR = new URL('../app/game/', import.meta.url);
const { BUILDINGS, SCENERY, VENUES, LANDMARKS } = await import('../app/game/city.ts');
const { MISSION_DEFS } = await import('../app/game/missions.ts');
const read = (name) => readFileSync(new URL(name, GAME_DIR), 'utf8');
const gameSrc = read('game.ts');
const worldSrc = read('world.ts');
// Every game source, to see whether a promise printed on a sign (bus routes, the waterbus) is still made anywhere.
const allSrc = readdirSync(GAME_DIR, { recursive: true }).filter((f) => /\.tsx?$/.test(f)).map((f) => read(f.replaceAll('\\', '/'))).join('\n');

// ---- Facades ----
const facades = [];
const add = (group, kind, x, z, label, building = false) => facades.push({ group, kind, x, z, label, building });
const venueOf = new Map(VENUES.map((v) => [v.building.id, v]));
const COUNTERS = new Set(['cafe', 'food', 'shop']);
let homes = 0;
for (const b of BUILDINGS) {
  const venue = venueOf.get(b.id);
  if (venue) add(venue.kind === 'beer' ? 'beer-garden' : `venue:${venue.kind}`, 'counter', b.door.x, b.door.z, b.name, true);
  else if (COUNTERS.has(b.kind)) add(b.kind, 'counter', b.door.x, b.door.z, b.name, true);
  else if (b.kind === 'home') homes++; // residences are expected to stay shut
  else add(`door:${b.kind}`, 'door', b.door.x, b.door.z, b.name, true);
  if (/\bATM\b/.test(b.subtitle)) add('atm', 'atm', b.door.x, b.door.z, `${b.name} · ATM`);
}
for (const p of SCENERY.props) {
  if (p.kind === 'cart') add('cart', 'counter', p.x, p.z, 'xe đẩy');
  if (p.kind === 'stall') add('market-stall', 'counter', p.x, p.z, 'sạp chợ');
  if (p.kind === 'scooter') add('parked-scooter', 'vehicle', p.x, p.z, 'xe máy đậu');
}
for (const b of SCENERY.benches) add('bench', 'seat', b.x, b.z, 'ghế đá');
for (const b of SCENERY.busStops) add('bus-stop-seat', 'seat', b.x, b.z, 'ghế trạm xe buýt');
for (const t of SCENERY.tables) add('cafe-table', 'seat', t.x, t.z, 'bàn ghế cà phê');
// The shelters promise bus routes ("TUYẾN 03 • 08 • 15") for as long as any source still prints a route number.
if (/TUYẾN\s+\d/.test(allSrc)) for (const p of SCENERY.props) if (p.kind === 'shelter') add('bus-route-sign', 'transit', p.x, p.z, 'biển TUYẾN 03 • 08 • 15');
// Rental docks hire speedboats; the others are signed for the waterbus and the cross-river ferry.
const waterbusSigned = /TÀU BUÝT SÔNG|ĐÒ NGANG/.test(allSrc);
for (const d of SCENERY.docks) {
  if (d.rental) add('dock:rental', 'transit', d.ring.x, d.ring.z, d.name);
  else if (waterbusSigned) add('dock:waterbus', 'transit', d.ring.x, d.ring.z, d.name);
}
// Moored sampans are hard-coded in world.ts (the loop after "sampans moored"); boats.ts takes them over in step 6.
const sampans = worldSrc.match(/sampans? moored[^\n]*\n[^\n]*?of (\[\[[^\n]*?\]\])\)/);
if (sampans) for (const [x, z] of JSON.parse(sampans[1])) add('sampan', 'boat', x, z, 'ghe neo');

// ---- District facades ----
const life = await import('../app/game/district-life.ts');
const countersMod = await import('../app/game/counters.ts');
const parkingMod = await import('../app/game/parking.ts');
/** Everything in a district view that looks interactable. */
function districtFacades(v, tag) {
  const out = [];
  const put = (group, kind, x, z, label, building = false) => out.push({ group: `${tag}${group}`, kind, x, z, label, building });
  const COUNTER_KINDS = new Set(['cafe', 'food', 'shop']);
  for (const b of v.buildings) {
    if (b.kind === 'home') continue;
    if (COUNTER_KINDS.has(b.kind)) put(b.kind, 'counter', b.door.x, b.door.z, b.name, true);
    else put(`door:${b.kind}`, 'door', b.door.x, b.door.z, b.name, true);
  }
  for (const k of v.kiosks) put('kiosk', 'counter', k.x, k.z, k.name);
  for (const p of v.props) {
    if (p.kind === 'cart') put('cart', 'counter', p.x, p.z, 'xe đẩy');
    if (p.kind === 'stall') put('market-stall', 'counter', p.x, p.z, 'sạp chợ');
    if (p.kind === 'shelter' && /TUYẾN\s+\d/.test(allSrc)) put('bus-route-sign', 'transit', p.x, p.z, 'trạm xe buýt');
  }
  for (const p of v.pois) if (p.seat && p.kind !== 'perch') put(p.kind === 'bench' ? 'bench' : p.kind === 'bus-stop' ? 'bus-stop-seat' : 'stool', 'seat', p.x, p.z, p.kind);
  // A quán table: sat at on its stools, or ordered at when there is no room for one.
  for (const e of v.eateries) put('eatery-table', e.seats.length ? 'seat' : 'counter', e.x, e.z, e.name || 'bàn quán');
  for (const p of v.parked) put('parked-bike', 'vehicle', p.x, p.z, 'xe máy đậu');
  if (v.keys.has('quan-1-south')) {
    const { QUAN_1_SOUTH_EXTRA } = q1Extra;
    for (const st of QUAN_1_SOUTH_EXTRA.market.night.stalls) put('night-market', 'counter', st.x, st.z, 'chợ đêm');
    for (const st of QUAN_1_SOUTH_EXTRA.market.day.stalls) put('market-stall', 'counter', st.x, st.z, 'sạp chợ Bến Thành');
    for (const st of QUAN_1_SOUTH_EXTRA.bookstalls.stalls) put('bookstall', 'counter', st.x, st.z, 'đường sách');
  }
  return out;
}
const q1Extra = await import('../app/game/map/layout/quan-1-south.ts');
const liveView = life.district();
for (const f of districtFacades(liveView, 'live ')) facades.push(f);

// ---- Handlers: legacy branches of game.ts action() ----
function body(src, head) {
  const start = src.indexOf(head);
  if (start < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}
const action = body(gameSrc, 'function action()');
const constPoint = (name) => {
  const m = gameSrc.match(new RegExp(`const ${name} = \\{ x: (-?[\\d.]+), z: (-?[\\d.]+) \\}`));
  return m ? [{ x: Number(m[1]), z: Number(m[2]) }] : [];
};
const venueDoors = () => {
  const def = gameSrc.match(/const venueDoors = VENUES\.filter\(\(v\) => v\.kind !== '(\w+)'\)[^\n]*\n[^\n]*\n[^\n]*Math\.sin\(f\) \* ([\d.]+)/);
  const skip = def ? def[1] : 'beer', out = def ? Number(def[2]) : 1.6;
  return VENUES.filter((v) => v.kind !== skip).map((v) => ({ x: v.door.x + Math.sin(v.building.facing) * out, z: v.door.z + Math.cos(v.building.facing) * out }));
};
const LEGACY = [
  { id: 'gun store', re: /distance\(STORE\) < ([\d.]+)/, at: () => constPoint('STORE'), covers: ['door', 'counter'] },
  { id: 'bike shop', re: /distance\(BIKE_SHOP\) < ([\d.]+)/, at: () => constPoint('BIKE_SHOP'), covers: ['door', 'counter'] },
  { id: 'hospital', re: /distance\(LANDMARKS\.hospital\) < ([\d.]+)/, at: () => [LANDMARKS.hospital], covers: ['door'] },
  { id: 'observation deck', re: /distance\(LANDMARKS\.tower\.door\) < ([\d.]+)/, at: () => [LANDMARKS.tower.door], covers: ['door'] },
  { id: 'bank heist', re: /distance\(LANDMARKS\.bank\.door\) < ([\d.]+)/, at: () => [LANDMARKS.bank.door], covers: ['door'] },
  { id: 'boat hire', re: /d\.rental && distance\(d\.ring\) < ([\d.]+)/, at: () => SCENERY.docks.filter((d) => d.rental).map((d) => d.ring), covers: ['transit'] },
  { id: 'venue doors', re: /venueDoors\.find\(\(door\) => distance\(door\.at\) < ([\d.]+)\)/, at: venueDoors, covers: ['door', 'counter'] },
];
const handlers = [];
const legacyFound = [], legacyGone = [];
for (const h of LEGACY) {
  const m = action.match(h.re);
  if (!m) { legacyGone.push(h.id); continue; }
  const points = h.at();
  legacyFound.push(`${h.id} r${m[1]}${points.length > 1 ? ` ×${points.length}` : ''}`);
  for (const p of points) handlers.push({ id: h.id, covers: h.covers, x: p.x, z: p.z, r: Number(m[1]) });
}
// distance() checks in action() that no LEGACY entry describes: someone added a handler this audit cannot place.
const unknown = [...LEGACY.reduce((src, h) => src.replace(h.re, ''), action).matchAll(/distance\([^)]*\) < [\d.]+/g)].map((m) => m[0]);

// ---- Handlers: the interaction registry, once it exists ----
let registry = 'none (app/game/interact.ts not present)';
let registryError = null;
if (existsSync(new URL('interact.ts', GAME_DIR))) {
  try {
    const mod = await import('../app/game/interact.ts');
    const entries = typeof mod.auditEntries === 'function' ? mod.auditEntries() : mod.AUDIT_ENTRIES;
    if (!Array.isArray(entries)) throw new Error('interact.ts exports neither auditEntries() nor AUDIT_ENTRIES');
    for (const e of entries) handlers.push({ id: e.id, covers: [e.covers].flat(), x: e.x, z: e.z, r: e.r });
    registry = `${entries.length} entries`;
  } catch (e) {
    registryError = `app/game/interact.ts could not be audited: ${e.message}`;
    registry = 'unreadable';
  }
}

// ---- Matching ----
const missionTargets = MISSION_DEFS.flatMap((m) => m.steps.map((s) => ({ ...s.target, mission: m.id })));
// A building's handler usually stands in front of its door (the gun store ring is 4.8 m out), so it may reach
// DOOR_REACH further, but it claims only the nearest door it covers; props, seats and docks need it within r.
const DOOR_REACH = 1.5;
const near = (h, f) => Math.hypot(h.x - f.x, h.z - f.z);
for (const f of facades) {
  f.handler = handlers.find((h) => !f.building && h.covers.includes(f.kind) && near(h, f) <= h.r)?.id ?? null;
  f.mission = missionTargets.find((t) => near(t, f) <= 4)?.mission ?? null;
}
for (const h of handlers) {
  let best = null;
  for (const f of facades) if (f.building && h.covers.includes(f.kind) && near(h, f) <= h.r + DOOR_REACH && (!best || near(h, f) < near(h, best))) best = f;
  if (best) best.handler ??= h.id;
}
const dead = facades.filter((f) => !f.handler);

// ---- The whole of P1, each slice audited before it is wired ----
const fullView = life.viewOf(life.buildWorld());
const fullFacades = districtFacades(fullView, 'P1 ');
const fullSpots = parkingMod.districtSpots(fullView, 0, 0).spots;
const fullHandlers = (await import('../app/game/interact.ts')).auditEntries(countersMod.districtPlaces(fullView), fullSpots).map((e) => ({ id: e.id, covers: [e.covers].flat(), x: e.x, z: e.z, r: e.r }));
for (const f of fullFacades) f.handler = fullHandlers.find((h) => !f.building && h.covers.includes(f.kind) && near(h, f) <= h.r)?.id ?? null;
for (const h of fullHandlers) {
  let best = null;
  for (const f of fullFacades) if (f.building && h.covers.includes(f.kind) && near(h, f) <= h.r + DOOR_REACH && (!best || near(h, f) < near(h, best))) best = f;
  if (best) best.handler ??= h.id;
}
for (const f of fullFacades) { f.mission = null; facades.push(f); if (!f.handler) dead.push(f); }

function report() {
  const groups = new Map();
  for (const f of facades) {
    const g = groups.get(f.group) ?? { kind: f.kind, total: 0, handled: 0, by: new Set(), example: null };
    g.total++;
    if (f.handler) { g.handled++; g.by.add(f.handler); } else g.example ??= f;
    groups.set(f.group, g);
  }
  const at = (f) => `${f.label} (${f.x.toFixed(1)}, ${f.z.toFixed(1)})${f.mission ? ` [mission ${f.mission} only]` : ''}`;
  const lines = [
    `interact-audit: ${facades.length} things look interactable, ${facades.length - dead.length} have a handler, ${dead.length} are dead facades${process.env.STRICT === '1' ? '' : ' (report only; STRICT=1 fails on any)'}`,
    `  ${'group'.padEnd(26)}${'kind'.padEnd(9)}${'total'.padStart(6)}${'ok'.padStart(5)}${'dead'.padStart(6)}  handled by / first dead`,
  ];
  for (const [name, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const by = [...g.by];
    const note = g.example ? at(g.example) : `${by.slice(0, 3).join(', ')}${by.length > 3 ? ` +${by.length - 3} more` : ''}`;
    lines.push(`  ${name.padEnd(26)}${g.kind.padEnd(9)}${String(g.total).padStart(6)}${String(g.handled).padStart(5)}${String(g.total - g.handled).padStart(6)}  ${note}`);
  }
  lines.push(`  districts: live ${[...liveView.keys].join(', ') || 'none wired'} (${liveView.buildings.length} buildings); P1 audited whole: ${[...fullView.keys].join(', ')} (${fullView.buildings.length} buildings)`);
  lines.push(`  not counted: ${homes} house doors (residences stay shut), traffic cars and the player's bike (dynamic), mission rings and side-job offers (temporary)`);
  lines.push(`  handlers: game.ts action(): ${legacyFound.join(', ') || 'none'}; registry: ${registry}`);
  if (legacyGone.length) lines.push(`  legacy branches no longer in action(): ${legacyGone.join(', ')} (the registry must cover them now)`);
  if (unknown.length) lines.push(`  unrecognised distance checks in action(), add them to LEGACY: ${unknown.join(' | ')}`);
  if (registryError) lines.push(`  ${registryError}`);
  if (process.env.VERBOSE === '1') for (const f of dead) lines.push(`    dead ${f.group}: ${at(f)}`);
  return lines.join('\n');
}

test('interaction audit: things that look interactable have a handler', (t) => {
  const text = report();
  console.log(text);
  if (!facades.length) throw new Error('found no facades at all: the audit lost track of the city data');
  if (registryError) t.diagnostic(registryError);
  if (process.env.STRICT === '1') {
    if (registryError) throw new Error(registryError);
    if (dead.length) throw new Error(`${dead.length} dead facades (STRICT=1):\n${text}`);
  }
});
