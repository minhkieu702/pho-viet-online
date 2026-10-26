import * as THREE from 'three';
import { BUILDINGS, LIFE, PLOTS, POIS, SCENERY, pathClearance, type Building, type HawkerStop, type LifeGroup, type Poi } from './city';
import { DOWNTOWN_X, PLAZA } from './map/consts';
import { createNav, type Waypoint } from './nav';
import { SECONDS_PER_HOUR } from './clock';
import { walkOk } from './signals';
import { CURB_HEIGHT, groundHeight, onSidewalk, seatHeight } from './world';
import {
  ACT_TIME, HOLDS_VESSEL, LIFE_LINES, SEATED, createBookings, createGatherings, lifeActs, openOver, overlaps, spliceSlice, vesselOf,
  type Act, type Goods, type Life, type Vessel,
} from './street-life';
import { HELD, createCrowdProps, createStreetFurniture, createWisps, setPropGlow, type Held } from './crowd-props';
import type { FallMode, HitKind, createRagdolls, RagdollBody, RagdollLook } from './ragdoll';
import {
  ARM, ARM_POSES, BODY_SCALE, CLOTH, FIGURE, FigureBatch, HAND, HEAD, TORSO, chestMatrix, deriveStyle, figureGeometry, figureMaterial, gait, gripMatrix, handCode,
  limbMatrix, mixArm, mixHand, newGait, palette, palettesOf, poseArm, setStyle, sideX, sitDrop, swingCode, twoBoneIK, umbrellaGeometry,
  type ArmPose, type Detail, type FigurePalettes, type FigureStyle,
} from './figures';
import { BRAIN, INCIDENTS, createIncidents, createMind, createSense, decide, drift, engage, perceive, type Incident, type IncidentKind, type Intent, type Mind } from './brain';

type Ragdolls = ReturnType<typeof createRagdolls>;
/** Street-life roles: roaming hawkers (quang gánh, carts), vé số sellers, xe ôm drivers, homemakers and giữ xe attendants. */
type Role = 'worker' | 'student' | 'retiree' | 'vendor' | 'owl' | 'gang' | 'thief' | 'hawker' | 'lottery' | 'xeom' | 'homemaker' | 'guard';
/** A standing spot that is neither a POI nor a building: a place to watch from, or to keep away; `top` a chair's seat height. */
type Stand = { x: number; z: number; yaw: number; sit: boolean; covered: boolean; curb: { x: number; z: number }; top?: number };
/** A building (inside, or out front; `slot` picks a shelter spot under the awning), a POI, or a free standing spot. */
type Place = { building: Building; inside: boolean; slot?: number } | { poi: Poi } | { stand: Stand };
type Kind = 'home' | 'work' | 'eat' | 'leisure' | 'school' | 'market' | 'hang' | 'shelter' | 'watch' | 'avoid';
/** `life` says what the slice is for on the street (street-life.ts); hawkers' slices carry their `goods`. */
type Activity = { start: number; end: number; kind: Kind; place: Place; outdoor: boolean; life?: Life; goods?: Goods };
type State = 'inside' | 'walking' | 'at' | 'afraid' | 'fleeing' | 'chasing' | 'down' | 'away';
type Pose = 'walk' | 'run' | 'idle' | 'sit' | 'hands' | 'fight';
export type { Act } from './street-life';
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
  /** Where they stand or sit; `top` is the seat height above the ground, `floor` where the feet rest (a scooter's floorboard). */
  spot: { x: number; z: number; yaw: number; sit: boolean; top?: number; floor?: number } | null;
  /** Sitting down (0 standing .. 1 seated over half a second), standing up until `riseUntil`, from a seat `seatTop` high. */
  sitT: number; riseUntil: number; seatTop: number; seatFloor: number;
  /** A parameter of the current act (exercise move, lean side, chase runner), and the days incense was lit (morning, dusk). */
  actParam: number; incenseAM: number; incensePM: number;
  /** Gánh baskets swinging fore and aft (angle, rate) and the walking speed a moment ago. */
  pendA: number; pendV: number; lastSpeed: number;
  pose: Pose;
  /** Gait phase (radians, a cycle per two steps), the thigh swing it gives, and how far into a full stride (0..1). */
  stride: number; swing: number; go: number;
  /** Head turn and nod relative to the body, the skirt / tà / ponytail spring, the next blink, mouth moving until, last glance at the player. */
  headYaw: number; headPitch: number; sec: number; secV: number; blinkAt: number; talkUntil: number; glanceAt: number;
  /** Seated: how far forward the front of a skirt or tà lies to reach over the knees (radians), and the back tucked under them. */
  lapFront: number; lapBack: number;
  health: number; hitAt: number;
  afraidFor: number; lastAimed: number; robbedDay: number;
  chatterAt: number; checkAt: number; nextAttack: number;
  body: RagdollBody | null; timer: number; pooled: boolean;
  /** Needs, traits and the current intent (see brain.ts). */
  mind: Mind;
  /** Waypoints from the current standing spot back onto the sidewalk network. */
  leave: Waypoint[];
  claim: Claim | null;
  /** What they are doing on the spot, since when and until when; pacing steps away by (offX, offZ). */
  act: Act; actFrom: number; actUntil: number; offX: number; offZ: number; gaze: number;
  /** The path leg (a crosswalk) the lights have let them start across. */
  crossOk: number;
};
export type GangShot = { from: THREE.Vector3; hit: boolean };
/** People on the street this frame, and what the rain and the brain have them doing. */
export type CrowdStats = { outside: number; umbrellas: number; sheltering: number; exposed: number; watching: number; chatting: number };
export type NpcEvents = { robbed: { npc: Npc; amount: number; shop: boolean }[]; strikes: number; shots: GangShot[]; crowd: CrowdStats };
export type Threat = { x: number; z: number; aimYaw: number; armed: boolean; aiming: boolean; inVehicle: boolean; down: boolean };
export type { IncidentKind } from './brain';

// A standing person (1.71 m at BODY_SCALE, a little more with a hat) for hits and health bars.
const HIT_RADIUS = 0.34;
const HEIGHT = 1.8;
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
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const pick0 = <T,>(list: readonly T[], random: () => number) => list[Math.floor(random() * list.length)];
/** Shelter spots out front, sideways from the door (metres along the facade). */
const FRONT_SLOTS = [-0.7, 0.7, -1.6, 1.6];
/** Out-front slots of street life: the doorstep stool beside the door, and standing by it (sweeping). */
const DOORSTEP = 8, CHORES = 9;
/** Scooter saddle and floorboard heights above the base the scooter stands on (world.ts scooter props). */
const SADDLE = 0.88, FLOORBOARD = 0.34;
/** What the street-life roles wear (wardrobe.ts roles), and who they are. */
const styleRole = (role: Role) => (role === 'hawker' || role === 'lottery' || role === 'homemaker' || role === 'xeom' || role === 'guard' ? 'vendor' : role);
/** Quang gánh hawkers carry a pole and baskets; the others push a cart. */
const POLE_GOODS = new Set<Goods>(['xoi', 'fruit', 'hotvitlon']);
/** Contract names of the street roles other systems look up (interaction prompts). */
const ROLE_NAMES: Record<string, Role> = { 've-so': 'lottery', lottery: 'lottery', 'xe-om': 'xeom', xeom: 'xeom', 'giu-xe': 'guard', guard: 'guard', hawker: 'hawker', homemaker: 'homemaker' };
const EATERIES = new Set<Building['kind']>(['cafe', 'food']);
const SHOPS = new Set<Building['kind']>(['cafe', 'food', 'shop', 'bikeshop', 'post']);

