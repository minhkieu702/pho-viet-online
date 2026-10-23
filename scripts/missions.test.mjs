import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissions, MISSION_DEFS } from '../app/game/missions.ts';

const player = (x, z, overrides = {}) => ({ x, z, riding: false, down: false, ...overrides });
const atTarget = (missions, overrides = {}) => {
  const target = missions.view().target;
  assert.ok(target, 'active mission should have a target');
  return player(target.x, target.z, overrides);
};

function completeMission(missions, id) {
  missions.select(id);
  const definition = MISSION_DEFS.find((mission) => mission.id === id);
  let reward;
  for (const step of definition.steps) {
    const currentPlayer = atTarget(missions, { riding: step.requiresBike ?? false });
    const event = step.mode === 'interact'
      ? missions.interact(currentPlayer)
      : missions.update(1, currentPlayer);
    assert.ok(event);
    if (event.reward) {
      assert.equal(reward, undefined, 'each run should emit only one reward');
      reward = event.reward;
    }
  }
  return reward;
}

test('starts with the coffee pickup and returns independent view snapshots', () => {
  const missions = createMissions();
  const first = missions.view();
  assert.equal(first.id, 'coffee');
  assert.equal(first.status, 'active');
  assert.equal(first.step, 0);
  assert.equal(first.total, 2);
  assert.equal(first.started, false);
  assert.equal(first.remainingSeconds, null);
  assert.deepEqual(first.target, { x: -32, z: 7 });
  first.target.x = 999;
  first.completedIds.push('coffee');
  assert.deepEqual(missions.view().target, { x: -32, z: 7 });
  assert.deepEqual(missions.view().completedIds, []);
});

test('coffee requires a nearby E action at both stops, and rewards exactly once', () => {
  const missions = createMissions();
  assert.equal(missions.interact(player(54, -35)), null, 'cannot deliver before pickup');
  assert.equal(missions.interact(player(-32, 13.6)), null, 'outside pickup radius');
  assert.equal(missions.update(60, atTarget(missions)), null, 'waiting does not collect coffee');
  assert.ok(missions.interact(player(-32, 13.5)), 'edge of pickup radius is reachable');
  assert.equal(missions.view().step, 1);
  assert.equal(missions.interact(player(-32, 7)), null, 'pickup cannot skip delivery');
  assert.equal(missions.update(60, atTarget(missions)), null, 'waiting does not deliver coffee');
  assert.deepEqual(missions.interact(atTarget(missions)).reward, { cash: 100, score: 50, delivery: true });
  assert.equal(missions.view().step, 2);
  assert.equal(missions.view().status, 'completed');
  assert.equal(missions.view().target, null);
  assert.deepEqual(missions.view().completedIds, ['coffee']);
  assert.equal(missions.interact(player(54, -35)), null);
  assert.equal(missions.update(10, player(54, -35)), null);
});

test('every mission is completable in order with its published reward', () => {
  const missions = createMissions();
  assert.equal(MISSION_DEFS.length, 6);
  for (const definition of MISSION_DEFS) {
    assert.deepEqual(completeMission(missions, definition.id), {
      cash: definition.rewardCash,
      score: definition.rewardScore,
      delivery: definition.delivery,
    });
    assert.equal(missions.view().status, 'completed');
    assert.equal(missions.view().step, definition.steps.length);
    assert.equal(missions.update(0, player(0, 0)), null);
  }
  assert.deepEqual(missions.view().completedIds, MISSION_DEFS.map((mission) => mission.id));
});

test('switching abandons progress, replay allows a new reward, reset clears history', () => {
  const missions = createMissions();
  completeMission(missions, 'coffee');
  missions.select('post');
  missions.interact(atTarget(missions));
  assert.equal(missions.view().step, 1);
  missions.select('market');
  missions.select('post');
  assert.equal(missions.view().step, 0);
  assert.equal(missions.view().started, false);
  assert.deepEqual(missions.view().completedIds, ['coffee']);
  assert.ok(completeMission(missions, 'coffee'));
  assert.deepEqual(missions.view().completedIds, ['coffee'], 'history contains distinct completed missions');
  missions.reset();
  assert.equal(missions.view().id, 'coffee');
  assert.equal(missions.view().step, 0);
  assert.deepEqual(missions.view().completedIds, []);
});

test('post deliveries cannot be done out of order or without an action', () => {
  const missions = createMissions();
  missions.select('post');
  assert.equal(missions.interact(player(0, 54)), null);
  missions.interact(atTarget(missions));
  assert.equal(missions.interact(player(0, 54)), null);
  assert.equal(missions.update(1, atTarget(missions)), null);
  assert.equal(missions.view().step, 1);
  missions.interact(atTarget(missions));
  assert.equal(missions.view().step, 2);
  assert.ok(missions.interact(atTarget(missions)).reward);
});

