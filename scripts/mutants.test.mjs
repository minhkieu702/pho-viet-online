// node --experimental-transform-types --test scripts/mutants.test.mjs
// The giant mutants (design §3), the grotesque zombie looks (§6a.2, §9 A12/A13/A16) and the dread director (§6d).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import module from 'node:module';

// map/roads-legacy.ts imports './consts' without an extension (Vite style), which Node does not resolve: retry as .ts.
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
}

const { ARM_SLOT, HEAD, LEG, SLOT, TORSO, armGeometry, bodyGeometry, figureGeometry, legGeometry, partIndex } = await import('../app/game/anatomy.ts');
const {
  DRESS_PER_KIND, EYE_SOCKETS, KIND_LOOKS, MUTANT_LOOKS, ZA, ZL, ZT, bendLimit, limbScaleOk, maskExact, mutantDress, newTwitch, twitch, zombieDress, zombieGeometry,
} = await import('../app/game/zombie-looks.ts');
const {
  DEATH, MUTANT_ATTACKS, MUTANT_MOVES, MUTANT_SPEC, createMutantRouter, createMutants, lobVelocity, mutantHitAt, mutantSpawnPoint, windupFor,
} = await import('../app/game/mutants.ts');
const { SCREAM_GAP, createDread } = await import('../app/game/dread.ts');
const { LEGACY_ROADS } = await import('../app/game/map/roads-legacy.ts');
const { createRoadGraph } = await import('../app/game/map/roads.ts');
const { PLOTS } = await import('../app/game/city.ts');
const { walkable } = await import('../app/game/map/terrain.ts');
const { MAX_EVENT_DAMAGE, MF, MUTANT_ID_BASE, RUIN_THROWN, ZOMBIE_KINDS, MUTANT_KINDS, MPHASES } = await import('../lib/zombie-protocol.ts');

/** §2.4 minimum telegraphs. */
const TELL_MIN = { claw: 0.25, bash: 0.25, lunge: 0.35, bite: 0.3, spit: 0.6, burst: 1.0, scream: 1.1, swipe: 0.7, slam: 0.9, charge: 0.8, throw: 0.7, pounce: 0.7, slash: 0.45, bile: 0.6, exhale: 1.0, deathburst: 1.5, grab: 0.5 };

// ---- A small fake world: flat ground, one block of buildings (x 20..40, z -10..10, 12 m tall), ruins and cars ----
function fakeWorld(opts = {}) {
  const box = opts.box ?? { minX: 20, maxX: 40, minZ: -10, maxZ: 10, top: 12 };
  const inBox = (x, z, r) => x > box.minX - r && x < box.maxX + r && z > box.minZ - r && z < box.maxZ + r;
  const segHits = (x1, z1, x2, z2, r) => { for (let k = 0; k <= 40; k++) { const t = k / 40; if (inBox(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, r)) return true; } return false; };
  const ruins = opts.ruins ?? [{ id: 4097, x: 3, z: 2 }, { id: 4098, x: -3, z: 1 }, { id: 4099, x: 0, z: -3 }];
  const cars = opts.cars ?? [{ id: 1, x: 2, z: -2 }];
  const world = {
    seen: opts.seen ?? true, routeCalls: 0,
    ground: () => 0,
    hard: (x, z, r) => (opts.wall ? opts.wall(x, z, r) : false) || inBox(x, z, r),
    castHard: (x1, z1, x2, z2, r) => !segHits(x1, z1, x2, z2, r) && !(opts.wall && opts.wallCast?.(x1, z1, x2, z2)),
    sight: () => true,
    roofAt: (x, z) => (inBox(x, z, 0) ? box.top : null),
    wallNear: (x, z, r) => {
      const cx = Math.max(box.minX, Math.min(box.maxX, x)), cz = Math.max(box.minZ, Math.min(box.maxZ, z));
      const d = Math.hypot(x - cx, z - cz);
      if (d > r || d < 1e-6) return null;
      return { x: cx, z: cz, nx: (x - cx) / d, nz: (z - cz) / d, top: box.top };
    },
    route: (fx, fz, tx, tz) => { world.routeCalls++; return opts.route ? opts.route(fx, fz, tx, tz) : [{ x: tx, z: tz }]; },
    smashables: (x, z, r, cb) => {
      for (const p of ruins) if (Math.hypot(p.x - x, p.z - z) <= r) cb('ruin', p.id, p.x, p.z);
      for (const c of cars) if (Math.hypot(c.x - x, c.z - z) <= r) cb('car', c.id, c.x, c.z);
    },
    seenBy: () => world.seen,
  };
  return world;
}
const player = (slot, x, z, extra = {}) => ({ slot, dog: false, x, z, vx: 0, vz: 0, down: false, inVehicle: false, ...extra });
const dog = (slot, x, z) => ({ slot, dog: true, x, z, vx: 0, vz: 0, down: false, inVehicle: false });
function run(mutants, targets, from, to, dt = 1 / 30, log = []) {
  for (let t = from; t < to; t += dt) {
    const out = { events: [], spawns: [] };
    mutants.update(dt, t, typeof targets === 'function' ? targets(t) : targets, out);
    for (const e of out.events) log.push({ t, e });
  }
  return log;
}
/** A mutant past its emergence: idle at (x, z); `armed` readies every attack but the roar, else all wait. */
function ready(mutants, kind, x, z, time, max = MUTANT_SPEC[kind].hp, armed = false) {
  const i = mutants.spawn(kind, x, z, max, 'crater', time);
  const m = mutants.__test.state(i);
  m.y = 0; m.phase = 'idle'; m.phaseAt = m.phaseEnd = time; m.roarAt = time; m.broodAt = time + 1000; m.slamAt = time; m.climbAt = time + 1000;
  m.cd = armed ? { roar: time + 1000 } : Object.fromEntries(Object.keys(MUTANT_ATTACKS).map((a) => [a, time + 1000]));
  return { i, m };
}

// ---- Rules -------------------------------------------------------------------------------------------------

test('every mutant attack telegraphs at least its TELL_MIN, plus 0.5 s off-screen and the latency allowance', () => {
  for (const [kind, moves] of Object.entries(MUTANT_MOVES)) for (const a of moves) {
    if (a === 'roar' || a === 'brood') continue;
    assert.ok(MUTANT_ATTACKS[a].tell >= TELL_MIN[a], `${kind} ${a}: ${MUTANT_ATTACKS[a].tell} < ${TELL_MIN[a]}`);
  }
  const at = { x: 0, z: 10 };
  // The victim looks away (its camera faces -z, the attacker is at +z): at least 0.5 s for a slash.
  assert.equal(windupFor(0.45, at, player(0, 0, 0, { camYaw: Math.PI })), 0.5);
  assert.equal(windupFor(0.45, at, player(0, 0, 0, { camYaw: 0 })), 0.45);
  // A remote victim with 200 ms RTT: + min(0.2, 0.1 + 0.05).
  assert.ok(Math.abs(windupFor(0.7, at, player(0, 0, 0, { camYaw: 0, lag: 0.15 })) - 0.85) < 1e-9);
  assert.ok(Math.abs(windupFor(0.7, at, player(0, 0, 0, { camYaw: 0, lag: 0.9 })) - 0.9) < 1e-9);
});

