import type * as THREE from 'three';

/** The instanced primitives world.ts batches (one InstancedMesh per kind, role and shadow flag). */
export type Kind = 'box' | 'cylinder' | 'cone' | 'ball' | 'bead' | 'gable' | 'hip' | 'pyramid' | 'puff' | 'trunk' | 'frond';
/**
 * Material families: each is one shared material, so colour variety costs no extra draw calls. `wall` is weathered
 * render (raw concrete on the side walls, rain streaks), `paving` and `tiles` lay square tiles on the faces (paving is
 * never cut away, tiles are: roof decks, cladding, shop floors), `roofTile` barrel tiles on prisms, `tube` a
 * fluorescent tube and `led` a blinking LED border, both glowing in their instance colour at night.
 */
export type Role = 'solid' | 'ground' | 'glass' | 'glassLit' | 'lamp' | 'lantern' | 'water' | 'neon' | 'wall' | 'paving' | 'tiles' | 'roofTile' | 'tube' | 'led';
export type ColorLike = string | THREE.Color;

/** Cells of the decal atlas (dressing.ts decalAtlas). */
export const DECAL = {
  gate: 0, grille: 1, grilleDiamond: 2, railing: 3, railingBars: 4, breeze: 5, ac: 6, solar: 7,
  snacks: 8, lottery: 9, thanTai: 10, familyAltar: 11, stickers: 12, danger: 13, ton: 14, door: 15,
  birdcage: 16, shutter: 17, goods: 18, fridge: 19, menu: 20, tiles: 21, meters: 22, poster: 23,
} as const;
export type DecalCell = (typeof DECAL)[keyof typeof DECAL];
export type DecalOpts = { tint?: ColorLike; pitch?: number; rot90?: boolean; fine?: boolean };
export type ClothOpts = { mode: 0 | 1; amp?: number; tint?: ColorLike; fine?: boolean };
/** Cloth atlas cells (dressing.ts clothAtlas). */
export const CLOTH = { flag: 0, shirt: 1, trousers: 2, towel: 3, aoDai: 4, buddhist: 5, sheet: 6, pennant: 7 } as const;
export type ClothCell = (typeof CLOTH)[keyof typeof CLOTH];
export type SmokeKind = 'grill' | 'steam' | 'incense';
/** A small text sign: a vertical light box (words stacked), a street-name plate, a wall notice. */
export type TagStyle = 'box' | 'vertical' | 'plate' | 'banner' | 'paint';

/**
 * A building's local frame (world.ts frame()): lx runs along its front, lz out of it, y up from the ground; `yaw` on
 * the extras turns them from facing out of the front.
 */
export type Frame = {
  facing: number;
  at: (lx: number, lz: number) => { x: number; z: number };
  local: (wx: number, wz: number) => { x: number; z: number };
  part: (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: ColorLike, role?: Role, shadow?: boolean) => void;
  solid: (kind: Kind, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: ColorLike, tilt?: number, shadow?: boolean, yaw?: number, role?: Role) => void;
  decal: (cell: DecalCell, lx: number, ly: number, lz: number, w: number, h: number, opts?: DecalOpts & { yaw?: number }) => void;
  cloth: (cell: ClothCell, lx: number, ly: number, lz: number, w: number, h: number, opts: ClothOpts & { yaw?: number }) => void;
  smoke: (kind: SmokeKind, lx: number, ly: number, lz: number) => void;
  tag: (style: TagStyle, text: string, fg: string, bg: string, lx: number, ly: number, lz: number, w: number, h: number, opts?: { yaw?: number; glow?: number }) => void;
  pool: (lx: number, lz: number, size: number, shop: number) => void;
};

/**
 * What building and downtown dressing draws with (world.ts builds it): instanced primitives, local frames, decals,
 * cloth that waves, smoke, shop light pools and text tags. `fine(true)` routes what follows into the fine layer that
 * lower quality levels hide.
 */
export type Kit = {
  shape: (kind: Kind, color: ColorLike, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw?: number, tilt?: number, shadow?: boolean, role?: Role) => void;
  box: (color: ColorLike, x: number, y: number, z: number, w: number, h: number, d: number, yaw?: number, shadow?: boolean, role?: Role) => void;
  sign: (text: string, subtitle: string, color: string, x: number, y: number, z: number, w: number, h: number, yaw?: number, background?: string) => void;
  /** A text tag (map/signs.ts styles): glows at night when `glow` > 0. */
  tag: (style: TagStyle, text: string, fg: string, bg: string, x: number, y: number, z: number, w: number, h: number, yaw: number, glow?: number) => void;
  /** A quad of the decal atlas centred at (x, y, z), facing `yaw` (tilted back by `pitch`). */
  decal: (cell: DecalCell, x: number, y: number, z: number, w: number, h: number, yaw: number, opts?: DecalOpts) => void;
  /** A piece of cloth: pinned on its left edge (mode 0, a flag) or along its top (mode 1, laundry). */
  cloth: (cell: ClothCell, x: number, y: number, z: number, w: number, h: number, yaw: number, opts: ClothOpts) => void;
  smoke: (kind: SmokeKind, x: number, y: number, z: number) => void;
  /** A pool of shop light on the pavement at night; `shop` is the building id whose opening hours switch it. */
  pool: (x: number, z: number, size: number, shop: number) => void;
  frame: (x: number, z: number, facing: number) => Frame;
  fine: (on: boolean) => void;
};
