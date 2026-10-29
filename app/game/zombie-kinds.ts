/**
 * The eleven regular zombie kinds (design.md §6a, A22): their numbers, how each one senses, moves, winds up and
 * strikes, and how it is posed and twitches. zombies.ts keeps the horde (slots, spawning, walking, the net, drawing)
 * and calls the hooks here once per zombie per frame, so a kind's whole behaviour reads in one place.
 *
 * Fairness (§2.4): every attack goes through begin(), which telegraphs it (a `tele` event with its shape and the
 * time to impact, never under TELL_MIN, longer for an attacker the victim cannot see or a remote victim) before
 * resolve() lands it as a `hit`, `proj` or `cloud` event that each victim confirms against itself (zombie-coop.ts).
 * Pure apart from the pose numbers: no three.js objects, no DOM.
 */
import { NO_SLOT, ZF, type AttackId, type ZEvent, type ZombieKind } from '../../lib/zombie-protocol.ts';
import { CHASE_CAP, inViewCone, tellFor, type SpawnHow } from './zombie-director.ts';
import { HAND, type Gait } from './pose.ts';
import type { Twitch } from './zombie-looks.ts';
import type { Prey, Zombie } from './zombies.ts';

export type { SpawnHow } from './zombie-director.ts';

export type KindDef = {
  /** UI name. */
  name: string;
  hp: number; wander: number; chase: number; damage: number; reach: number; windup: number; cooldown: number;
  /** Sight range (m); 0 for the blind hunter, who hears instead. */
  sight: number;
  /** The close attack, its knockback (m/s; 5 and up knocks down) and its cone (full angle, radians). */
  attack: AttackId; kb: number; arc: number;
  /** Head-shot multiplier (3; the brute's thick skull 2). */
  headMul: number;
  /** A second attack: lunges, spit, the bloater's burst, the scream. */
  special?: { attack: AttackId; damage: number; windup: number; cooldown: number; min: number; max: number; r: number; kb: number };
  /** Gait: stride cadence, how much of a run it is (0..1), turn rate. */
  cadence: number; run: number; turn: number;
  /** Hit capsule radius (m at scale 1) and figure size when zombie-looks.ts is not there. */
  radius: number; scale: number; width: number;
  /** A dog's bite holds it for a second (small kinds); big ones only take the bite. */
  holdable: boolean; big: boolean;
  /** First-sighting notification (§4.2). */
  hint: string | null;
  groans: readonly string[];
};

