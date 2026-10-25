// node --experimental-transform-types --test scripts/world-snapshot.test.mjs
// Guards today's layout (plan decision 13): every table city.ts exports, the signal approaches and the walking graph
// are hashed (numbers rounded to 1e-4) and compared with scripts/world-snapshot.json. A deliberate layout change
// regenerates the file in the same commit, with a note:
//   UPDATE_SNAPSHOT=1 node --experimental-transform-types --test scripts/world-snapshot.test.mjs
// Imports only city.ts, signals.ts and nav.ts: pure modules, no three.js or browser APIs. They import './city'
// without an extension (Vite style), which Node does not resolve, so a resolve hook retries such specifiers as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const city = await import('../app/game/city.ts');
const signals = await import('../app/game/signals.ts');
const { createNav } = await import('../app/game/nav.ts');

const SNAPSHOT = new URL('./world-snapshot.json', import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRECISION = 1e-4;

// ---- Canonical form: numbers rounded to 1e-4, keys sorted, functions dropped, buildings referenced by id. ----
const buildingIds = new Map(city.BUILDINGS.map((b) => [b, b.id]));
function canon(v, inBuildings = false) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    const r = Math.round(v / PRECISION) * PRECISION;
    return Object.is(r, -0) ? 0 : Number(r.toFixed(4));
  }
  if (Array.isArray(v)) return v.map((x) => canon(x, inBuildings));
  if (v && typeof v === 'object') {
    if (!inBuildings && buildingIds.has(v)) return { building: buildingIds.get(v) };
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined && typeof v[k] !== 'function') out[k] = canon(v[k], inBuildings);
    return out;
  }
  return v;
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const countBy = (list, key) => {
  const out = {};
  for (const item of list) { const k = String(item[key]); out[k] = (out[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

// ---- The walking graph. nav.ts keeps its graph private, so legs are found through snap(): every walking line is ----
// probed every 0.5 m and the whole map on a 2 m grid. A nav.ts that exposes legs() (same shape) is read directly.
function navLegs(nav) {
  const legs = new Map();
  const keyOf = (s) => {
    const a = [canon(s.ax), canon(s.az)], b = [canon(s.bx), canon(s.bz)];
    const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
    return { key: `${p}|${q}|${s.crossing ? 1 : 0}`, leg: { ax: p[0], az: p[1], bx: q[0], bz: q[1], crossing: !!s.crossing } };
  };
  const add = (s) => {
    if (!s || typeof s.ax !== 'number' || typeof s.bz !== 'number') {
      throw new Error('nav.snap() no longer returns { segment: { ax, az, bx, bz, crossing } }: expose nav.legs() returning that shape so the snapshot can read the graph');
    }
    const { key, leg } = keyOf(s);
    if (!legs.has(key)) legs.set(key, leg);
  };
  if (typeof nav.legs === 'function') nav.legs().forEach(add);
  else {
    const { ROADS_X, ROADS_Z, SIDEWALK, LAND, PLAY } = city;
    for (const road of ROADS_Z) for (const side of [-1, 1]) for (let x = LAND.minX; x <= LAND.maxX; x += 0.5) add(nav.snap(x, road + side * SIDEWALK).segment);
    for (const road of ROADS_X) for (const side of [-1, 1]) for (let z = LAND.minZ; z <= LAND.maxZ; z += 0.5) add(nav.snap(road + side * SIDEWALK, z).segment);
    for (let x = PLAY.minX; x <= PLAY.maxX; x += 2) for (let z = PLAY.minZ; z <= PLAY.maxZ; z += 2) add(nav.snap(x, z).segment);
  }
  const order = (a, b) => a.ax - b.ax || a.az - b.az || a.bx - b.bx || a.bz - b.bz || Number(a.crossing) - Number(b.crossing);
  return [...legs.values()].sort(order);
}

// ---- Every table, as { items, breakdown }. ----
function buildTables() {
  const tables = {};
  const put = (name, items, breakdown) => { tables[name] = { items: Array.isArray(items) ? items : [items], breakdown }; };
  const constants = {};
  for (const [name, value] of Object.entries(city).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof value === 'function') continue;
    if (name === 'SCENERY') {
      for (const key of Object.keys(value).sort()) {
        const v = value[key];
        put(`SCENERY.${key}`, v, Array.isArray(v) && v[0] && 'kind' in v[0] ? countBy(v, 'kind') : Array.isArray(v) && v[0] && 'species' in v[0] ? countBy(v, 'species') : undefined);
      }
    } else if (name === 'BUILDINGS') put(name, value.map((b) => canon(b, true)), countBy(value, 'kind'));
    else if (name === 'LANDMARKS') put(name, value);
    else if (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'object')) {
      put(name, value, value[0] && 'kind' in value[0] ? countBy(value, 'kind') : value[0] && 'style' in value[0] ? countBy(value, 'style') : undefined);
    } else constants[name] = value;
  }
  put('CONSTANTS', constants);
  put('DOORS', city.BUILDINGS.map((b) => ({ id: b.id, door: b.door, curb: b.curb, facing: b.facing })));
  put('APPROACHES', signals.APPROACHES, countBy(signals.APPROACHES, 'axis'));
  put('SIGNAL_CONSTANTS', { CYCLE: signals.CYCLE, STOP_LINE: signals.STOP_LINE });
  const nav = createNav();
  const legs = navLegs(nav);
  const nodes = new Map();
  for (const l of legs) for (const [x, z] of [[l.ax, l.az], [l.bx, l.bz]]) nodes.set(`${x},${z}`, { x, z });
  const nodeList = [...nodes.values()].sort((a, b) => a.x - b.x || a.z - b.z);
  if (typeof nav.nodeCount === 'function' && nav.nodeCount() !== nodeList.length) {
    throw new Error(`nav probe found ${nodeList.length} nodes but nav.nodeCount() is ${nav.nodeCount()}: some legs were missed, expose nav.legs()`);
  }
  put('NAV_NODES', nodeList);
  put('NAV_LEGS', legs, { crossing: legs.filter((l) => l.crossing).length, sidewalk: legs.filter((l) => !l.crossing).length });
  put('NAV_CROSSINGS', legs.filter((l) => l.crossing));
  const out = {};
  for (const [name, t] of Object.entries(tables)) {
    const items = t.items.map((item) => JSON.stringify(canon(item)));
    out[name] = {
      count: items.length,
      sha256: sha(`[${items.join(',')}]`),
      ...(t.breakdown ? { breakdown: t.breakdown } : {}),
      items: items.map((s) => sha(s).slice(0, 8)).join(' '),
      json: items,
    };
  }
  return out;
}

function gitSource() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'app', 'lib'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return `${head}${dirty ? ' + uncommitted changes in app/ or lib/' : ''}`;
  } catch { return 'unknown'; }
}

