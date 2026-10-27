// node --experimental-transform-types --test scripts/zombie-director.test.mjs
// The zombie wave director and the fairness rules (design.md §2, §7.1): the §2.2 table, one schedule for solo and
// online, the caps, whole runs of waves with a fake world (rests, summons, a wipe and its restart), migration of a
// director mid-wave (same RNG sequence), the victim's damage governor, every attack's telegraph, the chase-speed cap
// and the host's real-time steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHASE_CAP, MAX_ALIVE, TELL_MIN, aliveCap, bossesFor, createDirector, createGovernor, damageMul, hpMul, isBossWave, kindWeights,
  mutantCount, mutantHp, mutantHpMul, restSeconds, simSteps, spawnInterval, speedMul, stalkersFor, tellFor, waveSize,
} from '../app/game/zombie-director.ts';
import { KINDS, KIND_ATTACKS, chaseSpeed } from '../app/game/zombie-kinds.ts';
import { MUTANT_KINDS, ZOMBIE_KINDS } from '../lib/zombie-protocol.ts';

const r2 = (v) => Math.round(v * 100) / 100;

test('§2.2: the formulas reproduce the table', () => {
  // players, wave, size, alive cap, HP ×, speed ×, spawn every, mutants (count), mutant HP ×, rest
  const rows = [
    [1, 1, 16, 24, 1.00, 1.00, 0.90, 0, null, 20],
    [1, 3, 28, 32, 1.12, 1.02, 0.80, 1, 1.12, 30],
    [1, 5, 40, 40, 1.24, 1.05, 0.70, 1, 1.24, 30],
    [1, 8, 58, 52, 1.42, 1.08, 0.55, 1, 1.42, 30],
    [1, 10, 70, 60, 1.54, 1.11, 0.45, 2, 1.54, 30],
    [1, 15, 100, 64, 1.84, 1.17, 0.20, 0, null, 20],
    [2, 1, 21, 31, 1.06, 1.02, 0.67, 0, null, 25],
    [2, 3, 45, 42, 1.25, 1.04, 0.59, 1, 1.96, 35],
    [2, 5, 64, 52, 1.39, 1.07, 0.52, 1, 2.17, 35],
    [2, 10, 112, 78, 1.72, 1.13, 0.33, 2, 2.70, 35],
    [4, 1, 30, 46, 1.18, 1.06, 0.44, 0, null, 25],
    [4, 3, 78, 61, 1.52, 1.09, 0.39, 1, 3.64, 35],
    [4, 5, 112, 76, 1.69, 1.11, 0.34, 2, 4.03, 35],
    [4, 10, 196, 114, 2.09, 1.17, 0.22, 3, 5.00, 35],
    [8, 1, 50, 74, 1.42, 1.14, 0.26, 0, null, 25],
    [8, 3, 146, 99, 2.06, 1.17, 0.23, 1, 7.00, 35],
    [8, 5, 208, 120, 2.28, 1.19, 0.20, 3, 7.75, 35],
    [8, 10, 364, 120, 2.83, 1.25, 0.13, 3, 9.63, 35],
  ];
  for (const [n, w, size, cap, hp, speed, every, mutants, mhp, rest] of rows) {
    const online = n > 1, label = `n=${n} w=${w}`;
    assert.equal(waveSize(w, n), size, `${label} size`);
    assert.equal(aliveCap(w, n, online), cap, `${label} cap`);
    assert.equal(r2(hpMul(w, n)), hp, `${label} hp`);
    assert.equal(r2(speedMul(w, n)), speed, `${label} speed`);
    assert.equal(r2(spawnInterval(w, n)), every, `${label} interval`);
    assert.equal(mutantCount(w, n), mutants, `${label} mutants`);
    // (the table rounds 5.005 down)
    if (mhp !== null) assert.ok(Math.abs(mutantHpMul(w, n) - mhp) <= 0.0051, `${label} mutant hp`);
    assert.equal(restSeconds(online, isBossWave(w)), rest, `${label} rest`);
  }
  assert.equal(damageMul(1), 1);
  assert.equal(damageMul(50), 1.3);
  // Mutant HP is a u16 on the wire.
  assert.ok(mutantHp('matriarch', 60, 8) <= 65000);
});

