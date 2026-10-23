import * as THREE from 'three';
import { ROADS } from './city';
import type { createRagdolls, RagdollBody, RagdollLook } from './ragdoll';
import type { Car, createVehicles } from './vehicles';
import { FIGURE, FigureBatch, PART, armGeometry, bodyGeometry, figureMaterial, legGeometry, palette, setStyle, styleOf } from './figures';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Vehicles = ReturnType<typeof createVehicles>;
export type CopWeapon = 'baton' | 'taser' | 'pistol' | 'shotgun' | 'smg';
type Officer = {
  index: number;
  state: 'off' | 'seated' | 'chase' | 'return' | 'down';
  car: Car | null;
  x: number;
  z: number;
  yaw: number;
  stride: number;
  health: number;
  maxHealth: number;
  hitAt: number;
  nextShot: number;
  burst: number;
  arrest: number;
  body: RagdollBody | null;
  timer: number;
  pace: number;
  chatterAt: number;
  weapon: CopWeapon;
  swat: boolean;
};
export type PoliceShot = { from: THREE.Vector3; hit: boolean; damage: number; kind: CopWeapon };
export type PlayerView = { x: number; z: number; car: Car | null; riding: boolean; heading: number; speed: number; down: boolean; stunned: boolean };
type Spike = { x: number; z: number; alongX: boolean; until: number };

const OFFICERS = 16;
const MAX_SPIKES = 4;
const LINES = {
  chase: ['Đứng lại!', 'Cảnh sát đây!', 'Giơ tay lên!', 'Không chạy được đâu!'],
  arrest: ['Anh bị bắt!', 'Đưa tay ra sau!'],
  surround: ['Bao vây nó!', 'Chặn bên kia!', 'Vòng ra sau!'],
  spikes: ['Rải đinh!', 'Chặn đường nó lại!'],
};
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const SCALE = 0.84;
const HIT_RADIUS = 0.4;
const HEIGHT = 1.8;
const LOOK: RagdollLook = { shirt: '#2c3e66', pants: '#1f2a40', skin: '#d3a179', helmet: '#1f2a40' };
const SWAT_LOOK: RagdollLook = { shirt: '#1d2024', pants: '#16181b', skin: '#d3a179', helmet: '#101214' };
const RAGDOLL_SCALE = 0.72;
// Range, time between shots, hit chance and damage for each police weapon.
const GUNS: Record<Exclude<CopWeapon, 'baton'>, { range: number; cooldown: number; chance: number; damage: number }> = {
  taser: { range: 8, cooldown: 2.6, chance: 0.55, damage: 3 },
  pistol: { range: 30, cooldown: 1.2, chance: 0.3, damage: 11 },
  shotgun: { range: 15, cooldown: 1.5, chance: 0.5, damage: 22 },
  smg: { range: 34, cooldown: 1.3, chance: 0.22, damage: 7 },
};

/**
 * Wanted level, police dispatch and officers on foot. Crimes raise heat; enough heat adds stars.
 * The response escalates with the stars: tasers and batons, then pistols, shotguns and SWAT with
 * SMGs; spike strips ahead of a fleeing vehicle, roadblocks at junctions, and officers who spread
 * out to surround the player and keep their distance when armed.
 */
