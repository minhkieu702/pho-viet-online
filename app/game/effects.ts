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

/** Pooled shot effects and blob shadows; each pool is a single draw call regardless of how busy the street gets. */
export function createEffects(scene: THREE.Scene) {
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const root = new THREE.Group();
  scene.add(root);

  const TRACERS = 32;
  const tracerPositions = new Float32Array(TRACERS * 6);
  const tracerExpiry = new Float64Array(TRACERS);
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
  const MAX_BLOBS = 64;
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
  const blobMatrix = new THREE.Matrix4();
  const blobQuat = new THREE.Quaternion();
  const blobPos = new THREE.Vector3();
  const blobScale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  return {
    tracer(from: THREE.Vector3, to: THREE.Vector3, now: number) {
      const i = tracerIndex++ % TRACERS;
      tracerPositions.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
      tracerExpiry[i] = now + 70;
      tracerAttribute.needsUpdate = true;
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
    update(now: number) {
      flash.visible = now < flashUntil;
      if (tracersLive) {
        tracersLive = false;
        for (let i = 0; i < TRACERS; i++) {
          if (tracerExpiry[i] === 0) continue;
          if (now > tracerExpiry[i]) {
            tracerExpiry[i] = 0;
            tracerPositions.fill(0, i * 6, i * 6 + 6);
            tracerAttribute.needsUpdate = true;
          } else tracersLive = true;
        }
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
