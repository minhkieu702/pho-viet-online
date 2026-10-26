// node --experimental-transform-types --test scripts/story-contract.test.mjs
// The engine contract after the P1 integration: every engine id the chapters written so far (1–5) hand the engine by
// name — mission scripts (ops, queries, signals, models, templates, arenas, meters, abilities, props, carry, poses,
// acts, …) and cutscenes (clips, pair clips, poses, props, rides, fx, sfx, grades, meshes, ambience) — is listed in
// story/contract.ts with the lane that builds it: in ENGINE_CONTRACT, or for the cutscene clips, pair clips, fx and sfx
// of chapters 4–5 in SCENE_REQUESTS (they join ENGINE_CONTRACT when those chapters register; see contract.ts). Nothing
// is listed twice, SCENE_REQUESTS holds no stale id, and the chapters' own request lists agree with the contract's lanes.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

// some map modules import './x' without an extension (Vite style): retry as .ts (as scripts/story-sites.test.mjs)
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

const R = await import('../app/game/story/runner.ts');
const C = await import('../app/game/story/content/index.ts');
const SCENE_SCHEMA = await import('../app/game/story/scene.ts');
const { ENGINE_CONTRACT, SCENE_REQUESTS, LANE_WAVE, CHAPTER_WAVE } = await import('../app/game/story/contract.ts');
const N = [1, 2, 3, 4, 5];
const content = await Promise.all(N.map((n) => import(`../app/game/story/content/ch0${n}.ts`)));
const scenes = (await Promise.all(N.map((n) => import(`../app/game/story/cutscenes/ch0${n}.ts`)))).flatMap((m) => m.CUTSCENES);
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const LANES = new Set(Object.keys(LANE_WAVE));

test('every engine id chapters 1–5 name in their mission scripts is in ENGINE_CONTRACT', () => {
  const missing = R.lintContent(C.CAMPAIGN, content.map((m) => m.chapter), { engine: ENGINE_CONTRACT }).filter((s) => / is not in the engine contract/.test(s));
  assert.deepEqual(missing, []);
});

test('every cutscene id of chapters 1–5 is in ENGINE_CONTRACT or SCENE_REQUESTS, once, with an owner lane', () => {
  const kinds = (k) => (k === 'rides' ? ['models', 'rideModels'] : k === 'sceneProps' ? ['props', 'sceneProps'] : [k]);
  const used = new Set();
  for (const sc of scenes) for (const [kind, id, where] of SCENE_SCHEMA.sceneVocab(sc)) {
    const ok = kinds(kind).some((k) => has(ENGINE_CONTRACT[k], id) || has(SCENE_REQUESTS[k], id));
    assert.ok(ok, `${sc.id} ${where}: ${kind} '${id}' has no owner in story/contract.ts`);
    for (const k of kinds(kind)) used.add(`${k}:${id}`);
  }
  for (const [kind, ids] of Object.entries(SCENE_REQUESTS)) for (const [id, [lane, what]] of Object.entries(ids)) {
    assert.ok(!has(ENGINE_CONTRACT[kind], id), `${kind} '${id}' is in both tables`);
    assert.ok(used.has(`${kind}:${id}`), `SCENE_REQUESTS ${kind} '${id}' is used by no cutscene (stale)`);
    assert.ok(LANES.has(lane) && what.length > 10, `${kind} '${id}' names its lane and what it does`);
  }
  for (const [kind, ids] of Object.entries(ENGINE_CONTRACT)) for (const [id, entry] of Object.entries(ids)) assert.ok(LANES.has(entry[0]) && entry[1].length > 3, `${kind} '${id}': owner lane`);
});

test('the chapters\' own request lists agree with the contract (same lane), and chapters 3–5 play in wave 2', () => {
  const ch4 = content[3], ch5 = content[4];
  for (const [label, table] of [['ch04 CONTRACT_REQUESTS', ch4.CONTRACT_REQUESTS], ['ch05 ENGINE_NEEDS', ch5.ENGINE_NEEDS]]) {
    for (const [kind, ids] of Object.entries(table)) for (const [id, [lane]] of Object.entries(ids)) {
      const landed = ENGINE_CONTRACT[kind]?.[id] ?? SCENE_REQUESTS[kind]?.[id];
      assert.ok(landed, `${label}: ${kind} '${id}' is in story/contract.ts`);
      assert.equal(landed[0], lane, `${label}: ${kind} '${id}' lane`);
    }
  }
  assert.deepEqual([3, 4, 5].map((n) => CHAPTER_WAVE[n]), [2, 2, 2]);
});
