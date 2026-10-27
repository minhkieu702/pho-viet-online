import { CLOTH, DECAL, type ColorLike, type Frame } from './kit';

/**
 * Details that make a Sài Gòn tube house read as one: the national flag on a short pole, a sky altar, AC units,
 * chuồng cọp window cages and grilles, wrought-iron balcony railings, washing on a line, open shop fronts lit by a
 * fluorescent tube with their goods inside, vertical light-box signs, a mái thái front roof, and a cluttered roof
 * (stair hut with the inox tank on top, solar heater, tôn shelter, antenna, drums). All in a building's local frame
 * (kit.ts Frame: lx along the front, lz out of it); `fine` routes small things into the layer lower quality hides.
 */

export type Rand = () => number;
const HALF_PI = Math.PI / 2;
const pick = <T,>(r: Rand, list: readonly T[]) => list[Math.floor(r() * list.length)];
export const LAUNDRY = ['#e05a4f', '#4f86c6', '#f2d36b', '#f4f1e8', '#6fae7a', '#c57bb6', '#2f3a48', '#f0a0b0', '#5a8fd0', '#e8e2d0'];
export const TON = ['#3f6f9a', '#9a4a33', '#8e959a', '#4f8a7a'];
export const ROOF_TILES = ['#b65d3d', '#a5533a', '#c06a45', '#b0563a'];
export const IRON = ['#4f5d5a', '#3a3f44', '#6b4a3a', '#2f5a6a', '#d9d6cc'];
/** Light-box colours: text on box. */
export const LIGHT_BOXES: [string, string][] = [['#ffffff', '#c8322a'], ['#c8322a', '#fff6e0'], ['#ffde00', '#1d4f9c'], ['#ffffff', '#2f7a3a'], ['#1d4f9c', '#ffffff'], ['#ffffff', '#e07a1f']];
/** What a counter's open front shows, and the words on its light box (they say what it really sells: counters.ts). */
export const FRONT_OF: Record<string, [FrontKind, string]> = {
  coba: ['cafe', 'CÀ PHÊ'], rooftop: ['cafe', 'CÀ PHÊ'], trasua: ['cafe', 'TRÀ SỮA'],
  pho: ['food', 'PHỞ BÒ'], phohn: ['food', 'PHỞ'], banhmi: ['food', 'BÁNH MÌ'], buncha: ['food', 'BÚN CHẢ'], comtam: ['food', 'CƠM TẤM'], nhahang: ['food', 'NHÀ HÀNG'],
  bunrieu: ['food', 'BÚN RIÊU'], banhxeo: ['food', 'BÁNH XÈO'], xoi: ['food', 'XÔI'], che: ['food', 'CHÈ'], hutieu: ['food', 'HỦ TIẾU'], banhcuon: ['food', 'BÁNH CUỐN'],
  banhcanh: ['food', 'BÁNH CANH'], chaolong: ['food', 'CHÁO LÒNG'], biahoi: ['food', 'BIA HƠI'],
  taphoa: ['goods', 'TẠP HÓA'], mart: ['goods', 'MINI MART'], pharmacy: ['pharmacy', 'NHÀ THUỐC'], gold: ['gold', 'VÀNG BẠC'], barber: ['barber', 'CẮT TÓC GỘI ĐẦU'],
  tailor: ['tailor', 'MAY ĐO'], fashion: ['tailor', 'THỜI TRANG'], florist: ['florist', 'HOA TƯƠI'], books: ['goods', 'SÁCH'], repair: ['repair', 'SỬA XE BƠM VÁ'], hotel: ['goods', 'KHÁCH SẠN'],
};
/** The shutter drum's colour (shop fronts without a counter shutter from game.ts). */
const DRUM = '#a3a9ab';

/** Splits [a, b] into pieces of about `seg` metres (decals keep their bar spacing however long a railing runs). */
function pieces(a: number, b: number, seg: number) {
  const n = Math.max(1, Math.round((b - a) / seg)), step = (b - a) / n;
  return Array.from({ length: n }, (_, k) => ({ c: a + step * (k + 0.5), len: step }));
}

