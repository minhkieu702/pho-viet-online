import * as THREE from 'three';
import { ARM, HEAD, LEG, TORSO } from './anatomy.ts';
import { FIGURE } from './pose.ts';

/**
 * How people dress: a deterministic outfit per person by role and gender (áo bà ba, áo dài, nón lá, mũ cối,
 * mũ tai bèo, khăn rằn, pupils' white shirts with the red scarf, riders' sun jackets and masks...), packed
 * into the four per-instance palettes of the figure meshes.
 */

/** The colours a caller gives a person (structurally the same as RagdollLook). */
export type FigureLook = { shirt: string; pants: string; skin: string; hat?: string; helmet?: string };

export type FigureColors = {
  shirt: string; pants: string; skin: string; hair: string; accent: string; accent2: string;
  /** Sleeve above the hem, lower arm (skin for short sleeves), hands (skin or gloves). */
  upper: string; lower: string; hands: string;
  thigh: string; shin: string; shoes: string; sole: string;
  /** Held items: phone case, fan paper / plastic bag. */
  item: string; item2: string;
};

export type FigureStyle = {
  fem: boolean;
  /** Part masks: body word A (HEAD), body word B (TORSO), arms (ARM) and legs (LEG). */
  head: number; torso: number; armL: number; armR: number; legs: number;
  colors: FigureColors;
  /** Per-person build: horizontal and vertical scale on top of the body scale. */
  width: number; height: number;
  /** Shoulder pivot x for this build (narrower for women). */
  shoulderX: number;
};

export type WardrobeRole =
  | 'worker' | 'student' | 'retiree' | 'vendor' | 'owl' | 'gang' | 'thief'
  | 'rider' | 'driver' | 'police' | 'swat' | 'player';

const HAIR = ['#141110', '#1d1916', '#221a16', '#2a2220', '#33261f'];
const DYED = ['#4a3426', '#5a3d2b', '#6b4a32'];
const GREY = ['#cfcac2', '#a9a49c', '#bdb7ad', '#8f8a84'];
const SHOES = ['#1e1a18', '#3b2a20', '#1c1c1e', '#4a3828'];
const SNEAKERS = ['#e9e4da', '#d8d4cc', '#f2efe8', '#3a4a63'];
const DEP = ['#c0392b', '#2f5f9f', '#3a3a3a', '#d8c9a8', '#6a8a5a', '#e2a33a'];
const COLLAR_M = ['#f2f2ee', '#c9d8ea', '#b9bcc0', '#e6e0d0', '#dfe6ee'];
const BLOUSE = ['#f4f1ea', '#f3d9de', '#d9e6f2', '#e8e0f0', '#f6e7c8'];
const TROUSERS = ['#2b2f36', '#3a3f48', '#4a4038', '#26303a'];
const AO_DAI = ['#c9d7ea', '#e8c3cf', '#b8232a', '#f0d27a', '#7fae9a'];
const BA_BA = ['#1d1b1a', '#6b4a35', '#2f3a5a', '#7a2e3a', '#5b3f6b'];
const BA_BA_MUTED = ['#4a4a52', '#5a4038', '#3b3f4a', '#6b5a4a', '#2f2f33'];
const WIDE_PANTS = ['#1d1b1a', '#2a2522', '#3a2f2a', '#23232a'];
const KHAKI = ['#e3d6b8', '#cfc3a3', '#b8b29a', '#d9d4c8'];
const KHAKI_PANTS = ['#7b6a58', '#6d6a63', '#5a5a52', '#4f4a40'];
const JEANS = ['#3b4a63', '#2f3b52', '#46556e'];
const BRIGHT = ['#c0392b', '#2f6fb0', '#e2a33a', '#3f8f6a', '#8a4fb0', '#e06a8a'];
const JACKETS = ['#f0c8d4', '#c8dcef', '#d4d4d8', '#f4f1ea', '#2f3a5a', '#9fc0b0', '#e8d0a0'];
const MASKS = ['#b4cfdc', '#2c3036', '#e8e8e4', '#e8a0b4', '#5a6a8a'];
const HELMETS = ['#f2efe6', '#c9493b', '#2b2f33', '#4f86c6', '#e2b53a', '#86b8a0', '#e8a0b4'];
const PHONES = ['#1d2024', '#e8e4dc', '#c9a48a', '#3a4a6b'];
const ITEM2 = ['#d84a4a', '#e88aa8', '#f2efe6', '#3a6ab0', '#2b2b2b', '#e2b53a'];
/** The áo dài and white trousers of high-school girls. */
const SCHOOL_WHITE = '#f6f4ee';
const CONE = '#e6d3a0';

function hashOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * A deterministic outfit for a look: `seed` varies people who share a look, `role` picks the wardrobe.
 * `bandana` dresses a gang member in the gang's colour.
 */
export function deriveStyle(look: FigureLook, seed: number | string = 0, role: WardrobeRole | string = '', extra: { bandana?: string; fem?: boolean } = {}): FigureStyle {
  const r = (k: number) => hashOf(`${look.shirt}|${look.pants}|${look.skin}|${look.hat ?? ''}|${look.helmet ?? ''}|${seed}|${role}:${k}`);
  const pick = <T,>(list: readonly T[], k: number) => list[Math.floor(r(k) * list.length) % list.length];
  const chance = (p: number, k: number) => r(k) < p;
  const femOdds: Record<string, number> = { worker: 0.5, student: 0.5, retiree: 0.5, vendor: 0.75, owl: 0.4, gang: 0.1, thief: 0, rider: 0.5, driver: 0.35, police: 0, swat: 0, player: 0 };
  const fem = extra.fem ?? chance(femOdds[role] ?? 0.5, 1);
  const skin = look.skin;
  const c: FigureColors = {
    shirt: look.shirt, pants: look.pants, skin, hair: pick(HAIR, 2), accent: look.hat ?? look.helmet ?? CONE, accent2: pick(BRIGHT, 3),
    upper: look.shirt, lower: skin, hands: skin, thigh: look.pants, shin: look.pants, shoes: pick(SHOES, 4), sole: '#1b1917',
    item: pick(PHONES, 5), item2: pick(ITEM2, 6),
  };
  let head: number = HEAD.EYES, torso: number = TORSO.HEAD | (fem ? TORSO.FEMALE : TORSO.MALE);
  let armL = 0, armR = 0, legs: number = LEG.SHOE;
  let width = fem ? 0.93 + r(7) * 0.1 : 0.97 + r(7) * 0.12;
  let height = fem ? 0.93 + r(8) * 0.06 : 0.97 + r(8) * 0.07;
  const femHair = () => (head |= pick([HEAD.LONG, HEAD.BOB, HEAD.TAIL, HEAD.LONG, HEAD.BUN], 10));
  const maleHair = () => (head |= pick([HEAD.SHORT, HEAD.SIDE_PART, HEAD.SHORT, HEAD.BUZZ], 10));
  const longSleeves = () => { c.lower = c.shirt; };
  const bareLegs = () => { c.thigh = skin; c.shin = skin; };
  const shorts = () => { c.shin = skin; };
  const dep = () => { legs = LEG.BARE | LEG.DEP; c.shoes = pick(DEP, 11); c.sole = r(12) < 0.5 ? '#d9d2c4' : c.shoes; };
  const sandal = () => { legs = LEG.BARE | LEG.SANDAL; c.shoes = pick(['#3b2a20', '#1c1c1e', '#6b4a35'], 11); c.sole = '#2a2420'; };
  const sneakers = () => { legs = LEG.SHOE; c.shoes = pick(SNEAKERS, 11); c.sole = '#ece8e0'; };
  const leather = () => { legs = LEG.SHOE; c.shoes = pick(SHOES, 11); c.sole = '#141210'; };
  const aoDai = (color: string, trousers: string) => {
    torso |= TORSO.AO_DAI; c.shirt = c.upper = c.lower = color; c.pants = c.thigh = c.shin = trousers;
    legs = (chance(0.6, 13) ? LEG.HEEL : LEG.BARE | LEG.SANDAL) | LEG.WIDE; c.shoes = pick(['#e8e2d6', '#3b2a20', '#c9a48a'], 11); c.sole = '#2a2420';
  };

  switch (role) {
    case 'worker':
      if (fem) {
        femHair();
        if (chance(0.2, 20)) {
          // Áo dài with white trousers or trousers of the same colour.
          const color = pick(AO_DAI, 21);
          aoDai(color, chance(0.5, 22) ? SCHOOL_WHITE : color);
          if (chance(0.2, 23)) { head |= HEAD.CONE; c.accent = CONE; }
        } else {
          torso |= TORSO.COLLAR; c.shirt = c.upper = pick(BLOUSE, 21);
          if (chance(0.5, 22)) { torso |= TORSO.SKIRT; c.pants = pick(TROUSERS, 24); bareLegs(); if (chance(0.5, 25)) { legs = LEG.HEEL; c.shoes = pick(SHOES, 11); } else sandal(); }
          else { c.pants = c.thigh = c.shin = pick(TROUSERS, 24); if (chance(0.5, 25)) { legs = LEG.HEEL; c.shoes = pick(SHOES, 11); } else sandal(); }
        }
        if (chance(0.2, 26)) armL |= ARM.WATCH;
        if (chance(0.15, 27)) armR |= ARM.BANGLE;
      } else {
        maleHair();
        torso |= TORSO.COLLAR | TORSO.BELT; c.shirt = c.upper = pick(COLLAR_M, 21); c.pants = c.thigh = c.shin = pick(TROUSERS, 24);
        if (chance(0.5, 22)) { longSleeves(); armL |= ARM.CUFF; armR |= ARM.CUFF; }
        if (chance(0.1, 23)) { torso |= TORSO.TIE; c.accent2 = pick(['#7a1f2b', '#22304f', '#3a4a3a', '#5a3a5a'], 28); }
        if (chance(0.25, 29)) head |= HEAD.GLASSES;
        if (chance(0.3, 26)) armL |= ARM.WATCH;
        leather();
      }
      break;
    case 'student': {
      height = 0.85 + r(8) * 0.05; width *= 0.94;
      if (fem && chance(0.4, 20)) {
        // High-school girls in the white áo dài with their hair long or tied back.
        head |= chance(0.5, 21) ? HEAD.LONG : HEAD.TAIL;
        aoDai(SCHOOL_WHITE, SCHOOL_WHITE);
        legs = LEG.BARE | LEG.SANDAL | LEG.WIDE; c.shoes = '#3b2a20';
        if (chance(0.5, 22)) torso |= TORSO.BACKPACK;
      } else {
        if (fem) head |= pick([HEAD.TAIL, HEAD.LONG, HEAD.BOB], 10); else head |= pick([HEAD.SHORT, HEAD.BUZZ, HEAD.SIDE_PART], 10);
        torso |= TORSO.COLLAR | TORSO.RED_SCARF | TORSO.BACKPACK; c.shirt = c.upper = '#f4f4f0';
        c.pants = c.thigh = c.shin = '#22304f';
        if (fem) { torso |= TORSO.SKIRT; bareLegs(); }
        if (chance(0.5, 23)) sandal(); else { sneakers(); c.shoes = '#f2efe8'; }
      }
      c.accent2 = pick(BRIGHT, 24);
      break;
    }
    case 'vendor':
      if (fem) {
        head |= chance(0.6, 10) ? HEAD.BUN : HEAD.TAIL;
        torso |= TORSO.BA_BA; c.shirt = c.upper = pick(BA_BA, 20); longSleeves();
        c.pants = c.thigh = c.shin = pick(WIDE_PANTS, 21);
        dep(); legs |= LEG.WIDE;
        if (chance(0.6, 22)) { head |= HEAD.CONE; c.accent = CONE; }
        if (chance(0.2, 23)) { torso |= TORSO.KHAN_RAN; c.accent2 = pick(['#1e2a4a', '#1a1a1a', '#22324e'], 24); }
        if (chance(0.3, 25)) { torso |= TORSO.APRON; if (!(torso & TORSO.KHAN_RAN)) c.accent2 = pick(['#5a7aa0', '#a04a4a', '#4a6a4a', '#d8c9a8'], 24); }
        if (chance(0.4, 26)) torso |= TORSO.GANH;
      } else {
        head |= pick([HEAD.SHORT, HEAD.BUZZ], 10);
        if (chance(0.5, 20)) { torso |= TORSO.TANK; c.shirt = pick(['#ecebe6', '#cfd2d4', '#e8e0cc'], 21); c.upper = skin; }
        shorts(); dep();
        if (chance(0.3, 22)) { const pith = chance(0.5, 23); head |= pith ? HEAD.PITH : HEAD.BUCKET; c.accent = pith ? '#5f6b3a' : '#7a7458'; }
      }
      break;
    case 'retiree':
      height *= 0.97;
      c.hair = pick(GREY, 2);
      if (fem) {
        head |= HEAD.BUN;
        torso |= TORSO.BA_BA; c.shirt = c.upper = pick(BA_BA_MUTED, 20); longSleeves();
        c.pants = c.thigh = c.shin = pick(WIDE_PANTS, 21);
        dep(); legs |= LEG.WIDE;
        if (chance(0.3, 22)) { head |= HEAD.CONE; c.accent = CONE; }
      } else {
        head |= chance(0.6, 10) ? HEAD.THIN : HEAD.BUZZ;
        if (chance(0.7, 20)) { torso |= TORSO.COLLAR; c.shirt = c.upper = pick(KHAKI, 21); if (chance(0.4, 22)) longSleeves(); }
        else { torso |= TORSO.TANK; c.shirt = '#ecebe6'; c.upper = skin; }
        c.pants = c.thigh = c.shin = pick(KHAKI_PANTS, 23);
        const hat = r(24);
        if (hat < 0.35) { head |= HEAD.PITH; c.accent = '#5f6b3a'; } else if (hat < 0.65) { head |= HEAD.BUCKET; c.accent = pick(['#6b6a4a', '#8a7f5f', '#4a5a4a'], 25); }
        if (chance(0.2, 26)) head |= HEAD.GLASSES;
        // Some grandfathers keep a short grey beard and moustache.
        if (chance(0.3, 27)) head |= HEAD.BEARD;
        if (chance(0.5, 27)) dep(); else sandal();
      }
      break;
    case 'owl':
      if (fem) femHair(); else maleHair();
      if (chance(0.25, 19)) c.hair = pick(DYED, 2);
      if (chance(0.4, 20)) shorts(); else c.pants = c.thigh = c.shin = pick(JEANS, 21);
      if (chance(0.4, 22)) { head |= HEAD.BASEBALL; c.accent = pick(['#c0392b', '#1f2a40', '#2b2b2b', '#e8e2d6'], 23); }
      if (chance(0.6, 24)) sneakers(); else dep();
      break;
    case 'gang':
      head |= HEAD.BUZZ | HEAD.BANDANA; c.accent = extra.bandana ?? look.hat ?? '#c0392b';
      if (chance(0.6, 20)) { torso |= TORSO.TANK; c.upper = skin; }
      leather();
      break;
    case 'thief':
      maleHair();
      if (chance(0.6, 20)) { head |= HEAD.BASEBALL; c.accent = '#1c1c1e'; }
      if (chance(0.5, 21)) { head |= HEAD.MASK; c.accent2 = '#2c3036'; }
      leather();
      break;
    case 'rider': {
      // Helmets are the law; many wear a face mask, a sun jacket (some with the hood over the helmet) and gloves.
      head |= HEAD.HELMET; c.accent = look.helmet ?? pick(HELMETS, 20);
      if (fem && chance(0.5, 21)) head |= chance(0.5, 22) ? HEAD.LONG : HEAD.TAIL;
      c.accent2 = pick(MASKS, 23);
      if (chance(0.6, 24)) head |= HEAD.MASK;
      if (chance(fem ? 0.6 : 0.4, 25)) {
        torso |= TORSO.JACKET; c.shirt = c.upper = pick(JACKETS, 26); longSleeves(); c.hands = c.accent2;
        if (chance(0.5, 27)) head |= HEAD.HOOD;
      }
      if (fem && chance(0.3, 28)) { torso |= TORSO.SKIRT; c.pants = c.accent2; }
      if (chance(0.5, 29)) dep(); else sandal();
      break;
    }
    case 'driver':
      if (fem) femHair(); else maleHair();
      torso |= TORSO.COLLAR; c.shirt = c.upper = look.shirt;
      if (chance(0.2, 20)) head |= HEAD.GLASSES;
      leather();
      break;
    case 'police':
      // Công an: the olive uniform with the red-banded peaked cap, and low black shoes.
      head |= HEAD.SHORT | HEAD.CAP; torso |= TORSO.KIT; c.accent = look.helmet ?? look.pants;
      c.hair = '#1d1916'; legs = LEG.SHOE; c.shoes = '#15171a'; c.sole = '#0f1012';
      width = 1.04; height = 1.01;
      break;
    case 'swat':
      head |= HEAD.SWAT; torso |= TORSO.VEST; c.accent = look.helmet ?? '#101214';
      longSleeves(); c.hands = '#1a1b1d'; legs = LEG.BOOT; c.shoes = '#121315'; c.sole = '#0c0d0e';
      width = 1.1; height = 1.02;
      break;
    case 'player':
      // The delivery rider: a uniform jacket, trousers and sneakers; the helmet when the look has one.
      if (look.helmet) { head |= HEAD.HELMET; c.accent = look.helmet; } else head |= HEAD.SHORT;
      torso |= TORSO.JACKET; c.lower = skin;
      sneakers(); c.shoes = '#f6ead2'; c.sole = '#c8b593';
      width = 1; height = 1;
      break;
    default:
      if (fem) femHair(); else maleHair();
      if (look.hat && fem) { head |= HEAD.CONE; c.accent = look.hat; }
      if (look.helmet) { head |= HEAD.HELMET; c.accent = look.helmet; }
      break;
  }
  // A hat from the look: the nón lá is a woman's sun hat; a man given one wears a bucket hat instead.
  if (look.hat && role !== 'student' && role !== 'gang' && role !== 'police' && !(head & (HEAD.PITH | HEAD.BUCKET | HEAD.BASEBALL | HEAD.HELMET | HEAD.CONE))) {
    if (fem) { head |= HEAD.CONE; c.accent = look.hat; } else { head |= HEAD.BUCKET; c.accent = '#7a7458'; }
  }
  // Ears show unless long hair or a bob falls over them.
  if (!(head & (HEAD.LONG | HEAD.BOB))) head |= HEAD.EARS;
  return { fem, head, torso, armL, armR, legs, colors: c, width, height, shoulderX: fem ? FIGURE.shoulderXF : FIGURE.shoulderX };
}

