import * as THREE from 'three';
import { buildWorld } from './world';

export type PlayerState = { x: number; z: number; angle: number; riding: boolean; speed: number; score: number };
export type PeerState = PlayerState & { id: string; name: string; color: string };
export type Hud = { speed: number; riding: boolean; score: number; mission: string; missionStep: number; hint: string; x: number; z: number };

const PICKUP = { x: -32, z: 7 };
const DELIVERY = { x: 54, z: -35 };
const FORWARD = new THREE.Vector2(-0.625, -0.781);
const RIGHT = new THREE.Vector2(0.781, -0.625);
const UP = new THREE.Vector3(0, 1, 0);

function material(color: THREE.ColorRepresentation, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
}

function box(parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(parent: THREE.Object3D, radius: number, pos: [number, number, number], mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 7), mat);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, pos: [number, number, number], mat: THREE.Material, radial = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, radial), mat);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
  const armLeft = box(group, [0.26, 0.72, 0.3], [-0.57, 1.4, 0.04], shirt);
  const armRight = box(group, [0.26, 0.72, 0.3], [0.57, 1.4, 0.04], shirt);
  sphere(group, 0.16, [-0.57, 1.03, 0.04], skin);
  sphere(group, 0.16, [0.57, 1.03, 0.04], skin);
  if (riding) {
    limbLeft.rotation.x = -0.65;
    limbRight.rotation.x = -0.65;
    armLeft.rotation.x = -0.8;
    armRight.rotation.x = -0.8;
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

export function createGame(container: HTMLElement, onHud: (hud: Hud) => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9ded3');
  scene.fog = new THREE.Fog('#d9ded3', 105, 240);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.domElement.setAttribute('aria-label', 'Khu phố Việt Nam 3D. Dùng WASD để di chuyển, E để lên xe hoặc nhận nhiệm vụ.');
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 350);
  const hemi = new THREE.HemisphereLight('#fff2d2', '#789a8c', 2.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe5be', 3.7);
  sun.position.set(-42, 75, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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

  const marker = new THREE.Group();
  const markerMat = new THREE.MeshStandardMaterial({ color: '#db683f', emissive: '#a33e1e', emissiveIntensity: 0.2, roughness: 0.55 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 8, 48), markerMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.23;
  marker.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ color: '#db683f', transparent: true, opacity: 0.12, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.19;
  marker.add(disc);
  const pin = new THREE.Group();
  const cone = cylinder(pin, 0.66, 0, 1.2, [0, 0, 0], markerMat, 4);
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
  let notificationUntil = 0;
  let notification = '';
  let walkClock = 0;
  let touching = false;
  const keys = new Set<string>();
  const cameraTarget = new THREE.Vector3(state.x, 0.7, state.z);
  const camDesired = new THREE.Vector3();
  const followOffset = new THREE.Vector3(31, 36, 39);
  camera.position.copy(cameraTarget).add(followOffset);
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

  function setMissionLabel() {
    marker.remove(missionLabel);
    disposeTree(missionLabel);
    missionLabel = makeLabel(missionStep === 0 ? 'NHẬN CÀ PHÊ' : 'ĐIỂM GIAO HÀNG', '#f6cf71', '#493d23');
    missionLabel.position.y = 7.3;
    marker.add(missionLabel);
  }

  function action() {
    if (!active) return;
    const target = missionStep === 0 ? PICKUP : DELIVERY;
    if (distance(target) < 6.5) {
      if (missionStep === 0) {
        missionStep = 1;
        notification = 'Đã nhận cà phê! Giao đến Bưu điện.';
      } else {
        state.score += 50;
        missionStep = 0;
        notification = '+50 điểm · Giao hàng thành công!';
      }
      notificationUntil = performance.now() + 4500;
      setMissionLabel();
      return;
    }
    if (state.riding) {
      if (velocity > 4) {
        notification = 'Hãy giảm tốc trước khi xuống xe';
        notificationUntil = performance.now() + 2500;
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
      notification = 'Chỗ này hơi chật. Tìm khoảng trống để xuống xe.';
      notificationUntil = performance.now() + 2500;
    } else if (Math.hypot(state.x - bikeX, state.z - bikeZ) < 5) {
      state.riding = true;
      state.x = bikeX;
      state.z = bikeZ;
      state.angle = bikeAngle;
      velocity = 0;
    }
  }

  function setInput(key: string, down: boolean) {
    const normalized = key.toLowerCase();
    if (down) {
      if ((normalized === 'e' || normalized === 'key e') && !keys.has(normalized)) action();
      keys.add(normalized);
    } else keys.delete(normalized);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (focusedInput() || !active) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(event.key) && event.key !== 'Tab') event.preventDefault();
    setInput(event.key, true);
  }
  function onKeyUp(event: KeyboardEvent) { setInput(event.key, false); }
  function clearKeys() { keys.clear(); }
  function onVisibility() { if (document.hidden) clearKeys(); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', onVisibility);

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
        scene.add(group);
        existing = { group, foot, bike, label, target: { ...peer }, name: peer.name, color: peer.color };
        peers.set(peer.id, existing);
      }
      existing.target = { ...peer };
    }
  }

  function emitHud(now: number) {
    const target = missionStep === 0 ? PICKUP : DELIVERY;
    const nearMission = distance(target) < 6.5;
    const nearBike = !state.riding && Math.hypot(state.x - bikeX, state.z - bikeZ) < 5;
    const hint = now < notificationUntil ? notification : nearMission ? (missionStep === 0 ? 'Nhấn E để nhận cà phê' : 'Nhấn E để giao cà phê · +50 điểm') : state.riding ? 'WASD lái xe · Space phanh · E xuống xe' : nearBike ? 'Nhấn E để lên xe máy' : 'WASD di chuyển · Shift chạy · E tương tác';
    onHud({ speed: velocity, riding: state.riding, score: state.score, mission: missionStep === 0 ? 'Nhận cà phê ở quán Cô Ba' : 'Giao cà phê đến Bưu điện', missionStep, hint, x: state.x, z: state.z });
  }

  function update(now: number) {
    if (disposed) return;
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const time = now / 1000;
    let moving = false;
    if (active) {
      let horizontal = 0;
      let vertical = 0;
      if (!focusedInput()) {
        if (keys.has('w') || keys.has('arrowup')) vertical += 1;
        if (keys.has('s') || keys.has('arrowdown')) vertical -= 1;
        if (keys.has('d') || keys.has('arrowright')) horizontal += 1;
        if (keys.has('a') || keys.has('arrowleft')) horizontal -= 1;
      }
      const dirX = FORWARD.x * vertical + RIGHT.x * horizontal;
      const dirZ = FORWARD.y * vertical + RIGHT.y * horizontal;
      moving = horizontal !== 0 || vertical !== 0;
      const braking = keys.has(' ') || keys.has('space');
      if (moving) state.angle = angleLerp(state.angle, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * (state.riding ? 5.2 : 15)));
      const topSpeed = state.riding ? 21 : keys.has('shift') ? 8.7 : 5.4;
      const targetVelocity = moving && !braking ? topSpeed : 0;
      velocity = THREE.MathUtils.damp(velocity, targetVelocity, state.riding ? braking ? 9 : moving ? 1.4 : 2.6 : 12, dt);
      if (velocity < 0.025) velocity = 0;
      const dx = Math.sin(state.angle) * velocity * dt;
      const dz = Math.cos(state.angle) * velocity * dt;
      const radius = state.riding ? 1.02 : 0.62;
      touching = false;
      if (clearAt(state.x + dx, state.z, radius)) state.x += dx;
      else touching = true;
      if (clearAt(state.x, state.z + dz, radius)) state.z += dz;
      else touching = true;
      if (touching && state.riding) velocity *= Math.exp(-dt * 6);
      if (state.riding) {
        bikeX = state.x;
        bikeZ = state.z;
        bikeAngle = state.angle;
      }
      state.speed = velocity;
    } else {
      velocity = 0;
      state.speed = 0;
    }

    walker.group.visible = !state.riding;
    walker.group.position.set(state.x, 0.15, state.z);
    walker.group.rotation.y = state.angle;
    walkClock += velocity * dt * 1.3;
    const stride = moving && active ? Math.sin(walkClock * 2) * 0.62 : 0;
    walker.limbLeft.rotation.x = stride;
    walker.limbRight.rotation.x = -stride;
    walker.armLeft.rotation.x = -stride * 0.7;
    walker.armRight.rotation.x = stride * 0.7;
    rider.group.visible = state.riding;
    scooter.group.position.set(bikeX, 0.15, bikeZ);
    scooter.group.rotation.y = bikeAngle;
    for (const wheel of scooter.wheels) wheel.rotation.x -= velocity * dt / 0.57;
    youLabel.position.set(state.x, state.riding ? 4.9 : 4.3, state.z);
    youLabel.visible = active;
    const point = missionStep === 0 ? PICKUP : DELIVERY;
    marker.position.set(point.x, 0, point.z);
    pin.position.y = 4.2 + Math.sin(time * 2.5) * 0.3;
    pin.rotation.y = time * 0.35;
    ring.scale.setScalar(1 + Math.sin(time * 2.5) * 0.045);

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
    }

    const cameraBlend = 1 - Math.exp(-dt * 3.8);
    const desiredTarget = new THREE.Vector3(active ? state.x : -3, 1, active ? state.z : -5);
    cameraTarget.lerp(desiredTarget, cameraBlend);
    camDesired.copy(cameraTarget).add(followOffset);
    if (!active) camDesired.add(new THREE.Vector3(Math.sin(time * 0.05) * 5, 13, 12));
    camera.position.lerp(camDesired, cameraBlend);
    camera.lookAt(cameraTarget);
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
    setActive(value: boolean) { active = value; clearKeys(); if (!value) velocity = 0; },
    getState(): PlayerState { return { ...state }; },
    setPeers,
    action,
    setInput,
    reset() {
      Object.assign(state, { x: 5, z: 12, angle: -2.5, riding: false, speed: 0, score: 0 });
      bikeX = 7;
      bikeZ = 10;
      bikeAngle = -2.5;
      velocity = 0;
      missionStep = 0;
      notificationUntil = 0;
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
      world.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      peers.clear();
    },
  };
}
