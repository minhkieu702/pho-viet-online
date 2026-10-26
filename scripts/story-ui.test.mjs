// node --experimental-transform-types --test scripts/story-ui.test.mjs
// Story UI pure parts (app/story-ui): the lunar labels and moon phases, number/time/plate formatting, Vietnamese
// initials, medal mapping from the runner's Medal flags, board geometry (lotus slots, strings), the external
// store and settings sanitising, and the mock reducer the preview route uses (board links and hypotheses,
// deduction, CCTV marks, interrogation). No React, DOM or three.js is loaded.
// The UI modules import './x' without an extension (Vite style); a hook retries such specifiers as .ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

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
} else {
  module.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) {
    try { return await n(s, c); } catch (e) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return n(s + '.ts', c);
      throw e;
    }
  }`)}`);
}

const F = await import('../app/story-ui/format.ts');
const S = await import('../app/story-ui/store.ts');
const M = await import('../app/story-ui/mock.ts');

test('lunar labels: mùng, ngày, Rằm and the countdown to Rằm tháng Tám', () => {
  assert.equal(F.lunarLabel({ month: 8, day: 1 }), 'Mùng 1 tháng Tám');
  assert.equal(F.lunarLabel({ month: 8, day: 10 }), 'Mùng 10 tháng Tám');
  assert.equal(F.lunarLabel({ month: 8, day: 12 }), 'Ngày 12 tháng Tám');
  assert.equal(F.lunarLabel({ month: 8, day: 15 }), 'Rằm tháng Tám');
  assert.equal(F.lunarLabel({ month: 7, day: 27 }), 'Ngày 27 tháng Bảy');
  assert.equal(F.lunarLabel({ month: 1, day: 3 }), 'Mùng 3 tháng Giêng');
  assert.equal(F.lunarLabel({ month: 12, day: 30 }), 'Ngày 30 tháng Chạp');
  assert.equal(F.countdownLabel({ month: 8, day: 10 }), 'Còn 5 ngày tới Rằm');
  assert.equal(F.countdownLabel({ month: 8, day: 14 }), 'Mai là Rằm');
  assert.equal(F.countdownLabel({ month: 8, day: 15 }), 'Đêm Rằm');
  assert.equal(F.countdownLabel({ month: 8, day: 16 }), 'Sau Rằm');
  assert.equal(F.countdownLabel({ month: 7, day: 27 }), 'Còn 18 ngày tới Rằm', 'tháng Bảy counts as 30 days');
  assert.equal(F.countdownLabel({ month: 7, day: 27, daysLeft: 17 }), 'Còn 17 ngày tới Rằm', 'a 29-day month from the runner wins');
  assert.equal(F.countdownLabel({ month: 8, day: 3, countdown: 'CÒN 12 NGÀY' }), 'CÒN 12 NGÀY');
  assert.equal(F.lunarLabel({ month: 8, day: 3, label: 'Mùng 3' }), 'Mùng 3');
});

test('moon phases: new on mùng 1, full on Rằm, waxing lit on the right', () => {
  assert.ok(F.moonLit(1) < 0.01);
  assert.ok(F.moonLit(15) > 0.99);
  assert.ok(F.moonLit(8) > 0.4 && F.moonLit(8) < 0.6);
  assert.equal(F.moonPath(1, 6), '', 'nothing lit at the new moon');
  assert.match(F.moonPath(15, 6), /A6 6 0 1 1/, 'full disc');
  assert.match(F.moonPath(4, 6), /^M0 -6A6 6 0 0 1 0 6A[\d.]+ 6 0 0 0 0 -6Z$/, 'waxing crescent: right limb, terminator bulging right');
  assert.match(F.moonPath(12, 6), /^M0 -6A6 6 0 0 1 0 6A[\d.]+ 6 0 0 1 0 -6Z$/, 'waxing gibbous: terminator bulging left');
  assert.match(F.moonPath(22, 6), /^M0 -6A6 6 0 0 0 0 6/, 'waning: left limb');
});

test('numbers, clocks, plates and Vietnamese words', () => {
  assert.equal(F.money(1350000), '1.350.000đ');
  assert.equal(F.money(40000000), '40.000.000đ');
  assert.equal(F.money(0), '0đ');
  assert.equal(F.mmss(42), '0:42');
  assert.equal(F.mmss(562), '9:22');
  assert.equal(F.mmss(4380), '1:13:00');
  assert.equal(F.clockLabel(3 * 3600 + 41 * 60 + 5), '03:41:05');
  assert.equal(F.clockLabel(86400 + 61), '00:01:01', 'wraps past midnight');
  assert.deepEqual(F.plateRows('59-X1 128.45'), ['59-X1', '128.45']);
  assert.deepEqual(F.plateRows('51D-207.19'), ['51D-207.19']);
  assert.equal(F.countPhrase(0), '');
  assert.equal(F.countPhrase(3), 'Một… hai… ba…');
  assert.equal(F.countPhrase(5), 'Một… hai… ba… bốn… năm.');
  assert.equal(F.chapterEyebrow(2), 'CHƯƠNG HAI');
  assert.equal(F.chapterEyebrow(11), 'CHƯƠNG MƯỜI MỘT');
  for (const [name, initial] of [['ĐẠI ÚY VÂN', 'V'], ['CÔ BA', 'B'], ['ÔNG TƯ', 'T'], ['QUANG LÌ', 'Q'], ['ÚT MAI', 'M'], ['GÃ ĐẦU TRỌC', 'Đ'], ['THIẾU TÁ LỰC', 'L'], ['Chị Diễm', 'D'], ['MÁ', 'M']]) assert.equal(F.initialOf(name), initial, name);
  assert.ok(F.subtitleSeconds('Ừ.') >= 1.8 && F.subtitleSeconds('x'.repeat(400)) <= 7.5);
  assert.ok(F.subtitleSeconds('Một câu vừa phải để đọc', 'slow') > F.subtitleSeconds('Một câu vừa phải để đọc', 'fast'));
  assert.equal(F.lightLabel(0.1), 'Trong bóng tối');
  assert.equal(F.lightLabel(0.9), 'Bị lộ');
});

