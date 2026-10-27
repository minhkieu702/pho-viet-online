import * as THREE from 'three';
import { buildWorld, dockAt, groundHeight, onSidewalk } from './world';
import { LANDMARKS, LIFE, PLOTS, SCENERY, WATER_LEVEL, inRect, type Dock } from './city';
import { LIFE_LINES } from './street-life';
import { BASE, OWN_VEHICLE, createRegistry, noticeEntry, type Ctx, type Entry, type Focus, type MenuItem, type MenuView, type PromptView } from './interact';
import { ATM_SPOTS, COUNTERS, FORTUNES, PLACES, VENDING_SPOTS, counterAt, hourLabel, hoursLabel, isOpen, lunarDay, opensAt, type CounterDef, type Hours, type Place } from './counters';
import {
  DRAW_HOUR, HAGGLE_OFF, MAX_TICKETS, applyEffect, drawDay, drawNumber, footSpeed, haggle, prizeFor, regenRate, ticketNumber,
  type BuffId, type EffectHost, type Ticket,
} from './services';
import { SECONDS_PER_HOUR } from './clock';
import { SWIM_DEPTH, TERRAIN, bankNear, bounds, climbNear, deep as deepWater, hullAt, inBounds, inPlay, inWater, navigable, openEdge, pierNear, walkable, waterLevel, wetAt } from './map/terrain';
import { createBoats, makeBoatMesh, type Boat } from './boats';
import { createBuses } from './buses';
import { LOTS, SPOTS } from './parking';
import { worldBuilding, worldPlot } from './district-life';
import { registerStreets } from './map/districts';
import { districtStreets } from './map/mapdata';
import { createNav } from './nav';
import { createCollisionIndex, OWNER } from './map/collision';
import { DISTRICT_PLOTS, DISTRICT_STAMPS, WORLD_BUILDINGS, WORLD_PLOTS, isWired } from './map/world-map';
import { QUAN_1_SOUTH_EXTRA } from './map/layout/quan-1-south';
import { createRagdolls, type BodyPart, type HitKind, type RagdollBody, type RagdollLook } from './ragdoll';
import { createNpcs, GANGS, type Npc } from './npcs';
import { createEffects, makeGun } from './effects';
import { createExplosives, type Explosion } from './explosives';
import { createPickups } from './pickups';
import { createBubbles } from './bubbles';
import { createAtmosphere, type Weather } from './atmosphere';
import { createAnimals } from './animals';
import { createSideMissions, type SideMissionView } from './side-missions';
import { playBoom, playCrash, playHorn, playShot, playThud, setRain, unlockAudio } from './audio';
import { nodeLight } from './signals';
import { worldRoads } from './map/world-types';
import { WEAPONS, weaponById, type WeaponId } from './weapons';
import { MISSION_DEFS, createMissions, type MissionEvent, type MissionId, type MissionView } from './missions';
import { createPeerInterpolator, createSnapshotClock } from './peer-interpolation';
import { createPowerState, HEROES, POWER_RANGE, POWER_HEIGHT_BOUNDS, SHIELD_DURATION, clipPowerTarget, distanceToPowerSegment, resolvePowerTarget, shieldPosition, type HeroId, type HeroPower, type PowerHud, type PowerPoint } from './powers';
import { createHeroLook, createPowerEffects } from './power-effects';
import { createCameraMode, firstPersonAllowed, firstPersonPose, type CameraMode, type EyeKind } from './camera-mode';
import type { PlayerState, PeerState, OutgoingHit, IncomingHit } from '../../lib/multiplayer-protocol';
import { BIKES, CAR_STATS, MOTO_STATS, POLICE_CAR_STATS, bikeById, repairCost, type BikeId } from './bikes';
import { createVehicles, makeCarMesh, seatOf, vehicleLabel, vehicleStyle, CAR_HEALTH, MASS, MOTO_HEALTH, POLICE_CAR_HEALTH, type Body, type Car, type Crash } from './vehicles';
import { MOTO_RIDER, motoParts, vehicleMaterial, type MotoStyle } from './vehicle-models';
import {
  ARM_POSES, BODY_SCALE, CAR_DRIVER, FIGURE, HAND, HAND_SOCKET, HEAD, TORSO, armFK, createHeroFigure, deriveStyle, gait, handCode, mixHand, newGait,
  releaseView, setBits, setStyle, sideX, socket, styleOf, twoBoneIK, type FigureLook, type HeroFigure, type WardrobeRole,
} from './figures';
import { createPolice } from './police';
import { createZombies, type Zombie } from './zombies';
import { createInteriors, type InteriorKind, type RoomAct } from './interiors';
import { VENUE_SERVICES, serviceOf, type VenueRoom } from './venues';
import { createSky, HORIZON } from './sky';
import { MODE_LEVEL, QUALITY_LEVELS, createFrameMonitor, detectStartLevel, gpuName, isIntegratedGpu, isSoftwareGpu, type QualityMode } from './quality';

export type VehicleKind = 'foot' | 'scooter' | 'car' | 'police' | 'boat' | 'swim';
export type { PlayerState, PeerState, OutgoingHit, IncomingHit } from '../../lib/multiplayer-protocol';
export type Hud = {
  speed: number; riding: boolean; score: number; mission: string; missionStep: number; missionInfo: MissionView; hint: string; x: number; z: number;
  cash: number; deliveries: number; weapon: WeaponId; owned: WeaponId[]; down: boolean; fps: number; quality: string; qualityMode: QualityMode;
  gpu: string; softwareGpu: boolean;
  health: number; wanted: number; banner: string; vehicle: VehicleKind; vehicleHealth: number;
  /** What the vehicle being driven is ("Xe số màu kem", "Taxi"), when it is not the player's own bike. */
  vehicleName: string;
  bike: BikeId; bikeHealth: number; bikeBroken: boolean; bikeX: number; bikeZ: number;
  targetX: number; targetZ: number; targetName: string; police: { x: number; z: number }[];
  powers: PowerHud; cameraMode: CameraMode;
  clock: string; ammo: { mag: number; reserve: number; reloading: boolean } | null; side: SideMissionView; offers: { x: number; z: number }[];
  gangs: { name: string; anger: number; x: number; z: number }[]; hospital: { x: number; z: number }; policeStation: { x: number; z: number };
  healCost: number; respawnIn: number; arsenal: { id: WeaponId; mag: number; reserve: number }[]; stunned: boolean; flatTires: boolean;
  surrendered: boolean; gassed: boolean;
  /** Seconds until the police arrive after a crime was reported (0 when they are here or not coming). */
  policeIn: number;
  /** Zombie mode: wave, zombies left in it, kills, seconds of rest left, best wave reached. */
  zombie: { wave: number; left: number; kills: number; breakLeft: number; best: number; dots: { x: number; z: number }[] } | null;
  /** What E does right here (interact.ts focus, a hold in progress, getting up, getting off), or null. */
  prompt: PromptView | null;
  /** Minimap pins: own bike and last car, the impound, bus stops, ATMs, piers. */
  pins: MapPin[];
  /** Riding as a passenger (bus, waterbus, xe ôm, xích lô). */
  ride: RideView | null;
  /** Sitting on a bench or a stool; savings in the bank; lottery tickets held. */
  seated: boolean; bank: number; tickets: number;
};
export type MapPin = { kind: 'bike' | 'car' | 'impound' | 'bus' | 'atm' | 'ferry'; x: number; z: number };
export type RideView = { title: string; next: string; hint: string; stops: { name: string; eta: number }[] };
/**
 * Someone carrying the player as a passenger (transit owner, xe ôm): where the player sits this frame (`y`: the
 * seat surface), what to call the ride, and what E (or F) does: usually ring for the next stop, then call
 * leavePassenger() there. `pose`: on a chair (default), pillion on a motorbike, or out of sight inside.
 */
export type PassengerProvider = {
  seat(): { x: number; y: number; z: number; yaw: number }; label: string; onLeave(): void;
  pose?: 'chair' | 'pillion' | 'hidden'; card?: () => RideView;
};
/** The normal living city, or the zombie apocalypse. */
export type GameMode = 'city' | 'zombie';
export type GameEvent = { type: 'store' } | { type: 'bikeshop' } | { type: 'hospital' } | { type: 'bag'; open: boolean } | { type: 'product'; id: string } | { type: 'venue'; kind: VenueRoom }
  | { type: 'menu'; menu: MenuView } | { type: 'menu-close' };
export type { MenuView, PromptView } from './interact';
/**
 * What other systems may add to (vehicles.ts, npcs.ts, transit and boats code): the contract partners code against.
 * Optional on purpose, so this file compiles before they land.
 */
type CurbCar = Car & { role?: 'traffic' | 'police' | 'curb' | 'owned' | 'loose' | 'wreck'; curb?: { spot: number; owner: 'resident' | 'lot' | 'player' } };
type Impounded = { id: number; style: string; label: string; since: number; fee: number };
type VehiclesExtra = {
  curbNear?(x: number, z: number, r: number): Car[];
  markOwned?(car: Car): void;
  impound?: { list(): Impounded[]; release(id: number, x: number, z: number, yaw: number): Car | null };
  parkedAt?(x: number, z: number, r: number): boolean;
  /** The parked scooter nearest (x, z) is ridden off for `seconds` (a xe ôm driver on a fare). */
  awayCurb?(x: number, z: number, seconds: number): void;
  resetPlayer?(): void;
  onTow?(cb: (car: Car) => void): void;
  /** The game clock for parked-vehicle occupancy; `snap` after a fade (sleep, a ride across town). */
  setClock?(hours: number, day?: number, snap?: boolean): void;
};
type SeatClaim = { id: number; x: number; z: number; yaw: number; top: number; kind: string };
type NpcsExtra = {
  claimSeat?(x: number, z: number, maxDist: number): SeatClaim | null;
  releaseSeat?(id: number): void;
  seatsNear?(x: number, z: number, r: number): { id: number; x: number; z: number; yaw: number; top?: number; kind?: string; free?: boolean; taken?: boolean }[];
  forEachRole?(role: string, cb: (npc: Npc, onDuty: boolean) => void): void;
  /** Someone turns to the player and serves, saying `line`. */
  serve?(npc: Npc, x: number, z: number, line?: string): void;
  /** Takes someone off the street for a while (a xe ôm driver out on a fare). */
  sendAway?(npc: Npc, seconds: number): void;
};
type Registers = { register?(registry: ReturnType<typeof createRegistry>, passengers: { board(p: PassengerProvider): void; leave(): void }): void };

// Both on the sidewalk so the player never spawns in a traffic lane.
const START = { x: 12.6, z: 12.4 };
const BIKE_START = { x: 12.4, z: 14.2 };
const PICKUP = { x: -32, z: 7 };
const SHOPKEEPER = { x: -30, z: 13, yaw: Math.PI };
const RECEIVERS = [
  { name: 'Bưu điện', x: 54, z: -35 }, { name: 'Công viên', x: 28, z: -26 }, { name: 'Chợ An Hòa', x: -36.5, z: 35 },
  { name: 'Quảng trường', x: 36, z: 33 }, { name: 'Bờ sông', x: -20, z: -126 }, { name: 'Tiệm hoa', x: 32, z: 13.5 },
];
export const STORE = { x: -18, z: 49.6 };
export const BIKE_SHOP = { x: 20, z: -10.9 };
const UP = new THREE.Vector3(0, 1, 0);
// People share the crowd's skeleton (figures.ts FIGURE units, a 1.71 m adult at this scale); the bike models
// are built in units that this brings to real-world size next to the houses and cars.
const PERSON_SCALE = BODY_SCALE;
const BIKE_SCALE = 0.62;
const CAMERA_DEFAULT = { yaw: Math.atan2(31, 39), pitch: Math.atan2(36, Math.hypot(31, 39)), dist: 42 };
const PLAYER_LOOK: RagdollLook = { shirt: '#e77641', pants: '#293e4a', skin: '#dca878', helmet: '#fff4dc' };
// A knocked-down player lies at the standing figure's size, so the body does not pop when it falls.
const RAGDOLL_SCALE = PERSON_SCALE;
/** Neck height of a standing adult (m): hits above it are head shots. Officers are drawn at 0.84 (police.ts). */
const NECK_Y = FIGURE.neckY * BODY_SCALE;
const OFFICER_NECK_Y = FIGURE.neckY * 0.84 * 1.01;
/**
 * Weapon forces are gameplay values; what a body takes of them (spec-ragdoll): a pistol round topples a person
 * instead of throwing them 5 m, a punch knocks down (a stumble and a fall) instead of launching. Rounds into a
 * body already down move it less, and a shotgun's pellets share one shove.
 */
const BULLET_PUSH = 0.55, PUNCH_PUSH = 0.5, CORPSE_PUSH = 0.6, PELLET_PUSH = 0.15;
const MAX_HEALTH = 100;
const CRASH_SPEED = 12.5;
// Wait after an arrest or being downed before the player is back on the street.
const RESPAWN_MS = 5000;

function material(color: THREE.ColorRepresentation, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
}

function box(parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

function sphere(parent: THREE.Object3D, radius: number, pos: [number, number, number], mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 7), mat);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, pos: [number, number, number], mat: THREE.Material, radial = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, radial), mat);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

function makeLabel(text: string, bg = '#253d35', fg = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = '700 35px Arial, sans-serif';
  const width = Math.min(480, ctx.measureText(text).width + 56);
  const left = (512 - width) / 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, 22, width, 74, 22);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 61, width - 30);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, depthTest: false, transparent: true }));
  sprite.scale.set(5.2, 1.3, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ---- People: the player, other players, shopkeepers and the people inside shops -------------------------------

type V3 = readonly [number, number, number];
/** An arm pose [swing, abduct, roll, elbow, twist, flex, hand], written for the right arm (pose.ts ArmPose). */
type ArmTuple = number[];
/** A person on the shared hero geometry (figures.ts): the crowd's skeleton and wardrobe at the highest detail. */
type Person = HeroFigure & {
  look: FigureLook;
  /** How it sits on a vehicle (seatOn), so the fists can follow the grips while the body rolls or twists. */
  seat: SeatState | null;
  /** Stride phase when another system walks it (peers). */
  stride: number;
};

const PERSON_SKINS = ['#dca878', '#d3a179', '#c58f69', '#e0b48e', '#b98260'];
const PERSON_PANTS = ['#293e4a', '#2b2f36', '#3a3f48', '#4a4038', '#3b4a63', '#5a4a3a'];
/** The delivery box hangs from the top of its straps, this high in chest space, so it can bounce. */
const PACK_Y = FIGURE.shoulderY + 0.1 - FIGURE.waistY;
/** The fist's grip lies this far past the wrist, so arm IK runs the forearm to it. */
const GRIP_REACH = -HAND_SOCKET.GRIP[1];
const ONE = new THREE.Vector3(1, 1, 1);
let personSeed = 0;

/**
 * A detailed person: the delivery rider (no `hair`: orange jacket, helmet, an insulated box on the back) or a
 * resident with hair of that colour, dressed by the wardrobe for `role`. The joints keep their old names
 * (limbLeft..elbowRight) and add head, handLeft/handRight (wrist sockets for guns, cups and cuffs) and the
 * ankles, in FIGURE units with the group scaled to metres (`riding`: for a parent in bike units).
 * Pose the joints, then call sync().
 */
function makePerson(color = '#e77641', riding = false, hair?: string, role: WardrobeRole | '' = '') {
  const seed = personSeed++;
  const look: FigureLook = hair
    ? { shirt: color, pants: PERSON_PANTS[seed % PERSON_PANTS.length], skin: PERSON_SKINS[(seed * 3) % PERSON_SKINS.length] }
    : { shirt: color, pants: '#293e4a', skin: '#dca878', helmet: '#fff4dc' };
  const style = deriveStyle(look, hair ? `${hair}:${seed}` : 0, hair ? role : 'player');
  if (hair) style.colors.hair = hair;
  // Shopkeepers, receivers and people indoors are not carrying a gánh.
  style.torso &= ~TORSO.GANH;
  setStyle(look, style);
  const person: Person = Object.assign(createHeroFigure(style), { look, seat: null, stride: 0 });
  // Hips take swing, abduction and roll in the shoulders' order, for IK astride a saddle.
  person.limbLeft.rotation.order = person.limbRight.rotation.order = 'XZY';
  if (!hair) addDeliveryBox(person);
  person.group.scale.setScalar(riding ? PERSON_SCALE / BIKE_SCALE : PERSON_SCALE);
  setArm(person, -1, ARM_POSES.RELAXED);
  setArm(person, 1, ARM_POSES.RELAXED);
  person.sync();
  return person;
}

/** Boxes merged into one vertex-coloured geometry (FIGURE units). */
function blocks(pieces: { size: V3; at: V3; color: THREE.ColorRepresentation; tilt?: number }[]) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const m = new THREE.Matrix4(), tint = new THREE.Color();
  for (const p of pieces) {
    const g = new THREE.BoxGeometry(...p.size).toNonIndexed();
    g.applyMatrix4(m.makeRotationX(p.tilt ?? 0).setPosition(...p.at));
    tint.set(p.color);
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(tint.r, tint.g, tint.b);
    }
    g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** The insulated delivery box on the back (on the bouncing pack pivot) and its two straps over the shoulders. */
function addDeliveryBox(person: Person) {
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.03 });
  const box = blocks([
    { size: [0.41, 0.45, 0.31], at: [0, -0.235, -0.105], color: '#365e52' },
    { size: [0.44, 0.05, 0.34], at: [0, -0.005, -0.105], color: '#4c7a6b' },
    { size: [0.28, 0.085, 0.012], at: [0, -0.19, -0.266], color: '#e7b04a' },
  ]);
  person.pack.position.y = PACK_Y;
  person.pack.add(new THREE.Mesh(box, cloth));
  // Straps follow the jacket from the bottom of the chest over the shoulder to the top of the box (chest space).
  const path: [number, number][] = [[1.3, 0.116], [1.4, 0.128], [1.5, 0.131], [1.59, 0.123], [1.665, 0.1], [1.728, 0.038], [1.728, -0.045], [1.668, -0.1], [1.62, -0.115]];
  const straps: { size: V3; at: V3; color: string; tilt: number }[] = [];
  for (const x of [-0.085, 0.085]) {
    for (let i = 0; i + 1 < path.length; i++) {
      const [y0, z0] = path[i], [y1, z1] = path[i + 1];
      const length = Math.hypot(y1 - y0, z1 - z0);
      straps.push({ size: [0.036, length + 0.008, 0.012], at: [x, (y0 + y1) / 2 - FIGURE.waistY, (z0 + z1) / 2], color: '#2b4a40', tilt: Math.atan2(z1 - z0, y1 - y0) });
    }
  }
  const strapMesh = new THREE.Mesh(blocks(straps), cloth);
  person.chest.add(strapMesh);
  person.pack.userData.straps = strapMesh;
}
/** Shows or hides the delivery box and its straps (a taxi passenger sits where the box would be). */
function showPack(p: Person, on: boolean) {
  p.pack.visible = on;
  if (p.pack.userData.straps) (p.pack.userData.straps as THREE.Object3D).visible = on;
}

/** Closes the eyes for a blink every few seconds (`seed` keeps people out of step). Takes effect at sync(). */
function blink(p: Person, time: number, seed = 0) {
  const closed = (time + seed * 1.37) % (3.1 + (seed % 3)) < 0.12;
  setBits(p.looks.body, 0, HEAD.EYES, !closed);
  setBits(p.looks.body, 0, HEAD.BLINK, closed);
}

/** Poses one arm from a tuple (abduct and roll mirrored per side: the right arm hangs at -x), hand shape included. */
function setArm(p: Person, side: 1 | -1, a: ArrayLike<number>) {
  const sx = sideX(side);
  (side > 0 ? p.armRight : p.armLeft).rotation.set(a[0], sx * a[2], sx * a[1]);
  (side > 0 ? p.elbowRight : p.elbowLeft).rotation.x = a[3];
  (side > 0 ? p.handRight : p.handLeft).rotation.set(0, -sx * a[4], -sx * a[5]);
  if (side > 0) p.grip.right = a[6]; else p.grip.left = a[6];
}
/** Writes an arm tuple. */
function arm(out: ArmTuple, swing: number, abduct: number, roll: number, elbow: number, twist: number, flex: number, hand: number) {
  out[0] = swing; out[1] = abduct; out[2] = roll; out[3] = elbow; out[4] = twist; out[5] = flex; out[6] = hand;
  return out;
}
const copyArm = (out: ArmTuple, a: ArrayLike<number>) => arm(out, a[0], a[1], a[2], a[3], a[4], a[5], a[6]);

const _ik = { m: new THREE.Matrix4(), n: new THREE.Matrix4(), f: new THREE.Matrix4(), v: new THREE.Vector3(), root: new THREE.Vector3(), hint: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'XZY') };
/** The chest's frame in the person's group space (lean, roll, breathing and twist included). */
function chestFrame(p: Person, out: THREE.Matrix4) {
  p.body.updateMatrix();
  p.chest.updateMatrix();
  return out.multiplyMatrices(p.body.matrix, p.chest.matrix);
}
const shoulderOf = (p: Person, side: 1 | -1, out: THREE.Vector3) => out.set(sideX(side) * p.style.shoulderX, FIGURE.shoulderY - FIGURE.waistY, 0);

/**
 * Shoulder angles and elbow bend that put a fist (its grip) on `target`, with the elbow pointing along `hint`.
 * Both are in the person's group space (FIGURE units), or in chest space with `inChest`. Writes out[0..3].
 */
function reach(p: Person, side: 1 | -1, target: THREE.Vector3, hint: THREE.Vector3, out: ArmTuple, inChest = false) {
  const t = _ik.v.copy(target), h = _ik.hint.copy(hint);
  if (!inChest) {
    const inverse = chestFrame(p, _ik.m).invert();
    t.applyMatrix4(inverse);
    h.transformDirection(inverse);
  }
  const ik = twoBoneIK(shoulderOf(p, side, _ik.root), t, FIGURE.upperArm, FIGURE.foreArm + GRIP_REACH, h);
  out[0] = ik.swing; out[1] = sideX(side) * ik.abduct; out[2] = sideX(side) * ik.roll; out[3] = ik.bend;
  return out;
}

/**
 * Forearm twist and wrist flex that turn a hand axis (in the unmirrored hand's space, mirrored per side: (0,0,1)
 * is the fist's channel, (-1,0,0) the palm's normal) toward `want` (group space). The rest of the arm is kept.
 */
function alignHand(p: Person, side: 1 | -1, a: ArmTuple, axis: V3, want: THREE.Vector3) {
  const sx = sideX(side);
  const base = chestFrame(p, _ik.n).multiply(_ik.m.compose(shoulderOf(p, side, _ik.root), _ik.q.setFromEuler(_ik.e.set(a[0], sx * a[2], sx * a[1], 'XZY')), ONE));
  const ax = sx * axis[0], ay = axis[1], az = axis[2];
  const pose = [a[3], 0, 0, 0];
  let best = -Infinity;
  for (let twist = -1.6; twist <= 1.61; twist += 0.08) {
    for (let flex = -0.6; flex <= 0.61; flex += 0.1) {
      pose[1] = twist; pose[2] = flex;
      const e = armFK(pose, side, _ik.f).premultiply(base).elements;
      const x = e[0] * ax + e[4] * ay + e[8] * az, y = e[1] * ax + e[5] * ay + e[9] * az, z = e[2] * ax + e[6] * ay + e[10] * az;
      // A comfortable wrist wins a tie.
      const score = (x * want.x + y * want.y + z * want.z) / Math.hypot(x, y, z) - 0.03 * Math.abs(flex) - 0.01 * Math.abs(twist);
      if (score > best) { best = score; a[4] = twist; a[5] = flex; }
    }
  }
  return a;
}

/** The ankle angle that levels the foot under a hip rotation and knee bend. */
function flatFoot(hip: THREE.Euler, knee: number) {
  const e = _ik.m.makeRotationFromEuler(hip).elements;
  // Foot forward = R_hip Rx(knee + ankle) (0, 0, 1); its height is -e5 sin + e9 cos.
  let phi = Math.atan2(e[9], e[5]);
  if (-e[6] * Math.sin(phi) + e[10] * Math.cos(phi) < 0) phi += Math.PI;
  return Math.atan2(Math.sin(phi - knee), Math.cos(phi - knee));
}

/**
 * How far below the hip joint a leg reaches (FIGURE units) for a thigh swing, knee, ankle and toe bend: the
 * lowest of heel, ball and toe tip. Planting the lower foot on the ground gives the walk its natural bob.
 */
function legReach(thigh: number, knee: number, ankle: number, toe: number) {
  const shin = thigh + knee, foot = shin + ankle;
  const ankleDrop = FIGURE.thigh * Math.cos(thigh) + FIGURE.shin * Math.cos(shin);
  const c = Math.cos(foot), s = Math.sin(foot);
  const heel = FIGURE.ankleY * c - 0.062 * s, ball = FIGURE.ankleY * c + FIGURE.ball * s;
  return ankleDrop + Math.max(heel, ball, ball + 0.088 * Math.sin(foot - toe));
}

// ---- Sitting on vehicles -----------------------------------------------------------------------------------------

type SeatKind = MotoStyle | 'horse' | 'pillion' | 'car' | 'helm';
/**
 * How a person sits, in metres relative to the hip joint (vehicle axes, written for the right side and mirrored
 * for the left): where the fists grip (null: hands on the thighs) and the soles rest, which way knees and elbows
 * point, the run of the gripped bar or rim through the fist, the hand shape, the forward lean and how far the
 * toes point down from level.
 */
type SeatSpec = { scale: number; lean: number; grip: V3 | null; foot: V3; knee: V3; elbow: V3; bar: V3; hand: number; toes: number };
type SeatState = { kind: SeatKind; spec: SeatSpec; targets: THREE.Vector3[]; hints: THREE.Vector3[]; arms: ArmTuple[] };

/**
 * Hip joints (metres in the vehicle's frame): a motorbike rider a little forward of MOTO_RIDER.hip so the
 * slim arms reach the grips, the pillion behind them, and the horse's saddle (the horse is built in bike units).
 */
const MOTO_HIP: V3 = [0, MOTO_RIDER.hip[1], MOTO_RIDER.hip[2] + 0.06];
const PILLION_HIP: V3 = [0, 0.95, -0.56];
const HORSE_HIP: V3 = [0, 2.61 * BIKE_SCALE + FIGURE.seatClear * PERSON_SCALE, -0.15 * BIKE_SCALE];
const fromHip = (p: readonly number[], hip: V3): V3 => [p[0] - hip[0], p[1] - hip[1], p[2] - hip[2]];
/** A grip with the index finger resting on the brake lever. */
const BRAKE = handCode(0.85, 0.75, 0.7);
const SCOOTER_SEAT: SeatSpec = { scale: PERSON_SCALE, lean: 0.3, grip: fromHip(MOTO_RIDER.grip, MOTO_HIP), foot: fromHip(MOTO_RIDER.board, MOTO_HIP), knee: [0.9, 0.55, 0.25], elbow: [0.9, -0.45, -0.2], bar: [-1, 0, 0], hand: BRAKE, toes: 0.05 };
const PEG_SEAT: SeatSpec = { ...SCOOTER_SEAT, lean: 0.34, foot: fromHip(MOTO_RIDER.peg, MOTO_HIP), knee: [0.9, 0.35, 0.6] };
const SEATS: Record<SeatKind, SeatSpec> = {
  scooter: SCOOTER_SEAT, vespa: SCOOTER_SEAT, cub: PEG_SEAT, sport: { ...PEG_SEAT, lean: 0.48 },
  // Astride the horse, feet in the stirrups, fists up on the reins over the withers.
  horse: { scale: PERSON_SCALE, lean: 0.1, grip: [0.1, 0.27, 0.42], foot: fromHip([0.33, 1.18, -0.06], HORSE_HIP), knee: [1, 0.15, 0.5], elbow: [0.4, -0.8, -0.3], bar: [0, 1, 0.3], hand: HAND.GRIP, toes: -0.15 },
  // Riding pillion: feet on the rear pegs, hands resting on the thighs.
  pillion: { scale: PERSON_SCALE, lean: 0.1, grip: null, foot: fromHip([0.2, 0.42, -0.36], PILLION_HIP), knee: [0.8, 0.5, 0.35], elbow: [0.5, -0.5, -0.5], bar: [0, 0, 1], hand: HAND.RELAXED, toes: 0.1 },
  // At a car's wheel, leaning back a little; smaller (CAR_DRIVER.scale) so the head clears the roof.
  car: { scale: CAR_DRIVER.scale, lean: CAR_DRIVER.lean, grip: [0.17, 0.4, 0.34], foot: [0.16, -0.3, 0.58], knee: [0.3, 0.7, 0.6], elbow: [0.6, -0.8, -0.1], bar: [-0.5, 0.75, -0.4], hand: HAND.GRIP, toes: 0 },
  // The hire boat's wheel at ten to two, feet on the deck.
  helm: { scale: PERSON_SCALE, lean: 0.25, grip: [0.147, 0.27, 0.55], foot: [0.13, -0.28, 0.44], knee: [0.3, 0.7, 0.6], elbow: [0.6, -0.8, -0.1], bar: [-0.5, 0.7, -0.5], hand: HAND.GRIP, toes: 0 },
};

const _seat = { a: new THREE.Vector3(), b: new THREE.Vector3(), h: new THREE.Vector3() };
/**
 * Seats a person with the hip joint at `hip` (metres in the parent's space, whose unit is `unit` metres): legs
 * IK'd to the footrests with the feet level, fists to the grips with the bar running through them. The pose is
 * kept in `person.seat` so holdSeat() can follow the grips while the body rolls into a turn or twists to aim.
 */
function seatOn(p: Person, kind: SeatKind, hip: readonly number[] = [0, 0, 0], unit = 1) {
  const spec = SEATS[kind], S = spec.scale;
  p.group.scale.setScalar(S / unit);
  p.group.position.set(hip[0] / unit, (hip[1] - FIGURE.hipY * S) / unit, hip[2] / unit);
  p.group.rotation.set(0, 0, 0);
  p.body.position.y = FIGURE.hipY;
  p.body.rotation.set(spec.lean, 0, 0);
  p.body.scale.set(1, 1, 1);
  p.chest.rotation.set(0, 0, 0);
  // Eyes on the road: the head tips back up against the lean.
  p.head.rotation.set(-spec.lean * 0.75, 0, 0);
  p.secondary = p.hair = 0;
  // Metres from the hip to the figure's group space.
  const local = (v: V3, side: number, out: THREE.Vector3) => out.set(sideX(side) * v[0] / S, FIGURE.hipY + v[1] / S, v[2] / S);
  const state: SeatState = { kind, spec, targets: [], hints: [], arms: [[], []] };
  for (const side of [-1, 1] as const) {
    const hipJoint = side > 0 ? p.limbRight : p.limbLeft;
    // The ankle sits above and behind the spot where the sole rests.
    local(spec.foot, side, _seat.a).add(_seat.b.set(0, FIGURE.ankleY, -0.08));
    const ik = twoBoneIK(_seat.b.set(sideX(side) * FIGURE.hipX, FIGURE.hipY, 0), _seat.a, FIGURE.thigh, FIGURE.shin, _seat.h.set(sideX(side) * spec.knee[0], spec.knee[1], spec.knee[2]), true);
    hipJoint.rotation.set(ik.swing, ik.roll, ik.abduct);
    (side > 0 ? p.kneeRight : p.kneeLeft).rotation.x = ik.bend;
    (side > 0 ? p.ankleRight : p.ankleLeft).rotation.x = flatFoot(hipJoint.rotation, ik.bend) + spec.toes;
    p.toe[side > 0 ? 'right' : 'left'] = 0;
  }
  for (const side of [-1, 1] as const) {
    const i = side > 0 ? 1 : 0, a = state.arms[i];
    const hint = new THREE.Vector3(sideX(side) * spec.elbow[0], spec.elbow[1], spec.elbow[2]);
    const target = new THREE.Vector3();
    if (spec.grip) local(spec.grip, side, target);
    else {
      // Resting on the top of the thigh, a third of the way back from the knee.
      const hipJoint = side > 0 ? p.limbRight : p.limbLeft;
      hipJoint.updateMatrix();
      target.set(0, -FIGURE.thigh * 0.62, 0.085).applyMatrix4(hipJoint.matrix);
    }
    reach(p, side, target, hint, a);
    a[6] = spec.hand;
    if (spec.grip) alignHand(p, side, a, [0, 0, 1], _seat.h.set(sideX(side) * spec.bar[0], spec.bar[1], spec.bar[2]).normalize());
    else alignHand(p, side, a, [-1, 0, 0], _seat.h.set(0, -1, 0));
    state.targets[i] = target;
    state.hints[i] = hint;
    setArm(p, side, a);
  }
  p.seat = state;
  p.sync();
}

const _hold: ArmTuple = [];
/**
 * Keeps a seated person's fists on the grips while the body rolls (into a turn) and the chest twists (to aim;
 * with `aim` the right arm points the gun and the head looks `look` radians further round).
 */
function holdSeat(p: Person, roll: number, twist: number, aim: boolean, look = 0) {
  const seat = p.seat;
  if (!seat) return;
  p.body.rotation.z = roll;
  p.chest.rotation.y = twist;
  p.head.rotation.y = aim ? THREE.MathUtils.clamp(look, -0.7, 0.7) : 0;
  for (const side of [-1, 1] as const) {
    const i = side > 0 ? 1 : 0, saved = seat.arms[i];
    if (side > 0 && aim) { setArm(p, 1, ARM_POSES.AIM); continue; }
    reach(p, side, seat.targets[i], seat.hints[i], copyArm(_hold, saved));
    setArm(p, side, _hold);
  }
  p.sync();
}

// ---- Guns, cups and cuffs in the hands ---------------------------------------------------------------------------

type GunId = Exclude<WeaponId, 'fists'>;
/**
 * How each gun sits in the right fist: its scale (makeGun is sized for the old 0.68 player; the pistol is also
 * brought down to a real pistol's size), the middle of its grip and where a support hand holds it (gun units).
 */
const GUN_HOLD: Record<GunId, { scale: number; grip: V3; fore: V3 | null }> = {
  pistol: { scale: 0.62, grip: [0, -0.065, -0.036], fore: null },
  shotgun: { scale: 0.83, grip: [0, -0.02, -0.06], fore: [0, 0.03, 0.6] },
  smg: { scale: 0.83, grip: [0, -0.12, 0.26], fore: [0, 0.01, 0.46] },
  grenade: { scale: 0.83, grip: [0, -0.1, -0.05], fore: [0, 0.03, 0.36] },
  rpg: { scale: 0.83, grip: [0, -0.03, 0.2], fore: [0, -0.02, 0.45] },
};
const GUN_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
/** A long gun at the right shoulder, barrel level and straight ahead (solved for these guns in the hero hand). */
const SHOULDER_ARM: ArmTuple = [-0.18, 0.64, -0.84, -2.22, -0.7, -1.05, HAND.TRIGGER];
/** Loosely closed hands of a runner. */
const RUN_FIST = handCode(0.7, 0.6, 0.55);
/**
 * Puts a gun model in a person's right fist: the grip through the fist's channel, the barrel running along the
 * hand, so raising the arm forward points it ahead with the sights up (the convention of the crowd's guns).
 */
function holdGun(p: Person, id: GunId, gun: THREE.Object3D) {
  const hold = GUN_HOLD[id];
  gun.scale.setScalar(hold.scale);
  gun.quaternion.copy(GUN_TURN);
  gun.position.copy(socket('GRIP', 1)).sub(new THREE.Vector3(...hold.grip).multiplyScalar(hold.scale).applyQuaternion(GUN_TURN));
  p.handRight.add(gun);
  return gun;
}

/** A takeaway cup (cà phê sữa đá) standing in a fist: its axis runs through the fist's channel. */
function holdCup(hand: THREE.Object3D, side: 1 | -1 = 1) {
  const cup = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.17, 12), new THREE.MeshStandardMaterial({ color: '#fff2d0', roughness: 0.7 }));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.054, 0.018, 12), new THREE.MeshStandardMaterial({ color: '#537764', roughness: 0.5 }));
  lid.position.y = 0.09;
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 5), new THREE.MeshStandardMaterial({ color: '#344f40', roughness: 0.6 }));
  straw.position.set(0.015, 0.13, 0);
  cup.add(paper, lid, straw);
  cup.quaternion.copy(GUN_TURN);
  cup.position.copy(socket('GRIP', side)).add(new THREE.Vector3(sideX(side) * -0.03, 0, 0.02));
  hand.add(cup);
  return cup;
}
/** A cup held at the waist, upright, ready to hand over. */
const HOLD_CUP: ArmTuple = [-0.2, 0.12, 0, -1.45, 0, 0, HAND.CUP];

// ---- People standing about (shopkeepers, receivers, people inside shops) -------------------------------------------

/** Standing at ease: breathing, the weight drifting from leg to leg, the head looking round now and then. Arms relaxed. */
function poseStanding(p: Person, time: number, seed = 0) {
  const t = time + seed * 7.3;
  // 0: weight on the left leg .. 1: on the right; the free knee softens.
  const shift = 0.5 + 0.5 * Math.sin(t * 0.21);
  p.body.rotation.set(0.02, 0, (shift - 0.5) * 0.05);
  p.body.scale.set(1, 1 + Math.sin(t * 2.3) * 0.01, 1);
  p.chest.rotation.y = 0;
  p.head.rotation.set(0.05 + Math.sin(t * 0.23) * 0.06, 0.5 * Math.sin(t * 0.31) * Math.max(0, Math.sin(t * 0.13)), 0);
  p.limbLeft.rotation.set(-0.04 * shift, 0, sideX(-1) * 0.02);
  p.limbRight.rotation.set(-0.04 * (1 - shift), 0, sideX(1) * 0.02);
  p.kneeLeft.rotation.x = 0.03 + 0.12 * shift;
  p.kneeRight.rotation.x = 0.03 + 0.12 * (1 - shift);
  p.ankleLeft.rotation.x = -0.08 * shift;
  p.ankleRight.rotation.x = -0.08 * (1 - shift);
  p.toe.left = p.toe.right = 0;
  p.secondary = p.hair = 0;
  setArm(p, -1, ARM_POSES.RELAXED);
  setArm(p, 1, ARM_POSES.RELAXED);
  blink(p, time, seed);
}

const _room = { a: copyArm([], ARM_POSES.RELAXED), b: copyArm([], ARM_POSES.RELAXED), v: new THREE.Vector3(), h: new THREE.Vector3() };
const clasped = new WeakMap<Person, ArmTuple[]>();
/**
 * Poses someone in a shop or venue for this moment (interiors.ts): standing about, a clerk with the hands
 * clasped in front, chatting with a hand going, or dancing. Returns how far to raise the figure (m) so the
 * feet stay on the floor.
 */
function poseInRoom(p: Person, time: number, act: RoomAct) {
  const seed = (p.style.colors.shirt.charCodeAt(2) + p.style.colors.shirt.charCodeAt(5)) * 0.37;
  poseStanding(p, time, seed);
  let lift = 0;
  if (act === 'clerk') {
    // Hands clasped in front at the waist, palms together (solved once).
    let arms = clasped.get(p);
    if (!arms) {
      arms = ([-1, 1] as const).map((side) => {
        const sx = sideX(side);
        const a = reach(p, side, _room.v.set(sx * 0.03, 1.0, 0.17), _room.h.set(sx * 0.6, -0.4, -0.5), copyArm([], ARM_POSES.RELAXED));
        a[6] = HAND.RELAXED;
        return alignHand(p, side, a, [-1, 0, 0], _room.h.set(-sx, 0, 0.3).normalize());
      });
      clasped.set(p, arms);
    }
    setArm(p, -1, arms[0]);
    setArm(p, 1, arms[1]);
  } else if (act === 'chat') {
    // Talking with one hand, the other hand in a loose fist at the side.
    const t = time + seed;
    setArm(p, 1, arm(_room.a, ARM_POSES.CHAT[0], ARM_POSES.CHAT[1], 0, -1.4 + 0.25 * Math.sin(t * 2.7), ARM_POSES.CHAT[4], 0.1 * Math.sin(t * 1.9), HAND.OPEN));
    p.head.rotation.x = 0.02 * Math.sin(t * 5);
  } else if (act === 'dance') {
    const t = time * 4.2 + seed, bounce = Math.abs(Math.sin(t)), sway = Math.sin(t * 0.5);
    p.body.rotation.set(0.08, 0, sway * 0.1);
    p.chest.rotation.y = sway * 0.3;
    // Skirts, tà and ponytails swing with the hips.
    p.secondary = 0.3 * sway;
    p.hair = 0.2 * sway;
    p.head.rotation.set(-0.1 + 0.15 * bounce, sway * 0.25, 0);
    // Knees bob to the beat with the feet flat on the floor.
    const thigh = -0.25 * bounce, knee = 0.5 * bounce, ankle = -0.25 * bounce;
    p.limbLeft.rotation.set(thigh, 0, sideX(-1) * 0.06);
    p.limbRight.rotation.set(thigh, 0, sideX(1) * 0.06);
    p.kneeLeft.rotation.x = p.kneeRight.rotation.x = knee;
    p.ankleLeft.rotation.x = p.ankleRight.rotation.x = ankle;
    lift = (legReach(thigh, knee, ankle, 0) - FIGURE.sole) * PERSON_SCALE;
    // Three moves taking turns: both hands in the air, a pumping fist, arms swinging bent.
    const move = Math.floor((time + seed) / 4) % 3;
    if (move === 0) {
      arm(_room.a, -2.6 + 0.3 * sway, 0.35, 0, -0.5, -0.3, 0, HAND.OPEN);
      arm(_room.b, -2.6 - 0.3 * sway, 0.35, 0, -0.5, -0.3, 0, HAND.OPEN);
    } else if (move === 1) {
      arm(_room.a, 0.1, 0.12, 0, -1.6 + 0.3 * bounce, 0.6, 0, HAND.FIST);
      arm(_room.b, -2.7 + 0.5 * bounce, 0.2, 0, -0.3 - 0.4 * bounce, 0.2, 0, HAND.FIST);
    } else {
      arm(_room.a, -0.6 + 0.6 * sway, 0.25, 0, -1.7, 0.6, 0, HAND.RELAXED);
      arm(_room.b, -0.6 - 0.6 * sway, 0.25, 0, -1.7, 0.6, 0, HAND.RELAXED);
    }
    setArm(p, -1, _room.a);
    setArm(p, 1, _room.b);
  }
  p.sync();
  return lift;
}

// Toes on the ground from a high seat: the ball of the foot is FOOT_REACH from the ankle, FOOT_PHI below its line.
const FOOT_REACH = Math.hypot(FIGURE.ankleY, FIGURE.ball), FOOT_PHI = Math.atan2(FIGURE.ankleY, FIGURE.ball);
const _legs = { thigh: 0, knee: 0, ankle: 0, toe: 0 };
/** Legs of someone sitting with the hips `hy` (FIGURE units) above their feet's floor, like the crowd's (npcs.ts seatLegs). */
function seatLegs(hy: number, sway: number) {
  const T = FIGURE.thigh, S = FIGURE.shin, A = FIGURE.ankleY;
  let slope = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp((hy - A - S * Math.cos(0.2)) / T, -1, 1)), -0.8, 0.28);
  const ky = hy - T * Math.sin(slope);
  let shin = 0, ankle: number, toe = 0;
  if (ky - A <= S) { shin = Math.acos((ky - A) / S); ankle = shin; }
  else if (ky - S <= FOOT_REACH) { ankle = Math.asin((ky - S) / FOOT_REACH) - FOOT_PHI; toe = ankle * 0.8; }
  else { slope = 0.1; shin = -0.08 + sway; ankle = 0.45; }
  _legs.thigh = slope - Math.PI / 2; _legs.knee = Math.PI / 2 - slope - shin; _legs.ankle = ankle; _legs.toe = toe;
  return _legs;
}
const _lap: ArmTuple[] = [copyArm([], ARM_POSES.SIT), copyArm([], ARM_POSES.SIT)];
/**
 * Sitting on a bench or a stool whose top is `top` m above the floor under the feet: the hips just above the seat,
 * the lower legs down to the floor, hands on the thighs, looking about. Returns how far below the seat top the
 * figure's origin goes (place the group at seat surface minus this).
 */
function poseSeated(p: Person, top: number, time: number, seed = 0, sip = 0) {
  const t = time + seed * 5.1;
  const legs = seatLegs(top / PERSON_SCALE + FIGURE.seatClear, Math.sin(t * 1.4) * 0.1);
  p.body.rotation.set(0.05, 0, 0);
  p.body.scale.set(1, 1 + Math.sin(t * 2.3) * 0.008, 1);
  p.chest.rotation.y = 0;
  p.head.rotation.set(0.04 + Math.sin(t * 0.27) * 0.05, 0.55 * Math.sin(t * 0.31) * Math.max(0, Math.sin(t * 0.13)), 0);
  for (const side of [-1, 1] as const) {
    (side < 0 ? p.limbLeft : p.limbRight).rotation.set(legs.thigh, 0, sideX(side) * 0.12);
    (side < 0 ? p.kneeLeft : p.kneeRight).rotation.x = legs.knee;
    (side < 0 ? p.ankleLeft : p.ankleRight).rotation.x = legs.ankle;
  }
  p.toe.left = p.toe.right = legs.toe;
  p.secondary = p.hair = 0;
  setArm(p, -1, _lap[0]);
  // A drink in the right hand comes up to the mouth now and then.
  setArm(p, 1, sip > 0 ? arm(_lap[1], -1.05 - 0.45 * sip, 0.1, 0, -1.25 - 0.9 * sip, 0, 0, HAND.CUP) : copyArm(_lap[1], ARM_POSES.SIT));
  blink(p, time, seed);
  p.sync();
  return (FIGURE.hipY - FIGURE.seatClear) * PERSON_SCALE;
}

/** A horse in bike units: legs pivot at the hip so they can gallop. */
function makeHorse(group: THREE.Group, color: string) {
  const coat = material(color, 0.8);
  const hair = material('#2a1d16', 0.9);
  const tack = material('#5a3a22', 0.7);
  box(group, [0.9, 0.95, 2.6], [0, 2.0, 0], coat);
  const neck = box(group, [0.55, 1.2, 0.6], [0, 2.65, 1.3], coat);
  neck.rotation.x = 0.5;
  const head = box(group, [0.45, 0.5, 1.0], [0, 3.15, 1.85], coat);
  head.rotation.x = 0.55;
  const mane = box(group, [0.14, 1.0, 0.35], [0, 2.95, 1.1], hair);
  mane.rotation.x = 0.5;
  for (const x of [-0.14, 0.14]) box(group, [0.1, 0.25, 0.1], [x, 3.55, 1.6], coat);
  const tail = box(group, [0.16, 1.0, 0.22], [0, 1.95, -1.5], hair);
  tail.rotation.x = 0.45;
  box(group, [0.98, 0.16, 0.85], [0, 2.53, -0.15], tack);
  box(group, [0.08, 0.6, 0.08], [-0.5, 2.2, -0.15], tack);
  box(group, [0.08, 0.6, 0.08], [0.5, 2.2, -0.15], tack);
  const legs: THREE.Group[] = [];
  for (const z of [0.95, -0.95]) for (const x of [-0.3, 0.3]) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.6, z);
    box(leg, [0.22, 1.5, 0.26], [0, -0.75, 0], coat);
    box(leg, [0.26, 0.16, 0.3], [0, -1.52, 0.02], hair);
    group.add(leg);
    legs.push(leg);
  }
  return legs;
}

/** Motorbikes in four styles sharing wheels, lamp and handlebars, plus the horse. */
function makeBike(kind: BikeId = 'scooter', color = '#ed763e', riderColor?: string) {
  const group = new THREE.Group();
  if (kind === 'horse') {
    const legs = makeHorse(group, color);
    if (riderColor) {
      const person = makePerson(riderColor, true);
      seatOn(person, 'horse', HORSE_HIP, BIKE_SCALE);
      group.add(person.group);
    }
    group.scale.setScalar(BIKE_SCALE);
    group.traverse((o) => { o.castShadow = false; });
    return { group, wheels: [] as THREE.Mesh[], legs, wheelRadius: 1 };
  }
  // Real-size models from vehicle-models.ts inside the BIKE_SCALE group; the wheels are separate so they spin.
  const style = kind as MotoStyle;
  const { body, wheel, wheels: hubs } = motoParts(style, color);
  const { material: finish } = vehicleMaterial();
  const model = new THREE.Mesh(body, finish);
  model.scale.setScalar(1 / BIKE_SCALE);
  group.add(model);
  const wheels: THREE.Mesh[] = [];
  for (const z of [hubs.front, hubs.rear]) {
    const mesh = new THREE.Mesh(z === hubs.front ? wheel : wheel.clone(), finish);
    mesh.scale.setScalar(1 / BIKE_SCALE);
    mesh.position.set(0, hubs.r / BIKE_SCALE, z / BIKE_SCALE);
    group.add(mesh);
    wheels.push(mesh);
  }
  if (riderColor) {
    const person = makePerson(riderColor, true);
    seatOn(person, style, MOTO_HIP, BIKE_SCALE);
    group.add(person.group);
  }
  group.scale.setScalar(BIKE_SCALE);
  group.traverse((o) => { o.castShadow = false; });
  return { group, wheels, legs: [] as THREE.Group[], wheelRadius: hubs.r };
}

function makeRing(color: string, emissive: string, radius = 2.6) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.2, roughness: 0.55 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.1, 8, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.29;
  group.add(disc);
  return { group, ring, mat };
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const wrappers = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    // An instanced mesh (a hero figure is five) owns its instance matrix buffer: free it too.
    if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
    // Figure geometry is shared by every person (figures.ts) and never freed. A hero figure's mesh wraps those
    // shared buffers with its own look and pose attributes: only the wrapper and those are freed.
    if (mesh.geometry?.userData.sharedGeometry) { if (mesh.userData.sharedGeometry) wrappers.add(mesh.geometry); }
    else if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  wrappers.forEach(releaseView);
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}


function angleLerp(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

function focusedInput() {
  const active = document.activeElement;
  return active instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable);
}

function formatThousands(k: number) {
  return `${(k * 1000).toLocaleString('vi-VN')}đ`;
}

type Peer = {
  group: THREE.Group;
  foot: ReturnType<typeof makePerson>;
  bike: ReturnType<typeof makeBike>;
  car: THREE.Object3D | null;
  carKind: VehicleKind;
  boat: THREE.Object3D | null;
  guns: Map<WeaponId, THREE.Group>;
  label: THREE.Sprite;
  target: PeerState;
  motion: ReturnType<typeof createPeerInterpolator>;
  name: string;
  color: string;
  body: RagdollBody | null;
  flashAt: number;
  hurtAt: number;
  predicted: number;
  heroLook: ReturnType<typeof createHeroLook>;
  powerSeq: number;
};
type Down = 'crash' | 'wasted' | 'busted' | null;

export function createGame(container: HTMLElement, onHud: (hud: Hud) => void, onEvent: (event: GameEvent) => void = () => {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 120, 260);
  let level = detectStartLevel();
  let qualityMode: QualityMode = 'auto';
  // MSAA is only worth its fill-rate cost on GPUs that start on the top preset.
  const renderer = new THREE.WebGLRenderer({ antialias: level === 0, alpha: false, stencil: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The street never moves, so its shadows are rendered only when the sun has moved.
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.domElement.setAttribute('aria-label', 'Khu phố Việt Nam 3D. WASD để di chuyển, E để tương tác, chuột phải để xoay camera.');
  container.appendChild(renderer.domElement);
  const gpu = gpuName(renderer.getContext());
  const softwareGpu = isSoftwareGpu(gpu);
  // Far enough to see the downtown skyline across the river.
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
  const hemi = new THREE.HemisphereLight('#fff2d2', '#789a8c', 2.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe5be', 3.7);
  sun.position.set(-42, 75, 20);
  // The shadow map covers 300 m round the player (see followShadows).
  const extent = 150;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 760;
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0001;
  scene.add(sun, sun.target);
  const sky = createSky(scene);
  const atmosphere = createAtmosphere(scene, sun, hemi);
  const world = buildWorld(scene);
  const nav = createNav();

  // One spatial index over the static solids (world.colliders is final once the world is built; like the old linear
  // scans it treats them as infinitely tall) and one over the building blocks with their roof heights.
  const solids = createCollisionIndex();
  for (const c of world.colliders) solids.add(c.minX, c.minZ, c.maxX, c.maxZ, -Infinity, Infinity, OWNER.legacy, c);
  // The wired districts' solids (map/world-map.ts): oriented boxes, as tall as the legacy ones are treated.
  for (const c of world.districtColliders) solids.addBox(c.cx, c.cz, c.hx, c.hz, c.yaw, -Infinity, Infinity, OWNER.legacy, c);
  const roofs = createCollisionIndex();
  for (const p of PLOTS) roofs.add(p.full.minX, p.full.minZ, p.full.maxX, p.full.maxZ, 0, p.h, OWNER.roof, p);
  for (const p of DISTRICT_PLOTS) roofs.addBox(p.box.cx, p.box.cz, p.box.hx, p.box.hz, p.box.yaw, 0, p.h, OWNER.roof, p);
  // (world.attach, which also precompiles the district materials, waits for the quality level: applyLevel below.)
  const roofHits: number[] = [];

  function worldClear(x: number, z: number, radius: number) {
    return walkable(x, z, radius) && solids.clear(x, z, radius);
  }
  /** A point people can stand on: the point itself if clear, otherwise the nearest walking line. */
  function reachable(p: { x: number; z: number }) {
    if (worldClear(p.x, p.z, 0.5)) return { x: p.x, z: p.z };
    const s = nav.snap(p.x, p.z);
    return { x: s.x, z: s.z };
  }

  /** Distance along a ray to the first building wall, treating colliders as infinitely tall. */
  function wallDistance(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    return solids.cast(origin.x, origin.z, dir.x, dir.z, maxT, origin.y, dir.y);
  }
  function lineOfSight(x1: number, z1: number, x2: number, z2: number) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    if (d < 0.01) return true;
    return solids.cast(x1, z1, (x2 - x1) / d, (z2 - z1) / d, d, 1.2, 0) >= d - 0.05;
  }

  const bubbles = createBubbles(scene);
  // Bodies hit the shared index of static solids, plus the seats and tables it leaves out.
  const ragdolls = createRagdolls(scene, world.seats, groundHeight, { solids });
  const effects = createEffects(scene, groundHeight);
  const powerEffects = createPowerEffects(scene);
  const powers = createPowerState();
  const explosives = createExplosives(scene, groundHeight);
  const pickups = createPickups(scene, groundHeight);
  const sayAt = (key: string, text: string, at: () => { x: number; y: number; z: number } | null, shout = false) => bubbles.say(key, text, performance.now(), at, shout ? 2600 : 3400, shout ? 'shout' : 'say');
  // The wired slices' streets for the HUD's street line (districts.ts settleStreet names them like today's).
  registerStreets(districtStreets());
  const npcs = createNpcs(scene, ragdolls, { clear: worldClear, sight: lineOfSight }, {
    onRest: (x, z) => effects.pool(x, z),
    // Seated on a low stool the head is lower than on a bench: the bubble follows the seat height.
    say: (npc, text, shout) => sayAt(`npc${npc.id}`, text, () => (npc.state === 'inside' || npc.state === 'down' || npc.state === 'away' ? null : { x: npc.x, y: npc.y + (npc.pose === 'sit' ? npc.seatTop + 1.15 : 1.95), z: npc.z }), shout),
    onFeed: (x, z) => animals.lure(x, z),
    bikeAt: (x, z) => vehicles.parkedAt(x, z, 0.9),
  });
  const vehicles = createVehicles(scene, worldClear);
  // The boats carry the player too (the đò ngang, river bus W2): fares, putting them down on a pier, a line in the HUD.
  const boats = createBoats(scene, {
    pay: (k) => { if (cash < k) return false; cash -= k; return true; },
    place: (x, z, yaw) => { Object.assign(state, { x, z, angle: yaw }); bodyY = groundHeight(x, z); swimming = false; cameraTarget.set(x, 1, z); },
    notify: (text, ms) => notify(text, ms),
    say: (key, text, at) => sayAt(key, text, at),
  });
  const police = createPolice(scene, vehicles, ragdolls, { clear: worldClear, sight: lineOfSight, ground: groundHeight }, (key, text, at) => sayAt(key, text, at, true));
  const zombies = createZombies(scene, ragdolls, {
    clear: (x, z, radius) => worldClear(x, z, radius) && !vehicles.blocked(x, z, radius),
    sight: lineOfSight,
    ground: groundHeight,
    route: (fx, fz, tx, tz) => nav.route(fx, fz, tx, tz),
  }, (zb, text) => sayAt(`zombie${zb.index}`, text, () => (zb.state === 'off' || zb.state === 'down' ? null : { x: zb.x, y: groundHeight(zb.x, zb.z) + 2, z: zb.z })));
  let zombieMode = false;
  // Shop interiors: while one is open the camera is inside it, looking at the shop or at one product.
  const interiors = createInteriors(scene, {
    gun: (id) => makeGun(id).group,
    bike: (id, color) => makeBike(id, color).group,
    person: (shirt, hair) => {
      const person = makePerson(shirt, false, hair);
      return { group: person.group, pose: (time, act) => poseInRoom(person, time, act) };
    },
  });
  let interior: InteriorKind | null = null;
  let productFocus: string | null = null;
  let productHover: string | null = null;
  const interiorLook = new THREE.Vector3();
  /** What the residents report in a frame when there are none (zombie mode). */
  const NO_NPC_EVENTS: ReturnType<typeof npcs.update> = { robbed: [], strikes: 0, shots: [], crowd: { outside: 0, umbrellas: 0, sheltering: 0, exposed: 0, watching: 0, chatting: 0 } };
  let zombieBest = 0;
  try { zombieBest = Number(localStorage.getItem('pvo-zombie-best')) || 0; } catch { /* storage blocked */ }
  let fireAt = 0;
  // A flashlight for zombie nights, with no power in the city.
  const torch = new THREE.SpotLight('#fff1d0', 0, 36, 0.48, 0.55, 1.1);
  torch.visible = false;
  scene.add(torch, torch.target);
  const animals = createAnimals(scene, { clear: worldClear, ground: groundHeight }, (key, text, at) => sayAt(key, text, at));
  const sideMissions = createSideMissions(scene, groundHeight, reachable);
  const receivers = RECEIVERS.map((r) => ({ ...r, ...reachable(r) }));

  const walker = makePerson();
  const heroLook = createHeroLook(walker.group);
  // The player's ragdoll is dressed exactly like the standing player.
  setStyle(PLAYER_LOOK, walker.style);
  scene.add(walker.group);
  let bikeId: BikeId = 'scooter';
  let bike = makeBike(bikeId, bikeById(bikeId).color);
  const rider = makePerson('#ed763e', true);
  seatOn(rider, 'scooter', MOTO_HIP, BIKE_SCALE);
  rider.group.visible = false;
  bike.group.add(rider.group);
  scene.add(bike.group);
  // A passenger rides pillion for taxi missions (in a helmet, as the law says).
  const passenger = makePerson('#6f86a8', true, '#2a2220', 'rider');
  seatOn(passenger, 'pillion', PILLION_HIP, BIKE_SCALE);
  passenger.group.visible = false;
  bike.group.add(passenger.group);
  const youLabel = makeLabel('BẠN', '#fff4da', '#245442');
  youLabel.scale.set(2.4, 0.6, 1);
  scene.add(youLabel);
  const guns = new Map<WeaponId, { group: THREE.Group; muzzle: THREE.Object3D }>();
  const riderGuns = new Map<WeaponId, THREE.Group>();
  for (const id of ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const) {
    const gun = makeGun(id);
    holdGun(walker, id, gun.group);
    gun.group.visible = false;
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.1, gun.length);
    gun.group.add(muzzle);
    guns.set(id, { group: gun.group, muzzle });
    const riderGun = holdGun(rider, id, makeGun(id).group) as THREE.Group;
    riderGun.visible = false;
    riderGuns.set(id, riderGun);
  }
  walker.group.traverse((o) => { o.castShadow = false; });
  // The player at the wheel of the hire boat, in its driver's seat (a little forward, to reach the wheel).
  const helm = makePerson('#e77641');
  seatOn(helm, 'helm', [boats.rental.seat[0], 0.7, boats.rental.seat[2] + 0.18]);
  helm.group.visible = false;
  boats.rental.group.add(helm.group);
  // A ram-air canopy: seven cells in an arc above the jumper, on lines down to the harness.
  const canopy = new THREE.Group();
  {
    const cellMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide });
    for (let k = 0; k < 7; k++) {
      const a = (k - 3) * 0.17;
      const cell = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 2.3), cellMaterial.clone());
      (cell.material as THREE.MeshStandardMaterial).color.set(['#d8322a', '#f4f1e6', '#1f5a8a', '#f4c430', '#1f5a8a', '#f4f1e6', '#d8322a'][k]);
      cell.position.set(Math.sin(a) * 6.2, 5.6 + Math.cos(a) * 1.2, 0.2);
      cell.rotation.z = -a;
      cell.castShadow = true;
      canopy.add(cell);
    }
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#3a3a3a' });
    const points: THREE.Vector3[] = [];
    for (const k of [-3, -1, 1, 3]) for (const zz of [-0.8, 1.2]) {
      const a = k * 0.17;
      points.push(new THREE.Vector3(Math.sign(k) * 0.25, 1.75, 0), new THREE.Vector3(Math.sin(a) * 6.2, 5.4 + Math.cos(a) * 1.2, zz));
    }
    canopy.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    canopy.visible = false;
    scene.add(canopy);
  }
  let horizontalInput = 0;
  // The player in a vehicle taken from the street: the holder sits on the seat's hip point (metres).
  const seatHolder = new THREE.Group();
  const seated = makePerson('#e77641');
  let seatedKind: SeatKind | null = null;
  seatHolder.add(seated.group);
  seatHolder.visible = false;
  seatHolder.traverse((o) => { o.castShadow = false; });
  scene.add(seatHolder);
  const seatedGuns = new Map<WeaponId, THREE.Group>();
  for (const id of ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const) {
    const gun = holdGun(seated, id, makeGun(id).group) as THREE.Group;
    gun.visible = false;
    seatedGuns.set(id, gun);
  }
  // Handcuffs round the wrists during an arrest.
  const cuffMaterial = new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.8, roughness: 0.3 });
  const cuffs = [walker.handLeft, walker.handRight].map((hand) => {
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12), cuffMaterial);
    cuff.position.set(0, 0.02, 0);
    cuff.rotation.x = Math.PI / 2;
    cuff.visible = false;
    hand.add(cuff);
    return cuff;
  });

  // Shopkeeper hands over the coffee; a receiver waits at each delivery address.
  const shopkeeper = makePerson('#c96f6f', false, '#2a2220', 'vendor');
  shopkeeper.group.position.set(SHOPKEEPER.x, groundHeight(SHOPKEEPER.x, SHOPKEEPER.z), SHOPKEEPER.z);
  shopkeeper.group.rotation.y = SHOPKEEPER.yaw;
  scene.add(shopkeeper.group);
  const receiver = makePerson('#6f86a8', false, '#3a2a22');
  const receiverCup = holdCup(receiver.handRight);
  receiverCup.visible = false;
  receiver.group.visible = false;
  scene.add(receiver.group);
  const shopkeeperCup = holdCup(shopkeeper.handRight);
  for (const person of [shopkeeper.group, receiver.group]) person.traverse((o) => { o.castShadow = false; });

  const missionRing = makeRing('#db683f', '#a33e1e');
  const marker = missionRing.group;
  const pin = new THREE.Group();
  const cone = cylinder(pin, 0.5, 0, 0.9, [0, 0, 0], missionRing.mat, 4);
  cone.rotation.y = Math.PI / 4;
  const coffeeIcon = new THREE.Group();
  const cup = cylinder(coffeeIcon, 0.39, 0.3, 0.7, [0, 0.93, 0], material('#fff2d0'), 10);
  cylinder(coffeeIcon, 0.42, 0.42, 0.1, [0, 1.32, 0], material('#537764'), 10);
  box(coffeeIcon, [0.06, 0.4, 0.06], [0.12, 1.52, 0], material('#344f40'));
  cup.rotation.z = 0.12;
  const parcelIcon = new THREE.Group();
  box(parcelIcon, [1, 0.85, 0.85], [0, 1.05, 0], material('#d6a466'));
  box(parcelIcon, [0.18, 0.87, 0.87], [0, 1.05, 0], material('#fff0ce'));
  const flagIcon = new THREE.Group();
  cylinder(flagIcon, 0.045, 0.045, 1.5, [-0.3, 1.05, 0], material('#fff0ce'), 6);
  box(flagIcon, [0.9, 0.55, 0.06], [0.15, 1.5, 0], material('#e77641'));
  const cleanupIcon = new THREE.Group();
  sphere(cleanupIcon, 0.47, [0, 1, 0], material('#416c54'));
  cylinder(cleanupIcon, 0.12, 0.25, 0.3, [0, 1.44, 0], material('#7ba27b'), 6);
  pin.add(coffeeIcon, parcelIcon, flagIcon, cleanupIcon);
  pin.position.y = 2.7;
  for (const icon of [coffeeIcon, parcelIcon, flagIcon, cleanupIcon]) icon.scale.setScalar(0.75);
  marker.add(pin);
  let missionLabel = makeLabel('NHẬN CÀ PHÊ', '#f6cf71', '#493d23');
  missionLabel.position.y = 4.6;
  marker.add(missionLabel);
  scene.add(marker);
  /** Place labels: hidden behind buildings (depth tested, drawn after the city) and faded out between 25 and 45 m. */
  const placeLabels: THREE.Sprite[] = [];
  const placeRing = (color: string, emissive: string, text: string, bg: string, at: { x: number; z: number }) => {
    const ring = makeRing(color, emissive, 2);
    const label = makeLabel(text, bg);
    (label.material as THREE.SpriteMaterial).depthTest = true;
    label.renderOrder = 3;
    placeLabels.push(label);
    label.position.y = 3.4;
    ring.group.add(label);
    ring.group.position.set(at.x, 0, at.z);
    ring.group.traverse((o) => { o.castShadow = false; });
    scene.add(ring.group);
    return ring;
  };
  const storeRing = placeRing('#3f6f9f', '#1d3f63', 'TIỆM SÚNG', '#2f4a6b', STORE);
  const bikeShopRing = placeRing('#5e927c', '#2f5a48', 'CỬA HÀNG XE MÁY', '#2f5a48', BIKE_SHOP);
  const hospitalRing = placeRing('#e05a5a', '#8a2020', 'BỆNH VIỆN · HỒI MÁU', '#a03030', LANDMARKS.hospital);
  // The nightlife strip's doors (counters.ts places, 1.6 m out): walk in with E.
  const venueDoors = PLACES.filter((p) => p.kind === 'venue').map((p) => {
    const neon = PLOTS[p.building].signColor;
    return { kind: p.key as VenueRoom, name: p.name, at: { x: p.x, z: p.z }, ring: placeRing(neon, neon, `${p.name} · 18+`, '#1a0b16', p) };
  });
  const scratchLabel = new THREE.Vector3();
  /** Opening hours of the nightlife doors (the spa by day too, the nhà nghỉ round the clock); past 24 runs over midnight. */
  const VENUE_HOURS: Record<VenueRoom, Hours> = { bar: [[17, 27]], karaoke: [[14, 26]], club: [[20, 28]], spa: [[9, 23]], motel: [[0, 24]] };
  // Downtown and the river: speedboats for hire at two docks, the observation deck and the bank.
  const activityRings = [
    ...SCENERY.docks.filter((d) => d.rental).map((d) => placeRing('#2f86c6', '#1d4f7a', 'THUÊ CA NÔ', '#1d4f7a', d.ring)),
    placeRing('#7d5ba6', '#4a2f6b', 'ĐÀI QUAN SÁT · NHẢY DÙ', '#4a2f6b', LANDMARKS.tower.door),
    placeRing('#2f7a3a', '#1d4a24', 'NGÂN HÀNG PHƯƠNG NAM', '#1d4a24', LANDMARKS.bank.door),
  ];
  for (const ring of activityRings) ring.group.position.y = groundHeight(ring.group.position.x, ring.group.position.z);
  // ATMs and drinks machines (counters.ts spots): one instanced cabinet and one lit panel, solid to walk into.
  const kiosks = [...ATM_SPOTS.map((a) => ({ ...a, atm: true })), ...VENDING_SPOTS.map((v) => ({ ...v, atm: false }))];
  const kioskBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.9, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), kiosks.length);
  const kioskFace = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.66, 0.04), new THREE.MeshBasicMaterial({ toneMapped: false }), kiosks.length);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), c = new THREE.Color();
    kiosks.forEach((k, i) => {
      const g = groundHeight(k.x, k.z);
      q.setFromAxisAngle(UP, k.yaw);
      kioskBody.setMatrixAt(i, m.compose(p.set(k.x, g + 0.95, k.z), q, ONE));
      kioskBody.setColorAt(i, c.set(k.atm ? '#2c6a52' : '#b8372d'));
      kioskFace.setMatrixAt(i, m.compose(p.set(k.x + Math.sin(k.yaw) * 0.36, g + 1.32, k.z + Math.cos(k.yaw) * 0.36), q, ONE));
      kioskFace.setColorAt(i, c.set(k.atm ? '#8fd3ff' : '#ffe9b0'));
      const side = Math.abs(Math.sin(k.yaw)) > 0.5;
      // A collider as the reference, so bodies (ragdoll.ts reads the shared index) hit the kiosk too.
      const box = { minX: k.x - (side ? 0.35 : 0.45), minZ: k.z - (side ? 0.45 : 0.35), maxX: k.x + (side ? 0.35 : 0.45), maxZ: k.z + (side ? 0.45 : 0.35), top: g + 1.9 };
      solids.add(box.minX, box.minZ, box.maxX, box.maxZ, -Infinity, Infinity, OWNER.legacy, box);
    });
    kioskBody.castShadow = kioskBody.receiveShadow = true;
    scene.add(kioskBody, kioskFace);
  }
  // Roller shutters (cửa cuốn) over the fronts of the shophouse counters: pulled down outside opening hours (and for
  // good in zombie mode), so a closed shop reads as closed from the street (design-real C3). One instanced draw.
  const shutterPlaces = PLACES.filter((p) => p.kind === 'counter' && p.building >= 0 && !p.id.startsWith('dk:') && ['legacy', 'home', 'shop', 'midrise', 'kiosk'].includes(worldPlot(p.building).style));
  const shutterTexture = (() => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#a7aeb0'; g.fillRect(0, 0, 8, 64);
    for (let y = 0; y < 64; y += 8) { g.fillStyle = '#7f878a'; g.fillRect(0, y, 8, 2); g.fillStyle = '#c3c8c9'; g.fillRect(0, y + 2, 8, 1); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 6);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const shutterGeometry = new THREE.BoxGeometry(1, 1, 1);
  shutterGeometry.translate(0, -0.5, 0);
  const shutters = new THREE.InstancedMesh(shutterGeometry, new THREE.MeshStandardMaterial({ map: shutterTexture, roughness: 0.55, metalness: 0.35 }), Math.max(1, shutterPlaces.length));
  shutters.receiveShadow = true;
  scene.add(shutters);
  const shutterFrames = shutterPlaces.map((p) => {
    const b = worldBuilding(p.building), fx = Math.sin(b.facing), fz = Math.cos(b.facing), ax = Math.cos(b.facing), az = -Math.sin(b.facing);
    const wx = b.door.x - fx * 0.8, wz = b.door.z - fz * 0.8, along = (b.x - wx) * ax + (b.z - wz) * az;
    const height = Math.min(3, worldPlot(p.building).h - 0.5);
    return { key: p.key, x: wx + ax * along + fx * 0.07, z: wz + az * along + fz * 0.07, yaw: b.facing, width: Math.max(1.6, Math.min(b.w - 0.7, 9)), top: groundHeight(b.door.x, b.door.z) + height, height };
  });
  let shutterState = '', shutterHour = -1, shutterZombie = false;
  function updateShutters(hour: number) {
    if (hour === shutterHour && zombieMode === shutterZombie) return;
    shutterHour = hour; shutterZombie = zombieMode;
    const down = shutterFrames.map((s) => zombieMode || !isOpen(COUNTERS[s.key].hours, hour));
    const key = down.map((d) => (d ? 1 : 0)).join('');
    if (key === shutterState) return;
    shutterState = key;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    shutterFrames.forEach((s, i) => {
      q.setFromAxisAngle(UP, s.yaw);
      // Rolled up it is just the drum under the awning.
      shutters.setMatrixAt(i, m.compose(p.set(s.x, s.top, s.z), q, sc.set(s.width, down[i] ? s.height : 0.22, down[i] ? 0.06 : 0.3)));
    });
    shutters.instanceMatrix.needsUpdate = true;
    shutters.computeBoundingSphere();
  }
  // The focus marker: a small white diamond over whatever E would use now, and a soft ring under it (red for a crime).
  const focusMark = new THREE.Group();
  const focusDiamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false }));
  focusDiamond.scale.set(1, 1.6, 1);
  focusDiamond.renderOrder = 9;
  const focusHalo = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.6, 40), new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.45, depthWrite: false }));
  focusHalo.rotation.x = -Math.PI / 2;
  focusMark.add(focusDiamond, focusHalo);
  focusMark.visible = false;
  scene.add(focusMark);
  /** A takeaway drink in the player's right hand. */
  const walkerCup = holdCup(walker.handRight);
  walkerCup.visible = false;
  /** A tipsy spell after drinks: the camera sways and walking wanders until this time. */
  let drunkUntil = 0;
  marker.traverse((o) => { o.castShadow = false; });

  const peers = new Map<string, Peer>();
  const peerClock = createSnapshotClock();
  const state: PlayerState = { x: START.x, z: START.z, angle: Math.PI / 2, riding: false, speed: 0, score: 0 };
  let bikeX = BIKE_START.x;
  let bikeZ = BIKE_START.z;
  let bikeAngle = Math.PI / 2;
  let bikeHealth = bikeById(bikeId).health;
  let playerCar: Car | null = null;
  let health = MAX_HEALTH;
  let lastDamage = -99;
  let active = false;
  // A game is running (false on the start screen): while an overlay pauses input the camera stays with the player.
  let started = false;
  // An opaque overlay (the big map) hides the street: the world keeps going but nothing is drawn.
  let covered = false;
  let disposed = false;
  const missions = createMissions();
  let missionLabelKey = '';
  let receiverHappyUntil = 0;
  let receiverSpot: { x: number; z: number } | null = null;
  let velocity = 0;
  let steer = 0;
  // Vehicle physics: world-space velocity (so cars can slide), yaw rate, and whether we were driving last frame.
  let carVX = 0;
  let carVZ = 0;
  let yawRate = 0;
  let wasDriving = false;
  let lean = 0;
  let frame = 0;
  let previousTime = performance.now();
  let hudTime = 0;
  let lastHud = '';
  let notificationUntil = 0;
  let notification = '';
  let banner = '';
  let bannerUntil = 0;
  let walkClock = 0;
  let gallop = 0;
  let cash = 0;
  let deliveries = 0;
  let weapon: WeaponId = 'fists';
  const owned = new Set<WeaponId>(['fists']);
  const ammo = new Map<WeaponId, { mag: number; reserve: number }>();
  let reloadUntil = 0;
  let reloadWeapon: WeaponId | null = null;
  let playerBody: RagdollBody | null = null;
  let down: Down = null;
  let downUntil = 0;
  let lastShot = 0;
  let firingUntil = 0;
  let aimUntil = 0;
  let aimYaw = 0;
  let punchUntil = 0;
  let triggerQueued = false;
  let mouseHeld = false;
  let pointerInside = false;
  let pointerLockFailed = false;
  let shake = 0;
  let bagOpen = false;
  let manualCameraAt = -99;
  let smokeAt = 0;
  let stumpAt = 0;
  let gunfireCrimeAt = 0;
  let gangKnocks = 0;
  let stunUntil = 0;
  // Height above the ground and vertical speed of a jump on foot.
  let jumpY = 0;
  let jumpV = 0;
  let flatTires = false;
  // The river: swimming, the hired speedboat, and dropping off a pier or over the railing into the water.
  let swimming = false;
  let boat: Boat | null = null;
  let boatVX = 0, boatVZ = 0, boatTurn = 0, boatLeftAt = 0;
  let bodyY = 0, fallV = 0, splashAt = 0, boatHitAt = 0;
  // The observation deck on the supertall, and the parachute jump off it.
  let glide: { phase: 'deck' | 'fall' | 'chute'; y: number; vy: number; speed: number; since: number } | null = null;
  // A bank job in progress, and when the bank can be hit again.
  let heist: { started: number; until: number } | null = null;
  let bankReadyAt = 0;
  // Seconds the player has been somewhere they cannot move from (squeezed past a fence, inside a wall).
  let stuckFor = 0;
  // Giving up to the police, being pinned after a tackle, choking in tear gas, and the arrest clock.
  let surrendered = false;
  let pinnedUntil = 0;
  let gassedUntil = 0;
  let bustedAt = 0;
  let coughAt = 0;
  const gasClouds: { x: number; z: number; born: number; until: number; next: number }[] = [];
  const flatCars = new Set<Car>();
  let thief: Npc | null = null;
  let passengerAboard = false;
  /** Local test hook (__pvo.act): a passenger on the pillion without a taxi mission. */
  let testPassenger = false;
  let sideView: SideMissionView = null;
  const looseBodies: { body: RagdollBody; until: number }[] = [];
  const wrecks = new Set<Car>();
  const pendingBlasts: { car: Car; at: number }[] = [];
  const pendingHits: OutgoingHit[] = [];
  const lastPower: { kind: HeroId; x: number; y: number; z: number; seq: number } = { kind: 'none', x: START.x, y: 1.1, z: START.z, seq: 0 };
  let shieldFlight: { from: PowerPoint; to: PowerPoint; previous: PowerPoint; started: number; hits: Set<unknown> } | null = null;
  const keys = new Set<string>();
  const cameraTarget = new THREE.Vector3(state.x, 0.7, state.z);
  const desiredTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const view = { ...CAMERA_DEFAULT };
  const smoothView = { ...CAMERA_DEFAULT };
  const cameraMode = createCameraMode();
  const firstLookAt = new THREE.Vector3();
  const restoredVisibility: { object: THREE.Object3D; visible: boolean }[] = [];
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const aimProbe = new THREE.Vector3();
  const reticlePoint = new THREE.Vector3();
  const pointerPx = new THREE.Vector2();
  /** Extra spread from firing fast; it settles back within a fraction of a second. */
  let bloom = 0;
  let hitMarkAt = 0;
  let headMark = false;
  const hitPoint = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const playerPoint = new THREE.Vector3();
  const blastPoint = new THREE.Vector3();
  const crossing: { x: number; z: number; body?: boolean }[] = [];
  const viewFrustum = new THREE.Frustum(), viewMatrix = new THREE.Matrix4();

  function offsetFor(yaw: number, pitch: number, dist: number, out: THREE.Vector3) {
    return out.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  }
  function firstPerson() {
    return firstPersonAllowed(cameraMode.mode, { running: active || started, interior: !!interior, counter: !!menu?.anchor, down: !!down });
  }
  function exitLookLock() { if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.(); }
  function toggleCameraMode() {
    cameraMode.toggle(state.angle); exitLookLock();
    triggerQueued = false; mouseHeld = false;
    notify(cameraMode.mode === 'first-person' ? 'Góc nhìn thứ nhất · nhấp vào phố để giữ chuột, Esc thả chuột · B đổi góc nhìn' : 'Góc nhìn thứ ba · giữ chuột phải để xoay · B đổi góc nhìn', 3500);
    emitHud(performance.now());
  }
  function eyePose() {
    let x = state.x, y = bodyY + jumpY + powers.altitude, z = state.z, kind: EyeKind = 'foot';
    if (ride) { const s = ride.seat(); x = s.x; y = s.y; z = s.z; kind = 'passenger'; }
    else if (seat) { y = groundHeight(seat.x, seat.z) + seat.top; kind = 'seat'; }
    else if (state.riding && playerCar) {
      const hip = playerCar.kind === 'moto' ? MOTO_HIP : seatOf(playerCar), c = Math.cos(state.angle), s = Math.sin(state.angle);
      x += hip[0] * c + hip[2] * s; z += -hip[0] * s + hip[2] * c;
      y = groundHeight(state.x, state.z) + hip[1]; kind = playerCar.kind === 'moto' ? 'scooter' : 'car';
    } else if (state.riding) { y = groundHeight(state.x, state.z) + (bikeId === 'horse' ? 1.6 : 0.72); kind = 'scooter'; }
    else if (boat) { y = waterLevel(state.x, state.z); kind = 'boat'; }
    else if (swimming) { y = waterLevel(state.x, state.z); kind = 'swim'; }
    else if (glide) { y = glide.y; kind = 'glide'; }
    return firstPersonPose({ x, y, z, kind }, cameraMode.yaw, cameraMode.pitch);
  }
  function centerAim(range: number, out: THREE.Vector3) {
    const pose = eyePose();
    rayOrigin.set(pose.eye.x, pose.eye.y, pose.eye.z); rayDir.set(pose.direction.x, pose.direction.y, pose.direction.z);
    return out.copy(rayOrigin).addScaledVector(rayDir, Math.max(0.1, wallDistance(rayOrigin, rayDir, range)));
  }
  camera.position.copy(cameraTarget).add(offsetFor(view.yaw, view.pitch, view.dist, cameraOffset));
  camera.lookAt(cameraTarget);

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const monitor = createFrameMonitor();
  const levelFailures = new Map<number, number>();
  const levelBlockedUntil = new Map<number, number>();
  let shadowsAllowed = false;
  // The sun's shadow camera is centred on a 48 m grid point near the player; moving to another one re-renders the
  // (otherwise static) shadow map. The light sits 300 m out along the sun direction so tall towers fit.
  const shadowCentre = new THREE.Vector3(1e9, 0, 0);
  function followShadows(x: number, z: number) {
    const cx = Math.round(x / 48) * 48, cz = Math.round(z / 48) * 48;
    const moved = cx !== shadowCentre.x || cz !== shadowCentre.z;
    if (moved) shadowCentre.set(cx, 0, cz);
    sun.position.multiplyScalar(3).add(shadowCentre);
    sun.target.position.copy(shadowCentre);
    sun.target.updateMatrixWorld();
    return moved;
  }
  function applyShadows() {
    // Shadows only on presets that can afford them, fading out as night falls. Night fades the shadow's intensity
    // instead of switching castShadow off: that would recompile every lit material in the middle of a game.
    const preset = QUALITY_LEVELS[level];
    const want = preset.shadows;
    const fade = THREE.MathUtils.clamp((0.6 - atmosphere.night) / 0.12, 0, 1);
    sun.shadow.intensity = fade;
    if (sun.castShadow !== want || (want && sun.shadow.mapSize.x !== preset.shadowSize)) {
      sun.castShadow = want;
      if (want) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      }
      renderer.shadowMap.needsUpdate = true;
    }
    shadowsAllowed = want && fade > 0;
  }
  // Every program the street needs compiles in parallel before the first frame is drawn (KHR_parallel_shader_compile
  // where the driver has it): the first frames do not stall for hundreds of milliseconds compiling them one by one.
  let compiled = false, compiling = 0;
  /** Instanced meshes in the scene (rescanned every 60 frames) and those hidden for the frame because they are empty. */
  const instanced: THREE.InstancedMesh[] = [], emptied: THREE.InstancedMesh[] = [];
  let emptyScan = 60;
  function warmPrograms() {
    const n = ++compiling;
    compiled = false;
    renderer.compileAsync(scene, camera).catch(() => { /* compiled on first use instead */ }).finally(() => { if (n === compiling) compiled = true; });
    setTimeout(() => { if (n === compiling) compiled = true; }, 4000);
  }
  function applyLevel(next: number) {
    level = THREE.MathUtils.clamp(next, 0, QUALITY_LEVELS.length - 1);
    const preset = QUALITY_LEVELS[level];
    applyShadows();
    renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, preset.maxDpr) * preset.scale));
    // Crowd figures: 'hi' on the better presets, 'lo' (mitten hands, coarser limbs and heads) on the fast ones.
    // Zombies drop to 'lo' a level earlier (they take the level to decide); vehicle occupants are always 'lo'.
    npcs.setDetail(preset.figures);
    police.setDetail(preset.figures);
    zombies.setDetail(preset.figures, level);
    // Ragdolls: body cap, solver iterations and how many step at full rate; figures like the crowd's.
    ragdolls.setQuality(level);
    ragdolls.setDetail(preset.figures);
    // Street dressing (fine layer, smoke, patterns, cables) and street-life props follow the same level.
    world.setDetail(level);
    npcs.setPropDetail(level);
    // The lane fleet's cap (design-engine §8: 60 / 45 / 30 vehicles by preset).
    vehicles.setQuality(level);
  }
  applyLevel(level);
  renderer.shadowMap.needsUpdate = true;
  // A district tile appearing re-renders the (otherwise static) shadow map; the district materials compile now, in
  // their final variant (the quality level patches walls and paving), off the first frames.
  world.attach(renderer, camera, { discrete: !isIntegratedGpu(gpu) });
  // After createGame returns: the page sets its saved quality level first (which swaps figure materials), so the
  // programs compile once, in their final variants, and no material is disposed while compileAsync waits on it.
  setTimeout(warmPrograms, 0);

  function adaptQuality(now: number, interval: number) {
    const verdict = monitor.sample(now, interval);
    if (qualityMode !== 'auto' || !verdict) return;
    if (verdict < 0 && level < QUALITY_LEVELS.length - 1) {
      // Remember failures so automatic mode does not bounce back into a level that just stuttered.
      const failures = (levelFailures.get(level) ?? 0) + 1;
      levelFailures.set(level, failures);
      levelBlockedUntil.set(level, now + 15000 * 2 ** Math.min(failures, 5));
      applyLevel(level + 1);
    } else if (verdict > 0 && level > 0 && (levelBlockedUntil.get(level - 1) ?? 0) < now) {
      applyLevel(level - 1);
    }
  }

  function distance(target: { x: number; z: number }) {
    return Math.hypot(state.x - target.x, state.z - target.z);
  }

  /** World and parked/moving vehicles, ignoring the one the player is driving. */
  function clearAt(x: number, z: number, radius: number) {
    return worldClear(x, z, radius) && !vehicles.blocked(x, z, radius, playerCar);
  }

  /**
   * A vehicle footprint approximated by three circles along its length, against walls and props. Other vehicles
   * are not walls: driving into one is a collision (see crashInto).
   */
  function vehicleClear(x: number, z: number, angle: number) {
    const fx = Math.sin(angle), fz = Math.cos(angle);
    if (playerCar && playerCar.kind !== 'moto') return worldClear(x, z, 1.05) && worldClear(x + fx * 1.3, z + fz * 1.3, 1.0) && worldClear(x - fx * 1.3, z - fz * 1.3, 1.0);
    return worldClear(x, z, 0.45) && worldClear(x + fx * 0.65, z + fz * 0.65, 0.35) && worldClear(x - fx * 0.65, z - fz * 0.65, 0.35);
  }

  // ---- Vehicle crashes ----
  const CRASH_LINES = ['Đi kiểu gì vậy hả?!', 'Trời ơi xe tôi!', 'Có biết lái xe không?!', 'Đứng lại đền tiền đi!', 'Mắt để đâu vậy?!', 'Bằng lái mua à?!'];
  let crashSoundAt = 0, hornAt = 0;
  /** Pushes the player's vehicle into whatever vehicles it touches; momentum, spin and position change on both. */
  function crashInto(now: number, time: number) {
    const kind = playerCar ? playerCar.kind : 'moto';
    const [hw, hl] = vehicles.halfSize(kind);
    const body: Body = { x: state.x, z: state.z, yaw: state.angle, vx: carVX, vz: carVZ, spin: -yawRate, mass: playerCar ? MASS[kind] : bikeId === 'horse' ? 520 : MASS.moto, hw, hl };
    const crashes = vehicles.collideBody(body, playerCar);
    if (!crashes.length) return;
    carVX = body.vx;
    carVZ = body.vz;
    yawRate = -body.spin;
    if (vehicleClear(body.x, body.z, state.angle)) { state.x = body.x; state.z = body.z; }
    velocity = carVX * Math.sin(state.angle) + carVZ * Math.cos(state.angle);
    for (const crash of crashes) handleCrash(crash, now, time, true);
  }
  /** Sparks, flying debris, the bang, damage, riders thrown off, angry drivers and a horn. */
  function handleCrash(e: Crash, now: number, time: number, player: boolean) {
    const strength = e.impact;
    const distanceToPlayer = Math.hypot(e.x - state.x, e.z - state.z);
    hitPoint.set(e.x, 0.75, e.z);
    if (strength > 2.5) effects.sparks(hitPoint, rayDir.set(-e.nz, 0.2, e.nx), Math.min(28, Math.round(strength * 2.2)));
    if (strength > 4) {
      const pieces = Math.min(10, Math.round(strength * 0.8));
      effects.debris(hitPoint, rayDir.set(e.nx, 0, e.nz), pieces, vehicles.paintOf(e.b));
      effects.debris(hitPoint, rayDir.set(-e.nx, 0, -e.nz), pieces, e.a ? vehicles.paintOf(e.a) : playerCar ? vehicles.paintOf(playerCar) : bikeById(bikeId).color);
    }
    if (distanceToPlayer < 75 && now > crashSoundAt) {
      crashSoundAt = now + 140;
      playCrash(Math.min(1, strength / 14) * (1 - distanceToPlayer / 90));
    }
    if (player || distanceToPlayer < 18) shake = Math.max(shake, Math.min(0.6, strength * 0.035 * (player ? 1 : 0.4)));
    const harm = Math.max(0, strength - 2.5);
    for (const car of [e.a, e.b]) if (car && car !== playerCar && harm > 0) damageCar(car, harm * (car.kind === 'moto' ? 7 : 4), now);
    if (player && harm > 0) damageVehicle(harm * (inCar() ? 3.5 : 6), now);
    for (const car of [e.a, e.b]) {
      if (!car || car === playerCar || !car.driver) continue;
      if (car.kind === 'moto' && car.fallen) throwRider(car, e, strength, time);
      else if (car.kind !== 'moto' && strength > 2 && Math.random() < 0.7) {
        bubbles.say(`car${car.kind}${car.index}`, CRASH_LINES[Math.floor(Math.random() * CRASH_LINES.length)], now, () => ({ x: car.x, y: 2.4, z: car.z }), 2200, 'shout');
        if (now > hornAt && distanceToPlayer < 50) { hornAt = now + 900; playHorn(strength > 6); }
      }
    }
    if (strength > 8) npcs.notice(e.x, e.z, 'crash', time);
    // On two wheels a hard hit throws the player off.
    if (player && state.riding && !inCar() && strength > 7.5) crash(now);
  }
  /** A rider thrown off a motorbike that went down: a ragdoll flung along the hit, left lying for a while. */
  function throwRider(car: Car, e: Crash, strength: number, time: number) {
    const look = car.driver!;
    car.driver = null;
    const away = e.b === car ? 1 : -1;
    // Thrown from the saddle (the hips start on the seat), limp after a violent crash.
    const body = ragdolls.spawn({
      x: car.x, y: groundHeight(car.x, car.z) + MOTO_RIDER.hip[1] - FIGURE.seatClear * RAGDOLL_SCALE, z: car.z, yaw: car.yaw, scale: RAGDOLL_SCALE, look, from: 'sit',
      velocity: { x: car.vx + e.nx * away * strength * 0.5, y: 2.5 + strength * 0.25, z: car.vz + e.nz * away * strength * 0.5 },
      mode: strength > 9 ? 'limp' : undefined,
    });
    looseBodies.push({ body, until: time + 16 });
    if (strength > 9) effects.blood(hitPoint.set(car.x, 1, car.z), rayDir.set(e.nx * away, 0, e.nz * away), 6);
  }

  // ---- Red lights: a cruiser nearby will not let it go. ----
  let lightGap = Infinity, lightApproach = -1;
  /**
   * Crossing a stop line of the live roads (map/world-types.ts: today's grid and the wired districts' junctions) on red,
   * riding faster than 4 m/s along the road, with the police within 55 m: a crime.
   */
  function checkRedLight(time: number) {
    if (!state.riding || Math.abs(velocity) < 4) { lightGap = Infinity; return; }
    const roads = worldRoads().roads;
    const h = roads.nearestEdge(state.x, state.z, 14, (e) => e.traffic && e.cls !== 'hem');
    if (!h || h.d > h.edge.half + 1) { lightGap = Infinity; return; }
    // Which way along the road (riding across it is not running its lights).
    const sign = Math.sign(velocity) || 1, along = (Math.sin(state.angle) * h.hx + Math.cos(state.angle) * h.hz) * sign;
    if (Math.abs(along) < 0.6) { lightGap = Infinity; return; }
    const e = h.edge, dir = along > 0 ? 1 : -1, node = roads.nodes[dir > 0 ? e.b : e.a];
    const arm = node.arms.find((a) => a.edge === e.id && a.end === (dir > 0 ? 1 : 0));
    if (node.control !== 'signal' || !arm || arm.approach < 0) { lightGap = Infinity; return; }
    const gap = (dir > 0 ? e.len - h.s : h.s) - arm.setback;
    if (arm.approach === lightApproach && lightGap > 0 && gap <= 0 && gap > -4 && nodeLight(node.id, arm.group, time) === 'red') {
      let seen = false;
      police.forEachUnit((x, z) => { if (Math.hypot(x - state.x, z - state.z) < 55) seen = true; });
      if (seen) { police.crime(1, time); notify('Vượt đèn đỏ ngay trước mặt cảnh sát!', 2500); }
    }
    lightApproach = arm.approach;
    lightGap = gap;
  }

  /** Open water a swimmer can be in: inside the buoys and beside (not under) the piers or a moored ship's hull; the steps lead out. */
  function swimClear(x: number, z: number) {
    if (!inWater(x, z, 0.35)) { const d = dockAt(x, z); return !!d && inRect(d.steps, x, z); }
    return !pierNear(x, z, 0.35) && !hullAt(x, z, 0.35);
  }
  /**
   * Where the player on foot can go: the land (clear of everything), the docks, or off a dock into the river; on a
   * quay with no railing (a wharf) right up to its edge and over it into the water.
   */
  function footClear(x: number, z: number) {
    if (swimming) return swimClear(x, z) && !boats.hit(x, z, 0.35);
    if (clearAt(x, z, 0.4) || dockAt(x, z)) return true;
    if (openEdge(x, z) && !wetAt(x, z) && solids.clear(x, z, 0.4)) return true;
    if (openEdge(state.x, state.z) && wetAt(x, z) && !hullAt(x, z, 0.35)) return true;
    return dockAt(state.x, state.z) !== null && swimClear(x, z);
  }
  /** The hire boat's hull at a spot: three points along it in open water, clear of the other boats. */
  function boatClear(x: number, z: number, yaw: number) {
    const fx = Math.sin(yaw) * 2.6, fz = Math.cos(yaw) * 2.6;
    return navigable(x, z, 1.15) && navigable(x + fx, z + fz, 0.9) && navigable(x - fx, z - fz, 0.9)
      && !boats.hit(x, z, 1.1, boat) && !boats.hit(x + fx, z + fz, 0.9, boat) && !boats.hit(x - fx, z - fz, 0.9, boat);
  }

  function notify(text: string, duration = 2500) {
    notification = text;
    notificationUntil = performance.now() + duration;
  }
  function showBanner(text: string, now: number, duration = RESPAWN_MS) {
    banner = text;
    bannerUntil = now + duration;
  }

  function isMotorbike() {
    return state.riding && (playerCar === null || playerCar.kind === 'moto') && !(playerCar === null && bikeId === 'horse');
  }

  function missionPlayer() {
    return { x: state.x, z: state.z, riding: missions.view().requiresBike ? isMotorbike() : state.riding, down: down !== null || powers.altitude > 0.05 };
  }

  function interruptRace(message: string) {
    const event = missions.update(0, { ...missionPlayer(), down: true });
    if (event) handleMissionEvent({ ...event, message });
  }

  function setMissionLabel() {
    const info = missions.view();
    marker.visible = info.target !== null;
    if (info.target) marker.position.set(info.target.x, groundHeight(info.target.x, info.target.z), info.target.z);
    const key = `${info.id}:${info.step}:${info.status}`;
    if (key === missionLabelKey) return;
    missionLabelKey = key;
    coffeeIcon.visible = info.id === 'coffee';
    parcelIcon.visible = info.id === 'market' || info.id === 'post';
    flagIcon.visible = info.id === 'tour' || info.id === 'circuit';
    cleanupIcon.visible = info.id === 'cleanup';
    marker.remove(missionLabel);
    disposeTree(missionLabel);
    missionLabel = makeLabel(info.label.toLocaleUpperCase('vi'), '#f6cf71', '#493d23');
    missionLabel.position.y = 4.6;
    marker.add(missionLabel);
  }

  function handleMissionEvent(event: MissionEvent | null) {
    if (!event) return;
    let message = event.message;
    if (event.reward) {
      cash += event.reward.cash;
      state.score += event.reward.score;
      if (event.reward.delivery) {
        deliveries++;
        if (deliveries === 1) message += ' Tiệm súng đã mở cửa cho bạn!';
      }
    }
    notify(message, 5500);
    setMissionLabel();
    emitHud(performance.now());
  }

  function equip(id: WeaponId) {
    if (!owned.has(id)) return false;
    weapon = id;
    reloadUntil = 0;
    reloadWeapon = null;
    for (const [gunId, gun] of guns) gun.group.visible = gunId === id;
    for (const [gunId, gun] of riderGuns) gun.visible = gunId === id;
    for (const [gunId, gun] of seatedGuns) gun.visible = gunId === id;
    return true;
  }
  function giveWeapon(id: WeaponId) {
    const def = weaponById(id);
    owned.add(id);
    if (def.magazine) ammo.set(id, { mag: def.magazine, reserve: def.startAmmo });
  }
  function startReload(now: number) {
    const def = weaponById(weapon);
    const rounds = ammo.get(weapon);
    if (!def.magazine || !rounds || rounds.mag >= def.magazine || rounds.reserve <= 0 || reloadWeapon) return;
    reloadUntil = now + def.reload * 1000;
    reloadWeapon = weapon;
  }

  function vehicleKind(): VehicleKind {
    if (boat) return 'boat';
    if (swimming) return 'swim';
    return playerCar ? (playerCar.kind === 'police' ? 'police' : playerCar.kind === 'moto' ? 'scooter' : 'car') : state.riding ? 'scooter' : 'foot';
  }
  function inCar() { return !!playerCar && playerCar.kind !== 'moto'; }

  function damagePlayer(amount: number, now: number, from?: { x: number; z: number }, by?: string) {
    if (down === 'wasted' || down === 'busted') return;
    health = Math.max(0, health - amount);
    lastDamage = now / 1000;
    motion.hitAt = now;
    shake = Math.max(shake, 0.25);
    const dx = from ? state.x - from.x : 0, dz = from ? state.z - from.z : 0, d = Math.hypot(dx, dz) || 1;
    effects.blood(hitPoint.set(state.x, bodyY + jumpY + powers.altitude + (inCar() ? 1.3 : 1.1), state.z), rayDir.set(dx / d, 0, dz / d), inCar() ? 2 : 5);
    if (health <= 0) wasted(now, by);
  }

  function carMax(car: Car) { return car.kind === 'police' ? POLICE_CAR_HEALTH : car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH; }
  function damageCar(car: Car, amount: number, now: number) {
    if (wrecks.has(car)) return;
    car.health = Math.max(0, car.health - amount);
    // A damaged parked vehicle stays a full entity (with its smoke) instead of going back to being only drawn.
    if (car.curb) car.touched = true;
    if (car.health === 0) {
      // Wrecked vehicles burn for a moment and then blow up.
      wrecks.add(car);
      if (car.mode === 'lane' || car.mode === 'chase' || car.mode === 'hold') car.mode = 'parked';
      pendingBlasts.push({ car, at: now + 1600 + Math.random() * 800 });
      explosives.burn(car.x, 1.1, car.z, 2.6, car.kind === 'moto' ? 0.35 : 0.7, now);
    }
  }
  function damageVehicle(amount: number, now: number) {
    if (playerCar) {
      damageCar(playerCar, amount, now);
      if (playerCar.health === 0) notify('Xe sắp nổ! Nhảy ra ngay (E)!', 3000);
    } else {
      const wasRunning = bikeHealth > 0;
      bikeHealth = Math.max(0, bikeHealth - amount);
      if (wasRunning && bikeHealth === 0) notify(bikeId === 'horse' ? 'Ngựa đã kiệt sức! Chữa trị hoặc mua mới ở Cửa hàng xe máy.' : 'Xe máy đã hỏng! Mua xe mới hoặc sửa ở Cửa hàng xe máy.', 4500);
    }
  }

  function leaveVehicleNow() {
    // Knocked off a seat or out of someone else's vehicle too, and any hold-E is dropped.
    if (seat) leaveSeat();
    if (ride) leavePassenger();
    hold = null;
    if (boat) { boat.speed = 0; boat = null; boatLeftAt = performance.now(); }
    if (playerCar) {
      playerCar.mode = 'parked';
      playerCar.speed = 0;
      playerCar = null;
    } else if (state.riding) {
      bikeX = state.x;
      bikeZ = state.z;
      bikeAngle = state.angle;
    }
    state.riding = false;
    velocity = 0;
  }

  /**
   * Throws the player to the ground as a ragdoll; they get up after a moment. `hit` and `kind`: where and what
   * struck them. Knocked down they throw their hands out; wasted they fall limp. The body is never evicted.
   */
  function knockPlayer(vx: number, vy: number, vz: number, now: number, reason: Down = 'crash', hit?: THREE.Vector3 | null, kind?: HitKind) {
    powers.land(); shieldFlight = null;
    closeMenu(true);
    leaveVehicleNow();
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = ragdolls.spawn({
      x: state.x, y: groundHeight(state.x, state.z) + 0.1, z: state.z, yaw: state.angle, scale: RAGDOLL_SCALE, look: PLAYER_LOOK, velocity: { x: vx, y: vy, z: vz },
      hit, kind, mode: reason === 'wasted' ? 'limp' : undefined, keep: true,
    });
    down = reason;
    downUntil = now + (reason === 'wasted' ? RESPAWN_MS : 2600);
    shake = Math.max(shake, 0.5);
    playThud();
  }

  function wasted(now: number, by?: string) {
    if (down === 'wasted') return;
    interruptRace('Bạn đã bị hạ gục. Nhấn M để thử lại vòng đua.');
    knockPlayer((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, now, 'wasted');
    health = 0;
    showBanner('BỊ HẠ GỤC', now);
    notify(by ? `${by} đã hạ gục bạn · Đang đưa vào bệnh viện…` : 'Bạn đã bị hạ gục · Đang đưa vào bệnh viện…', RESPAWN_MS);
    sideMissions.cancel();
  }

  /** A survivor's kit: pistol, shotgun and SMG with spare ammo, and some cash for the gun store. */
  function zombieKit() {
    for (const id of ['pistol', 'shotgun', 'smg'] as WeaponId[]) {
      const def = weaponById(id);
      owned.add(id);
      const rounds = ammo.get(id);
      ammo.set(id, { mag: def.magazine, reserve: Math.max(rounds?.reserve ?? 0, def.startAmmo * 2) });
    }
    cash = Math.max(cash, 300);
    deliveries = Math.max(deliveries, 1);
    equip(weapon === 'fists' ? 'pistol' : weapon);
  }

  /** Switches between the living city and the zombie apocalypse. */
  function setMode(mode: GameMode) {
    const zombie = mode === 'zombie';
    zombieMode = zombie;
    npcs.setEnabled(!zombie);
    police.setEnabled(!zombie);
    vehicles.setTraffic(!zombie, state.x, state.z);
    world.setApocalypse(zombie);
    atmosphere.setApocalypse(zombie);
    torch.visible = zombie;
    marker.visible = !zombie && missions.view().target !== null;
    if (zombie) {
      atmosphere.setHours(16.5);
      sideMissions.cancel();
      zombieKit();
      zombies.start(performance.now() / 1000);
      showBanner('ZOMBIE TRÀN NGẬP KHU PHỐ', performance.now(), 4000);
      notify('Cả khu phố đã biến thành zombie · Sống sót qua từng đợt! Bắn vào đầu để hạ nhanh.', 6000);
    } else zombies.stop();
  }

  function teleport(at: { x: number; z: number }) {
    closeMenu(true);
    if (seat) { if (seat.claim !== null) nx.releaseSeat?.(seat.claim); seat = null; }
    ride = null;
    hold = null;
    const spot = reachable(at);
    Object.assign(state, { x: spot.x, z: spot.z, riding: false, speed: 0 });
    boat = null;
    glide = null;
    swimming = false;
    bodyY = groundHeight(spot.x, spot.z);
    cameraTarget.set(spot.x, 1, spot.z);
  }

  function respawn(now: number) {
    powers.land(); shieldFlight = null;
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = null;
    down = null;
    const fee = Math.round(cash * 0.2);
    cash -= fee;
    police.reset();
    teleport(LANDMARKS.hospital);
    health = MAX_HEALTH;
    if (zombieMode) {
      const run = zombies.stats(now / 1000);
      showBanner(`GỤC Ở ĐỢT ${run.wave} · HẠ ${run.kills} ZOMBIE`, now, 4500);
      notify('Bạn tỉnh lại ở bệnh viện · Lũ zombie lại kéo đến từ đầu!', 4500);
      zombieKit();
      zombies.start(now / 1000);
      return;
    }
    notify(fee ? `Xuất viện · Viện phí ${formatThousands(fee)}` : 'Xuất viện, khỏe lại rồi!', 3500);
    void now;
  }

  function busted(now: number) {
    powers.land(); shieldFlight = null;
    if (down === 'wasted' || down === 'busted') return;
    interruptRace('Bạn đã bị bắt. Nhấn M để thử lại vòng đua.');
    closeMenu(true);
    leaveVehicleNow();
    // A player pinned on the ground is hauled up where they lie.
    if (playerBody) {
      ragdolls.center(playerBody, scratch);
      ragdolls.remove(playerBody);
      playerBody = null;
      if (clearAt(scratch.x, scratch.z, 0.4)) { state.x = scratch.x; state.z = scratch.z; }
    }
    down = 'busted';
    downUntil = now + RESPAWN_MS;
    bustedAt = now;
    surrendered = false;
    police.restrain(state.x, state.z, state.angle);
    showBanner('BỊ BẮT', now);
    notify('Cảnh sát còng tay bạn…', RESPAWN_MS);
    sideMissions.cancel();
  }
  function release() {
    down = null;
    const fine = Math.round(cash * 0.3);
    cash -= fine;
    police.reset();
    teleport(LANDMARKS.police);
    health = Math.max(health, 60);
    notify(fine ? `Được thả khỏi đồn · Nộp phạt ${formatThousands(fine)}` : 'Được thả, lần sau cẩn thận!', 3500);
  }

  function enterCar(car: Car, now: number) {
    const time = now / 1000;
    if (car.mode === 'lane' && car.driver) {
      // Carjacking: the driver is dragged out of the left side (+x, where the seat is: traffic keeps right).
      const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
      const side = car.kind === 'moto' ? 0.8 : 1.4;
      // Pulled off the seat at the size they sat at (car drivers are drawn a little smaller to clear the roof).
      const scale = car.kind === 'moto' ? RAGDOLL_SCALE : CAR_DRIVER.scale;
      const body = ragdolls.spawn({
        x: car.x + rx * side, y: groundHeight(car.x, car.z) + seatOf(car)[1] - FIGURE.seatClear * scale, z: car.z + rz * side, yaw: car.yaw,
        scale, look: car.driver, from: 'sit', velocity: { x: rx * 4.5, y: 2.5, z: rz * 4.5 },
      });
      looseBodies.push({ body, until: time + 10 });
      npcs.alarm(car.x, car.z, 20, time);
      npcs.notice(car.x, car.z, 'fight', time);
      police.crime(2, time);
      notify(car.kind === 'moto' ? 'Cướp xe máy! Cảnh sát đang được gọi tới.' : 'Cướp xe! Cảnh sát đang được gọi tới.', 3000);
      playThud();
    } else if (car.kind === 'police') {
      police.crime(4, time);
      notify('Bạn đã lấy xe cảnh sát!', 3000);
    }
    car.driver = null;
    car.mode = 'player';
    car.speed = 0;
    // Picking up a fallen bike, or getting into a car that had skidded to a stop.
    Object.assign(car, { vx: 0, vz: 0, spin: 0, fallen: false, recoverAt: 0 });
    playerCar = car;
    state.riding = true;
    state.x = car.x;
    state.z = car.z;
    state.angle = car.yaw;
    velocity = 0;
  }

  function exitVehicle() {
    if (Math.abs(velocity) > 3 && !(playerCar && wrecks.has(playerCar))) {
      notify('Hãy giảm tốc trước khi xuống xe');
      return;
    }
    const big = inCar();
    const sideways = big ? 2.3 : 1.3;
    const lengthwise = big ? 3.2 : 1.8;
    // The driver's door first: the seat is on the left (+x), and a bike's side stand is on its left too.
    const offsets = [new THREE.Vector3(sideways, 0, 0), new THREE.Vector3(-sideways, 0, 0), new THREE.Vector3(0, 0, -lengthwise), new THREE.Vector3(0, 0, lengthwise)];
    const leaving = playerCar;
    for (const offset of offsets) {
      offset.applyAxisAngle(UP, state.angle);
      // The vehicle being left still blocks, so test with it excluded.
      if (worldClear(state.x + offset.x, state.z + offset.z, 0.4) && !vehicles.blocked(state.x + offset.x, state.z + offset.z, 0.4, leaving)) {
        if (leaving) {
          if (leaving.mode === 'player') leaving.mode = 'parked';
          leaving.speed = 0;
          playerCar = null;
        } else {
          bikeX = state.x;
          bikeZ = state.z;
          bikeAngle = state.angle;
        }
        state.x += offset.x;
        state.z += offset.z;
        state.riding = false;
        velocity = 0;
        return;
      }
    }
    notify('Chỗ này hơi chật. Tìm khoảng trống để xuống xe.');
  }

  function missionContext(time: number) {
    return {
      x: state.x, z: state.z, inVehicle: state.riding, down: down === 'wasted' || down === 'busted' || powers.altitude > 0.05, time,
      spend: (amount: number) => { if (cash < amount) return false; cash -= amount; return true; },
      spawnThief: (x: number, z: number) => { thief = npcs.spawnThief(x, z, state.x, state.z); return !!thief; },
      thiefDown: () => (!thief ? null : thief.state === 'down' || thief.state === 'away' ? true : thief.state === 'inside' ? null : false),
      gangKnocks,
      gangTurf: (gang: number) => ({ x: npcs.gangs[gang].x, z: npcs.gangs[gang].z }),
    };
  }

  // ---- Interaction (interact.ts): counters, doors, seats, services, people, vehicles and passengers -------------
  const registry = createRegistry();
  const vx = vehicles as typeof vehicles & VehiclesExtra;
  const nx = npcs as typeof npcs & NpcsExtra;
  /** After the clock jumps behind a fade (sleeping, a ride across town): parked vehicles and the crowd are put where the new hour has them. */
  function clockJumped() {
    vx.setClock?.(atmosphere.hours, atmosphere.clock.day, true);
    npcs.skipTo(atmosphere.hours);
  }
  /** What E would do now (computed once per frame), and a hold-E in progress. */
  let focus: Focus | null = null;
  let hold: { entry: Entry; view: PromptView; started: number; x: number; z: number } | null = null;
  /** Savings (safe from hospital fees and fines), buffs (until, in seconds), lottery tickets, litter and scrap in hand. */
  let bank = 0;
  const buffs = new Map<BuffId, number>();
  const tickets: Ticket[] = [];
  let drawnDay = -1, litter = 0, scrap = 0, cupUntil = 0;
  const carried: string[] = [];
  /** The last car or curb bike the player drove (persists, pinned on the map), and plates reported stolen (until, s). */
  let playerLastCar: Car | null = null;
  const hotCars = new Map<Car, number>();
  /** Sitting: the seat (and its reservation in npcs.ts), the eatery its stools belong to, where the player stood. */
  let seat: { claim: number | null; x: number; z: number; yaw: number; top: number; kind: string; eatery: Place | null; from: { x: number; z: number }; at: number } | null = null;
  let blendFor = 0;
  /** Riding as a passenger (boardPassenger). */
  let ride: PassengerProvider | null = null;
  // Buses, the river bus and the moored đò and ghe (buses.ts): fares, getting off, fast travel by đò, and the ride.
  const buses = createBuses(scene, {
    vehicles, boats,
    pay: (k) => { if (cash < k) return false; cash -= k; return true; },
    notify: (text, ms) => notify(text, ms),
    place: (x, z, yaw) => { Object.assign(state, { x, z, angle: yaw }); bodyY = groundHeight(x, z); swimming = false; cameraTarget.set(x, 1, z); },
    fade: () => dip(),
    skip: (h) => { atmosphere.setHours(atmosphere.hours + h); clockJumped(); },
    riding: () => ride,
    say: (key, text, at) => sayAt(key, text, at),
  });
  /** The counter menu open on the panel (page.tsx CounterPanel). */
  type OpenMenu = {
    id: string; place: string | null; view: MenuView; build: () => MenuView; choose: (itemId: string) => { message: string; ok: boolean; close?: boolean };
    anchor: { x: number; z: number; yaw: number } | null; haggled: boolean; onHaggle?: (off: number) => void;
  };
  let menu: OpenMenu | null = null;
  let menuSeq = 0;
  const refusedUntil = new Map<string, number>();
  const rummagedAt = new Map<string, number>();
  /** The game day incense was last lit at each pagoda, and the night the player last sang at each karaoke. */
  const incenseDay = new Map<string, number>(), sangNight = new Map<string, number>();
  /** The giữ-xe attendant holding the player's bike, and where it stands in the lot. */
  let parkedWith: Npc | null = null;
  const buffOn = (id: BuffId) => (buffs.get(id) ?? 0) > performance.now() / 1000;
  /** "PHỞ CÔ BA" → "Phở Cô Ba" (ATM and "24H" stay as they are). */
  const titleCase = (name: string) => name.split(' ').map((w) => (w === 'ATM' || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLocaleLowerCase('vi'))).join(' ');
  /** The price on the prompt: the house dish (the first item that costs something). */
  const headline = (def: CounterDef) => def.items.find((i) => i.price > 0)?.price;

  const ctx: Ctx = {
    x: 0, z: 0, heading: 0, onFoot: true, riding: false, inCar: false, swimming: false, hour: 0, day: 0, zombie: false, wanted: 0, cash: 0, bank: 0,
    armed: false, time: 0,
    witnesses: (x, z, r) => witnesses(x, z, r),
    notify: (text, ms) => notify(text, ms),
    menu: (view, choose) => openMenu({ build: () => view, choose: (id) => { const m = choose?.(id); return { message: typeof m === 'string' ? m : '', ok: true }; }, anchor: null }),
  };
  function refreshCtx(now: number) {
    Object.assign(ctx, {
      x: state.x, z: state.z, heading: state.angle, onFoot: !state.riding && !swimming && !boat && !glide, riding: state.riding, inCar: inCar(), swimming,
      hour: atmosphere.hours, day: atmosphere.clock.day, zombie: zombieMode, wanted: police.wanted, cash, bank, armed: weapon !== 'fists', time: now / 1000,
    });
    return ctx;
  }
  /** People who would see something at (x, z): residents within r with a clear line, giữ-xe attendants within 25 m (awake), officers within 40 m. */
  function witnesses(x: number, z: number, r: number) {
    let n = 0;
    if (!zombieMode) npcs.near(x, z, r, (npc) => { if (npc.state !== 'fleeing' && npc.role !== 'thief' && lineOfSight(npc.x, npc.z, x, z)) n++; });
    const hour = atmosphere.hours;
    if (hour < 12 || hour > 13.5) nx.forEachRole?.('giu-xe', (npc, onDuty) => { if (onDuty && Math.hypot(npc.x - x, npc.z - z) < 25 && lineOfSight(npc.x, npc.z, x, z)) n++; });
    return n + policeSeeing(x, z, 40);
  }
  function policeSeeing(x: number, z: number, r: number) {
    let n = 0;
    police.forEachUnit((px, pz) => { if (Math.hypot(px - x, pz - z) < r && lineOfSight(px, pz, x, z)) n++; });
    // The officer on duty at the ward station watches its front: the visitors' bikes and the confiscation row.
    if (!zombieMode && Math.hypot(LANDMARKS.police.x - x, LANDMARKS.police.z - z) < 22) n++;
    return n;
  }
  const dimView = (id: string, verb: string, label = ''): PromptView => ({ id, key: '', verb, label, dim: true });

  // -- Counters and the doors of public places (C3: closed ones answer with their hours) --
  function closedText(def: CounterDef, hour: number) {
    const at = hourLabel(opensAt(def.hours, hour));
    switch (def.kind) {
      case 'school': return hour > 6.5 && hour < 17.5 ? ['Trường đang giờ học', 'quà vặt bán lúc tan trường'] : ['Trường đã đóng cổng', `mở lại ${at}`];
      case 'theatre': return ['Phòng vé chưa mở', 'mở 18:00 · suất 19:30 và 21:00'];
      case 'office': return ['Tòa nhà đóng cửa', `mở lại ${at}`];
      case 'bank': return ['Ngân hàng đóng cửa', `mở lại ${at} · ATM bên hông 24/7`];
      default: return ['Đóng cửa', `mở lại ${at}`];
    }
  }
  function counterEntry(place: Place): Entry {
    const def = COUNTERS[place.key];
    return {
      id: place.id, kind: def.kind === 'atm' || def.kind === 'vending' ? 'atm' : 'counter', x: place.x, z: place.z, r: place.r,
      prompt(c) {
        if (c.zombie) return dimView(place.id, def.kind === 'atm' || def.kind === 'vending' ? 'Mất điện' : 'Bỏ hoang từ khi dịch bùng phát', titleCase(place.name));
        // Walking into the bank with a gun out is the bank job (the 'heist' entry), not a deposit.
        if (def.kind === 'bank' && c.armed) return null;
        if ((refusedUntil.get(place.id) ?? 0) > c.time) return dimView(place.id, 'Không bán nữa!', 'quay lại sau');
        if (!isOpen(def.hours, c.hour)) { const [verb, label] = closedText(def, c.hour); return dimView(place.id, verb, label); }
        const away = AWAY[def.kind];
        if (away && !sellerAt(place.anchor.x, place.anchor.z, away.r)) return dimView(place.id, away.text[0], away.text[1]);
        return { id: place.id, key: 'E', verb: def.verb, label: def.kind === 'atm' ? `số dư ${formatThousands(bank)}` : titleCase(place.name), price: def.kind === 'atm' || def.kind === 'bank' || def.kind === 'police' || def.kind === 'pagoda' || def.kind === 'church' || def.kind === 'market' ? undefined : headline(def) };
      },
      use(c) {
        if (c.zombie || (refusedUntil.get(place.id) ?? 0) > c.time || !isOpen(def.hours, c.hour)) return;
        const away = AWAY[def.kind];
        if (away && !sellerAt(place.anchor.x, place.anchor.z, away.r)) return;
        openCounter(place);
      },
    };
  }
  /** Counters that are only someone selling there (a sạp, a vé số case, the school-gate cart): how near, and what is said when nobody is. */
  const AWAY: Partial<Record<CounterDef['kind'], { r: number; text: [string, string] }>> = {
    stall: { r: 3.4, text: ['Cô bán hàng đi vắng', 'quay lại sau'] }, lottery: { r: 2.2, text: ['Cô bán vé số đi vắng', 'quay lại sau'] },
    school: { r: 5, text: ['Hàng quà chưa dọn ra', 'bán lúc tan trường'] },
  };
  /** Whether a vendor, hawker or vé số seller is at their post within r of (x, z). */
  function sellerAt(x: number, z: number, r: number) {
    let found = false;
    npcs.near(x, z, r, (npc) => { if (npc.state === 'at' && npc.gang < 0 && (npc.role === 'vendor' || npc.role === 'lottery' || npc.role === 'hawker')) found = true; });
    return found;
  }
  const SERVE_LINES: Partial<Record<CounterDef['kind'], string>> = {
    cafe: 'Uống gì em?', kiosk: 'Uống gì em?', food: 'Ăn gì em?', cart: 'Ăn gì em?', stall: 'Mua gì em ơi?', beer: 'Mấy ly em ơi?', hotel: 'Dạ, thuê phòng hả em?',
    post: 'Dạ, em cần gửi gì?', police: 'Có việc gì đó cháu?', bank: 'Dạ, em giao dịch gì ạ?', lottery: 'Mua giùm cô tờ vé số đi con!', school: 'Mua gì con?',
  };
  /** The person who serves at a counter: whoever is at work nearest its door (npcs.ts serve turns them to the player). */
  function serveAt(x: number, z: number, line?: string, who?: Npc) {
    let vendor = who ?? null, best = 3.5;
    if (!vendor) npcs.near(x, z, 3.5, (npc) => { const d = Math.hypot(npc.x - x, npc.z - z); if (npc.state === 'at' && npc.gang < 0 && d < best) { best = d; vendor = npc; } });
    if (vendor) nx.serve?.(vendor, state.x, state.z, line);
  }
  function openCounter(place: Place, seller?: string, who?: Npc) {
    const def = COUNTERS[place.key];
    const state0 = { off: 1 };
    serveAt(place.anchor.x, place.anchor.z, SERVE_LINES[def.kind], who);
    openMenu({
      build: () => counterMenu(place, def, state0.off, seller),
      choose: (itemId) => buyAt(place, def, itemId, state0.off),
      anchor: { x: place.anchor.x, z: place.anchor.z, yaw: place.yaw },
      onHaggle: def.haggle ? (off) => { state0.off = off; } : undefined,
      id: place.id,
    });
  }
  function counterMenu(place: Place, def: CounterDef, off: number, seller?: string): MenuView {
    const items: MenuItem[] = [];
    const bikeNear = Math.hypot(bikeX - place.x, bikeZ - place.z) < 25;
    if (def.kind === 'atm' || def.kind === 'bank') {
      const atm = def.kind === 'atm', fee = atm ? 1.1 : 0;
      for (const [id, amount] of [['rut100', 100], ['rut500', 500]] as const) items.push({ id, name: `Rút ${formatThousands(amount)}`, price: amount, desc: atm ? 'Phí 1.100đ mỗi lần rút.' : 'Rút tại quầy, không mất phí.', disabled: bank < amount + fee });
      const all = Math.floor(bank - fee);
      items.push({ id: 'rutall', name: 'Rút hết', price: Math.max(0, all), desc: 'Toàn bộ số dư thành tiền mặt.', disabled: all < 1, tag: all < 1 && bank > 0 ? 'Số dư dưới mức rút' : undefined });
      if (!atm) for (const [id, amount] of [['gui100', 100], ['gui500', 500]] as const) items.push({ id, name: `Gửi ${formatThousands(amount)}`, price: amount, desc: 'Tiền gửi không mất khi bị hạ gục hay bị bắt.', disabled: cash < amount });
      items.push({ id: 'guiall', name: 'Gửi hết tiền mặt', price: cash, desc: atm ? 'Nộp tiền qua máy, không mất phí.' : 'Giữ an toàn toàn bộ tiền mặt.', disabled: cash <= 0 });
    } else if (def.kind === 'police') {
      if (police.wanted > 0) items.push({ id: 'dauthu', name: 'Ra đầu thú', price: 100 * police.wanted, desc: `Nộp phạt 100.000đ mỗi sao · xóa truy nã ${police.wanted}★.`, disabled: cash < 100 * police.wanted });
      for (const v of vx.impound?.list() ?? []) items.push({ id: `xe:${v.id}`, name: `Nộp phạt, lấy xe: ${v.label}`, price: v.fee, desc: `Bị cẩu về đồn lúc ${hourLabel(v.since)}.`, disabled: cash < v.fee });
      if (!items.length) items.push({ id: 'none', name: 'Không có việc gì cần giải quyết', price: 0, desc: vx.impound ? 'Không có xe nào của bạn bị tạm giữ, cũng không bị truy nã.' : 'Bạn không bị truy nã.', disabled: true });
    } else {
      for (const it of def.items) {
        let price = Math.round(it.price * off), disabled = cash < price, tag: string | undefined;
        if (it.effect.fix === 'repair') { price = repairCost(bikeId, bikeHealth); disabled = !price || cash < price; tag = price ? undefined : 'Xe còn tốt'; }
        if (it.effect.fix && !bikeNear) { disabled = true; tag = 'Dắt xe tới gần tiệm'; }
        if (it.effect.lottery && tickets.length >= MAX_TICKETS) { disabled = true; tag = 'Đã giữ 10 tờ'; }
        if (def.kind === 'pagoda' && it.id === 'huong' && incenseDay.get(place.id) === atmosphere.clock.day) { disabled = true; tag = 'Hôm nay đã thắp'; }
        items.push({ id: it.id, name: it.name, price, desc: it.description, disabled, tag });
      }
      if (def.kind === 'taphoa' || def.kind === 'lottery') {
        const due = tickets.filter((t) => drawn(t.day)).length;
        if (due) items.push({ id: 'do', name: `Dò ${due} tờ vé số`, price: 0, desc: `Kết quả hôm nay: ${drawnToday() ? drawNumber(atmosphere.clock.day) : drawNumber(atmosphere.clock.day - 1)}.` });
        if (scrap && def.kind === 'taphoa') items.push({ id: 'vechai', name: `Bán ${scrap} ve chai`, price: scrap, desc: 'Vỏ lon nhặt ở thùng rác, 1.000đ một cái.' });
      }
    }
    const eatIn = !!seat && seat.eatery?.id === place.id;
    const lunar = lunarDay(atmosphere.clock.day);
    const intro = def.kind === 'pagoda' && (lunar === 1 || lunar === 15) ? `Hôm nay ${lunar === 1 ? 'mùng một' : 'ngày rằm'}, chùa đông khách thập phương. ${def.intro}` : def.kind === 'atm' || def.kind === 'bank' ? `${def.intro} Số dư: ${formatThousands(bank)}.` : def.intro;
    return {
      id: '', kind: def.kind, icon: def.icon, eyebrow: `${seller ?? place.name} · ${hoursLabel(def.hours)}`, title: def.title, intro, items,
      foot: def.foot ?? (def.kind === 'police' ? 'Xe bỏ giữa đường quá lâu sẽ bị cẩu về đây. Tiền gửi ngân hàng không bị trừ khi bị bắt.' : hoursLabel(def.hours).startsWith('Mở') ? `${hoursLabel(def.hours)}.` : `Giờ mở cửa: ${hoursLabel(def.hours)}.`),
      wallet: { cash, bank: def.kind === 'atm' || def.kind === 'bank' ? bank : undefined }, haggle: def.haggle && off === 1, seated: eatIn,
      tickets: def.kind === 'taphoa' || def.kind === 'lottery' ? tickets.map((t) => t.number) : undefined,
    };
  }
  /** Whether a draw day's numbers are out. */
  const drawn = (day: number) => day < atmosphere.clock.day || (day === atmosphere.clock.day && atmosphere.hours >= DRAW_HOUR);
  const drawnToday = () => atmosphere.hours >= DRAW_HOUR;
  function buyAt(place: Place, def: CounterDef, itemId: string, off: number): { message: string; ok: boolean; close?: boolean } {
    const now = performance.now();
    // Money in and out of the bank.
    if (def.kind === 'atm' || def.kind === 'bank') {
      const fee = def.kind === 'atm' ? 1.1 : 0;
      const take = itemId === 'rut100' ? 100 : itemId === 'rut500' ? 500 : itemId === 'rutall' ? Math.floor(bank - fee) : 0;
      if (itemId.startsWith('rut') && take < 1) return { message: 'Số dư không đủ để rút.', ok: false };
      if (take > 0) {
        if (bank < take + fee) return { message: 'Số dư không đủ.', ok: false };
        bank = Math.round((bank - take - fee) * 10) / 10; cash += take;
        return { message: `Đã rút ${formatThousands(take)}${fee ? ' · phí 1.100đ' : ''}. Số dư còn ${formatThousands(bank)}.`, ok: true };
      }
      const put = itemId === 'gui100' ? 100 : itemId === 'gui500' ? 500 : itemId === 'guiall' ? cash : 0;
      if (put <= 0 || cash < put) return { message: 'Không đủ tiền mặt.', ok: false };
      cash -= put; bank += put;
      return { message: `Đã gửi ${formatThousands(put)}. Số dư ${formatThousands(bank)}.`, ok: true };
    }
    if (def.kind === 'police') {
      if (itemId === 'dauthu') {
        const fine = 100 * police.wanted;
        if (!police.wanted) return { message: 'Bạn không bị truy nã.', ok: false };
        if (cash < fine) return { message: `Cần ${formatThousands(fine)} để nộp phạt.`, ok: false };
        cash -= fine; police.reset();
        return { message: `Đã nộp phạt ${formatThousands(fine)} · hết bị truy nã. Lần sau cẩn thận!`, ok: true };
      }
      if (itemId.startsWith('xe:')) {
        const id = Number(itemId.slice(3)), v = vx.impound?.list().find((i) => i.id === id);
        if (!v) return { message: 'Xe này không còn trong bãi.', ok: false };
        if (cash < v.fee) return { message: `Cần ${formatThousands(v.fee)} tiền phạt.`, ok: false };
        const exit = impoundExit(MOTO_STYLES.has(v.style));
        const car = vx.impound!.release(id, exit.x, exit.z, exit.yaw);
        if (!car) return { message: 'Chưa dắt xe ra được, thử lại sau.', ok: false };
        cash -= v.fee;
        playerLastCar = car;
        vx.markOwned?.(car);
        return { message: `Đã nộp ${formatThousands(v.fee)} · ${v.label} đang chờ trước cổng đồn.`, ok: true };
      }
      return { message: '', ok: false };
    }
    if (itemId === 'do') {
      let won = 0;
      const lines: string[] = [];
      for (let i = tickets.length - 1; i >= 0; i--) {
        const t = tickets[i];
        if (!drawn(t.day)) continue;
        const prize = prizeFor(t.number, drawNumber(t.day));
        if (prize) { won += prize; lines.push(`${t.number} trúng ${formatThousands(prize)}`); }
        tickets.splice(i, 1);
      }
      cash += won;
      return { message: won ? `Trúng rồi! ${lines.join(', ')}.` : 'Không trúng tờ nào. Mai thử lại nhé!', ok: true };
    }
    if (itemId === 'vechai') { cash += scrap; const n = scrap; scrap = 0; return { message: `Bán ${n} ve chai được ${formatThousands(n)}.`, ok: true }; }
    const item = def.items.find((i) => i.id === itemId);
    if (!item) return { message: 'Món này đã hết.', ok: false };
    let price = Math.round(item.price * off);
    if (item.effect.fix === 'repair') price = repairCost(bikeId, bikeHealth);
    if (item.effect.fix && Math.hypot(bikeX - place.x, bikeZ - place.z) > 25) return { message: 'Dắt hoặc chạy xe tới gần tiệm đã.', ok: false };
    if (item.effect.fix === 'repair' && !price) return { message: 'Xe của bạn vẫn còn tốt.', ok: false };
    if (item.effect.lottery && tickets.length >= MAX_TICKETS) return { message: 'Bạn đã giữ 10 tờ vé số rồi.', ok: false };
    if (cash < price) return { message: `Không đủ tiền: cần ${formatThousands(price)}.`, ok: false };
    cash -= price;
    // The post office is the delivery hub: the job is the post mission.
    if (def.kind === 'post' && item.id === 'viec') {
      missions.select('post');
      setMissionLabel();
      notify(missions.view().objective, 4500);
      return { message: 'Đã nhận việc giao bưu phẩm.', ok: true, close: true };
    }
    if (def.kind === 'pagoda' && item.id === 'xam') return { message: FORTUNES[Math.floor(Math.random() * FORTUNES.length)], ok: true };
    // Incense once a day at each pagoda: a calm mind, not a free heal.
    if (def.kind === 'pagoda' && item.id === 'huong') {
      if (incenseDay.get(place.id) === atmosphere.clock.day) return { message: 'Hôm nay bạn đã thắp hương ở đây rồi · mai quay lại nhé.', ok: false };
      incenseDay.set(place.id, atmosphere.clock.day);
    }
    const eatIn = !!seat && seat.eatery?.id === place.id && !!def.eatIn;
    const parts = applyEffect(item.effect, effectHost, eatIn);
    if (item.effect.hours || item.effect.wakeAt !== undefined) { dip(); clockJumped(); }
    if (item.effect.litter && !eatIn) {
      // A takeaway: a cup in the hand for a while (drinks), the wrapper for the next bin.
      if (/^(Cà phê|Bạc xỉu|Trà|Nước|Sữa|Dừa|Kem)/.test(item.name)) cupUntil = now + 45000;
    }
    if (def.kind === 'books' && item.id === 'bao') parts.push(`xổ số hôm qua: ${drawNumber(atmosphere.clock.day - 1)}`);
    emitHud(now);
    return { message: `${item.name}${parts.length ? ` · ${parts.join(', ')}` : ''}`, ok: true, close: !!(item.effect.hours || item.effect.wakeAt !== undefined) };
  }
  /**
   * Where a released vehicle waits: a motorbike in a free spot of the station's XE TẠM GIỮ row (nose to the building),
   * a car at the far curb of road x = -108 across from the station, facing the way that lane runs (the near lane is
   * the buses' approach to the CÔNG AN shelter).
   */
  const IMPOUND_EXIT = { x: -102.6, z: -27, yaw: Math.PI };
  const MOTO_STYLES = new Set(['cub', 'scooter', 'vespa', 'sport']);
  function impoundExit(moto: boolean) {
    if (moto) {
      const door = LANDMARKS.police;
      const row = SPOTS.filter((s) => s.vehicle === 'moto' && s.lot >= 0 && LOTS[s.lot]?.kind === 'impound').sort((a, b) => Math.hypot(a.x - door.x, a.z - door.z) - Math.hypot(b.x - door.x, b.z - door.z));
      for (const s of row) if (!vehicles.blocked(s.x, s.z, 0.5) && !vx.parkedAt?.(s.x, s.z, 0.6)) return { x: s.x, z: s.z, yaw: s.yaw };
    }
    return IMPOUND_EXIT;
  }
  const effectHost: EffectHost = {
    get now() { return performance.now() / 1000; },
    get health() { return health; }, maxHealth: MAX_HEALTH,
    setHealth(v) { health = v; },
    drunk(seconds) { drunkUntil = Math.max(drunkUntil, performance.now()) + seconds * 1000; },
    sober() { drunkUntil = 0; },
    score(points) { state.score += points; },
    get hours() { return atmosphere.hours; },
    setHours(h) { atmosphere.setHours(h); },
    get wanted() { return police.wanted; },
    loseTail(watched) { if (watched && policeSeeing(state.x, state.z, 45)) return false; police.reset(); return true; },
    buff(id, seconds) { buffs.set(id, Math.max(buffs.get(id) ?? 0, performance.now() / 1000) + seconds); },
    fix(kind) {
      const max = bikeById(bikeId).health;
      if (kind === 'repair') { bikeHealth = max; return 'xe đã sửa như mới'; }
      if (kind === 'oil') { bikeHealth = Math.min(max, bikeHealth + max * 0.15); return 'máy êm hơn'; }
      if (playerLastCar && flatCars.has(playerLastCar)) { flatCars.delete(playerLastCar); return 'đã vá lốp ô tô'; }
      bikeHealth = Math.min(max, bikeHealth + max * 0.05);
      return 'bánh xe căng lại';
    },
    look(kind) { if (kind === 'shirt') restyleShirt(); },
    lottery(count) { for (let i = 0; i < count; i++) tickets.push({ number: ticketNumber(Math.random), day: drawDay(atmosphere.clock.day, atmosphere.hours) }); },
    litter(count) { if (!seat) litter += count; },
    item(name) { carried.push(name); },
  };
  const SHIRTS = ['#e77641', '#3f6f9f', '#5e927c', '#c9493b', '#f0f0ea', '#2f3a48', '#d4b164', '#a57fb0', '#86b8a0'];
  let shirtIndex = 0;
  /** New clothes: the player is drawn (and falls) in a new shirt. */
  function restyleShirt(color?: string) {
    shirtIndex = color ? Math.max(0, SHIRTS.indexOf(color)) : (shirtIndex + 1 + Math.floor(Math.random() * (SHIRTS.length - 2))) % SHIRTS.length;
    PLAYER_LOOK.shirt = SHIRTS[shirtIndex];
    const style = deriveStyle(PLAYER_LOOK, 0, 'player');
    style.torso &= ~TORSO.GANH;
    setStyle(PLAYER_LOOK, style);
    for (const p of [walker, rider, seated, helm]) { p.look.shirt = PLAYER_LOOK.shirt; p.restyle(style); }
  }

  // -- The panel --
  function openMenu(m: { build: () => MenuView; choose: OpenMenu['choose']; anchor: OpenMenu['anchor']; onHaggle?: (off: number) => void; id?: string }) {
    if (hold) { hold.entry.cancel?.(ctx); hold = null; }
    const id = `${m.id ?? 'menu'}#${++menuSeq}`;
    const self: OpenMenu = {
      id, place: m.id ?? null, haggled: false, anchor: m.anchor, choose: m.choose, onHaggle: m.onHaggle,
      build: () => ({ ...m.build(), id, haggle: !!m.onHaggle && !self.haggled }),
      view: { id, kind: '', icon: '', eyebrow: '', title: '', intro: '', items: [], foot: '', wallet: { cash: 0 } },
    };
    self.view = self.build();
    menu = self;
    velocity = 0;
    if (m.anchor && !seat) state.angle = Math.atan2(m.anchor.x - state.x, m.anchor.z - state.z);
    onEvent({ type: 'menu', menu: self.view });
  }
  function closeMenu(tell = false) {
    if (!menu) return;
    menu = null;
    if (tell) onEvent({ type: 'menu-close' });
  }
  function chooseItem(menuId: string, itemId: string): { message: string; ok: boolean; menu?: MenuView } {
    if (!menu || menu.id !== menuId) return { message: 'Quầy này đã đóng.', ok: false };
    const m = menu;
    // Knocked down, arrested, or carried away from the counter: nothing more is sold.
    if (down || (m.anchor && Math.hypot(m.anchor.x - state.x, m.anchor.z - state.z) > 8)) { closeMenu(true); return { message: 'Quầy này đã đóng.', ok: false }; }
    if (itemId === '__haggle') {
      if (!m.onHaggle || m.haggled) return { message: '', ok: false, menu: m.view };
      m.haggled = true;
      const outcome = haggle(Math.random);
      if (outcome === 'refused') {
        if (m.place) refusedUntil.set(m.place, performance.now() / 1000 + 60);
        closeMenu(true);
        notify('“Trả giá gì kỳ vậy! Không bán nữa!” · quay lại sau một phút.', 3500);
        return { message: 'Không bán nữa!', ok: false };
      }
      if (outcome === 'cheaper') m.onHaggle(HAGGLE_OFF);
      m.view = m.build();
      return { message: outcome === 'cheaper' ? '“Thôi được, bớt cho em 20%.”' : '“Giá này là rẻ lắm rồi em ơi.”', ok: outcome === 'cheaper', menu: m.view };
    }
    const result = m.choose(itemId);
    if (result.close) { closeMenu(true); return { message: result.message, ok: result.ok }; }
    if (menu === m) m.view = m.build();
    if (result.message) notify(result.message, 3000);
    return { message: result.message, ok: result.ok, menu: menu === m ? m.view : undefined };
  }

  // -- Seats (npcs.ts claimSeat/releaseSeat reserve them, so no one sits on the player) --
  function seatTaken(x: number, z: number, r = 0.45) {
    let taken = false;
    npcs.near(x, z, r, (npc) => { if (npc.pose === 'sit') taken = true; });
    return taken;
  }
  function seatEntry(place: Place): Entry {
    // A quán's stools belong to its own counter (street-life groups and café tables name the building); a stool with
    // no eat-in counter of its own (a karaoke or doorstep stool) is just a seat.
    const eatery = place.key === 'cafe-seat' || place.key === 'stool'
      ? PLACES.find((p) => p.kind === 'counter' && place.building >= 0 && p.building === place.building && COUNTERS[p.key]?.eatIn) ?? null : null;
    const label = eatery ? 'Ghế quán' : place.key === 'cafe-seat' || place.key === 'stool' ? 'Ghế nhựa' : place.key === 'chess' ? 'Ghế đánh cờ' : place.key === 'bus-stop' ? 'Ghế chờ xe buýt' : 'Ghế đá';
    return {
      id: place.id, kind: 'seat', x: place.x, z: place.z, r: place.r, arc: 1.2,
      prompt(c) {
        if (c.zombie || seat || place.poi === undefined) return null;
        // Stools of a quán that has packed up for the night are stacked away: nothing to sit on (C4).
        const s = seatsHere.get(place.poi);
        if (!s) return null;
        if (s.taken || seatTaken(place.x, place.z)) return dimView(place.id, 'Ghế có người ngồi', label);
        return { id: place.id, key: 'E', verb: 'Ngồi nghỉ', label };
      },
      use() { if (!seatTaken(place.x, place.z)) sitDown(place.x, place.z, eatery); },
    };
  }
  function sitDown(x: number, z: number, eatery: Place | null) {
    if (state.riding) return;
    // npcs.ts reserves it, so nobody sits on the player (null: taken, or the stools are packed away for the night).
    const claim = nx.claimSeat?.(x, z, 0.8) ?? null;
    if (!claim) { notify('Ghế này có người ngồi rồi.', 2000); return; }
    seat = { claim: claim.id, x: claim.x, z: claim.z, yaw: claim.yaw, top: claim.top, kind: claim.kind, eatery, from: { x: state.x, z: state.z }, at: performance.now() };
    velocity = 0;
    blendFor = 0;
    registry.reset();
    notify(seatHint(), 3500);
  }
  /** The seated hint, from the same test as the chip (stateView): E orders only while the quán is serving. */
  function seatHint() {
    const e = seat?.eatery;
    if (e && isOpen(COUNTERS[e.key].hours, atmosphere.hours)) return `Ngồi ghế nhựa ở ${titleCase(e.name)} · E gọi món · WASD đứng dậy`;
    return `${e ? `Ngồi ở ${titleCase(e.name)} · quán chưa bán · ` : 'Ngồi nghỉ · '}E hoặc WASD để đứng dậy · giữ Space cho thời gian trôi nhanh`;
  }
  function leaveSeat() {
    if (!seat) return;
    const s = seat;
    seat = null;
    if (s.claim !== null) nx.releaseSeat?.(s.claim);
    // Up and a step forward off the seat, or back where the player stood.
    const fx = s.x + Math.sin(s.yaw) * 0.7, fz = s.z + Math.cos(s.yaw) * 0.7;
    const spot = clearAt(fx, fz, 0.35) ? { x: fx, z: fz } : s.from;
    state.x = spot.x; state.z = spot.z;
    bodyY = groundHeight(spot.x, spot.z);
    registry.reset();
  }
  /** Seats out and usable near the player this frame (npcs.ts seatsNear: stools come out with their quán), by POI id. */
  const seatsHere = new Map<number, { taken: boolean }>();
  function refreshSeats() {
    seatsHere.clear();
    if (nx.seatsNear) { for (const s of nx.seatsNear(state.x, state.z, 6)) seatsHere.set(s.id, { taken: !!s.taken }); return; }
    for (const p of PLACES) if (p.kind === 'seat' && p.poi !== undefined && Math.abs(p.x - state.x) < 6 && Math.abs(p.z - state.z) < 6) seatsHere.set(p.poi, { taken: false });
  }

  // -- Legacy shops and landmarks (their rings stay; the registry answers them) --
  function legacyEntry(place: Place): Entry {
    const base = { id: place.id, kind: 'door' as const, x: place.x, z: place.z, r: place.r };
    switch (place.kind) {
      case 'gunstore': return { ...base, prompt: () => ({ id: place.id, key: 'E', verb: 'Vào Tiệm súng', label: deliveries ? '' : 'mở khóa sau 1 đơn giao hàng' }), use: () => onEvent({ type: 'store' }) };
      case 'bikeshop': return { ...base, prompt: () => ({ id: place.id, key: 'E', verb: 'Vào Cửa hàng xe máy', label: 'mua, sửa xe' }), use: () => onEvent({ type: 'bikeshop' }) };
      case 'hospital': return { ...base, prompt: () => ({ id: place.id, key: 'E', verb: 'Khám và hồi máu', label: 'Bệnh viện An Hòa', price: health < MAX_HEALTH ? Math.ceil((MAX_HEALTH - health) * 1.2) : undefined }), use: () => onEvent({ type: 'hospital' }) };
      case 'venue': {
        const hours = VENUE_HOURS[place.key as VenueRoom];
        return {
          ...base, kind: 'counter',
          prompt: (c) => (c.zombie ? dimView(place.id, 'Đã đóng cửa từ khi dịch bùng phát', titleCase(place.name))
            : !isOpen(hours, c.hour) ? dimView(place.id, `${titleCase(place.name)} đóng cửa`, `mở lúc ${hourLabel(opensAt(hours, c.hour))}`)
            : { id: place.id, key: 'E', verb: `Vào ${place.name}`, label: '18+' }),
          use: (c) => { if (!c.zombie && isOpen(hours, c.hour)) onEvent({ type: 'venue', kind: place.key as VenueRoom }); },
        };
      }
      case 'deck': {
        // Looked up when asked (the deck table is set up further down createGame).
        const tower = () => DECKS[place.key] ?? DECKS.deck;
        return { ...base, prompt: () => ({ id: place.id, key: 'E', verb: `Lên đài quan sát tầng ${tower().floor}`, label: 'nhảy dù', price: tower().price }), use: () => enterDeck(tower()) };
      }
      case 'heist': return {
        ...base, hold: 1.2, crime: 3,
        prompt: (c) => {
          if (c.zombie || !c.armed || heist) return null;
          if (performance.now() < bankReadyAt) return dimView(place.id, 'Ngân hàng đang bị phong tỏa', `quay lại sau ${Math.ceil((bankReadyAt - performance.now()) / 60000)} phút`);
          return { id: place.id, key: 'Giữ E', verb: 'Cướp ngân hàng', label: 'truy nã gắt', crime: 3, seen: true };
        },
        use: () => startHeist(performance.now()),
      };
      case 'boat': {
        const dock = SCENERY.docks.find((d) => d.ring.x === place.x && d.ring.z === place.z)!;
        return {
          ...base, kind: 'transit',
          prompt: (c) => (c.zombie ? dimView(place.id, 'Không ai cho thuê ca nô', 'bến bỏ hoang')
            : boats.rental.mode === 'player' && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) < 40 ? dimView(place.id, 'Ca nô của bạn neo gần đây', 'lại gần rồi nhấn E')
            : { id: place.id, key: 'E', verb: 'Thuê ca nô', label: titleCase(dock.name.split(' • ')[0]), price: BOAT_PRICE }),
          use: () => hireBoat(dock),
        };
      }
      default: return { ...base, prompt: () => null, use: () => undefined };
    }
  }
  // -- Bins (the streets owner places them as 'bin' props) --
  function binEntry(place: Place): Entry {
    return {
      id: place.id, kind: 'bin', x: place.x, z: place.z, r: place.r,
      prompt: (c) => (c.zombie ? null : litter > 0 ? { id: place.id, key: 'E', verb: 'Bỏ rác', label: `${litter} món` } : { id: place.id, key: 'E', verb: 'Lục thùng rác', label: 'tìm ve chai' }),
      use(c) {
        if (litter > 0) { state.score += litter * 2; notify(`Bỏ ${litter} món rác đúng chỗ · +${litter * 2} điểm. Phố sạch hơn rồi!`, 2500); litter = 0; return; }
        if ((rummagedAt.get(place.id) ?? -1e9) > c.time - 90) { notify('Thùng này vừa lục rồi, chẳng còn gì.', 2000); return; }
        rummagedAt.set(place.id, c.time);
        if (Math.random() < 0.2) { scrap++; notify(`Nhặt được một vỏ lon · ${scrap} ve chai (bán ở tạp hóa)`, 2500); }
        else notify('Toàn rác ướt, chẳng có gì…', 2000);
      },
    };
  }
  for (const place of PLACES) {
    registry.add(place.kind === 'counter' ? counterEntry(place) : place.kind === 'seat' ? seatEntry(place) : place.kind === 'bin' ? binEntry(place) : place.kind === 'notice' ? noticeEntry(place) : legacyEntry(place));
  }
  // The sidewalk karaoke (street life, LIFE.groups): in its hours the neighbours hand the player the mic for a song;
  // otherwise the loudspeaker just says when it starts.
  LIFE.groups.forEach((g, gi) => {
    if (g.kind !== 'karaoke' || !g.hours) return;
    const id = `karaoke${gi}`, hours = g.hours;
    let songUntil = 0;
    registry.add({
      id, kind: 'counter', x: g.x, z: g.z, r: 3,
      prompt: (c) => (c.zombie ? null : !isOpen(hours, c.hour) ? dimView(id, 'Karaoke vỉa hè', `hát từ ${hoursLabel(hours)}`)
        : c.time < songUntil ? dimView(id, 'Đang hát…', 'karaoke vỉa hè') : { id, key: 'E', verb: 'Hát một bài', label: 'karaoke vỉa hè' }),
      use(c) {
        if (c.zombie || !isOpen(hours, c.hour) || c.time < songUntil) return;
        songUntil = c.time + 14;
        const at = () => ({ x: state.x, y: groundHeight(state.x, state.z) + 2.1, z: state.z });
        for (let k = 0; k < 3; k++) setTimeout(() => bubbles.say('player', LIFE_LINES.sing[(k + gi) % LIFE_LINES.sing.length], performance.now(), at, 3800), k * 4200);
        let n = 0;
        npcs.near(g.x, g.z, 7, (npc) => {
          if (n >= 3 || npc.state === 'down') return;
          const line = LIFE_LINES.audience[(n + gi) % LIFE_LINES.audience.length], delay = 4000 + n++ * 3000;
          setTimeout(() => sayAt(`npc${npc.id}`, line, () => ({ x: npc.x, y: npc.y + (npc.pose === 'sit' ? npc.seatTop + 1.15 : 1.95), z: npc.z })), delay);
        });
        effectHost.buff('mat', 90);
        // Points for the first song of the night only (the night runs on past midnight).
        const night = atmosphere.clock.day - (c.hour < 12 ? 1 : 0), first = sangNight.get(id) !== night;
        sangNight.set(id, night);
        if (first) state.score += 5;
        notify(first ? 'Cầm mic hát một bài · hàng xóm vỗ tay rần rần! +5 điểm' : 'Thêm một bài nữa · hàng xóm vẫn vỗ tay!', 3500);
      },
    });
  });

  // -- Vehicles: the player's bike, cars in reach (enter, or carjack moving traffic with a tap as before), curb bikes --
  const carEntries = new Map<Car, Entry>();
  /** Whether the attendant holding the player's bike is at his chair now (on duty, up, by the lot). */
  function keeperOnDuty(npc: Npc) {
    let on = false;
    nx.forEachRole?.('giu-xe', (n, onDuty) => { if (n === npc && onDuty && Math.hypot(n.x - bikeX, n.z - bikeZ) < 15) on = true; });
    return on;
  }
  const ownBike: Entry = {
    id: 'own-bike', kind: 'vehicle', priority: OWN_VEHICLE, x: 0, z: 0, r: 2.6,
    prompt() {
      const horse = bikeId === 'horse';
      // With the attendant at his chair the ticket goes to him; with nobody minding the lot the ticket is enough.
      if (parkedWith && keeperOnDuty(parkedWith)) return dimView('own-bike', 'Xe đang gửi ở bãi', 'đưa vé cho anh giữ xe');
      if (parkedWith && bikeHealth > 0) return { id: 'own-bike', key: 'E', verb: 'Lấy xe', label: 'bãi không người · cầm vé dắt ra' };
      if (bikeHealth <= 0) return dimView('own-bike', horse ? 'Ngựa đã kiệt sức' : 'Xe máy đã hỏng', horse ? 'chữa ở Cửa hàng xe máy' : 'sửa ở tiệm sửa xe');
      return { id: 'own-bike', key: 'E', verb: horse ? 'Cưỡi ngựa' : 'Lên xe máy', label: 'xe của bạn' };
    },
    use() {
      if ((parkedWith && keeperOnDuty(parkedWith)) || bikeHealth <= 0) return;
      parkedWith = null;
      state.riding = true;
      state.x = bikeX; state.z = bikeZ; state.angle = bikeAngle;
      velocity = 0;
    },
  };
  function carEntry(car: Car): Entry {
    let e = carEntries.get(car);
    if (!e) {
      e = {
        id: `car${car.kind}${car.index}`, kind: 'vehicle', x: 0, z: 0, r: 3.4,
        prompt() {
          const curb = car as CurbCar;
          const moto = car.kind === 'moto';
          if (car.health <= 0) return dimView(e!.id, 'Xe này đã hỏng');
          if (curb.role === 'curb' && curb.curb?.owner !== 'player') {
            // A xe ôm driver or a couple sitting on it: not a bike to steal.
            if (seatTaken(car.x, car.z, 0.9)) return null;
            // A confiscated bike in the ward police's row is evidence, chained up in front of the duty desk.
            if (curb.curb && IMPOUNDED_SPOTS.has(curb.curb.spot)) return dimView(e!.id, 'Xe tạm giữ', 'công an phường đang giữ');
            const seen = seenAround(car.x, car.z) > 0;
            return { id: e!.id, key: 'Giữ E', verb: moto ? 'Bẻ khóa xe máy' : 'Phá khóa ô tô', label: curb.curb?.owner === 'lot' ? 'xe trong bãi giữ xe' : 'xe người ta', crime: 1, seen };
          }
          if (car.mode === 'lane' && car.driver) return { id: e!.id, key: 'E', verb: moto ? 'Cướp xe máy' : 'Cướp xe', label: 'bị truy nã', crime: 2, seen: true };
          if (car.kind === 'police') return { id: e!.id, key: 'Giữ E', verb: 'Lấy xe cảnh sát', label: 'bị truy nã gắt', crime: 3, seen: true };
          return { id: e!.id, key: 'E', verb: 'Lên xe', label: car === playerLastCar ? 'xe của bạn' : moto ? 'xe máy' : 'ô tô' };
        },
        use() {
          const curb = car as CurbCar;
          if (car.health <= 0) { notify('Xe này đã hỏng, không chạy được.'); return; }
          if (curb.role === 'curb' && curb.curb && IMPOUNDED_SPOTS.has(curb.curb.spot)) return;
          if (curb.role === 'curb' && curb.curb?.owner !== 'player') stealCurb(car);
          else takeCar(car);
        },
      };
      carEntries.set(car, e);
    }
    const curb = car as CurbCar;
    e.x = car.x; e.z = car.z;
    e.r = car.kind === 'moto' ? 4.4 : 3.4;
    const own = car === playerLastCar || curb.role === 'owned' || curb.curb?.owner === 'player';
    const thief = curb.role === 'curb' && !own;
    e.priority = own ? OWN_VEHICLE : thief ? BASE.vehicle : car.mode === 'lane' && car.driver ? BASE.vehicle : car.kind === 'police' ? BASE.vehicle : 60;
    e.crime = thief ? 1 : car.mode === 'lane' && car.driver ? 2 : car.kind === 'police' ? 3 : 0;
    // C2: taking an idle vehicle that is not yours is a hold (a parked cruiser too); carjacking moving traffic stays a tap.
    e.hold = thief ? (car.kind !== 'moto' ? 4.5 : ({ cub: 2, scooter: 3, vespa: 3.5, sport: 4 } as Record<string, number>)[vehicleStyle(car)] ?? 3) : car.kind === 'police' ? 2 : undefined;
    return e;
  }
  /** The confiscated half of the ward police's row (parking.ts 'impound' spots): never a bike to take. */
  const IMPOUNDED_SPOTS = new Set(SPOTS.filter((s) => s.kind === 'impound').map((s) => s.id));
  /** Witnesses around a spot, recounted at most four times a second (prompts ask every frame). */
  const seenCache = { x: 1e9, z: 1e9, at: -1, n: 0 };
  function seenAround(x: number, z: number) {
    const t = performance.now();
    if (Math.hypot(x - seenCache.x, z - seenCache.z) > 1 || t - seenCache.at > 250) Object.assign(seenCache, { x, z, at: t, n: witnesses(x, z, 15) });
    return seenCache.n;
  }
  function takeCar(car: Car) {
    enterCar(car, performance.now());
    if (car.kind !== 'police') { playerLastCar = car; vx.markOwned?.(car); }
  }
  /** Hot-wiring a parked bike or car (design-real 4.5): witnesses counted again at the end; the plate is reported. */
  function stealCurb(car: Car) {
    const now = performance.now(), time = now / 1000;
    const seen = witnesses(car.x, car.z, 15), cops = policeSeeing(car.x, car.z, 40);
    if (car.kind !== 'moto' && Math.random() < 0.5) { playHorn(true); npcs.notice(car.x, car.z, 'crash', time); notify('Còi báo động ô tô hú inh ỏi!', 2500); }
    if (seen > 0) {
      let shouter: Npc | null = null, best = 1e9;
      npcs.near(car.x, car.z, 15, (npc) => { const d = Math.hypot(npc.x - car.x, npc.z - car.z); if (d < best && npc.state !== 'fleeing') { best = d; shouter = npc; } });
      const who = shouter as Npc | null;
      if (who) sayAt(`npc${who.id}`, 'Trộm xe! Trộm xe!', () => ({ x: who.x, y: who.y + 1.95, z: who.z }), true);
      npcs.notice(car.x, car.z, 'fight', time);
      police.crime(cops ? 2 : 1, time);
      hotCars.set(car, time + 3 * SECONDS_PER_HOUR);
      notify(cops ? 'Bị công an thấy bẻ khóa xe! Chạy mau!' : 'Có người thấy bạn trộm xe! Họ đang báo công an.', 3500);
    } else notify('Nổ máy rồi · không ai thấy. Đi thôi!', 2500);
    takeCar(car);
  }
  /** The vehicles the provider below has listed this frame (a woken parked one is listed once). */
  const providerCars = new Set<Car>();
  registry.addProvider((x, z, _r, out) => {
    if (state.riding || swimming || boat || glide) return;
    if (!seat && Math.hypot(bikeX - x, bikeZ - z) < 2.6) { ownBike.x = bikeX; ownBike.z = bikeZ; out.push(ownBike); }
    const listed = providerCars;
    listed.clear();
    for (const car of vehicles.live) {
      if (car.mode === 'off' || car.mode === 'player' || car.mode === 'chase' || car.mode === 'leave') continue;
      if (Math.abs(car.x - x) > 6 || Math.abs(car.z - z) > 6) continue;
      listed.add(car);
      out.push(carEntry(car));
    }
    for (const car of vx.curbNear?.(x, z, 6) ?? []) if (!listed.has(car) && car.mode !== 'player') out.push(carEntry(car));
  });
  vx.onTow?.((car) => {
    if (car !== playerLastCar) return;
    playerLastCar = null;
    notify('Xe của bạn bị cẩu về Công an phường. Nộp phạt ở quầy trực ban để lấy lại.', 5000);
  });

  // -- People: giữ-xe attendants, xe ôm drivers and lottery sellers (npcs.ts roles, placed by the street-life owner) --
  const personEntries = new Map<Npc, Entry>();
  function personEntry(npc: Npc, role: string): Entry {
    let e = personEntries.get(npc);
    if (!e) {
      const id = `npc${npc.id}`;
      // Walking up to the attendant with the bike beside you is to leave it (over getting back on it).
      e = role === 'giu-xe' ? {
        id, kind: 'person', x: 0, z: 0, r: 2.4, priority: OWN_VEHICLE + 10,
        prompt(c) {
          if (parkedWith === npc) return { id, key: 'E', verb: 'Lấy xe', label: 'đưa vé xe' };
          if (parkedWith || bikeHealth <= 0 || Math.hypot(bikeX - c.x, bikeZ - c.z) > 6) return null;
          // No new bikes in the last half hour of his shift: the lot closes and nobody would mind it.
          const end = closingOf(npc);
          if (end !== null && (end - c.hour + 24) % 24 < 0.5) return dimView(id, `Bãi đóng lúc ${hourLabel(end)}`, 'không nhận gửi thêm');
          return { id, key: 'E', verb: 'Gửi xe', label: 'anh giữ xe', price: 5 };
        },
        use(c) {
          if (parkedWith === npc) {
            parkedWith = null;
            const a = c.heading + Math.PI / 2;
            const px = state.x + Math.sin(a) * 1.4, pz = state.z + Math.cos(a) * 1.4;
            if (clearAt(px, pz, 0.5)) { bikeX = px; bikeZ = pz; } else { bikeX = state.x + Math.sin(c.heading) * 1.6; bikeZ = state.z + Math.cos(c.heading) * 1.6; }
            bikeAngle = c.heading;
            sayAt(id, 'Xe đây em, đi cẩn thận nha!', () => ({ x: npc.x, y: npc.y + 1.95, z: npc.z }));
            return;
          }
          const end = closingOf(npc);
          if (end !== null && (end - c.hour + 24) % 24 < 0.5) return;
          if (cash < 5) { notify('Gửi xe 5.000đ, bạn không đủ tiền.', 2000); return; }
          cash -= 5;
          parkedWith = npc;
          // Rolled into the lot beside the attendant's chair.
          bikeX = npc.x + Math.sin(npc.yaw + Math.PI / 2) * 1.6; bikeZ = npc.z + Math.cos(npc.yaw + Math.PI / 2) * 1.6; bikeAngle = npc.yaw;
          sayAt(id, 'Vé xe đây, giữ kỹ nha em!', () => ({ x: npc.x, y: npc.y + 1.95, z: npc.z }));
          notify('Đã gửi xe · 5.000đ · giữ vé để lấy xe ở đây.', 3000);
        },
      } : role === 'xe-om' ? {
        id, kind: 'person', x: 0, z: 0, r: 2.6,
        // Nobody gives a ride to someone the police are after (the ride is a fade across town).
        prompt: (c) => (c.wanted > 0 ? dimView(id, 'Chú không chở người đang bị công an truy', 'chú xe ôm') : { id, key: 'E', verb: 'Đi xe ôm', label: 'chú xe ôm' }),
        use: (c) => { if (c.wanted === 0) openXeOm(npc); },
      } : role === 'hawker' ? {
        id, kind: 'person', x: 0, z: 0, r: 2.4,
        prompt: () => {
          const def = COUNTERS[`ganh-${goodsOf(npc)}`];
          return def ? { id, key: 'E', verb: def.verb, label: 'hàng rong', price: headline(def) } : null;
        },
        use: () => {
          const key = `ganh-${goodsOf(npc)}`;
          if (COUNTERS[key]) openCounter({ id, kind: 'counter', key, name: COUNTERS[key].title.toLocaleUpperCase('vi'), x: npc.x, z: npc.z, r: 2.4, yaw: npc.yaw, anchor: { x: npc.x, z: npc.z }, covers: [], building: -1 }, undefined, npc);
        },
      } : {
        id, kind: 'person', x: 0, z: 0, r: 2.4,
        prompt: () => ({ id, key: 'E', verb: 'Mua vé số', label: 'cô bán vé số', price: 10 }),
        use: () => openCounter({ id, kind: 'counter', key: 'veso', name: 'CÔ BÁN VÉ SỐ', x: npc.x, z: npc.z, r: 2.4, yaw: npc.yaw, anchor: { x: npc.x, z: npc.z }, covers: [], building: -1 }, 'Cô bán vé số', npc),
      };
      personEntries.set(npc, e);
    }
    e.x = npc.x; e.z = npc.z;
    return e;
  }
  registry.addProvider((x, z, _r, out) => {
    if (!nx.forEachRole || zombieMode || state.riding) return;
    for (const role of ['giu-xe', 'xe-om', 've-so', 'hawker']) nx.forEachRole(role, (npc, onDuty) => {
      if (onDuty && Math.abs(npc.x - x) < 6 && Math.abs(npc.z - z) < 6 && (role !== 'hawker' || COUNTERS[`ganh-${goodsOf(npc)}`])) out.push(personEntry(npc, role));
    });
  });
  /** When an attendant's shift ends (his guard slice), or null. */
  const closingOf = (npc: Npc) => { const a = npc.current as { life?: string; end?: number } | null; return a?.life === 'guard' && a.end !== undefined ? a.end : null; };
  /** What a roaming hawker sells right now (street-life slices carry their goods). */
  const goodsOf = (npc: Npc) => (npc.current as { goods?: string } | null)?.goods ?? '';
  /** Heritage sites of the wired districts (Quận 1 south: the palace, the cathedral, the post office, City Hall, Bến Thành). */
  const HERITAGE = isWired('quan-1-south') ? QUAN_1_SOUTH_EXTRA.heritage : [];
  function heritageAt(x: number, z: number) {
    for (const h of HERITAGE) {
      const p = h.poly;
      let inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
      if (inside) return h;
    }
    return null;
  }
  /** Xe ôm destinations in the wired districts, by stamp id. */
  const XEOM_STOPS: Record<string, string> = {
    'cho-ben-thanh': 'Chợ Bến Thành', 'nha-tho-duc-ba': 'Nhà thờ Đức Bà', 'buu-dien-thanh-pho': 'Bưu điện Thành phố', 'nha-rong': 'Bến Nhà Rồng',
    'lang-ong': 'Lăng Ông Bà Chiểu', 'nha-tho-tan-dinh': 'Nhà thờ Tân Định', 'chua-vinh-nghiem': 'Chùa Vĩnh Nghiêm', 'ben-xe-mien-dong': 'Bến xe Miền Đông cũ',
    'dinh-doc-lap': 'Dinh Độc Lập',
  };
  /** Xe ôm: a destination menu priced 10.000đ + 2.000đ per 100 m (haggling allowed); the ride is a fade across town. */
  function openXeOm(npc: Npc) {
    serveAt(npc.x, npc.z, 'Đi đâu con? Lên xe chú chở!', npc);
    const places = [
      { id: 'cho', name: 'Chợ An Hòa', at: { x: -31, z: 27 } }, { id: 'benhvien', name: 'Bệnh viện An Hòa', at: LANDMARKS.hospital },
      { id: 'congan', name: 'Công an phường', at: LANDMARKS.police }, { id: 'chua', name: 'Chùa An Hòa', at: { x: -25.4, z: 116.4 } },
      { id: 'bachdang', name: 'Bến Bạch Đằng', at: { x: 190, z: -128 } }, { id: 'nhahat', name: 'Nhà hát Thành phố', at: { x: 243, z: -8.4 } },
    ];
    // The wired districts' landmarks, set down on the curb in front of them (Thủ Thiêm has no bridge yet: no xe ôm there).
    for (const s of DISTRICT_STAMPS) {
      const name = XEOM_STOPS[s.id], b = s.building >= 0 ? WORLD_BUILDINGS[s.building] : null;
      if (name && b && s.slice !== 'thu-thiem') places.push({ id: s.id, name, at: { x: b.curb.x, z: b.curb.z } });
    }
    if (isWired('quan-4')) places.push({ id: 'vinhkhanh', name: 'Phố ốc Vĩnh Khánh', at: { x: 535, z: 6 } });
    const target = missions.view().target;
    if (target) places.push({ id: 'nhiemvu', name: `Điểm nhiệm vụ: ${missions.view().label}`, at: target });
    const fare = (p: { x: number; z: number }) => 10 + Math.round((2 * Math.hypot(p.x - state.x, p.z - state.z)) / 100);
    const off = { v: 1 };
    openMenu({
      id: `xeom${npc.id}`, anchor: { x: npc.x, z: npc.z, yaw: npc.yaw }, onHaggle: (v) => { off.v = v; },
      build: () => ({
        id: '', kind: 'xeom', icon: 'bike', eyebrow: 'XE ÔM · CHÚ TƯ', title: 'Đi đâu con?', intro: 'Xe ôm đầu ngõ, chạy quen đường, có nón bảo hiểm cho khách. Giá thì trả giá được.',
        items: places.filter((p) => Math.hypot(p.at.x - state.x, p.at.z - state.z) > 30).map((p) => {
          const price = Math.round(fare(p.at) * off.v);
          return { id: p.id, name: p.name, price, desc: `${Math.round(Math.hypot(p.at.x - state.x, p.at.z - state.z))} m`, disabled: cash < price };
        }),
        foot: 'Ngồi sau xe ôm nhớ đội nón bảo hiểm. Chuyến đi trôi qua trong chớp mắt.', wallet: { cash },
      }),
      choose: (itemId) => {
        const p = places.find((q) => q.id === itemId);
        if (!p) return { message: '', ok: false };
        if (police.wanted > 0) return { message: 'Chú không chở người đang bị công an truy.', ok: false, close: true };
        const price = Math.round(fare(p.at) * off.v);
        if (cash < price) return { message: `Cần ${formatThousands(price)}.`, ok: false };
        cash -= price;
        const meters = Math.hypot(p.at.x - state.x, p.at.z - state.z);
        // The driver is gone on the fare (and his scooter with him) for as long as the ride takes, and a bit to come back.
        const perch = (npc.current?.place as { poi?: { x: number; z: number } } | undefined)?.poi;
        nx.sendAway?.(npc, meters / 7 + 40);
        if (perch) vx.awayCurb?.(perch.x, perch.z, meters / 7 + 40);
        dip();
        teleport(p.at);
        atmosphere.setHours(atmosphere.hours + meters / 7 / SECONDS_PER_HOUR);
        clockJumped();
        return { message: `Đã tới ${p.name} · ${formatThousands(price)}`, ok: true, close: true };
      },
    });
  }

  // -- Passengers (bus, waterbus, xe ôm, xích lô: the transit owner calls these) --
  function boardPassenger(p: PassengerProvider) {
    if (seat) leaveSeat();
    if (state.riding) leaveVehicleNow();
    if (hold) { hold.entry.cancel?.(ctx); hold = null; }
    closeMenu(true);
    ride = p;
    velocity = 0;
    registry.reset();
  }
  function leavePassenger() {
    if (!ride) return;
    const s = ride.seat();
    ride = null;
    for (let r = 1.2; r <= 4.8; r += 0.6) for (let k = 0; k < 12; k++) {
      const a = s.yaw + Math.PI / 2 + (k / 12) * Math.PI * 2, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      if (clearAt(x, z, 0.4)) { state.x = x; state.z = z; bodyY = groundHeight(x, z); return; }
    }
    const spot = reachable(s);
    state.x = spot.x; state.z = spot.z; bodyY = groundHeight(spot.x, spot.z);
  }
  const passengers = { board: boardPassenger, leave: leavePassenger };
  for (const partner of [vehicles, npcs, boats] as Registers[]) partner.register?.(registry, passengers);
  buses.register(registry, passengers);

  /** Busy with something Space must not jump out of (sitting, riding along, holding E, a menu). */
  const activityBusy = () => !!(seat || ride || hold || menu);
  /** E on the current focus: a tap acts now, a hold entry starts its hold (it acts when the hold completes). */
  function actOnFocus(now: number) {
    const f = focus;
    if (!f || f.view.dim) return false;
    if (f.entry.hold) { hold = { entry: f.entry, view: f.view, started: now, x: state.x, z: state.z }; return true; }
    f.entry.use(refreshCtx(now));
    registry.reset();
    return true;
  }
  /** What E means while seated or riding along, for the prompt chip. */
  function rideVerb() {
    const hint = ride?.card?.().hint;
    return hint ? hint[0].toLocaleUpperCase('vi') + hint.slice(1) : 'Xin xuống ở trạm tới';
  }
  function stateView(): PromptView | null {
    // The ride's card says what E does now (ring for the next stop, get off at this pier, stand up in a moored đò).
    if (ride) return { id: 'ride', key: 'E', verb: rideVerb(), label: ride.label };
    if (seat) return seat.eatery && isOpen(COUNTERS[seat.eatery.key].hours, atmosphere.hours)
      ? { id: 'seat', key: 'E', verb: COUNTERS[seat.eatery.key].verb, label: titleCase(seat.eatery.name) }
      : { id: 'seat', key: 'E', verb: 'Đứng dậy', label: seat.kind === 'bus-stop' ? 'Ghế chờ xe buýt' : seat.kind === 'bench' ? 'Ghế đá' : 'Ghế' };
    return null;
  }
  /** The prompt as one line of text (the hint line, and screen readers). */
  function promptText(v: PromptView) {
    return [v.key ? `${v.key} · ${v.verb}` : v.verb, v.label, v.price ? formatThousands(v.price) : ''].filter(Boolean).join(' · ');
  }
  /**
   * Once a frame: a hold-E in progress (cancelled on release, moving off, aiming, falling, a menu; done when it
   * completes), the focus for the prompt, the 16:15 lottery draw, sitting (time passes faster on held Space, at 1★ the
   * police lose a player who sits unseen for 10 s), stolen plates, and the marker over the focus.
   */
  function updateInteraction(dt: number, now: number, time: number) {
    refreshCtx(now);
    updateShutters(Math.floor(atmosphere.hours * 6) / 6);
    if (!state.riding) refreshSeats();
    if (hold) {
      const aimingNow = mouseHeld || keys.has('f') || now < aimUntil;
      if (!keys.has('e') || !active || down || menu || state.riding || aimingNow || Math.hypot(state.x - hold.x, state.z - hold.z) > 1.2) {
        hold.entry.cancel?.(ctx);
        hold = null;
      } else if (now - hold.started >= (hold.entry.hold ?? 0) * 1000) {
        const done = hold.entry;
        hold = null;
        done.use(ctx);
        registry.reset();
      }
    }
    // Nothing to use at speed: the registry is only asked on foot, or riding slowly (a stop, a parking lot).
    const canFocus = active && powers.altitude <= 0.05 && !down && !playerBody && !glide && !boat && !heist && !menu && !hold && !ride && !seat && !interior && !surrendered && (!state.riding || Math.abs(velocity) < 2);
    focus = canFocus ? registry.best(ctx) : null;
    // The day's lottery draw at 16:15 (numbers from services.ts, so everyone in a room gets the same).
    const day = atmosphere.clock.day;
    if (atmosphere.hours >= DRAW_HOUR && drawnDay !== day) {
      drawnDay = day;
      if (started && !zombieMode) {
        const win = drawNumber(day), lucky = tickets.some((t) => t.day === day && prizeFor(t.number, win) > 0);
        notify(`Xổ số kiến thiết 16:15 · giải đặc biệt ${win}${lucky ? ' · Bạn có vé trúng! Dò vé ở tạp hóa hoặc cô bán vé số.' : tickets.length ? ' · Dò vé ở tạp hóa.' : ''}`, 6000);
      }
    }
    // The quán packed up its stools (closing time, rain): the player gets up too.
    if (seat && seat.claim !== null && !state.riding && !seatsHere.has(seat.claim)) { leaveSeat(); notify('Quán dọn hàng rồi · đứng dậy thôi.', 2500); }
    if (seat) {
      const info = missions.view(), timed = info.status === 'active' && info.remainingSeconds !== null && info.started;
      if ((keys.has(' ') || keys.has('space')) && police.wanted === 0 && !timed && !sideMissions.active) atmosphere.setHours(atmosphere.hours + (dt * 5) / SECONDS_PER_HOUR);
      if (police.wanted === 1 && !policeSeeing(state.x, state.z, 45)) {
        blendFor += dt;
        if (blendFor > 10) { police.reset(); blendFor = 0; notify('Ngồi lẫn vào đám đông · cảnh sát đã mất dấu bạn.', 3500); }
      } else blendFor = 0;
    }
    // A plate reported stolen: an officer close by who sees it calls it in.
    if (playerCar && hotCars.has(playerCar)) {
      if (time > hotCars.get(playerCar)!) hotCars.delete(playerCar);
      else if (police.wanted === 0 && policeSeeing(state.x, state.z, 25)) { police.crime(1, time); notify('Công an nhận ra biển số xe bị báo mất!', 3000); }
    }
    const f = focus && !focus.view.dim && !zombieMode ? focus : null;
    focusMark.visible = !!f && !hold;
    if (f) {
      const e = f.entry, g = groundHeight(e.x, e.z);
      focusMark.position.set(e.x, g + 0.04, e.z);
      focusDiamond.position.y = (e.kind === 'seat' ? 1.3 : e.kind === 'vehicle' ? 2.0 : e.kind === 'person' ? 2.4 : 2.9) + Math.sin(time * 3) * 0.08;
      focusDiamond.rotation.y = time * 1.6;
      const red = !!f.view.crime;
      (focusDiamond.material as THREE.MeshBasicMaterial).color.set(red ? '#ff6a55' : '#ffffff');
      (focusHalo.material as THREE.MeshBasicMaterial).color.set(red ? '#ff6a55' : '#fff6dc');
      focusHalo.scale.setScalar(e.kind === 'vehicle' ? 1.6 : e.kind === 'seat' ? 0.9 : 1.2);
    }
  }
  function mapPins(): MapPin[] {
    const pins = STATIC_PINS.slice();
    if (playerLastCar && playerLastCar !== playerCar && playerLastCar.mode !== 'off') pins.push({ kind: 'car', x: Math.round(playerLastCar.x), z: Math.round(playerLastCar.z) });
    if (vx.impound?.list().length) pins.push({ kind: 'impound', x: Math.round(LANDMARKS.police.x), z: Math.round(LANDMARKS.police.z) });
    if (!state.riding || playerCar) pins.push({ kind: 'bike', x: Math.round(bikeX), z: Math.round(bikeZ) });
    return pins;
  }
  /** Map pins that never move: bus stops, ATMs and piers. */
  const STATIC_PINS: MapPin[] = [
    ...SCENERY.busStops.map((b) => ({ kind: 'bus' as const, x: Math.round(b.x), z: Math.round(b.z) })),
    ...ATM_SPOTS.map((a) => ({ kind: 'atm' as const, x: Math.round(a.x), z: Math.round(a.z) })),
    ...SCENERY.docks.filter((d) => !d.rental).map((d) => ({ kind: 'ferry' as const, x: Math.round(d.ring.x), z: Math.round(d.ring.z) })),
  ];

  function action() {
    if (powers.altitude > 0.05 || powers.flying) { notify('Nhấn G để hạ cánh trước khi tương tác.'); return; }
    if (!active || down) return;
    const now = performance.now();
    const time = now / 1000;
    if (glide) { if (glide.phase === 'deck') leaveDeck(); return; }
    if (boat) { leaveBoat(now); return; }
    // A hold already running is finished by holding, not by pressing again.
    if (hold) return;
    if (ride) { ride.onLeave(); return; }
    if (seat) {
      // At a café or stall stool E orders; anywhere else it gets up (moving also gets up).
      if (seat.eatery && !zombieMode && isOpen(COUNTERS[seat.eatery.key].hours, atmosphere.hours)) openCounter(seat.eatery);
      else leaveSeat();
      return;
    }
    if (!state.riding && boats.rental.mode === 'player' && (swimming || dockAt(state.x, state.z)) && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) < 4.2) { boardBoat(); return; }
    const info = missions.view();
    const needsVehicleChange = (info.requiresOnFoot && state.riding) || (info.requiresBike && !isMotorbike());
    const missionEvent = missions.interact(missionPlayer());
    if (missionEvent) {
      if (!needsVehicleChange && info.step > 0 && ['coffee', 'market', 'post'].includes(info.id)) {
        receiverSpot = info.target;
        receiverHappyUntil = now + 6000;
      }
      handleMissionEvent(missionEvent);
      // E must still allow mounting or dismounting at a restricted objective.
      if (!needsVehicleChange) return;
    }
    const offer = sideMissions.nearOffer(state.x, state.z);
    if (offer) {
      sideMissions.start(offer, time, missionContext(time));
      notify(`Nhận việc: ${offer.def.title} · ${offer.def.intro}`, 4500);
      return;
    }
    // Everything else E can do here is the registry's focus (shops, counters, seats, vehicles, people...).
    if (actOnFocus(now)) return;
    if (state.riding) exitVehicle();
  }

  function spaceAction() {
    const now = performance.now();
    if (!active) return;
    if (powers.altitude > 0.05 || powers.flying) return;
    if (glide) { if (glide.phase === 'deck') jumpFromDeck(now); else if (glide.phase === 'fall') openChute(now); return; }
    if (state.riding || boat) return;
    if (swimming) { climbOut(); return; }
    // Facing the river from the promenade: over the railing and into the water.
    const vault = jumpY === 0 ? vaultSpot() : null;
    if (vault && swimClear(vault.x, vault.z)) {
      bodyY = groundHeight(state.x, state.z) + 0.8;
      state.x = vault.x;
      state.z = vault.z;
      velocity = 0;
      return;
    }
    if (jumpY === 0) jumpV = 5.6;
  }
  /** Facing the water from just behind a climbable bank (the promenade railing): where a vault over it lands. */
  function vaultSpot() {
    const hit = bankNear(state.x, state.z, Infinity, true);
    if (!hit) return null;
    const b = hit.bank;
    if (!(hit.d > -b.vault) || !(Math.sin(state.angle) * b.nx + Math.cos(state.angle) * b.nz > 0.4) || dockAt(state.x + b.nx * 1.4, state.z + b.nz * 1.4)) return null;
    return { x: hit.x + b.nx * b.drop, z: hit.z + b.nz * b.drop };
  }
  /** Out of the water: up a moored ship's fenders or ladder, onto a pier alongside, or up a climbable bank (the promenade wall). */
  function climbOut() {
    const up = climbNear(state.x, state.z, 1.6);
    if (up && clearAt(up.toX, up.toZ, 0.35)) {
      state.x = up.toX;
      state.z = up.toZ;
      swimming = false;
      bodyY = groundHeight(state.x, state.z);
      jumpV = 2.4;
      notify(up.name === 'pilot-ladder' ? 'Leo thang dây lên boong tàu.' : 'Bám lốp chống va leo lên boong tàu.', 2000);
      return;
    }
    const dock = pierNear(state.x, state.z, 1.4);
    if (dock) {
      const p = dock.landings[0];
      state.x = Math.max(p.minX, Math.min(p.maxX, state.x));
      state.z = Math.max(p.minZ, Math.min(p.maxZ, state.z));
      swimming = false;
      bodyY = groundHeight(state.x, state.z);
      jumpV = 2.4;
      return;
    }
    const hit = bankNear(state.x, state.z, Infinity, true);
    let blocked = false;
    if (hit && hit.d < hit.bank.reach) {
      // Up the wall onto the walk behind it: straight up, else a little along it or further in (a bollard, a bench, a railing post).
      const b = hit.bank, tx = -b.nz, tz = b.nx, inset = b.inset ?? 0;
      for (const back of [b.land, b.land + 0.7, Math.max(inset + 0.45, b.land - 0.5)]) for (const along of [0, 0.8, -0.8, 1.6, -1.6]) {
        const x = hit.x - b.nx * back + tx * along, z = hit.z - b.nz * back + tz * along;
        if (!clearAt(x, z, 0.4)) continue;
        state.x = x;
        state.z = z;
        swimming = false;
        // (onto a bridge's ramp where its abutment meets the bank)
        bodyY = groundHeight(state.x, state.z);
        jumpV = 2.4;
        return;
      }
      blocked = true;
    }
    const near = bankNear(state.x, state.z, 2.5);
    notify(near?.bank.kind === 'far'
      ? near.bank.water === 0 && near.bank.nz > 0.5 ? 'Bờ bên kia có hàng rào, không lên được. Bơi về phía phố.' : 'Bờ này là đất dự án, rào kín, không lên được. Bơi sang bờ bên kia.'
      : blocked ? 'Trên bờ vướng đồ, bơi dọc bờ thêm một đoạn rồi leo lên.' : 'Bơi sát bờ kè hoặc cầu tàu rồi nhấn Space để leo lên.', 2500);
  }

  // ---- The hire boat ----
  const BOAT_PRICE = 30, BOAT_TOP = 15.5, BOAT_ACCEL = 5.2, BOAT_REVERSE = 4;
  function hireBoat(dock: Dock) {
    if (zombieMode) { notify('Không ai cho thuê ca nô giữa lúc này.', 2500); return; }
    if (boats.rental.mode === 'player' && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) < 40) { notify('Ca nô của bạn đang neo gần đây. Lại gần và nhấn E để lên.', 2500); return; }
    if (cash < BOAT_PRICE) { notify(`Thuê ca nô cần ${formatThousands(BOAT_PRICE)}.`, 2500); return; }
    cash -= BOAT_PRICE;
    // Moored off the west side of the pier's end, bow out to the river.
    boats.launch(dock.pier.minX - 2.1, dock.pier.minZ + 2.6, Math.PI);
    boardBoat();
    notify('Đã thuê ca nô · W ga · S lùi · A/D bẻ lái · Space thắng · E cập bến hoặc nhảy xuống sông', 4500);
  }
  function boardBoat() {
    boat = boats.rental;
    swimming = false;
    Object.assign(state, { x: boat.x, z: boat.z, angle: boat.yaw });
    velocity = boat.speed = 0;
    boatVX = boatVZ = boatTurn = 0;
    jumpY = jumpV = 0;
  }
  function leaveBoat(now: number) {
    const b = boat!;
    if (Math.abs(b.speed) > 2.5) { notify('Giảm tốc trước khi rời ca nô'); return; }
    // Onto a pier or the steps if one is alongside, otherwise over the side into the water.
    let best: { x: number; z: number } | null = null, bestD = 6.5;
    for (const d of TERRAIN.docks) for (const r of d.landings) {
      const px = Math.max(r.minX, Math.min(r.maxX, b.x)), pz = Math.max(r.minZ, Math.min(r.maxZ, b.z));
      const dd = Math.hypot(px - b.x, pz - b.z);
      if (dd < bestD) { bestD = dd; best = { x: px, z: pz }; }
    }
    if (!best) {
      for (const side of [1, -1]) {
        const x = b.x + Math.cos(b.yaw) * side * 2, z = b.z - Math.sin(b.yaw) * side * 2;
        if (swimClear(x, z) && !boats.hit(x, z, 0.4)) { best = { x, z }; break; }
      }
    }
    if (!best) { notify('Không có chỗ để xuống. Lái ra chỗ thoáng hơn.'); return; }
    b.speed = 0;
    boatVX = boatVZ = 0;
    boat = null;
    boatLeftAt = now;
    velocity = 0;
    state.x = best.x;
    state.z = best.z;
    // Over the side under a bridge: into the water, not onto the deck above.
    bodyY = Math.max(groundHeight(state.x, state.z, waterLevel(state.x, state.z) + 0.4), waterLevel(state.x, state.z) + 0.4);
  }
  function driveBoat(dt: number, now: number, throttle: number, steerInput: number, braking: boolean) {
    const b = boat!;
    let accel = 0;
    if (throttle > 0) accel = b.speed < -0.5 ? 7 : BOAT_ACCEL * Math.max(0, 1 - (b.speed / BOAT_TOP) ** 2);
    else if (throttle < 0) accel = b.speed > 0.5 ? -6.5 : -BOAT_ACCEL * 0.5 * Math.max(0, 1 - (b.speed / -BOAT_REVERSE) ** 2);
    else accel = -b.speed * 0.45;
    if (braking) accel -= b.speed * 1.6;
    b.speed += accel * dt;
    if (!throttle && Math.abs(b.speed) < 0.08) b.speed = 0;
    // The rudder only bites with water flowing past it; a right turn (D) lowers the heading angle.
    steer = THREE.MathUtils.damp(steer, steerInput, 4.5, dt);
    const bite = Math.min(1, Math.abs(b.speed) / 3.5) * Math.sign(b.speed || 1);
    boatTurn = THREE.MathUtils.damp(boatTurn, steer * 1.2 * bite * (1 - Math.min(0.35, Math.abs(b.speed) / 40)), 3.2, dt);
    b.yaw -= boatTurn * dt;
    // The hull slides: its velocity swings round to the new heading with some lag.
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    boatVX = THREE.MathUtils.damp(boatVX, fx * b.speed, 2.4, dt);
    boatVZ = THREE.MathUtils.damp(boatVZ, fz * b.speed, 2.4, dt);
    const nx = b.x + boatVX * dt, nz = b.z + boatVZ * dt;
    if (boatClear(nx, nz, b.yaw)) { b.x = nx; b.z = nz; }
    else {
      const impact = Math.hypot(boatVX, boatVZ);
      if (boatClear(nx, b.z, b.yaw)) b.x = nx; else boatVX *= -0.3;
      if (boatClear(b.x, nz, b.yaw)) b.z = nz; else boatVZ *= -0.3;
      b.speed *= 0.4;
      if (impact > 4) { shake = Math.max(shake, Math.min(0.5, impact * 0.04)); playThud(); }
    }
    // Planing hulls bank into the turn.
    b.bank = THREE.MathUtils.damp(b.bank, THREE.MathUtils.clamp(Math.atan(b.speed * boatTurn / 9.81) * 0.5, -0.2, 0.2), 5, dt);
    state.x = b.x;
    state.z = b.z;
    state.angle = b.yaw;
    velocity = b.speed;
    if (Math.abs(b.speed) > 6 && now > splashAt) {
      splashAt = now + 90;
      effects.smoke(b.x + fx * 2.8 + (Math.random() - 0.5) * 1.6, WATER_LEVEL + 0.25, b.z + fz * 2.8 + (Math.random() - 0.5) * 1.6, now, false, '#eef6f4');
    }
    if (now - manualCameraAt > 1500 && Math.abs(b.speed) > 2) view.yaw = angleLerp(view.yaw, b.yaw + Math.PI, 1 - Math.exp(-dt * 1.2));
  }
  function splash(x: number, z: number, now: number, size: number) {
    for (let k = 0; k < 3 + size * 3; k++) effects.smoke(x + (Math.random() - 0.5) * 1.6 * size, WATER_LEVEL + 0.2, z + (Math.random() - 0.5) * 1.6 * size, now, false, '#eef6f4');
    playThud();
  }

  // ---- The observation deck and the parachute jump ----
  /** A supertall with an observation deck on its central tube and the parachute jump off it (world building id). */
  type DeckTower = { id: number; name: string; floor: number; price: number; jumpYaw: number };
  const DECKS: Record<string, DeckTower> = { deck: { id: LANDMARKS.tower.id, name: LANDMARKS.tower.name, floor: 68, price: 50, jumpYaw: LANDMARKS.tower.facing } };
  {
    // THÁP BỜ SÔNG (Bình Thạnh, BINH_THANH_EXTRA.deck): its deck on floor 79, the jump off the north face over the park.
    const bt = DISTRICT_STAMPS.find((s) => s.id === 'thap-bo-song' && s.building >= 0);
    if (bt) DECKS['deck-bo-song'] = { id: bt.building, name: WORLD_BUILDINGS[bt.building].name, floor: 79, price: 200, jumpYaw: Math.PI };
  }
  /** The tower the player is up (or was last up). */
  let deckTower: DeckTower = DECKS.deck;
  /** The jump-off point at the edge of the supertall's central tube that faces the jump. */
  function deckSpot(t: DeckTower) {
    const f = WORLD_PLOTS[t.id].full;
    const tube = (Math.min(f.maxX - f.minX, f.maxZ - f.minZ) - 2) / 3;
    const fx = Math.round(Math.sin(t.jumpYaw)), fz = Math.round(Math.cos(t.jumpYaw));
    return { x: (f.minX + f.maxX) / 2 + fx * (tube / 2 - 1), z: (f.minZ + f.maxZ) / 2 + fz * (tube / 2 - 1), y: WORLD_PLOTS[t.id].h + 0.2, yaw: t.jumpYaw };
  }
  function enterDeck(t: DeckTower = DECKS.deck) {
    if (cash < t.price) { notify(`Vé lên đài quan sát: ${formatThousands(t.price)}.`, 2500); return; }
    cash -= t.price;
    dip();
    deckTower = t;
    const spot = deckSpot(t);
    glide = { phase: 'deck', y: spot.y, vy: 0, speed: 0, since: performance.now() };
    Object.assign(state, { x: spot.x, z: spot.z, angle: spot.yaw });
    velocity = 0;
    Object.assign(view, { yaw: spot.yaw + Math.PI + 0.7, pitch: 0.38, dist: 16 });
    manualCameraAt = performance.now();
    notify(`Đài quan sát ${t.name} · WASD đi dạo · Space nhảy dù · E đi thang máy xuống`, 7000);
  }
  function leaveDeck() {
    dip();
    glide = null;
    const b = WORLD_BUILDINGS[deckTower.id], door = b.door;
    Object.assign(state, { x: door.x, z: door.z, angle: b.facing });
    bodyY = groundHeight(door.x, door.z);
  }
  /** Walking about the top of the central tube (round the spire), camera-relative like on the street. */
  function deckWalk(dt: number, vertical: number, horizontal: number) {
    const f = WORLD_PLOTS[deckTower.id].full;
    const tube = (Math.min(f.maxX - f.minX, f.maxZ - f.minZ) - 2) / 3, cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
    const fx = firstPerson() ? Math.sin(cameraMode.yaw) : -Math.sin(smoothView.yaw), fz = firstPerson() ? Math.cos(cameraMode.yaw) : -Math.cos(smoothView.yaw);
    const dx = fx * vertical - fz * horizontal, dz = fz * vertical + fx * horizontal;
    const moving = dx !== 0 || dz !== 0;
    velocity = moving ? 2.4 : 0;
    if (firstPerson()) state.angle = cameraMode.yaw;
    if (!moving) return false;
    if (!firstPerson()) state.angle = angleLerp(state.angle, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
    const len = Math.hypot(dx, dz);
    const nx = state.x + (dx / len) * velocity * dt, nz = state.z + (dz / len) * velocity * dt;
    const inside = (x: number, z: number) => Math.abs(x - cx) < tube / 2 - 0.5 && Math.abs(z - cz) < tube / 2 - 0.5 && Math.hypot(x - cx, z - cz) > 1.3;
    if (inside(nx, state.z)) state.x = nx;
    if (inside(state.x, nz)) state.z = nz;
    return true;
  }
  function jumpFromDeck(now: number) {
    if (!glide) return;
    glide = { phase: 'fall', y: glide.y + 0.4, vy: 3, speed: 6, since: now };
    // Watch the jump from the side so the tower is not in the way.
    Object.assign(view, { yaw: state.angle + Math.PI + 0.9, pitch: 0.3, dist: 22 });
    notify('Rơi tự do! Nhấn Space để bung dù', 3000);
  }
  function openChute(now: number) {
    if (!glide || glide.phase !== 'fall') return;
    glide.phase = 'chute';
    glide.since = now;
    playThud();
    notify('Dù đã bung · A/D lái · W lao nhanh · S hãm', 3000);
  }
  /** Something taller than the jumper in the way: a building whose roof is above them, or (low down) trees and lamps. */
  function airBlocked(x: number, z: number, y: number) {
    for (let i = 0, n = roofs.containing(x, z, 0.6, roofHits); i < n; i++) if (roofs.top(roofHits[i]) > y - 0.4) return true;
    return y < 8 && !worldClear(x, z, 0.4);
  }
  /** The highest roof under the jumper (0 over open ground). */
  function roofUnder(x: number, z: number, y: number) {
    let roof = 0;
    for (let i = 0, n = roofs.containing(x, z, 0.3, roofHits); i < n; i++) {
      const h = roofs.top(roofHits[i]);
      if (h <= y + 0.5 && h > roof) roof = h;
    }
    return roof;
  }
  function glideMove(dt: number, now: number, vertical: number, horizontal: number) {
    const g = glide!;
    if (g.phase === 'deck') return deckWalk(dt, vertical, horizontal);
    state.angle -= horizontal * (g.phase === 'chute' ? 1.1 : 0.6) * dt;
    if (g.phase === 'fall') {
      g.vy = Math.max(-26, g.vy - 9.8 * dt);
      g.speed = THREE.MathUtils.damp(g.speed, 9 + vertical * 4, 1.5, dt);
      // The automatic opener fires if the jumper leaves it too late.
      if (now - g.since > 5200) openChute(now);
    } else {
      g.vy = THREE.MathUtils.damp(g.vy, vertical > 0 ? -9 : vertical < 0 ? -3.2 : -5.5, 2.2, dt);
      g.speed = THREE.MathUtils.damp(g.speed, vertical > 0 ? 12 : vertical < 0 ? 4.5 : 8, 1.4, dt);
    }
    velocity = g.speed;
    const nx = state.x + Math.sin(state.angle) * g.speed * dt, nz = state.z + Math.cos(state.angle) * g.speed * dt;
    // Not out over land nobody has built yet (beyond the project hoardings): the canopy turns back as from a wall.
    if (!airBlocked(nx, state.z, g.y) && inPlay(nx, state.z)) state.x = nx; else g.speed *= 0.5;
    if (!airBlocked(state.x, nz, g.y) && inPlay(state.x, nz)) state.z = nz; else g.speed *= 0.5;
    state.x = Math.max(bounds.minX + 1, Math.min(bounds.maxX - 1, state.x));
    state.z = Math.max(bounds.minZ + 1, Math.min(bounds.maxZ - 1, state.z));
    g.y += g.vy * dt;
    // Over a lower roof the canopy carries the jumper across it rather than down onto it.
    const roof = roofUnder(state.x, state.z, g.y);
    if (roof > 0 && g.y < roof + 1.3) { g.y = roof + 1.3; g.vy = Math.max(g.vy, -0.5); }
    const ground = groundHeight(state.x, state.z, g.y), level = waterLevel(state.x, state.z);
    const water = ground < level - SWIM_DEPTH;
    if (g.y <= (water ? level : ground)) land(now, water);
    return true;
  }
  function land(now: number, water: boolean) {
    const g = glide!;
    const hard = g.phase === 'fall' ? -g.vy : 0;
    glide = null;
    jumpY = jumpV = 0;
    motion.land = 1;
    velocity = g.speed * 0.3;
    if (water) { bodyY = waterLevel(state.x, state.z); splash(state.x, state.z, now, 2); notify(hard > 14 ? 'Ùm! Rơi thẳng xuống sông.' : 'Đáp xuống sông! Bơi vào bờ thôi.', 3000); return; }
    // (onto a bridge deck only from above it: g.y is the jumper's height)
    bodyY = groundHeight(state.x, state.z, g.y);
    if (hard > 14) {
      damagePlayer(Math.min(90, hard * 3), now, undefined, 'Rơi tự do');
      if (down !== 'wasted') knockPlayer(Math.sin(state.angle) * 4, 2, Math.cos(state.angle) * 4, now);
      return;
    }
    state.score += 40;
    notify('Tiếp đất an toàn! +40 điểm', 2500);
  }

  // ---- The bank job ----
  const HEIST_MS = 9000;
  function startHeist(now: number) {
    if (zombieMode) { notify('Ngân hàng đã đóng cửa từ khi dịch bùng phát.', 2500); return; }
    if (weapon === 'fists') { notify('Phải có súng mới cướp được ngân hàng.', 2500); return; }
    if (now < bankReadyAt) { notify(`Ngân hàng đang bị phong tỏa. Quay lại sau ${Math.ceil((bankReadyAt - now) / 60000)} phút.`, 3000); return; }
    heist = { started: now, until: now + HEIST_MS };
    police.crime(3, now / 1000);
    npcs.alarm(state.x, state.z, 30, now / 1000);
    showBanner('CƯỚP NGÂN HÀNG!', now, 2200);
    notify('Đứng trong sảnh để giao dịch viên mở két · đừng đi xa cửa', 3500);
  }
  function updateHeist(now: number) {
    if (!heist) return;
    const door = LANDMARKS.bank.door;
    if (down || state.riding || boat || Math.hypot(state.x - door.x, state.z - door.z) > 7) {
      heist = null;
      bankReadyAt = now + 60000;
      notify('Phi vụ thất bại: bạn đã bỏ đi trước khi két mở.', 3000);
      return;
    }
    if (now > heist.until) {
      const take = 1200 + Math.floor(Math.random() * 900);
      cash += take;
      state.score += 150;
      // The alarm has gone out: the whole force is coming.
      police.crime(12, now / 1000);
      heist = null;
      bankReadyAt = now + 5 * 60000;
      notify(`Đã vét két: +${formatThousands(take)}! Chạy ngay, cảnh sát đang ập tới!`, 4500);
    }
  }

  /**
   * Gets the player out of anywhere they cannot move from (a fence they were thrown against, the gap between
   * a car and a wall, the top of the river wall): after a moment they are moved to the nearest free spot.
   */
  function unstick(dt: number) {
    if (glide || interior || playerBody || down) { stuckFor = 0; return; }
    const test = (x: number, z: number) => (boat ? boatClear(x, z, state.angle) : state.riding ? vehicleClear(x, z, state.angle) : footClear(x, z) || clearAt(x, z, 0.4));
    stuckFor = test(state.x, state.z) || (boat && navigable(state.x, state.z, 0.3)) ? 0 : stuckFor + dt;
    if (stuckFor < 0.6) return;
    stuckFor = 0;
    const move = (x: number, z: number) => {
      state.x = x; state.z = z;
      if (boat) { boat.x = x; boat.z = z; }
      else if (playerCar) { playerCar.x = x; playerCar.z = z; }
      else if (state.riding) { bikeX = x; bikeZ = z; }
      bodyY = Math.max(bodyY, groundHeight(x, z, bodyY));
    };
    for (let r = 0.6; r <= 14; r += 0.6) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = state.x + Math.cos(a) * r, z = state.z + Math.sin(a) * r;
        if (inBounds(x, z, 0.5) && test(x, z)) { move(x, z); return; }
      }
    }
    // Last resort: the nearest sidewalk (on foot).
    if (state.riding) leaveVehicleNow();
    if (boat) boat = null;
    swimming = false;
    const s = nav.snap(state.x, state.z);
    move(s.x, s.z);
  }

  function cycleWeapon() {
    const list = WEAPONS.filter((w) => owned.has(w.id));
    const index = list.findIndex((w) => w.id === weapon);
    equip(list[(index + 1) % list.length].id);
  }

  function setInput(key: string, pressed: boolean) {
    const normalized = key.toLowerCase();
    if (pressed && !keys.has(normalized)) {
      if (normalized === 'e' || normalized === 'key e') action();
      // Riding along, F (the fire key) also asks to get off.
      if (normalized === 'f' && ride && active) ride.onLeave();
      else if (normalized === 'f') { triggerQueued = true; unlockAudio(); }
      if (normalized === 'q') cycleWeapon();
      if (normalized === 'r') startReload(performance.now());
      if (normalized === 'j') selectHero(HEROES[(HEROES.findIndex((hero) => hero.id === powers.hero) + 1) % HEROES.length].id);
      if (normalized === 'k') castPower();
      if (normalized === 'g') toggleFlight();
      if (normalized === 'b') toggleCameraMode();
      if (normalized === 'v') { Object.assign(view, CAMERA_DEFAULT); cameraMode.reset(state.angle); }
      if (normalized === 'tab') setBag(true);
      // H puts the hands up for the police (or lowers them again).
      if (normalized === 'h') {
        if (surrendered) { surrendered = false; notify('Bạn hạ tay xuống.', 1500); }
        else if (police.wanted > 0 && !state.riding && !down) { surrendered = true; notify('Bạn giơ tay đầu hàng. Cảnh sát sẽ tới còng tay.', 3000); }
        else if (!police.wanted) notify('Không có ai đang truy bắt bạn.', 1500);
      }
      // Space jumps on foot (vaults the river railing, climbs out of the water, jumps off the deck, opens the
      // parachute); on a vehicle it stays the brake. Sitting, riding along, holding E or in a menu it belongs to
      // that activity (held while seated, it makes time pass faster).
      if ((normalized === ' ' || normalized === 'space') && !down && performance.now() > stunUntil && !activityBusy()) spaceAction();
      const slot = Number(normalized);
      if (slot >= 1 && slot <= WEAPONS.length && !equip(WEAPONS[slot - 1].id)) notify(`Chưa có ${WEAPONS[slot - 1].name}. Mua ở Tiệm súng.`);
    }
    if (!pressed && normalized === 'tab') setBag(false);
    if (pressed) keys.add(normalized);
    else keys.delete(normalized);
  }
  function setBag(open: boolean) {
    if (bagOpen === open) return;
    bagOpen = open;
    onEvent({ type: 'bag', open });
  }
  function onKeyDown(event: KeyboardEvent) {
    if (focusedInput() || !active) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(event.key)) event.preventDefault();
    if (event.repeat && event.key === 'Tab') return;
    setInput(event.key, true);
  }
  function onKeyUp(event: KeyboardEvent) { setInput(event.key, false); }
  function clearKeys() { keys.clear(); mouseHeld = false; triggerQueued = false; setBag(false); }
  function onVisibility() { previousTime = performance.now(); if (document.hidden) clearKeys(); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', onVisibility);

  // Camera: right/middle drag (or one-finger drag on touch) orbits, wheel or pinch zooms.
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  // Crosshair drawn over the canvas: a ring that widens with spread and turns red over a target, a dot,
  // and a hit marker (red for a head shot).
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const reticle = document.createElement('div');
  reticle.setAttribute('aria-hidden', 'true');
  reticle.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;display:none;z-index:2;will-change:transform';
  const reticleRing = document.createElement('div');
  reticleRing.style.cssText = 'position:absolute;border:2px solid rgba(255,255,255,.95);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 0 0 1px rgba(0,0,0,.25);transform:translate(-50%,-50%)';
  const reticleDot = document.createElement('div');
  reticleDot.style.cssText = 'position:absolute;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.45)';
  const reticleHit = document.createElement('div');
  reticleHit.textContent = '✕';
  reticleHit.style.cssText = 'position:absolute;transform:translate(-50%,-52%);font:800 24px/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000;opacity:0';
  for (const part of [reticleRing, reticleDot, reticleHit]) reticle.appendChild(part);
  container.appendChild(reticle);
  // A quick dip to black when walking into or out of a shop.
  const fade = document.createElement('div');
  fade.setAttribute('aria-hidden', 'true');
  fade.style.cssText = 'position:absolute;inset:0;background:#0d1210;opacity:0;pointer-events:none;z-index:2';
  container.appendChild(fade);
  function dip() {
    fade.style.transition = 'none';
    fade.style.opacity = '1';
    void fade.offsetWidth;
    fade.style.transition = 'opacity .45s ease-out';
    fade.style.opacity = '0';
  }
  const touches = new Map<number, { x: number; y: number }>();
  let rotating: { id: number; x: number; y: number } | null = null;
  function rotateBy(dx: number, dy: number) {
    if (firstPerson()) { cameraMode.rotate(dx, dy); manualCameraAt = performance.now(); return; }
    view.yaw -= dx * 0.0058;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * 0.004, 0.16, 1.4);
    manualCameraAt = performance.now();
  }
  function zoomBy(factor: number) {
    if (firstPerson()) return;
    view.dist = THREE.MathUtils.clamp(view.dist * factor, 8, 90);
  }
  function capture(pointerId: number) {
    // Capture fails if the pointer was already released; dragging still works without it.
    try { canvas.setPointerCapture(pointerId); } catch { /* ignore */ }
  }
  function trackPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    pointerPx.set(event.clientX - rect.left + canvas.offsetLeft, event.clientY - rect.top + canvas.offsetTop);
  }
  /** The shop product under the pointer, if a shop is open. */
  function productAt(event: PointerEvent) {
    trackPointer(event);
    raycaster.setFromCamera(pointerNdc, camera);
    return interiors.pick(raycaster);
  }
  function onPointerDown(event: PointerEvent) {
    if (interior) {
      // Clicking an item in the shop looks at it and picks it in the shop panel.
      const id = productAt(event);
      productFocus = id;
      interiors.setHovered(id);
      if (id) onEvent({ type: 'product', id });
      return;
    }
    if (!active) return;
    unlockAudio();
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      capture(event.pointerId);
      return;
    }
    trackPointer(event);
    pointerInside = true;
    if (firstPerson() && event.button === 0 && document.pointerLockElement !== canvas && canvas.requestPointerLock && !pointerLockFailed) {
      try { const request = canvas.requestPointerLock(); request?.catch(() => { pointerLockFailed = true; }); } catch { pointerLockFailed = true; }
      return;
    }
    if (event.button === 1 || event.button === 2) {
      rotating = { id: event.pointerId, x: event.clientX, y: event.clientY };
      capture(event.pointerId);
      event.preventDefault();
    } else if (event.button === 0) {
      mouseHeld = true;
      triggerQueued = true;
      capture(event.pointerId);
    }
  }
  function onPointerMove(event: PointerEvent) {
    if (document.pointerLockElement === canvas && firstPerson() && active) { rotateBy(event.movementX, event.movementY); return; }
    if (interior && event.pointerType !== 'touch') {
      productHover = productAt(event);
      interiors.setHovered(productHover ?? productFocus);
      return;
    }
    if (event.pointerType === 'touch') {
      const previous = touches.get(event.pointerId);
      if (!previous || !active) return;
      if (touches.size === 1) rotateBy(event.clientX - previous.x, event.clientY - previous.y);
      else if (touches.size === 2) {
        const other = [...touches.entries()].find(([id]) => id !== event.pointerId)![1];
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        if (before > 10 && after > 10) zoomBy(before / after);
      }
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      return;
    }
    trackPointer(event);
    pointerInside = true;
    if (rotating && rotating.id === event.pointerId) {
      rotateBy(event.clientX - rotating.x, event.clientY - rotating.y);
      rotating.x = event.clientX;
      rotating.y = event.clientY;
    }
  }
  function onPointerUp(event: PointerEvent) {
    touches.delete(event.pointerId);
    if (rotating?.id === event.pointerId) rotating = null;
    if (event.pointerType !== 'touch' && event.button === 0) mouseHeld = false;
  }
  function onPointerLeave() { pointerInside = false; }
  function onWheel(event: WheelEvent) {
    if (!active) return;
    event.preventDefault();
    zoomBy(Math.exp(event.deltaY * 0.0012));
  }
  function onContextMenu(event: Event) { event.preventDefault(); }
  function onLookLockChanged() { if (document.pointerLockElement !== canvas) { mouseHeld = false; triggerQueued = false; clearKeys(); } }
  function onLookLockError() { pointerLockFailed = true; }
  document.addEventListener('pointerlockchange', onLookLockChanged);
  document.addEventListener('pointerlockerror', onLookLockError);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  function removePeer(id: string, peer: Peer) {
    scene.remove(peer.group);
    if (peer.body) ragdolls.remove(peer.body);
    disposeTree(peer.group);
    peers.delete(id);
  }

  function setPeers(nextPeers: PeerState[], serverTime?: number) {
    if (!nextPeers.length) {
      for (const [id, peer] of peers) removePeer(id, peer);
      peerClock.reset();
      return;
    }
    const receivedAt = performance.now();
    // Untimestamped callers still work, using the same local monotonic domain.
    const snapshotTime = serverTime ?? receivedAt;
    if (!peerClock.observe(snapshotTime, receivedAt)) return;
    const incomingIds = new Set(nextPeers.map((p) => p.id));
    for (const [id, peer] of peers) if (!incomingIds.has(id)) removePeer(id, peer);
    for (const peer of nextPeers) {
      if (![peer.x, peer.z, peer.angle, peer.speed, peer.score].every(Number.isFinite)) continue;
      let existing = peers.get(peer.id);
      if (existing && (existing.name !== peer.name || existing.color !== peer.color)) {
        removePeer(peer.id, existing);
        existing = undefined;
      }
      if (!existing) {
        const group = new THREE.Group();
        const color = /^#[0-9a-f]{6}$/i.test(peer.color) ? peer.color : '#5b86b7';
        const foot = makePerson(color);
        const peerHeroLook = createHeroLook(foot.group);
        const peerBike = makeBike('scooter', color, color);
        const label = makeLabel(peer.name.slice(0, 20), '#23493f');
        label.position.y = 2.9;
        label.scale.set(4, 1, 1);
        const peerGuns = new Map<WeaponId, THREE.Group>();
        for (const id of ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const) {
          const gun = holdGun(foot, id, makeGun(id).group) as THREE.Group;
          gun.visible = false;
          peerGuns.set(id, gun);
        }
        group.add(foot.group, peerBike.group, label);
        group.position.set(peer.x, 0, peer.z);
        foot.group.rotation.y = peer.angle;
        peerBike.group.rotation.y = peer.angle;
        group.traverse((o) => { o.castShadow = false; });
        scene.add(group);
        existing = { group, foot, bike: peerBike, car: null, carKind: 'foot', boat: null, guns: peerGuns, label, target: { ...peer }, motion: createPeerInterpolator(), name: peer.name, color: peer.color, body: null, flashAt: 0, hurtAt: -99, predicted: 0, heroLook: peerHeroLook, powerSeq: peer.powerSeq ?? 0 };
        peers.set(peer.id, existing);
      }
      if (!existing.motion.push(peer, snapshotTime)) continue;
      const sequence = peer.powerSeq ?? 0;
      if (sequence < existing.powerSeq) existing.powerSeq = sequence;
      if (sequence > existing.powerSeq) {
        existing.powerSeq = sequence;
        if (!peer.down && peer.powerKind && peer.powerKind !== 'none' && peer.powerX !== undefined && peer.powerZ !== undefined) {
          const origin = { x: peer.x, y: groundHeight(peer.x, peer.z) + 1.1 + (peer.altitude ?? 0), z: peer.z };
          const target = { x: peer.powerX, y: peer.powerY ?? groundHeight(peer.powerX, peer.powerZ) + 1.1, z: peer.powerZ };
          powerEffects.cast(peer.powerKind, origin, target, receivedAt, peer.powerKind === 'captain' ? () => ({ x: existing!.group.position.x, y: existing!.group.position.y + 1.1, z: existing!.group.position.z }) : undefined);
        }
      }
      // A fresh health report replaces our local damage prediction.
      if (existing.target.health !== peer.health) existing.predicted = 0;
      existing.target = { ...peer };
    }
  }

  function peerVehicle(peer: Peer): VehicleKind {
    return peer.target.vehicle ?? (peer.target.riding ? 'scooter' : 'foot');
  }

  /** Attacking another player is a crime too. */
  function hitPeer(id: string, peer: Peer, damage: number, dx: number, dz: number, now: number) {
    if (peer.target.down) return;
    if (pendingHits.length >= 128) return;
    pendingHits.push({ target: id, damage: Math.round(damage), dx, dz });
    peer.hurtAt = now / 1000;
    peer.predicted += damage;
    police.crime(1, now / 1000);
  }

  /** Tears off limbs after a violent death: explosions, point-blank shotgun blasts, fast vehicles. */
  function dismember(body: RagdollBody | null, chance: number, near: THREE.Vector3 | null, now: number, count = 1) {
    if (!body) return;
    for (let i = 0; i < count; i++) {
      if (Math.random() > chance) continue;
      const parts: BodyPart[] = ['armL', 'armR', 'legL', 'legR', 'head'];
      const part = near ? ragdolls.nearestPart(body, near.x, near.y, near.z) : parts[Math.floor(Math.random() * (Math.random() < 0.25 ? 5 : 4))];
      if (ragdolls.detach(body, part, now)) {
        ragdolls.center(body, scratch);
        effects.blood(scratch.setY(scratch.y + 0.4), rayDir.set(Math.random() - 0.5, 0.4, Math.random() - 0.5), 10);
      }
    }
  }

  function dropMoney(x: number, z: number, gang: boolean, now: number) {
    const amount = gang ? 40 + Math.floor(Math.random() * 160) : 10 + Math.floor(Math.random() * 110);
    pickups.drop(x, z, amount, now);
  }

  /**
   * Damages a pedestrian or gang member and handles what follows (money, limbs, missions, crimes). `near` is what
   * limbs tear nearest to; `at` and `kind` where and what struck them, for the ragdoll.
   */
  function hurtNpc(npc: Npc, amount: number, vx: number, vy: number, vz: number, now: number, force: boolean, gore: number, near: THREE.Vector3 | null, kind?: HitKind, at = near) {
    const time = now / 1000;
    const x = npc.x, z = npc.z;
    const result = npcs.damage(npc, amount, vx, vy, vz, time, force, at, kind);
    if (!result) return;
    if (npc.role !== 'thief') police.crime(npc.gang >= 0 ? 0.5 : 1, time);
    npcs.notice(x, z, result.body ? 'body' : 'fight', time);
    if (result.body) {
      if (result.killed) {
        dropMoney(x, z, npc.gang >= 0, now);
        dismember(result.body, gore, near, now);
      }
      if (npc.gang === 0) gangKnocks++;
    }
  }

  /**
   * Damages a zombie; a kill tears limbs on a big hit and sometimes leaves money on the street. `near` is what limbs
   * tear nearest to; `at` and `kind` where and what struck it, for the ragdoll.
   */
  function hurtZombie(zb: Zombie, amount: number, vx: number, vy: number, vz: number, now: number, force: boolean, gore: number, near: THREE.Vector3 | null, kind?: HitKind, at = near) {
    const result = zombies.damage(zb, amount, vx, vy, vz, now / 1000, force, at, kind);
    if (!result?.killed) return;
    dismember(result.body, gore, near, now);
    if (Math.random() < 0.22) pickups.drop(zb.x, zb.z, 10 + Math.floor(Math.random() * 40), now);
  }

  /** Everything that can be shot, as upright capsules: centre (x, z), bottom and top heights, radius. */
  function forEachTarget(callback: (x: number, z: number, y0: number, y1: number, radius: number) => void) {
    npcs.forEachStanding((x, z, npc) => callback(x, z, npc.y, npc.y + 1.8, 0.38));
    police.forEachUnit((x, z, onFoot) => { if (onFoot) callback(x, z, 0.1, 1.9, 0.38); });
    for (const peer of peers.values()) if (!peer.target.down && peerVehicle(peer) === 'foot') callback(peer.group.position.x, peer.group.position.z, peer.group.position.y + 0.1, peer.group.position.y + 1.9, 0.4);
    animals.forEachShadow((x, z, size) => callback(x, z, 0.05, 0.1 + size * 0.6, Math.max(0.2, size * 0.45)));
    ragdolls.forEach((body) => { if (body !== playerBody) { ragdolls.center(body, scratch); callback(scratch.x, scratch.z, scratch.y - 0.3, scratch.y + 0.3, 0.45); } });
    if (zombieMode) zombies.forEachStanding(callback);
  }

  /** Without a mouse (F key, touch): straight ahead where the player faces, at chest height. No auto-aim. */
  function aimAhead(range: number, out: THREE.Vector3) {
    if (firstPerson()) return centerAim(range, out);
    return out.set(state.x + Math.sin(state.angle) * range, groundHeight(state.x, state.z) + 1.2, state.z + Math.cos(state.angle) * range);
  }

  /**
   * Mouse aim, with no assist: the point under the cursor. On a target that is where the cursor covers it,
   * so a click on a head is a head shot; otherwise the cursor at chest height. True when on a target.
   */
  function pointerAim(range: number, out: THREE.Vector3) {
    if (firstPerson()) { centerAim(range, out); return false; }
    raycaster.setFromCamera(pointerNdc, camera);
    const ray = raycaster.ray;
    const { origin, direction } = ray;
    const flat = direction.x * direction.x + direction.z * direction.z;
    let best = Infinity;
    if (flat > 1e-6) forEachTarget((x, z, y0, y1, radius) => {
      if (Math.hypot(x - state.x, z - state.z) > range + 2) return;
      // Closest approach of the camera ray to the target's upright axis.
      const t = ((x - origin.x) * direction.x + (z - origin.z) * direction.z) / flat;
      if (t <= 0) return;
      aimProbe.set(x, THREE.MathUtils.clamp(origin.y + direction.y * t, y0 + 0.05, y1 - 0.05), z);
      // Only a cursor actually on the target counts; the nearest such target to the camera is the one hit.
      if (ray.distanceToPoint(aimProbe) > radius || t >= best) return;
      best = t;
      out.copy(aimProbe);
    });
    if (best < Infinity) return true;
    const chest = groundHeight(state.x, state.z) + 1.2;
    out.copy(origin).addScaledVector(direction, direction.y < -0.01 ? (chest - origin.y) / direction.y : 60);
    return false;
  }

  /** Launch direction that lands a lobbed shell on `target` along the flatter arc (45° when out of reach). */
  function lob(from: THREE.Vector3, target: THREE.Vector3, speed: number, gravity: number, out: THREE.Vector3) {
    const dx = target.x - from.x, dz = target.z - from.z, d = Math.max(0.5, Math.hypot(dx, dz)), h = target.y - from.y;
    const v2 = speed * speed;
    const root = v2 * v2 - gravity * (gravity * d * d + 2 * h * v2);
    const angle = root >= 0 ? Math.atan2(v2 - Math.sqrt(root), gravity * d) : Math.PI / 4;
    return out.set((dx / d) * Math.cos(angle), Math.sin(angle), (dz / d) * Math.cos(angle));
  }

  /** Places the crosshair at the cursor (mouse) or on what auto-aim would hit (keys, touch). */
  function updateReticle(show: boolean, locked: boolean, onPointer: boolean, now: number) {
    if (!show) { if (reticle.style.display !== 'none') reticle.style.display = 'none'; return; }
    reticle.style.display = '';
    let x = pointerPx.x, y = pointerPx.y;
    if (firstPerson()) { x = canvas.clientWidth / 2 + canvas.offsetLeft; y = canvas.clientHeight / 2 + canvas.offsetTop; }
    else if (!onPointer) {
      aimProbe.copy(reticlePoint).project(camera);
      x = (aimProbe.x + 1) / 2 * canvas.clientWidth + canvas.offsetLeft;
      y = (1 - aimProbe.y) / 2 * canvas.clientHeight + canvas.offsetTop;
    }
    const def = weaponById(weapon);
    const size = 16 + def.spread * (1 + bloom) * (state.riding ? 2 : 1) * 520;
    reticle.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    reticleRing.style.width = reticleRing.style.height = `${size.toFixed(1)}px`;
    reticleRing.style.borderColor = locked ? 'rgba(255,86,72,.98)' : 'rgba(255,255,255,.95)';
    reticleDot.style.background = locked ? '#ff5648' : '#fff';
    const mark = Math.max(0, 1 - (now - hitMarkAt) / 220);
    reticleHit.style.opacity = mark.toFixed(2);
    reticleHit.style.color = headMark ? '#ff5648' : '#fff';
  }

  function powerBlocked() { return !active || !!down || state.riding || bagOpen || swimming || !!boat || !!glide || !!interior || activityBusy() || surrendered || performance.now() < stunUntil; }

  function selectHero(id: HeroId) {
    if (powerBlocked()) return;
    if (!powers.select(id)) { notify('Hạ cánh bằng G trước khi đổi anh hùng.'); return; }
    notify(id === 'none' ? 'Đã trở lại chế độ người dân.' : `${HEROES.find((hero) => hero.id === id)!.name} · K dùng sức mạnh${id === 'ironman' ? ' · G bay / hạ cánh' : ''}`, 3500);
    emitHud(performance.now());
  }

  function toggleFlight() {
    if (!powers.toggleFlight(powerBlocked())) {
      if (!powerBlocked()) notify(powers.hero !== 'ironman' ? 'Chỉ Iron Man có thể bay. Nhấn J để đổi anh hùng.' : 'Cần ít nhất 15 năng lượng để cất cánh.');
      return;
    }
    notify(powers.flying ? 'Đang cất cánh · WASD di chuyển · Shift tăng tốc · G hạ cánh' : 'Đang hạ cánh…', 2600);
    emitHud(performance.now());
  }

  /** All casts share collision/visibility checks and the normal PvP hit queue. */
  function damageWithPower(kind: HeroPower, from: PowerPoint, to: PowerPoint, now: number, alreadyHit = new Set<unknown>()) {
    const time = now / 1000;
    const radial = kind === 'hulk' || kind === 'thor';
    const radius = kind === 'hulk' ? 7 : kind === 'thor' ? 3.8 : kind === 'captain' ? 1.05 : 1.1;
    const cx = radial ? to.x : (from.x + to.x) / 2, cz = radial ? to.z : (from.z + to.z) / 2;
    const search = radial ? radius : Math.hypot(to.x - from.x, to.z - from.z) / 2 + radius;
    const damage = kind === 'hulk' ? 75 : kind === 'thor' ? 60 : kind === 'captain' ? 44 : 46;
    const force = kind === 'hulk' ? 18 : 10;
    const hits = (key: unknown, x: number, y: number, z: number) => {
      if (alreadyHit.has(key)) return false;
      if (radial ? Math.hypot(x - to.x, z - to.z) > radius || Math.abs(y - to.y) > 2.3 : distanceToPowerSegment({ x, y, z }, from, to) > radius) return false;
      const origin = radial ? to : from;
      if (!lineOfSight(origin.x, origin.z, x, z)) return false;
      if (kind === 'captain' && !lineOfSight(state.x, state.z, x, z)) return false;
      alreadyHit.add(key); return true;
    };
    const impulse = (x: number, z: number) => {
      const dx = x - from.x, dz = z - from.z, length = Math.hypot(dx, dz) || 1;
      return { x: dx / length, z: dz / length };
    };
    npcs.near(cx, cz, search, (npc, x, z) => {
      if (!hits(npc, x, npc.y + 1, z)) return;
      const d = impulse(x, z); hurtNpc(npc, damage, d.x * force, kind === 'hulk' ? 7 : 4, d.z * force, now, true, 0, null, 'blast');
    });
    if (zombieMode) zombies.near(cx, cz, search, (zb) => {
      if (!hits(zb, zb.x, groundHeight(zb.x, zb.z) + 1, zb.z)) return;
      const d = impulse(zb.x, zb.z); hurtZombie(zb, damage, d.x * force, kind === 'hulk' ? 7 : 4, d.z * force, now, true, 0, null, 'blast');
    });
    police.near(cx, cz, search, (officer) => {
      if (!hits(officer, officer.x, groundHeight(officer.x, officer.z) + 1, officer.z)) return;
      const d = impulse(officer.x, officer.z); police.damage(officer, damage, d.x * force, 5, d.z * force, time, true);
    });
    for (const [id, peer] of peers) {
      const p = peer.group.position;
      if (peer.target.down || !hits(id, p.x, p.y + 1.0, p.z)) continue;
      const d = impulse(p.x, p.z); hitPeer(id, peer, damage, d.x, d.z, now);
    }
    for (const car of vehicles.cars) {
      if (car.mode === 'off' || car === playerCar || !hits(car, car.x, groundHeight(car.x, car.z) + 1, car.z)) continue;
      damageCar(car, damage * 0.8, now);
      if (car.kind === 'police') police.crime(2, time);
      effects.puff(hitPoint.set(car.x, 1.1, car.z), now);
    }
  }

  function powerHome(): PowerPoint { return { x: state.x, y: bodyY + jumpY + powers.altitude + 1.1, z: state.z }; }

  function castPower() {
    if (powerBlocked()) return;
    const kind = powers.cast();
    if (!kind) {
      const info = powers.hud();
      notify(info.hero === 'none' ? 'Nhấn J để chọn anh hùng trước.' : info.cooldown > 0 ? `Sức mạnh hồi sau ${info.cooldown.toFixed(1)} giây.` : 'Chưa đủ năng lượng. Hãy chờ hồi phục hoặc hạ cánh.', 1600);
      return;
    }
    const now = performance.now();
    const from = powerHome();
    const direct = kind === 'ironman' || kind === 'captain';
    let targetX = state.x + Math.sin(state.angle) * POWER_RANGE[kind], targetZ = state.z + Math.cos(state.angle) * POWER_RANGE[kind];
    let targetY = groundHeight(targetX, targetZ) + 1.1;
    if (kind !== 'hulk' && autoAim(POWER_RANGE[kind], aimPoint)) { targetX = aimPoint.x; targetZ = aimPoint.z; targetY = direct ? aimPoint.y : groundHeight(targetX, targetZ) + 1.1; }
    if (kind !== 'hulk' && firstPerson()) {
      centerAim(POWER_RANGE[kind], aimPoint); targetX = aimPoint.x; targetY = aimPoint.y; targetZ = aimPoint.z;
    } else if (kind !== 'hulk' && pointerInside) {
      raycaster.setFromCamera(pointerNdc, camera);
      const ray = raycaster.ray;
      if (ray.direction.y < -0.01) {
        const distance = (0.3 - ray.origin.y) / ray.direction.y;
        targetX = ray.origin.x + ray.direction.x * distance; targetZ = ray.origin.z + ray.direction.z * distance;
        targetY = groundHeight(targetX, targetZ) + 1.1;
      }
      // Mouse aiming at a flying peer uses their body, rather than the road behind them.
      if (direct) {
        const sphere = new THREE.Sphere(new THREE.Vector3(), 0.85);
        let nearest = Infinity;
        for (const peer of peers.values()) {
          if (peer.target.down) continue;
          sphere.center.copy(peer.group.position); sphere.center.y += 1.0;
          if (!ray.intersectSphere(sphere, scratch)) continue;
          const distance = ray.origin.distanceToSquared(scratch);
          if (distance >= nearest) continue;
          nearest = distance; targetX = sphere.center.x; targetY = sphere.center.y; targetZ = sphere.center.z;
        }
      }
    }
    const dx = targetX - state.x, dz = targetZ - state.z;
    const traced = kind === 'hulk' ? { ...from } : resolvePowerTarget(from, { x: targetX, y: targetY, z: targetZ }, POWER_RANGE[kind], (direction, distance) => {
      rayOrigin.set(from.x, from.y, from.z); rayDir.set(direction.x, direction.y, direction.z);
      const wall = wallDistance(rayOrigin, rayDir, distance);
      return wall < distance ? wall - 0.15 : distance;
    });
    const to = clipPowerTarget(from, traced,
      { x: bounds.minX + 0.5, y: POWER_HEIGHT_BOUNDS.min, z: bounds.minZ + 0.5 },
      { x: bounds.maxX - 0.5, y: POWER_HEIGHT_BOUNDS.max, z: bounds.maxZ - 0.5 });
    if (kind !== 'hulk') state.angle = Math.atan2(dx, dz);
    aimUntil = now + 450; punchUntil = now + 300;
    lastPower.kind = kind; lastPower.x = to.x; lastPower.y = to.y; lastPower.z = to.z; lastPower.seq++;
    powerEffects.cast(kind, from, to, now, kind === 'captain' ? powerHome : undefined);
    if (kind === 'captain') shieldFlight = { from, to, previous: from, started: now, hits: new Set() };
    else damageWithPower(kind, from, to, now);
    npcs.alarm(state.x, state.z, 30, now / 1000);
    playThud(); unlockAudio(); shake = Math.max(shake, kind === 'hulk' ? 0.55 : 0.16);
    emitHud(now);
  }

  function updatePowers(seconds: number, now: number) {
    if (powers.altitude > 0 && !powers.flying && !clearAt(state.x, state.z, 0.5)) {
      // A traffic car may have moved under us. Move to the nearest clear patch before descending.
      let found = false;
      for (let radius = 1; radius <= 10 && !found; radius++) for (let i = 0; i < 16; i++) {
        const x = state.x + Math.sin(i * Math.PI / 8) * radius, z = state.z + Math.cos(i * Math.PI / 8) * radius;
        if (clearAt(x, z, 0.5) && lineOfSight(state.x, state.z, x, z)) { state.x = x; state.z = z; found = true; break; }
      }
    }
    powers.step(seconds, clearAt(state.x, state.z, 0.5));
    if (shieldFlight) {
      const shield = shieldFlight;
      const age = (now - shield.started) / 1000;
      const point = shieldPosition(shield.from, shield.to, age, powerHome());
      damageWithPower('captain', shield.previous, point, now, shield.hits);
      shield.previous = point;
      if (age >= SHIELD_DURATION) shieldFlight = null;
    }
  }

  /** Picks the pedestrian, officer, player or body closest to the facing direction, for keyboard and touch aiming. */
  function autoAim(range: number, out: THREE.Vector3) {
    let bestGap = 0.42;
    let found = false;
    const consider = (x: number, y: number, z: number) => {
      const d = Math.hypot(x - state.x, z - state.z);
      if (d < 0.5 || d > range) return;
      const angle = Math.atan2(x - state.x, z - state.z) - state.angle;
      const gap = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
      if (gap < bestGap) { bestGap = gap; out.set(x, y, z); found = true; }
    };
    npcs.forEachStanding((x, z, npc) => consider(x, npc.y + 1.0, z));
    police.forEachUnit((x, z, onFoot) => { if (onFoot) consider(x, groundHeight(x, z) + 1.0, z); });
    if (zombieMode) zombies.forEachStanding((x, z, y0, y1) => consider(x, (y0 + y1) / 2, z));
    for (const peer of peers.values()) if (!peer.target.down) consider(peer.group.position.x, peer.group.position.y + 1.0, peer.group.position.z);
    ragdolls.forEach((body) => { if (body !== playerBody) { ragdolls.center(body, scratch); consider(scratch.x, scratch.y, scratch.z); } });
    return found;
  }

  function muzzle(out: THREE.Vector3) {
    if (firstPerson()) { const pose = eyePose(); return out.set(pose.eye.x, pose.eye.y - 0.05, pose.eye.z); }
    if (state.riding) {
      // Firing from a vehicle: out of the passenger window, or from the rider's right hand (at -x).
      const side = inCar() ? 1.1 : -0.55;
      const c = Math.cos(state.angle), s = Math.sin(state.angle);
      return out.set(state.x + c * side + Math.sin(aimYaw) * 0.6, groundHeight(state.x, state.z) + (inCar() ? 1.45 : 1.4), state.z - s * side + Math.cos(aimYaw) * 0.6);
    }
    walker.group.position.set(state.x, bodyY + jumpY + powers.altitude, state.z);
    walker.group.rotation.y = state.angle;
    walker.group.updateMatrixWorld(true);
    const gun = guns.get(weapon);
    if (gun) return gun.muzzle.getWorldPosition(out);
    return out.set(state.x, 1.3, state.z);
  }

  function punch(time: number, now: number) {
    punchUntil = now + 180;
    const def = weaponById('fists');
    const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    const cx = state.x + fx * 0.8, cz = state.z + fz * 0.8;
    const baseY = bodyY + jumpY + powers.altitude;
    let hit = false;
    npcs.near(cx, cz, 0.9, (npc, nx, nz) => {
      if (hit || Math.abs(npc.y - baseY) > 1.3) return;
      hit = true;
      hurtNpc(npc, def.damage, fx * def.force * PUNCH_PUSH, 1.8, fz * def.force * PUNCH_PUSH, now, false, 0, null, 'melee', hitPoint.set(nx - fx * 0.15, npc.y + 1.3, nz - fz * 0.15));
      effects.blood(hitPoint.set(nx, npc.y + 1.4, nz), rayDir.set(fx, 0, fz), 4);
    });
    if (!hit) police.near(cx, cz, 0.9, (o) => {
      if (hit || Math.abs(groundHeight(o.x, o.z) - baseY) > 1.3) return;
      hit = true;
      police.damage(o, def.damage, fx * def.force * PUNCH_PUSH, 1.8, fz * def.force * PUNCH_PUSH, time, false, hitPoint.set(o.x - fx * 0.15, groundHeight(o.x, o.z) + 1.3, o.z - fz * 0.15), 'melee');
      effects.blood(hitPoint.set(o.x, groundHeight(o.x, o.z) + 1.4, o.z), rayDir.set(fx, 0, fz), 4);
    });
    if (!hit) for (const [id, peer] of peers) {
      if (hit || peer.target.down || peerVehicle(peer) !== 'foot' || Math.abs(peer.group.position.y - baseY) > 1.3) continue;
      if (Math.hypot(peer.group.position.x - cx, peer.group.position.z - cz) < 0.9) {
        hit = true;
        hitPeer(id, peer, def.damage, fx, fz, now);
        effects.blood(hitPoint.set(peer.group.position.x, peer.group.position.y + 1.4, peer.group.position.z), rayDir.set(fx, 0, fz), 4);
      }
    }
    if (!hit && zombieMode) zombies.near(cx, cz, 0.95, (zb) => {
      if (hit || Math.abs(groundHeight(zb.x, zb.z) - baseY) > 1.3) return;
      hit = true;
      hurtZombie(zb, def.damage, fx * def.force * PUNCH_PUSH, 1.8, fz * def.force * PUNCH_PUSH, now, false, 0, null, 'melee', hitPoint.set(zb.x - fx * 0.15, groundHeight(zb.x, zb.z) + 1.2, zb.z - fz * 0.15));
      effects.blood(hitPoint.set(zb.x, groundHeight(zb.x, zb.z) + 1.4, zb.z), rayDir.set(fx, 0, fz), 4);
    });
    if (!hit && powers.altitude <= 1.3) animals.near(cx, cz, 0.9, (index) => { if (!hit) { hit = true; animals.hit(index, fx * 6, 3, fz * 6); } });
    if (!hit && powers.altitude <= 1.3) hit = ragdolls.push(cx, cz, 0.9, fx * 3.5, 1.5, fz * 3.5) > 0;
    if (hit) { playThud(); shake = Math.max(shake, 0.15); npcs.notice(cx, cz, 'fight', time); }
  }

  function applyBlast(b: Explosion, now: number, byPlayer: boolean) {
    const time = now / 1000;
    blastPoint.set(b.x, b.y, b.z);
    playBoom();
    const dPlayer = Math.hypot(state.x - b.x, bodyY + jumpY + powers.altitude + 1 - b.y, state.z - b.z);
    shake = Math.max(shake, Math.max(0.15, 1.2 - dPlayer / 40));
    npcs.alarm(b.x, b.z, 70, time);
    npcs.notice(b.x, b.z, 'fire', time);
    animals.alarm(b.x, b.z, 50);
    if (byPlayer) police.crime(3, time);
    ragdolls.blast(b.x, b.y, b.z, b.radius * 1.4, 26);
    animals.blast(b.x, b.y, b.z, b.radius * 1.2, 14);
    effects.puff(blastPoint, now);
    npcs.near(b.x, b.z, b.radius, (npc, nx, nz) => {
      const d = Math.hypot(nx - b.x, nz - b.z), f = 1 - d / b.radius, dx = (nx - b.x) / (d || 1), dz = (nz - b.z) / (d || 1);
      hurtNpc(npc, b.damage * f + 15, dx * (8 + 14 * f), 6 + 9 * f, dz * (8 + 14 * f), now, true, f > 0.45 ? 0.7 : 0.25, blastPoint, 'blast');
      effects.blood(hitPoint.set(nx, 1, nz), rayDir.set(dx, 0.6, dz), 6);
    });
    police.near(b.x, b.z, b.radius, (o) => {
      const d = Math.hypot(o.x - b.x, o.z - b.z), f = 1 - d / b.radius, dx = (o.x - b.x) / (d || 1), dz = (o.z - b.z) / (d || 1);
      police.damage(o, b.damage * f + 15, dx * (8 + 14 * f), 6 + 9 * f, dz * (8 + 14 * f), time, true, blastPoint, 'blast');
    });
    if (zombieMode) {
      zombies.hear(b.x, b.z, 70, time);
      zombies.near(b.x, b.z, b.radius, (zb) => {
        const d = Math.hypot(zb.x - b.x, zb.z - b.z), f = 1 - d / b.radius, dx = (zb.x - b.x) / (d || 1), dz = (zb.z - b.z) / (d || 1);
        hurtZombie(zb, b.damage * f + 20, dx * (8 + 14 * f), 6 + 9 * f, dz * (8 + 14 * f), now, true, f > 0.4 ? 0.8 : 0.3, blastPoint, 'blast');
        effects.blood(hitPoint.set(zb.x, 1, zb.z), rayDir.set(dx, 0.6, dz), 6);
      });
    }
    for (const [id, peer] of peers) {
      const d = Math.hypot(peer.group.position.x - b.x, peer.group.position.y + 1 - b.y, peer.group.position.z - b.z);
      if (d < b.radius && byPlayer) hitPeer(id, peer, Math.min(100, b.damage * (1 - d / b.radius) + 10), (peer.group.position.x - b.x) / (d || 1), (peer.group.position.z - b.z) / (d || 1), now);
    }
    // Parked vehicles that are only drawn wake up first, so the blast reaches them too.
    vx.curbNear?.(b.x, b.z, b.radius + 2);
    for (const car of vehicles.live) {
      if (car.mode === 'off') continue;
      const d = Math.hypot(car.x - b.x, car.z - b.z);
      if (d < b.radius + 2) damageCar(car, b.damage * 1.4 * (1 - d / (b.radius + 2)), now);
    }
    if (dPlayer < b.radius && down !== 'wasted' && down !== 'busted') {
      const f = 1 - dPlayer / b.radius, dx = (state.x - b.x) / (dPlayer || 1), dz = (state.z - b.z) / (dPlayer || 1);
      damagePlayer(b.damage * f * (inCar() ? 0.5 : 0.8), now, { x: b.x, z: b.z });
      if (!inCar() && f > 0.3 && !down) knockPlayer(dx * 12 * f, 6 + 6 * f, dz * 12 * f, now, 'crash', blastPoint, 'blast');
    }
    if (bikeHealth > 0 && Math.hypot(bikeX - b.x, bikeZ - b.z) < b.radius + 1 && (playerCar || !state.riding)) bikeHealth = Math.max(0, bikeHealth - b.damage);
  }

  function fire(now: number, time: number) {
    if (swimming || glide) return;
    const def = weaponById(weapon);
    // Heritage sites (QUAN_1_SOUTH_EXTRA.heritage): weapons stay holstered inside; any fighting there is a crime at once.
    const site = heritageAt(state.x, state.z);
    if (site && !zombieMode) {
      if (site.noWeapons && def.id !== 'fists') { lastShot = now; notify(`${site.name} là di tích · cất vũ khí, không được nổ súng ở đây`, 2500); return; }
      // police.crime's heat: wanted = 1 + heat / 4, so 4 per star brings the site's stars at once.
      if (site.noCombat && police.wanted < site.wanted) { police.crime(4 * (site.wanted - 1) + 1, time); notify(`Gây rối ở di tích ${site.name}! Bảo vệ đã báo công an.`, 3000); }
    }
    if (def.magazine) {
      const rounds = ammo.get(weapon);
      if (reloadWeapon) return;
      if (!rounds || rounds.mag <= 0) {
        if (rounds && rounds.reserve > 0) startReload(now);
        else notify('Hết đạn! Mua thêm ở Tiệm súng.', 2000);
        lastShot = now;
        return;
      }
    }
    lastShot = now;
    // Aim: wherever the mouse cursor is over the game (click or F), otherwise straight ahead (touch).
    if (pointerInside) pointerAim(def.range, aimPoint);
    else aimAhead(def.range, aimPoint);
    aimYaw = Math.atan2(aimPoint.x - state.x, aimPoint.z - state.z);
    if (!state.riding) state.angle = aimYaw;
    aimUntil = now + 800;
    if (def.id === 'fists') {
      if (state.riding) return;
      punch(time, now);
      return;
    }
    const rounds = ammo.get(weapon);
    if (rounds) {
      rounds.mag--;
      if (rounds.mag === 0 && rounds.reserve > 0) startReload(now + 150);
    }
    firingUntil = now + 400;
    muzzle(rayOrigin);
    // Every bullet leaves the muzzle toward the aim point, so shots land where the crosshair is; spread
    // widens with rapid fire (bloom) and from a moving vehicle.
    aimDir.subVectors(aimPoint, rayOrigin);
    if (aimDir.lengthSq() < 0.04) aimDir.set(Math.sin(aimYaw), 0, Math.cos(aimYaw));
    aimDir.normalize();
    const spread = def.spread * (1 + bloom) * (state.riding ? 2 : 1);
    bloom = Math.min(1.6, bloom + (def.auto ? 0.2 : 0.35));
    effects.flash(rayOrigin, now, def.projectile ? 1.3 : def.id === 'shotgun' ? 1.1 : 0.75);
    playShot(def.id);
    if (def.projectile) {
      if (def.projectile.gravity > 0) lob(rayOrigin, aimPoint, def.projectile.speed, def.projectile.gravity, rayDir);
      else rayDir.copy(aimDir);
      explosives.launch(def.id, def.projectile, rayOrigin, rayDir, false);
      if (zombieMode) zombies.hear(state.x, state.z, 45, time);
      shake = Math.max(shake, 0.3);
      npcs.alarm(state.x, state.z, 45, time);
      animals.alarm(state.x, state.z, 30);
      return;
    }
    let hurtSomeone = false;
    for (let pellet = 0; pellet < def.pellets; pellet++) {
      rayDir.set(aimDir.x + (Math.random() - 0.5) * 2 * spread, aimDir.y + (Math.random() - 0.5) * spread, aimDir.z + (Math.random() - 0.5) * 2 * spread).normalize();
      let maxT = wallDistance(rayOrigin, rayDir, def.range);
      if (rayDir.y < 0) {
        const groundT = (groundHeight(rayOrigin.x, rayOrigin.z, rayOrigin.y) + 0.02 - rayOrigin.y) / rayDir.y;
        if (groundT >= 0) maxT = Math.min(maxT, groundT);
      }
      // Every target type is tested and the nearest one along the ray takes the bullet.
      let best: { t: number; apply: () => void } | null = null;
      const consider = (t: number, apply: () => void) => { if (t < maxT && (!best || t < best.t)) best = { t, apply }; };
      const pointBlank = def.id === 'shotgun';
      const npcHit = npcs.raycast(rayOrigin, rayDir, maxT);
      // Head shots (above the neck) do two and a half times the damage.
      if (npcHit) consider(npcHit.t, () => {
        const head = (npcHit as unknown as { head?: boolean }).head ?? hitPoint.y - npcHit.npc.y > NECK_Y * styleOf(npcHit.npc.look).height;
        hurtNpc(npcHit.npc, def.damage * (head ? 2.5 : 1), rayDir.x * def.force * BULLET_PUSH, 1.4, rayDir.z * def.force * BULLET_PUSH, now, false, pointBlank && npcHit.t < 4 ? 0.5 : head ? 0.2 : 0.05, hitPoint.clone(), 'bullet');
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : head ? 10 : 7);
        hurtSomeone = true;
        hitMarkAt = now;
        headMark = head;
      });
      const zombieHit = zombieMode ? zombies.raycast(rayOrigin, rayDir, maxT) : null;
      if (zombieHit) consider(zombieHit.t, () => {
        // Zombies report the hit height in figure units (and whether it was above a bent-over neck).
        const head = (zombieHit as unknown as { head?: boolean }).head ?? zombieHit.height > FIGURE.neckY;
        hurtZombie(zombieHit.zombie, def.damage * (head ? 3 : 1), rayDir.x * def.force * BULLET_PUSH, 1.4, rayDir.z * def.force * BULLET_PUSH, now, false, pointBlank && zombieHit.t < 4 ? 0.6 : head ? 0.35 : 0.08, hitPoint.clone(), 'bullet');
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : head ? 10 : 6);
        hitMarkAt = now;
        headMark = head;
      });
      const officerHit = police.raycast(rayOrigin, rayDir, maxT);
      if (officerHit) consider(officerHit.t, () => {
        const head = (officerHit as unknown as { head?: boolean }).head ?? hitPoint.y - groundHeight(officerHit.officer.x, officerHit.officer.z) > OFFICER_NECK_Y;
        police.damage(officerHit.officer, def.damage * (head ? 2.5 : 1), rayDir.x * def.force * BULLET_PUSH, 1.4, rayDir.z * def.force * BULLET_PUSH, time, false, hitPoint, 'bullet');
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : 7);
        hitMarkAt = now;
        headMark = head;
      });
      const bodyHit = ragdolls.raycast(rayOrigin, rayDir, maxT);
      if (bodyHit) consider(bodyHit.t, () => {
        const push = def.force * BULLET_PUSH * (def.pellets > 1 ? PELLET_PUSH : CORPSE_PUSH);
        ragdolls.strike(bodyHit.body, hitPoint.x, hitPoint.y, hitPoint.z, rayDir.x * push, 0.4 + Math.max(0, rayDir.y) * push, rayDir.z * push, 'bullet');
        effects.blood(hitPoint, rayDir, 3);
        if (pointBlank && bodyHit.t < 4) dismember(bodyHit.body, 0.25, hitPoint, now);
      });
      const animalHit = animals.raycast(rayOrigin, rayDir, maxT);
      if (animalHit) consider(animalHit.t, () => {
        animals.hit(animalHit.index, rayDir.x * def.force, 3, rayDir.z * def.force);
        effects.blood(hitPoint, rayDir, 3);
      });
      const carHit = vehicles.raycast(rayOrigin, rayDir, maxT);
      if (carHit && carHit.car !== playerCar) consider(carHit.t, () => {
        damageCar(carHit.car, def.damage * 0.5, now);
        if (carHit.car.kind === 'police') police.crime(2, time);
        effects.puff(hitPoint, now);
      });
      for (const [id, peer] of peers) {
        if (peer.target.down) continue;
        const kind = peerVehicle(peer);
        const radius = kind === 'foot' ? 0.4 : kind === 'scooter' ? 0.9 : 1.6;
        const px = peer.group.position.x, pz = peer.group.position.z;
        const ox = rayOrigin.x - px, oz = rayOrigin.z - pz;
        const a = rayDir.x * rayDir.x + rayDir.z * rayDir.z, b = 2 * (ox * rayDir.x + oz * rayDir.z), c = ox * ox + oz * oz - radius * radius;
        const disc = b * b - 4 * a * c;
        if (disc < 0 || a < 1e-6) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        const y = rayOrigin.y + rayDir.y * t;
        if (t > 0 && y > peer.group.position.y && y < peer.group.position.y + 1.9) consider(t, () => {
          hitPeer(id, peer, def.damage * (kind === 'foot' ? 1 : 0.6), rayDir.x, rayDir.z, now);
          effects.blood(hitPoint, rayDir, 5);
          hitMarkAt = now;
          headMark = false;
        });
      }
      const chosen = best as { t: number; apply: () => void } | null;
      const t = chosen ? chosen.t : maxT;
      hitPoint.copy(rayOrigin).addScaledVector(rayDir, t);
      if (chosen) chosen.apply();
      else effects.puff(hitPoint, now);
      effects.tracer(rayOrigin, hitPoint, now);
    }
    shake = Math.max(shake, def.id === 'shotgun' ? 0.35 : def.id === 'smg' ? 0.1 : 0.15);
    npcs.alarm(state.x, state.z, 42, time);
    npcs.notice(state.x, state.z, 'shots', time);
    if (zombieMode) zombies.hear(state.x, state.z, def.id === 'pistol' ? 38 : 50, time);
    animals.alarm(state.x, state.z, 30);
    // Shooting near the police is a crime even if nobody gets hurt.
    let policeNear = false;
    police.forEachUnit((x, z) => { if (Math.hypot(x - state.x, z - state.z) < 35) policeNear = true; });
    if (!hurtSomeone && policeNear && time > gunfireCrimeAt) { police.crime(1, time); gunfireCrimeAt = time + 3; }
  }

  /** What a rocket or grenade touches first along one frame of flight. */
  function projectileHit(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let t = wallDistance(origin, dir, maxT);
    const npcHit = npcs.raycast(origin, dir, t);
    if (npcHit) t = npcHit.t;
    const officerHit = police.raycast(origin, dir, t);
    if (officerHit) t = officerHit.t;
    const zombieHit = zombieMode ? zombies.raycast(origin, dir, t) : null;
    if (zombieHit) t = zombieHit.t;
    const carHit = vehicles.raycast(origin, dir, t);
    if (carHit && carHit.car !== playerCar) t = carHit.t;
    return t < maxT ? t : null;
  }

  function crash(now: number) {
    interruptRace('Bạn đã ngã xe. Nhấn M để thử lại vòng đua.');
    const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    const speed = velocity;
    if (playerCar) { playerCar.mode = 'parked'; playerCar.speed = 0; playerCar = null; }
    else { bikeX = state.x; bikeZ = state.z; bikeAngle = state.angle; }
    state.riding = false;
    velocity = 0;
    knockPlayer(fx * speed * 0.5, 4 + speed * 0.15, fz * speed * 0.5, now);
    damagePlayer(10 + speed, now);
    effects.blood(hitPoint.set(state.x, 0.9, state.z), rayDir.set(fx, 0, fz), 6);
    if (down === 'crash') notify('Ngã xe! Đứng dậy sau giây lát…', 2600);
  }

  function standUp() {
    if (playerBody && !playerBody.removed) ragdolls.center(playerBody, scratch);
    else scratch.set(state.x, 0, state.z);
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = null;
    down = null;
    for (let ring = 0; ring < 8; ring++) {
      const r = ring * 0.6;
      for (let k = 0; k < 8; k++) {
        const x = scratch.x + Math.sin(k * Math.PI / 4) * r, z = scratch.z + Math.cos(k * Math.PI / 4) * r;
        if (clearAt(x, z, 0.4)) { state.x = x; state.z = z; return; }
      }
    }
  }

  /** Knocks over anyone in front of a moving vehicle the player drives. */
  function runOver(now: number, time: number) {
    const speed = Math.abs(velocity);
    if (speed < 4) return;
    const dir = Math.sign(velocity);
    const fx = Math.sin(state.angle) * dir, fz = Math.cos(state.angle) * dir;
    const reach = inCar() ? 2.2 : 0.9, radius = inCar() ? 1.5 : 0.9;
    const cx = state.x + fx * reach, cz = state.z + fz * reach;
    const thrown = (x: number, z: number) => {
      effects.blood(hitPoint.set(x, 1, z), rayDir.set(fx, 0, fz), 8);
      velocity *= inCar() ? 0.92 : 0.8;
      playThud();
      shake = Math.max(shake, 0.25);
      if (!inCar()) damageVehicle(4, now);
    };
    const gore = speed > 18 ? 0.35 : 0;
    // The bumper strikes the shins and hips: the body folds over it and is thrown along.
    const bumper = (x: number, z: number) => blastPoint.set(x - fx * 0.25, groundHeight(x, z) + (inCar() ? 0.5 : 0.45), z - fz * 0.25);
    npcs.near(cx, cz, radius, (npc, nx, nz) => {
      hurtNpc(npc, speed * 5, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, now, true, gore, null, 'vehicle', bumper(nx, nz));
      thrown(nx, nz);
    });
    police.near(cx, cz, radius, (o) => {
      police.damage(o, speed * 5, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, time, true, bumper(o.x, o.z), 'vehicle');
      thrown(o.x, o.z);
    });
    animals.near(cx, cz, radius, (index, ax, az) => { animals.hit(index, fx * speed, 3, fz * speed); thrown(ax, az); });
    if (zombieMode) zombies.near(cx, cz, radius + 0.1, (zb) => {
      hurtZombie(zb, speed * 6, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, now, true, gore, null, 'vehicle', bumper(zb.x, zb.z));
      thrown(zb.x, zb.z);
    });
    for (const [id, peer] of peers) {
      const kind = peerVehicle(peer);
      if (peer.target.down || (peer.target.altitude ?? 0) > 1.3 || kind === 'car' || kind === 'police') continue;
      if (Math.hypot(peer.group.position.x - cx, peer.group.position.z - cz) < radius + (kind === 'scooter' ? 0.6 : 0) && now - peer.hurtAt * 1000 > 800) {
        hitPeer(id, peer, Math.min(90, speed * (kind === 'scooter' ? 3 : 4)), fx, fz, now);
        thrown(peer.group.position.x, peer.group.position.z);
      }
    }
    // Bodies already lying there are swept by the vehicle's box every frame (see the vehicle loop).
  }

  /** Traffic and police vehicles knock down a player on foot; cruisers ram the player's vehicle. */
  function vehicleImpacts(now: number) {
    if (powers.altitude > 1.3) return;
    if (down) return;
    for (const car of vehicles.live) {
      if (car === playerCar || car.mode === 'off' || Math.abs(car.speed) < 4.5) continue;
      const dx = state.x - car.x, dz = state.z - car.z;
      if (dx * dx + dz * dz > 16) continue;
      const [hw, hl] = vehicles.halfSize(car.kind);
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const vx = Math.sin(car.yaw) * car.speed, vz = Math.cos(car.yaw) * car.speed;
      if (!state.riding) {
        if (Math.abs(lx) < hw + 0.4 && lz > hl - 0.8 && lz < hl + 0.6) {
          damagePlayer(Math.abs(car.speed) * 2.4, now, { x: car.x, z: car.z }, car.kind === 'police' ? 'Xe cảnh sát' : 'Xe');
          if (!down) knockPlayer(vx * 0.8, 3 + Math.abs(car.speed) * 0.2, vz * 0.8, now, 'crash', hitPoint.set(car.x + Math.sin(car.yaw) * hl, groundHeight(state.x, state.z) + 0.5, car.z + Math.cos(car.yaw) * hl), 'vehicle');
          return;
        }
      }
    }
  }

  function emitHud(now: number) {
    const missionInfo = missions.view();
    const target = missionInfo.target;
    const nearMission = target !== null && distance(target) <= 6.5;
    const offer = sideMissions.nearOffer(state.x, state.z);
    const rounds = ammo.get(weapon);
    // The prompt chip (C1): a hold in progress, getting up or off, else the registry's focus, unless the mission ring
    // or a side-job offer has E here (C5) or the player is busy being down, gliding, boating or robbing the bank.
    const missionHasE = nearMission && missionInfo.status === 'active' && MISSION_DEFS.find((d) => d.id === missionInfo.id)?.steps[missionInfo.step]?.mode === 'interact';
    const busy = down || playerBody || surrendered || glide || heist || boat || interior;
    const prompt: PromptView | null = hold ? { ...hold.view, progress: Math.min(1, (now - hold.started) / ((hold.entry.hold ?? 1) * 1000)) }
      : busy || menu ? null : stateView() ?? (missionHasE || offer ? null : focus?.view ?? null);
    const focusText = prompt ? promptText(prompt) : '';
    // The wired districts build a few ms a frame after the start (world.ts): say so until they are all up.
    const build = world.districtProgress();
    const hint = now < notificationUntil ? notification
      : down === 'wasted' ? 'Đang được đưa đi cấp cứu…'
      : down === 'busted' ? 'Đang bị còng tay, áp giải về đồn…'
      : surrendered ? 'Đang đầu hàng · Nhấn H để hạ tay xuống'
      : playerBody ? 'Đang đứng dậy…'
      : powers.altitude > 0.05 ? 'WASD bay · Shift tăng tốc · K tia phản lực · G hạ cánh · B đổi góc nhìn'
      : glide?.phase === 'deck' ? `Đài quan sát tầng ${deckTower.floor} · WASD đi dạo · Space nhảy dù · E đi thang máy xuống`
      : glide?.phase === 'fall' ? 'Rơi tự do · Space bung dù · A/D lượn · W lao nhanh'
      : glide ? `Dù lượn · cao ${Math.round(glide.y)} m · A/D lái · W lao xuống · S hãm`
      : heist ? `Đang mở két… ${Math.min(100, Math.round(((now - heist.started) / HEIST_MS) * 100))}% · ở yên gần quầy, đừng đi xa`
      : boat ? 'Ca nô · W ga · S lùi · A/D bẻ lái · Space thắng · E cập bến hoặc nhảy xuống sông'
      : swimming ? (boats.rental.mode === 'player' && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) < 4.2 ? 'Nhấn E để lên ca nô' : 'Đang bơi · Shift bơi nhanh · sát bờ kè hoặc cầu tàu nhấn Space để leo lên')
      : hold ? 'Giữ phím E tới khi xong · thả ra hoặc đi chỗ khác là bỏ dở'
      : ride ? `${ride.label} · ${rideVerb()} (E hoặc F)`
      : seat ? (seat.eatery && isOpen(COUNTERS[seat.eatery.key].hours, atmosphere.hours) ? 'Ngồi ghế nhựa ăn tại chỗ · E gọi món · WASD đứng dậy' : `Đang ngồi nghỉ · E hoặc WASD đứng dậy${police.wanted ? '' : ' · giữ Space cho thời gian trôi nhanh'}`)
      : !state.riding && vaultSpot() ? 'Space để nhảy qua lan can xuống sông'
      : zombieMode && !prompt && !state.riding ? (rounds && rounds.mag === 0 && rounds.reserve === 0 ? 'Hết đạn · Đổi súng (1–6) hoặc mua đạn ở Tiệm súng' : 'Click/F bắn · bắn vào đầu · R nạp đạn · lên xe để chạy thoát')
      : nearMission && missionInfo.requiresOnFoot && state.riding ? 'Giảm tốc rồi nhấn E xuống xe để dọn rác'
      : nearMission && missionInfo.requiresBike && !isMotorbike() ? 'Hãy dùng xe máy để tham gia vòng đua'
      : nearMission ? missionInfo.objective
      : offer ? `Nhấn E để nhận việc: ${offer.def.title} (+${formatThousands(offer.def.reward)})`
      : prompt ? focusText
      : build.done < build.tiles ? `Đang dựng phố mới… ${Math.round((build.done / Math.max(1, build.tiles)) * 100)}%`
      : missionInfo.status !== 'active' ? 'Nhấn M để chọn nhiệm vụ mới hoặc chơi lại'
      : state.riding ? (weapon !== 'fists' ? 'W ga · S phanh/lùi · A/D lái · Space phanh tay · Click bắn' : 'W ga · S phanh/lùi · A/D lái · Space phanh tay · E xuống xe')
      : police.wanted ? 'Đang bị truy nã · Trốn khỏi tầm mắt cảnh sát, hoặc nhấn H để đầu hàng'
      : rounds && rounds.mag === 0 && rounds.reserve === 0 ? 'Hết đạn · Mua thêm ở Tiệm súng'
      : weapon !== 'fists' ? 'Chĩa súng vào người để cướp · Click/F bắn · R nạp đạn · Giữ Tab túi súng'
      : 'WASD di chuyển · Shift chạy · Space nhảy · E tương tác · Giữ Tab mở túi súng';
    const policePoints: { x: number; z: number }[] = [];
    police.forEachUnit((x, z) => { if (policePoints.length < 10) policePoints.push({ x: Math.round(x), z: Math.round(z) }); });
    const vehicle = vehicleKind();
    const vehicleHealth = playerCar ? playerCar.health / carMax(playerCar) : state.riding ? bikeHealth / bikeById(bikeId).health : -1;
    const hud: Hud = {
      powers: powers.hud(powerBlocked()), cameraMode: cameraMode.mode,
      speed: Math.round(velocity * 10) / 10, riding: state.riding, score: state.score,
      mission: missionInfo.objective, missionStep: missionInfo.step, missionInfo, hint: hint === focusText ? '' : hint,
      prompt, pins: mapPins(), ride: ride ? ride.card?.() ?? { title: ride.label, next: '', hint: 'E hoặc F · xin xuống ở trạm tới', stops: [] } : null,
      seated: !!seat, bank: Math.floor(bank), tickets: tickets.length,
      x: Math.round(state.x * 2) / 2, z: Math.round(state.z * 2) / 2,
      cash, deliveries, weapon, owned: WEAPONS.filter((w) => owned.has(w.id)).map((w) => w.id), down: down !== null,
      fps: monitor.fps, quality: QUALITY_LEVELS[level].label, qualityMode, gpu, softwareGpu,
      health: Math.ceil(health), wanted: police.wanted, banner: now < bannerUntil ? banner : '', vehicle, vehicleHealth: Math.round(vehicleHealth * 100) / 100,
      vehicleName: playerCar && playerCar.kind !== 'police' ? vehicleLabel(playerCar, vehicles.paintOf(playerCar)).split(' · ')[0] : '',
      bike: bikeId, bikeHealth: Math.round(bikeHealth / bikeById(bikeId).health * 100) / 100, bikeBroken: bikeHealth <= 0,
      bikeX: Math.round(bikeX), bikeZ: Math.round(bikeZ), targetX: Math.round(target?.x ?? state.x), targetZ: Math.round(target?.z ?? state.z), targetName: missionInfo.label, police: policePoints,
      clock: atmosphere.label(), ammo: rounds ? { mag: rounds.mag, reserve: rounds.reserve, reloading: reloadWeapon === weapon } : null,
      side: sideView ? { ...sideView, timeLeft: sideView.timeLeft === null ? null : Math.ceil(sideView.timeLeft) } : null,
      offers: sideMissions.active || zombieMode ? [] : sideMissions.offers.map((o) => ({ x: Math.round(o.x), z: Math.round(o.z) })),
      gangs: zombieMode ? [] : npcs.gangs.map((g) => ({ name: g.name, anger: Math.ceil(g.anger), x: Math.round(g.x), z: Math.round(g.z) })),
      hospital: { x: Math.round(LANDMARKS.hospital.x), z: Math.round(LANDMARKS.hospital.z) }, policeStation: { x: Math.round(LANDMARKS.police.x), z: Math.round(LANDMARKS.police.z) },
      arsenal: [...ammo.entries()].map(([id, a]) => ({ id, mag: a.mag, reserve: a.reserve })), stunned: now < stunUntil, flatTires,
      surrendered, gassed: now < gassedUntil, policeIn: Math.ceil(police.responseIn(now / 1000)),
      zombie: zombieMode ? { ...zombies.stats(now / 1000), best: zombieBest, dots: zombieDots() } : null,
      healCost: Math.ceil((MAX_HEALTH - health) * 1.2), respawnIn: down === 'wasted' || down === 'busted' ? Math.max(0, Math.ceil((downUntil - now) / 1000)) : 0,
    };
    // React re-renders only when something visible changed.
    const key = JSON.stringify(hud);
    if (key === lastHud) return;
    lastHud = key;
    onHud(hud);
  }

  /** Zombies within 70 m for the minimap, rounded so the HUD only re-renders when they really move. */
  function zombieDots() {
    const dots: { x: number; z: number }[] = [];
    zombies.forEachStanding((x, z) => { if (dots.length < 48 && Math.hypot(x - state.x, z - state.z) < 70) dots.push({ x: Math.round(x / 2) * 2, z: Math.round(z / 2) * 2 }); });
    return dots;
  }

  /** Zombie mode each frame: the horde, its blows, waves and supply drops, burning barrels, the flashlight. */
  function updateZombies(dt: number, now: number, time: number) {
    const reach = playerCar ? (playerCar.kind === 'moto' ? 0.9 : 1.6) : state.riding ? 0.9 : 0;
    const result = zombies.update(dt, time, { x: state.x, z: state.z, down: down !== null, inVehicle: state.riding, reach, night: atmosphere.night });
    for (const strike of result.strikes) {
      if (down || powers.altitude > 1.3) break;
      const d = Math.hypot(state.x - strike.x, state.z - strike.z) || 1;
      const dx = (state.x - strike.x) / d, dz = (state.z - strike.z) / d;
      playThud();
      if (inCar()) { damageVehicle(strike.damage * 1.4, now); shake = Math.max(shake, 0.2); continue; }
      damagePlayer(strike.damage * (state.riding ? 0.8 : 1), now, { x: strike.x, z: strike.z }, 'Zombie');
      effects.blood(hitPoint.set(state.x, 1.3, state.z), rayDir.set(dx, 0.3, dz), 5);
      shake = Math.max(shake, strike.heavy ? 0.45 : 0.18);
      if (strike.heavy && !down && !state.riding) knockPlayer(dx * 7 * PUNCH_PUSH, 1.8, dz * 7 * PUNCH_PUSH, now, 'crash', hitPoint.set(state.x - dx * 0.15, groundHeight(state.x, state.z) + 1.2, state.z - dz * 0.15), 'melee');
      else if (state.riding && !playerCar && strike.heavy) bikeHealth = Math.max(0, bikeHealth - strike.damage);
    }
    for (const spot of result.risen) effects.smoke(spot.x, groundHeight(spot.x, spot.z) + 0.2, spot.z, now, false, '#6b5a48');
    if (result.waveStarted) {
      showBanner(`ĐỢT ${result.waveStarted}`, now, 2600);
      notify(result.waveStarted === 1 ? 'Chúng đến rồi! Bắn vào đầu, giữ khoảng cách.' : `Đợt ${result.waveStarted}: đông hơn, nhanh hơn${result.waveStarted >= 3 ? ', có cả zombie khổng lồ' : ''}!`, 3500);
    }
    if (result.waveCleared) {
      const wave = result.waveCleared;
      if (wave > zombieBest) {
        zombieBest = wave;
        try { localStorage.setItem('pvo-zombie-best', String(wave)); } catch { /* storage blocked */ }
      }
      // A supply drop between waves: ammo for every gun, some health and cash.
      for (const [id, rounds] of ammo) rounds.reserve += Math.ceil(weaponById(id).startAmmo * 0.6);
      health = Math.min(MAX_HEALTH, health + 30);
      cash += 80 + wave * 40;
      state.score += wave * 100;
      showBanner(`ĐÃ DỌN SẠCH ĐỢT ${wave}`, now, 3000);
      notify('Tiếp tế đã tới: đạn, máu và tiền · Nghỉ 20 giây trước đợt sau', 4500);
    }
    // Burning barrels near the player keep their fires going.
    if (now > fireAt) {
      fireAt = now + 2600;
      const near = world.fires.filter((f) => Math.hypot(f.x - state.x, f.z - state.z) < 70).sort((a, b) => Math.hypot(a.x - state.x, a.z - state.z) - Math.hypot(b.x - state.x, b.z - state.z)).slice(0, 6);
      for (const f of near) explosives.burn(f.x, groundHeight(f.x, f.z) + 0.95, f.z, 3.4, 0.55, now);
    }
    // The flashlight points where the player faces (or aims), brighter as night falls.
    const yaw = now < aimUntil || pointerInside ? aimYaw : state.angle;
    const y = groundHeight(state.x, state.z);
    torch.position.set(state.x + Math.sin(yaw) * 0.3, y + 1.55, state.z + Math.cos(yaw) * 0.3);
    torch.target.position.set(state.x + Math.sin(yaw) * 11, y, state.z + Math.cos(yaw) * 11);
    torch.target.updateMatrixWorld();
    torch.intensity = 60 * Math.max(0, atmosphere.night - 0.15);
    marker.visible = false;
  }

  function driveVehicle(dt: number, now: number, time: number, throttle: number, steerInput: number, braking: boolean) {
    const base = playerCar ? (playerCar.kind === 'police' ? POLICE_CAR_STATS : playerCar.kind === 'moto' ? MOTO_STATS : CAR_STATS) : bikeById(bikeId);
    // Flat tyres halve the top speed and make the car wander.
    const stats = flatTires ? { ...base, top: base.top * 0.5, accel: base.accel * 0.7 } : base;
    if (flatTires && Math.abs(velocity) > 2) {
      steerInput += Math.sin(time * 11) * 0.35;
      if (Math.random() < dt * 8) effects.flash(hitPoint.set(state.x, 0.2, state.z), now, 0.35);
    }
    const broken = playerCar ? playerCar.health <= 0 : bikeHealth <= 0;
    const input = broken ? 0 : throttle;
    const twoWheels = !inCar();
    // Arcade physics in the spirit of GTA: the vehicle keeps a world-space velocity, the engine and
    // brakes act along the nose, tyres pull the sideways part back to zero (less in the rain, much
    // less on the handbrake for cars), and steering follows a bicycle model whose steering angle
    // shrinks with speed, so it is nimble when slow and stable when fast.
    if (!wasDriving) {
      carVX = Math.sin(state.angle) * velocity;
      carVZ = Math.cos(state.angle) * velocity;
      yawRate = 0;
      wasDriving = true;
    }
    let fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    let forward = carVX * fx + carVZ * fz;
    let lateral = carVX * Math.cos(state.angle) - carVZ * Math.sin(state.angle);
    const engine = stats.accel * (twoWheels ? 4.6 : 4.2);
    let accel = 0;
    if (input > 0) accel = forward < -0.5 ? 14 : engine * Math.max(0, 1 - (forward / stats.top) ** 2);
    else if (input < 0) accel = forward > 0.5 ? -13 : -engine * 0.6 * Math.max(0, 1 - (forward / -stats.reverse) ** 2);
    // The engine curve caps top speed; off the throttle, rolling resistance and air drag slow it gently.
    if (!input) accel -= forward * 0.08 + Math.sign(forward) * forward * forward * 0.002;
    if (broken) accel -= Math.sign(forward) * 3;
    if (braking) accel -= Math.sign(forward) * (twoWheels ? 9 : 5);
    const nextForward = forward + accel * dt;
    // Speed never flips direction in one step: braking stops the vehicle, and reverse starts from rest.
    forward = forward !== 0 && Math.sign(nextForward) !== Math.sign(forward) ? 0 : nextForward;
    if (input === 0 && Math.abs(forward) < 0.25) forward = 0;
    const grip = (twoWheels ? 11 : braking && Math.abs(forward) > 6 ? 1.4 : 9) * (1 - atmosphere.rain * 0.3) * (flatTires ? 0.55 : 1);
    lateral *= Math.exp(-grip * dt);
    // Steering: the bars/wheel turn with some inertia; the usable angle shrinks with speed so the
    // cornering force stays within what the tyres hold (tight turns when slow, wide sweeps when fast).
    // Turning in eases on progressively; letting go recentres a little quicker.
    const recentring = Math.abs(steerInput) < Math.abs(steer) || steerInput * steer < 0;
    steer = THREE.MathUtils.damp(steer, steerInput, (twoWheels ? 8.5 : 8) * (recentring ? 1.35 : 1), dt);
    const wheelbase = twoWheels ? 1.35 : 2.7;
    const cornering = (twoWheels ? 30 : 26) * (1 - atmosphere.rain * 0.25) * (flatTires ? 0.6 : 1);
    const wheelAngle = steer * Math.min(twoWheels ? 0.82 : 0.75, Math.atan((cornering * wheelbase) / Math.max(1, forward * forward)));
    let targetYaw = forward / wheelbase * Math.tan(wheelAngle);
    // A pulled handbrake swings the tail of a car round.
    if (braking && !twoWheels && Math.abs(forward) > 6) targetYaw *= 1.7;
    targetYaw = THREE.MathUtils.clamp(targetYaw, -stats.turn * 1.7, stats.turn * 1.7);
    yawRate = THREE.MathUtils.damp(yawRate, targetYaw, twoWheels ? 7.5 : 6.5, dt);
    // Velocity is rebuilt from the old heading, then the body turns: the difference shows up as slide.
    carVX = fx * forward + Math.cos(state.angle) * lateral;
    carVZ = fz * forward - Math.sin(state.angle) * lateral;
    state.angle -= yawRate * dt;
    fx = Math.sin(state.angle);
    fz = Math.cos(state.angle);
    velocity = carVX * fx + carVZ * fz;
    const dx = carVX * dt, dz = carVZ * dt;
    let impact = 0;
    if (vehicleClear(state.x + dx, state.z + dz, state.angle)) { state.x += dx; state.z += dz; }
    else {
      // Slide along walls when glancing off them; the blocked component is the impact speed.
      if (vehicleClear(state.x + dx, state.z, state.angle)) state.x += dx;
      else { impact = Math.max(impact, Math.abs(carVX)); carVX *= -0.2; }
      if (vehicleClear(state.x, state.z + dz, state.angle)) state.z += dz;
      else { impact = Math.max(impact, Math.abs(carVZ)); carVZ *= -0.2; }
      if (!impact) { impact = Math.hypot(carVX, carVZ) * 0.5; carVX *= 0.5; carVZ *= 0.5; }
      yawRate *= 0.5;
      velocity = carVX * fx + carVZ * fz;
    }
    if (impact > 6) {
      damageVehicle((impact - 6) * (inCar() ? 2.2 : 3.5), now);
      if (impact > 10) npcs.notice(state.x, state.z, 'crash', now / 1000);
      shake = Math.max(shake, Math.min(0.6, impact * 0.03));
      if (inCar() && impact > 14) damagePlayer((impact - 14) * 1.5, now);
    }
    if (!inCar() && impact > CRASH_SPEED) { crash(now); return; }
    crashInto(now, time);
    if (!state.riding) return;
    if (playerCar) {
      playerCar.x = state.x;
      playerCar.z = state.z;
      playerCar.yaw = state.angle;
      playerCar.speed = velocity;
    } else {
      bikeX = state.x;
      bikeZ = state.z;
      bikeAngle = state.angle;
    }
    runOver(now, time);
    // The camera swings behind the vehicle unless the player is steering the view.
    if (now - manualCameraAt > 1500 && Math.abs(velocity) > 3) {
      view.yaw = angleLerp(view.yaw, state.angle + Math.PI, 1 - Math.exp(-dt * 1.2));
    }
  }

  // ---- The player's body: procedural animation driven by speed, turning, jumps, punches and hits. ----
  const motion = { lean: 0, roll: 0, lastAngle: 0, lastSpeed: 0, land: 0, hitAt: -1e9, pack: 0, packV: 0 };
  const walkGait = newGait();
  const walkArms = { left: copyArm([], ARM_POSES.RELAXED), right: copyArm([], ARM_POSES.RELAXED) };
  /** Scratch arm pose for the shopkeeper and the receiver. */
  const handPose: ArmTuple = copyArm([], ARM_POSES.RELAXED);
  /** Where the left hand holds each long gun under its barrel, and the cuffed hands behind the back (solved on first use). */
  const supportArms = new Map<GunId, ArmTuple>();
  let cuffedArms: ArmTuple[] | null = null;
  const _fall = new THREE.Vector3(), _fallHint = new THREE.Vector3();
  /** The left hand under a long gun's barrel while the right holds it at the shoulder (chest space, so it is solved once per gun). */
  function supportArm(id: GunId) {
    let a = supportArms.get(id);
    if (a) return a;
    const w = walker, gun = guns.get(id)!.group, fore = GUN_HOLD[id].fore ?? [0, 0, 0.4];
    setArm(w, 1, SHOULDER_ARM);
    const chain = [gun, w.handRight, w.elbowRight, w.armRight];
    const point = new THREE.Vector3(...fore), barrel = new THREE.Vector3(0, 0, 1);
    for (const o of chain) { o.updateMatrix(); point.applyMatrix4(o.matrix); barrel.transformDirection(o.matrix); }
    a = reach(w, -1, point, new THREE.Vector3(sideX(-1) * 0.3, -1, 0), copyArm([], ARM_POSES.RIFLE_SUPPORT), true);
    a[6] = HAND.GRIP;
    // The barrel runs through the fist.
    alignHand(w, -1, a, [0, 0, 1], barrel.transformDirection(chestFrame(w, _ik.n)));
    supportArms.set(id, a);
    return a;
  }
  /** Wrists together behind the lower back, palms facing, for the handcuffs (chest space). */
  function cuffArms() {
    if (cuffedArms) return cuffedArms;
    const w = walker;
    cuffedArms = ([-1, 1] as const).map((side) => {
      const sx = sideX(side);
      const a = reach(w, side, new THREE.Vector3(sx * 0.03, 1.1 - FIGURE.waistY, -0.17), new THREE.Vector3(sx * 0.6, -0.3, -0.8), copyArm([], ARM_POSES.RELAXED), true);
      a[6] = HAND.FIST;
      return alignHand(w, side, a, [-1, 0, 0], new THREE.Vector3(-sx, 0, 0));
    });
    return cuffedArms;
  }
  /** Poses the walker for this frame; `look` is how far the aim is turned from the body (radians), or null. */
  function animateWalker(dt: number, now: number, time: number, walking: boolean, o: { gun: GunId | null; kneeling: boolean; handsUp: boolean; armed: boolean; swim: number; sky: 'deck' | 'fall' | 'chute' | null; look: number | null }) {
    const w = walker;
    const speed = walking ? Math.abs(velocity) : 0;
    const go = Math.min(1, speed / 1.2);
    const run = THREE.MathUtils.clamp((speed - 3.2) / 3.2, 0, 1);
    // Longer, slower-cadence strides as the pace picks up.
    walkClock += speed * dt * (1.95 - 0.5 * run);
    const g = gait(walkClock * 2, run, go, walkGait);
    let thighL = g.thighL, thighR = g.thighR, kneeL = g.kneeL, kneeR = g.kneeR, ankleL = g.ankleL, ankleR = g.ankleR, toeL = g.toeL, toeR = g.toeR, spread = 0;
    // Arms swing against the legs, a little clear of the hips; elbows pump and the hands close into a run.
    const hand = mixHand(HAND.RELAXED, RUN_FIST, run);
    const L = arm(walkArms.left, g.armL, 0.09, 0, g.elbowL - 0.1, 0.15, 0, hand);
    const R = arm(walkArms.right, g.armR, 0.09, 0, g.elbowR - 0.1, 0.15, 0, hand);
    // The torso leans into speed and acceleration and banks into turns; the shoulders turn with the swinging
    // arms, against the legs.
    const accel = THREE.MathUtils.clamp((speed - motion.lastSpeed) / Math.max(dt, 1e-3), -12, 12);
    motion.lastSpeed = speed;
    const turnRate = Math.atan2(Math.sin(state.angle - motion.lastAngle), Math.cos(state.angle - motion.lastAngle)) / Math.max(dt, 1e-3);
    motion.lastAngle = state.angle;
    motion.lean = THREE.MathUtils.damp(motion.lean, 0.04 * go + 0.2 * run + accel * 0.012, 7, dt);
    motion.roll = THREE.MathUtils.damp(motion.roll, THREE.MathUtils.clamp(turnRate * speed * 0.01, -0.2, 0.2), 6, dt);
    let lean = motion.lean, twist = g.chest, headPitch = 0, drop = 0, planted = true, cuffed = false;
    // Where the eyes go (radians from the body's facing): the aim, or an idle look around when standing.
    let gaze = o.look ?? 0.45 * Math.sin(time * 0.31) * Math.max(0, Math.sin(time * 0.17)) * (1 - go);
    // Breathing while standing.
    w.body.scale.set(1, 1 + Math.sin(time * 2.3) * 0.01 * (1 - go), 1);
    if (jumpY > 0) {
      // Airborne: knees tucked, toes pointed, arms out for balance.
      thighL = -0.95; kneeL = 1.25; thighR = -0.3; kneeR = 0.7; ankleL = 0.35; ankleR = 0.5; toeL = toeR = 0;
      arm(L, -0.9, 0.5, 0, -0.55, 0.2, 0, HAND.OPEN);
      arm(R, -0.6, 0.5, 0, -0.55, 0.2, 0, HAND.OPEN);
      lean = 0.12; planted = false;
    }
    if (motion.land > 0) {
      // Landing: the legs soak up the impact (the planted feet bring the hips down), the arms come forward.
      const k = motion.land;
      thighL -= 0.5 * k; thighR -= 0.5 * k; kneeL += 1.0 * k; kneeR += 1.0 * k; ankleL -= 0.5 * k; ankleR -= 0.5 * k;
      lean += 0.15 * k; L[0] -= 0.3 * k; R[0] -= 0.3 * k; L[3] -= 0.4 * k; R[3] -= 0.4 * k;
      motion.land = Math.max(0, motion.land - dt * 5.5);
    }
    if (now < punchUntil) {
      // A jab: the right fist drives out palm down from a cocked elbow, the shoulders turn into it (the right
      // shoulder, at -x, comes forward: a positive turn), the left guards.
      const t = 1 - (punchUntil - now) / 180;
      arm(R, -1.5, -0.1, 0, -1.6 * (1 - Math.min(1, t * 1.8)) - 0.04, 1.2, 0, HAND.FIST);
      copyArm(L, ARM_POSES.GUARD);
      twist = 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3));
      lean += 0.08;
    } else if (o.armed && o.gun) {
      // Aiming: a pistol at arm's length in both hands; a long gun at the shoulder, the left hand under the barrel.
      if (o.gun === 'pistol') { copyArm(R, ARM_POSES.AIM); copyArm(L, ARM_POSES.AIM_SUPPORT); }
      else { copyArm(R, SHOULDER_ARM); copyArm(L, supportArm(o.gun)); }
    }
    if (o.handsUp) { copyArm(L, ARM_POSES.SURRENDER); copyArm(R, ARM_POSES.SURRENDER); gaze = 0; }
    // A hit snaps the torso back for a moment and throws the hands open.
    const hit = 1 - (now - motion.hitAt) / 280;
    if (hit > 0) {
      lean -= 0.4 * hit; L[1] += 0.4 * hit; R[1] += 0.4 * hit;
      L[6] = mixHand(L[6], HAND.OPEN, hit); R[6] = mixHand(R[6], HAND.OPEN, hit);
    }
    if (o.kneeling) {
      // Forced to kneel on both knees, the tops of the feet flat, hands cuffed behind the back.
      thighL = thighR = 0.15; kneeL = kneeR = 1.45; ankleL = ankleR = 0.9; toeL = toeR = 0;
      drop = FIGURE.hipY - FIGURE.thigh * Math.cos(0.15) - 0.06; planted = false;
      lean = 0.1; twist = 0; gaze = 0; headPitch = 0.15; cuffed = true;
    }
    if (now < stunUntil) {
      // Tasered: limbs jerk, fingers hooked.
      L[1] = 0.3 + Math.sin(time * 40) * 0.3; R[1] = 0.3 + Math.cos(time * 37) * 0.3; L[6] = R[6] = HAND.CLAW;
      thighL = Math.sin(time * 33) * 0.15;
    }
    if (o.swim > 0) {
      // Front crawl when moving (body flat, arms windmilling, a flutter kick); treading water when still,
      // arms sculling out to the sides.
      const crawl = Math.max(0, (o.swim - 0.25) / 0.75);
      const stroke = time * (4 + crawl * 2.5);
      const reachL = -Math.PI + (stroke % (Math.PI * 2)), reachR = -Math.PI + ((stroke + Math.PI) % (Math.PI * 2));
      const scull = Math.sin(time * 3);
      const lerp = THREE.MathUtils.lerp, paddle = handCode(0.15, 0.1, 0.1);
      lean = 0.12 + crawl * 1.2; twist = Math.sin(stroke) * 0.25 * crawl; planted = false; drop = 0; gaze = 0;
      headPitch = -0.65 * crawl;
      arm(L, lerp(-0.45, reachL, crawl), lerp(1.0 + scull * 0.3, 0.12, crawl), 0, reachL > 0 ? -0.7 * crawl - 0.4 * (1 - crawl) : -0.4 * (1 - crawl), 0.3, 0, paddle);
      arm(R, lerp(-0.45, reachR, crawl), lerp(1.0 + scull * 0.3, 0.12, crawl), 0, reachR > 0 ? -0.7 * crawl - 0.4 * (1 - crawl) : -0.4 * (1 - crawl), 0.3, 0, paddle);
      const kick = Math.sin(time * (crawl ? 9 : 2.6));
      thighL = lerp(kick * 0.45, 1.15 + kick * 0.22, crawl); thighR = lerp(-kick * 0.45, 1.15 - kick * 0.22, crawl);
      kneeL = lerp(0.5 + Math.max(0, kick) * 0.6, 0.2 + Math.max(0, kick) * 0.3, crawl);
      kneeR = lerp(0.5 + Math.max(0, -kick) * 0.6, 0.2 + Math.max(0, -kick) * 0.3, crawl);
      ankleL = ankleR = lerp(0.3, 0.7, crawl); toeL = toeR = 0;
    }
    if (o.sky === 'fall') {
      // Freefall: belly to the earth, arms out with the hands by the head, legs spread and bent.
      lean = 1.25; twist = 0; planted = false; drop = 0; gaze = 0; headPitch = -0.75;
      for (const [side, a] of [[-1, L], [1, R]] as const) {
        arm(a, 0, 0, 0, 0, 0.3, 0, HAND.OPEN);
        reach(w, side, _fall.set(sideX(side) * 0.42, FIGURE.shoulderY - FIGURE.waistY + 0.2, 0.1), _fallHint.set(sideX(side), -0.6, -0.2), a, true);
      }
      // The legs hang from the hips, not the leaning torso: swing them back in line, knees bent up behind.
      thighL = thighR = lean - 0.25; kneeL = kneeR = 0.9; ankleL = ankleR = 0.6; toeL = toeR = 0; spread = 0.3;
    } else if (o.sky === 'chute') {
      // Hanging in the harness, fists up on the steering toggles, legs dangling.
      lean = -0.05; twist = 0; planted = false; drop = 0; gaze = 0;
      arm(L, -2.75, 0.28, 0, -0.35, 0, 0, HAND.GRIP);
      arm(R, -2.75, 0.28, 0, -0.35, 0, 0, HAND.GRIP);
      thighL = Math.sin(time * 1.3) * 0.15 - 0.1; thighR = -Math.sin(time * 1.3) * 0.15 - 0.1; kneeL = kneeR = 0.25; ankleL = ankleR = 0.45; toeL = toeR = 0;
    }
    // The lower foot stays on the ground: that gives the stride its bob and drops the hips into a landing.
    const plant = planted ? Math.max(legReach(thighL, kneeL, ankleL, toeL), legReach(thighR, kneeR, ankleR, toeR)) - FIGURE.sole : 0;
    w.group.position.y += (plant - drop) * PERSON_SCALE;
    w.body.rotation.set(lean, 0, motion.roll);
    w.chest.rotation.y = twist;
    // The head turns the rest of the way to the gaze.
    w.head.rotation.set(headPitch, THREE.MathUtils.clamp(gaze - twist, -1.1, 1.1), 0);
    w.limbLeft.rotation.set(thighL, 0, sideX(-1) * spread);
    w.limbRight.rotation.set(thighR, 0, sideX(1) * spread);
    w.kneeLeft.rotation.x = kneeL;
    w.kneeRight.rotation.x = kneeR;
    w.ankleLeft.rotation.x = ankleL;
    w.ankleRight.rotation.x = ankleR;
    w.toe.left = toeL;
    w.toe.right = toeR;
    blink(w, time);
    if (cuffed) { const [cl, cr] = cuffArms(); copyArm(L, cl); copyArm(R, cr); }
    setArm(w, -1, L);
    setArm(w, 1, R);
    // The delivery box lags behind the bounce on its straps (a damped spring).
    const packTarget = -plant * 1.2 + (jumpY > 0 ? -0.04 : 0);
    motion.packV += ((packTarget - motion.pack) * 90 - motion.packV * 9) * dt;
    motion.pack += motion.packV * dt;
    w.pack.position.y = PACK_Y + motion.pack;
    w.pack.rotation.x = -lean * 0.4 + motion.packV * 0.15;
    w.sync();
  }

  function walk(dt: number, now: number, vertical: number, horizontal: number) {
    // On foot, movement is relative to where the camera is looking.
    const fp = firstPerson(), airborne = powers.altitude > 0.05 || powers.flying;
    const forwardX = fp ? Math.sin(cameraMode.yaw) : -Math.sin(smoothView.yaw), forwardZ = fp ? Math.cos(cameraMode.yaw) : -Math.cos(smoothView.yaw);
    const dirX = forwardX * vertical - forwardZ * horizontal;
    const dirZ = forwardZ * vertical + forwardX * horizontal;
    const moving = horizontal !== 0 || vertical !== 0;
    const aiming = fp || now < aimUntil;
    if (fp) state.angle = cameraMode.yaw;
    if (moving && !aiming) state.angle = angleLerp(state.angle, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * 12));
    // Tear gas makes it hard to run; swimming is slow (Shift for a faster crawl).
    const topSpeed = airborne ? (keys.has('shift') ? 24 : 16) : swimming ? (keys.has('shift') ? 2.9 : 1.8) : (keys.has('shift') ? 6.8 : now < aimUntil ? 3.4 : 4.2) * (performance.now() < gassedUntil ? 0.55 : 1) * footSpeed(buffOn('mat'));
    velocity = THREE.MathUtils.damp(velocity, moving ? topSpeed : 0, 9, dt);
    if (velocity < 0.025) velocity = 0;
    // While aiming the player strafes in the input direction instead of turning.
    const length = Math.hypot(dirX, dirZ) || 1;
    const headingX = aiming && moving ? dirX / length : Math.sin(state.angle);
    const headingZ = aiming && moving ? dirZ / length : Math.cos(state.angle);
    // Tipsy: the path weaves from side to side.
    const tipsy = Math.max(0, Math.min(1, (drunkUntil - now) / 20000));
    const weave = tipsy * Math.sin(now / 420) * 0.55;
    const dx = (headingX * Math.cos(weave) + headingZ * Math.sin(weave)) * velocity * dt, dz = (headingZ * Math.cos(weave) - headingX * Math.sin(weave)) * velocity * dt;
    if (airborne ? clearAt(state.x + dx, state.z, 0.4) : footClear(state.x + dx, state.z)) state.x += dx;
    if (airborne ? clearAt(state.x, state.z + dz, 0.4) : footClear(state.x, state.z + dz)) state.z += dz;
    if (swimming) {
      // A passing boat shoves a swimmer aside (and hurts if it was going fast).
      const pushed = boats.pushOut(state, 0.45);
      if (pushed && Math.abs(pushed.speed) > 3 && now > boatHitAt) {
        boatHitAt = now + 1500;
        damagePlayer(Math.abs(pushed.speed) * 2, now, pushed, 'Tàu thuyền');
        splash(state.x, state.z, now, 1);
        notify('Bị thuyền va phải! Tránh xa luồng tàu.', 2000);
      }
    } else if (!airborne && velocity > 0.5) ragdolls.push(state.x, state.z, 0.45, headingX * velocity * 1.1, 0.4, headingZ * velocity * 1.1);
    return moving;
  }

  const peerGait = newGait();
  const peerArms = { left: copyArm([], ARM_POSES.RELAXED), right: copyArm([], ARM_POSES.RELAXED) };
  /** Another player on foot or in the water, from what the network tells of them: speed and the gun out. */
  function posePeer(p: Person, swim: boolean, speed: number, gun: GunId | null, dt: number, time: number) {
    const s = Math.abs(speed), go = Math.min(1, s / 1.2), run = THREE.MathUtils.clamp((s - 3.2) / 3.2, 0, 1);
    p.stride += s * dt * (1.95 - 0.5 * run) * 2;
    const g = gait(p.stride, run, go, peerGait);
    const hand = mixHand(HAND.RELAXED, RUN_FIST, run);
    const L = arm(peerArms.left, g.armL, 0.09, 0, g.elbowL - 0.1, 0.15, 0, hand), R = arm(peerArms.right, g.armR, 0.09, 0, g.elbowR - 0.1, 0.15, 0, hand);
    let lean = 0.04 * go + 0.2 * run, thighL = g.thighL, thighR = g.thighR, kneeL = g.kneeL, kneeR = g.kneeR, ankleL = g.ankleL, ankleR = g.ankleR;
    if (swim) {
      // A front crawl when moving, treading water otherwise.
      const crawl = go, stroke = time * 5.5 + p.stride * 0.1;
      const reachL = -Math.PI + (stroke % (Math.PI * 2)), reachR = -Math.PI + ((stroke + Math.PI) % (Math.PI * 2));
      const kick = Math.sin(time * (crawl > 0.5 ? 9 : 2.6)), lerp = THREE.MathUtils.lerp;
      lean = 0.12 + 1.2 * crawl;
      arm(L, lerp(-0.45, reachL, crawl), lerp(1.0, 0.12, crawl), 0, -0.4, 0.3, 0, HAND.OPEN);
      arm(R, lerp(-0.45, reachR, crawl), lerp(1.0, 0.12, crawl), 0, -0.4, 0.3, 0, HAND.OPEN);
      thighL = lerp(kick * 0.45, 1.15 + kick * 0.22, crawl); thighR = lerp(-kick * 0.45, 1.15 - kick * 0.22, crawl);
      kneeL = kneeR = 0.35; ankleL = ankleR = 0.5;
    } else if (gun === 'pistol') { copyArm(R, ARM_POSES.AIM); copyArm(L, ARM_POSES.AIM_SUPPORT); }
    else if (gun) { copyArm(R, SHOULDER_ARM); copyArm(L, supportArm(gun)); }
    // The lower foot stays on the ground (peers stand in their own group at ground level).
    p.group.position.y = swim ? 0 : (Math.max(legReach(thighL, kneeL, ankleL, g.toeL), legReach(thighR, kneeR, ankleR, g.toeR)) - FIGURE.sole) * PERSON_SCALE;
    p.body.rotation.set(lean, 0, 0);
    p.chest.rotation.y = swim ? 0 : g.chest;
    p.head.rotation.set(swim ? -0.6 * go : 0, swim ? 0 : -g.chest * 0.8, 0);
    p.limbLeft.rotation.set(thighL, 0, 0);
    p.limbRight.rotation.set(thighR, 0, 0);
    p.kneeLeft.rotation.x = kneeL;
    p.kneeRight.rotation.x = kneeR;
    p.ankleLeft.rotation.x = ankleL;
    p.ankleRight.rotation.x = ankleR;
    p.toe.left = swim ? 0 : g.toeL;
    p.toe.right = swim ? 0 : g.toeR;
    blink(p, time, p.look.shirt.charCodeAt(2) % 7);
    setArm(p, -1, L);
    setArm(p, 1, R);
    p.sync();
  }

  function updatePeers(now: number, time: number, dt: number) {
    const renderTime = peerClock.renderTime(now);
    for (const [, peer] of peers) {
      const { target } = peer;
      const pose = peer.motion.sample(renderTime);
      if (!pose) continue;
      peer.group.position.x = pose.x;
      peer.group.position.z = pose.z;
      const { x, z } = peer.group.position;
      const kind = peerVehicle(peer);
      peer.group.position.y = kind === 'swim' ? WATER_LEVEL - 1.5 : kind === 'boat' ? WATER_LEVEL : groundHeight(x, z) - 0.02 + pose.altitude;
      peer.heroLook.update(target.hero ?? 'none', !!target.flying, time);
      peer.foot.group.rotation.y = pose.angle;
      peer.bike.group.rotation.y = peer.foot.group.rotation.y;
      if (kind === 'boat' && !peer.boat) { peer.boat = makeBoatMesh(); peer.group.add(peer.boat); }
      if (peer.boat) { peer.boat.visible = kind === 'boat'; peer.boat.rotation.y = pose.angle; }
      if ((kind === 'car' || kind === 'police') && peer.carKind !== kind) {
        if (peer.car) { peer.group.remove(peer.car); disposeTree(peer.car); }
        peer.car = makeCarMesh(kind === 'police' ? 'police' : 'traffic', kind === 'police' ? '#f4f4f0' : peer.color);
        peer.group.add(peer.car);
        peer.carKind = kind;
      }
      if (peer.car) {
        peer.car.visible = kind === 'car' || kind === 'police';
        peer.car.rotation.y = peer.foot.group.rotation.y;
        peer.car.position.y = 0.08;
      }
      // Downed players lie as a local ragdoll until they respawn.
      if (target.down && !peer.body) {
        // Dressed like their figure (its look carries the style), limp, and never evicted to make room.
        peer.body = ragdolls.spawn({
          x, y: groundHeight(x, z), z, yaw: target.angle, scale: RAGDOLL_SCALE, look: peer.foot.look, mode: 'limp', keep: true,
          velocity: { x: (Math.random() - 0.5) * 3, y: 2, z: (Math.random() - 0.5) * 3 },
        });
        effects.blood(hitPoint.set(x, 1, z), rayDir.set(0, 0, 1), 6);
      } else if (!target.down && peer.body) {
        ragdolls.remove(peer.body);
        peer.body = null;
      }
      peer.foot.group.visible = (kind === 'foot' || kind === 'swim' || kind === 'boat') && !target.down;
      peer.bike.group.visible = kind === 'scooter' && !target.down;
      peer.label.position.y = kind === 'car' || kind === 'police' ? 3.1 : kind === 'swim' ? 3.6 : 2.6;
      const gun = target.weapon && target.weapon !== 'fists' ? target.weapon : null;
      for (const [id, model] of peer.guns) model.visible = id === gun;
      if (peer.foot.group.visible) posePeer(peer.foot, kind === 'swim', pose.altitude > 0.05 ? 0 : pose.speed, gun, dt, time);
      if (target.firing && now - peer.flashAt > 160) {
        peer.flashAt = now;
        // The muzzle of a gun held out at shoulder height.
        const a = peer.foot.group.rotation.y;
        scratch.set(x + Math.sin(a) * 0.8 + Math.cos(a) * 0.05, 1.34, z + Math.cos(a) * 0.8 - Math.sin(a) * 0.05);
        effects.flash(scratch, now, 0.7);
        if (target.weapon && target.weapon !== 'fists' && Math.hypot(x - state.x, z - state.z) < 60) playShot(target.weapon);
      }
      if (!target.down) {
        const vehicleBlob = kind === 'foot' ? [0.9, 0.9] : kind === 'scooter' ? [0.9, 2.1] : [2.4, 5];
        if (kind !== 'swim' && kind !== 'boat') effects.blob(x, groundHeight(x, z) + 0.02, z, vehicleBlob[0], vehicleBlob[1], peer.foot.group.rotation.y);
      }
    }
  }

  function update(now: number) {
    if (disposed) return;
    for (const item of restoredVisibility) item.object.visible = item.visible;
    restoredVisibility.length = 0;
    const interval = now - previousTime;
    // Holding Tab for the weapon bag slows the street down, like a weapon wheel.
    const dt = Math.min(interval / 1000, 0.05) * (bagOpen ? 0.25 : 1);
    previousTime = now;
    // Frames behind an opaque overlay say nothing about how fast the street draws.
    adaptQuality(now, covered ? 0 : interval);
    const time = now / 1000;
    const street = active || started;
    updatePowers(Math.min(0.1, Math.max(0, interval / 1000)), now);
    if (!firstPerson() || !active) exitLookLock();
    let moving = false;
    const def = weaponById(weapon);

    // Down states: get up after a crash; wait five seconds after an arrest or being downed.
    if (down === 'wasted' && now > downUntil) respawn(now);
    else if (down === 'busted' && now > downUntil) release();
    else if (down === 'crash' && playerBody && now > downUntil && (playerBody.asleep || playerBody.removed || now > downUntil + 2500)) standUp();
    if (reloadWeapon && now > reloadUntil) {
      const rounds = ammo.get(reloadWeapon), rdef = weaponById(reloadWeapon);
      if (rounds) { const take = Math.min(rdef.magazine - rounds.mag, rounds.reserve); rounds.mag += take; rounds.reserve -= take; }
      reloadWeapon = null;
    }

    const stunned = now < stunUntil;
    if (!state.riding) wasDriving = false;
    if (police.wanted === 0) surrendered = false;
    if (active && !down && !stunned && !surrendered) {
      let horizontal = 0;
      let vertical = 0;
      if (!focusedInput()) {
        if (keys.has('w') || keys.has('arrowup')) vertical += 1;
        if (keys.has('s') || keys.has('arrowdown')) vertical -= 1;
        if (keys.has('d') || keys.has('arrowright')) horizontal += 1;
        if (keys.has('a') || keys.has('arrowleft')) horizontal -= 1;
        horizontalInput = horizontal;
        if (keys.has('z')) { if (firstPerson()) cameraMode.rotate(-dt * 400, 0); else view.yaw += dt * 1.9; manualCameraAt = now; }
        if (keys.has('c')) { if (firstPerson()) cameraMode.rotate(dt * 400, 0); else view.yaw -= dt * 1.9; manualCameraAt = now; }
      }
      const braking = keys.has(' ') || keys.has('space');
      if (ride || seat) {
        // Riding along or sitting: no walking; a step (or the trigger) gets the player up off a seat.
        velocity = 0;
        if (seat && (vertical || horizontal || triggerQueued) && now - seat.at > 400) leaveSeat();
        triggerQueued = false;
      } else if (state.riding) {
        driveVehicle(dt, now, time, vertical, horizontal, braking);
        moving = velocity !== 0;
      } else if (boat) {
        driveBoat(dt, now, vertical, horizontal, braking);
        moving = velocity !== 0;
      } else if (glide) moving = glideMove(dt, now, vertical, horizontal);
      else moving = walk(dt, now, vertical, horizontal);
      if (firstPerson()) cameraMode.followCarrier(state.riding ? 'vehicle' : boat ? 'boat' : ride ? 'passenger' : glide && glide.phase !== 'deck' ? 'glide' : null, state.angle);
      const wantsShot = triggerQueued || (def.auto && (mouseHeld || keys.has('f')));
      if (wantsShot && !bagOpen && !ride && !seat && now - lastShot >= 1000 / def.fireRate) {
        triggerQueued = false;
        fire(now, time);
      }
      state.speed = velocity;
      // Natural healing (services.ts): to 60 in the city (70 seated), a full stomach to 100; zombie mode as before.
      if (time - lastDamage > 6 && police.wanted === 0) {
        const rate = regenRate(health, { zombie: zombieMode, full: buffOn('no'), seated: !!seat });
        if (rate) health = Math.min(MAX_HEALTH, health + dt * rate);
      }
      if (!seat && !ride && powers.altitude <= 0.05) unstick(dt);
    } else {
      if (!state.riding) velocity = 0;
      state.speed = velocity;
      triggerQueued = false;
    }

    // Deep water under someone on foot means swimming (weapons away); back in the shallows they walk.
    const deep = !state.riding && !boat && !glide && !playerBody && !ride && powers.altitude <= 0.05 && deepWater(state.x, state.z, bodyY);
    if (deep && !swimming) {
      swimming = true;
      jumpY = jumpV = 0;
      notify(police.wanted > 0 ? 'Nhảy xuống sông! Cảnh sát trên bờ khó đuổi theo.' : 'Đang bơi · Shift bơi nhanh · tới bậc thang hoặc cầu tàu, hoặc sát bờ kè nhấn Space để lên', 3500);
    } else if (!deep && swimming) swimming = false;
    updateHeist(now);
    // The hire boat goes back to its dock once it has been left far behind.
    if (!boat && boats.rental.mode === 'player' && now - boatLeftAt > 4000 && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) > 160) boats.dock();
    boats.update(dt, time, swimming || boat ? { x: state.x, z: state.z } : null, cameraTarget);
    boats.setNight(atmosphere.night);

    // The world moves on: weather and clock, traffic, police, gangs and residents.
    // Rain fills whatever the camera can see, so it scales with the zoom.
    if (atmosphere.update(dt, time, cameraTarget, THREE.MathUtils.clamp(smoothView.dist * 2.4, 50, 220)) && shadowsAllowed) renderer.shadowMap.needsUpdate = true;
    {
      // Up an observation deck or under a parachute the city below is seen further: the fog draws back with the
      // camera's height (the world draws as far as the fog, world.ts), and is back to the street's below 40 m.
      const up = glide ? Math.max(0, camera.position.y - 40) : 0, fog = scene.fog as THREE.Fog;
      if (up > 0) { fog.near += up * 0.9; fog.far += up * 1.3; }
    }
    if (followShadows(cameraTarget.x, cameraTarget.z) && shadowsAllowed) renderer.shadowMap.needsUpdate = true;
    if (interior) {
      hemi.intensity = 2.3;
      sun.intensity = 2.1;
      sun.color.set('#fff3e2');
      interiors.setInfo({ owned: [...owned], bike: bikeId });
      interiors.update(dt, time);
    }
    applyShadows();
    // The hour switches each shop's light pool off while its shutter is down.
    world.setAtmosphere({ night: atmosphere.night, wet: atmosphere.rain, sky: (scene.fog as THREE.Fog).color, hours: atmosphere.hours });
    vehicles.setNight(atmosphere.night);
    vehicles.setWet(atmosphere.rain);
    setRain(street ? atmosphere.rain : 0);
    crossing.length = 0;
    npcs.forEachCrossing((x, z) => crossing.push({ x, z }));
    // Traffic stops for a body lying in its lane (until it is taken away) instead of shoving it down the road;
    // one lying on the sidewalk is no reason to stop.
    ragdolls.forEach((body) => {
      ragdolls.center(body, scratch);
      if (!onSidewalk(scratch.x, scratch.z)) crossing.push({ x: scratch.x, z: scratch.z, body: true });
    });
    // People and riders outside the camera's view (last frame's) are not posed or drawn.
    viewFrustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    vehicles.setView(viewFrustum);
    npcs.setView(viewFrustum);
    // Parked vehicles come and go with the hour (vehicles.ts occupancy); the tow is quicker for a wanted player.
    vx.setClock?.(atmosphere.hours, atmosphere.clock.day);
    // The player's own bike standing somewhere is in the way like any parked vehicle: traffic eases past it, people go round.
    if (state.riding && !playerCar) vehicles.clearObstacle('own-bike');
    else if (bikeId === 'horse') vehicles.registerObstacle('own-bike', bikeX, bikeZ, 0.45, 1.2, bikeAngle);
    else vehicles.registerObstacle('own-bike', bikeX, bikeZ, 0.4, 1, bikeAngle);
    vehicles.setHiddenVehicle(firstPerson() ? playerCar : null);
    for (const crash of vehicles.update(dt, time, { x: state.x, z: state.z, car: playerCar, wanted: police.wanted }, crossing)) handleCrash(crash, now, time, false);
    buses.setFirstPersonRideHidden(firstPerson());
    buses.update(dt, time, { x: state.x, z: state.z, car: playerCar, riding: state.riding, zombie: zombieMode, hours: atmosphere.hours, day: atmosphere.clock.day }, crossing, viewFrustum);
    buses.setNight(atmosphere.night);
    checkRedLight(time);
    vehicleImpacts(now);
    const policeResult = police.update(dt, time, {
      x: state.x, z: state.z, car: playerCar, riding: state.riding, heading: state.angle, speed: Math.abs(velocity), down: down !== null, stunned: now < stunUntil,
      altitude: powers.altitude,
      armed: weapon !== 'fists' && !inCar(), surrendered, pinned: down === 'crash' && now < pinnedUntil, night: atmosphere.night,
    });
    if (policeResult.called) notify('Có người đã báo công an! Cảnh sát đang trên đường tới, tranh thủ chuồn đi.', 4000);
    if (policeResult.arrived) notify('Cảnh sát đã tới hiện trường!', 2200);
    if (policeResult.tackled && !down) {
      knockPlayer(Math.sin(state.angle) * 3, 2, Math.cos(state.angle) * 3, now);
      pinnedUntil = now + 3200;
      damagePlayer(5, now, undefined, 'Cảnh sát');
      notify('Bị cảnh sát quật ngã!', 2500);
    }
    if (policeResult.pulledOut && state.riding && !down) {
      const side = inCar() ? 2.2 : 1.2;
      // Out of the driver's door, on the left (+x).
      const ox = Math.cos(state.angle) * side, oz = -Math.sin(state.angle) * side;
      leaveVehicleNow();
      if (clearAt(state.x + ox, state.z + oz, 0.4)) { state.x += ox; state.z += oz; }
      knockPlayer(ox * 1.5, 1.5, oz * 1.5, now);
      pinnedUntil = now + 3200;
      notify('Bị lôi ra khỏi xe!', 2500);
    }
    for (const throwGas of policeResult.gas) {
      gasClouds.push({ x: throwGas.x, z: throwGas.z, born: now + 700, until: now + 9500, next: 0 });
      effects.tracer(hitPoint.set(throwGas.fromX, 1.5, throwGas.fromZ), scratch.set(throwGas.x, 0.3, throwGas.z), now);
      npcs.alarm(throwGas.x, throwGas.z, 8, time);
    }
    // Tear gas clouds: grey-green smoke; standing in one chokes and slows the player.
    for (let i = gasClouds.length - 1; i >= 0; i--) {
      const cloud = gasClouds[i];
      if (now > cloud.until) { gasClouds.splice(i, 1); continue; }
      if (now < cloud.born) continue;
      if (now > cloud.next) {
        cloud.next = now + 110;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 3.6;
        effects.smoke(cloud.x + Math.cos(a) * r, groundHeight(cloud.x, cloud.z) + 0.4, cloud.z + Math.sin(a) * r, now, false, '#cdd5ae');
      }
      if (!inCar() && down !== 'wasted' && powers.altitude < 2 && Math.hypot(state.x - cloud.x, state.z - cloud.z) < 4.2) {
        gassedUntil = now + 1500;
        damagePlayer(2.5 * dt, now);
        if (now > coughAt) { coughAt = now + 2500; bubbles.say('player', 'Khụ khụ… cay mắt quá!', now, () => ({ x: state.x, y: groundHeight(state.x, state.z) + 2, z: state.z }), 1800, 'shout'); }
      }
    }
    if (policeResult.spiked) notify('Cảnh sát rải bẫy đinh phía trước!', 2500);
    if (policeResult.blocked) notify('Phía trước có chốt chặn của cảnh sát!', 2500);
    // Driving over a spike strip: cars get flat tyres, bikes go down.
    if (state.riding && !down && police.onSpikes(state.x + Math.sin(state.angle) * 1.2, state.z + Math.cos(state.angle) * 1.2)) {
      playThud();
      shake = Math.max(shake, 0.4);
      if (inCar() && playerCar) { flatCars.add(playerCar); notify('Xịt lốp! Xe chạy chậm và khó lái.', 3000); }
      else crash(now);
    }
    flatTires = !!playerCar && flatCars.has(playerCar);
    if (policeResult.shots.some((shot) => shot.kind !== 'taser')) npcs.notice(state.x, state.z, 'shots', time);
    for (const shot of policeResult.shots) {
      playerPoint.set(state.x, bodyY + jumpY + 1.1 + powers.altitude, state.z);
      if (!shot.hit) playerPoint.add(scratch.set((Math.random() - 0.5) * 2.5, Math.random() * 0.8, (Math.random() - 0.5) * 2.5));
      if (shot.kind === 'taser') {
        // A taser dart: a short spark line, and a hit stuns a player on foot.
        effects.tracer(shot.from, playerPoint, now);
        if (shot.hit && !state.riding) { stunUntil = now + 1700; damagePlayer(shot.damage, now, shot.from, 'Cảnh sát'); notify('Bị bắn súng điện! Tê liệt trong giây lát…', 1700); }
        continue;
      }
      effects.tracer(shot.from, playerPoint, now);
      effects.flash(shot.from, now, shot.kind === 'shotgun' ? 1 : 0.7);
      playShot(shot.kind === 'shotgun' ? 'shotgun' : shot.kind === 'smg' ? 'smg' : 'pistol');
      if (shot.hit) damagePlayer(shot.damage * (inCar() ? 0.55 : 1), now, shot.from, 'Cảnh sát');
    }
    for (let i = 0; i < policeResult.strikes; i++) {
      damagePlayer(7, now, undefined, 'Cảnh sát');
      playThud();
      notify('Cảnh sát vụt dùi cui!', 1200);
    }
    if (policeResult.arrested && (!down || (down === 'crash' && now < pinnedUntil))) busted(now);

    if (jumpV !== 0 || jumpY > 0) {
      jumpV -= 18 * dt;
      jumpY = Math.max(0, jumpY + jumpV * dt);
      if (jumpY === 0) { jumpV = 0; motion.land = 1; if (!state.riding) shake = Math.max(shake, 0.05); }
    }
    if (state.riding || down) { jumpY = 0; jumpV = 0; }

    const armed = weapon !== 'fists';
    const aiming = armed && !down && (now < aimUntil || (!state.riding && (mouseHeld || keys.has('f') || pointerInside)));
    bloom = Math.max(0, bloom - dt * 2.4);
    let locked = false;
    if (pointerInside && armed && !down) {
      // Pointing the gun follows the mouse so the person in front of the barrel knows it.
      // Red only when the shot is clear: a wall in between keeps the crosshair white.
      locked = pointerAim(weaponById(weapon).range, reticlePoint) && lineOfSight(state.x, state.z, reticlePoint.x, reticlePoint.z);
      if (!state.riding) aimYaw = Math.atan2(reticlePoint.x - state.x, reticlePoint.z - state.z);
    } else {
      if (now > aimUntil) aimYaw = state.angle;
      if (armed && !down) aimAhead(9, reticlePoint);
    }
    updateReticle(active && (armed || firstPerson()) && !down && !bagOpen, locked, pointerInside, now);
    gangKnocks = 0;
    if (zombieMode) updateZombies(dt, now, time);
    const npcEvents = zombieMode ? NO_NPC_EVENTS : npcs.update(dt, time, atmosphere.hours, atmosphere.rain > 0.4, { x: state.x, z: state.z, aimYaw, armed: armed && !inCar(), aiming, inVehicle: state.riding, down: down !== null }, state.x, state.z, groundHeight);
    for (const robbery of npcEvents.robbed) {
      // A hold-up at a counter costs that counter's stars (a mini mart's camera calls it in, a gold shop's alarm
      // rings); street vendors and lottery sellers are protected: they run, and there is nothing to take.
      const at = robbery.shop ? counterAt(robbery.npc.x, robbery.npc.z) : null;
      if ((robbery.npc as Npc & { protected?: boolean }).protected || at?.def.robbable === 0) {
        police.crime(1, time);
        notify('Người bán hàng rong chỉ có mấy đồng lẻ · họ bỏ chạy, còn bạn thì bị báo công an.', 3000);
        continue;
      }
      const stars = at ? at.def.robbable : robbery.shop ? 2 : 1;
      const amount = Math.round(robbery.amount * (stars >= 3 ? 4 : stars === 2 ? 1.5 : 1));
      pickups.drop(robbery.npc.x - Math.sin(robbery.npc.yaw) * -0.6, robbery.npc.z - Math.cos(robbery.npc.yaw) * -0.6, amount, now);
      police.crime(stars, time);
      if (at?.def.kind === 'gold') { npcs.alarm(robbery.npc.x, robbery.npc.z, 30, time); playHorn(true); }
      notify(at?.def.kind === 'gold' ? `Cướp tiệm vàng! Chuông báo động réo · nhặt ${formatThousands(amount)} rồi chạy!`
        : at?.def.kind === 'mart' ? `Cướp mini mart! Camera đã ghi hình · nhặt ${formatThousands(amount)}`
        : robbery.shop ? `Cướp tiệm! Nhặt ${formatThousands(amount)} rơi trước mặt` : `Cướp được ${formatThousands(amount)}, nhặt tiền đi!`, 2500);
    }
    if (powers.altitude <= 1.3) for (let i = 0; i < npcEvents.strikes; i++) { damagePlayer(6, now, undefined, 'Băng đảng'); playThud(); }
    if (npcEvents.shots.length) npcs.notice(state.x, state.z, 'shots', time);
    for (const shot of npcEvents.shots) {
      playerPoint.set(state.x, bodyY + jumpY + powers.altitude + 1.1, state.z);
      if (!shot.hit) playerPoint.add(scratch.set((Math.random() - 0.5) * 3, Math.random() * 0.8, (Math.random() - 0.5) * 3));
      effects.tracer(shot.from, playerPoint, now);
      effects.flash(shot.from, now, 0.7);
      playShot('pistol');
      if (shot.hit) damagePlayer(inCar() ? 5 : 9, now, shot.from, 'Băng đảng');
    }
    animals.update(dt, time, state.x, state.z);
    for (const blast of explosives.update(dt, now, projectileHit)) applyBlast(blast, now, true);
    for (let i = pendingBlasts.length - 1; i >= 0; i--) {
      const pending = pendingBlasts[i];
      if (now < pending.at) continue;
      pendingBlasts.splice(i, 1);
      const car = pending.car;
      blastPoint.set(car.x, 1, car.z);
      explosives.detonate(blastPoint, 6, now);
      explosives.burn(car.x, 1.0, car.z, 14, car.kind === 'moto' ? 0.4 : 0.8, now);
      if (car === playerCar) { damagePlayer(70, now); exitVehicle(); }
      applyBlast({ x: car.x, y: 1, z: car.z, radius: 6, damage: 120 }, now, false);
    }
    const collected = pickups.update(now, state.x, state.z, !down && !inCar() && powers.altitude <= 1.3);
    if (collected) { cash += collected; notify(`+${formatThousands(collected)}`, 1500); }
    for (let i = looseBodies.length - 1; i >= 0; i--) {
      if (time > looseBodies[i].until || looseBodies[i].body.removed) {
        ragdolls.remove(looseBodies[i].body);
        looseBodies.splice(i, 1);
      }
    }

    if (active && !document.hidden && !down && !zombieMode) handleMissionEvent(missions.update(Math.max(0, interval / 1000), missionPlayer()));

    // Side missions (none while the dead walk).
    const missionResult = zombieMode ? { view: null, passenger: false, completed: null, failed: null } : sideMissions.update(dt, missionContext(time));
    sideView = missionResult.view;
    passengerAboard = missionResult.passenger || testPassenger;
    if (missionResult.completed) {
      cash += missionResult.completed.reward;
      state.score += missionResult.completed.score;
      if (missionResult.completed.heal) health = MAX_HEALTH;
      notify(`Hoàn thành "${missionResult.completed.title}" · +${formatThousands(missionResult.completed.reward)}`, 4500);
    }
    if (missionResult.failed) notify(missionResult.failed, 4000);
    updateInteraction(dt, now, time);

    // Player, bike and props. In the water the body floats (head and shoulders out when treading, flat when
    // swimming); stepping off a pier or over the railing it first drops into the river.
    walker.group.visible = !state.riding && !playerBody && !boat && !(ride && ride.pose && ride.pose !== 'chair');
    const swimPace = swimming ? Math.min(1, velocity / 1.6) : 0;
    // The ground under the body at its own height (bodyY): a bridge deck above a swimmer or a walker on the kè below it is not theirs.
    const surface = glide ? glide.y : swimming ? WATER_LEVEL - 1.25 + swimPace * 0.44 : groundHeight(state.x, state.z, bodyY + jumpY) - 0.02;
    if (!glide && bodyY > surface + 0.08) {
      fallV -= 18 * dt;
      bodyY = Math.max(surface, bodyY + fallV * dt);
      if (bodyY === surface && swimming) splash(state.x, state.z, now, Math.min(2, -fallV / 6));
    } else { bodyY = surface; fallV = 0; }
    walker.group.position.set(state.x, bodyY + jumpY + powers.altitude + (swimming ? Math.sin(time * 2.3) * 0.04 : 0), state.z);
    walker.group.rotation.y = state.angle;
    heroLook.update(powers.hero, powers.flying, time);
    canopy.visible = glide?.phase === 'chute';
    if (glide?.phase === 'chute') {
      const open = Math.min(1, (now - glide.since) / 600);
      canopy.position.set(state.x, glide.y, state.z);
      canopy.rotation.set(0, state.angle, -horizontalInput * 0.25, 'YXZ');
      canopy.scale.set(0.25 + 0.75 * open, 0.4 + 0.6 * open, 0.4 + 0.6 * open);
    }
    helm.group.visible = boat === boats.rental;
    if (swimming && moving && now > splashAt) { splashAt = now + 380; effects.smoke(state.x - Math.sin(state.angle) * 0.6, WATER_LEVEL + 0.1, state.z - Math.cos(state.angle) * 0.6, now, false, '#eef6f4'); }
    const arrestTime = down === 'busted' ? now - bustedAt : -1;
    const kneeling = arrestTime > 900;
    const handsUp = surrendered || (arrestTime >= 0 && !kneeling);
    // The head follows the aim (the pointer, or the last shot) while a gun is out.
    const aimTurn = armed && aiming && !down ? Math.atan2(Math.sin(aimYaw - state.angle), Math.cos(aimYaw - state.angle)) : null;
    // A takeaway drink: in the right hand for a while, sipped every few seconds.
    const cupOn = now < cupUntil && !state.riding && !playerBody && !boat && !swimming && !glide && !down && weapon === 'fists' && !ride;
    const sip = cupOn ? Math.max(0, Math.sin((now - cupUntil) / 1300)) ** 6 : 0;
    walkerCup.visible = cupOn;
    if (seat) {
      // On the seat: slide onto it over 0.35 s, face the way it faces, sit down.
      const k = Math.min(1, (now - seat.at) / 350);
      state.x += (seat.x - state.x) * k; state.z += (seat.z - state.z) * k;
      state.angle = angleLerp(state.angle, seat.yaw, k);
      const drop = poseSeated(walker, seat.top, time, 0, sip);
      walker.group.position.set(state.x, groundHeight(seat.x, seat.z) + seat.top - drop * Math.min(1, k * 1.5), state.z);
      walker.group.rotation.y = state.angle;
    } else if (ride) {
      const s = ride.seat();
      state.x = s.x; state.z = s.z; state.angle = s.yaw;
      bodyY = s.y;
      if (!ride.pose || ride.pose === 'chair') {
        const drop = poseSeated(walker, 0.45, time);
        walker.group.position.set(s.x, s.y - drop, s.z);
        walker.group.rotation.y = s.yaw;
      }
    } else {
      animateWalker(dt, now, time, moving && active && !state.riding && powers.altitude <= 0.05, {
        gun: weapon === 'fists' ? null : weapon, kneeling, handsUp, armed: armed && now < aimUntil + 600 && !swimming && !glide,
        swim: swimming ? 0.25 + swimPace * 0.75 : 0, sky: glide ? glide.phase : null, look: aimTurn,
      });
      if (cupOn && now >= punchUntil) {
        setArm(walker, 1, sip > 0.02 ? arm(handPose, -1.05 - 0.45 * sip, 0.1, 0, -1.25 - 0.9 * sip, 0, 0, HAND.CUP) : HOLD_CUP);
        walker.sync();
      }
    }
    for (const cuff of cuffs) cuff.visible = kneeling;
    for (const [id, gun] of guns) gun.group.visible = id === weapon && !kneeling && !handsUp && !swimming && !glide && !seat && !ride;
    const onBike = state.riding && !playerCar;
    rider.group.visible = onBike;
    seatHolder.visible = (!!playerCar && state.riding) || ride?.pose === 'pillion';
    if (ride?.pose === 'pillion') {
      // Pillion on someone else's motorbike (a xe ôm): the hips just above its saddle.
      if (seatedKind !== 'pillion') { seatOn(seated, 'pillion'); seatedKind = 'pillion'; }
      const s = ride.seat();
      seatHolder.position.set(s.x, s.y + FIGURE.seatClear * PERSON_SCALE, s.z);
      seatHolder.rotation.set(0, s.yaw, 0, 'YXZ');
      blink(seated, time);
      holdSeat(seated, 0, 0, false);
    }
    // Two wheels bank into the corner by the angle that balances it (tan = speed x turn rate / g);
    // the rider hangs a little further inside. A positive roll tips the top towards a right turn.
    const twoWheelsNow = state.riding && (!playerCar || playerCar.kind === 'moto');
    const balance = twoWheelsNow ? THREE.MathUtils.clamp(Math.atan(velocity * yawRate / 9.81), -0.5, 0.5) * (!playerCar && bikeId === 'horse' ? 0.3 : 1) : 0;
    lean = THREE.MathUtils.damp(lean, balance, 7, dt);
    const drawing = armed && now < aimUntil;
    /** How far the aim is turned from a vehicle's heading: the chest turns that way (the head the rest), the other fist stays on its grip. */
    const aimTwist = (yaw: number) => Math.atan2(Math.sin(aimYaw - yaw), Math.cos(aimYaw - yaw));
    if (playerCar && state.riding) {
      const moto = playerCar.kind === 'moto';
      // The seated figure's hip joint lands on the vehicle's seat point: the saddle, or the left-hand driver's
      // seat (a car driver is drawn smaller so the head clears the roof). Vehicle models stand 0.04 m into the ground.
      const kind: SeatKind = moto ? vehicleStyle(playerCar) as MotoStyle : 'car';
      if (seatedKind !== kind) { seatOn(seated, kind); seatedKind = kind; }
      const hip = moto ? MOTO_HIP : seatOf(playerCar);
      const lx = hip[0], ly = hip[1] - 0.04, lz = hip[2];
      const c = Math.cos(playerCar.yaw), s = Math.sin(playerCar.yaw);
      seatHolder.position.set(playerCar.x + lx * c + lz * s, groundHeight(playerCar.x, playerCar.z) + ly, playerCar.z - lx * s + lz * c);
      seatHolder.rotation.set(0, playerCar.yaw, moto ? lean : 0, 'YXZ');
      const turn = drawing ? aimTwist(playerCar.yaw) : 0, chest = THREE.MathUtils.clamp(turn, -1.2, 1.2);
      blink(seated, time);
      holdSeat(seated, moto ? lean * 0.25 : 0, chest, drawing, turn - chest);
    }
    passenger.group.visible = passengerAboard && onBike && bikeId !== 'horse';
    showPack(rider, !passenger.group.visible);
    const bikeBroken = bikeHealth <= 0;
    if (onBike) {
      // The rider hangs a little into the corner; drawing a gun, the chest turns to the aim and the right hand lets go.
      const turn = drawing ? aimTwist(state.angle) : 0, chest = THREE.MathUtils.clamp(turn, -1.2, 1.2);
      blink(rider, time);
      blink(passenger, time, 2);
      holdSeat(rider, lean * 0.25, chest, drawing, turn - chest);
      if (passenger.group.visible) holdSeat(passenger, lean * 0.2, 0, false);
    }
    bike.group.position.set(bikeX, groundHeight(bikeX, bikeZ) + (bikeBroken && !onBike ? 0.18 : -0.04), bikeZ);
    bike.group.rotation.set(0, bikeAngle, bikeBroken && !onBike ? 1.35 : lean, 'YXZ');
    if (onBike) for (const wheel of bike.wheels) wheel.rotation.x += velocity * dt / bike.wheelRadius;
    if (bike.legs.length) {
      const pace = onBike ? Math.abs(velocity) : 0;
      gallop += pace * dt * 1.6;
      const amount = Math.min(1, pace / 4) * 0.65;
      bike.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(gallop + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * amount; });
    }
    if (playerBody) ragdolls.center(playerBody, scratch);
    else scratch.set(state.x, 0, state.z);
    youLabel.position.set(scratch.x, glide ? glide.y + 2.3 : swimming ? WATER_LEVEL + 1.2 : boat ? WATER_LEVEL + 2.4 : inCar() ? 3.1 : state.riding ? 2.6 : 2.3 + powers.altitude, scratch.z);
    youLabel.visible = street && !menu;

    // Mission marker, shopkeeper and receiver.
    pin.position.y = 2.7 + Math.sin(time * 2.5) * 0.2;
    pin.rotation.y = time * 0.35;
    missionRing.ring.scale.setScalar(1 + Math.sin(time * 2.5) * 0.045);
    for (const [ring, phase] of [[storeRing, 1.5], [bikeShopRing, 3], [hospitalRing, 4.5]] as const) ring.ring.scale.setScalar(1 + Math.sin(time * 2.5 + phase) * 0.045);
    venueDoors.forEach((door, i) => {
      door.ring.ring.scale.setScalar(1 + Math.sin(time * 2.5 + i) * 0.045);
      // A nightlife door's ring and sign only while it is open.
      door.ring.group.visible = !zombieMode && isOpen(VENUE_HOURS[door.kind], atmosphere.hours);
    });
    for (const label of placeLabels) {
      const d = camera.position.distanceTo(label.getWorldPosition(scratchLabel));
      const fadeTo = THREE.MathUtils.clamp((45 - d) / 20, 0, 1);
      (label.material as THREE.SpriteMaterial).opacity = fadeTo;
      label.visible = fadeTo > 0.02;
    }
    activityRings.forEach((ring, i) => ring.ring.scale.setScalar(1 + Math.sin(time * 2.5 + i * 0.7) * 0.045));
    const mission = missions.view();
    const coffeePickup = mission.id === 'coffee' && mission.status === 'active' && mission.step === 0;
    shopkeeperCup.visible = coffeePickup;
    if (distance(SHOPKEEPER) < 60) {
      // Standing about with the coffee ready, holding it out when the rider comes for it.
      poseStanding(shopkeeper, time, 1);
      if (coffeePickup) setArm(shopkeeper, 1, distance(PICKUP) < 14 ? arm(handPose, -1.25 + Math.sin(time * 3) * 0.06, 0.05, 0, -0.45, 0, -0.1, HAND.CUP) : HOLD_CUP);
      shopkeeper.sync();
    }
    const deliveryTarget = ['coffee', 'market', 'post'].includes(mission.id) && mission.step > 0 ? mission.target : null;
    const spot = now < receiverHappyUntil ? receiverSpot : deliveryTarget;
    receiver.group.visible = spot !== null && !zombieMode;
    if (spot) {
      const rx = spot.x + 1.2, rz = spot.z + 1.2;
      receiver.group.position.set(rx, groundHeight(rx, rz) - 0.02, rz);
      receiver.group.rotation.y = Math.atan2(state.x - rx, state.z - rz);
      const happy = now < receiverHappyUntil;
      receiverCup.visible = happy && mission.id === 'coffee';
      const near = distance(spot) < 18;
      // Waving the rider over, then lifting the coffee and bouncing on the toes.
      poseStanding(receiver, time, 2);
      if (happy) setArm(receiver, 1, arm(handPose, -1.05, 0.1, 0, -1.2, 0, 0, HAND.CUP));
      else if (near) setArm(receiver, 1, arm(handPose, ARM_POSES.WAVE[0], ARM_POSES.WAVE[1], 0, -0.5 + 0.35 * Math.sin(time * 9), ARM_POSES.WAVE[4], 0, HAND.OPEN));
      if (near || happy) receiver.head.rotation.set(-0.05, 0, 0);
      receiver.sync();
      receiver.group.position.y += happy ? Math.abs(Math.sin(time * 7)) * 0.08 : 0;
    }

    effects.beginBlobs();
    if (walker.group.visible) effects.blob(state.x, groundHeight(state.x, state.z) + 0.02, state.z, 0.9 * Math.max(0.5, 1 - jumpY * 0.35));
    if (!playerCar || bikeX !== state.x) effects.blob(bikeX, groundHeight(bikeX, bikeZ) + 0.02, bikeZ, bikeId === 'horse' ? 1.2 : 0.9, bikeId === 'horse' ? 2.6 : 2.1, bikeAngle);
    for (const person of [shopkeeper.group, receiver.group]) if (person.visible) effects.blob(person.position.x, person.position.y + 0.04, person.position.z, 0.9);
    for (const car of vehicles.live) {
      // A recycled wreck is a fresh vehicle again.
      if (wrecks.has(car) && car.health > 0) wrecks.delete(car);
      if (car.mode === 'off') continue;
      const moto = car.kind === 'moto';
      effects.blob(car.x, groundHeight(car.x, car.z) + 0.02, car.z, moto ? 0.9 : 2.6, moto ? 2.1 : 5.2, car.yaw);
      // Every vehicle is a moving box to the bodies on the street: they are pushed out of it (or onto the bonnet).
      // A motorbike that lost its rider is left out (the rider's body starts inside its box).
      if (moto && !car.driver && car.mode !== 'player') continue;
      const [hw, hl] = vehicles.halfSize(car.kind);
      ragdolls.sweep(car.x, car.z, car.yaw, hw, hl, moto ? 1.1 : 1.45, Math.sin(car.yaw) * car.speed, Math.cos(car.yaw) * car.speed);
    }
    buses.forEachShadow((x, z, w, l, yaw) => effects.blob(x, groundHeight(x, z) + 0.02, z, w, l, yaw));
    buses.forEachBody((x, z, yaw, hw, hl, h, bvx, bvz) => ragdolls.sweep(x, z, yaw, hw, hl, h, bvx, bvz));
    // The player's own bike (cars the player drives are in the list above).
    if (state.riding && !playerCar && !boat) {
      const horse = bikeId === 'horse';
      ragdolls.sweep(state.x, state.z, state.angle, horse ? 0.45 : 0.4, horse ? 1.2 : 1, horse ? 1.6 : 1.1, Math.sin(state.angle) * velocity, Math.cos(state.angle) * velocity);
    }
    updatePeers(now, time, dt);
    // Only people near the camera get a blob: far off it is too small to see, and the crowd would use them all up.
    const eyeX = camera.position.x, eyeZ = camera.position.z;
    npcs.forEachStanding((x, z, npc) => { if ((x - eyeX) ** 2 + (z - eyeZ) ** 2 < 5600) effects.blob(x, npc.y + 0.02, z, 0.85); });
    police.forEachUnit((x, z, onFoot) => { if (onFoot) effects.blob(x, groundHeight(x, z) + 0.02, z, 0.85); });
    animals.forEachShadow((x, z, size) => effects.blob(x, groundHeight(x, z) + 0.02, z, size, size * 1.6));
    // Bodies on the street last (when the blobs run out, standing people keep theirs): along the body, smaller in the air.
    ragdolls.forEachShadow((x, z, width, length, yaw, height) => {
      const ground = groundHeight(x, z), lift = THREE.MathUtils.clamp(1 - (height - ground - 0.3) / 2.5, 0.35, 1);
      effects.blob(x, ground + 0.025, z, width * lift, length * lift, yaw);
    });
    effects.endBlobs();
    ragdolls.update(dt, cameraTarget.x, cameraTarget.z);

    // Smoke from damaged vehicles, and bleeding stumps.
    if (now > smokeAt) {
      smokeAt = now + 140;
      const bikeFraction = bikeHealth / bikeById(bikeId).health;
      if (bikeFraction < 0.35 && bikeId !== 'horse') effects.smoke(bikeX, 0.9, bikeZ, now, bikeFraction <= 0);
      for (const car of vehicles.live) {
        if (car.mode === 'off') continue;
        const fraction = car.health / carMax(car);
        if (fraction < 0.35) effects.smoke(car.x + Math.sin(car.yaw) * (car.kind === 'moto' ? 0.5 : 1.8), 1.2, car.z + Math.cos(car.yaw) * (car.kind === 'moto' ? 0.5 : 1.8), now, fraction <= 0);
      }
    }
    if (now > stumpAt) {
      stumpAt = now + 90;
      ragdolls.forEachStump(now, (x, y, z, dx, dy, dz) => effects.blood(hitPoint.set(x, y, z), rayDir.set(dx, dy, dz).normalize(), 2));
    }

    const cameraBlend = 1 - Math.exp(-dt * 4.5);
    const follow = playerBody ? scratch : null;
    desiredTarget.set(street ? (follow ? follow.x : state.x) : -3, glide && street ? glide.y + 1.2 : 1 + powers.altitude * 0.8, street ? (follow ? follow.z : state.z) : -5);
    cameraTarget.lerp(desiredTarget, cameraBlend);
    const viewBlend = 1 - Math.exp(-dt * 14);
    // The camera closes in on an arrest.
    if (down === 'busted') view.dist = Math.min(view.dist, 14);
    smoothView.yaw += (view.yaw - smoothView.yaw) * viewBlend;
    smoothView.pitch += (view.pitch - smoothView.pitch) * viewBlend;
    // Sitting down the camera comes in closer.
    smoothView.dist += ((seat ? Math.min(view.dist, 12) : view.dist) - smoothView.dist) * viewBlend;
    const counterShot = !interior && street && menu?.anchor ? menu.anchor : null;
    const fp = firstPerson();
    if (interior) {
      const shot = interiors.view(interior, productFocus);
      const glide = 1 - Math.exp(-dt * 4);
      camera.position.lerp(shot.eye, glide);
      interiorLook.lerp(shot.look, glide);
    } else if (counterShot) {
      // The counter shot: in front of the shop, a little to the right, at eye height, so the panel on the right
      // leaves the shopfront and the player at the counter in view.
      const a = counterShot, fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
      const g = groundHeight(a.x, a.z), blend = 1 - Math.exp(-dt * 4);
      camDesired.set(a.x + fx * 7.6 + rx * 3.2, g + 3.6, a.z + fz * 7.6 + rz * 3.2);
      camera.position.lerp(camDesired, blend);
      interiorLook.lerp(scratch.set(a.x + fx * 1.2 + rx * 2.4, g + 1.0, a.z + fz * 1.2 + rz * 2.4), blend);
    } else if (fp) {
      const pose = eyePose();
      camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
      firstLookAt.set(pose.eye.x + pose.direction.x * 20, pose.eye.y + pose.direction.y * 20, pose.eye.z + pose.direction.z * 20);
    } else if (street) {
      camDesired.copy(cameraTarget).add(offsetFor(smoothView.yaw, smoothView.pitch, smoothView.dist, cameraOffset));
      camera.position.lerp(camDesired, 1 - Math.exp(-dt * 10));
    } else {
      camDesired.copy(cameraTarget).add(offsetFor(CAMERA_DEFAULT.yaw, CAMERA_DEFAULT.pitch, 60, cameraOffset));
      camDesired.x += Math.sin(time * 0.05) * 5;
      camDesired.y += 13;
      camDesired.z += 12;
      camera.position.lerp(camDesired, cameraBlend);
    }
    camera.lookAt(interior || counterShot ? interiorLook : fp ? firstLookAt : cameraTarget);
    if (!counterShot && !interior) interiorLook.copy(cameraTarget);
    const sway = !interior && now < drunkUntil ? Math.min(1, (drunkUntil - now) / 20000) : 0;
    if (sway > 0) camera.rotateZ(Math.sin(now / 900) * 0.06 * sway);
    const fov = interior ? 52 : fp ? 76 + Math.min(4, Math.abs(velocity) / 8) : 42 + (state.riding ? Math.min(1, Math.abs(velocity) / 26) * 10 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-dt * 12);
    }
    camera.updateMatrixWorld();
    // Buildings between the camera and the player open up around them.
    world.focus(camera, desiredTarget.x, glide ? glide.y + 1.1 : groundHeight(desiredTarget.x, desiredTarget.z) + 1.1, desiredTarget.z, dt, street && !interior && !fp);

    // Floating health bars over anyone hurt recently, and speech bubbles.
    effects.beginBars(camera);
    npcs.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    if (zombieMode) zombies.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    police.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    for (const peer of peers.values()) {
      const peerHealth = Math.max(0, (peer.target.health ?? MAX_HEALTH) - peer.predicted);
      if (!peer.target.down && (peerHealth < MAX_HEALTH || time - peer.hurtAt < 4)) effects.bar(peer.group.position.x, 2.25 + peer.group.position.y, peer.group.position.z, peerHealth / MAX_HEALTH);
    }
    effects.endBars();
    bubbles.update(now, cameraTarget.x, cameraTarget.z);
    effects.update(now, dt);
    powerEffects.update(now);
    if (fp) {
      const hidden: THREE.Object3D[] = [walker.group, rider.group, seatHolder, helm.group, youLabel, canopy];
      if (state.riding && !playerCar) hidden.push(bike.group);
      if (boat) hidden.push(boat.group);
      if (buses.firstPersonOccluder) hidden.push(buses.firstPersonOccluder);
      for (const object of hidden) { restoredVisibility.push({ object, visible: object.visible }); object.visible = false; }
    }
    canvas.style.cursor = interior ? (productHover ? 'pointer' : '') : !active ? '' : rotating ? 'grabbing' : fp || armed ? 'none' : '';
    if (!covered && compiled) {
      world.update(time);
      sky.update(camera, time, atmosphere.sunDirection, atmosphere.tint, atmosphere.cover, 1 - atmosphere.night);
      // An instanced batch with nothing in it this frame (no rider, no wreck, no prop out) would still cost a draw call.
      if (++emptyScan >= 60) { emptyScan = 0; instanced.length = 0; scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) instanced.push(o as THREE.InstancedMesh); }); }
      for (const m of instanced) if (m.count === 0 && m.visible) { m.visible = false; emptied.push(m); }
      renderer.render(scene, camera);
      for (const m of emptied) m.visible = true;
      emptied.length = 0;
    }
    if (now - hudTime >= 120) {
      hudTime = now;
      emitHud(now);
    }
    frame = requestAnimationFrame(update);
  }
  setMissionLabel();
  emitHud(performance.now());
  // Every program is compiled and drawn once now, before the first frame (into one pixel of the canvas, so the
  // programs are the canvas' own variants): the four figure kinds included (the umbrellas' 'rigid' one would
  // otherwise first compile when it starts to rain, mid-game), things not shown yet (the rain, empty crowds) and
  // things out of view. The driver (ANGLE on Windows) finishes a shader at its first draw, so compiling alone would
  // still stall. Zombie mode's flashlight changes every lit program: those variants compile in the background
  // (parallel where the driver can) while the menu is up, and are drawn once when they are ready.
  let warmed = 0;
  function drawEverything(flashlight: boolean) {
    const shown: THREE.Object3D[] = [], filled: THREE.InstancedMesh[] = [], culled: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible && o !== torch) { o.visible = true; shown.push(o); }
      if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
      const mesh = o as THREE.InstancedMesh;
      if (mesh.isInstancedMesh && mesh.count === 0) { mesh.count = 1; filled.push(mesh); }
    });
    torch.visible = flashlight;
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, 1, 1);
    renderer.setViewport(0, 0, 1, 1);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    torch.visible = zombieMode;
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    for (const mesh of filled) mesh.count = 0;
  }
  function prewarm() {
    const round = ++warmed;
    drawEverything(false);
    // The flashlight variants: start their compiles now without waiting, draw them once they are done.
    const shown: THREE.Object3D[] = [];
    scene.traverse((o) => { if (!o.visible && o !== torch) { o.visible = true; shown.push(o); } });
    torch.visible = true;
    const ready = renderer.compileAsync(scene, camera);
    torch.visible = zombieMode;
    for (const o of shown) o.visible = false;
    ready.then(() => { if (round === warmed && !active) drawEverything(true); }).catch(() => undefined);
  }
  prewarm();
  frame = requestAnimationFrame(update);

  function rebuildBike(id: BikeId) {
    bike.group.remove(rider.group);
    bike.group.remove(passenger.group);
    scene.remove(bike.group);
    disposeTree(bike.group);
    bikeId = id;
    bike = makeBike(id, bikeById(id).color);
    if (id === 'horse') seatOn(rider, 'horse', HORSE_HIP, BIKE_SCALE);
    else {
      seatOn(rider, id, MOTO_HIP, BIKE_SCALE);
      // The pillion sits a little higher on a sport bike's step saddle.
      seatOn(passenger, 'pillion', id === 'sport' ? [PILLION_HIP[0], PILLION_HIP[1] + 0.04, PILLION_HIP[2] + 0.04] : PILLION_HIP, BIKE_SCALE);
    }
    bike.group.add(rider.group, passenger.group);
    scene.add(bike.group);
    bikeHealth = bikeById(id).health;
  }

  // Local development only: a handle for automated checks and screenshots (teleport, camera, clock, stats).
  if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    (window as unknown as Record<string, unknown>).__pvo = {
      /** The world (world.ts): districts() build progress, buildAllDistricts(), districtColliders. */
      world,
      tp: (x: number, z: number, angle = 0) => { Object.assign(state, { x, z, angle, riding: false }); bodyY = groundHeight(x, z); cameraTarget.set(x, 1, z); },
      ride: (x: number, z: number, angle: number) => { parkedWith = null; bikeX = x; bikeZ = z; bikeAngle = angle; Object.assign(state, { x, z, angle, riding: true }); velocity = 0; cameraTarget.set(x, 1, z); },
      view: (yaw: number, pitch: number, dist: number) => { Object.assign(view, { yaw, pitch, dist }); manualCameraAt = performance.now() + 1e9; },
      /** The nearest point of the walking network (tools: a screenshot spot on a sidewalk). */
      snap: (x: number, z: number) => { const s = nav.snap(x, z); return { x: s.x, z: s.z }; },
      hours: (h: number) => atmosphere.setHours(h),
      // A clock jump as after a fade: parked vehicles and the crowd are put where the new hour has them.
      jump: (h: number) => { atmosphere.setHours(h); clockJumped(); },
      weather: (w: Weather) => atmosphere.setWeather(w),
      cash: (c: number) => { cash = c; },
      weapon: (id: WeaponId) => { owned.add(id); ammo.set(id, { mag: 30, reserve: 90 }); equip(id); },
      stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, fps: monitor.fps }),
      info: () => ({ x: state.x, z: state.z, riding: state.riding, swimming, boat: !!boat, glide: glide ? { ...glide } : null, down, wanted: police.wanted, cash, hint: notification }),
      scene, camera, renderer, npcs, vehicles, police, ragdolls, zombies, buses, boats,
      /** The player's body height and water state, and the live terrain (map/terrain.ts: decks, banks, docks, land). */
      body: () => ({ x: state.x, y: bodyY, z: state.z, swimming, boat: !!boat, ground: groundHeight(state.x, state.z, bodyY) }),
      terrain: () => TERRAIN,
      /** How a look is dressed (wardrobe bits and colours), to find people in a given outfit. */
      style: (look: FigureLook) => styleOf(look),
      people: { walker, rider, passenger, seated, helm, shopkeeper, receiver },
      /** Other players to draw (as the room would send them), and a bike to ride, for checking peers and bikes. */
      peers: (list: PeerState[]) => setPeers(list, performance.now()),
      bike: (id: BikeId) => rebuildBike(id),
      /** The interaction registry: what E would do now, use it, the open counter menu, buy from it, savings. */
      registry,
      focus: () => (focus ? { id: focus.entry.id, kind: focus.entry.kind, score: Math.round(focus.score), view: focus.view } : null),
      use: () => { refreshCtx(performance.now()); focus = registry.best(ctx); return actOnFocus(performance.now()); },
      place: (id: string) => PLACES.find((p) => p.id === id) ?? null,
      places: (key: string) => PLACES.filter((p) => p.key === key || p.kind === key).map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, yaw: p.yaw })),
      menu: () => menu?.view ?? null,
      choose: (itemId: string) => (menu ? chooseItem(menu.id, itemId) : null),
      bank: (n: number) => { bank = n; },
      sitting: () => (seat ? { x: seat.x, z: seat.z, top: seat.top, kind: seat.kind, eatery: seat.eatery?.name ?? null } : null),
      passenger: (p: PassengerProvider | null) => (p ? boardPassenger(p) : leavePassenger()),
      /** Running and taking input even if the page has not said so (a hot-reloaded game instance in development). */
      activate: () => { active = true; started = true; previousTime = performance.now(); },
      /** Opens a shop or venue the way walking into its door does. */
      enter: (kind: InteriorKind) => onEvent(kind === 'gun' ? { type: 'store' } : kind === 'bike' ? { type: 'bikeshop' } : kind === 'hospital' ? { type: 'hospital' } : { type: 'venue', kind }),
      /** Poses to check: hands up to the police, an arrest (kneeling in cuffs), a pillion passenger. */
      act: (what: 'surrender' | 'busted' | 'passenger' | 'car' | 'boat' | 'deck' | 'fall' | 'chute') => {
        const now = performance.now();
        if (what === 'surrender') { police.crime(1, now / 1000); surrendered = true; }
        else if (what === 'busted') busted(now);
        else if (what === 'passenger') testPassenger = !testPassenger;
        else if (what === 'car') {
          // The nearest car (not a motorbike) still on the street.
          let car: Car | null = null;
          for (const c of vehicles.live) if (c.kind !== 'moto' && c.mode !== 'off' && c.mode !== 'player' && (!car || Math.hypot(c.x - state.x, c.z - state.z) < Math.hypot(car.x - state.x, car.z - state.z))) car = c;
          if (car) enterCar(car, now);
          return car?.kind ?? null;
        }
        else if (what === 'boat') { boats.launch(state.x, state.z, state.angle); boardBoat(); }
        else if (what === 'deck') { cash = Math.max(cash, 1000); enterDeck(); }
        else if (what === 'fall') jumpFromDeck(now);
        else openChute(now);
        return null;
      },
    };
  }
  return {
    /** Opens (or closes, with null) a shop interior: the camera cuts inside and the player stands at the door. */
    setInterior(kind: InteriorKind | null) {
      exitLookLock();
      if (kind === interior) return;
      interior = kind;
      productFocus = productHover = null;
      interiors.setHovered(null);
      interiors.show(kind);
      dip();
      if (kind) {
        interiors.setInfo({ owned: [...owned], bike: bikeId });
        const shot = interiors.view(kind, null);
        camera.position.copy(shot.eye);
        interiorLook.copy(shot.look);
      } else camera.position.copy(cameraTarget).add(offsetFor(smoothView.yaw, smoothView.pitch, smoothView.dist, cameraOffset));
    },
    /**
     * Pays for a service in a nightlife venue: the screen dips to black and the effect applies (health,
     * a tipsy spell, points, time passing, the police losing track). Returns an error message, or null.
     */
    useService(venue: VenueRoom, id: string): string | null {
      const def = serviceOf(venue, id);
      if (!def) return 'Dịch vụ không tồn tại.';
      if (cash < def.price) return `Không đủ tiền: cần ${formatThousands(def.price)}.`;
      cash -= def.price;
      const now = performance.now();
      const parts = applyEffect(def.effect, effectHost);
      dip();
      notify(`${def.name} · ${VENUE_SERVICES[venue].title.toLowerCase()} xong${parts.length ? ` · ${parts.join(', ')}` : ''}`, 3500);
      emitHud(now);
      return null;
    },
    /** Buys an item from the open counter menu (or haggles: itemId '__haggle'); returns what happened and the menu now. */
    choose(menuId: string, itemId: string) {
      const result = chooseItem(menuId, itemId);
      emitHud(performance.now());
      return result;
    },
    /** The counter panel was closed (Esc, the close button). */
    closeMenu() { closeMenu(); },
    /** Seats the player as a passenger of a bus, waterbus, xe ôm or xích lô (see PassengerProvider). */
    boardPassenger,
    leavePassenger,
    /** The interaction registry, for systems that add their own entries (registry.add / remove / addProvider). */
    registry,
    /** Points the shop camera at one product (an item hovered in the shop panel), or back at the shop. */
    focusProduct(id: string | null) {
      productFocus = id;
      interiors.setHovered(id ?? productHover);
    },
    setActive(value: boolean) { active = value; previousTime = performance.now(); clearKeys(); rotating = null; touches.clear(); if (!value) { exitLookLock(); powers.stopFlight(); shieldFlight = null; if (!state.riding) velocity = 0; } },
    /** A game is running (true from the start of a session until it is left), whatever overlay is open. */
    setStarted(value: boolean) { started = value; },
    /** An opaque overlay covers the whole street (the big map): skips drawing until it closes. */
    setCovered(value: boolean) { covered = value; },
    getState(): PlayerState {
      return {
        ...state, health: Math.ceil(health), weapon, vehicle: vehicleKind(), down: down === 'wasted',
        firing: performance.now() < firingUntil, wanted: police.wanted,
        hero: powers.hero, altitude: powers.altitude, flying: powers.flying, powerSeq: lastPower.seq, powerKind: lastPower.kind, powerX: lastPower.x, powerY: lastPower.y, powerZ: lastPower.z,
      };
    },
    /** Hits this player dealt since the last sync, at most eight. */
    takeHits() { return pendingHits.splice(0, 8); },
    receiveHits(hits: IncomingHit[]) {
      const now = performance.now();
      for (const hit of hits) {
        if (!Number.isFinite(hit.damage) || down === 'wasted') continue;
        damagePlayer(hit.damage, now, { x: state.x - hit.dx, z: state.z - hit.dz }, hit.name);
        if (health > 0) notify(`${hit.name} tấn công bạn (−${Math.round(hit.damage)})`, 1800);
      }
    },
    setPeers,
    action,
    setInput,
    selectHero,
    usePower: castPower,
    toggleFlight,
    toggleCameraMode,
    selectMission(id: MissionId) {
      missions.select(id, id === 'coffee' ? receivers[Math.floor(Math.random() * receivers.length)] : undefined);
      receiverHappyUntil = 0;
      receiverSpot = null;
      setMissionLabel();
      notify(missions.view().objective, 4500);
      emitHud(performance.now());
    },
    equip(id: WeaponId) { equip(id); emitHud(performance.now()); },
    cycleWeapon() { cycleWeapon(); emitHud(performance.now()); },
    buyWeapon(id: WeaponId): string | null {
      const def = weaponById(id);
      if (owned.has(id)) { equip(id); emitHud(performance.now()); return null; }
      if (!deliveries) return 'Hoàn thành ít nhất 1 nhiệm vụ giao hàng để mở khóa Tiệm súng.';
      if (cash < def.price) return 'Chưa đủ tiền. Giao thêm cà phê hoặc làm nhiệm vụ để kiếm tiền nhé.';
      cash -= def.price;
      giveWeapon(id);
      equip(id);
      notify(`Đã mua ${def.name}! Click chuột hoặc F để bắn, R để nạp đạn.`, 4000);
      emitHud(performance.now());
      return null;
    },
    buyAmmo(id: WeaponId): string | null {
      const def = weaponById(id);
      const rounds = ammo.get(id);
      if (!rounds || !def.magazine) return 'Bạn chưa có súng này.';
      if (cash < def.ammoPrice) return 'Chưa đủ tiền mua đạn.';
      cash -= def.ammoPrice;
      rounds.reserve += def.ammoPack;
      emitHud(performance.now());
      return null;
    },
    ammoOf(id: WeaponId) { const rounds = ammo.get(id); return rounds ? { ...rounds } : null; },
    /** Pays the hospital to patch the player up. */
    heal(): string | null {
      const cost = Math.ceil((MAX_HEALTH - health) * 1.2);
      if (cost <= 0) return 'Bạn đang khỏe re.';
      if (cash < cost) return 'Chưa đủ tiền viện phí.';
      cash -= cost;
      health = MAX_HEALTH;
      notify('Bác sĩ đã băng bó, máu đầy lại rồi!', 3000);
      emitHud(performance.now());
      return null;
    },
    /** Buys a new bike; it is delivered in front of the shop and replaces the old one. */
    buyBike(id: BikeId): string | null {
      const def = bikeById(id);
      if (cash < def.price) return 'Chưa đủ tiền. Giao thêm cà phê hoặc làm nhiệm vụ để kiếm tiền nhé.';
      if (state.riding && !playerCar) return 'Hãy xuống xe trước khi mua xe mới.';
      cash -= def.price;
      rebuildBike(id);
      parkedWith = null;
      bikeX = BIKE_SHOP.x + 2.5;
      bikeZ = BIKE_SHOP.z + 0.6;
      bikeAngle = Math.PI / 2;
      notify(`Đã mua ${def.name}! Xe đang đậu trước cửa hàng.`, 4000);
      emitHud(performance.now());
      return null;
    },
    repairBike(): string | null {
      const cost = repairCost(bikeId, bikeHealth);
      if (!cost) return 'Xe của bạn vẫn còn tốt.';
      if (cash < cost) return 'Chưa đủ tiền sửa xe.';
      if (Math.hypot(bikeX - BIKE_SHOP.x, bikeZ - BIKE_SHOP.z) > 25) return 'Hãy dắt hoặc chạy xe tới gần cửa hàng để sửa.';
      cash -= cost;
      bikeHealth = bikeById(bikeId).health;
      notify('Xe đã được sửa như mới!', 3000);
      emitHud(performance.now());
      return null;
    },
    setQuality(mode: QualityMode) {
      qualityMode = mode;
      if (mode !== 'auto') applyLevel(MODE_LEVEL[mode]);
      // A preset with other shadows changes every lit program: draw them again before play, not at the first wave.
      if (!active) prewarm();
      else { levelFailures.clear(); levelBlockedUntil.clear(); }
      emitHud(performance.now());
    },
    reset(mode: GameMode = 'city') {
      powers.reset(); shieldFlight = null; powerEffects.clear(); lastPower.kind = 'none'; exitLookLock(); cameraMode.reset(Math.PI / 2);
      if (playerCar) { playerCar.mode = 'parked'; playerCar = null; }
      if (seat?.claim != null) nx.releaseSeat?.(seat.claim);
      seat = null; ride = null; hold = null; focus = null; menu = null; parkedWith = null; playerLastCar = null;
      vx.resetPlayer?.();
      incenseDay.clear(); sangNight.clear();
      bank = 0; litter = 0; scrap = 0; cupUntil = 0; drawnDay = -1;
      buffs.clear(); tickets.length = 0; carried.length = 0; hotCars.clear(); refusedUntil.clear();
      registry.reset();
      if (PLAYER_LOOK.shirt !== SHIRTS[0]) restyleShirt(SHIRTS[0]);
      boat = null;
      boats.dock();
      swimming = false;
      glide = null;
      heist = null;
      bankReadyAt = 0;
      Object.assign(state, { x: START.x, z: START.z, angle: Math.PI / 2, riding: false, speed: 0, score: 0 });
      bodyY = groundHeight(START.x, START.z);
      if (bikeId !== 'scooter') rebuildBike('scooter');
      bikeX = BIKE_START.x;
      bikeZ = BIKE_START.z;
      bikeAngle = Math.PI / 2;
      bikeHealth = bikeById(bikeId).health;
      velocity = 0;
      missions.reset();
      receiverHappyUntil = 0;
      receiverSpot = null;
      notificationUntil = 0;
      bannerUntil = 0;
      cash = 0;
      deliveries = 0;
      health = MAX_HEALTH;
      owned.clear();
      owned.add('fists');
      ammo.clear();
      equip('fists');
      police.reset();
      sideMissions.cancel();
      pickups.clear();
      if (playerBody) ragdolls.remove(playerBody);
      playerBody = null;
      down = null;
      pendingHits.length = 0;
      surrendered = false;
      gasClouds.length = 0;
      Object.assign(view, CAMERA_DEFAULT);
      missionLabelKey = '';
      setMissionLabel();
      setMode(mode);
      clearKeys();
      emitHud(performance.now());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      exitLookLock();
      document.removeEventListener('pointerlockchange', onLookLockChanged);
      document.removeEventListener('pointerlockerror', onLookLockError);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      setRain(0);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      reticle.remove();
      fade.remove();
      interiors.dispose();
      zombies.dispose();
      scene.remove(torch, torch.target);
      torch.dispose();
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      world.dispose();
      npcs.dispose();
      police.dispose();
      buses.dispose();
      vehicles.dispose();
      ragdolls.dispose();
      effects.dispose();
      powerEffects.dispose();
      explosives.dispose();
      pickups.dispose();
      bubbles.dispose();
      animals.dispose();
      sideMissions.dispose();
      atmosphere.dispose();
      sky.dispose();
      disposeTree(scene);
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      peers.clear();
    },
  };
}

export { BIKES, GANGS };
