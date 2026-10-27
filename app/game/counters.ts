/**
 * Every counter on today's map (design-real §3, §6, §8): what each café, food place, shop, cart, market stall,
 * public office and kiosk sells, at what price (thousands of đồng) and when it is open, plus the static places the
 * interaction registry puts in front of their doors, at the carts, stalls, seats, ATMs and vending machines.
 * Pure data built from city.ts, so the interact audit (scripts/interact-audit.test.mjs) reads the same list the
 * game registers. No three.js and no DOM here; page.tsx must not import this module (it runs the city generator).
 */
import * as city from './city';
import { BUILDINGS, POIS, SCENERY, VENUES, LANDMARKS, type Building, type Point } from './city';

/** Street-life groups (city.ts LIFE), when the street-life build is present: a stool's eatery. */
const LIFE = (city as unknown as { LIFE?: unknown }).LIFE;
import type { Effect, Service } from './services';
import { MENU, type Dish } from './street-life';
import { district, type DistrictView } from './district-life';
import { QUAN_1_SOUTH_EXTRA } from './map/layout/quan-1-south';
import { BINH_THANH_EXTRA } from './map/layout/binh-thanh';
import * as transit from './transit';

/** The bus shelters and piers transit.ts serves (its audit list): a district shelter among them needs no notice. */
const transitStops = ((transit as unknown as { AUDIT_ENTRIES?: { covers: string[]; x: number; z: number; r: number }[] }).AUDIT_ENTRIES ?? []).filter((e) => e.covers.includes('transit'));
import type { GenBuilding } from './map/gen/buildings';

export type CounterKind = 'food' | 'cafe' | 'cart' | 'stall' | 'kiosk' | 'beer' | 'taphoa' | 'mart' | 'pharmacy' | 'gold' | 'barber' | 'tailor'
  | 'fashion' | 'florist' | 'books' | 'hotel' | 'repair' | 'post' | 'police' | 'bank' | 'theatre' | 'mall' | 'office' | 'school' | 'pagoda'
  | 'atm' | 'vending' | 'lottery' | 'giuxe' | 'xeom'
  /** The districts: a parish church, a chợ hall, a clinic, a museum's ticket desk, shops a street's own trade. */
  | 'church' | 'market' | 'clinic' | 'ticket' | 'shop';
/** Icons the counter panel and the prompt chip draw for a kind (page.tsx maps them to lucide icons). */
export type MenuIcon = 'coffee' | 'food' | 'beer' | 'store' | 'pill' | 'gem' | 'scissors' | 'shirt' | 'flower' | 'book' | 'hotel' | 'wrench' | 'post'
  | 'police' | 'bank' | 'ticket' | 'pagoda' | 'school' | 'bike';
/** Opening hours as [open, close) pairs in game hours; a close past 24 runs over midnight ([18, 25] is 18:00-01:00). */
export type Hours = readonly (readonly [number, number])[];
export type CounterDef = {
  kind: CounterKind; icon: MenuIcon;
  /** Panel heading, the prompt's verb ("Gọi món"), and a line about the place. */
  title: string; verb: string; intro: string;
  hours: Hours;
  /** Stars a hold-up here costs (0: a protected vendor, who never pays out). */
  robbable: 0 | 1 | 2 | 3;
  items: Service[];
  /** Market stalls and xe ôm: one "Trả giá" per visit. */
  haggle?: boolean;
  /** Food and drink eaten on a stool here heal 30% more. */
  eatIn?: boolean;
  foot?: string;
};

export const ALL_DAY: Hours = [[0, 24]];
const s = (id: string, name: string, price: number, description: string, effect: Effect): Service => ({ id, name, price, description, effect });
const TRA_DA = s('trada', 'Trà đá', 3, 'Ly trà đá vỉa hè · +2 máu, mát người 1 phút.', { heal: 2, buff: { id: 'mat', seconds: 60 } });
const FOOT_FOOD = 'Ngồi ghế nhựa ăn tại chỗ hồi thêm 30% máu. Mua mang đi thì nhớ bỏ rác đúng chỗ.';

