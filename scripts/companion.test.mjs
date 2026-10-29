// node --experimental-transform-types --test scripts/companion.test.mjs
// The companion dog of zombie mode (design.md §6b, §7.1 DOG): following, staying, the teleport rule, biting (hold per
// kind, never a bloater), hurt → down → away → back, bandage/petting rates, netState rounding, puppets, solo rescue.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from 'node:module';
import * as THREE from 'three';

// animals.ts (the dog's proportions) imports city.ts without an extension (the bundler resolves it): teach node to try `.ts`.
if (module.registerHooks) {
  module.registerHooks({
    resolve(specifier, context, next) {
      if (/^\.\.?\//.test(specifier) && !/\.[mc]?[jt]sx?$/.test(specifier) && /\/(app|lib)\//.test(context.parentURL ?? '')) {
        try { return next(`${specifier}.ts`, context); } catch { /* not a TS module */ }
      }
      return next(specifier, context);
    },
  });
}
const C = await import('../app/game/companion.ts');
const { DOG_MODES, ZOMBIE_KINDS, MUTANT_KINDS, MUTANT_ID_BASE } = await import('../lib/zombie-protocol.ts');
const { createCompanions, biteFor, heelSpot, samplePuppet, dogTriangles, DOG_MAX_HP } = C;

const DT = 1 / 30;
const RIVER = 40; // z > 40 is deep water in the fake world

/** A flat fake world: land below z = 40, optional walls (boxes), zombies with net ids, a configurable unseen threat. */
function fakeWorld() {
  const w = {
    zombies: [], walls: [], bites: [], alarms: [], threat: null, mutant: null, stalkerAt: null, blind: false, clearCalls: [],
    ground: () => 0,
    clear(x, z, r) {
      if (z + r > RIVER) return false;
      for (const b of w.walls) if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return false;
      return true;
    },
    sight: () => !w.blind,
    nearestZombie(x, z, r) {
      let best = null, bd = r;
      for (const zb of w.zombies) { const d = Math.hypot(zb.x - x, zb.z - z); if (d <= bd) { bd = d; best = zb; } }
      return best;
    },
    bite(id, damage, hold, x, z) { w.bites.push({ w: id, damage, hold, x, z }); },
    unseenThreat: () => w.threat,
    alarm(x, z) { w.alarms.push({ x, z }); },
    nearestMutant(x, z, r) { return w.mutant && Math.hypot(w.mutant.x - x, w.mutant.z - z) <= r ? w.mutant : null; },
    stalker(x, z, r) { return w.stalkerAt && Math.hypot(w.stalkerAt.x - x, w.stalkerAt.z - z) <= r ? w.stalkerAt : null; },
  };
  return w;
}
const owner = (extra = {}) => ({ x: 0, z: 0, yaw: 0, camYaw: 0, speed: 0, inVehicle: false, down: false, aimX: 0, aimZ: 10, firing: false, ...extra });

function setup(extra = {}) {
  const scene = new THREE.Scene();
  const world = fakeWorld();
  const dogs = createCompanions(scene, world);
  const o = owner(extra);
  const ctx = { scene, world, dogs, o, now: 0, dangers: [] };
  ctx.step = (seconds, each) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      ctx.now += DT;
      each?.(ctx);
      dogs.update(DT, ctx.now, ctx.o, ctx.dangers);
    }
  };
  return ctx;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('model budget: four instanced meshes, at most 1.8 k triangles per dog, 4 draw calls only while a dog exists', () => {
  assert.ok(dogTriangles() <= 1800, `${dogTriangles()} triangles`);
  const { scene, dogs, step } = setup();
  assert.equal(scene.children.filter((c) => c.isInstancedMesh).length, 4);
  step(0.1);
  assert.equal(dogs.stats().calls, 0, 'no dog, no draw calls');
  dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  step(0.1);
  assert.deepEqual([dogs.stats().dogs, dogs.stats().calls], [1, 4]);
  for (const mesh of scene.children.filter((c) => c.isInstancedMesh)) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); assert.ok(m.elements.every(Number.isFinite), 'finite matrices'); }
  }
  dogs.dispose();
  assert.equal(scene.children.length, 0);
});

