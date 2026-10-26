// node --experimental-transform-types --test scripts/story-runner.test.mjs
// Story runner (pure): a mock engine port runs sample missions end to end (success, soft fail, fail → checkpoint,
// skip section, branch, timers, harm bookkeeping), saves round-trip and migrate from v0, the deduction board
// and the interrogation table follow their rules, the content lint catches broken scripts, and identical
// inputs give identical runs.
import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../app/game/story/runner.ts');
const F = await import('../app/game/story/flags.ts');
const D = await import('../app/game/story/deduction.ts');
const I = await import('../app/game/story/interrogation.ts');
const S = await import('../app/game/story/save.ts');
const H = await import('../app/game/story/host.ts');
const C = await import('../app/game/story/content/index.ts');
const { buildCatalog, createRunner, lintContent, makeText, DOWN_REASONS, LETHAL_REASON } = R;

// ---- Sample content ----------------------------------------------------------------------------------

const INDEX = {
  id: 'test', title: 'Thử nghiệm',
  chapters: [
    { n: 1, id: 'ch01', title: 'Một', lunar: { month: 8, day: 1 }, card: { text: 'CHƯƠNG 1', sub: 'MỘT' }, missions: [
      { id: 't1-m1', title: 'Kho lạnh', minutes: 5 }, { id: 't1-m2', title: 'Hỏi chuyện', minutes: 4 }] },
    { n: 2, id: 'ch02', title: 'Hai', lunar: { month: 8, day: 10 }, missions: [{ id: 't2-m1', title: 'Sà lan', minutes: 6, hours: [22, 3] }] },
  ],
};
const M1 = {
  id: 't1-m1',
  start: { at: 'ben-xe', hour: 23, weather: 'rain', lunar: 1 },
  world: { traffic: 'night', police: 'story', clock: { freeze: true } },
  setup: [{ k: 'spawn', id: 'ally', cast: 'van', at: 'ben-xe', scope: 'mission' }],
  steps: [
    {
      id: 'arrive', objective: '@arrive', marker: { at: 'kho-gate', label: '@gate', style: 'go' },
      enter: [{ k: 'cutscene', id: 'cs-open' }, { k: 'dialogue', id: 'd-intro', lines: [
        { who: 'tin', text: 'Không phải chuyện của mình…' },
        { who: 'tin', text: 'Mà thôi, tới coi sao.', if: { k: 'flag', name: 'brave' } }] }],
      done: { k: 'reach', at: 'kho-gate', r: 3 },
    },
    {
      id: 'stake', objective: 'Núp trong bóng tối', hud: { light: true },
      checkpoint: { label: 'Đã lưu: cổng kho', setup: [{ k: 'spawn', id: 'g1', template: 'guard', at: 'kho-gate', team: 'hostile', behaviour: { k: 'guard', post: 'kho-gate', sweep: 40 } }] },
      subs: [
        { id: 'crouch', text: 'Rón rén (X)', done: { k: 'stance', is: 'crouch' } },
        { id: 'wait', text: 'Nấp yên ba giây', done: { k: 'hold', c: { k: 'stance', is: 'hidden' }, seconds: 3 } }],
      fail: [{ when: { k: 'actor', id: 'g1', sees: true }, reason: 'Gã bảo vệ đã thấy bạn.', soft: true }],
      retry: [{ k: 'teleport', at: 'hide' }],
      enter: [{ k: 'flag', name: 'reachedKho' }],
    },
    {
      id: 'tail', objective: 'Bám theo xe tải lạnh',
      checkpoint: { setup: [{ k: 'vehicle', id: 'van', model: 'reefer-van', at: 'kho-gate' }, { k: 'tail', target: 'van', band: [20, 60], lose: { far: 90, seconds: 10 } }] },
      timer: { seconds: 30, label: 'Còn lại', fail: 'Hết giờ.' },
      meters: [{ id: 'tail:van', label: 'Nghi ngờ', kind: 'band' }],
      enter: [{ k: 'var', name: 'tries', inc: 1 }, { k: 'flag', name: 'midTail' }],
      done: { k: 'on', ev: 'arrived', id: 'van' },
      fail: [{ when: { k: 'on', ev: 'spotted', id: 'van' }, reason: 'Tài xế đã phát hiện bạn bám theo.', allowSkipAfter: 2 }],
    },
    {
      id: 'choice', next: 'photo',
      enter: [{ k: 'choice', id: 'phone', prompt: 'Đưa điện thoại cho ông Lực?', options: [
        { id: 'give', text: 'Đưa luôn điện thoại', set: { gavePhone: true } },
        { id: 'show', text: 'Chỉ cho xem ảnh', then: [{ k: 'flag', name: 'showedPhoto' }] }] }],
      branch: [{ when: { k: 'flag', name: 'gavePhone' }, goto: 'wiped' }],
    },
    {
      id: 'wiped', next: 'photo',
      enter: [{ k: 'flag', name: 'phoneWiped' }, { k: 'oneOf', acts: [[{ k: 'var', name: 'pick', value: 'a' }], [{ k: 'var', name: 'pick', value: 'b' }], [{ k: 'var', name: 'pick', value: 'c' }]] }],
    },
    {
      id: 'photo', objective: 'Chụp biển số xe',
      enter: [{ k: 'photoTarget', id: 'plate', subject: 'van', evidence: 'ev-plate' }],
      interact: [{ id: 'bear', at: { x: 1, z: 1 }, prompt: 'Nhặt tai gấu bông' }],
      optional: [{ id: 'bear-ear', text: 'Tìm tai gấu bông', when: { k: 'on', ev: 'interact', id: 'bear' }, reward: [{ k: 'evidence', id: 'ev-bear' }] }],
      watchers: [{ when: { k: 'on', ev: 'knockout' }, do: [{ k: 'bark', actor: 'ally', text: 'Còn thở. Đi tiếp!' }] }],
      done: { k: 'evidence', id: 'ev-plate' },
    },
    { id: 'dawn', enter: [{ k: 'title', kind: 'time', text: 'BÌNH MINH' }] },
  ],
  rewards: [{ k: 'cash', n: 150 }, { k: 'flag', name: 'sawKho' }, { k: 'unlock', ability: 'observe', label: 'Mở khóa: Quan sát' }],
  medals: { par: 400, ghost: true, clues: ['bear-ear'] },
};
const M2 = {
  id: 't1-m2', meta: { hours: [20, 4], giver: 'van' },
  steps: [
    { id: 'board', objective: 'Nối các manh mối', enter: [{ k: 'board', id: 'b1' }], done: { k: 'solved', board: 'b1' } },
    { id: 'ask', objective: 'Hỏi chuyện chị Diễm', enter: [{ k: 'interrogate', id: 'diem-talk' }], done: { k: 'on', ev: 'interrogation', id: 'diem-talk' } },
  ],
};
const EVIDENCE = [
  ['ev-plate', 'Biển số 51D-207.19', 'photo'], ['ev-pass', 'Thẻ ra vào Sen Vàng', 'object'], ['ev-note', 'Tờ hóa đơn viết chì kẻ mắt', 'document'],
  ['ev-bear', 'Tai gấu bông', 'object'], ['ev-ledger', 'Trang sổ có chữ chị Diễm', 'document'], ['ev-bag', 'Cặp vải của Mai', 'object'],
  ['ev-file', 'Hồ sơ mất tích năm 2014', 'document'],
].map(([id, title, kind]) => ({ id, title, kind, text: `${title}, tìm thấy trong lúc điều tra.` }));
const BOARD = {
  id: 'b1', title: 'Bảng manh mối',
  cards: [{ id: 'ev-plate' }, { id: 'ev-pass' }, { id: 'ev-note' }, { id: 'q-who', needs: null, label: 'Ai báo tin?' }],
  links: [['ev-plate', 'ev-pass'], ['ev-pass', 'ev-note'], ['ev-note', 'q-who']],
  hypotheses: [{ id: 'sv', text: 'Xe của Sen Vàng chở người', needs: ['ev-plate', 'ev-pass'], against: ['ev-bag'] }],
  question: 'q1', reveals: [{ k: 'flag', name: 'boardDone' }],
};
const Q1 = {
  id: 'q1', prompt: 'Ai báo cho tụi nó?', answer: 'don', hint: 'Ai biết chuyện trước khi kho bị dọn?',
  options: [{ id: 'quang', text: 'Quang' }, { id: 'don', text: 'Người ở đồn công an', needs: ['ev-note'] }, { id: 'che', text: 'Bà bán chè' }],
};
const TALK = {
  id: 'diem-talk', subject: 'diem', title: 'Chị Diễm',
  statements: [
    { id: 's1', kind: 'lie', text: 'Chị chỉ làm văn phòng, giới thiệu việc thôi.', cards: ['ev-ledger'], reply: 'Thì… chị có ghi sổ. Nhưng chị đâu biết hết.',
      press: { text: 'Hỏi gì nữa? Chị làm giấy tờ thôi mà.', hint: 'ev-ledger', unlocks: 's1b' } },
    { id: 's1b', kind: 'lie', hidden: true, text: 'Sổ đó là của người khác.', cards: ['ev-ledger'], reply: 'Ừ… chữ của chị.', bluff: 0.3 },
    { id: 's2', kind: 'lie', text: 'Con Mai tự nguyện đi mà.', cards: ['ev-bag'], reply: 'Nó… nó khóc suốt.', bluff: 0.6 },
    { id: 's3', kind: 'true', text: 'Em không hiểu đâu, chị không có lựa chọn.', cards: ['ev-file'], reply: 'Chị cũng từng là con Mai đó.', wrong: 'Em thì biết gì!', set: { diemTrusts: true } },
  ],
  done: [{ k: 'flag', name: 'diemTalked' }],
};
const MOD1 = {
  chapter: 1, missions: [M1, M2], evidence: EVIDENCE, boards: [BOARD], questions: [Q1], interrogations: [TALK],
  cast: [{ id: 'tin', name: 'Tín' }, { id: 'van', name: 'Chị Vân' }, { id: 'diem', name: 'Diễm' }],
  text: { arrive: 'Tới cổng kho lạnh', gate: 'Cổng KHO 7', hello: 'Chào {name}, ví còn {cash:dong}.', brand: 'Ship Ơi' },
};
const MOD2 = { chapter: 2, missions: [{ id: 't2-m1', steps: [{ id: 'go', objective: 'Bơi ra sà lan', enter: [{ k: 'hint', text: 'Mở app {@brand} để nhận đơn' }], done: { k: 'after', seconds: 1 } }] }] };

