import * as THREE from 'three';
import { buildWorld, groundHeight } from './world';
import { createRagdolls, type RagdollBody, type RagdollLook } from './ragdoll';
import { createNpcs } from './npcs';
import { createEffects, makeGun } from './effects';
import { playShot, playThud, unlockAudio } from './audio';
import { DELIVERY_PAY, WEAPONS, weaponById, type WeaponId } from './weapons';
import { MODE_LEVEL, QUALITY_LEVELS, createFrameMonitor, detectStartLevel, gpuName, isSoftwareGpu, type QualityMode } from './quality';

export type PlayerState = { x: number; z: number; angle: number; riding: boolean; speed: number; score: number };
export type PeerState = PlayerState & { id: string; name: string; color: string };
export type Hud = {
  speed: number; riding: boolean; score: number; mission: string; missionStep: number; hint: string; x: number; z: number;
  cash: number; deliveries: number; weapon: WeaponId; owned: WeaponId[]; down: boolean; fps: number; quality: string; qualityMode: QualityMode; gpu: string; softwareGpu: boolean;
};
export type GameEvent = { type: 'store' };

const PICKUP = { x: -32, z: 7 };
const DELIVERY = { x: 54, z: -35 };
export const STORE = { x: -18, z: 49.6 };
const UP = new THREE.Vector3(0, 1, 0);
const CAMERA_DEFAULT = { yaw: Math.atan2(31, 39), pitch: Math.atan2(36, Math.hypot(31, 39)), dist: Math.hypot(31, 36, 39) };
const PLAYER_LOOK: RagdollLook = { shirt: '#e77641', pants: '#293e4a', skin: '#dca878', helmet: '#fff4dc' };
const CRASH_SPEED = 12.5;

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
  sprite.scale.set(7, 1.75, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function makePerson(color = '#e77641', riding = false) {
  const group = new THREE.Group();
  const shirt = material(color);
  const trousers = material('#293e4a');
  const skin = material('#dca878');
  const shoe = material('#f6ead2');
  const helmet = material('#fff4dc', 0.45);
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
  box(group, [0.5, 0.65, 0.22], [0, 1.5, -0.35], material('#365e52'));
  sphere(group, 0.38, [0, 2.18, 0.03], skin);
  const cap = sphere(group, 0.405, [0, 2.32, 0], helmet);
  cap.scale.y = 0.65;
  box(group, [0.55, 0.08, 0.22], [0, 2.28, 0.37], helmet);
  box(group, [0.16, 0.08, 0.025], [-0.14, 2.19, 0.382], material('#3e342e'));
  box(group, [0.16, 0.08, 0.025], [0.14, 2.19, 0.382], material('#3e342e'));
  // Arms pivot at the shoulder so they can swing, steer and aim.
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
    group.scale.setScalar(0.91);
    group.position.set(0, 0.68, -0.25);
  }
  return { group, limbLeft, limbRight, armLeft, armRight };
}