function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The furniture each kind of seat is (world.ts draws it on the ground under it: seatHeight() is the top above the sitter's ground). */
const SEAT_KIND: Partial<Record<Poi['kind'], 'stool' | 'bench'>> = { 'cafe-seat': 'stool', bench: 'bench', 'bus-stop': 'bench' };
const SIDES = [-1, 1] as const;
/**
 * The stride phase as gait() takes it, warped so the thigh swings more like a triangle wave than a sine: the
 * planted foot then keeps pace with the body instead of sliding (about 0.1 m/s of slip at a walk instead of 0.6).
 */
function stridePhase(phase: number) {
  const s = Math.sin(phase);
  const b = s + ((2 / Math.PI) * Math.asin(s) - s) * 0.85;
  return Math.cos(phase) >= 0 ? Math.asin(b) : Math.PI - Math.asin(b);
}
// Arm poses beyond pose.ts ARM_POSES (right-arm convention [swing, abduct, roll, elbow, twist, flex, hand]; poseArm mirrors the left).
const RUN_HAND = handCode(0.7, 0.65, 0.55);
/** Fleeing in a panic: arms up and flailing. */
const FLAIL: ArmPose = [-2.25, 0.5, 0, -0.65, 0, 0, HAND.OPEN];
/** A jab out of the fight guard. */
const JAB: ArmPose = [-1.5, -0.1, 0.15, -0.12, 0.4, 0, HAND.FIST];
/** Filming an incident: the phone held up before the face, screen toward the eyes. */
const FILM: ArmPose = [-1.08, -0.29, 0.03, -1.14, -1.09, 0.76, HAND.PHONE];
/** Sweeping: the right fist high on the broom handle across the chest, the left lower down it. */
const SWEEP_R: ArmPose = [0.22, -0.03, -0.94, -1.59, 0.3, -0.9, HAND.GRIP];
const SWEEP_L: ArmPose = [-0.26, 0.16, -0.98, -0.85, 0.09, -0.25, HAND.GRIP];
/** A glass of trà đá on the lap, upright, and raised to the lips with the elbow down in front of the chest. */
const CUP: ArmPose = [0.12, 0.08, -0.05, -1.44, -0.07, -0.12, HAND.GRIP];
const SIP: ArmPose = [-1.16, -0.25, -0.45, -2.02, 0.27, -0.52, HAND.GRIP];
/** Calling out to passers-by: a cupped hand beside the mouth, the elbow out to the side. */
const SHOUT: ArmPose = [-1.38, 0.53, -0.83, -2.33, -0.81, -0.91, HAND.CUP];
/** Carrying a shopping bag: the arm hangs and barely swings. */
const CARRY: ArmPose = [0.04, 0.12, 0, -0.08, 0.1, 0, HAND.GRIP];
// Street life (street-life.ts acts). Eating: the bowl on the upturned left palm before the chest, chopsticks
// between the bowl and the mouth.
const BOWL: ArmPose = [-0.55, 0.12, -0.35, -1.75, -1.2, 0.1, HAND.CUP];
const CHOP_LOW: ArmPose = [-0.5, -0.12, -0.3, -1.75, 0.5, 0.15, HAND.GRIP];
const CHOP_HIGH: ArmPose = [-1.05, -0.28, -0.45, -2.2, 0.35, -0.4, HAND.GRIP];
/** Holding a newspaper open before the chest (both hands). */
const READ: ArmPose = [-0.8, 0.28, -0.25, -1.35, 0.15, 0.1, HAND.GRIP];
/** Chin on the fist over the chess board, the other arm across under it. */
const THINK: ArmPose = [-1.3, -0.25, -0.55, -2.45, 0.2, -0.3, HAND.FIST];
const THINK_L: ArmPose = [-0.35, -0.15, -1.1, -1.55, 0.8, 0, HAND.RELAXED];
/** Reaching out over the board with a piece between the fingers. */
const REACH_MOVE: ArmPose = [-0.95, -0.08, 0, -0.45, 0.6, 0.35, handCode(0.75, 0.35, 0.6)];
const CLAP: ArmPose = [-0.85, -0.45, -0.3, -1.25, 1.0, 0, HAND.OPEN];
const TOAST: ArmPose = [-1.95, -0.15, -0.2, -1.0, 0.1, -0.3, HAND.GRIP];
/** The mic at the mouth. */
const SING: ArmPose = [-1.15, -0.3, -0.45, -2.15, 0.3, -0.45, HAND.GRIP];
/** Holding out lottery tickets, and carrying the sheaf while walking. */
const OFFER: ArmPose = [-1.3, -0.1, -0.2, -0.3, 0.9, 0.15, HAND.GRIP];
const TICKETS_L: ArmPose = [-0.35, 0.1, -0.2, -1.5, 0.6, 0, HAND.GRIP];
const PAY: ArmPose = [-1.0, 0, 0, -0.9, 0.5, 0, handCode(0.7, 0.4, 0.6)];
/** Incense held up in both hands before the chest, and setting it in the pot. */
const INCENSE: ArmPose = [-0.75, -0.4, -0.35, -1.7, 0.6, 0.1, HAND.FIST];
const PLACE: ArmPose = [-0.9, -0.1, 0, -0.6, 0.4, 0.2, handCode(0.6, 0.4, 0.5)];
/** Stirring the stock pot with a ladle. */
const LADLE: ArmPose = [-1.05, 0.05, 0, -0.7, 0.2, 0.1, HAND.GRIP];
/** Feeding pigeons: a bag of crumbs at the waist, the other hand tossing them. */
const BAG_L: ArmPose = [-0.25, 0.15, 0, -1.3, 0.6, 0.2, HAND.GRIP];
const THROW: ArmPose = [-1.0, 0.1, 0, -0.3, 0.3, 0, HAND.OPEN];
/** Both hands on a push cart's handle bar. */
const PUSH: ArmPose = [-0.95, -0.12, 0, -0.6, 0.8, 0, HAND.GRIP];
/** An arm out to the partner's shoulder (couples), out for balance (a kick), loose and ready (đá cầu), reaching down. */
const LEAN_IN: ArmPose = [-0.3, 0.9, -0.2, -0.3, 0.9, 0, HAND.OPEN];
const BALANCE: ArmPose = [-0.3, 0.8, 0, -0.4, 0, 0, HAND.OPEN];
const READY: ArmPose = [-0.35, 0.35, 0, -0.9, 0.5, 0, HAND.RELAXED];
const STOOP: ArmPose = [-0.9, 0, 0, -0.2, 0, 0, HAND.OPEN];
/** Dưỡng sinh: arms raised forward, overhead, out to the sides, and the tai chi push. */
const ARMS_UP: ArmPose = [-1.6, 0.15, 0, -0.1, 0, 0, HAND.OPEN];
const ARMS_OVER: ArmPose = [-2.9, 0.4, 0, -0.25, 0, 0, HAND.OPEN];
const ARMS_SIDE: ArmPose = [0, 1.45, 0, -0.1, 0, 0, HAND.OPEN];
const PUSH_TAICHI: ArmPose = [-1.35, -0.15, 0, -1.2, 0.9, -0.9, HAND.OPEN];
/** Plastic stools carried out to the doorstep. */
const STOOL_COLORS = ['#d23c33', '#2f6fb5', '#3f9a5a', '#e8b53a', '#e07aa0'].map((c) => new THREE.Color(c));

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
  hooks: {
    onRest?: (x: number, z: number) => void; say?: (npc: Npc, text: string, shout: boolean) => void;
    /** Crumbs scattered for the pigeons at (x, z) (animals.ts lure). */
    onFeed?: (x: number, z: number) => void;
    /** Whether a parked scooter still stands at (x, z) (vehicles.ts curb bikes): xe ôm and couples sit on them. */
    bikeAt?: (x: number, z: number) => boolean;
  } = {},
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
      speed: 0, pace: 1.45 + random() * 0.45, run: false, spot: null, pose: 'idle', stride: random() * 10, swing: 0, go: 0,
      // Animation state takes nothing from the seeded stream, so routines stay exactly as they were.
      headYaw: 0, headPitch: 0, sec: 0, secV: 0, blinkAt: ((npcs.length * 0.618) % 1) * 5, talkUntil: 0, glanceAt: -99, lapFront: 1.3, lapBack: 1.2,
      health: gang >= 0 ? GANG_HEALTH : MAX_HEALTH, hitAt: -99, afraidFor: 0, lastAimed: -99, robbedDay: -1,
      chatterAt: random() * 20, checkAt: random() * 2, nextAttack: 0, body: null, timer: 0, pooled: false,
      mind: createMind(mindRandom, role), leave: [], claim: null,
      act: 'none', actFrom: 0, actUntil: random() * 4, offX: 0, offZ: 0, gaze: 0, crossOk: -1,
      sitT: 0, riseUntil: -1, seatTop: 0.5, seatFloor: 0, actParam: 0, incenseAM: -1, incensePM: -1, pendA: 0, pendV: 0, lastSpeed: 0,
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
  // The nightlife strip (Phố đêm Phượng Vĩ, the road at z = 54 between x 58 and 96) and the walking street (PLAZA).
  const STRIP = { x: 78, z: 54 }, WALKING_STREET = { x: (PLAZA.minX + PLAZA.maxX) / 2, z: (PLAZA.minZ + PLAZA.maxZ) / 2 };
  // More night owls, living within reach of the strip: they sleep in, brunch at a quán and go out at night. Their own
  // stream, so the residents above keep their days.
  {
    let owlSeed = 6113;
    const owlRandom = () => { owlSeed = (owlSeed * 16807) % 2147483647; return (owlSeed - 1) / 2147483646; };
    const near = homes.filter((b) => b.x < DOWNTOWN_X && dist(b.door, STRIP) < 170);
    for (let k = 0; k < 8 && near.length; k++) {
      const home = near[Math.floor(owlRandom() * near.length)], j = (owlRandom() - 0.5) * 0.8;
      const night = nearestPoi(home, ['square', 'bus-stop', 'bench']);
      const brunch = nearestPoi(home, ['cafe-seat'], true);
      addNpc('owl', home, [
        activity(23.5 + j, 10.2, 'home', at(home, true)), activity(10.2, 11.6, 'eat', out(brunch, home)),
        activity(11.6, 18.4 + j, 'home', at(home, true)), activity(18.4 + j, 23.5 + j, 'leisure', out(night, home)),
      ], { shirt: SHIRTS[Math.floor(owlRandom() * SHIRTS.length)], pants: PANTS[Math.floor(owlRandom() * PANTS.length)], skin: SKINS[Math.floor(owlRandom() * SKINS.length)] });
    }
  }
  // ---- Street life (street-life.ts, city.ts LIFE): breakfast, lunch and evening beers at the quán stools, coffee
  // and the newspaper, dưỡng sinh at dawn, cờ tướng in the afternoon, đá cầu after school, doorstep stools, couples
  // and karaoke at night; then the hawkers, vé số sellers, xe ôm drivers, homemakers and giữ xe attendants. All of it
  // comes from its own seeded stream, and every overlay keeps the schedule a whole day (or is not made).
  let lifeSeed = 9173;
  const lifeRandom = () => { lifeSeed = (lifeSeed * 16807) % 2147483647; return (lifeSeed - 1) / 2147483646; };
  const bookings = createBookings();
  const lifePois = POIS.filter((p) => p.group !== undefined);
  const groupOf = (p: Poi) => LIFE.groups[p.group!];
  const walkCost = (a: { x: number; z: number }, b: { x: number; z: number }) => (Math.abs(a.x - b.x) + Math.abs(a.z - b.z)) * 1.15;
  const isFem = (npc: Npc) => deriveStyle(npc.look, npc.id, styleRole(npc.role)).fem;
  const lifeAct = (start: number, end: number, kind: Kind, place: Place, life?: Life, goods?: Goods): Activity => ({ ...activity(start, end, kind, place), life, goods });
  /**
   * Puts a slice at one of the bookable life spots of `kinds` (nearest to any of `from` within `travel` metres, open
   * over the slice, passing `ok`) into someone's day. Returns the spot, or null and leaves the day as it was.
   */
  function overlay(npc: Npc, kinds: Poi['kind'][], from: { x: number; z: number }[], start: number, end: number, travel: number,
    make: (p: Poi) => Activity, ok?: (g: LifeGroup, p: Poi) => boolean, bias?: (g: LifeGroup, p: Poi) => number) {
    const options: [number, Poi][] = [];
    for (const p of lifePois) {
      if (!kinds.includes(p.kind)) continue;
      const g = groupOf(p);
      if ((ok && !ok(g, p)) || !openOver(g.hours, start, end)) continue;
      const d = Math.min(...from.map((f) => walkCost(f, p)));
      if (d <= travel) options.push([d + lifeRandom() * 12 + (bias?.(g, p) ?? 0), p]);
    }
    options.sort((a, b) => a[0] - b[0]);
    for (const [, p] of options) {
      if (!bookings.free(p.id, start, end)) continue;
      const next = npc.schedule.slice();
      if (!spliceSlice(next, make(p)) || !bookings.book(p.id, start, end)) return null;
      npc.schedule = next;
      return p;
    }
    return null;
  }
  /** Huddle centres on the strip: the north kerb between the walking line and the bike rows, the south kerb band. */
  const STRIP_HUDDLES: [number, number][] = [
    [65.2, 63.55], [71, 63.55], [74.6, 63.55], [77.6, 63.55], [80, 63.55], [83.2, 63.55], [86.5, 63.55], [91.6, 63.55],
    [74.4, 66.9], [83.2, 66.9], [86.4, 66.9],
    [63.8, 46.45], [66.2, 46.45], [70.2, 46.45], [73.8, 46.45], [76.6, 46.45], [79.6, 46.45], [83.2, 46.45], [93.6, 46.45],
  ];
  /** Huddle centres on the walking street: open paving off its paths, clear of the fountain, the benches and the play rings. */
  function plazaHuddles() {
    const out: [number, number][] = [];
    for (let z = PLAZA.minZ + 2; z <= PLAZA.maxZ - 2; z += 4.2) for (let x = PLAZA.minX + 2; x <= PLAZA.maxX - 2; x += 4.6) {
      if (pathClearance(x, z) < 1.3 || !world.clear(x, z, 1.0)) continue;
      if (POIS.some((p) => Math.hypot(p.x - x, p.z - z) < 2.4)) continue;
      out.push([x, z]);
    }
    return out;
  }
  /** Two or three standing places round each centre, facing it (those clear of the world); stand ids for bookings. */
  const STAND_ID = -10000;
  const standIds = new Map<Place, number>();
  function huddles(centres: [number, number][]) {
    const list: Place[] = [];
    centres.forEach(([cx, cz], h) => {
      const n = 2 + (h % 2), a0 = h * 1.3;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * 2 * Math.PI) / n, x = cx + Math.sin(a) * 0.55, z = cz + Math.cos(a) * 0.55;
        if (!world.clear(x, z, 0.3)) continue;
        const c = nav.snap(x, z), place: Place = { stand: { x, z, yaw: Math.atan2(cx - x, cz - z), sit: false, covered: false, curb: { x: c.x, z: c.z } } };
        standIds.set(place, standIds.size);
        list.push(place);
      }
    });
    return list;
  }
  /** A slice somewhere that needs no booking (out front of a building, a park spot); false if it does not fit the day. */
  function put(npc: Npc, a: Activity) {
    const next = npc.schedule.slice();
    if (!spliceSlice(next, a)) return false;
    npc.schedule = next;
    return true;
  }
  const BREAKFAST = new Set(['pho', 'xoi', 'banhmi', 'bunrieu', 'banhcuon', 'chao', 'banhcanh', 'cafe']);
  const LUNCH = new Set(['bun', 'com', 'bunrieu']);
  const DOWNTOWN_LUNCH = new Set([...LUNCH, 'pho', 'cafe', 'trasua']);
  const NHAU_DISHES = new Set(['bia', 'bun', 'com', 'banhxeo']);
  /** The bia hơi draws the drinkers (it counts as 40 m nearer than it is), and they fill a table before the next. */
  const BIA_FIRST = (g: LifeGroup, p: Poi) => (g.dish === 'bia' ? -40 : 0) + (p.slot ?? 0) * 3;
  const eatery = (dishes: Set<string>) => (g: LifeGroup) => (g.kind === 'eatery' || g.kind === 'beer') && !!g.dish && dishes.has(g.dish);
  const meal = (start: number, end: number) => (p: Poi) => lifeAct(start, end, 'eat', { poi: p }, groupOf(p).dish === 'cafe' || groupOf(p).dish === 'trasua' ? 'coffee' : 'meal');
  const doorstep = (b: Building) => LIFE.doorsteps[b.id] !== 0;
  const cooks = new Map<Building, number>();
  // Dưỡng sinh troupes of six to nine rather than troupes of one: the troupe with the most retirees out in the morning
  // within 180 m opens first, and only with five or more; the rest join the nearest troupe that opened, if in reach.
  const troupeOf = new Map<Npc, LifeGroup>();
  {
    const left = new Set(npcs.filter((n) => n.role === 'retiree' && n.schedule.some((a) => a.kind === 'leisure' && a.start < 9)));
    const troupes = LIFE.groups.filter((g) => g.kind === 'exercise'), opened: LifeGroup[] = [], size = new Map<LifeGroup, number>();
    const reach = (g: LifeGroup) => [...left].filter((n) => walkCost(n.home.door, g) < 180).sort((a, b) => walkCost(a.home.door, g) - walkCost(b.home.door, g));
    for (;;) {
      let best: LifeGroup | null = null, most = 0;
      for (const g of troupes) if (!opened.includes(g)) { const n = Math.min(reach(g).length, g.slots.length - 1); if (n > most) { best = g; most = n; } }
      if (!best || most < 5) break;
      opened.push(best);
      const take = reach(best).slice(0, best.slots.length - 1);
      for (const n of take) { troupeOf.set(n, best); left.delete(n); }
      size.set(best, take.length);
    }
    for (const n of left) {
      const g = opened.filter((t) => walkCost(n.home.door, t) < 180 && (size.get(t) ?? 0) < t.slots.length).sort((a, b) => walkCost(n.home.door, a) - walkCost(n.home.door, b))[0];
      if (g) { troupeOf.set(n, g); size.set(g, (size.get(g) ?? 0) + 1); }
    }
  }
  const evening: Npc[] = [];
  const drinkers: { npc: Npc; from: number; job: Building }[] = [];
  for (const npc of [...npcs]) {
    const home = npc.home, male = !isFem(npc);
    if (npc.role === 'worker') {
      const work = npc.schedule.find((a) => a.kind === 'work');
      if (!work || !('building' in work.place)) continue;
      const job = work.place.building, ws = work.start;
      const late = npc.schedule.filter((a) => a.kind === 'work').reduce((e, a) => (a.start > 12 ? a.end : e), 17.4);
      // The first shop worker at a quán with a pot cooks at it.
      if (!work.place.inside && !cooks.has(job) && LIFE.groups.some((g) => g.building === job.id && g.cook)) {
        // A family quán keeps its cook at the pot from before the first bowl to after the last (lunch eaten there).
        cooks.set(job, npc.id);
        put(npc, lifeAct(5.8, 20.5, 'work', work.place, 'cook'));
        continue;
      }
      if (lifeRandom() < 0.4) overlay(npc, ['stool'], [home.door, job.door], ws - 0.8, ws - 0.15, 70, meal(ws - 0.8, ws - 0.15), eatery(BREAKFAST));
      if (job.x > DOWNTOWN_X) {
        // Cơm văn phòng: downtown quán are few and far between, so office workers walk further and eat in two shifts.
        const [s0, s1] = npc.id % 2 ? [11.4, 12.2] : [12.2, 13.0];
        overlay(npc, ['stool'], [job.door], s0, s1, 160, meal(s0, s1), eatery(DOWNTOWN_LUNCH));
      } else overlay(npc, ['stool'], [job.door], 11.5, 12.9, 70, meal(11.5, 12.9), eatery(LUNCH));
      const roll = lifeRandom();
      // Men after work go for a beer (seated in the evening pass, nearest the bia hơi first); some take a trà đá.
      if (roll < (male ? 0.7 : 0.12)) drinkers.push({ npc, from: late + 0.2, job });
      else if (roll < 0.85) overlay(npc, ['stool'], [job.door, home.door], late + 0.1, late + 1.2, 70, (p) => lifeAct(late + 0.1, late + 1.2, 'eat', { poi: p }, 'tea'), eatery(new Set(['cafe', 'trasua'])));
      else evening.push(npc);
    } else if (npc.role === 'retiree') {
      const morning = npc.schedule.find((a) => a.kind === 'leisure' && a.start < 9);
      if (morning) {
        // Dưỡng sinh with the troupe picked above; whoever books first leads it from the front.
        // Those with a long walk set out earlier (paths round the blocks and red lights are longer than the estimate).
        const g = troupeOf.get(npc);
        const from = Math.min(morning.start, 5 + (npc.id % 5) * 0.06) - (g ? Math.min(0.9, walkCost(home.door, g) / 220) : 0);
        const slot = g?.slots.find((id) => bookings.free(id, from, 6.7));
        if (slot !== undefined && put(npc, lifeAct(from, 6.7, 'leisure', { poi: POIS[slot] }, 'exercise'))) bookings.book(slot, from, 6.7);
      }
      // Coffee and the newspaper after the exercise, near the troupe or home.
      const troupe = npc.schedule.find((a) => a.life === 'exercise')?.place;
      const coffee = (p: Poi) => lifeAct(6.7, 9.6, 'eat', { poi: p }, 'coffee');
      if (!(troupe && 'poi' in troupe && overlay(npc, ['stool'], [troupe.poi], 6.7, 9.6, 80, coffee, (g) => g.kind === 'eatery'))) overlay(npc, ['stool'], [home.door], 6.7, 9.6, 110, coffee, (g) => g.kind === 'eatery');
      if (lifeRandom() < 0.4 && doorstep(home)) put(npc, lifeAct(9.8, 11.2, 'leisure', { building: home, inside: false, slot: DOORSTEP }, 'doorstep'));
      if (lifeRandom() < 0.3 && doorstep(home)) put(npc, lifeAct(19, 20.4, 'leisure', { building: home, inside: false, slot: DOORSTEP }, 'doorstep'));
      if (!male) {
        // Grandmothers feed the pigeons in the square or the pagoda yard in the afternoon.
        const after = npc.schedule.find((a) => a.kind === 'leisure' && a.start >= 14.5 && a.start < 15.6);
        const spot = after && POIS.filter((p) => (p.kind === 'square' || p.kind === 'pagoda-yard' || (p.kind === 'park' && p.z > -128)) && walkCost(home.door, p) < 150)
          .sort((a, b) => walkCost(home.door, a) - walkCost(home.door, b))[Math.floor(lifeRandom() * 2)];
        if (after && spot) put(npc, lifeAct(after.start, after.end, 'leisure', { poi: spot }, 'feed'));
      }
    } else if (npc.role === 'student') {
      const school = BUILDINGS.find((b) => b.kind === 'school')!;
      overlay(npc, ['ring'], [school.door], 11, 11.7, 60, (p) => lifeAct(11, 11.7, 'leisure', { poi: p }, 'shuttle'), (g) => g.kind === 'ring');
      overlay(npc, ['ring'], [school.door, home.door], 16.4, 17.4, 150, (p) => lifeAct(16.4, 17.4, 'leisure', { poi: p }, groupOf(p).kind === 'chase' ? 'chase' : 'shuttle'));
    } else if (npc.role === 'owl') {
      overlay(npc, ['stool'], [home.door], 10.8, 12.9, 100, meal(10.8, 12.9), eatery(new Set([...LUNCH, 'pho'])));
      evening.push(npc);
    }
  }
  // Cờ tướng: retired men (and men who keep late hours) sit down at the boards nearest their homes, two to a board,
  // nearest pairs first; whoever is left nearby stands round and watches.
  {
    const men = npcs.filter((n) => (n.role === 'retiree' || n.role === 'owl') && !isFem(n));
    const afternoon = (n: Npc) => {
      const a = n.schedule.find((s) => s.kind === 'leisure' && s.start >= 14.5 && s.start < 15.6);
      return a || n.role === 'owl' ? [14.7 + (n.id % 4) * 0.05, 17.6] : null;
    };
    const boards = LIFE.groups.filter((gr) => gr.kind === 'chess');
    const pairs = boards.flatMap((g) => men.map((n) => ({ g, n, d: walkCost(n.home.door, g) }))).filter((p) => p.d < 220).sort((a, b) => a.d - b.d);
    const seated = new Map<LifeGroup, number>(), busy = new Set<Npc>();
    for (const pass of ['chess', 'kibitz'] as const) {
      for (const { g, n } of pairs) {
        const k = seated.get(g) ?? 0;
        if (busy.has(n) || (pass === 'chess' ? k >= 2 : k < 2 || k >= 4)) continue;
        const span = afternoon(n);
        if (!span) continue;
        const slot = g.slots[k];
        if (!bookings.free(slot, span[0], span[1]) || !put(n, lifeAct(span[0], span[1], 'leisure', { poi: POIS[slot] }, pass))) continue;
        bookings.book(slot, span[0], span[1]);
        busy.add(n);
        seated.set(g, k + 1);
      }
    }
  }
  // Evenings: couples on their scooters by the river, the sidewalk karaoke, and owls at the bia hơi.
  {
    const pool = evening.filter((n) => n.role === 'worker' || n.role === 'owl');
    for (const g of LIFE.groups.filter((gr) => gr.kind === 'couple')) {
      const near = pool.filter((n) => walkCost(n.home.door, g) < 220).sort((a, b) => walkCost(a.home.door, g) - walkCost(b.home.door, g));
      const pair: Npc[] = [];
      for (const n of near) {
        if (pair.length === 2) break;
        const from = 19 + (n.id % 5) * 0.08;
        if (put(n, lifeAct(from, 22.6, 'leisure', { poi: POIS[g.slots[pair.length]] }, 'couple'))) { bookings.book(g.slots[pair.length], from, 22.6); pair.push(n); }
      }
      for (const n of pair) pool.splice(pool.indexOf(n), 1);
    }
    for (const g of LIFE.groups.filter((gr) => gr.kind === 'karaoke')) {
      const near = [...pool, ...npcs.filter((n) => n.role === 'retiree')].filter((n) => walkCost(n.home.door, g) < 150).sort((a, b) => walkCost(a.home.door, g) - walkCost(b.home.door, g));
      let k = 0;
      for (const n of near) {
        if (k >= g.slots.length) break;
        // The singer (the stage, the last slot) arrives first.
        const slot = g.slots[(g.slots.length - 1 + k) % g.slots.length], from = k ? 19.7 + k * 0.1 : 19.5;
        if (!bookings.free(slot, from, 22.4) || !put(n, lifeAct(from, 22.4, 'leisure', { poi: POIS[slot] }, 'karaoke'))) continue;
        bookings.book(slot, from, 22.4);
        k++;
        const i = pool.indexOf(n);
        if (i >= 0) pool.splice(i, 1);
      }
    }
    // Bia hơi and nhậu: the drinkers nearest the bia hơi sit down first, then the owls who are still free.
    const bia = LIFE.groups.find((g) => g.dish === 'bia');
    for (const n of pool) if (n.role === 'owl' && !isFem(n)) drinkers.push({ npc: n, from: 18.6, job: n.home });
    if (bia) drinkers.sort((a, b) => walkCost(a.npc.home.door, bia) - walkCost(b.npc.home.door, bia));
    for (const { npc: n, from, job } of drinkers) {
      const end = n.role === 'owl' ? 23.4 : 21.8;
      overlay(n, ['stool'], [job.door, n.home.door], from, end, n.role === 'owl' ? 200 : 140, (p) => lifeAct(from, end, 'eat', { poi: p }, 'beer'), eatery(NHAU_DISHES), BIA_FIRST);
    }
    // Phố đêm: groups of two or three by their bikes and the doors of the strip from 20:30 into the small hours (the
    // owls, half of them till past one, and some younger workers after dinner or a beer). Stands are booked like seats.
    const stripStands = huddles(STRIP_HUDDLES);
    const goOut = (n: Npc, stands: Place[], from: number, end: number) => {
      // Round what is already planned (a beer, a date by the river, the karaoke): out after it, or back before it.
      for (const a of n.schedule) {
        if (!a.life || !overlaps(a.start, a.end, from, end)) continue;
        if ((from - a.start + 24) % 24 < 12) from = (a.end + 0.05) % 24; else end = (a.start - 0.05 + 24) % 24;
      }
      if ((end - from + 24) % 24 < 0.6 || (end - from + 24) % 24 > 8 || n.schedule.some((a) => a.life && overlaps(a.start, a.end, from, end))) return false;
      const k0 = Math.floor(lifeRandom() * stands.length);
      for (let k = 0; k < stands.length; k++) {
        const i = (k0 + k) % stands.length, id = STAND_ID - standIds.get(stands[i])!;
        if (!bookings.free(id, from, end)) continue;
        if (put(n, lifeAct(from, end, 'leisure', stands[i]))) { bookings.book(id, from, end); return true; }
      }
      return false;
    };
    // The owls first (it is their night out), then the workers.
    for (const n of [...npcs.filter((m) => m.role === 'owl'), ...npcs.filter((m) => m.role === 'worker')]) {
      if (n.role !== 'owl' && lifeRandom() >= 0.5) continue;
      if (walkCost(n.home.door, STRIP) > 280) continue;
      const beer = n.schedule.find((a) => a.life === 'beer'), owl = n.role === 'owl';
      const from = beer ? beer.end + 0.05 : owl ? 20.5 + (n.id % 4) * 0.1 : 20.9 + (n.id % 3) * 0.1;
      const end = owl ? (n.id % 2 ? 0.8 + (n.id % 5) * 0.2 : 23.9) : 23.3;
      goOut(n, stripStands, from, end);
    }
    // Nguyễn Huệ walking street in the evening: the people living downtown, owls within reach, and office workers on
    // their way home.
    const plazaStands = huddles(plazaHuddles());
    for (const n of npcs) {
      const work = n.schedule.find((a) => a.kind === 'work' && 'building' in a.place);
      const job = work && 'building' in work.place ? work.place.building : null;
      if (n.home.x > DOWNTOWN_X && (n.role === 'worker' || n.role === 'retiree' || n.role === 'owl') && lifeRandom() < 0.75) {
        goOut(n, plazaStands, n.role === 'retiree' ? 18.6 : 19.2 + (n.id % 4) * 0.1, n.role === 'retiree' ? 20.8 : 22.2);
      } else if (n.role === 'owl' && walkCost(n.home.door, WALKING_STREET) < 260 && !n.schedule.some((a) => 'stand' in a.place)) {
        goOut(n, plazaStands, 19.0, 22.4);
      } else if (job && job.x > DOWNTOWN_X && n.role === 'worker' && lifeRandom() < 0.6) {
        const late = n.schedule.filter((a) => a.kind === 'work').reduce((e, a) => (a.start > 12 ? a.end : e), 17.4);
        goOut(n, plazaStands, late + 0.1, late + 1.4);
      }
    }
  }

  // Chợ sáng: shoppers at the sạp of the An Hòa market lane from dawn, standing beside the vendors along each long side
  // (retirees not at dưỡng sinh, and some workers before work).
  {
    const stalls = POIS.filter((p) => p.kind === 'market' && p.x < 0 && p.z > 0);
    const spots: [number, number][] = [];
    for (const v of stalls) for (const dx of [-1.4, 1.4]) spots.push([v.x + dx, v.z + (v.yaw === 0 ? 0.15 : -0.15)]);
    const shopStands: Place[] = [];
    for (const [x, z] of spots) {
      if (!world.clear(x, z, 0.3)) continue;
      const c = nav.snap(x, z), place: Place = { stand: { x, z, yaw: z < 32 ? 0 : Math.PI, sit: false, covered: false, curb: { x: c.x, z: c.z } } };
      standIds.set(place, standIds.size);
      shopStands.push(place);
    }
    const lane = { x: -31, z: 32 };
    for (const n of npcs) {
      if (walkCost(n.home.door, lane) > 170) continue;
      const retired = n.role === 'retiree' && !n.schedule.some((a) => a.life === 'exercise');
      if (!retired && !(n.role === 'worker' && lifeRandom() < 0.3)) continue;
      const from = retired ? 5.7 + (n.id % 4) * 0.15 : 6.2, end = retired ? 6.6 + (n.id % 3) * 0.2 : 6.75;
      if (n.schedule.some((a) => a.life && overlaps(a.start, a.end, from, end))) continue;
      const k0 = Math.floor(lifeRandom() * shopStands.length);
      for (let k = 0; k < shopStands.length; k++) {
        const place = shopStands[(k0 + k) % shopStands.length], id = STAND_ID - standIds.get(place)!;
        if (!bookings.free(id, from, end)) continue;
        if (put(n, lifeAct(from, end, 'market', place))) { bookings.book(id, from, end); break; }
      }
    }
  }
  // New people of the street, each living in an An Hòa house; their days are built slice by slice round home.
  const streetHomes = homes.filter((b) => b.x < 135 && (PLOTS[b.id].style === 'home' || PLOTS[b.id].style === 'legacy'));
  const homeFor = () => streetHomes[Math.floor(lifeRandom() * streetHomes.length)];
  /** One of the three street homes nearest a spot (people who keep a post all day live close to it). */
  const homeNear = (p: { x: number; z: number }) => streetHomes.slice().sort((a, b) => walkCost(a.door, p) - walkCost(b.door, p))[Math.floor(lifeRandom() * 3)];
  /** A whole day from slices (sorted, not overlapping): home fills the gaps. */
  function wholeDay(home: Building, slices: Activity[]) {
    const list: Activity[] = [];
    const sorted = slices.slice().sort((a, b) => a.start - b.start);
    sorted.forEach((a, k) => {
      const next = sorted[(k + 1) % sorted.length];
      list.push(a);
      const gap = (next.start - a.end + 24) % 24;
      if (gap > 1e-6) list.push(activity(a.end, next.start, 'home', at(home, true)));
    });
    return list;
  }
  const stand = (s: { x: number; z: number; yaw: number; curb: { x: number; z: number } }, sit = false, top?: number): Place => ({ stand: { x: s.x, z: s.z, yaw: s.yaw, sit, covered: false, curb: s.curb, top } });
  /** Stops round the An Hòa block nearest `from` on its inner curbs, in walking order (every `every`-th stop). */
  function round(from: { x: number; z: number }, every: number) {
    const rx = [-108, -54, 0, 54, 108], cx = Math.max(-81, Math.min(81, Math.round((from.x + 27) / 54) * 54 - 27)), cz = Math.max(-81, Math.min(81, Math.round((from.z + 27) / 54) * 54 - 27));
    const x0 = rx.reduce((a, b) => (Math.abs(b - (cx - 27)) < Math.abs(a - (cx - 27)) ? b : a)), x1 = x0 + 54, z0 = rx.reduce((a, b) => (Math.abs(b - (cz - 27)) < Math.abs(a - (cz - 27)) ? b : a)), z1 = z0 + 54;
    const on = (s: HawkerStop) => (s.axis === 'h' ? ((s.road === z0 && s.side > 0) || (s.road === z1 && s.side < 0)) && s.x > x0 && s.x < x1
      : ((s.road === x0 && s.side > 0) || (s.road === x1 && s.side < 0)) && s.z > z0 && s.z < z1);
    const ring = LIFE.hawkerStops.filter(on).sort((a, b) => Math.atan2(a.x - cx, a.z - cz) - Math.atan2(b.x - cx, b.z - cz));
    return ring.filter((_, k) => k % every === 0);
  }
  const HAWKERS: [Goods, number, [number, number][]][] = [
    ['xoi', 1.0, [[5, 9]]], ['banhmi', 0.9, [[5.3, 9.5], [15.5, 19.5]]], ['fruit', 1.05, [[8, 11.5], [14.5, 17.5]]], ['kem', 0.9, [[13, 17.5]]], ['hotvitlon', 1.0, [[18.5, 23]]],
  ];
  for (const [goods, pace, spans] of HAWKERS) {
    const home = homeFor();
    const stops = round(home.door, 2);
    if (stops.length < 4) continue;
    const slices: Activity[] = [];
    let k = Math.floor(lifeRandom() * stops.length);
    for (const [from, to] of spans) for (let t = from; t + 0.3 <= to + 1e-6; t += 0.5) slices.push(lifeAct(t, Math.min(to, t + 0.5), 'work', stand(stops[k++ % stops.length]), 'hawk', goods));
    const look: RagdollLook = { shirt: SHIRTS[Math.floor(lifeRandom() * SHIRTS.length)], pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)], hat: '#e5cf92' };
    addNpc('hawker', home, wholeDay(home, slices), look);
    npcs[npcs.length - 1].pace = 1.25 * pace;
  }
  // Vé số sellers go from quán to quán, stopping where the tables are.
  for (let s = 0; s < 3; s++) {
    const home = homeFor();
    const vends = LIFE.groups.filter((g) => g.vend && walkCost(home.door, g) < 160);
    if (vends.length < 3) continue;
    // A loop: nearest next stop each time.
    const order: LifeGroup[] = [];
    let at0: { x: number; z: number } = home.door;
    const left = vends.slice();
    while (left.length && order.length < 10) {
      left.sort((a, b) => walkCost(at0, a.vend!) - walkCost(at0, b.vend!));
      const g = left.shift()!;
      order.push(g);
      at0 = g.vend!;
    }
    const slices: Activity[] = [];
    let k = 0;
    for (const [from, to] of [[7, 11], [13, 18.5]]) for (let t = from; t + 0.3 <= to + 1e-6; t += 0.5) {
      const g = order[k++ % order.length], v = g.vend!;
      slices.push(lifeAct(t, Math.min(to, t + 0.5), 'work', { stand: { x: v.x, z: v.z, yaw: v.yaw, sit: false, covered: false, curb: POIS[g.slots[0]].curb } }, 'lottery'));
    }
    addNpc('lottery', home, wholeDay(home, slices), { shirt: SHIRTS[Math.floor(lifeRandom() * SHIRTS.length)], pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)], hat: '#e5cf92' });
    npcs[npcs.length - 1].pace = 1.2;
  }
  // Each vé số glass case has its seller on a stool beside it all day (lunch from a quán's takeaway, eaten there).
  for (const c of SCENERY.props.filter((p) => (p.kind as string) === 'lottery')) {
    const lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const seat = [[0.75, 0.05], [-0.75, 0.05], [0.75, -0.35], [-0.75, -0.35]].map(([l, f]) => ({ x: c.x + lx * l + fx * f, z: c.z + lz * l + fz * f })).find((q) => world.clear(q.x, q.z, 0.3));
    if (!seat) continue;
    const home = homeNear(seat), curb = nav.snap(seat.x, seat.z);
    const place = stand({ x: seat.x, z: seat.z, yaw: c.yaw, curb: { x: curb.x, z: curb.z } }, true, 0.42);
    addNpc('lottery', home, wholeDay(home, [lifeAct(6.3, 19.8, 'work', place, 'lottery')]),
      { shirt: SHIRTS[Math.floor(lifeRandom() * SHIRTS.length)], pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)], hat: '#e5cf92' });
  }
  // Hàng quà at the school gate: an ice-cream cart beside the gate at the noon and afternoon home time.
  {
    const school = BUILDINGS.find((b) => b.kind === 'school');
    if (school) {
      const fx = Math.sin(school.facing), fz = Math.cos(school.facing), lx = Math.cos(school.facing), lz = -Math.sin(school.facing);
      const spot = [2.2, -2.2, 3.2, -3.2].map((l) => ({ x: school.door.x + fx * 1.6 + lx * l, z: school.door.z + fz * 1.6 + lz * l })).find((q) => world.clear(q.x, q.z, 0.45));
      if (spot) {
        const home = homeNear(spot), curb = nav.snap(spot.x, spot.z);
        const place = stand({ x: spot.x, z: spot.z, yaw: school.facing, curb: { x: curb.x, z: curb.z } });
        addNpc('hawker', home, wholeDay(home, [lifeAct(10.3, 11.7, 'work', place, 'hawk', 'kem'), lifeAct(15.8, 17.6, 'work', place, 'hawk', 'kem')]),
          { shirt: SHIRTS[Math.floor(lifeRandom() * SHIRTS.length)], pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)], hat: '#e5cf92' });
      }
    }
  }
  // Xe ôm drivers wait on their scooters at the corners, eat lunch at a quán nearby and nap through the heat.
  for (const g of LIFE.groups.filter((gr) => gr.kind === 'xeom')) {
    for (const [k, id] of g.slots.entries()) {
      const home = homeFor(), perch = POIS[id];
      const slices: Activity[] = [];
      // The corner is never left empty: the first driver has his cà phê at the quán and lunch at 11:20, the second
      // stays on the scooter through the morning rush and eats once the first is back (then naps on the saddle).
      const [l0, l1] = k % 2 ? [12.7, 13.5] : [11.3, 12.6];
      const coffee = k % 2 ? undefined : lifePois.filter((p) => p.kind === 'stool' && groupOf(p).kind === 'eatery' && openOver(groupOf(p).hours, 6.5, 8.0) && walkCost(perch, p) < 50 && bookings.free(p.id, 6.5, 8.0))
        .sort((a, b) => walkCost(perch, a) - walkCost(perch, b))[0];
      const lunch = lifePois.filter((p) => p.kind === 'stool' && eatery(new Set([...LUNCH, 'pho']))(groupOf(p)) && openOver(groupOf(p).hours, l0, l1) && walkCost(perch, p) < 70 && bookings.free(p.id, l0, l1))
        .sort((a, b) => walkCost(perch, a) - walkCost(perch, b))[0];
      if (coffee && bookings.book(coffee.id, 6.5, 8.0)) slices.push(lifeAct(6, 6.5, 'work', { poi: perch }, 'xeom'), lifeAct(6.5, 8.0, 'eat', { poi: coffee }, 'coffee'));
      else slices.push(lifeAct(6, 8.0, 'work', { poi: perch }, 'xeom'));
      if (lunch && bookings.book(lunch.id, l0, l1)) {
        slices.push(lifeAct(8.0, l0, 'work', { poi: perch }, 'xeom'), lifeAct(l0, l1, 'eat', { poi: lunch }, 'meal'), lifeAct(l1, 20.5, 'work', { poi: perch }, 'xeom'));
      } else slices.push(lifeAct(8.0, 20.5, 'work', { poi: perch }, 'xeom'));
      bookings.book(id, 6, 20.5);
      addNpc('xeom', home, wholeDay(home, slices), { shirt: pick0(['#3f5a7a', '#6d6a63', '#2f3a40', '#7b6a58'], lifeRandom), pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)] });
    }
  }
  // Homemakers: market at dawn, sweeping out front, an afternoon and an evening on the doorstep stool.
  for (let s = 0; s < 4; s++) {
    let home = homeFor();
    for (let tries = 0; tries < 6 && !doorstep(home); tries++) home = homeFor();
    const market = POIS.filter((p) => p.kind === 'market').sort((a, b) => walkCost(home.door, a) - walkCost(home.door, b))[Math.floor(lifeRandom() * 3)];
    const front = (slot: number): Place => ({ building: home, inside: false, slot });
    const slices: Activity[] = [lifeAct(7.2, 8.6, 'leisure', front(CHORES), 'chores')];
    // Two of them start the day with the dưỡng sinh troupe, then shop.
    const opened = LIFE.groups.filter((g) => g.kind === 'exercise' && g.slots.some((id) => !bookings.free(id, 5.6, 6.2)));
    const troupe = s < 2 ? opened.sort((a, b) => walkCost(home.door, a) - walkCost(home.door, b))[0] : undefined;
    const place = troupe?.slots.find((id) => bookings.free(id, 5.2, 6.6));
    const exercise = place !== undefined && walkCost(home.door, POIS[place]) < 200 && bookings.book(place, 5.2, 6.6);
    if (exercise) slices.push(lifeAct(5.2, 6.6, 'leisure', { poi: POIS[place!] }, 'exercise'));
    if (market) slices.push(lifeAct(exercise ? 6.6 : 5.8, 7.2, 'market', { poi: market }), lifeAct(17, 17.8, 'market', { poi: market }));
    if (doorstep(home)) slices.push(lifeAct(15.5, 17, 'leisure', front(DOORSTEP), 'doorstep'), lifeAct(19, 20.5, 'leisure', front(DOORSTEP), 'doorstep'));
    addNpc('homemaker', home, wholeDay(home, slices), { shirt: SHIRTS[Math.floor(lifeRandom() * SHIRTS.length)], pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)] });
  }
  // Giữ xe attendants on their chairs by the parking rows.
  for (const post of LIFE.posts) {
    const home = homeFor();
    addNpc('guard', home, wholeDay(home, [lifeAct(post.hours[0], post.hours[1], 'work', stand(post, true, 0.42), 'guard')]), { shirt: pick0(['#2f5a3a', '#3f5a7a', '#6d6a63', '#e8e0cc'], lifeRandom), pants: PANTS[Math.floor(lifeRandom() * PANTS.length)], skin: SKINS[Math.floor(lifeRandom() * SKINS.length)], hat: lifeRandom() < 0.5 ? '#5f6b3a' : undefined });
  }

  const crowd = npcs.length;
  // Two extra slots for scripted mission characters (thieves).
  for (let k = 0; k < 2; k++) addNpc('thief', homes[k], [], { shirt: '#3d3d3d', pants: '#1f1f1f', skin: '#c58f69' });
  for (const thief of npcs.slice(crowd)) thief.state = 'away';

  // Instanced rendering: every person is a body (torso, head and face, hair, hat, clothes), a left arm, a right
  // arm (hand and whatever it holds) and two legs, each one figure mesh for the whole crowd, plus open umbrellas:
  // five draw calls. Elbows, wrists, fingers, knees, ankles, the head, the chest and skirts bend in the vertex
  // shader from a pose per instance. Everyone keeps packed palettes (wardrobe.ts); from frame to frame only the
  // part masks change (blinking, talking, what the right hand holds). Only people outdoors are drawn.
  let detail: Detail = 'hi';
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg'), rigid: figureMaterial('rigid') };
  const bodies = new FigureBatch(figureGeometry('body', detail), materials.body, npcs.length);
  const armsL = new FigureBatch(figureGeometry('armL', detail), materials.arm, npcs.length);
  const armsR = new FigureBatch(figureGeometry('armR', detail), materials.arm, npcs.length);
  const legs = new FigureBatch(figureGeometry('leg', detail), materials.leg, npcs.length * 2);
  const umbrellas = new FigureBatch(umbrellaGeometry(), materials.rigid, npcs.length);
  // Distance level of detail: people more than FAR_LOD metres from the camera are drawn with the coarse figures
  // (mitten hands, fewer segments), a few pixels tall at that range; four more draw calls, far fewer triangles.
  const FAR_LOD = 55;
  const farSet = {
    bodies: new FigureBatch(figureGeometry('body', 'lo'), materials.body, npcs.length), armsL: new FigureBatch(figureGeometry('armL', 'lo'), materials.arm, npcs.length),
    armsR: new FigureBatch(figureGeometry('armR', 'lo'), materials.arm, npcs.length), legs: new FigureBatch(figureGeometry('leg', 'lo'), materials.leg, npcs.length * 2),
  };
  const nearSet = { bodies, armsL, armsR, legs };
  const batches = [bodies, armsL, armsR, legs, umbrellas, farSet.bodies, farSet.armsL, farSet.armsR, farSet.legs];
  type Dress = {
    style: FigureStyle;
    /** The palettes as drawn; their masks are rewritten each frame from the style's own. */
    look: FigurePalettes;
    umbrella: Float32Array;
    /** What a fanning hand holds: a paper fan, or the nón lá taken off the head. */
    fan: number;
    /** Carries a shopping bag on the way to and from the market or home. */
    bag: boolean;
    /** Seated, the front tà, apron or skirt is laid over the lap. */
    lap: boolean;
    /** A hawker's gánh or push cart, and what is in it. */
    gear: 'pole' | 'cart' | null; goods: Goods | null;
  };
  const dress: Dress[] = npcs.map((npc) => {
    const goods = npc.schedule.find((a) => a.goods)?.goods;
    const fem = npc.role === 'xeom' || npc.role === 'guard' ? false : npc.role === 'homemaker' || (goods && POLE_GOODS.has(goods)) ? true : undefined;
    const style = deriveStyle(npc.look, npc.id, styleRole(npc.role), npc.gang >= 0 ? { bandana: GANGS[npc.gang].bandana } : fem === undefined ? {} : { fem });
    // Only market vendors keep the wardrobe's gánh: hawkers carry their own (swinging baskets, drawn with the props).
    if (npc.role !== 'vendor') style.torso &= ~TORSO.GANH;
    // Ragdolls of this person read the same style back from their look.
    setStyle(npc.look, style);
    const canopy = UMBRELLAS[npc.mind.traits.umbrellaLook % UMBRELLAS.length];
    const k = (npc.id * 0.754877) % 1;
    return {
      style,
      look: palettesOf(style),
      umbrella: palette([canopy[0], canopy[1]]),
      fan: (style.head & HEAD.CONE) !== 0 && k < 0.6 ? ARM.NON_LA : ARM.FAN,
      bag: (npc.role === 'retiree' || npc.role === 'vendor') && k > 0.5,
      lap: (style.torso & (TORSO.AO_DAI | TORSO.APRON | TORSO.SKIRT)) !== 0,
      gear: goods ? (POLE_GOODS.has(goods) ? 'pole' : 'cart') : null, goods: goods ?? null,
    };
  });
  for (const batch of batches) {
    batch.mesh.receiveShadow = true;
    scene.add(batch.mesh);
  }

  const base = new THREE.Matrix4(), torso = new THREE.Matrix4(), chest = new THREE.Matrix4(), armM = new THREE.Matrix4(), legM = new THREE.Matrix4();
  const held = new THREE.Matrix4(), stretch = new THREE.Matrix4();
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), off = new THREE.Vector3(), size = new THREE.Vector3(1, 1, 1);
  const turn = new THREE.Euler(0, 0, 0, 'YZX');
  const walk = newGait();
  const bodyPose = [0, 0, 0, 0], poseR = [0, 0, 0, 0], legPose = [0, 0, 0, 0];
  const armL = [...ARM_POSES.RELAXED], armR = [...ARM_POSES.RELAXED], actL = [...ARM_POSES.RELAXED], actR = [...ARM_POSES.RELAXED];
  // Arm tuples are kept in mutable arrays; pose.ts reads them as ArmPose.
  const P = (a: number[]) => a as unknown as ArmPose;
  const copy = (out: number[], a: ArmPose) => { for (let n = 0; n < 7; n++) out[n] = a[n]; return out; };
  /** An arm swinging with the gait (relaxed when standing): from `walk`, filled for this frame. */
  function swingArm(out: number[], side: -1 | 1, run: number) {
    out[0] = (side < 0 ? walk.armL : walk.armR) + 0.02;
    out[1] = 0.06 + 0.06 * run;
    out[2] = 0;
    out[3] = (side < 0 ? walk.elbowL : walk.elbowR) - 0.12;
    out[4] = 0.1;
    out[5] = 0.03;
    out[6] = run > 0.5 ? RUN_HAND : HAND.RELAXED;
  }
  /** Panic: arms up, waving about. */
  function flail(out: number[], phase: number) {
    copy(out, FLAIL);
    out[0] += Math.sin(phase) * 0.35;
    out[1] += Math.sin(phase * 0.7) * 0.2;
    out[3] += Math.sin(phase + 1) * 0.35;
  }
  // Toes on the ground from a high seat: the ball of the foot is FOOT_REACH from the ankle, FOOT_PHI below its line.
  const FOOT_REACH = Math.hypot(FIGURE.ankleY, FIGURE.ball), FOOT_PHI = Math.atan2(FIGURE.ankleY, FIGURE.ball);
  const seat = { thigh: 0, knee: 0, ankle: 0, toe: 0 };
  /**
   * Legs of someone sitting with their hip joints `hy` (FIGURE units) above the ground: feet flat when they reach
   * (knees up on a low stool), the toes down to touch it from a high stool, or dangling (and swinging by `sway`)
   * from a high bench.
   */
  function seatLegs(hy: number, sway: number) {
    const T = FIGURE.thigh, S = FIGURE.shin, A = FIGURE.ankleY;
    // Thighs slope down from the seat (or up, knees high, on a low one) so that the shins lean a little forward.
    let slope = clamp(Math.asin(clamp((hy - A - S * Math.cos(0.2)) / T, -1, 1)), -0.8, 0.28);
    const ky = hy - T * Math.sin(slope);
    let shin = 0, ankle: number, toe = 0;
    if (ky - A <= S) {
      shin = Math.acos((ky - A) / S);
      ankle = shin;
    } else if (ky - S <= FOOT_REACH) {
      ankle = Math.asin((ky - S) / FOOT_REACH) - FOOT_PHI;
      toe = ankle * 0.8;
    } else {
      slope = 0.1;
      shin = -0.08 + sway;
      ankle = 0.45;
    }
    seat.thigh = slope - Math.PI / 2;
    seat.knee = Math.PI / 2 - slope - shin;
    seat.ankle = ankle;
    seat.toe = toe;
  }
  const ikRoot = new THREE.Vector3(), ikTarget = new THREE.Vector3(), ikHint = new THREE.Vector3();
  /** Seated arms solved for a thigh slope and lean, kept per person (they only change when those do). */
  const laps = new Map<number, { key: number; left: number[]; right: number[] }>();
  /**
   * A seated arm with the hand resting on the thigh: two-bone IK from the shoulder to a point on top of the thigh
   * (`thigh` is its swing from seatLegs), in the frame of a torso leaning `lean` about the hips; over a skirt or
   * tà on the lap (`cloth`) the hand rests on the cloth.
   */
  function lapArm(out: number[], side: -1 | 1, thigh: number, lean: number, shoulderX: number, cloth: boolean) {
    const s = Math.sin(thigh), c = Math.cos(thigh);
    // Along the thigh from the hip and up off its top, so the palm lies on it (body space, relative to the hip).
    const along = FIGURE.thigh * 0.6 - 0.07, up = cloth ? 0.125 : 0.1;
    const y = -c * along - s * up, z = -s * along + c * up;
    const cl = Math.cos(lean), sl = Math.sin(lean);
    const sx = sideX(side);
    ikTarget.set(sx * (FIGURE.hipX + 0.03), FIGURE.hipY + y * cl + z * sl, z * cl - y * sl);
    ikRoot.set(sx * shoulderX, FIGURE.shoulderY, 0);
    const ik = twoBoneIK(ikRoot, ikTarget, FIGURE.upperArm, FIGURE.foreArm, ikHint.set(sx * 0.4, -0.3, -1));
    out[0] = ik.swing; out[1] = sx * ik.abduct; out[2] = sx * ik.roll; out[3] = ik.bend;
    out[4] = 1.2; out[5] = 0.2; out[6] = HAND.RELAXED;
  }
  /**
   * Where a skirt or tà lies on a seated lap: the front from its pivot (panelY, in front) over the top of the
   * knee, the back from behind under the thighs to the underside of the knee (both from straight down, forward
   * positive, in the hips' frame); the shader folds the cloth down again past the knee.
   */
  function lapCloth(npc: Npc, thigh: number) {
    const sn = Math.sin(thigh), cs = Math.cos(thigh), r = 0.072;
    const ky = FIGURE.hipY - FIGURE.thigh * cs, kz = -FIGURE.thigh * sn;
    // The thigh's top surface faces (y, z) = (-sin, cos) of its swing.
    npc.lapFront = Math.atan2(kz + r * cs - CLOTH.pivotZ, FIGURE.panelY - (ky - r * sn));
    npc.lapBack = Math.atan2(kz - r * cs + CLOTH.pivotZ, FIGURE.panelY - (ky + r * sn));
  }
  // Off in zombie mode: nobody is drawn, hit or found while the streets belong to the dead.
  let enabled = true;
  function visible(npc: Npc) { return enabled && npc.state !== 'inside' && npc.state !== 'down' && npc.state !== 'away'; }
  /** What the camera sees (last frame's): people outside it are not posed or drawn at all; where the camera is. */
  let view: THREE.Frustum | null = null;
  const eye = new THREE.Vector3(), eyeCross = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let eyeKnown = false;
  const bound = new THREE.Sphere(new THREE.Vector3(), 1.35);
  // Street-life props (crowd-props.ts): what hands hold and hawkers carry, the street furniture, steam and incense smoke.
  const props = createCrowdProps(scene);
  const furniture = createStreetFurniture(scene, LIFE.furniture, LIFE.groups);
  const wisps = createWisps(scene);
  const gripPos = new THREE.Vector3(), gripQuat = new THREE.Quaternion(), gripScale = new THREE.Vector3(), propM = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
  const leftPos = new THREE.Vector3(), leftQuat = new THREE.Quaternion(), armML = new THREE.Matrix4(), poseML = [0, 0, 0, 0];
  const VESSELS: Record<Vessel, Held> = { bowl: HELD.BOWL_PHO, plate: HELD.PLATE, coffee: HELD.COFFEE, tea: HELD.TEA, beer: HELD.BEER, cup: HELD.CUP };
  const vesselItem = (v: Vessel, dish: string | null) => (v === 'bowl' && (dish === 'bunrieu' || dish === 'bun' || dish === 'banhcanh') ? HELD.BOWL_BUN : VESSELS[v]);
  /** Half the height of a vessel: glasses stand on the table by their middle's origin. */
  const VESSEL_LIFT: Record<Vessel, number> = { bowl: 0, plate: 0, coffee: 0.0475, tea: 0.055, beer: 0.0625, cup: 0.065 };
  const GOODS_BASKET: Partial<Record<Goods, Held>> = { xoi: HELD.BASKET_XOI, fruit: HELD.BASKET_FRUIT, hotvitlon: HELD.BASKET_EGG };
  const bell = (t: number, len: number) => (t <= 0 || t >= len ? 0 : Math.sin((t / len) * Math.PI));
  const ease = (t: number) => t * t * (3 - 2 * t);
  /** Where each đá cầu shuttlecock is this frame (by group), for the props and for the kids to watch. */
  const shuttleAt = new Map<number, THREE.Vector3>();
  const shuttlePos = new Map<number, THREE.Vector3>();
  /** The top of a quán table (cached: tables never move). */
  const tableTops = new Map<object, number>();
  const tableTop = (t: { x: number; z: number }) => { let y = tableTops.get(t); if (y === undefined) tableTops.set(t, (y = groundHeight(t.x, t.z) + 0.45)); return y; };
  /** The hour of the latest update (life tables and dishes depend on it). */
  let nowHour = 12;
  let sweepAt = 0, steamAt = 0, lifeLines = 2, lowDetail = false;
  /** Altars with incense burning (by who lit it), until when. */
  const incenseAt = new Map<number, { x: number; z: number; yaw: number; until: number }>();
  const standOf = new Map<number, { x: number; z: number; yaw: number }>();
  for (const f of LIFE.furniture) if (f.kind === 'stand') standOf.set(f.group, f);
  /** Group scenes speak through here: only near the player, at most about two street-life lines a second. */
  const lifeHooks = {
    say(id: number, text: string, shout: boolean) {
      const n = npcs[id];
      if (n && visible(n) && nearFocus(n, 30) && lifeLines >= 1) { lifeLines--; say(n, text, shout); }
    },
  };
  /** Something to say about what they are doing on the street (often nothing). */
  function lineFor(npc: Npc, life: Life): string {
    const at = npc.state === 'at';
    switch (life) {
      case 'meal': case 'coffee': case 'tea': case 'beer': return at && Math.random() < 0.5 ? pick(LIFE_LINES[life]) : '';
      case 'doorstep': return at && Math.random() < 0.4 ? pick(LIFE_LINES.doorstep) : '';
      case 'feed': return at && Math.random() < 0.4 ? pick(LIFE_LINES.feed) : '';
      case 'couple': return at && Math.random() < 0.2 ? pick(LIFE_LINES.couple) : '';
      case 'xeom': return !at ? '' : npc.act === 'nap' ? LIFE_LINES.nap[0] : pick(LIFE_LINES.xeom);
      case 'hawk': { const goods = dress[npc.id].goods; return goods ? pick(LIFE_LINES.hawk[goods]) : ''; }
      case 'lottery': return pick(LIFE_LINES.lottery);
      case 'cook': return at && lifeOn(npc, life) && Math.random() < 0.5 ? pick(LIFE_LINES.cook) : '';
      case 'guard': return at && npc.act !== 'nap' && Math.random() < 0.5 ? pick(LIFE_LINES.guard) : '';
      default: return '';
    }
  }
  const pole = new THREE.Matrix4(), poleEnd = new THREE.Vector3(), hipTurned = new THREE.Vector3();
  /** The fist's grip frame (metres, unscaled) of an arm just posed. */
  function grip(arm: THREE.Matrix4, pose: ArrayLike<number>, side: 1 | -1, p: THREE.Vector3, q: THREE.Quaternion) { gripMatrix(arm, pose, side, held).decompose(p, q, gripScale); }
  function draw(npc: Npc, i: number, time: number) {
    if (!visible(npc)) return;
    // A sphere round the whole person, an open umbrella included.
    if (view && !view.intersectsSphere(bound.set(bound.center.set(npc.x, npc.y + 1.1, npc.z), 1.35))) return;
    const d = dress[i], style = d.style, look = d.look, k = npc.id;
    const B = detail === 'hi' && eyeKnown && Math.hypot(npc.x - eye.x, npc.y - eye.y, npc.z - eye.z) > FAR_LOD ? farSet : nearSet;
    const sit = npc.pose === 'sit';
    // Sitting down and standing up take half a second: the body lowers onto the seat as the legs fold.
    const sat = sit ? ease(clamp(npc.sitT, 0, 1)) : 0;
    const { width, height } = style;
    const intent = npc.mind.intent;
    const moving = npc.pose === 'walk' || npc.pose === 'run';
    const run = moving ? clamp((npc.speed - 2) / 1.6, 0, 1) : 0;
    // In a skirt or an áo dài a run takes shorter steps (the thighs would sweep through the cloth).
    const stride = run > 0 && style.torso & (TORSO.SKIRT | TORSO.AO_DAI) ? Math.min(1, 0.6 / (0.48 + 0.34 * run)) : 1;
    gait(stridePhase(npc.stride), run, npc.go * stride, walk);
    const still = 1 - npc.go;
    // Walkers lean slightly into their stride, runners a lot; people standing about shift their weight.
    const shift = Math.sin(time * 0.55 + k * 1.7);
    let lean = npc.pose === 'run' ? 0.1 + 0.1 * run : npc.pose === 'walk' ? 0.04 : sit ? 0.05 + 0.25 * Math.sin(Math.PI * sat) : npc.pose === 'fight' ? 0.12 : 0;
    let roll = npc.pose === 'idle' ? shift * 0.028 : 0;
    const act = npc.state === 'at' && (npc.pose === 'idle' || sit) ? npc.act : 'none';
    // Each act eases in and out over a third of a second.
    const env = act === 'none' ? 0 : clamp(Math.min((time - npc.actFrom) / 0.35, (npc.actUntil - time) / 0.35), 0, 1);
    if (env > 0) {
      if (act === 'sweep') lean += 0.22 * env;
      else if (act === 'serve') lean += 0.16 * env;
      else if (act === 'phone') lean += 0.08 * env;
      else if (act === 'stretch') { lean -= 0.12 * env; roll *= 1 - env; }
      else if (act === 'shout') lean -= 0.05 * env;
    }
    const open = npc.mind.umbrella;
    const holding = open > 0.04 && !sit && npc.pose !== 'hands' && npc.pose !== 'fight';
    const fleeing = npc.pose === 'run' && npc.state === 'fleeing' && npc.role !== 'thief';
    const place = npc.current?.place;
    const poi = place && 'poi' in place ? place.poi : null;
    const cafe = sit && !!poi && poi.kind === 'cafe-seat';
    const life = npc.state === 'at' ? npc.current?.life : undefined;
    const group = poi && poi.group !== undefined ? LIFE.groups[poi.group] : null;
    const vessel = life === 'meal' || life === 'coffee' || life === 'tea' || life === 'beer' || life === 'karaoke' ? vesselOf(group?.dish ?? null, life === 'karaoke' ? 'beer' : life, nowHour) : null;
    const near = props.near(npc.x, npc.z);
    // The chest takes a third of a look aside and counters the stride; the head does the rest. Seated, the head
    // alone looks about, so the hands stay on the lap.
    let twist = sit ? 0 : npc.headYaw * 0.3 + walk.chest;
    // What the right hand holds: a cup or a bag from the stance, or the act's own thing once it is under way.
    let item = 0, actItem = 0, hideCone = false;
    // Street-life things in the hands (props), leg and body changes an act makes.
    let heldR: Held | -1 = -1, heldL: Held | -1 = -1, levelR = true, paper = false;
    let legMode: 'none' | 'kick' | 'ready' | 'squat' | 'nap' = 'none', drop = 0, hop = 0, bend = 0;

    // --- Arms: the stance of the pose, then an act blended over it -----------------------------------------
    if (npc.pose === 'hands') {
      copy(armL, ARM_POSES.SURRENDER); copy(armR, ARM_POSES.SURRENDER);
      armR[0] += Math.sin(time * 9) * 0.08; armL[0] += Math.sin(time * 9 + 2) * 0.06;
    } else if (fleeing) {
      flail(armL, time * 9 + k); flail(armR, time * 9 + k + 2.4);
    } else if (npc.pose === 'fight') {
      copy(armL, ARM_POSES.GUARD); copy(armR, ARM_POSES.GUARD);
      // Guard up, a jab now and then, the right shoulder driving into it.
      const p = (time + k * 0.37) % 1.1;
      const jab = p < 0.3 ? Math.sin((p / 0.3) * Math.PI) : 0;
      mixArm(P(armR), JAB, jab, armR);
      twist += -0.25 + 0.4 * jab;
    } else if (sit) {
      // Hands on the thighs (the thighs' slope does not depend on the swinging shins), solved once per seat and lean.
      seatLegs((npc.seatTop - npc.seatFloor) / (BODY_SCALE * height) + FIGURE.seatClear, 0);
      const key = Math.round(seat.thigh * 200) * 1000 + Math.round(lean * 200);
      let lap = laps.get(k);
      if (!lap || lap.key !== key) {
        lap = lap ?? { key, left: [], right: [] };
        lap.key = key;
        lapArm(lap.left, -1, seat.thigh, lean, style.shoulderX, d.lap);
        lapArm(lap.right, 1, seat.thigh, lean, style.shoulderX, d.lap);
        laps.set(k, lap);
      }
      for (let n = 0; n < 7; n++) { armL[n] = lap.left[n]; armR[n] = lap.right[n]; }
      if (sat < 1) { swingArm(actL, -1, 0); swingArm(actR, 1, 0); mixArm(P(actL), P(armL), sat, armL); mixArm(P(actR), P(armR), sat, armR); }
      if (d.lap) lapCloth(npc, seat.thigh);
      if (cafe) {
        // A glass of trà đá on the lap, sipped every so often.
        const p = (time + k * 1.3) % 9;
        mixArm(CUP, SIP, p < 2.4 ? Math.sin((p / 2.4) * Math.PI) ** 2 : 0, armR);
        item = ARM.CUP;
      }
    } else {
      swingArm(armL, -1, run); swingArm(armR, 1, run);
      if (npc.pose === 'idle') {
        armL[0] += Math.sin(time * 1.3 + k) * 0.05; armR[0] -= Math.sin(time * 1.3 + k) * 0.05;
        let stance: ArmPose | null = null, both = true, amount = still;
        if (npc.gang >= 0 && npc.state === 'at') stance = k % 2 ? ARM_POSES.CROSS : ARM_POSES.AKIMBO;
        else if (intent === 'shelter' && npc.mind.needs.wet > 0.15) stance = ARM_POSES.CROSS; // arms folded against the cold
        else if (intent === 'chat' && npc.state === 'at') {
          // Talking with a hand while speaking, a little while listening.
          stance = ARM_POSES.CHAT; both = false;
          amount *= (time < npc.talkUntil ? 0.75 : 0.25) + 0.25 * Math.sin(time * 2.1 + k);
        } else if (intent === 'watch' && npc.state === 'at') {
          stance = ARM_POSES.POINT; both = false; // pointing it out now and then
          amount *= clamp((Math.sin(time * 0.7 + k) - 0.72) / 0.12, 0, 1);
        }
        if (stance) {
          mixArm(P(armR), stance, amount, armR);
          if (stance === ARM_POSES.CHAT) armR[3] += Math.sin(time * 3.3 + k) * 0.25 * amount;
          // Pointing follows the eyes down to whatever lies on the ground.
          if (stance === ARM_POSES.POINT) armR[0] += npc.headPitch * amount;
          if (both) mixArm(P(armL), stance, amount, armL);
        }
      }
      if (moving && (npc.role === 'thief' || (d.bag && (npc.current?.kind === 'market' || npc.current?.kind === 'home')))) {
        // The shopping bag (or a snatched one) swings less than a free arm.
        mixArm(P(armR), CARRY, 0.7, armR);
        item = ARM.BAG;
      }
      // Hawkers: a hand on the gánh pole, or both on the cart's handle; vé số sellers carry their tickets.
      if (d.gear === 'pole' && !holding) copy(armR, ARM_POSES.GANH);
      else if (d.gear === 'cart' && !holding) { copy(armL, PUSH); copy(armR, PUSH); lean += 0.12; }
      else if (npc.role === 'lottery' && moving) { mixArm(P(armL), TICKETS_L, 0.85, armL); heldL = HELD.TICKETS; }
    }
    if (env > 0 && !holding) {
      const t = time - npc.actFrom;
      copy(actL, P(armL)); copy(actR, P(armR));
      switch (act) {
        case 'phone':
          // Onlookers film the incident; everyone else reads.
          if (intent === 'watch') copy(actR, FILM);
          else { copy(actR, ARM_POSES.PHONE); actR[0] += Math.sin(t * 0.9 + k) * 0.04; }
          actItem = ARM.PHONE;
          break;
        case 'call': copy(actR, ARM_POSES.CALL); actItem = ARM.PHONE; break;
        case 'stretch': {
          copy(actL, ARM_POSES.STRETCH); copy(actR, ARM_POSES.STRETCH);
          const s = Math.sin(t * 2.2) * 0.08;
          actL[0] += s; actR[0] += s;
          break;
        }
        case 'scratch':
          copy(actR, ARM_POSES.SCRATCH);
          actR[0] += Math.sin(t * 15) * 0.03;
          actR[6] = mixHand(HAND.CLAW, handCode(0.8, 0.8, 0.45), 0.5 + 0.5 * Math.sin(t * 15));
          break;
        case 'wave': copy(actR, ARM_POSES.WAVE); actR[3] = -0.5 + 0.35 * Math.sin(t * 8); break;
        case 'fan':
          copy(actR, ARM_POSES.FAN); actR[5] += Math.sin(t * 12) * 0.45;
          actItem = d.fan; hideCone = d.fan === ARM.NON_LA;
          break;
        case 'sweep':
          copy(actL, SWEEP_L); copy(actR, SWEEP_R);
          // The whole upper body swings the broom from side to side.
          twist += Math.sin(t * 2.6) * 0.3 * env;
          actItem = ARM.BROOM;
          break;
        case 'serve':
          copy(actL, ARM_POSES.SERVE); copy(actR, ARM_POSES.SERVE);
          actL[0] += Math.sin(t * 3.1) * 0.16; actR[0] -= Math.sin(t * 3.1 + 1.3) * 0.18;
          actL[3] += Math.sin(t * 3.1 + 0.6) * 0.2; actR[3] += Math.sin(t * 3.1 + 2) * 0.2;
          break;
        case 'shout': copy(actR, SHOUT); break;
        case 'akimbo': copy(actL, ARM_POSES.AKIMBO); copy(actR, ARM_POSES.AKIMBO); break;
        case 'cross': copy(actL, ARM_POSES.CROSS); copy(actR, ARM_POSES.CROSS); break;
        // --- street life ---
        case 'eat': {
          // A bowl lifted to the chest, chopsticks dipping into it and up to the mouth; a plate stays on the table.
          const up = Math.max(0, Math.sin(2.8 * t + k)) ** 2;
          mixArm(CHOP_LOW, CHOP_HIGH, up, actR);
          heldR = HELD.CHOPSTICKS; levelR = false;
          if (vessel === 'bowl') { copy(actL, BOWL); heldL = vesselItem('bowl', group?.dish ?? null); }
          lean += 0.18 * env;
          break;
        }
        case 'sip': case 'drink': {
          const period = act === 'sip' ? 6 : 5, p = (t + k * 0.7) % period;
          mixArm(CUP, SIP, p < 1.8 ? Math.sin((p / 1.8) * Math.PI) ** 2 : 0, actR);
          heldR = vesselItem(act === 'drink' ? 'beer' : vessel ?? 'tea', null);
          break;
        }
        case 'toast': copy(actR, TOAST); actR[0] += Math.sin(t * 7) * 0.05 * (t < 1.4 ? 1 : 0); heldR = HELD.BEER; break;
        case 'read':
          copy(actL, READ); copy(actR, READ);
          actR[4] += Math.sin(t * 0.4 + k) * 0.08;
          paper = true;
          break;
        case 'think': copy(actR, THINK); copy(actL, THINK_L); lean += 0.22 * env; break;
        case 'move': case 'slap': {
          // Reaching out over the board with the piece, setting it down (a slap comes down hard).
          const reach = Math.sin(Math.PI * Math.min(1, t / 1.2));
          copy(actR, REACH_MOVE);
          actR[0] -= 0.25 * reach + (act === 'slap' ? 0.35 * bell(t, 0.5) : 0);
          if (t < 0.9) heldR = k % 2 ? HELD.PIECE_RED : HELD.PIECE_BLACK;
          lean += (act === 'slap' ? 0.38 : 0.32) * reach * env;
          break;
        }
        case 'cheer':
          copy(actL, ARM_POSES.SURRENDER); copy(actR, ARM_POSES.SURRENDER);
          actL[0] += Math.sin(t * 9) * 0.1; actR[0] += Math.sin(t * 9 + 1) * 0.1;
          break;
        case 'clap': {
          const c = 0.12 * Math.sin(t * 14);
          copy(actL, CLAP); copy(actR, CLAP);
          actL[1] += c; actR[1] += c;
          break;
        }
        case 'sing': {
          copy(actR, SING); heldR = HELD.MIC; levelR = false;
          copy(actL, ARM_POSES.CHAT);
          actL[0] += -0.4 * Math.max(0, Math.sin(1.7 * t));
          roll += 0.07 * Math.sin(3.1 * t) * env;
          break;
        }
        case 'offer': copy(actR, OFFER); heldR = HELD.TICKETS; levelR = false; break;
        case 'pay': copy(actR, PAY); heldR = HELD.MONEY; levelR = false; break;
        case 'point': copy(actR, ARM_POSES.POINT); break;
        case 'incense': {
          // Raise the sticks in both hands, bow three times, then set them in the pot.
          if (t < 6) { copy(actL, INCENSE); copy(actR, INCENSE); heldR = HELD.INCENSE; }
          else copy(actR, PLACE);
          lean += (t > 1.2 && t < 6 ? 0.35 * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - 1.2)) / 1.6)) : t >= 6 ? 0.25 : 0) * env;
          break;
        }
        case 'ladle':
          copy(actR, LADLE);
          actR[0] += 0.15 * Math.sin(3 * t); actR[1] += 0.2 * Math.sin(3 * t + 1.3);
          heldR = HELD.LADLE; levelR = false; lean += 0.12 * env;
          break;
        case 'feed':
          copy(actL, BAG_L); heldL = HELD.BAG;
          mixArm(P(actR), THROW, Math.max(0, Math.sin(3.9 * t)) * 0.8, actR);
          lean += 0.1 * env;
          break;
        case 'nap': copy(actL, ARM_POSES.CROSS); copy(actR, ARM_POSES.CROSS); legMode = 'nap'; break;
        case 'lean': {
          // Couples on their scooters lean in, the inner arm out toward the other.
          const side = npc.actParam || 1;
          roll += side * 0.12 * env;
          copy(side > 0 ? actL : actR, LEAN_IN);
          break;
        }
        case 'kick': {
          copy(actL, BALANCE); copy(actR, BALANCE);
          legMode = 'kick'; hop = 0.05 * bell(t, 0.5);
          break;
        }
        case 'ready': copy(actL, READY); copy(actR, READY); legMode = 'ready'; hop = 0.02 * Math.sin(8 * time + k); break;
        case 'stoop': lean += 0.95 * bell(t, 1.2) * env; copy(actR, STOOP); break;
        case 'exercise': {
          // Six dưỡng sinh moves of eight seconds, everyone in time with the leader (a small lag per person).
          const ph = t + (k % 7) * 0.02, m = npc.actParam;
          const w = (period: number) => Math.sin((2 * Math.PI * ph) / period);
          if (m === 0) { const a = -1.6 - 1.4 * (0.5 - 0.5 * Math.cos((2 * Math.PI * ph) / 4)); copy(actL, ARMS_UP); copy(actR, ARMS_UP); actL[0] = actR[0] = a; }
          else if (m === 1) { const s = w(4); bend += 0.25 * s * env; mixArm(ARM_POSES.RELAXED, ARMS_OVER, Math.max(0, s), actR); mixArm(ARM_POSES.RELAXED, ARMS_OVER, Math.max(0, -s), actL); }
          else if (m === 2) { copy(actL, ARMS_SIDE); copy(actR, ARMS_SIDE); actL[0] = actR[0] = 0.6 * w(2.5); actL[2] = actR[2] = 0.3 * w(2.5); }
          else if (m === 3) { copy(actL, ARMS_SIDE); copy(actR, ARMS_SIDE); twist += 0.5 * w(4) * env; }
          else if (m === 4) { copy(actL, ARMS_UP); copy(actR, ARMS_UP); actL[0] = actR[0] = -1.5; drop = 0.25 * (0.5 - 0.5 * Math.cos((2 * Math.PI * ph) / 3)); legMode = 'squat'; }
          else { copy(actL, PUSH_TAICHI); copy(actR, PUSH_TAICHI); const s = w(6); actL[0] = actR[0] = -1.35 + 0.1 * s; actL[3] = actR[3] = -0.75 - 0.45 * s; lean += 0.08 * s * env; bend += 0.05 * w(12) * env; }
          break;
        }
        default: break;
      }
      mixArm(P(armL), P(actL), env, armL);
      mixArm(P(armR), P(actR), env, armR);
      if (env >= 0.5 && actItem) item = actItem;
      else hideCone = false;
      if (env < 0.5) { heldR = -1; heldL = heldL === HELD.TICKETS ? heldL : -1; paper = false; }
      drop *= env; hop *= env;
    }
    if (holding) {
      // The umbrella comes up as it opens; the canopy bobs a little with the stride. A nón lá comes off under it.
      copy(actR, ARM_POSES.UMBRELLA);
      actR[0] += Math.sin(npc.stride) * 0.03;
      mixArm(P(armR), P(actR), clamp(open * 3, 0, 1), armR);
      item = 0;
      hideCone = open > 0.3;
    }

    // A gánh rides the right shoulder while they walk or stand about, the right hand on the pole; seated, busy
    // with an act, running or under an umbrella they have set it down (out of sight).
    let torsoBits = style.torso;
    if (torsoBits & TORSO.GANH) {
      if (!holding && act === 'none' && (npc.pose === 'walk' || npc.pose === 'idle')) copy(armR, ARM_POSES.GANH);
      else torsoBits &= ~TORSO.GANH;
    }
    look.body[7] = torsoBits;

    // --- Body: the torso leans about the hips, the head and chest turn in the shader ----------------------------
    const sx = BODY_SCALE * width, sy = BODY_SCALE * height;
    let y = npc.y + walk.bob * sy + hop - drop;
    // Seated: the hip joints rest just above the seat top.
    if (sit) y -= sitDrop(npc.seatTop, height) * sat;
    if (legMode === 'nap') lean = -1.1;
    pos.set(npc.x, y, npc.z);
    quat.setFromEuler(turn.set(0, npc.yaw, roll));
    base.compose(pos, quat, size.set(sx, sy, sx));
    // The torso turns about the hips: lean forward, and bend sideways (dưỡng sinh) without the legs.
    const hip = FIGURE.hipY * sy;
    off.set(0, hip, 0).applyQuaternion(quat);
    quat.setFromEuler(turn.set(lean, npc.yaw, roll + bend));
    torso.compose(pos.add(off).sub(hipTurned.set(0, hip, 0).applyQuaternion(quat)), quat, size);
    // Eyes shut for a blink every few seconds (and through a nap); the mouth opens and closes while they talk.
    if (time > npc.blinkAt + 0.12) npc.blinkAt = time + 2.5 + Math.random() * 3.5;
    let head = style.head;
    if (time >= npc.blinkAt || (act === 'nap' && env > 0.5)) head = (head & ~HEAD.EYES) | HEAD.BLINK;
    if ((time < npc.talkUntil && Math.floor(time / 0.15 + k * 0.5) % 2 === 0) || (act === 'shout' && env > 0.5) || (act === 'sing' && env > 0.5 && Math.floor(time / 0.2) % 3 !== 0)) head |= HEAD.MOUTH;
    // The nón lá is a daytime sun hat: off after dusk, and off the head to sit and eat, drink, sing or chat at the door.
    if (nowHour < 6 || nowHour > 18.3 || (sit && (life === 'beer' || life === 'karaoke' || life === 'meal' || life === 'coffee' || life === 'tea' || life === 'doorstep'))) hideCone = true;
    if (hideCone) head &= ~HEAD.CONE;
    look.body[6] = head;
    bodyPose[0] = npc.headYaw - twist;
    bodyPose[1] = npc.headPitch;
    bodyPose[2] = twist;
    // Leaning forward about the hips would swing skirts and tà back into the legs (and a hanging ponytail stays
    // vertical): the secondary swings take the lean back out. The hair bounces on the same spring, more softly,
    // and hangs when seated while the tà lies on the lap.
    const tilt = Math.max(0, lean);
    // The spring lags the stride, so the front of a skirt or tà also opens at least far enough for the hem to pass
    // in front of the forward knee (thigh < 0 is forward; the hem hangs 0.5 u below its pivot).
    // Seated, the front lies on the lap (the spring's target) while the back tà hangs behind the seat, or the back
    // of a skirt is tucked under.
    const ahead = sit ? 0 : npc.pose === 'fight' ? 0.3 : Math.max(0, -walk.thighL, -walk.thighR);
    const clear = ahead > 0.2 ? Math.asin(Math.min(1, 0.9 * Math.sin(ahead) - 0.17)) + 0.05 : 0;
    const front = Math.max(npc.sec, clear) + tilt;
    // The back of a skirt or tà is tucked under the thighs (an apron has no back).
    const seatedBack = d.lap ? -(npc.lapBack + tilt) * clamp(npc.sec / Math.max(0.3, npc.lapFront), 0, 1) : npc.sec + tilt;
    bodyPose[3] = sit ? swingCode(front, tilt, seatedBack) : swingCode(front, npc.sec * 0.55 + tilt, front);
    B.bodies.push(torso, look.body, bodyPose);
    chestMatrix(torso, twist, chest);
    poseArm(chest, -1, P(armL), armML, poseML, style.shoulderX);
    B.armsL.push(armML, look.armL, poseML);
    poseArm(chest, 1, P(armR), armM, poseR, style.shoulderX);
    look.armR[6] = style.armR | item;
    B.armsR.push(armM, look.armR, poseR);
    if (holding) {
      const spread = 0.12 + 0.88 * open;
      gripMatrix(armM, poseR, 1, held).multiply(stretch.makeScale(spread, 0.9 + 0.1 * open, spread));
      umbrellas.push(held, d.umbrella);
    }

    // --- Legs ---------------------------------------------------------------------------------------------------
    for (const side of SIDES) {
      let thigh: number, knee: number, ankle: number, toe: number, abduct = 0, rollL = 0;
      if (sit) {
        seatLegs((npc.seatTop - npc.seatFloor) / sy + FIGURE.seatClear, npc.seatFloor > 0 ? 0 : Math.sin(time * 1.4 + k + side) * 0.1);
        thigh = seat.thigh * sat; knee = seat.knee * sat + 0.04 * (1 - sat); ankle = seat.ankle * sat; toe = seat.toe * sat;
        abduct = (style.fem ? 0.03 : 0.12) * sat;
        if (legMode === 'nap') { thigh = -1.35; knee = 0.45; ankle = -0.2; abduct = 0.1; }
      } else if (npc.pose === 'fight') {
        // Boxer's stance: left foot forward, knees soft.
        thigh = side < 0 ? -0.3 : 0.22; knee = side < 0 ? 0.35 : 0.3; ankle = side < 0 ? -0.08 : 0.18; toe = 0; abduct = 0.05;
      } else {
        thigh = side < 0 ? walk.thighL : walk.thighR;
        knee = side < 0 ? walk.kneeL : walk.kneeR;
        ankle = side < 0 ? walk.ankleL : walk.ankleR;
        toe = side < 0 ? walk.toeL : walk.toeR;
        // Standing about, the weight rests on one leg and the other knee softens.
        if (npc.pose === 'idle') knee += Math.max(0, side * shift) * 0.12 * still;
        if (legMode === 'kick' && side > 0) {
          // The inside of the foot comes up to meet the shuttlecock.
          const b = bell(time - npc.actFrom, 0.5);
          thigh = -1.0 * b; knee = 0.9 * b; abduct = 0.45 * b; rollL = 0.8 * b;
        } else if (legMode === 'kick') knee += 0.15;
        else if (legMode === 'ready') { thigh = -0.12; knee = 0.25; ankle = -0.12; abduct = 0.06; }
        else if (legMode === 'squat') {
          // Knees bend so the feet stay put as the hips drop.
          const a = Math.acos(clamp(1 - drop / ((FIGURE.thigh + FIGURE.shin) * sy), -1, 1));
          thigh = -a; knee = 2 * a; ankle = -a; abduct = 0.08;
        }
      }
      limbMatrix(base, sideX(side) * FIGURE.hipX, FIGURE.hipY, thigh, sideX(side) * abduct, sideX(side) * rollL, legM);
      legPose[0] = knee; legPose[1] = ankle; legPose[2] = toe;
      B.legs.push(legM, look.legs, legPose);
    }

    // --- Props: what the hands hold, the gánh or cart, a stool to sit on, the dish on the table -------------------
    if (!near) return;
    if (heldR >= 0 || paper) grip(armM, poseR, 1, gripPos, gripQuat);
    if (heldL >= 0 || paper) grip(armML, poseML, -1, leftPos, leftQuat);
    if (paper) {
      props.place(HELD.PAPER, (gripPos.x + leftPos.x) / 2, (gripPos.y + leftPos.y) / 2 + 0.06, (gripPos.z + leftPos.z) / 2, npc.yaw + Math.PI, 0.55);
    }
    if (heldR >= 0) {
      if (levelR) props.place(heldR as Held, gripPos.x, gripPos.y, gripPos.z, npc.yaw);
      else props.put(heldR as Held, propM.compose(gripPos, gripQuat, ONE));
    }
    if (heldL >= 0) {
      if (heldL === HELD.TICKETS) props.put(HELD.TICKETS, propM.compose(leftPos, leftQuat, ONE));
      else if (heldL === HELD.BAG) props.place(HELD.BAG, leftPos.x, leftPos.y, leftPos.z, npc.yaw);
      // The bowl sits on the upturned palm.
      else props.place(heldL as Held, leftPos.x, leftPos.y - 0.035, leftPos.z, npc.yaw);
    }
    // The dish or glass waits on the table in front of a seated eater whose hands are busy elsewhere.
    if (vessel && sit && sat > 0.6 && group && group.tables.length && !(env > 0.5 && HOLDS_VESSEL.has(act) && (act !== 'eat' || vessel === 'bowl'))) {
      const seatId = seatOf[npc.id], slot = seatId >= 0 ? POIS[seatId].slot ?? 0 : 0;
      const tb = group.tables[group.table[slot] ?? 0];
      const dx = npc.x - tb.x, dz = npc.z - tb.z, dl = Math.hypot(dx, dz) || 1;
      props.place(vesselItem(vessel, group.dish), tb.x + (dx / dl) * 0.18, tableTop(tb) + VESSEL_LIFT[vessel], tb.z + (dz / dl) * 0.18, npc.yaw);
    }
    // Seats that are not furniture: the doorstep stool, the attendant's chair.
    if (sit && sat > 0.3 && npc.seatFloor === 0 && place && (('building' in place && place.slot === DOORSTEP) || ('stand' in place && npc.role === 'guard'))) {
      const chair = npc.role === 'guard';
      props.place(chair ? HELD.CHAIR : HELD.STOOL, npc.spot?.x ?? npc.x, npc.y - 0.01, npc.spot?.z ?? npc.z, npc.yaw, 0, 0, 1, STOOL_COLORS[k % STOOL_COLORS.length]);
    }
    if (d.gear === 'pole' && npc.pose !== 'sit') {
      // The pole across the right shoulder; the baskets hang from its ends and swing fore and aft.
      pole.copy(chest).multiply(propM.makeTranslation(-0.16, 1.715, 0)).decompose(gripPos, gripQuat, gripScale);
      props.place(HELD.POLE, gripPos.x, gripPos.y + 0.02, gripPos.z, npc.yaw, 0.06);
      const basket = GOODS_BASKET[d.goods!] ?? HELD.BASKET_FRUIT;
      for (const end of [-0.78, 0.78]) {
        poleEnd.set(gripPos.x + Math.sin(npc.yaw) * end, gripPos.y + 0.02 - end * 0.06, gripPos.z + Math.cos(npc.yaw) * end);
        props.place(basket, poleEnd.x, poleEnd.y, poleEnd.z, npc.yaw, npc.pendA * (end > 0 ? 1 : 0.8));
      }
    } else if (d.gear === 'cart') {
      const f = 0.95;
      props.place(d.goods === 'kem' ? HELD.CART_KEM : HELD.CART_BANHMI, npc.x + Math.sin(npc.yaw) * f, groundHeight(npc.x, npc.z), npc.z + Math.cos(npc.yaw) * f, npc.yaw);
    }
  }

  // --- Standing about -------------------------------------------------------------------------
  /** A shopkeeper's ông Địa altar beside the door they work at (and where to stand to tend it), if any. */
  function altarOf(npc: Npc) {
    const place = npc.current?.place;
    if (!place || !('building' in place) || place.inside || npc.current?.kind !== 'work') return null;
    return LIFE.altars[place.building.id];
  }
  /** Whether a life is on now: a cook cooks while the quán is open, otherwise works like any shopkeeper. */
  function lifeOn(npc: Npc, life: Life) {
    if (life !== 'cook') return true;
    const place = npc.current?.place;
    const g = place && 'building' in place ? LIFE.groups.find((gr) => gr.building === place.building.id && gr.cook) : null;
    return !!g && furniture.isOpen(g.id);
  }
  /**
   * Picks what someone does next on their spot: vendors serve and call out to passers-by, shop staff sweep
   * their frontage or check their phones, everyone stretches, looks around, paces a few steps and waves
   * at a friendly face walking by; street life (a meal, coffee, a nap on the scooter) has its own table, and
   * shopkeepers light incense at the altar when they open and at dusk. Between acts they just stand (or sit).
   */
  function nextAct(npc: Npc, time: number, near: boolean) {
    const spot = npc.spot!;
    const altar = !spot.sit ? altarOf(npc) : null;
    const dusk = nowHour >= 16.9 && nowHour < 17.6;
    if (altar && npc.act === 'none' && ((nowHour < 9.5 && npc.incenseAM !== day) || (dusk && npc.incensePM !== day)) && npc.mind.intent === 'routine') {
      // Three sticks for Thần Tài and ông Địa: stand facing the altar, bow, set them in the pot.
      if (dusk) npc.incensePM = day; else npc.incenseAM = day;
      const f = altar.yaw;
      const ox = altar.x + Math.sin(f) * 0.55 - spot.x, oz = altar.z + Math.cos(f) * 0.55 - spot.z;
      if (Math.hypot(ox, oz) < 3 && world.clear(spot.x + ox, spot.z + oz, 0.3)) {
        npc.act = 'incense'; npc.offX = ox; npc.offZ = oz; npc.gaze = Math.PI;
        npc.actFrom = time + Math.hypot(ox, oz) / 0.9; npc.actUntil = npc.actFrom + ACT_TIME.incense[0];
        if (nearFocus(npc) && Math.random() < 0.5) say(npc, pick(LIFE_LINES.incense), false);
        incenseAt.set(npc.id, { x: altar.x, z: altar.z, yaw: f, until: npc.actUntil + 90 });
        return;
      }
    }
    if (npc.act !== 'none') {
      npc.act = 'none';
      npc.offX = npc.offZ = 0;
      npc.gaze = 0;
    } else {
      const intent = npc.mind.intent;
      const kind = npc.current?.kind;
      const place = npc.current?.place;
      const life = npc.current?.life;
      const front = !!place && 'building' in place && !place.inside;
      const poi = place && 'poi' in place ? place.poi : null;
      let table: [Act, number][];
      if (intent === 'watch') table = [['phone', 4], ['none', 3], ['look', 2], ['scratch', 1]];
      else if (intent === 'chat' || intent === 'avoid') table = [['none', 1]];
      else if (intent === 'shelter') table = [['phone', 3], ['look', 3], ['cross', 2], ['call', 1], ['none', 2]];
      else if (life && lifeOn(npc, life)) {
        table = lifeActs(life, { male: !dress[npc.id].style.fem, sitting: spot.sit, friendly: near, hour: nowHour, dish: poi && poi.group !== undefined ? LIFE.groups[poi.group].dish : null });
      } else if (npc.role === 'vendor') table = [['serve', 5], ['shout', 2], ['fan', 2], ['pace', 2], ['phone', 1], ['akimbo', 1], ['look', 1]];
      else if (kind === 'market') table = [['point', 3], ['look', 3], ['pay', 1], ['cross', 1], ['none', 2]];
      else if (kind === 'work') table = [['sweep', front ? 2 : 0], ['phone', 3], ['cross', 2], ['akimbo', 1], ['pace', 3], ['look', 2], ['stretch', 1], ['serve', 1], ['call', 1]];
      else table = [['phone', 3], ['call', 1], ['stretch', 1], ['scratch', 1], ['look', 3], ['pace', 3], ['cross', 1], ['akimbo', 1], ['fan', npc.role === 'retiree' ? 2 : 0.5], ['sweep', npc.role === 'retiree' && front ? 1 : 0]];
      if (near && intent !== 'chat' && intent !== 'avoid' && !life) table.push(['wave', 3]);
      if (spot.sit) table = table.filter(([a]) => SEATED.has(a));
      if (!table.length) table = [['none', 1]];
      const total = table.reduce((sum, [, w]) => sum + w, 0);
      let roll = Math.random() * total;
      let chosen: Act = 'none';
      for (const [a, w] of table) { roll -= w; if (roll <= 0) { chosen = a; break; } }
      if (chosen === 'pace') {
        // A few steps along the frontage (sideways from the way the spot faces), then back.
        const side = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.1);
        const out = Math.random() * 0.4;
        const ox = Math.cos(spot.yaw) * side + Math.sin(spot.yaw) * out, oz = -Math.sin(spot.yaw) * side + Math.cos(spot.yaw) * out;
        if (world.clear(spot.x + ox, spot.z + oz, 0.32) && world.clear(spot.x + ox * 0.5, spot.z + oz * 0.5, 0.32)) { npc.offX = ox; npc.offZ = oz; }
        else chosen = 'look';
      }
      if (chosen === 'look') npc.gaze = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.7);
      // Crumbs on the ground bring the pigeons over (animals.ts lure, wired by game.ts).
      if (chosen === 'feed') hooks.onFeed?.(spot.x + Math.sin(spot.yaw) * 1.2, spot.z + Math.cos(spot.yaw) * 1.2);
      npc.act = chosen;
    }
    const [lo, hi] = ACT_TIME[npc.act];
    npc.actFrom = time;
    npc.actUntil = time + lo + Math.random() * (hi - lo);
  }
  /** Back to just standing (when they leave the spot or something more pressing comes up). */
  function stopAct(npc: Npc, time: number) {
    if (npc.act === 'none' && !npc.offX && !npc.offZ) return;
    npc.act = 'none';
    npc.offX = npc.offZ = 0;
    npc.gaze = 0;
    npc.actFrom = time;
    npc.actUntil = time + 1 + Math.random() * 3;
  }

  // --- Places ---------------------------------------------------------------------------------
  function within(hour: number, a: Activity) {
    return a.start <= a.end ? hour >= a.start && hour < a.end : hour >= a.start || hour < a.end;
  }
  /** Under a roof: inside, at a building front (awning, arcade or door canopy), a market stall or a bus shelter. */
  function coveredPlace(place: Place) {
    if ('stand' in place) return place.stand.covered;
    if ('poi' in place) return place.poi.group !== undefined ? LIFE.groups[place.poi.group].covered : place.poi.kind === 'market' || place.poi.kind === 'bus-stop';
    return true;
  }
  type Spot = NonNullable<Npc['spot']>;
  const cookSpot = new Map<number, { x: number; z: number; yaw: number }>();
  for (const g of LIFE.groups) if (g.cook && g.building >= 0) cookSpot.set(g.building, g.cook);
  /**
   * Standing spot out front: shop workers beside the door (the cook at the pot), people sheltering in `slot` under the
   * awning, the doorstep stool beside the door (DOORSTEP) or standing by it to sweep (CHORES).
   */
  function frontSpot(b: Building, slot: number | undefined, id: number, outSpot: Spot) {
    // Right along the facade is (cos, -sin) of the facing; out toward the street is (sin, cos).
    const c = Math.cos(b.facing), s = Math.sin(b.facing);
    outSpot.yaw = b.facing;
    outSpot.sit = false;
    outSpot.top = outSpot.floor = undefined;
    const cook = slot === undefined && cooks.get(b) === id ? cookSpot.get(b.id) : undefined;
    if (cook) { outSpot.x = cook.x; outSpot.z = cook.z; outSpot.yaw = cook.yaw; return outSpot; }
    if (slot === DOORSTEP || slot === CHORES) {
      const side = LIFE.doorsteps[b.id] || 1, lat = slot === DOORSTEP ? side : -side * 0.8, back = slot === DOORSTEP ? 0.45 : 0.1;
      outSpot.x = b.door.x + c * lat - s * back;
      outSpot.z = b.door.z - s * lat - c * back;
      if (slot === DOORSTEP) { outSpot.sit = true; outSpot.top = 0.28; }
      return outSpot;
    }
    const side = slot === undefined ? ((id % 3) - 1) * 1.1 : FRONT_SLOTS[slot];
    const back = slot === undefined ? 0 : 0.3;
    outSpot.x = b.door.x + c * side - s * back;
    outSpot.z = b.door.z - s * side - c * back;
    return outSpot;
  }
  const scratch: Spot = { x: 0, z: 0, yaw: 0, sit: false };
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
    if ('poi' in place) return { x: place.poi.x, z: place.poi.z, curb: place.poi.curb, via: place.poi.via ?? null };
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
      v = { ...a, place, outdoor: false, life: undefined };
      rainy.set(a, v);
    }
    return v;
  }
  /** The activity to be heading for now: the current one, or the next one if it is time to leave for it. */
  function due(npc: Npc, hour: number, raining: boolean) {
    const list = npc.schedule;
    let chosen = list.find((a) => within(hour, a)) ?? null;
    // A meal, a game or a date is not cut short for a long walk to whatever comes next: people stay at least
    // two thirds of it and arrive late instead.
    const stay = chosen?.life && chosen.life !== 'hawk' && chosen.life !== 'lottery' ? Math.min(0.5, 0.35 * ((chosen.end - chosen.start + 24) % 24)) : Infinity;
    for (const a of list) {
      if (a === chosen) continue;
      // Hawkers and vé số sellers leave a stop only once they must, so they stand at each one a while.
      const lead = Math.min(stay, travelHours(npc, a.place) + (a.life === 'hawk' || a.life === 'lottery' ? 0.02 : 0.15));
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
  /** A seat's surface above the ground at it: street-life seats carry it, scooters stand on the base world.ts gives them. */
  function seatTopOf(p: Poi) {
    if (p.kind === 'perch') {
      const base = (onSidewalk(p.x, p.z) ? CURB_HEIGHT : 0) - groundHeight(p.x, p.z);
      return { top: SADDLE + base, floor: FLOORBOARD + base };
    }
    const seat = SEAT_KIND[p.kind];
    return { top: p.seatH ?? (seat ? seatHeight(seat, p.x, p.z) : 0.45), floor: 0 };
  }
  function spotFor(npc: Npc, place: Place, poi?: Poi): Spot {
    if ('stand' in place) return { x: place.stand.x, z: place.stand.z, yaw: place.stand.yaw, sit: place.stand.sit, top: place.stand.top };
    if ('poi' in place) {
      const p = poi ?? place.poi;
      // Street-life spots are exact (onlookers shuffle a little); other places spread people round the point.
      const jitter = p.seat ? 0 : p.group !== undefined ? (p.kind === 'kibitz' ? 0.25 : 0) : 0.9;
      const a = npc.id * 2.4;
      const seat = p.seat ? seatTopOf(p) : null;
      return { x: p.x + Math.cos(a) * jitter, z: p.z + Math.sin(a) * jitter, yaw: p.yaw, sit: p.seat, top: seat?.top, floor: seat?.floor };
    }
    // Shop workers stand out front beside the door, facing the street; sheltering people in their slot.
    return frontSpot(place.building, place.slot, npc.id, { x: 0, z: 0, yaw: 0, sit: false });
  }
  /** The way back onto the sidewalk network from a standing spot at `place` (round the table or the scooter first). */
  function leaveFor(place: Place): Waypoint[] {
    if ('poi' in place) {
      const p = place.poi;
      return p.via ? [{ x: p.via.x, z: p.via.z, crossing: false }, { x: p.curb.x, z: p.curb.z, crossing: false }] : [{ x: p.curb.x, z: p.curb.z, crossing: false }];
    }
    if ('building' in place) return [{ x: place.building.door.x, z: place.building.door.z, crossing: false }, { x: place.building.curb.x, z: place.building.curb.z, crossing: false }];
    if ('stand' in place) return [{ x: place.stand.curb.x, z: place.stand.curb.z, crossing: false }];
    return [];
  }
  // --- Seats and gatherings ---
  /** Who sits on each seat POI right now (npc id, or PLAYER for the player's), and the group scenes. */
  const PLAYER = -2;
  const seatHolder = new Map<number, number>();
  const seatOf = new Int32Array(npcs.length).fill(-1);
  const gatherings = createGatherings(LIFE.groups.map((g) => ({ id: g.id, kind: g.kind, slots: g.slots.length, seats: g.seats, table: g.table, cx: g.x, cz: g.z, radius: g.radius })));
  /** Leaves the seat (and the group scene) someone was on. */
  function unseat(npc: Npc) {
    const id = seatOf[npc.id];
    if (id >= 0 && seatHolder.get(id) === npc.id) seatHolder.delete(id);
    seatOf[npc.id] = -1;
    gatherings.leave(npc.id);
  }
  /**
   * Settles someone on their spot at `place`: a seat someone else (or the player) already has sends them to the next
   * free seat of the same group, or to stand beside it; group members join their scene.
   */
  function takeSpot(npc: Npc, place: Place) {
    unseat(npc);
    let poi: Poi | undefined;
    if ('poi' in place) {
      poi = place.poi;
      const holder = seatHolder.get(poi.id);
      if (poi.seat && holder !== undefined && holder !== npc.id) {
        const g = poi.group !== undefined ? LIFE.groups[poi.group] : null;
        const free = g?.slots.slice(0, g.seats).map((id) => POIS[id]).find((p) => !seatHolder.has(p.id));
        if (free) poi = free;
        else {
          // Nowhere to sit: stand a step behind the taken seat.
          const s = spotFor(npc, place);
          return { ...s, x: s.x - Math.sin(s.yaw) * 0.6 + Math.cos(s.yaw) * 0.3, z: s.z - Math.cos(s.yaw) * 0.6 - Math.sin(s.yaw) * 0.3, sit: false, top: undefined };
        }
      }
    }
    const spot = spotFor(npc, place, poi);
    if (poi) {
      if (poi.seat) { seatHolder.set(poi.id, npc.id); seatOf[npc.id] = poi.id; }
      if (poi.group !== undefined && poi.slot !== undefined) gatherings.join(poi.group, poi.slot, npc.id, clock, npc.current?.life === 'beer');
    }
    if (spot.sit) { npc.seatTop = spot.top ?? 0.45; npc.seatFloor = spot.floor ?? 0; }
    return spot;
  }
  /** Plans a sidewalk route from wherever the NPC is to `target`, ending at the exact spot. */
  function walkTo(npc: Npc, target: Target, run: boolean) {
    const start: Waypoint[] = [];
    if (npc.inside) start.push({ x: npc.inside.curb.x, z: npc.inside.curb.z, crossing: false });
    else if (npc.state === 'at') {
      // Getting up from a seat takes a moment; someone who ran off their spot (a chase) goes back to it first.
      if (npc.spot?.sit && npc.sitT > 0.5) npc.riseUntil = clock + (run ? 0.3 : 0.45);
      const m = gatherings.member(npc.id), g = m ? LIFE.groups[m.g] : null;
      if (npc.spot && Math.hypot(npc.x - npc.spot.x, npc.z - npc.spot.z) > 0.4) {
        if (g?.kind === 'chase') {
          // Round the track (never across the fountain) back to their place on it.
          const a0 = Math.atan2(npc.x - g.x, npc.z - g.z), a1 = Math.atan2(npc.spot.x - g.x, npc.spot.z - g.z);
          const turn = wrap(a1 - a0), steps = Math.ceil(Math.abs(turn) / 0.4);
          for (let k = 1; k < steps; k++) start.push({ x: g.x + g.radius * Math.sin(a0 + (turn * k) / steps), z: g.z + g.radius * Math.cos(a0 + (turn * k) / steps), crossing: false });
        }
        start.push({ x: npc.spot.x, z: npc.spot.z, crossing: false });
      }
      start.push(...npc.leave);
    }
    unseat(npc);
    const from = start.length ? start[start.length - 1] : nav.snap(npc.x, npc.z);
    npc.path = [...start, ...nav.route(from.x, from.z, target.curb.x, target.curb.z)];
    if (target.via) npc.path.push({ x: target.via.x, z: target.via.z, crossing: false });
    npc.path.push({ x: target.x, z: target.z, crossing: false });
    npc.pathIndex = 0;
    npc.crossOk = -1;
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
    npc.spot = takeSpot(npc, place);
    npc.x = npc.spot.x;
    npc.z = npc.spot.z;
    npc.state = 'at';
    npc.sitT = 0;
    npc.leave = leaveFor(place);
  }
  function startActivity(npc: Npc, next: Activity, run = false) {
    npc.current = next;
    if (npc.state === 'inside' && 'building' in next.place && next.place.inside && npc.inside === next.place.building) return;
    walkTo(npc, placePoint(next.place, npc), run);
    const life = next.life;
    const line = run ? pick(LINES.dash) : life === 'meal' || life === 'coffee' || life === 'tea' || life === 'beer' ? pick(LIFE_LINES[life])
      : life ? '' : next.kind === 'work' ? pick(LINES.commute) : next.kind === 'school' ? pick(LINES.school) : next.kind === 'home' ? pick(LINES.home) : '';
    if (!life || nearFocus(npc)) say(npc, line, false);
  }

  // Initial state at the starting hour: everyone is already where their routine says.
  function settle(hour: number) {
    for (const npc of npcs) {
      if (npc.role === 'thief' || npc.state === 'down' || npc.state === 'away') continue;
      const a = npc.schedule.find((s) => within(hour, s)) ?? npc.schedule[0];
      npc.current = a;
      if ('building' in a.place && a.place.inside) { npc.state = 'inside'; npc.inside = a.place.building; }
      else { npc.inside = null; npc.spot = takeSpot(npc, a.place); npc.x = npc.spot.x; npc.z = npc.spot.z; npc.yaw = npc.spot.yaw; npc.state = 'at'; npc.sitT = 1; npc.leave = leaveFor(a.place); }
      npc.mind.needs.fatigue = hour >= 20 || hour < 5 ? 0.5 : npc.mind.needs.fatigue;
    }
  }

  let saySink = hooks.say;
  /** Time of the latest update, for things that happen between frames (lines said from outside update). */
  let clock = 0;
  function say(npc: Npc, text: string, shout: boolean) {
    if (!text || !saySink) return;
    saySink(npc, text, shout);
    // The mouth moves for about as long as the line takes to say.
    npc.talkUntil = clock + Math.min(shout ? 2.4 : 3.2, 0.5 + text.length * 0.06);
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
    const holder = seatHolder.get(p.id);
    if (holder !== undefined && holder !== self.id) return true;
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
      mind.topic = 'talk';
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
  /**
   * A passer-by stops at a hawker or a vé số seller standing at a stop: hungry people buy something to eat, a few
   * buy a ticket. The buyer halts in front for a few seconds (a 'buy' chat), the seller serves or holds out tickets.
   */
  const sellers = npcs.filter((n) => n.role === 'hawker' || n.role === 'lottery');
  const busyUntil = new Map<number, number>();
  /** Lines said a moment after another one (the seller's answer). */
  const later: { npc: Npc; text: string; at: number }[] = [];
  function maybeBuy(npc: Npc, time: number, hour: number) {
    const mind = npc.mind;
    if (npc.state !== 'walking' || npc.run || time < mind.cooldown || hour < 6 || hour > 22 || npc.gang >= 0 || !npc.current || npc.current.life) return;
    if (npc.role === 'hawker' || npc.role === 'lottery' || npc.role === 'thief') return;
    for (const seller of sellers) {
      if (seller.state !== 'at' || seller.mind.intent !== 'routine' || time < (busyUntil.get(seller.id) ?? 0)) continue;
      const dx = seller.x - npc.x, dz = seller.z - npc.z, d = Math.hypot(dx, dz);
      if (d > 6 || d < 0.5) continue;
      const lottery = seller.role === 'lottery';
      mind.cooldown = time + 40;
      if (lottery ? Math.random() > 0.15 : mind.needs.hunger < 0.35) return;
      // Stand a step in front of the seller, facing them.
      const yaw = seller.spot ? seller.spot.yaw : seller.yaw, x = seller.x + Math.sin(yaw) * 0.9, z = seller.z + Math.cos(yaw) * 0.9;
      if (!world.clear(x, z, 0.25)) return;
      engage(mind, 'chat', time);
      mind.partner = seller.id; mind.until = time + 5; mind.topic = 'buy'; mind.stage = 0; mind.lineAt = time + 0.4;
      npc.state = 'at'; npc.spot = { x, z, yaw: Math.atan2(seller.x - x, seller.z - z), sit: false }; npc.leave = []; npc.speed = 0;
      busyUntil.set(seller.id, time + 5);
      seller.act = lottery ? 'offer' : 'serve'; seller.actFrom = time; seller.actUntil = time + 4.5;
      seller.gaze = wrap(Math.atan2(x - seller.x, z - seller.z) - yaw);
      if (!lottery) mind.needs.hunger = Math.max(0, mind.needs.hunger - 0.3);
      return;
    }
  }
  function talk(npc: Npc, time: number) {
    const mind = npc.mind;
    if (time < mind.lineAt) return;
    mind.lineAt = time + 3.4 + Math.random() * 1.6;
    if (mind.topic === 'buy') {
      // Asking for it, and the seller's answer a moment later.
      const seller = npcs[mind.partner];
      if (mind.stage++ === 0 && seller && nearFocus(npc)) {
        const goods = dress[seller.id].goods;
        say(npc, pick(LIFE_LINES.buy[seller.role === 'lottery' ? 'lottery' : goods ?? 'banhmi']), false);
        later.push({ npc: seller, text: pick(seller.role === 'lottery' ? LIFE_LINES.sellLottery : LIFE_LINES.sell), at: time + 1.6 });
      }
      return;
    }
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
    // A date, a game of chess or a table of friends is not something to wander off from (no detours during street life).
    s.detour = mind.intent === 'routine' && npc.role !== 'gang' && npc.role !== 'vendor' && (kind === 'leisure' || kind === 'market' || kind === 'eat') && !npc.current?.life;
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
    // A xe ôm driver or a couple whose scooter has gone (ridden off, towed) gets up beside where it stood.
    const perch = npc.state === 'at' && npc.spot?.sit && npc.current && 'poi' in npc.current.place && npc.current.place.poi.kind === 'perch' ? npc.current.place.poi : null;
    if (perch && hooks.bikeAt && !hooks.bikeAt(perch.x, perch.z)) {
      npc.spot = { x: perch.via?.x ?? npc.x, z: perch.via?.z ?? npc.z, yaw: npc.yaw, sit: false };
      if (nearFocus(npc)) say(npc, pick(LIFE_LINES.stolen), true);
    }
    if (mind.intent === 'routine' && chatWith && !raining) maybeChat(npc, chatWith, time, hour);
    if (mind.intent === 'routine' && !raining) maybeBuy(npc, time, hour);
    const before = mind.intent;
    const after = decide(mind, sense, time);
    if (after !== before) {
      stop(npc, time);
      if (after !== 'routine') begin(npc, after, time, raining);
    }
    if (mind.intent === 'routine') routine(npc, next, raining, dt);
    else if (mind.intent === 'chat') talk(npc, time);
  }

  /**
   * Where the eyes go and how the clothes swing: the head turns toward the threat, the incident, the chat
   * partner, the player walking past (a glance) or looks idly about, and the chest follows a little; skirts,
   * áo dài tà and ponytails ride a spring driven by the stride.
   */
  function animate(npc: Npc, time: number, dt: number, threat: Threat, d: number) {
    const mind = npc.mind, inc = mind.incident, act = npc.state === 'at' ? npc.act : 'none';
    let tx = 0, tz = 0, ty = 1.5, target = false;
    let yaw = 0, pitch = npc.pose === 'run' ? 0 : 0.06;
    if (npc.state === 'afraid' || npc.state === 'chasing' || (npc.gang >= 0 && d < 9 && !threat.inVehicle) || (act === 'wave' && d < 9)) {
      tx = threat.x; tz = threat.z; target = true;
    } else if (mind.intent === 'watch' && inc && npc.state === 'at') {
      tx = inc.x; tz = inc.z; target = true;
      ty = inc.kind === 'fire' ? 3 : inc.kind === 'body' ? 0.2 : 0.9;
    } else if (mind.intent === 'chat' && npc.state === 'at' && npcs[mind.partner]) {
      tx = npcs[mind.partner].x; tz = npcs[mind.partner].z; target = true;
    } else if (d < 7 && !threat.inVehicle && !threat.down && npc.state !== 'fleeing') {
      // Someone passing close by gets a glance of a second and a half, now and then.
      if (time - npc.glanceAt > 8 + (npc.id % 5)) npc.glanceAt = time;
      if (time - npc.glanceAt < 1.5) { tx = threat.x; tz = threat.z; target = true; }
    }
    if (target) {
      const dx = tx - npc.x, dz = tz - npc.z;
      yaw = wrap(Math.atan2(dx, dz) - npc.yaw);
      // Behind them: they would have to turn round, so they don't look.
      if (Math.abs(yaw) > 2) yaw = 0;
      pitch = clamp(Math.atan2(1.5 - ty, Math.hypot(dx, dz) + 0.5), -0.35, 0.45);
    } else if (npc.pose === 'idle' || npc.pose === 'sit') {
      // Looking about: a slow drift with the odd quick look aside.
      yaw = 0.45 * Math.sin(time * 0.31 + npc.id * 2.3) + 0.3 * Math.sin(time * 0.87 + npc.id) ** 5;
      if (act === 'look') yaw += npc.gaze * 0.6;
    } else if (npc.pose === 'walk') {
      // The odd look at a shop window on the way.
      yaw = 0.55 * Math.max(0, Math.sin(time * 0.21 + npc.id * 1.9)) ** 6 * (npc.id % 2 ? 1 : -1);
    }
    switch (act) {
      case 'phone': if (mind.intent !== 'watch') { yaw = 0; pitch = 0.42; } break;
      case 'call': pitch = 0.08; break;
      case 'stretch': yaw *= 0.3; pitch = -0.3; break;
      case 'shout': pitch = -0.08; break;
      case 'sweep': yaw *= 0.3; pitch = 0.35; break;
      case 'serve': pitch = 0.18; break;
      case 'scratch': pitch = 0.12; break;
      default: break;
    }
    if (mind.intent === 'chat' && npc.state === 'at') {
      // Nodding along while the other one talks; a little head movement while talking.
      const other = npcs[mind.partner];
      if (time < npc.talkUntil) pitch += 0.04 * Math.sin(time * 7 + npc.id);
      else if (other && time < other.talkUntil) pitch += 0.08 * Math.max(0, Math.sin(time * 4.5 + npc.id));
    }
    npc.headYaw = THREE.MathUtils.damp(npc.headYaw, clamp(yaw, -1.1, 1.1), 6, dt);
    npc.headPitch = THREE.MathUtils.damp(npc.headPitch, pitch, 5, dt);
    // Secondary motion: a damped spring toward a flare that grows with the stride (sub-stepped to stay stable).
    // Seated, an áo dài's front tà (or an apron) lies on the lap.
    const want = npc.pose === 'sit' ? (dress[npc.id].lap ? npc.lapFront : 0) : Math.min(0.9, Math.abs(npc.swing) * 0.6 + npc.speed * 0.08);
    const steps = Math.min(8, Math.ceil(dt / 0.02));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      npc.secV += (60 * (want - npc.sec) - 8 * npc.secV) * h;
      npc.sec += npc.secV * h;
    }
    npc.sec = clamp(npc.sec, -0.4, npc.pose === 'sit' ? 1.9 : 0.9);
  }

  /**
   * Knocks a person down as a ragdoll of their own size and clothes (the style is remembered for the look). `hit`
   * is where the blow landed and `kind` what dealt it; `mode` limp for the dead, else they brace or stumble.
   */
  function knock(npc: Npc, vx: number, vy: number, vz: number, time: number, hit?: { x: number; y: number; z: number } | null, mode?: FallMode, kind?: HitKind) {
    if (!visible(npc)) return null;
    // Someone on a stool or bench falls from the seat (before stop() stands them up).
    const seat = npc.pose === 'sit' ? npc.seatTop : null;
    stop(npc, time);
    unseat(npc);
    npc.riseUntil = -1;
    npc.state = 'down';
    npc.timer = time + 9;
    npc.pooled = false;
    npc.body = ragdolls.spawn({
      x: npc.x, y: npc.y + (seat ?? 0), z: npc.z, yaw: npc.yaw, scale: BODY_SCALE, look: npc.look, velocity: { x: vx, y: vy, z: vz },
      hit, mode, kind, from: seat === null ? 'stand' : 'sit',
    });
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
    /** The street-life layout (city.ts LIFE): groups, furniture, altars, posts. */
    life: LIFE,
    /** The group scenes (street-life.ts gatherings), for checks. */
    scenes: gatherings,
    setSay(fn: (npc: Npc, text: string, shout: boolean) => void) { saySink = fn; },
    /** The camera frustum the next update draws for (null: draw everyone). */
    setView(frustum: THREE.Frustum | null) {
      view = frustum;
      eyeKnown = false;
      if (!frustum) return;
      // Any three side planes meet at the eye (as vehicles.ts setView).
      const [p0, p1, p2] = frustum.planes, [a, b, c] = eyeCross;
      a.crossVectors(p1.normal, p2.normal);
      const det = p0.normal.dot(a);
      if (Math.abs(det) < 1e-9) return;
      b.crossVectors(p2.normal, p0.normal);
      c.crossVectors(p0.normal, p1.normal);
      eye.copy(a.multiplyScalar(-p0.constant)).addScaledVector(b, -p1.constant).addScaledVector(c, -p2.constant).divideScalar(det);
      eyeKnown = Number.isFinite(eye.x + eye.y + eye.z);
    },
    /** Empties (or refills) the streets; the caller stops calling `update` while disabled. */
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) {
        for (const batch of batches) { batch.begin(); batch.end(); }
        for (const npc of npcs) unseat(npc);
        props.begin(0, 0); props.end();
        wisps.setEnabled(false);
      } else wisps.setEnabled(!lowDetail);
    },
    /**
     * Seats the player can take (benches, bus-stop seats, café and quán stools, cờ tướng stools) within `r` of
     * (x, z): `top` is the seat surface above the ground there (groundHeight + top is its world height), `taken`
     * whether someone (or the player) sits there now.
     */
    seatsNear(x: number, z: number, r: number) {
      const out: { id: number; x: number; z: number; yaw: number; top: number; kind: string; taken: boolean; free: boolean }[] = [];
      for (const p of POIS) {
        if (!p.seat || p.kind === 'perch' || Math.abs(p.x - x) > r || Math.abs(p.z - z) > r || Math.hypot(p.x - x, p.z - z) > r) continue;
        if (p.group !== undefined && !furniture.isOpen(p.group)) continue;
        const taken = seatHolder.has(p.id);
        out.push({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, top: seatTopOf(p).top, kind: p.kind, taken, free: !taken });
      }
      return out;
    },
    /** Reserves the nearest free seat within `maxDist` for the player (no one else will sit there until released), or null. */
    claimSeat(x: number, z: number, maxDist: number) {
      let best: Poi | null = null, bestD = maxDist;
      for (const p of POIS) {
        if (!p.seat || p.kind === 'perch' || seatHolder.has(p.id) || (p.group !== undefined && !furniture.isOpen(p.group))) continue;
        const dd = Math.hypot(p.x - x, p.z - z);
        if (dd <= bestD && !npcs.some((n) => n.state === 'walking' && n.current && 'poi' in n.current.place && n.current.place.poi === p && Math.hypot(n.x - p.x, n.z - p.z) < 1.2)) { best = p; bestD = dd; }
      }
      if (!best) return null;
      seatHolder.set(best.id, PLAYER);
      return { id: best.id, x: best.x, z: best.z, yaw: best.yaw, top: seatTopOf(best).top, kind: best.kind as string };
    },
    releaseSeat(id: number) { if (seatHolder.get(id) === PLAYER) seatHolder.delete(id); },
    /**
     * The street's people by role ('ve-so' lottery sellers, 'xe-om' drivers, 'giu-xe' attendants, 'hawker',
     * 'homemaker'): every one out on the street, and whether they are at their post now (selling, waiting for a
     * fare, minding the bikes) rather than on their way or off duty.
     */
    forEachRole(role: string, cb: (npc: Npc, onDuty: boolean) => void) {
      const want = ROLE_NAMES[role];
      if (!want) return;
      for (const npc of npcs) {
        if (npc.role !== want || !visible(npc)) continue;
        const life = npc.current?.life;
        const duty = npc.mind.intent === 'routine' && (life === 'lottery' || life === 'hawk' ? npc.state === 'at' || npc.state === 'walking' : (life === 'xeom' || life === 'guard') && npc.state === 'at');
        cb(npc, duty);
      }
    },
    /** Someone turns to the player and serves (or offers tickets), saying `line` if given, for a few seconds. */
    serve(npc: Npc, x: number, z: number, line?: string) {
      if (!visible(npc)) return;
      if (npc.state === 'walking' && npc.current) { npc.state = 'at'; npc.spot = { x: npc.x, z: npc.z, yaw: Math.atan2(x - npc.x, z - npc.z), sit: false }; npc.leave = []; }
      if (npc.state !== 'at') return;
      npc.act = npc.role === 'lottery' ? 'offer' : 'serve';
      npc.actFrom = clock; npc.actUntil = clock + 4;
      npc.targetYaw = Math.atan2(x - npc.x, z - npc.z);
      if (npc.spot && !npc.spot.sit) npc.spot.yaw = npc.targetYaw;
      if (line) say(npc, line, false);
    },
    /**
     * After the clock jumps (a ride across town, sleeping, a debug hour change): everyone is put straight where their day
     * says they are at `hour`, instead of walking there for minutes.
     */
    skipTo(hour: number) {
      for (const npc of npcs) {
        if (npc.role === 'thief' || npc.state === 'down' || npc.state === 'away') continue;
        if (npc.mind.intent !== 'routine') stop(npc, clock);
        unseat(npc);
        npc.riseUntil = -1;
        npc.path = []; npc.pathIndex = 0;
        npc.act = 'none'; npc.actUntil = clock + Math.random() * 3; npc.offX = npc.offZ = 0; npc.gaze = 0;
      }
      settle(hour);
      started = true;
      lastHour = hour;
      furniture.recheck();
    },
    /**
     * Moves the giữ xe attendants' chairs to where the parking lots want them (parking.ts LOTS attendants), in order;
     * attendants beyond the list keep their LIFE.posts chair. Hours stay as they were.
     */
    setPosts(posts: readonly { x: number; z: number; yaw: number }[]) {
      npcs.filter((n) => n.role === 'guard').forEach((guard, k) => {
        const p = posts[k];
        if (!p) return;
        for (const a of guard.schedule) {
          if (a.life !== 'guard' || !('stand' in a.place)) continue;
          const s = a.place.stand, curb = nav.snap(p.x, p.z);
          Object.assign(s, { x: p.x, z: p.z, yaw: p.yaw, curb: { x: curb.x, z: curb.z } });
          if (guard.current === a && guard.state === 'at' && guard.spot) {
            guard.x = guard.spot.x = p.x; guard.z = guard.spot.z = p.z; guard.spot.yaw = guard.yaw = p.yaw;
            guard.leave = leaveFor(a.place);
          }
        }
      });
    },
    /** Takes someone off the street for `seconds` (a xe ôm driver out on a fare); they come back to their day after. */
    sendAway(npc: Npc, seconds: number) {
      if (!visible(npc)) return;
      stop(npc, clock);
      unseat(npc);
      npc.state = 'away';
      npc.timer = clock + seconds;
      npc.inside = null;
    },
    /** Street-life prop detail for a quality level 0-5 (held props within 45 m from 3, 30 m at 5; no wisps from 3; no altars at 5). */
    setPropDetail(level: number) {
      lowDetail = level >= 3;
      props.setDetail(level);
      furniture.setDetail(level);
      wisps.setEnabled(level < 3 && enabled);
    },
    /** Counts for checks: who is doing what on the street right now. */
    lifeStats() {
      const s = { exercising: 0, stools: 0, eating: 0, chessGames: 0, kidsPlaying: 0, outside: 0, beer: 0, couples: 0, hawkers: 0, doorstep: 0, seated: 0 };
      for (const npc of npcs) {
        if (!visible(npc)) continue;
        s.outside++;
        const life = npc.current?.life, at = npc.state === 'at';
        if (npc.pose === 'sit') s.seated++;
        if (at && life === 'exercise') s.exercising++;
        if (at && seatOf[npc.id] >= 0 && POIS[seatOf[npc.id]].kind === 'stool') { s.stools++; if (life === 'meal' || life === 'beer') s.eating++; }
        if (at && (life === 'shuttle' || life === 'chase')) s.kidsPlaying++;
        if (at && life === 'beer') s.beer++;
        if (at && life === 'couple') s.couples++;
        if (at && life === 'doorstep') s.doorstep++;
        if (npc.role === 'hawker') s.hawkers++;
      }
      for (const g of LIFE.groups) if (g.kind === 'chess') { const m = gatherings.members(g.id); if (m && m[0] >= 0 && m[1] >= 0) s.chessGames++; }
      return s;
    },
    /** For checks: every group member really is at that group's spot, and nobody shares a seat. */
    lifeConsistent() {
      if (!gatherings.consistent()) return false;
      const seen = new Set<number>();
      for (const npc of npcs) { const id = seatOf[npc.id]; if (id < 0) continue; if (seen.has(id) || seatHolder.get(id) !== npc.id) return false; seen.add(id); }
      return true;
    },
    knock,
    provoke,
    flee,
    /**
     * Applies damage. Returns what happened so callers can tear limbs, drop money or update missions. `at` is the
     * world point that was hit and `kind` what hit it, for the ragdoll.
     */
    damage(npc: Npc, amount: number, vx: number, vy: number, vz: number, time: number, force = false, at?: { x: number; y: number; z: number } | null, kind?: HitKind) {
      if (!visible(npc)) return null;
      npc.health -= amount;
      npc.hitAt = time;
      if (npc.gang >= 0) provoke(npc.gang, 1, time);
      const killed = npc.health <= 0;
      if (killed || force) {
        const body = knock(npc, vx, vy, vz, time, at, killed ? 'limp' : undefined, kind);
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
      clock = time;
      nowHour = hour;
      if (!started) { settle(hour); started = true; lastHour = hour; }
      if (hour < lastHour) day++;
      lastHour = hour;
      // Street life: stools out or stacked, group scenes (whose turn, the shuttlecock, toasts), members still there.
      furniture.update(time, hour, raining);
      gatherings.tick(time, lifeHooks);
      if (time >= sweepAt) {
        sweepAt = time + 2;
        gatherings.sweep((id, g) => { const n = npcs[id]; const p = n?.current?.place; return !!n && n.state === 'at' && !!p && 'poi' in p && p.poi.group === g; });
      }
      lifeLines = Math.min(2, lifeLines + dt * 2);
      for (let k = later.length - 1; k >= 0; k--) if (time >= later[k].at) { const l = later.splice(k, 1)[0]; if (visible(l.npc)) say(l.npc, l.text, false); }
      shuttleAt.clear();
      gatherings.shuttles((g, sh, from, to) => {
        const a = npcs[from], b = npcs[to];
        const v = shuttlePos.get(g) ?? new THREE.Vector3();
        shuttlePos.set(g, v);
        if (time < sh.launch) {
          // Waiting at the kicker's foot, or lying where it dropped until it is picked up.
          if (sh.dropped && time < sh.launch - 0.4) v.set(a.x + Math.cos(sh.spin) * 0.8, a.y + 0.03, a.z + Math.sin(sh.spin) * 0.8);
          else v.set(a.x, a.y + 0.45, a.z);
        } else {
          const u = clamp((time - sh.launch) / Math.max(0.6, sh.land - sh.launch), 0, 1);
          // A miss drops it beside the receiver instead of onto their foot.
          const mx = sh.miss ? Math.cos(sh.spin) * 0.8 : 0, mz = sh.miss ? Math.sin(sh.spin) * 0.8 : 0;
          const tx = b.x + mx, tz = b.z + mz, y0 = a.y + 0.45, y1 = sh.miss ? b.y + 0.03 : b.y + 0.45;
          v.set(a.x + (tx - a.x) * u, y0 + (y1 - y0) * u + sh.apex * 4 * u * (1 - u), a.z + (tz - a.z) * u);
        }
        shuttleAt.set(g, v);
      });
      props.begin(fx, fz);
      setPropGlow(hour < 5.5 || hour > 18.8 ? 1 : hour < 6.5 ? 6.5 - hour : hour > 17.8 ? hour - 17.8 : 0);
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
            unseat(npc);
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
        if ((npc.state === 'walking' || npc.state === 'fleeing') && time < npc.riseUntil) {
          // Getting up off the seat first.
          npc.speed = 0;
          npc.pose = 'sit';
          npc.sitT = clamp((npc.riseUntil - time) / 0.45, 0, 1);
        } else if (npc.state === 'walking' || npc.state === 'fleeing') {
          const target = npc.path[npc.pathIndex];
          const run = npc.run || npc.state === 'fleeing';
          // A loaded gánh or a cart slows a hawker down.
          const want = run ? 3.8 : npc.pace * (mind.umbrella > 0.5 ? 0.85 : 1) * (dress[i].gear ? 0.8 : 1);
          npc.speed = THREE.MathUtils.damp(npc.speed, want, 4, dt);
          npc.pose = run ? 'run' : 'walk';
          if (!target) arrive(npc);
          else if (target.crossing && !run && npc.crossOk !== npc.pathIndex && Math.hypot(target.x - npc.x, target.z - npc.z) > 12 && !walkOk(npc.x, npc.z, target.x, target.z, time)) {
            // On the curb at a crosswalk: wait until the lights hold the traffic.
            npc.speed = 0;
            npc.pose = 'idle';
            npc.targetYaw = Math.atan2(target.x - npc.x, target.z - npc.z);
          } else {
            if (target.crossing) npc.crossOk = npc.pathIndex;
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
          const focused = mind.intent === 'chat' || mind.intent === 'watch' || mind.intent === 'avoid';
          // A friendly face close by (the player, not pointing a gun or speeding past) gets a wave.
          const friendly = d < 7 && !threat.armed && !threat.inVehicle && !threat.down;
          // Group scenes say what members do (whose turn at the board, the troupe's move, a toast); otherwise the act table.
          const cue = mind.intent === 'routine' && npc.act !== 'incense' ? gatherings.actFor(npc.id, time) : null;
          if (npc.gang >= 0 || (mind.intent === 'chat' && npc.act !== 'none')) stopAct(npc, time);
          else if (cue) {
            if (cue.act !== npc.act || cue.from !== npc.actFrom) { npc.act = cue.act; npc.actFrom = cue.from; npc.actUntil = cue.until; npc.offX = npc.offZ = 0; npc.gaze = 0; }
            npc.actParam = cue.param;
          } else if (time > npc.actUntil) nextAct(npc, time, friendly);
          if (npc.spot.sit) npc.sitT = Math.min(1, npc.sitT + dt / 0.5);
          // Kids chasing each other round the fountain run on the track, not on their spot.
          const member = gatherings.member(npc.id);
          const scene = member ? LIFE.groups[member.g] : null;
          const chase = scene?.kind === 'chase' && mind.intent === 'routine' ? gatherings.chase(npc.id, time, dt, lifeHooks) : null;
          // Settle onto the spot (people who stop to chat step to a comfortable distance); pacing walks off and back.
          const gx = npc.spot.x + npc.offX, gz = npc.spot.z + npc.offZ;
          const sx = gx - npc.x, sz = gz - npc.z, off = Math.hypot(sx, sz);
          if (chase && scene) {
            npc.x = scene.x + scene.radius * Math.sin(chase.angle);
            npc.z = scene.z + scene.radius * Math.cos(chase.angle);
            npc.speed = Math.abs(chase.speed);
            npc.pose = npc.speed > 0.3 ? 'run' : 'idle';
            if (npc.speed > 0.3) npc.targetYaw = chase.speed > 0 ? Math.atan2(Math.cos(chase.angle), -Math.sin(chase.angle)) : Math.atan2(-Math.cos(chase.angle), Math.sin(chase.angle));
          } else if (off > 0.15 && !npc.spot.sit) {
            npc.speed = THREE.MathUtils.damp(npc.speed, 0.9, 5, dt);
            const step = Math.min(off, npc.speed * dt);
            npc.x += sx / off * step; npc.z += sz / off * step;
            npc.pose = 'walk';
            npc.targetYaw = Math.atan2(sx, sz);
          } else {
            if (off > 0.02) { const step = Math.min(off, 1.2 * dt); npc.x += sx / off * step; npc.z += sz / off * step; }
            npc.speed = THREE.MathUtils.damp(npc.speed, 0, 6, dt);
            npc.pose = npc.spot.sit ? 'sit' : 'idle';
            // At a table, a board or in a troupe people keep facing it; elsewhere they look about.
            const sway = scene ? (scene.kind === 'exercise' ? 0 : 0.12) : focused ? 0.12 : 0.4;
            npc.targetYaw = npc.spot.yaw + npc.gaze + Math.sin(time * 0.2 + npc.id) * sway;
            // Vendors turn to the goods on either side of the stall; sweepers turn with the broom.
            if (npc.act === 'serve') npc.targetYaw += Math.sin((time - npc.actFrom) * 0.9 + npc.id) * 0.5;
            else if (npc.act === 'sweep') npc.targetYaw += Math.sin((time - npc.actFrom) * 1.3) * 0.35;
            if (npc.act === 'wave' && friendly) npc.targetYaw = Math.atan2(-dx, -dz);
            // Đá cầu: everyone keeps their eyes (and toes) on the shuttlecock.
            const sh = scene?.kind === 'ring' ? shuttleAt.get(scene.id) : undefined;
            if (sh && Math.hypot(sh.x - npc.x, sh.z - npc.z) > 0.3) npc.targetYaw = Math.atan2(sh.x - npc.x, sh.z - npc.z);
            // Hawkers, vé số sellers and xe ôm drivers turn to someone who might buy (the player walking close by).
            if ((npc.role === 'hawker' || npc.role === 'lottery' || npc.role === 'xeom') && d < 6 && !threat.inVehicle && npc.act !== 'nap') npc.targetYaw = Math.atan2(-dx, -dz);
          }
          if (npc.gang >= 0 && d < 9 && !threat.inVehicle) npc.targetYaw = Math.atan2(-dx, -dz);
        } else if (npc.act !== 'none' || npc.offX || npc.offZ) stopAct(npc, time);
        npc.yaw = angleLerp(npc.yaw, npc.targetYaw, 1 - Math.exp(-dt * 8));
        // The gait advances with the distance covered (a step is as long as the legs reach), so feet do not slide.
        const moving = npc.pose === 'walk' || npc.pose === 'run';
        npc.go = THREE.MathUtils.damp(npc.go, moving ? Math.min(1, npc.speed / 1.3) : 0, 8, dt);
        const run = moving ? clamp((npc.speed - 2) / 1.6, 0, 1) : 0, amp = (0.48 + 0.34 * run) * npc.go;
        const step = 2 * FIGURE.sole * BODY_SCALE * dress[i].style.height * Math.sin(Math.max(0.2, amp)) * (1 + 0.08 * run);
        npc.stride += (npc.speed * dt * Math.PI) / step;
        npc.swing = Math.sin(npc.stride) * amp;
        if (dress[i].gear === 'pole') {
          // Gánh baskets swing on their cords: they lag as the walk speeds up and bob with every step.
          const acc = clamp((npc.speed - npc.lastSpeed) / Math.max(dt, 1e-3), -4, 4), steps = Math.max(1, Math.ceil(dt * 30)), h = dt / steps;
          for (let s = 0; s < steps; s++) {
            const force = -(9.8 / 0.6) * npc.pendA - 2.5 * npc.pendV + acc * 0.5 + 1.6 * Math.sin(2 * npc.stride) * npc.go;
            npc.pendV += force * h;
            npc.pendA = clamp(npc.pendA + npc.pendV * h, -0.5, 0.5);
          }
        }
        npc.lastSpeed = npc.speed;
        npc.y = ground(npc.x, npc.z);
        animate(npc, time, dt, threat, d);

        // --- chatter near the player ---
        npc.chatterAt -= dt;
        if (npc.chatterAt <= 0) {
          const intent = mind.intent;
          const life = npc.current?.life;
          // Hawkers call their goods every few seconds as they go; xe ôm drivers and vé số sellers call out to passers-by.
          const crier = npc.role === 'hawker' || npc.role === 'lottery' || npc.role === 'xeom';
          npc.chatterAt = intent === 'watch' ? 6 + Math.random() * 8 : crier ? 8 + Math.random() * 6 : 14 + Math.random() * 22;
          const lifeLine = intent !== 'routine' || !life ? '' : lineFor(npc, life);
          if (lifeLine) {
            if (nearFocus(npc, crier ? 30 : 22) && lifeLines >= 1) { lifeLines--; say(npc, lifeLine, crier); }
          } else if (Math.hypot(npc.x - focusX, npc.z - focusZ) < 28 && npc.state !== 'afraid' && intent !== 'chat' && !(life && npc.state === 'at')) {
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
      // The shuttlecocks in flight (drawn a little large so they read at a distance), steam off the open phở pots and
      // smoke off freshly lit incense near the player.
      for (const [, at] of shuttleAt) if (props.near(at.x, at.z)) props.place(HELD.SHUTTLE, at.x, at.y, at.z, time * 7, Math.sin(time * 5) * 0.4, 0, 1.5);
      props.end();
      if (time >= steamAt) {
        steamAt = time + 0.7;
        for (const [g, st] of standOf) {
          if (!furniture.isOpen(g) || Math.abs(st.x - fx) + Math.abs(st.z - fz) > 45) continue;
          wisps.emit(st.x + Math.cos(st.yaw) * 0.24, groundHeight(st.x, st.z) + 1.0, st.z - Math.sin(st.yaw) * 0.24, time);
        }
        // The hột vịt lộn pot and the bánh mì cart's charcoal steam too.
        for (const s of sellers) {
          const goods = dress[s.id].goods;
          if ((goods !== 'hotvitlon' && goods !== 'banhmi') || !visible(s) || Math.abs(s.x - fx) + Math.abs(s.z - fz) > 35) continue;
          const f = goods === 'banhmi' ? 1.1 : -0.75;
          wisps.emit(s.x + Math.sin(s.yaw) * f, s.y + (goods === 'banhmi' ? 1.25 : 1.0), s.z + Math.cos(s.yaw) * f, time);
        }
        for (const [id, a] of incenseAt) {
          if (time > a.until) { incenseAt.delete(id); continue; }
          if (Math.abs(a.x - fx) + Math.abs(a.z - fz) < 40) wisps.emit(a.x + Math.sin(a.yaw) * 0.2, groundHeight(a.x, a.z) + 0.25, a.z + Math.cos(a.yaw) * 0.2, time, true);
        }
      }
      wisps.update(time);
      for (const batch of batches) batch.end();
      return events;
    },
    /** Level of detail of the crowd's figures: 'hi' at quality levels 0-2, 'lo' (mitten hands, coarser limbs) at 3-5. */
    setDetail(next: Detail) {
      if (next === detail) return;
      detail = next;
      bodies.setGeometry(figureGeometry('body', next));
      armsL.setGeometry(figureGeometry('armL', next));
      armsR.setGeometry(figureGeometry('armR', next));
      legs.setGeometry(figureGeometry('leg', next));
      // Coarse figures come with the faster presets: props then stay close to the player too.
      lowDetail = next === 'lo';
      props.setDetail(lowDetail ? 3 : 0);
      wisps.setEnabled(!lowDetail && enabled);
    },
    dispose() {
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      for (const m of Object.values(materials)) m.dispose();
      props.dispose();
      furniture.dispose();
      wisps.dispose();
    },
  };
}
