import { defineChapter, defineMission, type Act, type BoardCard, type CastDef, type Cond, type EvidenceDef, type JournalDef, type Line, type WorldPolicy } from '../types.ts';
import { TEXT } from '../text/vi/ch01.ts';

/**
 * Chương 1 · LÊN PHỐ (story-final.md ch.1, story-decisions.md): c1-m1 the coach and the attic, c1-m2 the first
 * orders and Ông Tư's plate test, c1-m3 the debt call, the rain rush, Bà Sáu and the crouch tutorial past Mực.
 * Every place is a story/sites.ts site or spot ('cafe-co-ba.backStairs') or an anchor of an off-map space
 * ('attic/desk', declared in ANCHORS); every text is an '@key' of text/vi/ch01.ts (brands in text/vi/common.ts,
 * loaded with the campaign index, so {@app} is one line). Cutscenes are data in cutscenes/ch01.ts. Register in content/index.ts LOADERS:
 * `1: () => import('./ch01.ts'),`.
 *
 * Engine ids used here (story/contract.ts, requests to their owners): outfits 'tin-que' (village tee, duffel) and
 * 'tin-shipper' (orange {@app} windbreaker, box pack, half helmet); vehicles 'dream' (the player's own bike, core)
 * and 'coach'; templates 'watchdog' (Mực), 'resident'; `do` ops 'appOrder' (phone order card, args carry '@keys'
 * to resolve with runner.text; order ids are engine ids, the shown code is in the text), 'bike' (Dream look:
 * battered → revived) and 'gps' (guide line along a route site); core query 'viewTurned' and core signal 'ranRed'.
 * Chapter 1 is the Wave 1 acceptance (c1-m2 end to end), so it waits only on core queries.
 */

const H = Math.PI / 2;
/** Mission policy: no hub activities (gun store, bank, deck, rental, side jobs, filler orders) while a story mission runs. */
const NO_HUB: WorldPolicy['activities'] = { gunStore: false, bank: false, deck: false, boatRental: false, sideJobs: false, orders: false };
const say = (who: string, key: string, o: Omit<Line, 'who' | 'text'> = {}): Line => ({ who, text: `@${key}`, ...o });
const think = (key: string, o: Omit<Line, 'who' | 'text' | 'voice'> = {}): Line => say('tin', key, { voice: 'think', ...o });
const talk = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines });
const aside = (id: string, lines: Line[]): Act => ({ k: 'dialogue', id, lines, mode: 'ambient' });
const hint = (key: string, ms?: number): Act => (ms ? { k: 'hint', text: `@${key}`, ms } : { k: 'hint', text: `@${key}` });
const reach = (at: string, r = 3): Cond => ({ k: 'reach', at, r });
const used = (id: string): Cond => ({ k: 'on', ev: 'interact', id });
const flag = (name: string, eq?: boolean | string): Cond => (eq === undefined ? { k: 'flag', name } : { k: 'flag', name, eq });
/**
 * Teleport (onto `vehicle` if given) only when the player is not already there, on that surface `level` (null: the
 * ground): a no-op on the normal path, the reset on a restore. Vehicle puts use bike-clear curb spots (sites.ts).
 */
const put = (at: string, vehicle?: string, r = 8, level: string | null = null): Act =>
  ({ k: 'if', c: { k: 'reach', at, r, level }, then: [], else: [vehicle ? { k: 'teleport', at, vehicle } : { k: 'teleport', at }] });
/** Cô Ba hears about the n-th red light the player runs this mission (engine signal 'ranRed', one per violation). */
const ranRed = (n: number): Cond => ({ k: 'on', ev: 'signal', id: 'ranRed', scope: 'mission', n });
const order = (id: string, title: string, from: string, to: string, fee: number, state = 'active'): Act => ({ k: 'do', op: 'appOrder', args: { id, state, title: `@${title}`, from, to, fee } });

// ---- c1-m1 · Chuyến xe đò sáng sớm ----------------------------------------------------------------------------