/** The national flag on a short pole slanting up out of the facade at height y (prototype-tested proportions). */
export function houseFlag(F: Frame, lx: number, front: number, y: number) {
  F.solid('box', lx, y + 0.37, front + 0.53, 1.3, 0.04, 0.04, '#d8d6cf', 0.6, false, -HALF_PI);
  F.cloth(CLOTH.flag, lx, y + 0.42, front + 0.98, 0.9, 0.6, { yaw: -HALF_PI, mode: 0, amp: 0.06 });
}

/** A sky altar (bàn thờ Thiên) high on a balcony wall: a red box under a little tiled roof, three incense sticks. */
export function thoThien(F: Frame, lx: number, y: number, lz: number) {
  F.part(lx, y - 0.24, lz - 0.02, 0.56, 0.05, 0.36, '#7a5a3f', 'solid', false);
  F.part(lx, y, lz, 0.5, 0.36, 0.3, '#b3261e', 'solid', false);
  F.part(lx, y, lz + 0.152, 0.38, 0.24, 0.01, '#e8b53a', 'solid', false);
  F.part(lx, y, lz + 0.16, 0.3, 0.17, 0.01, '#5a0f0b', 'solid', false);
  F.solid('gable', lx, y + 0.27, lz, 0.62, 0.18, 0.42, '#9a3a24', 0, false, 0, 'roofTile');
  F.solid('cylinder', lx, y - 0.16, lz + 0.24, 0.06, 0.1, 0.06, '#c8a24a', 0, false);
  for (const k of [-0.03, 0, 0.03]) {
    F.solid('cylinder', lx + k, y - 0.02, lz + 0.24, 0.006, 0.2, 0.006, '#c0392b', 0, false);
    F.solid('bead', lx + k, y + 0.085, lz + 0.24, 0.012, 0.02, 0.012, '#ff6a3a', 0, false, 0, 'lantern');
  }
  F.smoke('incense', lx, y + 0.12, lz + 0.24);
}

/** An air conditioner's outdoor unit on its bracket, with the drain pipe; (lx, y) its centre, back on the wall at lz. */
export function acUnit(F: Frame, lx: number, y: number, lz: number) {
  F.part(lx, y, lz + 0.17, 0.8, 0.55, 0.3, '#e3e4df', 'solid', false);
  F.decal(DECAL.ac, lx, y, lz + 0.325, 0.78, 0.53);
  F.part(lx, y - 0.31, lz + 0.17, 0.72, 0.04, 0.34, '#7d827f', 'solid', false);
  F.part(lx + 0.33, y - 0.62, lz + 0.03, 0.025, 0.6, 0.025, '#3a3d3c', 'solid', false);
}

/** Chuồng cọp: a welded grille cage over a window (base = the floor level), with its own little tôn roof. */
export function cage(F: Frame, lx: number, base: number, front: number, w: number, iron: ColorLike, roof: ColorLike) {
  const cy = base + 1.45, out = 0.5, h = 1.9;
  F.decal(DECAL.grille, lx, cy, front + out, w, h, { tint: iron });
  for (const s of [-1, 1]) F.decal(DECAL.grille, lx + (s * w) / 2, cy, front + out / 2, out, h, { yaw: s * HALF_PI, tint: iron });
  F.part(lx, base + 0.47, front + out / 2, w + 0.06, 0.06, out + 0.04, iron, 'solid', false);
  F.solid('box', lx, base + 2.48, front + out / 2 + 0.05, out + 0.25, 0.04, w + 0.15, roof, 0.22, false, HALF_PI);
}

/** A flat grille over a window. */
export function grille(F: Frame, lx: number, cy: number, lz: number, w: number, h: number, iron: ColorLike, diamond: boolean) {
  F.decal(diamond ? DECAL.grilleDiamond : DECAL.grille, lx, cy, lz, w, h, { tint: iron });
}

/** A wrought-iron balcony railing round a balcony `depth` deep in front of `front`, from lx0 to lx1, at floor `base`. */
export function railing(F: Frame, lx0: number, lx1: number, base: number, front: number, depth: number, iron: ColorLike, plain: boolean) {
  const cell = plain ? DECAL.railingBars : DECAL.railing, y = base + 0.6, h = 0.95;
  for (const p of pieces(lx0, lx1, 1.25)) F.decal(cell, p.c, y, front + depth, p.len, h, { tint: iron });
  for (const [lx, s] of [[lx0, -1], [lx1, 1]] as const) F.decal(cell, lx, y, front + depth / 2, depth, h, { yaw: s * HALF_PI, tint: iron });
  F.part((lx0 + lx1) / 2, base + 1.1, front + depth, lx1 - lx0 + 0.04, 0.05, 0.07, iron, 'solid', false);
}

