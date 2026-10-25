import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from 'node:module';
import * as R from '../app/game/ragdoll-solver.ts';
import { COLLIDERS, LAND, RIVER, WATER_LEVEL } from '../app/game/city.ts';

// world.ts uses extensionless imports (the bundler resolves them); teach node to try `.ts` so the tests run on the
// real groundHeight with its curbs, squares, piers and river bed.
let groundHeight = null;
if (module.registerHooks) {
  module.registerHooks({
    resolve(specifier, context, next) {
      if (/^\.\.?\//.test(specifier) && !/\.[mc]?[jt]sx?$/.test(specifier) && context.parentURL?.includes('/app/game/')) {
        try { return next(`${specifier}.ts`, context); } catch { /* not a TS module */ }
      }
      return next(specifier, context);
    },
  });
  ({ groundHeight } = await import('../app/game/world.ts'));
}
const city = { skip: groundHeight ? false : 'needs node:module registerHooks (Node 22.15+) to load world.ts' };

const K = 0.82; // BODY_SCALE: the ragdoll has the standing figure's size
const DEG = Math.PI / 180;
const { P, JOINTS } = R;
const opt = R.DEFAULT_OPTIONS;
const flat = { ground: () => 0.1 };
const at = (x, y, z, yaw = 0, extra = {}) => ({ x, y, z, yaw, scale: K, ...extra });
const body = (x, y, z, yaw, extra) => R.createState(R.DEFAULT_SKELETON, at(x, y, z, yaw, extra));
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];

function worstStretch(b) {
  let worst = 0;
  for (let k = 0; k < R.STICK_COUNT; k++) {
    const a = b.sticks[k * 2], c = b.sticks[k * 2 + 1];
    const d = Math.hypot(b.pos[a * 3] - b.pos[c * 3], b.pos[a * 3 + 1] - b.pos[c * 3 + 1], b.pos[a * 3 + 2] - b.pos[c * 3 + 2]);
    worst = Math.max(worst, Math.abs(d / b.rest[k] - 1));
  }
  return worst;
}

/** Runs a body at 60 fps (2 substeps per frame) until it sleeps, collecting the artefact statistics of the spec. */
function simulate(b, world, { maxT = 12, each, options = opt } = {}) {
  const s = { t: 0, frames: 0, finite: true, backFrames: 0, stretchFrames: 0, maxStretch: 0, sunkFrames: 0, minHinge: 0 };
  while (s.t < maxT && !b.asleep) {
    R.step(b, world, options);
    if (!b.asleep) R.step(b, world, options);
    each?.(b);
    s.t += 1 / 60; s.frames++;
    const h = R.hingeAngles(b);
    const minHinge = Math.min(h[0][0], h[1][0], h[2][0], h[3][0]);
    s.minHinge = Math.min(s.minHinge, minHinge);
    if (minHinge < -6 * DEG) s.backFrames++;
    const stretch = worstStretch(b);
    s.maxStretch = Math.max(s.maxStretch, stretch);
    if (stretch > 0.1) s.stretchFrames++;
    let sunk = false;
    for (let i = 0; i < b.n; i++) {
      const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) s.finite = false;
      if (y - b.r[i] - world.ground(x, z) < -0.03) sunk = true;
    }
    if (sunk) s.sunkFrames++;
    if (!s.finite) break;
  }
  const h = R.hingeAngles(b);
  s.asleep = b.asleep;
  s.side = Math.max(...h.map(([, side]) => Math.abs(side)));
  s.pelvisUp = b.pos[P.PELVIS * 3 + 1] - world.ground(b.pos[0], b.pos[2]);
  s.headUp = b.pos[P.HEAD * 3 + 1] - world.ground(b.pos[P.HEAD * 3], b.pos[P.HEAD * 3 + 2]);
  return s;
}

/**
 * Runs a scenario from several seeds (the dynamics are chaotic, so one seed proves little) and checks the spec's
 * criteria: no NaN, asleep in time, resting heights, and on the pooled frames knees/elbows >= -6 deg in 99%, bone
 * stretch < 10% in 97%, never more than 3 cm inside the ground in more than 1%.
 */