const c1m1 = defineMission({
  id: 'c1-m1',
  start: { at: 'ben-xe-an-hoa', yaw: H, hour: 6, weather: 'rain', lunar: 23, outfit: 'tin-que' },
  world: { traffic: 'light', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 6, freeze: true }, weather: { set: 'rain', lock: true }, activities: NO_HUB },
  setup: [
    { k: 'vehicle', id: 'xe-do', model: 'coach', at: 'ben-xe-an-hoa.coach', yaw: -H, state: 'park' },
    { k: 'spawn', id: 'quang', cast: 'quang', at: 'cafe-co-ba.quangTable', team: 'ally', behaviour: { k: 'act', name: 'sit-stool-phone' } },
    { k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba.pickup', team: 'ally', behaviour: { k: 'act', name: 'kettle-pour' } },
    { k: 'spawn', id: 'muc', template: 'watchdog', at: 'cafe-co-ba.backStairs', team: 'neutral', behaviour: { k: 'act', name: 'sleep' } },
  ],
  steps: [
    { id: 'mo-dau', minutes: 1.3, enter: [{ k: 'cutscene', id: 'cs01_mo_dau' }, { k: 'player', carry: 'duffel', lock: ['run', 'vehicle', 'fire'] }] },
    {
      id: 'lam-quen', minutes: 0.5, objective: '@c1m1.obj.lamQuen',
      subs: [
        { id: 'di', text: '@c1m1.sub.di', done: { k: 'hold', c: { k: 'player', prop: 'speed', op: '>', value: 0.5 }, seconds: 1.5 } },
        { id: 'xoay', text: '@c1m1.sub.xoay', done: { k: 'q', name: 'viewTurned' } },
      ],
      enter: [hint('c1m1.hint.di'), { k: 'vehicle', id: 'xe-do', state: 'drive', cruise: 8 }],
      watchers: [{ when: { k: 'after', seconds: 6 }, do: [hint('c1m1.hint.tui')] }],
    },
    {
      id: 'quang-goi', minutes: 0.4,
      enter: [
        { k: 'call', id: 'c1m1-quang-goi', from: 'quang', ring: true, lines: [
          say('quang', 'c1m1.call.q1'), say('tin', 'c1m1.call.t1'), say('quang', 'c1m1.call.q2'), say('quang', 'c1m1.call.q3'), say('tin', 'c1m1.call.t2')] },
        { k: 'unlock', ability: 'phone', label: '@c1m1.unlock.phone' },
      ],
    },
    {
      id: 've-quan', minutes: 1.2, objective: '@c1m1.obj.veQuan', marker: { at: 'cafe-co-ba.quangTable', label: '@c1m1.mk.cafe', style: 'go' },
      enter: [hint('c1m1.hint.map'), { k: 'do', op: 'gps', args: { route: 'r-ve-nha' } }],
      watchers: [
        { when: { k: 'after', seconds: 8 }, do: [aside('c1m1-pho-1', [think('c1m1.think.pho1')])] },
        { when: { k: 'after', seconds: 26 }, do: [aside('c1m1-pho-2', [think('c1m1.think.pho2')])] },
        { when: reach('cafe-co-ba', 35), do: [aside('c1m1-pho-3', [think('c1m1.think.pho3')])] },
      ],
      done: reach('cafe-co-ba.quangTable', 4),
    },
    {
      id: 'ban-quang', minutes: 1.3, objective: '@c1m1.obj.banQuang', marker: { at: 'cafe-co-ba.quangTable', style: 'talk' },
      interact: [{ id: 'ngoi-quang', at: 'cafe-co-ba.quangTable', r: 2, prompt: '@c1m1.int.ngoi', kind: 'seat', when: 'foot' }],
      done: used('ngoi-quang'),
      exit: [
        { k: 'player', carry: null, pose: 'sit-stool' },
        talk('c1m1-quang', [
          say('quang', 'c1m1.quang1'), say('tin', 'c1m1.tin1'), say('quang', 'c1m1.quang2'), say('tin', 'c1m1.tin2'),
          say('quang', 'c1m1.quang3'), say('quang', 'c1m1.quang4'), say('tin', 'c1m1.tin3'), say('quang', 'c1m1.quang5')]),
        { k: 'behave', id: 'coba', b: { k: 'goto', at: 'cafe-co-ba.quangTable' } },
        talk('c1m1-coba', [say('coba', 'c1m1.coba1'), say('quang', 'c1m1.quang6'), say('coba', 'c1m1.coba2'), say('tin', 'c1m1.tin4')]),
        { k: 'choice', id: 'caPhe', prompt: '@c1m1.q.caPhe', timeout: 12, default: 'sua', options: [
          { id: 'sua', text: '@c1m1.opt.sua' }, { id: 'den', text: '@c1m1.opt.den' }] },
        talk('c1m1-ca-phe', [say('coba', 'c1m1.coba.sua', { if: flag('choice:caPhe', 'sua') }), say('coba', 'c1m1.coba.den', { if: flag('choice:caPhe', 'den') })]),
        talk('c1m1-gac', [
          say('coba', 'c1m1.coba3'), say('tin', 'c1m1.tin5'), say('coba', 'c1m1.coba4'), say('coba', 'c1m1.coba5'), say('tin', 'c1m1.tin6'),
          say('coba', 'c1m1.coba6'), say('coba', 'c1m1.coba6b'), say('coba', 'c1m1.coba7'), say('quang', 'c1m1.quang7')]),
        { k: 'player', pose: null, carry: 'duffel' },
        { k: 'journal', id: 'j-quang' }, { k: 'journal', id: 'j-coba' },
      ],
    },
    {
      id: 'cua-sau', minutes: 0.4, objective: '@c1m1.obj.cuaSau', marker: { at: 'cafe-co-ba.backStairs', label: '@c1m1.mk.cuaSau', style: 'go' },
      interact: [{ id: 'len-gac', at: 'cafe-co-ba.backStairs', r: 1.8, prompt: '@c1m1.int.lenGac', kind: 'enter', when: 'foot' }],
      enter: [{ k: 'behave', id: 'quang', b: { k: 'goto', at: 'cafe-co-ba.pickup' } }, { k: 'behave', id: 'coba', b: { k: 'goto', at: 'cafe-co-ba' } }],
      watchers: [{ when: reach('cafe-co-ba.backStairs', 6), do: [aside('c1m1-muc', [think('c1m1.think.muc')])] }],
      done: used('len-gac'),
    },
    {
      id: 'gac-xep', minutes: 1, objective: '@c1m1.obj.gacXep',
      checkpoint: { label: '@c1m1.cp.gac', setup: [{ k: 'space', enter: 'attic', link: 'stairs' }, { k: 'player', carry: 'duffel', lock: ['run', 'vehicle', 'fire'] }] },
      subs: [
        { id: 'tui', text: '@c1m1.sub.tui', done: used('de-tui') },
        { id: 'hinh', text: '@c1m1.sub.hinh', done: used('ghim-hinh') },
        { id: 'cua-so', text: '@c1m1.sub.cuaSo', done: { k: 'on', ev: 'cutscene', id: 'c1m1-cua-so' } },
      ],
      interact: [
        { id: 'de-tui', at: 'attic/desk', r: 1.5, prompt: '@c1m1.int.deTui', kind: 'use' },
        { id: 'ghim-hinh', at: 'attic/wall', r: 1.5, prompt: '@c1m1.int.ghimHinh', kind: 'use' },
        { id: 'cua-so', at: 'attic/window', r: 1.5, prompt: '@c1m1.int.cuaSo', kind: 'examine' },
      ],
      watchers: [
        { when: used('de-tui'), do: [{ k: 'player', carry: null, lock: null }, { k: 'prop', id: 'tui-xach', kind: 'duffel', at: 'attic/desk' }, aside('c1m1-tui', [think('c1m1.think.tui')])] },
        { when: used('ghim-hinh'), do: [{ k: 'prop', id: 'hinh-ma-mai', kind: 'photo-pinned', at: 'attic/wall' }, aside('c1m1-hinh', [think('c1m1.think.hinh')])] },
        { when: used('cua-so'), do: [{ k: 'cutscene', id: 'c1m1-cua-so' }] },
      ],
      // the watchers give instant feedback; the exit makes sure the bag and photo are put down even when the last
      // sub completes in the same tick as its watcher (step-scoped watcher queues end with the step)
      exit: [{ k: 'player', carry: null, lock: null }, { k: 'prop', id: 'tui-xach', kind: 'duffel', at: 'attic/desk' }, { k: 'prop', id: 'hinh-ma-mai', kind: 'photo-pinned', at: 'attic/wall' }],
    },
    {
      id: 'ngu', minutes: 0.3, objective: '@c1m1.obj.ngu',
      interact: [{ id: 'ngu', at: 'attic/mattress', r: 1.5, prompt: '@c1m1.int.ngu', kind: 'use' }],
      done: used('ngu'),
      exit: [{ k: 'player', pose: 'sleep' }, talk('c1m1-ngu', [think('c1m1.think.ngu')]), { k: 'fade', to: 'black', ms: 1200 }, { k: 'journal', id: 'j-ngay-dau' }, { k: 'player', pose: null }, { k: 'fade', to: 'clear', ms: 900 }],
    },
  ],
  // Má's envelope (CS01) is his whole start: counted in the condensed-milk can in c1-m3
  rewards: [{ k: 'cash', n: 1000 }, { k: 'flag', name: 'arrived' }],
  medals: { par: 330 },
});

