/**
 * Zombie mode, solo and co-op (design.md §1-§2, §4, §5.4): everything game.ts used to do inline for the horde, so its
 * own edits stay small. One coordinator per game:
 *  - the wave director (zombie-director.ts) runs here on the host (or solo) and spawns the horde, the giant mutants
 *    (after a quake), omen screams and their follow-ups; the same schedule solo and online, scaled by the team size;
 *  - the host simulates zombies and mutants in real time (a slow host or an open weapon bag never slows the room) and
 *    publishes snapshots, the director and events through zombie-net.ts; clients draw puppets, show every tell the
 *    moment its `tele` arrives, and send their hits for the host to validate and apply;
 *  - every damage to a player or a dog is victim-confirmed: each client tests its own player and dog against a hit's
 *    shape and applies it through the damage governor (45 dps from zombies, 60 a hit, no knockdown chains);
 *  - downed players, revives (hold E 4 s), the solo dog rescue, bleed-out, spectating, game over and the restart;
 *  - the companion dog, horror FX and audio, the dread director, supply drops and mutant loot crates, the HUD view.
 * Partners that may not have landed yet (mutants.ts, apocalypse.ts) are optional and typed locally from §5.3/§5.6.
 */
import * as THREE from 'three';
import {
  BLAST_ID, DOG_MODES, HIT_KINDS, MAX_HIT_DAMAGE, MUTANT_ID_BASE, MUTANT_KINDS, NO_SLOT, OMEN_ID, WEAPON_CODES, ZONES,
  type AttackId, type MutantKind, type NetMutant, type NetZombie, type ZCommand, type ZEvent, type ZHit, type ZHitKind,
  type ZPhase, type ZombieClientMessage, type ZombieKind, type ZombiePlayerFields, type ZombieServerMessage,
} from '../../lib/zombie-protocol';
import type { PeerState } from '../../lib/multiplayer-protocol';
import { createDirector, createGovernor, damageMul, hpMul, inViewCone, mutantHp, simSteps, speedMul, type DirectorStep, type SpawnHow } from './zombie-director';
import { KINDS } from './zombie-kinds';
import type { Prey, Zombie, ZombieScaling, createZombies } from './zombies';
import { createZombieNet, type ZombieNet } from './zombie-net';
import { createCompanions, type DogCommand, type DogHudView } from './companion';
import { createHorrorFx } from './horror-fx';
import { createHorrorAudio, yawOf } from './horror-audio';
import { createDread, type DreadOutput } from './dread';
import type { ZombieWorldApi } from './zombie-world';
import { MUTANT_SPEC, createMutants, mutantHitAt, mutantSpawnPoint, type MutantOut, type MutantTarget, type Mutants } from './mutants';
import type { createApocalypse } from './apocalypse';
import type { Entry, Registry } from './interact';
import type { HitKind } from './ragdoll';
import { weaponById, type WeaponId } from './weapons';

type MZone = 'body' | 'head' | 'weak' | 'limb';
export type ApocalypseApi = ReturnType<typeof createApocalypse>;

// ---- the HUD view (§4.3): a superset of today's Hud.zombie ----
export type ZombieHudView = {
  wave: number; left: number; kills: number; breakLeft: number; best: number; dots: { x: number; z: number }[];
  online?: boolean; phase?: ZPhase; bossWave?: boolean; host?: boolean; bandages?: number; score?: number;
  bosses?: { kind: MutantKind; name: string; hp: number; max: number; weak: boolean[]; hint: string | null }[];
  team?: { slot: number; name: string; color: string; hp: number; dogHp: number | null; state: 'up' | 'down' | 'dead'; bleed: number; reviving: boolean; host: boolean; dist: number; bearing: number }[];
  feed?: { id: number; text: string; tone: 'kill' | 'boss' | 'revive' | 'dog' | 'warn' }[];
  /** rescue: someone is coming (online: teammates may; solo: the dog is standing and has not saved you yet this wave). */
  self?: { state: 'up' | 'down' | 'dead' | 'spectate'; bleed: number; revivedBy: string | null; progress: number; watching: string | null; rescue?: boolean };
  dog?: DogHudView | null;
  threats?: { kind: 'mutant' | 'screamer' | 'bark'; bearing: number; dist: number }[];
  marks?: { kind: 'mutant' | 'quake' | 'down' | 'loot' | 'dog'; x: number; z: number }[];
  dread?: { vignette: number; tint: 'none' | 'blood' | 'toxic' | 'stalk'; tremor: number };
  over?: { wave: number; rows: { name: string; kills: number; damage: number; revives: number; downs: number }[]; restartIn: number } | null;
};

/** The local player this frame, as game.ts sees it. */
export type CoopPlayer = {
  x: number; z: number; angle: number; vx: number; vz: number; speed: number;
  riding: boolean; inCar: boolean; swimming: boolean; reach: number; health: number;
  /** game.ts' own down states (knocked over, wasted, busted). */
  knocked: boolean;
  sprint: boolean; quiet: boolean; firing: boolean; aimX: number; aimZ: number;
  /** Input active (no overlay open): solo pauses when it is not. */
  active: boolean;
  /** The weapon bag (Tab) is open: slow motion solo, none online. */
  bag: boolean;
};
export type CoopShot = { t: number; zombie: Zombie | null; mutant: { i: number; zone: MZone; weak: number } | null; head: boolean };

type Zombies = ReturnType<typeof createZombies>;
export type CoopDeps = {
  scene: THREE.Scene; camera: THREE.Camera; zombies: Zombies; world: ZombieWorldApi; registry: Registry;
  ground(x: number, z: number): number; clear(x: number, z: number, r: number): boolean; sight(x1: number, z1: number, x2: number, z2: number): boolean;
  /** Land only (the dog and spawns never go into deep water). */
  walkable(x: number, z: number, r: number): boolean;
  apocalypse?: ApocalypseApi | null;
  /** The live road graph (mutant spawn points). */
  roads(): import('./map/roads').RoadGraph;
  // game.ts callbacks
  damagePlayer(amount: number, from: { x: number; z: number } | null, by: string): void;
  knockPlayer(dx: number, dz: number, speed: number): void;
  slowPlayer(factor: number, seconds: number): void;
  healPlayer(amount: number): void;
  /** Stands the player up (revived or respawned) at (x, z) with this health. */
  respawn(x: number, z: number, health: number, near: boolean): void;
  /** Solo: the run is over (game.ts takes the player to the hospital and calls restart()). */
  endRun(): void;
  notify(text: string, ms?: number): void;
  banner(text: string, ms?: number): void;
  shake(amount: number): void;
  supply(wave: number): void;
  loot(kind: MutantKind, wave: number): void;
  blood(x: number, y: number, z: number, dx: number, dz: number, amount: number): void;
  shove(x: number, z: number, r: number, f: number): void;
  alarmAnimals(x: number, z: number, r: number): void;
  setDread(fogNear: number | null, fogFar: number | null): void;
  torch(flicker: number): void;
  /** The hold-E in progress (interact.ts), for the revive progress teammates see. */
  hold(): { id: string; progress: number } | null;
  /** The peer snapshot clock's render time (server ms), for the teammates' dogs. */
  peerRenderTime(): number;
  night(): number;
  /** Doors zombie mode closes (A10, A11): the deck's lift always, the gun store and hospital while a wave is on. */
  doors?: readonly { kind: 'gunstore' | 'hospital' | 'deck'; x: number; z: number; r: number }[];
  playThud(): void;
  /** A zombie this player killed may drop cash on the street (as before the co-op rewrite: 22%, 10-49 đ). */
  dropCash?(x: number, z: number): void;
};

const NAMES: Record<MutantKind, string> = { colossus: 'ĐẠI HỘ PHÁP', leaper: 'NHỆN MÁI', matriarch: 'MẸ BẦY' };
const MUTANT_HINTS: Record<MutantKind, string> = {
  colossus: 'Điểm yếu: bọc mủ sau vai',
  leaper: 'Điểm yếu: túi gai sống lưng, lộ ra khi nó chồm tới',
  matriarch: 'Điểm yếu: ba bọc độc trên bụng',
};
const WEAK_COUNT: Record<MutantKind, number> = { colossus: 1, leaper: 1, matriarch: 3 };
const START = { x: 12.6, z: 12.4 };
const AREA: readonly AttackId[] = ['burst', 'slam', 'deathburst', 'roar'];
const TOXIC: readonly AttackId[] = ['spit', 'bile', 'burst', 'exhale', 'deathburst'];
const HIT_SLACK = 0.6, DOG_SLACK = 0.3;
/** Telegraphs with a ground marker (the dog's dangers), and how long the dog takes to react to one (s). */
const MARKED: readonly AttackId[] = ['spit', 'bile', 'throw', 'pounce', 'charge', 'burst', 'slam', 'deathburst', 'exhale', 'swipe'];
const DOG_REACT = 0.25;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const isMutantKind = (k: string): k is MutantKind => (MUTANT_KINDS as readonly string[]).includes(k);
const RAGDOLL_KIND: Record<ZHitKind, HitKind> = { bullet: 'bullet', pellet: 'bullet', melee: 'melee', blast: 'blast', vehicle: 'vehicle', bite: 'melee', fire: 'blast' };