/** A washing line strung at height y in front of the wall, with three to five pieces of washing (mode 1 cloth). */
export function laundry(F: Frame, r: Rand, lx: number, y: number, lz: number, len: number) {
  F.part(lx, y + 0.01, lz, len, 0.015, 0.015, '#3d3a35', 'solid', false);
  const n = Math.max(2, Math.min(5, Math.floor(len / 0.6)));
  for (let k = 0; k < n; k++) {
    const t = -len / 2 + ((k + 0.5) * len) / n + (r() - 0.5) * 0.15;
    const cell = pick(r, [CLOTH.shirt, CLOTH.trousers, CLOTH.towel, CLOTH.shirt, CLOTH.aoDai, CLOTH.towel]);
    const h = cell === CLOTH.aoDai ? 1.05 : cell === CLOTH.trousers ? 0.78 : cell === CLOTH.towel ? 0.62 : 0.58;
    const w = cell === CLOTH.towel ? 0.32 : cell === CLOTH.aoDai ? 0.45 : 0.55;
    F.cloth(cell, lx + t, y - h / 2, lz + (r() - 0.5) * 0.04, w, h, { mode: 1, amp: 0.05, tint: pick(r, LAUNDRY), fine: true });
  }
}

/** A vertical light box (hộp đèn) standing out from the facade, the words stacked; on a steel bracket. */
export function verticalSign(F: Frame, text: string, lx: number, y: number, front: number, fg: string, bg: string) {
  F.part(lx, y + 0.98, front + 0.3, 0.06, 0.06, 0.62, '#3a3d3c', 'solid', false);
  F.part(lx, y - 0.98, front + 0.3, 0.06, 0.06, 0.62, '#3a3d3c', 'solid', false);
  F.tag('vertical', text, fg, bg, lx, y, front + 0.66, 0.56, 1.8, { yaw: HALF_PI, glow: 0.9 });
}

/** A border of LED strip round a shop sign (w x h centred at lx, y; in front at lz), blinking after dark. */
export const LED_COLORS = ['#ff3d3d', '#3dd6ff', '#ffd23d', '#7dff6a'];
export function ledBorder(F: Frame, lx: number, y: number, lz: number, w: number, h: number, color: ColorLike) {
  for (const s of [-1, 1]) {
    F.part(lx, y + s * (h / 2 + 0.04), lz, w + 0.13, 0.045, 0.045, color, 'led', false);
    F.part(lx + s * (w / 2 + 0.04), y, lz, 0.045, h + 0.04, 0.045, color, 'led', false);
  }
}

/** Mái thái: a short tiled roof along the top of the front, over the parapet. */
export function maiThai(F: Frame, lx: number, w: number, h: number, front: number, color: ColorLike) {
  F.solid('gable', lx, h + 0.55, front - 0.55, w + 0.2, 1.1, 1.3, color, 0, true, 0, 'roofTile');
}

export type RoofSpec = { lx: number; w: number; d: number; front: number; floor: number; wall: ColorLike; trim: ColorLike };
/**
 * A flat roof's clutter, `floor` being the roof surface: a stair hut (tum) at a back corner with the inox water tank
 * up on its slab, a solar water heater, a tôn shelter over the front half, a TV antenna, a dish, a line of washing
 * and blue water drums. Nothing rises more than 3.8 m over the roof (world.ts cuts away up to there).
 */
