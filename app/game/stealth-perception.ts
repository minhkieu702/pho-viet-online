/**
 * Stealth perception (story-system-stealth.md §3): what a guard, a camera or a tail target sees, hears and feels of
 * someone, and the light they stand in. Pure TypeScript with no three.js or DOM: guard-brain.ts integrates it, and
 * stealth.ts (Wave 2) feeds it the world.
 *
 * - Light field: ambient (day/night/rain or an arena's own levels) + static pools and floodlights in a 2 m hash grid
 *   (city lamps, neon door pools, arena lights; groups switch off with a fuse box) + dynamic spots in fixed slots
 *   (guard flashlights, searchlights, headlights, muzzle flashes) tested for line of sight. 0..1.5.
 * - Sight: three samples on the target (head, chest, knee; lower when crouched), each ray height-aware through an
 *   injected RayCaster (map/collision.ts CollisionIndex.cast fits as is: solids with a height range block only where
 *   the ray passes within it, legacy solids are infinitely tall), soft occluders (bamboo, laundry, steam: ×0.35 each,
 *   never a full block) and civilians near the ray (crowd cover ×0.6). Focal and peripheral cones, range shrinking with
 *   darkness, the viewer's own flashlight beam, height above the viewer, stance, motion, crowd blending, water, parked
 *   cars, Ông Tư's jacket, social cover ('Vỏ bọc shipper') by zone and act, and known faces.
 * - Hearing: a noise bus (ring of the last 64 noises) with sound-cover zones and timed windows (the music beat clock),
 *   rain, and walls: ×0.5 per blocking solid crossed at ear height, two at most.
 * - Footstep noise by surface, speed and stance.
 *
 * Hot paths (see, seeBody, rayClear, hearRadius, light.at) allocate nothing; prepare() runs once per frame per target.
 */
import {
  COVER_ACT, COVER_ZONE, NOISE, NOISE_ID, SPEED, SURFACE_NOISE, TUNE as T,
  type Concealment, type CoverKind, type NoiseKind, type Rect, type SoftOccluder, type Stance, type Surface, type ZoneKind, type ZoneSpec,
} from './stealth-types.ts';

/** Height-aware first-hit ray cast: the parameter t (along a unit horizontal direction) where the ray first enters a
 * solid, or maxT. oy/dy give the ray's height and its rise per unit t. CollisionIndex.cast has exactly this shape. */
export interface RayCaster { cast(ox: number, oz: number, dx: number, dz: number, maxT: number, oy?: number, dy?: number): number }

type Typed = Float64Array | Uint8Array | Int32Array;
function grown<A extends Typed>(a: A, n: number): A {
  const b = new (a.constructor as new (n: number) => A)(n);
  b.set(a);
  return b;
}

// ---------------------------------------------------------------------------------------------------------
// Light.
// ---------------------------------------------------------------------------------------------------------

/** Ambient light: outdoors 1 − 0.82·night, dimmed 10% by rain; an arena lerps its own day and night levels. */
export function ambientLight(night: number, rain = 0, arena: { day: number; night: number } | null = null) {
  if (arena) return arena.day + (arena.night - arena.day) * night;
  return (1 - 0.82 * night) * (1 - 0.1 * rain);
}
/** 0 'Trong bóng tối', 1 'Mờ tối', 2 'Bị lộ' (LIGHT_LABEL). */
export const lightBand = (L: number) => (L < 0.28 ? 0 : L < 0.55 ? 1 : 2);

/**
 * A light. Without an angle it is a ground pool of radius r around (x, z) with falloff k·(1 − d/r)², like a lamp
 * head's night pool; with an angle it is a spot from (x, y, z) along yaw/pitch (pitch < 0 looks down) reaching r.
 */
export type LightSpec = { x: number; z: number; y?: number; r: number; k?: number; group?: string; on?: boolean; yaw?: number; pitch?: number; angle?: number };

/** A spot's light at a point: k inside the cone, softened over the outer 30% of the angle, fading to 0 at range. */
export function spotAt(px: number, py: number, pz: number, fx: number, fy: number, fz: number, cosHalf: number, range: number, k: number, x: number, y: number, z: number) {
  const dx = x - px, dy = y - py, dz = z - pz, d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= range * range) return 0;
  if (d2 < 1e-12) return k;
  const d = Math.sqrt(d2), c = (dx * fx + dy * fy + dz * fz) / d;
  if (c <= cosHalf) return 0;
  const q = d / range;
  return k * Math.min(1, (c - cosHalf) / ((1 - cosHalf) * 0.3 + 1e-9)) * (1 - q * q);
}

