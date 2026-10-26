// Mock data and a mock reducer for the story-UI preview route (app/story-preview) and the UI tests.
// Pure: no React, DOM or three.js. Names follow the story bible (story-final.md) and the binding map (KHO 7 in Quận 4);
// brands follow story-decisions.md 14 (ĐơnƠi, order codes DO-04xx; the ring never with a company-type word); cast ids are the content ids (bana = Má).
import { linkKey } from './format';
import { DEFAULT_SETTINGS, emptyStoryUiView } from './store';
import type { BoardCard, BoardView, CastId, CctvView, ChapterEntry, EvidenceCard, InterrogationLine, InterrogationView, JournalView, PhoneView, PortraitMap, StealthView, StoryMenuView, StoryUiAction, StoryUiView, SubtitleLine } from './types';

export const MOCK_APP = 'ĐơnƠi';
export const CAST: Record<CastId, { name: string; color: string; hair: string; shirt: string; skin: string; role?: string }> = {
  tin: { name: 'TÍN', color: '#ffb07a', hair: '#1d1916', shirt: '#e77641', skin: '#c99068' },
  mai: { name: 'ÚT MAI', color: '#9fd3ff', hair: '#1d1916', shirt: '#bcd7ea', skin: '#d9a47e' },
  bana: { name: 'MÁ', color: '#e8c58f', hair: '#4a4038', shirt: '#6b4a35', skin: '#b98260' },
  quang: { name: 'QUANG LÌ', color: '#ffd166', hair: '#6b4a2e', shirt: '#e77641', skin: '#c48a62' },
  tu: { name: 'ÔNG TƯ', color: '#b9e0a5', hair: '#e8e6e0', shirt: '#b8a77a', skin: '#b98260' },
  coba: { name: 'CÔ BA', color: '#ff9eb5', hair: '#2a211c', shirt: '#d97a9a', skin: '#d29a74' },
  van: { name: 'ĐẠI ÚY VÂN', color: '#8fd0c8', hair: '#15110e', shirt: '#5a3a22', skin: '#cf9a76' },
  cuong: { name: 'GÃ ĐẦU TRỌC', color: '#ff6b5b', hair: '#b07a58', shirt: '#1d1d20', skin: '#b07a58' },
  diem: { name: 'CHỊ DIỄM', color: '#f5a3d6', hair: '#2b1d17', shirt: '#f2f0ea', skin: '#e0ae8c' },
  phuong: { name: 'BÀ PHƯỢNG', color: '#e6c35c', hair: '#8d8a86', shirt: '#2f7a5a', skin: '#e2b494' },
  hoa: { name: 'HOA', color: '#ffe08a', hair: '#1d1916', shirt: '#7b8794', skin: '#c99068' },
  guard: { name: 'ĐÀN EM RẮN ĐEN', color: '#d0d4cf', hair: '#151515', shirt: '#26262a', skin: '#b07a58' },
};
const sp = (id: CastId) => ({ id, name: CAST[id].name, color: CAST[id].color });
const line = (id: string | number, who: CastId | null, text: string, ch: SubtitleLine['ch'] = 'scene', extra: Partial<SubtitleLine> = {}): SubtitleLine =>
  ({ id, who, name: who ? CAST[who].name : 'TÍN', color: who ? CAST[who].color : CAST.tin.color, ch, text, ...extra });

