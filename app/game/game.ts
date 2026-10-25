import * as THREE from 'three';
import { buildWorld, dockAt, groundHeight } from './world';
import { LANDMARKS, PLOTS, ROADS_X, ROADS_Z, SCENERY, VENUES, WATER_LEVEL, inRect, type Dock } from './city';
import { SWIM_DEPTH, TERRAIN, bankNear, bounds, deep as deepWater, inBounds, inWater, navigable, pierNear, walkable, waterLevel } from './map/terrain';
import { createBoats, makeBoatMesh, type Boat } from './boats';
import { createNav } from './nav';
import { createCollisionIndex, OWNER } from './map/collision';
import { createRagdolls, type BodyPart, type RagdollBody, type RagdollLook } from './ragdoll';
import { createNpcs, GANGS, type Npc } from './npcs';
import { createEffects, makeGun } from './effects';
import { createExplosives, type Explosion } from './explosives';
import { createPickups } from './pickups';
import { createBubbles } from './bubbles';
import { createAtmosphere, type Weather } from './atmosphere';
import { createAnimals } from './animals';
import { createSideMissions, type SideMissionView } from './side-missions';
import { playBoom, playCrash, playHorn, playShot, playThud, setRain, unlockAudio } from './audio';
import { STOP_LINE, lightFor, nearest } from './signals';
import { WEAPONS, weaponById, type WeaponId } from './weapons';
import { createMissions, type MissionEvent, type MissionId, type MissionView } from './missions';
import { createPeerInterpolator, createSnapshotClock } from './peer-interpolation';
import type { PlayerState, PeerState, OutgoingHit, IncomingHit } from '../../lib/multiplayer-protocol';
import { BIKES, CAR_STATS, MOTO_STATS, POLICE_CAR_STATS, bikeById, repairCost, type BikeId } from './bikes';
import { createVehicles, makeCarMesh, seatOf, vehicleStyle, CAR_HEALTH, MASS, MOTO_HEALTH, POLICE_CAR_HEALTH, type Body, type Car, type Crash } from './vehicles';
import { FLOORBOARD, MOTO_RIDER, motoParts, vehicleMaterial, type MotoStyle } from './vehicle-models';
import { createPolice } from './police';
import { createZombies, type Zombie } from './zombies';
import { createInteriors, type InteriorKind } from './interiors';
import { VENUE_SERVICES, serviceOf, type VenueRoom } from './venues';
import { createSky, HORIZON } from './sky';
import { MODE_LEVEL, QUALITY_LEVELS, createFrameMonitor, detectStartLevel, gpuName, isSoftwareGpu, type QualityMode } from './quality';

export type VehicleKind = 'foot' | 'scooter' | 'car' | 'police' | 'boat' | 'swim';
export type { PlayerState, PeerState, OutgoingHit, IncomingHit } from '../../lib/multiplayer-protocol';
export type Hud = {
  speed: number; riding: boolean; score: number; mission: string; missionStep: number; missionInfo: MissionView; hint: string; x: number; z: number;
  cash: number; deliveries: number; weapon: WeaponId; owned: WeaponId[]; down: boolean; fps: number; quality: string; qualityMode: QualityMode;
  gpu: string; softwareGpu: boolean;
  health: number; wanted: number; banner: string; vehicle: VehicleKind; vehicleHealth: number;
  bike: BikeId; bikeHealth: number; bikeBroken: boolean; bikeX: number; bikeZ: number;
  targetX: number; targetZ: number; targetName: string; police: { x: number; z: number }[];
  clock: string; ammo: { mag: number; reserve: number; reloading: boolean } | null; side: SideMissionView; offers: { x: number; z: number }[];
  gangs: { name: string; anger: number; x: number; z: number }[]; hospital: { x: number; z: number }; policeStation: { x: number; z: number };
  healCost: number; respawnIn: number; arsenal: { id: WeaponId; mag: number; reserve: number }[]; stunned: boolean; flatTires: boolean;
  surrendered: boolean; gassed: boolean;
  /** Seconds until the police arrive after a crime was reported (0 when they are here or not coming). */
  policeIn: number;
  /** Zombie mode: wave, zombies left in it, kills, seconds of rest left, best wave reached. */
  zombie: { wave: number; left: number; kills: number; breakLeft: number; best: number; dots: { x: number; z: number }[] } | null;
};
/** The normal living city, or the zombie apocalypse. */
export type GameMode = 'city' | 'zombie';
export type GameEvent = { type: 'store' } | { type: 'bikeshop' } | { type: 'hospital' } | { type: 'bag'; open: boolean } | { type: 'product'; id: string } | { type: 'venue'; kind: VenueRoom };

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
// Model units were ~2.6 m tall; these bring people and bikes to real-world size next to the houses and cars.
const PERSON_SCALE = 0.68;
const BIKE_SCALE = 0.62;
const CAMERA_DEFAULT = { yaw: Math.atan2(31, 39), pitch: Math.atan2(36, Math.hypot(31, 39)), dist: 42 };
const PLAYER_LOOK: RagdollLook = { shirt: '#e77641', pants: '#293e4a', skin: '#dca878', helmet: '#fff4dc' };
const RAGDOLL_SCALE = 0.68;
const MAX_HEALTH = 100;
const CRASH_SPEED = 12.5;
// Wait after an arrest or being downed before the player is back on the street.
const RESPAWN_MS = 5000;
// Rider height on a horse's saddle, in bike units (the default seat is 0.42).
const HORSE_SEAT = 1.3;

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

function makePerson(color = '#e77641', riding = false, hair?: string) {
  // Every moving part is one merged, vertex-coloured mesh (body, two legs, two arms, and a glossy helmet
  // for the rider), so a person costs five or six draw calls however much detail it carries.
  type Piece = { g: THREE.BufferGeometry; c: THREE.ColorRepresentation; at?: [number, number, number]; s?: number | [number, number, number]; r?: [number, number, number]; smooth?: boolean };
  const tint = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
  const merge = (pieces: Piece[]) => {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [];
    for (const p of pieces) {
      const g = p.g.index ? p.g.toNonIndexed() : p.g;
      if (g !== p.g) p.g.dispose();
      if (!p.smooth) { g.deleteAttribute('normal'); g.computeVertexNormals(); }
      const s = p.s ?? 1;
      e.set(...(p.r ?? [0, 0, 0]));
      g.applyMatrix4(m4.compose(v.set(...(p.at ?? [0, 0, 0])), q.setFromEuler(e), typeof s === 'number' ? sv.setScalar(s) : sv.set(...s)));
      tint.set(p.c);
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
  };
  const ball = (r: number, w = 10, h = 7, theta = Math.PI) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, theta);
  const tube = (top: number, bottom: number, height: number, seg = 10) => new THREE.CylinderGeometry(top, bottom, height, seg);
  const block = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const lathe = (profile: number[], seg = 12) => new THREE.LatheGeometry(profile.reduce<THREE.Vector2[]>((out, _, i) => (i % 2 ? out : [...out, new THREE.Vector2(profile[i], profile[i + 1])]), []), seg, Math.PI / seg);
  const shade = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
  const SKIN = '#dca878', TROUSERS = '#293e4a', SHOE = '#f6ead2', HAIR = hair ?? '#2a2220';
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.03 });

  // Head features in head units (radius 1, centred at HEAD), mapped onto the body.
  const R = 0.38, HEAD = [0, 2.2, 0.02] as const, HIP = 1.04;
  const h = (x: number, y: number, z: number): [number, number, number] => [HEAD[0] + x * R, HEAD[1] + y * R - HIP, HEAD[2] + z * R];
  const hs = (s: number | [number, number, number]): [number, number, number] => (typeof s === 'number' ? [s * R, s * R, s * R] : [s[0] * R, s[1] * R, s[2] * R]);
  const y = (value: number) => value - HIP;
  const pieces: Piece[] = [
    // Trousers, belt and a tapered shirt with a chest pocket and collar.
    { g: lathe([0, 0.92, 0.33, 0.92, 0.37, 0.98, 0.375, 1.12, 0.36, 1.2, 0, 1.2]), c: TROUSERS, at: [0, y(0), 0], s: [1, 1, 0.64] },
    { g: tube(0.374, 0.374, 0.075, 12), c: '#4a3828', at: [0, y(1.15), 0], s: [1, 1, 0.65] },
    { g: block(0.1, 0.07, 0.03), c: '#d9b44a', at: [0, y(1.15), 0.245] },
    { g: lathe([0, 1.17, 0.385, 1.17, 0.375, 1.3, 0.385, 1.46, 0.43, 1.64, 0.435, 1.76, 0.35, 1.86, 0.17, 1.93, 0, 1.93]), c: color, at: [0, y(0), 0], s: [1, 1, 0.62] },
    { g: block(0.13, 0.13, 0.02), c: shade(color, 0.86), at: [0.18, y(1.53), 0.252], r: [-0.12, 0, 0] },
    { g: tube(0.17, 0.2, 0.07, 10), c: shade(color, 0.85), at: [0, y(1.92), 0], s: [1, 1, 0.85] },
    { g: tube(0.12, 0.13, 0.2, 10), c: SKIN, at: [0, y(2.0), 0] },
    // Head: egg-shaped skull, ears, eyes, brows, nose and mouth.
    { g: ball(1, 14, 11), c: SKIN, at: h(0, 0, 0), s: hs([1, 1.06, 0.98]), smooth: true },
    { g: ball(0.2, 6, 5), c: shade(SKIN, 0.92), at: h(-0.97, -0.04, 0.02), s: hs([0.6, 1, 0.75]) },
    { g: ball(0.2, 6, 5), c: shade(SKIN, 0.92), at: h(0.97, -0.04, 0.02), s: hs([0.6, 1, 0.75]) },
    { g: ball(0.13, 8, 6), c: '#2a201b', at: h(-0.36, 0.03, 0.885), s: hs([0.95, 1.3, 0.5]) },
    { g: ball(0.13, 8, 6), c: '#2a201b', at: h(0.36, 0.03, 0.885), s: hs([0.95, 1.3, 0.5]) },
    { g: block(0.32, 0.075, 0.09), c: hair ?? '#3a2a22', at: h(-0.37, 0.33, 0.855), s: hs(1), r: [-0.25, 0, 0.1] },
    { g: block(0.32, 0.075, 0.09), c: hair ?? '#3a2a22', at: h(0.37, 0.33, 0.855), s: hs(1), r: [-0.25, 0, -0.1] },
    { g: ball(0.13, 6, 4), c: shade(SKIN, 0.97), at: h(0, -0.14, 0.95), s: hs([1, 0.85, 0.85]) },
    { g: block(0.24, 0.05, 0.06), c: '#9b5a48', at: h(0, -0.43, 0.875), s: hs(1), r: [0.35, 0, 0] },
  ];
  if (hair) {
    // Short hair: a chunky dome tilted back off the forehead, sideburns and a swept fringe.
    pieces.push(
      { g: ball(1.07, 14, 6, Math.PI * 0.56), c: HAIR, at: h(0, 0, 0), s: hs([1, 1.07, 0.99]), r: [-0.5, 0, 0] },
      { g: block(0.14, 0.4, 0.3), c: HAIR, at: h(-0.93, -0.06, 0.22), s: hs(1), r: [0, -0.35, 0] },
      { g: block(0.14, 0.4, 0.3), c: HAIR, at: h(0.93, -0.06, 0.22), s: hs(1), r: [0, 0.35, 0] },
      { g: ball(0.5, 8, 5), c: HAIR, at: h(0.22, 0.6, 0.66), s: hs([1.4, 0.5, 0.75]), r: [-0.55, 0, -0.3] },
    );
  }
  // The delivery rider's insulated box hangs from the straps' top (its pivot) so it can bounce.
  const PACK_TOP = 1.9;
  const packPieces: Piece[] = hair ? [] : [
    { g: block(0.6, 0.66, 0.34), c: '#365e52', at: [0, 1.52 - PACK_TOP, -0.43] },
    { g: block(0.64, 0.08, 0.38), c: '#4c7a6b', at: [0, 1.88 - PACK_TOP, -0.43] },
    { g: block(0.42, 0.13, 0.02), c: '#e7b04a', at: [0, 1.56 - PACK_TOP, -0.605] },
  ];
  if (!hair) {
    pieces.push(
      { g: block(0.06, 0.4, 0.035), c: '#2b4a40', at: [-0.22, y(1.68), 0.262], r: [0.1, 0, 0] },
      { g: block(0.06, 0.4, 0.035), c: '#2b4a40', at: [0.22, y(1.68), 0.262], r: [0.1, 0, 0] },
      { g: block(0.06, 0.035, 0.5), c: '#2b4a40', at: [-0.22, y(1.89), -0.02] },
      { g: block(0.06, 0.035, 0.5), c: '#2b4a40', at: [0.22, y(1.89), -0.02] },
    );
  }
  // The body pivots at the hip so a rider can lean forward; the head and helmet lean with it.
  const body = new THREE.Mesh(merge(pieces), cloth);
  body.position.y = HIP;
  const group = new THREE.Group();
  group.add(body);
  const pack = new THREE.Group();
  pack.position.set(0, PACK_TOP - HIP, 0);
  if (packPieces.length) { pack.add(new THREE.Mesh(merge(packPieces), cloth)); body.add(pack); }
  if (!hair) {
    // Motorbike half helmet with a peak and a stripe in the shirt colour.
    const helmet = merge([
      { g: ball(1.15, 14, 7, Math.PI * 0.52), c: '#fff4dc', at: h(0, 0.06, -0.02), s: hs([1, 1, 1.02]), r: [-0.3, 0, 0] },
      { g: ball(1.17, 14, 7, Math.PI * 0.5), c: color, at: h(0, 0.06, -0.02), s: hs([0.2, 1, 1.03]), r: [-0.3, 0, 0] },
      { g: new THREE.CylinderGeometry(0.85, 0.85, 0.07, 10, 1, false, -Math.PI / 2, Math.PI), c: '#e9dfc6', at: h(0, 0.36, 0.86), s: hs([1, 1, 0.6]), r: [0.15, 0, 0] },
    ]);
    body.add(new THREE.Mesh(helmet, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 })));
  }
  // Legs: the thigh pivots at the hip and the shin (with the sneaker) at the knee, so strides can fold.
  const KNEE = 0.46, ELBOW = 0.36;
  const thigh = () => new THREE.Mesh(merge([
    { g: ball(0.175, 10, 7), c: TROUSERS, at: [0, -0.03, 0] },
    { g: tube(0.175, 0.152, 0.48), c: TROUSERS, at: [0, -0.24, 0] },
  ]), cloth);
  const shin = () => new THREE.Mesh(merge([
    { g: ball(0.152, 9, 6), c: TROUSERS, at: [0, 0, 0] },
    { g: tube(0.152, 0.128, 0.4), c: TROUSERS, at: [0, -0.64 + KNEE, 0] },
    { g: tube(0.14, 0.14, 0.06), c: shade(TROUSERS, 0.8), at: [0, -0.82 + KNEE, 0] },
    { g: block(0.24, 0.15, 0.4), c: SHOE, at: [0, -0.905 + KNEE, 0.07] },
    { g: ball(0.12, 8, 5), c: SHOE, at: [0, -0.915 + KNEE, 0.25], s: [1, 0.62, 1.05] },
    { g: block(0.26, 0.05, 0.47), c: '#c8b593', at: [0, -0.985 + KNEE, 0.085] },
    { g: block(0.13, 0.025, 0.16), c: color, at: [0, -0.826 + KNEE, 0.12], r: [-0.25, 0, 0] },
  ]), cloth);
  const limbLeft = new THREE.Group();
  const limbRight = new THREE.Group();
  const kneeLeft = new THREE.Group();
  const kneeRight = new THREE.Group();
  limbLeft.position.set(-0.26, 1.04, 0);
  limbRight.position.set(0.26, 1.04, 0);
  for (const [hip, knee] of [[limbLeft, kneeLeft], [limbRight, kneeRight]] as const) {
    knee.position.y = -KNEE;
    knee.add(shin());
    hip.add(thigh(), knee);
  }
  group.add(limbLeft, limbRight);
  // Arms pivot at the shoulder (short sleeve) and the elbow (forearm, hand and thumb). They hang from the
  // torso, so they stay on the shoulders when it leans or twists.
  const upperArm = () => new THREE.Mesh(merge([
    { g: ball(0.15, 10, 7), c: color, at: [0, -0.02, 0] },
    { g: tube(0.15, 0.13, 0.36), c: color, at: [0, -0.18, 0] },
    { g: tube(0.142, 0.142, 0.06), c: shade(color, 0.85), at: [0, -0.35, 0] },
  ]), cloth);
  const forearm = (inward: number) => new THREE.Mesh(merge([
    { g: ball(0.1, 8, 6), c: SKIN, at: [0, 0, 0] },
    { g: tube(0.105, 0.088, 0.3, 9), c: SKIN, at: [0, -0.5 + ELBOW, 0] },
    { g: ball(0.12, 9, 7), c: SKIN, at: [0, -0.725 + ELBOW, 0.01], s: [0.88, 1.08, 0.95] },
    { g: ball(0.05, 6, 4), c: SKIN, at: [inward * 0.08, -0.68 + ELBOW, 0.07] },
  ]), cloth);
  const armLeft = new THREE.Group();
  const armRight = new THREE.Group();
  const elbowLeft = new THREE.Group();
  const elbowRight = new THREE.Group();
  armLeft.position.set(-0.57, 1.76 - HIP, 0.04);
  armRight.position.set(0.57, 1.76 - HIP, 0.04);
  for (const [shoulder, elbow, inward] of [[armLeft, elbowLeft, 1], [armRight, elbowRight, -1]] as const) {
    elbow.position.y = -ELBOW;
    elbow.add(forearm(inward));
    shoulder.add(upperArm(), elbow);
  }
  body.add(armLeft, armRight);
  if (riding) {
    limbLeft.rotation.x = -0.65;
    limbRight.rotation.x = -0.65;
    armLeft.rotation.x = -1.15;
    armRight.rotation.x = -1.15;
    body.rotation.x = 0.2;
    // Rider sits inside the bike group, which is already scaled to BIKE_SCALE, hip on the saddle point.
    group.scale.setScalar(PERSON_SCALE / BIKE_SCALE);
    group.position.set(0, (MOTO_RIDER.hip[1] - HIP * PERSON_SCALE) / BIKE_SCALE, MOTO_RIDER.hip[2] / BIKE_SCALE);
  } else group.scale.setScalar(PERSON_SCALE);
  return { group, body, pack, limbLeft, limbRight, kneeLeft, kneeRight, armLeft, armRight, elbowLeft, elbowRight };
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
    if (riderColor) { const person = makePerson(riderColor, true); person.group.position.y = HORSE_SEAT; group.add(person.group); }
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
  if (riderColor) seatOn(makePerson(riderColor, true), style);
  group.scale.setScalar(BIKE_SCALE);
  group.traverse((o) => { o.castShadow = false; });
  return { group, wheels, legs: [] as THREE.Group[], wheelRadius: hubs.r };

  function seatOn(person: ReturnType<typeof makePerson>, bikeStyle: MotoStyle) {
    footing(person, bikeStyle);
    group.add(person.group);
  }
}