export type LightField = ReturnType<typeof createLightField>;
/** Static lights in a hash grid of `cell` metres plus 64 dynamic spot slots; caster tests the dynamic spots' LOS. */
export function createLightField(caster: RayCaster | null = null, cell = 2) {
  let cap = 0, n = 0;
  let lx = new Float64Array(0), ly = new Float64Array(0), lz = new Float64Array(0), lr = new Float64Array(0), lk = new Float64Array(0);
  let fx = new Float64Array(0), fy = new Float64Array(0), fz = new Float64Array(0), cosHalf = new Float64Array(0);
  let on = new Uint8Array(0);
  const groups = new Map<string, number[]>();
  const cells = new Map<number, number[]>();
  const key = (ix: number, iz: number) => ((ix & 0xffff) << 16) | (iz & 0xffff);
  const DYN = 64;
  const dx = new Float64Array(DYN), dy = new Float64Array(DYN), dz = new Float64Array(DYN), dfx = new Float64Array(DYN), dfy = new Float64Array(DYN), dfz = new Float64Array(DYN);
  const dcos = new Float64Array(DYN), drange = new Float64Array(DYN), dk = new Float64Array(DYN);
  const dused = new Uint8Array(DYN), don = new Uint8Array(DYN), dlos = new Uint8Array(DYN);
  let dtop = 0;

  function statics(x: number, y: number, z: number) {
    const list = cells.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!list) return 0;
    let L = 0;
    for (let j = 0; j < list.length; j++) {
      const i = list[j];
      if (!on[i]) continue;
      if (cosHalf[i] < -1) {
        const ex = x - lx[i], ez = z - lz[i], d2 = ex * ex + ez * ez, r = lr[i];
        if (d2 < r * r) { const q = 1 - Math.sqrt(d2) / r; L += lk[i] * q * q; }
      } else L += spotAt(lx[i], ly[i], lz[i], fx[i], fy[i], fz[i], cosHalf[i], lr[i], lk[i], x, y, z);
    }
    return L;
  }
  function dynamics(x: number, y: number, z: number) {
    let L = 0;
    for (let s = 0; s < dtop; s++) {
      if (!don[s]) continue;
      const c = spotAt(dx[s], dy[s], dz[s], dfx[s], dfy[s], dfz[s], dcos[s], drange[s], dk[s], x, y, z);
      if (!(c > 0)) continue;
      if (dlos[s] && caster) {
        const ex = x - dx[s], ez = z - dz[s], len = Math.sqrt(ex * ex + ez * ez);
        if (len > 1e-3 && caster.cast(dx[s], dz[s], ex / len, ez / len, len, dy[s], (y - dy[s]) / len) < len - 0.05) continue;
      }
      L += c;
    }
    return L;
  }

  const field = {
    /** Ambient level, set by the host each frame (ambientLight()). */
    ambient: 1,
    get size() { return n; },
    /** Adds a static light; returns its id. */
    add(spec: LightSpec) {
      if (n === cap) {
        cap = Math.max(32, cap * 2);
        lx = grown(lx, cap); ly = grown(ly, cap); lz = grown(lz, cap); lr = grown(lr, cap); lk = grown(lk, cap);
        fx = grown(fx, cap); fy = grown(fy, cap); fz = grown(fz, cap); cosHalf = grown(cosHalf, cap); on = grown(on, cap);
      }
      const i = n++, yaw = spec.yaw ?? 0, pitch = spec.pitch ?? 0;
      lx[i] = spec.x; ly[i] = spec.y ?? 0; lz[i] = spec.z; lr[i] = spec.r; lk[i] = spec.k ?? 1;
      fx[i] = Math.sin(yaw) * Math.cos(pitch); fy[i] = Math.sin(pitch); fz[i] = Math.cos(yaw) * Math.cos(pitch);
      cosHalf[i] = spec.angle == null ? -2 : Math.cos(spec.angle);
      on[i] = spec.on === false ? 0 : 1;
      if (spec.group) { let g = groups.get(spec.group); if (!g) groups.set(spec.group, (g = [])); g.push(i); }
      const r = spec.r;
      for (let iz = Math.floor((spec.z - r) / cell), iz1 = Math.floor((spec.z + r) / cell); iz <= iz1; iz++) {
        for (let ix = Math.floor((spec.x - r) / cell), ix1 = Math.floor((spec.x + r) / cell); ix <= ix1; ix++) {
          const k = key(ix, iz);
          let list = cells.get(k);
          if (!list) cells.set(k, (list = []));
          list.push(i);
        }
      }
      return i;
    },
    setOn(id: number, state: boolean) { if (id >= 0 && id < n) on[id] = state ? 1 : 0; },
    /** Switches a light group (a fuse box); returns how many lights it holds. */
    setGroup(group: string, state: boolean) {
      const g = groups.get(group);
      if (!g) return 0;
      for (let j = 0; j < g.length; j++) on[g[j]] = state ? 1 : 0;
      return g.length;
    },
    groupOn(group: string) { const g = groups.get(group); return !!g && g.length > 0 && on[g[0]] === 1; },
    /** Reserves a dynamic spot slot (-1 when all 64 are taken). */
    alloc() {
      for (let s = 0; s < DYN; s++) if (!dused[s]) { dused[s] = 1; don[s] = 0; if (s >= dtop) dtop = s + 1; return s; }
      return -1;
    },
    release(slot: number) { if (slot >= 0 && slot < DYN) { dused[slot] = 0; don[slot] = 0; } },
    /** Aims dynamic slot `slot` this frame: origin, yaw, pitch (< 0 down), half angle, range, intensity, LOS test. */
    spot(slot: number, x: number, y: number, z: number, yaw: number, pitch: number, half: number, range: number, k = 1, los = true) {
      if (slot < 0 || slot >= DYN) return;
      const cp = Math.cos(pitch);
      dx[slot] = x; dy[slot] = y; dz[slot] = z; dfx[slot] = Math.sin(yaw) * cp; dfy[slot] = Math.sin(pitch); dfz[slot] = Math.cos(yaw) * cp;
      dcos[slot] = Math.cos(half); drange[slot] = range; dk[slot] = k; dlos[slot] = los ? 1 : 0; don[slot] = 1;
    },
    off(slot: number) { if (slot >= 0 && slot < DYN) don[slot] = 0; },
    statics,
    dynamics,
    /** Light level at a point: ambient + statics + dynamic spots, capped at 1.5. */
    at(x: number, y: number, z: number) { return Math.min(1.5, field.ambient + statics(x, y, z) + dynamics(x, y, z)); },
  };
  return field;
}