test('follow: heels 1–3 m from a walking or sprinting owner and settles beside a standing one', () => {
  // Along +x (yaw π/2), well away from the fake river.
  const ctx = setup({ yaw: Math.PI / 2, camYaw: Math.PI / 2 });
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1.5, 1);
  for (const speed of [1.5, 4, 6.8]) {
    const far = [];
    ctx.o.speed = speed;
    ctx.step(8, (c) => { c.o.x += speed * DT; });
    ctx.step(4, (c) => { c.o.x += speed * DT; far.push(dist(c.dogs.own(), c.o)); });
    const worst = Math.max(...far), best = Math.min(...far);
    assert.ok(best >= 1 && worst <= 3, `speed ${speed}: ${best.toFixed(2)}–${worst.toFixed(2)} m`);
  }
  ctx.o.speed = 0;
  ctx.step(4);
  const d = dist(ctx.dogs.own(), ctx.o);
  assert.ok(d >= 0.9 && d <= 3, `standing owner: ${d.toFixed(2)} m`);
  assert.equal(ctx.dogs.own().mode, 'follow');
  assert.equal(ctx.dogs.hud(0).label, 'Đang theo');
  assert.match(ctx.dogs.hud(0).hint, /Y gọi\/ngồi · T cắn · X băng bó/);
  const h = heelSpot({ x: 0, z: 0, yaw: 0 });
  assert.ok(h.z < -1 && h.x > 0, 'heel spot is behind-left (left of a figure facing +z is +x)');
});

test('stay: sits where told while the owner walks off; call brings it back', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(1);
  assert.match(ctx.dogs.command('call', ctx.now), /ngồi đợi/, 'call at heel toggles to stay');
  const spot = { ...ctx.dogs.own() };
  ctx.o.speed = 2;
  ctx.step(10, (c) => { c.o.z += 2 * DT; });
  assert.ok(dist(ctx.dogs.own(), spot) < 0.5, 'stayed put');
  assert.equal(ctx.dogs.own().mode, 'stay');
  assert.equal(ctx.dogs.netState().m, DOG_MODES.indexOf('stay'));
  assert.equal(ctx.dogs.hud(0).label, 'Đang ngồi đợi');
  assert.match(ctx.dogs.command('call', ctx.now), /lại đây/);
  ctx.o.speed = 0;
  ctx.step(8);
  assert.ok(dist(ctx.dogs.own(), ctx.o) < 3, 'came back to heel');
  assert.match(ctx.dogs.command('stay', ctx.now), /ngồi đợi/);
  assert.equal(ctx.dogs.own().order, 'stay');
});

test('the teleport happens only when the dog is out of view and more than 45 m away', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', 0, -50);
  // In view (the camera looks toward it): it runs back, it never jumps.
  ctx.o.camYaw = Math.PI;
  ctx.step(0.2);
  assert.ok(dist(ctx.dogs.own(), ctx.o) > 46, 'seen at 50 m: no teleport');
  // 30 m away and unseen: no teleport either.
  ctx.dogs.place(0, -30);
  ctx.o.camYaw = 0;
  ctx.step(0.1);
  assert.ok(dist(ctx.dogs.own(), ctx.o) > 28, 'unseen at 30 m: no teleport');
  // 50 m away and unseen: it reappears near the owner, out of the owner's view.
  ctx.dogs.place(0, -50);
  ctx.step(DT);
  const d = ctx.dogs.own(), r = dist(d, ctx.o);
  assert.ok(r <= 8.5, `reappeared ${r.toFixed(1)} m away`);
  assert.ok(!C.seenBy(ctx.o, d.x, d.z, () => true), 'reappeared outside the view cone');
  // Behind a wall with no line of sight counts as unseen too.
  const ctx2 = setup({ camYaw: Math.PI });
  ctx2.dogs.spawnOwn('Vàng', 0, '#d8322a', 0, -50);
  ctx2.world.blind = true;
  ctx2.step(DT);
  assert.ok(dist(ctx2.dogs.own(), ctx2.o) > 46, 'no line of sight to a spot near the owner: it cannot reappear there either');
});