// ---- Readable differences: per table, how the count moved, items removed/added and breakdown changes. ----
function describe(name, before, after) {
  const pad = name.padEnd(22);
  if (!before) return `${pad} NEW table (${after.count} items), not in the snapshot`;
  if (!after) return `${pad} REMOVED table (had ${before.count} items)`;
  const delta = after.count - before.count;
  const lines = [`${pad} ${before.count} -> ${after.count}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ' (same count)'}`];
  const old = new Map();
  for (const h of before.items ? before.items.split(' ') : []) old.set(h, (old.get(h) ?? 0) + 1);
  const added = [];
  after.items.split(' ').forEach((h, i) => {
    if (old.get(h)) old.set(h, old.get(h) - 1);
    else added.push(i);
  });
  const removed = [...old.values()].reduce((s, n) => s + n, 0);
  if (!removed && !added.length) lines.push(`${''.padEnd(22)} same items in a different order`);
  else lines.push(`${''.padEnd(22)} ${removed} removed or changed, ${added.length} added or changed`);
  for (const i of added.slice(0, 3)) lines.push(`${''.padEnd(22)}   now [${i}] ${after.json[i].slice(0, 160)}`);
  if (added.length > 3) lines.push(`${''.padEnd(22)}   ... and ${added.length - 3} more`);
  const keys = new Set([...Object.keys(before.breakdown ?? {}), ...Object.keys(after.breakdown ?? {})]);
  const moved = [...keys].filter((k) => (before.breakdown?.[k] ?? 0) !== (after.breakdown?.[k] ?? 0)).map((k) => `${k} ${before.breakdown?.[k] ?? 0} -> ${after.breakdown?.[k] ?? 0}`);
  if (moved.length) lines.push(`${''.padEnd(22)} by kind: ${moved.join(', ')}`);
  return lines.join('\n');
}

const current = buildTables();

test('world layout matches scripts/world-snapshot.json', () => {
  if (process.env.UPDATE_SNAPSHOT === '1') {
    const tables = Object.fromEntries(Object.entries(current).map(([name, t]) => [name, Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'json'))]));
    const file = {
      about: 'Layout guard (plan decision 13). Regenerate only for a deliberate layout change, in the same commit, with a note: UPDATE_SNAPSHOT=1 node --experimental-transform-types --test scripts/world-snapshot.test.mjs',
      generatedFrom: gitSource(),
      precision: PRECISION,
      tables,
    };
    writeFileSync(SNAPSHOT, `${JSON.stringify(file, null, 1)}\n`);
    console.log(`wrote ${fileURLToPath(SNAPSHOT)} (${Object.keys(tables).length} tables)`);
    return;
  }
  assert.ok(existsSync(SNAPSHOT), 'scripts/world-snapshot.json is missing: generate it with UPDATE_SNAPSHOT=1');
  const saved = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const names = [...new Set([...Object.keys(saved.tables), ...Object.keys(current)])].sort();
  const changed = names.filter((n) => saved.tables[n]?.sha256 !== current[n]?.sha256 || saved.tables[n]?.count !== current[n]?.count);
  if (!changed.length) return;
  const same = names.filter((n) => !changed.includes(n));
  assert.fail([
    `World layout differs from scripts/world-snapshot.json (generated from ${saved.generatedFrom}), ${changed.length} table(s) changed:`,
    ...changed.map((n) => describe(n, saved.tables[n], current[n])),
    `Unchanged: ${same.join(', ') || 'none'}`,
    'If the change is deliberate, regenerate with UPDATE_SNAPSHOT=1 node --experimental-transform-types --test scripts/world-snapshot.test.mjs',
    'and say so in the commit message (plan decision 13).',
  ].join('\n'));
});

test('walking graph probe is complete and consistent', () => {
  const legs = current.NAV_LEGS.count, crossings = current.NAV_CROSSINGS.count, nodes = current.NAV_NODES.count;
  assert.ok(legs > 0 && crossings > 0 && crossings < legs, `nav legs ${legs}, crossings ${crossings}`);
  assert.equal(current.NAV_LEGS.breakdown.crossing, crossings);
  assert.ok(nodes <= legs * 2);
});
