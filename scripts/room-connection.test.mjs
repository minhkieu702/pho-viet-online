import test from 'node:test';
import assert from 'node:assert/strict';
import { connectRoom } from '../app/game/room-connection.ts';

const session = { room: 'ABC234', id: 'player-one', token: 'private-token' };
const initialState = { x: 0, z: 1, angle: 0, riding: false, speed: 0, score: 0 };

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const sockets = [], statuses = [], snapshots = [], damage = [], fatal = [], latency = [];
  let state = { ...initialState }, queued = [], nextId = 0;
  const connection = connectRoom(session, 'https://game.example/', {
    getState: () => state,
    takeHits: () => queued.splice(0),
    onPeers: (peers, time) => snapshots.push({ peers, time }),
    onHits: hits => damage.push(...hits),
    onStatus: status => statuses.push(status),
    onLatency: value => latency.push(value),
    onFatal: message => fatal.push(message),
  }, {
    now: Date.now, random: () => 0, makeId: () => `hit-${++nextId}`,
    createSocket(url) {
      const socket = {
        url, readyState: 0, bufferedAmount: 0, sent: [], closed: false,
        onopen: null, onmessage: null, onclose: null, onerror: null,
        send(text) { this.sent.push(JSON.parse(text)); },
        close() { this.closed = true; this.readyState = 3; },
        open() { this.readyState = 1; this.onopen?.(); },
        message(data) { this.onmessage?.({ data: JSON.stringify(data) }); },
        drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); },
      };
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => { connection.dispose(); t.mock.timers.reset(); });
  const ready = (socket = sockets.at(-1)) => {
    socket.open();
    socket.message({ type: 'ready', id: session.id, serverTime: 50_000 });
    return socket;
  };
  return {
    sockets, statuses, snapshots, damage, fatal, latency, ready, connection,
    advance: ms => t.mock.timers.tick(ms),
    state: value => { state = value; },
    hit: hit => queued.push(hit),
  };
}

test('auth stays out of the URL; state waits for ready and sends at 20 Hz', t => {
  const h = setup(t), socket = h.sockets[0];
  assert.equal(socket.url, 'wss://game.example/api/room/socket?room=ABC234');
  h.advance(200);
  assert.deepEqual(socket.sent, []);
  socket.open();
  assert.deepEqual(socket.sent, [{ type: 'auth', id: session.id, token: session.token }]);
  h.advance(200);
  assert.equal(socket.sent.length, 1);
  socket.message({ type: 'ready', id: session.id, serverTime: 50_000 });
  for (let i = 0; i < 20; i++) h.advance(50);
  const states = socket.sent.filter(m => m.type === 'state');
  assert.equal(states.length, 20);
  assert.deepEqual(states.at(-1).state, initialState);
  assert.equal(states.at(-1).seq, 20);
});

test('backpressure drops obsolete movement and resumes with the current state', t => {
  const h = setup(t), socket = h.ready();
  socket.bufferedAmount = 40_000;
  for (let i = 0; i < 10; i++) { h.state({ ...initialState, x: i }); h.advance(50); }
  assert.equal(socket.sent.filter(m => m.type === 'state').length, 0);
  socket.bufferedAmount = 0;
  h.advance(50);
  assert.equal(socket.sent.filter(m => m.type === 'state').length, 1);
  assert.equal(socket.sent.at(-2).state.x, 9);
});

test('temporary disconnect reconnects with the same session and resets snapshot ordering', t => {
  const h = setup(t), first = h.ready();
  first.message({ type: 'snapshot', seq: 100, serverTime: 50000, peers: [] });
  first.message({ type: 'snapshot', seq: 99, serverTime: 49999, peers: [] });
  assert.equal(h.snapshots.length, 1);
  first.drop();
  assert.equal(h.statuses.at(-1), 'reconnecting');
  h.advance(500);
  const second = h.ready();
  assert.notEqual(second, first);
  second.message({ type: 'snapshot', seq: 1, serverTime: 51000, peers: [] });
  assert.equal(h.snapshots.at(-1).time, 51000);
  assert.equal(h.statuses.at(-1), 'connected');
});

test('hits survive reconnect until acknowledged; incoming retries apply damage once', t => {
  const h = setup(t), first = h.ready();
  h.hit({ target: 'other', damage: 10, dx: 1, dz: 0 });
  h.advance(50);
  const sent = first.sent.find(m => m.type === 'hit');
  assert.ok(sent);
  first.drop();
  h.advance(500);
  const second = h.ready();
  h.advance(50);
  assert.deepEqual(second.sent.find(m => m.type === 'hit'), sent);
  second.message({ type: 'hitAck', id: sent.id });
  for (let i = 0; i < 20; i++) h.advance(50);
  assert.equal(second.sent.filter(m => m.type === 'hit').length, 1);
  const incoming = { type: 'hit', id: 'incoming-1', hit: { attacker: 'other', name: 'Lan', damage: 10, dx: 1, dz: 0 } };
  second.message(incoming);
  second.message(incoming);
  assert.equal(h.damage.length, 1);
  assert.equal(second.sent.filter(m => m.type === 'hitAck').length, 2);
});

test('stale offline hits expire; unresponsive sockets recover without retrying forever in place', t => {
  const h = setup(t), first = h.ready();
  h.hit({ target: 'other', damage: 10, dx: 0, dz: 0 });
  for (let i = 0; i < 202; i++) h.advance(50);
  assert.equal(first.closed, true);
  h.advance(500);
  const second = h.ready();
  h.advance(50);
  assert.equal(second.sent.filter(m => m.type === 'hit').length, 0);
});

test('fatal auth and dispose cancel reconnects and stop all callbacks', t => {
  const h = setup(t), first = h.ready();
  first.drop(4401);
  assert.equal(h.fatal.length, 1);
  h.advance(20000);
  assert.equal(h.sockets.length, 1);
  assert.equal(first.closed, true);
});

test('ping reports round trip time only for an outstanding ping', t => {
  const h = setup(t), socket = h.ready();
  h.advance(50);
  const ping = socket.sent.find(m => m.type === 'ping');
  h.advance(75);
  socket.message({ type: 'pong', sentAt: ping.sentAt, serverTime: 50000 });
  socket.message({ type: 'pong', sentAt: ping.sentAt, serverTime: 50000 });
  assert.deepEqual(h.latency, [75]);
});

test('reconnect backlog is throttled instead of flooding the room', t => {
  const h = setup(t), first = h.ready();
  first.drop();
  for (let i = 0; i < 128; i++) h.hit({ target: 'other', damage: 1, dx: 0, dz: 0 });
  h.advance(500);
  const second = h.ready();
  for (let i = 0; i < 20; i++) h.advance(50);
  const hits = second.sent.filter(m => m.type === 'hit');
  assert.ok(hits.length >= 20 && hits.length <= 28, `bounded hit rate, got ${hits.length}`);
  assert.equal(second.sent.filter(m => m.type === 'state').length, 20);
});