const MOANS = ['Grừ…', 'Ưưư…', 'Grràoo!', 'Hừ… hừ…', 'Ááá…', 'Khhh…'];
export const KINDS: Record<ZombieKind, KindDef> = {
  walker: {
    name: 'Xác sống', hp: 100, wander: 0.55, chase: 1.9, damage: 8, reach: 1.2, windup: 0.4, cooldown: 1.15, sight: 24,
    attack: 'claw', kb: 0, arc: 2.1, headMul: 3, cadence: 2.6, run: 0, turn: 4, radius: 0.38, scale: 0.98, width: 1.05,
    holdable: true, big: false, hint: null, groans: MOANS,
  },
  runner: {
    name: 'Kẻ chạy', hp: 60, wander: 0.9, chase: 4.4, damage: 6, reach: 1.1, windup: 0.25, cooldown: 0.8, sight: 30,
    attack: 'claw', kb: 0, arc: 2.1, headMul: 3, cadence: 3.2, run: 1, turn: 9, radius: 0.34, scale: 0.98, width: 0.78,
    special: { attack: 'lunge', damage: 10, windup: 0.35, cooldown: 3.2, min: 3, max: 6.5, r: 5, kb: 2 },
    holdable: true, big: false, hint: 'Kẻ chạy! Chúng lao tới rất nhanh, coi chừng cú vồ.', groans: ['Hộc… hộc…', 'Kéééc!', 'Grràaa!'],
  },
  brute: {
    name: 'Hộ pháp', hp: 380, wander: 0.5, chase: 1.8, damage: 22, reach: 1.7, windup: 0.6, cooldown: 1.8, sight: 20,
    attack: 'bash', kb: 6, arc: 2.3, headMul: 2, cadence: 2.2, run: 0.3, turn: 3, radius: 0.42, scale: 1.42, width: 1.6,
    holdable: false, big: true, hint: 'Hộ pháp to xác, đòn đánh hất văng · giữ khoảng cách.', groans: ['GRỪỪỪ!', 'Hừmmm…', 'ÔÔÔ!'],
  },
  crawler: {
    name: 'Kẻ bò', hp: 45, wander: 0.4, chase: 2.8, damage: 5, reach: 0.9, windup: 0.3, cooldown: 1.0, sight: 18,
    attack: 'bite', kb: 0, arc: 2.4, headMul: 3, cadence: 4.2, run: 0.6, turn: 7, radius: 0.55, scale: 0.95, width: 0.9,
    holdable: true, big: false, hint: 'Bầy kẻ bò sát đất · khó bắn trúng, cắn chân làm chậm.', groans: ['Kẹt… kẹt…', 'Rrrr…', 'Tặc tặc…'],
  },
  spitter: {
    name: 'Kẻ phun axit', hp: 120, wander: 0.5, chase: 1.6, damage: 6, reach: 1.2, windup: 0.4, cooldown: 1.2, sight: 26,
    attack: 'claw', kb: 0, arc: 2.1, headMul: 3, cadence: 2.4, run: 0, turn: 4, radius: 0.4, scale: 1.0, width: 1.15,
    special: { attack: 'spit', damage: 12, windup: 0.6, cooldown: 4.5, min: 6, max: 18, r: 2.2, kb: 0 },
    holdable: true, big: false, hint: 'Kẻ phun axit! Né vòng tròn xanh trên mặt đường.', groans: ['Ọc… ọc…', 'Khạc!', 'Gừ ọc…'],
  },
  bloater: {
    name: 'Bọng độc', hp: 220, wander: 0.45, chase: 1.3, damage: 8, reach: 1.2, windup: 0.45, cooldown: 1.4, sight: 20,
    attack: 'claw', kb: 0, arc: 2.1, headMul: 3, cadence: 1.9, run: 0, turn: 3, radius: 0.5, scale: 1.12, width: 1.75,
    special: { attack: 'burst', damage: 35, windup: 1.0, cooldown: 99, min: 0, max: 2, r: 4, kb: 4 },
    holdable: false, big: true, hint: 'Bọng độc sắp nổ · bắn từ xa, đừng để nó lại gần!', groans: ['Ộc…', 'Xììì…', 'Bụp… bụp…'],
  },
  riot: {
    name: 'Lính cơ động', hp: 200, wander: 0.55, chase: 2.0, damage: 12, reach: 1.3, windup: 0.45, cooldown: 1.4, sight: 24,
    attack: 'bash', kb: 3, arc: 2.0, headMul: 3, cadence: 2.5, run: 0.1, turn: 4, radius: 0.42, scale: 1.05, width: 1.15,
    holdable: false, big: true, hint: 'Lính cơ động có khiên · bắn vào lưng hoặc vào đầu.', groans: ['…rè… rè…', 'Hừ…', '…tít… rè…'],
  },
  shipper: {
    name: 'Xác shipper', hp: 80, wander: 0.8, chase: 3.4, damage: 7, reach: 1.1, windup: 0.3, cooldown: 1.0, sight: 28,
    attack: 'claw', kb: 0, arc: 2.1, headMul: 3, cadence: 3, run: 0.7, turn: 7, radius: 0.38, scale: 0.98, width: 1.0,
    holdable: true, big: false, hint: 'Shipper đội mũ bảo hiểm · bắn rơi mũ trước.', groans: ['Ting… ting…', 'Đơn… mới…', 'Grừ…'],
  },
  screamer: {
    name: 'Kẻ gào', hp: 90, wander: 0.6, chase: 3.0, damage: 4, reach: 1.1, windup: 0.3, cooldown: 1.0, sight: 32,
    attack: 'claw', kb: 0, arc: 2.0, headMul: 3, cadence: 1.8, run: 0, turn: 5, radius: 0.34, scale: 1.05, width: 0.72,
    special: { attack: 'scream', damage: 0, windup: 1.1, cooldown: 14, min: 0, max: 26, r: 70, kb: 0 },
    holdable: true, big: false, hint: 'Kẻ gào! Hạ nó trước khi nó gọi cả bầy!', groans: ['Hức… hức…', 'Ư… ư…', 'Huhu…'],
  },
  hunter: {
    name: 'Kẻ mù', hp: 160, wander: 0.7, chase: 5.0, damage: 18, reach: 1.3, windup: 0.75, cooldown: 1.2, sight: 0,
    attack: 'lunge', kb: 2, arc: 2.2, headMul: 3, cadence: 3.4, run: 0.8, turn: 8, radius: 0.38, scale: 1.08, width: 0.85,
    special: { attack: 'lunge', damage: 18, windup: 0.75, cooldown: 1.2, min: 0, max: 4, r: 3.5, kb: 2 },
    holdable: true, big: false, hint: 'Kẻ mù săn bằng tiếng động · đi chậm, đừng nổ súng bừa.', groans: ['Tách… tách… tách…', 'Kíííí!', 'Tạch…'],
  },
  stalker: {
    name: 'Bóng cao', hp: 400, wander: 1.0, chase: 3.5, damage: 30, reach: 1.4, windup: 0.5, cooldown: 3.0, sight: 40,
    attack: 'grab', kb: 6, arc: 2.0, headMul: 3, cadence: 1.5, run: 0, turn: 3, radius: 0.36, scale: 1.42, width: 0.68,
    holdable: false, big: true, hint: 'Bóng cao chỉ di chuyển khi không ai nhìn nó · đừng quay lưng!', groans: ['…', 'Hhhhhh…', 'Rắc… rắc…'],
  },
};

/** Every attack a regular kind can make, with its own windup (TELL_MIN applies on top; scripts check it). */
export const KIND_ATTACKS: { kind: ZombieKind; attack: AttackId; windup: number }[] = Object.entries(KINDS).flatMap(([kind, k]) => [
  { kind: kind as ZombieKind, attack: k.attack, windup: k.windup },
  ...(k.special ? [{ kind: kind as ZombieKind, attack: k.special.attack, windup: k.special.windup }] : []),
]);

/** The chase speed after every multiplier (wave/team scaling, night, hurt), never over CHASE_CAP. */
export function chaseSpeed(kind: ZombieKind, speedMul: number, night: number, hurt: boolean) {
  return Math.min(CHASE_CAP, KINDS[kind].chase * speedMul * (1 + 0.2 * Math.max(0, Math.min(1, night))) * (hurt ? 0.75 : 1));
}

/** How far a blind hunter hears a player (§2.4): gunfire 60 m, vehicles 25, a sprint 12, walking 4, quiet 3. */
export function hearRange(p: Prey) {
  if (p.firing) return 60;
  if (p.inVehicle) return 25;
  if (p.sprint) return 12;
  if (p.quiet) return 3;
  return (p.speed ?? 1) > 0.3 ? 4 : 1.5;
}

