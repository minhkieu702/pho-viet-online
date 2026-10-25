/**
 * Deterministic random streams keyed by stable ids (design 2, "rng.ts"): a stream for ('D5', 'block', key) gives
 * the same numbers whatever else the layout contains, so editing one district or one block never reshuffles
 * another. Keys are hashed (FNV-1a over their text, then a murmur3 finaliser) into a mulberry32 state. A draw is
 * pure integer arithmetic on a closed-over number: nothing is allocated per draw. The legacy city.ts generator
 * keeps its own global LCG and never calls this.
 */

/** Mixed into every key, so a new world (WORLD_VERSION bump with new content) can reseed everything at once. */
export const WORLD_SEED = 0x5a16_0917;

export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [a, b). */
  range(a: number, b: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  /** Uniform in [-r, r). */
  jitter(r: number): number;
};

/** Numbers as key text: integers exactly, other values rounded to 1 cm so float noise never changes a key. */
const keyText = (p: string | number) => (typeof p === 'string' ? p : Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100));

function fmix(h: number) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 32-bit hash of a key made of parts (('ab', 'c') and ('a', 'bc') differ). */
export function hashKey(...parts: (string | number)[]): number {
  let h = (0x811c9dc5 ^ WORLD_SEED) >>> 0;
  for (const p of parts) {
    const s = keyText(p);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    h = Math.imul(h ^ 0x1f, 0x01000193);
  }
  return fmix(h);
}

/** One value in [0, 1) for a key, with no stream (per-point jitter, coin flips by position). */
export const hash01 = (...parts: (string | number)[]) => hashKey(...parts) / 4294967296;

/** A mulberry32 stream from a 32-bit seed. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    jitter: (r) => (next() * 2 - 1) * r,
  };
}

/** The stream for a key, e.g. stream('D5', 'block', blockKey). */
export const stream = (...parts: (string | number)[]) => seeded(hashKey(...parts));

/** Stable text key of a point, quantised to `q` metres (node and block keys). */
export function pointKey(x: number, z: number, q = 0.5) {
  const k = (v: number) => { const r = Math.round(v / q) * q; return Object.is(r, -0) ? 0 : Math.round(r * 100) / 100; };
  return `${k(x)}:${k(z)}`;
}

/** Hex digest of any JSON-able value (determinism checks, WORLD_VERSION inputs). */
export function digest(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return fmix(a).toString(16).padStart(8, '0') + fmix(b ^ text.length).toString(16).padStart(8, '0');
}