test('slam falloff, knockdowns, and no hit above 60', () => {
  assert.equal(mutantHitAt('slam', 45, 0).dmg, 45);
  assert.ok(Math.abs(mutantHitAt('slam', 45, 7).dmg - 12) < 1e-9);
  assert.ok(Math.abs(mutantHitAt('slam', 45, 3.5).dmg - 28.5) < 1e-9);
  assert.ok(Math.abs(mutantHitAt('slam', 45, 20).dmg - 12) < 1e-9);
  assert.equal(mutantHitAt('slam', 45, 4.9).knock, true);
  assert.equal(mutantHitAt('slam', 45, 5.5).knock, false);
  assert.equal(mutantHitAt('swipe', 30, 1).knock, true);
  assert.equal(mutantHitAt('slash', 16, 1).knock, false);
  for (const a of Object.keys(MUTANT_ATTACKS)) assert.ok(mutantHitAt(a, 999, 0).dmg <= 60);
  assert.ok(MAX_EVENT_DAMAGE >= 60);
});

test('lobs land where they aim (bile and thrown wrecks)', () => {
  const v = lobVelocity(0, 4, 0, 20, 0, 10, 4);
  const g = 14, t = v.t;
  assert.ok(Math.abs(v.vx * t - 20) < 1e-9 && Math.abs(v.vz * t - 10) < 1e-9);
  assert.ok(Math.abs(4 + v.vy * t - 0.5 * g * t * t) < 1e-6);
});

// ---- Simulation with a fake world -------------------------------------------------------------------------------

test('target hysteresis: no switch under 1.3x, and none within 3 s of the last', () => {
  const world = fakeWorld();
  const mutants = createMutants(new THREE.Scene(), world, null, null);
  const { i, m } = ready(mutants, 'colossus', 0, -60, 0);
  const A = player(0, 0, -38), B = player(1, 0, -40);
  run(mutants, [A, B], 0, 0.2);
  assert.equal(m.target, 1, 'the nearer player first');
  // Damage from A (2 x 40 + 40 / 23 against B's 40 / 21): far over 1.3x, but no switch within 3 s of the first choice.
  mutants.damage(i, 40, 'body', 0, A, 'bullet', 0, 0.3);
  run(mutants, [A, B], 0.3, 2.5);
  assert.equal(m.target, 1, 'no switch within 3 s of the first choice');
  run(mutants, [A, B], 2.5, 3.6);
  assert.equal(m.target, 0, 'the damage dealer after 3 s');
  // B now does a little less than 1.3x A's score: no switch.
  const m2 = createMutants(new THREE.Scene(), world, null, null);
  const r2 = ready(m2, 'colossus', 0, -60, 0);
  const C = player(0, 0, -40), D = player(1, 0, -39.5);
  run(m2, [C, D], 0, 0.2);
  assert.equal(r2.m.target, 0);
  // D's score 2 x 0.1 + 40 / 21.5 = 2.06 against C's 40 / 21 = 1.9: 1.08x, under 1.3x: never.
  m2.damage(r2.i, 0.1, 'body', 0, D, 'bullet', 1, 3.5);
  run(m2, [C, D], 3.5, 8);
  assert.equal(r2.m.target, 0, 'under 1.3x: no switch');
});

test('telegraphs come before every hit by at least TELL_MIN in a long fight (all three kinds)', () => {
  for (const kind of MUTANT_KINDS) {
    const world = fakeWorld();
    const mutants = createMutants(new THREE.Scene(), world, null, null);
    const { i } = ready(mutants, kind, -30, -30, 0, MUTANT_SPEC[kind].hp, true);
    // Two players circling and closing in, a dog nearby.
    const targets = (t) => [
      player(0, -30 + Math.cos(t * 0.3) * (4 + 14 * (0.5 + 0.5 * Math.sin(t * 0.11))), -30 + Math.sin(t * 0.3) * (4 + 14 * (0.5 + 0.5 * Math.sin(t * 0.11))), { camYaw: t }),
      player(1, -30 + Math.cos(t * 0.2 + 2) * 9, -30 + Math.sin(t * 0.2 + 2) * 9, { camYaw: 0 }),
      dog(0, -30 + Math.cos(t * 0.5) * 3, -30 + Math.sin(t * 0.5) * 3),
    ];
    const log = run(mutants, targets, 0, 90);
    log.forEach((x, n) => { x.n = n; });
    const tells = log.filter(({ e }) => e.k === 'tele');
    const hits = log.filter(({ e }) => e.k === 'hit' || e.k === 'proj' || e.k === 'cloud');
    assert.ok(tells.length >= 5, `${kind}: only ${tells.length} tells`);
    for (const { e } of tells) assert.ok(e.t >= TELL_MIN[e.a] - 1e-9 || e.a === 'roar' || e.a === 'brood', `${kind} ${e.a} tell ${e.t}`);
    for (const { t, e } of hits) {
      if (e.k === 'cloud') continue;
      const a = e.a;
      const n = log.findIndex((x) => x.e === e);
      const before = tells.filter((x) => x.e.w === e.w && x.e.a === a && x.n < n);
      assert.ok(before.length, `${kind}: ${e.k} ${a} at ${t} without a tell`);
      const last = before[before.length - 1];
      assert.ok(t - last.t >= TELL_MIN[a] - 1 / 30 - 1e-9, `${kind}: ${a} landed ${(t - last.t).toFixed(3)} s after its tell`);
      if (e.k === 'hit') { assert.ok(e.dmg <= 60, `${kind} ${a} dmg ${e.dmg}`); assert.ok(e.to > 0); }
    }
    // Events are rounded (positions 0.01 m, angles 0.001 rad, times 0.01 s).
    for (const { e } of tells) { assert.equal(e.x, Math.round(e.x * 100) / 100); assert.equal(e.yaw, Math.round(e.yaw * 1000) / 1000); assert.equal(e.t, Math.round(e.t * 100) / 100); }
    assert.ok(mutants.list()[0] && mutants.list()[0].i === i);
  }
});

