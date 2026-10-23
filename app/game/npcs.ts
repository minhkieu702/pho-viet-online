import * as THREE from 'three';
import { BUILDINGS, POIS, type Building, type Poi } from './city';
import { createNav, type Waypoint } from './nav';
import type { createRagdolls, RagdollBody, RagdollLook } from './ragdoll';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Role = 'worker' | 'student' | 'retiree' | 'vendor' | 'owl' | 'gang' | 'thief';
type Place = { building: Building; inside: boolean } | { poi: Poi };
type Activity = { start: number; end: number; kind: 'home' | 'work' | 'eat' | 'leisure' | 'school' | 'market' | 'hang'; place: Place; outdoor: boolean };
type State = 'inside' | 'walking' | 'at' | 'afraid' | 'fleeing' | 'chasing' | 'down' | 'away';
type Pose = 'walk' | 'run' | 'idle' | 'sit' | 'hands' | 'fight';
export type Npc = {
  id: number;
  role: Role;
  gang: number;
  home: Building;
  look: RagdollLook;
  schedule: Activity[];
  current: Activity | null;
  state: State;
  inside: Building | null;
  x: number; z: number; y: number; yaw: number; targetYaw: number;
  path: Waypoint[]; pathIndex: number;
  speed: number; pace: number; run: boolean;
  spot: { x: number; z: number; yaw: number; sit: boolean } | null;
  pose: Pose;
  stride: number; swing: number;
  health: number; hitAt: number;
  afraidFor: number; lastAimed: number; robbedDay: number;
  chatterAt: number; checkAt: number; nextAttack: number;
  body: RagdollBody | null; timer: number; pooled: boolean;
};
export type GangShot = { from: THREE.Vector3; hit: boolean };
export type NpcEvents = { robbed: { npc: Npc; amount: number; shop: boolean }[]; strikes: number; shots: GangShot[] };
export type Threat = { x: number; z: number; aimYaw: number; armed: boolean; aiming: boolean; inVehicle: boolean; down: boolean };

const SECONDS_PER_HOUR = 60;
// Model units are ~2.1 m tall; scale to a 1.75 m person.
const BODY_SCALE = 0.82;
const RAGDOLL_SCALE = 0.7;
const HIT_RADIUS = 0.38;
const HEIGHT = 1.85;
const MAX_HEALTH = 60;
const GANG_HEALTH = 90;
const BOXES = 5;
export const GANGS = [
  { name: 'Rắn Đen', shirt: '#26262a', pants: '#3a1f1f', bandana: '#c0392b' },
  { name: 'Hổ Vàng', shirt: '#d8a020', pants: '#2b2b30', bandana: '#1f1f22' },
];
const SHIRTS = ['#db9876', '#86a799', '#d4b164', '#bca5b7', '#8caaa9', '#d18469', '#9fb4d6', '#e0b8a0', '#c96f6f', '#7fa37a', '#e8d6a8', '#6f86a8', '#f0f0ea', '#a57fb0'];
const PANTS = ['#536c69', '#6d5d4f', '#3f4d5c', '#7b6a58', '#4f5a4a', '#2f3a48'];
const SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
const LINES = {
  commute: ['Trễ giờ làm rồi!', 'Sáng nay kẹt xe ghê…', 'Đi làm thôi!', 'Hôm nay thứ mấy ta?'],
  school: ['Hôm nay có kiểm tra toán…', 'Đợi tớ với!', 'Ra chơi đá cầu không?'],
  work: ['Mời vào, mời vào!', 'Hôm nay bán ế quá.', 'Có hàng mới đây!', 'Khách ơi ghé xem đi!'],
  market: ['Rau tươi đây!', 'Cá mới về nè!', 'Mua gì đi em ơi!', 'Bớt chút đi chị!'],
  eat: ['Cho tô phở tái!', 'Một ly cà phê sữa đá!', 'Ngon quá trời!', 'Ăn trưa thôi!'],
  leisure: ['Trời hôm nay đẹp ghê.', 'Tập thể dục cho khỏe!', 'Chiều nay mát quá.', 'Cờ tướng không ông?'],
  home: ['Về nhà nấu cơm thôi.', 'Mệt quá, về ngủ.', 'Tối nay xem phim gì?'],
  rain: ['Mưa rồi, chạy thôi!', 'Quên mang áo mưa…', 'Ướt hết rồi!'],
  night: ['Khuya rồi, về thôi.', 'Phố đêm yên ghê.'],
  afraid: ['Đừng bắn!', 'Tôi đưa tiền, tha cho tôi!', 'Bình tĩnh, bình tĩnh!'],
  robbed: ['Tiền đây! Đừng bắn!', 'Lấy hết đi, tha cho tôi!'],
  flee: ['Cứu với!', 'Có cướp!', 'Chạy mau!', 'Gọi công an đi!'],
  gangCalm: ['Khu này của tụi tao.', 'Nhìn cái gì?', 'Đi chỗ khác chơi.', 'Có thuốc không?'],
  gangAngry: ['Mày tới số rồi!', 'Anh em, xử nó!', 'Dám đụng tụi tao à?', 'Đứng lại đó!'],
  thief: ['Né ra!', 'Không bắt được tao đâu!'],
};
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