// ---- Mock engine -------------------------------------------------------------------------------------

const PLACES = { 'ben-xe': { x: -76, z: -118 }, 'kho-gate': { x: 582, z: -79.2 }, hide: { x: 575, z: -90 } };
const cmp = (a, op, b) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b);
function mockWorld(o = {}) {
  const w = {
    runner: null, auto: o.auto ?? true, choose: o.choose ?? {}, held: [],
    player: { x: 0, z: 0, mode: 'foot', crouched: false, hidden: false },
    actors: new Map(), meters: new Map(), log: [], outs: [], resets: [],
  };
  const place = (at) => (typeof at === 'string' ? PLACES[at] : at);
  const near = (x, z, at, r) => { const p = place(at); return !!p && Math.hypot(p.x - x, p.z - z) <= r; };
  w.port = {
    test(c) {
      switch (c.k) {
        case 'reach': return (!c.mode || c.mode === 'any' || c.mode === w.player.mode) && near(w.player.x, w.player.z, c.at, c.r ?? 3);
        case 'stance': return c.is === 'crouch' ? w.player.crouched : c.is === 'hidden' ? w.player.hidden : !w.player.crouched;
        case 'actor': { const a = w.actors.get(c.id); return !!a && (c.sees === undefined || !!a.sees === c.sees) && (!c.state || a.state === c.state); }
        case 'meter': { const v = w.meters.get(c.id); return v !== undefined && cmp(v, c.op, c.value); }
        default: return false;
      }
    },
    exec(a, h, ctx) {
      w.log.push({ k: a.k, id: a.id ?? a.target, h, step: ctx.step, restoring: ctx.restoring, seen: ctx.seen, text: a.text, lines: a.lines?.map((l) => `${l.name}: ${l.text}`), options: a.options?.map((x) => x.id), style: a.style });
      if (a.k === 'spawn') w.actors.set(a.id, { state: 'idle', sees: false });
      if (a.k === 'teleport') { const p = place(a.at); if (p) Object.assign(w.player, { x: p.x, z: p.z }); }
      const blocking = ['cutscene', 'dialogue', 'call', 'title', 'fade', 'teleport', 'choice', 'space'].includes(a.k) && a.mode !== 'ambient';
      if (!blocking) return false;
      if (w.auto) { w.runner.resolve(h, a.k === 'choice' ? w.choose[a.id] : undefined); return true; }
      w.held.push({ h, a });
      return true;
    },
    cancel(h) { w.log.push({ k: 'cancel', h }); },
    reset(scope) { w.resets.push(scope); if (scope === 'checkpoint' || scope === 'mission' || scope === 'end') w.actors.clear(); },
    emit(e) { w.outs.push(e); },
  };
  return w;
}
function setup(o = {}) {
  const catalog = buildCatalog(o.index ?? INDEX, o.modules ?? [MOD1, MOD2]);
  const w = mockWorld(o);
  const runner = createRunner({ catalog, port: w.port, progress: o.progress, seed: o.seed ?? 7 });
  w.runner = runner;
  return { runner, w, catalog };
}
const tick = (r, seconds, dt = 0.1) => { for (let i = 0, n = Math.round(seconds / dt); i < n; i++) r.tick(dt); };
const outs = (w, type) => w.outs.filter((e) => e.type === type);
const step = (r) => r.view().step;
/** Drives t1-m1 from the start to the tail step (checkpoint 'tail'). */
function toTail(r, w) {
  r.start('t1-m1');
  tick(r, 0.3);
  Object.assign(w.player, PLACES['kho-gate']);
  tick(r, 0.3);
  w.player.crouched = true; w.player.hidden = true;
  tick(r, 3.4);
  assert.equal(step(r), 'tail');
}
function finishFromTail(r) {
  r.event({ type: 'arrived', id: 'van' });
  tick(r, 0.5);
  r.event({ type: 'interact', id: 'bear' });
  tick(r, 0.2);
  r.event({ type: 'photo', id: 'plate', evidence: 'ev-plate', quality: 0.8 });
  tick(r, 0.5);
}

// ---- Runner ------------------------------------------------------------------------------------------

test('a mission runs end to end: start block, cutscene, filtered dialogue, checkpoints, subs, tail, choice, optional, rewards', () => {
  const { runner: r, w } = setup({ choose: { phone: 'show' } });
  assert.equal(r.start('t1-m1'), true);
  tick(r, 0.3);
  const v = r.view();
  assert.equal(v.step, 'arrive'); assert.equal(v.phase, 'run'); assert.equal(v.objective, 'Tới cổng kho lạnh');
  assert.deepEqual(v.markers.map((m) => m.label), ['Cổng KHO 7']);
  assert.deepEqual(v.lunar, { date: 'MÙNG 1 THÁNG TÁM', countdown: 'CÒN 14 NGÀY TỚI RẰM' });
  assert.deepEqual(w.log.slice(0, 6).map((l) => l.k), ['world', 'time', 'weather', 'teleport', 'spawn', 'cutscene']);
  assert.equal(w.log.find((l) => l.k === 'cutscene').seen, false);
  assert.deepEqual(w.log.find((l) => l.k === 'dialogue').lines, ['Tín: Không phải chuyện của mình…'], 'the brave line needs its flag');
  assert.deepEqual(w.player, { ...w.player, ...PLACES['ben-xe'] });
  assert.equal(outs(w, 'save').length, 1, 'mission start autosaves');
  assert.ok(outs(w, 'chapter').some((e) => e.n === 1 && e.card.sub === 'MỘT'));

  Object.assign(w.player, PLACES['kho-gate']);
  tick(r, 0.3);
  assert.equal(step(r), 'stake');
  assert.deepEqual(outs(w, 'checkpoint').map((e) => e.label), ['Đã lưu: cổng kho']);
  assert.deepEqual(r.view().subs.map((s) => s.done), [false, false]);
  w.player.crouched = true;
  tick(r, 0.2);
  assert.deepEqual(r.view().subs.map((s) => s.done), [true, false]);
  w.player.hidden = true;
  tick(r, 2.5);
  assert.equal(step(r), 'stake', 'three seconds hidden are not up yet');
  tick(r, 0.8);
  assert.equal(step(r), 'tail');
  const tv = r.view();
  assert.equal(tv.timers[0].label, 'Còn lại'); assert.ok(tv.timers[0].left > 29);
  assert.deepEqual(tv.meters.map((m) => [m.id, m.kind]), [['tail:van', 'band']]);
  assert.deepEqual(w.log.filter((l) => l.k === 'vehicle' || l.k === 'tail').map((l) => l.k), ['vehicle', 'tail']);

  finishFromTail(r);
  const p = r.progress(), done = outs(w, 'complete')[0];
  assert.equal(r.view().phase, 'done');
  assert.equal(p.flags['choice:phone'], 'show'); assert.equal(p.flags.showedPhoto, true); assert.equal(p.flags.gavePhone, undefined);
  assert.deepEqual(p.evidence, ['ev-bear', 'ev-plate']);
  assert.deepEqual(outs(w, 'evidence').map((e) => e.title), ['Tai gấu bông', 'Biển số 51D-207.19']);
  assert.deepEqual(outs(w, 'optional').map((e) => e.text), ['Tìm tai gấu bông']);
  assert.ok(p.completed.includes('t1-m1')); assert.equal(p.cash, 150); assert.equal(p.flags.sawKho, true); assert.deepEqual(p.abilities, ['observe']);
  assert.deepEqual(outs(w, 'unlock').map((e) => e.label), ['Mở khóa: Quan sát']);
  assert.equal(done.result.grade, 'A'); assert.equal(done.result.ghost, true); assert.equal(done.result.eye, true); assert.equal(done.result.nonLethal, true);
  assert.equal(p.medals['t1-m1'].grade, 'A'); assert.equal(p.hintTokens, 3, 'grade A gives a hint token');
  assert.equal(w.resets.at(-1), 'end');
  assert.equal(w.log.filter((l) => l.k === 'choice')[0].options.join(), 'give,show');
  assert.deepEqual(w.log.filter((l) => l.k === 'title').map((l) => [l.text, l.step]), [['BÌNH MINH', 'dawn']], 'the last step runs before completion');
  assert.deepEqual(w.outs.slice(-2).map((e) => e.type), ['complete', 'save']);
  assert.deepEqual([done.chain, done.chapterUnlocked], [null, null]);
  assert.deepEqual(r.state().issues, []);
});