function makeScooter(color = '#ed763e', riderColor?: string) {
  const group = new THREE.Group();
  const paint = material(color, 0.4);
  const cream = material('#f9e6c4', 0.5);
  const rubber = material('#293535');
  const chrome = new THREE.MeshStandardMaterial({ color: '#b8c8c4', roughness: 0.32, metalness: 0.65 });
  const seat = material('#493e37');
  const wheels: THREE.Mesh[] = [];
  for (const z of [-1.17, 1.17]) {
    const wheel = cylinder(group, 0.57, 0.57, 0.3, [0, 0.58, z], rubber, 16);
    wheel.rotation.z = Math.PI / 2;
    wheels.push(wheel);
    const hub = cylinder(group, 0.31, 0.31, 0.32, [0, 0.58, z], chrome, 12);
    hub.rotation.z = Math.PI / 2;
  }
  const rear = sphere(group, 0.83, [0, 0.95, -0.75], paint);
  rear.scale.set(0.77, 0.75, 1.16);
  box(group, [1.02, 0.18, 1.75], [0, 0.7, 0], paint);
  box(group, [0.88, 0.17, 1.15], [0, 0.81, 0.25], cream);
  const front = box(group, [0.91, 1.25, 0.24], [0, 1.32, 0.77], paint);
  front.rotation.x = -0.16;
  const whitePanel = box(group, [0.63, 0.85, 0.05], [0, 1.38, 0.935], cream);
  whitePanel.rotation.x = -0.16;
  box(group, [0.93, 0.23, 1.22], [0, 1.45, -0.58], seat);
  box(group, [1.37, 0.11, 0.13], [0, 1.93, 0.79], chrome);
  box(group, [0.28, 0.15, 0.2], [-0.72, 1.94, 0.79], rubber);
  box(group, [0.28, 0.15, 0.2], [0.72, 1.94, 0.79], rubber);
  const head = sphere(group, 0.31, [0, 1.97, 0.94], paint);
  head.scale.set(1.25, 1, 0.7);
  const lamp = cylinder(group, 0.235, 0.235, 0.08, [0, 1.98, 1.13], material('#fff6c8', 0.3));
  lamp.rotation.x = Math.PI / 2;
  box(group, [0.55, 0.15, 0.1], [0, 1.13, -1.54], material('#d95031'));
  box(group, [0.44, 0.26, 0.04], [0, 0.94, -1.59], cream);
  for (const x of [-0.61, 0.61]) {
    const stalk = cylinder(group, 0.035, 0.035, 0.48, [x, 2.17, 0.78], chrome, 6);
    stalk.rotation.z = x < 0 ? -0.2 : 0.2;
    const mirror = sphere(group, 0.18, [x * 1.08, 2.4, 0.78], chrome);
    mirror.scale.set(1, 0.7, 0.27);
  }
  if (riderColor) group.add(makePerson(riderColor, true).group);
  return { group, wheels };
}

function makeRing(color: string, emissive: string) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.2, roughness: 0.55 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 8, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.23;
  group.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.19;
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

