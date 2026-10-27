// node --experimental-transform-types --test scripts/zombie-room.test.mjs
// Zombie rooms in the room Durable Object, on the in-memory harness of scripts/room.test.mjs (design.md §1.2, §1.6, §1.7, §7.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRoom } from '../lib/room-service.ts';
import { RealtimeRoom } from '../lib/realtime-room.ts';
import { ACTIVE_MS, ClientError, playerState } from '../lib/room-validation.ts';
import { WORLD_VERSION, PEER_BOUNDS } from '../lib/world-bounds.ts';
import { BLAST_ID, HIT_BUDGET_PER_S, HOST_GRACE_MS, HOST_MIN_TERM_MS, HOST_STALL_MS, NO_SLOT, ZOMBIE_VERSION } from '../lib/zombie-protocol.ts';
import { clampDirector, createKillGuard, noteKill, sanitizeEvent, zombieMessage, zombiePlayerFields } from '../lib/zombie-validation.ts';
import { ZombieRelay } from '../lib/zombie-relay.ts';

function memory() {
  const values = new Map();
  return {
    writes: 0, alarm: null,
    async get(key) { return structuredClone(values.get(key)); },
    async put(key, value) { this.writes++; values.set(key, structuredClone(value)); },
    async setAlarm(value) { this.alarm = value; },
    async deleteAll() { values.clear(); },
  };
}
function actor(storage = memory()) {
  const room = new RealtimeRoom({ storage, blockConcurrencyWhile: work => work() });
  // The tests drive relay.tick() with a fake clock; no real 50 ms timer.
  room.startTimer = () => {};
  return { room, storage };
}
function namespace(t) {
  const actors = new Map();
  const rooms = {
    idFromName: code => code,
    get(code) {
      if (!actors.has(code)) actors.set(code, actor());
      return { fetch: request => actors.get(code).room.fetch(request) };
    },
  };
  t.after(() => { for (const entry of actors.values()) entry.room.reset(); });
  return { rooms, actors };
}
async function call(rooms, body) {
  const response = await handleRoom(new Request('https://example.test/api/room', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), rooms);
  return { status: response.status, body: await response.json() };
}
const zombieRoom = (rooms, extra = {}) => call(rooms, { action: 'create', name: 'Minh', world: WORLD_VERSION, mode: 'zombie', zv: ZOMBIE_VERSION, ...extra });
const joinRoom = (rooms, code, name = 'Lan', extra = {}) => call(rooms, { action: 'join', name, code, world: WORLD_VERSION, zv: ZOMBIE_VERSION, ...extra });
const base = { x: 3, z: 5, angle: 0.2, riding: false, speed: 0, score: 0 };
function connection(room) {
  const messages = [], closes = [];
  const value = {
    socket: { send: text => messages.push(JSON.parse(text)), close: (...args) => closes.push(args) },
    seq: 0, closed: false, rateStart: Date.now(), messages: 0, queued: 0, timer: setTimeout(() => {}, 0),
  };
  room.connections.add(value);
  return { value, messages, closes, stateSeq: 0 };
}
async function connect(room, session) {
  const c = connection(room);
  await room.message(c.value, { type: 'auth', id: session.id, token: session.token });
  return c;
}
/** Like the room's socket handler: a ClientError becomes a non-fatal error frame. */
async function send(room, c, message) {
  try { await room.message(c.value, message); }
  catch (error) { if (error instanceof ClientError) c.messages.push({ type: 'error', message: error.message, fatal: false }); else throw error; }
}
const state = (room, c, extra = {}) => send(room, c, { type: 'state', seq: ++c.stateSeq, state: { ...base, zd: 0, ...extra } });
const of = (c, type) => c.messages.filter(m => m.type === type);
const roles = c => of(c, 'zrole');
const director = (over = {}) => ({ wave: 1, phase: 'wave', until: 0, left: 10, spawned: 0, toSpawn: 10, kills: 0, score: 0, best: 0, boss: [], mutants: [], stats: [], ruins: [], rng: 1, n: 2, ...over });
const KEY = 'AQEAAAAA'; // a 6-byte empty keyframe header in base64
const DELTA = 'AQAAAAAA';
function clock(t) {
  const c = { now: 2_000_000_000_000 };
  t.mock.method(Date, 'now', () => c.now);
  return c;
}
/** A zombie room with `count` players connected and sending state; the creator hosts epoch 1. */
async function setup(t, count = 2) {
  const time = clock(t);
  const { rooms, actors } = namespace(t);
  const sessions = [(await zombieRoom(rooms)).body];
  for (let i = 1; i < count; i++) sessions.push((await joinRoom(rooms, sessions[0].room, `P${i}`)).body);
  const { room, storage } = actors.get(sessions[0].room);
  const sockets = [];
  for (const s of sessions) { const c = await connect(room, s); await state(room, c); sockets.push(c); }
  const fresh = async () => { for (const c of sockets) if (!c.value.closed) await state(room, c); };
  return { time, rooms, room, storage, sessions, sockets, fresh, relay: () => room.relay };
}