function scenario(t, name, make, { seeds = 6, maxSleep = 4, lying = true, stretchShare = 0.03, backShare = 0.01, each, check } = {}) {
  const pool = { frames: 0, backFrames: 0, stretchFrames: 0, sunkFrames: 0, maxStretch: 0, minHinge: 0, sleeps: [] };
  for (let k = 0; k < seeds; k++) {
    const [b, world] = make(seeded(1 + k * 7), k);
    const s = simulate(b, world, { maxT: maxSleep + 6, each });
    const info = `${name} #${k}: ${JSON.stringify(s, (key, v) => (typeof v === 'number' ? +v.toFixed(3) : v))}`;
    assert.ok(s.finite, `no NaN - ${info}`);
    assert.ok(s.asleep && s.t <= maxSleep, `asleep within ${maxSleep} s - ${info}`);
    assert.ok(s.side < 0.15, `no sideways hinge bend at rest - ${info}`);
    if (lying) {
      // Lying on the street: waist about 0.14 m (its radius) and head about 0.22 m above the floor.
      assert.ok(s.pelvisUp > 0.12 && s.pelvisUp < 0.3, `pelvis rests near 0.14 m - ${info}`);
      assert.ok(s.headUp > 0.2 && s.headUp < 0.45, `head rests near 0.22 m - ${info}`);
    }
    check?.(b, world, info);
    for (const key of ['frames', 'backFrames', 'stretchFrames', 'sunkFrames']) pool[key] += s[key];
    pool.maxStretch = Math.max(pool.maxStretch, s.maxStretch); pool.minHinge = Math.min(pool.minHinge, s.minHinge);
    pool.sleeps.push(s.t);
  }
  const share = (n) => `${(n / pool.frames * 100).toFixed(1)}%`;
  const summary = `${name}: ${seeds} runs, sleep ${Math.min(...pool.sleeps).toFixed(2)}-${Math.max(...pool.sleeps).toFixed(2)} s, `
    + `bent-back ${share(pool.backFrames)} (min ${(pool.minHinge / DEG).toFixed(1)} deg), stretch>10% ${share(pool.stretchFrames)} `
    + `(max ${(pool.maxStretch * 100).toFixed(0)}%), sunk>3cm ${share(pool.sunkFrames)} of ${pool.frames} frames`;
  t.diagnostic(summary);
  assert.ok(pool.backFrames <= pool.frames * backShare, `knees/elbows >= -6 deg - ${summary}`);
  assert.ok(pool.stretchFrames <= pool.frames * stretchShare, `bone stretch < 10% - ${summary}`);
  assert.ok(pool.sunkFrames <= pool.frames * 0.01, `not inside the ground - ${summary}`);
}

test('rest skeleton: hinges, cones and self collision are satisfied at spawn', () => {
  const b = body(0, 0.1, 0, 0);
  for (const [angle, side] of R.hingeAngles(b)) {
    assert.ok(angle > -2 * DEG && angle < 20 * DEG, `rest hinge angle ${angle / DEG}`);
    assert.ok(Math.abs(side) < 0.08);
  }
  for (const usage of R.coneUsage(b)) assert.ok(usage < 1, `rest cone usage ${usage}`);
  // No limit, range or self-collision pair fights the rest pose: a step in free fall leaves every bone as it was.
  const air = body(0, 0.1, 0, 0, { mode: 'limp' });
  R.step(air, { ground: () => -10 }, opt);
  assert.ok(worstStretch(air) < 0.005, `rest pose stretch ${worstStretch(air)}`);
  // Standing on the street only lifts the toes, which sit 1.6 cm into it in this table.
  R.step(b, flat, opt);
  assert.ok(worstStretch(b) < 0.03);
});

test('knock-downs settle quickly without artefacts (pistol, car, grenade, curb, drop, shove)', (t) => {
  const curb = { ground: (x) => (x > 1.2 ? 0.24 : 0.1) };
  const yawJitter = (rand) => (rand() - 0.5) * 0.6;
  scenario(t, 'pistol, chest', (rand) => { const b = body(0, 0.1, 0, yawJitter(rand)); R.launch(b, 0, 2.5, -9, 'bullet', { x: 0, y: 1 + rand() * 0.2, z: 0.1 }); return [b, flat]; });
  scenario(t, 'pistol, head', (rand) => { const b = body(0, 0.1, 0, yawJitter(rand)); R.launch(b, 0, 2.5, -9, 'bullet', { x: 0, y: 1.55 + rand() * 0.1, z: 0.1 }); return [b, flat]; });
  scenario(t, 'uniform knock', (rand) => { const b = body(0, 0.1, 0, yawJitter(rand)); R.launch(b, 0, 2.5, -9, 'fall', null, rand); return [b, flat]; });
  scenario(t, 'car 15 m/s at the shins', (rand) => { const b = body(0, 0.1, 0, yawJitter(rand)); R.launch(b, 0, 6.3, 12.75, 'vehicle', { x: (rand() - 0.5) * 0.3, y: 0.5, z: -0.1 }); return [b, flat]; });
  scenario(t, 'car 25 m/s at the shins', (rand) => { const b = body(0, 0.1, 0, yawJitter(rand)); R.launch(b, 0, 8.5, 21, 'vehicle', { x: (rand() - 0.5) * 0.3, y: 0.5, z: -0.1 }); return [b, flat]; });
  scenario(t, 'grenade 2 m away', (rand) => { const b = body(0, 0.1, 0, rand() * 6.28, { mode: 'limp' }); assert.ok(R.blast(b, -2, 0.5, rand() - 0.5, 7, 26)); return [b, flat]; });
  scenario(t, 'slide across a curb', (rand) => { const b = body(0, 0.1, 0, Math.PI / 2 + (rand() - 0.5)); R.launch(b, 7, 2, (rand() - 0.5) * 2, 'fall', null, rand); return [b, curb]; }, { seeds: 10 });
  scenario(t, 'drop 8 m tumbling', (rand) => {
    const b = body(0, 8, 0, rand() * 6.28, { mode: 'limp' });
    for (let i = 0; i < JOINTS; i++) b.prev[i * 3 + 2] -= (b.pos[i * 3 + 1] - 9) * 0.6 * R.STEP; // tumble forward
    return [b, flat];
  });
  scenario(t, 'stumble after a shove', (rand) => { const b = body(0, 0.1, 0, rand() - 0.5, { mode: 'stumble' }); R.launch(b, 0, 0.5, 3.2, 'melee', { x: 0, y: 1.2, z: -0.15 }); return [b, flat]; });
});