export function createGame(container: HTMLElement, onHud: (hud: Hud) => void, onEvent: (event: GameEvent) => void = () => {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9ded3');
  scene.fog = new THREE.Fog('#d9ded3', 105, 240);
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
  renderer.domElement.setAttribute('aria-label', 'Khu phố Việt Nam 3D. Dùng WASD để di chuyển, E để lên xe hoặc nhận nhiệm vụ, chuột phải để xoay camera.');
  container.appendChild(renderer.domElement);
  const gpu = gpuName(renderer.getContext());
  const softwareGpu = isSoftwareGpu(gpu);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
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
  const world = buildWorld(scene);
  const ragdolls = createRagdolls(scene, world.colliders, groundHeight);
  const npcs = createNpcs(scene, ragdolls);
  const effects = createEffects(scene);

  const walker = makePerson();
  scene.add(walker.group);
  const scooter = makeScooter();
  const rider = makePerson('#ed763e', true);
  rider.group.visible = false;
  scooter.group.add(rider.group);
  scene.add(scooter.group);
  const youLabel = makeLabel('BẠN', '#fff4da', '#245442');
  youLabel.scale.set(3.3, 0.825, 1);
  scene.add(youLabel);
  const guns = new Map<WeaponId, { group: THREE.Group; length: number }>();
  for (const id of ['pistol', 'shotgun', 'smg'] as const) {
    const gun = makeGun(id);
    gun.group.rotation.x = Math.PI / 2;
    gun.group.position.set(0, -0.74, 0.06);
    gun.group.visible = false;
    walker.armRight.add(gun.group);
    guns.set(id, gun);
  }

  const missionRing = makeRing('#db683f', '#a33e1e');
  const marker = missionRing.group;
  const pin = new THREE.Group();
  const cone = cylinder(pin, 0.66, 0, 1.2, [0, 0, 0], missionRing.mat, 4);
  cone.rotation.y = Math.PI / 4;
  const cup = cylinder(pin, 0.39, 0.3, 0.7, [0, 0.93, 0], material('#fff2d0'), 10);
  cylinder(pin, 0.42, 0.42, 0.1, [0, 1.32, 0], material('#537764'), 10);
  box(pin, [0.06, 0.4, 0.06], [0.12, 1.52, 0], material('#344f40'));
  cup.rotation.z = 0.12;
  pin.position.y = 4;
  marker.add(pin);
  let missionLabel = makeLabel('NHẬN CÀ PHÊ', '#f6cf71', '#493d23');
  missionLabel.position.y = 7.3;
  marker.add(missionLabel);
  scene.add(marker);
  const storeRing = makeRing('#3f6f9f', '#1d3f63');
  const storeLabel = makeLabel('TIỆM SÚNG', '#2f4a6b');
  storeLabel.position.y = 5.2;
  storeRing.group.add(storeLabel);
  storeRing.group.position.set(STORE.x, 0, STORE.z);
  scene.add(storeRing.group);

  const peers = new Map<string, { group: THREE.Group; foot: ReturnType<typeof makePerson>; bike: ReturnType<typeof makeScooter>; label: THREE.Sprite; target: PeerState; name: string; color: string }>();
  const state: PlayerState = { x: 5, z: 12, angle: -2.5, riding: false, speed: 0, score: 0 };
  let bikeX = 7;
  let bikeZ = 10;
  let bikeAngle = -2.5;
  let active = false;
  let disposed = false;
  let missionStep = 0;
  let velocity = 0;
  let frame = 0;
  let previousTime = performance.now();
  let hudTime = 0;
  let lastHud = '';
  let notificationUntil = 0;
  let notification = '';
  let walkClock = 0;
  let touching = false;
  let cash = 0;
  let deliveries = 0;
  let weapon: WeaponId = 'fists';
  const owned = new Set<WeaponId>(['fists']);
  let playerBody: RagdollBody | null = null;
  let downUntil = 0;
  let lastShot = 0;
  let aimUntil = 0;
  let punchUntil = 0;
  let triggerQueued = false;
  let triggerSource: 'mouse' | 'key' = 'key';
  let mouseHeld = false;
  let pointerInside = false;
  let shake = 0;
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

  function offsetFor(yaw: number, pitch: number, dist: number, out: THREE.Vector3) {
    return out.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  }
  camera.position.copy(cameraTarget).add(offsetFor(view.yaw, view.pitch, view.dist, cameraOffset));
  camera.lookAt(cameraTarget);

  // Dynamic models must not cast into the static shadow map; they get blob shadows instead.
  for (const object of [walker.group, scooter.group, marker, storeRing.group]) object.traverse((o) => { o.castShadow = false; });

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

  function clearAt(x: number, z: number, radius: number) {
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

  function notify(text: string, duration = 2500) {
    notification = text;
    notificationUntil = performance.now() + duration;
  }

  function setMissionLabel() {
    marker.remove(missionLabel);
    disposeTree(missionLabel);
    missionLabel = makeLabel(missionStep === 0 ? 'NHẬN CÀ PHÊ' : 'ĐIỂM GIAO HÀNG', '#f6cf71', '#493d23');
    missionLabel.position.y = 7.3;
    marker.add(missionLabel);
  }

  function equip(id: WeaponId) {
    if (!owned.has(id)) return false;
    weapon = id;
    for (const [gunId, gun] of guns) gun.group.visible = gunId === id;
    return true;
  }

  function action() {
    if (!active || playerBody) return;
    const target = missionStep === 0 ? PICKUP : DELIVERY;
    if (distance(target) < 6.5) {
      if (missionStep === 0) {
        missionStep = 1;
        notify('Đã nhận cà phê! Giao đến Bưu điện.', 4500);
      } else {
        state.score += 50;
        cash += DELIVERY_PAY;
        deliveries++;
        missionStep = 0;
        notify(deliveries === 1 ? '+100.000đ · Tiệm súng đã mở cửa cho bạn!' : '+50 điểm · +100.000đ · Giao hàng thành công!', 4500);
      }
      setMissionLabel();
      return;
    }
    if (!state.riding && distance(STORE) < 4.5) {
      onEvent({ type: 'store' });
      return;
    }
    if (state.riding) {
      if (velocity > 4) {
        notify('Hãy giảm tốc trước khi xuống xe');
        return;
      }
      const offsets = [new THREE.Vector3(2.3, 0, 0), new THREE.Vector3(-2.3, 0, 0), new THREE.Vector3(0, 0, -2.8), new THREE.Vector3(0, 0, 2.8)];
      for (const offset of offsets) {
        offset.applyAxisAngle(UP, state.angle);
        if (clearAt(state.x + offset.x, state.z + offset.z, 0.62)) {
          bikeX = state.x;
          bikeZ = state.z;
          bikeAngle = state.angle;
          state.x += offset.x;
          state.z += offset.z;
          state.riding = false;
          velocity = 0;
          return;
        }
      }
      notify('Chỗ này hơi chật. Tìm khoảng trống để xuống xe.');
    } else if (Math.hypot(state.x - bikeX, state.z - bikeZ) < 5) {
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
      const slot = Number(normalized);
      if (slot >= 1 && slot <= WEAPONS.length && !equip(WEAPONS[slot - 1].id)) notify(`Chưa có ${WEAPONS[slot - 1].name}. Mua ở Tiệm súng.`);
    }
    if (down) keys.add(normalized);
    else keys.delete(normalized);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (focusedInput() || !active) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    setInput(event.key, true);
  }
  function onKeyUp(event: KeyboardEvent) { setInput(event.key, false); }
  function clearKeys() { keys.clear(); mouseHeld = false; triggerQueued = false; }
  function onVisibility() { if (document.hidden) clearKeys(); }
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
  }
  function zoomBy(factor: number) {
    view.dist = THREE.MathUtils.clamp(view.dist * factor, 14, 95);
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

  function setPeers(nextPeers: PeerState[]) {
    const incomingIds = new Set(nextPeers.map((p) => p.id));
    for (const [id, peer] of peers) {
      if (!incomingIds.has(id)) {
        scene.remove(peer.group);
        disposeTree(peer.group);
        peers.delete(id);
      }
    }
    for (const peer of nextPeers) {
      if (![peer.x, peer.z, peer.angle, peer.speed, peer.score].every(Number.isFinite)) continue;
      let existing = peers.get(peer.id);
      if (existing && (existing.name !== peer.name || existing.color !== peer.color)) {
        scene.remove(existing.group);
        disposeTree(existing.group);
        peers.delete(peer.id);
        existing = undefined;
      }
      if (!existing) {
        const group = new THREE.Group();
        const color = /^#[0-9a-f]{6}$/i.test(peer.color) ? peer.color : '#5b86b7';
        const foot = makePerson(color);
        const bike = makeScooter(color, color);
        const label = makeLabel(peer.name.slice(0, 20), '#23493f');
        label.position.y = 5.1;
        group.add(foot.group, bike.group, label);
        group.position.set(peer.x, 0.15, peer.z);
        foot.group.rotation.y = peer.angle;
        bike.group.rotation.y = peer.angle;
        group.traverse((o) => { o.castShadow = false; });
        scene.add(group);
        existing = { group, foot, bike, label, target: { ...peer }, name: peer.name, color: peer.color };
        peers.set(peer.id, existing);
      }
      existing.target = { ...peer };
    }
  }

  /** Picks the pedestrian or body closest to the facing direction, for keyboard and touch aiming. */
  function autoAim(range: number, out: THREE.Vector3) {
    let bestGap = 0.42;
    let found = false;
    const consider = (x: number, y: number, z: number) => {
      const d = Math.hypot(x - state.x, z - state.z);
      if (d < 0.5 || d > range) return;
      const gap = angleGap(Math.atan2(x - state.x, z - state.z), state.angle);
      if (gap < bestGap) { bestGap = gap; out.set(x, y, z); found = true; }
    };
    npcs.forEachStanding((x, z) => consider(x, 1.1, z));
    ragdolls.forEach((body) => { if (body !== playerBody) { ragdolls.center(body, scratch); consider(scratch.x, scratch.y, scratch.z); } });
    return found;
  }

  function muzzle(out: THREE.Vector3) {
    const reach = 0.82 + (guns.get(weapon)?.length ?? 0);
    const c = Math.cos(state.angle), s = Math.sin(state.angle);
    return out.set(state.x + c * 0.57 + s * reach, 1.86, state.z - s * 0.57 + c * reach);
  }

  function punch(time: number) {
    punchUntil = performance.now() + 180;
    const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    let hit = false;
    npcs.near(state.x + fx * 1.2, state.z + fz * 1.2, 1.3, (npc) => {
      if (hit) return;
      hit = npcs.knock(npc, fx * 7, 3.5, fz * 7, time) !== null;
    });
    if (!hit) hit = ragdolls.push(state.x + fx * 1.1, state.z + fz * 1.1, 1.1, fx * 7, 3, fz * 7) > 0;
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
        aimPoint.copy(ray.origin).addScaledVector(ray.direction, (0.35 - ray.origin.y) / ray.direction.y);
        haveTarget = true;
      }
    } else haveTarget = autoAim(def.range, aimPoint);
    if (haveTarget) state.angle = Math.atan2(aimPoint.x - state.x, aimPoint.z - state.z);
    aimUntil = now + 800;
    if (def.id === 'fists') { punch(time); return; }
    muzzle(rayOrigin);
    const horizontal = Math.max(1, Math.hypot(aimPoint.x - rayOrigin.x, aimPoint.z - rayOrigin.z));
    const slope = haveTarget ? THREE.MathUtils.clamp((aimPoint.y - rayOrigin.y) / horizontal, -0.7, 0.15) : -0.03;
    for (let pellet = 0; pellet < def.pellets; pellet++) {
      const yaw = state.angle + (Math.random() - 0.5) * 2 * def.spread;
      rayDir.set(Math.sin(yaw), slope + (Math.random() - 0.5) * def.spread, Math.cos(yaw)).normalize();
      let maxT = wallDistance(rayOrigin, rayDir, def.range);
      if (rayDir.y < 0) maxT = Math.min(maxT, (groundHeight(rayOrigin.x, rayOrigin.z) + 0.02 - rayOrigin.y) / rayDir.y);
      const npcHit = npcs.raycast(rayOrigin, rayDir, maxT);
      const bodyHit = ragdolls.raycast(rayOrigin, rayDir, npcHit ? npcHit.t : maxT);
      const t = bodyHit ? bodyHit.t : npcHit ? npcHit.t : maxT;
      hitPoint.copy(rayOrigin).addScaledVector(rayDir, t);
      if (bodyHit) ragdolls.impulse(bodyHit.body, rayDir.x * def.force, 1.5 + Math.max(0, rayDir.y) * def.force, rayDir.z * def.force, bodyHit.index);
      else if (npcHit) npcs.knock(npcHit.npc, rayDir.x * def.force, 2.5, rayDir.z * def.force, time);
      else effects.puff(hitPoint, now);
      effects.tracer(rayOrigin, hitPoint, now);
    }
    effects.flash(rayOrigin, now, def.id === 'shotgun' ? 1.5 : 1);
    playShot(def.id);
    shake = Math.max(shake, def.id === 'shotgun' ? 0.45 : def.id === 'smg' ? 0.12 : 0.2);
    npcs.alarm(state.x, state.z, 42, time);
  }

  function crash(now: number) {
    const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
    const speed = velocity;
    state.riding = false;
    bikeX = state.x;
    bikeZ = state.z;
    bikeAngle = state.angle;
    velocity = 0;
    playerBody = ragdolls.spawn({ x: state.x - fx * 0.3, y: 0.85, z: state.z - fz * 0.3, yaw: state.angle, scale: 0.95, look: PLAYER_LOOK, velocity: { x: fx * speed * 0.5, y: 4.5 + speed * 0.18, z: fz * speed * 0.5 } });
    downUntil = now + 2600;
    shake = 0.6;
    playThud();
    notify('Ngã xe! Đứng dậy sau giây lát…', 2600);
  }

  function standUp() {
    if (playerBody && !playerBody.removed) ragdolls.center(playerBody, scratch);
    else scratch.set(state.x, 0, state.z);
    if (playerBody) ragdolls.remove(playerBody);
    playerBody = null;
    for (let ring = 0; ring < 8; ring++) {
      const r = ring * 0.8;
      for (let k = 0; k < 8; k++) {
        const x = scratch.x + Math.sin(k * Math.PI / 4) * r, z = scratch.z + Math.cos(k * Math.PI / 4) * r;
        if (clearAt(x, z, 0.62)) { state.x = x; state.z = z; return; }
      }
    }
  }

  function emitHud(now: number) {
    const target = missionStep === 0 ? PICKUP : DELIVERY;
    const nearMission = distance(target) < 6.5;
    const nearBike = !state.riding && Math.hypot(state.x - bikeX, state.z - bikeZ) < 5;
    const nearStore = !state.riding && distance(STORE) < 4.5;
    const hint = now < notificationUntil ? notification
      : playerBody ? 'Đang đứng dậy…'
      : nearMission ? (missionStep === 0 ? 'Nhấn E để nhận cà phê' : 'Nhấn E để giao cà phê · +100.000đ')
      : nearStore ? (deliveries ? 'Nhấn E để vào Tiệm súng' : 'Tiệm súng: giao 1 đơn cà phê để mở khóa')
      : state.riding ? 'WASD lái xe · Space phanh · E xuống xe'
      : nearBike ? 'Nhấn E để lên xe máy'
      : weapon !== 'fists' ? 'Click / F bắn · Q đổi vũ khí · Chuột phải xoay camera'
      : 'WASD di chuyển · Shift chạy · E tương tác';
    const hud: Hud = {
      speed: Math.round(velocity * 10) / 10, riding: state.riding, score: state.score,
      mission: missionStep === 0 ? 'Nhận cà phê ở quán Cô Ba' : 'Giao cà phê đến Bưu điện', missionStep, hint,
      x: Math.round(state.x * 2) / 2, z: Math.round(state.z * 2) / 2,
      cash, deliveries, weapon, owned: WEAPONS.filter((w) => owned.has(w.id)).map((w) => w.id), down: playerBody !== null,
      fps: monitor.fps, quality: QUALITY_LEVELS[level].label, qualityMode, gpu, softwareGpu,
    };
    // React re-renders only when something visible changed.
    const key = JSON.stringify(hud);
    if (key === lastHud) return;
    lastHud = key;
    onHud(hud);
  }

  function update(now: number) {
    if (disposed) return;
    const interval = now - previousTime;
    const dt = Math.min(interval / 1000, 0.05);
    previousTime = now;
    adaptQuality(now, interval);
    const time = now / 1000;
    let moving = false;
    const def = weaponById(weapon);
    if (playerBody && now > downUntil && (playerBody.asleep || playerBody.removed || now > downUntil + 2500)) standUp();
    if (active && !playerBody) {
      let horizontal = 0;
      let vertical = 0;
      if (!focusedInput()) {
        if (keys.has('w') || keys.has('arrowup')) vertical += 1;
        if (keys.has('s') || keys.has('arrowdown')) vertical -= 1;
        if (keys.has('d') || keys.has('arrowright')) horizontal += 1;
        if (keys.has('a') || keys.has('arrowleft')) horizontal -= 1;
        if (keys.has('z')) view.yaw += dt * 1.9;
        if (keys.has('c')) view.yaw -= dt * 1.9;
      }
      // Movement is relative to where the camera is looking.
      const forwardX = -Math.sin(smoothView.yaw), forwardZ = -Math.cos(smoothView.yaw);
      const dirX = forwardX * vertical - forwardZ * horizontal;
      const dirZ = forwardZ * vertical + forwardX * horizontal;
      moving = horizontal !== 0 || vertical !== 0;
      const braking = keys.has(' ') || keys.has('space');
      const aiming = now < aimUntil && !state.riding;
      if (moving && !aiming) state.angle = angleLerp(state.angle, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * (state.riding ? 5.2 : 15)));
      const topSpeed = state.riding ? 21 : keys.has('shift') ? 8.7 : aiming ? 4.2 : 5.4;
      const targetVelocity = moving && !braking ? topSpeed : 0;
      velocity = THREE.MathUtils.damp(velocity, targetVelocity, state.riding ? braking ? 9 : moving ? 1.4 : 2.6 : 12, dt);
      if (velocity < 0.025) velocity = 0;
      // While aiming on foot the player strafes in the input direction instead of turning.
      const headingX = aiming && moving ? dirX / Math.hypot(dirX, dirZ) : Math.sin(state.angle);
      const headingZ = aiming && moving ? dirZ / Math.hypot(dirX, dirZ) : Math.cos(state.angle);
      const dx = headingX * velocity * dt;
      const dz = headingZ * velocity * dt;
      const radius = state.riding ? 1.02 : 0.62;
      touching = false;
      let impact = 0;
      if (clearAt(state.x + dx, state.z, radius)) state.x += dx;
      else { touching = true; impact = Math.max(impact, Math.abs(headingX * velocity)); }
      if (clearAt(state.x, state.z + dz, radius)) state.z += dz;
      else { touching = true; impact = Math.max(impact, Math.abs(headingZ * velocity)); }
      if (state.riding && impact > CRASH_SPEED) crash(now);
      else if (touching && state.riding) velocity *= Math.exp(-dt * 6);
      if (state.riding) {
        bikeX = state.x;
        bikeZ = state.z;
        bikeAngle = state.angle;
        if (velocity > 4) {
          const fx = Math.sin(state.angle), fz = Math.cos(state.angle);
          npcs.near(state.x + fx * 0.8, state.z + fz * 0.8, 1.5, (npc) => {
            if (npcs.knock(npc, fx * velocity * 0.85, 3 + velocity * 0.22, fz * velocity * 0.85, time)) {
              velocity *= 0.85;
              playThud();
              shake = Math.max(shake, 0.25);
            }
          });
          ragdolls.push(state.x + fx * 0.6, state.z + fz * 0.6, 1.3, fx * velocity, 2 + velocity * 0.1, fz * velocity);
        }
      } else if (velocity > 0.5) {
        ragdolls.push(state.x, state.z, 0.75, headingX * velocity * 1.2, 1.2, headingZ * velocity * 1.2);
      }
      const wantsShot = triggerQueued || (def.auto && (mouseHeld || keys.has('f')));
      if (wantsShot && now - lastShot >= 1000 / def.fireRate) {
        triggerQueued = false;
        if (state.riding) notify('Xuống xe để dùng vũ khí', 1500);
        else fire(now, time);
      }
      state.speed = velocity;
    } else {
      velocity = 0;
      state.speed = 0;
      triggerQueued = false;
    }

    const armed = weapon !== 'fists';
    walker.group.visible = !state.riding && !playerBody;
    walker.group.position.set(state.x, 0.15, state.z);
    walker.group.rotation.y = state.angle;
    walkClock += velocity * dt * 1.3;
    const stride = moving && active ? Math.sin(walkClock * 2) * 0.62 : 0;
    walker.limbLeft.rotation.x = stride;
    walker.limbRight.rotation.x = -stride;
    const twoHanded = weapon === 'shotgun' || weapon === 'smg';
    walker.armLeft.rotation.set(twoHanded ? -1.25 : -stride * 0.7, 0, twoHanded ? 0.45 : 0);
    walker.armRight.rotation.x = now < punchUntil ? -1.65 : armed ? -Math.PI / 2 : stride * 0.7;
    rider.group.visible = state.riding;
    scooter.group.position.set(bikeX, 0.15, bikeZ);
    scooter.group.rotation.y = bikeAngle;
    for (const wheel of scooter.wheels) wheel.rotation.x -= velocity * dt / 0.57;
    if (playerBody) ragdolls.center(playerBody, scratch);
    else scratch.set(state.x, 0, state.z);
    youLabel.position.set(scratch.x, state.riding ? 4.9 : 4.3, scratch.z);
    youLabel.visible = active;
    const point = missionStep === 0 ? PICKUP : DELIVERY;
    marker.position.set(point.x, 0, point.z);
    pin.position.y = 4.2 + Math.sin(time * 2.5) * 0.3;
    pin.rotation.y = time * 0.35;
    missionRing.ring.scale.setScalar(1 + Math.sin(time * 2.5) * 0.045);
    storeRing.ring.scale.setScalar(1 + Math.sin(time * 2.5 + 1.5) * 0.045);

    effects.beginBlobs();
    if (walker.group.visible) effects.blob(state.x, groundHeight(state.x, state.z) + 0.02, state.z, 1.5);
    effects.blob(bikeX, groundHeight(bikeX, bikeZ) + 0.02, bikeZ, 1.4, 3.4, bikeAngle);
    for (const peer of peers.values()) {
      const { target } = peer;
      const blend = 1 - Math.exp(-dt * 12);
      peer.group.position.x = THREE.MathUtils.lerp(peer.group.position.x, target.x, blend);
      peer.group.position.z = THREE.MathUtils.lerp(peer.group.position.z, target.z, blend);
      peer.foot.group.rotation.y = angleLerp(peer.foot.group.rotation.y, target.angle, blend);
      peer.bike.group.rotation.y = angleLerp(peer.bike.group.rotation.y, target.angle, blend);
      peer.foot.group.visible = !target.riding;
      peer.bike.group.visible = target.riding;
      const peerStride = target.speed > 1 ? Math.sin(time * 10) * 0.55 : 0;
      peer.foot.limbLeft.rotation.x = peerStride;
      peer.foot.limbRight.rotation.x = -peerStride;
      const { x, z } = peer.group.position;
      effects.blob(x, groundHeight(x, z) + 0.02, z, target.riding ? 1.4 : 1.5, target.riding ? 3.4 : 1.5, peer.bike.group.rotation.y);
    }
    npcs.update(dt, time, groundHeight);
    npcs.forEachStanding((x, z) => effects.blob(x, groundHeight(x, z) + 0.02, z, 1.2));
    effects.endBlobs();
    ragdolls.update(dt);
    effects.update(now);

    const cameraBlend = 1 - Math.exp(-dt * 3.8);
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
      camDesired.copy(cameraTarget).add(offsetFor(CAMERA_DEFAULT.yaw, CAMERA_DEFAULT.pitch, CAMERA_DEFAULT.dist, cameraOffset));
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
    canvas.style.cursor = !active ? '' : rotating ? 'grabbing' : armed && !state.riding ? 'crosshair' : '';
    world.update(time);
    renderer.render(scene, camera);
    if (now - hudTime >= 120) {
      hudTime = now;
      emitHud(now);
    }
    frame = requestAnimationFrame(update);
  }
  emitHud(performance.now());
  frame = requestAnimationFrame(update);

  return {
    setActive(value: boolean) { active = value; clearKeys(); rotating = null; touches.clear(); if (!value) velocity = 0; },
    getState(): PlayerState { return { ...state }; },
    setPeers,
    action,
    setInput,
    equip(id: WeaponId) { equip(id); emitHud(performance.now()); },
    cycleWeapon() { cycleWeapon(); emitHud(performance.now()); },
    buyWeapon(id: WeaponId): string | null {
      const def = weaponById(id);
      if (owned.has(id)) { equip(id); emitHud(performance.now()); return null; }
      if (!deliveries) return 'Hoàn thành ít nhất 1 chuyến giao cà phê để mở khóa Tiệm súng.';
      if (cash < def.price) return 'Chưa đủ tiền. Giao thêm cà phê để kiếm tiền nhé.';
      cash -= def.price;
      owned.add(id);
      equip(id);
      notify(`Đã mua ${def.name}! Click chuột hoặc F để bắn.`, 4000);
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
      Object.assign(state, { x: 5, z: 12, angle: -2.5, riding: false, speed: 0, score: 0 });
      bikeX = 7;
      bikeZ = 10;
      bikeAngle = -2.5;
      velocity = 0;
      missionStep = 0;
      notificationUntil = 0;
      cash = 0;
      deliveries = 0;
      owned.clear();
      owned.add('fists');
      equip('fists');
      if (playerBody) ragdolls.remove(playerBody);
      playerBody = null;
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
      ragdolls.dispose();
      effects.dispose();
      disposeTree(scene);
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      peers.clear();
    },
  };
}