test('a soft fail replays the beat without a card: dip, retry acts, enter again', () => {
  const { runner: r, w } = setup();
  r.start('t1-m1');
  tick(r, 0.3);
  Object.assign(w.player, PLACES['kho-gate']);
  tick(r, 0.3);
  assert.equal(step(r), 'stake');
  w.actors.get('g1').sees = true;
  tick(r, 0.1);
  assert.deepEqual(outs(w, 'fail'), [{ type: 'fail', reason: 'Gã bảo vệ đã thấy bạn.', soft: true, canSkip: false }]);
  w.actors.get('g1').sees = false;
  tick(r, 0.2);
  const after = w.log.slice(w.log.findLastIndex((l) => l.k === 'fade'));
  assert.deepEqual(after.slice(0, 2).map((l) => [l.k, l.id ?? '']), [['fade', ''], ['teleport', '']]);
  assert.equal(after[1].restoring, true);
  assert.deepEqual(w.player, { ...w.player, ...PLACES.hide });
  assert.equal(step(r), 'stake'); assert.equal(r.view().phase, 'run');
  assert.equal(r.state().stats.retries, 1);
  assert.equal(outs(w, 'checkpoint').length, 1, 'a replayed beat does not flash the checkpoint again');
});

test('a hard fail restores the checkpoint (state rolled back, setup re-run), then skipSection after allowSkipAfter', () => {
  const { runner: r, w } = setup({ choose: { phone: 'show' } });
  toTail(r, w);
  assert.equal(r.state().vars.tries, 1);
  assert.equal(r.progress().flags.midTail, true);
  r.event({ type: 'spotted', id: 'van' });
  tick(r, 0.1);
  assert.equal(r.view().phase, 'failed');
  assert.deepEqual(r.view().failure, { reason: 'Tài xế đã phát hiện bạn bám theo.', canSkip: false });
  assert.equal(r.skipSection(), false, 'not offered after one fail');
  const spawned = w.log.filter((l) => l.k === 'vehicle').length;
  assert.equal(r.retry(), true);
  assert.equal(w.resets.at(-1), 'checkpoint');
  assert.equal(r.progress().flags.midTail, undefined, 'progress rolled back to the checkpoint');
  assert.equal(r.progress().flags.reachedKho, true);
  tick(r, 0.2);
  assert.equal(step(r), 'tail'); assert.equal(r.view().phase, 'run');
  assert.equal(r.state().vars.tries, 1, 'vars rolled back then the enter acts ran again');
  assert.equal(w.log.filter((l) => l.k === 'vehicle').length, spawned + 1, 'checkpoint setup re-ran');
  assert.ok(w.log.filter((l) => l.k === 'world').at(-1).restoring, 'world policy re-sent while restoring');
  assert.equal(w.actors.has('ally'), true, 'mission setup re-ran after the reset');
  assert.ok(r.view().timers[0].left > 29.7, 'the step timer restarted');
  r.event({ type: 'spotted', id: 'van' });
  tick(r, 0.1);
  assert.equal(r.view().failure.canSkip, true);
  assert.equal(r.skipSection(), true);
  tick(r, 0.1);
  assert.equal(r.progress().flags['choice:phone'], 'show');
  tick(r, 0.3);
  assert.equal(step(r), 'photo');
  r.event({ type: 'photo', id: 'plate', evidence: 'ev-plate' });
  tick(r, 0.5);
  const done = outs(w, 'complete')[0];
  assert.equal(done.stats.skipped, 1); assert.equal(done.stats.retries, 1);
  assert.equal(done.result.grade, 'C', 'a skipped section caps the grade at C');
  assert.equal(done.result.ghost, false);
});

test('step timers fail when they run out and pause during cinematics', () => {
  const { runner: r, w } = setup();
  toTail(r, w);
  tick(r, 29.5);
  assert.equal(r.view().phase, 'run');
  tick(r, 0.6);
  assert.equal(r.view().phase, 'failed');
  assert.equal(r.view().failure.reason, 'Hết giờ.');
  // a cutscene that is not resolved keeps the clock still
  const s = setup({ auto: false });
  s.runner.start('t1-m1');
  s.runner.tick(0.1);
  assert.equal(s.w.held.at(-1).a.k, 'teleport');
  s.runner.resolve(s.w.held.pop().h);
  s.runner.tick(0.1);
  assert.equal(s.w.held.at(-1).a.k, 'cutscene');
  assert.equal(s.runner.view().cinematic, true);
  tick(s.runner, 5);
  assert.equal(s.runner.view().phase, 'enter');
  s.runner.resolve(s.w.held.pop().h);
  s.runner.tick(0.1);
  s.runner.resolve(s.w.held.pop().h);
  s.runner.tick(0.1);
  assert.equal(s.runner.view().phase, 'run');
});

test('a cutscene a watcher starts holds the step: timers, the step clock and fail rules wait, perception events are dropped', () => {
  const index = { id: 'cine', title: 'Thử', chapters: [{ n: 1, id: 'ch01', title: 'Một', lunar: { month: 8, day: 1 }, missions: [{ id: 'w1', title: 'Bám đuôi', minutes: 3 }] }] };
  const W1 = { id: 'w1', steps: [{
    id: 'tail', timer: { seconds: 20, fail: 'Hết giờ.' },
    enter: [{ k: 'vehicle', id: 'van', model: 'reefer-van', at: { x: 0, z: 0 } }, { k: 'tail', target: 'van', band: [20, 60], lose: { far: 90, seconds: 10 } }],
    watchers: [{ when: { k: 'on', ev: 'signal', id: 'junction' }, do: [{ k: 'cutscene', id: 'cs-red' }] }, { id: 'late', when: { k: 'after', seconds: 15 }, do: [{ k: 'flag', name: 'late' }] }],
    fail: [{ when: { k: 'on', ev: 'lost', id: 'van' }, reason: 'Mất dấu.' }, { when: { k: 'hold', c: { k: 'always' }, seconds: 18 }, reason: 'Quá lâu.' }],
    done: { k: 'on', ev: 'arrived', id: 'van' },
  }] };
  const { runner: r, w } = setup({ index, modules: [{ chapter: 1, missions: [W1], cast: [{ id: 'tin', name: 'Tín' }] }], auto: false });
  r.start('w1');
  tick(r, 1);
  assert.equal(r.view().phase, 'run');
  r.event({ type: 'signal', id: 'junction' });
  tick(r, 0.2);
  const cs = w.held.find((x) => x.a.k === 'cutscene' && x.a.id === 'cs-red');
  assert.ok(cs, 'the watcher played the cutscene');
  assert.equal(r.view().cinematic, true, 'a watcher cutscene is cinematic');
  const left = r.view().timers[0].left, t0 = r.state().t;
  r.event({ type: 'lost', id: 'van' }); r.event({ type: 'spotted', id: 'van' });
  tick(r, 25);
  assert.equal(r.view().phase, 'run', 'no fail rule fires under the cutscene (lost dropped, hold paused)');
  assert.equal(r.view().timers[0].left, left, 'the step timer waits');
  assert.equal(r.state().t, t0, 'the step clock waits');
  assert.equal(r.progress().flags.late, undefined, 'after-watchers wait');
  r.resolve(cs.h);
  tick(r, 0.2);
  assert.equal(r.view().cinematic, false);
  assert.ok(r.view().timers[0].left < left, 'the timer runs again');
  r.event({ type: 'lost', id: 'van' });
  tick(r, 0.2);
  assert.equal(r.view().failure?.reason, 'Mất dấu.', 'a lost tail after the cutscene fails as before');
});

test('branches follow choices; choice results and oneOf picks are remembered', () => {
  const { runner: r, w } = setup({ choose: { phone: 'give' } });
  toTail(r, w);
  r.event({ type: 'arrived', id: 'van' });
  tick(r, 0.2);
  assert.equal(step(r), 'wiped');
  tick(r, 0.2);
  const p = r.progress();
  assert.equal(p.flags.gavePhone, true); assert.equal(p.flags['choice:phone'], 'give'); assert.equal(p.flags.phoneWiped, true);
  assert.equal(p.flags.showedPhoto, undefined);
  assert.ok(['a', 'b', 'c'].includes(r.state().vars.pick));
  assert.equal(step(r), 'photo');
});

