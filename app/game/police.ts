import * as THREE from 'three';
import { worldRoads } from './map/world-types';
import type { RoadEdge } from './map/roads';
import type { FallMode, HitKind, createRagdolls, RagdollBody, RagdollLook } from './ragdoll';
import type { Car, createVehicles } from './vehicles';
import {
  ARM, ARM_POSES, FIGURE, FigureBatch, HAND, chestMatrix, deriveStyle, figureGeometry, figureMaterial, gait, limbMatrix, mixArm, mixHand, newGait,
  palettesOf, setBits, setStyle, sideX, type ArmPose, type Detail,
} from './figures';

type Ragdolls = ReturnType<typeof createRagdolls>;
type Vehicles = ReturnType<typeof createVehicles>;
export type CopWeapon = 'baton' | 'taser' | 'pistol' | 'shotgun' | 'smg';
type Officer = {
  index: number;
  state: 'off' | 'seated' | 'chase' | 'return' | 'down';
  // Tactics: when a tackle started, progress pulling the player out of a vehicle, holding a cuffed player.
  lunge: number;
  pull: number;
  escort: boolean;
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
  // Animation only: where the head looks (relative to the chest), the last baton swing and the last shot.
  headYaw: number;
  swingAt: number;
  firedAt: number;
};
export type PoliceShot = { from: THREE.Vector3; hit: boolean; damage: number; kind: CopWeapon };
export type PlayerView = {
  x: number; z: number; car: Car | null; riding: boolean; heading: number; speed: number; down: boolean; stunned: boolean;
  armed: boolean; surrendered: boolean; pinned: boolean; night: number;
  altitude?: number;
};
export type GasThrow = { fromX: number; fromZ: number; x: number; z: number };
/** A spike strip across a road: its middle, the road's heading there, half its length (the asphalt's half width) and until when. */
type Spike = { x: number; z: number; hx: number; hz: number; half: number; until: number };