// ---------------------------------------------------------------------------------------------------------
// Noise bus and sound cover.
// ---------------------------------------------------------------------------------------------------------

export type NoiseBus = ReturnType<typeof createNoiseBus>;
/**
 * The last `cap` noises in a ring, read by sequence number (slot = seq % cap). px/pz is where the noise points (a dog
 * at its target, a guard's shout at the last known position); it equals the source otherwise. Sound cover masks
 * hearing at the listener or the source: zones (karaoke ×0.35, dance floor ×0.25, steam pump ×0.5, barge engine ×0.7)
 * that may pulse (period/duty), and timed windows from the music beat clock (a drum hit, a passing train).
 */
export function createNoiseBus(cap = 64) {
  const x = new Float64Array(cap), y = new Float64Array(cap), z = new Float64Array(cap), r = new Float64Array(cap), t = new Float64Array(cap);
  const px = new Float64Array(cap), pz = new Float64Array(cap), kind = new Uint8Array(cap);
  const source: string[] = new Array<string>(cap).fill('');
  let seq = 0;
  const M = 32;
  const mx0 = new Float64Array(M), mz0 = new Float64Array(M), mx1 = new Float64Array(M), mz1 = new Float64Array(M);
  const mask = new Float64Array(M), period = new Float64Array(M), duty = new Float64Array(M), t0 = new Float64Array(M), t1 = new Float64Array(M);
  const live = new Uint8Array(M);
  function slot(now: number) {
    for (let i = 0; i < M; i++) if (!live[i] || now >= t1[i]) return i;
    return -1;
  }
  function put(i: number, rect: Rect | null, m: number, a: number, b: number, p: number, d: number) {
    if (i < 0) return -1;
    mx0[i] = rect ? rect.minX : -Infinity; mz0[i] = rect ? rect.minZ : -Infinity; mx1[i] = rect ? rect.maxX : Infinity; mz1[i] = rect ? rect.maxZ : Infinity;
    mask[i] = m; t0[i] = a; t1[i] = b; period[i] = p; duty[i] = d; live[i] = 1;
    return i;
  }
  return {
    cap, x, y, z, r, t, px, pz, kind, source,
    /** Sequence number the next noise gets. */
    get seq() { return seq; },
    /** Emits a noise and returns its sequence number. */
    emit(k: NoiseKind, nx: number, nz: number, radius: number, now: number, ny = 0, src = '', ppx = nx, ppz = nz) {
      const i = seq % cap;
      x[i] = nx; y[i] = ny; z[i] = nz; r[i] = radius; t[i] = now; px[i] = ppx; pz[i] = ppz; kind[i] = NOISE_ID[k]; source[i] = src;
      return seq++;
    },
    /** A sound-cover zone (pulsing when period > 0: on for duty·period of every period); returns its slot. */
    zone(rect: Rect, m: number, p = 0, d = 1) { return put(slot(-Infinity), rect, m, -Infinity, Infinity, p, d); },
    /** A timed sound-cover window [from, to) over rect or everywhere (beat clock); expired windows are recycled. */
    window(m: number, from: number, to: number, rect: Rect | null = null) { return put(slot(from), rect, m, from, to, 0, 1); },
    clearMask(i: number) { if (i >= 0 && i < M) live[i] = 0; },
    /** Hearing multiplier at a point and time: the strongest active cover, 1 when none. */
    maskAt(qx: number, qz: number, now: number) {
      let m = 1;
      for (let i = 0; i < M; i++) {
        if (!live[i] || now < t0[i] || now >= t1[i] || mask[i] >= m) continue;
        if (qx < mx0[i] || qx > mx1[i] || qz < mz0[i] || qz > mz1[i]) continue;
        if (period[i] > 0 && ((now % period[i]) + period[i]) % period[i] >= duty[i] * period[i]) continue;
        m = mask[i];
      }
      return m;
    },
    reset() { seq = 0; live.fill(0); },
  };
}