export function rooftop(F: Frame, r: Rand, s: RoofSpec, fine: (on: boolean) => void) {
  const { lx, w, d, front, floor } = s;
  const side = r() < 0.5 ? -1 : 1;
  const tum = w >= 4.2 && d >= 7 && r() < 0.8;
  const tw = 2.6, td = 3.0, tx = lx + side * (w / 2 - tw / 2 - 0.15), tz = -front + td / 2 + 0.3;
  let tankOn = { x: lx - side * (w / 2 - 1.1), y: floor, z: -front + 1.4 };
  if (tum) {
    F.part(tx, floor + 1.2, tz, tw, 2.4, td, s.wall, 'wall');
    F.part(tx, floor + 2.45, tz, tw + 0.2, 0.1, td + 0.2, s.trim);
    F.decal(DECAL.door, tx - side * 0.5, floor + 1.0, tz + td / 2 + 0.01, 0.9, 2.0);
    if (r() < 0.3) F.decal(DECAL.breeze, tx + side * 0.6, floor + 1.7, tz + td / 2 + 0.01, 0.8, 0.8);
    tankOn = { x: tx, y: floor + 2.5, z: tz };
  }
  if (r() < 0.7) {
    const { x, y, z } = tankOn;
    if (r() < 0.8) {
      for (const k of [-0.5, 0.5]) F.part(x + k, y + 0.12, z, 0.12, 0.24, 0.9, '#7a7f7d');
      F.solid('cylinder', x, y + 0.74, z, 0.5, 1.6, 0.5, '#d9dde0', HALF_PI);
      F.solid('cylinder', x + 0.81, y + 0.74, z, 0.46, 0.04, 0.46, '#c3c9cb', HALF_PI);
    } else {
      F.part(x, y + 0.1, z, 1.0, 0.2, 1.0, '#7a7f7d');
      F.solid('cylinder', x, y + 0.95, z, 0.55, 1.5, 0.55, '#d9dde0');
    }
  }
  const backHalf = { x: lx - side * (w / 2 - 1.15), z: -front + (tum ? 1.3 : 3.4) };
  if (w >= 3.2 && r() < 0.4) {
    // Solar water heater: a rack of glass tubes tilted to the sky with its tank along the top.
    const { x, z } = backHalf;
    F.decal(DECAL.solar, x, floor + 0.75, z, 1.5, 1.3, { pitch: 1.0 });
    F.solid('cylinder', x, floor + 1.15, z - 0.42, 0.2, 1.6, 0.2, '#cfd4d6', HALF_PI, true);
    for (const k of [-0.6, 0.6]) F.part(x + k, floor + 0.5, z - 0.35, 0.05, 0.9, 0.05, '#7a7f7d', 'solid', false);
  }
  if (r() < 0.3) {
    // A tôn shelter over the front of the roof, sloping down to the street.
    const sw = Math.min(w - 0.6, 4.4), sd = Math.min(d * 0.45, 3.6), cz = front - sd / 2 - 0.35, color = pick(r, TON);
    for (const a of [-1, 1]) for (const b of [-1, 1]) F.part(lx + (a * (sw - 0.2)) / 2, floor + 1.1 + b * 0.08, cz + (b * (sd - 0.2)) / 2, 0.07, 2.2 + b * 0.16, 0.07, '#5d6062');
    F.solid('box', lx, floor + 2.27, cz, sd + 0.2, 0.04, sw + 0.2, color, 0.09, true, HALF_PI);
    F.decal(DECAL.ton, lx, floor + 2.3, cz, sw + 0.2, sd + 0.2, { pitch: HALF_PI - 0.09, tint: color });
  }
  fine(true);
  if (r() < 0.3) {
    // TV antenna on the hut or a parapet corner.
    const ax = tum ? tx + side * 0.9 : lx + side * (w / 2 - 0.4), az = tum ? tz - 0.9 : -front + 0.4, ay = tum ? floor + 2.5 : floor;
    F.part(ax, ay + 1.4, az, 0.05, 2.8, 0.05, '#8a8f92', 'solid', false);
    for (const [y, len] of [[2.6, 1.3], [2.2, 1.0], [1.85, 0.7]]) F.part(ax, ay + y, az, 0.03, 0.03, len, '#8a8f92', 'solid', false);
  }
  if (r() < 0.15) {
    const dx = lx - side * (w / 2 - 0.5);
    F.solid('ball', dx, floor + 0.9, -front + 0.6, 0.38, 0.38, 0.12, '#e6e6e0', 0, false, 0.6);
    F.part(dx, floor + 0.45, -front + 0.55, 0.05, 0.9, 0.05, '#8a8f92', 'solid', false);
  }
  if (r() < 0.3 && w >= 3.6) {
    // A line of washing across the roof between two posts.
    const len = Math.min(w - 1.2, 3.4), z = tum ? front - 1.6 : 0;
    for (const k of [-1, 1]) F.part(lx + (k * len) / 2, floor + 0.95, z, 0.05, 1.9, 0.05, '#6b6f70', 'solid', false);
    laundry(F, r, lx, floor + 1.85, z, len);
  }
  if (r() < 0.2) for (const k of [0, 1]) F.solid('cylinder', lx - side * (w / 2 - 0.5 - k * 0.7), floor + 0.45, -front + 0.6, 0.3, 0.9, 0.3, '#2f6fb5', 0, false);
  fine(false);
}