const scratch = new THREE.Color();
const darken = (hex: string, k: number, grey = 0.25) => {
  scratch.set(hex);
  const l = (scratch.r + scratch.g + scratch.b) / 3;
  scratch.setRGB((scratch.r + (l - scratch.r) * grey) * k, (scratch.g + (l - scratch.g) * grey) * k, (scratch.b + (l - scratch.b) * grey) * k);
  return `#${scratch.getHexString()}`;
};

/** A turned resident: faded, dirtied clothes, some barefoot, hats lost except the odd nón lá. Skin comes from the look. */
export function zombify(style: FigureStyle, seed: number | string): FigureStyle {
  const r = (k: number) => hashOf(`zombie|${seed}:${k}`);
  const c = { ...style.colors };
  for (const key of ['shirt', 'pants', 'accent', 'accent2', 'shoes', 'sole', 'thigh', 'shin', 'upper', 'lower'] as const) if (c[key] !== c.skin) c[key] = darken(c[key], 0.62);
  c.hair = darken(c.hair, 0.8, 0.5);
  let head = style.head & ~(HEAD.CAP | HEAD.SWAT | HEAD.HELMET | HEAD.HOOD | HEAD.BASEBALL | HEAD.BUCKET | HEAD.PITH | HEAD.BANDANA | HEAD.MASK | HEAD.CONE);
  if (style.head & HEAD.CONE && r(1) < 0.4) head |= HEAD.CONE;
  if (!(head & (HEAD.SHORT | HEAD.SIDE_PART | HEAD.LONG | HEAD.BUN | HEAD.TAIL | HEAD.BOB | HEAD.THIN | HEAD.BUZZ))) head |= style.fem ? HEAD.LONG : HEAD.SHORT;
  let legs = style.legs;
  if (r(2) < 0.35) legs = LEG.BARE | (legs & LEG.WIDE);
  return { ...style, colors: c, head, torso: style.torso & ~TORSO.GANH, legs, armL: style.armL & ~ARM.WATCH, armR: 0 };
}

