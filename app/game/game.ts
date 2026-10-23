import * as THREE from 'three';
import { buildWorld, groundHeight } from './world';
import { createRagdolls, type RagdollBody, type RagdollLook } from './ragdoll';
import { createNpcs } from './npcs';
import { createEffects, makeGun } from './effects';
import { playShot, playThud, unlockAudio } from './audio';
import { WEAPONS, weaponById, type WeaponId } from './weapons';
import { createMissions, type MissionEvent, type MissionId, type MissionView } from './missions';
import { BIKES, CAR_STATS, POLICE_CAR_STATS, bikeById, repairCost, type BikeId } from './bikes';
import { createVehicles, makeCarMesh, CAR_HEALTH, POLICE_CAR_HEALTH, type Car } from './vehicles';
import { createPolice } from './police';
import { createSky, HORIZON } from './sky';
import { MODE_LEVEL, QUALITY_LEVELS, createFrameMonitor, detectStartLevel, gpuName, isSoftwareGpu, type QualityMode } from './quality';
import { createPeerInterpolator, createSnapshotClock } from './peer-interpolation';
import type { PlayerState, PeerState, OutgoingHit, IncomingHit } from '../../lib/multiplayer-protocol';

export type VehicleKind = 'foot' | 'scooter' | 'car' | 'police';
export type { PlayerState, PeerState, OutgoingHit, IncomingHit } from '../../lib/multiplayer-protocol';
export type Hud = {
  speed: number; riding: boolean; score: number; mission: string; missionStep: number; missionInfo: MissionView; hint: string; x: number; z: number;
  cash: number; deliveries: number; weapon: WeaponId; owned: WeaponId[]; down: boolean; fps: number; quality: string; qualityMode: QualityMode;
  gpu: string; softwareGpu: boolean;
  health: number; wanted: number; banner: string; vehicle: VehicleKind; vehicleHealth: number;
  bike: BikeId; bikeHealth: number; bikeBroken: boolean; bikeX: number; bikeZ: number;
  targetX: number; targetZ: number; targetName: string; police: { x: number; z: number }[];
};
export type GameEvent = { type: 'store' } | { type: 'bikeshop' } | { type: 'bag'; open: boolean };

// Both on the sidewalk so the player never spawns in a traffic lane.
const START = { x: 12.6, z: 12.4 };
const BIKE_START = { x: 12.4, z: 14.2 };
const PICKUP = { x: -32, z: 7 };
const SHOPKEEPER = { x: -30, z: 13, yaw: Math.PI };
const RECEIVERS = [
  { name: 'Bưu điện', x: 54, z: -35 }, { name: 'Công viên', x: 28, z: -26 }, { name: 'Chợ An Hòa', x: -36.5, z: 35 },
  { name: 'Quảng trường', x: 36, z: 33 }, { name: 'Bờ sông', x: -20, z: -83.5 }, { name: 'Tiệm hoa', x: 32, z: 13.5 },
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
  const group = new THREE.Group();
  const shirt = material(color);
  const trousers = material('#293e4a');
  const skin = material('#dca878');
  const shoe = material('#f6ead2');
  const helmet = material(hair ?? '#fff4dc', hair ? 0.9 : 0.45);
  const limbLeft = new THREE.Group();
  const limbRight = new THREE.Group();
  limbLeft.position.set(-0.26, 1.04, 0);
  limbRight.position.set(0.26, 1.04, 0);
  group.add(limbLeft, limbRight);
  box(limbLeft, [0.32, 0.85, 0.36], [0, -0.43, 0], trousers);
  box(limbRight, [0.32, 0.85, 0.36], [0, -0.43, 0], trousers);
  box(limbLeft, [0.36, 0.19, 0.54], [0, -0.84, 0.09], shoe);
  box(limbRight, [0.36, 0.19, 0.54], [0, -0.84, 0.09], shoe);
  const body = box(group, [0.91, 0.91, 0.5], [0, 1.49, 0], shirt);
  if (!hair) box(group, [0.5, 0.65, 0.22], [0, 1.5, -0.35], material('#365e52'));
  sphere(group, 0.38, [0, 2.18, 0.03], skin);
  const cap = sphere(group, 0.405, [0, 2.32, hair ? -0.04 : 0], helmet);
  cap.scale.y = 0.65;
  if (!hair) box(group, [0.55, 0.08, 0.22], [0, 2.28, 0.37], helmet);
  box(group, [0.16, 0.08, 0.025], [-0.14, 2.19, 0.382], material('#3e342e'));
  box(group, [0.16, 0.08, 0.025], [0.14, 2.19, 0.382], material('#3e342e'));
  // Arms pivot at the shoulder so they can swing, steer, wave and aim.
  const armLeft = new THREE.Group();
  const armRight = new THREE.Group();
  armLeft.position.set(-0.57, 1.76, 0.04);
  armRight.position.set(0.57, 1.76, 0.04);
  group.add(armLeft, armRight);
  box(armLeft, [0.26, 0.72, 0.3], [0, -0.36, 0], shirt);
  box(armRight, [0.26, 0.72, 0.3], [0, -0.36, 0], shirt);
  sphere(armLeft, 0.16, [0, -0.73, 0], skin);
  sphere(armRight, 0.16, [0, -0.73, 0], skin);
  if (riding) {
    limbLeft.rotation.x = -0.65;
    limbRight.rotation.x = -0.65;
    armLeft.rotation.x = -1;
    armRight.rotation.x = -1;
    body.rotation.x = 0.06;
    // Rider sits inside the bike group, which is already scaled to BIKE_SCALE.
    group.scale.setScalar(PERSON_SCALE / BIKE_SCALE);
    group.position.set(0, 0.42, -0.3);
  } else group.scale.setScalar(PERSON_SCALE);
  return { group, limbLeft, limbRight, armLeft, armRight };
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
    return { group, wheels: [] as THREE.Mesh[], legs };
  }
  const paint = material(color, 0.4);
  const cream = material('#f9e6c4', 0.5);
  const rubber = material('#293535');
  const chrome = new THREE.MeshStandardMaterial({ color: '#b8c8c4', roughness: 0.32, metalness: 0.65 });
  const seat = material('#493e37');
  const dark = material('#2b3230', 0.6);
  const wheels: THREE.Mesh[] = [];
  const reach = kind === 'sport' ? 1.28 : kind === 'cub' ? 1.15 : 1.17;
  for (const z of [-reach, reach]) {
    const wheel = cylinder(group, 0.57, 0.57, kind === 'sport' ? 0.38 : 0.3, [0, 0.58, z], rubber, 16);
    wheel.rotation.z = Math.PI / 2;
    wheels.push(wheel);
    const hub = cylinder(group, 0.31, 0.31, 0.32, [0, 0.58, z], chrome, 12);
    hub.rotation.z = Math.PI / 2;
  }
  if (kind === 'scooter' || kind === 'vespa') {
    const rear = sphere(group, 0.83, [0, 0.95, -0.75], paint);
    rear.scale.set(kind === 'vespa' ? 0.95 : 0.77, kind === 'vespa' ? 0.85 : 0.75, kind === 'vespa' ? 1.05 : 1.16);
    box(group, [1.02, 0.18, 1.75], [0, 0.7, 0], paint);
    box(group, [0.88, 0.17, 1.15], [0, 0.81, 0.25], kind === 'vespa' ? chrome : cream);
    const front = box(group, [0.91, 1.25, 0.24], [0, 1.32, 0.77], paint);
    front.rotation.x = -0.16;
    const panel = box(group, [0.63, 0.85, 0.05], [0, 1.38, 0.935], cream);
    panel.rotation.x = -0.16;
    box(group, [0.93, 0.23, 1.22], [0, 1.45, -0.58], seat);
    const head = sphere(group, 0.31, [0, 1.97, 0.94], paint);
    head.scale.set(1.25, 1, 0.7);
    if (kind === 'vespa') box(group, [0.7, 0.08, 0.5], [0, 1.62, -1.2], chrome);
    box(group, [0.55, 0.15, 0.1], [0, 1.13, -1.54], material('#d95031'));
  } else if (kind === 'cub') {
    box(group, [0.34, 0.34, 1.9], [0, 1.0, 0.05], paint);
    const shield = box(group, [0.72, 0.95, 0.12], [0, 1.28, 0.72], paint);
    shield.rotation.x = -0.2;
    box(group, [0.62, 0.2, 1.1], [0, 1.42, -0.55], seat);
    box(group, [0.5, 0.3, 0.9], [0, 1.12, -0.95], paint);
    box(group, [0.45, 0.4, 0.5], [0, 0.75, 0.05], dark);
    box(group, [0.6, 0.35, 0.42], [0, 1.78, 1.15], material('#c9b48a'));
    box(group, [0.4, 0.12, 0.08], [0, 1.15, -1.42], material('#d95031'));
  } else {
    const tank = box(group, [0.72, 0.45, 0.9], [0, 1.52, 0.2], paint);
    tank.rotation.x = 0.1;
    const fairing = box(group, [0.78, 0.7, 0.5], [0, 1.5, 0.95], paint);
    fairing.rotation.x = -0.5;
    const screen = box(group, [0.55, 0.3, 0.06], [0, 1.95, 1.08], material('#2b3a40', 0.2));
    screen.rotation.x = -0.6;
    box(group, [0.55, 0.15, 0.8], [0, 1.52, -0.55], seat);
    const tail = box(group, [0.45, 0.25, 0.7], [0, 1.62, -1.05], paint);
    tail.rotation.x = 0.25;
    box(group, [0.6, 0.55, 0.7], [0, 0.9, 0.1], dark);
    const pipe = cylinder(group, 0.09, 0.09, 0.9, [0.38, 0.85, -0.75], chrome, 8);
    pipe.rotation.x = Math.PI / 2;
  }
  const barY = kind === 'sport' ? 1.78 : 1.93;
  box(group, [1.37, 0.11, 0.13], [0, barY, 0.79], chrome);
  box(group, [0.28, 0.15, 0.2], [-0.72, barY + 0.01, 0.79], rubber);
  box(group, [0.28, 0.15, 0.2], [0.72, barY + 0.01, 0.79], rubber);
  const lamp = cylinder(group, 0.2, 0.2, 0.08, [0, kind === 'sport' ? 1.62 : 1.98, kind === 'sport' ? 1.22 : 1.13], material('#fff6c8', 0.3));
  lamp.rotation.x = Math.PI / 2;
  if (kind !== 'sport') {
    for (const x of [-0.61, 0.61]) {
      const stalk = cylinder(group, 0.035, 0.035, 0.48, [x, 2.17, 0.78], chrome, 6);
      stalk.rotation.z = x < 0 ? -0.2 : 0.2;
      const mirror = sphere(group, 0.18, [x * 1.08, 2.4, 0.78], chrome);
      mirror.scale.set(1, 0.7, 0.27);
    }
  }
  if (riderColor) group.add(makePerson(riderColor, true).group);
  group.scale.setScalar(BIKE_SCALE);
  group.traverse((o) => { o.castShadow = false; });
  return { group, wheels, legs: [] as THREE.Group[] };
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

