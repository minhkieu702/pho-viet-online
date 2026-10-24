import * as THREE from 'three';
import { BUILDINGS, POIS, type Building, type Poi } from './city';
import { createNav, type Waypoint } from './nav';
import type { createRagdolls, RagdollBody, RagdollLook } from './ragdoll';
import { FIGURE, FigureBatch, PART, UMBRELLA, armGeometry, bodyGeometry, deriveStyle, figureMaterial, legGeometry, palette, setStyle, umbrellaGeometry } from './figures';
import { BRAIN, INCIDENTS, createIncidents, createMind, createSense, decide, drift, engage, perceive, type Incident, type IncidentKind, type Intent, type Mind } from './brain';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Role = 'worker' | 'student' | 'retiree' | 'vendor' | 'owl' | 'gang' | 'thief';
/** A standing spot that is neither a POI nor a building: a place to watch from, or to keep away. */
type Stand = { x: number; z: number; yaw: number; sit: boolean; covered: boolean; curb: { x: number; z: number } };
/** A building (inside, or out front; `slot` picks a shelter spot under the awning), a POI, or a free standing spot. */
type Place = { building: Building; inside: boolean; slot?: number } | { poi: Poi } | { stand: Stand };
type Kind = 'home' | 'work' | 'eat' | 'leisure' | 'school' | 'market' | 'hang' | 'shelter' | 'watch' | 'avoid';
type Activity = { start: number; end: number; kind: Kind; place: Place; outdoor: boolean };
type State = 'inside' | 'walking' | 'at' | 'afraid' | 'fleeing' | 'chasing' | 'down' | 'away';
type Pose = 'walk' | 'run' | 'idle' | 'sit' | 'hands' | 'fight';
/** A shelter spot, café place or bus-stop seat this person has reserved. */
type Claim = { front?: Building; slot?: number; inside?: Building; seat?: Poi };
type Target = { x: number; z: number; curb: { x: number; z: number }; via: { x: number; z: number } | null };
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
  /** Needs, traits and the current intent (see brain.ts). */
  mind: Mind;
  /** Waypoints from the current standing spot back onto the sidewalk network. */
  leave: Waypoint[];
  claim: Claim | null;
};
export type GangShot = { from: THREE.Vector3; hit: boolean };
/** People on the street this frame, and what the rain and the brain have them doing. */
export type CrowdStats = { outside: number; umbrellas: number; sheltering: number; exposed: number; watching: number; chatting: number };
export type NpcEvents = { robbed: { npc: Npc; amount: number; shop: boolean }[]; strikes: number; shots: GangShot[]; crowd: CrowdStats };
export type Threat = { x: number; z: number; aimYaw: number; armed: boolean; aiming: boolean; inVehicle: boolean; down: boolean };
export type { IncidentKind } from './brain';

const SECONDS_PER_HOUR = 60;
// Model units are ~2.1 m tall; scale to a 1.75 m person.
const BODY_SCALE = 0.82;
const RAGDOLL_SCALE = 0.7;
const HIT_RADIUS = 0.38;
const HEIGHT = 1.85;
const MAX_HEALTH = 60;
const GANG_HEALTH = 90;
export const GANGS = [
  { name: 'Rắn Đen', shirt: '#26262a', pants: '#3a1f1f', bandana: '#c0392b' },
  { name: 'Hổ Vàng', shirt: '#d8a020', pants: '#2b2b30', bandana: '#1f1f22' },
];
const SHIRTS = ['#db9876', '#86a799', '#d4b164', '#bca5b7', '#8caaa9', '#d18469', '#9fb4d6', '#e0b8a0', '#c96f6f', '#7fa37a', '#e8d6a8', '#6f86a8', '#f0f0ea', '#a57fb0'];
const PANTS = ['#536c69', '#6d5d4f', '#3f4d5c', '#7b6a58', '#4f5a4a', '#2f3a48'];
const SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
/** Umbrella canopies: panel colour pairs (solid, or striped with a light panel). */
const UMBRELLAS: [string, string][] = [
  ['#26262a', '#26262a'], ['#2b3f6b', '#2b3f6b'], ['#b8372d', '#b8372d'], ['#e2b53a', '#e2b53a'], ['#3f7a5a', '#3f7a5a'], ['#c9493b', '#f3ece0'],
  ['#4f86c6', '#f3ece0'], ['#d97a9a', '#f6e3ea'], ['#7d5ba6', '#7d5ba6'], ['#e8762f', '#2b2f33'], ['#86b8a0', '#f3ece0'], ['#8f9aa1', '#8f9aa1'],
];
const LINES = {
  commute: ['Trễ giờ làm rồi!', 'Sáng nay kẹt xe ghê…', 'Đi làm thôi!', 'Hôm nay thứ mấy ta?'],
  school: ['Hôm nay có kiểm tra toán…', 'Đợi tớ với!', 'Ra chơi đá cầu không?'],
  work: ['Mời vào, mời vào!', 'Hôm nay bán ế quá.', 'Có hàng mới đây!', 'Khách ơi ghé xem đi!'],
  market: ['Rau tươi đây!', 'Cá mới về nè!', 'Mua gì đi em ơi!', 'Bớt chút đi chị!'],
  eat: ['Cho tô phở tái!', 'Một ly cà phê sữa đá!', 'Ngon quá trời!', 'Ăn trưa thôi!'],
  leisure: ['Trời hôm nay đẹp ghê.', 'Tập thể dục cho khỏe!', 'Chiều nay mát quá.', 'Cờ tướng không ông?'],
  home: ['Về nhà nấu cơm thôi.', 'Mệt quá, về ngủ.', 'Tối nay xem phim gì?'],
  rain: ['Mưa rồi, chạy thôi!', 'Quên mang áo mưa…', 'Ướt hết rồi!'],
  shelter: ['Mưa to quá…', 'Đợi tạnh rồi đi.', 'Trú mưa chút đã.', 'Mưa gì mà dai thế…', 'Ướt hết cả áo rồi!'],
  umbrella: ['May mà có mang dù!', 'Mưa lâm râm thôi mà.', 'Đi chậm thôi kẻo trơn.', 'Che dù cho khỏi ướt.'],
  dash: ['Thôi kệ, chạy luôn!', 'Không đợi nữa, trễ rồi!'],
  night: ['Khuya rồi, về thôi.', 'Phố đêm yên ghê.'],
  afraid: ['Đừng bắn!', 'Tôi đưa tiền, tha cho tôi!', 'Bình tĩnh, bình tĩnh!'],
  robbed: ['Tiền đây! Đừng bắn!', 'Lấy hết đi, tha cho tôi!'],
  flee: ['Cứu với!', 'Có cướp!', 'Chạy mau!', 'Gọi công an đi!'],
  gangCalm: ['Khu này của tụi tao.', 'Nhìn cái gì?', 'Đi chỗ khác chơi.', 'Có thuốc không?'],
  gangAngry: ['Mày tới số rồi!', 'Anh em, xử nó!', 'Dám đụng tụi tao à?', 'Đứng lại đó!'],
  thief: ['Né ra!', 'Không bắt được tao đâu!'],
  greet: ['Ủa, chào chị! Đi đâu đó?', 'Lâu quá không gặp!', 'Ăn cơm chưa?', 'Ê, dạo này khỏe không?', 'Chào anh, đi làm hả?'],
  reply: ['Đi chợ nè, còn em?', 'Khỏe, cảm ơn nha!', 'Ăn rồi, còn anh?', 'Ừ, dạo này bận quá.'],
  smalltalk: ['Giá rau dạo này lên ghê.', 'Nghe nói chiều nay mưa đó.', 'Quán phở đầu hẻm ngon lắm.', 'Tối nay có đá banh đó!', 'Con bé nhà chị thi xong chưa?'],
  bye: ['Thôi, đi nha!', 'Mai gặp nha!', 'Ừ, đi cẩn thận!'],
  hungry: ['Đói bụng quá, kiếm gì ăn thôi.', 'Làm tô bún cho ấm bụng.', 'Ghé quán ăn chút đã.'],
  tired: ['Mệt quá, về nghỉ thôi.', 'Hôm nay đi nhiều quá…'],
  avoid: ['Thôi, tránh xa ra…', 'Sợ quá, đi chỗ khác.', 'Đi đường khác thôi.'],
};
const WATCH_LINES: Record<IncidentKind, string[]> = {
  body: ['Trời ơi!', 'Có ai gọi cấp cứu chưa?', 'Gọi 115 đi!', 'Tội nghiệp quá…'],
  fire: ['Cháy! Cháy rồi!', 'Gọi cứu hỏa đi!', 'Khói quá trời!', 'Trời ơi!'],
  crash: ['Tai nạn kìa!', 'Có sao không vậy?', 'Chạy gì mà ẩu thế!', 'Có ai gọi cấp cứu chưa?'],
  fight: ['Đánh nhau kìa!', 'Thôi thôi, can ra đi!', 'Gọi công an đi!'],
  shots: ['Súng hả trời?!', 'Nghe như tiếng súng…', 'Gọi công an đi!'],
};
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
/** Shelter spots out front, sideways from the door (metres along the facade). */
const FRONT_SLOTS = [-0.7, 0.7, -1.6, 1.6];
const EATERIES = new Set<Building['kind']>(['cafe', 'food']);
const SHOPS = new Set<Building['kind']>(['cafe', 'food', 'shop', 'bikeshop', 'post']);