// ---- Palettes ---------------------------------------------------------------------------------------------

const tmp = new THREE.Color();
/** A colour as the 24-bit sRGB integer the shader unpacks (exact in a float). */
export const packColor = (color: THREE.ColorRepresentation) => tmp.set(color).getHex(THREE.SRGBColorSpace);

/**
 * Packs six slot colours and two part masks into the 8 floats one instance needs: look0 = slots 0..3,
 * look1 = slots 4, 5, maskA, maskB. Masks must fit in 24 bits (each word is a float).
 */
export function palette(colors: readonly (THREE.ColorRepresentation | undefined)[], maskA = 0, maskB = 0, out = new Float32Array(8)) {
  for (let k = 0; k < 6; k++) out[k] = packColor(colors[k] ?? '#ffffff');
  out[6] = maskA;
  out[7] = maskB;
  return out;
}

/** Turns part bits of a palette's mask word (0 = maskA, 1 = maskB) on or off. */
export function setBits(look: Float32Array, word: 0 | 1, bits: number, on: boolean) {
  const i = 6 + word;
  look[i] = on ? (look[i] | bits) : (look[i] & ~bits);
  return look;
}

export type FigurePalettes = { body: Float32Array; armL: Float32Array; armR: Float32Array; legs: Float32Array };

/** The four palettes of a styled person (fresh arrays: keep them per person and rewrite only the masks). */
export function palettesOf(style: FigureStyle): FigurePalettes {
  const c = style.colors;
  const arm = [c.upper, c.lower, c.hands, c.shirt, c.item, c.item2];
  return {
    body: palette([c.shirt, c.pants, c.skin, c.hair, c.accent, c.accent2], style.head, style.torso),
    armL: palette(arm, style.armL),
    armR: palette(arm, style.armR),
    legs: palette([c.thigh, c.shin, c.shoes, c.skin, c.sole, c.accent2], style.legs),
  };
}

const styles = new WeakMap<object, FigureStyle>();
/** Remembers how a look is dressed so its ragdoll (and anyone else drawing it) matches the standing person. */
export function setStyle(look: FigureLook, style: FigureStyle) { styles.set(look, style); }
export function styleOf(look: FigureLook) {
  let style = styles.get(look);
  if (!style) { style = deriveStyle(look); styles.set(look, style); }
  return style;
}