test('LƯƠNG TÂM: non-lethal causes never kill, kills and innocents are booked, lethal missions and down fail', () => {
  const { runner: r, w } = setup({ choose: { phone: 'show' } });
  toTail(r, w);
  r.event({ type: 'arrived', id: 'van' });
  tick(r, 0.5);
  assert.equal(step(r), 'photo');
  r.event({ type: 'kill', id: 'g1', tag: 'guard', cause: 'choke' });
  tick(r, 0.2);
  assert.deepEqual([r.state().stats.knockouts, r.state().stats.kills], [1, 0], 'an over-squeezed chokehold is a knockout');
  assert.ok(w.log.some((l) => l.k === 'bark' && l.text === 'Còn thở. Đi tiếp!'), 'the knockout watcher fired');
  r.event({ type: 'kill', id: 'g2', tag: 'guard', cause: 'bullet' });
  r.event({ type: 'hurt', id: 'c1', tag: 'civilian', cause: 'vehicle' });
  r.event({ type: 'restrain', id: 'g1', tag: 'guard' });
  tick(r, 0.1);
  const c = r.progress().conscience;
  assert.deepEqual([c.knockouts, c.kills, c.civiliansHurt, c.restrained, c.byCause.bullet], [1, 1, 1, 1, 1]);
  assert.equal(F.conscienceTier(c), 'stained');
  assert.equal(r.test({ k: 'conscience', is: 'stained' }), true);
  assert.equal(r.test({ k: 'stat', name: 'kills', op: '==', value: 1, scope: 'campaign' }), true);
  r.event({ type: 'down', kind: 'wasted' });
  tick(r, 0.1);
  assert.equal(r.view().failure.reason, DOWN_REASONS.wasted);
  // a mission that forbids killing
  const strict = { ...MOD1, missions: [{ ...M1, lethal: 'fail' }, M2] };
  const s = setup({ modules: [strict, MOD2], choose: { phone: 'show' } });
  toTail(s.runner, s.w);
  s.runner.event({ type: 'knockout', id: 'g1', cause: 'takedown' });
  tick(s.runner, 0.1);
  assert.equal(s.runner.view().phase, 'run');
  s.runner.event({ type: 'kill', id: 'g1', cause: 'fall' });
  tick(s.runner, 0.1);
  assert.equal(s.runner.view().failure.reason, LETHAL_REASON);
});

test('sessions: the board, its question and the interrogation are driven through runner.ui', () => {
  const progress = F.newProgress();
  progress.completed.push('t1-m1');
  progress.evidence.push('ev-plate', 'ev-pass', 'ev-note', 'ev-ledger', 'ev-bag', 'ev-file');
  const { runner: r, w } = setup({ progress });
  r.start('t1-m2');
  tick(r, 0.1);
  assert.deepEqual(outs(w, 'session').map((e) => [e.kind, e.open]), [['board', true]]);
  assert.equal(r.view().cinematic, true);
  assert.equal(r.ui.link('ev-plate', 'ev-pass').result, 'correct');
  assert.equal(r.ui.link('ev-plate', 'q-who').result, 'wrong');
  assert.equal(r.progress().hintTokens, 1);
  assert.equal(r.ui.propose('sv', ['ev-plate', 'ev-pass']).result, 'proven');
  assert.equal(r.ui.link('ev-pass', 'ev-note').result, 'correct');
  assert.equal(r.ui.link('ev-note', 'q-who').solved, true);
  assert.deepEqual(outs(w, 'session').slice(-2).map((e) => [e.kind, e.open]), [['board', false], ['deduce', true]]);
  assert.equal(r.ui.answer('che').result, 'wrong');
  assert.equal(r.progress().hintTokens, 0);
  const hint = r.ui.hint();
  assert.equal(hint.kind, 'no-tokens');
  assert.equal(r.ui.answer('don').result, 'correct');
  tick(r, 0.2);
  assert.equal(r.progress().flags.boardDone, true);
  assert.equal(step(r), 'ask');
  assert.deepEqual(outs(w, 'session').at(-1).kind, 'interrogate');
  assert.equal(r.ui.present('ev-bag', 'accuse').result, 'wrong');
  assert.equal(r.ui.present('ev-ledger', 'accuse').result, 'silent');
  tick(r, 4.1);
  assert.equal(r.ui.press().unlocked, 's1b');
  assert.equal(r.ui.present('ev-ledger', 'accuse').result, 'contradiction');
  assert.equal(r.ui.bluff().result, 'bluffed');
  assert.equal(r.ui.present('ev-bag', 'accuse').result, 'contradiction');
  assert.equal(r.ui.present('ev-file', 'empathy').result, 'understood');
  tick(r, 0.3);
  const p = r.progress();
  assert.equal(p.flags.diemTrusts, true); assert.equal(p.flags.diemTalked, true);
  assert.equal(outs(w, 'complete')[0].chapterUnlocked, 2, 'finishing chapter 1 opens chapter 2');
  assert.deepEqual(p.interrogations['diem-talk'], { wrong: 1, bluffs: 1, empathy: 1, trust: 1 });
  assert.equal(r.view().phase, 'done');
  assert.equal(r.ui.press(), null, 'no session left');
});

test('replays run in a sandbox; only medals and play time come back', () => {
  const { runner: r, w } = setup({ choose: { phone: 'show' } });
  toTail(r, w); finishFromTail(r);
  const main = r.progress();
  assert.equal(main.cash, 150);
  assert.ok(main.chapterStarts[1], 'chapter start remembered');
  assert.equal(r.start('t1-m1', { replay: true }), true);
  assert.equal(r.progress().cash, 0, 'sandbox starts from the chapter start');
  w.outs.length = 0;
  tick(r, 0.3); Object.assign(w.player, { x: 0, z: 0 }); tick(r, 0.1);
  toTailFromArrive(r, w);
  finishFromTail(r);
  assert.equal(outs(w, 'complete')[0].replay, true);
  assert.equal(outs(w, 'save').length, 0, 'replays never autosave');
  assert.equal(r.progress().cash, 150, 'no second reward');
  assert.equal(r.progress().medals['t1-m1'].plays, 2);
  assert.deepEqual(r.snapshot().checkpoint, null);
});
function toTailFromArrive(r, w) {
  Object.assign(w.player, PLACES['kho-gate']);
  tick(r, 0.3);
  w.player.crouched = true; w.player.hidden = true;
  tick(r, 3.4);
  assert.equal(step(r), 'tail');
}

test('stop() abandons a mission: engine cleanup and its gains rolled back to the mission start', () => {
  const { runner: r, w } = setup();
  toTail(r, w);
  assert.equal(r.progress().flags.reachedKho, true);
  const save = r.snapshot();
  r.stop();
  assert.equal(w.resets.at(-1), 'end');
  assert.equal(r.view().phase, 'idle');
  assert.equal(r.progress().flags.reachedKho, undefined);
  assert.ok(r.progress().chapterStarts[1], 'the chapter start stays recorded');
  assert.equal(save.checkpoint.step, 'tail', 'the snapshot taken before stop still holds the checkpoint');
  assert.equal(r.retry(), false); assert.equal(r.skipSection(), false);
});

test('availability, chapter unlocks and hours', () => {
  const p = F.newProgress();
  const a = (id, hour) => F.availability(INDEX, p, hour).find((x) => x.id === id);
  assert.equal(a('t1-m1').state, 'open'); assert.equal(a('t1-m2').state, 'locked'); assert.equal(a('t2-m1').state, 'locked');
  p.completed.push('t1-m1');
  assert.equal(a('t1-m2').state, 'open');
  assert.equal(F.chapterUnlocked(INDEX, p, 2), false);
  p.completed.push('t1-m2');
  assert.equal(F.chapterUnlocked(INDEX, p, 2), true);
  assert.deepEqual([a('t2-m1', 12).state, a('t2-m1', 12).opensAt], ['later', 22]);
  assert.equal(a('t2-m1', 23).state, 'open'); assert.equal(a('t2-m1', 2).state, 'open');
  assert.equal(Math.round(F.percentDone(INDEX, p) * 100), 67);
  const cat = buildCatalog(INDEX, [MOD1, MOD2]);
  const q = F.newProgress(); q.completed.push('t1-m1');
  const m2 = (hour) => F.availability(cat.index, q, hour).find((x) => x.id === 't1-m2');
  assert.deepEqual([m2(12).state, m2(12).opensAt, m2(12).giver, m2(2).state], ['later', 20, 'van', 'open'], 'chapter files patch hours and givers');
  assert.equal(INDEX.chapters[0].missions[1].hours, undefined, 'the source index is not mutated');
});

test('text: keys, placeholders, money and the lunar strip', () => {
  const cat = buildCatalog(INDEX, [MOD1]);
  const tx = makeText(cat, (n) => ({ name: 'Tín', cash: 1350 })[n]);
  assert.equal(tx('@hello'), 'Chào Tín, ví còn 1.350.000đ.');
  assert.equal(tx('Mở app {@brand}'), 'Mở app Ship Ơi');
  assert.equal(tx('@missing.key'), '@missing.key');
  assert.equal(F.formatDong(40000), '40.000.000đ');
  assert.deepEqual(F.lunarLabel({ month: 8, day: 10 }), { date: 'MÙNG 10 THÁNG TÁM', countdown: 'CÒN 5 NGÀY TỚI RẰM' });
  assert.deepEqual(F.lunarLabel({ month: 8, day: 14 }), { date: '14 THÁNG TÁM', countdown: 'MAI LÀ RẰM' });
  assert.deepEqual(F.lunarLabel({ month: 8, day: 15 }), { date: 'RẰM THÁNG TÁM', countdown: 'ĐÊM RẰM' });
  assert.deepEqual(F.lunarLabel({ month: 7, day: 23 }), { date: '23 THÁNG BẢY', countdown: '' });
});

