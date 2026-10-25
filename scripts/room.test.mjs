// node --experimental-transform-types --test scripts/room.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRoom, handleRoomSocket } from '../lib/room-service.ts';
import { RealtimeRoom } from '../lib/realtime-room.ts';
import { playerState, playerHit, hashToken, worldVersion, ACTIVE_MS, SESSION_MS } from '../lib/room-validation.ts';
import { PEER_BOUNDS, WORLD_BOUNDS, WORLD_VERSION } from '../lib/world-bounds.ts';

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
function request(body, headers = {}) {
  return new Request('https://example.test/api/room', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
async function call(rooms, body, headers) {
  const response = await handleRoom(request(body, headers), rooms);
  return { status: response.status, body: await response.json() };
}
const credentials = ({ room, id, token }) => ({ room, id, token });
const state = { x: 3, z: 5, angle: 0.2, riding: false, speed: 0, score: 75 };
function connection(room) {
  const messages = [], closes = [];
  const value = {
    socket: { send: message => messages.push(JSON.parse(message)), close: (...args) => closes.push(args) },
    seq: 0, closed: false, rateStart: Date.now(), messages: 0, queued: 0,
    timer: setTimeout(() => {}, 5_000),
  };
  room.connections.add(value);
  return { value, messages, closes };
}
async function connect(room, session) {
  const result = connection(room);
  await room.message(result.value, { type: 'auth', id: session.id, token: session.token });
  return result;
}

test('lifecycle stores hashes, rejects HTTP sync, and never exposes pending players', async t => {
  const { rooms, actors } = namespace(t);
  const created = await call(rooms, { action: 'create', name: '  Hùng  ' });
  assert.equal(created.status, 201);
  const session = created.body;
  assert.match(session.room, /^[A-Z0-9]{6}$/);
  assert.match(session.token, /^[0-9a-f]{64}$/);
  const saved = await actors.get(session.room).storage.get('room');
  assert.equal(saved.players[0].name, 'Hùng');
  assert.equal(saved.players[0].tokenHash, await hashToken(session.token));
  assert.equal(JSON.stringify(saved).includes(session.token), false);
  assert.deepEqual((await call(rooms, { action: 'join', name: 'Lan', code: session.room.toLowerCase() })).body.peers, []);
  assert.equal((await call(rooms, { action: 'sync', ...credentials(session), state })).status, 400);
});

test('concurrent room admission reserves exactly eight slots and rejects ninth', async t => {
  const { rooms } = namespace(t);
  const host = (await call(rooms, { action: 'create', name: 'Host' })).body;
  const joins = await Promise.all(Array.from({ length: 16 }, (_, index) => call(rooms, { action: 'join', name: `Player ${index}`, code: host.room })));
  assert.equal(joins.filter(result => result.status === 200).length, 7);
  assert.equal(joins.filter(result => result.status === 409).length, 9);
});

test('HTTP proxy returns mutable headers for framework response handling', async () => {
  const upstream = Response.json({ room: 'ABCDEF' }, { status: 201, headers: { 'cache-control': 'no-store' } });
  // An immutable network response is only exposed by workerd, but assert this
  // boundary owns a new response rather than forwarding the upstream object.
  const rooms = { idFromName: code => code, get: () => ({ fetch: async () => upstream }) };
  const response = await handleRoom(request({ action: 'create', name: 'Host' }), rooms);
  assert.notEqual(response, upstream);
  assert.equal(response.status, 201);
  response.headers.set('x-framework', 'vinext');
  assert.equal(response.headers.get('x-framework'), 'vinext');
  assert.equal(upstream.headers.has('x-framework'), false);
  assert.deepEqual(await response.json(), { room: 'ABCDEF' });
});

test('expired reservation is reclaimable, old session cannot overfill room, retained sessions bounded', async t => {
  let now = 2_000_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const { rooms, actors } = namespace(t);
  const host = (await call(rooms, { action: 'create', name: 'Host' })).body;
  now += ACTIVE_MS + 1;
  await Promise.all(Array.from({ length: 8 }, (_, index) => call(rooms, { action: 'join', name: `Player ${index}`, code: host.room })));
  const entry = actors.get(host.room);
  const old = await connect(entry.room, host);
  assert.equal(old.closes[0][0], 4409);
  for (let index = 0; index < 72; index++) {
    now += ACTIVE_MS + 1;
    assert.equal((await call(rooms, { action: 'join', name: `Guest ${index}`, code: host.room })).status, 200);
  }
  assert.equal(entry.room.players.size, 64);
  assert.equal((await entry.storage.get('room')).players.length, 64);
});

test('authentication, replacement, state bounds/sequence and movement do not write storage', async t => {
  const { rooms, actors } = namespace(t);
  const host = (await call(rooms, { action: 'create', name: 'Host' })).body;
  const guest = (await call(rooms, { action: 'join', name: 'Guest', code: host.room })).body;
  const entry = actors.get(host.room);
  const invalid = await connect(entry.room, { ...host, token: '0'.repeat(64) });
  assert.equal(invalid.closes[0][0], 4401);
  const first = await connect(entry.room, host);
  const second = await connect(entry.room, guest);
  const writes = entry.storage.writes;
  await entry.room.message(first.value, { type: 'state', seq: 1, state: { ...state, x: 900, z: -900, speed: 999 } });
  await entry.room.message(first.value, { type: 'state', seq: 1, state: { ...state, x: 1 } });
  await entry.room.message(second.value, { type: 'state', seq: 1, state });
  entry.room.broadcast(Date.now());
  const peers = second.messages.filter(message => message.type === 'snapshot').at(-1).peers;
  assert.equal(peers.length, 1);
  assert.equal(peers[0].id, host.id);
  assert.equal(peers[0].x, 355);
  assert.equal(peers[0].z, -206);
  assert.equal(peers[0].speed, 36);
  assert.equal(peers[0].tokenHash, undefined);
  assert.equal(entry.storage.writes, writes);
  const replacement = await connect(entry.room, host);
  assert.equal(first.closes.at(-1)[0], 4001);
  assert.equal(replacement.messages[0].type, 'ready');
  await entry.room.message(replacement.value, { type: 'state', seq: 1, state });
  assert.equal(entry.room.players.get(host.id).state.x, 3);
});

test('PvP retry has stable id, acks remove delivery, dedupe survives reconnect', async t => {
  const { rooms, actors } = namespace(t);
  const attacker = (await call(rooms, { action: 'create', name: 'Attacker' })).body;
  const target = (await call(rooms, { action: 'join', name: 'Target', code: attacker.room })).body;
  const { room } = actors.get(attacker.room);
  let source = await connect(room, attacker);
  const recipient = await connect(room, target);
  await room.message(recipient.value, { type: 'state', seq: 1, state });
  const id = crypto.randomUUID();
  const message = { type: 'hit', id, hit: { target: target.id, damage: 20, dx: 1, dz: 0 } };
  await room.message(source.value, message);
  assert.ok(source.messages.some(message => message.type === 'hitAck' && message.id === id));
  const first = recipient.messages.find(message => message.type === 'hit');
  assert.equal(first.id, `${attacker.id}:${id}`);
  room.deliverHits(Date.now() + 1000);
  assert.equal(recipient.messages.filter(message => message.type === 'hit').length, 2);
  await room.message(recipient.value, { type: 'hitAck', id: first.id });
  source = await connect(room, attacker);
  await room.message(source.value, message);
  assert.equal(room.hits.size, 0);
  assert.equal(recipient.messages.filter(message => message.type === 'hit').length, 2);
});

test('saved sessions recover after actor restart; leave is authenticated and durable', async t => {
  const { rooms, actors } = namespace(t);
  const host = (await call(rooms, { action: 'create', name: 'Host' })).body;
  const storage = actors.get(host.room).storage;
  const restored = actor(storage);
  actors.set(host.room, restored);
  await restored.room.ready;
  const socket = await connect(restored.room, host);
  assert.equal(socket.messages[0].type, 'ready');
  assert.equal(restored.room.players.get(host.id).state, undefined);
  assert.equal((await call(rooms, { action: 'leave', ...credentials(host), token: '0'.repeat(64) })).status, 401);
  assert.equal(restored.room.players.size, 1);
  assert.equal((await call(rooms, { action: 'leave', ...credentials(host) })).status, 200);
  assert.equal(restored.room.players.size, 0);
  assert.deepEqual((await storage.get('room')).players, []);
  const expired = await connect(restored.room, host);
  assert.equal(expired.closes[0][0], 4401);
});

test('new hits do not eagerly resend the entire unacknowledged queue', async t => {
  const { rooms, actors } = namespace(t);
  const attacker = (await call(rooms, { action: 'create', name: 'Attacker' })).body;
  const target = (await call(rooms, { action: 'join', name: 'Target', code: attacker.room })).body;
  const { room } = actors.get(attacker.room);
  const source = await connect(room, attacker);
  const recipient = await connect(room, target);
  await room.message(recipient.value, { type: 'state', seq: 1, state });
  for (let index = 0; index < 2; index++) {
    await room.message(source.value, { type: 'hit', id: crypto.randomUUID(), hit: { target: target.id, damage: 20, dx: 1, dz: 0 } });
  }
  const delivered = recipient.messages.filter(message => message.type === 'hit');
  assert.equal(delivered.length, 2);
  assert.equal(new Set(delivered.map(message => message.id)).size, 2);
  assert.equal(room.hits.size, 2);
});

test('alarm removes expired room and its credentials', async t => {
  let now = 2_000_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const { rooms, actors } = namespace(t);
  const host = (await call(rooms, { action: 'create', name: 'Host' })).body;
  const entry = actors.get(host.room);
  assert.equal(entry.storage.alarm, now + SESSION_MS);
  now += SESSION_MS + 1;
  await entry.room.alarm();
  assert.equal(await entry.storage.get('room'), undefined);
  assert.equal((await call(rooms, { action: 'join', code: host.room, name: 'Guest' })).status, 404);
  const expired = await connect(entry.room, host);
  assert.equal(expired.closes[0][0], 4404);
});

test('server derives bounded velocity, timestamps samples, and resets it on teleport', async t => {
  let now = 2_000_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const { rooms, actors } = namespace(t);
  const host = (await call(rooms, { action: 'create', name: 'Host' })).body;
  const { room } = actors.get(host.room);
  const socket = await connect(room, host);
  await room.message(socket.value, { type: 'state', seq: 1, state });
  now += 50;
  await room.message(socket.value, { type: 'state', seq: 2, state: { ...state, x: 4 } });
  const player = room.players.get(host.id);
  assert.equal(player.updatedAt, now);
  assert.equal(player.vx, 20);
  assert.equal(player.vz, 0);
  now += 50;
  await room.message(socket.value, { type: 'state', seq: 3, state: { ...state, x: 80 } });
  assert.equal(player.vx, 0);
  await assert.rejects(room.message(socket.value, { type: 'state', seq: 0, state }));
  assert.equal(player.state.x, 80);
});

test('HTTP rejects invalid input/origin/binding without reaching a room', async t => {
  const { rooms } = namespace(t);
  assert.equal((await call(rooms, { action: 'create', name: 'x'.repeat(19) })).status, 400);
  assert.equal((await call(rooms, { action: 'create', name: 'Minh' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(rooms, '{broken')).status, 400);
  assert.equal((await call(rooms, '[]')).status, 400);
  assert.equal((await call(rooms, ' '.repeat(4097))).status, 413);
  assert.equal((await call(rooms, {}, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call(undefined, { action: 'create', name: 'Minh' })).status, 503);
  assert.equal((await handleRoomSocket(new Request('https://example.test/api/room/socket?room=ABCDEF'), rooms)).status, 426);
  assert.equal((await handleRoomSocket(new Request('https://example.test/api/room/socket?room=ABCDEF', { headers: { upgrade: 'websocket', origin: 'https://evil.test' } }), rooms)).status, 403);
});

test('state and hit validation keep numerical bounds and reject NaN/impersonation', () => {
  assert.throws(() => playerState({ ...state, x: NaN }));
  assert.throws(() => playerState({ ...state, riding: 1 }));
  assert.throws(() => playerHit({ target: 'invalid', damage: 1, dx: 0, dz: 0 }, crypto.randomUUID()));
  const id = crypto.randomUUID();
  assert.throws(() => playerHit({ target: id, damage: 1, dx: 0, dz: 0 }, id));
  const bounded = playerState({ ...state, health: 1000, wanted: 10, weapon: 'bad', vehicle: 'bad' });
  assert.equal(bounded.health, 100);
  assert.equal(bounded.wanted, 5);
  assert.equal(bounded.weapon, 'fists');
  assert.equal(bounded.vehicle, 'foot');
});

test('peer positions are clamped to the shared world bounds, which cover the playable world with slack', () => {
  // Today's numbers: the playable rectangle x -138..352, z -203.6..137.5, accepted as x -140..355, z -206..140.
  assert.deepEqual(PEER_BOUNDS, { minX: -140, maxX: 355, minZ: -206, maxZ: 140 });
  assert.deepEqual(WORLD_BOUNDS, { minX: -138, maxX: 352, minZ: -203.6, maxZ: 137.5 });
  for (const side of ['minX', 'minZ']) assert.ok(PEER_BOUNDS[side] <= WORLD_BOUNDS[side] - 2);
  for (const side of ['maxX', 'maxZ']) assert.ok(PEER_BOUNDS[side] >= WORLD_BOUNDS[side] + 2);
  const low = playerState({ ...state, x: -1e6, z: -1e6 }), high = playerState({ ...state, x: 1e6, z: 1e6 });
  assert.deepEqual([low.x, low.z, high.x, high.z], [PEER_BOUNDS.minX, PEER_BOUNDS.minZ, PEER_BOUNDS.maxX, PEER_BOUNDS.maxZ]);
  for (const [x, z] of [[WORLD_BOUNDS.minX, WORLD_BOUNDS.minZ], [WORLD_BOUNDS.maxX, WORLD_BOUNDS.maxZ], [0, 0]]) {
    const kept = playerState({ ...state, x, z });
    assert.deepEqual([kept.x, kept.z], [x, z]);
  }
});

test('room joins carry the world version; old clients count as version 1', async t => {
  assert.equal(worldVersion(undefined), 1);
  assert.equal(worldVersion(WORLD_VERSION), WORLD_VERSION);
  for (const bad of [0, -1, 1.5, NaN, Infinity, '1', null, {}, 2_000_000]) assert.throws(() => worldVersion(bad), /bản đồ/);
  // The lifecycle accepts the field on create and join, and without it.
  const { rooms } = namespace(t);
  const host = await call(rooms, { action: 'create', name: 'Host', world: WORLD_VERSION });
  assert.equal(host.status, 201);
  assert.equal((await call(rooms, { action: 'join', name: 'Guest', code: host.body.room, world: WORLD_VERSION })).status, 200);
  assert.equal((await call(rooms, { action: 'join', name: 'Old client', code: host.body.room })).status, 200);
  // A client building another layout cannot join, and the room is left as it was.
  const newer = await call(rooms, { action: 'join', name: 'Newer', code: host.body.room, world: WORLD_VERSION + 1 });
  assert.equal(newer.status, 409);
  assert.match(newer.body.error, /phiên bản khác/);
  assert.equal((await call(rooms, { action: 'join', name: 'Bad', code: host.body.room, world: 'x' })).status, 400);
  const next = await call(rooms, { action: 'create', name: 'Next', world: WORLD_VERSION + 1 });
  assert.equal(next.status, 201);
  assert.equal((await call(rooms, { action: 'join', name: 'Current', code: next.body.room, world: WORLD_VERSION })).status, 409);
  assert.equal((await call(rooms, { action: 'join', name: 'Old client', code: next.body.room })).status, 409);
  assert.equal((await call(rooms, { action: 'join', name: 'Peer', code: next.body.room, world: WORLD_VERSION + 1 })).status, 200);
  // Rooms saved before the field existed are version 1.
  const saved = memory();
  await saved.put('room', { code: 'OLD123', createdAt: Date.now(), lastActivity: Date.now(), players: [] });
  const legacy = actor(saved);
  const legacyRooms = { idFromName: code => code, get: () => ({ fetch: request => legacy.room.fetch(request) }) };
  t.after(() => legacy.room.reset());
  assert.equal((await call(legacyRooms, { action: 'join', name: 'Old', code: 'OLD123' })).status, 200);
  assert.equal((await call(legacyRooms, { action: 'join', name: 'Newer', code: 'OLD123', world: WORLD_VERSION + 1 })).status, 409);
});