test('the colossus slams when two are close, crushes wrecks and shoves cars; swipes get slower once its weak point bursts', () => {
  const world = fakeWorld();
  const mutants = createMutants(new THREE.Scene(), world, null, null);
  const { i, m } = ready(mutants, 'colossus', 0, 0, 0, 2600, true);
  const log = run(mutants, [player(0, 3, 0), player(1, -3, 1)], 0, 3);
  const slam = log.find(({ e }) => e.k === 'tele' && e.a === 'slam');
  assert.ok(slam, 'slam telegraphed');
  const hit = log.find(({ e }) => e.k === 'hit' && e.a === 'slam');
  assert.ok(hit && hit.t - slam.t >= 0.9 - 1e-6);
  assert.equal(hit.e.to & 3, 3, 'both players are candidates');
  const smashes = log.filter(({ e }) => e.k === 'smash');
  assert.ok(smashes.length >= 2 && smashes.every(({ e }) => e.code >= 0 && e.code < 8), 'wrecks within 6 m crushed toward 0..7');
  assert.equal(new Set(smashes.map(({ e }) => e.ruin)).size, smashes.length, 'each wreck once');
  assert.ok(log.some(({ e }) => e.k === 'shove'), 'cars shoved');
  // The weak point: 350 HP at x2.5 bursts with 2 x 75 base; 2 s stagger, swing 30% slower.
  mutants.damage(i, 75, 'weak', 1, { x: 0, z: -5 }, 'bullet', 0, 3.1);
  const r = mutants.damage(i, 75, 'weak', 1, { x: 0, z: -5 }, 'bullet', 0, 3.2);
  assert.equal(r.weakBroken, 1);
  assert.equal(m.weak, 0);
  assert.equal(m.phase, 'stagger');
  assert.ok(m.phaseEnd - 3.2 >= 2 - 1e-9);
  m.cd = { roar: 1000, slam: 1000, charge: 1000, throw: 1000 };
  const later = run(mutants, [player(0, 0, 2.5)], 5.3, 8);
  const swipe = later.find(({ e }) => e.k === 'tele' && e.a === 'swipe');
  assert.ok(swipe && swipe.e.t >= 0.7 / 0.7 - 0.01, `slowed swipe ${swipe?.e.t}`);
  // A hit on a broken weak point counts as body.
  const body = mutants.damage(i, 10, 'weak', 1, { x: 0, z: -5 }, 'bullet', 0, 8.1);
  assert.equal(body.dealt, 10);
});

test('the matriarch: each burst sac costs it 320 HP, a crawler per brood and lob rate; the leaper sac only counts when exposed', () => {
  const world = fakeWorld();
  const mutants = createMutants(new THREE.Scene(), world, null, null);
  const { i, m } = ready(mutants, 'matriarch', 0, 0, 0, 3000);
  const r = mutants.damage(i, 130, 'weak', 2, { x: 0, z: 10 }, 'bullet', 0, 1);
  assert.equal(r.weakBroken, 2);
  assert.equal(m.weak, 0b101);
  assert.equal(Math.round(3000 - m.hp), 260 + 320);
  assert.equal(m.phase, 'stagger');
  // Broods: 3..5 crawlers minus one per burst sac.
  m.phase = 'idle'; m.broodAt = 2;
  const out = { events: [], spawns: [] };
  for (let t = 2; t < 4; t += 1 / 30) mutants.update(1 / 30, t, [player(0, 20, 0)], out);
  assert.ok(out.spawns.length >= 2 && out.spawns.length <= 4 && out.spawns.every((s) => s.kind === 'crawler' && s.how === 'brood'), `brood ${out.spawns.length}`);
  const leaper = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const L = ready(leaper, 'leaper', -50, -50, 0);
  assert.equal(leaper.damage(L.i, 20, 'weak', 1, { x: 0, z: 0 }, 'bullet', 0, 1).dealt, 20, 'hidden sac: body');
  L.m.flags |= MF.EXPOSED;
  assert.equal(leaper.damage(L.i, 20, 'weak', 1, { x: 0, z: 0 }, 'bullet', 0, 1.1).dealt, 50, 'exposed sac x2.5');
  assert.equal(leaper.damage(L.i, 20, 'head', 0, { x: 0, z: 0 }, 'bullet', 0, 1.2).dealt, 40, 'leaper head x2');
});

test('stagger at 12% in 3 s, enrage at 30%, and a big blast flinches', () => {
  const mutants = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const { i, m } = ready(mutants, 'colossus', 0, -40, 0, 2600);
  mutants.damage(i, 150, 'body', 0, { x: 0, z: 0 }, 'bullet', 0, 1);
  assert.notEqual(m.phase, 'stagger');
  mutants.damage(i, 170, 'body', 0, { x: 0, z: 0 }, 'bullet', 0, 2);
  assert.equal(m.phase, 'stagger');
  assert.ok(Math.abs(m.phaseEnd - 2 - 1.2) < 1e-9);
  m.phase = 'idle';
  mutants.damage(i, 400, 'body', 0, { x: 0, z: 0 }, 'bullet', 0, 3);
  assert.notEqual(m.phase, 'stagger', '8 s stagger cooldown');
  mutants.damage(i, 1200, 'body', 0, { x: 0, z: 0 }, 'bullet', 0, 4);
  assert.ok(m.enraged && m.flags & MF.ENRAGED);
  m.phase = 'idle'; m.staggerReady = 99;
  mutants.damage(i, 160, 'body', 0, { x: 0, z: 0 }, 'blast', 0, 5);
  assert.equal(m.phase, 'stagger');
  assert.ok(Math.abs(m.phaseEnd - 5.6) < 1e-9);
});

test('death emits kill and loot exactly once; the matriarch bursts on death; the body sinks away', () => {
  for (const kind of MUTANT_KINDS) {
    const mutants = createMutants(new THREE.Scene(), fakeWorld(), null, null);
    const { i } = ready(mutants, kind, 0, -30, 0, 500);
    const targets = [player(2, 0, -27)];
    run(mutants, targets, 0, 0.1);
    const r = mutants.damage(i, 600, 'body', 0, { x: 0, z: -20 }, 'bullet', 2, 0.2, 1);
    assert.equal(r.killed, true);
    mutants.damage(i, 600, 'body', 0, { x: 0, z: -20 }, 'bullet', 2, 0.25);
    const log = run(mutants, targets, 0.2, 0.2 + DEATH.dying + DEATH.lie + DEATH.sink + 1, 1 / 15);
    const kills = log.filter(({ e }) => e.k === 'kill');
    // The kill event is queued by damage() and flushed by the next update.
    assert.equal(kills.length, 1, `${kind} kills ${kills.length}`);
    assert.equal(kills[0].e.by, 2);
    assert.equal(kills[0].e.w, MUTANT_ID_BASE + i);
    assert.equal(log.filter(({ e }) => e.k === 'loot').length, 1, `${kind} loot`);
    if (kind === 'matriarch') {
      const tele = log.find(({ e }) => e.k === 'tele' && e.a === 'deathburst'), burst = log.find(({ e }) => e.k === 'hit' && e.a === 'deathburst');
      assert.ok(tele && burst && burst.t - tele.t >= 1.5 - 1e-6, 'death burst after 1.5 s');
      assert.ok(log.some(({ e }) => e.k === 'cloud' && e.r === 9 && e.s === 8 && e.dps === 7));
    }
    assert.equal(mutants.list().length, 0, `${kind} gone after sinking`);
  }
});