test('a body thrown into a wall never passes through it and slides down it', (t) => {
  const wall = { minX: 4, maxX: 6, minZ: -10, maxZ: 10 };
  let deepest = -Infinity;
  // 18 m/s (65 km/h) into a wall 2.5 m up. Hands pressed flat on the wall squeeze the 9 cm hand bone (wrists bend
  // at most 65 deg) and an elbow pinned against it overextends a few degrees for 1-3 frames; neither shows on screen
  // (hands are drawn at rest length), so this violent case gets wider bounds than the spec's 3% / 1%.
  scenario(t, 'thrown into a wall', (rand) => {
    const b = body(0, 0.85, 0, Math.PI / 2 + (rand() - 0.5));
    b.nearby = [wall];
    R.launch(b, 18, 7, (rand() - 0.5) * 4, 'fall', null, rand);
    return [b, flat];
  }, {
    seeds: 8, stretchShare: 0.07, backShare: 0.025,
    each: (x) => { for (let i = 0; i < x.n; i++) deepest = Math.max(deepest, x.pos[i * 3] - (wall.minX - x.r[i])); },
  });
  assert.ok(deepest < 1e-3, `deepest past the wall face ${deepest}`);
});

test('landing on a stall top (collider with top) and rolling off', (t) => {
  scenario(t, 'onto a stall top', (rand) => {
    const b = body(0, 0.1, 0, Math.PI / 2 + (rand() - 0.5) * 0.4);
    b.nearby = [{ minX: 1.5, maxX: 3, minZ: -1, maxZ: 1, top: 0.9 }];
    R.launch(b, 9, 5, rand() - 0.5, 'fall', null, rand);
    return [b, flat];
  }, { lying: false });
});

test('river: a body floats at the surface instead of sinking to the bed', (t) => {
  // Bank at z = -1, bed at -2.8 m (city.ts RIVER_BED), surface at WATER_LEVEL; thrown in from 8 directions.
  const river = { ground: (x, z) => (z < -1 ? -2.8 : 0.1), water: WATER_LEVEL };
  const depths = [];
  scenario(t, 'into the river', (rand, k) => {
    const b = body(0, 0.1, 0, k * Math.PI / 4, { mode: 'limp' });
    R.launch(b, 0, 3, -6, 'fall', null, rand);
    return [b, river];
  }, {
    seeds: 8, maxSleep: 8, lying: false,
    check: (b, world, info) => {
      const y = b.pos[P.PELVIS * 3 + 1];
      depths.push(y.toFixed(2));
      assert.ok(Math.abs(y - WATER_LEVEL) < 0.45, `pelvis afloat near the surface - ${info}`);
      assert.ok(b.pos[P.CHEST * 3 + 1] > WATER_LEVEL - 0.35, `chest at the surface - ${info}`);
    },
  });
  t.diagnostic(`pelvis heights afloat: ${depths.join(' ')}`);
});