test('bite table: holds the small kinds 1 s for 12, nips the big ones for 6, never bites a bloater', () => {
  for (const kind of ZOMBIE_KINDS) {
    const b = biteFor(kind);
    if (kind === 'bloater') assert.equal(b, null);
    else if (['brute', 'riot', 'stalker'].includes(kind)) assert.deepEqual(b, { damage: 6, hold: 0 }, kind);
    else assert.deepEqual(b, { damage: 12, hold: 1 }, kind);
  }
  for (const kind of MUTANT_KINDS) assert.deepEqual(biteFor(kind, true), { damage: 6, hold: 0 }, kind);
});

test('attack: T sends it at the zombie nearest the aim point; one bite, a 1 s hold, then back to heel', () => {
  const ctx = setup({ aimX: -6, aimZ: 5 });
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.world.zombies.push({ w: 0x81, x: 5, z: 10, kind: 'walker', big: false }, { w: 0x102, x: -6, z: 4, kind: 'runner', big: false });
  assert.match(ctx.dogs.command('attack', ctx.now), /cắn/);
  let biting = false;
  ctx.step(4, (c) => { if (c.dogs.own().mode === 'bite') { biting = true; assert.equal(c.dogs.netState().t, 0x102); } });
  assert.ok(biting, 'held the zombie');
  assert.deepEqual(ctx.world.bites.map((b) => [b.w, b.damage, b.hold]), [[0x102, 12, 1]]);
  const b = ctx.world.bites[0];
  assert.ok(Math.hypot(b.x + 6, b.z - 4) < 1.3, 'bit from within reach');
  assert.ok(ctx.world.alarms.length > 0, 'the order bark is loud (a hunter hears it)');
  assert.equal(ctx.dogs.own().task, null);
  assert.equal(ctx.dogs.own().mode, 'follow');
  // A brute: a 6-damage nip, no hold.
  ctx.world.zombies = [{ w: 0x203, x: -3, z: 3, kind: 'brute', big: false }];
  ctx.dogs.command('attack', ctx.now);
  ctx.step(4);
  assert.deepEqual(ctx.world.bites.slice(1).map((x) => [x.w, x.damage, x.hold]), [[0x203, 6, 0]]);
  // A mutant (net id ≥ MUTANT_ID_BASE) only when ordered: a nip.
  ctx.world.zombies = [{ w: MUTANT_ID_BASE + 1, x: -4, z: 4, kind: 'colossus', big: true }];
  ctx.dogs.command('attack', ctx.now);
  ctx.step(4);
  assert.deepEqual(ctx.world.bites.slice(2).map((x) => [x.w, x.damage, x.hold]), [[MUTANT_ID_BASE + 1, 6, 0]]);
});

test('never bites a bloater: it refuses the order, and does not defend against one either', () => {
  const ctx = setup({ aimX: 0, aimZ: 6 });
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.world.zombies.push({ w: 0x81, x: 0, z: 6, kind: 'bloater', big: false });
  assert.match(ctx.dogs.command('attack', ctx.now), /Bọng độc/);
  ctx.step(3);
  ctx.world.zombies[0].x = 0.5; ctx.world.zombies[0].z = 1;   // clawing range of the owner
  ctx.step(4);
  assert.equal(ctx.world.bites.length, 0);
});

test('auto-defend and guard: bites a small zombie clawing its owner; a staying dog bites what comes within 2 m', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(1);
  ctx.world.zombies.push({ w: 0x85, x: 1, z: 0.8, kind: 'shipper', big: false });
  ctx.step(2);
  assert.equal(ctx.world.bites[0]?.w, 0x85, 'defended its owner');
  assert.equal(ctx.world.bites[0].hold, 1);
  ctx.world.zombies = [];
  ctx.world.bites = [];
  ctx.dogs.command('stay', ctx.now);
  const at = ctx.dogs.own();
  ctx.world.zombies.push({ w: 0x86, x: at.x + 8, z: at.z, kind: 'walker', big: false });
  ctx.step(2);
  assert.equal(ctx.world.bites.length, 0, 'barks at 8 m, does not leave its post');
  assert.ok(ctx.world.alarms.length > 0, 'barked');
  ctx.world.zombies[0].x = at.x + 1.5;
  ctx.step(2);
  assert.equal(ctx.world.bites[0]?.w, 0x86, 'bit at 1.5 m');
  ctx.step(4);
  assert.ok(dist(ctx.dogs.own(), at) < 0.6, 'back at its post');
});

