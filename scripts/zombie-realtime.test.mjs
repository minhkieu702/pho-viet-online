// Zombie rooms over real WebSockets and the Durable Object runtime (design.md §7.1). Start the worktree dev server, then:
// TEST_BASE_URL=http://127.0.0.1:5174 node --test scripts/zombie-realtime.test.mjs
// These tests use real HTTP upgrades and the Durable Object runtime, not mocks. Also rerun scripts/realtime.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { HOST_GRACE_MS, NO_SLOT, ZOMBIE_VERSION } from '../lib/zombie-protocol.ts';

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
        if (error) reject(error); else resolve();
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
        if (error) reject(error); else resolve(value);
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
        if (error) reject(error); else resolve(value);
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

const KEY = 'AQEAAAAA', DELTA = 'AQAAAAAA';
const zstate = (extra = {}) => ({ ...initialState, zd: 0, ...extra });
const director = (over = {}) => ({ wave: 2, phase: 'wave', until: 0, left: 10, spawned: 3, toSpawn: 7, kills: 0, score: 0, best: 0, boss: [], mutants: [], stats: [], ruins: [], rng: 7, n: 2, ...over });

function fixture(t) {
  const sessions = [], sockets = [], timers = [];
  t.after(async () => {
    for (const timer of timers) clearInterval(timer);
    await Promise.allSettled(sockets.map(socket => socket.close()));
    await Promise.allSettled(sessions.map(session => room({ action: 'leave', ...credentials(session) })));
  });
  return {
    async create(name = 'Minh') {
      const result = await room({ action: 'create', name, mode: 'zombie', zv: ZOMBIE_VERSION });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      sessions.push(result.data);
      return result.data;
    },
    async join(code, name = 'Lan', zv = ZOMBIE_VERSION) {
      const result = await room({ action: 'join', code, name, zv });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      sessions.push(result.data);
      return result.data;
    },
    async connect(session, label) {
      const socket = new SocketClient(session.room, label);
      sockets.push(socket);
      await socket.open();
      socket.send({ type: 'auth', id: session.id, token: session.token });
      await socket.waitFor(m => m.type === 'ready', { label: 'ready' });
      return socket;
    },
    /** Keep a socket a host candidate: zombie-mode state at 10 Hz. */
    alive(socket) {
      let seq = 1000;
      socket.send({ type: 'state', seq: ++seq, state: zstate() });
      timers.push(setInterval(() => { if (!socket.closed && socket.socket.readyState === WebSocket.OPEN) socket.send({ type: 'state', seq: ++seq, state: zstate() }); }, 100));
    },
  };
}