test('labels cover every enum value with diacritics intact', () => {
  for (const table of [F.STANCE_LABEL, F.DETECTION_LABEL, F.ZONE_LABEL, F.ITEM_LABEL, F.STATUS_LABEL, F.KIND_LABEL]) for (const v of Object.values(table)) assert.ok(v && v === v.normalize('NFC'), v);
  assert.deepEqual(Object.keys(F.DIFFICULTY_LABEL), ['de', 'thuong', 'kho'], 'same ids as the runner Difficulty');
  for (const k of ['testimony', 'recording', 'call-log']) assert.ok(F.KIND_LABEL[k], `runner evidence kind ${k}`);
  assert.equal(F.ALARM_LABEL.length, 4);
});

test('medalIds maps the runner Medal flags in display order', () => {
  assert.deepEqual(F.medalIds({ ghost: true, nonLethal: true, fast: false, eye: true }), ['bong-ma', 'luong-tam', 'mat-cu']);
  assert.deepEqual(F.medalIds(null), []);
});

test('board geometry: lotus slots, explicit positions, overflow, strings and link keys', () => {
  assert.equal(F.LOTUS_SLOTS.length, 15);
  for (const [x, y] of F.LOTUS_SLOTS) assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
  // slots are far enough apart for a card about 12% wide and 15% tall
  for (let i = 0; i < F.LOTUS_SLOTS.length; i++) for (let j = i + 1; j < F.LOTUS_SLOTS.length; j++) {
    const [a, b] = [F.LOTUS_SLOTS[i], F.LOTUS_SLOTS[j]];
    assert.ok(Math.abs(a[0] - b[0]) > 0.12 || Math.abs(a[1] - b[1]) > 0.15, `slots ${i} and ${j} overlap`);
  }
  assert.deepEqual(F.cardSpot({ slot: 0 }, 5), F.LOTUS_SLOTS[0]);
  assert.deepEqual(F.cardSpot({}, 3), F.LOTUS_SLOTS[3], 'falls back to the index');
  assert.deepEqual(F.cardSpot({ x: 0.2, y: 0.3, slot: 1 }, 0), [0.2, 0.3], 'explicit position wins');
  const far = F.cardSpot({ slot: 20 }, 0);
  assert.ok(far[0] > 0 && far[0] < 1 && far[1] > 0 && far[1] < 1);
  assert.deepEqual(F.boardPoint(0.2, 0.7, true), [0.7, 0.2]);
  assert.equal(F.linkKey('b', 'a'), F.linkKey('a', 'b'));
  assert.match(F.stringPath(10, 10, 30, 10), /^M10 10Q20 12\.4 30 10$/, 'the string sags by 12% of its length');
});

test('grade filters are CSS filter strings', () => {
  assert.equal(F.gradeFilter(undefined), 'none');
  assert.match(F.gradeFilter('freeze'), /grayscale/);
});

test('store: shallow-merge, notify only on change, unsubscribe', () => {
  const store = S.createStoryStore(S.emptyStoryUiView());
  let calls = 0;
  const off = store.subscribe(() => calls++);
  const toasts = store.get().toasts;
  store.set({ toasts });
  assert.equal(calls, 0, 'same reference: no notification');
  store.set({ toasts: [{ seq: 1, kind: 'info', title: 'x' }] });
  assert.equal(calls, 1);
  store.set((s) => ({ talk: [...s.talk] }));
  assert.equal(calls, 2);
  off();
  store.set({ talk: [] });
  assert.equal(calls, 2);
});

test('settings: defaults, sanitising and blocked storage', () => {
  assert.deepEqual(S.loadSettings(null), S.DEFAULT_SETTINGS);
  const mem = { v: '', getItem() { return this.v; }, setItem(_k, v) { this.v = v; } };
  mem.v = JSON.stringify({ subtitleSize: 'L', subtitleBg: 7, readSpeed: 'warp', reduceFlash: true, cones: 'always' });
  const s = S.loadSettings(mem);
  assert.equal(s.subtitleSize, 'L');
  assert.equal(s.subtitleBg, S.DEFAULT_SETTINGS.subtitleBg, 'out of range falls back');
  assert.equal(s.readSpeed, 'normal');
  assert.equal(s.reduceFlash, true);
  assert.equal(s.cones, 'always');
  mem.v = '{broken';
  assert.deepEqual(S.loadSettings(mem), S.DEFAULT_SETTINGS);
  assert.equal(S.saveSettings({ setItem() { throw new Error('blocked'); } }, s), false);
  assert.equal(S.saveSettings(mem, s), true);
  assert.equal(JSON.parse(mem.v).subtitleSize, 'L');
});