test('damage → hurt (limp) → down → 60 s window → away → back at the next rest with 50%', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(0.5);
  ctx.dogs.damage(50, { x: 0, z: 5 }, false, ctx.now);
  assert.equal(ctx.dogs.own().hp, 70);
  assert.equal(ctx.dogs.own().mode, 'follow');
  ctx.dogs.damage(30, { x: 0, z: 5 }, false, ctx.now);
  assert.equal(ctx.dogs.own().mode, 'hurt');
  assert.equal(ctx.dogs.hud(0).label, 'Bị thương');
  assert.ok(ctx.dogs.takeEvents().some((e) => e.k === 'hurt' && /bị thương/.test(e.text)));
  // Limping: never faster than 60% of the gallop.
  ctx.dogs.place(0, -25);
  let top = 0, prev = ctx.dogs.own();
  ctx.step(2, (c) => { const d = c.dogs.own(); top = Math.max(top, dist(d, prev) / DT); prev = d; });
  assert.ok(top <= 9 * 0.6 + 0.05, `limp top speed ${top.toFixed(2)}`);
  // A heavy hit knocks it over and away from the blow.
  const before = ctx.dogs.own();
  ctx.dogs.damage(5, { x: before.x, z: before.z + 1 }, true, ctx.now);
  assert.ok(ctx.dogs.own().z < before.z, 'knocked away from the blow');
  ctx.dogs.damage(100, { x: 0, z: 5 }, false, ctx.now);
  assert.equal(ctx.dogs.own().mode, 'down');
  assert.equal(ctx.dogs.netState().h, 0);
  assert.equal(ctx.dogs.hud(0).reviveIn, 60);
  assert.match(ctx.dogs.hud(0).label, /Đã gục · giữ E để cứu/);
  let downed = 0;
  ctx.dogs.forEachDog((slot, x, z, down) => { if (slot === -1 && down) downed++; });
  assert.equal(downed, 1, 'reported down, so zombies ignore it');
  ctx.dogs.damage(10, { x: 0, z: 5 }, false, ctx.now);
  assert.equal(ctx.dogs.own().hp, 0, 'no damage while down');
  ctx.step(59);
  assert.equal(ctx.dogs.own().life, 'down', 'still revivable at 59 s');
  ctx.step(1.5);
  assert.equal(ctx.dogs.own().life, 'away');
  assert.equal(ctx.dogs.netState().m, DOG_MODES.indexOf('away'));
  assert.ok(ctx.dogs.takeEvents().some((e) => e.k === 'away' && /chạy đi trốn · sẽ quay lại khi hết đợt/.test(e.text)));
  let seen = 0;
  ctx.dogs.forEachDog(() => { seen++; });
  assert.equal(seen, 0, 'hidden while away');
  assert.equal(ctx.dogs.hud(0).state, 'away');
  assert.ok(ctx.dogs.hud(0).awayFor >= 0);
  // The next rest: MODE calls revive(), it comes back to its owner with 50%.
  ctx.o.x = 30; ctx.o.z = 10;
  ctx.dogs.revive(ctx.now);
  assert.equal(ctx.dogs.own().life, 'up');
  assert.equal(ctx.dogs.own().hp, DOG_MAX_HP * 0.5);
  assert.ok(dist(ctx.dogs.own(), ctx.o) < 9, 'back beside its owner');
  // Revived within the window instead: 50% where it lies.
  ctx.dogs.damage(500, { x: 0, z: 0 }, false, ctx.now);
  ctx.step(10);
  ctx.dogs.revive(ctx.now);
  assert.equal(ctx.dogs.own().hp, 60);
  assert.equal(ctx.dogs.own().mode, 'follow');
});