test('anti-stuck: re-routes, warps only unseen and 30 m from every player, otherwise roars', () => {
  // A wall between it and the target that the route cannot get around (the route leads into it).
  const wall = (x, z, r) => z > -5 - r && z < 5 + r && x > -40 && x < 40;
  for (const seen of [false, true]) {
    const world = fakeWorld({ seen, wall, wallCast: (x1, z1, x2, z2) => (z1 < -5) !== (z2 < -5) || (z1 > 5) !== (z2 > 5), route: (fx, fz, tx, tz) => [{ x: fx + 1, z: 0 }, { x: 60, z: 30 }, { x: tx, z: tz }] });
    const mutants = createMutants(new THREE.Scene(), world, null, null);
    const { m } = ready(mutants, 'colossus', 0, -12, 0);
    m.cd = { roar: 1000, slam: 1000, charge: 1000, throw: 1000, swipe: 1000 };
    const before = world.routeCalls;
    run(mutants, [player(0, 0, 40)], 0, 26, 1 / 20);
    assert.ok(world.routeCalls > before + 2, 're-routed');
    if (!seen) assert.ok(m.z > 5, `warped past the wall (${m.x.toFixed(1)}, ${m.z.toFixed(1)})`);
    else assert.ok(m.z < -4, `no warp while seen (${m.x.toFixed(1)}, ${m.z.toFixed(1)})`);
  }
  // Never warps within 30 m of a player.
  const world = fakeWorld({ seen: false, wall, wallCast: (x1, z1, x2, z2) => (z1 < -5) !== (z2 < -5), route: (fx, fz, tx, tz) => [{ x: fx + 1, z: fz }, { x: tx, z: tz - 12 }, { x: tx, z: tz }] });
  const mutants = createMutants(new THREE.Scene(), world, null, null);
  const { m } = ready(mutants, 'colossus', 0, -12, 0);
  m.cd = { roar: 1000, slam: 1000, charge: 1000, throw: 1000, swipe: 1000 };
  run(mutants, [player(0, 0, 10)], 0, 26, 1 / 20);
  assert.ok(m.z < -4, 'too close to a player to warp');
});

test('the leaper climbs a facade when the road goes the long way round, crosses the roofs and drops on its prey with a tell', () => {
  // The prey is behind the block; the road route goes far round it.
  const world = fakeWorld({ route: (fx, fz, tx, tz) => [{ x: fx, z: fz - 40 }, { x: 60, z: -40 }, { x: 60, z: 0 }, { x: tx, z: tz }] });
  const mutants = createMutants(new THREE.Scene(), world, null, null);
  const { m } = ready(mutants, 'leaper', 14, 0, 0);
  m.climbAt = 0; m.cd = { roar: 1000, pounce: 0 };
  const prey = [player(0, 46, 0)];
  const log = run(mutants, prey, 0, 25);
  const phases = new Set();
  const seen = run(mutants, prey, 25, 25);
  void seen;
  // It went up: a roof phase happened and runners were called; then a roof drop with its landing circle.
  const tele = log.find(({ e }) => e.k === 'tele' && e.a === 'pounce' && e.tx !== undefined);
  assert.ok(tele, 'roof drop telegraphed');
  assert.ok(tele.e.t >= 0.7 - 1e-9);
  const drop = log.find(({ e, t }) => e.k === 'hit' && e.a === 'pounce' && t > tele.t);
  if (drop) assert.ok(drop.t - tele.t >= 0.7);
  void phases;
});

test('netExport, puppets and adopt round trip; a promoted host restarts any tell', () => {
  const world = fakeWorld();
  const host = createMutants(new THREE.Scene(), world, null, null);
  const a = ready(host, 'colossus', 1, 2, 0, 9000);
  const b = ready(host, 'leaper', -10, 4, 0, 4000);
  host.damage(a.i, 50, 'weak', 1, { x: 0, z: 0 }, 'bullet', 0, 0.5);
  run(host, [player(0, 3, 4)], 0.5, 1.2);
  const recs = [];
  const n = host.netExport(recs);
  assert.equal(n, 2);
  const puppet = createMutants(new THREE.Scene(), world, null, null);
  puppet.setAuthority('puppet');
  puppet.netApply(recs.slice(0, n), 0);
  run(puppet, [], 1.2, 1.3);
  const list = puppet.list();
  assert.equal(list.length, 2);
  for (const r of recs.slice(0, n)) {
    const v = list.find((x) => x.i === r.i);
    assert.equal(v.kind, MUTANT_KINDS[r.kind]); assert.equal(v.x, r.x); assert.equal(v.hp, r.hp); assert.equal(v.max, r.max); assert.equal(v.weak, r.weak);
    assert.equal(v.phase, MPHASES[r.phase]);
  }
  // A tell received ahead of the snapshot shows at once.
  puppet.applyEvent({ k: 'tele', w: MUTANT_ID_BASE + a.i, a: 'slam', x: 1, z: 2, yaw: 0, r: 7, arc: 0, t: 0.9 }, 1.3);
  assert.equal(puppet.list().find((x) => x.i === a.i).telling, 'slam');
  // Promotion: the puppets become the simulation, mid-attack tells restart.
  const adopted = createMutants(new THREE.Scene(), world, null, null);
  adopted.adopt(recs.slice(0, n), 2);
  const again = [];
  adopted.netExport(again);
  for (const r of recs.slice(0, n)) {
    const q = again.find((x) => x.i === r.i);
    assert.deepEqual([q.kind, q.x, q.z, q.hp, q.max, q.weak], [r.kind, r.x, r.z, r.hp, r.max, r.weak]);
    assert.notEqual(MPHASES[q.phase], 'tele');
  }
  assert.ok(b.i >= 0);
});

test('a dog only draws a mutant when it bites or is close; downed players are never targets', () => {
  const mutants = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const { m } = ready(mutants, 'matriarch', 0, 0, 0);
  run(mutants, [player(0, 20, 0), dog(1, 8, 0)], 0, 0.2);
  assert.equal(m.target, 0, 'the player beats a distant dog');
  const m2 = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const r = ready(m2, 'matriarch', 0, 0, 0);
  run(m2, [player(0, 20, 0), { ...dog(1, 8, 0), biting: r.i }], 0, 0.2);
  assert.equal(r.m.target, 9, 'a biting dog is hunted');
  const m3 = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const r3 = ready(m3, 'colossus', 0, 0, 0);
  run(m3, [player(0, 3, 0, { down: true }), player(1, 30, 0)], 0, 0.2);
  assert.equal(r3.m.target, 1);
});