test('zombie rooms store mode, version and friendly fire; joins enter the room mode; versions must match; city rooms are unchanged', async t => {
  const { rooms, actors } = namespace(t);
  const created = await zombieRoom(rooms);
  assert.equal(created.status, 201);
  assert.equal(created.body.mode, 'zombie');
  assert.equal(created.body.slot, 0);
  assert.equal(created.body.host, created.body.id);
  assert.equal(created.body.epoch, 1);
  assert.equal(created.body.ff, false);
  const saved = await actors.get(created.body.room).storage.get('room');
  assert.equal(saved.mode, 'zombie'); assert.equal(saved.zv, ZOMBIE_VERSION); assert.equal(saved.ff, false);
  assert.equal(saved.epoch, 1); assert.equal(saved.hostId, created.body.id); assert.equal(saved.best, 0);
  assert.equal(saved.players[0].slot, 0);
  const joined = await joinRoom(rooms, created.body.room);
  assert.equal(joined.status, 200);
  assert.deepEqual([joined.body.mode, joined.body.slot, joined.body.host, joined.body.epoch], ['zombie', 1, created.body.id, 1]);
  for (const zv of [undefined, ZOMBIE_VERSION + 1]) {
    const wrong = await call(rooms, { action: 'join', name: 'Cũ', code: created.body.room, world: WORLD_VERSION, ...(zv === undefined ? {} : { zv }) });
    assert.equal(wrong.status, 409);
    assert.equal(wrong.body.error, 'Phòng Zombie này dùng phiên bản khác. Hãy tải lại trang.');
  }
  assert.equal((await call(rooms, { action: 'create', name: 'X', mode: 'zombie' })).status, 400, 'a zombie room needs a version');
  assert.equal((await call(rooms, { action: 'create', name: 'X', mode: 'war', zv: 1 })).status, 400);
  assert.equal((await zombieRoom(rooms, { ff: true })).body.ff, true);
  // City rooms: as before, plus the additive fields.
  const city = await call(rooms, { action: 'create', name: 'Phố', world: WORLD_VERSION });
  assert.deepEqual([city.body.mode, city.body.host, city.body.epoch, city.body.ff, city.body.slot], ['city', null, 0, false, 0]);
  assert.equal((await call(rooms, { action: 'join', name: 'Bạn', code: city.body.room, world: WORLD_VERSION })).status, 200);
  assert.equal((await call(rooms, { action: 'join', name: 'Bạn 2', code: city.body.room, world: WORLD_VERSION, zv: 99 })).status, 200);
  const savedCity = await actors.get(city.body.room).storage.get('room');
  assert.equal(savedCity.mode, undefined);
  const fields = { zd: 1, bleed: 12, cam: 1, quiet: true, dog: { x: 1, z: 2, a: 0, m: 1, h: 50, t: -1, c: 2 } };
  assert.deepEqual(playerState({ ...base, ...fields }), playerState(base), 'city rooms strip zombie fields');
  assert.deepEqual(playerState({ ...base, ...fields }, 'city'), playerState(base));
  // A city room refuses zombie messages.
  const { room } = actors.get(city.body.room);
  const c = await connect(room, city.body);
  await send(room, c, { type: 'zneed' });
  assert.equal(of(c, 'error')[0].message, 'Phòng này không chơi chế độ Zombie.');
});

