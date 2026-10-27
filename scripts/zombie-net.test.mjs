// node --experimental-transform-types --test scripts/zombie-net.test.mjs
// The co-op zombie snapshot codec, puppet mirror, interpolation, migration and outgoing frame packing (design.md §1.4–§1.10, §7.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZombieNet, decodeSnapshot, encodeSnapshot, isZombieId, zombieId, ZM } from '../app/game/zombie-net.ts';
import {
  BLAST_ID, MAX_EVENTS, MAX_FRAME_BYTES, MAX_HITS, MAX_SNAP_CHARS, MAX_SNAP_PARTS, MUTANT_ID_BASE, NO_SLOT, OMEN_ID,
  ZOMBIE_DELAY_MS, ZOMBIE_KEY_MS,
} from '../lib/zombie-protocol.ts';

const SERVER = 1_700_000_000_000;
function rng(seed = 7) { return () => ((seed = Math.imul(seed ^ seed >>> 15, 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 4294967296; }
function zombie(i, random, extra = {}) {
  return {
    id: zombieId(i, 0), kind: i % 11, state: 2 + i % 3, look: i * 7 % 256, x: (random() - 0.5) * 400, z: (random() - 0.5) * 300, y: random() * 4,
    yaw: (random() - 0.5) * Math.PI * 2, hp: random(), pace: random() * 6, flags: i % 256, target: i % 2 ? NO_SLOT : (i % 8) | 16, prog: Math.floor(random() * 8), ...extra,
  };
}
const mutant = (i, random) => ({ i, kind: i % 3, phase: i + 1, attack: i === 0 ? -1 : i * 3, x: random() * 200, z: -random() * 100, y: random() * 12, yaw: 1.2, prog: 128 + i, hp: 52_000 - i, max: 65_000, weak: 5, target: 3, flags: 17 });

/** A host and a client wired through a fake room (the relay adds serverTime, like the Durable Object). */
function pair(t0 = 0) {
  const clock = { t: t0 };
  const host = createZombieNet({ selfSlot: 0, selfId: 'host', now: () => clock.t });
  const client = createZombieNet({ selfSlot: 1, selfId: 'client', now: () => clock.t });
  const role = { type: 'zrole', host: 'host', slot: 0, epoch: 1, why: 'create' };
  assert.equal(host.onRole(role, 'host'), 'promoted');
  assert.equal(client.onRole(role, 'client'), 'same');
  const wire = { up: [], bytes: 0 };
  const relay = (budget = 64 * 1024) => {
    const frames = host.takeOutgoing(budget);
    for (const m of frames) {
      const text = JSON.stringify(m);
      assert.ok(text.length <= MAX_FRAME_BYTES, `${m.type} frame of ${text.length} bytes`);
      wire.up.push(m); wire.bytes += text.length;
      if (m.type === 'zsnap' || m.type === 'zdir' || m.type === 'zev') client.receive({ ...m, serverTime: SERVER + clock.t });
    }
    return frames;
  };
  return { clock, host, client, relay, wire };
}

test('keyframe codec round trip stays within quantisation; NaN and out-of-range values are clamped', () => {
  const random = rng(1);
  const zombies = Array.from({ length: 128 }, (_, i) => zombie(i, random));
  zombies[3].x = NaN; zombies[4].x = 2047; zombies[5].z = -2047; zombies[6].x = 5000; zombies[7].z = -9e9; zombies[8].hp = NaN; zombies[9].pace = 99;
  const mutants = Array.from({ length: 4 }, (_, i) => mutant(i, random));
  const parts = encodeSnapshot(zombies, 128, mutants, 4, true, null, () => true);
  assert.equal(parts.length, 1, 'a full keyframe fits one part');
  assert.ok(parts[0].length <= MAX_SNAP_CHARS);
  assert.equal(parts[0].length, Math.ceil((6 + 128 * 14 + 4 * 20) / 3) * 4, '6 + 1792 + 80 bytes');
  const decoded = decodeSnapshot(parts[0]);
  assert.equal(decoded.key, true);
  assert.equal(decoded.zombies.length, 128);
  for (const [i, z] of decoded.zombies.entries()) {
    const src = zombies[i];
    assert.equal(z.id, src.id); assert.equal(z.kind, src.kind); assert.equal(z.state, src.state); assert.equal(z.look, src.look);
    assert.equal(z.mask & ZM.KEY, ZM.KEY);
    for (const key of ['x', 'z', 'y', 'yaw', 'hp', 'pace', 'prog']) assert.ok(Number.isFinite(z[key]), `${key} finite`);
    if (i === 3) assert.equal(z.x, 0, 'NaN encodes as 0');
    else if (i === 6) assert.ok(Math.abs(z.x - 32767 / 16) < 1e-9, 'beyond ±2047 m clamps');
    else assert.ok(Math.abs(z.x - src.x) <= 1 / 32 + 1e-9, `x ${z.x} vs ${src.x}`);
    if (i === 7) assert.ok(Math.abs(z.z + 32767 / 16) < 1e-9);
    else assert.ok(Math.abs(z.z - src.z) <= 1 / 32 + 1e-9);
    const dyaw = Math.atan2(Math.sin(z.yaw - src.yaw), Math.cos(z.yaw - src.yaw));
    assert.ok(Math.abs(dyaw) <= Math.PI / 256 + 1e-9, `yaw ${z.yaw} vs ${src.yaw}`);
    if (i === 8) assert.equal(z.hp, 0); else assert.ok(Math.abs(z.hp - src.hp) <= 1 / 510 + 1e-9);
    if (i === 9) assert.equal(z.pace, 255 / 16); else assert.ok(Math.abs(z.pace - src.pace) <= 1 / 32 + 1e-9);
    assert.equal(z.target, src.target); assert.equal(z.flags, src.flags);
    assert.equal(z.prog, src.prog, 'prog is a raw 0..7 integer');
    assert.ok(Math.abs(z.y - src.y) <= 1 / 16 + 1e-9);
  }
  assert.ok(Math.abs(decoded.zombies[4].x - 2047) < 1 / 16, '+2047 m encodes');
  assert.ok(Math.abs(decoded.zombies[5].z + 2047) < 1 / 16, '-2047 m encodes');
  assert.equal(decoded.mutants.length, 4);
  for (const [i, m] of decoded.mutants.entries()) {
    assert.equal(m.i, i); assert.equal(m.kind, mutants[i].kind); assert.equal(m.phase, mutants[i].phase); assert.equal(m.attack, mutants[i].attack);
    assert.equal(m.hp, mutants[i].hp); assert.equal(m.max, 65_000); assert.equal(m.prog, 128 + i); assert.equal(m.weak, 5); assert.equal(m.target, 3); assert.equal(m.flags, 17);
    assert.ok(Math.abs(m.x - mutants[i].x) <= 1 / 32 + 1e-9 && Math.abs(m.y - mutants[i].y) <= 1 / 32 + 1e-9);
  }
});

test('deltas carry only changed fields; REMOVED and NEW masks; a new generation in a slot is fresh', () => {
  const random = rng(2);
  const zombies = Array.from({ length: 10 }, (_, i) => zombie(i, random));
  const prev = new Map(zombies.map(z => [z.id, { ...z }]));
  const next = zombies.map(z => ({ ...z }));
  next[1].x += 0.5;                       // POSE
  next[2].state = 7; next[2].flags = 1;    // STATE
  next[3].hp -= 0.25;                      // HP
  next[4].x += 0.01;                       // under one quantum: unchanged
  next[5] = { ...zombie(5, random), id: zombieId(5, 1) }; // a new generation in slot 5
  next[6].state = 0;                       // went off: REMOVED
  const parts = encodeSnapshot(next, 10, [], 0, false, prev, () => true);
  const { zombies: records, key } = decodeSnapshot(parts[0]);
  assert.equal(key, false);
  const byId = new Map(records.map(r => [r.id, r]));
  assert.equal(byId.get(next[1].id).mask, ZM.POSE);
  assert.equal(byId.get(next[2].id).mask, ZM.STATE);
  assert.equal(byId.get(next[2].id).state, 7);
  assert.equal(byId.get(next[3].id).mask, ZM.HP);
  assert.equal(byId.has(next[4].id), false);
  assert.equal(byId.has(next[0].id), false, 'unchanged zombies are omitted');
  assert.equal(byId.get(next[5].id).mask & ZM.NEW, ZM.NEW);
  assert.equal(byId.has(zombies[5].id), false, 'the old occupant of a NEW slot is removed implicitly');
  assert.equal(byId.get(zombies[6].id).mask, ZM.REMOVED);
  assert.equal(records.length, 5);

  // On a client the NEW generation is delivered fresh and the old occupant is gone.
  const { host, client, relay, clock } = pair();
  host.publish(zombies, 10, [], 0, [{ x: 0, z: 0 }], clock.t); relay();
  const first = new Map();
  client.samplePuppets(client.serverNow(), (z, fresh) => first.set(z.id, fresh));
  assert.equal(first.size, 10);
  assert.ok([...first.values()].every(Boolean), 'new puppets are fresh once');
  clock.t += 100;
  host.publish(next, 10, [], 0, [{ x: 0, z: 0 }], clock.t); relay();
  const seen = new Map();
  client.samplePuppets(client.serverNow(), (z, fresh) => seen.set(z.id, fresh));
  assert.equal(seen.get(next[5].id), true);
  assert.equal(seen.has(zombies[5].id), false);
  assert.equal(seen.has(zombies[6].id), false);
  assert.equal(seen.get(next[1].id), false);
  assert.equal(seen.size, 9);
});

test('snapshots too big for one part split into at most four, and keyframe removals wait for every part', () => {
  const random = rng(3);
  const many = Array.from({ length: 400 }, (_, i) => zombie(i % 128, random, { id: i }));
  const parts = encodeSnapshot(many, 400, [mutant(0, random)], 1, true, null, () => true);
  assert.ok(parts.length > 1 && parts.length <= MAX_SNAP_PARTS, `${parts.length} parts`);
  let total = 0;
  for (const [i, b] of parts.entries()) {
    assert.ok(b.length <= MAX_SNAP_CHARS);
    const decoded = decodeSnapshot(b);
    assert.equal(decoded.hasMutants, i === 0, 'mutants ride in part 0 only');
    total += decoded.zombies.length;
  }
  assert.equal(total, 400);

  // A client that receives only the first part of a two-part keyframe keeps zombies it already had, then asks for a keyframe.
  const clock = { t: 0 };
  const client = createZombieNet({ selfSlot: 1, selfId: 'c', now: () => clock.t });
  client.onRole({ type: 'zrole', host: 'h', slot: 0, epoch: 1, why: 'join' }, 'c');
  const lone = zombieId(127, 3);
  const old = encodeSnapshot([zombie(100, random, { id: lone })], 1, [], 0, true, null, () => true);
  client.receive({ type: 'zsnap', serverTime: SERVER, epoch: 1, seq: 1, key: true, part: 0, parts: 1, b: old[0] });
  // One slot holds one zombie, so a real keyframe always fits one part: build a two-part one from two halves.
  const fleet = Array.from({ length: 120 }, (_, i) => zombie(i, random));
  const two = [encodeSnapshot(fleet.slice(0, 60), 60, [], 0, true, null, () => true)[0], encodeSnapshot(fleet.slice(60), 60, [], 0, true, null, () => true)[0]];
  client.receive({ type: 'zsnap', serverTime: SERVER + 100, epoch: 1, seq: 2, key: true, part: 0, parts: 2, b: two[0] });
  let ids = new Set(); client.samplePuppets(SERVER + 100, z => ids.add(z.id));
  assert.equal(ids.has(lone), true, 'not removed before the last part');
  clock.t = 400; assert.equal(client.takeOutgoing(8000).length, 0);
  clock.t = 650;
  assert.deepEqual(client.takeOutgoing(8000), [{ type: 'zneed' }], '500 ms without the last part → zneed');
  clock.t = 700; assert.equal(client.takeOutgoing(8000).length, 0, 'at most one zneed per second');
  // When both parts arrive, absent zombies go.
  client.receive({ type: 'zsnap', serverTime: SERVER + 800, epoch: 1, seq: 3, key: true, part: 0, parts: 2, b: two[0] });
  client.receive({ type: 'zsnap', serverTime: SERVER + 800, epoch: 1, seq: 3, key: true, part: 1, parts: 2, b: two[1] });
  ids = new Set(); client.samplePuppets(SERVER + 800, z => ids.add(z.id));
  assert.equal(ids.has(lone), false);
  assert.equal(ids.size, 120);
});

test('interest tiers: near every delta, 50-110 m every 2nd, beyond 110 m every 10th; keyframes carry everyone', () => {
  const { host, clock, relay, wire } = pair();
  const near = zombie(1, rng(4), { x: 10, z: 0, state: 3 }), mid = zombie(2, rng(4), { x: 80, z: 0, state: 3 }), far = zombie(3, rng(4), { x: 300, z: 0, state: 3 });
  const list = [near, mid, far];
  const counts = new Map(list.map(z => [z.id, 0]));
  for (let tick = 0; tick < 40; tick++) {
    for (const z of list) z.x += 0.3;
    host.publish(list, 3, [], 0, [{ x: 0, z: 0 }], clock.t);
    for (const m of relay()) if (m.type === 'zsnap' && !m.key) for (const r of decodeSnapshot(m.b).zombies) counts.set(r.id, counts.get(r.id) + 1);
    clock.t += 100;
  }
  const keys = wire.up.filter(m => m.type === 'zsnap' && m.key).length;
  assert.equal(keys, 2, 'a keyframe at the start and after 2 s');
  const deltas = wire.up.filter(m => m.type === 'zsnap' && !m.key).length;
  assert.equal(deltas, 38);
  assert.equal(counts.get(near.id), 38);
  assert.ok(Math.abs(counts.get(mid.id) - 19) <= 1, `mid ${counts.get(mid.id)}`);
  assert.ok(Math.abs(counts.get(far.id) - 4) <= 1, `far ${counts.get(far.id)}`);
  // Snapshots go out at 10 Hz even when nothing changed (the room's stall detector needs them).
  const before = wire.up.length;
  for (let i = 0; i < 10; i++) { host.publish(list, 3, [], 0, [{ x: 0, z: 0 }], clock.t); relay(); clock.t += 100; }
  assert.equal(wire.up.length - before, 10);
});

test('puppets interpolate between samples, extrapolate at most 150 ms (longer for sparse tiers) and step state at sample time', () => {
  const { host, client, clock, relay } = pair();
  const z = zombie(1, rng(5), { x: 0, z: 0, yaw: 0, pace: 2.5, state: 3 });
  for (let i = 0; i < 5; i++) {
    z.z = i * 0.25; if (i === 3) z.state = 6;
    host.publish([z], 1, [], 0, [{ x: 0, z: 0 }], clock.t); relay(); clock.t += 100;
  }
  const at = time => { let out; client.samplePuppets(time, p => { out = { ...p }; }); return out; };
  // Samples at SERVER + 0, 100, ..., 400 with z = 0, 0.25, ..., 1 (exact in 1/16 m).
  assert.ok(Math.abs(at(SERVER + 150).z - 0.375) < 1e-6);
  assert.equal(at(SERVER + 250).state, 3, 'state of the sample before');
  assert.equal(at(SERVER + 300).state, 6, 'steps exactly at its sample time');
  assert.ok(Math.abs(at(SERVER + 450).z - 1.125) < 1e-6, 'extrapolated along the observed motion, 2.5 m/s');
  assert.ok(Math.abs(at(SERVER + 550).z - 1.375) < 1e-6, 'up to 150 ms (the sample spacing, at least ZOMBIE_EXTRAPOLATE_MS)');
  assert.ok(Math.abs(at(SERVER + 2000).z - 1.375) < 1e-6, 'then held');
  assert.ok(Math.abs(at(SERVER - 500).z) < 1e-6, 'before the first sample: the first sample');
  // A zombie pushing against a wall (pace without progress) sends nothing for a while: no drift, and no slow glide afterwards.
  const { host: hw, client: cw, clock: kw, relay: rw } = pair();
  const wall = zombie(2, rng(5), { x: 0, z: 0, yaw: 0, pace: 1.9, state: 3 });
  const atW = time => { let out; cw.samplePuppets(time, p => { out = { ...p }; }); return out; };
  for (let i = 0; i < 12; i++) { if (i === 1) wall.z = 0.25; if (i === 11) wall.z = 0.5; hw.publish([wall], 1, [], 0, [{ x: 0, z: 0 }], kw.t); rw(); kw.t += 100; }
  assert.ok(Math.abs(atW(SERVER + 900).z - 0.25) < 1e-6, 'held at the wall, no extrapolated drift');
  assert.ok(Math.abs(atW(SERVER + 1000).z - 0.25) < 1e-6, 'still there just before it moved on');
  assert.ok(Math.abs(atW(SERVER + 1100).z - 0.5) < 1e-6);
  // A far zombie (tier C) sampled once a second keeps walking between its samples.
  const { host: hf, client: cf, clock: kf, relay: rf } = pair();
  const far = zombie(3, rng(5), { x: 200, z: 0, yaw: 0, pace: 2, state: 2 });
  const atF = time => { let out; cf.samplePuppets(time, p => { out = { ...p }; }); return out; };
  for (let i = 0; i < 25; i++) { far.z = i * 0.2; hf.publish([far], 1, [], 0, [{ x: 0, z: 0 }], kf.t); rf(); kf.t += 100; }
  const t0 = SERVER + 2400, last = atF(t0);
  assert.ok(Math.abs(atF(t0 + 500).z - (last.z + 1)) < 0.15, 'extrapolated up to the 1 s spacing at 2 m/s');
  // Render time is ZOMBIE_DELAY_MS behind the server clock.
  assert.ok(Math.abs(client.serverNow() - client.renderTime() - ZOMBIE_DELAY_MS) < 1);
  // Mutants interpolate the same way.
  const m = mutant(0, rng(5));
  const { host: h2, client: c2, clock: k2, relay: r2 } = pair();
  for (let i = 0; i < 3; i++) { m.x = i * 2; h2.publish([], 0, [m], 1, [{ x: 0, z: 0 }], k2.t); r2(); k2.t += 100; }
  let sampled; c2.sampleMutants(SERVER + 150, s => { sampled = s; });
  assert.ok(Math.abs(sampled.x - 3) < 1e-6);
});

test('the mirror equals the host state after keyframe + deltas; promote() returns it; stale epochs are dropped', () => {
  const { host, client, clock, relay } = pair();
  const random = rng(6);
  const zombies = Array.from({ length: 60 }, (_, i) => zombie(i, random, { x: 25 + random() * 30, z: 25 + random() * 30 }));
  const mutants = [mutant(0, random), mutant(1, random)];
  for (let tick = 0; tick < 30; tick++) {
    for (const z of zombies) { z.x += random() - 0.5; z.yaw += 0.1; z.hp = Math.max(0, z.hp - 0.01); }
    if (tick === 10) zombies[7].state = 0;
    if (tick === 12) zombies[7] = zombie(7, random, { id: zombieId(7, 1), x: 40, z: 40 });
    host.publish(zombies, zombies.length, mutants, 2, [{ x: 40, z: 40 }], clock.t); relay(); clock.t += 100;
  }
  host.publishDirector({ wave: 4, phase: 'wave', until: SERVER + 9000, left: 40, spawned: 20, toSpawn: 20, kills: 12, score: 400, best: 0, boss: [], mutants: [], stats: [[0, 12, 900, 0, 0]], ruins: [], rng: 1234, n: 2 }, true);
  relay();
  const { zombies: mirror, mutants: mm, director } = client.promote();
  assert.equal(mirror.length, 60);
  const byId = new Map(mirror.map(z => [z.id, z]));
  for (const z of zombies) {
    const m = byId.get(z.id);
    assert.ok(m, `zombie ${z.id} mirrored`);
    assert.ok(Math.abs(m.x - z.x) <= 1 / 32 + 1e-9 && Math.abs(m.z - z.z) <= 1 / 32 + 1e-9);
    assert.ok(Math.abs(m.hp - z.hp) <= 1 / 510 + 1e-9);
  }
  assert.equal(mm.length, 2);
  assert.equal(director.wave, 4);
  assert.equal(director.rng, 1234);
  // A stale-epoch frame never touches the mirror.
  client.onRole({ type: 'zrole', host: 'other', slot: 2, epoch: 3, why: 'stall' }, 'client');
  const moved = zombies.map(z => ({ ...z, x: z.x + 50 }));
  const stale = encodeSnapshot(moved, 60, [], 0, true, null, () => true);
  client.receive({ type: 'zsnap', serverTime: SERVER + 99_999, epoch: 2, seq: 99, key: true, part: 0, parts: 1, b: stale[0] });
  client.receive({ type: 'zdir', serverTime: SERVER + 99_999, epoch: 2, seq: 99, d: { ...director, wave: 99 } });
  assert.equal(client.promote().director.wave, 4);
  assert.ok(Math.abs(client.promote().zombies[0].x - zombies[0].x) < 0.1);
});

test('promotion reports kills and spawns after the last zdir; ready keeps the mirror; a lower-epoch zrole is authoritative', () => {
  const { host, client, clock, relay } = pair();
  const zombies = Array.from({ length: 5 }, (_, i) => zombie(i, rng(8)));
  host.publish(zombies, 5, [], 0, [{ x: 0, z: 0 }], clock.t);
  host.publishDirector({ wave: 2, phase: 'wave', until: 0, left: 12, spawned: 5, toSpawn: 7, kills: 3, score: 0, best: 0, boss: [], mutants: [], stats: [], ruins: [], rng: 9, n: 2 }, true);
  relay();
  for (let i = 0; i < 3; i++) host.event({ k: 'kill', w: zombies[i].id, kind: 'walker', by: 1, wp: 1, dx: 0, dz: 1, f: 3 });
  for (let i = 0; i < 5; i++) host.event({ k: 'spawn', w: zombieId(20 + i, 0), how: 'rise', x: i, z: 0 });
  host.event({ k: 'spawn', w: MUTANT_ID_BASE, how: 'emerge', x: 0, z: 0 });
  clock.t += 50; relay();
  client.onReady({ slot: 1, serverTime: SERVER + 60 });
  const promoted = client.promote();
  assert.equal(promoted.killsSince, 3);
  assert.equal(promoted.spawnsSince, 5, 'mutant emergences are not wave spawns');
  assert.equal(promoted.zombies.length, 2, 'killed zombies are not adopted');
  assert.equal(promoted.director.toSpawn, 7);
  const events = client.takeEvents();
  assert.equal(events.filter(e => e.k === 'kill').length, 3);
  // The epoch in a zrole replaces ours even when lower (a restarted room).
  client.onRole({ type: 'zrole', host: 'x', slot: 3, epoch: 9, why: 'lag' }, 'client');
  assert.equal(client.epoch, 9);
  assert.equal(client.onRole({ type: 'zrole', host: 'client', slot: 1, epoch: 2, why: 'restore' }, 'client'), 'promoted');
  assert.equal(client.epoch, 2);
  assert.equal(client.isHost, true);
  // A zrole that receive() applied is reported once, by onRole or takeRole.
  client.receive({ type: 'zrole', host: 'y', slot: 4, epoch: 3, why: 'stall' });
  assert.equal(client.isHost, false);
  assert.equal(client.onRole({ type: 'zrole', host: 'y', slot: 4, epoch: 3, why: 'stall' }, 'client'), 'demoted');
  assert.equal(client.takeRole(), null);
});

test('a demoted host stops sending its simulation and draws it as puppets until the new keyframe', () => {
  const { host, clock, relay } = pair();
  const zombies = Array.from({ length: 4 }, (_, i) => zombie(i, rng(9)));
  host.publish(zombies, 4, [mutant(0, rng(9))], 1, [{ x: 0, z: 0 }], clock.t); relay();
  host.event({ k: 'roar', w: MUTANT_ID_BASE, x: 1, z: 2, r: 40 });
  clock.t += 100;
  host.publish(zombies, 4, [], 0, [{ x: 0, z: 0 }], clock.t);
  host.hit({ w: zombies[0].id, d: 10, zone: 0, k: 0, wp: 1, dx: 0, dz: 1, f: 2, sx: 0, sz: 0 });
  assert.equal(host.takeHits().length, 1, 'a host applies its own hits locally');
  assert.equal(host.onRole({ type: 'zrole', host: 'client', slot: 1, epoch: 2, why: 'lag' }, 'host'), 'demoted');
  assert.deepEqual(host.takeOutgoing(64_000), [], 'no stale events or snapshots');
  const seen = [];
  host.samplePuppets(host.renderTime(), z => seen.push(z.id));
  assert.equal(seen.length, 4);
  // The new host's first records replace the seeded puppets even when their server time is older than the seed.
  const moved = zombies.map(z => ({ ...z, x: z.x + 3 }));
  const key = encodeSnapshot(moved, 4, [], 0, true, null, () => true);
  host.receive({ type: 'zsnap', serverTime: SERVER - 5000, epoch: 2, seq: 1, key: true, part: 0, parts: 1, b: key[0] });
  const now = new Map();
  host.samplePuppets(SERVER + 99_999, z => now.set(z.id, z.x));
  for (const z of moved) assert.ok(Math.abs(now.get(z.id) - z.x) < 0.05, 'the keyframe replaced the seeded pose');
  // Hits queued as a client go to the room, and to the local simulation once promoted.
  host.hit({ w: zombies[1].id, d: 12, zone: 1, k: 0, wp: 1, dx: 0, dz: 1, f: 2, sx: 0, sz: 0 });
  assert.equal(host.onRole({ type: 'zrole', host: 'host', slot: 0, epoch: 3, why: 'stall' }, 'host'), 'promoted');
  assert.deepEqual(host.takeHits().map(h => h.h.d), [12]);
});

test('a host that missed its zrole steps down on the first frame of a newer epoch (no second horde)', () => {
  const { host, clock, relay } = pair();
  const zombies = Array.from({ length: 3 }, (_, i) => zombie(i, rng(4)));
  host.publish(zombies, 3, [], 0, [{ x: 0, z: 0 }], clock.t); relay();
  assert.equal(host.isHost, true);
  // Frames of our own epoch (or older) never demote.
  host.receive({ type: 'zdir', serverTime: SERVER + 50, epoch: 1, seq: 9, d: { wave: 1 } });
  assert.equal(host.isHost, true);
  const moved = zombies.map(z => ({ ...z, x: z.x + 2 }));
  const key = encodeSnapshot(moved, 3, [], 0, true, null, () => true);
  host.receive({ type: 'zsnap', serverTime: SERVER + 200, epoch: 2, seq: 1, key: true, part: 0, parts: 1, b: key[0] });
  assert.equal(host.isHost, false, 'a newer epoch means another player hosts');
  assert.equal(host.epoch, 2);
  assert.deepEqual(host.takeOutgoing(64_000).filter(m => m.type === 'zsnap' || m.type === 'zdir' || m.type === 'zev'), [], 'nothing of the old simulation is sent');
  const now = new Map();
  host.samplePuppets(SERVER + 99_999, z => now.set(z.id, z.x));
  for (const z of moved) assert.ok(Math.abs(now.get(z.id) - z.x) < 0.05, 'the new host’s keyframe is drawn');
});

test('takeOutgoing respects the byte budget, supersedes unsent snapshots, and keeps events, hits and commands for 10 s', () => {
  const { host, client, clock, relay } = pair();
  const random = rng(10);
  const zombies = Array.from({ length: 100 }, (_, i) => zombie(i, random, { x: random() * 40, z: random() * 40 }));
  for (let i = 0; i < 40; i++) host.event({ k: 'hit', w: zombies[i].id, a: 'claw', x: 1.234567, z: 2.345678, yaw: 0.123456789, r: 1.2, arc: 1.5, dmg: 7.777, kb: 0, to: 1 });
  host.publish(zombies, 100, [], 0, [{ x: 0, z: 0 }], clock.t);
  // A budget too small for the keyframe: events still flow, the snapshot waits.
  let out = host.takeOutgoing(2600);
  assert.deepEqual(out.map(m => m.type), ['zev']);
  assert.ok(out[0].ev.length <= MAX_EVENTS);
  assert.deepEqual(out[0].ev[0], { k: 'hit', w: zombies[0].id, a: 'claw', x: 1.23, z: 2.35, yaw: 0.123, r: 1.2, arc: 1.5, dmg: 7.78, kb: 0, to: 1 });
  const sentEvents = out[0].ev.length;
  clock.t += 50;
  for (const z of zombies) z.x += 1;
  host.publish(zombies, 100, [], 0, [{ x: 0, z: 0 }], clock.t);
  out = host.takeOutgoing(64_000);
  assert.deepEqual(out.map(m => m.type), ['zev', 'zsnap']);
  assert.equal(out[0].ev.length, 40 - sentEvents, 'every event is sent exactly once');
  assert.equal(out[1].key, true);
  assert.ok(Math.abs(decodeSnapshot(out[1].b).zombies[0].x - zombies[0].x) < 0.05, 'the newest export superseded the unsent one');
  // Client side: hits and commands survive a disconnect for up to 10 s, then expire.
  client.hit({ w: 1, d: 10.123456, zone: 1, k: 0, wp: 1, dx: 0.70710678, dz: 0.70710678, f: 2, sx: 3.14159, sz: 2.71828 });
  client.command({ c: 'revive', to: 0 });
  clock.t += 9000;
  out = client.takeOutgoing(64_000);
  assert.deepEqual(out.map(m => m.type), ['zhit', 'zcmd']);
  assert.deepEqual(out[0].h[0], { w: 1, d: 10.12, zone: 1, k: 0, wp: 1, dx: 0.707, dz: 0.707, f: 2, sx: 3.14, sz: 2.72 });
  client.hit({ w: 2, d: 5, zone: 0, k: 0, wp: 1, dx: 0, dz: 1, f: 1, sx: 0, sz: 0 });
  clock.t += 10_001;
  assert.deepEqual(client.takeOutgoing(64_000), []);
  void relay;
});

test('every frame stays under MAX_FRAME_BYTES: 32+ unrounded telegraphs, long-float hits, multi-part keyframes', () => {
  const { host, client, clock } = pair();
  const random = rng(11);
  for (let i = 0; i < 100; i++) {
    host.event({ k: 'tele', w: 0xff00 + (i % 4), a: 'deathburst', x: -1234.56789123 + random(), z: 1234.987654321 * random(), yaw: random() * 6.283185307179586,
      r: 29.999999, arc: 3.14159265358979, t: 1.23456789, to: 0xffff, tx: 1999.123456789, tz: -1999.987654321 });
  }
  for (let i = 0; i < 60; i++) client.hit({ w: 0xffff & (i * 977), d: 33.333333333, zone: 1, k: 2, wp: 3, dx: random(), dz: random(), f: 12.3456789, sx: 1234.5678912, sz: -1234.5678912, hold: 1.23456, weak: 3 });
  const many = Array.from({ length: 128 }, (_, i) => zombie(i, random));
  host.publish(many, 128, [mutant(0, random), mutant(1, random), mutant(2, random), mutant(3, random)], 4, [{ x: 0, z: 0 }], clock.t);
  host.publishDirector({ wave: 3, phase: 'wave', until: 1e12 + 0.5, left: 1, spawned: 2, toSpawn: 3, kills: 4, score: 5, best: 0, boss: ['colossus'], mutants: [{ i: 0, k: 'colossus', hp: 1000.7, max: 3000.2, weak: 1 }], stats: [[0, 1, 2, 3, 4]], ruins: Array.from({ length: 80 }, (_, i) => 1_234_567 * 16 + i % 9), rng: 3_000_000_000, n: 2 });
  let frames = 0, events = 0, hits = 0;
  for (let tick = 0; tick < 20; tick++) {
    for (const m of [...host.takeOutgoing(16_384), ...client.takeOutgoing(16_384)]) {
      const bytes = Buffer.byteLength(JSON.stringify(m));
      assert.ok(bytes <= MAX_FRAME_BYTES, `${m.type}: ${bytes} bytes`);
      frames++;
      if (m.type === 'zev') { events += m.ev.length; assert.ok(m.ev.length <= MAX_EVENTS); for (const e of m.ev) assert.equal(e.x, Math.round(e.x * 100) / 100); }
      if (m.type === 'zhit') { hits += m.h.length; assert.ok(m.h.length <= MAX_HITS); }
      if (m.type === 'zdir') { assert.ok(m.d.ruins.length <= 48); assert.equal(m.d.until, Math.round(m.d.until)); assert.equal(m.d.mutants[0].hp, 1001); }
    }
    clock.t += 50;
  }
  assert.equal(events, 100);
  assert.equal(hits, 60);
  assert.ok(frames >= 8);
  const four = encodeSnapshot(Array.from({ length: 700 }, (_, i) => zombie(i % 128, random, { id: i })), 700, [], 0, true, null, () => true);
  assert.equal(four.length, 4);
  for (const [part, b] of four.entries()) assert.ok(JSON.stringify({ type: 'zsnap', epoch: 2 ** 31, seq: Number.MAX_SAFE_INTEGER, key: true, part, parts: 4, b }).length <= MAX_FRAME_BYTES);
});

test('120 wandering zombies cost at most 16 KB/s of snapshots', () => {
  const { host, clock, relay, wire } = pair();
  const random = rng(12);
  const players = [{ x: 0, z: 0 }, { x: 30, z: 20 }];
  // Spread like a real wave: most within 60 m of the team, some further out.
  const zombies = Array.from({ length: 120 }, (_, i) => {
    const d = i < 80 ? 10 + random() * 45 : 55 + random() * 100, a = random() * Math.PI * 2;
    return zombie(i, random, { x: Math.sin(a) * d, z: Math.cos(a) * d, state: 2, pace: 0.55, flags: 0, target: NO_SLOT, prog: 0, y: 0, hp: 1 });
  });
  for (let tick = 0; tick < 100; tick++) {
    for (const z of zombies) {
      if (random() < 0.02) z.yaw += (random() - 0.5) * 2;
      z.x += Math.sin(z.yaw) * z.pace * 0.1; z.z += Math.cos(z.yaw) * z.pace * 0.1;
    }
    host.publish(zombies, 120, [], 0, players, clock.t); relay();
    clock.t += 100;
  }
  const snapBytes = wire.up.filter(m => m.type === 'zsnap').reduce((sum, m) => sum + JSON.stringify(m).length, 0);
  assert.ok(snapBytes / 10 <= 16 * 1024, `${Math.round(snapBytes / 10)} B/s`);
  assert.ok(wire.up.filter(m => m.type === 'zsnap' && m.key).length >= 5, `a keyframe every ${ZOMBIE_KEY_MS} ms`);
});

test('zombie ids wrap their generation below 0xfa00; mutant, omen and blast ids are never zombies', () => {
  let max = 0;
  for (let generation = 0; generation < 2000; generation++) for (const slot of [0, 1, 127]) {
    const id = zombieId(slot, generation);
    max = Math.max(max, id);
    assert.equal(id & 127, slot);
    assert.ok(isZombieId(id));
  }
  assert.ok(max < 0xfa00, max.toString(16));
  for (const id of [MUTANT_ID_BASE, MUTANT_ID_BASE + 3, OMEN_ID, BLAST_ID, 0xfa00, -1, 70_000]) assert.equal(isZombieId(id), false);
});

test('room-connection routes z* frames, drains takeZombie under 16 KB of buffer, never sends an oversized frame, and pings rtt/vis/fps', async t => {
  const { connectRoom } = await import('../app/game/room-connection.ts');
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const sockets = [], zombieIn = [], readies = [], clocks = [], closes = [];
  let outgoing = [];
  const room = connectRoom({ room: 'ABC234', id: 'me', token: 't' }, 'https://game.example/', {
    getState: () => ({ x: 0, z: 0, angle: 0, riding: false, speed: 0, score: 0, zd: 0 }), takeHits: () => [], onPeers() {}, onHits() {},
    onStatus() {}, onLatency() {}, onFatal() {},
    takeZombie: max => { const list = outgoing.filter(m => JSON.stringify(m).length <= max); outgoing = []; return list; },
    onZombie: m => zombieIn.push(m), onReady: info => readies.push(info), fps: () => 47.6, onServerTime: s => clocks.push(s), onClose: code => closes.push(code),
  }, {
    now: Date.now, random: () => 0, makeId: () => 'id',
    createSocket(url) {
      const socket = { url, readyState: 0, bufferedAmount: 0, sent: [], onopen: null, onmessage: null, onclose: null, onerror: null,
        send(text) { this.sent.push(JSON.parse(text)); }, close() { this.readyState = 3; } };
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => { room.dispose(); t.mock.timers.reset(); });
  const socket = sockets[0];
  socket.readyState = 1; socket.onopen();
  outgoing = [{ type: 'zneed' }];
  t.mock.timers.tick(50);
  assert.equal(socket.sent.some(m => m.type === 'zneed'), false, 'nothing before ready');
  socket.onmessage({ data: JSON.stringify({ type: 'ready', id: 'me', serverTime: 5000, mode: 'zombie', slot: 2 }) });
  assert.deepEqual(readies, [{ mode: 'zombie', slot: 2, serverTime: 5000, reconnect: false }]);
  socket.onmessage({ data: JSON.stringify({ type: 'zrole', host: 'me', slot: 2, epoch: 1, why: 'create' }) });
  socket.onmessage({ data: JSON.stringify({ type: 'zneed', from: 15 }) });
  socket.onmessage({ data: JSON.stringify({ type: 'snapshot', seq: 1, serverTime: 5050, peers: [] }) });
  assert.deepEqual(zombieIn.map(m => m.type), ['zrole', 'zneed']);
  assert.deepEqual(clocks, [5000, 5050]);
  const big = { type: 'zev', epoch: 1, seq: 1, ev: [{ k: 'wave', n: 1, p: 'start', pad: 'x'.repeat(MAX_FRAME_BYTES) }] };
  outgoing = [{ type: 'zneed' }, big];
  t.mock.timers.tick(50);
  const types = socket.sent.map(m => m.type);
  assert.ok(types.indexOf('state') < types.indexOf('zneed'), 'zombie frames follow the state');
  assert.equal(types.includes('zev'), false, 'a frame over MAX_FRAME_BYTES is never sent');
  const ping = socket.sent.find(m => m.type === 'ping');
  assert.equal(ping.vis, true); assert.equal(ping.fps, 48);
  socket.onmessage({ data: JSON.stringify({ type: 'pong', sentAt: ping.sentAt, serverTime: 5100 }) });
  // Backpressure: nothing drained at 16 KB buffered.
  socket.bufferedAmount = 16 * 1024;
  outgoing = [{ type: 'zneed' }];
  const sent = socket.sent.length;
  t.mock.timers.tick(50);
  assert.equal(socket.sent.slice(sent).some(m => m.type === 'zneed'), false);
  socket.bufferedAmount = 0;
  t.mock.timers.tick(2000);
  const next = socket.sent.filter(m => m.type === 'ping').at(-1);
  assert.ok(Number.isFinite(next.rtt), 'the last measured round trip rides on the next ping');
  socket.readyState = 3; socket.onclose({ code: 1006 });
  assert.deepEqual(closes, [1006]);
});

const dirOf = (over = {}) => ({ wave: 8, phase: 'wave', until: SERVER + 9000, left: 40, spawned: 20, toSpawn: 20, kills: 412, score: 9000, best: 7, boss: [], mutants: [], stats: [[0, 300, 9000, 1, 0]], ruins: [], rng: 77, n: 2, ...over });

test('a demoted host keeps its own last director as the mirror: the HUD keeps the wave, and a re-election before the new host publishes resumes it', () => {
  const { host, clock } = pair();
  host.publishDirector(dirOf(), true);
  clock.t += 300; host.takeOutgoing(64_000);
  assert.equal(host.onRole({ type: 'zrole', host: 'client', slot: 1, epoch: 2, why: 'stall' }, 'host'), 'demoted');
  assert.deepEqual([host.director()?.wave, host.director()?.phase, host.director()?.kills], [8, 'wave', 412], 'never wave 0 / prep after a demotion');
  // Re-elected before 'client' ever sent a zdir: the same wave, kills and RNG (not wave 1, not a stale client-side zdir).
  assert.equal(host.onRole({ type: 'zrole', host: 'host', slot: 0, epoch: 3, why: 'stall' }, 'host'), 'promoted');
  const back = host.promote();
  assert.deepEqual([back.director.wave, back.director.kills, back.director.rng, back.killsSince], [8, 412, 77, 0]);
  // A zdir from the interim host replaces it as usual.
  host.onRole({ type: 'zrole', host: 'client', slot: 1, epoch: 4, why: 'lag' }, 'host');
  host.receive({ type: 'zdir', serverTime: SERVER, epoch: 4, seq: 1, d: dirOf({ wave: 9, kills: 430 }) });
  assert.equal(host.promote().director.wave, 9);
});

test('a client mirror only moves forward within one host\'s run; a new run (after over, or with fewer kills) and a new epoch pass', () => {
  const { client } = pair();
  const zdir = (epoch, seq, d) => client.receive({ type: 'zdir', serverTime: SERVER, epoch, seq, d });
  zdir(1, 1, dirOf({ wave: 5, phase: 'rest', kills: 100 }));
  zdir(1, 2, dirOf({ wave: 5, phase: 'wave', kills: 100 }));
  assert.deepEqual([client.director().wave, client.director().phase], [5, 'rest'], 'a stale zdir of the same host is ignored');
  zdir(1, 3, dirOf({ wave: 6, phase: 'wave', kills: 120 }));
  assert.equal(client.director().wave, 6);
  // A restart this client missed the 'over' of: fewer kills, a new run.
  zdir(1, 4, dirOf({ wave: 1, phase: 'wave', kills: 0 }));
  assert.equal(client.director().wave, 1);
  zdir(1, 5, dirOf({ wave: 3, phase: 'over', kills: 30 }));
  zdir(1, 6, dirOf({ wave: 0, phase: 'prep', kills: 30 }));
  assert.deepEqual([client.director().wave, client.director().phase], [0, 'prep'], 'after over, the next run starts from prep');
  // Another host's director (a newer epoch) is taken as it is.
  client.onRole({ type: 'zrole', host: 'other', slot: 2, epoch: 2, why: 'stall' }, 'client');
  zdir(2, 1, dirOf({ wave: 0, phase: 'prep', kills: 30 }));
  assert.equal(client.director().phase, 'prep');
});

test('after a send gap a host drops resolved combat (hits, projectiles, clouds over 400 ms; tells past their windup) and keeps kills and waves', () => {
  const { host, clock } = pair();
  host.event({ k: 'tele', w: MUTANT_ID_BASE, a: 'slam', x: 0, z: 0, yaw: 0, r: 7, arc: 0, t: 0.9, to: 1 });
  host.event({ k: 'tele', w: MUTANT_ID_BASE + 1, a: 'deathburst', x: 0, z: 0, yaw: 0, r: 4, arc: 0, t: 1.5, to: 1 });
  clock.t += 900;
  host.event({ k: 'hit', w: MUTANT_ID_BASE, a: 'slam', x: 0, z: 0, yaw: 0, r: 7, arc: 0, dmg: 45, kb: 6, to: 1 });
  host.event({ k: 'kill', w: 5, kind: 'walker', by: 0, wp: 1, dx: 0, dz: 1, f: 2 });
  host.event({ k: 'wave', n: 3, p: 'clear' });
  clock.t += 200;
  host.event({ k: 'hit', w: 7, a: 'claw', x: 0, z: 0, yaw: 0, r: 1, arc: 1, dmg: 8, kb: 0, to: 1 });
  // The socket was down 1.4 s: the slam's tell is over and its hit 500 ms old (dropped); the death burst still warns for
  // 0.1 s and the claw is 300 ms old (sent).
  clock.t += 300;
  const sent = host.takeOutgoing(64_000).filter(m => m.type === 'zev').flatMap(m => m.ev).map(e => `${e.k}${e.a ? ':' + e.a : ''}`);
  assert.deepEqual(sent, ['tele:deathburst', 'kill', 'wave', 'hit:claw']);
});