// ---- Determinism -------------------------------------------------------------------------------------

function scenario(seed) {
  const { runner: r, w } = setup({ seed, choose: { phone: 'give' } });
  toTail(r, w);
  r.event({ type: 'spotted', id: 'van' });
  tick(r, 0.1);
  r.retry();
  tick(r, 0.4);
  r.event({ type: 'knockout', id: 'g1', cause: 'choke' });
  r.event({ type: 'arrived', id: 'van' });
  tick(r, 1);
  r.event({ type: 'photo', id: 'plate', evidence: 'ev-plate' });
  tick(r, 0.5);
  return { log: w.log, outs: w.outs, progress: r.progress(), view: r.view(), state: r.state() };
}
test('identical inputs give identical runs (logs, UI events, progress, seeded picks)', () => {
  const a = scenario(11), b = scenario(11);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.outs, b.outs);
  assert.deepEqual(a.progress, b.progress);
  assert.deepEqual(a.view, b.view);
  assert.equal(a.state.vars.pick, b.state.vars.pick);
  const picks = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => scenario(s).state.vars.pick));
  assert.ok(picks.size > 1, 'the seed drives oneOf');
});

// ---- Saves -------------------------------------------------------------------------------------------

function memStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
test('save round trip: checkpoint → storage → new runner resumes at the same checkpoint and finishes the same', () => {
  const ref = setup({ choose: { phone: 'show' } });
  toTail(ref.runner, ref.w); finishFromTail(ref.runner);

  const { runner: r, w } = setup({ choose: { phone: 'show' } });
  toTail(r, w);
  tick(r, 2);
  const snap = r.snapshot();
  assert.equal(snap.checkpoint.mission, 't1-m1'); assert.equal(snap.checkpoint.step, 'tail');
  assert.equal(snap.progress.flags.midTail, undefined, 'saved progress is the checkpoint progress');
  const storage = memStorage();
  let now = 1000;
  const store = S.createSaveStore(storage, { now: () => now, index: INDEX, known: { missions: ['t1-m1', 't1-m2', 't2-m1'] } });
  store.read();
  assert.equal(store.write(1, snap, { director: { x: 582, z: -79.2 }, force: true }), 'saved');
  assert.ok(storage.m.get(S.SAVE_KEY).length < 30000);

  const again = S.createSaveStore(storage, { now: () => now, index: INDEX });
  const file = again.read();
  assert.equal(again.status, 'ok');
  const slot = file.slots[1];
  assert.equal(slot.label, 'Chương 1 · Kho lạnh'); assert.equal(slot.mission, 't1-m1'); assert.deepEqual(slot.director, { x: 582, z: -79.2 });
  assert.equal(file.last, 1);
  assert.deepEqual(S.decode(S.encode(file)).file, file, 'decode(encode(x)) is x');
  assert.deepEqual(again.summaries().map((s) => [s.empty, s.chapter]), [[true, 0], [false, 1], [true, 0]]);

  const s2 = setup({ choose: { phone: 'show' } });
  assert.equal(s2.runner.resume(S.toStorySave(slot)), true);
  assert.equal(s2.w.resets[0], 'checkpoint');
  tick(s2.runner, 0.2);
  assert.equal(step(s2.runner), 'tail');
  assert.equal(s2.runner.state().vars.tries, 1);
  assert.ok(s2.w.log.every((l) => l.k !== 'cutscene'), 'nothing before the checkpoint replays');
  assert.ok(s2.w.log.find((l) => l.k === 'vehicle').restoring);
  assert.equal(s2.runner.state().mt >= snap.checkpoint.mt, true);
  finishFromTail(s2.runner);
  const a = ref.runner.progress(), b = s2.runner.progress();
  for (const k of ['completed', 'flags', 'evidence', 'cash', 'abilities', 'board', 'seen', 'conscience']) assert.deepEqual(b[k], a[k], k);
});

test('migration from v0: the unslotted prototype blob becomes slot 1 and resumes its mission', () => {
  const v0 = { completed: ['t1-m1'], flags: { sawKho: true, junk: { deep: 1 } }, evidence: ['ev-plate', 'gone'], cash: 120, mission: 't1-m2', step: 'ask', seconds: 300 };
  const storage = memStorage();
  storage.setItem(S.SAVE_KEY, JSON.stringify(v0));
  const store = S.createSaveStore(storage, { index: INDEX, known: { missions: ['t1-m1', 't1-m2', 't2-m1'], evidence: EVIDENCE.map((e) => e.id) } });
  const file = store.read();
  assert.equal(store.status, 'migrated');
  assert.equal(file.version, 1);
  const slot = file.slots[0];
  assert.deepEqual(slot.progress.completed, ['t1-m1']);
  assert.deepEqual(slot.progress.flags, { sawKho: true });
  assert.deepEqual(slot.progress.evidence, ['ev-plate'], 'unknown evidence dropped');
  assert.equal(slot.progress.cash, 120); assert.equal(slot.progress.playSeconds, 300);
  assert.deepEqual([slot.checkpoint.mission, slot.checkpoint.step, slot.checkpoint.start], ['t1-m2', 'ask', false]);
  assert.deepEqual([file.slots[1], file.slots[2]], [null, null]);
  const progress = slot.progress;
  progress.evidence.push('ev-ledger', 'ev-bag', 'ev-file');
  const { runner: r, w } = setup();
  assert.equal(r.resume({ progress, checkpoint: slot.checkpoint }), true);
  tick(r, 0.1);
  assert.equal(step(r), 'ask');
  assert.equal(outs(w, 'session').at(-1).kind, 'interrogate');
  assert.equal(S.versionOf({ version: 1 }), 1); assert.equal(S.versionOf({ completed: [] }), 0); assert.equal(S.versionOf(42), -1);
});

test('storage failures: blocked storage falls back to memory, corrupt and newer files are backed up', () => {
  const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  const store = S.createSaveStore(throwing, { now: () => 0 });
  store.read();
  assert.equal(store.blocked, true);
  assert.equal(store.write(0, { progress: F.newProgress(), checkpoint: null }, { force: true }), 'memory');
  assert.equal(store.read().slots[0].label, 'Chương 1 · Tự do', 'kept in memory for the session');
  assert.equal(S.createSaveStore(null).blocked, true);

  const storage = memStorage();
  storage.setItem(S.SAVE_KEY, '{"version":1,"slots":[{"progress":');
  const corrupt = S.createSaveStore(storage);
  assert.deepEqual(corrupt.read(), S.emptySave());
  assert.equal(corrupt.status, 'corrupt');
  assert.equal(storage.m.get(S.BACKUP_KEY), '{"version":1,"slots":[{"progress":');
  storage.setItem(S.SAVE_KEY, JSON.stringify({ version: 99, slots: [] }));
  const future = S.createSaveStore(storage);
  future.read();
  assert.equal(future.status, 'future');
  assert.equal(storage.m.get(S.BACKUP_KEY), JSON.stringify({ version: 99, slots: [] }));
});

test('writes are throttled; flush writes the pending state', () => {
  const storage = memStorage();
  let now = 0;
  const store = S.createSaveStore(storage, { now: () => now, index: INDEX });
  store.read();
  assert.equal(store.write(0, { progress: F.newProgress(), checkpoint: null }), 'saved');
  now = 500;
  const p = F.newProgress(); p.cash = 77;
  assert.equal(store.write(0, { progress: p, checkpoint: null }), 'queued');
  assert.equal(JSON.parse(storage.m.get(S.SAVE_KEY)).slots[0].progress.cash, 0);
  assert.equal(store.pending, true);
  assert.equal(store.flush(), 'saved');
  assert.equal(JSON.parse(storage.m.get(S.SAVE_KEY)).slots[0].progress.cash, 77);
  now = 3000;
  assert.equal(store.write(2, { progress: p, checkpoint: null }), 'saved');
  store.remove(2);
  assert.equal(JSON.parse(storage.m.get(S.SAVE_KEY)).slots[2], null);
  assert.equal(store.settings({ subtitles: 'l' }).subtitles, 'l');
});