test('zombie rooms on the real Durable Object: roles, relayed snapshots with serverTime, sanitized events, hits to the host, non-host frames rejected', { timeout: 20_000 }, async t => {
  const f = fixture(t);
  const a = await f.create();
  assert.deepEqual([a.mode, a.slot, a.host, a.epoch, a.ff], ['zombie', 0, a.id, 1, false]);
  const b = await f.join(a.room);
  assert.deepEqual([b.mode, b.slot, b.host, b.epoch], ['zombie', 1, a.id, 1]);
  const wrong = await room({ action: 'join', code: a.room, name: 'Cũ' });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.data.error, 'Phòng Zombie này dùng phiên bản khác. Hãy tải lại trang.');
  const first = await f.connect(a, 'host');
  const ready = first.messages.find(m => m.type === 'ready');
  assert.deepEqual([ready.mode, ready.slot], ['zombie', 0]);
  const role = await first.waitFor(m => m.type === 'zrole', { label: 'host zrole' });
  assert.deepEqual([role.host, role.slot, role.epoch, role.why], [a.id, 0, 1, 'create']);
  f.alive(first);
  const second = await f.connect(b, 'client');
  f.alive(second);
  const seen = await second.waitFor(m => m.type === 'zrole', { label: 'client zrole' });
  assert.deepEqual([seen.host, seen.epoch, seen.why], [a.id, 1, 'join']);
  assert.equal((await first.waitFor(m => m.type === 'zneed', { label: 'zneed for the newcomer' })).from, 1);
  first.send({ type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  const snap = await second.waitFor(m => m.type === 'zsnap', { label: 'relayed zsnap' });
  assert.equal(snap.b, KEY);
  assert.ok(Number.isFinite(snap.serverTime));
  first.send({ type: 'zev', epoch: 1, seq: 1, ev: [{ k: 'hit', w: 3, a: 'claw', x: 1, z: 2, yaw: 0, r: 1.2, arc: 1, dmg: 90, kb: 0, to: 2 }, { k: 'nope' }] });
  const ev = await second.waitFor(m => m.type === 'zev', { label: 'relayed zev' });
  assert.deepEqual([ev.ev.length, ev.ev[0].dmg], [1, 60]);
  const after = first.messages.length;
  second.send({ type: 'zsnap', epoch: 1, seq: 5, key: true, part: 0, parts: 1, b: KEY });
  const error = await second.waitFor(m => m.type === 'error', { label: 'non-host error' });
  assert.deepEqual([error.message, error.fatal], ['Không phải máy chủ của bầy zombie.', false]);
  second.send({ type: 'zhit', seq: 1, h: [{ w: 3, d: 20, zone: 1, k: 0, wp: 1, dx: 0, dz: 1, f: 2, sx: 3, sz: 5 }] });
  const hit = await first.waitFor(m => m.type === 'zhit', { after, label: 'zhit at the host' });
  assert.deepEqual([hit.from, hit.h[0].d], [1, 20]);
  assert.equal(first.messages.slice(after).some(m => m.type === 'zsnap'), false, 'a non-host snapshot is never relayed');
  // Friendly fire is off: a PvP hit is acknowledged and never delivered.
  second.send({ type: 'hit', id: crypto.randomUUID(), hit: { target: a.id, damage: 30, dx: 1, dz: 0 } });
  await second.waitFor(m => m.type === 'hitAck', { label: 'PvP ack' });
  await delay(300);
  assert.equal(first.messages.some(m => m.type === 'hit'), false);
  assert.equal(first.closed, null); assert.equal(second.closed, null);
});

test('the host socket closing hands the role over after the grace; a reconnect gets the caches before its zrole', { timeout: 20_000 }, async t => {
  const f = fixture(t);
  const a = await f.create();
  const b = await f.join(a.room);
  const first = await f.connect(a, 'host');
  f.alive(first);
  const second = await f.connect(b, 'client');
  f.alive(second);
  await first.waitFor(m => m.type === 'zrole');
  first.send({ type: 'zdir', epoch: 1, seq: 1, d: director() });
  first.send({ type: 'zsnap', epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: KEY });
  for (let seq = 2; seq <= 3; seq++) first.send({ type: 'zsnap', epoch: 1, seq, key: false, part: 0, parts: 1, b: DELTA });
  await second.waitFor(m => m.type === 'zsnap' && m.seq === 3, { label: 'deltas relayed' });
  const closedAt = performance.now();
  await first.close();
  const handover = await second.waitFor(m => m.type === 'zrole' && m.host === b.id, { label: 'handover', timeout: 6000 });
  const waited = performance.now() - closedAt;
  assert.deepEqual([handover.why, handover.epoch, handover.slot], ['left', 2, 1]);
  assert.ok(waited >= HOST_GRACE_MS - 100, 'handed over after ' + Math.round(waited) + ' ms (grace ' + HOST_GRACE_MS + ')');
  assert.equal((await second.waitFor(m => m.type === 'zneed', { label: 'keyframe request' })).from, NO_SLOT);
  const back = await f.connect(a, 'reconnect');
  await back.waitFor(m => m.type === 'zrole', { label: 'reconnect zrole' });
  const order = back.messages.filter(m => m.type.startsWith('z')).map(m => m.type === 'zsnap' ? 'zsnap:' + m.seq : m.type);
  assert.deepEqual(order, ['zdir', 'zsnap:1', 'zsnap:2', 'zsnap:3', 'zrole']);
  const last = back.messages.find(m => m.type === 'zrole');
  assert.deepEqual([last.host, last.epoch], [b.id, 2]);
  // The demoted host's old-epoch frames are dropped silently.
  const before = second.messages.length;
  back.send({ type: 'zsnap', epoch: 1, seq: 9, key: false, part: 0, parts: 1, b: DELTA });
  const sentAt = performance.now();
  back.send({ type: 'ping', sentAt, rtt: 30, vis: true, fps: 60 });
  await back.waitFor(m => m.type === 'pong' && m.sentAt === sentAt);
  assert.equal(back.messages.some(m => m.type === 'error'), false);
  assert.equal(second.messages.slice(before).some(m => m.type === 'zsnap'), false);
});

test('the 8-player cap is unchanged in zombie rooms; slots are 0..7', { timeout: 20_000 }, async t => {
  const f = fixture(t);
  const host = await f.create();
  const slots = [host.slot];
  for (let i = 1; i < 8; i++) slots.push((await f.join(host.room, 'Bạn ' + i)).slot);
  assert.deepEqual(slots, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal((await room({ action: 'join', code: host.room, name: 'Thứ chín', zv: ZOMBIE_VERSION })).status, 409);
});