/** Legs of a seated rider: feet forward on a scooter's floorboard, or down on the pegs of a manual bike. */
function footing(person: ReturnType<typeof makePerson>, style: MotoStyle) {
  // Thighs forward along the saddle, shins down to the floorboard or back to the pegs.
  const [thigh, knee] = FLOORBOARD[style] ? [-1.3, 1.2] : [-0.95, 1.35];
  person.limbLeft.rotation.x = person.limbRight.rotation.x = thigh;
  person.kneeLeft.rotation.x = person.kneeRight.rotation.x = knee;
  person.elbowLeft.rotation.x = person.elbowRight.rotation.x = -0.3;
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
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
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
  const roofs = createCollisionIndex();
  for (const p of PLOTS) roofs.add(p.full.minX, p.full.minZ, p.full.maxX, p.full.maxZ, 0, p.h, OWNER.roof, p);
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
  const ragdolls = createRagdolls(scene, world.colliders, groundHeight);
  const effects = createEffects(scene, groundHeight);
  const explosives = createExplosives(scene, groundHeight);
  const pickups = createPickups(scene, groundHeight);
  const sayAt = (key: string, text: string, at: () => { x: number; y: number; z: number } | null, shout = false) => bubbles.say(key, text, performance.now(), at, shout ? 2600 : 3400, shout ? 'shout' : 'say');
  const npcs = createNpcs(scene, ragdolls, { clear: worldClear, sight: lineOfSight }, {
    onRest: (x, z) => effects.pool(x, z),
    say: (npc, text, shout) => sayAt(`npc${npc.id}`, text, () => (npc.state === 'inside' || npc.state === 'down' || npc.state === 'away' ? null : { x: npc.x, y: npc.y + (npc.pose === 'sit' ? 1.6 : 1.95), z: npc.z }), shout),
  });
  const vehicles = createVehicles(scene, worldClear);
  const boats = createBoats(scene);
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
    person: (shirt, hair) => makePerson(shirt, false, hair).group,
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
  scene.add(walker.group);
  let bikeId: BikeId = 'scooter';
  let bike = makeBike(bikeId, bikeById(bikeId).color);
  const rider = makePerson('#ed763e', true);
  footing(rider, 'scooter');
  rider.group.visible = false;
  bike.group.add(rider.group);
  scene.add(bike.group);
  // A passenger rides pillion for taxi missions.
  const passenger = makePerson('#6f86a8', true, '#2a2220');
  passenger.group.position.set(0, 0.36, -1.0);
  passenger.armLeft.rotation.x = -0.3;
  passenger.armRight.rotation.x = -0.3;
  passenger.group.visible = false;
  bike.group.add(passenger.group);
  const youLabel = makeLabel('BẠN', '#fff4da', '#245442');
  youLabel.scale.set(2.4, 0.6, 1);
  scene.add(youLabel);
  const guns = new Map<WeaponId, { group: THREE.Group; muzzle: THREE.Object3D }>();
  const riderGuns = new Map<WeaponId, THREE.Group>();
  for (const id of ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const) {
    const gun = makeGun(id);
    gun.group.rotation.x = Math.PI / 2;
    gun.group.position.set(0, -0.74 + 0.36, 0.06);
    gun.group.visible = false;
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.1, gun.length);
    gun.group.add(muzzle);
    walker.elbowRight.add(gun.group);
    guns.set(id, { group: gun.group, muzzle });
    const riderGun = makeGun(id).group;
    riderGun.rotation.x = Math.PI / 2;
    riderGun.position.set(0, -0.74 + 0.36, 0.06);
    riderGun.visible = false;
    rider.elbowRight.add(riderGun);
    riderGuns.set(id, riderGun);
  }
  walker.group.traverse((o) => { o.castShadow = false; });
  // The player at the wheel of the hire boat, sitting in its driver's seat.
  const helm = makePerson('#e77641');
  helm.limbLeft.rotation.x = helm.limbRight.rotation.x = -1.4;
  helm.kneeLeft.rotation.x = helm.kneeRight.rotation.x = 1.35;
  helm.armLeft.rotation.x = helm.armRight.rotation.x = -1.0;
  helm.elbowLeft.rotation.x = helm.elbowRight.rotation.x = -0.5;
  helm.group.position.set(boats.rental.seat[0], 0.66 - 1.04 * PERSON_SCALE, boats.rental.seat[2]);
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
  const seatHolder = new THREE.Group();
  seatHolder.scale.setScalar(BIKE_SCALE);
  const seated = makePerson('#e77641', true);
  seatHolder.add(seated.group);
  seatHolder.visible = false;
  seatHolder.traverse((o) => { o.castShadow = false; });
  scene.add(seatHolder);
  const seatedGuns = new Map<WeaponId, THREE.Group>();
  for (const id of ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const) {
    const gun = makeGun(id).group;
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, -0.74 + 0.36, 0.06);
    gun.visible = false;
    seated.elbowRight.add(gun);
    seatedGuns.set(id, gun);
  }
  // Handcuffs on the wrists during an arrest.
  const cuffMaterial = new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.8, roughness: 0.3 });
  const cuffs = [walker.elbowLeft, walker.elbowRight].map((arm) => {
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 12), cuffMaterial);
    cuff.position.set(0, -0.62 + 0.36, 0);
    cuff.rotation.x = Math.PI / 2;
    cuff.visible = false;
    arm.add(cuff);
    return cuff;
  });

  // Shopkeeper hands over the coffee; a receiver waits at each delivery address.
  const shopkeeper = makePerson('#c96f6f', false, '#2a2220');
  shopkeeper.group.position.set(SHOPKEEPER.x, groundHeight(SHOPKEEPER.x, SHOPKEEPER.z), SHOPKEEPER.z);
  shopkeeper.group.rotation.y = SHOPKEEPER.yaw;
  scene.add(shopkeeper.group);
  const receiver = makePerson('#6f86a8', false, '#3a2a22');
  const receiverCup = cylinder(receiver.armRight, 0.17, 0.13, 0.32, [0, -0.86, 0.12], material('#fff2d0'), 10);
  receiverCup.visible = false;
  receiver.group.visible = false;
  scene.add(receiver.group);
  const shopkeeperCup = cylinder(shopkeeper.armRight, 0.17, 0.13, 0.32, [0, -0.86, 0.12], material('#fff2d0'), 10);
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
  const placeRing = (color: string, emissive: string, text: string, bg: string, at: { x: number; z: number }) => {
    const ring = makeRing(color, emissive, 2);
    const label = makeLabel(text, bg);
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
  // The nightlife strip's doors: walk in with E.
  const venueDoors = VENUES.filter((v) => v.kind !== 'beer').map((v) => {
    const f = v.building.facing;
    const at = { x: v.door.x + Math.sin(f) * 1.6, z: v.door.z + Math.cos(f) * 1.6 };
    return { kind: v.kind as VenueRoom, name: v.name, at, ring: placeRing(v.neon, v.neon, `${v.name} · 18+`, '#1a0b16', at) };
  });
  // Downtown and the river: speedboats for hire at two docks, the observation deck and the bank.
  const activityRings = [
    ...SCENERY.docks.filter((d) => d.rental).map((d) => placeRing('#2f86c6', '#1d4f7a', 'THUÊ CA NÔ', '#1d4f7a', d.ring)),
    placeRing('#7d5ba6', '#4a2f6b', 'ĐÀI QUAN SÁT · NHẢY DÙ', '#4a2f6b', LANDMARKS.tower.door),
    placeRing('#2f7a3a', '#1d4a24', 'NGÂN HÀNG PHƯƠNG NAM', '#1d4a24', LANDMARKS.bank.door),
  ];
  for (const ring of activityRings) ring.group.position.y = groundHeight(ring.group.position.x, ring.group.position.z);
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
  let sideView: SideMissionView = null;
  const looseBodies: { body: RagdollBody; until: number }[] = [];
  const wrecks = new Set<Car>();
  const pendingBlasts: { car: Car; at: number }[] = [];
  const pendingHits: OutgoingHit[] = [];
  const keys = new Set<string>();
  const cameraTarget = new THREE.Vector3(state.x, 0.7, state.z);
  const desiredTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const view = { ...CAMERA_DEFAULT };
  const smoothView = { ...CAMERA_DEFAULT };
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
  const crossing: { x: number; z: number }[] = [];

  function offsetFor(yaw: number, pitch: number, dist: number, out: THREE.Vector3) {
    return out.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
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
    // Shadows only while the sun is up, and only on presets that can afford them.
    const preset = QUALITY_LEVELS[level];
    const want = preset.shadows && atmosphere.night < 0.6;
    if (sun.castShadow !== want || (want && sun.shadow.mapSize.x !== preset.shadowSize)) {
      sun.castShadow = want;
      if (want) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      }
      renderer.shadowMap.needsUpdate = true;
    }
    shadowsAllowed = want;
  }
  function applyLevel(next: number) {
    level = THREE.MathUtils.clamp(next, 0, QUALITY_LEVELS.length - 1);
    const preset = QUALITY_LEVELS[level];
    applyShadows();
    renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, preset.maxDpr) * preset.scale));
  }
  applyLevel(level);
  renderer.shadowMap.needsUpdate = true;

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
    const crashes = vehicles.collideBody(body, playerCar, time);
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
    const body = ragdolls.spawn({
      x: car.x, y: groundHeight(car.x, car.z) + 0.9, z: car.z, yaw: car.yaw, scale: RAGDOLL_SCALE, look,
      velocity: { x: car.vx + e.nx * away * strength * 0.5, y: 2.5 + strength * 0.25, z: car.vz + e.nz * away * strength * 0.5 },
    });
    looseBodies.push({ body, until: time + 16 });
    if (strength > 9) effects.blood(hitPoint.set(car.x, 1, car.z), rayDir.set(e.nx * away, 0, e.nz * away), 6);
  }

  // ---- Red lights: a cruiser nearby will not let it go. ----
  let lightGap = Infinity, lightJunction = '';
  function checkRedLight(time: number) {
    if (!state.riding || Math.abs(velocity) < 4) { lightGap = Infinity; return; }
    const alongX = Math.abs(Math.sin(state.angle)) > Math.abs(Math.cos(state.angle));
    const dir = Math.sign((alongX ? Math.sin(state.angle) : Math.cos(state.angle)) * velocity) || 1;
    const along = alongX ? state.x : state.z, cross = alongX ? state.z : state.x;
    const road = nearest(alongX ? ROADS_Z : ROADS_X, cross);
    if (Math.abs(cross - road) > 7) { lightGap = Infinity; return; }
    const junction = nearest(alongX ? ROADS_X : ROADS_Z, along + dir * 20);
    const gap = (junction - along) * dir - STOP_LINE;
    const key = `${junction}:${road}:${alongX}`;
    if (key === lightJunction && lightGap > 0 && gap <= 0 && gap > -4) {
      const light = alongX ? lightFor(junction, road, 'x', time) : lightFor(road, junction, 'z', time);
      if (light === 'red') {
        let seen = false;
        police.forEachUnit((x, z) => { if (Math.hypot(x - state.x, z - state.z) < 55) seen = true; });
        if (seen) { police.crime(1, time); notify('Vượt đèn đỏ ngay trước mặt cảnh sát!', 2500); }
      }
    }
    lightJunction = key;
    lightGap = gap;
  }

  /** Open water a swimmer can be in: inside the buoys and beside (not under) the piers; the steps lead out. */
  function swimClear(x: number, z: number) {
    if (!inWater(x, z, 0.35)) { const d = dockAt(x, z); return !!d && inRect(d.steps, x, z); }
    return !pierNear(x, z, 0.35);
  }
  /** Where the player on foot can go: the land (clear of everything), the docks, or off a dock into the river. */
  function footClear(x: number, z: number) {
    if (swimming) return swimClear(x, z) && !boats.hit(x, z, 0.35);
    if (clearAt(x, z, 0.4) || dockAt(x, z)) return true;
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
    return { x: state.x, z: state.z, riding: missions.view().requiresBike ? isMotorbike() : state.riding, down: down !== null };
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
    effects.blood(hitPoint.set(state.x, inCar() ? 1.3 : 1.1, state.z), rayDir.set(dx / d, 0, dz / d), inCar() ? 2 : 5);
    if (health <= 0) wasted(now, by);
  }

  function carMax(car: Car) { return car.kind === 'police' ? POLICE_CAR_HEALTH : car.kind === 'moto' ? MOTO_HEALTH : CAR_HEALTH; }
  function damageCar(car: Car, amount: number, now: number) {
    if (wrecks.has(car)) return;
    car.health = Math.max(0, car.health - amount);
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

  /** Throws the player to the ground as a ragdoll; they get up after a moment. */
  function knockPlayer(vx: number, vy: number, vz: number, now: number, reason: Down = 'crash') {
    leaveVehicleNow();
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = ragdolls.spawn({ x: state.x, y: groundHeight(state.x, state.z) + 0.1, z: state.z, yaw: state.angle, scale: RAGDOLL_SCALE, look: PLAYER_LOOK, velocity: { x: vx, y: vy, z: vz } });
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
    const spot = reachable(at);
    Object.assign(state, { x: spot.x, z: spot.z, riding: false, speed: 0 });
    boat = null;
    glide = null;
    swimming = false;
    bodyY = groundHeight(spot.x, spot.z);
    cameraTarget.set(spot.x, 1, spot.z);
  }

  function respawn(now: number) {
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
    if (down === 'wasted' || down === 'busted') return;
    interruptRace('Bạn đã bị bắt. Nhấn M để thử lại vòng đua.');
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

  function nearestCar(maxDistance: number) {
    let best: Car | null = null, bestDistance = maxDistance;
    for (const car of vehicles.cars) {
      if (car.mode === 'off' || car.mode === 'player' || car.mode === 'chase' || car.mode === 'leave') continue;
      const d = Math.hypot(car.x - state.x, car.z - state.z) - (car.kind === 'moto' ? 1 : 0);
      if (d < bestDistance) { best = car; bestDistance = d; }
    }
    return best;
  }

  function enterCar(car: Car, now: number) {
    const time = now / 1000;
    if (car.mode === 'lane' && car.driver) {
      // Carjacking: the driver is dragged out of the left side.
      const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
      const side = car.kind === 'moto' ? 0.8 : 1.4;
      const body = ragdolls.spawn({ x: car.x - rx * side, y: groundHeight(car.x, car.z) + 0.3, z: car.z - rz * side, yaw: car.yaw, scale: 0.7, look: car.driver, velocity: { x: -rx * 4.5, y: 2.5, z: -rz * 4.5 } });
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
    const offsets = [new THREE.Vector3(-sideways, 0, 0), new THREE.Vector3(sideways, 0, 0), new THREE.Vector3(0, 0, -lengthwise), new THREE.Vector3(0, 0, lengthwise)];
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
      x: state.x, z: state.z, inVehicle: state.riding, down: down === 'wasted' || down === 'busted', time,
      spend: (amount: number) => { if (cash < amount) return false; cash -= amount; return true; },
      spawnThief: (x: number, z: number) => { thief = npcs.spawnThief(x, z, state.x, state.z); return !!thief; },
      thiefDown: () => (!thief ? null : thief.state === 'down' || thief.state === 'away' ? true : thief.state === 'inside' ? null : false),
      gangKnocks,
      gangTurf: (gang: number) => ({ x: npcs.gangs[gang].x, z: npcs.gangs[gang].z }),
    };
  }

  function action() {
    if (!active || down) return;
    const now = performance.now();
    const time = now / 1000;
    if (glide) { if (glide.phase === 'deck') leaveDeck(); return; }
    if (boat) { leaveBoat(now); return; }
    if (!state.riding && boats.rental.mode === 'player' && (swimming || dockAt(state.x, state.z)) && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) < 4.2) { boardBoat(); return; }
    if (!state.riding && !swimming) {
      const dock = SCENERY.docks.find((d) => d.rental && distance(d.ring) < 3);
      if (dock) { hireBoat(dock); return; }
      if (distance(LANDMARKS.tower.door) < 3.2) { enterDeck(); return; }
      if (distance(LANDMARKS.bank.door) < 3.2 && !heist) { startHeist(now); return; }
    }
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
    if (!state.riding && distance(STORE) < 3.5) { onEvent({ type: 'store' }); return; }
    if (!state.riding && distance(BIKE_SHOP) < 3.5) { onEvent({ type: 'bikeshop' }); return; }
    if (!state.riding && distance(LANDMARKS.hospital) < 3.5) { onEvent({ type: 'hospital' }); return; }
    const venue = !state.riding ? venueDoors.find((door) => distance(door.at) < 2.6) : undefined;
    if (venue) {
      if (zombieMode) notify(`${venue.name} đã đóng cửa từ khi dịch bùng phát.`, 2500);
      else onEvent({ type: 'venue', kind: venue.kind });
      return;
    }
    if (state.riding) { exitVehicle(); return; }
    const car = nearestCar(3.4);
    const bikeDistance = Math.hypot(state.x - bikeX, state.z - bikeZ);
    if (car && (bikeDistance > 2.6 || Math.hypot(car.x - state.x, car.z - state.z) < bikeDistance)) {
      if (car.health <= 0) { notify('Xe này đã hỏng, không chạy được.'); return; }
      enterCar(car, now);
      return;
    }
    if (bikeDistance < 2.6) {
      if (bikeHealth <= 0) { notify(bikeId === 'horse' ? 'Ngựa đã kiệt sức. Chữa ở Cửa hàng xe máy.' : 'Xe máy đã hỏng. Mua xe mới hoặc sửa ở Cửa hàng xe máy.', 3500); return; }
      state.riding = true;
      state.x = bikeX;
      state.z = bikeZ;
      state.angle = bikeAngle;
      velocity = 0;
    }
  }

  function spaceAction() {
    const now = performance.now();
    if (!active) return;
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
  /** Out of the water: onto a pier alongside, or up a climbable bank (the promenade wall). */
  function climbOut() {
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
    if (hit && hit.d < hit.bank.reach) {
      const b = hit.bank, x = hit.x - b.nx * b.land, z = hit.z - b.nz * b.land;
      if (clearAt(x, z, 0.4)) {
        state.x = x;
        state.z = z;
        swimming = false;
        bodyY = groundHeight(state.x, state.z);
        jumpV = 2.4;
        return;
      }
    }
    notify(bankNear(state.x, state.z, 2.5)?.bank.kind === 'far' ? 'Bờ bên kia có hàng rào, không lên được. Bơi về phía phố.' : 'Bơi sát bờ kè hoặc cầu tàu rồi nhấn Space để leo lên.', 2500);
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
    bodyY = Math.max(groundHeight(state.x, state.z), waterLevel(state.x, state.z) + 0.4);
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
  const DECK_PRICE = 50;
  /** The jump-off point at the front edge of the supertall's central tube. */
  function deckSpot() {
    const t = LANDMARKS.tower, f = PLOTS[t.id].full;
    const tube = (Math.min(f.maxX - f.minX, f.maxZ - f.minZ) - 2) / 3;
    const fx = Math.round(Math.sin(t.facing)), fz = Math.round(Math.cos(t.facing));
    return { x: (f.minX + f.maxX) / 2 + fx * (tube / 2 - 1), z: (f.minZ + f.maxZ) / 2 + fz * (tube / 2 - 1), y: PLOTS[t.id].h + 0.2, yaw: t.facing };
  }
  function enterDeck() {
    if (cash < DECK_PRICE) { notify(`Vé lên đài quan sát: ${formatThousands(DECK_PRICE)}.`, 2500); return; }
    cash -= DECK_PRICE;
    dip();
    const spot = deckSpot();
    glide = { phase: 'deck', y: spot.y, vy: 0, speed: 0, since: performance.now() };
    Object.assign(state, { x: spot.x, z: spot.z, angle: spot.yaw });
    velocity = 0;
    Object.assign(view, { yaw: spot.yaw + Math.PI + 0.7, pitch: 0.38, dist: 16 });
    manualCameraAt = performance.now();
    notify('Đài quan sát THÁP PHƯƠNG NAM · WASD đi dạo · Space nhảy dù · E đi thang máy xuống', 7000);
  }
  function leaveDeck() {
    dip();
    glide = null;
    const door = LANDMARKS.tower.door;
    Object.assign(state, { x: door.x, z: door.z, angle: LANDMARKS.tower.facing });
    bodyY = groundHeight(door.x, door.z);
  }
  /** Walking about the top of the central tube (round the spire), camera-relative like on the street. */
  function deckWalk(dt: number, vertical: number, horizontal: number) {
    const t = LANDMARKS.tower, f = PLOTS[t.id].full;
    const tube = (Math.min(f.maxX - f.minX, f.maxZ - f.minZ) - 2) / 3, cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
    const fx = -Math.sin(smoothView.yaw), fz = -Math.cos(smoothView.yaw);
    const dx = fx * vertical - fz * horizontal, dz = fz * vertical + fx * horizontal;
    const moving = dx !== 0 || dz !== 0;
    velocity = moving ? 2.4 : 0;
    if (!moving) return false;
    state.angle = angleLerp(state.angle, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
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
    if (!airBlocked(nx, state.z, g.y)) state.x = nx; else g.speed *= 0.5;
    if (!airBlocked(state.x, nz, g.y)) state.z = nz; else g.speed *= 0.5;
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
    bodyY = groundHeight(state.x, state.z);
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
      bodyY = Math.max(bodyY, groundHeight(x, z));
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
      if (normalized === 'f') { triggerQueued = true; unlockAudio(); }
      if (normalized === 'q') cycleWeapon();
      if (normalized === 'r') startReload(performance.now());
      if (normalized === 'v') Object.assign(view, CAMERA_DEFAULT);
      if (normalized === 'tab') setBag(true);
      // H puts the hands up for the police (or lowers them again).
      if (normalized === 'h') {
        if (surrendered) { surrendered = false; notify('Bạn hạ tay xuống.', 1500); }
        else if (police.wanted > 0 && !state.riding && !down) { surrendered = true; notify('Bạn giơ tay đầu hàng. Cảnh sát sẽ tới còng tay.', 3000); }
        else if (!police.wanted) notify('Không có ai đang truy bắt bạn.', 1500);
      }
      // Space jumps on foot (vaults the river railing, climbs out of the water, jumps off the deck, opens the
      // parachute); on a vehicle it stays the brake.
      if ((normalized === ' ' || normalized === 'space') && !down && performance.now() > stunUntil) spaceAction();
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
    view.yaw -= dx * 0.0058;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * 0.004, 0.16, 1.4);
    manualCameraAt = performance.now();
  }
  function zoomBy(factor: number) {
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
        const peerBike = makeBike('scooter', color, color);
        const label = makeLabel(peer.name.slice(0, 20), '#23493f');
        label.position.y = 2.9;
        label.scale.set(4, 1, 1);
        const peerGuns = new Map<WeaponId, THREE.Group>();
        for (const id of ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'] as const) {
          const gun = makeGun(id).group;
          gun.rotation.x = Math.PI / 2;
          gun.position.set(0, -0.74 + 0.36, 0.06);
          gun.visible = false;
          foot.elbowRight.add(gun);
          peerGuns.set(id, gun);
        }
        group.add(foot.group, peerBike.group, label);
        group.position.set(peer.x, 0, peer.z);
        foot.group.rotation.y = peer.angle;
        peerBike.group.rotation.y = peer.angle;
        group.traverse((o) => { o.castShadow = false; });
        scene.add(group);
        existing = { group, foot, bike: peerBike, car: null, carKind: 'foot', boat: null, guns: peerGuns, label, target: { ...peer }, motion: createPeerInterpolator(), name: peer.name, color: peer.color, body: null, flashAt: 0, hurtAt: -99, predicted: 0 };
        peers.set(peer.id, existing);
      }
      if (!existing.motion.push(peer, snapshotTime)) continue;
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

  /** Damages a pedestrian or gang member and handles what follows (money, limbs, missions, crimes). */
  function hurtNpc(npc: Npc, amount: number, vx: number, vy: number, vz: number, now: number, force: boolean, gore: number, near: THREE.Vector3 | null) {
    const time = now / 1000;
    const x = npc.x, z = npc.z;
    const result = npcs.damage(npc, amount, vx, vy, vz, time, force);
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

  /** Damages a zombie; a kill tears limbs on a big hit and sometimes leaves money on the street. */
  function hurtZombie(zb: Zombie, amount: number, vx: number, vy: number, vz: number, now: number, force: boolean, gore: number, near: THREE.Vector3 | null) {
    const result = zombies.damage(zb, amount, vx, vy, vz, now / 1000, force);
    if (!result?.killed) return;
    dismember(result.body, gore, near, now);
    if (Math.random() < 0.22) pickups.drop(zb.x, zb.z, 10 + Math.floor(Math.random() * 40), now);
  }

  /** Everything that can be shot, as upright capsules: centre (x, z), bottom and top heights, radius. */
  function forEachTarget(callback: (x: number, z: number, y0: number, y1: number, radius: number) => void) {
    npcs.forEachStanding((x, z, npc) => callback(x, z, npc.y, npc.y + 1.8, 0.38));
    police.forEachUnit((x, z, onFoot) => { if (onFoot) callback(x, z, 0.1, 1.9, 0.38); });
    for (const peer of peers.values()) if (!peer.target.down && peerVehicle(peer) === 'foot') callback(peer.group.position.x, peer.group.position.z, 0.1, 1.9, 0.4);
    animals.forEachShadow((x, z, size) => callback(x, z, 0.05, 0.1 + size * 0.6, Math.max(0.2, size * 0.45)));
    ragdolls.forEach((body) => { if (body !== playerBody) { ragdolls.center(body, scratch); callback(scratch.x, scratch.z, scratch.y - 0.3, scratch.y + 0.3, 0.45); } });
    if (zombieMode) zombies.forEachStanding(callback);
  }

  /** Without a mouse (F key, touch): straight ahead where the player faces, at chest height. No auto-aim. */
  function aimAhead(range: number, out: THREE.Vector3) {
    return out.set(state.x + Math.sin(state.angle) * range, groundHeight(state.x, state.z) + 1.2, state.z + Math.cos(state.angle) * range);
  }

  /**
   * Mouse aim, with no assist: the point under the cursor. On a target that is where the cursor covers it,
   * so a click on a head is a head shot; otherwise the cursor at chest height. True when on a target.
   */
  function pointerAim(range: number, out: THREE.Vector3) {
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
    if (!onPointer) {
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

  function muzzle(out: THREE.Vector3) {
    if (state.riding) {
      // Firing from a vehicle: out of the right-hand window or from the rider's hand.
      const side = inCar() ? 1.1 : 0.55;
      const c = Math.cos(state.angle), s = Math.sin(state.angle);
      return out.set(state.x + c * side + Math.sin(aimYaw) * 0.6, groundHeight(state.x, state.z) + (inCar() ? 1.45 : 1.4), state.z - s * side + Math.cos(aimYaw) * 0.6);
    }
    walker.group.position.set(state.x, groundHeight(state.x, state.z), state.z);
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
    let hit = false;
    npcs.near(cx, cz, 0.9, (npc, nx, nz) => {
      if (hit) return;
      hit = true;
      hurtNpc(npc, def.damage, fx * def.force, 3.5, fz * def.force, now, false, 0, null);
      effects.blood(hitPoint.set(nx, 1.4, nz), rayDir.set(fx, 0, fz), 4);
    });
    if (!hit) police.near(cx, cz, 0.9, (o) => {
      if (hit) return;
      hit = true;
      police.damage(o, def.damage, fx * def.force, 3.5, fz * def.force, time);
      effects.blood(hitPoint.set(o.x, 1.4, o.z), rayDir.set(fx, 0, fz), 4);
    });
    if (!hit) for (const [id, peer] of peers) {
      if (hit || peer.target.down || peerVehicle(peer) !== 'foot') continue;
      if (Math.hypot(peer.group.position.x - cx, peer.group.position.z - cz) < 0.9) {
        hit = true;
        hitPeer(id, peer, def.damage, fx, fz, now);
        effects.blood(hitPoint.set(peer.group.position.x, 1.4, peer.group.position.z), rayDir.set(fx, 0, fz), 4);
      }
    }
    if (!hit && zombieMode) zombies.near(cx, cz, 0.95, (zb) => {
      if (hit) return;
      hit = true;
      hurtZombie(zb, def.damage, fx * def.force, 3.5, fz * def.force, now, false, 0, null);
      effects.blood(hitPoint.set(zb.x, 1.4, zb.z), rayDir.set(fx, 0, fz), 4);
    });
    if (!hit) animals.near(cx, cz, 0.9, (index) => { if (!hit) { hit = true; animals.hit(index, fx * 6, 3, fz * 6); } });
    if (!hit) hit = ragdolls.push(cx, cz, 0.9, fx * 7, 3, fz * 7) > 0;
    if (hit) { playThud(); shake = Math.max(shake, 0.15); npcs.notice(cx, cz, 'fight', time); }
  }

  function applyBlast(b: Explosion, now: number, byPlayer: boolean) {
    const time = now / 1000;
    blastPoint.set(b.x, b.y, b.z);
    playBoom();
    const dPlayer = Math.hypot(state.x - b.x, state.z - b.z);
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
      hurtNpc(npc, b.damage * f + 15, dx * (8 + 14 * f), 6 + 9 * f, dz * (8 + 14 * f), now, true, f > 0.45 ? 0.7 : 0.25, blastPoint);
      effects.blood(hitPoint.set(nx, 1, nz), rayDir.set(dx, 0.6, dz), 6);
    });
    police.near(b.x, b.z, b.radius, (o) => {
      const d = Math.hypot(o.x - b.x, o.z - b.z), f = 1 - d / b.radius, dx = (o.x - b.x) / (d || 1), dz = (o.z - b.z) / (d || 1);
      police.damage(o, b.damage * f + 15, dx * (8 + 14 * f), 6 + 9 * f, dz * (8 + 14 * f), time, true);
    });
    if (zombieMode) {
      zombies.hear(b.x, b.z, 70, time);
      zombies.near(b.x, b.z, b.radius, (zb) => {
        const d = Math.hypot(zb.x - b.x, zb.z - b.z), f = 1 - d / b.radius, dx = (zb.x - b.x) / (d || 1), dz = (zb.z - b.z) / (d || 1);
        hurtZombie(zb, b.damage * f + 20, dx * (8 + 14 * f), 6 + 9 * f, dz * (8 + 14 * f), now, true, f > 0.4 ? 0.8 : 0.3, blastPoint);
        effects.blood(hitPoint.set(zb.x, 1, zb.z), rayDir.set(dx, 0.6, dz), 6);
      });
    }
    for (const [id, peer] of peers) {
      const d = Math.hypot(peer.group.position.x - b.x, peer.group.position.z - b.z);
      if (d < b.radius && byPlayer) hitPeer(id, peer, Math.min(100, b.damage * (1 - d / b.radius) + 10), (peer.group.position.x - b.x) / (d || 1), (peer.group.position.z - b.z) / (d || 1), now);
    }
    for (const car of vehicles.cars) {
      if (car.mode === 'off') continue;
      const d = Math.hypot(car.x - b.x, car.z - b.z);
      if (d < b.radius + 2) damageCar(car, b.damage * 1.4 * (1 - d / (b.radius + 2)), now);
    }
    if (dPlayer < b.radius && down !== 'wasted' && down !== 'busted') {
      const f = 1 - dPlayer / b.radius, dx = (state.x - b.x) / (dPlayer || 1), dz = (state.z - b.z) / (dPlayer || 1);
      damagePlayer(b.damage * f * (inCar() ? 0.5 : 0.8), now, { x: b.x, z: b.z });
      if (!inCar() && f > 0.3 && !down) knockPlayer(dx * 12 * f, 6 + 6 * f, dz * 12 * f, now);
    }
    if (bikeHealth > 0 && Math.hypot(bikeX - b.x, bikeZ - b.z) < b.radius + 1 && (playerCar || !state.riding)) bikeHealth = Math.max(0, bikeHealth - b.damage);
  }

  function fire(now: number, time: number) {
    if (swimming || glide) return;
    const def = weaponById(weapon);
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
      if (rayDir.y < 0) maxT = Math.min(maxT, (groundHeight(rayOrigin.x, rayOrigin.z) + 0.02 - rayOrigin.y) / rayDir.y);
      // Every target type is tested and the nearest one along the ray takes the bullet.
      let best: { t: number; apply: () => void } | null = null;
      const consider = (t: number, apply: () => void) => { if (t < maxT && (!best || t < best.t)) best = { t, apply }; };
      const pointBlank = def.id === 'shotgun';
      const npcHit = npcs.raycast(rayOrigin, rayDir, maxT);
      // Head shots (above the shoulders) do two and a half times the damage.
      if (npcHit) consider(npcHit.t, () => {
        const head = hitPoint.y - npcHit.npc.y > 1.46;
        hurtNpc(npcHit.npc, def.damage * (head ? 2.5 : 1), rayDir.x * def.force, 2.5, rayDir.z * def.force, now, false, pointBlank && npcHit.t < 4 ? 0.5 : head ? 0.2 : 0.05, hitPoint.clone());
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : head ? 10 : 7);
        hurtSomeone = true;
        hitMarkAt = now;
        headMark = head;
      });
      const zombieHit = zombieMode ? zombies.raycast(rayOrigin, rayDir, maxT) : null;
      if (zombieHit) consider(zombieHit.t, () => {
        const head = zombieHit.height > 1.46;
        hurtZombie(zombieHit.zombie, def.damage * (head ? 3 : 1), rayDir.x * def.force, 2.5, rayDir.z * def.force, now, false, pointBlank && zombieHit.t < 4 ? 0.6 : head ? 0.35 : 0.08, hitPoint.clone());
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : head ? 10 : 6);
        hitMarkAt = now;
        headMark = head;
      });
      const officerHit = police.raycast(rayOrigin, rayDir, maxT);
      if (officerHit) consider(officerHit.t, () => {
        const head = hitPoint.y - groundHeight(officerHit.officer.x, officerHit.officer.z) > 1.5;
        police.damage(officerHit.officer, def.damage * (head ? 2.5 : 1), rayDir.x * def.force, 2.5, rayDir.z * def.force, time);
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : 7);
        hitMarkAt = now;
        headMark = head;
      });
      const bodyHit = ragdolls.raycast(rayOrigin, rayDir, maxT);
      if (bodyHit) consider(bodyHit.t, () => {
        ragdolls.impulse(bodyHit.body, rayDir.x * def.force, 1.5 + Math.max(0, rayDir.y) * def.force, rayDir.z * def.force, bodyHit.index);
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
        if (t > 0 && y > 0 && y < 1.9) consider(t, () => {
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
    npcs.near(cx, cz, radius, (npc, nx, nz) => {
      hurtNpc(npc, speed * 5, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, now, true, gore, null);
      thrown(nx, nz);
    });
    police.near(cx, cz, radius, (o) => {
      police.damage(o, speed * 5, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, time, true);
      thrown(o.x, o.z);
    });
    animals.near(cx, cz, radius, (index, ax, az) => { animals.hit(index, fx * speed, 3, fz * speed); thrown(ax, az); });
    if (zombieMode) zombies.near(cx, cz, radius + 0.1, (zb) => {
      hurtZombie(zb, speed * 6, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, now, true, gore, null);
      thrown(zb.x, zb.z);
    });
    for (const [id, peer] of peers) {
      const kind = peerVehicle(peer);
      if (peer.target.down || kind === 'car' || kind === 'police') continue;
      if (Math.hypot(peer.group.position.x - cx, peer.group.position.z - cz) < radius + (kind === 'scooter' ? 0.6 : 0) && now - peer.hurtAt * 1000 > 800) {
        hitPeer(id, peer, Math.min(90, speed * (kind === 'scooter' ? 3 : 4)), fx, fz, now);
        thrown(peer.group.position.x, peer.group.position.z);
      }
    }
    ragdolls.push(cx, cz, radius, fx * speed, 2 + speed * 0.1, fz * speed);
  }

  /** Traffic and police vehicles knock down a player on foot; cruisers ram the player's vehicle. */
  function vehicleImpacts(now: number) {
    if (down) return;
    for (const car of vehicles.cars) {
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
          if (!down) knockPlayer(vx * 0.8, 3 + Math.abs(car.speed) * 0.2, vz * 0.8, now);
          return;
        }
      }
    }
  }

  function emitHud(now: number) {
    const missionInfo = missions.view();
    const target = missionInfo.target;
    const nearMission = target !== null && distance(target) <= 6.5;
    const nearBike = !state.riding && Math.hypot(state.x - bikeX, state.z - bikeZ) < 2.6;
    const nearStore = !state.riding && distance(STORE) < 3.5;
    const nearBikeShop = !state.riding && distance(BIKE_SHOP) < 3.5;
    const nearHospital = !state.riding && distance(LANDMARKS.hospital) < 3.5;
    const nearVenue = !state.riding ? venueDoors.find((door) => distance(door.at) < 2.6) : undefined;
    const offer = sideMissions.nearOffer(state.x, state.z);
    const car = !state.riding ? nearestCar(3.4) : null;
    const rounds = ammo.get(weapon);
    const hint = now < notificationUntil ? notification
      : down === 'wasted' ? 'Đang được đưa đi cấp cứu…'
      : down === 'busted' ? 'Đang bị còng tay, áp giải về đồn…'
      : surrendered ? 'Đang đầu hàng · Nhấn H để hạ tay xuống'
      : playerBody ? 'Đang đứng dậy…'
      : glide?.phase === 'deck' ? 'Đài quan sát tầng 68 · WASD đi dạo · Space nhảy dù · E đi thang máy xuống'
      : glide?.phase === 'fall' ? 'Rơi tự do · Space bung dù · A/D lượn · W lao nhanh'
      : glide ? `Dù lượn · cao ${Math.round(glide.y)} m · A/D lái · W lao xuống · S hãm`
      : heist ? `Đang mở két… ${Math.min(100, Math.round(((now - heist.started) / HEIST_MS) * 100))}% · ở yên gần quầy, đừng đi xa`
      : boat ? 'Ca nô · W ga · S lùi · A/D bẻ lái · Space thắng · E cập bến hoặc nhảy xuống sông'
      : swimming ? (boats.rental.mode === 'player' && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) < 4.2 ? 'Nhấn E để lên ca nô' : 'Đang bơi · Shift bơi nhanh · sát bờ kè hoặc cầu tàu nhấn Space để leo lên')
      : !state.riding && SCENERY.docks.some((d) => d.rental && distance(d.ring) < 3) ? `Nhấn E để thuê ca nô (${formatThousands(BOAT_PRICE)})`
      : !state.riding && distance(LANDMARKS.tower.door) < 3.2 ? `Nhấn E: lên đài quan sát tầng 68 (${formatThousands(DECK_PRICE)}) và nhảy dù`
      : !state.riding && distance(LANDMARKS.bank.door) < 3.2 ? (weapon === 'fists' ? 'Ngân hàng Phương Nam · phải có súng mới cướp được' : 'Nhấn E để cướp ngân hàng (bị truy nã gắt)')
      : !state.riding && vaultSpot() ? 'Space để nhảy qua lan can xuống sông'
      : zombieMode && !nearStore && !nearHospital && !state.riding && !(car && !nearBike) ? (rounds && rounds.mag === 0 && rounds.reserve === 0 ? 'Hết đạn · Đổi súng (1–6) hoặc mua đạn ở Tiệm súng' : 'Click/F bắn · bắn vào đầu · R nạp đạn · lên xe để chạy thoát')
      : nearMission && missionInfo.requiresOnFoot && state.riding ? 'Giảm tốc rồi nhấn E xuống xe để dọn rác'
      : nearMission && missionInfo.requiresBike && !isMotorbike() ? 'Hãy dùng xe máy để tham gia vòng đua'
      : nearMission ? missionInfo.objective
      : offer ? `Nhấn E để nhận việc: ${offer.def.title} (+${formatThousands(offer.def.reward)})`
      : nearStore ? (deliveries ? 'Nhấn E để vào Tiệm súng' : 'Tiệm súng: hoàn thành 1 nhiệm vụ giao hàng để mở khóa')
      : nearBikeShop ? 'Nhấn E để vào Cửa hàng xe máy'
      : nearHospital ? 'Nhấn E để khám và hồi máu'
      : nearVenue ? `Nhấn E để vào ${nearVenue.name} (18+)`
      : missionInfo.status !== 'active' ? 'Nhấn M để chọn nhiệm vụ mới hoặc chơi lại'
      : state.riding ? (weapon !== 'fists' ? 'W ga · S phanh/lùi · A/D lái · Space phanh tay · Click bắn' : 'W ga · S phanh/lùi · A/D lái · Space phanh tay · E xuống xe')
      : car && !nearBike ? (car.mode === 'lane' ? (car.kind === 'moto' ? 'Nhấn E để cướp xe máy (bị truy nã)' : 'Nhấn E để cướp xe (bị truy nã)') : car.health <= 0 ? 'Xe này đã hỏng' : 'Nhấn E để lên xe')
      : nearBike ? (bikeHealth > 0 ? (bikeId === 'horse' ? 'Nhấn E để cưỡi ngựa' : 'Nhấn E để lên xe máy') : bikeId === 'horse' ? 'Ngựa đã kiệt sức · Chữa ở Cửa hàng xe máy' : 'Xe máy đã hỏng · Mua xe mới ở Cửa hàng xe máy')
      : police.wanted ? 'Đang bị truy nã · Trốn khỏi tầm mắt cảnh sát, hoặc nhấn H để đầu hàng'
      : rounds && rounds.mag === 0 && rounds.reserve === 0 ? 'Hết đạn · Mua thêm ở Tiệm súng'
      : weapon !== 'fists' ? 'Chĩa súng vào người để cướp · Click/F bắn · R nạp đạn · Giữ Tab túi súng'
      : 'WASD di chuyển · Shift chạy · Space nhảy · E tương tác · Giữ Tab mở túi súng';
    const policePoints: { x: number; z: number }[] = [];
    police.forEachUnit((x, z) => { if (policePoints.length < 10) policePoints.push({ x: Math.round(x), z: Math.round(z) }); });
    const vehicle = vehicleKind();
    const vehicleHealth = playerCar ? playerCar.health / carMax(playerCar) : state.riding ? bikeHealth / bikeById(bikeId).health : -1;
    const hud: Hud = {
      speed: Math.round(velocity * 10) / 10, riding: state.riding, score: state.score,
      mission: missionInfo.objective, missionStep: missionInfo.step, missionInfo, hint,
      x: Math.round(state.x * 2) / 2, z: Math.round(state.z * 2) / 2,
      cash, deliveries, weapon, owned: WEAPONS.filter((w) => owned.has(w.id)).map((w) => w.id), down: down !== null,
      fps: monitor.fps, quality: QUALITY_LEVELS[level].label, qualityMode, gpu, softwareGpu,
      health: Math.ceil(health), wanted: police.wanted, banner: now < bannerUntil ? banner : '', vehicle, vehicleHealth: Math.round(vehicleHealth * 100) / 100,
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
      if (down) break;
      const d = Math.hypot(state.x - strike.x, state.z - strike.z) || 1;
      const dx = (state.x - strike.x) / d, dz = (state.z - strike.z) / d;
      playThud();
      if (inCar()) { damageVehicle(strike.damage * 1.4, now); shake = Math.max(shake, 0.2); continue; }
      damagePlayer(strike.damage * (state.riding ? 0.8 : 1), now, { x: strike.x, z: strike.z }, 'Zombie');
      effects.blood(hitPoint.set(state.x, 1.3, state.z), rayDir.set(dx, 0.3, dz), 5);
      shake = Math.max(shake, strike.heavy ? 0.45 : 0.18);
      if (strike.heavy && !down && !state.riding) knockPlayer(dx * 7, 3.5, dz * 7, now);
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
  /** Poses the walker for this frame. */
  function animateWalker(dt: number, now: number, time: number, walking: boolean, o: { twoHanded: boolean; kneeling: boolean; handsUp: boolean; armed: boolean; swim: number; sky: 'deck' | 'fall' | 'chute' | null }) {
    const w = walker;
    const speed = walking ? Math.abs(velocity) : 0;
    const go = Math.min(1, speed / 1.2);
    const run = THREE.MathUtils.clamp((speed - 3.2) / 3.2, 0, 1);
    // Longer, slower-cadence strides as the pace picks up.
    walkClock += speed * dt * (1.95 - 0.5 * run);
    const phase = walkClock * 2, sinP = Math.sin(phase), cosP = Math.cos(phase);
    const amp = (0.48 + 0.34 * run) * go;
    // Thighs swing; a knee folds while its leg comes forward, and stays a little bent when running.
    let thighL = sinP * amp, thighR = -sinP * amp;
    let kneeL = (Math.max(0, -cosP) * (0.55 + 1.05 * run) + 0.12 * run) * go;
    let kneeR = (Math.max(0, cosP) * (0.55 + 1.05 * run) + 0.12 * run) * go;
    // Arms swing against the legs; elbows pump when running.
    let armL = -thighL * (0.8 + 0.3 * run), armR = -thighR * (0.8 + 0.3 * run);
    let elbowL = -(0.18 + 1.15 * run) * go - Math.max(0, -armL) * 0.35;
    let elbowR = -(0.18 + 1.15 * run) * go - Math.max(0, -armR) * 0.35;
    let armLz = 0, armRz = 0;
    // The torso leans into speed and acceleration, banks into turns and twists against the stride.
    const accel = THREE.MathUtils.clamp((speed - motion.lastSpeed) / Math.max(dt, 1e-3), -12, 12);
    motion.lastSpeed = speed;
    const turnRate = Math.atan2(Math.sin(state.angle - motion.lastAngle), Math.cos(state.angle - motion.lastAngle)) / Math.max(dt, 1e-3);
    motion.lastAngle = state.angle;
    motion.lean = THREE.MathUtils.damp(motion.lean, 0.04 * go + 0.2 * run + accel * 0.012, 7, dt);
    motion.roll = THREE.MathUtils.damp(motion.roll, THREE.MathUtils.clamp(turnRate * speed * 0.01, -0.2, 0.2), 6, dt);
    let lean = motion.lean, twist = sinP * (0.06 + 0.1 * run) * go, drop = 0;
    // Highest as the legs pass each other, lowest on each footfall.
    let bob = (0.5 - 0.5 * Math.cos(phase * 2)) * (0.02 + 0.05 * run) * go;
    // Breathing while standing.
    w.body.scale.set(1, 1 + Math.sin(time * 2.3) * 0.012 * (1 - go), 1);
    if (jumpY > 0) {
      // Airborne: knees tucked, arms out for balance.
      thighL = -0.95; kneeL = 1.25; thighR = -0.3; kneeR = 0.7;
      armL = -0.9; armR = -0.6; elbowL = elbowR = -0.5; armLz = 0.35; armRz = -0.35;
      lean = 0.12; bob = 0;
    }
    if (motion.land > 0) {
      // Landing: the legs soak up the impact.
      const k = motion.land;
      thighL -= 0.5 * k; thighR -= 0.5 * k; kneeL += 1.0 * k; kneeR += 1.0 * k;
      drop += 0.13 * k; lean += 0.15 * k;
      motion.land = Math.max(0, motion.land - dt * 5.5);
    }
    if (now < punchUntil) {
      // A jab: the right arm drives out from a cocked elbow, the shoulders turn into it, the left guards.
      const t = 1 - (punchUntil - now) / 180;
      armR = -1.55; elbowR = -1.5 * (1 - Math.min(1, t * 1.8)); armRz = 0;
      twist = -0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3));
      armL = -1.2; elbowL = -1.7; lean += 0.08;
    } else if (o.armed) {
      // Aiming: the right arm straight out; long guns are steadied with the left hand.
      armR = -Math.PI / 2; elbowR = 0; armRz = 0;
      if (o.twoHanded) { armL = -1.25; elbowL = -0.35; armLz = 0.45; }
    }
    if (o.handsUp) { armL = armR = -2.9; elbowL = elbowR = -0.25; armLz = armRz = 0; }
    // A hit snaps the torso back for a moment.
    const hit = 1 - (now - motion.hitAt) / 280;
    if (hit > 0) { lean -= 0.4 * hit; armLz += 0.4 * hit; armRz -= 0.4 * hit; }
    if (o.kneeling) {
      // Forced to kneel, hands cuffed behind the back.
      thighL = thighR = 0.15; kneeL = kneeR = 1.45; drop = 0.36 * PERSON_SCALE / 0.68;
      armL = armR = 0.6; elbowL = elbowR = 0; armLz = 0.5; armRz = -0.5; lean = 0.1; twist = 0; bob = 0;
    }
    if (now < stunUntil) { armLz = Math.sin(time * 40) * 0.3; armRz = Math.cos(time * 37) * 0.3; thighL = Math.sin(time * 33) * 0.15; }
    if (o.swim > 0) {
      // Front crawl when moving (body flat, arms windmilling, a flutter kick); treading water when still.
      const crawl = Math.max(0, (o.swim - 0.25) / 0.75);
      const stroke = time * (4 + crawl * 2.5);
      const reachL = -Math.PI + (stroke % (Math.PI * 2)), reachR = -Math.PI + ((stroke + Math.PI) % (Math.PI * 2));
      const scull = Math.sin(time * 3);
      lean = 0.12 + crawl * 1.2; twist = Math.sin(stroke) * 0.25 * crawl; bob = 0; drop = 0;
      armL = THREE.MathUtils.lerp(-0.45, reachL, crawl); armR = THREE.MathUtils.lerp(-0.45, reachR, crawl);
      armLz = THREE.MathUtils.lerp(1.0 + scull * 0.3, 0.1, crawl); armRz = THREE.MathUtils.lerp(-1.0 - scull * 0.3, -0.1, crawl);
      elbowL = reachL > 0 ? -0.7 * crawl - 0.4 * (1 - crawl) : -0.4 * (1 - crawl);
      elbowR = reachR > 0 ? -0.7 * crawl - 0.4 * (1 - crawl) : -0.4 * (1 - crawl);
      const kick = Math.sin(time * (crawl ? 9 : 2.6));
      thighL = THREE.MathUtils.lerp(kick * 0.45, 1.15 + kick * 0.22, crawl); thighR = THREE.MathUtils.lerp(-kick * 0.45, 1.15 - kick * 0.22, crawl);
      kneeL = THREE.MathUtils.lerp(0.5 + Math.max(0, kick) * 0.6, 0.2 + Math.max(0, kick) * 0.3, crawl);
      kneeR = THREE.MathUtils.lerp(0.5 + Math.max(0, -kick) * 0.6, 0.2 + Math.max(0, -kick) * 0.3, crawl);
    }
    if (o.sky === 'fall') {
      // Freefall: belly to the earth, arms and legs spread wide.
      lean = 1.25; twist = 0; bob = 0; drop = 0;
      armL = armR = -0.5; armLz = 1.35; armRz = -1.35; elbowL = elbowR = -0.5;
      thighL = thighR = 0.35; kneeL = kneeR = 0.8;
    } else if (o.sky === 'chute') {
      // Hanging in the harness, hands up on the steering toggles, legs dangling.
      lean = -0.05; twist = 0; bob = 0; drop = 0;
      armL = armR = -2.75; armLz = 0.28; armRz = -0.28; elbowL = elbowR = -0.35;
      thighL = Math.sin(time * 1.3) * 0.15 - 0.1; thighR = -Math.sin(time * 1.3) * 0.15 - 0.1; kneeL = kneeR = 0.25;
    }
    w.group.position.y += bob - drop;
    w.body.rotation.set(lean, twist, motion.roll);
    w.limbLeft.rotation.set(thighL, 0, 0);
    w.limbRight.rotation.set(thighR, 0, 0);
    w.kneeLeft.rotation.x = kneeL;
    w.kneeRight.rotation.x = kneeR;
    w.armLeft.rotation.set(armL, 0, armLz);
    w.armRight.rotation.set(armR, 0, armRz);
    w.elbowLeft.rotation.x = elbowL;
    w.elbowRight.rotation.x = elbowR;
    // The delivery box lags behind the bounce on its straps (a damped spring).
    const packTarget = -bob * 1.6 + (jumpY > 0 ? -0.05 : 0);
    motion.packV += ((packTarget - motion.pack) * 90 - motion.packV * 9) * dt;
    motion.pack += motion.packV * dt;
    w.pack.position.y = 0.86 + motion.pack;
    w.pack.rotation.x = -lean * 0.4 + motion.packV * 0.15;
  }

  function walk(dt: number, now: number, vertical: number, horizontal: number) {
    // On foot, movement is relative to where the camera is looking.
    const forwardX = -Math.sin(smoothView.yaw), forwardZ = -Math.cos(smoothView.yaw);
    const dirX = forwardX * vertical - forwardZ * horizontal;
    const dirZ = forwardZ * vertical + forwardX * horizontal;
    const moving = horizontal !== 0 || vertical !== 0;
    const aiming = now < aimUntil;
    if (moving && !aiming) state.angle = angleLerp(state.angle, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * 12));
    // Tear gas makes it hard to run; swimming is slow (Shift for a faster crawl).
    const topSpeed = swimming ? (keys.has('shift') ? 2.9 : 1.8) : (keys.has('shift') ? 6.8 : aiming ? 3.4 : 4.2) * (performance.now() < gassedUntil ? 0.55 : 1);
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
    if (footClear(state.x + dx, state.z)) state.x += dx;
    if (footClear(state.x, state.z + dz)) state.z += dz;
    if (swimming) {
      // A passing boat shoves a swimmer aside (and hurts if it was going fast).
      const pushed = boats.pushOut(state, 0.45);
      if (pushed && Math.abs(pushed.speed) > 3 && now > boatHitAt) {
        boatHitAt = now + 1500;
        damagePlayer(Math.abs(pushed.speed) * 2, now, pushed, 'Tàu thuyền');
        splash(state.x, state.z, now, 1);
        notify('Bị thuyền va phải! Tránh xa luồng tàu.', 2000);
      }
    } else if (velocity > 0.5) ragdolls.push(state.x, state.z, 0.55, headingX * velocity * 1.2, 1.2, headingZ * velocity * 1.2);
    return moving;
  }

  function updatePeers(now: number, time: number) {
    const renderTime = peerClock.renderTime(now);
    for (const [, peer] of peers) {
      const { target } = peer;
      const pose = peer.motion.sample(renderTime);
      if (!pose) continue;
      peer.group.position.x = pose.x;
      peer.group.position.z = pose.z;
      const { x, z } = peer.group.position;
      const kind = peerVehicle(peer);
      peer.group.position.y = kind === 'swim' ? WATER_LEVEL - 1.5 : kind === 'boat' ? WATER_LEVEL : groundHeight(x, z) - 0.02;
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
        peer.body = ragdolls.spawn({ x, y: groundHeight(x, z), z, yaw: target.angle, scale: RAGDOLL_SCALE, look: { shirt: peer.color, pants: '#293e4a', skin: '#dca878', helmet: '#fff4dc' }, velocity: { x: (Math.random() - 0.5) * 3, y: 2, z: (Math.random() - 0.5) * 3 } });
        effects.blood(hitPoint.set(x, 1, z), rayDir.set(0, 0, 1), 6);
      } else if (!target.down && peer.body) {
        ragdolls.remove(peer.body);
        peer.body = null;
      }
      peer.foot.group.visible = (kind === 'foot' || kind === 'swim' || kind === 'boat') && !target.down;
      peer.foot.body.rotation.x = kind === 'swim' && Math.abs(pose.speed) > 0.5 ? 1.2 : 0;
      peer.bike.group.visible = kind === 'scooter' && !target.down;
      peer.label.position.y = kind === 'car' || kind === 'police' ? 3.1 : kind === 'swim' ? 3.6 : 2.6;
      const armed = target.weapon && target.weapon !== 'fists';
      for (const [id, gun] of peer.guns) gun.visible = id === target.weapon;
      const peerStride = Math.abs(pose.speed) > 1 ? Math.sin(time * 10) * 0.55 : 0;
      peer.foot.limbLeft.rotation.x = peerStride;
      peer.foot.limbRight.rotation.x = -peerStride;
      peer.foot.armRight.rotation.x = armed ? -Math.PI / 2 : -peerStride * 0.7;
      if (target.firing && now - peer.flashAt > 160) {
        peer.flashAt = now;
        const a = peer.foot.group.rotation.y;
        scratch.set(x + Math.sin(a) * 0.9 + Math.cos(a) * 0.38, 1.25, z + Math.cos(a) * 0.9 - Math.sin(a) * 0.38);
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
    const interval = now - previousTime;
    // Holding Tab for the weapon bag slows the street down, like a weapon wheel.
    const dt = Math.min(interval / 1000, 0.05) * (bagOpen ? 0.25 : 1);
    previousTime = now;
    // Frames behind an opaque overlay say nothing about how fast the street draws.
    adaptQuality(now, covered ? 0 : interval);
    const time = now / 1000;
    const street = active || started;
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
        if (keys.has('z')) { view.yaw += dt * 1.9; manualCameraAt = now; }
        if (keys.has('c')) { view.yaw -= dt * 1.9; manualCameraAt = now; }
      }
      const braking = keys.has(' ') || keys.has('space');
      if (state.riding) {
        driveVehicle(dt, now, time, vertical, horizontal, braking);
        moving = velocity !== 0;
      } else if (boat) {
        driveBoat(dt, now, vertical, horizontal, braking);
        moving = velocity !== 0;
      } else if (glide) moving = glideMove(dt, now, vertical, horizontal);
      else moving = walk(dt, now, vertical, horizontal);
      const wantsShot = triggerQueued || (def.auto && (mouseHeld || keys.has('f')));
      if (wantsShot && !bagOpen && now - lastShot >= 1000 / def.fireRate) {
        triggerQueued = false;
        fire(now, time);
      }
      state.speed = velocity;
      if (time - lastDamage > 6 && health < MAX_HEALTH && police.wanted === 0) health = Math.min(MAX_HEALTH, health + dt * 2);
      unstick(dt);
    } else {
      if (!state.riding) velocity = 0;
      state.speed = velocity;
      triggerQueued = false;
    }

    // Deep water under someone on foot means swimming (weapons away); back in the shallows they walk.
    const deep = !state.riding && !boat && !glide && !playerBody && deepWater(state.x, state.z, bodyY);
    if (deep && !swimming) {
      swimming = true;
      jumpY = jumpV = 0;
      notify(police.wanted > 0 ? 'Nhảy xuống sông! Cảnh sát trên bờ khó đuổi theo.' : 'Đang bơi · Shift bơi nhanh · tới bậc thang hoặc cầu tàu, hoặc sát bờ kè nhấn Space để lên', 3500);
    } else if (!deep && swimming) swimming = false;
    updateHeist(now);
    // The hire boat goes back to its dock once it has been left far behind.
    if (!boat && boats.rental.mode === 'player' && now - boatLeftAt > 4000 && Math.hypot(boats.rental.x - state.x, boats.rental.z - state.z) > 160) boats.dock();
    boats.update(dt, time, swimming || boat ? { x: state.x, z: state.z } : null);
    boats.setNight(atmosphere.night);

    // The world moves on: weather and clock, traffic, police, gangs and residents.
    // Rain fills whatever the camera can see, so it scales with the zoom.
    if (atmosphere.update(dt, time, cameraTarget, THREE.MathUtils.clamp(smoothView.dist * 2.4, 50, 220)) && shadowsAllowed) renderer.shadowMap.needsUpdate = true;
    if (followShadows(cameraTarget.x, cameraTarget.z) && shadowsAllowed) renderer.shadowMap.needsUpdate = true;
    if (interior) {
      hemi.intensity = 2.3;
      sun.intensity = 2.1;
      sun.color.set('#fff3e2');
      interiors.setInfo({ owned: [...owned], bike: bikeId });
      interiors.update(dt, time);
    }
    applyShadows();
    world.setAtmosphere?.({ night: atmosphere.night, wet: atmosphere.rain, sky: (scene.fog as THREE.Fog).color });
    vehicles.setNight(atmosphere.night);
    setRain(street ? atmosphere.rain : 0);
    crossing.length = 0;
    npcs.forEachCrossing((x, z) => crossing.push({ x, z }));
    for (const crash of vehicles.update(dt, time, { x: state.x, z: state.z, car: playerCar }, crossing)) handleCrash(crash, now, time, false);
    checkRedLight(time);
    vehicleImpacts(now);
    const policeResult = police.update(dt, time, {
      x: state.x, z: state.z, car: playerCar, riding: state.riding, heading: state.angle, speed: Math.abs(velocity), down: down !== null, stunned: now < stunUntil,
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
      const ox = Math.cos(state.angle) * -side, oz = -Math.sin(state.angle) * -side;
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
      if (!inCar() && down !== 'wasted' && Math.hypot(state.x - cloud.x, state.z - cloud.z) < 4.2) {
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
      playerPoint.set(state.x, 1.1, state.z);
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
    updateReticle(active && armed && !down && !bagOpen, locked, pointerInside, now);
    gangKnocks = 0;
    if (zombieMode) updateZombies(dt, now, time);
    const npcEvents = zombieMode ? NO_NPC_EVENTS : npcs.update(dt, time, atmosphere.hours, atmosphere.rain > 0.4, { x: state.x, z: state.z, aimYaw, armed: armed && !inCar(), aiming, inVehicle: state.riding, down: down !== null }, state.x, state.z, groundHeight);
    for (const robbery of npcEvents.robbed) {
      pickups.drop(robbery.npc.x - Math.sin(robbery.npc.yaw) * -0.6, robbery.npc.z - Math.cos(robbery.npc.yaw) * -0.6, robbery.amount, now);
      police.crime(robbery.shop ? 2 : 1, time);
      notify(robbery.shop ? `Cướp tiệm! Nhặt ${formatThousands(robbery.amount)} rơi trước mặt` : `Cướp được ${formatThousands(robbery.amount)}, nhặt tiền đi!`, 2500);
    }
    for (let i = 0; i < npcEvents.strikes; i++) { damagePlayer(6, now, undefined, 'Băng đảng'); playThud(); }
    if (npcEvents.shots.length) npcs.notice(state.x, state.z, 'shots', time);
    for (const shot of npcEvents.shots) {
      playerPoint.set(state.x, 1.1, state.z);
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
    const collected = pickups.update(now, state.x, state.z, !down && !inCar());
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
    passengerAboard = missionResult.passenger;
    if (missionResult.completed) {
      cash += missionResult.completed.reward;
      state.score += missionResult.completed.score;
      if (missionResult.completed.heal) health = MAX_HEALTH;
      notify(`Hoàn thành "${missionResult.completed.title}" · +${formatThousands(missionResult.completed.reward)}`, 4500);
    }
    if (missionResult.failed) notify(missionResult.failed, 4000);

    // Player, bike and props. In the water the body floats (head and shoulders out when treading, flat when
    // swimming); stepping off a pier or over the railing it first drops into the river.
    walker.group.visible = !state.riding && !playerBody && !boat;
    const swimPace = swimming ? Math.min(1, velocity / 1.6) : 0;
    const surface = glide ? glide.y : swimming ? WATER_LEVEL - 1.25 + swimPace * 0.44 : groundHeight(state.x, state.z) - 0.02;
    if (!glide && bodyY > surface + 0.08) {
      fallV -= 18 * dt;
      bodyY = Math.max(surface, bodyY + fallV * dt);
      if (bodyY === surface && swimming) splash(state.x, state.z, now, Math.min(2, -fallV / 6));
    } else { bodyY = surface; fallV = 0; }
    walker.group.position.set(state.x, bodyY + jumpY + (swimming ? Math.sin(time * 2.3) * 0.04 : 0), state.z);
    walker.group.rotation.y = state.angle;
    canopy.visible = glide?.phase === 'chute';
    if (glide?.phase === 'chute') {
      const open = Math.min(1, (now - glide.since) / 600);
      canopy.position.set(state.x, glide.y, state.z);
      canopy.rotation.set(0, state.angle, -horizontalInput * 0.25, 'YXZ');
      canopy.scale.set(0.25 + 0.75 * open, 0.4 + 0.6 * open, 0.4 + 0.6 * open);
    }
    helm.group.visible = boat === boats.rental;
    if (swimming && moving && now > splashAt) { splashAt = now + 380; effects.smoke(state.x - Math.sin(state.angle) * 0.6, WATER_LEVEL + 0.1, state.z - Math.cos(state.angle) * 0.6, now, false, '#eef6f4'); }
    const twoHanded = weapon === 'shotgun' || weapon === 'smg' || weapon === 'rpg' || weapon === 'grenade';
    const arrestTime = down === 'busted' ? now - bustedAt : -1;
    const kneeling = arrestTime > 900;
    const handsUp = surrendered || (arrestTime >= 0 && !kneeling);
    animateWalker(dt, now, time, moving && active && !state.riding, { twoHanded, kneeling, handsUp, armed: armed && now < aimUntil + 600 && !swimming && !glide, swim: swimming ? 0.25 + swimPace * 0.75 : 0, sky: glide ? glide.phase : null });
    for (const cuff of cuffs) cuff.visible = kneeling;
    for (const [id, gun] of guns) gun.group.visible = id === weapon && !kneeling && !handsUp && !swimming && !glide;
    const onBike = state.riding && !playerCar;
    rider.group.visible = onBike;
    seatHolder.visible = !!playerCar && state.riding;
    // Two wheels bank into the corner by the angle that balances it (tan = speed x turn rate / g);
    // the rider hangs a little further inside. A positive roll tips the top towards a right turn.
    const twoWheelsNow = state.riding && (!playerCar || playerCar.kind === 'moto');
    const balance = twoWheelsNow ? THREE.MathUtils.clamp(Math.atan(velocity * yawRate / 9.81), -0.5, 0.5) * (!playerCar && bikeId === 'horse' ? 0.3 : 1) : 0;
    lean = THREE.MathUtils.damp(lean, balance, 7, dt);
    if (playerCar && state.riding) {
      const moto = playerCar.kind === 'moto';
      // The seated figure's hip lands on the vehicle's seat: the saddle, or the left-hand driver's seat
      // (shrunk a little so the head clears a car roof). Vehicle models stand 0.04 m into the ground.
      const fit = moto ? 1 : 0.82;
      const seat = seatOf(playerCar);
      seatHolder.scale.setScalar(BIKE_SCALE * fit);
      if (moto) footing(seated, vehicleStyle(playerCar) as MotoStyle);
      else { seated.limbLeft.rotation.x = seated.limbRight.rotation.x = -1.4; seated.kneeLeft.rotation.x = seated.kneeRight.rotation.x = 1.35; }
      const lx = seat[0], ly = seat[1] - fit * MOTO_RIDER.hip[1] - 0.04, lz = seat[2] - fit * MOTO_RIDER.hip[2];
      const c = Math.cos(playerCar.yaw), s = Math.sin(playerCar.yaw);
      seatHolder.position.set(playerCar.x + lx * c + lz * s, groundHeight(playerCar.x, playerCar.z) + ly, playerCar.z - lx * s + lz * c);
      seatHolder.rotation.set(0, playerCar.yaw, moto ? lean : 0, 'YXZ');
      seated.body.rotation.z = moto ? lean * 0.25 : 0;
      const drawing = armed && now < aimUntil;
      seated.armRight.rotation.x = drawing ? -Math.PI / 2 : moto ? -1 : -1.15;
      seated.armLeft.rotation.x = moto ? -1 : -1.15;
      seated.group.rotation.y = drawing ? angleLerp(0, aimYaw - playerCar.yaw, 0.6) : 0;
    }
    rider.armRight.rotation.x = armed && now < aimUntil ? -Math.PI / 2 : -1;
    rider.group.rotation.y = armed && now < aimUntil ? angleLerp(0, aimYaw - state.angle, 0.6) : 0;
    passenger.group.visible = passengerAboard && onBike && bikeId !== 'horse';
    const bikeBroken = bikeHealth <= 0;
    rider.body.rotation.z = onBike ? lean * 0.25 : 0;
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
    youLabel.position.set(scratch.x, glide ? glide.y + 2.3 : swimming ? WATER_LEVEL + 1.2 : boat ? WATER_LEVEL + 2.4 : inCar() ? 3.1 : state.riding ? 2.6 : 2.3, scratch.z);
    youLabel.visible = street;

    // Mission marker, shopkeeper and receiver.
    pin.position.y = 2.7 + Math.sin(time * 2.5) * 0.2;
    pin.rotation.y = time * 0.35;
    missionRing.ring.scale.setScalar(1 + Math.sin(time * 2.5) * 0.045);
    for (const [ring, phase] of [[storeRing, 1.5], [bikeShopRing, 3], [hospitalRing, 4.5]] as const) ring.ring.scale.setScalar(1 + Math.sin(time * 2.5 + phase) * 0.045);
    venueDoors.forEach((door, i) => door.ring.ring.scale.setScalar(1 + Math.sin(time * 2.5 + i) * 0.045));
    activityRings.forEach((ring, i) => ring.ring.scale.setScalar(1 + Math.sin(time * 2.5 + i * 0.7) * 0.045));
    const mission = missions.view();
    const coffeePickup = mission.id === 'coffee' && mission.status === 'active' && mission.step === 0;
    shopkeeperCup.visible = coffeePickup;
    shopkeeper.armRight.rotation.x = coffeePickup && distance(PICKUP) < 14 ? -1.4 + Math.sin(time * 3) * 0.08 : 0;
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
      receiver.armRight.rotation.set(happy ? -1.3 : near ? -2.8 : 0, 0, happy ? 0 : near ? Math.sin(time * 9) * 0.35 : 0);
      receiver.group.position.y += happy ? Math.abs(Math.sin(time * 7)) * 0.08 : 0;
    }

    effects.beginBlobs();
    if (walker.group.visible) effects.blob(state.x, groundHeight(state.x, state.z) + 0.02, state.z, 0.9 * Math.max(0.5, 1 - jumpY * 0.35));
    if (!playerCar || bikeX !== state.x) effects.blob(bikeX, groundHeight(bikeX, bikeZ) + 0.02, bikeZ, bikeId === 'horse' ? 1.2 : 0.9, bikeId === 'horse' ? 2.6 : 2.1, bikeAngle);
    for (const person of [shopkeeper.group, receiver.group]) if (person.visible) effects.blob(person.position.x, person.position.y + 0.04, person.position.z, 0.9);
    for (const car of vehicles.cars) {
      // A recycled wreck is a fresh vehicle again.
      if (wrecks.has(car) && car.health > 0) wrecks.delete(car);
      if (car.mode === 'off') continue;
      const moto = car.kind === 'moto';
      effects.blob(car.x, groundHeight(car.x, car.z) + 0.02, car.z, moto ? 0.9 : 2.6, moto ? 2.1 : 5.2, car.yaw);
      if ((car.mode === 'lane' || car.mode === 'chase' || car.mode === 'leave') && Math.abs(car.speed) > 2) {
        ragdolls.push(car.x + Math.sin(car.yaw) * (moto ? 1 : 2.2), car.z + Math.cos(car.yaw) * (moto ? 1 : 2.2), moto ? 0.8 : 1.4, Math.sin(car.yaw) * car.speed, 1.5, Math.cos(car.yaw) * car.speed);
      }
    }
    updatePeers(now, time);
    npcs.forEachStanding((x, z, npc) => effects.blob(x, npc.y + 0.02, z, 0.85));
    police.forEachUnit((x, z, onFoot) => { if (onFoot) effects.blob(x, groundHeight(x, z) + 0.02, z, 0.85); });
    animals.forEachShadow((x, z, size) => effects.blob(x, groundHeight(x, z) + 0.02, z, size, size * 1.6));
    effects.endBlobs();
    ragdolls.update(dt);

    // Smoke from damaged vehicles, and bleeding stumps.
    if (now > smokeAt) {
      smokeAt = now + 140;
      const bikeFraction = bikeHealth / bikeById(bikeId).health;
      if (bikeFraction < 0.35 && bikeId !== 'horse') effects.smoke(bikeX, 0.9, bikeZ, now, bikeFraction <= 0);
      for (const car of vehicles.cars) {
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
    desiredTarget.set(street ? (follow ? follow.x : state.x) : -3, glide && street ? glide.y + 1.2 : 1, street ? (follow ? follow.z : state.z) : -5);
    cameraTarget.lerp(desiredTarget, cameraBlend);
    const viewBlend = 1 - Math.exp(-dt * 14);
    // The camera closes in on an arrest.
    if (down === 'busted') view.dist = Math.min(view.dist, 14);
    smoothView.yaw += (view.yaw - smoothView.yaw) * viewBlend;
    smoothView.pitch += (view.pitch - smoothView.pitch) * viewBlend;
    smoothView.dist += (view.dist - smoothView.dist) * viewBlend;
    if (interior) {
      const shot = interiors.view(interior, productFocus);
      const glide = 1 - Math.exp(-dt * 4);
      camera.position.lerp(shot.eye, glide);
      interiorLook.lerp(shot.look, glide);
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
    camera.lookAt(interior ? interiorLook : cameraTarget);
    const sway = !interior && now < drunkUntil ? Math.min(1, (drunkUntil - now) / 20000) : 0;
    if (sway > 0) camera.rotateZ(Math.sin(now / 900) * 0.06 * sway);
    const fov = interior ? 52 : 42 + (state.riding ? Math.min(1, Math.abs(velocity) / 26) * 10 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-dt * 12);
    }
    camera.updateMatrixWorld();
    // Buildings between the camera and the player open up around them.
    world.focus(camera, desiredTarget.x, glide ? glide.y + 1.1 : groundHeight(desiredTarget.x, desiredTarget.z) + 1.1, desiredTarget.z, dt, street && !interior);

    // Floating health bars over anyone hurt recently, and speech bubbles.
    effects.beginBars(camera);
    npcs.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    if (zombieMode) zombies.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    police.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    for (const peer of peers.values()) {
      const peerHealth = Math.max(0, (peer.target.health ?? MAX_HEALTH) - peer.predicted);
      if (!peer.target.down && (peerHealth < MAX_HEALTH || time - peer.hurtAt < 4)) effects.bar(peer.group.position.x, 2.25, peer.group.position.z, peerHealth / MAX_HEALTH);
    }
    effects.endBars();
    bubbles.update(now, cameraTarget.x, cameraTarget.z);
    effects.update(now, dt);
    canvas.style.cursor = interior ? (productHover ? 'pointer' : '') : !active ? '' : rotating ? 'grabbing' : armed ? 'none' : '';
    if (!covered) {
      world.update(time);
      sky.update(camera, time, atmosphere.sunDirection, atmosphere.tint, atmosphere.cover, 1 - atmosphere.night);
      renderer.render(scene, camera);
    }
    if (now - hudTime >= 120) {
      hudTime = now;
      emitHud(now);
    }
    frame = requestAnimationFrame(update);
  }
  setMissionLabel();
  emitHud(performance.now());
  frame = requestAnimationFrame(update);

  function rebuildBike(id: BikeId) {
    bike.group.remove(rider.group);
    bike.group.remove(passenger.group);
    scene.remove(bike.group);
    disposeTree(bike.group);
    bikeId = id;
    bike = makeBike(id, bikeById(id).color);
    rider.group.position.y = id === 'horse' ? HORSE_SEAT : (MOTO_RIDER.hip[1] - 1.04 * PERSON_SCALE) / BIKE_SCALE;
    if (id === 'horse') { rider.limbLeft.rotation.x = rider.limbRight.rotation.x = -0.65; rider.kneeLeft.rotation.x = rider.kneeRight.rotation.x = 0.55; }
    else footing(rider, id);
    bike.group.add(rider.group, passenger.group);
    scene.add(bike.group);
    bikeHealth = bikeById(id).health;
  }

  // Local development only: a handle for automated checks and screenshots (teleport, camera, clock, stats).
  if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    (window as unknown as Record<string, unknown>).__pvo = {
      tp: (x: number, z: number, angle = 0) => { Object.assign(state, { x, z, angle, riding: false }); bodyY = groundHeight(x, z); cameraTarget.set(x, 1, z); },
      ride: (x: number, z: number, angle: number) => { bikeX = x; bikeZ = z; bikeAngle = angle; Object.assign(state, { x, z, angle, riding: true }); velocity = 0; cameraTarget.set(x, 1, z); },
      view: (yaw: number, pitch: number, dist: number) => { Object.assign(view, { yaw, pitch, dist }); manualCameraAt = performance.now() + 1e9; },
      hours: (h: number) => atmosphere.setHours(h),
      weather: (w: Weather) => atmosphere.setWeather(w),
      cash: (c: number) => { cash = c; },
      weapon: (id: WeaponId) => { owned.add(id); ammo.set(id, { mag: 30, reserve: 90 }); equip(id); },
      stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, fps: monitor.fps }),
      info: () => ({ x: state.x, z: state.z, riding: state.riding, swimming, boat: !!boat, glide: glide ? { ...glide } : null, down, wanted: police.wanted, cash, hint: notification }),
      scene, camera, renderer, npcs, vehicles, police, ragdolls,
    };
  }
  return {
    /** Opens (or closes, with null) a shop interior: the camera cuts inside and the player stands at the door. */
    setInterior(kind: InteriorKind | null) {
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
      const e = def.effect;
      const now = performance.now();
      if (e.full) health = MAX_HEALTH;
      else if (e.heal) health = Math.min(MAX_HEALTH, health + e.heal);
      if (e.drunk) drunkUntil = Math.max(drunkUntil, now) + e.drunk * 1000;
      if (e.score) state.score += e.score;
      if (e.hours) atmosphere.setHours(atmosphere.hours + e.hours);
      if (e.wakeAt !== undefined) atmosphere.setHours(e.wakeAt);
      let hidden = false;
      if (e.hide !== undefined && police.wanted > 0 && police.wanted <= e.hide) { police.reset(); hidden = true; }
      dip();
      const parts = [e.full ? 'hồi đầy máu' : e.heal ? `+${e.heal} máu` : '', e.score ? `+${e.score} điểm` : '', e.drunk ? 'hơi say' : '', hidden ? 'cảnh sát đã mất dấu bạn' : ''].filter(Boolean);
      notify(`${def.name} · ${VENUE_SERVICES[venue].title.toLowerCase()} xong${parts.length ? ` · ${parts.join(', ')}` : ''}`, 3500);
      emitHud(now);
      return null;
    },
    /** Points the shop camera at one product (an item hovered in the shop panel), or back at the shop. */
    focusProduct(id: string | null) {
      productFocus = id;
      interiors.setHovered(id ?? productHover);
    },
    setActive(value: boolean) { active = value; previousTime = performance.now(); clearKeys(); rotating = null; touches.clear(); if (!value && !state.riding) velocity = 0; },
    /** A game is running (true from the start of a session until it is left), whatever overlay is open. */
    setStarted(value: boolean) { started = value; },
    /** An opaque overlay covers the whole street (the big map): skips drawing until it closes. */
    setCovered(value: boolean) { covered = value; },
    getState(): PlayerState {
      return {
        ...state, health: Math.ceil(health), weapon, vehicle: vehicleKind(), down: down === 'wasted',
        firing: performance.now() < firingUntil, wanted: police.wanted,
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
      else { levelFailures.clear(); levelBlockedUntil.clear(); }
      emitHud(performance.now());
    },
    reset(mode: GameMode = 'city') {
      if (playerCar) { playerCar.mode = 'parked'; playerCar = null; }
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
      vehicles.dispose();
      ragdolls.dispose();
      effects.dispose();
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