test('sanitize repairs wrong types, clamps numbers and drops checkpoints of removed missions', () => {
  const f = S.sanitize({
    version: 1, last: 9, settings: { subtitles: 'huge', skipSeen: 'yes', difficulty: 'kho' },
    slots: [{
      progress: { completed: ['t1-m1', 7, 't1-m1'], cash: -5, hintTokens: 1e9, lunar: { month: 13, day: 0 }, items: { bolt: 3.6, bad: -1 }, debt: { paid: 1e12 },
        medals: { 't1-m1': { grade: 'S', bestSeconds: 'fast' }, gone: { grade: 'A' } }, chapterStarts: { 1: { cash: 5 }, x: {} } },
      checkpoint: { mission: 'gone', step: 's' },
    }, 'nope'],
  }, { missions: ['t1-m1'] });
  const p = f.slots[0].progress;
  assert.deepEqual(p.completed, ['t1-m1']);
  assert.equal(p.cash, 0); assert.equal(p.hintTokens, 99); assert.deepEqual(p.lunar, { month: 12, day: 1 });
  assert.deepEqual(p.items, { bolt: 4 }); assert.equal(p.debt.paid, F.DEBT_TOTAL);
  assert.deepEqual(Object.keys(p.medals), ['t1-m1']); assert.equal(p.medals['t1-m1'].grade, 'D');
  assert.deepEqual(Object.keys(p.chapterStarts), ['1']); assert.equal(p.chapterStarts[1].cash, 5);
  assert.equal(f.slots[0].checkpoint, null); assert.equal(f.slots[0].mission, null);
  assert.equal(f.slots[1], null); assert.equal(f.last, 2);
  assert.deepEqual(f.settings, { subtitles: 'm', skipSeen: true, holdToSkip: true, difficulty: 'kho' });
});

// ---- Deduction board ---------------------------------------------------------------------------------

test('deduction: strings snap or cost a token (never below zero), hints, hypotheses, solving and the question', () => {
  const p = F.newProgress();
  const own = new Set(['ev-plate', 'ev-pass', 'ev-bag']);
  const owned = (id) => own.has(id);
  assert.equal(D.linkCards(BOARD, p, 'ev-plate', 'ev-note', owned).result, 'locked');
  assert.equal(D.linkCards(BOARD, p, 'ev-plate', 'ev-plate', owned).result, 'self');
  assert.equal(D.linkCards(BOARD, p, 'ev-pass', 'ev-plate', owned).result, 'correct');
  assert.equal(D.linkCards(BOARD, p, 'ev-plate', 'ev-pass', owned).result, 'known');
  assert.deepEqual(p.board.links, ['ev-pass|ev-plate']);
  assert.equal(D.linkCards(BOARD, p, 'ev-plate', 'q-who', owned).cost, 1);
  assert.equal(D.linkCards(BOARD, p, 'ev-pass', 'q-who', owned).cost, 1);
  assert.equal(p.hintTokens, 0);
  assert.equal(D.linkCards(BOARD, p, 'ev-plate', 'q-who', owned).cost, 0, 'no tokens left: still never a fail');
  assert.equal(p.board.streak, 3);
  const free = D.boardHint(BOARD, p, owned);
  assert.deepEqual(free, { kind: 'card', hyp: 'sv', card: 'ev-plate', cost: 0 });
  assert.equal(D.boardHint(BOARD, p, owned).kind, 'no-tokens');
  const wrong = D.propose(BOARD, p, 'sv', ['ev-plate', 'ev-pass', 'ev-bag'], owned);
  assert.deepEqual([wrong.result, wrong.against, wrong.missing], ['wrong', ['ev-bag'], 0]);
  assert.equal(D.propose(BOARD, p, 'sv', ['ev-plate'], owned).missing, 1);
  assert.equal(D.propose(BOARD, p, 'sv', ['ev-plate', 'ev-pass', 'ev-note'], owned).result, 'proven');
  p.hintTokens = 1;
  own.add('ev-note');
  const h = D.boardHint(BOARD, p, owned);
  assert.deepEqual([h.kind, h.a, h.b, h.cost], ['link', 'ev-pass', 'ev-note', 1]);
  assert.equal(D.linkCards(BOARD, p, 'q-who', 'ev-note', owned).solved, true);
  assert.deepEqual(p.board.solved, ['b1']);
  assert.equal(D.boardHint(BOARD, p, owned).kind, 'question');
  const view = D.boardView(BOARD, p, owned);
  assert.deepEqual([view.done, view.total, view.ratio, view.solved], [4, 4, 1, true]);
  assert.equal(view.links.find((l) => l.a === 'ev-note' && l.b === 'ev-pass').hinted, true);
  p.hintTokens = 1;
  assert.deepEqual(D.answerQuestion(Q1, p, 'quang'), { result: 'wrong', cost: 1, tries: 1 });
  assert.deepEqual(D.answerQuestion(Q1, p, 'nobody'), { result: 'unknown', cost: 0, tries: 1 });
  assert.deepEqual(D.answerQuestion(Q1, p, 'don'), { result: 'correct', cost: 0, tries: 2 });
  assert.equal(D.answerQuestion(Q1, p, 'don').result, 'known');
  assert.deepEqual(D.provable(Q1, owned), ['don']);
  assert.equal(F.testProgress({ k: 'deduced', id: 'q1' }, p), true);
  assert.equal(F.testProgress({ k: 'deduced', id: 'q1', firstTry: true }, p), false);
  const bad = { id: 'x', title: 'X', cards: [{ id: 'a' }, { id: 'a' }, { id: 'lonely', needs: null }], links: [['a', 'a'], ['a', 'ghost']], hypotheses: [{ id: 'h', text: 'h', needs: [] }] };
  const issues = D.lintBoard(bad, new Set(['a']));
  for (const s of ['duplicate card a', 'to itself', 'unknown card ghost', 'lonely is on no string', 'needs no card']) assert.ok(issues.some((i) => i.includes(s)), s);
  assert.ok(D.lintQuestion({ id: 'q', prompt: 'p', options: [{ id: 'a', text: 'a' }], answer: 'b' }).length >= 2);
});

// ---- Interrogation -----------------------------------------------------------------------------------

test('interrogation: contradictions, silence after mistakes, pressing unlocks, bluffs need pressure, truths need empathy', () => {
  const owned = (id) => ['ev-ledger', 'ev-bag', 'ev-file'].includes(id);
  const s = I.startInterrogation(TALK);
  assert.deepEqual(s.order, ['s1', 's2', 's3']);
  assert.equal(I.present(TALK, s, 'ev-x', 'accuse', owned).result, 'missing');
  assert.equal(I.present(TALK, s, 'ev-ledger', 'empathy', owned).result, 'deflect');
  const w = I.present(TALK, s, 'ev-bag', 'accuse', owned);
  assert.deepEqual([w.result, w.silent], ['wrong', 4]);
  assert.equal(I.press(TALK, s).result, 'silent');
  I.tickInterrogation(s, 4);
  const pr = I.press(TALK, s);
  assert.deepEqual([pr.result, pr.unlocked, pr.hint], ['pressed', 's1b', 'ev-ledger']);
  assert.deepEqual(s.order, ['s1', 's1b', 's2', 's3']);
  assert.deepEqual(I.interrogationHint(TALK, s, owned), { card: 'ev-ledger', approach: 'accuse' });
  const c = I.present(TALK, s, 'ev-ledger', 'accuse', owned);
  assert.deepEqual([c.result, c.settled, c.line], ['contradiction', 's1', 'Thì… chị có ghi sổ. Nhưng chị đâu biết hết.']);
  assert.equal(I.currentStatement(TALK, s).id, 's1b');
  assert.equal(I.bluff(TALK, s).result, 'bluffed', 'pressure 0.4 beats the 0.3 bluff threshold');
  const called = I.bluff(TALK, s);
  assert.deepEqual([called.result, called.silent], ['called', 8]);
  I.tickInterrogation(s, 8);
  assert.equal(I.present(TALK, s, 'ev-bag', 'accuse', owned).result, 'contradiction');
  const hurt = I.present(TALK, s, 'ev-file', 'accuse', owned);
  assert.deepEqual([hurt.result, hurt.line, s.trust], ['hurt', 'Em thì biết gì!', -1]);
  I.tickInterrogation(s, 4);
  const ok = I.present(TALK, s, 'ev-file', 'empathy', owned);
  assert.deepEqual([ok.result, ok.done, ok.line], ['understood', true, 'Chị cũng từng là con Mai đó.']);
  assert.deepEqual(I.outcome(TALK, s), { settled: 4, wrong: 2, bluffs: 1, called: 1, empathy: 1, trust: 0, perfect: false });
  assert.deepEqual(I.settledFlags(TALK, s), { diemTrusts: true });
  assert.deepEqual(I.interrogationView(TALK, s).statements.map((x) => [x.id, x.state]), [['s1', 'broken'], ['s1b', 'broken'], ['s2', 'broken'], ['s3', 'true']]);
  assert.equal(I.press(TALK, s).result, 'done');
  const fresh = I.startInterrogation(TALK);
  assert.deepEqual(I.interrogationView(TALK, fresh).statements.map((x) => [x.id, x.state]), [['s1', 'current'], ['s2', 'pending'], ['s3', 'pending']], 'hidden statements stay off the tracker');
  // pressing someone telling the truth too hard only hurts
  const t = I.startInterrogation({ id: 't', subject: 'diem', statements: [{ id: 'x', kind: 'true', text: 'Thật mà.', cards: ['ev-file'], reply: 'Ừ.' }] });
  const def = { id: 't', subject: 'diem', statements: [{ id: 'x', kind: 'true', text: 'Thật mà.', cards: ['ev-file'], reply: 'Ừ.' }] };
  let last;
  for (let i = 0; i < 12 && last?.result !== 'hurt'; i++) last = I.press(def, t);
  assert.equal(last.result, 'hurt');
  assert.equal(I.bluff(def, I.startInterrogation(def)).result, 'hurt');
  const issues = I.lintInterrogation({ id: 'b', subject: 'x', statements: [{ id: 'a', kind: 'true', text: 't', cards: [], reply: 'r', bluff: 0.5, press: { text: 'p', unlocks: 'zz' } }, { id: 'h', kind: 'lie', hidden: true, text: 't', cards: ['ev-x'], reply: 'r' }] }, new Set(['ev-file']));
  for (const s2 of ['no card settles', 'unknown statement zz', 'hidden and never unlocked', 'cannot be bluffed', 'unknown evidence ev-x']) assert.ok(issues.some((i) => i.includes(s2)), s2);
});