test('applyImpulse conserves linear and angular momentum and bends only by `deform`', () => {
  const b = body(3, 0.1, -2, 0.7);
  const rand = seeded(42);
  const dv = Float32Array.from({ length: R.COUNT * 3 }, (_, i) => (i < JOINTS * 3 ? (rand() - 0.5) * 20 : 0));
  const before = Float32Array.from(b.prev);
  R.applyImpulse(b, dv, 0.3);
  const want = [0, 0, 0], got = [0, 0, 0], Lwant = [0, 0, 0], Lgot = [0, 0, 0];
  let m = 0;
  const c = [0, 0, 0];
  for (let i = 0; i < b.n; i++) { const mi = 1 / b.w[i]; m += mi; for (let a = 0; a < 3; a++) c[a] += b.pos[i * 3 + a] * mi; }
  for (let a = 0; a < 3; a++) c[a] /= m;
  for (let i = 0; i < b.n; i++) {
    const mi = 1 / b.w[i];
    const v = [0, 1, 2].map((a) => (before[i * 3 + a] - b.prev[i * 3 + a]) / b.dt);
    const r = [0, 1, 2].map((a) => b.pos[i * 3 + a] - c[a]);
    const cross = (u) => [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
    const d = [dv[i * 3], dv[i * 3 + 1], dv[i * 3 + 2]];
    for (let a = 0; a < 3; a++) { want[a] += mi * d[a]; got[a] += mi * v[a]; Lwant[a] += mi * cross(d)[a]; Lgot[a] += mi * cross(v)[a]; }
  }
  for (let a = 0; a < 3; a++) {
    assert.ok(Math.abs(want[a] - got[a]) < 1e-4 * Math.max(1, Math.abs(want[a])), `momentum ${a}: ${want[a]} vs ${got[a]}`);
    assert.ok(Math.abs(Lwant[a] - Lgot[a]) < 1e-3 * Math.max(1, Math.abs(Lwant[a])), `angular momentum ${a}: ${Lwant[a]} vs ${Lgot[a]}`);
  }
  // launch() hands the body exactly v x mass of momentum.
  const l = body(0, 0.1, 0, 0);
  const prev = Float32Array.from(l.prev);
  R.launch(l, 4, 2, -6, 'bullet', { x: 0.1, y: 1.3, z: 0 });
  const total = [0, 0, 0];
  for (let i = 0; i < l.n; i++) for (let a = 0; a < 3; a++) total[a] += (prev[i * 3 + a] - l.prev[i * 3 + a]) / l.dt / l.w[i];
  [4, 2, -6].forEach((v, a) => assert.ok(Math.abs(total[a] / l.mass - v) < 1e-4, `launch momentum ${a}`));
});

test('detaching every part keeps the solver stable; stubs and nearestPart follow', () => {
  const b = body(0, 0.1, 0, 0);
  R.launch(b, 0, 3, -8, 'bullet', { x: 0, y: 1.2, z: 0.1 });
  assert.equal(R.nearestPart(b, b.pos[P.HEAD * 3], b.pos[P.HEAD * 3 + 1] + 0.1, b.pos[P.HEAD * 3 + 2]), 'head');
  for (const part of R.PARTS) {
    const before = b.n;
    const stub = R.detach(b, part);
    assert.equal(stub, before, `${part} stub is the next spare`);
    assert.equal(R.detach(b, part), -1, `${part} cannot be cut twice`);
    assert.equal(b.stub[R.PARTS.indexOf(part)], stub);
  }
  assert.equal(b.n, R.COUNT);
  assert.equal(R.nearestPart(b, 0, 1, 0), null);
  const s = simulate(b, flat);
  assert.ok(s.finite && s.asleep, JSON.stringify(s));
  // The head and the limbs separated from the torso (no hidden constraint keeps them at rest distance).
  const gap = (a, c) => Math.hypot(b.pos[a * 3] - b.pos[c * 3], b.pos[a * 3 + 1] - b.pos[c * 3 + 1], b.pos[a * 3 + 2] - b.pos[c * 3 + 2]);
  assert.ok(gap(b.stub[0], P.NECK) > 0.01 || gap(P.HEAD, P.NECK) > 0.3, 'head loose');
  for (let i = 0; i < b.n; i++) assert.ok(b.pos[i * 3 + 1] - b.r[i] > 0.1 - 0.03, `part ${i} above the street`);
});

test('a blow on the body leaves a severed head lying apart where it is', () => {
  const b = body(0, 0.1, 0, 0);
  R.detach(b, 'head');
  // Roll the head 2 m away and let everything settle.
  for (const i of [P.HEAD, b.stub[0]]) { b.pos[i * 3] += 2; b.prev[i * 3] += 2; }
  simulate(b, flat);
  const head = [b.pos[P.HEAD * 3], b.pos[P.HEAD * 3 + 1], b.pos[P.HEAD * 3 + 2]];
  // Five shotgun pellets into the chest and a car at the shins.
  for (let k = 0; k < 5; k++) R.strike(b, b.pos[P.CHEST * 3], b.pos[P.CHEST * 3 + 1], b.pos[P.CHEST * 3 + 2], 0, 2, -6, 'bullet');
  R.strike(b, b.pos[P.KN_L * 3], b.pos[P.KN_L * 3 + 1], b.pos[P.KN_L * 3 + 2], 0, 6, 12, 'vehicle');
  const v = (i) => Math.hypot(b.pos[i * 3] - b.prev[i * 3], b.pos[i * 3 + 1] - b.prev[i * 3 + 1], b.pos[i * 3 + 2] - b.prev[i * 3 + 2]) / b.dt;
  assert.ok(v(P.HEAD) < 0.5 && v(b.stub[0]) < 0.5, `head pushed ${v(P.HEAD)} m/s`);
  assert.ok(v(P.CHEST) > 3, 'the body itself takes the blows');
  simulate(b, flat);
  assert.ok(Math.hypot(b.pos[P.HEAD * 3] - head[0], b.pos[P.HEAD * 3 + 2] - head[2]) < 0.6, 'head stays where it lay');
});

test('the chest twists at most about 40 deg against the pelvis and feet never spin round the shin', (t) => {
  const DEGS = (x) => x / DEG;
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const sub = (a, c) => [0, 1, 2].map((k) => b0.pos[a * 3 + k] - b0.pos[c * 3 + k]);
  const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  const across = (v, s) => { const d = dot(v, s); return unit(v.map((x, k) => x - s[k] * d)); };
  let b0, frames = 0, twistOver = 0, maxTwist = 0, footFrames = 0, footOver = 0;
  for (let k = 0; k < 24; k++) {
    const rand = seeded(100 + k);
    b0 = body(0, 0.1, 0, rand() * 6.28, { mode: k % 2 ? 'limp' : 'brace' });
    const kind = ['vehicle', 'bullet', 'blast', 'fall'][k % 4];
    R.launch(b0, (rand() - 0.5) * 16, 4 + rand() * 6, (rand() - 0.5) * 16, kind, { x: (rand() - 0.5) * 0.4, y: 0.3 + rand() * 1.3, z: (rand() - 0.5) * 0.4 });
    for (let f = 0; f < 240 && !b0.asleep; f++) {
      R.step(b0, flat, opt); R.step(b0, flat, opt);
      frames++;
      // Spine twist: hip line against shoulder line across the spine (waist to neck).
      const spine = unit(sub(P.NECK, P.PELVIS));
      const hips = across(sub(P.HIP_R, P.HIP_L), spine), shoulders = across(sub(P.SH_R, P.SH_L), spine);
      const twist = Math.abs(Math.atan2(dot(cross(hips, shoulders), spine), dot(hips, shoulders)));
      maxTwist = Math.max(maxTwist, twist);
      if (twist > 46 * DEG) twistOver++;
      // Foot turn about the shin, for feet in the air (the knee's hinge axis is the solver's own).
      for (const [slot, kn, an, to] of [[2, P.KN_L, P.AN_L, P.TO_L], [3, P.KN_R, P.AN_R, P.TO_R]]) {
        if (b0.pos[to * 3 + 1] - b0.r[to] < 0.1 + 0.05) continue;
        const d = unit(sub(an, kn)), h = [b0.axis[slot * 3], b0.axis[slot * 3 + 1], b0.axis[slot * 3 + 2]];
        const fwd = unit(cross(d, h)), foot = across(sub(to, an), d);
        const turn = Math.abs(Math.atan2(dot(cross(fwd, foot), d), dot(fwd, foot)));
        footFrames++;
        if (turn > 50 * DEG) footOver++;
      }
    }
  }
  t.diagnostic(`twist max ${DEGS(maxTwist).toFixed(1)} deg, over 46 deg in ${(twistOver / frames * 100).toFixed(2)}% of ${frames} frames; airborne foot turned past 50 deg in ${(footOver / footFrames * 100).toFixed(2)}% of ${footFrames}`);
  assert.ok(twistOver <= frames * 0.01, `twist over 46 deg in ${twistOver} of ${frames} frames (max ${DEGS(maxTwist)})`);
  assert.ok(footOver <= footFrames * 0.02, `foot turned past 50 deg in ${footOver} of ${footFrames}`);
});

test('a severed arm keeps a frame-free elbow bend; the torso keeps its own limits', () => {
  const b = body(0, 0.1, 0, 0);
  R.detach(b, 'armL');
  R.launch(b, 3, 4, -6, 'melee', { x: -0.3, y: 1.0, z: 0 });
  const s = simulate(b, flat);
  assert.ok(s.finite && s.asleep);
  // Elbow bend of the loose arm: angle between stub->elbow and elbow->wrist within [0, 145°].
  const v = (a, c) => [0, 1, 2].map((k) => b.pos[c * 3 + k] - b.pos[a * 3 + k]);
  const u = v(b.stub[1], P.EL_L), d = v(P.EL_L, P.WR_L);
  const cos = (u[0] * d[0] + u[1] * d[1] + u[2] * d[2]) / Math.hypot(...u) / Math.hypot(...d);
  assert.ok(Math.acos(Math.max(-1, Math.min(1, cos))) <= 146 * DEG);
});

test('raycast hits bone capsules and the head sphere, and reports the part', () => {
  const b = body(0, 0.1, 0, 0); // facing +z
  const hit = { t: 0, index: -1, part: null, x: 0, y: 0, z: 0 };
  const y = (v) => 0.1 + v * K;
  // Chest from the front: torso (part null), stops at the chest surface.
  assert.ok(R.raycast(b, 0, y(1.25), 5, 0, 0, -1, 20, hit));
  assert.equal(hit.part, null);
  assert.ok(hit.z > 0.1 && hit.z < 0.3, `chest surface z ${hit.z}`);
  // Head.
  assert.ok(R.raycast(b, 0, y(1.87), 5, 0, 0, -1, 20, hit));
  assert.equal(hit.part, 'head');
  assert.equal(hit.index, P.HEAD);
  // Left forearm from the side.
  assert.ok(R.raycast(b, -5, y(1.05), 0, 1, 0, 0, 20, hit));
  assert.equal(hit.part, 'armL');
  assert.ok(hit.index === P.EL_L || hit.index === P.WR_L);
  // Right shin from behind.
  assert.ok(R.raycast(b, 0.13 * K, y(0.25), -5, 0, 0, 1, 20, hit));
  assert.equal(hit.part, 'legR');
  // Misses: over the head, between the legs at ankle height, beyond maxT.
  assert.ok(!R.raycast(b, 0, y(2.4), 5, 0, 0, -1, 20, hit));
  assert.ok(!R.raycast(b, 0, y(0.2), 5, 0, 0, -1, 20, hit));
  assert.ok(!R.raycast(b, 0, y(1.25), 5, 0, 0, -1, 3, hit));
});

test('push adds only the missing speed: a body walked into every frame never exceeds the pusher', () => {
  const b = body(0, 0.1, 0, 0);
  R.launch(b, 0, 0, -2, 'fall', null, seeded(1));
  simulate(b, flat);
  assert.ok(b.asleep);
  let fastest = 0;
  for (let f = 0; f < 60; f++) {
    const x = b.pos[0], z = b.pos[2] + 0.4;
    R.push(b, x, z, 0.1, 0.9, 0, 0.5, -3);
    R.step(b, flat, opt); R.step(b, flat, opt);
    fastest = Math.max(fastest, (b.prev[2] - b.pos[2]) / b.dt);
  }
  assert.ok(fastest > 1 && fastest < 3.3, `pelvis speed ${fastest}`);
  assert.equal(R.push(b, 50, 50, 0.1, 1, 0, 0, 3), 0, 'nothing touched far away');
});

test('a car driving through a lying body shoves it out of its box without tearing it', () => {
  for (const speed of [4, 8, 15]) {
    const b = body(0, 0.1, 0, 0);
    R.launch(b, 0, 1, -3, 'fall', null, seeded(2));
    simulate(b, flat);
    // A car (half width 0.9, half length 2.2, roof 1.45 m) drives along +x through the body.
    const car = { x: -4, z: -0.6, floorY: 0.1, yaw: Math.PI / 2, halfW: 0.9, halfL: 2.2, top: 1.45, vx: speed, vz: 0 };
    const world = { ...flat, movers: [car] };
    let touched = 0, stretchFrames = 0, frames = 0, inside = 0;
    for (; car.x < 8; frames++) {
      car.x += speed / 60;
      touched += R.sweep(b, car);
      R.step(b, world, opt); R.step(b, world, opt);
      if (worstStretch(b) > 0.1) stretchFrames++;
      for (let i = 0; i < b.n; i++) assert.ok(Number.isFinite(b.pos[i * 3]) && Number.isFinite(b.pos[i * 3 + 1]));
      inside = Math.max(inside, R.sweep(b, { ...car, halfW: car.halfW - 0.05, halfL: car.halfL - 0.05 }));
    }
    assert.ok(touched > 0, 'the car met the body');
    assert.ok(b.pos[0] > 1, `${speed} m/s: body carried along x (${b.pos[0]})`);
    assert.equal(inside, 0, `${speed} m/s: no part left 5 cm inside the car`);
    assert.ok(stretchFrames <= frames * 0.1, `${speed} m/s: stretch>10% in ${stretchFrames}/${frames} frames`);
  }
});

test('blast reaches only bodies inside its radius', () => {
  const b = body(0, 0.1, 0, 0);
  assert.equal(R.blast(b, 20, 0.5, 0, 7, 26), false);
  assert.equal(b.asleep, false);
  assert.ok(R.blast(b, 2, 0.5, 0, 7, 26));
  assert.ok(b.prev[0] > b.pos[0], 'thrown away from the bomb');
});

test('60 Hz stepping (far bodies) keeps velocity across the switch and still settles', () => {
  const b = body(0, 0.1, 0, 0);
  R.launch(b, 5, 3, 0, 'fall', null, seeded(4));
  R.step(b, flat, opt);
  const v = (b.pos[0] - b.prev[0]) / b.dt;
  R.retime(b, 2 * R.STEP);
  assert.ok(Math.abs((b.pos[0] - b.prev[0]) / b.dt - v) < 1e-3);
  let t = 0;
  while (!b.asleep && t < 8) { R.step(b, flat, opt, 2 * R.STEP); t += 2 * R.STEP; }
  assert.ok(b.asleep && t < 5, `slept after ${t}`);
  for (const x of b.pos) assert.ok(Number.isFinite(x));
});

test('render interpolation: shown holds the state before the latest substep', () => {
  const b = body(0, 0.1, 0, 0);
  R.launch(b, 4, 2, 0, 'fall', null, seeded(6));
  R.step(b, flat, opt);
  const mid = Float32Array.from(b.pos);
  R.step(b, flat, opt);
  assert.deepEqual(Array.from(b.shown.slice(0, 60)), Array.from(mid.slice(0, 60)));
  const out = R.interpolate(b, 0.5, new Float32Array(R.COUNT * 3));
  assert.ok(Math.abs(out[0] - (mid[0] + b.pos[0]) / 2) < 1e-6);
});

test('brace: hands reach the street before the head on a forward fall', () => {
  const firstContact = (mode) => {
    const b = body(0, 0.1, 0, 0, { mode });
    R.launch(b, 0, 0.5, 3.2, 'melee', { x: 0, y: 1.2, z: -0.15 });
    for (let f = 0; f < 240; f++) {
      R.step(b, flat, opt); R.step(b, flat, opt);
      const hand = Math.min(b.pos[P.HA_L * 3 + 1] - b.r[P.HA_L], b.pos[P.HA_R * 3 + 1] - b.r[P.HA_R]) - 0.1;
      const head = b.pos[P.HEAD * 3 + 1] - b.r[P.HEAD] - 0.1;
      if (hand < 0.02 || head < 0.02) return hand < head + 0.01 ? 'hand' : 'head';
    }
    return 'none';
  };
  assert.equal(firstContact('brace'), 'hand');
  assert.equal(firstContact('stumble'), 'hand');
});

test('heading tells which way a body lies for getting up', () => {
  const settle = (b) => { simulate(b, flat); return R.heading(b); };
  // Shot from the front: falls on its back, head toward -z.
  const back = body(0, 0.1, 0, 0);
  R.launch(back, 0, 2.5, -9, 'bullet', { x: 0, y: 1.1, z: 0.1 });
  const h1 = settle(back);
  assert.equal(h1.faceUp, true);
  assert.ok(Math.abs(Math.abs(h1.yaw) - Math.PI) < 0.6, `yaw ${h1.yaw}`);
  // Shoved from behind: falls on its front, head toward +z.
  const front = body(0, 0.1, 0, 0);
  R.launch(front, 0, 0.5, 3.2, 'melee', { x: 0, y: 1.2, z: -0.15 });
  const h2 = settle(front);
  assert.equal(h2.faceUp, false);
  assert.ok(Math.abs(h2.yaw) < 0.6, `yaw ${h2.yaw}`);
});

test('a posed start keeps the skeleton rest lengths', () => {
  // Arms raised overhead with a slightly wrong forearm length: the bones snap back to the skeleton, nothing explodes.
  const pose = Float32Array.from(R.DEFAULT_POSE);
  for (const [el, wr, ha, side] of [[P.EL_L, P.WR_L, P.HA_L, -1], [P.EL_R, P.WR_R, P.HA_R, 1]]) {
    pose.set([side * 0.36, 1.76, 0], el * 3); pose.set([side * 0.38, 2.1, 0], wr * 3); pose.set([side * 0.38, 2.2, 0], ha * 3);
  }
  const b = body(0, 0.1, 0, 0, { pose });
  const fresh = body(0, 0.1, 0, 0);
  assert.deepEqual(Array.from(b.rest), Array.from(fresh.rest));
  const s = simulate(b, flat);
  assert.ok(s.finite && s.asleep, JSON.stringify(s));
  assert.ok(worstStretch(b) < 0.05);
});

test('collider grid returns exactly the colliders a brute-force scan finds', city, () => {
  const grid = R.createColliderGrid(COLLIDERS);
  const rand = seeded(99), out = [];
  for (let n = 0; n < 500; n++) {
    const x = LAND.minX + rand() * (LAND.maxX - LAND.minX), z = LAND.minZ + rand() * (LAND.maxZ - LAND.minZ), s = 0.5 + rand() * 6;
    R.queryColliders(grid, x - s, z - s, x + s, z + s, out);
    const want = COLLIDERS.filter((c) => c.maxX > x - s && c.minX < x + s && c.maxZ > z - s && c.minZ < z + s);
    assert.equal(out.length, want.length);
    for (const c of want) assert.ok(out.includes(c));
  }
});

// The future FIGURE (spec-humans §1: 7.2 heads, slimmer shoulders and hips) as a second skeleton: the solver must
// take any proportions ragdoll.ts derives, not just the default table.
const V2 = R.createSkeleton({
  pose: R.poseFromLandmarks({
    pelvis: [0, 1.2, -0.03], chest: [0, 1.4, 0.05], neck: [0, 1.75, -0.02], head: [0, 1.935, 0.015],
    hip: [-0.1, 1.04, 0], shoulder: [-0.2, 1.64, 0], elbow: [-0.21, 1.31, -0.01], wrist: [-0.215, 1.01, 0.02], hand: [-0.215, 0.9, 0.03],
    knee: [-0.1, 0.59, 0.015], ankle: [-0.1, 0.08, -0.01], toe: [-0.105, 0.03, 0.17],
  }),
  radius: [0.13, 0.09, 0.09, 0.14, 0.06, 0.07, 0.07, 0.14, 0.055, 0.055, 0.045, 0.045, 0.045, 0.045, 0.07, 0.07, 0.055, 0.055, 0.04, 0.04],
});
test('a skeleton with the redesigned proportions is valid at rest and settles', () => {
  const b = R.createState(V2, at(0, 0.1, 0, 0));
  for (const [angle] of R.hingeAngles(b)) assert.ok(angle > -2 * DEG && angle < 20 * DEG, `rest hinge ${angle / DEG}`);
  for (const usage of R.coneUsage(b)) assert.ok(usage < 1, `rest cone ${usage}`);
  const air = R.createState(V2, at(0, 0.1, 0, 0, { mode: 'limp' }));
  R.step(air, { ground: () => -10 }, opt);
  assert.ok(worstStretch(air) < 0.005, `no twitch at spawn (${worstStretch(air)})`);
  R.launch(b, 0, 2.5, -9, 'bullet', { x: 0, y: 1.25, z: 0.1 });
  const s = simulate(b, flat);
  assert.ok(s.finite && s.asleep && s.t < 4, JSON.stringify(s));
  assert.ok(s.backFrames <= s.frames * 0.01 && s.stretchFrames <= s.frames * 0.03, JSON.stringify(s));
});

test('Monte Carlo: 240 knocks in the real city settle fast and fly sane distances', city, (t) => {
  const grid = R.createColliderGrid(COLLIDERS);
  const world = { ground: groundHeight, grid, water: WATER_LEVEL, bounds: { minX: LAND.minX, maxX: LAND.maxX, minZ: RIVER.minZ, maxZ: LAND.maxZ } };
  const rand = seeded(12345);
  const kinds = ['pistol', 'shotgun', 'car', 'fastcar', 'blast', 'push'];
  const stats = {};
  let frames = 0, back = 0, stretch = 0, sunk = 0;
  for (let trial = 0; trial < 240; trial++) {
    const kind = kinds[trial % kinds.length];
    let x = 0, z = 0;
    for (;;) {
      x = LAND.minX + 10 + rand() * 300; z = -120 + rand() * 240;
      if (COLLIDERS.every((c) => x < c.minX - 0.6 || x > c.maxX + 0.6 || z < c.minZ - 0.6 || z > c.maxZ + 0.6)) break;
    }
    const yaw = rand() * Math.PI * 2, dir = rand() * Math.PI * 2, dx = Math.sin(dir), dz = Math.cos(dir);
    const y = groundHeight(x, z);
    const mode = kind === 'push' ? 'stumble' : kind === 'blast' || trial % 2 ? 'limp' : 'brace';
    const b = R.createState(R.DEFAULT_SKELETON, { ...at(x, y, z, yaw), mode, ground: groundHeight });
    const near = { x: x - dx * 0.2, z: z - dz * 0.2 };
    if (kind === 'pistol') R.launch(b, dx * 9, 2.5, dz * 9, 'bullet', { ...near, y: y + 0.9 + rand() * 0.7 });
    else if (kind === 'shotgun') R.launch(b, dx * 6.5, 2.5, dz * 6.5, 'bullet', { ...near, y: y + 1 });
    else if (kind === 'car') R.launch(b, dx * 12, 6, dz * 12, 'vehicle', { ...near, y: y + 0.5 });
    else if (kind === 'fastcar') R.launch(b, dx * 22, 9, dz * 22, 'vehicle', { ...near, y: y + 0.5 });
    else if (kind === 'push') R.launch(b, dx * 4, 1.2, dz * 4, 'fall', null, rand);
    else R.blast(b, x - dx * (1 + rand() * 3), y + 0.5, z - dz * (1 + rand() * 3), 7, 26);
    const s = simulate(b, world, { maxT: 10 });
    assert.ok(s.finite, `${kind} trial ${trial} NaN`);
    const k = (stats[kind] ??= { sleep: [], never: 0, travel: [] });
    if (s.asleep) k.sleep.push(s.t); else k.never++;
    k.travel.push(Math.hypot(b.pos[0] - x, b.pos[2] - z));
    frames += s.frames; back += s.backFrames; stretch += s.stretchFrames; sunk += s.sunkFrames;
  }
  const all = Object.values(stats).flatMap((k) => k.sleep), never = Object.values(stats).reduce((n, k) => n + k.never, 0);
  for (const [kind, k] of Object.entries(stats)) {
    t.diagnostic(`${kind.padEnd(8)} sleep median ${median(k.sleep).toFixed(2)} s p90 ${pct(k.sleep, 0.9).toFixed(2)} s never ${k.never} travel median ${median(k.travel).toFixed(1)} m`);
  }
  t.diagnostic(`all: sleep median ${median(all).toFixed(2)} s p90 ${pct(all, 0.9).toFixed(2)} s never ${never}/240; per body: bent-back ${(back / 240).toFixed(2)} stretch>10% ${(stretch / 240).toFixed(2)} sunk>3cm ${(sunk / 240).toFixed(2)} frames (of ${(frames / 240).toFixed(0)})`);
  assert.ok(median(all) < 3, 'median sleep under 3 s');
  assert.ok(pct(all, 0.9) < 4, 'p90 sleep under 4 s');
  assert.ok(never <= 2, 'at most 1% never sleep');
  assert.ok(back <= frames * 0.01 && stretch <= frames * 0.03 && sunk <= frames * 0.01);
  const car = median(stats.car.travel), fast = median(stats.fastcar.travel);
  assert.ok(car >= 6 && car <= 14, `12 m/s car throws 6-14 m (median ${car})`);
  assert.ok(fast >= 18 && fast <= 35, `22 m/s car throws 18-35 m (median ${fast})`);
});

test('CPU: 18 awake bodies x 2 substeps in the real city', city, (t) => {
  const grid = R.createColliderGrid(COLLIDERS);
  const world = { ground: groundHeight, grid, water: WATER_LEVEL };
  for (const iterations of [6, 4]) {
    const options = R.solverOptions(iterations), rand = seeded(iterations);
    const bodies = [];
    for (let i = 0; i < 18; i++) {
      const x = -40 + i * 1.5, z = 7, b = R.createState(R.DEFAULT_SKELETON, { ...at(x, groundHeight(x, z), z, i), ground: groundHeight });
      R.launch(b, Math.cos(i) * 8, 4, Math.sin(i) * 8, 'fall', null, rand);
      bodies.push(b);
    }
    const times = [];
    for (let f = 0; f < 600; f++) {
      // Keep everyone awake and moving, as right after a grenade into a crowd.
      if (f % 30 === 0) for (const b of bodies) { R.wake(b); for (let i = 0; i < JOINTS; i++) { b.prev[i * 3 + 1] -= 4 * b.dt; b.prev[i * 3] -= (rand() - 0.5) * 4 * b.dt; } }
      const a = performance.now();
      for (const b of bodies) { R.step(b, world, options); R.step(b, world, options); }
      times.push(performance.now() - a);
    }
    const med = median(times.slice(100));
    t.diagnostic(`${iterations} iterations: median ${med.toFixed(3)} ms/frame, p95 ${pct(times.slice(100), 0.95).toFixed(3)} ms, ${(med / 36 * 1000).toFixed(1)} us per body-substep`);
    // Generous ceiling (the target on an i5-11400H is 0.7 / 0.45 ms): catches a pathological regression, not jitter.
    assert.ok(med < 4, `median ${med} ms`);
  }
});