test('tour checkpoints allow walking or riding, progress once per update, and reject downed players', () => {
  const missions = createMissions();
  missions.select('tour');
  assert.equal(missions.interact(atTarget(missions)), null);
  assert.equal(missions.update(0, atTarget(missions, { down: true })), null);
  assert.equal(missions.update(0, player(28, 49.6)), null, 'last checkpoint cannot skip first');
  assert.ok(missions.update(0, atTarget(missions)));
  assert.equal(missions.view().step, 1);
  assert.equal(missions.update(0, player(-54, 0)), null);
  assert.ok(missions.update(0, atTarget(missions, { riding: true })));
  assert.equal(missions.view().step, 2);
});

test('cleanup requires walking and an explicit action at every stop', () => {
  const missions = createMissions();
  missions.select('cleanup');
  for (let index = 0; index < 4; index += 1) {
    assert.equal(missions.view().requiresOnFoot, true);
    assert.equal(missions.update(1, atTarget(missions)), null);
    const denied = missions.interact(atTarget(missions, { riding: true }));
    assert.match(denied.message, /xuống xe/);
    assert.equal(denied.reward, undefined);
    assert.equal(missions.view().step, index);
    const downed = missions.interact(atTarget(missions, { down: true }));
    assert.match(downed.message, /đứng dậy/);
    assert.equal(missions.view().step, index);
    const completed = missions.interact(atTarget(missions));
    assert.equal(Boolean(completed.reward), index === 3);
  }
});

test('circuit only starts on the bike with E; pre-start time and falls do not consume the run', () => {
  const missions = createMissions();
  missions.select('circuit');
  assert.equal(missions.view().remainingSeconds, 100);
  assert.equal(missions.update(1000, atTarget(missions, { riding: true })), null);
  assert.equal(missions.update(10, atTarget(missions, { down: true })), null);
  assert.equal(missions.view().status, 'active');
  assert.equal(missions.view().remainingSeconds, 100);
  assert.match(missions.interact(atTarget(missions)).message, /lên xe máy/);
  assert.equal(missions.view().started, false);
  assert.ok(missions.interact(atTarget(missions, { riding: true })));
  assert.equal(missions.view().started, true);
  assert.equal(missions.view().step, 1);
  assert.equal(missions.view().remainingSeconds, 100);
  assert.equal(missions.update(2.25, atTarget(missions)), null, 'on-foot checkpoints do not count');
  assert.equal(missions.view().remainingSeconds, 98);
  assert.equal(missions.view().step, 1);
  assert.ok(missions.update(0, atTarget(missions, { riding: true })));
  assert.equal(missions.view().step, 2);
});

test('circuit timeout fails without reward, freezes progress, and selecting it resets the clock', () => {
  const missions = createMissions();
  missions.select('circuit');
  missions.interact(atTarget(missions, { riding: true }));
  const target = atTarget(missions, { riding: true });
  const timedOut = missions.update(100, target);
  assert.match(timedOut.message, /Hết giờ/);
  assert.equal(timedOut.reward, undefined);
  assert.equal(missions.view().status, 'failed');
  assert.equal(missions.view().remainingSeconds, 0);
  assert.equal(missions.view().target, null);
  assert.equal(missions.view().step, 1, 'timeout wins over checkpoint progress');
  assert.deepEqual(missions.view().completedIds, []);
  assert.equal(missions.update(0, target), null);
  assert.equal(missions.interact(target), null);
  missions.select('circuit');
  assert.equal(missions.view().remainingSeconds, 100);
  assert.equal(missions.view().started, false);
  assert.equal(missions.view().status, 'active');
});

test('falling during a circuit fails once from either update or interaction, anywhere on the map', () => {
  for (const entryPoint of ['update', 'interact']) {
    const missions = createMissions();
    missions.select('circuit');
    missions.interact(atTarget(missions, { riding: true }));
    const downed = player(1, 1, { riding: true, down: true });
    const event = entryPoint === 'update' ? missions.update(0, downed) : missions.interact(downed);
    assert.match(event.message, /ngã xe/);
    assert.equal(event.reward, undefined);
    assert.equal(missions.view().status, 'failed');
    assert.equal(missions.update(0, downed), null);
    assert.equal(missions.interact(downed), null);
  }
});

test('circuit ignores invalid negative or nonfinite time deltas', () => {
  const missions = createMissions();
  missions.select('circuit');
  missions.interact(atTarget(missions, { riding: true }));
  for (const delta of [-5, NaN, Infinity, -Infinity]) missions.update(delta, player(0, 0));
  assert.equal(missions.view().remainingSeconds, 100);
  assert.equal(missions.view().status, 'active');
});

test('invalid mission selection does not destroy current progress', () => {
  const missions = createMissions();
  missions.interact(atTarget(missions));
  assert.throws(() => missions.select('unknown'), RangeError);
  assert.equal(missions.view().id, 'coffee');
  assert.equal(missions.view().step, 1);
});