// ---- Content lint, registry, host adapter -------------------------------------------------------------

test('lintContent passes the sample chapters and catches broken scripts', () => {
  assert.deepEqual(lintContent(INDEX, [MOD1, MOD2]), []);
  const BAD = {
    id: 't1-m1',
    steps: [
      { id: 'a', objective: 'TODO viết sau', next: 'nowhere', enter: [{ k: 'dialogue', id: 'd', lines: [{ who: 'ghost', text: 'Mở app GiaoNhanh đi em.' }] }] },
      { id: 'b', objective: 'Go to the warehouse now', enter: [{ k: 'evidence', id: 'ev-missing' }] },
      { id: 'c', checkpoint: true, objective: 'Hạ gục tên gác', done: { k: 'actor', id: 'g9', down: true }, fail: [{ when: { k: 'never' }, reason: '' }] },
    ],
    rewards: [{ k: 'cutscene', id: 'x' }],
  };
  const issues = lintContent(INDEX, [{ chapter: 1, missions: [BAD, M1] }, MOD2]);
  const expect = ['duplicate mission id t1-m1', 'unknown step nowhere', 'placeholder text', 'real brand name', 'unknown speaker ghost', 'unknown evidence ev-missing',
    'without Vietnamese diacritics', 't1-m1/b: unreachable step', "'g9' is used but not spawned since checkpoint 'c'", 'reward cutscene blocks', 't1-m2: no mission script', 'empty text'];
  for (const s of expect) assert.ok(issues.some((i) => i.includes(s)), `${s}\n${issues.join('\n')}`);
  assert.ok(lintContent(INDEX, [{ ...MOD1, missions: [{ ...M1, steps: [...M1.steps, { id: 'end' }] }, M2] }, MOD2]).some((i) => i.includes("step id 'end' is reserved")));
  const placed = lintContent(INDEX, [MOD1, MOD2], { places: ['ben-xe', 'kho-gate'] });
  assert.deepEqual(placed, ['t1-m1/stake: unknown place hide'], 'place refs checked against the sites list');
  assert.ok(lintContent(INDEX, [{ ...MOD1, text: { ...MOD1.text, arrive: 'Lấy đơn GN-0417 ở nhà thuốc' } }, MOD2]).some((i) => i.includes('real brand name')));
  const noSpawn = { ...M1, steps: M1.steps.map((s) => (s.id === 'stake' ? { ...s, checkpoint: { label: 'Đã lưu' } } : s)) };
  assert.ok(lintContent(INDEX, [{ ...MOD1, missions: [noSpawn, M2] }, MOD2]).some((i) => i.includes("t1-m1/stake: 'g1' is used but not spawned")));
  for (const t of ['Con Dream này còn ngon.', 'Chị Vân lái chiếc Vios bạc tới.']) assert.ok(lintContent(INDEX, [{ ...MOD1, text: { ...MOD1.text, arrive: t } }, MOD2]).some((i) => i.includes('real brand name')), t);
});

test('the engine contract: with it the lint rejects ops, queries, models, templates, arenas, meters… the engine does not implement', async () => {
  const { ENGINE_CONTRACT } = await import('../app/game/story/contract.ts');
  const engine = { ...ENGINE_CONTRACT, templates: { ...ENGINE_CONTRACT.templates, guard: ['stealth', 'sample template'] }, abilities: { ...ENGINE_CONTRACT.abilities } };
  assert.deepEqual(lintContent(INDEX, [MOD1, MOD2], { engine }), [], 'the sample chapters only use known ids (tail:van comes from the tail act)');
  const ODD = { ...M1, steps: [
    { ...M1.steps[0], enter: [...M1.steps[0].enter, { k: 'do', op: 'festivall' }, { k: 'player', outfit: 'tin-ninja', lock: ['jump'] }, { k: 'vehicle', id: 'x', model: 'vios', at: 'ben-xe' },
      { k: 'stealth', arena: 'kho-9', rules: { lethl: 'fail' } }, { k: 'music', id: 'bolero' }, { k: 'spawn', id: 'y', template: 'captiveTeen', at: 'ben-xe', behaviour: { k: 'act', name: 'dance' } },
      { k: 'interactable', id: 'leo', at: 'ben-xe', prompt: 'Leo lên', kind: 'climb' }],
    meters: [{ id: 'panic', label: 'Hoảng' }], done: { k: 'all', of: [{ k: 'q', name: 'lightOut' }, { k: 'meter', id: 'eye:suv', op: '>', value: 0 }, { k: 'on', ev: 'signal', id: 'ranRedd' }] } },
    ...M1.steps.slice(1)] };
  const issues = lintContent(INDEX, [{ ...MOD1, missions: [ODD, M2] }, MOD2], { engine });
  for (const s of ["ops 'festivall'", "outfits 'tin-ninja'", "locks 'jump'", "models 'vios'", "arenas 'kho-9'", "stealthRules 'lethl'", "music 'bolero'", "templates 'captiveTeen'", "acts 'dance'", "meters 'panic'", "queries 'lightOut'", "meters 'eye:suv'", "signals 'ranRedd'", "climb leo has no far end 'to'"]) {
    assert.ok(issues.some((i) => i.includes(s)), `${s}\n${issues.join('\n')}`);
  }
  assert.equal(lintContent(INDEX, [{ ...MOD1, missions: [ODD, M2] }, MOD2]).filter((i) => i.includes('engine contract')).length, 0, 'without the contract nothing is checked');
});

test('campaign text constants load with the index; a catalog without the chapter that used to hold them still resolves {@key}', () => {
  const idx = { ...INDEX, text: { brand: 'ĐơnƠi' } };
  const mod1 = { ...MOD1, text: { ...MOD1.text } };
  delete mod1.text.brand;
  const cat = buildCatalog(idx, [MOD2]);
  assert.equal(makeText(cat, () => undefined)('Mở app {@brand} để nhận đơn'), 'Mở app ĐơnƠi để nhận đơn');
  assert.deepEqual(lintContent(idx, [mod1, MOD2]), []);
  assert.ok(lintContent(idx, [MOD1, MOD2]).some((i) => i.includes('duplicate text key id brand')), 'a chapter may not redefine a campaign constant');
  assert.equal(C.CAMPAIGN.text.app, 'ĐơnƠi'); assert.equal(C.CAMPAIGN.text.bank, 'NGÂN HÀNG KIM THÀNH'); assert.equal(C.CAMPAIGN.text.code, 'DO');
  for (const t of ['Mở app GiaoLẹ đi em.', 'Đơn GL-0417 ở nhà thuốc.', 'Thẻ ra vào SEN VÀNG LOGISTICS.', 'THÔNG BÁO THU NỢ — CÔNG TY TÍN DỤNG SEN VÀNG']) {
    assert.ok(lintContent(INDEX, [{ ...MOD1, text: { ...MOD1.text, arrive: t } }, MOD2]).some((i) => i.includes('real brand name')), t);
  }
  assert.deepEqual(lintContent(INDEX, [{ ...MOD1, text: { ...MOD1.text, arrive: 'Bấm nhận, chạy, giao. Giao lẹ là khách cho năm sao.' } }, MOD2]), [], 'the plain phrase "giao lẹ" is not the retired brand');
});