// ---- c1-m2 · Đơn hàng đầu tiên --------------------------------------------------------------------------------

const c1m2 = defineMission({
  id: 'c1-m2', meta: { hours: [6, 11], giver: 'quang' },
  start: { at: 'cafe-co-ba.pickup', yaw: 0, hour: 8, weather: 'clear', lunar: 24, outfit: 'tin-que' },
  world: { traffic: 'normal', crowd: 'normal', police: 'story', gangs: 'calm', clock: { hour: 8, freeze: true }, weather: { set: 'clear', lock: true }, activities: NO_HUB },
  setup: [
    { k: 'spawn', id: 'tu', cast: 'tu', at: 'xe-may-ong-tu', team: 'ally', behaviour: { k: 'act', name: 'fix-bike' } },
    { k: 'vehicle', id: 'dream', model: 'dream', at: 'xe-may-ong-tu.tarp', yaw: H, state: 'park' },
    { k: 'if', c: flag('dreamRevived'), then: [{ k: 'do', op: 'bike', args: { id: 'dream', look: 'revived' } }], else: [{ k: 'do', op: 'bike', args: { id: 'dream', look: 'battered' } }] },
  ],
  // one text per red light, three at most: a warning, a second warning, then she gives up and tells Má
  watchers: [
    { id: 'den-do-1', when: ranRed(1), do: [{ k: 'sms', from: 'coba', text: '@c1m2.sms.denDo' }] },
    { id: 'den-do-2', when: ranRed(2), do: [{ k: 'sms', from: 'coba', text: '@c1m2.sms.denDo2' }] },
    { id: 'den-do-3', when: ranRed(3), do: [{ k: 'sms', from: 'coba', text: '@c1m2.sms.denDo3' }] },
  ],
  steps: [
    {
      id: 'di-cung-quang', minutes: 0.8, objective: '@c1m2.obj.diCung', marker: { at: 'xe-may-ong-tu', label: '@c1m2.mk.tiem', style: 'go' },
      enter: [
        { k: 'spawn', id: 'quang', cast: 'quang', at: 'cafe-co-ba.pickup', team: 'ally', behaviour: { k: 'goto', at: 'xe-may-ong-tu' } },
        aside('c1m2-di', [say('quang', 'c1m2.walk1'), say('quang', 'c1m2.walk2'), say('tin', 'c1m2.walk3'), say('quang', 'c1m2.walk4')]),
      ],
      done: reach('xe-may-ong-tu', 6),
    },
    { id: 'tiem', minutes: 0.8, enter: [{ k: 'cutscene', id: 'c1m2-tiem' }, { k: 'journal', id: 'j-ong-tu' }] },
    {
      id: 'bien-so', minutes: 0.6, objective: '@c1m2.obj.bienSo', next: 'ao-shipper',
      enter: [
        { k: 'cutscene', id: 'c1m2-bien-so' },
        { k: 'choice', id: 'bienSo', prompt: '@c1m2.q.bienSo', style: 'plate', options: [
          { id: 'a', text: '@c1m2.opt.bs1', set: { plateMissed: true } },
          { id: 'b', text: '@c1m2.opt.bs2', set: { plateRight: true } },
          { id: 'c', text: '@c1m2.opt.bs3', set: { plateMissed: true } }] },
      ],
      branch: [{ when: { k: 'all', of: [{ k: 'on', ev: 'choice', id: 'bienSo' }, { k: 'not', c: flag('plateRight') }] }, goto: 'bien-so-lai' }],
      done: flag('plateRight'),
      exit: [{ k: 'cutscene', id: 'c1m2-mat-tot' }],
    },
    { id: 'bien-so-lai', minutes: 0.2, next: 'bien-so', enter: [talk('c1m2-sai', [say('tu', 'c1m2.tu.sai1'), say('tu', 'c1m2.tu.sai2')])] },
    {
      id: 'ao-shipper', minutes: 0.5,
      enter: [
        { k: 'do', op: 'bike', args: { id: 'dream', look: 'revived' } }, { k: 'flag', name: 'dreamRevived' },
        talk('c1m2-ao', [say('quang', 'c1m2.ao1'), say('quang', 'c1m2.ao2'), say('quang', 'c1m2.ao3'), say('tin', 'c1m2.ao4'), say('quang', 'c1m2.ao5'), say('tu', 'c1m2.ao6')]),
        { k: 'player', outfit: 'tin-shipper' },
        { k: 'unlock', outfit: 'tin-shipper', label: '@c1m2.unlock.ao' },
        { k: 'unlock', ability: 'appOrders', label: '@c1m2.unlock.app' },
      ],
    },
    {
      id: 'chay-thu', minutes: 0.4, objective: '@c1m2.obj.chayThu',
      subs: [
        { id: 'len-xe', text: '@c1m2.sub.lenXe', done: { k: 'mode', is: 'bike' } },
        { id: 'ga', text: '@c1m2.sub.ga', done: { k: 'hold', c: { k: 'player', prop: 'speed', op: '>', value: 3 }, seconds: 2 } },
      ],
      enter: [hint('c1m2.hint.lenXe')],
      watchers: [{ when: { k: 'mode', is: 'bike' }, do: [hint('c1m2.hint.den', 6000)] }],
    },
    {
      id: 'phanh', minutes: 0.2, objective: '@c1m2.obj.phanh', enter: [hint('c1m2.hint.phanh')],
      done: { k: 'hold', c: { k: 'all', of: [{ k: 'mode', is: 'bike' }, { k: 'player', prop: 'speed', op: '<', value: 0.5 }] }, seconds: 1 },
    },
    {
      id: 'lay-1', minutes: 0.4, objective: '@c1m2.obj.lay1', marker: { at: 'banh-mi', label: '@c1m2.mk.banhMi', style: 'go' },
      interact: [{ id: 'lay-banh-mi', at: 'banh-mi', r: 2.5, prompt: '@c1m2.int.lay', kind: 'pick', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'co-banh-mi', cast: 'banhmi', at: 'banh-mi', team: 'neutral', behaviour: { k: 'act', name: 'serve' } },
        { k: 'toast', text: '@c1m2.toast.don1' }, order('don-1203', 'c1m2.order.1', 'banh-mi', 'van-phong', 25),
      ],
      done: used('lay-banh-mi'),
      exit: [aside('c1m2-banh-mi', [say('banhmi', 'c1m2.banhMi')]), { k: 'player', carry: 'order-banh-mi' }],
    },
    {
      id: 'giao-1', minutes: 0.9, objective: '@c1m2.obj.giao1', marker: { at: 'van-phong', label: '@c1m2.mk.vanPhong', style: 'go' },
      checkpoint: { label: '@c1m2.cp.don1', setup: [
        put('banh-mi.curb', 'dream'), { k: 'player', carry: 'order-banh-mi' },
        { k: 'spawn', id: 'khach-vp', cast: 'khach-vp', at: 'van-phong', team: 'neutral', behaviour: { k: 'act', name: 'desk-head-down' } }] },
      timer: { seconds: 120, label: '@c1m2.timer.don', fail: '@c1m2.fail.tre' },
      interact: [{ id: 'giao-banh-mi', at: 'van-phong', r: 2.5, prompt: '@c1m2.int.giao', kind: 'use', when: 'foot' }],
      done: used('giao-banh-mi'),
      // the receptionist never looks up: nobody sees a shipper (the VỎ BỌC SHIPPER of c2-m1 starts here)
      exit: [{ k: 'player', carry: null }, aside('c1m2-vp', [say('khach-vp', 'c1m2.vp1'), say('tin', 'c1m2.vp2'), think('c1m2.think.vp')]), { k: 'toast', text: '@c1m2.toast.nhan' }],
    },
    {
      id: 'lay-2', minutes: 0.4, objective: '@c1m2.obj.lay2', marker: { at: 'tiem-hoa', label: '@c1m2.mk.tiemHoa', style: 'go' },
      interact: [{ id: 'lay-hoa', at: 'tiem-hoa', r: 2.5, prompt: '@c1m2.int.lay', kind: 'pick', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'chi-hoa', cast: 'tiemhoa', at: 'tiem-hoa', team: 'neutral', behaviour: { k: 'act', name: 'arrange-flowers' } },
        { k: 'toast', text: '@c1m2.toast.don2' }, order('don-1207', 'c1m2.order.2', 'tiem-hoa', 'benh-vien', 30),
      ],
      done: used('lay-hoa'),
      exit: [aside('c1m2-hoa', [say('tiemhoa', 'c1m2.tiemHoa')]), { k: 'player', carry: 'order-hoa' }],
    },
    {
      id: 'giao-2', minutes: 0.8, objective: '@c1m2.obj.giao2', marker: { at: 'benh-vien', label: '@c1m2.mk.benhVien', style: 'go' },
      checkpoint: { label: '@c1m2.cp.don2', setup: [
        put('tiem-hoa.curb', 'dream'), { k: 'player', carry: 'order-hoa' },
        { k: 'spawn', id: 'khach-bv', cast: 'khach-bv', at: 'benh-vien', team: 'neutral', behaviour: { k: 'act', name: 'pace-happy' } }] },
      timer: { seconds: 120, label: '@c1m2.timer.don', fail: '@c1m2.fail.tre' },
      interact: [{ id: 'giao-hoa', at: 'benh-vien', r: 2.5, prompt: '@c1m2.int.giao', kind: 'use', when: 'foot' }],
      done: used('giao-hoa'),
      exit: [{ k: 'player', carry: null }, aside('c1m2-bv', [say('khach-bv', 'c1m2.bv1'), say('tin', 'c1m2.bv2'), say('khach-bv', 'c1m2.bv3')]), { k: 'toast', text: '@c1m2.toast.tip' }],
    },
    {
      id: 'lay-3', minutes: 0.3, objective: '@c1m2.obj.lay3', marker: { at: 'pho-nong', label: '@c1m2.mk.pho', style: 'go' },
      interact: [{ id: 'lay-pho', at: 'pho-nong', r: 2.5, prompt: '@c1m2.int.lay', kind: 'pick', when: 'foot' }],
      enter: [
        { k: 'spawn', id: 'chu-pho', cast: 'chupho', at: 'pho-nong', team: 'neutral', behaviour: { k: 'act', name: 'ladle' } },
        { k: 'toast', text: '@c1m2.toast.don3' }, order('don-1211', 'c1m2.order.3', 'pho-nong', 'nha-khach-pho', 35),
      ],
      done: used('lay-pho'),
      exit: [aside('c1m2-pho', [say('chupho', 'c1m2.chuPho')]), { k: 'player', carry: 'order-pho' }],
    },
    {
      id: 'giao-3', minutes: 0.6, objective: '@c1m2.obj.giao3', marker: { at: 'nha-khach-pho', label: '@c1m2.mk.nha48', style: 'go' },
      checkpoint: { label: '@c1m2.cp.don3', setup: [
        put('pho-nong.curb', 'dream'), { k: 'player', carry: 'order-pho' },
        { k: 'spawn', id: 'khach-pho', cast: 'khach-pho', at: 'nha-khach-pho', team: 'neutral', behaviour: { k: 'idle' } }] },
      timer: { seconds: 90, label: '@c1m2.timer.pho', fail: '@c1m2.fail.nguoi' },
      interact: [{ id: 'giao-pho', at: 'nha-khach-pho', r: 2.5, prompt: '@c1m2.int.giao', kind: 'use', when: 'foot' }],
      done: used('giao-pho'),
      exit: [{ k: 'player', carry: null }, aside('c1m2-k-pho', [say('khach-pho', 'c1m2.kp1'), say('khach-pho', 'c1m2.kp2')]), { k: 'toast', text: '@c1m2.toast.sao' }],
    },
    {
      id: 've-tiem', minutes: 0.5, objective: '@c1m2.obj.veTiem', marker: { at: 'xe-may-ong-tu', label: '@c1m2.mk.tiem', style: 'go' },
      enter: [{ k: 'spawn', id: 'quang', cast: 'quang', at: 'xe-may-ong-tu', team: 'ally', behaviour: { k: 'act', name: 'sit-stool-phone' } }],
      done: reach('xe-may-ong-tu', 6),
      exit: [
        order('don-0409', 'c1m2.order.blank', 'nha-thuoc', 'motel-hoa-hong', 150, 'offer'),
        { k: 'cutscene', id: 'c1m2-quang-giat' },
        { k: 'do', op: 'appOrder', args: { id: 'don-0409', state: 'taken' } },
        { k: 'evidence', id: 'ev-don-dem-quang' }, { k: 'flag', name: 'sawBlankOrder' },
        aside('c1m2-cuoi', [think('c1m2.think.cuoi')]),
      ],
    },
  ],
  rewards: [{ k: 'cash', n: 120 }],
  medals: { par: 330 },
  replay: { abilities: ['phone'] },
});