/** Radius of one footfall: crouch-walk 1.5 m, walk 5 m, run 11 m (between 4.2 and 6.8 m/s), climb 4 m, × surface. */
export function stepRadius(speed: number, stance: Stance, surface: Surface = 'concrete', climbing = false) {
  let r: number;
  if (climbing) r = NOISE.climb;
  else if (!(speed >= T.stillSpeed)) return 0;
  else if (stance === 'crouch') r = NOISE.crouch;
  else if (speed <= SPEED.walk) r = NOISE.walk * Math.max(0.5, speed / SPEED.walk);
  else r = NOISE.walk + (NOISE.run - NOISE.walk) * Math.min(1, (speed - SPEED.walk) / (SPEED.run - SPEED.walk));
  return r * SURFACE_NOISE[surface];
}
export type Footsteps = { dist: number };
export const createFootsteps = (): Footsteps => ({ dist: 0 });
/** Advances the stride; returns a footfall's noise radius when a foot lands this frame, else 0. */
export function footstep(fs: Footsteps, dt: number, speed: number, stance: Stance, surface: Surface = 'concrete', climbing = false) {
  if (!(speed >= T.stillSpeed)) { fs.dist = 0; return 0; }
  const stride = stance === 'crouch' ? 0.7 : speed >= T.runSpeed ? 1.7 : 1.15;
  fs.dist += speed * dt;
  if (fs.dist < stride) return 0;
  fs.dist -= stride;
  return stepRadius(speed, stance, surface, climbing);
}

// ---------------------------------------------------------------------------------------------------------
// Viewers, targets, sightings.
// ---------------------------------------------------------------------------------------------------------

export type Viewer = {
  /** Feet position, and where the head looks. */
  x: number; y: number; z: number; yaw: number;
  /** Eye height above the feet (1.62 for a guard; a camera puts its height in y and 0 here). */
  eye: number;
  cosFocal: number; cosPeripheral: number; peripheralGain: number;
  /** Range against a lit target (L ≥ 0.6); 0 takes the day/night default × the arena scale. */
  range: number;
  /** Gain multiplier: cautious ×1.2, seated ×0.7, a camera ×0.6. */
  vision: number;
  /** Own flashlight on, aimed along beamYaw: inside its ±16° within 20 m the range is 20 m and L at least 0.8. */
  beam: boolean; beamYaw: number;
  /** Looks up this tick (search with a flashlight): no penalty for targets well above. */
  lookUp: boolean;
  /** Knows the player's face: ignores social cover within 10 m (4 m with a mask or full-face helmet). */
  knowsFace: boolean;
};
export const createViewer = (): Viewer => ({
  x: 0, y: 0, z: 0, yaw: 0, eye: T.eye, cosFocal: Math.cos(T.focal), cosPeripheral: Math.cos(T.peripheral), peripheralGain: T.peripheralGain,
  range: 0, vision: 1, beam: false, beamYaw: 0, lookUp: false, knowsFace: false,
});
/** Makes v a camera: one cone of fov with no peripheral band, a fixed range, eye at y. */
export function cameraViewer(v: Viewer, fov: number, range: number) {
  v.eye = 0; v.cosFocal = v.cosPeripheral = Math.cos(fov / 2); v.peripheralGain = 1; v.range = range;
  return v;
}

export type Target = {
  x: number; y: number; z: number; yaw: number;
  speed: number; stance: Stance; climbing: boolean;
  concealment: Concealment;
  /** Body exposure: 1, or 0.35 while leaning out from cover. */
  exposure: number;
  cover: CoverKind | null; masked: boolean; jacket: boolean; armed: boolean; carrying: boolean; nearBody: boolean;
  /** Light at the target; prepare() samples the light field into it when lightAuto. */
  light: number; lightAuto: boolean;
  // ---- Derived by prepare(). ----
  /** Stance × motion × crowd × concealment × jacket, far and within 2 m (diving, soft spots). */
  mult: number; multNear: number;
  /** Social cover factor (1 without cover) and whether cover applies. */
  social: number; coverOn: boolean;
  zone: ZoneKind; crowdZone: boolean; crowd: number; moving: boolean;
  h0: number; h1: number; h2: number;
};
export const createTarget = (): Target => ({
  x: 0, y: 0, z: 0, yaw: 0, speed: 0, stance: 'stand', climbing: false, concealment: 'open', exposure: 1,
  cover: null, masked: false, jacket: false, armed: false, carrying: false, nearBody: false, light: 1, lightAuto: true,
  mult: 1, multNear: 1, social: 1, coverOn: false, zone: 'public', crowdZone: false, crowd: 0, moving: false,
  h0: 1.65, h1: 1.2, h2: 0.45,
});