test('healing: petting +6 HP/s near a calm owner, bandage +60 (a downed dog up at 60%), regeneration 2 HP/s to half', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(2);
  ctx.dogs.damage(90, { x: 0, z: 5 }, false, ctx.now);
  ctx.dogs.place(ctx.o.x + 1, ctx.o.z - 1);
  const hp0 = ctx.dogs.own().hp;
  ctx.step(5);
  const gained = ctx.dogs.own().hp - hp0;
  assert.ok(Math.abs(gained - 30) < 1.5, `petting gained ${gained.toFixed(1)} in 5 s`);
  assert.match(ctx.dogs.hud(0).hint, /vuốt ve/);
  // No petting with a zombie within 12 m, or while shooting.
  ctx.world.zombies.push({ w: 1, x: 8, z: 0, kind: 'walker', big: false });
  const hp1 = ctx.dogs.own().hp;
  ctx.step(2);
  assert.ok(ctx.dogs.own().hp - hp1 < 6 * 0.26, 'a zombie close by (noticed within a quarter second)');
  ctx.world.zombies = [];
  ctx.o.firing = true;
  const hp2 = ctx.dogs.own().hp;
  ctx.step(2);
  assert.ok(ctx.dogs.own().hp - hp2 < 0.01, 'while shooting');
  ctx.o.firing = false;
  // Bandage: within reach, hurt.
  const hp3 = ctx.dogs.own().hp;
  assert.equal(ctx.dogs.bandage(), true);
  assert.equal(ctx.dogs.own().hp, Math.min(DOG_MAX_HP, hp3 + 60));
  ctx.dogs.heal(500);
  assert.equal(ctx.dogs.bandage(), false, 'not hurt: bandage yourself instead');
  ctx.dogs.damage(30, { x: 0, z: 5 }, false, ctx.now);
  ctx.dogs.place(ctx.o.x + 6, ctx.o.z);
  ctx.o.speed = 0;
  assert.equal(ctx.dogs.bandage(), false, 'out of reach');
  // A downed dog bandaged back up at 60%.
  ctx.dogs.place(ctx.o.x + 1, ctx.o.z);
  ctx.dogs.damage(500, { x: 0, z: 5 }, false, ctx.now);
  assert.equal(ctx.dogs.bandage(), true);
  assert.equal(ctx.dogs.own().hp, DOG_MAX_HP * 0.6);
  // Regeneration: none for 6 s after a hit, then 2 HP/s up to 50%.
  const far = setup({ x: 0, z: 0 });
  far.dogs.spawnOwn('Mực', 1, '#2b6cb0', 0, -1.5);
  far.step(0.5);
  far.dogs.command('stay', far.now);
  far.dogs.damage(100, { x: 5, z: 5 }, false, far.now);
  far.o.speed = 2;
  far.step(3, (c) => { c.o.z += 2 * DT * 4; });
  far.o.speed = 0;
  const r0 = far.dogs.own().hp;
  far.step(2.5);
  assert.ok(far.dogs.own().hp - r0 < 0.2, 'no regeneration within 6 s of a hit');
  far.step(3);
  const r1 = far.dogs.own().hp;
  far.step(5);
  assert.ok(Math.abs(far.dogs.own().hp - r1 - 10) < 0.5, `regenerated ${(far.dogs.own().hp - r1).toFixed(1)} in 5 s`);
  far.step(40);
  assert.equal(far.dogs.own().hp, DOG_MAX_HP * 0.5, 'up to half');
});

test('netState: bounded, rounded and small; c is the coat, t the zombie it holds', () => {
  const ctx = setup({ x: 123.456789, z: -98.7654321 });
  ctx.dogs.spawnOwn('Bông', 2, '#ffffff', 120.123456, -100.98765);
  ctx.step(1.3, (c) => { c.o.yaw += 0.37; c.o.speed = 1; });
  const n = ctx.dogs.netState();
  for (const [k, digits] of [['x', 2], ['z', 2], ['a', 3]]) assert.equal(n[k], Math.round(n[k] * 10 ** digits) / 10 ** digits, k);
  assert.ok(n.a >= -Math.PI && n.a <= Math.PI);
  assert.ok(Number.isInteger(n.m) && n.m >= 0 && n.m < DOG_MODES.length);
  assert.ok(Number.isInteger(n.h) && n.h >= 0 && n.h <= 100);
  assert.equal(n.t, -1);
  assert.equal(n.c, 2);
  assert.ok(JSON.stringify(n).length <= 64, JSON.stringify(n));
  ctx.dogs.damage(37.77, { x: 0, z: 0 }, false, ctx.now);
  assert.equal(ctx.dogs.netState().h, Math.round((120 - 37.77) / 120 * 100));
  assert.equal(setup().dogs.netState(), null);
});