function angleGap(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
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
  car: THREE.Mesh | null;
  carKind: VehicleKind;
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
  // The street never moves, so its shadows are rendered once instead of every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.domElement.setAttribute('aria-label', 'Khu phố Việt Nam 3D. WASD để di chuyển, E để tương tác, chuột phải để xoay camera.');
  container.appendChild(renderer.domElement);
  const gpu = gpuName(renderer.getContext());
  const softwareGpu = isSoftwareGpu(gpu);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 320);
  const hemi = new THREE.HemisphereLight('#fff2d2', '#789a8c', 2.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe5be', 3.7);
  sun.position.set(-42, 75, 20);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 190;
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0001;
  scene.add(sun);
  const sky = createSky(scene);
  const world = buildWorld(scene);

  function worldClear(x: number, z: number, radius: number) {
    if (Math.abs(x) > 85 - radius || Math.abs(z) > 85 - radius) return false;
    for (const collider of world.colliders) {
      const nearX = Math.max(collider.minX, Math.min(collider.maxX, x));
      const nearZ = Math.max(collider.minZ, Math.min(collider.maxZ, z));
      if ((x - nearX) ** 2 + (z - nearZ) ** 2 < radius * radius) return false;
    }
    return true;
  }

  /** Distance along a ray to the first building wall, treating colliders as infinitely tall. */
  function wallDistance(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number) {
    let best = maxT;
    for (const c of world.colliders) {
      let enter = 0, exit = best;
      for (const [o, d, min, max] of [[origin.x, dir.x, c.minX, c.maxX], [origin.z, dir.z, c.minZ, c.maxZ]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < min || o > max) { enter = Infinity; break; }
          continue;
        }
        let t1 = (min - o) / d, t2 = (max - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        enter = Math.max(enter, t1);
        exit = Math.min(exit, t2);
      }
      if (enter <= exit && enter > 0 && enter < best) best = enter;
    }
    return best;
  }
  const sightOrigin = new THREE.Vector3(), sightDir = new THREE.Vector3();
  function lineOfSight(x1: number, z1: number, x2: number, z2: number) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    if (d < 0.01) return true;
    sightOrigin.set(x1, 1.2, z1);
    sightDir.set((x2 - x1) / d, 0, (z2 - z1) / d);
    return wallDistance(sightOrigin, sightDir, d) >= d - 0.05;
  }

  const ragdolls = createRagdolls(scene, world.colliders, groundHeight);
  const effects = createEffects(scene, groundHeight);
  const npcs = createNpcs(scene, ragdolls, (x, z) => effects.pool(x, z));
  const vehicles = createVehicles(scene, worldClear);
  const police = createPolice(scene, vehicles, ragdolls, { clear: worldClear, sight: lineOfSight, ground: groundHeight });

  const walker = makePerson();
  scene.add(walker.group);
  let bikeId: BikeId = 'scooter';
  let bike = makeBike(bikeId, bikeById(bikeId).color);
  const rider = makePerson('#ed763e', true);
  rider.group.visible = false;
  bike.group.add(rider.group);
  scene.add(bike.group);
  const youLabel = makeLabel('BẠN', '#fff4da', '#245442');
  youLabel.scale.set(2.4, 0.6, 1);
  scene.add(youLabel);
  const guns = new Map<WeaponId, { group: THREE.Group; muzzle: THREE.Object3D }>();
  for (const id of ['pistol', 'shotgun', 'smg'] as const) {
    const gun = makeGun(id);
    gun.group.rotation.x = Math.PI / 2;
    gun.group.position.set(0, -0.74, 0.06);
    gun.group.visible = false;
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.1, gun.length);
    gun.group.add(muzzle);
    walker.armRight.add(gun.group);
    guns.set(id, { group: gun.group, muzzle });
  }
  walker.group.traverse((o) => { o.castShadow = false; });

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
  const storeRing = makeRing('#3f6f9f', '#1d3f63', 2);
  const storeLabel = makeLabel('TIỆM SÚNG', '#2f4a6b');
  storeLabel.position.y = 3.4;
  storeRing.group.add(storeLabel);
  storeRing.group.position.set(STORE.x, 0, STORE.z);
  scene.add(storeRing.group);
  const bikeShopRing = makeRing('#5e927c', '#2f5a48', 2);
  const bikeShopLabel = makeLabel('CỬA HÀNG XE MÁY', '#2f5a48');
  bikeShopLabel.position.y = 3.4;
  bikeShopRing.group.add(bikeShopLabel);
  bikeShopRing.group.position.set(BIKE_SHOP.x, 0, BIKE_SHOP.z);
  scene.add(bikeShopRing.group);
  for (const object of [marker, storeRing.group, bikeShopRing.group]) object.traverse((o) => { o.castShadow = false; });

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
  let disposed = false;
  const missions = createMissions();
  let missionLabelKey = '';
  let receiverHappyUntil = 0;
  let receiverSpot: { x: number; z: number } | null = null;
  let velocity = 0;
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
  let playerBody: RagdollBody | null = null;
  let downReason: 'crash' | 'wasted' | null = null;
  let downUntil = 0;
  let lastShot = 0;
  let firingUntil = 0;
  let aimUntil = 0;
  let punchUntil = 0;
  let triggerQueued = false;
  let triggerSource: 'mouse' | 'key' = 'key';
  let mouseHeld = false;
  let pointerInside = false;
  let shake = 0;
  let bagOpen = false;
  let manualCameraAt = -99;
  let smokeAt = 0;
  let gunfireCrimeAt = 0;
  const looseBodies: { body: RagdollBody; until: number }[] = [];
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
  const hitPoint = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const playerPoint = new THREE.Vector3();

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
  function applyLevel(next: number) {
    level = THREE.MathUtils.clamp(next, 0, QUALITY_LEVELS.length - 1);
    const preset = QUALITY_LEVELS[level];
    if (sun.castShadow !== preset.shadows || (preset.shadows && sun.shadow.mapSize.x !== preset.shadowSize)) {
      sun.castShadow = preset.shadows;
      if (preset.shadows) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      }
      renderer.shadowMap.needsUpdate = true;
    }
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

  /** World and parked/moving cars, ignoring the car the player is driving. */
  function clearAt(x: number, z: number, radius: number) {
    return worldClear(x, z, radius) && !vehicles.blocked(x, z, radius, playerCar);
  }

  /** A vehicle footprint approximated by three circles along its length. */
  function vehicleClear(x: number, z: number, angle: number) {
    const fx = Math.sin(angle), fz = Math.cos(angle);
    if (playerCar) return clearAt(x, z, 1.05) && clearAt(x + fx * 1.3, z + fz * 1.3, 1.0) && clearAt(x - fx * 1.3, z - fz * 1.3, 1.0);
    return clearAt(x, z, 0.45) && clearAt(x + fx * 0.65, z + fz * 0.65, 0.35) && clearAt(x - fx * 0.65, z - fz * 0.65, 0.35);
  }

  function notify(text: string, duration = 2500) {
    notification = text;
    notificationUntil = performance.now() + duration;
  }
  function showBanner(text: string, now: number) {
    banner = text;
    bannerUntil = now + 3200;
  }

  function isMotorbike() {
    return state.riding && playerCar === null && bikeId !== 'horse';
  }

  function missionPlayer() {
    return { x: state.x, z: state.z, riding: missions.view().requiresBike ? isMotorbike() : state.riding, down: playerBody !== null };
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
    for (const [gunId, gun] of guns) gun.group.visible = gunId === id;
    return true;
  }

  function vehicleKind(): VehicleKind {
    return playerCar ? (playerCar.kind === 'police' ? 'police' : 'car') : state.riding ? 'scooter' : 'foot';
  }

  function damagePlayer(amount: number, now: number, from?: { x: number; z: number }, by?: string) {
    if (playerBody && downReason === 'wasted') return;
    health = Math.max(0, health - amount);
    lastDamage = now / 1000;
    shake = Math.max(shake, 0.25);
    const dx = from ? state.x - from.x : 0, dz = from ? state.z - from.z : 0, d = Math.hypot(dx, dz) || 1;
    effects.blood(hitPoint.set(state.x, playerCar ? 1.3 : 1.1, state.z), rayDir.set(dx / d, 0, dz / d), playerCar ? 2 : 5);
    if (health <= 0) wasted(now, by);
  }

  function damageVehicle(amount: number) {
    if (playerCar) {
      playerCar.health = Math.max(0, playerCar.health - amount);
      if (playerCar.health === 0) notify('Xe đã hỏng! Nhấn E để xuống xe.', 3000);
    } else {
      const wasRunning = bikeHealth > 0;
      bikeHealth = Math.max(0, bikeHealth - amount);
      if (wasRunning && bikeHealth === 0) notify(bikeId === 'horse' ? 'Ngựa đã kiệt sức! Chữa trị hoặc mua mới ở Cửa hàng xe máy.' : 'Xe máy đã hỏng! Mua xe mới hoặc sửa ở Cửa hàng xe máy.', 4500);
    }
  }

  function leaveVehicleNow() {
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

  function wasted(now: number, by?: string) {
    interruptRace('Bạn đã bị hạ gục. Nhấn M để thử lại vòng đua.');
    leaveVehicleNow();
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = ragdolls.spawn({ x: state.x, y: groundHeight(state.x, state.z), z: state.z, yaw: state.angle, scale: RAGDOLL_SCALE, look: PLAYER_LOOK, velocity: { x: (Math.random() - 0.5) * 3, y: 2, z: (Math.random() - 0.5) * 3 } });
    downReason = 'wasted';
    downUntil = now + 3800;
    health = 0;
    showBanner('BỊ HẠ GỤC', now);
    notify(by ? `${by} đã hạ gục bạn` : 'Bạn đã bị hạ gục', 3800);
  }

  function respawn(now: number) {
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = null;
    downReason = null;
    const fee = Math.round(cash * 0.2);
    cash -= fee;
    police.reset();
    Object.assign(state, { x: START.x, z: START.z, riding: false, speed: 0 });
    health = MAX_HEALTH;
    notify(fee ? `Viện phí ${formatThousands(fee)}` : 'Bạn đã hồi phục', 3000);
    void now;
  }

  function busted(now: number) {
    interruptRace('Bạn đã bị bắt. Nhấn M để thử lại vòng đua.');
    leaveVehicleNow();
    const fine = Math.round(cash * 0.3);
    cash -= fine;
    police.reset();
    Object.assign(state, { x: START.x, z: START.z, riding: false, speed: 0 });
    health = MAX_HEALTH;
    showBanner('BỊ BẮT', now);
    notify(fine ? `Nộp phạt ${formatThousands(fine)}` : 'Bị cảnh cáo, lần sau cẩn thận!', 3500);
  }

  function nearestCar(maxDistance: number) {
    let best: Car | null = null, bestDistance = maxDistance;
    for (const car of vehicles.cars) {
      if (car.mode === 'off' || car.mode === 'player' || car.mode === 'chase' || car.mode === 'leave') continue;
      const d = Math.hypot(car.x - state.x, car.z - state.z);
      if (d < bestDistance) { best = car; bestDistance = d; }
    }
    return best;
  }

  function enterCar(car: Car, now: number) {
    const time = now / 1000;
    if (car.mode === 'lane' && car.driver) {
      // Carjacking: the driver is dragged out of the left door.
      const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
      const body = ragdolls.spawn({ x: car.x - rx * 1.4, y: groundHeight(car.x, car.z) + 0.3, z: car.z - rz * 1.4, yaw: car.yaw, scale: 0.7, look: car.driver, velocity: { x: -rx * 4.5, y: 2.5, z: -rz * 4.5 } });
      looseBodies.push({ body, until: time + 10 });
      npcs.alarm(car.x, car.z, 25, time);
      police.crime(2, time);
      notify('Cướp xe! Cảnh sát đang được gọi tới.', 3000);
      playThud();
    } else if (car.kind === 'police') {
      police.crime(4, time);
      notify('Bạn đã lấy xe cảnh sát!', 3000);
    }
    car.driver = null;
    car.mode = 'player';
    car.speed = 0;
    playerCar = car;
    state.riding = true;
    state.x = car.x;
    state.z = car.z;
    state.angle = car.yaw;
    velocity = 0;
  }

  function exitVehicle() {
    if (Math.abs(velocity) > 3) {
      notify('Hãy giảm tốc trước khi xuống xe');
      return;
    }
    const sideways = playerCar ? 2.3 : 1.3;
    const lengthwise = playerCar ? 3.2 : 1.8;
    const offsets = [new THREE.Vector3(-sideways, 0, 0), new THREE.Vector3(sideways, 0, 0), new THREE.Vector3(0, 0, -lengthwise), new THREE.Vector3(0, 0, lengthwise)];
    const leaving = playerCar;
    for (const offset of offsets) {
      offset.applyAxisAngle(UP, state.angle);
      // The car being left still blocks, so test with it excluded.
      if (worldClear(state.x + offset.x, state.z + offset.z, 0.4) && !vehicles.blocked(state.x + offset.x, state.z + offset.z, 0.4, leaving)) {
        if (leaving) {
          leaving.mode = 'parked';
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

  function action() {
    if (!active || playerBody) return;
    const now = performance.now();
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
    if (!state.riding && distance(STORE) < 3.5) { onEvent({ type: 'store' }); return; }
    if (!state.riding && distance(BIKE_SHOP) < 3.5) { onEvent({ type: 'bikeshop' }); return; }
    if (state.riding) { exitVehicle(); return; }
    const car = nearestCar(3.6);
    const bikeDistance = Math.hypot(state.x - bikeX, state.z - bikeZ);
    if (car && (bikeDistance > 2.6 || Math.hypot(car.x - state.x, car.z - state.z) < bikeDistance)) {
      if (car.health <= 0) { notify('Xe này đã hỏng, không chạy được.'); return; }
      enterCar(car, now);
      return;
    }
    if (bikeDistance < 2.6) {
      if (bikeHealth <= 0) { notify('Xe máy đã hỏng. Mua xe mới hoặc sửa ở Cửa hàng xe máy.', 3500); return; }
      state.riding = true;
      state.x = bikeX;
      state.z = bikeZ;
      state.angle = bikeAngle;
      velocity = 0;
    }
  }

  function cycleWeapon() {
    const list = WEAPONS.filter((w) => owned.has(w.id));
    const index = list.findIndex((w) => w.id === weapon);
    equip(list[(index + 1) % list.length].id);
  }

  function setInput(key: string, down: boolean) {
    const normalized = key.toLowerCase();
    if (down && !keys.has(normalized)) {
      if (normalized === 'e' || normalized === 'key e') action();
      if (normalized === 'f') { triggerQueued = true; triggerSource = 'key'; unlockAudio(); }
      if (normalized === 'q') cycleWeapon();
      if (normalized === 'v') Object.assign(view, CAMERA_DEFAULT);
      if (normalized === 'tab') setBag(true);
      const slot = Number(normalized);
      if (slot >= 1 && slot <= WEAPONS.length && !equip(WEAPONS[slot - 1].id)) notify(`Chưa có ${WEAPONS[slot - 1].name}. Mua ở Tiệm súng.`);
    }
    if (!down && normalized === 'tab') setBag(false);
    if (down) keys.add(normalized);
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
  }
  function onPointerDown(event: PointerEvent) {
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
      triggerSource = 'mouse';
      capture(event.pointerId);
    }
  }
  function onPointerMove(event: PointerEvent) {
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
        for (const id of ['pistol', 'shotgun', 'smg'] as const) {
          const gun = makeGun(id).group;
          gun.rotation.x = Math.PI / 2;
          gun.position.set(0, -0.74, 0.06);
          gun.visible = false;
          foot.armRight.add(gun);
          peerGuns.set(id, gun);
        }
        group.add(foot.group, peerBike.group, label);
        group.position.set(peer.x, 0, peer.z);
        foot.group.rotation.y = peer.angle;
        peerBike.group.rotation.y = peer.angle;
        group.traverse((o) => { o.castShadow = false; });
        scene.add(group);
        existing = { group, foot, bike: peerBike, car: null, carKind: 'foot', guns: peerGuns, label, target: { ...peer }, motion: createPeerInterpolator(), name: peer.name, color: peer.color, body: null, flashAt: 0, hurtAt: -99, predicted: 0 };
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

  function hitPeer(id: string, peer: Peer, damage: number, dx: number, dz: number, now: number) {
    if (peer.target.down) return;
    pendingHits.push({ target: id, damage: Math.round(damage), dx, dz });
    peer.hurtAt = now / 1000;
    peer.predicted += damage;
  }

  /** Picks the pedestrian, officer, player or body closest to the facing direction, for keyboard and touch aiming. */
  function autoAim(range: number, out: THREE.Vector3) {
    let bestGap = 0.42;
    let found = false;
    const consider = (x: number, y: number, z: number) => {
      const d = Math.hypot(x - state.x, z - state.z);
      if (d < 0.5 || d > range) return;
      const gap = angleGap(Math.atan2(x - state.x, z - state.z), state.angle);
      if (gap < bestGap) { bestGap = gap; out.set(x, y, z); found = true; }
    };
    npcs.forEachStanding((x, z) => consider(x, 1.0, z));
    police.forEachUnit((x, z, onFoot) => { if (onFoot) consider(x, 1.0, z); });
    for (const peer of peers.values()) if (!peer.target.down) consider(peer.group.position.x, 1.0, peer.group.position.z);
    ragdolls.forEach((body) => { if (body !== playerBody) { ragdolls.center(body, scratch); consider(scratch.x, scratch.y, scratch.z); } });
    return found;
  }

  function muzzle(out: THREE.Vector3) {
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
      npcs.damage(npc, def.damage, fx * def.force, 3.5, fz * def.force, time);
      effects.blood(hitPoint.set(nx, 1.4, nz), rayDir.set(fx, 0, fz), 4);
      police.crime(1, time);
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
    if (!hit) hit = ragdolls.push(cx, cz, 0.9, fx * 7, 3, fz * 7) > 0;
    if (hit) { playThud(); shake = Math.max(shake, 0.15); }
  }

  function fire(now: number, time: number) {
    const def = weaponById(weapon);
    lastShot = now;
    let haveTarget = false;
    if (triggerSource === 'mouse' && pointerInside) {
      raycaster.setFromCamera(pointerNdc, camera);
      const ray = raycaster.ray;
      if (ray.direction.y < -0.01) {
        aimPoint.copy(ray.origin).addScaledVector(ray.direction, (0.3 - ray.origin.y) / ray.direction.y);
        haveTarget = true;
      }
    } else haveTarget = autoAim(def.range, aimPoint);
    if (haveTarget) state.angle = Math.atan2(aimPoint.x - state.x, aimPoint.z - state.z);
    aimUntil = now + 800;
    if (def.id === 'fists') { punch(time, now); return; }
    firingUntil = now + 400;
    muzzle(rayOrigin);
    const horizontal = Math.max(1, Math.hypot(aimPoint.x - rayOrigin.x, aimPoint.z - rayOrigin.z));
    const slope = haveTarget ? THREE.MathUtils.clamp((aimPoint.y - rayOrigin.y) / horizontal, -0.7, 0.15) : -0.03;
    let hurtSomeone = false;
    for (let pellet = 0; pellet < def.pellets; pellet++) {
      const yaw = state.angle + (Math.random() - 0.5) * 2 * def.spread;
      rayDir.set(Math.sin(yaw), slope + (Math.random() - 0.5) * def.spread, Math.cos(yaw)).normalize();
      let maxT = wallDistance(rayOrigin, rayDir, def.range);
      if (rayDir.y < 0) maxT = Math.min(maxT, (groundHeight(rayOrigin.x, rayOrigin.z) + 0.02 - rayOrigin.y) / rayDir.y);
      // Every target type is tested and the nearest one along the ray takes the bullet.
      let best: { t: number; apply: () => void } | null = null;
      const consider = (t: number, apply: () => void) => { if (t < maxT && (!best || t < best.t)) best = { t, apply }; };
      const npcHit = npcs.raycast(rayOrigin, rayDir, maxT);
      if (npcHit) consider(npcHit.t, () => {
        npcs.damage(npcHit.npc, def.damage, rayDir.x * def.force, 2.5, rayDir.z * def.force, time);
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : 7);
        police.crime(1, time);
        hurtSomeone = true;
      });
      const officerHit = police.raycast(rayOrigin, rayDir, maxT);
      if (officerHit) consider(officerHit.t, () => {
        police.damage(officerHit.officer, def.damage, rayDir.x * def.force, 2.5, rayDir.z * def.force, time);
        effects.blood(hitPoint, rayDir, def.pellets > 1 ? 3 : 7);
      });
      const bodyHit = ragdolls.raycast(rayOrigin, rayDir, maxT);
      if (bodyHit) consider(bodyHit.t, () => {
        ragdolls.impulse(bodyHit.body, rayDir.x * def.force, 1.5 + Math.max(0, rayDir.y) * def.force, rayDir.z * def.force, bodyHit.index);
        effects.blood(hitPoint, rayDir, 3);
      });
      const carHit = vehicles.raycast(rayOrigin, rayDir, maxT);
      if (carHit && carHit.car !== playerCar) consider(carHit.t, () => {
        carHit.car.health = Math.max(0, carHit.car.health - def.damage * 0.5);
        if (carHit.car.kind === 'police') police.crime(2, time);
        if (carHit.car.health === 0 && carHit.car.mode === 'lane') carHit.car.mode = 'parked';
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
        });
      }
      const chosen = best as { t: number; apply: () => void } | null;
      const t = chosen ? chosen.t : maxT;
      hitPoint.copy(rayOrigin).addScaledVector(rayDir, t);
      if (chosen) chosen.apply();
      else effects.puff(hitPoint, now);
      effects.tracer(rayOrigin, hitPoint, now);
    }
    effects.flash(rayOrigin, now, def.id === 'shotgun' ? 1.1 : 0.75);
    playShot(def.id);
    shake = Math.max(shake, def.id === 'shotgun' ? 0.35 : def.id === 'smg' ? 0.1 : 0.15);
    npcs.alarm(state.x, state.z, 42, time);
    // Shooting near the police is a crime even if nobody gets hurt.
    let policeNear = false;
    police.forEachUnit((x, z) => { if (Math.hypot(x - state.x, z - state.z) < 35) policeNear = true; });
    if (!hurtSomeone && policeNear && time > gunfireCrimeAt) { police.crime(1, time); gunfireCrimeAt = time + 3; }
  }

  function crash(now: number) {
    interruptRace('Bạn đã ngã xe. Nhấn M để thử lại vòng đua.');
    const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    const speed = velocity;
    state.riding = false;
    bikeX = state.x;
    bikeZ = state.z;
    bikeAngle = state.angle;
    velocity = 0;
    playerBody = ragdolls.spawn({ x: state.x - fx * 0.2, y: groundHeight(state.x, state.z) + 0.55, z: state.z - fz * 0.2, yaw: state.angle, scale: RAGDOLL_SCALE, look: PLAYER_LOOK, velocity: { x: fx * speed * 0.5, y: 4 + speed * 0.15, z: fz * speed * 0.5 } });
    downReason = 'crash';
    downUntil = now + 2600;
    shake = 0.6;
    playThud();
    damagePlayer(10 + speed, now);
    effects.blood(hitPoint.set(state.x, 0.9, state.z), rayDir.set(fx, 0, fz), 6);
    if (downReason === 'crash') notify('Ngã xe! Đứng dậy sau giây lát…', 2600);
  }

  function standUp() {
    if (playerBody && !playerBody.removed) ragdolls.center(playerBody, scratch);
    else scratch.set(state.x, 0, state.z);
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = null;
    downReason = null;
    for (let ring = 0; ring < 8; ring++) {
      const r = ring * 0.6;
      for (let k = 0; k < 8; k++) {
        const x = scratch.x + Math.sin(k * Math.PI / 4) * r, z = scratch.z + Math.cos(k * Math.PI / 4) * r;
        if (clearAt(x, z, 0.4)) { state.x = x; state.z = z; return; }
      }
    }
  }

  /** Knocks over anyone in front of a moving vehicle. */
  function runOver(now: number, time: number) {
    const speed = Math.abs(velocity);
    if (speed < 4) return;
    const dir = Math.sign(velocity);
    const fx = Math.sin(state.angle) * dir, fz = Math.cos(state.angle) * dir;
    const reach = playerCar ? 2.2 : 0.9, radius = playerCar ? 1.5 : 0.9;
    const cx = state.x + fx * reach, cz = state.z + fz * reach;
    const thrown = (x: number, z: number) => {
      effects.blood(hitPoint.set(x, 1, z), rayDir.set(fx, 0, fz), 8);
      velocity *= playerCar ? 0.92 : 0.8;
      playThud();
      shake = Math.max(shake, 0.25);
      if (!playerCar) damageVehicle(4);
    };
    npcs.near(cx, cz, radius, (npc, nx, nz) => {
      if (npcs.damage(npc, speed * 5, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, time, true)) {
        thrown(nx, nz);
        police.crime(1, time);
      }
    });
    police.near(cx, cz, radius, (o) => {
      police.damage(o, speed * 5, fx * speed * 0.85, 3 + speed * 0.22, fz * speed * 0.85, time, true);
      thrown(o.x, o.z);
    });
    for (const [id, peer] of peers) {
      if (peer.target.down || peerVehicle(peer) !== 'foot') continue;
      if (Math.hypot(peer.group.position.x - cx, peer.group.position.z - cz) < radius && now - peer.hurtAt * 1000 > 800) {
        hitPeer(id, peer, Math.min(80, speed * 4), fx, fz, now);
        thrown(peer.group.position.x, peer.group.position.z);
      }
    }
    ragdolls.push(cx, cz, radius, fx * speed, 2 + speed * 0.1, fz * speed);
  }

  function emitHud(now: number) {
    const missionInfo = missions.view();
    const target = missionInfo.target;
    const nearMission = target !== null && distance(target) <= 6.5;
    const nearBike = !state.riding && Math.hypot(state.x - bikeX, state.z - bikeZ) < 2.6;
    const nearStore = !state.riding && distance(STORE) < 3.5;
    const nearBikeShop = !state.riding && distance(BIKE_SHOP) < 3.5;
    const car = !state.riding ? nearestCar(3.6) : null;
    const hint = now < notificationUntil ? notification
      : playerBody ? (downReason === 'wasted' ? 'Đang được đưa đi cấp cứu…' : 'Đang đứng dậy…')
      : nearMission && missionInfo.requiresOnFoot && state.riding ? 'Giảm tốc rồi nhấn E xuống xe để dọn rác'
      : nearMission && missionInfo.requiresBike && !isMotorbike() ? 'Hãy dùng xe máy để tham gia vòng đua'
      : nearMission ? missionInfo.objective
      : nearStore ? (deliveries ? 'Nhấn E để vào Tiệm súng' : 'Tiệm súng: hoàn thành 1 nhiệm vụ giao hàng để mở khóa')
      : nearBikeShop ? 'Nhấn E để vào Cửa hàng xe máy'
      : missionInfo.status !== 'active' ? 'Nhấn M để chọn nhiệm vụ mới hoặc chơi lại'
      : state.riding ? `W/S tiến lùi · A/D rẽ · Space phanh · E xuống xe`
      : car && (!nearBike) ? (car.mode === 'lane' ? 'Nhấn E để cướp xe (bị truy nã)' : car.health <= 0 ? 'Xe này đã hỏng' : 'Nhấn E để lên xe')
      : nearBike ? (bikeHealth > 0 ? (bikeId === 'horse' ? 'Nhấn E để cưỡi ngựa' : 'Nhấn E để lên xe máy') : bikeId === 'horse' ? 'Ngựa đã kiệt sức · Chữa ở Cửa hàng xe máy' : 'Xe máy đã hỏng · Mua xe mới ở Cửa hàng xe máy')
      : police.wanted ? 'Đang bị truy nã · Trốn khỏi tầm mắt cảnh sát để thoát'
      : weapon !== 'fists' ? 'Click / F bắn · Giữ Tab mở túi súng · Chuột phải xoay camera'
      : 'WASD di chuyển · Shift chạy · E tương tác · Giữ Tab mở túi súng';
    const policePoints: { x: number; z: number }[] = [];
    police.forEachUnit((x, z) => { if (policePoints.length < 10) policePoints.push({ x: Math.round(x), z: Math.round(z) }); });
    const vehicle = vehicleKind();
    const vehicleHealth = playerCar ? playerCar.health / (playerCar.kind === 'police' ? POLICE_CAR_HEALTH : CAR_HEALTH) : state.riding ? bikeHealth / bikeById(bikeId).health : -1;
    const hud: Hud = {
      speed: Math.round(velocity * 10) / 10, riding: state.riding, score: state.score,
      mission: missionInfo.objective, missionStep: missionInfo.step, missionInfo, hint,
      x: Math.round(state.x * 2) / 2, z: Math.round(state.z * 2) / 2,
      cash, deliveries, weapon, owned: WEAPONS.filter((w) => owned.has(w.id)).map((w) => w.id), down: playerBody !== null,
      fps: monitor.fps, quality: QUALITY_LEVELS[level].label, qualityMode, gpu, softwareGpu,
      health: Math.ceil(health), wanted: police.wanted, banner: now < bannerUntil ? banner : '', vehicle, vehicleHealth: Math.round(vehicleHealth * 100) / 100,
      bike: bikeId, bikeHealth: Math.round(bikeHealth / bikeById(bikeId).health * 100) / 100, bikeBroken: bikeHealth <= 0,
      bikeX: Math.round(bikeX), bikeZ: Math.round(bikeZ), targetX: target?.x ?? state.x, targetZ: target?.z ?? state.z, targetName: missionInfo.label, police: policePoints,
    };
    // React re-renders only when something visible changed.
    const key = JSON.stringify(hud);
    if (key === lastHud) return;
    lastHud = key;
    onHud(hud);
  }

  function driveVehicle(dt: number, now: number, time: number, throttle: number, steer: number, braking: boolean) {
    const stats = playerCar ? (playerCar.kind === 'police' ? POLICE_CAR_STATS : CAR_STATS) : bikeById(bikeId);
    const broken = playerCar ? playerCar.health <= 0 : bikeHealth <= 0;
    const input = broken ? 0 : throttle;
    if (braking) velocity = THREE.MathUtils.damp(velocity, 0, 7, dt);
    else if (input > 0) velocity = velocity < -0.3 ? THREE.MathUtils.damp(velocity, 0, 6, dt) : THREE.MathUtils.damp(velocity, stats.top, stats.accel, dt);
    else if (input < 0) velocity = velocity > 0.3 ? THREE.MathUtils.damp(velocity, 0, 5, dt) : THREE.MathUtils.damp(velocity, -stats.reverse, 1.8, dt);
    else velocity = THREE.MathUtils.damp(velocity, 0, broken ? 3 : 0.8, dt);
    if (Math.abs(velocity) < 0.02) velocity = 0;
    // A/D steer only; turning needs some speed and reverses when backing up.
    const grip = Math.min(1, Math.abs(velocity) / 4);
    state.angle -= steer * stats.turn * grip * Math.sign(velocity) * dt;
    const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    const dx = fx * velocity * dt, dz = fz * velocity * dt;
    let impact = 0;
    if (vehicleClear(state.x + dx, state.z + dz, state.angle)) { state.x += dx; state.z += dz; }
    else {
      // Slide along walls when glancing off them; the blocked component is the impact speed.
      if (vehicleClear(state.x + dx, state.z, state.angle)) state.x += dx;
      else impact = Math.max(impact, Math.abs(fx * velocity));
      if (vehicleClear(state.x, state.z + dz, state.angle)) state.z += dz;
      else impact = Math.max(impact, Math.abs(fz * velocity));
      if (!impact) impact = Math.abs(velocity) * 0.5;
      velocity *= Math.exp(-dt * 8);
    }
    if (impact > 6) {
      damageVehicle((impact - 6) * (playerCar ? 2.2 : 3.5));
      shake = Math.max(shake, Math.min(0.6, impact * 0.03));
      if (playerCar && impact > 14) damagePlayer((impact - 14) * 1.5, now);
      if (playerCar) velocity *= -0.25;
    }
    if (!playerCar && impact > CRASH_SPEED) { crash(now); return; }
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

  function walk(dt: number, now: number, vertical: number, horizontal: number) {
    // On foot, movement is relative to where the camera is looking.
    const forwardX = -Math.sin(smoothView.yaw), forwardZ = -Math.cos(smoothView.yaw);
    const dirX = forwardX * vertical - forwardZ * horizontal;
    const dirZ = forwardZ * vertical + forwardX * horizontal;
    const moving = horizontal !== 0 || vertical !== 0;
    const aiming = now < aimUntil;
    if (moving && !aiming) state.angle = angleLerp(state.angle, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * 15));
    const topSpeed = keys.has('shift') ? 6.8 : aiming ? 3.4 : 4.2;
    velocity = THREE.MathUtils.damp(velocity, moving ? topSpeed : 0, 12, dt);
    if (velocity < 0.025) velocity = 0;
    // While aiming the player strafes in the input direction instead of turning.
    const length = Math.hypot(dirX, dirZ) || 1;
    const headingX = aiming && moving ? dirX / length : Math.sin(state.angle);
    const headingZ = aiming && moving ? dirZ / length : Math.cos(state.angle);
    const dx = headingX * velocity * dt, dz = headingZ * velocity * dt;
    if (clearAt(state.x + dx, state.z, 0.4)) state.x += dx;
    if (clearAt(state.x, state.z + dz, 0.4)) state.z += dz;
    if (velocity > 0.5) ragdolls.push(state.x, state.z, 0.55, headingX * velocity * 1.2, 1.2, headingZ * velocity * 1.2);
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
      peer.group.position.y = groundHeight(x, z) - 0.02;
      peer.foot.group.rotation.y = pose.angle;
      peer.bike.group.rotation.y = peer.foot.group.rotation.y;
      const kind = peerVehicle(peer);
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
      peer.foot.group.visible = kind === 'foot' && !target.down;
      peer.bike.group.visible = kind === 'scooter' && !target.down;
      peer.label.position.y = kind === 'car' || kind === 'police' ? 3.1 : 2.6;
      const armed = target.weapon && target.weapon !== 'fists';
      for (const [id, gun] of peer.guns) gun.visible = id === target.weapon;
      const peerStride = Math.abs(pose.speed) > 1 ? Math.sin(time * 10) * 0.55 : 0;
      peer.foot.limbLeft.rotation.x = peerStride;
      peer.foot.limbRight.rotation.x = -peerStride;
      peer.foot.armRight.rotation.x = armed ? -Math.PI / 2 : -peerStride * 0.7;
      if (target.firing && kind === 'foot' && now - peer.flashAt > 160) {
        peer.flashAt = now;
        const a = peer.foot.group.rotation.y;
        scratch.set(x + Math.sin(a) * 0.9 + Math.cos(a) * 0.38, 1.25, z + Math.cos(a) * 0.9 - Math.sin(a) * 0.38);
        effects.flash(scratch, now, 0.7);
        if (target.weapon && target.weapon !== 'fists' && Math.hypot(x - state.x, z - state.z) < 60) playShot(target.weapon);
      }
      if (!target.down) {
        const vehicleBlob = kind === 'foot' ? [0.9, 0.9] : kind === 'scooter' ? [0.9, 2.1] : [2.4, 5];
        effects.blob(x, groundHeight(x, z) + 0.02, z, vehicleBlob[0], vehicleBlob[1], peer.foot.group.rotation.y);
      }
    }
  }

  function update(now: number) {
    if (disposed) return;
    const interval = now - previousTime;
    // Holding Tab for the weapon bag slows the street down, like a weapon wheel.
    const dt = Math.min(interval / 1000, 0.05) * (bagOpen ? 0.25 : 1);
    previousTime = now;
    adaptQuality(now, interval);
    const time = now / 1000;
    let moving = false;
    const def = weaponById(weapon);
    if (playerBody) {
      if (downReason === 'wasted') { if (now > downUntil) respawn(now); }
      else if (now > downUntil && (playerBody.asleep || playerBody.removed || now > downUntil + 2500)) standUp();
    }
    if (active && !playerBody) {
      let horizontal = 0;
      let vertical = 0;
      if (!focusedInput()) {
        if (keys.has('w') || keys.has('arrowup')) vertical += 1;
        if (keys.has('s') || keys.has('arrowdown')) vertical -= 1;
        if (keys.has('d') || keys.has('arrowright')) horizontal += 1;
        if (keys.has('a') || keys.has('arrowleft')) horizontal -= 1;
        if (keys.has('z')) { view.yaw += dt * 1.9; manualCameraAt = now; }
        if (keys.has('c')) { view.yaw -= dt * 1.9; manualCameraAt = now; }
      }
      const braking = keys.has(' ') || keys.has('space');
      if (state.riding) {
        driveVehicle(dt, now, time, vertical, horizontal, braking);
        moving = velocity !== 0;
      } else moving = walk(dt, now, vertical, horizontal);
      const wantsShot = triggerQueued || (def.auto && (mouseHeld || keys.has('f')));
      if (wantsShot && !bagOpen && now - lastShot >= 1000 / def.fireRate) {
        triggerQueued = false;
        if (state.riding) notify('Xuống xe để dùng vũ khí', 1500);
        else fire(now, time);
      }
      state.speed = velocity;
      if (time - lastDamage > 6 && health < MAX_HEALTH && police.wanted === 0) health = Math.min(MAX_HEALTH, health + dt * 4);
    } else {
      if (!state.riding) velocity = 0;
      state.speed = velocity;
      triggerQueued = false;
    }

    // Traffic and police react to where the player is now.
    vehicles.update(dt, time, { x: state.x, z: state.z, car: playerCar });
    const policeResult = police.update(dt, time, { x: state.x, z: state.z, car: playerCar, speed: Math.abs(velocity), down: playerBody !== null });
    for (const shot of policeResult.shots) {
      playerPoint.set(state.x, 1.1, state.z);
      if (!shot.hit) playerPoint.add(scratch.set((Math.random() - 0.5) * 2.5, Math.random() * 0.8, (Math.random() - 0.5) * 2.5));
      effects.tracer(shot.from, playerPoint, now);
      effects.flash(shot.from, now, 0.7);
      playShot('pistol');
      if (shot.hit) damagePlayer(playerCar ? 6 : 11, now, shot.from, 'Cảnh sát');
    }
    for (let i = 0; i < policeResult.strikes; i++) {
      damagePlayer(7, now, undefined, 'Cảnh sát');
      playThud();
      notify('Cảnh sát vụt dùi cui!', 1200);
    }
    if (policeResult.arrested && !playerBody) busted(now);
    for (let i = looseBodies.length - 1; i >= 0; i--) {
      if (time > looseBodies[i].until || looseBodies[i].body.removed) {
        ragdolls.remove(looseBodies[i].body);
        looseBodies.splice(i, 1);
      }
    }

    if (active && !document.hidden) handleMissionEvent(missions.update(Math.max(0, interval / 1000), missionPlayer()));

    const armed = weapon !== 'fists';
    walker.group.visible = !state.riding && !playerBody;
    walker.group.position.set(state.x, groundHeight(state.x, state.z) - 0.02, state.z);
    walker.group.rotation.y = state.angle;
    walkClock += Math.abs(velocity) * dt * 1.9;
    const stride = moving && active && !state.riding ? Math.sin(walkClock * 2) * 0.62 : 0;
    walker.limbLeft.rotation.x = stride;
    walker.limbRight.rotation.x = -stride;
    const twoHanded = weapon === 'shotgun' || weapon === 'smg';
    walker.armLeft.rotation.set(twoHanded ? -1.25 : -stride * 0.7, 0, twoHanded ? 0.45 : 0);
    walker.armRight.rotation.x = now < punchUntil ? -1.65 : armed ? -Math.PI / 2 : stride * 0.7;
    rider.group.visible = state.riding && !playerCar;
    const bikeBroken = bikeHealth <= 0;
    bike.group.position.set(bikeX, groundHeight(bikeX, bikeZ) + (bikeBroken && !state.riding ? 0.18 : -0.04), bikeZ);
    bike.group.rotation.set(0, bikeAngle, bikeBroken && !(state.riding && !playerCar) ? 1.35 : 0);
    if (!playerCar) for (const wheel of bike.wheels) wheel.rotation.x -= (state.riding ? velocity : 0) * dt / (0.57 * BIKE_SCALE);
    if (bike.legs.length) {
      const pace = state.riding && !playerCar ? Math.abs(velocity) : 0;
      gallop += pace * dt * 1.6;
      const amount = Math.min(1, pace / 4) * 0.65;
      bike.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(gallop + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.6) * amount; });
    }
    if (playerBody) ragdolls.center(playerBody, scratch);
    else scratch.set(state.x, 0, state.z);
    youLabel.position.set(scratch.x, playerCar ? 3.1 : state.riding ? 2.6 : 2.3, scratch.z);
    youLabel.visible = active;
    pin.position.y = 2.7 + Math.sin(time * 2.5) * 0.2;
    pin.rotation.y = time * 0.35;
    missionRing.ring.scale.setScalar(1 + Math.sin(time * 2.5) * 0.045);
    storeRing.ring.scale.setScalar(1 + Math.sin(time * 2.5 + 1.5) * 0.045);
    bikeShopRing.ring.scale.setScalar(1 + Math.sin(time * 2.5 + 3) * 0.045);
    const mission = missions.view();
    const coffeePickup = mission.id === 'coffee' && mission.status === 'active' && mission.step === 0;
    shopkeeperCup.visible = coffeePickup;
    shopkeeper.armRight.rotation.x = coffeePickup && distance(PICKUP) < 14 ? -1.4 + Math.sin(time * 3) * 0.08 : 0;
    const deliveryTarget = ['coffee', 'market', 'post'].includes(mission.id) && mission.step > 0 ? mission.target : null;
    const spot = now < receiverHappyUntil ? receiverSpot : deliveryTarget;
    const showReceiver = spot !== null;
    receiver.group.visible = showReceiver;
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
    if (walker.group.visible) effects.blob(state.x, groundHeight(state.x, state.z) + 0.02, state.z, 0.9);
    if (!playerCar || bikeX !== state.x) effects.blob(bikeX, groundHeight(bikeX, bikeZ) + 0.02, bikeZ, 0.9, 2.1, bikeAngle);
    for (const person of [shopkeeper.group, receiver.group]) if (person.visible) effects.blob(person.position.x, person.position.y + 0.04, person.position.z, 0.9);
    for (const car of vehicles.cars) {
      if (car.mode === 'off') continue;
      effects.blob(car.x, groundHeight(car.x, car.z) + 0.02, car.z, 2.6, 5.2, car.yaw);
      if (car.mode === 'lane' || car.mode === 'chase' || car.mode === 'leave') {
        if (Math.abs(car.speed) > 2) ragdolls.push(car.x + Math.sin(car.yaw) * 2.2, car.z + Math.cos(car.yaw) * 2.2, 1.4, Math.sin(car.yaw) * car.speed, 1.5, Math.cos(car.yaw) * car.speed);
      }
    }
    updatePeers(now, time);
    npcs.update(dt, time, groundHeight);
    npcs.forEachStanding((x, z) => effects.blob(x, groundHeight(x, z) + 0.02, z, 0.85));
    police.forEachUnit((x, z, onFoot) => { if (onFoot) effects.blob(x, groundHeight(x, z) + 0.02, z, 0.85); });
    effects.endBlobs();
    ragdolls.update(dt);

    // Smoke from damaged vehicles, including the parked bike.
    if (now > smokeAt) {
      smokeAt = now + 140;
      const bikeFraction = bikeHealth / bikeById(bikeId).health;
      if (bikeFraction < 0.35 && bikeId !== 'horse') effects.smoke(bikeX, 0.9, bikeZ, now, bikeFraction <= 0);
      for (const car of vehicles.cars) {
        if (car.mode === 'off') continue;
        const fraction = car.health / (car.kind === 'police' ? POLICE_CAR_HEALTH : CAR_HEALTH);
        if (fraction < 0.35) effects.smoke(car.x + Math.sin(car.yaw) * 1.8, 1.2, car.z + Math.cos(car.yaw) * 1.8, now, fraction <= 0);
      }
    }

    const cameraBlend = 1 - Math.exp(-dt * 4.5);
    const follow = playerBody ? scratch : null;
    desiredTarget.set(active ? (follow ? follow.x : state.x) : -3, 1, active ? (follow ? follow.z : state.z) : -5);
    cameraTarget.lerp(desiredTarget, cameraBlend);
    const viewBlend = 1 - Math.exp(-dt * 14);
    smoothView.yaw += (view.yaw - smoothView.yaw) * viewBlend;
    smoothView.pitch += (view.pitch - smoothView.pitch) * viewBlend;
    smoothView.dist += (view.dist - smoothView.dist) * viewBlend;
    if (active) {
      camDesired.copy(cameraTarget).add(offsetFor(smoothView.yaw, smoothView.pitch, smoothView.dist, cameraOffset));
      camera.position.lerp(camDesired, 1 - Math.exp(-dt * 10));
    } else {
      camDesired.copy(cameraTarget).add(offsetFor(CAMERA_DEFAULT.yaw, CAMERA_DEFAULT.pitch, 60, cameraOffset));
      camDesired.x += Math.sin(time * 0.05) * 5;
      camDesired.y += 13;
      camDesired.z += 12;
      camera.position.lerp(camDesired, cameraBlend);
    }
    camera.lookAt(cameraTarget);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-dt * 12);
    }
    camera.updateMatrixWorld();

    // Floating health bars over anyone hurt recently.
    effects.beginBars(camera);
    npcs.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    police.forEachHurt(time, (x, y, z, f) => effects.bar(x, y, z, f));
    for (const peer of peers.values()) {
      const peerHealth = Math.max(0, (peer.target.health ?? MAX_HEALTH) - peer.predicted);
      if (!peer.target.down && (peerHealth < MAX_HEALTH || time - peer.hurtAt < 4)) effects.bar(peer.group.position.x, 2.25, peer.group.position.z, peerHealth / MAX_HEALTH);
    }
    effects.endBars();
    effects.update(now, dt);
    canvas.style.cursor = !active ? '' : rotating ? 'grabbing' : armed && !state.riding ? 'crosshair' : '';
    world.update(time);
    sky.update(camera, time);
    renderer.render(scene, camera);
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
    scene.remove(bike.group);
    disposeTree(bike.group);
    bikeId = id;
    bike = makeBike(id, bikeById(id).color);
    rider.group.position.y = id === 'horse' ? HORSE_SEAT : 0.42;
    bike.group.add(rider.group);
    scene.add(bike.group);
    bikeHealth = bikeById(id).health;
  }

  return {
    setActive(value: boolean) { active = value; previousTime = performance.now(); clearKeys(); rotating = null; touches.clear(); if (!value && !state.riding) velocity = 0; },
    getState(): PlayerState {
      return {
        ...state, health: Math.ceil(health), weapon, vehicle: vehicleKind(), down: playerBody !== null && downReason === 'wasted',
        firing: performance.now() < firingUntil, wanted: police.wanted,
      };
    },
    /** Hits this player dealt since the last sync, at most eight. */
    takeHits() { return pendingHits.splice(0, 8); },
    receiveHits(hits: IncomingHit[]) {
      const now = performance.now();
      for (const hit of hits) {
        if (!Number.isFinite(hit.damage) || playerBody && downReason === 'wasted') continue;
        damagePlayer(hit.damage, now, { x: state.x - hit.dx, z: state.z - hit.dz }, hit.name);
        if (health > 0) notify(`${hit.name} tấn công bạn (−${Math.round(hit.damage)})`, 1800);
      }
    },
    setPeers,
    action,
    setInput,
    selectMission(id: MissionId) {
      missions.select(id, id === 'coffee' ? RECEIVERS[Math.floor(Math.random() * RECEIVERS.length)] : undefined);
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
      if (cash < def.price) return 'Chưa đủ tiền. Làm thêm nhiệm vụ để kiếm tiền nhé.';
      cash -= def.price;
      owned.add(id);
      equip(id);
      notify(`Đã mua ${def.name}! Click chuột hoặc F để bắn.`, 4000);
      emitHud(performance.now());
      return null;
    },
    /** Buys a new bike; it is delivered in front of the shop and replaces the old one. */
    buyBike(id: BikeId): string | null {
      const def = bikeById(id);
      if (cash < def.price) return 'Chưa đủ tiền. Giao thêm cà phê để kiếm tiền nhé.';
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
    reset() {
      if (playerCar) { playerCar.mode = 'parked'; playerCar = null; }
      Object.assign(state, { x: START.x, z: START.z, angle: Math.PI / 2, riding: false, speed: 0, score: 0 });
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
      equip('fists');
      police.reset();
      if (playerBody) ragdolls.remove(playerBody);
      playerBody = null;
      downReason = null;
      pendingHits.length = 0;
      Object.assign(view, CAMERA_DEFAULT);
      setMissionLabel();
      clearKeys();
      emitHud(performance.now());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
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

export { BIKES };