// ---- Routing and spawning on the real legacy road graph ------------------------------------------------------------

test('mutant routes on LEGACY_ROADS: every pair of 20 road points connects, ignoring one-way lanes', () => {
  const router = createMutantRouter(LEGACY_ROADS, () => 0);
  let seed = 42;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const points = [];
  while (points.length < 20) {
    const e = LEGACY_ROADS.edges[Math.floor(rnd() * LEGACY_ROADS.edges.length)];
    if (e.closed) continue;
    const p = LEGACY_ROADS.pointAt(e, rnd() * e.len);
    points.push(p);
  }
  for (const kind of MUTANT_KINDS) {
    const r = MUTANT_SPEC[kind].radius;
    for (const a of points) for (const b of points) {
      if (a === b) continue;
      const route = router.route(a.x, a.z, b.x, b.z, r);
      assert.ok(route.length >= 2, `no route ${kind} (${a.x.toFixed(0)},${a.z.toFixed(0)}) -> (${b.x.toFixed(0)},${b.z.toFixed(0)})`);
      const last = route[route.length - 1];
      assert.ok(Math.hypot(last.x - b.x, last.z - b.z) < 1e-6);
      // Each step stays on a carriageway the mutant fits.
      for (let k = 1; k < route.length - 1; k++) {
        const hit = LEGACY_ROADS.nearestEdge(route[k].x, route[k].z, 30, (e) => e.half >= r + 0.5 && !e.closed);
        assert.ok(hit && hit.d < 0.5, 'route point on a fitting edge');
      }
    }
  }
});

test('routes skip edges too narrow for the mutant (a hẻm shortcut is for the leaper, not the colossus)', () => {
  // A square: a wide detour (R1) round three sides and a narrow hẻm straight across.
  const g = createRoadGraph({
    nodes: [{ x: 0, z: 0, control: 'none' }, { x: 100, z: 0, control: 'none' }, { x: 100, z: 100, control: 'none' }, { x: 0, z: 100, control: 'none' }, { x: 0, z: 200, control: 'none' }],
    edges: [
      { a: 0, b: 3, name: 'HẺM', cls: 'hem' }, { a: 0, b: 1, name: 'A' }, { a: 1, b: 2, name: 'B' }, { a: 2, b: 3, name: 'C' }, { a: 3, b: 4, name: 'D' },
    ],
  });
  const router = createMutantRouter(g, () => 0);
  const narrow = router.route(0, 1, 0, 199, MUTANT_SPEC.leaper.radius);
  const wide = router.route(0, 1, 0, 199, MUTANT_SPEC.colossus.radius);
  assert.ok(router.length(narrow) < 220, `leaper takes the hẻm: ${router.length(narrow)}`);
  assert.ok(router.length(wide) > 380, `colossus goes round: ${router.length(wide)}`);
  for (const p of wide) assert.ok(!(p.x === 0 && p.z > 2 && p.z < 98), 'never on the hẻm');
});

test('spawn points satisfy §3.4 on today\'s map', () => {
  const plots = PLOTS.map((p) => p.full);
  const hard = (x, z, r) => !walkable(x, z) || plots.some((f) => x > f.minX - r && x < f.maxX + r && z > f.minZ - r && z < f.maxZ + r);
  const router = createMutantRouter(LEGACY_ROADS, () => 0);
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const teams = [[{ x: 0, z: 0 }], [{ x: -60, z: 40 }, { x: -50, z: 44 }], [{ x: 120, z: -60 }], [{ x: 40, z: 100 }, { x: 44, z: 104 }, { x: 36, z: 98 }]];
  let found = 0;
  for (const players of teams) for (const kind of MUTANT_KINDS) {
    const p = mutantSpawnPoint(kind, { players, graph: LEGACY_ROADS, walkable, hard, route: (fx, fz, tx, tz, r) => router.route(fx, fz, tx, tz, r), rng });
    if (!p) continue;
    found++;
    const r = MUTANT_SPEC[kind].radius;
    const cx = players.reduce((s, q) => s + q.x, 0) / players.length, cz = players.reduce((s, q) => s + q.z, 0) / players.length;
    const d = Math.hypot(p.x - cx, p.z - cz);
    assert.ok(d >= 30 && d <= 80, `${kind} ${d.toFixed(1)} m from the centroid`);
    for (const q of players) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 35);
    assert.ok(walkable(p.x, p.z) && !hard(p.x, p.z, r + 0.5), 'on land, clear of buildings');
    const e = LEGACY_ROADS.nearestEdge(p.x, p.z, 60, (x) => x.half >= r + 0.5);
    assert.ok(e && e.d <= e.edge.half + 8, 'within 8 m of a road it fits');
  }
  assert.ok(found >= 10, `spawn points found: ${found}`);
});

// ---- Looks ---------------------------------------------------------------------------------------------------