/** What fills an open shop front, by counter kind. */
export type FrontKind = 'goods' | 'pharmacy' | 'gold' | 'barber' | 'tailor' | 'repair' | 'florist' | 'food' | 'cafe' | 'home';
/**
 * The light of an open front by kind (night plan §6.3): its back wall and ceiling panel (the 'tube' role: grey by day,
 * luma-matched to the old greys, so only their hue moves; after dark the tube glow turns that hue into cool or warm
 * light), the entrance tube, and the spill pool on the pavement (display colour × strength `s`: how much it multiplies
 * the pavement's light, street-lights.ts). Cool white for a
 * tạp hóa, a pharmacy or a barber, warm for food and cafés, bright warm for the gold shop.
 */
export const FRONT_LIGHT: Record<FrontKind, { wall: string; tube: string; pool: string; s: number }> = {
  goods: { wall: '#8c99a3', tube: '#eef8ff', pool: '#d9ecff', s: 0.8 },
  pharmacy: { wall: '#8a9c9b', tube: '#f0fbff', pool: '#d6f0e6', s: 0.82 },
  gold: { wall: '#a6977a', tube: '#fff3c8', pool: '#ffe08a', s: 0.9 },
  barber: { wall: '#8d99a0', tube: '#eef8ff', pool: '#dfeeff', s: 0.75 },
  tailor: { wall: '#9e9587', tube: '#fff6e6', pool: '#ffe6c4', s: 0.75 },
  florist: { wall: '#9a978b', tube: '#fffbe8', pool: '#fff0d8', s: 0.75 },
  repair: { wall: '#8e979b', tube: '#e8f2ff', pool: '#dfe9f5', s: 0.65 },
  food: { wall: '#a09484', tube: '#fff1d6', pool: '#ffd6a0', s: 0.85 },
  cafe: { wall: '#9e9282', tube: '#ffe6bf', pool: '#ffcf96', s: 0.85 },
  home: { wall: '#93897a', tube: '#ffe9c8', pool: '#ffd9a8', s: 0.5 },
};
/**
 * How many draws openFront takes from its random stream for a kind (its back wall, floor, side, then the goods' colours
 * or the home's gate). world.ts skips this many when a district front gets a kind of its own, so nothing drawn after
 * the front on that building moves.
 */
export const frontDraws = (kind: FrontKind) => 3 + (kind === 'home' ? 1 : kind === 'goods' || kind === 'pharmacy' || kind === 'florist' || kind === 'barber' || kind === 'tailor' || kind === 'gold' ? 12 : 0);
export type FrontSpec = {
  lx: number; w: number; h: number; d: number; front: number; wall: ColorLike;
  kind: FrontKind;
  /** Building id whose opening hours switch the light pool; -1 for always (homes). */
  shop: number;
  /** Draw a shutter drum (a counter's shutter is drawn by game.ts, with its drum, so not there). */
  drum: boolean;
  /** The widest the opening may be (a counter's roller shutter from game.ts is at most 9 m wide). */
  maxOpening?: number;
  /** The fine-layer switch: the furniture inside goes there (what hangs on the back wall and the gate stay). */
  fine: (on: boolean) => void;
};
/**
 * How deep the ground floor of an open front sits behind the facade, the height of its opening, and the width of the
 * pillar each side of it (the house-number plate goes on one).
 */
export const RECESS = 1.5, OPENING = 3.25, PILLAR = 0.5;
/** The pillar each side of an open front w wide whose opening is at most maxOpening. */
export const pillarWidth = (w: number, maxOpening = Infinity) => Math.max(PILLAR, (w - maxOpening) / 2);
/**
 * An open front: the ground floor recessed RECESS behind the facade under the floors above, its cheeks, a tiled
 * floor and a pale back wall, a fluorescent tube under the ceiling and a light pool on the pavement at night, and
 * inside what the place is: goods on shelves, a steaming pot and a menu, a drinks fridge, a family altar behind a
 * folding gate. Returns where the wall boxes stop, so the caller draws nothing over the opening.
 */