export function createZombieCoop(deps: CoopDeps) {
  const { zombies, world, scene, camera } = deps;
  const fx = createHorrorFx(scene, deps.ground);
  const audio = createHorrorAudio();
  const dread = createDread(0x2f1);
  const governor = createGovernor();
  const mutants: Mutants | null = createMutants(scene, world.mutantWorld, fx, audio);
  const apocalypse: ApocalypseApi | null = deps.apocalypse ?? null;

  // ---- room ----
  let online = false, selfId = '', selfSlot = 0, hostId: string | null = null, ff = false, myName = 'Bạn', myColor = '#ed763e';
  let net: ZombieNet | null = null;
  let running = false;
  let director = createDirector(0x51ed, false);
  const sim = () => !net || net.isHost;
  let simTime = 0, pausedFor = 0, frameDt = 0, nowMs = 0;
  const dirTime = () => (net ? net.serverNow() / 1000 : simTime);
  let peers: PeerState[] = [];
  const peerBySlot = new Map<number, PeerState>();
  const peerDown = new Map<number, number>();
  const nameOf = (slot: number) => (slot === selfSlot ? myName : peerBySlot.get(slot)?.name ?? `Người chơi ${slot + 1}`);

  // ---- self ----
  let zd: 0 | 1 | 2 = 0, bleedUntil = 0, downsThisWave = 0, dogRescueUsed = false, invulnerableUntil = 0;
  let revivedBy: string | null = null, watching: number | null = null;
  let reviveSend: { to: number; dog: boolean; until: number; next: number } | null = null;
  let bandages = 1, best = 0;
  let me: CoopPlayer = { x: START.x, z: START.z, angle: 0, vx: 0, vz: 0, speed: 0, riding: false, inCar: false, swimming: false, reach: 0, health: 100, knocked: false, sprint: false, quiet: false, firing: false, aimX: 0, aimZ: 0, active: true, bag: false };
  let camYaw = 0, swimFor = 0, joinPending = false;
  try { best = Number(localStorage.getItem('pvo-zombie-best')) || 0; } catch { /* storage blocked */ }

  // ---- what the frame carries ----
  const prey: Prey[] = [];
  const targets: MutantTarget[] = [];
  const mutantOut: MutantOut = { events: [], spawns: [] };
  const zbuf: NetZombie[] = [], mbuf: NetMutant[] = [];
  const feed: { id: number; text: string; tone: 'kill' | 'boss' | 'revive' | 'dog' | 'warn'; at: number }[] = [];
  let feedId = 0;
  const hazards: { x: number; z: number; r: number; until: number; dps: number; slow: number }[] = [];
  const landings: { at: number; x: number; z: number; r: number; dmg: number; mutant: boolean; a: AttackId }[] = [];
  const dangers: { x: number; z: number; r: number; from: number; until: number }[] = [];
  const dogDangers: { x: number; z: number; r: number; until: number }[] = [];
  const crates: { id: number; x: number; z: number; kind: MutantKind; wave: number }[] = [];
  let crateId = 0;
  const followUps: { at: number; x: number; z: number; kind: ZombieKind; count: number }[] = [];
  const mutantSpots: { kind: MutantKind; x: number; z: number }[] = [];
  let quake: { x: number; z: number; kind: MutantKind; start: number; until: number } | null = null;
  let roarAt = -99, roarDist = 99, impact = 0, overAt = 0, lastPublishDir = -Infinity, dirKey = '';
  const omens: { x: number; z: number }[] = [];
  const barks: { x: number; z: number; until: number }[] = [];
  const announced = new Set<string>();
  const bossSeen = new Map<MutantKind, number>();
  let dreadOut: DreadOutput | null = null;
  let lastState = new Uint8Array(128);
  let voiceAt = 0, hintAt = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pushFeed = (text: string, tone: 'kill' | 'boss' | 'revive' | 'dog' | 'warn') => {
    feed.push({ id: ++feedId, text, tone, at: nowMs });
    if (feed.length > 12) feed.shift();
  };
  /** Events this host creates: handled here (its own player is a victim too) and sent to everyone else. */
  const emit = (e: ZEvent, presented = false) => { onEvent(e, presented); net?.event(e); };
  /** Events mutants.ts makes or shows itself (its own markers, sounds and dust): tells, hits, roars, smashes of mutants. */
  const fromMutant = (e: ZEvent) => ('w' in e && e.w >= MUTANT_ID_BASE && e.w < OMEN_ID) || e.k === 'smash' || e.k === 'shove';

  // ---- the companion dog ----
  const companions = createCompanions(scene, {
    ground: deps.ground,
    clear: (x, z, r) => deps.walkable(x, z, r) && deps.clear(x, z, r),
    sight: deps.sight,
    nearestZombie(x, z, r) {
      let best: { w: number; x: number; z: number; kind: ZombieKind | MutantKind; big: boolean } | null = null, bd = r * r;
      zombies.near(x, z, r, (zb) => {
        const d = (zb.x - x) ** 2 + (zb.z - z) ** 2;
        if (d < bd) { bd = d; best = { w: zombies.netId(zb), x: zb.x, z: zb.z, kind: zb.kind, big: KINDS[zb.kind].big }; }
      });
      // The giant mutants too (measured to their body's edge): a dog sent at one nips it (it keeps away unless ordered).
      mutants?.near(x, z, r + 2, (m) => {
        if (m.phase === 'dying' || m.phase === 'dead' || m.y > 1.5) return;
        const d = Math.max(0, Math.hypot(m.x - x, m.z - z) - MUTANT_SPEC[m.kind].radius) ** 2;
        if (d < bd) { bd = d; best = { w: MUTANT_ID_BASE + m.i, x: m.x, z: m.z, kind: m.kind, big: true }; }
      });
      return best;
    },
    bite(w, damage, hold, x, z) {
      // (x, z) is the dog: a client's bite is checked against where its owner reports the dog (applyNetHit).
      const k = HIT_KINDS.indexOf('bite'), wp = WEAPON_CODES.indexOf('dog');
      if (w >= MUTANT_ID_BASE) {
        const m = mutants?.list().find((v) => v.i === w - MUTANT_ID_BASE);
        if (!m) return;
        if (sim()) mutants!.damage(m.i, damage, 'body', 0, { x, z }, 'bite', selfSlot, simTime, wp);
        else net!.hit({ w, d: damage, zone: 0, k, wp, dx: r2(m.x - x), dz: r2(m.z - z), f: 1.5, sx: r2(x), sz: r2(z) });
        return;
      }
      const zb = zombies.byId(w);
      if (!zb) return;
      if (sim()) applyZombieHit(zb, damage, 'body', 'bite', 'dog', selfSlot, { x: zb.x - x, z: zb.z - z }, 1.5, null, { x, z }, hold);
      else net!.hit({ w, d: damage, zone: 0, k, wp, dx: r2(zb.x - x), dz: r2(zb.z - z), f: 1.5, sx: r2(x), sz: r2(z), hold });
    },
    unseenThreat(x, z, yaw) {
      let best: { x: number; z: number } | null = null, bd = 400;
      zombies.near(x, z, 20, (zb) => {
        const d = (zb.x - x) ** 2 + (zb.z - z) ** 2;
        if (d < bd && !inViewCone(x, z, yaw, zb.x, zb.z)) { bd = d; best = { x: zb.x, z: zb.z }; }
      });
      return best;
    },
    alarm(x, z) { if (sim()) zombies.hearAt(x, z, 20, 1, simTime); },
    nearestMutant(x, z, r) {
      let best: { x: number; z: number } | null = null, bd = r * r;
      mutants?.near(x, z, r, (m) => { const d = (m.x - x) ** 2 + (m.z - z) ** 2; if (d < bd && m.phase !== 'dead' && m.phase !== 'dying') { bd = d; best = { x: m.x, z: m.z }; } });
      return best;
    },
    stalker(x, z, r) {
      let best: { x: number; z: number } | null = null, bd = r * r;
      zombies.near(x, z, r, (zb) => { if (zb.kind !== 'stalker') return; const d = (zb.x - x) ** 2 + (zb.z - z) ** 2; if (d < bd) { bd = d; best = { x: zb.x, z: zb.z }; } });
      return best;
    },
  });

  // ---- hold-E entries: revive a teammate (4 s), revive or bandage a dog (3 s / 2 s), open a crate ----
  const entries: Entry[] = [];
  deps.registry.addProvider((x, z, _r, out) => {
    if (!running) return;
    entries.length = 0;
    if (zd === 0) {
      for (const p of peers) {
        if (p.slot === undefined || p.zd !== 1 || Math.hypot(p.x - x, p.z - z) > 2.4) continue;
        const slot = p.slot, name = p.name;
        out.push({
          id: `zrevive:${slot}`, kind: 'person', x: p.x, z: p.z, r: 2.4, priority: 95, hold: 4, when: 'foot',
          prompt: () => ({ id: `zrevive:${slot}`, key: 'Giữ E', verb: 'Cứu', label: name }),
          use: () => { net?.command({ c: 'revive', to: slot }); reviveSend = { to: slot, dog: false, until: nowMs + 4000, next: nowMs + 1000 }; deps.notify(`Đang kéo ${name} dậy…`, 1500); },
        });
      }
      // A downed dog (its owner's or a teammate's) even when a standing dog, your own at heel, is nearer; else your own
      // hurt dog for a bandage (the nearest dog alone hid a teammate's downed dog behind your own: no prompt).
      let downAt: { x: number; z: number } | null = null, downD = 2.4;
      companions.forEachDog((_slot, dx, dz, isDown) => { const d = Math.hypot(dx - x, dz - z); if (isDown && d <= downD) { downD = d; downAt = { x: dx, z: dz }; } });
      const at = downAt as { x: number; z: number } | null, mine = companions.own();
      const dog = at ? companions.near(at.x, at.z, 0.05)
        : mine && mine.life === 'up' && !mine.riding && Math.hypot(mine.x - x, mine.z - z) <= 2.4 ? companions.near(mine.x, mine.z, 0.05) : null;
      if (dog && dog.down) {
        const slot = dog.slot;
        out.push({
          id: `zdog:${slot}`, kind: 'person', x: dog.x, z: dog.z, r: 2.4, priority: 92, hold: 3, when: 'foot',
          prompt: () => ({ id: `zdog:${slot}`, key: 'Giữ E', verb: 'Cứu', label: dog.name }),
          use: () => {
            if (slot === -1) companions.revive(simTime);
            else {
              net?.command({ c: 'dogRevive', to: slot }); reviveSend = { to: slot, dog: true, until: nowMs + 4000, next: nowMs + 1000 };
              // The host hears no command of its own: it announces its own rescue.
              if (sim() && nowMs - (dogRevivedAt.get(slot) ?? -1e9) > 6000) { dogRevivedAt.set(slot, nowMs); emit({ k: 'revived', by: selfSlot, to: slot, dog: 1 }); }
            }
          },
        });
      } else if (dog && dog.slot === -1 && dog.hurt && bandages > 0) {
        out.push({
          id: 'zbandage', kind: 'person', x: dog.x, z: dog.z, r: 2.4, priority: 80, hold: 2, when: 'foot',
          prompt: () => ({ id: 'zbandage', key: 'Giữ E', verb: 'Băng bó cho', label: dog.name }),
          use: () => { if (bandages > 0 && companions.bandage()) { bandages--; deps.notify(`Đã băng bó cho ${dog.name} (còn ${bandages} cuộn băng)`, 2500); } },
        });
      }
      for (const c of crates) {
        if (Math.hypot(c.x - x, c.z - z) > 2.6) continue;
        out.push({
          id: `zcrate:${c.id}`, kind: 'person', x: c.x, z: c.z, r: 2.6, priority: 85, when: 'foot',
          prompt: () => ({ id: `zcrate:${c.id}`, key: 'E', verb: 'Mở', label: 'Thùng tiếp tế đột biến' }),
          use: () => openCrate(c.id),
        });
      }
    }
    for (const e of entries) out.push(e);
    // Closed doors answer first: no lift without power, no shopping while a wave is on.
    const wave = (sim() ? director.phase : net?.director()?.phase ?? 'prep') === 'wave';
    for (const d of deps.doors ?? []) {
      if (Math.hypot(d.x - x, d.z - z) > d.r + 1) continue;
      if (d.kind !== 'deck' && !wave) continue;
      const id = `zclosed:${d.kind}`, text = d.kind === 'deck' ? 'Thang máy mất điện từ khi dịch bùng phát' : 'Tiệm đóng cửa · đợi hết đợt';
      out.push({ id, kind: 'door', x: d.x, z: d.z, r: d.r + 1, priority: 99, when: 'any', prompt: () => ({ id, key: 'E', verb: d.kind === 'deck' ? 'Thang máy mất điện' : 'Tiệm đóng cửa', label: d.kind === 'deck' ? 'từ khi dịch bùng phát' : 'đợi hết đợt' }), use: () => deps.notify(text, 2500) });
    }
  });
  function openCrate(id: number) {
    const i = crates.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = crates.splice(i, 1)[0];
    const extra = c.kind === 'matriarch' ? 2 : 0;
    bandages += 2 + extra;
    deps.loot(c.kind, c.wave);
    deps.notify(`Thùng tiếp tế: đạn cho mọi súng, ${2 + extra} cuộn băng và tiền`, 3500);
  }

  // ---- scaling ----
  const waveN = () => {
    if (sim()) return { w: Math.max(1, director.wave), n: director.n };
    const d = net?.director();
    return { w: Math.max(1, d?.wave ?? 1), n: Math.max(1, d?.n ?? 1) };
  };
  const scalingNow = (): ZombieScaling => { const { w, n } = waveN(); return { hp: hpMul(w, n), speed: speedMul(w, n), damage: damageMul(w) }; };

  // ---- hits on the horde ----
  const kindIndex = (k: ZHitKind) => HIT_KINDS.indexOf(k);
  /** Host: one hit on a zombie with the kind's zone and armour rules; a kill is credited to `by` (a slot). */
  function applyZombieHit(zb: Zombie, base: number, zone: 'head' | 'body' | 'limb', kind: ZHitKind, wp: (typeof WEAPON_CODES)[number], by: number, dir: { x: number; z: number }, force: number, at: THREE.Vector3 | null, from: { x: number; z: number }, hold = 0) {
    const l = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / l, dz = dir.z / l;
    const big = kind === 'blast' || kind === 'vehicle';
    const head = zone === 'head';
    const push = Math.min(14, force);
    const result = zombies.damage(zb, base, dx * push, big ? 3 + push * 0.3 : 1.4, dz * push, simTime, big, at, RAGDOLL_KIND[kind], zone, from);
    if (!result) return null;
    director.onDamage(by, result.dealt);
    if (hold > 0) zombies.hold(zb, hold, simTime);
    if (result.killed) {
      director.onKill(zb.kind, by, head);
      emit({ k: 'kill', w: zombies.netId(zb), kind: zb.kind, by, wp: WEAPON_CODES.indexOf(wp), ...(head ? { head: 1 as const } : {}), dx: r2(dx), dz: r2(dz), f: r2(push) });
      if (by === selfSlot) deps.dropCash?.(zb.x, zb.z);
    }
    return result;
  }
  /** Host: a blast over the simulation (grenades, rockets, a car blowing up), credited to `by`. */
  function runBlast(x: number, z: number, radius: number, damage: number, by: number) {
    zombies.hearAt(x, z, 70, 1, simTime);
    zombies.near(x, z, radius, (zb) => {
      const d = Math.hypot(zb.x - x, zb.z - z), f = 1 - d / radius;
      applyZombieHit(zb, damage * f + 20, 'body', 'blast', 'grenade', by, { x: zb.x - x, z: zb.z - z }, 8 + 14 * f, null, { x, z });
    });
    mutants?.near(x, z, radius + 1.5, (m) => {
      const d = Math.max(0, Math.hypot(m.x - x, m.z - z) - 1), f = Math.max(0, 1 - d / radius);
      if (f > 0) mutants!.damage(m.i, damage * f + 20, 'body', 0, { x, z }, 'blast', by, simTime);
    });
  }
  /** Host: a client's hit, validated (§1.5): live id, bounds, range from the shooter's last sample. */
  const hitRate = new Map<number, { t: number; n: number }>();
  function applyNetHit(from: number, h: ZHit) {
    const kind = HIT_KINDS[h.k] ?? 'bullet', wp = WEAPON_CODES[h.wp] ?? 'pistol';
    if (!Number.isFinite(h.d) || h.d <= 0 || h.d > (MAX_HIT_DAMAGE[h.k] ?? 34)) return;
    const shooter = from === selfSlot ? me : peerBySlot.get(from);
    if (!shooter) return;
    const rate = hitRate.get(from) ?? { t: simTime, n: 0 };
    if (simTime - rate.t > 1) { rate.t = simTime; rate.n = 0; }
    if (++rate.n > 60) return;
    hitRate.set(from, rate);
    if (h.w === BLAST_ID) {
      // (sx, sz) is the blast's centre: within a rocket's range of the shooter (a car blowing up beside them too).
      if (kind !== 'blast' || !(h.f > 0 && h.f <= 8) || Math.hypot(h.sx - shooter.x, h.sz - shooter.z) > weaponById('rpg').range + 8) return;
      runBlast(h.sx, h.sz, h.f, h.d, from);
      return;
    }
    // The shooter stood where its last sample says (a driver at 25 m/s moves 6 m in a quarter second); a dog's bite
    // comes from where its owner reports the dog (it can be 15 m off on an ordered attack).
    const speed = Math.abs(shooter.speed ?? 0);
    if (wp === 'dog') {
      const dog = from === selfSlot ? companions.own() : peerBySlot.get(from)?.dog;
      if (!dog || Math.hypot(h.sx - dog.x, h.sz - dog.z) > 4 + 2) return;
    } else if (Math.hypot(h.sx - shooter.x, h.sz - shooter.z) > 6 + 0.35 * speed + 2) return;
    const range = wp === 'dog' ? 4 : wp === 'car' ? 12 : wp === 'fists' ? 4 : weaponById(wp as WeaponId).range;
    if (h.w >= MUTANT_ID_BASE) {
      const m = mutants?.list().find((v) => v.i === h.w - MUTANT_ID_BASE);
      if (!m || Math.hypot(m.x - h.sx, m.z - h.sz) > range + 12) return;
      mutants!.damage(m.i, h.d, ZONES[h.zone] ?? 'body', h.weak ?? 0, { x: h.sx, z: h.sz }, kind, from, simTime, h.wp);
      return;
    }
    const zb = zombies.byId(h.w);
    if (!zb || Math.hypot(zb.x - h.sx, zb.z - h.sz) > range + 8) return;
    const zone = ZONES[h.zone] === 'head' ? 'head' : ZONES[h.zone] === 'limb' ? 'limb' : 'body';
    applyZombieHit(zb, h.d, zone, kind, wp, from, { x: h.dx, z: h.dz }, h.f, null, { x: h.sx, z: h.sz }, Math.min(1.5, h.hold ?? 0));
  }

  // ---- events: the same handling for the host's own and the ones a client receives ----
  /** How much of a hit's shape covers (px, pz), grown by slack: -1 outside, else 1 (area attacks fall off with distance). */
  function cover(e: { a: AttackId; x: number; z: number; yaw: number; r: number; arc: number }, px: number, pz: number, slack: number) {
    const dx = px - e.x, dz = pz - e.z;
    if (e.a === 'charge') {
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      return along >= -slack && along <= e.r + slack && across <= e.arc + slack ? 1 : -1;
    }
    const d = Math.hypot(dx, dz);
    if (d > e.r + slack) return -1;
    if (e.arc < 6.2 && d > 0.8) {
      const off = Math.abs(wrapA(Math.atan2(dx, dz) - e.yaw));
      if (off > e.arc / 2 + slack / Math.max(d, 0.5)) return -1;
    }
    return AREA.includes(e.a) ? Math.max(0.15, 1 - d / Math.max(0.1, e.r)) : 1;
  }
  const ownDog = () => companions.own();
  function hurtMe(damage: number, source: 'zombie' | 'mutant' | 'other', kb: number, from: { x: number; z: number }, a: AttackId | null, by: string) {
    if (zd !== 0 || nowMs < invulnerableUntil) return;
    const r = governor.apply(simTime, damage, source, kb >= 5, me.knocked && kb >= 5);
    if (r.damage <= 0) return;
    deps.damagePlayer(r.damage, from, by);
    const dx = me.x - from.x, dz = me.z - from.z, l = Math.hypot(dx, dz) || 1;
    if (r.knock && !me.inCar) deps.knockPlayer(dx / l, dz / l, kb);
    if (a === 'bite') deps.slowPlayer(0.6, 1.5);
    impact = Math.max(impact, Math.min(1, r.damage / 40));
  }
  function hurtDog(damage: number, kb: number, from: { x: number; z: number }) {
    companions.damage(damage, from, kb >= 5, simTime);
  }
  const bit = (slot: number, dog: boolean) => 1 << (slot + (dog ? 8 : 0));
  const sourceOf = (w: number) => (w >= MUTANT_ID_BASE && w < OMEN_ID ? 'mutant' : 'zombie') as 'zombie' | 'mutant';
  const kindOfId = (w: number): ZombieKind | MutantKind | null => {
    if (w >= MUTANT_ID_BASE) return mutants?.list().find((m) => m.i === w - MUTANT_ID_BASE)?.kind ?? null;
    return zombies.byId(w)?.kind ?? null;
  };
  /** The last events handled (tests, __pvo.z.events()). */
  const evLog: { t: number; k: string; a?: string; w?: number; to?: number; dmg?: number }[] = [];
  function onEvent(e: ZEvent, presented = false) {
    const t = simTime;
    evLog.push({ t: Math.round(t * 100) / 100, k: e.k, ...('a' in e ? { a: e.a } : {}), ...('w' in e ? { w: e.w } : {}), ...('to' in e && e.to !== undefined ? { to: e.to } : {}), ...('dmg' in e ? { dmg: e.dmg } : {}) });
    if (evLog.length > 200) evLog.shift();
    switch (e.k) {
      case 'tele': {
        if (!sim() && e.w < MUTANT_ID_BASE) zombies.telegraph(e.w, e.a, e.t, t);
        const toxic = TOXIC.includes(e.a), color = toxic ? '#9fe04a' : '#ff5a2a';
        const tx = e.tx ?? e.x, tz = e.tz ?? e.z;
        if (!presented) {
          if (e.a === 'spit' || e.a === 'bile' || e.a === 'throw' || e.a === 'pounce') fx.marker('circle', tx, tz, e.r, 0, 0, t, t + e.t, color);
          else if (e.a === 'charge') fx.marker('line', e.x, e.z, e.r, e.yaw, e.arc, t, t + e.t, color);
          else if (e.a === 'burst' || e.a === 'slam' || e.a === 'deathburst') fx.marker('ring', e.x, e.z, e.r, 0, 0, t, t + e.t, color);
          else if (e.a === 'exhale' || e.a === 'swipe') fx.marker('cone', e.x, e.z, e.r, e.yaw, e.arc, t, t + e.t, color);
          else if (e.a === 'lunge' && e.tx !== undefined) fx.marker('circle', tx, tz, 1.3, 0, 0, t, t + e.t, color);
          else if ((e.a === 'bash' || e.a === 'grab') && e.r >= 1.6) fx.marker('cone', e.x, e.z, e.r, e.yaw, e.arc, t, t + e.t, color);
          audio.tell(e.a, e.x, e.z);
        }
        // The dog leaves what a ground marker shows (design §6b, "dangers from markers"), a quarter second after the tell:
        // a claw or bite at it lands, and a mutant's slam can catch a dog that went in to bite (it could dodge every blow).
        if (MARKED.includes(e.a) || (e.a === 'lunge' && e.tx !== undefined) || ((e.a === 'bash' || e.a === 'grab') && e.r >= 1.6)) {
          dangers.push({ x: tx, z: tz, r: e.a === 'charge' ? 3 : e.r + 0.5, from: t + DOG_REACT, until: t + e.t + 0.3 });
        }
        // An attack on me from outside my view: a bark ping / arrow on the HUD.
        if (e.to !== undefined && e.to & bit(selfSlot, false) && !inViewCone(me.x, me.z, camYaw, e.x, e.z)) barks.push({ x: e.x, z: e.z, until: nowMs + 1500 });
        if (e.a === 'deathburst') deps.notify('Mẹ Bầy sắp nổ · Chạy ra xa!', 2500);
        break;
      }
      case 'hit': {
        const src = sourceOf(e.w);
        if (e.to & bit(selfSlot, false)) {
          const c = cover(e, me.x, me.z, HIT_SLACK);
          if (c > 0) {
            const k = kindOfId(e.w);
            let dmg = e.dmg * c, kb = e.kb;
            if (src === 'mutant') { const h = mutantHitAt(e.a, e.dmg, Math.hypot(me.x - e.x, me.z - e.z)); dmg = h.dmg; kb = h.knock ? Math.max(5, e.kb) : Math.min(4, e.kb); }
            hurtMe(dmg, src, kb, { x: e.x, z: e.z }, e.a, k ? (isMutantKind(k) ? NAMES[k] : KINDS[k].name) : 'Zombie');
            deps.playThud();
            deps.blood(me.x, 1.3, me.z, me.x - e.x, me.z - e.z, 5);
          }
        }
        const dog = ownDog();
        if (dog && e.to & bit(selfSlot, true)) {
          const c = cover(e, dog.x, dog.z, DOG_SLACK);
          if (c > 0) hurtDog(e.dmg * c * 0.85, e.kb, { x: e.x, z: e.z });
        }
        if (e.a === 'slam') impact = Math.max(impact, Math.max(0, 1 - Math.hypot(me.x - e.x, me.z - e.z) / 25));
        if (!presented && e.a === 'burst') { audio.burst(e.x, e.z); fx.scorch(e.x, e.z, Math.min(4, e.r), t); fx.shock(e.x, e.z, e.r, t); }
        break;
      }
      case 'proj': {
        const land = fx.projectile(e.id, e.a, e.x, e.y, e.z, e.vx, e.vy, e.vz, t);
        landings.push({ at: t + land.t, x: land.x, z: land.z, r: e.r, dmg: e.dmg, mutant: sourceOf(e.w) === 'mutant', a: e.a });
        dangers.push({ x: land.x, z: land.z, r: e.r + 0.5, from: t + DOG_REACT, until: t + land.t + 0.3 });
        break;
      }
      case 'cloud':
        hazards.push({ x: e.x, z: e.z, r: e.r, until: t + e.s, dps: e.dps, slow: 0 });
        if (!presented) fx.cloud(e.x, e.z, e.r, t + e.s, 'toxic');
        break;
      case 'kill': {
        if (!sim() && e.w < MUTANT_ID_BASE) {
          // My own kill on a client: my own pickup, where the puppet fell (its slot still holds the spot).
          const at = zombies.zombies[e.w & 127];
          if (e.by === selfSlot && at && at.gen === e.w >> 7) deps.dropCash?.(at.x, at.z);
          zombies.puppetKill(e.w, e.dx, e.dz, e.f, t);
        }
        const kind = e.kind;
        if (e.by === NO_SLOT) { if (kind === 'bloater') audio.burst(me.x, me.z); break; }
        const name = isMutantKind(kind) ? NAMES[kind] : KINDS[kind].name;
        if (isMutantKind(kind)) pushFeed(`Cả đội đã hạ ${name}! · ${nameOf(e.by)} kết liễu`, 'boss');
        else pushFeed(`${e.by === selfSlot ? 'Bạn' : nameOf(e.by)} hạ ${name}${e.head ? ' (trúng đầu)' : ''}`, 'kill');
        break;
      }
      case 'spawn': {
        const y = deps.ground(e.x, e.z);
        // Instanced dust (horror-fx), not effects.smoke: its 48 sprites are 48 draw calls.
        if (e.how === 'rise') fx.dust(e.x, e.z, t, 5);
        else if (e.how === 'drop') { fx.dust(e.x, e.z, t, 10); audio.drop(e.x, e.z); }
        else if (e.how === 'burst' || e.how === 'brood') { fx.dust(e.x, e.z, t, 14); audio.pop(e.x, e.z); }
        else if (e.how === 'alley') audio.voice('runner', 'alert', e.x, e.z, 0.7);
        else if (e.how === 'emerge') {
          const k = mutants?.list().find((m) => m.i === e.w - MUTANT_ID_BASE)?.kind ?? quake?.kind ?? 'colossus';
          deps.banner(`QUÁI ĐỘT BIẾN · ${NAMES[k]}`, 3500);
          quake = null;
        }
        void y;
        break;
      }
      case 'quake':
        quake = { x: e.x, z: e.z, kind: e.kind, start: t, until: t + e.t };
        deps.notify('Mặt đất đang rung chuyển… có thứ gì đó rất lớn đang tới!', 5000);
        companions.cue('quake');
        deps.alarmAnimals(me.x, me.z, 60);
        break;
      case 'roar': {
        roarAt = t; roarDist = Math.hypot(e.x - me.x, e.z - me.z);
        if (!presented) audio.roar(e.x, e.z, true);
        if (roarDist < 40) deps.shake(0.45 * (1 - roarDist / 40) * (reduced ? 0.5 : 1));
        companions.cue('roar');
        break;
      }
      case 'scream':
        if (e.w === OMEN_ID) omens.push({ x: e.x, z: e.z });
        else { audio.scream(e.x, e.z); if (Math.hypot(e.x - me.x, e.z - me.z) < 70) deps.notify('Tiếng gào xé tai · cả bầy đang kéo tới!', 2500); }
        break;
      case 'smash': apocalypse?.smash(e.ruin, e.code, t); break;
      case 'shove': deps.shove(e.x, e.z, e.r, e.f); break;
      case 'wave': onWave(e.n, e.p); break;
      case 'loot':
        crates.push({ id: ++crateId, x: e.x, z: e.z, kind: e.kind, wave: waveN().w });
        deps.notify('Thùng tiếp tế đột biến đã rơi · nhấn E để mở', 4000);
        break;
      case 'revived':
        pushFeed(e.dog ? `${nameOf(e.by)} đã cứu chó của ${nameOf(e.to)}` : `${nameOf(e.by)} đã cứu ${nameOf(e.to)}`, 'revive');
        break;
    }
  }
  function onWave(n: number, p: 'start' | 'clear' | 'boss' | 'over' | 'restart') {
    if (p === 'start' || p === 'boss') {
      deps.banner(p === 'boss' ? `ĐỢT ${n} · QUÁI ĐỘT BIẾN` : `ĐỢT ${n}`, 2800);
      deps.notify(n === 1 ? 'Chúng đến rồi! Bắn vào đầu, giữ khoảng cách.' : p === 'boss' ? 'Đợt quái đột biến · nghe tiếng đất rung để biết nó tới từ đâu!' : `Đợt ${n}: đông hơn, nhanh hơn!`, 3500);
      downsThisWave = 0;
      dogRescueUsed = false;
    } else if (p === 'clear') {
      deps.banner(`ĐÃ DỌN SẠCH ĐỢT ${n}`, 3000);
      deps.supply(n);
      bandages++;
      if (n > best) { best = n; try { localStorage.setItem('pvo-zombie-best', String(n)); } catch { /* storage blocked */ } }
      deps.notify(`Tiếp tế đã tới: đạn, máu, tiền và 1 cuộn băng · nghỉ ${online ? 25 : 20} giây trước đợt sau`, 4500);
      // A rest: the dead come back near the team, the dog that ran off comes home.
      if (zd === 2) respawnNearTeam(60);
      companions.revive(simTime);
    } else if (p === 'over') {
      deps.banner('TOÀN ĐỘI ĐÃ GỤC', 4000);
      overAt = nowMs;
    } else if (p === 'restart') {
      deps.banner('BẮT ĐẦU LẠI TỪ ĐỢT 1', 3000);
      // The host clears the street for the new run (clients follow its snapshots).
      if (sim()) { zombies.clear(); mutants?.stop(); }
      overAt = 0;
      zd = 0; watching = null; revivedBy = null; downsThisWave = 0; dogRescueUsed = false;
      deps.respawn(START.x + (selfSlot % 4) * 1.2 - 1.8, START.z + Math.floor(selfSlot / 4) * 1.2, 100, false);
      invulnerableUntil = nowMs + 3000;
      governor.reset();
      companions.revive(simTime);
      crates.length = 0; hazards.length = 0;
    }
  }
  function respawnNearTeam(health: number) {
    let best: PeerState | null = null, bd = Infinity;
    for (const p of peers) { if (p.zd || p.down) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (d < bd) { bd = d; best = p; } }
    const at = best ? { x: best.x + 1.5, z: best.z + 1.5 } : START;
    zd = 0; watching = null; revivedBy = null;
    deps.respawn(at.x, at.z, health, true);
    invulnerableUntil = nowMs + 3000;
  }

  // ---- commands (revive, dog revive, marks, restart) ----
  const dogRevivedAt = new Map<number, number>();
  function onCommand(from: number, c: ZCommand) {
    if (c.c === 'revive') {
      if (c.to === selfSlot && zd === 1) {
        const r = peerBySlot.get(from);
        if (r && Math.hypot(r.x - me.x, r.z - me.z) <= 3.5) {
          zd = 0; revivedBy = null;
          deps.respawn(me.x, me.z, 35, false);
          governor.soften(simTime + 2);
          deps.notify(`${r.name} đã kéo bạn dậy!`, 2500);
        }
      }
      if (sim() && c.to === selfSlot) reviverOf.set(selfSlot, from);
    } else if (c.c === 'dogRevive') {
      // Only a teammate standing at the downed dog (its owner's report, 3.5 m as for people) brings it back: a command
      // from across the map, or a reviver's resend after the dog went down again, does nothing.
      const r = peerBySlot.get(from), mine = c.to === selfSlot ? companions.own() : null, theirs = mine ? null : peerBySlot.get(c.to)?.dog;
      const at = mine ?? theirs, down = mine ? mine.life === 'down' : !!theirs && DOG_MODES[theirs.m] === 'down';
      if (!r || !at || !down || Math.hypot(r.x - at.x, r.z - at.z) > 3.5) return;
      if (mine) { companions.revive(simTime); deps.notify(`${nameOf(from)} đã cứu chó của bạn!`, 2500); }
      // The reviver re-sends once a second until it stands: one feed line per rescue.
      if (sim() && nowMs - (dogRevivedAt.get(c.to) ?? -1e9) > 6000) { dogRevivedAt.set(c.to, nowMs); emit({ k: 'revived', by: from, to: c.to, dog: 1 }); }
    } else if (c.c === 'restart') {
      if (sim() && director.phase === 'over') { director.restart(dirTime()); emit({ k: 'wave', n: 0, p: 'restart' }); }
    } else if (c.c === 'start') {
      if (sim()) director.startSoon(dirTime());
    }
  }

  // ---- host: the director's step ----
  /** §3.4: 45-80 m from the team, ≥ 35 m from every player, on a road it fits, preferring rubble holes and craters (mutants.ts). */
  function placeMutant(kind: MutantKind) {
    const up = prey.filter((p) => !p.dog && !p.down).map((p) => ({ x: p.x, z: p.z }));
    const plan = apocalypse?.plan;
    const spot = mutantSpawnPoint(kind, {
      players: up.length ? up : [{ x: me.x, z: me.z }], graph: deps.roads(), walkable: (x, z) => deps.walkable(x, z, 1),
      hard: (x, z, r) => world.mutantWorld.hard(x, z, r), route: (fx0, fz0, tx, tz, radius) => world.route(fx0, fz0, tx, tz, radius),
      holes: kind === 'matriarch' ? plan?.craters : kind === 'colossus' ? plan?.spawnHoles : undefined, rng: Math.random,
    });
    return spot ?? { x: me.x + 60, z: me.z };
  }
  function onDirector(step: DirectorStep) {
    const sc = scalingNow();
    for (const s of step.spawns) {
      const p = prey.find((q) => !q.dog && q.slot === s.near) ?? prey[0];
      if (!p || !zombies.spawnNear(s.kind, p.x, p.z, s.how, sc, simTime)) director.refund(1);
    }
    if (step.quake) {
      const spot = placeMutant(step.quake);
      mutantSpots.push({ kind: step.quake, x: spot.x, z: spot.z });
      emit({ k: 'quake', x: r2(spot.x), z: r2(spot.z), r: 60, t: 6, kind: step.quake });
    }
    for (const m of step.mutants) {
      const i = mutantSpots.findIndex((s) => s.kind === m.kind);
      const spot = i >= 0 ? mutantSpots.splice(i, 1)[0] : placeMutant(m.kind);
      if (mutants) {
        const id = mutants.spawn(m.kind, spot.x, spot.z, m.hp, m.at === 'roof' ? 'drop' : m.at === 'crater' ? 'crater' : 'emerge', simTime);
        emit({ k: 'spawn', w: MUTANT_ID_BASE + Math.max(0, id), how: 'emerge', x: r2(spot.x), z: r2(spot.z) });
      } else {
        // mutants.ts not loaded: a brute pack takes the mutant's place so the wave can still be cleared.
        for (let k = 0; k < 3; k++) zombies.spawnNear('brute', me.x, me.z, 'burst', sc, simTime);
        director.onSummon(3);
      }
    }
    if (step.waveStarted) emit({ k: 'wave', n: step.waveStarted, p: step.bossWave ? 'boss' : 'start' });
    if (step.waveCleared) emit({ k: 'wave', n: step.waveCleared, p: 'clear' });
    if (step.over) emit({ k: 'wave', n: director.wave, p: 'over' });
    if (step.restart) emit({ k: 'wave', n: 0, p: 'restart' });
    for (const o of step.omens) {
      const p = o.near === selfSlot ? { x: me.x, z: me.z, yaw: camYaw } : (() => { const q = peerBySlot.get(o.near); return q ? { x: q.x, z: q.z, yaw: q.cam ?? q.angle } : null; })();
      if (!p) continue;
      const a = p.yaw + Math.PI + (Math.random() - 0.5) * 1.6, d = 60 + Math.random() * 30;
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      emit({ k: 'scream', w: OMEN_ID, x: r2(x), z: r2(z), r: 80 });
      if (o.follow) followUps.push({ at: simTime + 5 + Math.random() * 10, x, z, kind: Math.random() < 0.4 ? 'screamer' : 'runner', count: 0 });
    }
  }
  function spawnSummons(list: readonly { kind: ZombieKind; x: number; z: number; count: number; how: SpawnHow }[]) {
    const sc = scalingNow();
    for (const s of list) {
      let made = 0;
      for (let k = 0; k < s.count * 3 && made < s.count; k++) {
        const a = Math.random() * Math.PI * 2, d = s.how === 'brood' ? 1.5 + Math.random() * 2 : 6 + Math.random() * 6;
        const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
        if (!world.spawnOk(x, z, 'rise', s.kind)) continue;
        if (zombies.spawnAt(s.kind, x, z, s.how, sc, simTime)) made++;
      }
      if (made) director.onSummon(made);
    }
  }

  // ---- promotion / demotion (§1.7) ----
  let lastWaveShown = 0;
  function promote() {
    const m = net!.promote();
    const d = m.director;
    const w = Math.max(1, d?.wave ?? 1), n = Math.max(1, d?.n ?? 1);
    zombies.setScaling({ hp: hpMul(w, n), speed: speedMul(w, n), damage: damageMul(w) });
    zombies.adopt(m.zombies, (k) => KINDS[k].hp * hpMul(w, n), simTime);
    zombies.setAuthority('sim');
    mutants?.adopt(m.mutants, simTime);
    mutants?.setAuthority('sim');
    director = createDirector((Math.random() * 0x7fffffff) | 0, online);
    director.best = online ? 0 : best; // online: the room's best (zdir), never this player's solo record
    // The mirror (zombie-net keeps a demoted host's own last director in it): the same wave, kills and score. With
    // nothing at all (no host ever published), a new run waits for the team; resume() is the last resort.
    if (d) { director.fromNet(d, dirTime()); director.reconcile(m.killsSince, m.spawnsSince, zombies.alive()); }
    else if (lastWaveShown > 0) director.resume(lastWaveShown, dirTime());
    else director.start(dirTime());
    lastPublishDir = -Infinity;
  }
  function demote() {
    zombies.setAuthority('puppet');
    mutants?.setAuthority('puppet');
  }

  // ---- per frame ----
  function buildPrey() {
    const night = deps.night();
    prey.length = 0;
    targets.length = 0;
    const speed = Math.hypot(me.vx, me.vz);
    prey.push({
      x: me.x, z: me.z, down: zd !== 0 || me.knocked, inVehicle: me.riding, reach: me.reach, night, slot: selfSlot, local: true,
      vx: me.vx, vz: me.vz, camYaw, quiet: me.quiet, firing: me.firing, sprint: me.sprint, speed, away: me.swimming || nowMs < invulnerableUntil,
    });
    targets.push({ slot: selfSlot, dog: false, x: me.x, z: me.z, vx: me.vx, vz: me.vz, down: zd !== 0 || me.swimming, inVehicle: me.riding, camYaw, lag: 0 });
    const dog = companions.own();
    if (dog && dog.life !== 'away' && !dog.riding) {
      prey.push({ x: dog.x, z: dog.z, down: dog.life === 'down', inVehicle: false, reach: 0, night, slot: selfSlot, dog: true, local: true, speed: dog.speed });
      const t = companions.netState()?.t ?? -1;
      targets.push({ slot: selfSlot, dog: true, x: dog.x, z: dog.z, vx: 0, vz: 0, down: dog.life === 'down', inVehicle: false, biting: t >= MUTANT_ID_BASE ? t - MUTANT_ID_BASE : -1 });
    }
    if (!net) return;
    const lead = net.isHost ? 1 : 0;
    for (const p of peers) {
      if (p.slot === undefined) continue;
      const age = lead && p.updatedAt ? Math.min(0.3, Math.max(0, (net.serverNow() - p.updatedAt) / 1000)) : 0;
      const x = p.x + (p.vx ?? 0) * age, z = p.z + (p.vz ?? 0) * age;
      const down = !!p.zd || !!p.down, vehicle = p.vehicle ?? 'foot';
      prey.push({
        x, z, down, inVehicle: vehicle !== 'foot' && vehicle !== 'swim', reach: vehicle === 'car' || vehicle === 'police' ? 1.6 : vehicle === 'scooter' ? 0.9 : 0, night,
        slot: p.slot, vx: p.vx, vz: p.vz, camYaw: p.cam, quiet: p.quiet, firing: p.firing, sprint: Math.abs(p.speed) > 5, speed: Math.abs(p.speed), rtt: 0.2, away: vehicle === 'swim',
      });
      targets.push({ slot: p.slot, dog: false, x, z, vx: p.vx ?? 0, vz: p.vz ?? 0, down: down || vehicle === 'swim', inVehicle: vehicle !== 'foot' && vehicle !== 'swim', camYaw: p.cam, lag: 0.15 });
      const d = p.dog;
      if (d) {
        const mode = DOG_MODES[d.m] ?? 'follow';
        if (mode === 'away' || mode === 'ride') continue;
        prey.push({ x: d.x, z: d.z, down: mode === 'down', inVehicle: false, reach: 0, night, slot: p.slot, dog: true, rtt: 0.2 });
        targets.push({ slot: p.slot, dog: true, x: d.x, z: d.z, vx: 0, vz: 0, down: mode === 'down', inVehicle: false, lag: 0.15, biting: d.t >= MUTANT_ID_BASE ? d.t - MUTANT_ID_BASE : -1 });
      }
    }
  }
  const steps: number[] = [];
  function simulate(interval: number) {
    const dt = Math.min(0.1, interval);
    // The director on its own clock (server seconds online).
    const pc = world.players;
    const step = director.update(dt, {
      time: dirTime(), night: deps.night(), alive: zombies.alive(), aliveOf: (k) => zombies.aliveOf(k),
      mutants: mutants ? mutants.list().filter((m) => m.phase !== 'dead' && m.phase !== 'dying').length : 0,
      players: pc.map((p, i) => ({ slot: i === 0 ? selfSlot : prey.filter((q) => !q.dog)[i]?.slot ?? i, x: p.x, z: p.z, up: p.up, calm: true })),
    });
    onDirector(step);
    // Omen follow-ups: a screamer or a runner pack from where the scream came.
    for (let i = followUps.length - 1; i >= 0; i--) {
      const f = followUps[i];
      if (simTime < f.at) continue;
      followUps.splice(i, 1);
      spawnSummons([{ kind: f.kind, x: f.x, z: f.z, count: f.kind === 'runner' ? 3 : 1, how: 'alley' }]);
    }
    zombies.setScaling(scalingNow());
    zombies.setPlayers(Math.max(1, director.n));
    simSteps(interval, { online, bag: me.bag }, steps);
    let t = simTime - steps.reduce((s, v) => s + v, 0);
    for (let i = 0; i < steps.length; i++) {
      t += steps[i];
      const ev = zombies.update(steps[i], t, prey, i === steps.length - 1);
      for (const e of ev.ev) emit(e);
      if (ev.summons.length) spawnSummons(ev.summons);
      if (mutants) {
        mutantOut.events.length = 0; mutantOut.spawns.length = 0;
        mutants.update(steps[i], t, targets, mutantOut);
        for (const e of mutantOut.events) {
          if (e.k === 'kill' && isMutantKind(e.kind)) director.onKill(e.kind, e.by, false);
          emit(e, true);
        }
        if (mutantOut.spawns.length) spawnSummons(mutantOut.spawns.map((s) => ({ ...s, count: 1 })));
      }
    }
    if (!steps.length) zombies.update(0, simTime, prey, true);
  }
  function puppets() {
    const rt = net!.renderTime();
    net!.samplePuppets(rt, (z, fresh) => zombies.netApply(z, fresh, rt));
    zombies.setScaling(scalingNow());
    zombies.update(frameDt, simTime, prey, true);
    if (mutants) {
      const recs: NetMutant[] = [];
      net!.sampleMutants(rt, (m) => recs.push({ ...m }));
      mutants.netApply(recs, rt);
      mutantOut.events.length = 0; mutantOut.spawns.length = 0;
      mutants.update(frameDt, simTime, targets, mutantOut);
    }
    for (const e of net!.takeEvents()) {
      if (fromMutant(e)) { mutants?.applyEvent(e, simTime); onEvent(e, true); }
      else onEvent(e);
    }
    const d = net!.director();
    if (d) lastWaveShown = d.wave;
    // Wrecks the mutants crushed or threw before this client joined (or while its socket was down): zdir.ruins.
    if (d && d !== ruinsFrom && apocalypse) { ruinsFrom = d; if (d.ruins.length) apocalypse.syncSmashed(d.ruins); }
  }
  let ruinsFrom: object | null = null;
  function publish() {
    if (!net?.isHost) return;
    if (net.due(nowMs)) {
      const n = zombies.netExport(zbuf);
      const mc = mutants ? mutants.netExport(mbuf) : 0;
      const players = prey.filter((p) => !p.dog).map((p) => ({ x: p.x, z: p.z }));
      net.publish(zbuf, n, mbuf, mc, players, nowMs);
    }
    const d = director.toNet();
    lastWaveShown = d.wave;
    const key = `${d.wave}:${d.phase}`;
    if (key !== dirKey || nowMs - lastPublishDir > 250) {
      d.mutants = (mutants?.list() ?? []).filter((m) => m.phase !== 'dead').map((m) => ({ i: m.i, k: m.kind, hp: Math.round(m.hp), max: Math.round(m.max), weak: m.weak }));
      d.ruins = apocalypse ? apocalypse.smashed().slice(-48) : [];
      net.publishDirector(d, key !== dirKey);
      dirKey = key;
      lastPublishDir = nowMs;
    }
  }

  function selfDown() {
    if (zd === 1) {
      // Solo: once a wave, the dog runs over and licks you awake.
      if (!online) {
        const p = companions.rescue(owner(), simTime, !dogRescueUsed);
        if (p === 1) {
          dogRescueUsed = true; zd = 0;
          deps.respawn(me.x, me.z, 30, false);
          governor.soften(simTime + 2);
          return;
        }
      }
      if (nowMs >= bleedUntil) {
        if (!online) { zd = 0; running = false; deps.endRun(); return; }
        zd = 2;
        deps.notify('Bạn đã tử trận · hồi sinh khi hết đợt', 4000);
      }
      // Who is reviving me (their hold-E progress travels in PlayerState).
      revivedBy = null;
      for (const p of peers) if (p.rv === selfSlot && (p.rvp ?? 0) > 0) revivedBy = p.name;
    }
    if (zd === 2) {
      // Spectating: a standing teammate (Q/E changes, game.ts). Back at the next rest.
      const up = peers.filter((p) => !p.zd && !p.down);
      if (watching === null || !up.some((p) => p.slot === watching)) watching = up[0]?.slot ?? null;
    }
  }
  const owner = () => ({ x: me.x, z: me.z, yaw: me.angle, camYaw, speed: me.speed, inVehicle: me.riding, down: zd !== 0, aimX: me.aimX, aimZ: me.aimZ, firing: me.firing });
  /** Solo: the dog can still come and lick its downed owner awake (standing, and not used this wave). */
  const dogCanRescue = () => !online && !dogRescueUsed && companions.own()?.life === 'up';

  function hazardsTick(dt: number) {
    const dog = ownDog();
    for (let i = landings.length - 1; i >= 0; i--) {
      const l = landings[i];
      if (simTime < l.at) continue;
      landings.splice(i, 1);
      if (Math.hypot(me.x - l.x, me.z - l.z) <= l.r + 0.3) hurtMe(l.dmg, l.mutant ? 'mutant' : 'zombie', l.a === 'throw' ? 5 : 0, { x: l.x, z: l.z }, l.a, l.a === 'throw' ? NAMES.colossus : 'Axit');
      if (dog && Math.hypot(dog.x - l.x, dog.z - l.z) <= l.r) hurtDog(l.dmg * 0.85, 0, { x: l.x, z: l.z });
      if (l.a === 'spit') hazards.push({ x: l.x, z: l.z, r: 1.8, until: simTime + 5, dps: 6, slow: 0 });
      else if (l.a === 'bile') hazards.push({ x: l.x, z: l.z, r: 3, until: simTime + 6, dps: 6, slow: 0.6 });
    }
    let inCloud = false;
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      if (simTime > h.until) { hazards.splice(i, 1); continue; }
      if (Math.hypot(me.x - h.x, me.z - h.z) <= h.r && zd === 0 && !me.inCar) {
        inCloud = true;
        const r = governor.apply(simTime, h.dps * dt, 'other', false, nowMs < invulnerableUntil);
        if (r.damage > 0) deps.damagePlayer(r.damage, null, 'Khí độc');
        if (h.slow) deps.slowPlayer(h.slow, 0.3);
      }
      if (dog && Math.hypot(dog.x - h.x, dog.z - h.z) <= h.r) companions.damage(h.dps * dt, { x: h.x, z: h.z }, false, simTime);
    }
    // The river is toxic in zombie mode (A10): after 6 s in deep water, 4 HP/s.
    swimFor = me.swimming ? swimFor + dt : 0;
    if (swimFor > 6 && zd === 0) {
      deps.damagePlayer(4 * dt, null, 'Nước sông nhiễm độc');
      if (Math.floor((swimFor - dt) / 3) !== Math.floor(swimFor / 3)) deps.notify('Nước sông nhiễm độc · lên bờ ngay!', 2500);
    }
    for (let i = dangers.length - 1; i >= 0; i--) if (simTime > dangers[i].until) dangers.splice(i, 1);
    return inCloud;
  }

  function presentation(dt: number, inCloud: boolean) {
    // Eyes in the dark, props and glowing tells.
    const night = deps.night();
    fx.eyes.begin();
    zombies.forEachEye((x, y, z, rgb, glow, kind) => {
      const d = Math.hypot(x - me.x, z - me.z);
      if (kind === 'stalker' && d > 30) return;
      const s = glow * (0.25 + 1.35 * night) * (d > 90 ? Math.max(0, 1 - (d - 90) / 40) : 1);
      fx.eyes.push(x, y, z, rgb, s, kind === 'stalker' ? 0.04 : 0.07);
    });
    fx.props.begin();
    zombies.forEachProp((m, rgb, shape) => fx.props.push(m, rgb, shape));
    for (const c of crates) {
      const y = deps.ground(c.x, c.z);
      cm.compose(cv.set(c.x, y + 0.35, c.z), cq.identity(), cs.set(0.9, 0.7, 0.7));
      fx.props.push(cm, 0x4f7a3a, 0);
    }
    fx.glows.begin();
    zombies.forEachGlow(simTime, (x, y, z, r, rgb, pulse) => { cm.compose(cv.set(x, y, z), cq.identity(), cs.set(r, r, r)); fx.glows.push(cm, rgb, pulse); });
    for (const c of crates) { cm.compose(cv.set(c.x, deps.ground(c.x, c.z) + 0.9, c.z), cq.identity(), cs.set(0.12, 0.12, 0.12)); fx.glows.push(cm, 0xfff2a0, 0.5 + 0.5 * Math.sin(simTime * 4)); }
    fx.update(simTime, dt, camera);
    // Dread: heartbeat, breath, fog, flicker, distant screams (presentation only).
    const threats: { x: number; z: number; kind: ZombieKind | MutantKind; big: boolean; seen: boolean; telling: boolean }[] = [];
    let stalker = Infinity;
    zombies.near(me.x, me.z, 60, (zb) => {
      if (zb.kind === 'stalker') stalker = Math.min(stalker, Math.hypot(zb.x - me.x, zb.z - me.z));
      if (zb.kind === 'walker' || threats.length > 24) return;
      threats.push({ x: zb.x, z: zb.z, kind: zb.kind, big: zb.kind === 'stalker' || zb.kind === 'brute', seen: world.seenLocal(zb.x, zb.z, deps.ground(zb.x, zb.z) + 1.5), telling: !!zb.attack });
    });
    for (const m of mutants?.list() ?? []) if (m.phase !== 'dead') threats.push({ x: m.x, z: m.z, kind: m.kind, big: true, seen: true, telling: !!m.telling });
    const quakeRamp = quake ? Math.max(0, Math.min(1, (simTime - quake.start) / Math.max(0.1, quake.until - quake.start))) : 0;
    if (quake && simTime > quake.until + 3) quake = null;
    dreadOut = dread.update({
      now: simTime, dt, night, health: me.health, boss: !!(sim() ? director.bossWave : net?.director() && (net.director()!.boss.length > 0 || net.director()!.mutants.length > 0)) || (mutants?.list().length ?? 0) > 0, reducedMotion: reduced,
      player: { x: me.x, z: me.z, camYaw, sprinting: me.sprint, inCloud }, threats, quake: quakeRamp, stalker, roarAt, roarDist, impact, omens, down: zd !== 0,
    });
    omens.length = 0;
    impact = 0;
    deps.setDread(dreadOut.fogNear, dreadOut.fogFar);
    if (dreadOut.shake > 0.01) deps.shake(dreadOut.shake);
    deps.torch(dreadOut.torchFlicker);
    audio.setListener(me.x, me.z, camYaw);
    audio.heartbeat(dreadOut.heartbeat.bpm, dreadOut.heartbeat.volume);
    audio.breath(dreadOut.breath);
    audio.tremor(Math.max(dreadOut.tremor, quakeRamp * 0.7));
    audio.ambience(dreadOut.ambience, threats.some((t) => isMutantKind(t.kind)));
    if (dreadOut.distantScream !== null) audio.distantScream(dreadOut.distantScream);
    if (quake && quakeRamp > 0.1 && Math.random() < dt * 3) {
      const a = Math.random() * Math.PI * 2;
      fx.dust(me.x + Math.cos(a) * 8, me.z + Math.sin(a) * 8, simTime, 3);
    }
    // Voices: tells and alerts come with their events; now and then a nearby zombie moans or clicks.
    if (nowMs > voiceAt) {
      voiceAt = nowMs + 700 + Math.random() * 900;
      let pick: Zombie | null = null, pd = 26 * 26;
      zombies.near(me.x, me.z, 26, (zb) => { const d = (zb.x - me.x) ** 2 + (zb.z - me.z) ** 2; if (d < pd && Math.random() < 0.5) { pd = d; pick = zb; } });
      const zb = pick as Zombie | null;
      if (zb) audio.voice(zb.kind, zb.state === 'chase' ? 'alert' : 'idle', zb.x, zb.z, 1, !deps.sight(me.x, me.z, zb.x, zb.z));
    }
    // State changes worth a sound: a zombie spotting its prey, a stalker moving unseen.
    for (const zb of zombies.zombies) {
      const s = STATE_CODE[zb.state] ?? 0, was = lastState[zb.index];
      lastState[zb.index] = s;
      if (zb.state === 'off' || s === was) continue;
      if (zb.state === 'chase' && was === STATE_CODE.wander && Math.hypot(zb.x - me.x, zb.z - me.z) < 40) audio.voice(zb.kind, 'alert', zb.x, zb.z);
    }
    // First sightings (once a run per kind).
    if (nowMs > hintAt) {
      hintAt = nowMs + 300;
      zombies.near(me.x, me.z, 32, (zb) => {
        if (announced.has(zb.kind) || !KINDS[zb.kind].hint) return;
        if (!world.seenLocal(zb.x, zb.z, deps.ground(zb.x, zb.z) + 1.2)) return;
        announced.add(zb.kind);
        deps.notify(KINDS[zb.kind].hint!, 4500);
      });
      // A giant's weak point, once a run (a notice, not a line over the boss bars).
      for (const m of mutants?.list() ?? []) if (!bossSeen.has(m.kind) && m.phase !== 'emerge') { bossSeen.set(m.kind, nowMs); deps.notify(`${NAMES[m.kind]} · ${MUTANT_HINTS[m.kind]}`, 6000); }
    }
  }
  const STATE_CODE: Record<string, number> = { off: 0, rise: 1, wander: 2, chase: 3, stagger: 4, down: 5, windup: 6, lunge: 7, scream: 8, frozen: 9, drop: 10, burst: 11, held: 12, crawl: 13 };
  const cm = new THREE.Matrix4(), cv = new THREE.Vector3(), cq = new THREE.Quaternion(), cs = new THREE.Vector3();

  function dogTick(dt: number) {
    dogDangers.length = 0;
    for (const g of dangers) if (simTime >= g.from) dogDangers.push(g);
    companions.update(dt, simTime, owner(), dogDangers);
    for (const e of companions.takeEvents()) {
      if (e.k === 'bark' && e.tx !== undefined && e.tz !== undefined) barks.push({ x: e.tx, z: e.tz, until: nowMs + 2000 });
      if (e.text && (e.k === 'down' || e.k === 'away' || e.k === 'back' || e.k === 'revived' || e.k === 'hurt' || e.k === 'lick' || e.k === 'rescued' || e.k === 'refuse')) deps.notify(e.text, 2800);
      if (e.k === 'down') pushFeed(e.text ?? 'Chó của bạn đã gục', 'dog');
    }
  }

  /** Who was last seen reviving each slot (their hold-E, from PlayerState rv), for the host's 'revived' line. */
  const reviverOf = new Map<number, number>();
  function trackPeers() {
    peerBySlot.clear();
    for (const p of peers) if (p.slot !== undefined) peerBySlot.set(p.slot, p);
    if (!sim()) return;
    const hold = deps.hold();
    if (hold?.id.startsWith('zrevive:')) reviverOf.set(Number(hold.id.slice(8)), selfSlot);
    for (const p of peers) if (p.slot !== undefined && (p.rv ?? -1) >= 0 && (p.rv ?? -1) < 8 && (p.rvp ?? 0) > 0) reviverOf.set(p.rv!, p.slot);
    // The host counts teammates going down (stats) and announces a revive when a downed teammate stands again.
    for (const p of peers) {
      if (p.slot === undefined) continue;
      const was = peerDown.get(p.slot) ?? 0, now = p.zd ?? 0;
      if (now === 1 && was === 0) director.onDown(p.slot);
      if (now === 0 && was === 1) {
        const by = reviverOf.get(p.slot);
        if (by !== undefined) { director.onRevive(by); emit({ k: 'revived', by, to: p.slot }); }
        reviverOf.delete(p.slot);
      }
      peerDown.set(p.slot, now);
    }
    // And when the host itself was revived.
    if (zd === 0 && selfWasDown && reviverOf.has(selfSlot)) { const by = reviverOf.get(selfSlot)!; director.onRevive(by); emit({ k: 'revived', by, to: selfSlot }); reviverOf.delete(selfSlot); }
    selfWasDown = zd === 1;
  }
  let selfWasDown = false;

  // ---- HUD ----
  const bossHint = (kind: MutantKind) => { const at = bossSeen.get(kind); return at !== undefined && nowMs - at < 9000 ? MUTANT_HINTS[kind] : null; };
  let lastTeamKey = '', teamCache: ZombieHudView['team'] = [], lastBossKey = '', bossCache: ZombieHudView['bosses'] = [];
  function hud(now: number): ZombieHudView {
    const stats = sim() ? director.stats(dirTime()) : null;
    const d = net?.director() ?? null;
    const wave = stats ? stats.wave : d?.wave ?? 0;
    const phase: ZPhase = stats ? stats.phase : d?.phase ?? 'prep';
    const breakLeft = stats ? stats.breakLeft : d && (d.phase !== 'wave') ? Math.max(0, Math.ceil((d.until - (net?.serverNow() ?? 0)) / 1000)) : 0;
    const left = stats ? stats.left : d?.left ?? 0;
    const kills = stats ? stats.kills : d?.kills ?? 0;
    const dots: { x: number; z: number }[] = [];
    zombies.forEachStanding((x, z) => { if (dots.length < 48 && Math.hypot(x - me.x, z - me.z) < 70) dots.push({ x: Math.round(x / 2) * 2, z: Math.round(z / 2) * 2 }); });
    // Bosses (stable identity unless they change).
    const ml = mutants?.list() ?? [];
    const bosses = ml.filter((m) => m.phase !== 'dead').map((m) => ({
      kind: m.kind, name: NAMES[m.kind], hp: Math.max(0, Math.round(m.hp)), max: Math.round(m.max),
      weak: Array.from({ length: WEAK_COUNT[m.kind] }, (_, k) => !!(m.weak & (1 << k))), hint: bossHint(m.kind),
    }));
    const bossKey = JSON.stringify(bosses);
    if (bossKey !== lastBossKey) { lastBossKey = bossKey; bossCache = bosses; }
    // Team (online).
    const team = online ? peers.filter((p) => p.slot !== undefined).map((p) => ({
      slot: p.slot!, name: p.name, color: p.color, hp: Math.max(0, Math.round(p.health ?? 100)), dogHp: p.dog ? Math.round(p.dog.h) : null,
      state: (p.zd === 1 ? 'down' : p.zd === 2 ? 'dead' : 'up') as 'up' | 'down' | 'dead', bleed: Math.ceil(p.bleed ?? 0), reviving: (p.rv ?? -1) >= 0 && (p.rvp ?? 0) > 0,
      host: net?.hostSlot === p.slot, dist: Math.round(Math.hypot(p.x - me.x, p.z - me.z)), bearing: Math.round(wrapA(Math.atan2(p.x - me.x, p.z - me.z) - camYaw) * 10) / 10,
    })) : [];
    const teamKey = JSON.stringify(team);
    if (teamKey !== lastTeamKey) { lastTeamKey = teamKey; teamCache = team; }
    // Threat arrows: mutants, screamers, barks.
    // Off screen only (more than 45° off the camera): one in plain view needs no arrow over the HUD.
    const threats: NonNullable<ZombieHudView['threats']> = [];
    const offScreen = (b: number) => Math.abs(b) > Math.PI / 4;
    for (const m of ml) { const b = r2(wrapA(Math.atan2(m.x - me.x, m.z - me.z) - camYaw)); if (m.phase !== 'dead' && offScreen(b)) threats.push({ kind: 'mutant', bearing: b, dist: Math.round(Math.hypot(m.x - me.x, m.z - me.z)) }); }
    zombies.near(me.x, me.z, 50, (zb) => { const b = r2(wrapA(Math.atan2(zb.x - me.x, zb.z - me.z) - camYaw)); if (zb.kind === 'screamer' && threats.length < 6 && offScreen(b)) threats.push({ kind: 'screamer', bearing: b, dist: Math.round(Math.hypot(zb.x - me.x, zb.z - me.z)) }); });
    for (let i = barks.length - 1; i >= 0; i--) { const b = barks[i]; if (now > b.until) { barks.splice(i, 1); continue; } threats.push({ kind: 'bark', bearing: r2(wrapA(Math.atan2(b.x - me.x, b.z - me.z) - camYaw)), dist: Math.round(Math.hypot(b.x - me.x, b.z - me.z)) }); }
    const marks: NonNullable<ZombieHudView['marks']> = [];
    for (const m of ml) if (m.phase !== 'dead') marks.push({ kind: 'mutant', x: Math.round(m.x), z: Math.round(m.z) });
    if (quake) marks.push({ kind: 'quake', x: Math.round(quake.x), z: Math.round(quake.z) });
    for (const p of peers) if (p.zd === 1) marks.push({ kind: 'down', x: Math.round(p.x), z: Math.round(p.z) });
    for (const c of crates) marks.push({ kind: 'loot', x: Math.round(c.x), z: Math.round(c.z) });
    companions.forEachDog((_slot, x, z) => { if (marks.length < 40) marks.push({ kind: 'dog', x: Math.round(x), z: Math.round(z) }); });
    const hold = deps.hold();
    let over: ZombieHudView['over'] = null;
    if (phase === 'over') {
      const rows = (d?.stats ?? director.slotStats()).map(([slot, k, dmg, downs, revives]) => ({ name: nameOf(slot), kills: k, damage: dmg, revives, downs }));
      over = { wave, rows, restartIn: Math.max(0, Math.ceil(10 - (now - overAt) / 1000)) };
    }
    return {
      wave, left, kills, breakLeft, best: online ? Math.max(d?.best ?? 0, director.best) : Math.max(best, director.best), dots,
      online, phase, bossWave: sim() ? director.bossWave : !!d && (d.boss.length > 0 || d.mutants.length > 0), host: sim(), bandages, score: stats ? stats.score : d?.score ?? 0,
      bosses: bossCache, team: teamCache,
      feed: feed.filter((f) => now - f.at < 4500).slice(-5).map(({ id, text, tone }) => ({ id, text, tone })),
      self: {
        state: zd === 1 ? 'down' : zd === 2 ? (watching !== null ? 'spectate' : 'dead') : 'up', bleed: zd === 1 ? Math.max(0, Math.ceil((bleedUntil - now) / 1000)) : 0,
        revivedBy, progress: hold?.id.startsWith('zrevive:') ? Math.round(hold.progress * 100) / 100 : 0, watching: watching !== null ? nameOf(watching) : null,
        rescue: online ? true : zd === 1 && dogCanRescue(),
      },
      dog: companions.hud(simTime),
      threats, marks,
      dread: dreadOut ? { vignette: Math.round(dreadOut.vignette * 100) / 100, tint: dreadOut.tint, tremor: Math.round(dreadOut.tremor * 100) / 100 } : { vignette: 0, tint: 'none', tremor: 0 },
      over,
    };
  }

  // ---- the API ----
  const api = {
    fx, audio, companions,
    get mutants() { return mutants; },
    get apocalypse() { return apocalypse; },
    get running() { return running; },
    get online() { return online; },
    get isHost() { return sim(); },
    get slot() { return selfSlot; },
    get net() { return net; },
    /** True while this player is downed or dead (game.ts: kneel, shuffle, no input but the pistol). */
    get downed() { return zd; },
    /** The room (null: solo). Online clients draw puppets until the room's zrole says they host. */
    setRoom(room: { online: boolean; selfId: string; slot: number; host: string | null; epoch: number; ff: boolean; name?: string; color?: string } | null) {
      online = !!room?.online;
      myName = room?.name || 'Bạn';
      myColor = room?.color || '#ed763e';
      selfId = room?.selfId ?? '';
      selfSlot = room?.slot ?? 0;
      hostId = room?.host ?? null;
      ff = !!room?.ff;
      net?.reset();
      net = online ? createZombieNet({ selfSlot }) : null;
      if (net && room) net.onRole({ type: 'zrole', host: room.host ?? '', slot: NO_SLOT, epoch: room.epoch, why: 'join' }, selfId);
      director = createDirector((Math.random() * 0x7fffffff) | 0, online);
      director.best = online ? 0 : best;
      const mode = sim() ? 'sim' : 'puppet';
      zombies.setAuthority(mode);
      mutants?.setAuthority(mode);
    },
    get friendlyFire() { return ff; },
    get hostId() { return hostId; },
    start(now: number) {
      running = true;
      nowMs = now;
      simTime = now / 1000; pausedFor = 0;
      zd = 0; bleedUntil = 0; downsThisWave = 0; dogRescueUsed = false; watching = null; revivedBy = null; invulnerableUntil = 0;
      bandages = 1; crates.length = 0; hazards.length = 0; landings.length = 0; dangers.length = 0; followUps.length = 0; mutantSpots.length = 0; feed.length = 0;
      quake = null; overAt = 0; announced.clear(); bossSeen.clear(); governor.reset(); lastWaveShown = 0;
      zombies.startManaged(simTime);
      zombies.setAuthority(sim() ? 'sim' : 'puppet');
      director.start(dirTime());
      director.best = online ? 0 : best;
      fx.clear();
      fx.setColumns(apocalypse?.plan?.columns ?? []);
      if (online) {
        // Everyone starts around the start point, by slot; a player joining mid-wave goes to the team (placeNearTeam).
        deps.respawn(START.x + ((selfSlot % 4) - 1.5) * 1.6, START.z + (Math.floor(selfSlot / 4) - 0.5) * 1.6, 100, true);
        invulnerableUntil = now + 3000;
        joinPending = !sim();
      }
      companions.spawnOwn('', online ? selfSlot % 4 : 0, myColor, me.x - 1.5, me.z - 1.5);
      lastState = new Uint8Array(128);
    },
    stop() {
      if (!running && !mutants) return;
      running = false;
      zombies.stop();
      mutants?.stop();
      companions.despawnOwn();
      companions.setPeers([], 0, 0); // teammates' dogs go with the room (none left in the living city)
      fx.clear();
      deps.setDread(null, null);
      audio.heartbeat(60, 0); audio.breath(0); audio.tremor(0); audio.ambience(0, false);
      crates.length = 0; hazards.length = 0; landings.length = 0;
      zd = 0;
    },
    /** Solo: a new run after the hospital (wave 1 again). */
    restart(now: number) {
      this.start(now);
    },
    /** game.ts, health reached 0 in zombie mode: downed instead of wasted (true: handled). */
    onLethal(now: number): boolean {
      if (!running) return false;
      if (zd !== 0) return true;
      zd = 1; downsThisWave++;
      bleedUntil = now + (online ? (downsThisWave > 1 ? 15 : 30) : 10) * 1000;
      if (sim()) director.onDown(selfSlot);
      const dog = companions.own(), name = companions.hud(simTime)?.name ?? 'Chó';
      deps.notify(online ? 'Bạn đã gục! Đồng đội có thể giữ E để cứu bạn'
        : dogCanRescue() ? `Bạn đã gục! ${name} đang chạy tới…`
          : dog?.life === 'down' ? `Bạn đã gục! ${name} cũng đã gục · không ai cứu được`
            : dogRescueUsed ? `Bạn đã gục! ${name} đã cứu bạn một lần trong đợt này` : 'Bạn đã gục!', 3500);
      return true;
    },
    /** The latest peer snapshot (game.ts setPeers): teammates, their dogs, revives. */
    setPeers(list: PeerState[], serverTime: number) {
      peers = list;
      if (Number.isFinite(serverTime)) net?.observe(serverTime);
      companions.setPeers(list.filter((p) => p.slot !== undefined).map((p) => ({ slot: p.slot!, name: p.name, color: p.color, dog: p.dog })), deps.peerRenderTime(), serverTime);
    },
    update(interval: number, now: number, player: CoopPlayer) {
      if (!running) return;
      nowMs = now;
      me = player;
      camYaw = yawOf(camera);
      // Solo pauses while an overlay is open (A11): the horde holds, nothing claws a player in a menu.
      if (!online && !player.active) {
        pausedFor += Math.min(0.25, interval);
        simTime = now / 1000 - pausedFor;
        zombies.update(0, simTime, prey, true);
        return;
      }
      simTime = now / 1000 - pausedFor;
      frameDt = Math.min(0.1, interval);
      trackPeers();
      buildPrey();
      world.setPlayers([
        { x: me.x, z: me.z, camYaw, up: zd === 0, local: true },
        ...peers.filter((p) => p.slot !== undefined).map((p) => ({ x: p.x, z: p.z, camYaw: p.cam ?? p.angle, up: !p.zd && !p.down, local: false })),
      ]);
      if (net?.isHost) {
        for (const { from, h } of net.takeHits()) applyNetHit(from, h);
      }
      if (net) for (const { from, c } of net.takeCommands()) onCommand(from, c);
      if (sim()) simulate(interval);
      else puppets();
      selfDown();
      // A friend dropping into a wave in progress: next to a standing teammate (≥ 20 m from zombies), 3 s untouchable.
      if (joinPending && peers.length) {
        joinPending = false;
        const phase = net?.director()?.phase;
        const mate = peers.find((p) => !p.zd && !p.down && p.slot !== undefined);
        let clear = !!mate;
        if (mate) zombies.near(mate.x, mate.z, 20, () => { clear = false; });
        if (phase === 'wave' && mate && Math.hypot(mate.x - me.x, mate.z - me.z) > 25) {
          const a = Math.random() * Math.PI * 2;
          deps.respawn(mate.x + Math.cos(a) * (clear ? 2.5 : 1.5), mate.z + Math.sin(a) * (clear ? 2.5 : 1.5), Math.max(me.health, 100), true);
          invulnerableUntil = now + 3000;
        }
      }
      if (reviveSend && now >= reviveSend.next) {
        // Re-send once a second until the teammate (or their dog) stands again, or 4 s pass.
        const target = peerBySlot.get(reviveSend.to);
        const done = reviveSend.dog ? DOG_MODES[target?.dog?.m ?? 0] !== 'down' : !!target && !target.zd;
        if (now > reviveSend.until || done) reviveSend = null;
        else { net?.command(reviveSend.dog ? { c: 'dogRevive', to: reviveSend.to } : { c: 'revive', to: reviveSend.to }); reviveSend.next = now + 1000; }
      }
      const inCloud = hazardsTick(frameDt);
      dogTick(frameDt);
      apocalypse?.update(camera, me.x, me.z, simTime);
      presentation(frameDt, inCloud);
      publish();
    },
    /** The nearest zombie or mutant under a ray (`dir` normalised) and where it was hit. */
    shoot(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number): CoopShot | null {
      const z = zombies.raycast(origin, dir, maxT);
      const m = mutants?.raycast(origin, dir, z ? z.t : maxT) ?? null;
      if (m) return { t: m.t, zombie: null, mutant: { i: m.i, zone: m.zone, weak: m.weak }, head: m.zone === 'head' };
      if (z) return { t: z.t, zombie: z.zombie, mutant: null, head: z.head };
      return null;
    },
    /**
     * A hit by this player (base damage before zones and armour): applied at once on the host (solo), predicted and
     * sent on a client. `at` is the world point, `dir` the push direction.
     */
    hit(shot: CoopShot, base: number, kind: ZHitKind, wp: (typeof WEAPON_CODES)[number], dir: THREE.Vector3, force: number, at: THREE.Vector3 | null) {
      const zone = shot.head ? 'head' : 'body';
      if (shot.mutant) {
        const m = shot.mutant;
        if (sim()) mutants?.damage(m.i, base, m.zone, m.weak, { x: me.x, z: me.z }, kind, selfSlot, simTime);
        else net!.hit({ w: MUTANT_ID_BASE + m.i, d: r2(Math.min(base, MAX_HIT_DAMAGE[kindIndex(kind)])), zone: ZONES.indexOf(m.zone), k: kindIndex(kind), wp: WEAPON_CODES.indexOf(wp), dx: r3(dir.x), dz: r3(dir.z), f: r2(force), sx: r2(me.x), sz: r2(me.z), ...(m.weak ? { weak: m.weak } : {}) });
        return;
      }
      const zb = shot.zombie;
      if (!zb) return;
      if (sim()) { applyZombieHit(zb, base, zone, kind, wp, selfSlot, { x: dir.x, z: dir.z }, force, at, { x: me.x, z: me.z }); return; }
      // A client: predict (the zone's multiplier, the riot shield from the front), send the base damage.
      const k = KINDS[zb.kind];
      let est = zone === 'head' ? (zb.kind === 'shipper' && !(zb.flags & 8) ? base * 1.2 : base * k.headMul) : base;
      if (zb.kind === 'riot' && zone !== 'head' && !(zb.flags & 16)) {
        const a = Math.abs(wrapA(Math.atan2(me.x - zb.x, me.z - zb.z) - zb.yaw));
        if (a < Math.PI / 3) est *= 0.25;
      }
      const push = Math.min(14, force);
      zombies.predict(zb, est, dir.x * push, 1.4, dir.z * push, simTime, at, RAGDOLL_KIND[kind]);
      net!.hit({ w: zombies.netId(zb), d: r2(Math.min(base, MAX_HIT_DAMAGE[kindIndex(kind)])), zone: ZONES.indexOf(zone), k: kindIndex(kind), wp: WEAPON_CODES.indexOf(wp), dx: r3(dir.x), dz: r3(dir.z), f: r2(force), sx: r2(me.x), sz: r2(me.z) });
    },
    /** An explosion by this player (grenade, rocket) or a car blowing up near it: one area hit (never one per zombie). */
    blast(x: number, _y: number, z: number, radius: number, damage: number) {
      if (sim()) { runBlast(x, z, radius, damage, selfSlot); return; }
      net!.hit({ w: BLAST_ID, d: r2(Math.min(damage, MAX_HIT_DAMAGE[3])), zone: 0, k: kindIndex('blast'), wp: WEAPON_CODES.indexOf('grenade'), dx: 0, dz: 0, f: r2(Math.min(8, radius)), sx: r2(x), sz: r2(z) });
    },
    /** A vehicle this player drives runs into the horde. */
    ram(x: number, z: number, radius: number, speed: number, fx0: number, fz0: number) {
      const hits: Zombie[] = [];
      zombies.near(x, z, radius, (zb) => hits.push(zb));
      for (const zb of hits) {
        const d = Math.min(220, speed * 6);
        if (sim()) applyZombieHit(zb, d, 'body', 'vehicle', 'car', selfSlot, { x: fx0, z: fz0 }, speed * 0.85, null, { x: me.x, z: me.z });
        else { zombies.predict(zb, d, fx0 * speed * 0.85, 3 + speed * 0.22, fz0 * speed * 0.85, simTime, null, 'vehicle'); net!.hit({ w: zombies.netId(zb), d: r2(d), zone: 0, k: kindIndex('vehicle'), wp: WEAPON_CODES.indexOf('car'), dx: r3(fx0), dz: r3(fz0), f: r2(speed * 0.85), sx: r2(me.x), sz: r2(me.z) }); }
      }
      mutants?.near(x, z, radius + 1, (m) => {
        if (sim()) mutants!.damage(m.i, Math.min(220, speed * 4), 'body', 0, { x: me.x, z: me.z }, 'vehicle', selfSlot, simTime);
        else net!.hit({ w: MUTANT_ID_BASE + m.i, d: r2(Math.min(220, speed * 4)), zone: 0, k: kindIndex('vehicle'), wp: WEAPON_CODES.indexOf('car'), dx: r3(fx0), dz: r3(fz0), f: r2(speed), sx: r2(me.x), sz: r2(me.z) });
      });
      return hits.length;
    },
    /** A punch: the first zombie within reach. */
    melee(cx: number, cz: number, r: number, damage: number, fx0: number, fz0: number, at: THREE.Vector3 | null) {
      let target: Zombie | null = null;
      zombies.near(cx, cz, r, (zb) => { if (!target) target = zb; });
      const zb = target as Zombie | null;
      if (!zb) return false;
      this.hit({ t: 0, zombie: zb, mutant: null, head: false }, damage, 'melee', 'fists', dirV.set(fx0, 0, fz0), 7, at);
      return true;
    },
    /** Gunfire and footsteps: zombies come to look (hunters remember where). */
    hear(x: number, z: number, r: number) { if (sim()) zombies.hearAt(x, z, r, 1, simTime); },
    receive(m: ZombieServerMessage) {
      if (!net) return;
      if (m.type === 'zrole') {
        hostId = m.host;
        const r = net.onRole(m, selfId);
        if (r === 'promoted') promote();
        else if (r === 'demoted') demote();
        return;
      }
      const wasHost = net.isHost;
      net.receive(m);
      if (wasHost && !net.isHost) demote(); // superseded by a newer host's frames (zombie-net)
    },
    onReady(info: { mode?: string; slot?: number; serverTime: number; reconnect: boolean }) {
      net?.onReady({ slot: info.slot, serverTime: info.serverTime });
      if (info.slot !== undefined && info.slot >= 0 && info.slot < 8) selfSlot = info.slot;
    },
    onServerTime(t: number) { net?.observe(t); },
    onClose(code: number) { net?.noteClose(code); },
    takeOutgoing(maxBytes: number): ZombieClientMessage[] { return running ? net?.takeOutgoing(maxBytes) ?? [] : []; },
    /** Fields this player's PlayerState carries in a zombie room. */
    playerFields(): ZombiePlayerFields {
      const hold = deps.hold();
      let rv = -1, rvp = 0;
      if (hold?.id.startsWith('zrevive:')) { rv = Number(hold.id.slice(8)); rvp = hold.progress; }
      else if (hold?.id.startsWith('zdog:')) { const s = Number(hold.id.slice(5)); if (s >= 0) { rv = 8 + s; rvp = hold.progress; } }
      return {
        zd, bleed: zd === 1 ? Math.max(0, Math.round((bleedUntil - nowMs) / 100) / 10) : 0, rv, rvp: Math.round(rvp * 100) / 100,
        cam: Math.round(camYaw * 1000) / 1000, quiet: me.quiet, dog: companions.netState(),
      };
    },
    hud,
    dogCommand(cmd: DogCommand) {
      const text = companions.command(cmd, simTime);
      if (text) deps.notify(text, 1800);
    },
    /** X: bandage the dog when it is hurt and close, else yourself (+35). */
    bandage(): string | null {
      if (bandages <= 0) return 'Hết băng · nhặt thêm ở tiếp tế hoặc thùng của quái đột biến';
      const dog = companions.own();
      if (dog && dog.life !== 'away' && Math.hypot(dog.x - me.x, dog.z - me.z) < 2.2 && (dog.life === 'down' || dog.hp < 120) && companions.bandage()) {
        bandages--;
        return `Đã băng bó cho chó (còn ${bandages} cuộn băng)`;
      }
      if (me.health >= 100) return 'Bạn đang khỏe, không cần băng bó';
      bandages--;
      deps.healPlayer(35);
      return `Tự băng bó · +35 máu (còn ${bandages} cuộn băng)`;
    },
    /** Spectating: which teammate to watch (Q/E), and where the camera should be. */
    spectateNext(step: number) {
      const up = peers.filter((p) => !p.zd && !p.down && p.slot !== undefined);
      if (!up.length) { watching = null; return; }
      const i = Math.max(0, up.findIndex((p) => p.slot === watching));
      watching = up[(i + step + up.length) % up.length].slot!;
    },
    spectateTarget(): { x: number; z: number } | null {
      if (zd !== 2 || watching === null) return null;
      const p = peerBySlot.get(watching);
      return p ? { x: p.x, z: p.z } : null;
    },
    /** In a shop or hospital mid-wave (A11): refused while a wave is on. */
    shopsOpen() {
      const phase = sim() ? director.phase : net?.director()?.phase ?? 'prep';
      return phase !== 'wave';
    },
    /** Supply for a mutant crate or a wave clear is the caller's; this counts bandages. */
    addBandages(n: number) { bandages += n; },
    /** "Chơi lại ngay" on the game-over card. */
    requestRestart() {
      if (sim()) { if (director.phase === 'over') { director.restart(dirTime()); emit({ k: 'wave', n: 0, p: 'restart' }); } }
      else net?.command({ c: 'restart' });
    },
    /** "Bắt đầu" on the online waiting card: the first wave in 3 s, whoever presses it. */
    requestStart() {
      if (sim()) director.startSoon(dirTime());
      else net?.command({ c: 'start' });
    },
    /** Quality level 0-5 (mutant growths drop at 4 and up). */
    setDetail(level: number) { mutants?.setDetail(level); companions.setDetail(level); },
    // ---- __pvo.z (§7.2, localhost) ----
    test: {
      state: () => {
        const s = sim() ? director.stats(dirTime()) : null, d = net?.director();
        return {
          mode: running ? 'zombie' : 'city', online, host: sim(), epoch: net?.epoch ?? 0, slot: selfSlot,
          wave: s?.wave ?? d?.wave ?? 0, phase: s?.phase ?? d?.phase ?? 'prep', alive: zombies.alive(), mutants: mutants?.list().length ?? 0, kills: s?.kills ?? d?.kills ?? 0, zd, bandages,
        };
      },
      list: () => zombies.list().map((z) => ({ id: zombies.netId(z), kind: z.kind, state: z.state, x: Math.round(z.x * 100) / 100, z: Math.round(z.z * 100) / 100, hp: Math.round(z.health) })),
      mutants: () => mutants?.list() ?? [],
      spawn: (kind: ZombieKind, x?: number, z?: number, how: SpawnHow = 'door') => {
        if (!sim()) return -1;
        const zb = x === undefined || z === undefined ? zombies.spawnNear(kind, me.x, me.z, how, scalingNow(), simTime) : zombies.spawnAt(kind, x, z, how, scalingNow(), simTime, 0, { x: me.x, z: me.z });
        if (zb) director.onSummon(1);
        return zb ? zombies.netId(zb) : -1;
      },
      mutant: (kind: MutantKind, x?: number, z?: number, withQuake = true) => {
        if (!sim() || !mutants) return -1;
        const spot = x === undefined || z === undefined ? placeMutant(kind) : { x, z };
        if (withQuake) emit({ k: 'quake', x: r2(spot.x), z: r2(spot.z), r: 60, t: 6, kind });
        const id = mutants.spawn(kind, spot.x, spot.z, mutantHp(kind, Math.max(1, director.wave), director.n), kind === 'leaper' ? 'drop' : kind === 'matriarch' ? 'crater' : 'emerge', simTime);
        emit({ k: 'spawn', w: MUTANT_ID_BASE + Math.max(0, id), how: 'emerge', x: r2(spot.x), z: r2(spot.z) });
        return id;
      },
      wave: (n: number) => {
        if (!sim()) return;
        zombies.clear();
        mutants?.stop();
        director.resume(Math.max(1, n), dirTime(), 0.2);
      },
      clear: () => { if (sim()) { zombies.clear(); mutants?.stop(); } },
      /** Ends the wave at once (tests): nothing more comes and everything standing goes. */
      win: () => { if (sim()) { director.finish(); zombies.clear(); mutants?.stop(); } },
      god: (on: boolean) => { invulnerableUntil = on ? Infinity : 0; },
      down: () => { deps.damagePlayer(1000, null, 'Thử nghiệm'); },
      dog: () => { const h = companions.hud(simTime), o = companions.own(); return h && o ? { ...h, x: o.x, z: o.z } : null; },
      dogHit: (amount: number) => companions.damage(amount, { x: me.x + 1, z: me.z }, amount >= 25, simTime),
      ruins: () => {
        const p = apocalypse?.plan, s = apocalypse?.stats();
        return { hash: p?.hash ?? 0, items: p?.items.length ?? 0, colliders: s?.colliders ?? 0, chunks: s?.chunks ?? 0, calls: s?.calls ?? 0, triangles: s?.triangles ?? 0 };
      },
      net: () => net?.stats() ?? null,
      seen: (x: number, z: number) => world.seen(x, z, deps.ground(x, z) + 1.5),
      /** A display specimen beside the player (2.4 m to the screen's right, a little ahead), facing the camera. */
      look: (kind: ZombieKind, index = 0) => {
        const fx0 = Math.sin(camYaw), fz0 = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
        zombies.specimen(kind, me.x + fx0 * 0.8 + rx * 2.4, me.z + fz0 * 0.8 + rz * 2.4, Math.atan2(-fx0, -fz0), index, simTime);
      },
      draw: () => zombies.drawStats(),
      events: () => evLog.splice(0),
      health: () => Math.round(me.health),
      heal: () => { deps.healPlayer(1000); governor.reset(); },
      fx: () => fx.stats(),
    },
  };
  const dirV = new THREE.Vector3();
  return api;
}
export type ZombieCoop = ReturnType<typeof createZombieCoop>;