/** What zombies.ts hands the hooks each frame (one object, mutated). */
export type KindCtx = {
  time: number; dt: number;
  /** Players in the room (scales the screamer's call). */
  players: number;
  prey: readonly Prey[];
  random(): number;
  sight(x1: number, z1: number, x2: number, z2: number): boolean;
  clear(x: number, z: number, r: number): boolean;
  /** Any player sees it now (the stalker). */
  seen(z: Zombie): boolean;
  netId(z: Zombie): number;
  emit(e: ZEvent): void;
  summon(kind: ZombieKind, x: number, z: number, count: number, how: SpawnHow): void;
  hear(x: number, z: number, r: number): void;
  say(z: Zombie, text: string): void;
  /** It dies on its own (the bloater bursting): no one gets the kill. */
  expire(z: Zombie): void;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The slot bit (or the dog bit) of a prey for event `to` masks. */
export const preyBit = (p: Prey) => (p.slot === undefined || p.slot < 0 || p.slot > 7 ? 1 : 1 << (p.slot + (p.dog ? 8 : 0)));
/** The net's target code: slot (NO_SLOT none) + 16 for that slot's dog. */
export const preyCode = (p: Prey | null) => (!p || p.slot === undefined ? NO_SLOT : (p.slot & 15) + (p.dog ? 16 : 0));
export const targetOf = (z: Zombie, c: KindCtx) => (z.prey >= 0 && z.prey < c.prey.length ? c.prey[z.prey] : null);
const reachFor = (z: Zombie, p: Prey) => (p.inVehicle ? p.reach + 0.45 : KINDS[z.kind].reach);
/** Every prey within r of (x, z), as a `to` mask (with a generous margin: the victims decide). */
function maskNear(c: KindCtx, x: number, z: number, r: number) {
  let m = 0;
  for (const p of c.prey) if (!p.down && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) m |= preyBit(p);
  return m;
}
const SUB_BITS = ZF.SUB0 | ZF.SUB1;
/** SUB0/SUB1 flags: 0 the close attack, 1 a lunge, 2 spit or scream, 3 the bloater's burst. */
const subOf = (a: AttackId) => (a === 'lunge' ? 1 : a === 'spit' || a === 'scream' ? 2 : a === 'burst' ? 3 : 0);
export const subFlags = (a: AttackId) => { const s = subOf(a); return (s & 1 ? ZF.SUB0 : 0) | (s & 2 ? ZF.SUB1 : 0); };
/** The attack a puppet is winding up, from its flags (when its tele was missed). */
export function attackFromFlags(kind: ZombieKind, flags: number): AttackId {
  const s = (flags & ZF.SUB0 ? 1 : 0) + (flags & ZF.SUB1 ? 2 : 0);
  const k = KINDS[kind];
  return s === 0 ? k.attack : s === 1 ? 'lunge' : s === 3 ? 'burst' : k.special?.attack === 'scream' ? 'scream' : 'spit';
}

/**
 * Starts an attack: the windup (never shorter than TELL_MIN; ≥ 0.5 s when the victim cannot see the attacker; plus a
 * latency allowance for a remote victim) and its `tele` event.
 */
export function begin(z: Zombie, c: KindCtx, attack: AttackId, windup: number, p: Prey | null, shape: { r: number; arc: number; tx?: number; tz?: number }) {
  const offscreen = !!p && p.camYaw !== undefined && !inViewCone(p.x, p.z, p.camYaw, z.x, z.z, 90);
  const t = tellFor(attack, windup, { offscreen, remote: !!p && !p.local && p.slot !== undefined, rtt: p?.rtt });
  z.attack = attack;
  z.windStart = c.time;
  z.windup = c.time + t;
  z.flags = (z.flags & ~SUB_BITS) | ZF.ACT | subFlags(attack) | (attack === 'spit' || attack === 'burst' || attack === 'scream' ? ZF.GLOW : 0);
  if (p) { z.aimX = shape.tx ?? p.x; z.aimZ = shape.tz ?? p.z; }
  c.emit({
    k: 'tele', w: c.netId(z), a: attack, x: r2(z.x), z: r2(z.z), yaw: r3(z.yaw), r: r2(shape.r), arc: r3(shape.arc), t: r2(t),
    ...(p ? { to: preyBit(p) } : {}), ...(shape.tx !== undefined ? { tx: r2(shape.tx), tz: r2(shape.tz ?? 0) } : {}),
  });
}
/** Ends a windup without its blow (interrupted, the stalker seen, a dog's bite). */
export function cancel(z: Zombie) {
  z.windup = 0;
  z.attack = null;
  z.flags &= ~(ZF.ACT | ZF.GLOW | SUB_BITS);
}

/** A close blow: a cone in front of it, every prey near enough named in `to`. */
function strike(z: Zombie, c: KindCtx, a: AttackId, damage: number, reach: number, arc: number, kb: number) {
  c.emit({
    k: 'hit', w: c.netId(z), a, x: r2(z.x), z: r2(z.z), yaw: r3(z.yaw), r: r2(reach), arc: r3(arc),
    dmg: r2(damage * z.damageMul), kb, to: maskNear(c, z.x, z.z, reach + 2),
  });
}

/** The bloater's burst (also when it is killed, after BURST_FUSE): a falloff blast and a toxic cloud. */
export function burst(z: Zombie, c: KindCtx) { burstAt(c.netId(z), z.x, z.z, z.damageMul, c.emit); }
export function burstAt(w: number, x: number, z: number, damageMul: number, emit: (e: ZEvent) => void) {
  const s = KINDS.bloater.special!;
  emit({ k: 'hit', w, a: 'burst', x: r2(x), z: r2(z), yaw: 0, r: s.r, arc: 6.283, dmg: r2(s.damage * damageMul), kb: s.kb, to: 0xffff });
  emit({ k: 'cloud', x: r2(x), z: r2(z), r: 5, s: 6, dps: 7 });
}
/** A bloater shot dead swells for this long before it bursts (its tell: the ring and the hiss), never at once. */
export const BURST_FUSE = 0.6;

let projectiles = 0;
/** Lands the windup that just ran out. */
function resolve(z: Zombie, c: KindCtx, p: Prey | null) {
  const a = z.attack ?? KINDS[z.kind].attack, k = KINDS[z.kind], t = c.time;
  cancel(z);
  if (a === 'lunge') {
    // Airborne: straight at where the prey was when it crouched, at most the kind's leap.
    const s = k.special!, dx = z.aimX - z.x, dz = z.aimZ - z.z, d = Math.hypot(dx, dz) || 1, go = Math.min(s.r, d + 0.6);
    z.aimX = z.x + (dx / d) * go; z.aimZ = z.z + (dz / d) * go;
    z.yaw = Math.atan2(dx, dz);
    z.state = 'lunge';
    z.attack = 'lunge';
    z.timer = t + (z.kind === 'runner' ? 0.35 : 0.3);
    z.windStart = t;
    z.flags |= ZF.ACT | ZF.SUB0;
    return;
  }
  if (a === 'spit' && p) {
    // A lob of acid at where the prey will be, under gravity 14 m/s²; every client flies it the same way.
    const s = k.special!, y0 = 1.7;
    const lead = 0.6, tx = p.x + (p.vx ?? 0) * lead, tz = p.z + (p.vz ?? 0) * lead;
    const dx = tx - z.x, dz = tz - z.z, d = Math.hypot(dx, dz), T = Math.max(0.55, Math.min(1.4, d / 13));
    c.emit({
      k: 'proj', id: (projectiles = (projectiles + 1) & 0xffff), w: c.netId(z), a: 'spit', x: r2(z.x), y: r2(y0), z: r2(z.z),
      vx: r2(dx / T), vy: r2((0.4 - y0 + 0.5 * 14 * T * T) / T), vz: r2(dz / T), r: s.r, dmg: r2(s.damage * z.damageMul),
    });
    z.attackAt = t + 0.6;
    z.cool = t + s.cooldown;
    return;
  }
  if (a === 'burst') { burst(z, c); c.expire(z); return; }
  if (a === 'scream') {
    // The whole street hears it; the dead rise around the screamer (never close to a player: the caller checks).
    c.emit({ k: 'scream', w: c.netId(z), x: r2(z.x), z: r2(z.z), r: 70 });
    c.hear(z.x, z.z, 70);
    const count = 4 + 2 * Math.max(1, c.players);
    const runners = Math.round(count * 0.3);
    c.summon('runner', z.x, z.z, runners, 'rise');
    c.summon('walker', z.x, z.z, count - runners, 'rise');
    z.cool = t + k.special!.cooldown;
    z.attackAt = t + 1;
    return;
  }
  strike(z, c, a, k.damage, k.reach + 0.35, k.arc, k.kb);
  z.attackAt = t + k.cooldown;
  if (z.kind === 'stalker') z.cool = t + k.cooldown;
}

/** A lunge in flight: lands on the aim point and bites whoever is there. */
function fly(z: Zombie, c: KindCtx) {
  const k = KINDS[z.kind], s = k.special!, t = c.time;
  const total = z.timer - z.windStart, left = Math.max(0, z.timer - t);
  const dx = z.aimX - z.x, dz = z.aimZ - z.z, d = Math.hypot(dx, dz);
  const step = left > 1e-3 ? Math.min(d, (d / left) * c.dt) : d;
  if (d > 1e-3) {
    const nx = z.x + (dx / d) * step, nz = z.z + (dz / d) * step;
    if (c.clear(nx, nz, 0.3)) { z.x = nx; z.z = nz; } else z.timer = t;
  }
  z.y = Math.sin(Math.PI * Math.min(1, 1 - left / Math.max(1e-3, total))) * (z.kind === 'runner' ? 0.7 : 0.45);
  z.pace = total > 0 ? s.r / total : 0;
  if (t < z.timer) return;
  z.y = 0;
  z.state = 'stagger';
  z.timer = t + 0.55;
  cancel(z);
  strike(z, c, 'lunge', s.damage, k.reach + 0.4, 2.6, s.kb);
  z.attackAt = t + k.cooldown;
  z.cool = t + s.cooldown;
}

const out = { x: 0, z: 0, speed: 0 };

/**
 * The kind's own decisions this frame, after think(): windups running out, lunges in the air, the stalker frozen in
 * view, ranged and special attacks, and the close attack when the prey is in reach. True: it stays where it is.
 */
export function act(z: Zombie, c: KindCtx): boolean {
  const k = KINDS[z.kind], t = c.time, p = targetOf(z, c);
  const d = p ? Math.hypot(p.x - z.x, p.z - z.z) : Infinity;
  if (z.state === 'lunge') { fly(z, c); return true; }
  if (z.kind === 'stalker') {
    // Moves only while nobody sees it, and stays put for half a second after the last look (A25).
    if (c.seen(z)) {
      if (z.state !== 'frozen') { z.state = 'frozen'; z.freeze = Math.floor(c.random() * 4); }
      z.seenAt = t;
      if (z.windup) cancel(z);
      z.pace = 0;
      return true;
    }
    if (t - z.seenAt < 0.5) { z.pace = 0; return true; }
    if (z.state === 'frozen') z.state = p ? 'chase' : 'wander';
  }
  if (z.windup) {
    if (p && z.attack !== 'burst' && z.attack !== 'scream') {
      const face = Math.atan2(p.x - z.x, p.z - z.z);
      z.yaw += wrapA(face - z.yaw) * Math.min(1, c.dt * (z.attack === 'lunge' ? 4 : 10));
    }
    z.pace = 0;
    if (t >= z.windup) resolve(z, c, p);
    return true;
  }
  if (z.state !== 'chase' || !p || p.down) return false;
  const s = k.special;
  switch (z.kind) {
    case 'runner':
      if (s && d > s.min && d < s.max && t >= z.cool && t >= z.attackAt && c.sight(z.x, z.z, p.x, p.z)) {
        begin(z, c, 'lunge', s.windup, p, { r: s.r, arc: 0.6, tx: p.x, tz: p.z });
        return true;
      }
      break;
    case 'hunter':
      // Locks on with a shriek (0.4 s still), then a crouch and a leap whenever it is close.
      if (t < z.cool) { z.pace = 0; return true; }
      if (s && d < s.max && t >= z.attackAt) { begin(z, c, 'lunge', s.windup, p, { r: s.r, arc: 0.6, tx: p.x, tz: p.z }); return true; }
      return false;
    case 'spitter':
      if (s && d >= s.min && d <= s.max && t >= z.cool && t >= z.attackAt && c.sight(z.x, z.z, p.x, p.z)) {
        const lead = 0.6;
        begin(z, c, 'spit', s.windup, p, { r: s.r, arc: 0, tx: r2(p.x + (p.vx ?? 0) * lead), tz: r2(p.z + (p.vz ?? 0) * lead) });
        return true;
      }
      break;
    case 'screamer':
      if (s && d <= s.max && t >= z.cool && t - z.lastSeen < 1) { begin(z, c, 'scream', s.windup, null, { r: 70, arc: 6.283 }); return true; }
      break;
    case 'bloater':
      if (s && d < s.max) { begin(z, c, 'burst', s.windup, p, { r: s.r, arc: 6.283 }); return true; }
      break;
    case 'stalker':
      if (t - z.seenAt < 2) return false;
      break;
  }
  // Whatever is in reach gets the blow, not only the prey it chases (a dog between it and its target).
  let reach = reachFor(z, p), target = p, dist = d;
  if (d >= reach) for (let i = 0; i < c.prey.length; i++) {
    const q = c.prey[i];
    if (q === p || q.down || q.away) continue;
    const dq = Math.hypot(q.x - z.x, q.z - z.z), rq = reachFor(z, q);
    if (dq < rq && dq - rq < dist - reach) { target = q; dist = dq; reach = rq; z.prey = i; }
  }
  if (dist < reach && t >= z.attackAt) {
    begin(z, c, k.attack, k.windup, target, { r: k.reach + 0.35, arc: k.arc });
    return true;
  }
  if (dist < reach * 0.85) { z.pace = 0; return true; }
  return false;
}

/**
 * Where it walks and how fast when act() let it: the zig-zag of a runner, a spitter or screamer keeping its distance,
 * a crawler's stop-start scuttle, a hunter creeping to a sound. (tx, tz) is the plain target (the prey, a waypoint or
 * the goal). Returns a shared object.
 */
export function steer(z: Zombie, c: KindCtx, tx: number, tz: number, hunting: boolean, chase: number) {
  const k = KINDS[z.kind], t = c.time, p = targetOf(z, c);
  out.x = tx; out.z = tz; out.speed = hunting ? chase : k.wander;
  const d = p ? Math.hypot(p.x - z.x, p.z - z.z) : Infinity;
  const chasing = z.state === 'chase' && !!p && !p.down;
  switch (z.kind) {
    case 'runner':
    case 'shipper':
      if (chasing && d > 3 && !z.waypoints.length) {
        // Zig-zag across the line to the prey.
        const side = Math.sin(t * (z.kind === 'runner' ? 2.6 : 1.7) + z.index * 1.9) * Math.min(1.6, d * 0.25);
        out.x += Math.cos(z.yaw) * side; out.z -= Math.sin(z.yaw) * side;
      }
      break;
    case 'crawler':
      // Bursts of about 3 m, each after a 0.4-0.9 s freeze (cool: the freeze ends, burstAt: the burst ends).
      if (t >= z.burstAt) {
        const pause = 0.4 + c.random() * 0.5;
        z.cool = t + pause;
        z.burstAt = z.cool + 3 / Math.max(0.5, out.speed);
      }
      if (t < z.cool) out.speed = 0;
      break;
    case 'spitter':
    case 'screamer': {
      if (!chasing || z.waypoints.length) break;
      const lo = z.kind === 'spitter' ? 6 : 12, hi = z.kind === 'spitter' ? 15 : 20;
      if (d < lo) { out.x = z.x + ((z.x - p!.x) / (d || 1)) * 4; out.z = z.z + ((z.z - p!.z) / (d || 1)) * 4; out.speed = Math.max(k.wander * 1.8, chase * 0.7); }
      else if (d <= hi && c.sight(z.x, z.z, p!.x, p!.z)) {
        // In range: drift sideways, facing the prey.
        const side = Math.sin(t * 0.7 + z.index) * 2;
        out.x = z.x + Math.cos(z.yaw) * side; out.z = z.z - Math.sin(z.yaw) * side; out.speed = k.wander;
      }
      break;
    }
    case 'hunter':
      if (!hunting && t - z.heardAt < 8) { out.x = z.heardX; out.z = z.heardZ; out.speed = k.wander; }
      else if (!hunting) out.speed = k.wander * 0.6;
      break;
    case 'stalker':
      out.speed = hunting ? chase : k.wander;
      break;
  }
  return out;
}

/** A zombie has just found its prey (think()): the hunter's lock-on shriek holds it still for 0.4 s. */
export function acquired(z: Zombie, c: KindCtx) {
  z.alert = 1;
  if (z.kind === 'hunter') { z.cool = c.time + 0.4; c.say(z, 'Kíííí!'); }
}

/** How a kind senses prey p at distance d (think()): sight, or a blind hunter's hearing. */
export function senses(z: Zombie, p: Prey, d: number, night: number, lineOfSight: () => boolean) {
  if (z.kind === 'hunter') return d < hearRange(p) || (d < 2.2);
  // The stalker always knows where you are: it only waits for you to look away.
  if (z.kind === 'stalker') return d < 70;
  const sight = KINDS[z.kind].sight * (1 - night * 0.3);
  return d < 5 || (d < sight && lineOfSight());
}

/** A hit this hard (or a head shot) breaks a screamer's scream; a big one interrupts most windups. */
export function interrupts(z: Zombie, amount: number, head: boolean) {
  if (!z.windup) return false;
  if (z.attack === 'scream') return amount >= 30 || head;
  if (z.attack === 'burst') return false;
  return amount >= (KINDS[z.kind].big ? 60 : 25);
}

export type Zone = 'head' | 'body' | 'limb';
/**
 * The kind's zone and armour rules for `base` damage (§1.5): head shots (×3, the brute ×2), the shipper's helmet (the
 * first head hit only knocks it off, ×1.2), the riot shield (bullets from within ±60° of its facing ×0.25 until it has
 * absorbed 150), explosives and vehicles in full. Mutates the zombie's armour state.
 */
export function zoneDamage(z: Zombie, base: number, zone: Zone, kind: string, from: { x: number; z: number } | null | undefined) {
  const k = KINDS[z.kind];
  if (zone === 'head') {
    if (z.kind === 'shipper' && z.helmet) { z.helmet = false; z.flags |= ZF.BARE; return base * 1.2; }
    return base * k.headMul;
  }
  let d = base * (zone === 'limb' ? 0.75 : 1);
  if (z.kind === 'riot' && z.shield > 0 && from && (kind === 'bullet' || kind === 'pellet' || kind === 'melee' || kind === 'bite')) {
    const a = wrapA(Math.atan2(from.x - z.x, from.z - z.z) - z.yaw);
    if (Math.abs(a) < Math.PI / 3) {
      const absorbed = d * 0.75;
      z.shield -= absorbed;
      if (z.shield <= 0) { z.shield = 0; z.flags |= ZF.BROKEN; }
      d -= absorbed;
    }
  }
  return d;
}

// ---- animation ------------------------------------------------------------------------------------------------

/** One frame's pose of a zombie (written by pose()). Arms: [swing, abduct, roll, elbow, twist, flex, hand]. */
export type PoseOut = {
  pitch: number; tilt: number; headYaw: number; headPitch: number; twist: number;
  armL: number[]; armR: number[];
  /** [thigh, knee, ankle, toe, abduct] per leg. */
  legL: number[]; legR: number[];
  /** Hips lowered by this much (figure units): crouches, the crawler on all fours. */
  sink: number;
  /** Body scale: the bloater's pulse and its swelling before it bursts. */
  swell: number;
  mouth: boolean;
  /** Skirt/hair swing (hair forward over the screamer's face). */
  hair: number;
};
export const newPose = (): PoseOut => ({ pitch: 0, tilt: 0, headYaw: 0, headPitch: 0, twist: 0, armL: [0, 0, 0, 0, 0, 0, 0], armR: [0, 0, 0, 0, 0, 0, 0], legL: [0, 0, 0, 0, 0], legR: [0, 0, 0, 0, 0], sink: 0, swell: 1, mouth: false, hair: 0 });
const setArm = (a: number[], swing: number, abduct: number, roll: number, elbow: number, tw: number, flex: number, hand: number) => {
  a[0] = swing; a[1] = abduct; a[2] = roll; a[3] = elbow; a[4] = tw; a[5] = flex; a[6] = hand;
};
const setLeg = (l: number[], thigh: number, knee: number, ankle: number, toe: number, abduct = 0) => { l[0] = thigh; l[1] = knee; l[2] = ankle; l[3] = toe; l[4] = abduct; };
/** The four eerie poses a stalker freezes in: arms raised, head turned 90°, arms to the knees, pointing at you. */
const STALKER_FREEZE = [
  { l: [-2.8, 0.3, 0, -0.2, 0.4, 0, HAND.CLAW], r: [-2.6, 0.2, 0, -0.5, 0.4, 0, HAND.CLAW], head: 0, tilt: 0.1 },
  { l: [0.05, 0.08, 0, -0.05, 0.2, 0.3, HAND.CLAW], r: [0.05, 0.08, 0, -0.05, 0.2, 0.3, HAND.CLAW], head: 1.5, tilt: 0.45 },
  { l: [-0.35, 0.05, 0, -0.1, 0.9, 0.5, HAND.CLAW], r: [-0.35, 0.05, 0, -0.1, 0.9, 0.5, HAND.CLAW], head: 0, tilt: -0.3 },
  { l: [0.1, 0.1, 0, -0.1, 0.2, 0.3, HAND.RELAXED], r: [-1.55, 0, 0, -0.02, 0, 0, HAND.POINT], head: 0, tilt: 0.25 },
];

export type PoseIn = {
  time: number; g: Gait; go: number; chasing: boolean;
  /** Turn of the head toward the prey (radians, relative to the body), 0 when none. */
  toward: number;
  /** Windup progress 0..1 (or the lunge's flight). */
  prog: number;
  /** The zombie's lean (its spawn's resting hunch). */
  lean: number;
  tw: Twitch;
};

/**
 * The pose of one zombie this frame: a kind's gait (walker drag-limp, runner sprint, brute roll, crawler scuttle on
 * all fours, spitter neck bob, bloater waddle, riot march behind the shield, shipper's bouncing run, screamer drift,
 * hunter creep, stalker's long strides) with its tells on top (a tell always overrides a twitch), then the twitches.
 */
export function pose(z: Zombie, i: PoseIn, o: PoseOut): PoseOut {
  const { g, go, time, chasing, prog } = i, k = z.kind, tw = i.tw;
  const swing = Math.sin(z.stride);
  o.pitch = i.lean; o.tilt = z.tilt + swing * 0.07 * Math.min(1, z.pace); o.headYaw = i.toward; o.twist = g.chest * 0.5;
  o.headPitch = chasing ? 0.05 - i.lean * 0.9 : 0.3 + 0.08 * Math.sin(time * 0.7 + z.index);
  o.sink = 0; o.swell = 1; o.mouth = Math.sin(time * 2.3 + z.index * 1.7) > 0.55; o.hair = Math.abs(g.thighL) + 0.1 * go;
  setLeg(o.legL, g.thighL, g.kneeL, g.ankleL, g.toeL);
  setLeg(o.legR, g.thighR, g.kneeR, g.ankleR, g.toeR);
  // A limp: one leg (the same one for each zombie) drags behind, toes scraping (walkers, spitters, shippers, screamers).
  const limp = k === 'walker' || k === 'spitter' || k === 'bloater' || k === 'screamer';
  if (limp) {
    const leg = z.index % 2 ? o.legL : o.legR;
    leg[0] = leg[0] * 0.55 + 0.08; leg[1] = leg[1] * 0.25 + 0.03; leg[2] += 0.45; leg[3] = 0;
  }
  // Default arms: the classic reach with prey, dangling forearms when wandering.
  if (chasing) {
    setArm(o.armL, -1.45 + Math.sin(time * 2.1 + z.index) * 0.14, 0.12, 0, -0.25, 0.9, -0.5 + Math.sin(time * 3.1 + z.index) * 0.15, HAND.CLAW);
    setArm(o.armR, -1.35 + Math.cos(time * 1.9 + z.index) * 0.14, 0.12, 0, -0.25, 0.9, -0.5 + Math.cos(time * 2.7 + z.index) * 0.15, HAND.CLAW);
  } else {
    setArm(o.armL, -0.75 + g.armL * 0.3 + Math.sin(time * 2.1 + z.index) * 0.14, 0.1, 0, -0.85, 1.1, 0.95, HAND.RELAXED);
    setArm(o.armR, -0.65 + g.armR * 0.3 + Math.cos(time * 1.9 + z.index) * 0.14, 0.1, 0, -0.85, 1.1, 0.95, HAND.RELAXED);
  }
  switch (k) {
    case 'runner':
      setArm(o.armL, -0.35 + g.armL * 1.3, 0.3, 0, -1.3, 0.5, -0.3, HAND.CLAW);
      setArm(o.armR, -0.35 + g.armR * 1.3, 0.3, 0, -1.3, 0.5, -0.3, HAND.CLAW);
      o.twist = g.chest;
      if (chasing) o.headYaw += Math.sin(time * 62.8) * 0.06;
      break;
    case 'shipper':
      setArm(o.armL, -0.5 + g.armL * 1.2, 0.35, 0, -1.0, 0.6, 0, HAND.CLAW);
      setArm(o.armR, -0.3 + g.armR * 1.0, 0.45, 0, -0.6, 0.4, 0.2, HAND.RELAXED);
      o.headYaw += Math.sin(time * 9 + z.index) * 0.12;
      break;
    case 'brute':
      setArm(o.armL, 0.1 + swing * 0.35, 0.35, 0, -0.6, 0, 0, HAND.FIST);
      setArm(o.armR, 0.1 - swing * 0.35, 0.35, 0, -0.6, 0, 0, HAND.FIST);
      o.tilt += swing * 0.08;
      break;
    case 'crawler': {
      // On all fours, the torso almost flat, legs folded under, the head up staring; diagonal pairs scuttle.
      const s = Math.sin(z.stride * 2), cs = Math.cos(z.stride * 2);
      o.pitch = 1.35; o.headPitch = -1.15; o.sink = 0.62; o.twist = s * 0.12 * go;
      setArm(o.armL, 0.45 + s * 0.4 * go, 0.35, 0, -0.35 - Math.max(0, cs) * 0.5 * go, 0.4, -0.6, HAND.CLAW);
      setArm(o.armR, 0.45 - s * 0.4 * go, 0.35, 0, -0.35 - Math.max(0, -cs) * 0.5 * go, 0.4, -0.6, HAND.CLAW);
      setLeg(o.legL, -1.9 - s * 0.25 * go, 2.3, 0.6, 0, 0.35);
      setLeg(o.legR, -1.9 + s * 0.25 * go, 2.3, 0.6, 0, 0.35);
      break;
    }
    case 'spitter':
      o.headPitch += Math.sin(z.stride * 2 + time) * 0.25;
      o.mouth = true;
      break;
    case 'bloater': {
      o.tilt = swing * 0.14; o.swell = 1 + Math.sin(time * 3 + z.index) * 0.03;
      o.legL[4] = 0.2; o.legR[4] = 0.2;
      setArm(o.armL, -0.55 + Math.sin(time * 1.7) * 0.1, 0.55, 0, -0.9, 0.6, 0.3, HAND.RELAXED);
      setArm(o.armR, -0.5 + Math.cos(time * 1.5) * 0.1, 0.55, 0, -0.9, 0.6, 0.3, HAND.RELAXED);
      break;
    }
    case 'riot':
      // Marching in step, the shield up in front (left arm), the baton cocked (right arm).
      o.legL[1] *= 0.6; o.legR[1] *= 0.6;
      setArm(o.armL, -1.25, -0.05, 0.3, -1.55, 0.4, 0, HAND.FIST);
      setArm(o.armR, -0.45 + g.armR * 0.2, 0.25, 0, -1.7, 0, 0, HAND.FIST);
      o.headPitch = chasing ? -0.05 : 0.15;
      break;
    case 'screamer':
      // A drift on short steps, long hair hanging over the face, arms hanging limp.
      o.legL[0] *= 0.5; o.legR[0] *= 0.5;
      setArm(o.armL, 0.05 + Math.sin(time * 0.9) * 0.05, 0.12, 0, -0.1, 0.3, 0.6, HAND.RELAXED);
      setArm(o.armR, 0.05 + Math.cos(time * 0.8) * 0.05, 0.12, 0, -0.1, 0.3, 0.6, HAND.RELAXED);
      o.headPitch = 0.45; o.hair = -0.7;
      o.mouth = false;
      break;
    case 'hunter': {
      // A crouched creep, head tilting toward every sound; once it has you, on all fours.
      o.pitch = chasing ? 1.05 : 0.65; o.sink = chasing ? 0.32 : 0.16;
      o.legL[0] -= 0.5; o.legR[0] -= 0.5; o.legL[1] += 0.9; o.legR[1] += 0.9; o.legL[2] -= 0.3; o.legR[2] -= 0.3;
      if (chasing) {
        setArm(o.armL, 0.05 + g.armL * 1.2, 0.3, 0, -0.4, 0.4, -0.5, HAND.CLAW);
        setArm(o.armR, 0.05 + g.armR * 1.2, 0.3, 0, -0.4, 0.4, -0.5, HAND.CLAW);
        o.headPitch = -0.9;
      } else {
        setArm(o.armL, -0.4, 0.2, 0, -1.2, 0.8, 0.4, HAND.CLAW);
        setArm(o.armR, -0.3, 0.2, 0, -1.3, 0.8, 0.4, HAND.CLAW);
        o.tilt += 0.35 * Math.sin(time * 0.6 + z.index);
      }
      break;
    }
    case 'stalker':
      setArm(o.armL, 0.05 + g.armL * 0.15, 0.08, 0, -0.05, 0.2, 0.3, HAND.CLAW);
      setArm(o.armR, 0.05 + g.armR * 0.15, 0.08, 0, -0.05, 0.2, 0.3, HAND.CLAW);
      o.tilt = 0.3; o.headPitch = 0.1;
      if (z.state === 'frozen') {
        const f = STALKER_FREEZE[z.freeze & 3];
        setArm(o.armL, f.l[0], f.l[1], f.l[2], f.l[3], f.l[4], f.l[5], f.l[6]);
        setArm(o.armR, f.r[0], f.r[1], f.r[2], f.r[3], f.r[4], f.r[5], f.r[6]);
        o.tilt = f.tilt;
        // Only the head moves: it turns to follow you.
        o.headYaw = f.head ? f.head : i.toward;
        o.legL[0] = -0.35; o.legR[0] = 0.3; o.legL[1] = 0.2; o.legR[1] = 0.05;
      }
      break;
  }
  // Twitches (never over a tell or the stalker's freeze).
  const telling = !!z.attack;
  if (!telling && z.state !== 'frozen') {
    o.headYaw += tw.headYaw; o.headPitch += tw.headPitch; o.tilt += tw.tilt;
    o.armL[0] -= tw.armL; o.armR[0] -= tw.armR;
  }
  // Tells.
  const a = z.attack;
  if (z.state === 'lunge') {
    setArm(o.armL, -2.0, 0.25, 0, -0.3, 0.9, -0.4, HAND.CLAW);
    setArm(o.armR, -2.0, 0.25, 0, -0.3, 0.9, -0.4, HAND.CLAW);
    setLeg(o.legL, -0.9, 1.3, 0.4, 0); setLeg(o.legR, -0.4, 1.0, 0.5, 0);
    o.pitch = k === 'hunter' ? 0.9 : 0.55; o.headPitch = -0.6; o.mouth = true; o.sink = 0;
  } else if (a) {
    o.mouth = true;
    const t = Math.max(0, Math.min(1, prog));
    if (a === 'claw') {
      setArm(o.armL, -2.7 + t * 1.6, 0.25, 0, -0.4, 0.9, -0.4, HAND.CLAW);
      setArm(o.armR, -2.7 + t * 1.6, 0.25, 0, -0.4, 0.9, -0.4, HAND.CLAW);
      o.headPitch = -0.2;
    } else if (a === 'bash' && k === 'riot') {
      setArm(o.armR, -2.6 + t * 0.5, 0.2, 0, -1.2, 0, 0, HAND.FIST);
    } else if (a === 'bash') {
      // The brute's overhead smash: both fists up, rearing back.
      setArm(o.armL, -2.95 + t * 0.4, 0.15, 0, -0.7, 0, 0, HAND.FIST);
      setArm(o.armR, -2.95 + t * 0.4, 0.15, 0, -0.7, 0, 0, HAND.FIST);
      o.pitch = i.lean - 0.3 * (1 - t); o.headPitch = -0.3;
    } else if (a === 'bite') {
      o.pitch = 1.35 - 0.5 * t; o.headPitch = -1.3;
    } else if (a === 'lunge') {
      // Crouched to spring: hips down, arms back, the head low and forward.
      o.sink += 0.22 * Math.min(1, t * 2); o.pitch = (k === 'hunter' ? 1.0 : 0.55) + 0.2 * t;
      o.legL[0] = -1.0; o.legR[0] = -0.7; o.legL[1] = 1.7; o.legR[1] = 1.5; o.legL[2] = -0.5; o.legR[2] = -0.4;
      setArm(o.armL, 0.6, 0.35, 0, -0.8, 0.3, -0.3, HAND.CLAW);
      setArm(o.armR, 0.6, 0.35, 0, -0.8, 0.3, -0.3, HAND.CLAW);
      o.headPitch = -0.7 + Math.sin(time * 40) * 0.05;
    } else if (a === 'spit') {
      // Rears back, throat swelling, then the head snaps forward.
      o.pitch = i.lean - 0.35 * Math.sin(Math.PI * t); o.headPitch = -0.7 + 1.0 * t * t;
      setArm(o.armL, 0.1, 0.3, 0, -0.4, 0, 0, HAND.CLAW); setArm(o.armR, 0.1, 0.3, 0, -0.4, 0, 0, HAND.CLAW);
    } else if (a === 'burst') {
      o.swell = 1 + 0.16 * t + Math.sin(time * 38) * 0.015 * t;
      setArm(o.armL, -0.4, 1.2, 0, -0.3, 0, 0, HAND.OPEN); setArm(o.armR, -0.4, 1.2, 0, -0.3, 0, 0, HAND.OPEN);
      o.headPitch = -0.5;
    } else if (a === 'scream') {
      // Back arched, head thrown back, arms spread and trembling.
      const shake = Math.sin(time * 31) * 0.06;
      o.pitch = i.lean - 0.4 * Math.min(1, t * 2); o.headPitch = -0.85;
      setArm(o.armL, -0.6 + shake, 1.35, 0, -0.3, 0, 0, HAND.OPEN); setArm(o.armR, -0.6 - shake, 1.35, 0, -0.3, 0, 0, HAND.OPEN);
      o.hair = 0.8;
    } else if (a === 'grab') {
      setArm(o.armL, -1.5 - t * 0.7, 0.3, 0, -0.1, 0.6, -0.3, HAND.CLAW);
      setArm(o.armR, -1.5 - t * 0.7, 0.3, 0, -0.1, 0.6, -0.3, HAND.CLAW);
      o.pitch = 0.25 * t;
    }
  }
  if (z.state === 'held' || z.flags & ZF.HELD) {
    // Bitten and held by a dog: jerking, arms thrown out.
    setArm(o.armL, -0.45, 0.6, 0, -0.45, 0.2, -0.3, HAND.OPEN); setArm(o.armR, -0.3, 0.7, 0, -0.45, 0.2, -0.3, HAND.OPEN);
    o.tilt += Math.sin(time * 23) * 0.08;
  }
  return o;
}