const OFFICERS = 16;
const MAX_SPIKES = 4;
const UP = new THREE.Vector3(0, 1, 0);
const LINES = {
  chase: ['Đứng lại!', 'Cảnh sát đây!', 'Giơ tay lên!', 'Không chạy được đâu!'],
  arrest: ['Anh bị bắt!', 'Đưa tay ra sau!'],
  surround: ['Bao vây nó!', 'Chặn bên kia!', 'Vòng ra sau!'],
  drop: ['Bỏ súng xuống!', 'Thả vũ khí ra!', 'Buông súng!'],
  surrendered: ['Đứng yên!', 'Quỳ xuống, tay sau đầu!'],
  gas: ['Ném hơi cay!', 'Hun nó ra!'],
  tackle: ['Bắt được rồi!', 'Nằm xuống!'],
  pull: ['Ra khỏi xe!', 'Xuống xe ngay!'],
  spikes: ['Rải đinh!', 'Chặn đường nó lại!'],
};
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
/** Officers are drawn a touch larger than the crowd (BODY_SCALE 0.82); their ragdolls use the same scale. */
const SCALE = 0.84;
const HIT_RADIUS = 0.4;
const HEIGHT = 1.8;
// Công an: olive shirt and trousers, an olive peaked cap (its red band is part of the cap).
const LOOK: RagdollLook = { shirt: '#5a6640', pants: '#3d4a2c', skin: '#d3a179', helmet: '#46532f' };
const SWAT_LOOK: RagdollLook = { shirt: '#1d2024', pants: '#16181b', skin: '#d3a179', helmet: '#101214' };
const SKINS = ['#d3a179', '#c58f69', '#e0b48e', '#b98260'];
const clamp = THREE.MathUtils.clamp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// Baton: carried raised and forward, lifted overhead and brought down on a strike.
const BATON_READY: ArmPose = [-0.75, 0.14, 0.15, -1.15, 0.25, 0.2, HAND.GRIP];
const BATON_UP: ArmPose = [-2.45, 0.3, 0.1, -1.35, 0.4, 0.35, HAND.GRIP];
const BATON_DOWN: ArmPose = [-0.85, -0.12, 0, -0.2, 0.3, -0.3, HAND.GRIP];
/** Arms thrown forward for a diving tackle. */
const DIVE: ArmPose = [-2.4, 0.15, 0, -0.1, 0, 0, HAND.OPEN];
const RUN_HAND = mixHand(HAND.RELAXED, HAND.FIST, 0.7);
const WEAPON_BIT: Record<CopWeapon, number> = { baton: ARM.BATON, taser: ARM.TASER, pistol: ARM.PISTOL, shotgun: ARM.RIFLE, smg: ARM.RIFLE };

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
 * SMGs; spike strips ahead of a fleeing vehicle and roadblocks at the junction it is heading for, both
 * found along the live road graph, and officers who spread out to surround the player and keep their distance when armed.
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
  // A fresh crime has to be phoned in and a car has to get there: no unit moves before `responseAt`.
  let responseAt = 0;
  let callPending = false;
  let reported = false;
  let playerX = 0, playerZ = 0;
  let spikeAt = 0;
  let blockAt = 0;
  const spikes: Spike[] = [];
  const officers: Officer[] = Array.from({ length: OFFICERS }, (_, index) => ({
    index, state: 'off', car: null, x: 0, z: 0, yaw: 0, stride: 0, health: 80, maxHealth: 80, hitAt: -99, nextShot: 0, burst: 0, arrest: 0,
    body: null, timer: 0, pace: 0, chatterAt: 0, weapon: 'baton', swat: false, lunge: -99, pull: 0, escort: false,
    headYaw: 0, swingAt: -99, firedAt: -99,
  }));

  // Officers are four articulated figure meshes (body, left arm, right arm, legs) shared by the whole force,
  // plus the spike strips.
  const materials = { body: figureMaterial('body'), arm: figureMaterial('arm'), leg: figureMaterial('leg') };
  let detail: Detail = 'hi';
  const bodies = new FigureBatch(figureGeometry('body', detail), materials.body, OFFICERS);
  const armsL = new FigureBatch(figureGeometry('armL', detail), materials.arm, OFFICERS);
  const armsR = new FigureBatch(figureGeometry('armR', detail), materials.arm, OFFICERS);
  const legs = new FigureBatch(figureGeometry('leg', detail), materials.leg, OFFICERS * 2);
  const batches = [bodies, armsL, armsR, legs];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const spikeMaterial = new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.4, metalness: 0.7 });
  const spikeMesh = new THREE.InstancedMesh(box, spikeMaterial, MAX_SPIKES * 2);
  const color = new THREE.Color();
  // Regular officers: peaked cap with a red band, short-sleeved uniform, duty belt and boots. SWAT: helmet,
  // vest, long sleeves and gloves. Each officer has his own skin tone, and his ragdoll dresses the same.
  const dress = officers.map((o) => {
    const skin = SKINS[(o.index * 5 + 1) % SKINS.length];
    const police: RagdollLook = { ...LOOK, skin }, swat: RagdollLook = { ...SWAT_LOOK, skin };
    const styles = { police: deriveStyle(police, o.index, 'police'), swat: deriveStyle(swat, o.index, 'swat') };
    setStyle(police, styles.police);
    setStyle(swat, styles.swat);
    return { looks: { police, swat }, styles, style: styles.police, palettes: palettesOf(styles.police), armed: new Float32Array(8), swat: false, weapon: 'baton' as CopWeapon };
  });
  function paint(o: Officer) {
    const d = dress[o.index];
    d.swat = o.swat;
    d.weapon = o.weapon;
    d.style = o.swat ? d.styles.swat : d.styles.police;
    d.palettes = palettesOf(d.style);
    // The weapon in the right hand (a baton, a taser, a pistol or a long gun), shown while it is in use.
    d.armed.set(d.palettes.armR);
    setBits(d.armed, 0, WEAPON_BIT[o.weapon], true);
  }
  officers.forEach(paint);
  for (let i = 0; i < MAX_SPIKES * 2; i++) spikeMesh.setColorAt(i, color.set(i % 2 ? '#e0b030' : '#8a9096'));
  spikeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spikeMesh.frustumCulled = false;
  if (spikeMesh.instanceColor) spikeMesh.instanceColor.needsUpdate = true;
  for (const mesh of [...batches.map((b) => b.mesh), spikeMesh]) scene.add(mesh);
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), chest = new THREE.Matrix4(), limbM = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const quat = new THREE.Quaternion(), pos = new THREE.Vector3(), size = new THREE.Vector3();
  const bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const walk = newGait();
  const bodyPose = [0, 0, 0, 0], limbPose = [0, 0, 0, 0];
  const mixL: number[] = [], mixR: number[] = [];
  let frameDt = 0;
  // An arm from the chest matrix: [swing, abduct, roll, elbow, twist, flex, hand], abduct and roll mirrored on the left.
  const arm = (side: 1 | -1, a: ArmPose, look: Float32Array, shoulderX: number, kick = 0) => {
    const sx = sideX(side);
    limbMatrix(chest, sx * shoulderX, FIGURE.shoulderY, a[0] + kick, sx * a[1], sx * a[2], limbM);
    limbPose[0] = a[3]; limbPose[1] = a[4]; limbPose[2] = a[5]; limbPose[3] = a[6];
    (side > 0 ? armsR : armsL).push(limbM, look, limbPose);
  };
  const leg = (side: 1 | -1, thigh: number, knee: number, ankle: number, toe: number, look: Float32Array) => {
    limbMatrix(base, sideX(side) * FIGURE.hipX, FIGURE.hipY, thigh, 0, 0, limbM);
    limbPose[0] = knee; limbPose[1] = ankle; limbPose[2] = toe; limbPose[3] = 0;
    legs.push(limbM, look, limbPose);
  };
  // An arm swinging with the stride; fists half closed at a run.
  const stride = (out: number[], swing: number, elbow: number, run: number): ArmPose => {
    out[0] = swing; out[1] = 0.1; out[2] = 0; out[3] = elbow; out[4] = 0.2; out[5] = 0; out[6] = mixHand(HAND.RELAXED, RUN_HAND, run);
    return out as unknown as ArmPose;
  };

  function draw(o: Officer) {
    if (o.state !== 'chase' && o.state !== 'return') return;
    if (dress[o.index].swat !== o.swat || dress[o.index].weapon !== o.weapon) paint(o);
    const d = dress[o.index], style = d.style, p = d.palettes;
    const sx = SCALE * style.width, sy = SCALE * style.height;
    const run = clamp((o.pace - 1.5) / 3.5, 0, 1), go = clamp(o.pace / 2, 0, 1);
    gait(o.stride, run, go, walk);
    const holding = o.escort;
    const lunge = o.state === 'chase' ? (lastTime - o.lunge) / 0.45 : 1;
    const diving = lunge >= 0 && lunge < 1;
    const aiming = o.state === 'chase' && o.weapon !== 'baton' && !holding && !diving;
    const longGun = aiming && o.weapon !== 'taser' && o.weapon !== 'pistol';
    const baton = o.state === 'chase' && o.weapon === 'baton' && !holding && !diving;
    // A diving tackle pitches the whole body forward, peaking halfway through the lunge.
    const dive = diving ? Math.sin(Math.PI * lunge) : 0;
    // Officers lean into a run.
    base.compose(pos.set(o.x, world.ground(o.x, o.z) + walk.bob * sy, o.z), quat.setFromEuler(bodyEuler.set(Math.min(0.2, o.pace * 0.03) + dive * 0.65, o.yaw, 0)), size.set(sx, sy, sx));
    // Aimers square up behind the sights; runners counter-twist with the stride.
    const twist = aiming ? -0.08 : holding ? 0 : walk.chest;
    // The head turns toward the player (forward when heading back to the car), pitched down onto a cuffed one.
    const toward = o.state === 'chase' ? clamp(wrap(Math.atan2(playerX - o.x, playerZ - o.z) - o.yaw) - twist, -1.1, 1.1) : 0;
    o.headYaw = THREE.MathUtils.damp(o.headYaw, toward, 6, frameDt);
    // A diver keeps his eyes on the target.
    bodyPose[0] = o.headYaw; bodyPose[1] = holding ? 0.28 : diving ? -0.7 * dive : aiming ? 0.04 : 0.02; bodyPose[2] = twist; bodyPose[3] = 0;
    bodies.push(base, p.body, bodyPose);
    chestMatrix(base, twist, chest);
    // Legs: the stride, a staggered stance when standing to aim, or a push-off and a reaching front leg in a dive.
    const still = aiming ? 1 - go : 0;
    if (diving) {
      leg(-1, walk.thighL + (0.45 - walk.thighL) * dive, walk.kneeL + (0.12 - walk.kneeL) * dive, walk.ankleL + (0.45 - walk.ankleL) * dive, 0, p.legs);
      leg(1, walk.thighR + (-0.6 - walk.thighR) * dive, walk.kneeR + (0.85 - walk.kneeR) * dive, walk.ankleR, 0, p.legs);
    } else {
      leg(-1, walk.thighL - 0.22 * still, walk.kneeL + 0.12 * still, walk.ankleL, walk.toeL, p.legs);
      leg(1, walk.thighR + 0.16 * still, walk.kneeR + 0.08 * still, walk.ankleR, walk.toeR, p.legs);
    }
    const left = stride(mixL, walk.armL, walk.elbowL, run), right = stride(mixR, walk.armR, walk.elbowR, run);
    const sh = style.shoulderX;
    if (holding) {
      // Holding a cuffed player by the arms.
      arm(-1, ARM_POSES.ESCORT, p.armL, sh);
      arm(1, ARM_POSES.ESCORT, p.armR, sh);
    } else if (diving) {
      const t = Math.min(1, lunge * 4);
      arm(-1, mixArm(left, DIVE, t, mixL), p.armL, sh);
      arm(1, mixArm(right, DIVE, t, mixR), p.armR, sh);
    } else if (aiming) {
      // Two hands on a pistol or taser at shoulder height, or a long gun shouldered; each shot kicks the muzzle up.
      const kick = -0.12 * Math.max(0, 1 - (lastTime - o.firedAt) / 0.14);
      arm(-1, longGun ? ARM_POSES.RIFLE_SUPPORT : ARM_POSES.AIM_SUPPORT, p.armL, sh, kick);
      arm(1, longGun ? ARM_POSES.RIFLE : ARM_POSES.AIM, d.armed, sh, kick);
    } else if (baton) {
      // Baton raised and ready; a strike lifts it overhead and brings it down, then it comes back up.
      const t = lastTime - o.swingAt;
      const pose = t < 0.08 ? mixArm(BATON_READY, BATON_UP, t / 0.08, mixR)
        : t < 0.26 ? mixArm(BATON_UP, BATON_DOWN, (t - 0.08) / 0.18, mixR)
          : t < 0.65 ? mixArm(BATON_DOWN, BATON_READY, (t - 0.26) / 0.39, mixR)
            : mixArm(BATON_READY, right, 0.15 * run, mixR);
      arm(-1, left, p.armL, sh);
      arm(1, pose, d.armed, sh);
    } else {
      arm(-1, left, p.armL, sh);
      arm(1, right, p.armR, sh);
    }
  }

  function crewOf(car: Car) { return officers.filter((o) => o.car === car && o.state !== 'off'); }

  function knock(o: Officer, vx: number, vy: number, vz: number, time: number, hit?: { x: number; y: number; z: number } | null, mode?: FallMode, kind?: HitKind) {
    o.state = 'down';
    o.timer = time + 9;
    // The ragdoll has the standing officer's scale and build (its style is remembered for the look); the blow
    // lands where it hit, and a killed officer falls limp.
    const d = dress[o.index];
    o.body = ragdolls.spawn({ x: o.x, y: world.ground(o.x, o.z), z: o.z, yaw: o.yaw, scale: SCALE, look: o.swat ? d.looks.swat : d.looks.police, velocity: { x: vx, y: vy, z: vz }, hit, mode, kind });
    return o.body;
  }

  // Off in zombie mode: there is no police left to call.
  let enabled = true;
  function crime(severity: number, time: number) {
    if (!enabled) return;
    const fresh = wanted === 0;
    heat += severity;
    wanted = Math.min(5, Math.max(wanted, 1, 1 + Math.floor(heat / 4)));
    if (fresh) {
      // Officers already nearby act at once; otherwise a witness calls it in (worse crimes get a faster
      // response) and the first cars arrive after that.
      const onScene = officers.some((o) => (o.state === 'chase' || o.state === 'return') && Math.hypot(o.x - playerX, o.z - playerZ) < 35)
        || vehicles.live.some((c) => c.kind === 'police' && c.mode !== 'off' && Math.hypot(c.x - playerX, c.z - playerZ) < 45);
      const delay = onScene ? 0 : Math.max(5, 14 - severity * 2.5) + Math.random() * 4;
      responseAt = time + delay;
      callPending = delay > 0;
      reported = reported || callPending;
    }
    // Losing them only counts from when they get there.
    lastSeen = Math.max(time, responseAt);
  }

  function standDown() {
    wanted = 0;
    heat = 0;
    responseAt = 0;
    callPending = false;
    for (const o of officers) if (o.state === 'chase') o.state = 'return';
  }
  let lastTime = 0;
  let gasAt = 0;

  // A police helicopter joins from four stars: it circles the player, keeps them in sight and at
  // night lights them with a spotlight; at five stars a marksman fires from it.
  const heli = new THREE.Group();
  const heliPaint = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.5, metalness: 0.2 });
  const heliDark = new THREE.MeshStandardMaterial({ color: '#1f3f78', roughness: 0.5 });
  const heliGlass = new THREE.MeshStandardMaterial({ color: '#203038', roughness: 0.1, metalness: 0.5 });
  const heliParts: THREE.Mesh[] = [];
  const part = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    heli.add(mesh);
    heliParts.push(mesh);
    return mesh;
  };
  part(new THREE.SphereGeometry(1.3, 12, 8), heliPaint, 0, 0, 0.2).scale.set(1, 0.85, 1.5);
  part(new THREE.SphereGeometry(0.9, 10, 6), heliGlass, 0, 0.2, 1.3).scale.set(1, 0.8, 0.9);
  part(new THREE.BoxGeometry(2.62, 0.35, 2.4), heliDark, 0, -0.45, 0.2);
  part(new THREE.BoxGeometry(0.35, 0.35, 4.2), heliPaint, 0, 0.3, -3.2);
  part(new THREE.BoxGeometry(0.1, 1.0, 0.6), heliDark, 0, 0.75, -5.2);
  for (const x of [-0.9, 0.9]) part(new THREE.BoxGeometry(0.1, 0.1, 3.0), heliDark, x, -1.35, 0.2);
  const rotor = part(new THREE.BoxGeometry(9, 0.06, 0.35), heliDark, 0, 1.25, 0.2);
  const rotorCross = part(new THREE.BoxGeometry(0.35, 0.06, 9), heliDark, 0, 1.25, 0.2);
  const tailRotor = part(new THREE.BoxGeometry(0.06, 1.6, 0.2), heliDark, 0.22, 0.8, -5.2);
  const spotMaterial = new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const spotGeometry = new THREE.ConeGeometry(4.5, 1, 20, 1, true).translate(0, -0.5, 0);
  const spot = new THREE.Mesh(spotGeometry, spotMaterial);
  spot.frustumCulled = false;
  scene.add(spot);
  heli.visible = false;
  spot.visible = false;
  scene.add(heli);
  let heliAngle = 0;
  let heliShotAt = 0;
  const heliPos = new THREE.Vector3(0, 40, 0);
  const heliTarget = new THREE.Vector3();
  const spotDir = new THREE.Vector3();
  const downAxis = new THREE.Vector3(0, -1, 0);

  /** An officer takes hold of the player from behind for the arrest. */
  function restrain(x: number, z: number, yaw: number) {
    let best: Officer | null = null, bestD = 8;
    for (const o of officers) {
      if (o.state !== 'chase') continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) best = officers.find((o) => o.state === 'off') ?? null;
    if (!best) return;
    // Behind the kneeling player and a little to their right (-x of their facing), clear of their feet.
    Object.assign(best, { state: 'chase', escort: true, x: x - Math.sin(yaw) * 0.85 - Math.cos(yaw) * 0.25, z: z - Math.cos(yaw) * 0.85 + Math.sin(yaw) * 0.25, yaw, pace: 0 });
    if (!best.car) best.maxHealth = best.health = 80;
    say(`cop${best.index}`, pick(LINES.arrest), () => (best.state === 'chase' ? { x: best.x, y: 2.1, z: best.z } : null));
  }

  /** Everything vanishes at once, used after an arrest or when the player is downed and respawns. */
  function reset() {
    standDown();
    for (const o of officers) {
      if (o.body) ragdolls.remove(o.body);
      Object.assign(o, { state: 'off', car: null, body: null, arrest: 0, escort: false, pull: 0 });
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
    Object.assign(o, { state: 'seated', car, health: maxHealth, maxHealth, arrest: 0, body: null, hitAt: -99, weapon, swat, burst: 0, lunge: -99, pull: 0, escort: false, headYaw: 0, swingAt: -99, firedAt: -99 });
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

  /** The road the player is driving along, if any: its edge, where on it, the travel direction (+1 from node a to b). */
  function roadOf(player: PlayerView) {
    const roads = worldRoads().roads;
    const h = roads.nearestEdge(player.x, player.z, 14, (e) => e.traffic && e.cls !== 'hem');
    if (!h || h.d > h.edge.half + 2) return null;
    const dir: 1 | -1 = Math.sin(player.heading) * h.hx + Math.cos(player.heading) * h.hz >= 0 ? 1 : -1;
    return { edge: h.edge, s: h.s, dir };
  }
  /**
   * Walks `ahead` metres along the roads from arc s of an edge in a direction, straight on through the nodes (the arm
   * most nearly ahead that carries traffic). Calls `node` at each node passed (with the distance so far and the edge
   * it arrives on); stops early when that returns true. Returns where it ends, or null at a dead end.
   */
  function walkAhead(edge: RoadEdge, s: number, dir: 1 | -1, ahead: number, node?: (id: number, at: number, from: RoadEdge, fromDir: 1 | -1) => boolean) {
    const roads = worldRoads().roads;
    let e = edge, d = dir, at = s, left = ahead, gone = 0;
    for (let hops = 0; hops < 12; hops++) {
      const room = d > 0 ? e.len - at : at;
      if (room >= left) {
        const p = roads.pointAt(e, at + d * left);
        return { edge: e, s: at + d * left, dir: d, x: p.x, z: p.z, hx: p.hx * d, hz: p.hz * d };
      }
      left -= room; gone += room;
      const n = roads.nodes[d > 0 ? e.b : e.a];
      if (node?.(n.id, gone, e, d)) return null;
      // Straight on: the traffic arm nearest the heading of arrival.
      const p = roads.pointAt(e, d > 0 ? e.len : 0), hx = p.hx * d, hz = p.hz * d;
      let best: { e: RoadEdge; d: 1 | -1; dot: number } | null = null;
      for (const arm of n.arms) {
        const next = roads.edges[arm.edge];
        if (next === e || !next.traffic || next.cls === 'hem') continue;
        const dot = arm.hx * hx + arm.hz * hz;
        if (!best || dot > best.dot) best = { e: next, d: arm.end === 0 ? 1 : -1, dot };
      }
      if (!best || best.dot < 0.3) return null;
      e = best.e; d = best.d; at = d > 0 ? 0 : e.len;
    }
    return null;
  }

  /** Lays a spike strip across the player's road some way ahead (never inside a junction). */
  function deploySpikes(player: PlayerView, time: number) {
    const lane = roadOf(player);
    if (!lane) return false;
    const roads = worldRoads().roads;
    for (let attempt = 0; attempt < 4; attempt++) {
      const at = walkAhead(lane.edge, lane.s, lane.dir, 40 + Math.random() * 20);
      if (!at) return false;
      if (roads.junctionAt(at.x, at.z, 2)) continue;
      if (spikes.length >= MAX_SPIKES) spikes.shift();
      spikes.push({ x: at.x, z: at.z, hx: at.hx, hz: at.hz, half: at.edge.half, until: time + 45 });
      return true;
    }
    return false;
  }

  /** Cruisers parked across the road short of the next junction ahead (35–95 m off), crews out. */
  function roadblock(player: PlayerView) {
    const lane = roadOf(player);
    if (!lane) return false;
    const roads = worldRoads().roads;
    let found: { node: number; from: RoadEdge; dir: 1 | -1 } | null = null;
    walkAhead(lane.edge, lane.s, lane.dir, 95, (id, at, from, dir) => {
      const n = roads.nodes[id];
      if (at >= 35 && n.arms.length >= 3) { found = { node: id, from, dir }; return true; }
      return false;
    });
    if (!found) return false;
    const { node, from, dir } = found as { node: number; from: RoadEdge; dir: 1 | -1 };
    const n = roads.nodes[node], arm = n.arms.find((a) => a.edge === from.id && a.end === (dir > 0 ? 1 : 0));
    // Six metres short of the stop line, across every lane of the way in (a third car on a boulevard).
    const back = (arm?.setback ?? from.half) + 6, s = dir > 0 ? from.len - back : back;
    if (s < 0 || s > from.len) return false;
    const p = roads.pointAt(from, s), hx = p.hx * dir, hz = p.hz * dir, yaw = Math.atan2(hx, hz) + Math.PI / 2;
    const sides = from.half > 8 ? [-0.62, 0, 0.62] : [-0.46, 0.46];
    let placed = 0;
    for (const k of sides) {
      const off = k * from.half;
      const car = vehicles.placePolice(p.x - hz * off, p.z + hx * off, yaw + (Math.random() - 0.5) * 0.5);
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
    /** Seconds until the first police arrive after a crime is reported (0 once they are on their way in). */
    responseIn(time: number) { return wanted > 0 && callPending ? Math.max(0, responseAt - time) : 0; },
    crime,
    reset,
    setEnabled(on: boolean) { enabled = on; if (!on) reset(); },
    restrain,
    /** Officers on foot (read-only outside: for debugging and automated checks). */
    officers: officers as readonly Officer[],
    /** Figure level of detail: 'hi' at quality levels 0-2, 'lo' at 3-5. */
    setDetail(next: Detail) {
      if (next === detail) return;
      detail = next;
      bodies.setGeometry(figureGeometry('body', detail));
      armsL.setGeometry(figureGeometry('armL', detail));
      armsR.setGeometry(figureGeometry('armR', detail));
      legs.setGeometry(figureGeometry('leg', detail));
    },
    /** True when (x, z) is on a spike strip; the strip is used up. */
    onSpikes(x: number, z: number) {
      for (let i = 0; i < spikes.length; i++) {
        const s = spikes[i], dx = x - s.x, dz = z - s.z;
        const inside = Math.abs(dx * s.hx + dz * s.hz) < 0.8 && Math.abs(dx * -s.hz + dz * s.hx) < s.half + 0.2;
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
    /**
     * Applies damage; officers drop as ragdolls at zero health (limp when killed, bracing when knocked over).
     * `at` is the world point that was hit, if known. Attacking police is always a crime.
     */
    damage(o: Officer, amount: number, vx: number, vy: number, vz: number, time: number, force = false, at?: { x: number; y: number; z: number } | null, kind?: HitKind) {
      o.health -= o.swat ? amount * 0.7 : amount;
      o.hitAt = time;
      crime(3, time);
      if (o.health <= 0 || force) { knock(o, vx, vy, vz, time, at, o.health <= 0 ? 'limp' : undefined, kind); return true; }
      return false;
    },
    forEachUnit(callback: (x: number, z: number, onFoot: boolean) => void) {
      for (const o of officers) if (o.state === 'chase' || o.state === 'return') callback(o.x, o.z, true);
      for (const car of vehicles.live) if (car.kind === 'police' && (car.mode === 'chase' || car.mode === 'hold')) callback(car.x, car.z, false);
    },
    forEachHurt(time: number, callback: (x: number, y: number, z: number, fraction: number) => void) {
      for (const o of officers) if ((o.state === 'chase' || o.state === 'return') && time - o.hitAt < 4) callback(o.x, HEIGHT + 0.35, o.z, Math.max(0, o.health) / o.maxHealth);
    },
    update(dt: number, time: number, player: PlayerView) {
      lastTime = time;
      frameDt = dt;
      playerX = player.x;
      playerZ = player.z;
      const called = reported;
      reported = false;
      let arrived = false;
      if (callPending && time >= responseAt) { callPending = false; arrived = true; }
      let tackled = false;
      let pulledOut = false;
      const gas: GasThrow[] = [];
      const shots: PoliceShot[] = [];
      let strikes = 0;
      let arrested = false;
      let spiked = false;
      let blocked = false;
      const inVehicle = player.riding;
      // Dispatch more cruisers as the wanted level climbs.
      if (wanted > 0 && time > dispatchAt && time >= responseAt) {
        dispatchAt = time + 1.5;
        let active = 0;
        for (const c of vehicles.live) if (c.kind === 'police' && (c.mode === 'chase' || c.mode === 'hold')) active++;
        // More cruisers, bigger crews and closer spawns as the stars climb; the first answer to a call
        // comes from further off, so the cars are seen driving in with sirens.
        if (active < [0, 1, 2, 3, 4, 6][wanted]) {
          const car = active === 0 ? vehicles.spawnPolice(player.x, player.z, 60, 110) : vehicles.spawnPolice(player.x, player.z, 50 - wanted * 4, 90);
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
      vehicles.updatePolice(dt, time, player.x, player.z, player.car, wanted, player.heading);
      let seen = false;
      for (const car of vehicles.live) {
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
      for (const batch of batches) batch.begin();
      for (const o of officers) {
        if (o.state === 'down') {
          if (time > o.timer || !o.body || o.body.removed) {
            if (o.body) ragdolls.remove(o.body);
            Object.assign(o, { state: 'off', body: null, car: null });
          }
        } else if (o.state === 'chase' && o.escort) {
          // Holding a cuffed player: stay put behind them.
          o.pace = 0;
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
            const helpless = player.stunned || player.surrendered || player.pinned || (!inVehicle && player.speed < 0.6 && wanted <= 2);
            const keep = !gun || helpless ? 0 : o.weapon === 'taser' ? 5 : o.weapon === 'shotgun' ? 7 : 11;
            const slot = chasers.indexOf(o) / Math.max(1, chasers.length) * Math.PI * 2 + player.heading;
            let tx = keep ? leadX + Math.sin(slot) * keep : player.x, tz = keep ? leadZ + Math.cos(slot) * keep : player.z;
            // Facing an armed player, gunmen take cover behind their own cruiser (cars stop bullets).
            const cover = o.car && gun && player.armed && !helpless && Math.hypot(o.car.x - player.x, o.car.z - player.z) < 30 ? o.car : null;
            if (cover) {
              const cx = cover.x - player.x, cz = cover.z - player.z, cd = Math.hypot(cx, cz) || 1;
              tx = cover.x + cx / cd * 2.4 + Math.cos(slot) * 0.8;
              tz = cover.z + cz / cd * 2.4 - Math.sin(slot) * 0.8;
            }
            // A runner on foot gets tackled by whoever is close and not holding a long gun.
            const withinReach = (player.altitude ?? 0) < 1.3;
            const lunging = withinReach && time - o.lunge < 0.45;
            if (withinReach && !inVehicle && !player.down && !player.surrendered && player.speed > 3.5 && d > 1 && d < 3.4 && time - o.lunge > 4 && (o.weapon === 'baton' || o.weapon === 'taser' || o.weapon === 'pistol')) {
              o.lunge = time;
            }
            if (lunging) {
              step(o, player.x, player.z, 9.5, dt);
              if (d < 0.95 && !player.down) { tackled = true; o.lunge = time - 0.45; say(`cop${o.index}`, pick(LINES.tackle), () => (o.state === 'chase' ? { x: o.x, y: 2.1, z: o.z } : null)); }
            } else step(o, tx, tz, 5 + wanted * 0.35 + (o.swat ? 0.3 : 0), dt, { x: player.x, z: player.z });
            // A stopped vehicle: someone opens the door and drags the driver out.
            if (inVehicle && !player.down && player.speed < 1.5 && d < 2.6) {
              o.pull += dt;
              if (o.pull > 0.9) { pulledOut = true; o.pull = 0; say(`cop${o.index}`, pick(LINES.pull), () => (o.state === 'chase' ? { x: o.x, y: 2.1, z: o.z } : null)); }
            } else o.pull = Math.max(0, o.pull - dt);
            // From three stars a gunman lobs tear gas at a player standing their ground.
            if (wanted >= 3 && gun && !player.down && !player.surrendered && d > 6 && d < 22 && time > gasAt && world.sight(o.x, o.z, player.x, player.z) && (!inVehicle || player.speed < 3)) {
              gasAt = time + 11 - wanted;
              gas.push({ fromX: o.x, fromZ: o.z, x: player.x + (Math.random() - 0.5) * 2, z: player.z + (Math.random() - 0.5) * 2 });
              say(`cop${o.index}`, pick(LINES.gas), () => (o.state === 'chase' ? { x: o.x, y: 2.1, z: o.z } : null));
            }
            o.chatterAt -= dt;
            if (o.chatterAt <= 0 && d < 25) {
              o.chatterAt = 5 + Math.random() * 6;
              const lines = player.surrendered ? LINES.surrendered : d < 3 ? LINES.arrest : player.armed && d < 18 ? LINES.drop : chasers.length > 2 && Math.random() < 0.4 ? LINES.surround : LINES.chase;
              say(`cop${o.index}`, pick(lines), () => (o.state === 'chase' ? { x: o.x, y: 2.1, z: o.z } : null));
            }
            const reach = inVehicle ? 2.0 : 1.05;
            // Officers have to be right next to the player; a pinned, stunned or surrendering player is cuffed quickly.
            const canCuff = withinReach && (!player.down || player.pinned) && d < reach && (!inVehicle || player.speed < 1.5);
            o.arrest = canCuff ? o.arrest + dt * (player.stunned || player.pinned || player.surrendered ? 2.5 : 1) : Math.max(0, o.arrest - dt);
            if (o.arrest > 1.3) arrested = true;
            // Up close they swing a baton, which also stops the player from simply walking off.
            if (withinReach && !player.down && !player.surrendered && !inVehicle && d < 1.3 && time > o.nextShot && (o.weapon === 'baton' || Math.random() < 0.4)) {
              o.nextShot = time + 1.1 + Math.random() * 0.5;
              o.swingAt = time;
              strikes++;
            }
            if (gun && !player.down && !player.surrendered && d < gun.range && d > 1.6 && time > o.nextShot && world.sight(o.x, o.z, player.x, player.z)) {
              // SMGs fire short bursts; everything else single shots.
              if (o.weapon === 'smg' && o.burst < 2) { o.burst++; o.nextShot = time + 0.11; }
              else { o.burst = 0; o.nextShot = time + gun.cooldown * (1 - wanted * 0.06) + Math.random() * 0.6; }
              const moving = inVehicle && player.speed > 8 ? 0.5 : 1;
              const near = o.weapon === 'shotgun' ? Math.max(0.3, 1 - d / gun.range) : 1;
              o.firedAt = time;
              shots.push({ from: new THREE.Vector3(o.x + Math.sin(o.yaw) * 0.6, world.ground(o.x, o.z) + 1.35, o.z + Math.cos(o.yaw) * 0.6), hit: Math.random() < (gun.chance + wanted * 0.03) * moving, damage: gun.damage * near, kind: o.weapon });
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
          // Across the road (local x), thin along it (local z).
          local.compose(pos.set(s.x, y, s.z), quat.setFromAxisAngle(UP, Math.atan2(s.hx, s.hz)), size.set(s.half * 2, k ? 0.05 : 0.12, k ? 0.12 : 0.6));
          spikeMesh.setMatrixAt(i * 2 + k, local);
        }
      }
      for (const batch of batches) batch.end();
      spikeMesh.instanceMatrix.needsUpdate = true;
      // Helicopter.
      const flying = wanted >= 4 && !player.down;
      if (flying && !heli.visible) { heli.visible = true; heliPos.set(player.x + 60, 40, player.z + 60); }
      if (heli.visible) {
        heliAngle += dt * 0.3;
        if (flying) heliTarget.set(player.x + Math.cos(heliAngle) * 16, 26, player.z + Math.sin(heliAngle) * 16);
        else heliTarget.set(heliPos.x + 40, 60, heliPos.z + 40);
        // Limited speed: a fast bike can outrun it.
        const step = heliTarget.clone().sub(heliPos);
        const length = step.length();
        if (length > 0.01) heliPos.addScaledVector(step, Math.min(1, 15 * dt / length));
        heli.position.copy(heliPos);
        heli.rotation.y = Math.atan2(player.x - heliPos.x, player.z - heliPos.z);
        heli.rotation.z = Math.sin(time * 0.7) * 0.05;
        rotor.rotation.y += dt * 30;
        rotorCross.rotation.y = rotor.rotation.y;
        tailRotor.rotation.x += dt * 40;
        const horizontal = Math.hypot(heliPos.x - player.x, heliPos.z - player.z);
        if (flying && horizontal < 45) seen = true;
        // Spotlight cone from the helicopter to the player at night.
        spot.visible = flying && player.night > 0.2;
        if (spot.visible) {
          spotDir.set(player.x - heliPos.x, -heliPos.y, player.z - heliPos.z);
          const reach = spotDir.length();
          spot.position.copy(heliPos);
          spot.quaternion.setFromUnitVectors(downAxis, spotDir.normalize());
          spot.scale.set(1, reach, 1);
          spotMaterial.opacity = 0.16 * player.night;
        }
        if (wanted >= 5 && flying && horizontal < 40 && time > heliShotAt) {
          heliShotAt = time + 2.2 + Math.random();
          shots.push({ from: heliPos.clone().setY(heliPos.y - 1.2), hit: Math.random() < 0.18, damage: 9, kind: 'smg' });
        }
        if (!flying && heliPos.y > 55) { heli.visible = false; spot.visible = false; }
      }
      if (spiked) say('spikes', pick(LINES.spikes), () => null);
      // Lose the police by staying out of sight long enough.
      if (seen) lastSeen = time;
      if (wanted > 0 && !callPending && time - lastSeen > 6 + 3 * wanted) standDown();
      return { shots, strikes, arrested, evading: wanted > 0 && !seen && !callPending, spiked, blocked, tackled, pulledOut, gas, called, arrived };
    },
    dispose() {
      scene.remove(heli, spot);
      for (const mesh of heliParts) mesh.geometry.dispose();
      heliPaint.dispose(); heliDark.dispose(); heliGlass.dispose(); spotMaterial.dispose(); spotGeometry.dispose();
      for (const batch of batches) { scene.remove(batch.mesh); batch.dispose(); }
      scene.remove(spikeMesh);
      spikeMesh.dispose();
      for (const m of Object.values(materials)) m.dispose();
      spikeMaterial.dispose();
      box.dispose();
    },
  };
}