/** The catalogue, by key. Counter places refer to these keys. */
export const COUNTERS: Record<string, CounterDef> = {
  // ---- Cafés ----
  coba: {
    kind: 'cafe', icon: 'coffee', title: 'Gọi cà phê', verb: 'Gọi cà phê', hours: [[6, 22.5]], robbable: 1, eatIn: true,
    intro: 'Quán quen đầu hẻm: phin nhỏ giọt, ghế nhựa thấp, radio mở nhạc Trịnh.',
    items: [
      s('suada', 'Cà phê sữa đá', 18, 'Phin đậm, sữa đặc, đá bào · +8 máu, tỉnh táo 3 phút.', { heal: 8, buff: { id: 'tinh', seconds: 180 }, litter: 1 }),
      s('bacxiu', 'Bạc xỉu', 20, 'Nhiều sữa ít cà phê · +10 máu, mát người 1 phút.', { heal: 10, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
      s('den', 'Cà phê đen đá', 15, 'Đắng, đậm, đúng kiểu Sài Gòn · +5 máu, tỉnh táo 4 phút.', { heal: 5, buff: { id: 'tinh', seconds: 240 }, litter: 1 }),
      TRA_DA,
    ],
  },
  rooftop: {
    kind: 'cafe', icon: 'coffee', title: 'Gọi đồ uống', verb: 'Gọi đồ uống', hours: [[7, 23]], robbable: 1, eatIn: true,
    intro: 'Cà phê sân thượng nhìn xuống phố, tối có nhạc acoustic.',
    items: [
      s('muoi', 'Cà phê muối', 30, 'Kem muối béo trên nền cà phê đậm · +10 máu, tỉnh táo 3 phút.', { heal: 10, buff: { id: 'tinh', seconds: 180 }, litter: 1 }),
      s('suada', 'Cà phê sữa đá', 25, 'Phin đậm, sữa đặc · +8 máu, tỉnh táo 3 phút.', { heal: 8, buff: { id: 'tinh', seconds: 180 }, litter: 1 }),
      s('cam', 'Nước cam ép', 35, 'Cam tươi vắt tại chỗ · +15 máu, mát người 2 phút.', { heal: 15, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('banh', 'Bánh flan', 25, 'Flan caramen mát lạnh · +12 máu.', { heal: 12 }),
    ],
  },
  trasua: {
    kind: 'cafe', icon: 'coffee', title: 'Gọi trà sữa', verb: 'Gọi trà sữa', hours: [[9, 22]], robbable: 1, eatIn: true,
    intro: 'Quầy trà sữa của học sinh, sinh viên: trân châu, thạch, kem cheese.',
    items: [
      s('tranchau', 'Trà sữa trân châu', 30, 'Trân châu đen dai · +10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('tradao', 'Trà đào cam sả', 35, 'Thanh mát ngày nắng · +10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('suatuoi', 'Sữa tươi trân châu đường đen', 35, 'Ngọt béo · +12 máu.', { heal: 12, litter: 1 }),
    ],
  },
  // ---- Food places ----
  pho: {
    kind: 'food', icon: 'food', title: 'Gọi phở', verb: 'Gọi phở', hours: [[5.5, 13], [17, 22]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Nồi nước dùng ninh xương từ khuya, bánh phở tươi, rau thơm để sẵn trên bàn.',
    items: [
      s('tai', 'Phở bò tái', 40, 'Bò tái chín tới · +35 máu, no bụng 2 phút.', { heal: 35, buff: { id: 'no', seconds: 120 } }),
      s('ga', 'Phở gà', 40, 'Gà ta xé, nước trong · +35 máu, no bụng 2 phút.', { heal: 35, buff: { id: 'no', seconds: 120 } }),
      s('dacbiet', 'Phở đặc biệt', 55, 'Đủ tái, nạm, gầu, bò viên · +45 máu, no bụng 3 phút.', { heal: 45, buff: { id: 'no', seconds: 180 } }),
      TRA_DA,
    ],
  },
  phohn: {
    kind: 'food', icon: 'food', title: 'Gọi phở', verb: 'Gọi phở', hours: [[6, 22]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Phở Bắc nước trong, hành chần, ăn kèm quẩy giòn.',
    items: [
      s('tainam', 'Phở tái nạm', 50, '+38 máu, no bụng 2 phút.', { heal: 38, buff: { id: 'no', seconds: 120 } }),
      s('bovien', 'Phở bò viên', 45, '+32 máu, no bụng 2 phút.', { heal: 32, buff: { id: 'no', seconds: 120 } }),
      s('quay', 'Quẩy', 5, 'Chấm nước phở · +4 máu.', { heal: 4 }),
    ],
  },
  banhmi: {
    kind: 'food', icon: 'food', title: 'Mua bánh mì', verb: 'Mua bánh mì', hours: [[5.5, 22]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Ổ bánh mì nóng giòn, pate, chả lụa, đồ chua, ớt và ngò.',
    items: [
      s('thit', 'Bánh mì thịt', 20, 'Pate, chả lụa, thịt nguội · +15 máu.', { heal: 15, litter: 1 }),
      s('opla', 'Bánh mì ốp la', 18, 'Hai trứng ốp la · +14 máu.', { heal: 14, litter: 1 }),
      s('xiumai', 'Bánh mì xíu mại', 20, 'Xíu mại sốt cà · +15 máu.', { heal: 15, litter: 1 }),
      s('dauanh', 'Sữa đậu nành', 8, 'Chai nhỏ mát lạnh · +4 máu, mát người 1 phút.', { heal: 4, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
    ],
  },
  buncha: {
    kind: 'food', icon: 'food', title: 'Gọi bún chả', verb: 'Gọi món', hours: [[10, 14], [17, 21]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Chả nướng than hoa thơm cả góc phố, nước chấm chua ngọt.',
    items: [
      s('buncha', 'Bún chả', 35, '+30 máu, no bụng 1,5 phút.', { heal: 30, buff: { id: 'no', seconds: 90 } }),
      s('nem', 'Nem rán', 25, 'Ba cuốn giòn rụm · +18 máu.', { heal: 18 }),
      TRA_DA,
    ],
  },
  comtam: {
    kind: 'food', icon: 'food', title: 'Gọi cơm', verb: 'Gọi cơm', hours: [[6, 21]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Cơm tấm sườn nướng, bì, chả trứng, mỡ hành và nước mắm kẹo.',
    items: [
      s('suon', 'Cơm tấm sườn bì chả', 35, '+30 máu, no bụng 2 phút.', { heal: 30, buff: { id: 'no', seconds: 120 } }),
      s('ga', 'Cơm gà xối mỡ', 40, '+32 máu, no bụng 2 phút.', { heal: 32, buff: { id: 'no', seconds: 120 } }),
      s('canh', 'Canh chua', 15, '+10 máu.', { heal: 10 }),
      TRA_DA,
    ],
  },
  nhahang: {
    kind: 'food', icon: 'food', title: 'Gọi món', verb: 'Gọi món', hours: [[10, 22]], robbable: 1, eatIn: true,
    intro: 'Nhà hàng món Nam bộ: cơm niêu đập, lẩu mắm, cá kho tộ.',
    items: [
      s('comnieu', 'Cơm niêu cá kho tộ', 90, '+50 máu, no bụng 4 phút.', { heal: 50, buff: { id: 'no', seconds: 240 } }),
      s('laumam', 'Lẩu mắm', 180, 'Cả nồi cho nhóm bạn · hồi đầy máu, no bụng 5 phút.', { full: true, buff: { id: 'no', seconds: 300 } }),
      s('goicuon', 'Gỏi cuốn', 40, 'Tôm thịt, bún, rau sống · +20 máu.', { heal: 20 }),
      s('khucbach', 'Chè khúc bạch', 30, '+10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 } }),
    ],
  },
  // The food carts and their shophouses (city.ts STALL_NAMES).
  bunrieu: {
    kind: 'cart', icon: 'food', title: 'Bún riêu Cô Hai', verb: 'Gọi bún riêu', hours: [[6, 13]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Riêu cua đồng, đậu hũ chiên, huyết, rau muống bào.',
    items: [s('bunrieu', 'Bún riêu cua', 35, '+30 máu, no bụng 2 phút.', { heal: 30, buff: { id: 'no', seconds: 120 } }), TRA_DA],
  },
  banhxeo: {
    kind: 'cart', icon: 'food', title: 'Bánh xèo', verb: 'Gọi bánh xèo', hours: [[15, 21]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Đổ chảo nóng xèo xèo, cuốn cải bẹ xanh chấm nước mắm.',
    items: [s('banhxeo', 'Bánh xèo tôm thịt', 30, '+25 máu.', { heal: 25 }), TRA_DA],
  },
  xoi: {
    kind: 'cart', icon: 'food', title: 'Xôi sáng', verb: 'Mua xôi', hours: [[5.5, 10]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Gánh xôi buổi sáng: xôi mặn lạp xưởng, xôi gấc đỏ.',
    items: [
      s('xoiman', 'Xôi mặn', 15, 'Lạp xưởng, chà bông, hành phi · +15 máu.', { heal: 15, litter: 1 }),
      s('xoigac', 'Xôi gấc', 12, '+10 máu.', { heal: 10, litter: 1 }),
    ],
  },
  che: {
    kind: 'cart', icon: 'food', title: 'Chè Bà Tư', verb: 'Mua chè', hours: [[13, 22]], robbable: 0, eatIn: true,
    intro: 'Chè ba màu, chè đậu xanh nước cốt dừa, đá bào.',
    items: [
      s('bamau', 'Chè ba màu', 15, '+10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('dauxanh', 'Chè đậu xanh', 12, '+8 máu, mát người 1,5 phút.', { heal: 8, buff: { id: 'mat', seconds: 90 }, litter: 1 }),
    ],
  },
  hutieu: {
    kind: 'cart', icon: 'food', title: 'Hủ tiếu gõ', verb: 'Gọi hủ tiếu', hours: [[18, 25]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Tiếng gõ lóc cóc đêm khuya: hủ tiếu nước trong, thịt bằm, gan heo.',
    items: [s('hutieu', 'Hủ tiếu', 25, '+25 máu, no bụng 1,5 phút.', { heal: 25, buff: { id: 'no', seconds: 90 } }), TRA_DA],
  },
  banhcuon: {
    kind: 'cart', icon: 'food', title: 'Bánh cuốn', verb: 'Gọi bánh cuốn', hours: [[6, 11]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Tráng tại chỗ trên nồi hơi, nhân thịt mộc nhĩ, chả lụa.',
    items: [s('banhcuon', 'Bánh cuốn chả lụa', 25, '+20 máu.', { heal: 20 }), TRA_DA],
  },
  banhcanh: {
    kind: 'cart', icon: 'food', title: 'Bánh canh', verb: 'Gọi bánh canh', hours: [[6, 14]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Bánh canh cua sệt sệt, chả cá, giò heo.',
    items: [s('banhcanh', 'Bánh canh cua', 30, '+25 máu, no bụng 1,5 phút.', { heal: 25, buff: { id: 'no', seconds: 90 } }), TRA_DA],
  },
  chaolong: {
    kind: 'cart', icon: 'food', title: 'Cháo lòng', verb: 'Gọi cháo', hours: [[16, 22]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Cháo lòng nóng hổi, quẩy và rau thơm.',
    items: [s('chaolong', 'Cháo lòng', 30, '+30 máu, no bụng 2 phút.', { heal: 30, buff: { id: 'no', seconds: 120 } }), TRA_DA],
  },
  nuocmia: {
    kind: 'kiosk', icon: 'coffee', title: 'Nước mía, dừa tươi', verb: 'Mua nước', hours: [[7, 21]], robbable: 0,
    intro: 'Máy ép mía chạy rè rè bên bờ sông, thêm chút tắc cho thơm.',
    items: [
      s('nuocmia', 'Nước mía', 10, '+8 máu, mát người 1,5 phút.', { heal: 8, buff: { id: 'mat', seconds: 90 }, litter: 1 }),
      s('dua', 'Dừa tươi', 20, 'Dừa xiêm Bến Tre · +12 máu, mát người 2 phút.', { heal: 12, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
    ],
  },
  biahoi: {
    kind: 'beer', icon: 'beer', title: 'Bia hơi Hà Nội', verb: 'Gọi bia', hours: [[16, 24]], robbable: 1, eatIn: true,
    intro: 'Bàn thấp, ghế nhựa, bia hơi rót từ bom. Một, hai, ba, dzô! Đã uống rượu bia thì không lái xe.',
    items: [
      s('ly', 'Ly bia hơi', 10, '+5 máu, hơi say.', { heal: 5, drunk: 20 }),
      s('thap', 'Tháp bia cả bàn', 60, '+15 máu, +30 điểm, say.', { heal: 15, score: 30, drunk: 90 }),
      s('moi', 'Mồi: khô mực, đậu phộng', 30, '+20 máu.', { heal: 20 }),
    ],
  },
  // Market stalls (sạp chợ), served by the market's vendors.
  sap: {
    kind: 'stall', icon: 'store', title: 'Sạp chợ', verb: 'Mua ở sạp', hours: [[5, 18]], robbable: 0, haggle: true,
    intro: 'Rau, cá, trái cây theo mùa. Mua ở chợ thì nhớ trả giá.',
    items: [
      s('rau', 'Bó rau thơm', 10, 'Húng quế, ngò gai, tía tô · +5 điểm.', { score: 5, item: 'bó rau' }),
      s('traicay', 'Trái cây', 15, 'Xoài cát, chôm chôm · +10 máu.', { heal: 10 }),
      s('ca', 'Cá tươi', 40, 'Cá lóc còn quẫy · mang về làm quà.', { item: 'cá tươi', score: 10 }),
      s('nuoc', 'Nước sâm', 6, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
    ],
  },
  // ---- Shops ----
  taphoa: {
    kind: 'taphoa', icon: 'store', title: 'Tạp hóa', verb: 'Mua đồ', hours: [[6, 22]], robbable: 1,
    intro: 'Cái gì cũng có: bánh kẹo, nước suối, băng keo cá nhân, cả vé số.',
    items: [
      s('banh', 'Bánh quy', 10, '+8 máu.', { heal: 8, litter: 1 }),
      s('nuoc', 'Nước suối', 6, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
      s('bang', 'Băng cá nhân', 15, '+15 máu.', { heal: 15 }),
      s('veso', 'Vé số', 10, 'Xổ số kiến thiết, quay lúc 16:15 · trúng 2 số cuối được 100.000đ.', { lottery: 1 }),
    ],
  },
  mart: {
    kind: 'mart', icon: 'store', title: 'Mini mart 24h', verb: 'Mua đồ', hours: ALL_DAY, robbable: 2,
    intro: 'Cửa hàng tiện lợi mở cả đêm, máy lạnh mát rượi. Có camera an ninh.',
    items: [
      s('mi', 'Mì ly', 12, '+12 máu.', { heal: 12, litter: 1 }),
      s('nuoc', 'Nước suối', 6, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
      s('caphelon', 'Cà phê lon', 15, '+5 máu, tỉnh táo 2 phút.', { heal: 5, buff: { id: 'tinh', seconds: 120 }, litter: 1 }),
      s('bang', 'Băng cá nhân', 15, '+15 máu.', { heal: 15 }),
      s('cuuthuong', 'Túi cứu thương', 60, 'Băng, gạc, thuốc sát trùng · +50 máu.', { heal: 50 }),
    ],
  },
  pharmacy: {
    kind: 'pharmacy', icon: 'pill', title: 'Nhà thuốc', verb: 'Mua thuốc', hours: [[7, 22]], robbable: 1,
    intro: 'Dược sĩ đứng quầy tư vấn. Bị thương nhẹ thì băng bó ở đây cho nhanh.',
    items: [
      s('gac', 'Băng gạc', 25, '+30 máu.', { heal: 30 }),
      s('cuuthuong', 'Túi cứu thương', 60, '+50 máu.', { heal: 50 }),
      s('giairuou', 'Thuốc giải rượu', 15, 'Hết say, tỉnh táo 2 phút.', { buff: { id: 'tinh', seconds: 120 } }),
      s('oresol', 'Oresol', 8, '+6 máu, mát người 2 phút.', { heal: 6, buff: { id: 'mat', seconds: 120 } }),
    ],
  },
  gold: {
    kind: 'gold', icon: 'gem', title: 'Tiệm vàng', verb: 'Xem vàng', hours: [[8, 20]], robbable: 3,
    intro: 'Tủ kính sáng choang, có chuông báo động nối thẳng về công an phường.',
    items: [
      s('nhan', 'Nhẫn vàng 18K', 500, 'Làm quà, làm của để dành · +50 điểm.', { item: 'nhẫn vàng', score: 50 }),
      s('daychuyen', 'Dây chuyền bạc', 200, '+20 điểm.', { item: 'dây chuyền bạc', score: 20 }),
    ],
  },
  barber: {
    kind: 'barber', icon: 'scissors', title: 'Tiệm tóc', verb: 'Cắt tóc', hours: [[7, 19]], robbable: 1,
    intro: 'Ghế xoay, gương lớn, quạt trần, radio mở cải lương. Cắt gọn cho mát đầu dưới nón bảo hiểm.',
    items: [
      s('cat', 'Cắt tóc, cạo râu', 40, 'Gọn gàng, mát đầu · mát người 3 phút, +10 điểm.', { buff: { id: 'mat', seconds: 180 }, score: 10 }),
      s('goi', 'Gội đầu, cạo mặt', 30, '+10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 } }),
    ],
  },
  tailor: {
    kind: 'tailor', icon: 'shirt', title: 'Tiệm may', verb: 'Đặt may', hours: [[7.5, 19]], robbable: 1,
    intro: 'Thợ may lâu năm, đo một lần là vừa. Có sẵn áo may sẵn để thay liền.',
    items: [
      s('ao', 'Áo sơ mi may sẵn', 120, 'Thay áo mới ngay tại tiệm.', { look: 'shirt' }),
      s('va', 'Vá áo, lên lai', 20, '+5 điểm.', { score: 5 }),
    ],
  },
  fashion: {
    kind: 'fashion', icon: 'shirt', title: 'Thời trang', verb: 'Mua áo', hours: [[9, 22]], robbable: 1,
    intro: 'Quần áo, giày dép, áo khoác chống nắng cho dân chạy xe.',
    items: [
      s('thun', 'Áo thun mới', 120, 'Thay áo mới ngay.', { look: 'shirt' }),
      s('khoac', 'Áo khoác chống nắng', 90, 'Thay áo khoác mới màu khác · mát người 3 phút.', { look: 'shirt', buff: { id: 'mat', seconds: 180 } }),
    ],
  },
  florist: {
    kind: 'florist', icon: 'flower', title: 'Tiệm hoa', verb: 'Mua hoa', hours: [[6, 20]], robbable: 1,
    intro: 'Hoa tươi mỗi sáng từ chợ hoa Hồ Thị Kỷ.',
    items: [
      s('hong', 'Bó hồng', 50, 'Tặng người thương · +30 điểm.', { item: 'bó hoa', score: 30 }),
      s('cuc', 'Hoa cúc cúng', 20, 'Để thắp hương · +10 điểm.', { score: 10 }),
    ],
  },
  books: {
    kind: 'books', icon: 'book', title: 'Nhà sách', verb: 'Mua sách', hours: [[8, 21]], robbable: 1,
    intro: 'Sách cũ, sách mới, báo sáng và bản đồ thành phố.',
    items: [
      s('bando', 'Bản đồ giấy Sài Gòn', 20, 'Tấm bản đồ in đẹp để làm quà · +10 điểm.', { score: 10, item: 'bản đồ giấy' }),
      s('truyen', 'Truyện tranh', 15, '+20 điểm.', { score: 20 }),
      s('bao', 'Báo hôm nay', 5, 'Có kết quả xổ số hôm qua · +5 điểm.', { score: 5 }),
    ],
  },
  repair: {
    kind: 'repair', icon: 'wrench', title: 'Sửa xe máy', verb: 'Sửa xe', hours: [[7, 20]], robbable: 1,
    intro: 'Tiệm sửa xe đầu hẻm: vá xe, thay nhớt, sửa đủ thứ. Dắt xe tới gần tiệm.',
    items: [
      s('va', 'Vá xe', 20, 'Vá ruột, bơm lại bánh.', { fix: 'tyre' }),
      s('nhot', 'Thay nhớt', 60, 'Máy êm hơn · +15% độ bền xe.', { fix: 'oil' }),
      s('sua', 'Sửa xe', 0, 'Giá tùy theo xe hỏng nặng hay nhẹ.', { fix: 'repair' }),
    ],
  },
  // ---- Services ----
  post: {
    kind: 'post', icon: 'post', title: 'Bưu điện', verb: 'Vào bưu điện', hours: [[7, 19]], robbable: 1,
    intro: 'Quầy giao dịch, tem thư và kiện hàng. Bưu tá cần người giao bưu phẩm quanh phố.',
    items: [
      s('viec', 'Nhận việc giao bưu phẩm', 0, 'Nhận hai bưu kiện và giao quanh phố (nhiệm vụ).', {}),
      s('guikien', 'Gửi bưu kiện', 25, 'Gửi quà về quê · +15 điểm.', { score: 15 }),
      s('tem', 'Tem và thiệp', 5, '+5 điểm.', { score: 5 }),
    ],
  },
  hotel: {
    kind: 'hotel', icon: 'hotel', title: 'Thuê phòng', verb: 'Thuê phòng', hours: ALL_DAY, robbable: 1,
    intro: 'Lễ tân trực 24/7. Ngủ một giấc là hồi sức, mà cũng là cách lánh mặt cảnh sát.',
    items: [
      s('nghi', 'Nghỉ 2 giờ', 150, 'Hồi đầy máu, thời gian trôi 2 giờ.', { full: true, hours: 2 }),
      s('quadem', 'Qua đêm', 300, 'Ngủ tới 7 giờ sáng · hồi đầy máu, cảnh sát mất dấu nếu bị truy nã tối đa 2 sao.', { full: true, wakeAt: 7, hide: 2 }),
    ],
  },
  police: {
    kind: 'police', icon: 'police', title: 'Công an phường', verb: 'Vào trực ban', hours: ALL_DAY, robbable: 0,
    intro: 'Trực ban 24/7: nộp phạt, lấy xe bị tạm giữ, ra đầu thú.', items: [],
  },
  bank: {
    kind: 'bank', icon: 'bank', title: 'Quầy giao dịch', verb: 'Giao dịch', hours: [[8, 16.5]], robbable: 0,
    intro: 'Tiền gửi tiết kiệm không mất khi bị hạ gục hay bị bắt. ATM bên hông mở 24/7.', items: [],
  },
  theatre: {
    kind: 'theatre', icon: 'ticket', title: 'Phòng vé Nhà hát', verb: 'Mua vé', hours: [[18, 21]], robbable: 1,
    intro: 'Cải lương, múa đương đại, hòa nhạc. Suất 19:30 và 21:00.',
    items: [s('ve', 'Vé xem diễn', 100, 'Thời gian trôi 2 giờ · +120 điểm.', { hours: 2, score: 120 })],
  },
  mall: {
    kind: 'mall', icon: 'ticket', title: 'Trung tâm thương mại', verb: 'Vào trung tâm', hours: [[9.5, 22]], robbable: 1, eatIn: true,
    intro: 'Rạp phim trên tầng 5, khu ẩm thực dưới tầng hầm, máy lạnh mát rượi.',
    items: [
      s('phim', 'Vé xem phim', 80, 'Phim Việt mới ra rạp · thời gian trôi 2 giờ, +80 điểm.', { hours: 2, score: 80 }),
      s('trasua', 'Trà sữa', 30, '+10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('comga', 'Cơm gà khu ẩm thực', 40, '+30 máu, no bụng 2 phút.', { heal: 30, buff: { id: 'no', seconds: 120 } }),
    ],
  },
  office: {
    kind: 'office', icon: 'coffee', title: 'Quầy cà phê sảnh', verb: 'Mua ở sảnh', hours: [[7, 18]], robbable: 1,
    intro: 'Văn phòng chỉ cho nhân viên có thẻ lên lầu, nhưng quầy cà phê ở sảnh bán cho cả khách.',
    items: [
      s('caphe', 'Cà phê mang đi', 25, '+8 máu, tỉnh táo 3 phút.', { heal: 8, buff: { id: 'tinh', seconds: 180 }, litter: 1 }),
      s('banhmi', 'Bánh mì que', 20, '+15 máu.', { heal: 15, litter: 1 }),
      s('nuoc', 'Nước suối', 8, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
    ],
  },
  school: {
    kind: 'school', icon: 'school', title: 'Hàng quà cổng trường', verb: 'Mua quà vặt', hours: [[10.5, 11.5], [16, 17.5]], robbable: 0,
    intro: 'Giờ tan trường, cô bán hàng rong dọn ra trước cổng. Khách lạ không được vào trường.',
    items: [
      s('banhtrang', 'Bánh tráng trộn', 15, '+10 máu.', { heal: 10, litter: 1 }),
      s('kem', 'Kem que', 8, '+3 máu, mát người 1,5 phút.', { heal: 3, buff: { id: 'mat', seconds: 90 }, litter: 1 }),
      s('bobia', 'Bò bía', 10, '+8 máu.', { heal: 8, litter: 1 }),
    ],
  },
  pagoda: {
    kind: 'pagoda', icon: 'pagoda', title: 'Chùa An Hòa', verb: 'Vào chùa', hours: [[5, 21]], robbable: 0,
    intro: 'Khói hương, tiếng chuông và mõ. Mùng một và ngày rằm chùa đông khách thập phương.',
    items: [
      s('huong', 'Thắp hương', 0, 'Tâm an, tỉnh táo 2 phút · mỗi ngày một lần.', { buff: { id: 'tinh', seconds: 120 }, score: 10 }),
      s('cungduong', 'Cúng dường', 20, 'Bỏ vào hòm công đức · +30 điểm.', { score: 30 }),
      s('xam', 'Xin xăm', 0, 'Rút một quẻ xăm cho hôm nay.', {}),
    ],
  },
  atm: {
    kind: 'atm', icon: 'bank', title: 'ATM · Ngân hàng Phương Nam', verb: 'Dùng ATM', hours: ALL_DAY, robbable: 0,
    intro: 'Rút tiền mặt từ tài khoản tiết kiệm. Phí mỗi lần rút 1.100đ.', items: [],
  },
  vending: {
    kind: 'vending', icon: 'coffee', title: 'Máy bán nước', verb: 'Mua nước', hours: ALL_DAY, robbable: 0,
    intro: 'Bỏ tiền, bấm nút, lon nước lạnh rơi xuống.',
    items: [
      s('lon', 'Nước ngọt lon', 12, '+5 máu, mát người 2 phút.', { heal: 5, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('suoi', 'Nước suối', 8, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
    ],
  },
  // Roaming hawkers (street-life 'hawker' role): a gánh or a cart, sold wherever they stop.
  'ganh-xoi': {
    kind: 'cart', icon: 'food', title: 'Gánh xôi', verb: 'Mua xôi', hours: ALL_DAY, robbable: 0,
    intro: 'Gánh xôi đi bán từ sáng sớm, gói lá chuối còn nóng.',
    items: [s('xoiman', 'Xôi mặn', 15, '+15 máu.', { heal: 15, litter: 1 }), s('xoibap', 'Xôi bắp', 10, '+10 máu.', { heal: 10, litter: 1 })],
  },
  'ganh-banhmi': {
    kind: 'cart', icon: 'food', title: 'Xe bánh mì', verb: 'Mua bánh mì', hours: ALL_DAY, robbable: 0,
    intro: 'Xe đẩy bánh mì có lò than nhỏ, kêu "Bánh mì nóng đây!" khắp hẻm.',
    items: [s('thit', 'Bánh mì thịt', 18, '+15 máu.', { heal: 15, litter: 1 }), s('trung', 'Bánh mì trứng', 15, '+12 máu.', { heal: 12, litter: 1 })],
  },
  'ganh-fruit': {
    kind: 'stall', icon: 'food', title: 'Gánh trái cây', verb: 'Mua trái cây', hours: ALL_DAY, robbable: 0, haggle: true,
    intro: 'Xoài, ổi, mận gọt sẵn, chấm muối ớt.',
    items: [s('xoai', 'Xoài xanh chấm muối', 15, '+10 máu, mát người 1 phút.', { heal: 10, buff: { id: 'mat', seconds: 60 }, litter: 1 }), s('oi', 'Ổi xá lị', 10, '+8 máu.', { heal: 8, litter: 1 })],
  },
  'ganh-kem': {
    kind: 'cart', icon: 'food', title: 'Xe kem', verb: 'Mua kem', hours: ALL_DAY, robbable: 0,
    intro: 'Tiếng chuông leng keng của xe kem dạo buổi trưa.',
    items: [s('kemque', 'Kem que', 8, '+3 máu, mát người 1,5 phút.', { heal: 3, buff: { id: 'mat', seconds: 90 }, litter: 1 }), s('kemdua', 'Kem dừa', 20, '+6 máu, mát người 2 phút.', { heal: 6, buff: { id: 'mat', seconds: 120 }, litter: 1 })],
  },
  'ganh-hotvitlon': {
    kind: 'cart', icon: 'food', title: 'Hột vịt lộn', verb: 'Mua hột vịt lộn', hours: ALL_DAY, robbable: 0,
    intro: 'Hột vịt lộn luộc nóng, rau răm, muối tiêu chanh.',
    items: [s('hotvit', 'Hột vịt lộn', 10, '+10 máu, no bụng 1 phút.', { heal: 10, buff: { id: 'no', seconds: 60 } })],
  },
  veso: {
    kind: 'lottery', icon: 'ticket', title: 'Vé số', verb: 'Mua vé số', hours: [[6.5, 19.5]], robbable: 0,
    intro: 'Xổ số kiến thiết quay lúc 16:15 mỗi ngày. Mỗi tờ 10.000đ, giữ tối đa 10 tờ.',
    items: [s('veso', 'Một tờ vé số', 10, 'Trúng 2 số cuối 100.000đ, 3 số 1 triệu, 4 số 10 triệu.', { lottery: 1 })],
  },
};

/**
 * The dish street life serves at each eatery counter: its stools, cook and diners are out exactly while the counter
 * sells (one clock, street-life.ts MENU), so a quán never sells to empty stools or turns away a full table.
 */
export const COUNTER_DISH: Partial<Record<string, Dish>> = {
  coba: 'cafe', rooftop: 'cafe', trasua: 'trasua', pho: 'pho', phohn: 'pho', banhmi: 'banhmi', buncha: 'bun', comtam: 'com', nhahang: 'com',
  bunrieu: 'bunrieu', banhxeo: 'banhxeo', xoi: 'xoi', che: 'che', hutieu: 'hutieu', banhcuon: 'banhcuon', banhcanh: 'banhcanh', chaolong: 'chao',
  biahoi: 'bia',
};
/** MENU spans (b < a wraps past midnight) as counter hours (a close past 24 runs over midnight). */
export const menuHours = (spans: readonly (readonly [number, number])[]): Hours => spans.map(([a, b]) => [a, b <= a ? b + 24 : b] as const);
for (const [key, dish] of Object.entries(COUNTER_DISH)) if (dish) COUNTERS[key].hours = menuHours(MENU[dish]);

// ---- The districts' trades ----------------------------------------------------------------------------------------
// Every sign the generator puts on a district shophouse, kiosk or stamp (gen/buildings.ts STALLS, OC, SEAFOOD, BEER,
// NIGHT_FOOD, CAFES, SHOPS, MARKET_SHOPS) sells what it says. Today's carts and quán carry an owner's name in their
// title (Bún riêu Cô Hai); the districts' get a plain one, the sign's own name heads the panel.
const BIA = s('bia', 'Bia lon', 20, '+5 máu, hơi say.', { heal: 5, drunk: 25 });
const NUOC = s('nuoc', 'Nước suối', 8, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 });
const FOOT_NHAU = 'Đã uống rượu bia thì không lái xe. Ngồi ghế nhựa ăn tại chỗ hồi thêm 30% máu.';
/** A district version of a counter with its own title (and anything else that differs). */
const alias = (key: string, patch: Partial<CounterDef>): CounterDef => ({ ...COUNTERS[key], ...patch });
const DISTRICT_COUNTERS: Record<string, CounterDef> = {
  // ---- Night food: Vĩnh Khánh's ốc, seafood, the grill, hotpot, nhậu ----
  oc: {
    kind: 'food', icon: 'food', title: 'Gọi ốc', verb: 'Gọi ốc', hours: [[16, 24.5]], robbable: 1, eatIn: true, foot: FOOT_NHAU,
    intro: 'Thau ốc bày trước cửa, bếp than đỏ rực, khách ngồi tràn xuống vỉa hè tới khuya.',
    items: [
      s('oclen', 'Ốc len xào dừa', 60, 'Nước cốt dừa béo, hút rột rột · +25 máu.', { heal: 25 }),
      s('sodiep', 'Sò điệp nướng mỡ hành', 70, '+28 máu.', { heal: 28 }),
      s('ochuong', 'Ốc hương rang muối ớt', 120, 'Cả dĩa cho nhóm bạn · +45 máu, no bụng 2 phút.', { heal: 45, buff: { id: 'no', seconds: 120 } }),
      s('ngheu', 'Nghêu hấp sả', 50, '+20 máu.', { heal: 20 }),
      BIA,
    ],
  },
  haisan: {
    kind: 'food', icon: 'food', title: 'Gọi hải sản', verb: 'Gọi món', hours: [[16, 23.5]], robbable: 1, eatIn: true, foot: FOOT_NHAU,
    intro: 'Bể kính sục khí đầy tôm cua, chọn con nào làm con nấy, tính tiền theo ký.',
    items: [
      s('tom', 'Tôm nướng muối ớt', 150, '+45 máu, no bụng 2 phút.', { heal: 45, buff: { id: 'no', seconds: 120 } }),
      s('muc', 'Mực hấp gừng', 120, '+40 máu.', { heal: 40 }),
      s('ghe', 'Càng ghẹ rang muối', 180, '+55 máu, no bụng 3 phút.', { heal: 55, buff: { id: 'no', seconds: 180 } }),
      BIA,
    ],
  },
  nuong: {
    kind: 'food', icon: 'food', title: 'Gọi đồ nướng', verb: 'Gọi đồ nướng', hours: [[16.5, 23.5]], robbable: 1, eatIn: true, foot: FOOT_NHAU,
    intro: 'Bếp than giữa bàn, thịt ướp sa tế, khói thơm cả khúc đường.',
    items: [
      s('bo', 'Bò nướng ngói', 120, '+40 máu, no bụng 2 phút.', { heal: 40, buff: { id: 'no', seconds: 120 } }),
      s('muc', 'Mực nướng sa tế', 110, '+38 máu.', { heal: 38 }),
      s('bachi', 'Ba chỉ nướng', 90, '+32 máu.', { heal: 32 }),
      BIA,
    ],
  },
  lau: {
    kind: 'food', icon: 'food', title: 'Gọi lẩu', verb: 'Gọi lẩu', hours: [[17, 23.5]], robbable: 1, eatIn: true, foot: FOOT_NHAU,
    intro: 'Nồi lẩu sôi lục bục trên bếp ga mini, rau nhúng chất đầy rổ.',
    items: [
      s('laude', 'Lẩu dê', 250, 'Cả nồi cho nhóm bạn · hồi đầy máu, no bụng 5 phút.', { full: true, buff: { id: 'no', seconds: 300 } }),
      s('laubo', 'Lẩu bò nhúng giấm', 220, 'Hồi đầy máu, no bụng 4 phút.', { full: true, buff: { id: 'no', seconds: 240 } }),
      s('laithai', 'Lẩu Thái hải sản', 280, 'Chua cay · hồi đầy máu, no bụng 5 phút.', { full: true, buff: { id: 'no', seconds: 300 } }),
      s('ngot', 'Nước ngọt', 15, '+5 máu, mát người 1 phút.', { heal: 5, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
    ],
  },
  nhau: {
    kind: 'beer', icon: 'beer', title: 'Gọi bia', verb: 'Gọi bia', hours: [[16, 24]], robbable: 1, eatIn: true, foot: FOOT_NHAU,
    intro: 'Bàn thấp, ghế nhựa, thùng đá bia bên chân. Một, hai, ba, dzô!',
    items: [
      BIA,
      s('thung', 'Thùng bia cả bàn', 220, '+20 máu, +40 điểm, say.', { heal: 20, score: 40, drunk: 100 }),
      s('khomuc', 'Khô mực nướng', 60, '+20 máu.', { heal: 20 }),
      s('long', 'Lòng xào nghệ', 70, '+25 máu.', { heal: 25 }),
    ],
  },
  // ---- Phố Tây's trades (Bùi Viện) ----
  spa: {
    kind: 'barber', icon: 'flower', title: 'Massage', verb: 'Vào massage', hours: [[10, 24]], robbable: 1,
    intro: 'Ghế ngả, chậu ngâm chân thảo dược, máy lạnh mát rượi. Nhân viên bấm huyệt cho khách vừa cuốc bộ cả ngày.',
    items: [
      s('chan', 'Massage chân 45 phút', 150, 'Ngâm chân, bấm huyệt · +30 máu, mát người 3 phút, thời gian trôi 45 phút.', { heal: 30, buff: { id: 'mat', seconds: 180 }, hours: 0.75 }),
      s('body', 'Massage body 60 phút', 280, 'Hồi đầy máu, thời gian trôi 1 giờ.', { full: true, hours: 1 }),
    ],
  },
  doitien: {
    kind: 'gold', icon: 'gem', title: 'Quầy đổi tiền', verb: 'Vào quầy đổi tiền', hours: [[8, 23]], robbable: 3,
    intro: 'Bảng tỷ giá đèn LED, USD, EUR, Won đổi tại chỗ. Có camera và bảo vệ.',
    items: [
      s('sim', 'Sim du lịch 4G', 120, 'Gọi điện, xem bản đồ cả tháng · +10 điểm.', { item: 'sim du lịch', score: 10 }),
      s('bando', 'Bản đồ Sài Gòn', 30, 'Bản đồ giấy song ngữ · +5 điểm.', { item: 'bản đồ Sài Gòn', score: 5 }),
    ],
  },
  tour: {
    kind: 'ticket', icon: 'ticket', title: 'Tour và vé xe', verb: 'Hỏi tour', hours: [[8, 22]], robbable: 1,
    intro: 'Tờ rơi Củ Chi, Mỹ Tho, Vũng Tàu dán kín tường; vé xe khách giường nằm đi khắp nơi.',
    items: [
      s('xichlo', 'Tour xích lô phố cổ', 200, 'Một vòng Bến Thành, Đồng Khởi, Nhà thờ Đức Bà · +30 điểm, thời gian trôi 1 giờ.', { score: 30, hours: 1 }),
      s('cuchi', 'Vé tour địa đạo Củ Chi', 350, 'Đi sáng mai, xe đón tại khách sạn · +25 điểm.', { item: 'vé tour Củ Chi', score: 25 }),
      s('vexe', 'Vé xe khách đi Vũng Tàu', 160, 'Xe giường nằm, khởi hành 6 giờ sáng · +10 điểm.', { item: 'vé xe Vũng Tàu', score: 10 }),
    ],
  },
  tattoo: {
    kind: 'barber', icon: 'scissors', title: 'Tiệm xăm', verb: 'Vào tiệm xăm', hours: [[11, 24]], robbable: 1,
    intro: 'Đèn trắng, ghế da, album hình xăm dày cộm. Thợ xăm vừa làm vừa nghe nhạc rock.',
    items: [
      s('nho', 'Xăm hình nhỏ', 300, 'Một bông sen trên cổ tay · +30 điểm.', { score: 30, item: 'hình xăm bông sen' }),
      s('khuyen', 'Xỏ khuyên tai', 100, '+10 điểm.', { score: 10 }),
    ],
  },
  bar: {
    kind: 'beer', icon: 'beer', title: 'Gọi đồ uống', verb: 'Gọi đồ uống', hours: [[17, 26]], robbable: 2, eatIn: true, foot: 'Đã uống rượu bia thì không lái xe.',
    intro: 'Đèn lồng giăng ngang phố đi bộ, nhạc sống mở hết cỡ, khách Tây khách ta ngồi tràn ra đường.',
    items: [
      s('bia', 'Bia Sài Gòn', 30, '+5 máu, hơi say.', { heal: 5, drunk: 30 }),
      s('cocktail', 'Cocktail', 90, '+30 điểm, say.', { score: 30, drunk: 70 }),
      s('nuocep', 'Nước ép trái cây', 50, '+12 máu, mát người 2 phút.', { heal: 12, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
    ],
  },
  chaovit: {
    kind: 'food', icon: 'food', title: 'Gọi cháo vịt', verb: 'Gọi cháo vịt', hours: [[16, 23]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Vịt luộc chặt dĩa, gỏi bắp cải, chấm nước mắm gừng.',
    items: [s('chao', 'Cháo vịt', 40, '+30 máu, no bụng 2 phút.', { heal: 30, buff: { id: 'no', seconds: 120 } }), s('goi', 'Gỏi vịt', 80, '+35 máu.', { heal: 35 }), TRA_DA],
  },
  // ---- Day food ----
  namvang: {
    kind: 'food', icon: 'food', title: 'Gọi hủ tiếu', verb: 'Gọi hủ tiếu', hours: [[6, 13], [16, 21]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Hủ tiếu Nam Vang khô hay nước, tôm, gan, thịt bằm, trứng cút.',
    items: [s('nuoc', 'Hủ tiếu Nam Vang nước', 55, '+35 máu, no bụng 2 phút.', { heal: 35, buff: { id: 'no', seconds: 120 } }), s('kho', 'Hủ tiếu khô', 55, '+35 máu, no bụng 2 phút.', { heal: 35, buff: { id: 'no', seconds: 120 } }), TRA_DA],
  },
  bunbo: {
    kind: 'food', icon: 'food', title: 'Gọi bún bò', verb: 'Gọi bún bò', hours: [[6, 13], [16, 21]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Bún bò Huế cay nồng mùi sả, giò heo, chả cua.',
    items: [s('bunbo', 'Bún bò Huế', 50, '+35 máu, no bụng 2 phút.', { heal: 35, buff: { id: 'no', seconds: 120 } }), s('dacbiet', 'Bún bò đặc biệt', 65, '+45 máu, no bụng 3 phút.', { heal: 45, buff: { id: 'no', seconds: 180 } }), TRA_DA],
  },
  binhdan: {
    kind: 'food', icon: 'food', title: 'Gọi cơm', verb: 'Gọi cơm', hours: [[10, 14], [16.5, 20]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Tủ kính bày chục món: cá kho, thịt kho trứng, canh chua, rau luộc. Chỉ món nào lấy món đó.',
    items: [s('com', 'Cơm hai món', 35, '+30 máu, no bụng 2 phút.', { heal: 30, buff: { id: 'no', seconds: 120 } }), s('ba', 'Cơm ba món', 45, '+38 máu, no bụng 3 phút.', { heal: 38, buff: { id: 'no', seconds: 180 } }), s('canh', 'Canh chua', 15, '+10 máu.', { heal: 10 }), TRA_DA],
  },
  ganuong: {
    kind: 'food', icon: 'food', title: 'Gọi cơm gà', verb: 'Gọi món', hours: [[10, 21]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Gà nướng mật ong trên lò than, cơm gà xối mỡ giòn rụm.',
    items: [s('xoimo', 'Cơm gà xối mỡ', 45, '+32 máu, no bụng 2 phút.', { heal: 32, buff: { id: 'no', seconds: 120 } }), s('nuong', 'Gà nướng nửa con', 120, '+50 máu, no bụng 3 phút.', { heal: 50, buff: { id: 'no', seconds: 180 } }), TRA_DA],
  },
  bobia: {
    kind: 'food', icon: 'food', title: 'Mua bò bía', verb: 'Mua bò bía', hours: [[14, 21]], robbable: 0, eatIn: true, foot: FOOT_FOOD,
    intro: 'Bò bía lạp xưởng, củ sắn, trứng chiên; gỏi cuốn tôm thịt chấm tương đen.',
    items: [s('bobia', 'Bò bía (5 cuốn)', 25, '+15 máu.', { heal: 15, litter: 1 }), s('goicuon', 'Gỏi cuốn (3 cuốn)', 30, '+18 máu.', { heal: 18, litter: 1 })],
  },
  bunthitnuong: {
    kind: 'food', icon: 'food', title: 'Gọi bún thịt nướng', verb: 'Gọi món', hours: [[10, 21]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Thịt nướng than, chả giò, đồ chua, đậu phộng, mỡ hành, nước mắm chua ngọt.',
    items: [s('bun', 'Bún thịt nướng chả giò', 45, '+32 máu, no bụng 2 phút.', { heal: 32, buff: { id: 'no', seconds: 120 } }), s('nem', 'Nem nướng', 40, '+25 máu.', { heal: 25 }), TRA_DA],
  },
  miquang: {
    kind: 'food', icon: 'food', title: 'Gọi mì Quảng', verb: 'Gọi mì Quảng', hours: [[6, 14]], robbable: 1, eatIn: true, foot: FOOT_FOOD,
    intro: 'Mì Quảng tôm thịt, bánh tráng mè, rau sống, ít nước mà đậm.',
    items: [s('mi', 'Mì Quảng tôm thịt', 45, '+32 máu, no bụng 2 phút.', { heal: 32, buff: { id: 'no', seconds: 120 } }), s('caolau', 'Cao lầu', 45, '+30 máu.', { heal: 30 }), TRA_DA],
  },
  'q-bunrieu': alias('bunrieu', { kind: 'food', title: 'Gọi bún riêu' }),
  'q-banhxeo': alias('banhxeo', { kind: 'food', title: 'Gọi bánh xèo' }),
  'q-xoi': alias('xoi', { kind: 'food', title: 'Mua xôi' }),
  'q-che': alias('che', { kind: 'food', title: 'Mua chè' }),
  'q-hutieu': alias('hutieu', { kind: 'food', title: 'Gọi hủ tiếu gõ' }),
  'q-banhcuon': alias('banhcuon', { kind: 'food', title: 'Gọi bánh cuốn' }),
  'q-banhcanh': alias('banhcanh', { kind: 'food', title: 'Gọi bánh canh' }),
  'q-chaolong': alias('chaolong', { kind: 'food', title: 'Gọi cháo lòng' }),
  'q-phobo': alias('pho', { title: 'Gọi phở' }),
  'q-nuocmia': alias('nuocmia', { kind: 'cafe', eatIn: true, intro: 'Máy ép mía chạy rè rè, thêm chút tắc cho thơm; dừa xiêm chặt tại chỗ.' }),
  // ---- Cafés ----
  sinhto: {
    kind: 'cafe', icon: 'coffee', title: 'Gọi sinh tố', verb: 'Gọi sinh tố', hours: [[7, 22]], robbable: 1, eatIn: true,
    intro: 'Tủ trái cây xếp đầy, máy xay chạy suốt: bơ, mãng cầu, dâu, cam vắt.',
    items: [
      s('bo', 'Sinh tố bơ', 30, '+12 máu, mát người 2 phút.', { heal: 12, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('cam', 'Nước cam vắt', 30, '+12 máu, mát người 2 phút.', { heal: 12, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('dua', 'Dừa tươi', 25, '+10 máu, mát người 2 phút.', { heal: 10, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
    ],
  },
  trada: {
    kind: 'cafe', icon: 'coffee', title: 'Gọi trà', verb: 'Gọi trà chanh', hours: [[8, 23]], robbable: 1, eatIn: true,
    intro: 'Ghế nhựa quay ra đường, ly trà chanh to, bịch hướng dương cắn suốt buổi.',
    items: [
      s('trachanh', 'Trà chanh', 15, '+5 máu, mát người 2 phút.', { heal: 5, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('tratac', 'Trà tắc', 12, '+4 máu, mát người 2 phút.', { heal: 4, buff: { id: 'mat', seconds: 120 }, litter: 1 }),
      s('huongduong', 'Hướng dương', 15, '+5 điểm.', { score: 5, litter: 1 }),
    ],
  },
  // ---- Shops ----
  phone: {
    kind: 'shop', icon: 'store', title: 'Điện thoại', verb: 'Xem điện thoại', hours: [[8, 21.5]], robbable: 2,
    intro: 'Điện thoại cũ mới, sim số đẹp, ốp lưng, cáp sạc treo kín tường.',
    items: [s('sac', 'Sạc dự phòng', 150, 'Mang theo khỏi lo hết pin · +10 điểm.', { item: 'sạc dự phòng', score: 10 }), s('sim', 'Sim số đẹp', 100, '+20 điểm.', { score: 20 }), s('op', 'Ốp lưng', 50, '+5 điểm.', { score: 5 })],
  },
  photo: {
    kind: 'shop', icon: 'book', title: 'Photo – in ấn', verb: 'Photo giấy tờ', hours: [[7, 21]], robbable: 1,
    intro: 'Máy photo chạy không nghỉ, in ảnh, ép plastic, đánh máy hồ sơ.',
    items: [s('photo', 'Photo giấy tờ', 2, '+2 điểm.', { score: 2 }), s('ep', 'Ép plastic', 5, '+3 điểm.', { score: 3 }), s('in', 'In ảnh màu', 10, '+5 điểm.', { score: 5 })],
  },
  stationery: {
    kind: 'shop', icon: 'book', title: 'Văn phòng phẩm', verb: 'Mua đồ', hours: [[7, 21]], robbable: 1,
    intro: 'Tập vở, bút bi, giấy gói quà, bản đồ thành phố.',
    items: [s('but', 'Bút bi', 5, '+2 điểm.', { score: 2 }), s('tap', 'Tập vở', 15, '+5 điểm.', { score: 5 }), s('bando', 'Bản đồ giấy Sài Gòn', 20, '+10 điểm.', { score: 10, item: 'bản đồ giấy' })],
  },
  appliance: {
    kind: 'shop', icon: 'store', title: 'Điện máy', verb: 'Xem đồ điện', hours: [[8, 21]], robbable: 2,
    intro: 'Quạt, nồi cơm, tivi chất tới trần, ông chủ ngồi canh từ sáng tới tối.',
    items: [s('quat', 'Quạt mini cầm tay', 90, 'Mát người 5 phút.', { buff: { id: 'mat', seconds: 300 } }), s('den', 'Đèn pin', 60, '+5 điểm.', { item: 'đèn pin', score: 5 })],
  },
  gas: {
    kind: 'shop', icon: 'store', title: 'Gas – nước đá', verb: 'Mua nước đá', hours: [[6, 21]], robbable: 1,
    intro: 'Bình gas xếp hàng, thùng nước đá, bình nước 20 lít giao tận nhà.',
    items: [s('da', 'Bọc nước đá', 5, 'Mát người 2 phút.', { buff: { id: 'mat', seconds: 120 } }), NUOC, s('binh', 'Bình nước 20 lít', 25, '+10 máu.', { heal: 10 })],
  },
  hardware: {
    kind: 'shop', icon: 'wrench', title: 'Kim khí – điện nước', verb: 'Mua đồ', hours: [[7, 20]], robbable: 1,
    intro: 'Ốc vít, ổ khóa, bóng đèn, dây điện, cái gì cũng có trong mấy chục ngăn kéo.',
    items: [s('khoa', 'Ổ khóa chống trộm', 60, 'Khóa xe cho chắc · +5 điểm.', { item: 'ổ khóa', score: 5 }), s('bong', 'Bóng đèn', 30, '+5 điểm.', { score: 5 }), s('keo', 'Cuộn băng keo', 10, '+2 điểm.', { score: 2 })],
  },
  shoes: {
    kind: 'shop', icon: 'shirt', title: 'Giày dép', verb: 'Xem giày dép', hours: [[8, 21.5]], robbable: 1,
    intro: 'Dép tổ ong, dép lào, giày thể thao xếp tận ra vỉa hè.',
    items: [s('tong', 'Dép tổ ong', 30, '+5 điểm.', { score: 5 }), s('lao', 'Dép lào', 25, '+5 điểm.', { score: 5 }), s('giay', 'Giày thể thao', 250, '+30 điểm.', { score: 30, item: 'giày mới' })],
  },
  rice: {
    kind: 'shop', icon: 'store', title: 'Gạo', verb: 'Mua gạo', hours: [[6, 20]], robbable: 1,
    intro: 'Bao gạo mở miệng bày cả dãy: ST25, Nàng Hương, nếp cái hoa vàng.',
    items: [s('st25', 'Gạo ST25 (5 kg)', 180, 'Mang về làm quà · +20 điểm.', { item: 'gạo ST25', score: 20 }), s('nep', 'Nếp cái (1 kg)', 40, '+5 điểm.', { score: 5 })],
  },
  dentist: {
    kind: 'clinic', icon: 'pill', title: 'Nha khoa', verb: 'Khám răng', hours: [[8, 20]], robbable: 1,
    intro: 'Ghế nha sĩ, đèn sáng trắng, tiếng máy khoan ro ro.',
    items: [s('kham', 'Khám và cạo vôi răng', 150, '+10 máu, +10 điểm.', { heal: 10, score: 10 }), s('tram', 'Trám răng', 200, '+15 máu.', { heal: 15 })],
  },
  photostudio: {
    kind: 'shop', icon: 'ticket', title: 'Tiệm ảnh', verb: 'Chụp ảnh', hours: [[8, 21]], robbable: 1,
    intro: 'Phông xanh, đèn flash, chụp ảnh thẻ lấy liền.',
    items: [s('the', 'Chụp ảnh thẻ', 30, '+10 điểm.', { score: 10 }), s('kyniem', 'Ảnh kỷ niệm Sài Gòn', 80, '+30 điểm.', { score: 30, item: 'ảnh kỷ niệm' })],
  },
  fabric: {
    kind: 'stall', icon: 'shirt', title: 'Sạp vải', verb: 'Xem vải', hours: [[6, 18]], robbable: 0, haggle: true,
    intro: 'Cây vải xếp chồng, cô chủ đo vải bằng sải tay. Mua vải thì nhớ trả giá.',
    items: [s('vai', 'Vải may áo dài', 150, '+20 điểm.', { item: 'vải lụa', score: 20 }), s('khan', 'Khăn rằn', 30, '+5 điểm.', { item: 'khăn rằn', score: 5 })],
  },
  dried: {
    kind: 'stall', icon: 'store', title: 'Sạp đồ khô', verb: 'Mua đồ khô', hours: [[6, 18]], robbable: 0, haggle: true,
    intro: 'Tôm khô, mực khô, nấm đông cô, hạt điều; mùi biển thơm cả dãy.',
    items: [s('muc', 'Khô mực (0,5 kg)', 120, 'Làm quà · +15 điểm.', { item: 'khô mực', score: 15 }), s('tom', 'Tôm khô', 150, '+15 điểm.', { item: 'tôm khô', score: 15 }), s('dieu', 'Hạt điều rang muối', 60, '+15 máu.', { heal: 15 })],
  },
  fruit: {
    kind: 'stall', icon: 'food', title: 'Sạp trái cây', verb: 'Mua trái cây', hours: [[5.5, 19]], robbable: 0, haggle: true,
    intro: 'Trái cây miền Tây chất thành núi: xoài cát, măng cụt, chôm chôm, dưa hấu.',
    items: [s('xoai', 'Xoài cát Hòa Lộc', 40, '+12 máu.', { heal: 12 }), s('mangcut', 'Măng cụt (1 kg)', 50, '+15 máu.', { heal: 15 }), s('duahau', 'Dưa hấu ướp lạnh', 30, '+12 máu, mát người 2 phút.', { heal: 12, buff: { id: 'mat', seconds: 120 } })],
  },
  spice: {
    kind: 'stall', icon: 'store', title: 'Sạp gia vị', verb: 'Mua gia vị', hours: [[5.5, 18]], robbable: 0, haggle: true,
    intro: 'Hũ mắm, chai nước mắm, bao tiêu ớt; cô chủ cho nếm thử từng loại.',
    items: [s('mam', 'Nước mắm Phú Quốc', 60, 'Mang về làm quà · +10 điểm.', { item: 'nước mắm', score: 10 }), s('ruoc', 'Mắm ruốc', 30, '+5 điểm.', { score: 5 })],
  },
  plastic: {
    kind: 'stall', icon: 'store', title: 'Sạp đồ nhựa', verb: 'Mua đồ nhựa', hours: [[6, 18]], robbable: 0, haggle: true,
    intro: 'Ghế nhựa đỏ xếp chồng cao quá đầu, thau, rổ, xô đủ màu.',
    items: [s('ghe', 'Ghế nhựa đỏ', 25, 'Đúng chiếc ghế của mọi quán vỉa hè · +5 điểm.', { item: 'ghế nhựa', score: 5 }), s('thau', 'Thau nhựa', 30, '+3 điểm.', { score: 3 })],
  },
  butcher: {
    kind: 'stall', icon: 'store', title: 'Sạp thịt', verb: 'Mua thịt', hours: [[5, 12]], robbable: 0, haggle: true,
    intro: 'Thịt heo mới mổ lúc khuya, chặt tại chỗ trên thớt gỗ.',
    items: [s('bachi', 'Thịt ba chỉ (0,5 kg)', 70, 'Mang về nấu cơm · +10 điểm.', { item: 'thịt heo', score: 10 }), s('suon', 'Sườn non (0,5 kg)', 90, '+10 điểm.', { item: 'sườn', score: 10 })],
  },
  veg: {
    kind: 'stall', icon: 'store', title: 'Sạp rau', verb: 'Mua rau', hours: [[5, 13]], robbable: 0, haggle: true,
    intro: 'Rau Đà Lạt, rau thơm, chanh ớt; mua bó rau là được cho thêm nắm hành.',
    items: [s('rau', 'Rau sạch Đà Lạt', 20, '+5 điểm.', { score: 5, item: 'bó rau' }), s('thom', 'Bó rau thơm', 10, '+3 điểm.', { score: 3 })],
  },
  market: {
    kind: 'market', icon: 'store', title: 'Đi chợ', verb: 'Vào chợ', hours: [[5, 18]], robbable: 0, haggle: true,
    intro: 'Lối đi hẹp giữa các sạp, tiếng mời chào, mùi cá tươi, trái cây, cà phê rang. Mua ở chợ thì nhớ trả giá.',
    items: [
      s('rau', 'Bó rau thơm', 10, 'Húng quế, ngò gai, tía tô · +5 điểm.', { score: 5, item: 'bó rau' }),
      s('traicay', 'Trái cây', 20, 'Xoài, chôm chôm · +12 máu.', { heal: 12 }),
      s('ca', 'Cá tươi', 40, 'Cá lóc còn quẫy · mang về làm quà.', { item: 'cá tươi', score: 10 }),
      s('nonla', 'Nón lá', 50, 'Che nắng · +10 điểm.', { item: 'nón lá', score: 10 }),
      s('nuoc', 'Nước sâm', 8, '+3 máu, mát người 1 phút.', { heal: 3, buff: { id: 'mat', seconds: 60 }, litter: 1 }),
    ],
  },
  'cho-dem': {
    kind: 'stall', icon: 'shirt', title: 'Chợ đêm', verb: 'Xem hàng', hours: [[18, 24]], robbable: 0, haggle: true,
    intro: 'Sạp chợ đêm bày áo thun, nón lá, móc khóa, đồ lưu niệm. Giá nói thách, nhớ trả giá.',
    items: [s('ao', 'Áo thun Sài Gòn', 120, 'Thay áo mới ngay.', { look: 'shirt' }), s('nonla', 'Nón lá', 50, '+10 điểm.', { item: 'nón lá', score: 10 }), s('mockhoa', 'Móc khóa xích lô', 20, '+5 điểm.', { score: 5 })],
  },
  'sap-ben-thanh': alias('sap', { title: 'Sạp quanh chợ', hours: [[6, 24]], intro: 'Sạp quanh chợ Bến Thành: trái cây cắt sẵn, đồ khô, nón lá và quà lưu niệm. Mua ở chợ thì nhớ trả giá.' }),
  'sach-cu': alias('books', { title: 'Đường sách', intro: 'Sạp sách cũ dưới tán cây: truyện, sách xưa, bưu thiếp Sài Gòn.', hours: [[8, 21]] }),
  // ---- Services ----
  chua: alias('pagoda', { title: 'Thắp hương', intro: 'Khói hương, tiếng chuông và mõ. Mùng một và ngày rằm chùa đông khách thập phương.' }),
  church: {
    kind: 'church', icon: 'pagoda', title: 'Nhà thờ', verb: 'Vào nhà thờ', hours: [[5, 20]], robbable: 0,
    intro: 'Hàng ghế gỗ, tượng Đức Mẹ, ánh nến lung linh. Thánh lễ 5:00 và 17:30, giữ trật tự trong nhà thờ.',
    items: [
      s('nen', 'Thắp nến cầu nguyện', 5, 'Tâm an, tỉnh táo 2 phút · +10 điểm.', { buff: { id: 'tinh', seconds: 120 }, score: 10 }),
      s('hoa', 'Dâng hoa', 30, '+20 điểm.', { score: 20 }),
    ],
  },
  clinic: {
    kind: 'clinic', icon: 'pill', title: 'Phòng khám', verb: 'Khám bệnh', hours: ALL_DAY, robbable: 0,
    intro: 'Trực cấp cứu 24/24. Vết thương nhẹ được băng bó ngay ở phòng khám.',
    items: [s('bang', 'Băng bó vết thương', 30, '+30 máu.', { heal: 30 }), s('kham', 'Khám tổng quát', 80, '+60 máu.', { heal: 60 }), s('thuoc', 'Thuốc hạ sốt', 15, '+10 máu.', { heal: 10 })],
  },
  congan: alias('police', { title: 'Trực ban công an' }),
  buudien: alias('post', { title: 'Bưu điện Thành phố', intro: 'Mái vòm sắt, bản đồ Sài Gòn xưa trên tường, quầy bán tem và bưu thiếp.', items: [s('buuthiep', 'Bưu thiếp Sài Gòn', 10, '+10 điểm.', { score: 10 }), s('guikien', 'Gửi bưu kiện', 25, 'Gửi quà về quê · +15 điểm.', { score: 15 }), s('tem', 'Tem kỷ niệm', 5, '+5 điểm.', { score: 5 })] }),
  'dinh-doc-lap': {
    kind: 'ticket', icon: 'ticket', title: 'Vé tham quan', verb: 'Mua vé tham quan', hours: [[8, 16.5]], robbable: 0,
    intro: 'Di tích quốc gia đặc biệt: phòng họp nội các, hầm chỉ huy, xe tăng trong sân.',
    items: [s('ve', 'Vé tham quan', 65, 'Một giờ đi khắp dinh · +60 điểm.', { hours: 1, score: 60 })],
  },
  'nha-rong': {
    kind: 'ticket', icon: 'ticket', title: 'Bảo tàng Hồ Chí Minh', verb: 'Mua vé tham quan', hours: [[7.5, 17]], robbable: 0,
    intro: 'Bến Nhà Rồng, nơi Bác Hồ ra đi tìm đường cứu nước năm 1911; nay là bảo tàng.',
    items: [s('ve', 'Vé tham quan', 20, 'Một giờ trong bảo tàng · +40 điểm.', { hours: 1, score: 40 })],
  },
  'ben-xe': {
    kind: 'kiosk', icon: 'store', title: 'Hàng quán bến xe', verb: 'Mua đồ đi đường', hours: [[4, 22]], robbable: 1,
    intro: 'Bến xe cũ vẫn còn quầy bán đồ đi đường: bánh mì, nước suối, áo mưa giấy.',
    items: [s('banhmi', 'Bánh mì đi đường', 20, '+15 máu.', { heal: 15, litter: 1 }), NUOC, s('aomua', 'Áo mưa giấy', 15, 'Phòng khi mưa.', { item: 'áo mưa' })],
  },
  'nha-mau': {
    kind: 'office', icon: 'ticket', title: 'Nhà mẫu', verb: 'Xem nhà mẫu', hours: [[8, 17]], robbable: 0,
    intro: 'Sa bàn khu đô thị mới, căn hộ mẫu sáng choang, nhân viên tư vấn mời nước.',
    items: [s('xem', 'Xem căn hộ mẫu', 0, '+10 điểm.', { score: 10 }), s('nuoc', 'Ly nước mời khách', 0, '+3 máu.', { heal: 3 })],
  },
};
Object.assign(COUNTERS, DISTRICT_COUNTERS);
COUNTERS['q-bunrieu'].hours = COUNTERS.bunrieu.hours;

/** A district sign's trade: [name prefix, counter key], longest prefixes first where they overlap. */
const DISTRICT_TRADES: [string, string][] = [
  // food
  ['HỦ TIẾU NAM VANG', 'namvang'], ['HỦ TIẾU GÕ', 'q-hutieu'], ['HỦ TIẾU', 'namvang'], ['BÚN BÒ HUẾ', 'bunbo'], ['BÚN BÒ', 'bunbo'], ['BÚN THỊT NƯỚNG', 'bunthitnuong'], ['BÚN RIÊU', 'q-bunrieu'],
  ['BÁNH XÈO', 'q-banhxeo'], ['XÔI SÁNG', 'q-xoi'], ['XÔI', 'q-xoi'], ['CHÈ', 'q-che'], ['BÁNH CUỐN', 'q-banhcuon'], ['BÁNH CANH', 'q-banhcanh'], ['CHÁO LÒNG', 'q-chaolong'],
  ['CHÁO VỊT', 'chaovit'], ['CƠM TẤM', 'comtam'], ['CƠM BÌNH DÂN', 'binhdan'], ['PHỞ', 'q-phobo'], ['BÁNH MÌ', 'banhmi'], ['GÀ NƯỚNG', 'ganuong'], ['BÒ BÍA', 'bobia'],
  ['MÌ QUẢNG', 'miquang'], ['ỐC', 'oc'], ['SÒ ỐC', 'oc'], ['HẢI SẢN', 'haisan'], ['NƯỚNG NGÓI', 'nuong'], ['MỰC NƯỚNG', 'nuong'], ['TÔM NƯỚNG', 'nuong'], ['LẨU', 'lau'],
  ['QUÁN NHẬU', 'nhau'], ['NHẬU', 'nhau'], ['BIA', 'nhau'], ['BAR', 'bar'],
  // Phố Tây (gen/buildings.ts 'pho-tay'): bars and beer clubs, beds for the night, massage, exchange and tour desks, tattoos
  ['BEER CLUB', 'bar'], ['PUB', 'bar'], ['LOUNGE', 'bar'], ['HOSTEL', 'hotel'], ['KHÁCH SẠN MINI', 'hotel'], ['NHÀ NGHỈ', 'hotel'], ['GUESTHOUSE', 'hotel'],
  ['MASSAGE', 'spa'], ['SPA', 'spa'], ['ĐỔI TIỀN', 'doitien'], ['TOUR DU LỊCH', 'tour'], ['VÉ XE', 'tour'], ['TRAVEL', 'tour'], ['XĂM HÌNH', 'tattoo'], ['TATTOO', 'tattoo'],
  // cafés
  ['TRÀ SỮA', 'trasua'], ['SINH TỐ', 'sinhto'], ['NƯỚC MÍA', 'q-nuocmia'], ['TRÀ ĐÁ', 'trada'], ['CÀ PHÊ', 'coba'],
  // shops and the market's sạp
  ['TẠP HÓA', 'taphoa'], ['MINI MART', 'mart'], ['TIỆM MAY', 'tailor'], ['TIỆM TÓC', 'barber'], ['NHÀ THUỐC', 'pharmacy'], ['SỬA XE', 'repair'], ['ĐIỆN THOẠI', 'phone'],
  ['PHOTO', 'photo'], ['VĂN PHÒNG PHẨM', 'stationery'], ['TIỆM VÀNG', 'gold'], ['ĐIỆN MÁY', 'appliance'], ['GAS', 'gas'], ['KIM KHÍ', 'hardware'], ['ĐỒ ĐIỆN', 'hardware'],
  ['TIỆM HOA', 'florist'], ['GIÀY DÉP', 'shoes'], ['QUẦN ÁO', 'fashion'], ['GẠO', 'rice'], ['NHÀ SÁCH', 'books'], ['NHA KHOA', 'dentist'], ['TIỆM ẢNH', 'photostudio'],
  ['VẢI', 'fabric'], ['ĐỒ KHÔ', 'dried'], ['TRÁI CÂY', 'fruit'], ['GIA VỊ', 'spice'], ['ĐỒ NHỰA', 'plastic'], ['THỊT HEO', 'butcher'], ['RAU CỦ', 'veg'], ['CHỢ', 'market'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];
/** What a stamp's door offers (by stamp id); a notice is a door that answers with why it stays shut (design-real C3). */
const STAMP_PLACES: Record<string, { key: string } | { notice: [string, string] }> = {
  'nha-rong': { key: 'nha-rong' }, kho7: { notice: ['Cửa khóa', 'kho riêng, không phận sự miễn vào'] }, 'cang-khanh-hoi': { notice: ['Cổng cảng', 'chỉ xe hàng và công nhân được vào'] },
  'factory-p1': { notice: ['Cửa khóa', 'công trình nguy hiểm, cấm vào'] }, 'thap-bo-song': { key: 'office' }, 'ben-xe-mien-dong': { key: 'ben-xe' },
  'biet-thu-hoa-su': { notice: ['Biệt thự công vụ', 'bảo vệ không cho khách lạ vào'] }, 'ubnd-thanh-pho': { notice: ['Trụ sở Ủy ban', 'chỉ tiếp khách có hẹn'] },
  'dinh-doc-lap': { key: 'dinh-doc-lap' }, 'buu-dien-thanh-pho': { key: 'buudien' }, 'cho-ben-thanh': { key: 'market' }, 'cao-oc-sao-mai': { key: 'office' },
  'toa-nha-dong-khoi': { key: 'office' }, 'khach-san-ham-nghi': { key: 'hotel' }, 'quan-bar-bui-vien': { key: 'bar' },
  'ga-ben-thanh-1': { notice: ['Ga ngầm Bến Thành', 'tàu metro chưa chạy tới ga này'] }, 'ga-ben-thanh-2': { notice: ['Ga ngầm Bến Thành', 'tàu metro chưa chạy tới ga này'] },
  'ga-ben-thanh-3': { notice: ['Ga ngầm Bến Thành', 'tàu metro chưa chạy tới ga này'] }, 'ga-ben-thanh-4': { notice: ['Ga ngầm Bến Thành', 'tàu metro chưa chạy tới ga này'] },
  'tram-xe-buyt-23-9': { notice: ['Trạm xe buýt 23/9', 'đón xe ở các trạm dọc đường'] }, 'ben-do-thu-thiem': { notice: ['Bến đò', 'lên đò ở cầu tàu'] },
  'ben-thu-thiem': { notice: ['Bến tàu buýt sông', 'lên tàu ở cầu tàu'] }, 'tu-vien-thu-thiem': { key: 'church' }, 'thap-doi-a': { notice: ['Công trường', 'cấm vào khu vực thi công'] },
  'thap-doi-b': { notice: ['Công trường', 'cấm vào khu vực thi công'] }, 'can-cau-thap': { notice: ['Cần cẩu tháp', 'cấm leo trèo'] }, 'nha-mau-ban-dao': { key: 'nha-mau' },
  'cay-xang-vong-cung': { key: 'mart' }, 'sat-hach-lai-xe': { notice: ['Sân sát hạch', 'chỉ thí sinh có lịch thi được vào'] },
  'benh-vien-binh-thanh': { key: 'clinic' }, 'tram-y-te-thu-thiem': { key: 'clinic' },
  // The story villa (P1 on Thủ Thiêm's riverside; the Thảo Điền one when P2 lands): a locked door that says why.
  'villa-p1': { notice: ['Cửa khóa', 'nhà riêng, có camera'] }, villa: { notice: ['Cửa khóa', 'nhà riêng, có camera'] },
};
/** Food carts on district sidewalks by their dressing variant (gen/dressing.ts streetFront: hours [[6,10],[7,19],[16,22],[14,22],[5,10]]). */
export const CART_TRADES = ['banhmi', 'q-nuocmia', 'ganh-hotvitlon', 'q-che', 'q-xoi'] as const;

/** The counter for a district building by its sign (or its kind for public buildings); null: a home. */
export function districtKeyOf(b: Pick<GenBuilding, 'kind' | 'name' | 'typology' | 'stamp'>): string | { notice: [string, string] } | null {
  if (b.stamp && STAMP_PLACES[b.stamp]) { const p = STAMP_PLACES[b.stamp]; return 'key' in p ? p.key : p; }
  switch (b.kind) {
    case 'home': return null;
    case 'pagoda': return b.typology === 'church' ? 'church' : 'chua';
    case 'school': return 'school';
    case 'police': return 'congan';
    case 'hospital': return 'clinic';
    case 'post': return 'buudien';
    case 'hotel': return 'hotel';
    case 'office': return b.typology === 'warehouse' ? { notice: ['Kho hàng', 'không phận sự miễn vào'] } : 'office';
    default: {
      const n = b.name.toUpperCase();
      for (const [prefix, key] of DISTRICT_TRADES) if (n === prefix || n.startsWith(`${prefix} `)) return key;
      return b.kind === 'cafe' ? 'coba' : b.kind === 'food' ? 'binhdan' : 'taphoa';
    }
  }
}
/** A counter that sells while its eatery's stools are out: `key` with those hours (registered once, e.g. 'oc@16-26'). */
function withHours(key: string, spans: readonly (readonly [number, number])[]): string {
  if (!spans.length) return key;
  const hours = menuHours(spans);
  const id = `${key}@${hours.map(([a, b]) => `${a}-${b}`).join(',')}`;
  if (!COUNTERS[id]) COUNTERS[id] = { ...COUNTERS[key], hours };
  return id;
}
/**
 * What the same plate costs by district: downtown (Quận 1: Bến Thành, Bùi Viện, the CBD) a third dearer, Quận 3 and
 * the new town across the river a little, Quận 4 and Bình Thạnh what the neighbourhood pays. Rounded to 5.000đ above
 * 10.000đ (1.000đ below).
 */
const DISTRICT_PRICE: Partial<Record<string, number>> = { 'quan-1-south': 1.3, 'quan-3': 1.1, 'thu-thiem': 1.15 };
function withPrice(key: string, slice: string | undefined): string {
  const k = slice ? DISTRICT_PRICE[slice] : undefined, def = COUNTERS[key];
  if (!k || !def?.items.length || def.kind === 'police' || def.kind === 'pagoda' || def.kind === 'church' || def.kind === 'ticket') return key;
  const id = `${key}*${k}`;
  if (!COUNTERS[id]) COUNTERS[id] = { ...def, items: def.items.map((it) => ({ ...it, price: it.price <= 0 ? it.price : it.price * k > 10 ? Math.round((it.price * k) / 5) * 5 : Math.round(it.price * k) })) };
  return id;
}

/** Counter key for a building by its sign (null: no counter, e.g. a nightlife venue handled by venues.ts). */
export function counterKeyOf(b: Pick<Building, 'kind' | 'name'>): string | null {
  const n = b.name;
  switch (b.kind) {
    case 'cafe': return n.startsWith('CÀ PHÊ SÂN THƯỢNG') ? 'rooftop' : n.startsWith('TRÀ SỮA') ? 'trasua' : 'coba';
    case 'food':
      if (n.startsWith('PHỞ HÀ NỘI')) return 'phohn';
      if (n.startsWith('PHỞ')) return 'pho';
      if (n.startsWith('BÁNH MÌ')) return 'banhmi';
      if (n.startsWith('BÚN CHẢ')) return 'buncha';
      if (n.startsWith('QUÁN CƠM')) return 'comtam';
      if (n.startsWith('NHÀ HÀNG')) return 'nhahang';
      if (n.startsWith('NƯỚC MÍA')) return 'nuocmia';
      return STALL_KEYS[n] ?? null;
    case 'shop':
      if (n.startsWith('TẠP HÓA')) return 'taphoa';
      if (n.startsWith('MINI MART')) return 'mart';
      if (n.startsWith('NHÀ THUỐC')) return 'pharmacy';
      if (n.startsWith('TIỆM VÀNG')) return 'gold';
      if (n.startsWith('TIỆM TÓC')) return 'barber';
      if (n.startsWith('TIỆM MAY')) return 'tailor';
      if (n.startsWith('THỜI TRANG')) return 'fashion';
      if (n.startsWith('TIỆM HOA')) return 'florist';
      if (n.startsWith('NHÀ SÁCH')) return 'books';
      if (n.startsWith('XE MÁY')) return 'repair';
      return null;
    case 'post': return 'post';
    case 'hotel': return 'hotel';
    case 'police': return 'police';
    case 'bank': return 'bank';
    case 'theatre': return 'theatre';
    case 'mall': return 'mall';
    case 'office': return 'office';
    case 'school': return 'school';
    case 'pagoda': return 'pagoda';
    default: return null;
  }
}
/** The food carts by the name on their shophouse (city.ts STALL_NAMES). */
const STALL_KEYS: Record<string, string> = {
  'BÚN RIÊU CÔ HAI': 'bunrieu', 'BÁNH XÈO': 'banhxeo', 'XÔI SÁNG': 'xoi', 'CHÈ BÀ TƯ': 'che', 'HỦ TIẾU GÕ': 'hutieu', 'BÁNH CUỐN': 'banhcuon',
  'BÁNH CANH': 'banhcanh', 'CHÁO LÒNG': 'chaolong',
};

// ---- Hours ----------------------------------------------------------------------------------------------------

export function isOpen(hours: Hours, hour: number) {
  const h = ((hour % 24) + 24) % 24;
  return hours.some(([a, b]) => (h >= a && h < b) || (h + 24 >= a && h + 24 < b));
}
/** "6:00", "22:30". */
export function hourLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24, m = Math.round((h % 1) * 60);
  return `${Math.floor(h) + (m === 60 ? 1 : 0)}:${String(m % 60).padStart(2, '0')}`;
}
/** The next opening time after `hour`. */
export function opensAt(hours: Hours, hour: number) {
  const h = ((hour % 24) + 24) % 24;
  let best = Infinity;
  for (const [a] of hours) best = Math.min(best, ((a - h) % 24 + 24) % 24);
  return h + best;
}
export function hoursLabel(hours: Hours) {
  if (hours.length === 1 && hours[0][0] === 0 && hours[0][1] === 24) return 'Mở cửa 24/7';
  return hours.map(([a, b]) => `${hourLabel(a)}–${b === 24 ? '24:00' : hourLabel(b)}`).join(', ');
}

// ---- Static places ---------------------------------------------------------------------------------------------

/** Facade kinds the interact audit checks (scripts/interact-audit.test.mjs). */
export type FacadeKind = 'counter' | 'door' | 'seat' | 'transit' | 'atm' | 'boat' | 'vehicle';
/**
 * Places with a fixed position. Kinds beyond the catalogue: the legacy shops opened by game.ts events (gun store,
 * motorbike showroom, hospital, nightlife venues), the observation deck, the bank job, the hire boats, seats and bins.
 */
export type PlaceKind = 'counter' | 'gunstore' | 'bikeshop' | 'hospital' | 'venue' | 'deck' | 'heist' | 'boat' | 'seat' | 'bin'
  /** A district door that stays shut on purpose (a warehouse, a building site, a ministry): it answers why (design-real C3). */
  | 'notice';
export type Place = {
  id: string; kind: PlaceKind; name: string;
  /** Catalogue key (counters, ATMs, vending machines), venue kind, or seat kind. */
  key: string;
  /** Where the prompt is answered and how far from it; `yaw` faces out of the shop (or the way a seat faces). */
  x: number; z: number; r: number; yaw: number;
  /** The doorway or counter the camera looks at while its menu is open. */
  anchor: Point;
  covers: FacadeKind[];
  building: number;
  /** Seats: the POI, the furniture under it and its top above the ground (street-life stools; else world.ts SEAT_TOP). */
  poi?: number; seat?: 'bench' | 'stool'; top?: number;
  /** Notices: what the dim prompt says ([verb, label]). */
  notice?: [string, string];
  /** District places: the slice that laid them. */
  slice?: string;
};

/**
 * ATMs (0.9 x 0.7 m kiosks against the wall) and drink machines, positions checked against city colliders and the
 * parking slots of parking.ts (which should leave these spots free).
 */
export const ATM_SPOTS: { x: number; z: number; yaw: number; at: string }[] = [
  { x: 282.1, z: -25.8, yaw: -Math.PI / 2, at: 'NGÂN HÀNG PHƯƠNG NAM' }, { x: 203.6, z: 29.2, yaw: Math.PI / 2, at: 'TRUNG TÂM THƯƠNG MẠI' },
  { x: 150.9, z: -72.4, yaw: Math.PI / 2, at: 'MINI MART 24H' }, { x: 150.9, z: 40.9, yaw: Math.PI / 2, at: 'MINI MART 24H' },
  { x: 237.6, z: 119.1, yaw: Math.PI, at: 'MINI MART 24H' }, { x: 119.1, z: -25.8, yaw: -Math.PI / 2, at: 'BỆNH VIỆN AN HÒA' },
  { x: 34.2, z: -65.1, yaw: 0, at: 'TẠP HÓA' },
];
export const VENDING_SPOTS: { x: number; z: number; yaw: number }[] = [
  { x: 203.9, z: 25.1, yaw: Math.PI / 2 }, { x: 119.1, z: -28.8, yaw: -Math.PI / 2 }, { x: 186.5, z: -131.5, yaw: 0 },
];

const out = (b: Building, d: number) => ({ x: b.door.x + Math.sin(b.facing) * d, z: b.door.z + Math.cos(b.facing) * d });

function buildPlaces() {
  const places: Place[] = [];
  const venueOf = new Map(VENUES.map((v) => [v.building.id, v]));
  for (const b of BUILDINGS) {
    const venue = venueOf.get(b.id);
    const at = out(b, 0.7);
    const counter = (key: string, covers: FacadeKind[] = ['counter', 'door']) => places.push({
      id: `b${b.id}`, kind: 'counter', name: b.name, key, x: at.x, z: at.z, r: 2.4, yaw: b.facing, anchor: { ...b.door }, covers, building: b.id,
    });
    if (venue) {
      if (venue.kind === 'beer') counter('biahoi');
      else {
        // The nightlife doors keep their old rings 1.6 m out (game.ts venue panels).
        const p = out(b, 1.6);
        places.push({ id: `venue-${venue.kind}`, kind: 'venue', name: venue.name, key: venue.kind, x: p.x, z: p.z, r: 2.6, yaw: b.facing, anchor: { ...b.door }, covers: ['door', 'counter'], building: b.id });
      }
      continue;
    }
    if (b.kind === 'home') continue;
    if (b.kind === 'gunstore') places.push({ id: 'gunstore', kind: 'gunstore', name: b.name, key: 'gun', ...GUN_RING, r: 3.5, yaw: b.facing, anchor: { ...b.door }, covers: ['door', 'counter'], building: b.id });
    else if (b.kind === 'bikeshop') places.push({ id: 'bikeshop', kind: 'bikeshop', name: 'CỬA HÀNG XE MÁY', key: 'bike', ...BIKE_RING, r: 3.5, yaw: b.facing, anchor: { ...b.door }, covers: ['door', 'counter'], building: b.id });
    else if (b.kind === 'hospital') places.push({ id: 'hospital', kind: 'hospital', name: b.name, key: 'hospital', x: b.door.x, z: b.door.z, r: 3.5, yaw: b.facing, anchor: { ...b.door }, covers: ['door'], building: b.id });
    else if (b.id === LANDMARKS.tower.id) places.push({ id: 'deck', kind: 'deck', name: b.name, key: 'deck', x: b.door.x, z: b.door.z, r: 3.2, yaw: b.facing, anchor: { ...b.door }, covers: ['door'], building: b.id });
    else {
      const key = counterKeyOf(b);
      if (key) counter(key);
      if (b.kind === 'bank') places.push({ id: 'heist', kind: 'heist', name: b.name, key: 'heist', x: b.door.x, z: b.door.z, r: 3.2, yaw: b.facing, anchor: { ...b.door }, covers: ['door'], building: b.id });
    }
  }
  // Food carts beside their shophouse (the nearest food building names the cart); market stalls.
  SCENERY.props.forEach((p, i) => {
    if (p.kind === 'cart') {
      let best: Building | null = null, bestD = 8;
      for (const b of BUILDINGS) {
        const d = Math.hypot(b.door.x - p.x, b.door.z - p.z);
        if (b.kind === 'food' && d < bestD && STALL_KEYS[b.name]) { best = b; bestD = d; }
      }
      const key = best ? STALL_KEYS[best.name] : 'banhmi';
      const name = best?.name ?? 'XE BÁNH MÌ';
      const yaw = p.yaw;
      places.push({ id: `cart${i}`, kind: 'counter', name, key, x: p.x + Math.sin(yaw) * 0.9, z: p.z + Math.cos(yaw) * 0.9, r: 2.2, yaw, anchor: { x: p.x, z: p.z }, covers: ['counter'], building: best?.id ?? -1 });
    } else if (p.kind === 'stall') {
      places.push({ id: `stall${i}`, kind: 'counter', name: 'SẠP CHỢ', key: 'sap', x: p.x, z: p.z, r: 3.2, yaw: p.z < -100 ? Math.PI : 0, anchor: { x: p.x, z: p.z }, covers: ['counter'], building: -1 });
    } else if ((p.kind as string) === 'bin') {
      places.push({ id: `bin${i}`, kind: 'bin', name: 'THÙNG RÁC', key: 'bin', x: p.x, z: p.z, r: 1.6, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: [], building: -1 });
    } else if ((p.kind as string) === 'lottery') {
      places.push({ id: `veso${i}`, kind: 'counter', name: 'VÉ SỐ', key: 'veso', x: p.x, z: p.z, r: 1.8, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: ['counter'], building: -1 });
    }
  });
  ATM_SPOTS.forEach((a, i) => places.push({
    id: `atm${i}`, kind: 'counter', name: 'ATM', key: 'atm', x: a.x + Math.sin(a.yaw) * 0.6, z: a.z + Math.cos(a.yaw) * 0.6, r: 2.2, yaw: a.yaw,
    anchor: { x: a.x, z: a.z }, covers: ['atm'], building: -1,
  }));
  VENDING_SPOTS.forEach((a, i) => places.push({
    id: `vend${i}`, kind: 'counter', name: 'MÁY BÁN NƯỚC', key: 'vending', x: a.x + Math.sin(a.yaw) * 0.6, z: a.z + Math.cos(a.yaw) * 0.6, r: 1.8, yaw: a.yaw,
    anchor: { x: a.x, z: a.z }, covers: ['atm'], building: -1,
  }));
  // Rental docks: the speedboat hire at the pier's ring.
  SCENERY.docks.forEach((d, i) => {
    if (d.rental) places.push({ id: `boat${i}`, kind: 'boat', name: d.name, key: 'boat', x: d.ring.x, z: d.ring.z, r: 3, yaw: Math.PI, anchor: { ...d.ring }, covers: ['transit'], building: -1 });
  });
  // Seats: benches, bus-stop benches, café stools, the quán and beer-garden stools and chess stools the street-life
  // groups put out (city.ts POIs with seat: true; a scooter saddle 'perch' is the curb bike's, not a seat).
  const groups = (LIFE as { groups?: { building: number }[] } | undefined)?.groups ?? [];
  for (const p of POIS) {
    if (!p.seat || p.kind === 'perch') continue;
    const stool = p.kind !== 'bench' && p.kind !== 'bus-stop';
    // A café table's chairs (city.ts CAFE_TABLES, no street-life group) belong to the nearest café.
    const host = p.group !== undefined && p.group >= 0 ? groups[p.group]?.building ?? -1 : p.kind === 'cafe-seat' ? nearestCafe(p.x, p.z) : -1;
    places.push({
      id: `seat${p.id}`, kind: 'seat', name: p.kind === 'cafe-seat' ? 'GHẾ QUÁN' : stool ? 'GHẾ NHỰA' : p.kind === 'bus-stop' ? 'GHẾ CHỜ XE BUÝT' : 'GHẾ ĐÁ', key: p.kind, x: p.x, z: p.z,
      r: p.kind === 'cafe-seat' ? 1.4 : stool ? 0.9 : 1.1, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: ['seat'], building: host, poi: p.id, seat: stool ? 'stool' : 'bench', top: p.seatH,
    });
  }
  return places;
}
function nearestCafe(x: number, z: number) {
  let best = -1, bestD = 11;
  for (const b of BUILDINGS) {
    const d = Math.hypot(b.door.x - x, b.door.z - z);
    if (b.kind === 'cafe' && d < bestD) { best = b.id; bestD = d; }
  }
  return best;
}
/** The legacy rings of the gun store and the motorbike showroom (game.ts STORE and BIKE_SHOP). */
const GUN_RING = { x: -18, z: 49.6 };
const BIKE_RING = { x: 20, z: -10.9 };

/**
 * The wired districts' places (district-life.ts): a counter (or a notice) at every door that is not a home, the chung
 * cư kiosks, carts, market stalls, Bến Thành's night market and the book street, bins, and every seat (eatery stools,
 * benches, bus-stop benches, Bùi Viện's night stools). Ids are unique across the city: buildings `d<id>`, POI seats
 * `seat<poi id>` (one POI id space), props `dp:<slice>/<key>`.
 */
export function districtPlaces(v: DistrictView): Place[] {
  const places: Place[] = [];
  /** The slice that built a district building (by its id range). */
  const sliceOf = (id: number) => v.world.slices.find((s) => id >= s.data.idBase && id < s.data.idBase + s.data.buildings.length)?.key;
  const hoursOf = new Map<number, [number, number][]>();
  for (const e of v.eateries) if (e.building >= 0) { const list = hoursOf.get(e.building) ?? []; if (!list.some(([a, b]) => a === e.hours[0] && b === e.hours[1])) list.push(e.hours); hoursOf.set(e.building, list); }
  for (const b of v.buildings) {
    const want = districtKeyOf(b);
    if (!want) continue;
    const at = out(b, 0.7);
    if (typeof want !== 'string') {
      places.push({ id: `d${b.id}`, kind: 'notice', name: b.name, key: 'notice', x: at.x, z: at.z, r: 2.4, yaw: b.facing, anchor: { ...b.door }, covers: ['door'], building: b.id, notice: want.notice });
      continue;
    }
    // A quán sells while its stools are out (one clock with the crowd that sits on them); a night street's from dusk.
    const spans = hoursOf.get(b.id) ?? (b.zone === 'night' && (b.kind === 'food' || b.kind === 'cafe') ? [[17, 2] as [number, number]] : []);
    const key = withPrice(b.kind === 'food' || b.kind === 'cafe' ? withHours(want, spans) : want, sliceOf(b.id));
    places.push({ id: `d${b.id}`, kind: 'counter', name: b.name, key, x: at.x, z: at.z, r: 2.4, yaw: b.facing, anchor: { ...b.door }, covers: ['counter', 'door'], building: b.id });
  }
  // Ground-floor kiosks of the chung cư slabs: a counter on the wall, facing out.
  for (const k of v.kiosks) {
    const key = withPrice(districtKeyOf({ kind: k.kind, name: k.name, typology: 'tube', stamp: null }) as string, k.slice);
    const x = k.x + Math.sin(k.yaw) * 0.6, z = k.z + Math.cos(k.yaw) * 0.6;
    places.push({ id: `dk:${k.slice}/${k.key}`, kind: 'counter', name: k.name, key, x, z, r: 2, yaw: k.yaw, anchor: { x: k.x, z: k.z }, covers: ['counter'], building: k.building, slice: k.slice });
  }
  for (const p of v.props) {
    const id = `dp:${p.id}`;
    if (p.kind === 'cart') {
      const key = CART_TRADES[p.variant] ?? 'banhmi', h = p.hours;
      places.push({ id, kind: 'counter', name: COUNTERS[key].title.toUpperCase(), key: withPrice(h ? withHours(key, [h]) : key, p.slice), x: p.x + Math.sin(p.yaw) * 0.9, z: p.z + Math.cos(p.yaw) * 0.9, r: 2.2, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: ['counter'], building: -1, slice: p.slice });
    } else if (p.kind === 'stall') {
      places.push({ id, kind: 'counter', name: 'SẠP CHỢ', key: 'sap', x: p.x, z: p.z, r: 3.2, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: ['counter'], building: -1, slice: p.slice });
    } else if (p.kind === 'bin') {
      places.push({ id, kind: 'bin', name: 'THÙNG RÁC', key: 'bin', x: p.x, z: p.z, r: 1.6, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: [], building: -1, slice: p.slice });
    } else if (p.kind === 'shelter' && !transitStops.some((t) => Math.hypot(t.x - p.x, t.z - p.z) <= t.r)) {
      // A district bus shelter no line stops at yet (transit.ts lists the ones its buses serve): it says so.
      places.push({ id, kind: 'notice', name: 'TRẠM XE BUÝT', key: 'notice', x: p.x, z: p.z, r: 3, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: ['transit'], building: -1, notice: ['Trạm xe buýt', 'chưa có tuyến nào dừng ở trạm này'], slice: p.slice });
    }
  }
  // THÁP BỜ SÔNG's observation deck and parachute jump (BINH_THANH_EXTRA.deck): the ticket counter at its river-side lobby door.
  if (v.keys.has('binh-thanh')) {
    const d = BINH_THANH_EXTRA.deck, b = v.buildings.find((x) => x.stamp === d.stamp);
    if (b) places.push({ id: 'deck-bo-song', kind: 'deck', name: b.name, key: 'deck-bo-song', x: d.counter.x, z: d.counter.z, r: 3.2, yaw: d.counter.yaw, anchor: { x: d.counter.x, z: d.counter.z }, covers: ['door'], building: b.id, slice: 'binh-thanh' });
  }
  // Quận 1 south's EXTRA stalls: Bến Thành's night market on Phan Bội Châu (18–24) and the book street (8–21).
  if (v.keys.has('quan-1-south')) {
    type Stalls = { stalls: { x: number; z: number; yaw: number }[] };
    const q1 = QUAN_1_SOUTH_EXTRA as unknown as { market: { night: Stalls; day: Stalls }; bookstalls: Stalls };
    q1.market.night.stalls.forEach((st, i) => places.push({ id: `cho-dem:${i}`, kind: 'counter', name: 'CHỢ ĐÊM BẾN THÀNH', key: 'cho-dem', x: st.x + Math.sin(st.yaw) * 1.4, z: st.z + Math.cos(st.yaw) * 1.4, r: 2.2, yaw: st.yaw, anchor: { x: st.x, z: st.z }, covers: ['counter'], building: -1, slice: 'quan-1-south' }));
    q1.market.day.stalls.forEach((st, i) => places.push({ id: `cho-ngay:${i}`, kind: 'counter', name: 'SẠP CHỢ BẾN THÀNH', key: 'sap-ben-thanh', x: st.x + Math.sin(st.yaw) * 1.4, z: st.z + Math.cos(st.yaw) * 1.4, r: 2.2, yaw: st.yaw, anchor: { x: st.x, z: st.z }, covers: ['counter'], building: -1, slice: 'quan-1-south' }));
    q1.bookstalls.stalls.forEach((st, i) => places.push({ id: `duong-sach:${i}`, kind: 'counter', name: 'ĐƯỜNG SÁCH', key: 'sach-cu', x: st.x + Math.sin(st.yaw) * 1.2, z: st.z + Math.cos(st.yaw) * 1.2, r: 2.2, yaw: st.yaw, anchor: { x: st.x, z: st.z }, covers: ['counter'], building: -1, slice: 'quan-1-south' }));
  }
  // A quán table nobody can sit at (no room for a stool round it) still takes orders: its quán's counter at the table.
  const counterOf = new Map(places.filter((p) => p.kind === 'counter' && p.id.startsWith('d')).map((p) => [p.building, p]));
  for (const e of v.eateries) {
    const c = e.seats.length ? null : counterOf.get(e.building);
    if (c) places.push({ ...c, id: `dt:${e.slice}/${e.key}`, x: e.x + Math.sin(e.yaw) * 0.7, z: e.z + Math.cos(e.yaw) * 0.7, r: 1.8, yaw: e.yaw, anchor: { x: e.x, z: e.z }, covers: ['counter'], slice: e.slice });
  }
  // Seats: eatery stools belong to their quán (its counter takes the order), the rest are benches and bus-stop seats.
  // Bùi Viện's night stools belong to the quán in front of them.
  const foodDoors = v.buildings.filter((b) => b.kind === 'food' || b.kind === 'cafe');
  const nightHost = (x: number, z: number) => { let best = -1, bestD = 16; for (const b of foodDoors) { const d = Math.hypot(b.door.x - x, b.door.z - z); if (d < bestD) { best = b.id; bestD = d; } } return best; };
  const nightSeat = new Set(v.nightTables.flatMap((t) => t.seats));
  for (const p of v.pois) {
    if (!p.seat || p.kind === 'perch') continue;
    const stool = p.kind !== 'bench' && p.kind !== 'bus-stop';
    const host = p.building >= 0 ? p.building : nightSeat.has(p.id) ? nightHost(p.x, p.z) : -1;
    places.push({
      id: `seat${p.id}`, kind: 'seat', name: stool ? 'GHẾ QUÁN' : p.kind === 'bus-stop' ? 'GHẾ CHỜ XE BUÝT' : p.key.startsWith('ring-rim:') ? 'THÀNH HỒ CON RÙA' : 'GHẾ ĐÁ', key: p.kind, x: p.x, z: p.z,
      r: stool ? 1.4 : 1.1, yaw: p.yaw, anchor: { x: p.x, z: p.z }, covers: ['seat'], building: host, poi: p.id, seat: stool ? 'stool' : 'bench', top: p.seatH, slice: p.slice,
    });
  }
  return places;
}

/** Today's places, then the wired districts'. */
export const LEGACY_PLACES: Place[] = buildPlaces();
export const PLACES: Place[] = [...LEGACY_PLACES, ...districtPlaces(district())];

/** Which counter a robbed shopkeeper stood at (within 6 m): its stars and whether it is protected. */
export function counterAt(x: number, z: number) {
  let best: Place | null = null, bestD = 6;
  for (const p of PLACES) {
    if (p.kind !== 'counter') continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best ? { place: best, def: COUNTERS[best.key] } : null;
}

/** Lunar day (1-30) for a game day; day 0 is the 14th, so the first full moon (rằm) comes the next day. */
export const lunarDay = (day: number) => ((day + 13) % 30) + 1;
export const FORTUNES = [
  'Quẻ thượng: đi đâu cũng gặp quý nhân phù trợ.', 'Quẻ trung: tiền vào chậm mà chắc, đừng nóng vội.', 'Quẻ hạ: hôm nay chạy xe chậm thôi, tránh va chạm.',
  'Quẻ thượng: chuyện tình cảm sắp có tin vui.', 'Quẻ trung: lời nói nhẹ nhàng thì việc gì cũng xong.', 'Quẻ thượng: mua một tờ vé số thử xem sao.',
];