export type Sight = {
  /** Awareness gain per second before the brain's state and difficulty multipliers; 0 when not seen. */
  gain: number;
  /** Visible fraction of the three samples (0..1) and the cone factor (1, 0.35 or 0). */
  f: number; cone: number;
  /** Ground distance, effective range and the light used. */
  d: number; range: number; L: number;
  /** Instant alert (closer than 1.8 m, in front, more than half visible); a bump (within 1.2 m, moving, standing). */
  instant: boolean; bump: boolean;
  /** In the viewer's own flashlight beam. */
  beam: boolean;
};
export const createSight = (): Sight => ({ gain: 0, f: 0, cone: 0, d: 0, range: 0, L: 0, instant: false, bump: false, beam: false });

/** light(L) = 0.15 + 0.85·L^1.2. */
export const lightGain = (L: number) => 0.15 + 0.85 * Math.pow(Math.max(0, Math.min(1.5, L)), 1.2);
/** dist(d) = 1.6 closer than 4 m, else (1 − (d − 4)/(range − 4))^1.3, 0 beyond range. */
export function distGain(d: number, range: number) {
  if (d >= range) return 0;
  if (d < T.closeD || range <= T.closeD) return T.closeGain;
  return Math.pow(1 - (d - T.closeD) / (range - T.closeD), T.distPow);
}
/** Range against a lit target at this night level (day 26 m, night 12 m). */
export const baseRange = (night: number) => T.rangeDay + (T.rangeNight - T.rangeDay) * Math.max(0, Math.min(1, night));
/** Effective range in light L: range × (0.35 + 0.65·min(1, L/0.6)). */
export const effectiveRange = (range: number, L: number) => range * (0.35 + 0.65 * Math.min(1, Math.max(0, L) / 0.6));

/** Segment p + u·d, u in [0, 1], meets the box: entry u, or 2 when it misses. */
function segBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  let a = 0, b = 1;
  if (Math.abs(dx) < 1e-12) { if (ox < x0 || ox > x1) return 2; } else {
    let u = (x0 - ox) / dx, v = (x1 - ox) / dx;
    if (u > v) { const s = u; u = v; v = s; }
    if (u > a) a = u; if (v < b) b = v;
  }
  if (Math.abs(dy) < 1e-12) { if (oy < y0 || oy > y1) return 2; } else {
    let u = (y0 - oy) / dy, v = (y1 - oy) / dy;
    if (u > v) { const s = u; u = v; v = s; }
    if (u > a) a = u; if (v < b) b = v;
  }
  if (Math.abs(dz) < 1e-12) { if (oz < z0 || oz > z1) return 2; } else {
    let u = (z0 - oz) / dz, v = (z1 - oz) / dz;
    if (u > v) { const s = u; u = v; v = s; }
    if (u > a) a = u; if (v < b) b = v;
  }
  return a <= b ? a : 2;
}

const COS_BEAM = Math.cos(T.beamHalf);

export type PerceptionOptions = {
  caster?: RayCaster | null; light?: LightField | null; noise?: NoiseBus | null;
  soft?: readonly SoftOccluder[]; zones?: readonly ZoneSpec[]; defaultZone?: ZoneKind;
  night?: number; rain?: number; rangeScale?: number; detection?: number; noiseScale?: number;
};
export type Perception = ReturnType<typeof createPerception>;