// ---- c1-m3 · Bốn mươi triệu -----------------------------------------------------------------------------------

const late: Cond = { k: 'var', name: 'late', op: '==', value: true };
const c1m3 = defineMission({
  id: 'c1-m3', meta: { hours: [17, 21], giver: 'coba' },
  start: { at: 'cafe-co-ba.pickup', yaw: 0, vehicle: 'dream', hour: 18.4, weather: 'rain', lunar: 24, outfit: 'tin-shipper' },
  world: { traffic: 'normal', crowd: 'thin', police: 'story', gangs: 'calm', clock: { hour: 18.4, freeze: true }, weather: { set: 'rain', lock: true }, activities: NO_HUB },
  watchers: [{ id: 'ba-sau', when: { k: 'all', of: [reach('ba-sau-nga', 28), { k: 'not', c: flag('helpedBaSau') }, { k: 'not', c: late }] }, do: [hint('c1m3.hint.baSau', 5000)] }],
  optional: [{
    id: 'giup-ba-sau', text: '@c1m3.opt.baSau', when: { k: 'on', ev: 'interact', id: 'do-xe-ba-sau', scope: 'mission' },
    reward: [
      { k: 'flag', name: 'helpedBaSau' }, { k: 'journal', id: 'j-ba-sau' },
      { k: 'prop', id: 'xe-ba-sau', kind: 'scooter', variant: 'upright', at: 'ba-sau-nga' }, { k: 'prop', id: 'noi-che', remove: true },
      { k: 'behave', id: 'basau', b: { k: 'act', name: 'stand-bow' } },
      aside('c1m3-ba-sau', [say('basau', 'c1m3.bs1'), say('tin', 'c1m3.bs2'), say('basau', 'c1m3.bs3'), say('basau', 'c1m3.bs4'), say('tin', 'c1m3.bs5'), say('basau', 'c1m3.bs6')]),
    ],
  }],
  steps: [
    { id: 'goi-ma', minutes: 0.8, enter: [{ k: 'cutscene', id: 'c1m3-goi-ma' }, { k: 'journal', id: 'j-no' }] },
    {
      id: 'nhan-don', minutes: 0.5, objective: '@c1m3.obj.nhanDon',
      checkpoint: { label: '@c1m3.cp.mua', setup: [
        put('cafe-co-ba.pickup', 'dream'),
        { k: 'spawn', id: 'coba', cast: 'coba', at: 'cafe-co-ba.pickup', team: 'ally', behaviour: { k: 'act', name: 'hold-bags' } },
        { k: 'spawn', id: 'basau', cast: 'basau', at: 'ba-sau-nga', team: 'neutral', tags: ['civilian'], behaviour: { k: 'act', name: 'sit-ground-rub-knee' } },
        { k: 'prop', id: 'xe-ba-sau', kind: 'scooter', variant: 'fallen', at: 'ba-sau-nga' },
        { k: 'prop', id: 'noi-che', kind: 'che-pots-spilled', at: 'ba-sau-nga' }] },
      enter: [
        talk('c1m3-coba', [say('coba', 'c1m3.coba1'), say('coba', 'c1m3.coba2'), say('coba', 'c1m3.coba2b'), say('coba', 'c1m3.coba3', { if: flag('choice:caPhe', 'sua') }), say('coba', 'c1m3.coba3b', { if: flag('choice:caPhe', 'den') })]),
        { k: 'player', carry: 'order-mua' }, { k: 'toast', text: '@c1m3.toast.don' },
        order('don-1302', 'c1m3.order.1', 'cafe-co-ba', 'mua-1', 30), order('don-1303', 'c1m3.order.2', 'cafe-co-ba', 'mua-2', 30), order('don-1305', 'c1m3.order.3', 'cafe-co-ba', 'mua-3', 35),
        { k: 'behave', id: 'coba', b: { k: 'goto', at: 'cafe-co-ba' } },
        { k: 'interactable', id: 'do-xe-ba-sau', at: 'ba-sau-nga', r: 2.5, hold: 4, prompt: '@c1m3.int.baSau', kind: 'use', when: 'foot', scope: 'mission' },
        // about 75 s of riding and handing over; Bà Sáu costs about 20 s of the slack
        { k: 'timer', id: 'mua', seconds: 130, label: '@c1m3.timer', fail: '@c1m3.fail.tre' },
      ],
    },
    {
      id: 'giao-1', minutes: 0.5, objective: '@c1m3.obj.giao1', marker: { at: 'mua-1', label: '@c1m3.mk.mua1', style: 'go' },
      enter: [{ k: 'spawn', id: 'khach-1', cast: 'khach', template: 'resident', at: 'mua-1', team: 'neutral' }],
      interact: [{ id: 'giao-mua-1', at: 'mua-1', r: 2.5, prompt: '@c1m3.int.giao', kind: 'use', when: 'foot' }],
      done: used('giao-mua-1'), exit: [aside('c1m3-k1', [say('khach', 'c1m3.khach1')])],
    },
    {
      id: 'giao-2', minutes: 0.5, objective: '@c1m3.obj.giao2', marker: { at: 'mua-2', label: '@c1m3.mk.mua2', style: 'go' },
      enter: [{ k: 'spawn', id: 'khach-2', cast: 'khach', template: 'resident', at: 'mua-2', team: 'neutral' }, hint('c1m3.hint.ngap', 5000)],
      interact: [{ id: 'giao-mua-2', at: 'mua-2', r: 2.5, prompt: '@c1m3.int.giao', kind: 'use', when: 'foot' }],
      done: used('giao-mua-2'), exit: [aside('c1m3-k2', [say('khach', 'c1m3.khach2')])],
    },
    {
      id: 'giao-3', minutes: 0.7, objective: '@c1m3.obj.giao3', marker: { at: 'mua-3', label: '@c1m3.mk.mua3', style: 'go' },
      enter: [{ k: 'spawn', id: 'khach-3', cast: 'khach', template: 'resident', at: 'mua-3', team: 'neutral' }],
      interact: [{ id: 'giao-mua-3', at: 'mua-3', r: 2.5, prompt: '@c1m3.int.giao', kind: 'use', when: 'foot' }],
      done: used('giao-mua-3'), exit: [aside('c1m3-k3', [say('khach', 'c1m3.khach3')])],
    },
    {
      id: 've-nha', minutes: 0.6, objective: '@c1m3.obj.veNha', marker: { at: 'cafe-co-ba.dream', label: '@c1m3.mk.cuaSau', style: 'go' },
      enter: [
        { k: 'stopTimer', id: 'mua' }, { k: 'uninteract', id: 'do-xe-ba-sau' }, { k: 'var', name: 'late', value: true },
        { k: 'player', carry: null }, { k: 'cash', n: 230 },
        { k: 'fade', to: 'black', ms: 800 },
        { k: 'despawn', id: 'basau' }, { k: 'prop', id: 'xe-ba-sau', remove: true }, { k: 'prop', id: 'noi-che', remove: true },
        { k: 'time', hour: 23.17 }, { k: 'world', policy: { traffic: 'night', crowd: 'night' } },
        { k: 'title', kind: 'time', text: '@c1m3.title.late', sub: '@c1m3.title.lateSub' },
        { k: 'fade', to: 'clear', ms: 800 },
        aside('c1m3-tre', [think('c1m3.think.tre1'), think('c1m3.think.tre2')]),
      ],
      done: reach('cafe-co-ba.dream', 4),
    },
    {
      id: 'ron-ren', minutes: 0.8, objective: '@c1m3.obj.ronRen', hud: { light: true, noise: true },
      checkpoint: { label: '@c1m3.cp.cauThang', setup: [
        put('cafe-co-ba.backDoor'),
        { k: 'spawn', id: 'muc', template: 'watchdog', at: 'cafe-co-ba.backStairs', team: 'neutral', behaviour: { k: 'act', name: 'sleep' } },
        { k: 'stealth', arena: 'co-ba-back', variant: 'night', rules: { takedowns: false, guns: 'none', lethal: 'allow', failOn: [], showCones: 'always', countConscience: false, respawn: 'checkpoint' } },
        { k: 'unlock', ability: 'crouch', label: '@c1m3.unlock.ronRen' }] },
      subs: [{ id: 'cui', text: '@c1m3.sub.cui', done: { k: 'stance', is: 'crouch' } }],
      interact: [{ id: 'mo-cua-gac', at: 'cafe-co-ba.backStairs', r: 1.5, prompt: '@c1m3.int.moCua', kind: 'enter', when: 'foot' }],
      enter: [hint('c1m3.hint.ronRen', 6000)],
      watchers: [
        { when: { k: 'after', seconds: 6 }, do: [hint('c1m3.hint.noise', 6000)] },
        { when: { k: 'after', seconds: 13 }, do: [hint('c1m3.hint.light', 6000)] },
      ],
      done: { k: 'all', of: [{ k: 'subs' }, used('mo-cua-gac')] },
      fail: [{ when: { k: 'actor', id: 'muc', state: 'alert' }, reason: '@c1m3.fail.muc', soft: true }],
      retry: [
        talk('c1m3-la', [say('coba', 'c1m3.la1', { voice: 'shout' }), say('tin', 'c1m3.la2', { voice: 'whisper' }), say('coba', 'c1m3.la3', { voice: 'shout' })]),
        { k: 'teleport', at: 'cafe-co-ba.backDoor' }, { k: 'behave', id: 'muc', b: { k: 'act', name: 'sleep' } }, { k: 'player', stance: 'stand' },
      ],
    },
    {
      id: 'dem-tien', minutes: 0.5, objective: '@c1m3.obj.demTien',
      enter: [{ k: 'space', enter: 'attic', link: 'stairs' }, { k: 'stealth', arena: null }],
      interact: [{ id: 'lon-sua', at: 'attic/can', r: 1.5, prompt: '@c1m3.int.lonSua', kind: 'use' }],
      done: used('lon-sua'),
      exit: [
        talk('c1m3-dem', [think('c1m3.think.dem1')]), hint('c1m3.hint.tong', 5000),
        { k: 'payDebt', n: 1350 }, { k: 'unlock', ability: 'soNo', label: '@c1m3.unlock.soNo' }, hint('c1m3.hint.soNo', 6000),
        talk('c1m3-dem-2', [think('c1m3.think.dem2')]),
      ],
    },
    {
      id: 'viet-tuong', minutes: 0.8, objective: '@c1m3.obj.vietTuong',
      interact: [{ id: 'phan', at: 'attic/wall', r: 1.5, prompt: '@c1m3.int.phan', kind: 'use' }],
      done: used('phan'),
      exit: [{ k: 'cutscene', id: 'c1m3-gac-dem' }, { k: 'journal', id: 'j-lam' }],
    },
  ],
  medals: { par: 330, clues: ['giup-ba-sau'] },
  replay: { abilities: ['phone', 'appOrders'] },
});

