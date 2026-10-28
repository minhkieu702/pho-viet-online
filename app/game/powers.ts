export type HeroId = 'none' | 'ironman' | 'thor' | 'hulk' | 'captain';
export type HeroPower = Exclude<HeroId, 'none'>;
export const HEROES: { id: HeroId; name: string; powerName: string; description: string; color: string; cooldown: number }[] = [
  { id: 'none', name: 'Người dân', powerName: 'Không dùng sức mạnh', description: 'Khám phá khu phố theo cách quen thuộc.', color: '#e77641', cooldown: 0 },
  { id: 'ironman', name: 'Iron Man', powerName: 'Tia phản lực', description: 'Bắn tia năng lượng. G để bay hoặc hạ cánh, Shift để tăng tốc.', color: '#f3b847', cooldown: 2.8 },
  { id: 'thor', name: 'Thor', powerName: 'Triệu hồi sấm sét', description: 'Gọi sét đánh vào mục tiêu phía trước, gây sát thương quanh điểm chạm.', color: '#76dcff', cooldown: 5.5 },
  { id: 'hulk', name: 'Hulk', powerName: 'Cú đập chấn động', description: 'Đập đất, đánh bật những mục tiêu đứng gần.', color: '#8de467', cooldown: 6.5 },
  { id: 'captain', name: 'Captain America', powerName: 'Khiên boomerang', description: 'Ném khiên về phía trước rồi thu về; mỗi mục tiêu bị trúng một lần.', color: '#80b7ff', cooldown: 3.8 },
];
export type PowerHud = { hero: HeroId; cooldown: number; cooldownTotal: number; energy: number; flying: boolean; altitude: number; blocked: boolean };
export function initialPowerHud(): PowerHud { return { hero: 'none', cooldown: 0, cooldownTotal: 0, energy: 100, flying: false, altitude: 0, blocked: false }; }
export const POWER_COST: Record<HeroPower, number> = { ironman: 16, thor: 26, hulk: 30, captain: 18 };
export const POWER_RANGE: Record<HeroPower, number> = { ironman: 24, thor: 22, hulk: 7, captain: 18 };
export const SHIELD_DURATION = 1.25;
export const MAX_ALTITUDE = 8;
// Room snapshots accept the same endpoint heights: flight plus a full upward/downward cast.
export const POWER_HEIGHT_BOUNDS = { min: -32, max: 48 };
export type PowerPoint = { x: number; y: number; z: number };

/** Preserve elevation while limiting a cast by its true 3D reach and obstacle ray. */
export function resolvePowerTarget(from: PowerPoint, target: PowerPoint, range: number, trace: (direction: PowerPoint, distance: number) => number = (_direction, distance) => distance): PowerPoint {
  const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-8) return { ...from };
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  const distance = Math.min(range, length);
  const reach = Math.max(0, Math.min(distance, trace(direction, distance)));
  return { x: from.x + direction.x * reach, y: from.y + direction.y * reach, z: from.z + direction.z * reach };
}

/** Stop at the first world boundary along the aim ray; clamping coordinates separately bends a beam. */
export function clipPowerTarget(from: PowerPoint, to: PowerPoint, min: PowerPoint, max: PowerPoint): PowerPoint {
  let fraction = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = to[axis] - from[axis];
    if (delta > 0 && to[axis] > max[axis]) fraction = Math.min(fraction, (max[axis] - from[axis]) / delta);
    else if (delta < 0 && to[axis] < min[axis]) fraction = Math.min(fraction, (min[axis] - from[axis]) / delta);
  }
  fraction = Math.max(0, fraction);
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction, z: from.z + (to.z - from.z) * fraction };
}

/** Simulation seconds keep cooldown/energy consistent when a frame is delayed. */
export function createPowerState() {
  let hero: HeroId = 'none', energy = 100, flying = false, altitude = 0;
  const remaining: Record<HeroId, number> = { none: 0, ironman: 0, thor: 0, hulk: 0, captain: 0 };
  return {
    get hero() { return hero; }, get altitude() { return altitude; }, get flying() { return flying; },
    select(id: HeroId) {
      if (!HEROES.some((entry) => entry.id === id) || altitude > 0.05) return false;
      hero = id; flying = false; return true;
    },
    cast(blocked = false): HeroPower | null {
      if (blocked || hero === 'none' || remaining[hero] > 0 || energy < POWER_COST[hero]) return null;
      remaining[hero] = HEROES.find((entry) => entry.id === hero)!.cooldown;
      energy -= POWER_COST[hero]; return hero;
    },
    toggleFlight(blocked = false) {
      if (blocked || hero !== 'ironman' || (!flying && energy < 15)) return false;
      flying = !flying; return true;
    },
    stopFlight() { flying = false; },
    land() { flying = false; altitude = 0; },
    step(seconds: number, landingClear = true) {
      const dt = Math.max(0, Math.min(0.1, Number.isFinite(seconds) ? seconds : 0));
      for (const id of Object.keys(remaining) as HeroId[]) remaining[id] = Math.max(0, remaining[id] - dt);
      energy = Math.max(0, Math.min(100, energy + (flying ? -9 : altitude > 0 ? 0 : 13) * dt));
      if (energy <= 0) flying = false;
      const target = flying ? 5.5 : landingClear || altitude === 0 ? 0 : 1.1;
      altitude = Math.max(0, Math.min(MAX_ALTITUDE, altitude + Math.sign(target - altitude) * Math.min(Math.abs(target - altitude), dt * 5)));
    },
    hud(blocked = false): PowerHud {
      return { hero, cooldown: Math.ceil(remaining[hero] * 10) / 10, cooldownTotal: HEROES.find((entry) => entry.id === hero)!.cooldown, energy: Math.round(energy), flying, altitude: Math.round(altitude * 10) / 10, blocked };
    },
    reset() { hero = 'none'; energy = 100; altitude = 0; flying = false; for (const id of Object.keys(remaining) as HeroId[]) remaining[id] = 0; },
  };
}

/** Distance to a finite beam, including height, so airborne players cannot be hit by a ground-only shockwave. */
export function distanceToPowerSegment(point: PowerPoint, from: PowerPoint, to: PowerPoint) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const length2 = dx * dx + dy * dy + dz * dz;
  const fraction = length2 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) / length2)) : 0;
  return Math.hypot(point.x - from.x - dx * fraction, point.y - from.y - dy * fraction, point.z - from.z - dz * fraction);
}

/** The same trajectory drives rendered shields and swept collision detection. */
export function shieldPosition(from: PowerPoint, to: PowerPoint, seconds: number, home: PowerPoint = from): PowerPoint {
  const phase = Math.max(0, Math.min(1, seconds / SHIELD_DURATION));
  const outward = phase < 0.45;
  const t = outward ? phase / 0.45 : (phase - 0.45) / 0.55;
  const a = outward ? from : to, b = outward ? to : home;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 0.5, z: a.z + (b.z - a.z) * t };
}