test('every preview scene builds a complete view', () => {
  for (const { id } of M.SCENES) {
    const v = M.mockScene(id);
    for (const k of ['cine', 'talk', 'objective', 'prompt', 'stealth', 'phone', 'journal', 'board', 'cctv', 'interrogation', 'menu', 'pause', 'result', 'toasts', 'touch', 'settings']) assert.ok(k in v, `${id}.${k}`);
  }
});

test('mock board: correct links, a wrong link shakes and costs a token, solving opens the deduction', () => {
  let v = M.mockScene('board');
  const before = v.board.links.length;
  v = M.mockReduce(v, { type: 'board', op: 'link', a: 'kho7', b: 'receipt-ad' });
  assert.equal(v.board.links.length, before + 1);
  v = M.mockReduce(v, { type: 'board', op: 'link', a: 'phuong-voice', b: 'debt-notice' });
  assert.equal(v.board.hintTokens, 1);
  assert.deepEqual(v.board.shake.ids, ['phuong-voice', 'debt-notice']);
  v = M.mockReduce(v, { type: 'board', op: 'propose', hyp: 'h-loan', cards: ['debt-notice', 'receipt-ad', 'ledger-mai'] });
  assert.equal(v.board.hypotheses.find((h) => h.id === 'h-loan').state, 'proven');
  for (const [a, b] of M.BOARD_LINKS) v = M.mockReduce(v, { type: 'board', op: 'link', a, b });
  assert.equal(v.board.solved, true);
  assert.ok(v.board.deduction);
  v = M.mockReduce(v, { type: 'board', op: 'deduce', id: 'blank-orders', option: 'bug' });
  assert.deepEqual(v.board.deduction.wrong, ['bug']);
  v = M.mockReduce(v, { type: 'board', op: 'deduce', id: 'blank-orders', option: 'gl04' });
  assert.equal(v.board.deduction.answered, 'gl04');
});

test('mock CCTV: a mark inside an event window is found once; elsewhere it is not', () => {
  let v = M.mockScene('cctv');
  const n = v.cctv.found.length;
  v = M.mockReduce(v, { type: 'cctv', op: 'mark', t: 100, zoom: null });
  assert.equal(v.cctv.found.length, n);
  assert.equal(v.cctv.feedback.ok, false);
  v = M.mockReduce(v, { type: 'cctv', op: 'mark', t: 680, zoom: null });
  assert.equal(v.cctv.found.length, n + 1);
  v = M.mockReduce(v, { type: 'cctv', op: 'mark', t: 690, zoom: null });
  assert.equal(v.cctv.found.length, n + 1, 'the same moment is not counted twice');
});

test('mock interrogation: a wrong card means silence, never a fail; the truth needs empathy', () => {
  let v = M.mockScene('interrogation');
  v = M.mockReduce(v, { type: 'interrogation', op: 'present', evidence: 'note-hoa', approach: 'accuse' });
  assert.ok(v.interrogation.shut && v.interrogation.shut.seconds > 0);
  assert.equal(v.interrogation.outcome, null);
  v = M.mockReduce(v, { type: 'interrogation', op: 'present', evidence: 'mai-bag', approach: 'accuse' });
  assert.equal(v.interrogation.statements.filter((s) => s.state === 'broken').length, 2);
  v = M.mockReduce(v, { type: 'interrogation', op: 'present', evidence: 'file-2014', approach: 'accuse' });
  assert.equal(v.interrogation.outcome, null, 'accusing someone who tells the truth does not settle it');
  v = M.mockReduce(v, { type: 'interrogation', op: 'present', evidence: 'file-2014', approach: 'empathy' });
  assert.equal(v.interrogation.outcome, 'talks');
});

test('mock text is natural NFC Vietnamese and uses no real courier or bank brand', async () => {
  const text = JSON.stringify(M.SCENES.map(({ id }) => M.mockScene(id)));
  assert.equal(text, text.normalize('NFC'));
  assert.doesNotMatch(text, /GiaoNhanh|Giao Hàng Nhanh|Phương Nam/);
  // the runner's lint list (retired GN- codes, real vehicle models) and the decided names (story-decisions.md 14)
  const { FORBIDDEN_BRANDS } = await import('../app/game/story/runner.ts');
  for (const b of FORBIDDEN_BRANDS) assert.doesNotMatch(text, b);
  assert.equal(M.MOCK_APP, 'ĐơnƠi');
  assert.match(text, /DO-04\d\d/);
  assert.ok(M.CAST.bana && !M.CAST.ma, 'Má is cast id bana, as in the chapter content');
});