/** Simple flat SVG busts (hair, face, shirt) standing in for the director's rendered portraits. */
export function mockPortraits(ids: CastId[] = ['tin', 'quang', 'van', 'coba', 'tu', 'diem', 'cuong', 'mai', 'bana']): PortraitMap {
  const out: PortraitMap = {};
  for (const id of ids) {
    const c = CAST[id];
    if (!c) continue;
    const bald = id === 'cuong', long = id === 'mai' || id === 'diem' || id === 'coba' || id === 'phuong';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${c.color}"/><path d="M8 64c2-14 12-20 24-20s22 6 24 20z" fill="${c.shirt}"/><rect x="26" y="36" width="12" height="10" rx="4" fill="${c.skin}"/>${long ? `<path d="M17 30c0-14 6-21 15-21s15 7 15 21v16H17z" fill="${c.hair}"/>` : ''}<ellipse cx="32" cy="29" rx="12" ry="14" fill="${c.skin}"/>${bald ? '<path d="M24 22l5 12" stroke="#7a3a2a" stroke-width="1.6"/>' : `<path d="M19 27c0-10 6-15 13-15s13 5 13 15c-4-5-9-7-13-7s-9 2-13 7z" fill="${c.hair}"/>`}<circle cx="27" cy="30" r="1.4" fill="#1b1410"/><circle cx="37" cy="30" r="1.4" fill="#1b1410"/><path d="M28 37q4 2 8 0" stroke="#7a4a3a" stroke-width="1.3" fill="none"/>${id === 'tu' ? '<rect x="22" y="27" width="9" height="6" rx="2" fill="none" stroke="#111" stroke-width="1.6"/><rect x="33" y="27" width="9" height="6" rx="2" fill="none" stroke="#111" stroke-width="1.6"/>' : ''}</svg>`;
    out[id] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return out;
}

// ---------------------------------------------------------------- evidence
export const EVIDENCE: EvidenceCard[] = [
  { id: 'note-hoa', title: 'Tờ hóa đơn “CỨU TỤI EM”', sub: 'Phòng số 7, Nhà nghỉ Hoa Hồng', kind: 'note', chapter: 2, text: 'Con nhỏ trong phòng số 7 dúi vô tay mình lúc đưa tiền bo. Chữ viết bằng chì kẻ mắt, run run. Mặt sau còn in tên nhà thuốc.' },
  { id: 'plate-van', title: 'Biển số 51D-207.19', sub: 'Xe đông lạnh màu trắng', kind: 'plate', chapter: 2, text: 'Chiếc xe lạnh đậu sau dãy nhà nghỉ lúc 3 giờ sáng. Mình nhớ biển số trước khi kịp nghĩ gì.' },
  { id: 'pass-sen', title: 'Thẻ ra vào bông sen vàng', sub: 'Kẹp trên kính chiếc xe lạnh', kind: 'object', chapter: 2, text: 'Logo bông sen vàng, hai chữ SV. Sen Vàng... cái tên má nhắc trong điện thoại.' },
  { id: 'kho7', title: 'Kho 7', sub: 'Bến Khánh Hội, Quận 4', kind: 'place', chapter: 2, text: 'Kho đông lạnh bên sông. Đêm đó có người bị nhốt trong lồng sắt. Sáng hôm sau đã dọn sạch, nồng mùi thuốc tẩy.' },
  { id: 'gl0417', title: 'Mã đơn DO-0417', sub: 'Túi giao hàng rách, khách để trống', kind: 'document', chapter: 3, text: 'Đơn đêm không tên khách. Phí cao gấp năm lần đơn thường. Đầu mã DO-04…' },
  { id: 'receipt-ad', title: 'Biên lai Ánh Dương', sub: 'Phí giới thiệu việc làm', kind: 'document', chapter: 3, text: 'Cháy một nửa trong thùng phuy. “Việc Làm Ánh Dương — Đường Chợ Cũ — phí giới thiệu”.' },
  { id: 'cage-tally', title: 'Vết khắc trong lồng', sub: '“HOA — ĐỒNG THÁP”', kind: 'photo', chapter: 3, text: 'Mấy vạch đếm ngày khắc bằng móng tay, kế bên là tên Hoa. Em ấy đã ở đó ít nhất mười một ngày.' },
  { id: 'bear-ear', title: 'Tai gấu bông', sub: 'Mắc trên kẽm gai', kind: 'object', chapter: 3, text: 'Một cái tai gấu bông sờn. Trong kho đó từng có một đứa nhỏ.', isNew: true },
  { id: 'ledger-mai', title: 'Trang sổ có tên Mai', sub: 'Ảnh chụp sổ tuyển dụng', kind: 'photo', chapter: 4, text: '“Đỗ Thị Mai — 16t — Tân Thuận — nợ SV 40tr — chuyển: mùng 5”. Mình phóng to tới khi chữ vỡ ra từng điểm ảnh.' },
  { id: 'phuong-voice', title: '“Chị Phượng”', sub: 'Câu nghe lén trong kho', kind: 'audio', chapter: 2, text: '“…hàng của chị Phượng, mùng mười đi.” Giọng gã đầu trọc, qua lớp sương lạnh.' },
  { id: 'debt-notice', title: 'Giấy báo thu nợ Sen Vàng', sub: 'Má gửi qua điện thoại', kind: 'photo', chapter: 4, text: '“Ba mươi ngày không trả thì lấy nhà.” Má giấu tờ này từ hồi đầu tháng Bảy.' },
  { id: 'call-0341', title: 'Cuộc gọi lúc 03:41', sub: 'Nhật ký cuộc gọi của mình', kind: 'call', chapter: 5, text: 'Quang gọi đúng lúc mình nằm trên mái kho. Chuông reo, thằng gác ngước lên.' },
  { id: 'file-2014', title: 'Hồ sơ mất tích 2014', sub: 'Võ Ngọc Diễm, 17 tuổi', kind: 'document', chapter: 8, text: 'Trong hộp sắt của Ông Tư. Một cô gái miền Tây được “chị tuyển dụng” dắt lên thành phố rồi biến mất.' },
  { id: 'mai-bag', title: 'Cặp vải của Mai', sub: '“Đỗ Thị Mai — 10A2”', kind: 'object', chapter: 5, text: 'Tìm thấy trong kho của tiệm spa. Còn mấy gói trà sen Mai tự gói.' },
];
const ev = (id: string) => EVIDENCE.find((e) => e.id === id)!;

// ---------------------------------------------------------------- deduction board (c4-m3)
export const BOARD_CARDS = ['plate-van', 'pass-sen', 'kho7', 'gl0417', 'receipt-ad', 'ledger-mai', 'phuong-voice', 'debt-notice'];
const SLOT_OF: Record<string, number> = { 'kho7': 0, 'pass-sen': 1, 'receipt-ad': 2, 'plate-van': 3, 'phuong-voice': 4, 'debt-notice': 5, 'ledger-mai': 6, 'gl0417': 7 };
export const BOARD_LINKS: [string, string][] = [['plate-van', 'pass-sen'], ['pass-sen', 'kho7'], ['kho7', 'gl0417'], ['kho7', 'receipt-ad'], ['receipt-ad', 'ledger-mai'], ['ledger-mai', 'debt-notice'], ['debt-notice', 'pass-sen'], ['phuong-voice', 'kho7']];
export function mockBoard(made = 3, solved = false): BoardView {
  const cards: BoardCard[] = BOARD_CARDS.map((id, i) => { const e = ev(id); return { id, title: e.title, sub: e.sub, kind: e.kind, slot: SLOT_OF[id], rot: [-3, 2, -1.5, 3, -2, 1, 2.5, -2.5][i], isNew: id === 'ledger-mai' && !solved }; });
  cards.push({ id: 'unknown-b2', title: '', kind: 'place', slot: 14, rot: 1, visible: false });
  const links = BOARD_LINKS.slice(0, solved ? BOARD_LINKS.length : made).map(([a, b]) => ({ a, b, state: 'ok' as const }));
  return {
    id: 'c4-board', title: 'Đường dây Sen Vàng', question: solved ? 'PHƯỢNG LÀ AI?' : 'Tụi nó là ai, và Mai đang ở đâu?', cards, links, needed: BOARD_LINKS.length, hintTokens: 2, solved, readOnly: false, shake: null,
    hypotheses: [{ id: 'h-loan', text: 'Sen Vàng vừa cho vay nặng lãi vừa “tuyển” người trả nợ', state: solved ? 'proven' : 'open' }, { id: 'h-tip', text: 'Có người trong đồn báo tin cho tụi nó', state: 'locked' }],
    deduction: solved ? { id: 'blank-orders', prompt: 'Mấy đơn hàng không tên dẫn tới đâu?', options: [{ id: 'gl04', text: 'Cùng đầu mã DO-04 với mấy đơn đêm của Quang' }, { id: 'pharmacy', text: 'Tới nhà thuốc đầu phố, vậy thôi' }, { id: 'bug', text: 'Chỉ là ứng dụng bị lỗi' }], wrong: [], answered: null } : null,
  };
}

// ---------------------------------------------------------------- journal
export function mockJournal(tab: JournalView['tab'] = 'clues'): JournalView {
  return {
    tab, hintTokens: 2, canOpenBoard: true, questions: ['PHƯỢNG LÀ AI?', 'Ai báo cho tụi nó?'],
    evidence: EVIDENCE.filter((e) => e.chapter <= 5),
    people: [
      { id: 'mai', name: 'Út Mai', role: 'Em gái, học sinh lớp 10A2', color: CAST.mai.color, status: 'missing', age: 16, lines: ['Hứa với mình Rằm này cùng làm bánh trung thu nhân hạt sen.', 'Lén nhận việc “phụ quán ăn” trên thành phố để trả nợ giùm nhà.', 'Đi đâu cũng vẽ một bông sen bằng than.'] },
      { id: 'bana', name: 'Má', role: 'Bà Năm, Tân Thuận', color: CAST.bana.color, status: 'family', lines: ['“Gần bùn mà chẳng hôi tanh mùi bùn.”', 'Giấu giấy báo nợ để tụi mình yên tâm học.'] },
      { id: 'quang', name: 'Quang Lì', role: 'Bạn cùng quê, shipper lâu năm', color: CAST.quang.color, status: 'suspect', age: 23, lines: ['Chạy đơn đêm mã DO-04xx, khách để trống.', 'Gọi cho mình đúng lúc 03:41 — lúc mình nằm trên mái kho.', 'Nợ cá độ ba trăm triệu?'] },
      { id: 'tu', name: 'Ông Tư', role: 'Tiệm sửa xe, cựu trinh sát', color: CAST.tu.color, status: 'ally', age: 64, lines: ['“Khóa cổ, đếm tới năm, nó ngủ. Không giết ai.”', 'Năm 2014 từng theo một đường dây có logo bông sen.'] },
      { id: 'coba', name: 'Cô Ba', role: 'Chủ Cà phê Cô Ba, chủ nhà', color: CAST.coba.color, status: 'ally', lines: ['Cho mình mướn gác xép một triệu hai một tháng.', 'Không chịu nhắc tới anh Lâm.'] },
      { id: 'van', name: 'Đại úy Phan Thanh Vân', role: 'Công an phường, bị điều về vì quá thẳng', color: CAST.van.color, status: 'ally', lines: ['“Đừng tin ai mặc sắc phục. Kể cả chị — cho tới khi chị chứng minh được.”'] },
      { id: 'cuong', name: 'Gã đầu trọc', role: 'Cầm đầu đám canh kho', color: CAST.cuong.color, status: 'suspect', lines: ['Sẹo từ chân mày xuống cằm. Mang dép lào cả lúc đánh nhau.', 'Gọi “chị Phượng” như gọi chủ.'] },
      { id: 'hoa', name: 'Hoa', role: 'Cô bé ở phòng số 7, Đồng Tháp', color: CAST.hoa.color, status: 'victim', age: 15, lines: ['Viết “CỨU TỤI EM” lên tờ hóa đơn.', 'Tên em khắc trong lồng sắt ở Kho 7.'] },
    ],
    places: [
      { id: 'coba', name: 'Cà phê Cô Ba', district: 'An Hòa', note: 'Quán mở từ 1998. Gác xép phía trên là chỗ mình ở. Camera trước cửa “để bắt đứa chôm ghế”.', chapter: 1, visited: true },
      { id: 'motel', name: 'Nhà nghỉ Hoa Hồng', district: 'Phố đèn neon, An Hòa', note: 'Phòng số 7. Đơn hàng lúc nửa đêm, phí 150.000đ.', chapter: 2, visited: true },
      { id: 'kho7', name: 'Kho 7', district: 'Bến Khánh Hội, Quận 4', note: 'Kho đông lạnh có cầu tàu riêng. Bây giờ treo bảng CHO THUÊ.', chapter: 2, visited: true },
      { id: 'anhduong', name: 'Việc Làm Ánh Dương', district: 'Đường Chợ Cũ, An Hòa', note: 'Văn phòng “giới thiệu việc làm”. Chị Diễm tiếp khách ở bàn ngoài.', chapter: 4, visited: false },
    ],
    diary: [
      { chapter: 1, title: 'Lên phố', lunar: 'cuối tháng Bảy', text: 'Bốn chục triệu. Mình viết con số lên tường bằng phấn cho khỏi quên. Cô Ba nói nợ thì từ từ trả, bụng đói thì không đợi được. Tối nay ăn hủ tiếu, mai chạy tiếp.' },
      { chapter: 2, title: 'Đơn hàng lúc nửa đêm', lunar: 'mùng 1 tháng Tám', text: 'Không phải chuyện của mình. Mình đã nói vậy ba lần trên đường về. Nhưng tờ hóa đơn vẫn nằm trong túi áo, và mình vẫn nhớ biển số chiếc xe lạnh.' },
      { chapter: 3, title: 'Không ai tin', lunar: 'mùng 2–3', text: 'Mười hai tiếng. Tụi nó dọn sạch trong mười hai tiếng. Chị Vân nói đừng tin ai mặc sắc phục, kể cả chị. Ông Tư dạy mình đứng trong bóng tối mà thở cho đều.' },
    ],
    conscience: {
      knockouts: 4, kills: 0, detections: 2, alarms: 1,
      records: [
        { id: 'c1-m3', title: 'Bốn mươi triệu', chapter: 1, grade: 'A', medals: ['bong-ma', 'luong-tam'], best: 372, knockouts: 0, kills: 0, detections: 0 },
        { id: 'c2-m1', title: 'Phòng số 7', chapter: 2, grade: 'B', medals: ['luong-tam'], best: 401, knockouts: 0, kills: 0, detections: 1 },
        { id: 'c2-m2', title: 'Bám đuôi lúc ba giờ', chapter: 2, grade: 'A', medals: ['luong-tam', 'than-toc'], best: 388, knockouts: 0, kills: 0, detections: 0 },
        { id: 'c2-m3', title: 'Cái kho bên sông', chapter: 2, grade: 'C', medals: ['luong-tam'], best: 562, knockouts: 2, kills: 0, detections: 1 },
        { id: 'c3-m2', title: 'Kho trống', chapter: 3, grade: 'A', medals: ['luong-tam', 'mat-cu'], best: 296, knockouts: 0, kills: 0, detections: 0 },
        { id: 'c3-m3', title: 'Ông thầy sửa xe', chapter: 3, grade: 'B', medals: ['luong-tam'], best: 515, knockouts: 2, kills: 0, detections: 0 },
      ],
    },
  };
}

// ---------------------------------------------------------------- phone
export function mockPhone(app: PhoneView['app'] = 'home', extra: Partial<PhoneView> = {}): PhoneView {
  return {
    open: true, app, skin: 'smart', clock: '02:58', battery: 0.34, signal: 3, appName: MOCK_APP, rating: 4.9,
    call: null, thread: null, camera: null, debt: { paid: 1350000, total: 40000000 },
    recents: [
      { id: 'r1', who: 'quang', name: 'QUANG LÌ', time: '03:41', dir: 'in', evidence: true },
      { id: 'r2', who: 'bana', name: 'MÁ', time: 'Hôm qua 19:12', dir: 'missed' },
      { id: 'r3', who: 'coba', name: 'CÔ BA', time: 'Hôm qua 23:05', dir: 'out' },
      { id: 'r4', who: 'van', name: 'ĐẠI ÚY VÂN', time: 'Thứ Ba', dir: 'in' },
    ],
    threads: [
      { id: 'quang', who: 'quang', name: 'QUANG LÌ', color: CAST.quang.color, unread: 2, typing: false,
        messages: [
          { id: 'q1', from: 'them', text: 'Ê mậy, tối nay rảnh hông', time: '21:40' },
          { id: 'q2', from: 'me', text: 'Đang chạy đơn, chi vậy', time: '21:42' },
          { id: 'q3', from: 'them', text: 'Qua tiệm Ông Tư liền đi. Có người kiếm ổng, tao thấy lạ lắm', time: '22:15' },
          { id: 'q4', from: 'them', text: 'Mày tới thì đừng đi cửa trước nha', time: '22:16' },
        ],
        replies: ['Ai kiếm ổng? Nói rõ coi.', 'Tao tới liền.', 'Mày đang ở đâu?'] },
      { id: 'coba', who: 'coba', name: 'CÔ BA', color: CAST.coba.color, unread: 0, messages: [{ id: 'c1', from: 'them', text: 'Vượt đèn đỏ nữa là cô méc Má con đó nghe chưa', time: '08:31' }, { id: 'c2', from: 'me', text: 'Dạ con biết rồi cô', time: '08:33' }] },
      { id: 'mai', who: 'mai', name: 'ÚT MAI', color: CAST.mai.color, unread: 0, messages: [{ id: 'm1', from: 'them', text: 'Anh Hai ăn cơm chưa? Rằm nhớ về làm bánh với em nha 🌕', time: 'Thứ Hai' }] },
    ],
    contacts: [
      { id: 'bana', name: 'Má', note: 'Tân Thuận', color: CAST.bana.color, callable: true },
      { id: 'mai', name: 'Út Mai', note: 'Không liên lạc được', color: CAST.mai.color, callable: true },
      { id: 'coba', name: 'Cô Ba', note: 'Chủ nhà', color: CAST.coba.color, callable: true },
      { id: 'tu', name: 'Ông Tư', note: 'Tiệm sửa xe', color: CAST.tu.color, callable: true },
      { id: 'van', name: 'Chị Vân', note: 'Chỉ gọi khi cần', color: CAST.van.color, callable: true },
      { id: 'quang', name: 'Quang Lì', color: CAST.quang.color, callable: true },
    ],
    orders: [
      { id: 'o1', title: '1 túi — Nhà thuốc', from: 'Nhà thuốc Phước An', to: 'Phòng 7, Nhà nghỉ Hoa Hồng', fee: 150000, distance: '1,2 km', customer: '(trống)', code: 'DO-0417', state: 'taken' },
      { id: 'o2', title: 'Cà phê sữa đá ×3', from: 'Cà phê Cô Ba', to: 'Văn phòng tầng 4, Đường Hoa Sữa', fee: 18000, distance: '0,8 km', eta: '6 phút', customer: 'Anh Khoa', state: 'offer' },
      { id: 'o3', title: 'Bánh mì thịt ×2', from: 'Bánh mì Tư Hưng', to: 'Sảnh Văn Phòng Bến Nghé', fee: 22000, distance: '1,9 km', customer: 'Chị Thảo', state: 'done' },
    ],
    photos: [
      { id: 'p1', caption: 'Xe lạnh 51D-207.19', time: '03:07', evidence: true },
      { id: 'p2', caption: 'Trang sổ tuyển dụng', time: '13:20', evidence: true },
      { id: 'p3', caption: 'Hoàng hôn bến Bạch Đằng', time: '18:02' },
      { id: 'p4', caption: 'Bàn của Quang ở quán', time: '07:45' },
    ],
    ...extra,
  };
}

// ---------------------------------------------------------------- stealth
export function mockStealth(kind: 'choke' | 'alert' = 'choke'): StealthView {
  if (kind === 'alert') return {
    stance: 'stand', light: 0.82, noise: 9, noiseMax: 14, detection: 'detected', alarm: 2, reinforce: 24, flash: 1,
    guards: [{ id: 'g1', awareness: 100, state: 'alert', dir: -0.5, dist: 7 }, { id: 'g2', awareness: 64, state: 'search', dir: 1.9, dist: 15 }, { id: 'g3', awareness: 30, state: 'suspicious', dir: 2.8, dist: 22, tagged: true }, { id: 'g4', awareness: 0, state: 'down', dir: 0, dist: 4 }],
    takedown: { phase: 'prompt', label: 'Nhấn E để hạ nhanh (giữ E: khóa cổ, im lặng)', progress: 0 },
    cover: { kind: 'shipper', label: 'Vỏ bọc shipper', integrity: 0.22, zone: 'restricted' }, items: [{ id: 'bolt', count: 1 }, { id: 'whistle', count: 1 }], radioIn: null, breath: null, knockouts: 3, kills: 0,
  };
  return {
    stance: 'crouch', light: 0.18, noise: 2, noiseMax: 14, detection: 'searching', alarm: 1, reinforce: null,
    guards: [{ id: 'g1', awareness: 12, state: 'unaware', dir: 0.15, dist: 1.2 }, { id: 'g2', awareness: 46, state: 'suspicious', dir: -1.2, dist: 12 }, { id: 'g3', awareness: 71, state: 'search', dir: 2.4, dist: 18, tagged: true }, { id: 'g4', awareness: 0, state: 'tied', dir: 0, dist: 6 }],
    takedown: { phase: 'choke', label: 'Khóa cổ', progress: 0.6, pressure: 0.62, band: [0.45, 0.75], count: 3, warn: null },
    cover: null, items: [{ id: 'bolt', count: 3 }, { id: 'zipTie', count: 5 }, { id: 'radio', count: 1 }, { id: 'keycard', count: 0 }], radioIn: 42, breath: null, knockouts: 2, kills: 0,
  };
}

// ---------------------------------------------------------------- CCTV (c5-m1)
export const CCTV_EVENTS = [{ id: 'collar', from: 365, to: 405, label: 'Gã Rắn Đen nắm cổ áo Quang' }, { id: 'dial', from: 655, to: 705, label: 'Quang bấm số gọi đi' }];
export function mockCctv(found = 0): CctvView {
  return {
    id: 'coba-cam', title: 'Đêm ở kho — trước cửa quán', camera: 'CAM 01 · CỬA TRƯỚC', place: 'CÀ PHÊ CÔ BA', start: 3 * 3600 + 30 * 60, duration: 900, fps: 5,
    goal: 'Tìm lúc Quang bị ép và lúc nó gọi điện. Đối chiếu với cuộc gọi 03:41 trong máy mình.', needed: 2,
    found: CCTV_EVENTS.slice(0, found).map((e) => ({ id: e.id, t: (e.from + e.to) / 2, label: e.label })), hint: 'Còn một khoảnh khắc nữa… để ý tay Quang.', feedback: null,
  };
}

// ---------------------------------------------------------------- interrogation (c8-m1)
export function mockInterrogation(step = 0): InterrogationView {
  const st = (i: number, text: string, done: 'broken' | 'true') => ({ id: `s${i}`, text, state: (step > i ? done : step === i ? 'current' : 'pending') as 'pending' | 'current' | 'broken' | 'true' });
  const lines: InterrogationLine[] = [
    { id: 'n0', who: 'narration' as const, text: 'Căn hộ bừa bộn. Một va li mở dở trên giường.' },
    { id: 'l0', who: 'hero' as const, text: 'Chị Diễm. Em không tới để làm hại chị.' },
    { id: 'l1', who: 'subject' as const, text: 'Chị chỉ làm văn phòng, giới thiệu việc thôi. Em về đi.' },
  ];
  if (step > 0) lines.push({ id: 'l2', who: 'hero', card: 'Trang sổ có tên Mai', text: 'Chữ trong cuốn sổ này là chữ của chị. Tên em gái em nằm ở dòng thứ ba.' }, { id: 'l3', who: 'subject', text: '…Con Mai tự nguyện đi mà. Nó nói muốn trả nợ cho nhà.' });
  if (step > 1) lines.push({ id: 'l4', who: 'hero', card: 'Cặp vải của Mai', text: 'Cái cặp này em tìm thấy trong kho tiệm spa. Tự nguyện mà bỏ cặp lại hả chị?' }, { id: 'l5', who: 'subject', text: 'Em không hiểu đâu. Chị không có lựa chọn.' });
  return {
    id: 'diem', subject: { ...sp('diem'), name: 'Chị Diễm', role: 'Người tuyển dụng, Việc Làm Ánh Dương' }, place: 'CHUNG CƯ PHÚ MỸ · CĂN 1204', topic: 'Chị Diễm biết những gì?',
    statements: [st(0, 'Chị chỉ làm văn phòng, giới thiệu việc thôi.', 'broken'), st(1, 'Con Mai tự nguyện đi mà.', 'broken'), st(2, 'Em không hiểu đâu, chị không có lựa chọn.', 'true')],
    lines, composure: [0.85, 0.6, 0.38, 0.1][Math.min(3, step)], pressure: [0.1, 0.45, 0.3, 0][Math.min(3, step)],
    evidence: ['ledger-mai', 'mai-bag', 'file-2014', 'note-hoa', 'receipt-ad', 'call-0341'].map(ev),
    shut: null, feedback: null, outcome: step >= 3 ? 'talks' : null,
  };
}

// ---------------------------------------------------------------- menu and chapters
const CHAPTERS: [string, string, string, [string, string, number][]][] = [
  ['Lên Phố', 'cuối tháng Bảy', 'Rời ao sen Tân Thuận lên phố, mang theo câu dặn của Má và lời hứa về ăn Rằm với Mai.', [['c1-m1', 'Chuyến xe đò sáng sớm', 6], ['c1-m2', 'Đơn hàng đầu tiên', 6], ['c1-m3', 'Bốn mươi triệu', 6]]],
  ['Đơn Hàng Lúc Nửa Đêm', 'mùng 1 tháng Tám', 'Một đơn hàng không tên khách, một tờ hóa đơn viết bằng chì kẻ mắt.', [['c2-m1', 'Phòng số 7', 6], ['c2-m2', 'Bám đuôi lúc ba giờ', 7], ['c2-m3', 'Cái kho bên sông', 8]]],
  ['Không Ai Tin', 'mùng 2–3', 'Kho đã dọn sạch. Hai người thầy xuất hiện, và một luật: không giết ai.', [['c3-m1', 'Trình báo', 6], ['c3-m2', 'Kho trống', 5], ['c3-m3', 'Ông thầy sửa xe', 8]]],
  ['Người Tuyển Dụng', 'mùng 4–5', 'Một văn phòng việc làm, một cuốn sổ, và một cái tên quen.', [['c4-m1', 'Cơm trưa cho văn phòng Ánh Dương', 7], ['c4-m2', 'Tấm ảnh trong sổ', 7], ['c4-m3', 'Mưa trên gác xép', 5]]],
  ['Bóng Trong Đèn Neon', 'mùng 6–7', '', [['c5-m1', 'Đơn hàng không tên', 7], ['c5-m2', 'Spa nửa đêm', 7], ['c5-m3', 'Vũ trường Moonlight', 7]]],
  ['Kẻ Phản Bội', 'mùng 8–9', '', [['c6-m1', '', 5], ['c6-m2', '', 9], ['c6-m3', '', 6]]],
  ['Sà Lan Số 07', 'mùng 10', '', [['c7-m1', '', 5], ['c7-m2', '', 9], ['c7-m3', '', 7]]],
  ['Người Đàn Bà Từ Thiện', 'mùng 11–12', '', [['c8-m1', '', 7], ['c8-m2', '', 5], ['c8-m3', '', 7], ['c8-m4', '', 8]]],
  ['Truy Nã', 'mùng 13–14', '', [['c9-m1', '', 6], ['c9-m2', '', 7], ['c9-m3', '', 7]]],
  ['Đêm Rằm', 'Rằm tháng Tám', '', [['c10-m1', '', 6], ['c10-m2', '', 9], ['c10-m3', '', 7], ['c10-m4', '', 3]]],
  ['Giao Tận Tay', 'Rằm tháng Tám', '', [['c11-m1', '', 7], ['c11-m2', '', 6], ['c11-m3', '', 7], ['c11-m4', '', 4]]],
];
export function mockChapters(current = 4): ChapterEntry[] {
  const rec = mockJournal().conscience.records;
  return CHAPTERS.map(([title, lunar, summary, missions], i) => {
    const n = i + 1, state = n < current ? 'done' : n === current ? 'current' : 'locked';
    return { n, title, lunar, summary, state, missions: missions.map(([id, t, minutes], j) => {
      const r = rec.find((x) => x.id === id);
      return { id, title: t || '???', minutes, state: n < current || (n === current && j === 0) ? (r || n < current ? 'done' : 'open') : n === current ? 'open' : 'locked', grade: r?.grade, medals: r?.medals ?? [], best: r?.best };
    }) };
  });
}
export function mockMenu(screen: StoryMenuView['screen'] = 'main', contentNote = true): StoryMenuView {
  return {
    screen, contentNote, petals: 3, lastSlot: 0, chapters: mockChapters(4),
    slots: [{ index: 0, empty: false, label: 'Chương 4 · Tấm ảnh trong sổ', chapter: 4, percent: 31, playSeconds: 4380, updated: 'hôm nay 21:14', difficulty: 'thuong' }, { index: 1, empty: true }, { index: 2, empty: false, label: 'Chương 1 · Bốn mươi triệu', chapter: 1, percent: 6, playSeconds: 1260, updated: '12/10', difficulty: 'de' }],
  };
}

// ---------------------------------------------------------------- scenes
const baseObjective = (): StoryUiView['objective'] => ({
  chapter: 2, chapterTitle: 'Đơn hàng lúc nửa đêm', mission: 'Bám đuôi lúc ba giờ', objective: 'Bám theo chiếc xe lạnh 51D-207.19. Giữ khoảng cách, tắt đèn pha khi vô hẻm.',
  checklist: [{ text: 'Đợi xe lạnh rời khỏi bãi sau nhà nghỉ', done: true }, { text: 'Bám theo tới nơi xe dừng', done: false }, { text: 'Chụp biển số và thẻ ra vào', done: false, optional: true }],
  timer: null, meters: [{ id: 'tail', kind: 'tail', label: 'Khoảng cách', value: 0.56, band: [0.35, 0.75], text: '42 m' }, { id: 'sus', kind: 'suspicion', label: 'Bị nghi', value: 0.22 }],
  lunar: { month: 8, day: 1 }, chips: ['Đèn pha tắt'],
});

export type SceneId = 'hud' | 'stealth' | 'stealth-alert' | 'cine' | 'chapter' | 'title' | 'time' | 'intro' | 'choice' | 'bluff' | 'sms' | 'qte' | 'note' | 'phone' | 'phone-sms' | 'phone-call' | 'phone-orders' | 'camera' | 'burner' | 'journal' | 'journal-people' | 'journal-conscience' | 'board' | 'board-solved' | 'cctv' | 'interrogation' | 'menu' | 'menu-note' | 'menu-new' | 'chapters' | 'pause' | 'result' | 'result-fail' | 'lunar';
export const SCENES: { id: SceneId; label: string }[] = [
  { id: 'hud', label: 'HUD · mục tiêu, cuộc gọi' }, { id: 'stealth', label: 'Lén lút · khóa cổ' }, { id: 'stealth-alert', label: 'Lén lút · bị phát hiện' },
  { id: 'cine', label: 'Cảnh phim · phụ đề' }, { id: 'chapter', label: 'Thẻ chương' }, { id: 'title', label: 'Thẻ tựa' }, { id: 'time', label: 'Thẻ thời gian' }, { id: 'intro', label: 'Thẻ nhân vật' },
  { id: 'choice', label: 'Chọn biển số' }, { id: 'bluff', label: 'Bộ đàm · nói dối' }, { id: 'sms', label: 'Trả lời tin nhắn' }, { id: 'qte', label: 'QTE' }, { id: 'note', label: 'Tờ hóa đơn' },
  { id: 'phone', label: 'Điện thoại' }, { id: 'phone-sms', label: 'Tin nhắn' }, { id: 'phone-call', label: 'Cuộc gọi đến' }, { id: 'phone-orders', label: 'Đơn hàng' }, { id: 'camera', label: 'Máy ảnh' }, { id: 'burner', label: 'Máy cùi' },
  { id: 'journal', label: 'Sổ tay · manh mối' }, { id: 'journal-people', label: 'Sổ tay · nhân vật' }, { id: 'journal-conscience', label: 'Sổ tay · lương tâm' },
  { id: 'board', label: 'Bảng manh mối' }, { id: 'board-solved', label: 'Bảng · suy luận' }, { id: 'cctv', label: 'Camera CCTV' }, { id: 'interrogation', label: 'Đối chất' },
  { id: 'menu', label: 'Menu cốt truyện' }, { id: 'menu-note', label: 'Lưu ý nội dung' }, { id: 'menu-new', label: 'Chơi mới' }, { id: 'chapters', label: 'Chọn chương' },
  { id: 'pause', label: 'Tạm dừng' }, { id: 'result', label: 'Hoàn thành' }, { id: 'result-fail', label: 'Chưa xong' }, { id: 'lunar', label: 'Dải lịch âm' },
];
const cine = (patch: Partial<NonNullable<StoryUiView['cine']>> = {}): NonNullable<StoryUiView['cine']> => ({ mode: 'scene', bars: 1, grade: 'none', skippable: true, skipHint: false, skipHold: false, card: null, choice: null, qte: null, split: null, note: null, paused: false, ...patch });
const TOUCH: StoryUiView['touch'] = [{ key: 'x', label: 'Rón rén', active: true }, { key: 'g', label: 'Ném' }, { key: 't', label: 'Quan sát', hold: true }, { key: 'p', label: 'Chụp' }, { key: 'm', label: 'Sổ tay' }];

export function mockScene(id: SceneId): StoryUiView {
  const v = emptyStoryUiView({ ...DEFAULT_SETTINGS });
  switch (id) {
    case 'hud': return { ...v, objective: baseObjective(), touch: TOUCH,
      phone: { ...mockPhone('home'), open: false, call: { state: 'ringing', who: 'quang', name: 'QUANG LÌ', color: CAST.quang.color, secs: 0, canDecline: true } },
      talk: [line('h1', null, 'Không phải chuyện của mình… không phải chuyện của mình.', 'inner', { italic: true })],
      toasts: [{ seq: 1, kind: 'evidence', title: 'Manh mối mới', text: 'Biển số 51D-207.19' }, { seq: 2, kind: 'checkpoint', title: 'Đã lưu', text: 'Bãi sau nhà nghỉ Hoa Hồng · 03:02' }],
      prompt: { id: 'p', key: 'E', verb: 'Tắt', label: 'đèn pha xe' } };
    case 'stealth': case 'stealth-alert': return { ...v, stealth: mockStealth(id === 'stealth' ? 'choke' : 'alert'), touch: TOUCH,
      objective: { chapter: 2, chapterTitle: 'Đơn hàng lúc nửa đêm', mission: 'Cái kho bên sông', objective: 'Vô Kho 7 mà không để ai thấy. Tìm xem tụi nó giấu gì trong khu đông lạnh.', checklist: [{ text: 'Leo lên mái kho', done: true }, { text: 'Qua cửa sau', done: false }], meters: [], lunar: { month: 8, day: 1 }, tally: { knockouts: 2, kills: 0 }, chips: ['Rón rén'] },
      talk: [line('b1', 'guard', id === 'stealth' ? '…Lạnh muốn chết, canh cái kho này chi vậy trời…' : 'Thằng shipper kìa! Bắt nó!', id === 'stealth' ? 'overheard' : 'bark', { heard: 0.6 })] };
    case 'cine': return { ...v, cine: cine({ grade: 'cold', skipHint: true, card: { seq: 3, kind: 'location', title: 'KHO 7', sub: 'Bến Khánh Hội, Quận 4 · 03:07', color: '#8fd0c8' } }),
      talk: [line('c1', 'cuong', 'Hàng của chị Phượng, mùng mười đi. Đứa nào mở miệng thì cho xuống sông.', 'scene'), line('c2', 'tin', '(Mai… không lẽ…)', 'inner', { italic: true })] };
    case 'chapter': return { ...v, cine: cine({ mode: 'card', skippable: false, card: { seq: 4, kind: 'chapter', eyebrow: 'CHƯƠNG HAI', title: 'ĐƠN HÀNG LÚC NỬA ĐÊM', sub: 'Mùng 1 tháng Tám · 23:40 · Còn 14 ngày tới Rằm', petals: 1 } }) };
    case 'title': return { ...v, cine: cine({ mode: 'card', skippable: true, skipHint: true, card: { seq: 5, kind: 'title', title: 'PHỐ VIỆT — SEN TRONG BÙN', sub: 'Gần bùn mà chẳng hôi tanh mùi bùn', petals: 0 } }) };
    case 'time': return { ...v, cine: cine({ mode: 'card', card: { seq: 6, kind: 'time', title: 'BA TUẦN TRƯỚC' } }) };
    case 'intro': return { ...v, cine: cine({ grade: 'freeze', skippable: false, card: { seq: 7, kind: 'intro', title: 'CƯỜNG SẸO', sub: 'Tay chân của “chị Phượng”', color: CAST.cuong.color } }) };
    case 'choice': return { ...v, cine: cine({ choice: { seq: 8, style: 'plate', prompt: 'Biển số chiếc xe vừa rồi?', options: ['59-X1 128.45', '59-X1 182.45', '59-X7 128.54'], timer: 12, defaultIndex: 0 } }),
      talk: [line('t1', 'tu', 'Chiếc xe vừa chạy qua đó. Biển số nhiêu, con?', 'scene')] };
    case 'bluff': return { ...v, stealth: mockStealth('choke'), objective: null, cine: cine({ mode: 'action', bars: 0.5, skippable: false, choice: { seq: 9, style: 'bluff', speaker: { id: 'guard', name: 'BỘ ĐÀM · TỔ BA', color: '#d0d4cf' }, line: 'Tổ hai! Tổ hai sao im re vậy? Trả lời coi!', options: ['“Tổ hai bình thường.” (giọng khàn khàn)', '“Ờ… không có gì hết.”', 'Im lặng'], timer: 6, defaultIndex: 2 } }) };
    case 'sms': return { ...v, objective: baseObjective(), cine: cine({ mode: 'action', bars: 0, skippable: false, choice: { seq: 12, style: 'sms', speaker: sp('quang'), line: 'Qua tiệm Ông Tư liền đi. Mày tới thì đừng đi cửa trước nha.', options: ['Ai kiếm ổng? Nói rõ coi.', 'Tao tới liền.', 'Mày đang ở đâu?'], timer: 10, defaultIndex: 1 } }),
      talk: [line('s1', null, 'Quang chưa bao giờ nhắn kiểu này…', 'inner', { italic: true })] };
    case 'qte': return { ...v, cine: cine({ mode: 'action', bars: 0.5, skippable: false, qte: { seq: 10, key: 'E', label: 'Lao tới!', window: 1.6 } }), talk: [line('q1', 'mai', 'Anh Hai!', 'scene')] };
    case 'note': return { ...v, cine: cine({ skippable: false, note: { seq: 11, kind: 'receipt', title: 'Nhà thuốc Phước An', lines: ['HÓA ĐƠN BÁN LẺ', 'Băng gạc ×2 ........ 24.000', 'Thuốc giảm đau ...... 36.000', 'Ship đêm ........... 150.000', 'TỔNG: 210.000đ'], hand: 'CỨU TỤI EM', caption: 'Mặt sau tờ hóa đơn, viết bằng chì kẻ mắt. Nhấn E để cất vô sổ tay.' } }) };
    case 'phone': return { ...v, objective: baseObjective(), phone: mockPhone('home') };
    case 'phone-sms': return { ...v, objective: baseObjective(), phone: mockPhone('sms', { thread: 'quang' }) };
    case 'phone-call': return { ...v, objective: baseObjective(), phone: mockPhone('calls', { call: { state: 'ringing', who: 'bana', name: 'MÁ', color: CAST.bana.color, secs: 0, canDecline: false } }) };
    case 'phone-orders': return { ...v, objective: baseObjective(), phone: mockPhone('orders') };
    case 'camera': return { ...v, phone: mockPhone('camera', { camera: { mode: 'photo', zoom: 2.4, zoomMin: 1, zoomMax: 3.5, quality: 0.52, hint: 'Xa quá, zoom thêm', shots: 3, targets: [{ id: 'plate', x: 0.55, y: 0.52, w: 0.09, h: 0.07, label: 'Biển số', state: 'far' }, { id: 'pass', x: 0.38, y: 0.33, w: 0.1, h: 0.08, label: 'Thẻ ra vào', state: 'ok' }], record: null } }) };
    case 'burner': return { ...v, objective: baseObjective(), phone: { ...mockPhone('home'), skin: 'burner', clock: '23:51', debt: null, call: null } };
    case 'journal': return { ...v, journal: mockJournal('clues') };
    case 'journal-people': return { ...v, journal: mockJournal('people') };
    case 'journal-conscience': return { ...v, journal: mockJournal('conscience') };
    case 'board': return { ...v, board: { ...mockBoard(3), shake: null } };
    case 'board-solved': return { ...v, board: mockBoard(8, true) };
    case 'cctv': return { ...v, cctv: mockCctv(1) };
    case 'interrogation': return { ...v, interrogation: { ...mockInterrogation(1), feedback: { seq: 1, kind: 'good', text: 'Chị Diễm sững người. Lời khai thứ nhất đã vỡ.' } } };
    case 'menu': return { ...v, menu: mockMenu('main') };
    case 'menu-note': return { ...v, menu: mockMenu('main', false) };
    case 'menu-new': return { ...v, menu: mockMenu('new') };
    case 'chapters': return { ...v, menu: mockMenu('chapters') };
    case 'pause': return { ...v, objective: baseObjective(), pause: { context: 'mission', canRetry: true, canSkip: false } };
    case 'result': return { ...v, result: { kind: 'complete', mission: 'Cái kho bên sông', seconds: 562, detections: 1, knockouts: 2, kills: 0, grade: 'B', medals: ['luong-tam'], reward: 300000, clues: ['“Chị Phượng”', 'Kho 7', 'Lồng sắt có người'], canRetry: true } };
    case 'result-fail': return { ...v, result: { kind: 'fail', mission: 'Bám đuôi lúc ba giờ', reason: 'Tài xế thấy đèn pha trong gương. Chiếc xe lạnh tăng ga bỏ chạy.', detections: 1, knockouts: 0, kills: 0, medals: [], clues: [], canRetry: true } };
    case 'lunar': return { ...v, objective: { ...baseObjective()!, lunar: { month: 8, day: 10 } } };
  }
}

// ---------------------------------------------------------------- mock reducer (what the runner would do)
let seq = 100;
const next = () => ++seq;
export function mockReduce(view: StoryUiView, a: StoryUiAction): StoryUiView {
  switch (a.type) {
    case 'choose': return view.cine?.choice ? { ...view, cine: { ...view.cine, choice: { ...view.cine.choice, picked: a.index } } } : view;
    case 'closeNote': return view.cine ? { ...view, cine: { ...view.cine, note: null }, toasts: [...view.toasts, { seq: next(), kind: 'journal', title: 'Đã ghi vào sổ tay', text: 'Tờ hóa đơn “CỨU TỤI EM”' }] } : view;
    case 'qte': return a.down && view.cine?.qte ? { ...view, cine: { ...view.cine, qte: { ...view.cine.qte, result: 'hit' } } } : view;
    case 'skipHold': return view.cine ? { ...view, cine: { ...view.cine, skipHold: a.down, skipHint: true } } : view;
    case 'toast': return { ...view, toasts: view.toasts.filter((t) => t.seq !== a.seq) };
    case 'settings': return { ...view, settings: { ...view.settings, ...a.patch } };
    case 'pause': return a.item === 'journal' ? { ...view, pause: null, phone: view.phone ? { ...view.phone, open: false } : null, journal: mockJournal() } : a.item === 'board' ? { ...view, pause: null, board: mockBoard(3) } : a.item === 'open' ? { ...view, pause: { context: 'mission', canRetry: true, canSkip: false } } : { ...view, pause: null };
    case 'journal': return !view.journal ? view : a.op === 'tab' ? { ...view, journal: { ...view.journal, tab: a.tab } } : a.op === 'board' ? { ...view, journal: null, board: { ...mockBoard(3), readOnly: false } } : { ...view, journal: null };
    case 'board': {
      const b = view.board;
      if (!b) return view;
      if (a.op === 'close') return { ...view, board: null };
      if (a.op === 'hint') { const miss = BOARD_LINKS.find(([x, y]) => !b.links.some((l) => linkKey(l.a, l.b) === linkKey(x, y))); return miss && b.hintTokens > 0 ? solve({ ...b, hintTokens: b.hintTokens - 1, links: [...b.links, { a: miss[0], b: miss[1], state: 'hint' }] }, view) : view; }
      if (a.op === 'link') {
        const ok = BOARD_LINKS.some(([x, y]) => linkKey(x, y) === linkKey(a.a, a.b));
        return ok ? solve({ ...b, links: [...b.links, { a: a.a, b: a.b, state: 'ok' }], shake: null }, view) : { ...view, board: { ...b, hintTokens: Math.max(0, b.hintTokens - 1), shake: { seq: next(), ids: [a.a, a.b] } }, toasts: [...view.toasts, { seq: next(), kind: 'warn', title: 'Hai manh mối này không dính nhau', text: b.hintTokens > 0 ? 'Mất một gợi ý.' : 'Hết gợi ý, nhưng cứ thử tiếp.' }] };
      }
      if (a.op === 'deduce' && b.deduction) { const right = a.option === 'gl04'; return { ...view, board: { ...b, hintTokens: right ? b.hintTokens : Math.max(0, b.hintTokens - 1), deduction: right ? { ...b.deduction, answered: a.option } : { ...b.deduction, wrong: [...(b.deduction.wrong ?? []), a.option] } } }; }
      if (a.op === 'propose') {
        const ok = a.hyp === 'h-loan' && a.cards.length === 3 && ['debt-notice', 'receipt-ad', 'ledger-mai'].every((c) => a.cards.includes(c));
        return { ...view, board: ok ? { ...b, shake: null, hypotheses: b.hypotheses?.map((h) => (h.id === a.hyp ? { ...h, state: 'proven' as const } : h)) } : { ...b, hintTokens: Math.max(0, b.hintTokens - 1), shake: { seq: next(), ids: a.cards } } };
      }
      return view;
    }
    case 'cctv': {
      const c = view.cctv;
      if (!c) return view;
      if (a.op === 'close') return { ...view, cctv: null };
      const hit = CCTV_EVENTS.find((e) => a.t >= e.from && a.t <= e.to && !c.found.some((f) => f.id === e.id));
      return { ...view, cctv: { ...c, found: hit ? [...c.found, { id: hit.id, t: a.t, label: hit.label }].sort((x, y) => x.t - y.t) : c.found, feedback: { seq: next(), ok: !!hit, text: hit ? `Đúng rồi: ${hit.label}` : 'Không có gì đáng chú ý ở khúc này' } } };
    }
    case 'interrogation': {
      const iv = view.interrogation;
      if (!iv) return view;
      if (a.op === 'close') return { ...view, interrogation: null };
      const step = iv.statements.findIndex((s) => s.state === 'current');
      if (a.op === 'press') return { ...view, interrogation: { ...iv, pressure: Math.min(1, (iv.pressure ?? 0) + 0.15), lines: [...iv.lines, { id: 'p' + next(), who: 'hero', text: 'Chị nói rõ hơn đi.' }, { id: 'p' + next(), who: 'subject', text: '(Ngập ngừng, không nói thêm.)' }] } };
      if (a.op === 'bluff') return { ...view, interrogation: { ...iv, shut: { seq: next(), seconds: 8 }, feedback: { seq: next(), kind: 'bad', text: 'Chị Diễm không tin. Khoanh tay im lặng.' } } };
      if (a.op !== 'present') return view;
      const want: [string, 'accuse' | 'empathy'][] = [['ledger-mai', 'accuse'], ['mai-bag', 'accuse'], ['file-2014', 'empathy']];
      const ok = step >= 0 && want[step][0] === a.evidence && want[step][1] === a.approach;
      if (!ok) return { ...view, interrogation: { ...iv, shut: { seq: next(), seconds: 4 }, feedback: { seq: next(), kind: 'bad', text: want[step]?.[0] === a.evidence ? 'Đúng món đồ, nhưng sai cách nói. Chị Diễm co người lại.' : 'Chị Diễm lắc đầu, quay mặt đi.' } } };
      const nv = mockInterrogation(step + 1);
      return { ...view, interrogation: { ...nv, feedback: { seq: next(), kind: 'good', text: step === 2 ? '“Chị cũng từng là con Mai đó.”' : 'Lời khai vỡ ra.' } } };
    }
    case 'phone': {
      const p = view.phone;
      if (!p) return view;
      switch (a.op) {
        case 'open': return { ...view, phone: { ...p, open: true } };
        case 'close': return p.app === 'camera' ? { ...view, phone: { ...p, app: 'home' } } : { ...view, phone: { ...p, open: false } };
        case 'app': return { ...view, phone: { ...p, app: a.app, thread: null, camera: a.app === 'camera' ? mockScene('camera').phone!.camera : p.camera } };
        case 'thread': return { ...view, phone: { ...p, thread: a.thread, threads: p.threads.map((t) => (t.id === a.thread ? { ...t, unread: 0 } : t)) } };
        case 'reply': return { ...view, phone: { ...p, threads: p.threads.map((t) => (t.id === a.thread && t.replies ? { ...t, replies: null, messages: [...t.messages, { id: `r${next()}`, from: 'me', text: t.replies[a.index], time: p.clock }] } : t)) } };
        case 'answer': return p.call ? { ...view, phone: { ...p, call: { ...p.call, state: 'talking', secs: 3, replies: p.call.who === 'quang' ? ['Tới rồi, đang kiếm quán nè.', 'Quán nào mậy?'] : ['Dạ, con nghe nè Má.', 'Má khỏe hông Má?'] } }, talk: [line(`ph${next()}`, p.call.who, p.call.who === 'quang' ? 'Tới chưa mậy? Quán Cô Ba đó, cái bảng ghi TỪ 1998.' : 'Tín hả con… Má nè.', 'phone')] } : view;
        case 'decline': case 'hangup': return { ...view, phone: { ...p, call: null } };
        case 'callReply': return p.call ? { ...view, phone: { ...p, call: { ...p.call, replies: null } } } : view;
        case 'call': return { ...view, phone: { ...p, call: { state: 'outgoing', who: a.contact, name: CAST[a.contact]?.name ?? a.contact, color: CAST[a.contact]?.color, secs: 0 } } };
        case 'zoom': return p.camera ? { ...view, phone: { ...p, camera: { ...p.camera, zoom: a.value, quality: Math.min(0.95, 0.3 + a.value * 0.18), hint: a.value > 2.6 ? null : 'Xa quá, zoom thêm', targets: p.camera.targets.map((t) => ({ ...t, state: t.id === 'plate' ? (a.value > 2.6 ? 'ok' : 'far') : t.state })) } } } : view;
        case 'shutter': return p.camera ? { ...view, phone: { ...p, camera: { ...p.camera, flash: (p.camera.flash ?? 0) + 1, shots: p.camera.shots + 1 } }, toasts: p.camera.quality >= 0.6 ? [...view.toasts, { seq: next(), kind: 'evidence', title: 'Manh mối mới', text: 'Ảnh biển số 51D-207.19' }] : view.toasts } : view;
        case 'order': return { ...view, phone: { ...p, orders: p.orders.map((o) => (o.id === a.order ? { ...o, state: a.accept ? 'active' : 'taken' } : o)) } };
      }
      return view;
    }
    case 'menu': {
      const m = view.menu;
      if (!m) return view;
      if (a.op === 'close' || a.op === 'continue' || a.op === 'new' || a.op === 'replay' || a.op === 'replayChapter') return { ...view, menu: null, toasts: [...view.toasts, { seq: next(), kind: 'info', title: a.op === 'new' ? `Bắt đầu ở ô ${a.slot + 1}` : a.op === 'close' ? 'Đã đóng menu' : 'Đang tải…' }] };
      if (a.op === 'acceptNote') return { ...view, menu: { ...m, contentNote: true } };
      if (a.op === 'screen') return { ...view, menu: { ...m, screen: a.screen } };
      return view;
    }
    case 'result': return { ...view, result: null };
    default: return view;
  }
}
function solve(b: BoardView, view: StoryUiView): StoryUiView {
  const done = b.links.length >= b.needed;
  return { ...view, board: done ? { ...mockBoard(8, true), hintTokens: b.hintTokens, links: b.links } : b };
}
