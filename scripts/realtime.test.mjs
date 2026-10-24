// Build and start the local Wrangler worker before running:
// node --test scripts/realtime.test.mjs
// TEST_BASE_URL may select another local port (default: http://127.0.0.1:8787).
// These tests use real HTTP upgrades and the Durable Object runtime, not mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const base = new URL(process.env.TEST_BASE_URL ?? 'http://127.0.0.1:8787');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
  'Realtime integration tests create temporary rooms and must target a local worker.');
const initialState = {
  x: 3, z: 5, angle: 0.2, riding: true, speed: 12, score: 75,
  health: 85, weapon: 'pistol', vehicle: 'scooter', down: false,
  firing: true, wanted: 2,
};

async function room(body) {
  const response = await fetch(new URL('/api/room', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { assert.fail(`Room endpoint returned non-JSON (${response.status}): ${text.slice(0, 500)}`); }
  return { status: response.status, data };
}

const credentials = ({ room, id, token }) => ({ room, id, token });

class SocketClient {
  messages = [];
  listeners = new Set();
  closed = null;

  constructor(code, label = 'socket') {
    this.label = label;
    const url = new URL('/api/room/socket', base);
    url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room', code);
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); }
      catch { message = { malformed: String(event.data) }; }
      this.messages.push({ ...message, receivedAt: performance.now() });
      for (const listener of this.listeners) listener();
    });
    this.socket.addEventListener('close', (event) => {
      this.closed = { code: event.code, reason: event.reason };
      for (const listener of this.listeners) listener();
    });
    // Avoid an unhandled event on intentionally rejected test connections.
    this.socket.addEventListener('error', () => {});
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`WebSocket upgrade timed out (${this.label})`)), 5_000);
      const opened = () => finish();
      const failed = () => finish(new Error('WebSocket upgrade rejected'));
      const finish = (error) => {
        clearTimeout(timer);
        this.socket.removeEventListener('open', opened);
        this.socket.removeEventListener('error', failed);
        this.socket.removeEventListener('close', failed);
        error ? reject(error) : resolve();
      };
      this.socket.addEventListener('open', opened);
      this.socket.addEventListener('error', failed);
      this.socket.addEventListener('close', failed);
    });
  }

  send(message) { this.socket.send(JSON.stringify(message)); }

  async waitFor(predicate, { after = 0, timeout = 5_000, label = 'socket message' } = {}) {
    const found = () => this.messages.slice(after).find(predicate);
    if (found()) return found();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${label}`)), timeout);
      const check = () => {
        const match = found();
        if (match) finish(null, match);
        else if (this.closed) finish(new Error(`Socket closed ${this.closed.code} before ${label}`));
      };
      const finish = (error, value) => {
        clearTimeout(timer);
        this.listeners.delete(check);
        error ? reject(error) : resolve(value);
      };
      this.listeners.add(check);
      check();
    });
  }

  async waitClosed(timeout = 3_000) {
    if (this.closed) return this.closed;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Socket did not close')), timeout);
      const check = () => { if (this.closed) finish(null, this.closed); };
      const finish = (error, value) => {
        clearTimeout(timer);
        this.listeners.delete(check);
        error ? reject(error) : resolve(value);
      };
      this.listeners.add(check);
      check();
    });
  }

  async close() {
    if (this.closed) return;
    this.socket.close(1000, 'integration test cleanup');
    await this.waitClosed();
  }
}

function fixture(t) {
  const sessions = [];
  const sockets = [];
  t.after(async () => {
    await Promise.allSettled(sockets.map((socket) => socket.close()));
    await Promise.allSettled(sessions.map((session) => room({ action: 'leave', ...credentials(session) })));
  });
  return {
    async create(name = 'An') {
      const result = await room({ action: 'create', name });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      sessions.push(result.data);
      return result.data;
    },
    async join(code, name = 'Bình') {
      const result = await room({ action: 'join', code, name });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      sessions.push(result.data);
      return result.data;
    },
    async raw(code, label) {
      const socket = new SocketClient(code, label);
      sockets.push(socket);
      await socket.open();
      return socket;
    },
    async connect(session) {
      const socket = await this.raw(session.room);
      socket.send({ type: 'auth', id: session.id, token: session.token });
      const ready = await socket.waitFor((message) => message.type === 'ready', { label: 'authentication' });
      assert.equal(ready.id, session.id);
      assert.ok(Number.isFinite(ready.serverTime));
      return socket;
    },
    async pair() {
      const a = await this.create();
      const b = await this.join(a.room);
      const first = await this.connect(a);
      const second = await this.connect(b);
      return { a, b, first, second };
    },
  };
}

const peerSnapshot = (id, predicate = () => true) => (message) =>
  message.type === 'snapshot' && message.peers.some((peer) => peer.id === id && predicate(peer));

test('HTTP sessions and real WebSocket snapshots synchronize player metadata without leaking secrets', { timeout: 20_000 }, async (t) => {
  const f = fixture(t);
  const { a, b, first, second } = await f.pair();
  first.send({ type: 'state', seq: 1, state: initialState });
  const snapshot = await second.waitFor(peerSnapshot(a.id, (peer) => peer.score === initialState.score));
  assert.ok(Number.isSafeInteger(snapshot.seq));
  assert.ok(Number.isFinite(snapshot.serverTime));
  assert.equal(snapshot.peers.some((peer) => peer.id === b.id), false, 'snapshots must exclude the recipient');
  const peer = snapshot.peers.find((item) => item.id === a.id);
  for (const [key, value] of Object.entries(initialState)) {
    if (key === 'angle') assert.ok(Math.abs(peer.angle - value) < 1e-8);
    else assert.equal(peer[key], value, key);
  }
  assert.equal(peer.name, 'An');
  assert.equal(typeof peer.color, 'string');
  assert.ok(Number.isFinite(peer.updatedAt));
  assert.ok(Number.isFinite(peer.vx) && Number.isFinite(peer.vz));
  assert.equal(JSON.stringify(snapshot).includes(a.token), false);
  assert.equal(JSON.stringify(snapshot).includes(b.token), false);
  assert.equal(peer.token, undefined);
  assert.equal(peer.tokenHash, undefined);

  second.send({ type: 'state', seq: 1, state: { ...initialState, x: -9, score: 150 } });
  await first.waitFor(peerSnapshot(b.id, (item) => item.x === -9 && item.score === 150));
  const sentAt = performance.now();
  first.send({ type: 'ping', sentAt });
  const pong = await first.waitFor((message) => message.type === 'pong' && message.sentAt === sentAt);
  assert.ok(Number.isFinite(pong.serverTime));
});

test('stale or malformed state cannot overwrite the last accepted state; coordinates are bounded', { timeout: 20_000 }, async (t) => {
  const { a, first, second } = await fixture(t).pair();
  first.send({ type: 'state', seq: 2, state: { ...initialState, x: 10000, z: -10000, speed: 999 } });
  await second.waitFor(peerSnapshot(a.id, (peer) => peer.x === 355 && peer.z === -206 && peer.speed === 36));
  const after = second.messages.length;
  first.send({ type: 'state', seq: 1, state: { ...initialState, x: -25 } });
  first.send({ type: 'state', seq: 2, state: { ...initialState, x: -26 } });
  first.send({ type: 'state', seq: 3, state: { ...initialState, x: 'invalid' } });
  await delay(180);
  for (const message of second.messages.slice(after).filter((item) => item.type === 'snapshot')) {
    const peer = message.peers.find((item) => item.id === a.id);
    if (peer) assert.equal(peer.x, 355);
  }
  first.send({ type: 'state', seq: 4, state: { ...initialState, x: 20 } });
  await second.waitFor(peerSnapshot(a.id, (peer) => peer.x === 20), { after });
});

test('untrusted sockets cannot impersonate another session or read a different room', { timeout: 20_000 }, async (t) => {
  const f = fixture(t);
  const a = await f.create('Phòng A');
  const other = await f.create('Phòng B');
  const first = await f.connect(a);
  const otherSocket = await f.connect(other);
  const invalid = await f.raw(a.room);
  invalid.send({ type: 'auth', id: a.id, token: '0'.repeat(64) });
  assert.equal((await invalid.waitClosed()).code, 4401);
  assert.equal(invalid.messages.some((message) => message.type === 'snapshot'), false);
  const crossRoom = await f.raw(other.room);
  crossRoom.send({ type: 'auth', id: a.id, token: a.token });
  assert.equal((await crossRoom.waitClosed()).code, 4401);
  // The generator never emits 0, so this valid-format room cannot exist.
  const missingRoom = await f.raw('000000');
  missingRoom.send({ type: 'auth', id: a.id, token: a.token });
  assert.equal((await missingRoom.waitClosed()).code, 4404);
  const after = otherSocket.messages.length;
  first.send({ type: 'state', seq: 1, state: initialState });
  otherSocket.send({ type: 'state', seq: 1, state: initialState });
  const snapshot = await otherSocket.waitFor((message) => message.type === 'snapshot', { after });
  assert.deepEqual(snapshot.peers, []);
  assert.equal(first.closed, null, 'failed authentication must not replace the real player');
});

test('reconnect replaces the old socket, accepts a new sequence, and preserves the session', { timeout: 20_000 }, async (t) => {
  const f = fixture(t);
  const { a, first, second } = await f.pair();
  first.send({ type: 'state', seq: 99, state: { ...initialState, x: 10 } });
  await second.waitFor(peerSnapshot(a.id, (peer) => peer.x === 10));
  const replacement = await f.connect(a);
  assert.equal((await first.waitClosed()).code, 4001);
  replacement.send({ type: 'state', seq: 1, state: { ...initialState, x: 30 } });
  await second.waitFor(peerSnapshot(a.id, (peer) => peer.x === 30));
  await replacement.close();
  const reconnect = await f.connect(a);
  reconnect.send({ type: 'state', seq: 1, state: { ...initialState, x: 40 } });
  const snapshot = await second.waitFor(peerSnapshot(a.id, (peer) => peer.x === 40));
  assert.equal(snapshot.peers.filter((peer) => peer.id === a.id).length, 1);
});

test('malformed, oversized and binary socket frames are rejected', { timeout: 20_000 }, async (t) => {
  const f = fixture(t);
  const session = await f.create();
  const malformed = await f.raw(session.room, 'invalid JSON test');
  malformed.socket.send('{broken');
  assert.equal((await malformed.waitClosed()).code, 4403);
  const oversized = await f.raw(session.room, 'oversized frame test');
  oversized.socket.send('x'.repeat(4097));
  assert.equal((await oversized.waitClosed()).code, 1009);
  const binary = await f.raw(session.room, 'binary frame test');
  binary.socket.send(new Uint8Array([1, 2, 3]));
  assert.equal((await binary.waitClosed()).code, 1003);
  await f.connect(session);
});

test('cross-origin room writes are blocked without revoking the session', { timeout: 20_000 }, async (t) => {
  const f = fixture(t);
  const session = await f.create();
  const body = JSON.stringify({ action: 'leave', ...credentials(session) });
  // Isolate this deliberately rejected request from Node's shared fetch/WS pool.
  const status = await new Promise((resolve, reject) => {
    const request = (base.protocol === 'https:' ? httpsRequest : httpRequest)(new URL('/api/room', base), {
      method: 'POST', agent: false, signal: AbortSignal.timeout(5_000),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Origin: 'https://unrelated.invalid' },
    }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
      response.once('error', reject);
    });
    request.once('error', reject);
    request.end(body);
  });
  assert.equal(status, 403);
  await f.connect(session);
});

test('eight reservations enforce room capacity and leave revokes access and releases a slot', { timeout: 25_000 }, async (t) => {
  const f = fixture(t);
  const host = await f.create();
  const observer = await f.connect(host);
  const sessions = [host];
  const sockets = [observer];
  for (let i = 1; i < 8; i++) sessions.push(await f.join(host.room, `Bạn ${i}`));
  assert.equal((await room({ action: 'join', code: host.room, name: 'Thứ chín' })).status, 409);
  for (const session of sessions.slice(1)) sockets.push(await f.connect(session));
  for (const socket of sockets) socket.send({ type: 'state', seq: 1, state: initialState });
  await observer.waitFor((message) => message.type === 'snapshot' && message.peers.length === 7);
  const after = observer.messages.length;
  const departing = sessions[7];
  assert.equal((await room({ action: 'leave', ...credentials(departing) })).status, 200);
  await sockets[7].waitClosed();
  await observer.waitFor((message) => message.type === 'snapshot' && message.peers.length === 6
    && !message.peers.some((peer) => peer.id === departing.id), { after });
  const replacement = await f.join(host.room, 'Người mới');
  const replacementSocket = await f.connect(replacement);
  replacementSocket.send({ type: 'state', seq: 1, state: initialState });
  const revoked = await f.raw(host.room);
  revoked.send({ type: 'auth', id: departing.id, token: departing.token });
  assert.equal((await revoked.waitClosed()).code, 4401);
  const snapshot = await observer.waitFor(peerSnapshot(replacement.id));
  assert.equal(snapshot.peers.length, 7);
});

test('combat retries use stable IDs and acknowledgements prevent duplicate delivery', { timeout: 20_000 }, async (t) => {
  const { b, first, second } = await fixture(t).pair();
  second.send({ type: 'state', seq: 1, state: initialState });
  await first.waitFor(peerSnapshot(b.id));
  const id = randomUUID();
  const outgoing = { type: 'hit', id, hit: { target: b.id, damage: 10, dx: 1, dz: 0 } };
  first.send(outgoing);
  await first.waitFor((message) => message.type === 'hitAck' && message.id === id);
  const delivered = await second.waitFor((message) => message.type === 'hit');
  assert.equal(delivered.hit.damage, 10);
  assert.equal(delivered.hit.name, 'An');
  const afterFirst = second.messages.length;
  const retry = await second.waitFor((message) => message.type === 'hit' && message.id === delivered.id,
    { after: afterFirst, label: 'unacknowledged hit retry' });
  assert.deepEqual(retry.hit, delivered.hit);
  second.send({ type: 'hitAck', id: delivered.id });
  // A ping response establishes that the target ACK was already processed.
  const sentAt = performance.now();
  second.send({ type: 'ping', sentAt });
  await second.waitFor((message) => message.type === 'pong' && message.sentAt === sentAt);
  const afterAck = second.messages.length;
  const afterSender = first.messages.length;
  first.send(outgoing);
  await first.waitFor((message) => message.type === 'hitAck' && message.id === id, { after: afterSender });
  await delay(1_100);
  assert.equal(second.messages.slice(afterAck).filter((message) => message.type === 'hit').length, 0,
    'resending the same attack after receiver ACK must not inflict damage twice');
});

test('frequent input is coalesced into bounded room snapshots instead of broadcast per message', { timeout: 20_000 }, async (t) => {
  const { a, first, second } = await fixture(t).pair();
  first.send({ type: 'state', seq: 1, state: initialState });
  await second.waitFor(peerSnapshot(a.id, (peer) => peer.score === initialState.score));
  const after = second.messages.length;
  const started = performance.now();
  for (let seq = 2; seq <= 101; seq++) {
    first.send({ type: 'state', seq, state: { ...initialState, x: seq / 2, score: seq } });
    await delay(5);
  }
  await second.waitFor(peerSnapshot(a.id, (peer) => peer.score === 101), { after });
  const elapsed = performance.now() - started;
  const snapshots = second.messages.slice(after).filter((message) => message.type === 'snapshot');
  assert.ok(snapshots.length >= 2, 'movement should produce ongoing snapshots');
  assert.ok(snapshots.length <= Math.ceil(elapsed / 50) + 4,
    `${snapshots.length} snapshots in ${Math.round(elapsed)} ms exceeds the 20 Hz room budget`);
  for (let i = 1; i < snapshots.length; i++) {
    assert.ok(snapshots[i].seq > snapshots[i - 1].seq, 'snapshot sequence must increase');
    assert.ok(snapshots[i].serverTime >= snapshots[i - 1].serverTime);
  }
});

test('disconnect grace reserves a slot, then releases it without evicting active players', { timeout: 30_000 }, async (t) => {
  const f = fixture(t);
  const host = await f.create();
  const sessions = [host];
  for (let i = 1; i < 8; i++) sessions.push(await f.join(host.room, `Giữ chỗ ${i}`));
  const sockets = [];
  for (const session of sessions) sockets.push(await f.connect(session));
  const keepalive = setInterval(() => {
    for (const socket of sockets) {
      if (socket.socket.readyState === WebSocket.OPEN) socket.send({ type: 'ping', sentAt: performance.now() });
    }
  }, 2_000);
  t.after(() => clearInterval(keepalive));
  await sockets[7].close();
  assert.equal((await room({ action: 'join', code: host.room, name: 'Trong hạn' })).status, 409);
  await delay(16_000);
  const replacement = await f.join(host.room, 'Sau hết hạn');
  const reclaimer = await f.raw(host.room);
  reclaimer.send({ type: 'auth', id: sessions[7].id, token: sessions[7].token });
  assert.equal((await reclaimer.waitClosed()).code, 4409, 'an expired reservation cannot displace a new slot');
  const replacementSocket = await f.connect(replacement);
  replacementSocket.send({ type: 'state', seq: 1, state: initialState });
  await sockets[0].waitFor(peerSnapshot(replacement.id));
  assert.equal(sockets.slice(0, 7).some((socket) => socket.closed), false);
});