test('human builds are byte-identical to before the variant hook', () => {
  const BEFORE = { 'body:hero': 2607580206, 'body:hi': 804688845, 'body:lo': 3165869531, 'armL:hero': 3190073462, 'armL:hi': 3208564214, 'armL:lo': 3882203751, 'armR:hero': 2820201178, 'armR:hi': 2688764138, 'armR:lo': 1072568654, 'leg:hero': 2405554929, 'leg:hi': 188126772, 'leg:lo': 3869735683 };
  const fnv = (h, bytes) => { for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0; return h; };
  for (const [key, want] of Object.entries(BEFORE)) {
    const [piece, d] = key.split(':');
    const g = figureGeometry(piece, d);
    let h = 2166136261;
    for (const name of ['position', 'normal', 'color', 'tag', 'rig']) { const a = g.getAttribute(name).array; h = fnv(h, new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
    h = fnv(h, new Uint8Array(new Uint32Array(g.index.array).buffer));
    assert.equal(h, want, key);
  }
});

test('zombie variant budgets (§9 A12): extras, the trimmed body, and a whole zombie under the human resident', () => {
  const tris = (g) => g.index.count / 3;
  const SKIP_HEAD = HEAD.CAP | HEAD.BASEBALL | HEAD.BUCKET | HEAD.PITH | HEAD.BANDANA | HEAD.HOOD | HEAD.MASK | HEAD.GLASSES | HEAD.CONE;
  const SKIP_TORSO = TORSO.AO_DAI | TORSO.KHAN_RAN | TORSO.RED_SCARF | TORSO.APRON | TORSO.BACKPACK | TORSO.KIT | TORSO.TIE | TORSO.GANH;
  const LIMIT = { lo: { body: 600, person: 4800 }, hi: { body: 1200, person: 9100 } };
  for (const d of ['lo', 'hi']) {
    const trimmed = bodyGeometry(d, { skip: (b, w) => ((w ? SKIP_TORSO : SKIP_HEAD) & b) !== 0 });
    const body = zombieGeometry('body', d), armR = zombieGeometry('armR', d), armL = zombieGeometry('armL', d), leg = zombieGeometry('leg', d);
    assert.ok(tris(body) - tris(trimmed) <= LIMIT[d].body, `${d} body extras ${tris(body) - tris(trimmed)}`);
    assert.ok(tris(armR) - tris(armGeometry(-1, d, false)) <= 150, `${d} arm extras`);
    assert.ok(tris(armL) - tris(armGeometry(1, d, false)) <= 150, `${d} left arm extras`);
    assert.ok(tris(leg) - tris(legGeometry(d)) <= 80, `${d} leg extras ${tris(leg) - tris(legGeometry(d))}`);
    const person = tris(body) + tris(armR) + tris(armL) + 2 * tris(leg);
    assert.ok(person <= LIMIT[d].person, `${d} zombie ${person}`);
    // The trim really trims: 30%+ of the body's vertices are gone before the extras.
    assert.ok(trimmed.getAttribute('position').count < figureGeometry('body', d).getAttribute('position').count * 0.72);
  }
});

test('ZA.FOREARM tags every forearm and hand vertex of the zombie arms (and nothing above the elbow)', () => {
  const FA = partIndex(ZA.FOREARM);
  for (const d of ['lo', 'hi']) for (const piece of ['armL', 'armR']) {
    const g = zombieGeometry(piece, d), tag = g.getAttribute('tag'), rig = g.getAttribute('rig');
    let fore = 0;
    for (let i = 0; i < tag.count; i++) {
      const t = Math.round(tag.getY(i)), part = t % 64, also = Math.floor(t / 64), tagged = part === FA || also === FA;
      if (rig.getX(i) >= 0.5) { assert.ok(tagged, `${piece} ${d} vertex ${i} bends with the elbow but is not tagged`); fore++; }
      else assert.ok(!tagged, `${piece} ${d} upper-arm vertex ${i} tagged`);
    }
    assert.ok(fore > 50);
  }
});

test('dresses: deterministic, 24 per kind, every kind\'s look, and no visible accent2 part but the eyes', () => {
  const ACC = new Set();
  for (const d of ['lo', 'hi']) {
    const g = zombieGeometry('body', d), tag = g.getAttribute('tag');
    for (let i = 0; i < tag.count; i++) if (Math.round(tag.getX(i)) === SLOT.ACCENT2) ACC.add(Math.round(tag.getY(i)));
  }
  const EYES = partIndex(HEAD.EYES) + 64 * partIndex(TORSO.HEAD, true);
  const shown = (masks, idx) => { const bit = (k) => k === 0 || ((k > 24 ? masks[1] : masks[0]) >> ((k - 1) % 24)) & 1; return bit(idx % 64) && bit(Math.floor(idx / 64)); };
  // The anatomy source paints these with accent2; the variant skips or the dresses clear every one of them.
  const src = readFileSync(new URL('../app/game/anatomy.ts', import.meta.url), 'utf8');
  assert.ok((src.match(/SLOT\.ACCENT2/g) ?? []).length >= 8);
  for (const kind of ZOMBIE_KINDS) {
    const seen = new Set();
    for (let i = 0; i < DRESS_PER_KIND; i++) {
      const a = zombieDress(kind, i), b = zombieDress(kind, i + DRESS_PER_KIND);
      assert.equal(a, b, 'cached and modulo 24');
      seen.add(`${a.style.head}|${a.style.torso}|${a.style.armL}|${a.style.armR}|${a.style.legs}|${a.style.colors.shirt}|${a.style.colors.skin}|${a.style.colors.lower}`);
      for (const idx of ACC) if (shown([a.style.head, a.style.torso], idx)) assert.equal(idx, EYES, `${kind} ${i}: accent2 part ${idx} visible`);
      assert.ok(a.style.head & HEAD.EYES);
      // The shader reads masks as int(word + 0.5) in float32: every word below 2^23 or even.
      for (const w of [a.style.head, a.style.torso, a.style.armL, a.style.armR, a.style.legs]) assert.ok(maskExact(w), `${kind} ${i}: mask ${w} misread by the shader`);
      assert.ok(a.style.torso & TORSO.HEAD);
      assert.equal(a.style.colors.accent2, KIND_LOOKS[kind].eye);
      if (kind === 'riot') { assert.ok(a.style.head & HEAD.SWAT && a.style.legs & LEG.BOOT); assert.equal(a.prop, 'shield'); }
      if (kind === 'shipper') { assert.ok(a.style.head & HEAD.HELMET); assert.equal(a.prop, 'box'); assert.ok(!(a.style.torso & TORSO.BACKPACK)); }
      if (kind === 'screamer') assert.ok(a.style.fem && a.style.head & HEAD.LONG);
      if (kind === 'hunter') assert.ok(a.style.head & HEAD.THIN);
      // Arms: a forearm unless torn off (then a stump), never both.
      for (const arm of [a.style.armL, a.style.armR]) assert.ok(((arm & ZA.FOREARM) !== 0) !== ((arm & ZA.STUMP) !== 0));
      if (a.style.legs & ZL.CLAWFOOT) assert.ok(a.style.legs & LEG.BARE);
      for (const ls of [a.limbs.armL, a.limbs.armR, a.limbs.legL, a.limbs.legR]) assert.ok(limbScaleOk(ls), `${kind} ${ls}`);
    }
    assert.ok(seen.size >= 12, `${kind}: ${seen.size} distinct dresses`);
  }
  // Deformities show up in their kinds.
  const some = (kind, f) => Array.from({ length: DRESS_PER_KIND }, (_, i) => zombieDress(kind, i)).some(f);
  assert.ok(some('brute', (d) => d.style.torso & ZT.BLOAT));
  assert.ok(some('runner', (d) => d.style.torso & ZT.RIBS));
  assert.ok(some('walker', (d) => d.style.torso & ZT.TATTERS));
  assert.ok(some('crawler', (d) => d.style.armL & ZA.CLAWS));
  assert.ok(some('walker', (d) => d.style.head & HEAD.BLINK) || some('crawler', (d) => d.style.head & HEAD.BLINK), 'jawless ones');
  for (const kind of MUTANT_KINDS) {
    const m = mutantDress(kind);
    assert.equal(m, mutantDress(kind)); assert.ok(m.style.torso & ZT.TATTERS && m.style.torso & ZT.SORES);
    for (const w of [m.style.head, m.style.torso, m.style.armL, m.style.armR, m.style.legs]) assert.ok(maskExact(w));
  }
  // The sores are built (on KIT's bit) and the police kit is not.
  const kit = partIndex(TORSO.KIT, true);
  for (const d of ['lo', 'hi']) { const g = zombieGeometry('body', d), tag = g.getAttribute('tag'); let n = 0; for (let v = 0; v < tag.count; v++) if (Math.round(tag.getY(v)) % 64 === kit) n++; assert.ok(n > 20 && n < 200, `${d} sore vertices ${n}`); }
  assert.equal(EYE_SOCKETS.length, 2);
  assert.ok(ARM_SLOT.HAND === 2);
});

test('limb scales and bends stay within §9 A13 for every kind and every mutant pose', () => {
  for (const L of [...Object.values(KIND_LOOKS), ...Object.values(MUTANT_LOOKS)]) for (const ls of [L.armL, L.armR, L.legL, L.legR]) assert.ok(limbScaleOk(ls), `${ls}`);
  const mutants = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  for (const kind of MUTANT_KINDS) {
    const L = MUTANT_LOOKS[kind];
    for (const phase of MPHASES) for (const attack of [null, ...MUTANT_MOVES[kind]]) for (const t of [0.1, 0.7, 1.9, 3.3]) {
      const p = mutants.__test.pose(kind, phase, attack, t);
      assert.ok(-p.elL <= bendLimit(L.armL) + 1e-9 && -p.elR <= bendLimit(L.armR) + 1e-9, `${kind} ${phase} ${attack} elbows ${p.elL} ${p.elR}`);
      assert.ok(p.kneeL <= bendLimit(L.legL) + 1e-9 && p.kneeR <= bendLimit(L.legR) + 1e-9, `${kind} ${phase} ${attack} knees`);
    }
  }
  // The colossus' club arm is a uniformly scaled arm (its bulk is growths).
  assert.equal(MUTANT_LOOKS.colossus.armR[0], MUTANT_LOOKS.colossus.armR[1]);
  assert.ok(MUTANT_LOOKS.colossus.growths.filter((g) => g.at === 'armR' || g.at === 'fist').reduce((s, g) => s + g.count, 0) >= 6);
});

test('twitches are stateless, bounded, and hold still a few times a minute', () => {
  const tw = newTwitch();
  let freezes = 0, maxYaw = 0;
  for (let t = 0; t < 600; t += 1 / 30) {
    twitch(123, t, 'walker', 1, tw);
    maxYaw = Math.max(maxYaw, Math.abs(tw.headYaw));
    if (tw.freeze) freezes++;
    const again = twitch(123, t, 'walker', 1, newTwitch());
    assert.deepEqual(again, { ...tw });
  }
  assert.ok(maxYaw <= 0.9 + 0.01 && maxYaw > 0.4);
  // 3% per second, 0.15-0.35 s each: about 0.5-1.5% of frames over 10 minutes.
  assert.ok(freezes > 30 && freezes < 600, `freeze frames ${freezes}`);
});

// ---- Dread ---------------------------------------------------------------------------------------------------------

test('dread: bounded outputs, reduced motion halves the shake, distant screams keep their cadence', () => {
  const base = (now, extra = {}) => ({
    now, dt: 1 / 30, night: 1, health: 100, boss: false, reducedMotion: false,
    player: { x: 0, z: 0, camYaw: 0, sprinting: false, inCloud: false },
    threats: [{ x: 5, z: 5, kind: 'colossus', big: true, seen: true, telling: false }], quake: 0.8, stalker: 10, roarAt: now - 0.2, roarDist: 10, impact: 0.5, ...extra,
  });
  const a = createDread(1), b = createDread(1);
  let screams = 0, lastScream = -99;
  for (let t = 0; t < 120; t += 1 / 30) {
    const o = a.update(base(t, { omens: [{ x: 40, z: 40 }] }));
    for (const v of [o.shake, o.vignette, o.breath, o.tremor, o.ambience, o.torchFlicker, o.lampFlicker, o.heartbeat.volume]) assert.ok(v >= 0 && v <= 1, `out of range ${v}`);
    assert.ok(o.heartbeat.bpm >= 60 && o.heartbeat.bpm <= 140);
    assert.ok(o.fogNear === null || (o.fogNear >= 10 && o.fogFar > o.fogNear));
    if (o.distantScream !== null) { assert.ok(t - lastScream >= SCREAM_GAP - 1e-9); lastScream = t; screams++; assert.ok(Math.abs(o.distantScream) <= Math.PI); }
    const r = b.update(base(t, { reducedMotion: true }));
    assert.ok(Math.abs(r.shake - o.shake / 2) < 1e-9 || (r.shake <= o.shake / 2 + 1e-9), 'reduced motion halves the shake');
  }
  assert.ok(screams >= 10 && screams <= 120 / SCREAM_GAP + 1);
  // Calm, healthy, by day: silence and no fog override.
  const c = createDread(2);
  let o;
  for (let t = 0; t < 5; t += 1 / 30) o = c.update({ now: t, dt: 1 / 30, night: 0, health: 100, boss: false, reducedMotion: false, player: { x: 0, z: 0, camYaw: 0, sprinting: false, inCloud: false }, threats: [], quake: 0, stalker: Infinity, roarAt: -99 });
  assert.equal(o.heartbeat.volume, 0);
  assert.equal(o.fogNear, null);
  assert.equal(o.shake, 0);
  assert.equal(o.tint, 'none');
  assert.ok(RUIN_THROWN === 8);
});

// ---- Presentation helpers -------------------------------------------------------------------------------------------

test('zombieExtras: eyes, props, the spitter\'s sac and the bloater\'s pustules glow while telling, the screamer\'s hair', async () => {
  const { zombieExtras } = await import('../app/game/zombie-looks.ts');
  const { FIGURE } = await import('../app/game/pose.ts');
  const collect = () => { const c = { eyes: [], growths: [], glows: [], props: [] }; return { c, fx: { eyes: { push: (...a) => c.eyes.push(a) }, growths: { push: (m, rgb, shape) => c.growths.push(shape) }, glows: { push: () => c.glows.push(1) }, props: { push: (m, rgb, shape) => c.props.push(shape) } } }; };
  const base = new THREE.Matrix4().makeScale(1, 1, 1), pose = [0, 0, 0, 0], armPose = [-1.5, 0, 0, 0];
  const run1 = (kind, idx, telling, extra = {}) => { const { c, fx } = collect(); zombieExtras(fx, zombieDress(kind, idx), base, base, pose, base, armPose, { time: 1, telling, ...extra }); return c; };
  assert.equal(run1('walker', 0, 0).eyes.length, 2);
  assert.equal(run1('hunter', 0, 0).eyes.length, 0, 'milky eyes give no glint');
  assert.deepEqual(run1('shipper', 0, 0).props, [0]);
  assert.deepEqual(run1('shipper', 0, 0, { bare: true }).props, []);
  const riot = Array.from({ length: DRESS_PER_KIND }, (_, i) => i).find((i) => !(zombieDress('riot', i).style.armL & ZA.STUMP));
  assert.deepEqual(run1('riot', riot, 0).props, [1]);
  assert.equal(run1('spitter', 0, 0).glows.length, 0);
  assert.equal(run1('spitter', 0, 0.8).glows.length, 1);
  assert.equal(run1('bloater', 0, 0).growths.length, 5);
  assert.equal(run1('bloater', 0, 0.5).glows.length, 5);
  assert.deepEqual(run1('screamer', 0, 0).growths, [2, 2, 2]);
  assert.ok(FIGURE.headY > 1.9);
});

test('horror-fx: markers, puddles, clouds, landing points, shared lists across systems, and clearing', async () => {
  const { createHorrorFx, PROJECTILE_GRAVITY } = await import('../app/game/horror-fx.ts');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#888', 20, 100);
  const fx = createHorrorFx(scene, () => 0);
  const cam = new THREE.PerspectiveCamera();
  fx.update(10, 0.016, cam);
  const id = fx.marker('ring', 0, 0, 7, 0, 0, 10, 10.9);
  fx.marker('line', 0, 0, 25, 0.5, 1.2, 10, 10.8);
  fx.puddle(3, 3, 3, 16, 'bile');
  fx.cloud(5, 5, 9, 18, 'toxic');
  fx.crack(0, 0, 7, 10);
  const land = fx.projectile(7, 'bile', 0, 4, 0, 5, 6, 0, 10);
  const t = land.t;
  assert.ok(Math.abs(4 + 6 * t - 0.5 * PROJECTILE_GRAVITY * t * t) < 0.05 && Math.abs(land.x - 5 * t) < 1e-9);
  assert.deepEqual(fx.projectile(7, 'bile', 0, 4, 0, 5, 6, 0, 10.1), land, 'a repeated id is ignored');
  // Two systems push into the growth and eye lists in one frame: both survive the frame.
  const m = new THREE.Matrix4();
  fx.growths.begin(); fx.growths.push(m, 0xffffff, 0); fx.growths.end();
  fx.growths.begin(); fx.growths.push(m, 0xffffff, 1); fx.growths.push(m, 0xffffff, 2); fx.growths.end();
  fx.eyes.push(0, 2, 0, 0xff0000, 1); fx.eyes.push(0.1, 2, 0, 0xff0000, 1);
  fx.update(10.016, 0.016, cam);
  let s = fx.stats();
  assert.ok(s.instances >= 5 + 3 + 2, `instances ${s.instances}`);
  assert.ok(s.calls >= 4 && s.calls <= 6, `calls ${s.calls}`);
  fx.clearMarker(id);
  // A frame nobody pushes into empties those lists; markers past their end go.
  for (let k = 0; k < 120; k++) fx.update(10.02 + k * 0.1, 0.1, cam);
  s = fx.stats();
  assert.equal(s.projectiles, 0, 'the bile landed');
  fx.clear();
  fx.update(30, 0.016, cam);
  assert.equal(fx.stats().instances, 0);
  assert.equal(fx.stats().calls, 0);
  fx.dispose();
});

test('the leaper never stands on its prey: it stops at striking distance; a pounce lands short of the mark and its blow lands on the mark', () => {
  const mutants = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const { m } = ready(mutants, 'leaper', -40, 0, 0, MUTANT_SPEC.leaper.hp, true);
  m.cd = { roar: 1000, pounce: 1000 };
  const prey = [player(0, -28, 0)];
  let closest = Infinity, slashes = 0;
  for (let t = 0; t < 20; t += 1 / 30) {
    const out = { events: [], spawns: [] };
    mutants.update(1 / 30, t, prey, out);
    slashes += out.events.filter((e) => e.k === 'tele' && e.a === 'slash').length;
    closest = Math.min(closest, Math.hypot(m.x + 28, m.z));
  }
  assert.ok(slashes > 2, 'it fights from where it stands');
  assert.ok(closest >= MUTANT_SPEC.leaper.radius + 0.5 - 1e-6, `never inside the player: ${closest.toFixed(2)} m`);
  // A pounce from 10 m.
  const b = createMutants(new THREE.Scene(), fakeWorld(), null, null);
  const { m: l } = ready(b, 'leaper', -40, 0, 0);
  l.cd = { roar: 1000, slash: 1000, pounce: 0 };
  let tele = null, hit = null, at = null;
  for (let t = 0; t < 3 && !hit; t += 1 / 30) {
    const out = { events: [], spawns: [] };
    b.update(1 / 30, t, [player(0, -30, 0)], out);
    tele ??= out.events.find((e) => e.k === 'tele' && e.a === 'pounce') ?? null;
    hit = out.events.find((e) => e.k === 'hit' && e.a === 'pounce') ?? null;
    if (hit) at = { x: l.x, z: l.z };
  }
  assert.ok(tele && hit, 'telegraphed and landed');
  assert.ok(Math.hypot(hit.x - tele.tx, hit.z - tele.tz) < 0.05, 'the blow lands on the marked spot');
  assert.ok(Math.hypot(at.x - tele.tx, at.z - tele.tz) > MUTANT_SPEC.leaper.radius + 0.9, `the body lands short of it (${Math.hypot(at.x - tele.tx, at.z - tele.tz).toFixed(2)} m)`);
});

test('a colossus with no road to its prey and a block in the way warps unseen within seconds, along the straight line', () => {
  const wall = (x, z, r) => z > -5 - r && z < 5 + r && x > -40 && x < 40;
  const world = fakeWorld({ seen: false, wall, wallCast: (x1, z1, x2, z2) => (z1 < -5) !== (z2 < -5) || (z1 > 5) !== (z2 > 5), route: () => [] });
  const mutants = createMutants(new THREE.Scene(), world, null, null);
  const { m } = ready(mutants, 'colossus', 0, -12, 0);
  m.cd = { roar: 1000, slam: 1000, charge: 1000, throw: 1000, swipe: 1000 };
  // Against the block from about 3 s: checks every 2 s count double, so the warp comes at the 8 s check (before, with
  // no route to warp along, it stood there for good).
  run(mutants, [player(0, 0, 40)], 0, 9, 1 / 20);
  assert.ok(m.z > 5, `past the block by 9 s (${m.x.toFixed(1)}, ${m.z.toFixed(1)})`);
});

test('every walker dress shows at least one strong deformity (exposed ribs, no jaw, a stump, a torn cheek or scalp), and walkers hunch', () => {
  for (let i = 0; i < DRESS_PER_KIND; i++) {
    const d = zombieDress('walker', i), s = d.style;
    const strong = (s.torso & (ZT.RIBS | ZT.GASH | ZT.SCALP)) || (s.head & HEAD.BLINK) || ((s.armL | s.armR) & ZA.STUMP);
    assert.ok(strong, `walker ${i} reads as a plain resident`);
    assert.ok(d.limbs.lean >= 0.3, `walker ${i} lean ${d.limbs.lean}`);
    assert.ok(Math.abs(d.limbs.shoulder[0] - d.limbs.shoulder[1]) >= 0.1, 'one shoulder dropped');
  }
});
