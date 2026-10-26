// Pure helpers and Vietnamese label tables for the story UI. No React, DOM or three.js imports (node-testable).
import type { Detection, DossierStatus, EvidenceKind, GradeId, LunarView, MedalId, Stance, StealthItemId, CoverView, Difficulty } from './types';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);
const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- lunar calendar
export const LUNAR_MONTHS = ['', 'Giêng', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Mười Một', 'Chạp'];
/** 'Mùng 10', 'Ngày 12', 'Rằm'. */
export function lunarDayName(day: number) { return day === 15 ? 'Rằm' : day >= 1 && day <= 10 ? `Mùng ${day}` : `Ngày ${day}`; }
/** 'Mùng 10 tháng Tám', 'Rằm tháng Tám'. */
export function lunarLabel(v: LunarView) { return v.label ?? `${lunarDayName(v.day)} tháng ${LUNAR_MONTHS[v.month] ?? v.month}`; }
/** Days until Rằm tháng Tám (month 8, day `target`). Month 7 is taken as 30 days unless the runner passes daysLeft. */
export function daysToTarget(v: LunarView) {
  if (v.daysLeft != null) return v.daysLeft;
  const target = v.target ?? 15;
  if (v.month === 8) return target - v.day;
  if (v.month === 7) return 30 - v.day + target;
  return v.month < 7 ? Infinity : -1;
}
/** 'Còn 5 ngày tới Rằm', 'Mai là Rằm', 'Đêm Rằm'. */
export function countdownLabel(v: LunarView) {
  if (v.countdown != null) return v.countdown;
  const left = daysToTarget(v);
  if (left === Infinity) return '';
  if (left > 1) return `Còn ${left} ngày tới Rằm`;
  if (left === 1) return 'Mai là Rằm';
  if (left === 0) return 'Đêm Rằm';
  return 'Sau Rằm';
}
/** Illuminated fraction 0..1 of the moon on a lunar day (mùng 1 = new moon, Rằm = full). */
export function moonLit(day: number) { return (1 - Math.cos((2 * Math.PI * (day - 1)) / 29.53)) / 2; }
/** SVG path of the lit part of a moon of radius r centred at 0,0 (waxing lit on the right, as seen from Việt Nam). */
export function moonPath(day: number, r: number) {
  const age = ((day - 1) % 29.53 + 29.53) % 29.53, waxing = age < 14.765, f = moonLit(day);
  if (f < 0.02) return '';
  if (f > 0.98) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
  const rx = Math.abs(1 - 2 * f) * r, side = waxing ? 1 : 0, bulge = f < 0.5 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  const n = (x: number) => +x.toFixed(2);
  return `M0 ${-r}A${r} ${r} 0 0 ${side} 0 ${r}A${n(rx)} ${r} 0 0 ${bulge} 0 ${-r}Z`;
}

// ---------------------------------------------------------------- numbers and time
/** 'm:ss' (or 'h:mm:ss' past an hour). */
export function mmss(seconds: number) {
  const s = Math.max(0, Math.round(seconds)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
/** Seconds after midnight to 'HH:MM:SS' (wraps past midnight). */
export function clockLabel(sec: number) { const s = ((Math.floor(sec) % 86400) + 86400) % 86400; return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; }
/** 1350000 → '1.350.000đ' (dot thousands separators, as Vietnamese prices are written). */
export function money(dong: number) { const s = String(Math.round(Math.abs(dong))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return `${dong < 0 ? '−' : ''}${s}đ`; }
/** Subtitle reading time in seconds: about 15 characters a second plus a lead-in, scaled by the reading-speed setting. */
export function subtitleSeconds(text: string, speed: 'slow' | 'normal' | 'fast' = 'normal') {
  const base = Math.min(7.5, Math.max(1.8, 1.4 + 0.065 * [...text].length));
  return base * (speed === 'slow' ? 1.3 : speed === 'fast' ? 0.8 : 1);
}

// ---------------------------------------------------------------- names and words
const HONORIFICS = new Set(['CÔ', 'ÔNG', 'BÀ', 'CHỊ', 'ANH', 'THẦY', 'BÉ', 'ÚT', 'GÃ', 'ĐẠI', 'THIẾU', 'TRUNG', 'ÚY', 'TÁ', 'NỮ', 'CẢNH', 'SÁT']);
/** One initial for a portrait fallback: the first word after honorifics and ranks ('ĐẠI ÚY VÂN' → 'V', 'CÔ BA' → 'B'). */
export function initialOf(name: string) {
  const words = name.normalize('NFC').toLocaleUpperCase('vi').split(/\s+/).filter(Boolean);
  const word = words.find((w) => !HONORIFICS.has(w)) ?? words[words.length - 1] ?? '?';
  return [...word][0] ?? '?';
}
export const CHAPTER_WORDS = ['', 'MỘT', 'HAI', 'BA', 'BỐN', 'NĂM', 'SÁU', 'BẢY', 'TÁM', 'CHÍN', 'MƯỜI', 'MƯỜI MỘT', 'MƯỜI HAI'];
/** 'CHƯƠNG HAI'. */
export function chapterEyebrow(n: number) { return `CHƯƠNG ${CHAPTER_WORDS[n] ?? n}`; }
/** The chokehold count words, shown cumulatively: 'Một… hai… ba…'. */
export const COUNT_WORDS = ['Một', 'hai', 'ba', 'bốn', 'năm'];
export function countPhrase(count: number) { return COUNT_WORDS.slice(0, Math.max(0, Math.min(5, count))).join('… ') + (count > 0 && count < 5 ? '…' : count >= 5 ? '.' : ''); }
/** A licence plate on its two physical rows: '59-X1 123.45' → ['59-X1', '123.45']; one-row plates stay whole. */
export function plateRows(plate: string) { const parts = plate.trim().split(/\s+/); return parts.length > 1 ? [parts[0], parts.slice(1).join(' ')] : [plate.trim()]; }

// ---------------------------------------------------------------- label tables
export const STANCE_LABEL: Record<Stance, string> = { stand: 'Đứng', crouch: 'Rón rén', hidden: 'Đang nấp', float: 'Nổi im', dive: 'Đang lặn', drag: 'Đang kéo người', carry: 'Đang bồng' };
export const DETECTION_LABEL: Record<Detection, string> = { hidden: 'Không ai thấy', suspected: 'Bị nghi ngờ', searching: 'Đang bị lùng sục', detected: 'BỊ PHÁT HIỆN', combat: 'Đang giao chiến' };
export const ALARM_LABEL = ['Yên ắng', 'Cảnh giác', 'BÁO ĐỘNG', 'TRUY SÁT'] as const;
/** Same words as stealth-types.ts LIGHT_LABEL. */
export function lightLabel(light: number) { return light < 0.34 ? 'Trong bóng tối' : light < 0.67 ? 'Mờ tối' : 'Bị lộ'; }
export const ZONE_LABEL: Record<CoverView['zone'], string> = { public: 'Khu công cộng', staff: 'Khu nhân viên', restricted: 'Khu cấm', hostile: 'Địa bàn địch' };
export const ITEM_LABEL: Record<StealthItemId, string> = {
  bolt: 'Bù lon', coin: 'Đồng xu', bottle: 'Chai', food: 'Đồ ăn', zipTie: 'Dây rút', whistle: 'Còi', burner: 'Máy cùi', radio: 'Bộ đàm', keycard: 'Thẻ từ',
  key: 'Chìa khóa', boltCutters: 'Kìm cộng lực', tracker: 'Thiết bị định vị', bug: 'Máy nghe lén', clipCam: 'Camera giấu áo',
};
export const MEDALS: Record<MedalId, { label: string; hint: string }> = {
  'bong-ma': { label: 'Bóng ma', hint: 'Không bị phát hiện lần nào' },
  'luong-tam': { label: 'Lương tâm', hint: 'Không lấy mạng ai' },
  'than-toc': { label: 'Thần tốc', hint: 'Xong trong thời gian chuẩn' },
  'mat-cu': { label: 'Mắt cú', hint: 'Tìm đủ mọi manh mối' },
};
export const STATUS_LABEL: Record<DossierStatus, string> = { family: 'Gia đình', ally: 'Đồng minh', suspect: 'Nghi phạm', victim: 'Nạn nhân', witness: 'Nhân chứng', unknown: 'Chưa rõ', arrested: 'Đã bị bắt', missing: 'Mất tích', deceased: 'Đã mất' };
export const KIND_LABEL: Record<EvidenceKind, string> = { photo: 'Ảnh chụp', document: 'Giấy tờ', object: 'Vật chứng', plate: 'Biển số', audio: 'Ghi âm', video: 'Đoạn phim', note: 'Ghi chú', person: 'Người', place: 'Địa điểm', call: 'Cuộc gọi', testimony: 'Lời khai', recording: 'Ghi âm', 'call-log': 'Nhật ký cuộc gọi' };
/** The runner's Medal flags ({ghost, nonLethal, fast, eye}) as medal ids, in display order. */
export function medalIds(m: { ghost?: boolean; nonLethal?: boolean; fast?: boolean; eye?: boolean } | null | undefined): MedalId[] {
  if (!m) return [];
  return ([['bong-ma', m.ghost], ['luong-tam', m.nonLethal], ['than-toc', m.fast], ['mat-cu', m.eye]] as [MedalId, boolean | undefined][]).filter(([, on]) => on).map(([id]) => id);
}
export const DIFFICULTY_LABEL: Record<Difficulty, { label: string; hint: string }> = {
  de: { label: 'Nhẹ nhàng', hint: 'Lính canh chậm phát hiện, vùng khóa cổ rộng' },
  thuong: { label: 'Thường', hint: 'Như câu chuyện được viết' },
  kho: { label: 'Khó', hint: 'Lính canh tinh mắt, ít gợi ý' },
};

/** CSS filter for the scene container under a colour grade (the overlay adds the vignette). Disabled on the low preset. */
export function gradeFilter(grade: GradeId | undefined) {
  switch (grade) {
    case 'warm': return 'sepia(.14) saturate(1.12) brightness(1.02)';
    case 'cold': return 'saturate(.72) hue-rotate(-10deg) brightness(.94) contrast(1.06)';
    case 'night': return 'saturate(.82) brightness(.9) contrast(1.04)';
    case 'freeze': return 'grayscale(.85) contrast(1.1)';
    case 'flashback': return 'sepia(.42) saturate(.7) contrast(1.06)';
    case 'neon': return 'saturate(1.28) contrast(1.08)';
    case 'underwater': return 'hue-rotate(-24deg) saturate(.65) brightness(.78) blur(1px)';
    case 'alarm': return 'saturate(1.1) contrast(1.12)';
    case 'dawn': return 'sepia(.2) saturate(1.05) brightness(1.04)';
    default: return 'none';
  }
}

// ---------------------------------------------------------------- deduction-board geometry (0..100 board units)
/** A hanging string between two pins: a quadratic curve that sags with its length. */
export function stringPath(ax: number, ay: number, bx: number, by: number, sag = 0.12) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + Math.hypot(bx - ax, by - ay) * sag;
  const n = (x: number) => +x.toFixed(2);
  return `M${n(ax)} ${n(ay)}Q${n(mx)} ${n(my)} ${n(bx)} ${n(by)}`;
}
/** Fifteen lotus-template slots (x, y in 0..1), the runner's BoardCard.slot: the seed pod (0), the inner petals (1-8),
 *  then the outer tips (9-14) for boards that grow across chapters. */
export const LOTUS_SLOTS: [number, number][] = [
  [0.5, 0.56], [0.24, 0.42], [0.76, 0.42], [0.36, 0.2], [0.64, 0.2], [0.13, 0.73], [0.87, 0.73], [0.35, 0.82], [0.65, 0.82],
  [0.5, 0.17], [0.1, 0.17], [0.9, 0.17], [0.09, 0.45], [0.91, 0.45], [0.5, 0.86],
];
/** A board card's 0..1 position: explicit x/y, else its lotus slot, else spread past the template. */
export function cardSpot(c: { slot?: number; x?: number; y?: number }, index: number): [number, number] {
  if (c.x != null && c.y != null) return [c.x, c.y];
  const i = c.slot ?? index, s = LOTUS_SLOTS[i];
  if (s) return s;
  const k = i - LOTUS_SLOTS.length;
  return [0.08 + ((k * 0.29) % 0.84), 0.3 + ((k * 0.37) % 0.5)];
}
/** The faint chalk lotus behind the cards, in a 100×100 box. */
export const LOTUS_OUTLINE = [
  'M50 84C38 72 36 46 50 18C64 46 62 72 50 84Z',
  'M50 84C34 80 20 62 24 34C40 44 50 62 50 84Z', 'M50 84C66 80 80 62 76 34C60 44 50 62 50 84Z',
  'M50 86C30 88 10 78 4 60C24 58 42 70 50 86Z', 'M50 86C70 88 90 78 96 60C76 58 58 70 50 86Z',
  'M22 92Q50 100 78 92',
].join('');
/** Swap axes for portrait screens so the landscape lotus layout still fills the board. */
export function boardPoint(x: number, y: number, portrait: boolean): [number, number] { return portrait ? [y, x] : [x, y]; }
/** Order-free key for a link. */
export const linkKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