export function createPerception(opts: PerceptionOptions = {}) {
  const caster = opts.caster ?? null, light = opts.light ?? null, noise = opts.noise ?? null;
  const soft: SoftOccluder[] = opts.soft ? opts.soft.slice() : [];
  const zones: ZoneSpec[] = opts.zones ? opts.zones.slice() : [];
  // Civilians (the npcs crowd and street-life roles: vé số sellers, xe ôm, quán cóc sitters), filled by the host.
  let cx: ArrayLike<number> = [], cz: ArrayLike<number> = [], cn = 0;
  // Civilians within 30 m of the current target, gathered by prepare(): the only ones a ray to it can pass.
  let near = new Int32Array(64), nearN = 0;
  const ZONE_RANK: Record<ZoneKind, number> = { public: 0, staff: 1, restricted: 2, hostile: 3 };

  const env = {
    night: opts.night ?? 0, rain: opts.rain ?? 0, rangeScale: opts.rangeScale ?? 1,
    /** Difficulty scales on hearing radii (detection is applied by the brain). */
    noise: opts.noiseScale ?? 1,
    defaultZone: (opts.defaultZone ?? 'public') as ZoneKind,
  };

  /** Transmission of the sight line from (ox, oy, oz) to (tx, ty, tz): 0 when a solid blocks it, else the product of
   * soft occluders (×factor each) and, with crowd, civilians within 0.45 m of the line below their head height (×0.6
   * each; only those gathered by the last prepare(), i.e. around the current target). */
  function rayClear(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, crowd = true) {
    const dx = tx - ox, dy = ty - oy, dz = tz - oz, len = Math.sqrt(dx * dx + dz * dz);
    if (caster && len > 1e-3 && caster.cast(ox, oz, dx / len, dz / len, len, oy, dy / len) < len - 1e-3) return 0;
    let tr = 1;
    for (let i = 0; i < soft.length; i++) {
      const s = soft[i];
      if (segBox(ox, oy, oz, dx, dy, dz, s.minX, s.bottom, s.minZ, s.maxX, s.top, s.maxZ) <= 1) tr *= s.factor ?? T.softOccluder;
    }
    if (crowd && nearN && len > 1e-3) {
      const inv = 1 / (len * len), r2 = T.crowdRayR * T.crowdRayR;
      for (let j = 0; j < nearN; j++) {
        const k = near[j], qx = cx[k] - ox, qz = cz[k] - oz;
        const u = (qx * dx + qz * dz) * inv;
        if (u <= 0.02 || u >= 0.98) continue;
        const ex = qx - u * dx, ez = qz - u * dz;
        if (ex * ex + ez * ez < r2 && oy + u * dy < T.crowdHeight) tr *= T.crowdRayGain;
      }
    }
    return tr;
  }

  function zoneAt(x: number, z: number) {
    let best: ZoneKind | null = null;
    for (let i = 0; i < zones.length; i++) {
      const q = zones[i];
      if (x < q.minX || x > q.maxX || z < q.minZ || z > q.maxZ || q.crowd) continue;
      if (best === null || ZONE_RANK[q.kind] > ZONE_RANK[best]) best = q.kind;
    }
    return best ?? env.defaultZone;
  }
  function crowdZoneAt(x: number, z: number) {
    for (let i = 0; i < zones.length; i++) {
      const q = zones[i];
      if (q.crowd && x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ) return true;
    }
    return false;
  }

  /** Per-frame derivation for one target (the player, a follower): light, motion, crowd, concealment, cover, sample
   * heights. Gathers the civilians a ray to it can meet, so call it before see() for that target. */
  function prepare(tg: Target, coverActive = true) {
    if (tg.lightAuto && light) tg.light = light.at(tg.x, tg.y + 1.1, tg.z);
    const crouch = tg.stance === 'crouch', moving = tg.speed >= T.stillSpeed, running = moving && !crouch && tg.speed >= T.runSpeed;
    tg.moving = moving;
    const motion = tg.climbing ? T.climb : !moving ? T.still : crouch ? T.sneak : running ? T.run : T.walk;
    let count = 0;
    nearN = 0;
    const nr2 = T.crowdNear * T.crowdNear, cr2 = T.crowdR * T.crowdR;
    for (let j = 0; j < cn; j++) {
      const ex = cx[j] - tg.x, ez = cz[j] - tg.z, d2 = ex * ex + ez * ez;
      if (d2 >= nr2) continue;
      if (nearN === near.length) near = grown(near, nearN * 2);
      near[nearN++] = j;
      if (d2 < cr2) count++;
    }
    tg.crowd = count;
    tg.zone = zoneAt(tg.x, tg.z);
    tg.crowdZone = crowdZoneAt(tg.x, tg.z);
    let m = (crouch ? T.crouch : 1) * motion;
    if (!crouch && !running && !tg.climbing && tg.speed <= T.crowdMaxSpeed) m *= tg.crowdZone || count >= 4 ? T.crowdFour : count >= 2 ? T.crowdTwo : 1;
    let m2 = m;
    switch (tg.concealment) {
      case 'spot': m = m2 = 0; break;
      case 'soft': m2 = m * T.softGain; m = 0; break;
      case 'car': if (crouch) m = m2 = m * T.car; break;
      case 'swim': m = m2 = m * T.swim; break;
      case 'float': m = m2 = m * T.float; break;
      case 'dive': m2 = m * T.swim; m = 0; break;
    }
    if (tg.jacket && env.night > 0.5) { m *= T.jacket; m2 *= T.jacket; }
    tg.mult = m; tg.multNear = m2;
    tg.coverOn = coverActive && tg.cover !== null && !tg.armed && !tg.carrying;
    if (tg.coverOn) {
      const act = tg.climbing ? COVER_ACT.climb : crouch ? COVER_ACT.crouch : running ? COVER_ACT.run : COVER_ACT.walk;
      tg.social = Math.min(COVER_ACT.max, COVER_ZONE[tg.zone] * act * (tg.nearBody ? COVER_ACT.nearBody : 1));
    } else tg.social = 1;
    const water = tg.concealment === 'swim' || tg.concealment === 'float' || tg.concealment === 'dive';
    const s = water ? null : crouch ? T.sampleCrouch : T.sampleStand;
    tg.h0 = s ? s[0] : 0.3; tg.h1 = s ? s[1] : 0.15; tg.h2 = s ? s[2] : 0.05;
    return tg;
  }

  /** What viewer v sees of target tg (prepared this frame), written to out. */
  function see(v: Viewer, tg: Target, out: Sight) {
    out.gain = 0; out.f = 0; out.cone = 0; out.instant = false; out.bump = false; out.beam = false; out.range = 0; out.L = tg.light;
    const dx = tg.x - v.x, dz = tg.z - v.z, d = Math.sqrt(dx * dx + dz * dz);
    out.d = d;
    const mult = d < T.diveNear && (tg.concealment === 'dive' || (tg.concealment === 'soft' && d < T.softNear)) ? tg.multNear : tg.mult;
    if (!(mult > 0)) return out;
    out.bump = d < T.bumpR && tg.moving && tg.stance === 'stand' && tg.concealment === 'open';
    if (!(v.vision > 0)) return out;
    const c = d > 1e-6 ? (Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dz) / d : 1;
    const cone = c >= v.cosFocal ? 1 : c >= v.cosPeripheral ? v.peripheralGain : 0;
    out.cone = cone;
    if (!cone) return out;
    let L = tg.light, eff = effectiveRange(v.range > 0 ? v.range : baseRange(env.night) * env.rangeScale, L);
    if (v.beam && d <= T.beamRange && (d < 1e-6 || (Math.sin(v.beamYaw) * dx + Math.cos(v.beamYaw) * dz) / d >= COS_BEAM)) {
      out.beam = true;
      if (L < T.beamLight) L = T.beamLight;
      eff = Math.max(effectiveRange(v.range > 0 ? v.range : baseRange(env.night) * env.rangeScale, L), T.beamRange);
    }
    out.range = eff; out.L = L;
    if (d >= eff) return out;
    const ex = v.x, ey = v.y + v.eye, ez = v.z, ty = tg.y;
    const f = T.sampleWeight[0] * rayClear(ex, ey, ez, tg.x, ty + tg.h0, tg.z)
      + T.sampleWeight[1] * rayClear(ex, ey, ez, tg.x, ty + tg.h1, tg.z)
      + T.sampleWeight[2] * rayClear(ex, ey, ez, tg.x, ty + tg.h2, tg.z);
    out.f = f;
    if (!(f > 0)) return out;
    const lg = d < T.nearLightD ? Math.max(T.nearLight, lightGain(L)) : lightGain(L);
    const height = ty - v.y > T.roofDy && !v.lookUp ? T.roofGain : 1;
    const social = tg.coverOn && !(v.knowsFace && d < (tg.masked ? 4 : 10)) ? tg.social : 1;
    out.gain = T.base * f * cone * lg * distGain(d, eff) * height * mult * social * v.vision * tg.exposure;
    out.instant = d < T.instantD && cone === 1 && f > T.instantF && social >= 1 && tg.exposure >= 1;
    return out;
  }

  /** Body-meter gain per second for a body lying at (x, y, z) in light L: range ×0.7, sampled 0.3 m up (low cover hides
   * it), light and distance as for a living target. */
  function seeBody(v: Viewer, x: number, y: number, z: number, L: number) {
    const dx = x - v.x, dz = z - v.z, d = Math.sqrt(dx * dx + dz * dz);
    const c = d > 1e-6 ? (Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dz) / d : 1;
    const cone = c >= v.cosFocal ? 1 : c >= v.cosPeripheral ? v.peripheralGain : 0;
    if (!cone) return 0;
    const base = (v.range > 0 ? v.range : baseRange(env.night) * env.rangeScale) * T.bodyRange;
    let eff = effectiveRange(base, L);
    if (v.beam && d <= T.beamRange * T.bodyRange && (d < 1e-6 || (Math.sin(v.beamYaw) * dx + Math.cos(v.beamYaw) * dz) / d >= COS_BEAM)) {
      if (L < T.beamLight) L = T.beamLight;
      eff = Math.max(effectiveRange(base, L), T.beamRange * T.bodyRange);
    }
    if (d >= eff) return 0;
    const f = rayClear(v.x, v.y + v.eye, v.z, x, y + T.bodyHeight, z, false);
    if (!(f > 0)) return 0;
    return T.base * f * cone * lightGain(L) * distGain(d, eff) * v.vision;
  }

  /** Solids crossed at height h between two points, counting at most 2 (a hit is re-cast from just inside it). */
  function walls(x0: number, z0: number, x1: number, z1: number, h: number) {
    if (!caster) return 0;
    const dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-3) return 0;
    const ux = dx / len, uz = dz / len;
    let n = 0, s = 0;
    while (n < 2) {
      const left = len - s, hit = caster.cast(x0 + ux * s, z0 + uz * s, ux, uz, left, h, 0);
      if (!(hit < left - 1e-3)) break;
      n++;
      s += hit + 0.05;
      if (s >= len) break;
    }
    return n;
  }

  /** Effective hearing radius for a noise of `radius` from (sx, sy, sz) at a listener (lx, ly, lz) with hearing
   * multiplier `hearing`, at time t: radius × hearing × cover mask × rain × difficulty × 0.5 per wall (≤ 2). Returns
   * it when the listener is inside it, else 0. Walls are tested only for noises already within reach. */
  function hearRadius(lx: number, ly: number, lz: number, hearing: number, sx: number, sy: number, sz: number, radius: number, t: number) {
    let eff = radius * hearing * env.noise * (1 - 0.25 * Math.max(0, Math.min(1, env.rain)));
    if (noise) eff *= Math.min(noise.maskAt(lx, lz, t), noise.maskAt(sx, sz, t));
    const dx = lx - sx, dy = ly - sy, dz = lz - sz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= eff * eff) return 0;
    const w = walls(sx, sz, lx, lz, Math.max(sy, ly) + 1.5);
    if (w) { eff *= w === 1 ? 0.5 : 0.25; if (d2 >= eff * eff) return 0; }
    return eff;
  }

  const sv = createViewer(), st = createTarget(), ss = createSight();
  const perception = {
    env, soft, zones,
    /** Points the crowd at the host's civilian position arrays (n live entries; the arrays are read, never kept copies). */
    setCrowd(xs: ArrayLike<number>, zs: ArrayLike<number>, n: number) { cx = xs; cz = zs; cn = n; },
    rayClear, zoneAt, crowdZoneAt, prepare, see, seeBody, walls, hearRadius,
    lightAt(x: number, y: number, z: number) { return light ? light.at(x, y, z) : ambientLight(env.night, env.rain); },
    /**
     * 0..1 visibility of a target from a viewer (the tail and eavesdrop systems, a vehicle's mirror cone), standing and
     * walking, in light L (sampled when omitted). Calling it re-gathers the crowd for that target.
     */
    visibility(viewer: { x: number; z: number; y?: number; yaw: number; fov?: number; range?: number }, target: { x: number; z: number; y?: number }, L = NaN) {
      sv.x = viewer.x; sv.y = viewer.y ?? 0; sv.z = viewer.z; sv.yaw = viewer.yaw; sv.eye = T.eye; sv.range = viewer.range ?? 0;
      sv.cosFocal = Math.cos(viewer.fov != null ? viewer.fov / 2 : T.focal);
      sv.cosPeripheral = viewer.fov != null ? sv.cosFocal : Math.cos(T.peripheral);
      sv.peripheralGain = viewer.fov != null ? 1 : T.peripheralGain;
      st.x = target.x; st.y = target.y ?? 0; st.z = target.z; st.speed = 1.4; st.stance = 'stand'; st.concealment = 'open';
      st.lightAuto = !(L === L); if (L === L) st.light = L;
      prepare(st, false);
      see(sv, st, ss);
      return Math.min(1, ss.gain / (T.base * T.closeGain));
    },
  };
  return perception;
}
/** Concealment 0..1 for the police "seen" radii (officers and cruisers × (1 − 0.9c), heli × (1 − 0.7c), floor 4 m):
 * hide spots, diving, darkness, parked cars, crowds. Target must be prepared. */
export function policeConcealment(tg: Target) {
  let c = 0;
  switch (tg.concealment) {
    case 'spot': c = 0.97; break;
    case 'soft': c = 0.85; break;
    case 'dive': c = 0.95; break;
    case 'float': c = 0.6; break;
    case 'swim': c = 0.3; break;
    case 'car': c = tg.stance === 'crouch' ? 0.75 : 0.3; break;
  }
  if (tg.light < 0.55) c = Math.max(c, (0.6 * (0.55 - tg.light)) / 0.55 + (tg.stance === 'crouch' ? 0.1 : 0));
  if (tg.crowd >= 2 || tg.crowdZone) c = Math.max(c, 0.35);
  return Math.min(0.97, c);
}