test('puppets: interpolated at the render time, modes step at their sample, ≤ 150 ms extrapolation, hidden modes', () => {
  const S = [{ t: 1000, x: 0, z: 0, a: 0, m: 0, h: 100, w: -1 }, { t: 1050, x: 1, z: 0, a: 0.2, m: 3, h: 90, w: 7 }, { t: 1100, x: 2, z: 0, a: 0.4, m: 3, h: 90, w: 7 }];
  const mid = samplePuppet(S, 1025);
  assert.ok(Math.abs(mid.x - 0.5) < 1e-9 && Math.abs(mid.a - 0.1) < 1e-9);
  assert.equal(mid.m, 0, 'mode of the sample at or before the render time');
  assert.ok(Math.abs(mid.speed - 20) < 1e-6, '1 m in 50 ms');
  assert.equal(samplePuppet(S, 1075).m, 3);
  assert.ok(Math.abs(samplePuppet(S, 1200).x - 4) < 1e-9, 'extrapolated 100 ms at 20 m/s');
  const held = samplePuppet(S, 2000);
  assert.ok(Math.abs(held.x - 5) < 1e-9 && held.speed === 0, 'held after 150 ms');
  assert.equal(samplePuppet([], 0), null);
  // Angles interpolate the short way round.
  assert.ok(Math.abs(samplePuppet([{ ...S[0], a: 3.1 }, { ...S[1], a: -3.1 }], 1025).a - Math.PI) < 0.01);

  const ctx = setup();
  const peers = (x, m = 0) => [{ slot: 3, name: 'Lan', color: '#3b82f6', dog: { x, z: 5, a: 0, m, h: 80, t: -1, c: 3 } }];
  ctx.dogs.setPeers(peers(0), 900, 1000);
  ctx.dogs.setPeers(peers(2), 1000, 1100);
  ctx.step(DT);
  let got = null;
  ctx.dogs.forEachDog((slot, x, z, down) => { got = { slot, x, z, down }; });
  assert.equal(got.slot, 3);
  assert.ok(got.x > 0 && got.x < 2, `between samples: ${got.x}`);
  assert.equal(ctx.dogs.stats().dogs, 1);
  const tags = [];
  ctx.dogs.forEachTag((slot, text) => tags.push(text));
  assert.deepEqual(tags, ['Mít · Lan']);
  // Down: reported down, and near() finds it for the revive prompt.
  ctx.dogs.setPeers(peers(2, DOG_MODES.indexOf('down')), 1200, 1200);
  ctx.step(DT);
  const n = ctx.dogs.near(2, 5, 2);
  assert.deepEqual([n.slot, n.down], [3, true]);
  // Away or riding: not drawn, not prey.
  ctx.dogs.setPeers(peers(2, DOG_MODES.indexOf('away')), 1300, 1300);
  ctx.step(DT);
  let count = 0;
  ctx.dogs.forEachDog(() => { count++; });
  assert.equal(count, 0);
  // Gone from the snapshot: removed.
  ctx.dogs.setPeers([], 1400, 1400);
  assert.equal(ctx.dogs.stats().puppets, 0);
  // Junk is ignored.
  ctx.dogs.setPeers([{ slot: 1, name: 'x', color: '#000000', dog: { x: NaN, z: 0, a: 0, m: 0, h: 0, t: -1, c: 0 } }], 1500, 1500);
  assert.equal(ctx.dogs.stats().puppets, 0);
});