test('a watcher that fires on its step\'s last tick still applies its instant acts; choices carry their UI style', () => {
  const M = {
    id: 't2-m1', steps: [
      { id: 'a', watchers: [{ when: { k: 'on', ev: 'signal', id: 'go' }, do: [{ k: 'flag', name: 'fromWatcher' }, { k: 'wait', seconds: 1 }, { k: 'flag', name: 'afterWait' }] }],
        done: { k: 'on', ev: 'signal', id: 'go' } },
      { id: 'b', watchers: [{ when: { k: 'on', ev: 'signal', id: 'jump' }, do: [{ k: 'flag', name: 'beforeBranch' }] }],
        branch: [{ when: { k: 'on', ev: 'signal', id: 'jump' }, goto: 'c' }], done: { k: 'never' } },
      { id: 'c', enter: [{ k: 'choice', id: 'plate', prompt: 'Biển số nào?', style: 'plate', options: [{ id: 'x', text: '59-X1 123.45' }, { id: 'y', text: '51D-207.19' }] }, { k: 'choice', id: 'plain', options: [{ id: 'z', text: 'Ừ' }] }] },
    ],
  };
  const { runner: r, w } = setup({ modules: [MOD1, { chapter: 2, missions: [M] }], choose: { plate: 'y' } });
  r.start('t2-m1');
  tick(r, 0.2);
  r.event({ type: 'signal', id: 'go' });
  tick(r, 0.1);
  assert.equal(step(r), 'b', 'done and the watcher fire on the same tick and the step has no exit acts, so it ends at once');
  assert.equal(r.progress().flags.fromWatcher, true, 'the watcher\'s instant acts still ran');
  assert.equal(r.progress().flags.afterWait, undefined, 'its blocking tail is dropped with the step');
  r.event({ type: 'signal', id: 'jump' });
  tick(r, 0.3);
  assert.equal(r.progress().flags.beforeBranch, true, 'a watcher firing with a branch runs before the branch leaves');
  assert.equal(r.progress().flags['choice:plate'], 'y');
  assert.deepEqual(w.log.filter((l) => l.k === 'choice').map((l) => [l.id, l.style]), [['plate', 'plate'], ['plain', 'scene']]);
});

test('campaign index: 11 chapters, 36 missions, 235 minutes; chapters load lazily through the registry', async () => {
  assert.equal(C.CAMPAIGN.chapters.length, 11);
  assert.equal(C.MISSION_IDS.length, 36);
  assert.equal(new Set(C.MISSION_IDS).size, 36);
  assert.equal(C.CAMPAIGN.chapters.flatMap((c) => c.missions).reduce((t, m) => t + m.minutes, 0), 235);
  assert.deepEqual(C.CAMPAIGN.chapters.map((c) => c.id).slice(0, 2), ['ch01', 'ch02']);
  assert.deepEqual(C.CAMPAIGN.chapters.at(-1).lunar, { month: 8, day: 15 });
  for (const ch of C.CAMPAIGN.chapters) for (const m of ch.missions) assert.match(m.id, new RegExp(`^c${ch.n}-m\\d$`));
  for (const t of C.CAMPAIGN.chapters.flatMap((c) => [c.title, c.summary, ...c.missions.map((m) => m.title)])) for (const b of R.FORBIDDEN_BRANDS) assert.doesNotMatch(t, b);
  assert.equal(await C.loadChapter(5), null);
  assert.deepEqual(C.builtChapters(), [1, 2]);
  assert.deepEqual((await C.loadChapter(2)).missions.map((m) => m.id), ['c2-m1', 'c2-m2', 'c2-m3'], 'the real chapter 2 loads through LOADERS');
  let loads = 0;
  C.registerChapter(1, async () => { loads++; return { chapter: { chapter: 1, missions: [{ id: 'c1-m1', steps: [{ id: 'a', done: { k: 'always' } }] }] } }; });
  const cat = await C.loadCatalog([1, 5]);
  await C.loadChapter(1);
  assert.equal(loads, 1, 'loaded once');
  assert.ok(cat.missions.has('c1-m1'));
  assert.equal(cat.meta.get('c4-m2').title, 'Tấm ảnh trong sổ');
  assert.deepEqual(C.builtChapters(), [1, 2], 'chapters 1–2 are built (LOADERS)');
  C.registerChapter(2, async () => { throw new Error('boom'); });
  await assert.rejects(C.loadChapter(2));
});

test('createStoryPort maps conditions and actions onto a StoryHost; late completions after cancel are ignored', () => {
  const calls = [], pendingDone = [];
  const state = { x: 582, z: -80, y: 0, yaw: 0, speed: 0, mode: 'foot', vehicle: null, health: 100, wanted: 0, crouched: true, hidden: false, visibility: 0.2, noise: 1, carrying: null, down: null, level: null, space: null };
  const host = {
    time: { hour: () => 23, setHour: (h) => calls.push(['hour', h]), setClockRate: (k) => calls.push(['rate', k]), setWeather: (s, o) => calls.push(['weather', s, o.lock]), setTimeScale() {} },
    world: {
      resolve: (at) => (typeof at === 'string' ? (PLACES[at] ? { ...PLACES[at], y: 0, yaw: 0 } : null) : { ...at, y: 0, yaw: 0 }),
      area: () => ({ x0: 570, z0: -90, x1: 590, z1: -70 }), groundAt: () => 0, sight: () => true, districtAt: () => 'quan-4',
      setPolicy: (p) => calls.push(['policy', p]), prop: (s) => calls.push(['prop', s.id]),
    },
    spaces: { enter: (id, link, d) => { calls.push(['enter', id]); d(); }, leave: (to, d) => d(), setVariant: () => {}, current: () => null, level: () => null },
    player: { state: () => state, teleport: (at, o, d) => d(), lockInput: () => {}, setStance: () => {}, setPose: () => {}, setCarry: () => {}, setOutfit: (id) => calls.push(['outfit', id]), setHeadlight: () => {}, setCover: (c) => calls.push(['cover', c]) },
    actors: { spawn: (s) => calls.push(['spawn', s.id]), despawn: () => {}, behave: () => {}, get: (id) => (id === 'g1' ? { x: 586, z: -80, yaw: 0, state: 'patrol', down: false, seesPlayer: false, awareness: 0 } : null), bark: () => {} },
    vehicles: { set: (s) => calls.push(['vehicle', s.id]), get: () => null },
    camera: { override: () => {}, profile: () => {}, shake: () => {} },
    cine: {
      play: (id, o, d) => { calls.push(['play', id, o.seen]); pendingDone.push(d); }, dialogue: (id, l, m, d) => d(), call: (s, d) => d('declined'),
      sms: () => {}, title: (k, t, s, ms, d) => d(), fade: (to, ms, d) => d(), choice: (p, d) => d(p.options[1].id), letterbox: () => {}, cancel: () => calls.push(['cancel']),
    },
    ui: { emit: (e) => calls.push(['emit', e.type]), hint: () => {}, toast: () => {} },
    audio: { sting: () => {}, music: () => {} }, interact: { add: () => {}, remove: () => {} },
    police: { force: (n) => calls.push(['force', n]), reset: () => calls.push(['policeReset']) },
    helpers: { start: (s) => calls.push(['helper', s.k]), stop: () => {}, meter: (id) => (id === 'tail:van' ? 0.4 : undefined), query: (name) => name === 'lightsOut' },
    clear: (s) => calls.push(['clear', s]),
  };
  const resolved = [];
  const port = H.createStoryPort(host, (h, r) => resolved.push([h, r]));
  assert.equal(port.test({ k: 'reach', at: 'kho-gate', r: 3 }), true);
  assert.equal(port.test({ k: 'reach', at: 'kho-gate', r: 3, mode: 'bike' }), false);
  assert.equal(port.test({ k: 'stance', is: 'crouch' }), true);
  assert.equal(port.test({ k: 'area', area: 'kho', inside: false }), false);
  assert.equal(port.test({ k: 'meter', id: 'tail:van', op: '<', value: 0.5 }), true);
  assert.equal(port.test({ k: 'actor', id: 'g1', state: 'patrol', at: 'kho-gate', r: 6 }), true);
  assert.equal(port.test({ k: 'near', a: 'player', b: 'g1', r: 5 }), true);
  assert.equal(port.test({ k: 'hour', from: 22, to: 3 }), true);
  assert.equal(port.test({ k: 'q', name: 'lightsOut' }), true);
  const ctx = { mission: 'm', step: 's', restoring: false };
  assert.equal(port.exec({ k: 'cutscene', id: 'cs1' }, 5, { ...ctx, seen: true }), true);
  pendingDone.shift()();
  assert.deepEqual(resolved, [[5, undefined]]);
  port.exec({ k: 'cutscene', id: 'cs2' }, 6, ctx);
  port.cancel(6);
  pendingDone.shift()();
  assert.deepEqual(resolved, [[5, undefined]], 'cancelled completion ignored');
  assert.equal(port.exec({ k: 'choice', id: 'c', prompt: 'p', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, 7, ctx), true);
  assert.equal(port.exec({ k: 'call', id: 'q', from: 'quang', lines: [] }, 8, ctx), true);
  assert.deepEqual(resolved.slice(1), [[7, 'b'], [8, 'declined']]);
  assert.equal(port.exec({ k: 'spawn', id: 'g2', at: 'kho-gate' }, 9, ctx), false);
  assert.equal(port.exec({ k: 'stealth', arena: null, cover: 'shipper' }, 10, ctx), false);
  port.exec({ k: 'space', enter: 'kho7-hall' }, 11, ctx);
  port.reset('end');
  assert.deepEqual(calls.filter((c) => ['spawn', 'cover', 'enter', 'policy', 'rate', 'policeReset', 'clear', 'cancel'].includes(c[0])),
    [['cancel'], ['spawn', 'g2'], ['cover', 'shipper'], ['enter', 'kho7-hall'], ['policy', null], ['rate', 1], ['policeReset'], ['clear', 'mission']]);
});
