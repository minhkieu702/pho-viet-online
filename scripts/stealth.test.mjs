// node --experimental-transform-types --test scripts/stealth.test.mjs
// Stealth perception (app/game/stealth-perception.ts) and the guard brain (app/game/guard-brain.ts), pure modules:
// cones, light and range, height-aware occlusion through the real map/collision.ts index, soft and crowd cover,
// stance/motion/water/car/social factors, hearing through walls and sound cover, the light field, the noise table;
// then the brain: awareness thresholds and decay, instant alerts, a scripted night patrol (a crouched player in the
// dark behind the guard stays unseen, a running one is caught), alarm escalation with radio / kẻng / reinforcements
// and decay, bodies found / woken / tied / hidden, the radio roll call and its bluff, the anti-exploit distraction rule,
// search coordination, takedown arcs, the chokehold (never lethal), LƯƠNG TÂM, CCTV, searchlights, dogs, hide-spot
// checks, the shipper cover bluff, snapshot round trips and determinism. Ends with a benchmark of 30 guards at 60 Hz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionIndex } from '../app/game/map/collision.ts';
import { BARKS, DEG, DIFFICULTY, NOISE_CLASS, NOISE_KINDS, SURFACE_NOISE, TUNE, barkText, createRng } from '../app/game/stealth-types.ts';
import {
  ambientLight, createFootsteps, createLightField, createNoiseBus, createPerception, createSight, createTarget, createViewer,
  effectiveRange, footstep, lightBand, lightGain, policeConcealment, stepRadius,
} from '../app/game/stealth-perception.ts';
import { TIER, createChoke, createGuardBrain, createPlayerState } from '../app/game/guard-brain.ts';