test('solo rescue: the dog licks its downed owner awake in 5 s, once (MODE passes allowed = false after)', () => {
  const ctx = setup({ down: true });
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', 5, -4);
  let done = 0, at = -1, last = 0;
  ctx.step(12, (c) => {
    const p = c.dogs.rescue(c.o, c.now, done === 0);
    if (p === 1) { done++; at = c.now; }
    else if (done === 0) { assert.ok(p !== null && p >= last - 1e-9, 'progress only grows'); last = p; }
    else assert.equal(p, null);
  });
  assert.equal(done, 1);
  assert.ok(at > 5 && at < 9, `rescued at ${at.toFixed(2)} s`);
  const ev = ctx.dogs.takeEvents().map((e) => e.k);
  assert.ok(ev.includes('lick') && ev.includes('rescued'));
  // A downed dog cannot rescue.
  const ctx2 = setup({ down: true });
  ctx2.dogs.spawnOwn('Vàng', 0, '#d8322a', 1, 0);
  ctx2.dogs.damage(500, { x: 0, z: 0 }, false, 0);
  assert.equal(ctx2.dogs.rescue(ctx2.o, 0, true), null);
});

test('it leaves telegraphed areas, keeps 8 m from mutants, waits at the bank for a swimming owner', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(1);
  const d = ctx.dogs.own();
  ctx.dangers = [{ x: d.x, z: d.z, r: 3, until: ctx.now + 5 }];
  ctx.step(1.2);
  assert.ok(dist(ctx.dogs.own(), ctx.dangers[0]) > 3, 'out of the marker');
  ctx.dangers = [];
  ctx.step(2);
  const e = ctx.dogs.own();
  ctx.world.mutant = { x: e.x + 3, z: e.z };
  ctx.step(2);
  assert.ok(dist(ctx.dogs.own(), ctx.world.mutant) >= 8, `kept ${dist(ctx.dogs.own(), ctx.world.mutant).toFixed(1)} m from the mutant`);
  ctx.world.mutant = null;
  // Swimming owner: the dog never steps into the water.
  ctx.o.z = 46; ctx.o.speed = 1;
  let wet = 0;
  ctx.step(10, (c) => { const p = c.dogs.own(); if (!c.world.clear(p.x, p.z, 0.2)) wet++; });
  assert.equal(wet, 0);
  assert.ok(ctx.dogs.own().z > 36, 'waiting at the bank');
});

test('vehicles: it rides along hidden and hops out beside its owner', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(1);
  ctx.o.inVehicle = true;
  ctx.step(0.2);
  assert.equal(ctx.dogs.own().mode, 'ride');
  assert.equal(ctx.dogs.netState().m, DOG_MODES.indexOf('ride'));
  assert.equal(ctx.dogs.stats().dogs, 0, 'not drawn');
  ctx.step(3, (c) => { c.o.x += 15 * DT; });
  assert.ok(Math.abs(ctx.dogs.netState().x - ctx.o.x) < 0.01, 'rides with its owner');
  ctx.dogs.damage(50, { x: 0, z: 0 }, false, ctx.now);
  assert.equal(ctx.dogs.own().hp, DOG_MAX_HP, 'safe inside');
  ctx.o.inVehicle = false;
  ctx.step(0.1);
  assert.equal(ctx.dogs.own().mode, 'follow');
  assert.ok(dist(ctx.dogs.own(), ctx.o) < 3);
  assert.ok(ctx.dogs.takeEvents().some((e) => e.k === 'hop'));
});

test('barks at a threat its owner cannot see (HUD ping with a direction, loud for hunters), with a cooldown', () => {
  const ctx = setup();
  ctx.dogs.spawnOwn('Vàng', 0, '#d8322a', -1, -1.5);
  ctx.step(0.5);
  ctx.world.threat = { x: -4, z: -15 };
  ctx.step(3);
  const barks = ctx.dogs.takeEvents().filter((e) => e.k === 'bark');
  assert.equal(barks.length, 1);
  assert.deepEqual([barks[0].tx, barks[0].tz], [-4, -15]);
  assert.ok(ctx.world.alarms.length >= 1);
  ctx.world.threat = null;
  ctx.world.stalkerAt = { x: 3, z: -10 };
  ctx.step(1);
  assert.ok(ctx.dogs.takeEvents().some((e) => e.k === 'growl'), 'growls at a stalker');
});