// ---- Catalog ----------------------------------------------------------------------------------------------------

const person = (id: string, bg: string, initials: string, look: string = id, role?: string): CastDef =>
  ({ id, name: `@cast.${id}`, portrait: { bg, initials }, look, ...(role ? { role: `@cast.${id}.role` } : {}) });
export const CAST: CastDef[] = [
  person('tin', '#ffb07a', 'T', 'tin', 'role'), person('quang', '#ffd166', 'Q', 'quang', 'role'), person('coba', '#ff9eb5', 'B', 'coba', 'role'),
  person('tu', '#b9e0a5', 'Tư', 'tu', 'role'), person('bana', '#e8c58f', 'M', 'bana', 'role'), person('mai', '#9fd3ff', 'Ú', 'mai', 'role'),
  person('basau', '#d9b38c', 'S', 'grandma-che'), person('gac', '#8a8f98', 'G', 'ran-den'), person('app', '#e77641', 'GL', 'app'),
  person('khach', '#a0a7b0', 'K', 'resident'), person('banhmi', '#c9a27a', 'B', 'vendor-woman'), person('tiemhoa', '#e7a3b9', 'H', 'shop-woman'),
  person('chupho', '#b98a5e', 'P', 'vendor-man'), person('khach-vp', '#9fb5c9', 'L', 'office-receptionist'), person('khach-bv', '#a6c48a', 'H', 'young-father'),
  person('khach-pho', '#c2b49a', 'B', 'elder-man'),
];
const ev = (id: string, kind: EvidenceDef['kind'], key: string, icon: string, tags: string[]): EvidenceDef =>
  ({ id, kind, title: `@ev.${key}.t`, text: `@ev.${key}.x`, art: { icon }, chapter: 1, tags });