export function openFront(F: Frame, r: Rand, s: FrontSpec) {
  const { lx, w, h, d, front, wall } = s, R = RECESS, O = OPENING, P = pillarWidth(w, s.maxOpening);
  const back = front - R, inside = front - R / 2, iw = w - 2 * P;
  F.part(lx, O + (h - O) / 2, 0, w, h - O, d, wall, 'wall');
  F.part(lx, O / 2, -R / 2, w, O, d - R, wall, 'wall');
  for (const k of [-1, 1]) F.part(lx + k * (w / 2 - P / 2), (O + 0.5) / 2, inside, P, O - 0.5, R, wall, 'wall');
  // The back wall and a ceiling panel glow with the tube after dark (tube role: lit in their own colour, the kind's
  // light), shaded grey by day. The panel stops 0.4 m short of the front, so nothing lit shows above a closed shutter.
  const light = FRONT_LIGHT[s.kind];
  r(); // (the back wall's grey used to be picked here: the stream stays as it was)
  F.part(lx, 1.9, back + 0.02, iw, 2.8, 0.04, light.wall, 'tube', false);
  F.part(lx, O - 0.03, inside - 0.2, iw - 0.2, 0.03, R - 0.6, light.wall, 'tube', false);
  F.part(lx, 0.52, inside, iw, 0.04, R, pick(r, ['#d8d2c4', '#c9c4b8', '#e0d6c2']), 'tiles', false);
  F.part(lx, O - 0.08, inside, 1.2, 0.05, 0.1, light.tube, 'tube', false);
  if (s.drum) F.part(lx, O - 0.12, front - 0.06, w - 0.4, 0.26, 0.26, DRUM);
  const side = r() < 0.5 ? -1 : 1, edge = lx + side * (iw / 2 - 0.5), wallDecal = { fine: false };
  s.fine(true);
  switch (s.kind) {
    case 'goods': case 'pharmacy': case 'florist': case 'barber': case 'tailor': case 'gold': {
      for (const p of pieces(lx - iw / 2 + 0.1, lx + iw / 2 - 0.1, 1.4)) F.decal(s.kind === 'barber' ? DECAL.poster : DECAL.goods, p.c, 1.75, back + 0.05, p.len, 2.1, wallDecal);
      if (s.kind === 'barber') F.part(lx, 1.6, back + 0.06, Math.min(iw - 0.6, 2.2), 1.1, 0.03, '#a9c4cc', 'glass', false);
      for (const k of [-1, 1]) {
        const sx = lx + k * (iw / 2 - 0.5);
        F.part(sx, 1.35, back + 0.32, 0.9, 1.6, 0.45, '#8a6a4c', 'solid', false);
        for (let n = 0; n < 6; n++) F.solid('bead', sx - 0.3 + (n % 3) * 0.3, 0.95 + Math.floor(n / 3) * 0.55, back + 0.5, 0.11, 0.13, 0.08, pick(r, s.kind === 'florist' ? ['#ef8fb0', '#e5484d', '#f5c84a', '#f4f1e8', '#a07cc5'] : s.kind === 'tailor' ? ['#c8322a', '#2f5d8a', '#e8d6a8', '#5e927c', '#7a4fa0'] : ['#e5484d', '#f5c84a', '#3f8fc9', '#5e9a5a', '#f08c3a', '#f4f1e8']), 0, false);
      }
      F.part(lx, 0.98, front - 0.35, Math.min(iw - 1.2, 1.8), 0.9, 0.5, s.kind === 'gold' ? '#d9c38a' : '#bfd3d6', s.kind === 'gold' ? 'solid' : 'glass', false);
      if (s.kind === 'gold') for (let n = 0; n < 6; n++) F.solid('bead', lx - 0.6 + n * 0.24, 1.47, front - 0.35, 0.07, 0.05, 0.07, '#e8c040', 0, false);
      if (s.kind === 'goods') F.decal(DECAL.snacks, lx + side * 0.6, O - 0.55, front - 0.12, 1.3, 0.8, wallDecal);
      if (s.kind === 'pharmacy') { F.part(lx, O + 0.45, front + 0.06, 0.18, 0.55, 0.05, '#2f9a5a', 'tube', false); F.part(lx, O + 0.45, front + 0.06, 0.55, 0.18, 0.05, '#2f9a5a', 'tube', false); }
      break;
    }
    case 'repair': {
      for (let n = 0; n < 5; n++) F.solid('cylinder', edge - side * n * 0.08, 0.86 + n * 0.17, back + 0.4, 0.3, 0.14, 0.3, '#1f2224', 0, false);
      for (const p of pieces(lx - iw * 0.3, lx + iw * 0.3, 1.4)) F.decal(DECAL.goods, p.c, 2.0, back + 0.05, p.len, 1.4, wallDecal);
      F.part(lx - side * 0.6, 0.85, front - 0.4, 0.7, 0.6, 0.4, '#c8322a', 'solid', false);
      F.part(lx - side * 0.6, 1.25, front - 0.4, 0.2, 0.2, 0.2, '#3a3d3c', 'solid', false);
      break;
    }
    case 'food': {
      F.decal(DECAL.menu, lx + side * 0.4, 2.0, back + 0.05, 1.0, 1.0, wallDecal);
      F.part(lx - side * (iw / 2 - 0.45), 1.35, back + 0.4, 0.75, 1.65, 0.6, '#d8dcdc', 'solid', false);
      F.decal(DECAL.fridge, lx - side * (iw / 2 - 0.45), 1.35, back + 0.71, 0.7, 1.6);
      F.part(lx + side * 0.3, 0.95, front - 0.45, 1.5, 0.08, 0.6, '#c9ccd0', 'solid', false);
      F.part(lx + side * 0.3, 0.73, front - 0.45, 1.4, 0.4, 0.5, '#9aa0a4', 'solid', false);
      F.solid('cylinder', lx + side * 0.75, 1.2, front - 0.45, 0.3, 0.42, 0.3, '#c7ccce', 0, false);
      F.smoke('steam', lx + side * 0.75, 1.5, front - 0.4);
      break;
    }
    case 'cafe': {
      F.part(lx - side * (iw / 2 - 0.45), 1.35, back + 0.4, 0.75, 1.65, 0.6, '#d8dcdc', 'solid', false);
      F.decal(DECAL.fridge, lx - side * (iw / 2 - 0.45), 1.35, back + 0.71, 0.7, 1.6);
      F.part(lx + side * 0.2, 0.98, front - 0.45, 1.6, 0.9, 0.5, '#8a6a4c', 'solid', false);
      for (let n = 0; n < 4; n++) F.solid('cylinder', lx + side * (n * 0.18 - 0.1), 1.5, front - 0.45, 0.04, 0.1, 0.04, '#c0c4c6', 0, false);
      F.decal(DECAL.birdcage, lx + side * (iw / 2 - 0.4), O - 0.6, front - 0.25, 0.45, 0.55);
      break;
    }
    case 'home': {
      F.decal(DECAL.familyAltar, lx, 1.9, back + 0.05, 1.3, 1.3, wallDecal);
      F.part(lx, 1.2, back + 0.25, 1.4, 0.06, 0.4, '#5a3a22', 'solid', false);
      for (const k of [-0.5, 0.5]) F.solid('ball', lx + k, 2.65, back + 0.2, 0.09, 0.12, 0.09, '#d8402c', 0, false, 0, 'lantern');
      F.part(lx + side * (iw / 2 - 0.45), 0.95, back + 0.3, 0.7, 0.85, 0.45, '#6a4428', 'solid', false);
      F.part(lx, O - 0.3, inside, 0.05, 0.3, 0.05, '#4a4a4a', 'solid', false);
      for (const a of [0, 1.05, 2.1]) F.solid('box', lx, O - 0.45, inside, 0.9, 0.015, 0.12, '#e4e0d8', 0, false, a);
      // A folding steel gate (cửa xếp) pulled across: the room shows through, nobody walks in.
      const gate = pick(r, ['#4f5d5a', '#6b6f70', '#2f5a6a']);
      for (const p of pieces(lx - iw / 2 - 0.02, lx + iw / 2 + 0.02, 1.1)) F.decal(DECAL.gate, p.c, (O + 0.5) / 2, front - 0.04, p.len, O - 0.5, { tint: gate, fine: false });
      break;
    }
  }
  s.fine(false);
  F.pool(lx, front + 1.8, 5.2, s.shop, light.pool, light.s);
}