export function createPolice(
  scene: THREE.Scene,
  vehicles: Vehicles,
  ragdolls: Ragdolls,
  world: { clear: (x: number, z: number, radius: number) => boolean; sight: (x1: number, z1: number, x2: number, z2: number) => boolean; ground: (x: number, z: number) => number },
  say: (key: string, text: string, at: () => { x: number; y: number; z: number } | null) => void = () => {},
) {
  let wanted = 0;
  let heat = 0;
  let lastSeen = 0;
  let dispatchAt = 0;
  let spikeAt = 0;
  let blockAt = 0;
  const spikes: Spike[] = [];
  const officers: Officer[] = Array.from({ length: OFFICERS }, (_, index) => ({
    index, state: 'off', car: null, x: 0, z: 0, yaw: 0, stride: 0, health: 80, maxHealth: 80, hitAt: -99, nextShot: 0, burst: 0, arrest: 0,
    body: null, timer: 0, pace: 0, chatterAt: 0, weapon: 'baton', swat: false,
  }));

  // Officers are three figure meshes (body, legs, arms) shared by the whole force, plus the spike strips.
  const material = figureMaterial();
  const bodies = new FigureBatch(bodyGeometry('police'), material, OFFICERS);
  const legs = new FigureBatch(legGeometry(), material, OFFICERS * 2);
  const arms = new FigureBatch(armGeometry(true), material, OFFICERS * 2);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const spikeMaterial = new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.4, metalness: 0.7 });
  const spikeMesh = new THREE.InstancedMesh(box, spikeMaterial, MAX_SPIKES * 2);
  const color = new THREE.Color();
  // Regular officers: peaked cap with a red band, short sleeves, duty belt. SWAT: helmet, vest, long sleeves.
  setStyle(LOOK, { mask: PART.DOME | PART.CAP | PART.KIT, hair: '#1d1916', accent: LOOK.helmet!, forearm: 'skin', shin: 'pants', shoes: '#15171a', width: 1.04, height: 1.01 });
  setStyle(SWAT_LOOK, { mask: PART.SWAT | PART.VEST, hair: '#1d1916', accent: SWAT_LOOK.helmet!, forearm: 'shirt', shin: 'pants', shoes: '#121315', width: 1.12, height: 1.02 });
  const WEAPON_PART: Record<CopWeapon, number> = { baton: PART.BATON, taser: PART.TASER, pistol: PART.PISTOL, shotgun: PART.RIFLE, smg: PART.RIFLE };
  const looks = officers.map(() => ({ body: new Float32Array(16), legs: new Float32Array(16), armL: new Float32Array(16), armR: new Float32Array(16) }));
  function paint(o: Officer) {
    const look = o.swat ? SWAT_LOOK : LOOK;
    const style = styleOf(look);
    const p = looks[o.index];
    const forearm = style.forearm === 'skin' ? look.skin : look.shirt;
    palette([look.shirt, look.pants, look.skin, style.hair, style.accent], style.mask, p.body);
    palette([look.pants, look.pants, style.shoes], PART.STRAIGHT, p.legs);
    palette([look.shirt, forearm, look.skin], 0, p.armL);
    // The weapon in the right hand: a baton, a taser, a pistol or a long gun.
    palette([look.shirt, forearm, look.skin], WEAPON_PART[o.weapon], p.armR);
  }
  officers.forEach(paint);
  for (let i = 0; i < MAX_SPIKES * 2; i++) spikeMesh.setColorAt(i, color.set(i % 2 ? '#e0b030' : '#8a9096'));
  spikeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spikeMesh.frustumCulled = false;
  if (spikeMesh.instanceColor) spikeMesh.instanceColor.needsUpdate = true;
  for (const mesh of [bodies.mesh, legs.mesh, arms.mesh, spikeMesh]) scene.add(mesh);
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  const euler = new THREE.Euler(), yAxis = new THREE.Vector3(0, 1, 0);
  // A limb hanging from its pivot, swung forward by `angle` and turned inward by `twist`.
  const limb = (batch: FigureBatch, px: number, py: number, angle: number, look: Float32Array, twist = 0) => {
    local.compose(pos.set(px, py, 0), quat.setFromEuler(euler.set(angle, 0, twist)), size.set(1, 1, 1));
    batch.push(out.multiplyMatrices(base, local), look);
  };

  function draw(o: Officer) {
    if (o.state !== 'chase' && o.state !== 'return') return;
    const style = styleOf(o.swat ? SWAT_LOOK : LOOK);
    base.compose(pos.set(o.x, world.ground(o.x, o.z), o.z), quat.setFromAxisAngle(yAxis, o.yaw), size.set(SCALE * style.width, SCALE * style.height, SCALE * style.width));
    const swing = Math.sin(o.stride) * Math.min(0.75, o.pace * 0.12);
    const aiming = o.state === 'chase' && o.weapon !== 'baton';
    const longGun = aiming && o.weapon !== 'taser' && o.weapon !== 'pistol';
    const p = looks[o.index];
    bodies.push(base, p.body);
    limb(legs, -FIGURE.hipX, FIGURE.hipY, swing, p.legs);
    limb(legs, FIGURE.hipX, FIGURE.hipY, -swing, p.legs);
    limb(arms, -FIGURE.shoulderX, FIGURE.shoulderY, longGun ? -1.3 : -swing * 0.8, p.armL, longGun ? 0.45 : 0);
    limb(arms, FIGURE.shoulderX, FIGURE.shoulderY, aiming ? -1.5 : o.weapon === 'baton' && o.state === 'chase' ? -0.6 : swing * 0.8, p.armR);
  }

  function crewOf(car: Car) { return officers.filter((o) => o.car === car && o.state !== 'off'); }

  function knock(o: Officer, vx: number, vy: number, vz: number, time: number) {
    o.state = 'down';
    o.timer = time + 9;
    o.body = ragdolls.spawn({ x: o.x, y: world.ground(o.x, o.z), z: o.z, yaw: o.yaw, scale: RAGDOLL_SCALE, look: o.swat ? SWAT_LOOK : LOOK, velocity: { x: vx, y: vy, z: vz } });
    return o.body;
  }

  function crime(severity: number, time: number) {
    heat += severity;
    wanted = Math.min(5, Math.max(wanted, 1, 1 + Math.floor(heat / 4)));
    lastSeen = time;
  }

  function standDown() {
    wanted = 0;
    heat = 0;
    for (const o of officers) if (o.state === 'chase') o.state = 'return';
  }

  /** Everything vanishes at once, used after an arrest or when the player is downed and respawns. */
  function reset() {
    standDown();
    for (const o of officers) {
      if (o.body) ragdolls.remove(o.body);
      Object.assign(o, { state: 'off', car: null, body: null, arrest: 0 });
    }
    for (const car of vehicles.cars) if (car.kind === 'police' && car.mode !== 'player') car.mode = 'off';
    spikes.length = 0;
  }

  /** Equipment and toughness follow the wanted level when an officer is sent out. */
  function equip(o: Officer, car: Car) {
    const swat = wanted >= 4 && Math.random() < 0.7;
    const weapon: CopWeapon = wanted <= 1 ? (Math.random() < 0.5 ? 'taser' : 'baton')
      : wanted === 2 ? (Math.random() < 0.8 ? 'pistol' : 'taser')
      : wanted === 3 ? (Math.random() < 0.5 ? 'shotgun' : 'pistol')
      : swat ? 'smg' : 'shotgun';
    const maxHealth = swat ? 140 : 80;
    Object.assign(o, { state: 'seated', car, health: maxHealth, maxHealth, arrest: 0, body: null, hitAt: -99, weapon, swat, burst: 0 });
    paint(o);
  }

  function step(o: Officer, tx: number, tz: number, speed: number, dt: number, face?: { x: number; z: number }) {
    const dx = tx - o.x, dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    // Turn smoothly toward where they look (the player when armed) and ease into running.
    const look = face ? Math.atan2(face.x - o.x, face.z - o.z) : Math.atan2(dx, dz);
    o.yaw += Math.atan2(Math.sin(look - o.yaw), Math.cos(look - o.yaw)) * (1 - Math.exp(-dt * 8));
    o.pace = THREE.MathUtils.damp(o.pace, d > 0.3 ? speed : 0, 5, dt);
    if (d < 0.05) return d;
    const mx = dx / d * o.pace * dt, mz = dz / d * o.pace * dt;
    const r = 0.32;
    if (world.clear(o.x + mx, o.z + mz, r) && !vehicles.blocked(o.x + mx, o.z + mz, r)) { o.x += mx; o.z += mz; }
    else {
      if (world.clear(o.x + mx, o.z, r) && !vehicles.blocked(o.x + mx, o.z, r)) o.x += mx;
      if (world.clear(o.x, o.z + mz, r) && !vehicles.blocked(o.x, o.z + mz, r)) o.z += mz;
    }
    o.stride += o.pace * dt * 2.6;
    return d;
  }

  /** The road line the player is driving along, if any: axis of travel and the road's coordinate. */
  function roadOf(player: PlayerView) {
    const alongX = Math.abs(Math.sin(player.heading)) > Math.abs(Math.cos(player.heading));
    const cross = alongX ? player.z : player.x;
    const road = ROADS.reduce((best, r) => (Math.abs(r - cross) < Math.abs(best - cross) ? r : best), ROADS[0]);
    return Math.abs(road - cross) < 9 ? { alongX, road, dir: Math.sign(alongX ? Math.sin(player.heading) : Math.cos(player.heading)) || 1 } : null;
  }

  /** Lays a spike strip across the player's road some way ahead. */
  function deploySpikes(player: PlayerView, time: number) {
    const lane = roadOf(player);
    if (!lane) return false;
    const ahead = (lane.alongX ? player.x : player.z) + lane.dir * (40 + Math.random() * 20);
    if (Math.abs(ahead) > Math.max(...ROADS) + 20) return false;
    if (spikes.length >= MAX_SPIKES) spikes.shift();
    spikes.push(lane.alongX ? { x: ahead, z: lane.road, alongX: true, until: time + 45 } : { x: lane.road, z: ahead, alongX: false, until: time + 45 });
    return true;
  }

  /** Two cruisers parked across the road at the next junction ahead, crews out. */
  function roadblock(player: PlayerView) {
    const lane = roadOf(player);
    if (!lane) return false;
    const now = lane.alongX ? player.x : player.z;
    const junction = ROADS.filter((r) => (r - now) * lane.dir > 35 && (r - now) * lane.dir < 95).sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
    if (junction === undefined) return false;
    let placed = 0;
    for (const side of [-1, 1]) {
      const x = lane.alongX ? junction - lane.dir * 6 : lane.road + side * 3.2;
      const z = lane.alongX ? lane.road + side * 3.2 : junction - lane.dir * 6;
      const car = vehicles.placePolice(x, z, lane.alongX ? 0 : Math.PI / 2);
      if (!car) continue;
      placed++;
      let crew = 0;
      for (const o of officers) {
        if (crew === 2) break;
        if (o.state !== 'off') continue;
        equip(o, car);
        crew++;
      }
    }
    return placed > 0;
  }

  return {
    get wanted() { return wanted; },
    crime,
    reset,
    /** True when (x, z) is on a spike strip; the strip is used up. */
    onSpikes(x: number, z: number) {
      for (let i = 0; i < spikes.length; i++) {
        const s = spikes[i];
        const inside = s.alongX ? Math.abs(x - s.x) < 0.8 && Math.abs(z - s.z) < 7.2 : Math.abs(z - s.z) < 0.8 && Math.abs(x - s.x) < 7.2;
        if (inside) { spikes.splice(i, 1); return true; }
      }
      return false;
    },
    /** Pedestrian-style hit test against officers on foot. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { officer: Officer; t: number } | null = null;
      for (const o of officers) {
        if (o.state !== 'chase' && o.state !== 'return') continue;
        const rx = origin.x - o.x, rz = origin.z - o.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const b = 2 * (rx * dir.x + rz * dir.z), c = rx * rx + rz * rz - HIT_RADIUS * HIT_RADIUS;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
        const y = origin.y + dir.y * t;
        if (t > 0 && t < maxT && y > 0 && y < HEIGHT && (!best || t < best.t)) best = { officer: o, t };
      }
      return best;
    },
    near(x: number, z: number, radius: number, callback: (o: Officer) => void) {
      for (const o of officers) if ((o.state === 'chase' || o.state === 'return') && (o.x - x) ** 2 + (o.z - z) ** 2 < radius * radius) callback(o);
    },
    /** Applies damage; officers drop as ragdolls at zero health. Attacking police is always a crime. */
    damage(o: Officer, amount: number, vx: number, vy: number, vz: number, time: number, force = false) {
      o.health -= o.swat ? amount * 0.7 : amount;
      o.hitAt = time;
      crime(3, time);
      if (o.health <= 0 || force) { knock(o, vx, vy, vz, time); return true; }
      return false;
    },
    forEachUnit(callback: (x: number, z: number, onFoot: boolean) => void) {
      for (const o of officers) if (o.state === 'chase' || o.state === 'return') callback(o.x, o.z, true);
      for (const car of vehicles.cars) if (car.kind === 'police' && (car.mode === 'chase' || car.mode === 'hold')) callback(car.x, car.z, false);
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const o of officers) if ((o.state === 'chase' || o.state === 'return') && time - o.hitAt < 4) callback(o.x, HEIGHT + 0.35, o.z, Math.max(0, o.health) / o.maxHealth);
    },
    update(dt: number, time: number, player: PlayerView) {
      const shots: PoliceShot[] = [];
      let strikes = 0;
      let arrested = false;
      let spiked = false;
      let blocked = false;
      const inVehicle = player.riding;
      // Dispatch more cruisers as the wanted level climbs.
      if (wanted > 0 && time > dispatchAt) {
        dispatchAt = time + 1.5;
        const active = vehicles.cars.filter((c) => c.kind === 'police' && (c.mode === 'chase' || c.mode === 'hold')).length;
        // More cruisers, bigger crews and closer spawns as the stars climb.
        if (active < [0, 1, 2, 3, 4, 6][wanted]) {
          const car = vehicles.spawnPolice(player.x, player.z, 50 - wanted * 4, 90);
          if (car) {
            let crew = 0;
            for (const o of officers) {
              if (crew === (wanted >= 4 ? 3 : 2)) break;
              if (o.state !== 'off') continue;
              equip(o, car);
              crew++;
            }
          }
        }
      }
      // Tactics against a fleeing vehicle: spike strips from two stars, roadblocks from three.
      if (wanted >= 2 && inVehicle && player.speed > 7 && time > spikeAt) {
        spikeAt = time + Math.max(6, 14 - wanted * 2);
        spiked = deploySpikes(player, time);
      }
      if (wanted >= 3 && inVehicle && player.speed > 6 && time > blockAt) {
        blockAt = time + Math.max(18, 34 - wanted * 3);
        blocked = roadblock(player);
      }
      for (let i = spikes.length - 1; i >= 0; i--) if (time > spikes[i].until) spikes.splice(i, 1);
      vehicles.updatePolice(dt, time, player.x, player.z, player.car, wanted);
      let seen = false;
      for (const car of vehicles.cars) {
        if (car.kind !== 'police') continue;
        if ((car.mode === 'chase' || car.mode === 'hold') && Math.hypot(car.x - player.x, car.z - player.z) < 45 + wanted * 6) seen = true;
        // A stopped cruiser lets its crew out on both sides.
        if (car.mode === 'hold' && wanted > 0) {
          for (const o of crewOf(car)) {
            if (o.state !== 'seated') continue;
            const side = o.index % 2 ? 1 : -1;
            o.x = car.x + Math.cos(car.yaw) * 1.6 * side;
            o.z = car.z - Math.sin(car.yaw) * 1.6 * side;
            o.yaw = car.yaw;
            o.pace = 0;
            o.state = 'chase';
            if (o.index % 2 === 0) say(`cop${o.index}`, pick(LINES.chase), () => (o.state === 'chase' ? { x: o.x, y: 2.1, z: o.z } : null));
          }
        }
        if (car.mode === 'hold') {
          const crew = crewOf(car);
          const aboard = crew.every((o) => o.state === 'seated');
          if (crew.length === 0) car.mode = 'parked';
          else if (aboard) {
            car.mode = wanted > 0 ? 'chase' : 'leave';
            car.timer = time + 25;
          }
        }
        if (car.mode === 'off') for (const o of crewOf(car)) if (o.state === 'seated') o.state = 'off';
      }
      const fleeing = inVehicle && player.speed > 7;
      // Lead the target a little: aim where a moving player will be.
      const leadX = player.x + Math.sin(player.heading) * player.speed * 0.35;
      const leadZ = player.z + Math.cos(player.heading) * player.speed * 0.35;
      const chasers = officers.filter((o) => o.state === 'chase');
      for (const batch of [bodies, legs, arms]) batch.begin();
      for (const o of officers) {
        if (o.state === 'down') {
          if (time > o.timer || !o.body || o.body.removed) {
            if (o.body) ragdolls.remove(o.body);
            Object.assign(o, { state: 'off', body: null, car: null });
          }
        } else if (o.state === 'chase') {
          const d = Math.hypot(player.x - o.x, player.z - o.z);
          if (d < 40 + wanted * 5) seen = true;
          const carGone = !o.car || o.car.mode === 'player' || o.car.mode === 'off' || o.car.mode === 'parked';
          if (wanted === 0 || (fleeing && d > 12 && !carGone)) o.state = 'return';
          else if (carGone && d > 60) o.state = 'off';
          else {
            // Ranged officers spread around the player at a firing distance; melee and tasers close in.
            // Anyone may move in to cuff once the player is stunned, stopped or down to their last legs.
            const gun = o.weapon === 'baton' ? null : GUNS[o.weapon];
            const helpless = player.stunned || (!inVehicle && player.speed < 0.6 && wanted <= 2);
            const keep = !gun || helpless ? 0 : o.weapon === 'taser' ? 5 : o.weapon === 'shotgun' ? 7 : 11;
            const slot = chasers.indexOf(o) / Math.max(1, chasers.length) * Math.PI * 2 + player.heading;
            const tx = keep ? leadX + Math.sin(slot) * keep : player.x, tz = keep ? leadZ + Math.cos(slot) * keep : player.z;
            step(o, tx, tz, 5 + wanted * 0.35 + (o.swat ? 0.3 : 0), dt, { x: player.x, z: player.z });
            o.chatterAt -= dt;
            if (o.chatterAt <= 0 && d < 25) {
              o.chatterAt = 5 + Math.random() * 6;
              const lines = d < 3 ? LINES.arrest : chasers.length > 2 && Math.random() < 0.4 ? LINES.surround : LINES.chase;
              say(`cop${o.index}`, pick(lines), () => (o.state === 'chase' ? { x: o.x, y: 2.1, z: o.z } : null));
            }
            const reach = inVehicle ? 2.0 : 1.05;
            const canCuff = !player.down && d < reach && (!inVehicle || player.speed < 1.5);
            o.arrest = canCuff ? o.arrest + dt * (player.stunned ? 2 : 1) : Math.max(0, o.arrest - dt);
            if (o.arrest > 1.3) arrested = true;
            // Up close they swing a baton, which also stops the player from simply walking off.
            if (!player.down && !inVehicle && d < 1.3 && time > o.nextShot && (o.weapon === 'baton' || Math.random() < 0.4)) {
              o.nextShot = time + 1.1 + Math.random() * 0.5;
              strikes++;
            }
            if (gun && !player.down && d < gun.range && d > 1.6 && time > o.nextShot && world.sight(o.x, o.z, player.x, player.z)) {
              // SMGs fire short bursts; everything else single shots.
              if (o.weapon === 'smg' && o.burst < 2) { o.burst++; o.nextShot = time + 0.11; }
              else { o.burst = 0; o.nextShot = time + gun.cooldown * (1 - wanted * 0.06) + Math.random() * 0.6; }
              const moving = inVehicle && player.speed > 8 ? 0.5 : 1;
              const near = o.weapon === 'shotgun' ? Math.max(0.3, 1 - d / gun.range) : 1;
              shots.push({ from: new THREE.Vector3(o.x + Math.sin(o.yaw) * 0.6, 1.35, o.z + Math.cos(o.yaw) * 0.6), hit: Math.random() < (gun.chance + wanted * 0.03) * moving, damage: gun.damage * near, kind: o.weapon });
            }
          }
        } else if (o.state === 'return') {
          const car = o.car;
          if (!car || car.mode === 'player' || car.mode === 'off' || car.mode === 'parked') { o.state = 'off'; continue; }
          if (step(o, car.x, car.z, 5, dt) < 2.2) o.state = 'seated';
        }
        draw(o);
      }
      // Spike strips: a steel bar with a yellow warning edge.
      for (let i = 0; i < MAX_SPIKES; i++) {
        const s = spikes[i];
        for (let k = 0; k < 2; k++) {
          if (!s) { spikeMesh.setMatrixAt(i * 2 + k, hidden); continue; }
          const y = world.ground(s.x, s.z) + (k ? 0.1 : 0.06);
          local.compose(pos.set(s.x, y, s.z), quat.identity(), s.alongX ? size.set(k ? 0.12 : 0.6, k ? 0.05 : 0.12, 14) : size.set(14, k ? 0.05 : 0.12, k ? 0.12 : 0.6));
          spikeMesh.setMatrixAt(i * 2 + k, local);
        }
      }
      for (const batch of [bodies, legs, arms]) batch.end();
      spikeMesh.instanceMatrix.needsUpdate = true;
      if (spiked) say('spikes', pick(LINES.spikes), () => null);
      // Lose the police by staying out of sight long enough.
      if (seen) lastSeen = time;
      if (wanted > 0 && time - lastSeen > 6 + 3 * wanted) standDown();
      return { shots, strikes, arrested, evading: wanted > 0 && !seen, spiked, blocked };
    },
    dispose() {
      for (const batch of [bodies, legs, arms]) { scene.remove(batch.mesh); batch.dispose(); }
      scene.remove(spikeMesh);
      spikeMesh.dispose();
      material.dispose();
      spikeMaterial.dispose();
      box.dispose();
    },
  };
}