export const EVIDENCE: EvidenceDef[] = [ev('ev-don-dem-quang', 'document', 'donDem', 'phone', ['quang', 'app', 'don04'])];
const note = (id: string, tab: JournalDef['tab'], key: string): JournalDef => ({ id, tab, title: `@j.${key}.t`, text: `@j.${key}.x` });
export const JOURNAL: JournalDef[] = [
  note('j-quang', 'people', 'quang'), note('j-coba', 'people', 'coba'), note('j-ong-tu', 'people', 'tu'), note('j-ba-sau', 'people', 'basau'),
  note('j-ngay-dau', 'diary', 'ngayDau'), note('j-no', 'notes', 'no'), note('j-lam', 'notes', 'lam'),
];
/**
 * Off-map space anchors this chapter places things at ('space/anchor' in scripts, 'set:space.anchor' in cutscenes):
 * a contract for the level kit, which must build each anchor.
 */
export const ANCHORS: Record<string, Record<string, string>> = {
  attic: {
    stairs: 'top of the outside back stairs: the attic door from the landing (entry link "stairs")',
    door: 'inside of the attic door (Cô Ba knocks here)', desk: 'small desk under the window: the duffel goes here',
    wall: 'the chalk wall (debt figure, later the BẢNG MANH MỐI)', window: 'window facing north over An Hòa (view card to THÁP PHƯƠNG NAM)',
    mattress: 'thin mattress on the floor (sleep, manual save)', can: 'condensed-milk can on the shelf (SỔ NỢ)', hollow: 'loose floorboards (ch.9 hide)',
  },
  'village-tan-thuan': {
    pond: 'lotus pond centre, dawn mist', stilt: 'the stilt house seen from the pond', steps: 'wooden steps down to the water',
    door: 'stilt-house doorway (bracelet, Mai\'s promise)', notice: 'house post beside the door where the debt notice is pasted',
    stiltIn: 'inside the stilt house by the leaking roof (Má on the phone)', bridge: 'concrete bridge with the coach (P1 shot moves on-map)',
  },
  'xe-may-shop': { shelf: 'shelf behind the counter: the old photo lying face down (paid off in c3-m3)' },
  'moonlight-b2': {
    crates: 'frosted fish crates in the cold room (CS01 hide)', aisle: 'floor-level end of the cold-room aisle',
    lotus: 'wall with a charcoal lotus', door: 'cold-room door the flashlight comes through',
  },
};
/** Case-board cards this chapter contributes to BẢNG MANH MỐI (the ch.4 board places them; slots on the lotus template). */
export const BOARD_CARDS: BoardCard[] = [{ id: 'ev-don-dem-quang', slot: 11 }];

export const chapter = defineChapter({
  chapter: 1,
  missions: [c1m1, c1m2, c1m3],
  evidence: EVIDENCE, journal: JOURNAL, cast: CAST,
  text: TEXT,
});
