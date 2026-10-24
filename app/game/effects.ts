import * as THREE from 'three';
import type { WeaponId } from './weapons';

function radialTexture(inner: string, outer: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function splatTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // Overlapping soft discs give each splat an irregular, cartoony edge.
  for (let i = 0; i < 9; i++) {
    const r = i === 0 ? 34 : 10 + Math.random() * 16;
    const a = Math.random() * Math.PI * 2, d = i === 0 ? 0 : 20 + Math.random() * 22;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(118,12,14,0.9)');
    gradient.addColorStop(0.7, 'rgba(118,12,14,0.75)');
    gradient.addColorStop(1, 'rgba(118,12,14,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Pooled shot, blood and shadow effects; each pool is a single draw call regardless of how busy the street gets. */
export function createEffects(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const root = new THREE.Group();
  scene.add(root);

  // Bullet streaks: a short bright segment that flies from the muzzle to the hit at bullet speed.
  const TRACERS = 48, BULLET_SPEED = 260, STREAK = 4;
  const tracerPositions = new Float32Array(TRACERS * 6);
  const tracerExpiry = new Float64Array(TRACERS);
  const tracerPath = new Float64Array(TRACERS * 8);
  const tracerGeometry = new THREE.BufferGeometry();
  const tracerAttribute = new THREE.BufferAttribute(tracerPositions, 3).setUsage(THREE.DynamicDrawUsage);
  tracerGeometry.setAttribute('position', tracerAttribute);
  const tracerMaterial = new THREE.LineBasicMaterial({ color: '#fff0b8', transparent: true, opacity: 0.85 });
  const tracers = new THREE.LineSegments(tracerGeometry, tracerMaterial);
  tracers.frustumCulled = false;
  root.add(tracers);
  geometries.push(tracerGeometry);
  materials.push(tracerMaterial);
  let tracerIndex = 0;
  let tracersLive = false;

  const flashTexture = radialTexture('rgba(255,246,205,1)', 'rgba(255,150,40,0)');
  const flashMaterial = new THREE.SpriteMaterial({ map: flashTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flash = new THREE.Sprite(flashMaterial);
  flash.visible = false;
  root.add(flash);
  let flashUntil = 0;

  const puffTexture = radialTexture('rgba(236,226,202,0.95)', 'rgba(236,226,202,0)');
  const puffs = Array.from({ length: 10 }, () => {
    const material = new THREE.SpriteMaterial({ map: puffTexture, depthWrite: false, transparent: true });
    materials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    root.add(sprite);
    return { sprite, material, born: 0 };
  });
  let puffIndex = 0;
  textures.push(flashTexture, puffTexture);
  materials.push(flashMaterial);

  // Moving characters use soft blob shadows so the sun's shadow map can stay static.
  const MAX_BLOBS = 96;
  const blobTexture = radialTexture('rgba(28,40,34,0.45)', 'rgba(28,40,34,0)');
  const blobGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMaterial = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false });
  const blobs = new THREE.InstancedMesh(blobGeometry, blobMaterial, MAX_BLOBS);
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.count = 0;
  root.add(blobs);
  textures.push(blobTexture);
  materials.push(blobMaterial);
  geometries.push(blobGeometry);
  const MAX_DROPS = 160;
  const dropGeometry = new THREE.IcosahedronGeometry(1, 0);
  const dropMaterial = new THREE.MeshBasicMaterial({ color: '#9a1616' });
  const drops = new THREE.InstancedMesh(dropGeometry, dropMaterial, MAX_DROPS);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.frustumCulled = false;
  drops.count = 0;
  root.add(drops);
  // Per droplet: x, y, z, vx, vy, vz, size.
  const dropState = new Float32Array(MAX_DROPS * 7);

  const MAX_SPLATS = 60;
  const splatTex = splatTexture();
  const splatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const splatMaterial = new THREE.MeshBasicMaterial({ map: splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const splats = new THREE.InstancedMesh(splatGeometry, splatMaterial, MAX_SPLATS);
  splats.frustumCulled = false;
  splats.count = 0;
  root.add(splats);
  let splatIndex = 0;
  textures.push(splatTex);
  materials.push(dropMaterial, splatMaterial);
  geometries.push(dropGeometry, splatGeometry);

  // Floating health bars: a dark backing and a coloured fill, both billboarded toward the camera.
  const MAX_BARS = 32;
  const barGeometry = new THREE.PlaneGeometry(1, 1);
  const barMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true });
  const barBack = new THREE.InstancedMesh(barGeometry, barMaterial, MAX_BARS);
  const barFill = new THREE.InstancedMesh(barGeometry, barMaterial, MAX_BARS);
  for (const mesh of [barBack, barFill]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    root.add(mesh);
  }
  barBack.renderOrder = 20;
  barFill.renderOrder = 21;
  const barColor = new THREE.Color();
  const healthy = new THREE.Color('#5fbf6a'), hurt = new THREE.Color('#e04a3a'), backing = new THREE.Color('#1d2a24');
  for (let i = 0; i < MAX_BARS; i++) barBack.setColorAt(i, backing);
  const barRight = new THREE.Vector3();
  let barCamera: THREE.Camera | null = null;
  geometries.push(barGeometry);
  materials.push(barMaterial);

  const smokeTexture = radialTexture('rgba(90,92,92,0.75)', 'rgba(90,92,92,0)');
  const smokes = Array.from({ length: 48 }, () => {
    const material = new THREE.SpriteMaterial({ map: smokeTexture, depthWrite: false, transparent: true });
    materials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    root.add(sprite);
    return { sprite, material, born: 0 };
  });
  let smokeIndex = 0;
  textures.push(smokeTexture);

  const blobMatrix = new THREE.Matrix4();
  const blobQuat = new THREE.Quaternion();
  const blobPos = new THREE.Vector3();
  const blobScale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  function splat(x: number, z: number, size: number) {
    blobQuat.setFromAxisAngle(yAxis, Math.random() * Math.PI * 2);
    blobMatrix.compose(blobPos.set(x, ground(x, z) + 0.03, z), blobQuat, blobScale.set(size, 1, size));
    splats.setMatrixAt(splatIndex, blobMatrix);
    splatIndex = (splatIndex + 1) % MAX_SPLATS;
    splats.count = Math.max(splats.count, splatIndex === 0 ? MAX_SPLATS : splatIndex);
    splats.instanceMatrix.needsUpdate = true;
  }

  return {
    /** Sprays `amount` droplets from a wound, biased along `dir`. */
    blood(at: THREE.Vector3, dir: THREE.Vector3, amount: number) {
      for (let n = 0; n < amount && drops.count < MAX_DROPS; n++) {
        const s = drops.count++ * 7;
        const push = 1.5 + Math.random() * 3.5;
        dropState[s] = at.x; dropState[s + 1] = at.y; dropState[s + 2] = at.z;
        dropState[s + 3] = dir.x * push + (Math.random() - 0.5) * 2.4;
        dropState[s + 4] = 1.2 + Math.random() * 3;
        dropState[s + 5] = dir.z * push + (Math.random() - 0.5) * 2.4;
        dropState[s + 6] = 0.04 + Math.random() * 0.07;
      }
    },
    /** Rising smoke from a damaged vehicle. */
    smoke(x: number, y: number, z: number, now: number, dark: boolean, tint?: string) {
      const puff = smokes[smokeIndex++ % smokes.length];
      puff.sprite.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      puff.material.color.set(tint ?? (dark ? '#3a3a3a' : '#9a9a96'));
      puff.born = now;
      puff.sprite.visible = true;
    },
    beginBars(camera: THREE.Camera) {
      barCamera = camera;
      barBack.count = 0;
      barFill.count = 0;
      barRight.setFromMatrixColumn(camera.matrixWorld, 0);
    },
    bar(x: number, y: number, z: number, fraction: number) {
      if (!barCamera || barBack.count >= MAX_BARS) return;
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const q = barCamera.quaternion;
      blobMatrix.compose(blobPos.set(x, y, z), q, blobScale.set(0.9, 0.13, 1));
      barBack.setMatrixAt(barBack.count++, blobMatrix);
      blobPos.addScaledVector(barRight, -0.42 * (1 - f));
      blobMatrix.compose(blobPos, q, blobScale.set(Math.max(0.001, 0.84 * f), 0.08, 1));
      barFill.setColorAt(barFill.count, barColor.copy(hurt).lerp(healthy, f));
      barFill.setMatrixAt(barFill.count++, blobMatrix);
    },
    endBars() {
      barBack.instanceMatrix.needsUpdate = true;
      barFill.instanceMatrix.needsUpdate = true;
      if (barBack.instanceColor) barBack.instanceColor.needsUpdate = true;
      if (barFill.instanceColor) barFill.instanceColor.needsUpdate = true;
    },
    /** A pool of blood on the ground, e.g. under a body that has come to rest. */
    pool(x: number, z: number, size = 2.2) { splat(x, z, size); },
    tracer(from: THREE.Vector3, to: THREE.Vector3, now: number) {
      const i = tracerIndex++ % TRACERS;
      const length = Math.max(0.01, from.distanceTo(to));
      tracerPath.set([from.x, from.y, from.z, (to.x - from.x) / length, (to.y - from.y) / length, (to.z - from.z) / length, length, now], i * 8);
      tracerExpiry[i] = now + (length / BULLET_SPEED) * 1000 + 40;
      tracersLive = true;
    },
    flash(at: THREE.Vector3, now: number, size = 1) {
      flash.position.copy(at);
      flash.scale.setScalar(size * (0.8 + Math.random() * 0.5));
      flash.material.rotation = Math.random() * Math.PI;
      flash.visible = true;
      flashUntil = now + 45;
    },
    puff(at: THREE.Vector3, now: number) {
      const puff = puffs[puffIndex++ % puffs.length];
      puff.sprite.position.copy(at);
      puff.born = now;
      puff.sprite.visible = true;
    },
    beginBlobs() { blobs.count = 0; },
    blob(x: number, y: number, z: number, width: number, length = width, yaw = 0) {
      if (blobs.count >= MAX_BLOBS) return;
      blobQuat.setFromAxisAngle(yAxis, yaw);
      blobMatrix.compose(blobPos.set(x, y, z), blobQuat, blobScale.set(width, 1, length));
      blobs.setMatrixAt(blobs.count++, blobMatrix);
    },
    endBlobs() { blobs.instanceMatrix.needsUpdate = true; },
    update(now: number, dt: number) {
      flash.visible = now < flashUntil;
      for (let i = 0; i < drops.count; i++) {
        const s = i * 7;
        dropState[s + 4] -= 18 * dt;
        dropState[s] += dropState[s + 3] * dt;
        dropState[s + 1] += dropState[s + 4] * dt;
        dropState[s + 2] += dropState[s + 5] * dt;
        if (dropState[s + 1] <= ground(dropState[s], dropState[s + 2])) {
          if (Math.random() < 0.35) splat(dropState[s], dropState[s + 2], 0.35 + dropState[s + 6] * 6);
          // Swap the last live droplet into this slot and revisit it.
          drops.count--;
          dropState.copyWithin(s, drops.count * 7, drops.count * 7 + 7);
          i--;
          continue;
        }
        blobMatrix.makeScale(dropState[s + 6], dropState[s + 6], dropState[s + 6]).setPosition(dropState[s], dropState[s + 1], dropState[s + 2]);
        drops.setMatrixAt(i, blobMatrix);
      }
      drops.instanceMatrix.needsUpdate = true;
      if (tracersLive) {
        tracersLive = false;
        for (let i = 0; i < TRACERS; i++) {
          if (tracerExpiry[i] === 0) continue;
          tracerAttribute.needsUpdate = true;
          if (now > tracerExpiry[i]) {
            tracerExpiry[i] = 0;
            tracerPositions.fill(0, i * 6, i * 6 + 6);
            continue;
          }
          tracersLive = true;
          // The head starts a streak's length out of the barrel so even one frame shows the shot.
          const p = i * 8, length = tracerPath[p + 6];
          const head = Math.min(length, STREAK + ((now - tracerPath[p + 7]) / 1000) * BULLET_SPEED);
          const tail = Math.max(0, head - STREAK);
          for (let k = 0; k < 3; k++) {
            tracerPositions[i * 6 + k] = tracerPath[p + k] + tracerPath[p + 3 + k] * tail;
            tracerPositions[i * 6 + 3 + k] = tracerPath[p + k] + tracerPath[p + 3 + k] * head;
          }
        }
      }
      for (const puff of smokes) {
        if (!puff.sprite.visible) continue;
        const age = (now - puff.born) / 1400;
        if (age >= 1) { puff.sprite.visible = false; continue; }
        puff.sprite.position.y += dt * 1.6;
        puff.sprite.scale.setScalar(0.6 + age * 2.2);
        puff.material.opacity = (1 - age) * 0.8;
      }
      for (const puff of puffs) {
        if (!puff.sprite.visible) continue;
        const age = (now - puff.born) / 450;
        if (age >= 1) { puff.sprite.visible = false; continue; }
        puff.sprite.scale.setScalar(0.4 + age * 1.4);
        puff.material.opacity = 1 - age;
      }
    },
    dispose() {
      scene.remove(root);
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
    },
  };
}

/** Low-poly gun meshes pointing along local +z, with the grip at the origin. Returns the group and its muzzle distance. */
export function makeGun(id: Exclude<WeaponId, 'fists'>) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#2b3230', roughness: 0.45, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4e2e', roughness: 0.8 });
  const part = (size: [number, number, number], pos: [number, number, number], mat: THREE.Material, tilt = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...pos);
    mesh.rotation.x = tilt;
    group.add(mesh);
  };
  let length = 0.5;
  if (id === 'pistol') {
    part([0.1, 0.14, 0.46], [0, 0.08, 0.14], metal);
    part([0.09, 0.24, 0.12], [0, -0.04, -0.03], metal, 0.25);
    length = 0.4;
  } else if (id === 'shotgun') {
    part([0.09, 0.09, 1.05], [0, 0.1, 0.45], metal);
    part([0.12, 0.1, 0.3], [0, 0.01, 0.6], wood);
    part([0.11, 0.18, 0.42], [0, 0.0, -0.18], wood);
    length = 0.98;
  } else {
    part([0.11, 0.17, 0.58], [0, 0.08, 0.2], metal);
    part([0.07, 0.28, 0.1], [0, -0.12, 0.26], metal, 0.15);
    part([0.05, 0.05, 0.28], [0, 0.1, 0.62], metal);
    part([0.09, 0.12, 0.26], [0, 0.03, -0.18], wood);
    length = 0.76;
  }
  return { group, length };
}