test('one schedule: solo and a team of four meet the same kinds and the same boss waves', () => {
  const seq = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  const a = seq(42), b = seq(42);
  for (let w = 1; w <= 30; w++) {
    const solo = bossesFor(w, 1, a), team = bossesFor(w, 4, b);
    assert.equal(solo.length > 0, team.length > 0, `wave ${w}: both or neither`);
    // The team gets at least as many, and every kind the solo player meets.
    assert.ok(team.length >= solo.length, `wave ${w}`);
    for (const k of solo) assert.ok(team.includes(k), `wave ${w}: ${k}`);
  }
  assert.deepEqual(bossesFor(3, 1, () => 0.9), ['colossus']);
  assert.deepEqual(bossesFor(3, 8, () => 0.9), ['colossus']);
  assert.deepEqual(bossesFor(5, 1, () => 0.9), ['leaper']);
  assert.deepEqual(bossesFor(8, 1, () => 0.9), ['matriarch']);
  assert.deepEqual(bossesFor(10, 1, () => 0.9), ['colossus', 'leaper']);
  for (const w of [13, 16, 19]) assert.ok(isBossWave(w));
  assert.ok(!isBossWave(11) && !isBossWave(12) && !isBossWave(15));
  // Wandering mutants: only from wave 6, on non-boss waves.
  assert.deepEqual(bossesFor(4, 1, () => 0.01), []);
  assert.equal(bossesFor(7, 1, () => 0.01).length, 1);
  // Kinds unlock on the same waves for any team size.
  for (let w = 1; w <= 14; w++) {
    const one = kindWeights(w, 1, 0), four = kindWeights(w, 4, 0);
    for (const k of ZOMBIE_KINDS) assert.equal(one[k] > 0, four[k] > 0, `wave ${w} ${k}`);
  }
  assert.ok(kindWeights(1, 1, 1).runner > 0, 'runners from wave 1 at night');
  assert.equal(kindWeights(1, 1, 0).runner, 0, 'runners from wave 2 by day');
  assert.ok(kindWeights(12, 1, 0).walker < kindWeights(1, 1, 0).walker, 'fewer walkers late');
  // Every regular kind can be met: each has a weight by wave 7 (the stalker is not weighted but comes one per wave).
  for (const k of ZOMBIE_KINDS) if (k !== 'stalker') assert.ok(kindWeights(7, 1, 0)[k] > 0, k);
  assert.equal(stalkersFor(6, 1, false), 0);
  assert.equal(stalkersFor(7, 1, false), 1);
  assert.equal(stalkersFor(7, 3, true), 1);
  assert.equal(stalkersFor(7, 4, true), 2);
  assert.equal(stalkersFor(7, 8, true), 2);
});

/** A fake world for whole runs: zombies stand until the test kills them. */
function fakeRun(online, players, opts = {}) {
  const dir = createDirector(1234, online);
  const alive = new Map(); // id -> kind
  let id = 0, time = 0, mutants = 0;
  const people = Array.from({ length: players }, (_, slot) => ({ slot, x: slot * 2, z: 0, up: true }));
  const log = [];
  dir.start(time);
  const tick = (dt = 0.1) => {
    time += dt;
    const step = dir.update(dt, {
      time, players: people, night: 0, alive: alive.size, mutants,
      aliveOf: (k) => [...alive.values()].filter((v) => v === k).length,
    });
    for (const s of step.spawns) alive.set(id++, s.kind);
    mutants += step.mutants.length;
    if (step.waveStarted) log.push(['start', step.waveStarted, dir.phase]);
    if (step.waveCleared) log.push(['clear', step.waveCleared, dir.phase]);
    if (step.over) log.push(['over', dir.wave]);
    if (step.restart) log.push(['restart', dir.wave]);
    return step;
  };
  const killAll = () => { for (const [k, kind] of alive) { alive.delete(k); dir.onKill(kind, 0, false); } if (opts.keepMutants !== true) { for (let i = 0; i < mutants; i++) dir.onKill('colossus', 0, false); mutants = 0; } };
  return { dir, alive, people, tick, killAll, log, get time() { return time; }, set mutants(v) { mutants = v; }, get mutants() { return mutants; } };
}