test('slots are unique 0..7, reused after leave, carried by peers and ready', async t => {
  const { rooms, actors } = namespace(t);
  const sessions = [(await zombieRoom(rooms)).body];
  for (let i = 1; i < 8; i++) sessions.push((await joinRoom(rooms, sessions[0].room, `P${i}`)).body);
  assert.deepEqual(sessions.map(s => s.slot), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal((await call(rooms, { action: 'leave', room: sessions[3].room, id: sessions[3].id, token: sessions[3].token })).status, 200);
  const next = (await joinRoom(rooms, sessions[0].room, 'Mới')).body;
  assert.equal(next.slot, 3);
  const { room } = actors.get(sessions[0].room);
  const a = await connect(room, sessions[0]);
  const b = await connect(room, next);
  assert.equal(a.messages[0].type, 'ready');
  assert.equal(a.messages[0].mode, 'zombie');
  assert.equal(a.messages[0].slot, 0);
  assert.equal(b.messages[0].slot, 3);
  await state(room, b, { x: 1.23456 });
  room.broadcast(Date.now());
  const peer = of(a, 'snapshot').at(-1).peers[0];
  assert.equal(peer.slot, 3);
  assert.equal(peer.zd, 0);
});

test('idle sessions give their slots back; 8 active players always hold 8 distinct slots', async t => {
  const time = clock(t);
  const { rooms, actors } = namespace(t);
  const old = [(await zombieRoom(rooms)).body];
  for (let i = 1; i < 3; i++) old.push((await joinRoom(rooms, old[0].room, `Cũ ${i}`)).body);
  time.now += ACTIVE_MS + 1;
  const fresh = [];
  for (let i = 0; i < 8; i++) fresh.push((await joinRoom(rooms, old[0].room, `Mới ${i}`)).body);
  assert.deepEqual(fresh.map(s => s.slot).sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  const { room } = actors.get(old[0].room);
  const late = await connect(room, old[1]);
  assert.equal(late.closes[0][0], 4409, 'a full room keeps its eight');
  // With room again, the idle session comes back with a free slot, never a taken one.
  assert.equal((await call(rooms, { action: 'leave', room: fresh[5].room, id: fresh[5].id, token: fresh[5].token })).status, 200);
  for (const s of fresh) if (s !== fresh[5]) await connect(room, s);
  const back = await connect(room, old[1]);
  assert.equal(back.messages[0].type, 'ready');
  assert.equal(back.messages[0].slot, fresh[5].slot);
});

test('election: the creator hosts epoch 1; leave, stall and grace expiry re-elect; a quick reconnect restores the role', async t => {
  const { time, room, sessions, sockets, fresh, storage } = await setup(t, 3);
  const [a, b] = sockets;
  assert.deepEqual(roles(a).map(r => [r.why, r.host, r.epoch, r.slot]), [['create', sessions[0].id, 1, 0]]);
  assert.deepEqual(roles(b).at(-1), { type: 'zrole', host: sessions[0].id, slot: 0, epoch: 1, why: 'join' });
  // Stall: no zsnap for HOST_STALL_MS while others are candidates.
  await send(room, a, { type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  time.now += HOST_STALL_MS - 100; await fresh(); room.relay.tick(Date.now());
  assert.equal(room.relay.epoch, 1);
  time.now += 100; await fresh(); room.relay.tick(Date.now());
  const stall = roles(b).at(-1);
  assert.equal(stall.why, 'stall'); assert.equal(stall.epoch, 2); assert.notEqual(stall.host, sessions[0].id);
  assert.equal((await storage.get('room')).epoch, 2, 'every election is persisted');
  const host = sockets.find((_, i) => sessions[i].id === stall.host);
  assert.ok(of(host, 'zneed').length >= 1, 'the new host is asked for a keyframe');
  // Socket drop + re-auth within the grace keeps the role, same epoch.
  room.detach(host.value);
  time.now += HOST_GRACE_MS - 200; await fresh(); room.relay.tick(Date.now());
  assert.equal(room.relay.hostId, stall.host);
  const again = await connect(room, sessions[sockets.indexOf(host)]);
  assert.deepEqual([roles(again).at(-1).why, roles(again).at(-1).epoch], ['restore', 2]);
  assert.equal(roles(a).at(-1).why, 'restore');
  // Past the grace, someone else hosts.
  room.detach(again.value);
  time.now += HOST_GRACE_MS + 1; await fresh(); room.relay.tick(Date.now());
  assert.deepEqual([roles(a).at(-1).why, roles(a).at(-1).epoch], ['left', 3]);
  // An explicit leave re-elects at once.
  const current = room.relay.hostId;
  const leaving = sessions.find(s => s.id === current);
  await call({ idFromName: c => c, get: () => ({ fetch: r => room.fetch(r) }) }, { action: 'leave', room: leaving.room, id: leaving.id, token: leaving.token });
  assert.notEqual(room.relay.hostId, current);
  assert.equal(room.relay.epoch, 4);
});

test('election order: foreground, then frame rate, then lowest RTT; hidden and slow hosts are replaced (slow only after the minimum term)', async t => {
  const { time, room, sessions, sockets, fresh } = await setup(t, 3);
  const [a, b, c] = sockets;
  await send(room, b, { type: 'ping', sentAt: 1, rtt: 300, vis: true, fps: 60 });
  await send(room, c, { type: 'ping', sentAt: 1, rtt: 40, vis: true, fps: 60 });
  // Hidden host: replaced at once by the visible candidate with the lowest RTT.
  await send(room, a, { type: 'ping', sentAt: 1, rtt: 20, vis: false, fps: 60 });
  assert.deepEqual([roles(b).at(-1).why, roles(b).at(-1).host], ['stall', sessions[2].id]);
  // A hidden candidate is not preferred; neither is one under 30 fps.
  await send(room, a, { type: 'ping', sentAt: 2, rtt: 20, vis: true, fps: 20 });
  await send(room, c, { type: 'ping', sentAt: 2, rtt: 40, vis: false, fps: 60 });
  assert.equal(roles(b).at(-1).host, sessions[1].id, 'c hid: b (foreground, 60 fps) beats a (20 fps)');
  // Slow host: two pings under 24 fps while a candidate has ≥ 40, but only after HOST_MIN_TERM_MS.
  await send(room, c, { type: 'ping', sentAt: 3, rtt: 40, vis: true, fps: 60 });
  const epoch = room.relay.epoch;
  await send(room, b, { type: 'ping', sentAt: 3, rtt: 30, vis: true, fps: 15 });
  await send(room, b, { type: 'ping', sentAt: 4, rtt: 30, vis: true, fps: 15 });
  await send(room, b, { type: 'zsnap', epoch, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  room.relay.tick(Date.now());
  assert.equal(room.relay.epoch, epoch, 'not before the minimum term');
  for (let i = 0; i < HOST_MIN_TERM_MS / 1000; i++) {
    time.now += 1000; await fresh();
    await send(room, b, { type: 'zsnap', epoch, seq: 2 + i, key: false, part: 0, parts: 1, b: DELTA });
  }
  await send(room, b, { type: 'ping', sentAt: 5, rtt: 30, vis: true, fps: 15 });
  await send(room, b, { type: 'ping', sentAt: 6, rtt: 30, vis: true, fps: 15 });
  room.relay.tick(Date.now());
  assert.deepEqual([roles(a).at(-1).why, roles(a).at(-1).host], ['lag', sessions[2].id]);
});

test('high RTT or a choppy snapshot stream re-elect only with a fast foreground candidate and after the minimum term', async t => {
  const { time, room, sessions, sockets, fresh } = await setup(t, 2);
  const [a, b] = sockets;
  await send(room, a, { type: 'ping', sentAt: 1, rtt: 500, vis: true, fps: 60 });
  await send(room, b, { type: 'ping', sentAt: 1, rtt: 50, vis: true, fps: 60 });
  let seq = 0;
  for (let ms = 0; ms < HOST_MIN_TERM_MS + 6000; ms += 250) {
    time.now += 250;
    if (ms % 1000 === 0) { await fresh(); await send(room, a, { type: 'ping', sentAt: ms, rtt: 500, vis: true, fps: 60 }); }
    await send(room, a, { type: 'zsnap', epoch: 1, seq: ++seq, key: false, part: 0, parts: 1, b: DELTA });
    room.relay.tick(Date.now());
    if (ms < HOST_MIN_TERM_MS - 500) assert.equal(room.relay.epoch, 1);
  }
  assert.deepEqual([roles(b).at(-1).why, roles(b).at(-1).host], ['lag', sessions[1].id]);
});

test('anti-spoof: only the host sends zsnap/zdir/zev; stale epochs are dropped silently; the host never sends zhit; bad frames are rejected', async t => {
  const { room, sockets } = await setup(t, 3);
  const [a, b, c] = sockets;
  const before = c.messages.length;
  for (const message of [
    { type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY },
    { type: 'zdir', epoch: 1, seq: 1, d: director() },
    { type: 'zev', epoch: 1, seq: 1, ev: [{ k: 'roar', w: 1, x: 0, z: 0, r: 10 }] },
  ]) await send(room, b, message);
  assert.equal(of(b, 'error')[0].message, 'Không phải máy chủ của bầy zombie.');
  assert.equal(of(b, 'error').length, 1, 'one error per second, not one per frame');
  assert.equal(c.messages.slice(before).filter(m => m.type.startsWith('z')).length, 0, 'never relayed');
  await send(room, a, { type: 'zhit', seq: 1, h: [{ w: 1, d: 10, zone: 0, k: 0, wp: 1, dx: 0, dz: 1, f: 1, sx: 0, sz: 0 }] });
  assert.equal(of(a, 'error')[0].message, 'Máy chủ không gửi đòn đánh zombie.');
  // A demoted host's frames (an older epoch) vanish without an error.
  await send(room, a, { type: 'ping', sentAt: 1, vis: false });
  assert.equal(room.relay.epoch, 2);
  const errors = of(a, 'error').length;
  for (let i = 0; i < 40; i++) await send(room, a, { type: 'zsnap', epoch: 1, seq: 10 + i, key: false, part: 0, parts: 1, b: DELTA });
  assert.equal(of(a, 'error').length, errors);
  assert.equal(c.messages.slice(before).filter(m => m.type === 'zsnap').length, 0);
  // Shape errors.
  const host = sockets.find(s => roles(s).at(-1)?.host === room.relay.hostId && of(s, 'ready')[0].id === room.relay.hostId) ?? b;
  for (const bad of [
    { type: 'zsnap', epoch: 2, seq: 1, key: true, part: 0, parts: 1, b: 'not base64!' },
    { type: 'zsnap', epoch: 2, seq: 1, key: true, part: 2, parts: 2, b: KEY },
    { type: 'zsnap', epoch: 2, seq: 1, key: true, part: 0, parts: 1, b: 'A'.repeat(3604) },
    { type: 'zdir', epoch: 2, seq: 1, d: { ...director(), phase: 'party' } },
    { type: 'zev', epoch: 2, seq: 1, ev: Array.from({ length: 33 }, () => ({ k: 'roar', w: 1, x: 0, z: 0, r: 1 })) },
    { type: 'zbogus' },
  ]) await assert.rejects(room.message(host.value, bad), ClientError);
});

test('kill guard clamps (never rejects) across epochs; restarts allow a drop; bursts over 60/s are relayed uncounted', async t => {
  const { time, room, sessions, sockets, fresh } = await setup(t, 3);
  const [a, b, c] = sockets;
  const kill = by => ({ k: 'kill', w: 5, kind: 'walker', by, wp: 1, dx: 0, dz: 1, f: 1 });
  const lastDir = s => of(s, 'zdir').at(-1).d;
  await send(room, a, { type: 'zdir', epoch: 1, seq: 1, d: director({ kills: 50, stats: [[0, 50, 0, 0, 0]] }) });
  assert.equal(lastDir(b).kills, 0, 'inflated kills are clamped to what was announced');
  assert.deepEqual(lastDir(b).stats[0], [0, 0, 0, 0, 0]);
  await send(room, a, { type: 'zev', epoch: 1, seq: 1, ev: Array.from({ length: 10 }, () => kill(1)) });
  await send(room, a, { type: 'zdir', epoch: 1, seq: 2, d: director({ kills: 10, stats: [[1, 10, 0, 0, 0]] }) });
  assert.equal(lastDir(b).kills, 10);
  assert.deepEqual(lastDir(b).stats[0], [1, 10, 0, 0, 0]);
  await send(room, a, { type: 'zdir', epoch: 1, seq: 3, d: director({ kills: 4, stats: [[1, 2, 0, 0, 0]] }) });
  assert.equal(lastDir(b).kills, 10, 'no drop without a restart');
  assert.equal(lastDir(b).stats[0][1], 10);
  // Migration: host A announces 4 kills and stalls; B's first zdir carries 14 and is relayed unchanged.
  await send(room, a, { type: 'zev', epoch: 1, seq: 2, ev: [kill(2), kill(2), kill(2), kill(NO_SLOT)] });
  time.now += HOST_STALL_MS; await fresh(); room.relay.tick(Date.now());
  const next = sockets[sessions.findIndex(s => s.id === room.relay.hostId)];
  const watcher = next === b ? c : b;
  await send(room, next, { type: 'zdir', epoch: 2, seq: 1, d: director({ kills: 14, stats: [[1, 10, 0, 0, 0], [2, 3, 0, 0, 0]] }) });
  assert.equal(lastDir(watcher).kills, 14);
  assert.deepEqual(lastDir(watcher).stats.map(r => r[1]), [10, 3]);
  // An RPG into a horde: 100 kills in a second are relayed; only 60 count; later zdirs still flow.
  const burst = Array.from({ length: 100 }, () => kill(1));
  for (let i = 0; i < 4; i++) await send(room, next, { type: 'zev', epoch: 2, seq: 2 + i, ev: burst.slice(i * 25, i * 25 + 25) });
  assert.equal(of(watcher, 'zev').slice(-4).reduce((n, m) => n + m.ev.length, 0), 100);
  await send(room, next, { type: 'zdir', epoch: 2, seq: 2, d: director({ kills: 114, stats: [[1, 110, 0, 0, 0]] }) });
  assert.equal(lastDir(watcher).kills, 74);
  time.now += 1000;
  await send(room, next, { type: 'zdir', epoch: 2, seq: 3, d: director({ kills: 114, stats: [[1, 110, 0, 0, 0]] }) });
  assert.equal(lastDir(watcher).kills, 74, 'clamped, never frozen');
  // A restart lets the counters fall back to zero.
  await send(room, next, { type: 'zev', epoch: 2, seq: 9, ev: [{ k: 'wave', n: 1, p: 'restart' }] });
  await send(room, next, { type: 'zdir', epoch: 2, seq: 4, d: director({ kills: 0, stats: [] }) });
  assert.equal(lastDir(watcher).kills, 0);
});

test('zev is sanitized event by event: bad events dropped, damage, radii and positions clamped', async t => {
  const { room, sockets } = await setup(t, 2);
  const [a, b] = sockets;
  await send(room, a, { type: 'zev', epoch: 1, seq: 1, ev: [
    { k: 'hit', w: 3, a: 'claw', x: 1, z: 2, yaw: 0, r: 1.2, arc: 1, dmg: 90, kb: 0, to: 0xffff },
    { k: 'hit', w: 3, a: 'claw', x: NaN, z: 2, yaw: 0, r: 1, arc: 1, dmg: 5, kb: 0, to: 1 },
    { k: 'party', w: 1 },
    { k: 'tele', w: 0xff00, a: 'charge', x: 9999, z: -9999, yaw: 7, r: 25, arc: 1.2, t: 30, to: 1 },
    { k: 'proj', id: 1, w: 4, a: 'spit', x: 0, y: 500, z: 0, vx: 1, vy: 1, vz: 1, r: 40, dmg: 12 },
    { k: 'cloud', x: 0, z: 0, r: 5, s: 60, dps: 99 },
    { k: 'kill', w: 3, kind: 'walker', by: 7, wp: 1, dx: 0, dz: 1, f: 2 },
  ] });
  const ev = of(b, 'zev').at(-1).ev;
  assert.equal(ev.length, 5);
  assert.equal(ev[0].dmg, 60);
  assert.equal(ev[0].to, 0x0303, 'masked to the two active slots and their dogs');
  assert.deepEqual([ev[1].x, ev[1].z, ev[1].r, ev[1].t], [PEER_BOUNDS.maxX, PEER_BOUNDS.minZ, 25, 8], 'a 25 m charge line passes');
  assert.ok(Math.abs(ev[1].yaw - (7 - 2 * Math.PI)) < 1e-3);
  assert.deepEqual([ev[2].y, ev[2].r], [300, 12]);
  assert.deepEqual([ev[3].s, ev[3].dps], [10, 12]);
  assert.equal(ev[4].by, NO_SLOT, 'a slot nobody holds');
  assert.equal(sanitizeEvent({ k: 'scream', w: 0xfffd, x: 0, z: 0, r: 200 }).r, 80);
  assert.equal(sanitizeEvent({ k: 'smash', ruin: 12345, code: 9, x: 0, z: 0 }), null);
  assert.equal(zombieMessage({ type: 'zev', epoch: 1, seq: 1, ev: [{ k: 'nope' }] }).ev.length, 0);
});

test('a (re)connecting player gets the cached zdir, keyframe and deltas before its zrole; the host is asked for a keyframe', async t => {
  const { room, sessions, sockets } = await setup(t, 2);
  const [a] = sockets;
  await send(room, a, { type: 'zdir', epoch: 1, seq: 1, d: director({ wave: 3 }) });
  await send(room, a, { type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  for (let seq = 2; seq <= 4; seq++) await send(room, a, { type: 'zsnap', epoch: 1, seq, key: false, part: 0, parts: 1, b: DELTA });
  const needs = of(a, 'zneed').length;
  const late = (await joinRoom({ idFromName: c => c, get: () => ({ fetch: r => room.fetch(r) }) }, sessions[0].room, 'Muộn')).body;
  const c = await connect(room, late);
  assert.deepEqual(c.messages.filter(m => m.type.startsWith('z')).map(m => m.type + (m.type === 'zsnap' ? (m.key ? ':key' : ':' + m.seq) : '')),
    ['zdir', 'zsnap:key', 'zsnap:2', 'zsnap:3', 'zsnap:4', 'zrole']);
  assert.ok(c.messages.every(m => m.type !== 'zsnap' || Number.isFinite(m.serverTime)));
  assert.equal(of(c, 'zdir')[0].d.wave, 3);
  assert.equal(of(a, 'zneed').length, needs + 1);
  assert.equal(of(a, 'zneed').at(-1).from, c.messages[0].slot);
});

test('the first player back into an empty room gets the caches, then a zrole naming it host', async t => {
  const { time, room, sessions, sockets } = await setup(t, 2);
  const [a, b] = sockets;
  await send(room, a, { type: 'zdir', epoch: 1, seq: 1, d: director({ wave: 6 }) });
  await send(room, a, { type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  room.detach(a.value); room.detach(b.value);
  time.now += HOST_GRACE_MS + 1;
  const back = await connect(room, sessions[1]);
  const z = back.messages.filter(m => m.type.startsWith('z'));
  assert.deepEqual(z.map(m => m.type), ['zdir', 'zsnap', 'zrole', 'zneed'], 'a new host is also asked for a keyframe');
  assert.deepEqual([z[2].host, z[2].epoch, z[2].why], [sessions[1].id, 2, 'left']);
});

test('the election epoch survives an actor restart: the saved host may come back within the grace, else saved + 1', async t => {
  const { time, rooms, room, storage, sessions } = await setup(t, 2);
  await room.relay.onPing({ id: sessions[0].id, slot: 0, joinedAt: 0, connected: true, lastState: Date.now(), ready: true }, 10, false);
  assert.equal((await storage.get('room')).epoch, 2);
  const hostId = (await storage.get('room')).hostId;
  void rooms;
  // Restart: a new actor from storage. The saved host reconnects in time and keeps epoch 2.
  const restored = actor(storage);
  await restored.room.ready;
  const hostSession = sessions.find(s => s.id === hostId);
  const back = await connect(restored.room, hostSession);
  assert.deepEqual([roles(back).at(-1).why, roles(back).at(-1).epoch, roles(back).at(-1).host], ['restore', 2, hostId]);
  // Another restart where only the other player returns: after the grace it is elected with epoch 3.
  const again = actor(storage);
  await again.room.ready;
  const other = sessions.find(s => s.id !== hostId);
  const c = await connect(again.room, other);
  await state(again.room, c);
  assert.equal(roles(c).at(-1).host, hostId, 'the saved host keeps the role during its grace');
  time.now += HOST_GRACE_MS + 1; await state(again.room, c); again.room.relay.tick(Date.now());
  assert.deepEqual([roles(c).at(-1).why, roles(c).at(-1).epoch, roles(c).at(-1).host], ['left', 3, other.id]);
  assert.equal((await storage.get('room')).epoch, 3);
});

test('snapshot rate: four parts every 100 ms count as one snapshot; a backlog rides on 3 s of banked tokens; floods are dropped with one error a second and closed after 5 s at 3×', async t => {
  const { time, room, sockets } = await setup(t, 2);
  const [a, b] = sockets;
  let seq = 0;
  const before = of(b, 'zsnap').length;
  for (let i = 0; i < 20; i++) {
    time.now += 100; seq++;
    for (let part = 0; part < 4; part++) await send(room, a, { type: 'zsnap', epoch: 1, seq, key: false, part, parts: 4, b: DELTA });
  }
  assert.equal(of(b, 'zsnap').length - before, 80);
  assert.equal(of(a, 'error').length, 0);
  // (seq, part) must increase: a replayed part is dropped.
  await send(room, a, { type: 'zsnap', epoch: 1, seq, key: false, part: 3, parts: 4, b: DELTA });
  assert.equal(of(b, 'zsnap').length - before, 80);
  // zev at once: a quiet socket banked 3 s of its 30/s; beyond that dropped, one error per second.
  const evBefore = of(b, 'zev').length;
  for (let i = 0; i < 100; i++) await send(room, a, { type: 'zev', epoch: 1, seq: i + 1, ev: [{ k: 'roar', w: 1, x: 0, z: 0, r: 1 }] });
  assert.equal(of(b, 'zev').length - evBefore, 90);
  assert.equal(of(a, 'error').length, 1);
  // The room's queue stalled 2 s and releases the host's frames together (server time): all relayed, nothing closed.
  time.now += 2000;
  const backlog = of(b, 'zev').length, snaps = of(b, 'zsnap').length;
  for (let i = 0; i < 20; i++) { seq++; for (let part = 0; part < 2; part++) await send(room, a, { type: 'zsnap', epoch: 1, seq, key: false, part, parts: 2, b: DELTA }); }
  for (let i = 0; i < 60; i++) await send(room, a, { type: 'zev', epoch: 1, seq: 200 + i, ev: [{ k: 'roar', w: 1, x: 0, z: 0, r: 1 }] });
  assert.equal(of(b, 'zsnap').length - snaps, 40);
  assert.equal(of(b, 'zev').length - backlog, 60);
  assert.equal(a.closes.length, 0);
  // 3× the limit for five seconds closes the socket (4403).
  for (let second = 0; second < 7 && !a.closes.length; second++) {
    time.now += 1000;
    for (let i = 0; i < 100; i++) await send(room, a, { type: 'zev', epoch: 1, seq: 1000 + second * 100 + i, ev: [{ k: 'roar', w: 1, x: 0, z: 0, r: 1 }] });
  }
  assert.equal(a.closes[0][0], 4403);
});

test('routing: zhit to the host only with the sender slot and a damage budget; revive to target + host; mark to all; zneed to host; restart only when over', async t => {
  const { room, sockets } = await setup(t, 3);
  const [a, b, c] = sockets;
  const hit = (d, extra = {}) => ({ w: 1, d, zone: 0, k: 0, wp: 1, dx: 0, dz: 1, f: 1, sx: 0, sz: 0, ...extra });
  await send(room, b, { type: 'zhit', seq: 1, h: [hit(20), hit(999), hit(10, { w: BLAST_ID, k: 3, f: 6, d: 170 }), hit(5, { w: BLAST_ID, k: 0 })] });
  const got = of(a, 'zhit').at(-1);
  assert.equal(got.from, 1);
  assert.deepEqual(got.h.map(h => h.d), [20, 34, 170], 'clamped to MAX_HIT_DAMAGE; a blast must be k = blast');
  assert.equal(of(c, 'zhit').length, 0);
  // Base-damage budget per rolling second.
  const many = Array.from({ length: 24 }, () => hit(34));
  for (let i = 0; i < 10; i++) await send(room, b, { type: 'zhit', seq: 2 + i, h: many });
  const delivered = of(a, 'zhit').reduce((sum, m) => sum + m.h.reduce((s, h) => s + h.d, 0), 0);
  assert.ok(delivered <= HIT_BUDGET_PER_S + 1, `${delivered}`);
  await send(room, c, { type: 'zcmd', seq: 1, c: { c: 'revive', to: 1 } });
  assert.deepEqual(of(b, 'zcmd').at(-1), { type: 'zcmd', serverTime: Date.now(), from: 2, c: { c: 'revive', to: 1 } });
  assert.equal(of(a, 'zcmd').length, 1);
  await send(room, c, { type: 'zcmd', seq: 2, c: { c: 'revive', to: 2 } });
  assert.equal(of(c, 'error').at(-1).message, 'Không tìm thấy đồng đội cần cứu.');
  await send(room, b, { type: 'zcmd', seq: 3, c: { c: 'mark', x: 1, z: 2, m: 'help' } });
  assert.equal(of(a, 'zcmd').length, 2); assert.equal(of(c, 'zcmd').length, 1);
  await send(room, b, { type: 'zneed' });
  assert.equal(of(a, 'zneed').at(-1).from, 1);
  await send(room, b, { type: 'zneed' });
  assert.equal(of(a, 'zneed').filter(m => m.from === 1).length, 2, 'the second zneed within a second is dropped');
  await send(room, c, { type: 'zcmd', seq: 4, c: { c: 'restart' } });
  assert.equal(of(a, 'zcmd').length, 2, 'restart only in phase over');
  await send(room, a, { type: 'zdir', epoch: 1, seq: 1, d: director({ phase: 'over' }) });
  await send(room, c, { type: 'zcmd', seq: 5, c: { c: 'restart' } });
  assert.deepEqual(of(a, 'zcmd').at(-1).c, { c: 'restart' });
});

test('PvP: zombie rooms without friendly fire acknowledge and drop hits; with ff they deliver; city rooms unchanged', async t => {
  for (const ff of [false, true]) {
    const { rooms, actors } = namespace(t);
    const host = (await zombieRoom(rooms, { ff })).body;
    const guest = (await joinRoom(rooms, host.room)).body;
    const { room } = actors.get(host.room);
    const a = await connect(room, host), b = await connect(room, guest);
    await state(room, b);
    const id = crypto.randomUUID();
    await send(room, a, { type: 'hit', id, hit: { target: guest.id, damage: 20, dx: 1, dz: 0 } });
    assert.ok(of(a, 'hitAck').some(m => m.id === id));
    assert.equal(of(b, 'hit').length, ff ? 1 : 0);
  }
});

test('zombie player fields are bounded copies; validators accept the contract shapes', () => {
  const fields = zombiePlayerFields({ zd: 1, bleed: 999, rv: 9, rvp: 3, cam: 10, quiet: 'yes', dog: { x: 1e9, z: -1e9, a: 7, m: 99, h: 250, t: 1e9, c: 3 } });
  assert.deepEqual(fields, { zd: 1, bleed: 120, rv: 9, rvp: 1, cam: Math.round((10 - 4 * Math.PI) * 1000) / 1000, dog: { x: PEER_BOUNDS.maxX, z: PEER_BOUNDS.minZ, a: Math.round((7 - 2 * Math.PI) * 1000) / 1000, m: 0, h: 100, t: -1, c: 3 } });
  assert.deepEqual(zombiePlayerFields({ zd: 5, dog: 'bad' }), { dog: null });
  assert.deepEqual(zombiePlayerFields({ dog: null }), { dog: null });
  const z = playerState({ ...base, zd: 2, dog: { x: 1, z: 2, a: 0.5, m: 2, h: 40.6, t: 300, c: 1 } }, 'zombie');
  assert.equal(z.zd, 2);
  assert.deepEqual(z.dog, { x: 1, z: 2, a: 0.5, m: 2, h: 41, t: 300, c: 1 });
  // Kill guard unit: clamp to [accepted, accepted + since]; restart permits a drop.
  const guard = createKillGuard();
  noteKill(guard, 2); noteKill(guard, 2);
  assert.equal(clampDirector(director({ kills: 9, stats: [[2, 9, 0, 0, 0]] }), guard).kills, 2);
  assert.equal(clampDirector(director({ kills: 1, stats: [[2, 1, 0, 0, 0]] }), guard).stats[0][1], 2);
  guard.restart = true;
  assert.equal(clampDirector(director({ kills: 0, stats: [] }), guard).kills, 0);
  assert.throws(() => zombieMessage({ type: 'zdir', epoch: 1, seq: 1, d: { ...director(), ruins: Array(49).fill(0) } }), ClientError);
  assert.throws(() => zombieMessage({ type: 'zdir', epoch: 1, seq: 1, d: { ...director(), wave: 1.5 } }), ClientError);
  assert.equal(zombieMessage({ type: 'zdir', epoch: 1, seq: 1, d: director({ mutants: [{ i: 0, k: 'colossus', hp: 90_000, max: 90_000, weak: 1 }] }) }).d.mutants[0].max, 65_000);
});

test('a stalled host keeps the role while every other player is hidden (no hand-over to a tab that cannot simulate, no churn); a visible one takes it', async t => {
  const { time, room, sessions, sockets, fresh } = await setup(t, 2);
  const [a, b] = sockets;
  await send(room, a, { type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  await send(room, b, { type: 'ping', sentAt: 1, rtt: 40, vis: false, fps: 60 });
  const before = roles(b).length;
  time.now += HOST_STALL_MS + 300; await fresh(); room.relay.tick(Date.now());
  assert.equal(room.relay.epoch, 1, 'B is hidden: A keeps the role through its stall');
  // Both hidden (the rest between waves) for 30 s: never an election.
  await send(room, a, { type: 'ping', sentAt: 2, rtt: 40, vis: false, fps: 60 });
  for (let s = 0; s < 60; s++) {
    time.now += 500; await fresh(); room.relay.tick(Date.now());
    if (s % 4 === 0) { await send(room, a, { type: 'ping', sentAt: 3 + s, rtt: 40, vis: false, fps: 60 }); await send(room, b, { type: 'ping', sentAt: 3 + s, rtt: 40, vis: false, fps: 60 }); }
  }
  assert.equal(room.relay.epoch, 1);
  assert.equal(roles(b).length, before, 'no zrole while nobody can simulate');
  // B shows its tab: the stalled host is replaced at the next tick.
  await send(room, b, { type: 'ping', sentAt: 99, rtt: 40, vis: true, fps: 60 });
  time.now += 50; await fresh(); room.relay.tick(Date.now());
  assert.deepEqual([roles(b).at(-1).why, roles(b).at(-1).host, room.relay.epoch], ['stall', sessions[1].id, 2]);
});

test('a host under 10 fps hands over at once to a visible player at 1.5× its rate; a 15 fps host is not replaced by a 20 fps one', async t => {
  const { room, sessions, sockets } = await setup(t, 2);
  const [a, b] = sockets;
  await send(room, b, { type: 'ping', sentAt: 1, rtt: 40, vis: true, fps: 20 });
  await send(room, a, { type: 'ping', sentAt: 1, rtt: 40, vis: true, fps: 15 });
  await send(room, a, { type: 'ping', sentAt: 2, rtt: 40, vis: true, fps: 15 });
  assert.equal(room.relay.epoch, 1, 'within the minimum term, and 20 fps is no better than 1.5 × 15');
  await send(room, b, { type: 'ping', sentAt: 2, rtt: 40, vis: true, fps: 35 });
  await send(room, a, { type: 'ping', sentAt: 3, rtt: 40, vis: true, fps: 5 });
  await send(room, a, { type: 'ping', sentAt: 4, rtt: 40, vis: true, fps: 5 });
  assert.deepEqual([roles(b).at(-1).why, roles(b).at(-1).host], ['lag', sessions[1].id], 'a 5 fps host slows the whole horde: replaced without the minimum term');
});

test('a room actor restored from storage takes the running host\'s kill totals as its baseline (clients keep the real count)', () => {
  const now = 1_000_000;
  const players = [
    { id: 'A', slot: 0, joinedAt: 1, connected: true, lastState: now, ready: true },
    { id: 'B', slot: 1, joinedAt: 2, connected: true, lastState: now, ready: true },
  ];
  const inbox = { A: [], B: [] };
  const relay = new ZombieRelay({ now: () => now, players: () => players, send: (p, m) => inbox[p.id].push(typeof m === 'string' ? JSON.parse(m) : m) },
    { epoch: 4, hostId: 'A', best: 8, restored: true });
  relay.onReady(players[0]); relay.onReady(players[1]);
  const zdir = (kills, stats, seq) => ({ type: 'zdir', epoch: 4, seq, d: director({ wave: 9, kills, stats }) });
  relay.onMessage(players[0], zdir(512, [[0, 300, 1, 0, 2], [1, 212, 0, 1, 0]], 1));
  const got = inbox.B.filter(m => m.type === 'zdir').at(-1).d;
  assert.equal(got.kills, 512);
  assert.deepEqual(got.stats.map(r => r[1]), [300, 212]);
  relay.onMessage(players[0], { type: 'zev', epoch: 4, seq: 1, ev: [{ k: 'kill', w: 5, kind: 'walker', by: 0, wp: 1, dx: 0, dz: 1, f: 2 }] });
  relay.onMessage(players[0], zdir(513, [[0, 301, 1, 0, 2], [1, 212, 0, 1, 0]], 2));
  assert.equal(inbox.B.filter(m => m.type === 'zdir').at(-1).d.kills, 513);
  // ...and the baseline holds from then on: an inflated total is clamped again.
  relay.onMessage(players[0], zdir(900, [[0, 600, 1, 0, 2], [1, 212, 0, 1, 0]], 3));
  assert.equal(inbox.B.filter(m => m.type === 'zdir').at(-1).d.kills, 513);
});

test('"Bắt đầu": the start command reaches the host while the room is in prep, never after the first wave began', async t => {
  const { room, sockets } = await setup(t, 2);
  const [a, b] = sockets;
  await send(room, a, { type: 'zdir', epoch: 1, seq: 1, d: director({ wave: 0, phase: 'prep', toSpawn: 0, left: 0 }) });
  await send(room, b, { type: 'zcmd', seq: 1, c: { c: 'start' } });
  assert.deepEqual(of(a, 'zcmd').at(-1).c, { c: 'start' });
  await send(room, a, { type: 'zdir', epoch: 1, seq: 2, d: director({ wave: 1, phase: 'wave' }) });
  await send(room, b, { type: 'zcmd', seq: 2, c: { c: 'start' } });
  assert.equal(of(a, 'zcmd').length, 1);
  assert.equal(of(b, 'error').at(-1).message, 'Đợt đầu đã bắt đầu rồi.');
});