/**
 * Residents with daily routines. Everyone lives in a real building, leaves through its door, walks the
 * sidewalks and crosswalks to work, school, lunch or the park, and goes home at night. They fear guns,
 * hand over money when robbed, and flee home from gunfire. Two street gangs hold their corners and fight
 * back when provoked. Every body part is an instance, so the whole crowd is three draw calls.
 */
export function createNpcs(
  scene: THREE.Scene,
  ragdolls: Ragdolls,
  world: { clear: (x: number, z: number, radius: number) => boolean; sight: (x1: number, z1: number, x2: number, z2: number) => boolean },
  hooks: { onRest?: (x: number, z: number) => void; say?: (npc: Npc, text: string, shout: boolean) => void } = {},
) {
  const nav = createNav();
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const jobs = new Map<Building, number>();
  for (const b of BUILDINGS) jobs.set(b, b.jobs);
  const poiLoad = new Map<Poi, number>();
  const homes = BUILDINGS.filter((b) => b.residents > 0);
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

  function nearestPoi(from: { x: number; z: number }, kinds: Poi['kind'][], seat?: boolean) {
    const options = POIS.filter((p) => kinds.includes(p.kind) && (seat === undefined || p.seat === seat) && (poiLoad.get(p) ?? 0) < (p.seat ? 1 : 3));
    options.sort((a, b) => dist(a, from) - dist(b, from));
    const chosen = options[Math.floor(random() * Math.min(4, options.length))];
    if (chosen) poiLoad.set(chosen, (poiLoad.get(chosen) ?? 0) + 1);
    return chosen;
  }
  function takeJob(from: Building, kinds: Building['kind'][]) {
    const options = BUILDINGS.filter((b) => kinds.includes(b.kind) && (jobs.get(b) ?? 0) > 0).sort((a, b) => dist(a, from) - dist(b, from));
    const chosen = options[Math.floor(random() * Math.min(3, options.length))];
    if (chosen) jobs.set(chosen, jobs.get(chosen)! - 1);
    return chosen;
  }
  const at = (building: Building, inside: boolean): Place => ({ building, inside });
  const out = (poi: Poi | undefined, fallback: Building): Place => (poi ? { poi } : { building: fallback, inside: true });
  function activity(start: number, end: number, kind: Activity['kind'], place: Place): Activity {
    const outdoor = 'poi' in place || !place.inside;
    return { start: (start + 24) % 24, end: (end + 24) % 24, kind, place, outdoor };
  }

  const npcs: Npc[] = [];
  function addNpc(role: Role, home: Building, schedule: Activity[], look: RagdollLook, gang = -1) {
    npcs.push({
      id: npcs.length, role, gang, home, look, schedule, current: null, state: 'inside', inside: home,
      x: home.door.x, z: home.door.z, y: 0, yaw: home.facing, targetYaw: home.facing, path: [], pathIndex: 0,
      speed: 0, pace: 1.45 + random() * 0.45, run: false, spot: null, pose: 'idle', stride: random() * 10, swing: 0,
      health: gang >= 0 ? GANG_HEALTH : MAX_HEALTH, hitAt: -99, afraidFor: 0, lastAimed: -99, robbedDay: -1,
      chatterAt: random() * 20, checkAt: random() * 2, nextAttack: 0, body: null, timer: 0, pooled: false,
    });
  }

  // Residents: a role, a home, and a workplace or school close to it.
  for (const home of homes) {
    for (let r = 0; r < home.residents; r++) {
      const j = (random() - 0.5) * 0.8;
      const roll = random();
      const look: RagdollLook = { shirt: SHIRTS[Math.floor(random() * SHIRTS.length)], pants: PANTS[Math.floor(random() * PANTS.length)], skin: SKINS[Math.floor(random() * SKINS.length)], hat: random() < 0.35 ? '#e5cf92' : undefined };
      const homeIn = at(home, true);
      if (roll < 0.5) {
        const job = takeJob(home, ['shop', 'cafe', 'food', 'office', 'hospital', 'police', 'post', 'bikeshop', 'gunstore']);
        if (job) {
          const front = ['shop', 'cafe', 'food', 'bikeshop'].includes(job.kind);
          const lunch = nearestPoi(job, ['cafe-seat'], true) ?? nearestPoi(job, ['bench']);
          const evening = random() < 0.5 ? nearestPoi(job, ['park', 'square', 'bench', 'market']) : undefined;
          addNpc('worker', home, [
            activity(19.6 + j, 7.4 + j, 'home', homeIn), activity(7.4 + j, 11.5, 'work', at(job, !front)),
            activity(11.5, 12.9, 'eat', out(lunch, job)), activity(12.9, 17.4 + j, 'work', at(job, !front)),
            activity(17.4 + j, 19.6 + j, evening ? 'leisure' : 'home', evening ? { poi: evening } : homeIn),
          ], look);
          continue;
        }
      }
      if (roll < 0.64) {
        const school = takeJob(home, ['school']) ?? BUILDINGS.find((b) => b.kind === 'school');
        if (school) {
          const yard = nearestPoi(school, ['school-yard']);
          const park = nearestPoi(home, ['park', 'square']);
          look.shirt = '#f4f4f0';
          look.pants = '#2f3a68';
          look.hat = undefined;
          addNpc('student', home, [
            activity(18 + j, 6.8 + j, 'home', homeIn), activity(6.8 + j, 11, 'school', at(school, true)),
            activity(11, 11.7, 'leisure', out(yard, school)), activity(11.7, 12.9, 'home', homeIn),
            activity(12.9, 16.4, 'school', at(school, true)), activity(16.4, 18 + j, 'leisure', out(park, home)),
          ], look);
          continue;
        }
      }
      if (roll < 0.82) {
        const morning = nearestPoi(home, ['park', 'square']);
        const coffee = nearestPoi(home, ['cafe-seat'], true) ?? nearestPoi(home, ['bench']);
        const afternoon = nearestPoi(home, ['pagoda-yard', 'bench']);
        const market = nearestPoi(home, ['market']);
        addNpc('retiree', home, [
          activity(18.5 + j, 5.6 + j, 'home', homeIn), activity(5.6 + j, 7.3, 'leisure', out(morning, home)),
          activity(7.3, 9.6, 'eat', out(coffee, home)), activity(9.6, 15 + j, 'home', homeIn),
          activity(15 + j, 17.3, 'leisure', out(afternoon, home)), activity(17.3, 18.5 + j, 'market', out(market, home)),
        ], look);
        continue;
      }
      if (roll < 0.92) {
        const stall = nearestPoi(home, ['market'], false);
        if (stall) {
          look.hat = '#e5cf92';
          addNpc('vendor', home, [activity(18 + j, 5.2 + j, 'home', homeIn), activity(5.2 + j, 18 + j, 'market', { poi: stall })], look);
          continue;
        }
      }
      const night = nearestPoi(home, ['square', 'bus-stop', 'bench']);
      const brunch = nearestPoi(home, ['cafe-seat'], true);
      addNpc('owl', home, [
        activity(23.5 + j, 10, 'home', homeIn), activity(10, 11.6, 'eat', out(brunch, home)),
        activity(11.6, 18.4 + j, 'home', homeIn), activity(18.4 + j, 23.5 + j, 'leisure', out(night, home)),
      ], look);
    }
  }

  // Street gangs: each holds the sidewalk in front of its hideout and sleeps there in the morning.
  const gangHideouts = [...homes].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
  const gangState = GANGS.map((g, index) => {
    const hideout = gangHideouts[index * 7] ?? homes[index];
    return { ...g, index, hideout, x: hideout.curb.x * 0.6 + hideout.door.x * 0.4, z: hideout.curb.z * 0.6 + hideout.door.z * 0.4, anger: 0, angryUntil: 0, loiter: 0 };
  });
  for (const gang of gangState) {
    for (let m = 0; m < 5; m++) {
      const corner: Poi = { id: -1, kind: 'bench', x: gang.x + Math.cos(m * 1.3) * 1.8, z: gang.z + Math.sin(m * 1.3) * 1.8, yaw: m * 1.3 + Math.PI, curb: gang.hideout.curb, seat: false };
      addNpc('gang', gang.hideout, [activity(3, 10 + m * 0.3, 'home', at(gang.hideout, true)), activity(10 + m * 0.3, 3, 'hang', { poi: corner })],
        { shirt: gang.shirt, pants: gang.pants, skin: SKINS[m % SKINS.length], hat: undefined }, gang.index);
    }
  }
  const crowd = npcs.length;
  // Two extra slots for scripted mission characters (thieves).
  for (let k = 0; k < 2; k++) addNpc('thief', homes[k], [], { shirt: '#3d3d3d', pants: '#1f1f1f', skin: '#c58f69' });
  for (const thief of npcs.slice(crowd)) thief.state = 'away';

  // Instanced rendering: torso, legs and arms are boxes; heads and hats have their own meshes.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 8);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const boxes = new THREE.InstancedMesh(box, material, npcs.length * BOXES);
  const heads = new THREE.InstancedMesh(ball, material, npcs.length);
  const hats = new THREE.InstancedMesh(cone, material, npcs.length);
  const bandanas = new THREE.InstancedMesh(box, material, npcs.length);
  const color = new THREE.Color();
  npcs.forEach((npc, i) => {
    (['shirt', 'pants', 'pants', 'shirt', 'shirt'] as const).forEach((part, k) => boxes.setColorAt(i * BOXES + k, color.set(npc.look[part])));
    heads.setColorAt(i, color.set(npc.look.skin));
    hats.setColorAt(i, color.set(npc.look.hat ?? '#e5cf92'));
    bandanas.setColorAt(i, color.set(npc.gang >= 0 ? GANGS[npc.gang].bandana : '#000000'));
  });
  for (const mesh of [boxes, heads, hats, bandanas]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), outM = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0);
  function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0) {
    local.compose(pos.set(x, y, z), quat.setFromAxisAngle(xAxis, tilt), size.set(sx, sy, sz));
    mesh.setMatrixAt(index, outM.multiplyMatrices(base, local));
  }
  // A limb hanging from `pivot`, swung forward by `angle` around the x axis.
  function limb(index: number, px: number, py: number, length: number, width: number, depth: number, angle: number) {
    place(boxes, index, px, py - Math.cos(angle) * length / 2, -Math.sin(angle) * length / 2, width, length, depth, angle);
  }
  function visible(npc: Npc) { return npc.state !== 'inside' && npc.state !== 'down' && npc.state !== 'away'; }
  function draw(npc: Npc, i: number, time: number) {
    if (!visible(npc)) {
      for (let k = 0; k < BOXES; k++) boxes.setMatrixAt(i * BOXES + k, hidden);
      heads.setMatrixAt(i, hidden); hats.setMatrixAt(i, hidden); bandanas.setMatrixAt(i, hidden);
      return;
    }
    const sit = npc.pose === 'sit';
    base.compose(pos.set(npc.x, npc.y - (sit ? 0.36 : 0), npc.z), quat.setFromAxisAngle(yAxis, npc.yaw), size.setScalar(BODY_SCALE));
    const swing = npc.swing;
    const legs = sit ? -1.45 : swing;
    let armL = -swing * 0.8, armR = swing * 0.8;
    if (npc.pose === 'hands') { armL = -2.85; armR = -2.85 + Math.sin(time * 9) * 0.08; }
    else if (npc.pose === 'run' && npc.state === 'fleeing') { armL = -2.4; armR = -2.5; }
    else if (npc.pose === 'fight') { armL = -1.3; armR = time % 1.1 < 0.25 ? -1.75 : -1.1; }
    else if (sit) { armL = -0.7; armR = -0.7; }
    else if (npc.pose === 'idle') { armL = Math.sin(time * 1.3 + npc.id) * 0.06; armR = -armL; }
    place(boxes, i * BOXES, 0, 1.13, 0, 0.58, 0.78, 0.38);
    limb(i * BOXES + 1, -0.16, 0.76, 0.7, 0.2, 0.23, sit ? legs : legs);
    limb(i * BOXES + 2, 0.16, 0.76, 0.7, 0.2, 0.23, sit ? legs : -legs);
    limb(i * BOXES + 3, -0.38, 1.47, 0.62, 0.15, 0.17, armL);
    limb(i * BOXES + 4, 0.38, 1.47, 0.62, 0.15, 0.17, armR);
    place(heads, i, 0, 1.85, 0, 0.28, 0.3, 0.28);
    if (npc.look.hat) place(hats, i, 0, 2.14, 0, 0.52, 0.3, 0.52);
    else hats.setMatrixAt(i, hidden);
    if (npc.gang >= 0) place(bandanas, i, 0, 1.98, 0, 0.6, 0.09, 0.6);
    else bandanas.setMatrixAt(i, hidden);
  }

  // --- Scheduling -----------------------------------------------------------------------------
  function within(hour: number, a: Activity) {
    return a.start <= a.end ? hour >= a.start && hour < a.end : hour >= a.start || hour < a.end;
  }
  function placePoint(place: Place) {
    if ('poi' in place) return { x: place.poi.x, z: place.poi.z, curb: place.poi.curb };
    return { x: place.building.door.x, z: place.building.door.z, curb: place.building.curb };
  }
  /** Hours of walking from where the NPC is to a place (Manhattan estimate along sidewalks). */
  function travelHours(npc: Npc, place: Place) {
    const p = placePoint(place);
    return (Math.abs(p.x - npc.x) + Math.abs(p.z - npc.z)) * 1.15 / npc.pace / SECONDS_PER_HOUR;
  }
  /** The activity to be heading for now: the current one, or the next one if it is time to leave for it. */
  function due(npc: Npc, hour: number, raining: boolean) {
    const list = npc.schedule;
    let chosen = list.find((a) => within(hour, a)) ?? null;
    for (const a of list) {
      if (a === chosen) continue;
      const lead = travelHours(npc, a.place) + 0.15;
      const until = (a.start - hour + 24) % 24;
      if (until > 0 && until <= lead) { chosen = a; break; }
    }
    // In the rain, outdoor leisure turns into staying home.
    if (chosen && raining && chosen.kind === 'leisure') return { ...chosen, place: at(npc.home, true) as Place, outdoor: false };
    return chosen;
  }
  function samePlace(a: Place, b: Place) {
    if ('poi' in a && 'poi' in b) return a.poi === b.poi;
    if ('building' in a && 'building' in b) return a.building === b.building && a.inside === b.inside;
    return false;
  }
  function spotFor(npc: Npc, place: Place) {
    if ('poi' in place) {
      const p = place.poi;
      const jitter = p.seat ? 0 : 0.9;
      const a = npc.id * 2.4;
      return { x: p.x + Math.cos(a) * jitter, z: p.z + Math.sin(a) * jitter, yaw: p.yaw, sit: p.seat };
    }
    // Shop workers stand out front beside the door, facing the street.
    const b = place.building;
    const side = ((npc.id % 3) - 1) * 1.1;
    const rx = Math.cos(b.facing), rz = -Math.sin(b.facing);
    return { x: b.door.x + rx * side, z: b.door.z + rz * side, yaw: b.facing, sit: false };
  }
  /** Plans a sidewalk route from wherever the NPC is to `target`, ending at the exact spot. */
  function walkTo(npc: Npc, target: { x: number; z: number; curb: { x: number; z: number } }, run: boolean) {
    const start: Waypoint[] = [];
    if (npc.inside) start.push({ x: npc.inside.curb.x, z: npc.inside.curb.z, crossing: false });
    else if (npc.state === 'at' && npc.current && 'poi' in npc.current.place) start.push({ x: npc.current.place.poi.curb.x, z: npc.current.place.poi.curb.z, crossing: false });
    const from = start[0] ?? nav.snap(npc.x, npc.z);
    npc.path = [...start, ...nav.route(from.x, from.z, target.curb.x, target.curb.z), { x: target.x, z: target.z, crossing: false }];
    npc.pathIndex = 0;
    npc.run = run;
    if (npc.inside) {
      npc.x = npc.inside.door.x;
      npc.z = npc.inside.door.z;
      npc.yaw = npc.inside.facing;
      npc.inside = null;
    }
    npc.state = 'walking';
    npc.spot = null;
  }
  function goHome(npc: Npc, run: boolean) {
    npc.current = null;
    walkTo(npc, { x: npc.home.door.x, z: npc.home.door.z, curb: npc.home.curb }, run);
    npc.state = run ? 'fleeing' : 'walking';
  }
  function arrive(npc: Npc) {
    const place = npc.current?.place;
    if (!place || (npc.state === 'fleeing')) {
      npc.state = 'inside';
      npc.inside = npc.home;
      npc.timer = 1.5;
      return;
    }
    if ('building' in place && place.inside) { npc.state = 'inside'; npc.inside = place.building; return; }
    npc.spot = spotFor(npc, place);
    npc.x = npc.spot.x;
    npc.z = npc.spot.z;
    npc.state = 'at';
  }
  function startActivity(npc: Npc, next: Activity) {
    npc.current = next;
    if (npc.state === 'inside' && 'building' in next.place && next.place.inside && npc.inside === next.place.building) return;
    const target = placePoint(next.place);
    walkTo(npc, target, false);
    say(npc, next.kind === 'work' ? pick(LINES.commute) : next.kind === 'school' ? pick(LINES.school) : next.kind === 'home' ? pick(LINES.home) : '', false);
  }

  // Initial state at the starting hour: everyone is already where their routine says.
  function settle(hour: number) {
    for (const npc of npcs) {
      if (npc.role === 'thief') continue;
      const a = npc.schedule.find((s) => within(hour, s)) ?? npc.schedule[0];
      npc.current = a;
      if ('building' in a.place && a.place.inside) { npc.state = 'inside'; npc.inside = a.place.building; }
      else { npc.inside = null; npc.spot = spotFor(npc, a.place); npc.x = npc.spot.x; npc.z = npc.spot.z; npc.yaw = npc.spot.yaw; npc.state = 'at'; }
    }
  }

  let saySink = hooks.say;
  function say(npc: Npc, text: string, shout: boolean) {
    if (text && saySink) saySink(npc, text, shout);
  }

  function knock(npc: Npc, vx: number, vy: number, vz: number, time: number) {
    if (!visible(npc)) return null;
    npc.state = 'down';
    npc.timer = time + 9;
    npc.pooled = false;
    npc.body = ragdolls.spawn({ x: npc.x, y: npc.y, z: npc.z, yaw: npc.yaw, scale: RAGDOLL_SCALE, look: npc.look, velocity: { x: vx, y: vy, z: vz } });
    return npc.body;
  }

  function provoke(gang: number, amount: number, time: number) {
    const g = gangState[gang];
    if (!g) return;
    const was = g.anger;
    g.anger = Math.min(3, g.anger + amount);
    g.angryUntil = time + 45 + g.anger * 15;
    if (was === 0) for (const npc of npcs) if (npc.gang === gang && visible(npc)) say(npc, pick(LINES.gangAngry), true);
  }

  function flee(npc: Npc, time: number, line = true) {
    if (npc.gang >= 0 || npc.role === 'thief' || !visible(npc)) return;
    if (npc.state === 'fleeing') return;
    if (line) say(npc, pick(LINES.flee), true);
    npc.lastAimed = time;
    goHome(npc, true);
  }

  const restPoint = new THREE.Vector3();
  let started = false;
  let day = 0;
  let lastHour = 0;
  const events: NpcEvents = { robbed: [], strikes: 0, shots: [] };

  return {
    npcs,
    gangs: gangState,
    setSay(fn: (npc: Npc, text: string, shout: boolean) => void) { saySink = fn; },
    knock,
    provoke,
    flee,
    /** Applies damage. Returns what happened so callers can tear limbs, drop money or update missions. */
    damage(npc: Npc, amount: number, vx: number, vy: number, vz: number, time: number, force = false) {
      if (!visible(npc)) return null;
      npc.health -= amount;
      npc.hitAt = time;
      if (npc.gang >= 0) provoke(npc.gang, 1, time);
      const killed = npc.health <= 0;
      if (killed || force) {
        const body = knock(npc, vx, vy, vz, time);
        return { body, killed, npc };
      }
      if (npc.gang < 0 && npc.role !== 'thief') flee(npc, time);
      return { body: null, killed: false, npc };
    },
    /** Nearest standing person crossed by a ray; `dir` must be normalised. */
    raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
      let best: { npc: Npc; t: number } | null = null;
      for (const npc of npcs) {
        if (!visible(npc)) continue;
        const rx = origin.x - npc.x, rz = origin.z - npc.z;
        const a = dir.x * dir.x + dir.z * dir.z;
        if (a < 1e-6) continue;
        const b = 2 * (rx * dir.x + rz * dir.z), c = rx * rx + rz * rz - HIT_RADIUS * HIT_RADIUS;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
        if (t <= 0 || t >= maxT || (best && t >= best.t)) continue;
        const y = origin.y + dir.y * t - npc.y;
        if (y > 0 && y < HEIGHT) best = { npc, t };
      }
      return best;
    },
    near(x: number, z: number, radius: number, callback: (npc: Npc, nx: number, nz: number) => void) {
      for (const npc of npcs) if (visible(npc) && (npc.x - x) ** 2 + (npc.z - z) ** 2 < radius * radius) callback(npc, npc.x, npc.z);
    },
    /** Gunfire: everyone nearby runs home; gang members instead get angry if it is their turf. */
    alarm(x: number, z: number, radius: number, time: number) {
      for (const npc of npcs) {
        if (!visible(npc) || (npc.x - x) ** 2 + (npc.z - z) ** 2 > radius * radius) continue;
        if (npc.gang >= 0) { if (Math.hypot(npc.x - x, npc.z - z) < 25) provoke(npc.gang, 1, time); }
        else flee(npc, time, Math.random() < 0.4);
      }
    },
    forEachStanding(callback: (x: number, z: number, npc: Npc) => void) {
      for (const npc of npcs) if (visible(npc)) callback(npc.x, npc.z, npc);
    },
    /** People currently on a crosswalk, so cars can stop for them. */
    forEachCrossing(callback: (x: number, z: number) => void) {
      for (const npc of npcs) if (npc.state !== 'at' && visible(npc) && npc.path[npc.pathIndex]?.crossing) callback(npc.x, npc.z);
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const npc of npcs) if (visible(npc) && time - npc.hitAt < 4) callback(npc.x, npc.y + HEIGHT + 0.3, npc.z, Math.max(0, npc.health) / (npc.gang >= 0 ? GANG_HEALTH : MAX_HEALTH));
    },
    /** Starts a mission thief who snatches a bag and runs for a far-away door. */
    spawnThief(x: number, z: number, awayFromX: number, awayFromZ: number) {
      const thief = npcs.find((n) => n.role === 'thief' && (n.state === 'away' || n.state === 'inside'));
      if (!thief) return null;
      const far = [...homes].sort((a, b) => Math.hypot(b.door.x - awayFromX, b.door.z - awayFromZ) - Math.hypot(a.door.x - awayFromX, a.door.z - awayFromZ))[Math.floor(Math.random() * 4)];
      Object.assign(thief, { x, z, inside: null, health: MAX_HEALTH, hitAt: -99, state: 'walking', home: far, body: null });
      thief.current = null;
      walkTo(thief, { x: far.door.x, z: far.door.z, curb: far.curb }, true);
      thief.state = 'fleeing';
      say(thief, pick(LINES.thief), true);
      return thief;
    },
    update(dt: number, time: number, hour: number, raining: boolean, threat: Threat, focusX: number, focusZ: number, ground: (x: number, z: number) => number) {
      events.robbed.length = 0;
      events.strikes = 0;
      events.shots.length = 0;
      if (!started) { settle(hour); started = true; lastHour = hour; }
      if (hour < lastHour) day++;
      lastHour = hour;
      for (const g of gangState) {
        if (g.anger > 0 && time > g.angryUntil) { g.anger = Math.max(0, g.anger - 1); g.angryUntil = time + 20; }
        // Loitering on their corner with a gun out is a provocation.
        const onTurf = Math.hypot(threat.x - g.x, threat.z - g.z) < 12 && threat.armed && !threat.inVehicle;
        g.loiter = onTurf ? g.loiter + dt : Math.max(0, g.loiter - dt);
        if (g.loiter > 4) { provoke(g.index, 1, time); g.loiter = 0; }
      }
      npcs.forEach((npc, i) => {
        // --- downed and away ---
        if (npc.state === 'down') {
          if (npc.body && !npc.pooled && npc.body.asleep) {
            npc.pooled = true;
            ragdolls.center(npc.body, restPoint);
            hooks.onRest?.(restPoint.x, restPoint.z);
          }
          if (time > npc.timer || !npc.body || npc.body.removed) {
            if (npc.body) ragdolls.remove(npc.body);
            npc.body = null;
            npc.state = 'away';
            // Back home after a stay at the hospital (about two game hours).
            npc.timer = time + SECONDS_PER_HOUR * 2;
          }
          draw(npc, i, time);
          return;
        }
        if (npc.state === 'away') {
          if (npc.role !== 'thief' && time > npc.timer) {
            npc.state = 'inside';
            npc.inside = npc.home;
            npc.health = npc.gang >= 0 ? GANG_HEALTH : MAX_HEALTH;
            npc.current = null;
          }
          draw(npc, i, time);
          return;
        }
        // --- routine: decide where to be ---
        npc.checkAt -= dt;
        const angry = npc.gang >= 0 && gangState[npc.gang].anger > 0;
        if (npc.checkAt <= 0 && npc.role !== 'thief' && npc.state !== 'afraid' && npc.state !== 'fleeing' && !angry) {
          npc.checkAt = 0.8 + Math.random() * 0.6;
          if (npc.state === 'inside' && npc.timer > 0) npc.timer -= 1;
          else {
            const next = due(npc, hour, raining);
            if (next && (!npc.current || !samePlace(next.place, npc.current.place) || (npc.state === 'inside' && npc.inside !== ('building' in next.place ? next.place.building : null)))) {
              if (npc.state !== 'walking' || !npc.current || !samePlace(next.place, npc.current.place)) startActivity(npc, next);
            }
          }
        }
        if (npc.state === 'inside') { draw(npc, i, time); return; }

        // --- fear: a gun pointed at you ---
        const dx = npc.x - threat.x, dz = npc.z - threat.z;
        const d = Math.hypot(dx, dz);
        if (npc.gang < 0 && npc.role !== 'thief' && threat.aiming && !threat.down && d < 22 && npc.state !== 'fleeing') {
          const gap = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - threat.aimYaw), Math.cos(Math.atan2(dx, dz) - threat.aimYaw)));
          if (gap < (d < 6 ? 0.4 : 0.16)) {
            if (npc.state !== 'afraid') { npc.state = 'afraid'; npc.afraidFor = 0; say(npc, pick(LINES.afraid), true); }
            npc.lastAimed = time;
          }
        }
        if (npc.gang >= 0 && threat.aiming && d < 18) {
          const gap = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - threat.aimYaw), Math.cos(Math.atan2(dx, dz) - threat.aimYaw)));
          if (gap < 0.25) provoke(npc.gang, dt * 0.5, time);
        }
        if (npc.state === 'afraid') {
          npc.targetYaw = Math.atan2(-dx, -dz);
          npc.speed = 0;
          npc.pose = 'hands';
          npc.afraidFor += dt;
          if (npc.afraidFor > 1.4 && npc.robbedDay !== day) {
            // They hand over what they carry; shopkeepers empty the till.
            npc.robbedDay = day;
            const shop = !!npc.current && 'building' in npc.current.place && !npc.current.place.inside && npc.current.kind === 'work';
            const amount = shop ? 120 + Math.floor(Math.random() * 180) : 15 + Math.floor(Math.random() * 70);
            events.robbed.push({ npc, amount, shop });
            say(npc, pick(LINES.robbed), true);
          }
          if (time - npc.lastAimed > 1.3 || (npc.robbedDay === day && npc.afraidFor > 2.2)) flee(npc, time, false);
        }

        // --- gangs: hang out, or fight when angry ---
        if (npc.gang >= 0 && angry && !threat.down) {
          const g = gangState[npc.gang];
          const fromTurf = Math.hypot(threat.x - g.x, threat.z - g.z);
          if (fromTurf < 70 && d < 45) {
            npc.state = 'chasing';
            npc.targetYaw = Math.atan2(-dx, -dz);
            const reach = threat.inVehicle ? 2.4 : 1.1;
            const armedGang = g.anger >= 2 || threat.armed;
            const keepAway = armedGang ? 7 : reach;
            const want = d > keepAway ? 5.2 : 0;
            npc.speed = THREE.MathUtils.damp(npc.speed, want, 6, dt);
            npc.pose = d <= reach + 0.2 ? 'fight' : npc.speed > 3 ? 'run' : 'idle';
            if (time > npc.nextAttack) {
              if (d <= reach + 0.2 && !threat.inVehicle) { npc.nextAttack = time + 1.1; events.strikes++; }
              else if (armedGang && d < 26 && world.sight(npc.x, npc.z, threat.x, threat.z)) {
                npc.nextAttack = time + 1.3 + Math.random() * 0.9;
                events.shots.push({ from: new THREE.Vector3(npc.x - dx / d * 0.6, npc.y + 1.3, npc.z - dz / d * 0.6), hit: Math.random() < 0.18 + g.anger * 0.05 });
              }
            }
            if (Math.random() < dt * 0.15) say(npc, pick(LINES.gangAngry), true);
          } else if (npc.state === 'chasing') {
            npc.state = 'walking';
            npc.current = null;
            npc.checkAt = 0;
          }
        } else if (npc.state === 'chasing') {
          npc.state = 'walking';
          npc.current = null;
          npc.checkAt = 0;
        }

        // --- movement ---
        if (npc.state === 'walking' || npc.state === 'fleeing') {
          const target = npc.path[npc.pathIndex];
          const run = npc.run || npc.state === 'fleeing';
          const want = run ? 3.8 : npc.pace;
          npc.speed = THREE.MathUtils.damp(npc.speed, want, 4, dt);
          npc.pose = run ? 'run' : 'walk';
          if (!target) arrive(npc);
          else {
            const tx = target.x - npc.x, tz = target.z - npc.z;
            const left = Math.hypot(tx, tz);
            const stepLength = npc.speed * dt;
            if (left <= stepLength + 0.05) {
              npc.x = target.x; npc.z = target.z;
              npc.pathIndex++;
              if (npc.pathIndex >= npc.path.length) arrive(npc);
            } else {
              npc.x += tx / left * stepLength;
              npc.z += tz / left * stepLength;
              npc.targetYaw = Math.atan2(tx, tz);
            }
          }
        } else if (npc.state === 'chasing') {
          const step = npc.speed * dt;
          if (d > 0.01 && step > 0) {
            const mx = -dx / d * step, mz = -dz / d * step;
            if (world.clear(npc.x + mx, npc.z + mz, 0.3)) { npc.x += mx; npc.z += mz; }
            else { if (world.clear(npc.x + mx, npc.z, 0.3)) npc.x += mx; if (world.clear(npc.x, npc.z + mz, 0.3)) npc.z += mz; }
          }
        } else if (npc.state === 'at' && npc.spot) {
          npc.speed = THREE.MathUtils.damp(npc.speed, 0, 6, dt);
          npc.pose = npc.spot.sit ? 'sit' : 'idle';
          npc.targetYaw = npc.spot.yaw + Math.sin(time * 0.2 + npc.id) * 0.4;
          if (npc.gang >= 0 && d < 9 && !threat.inVehicle) npc.targetYaw = Math.atan2(-dx, -dz);
        }
        npc.yaw = angleLerp(npc.yaw, npc.targetYaw, 1 - Math.exp(-dt * 8));
        npc.stride += npc.speed * dt * 2.4;
        const swingAmount = npc.pose === 'run' ? 0.85 : npc.pose === 'walk' ? 0.5 : 0;
        npc.swing = THREE.MathUtils.damp(npc.swing, Math.sin(npc.stride) * swingAmount, 14, dt);
        npc.y = ground(npc.x, npc.z) + (npc.pose === 'walk' || npc.pose === 'run' ? Math.abs(Math.sin(npc.stride)) * 0.04 : 0);

        // --- chatter near the player ---
        npc.chatterAt -= dt;
        if (npc.chatterAt <= 0) {
          npc.chatterAt = 14 + Math.random() * 22;
          if (Math.hypot(npc.x - focusX, npc.z - focusZ) < 28 && npc.state !== 'afraid') {
            const kind = npc.current?.kind;
            const line = npc.gang >= 0 ? pick(LINES.gangCalm)
              : raining && npc.state === 'walking' ? pick(LINES.rain)
              : (hour > 21 || hour < 5) ? pick(LINES.night)
              : kind === 'market' ? pick(LINES.market)
              : kind === 'work' && npc.state === 'at' ? pick(LINES.work)
              : kind === 'eat' ? pick(LINES.eat)
              : kind === 'leisure' ? pick(LINES.leisure)
              : kind === 'school' ? pick(LINES.school)
              : npc.state === 'walking' ? pick(LINES.commute) : '';
            say(npc, line, false);
          }
        }
        draw(npc, i, time);
      });
      boxes.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      hats.instanceMatrix.needsUpdate = true;
      bandanas.instanceMatrix.needsUpdate = true;
      return events;
    },
    dispose() {
      for (const mesh of [boxes, heads, hats, bandanas]) { scene.remove(mesh); mesh.dispose(); }
      material.dispose();
      box.dispose();
      ball.dispose();
      cone.dispose();
    },
  };
}