function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

/**
 * Residents with daily routines. Everyone lives in a real building, leaves through its door, walks the
 * sidewalks and crosswalks to work, school, lunch or the park, and goes home at night. They fear guns,
 * hand over money when robbed, and flee home from gunfire. Two street gangs hold their corners and fight
 * back when provoked. A small utility AI (brain.ts) adjusts the routine: umbrellas or shelter in the
 * rain, chats on the sidewalk, a meal when hungry, home early when tired, and a crowd of onlookers (or
 * a wide berth) around incidents. Every body part is an instance, so the whole crowd is four draw calls.
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
  // Personalities come from their own seeded stream so the schedules above stay exactly as they were.
  let mindSeed = 4211;
  const mindRandom = () => { mindSeed = (mindSeed * 16807) % 2147483647; return (mindSeed - 1) / 2147483646; };
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
    const outdoor = 'poi' in place || 'stand' in place || !place.inside;
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
      mind: createMind(mindRandom, role), leave: [], claim: null,
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

  // Instanced rendering: a body (torso and head), legs and arms, each one figure mesh for the whole crowd,
  // plus open umbrellas. Everyone keeps a packed palette (clothes, skin, hair, hat or bandana); only people
  // outdoors are drawn.
  const material = figureMaterial();
  const bodies = new FigureBatch(bodyGeometry('civil'), material, npcs.length);
  const legs = new FigureBatch(legGeometry(), material, npcs.length * 2);
  const arms = new FigureBatch(armGeometry(false), material, npcs.length * 2);
  const umbrellas = new FigureBatch(umbrellaGeometry(), material, npcs.length);
  const batches = [bodies, legs, arms, umbrellas];
  const dress = npcs.map((npc) => {
    const { look } = npc;
    const style = deriveStyle(look, npc.id, npc.role);
    if (npc.gang >= 0) {
      style.mask = (style.mask & ~PART.CONE) | PART.BANDANA;
      style.accent = GANGS[npc.gang].bandana;
    }
    // Ragdolls of this person read the same style back from their look.
    setStyle(look, style);
    const shin = style.shin === 'skin' ? look.skin : look.pants;
    const canopy = UMBRELLAS[npc.mind.traits.umbrellaLook % UMBRELLAS.length];
    return {
      style,
      body: palette([look.shirt, look.pants, look.skin, style.hair, style.accent], style.mask),
      legs: palette([look.pants, shin, style.shoes], PART.STRAIGHT),
      seated: palette([look.pants, shin, style.shoes], PART.BENT),
      arms: palette([look.shirt, style.forearm === 'skin' ? look.skin : look.shirt, look.skin]),
      umbrella: palette([canopy[0], canopy[1]]),
    };
  });
  for (const batch of batches) {
    batch.mesh.receiveShadow = true;
    scene.add(batch.mesh);
  }
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), outM = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), quat2 = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();
  const bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0);
  // Holding an umbrella: right arm forward, the shaft from the hand up past the right cheek to a canopy over the head.
  const UMBRELLA_ARM = -0.95, UMBRELLA_TWIST = -0.04;
  const umbrellaHand = new THREE.Vector3(0, -0.6, 0).applyEuler(new THREE.Euler(UMBRELLA_ARM, 0, UMBRELLA_TWIST)).add(new THREE.Vector3(FIGURE.shoulderX, FIGURE.shoulderY, 0));
  const umbrellaTilt = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(0.24, FIGURE.headY + 0.98 - UMBRELLA.drop * 0.5, -0.04).sub(umbrellaHand).normalize());
  // A limb hanging from its pivot on the body, swung forward by `angle` around the x axis and turned in by `twist`.
  function limb(batch: FigureBatch, px: number, py: number, angle: number, look: Float32Array, twist = 0) {
    local.compose(pos.set(px, py, 0), twist ? quat.setFromEuler(euler.set(angle, 0, twist)) : quat.setFromAxisAngle(xAxis, angle), size.set(1, 1, 1));
    batch.push(outM.multiplyMatrices(base, local), look);
  }
  // Off in zombie mode: nobody is drawn, hit or found while the streets belong to the dead.
  let enabled = true;
  function visible(npc: Npc) { return enabled && npc.state !== 'inside' && npc.state !== 'down' && npc.state !== 'away'; }
  function draw(npc: Npc, i: number, time: number) {
    if (!visible(npc)) return;
    const d = dress[i];
    const sit = npc.pose === 'sit';
    const { width, height } = d.style;
    const intent = npc.mind.intent;
    // Walkers lean slightly into their stride, runners a lot.
    const lean = npc.pose === 'run' ? 0.2 : npc.pose === 'walk' ? 0.05 : 0;
    base.compose(
      pos.set(npc.x, npc.y - (sit ? FIGURE.sitDrop * BODY_SCALE * height : 0), npc.z),
      quat.setFromEuler(bodyEuler.set(lean, npc.yaw, 0)),
      size.set(BODY_SCALE * width, BODY_SCALE * height, BODY_SCALE * width),
    );
    const swing = npc.swing;
    const open = npc.mind.umbrella;
    const holding = open > 0.04 && !sit && npc.pose !== 'hands' && npc.pose !== 'fight';
    let armL = -swing * 0.8, armR = swing * 0.8, twistL = 0, twistR = 0;
    if (npc.pose === 'hands') { armL = -2.85; armR = -2.85 + Math.sin(time * 9) * 0.08; }
    else if (npc.pose === 'run' && npc.state === 'fleeing') { armL = -2.4; armR = -2.5; }
    else if (npc.pose === 'run') { armL = -0.35 - swing * 1.25; armR = -0.35 + swing * 1.25; }
    else if (npc.pose === 'fight') { armL = -1.3; armR = time % 1.1 < 0.25 ? -1.75 : -1.1; }
    else if (sit) { armL = -0.7; armR = -0.7; }
    else if (npc.pose === 'idle') {
      armL = Math.sin(time * 1.3 + npc.id) * 0.06; armR = -armL;
      if (intent === 'shelter' && npc.mind.needs.wet > 0.15) { armL = armR = -0.6; twistL = 0.85; twistR = -0.85; } // arms folded against the cold
      else if (intent === 'chat') armR = -0.35 - Math.max(0, Math.sin(time * 2.1 + npc.id)) * 0.35; // talking with a hand
      else if (intent === 'watch' && Math.sin(time * 0.7 + npc.id) > 0.75) armR = -1.45; // pointing
    }
    if (holding) { armR = UMBRELLA_ARM + Math.sin(npc.stride) * 0.03; twistR = UMBRELLA_TWIST; }
    bodies.push(base, d.body);
    // Seated people use the bent-knee legs, which already reach forward and down.
    limb(legs, -FIGURE.hipX, FIGURE.hipY, sit ? 0 : swing, sit ? d.seated : d.legs);
    limb(legs, FIGURE.hipX, FIGURE.hipY, sit ? 0 : -swing, sit ? d.seated : d.legs);
    limb(arms, -FIGURE.shoulderX, FIGURE.shoulderY, armL, d.arms, twistL);
    limb(arms, FIGURE.shoulderX, FIGURE.shoulderY, armR, d.arms, twistR);
    if (holding) {
      // The canopy unfolds from a closed bundle; it bobs a little with the stride.
      const spread = 0.12 + 0.88 * open;
      quat2.setFromEuler(euler.set(Math.sin(npc.stride) * 0.025, 0, Math.sin(npc.stride * 0.5) * 0.03));
      local.compose(umbrellaHand, quat.copy(umbrellaTilt).multiply(quat2), size.set(spread, 0.9 + 0.1 * open, spread));
      umbrellas.push(outM.multiplyMatrices(base, local), d.umbrella);
    }
  }

  // --- Places ---------------------------------------------------------------------------------
  function within(hour: number, a: Activity) {
    return a.start <= a.end ? hour >= a.start && hour < a.end : hour >= a.start || hour < a.end;
  }
  /** Under a roof: inside, at a building front (awning, arcade or door canopy), a market stall or a bus shelter. */
  function coveredPlace(place: Place) {
    if ('stand' in place) return place.stand.covered;
    if ('poi' in place) return place.poi.kind === 'market' || place.poi.kind === 'bus-stop';
    return true;
  }
  /** Standing spot out front: shop workers beside the door, people sheltering in `slot` under the awning. */
  function frontSpot(b: Building, slot: number | undefined, id: number, outSpot: { x: number; z: number; yaw: number; sit: boolean }) {
    // Right along the facade is (cos, -sin) of the facing; out toward the street is (sin, cos).
    const c = Math.cos(b.facing), s = Math.sin(b.facing);
    const side = slot === undefined ? ((id % 3) - 1) * 1.1 : FRONT_SLOTS[slot];
    const back = slot === undefined ? 0 : 0.3;
    outSpot.x = b.door.x + c * side - s * back;
    outSpot.z = b.door.z - s * side - c * back;
    outSpot.yaw = b.facing;
    outSpot.sit = false;
    return outSpot;
  }
  const scratch = { x: 0, z: 0, yaw: 0, sit: false };
  /** Where a place is (into `scratch`), without allocating. */
  function pointOf(place: Place) {
    if ('stand' in place) { scratch.x = place.stand.x; scratch.z = place.stand.z; }
    else if ('poi' in place) { scratch.x = place.poi.x; scratch.z = place.poi.z; }
    else if (place.inside) { scratch.x = place.building.door.x; scratch.z = place.building.door.z; }
    else frontSpot(place.building, place.slot, 0, scratch);
    return scratch;
  }
  function placePoint(place: Place, npc: Npc): Target {
    if ('stand' in place) return { x: place.stand.x, z: place.stand.z, curb: place.stand.curb, via: null };
    if ('poi' in place) return { x: place.poi.x, z: place.poi.z, curb: place.poi.curb, via: null };
    const b = place.building;
    if (place.inside) return { x: b.door.x, z: b.door.z, curb: b.curb, via: null };
    // Out front: up to the door, then sideways to the spot, so nobody cuts across planters or trees.
    const s = frontSpot(b, place.slot, npc.id, { x: 0, z: 0, yaw: 0, sit: false });
    return { x: s.x, z: s.z, curb: b.curb, via: b.door };
  }
  /** Hours of walking from where the NPC is to a place (Manhattan estimate along sidewalks). */
  function travelHours(npc: Npc, place: Place) {
    const p = pointOf(place);
    return (Math.abs(p.x - npc.x) + Math.abs(p.z - npc.z)) * 1.15 / npc.pace / SECONDS_PER_HOUR;
  }
  const nearestOf = (kind: Building['kind'], from: { x: number; z: number }) => {
    let best: Building | null = null;
    for (const b of BUILDINGS) if (b.kind === kind && (!best || dist(b.door, from) < dist(best.door, from))) best = b;
    return best;
  };
  const eateries = BUILDINGS.filter((b) => EATERIES.has(b.kind) && b.w >= 5);
  /** Rainy-day versions of outdoor plans: school-yard breaks stay in school, the pagoda yard moves inside, meals move indoors, the rest stay home. */
  const rainy = new Map<Activity, Activity>();
  function rainVariant(npc: Npc, a: Activity) {
    let v = rainy.get(a);
    if (!v) {
      let place: Place = at(npc.home, true);
      if ('poi' in a.place) {
        const p = a.place.poi;
        const school = p.kind === 'school-yard' ? nearestOf('school', p) : null;
        const pagoda = p.kind === 'pagoda-yard' ? nearestOf('pagoda', p) : null;
        let eatery: Building | null = null;
        if (a.kind === 'eat') for (const b of eateries) if (!eatery || dist(b.door, p) < dist(eatery.door, p)) eatery = b;
        if (school) place = at(school, true);
        else if (pagoda) place = at(pagoda, true);
        else if (eatery) place = at(eatery, true);
      }
      v = { ...a, place, outdoor: false };
      rainy.set(a, v);
    }
    return v;
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
    // In the rain, open-air leisure and meals move under a roof (covered spots like bus stops and stalls stay).
    if (chosen && raining && chosen.outdoor && (chosen.kind === 'leisure' || chosen.kind === 'eat') && !coveredPlace(chosen.place)) return rainVariant(npc, chosen);
    return chosen;
  }
  function samePlace(a: Place, b: Place) {
    if ('poi' in a && 'poi' in b) return a.poi === b.poi;
    if ('building' in a && 'building' in b) return a.building === b.building && a.inside === b.inside;
    if ('stand' in a && 'stand' in b) return a.stand === b.stand;
    return false;
  }
  function spotFor(npc: Npc, place: Place) {
    if ('stand' in place) return { x: place.stand.x, z: place.stand.z, yaw: place.stand.yaw, sit: place.stand.sit };
    if ('poi' in place) {
      const p = place.poi;
      const jitter = p.seat ? 0 : 0.9;
      const a = npc.id * 2.4;
      return { x: p.x + Math.cos(a) * jitter, z: p.z + Math.sin(a) * jitter, yaw: p.yaw, sit: p.seat };
    }
    // Shop workers stand out front beside the door, facing the street; sheltering people in their slot.
    return frontSpot(place.building, place.slot, npc.id, { x: 0, z: 0, yaw: 0, sit: false });
  }
  /** The way back onto the sidewalk network from a standing spot at `place`. */
  function leaveFor(place: Place): Waypoint[] {
    if ('poi' in place) return [{ x: place.poi.curb.x, z: place.poi.curb.z, crossing: false }];
    if ('building' in place) return [{ x: place.building.door.x, z: place.building.door.z, crossing: false }, { x: place.building.curb.x, z: place.building.curb.z, crossing: false }];
    return [];
  }
  /** Plans a sidewalk route from wherever the NPC is to `target`, ending at the exact spot. */
  function walkTo(npc: Npc, target: Target, run: boolean) {
    const start: Waypoint[] = [];
    if (npc.inside) start.push({ x: npc.inside.curb.x, z: npc.inside.curb.z, crossing: false });
    else if (npc.state === 'at') start.push(...npc.leave);
    const from = start.length ? start[start.length - 1] : nav.snap(npc.x, npc.z);
    npc.path = [...start, ...nav.route(from.x, from.z, target.curb.x, target.curb.z)];
    if (target.via) npc.path.push({ x: target.via.x, z: target.via.z, crossing: false });
    npc.path.push({ x: target.x, z: target.z, crossing: false });
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
    walkTo(npc, { x: npc.home.door.x, z: npc.home.door.z, curb: npc.home.curb, via: null }, run);
    npc.state = run ? 'fleeing' : 'walking';
  }
  function arrive(npc: Npc) {
    npc.mind.dash = false;
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
    npc.leave = leaveFor(place);
  }
  function startActivity(npc: Npc, next: Activity, run = false) {
    npc.current = next;
    if (npc.state === 'inside' && 'building' in next.place && next.place.inside && npc.inside === next.place.building) return;
    walkTo(npc, placePoint(next.place, npc), run);
    say(npc, run ? pick(LINES.dash) : next.kind === 'work' ? pick(LINES.commute) : next.kind === 'school' ? pick(LINES.school) : next.kind === 'home' ? pick(LINES.home) : '', false);
  }

  // Initial state at the starting hour: everyone is already where their routine says.
  function settle(hour: number) {
    for (const npc of npcs) {
      if (npc.role === 'thief') continue;
      const a = npc.schedule.find((s) => within(hour, s)) ?? npc.schedule[0];
      npc.current = a;
      if ('building' in a.place && a.place.inside) { npc.state = 'inside'; npc.inside = a.place.building; }
      else { npc.inside = null; npc.spot = spotFor(npc, a.place); npc.x = npc.spot.x; npc.z = npc.spot.z; npc.yaw = npc.spot.yaw; npc.state = 'at'; npc.leave = leaveFor(a.place); }
      npc.mind.needs.fatigue = hour >= 20 || hour < 5 ? 0.5 : npc.mind.needs.fatigue;
    }
  }

  let saySink = hooks.say;
  function say(npc: Npc, text: string, shout: boolean) {
    if (text && saySink) saySink(npc, text, shout);
  }
  let focusX = 0, focusZ = 0;
  const nearFocus = (npc: Npc, range = 30) => Math.abs(npc.x - focusX) + Math.abs(npc.z - focusZ) < range * 1.3 && Math.hypot(npc.x - focusX, npc.z - focusZ) < range;

  // --- Brain: shelters, meals, onlookers and chats --------------------------------------------
  type Shelter = { kind: 'front' | 'inside' | 'seat'; building: Building | null; poi: Poi | null; x: number; z: number; weight: number; slots: number; cap: number };
  const shelters: Shelter[] = [];
  for (const b of BUILDINGS) {
    // Slots that stay on this building's own front (clear of the planters at its ends).
    const along = (b.door.x - b.x) * Math.cos(b.facing) - (b.door.z - b.z) * Math.sin(b.facing);
    let slots = 0;
    FRONT_SLOTS.forEach((side, k) => { if (Math.abs(along + side) <= b.w / 2 - 1.3) slots |= 1 << k; });
    const count = [0, 1, 2, 3].filter((k) => slots & (1 << k)).length;
    if (count) shelters.push({ kind: 'front', building: b, poi: null, x: b.door.x, z: b.door.z, weight: b.kind === 'home' ? 1.3 : 1, slots, cap: b.kind === 'home' ? Math.min(2, count) : count });
    if (SHOPS.has(b.kind) && b.w >= 5) shelters.push({ kind: 'inside', building: b, poi: null, x: b.door.x, z: b.door.z, weight: 1.45, slots: 0, cap: 3 });
  }
  for (const p of POIS) if (p.kind === 'bus-stop') shelters.push({ kind: 'seat', building: null, poi: p, x: p.x, z: p.z, weight: 0.9, slots: 0, cap: 1 });
  const frontUsed = new Map<Building, number>(); // bit mask of taken slots
  const insideUsed = new Map<Building, number>();
  const seatUsed = new Map<Poi, number>();
  const bits = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
  function release(npc: Npc) {
    const c = npc.claim;
    if (!c) return;
    if (c.front) frontUsed.set(c.front, (frontUsed.get(c.front) ?? 0) & ~(1 << (c.slot ?? 0)));
    if (c.inside) insideUsed.set(c.inside, Math.max(0, (insideUsed.get(c.inside) ?? 0) - 1));
    if (c.seat) seatUsed.set(c.seat, Math.max(0, (seatUsed.get(c.seat) ?? 0) - 1));
    npc.claim = null;
  }
  /** Someone (else) already sitting or standing on a seat right now. */
  function taken(p: Poi, self: Npc) {
    for (const other of npcs) if (other !== self && visible(other) && Math.abs(other.x - p.x) < 0.5 && Math.abs(other.z - p.z) < 0.5) return true;
    return false;
  }
  /** Nearest dry spot: home if close, else an awning out front, a café or a bus shelter (weighted by distance). */
  function findShelter(npc: Npc): Place {
    const homeDistance = dist(npc, npc.home.door);
    if (npc.gang < 0 && homeDistance < 28) return at(npc.home, true);
    let best: Shelter | null = null, bestCost = Infinity, bestSlot = 0;
    for (const s of shelters) {
      const cost = dist(npc, s) * s.weight;
      if (cost >= bestCost) continue;
      if (s.kind === 'front') {
        const used = frontUsed.get(s.building!) ?? 0;
        if (bits(used) >= s.cap) continue;
        const free = s.slots & ~used;
        if (!free) continue;
        bestSlot = Math.log2(free & -free);
      } else if (s.kind === 'inside') {
        if (npc.gang >= 0 || (insideUsed.get(s.building!) ?? 0) >= s.cap) continue;
      } else if ((seatUsed.get(s.poi!) ?? 0) > 0 || poiLoad.has(s.poi!) && taken(s.poi!, npc)) continue;
      best = s;
      bestCost = cost;
    }
    if (!best || (npc.gang < 0 && bestCost > homeDistance * 0.85 + 8)) return at(npc.home, true);
    if (best.kind === 'front') {
      frontUsed.set(best.building!, (frontUsed.get(best.building!) ?? 0) | (1 << bestSlot));
      npc.claim = { front: best.building!, slot: bestSlot };
      return { building: best.building!, inside: false, slot: bestSlot };
    }
    if (best.kind === 'inside') {
      insideUsed.set(best.building!, (insideUsed.get(best.building!) ?? 0) + 1);
      npc.claim = { inside: best.building! };
      return at(best.building!, true);
    }
    seatUsed.set(best.poi!, 1);
    npc.claim = { seat: best.poi! };
    return { poi: best.poi! };
  }
  /** Somewhere to eat: a free café seat in fine weather, otherwise a table inside a café or food place. */
  function findMeal(npc: Npc, raining: boolean): Place | null {
    if (!raining) {
      let seat: Poi | null = null;
      for (const p of POIS) {
        if (p.kind !== 'cafe-seat' || (seatUsed.get(p) ?? 0) > 0 || dist(npc, p) > 70) continue;
        if (!seat || dist(npc, p) < dist(npc, seat)) seat = p;
      }
      if (seat && !taken(seat, npc)) {
        seatUsed.set(seat, 1);
        npc.claim = { seat };
        return { poi: seat };
      }
    }
    let eatery: Building | null = null;
    for (const b of eateries) if ((insideUsed.get(b) ?? 0) < 4 && (!eatery || dist(npc, b.door) < dist(npc, eatery.door))) eatery = b;
    if (!eatery || dist(npc, eatery.door) > 90) return null;
    insideUsed.set(eatery, (insideUsed.get(eatery) ?? 0) + 1);
    npc.claim = { inside: eatery };
    return at(eatery, true);
  }
  const TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2, Math.PI];
  /** A sidewalk spot `min..max` metres from an incident, on this person's side of it, facing it. */
  function standOff(npc: Npc, inc: Incident, min: number, max: number): Place | null {
    const heading = Math.atan2(npc.x - inc.x, npc.z - inc.z);
    const r = min + (max - min) * (0.3 + 0.5 * ((npc.id * 0.618) % 1));
    for (const turn of TURNS) {
      const a = heading + turn;
      const s = nav.snap(inc.x + Math.sin(a) * r, inc.z + Math.cos(a) * r);
      const seg = s.segment;
      if (seg.crossing) continue;
      // Spread onlookers along the walking line so they do not stack up.
      const len = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az) || 1;
      const t = Math.max(0, Math.min(1, ((s.x - seg.ax) * (seg.bx - seg.ax) + (s.z - seg.az) * (seg.bz - seg.az)) / (len * len) + ((npc.id % 5) - 2) * 0.8 / len));
      const x = seg.ax + (seg.bx - seg.ax) * t, z = seg.az + (seg.bz - seg.az) * t;
      const d = Math.hypot(x - inc.x, z - inc.z);
      if (d < min - 0.5 || d > max + 2) continue;
      return { stand: { x, z, yaw: Math.atan2(inc.x - x, inc.z - z), sit: false, covered: false, curb: { x, z } } };
    }
    return null;
  }
  const make = (kind: Kind, place: Place): Activity => ({ start: 0, end: 0, kind, place, outdoor: !('building' in place && place.inside) });

  /** Ends the current override: frees reserved spots, lets a chat partner go, and hands back to the schedule. */
  function stop(npc: Npc, time: number) {
    const mind = npc.mind;
    if (mind.intent === 'routine') return;
    release(npc);
    if (mind.intent === 'watch' && mind.incident) mind.incident.watchers = Math.max(0, mind.incident.watchers - 1);
    if (mind.intent === 'chat') {
      const other = npcs[mind.partner];
      mind.partner = -1;
      if (other && other.mind.intent === 'chat' && other.mind.partner === npc.id) {
        other.mind.partner = -1;
        engage(other.mind, 'routine', time);
        if (other.state === 'at') { other.current = null; other.checkAt = Math.min(other.checkAt, 0.3); }
      }
    }
    if (npc.state === 'at' || npc.state === 'walking' || npc.state === 'inside') npc.current = null;
    engage(mind, 'routine', time);
  }
  /** Turns a newly chosen intent into a destination. */
  function begin(npc: Npc, intent: Intent, time: number, raining: boolean) {
    const mind = npc.mind;
    engage(mind, intent, time);
    let act: Activity | null = null, run = false, line = '';
    if (intent === 'shelter') {
      act = make('shelter', findShelter(npc));
      run = true;
      line = Math.random() < 0.5 ? pick(LINES.rain) : '';
    } else if (intent === 'eat') {
      const place = findMeal(npc, raining);
      if (place) { act = make('eat', place); line = pick(LINES.hungry); }
    } else if (intent === 'rest') {
      act = make('home', at(npc.home, true));
      line = pick(LINES.tired);
    } else if (intent === 'watch') {
      const inc = mind.incident;
      const place = inc ? standOff(npc, inc, BRAIN.WATCH_NEAR, BRAIN.WATCH_FAR) : null;
      if (inc && place) { act = make('watch', place); inc.watchers++; }
    } else if (intent === 'avoid') {
      // Already indoors: simply stay in until the fear passes.
      if (!visible(npc)) return;
      const inc = mind.incident;
      const place = mind.needs.fear < 0.65 && inc && time < inc.until ? standOff(npc, inc, 22, 30) : null;
      act = place ? make('avoid', place) : make('home', at(npc.home, true));
      run = mind.needs.fear > 0.5;
      line = pick(LINES.avoid);
    }
    if (!act) { engage(mind, 'routine', time); return; }
    npc.current = act;
    if (line && nearFocus(npc)) say(npc, line, false);
    if (npc.state === 'inside' && 'building' in act.place && act.place.inside && npc.inside === act.place.building) return;
    walkTo(npc, placePoint(act.place, npc), run);
  }
  /** Two people walking past each other may stop for a short face-to-face chat. */
  function maybeChat(npc: Npc, other: Npc, time: number, hour: number) {
    const mind = npc.mind, them = other.mind;
    if (npc.state !== 'walking' || npc.run || time < mind.cooldown || mind.needs.social < 0.45 || hour < 6.5 || hour > 21) return;
    if (npc.gang >= 0 || other.gang >= 0 || other.role === 'thief' || npc.role === 'thief') return;
    if (other.state !== 'walking' || other.run || them.intent !== 'routine' || time < them.cooldown || them.needs.social < 0.2) return;
    mind.cooldown = time + 25;
    if (Math.random() > 0.2 + 0.6 * (mind.traits.chattiness + them.traits.chattiness) / 2) return;
    const until = time + 7 + Math.random() * 6;
    let dx = other.x - npc.x, dz = other.z - npc.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = Math.sin(npc.yaw); dz = Math.cos(npc.yaw); d = 1; }
    const ux = dx / d, uz = dz / d, gap = Math.max(0, 1.1 - d) / 2;
    const halt = (a: Npc, b: Npc, x: number, z: number, yaw: number) => {
      engage(a.mind, 'chat', time);
      a.mind.partner = b.id;
      a.mind.until = until;
      a.mind.cooldown = until + 60 + Math.random() * 90;
      a.state = 'at';
      a.spot = { x, z, yaw, sit: false };
      a.leave = [];
      a.speed = 0;
    };
    halt(npc, other, npc.x - ux * gap, npc.z - uz * gap, Math.atan2(ux, uz));
    halt(other, npc, other.x + ux * gap, other.z + uz * gap, Math.atan2(-ux, -uz));
    mind.lineAt = time + 0.3; mind.stage = 0;
    them.lineAt = time + 2.3; them.stage = 1;
  }
  function talk(npc: Npc, time: number) {
    const mind = npc.mind;
    if (time < mind.lineAt) return;
    mind.lineAt = time + 3.4 + Math.random() * 1.6;
    const list = mind.stage === 0 ? LINES.greet : mind.stage === 1 ? LINES.reply : time > mind.until - 3 ? LINES.bye : LINES.smalltalk;
    mind.stage += 2;
    if (nearFocus(npc)) say(npc, pick(list), false);
  }

  const sense = createSense();
  let chatWith: Npc | null = null;
  /** Fills `sense` for one person: where they are, what covers them, who is around. */
  function feel(npc: Npc, next: Activity | null, hour: number, raining: boolean, time: number) {
    const s = sense, mind = npc.mind;
    const outdoors = visible(npc);
    const place = npc.current?.place ?? null;
    const kind = npc.current?.kind;
    s.hour = hour;
    s.raining = raining;
    s.outdoors = outdoors;
    s.role = npc.role;
    s.covered = !outdoors || (npc.state === 'at' && !!place && coveredPlace(place));
    s.destIndoor = !next || coveredPlace(next.place);
    // Walking to a dry destination that is already close: just hurry on.
    let close = false;
    if (npc.state === 'walking') {
      const p = place ? pointOf(place) : npc.home.door;
      close = (!place || coveredPlace(place)) && Math.abs(p.x - npc.x) + Math.abs(p.z - npc.z) < 30;
    }
    s.routineCovered = mind.intent === 'routine' && (s.covered || close);
    s.detour = mind.intent === 'routine' && npc.role !== 'gang' && npc.role !== 'vendor' && (kind === 'leisure' || kind === 'market' || kind === 'eat');
    s.meal = kind === 'eat';
    s.free = npc.gang < 0 && npc.role !== 'thief' && !(npc.state === 'at' && (kind === 'work' || (npc.role === 'vendor' && kind === 'market')));
    s.eating = kind === 'eat' && (npc.state === 'at' || (npc.state === 'inside' && npc.inside !== npc.home));
    s.atHome = npc.state === 'inside' && npc.inside === npc.home;
    s.running = npc.state === 'fleeing' || (npc.state === 'walking' && npc.run);
    let company = 0;
    chatWith = null;
    if (outdoors) {
      let best = 1.9 * 1.9;
      for (const other of npcs) {
        if (other === npc || !visible(other)) continue;
        const d2 = (other.x - npc.x) ** 2 + (other.z - npc.z) ** 2;
        if (d2 < 9) company++;
        if (d2 < best && other.state === 'walking') { best = d2; chatWith = other; }
      }
    }
    s.company = company;
    const inc = mind.incident;
    s.incident = inc && time < inc.until ? Math.hypot(inc.x - npc.x, inc.z - npc.z) : Infinity;
  }
  /** The schedule's turn: head for whatever is due, waiting out the rain indoors without an umbrella. */
  function routine(npc: Npc, next: Activity | null, raining: boolean, dt: number) {
    const mind = npc.mind;
    if (!next) return;
    const moved = !npc.current || !samePlace(next.place, npc.current.place) || (npc.state === 'inside' && npc.inside !== ('building' in next.place ? next.place.building : null));
    if (moved && !(npc.state === 'walking' && npc.current && samePlace(next.place, npc.current.place))) {
      const dry = !raining || mind.traits.umbrella;
      const leaving = !(npc.state === 'inside' && 'building' in next.place && next.place.inside && npc.inside === next.place.building);
      // Indoors or under an awning, people without an umbrella wait for the rain to pass (up to their patience)...
      const sheltered = npc.state === 'inside' || (npc.state === 'at' && !!npc.current && coveredPlace(npc.current.place));
      if (!dry && leaving && sheltered && mind.waited < mind.traits.patience) { mind.waited += dt; return; }
      // ...then run for it.
      const dash = !dry && leaving && npc.state !== 'walking';
      if (dash) mind.dash = true;
      startActivity(npc, next, dash);
      return;
    }
    // Caught in the rain without an umbrella on the way somewhere close and dry: hurry.
    if (raining && npc.state === 'walking' && !mind.traits.umbrella && !npc.run) npc.run = true;
  }
  /** About once a second per person: needs drift, the brain picks an intent, the schedule runs otherwise. */
  function think(npc: Npc, time: number, hour: number, raining: boolean, angry: boolean) {
    const mind = npc.mind;
    const dt = Math.min(5, Math.max(0, time - mind.last));
    mind.last = time;
    const next = due(npc, hour, raining);
    feel(npc, next, hour, raining, time);
    drift(mind, sense, dt);
    if (npc.state === 'afraid' || npc.state === 'fleeing' || npc.state === 'chasing' || angry) { stop(npc, time); return; }
    if (npc.state === 'inside' && npc.timer > 0) { npc.timer -= 1; return; }
    if (mind.intent === 'routine' && chatWith && !raining) maybeChat(npc, chatWith, time, hour);
    const before = mind.intent;
    const after = decide(mind, sense, time);
    if (after !== before) {
      stop(npc, time);
      if (after !== 'routine') begin(npc, after, time, raining);
    }
    if (mind.intent === 'routine') routine(npc, next, raining, dt);
    else if (mind.intent === 'chat') talk(npc, time);
  }

  function knock(npc: Npc, vx: number, vy: number, vz: number, time: number) {
    if (!visible(npc)) return null;
    stop(npc, time);
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
    stop(npc, time);
    goHome(npc, true);
  }

  const incidents = createIncidents();
  const restPoint = new THREE.Vector3();
  let started = false;
  let day = 0;
  let lastHour = 0;
  const events: NpcEvents = { robbed: [], strikes: 0, shots: [], crowd: { outside: 0, umbrellas: 0, sheltering: 0, exposed: 0, watching: 0, chatting: 0 } };

  return {
    npcs,
    gangs: gangState,
    setSay(fn: (npc: Npc, text: string, shout: boolean) => void) { saySink = fn; },
    /** Empties (or refills) the streets; the caller stops calling `update` while disabled. */
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) for (const batch of batches) { batch.begin(); batch.end(); }
    },
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
        else {
          // Scared enough to stay indoors for a while once home.
          npc.mind.needs.fear = Math.max(npc.mind.needs.fear, 0.7);
          flee(npc, time, Math.random() < 0.4);
        }
      }
    },
    /**
     * Reports something people notice: a body, a fire or explosion, a crash, a fight, gunfire. Nearby
     * residents get scared or curious; over the next second or so curious ones gather 8-14 m away to watch
     * and comment, timid ones keep their distance or go home. Repeated reports at the same spot refresh it.
     */
    notice(x: number, z: number, kind: IncidentKind, time: number) {
      const inc = incidents.report(x, z, kind, time);
      const heard = kind === 'shots' || kind === 'fire';
      const radius = INCIDENTS[kind].radius;
      for (const npc of npcs) {
        if (npc.role === 'thief' || npc.state === 'down' || npc.state === 'away' || (!heard && !visible(npc))) continue;
        const d = Math.hypot(npc.x - x, npc.z - z);
        if (d <= radius) perceive(npc.mind, inc, d);
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
      walkTo(thief, { x: far.door.x, z: far.door.z, curb: far.curb, via: null }, true);
      thief.state = 'fleeing';
      say(thief, pick(LINES.thief), true);
      return thief;
    },
    update(dt: number, time: number, hour: number, raining: boolean, threat: Threat, fx: number, fz: number, ground: (x: number, z: number) => number) {
      events.robbed.length = 0;
      events.strikes = 0;
      events.shots.length = 0;
      const stats = events.crowd;
      stats.outside = stats.umbrellas = stats.sheltering = stats.exposed = stats.watching = stats.chatting = 0;
      focusX = fx;
      focusZ = fz;
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
      for (const batch of batches) batch.begin();
      npcs.forEach((npc, i) => {
        const mind = npc.mind;
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
        // --- routine and brain: decide where to be (about once a second, staggered) ---
        npc.checkAt -= dt;
        const angry = npc.gang >= 0 && gangState[npc.gang].anger > 0;
        if (npc.checkAt <= 0 && npc.role !== 'thief') {
          npc.checkAt = 0.8 + Math.random() * 0.6;
          think(npc, time, hour, raining, angry);
        }
        if (npc.state === 'inside') { mind.umbrella = 0; draw(npc, i, time); return; }

        // --- fear: a gun pointed at you ---
        const dx = npc.x - threat.x, dz = npc.z - threat.z;
        const d = Math.hypot(dx, dz);
        if (npc.gang < 0 && npc.role !== 'thief' && threat.aiming && !threat.down && d < 22 && npc.state !== 'fleeing') {
          const gap = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - threat.aimYaw), Math.cos(Math.atan2(dx, dz) - threat.aimYaw)));
          if (gap < (d < 6 ? 0.4 : 0.16)) {
            if (npc.state !== 'afraid') { stop(npc, time); npc.state = 'afraid'; npc.afraidFor = 0; say(npc, pick(LINES.afraid), true); }
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

        // --- umbrella: open while out in the rain, unless sitting, fleeing or under a roof ---
        const roofed = npc.state === 'at' && !!npc.current && coveredPlace(npc.current.place);
        const wantUmbrella = mind.traits.umbrella && raining && npc.pose !== 'sit' && npc.state !== 'fleeing' && npc.state !== 'afraid' && npc.state !== 'chasing'
          && (!roofed || (npc.role === 'vendor' && mind.traits.umbrellaUnderRoof));
        mind.umbrella = THREE.MathUtils.damp(mind.umbrella, wantUmbrella ? 1 : 0, wantUmbrella ? 4 : 7, dt);
        if (mind.umbrella < 0.01) mind.umbrella = 0;

        // --- movement ---
        if (npc.state === 'walking' || npc.state === 'fleeing') {
          const target = npc.path[npc.pathIndex];
          const run = npc.run || npc.state === 'fleeing';
          const want = run ? 3.8 : npc.pace * (mind.umbrella > 0.5 ? 0.85 : 1);
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
          // Settle onto the spot (people who stop to chat step to a comfortable distance).
          const sx = npc.spot.x - npc.x, sz = npc.spot.z - npc.z, off = Math.hypot(sx, sz);
          if (off > 0.02) { const step = Math.min(off, 1.2 * dt); npc.x += sx / off * step; npc.z += sz / off * step; }
          npc.speed = THREE.MathUtils.damp(npc.speed, 0, 6, dt);
          npc.pose = npc.spot.sit ? 'sit' : 'idle';
          const focused = mind.intent === 'chat' || mind.intent === 'watch' || mind.intent === 'avoid';
          npc.targetYaw = npc.spot.yaw + Math.sin(time * 0.2 + npc.id) * (focused ? 0.12 : 0.4);
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
          const intent = mind.intent;
          npc.chatterAt = intent === 'watch' ? 6 + Math.random() * 8 : 14 + Math.random() * 22;
          if (Math.hypot(npc.x - focusX, npc.z - focusZ) < 28 && npc.state !== 'afraid' && intent !== 'chat') {
            const kind = npc.current?.kind;
            const line = intent === 'watch' && mind.incident ? pick(WATCH_LINES[mind.incident.kind])
              : intent === 'avoid' ? pick(LINES.avoid)
              : intent === 'shelter' ? (npc.state === 'at' ? pick(LINES.shelter) : pick(LINES.rain))
              : npc.gang >= 0 ? pick(LINES.gangCalm)
              : raining && mind.umbrella > 0.5 ? pick(LINES.umbrella)
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

        // --- crowd stats ---
        stats.outside++;
        if (mind.umbrella > 0.5) stats.umbrellas++;
        else if (raining && (roofed || mind.intent === 'shelter' && npc.state === 'at')) stats.sheltering++;
        else if (raining) stats.exposed++;
        if (mind.intent === 'watch' && npc.state === 'at') stats.watching++;
        if (mind.intent === 'chat') stats.chatting++;
        draw(npc, i, time);
      });
      for (const batch of batches) batch.end();
      return events;
    },
    dispose() {
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      material.dispose();
    },
  };
}