const near = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} is not within ${eps} of ${b}`);

/** A perception world: a collision index (boxes [x0, z0, x1, z1, bottom?, top?]), a light field, a noise bus. */
function world({ night = 0, rain = 0, boxes = [], lamps = [], soft = [], zones = [] } = {}) {
  const index = createCollisionIndex(4);
  for (const b of boxes) index.add(b[0], b[1], b[2], b[3], b[4] ?? -Infinity, b[5] ?? Infinity);
  const light = createLightField(index);
  light.ambient = ambientLight(night, rain);
  for (const l of lamps) light.add(l);
  const noise = createNoiseBus();
  const P = createPerception({ caster: index, light, noise, night, rain, soft, zones });
  return { index, light, noise, P };
}
const viewer = (x, z, yaw = 0, extra = {}) => Object.assign(createViewer(), { x, z, yaw }, extra);
const target = (x, z, extra = {}) => Object.assign(createTarget(), { x, z, lightAuto: false, light: 1 }, extra);
function look(P, v, tg, cover = true) {
  P.prepare(tg, cover);
  return { ...P.see(v, tg, createSight()) };
}

/** A brain in a world, stepped at 60 Hz; the player's footsteps go on the noise bus; every event is logged. */
function sim(o = {}) {
  const w = world(o);
  const log = [];
  const brain = createGuardBrain({
    perception: w.P, noise: w.noise, light: w.light, rng: o.rng ?? createRng(o.seed ?? 1), difficulty: o.difficulty,
    nav: o.nav, hides: o.hides, alarms: o.alarms, exits: o.exits, reinforcements: o.reinforcements, radio: o.radio, rules: o.rules,
    onEvent: o.quiet ? null : (e) => log.push({ ...e }),
  });
  const player = createPlayerState();
  const fs = createFootsteps();
  const dt = 1 / 60;
  let t = 0;
  function step(n = 1, script) {
    for (let i = 0; i < n; i++) {
      t += dt;
      if (script) script(t, player);
      const r = player.present ? footstep(fs, dt, player.speed, player.stance, 'concrete') : 0;
      if (r) w.noise.emit('step', player.x, player.z, r, t, player.y, 'player');
      brain.update(dt, t, player);
      brain.clearEvents();
    }
  }
  return {
    ...w, brain, player, log, step,
    get t() { return t; },
    run(seconds, script) { step(Math.round(seconds / dt), script); },
    until(pred, seconds, script) {
      const end = t + seconds;
      while (t < end) { step(1, script); if (pred()) return true; }
      return false;
    },
    events: (kind) => log.filter((e) => e.kind === kind),
  };
}

// =====================================================================================================
// Perception.
// =====================================================================================================

test('cone: focal ×1, peripheral ×0.35, outside and behind 0', () => {
  const { P } = world();
  const v = viewer(0, 0, 0);
  const at = (deg) => target(10 * Math.sin(deg * DEG), 10 * Math.cos(deg * DEG));
  const a = look(P, v, at(0)), b = look(P, v, at(50)), c = look(P, v, at(80)), d = look(P, v, at(180));
  assert.equal(a.cone, 1); assert.equal(b.cone, 0.35); assert.equal(c.cone, 0); assert.equal(d.cone, 0);
  near(b.gain / a.gain, 0.35, 1e-9);
  assert.equal(c.gain, 0); assert.equal(d.gain, 0);
  // The head, not the body, decides: a viewer looking 90° left sees what is there.
  assert.equal(look(P, viewer(0, 0, Math.PI / 2), target(10, 0)).cone, 1);
});

test('visibility() for tails and mirrors: 0..1, zero behind, lower in the dark and with a narrow fov', () => {
  const { P } = world();
  const front = P.visibility({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 8 }, 1);
  assert.ok(front > 0 && front <= 1);
  assert.equal(P.visibility({ x: 0, z: 0, yaw: Math.PI }, { x: 0, z: 8 }, 1), 0);
  assert.ok(P.visibility({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 8 }, 0.1) < front);
  assert.equal(P.visibility({ x: 0, z: 0, yaw: 0, fov: 40 * DEG }, { x: 8 * Math.sin(30 * DEG), z: 8 * Math.cos(30 * DEG) }, 1), 0, 'outside a ±20° mirror cone');
  assert.ok(P.visibility({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 2 }, 1) > 0.9, 'up close');
});

test('worked examples of §3.1: lit and walking at 10 m ≈ 40/s; dark, crouched and moving ≈ 1.7/s', () => {
  const { P } = world();
  const v = viewer(0, 0, 0);
  near(look(P, v, target(0, 10, { speed: 4.2, light: 1 })).gain, 40, 1);
  near(look(P, v, target(0, 10, { speed: 1.9, stance: 'crouch', light: 0.15 })).gain, 1.7, 0.15);
  near(lightGain(0), 0.15, 1e-12); near(lightGain(1), 1, 1e-12);
});

test('range shrinks with darkness and a flashlight beam extends it', () => {
  const day = world();
  const v = viewer(0, 0, 0);
  near(effectiveRange(26, 0.15), 26 * (0.35 + 0.65 * 0.25), 1e-9);
  assert.ok(look(day.P, v, target(0, 20, { light: 1 })).gain > 0);
  assert.equal(look(day.P, v, target(0, 20, { light: 0.15 })).gain, 0, 'a dark target at 20 m is past the 13.3 m range');
  const night = world({ night: 1 });
  const dark = look(night.P, v, target(0, 10, { light: 0.18 }));
  near(dark.range, 12 * (0.35 + 0.65 * 0.3), 1e-9);
  assert.equal(dark.gain, 0);
  const beam = look(night.P, viewer(0, 0, 0, { beam: true, beamYaw: 0 }), target(0, 10, { light: 0.18 }));
  assert.ok(beam.beam && beam.gain > 0 && beam.range >= 20 && beam.L >= 0.8, 'inside the beam: 20 m and L ≥ 0.8');
  const beside = look(night.P, viewer(0, 0, 0, { beam: true, beamYaw: 0 }), target(10 * Math.sin(30 * DEG), 10 * Math.cos(30 * DEG), { light: 0.18 }));
  assert.ok(!beside.beam && beside.gain === 0, '30° off the ±16° beam stays dark');
});

test('height-aware occlusion: a 1.1 m crate hides a crouched player, not a standing one; walls hide both', () => {
  const crate = world({ boxes: [[-1, 9.8, 1, 10.3, 0, 1.1]] });
  const v = viewer(0, 0, 0);
  const stand = look(crate.P, v, target(0, 10.6));
  const crouch = look(crate.P, v, target(0, 10.6, { stance: 'crouch' }));
  near(stand.f, 0.8, 1e-9, 'head and chest clear, knee hidden');
  assert.ok(stand.gain > 0);
  assert.equal(crouch.f, 0); assert.equal(crouch.gain, 0);
  const wall = world({ boxes: [[-1, 5, 1, 5.5]] });
  assert.equal(look(wall.P, v, target(0, 10.6)).f, 0, 'a legacy collider is infinitely tall');
  // From a roof 6 m up the crouched player's head shows over the crate.
  near(look(crate.P, viewer(0, 0, 0, { y: 6 }), target(0, 10.6, { stance: 'crouch' })).f, 0.4, 1e-9);
});

test('soft occluders multiply visibility instead of blocking it', () => {
  const v = viewer(0, 0, 0);
  const bare = look(world().P, v, target(0, 10));
  const bamboo = { minX: -1, maxX: 1, minZ: 4, maxZ: 5, bottom: 0, top: 3 };
  const one = look(world({ soft: [bamboo] }).P, v, target(0, 10));
  const two = look(world({ soft: [bamboo, { ...bamboo, minZ: 6, maxZ: 7 }] }).P, v, target(0, 10));
  near(one.gain / bare.gain, 0.35, 1e-9);
  near(two.gain / bare.gain, 0.35 * 0.35, 1e-9);
  near(look(world({ soft: [{ ...bamboo, factor: 0.6 }] }).P, v, target(0, 10)).f, 0.6, 1e-9);
});

test('a target more than 2.5 m above counts ×0.35 unless the guard looks up', () => {
  const { P } = world();
  const ground = look(P, viewer(0, 0, 0), target(0, 10, { y: 0 }));
  const roof = look(P, viewer(0, 0, 0), target(0, 10, { y: 3 }));
  const up = look(P, viewer(0, 0, 0, { lookUp: true }), target(0, 10, { y: 3 }));
  near(roof.gain / ground.gain, 0.35, 1e-9);
  near(up.gain / ground.gain, 1, 1e-9);
});

test('stance, motion and light scale the gain', () => {
  const { P } = world();
  const v = viewer(0, 0, 0);
  const g = (o) => look(P, v, target(0, 8, o)).gain;
  near(g({ stance: 'crouch' }) / g({}), 0.55, 1e-9);
  near(g({ stance: 'crouch', speed: 1.9 }) / g({ stance: 'crouch' }), 0.8 / 0.6, 1e-9);
  near(g({ speed: 6.8 }) / g({ speed: 4.2 }), 1.5, 1e-9);
  let last = 0;
  for (const L of [0, 0.1, 0.3, 0.6, 1, 1.5]) { const x = g({ light: L }); assert.ok(x > last, `light ${L}`); last = x; }
  // A silhouette within 3 m is always visible.
  near(look(P, v, target(0, 2.5, { light: 0 })).gain / look(P, v, target(0, 2.5, { light: 0.6 })).gain, 0.6 / lightGain(0.6), 1e-9);
});

test('crowds: two civilians blend ×0.55, four ×0.35, never while running; a civilian on the line covers ×0.6', () => {
  const { P } = world();
  const v = viewer(0, 0, 0);
  const walk = () => target(0, 10, { speed: 1.4 });
  P.setCrowd([], [], 0);
  const alone = look(P, v, walk()).gain;
  P.setCrowd([1, -1], [10, 10], 2);
  near(look(P, v, walk()).gain / alone, 0.55, 1e-9);
  P.setCrowd([1, -1, 1.5, -1.5], [10, 10, 11, 9], 4);
  near(look(P, v, walk()).gain / alone, 0.35, 1e-9);
  const run = target(0, 10, { speed: 6.8 });
  P.setCrowd([], [], 0);
  const runAlone = look(P, v, run).gain;
  P.setCrowd([1, -1, 1.5, -1.5], [10, 10, 11, 9], 4);
  near(look(P, v, target(0, 10, { speed: 6.8 })).gain / runAlone, 1, 1e-9);
  P.setCrowd([0.2], [5], 1);
  near(look(P, v, walk()).f, 0.6, 1e-9);
  P.setCrowd([], [], 0);
});

test("social cover: zone and act factors, known faces see through it within 10 m (4 m masked)", () => {
  const staff = world({ zones: [{ minX: -50, maxX: 50, minZ: -50, maxZ: 50, kind: 'staff' }] });
  const pub = world({ zones: [{ minX: -50, maxX: 50, minZ: -50, maxZ: 50, kind: 'public' }] });
  const v = viewer(0, 0, 0);
  const plain = look(staff.P, v, target(0, 8, { speed: 1.4 })).gain;
  near(look(staff.P, v, target(0, 8, { speed: 1.4, cover: 'shipper' })).gain / plain, 0.4, 1e-9);
  near(look(pub.P, v, target(0, 8, { speed: 1.4, cover: 'shipper' })).gain / plain, 0.15, 1e-9);
  const runPlain = look(staff.P, v, target(0, 8, { speed: 6.8 })).gain;
  near(look(staff.P, v, target(0, 8, { speed: 6.8, cover: 'shipper' })).gain / runPlain, 1.2, 1e-9, 'running in uniform ×3');
  near(look(staff.P, v, target(0, 8, { speed: 1.4, cover: 'shipper', armed: true })).gain / plain, 1, 1e-9, 'a weapon out breaks cover');
  const face = viewer(0, 0, 0, { knowsFace: true });
  near(look(staff.P, face, target(0, 8, { speed: 1.4, cover: 'shipper' })).gain / plain, 1, 1e-9);
  near(look(staff.P, face, target(0, 8, { speed: 1.4, cover: 'shipper', masked: true })).gain / plain, 0.4, 1e-9);
  assert.equal(look(staff.P, v, target(0, 8, { cover: 'shipper' }), false).gain, look(staff.P, v, target(0, 8)).gain, 'a broken cover counts for nothing');
});

test('concealment: hide spots, soft spots, water and dark parked cars', () => {
  const { P } = world();
  const v = viewer(0, 0, 0);
  const still = look(P, v, target(0, 8)).gain;
  assert.equal(look(P, v, target(0, 1, { concealment: 'spot' })).gain, 0);
  assert.equal(look(P, v, target(0, 5, { concealment: 'soft' })).gain, 0);
  assert.ok(look(P, v, target(0, 1, { concealment: 'soft' })).gain > 0, 'brushing past the bamboo');
  assert.equal(look(P, v, target(0, 8, { concealment: 'dive' })).gain, 0);
  assert.ok(look(P, v, target(0, 1.5, { concealment: 'dive' })).gain > 0, 'a diver within 2 m is seen');
  near(look(P, v, target(0, 8, { concealment: 'float' })).gain / still, 0.3, 1e-9);
  near(look(P, v, target(0, 8, { concealment: 'swim' })).gain / still, 0.6, 1e-9);
  const crouched = look(P, v, target(0, 8, { stance: 'crouch' })).gain;
  near(look(P, v, target(0, 8, { stance: 'crouch', concealment: 'car' })).gain / crouched, 0.25, 1e-9);
  const tg = target(0, 8, { concealment: 'spot' });
  P.prepare(tg);
  assert.ok(policeConcealment(tg) > 0.9);
  const open = target(0, 8, { light: 1 });
  P.prepare(open);
  assert.equal(policeConcealment(open), 0);
  const dark = target(0, 8, { light: 0.1, stance: 'crouch' });
  P.prepare(dark);
  assert.ok(policeConcealment(dark) > 0.5);
});

test('instant alert closer than 1.8 m in front; bumps all around; leaning out is never instant', () => {
  const { P } = world({ night: 1 });
  const v = viewer(0, 0, 0);
  assert.ok(look(P, v, target(0, 1.5, { stance: 'crouch', light: 0.1 })).instant);
  assert.ok(!look(P, v, target(0, 2.5, { light: 0.1 })).instant);
  const behind = look(P, v, target(0, -1, { speed: 1.4 }));
  assert.ok(behind.bump && behind.gain === 0);
  assert.ok(!look(P, v, target(0, 1.5, { exposure: TUNE.lean })).instant);
});

test('hearing: ×0.5 per wall crossed, two at most; low crates do not count; cover zones, beat windows and rain mask it', () => {
  const wall = (z) => [-5, z, 5, z + 0.2];
  const one = world({ boxes: [wall(2)] }), two = world({ boxes: [wall(2), wall(4)] }), three = world({ boxes: [wall(2), wall(4), wall(6)] });
  const open = world({ boxes: [[-5, 3, 5, 3.5, 0, 1]] });
  assert.equal(open.P.walls(0, 0, 0, 8, 1.5), 0, 'a 1 m crate is not a wall');
  assert.equal(one.P.walls(0, 0, 0, 8, 1.5), 1); assert.equal(two.P.walls(0, 0, 0, 8, 1.5), 2); assert.equal(three.P.walls(0, 0, 0, 8, 1.5), 2);
  const hear = (w, r = 40, t = 0) => w.P.hearRadius(0, 1.62, 8, 1, 0, 0, 0, r, t);
  near(hear(open), 40, 1e-9); near(hear(one), 20, 1e-9); near(hear(two), 10, 1e-9); near(hear(three), 10, 1e-9);
  assert.equal(hear(two, 15), 0, '15 m through two walls is 3.75 m: not heard at 8 m');
  // Karaoke room around the listener.
  const karaoke = world();
  karaoke.noise.zone({ minX: -3, maxX: 3, minZ: 6, maxZ: 10 }, 0.35);
  near(hear(karaoke), 14, 1e-9);
  // A drum hit from the music beat clock covers [5, 5.3).
  const beat = world();
  beat.noise.window(0.25, 5, 5.3);
  near(hear(beat, 40, 5.1), 10, 1e-9); near(hear(beat, 40, 5.4), 40, 1e-9);
  // A steam pump that hisses half of every 2 s.
  const pump = world();
  pump.noise.zone({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 }, 0.5, 2, 0.5);
  near(hear(pump, 40, 0.5), 20, 1e-9); near(hear(pump, 40, 1.5), 40, 1e-9);
  near(hear(world({ rain: 1 })), 30, 1e-9);
});

test('light field: bright under a lamp, dark between lamps at night, groups switch off, dynamic spots need line of sight', () => {
  const lamps = [{ x: 0, z: 0, y: 6, r: 5.25, group: 'pho' }, { x: 20, z: 0, y: 6, r: 5.25, group: 'pho' }];
  const w = world({ night: 1, lamps });
  near(w.light.at(0, 1, 0), 0.18 + 1, 1e-9);
  assert.equal(lightBand(w.light.at(0, 1, 0)), 2);
  near(w.light.at(10, 1, 0), 0.18, 1e-9);
  assert.equal(lightBand(w.light.at(10, 1, 0)), 0);
  near(w.light.at(4, 1, 0), 0.18 + (1 - 4 / 5.25) ** 2, 1e-9);
  assert.equal(w.light.setGroup('pho', false), 2);
  near(w.light.at(0, 1, 0), 0.18, 1e-9);
  const open = world({ night: 1 }), walled = world({ night: 1, boxes: [[-2, -5, 2, -4.8]] });
  for (const x of [open, walled]) { const s = x.light.alloc(); x.light.spot(s, 0, 1.5, -10, 0, 0, 16 * DEG, 20, 1); }
  near(open.light.at(0, 1.5, 0), 0.18 + 0.75, 1e-9);
  near(walled.light.at(0, 1.5, 0), 0.18, 1e-9);
  near(ambientLight(0.5, 0, { day: 0.4, night: 0.1 }), 0.25, 1e-12);
});

test('noise table: crouch < walk < run, surfaces scale it, footfalls follow the stride', () => {
  const crouch = stepRadius(1.9, 'crouch'), walk = stepRadius(4.2, 'stand'), run = stepRadius(6.8, 'stand');
  assert.ok(crouch < walk && walk < run);
  near(crouch, 1.5, 1e-9); near(walk, 5, 1e-9); near(run, 11, 1e-9);
  near(stepRadius(4.2, 'stand', 'gravel'), 8, 1e-9); near(stepRadius(4.2, 'stand', 'tin'), 10, 1e-9); near(stepRadius(4.2, 'stand', 'carpet'), 3, 1e-9);
  assert.equal(stepRadius(0, 'stand'), 0);
  near(stepRadius(0, 'stand', 'concrete', true), 4, 1e-9);
  for (const s of Object.keys(SURFACE_NOISE)) assert.ok(SURFACE_NOISE[s] > 0);
  const fs = createFootsteps();
  let steps = 0;
  for (let i = 0; i < 600; i++) if (footstep(fs, 1 / 60, 4.2, 'stand')) steps++;
  near(steps, (4.2 * 10) / 1.15, 1);
  assert.equal(NOISE_CLASS.length, NOISE_KINDS.length);
  for (const c of NOISE_CLASS) assert.ok(Number.isInteger(c));
});

// =====================================================================================================
// Brain.
// =====================================================================================================

test('awareness: suspicious at 25, investigate at 60 (or a sighting held 1.5 s), alert at 100, after a reaction delay', () => {
  const s = sim({ seed: 3 });
  const g = s.brain.addGuard({ id: 'ty', name: 'Tý', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(s.player, { x: 0, z: 14, light: 0.5, lightAuto: false });
  assert.ok(s.until(() => s.events('suspicious').length > 0, 10));
  const sus = s.events('suspicious')[0];
  assert.ok(sus.value >= 25 && sus.value < 25 + 7.2 * 0.6 + 1, `entered at ${sus.value}`);
  assert.ok(s.until(() => g.mode === 'investigate', 10));
  const held = s.t - sus.t;
  assert.ok(held >= TUNE.persistent && held <= TUNE.persistent + TUNE.reactMax + 0.05, `a sighting that will not go away: ${held}`);
  assert.ok(s.until(() => s.events('detected').length > 0, 15), 'walking closer, he makes the player out');
  assert.equal(g.awareness, 100);
  assert.ok(TIER[g.mode] >= 4);
  assert.equal(s.brain.stats.detections, 1);
  // The bare thresholds, without a sighting: 60 goes straight to investigate, 100 to the alert.
  const b = sim({ seed: 3 });
  const h = b.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  b.player.present = false;
  h.awareness = 61; h.lastSeenT = 0; // just glimpsed: inside the 2 s grace
  assert.ok(b.until(() => h.mode !== 'post', 1));
  assert.equal(h.mode, 'investigate');
  assert.equal(b.events('suspicious').length, 0);
  const c = sim({ seed: 3 });
  const k = c.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  c.player.present = false;
  k.awareness = 100; k.lastSeenT = 0;
  assert.ok(c.until(() => c.events('detected').length > 0, 1));
  assert.ok(c.t >= TUNE.reactMin && c.t <= TUNE.reactMax + 0.05, `reaction ${c.t}`);
});

test('awareness: a brief glimpse calms down; an investigation that finds nothing ends cautious', () => {
  const a = sim({ seed: 3 });
  const g = a.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(a.player, { x: 0, z: 14, light: 0.5, lightAuto: false });
  assert.ok(a.until(() => g.mode === 'suspicious', 10));
  a.player.present = false;
  assert.ok(a.until(() => a.events('calm').length > 0, 12));
  assert.equal(a.events('investigate').length, 0);
  assert.equal(g.mode, 'post'); assert.ok(!g.cautious);

  const b = sim({ seed: 3 });
  const h = b.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(b.player, { x: 0, z: 14, light: 0.5, lightAuto: false });
  assert.ok(b.until(() => h.mode === 'investigate', 15));
  b.player.present = false;
  assert.ok(b.until(() => b.events('calm').length > 0, 20));
  assert.equal(h.mode, 'post'); assert.ok(h.cautious, 'medium evidence leaves him cautious');
  assert.ok(h.awareness < 25);
  assert.equal(b.events('detected').length, 0);
});

test('decay: a 2 s grace, then −10/s when unaware; a cautious guard forgets half as fast', () => {
  for (const cautious of [false, true]) {
    const s = sim({ seed: 3 });
    const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
    g.cautious = cautious;
    Object.assign(s.player, { x: 0, z: 14, light: 0.5, lightAuto: false });
    assert.ok(s.until(() => g.awareness >= 12, 10));
    s.player.present = false;
    s.step(1);
    const a0 = g.awareness;
    s.run(1.8);
    near(g.awareness, a0, 1e-9, 'grace');
    s.run(1.2);
    near(g.awareness, a0 - (cautious ? 5 : 10) * 1.0, 0.5, 'decay');
  }
});

test('instant alert within 1.8 m in front, even crouched in the dark; not from behind', () => {
  const s = sim({ seed: 4, night: 1 });
  const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(s.player, { x: 0, z: 1.5, stance: 'crouch', light: 0.1, lightAuto: false });
  assert.ok(s.until(() => s.events('detected').length > 0, 1));
  assert.ok(s.t <= 0.8, `reaction took ${s.t}`);
  assert.ok(s.t >= TUNE.reactMin, 'never faster than a human');
  assert.equal(g.awareness, 100);
  const b = sim({ seed: 4, night: 1 });
  b.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(b.player, { x: 0, z: -1.5, stance: 'crouch', light: 0.1, lightAuto: false });
  b.run(5);
  assert.equal(b.events('detected').length + b.events('suspicious').length, 0);
});

function nightPatrol(seed) {
  const s = sim({ seed, night: 1 });
  const g = s.brain.addGuard({
    id: 'bay', name: 'Bảy', at: { x: 0, z: 0, yaw: 0 }, flashlight: 'night', loop: 'pingpong',
    route: [{ x: 0, z: 0, wait: [1, 1] }, { x: 0, z: 20, wait: [1, 1] }],
  });
  return { s, g };
}

test('scripted patrol: a crouched player in the dark behind the guard stays undetected', () => {
  const { s, g } = nightPatrol(11);
  Object.assign(s.player, { x: 0, z: -4, stance: 'crouch', speed: 0 });
  let most = 0, closest = Infinity;
  s.run(60, (t, p) => {
    if (t > 1 && t < 10) { p.speed = 1.3; p.z += 1.3 / 60; }
    else if (t >= 10 && p.x < 8) { p.speed = 1.3; p.x += 1.3 / 60; }
    else p.speed = 0;
    most = Math.max(most, g.awareness);
    closest = Math.min(closest, Math.hypot(g.x - p.x, g.z - p.z));
  });
  assert.ok(most < TUNE.suspicious, `awareness peaked at ${most}`);
  assert.ok(closest < 5, `the player shadowed him (closest ${closest.toFixed(1)} m)`);
  assert.ok(g.routeI === 0 || g.routeI === 1);
  assert.equal(s.events('suspicious').length + s.events('detected').length, 0);
  assert.ok(s.player.light < 0.28, 'the player stayed in the dark');
});

test('scripted patrol: a running player is heard, turned on and detected', () => {
  const { s, g } = nightPatrol(11);
  Object.assign(s.player, { x: 1.5, z: -15, speed: 0 });
  const caught = s.until(() => s.events('detected').length > 0, 20, (t, p) => { if (t > 3) { p.speed = 6.8; p.z += 6.8 / 60; } });
  assert.ok(caught);
  assert.ok(s.t < 9, `detected at ${s.t.toFixed(2)} s`);
  assert.ok(TIER[g.mode] >= 4);
});

test('alarm: a radio call raises BÁO ĐỘNG, reinforcements follow in 30 s, levels decay 20/90/180 s after contact', () => {
  const s = sim({ seed: 5, reinforcements: [{ count: 2, entry: 'cong' }] });
  const g = s.brain.addGuard({ id: 'suu', name: 'Sửu', at: { x: 0, z: 0, yaw: 0 }, radio: true, weapon: 'pistol' });
  Object.assign(s.player, { x: 0, z: 8, light: 1, lightAuto: false });
  assert.ok(s.until(() => s.brain.alarm >= 2, 10));
  const detected = s.events('detected')[0], two = s.events('alarm').find((e) => e.level === 2);
  assert.equal(two.other, 'radio');
  near(two.t - detected.t, TUNE.alertShout + TUNE.radioCall, 0.05);
  assert.ok(s.events('lockExits').length === 1);
  assert.ok(s.until(() => s.brain.alarm === 3, 2), 'the fight is TRUY SÁT');
  assert.ok(s.events('shot').length >= 0);
  s.player.present = false;
  const gone = s.t;
  s.run(200);
  near(s.events('reinforcements')[0].t - two.t, 30, 0.05);
  const decay = s.events('alarm').filter((e) => e.other === 'decay').map((e) => [e.level, Math.round(e.t - gone)]);
  assert.deepEqual(decay, [[2, 20], [1, 90], [0, 180]]);
  assert.equal(s.brain.alarm, 0);
  assert.ok(g.cautious);
  assert.equal(g.mode, 'post', 'searched, gave up, back at his post');
});

test('alarm: breaking line of sight cuts the radio call short; a gunshot heard is BÁO ĐỘNG', () => {
  const s = sim({ seed: 5 });
  const g = s.brain.addGuard({ id: 'suu', at: { x: 0, z: 0, yaw: 0 }, radio: true });
  Object.assign(s.player, { x: 0, z: 8, light: 1, lightAuto: false });
  assert.ok(s.until(() => g.mode === 'radio', 10));
  s.player.present = false;
  s.run(3);
  assert.equal(g.mode, 'combat');
  assert.ok(s.brain.alarm < 2);
  const b = sim({ seed: 5 });
  const h = b.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  b.player.present = false;
  b.noise.emit('gunshot', 30, 30, 60, b.t, 1.4, 'player');
  b.run(1);
  assert.equal(b.brain.alarm, 2);
  assert.equal(h.mode, 'search');
});

test('alarm: a guard without a radio runs to the kẻng; a kẻng with its striker removed stays silent', () => {
  const s = sim({ seed: 6, alarms: [{ id: 'keng', x: 4, z: -2 }] });
  const g = s.brain.addGuard({ id: 'den', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(s.player, { x: 0, z: 8, light: 1, lightAuto: false });
  let raised = false;
  assert.ok(s.until(() => { raised ||= g.mode === 'raise'; return s.brain.alarm >= 2; }, 12));
  assert.ok(raised);
  assert.equal(s.events('alarm').find((e) => e.level === 2).other, 'keng');
  const b = sim({ seed: 6, alarms: [{ id: 'keng', x: 4, z: -2 }] });
  const h = b.brain.addGuard({ id: 'den', at: { x: 0, z: 0, yaw: 0 } });
  assert.ok(b.brain.disableAlarmPoint('keng'));
  Object.assign(b.player, { x: 0, z: 8, light: 1, lightAuto: false });
  b.run(12);
  assert.equal(h.mode, 'combat');
  assert.equal(b.brain.alarm, 0);
});

function bodyScene(prep) {
  const s = sim({ seed: 9, rules: { wake: false }, lamps: [{ x: 0, z: 10, r: 6 }], hides: [{ id: 'bin', x: 30, z: 30, acceptsBody: true }] });
  const a = s.brain.addGuard({ id: 'den', name: 'Đen', at: { x: 0, z: 10, yaw: Math.PI } });
  const b = s.brain.addGuard({ id: 'luom', name: 'Lượm', at: { x: 0, z: -2, yaw: 0 }, post: { x: 0, z: -2, yaw: 0, sweep: 0.2 } });
  s.player.present = false;
  s.brain.knockOut(a, 'fast');
  prep?.(s, a, b);
  return { s, a, b };
}

test('bodies: a body seen means search, alarm 1 and a wake-up; a tied body stays down; a hidden body is never found', () => {
  {
    const { s, a, b } = bodyScene();
    assert.ok(s.until(() => s.events('bodyFound').length > 0, 10));
    const found = s.events('bodyFound')[0];
    assert.equal(found.guard, 'luom'); assert.equal(found.other, 'den');
    assert.equal(s.brain.alarm, 1);
    assert.ok(s.events('bark').some((e) => e.bark === 'body' && e.other === 'Đen'));
    assert.equal(b.job, 'wake');
    assert.ok(s.until(() => s.events('woken').length > 0, 20));
    assert.equal(a.body, 'none'); assert.equal(a.mode, 'search'); assert.ok(a.cautious);
    assert.equal(b.mode, 'search');
    assert.equal(s.brain.stats.bodiesFound, 1); assert.equal(s.brain.stats.kills, 0);
  }
  {
    const { s, a } = bodyScene((s, a) => assert.ok(s.brain.tie(a)));
    assert.ok(s.until(() => s.events('bodyFound').length > 0, 10));
    s.run(30);
    assert.equal(a.mode, 'tied'); assert.equal(s.events('woken').length, 0);
  }
  {
    const { s } = bodyScene((s, a) => assert.ok(s.brain.hideBody(a, 'bin')));
    s.run(30);
    assert.equal(s.events('bodyFound').length, 0);
    assert.equal(s.brain.alarm, 0);
  }
  {
    // Untouched, a knockout wakes by itself after the TUNE time and searches.
    const s = sim({ seed: 9 });
    const a = s.brain.addGuard({ id: 'den', at: { x: 0, z: 0 } });
    s.player.present = false;
    s.brain.knockOut(a, 'slip');
    s.run(TUNE.wakeSlip - 1);
    assert.equal(a.body, 'down');
    s.run(2);
    assert.equal(a.body, 'none'); assert.equal(a.mode, 'search');
  }
});

function radioScene() {
  const s = sim({ seed: 4, radio: { every: 60, first: 2, grace: 12 }, rules: { wake: false } });
  const a = s.brain.addGuard({ id: 'khanh', name: 'Khánh', at: { x: 0, z: 0 }, radio: true, radioReply: 'Ổn hết anh.' });
  const b = s.brain.addGuard({ id: 'bay', name: 'Bảy', at: { x: 20, z: 0 }, radio: true, radioReply: 'Bình thường, anh.' });
  s.player.present = false;
  s.brain.knockOut(b, 'choke');
  return { s, a, b };
}

test('radio net: a silent guard is missed after the grace; the overheard line passes a bluff, a wrong line does not', () => {
  {
    const { s, a } = radioScene();
    near(s.brain.radioCountdown('bay'), 2 + TUNE.radioGap + TUNE.radioReply, 1e-9);
    assert.ok(s.until(() => s.events('radioMissed').length > 0, 30));
    assert.equal(s.events('radioReply')[0].guard, 'khanh');
    assert.equal(s.events('radioReply')[0].other, 'Ổn hết anh.');
    const call = s.events('radioCall').find((e) => e.guard === 'bay');
    near(s.events('radioMissed')[0].t - call.t, 12, 0.05);
    assert.equal(s.brain.alarm, 1);
    assert.equal(a.job, 'radio');
    s.run(1);
    assert.equal(a.mode, 'investigate');
    near(a.stimX, 20, 1e-9);
  }
  {
    const { s, b } = radioScene();
    assert.ok(s.brain.loot(b));
    assert.ok(s.until(() => s.events('radioBluff').length > 0, 30));
    assert.ok(s.brain.answerRadio('bay', 'Bình thường, anh.'));
    s.run(1);
    assert.equal(s.events('radioBluffResult')[0].ok, true);
    s.run(20);
    assert.equal(s.events('radioMissed').length, 0);
    assert.equal(s.brain.alarm, 0);
  }
  {
    const { s, b } = radioScene();
    s.brain.loot(b);
    assert.ok(s.until(() => s.events('radioBluff').length > 0, 30));
    s.brain.answerRadio('bay', 'Không có gì.');
    s.run(1);
    assert.equal(s.events('radioBluffResult')[0].ok, false);
    assert.equal(s.brain.alarm, 1);
    assert.ok(s.events('bark').some((e) => e.bark === 'radioStranger'));
  }
});

test('distractions: each thrown bolt is investigated; the third within 60 s starts a search and alarm 1', () => {
  const s = sim({ seed: 2 });
  const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  s.player.present = false;
  for (let k = 0; k < 3; k++) {
    s.noise.emit('bolt', 3 + k, 6, 10, s.t, 0, 'player');
    if (k < 2) {
      assert.ok(s.until(() => g.mode === 'investigate', 3), `bolt ${k} investigated`);
      assert.ok(s.until(() => g.mode === 'post' && Math.hypot(g.x, g.z) < 0.5, 25), `bolt ${k}: back at the post`);
      assert.ok(!g.cautious, 'a bolt alone leaves him calm');
    }
  }
  assert.ok(s.until(() => s.events('prank').length > 0, 5));
  assert.equal(g.mode, 'search'); assert.equal(s.brain.alarm, 1);
  assert.ok(s.t < 60);
  assert.equal(s.events('distracted').length, 3);
});

test('search: the coordinator never gives two guards the same point', () => {
  const nav = [];
  for (let x = -12; x <= 12; x += 4) for (let z = -12; z <= 12; z += 4) nav.push({ x, z });
  const s = sim({ seed: 8, nav, hides: [{ id: 'bin', x: 2, z: 3 }, { id: 'tu', x: -3, z: -2 }] });
  const gs = [0, 1, 2, 3].map((i) => s.brain.addGuard({ id: `g${i}`, at: { x: 10 * i - 15, z: 15 } }));
  s.player.present = false;
  for (const g of gs) s.brain.enter(g, 'search', 0, 0, 3);
  const taken = gs.flatMap((g) => Array.from(g.pts.subarray(0, g.ptsN)));
  assert.equal(new Set(taken).size, taken.length);
  assert.equal(taken.length, TUNE.searchPoints);
  let clashes = 0, frames = 0;
  s.run(30, () => {
    const now = [];
    for (const g of gs) if (g.mode === 'search' && g.sub === 0 && g.ptsI < g.ptsN) now.push(g.pts[g.ptsI]);
    if (new Set(now).size !== now.length) clashes++;
    frames++;
  });
  assert.equal(clashes, 0);
  assert.ok(frames > 0);
});

test('takedowns: from the rear 130° arc, from the side while he is busy, never face to face', () => {
  const s = sim();
  const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  const can = (x, z, y = 0) => s.brain.canTakedown(g, x, y, z);
  assert.ok(can(0, -1)); assert.ok(can(0.6, -0.8));
  assert.ok(!can(0, 1)); assert.ok(!can(1, 0)); assert.ok(!can(0, -2)); assert.ok(!can(0, -0.3)); assert.ok(!can(0, -1, 0.6));
  s.brain.act(g, 'smoke');
  assert.ok(can(1, 0), 'smoking: from the side');
  assert.ok(!can(0, 1));
  s.brain.act(g, null);
  s.brain.enter(g, 'alert', 0, 5, 3);
  assert.ok(!can(0, -1), 'not once he is alert');
  const boss = s.brain.addGuard({ id: 'cuong', kind: 'boss', at: { x: 10, z: 0, yaw: 0 } });
  assert.ok(!s.brain.canTakedown(boss, 10, 0, -1));
  boss.stunnedUntil = s.t + 1;
  assert.ok(s.brain.canTakedown(boss, 10, 0, -1));
  assert.ok(!s.brain.takedown(boss, 'choke'), 'a boss cannot be choked');
});

test('takedown: a fast takedown knocks out with a 6 m noise; a watching guard goes for the alert', () => {
  const s = sim({ seed: 3 });
  const g = s.brain.addGuard({ id: 'ty', name: 'Tý', at: { x: 0, z: 0, yaw: 0 } });
  const w = s.brain.addGuard({ id: 'suu', at: { x: 0, z: -12, yaw: 0 } });
  Object.assign(s.player, { x: 0, z: -1, light: 1, lightAuto: false });
  s.run(0.2);
  assert.ok(s.brain.canTakedown(g, 0, 0, -1));
  assert.ok(s.brain.takedown(g, 'fast'));
  assert.equal(g.mode, 'grabbed');
  assert.ok(s.events('witness').some((e) => e.guard === 'suu' && e.other === 'ty'));
  s.run(1);
  assert.equal(g.body, 'down'); assert.equal(s.brain.stats.knockouts, 1);
  assert.ok(TIER[w.mode] >= 4);
});

test('chokehold: five counts in the band knock out; letting go lets him escape; over-squeezing slips but never kills', () => {
  const band = DIFFICULTY.thuong.band;
  const outcomes = (policy, auto = false) => {
    const out = [];
    for (let seed = 1; seed <= 20; seed++) {
      const ch = createChoke(createRng(seed), band, auto);
      let o = 'hold';
      for (let i = 0; i < 1200 && o === 'hold'; i++) o = ch.step(1 / 60, policy(ch));
      out.push(o);
    }
    return out;
  };
  assert.deepEqual(new Set(outcomes((c) => c.p < 0.6)), new Set(['ko']));
  assert.deepEqual(new Set(outcomes(() => false)), new Set(['escape']));
  assert.deepEqual(new Set(outcomes(() => true)), new Set(['slip']));
  assert.deepEqual(new Set(outcomes(() => true, true)), new Set(['ko']), "'Khóa cổ tự động' always succeeds");
  const timed = createChoke(createRng(1), band);
  while (timed.step(1 / 60, timed.p < 0.6) === 'hold');
  assert.ok(timed.time >= TUNE.chokeCount * TUNE.chokeCounts, 'five counts take at least 3.75 s');

  for (const [policy, want] of [[(c) => c.p < 0.6, 'ko'], [() => true, 'slip'], [() => false, 'escape']]) {
    const s = sim({ seed: 7 });
    const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
    Object.assign(s.player, { x: 0, z: -0.8, light: 0.2, lightAuto: false });
    assert.ok(s.brain.takedown(g, 'choke'));
    const ch = createChoke(createRng(2), band);
    let o = 'hold';
    while (o === 'hold') o = s.brain.choke(g, ch, 1 / 60, policy(ch));
    assert.equal(o, want);
    assert.equal(s.brain.stats.kills, 0, 'never a kill');
    if (want === 'ko') { assert.equal(g.body, 'down'); near(g.wakeAt - s.brain.time, TUNE.wakeChoke, 1e-9); }
    if (want === 'slip') {
      assert.equal(g.body, 'down'); assert.equal(s.brain.stats.slips, 1);
      near(g.wakeAt - s.brain.time, TUNE.wakeSlip, 1e-9);
      const i = (s.noise.seq - 1) % s.noise.cap;
      assert.equal(NOISE_KINDS[s.noise.kind[i]], 'slip'); near(s.noise.r[i], 8, 1e-9);
    }
    if (want === 'escape') { assert.equal(g.body, 'none'); assert.equal(g.mode, 'alert'); assert.equal(s.events('escape')[0].value, TUNE.chokeEscapeDamage); }
  }
});

test('LƯƠNG TÂM: fists knock out and never kill; bullets kill and count only while the story counts', () => {
  const s = sim();
  const a = s.brain.addGuard({ id: 'a', at: { x: 0, z: 0 } }), b = s.brain.addGuard({ id: 'b', at: { x: 5, z: 0 } });
  s.player.present = false;
  for (let i = 0; i < 6; i++) s.brain.damage(a, 30, 'fist');
  assert.equal(a.body, 'down'); assert.equal(s.brain.stats.kills, 0); assert.equal(s.brain.stats.knockouts, 1);
  s.brain.damage(b, 150, 'bullet');
  assert.equal(b.body, 'dead'); assert.equal(s.brain.stats.kills, 1);
  s.brain.damage(a, 10, 'bullet');
  assert.equal(a.body, 'dead', 'shooting a downed body kills'); assert.equal(s.brain.stats.kills, 2);
  assert.deepEqual(s.brain.conscience(), { ...s.brain.stats, ghost: true, untouched: false });
  const free = sim({ rules: { countConscience: false } });
  const c = free.brain.addGuard({ id: 'c', at: { x: 0, z: 0 } });
  free.brain.damage(c, 150, 'vehicle');
  assert.equal(c.body, 'dead'); assert.equal(free.brain.stats.kills, 0);
});

test('CCTV: a monitored camera raises alarm 1 then 2; an unmonitored one only blinks; the loop hack blinds it', () => {
  const s = sim({ seed: 3 });
  const far = s.brain.addGuard({ id: 'far', at: { x: 80, z: 80 } });
  s.brain.addCamera({ id: 'cam', x: 0, y: 3, z: 0, yaw: 0, monitoredBy: 'room' });
  Object.assign(s.player, { x: 0, z: 8, light: 1, lightAuto: false });
  assert.ok(s.until(() => s.events('cameraSpotted').length === 1, 20));
  assert.equal(s.brain.alarm, 1);
  s.run(1);
  assert.equal(far.mode, 'investigate');
  assert.ok(s.until(() => s.events('cameraSpotted').length === 2, 20));
  assert.equal(s.brain.alarm, 2);

  const u = sim({ seed: 3 });
  const sec = u.brain.addGuard({ id: 'sec', at: { x: 80, z: 80 } });
  const cam = u.brain.addCamera({ id: 'cam', x: 0, y: 3, z: 0, yaw: 0, monitoredBy: 'sec' });
  u.brain.knockOut(sec, 'fast');
  Object.assign(u.player, { x: 0, z: 8, light: 1, lightAuto: false });
  let blinked = false;
  u.run(30, () => { blinked ||= cam.blink; });
  assert.ok(blinked);
  assert.equal(u.events('cameraSpotted').length, 0); assert.equal(u.brain.alarm, 0);

  const l = sim({ seed: 3 });
  const lc = l.brain.addCamera({ id: 'cam', x: 0, y: 3, z: 0, yaw: 0, monitoredBy: 'room' });
  l.brain.loopCameras(120);
  Object.assign(l.player, { x: 0, z: 8, light: 1, lightAuto: false });
  l.run(30);
  assert.equal(lc.meter, 0); assert.equal(l.events('cameraSpotted').length, 0);
});

test('searchlight: the beam fills its operator fast; knocking him out freezes it', () => {
  const s = sim({ seed: 3, night: 1 });
  const op = s.brain.addGuard({ id: 'op', at: { x: 0, z: -30, yaw: Math.PI } });
  const sl = s.brain.addSearchlight({ id: 'sl', x: 0, y: 6, z: 0, yaw: 0, pitch: -0.35, sweep: 0, operator: 'op' });
  Object.assign(s.player, { x: 0, z: 16 });
  s.run(0.5);
  assert.ok(sl.inBeam);
  assert.ok(s.player.light > 0.8, 'the beam lights the player');
  assert.ok(op.awareness > 20, `operator awareness ${op.awareness}`);
  assert.equal(op.sight.gain, 0, 'he faces away: only the beam sees'); 
  const t = sim({ seed: 3, night: 1 });
  const op2 = t.brain.addGuard({ id: 'op', at: { x: 0, z: -30 } });
  const sl2 = t.brain.addSearchlight({ id: 'sl', x: 0, y: 6, z: 0, yaw: 0, sweep: 0.6, period: 8, operator: 'op' });
  t.player.present = false;
  t.run(1);
  assert.ok(Math.abs(sl2.yaw) > 0.1);
  t.brain.knockOut(op2, 'fast');
  t.run(0.1);
  const frozen = sl2.yaw;
  t.run(3);
  assert.equal(sl2.yaw, frozen); assert.ok(sl2.frozen);
});

test('watchdog: barks at a close player; three barks in 30 s send the guard searching; xíu mại quiets it', () => {
  const s = sim({ seed: 3 });
  const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  s.brain.addDog({ id: 'muc', x: 10, z: 0 });
  Object.assign(s.player, { x: 10, z: 3, light: 0.2, lightAuto: false });
  assert.ok(s.until(() => s.events('search').length > 0, 15));
  assert.ok(s.events('dogBark').length >= 3);
  assert.ok(TIER[g.mode] >= 3);
  const f = sim({ seed: 3 });
  f.brain.addDog({ id: 'muc', x: 10, z: 0 });
  assert.ok(f.brain.feedDog('muc'));
  Object.assign(f.player, { x: 10, z: 3 });
  f.run(19);
  assert.equal(f.events('dogBark').length, 0);
  f.run(2);
  assert.ok(f.events('dogBark').length > 0);
});

test('hide spots: a guard who saw the player climb in checks it (the lid window is the ambush) and pulls him out', () => {
  const s = sim({ rng: () => 0.01, hides: [{ id: 'bin', x: 0, z: 6 }] });
  const g = s.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(s.player, { x: 1, z: 6, light: 1, lightAuto: false });
  s.run(0.2);
  Object.assign(s.player, { x: 0, z: 6, hiddenIn: 'bin', concealment: 'spot' });
  let lid = false;
  assert.ok(s.until(() => s.events('hideCaught').length > 0, 15, () => { lid ||= s.brain.checking(g) === 'bin'; }));
  assert.ok(lid, 'the ambush window opened');
  assert.ok(s.events('bark').some((e) => e.bark === 'hideSeen'));
  assert.equal(g.mode, 'alert');
  // Unseen climbing in, an idle guard never looks.
  const q = sim({ seed: 1, hides: [{ id: 'bin', x: 0, z: 6 }] });
  q.brain.addGuard({ id: 'ty', at: { x: 0, z: 0, yaw: Math.PI } });
  Object.assign(q.player, { x: 0, z: 6, hiddenIn: 'bin', concealment: 'spot' });
  q.run(20);
  assert.equal(q.events('hideCheck').length, 0);
});

test("social cover: a guard questions a loitering shipper once; the second time he is not fooled", () => {
  const s = sim({ seed: 3, zones: [{ minX: -50, maxX: 50, minZ: -50, maxZ: 50, kind: 'staff' }] });
  const g = s.brain.addGuard({ id: 'quang', at: { x: 0, z: 0, yaw: 0 } });
  Object.assign(s.player, { x: 0, z: 6, light: 1, lightAuto: false, cover: 'shipper' });
  assert.ok(s.until(() => s.events('question').length > 0, 20));
  assert.equal(s.events('detected').length, 0);
  assert.ok(s.brain.answer(g, true));
  assert.equal(s.events('questioned')[0].ok, true);
  near(s.brain.coverIntegrity, 70, 1e-9);
  assert.ok(g.bluffed);
  assert.ok(s.until(() => s.events('detected').length > 0, 30), 'bluffed once, the next look is an alert');
  assert.equal(s.events('question').length, 1);
  assert.ok(s.events('bark').some((e) => e.bark === 'alertShipper'));
});

test('scripted guards keep perceiving but stay where the story puts them', () => {
  const s = sim({ seed: 3 });
  const g = s.brain.addGuard({ id: 'cuong', at: { x: 0, z: 0, yaw: 0 } });
  s.brain.script(g, true);
  Object.assign(s.player, { x: 0, z: 5, light: 1, lightAuto: false });
  assert.ok(s.until(() => s.events('detected').length > 0, 10));
  assert.equal(s.events('detected')[0].other, 'scripted');
  assert.equal(g.mode, 'scripted');
  near(g.x, 0, 1e-9); near(g.z, 0, 1e-9);
});

function checkpointScene() {
  const s = sim({
    seed: 12, radio: { every: 50, first: 5 }, alarms: [{ id: 'keng', x: 5, z: 5 }], hides: [{ id: 'bin', x: -4, z: 4, acceptsBody: true }],
    lamps: [{ x: 0, z: 0, r: 5.25, group: 'san' }],
  });
  s.brain.addGuard({ id: 'a', at: { x: 0, z: 0 }, route: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], radio: true });
  s.brain.addGuard({ id: 'b', at: { x: -6, z: 2, yaw: 1 }, radio: true });
  s.brain.addGuard({ id: 'c', at: { x: 6, z: -6, yaw: 2 }, flashlight: 'night' });
  s.brain.addCamera({ id: 'cam', x: 0, y: 3, z: -10, yaw: 0, sweep: 0.5, monitoredBy: 'room', group: 'san' });
  s.brain.addDog({ id: 'muc', x: 15, z: 15 });
  s.player.present = false;
  return s;
}

test('snapshot → restore is a deep-equal round trip', () => {
  const s1 = checkpointScene();
  s1.run(8);
  const b = s1.brain.guard('b');
  s1.brain.knockOut(b, 'fast'); s1.brain.loot(b); s1.brain.hideBody(b, 'bin');
  s1.brain.disableAlarmPoint('keng');
  s1.brain.powerCut('san', 0, 0);
  s1.brain.feedDog('muc');
  s1.run(6);
  const snap = JSON.parse(JSON.stringify(s1.brain.snapshot()));
  const s2 = checkpointScene();
  s2.brain.restore(snap);
  assert.deepEqual(JSON.parse(JSON.stringify(s2.brain.snapshot())), snap);
  assert.equal(s2.light.groupOn('san'), false);
  assert.ok(snap.alarm >= 1);
});

test('determinism: the same seed and inputs give the same events', () => {
  const run = () => {
    const { s } = nightPatrol(77);
    Object.assign(s.player, { x: 1.5, z: -15, speed: 0 });
    s.run(15, (t, p) => { if (t > 3) { p.speed = 6.8; p.z += 6.8 / 60; } });
    return JSON.stringify(s.log);
  };
  const a = run(), b = run();
  assert.equal(a, b);
  assert.ok(a.length > 100);
});

test('barks: every pool is non-empty, natural Vietnamese with diacritics; {tên} is filled in', () => {
  const VI = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;
  for (const [key, pool] of Object.entries(BARKS)) {
    assert.ok(pool.length > 0, key);
    for (const line of pool) assert.match(line, VI, `${key}: ${line}`);
  }
  assert.equal(barkText('body', 0, 'Tý'), 'Ê! Thằng Tý nằm đây nè!');
  assert.equal(barkText('radioBase', 1, 'Bảy'), 'Bảy, nghe rõ trả lời.');
  assert.equal(barkText('calm', 9), BARKS.calm[1]);
});

// =====================================================================================================
// Benchmark.
// =====================================================================================================

test('benchmark: 30 guards at 60 Hz stay under 0.5 ms a frame', () => {
  const r = createRng(99);
  const boxes = [], lamps = [], nav = [], hides = [];
  for (let i = 0; i < 160; i++) {
    const x = r() * 120 - 60, z = r() * 120 - 60, w = 1 + r() * 4, d = 1 + r() * 4;
    boxes.push([x, z, x + w, z + d, 0, r() < 0.5 ? 1 + r() * 1.5 : Infinity]);
  }
  for (let i = 0; i < 40; i++) lamps.push({ x: r() * 120 - 60, z: r() * 120 - 60, y: 6, r: r() < 0.5 ? 5.25 : 3.25, group: i < 10 ? 'kho' : 'pho' });
  for (let x = -56; x <= 56; x += 8) for (let z = -56; z <= 56; z += 8) nav.push({ x, z });
  for (let i = 0; i < 12; i++) hides.push({ id: `h${i}`, x: r() * 100 - 50, z: r() * 100 - 50, acceptsBody: true });
  const s = sim({ seed: 21, night: 0.8, boxes, lamps, nav, hides, alarms: [{ id: 'keng', x: 0, z: 0 }], radio: { every: 60, first: 10 }, quiet: true });
  const N = 60, cx = new Float64Array(N), cz = new Float64Array(N);
  for (let i = 0; i < N; i++) { cx[i] = r() * 100 - 50; cz[i] = r() * 100 - 50; }
  s.P.setCrowd(cx, cz, N);
  for (let i = 0; i < 30; i++) {
    const x = r() * 100 - 50, z = r() * 100 - 50;
    const route = i % 2 ? [{ x, z }, { x: x + 10, z }, { x: x + 10, z: z + 10 }, { x, z: z + 10 }] : undefined;
    s.brain.addGuard({
      id: `g${i}`, at: { x, z, yaw: r() * 6 }, route, flashlight: i % 3 === 0 ? 'night' : false, radio: i % 4 === 0,
      weapon: i % 5 === 0 ? 'pistol' : 'pipe', kind: i % 5 === 0 ? 'gunman' : 'thug',
    });
  }
  s.brain.addCamera({ id: 'cam', x: 0, y: 4, z: -20, yaw: 0, sweep: 0.6, monitoredBy: 'room' });
  s.brain.addDog({ id: 'muc', x: 20, z: 20 });
  const p = s.player, dt = 1 / 60;
  let t = 0, spent = 0, frames = 0;
  const fs = createFootsteps();
  const frame = (timed) => {
    t += dt;
    for (let i = 0; i < N; i++) { cx[i] += Math.sin(t + i) * 0.02; cz[i] += Math.cos(t * 0.7 + i) * 0.02; }
    const a = t * 0.1;
    p.x = 30 * Math.cos(a); p.z = 30 * Math.sin(a); p.speed = 3; p.stance = Math.sin(t * 0.3) > 0 ? 'crouch' : 'stand';
    const step = footstep(fs, dt, p.speed, p.stance, 'gravel');
    if (step) s.noise.emit('step', p.x, p.z, step, t, 0, 'player');
    const t0 = performance.now();
    s.brain.update(dt, t, p);
    if (timed) { spent += performance.now() - t0; frames++; }
    s.brain.clearEvents();
  };
  for (let i = 0; i < 600; i++) frame(false);
  for (let i = 0; i < 3600; i++) frame(true);
  const ms = spent / frames;
  const modes = {};
  for (const g of s.brain.guards) modes[g.mode] = (modes[g.mode] ?? 0) + 1;
  console.log(`# 30 guards, 160 solids, 40 lamps, 60 civilians: ${ms.toFixed(4)} ms/frame at 60 Hz (alarm ${s.brain.alarm}; modes ${JSON.stringify(modes)})`);
  assert.ok(ms < 0.5, `${ms.toFixed(3)} ms/frame`);
});