test('15 waves with a fake world: prep, waves, rests; summons extend the wave; caps hold', () => {
  const run = fakeRun(false, 1);
  assert.equal(run.dir.phase, 'prep');
  let maxAlive = 0, ticks = 0, summoned = false;
  while (run.dir.best < 15 && ticks++ < 200000) {
    run.tick();
    const w = run.dir.wave;
    maxAlive = Math.max(maxAlive, run.alive.size);
    if (run.dir.phase === 'wave') {
      assert.ok(run.alive.size <= aliveCap(w, 1, false), `wave ${w} cap`);
      for (const k of ZOMBIE_KINDS) if (MAX_ALIVE[k][0] < Infinity) assert.ok([...run.alive.values()].filter((v) => v === k).length <= MAX_ALIVE[k][0] + 4, `${k} cap`);
      // Summons join the wave: 3 extras called in wave 4 keep it going until they are killed too.
      if (w === 4 && !summoned && run.alive.size) { summoned = true; run.dir.onSummon(3); for (let i = 0; i < 3; i++) run.alive.set(`s${i}`, 'walker'); }
    }
    if (ticks % 30 === 0) run.killAll();
  }
  assert.ok(summoned);
  assert.ok(maxAlive > 10);
  const starts = run.log.filter((l) => l[0] === 'start').map((l) => l[1]);
  const clears = run.log.filter((l) => l[0] === 'clear').map((l) => l[1]);
  assert.deepEqual(starts.slice(0, 15), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(clears.slice(0, 15), Array.from({ length: 15 }, (_, i) => i + 1));
  // Phases alternate: start w, clear w, start w + 1...
  const order = run.log.filter((l) => l[0] === 'start' || l[0] === 'clear').map((l) => `${l[0]}${l[1]}`);
  for (let i = 0; i < 30; i += 2) { assert.equal(order[i], `start${i / 2 + 1}`); assert.equal(order[i + 1], `clear${i / 2 + 1}`); }
  assert.equal(run.dir.best, 15);
});

test('boss waves bring their mutants after a quake, and the wave waits for them', () => {
  const run = fakeRun(false, 1, { keepMutants: true });
  let quakes = [], mutantsSpawned = [];
  while (run.dir.wave < 3 || run.dir.phase !== 'wave') {
    const s = run.tick();
    if (run.dir.phase === 'wave' && run.dir.wave < 3) run.killAll();
    void s;
  }
  for (let i = 0; i < 400; i++) {
    const s = run.tick();
    if (s.quake) quakes.push([s.quake, run.time]);
    for (const m of s.mutants) mutantsSpawned.push([m.kind, run.time, m.hp, m.at]);
    run.killAll();
  }
  assert.equal(quakes.length, 1);
  assert.equal(mutantsSpawned.length, 1);
  assert.equal(mutantsSpawned[0][0], 'colossus');
  assert.equal(mutantsSpawned[0][3], 'hole');
  assert.ok(Math.abs(mutantsSpawned[0][1] - quakes[0][1] - 6) < 0.15, 'the quake warns 6 s ahead');
  // The wave is not over while the colossus stands.
  assert.equal(run.dir.phase, 'wave');
  run.mutants = 0;
  run.dir.onKill('colossus', 0, true);
  run.tick();
  assert.equal(run.dir.phase, 'rest');
  assert.ok(run.dir.stats(run.time).breakLeft >= 29, 'a boss wave rests 30 s solo');
});

test('online: the whole team down is game over, then wave 1 again after 10 s', () => {
  const run = fakeRun(true, 3);
  while (run.dir.phase !== 'wave') run.tick();
  for (let i = 0; i < 50; i++) run.tick();
  for (const p of run.people) p.up = false;
  const s = run.tick();
  assert.ok(s.over);
  assert.equal(run.dir.phase, 'over');
  for (const p of run.people) p.up = true;
  let restarted = false;
  for (let i = 0; i < 120 && !restarted; i++) restarted = run.tick().restart;
  assert.ok(restarted);
  assert.equal(run.dir.phase, 'prep');
  assert.equal(run.dir.wave, 0);
  // Solo never goes 'over' on its own (the run ends in game.ts).
  const solo = fakeRun(false, 1);
  while (solo.dir.phase !== 'wave') solo.tick();
  solo.people[0].up = false;
  assert.ok(!solo.tick().over);
});

test('migration: toNet/fromNet mid-wave continues with the same RNG sequence', () => {
  const a = fakeRun(true, 4);
  while (a.dir.phase !== 'wave' || a.dir.wave < 2) { a.tick(); if (a.dir.phase === 'wave' && a.dir.wave < 2) a.killAll(); }
  for (let i = 0; i < 30; i++) a.tick();
  const net = JSON.parse(JSON.stringify(a.dir.toNet()));
  assert.ok(JSON.stringify(net).length < 2048);
  const b = createDirector(999, true);
  b.fromNet(net, a.time);
  // The same draws from here on.
  const ra = Array.from({ length: 20 }, () => a.dir.random());
  const rb = Array.from({ length: 20 }, () => b.random());
  assert.deepEqual(ra, rb);
  assert.equal(b.wave, a.dir.wave);
  assert.equal(b.phase, 'wave');
  // Promotion reconciles counters with what happened after the zdir (A2).
  const before = b.toNet();
  b.reconcile(3, 5, 7);
  const after = b.toNet();
  assert.equal(after.kills, before.kills + 3);
  assert.equal(after.toSpawn, Math.max(0, before.toSpawn - 5));
  // A promoted host with nothing to go on carries on resting from the last wave shown.
  const c = createDirector(5, true);
  c.resume(6, 100);
  assert.equal(c.phase, 'rest');
  assert.equal(c.wave, 5);
});

test('the damage governor: 45 dps from zombies, 60 a hit, softened after a knockdown, nothing while down', () => {
  const g = createGovernor();
  let total = 0;
  for (let t = 0; t < 1; t += 0.05) total += g.apply(t, 20, 'zombie', false).damage;
  assert.ok(total <= 45 + 1e-9, `${total}`);
  const g2 = createGovernor();
  assert.equal(g2.apply(0, 200, 'mutant', false).damage, 60);
  const g3 = createGovernor();
  const first = g3.apply(0, 30, 'mutant', true);
  assert.equal(first.damage, 30);
  assert.ok(first.knock);
  const second = g3.apply(1.0, 30, 'mutant', true);
  assert.equal(second.damage, 15);
  assert.ok(!second.knock, 'no knockdown chain');
  const third = g3.apply(1.6, 30, 'mutant', true);
  assert.equal(third.damage, 30);
  assert.equal(createGovernor().apply(0, 50, 'zombie', false, true).damage, 0);
});

test('fairness: every attack is telegraphed for at least TELL_MIN; unseen attackers 0.5 s; remote victims more', () => {
  assert.ok(KIND_ATTACKS.length >= 11);
  for (const { kind, attack, windup } of KIND_ATTACKS) {
    assert.ok(attack in TELL_MIN, `${kind} ${attack} has a TELL_MIN`);
    assert.ok(tellFor(attack, windup) >= TELL_MIN[attack], `${kind} ${attack}`);
    assert.ok(tellFor(attack, windup, { offscreen: true }) >= 0.5, `${kind} ${attack} off screen`);
  }
  assert.ok(Math.abs(tellFor('claw', 0.25, { remote: true, rtt: 0.2 }) - 0.4) < 1e-9, 'RTT 200 ms adds 0.15 s');
  assert.ok(Math.abs(tellFor('claw', 0.25, { remote: true, rtt: 2 }) - 0.45) < 1e-9, 'the allowance stops at 0.2 s');
  // Mutant attacks have their tells too.
  for (const a of ['swipe', 'slam', 'charge', 'throw', 'roar', 'pounce', 'slash', 'bile', 'brood', 'exhale', 'deathburst']) assert.ok(TELL_MIN[a] >= 0.45, a);
  assert.equal(MUTANT_KINDS.length, 3);
});

test('outrunnable: every regular kind chases slower than a sprint, after every multiplier', () => {
  for (const k of ZOMBIE_KINDS) {
    const v = chaseSpeed(k, speedMul(30, 8), 1, false);
    assert.ok(v <= CHASE_CAP + 1e-9 && CHASE_CAP < 6.8, `${k} ${v}`);
  }
  assert.ok(KINDS.hunter.chase * speedMul(30, 8) * 1.2 > 6.8, 'the cap matters for the hunter');
});

test('the host steps in real time: 15 fps and 150 fps advance a zombie the same; the bag only slows solo', () => {
  const advance = (frames, interval, opts) => {
    let x = 0;
    for (let f = 0; f < frames; f++) for (const dt of simSteps(interval, opts)) x += 4 * dt;
    return x;
  };
  const slow = advance(60, 0.066, { online: true }), fast = advance(600, 0.0066, { online: true });
  assert.ok(Math.abs(slow - fast) / fast < 0.02, `${slow} vs ${fast}`);
  for (const dt of simSteps(0.08, { online: true })) assert.ok(dt <= 0.05 + 1e-12);
  assert.ok(Math.abs(advance(10, 0.5, { online: true }) - 4) < 1e-9, 'one frame steps at most 0.1 s');
  assert.ok(Math.abs(advance(100, 0.02, { online: true, bag: true }) - advance(100, 0.02, { online: true })) < 1e-9, 'Tab never slows a room');
  assert.ok(Math.abs(advance(100, 0.02, { online: false, bag: true }) - advance(100, 0.02, { online: false }) / 4) < 1e-9, 'solo keeps the slow motion');
});

test('online, a new room waits for the team: 90 s alone, 10 s once two are in (wave 1 sized for them), 3 s after "Bắt đầu"; solo and restarts keep the short prep', () => {
  const ctx = (time, players) => ({ time, players, night: 0, alive: 0, aliveOf: () => 0, mutants: 0 });
  const one = [{ slot: 0, x: 0, z: 0, up: true }], two = [...one, { slot: 1, x: 2, z: 0, up: true }];
  const room = createDirector(5, true);
  room.start(0);
  room.update(0.1, ctx(30, one));
  assert.deepEqual([room.phase, room.stats(30).breakLeft], ['prep', 60], 'alone: waiting up to 90 s');
  room.update(0.1, ctx(40, two));
  assert.equal(room.stats(40).breakLeft, 10, 'a teammate joined: 10 s');
  room.update(0.1, ctx(45, two));
  assert.equal(room.stats(45).breakLeft, 5, 'the countdown is not restarted');
  room.update(0.1, ctx(49.9, two));
  assert.equal(room.phase, 'prep');
  assert.equal(room.update(0.1, ctx(50.01, two)).waveStarted, 1);
  assert.deepEqual([room.n, room.toNet().toSpawn], [2, waveSize(1, 2)], 'wave 1 is sized for the two');
  // "Bắt đầu" alone: 3 s.
  const go = createDirector(6, true);
  go.start(0);
  go.update(0.1, ctx(1, one));
  go.startSoon(1);
  assert.equal(go.stats(1).breakLeft, 3);
  assert.equal(go.update(0.1, ctx(4.01, one)).waveStarted, 1);
  go.startSoon(5);
  assert.equal(go.phase, 'wave', 'no-op once the wave began');
  // Solo: 6 s as before; an online restart after a wipe: 6 s too.
  const solo = createDirector(7, false);
  solo.start(0);
  assert.equal(solo.update(0.1, ctx(6.01, one)).waveStarted, 1);
  const again = createDirector(8, true);
  again.restart(100);
  assert.equal(again.stats(100).breakLeft, 6);
});
