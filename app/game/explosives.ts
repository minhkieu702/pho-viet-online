import * as THREE from 'three';
import type { Projectile, WeaponId } from './weapons';

export type Explosion = { x: number; y: number; z: number; radius: number; damage: number };
type Shell = { kind: WeaponId; def: Projectile; pos: THREE.Vector3; vel: THREE.Vector3; age: number; bounced: number; trailAt: number };

function glowTexture(stops: [number, string][]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Rockets and grenades in flight, plus the fireball, smoke and scorch of each blast.
 * Projectiles are a handful of instanced meshes; blasts reuse a small sprite pool.
 */
export function createExplosives(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const root = new THREE.Group();
  scene.add(root);
  const shells: Shell[] = [];
  const MAX_SHELLS = 12;
  const rocketGeometry = new THREE.CylinderGeometry(0.07, 0.09, 0.7, 8).rotateX(Math.PI / 2);
  const grenadeGeometry = new THREE.SphereGeometry(0.11, 8, 6);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: '#4a5a3a', roughness: 0.5, metalness: 0.4 });
  const rockets = new THREE.InstancedMesh(rocketGeometry, shellMaterial, MAX_SHELLS);
  const grenades = new THREE.InstancedMesh(grenadeGeometry, shellMaterial, MAX_SHELLS);
  for (const mesh of [rockets, grenades]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    root.add(mesh);
  }

  const fireTexture = glowTexture([[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,190,80,0.95)'], [0.6, 'rgba(230,80,20,0.6)'], [1, 'rgba(120,30,10,0)']]);
  const smokeTexture = glowTexture([[0, 'rgba(70,66,62,0.85)'], [1, 'rgba(70,66,62,0)']]);
  const trailTexture = glowTexture([[0, 'rgba(235,232,225,0.8)'], [1, 'rgba(235,232,225,0)']]);
  type Puff = { sprite: THREE.Sprite; material: THREE.SpriteMaterial; born: number; life: number; grow: number; rise: number; fade: number };
  const makePool = (texture: THREE.Texture, count: number, additive: boolean) => Array.from({ length: count }, () => {
    const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    root.add(sprite);
    return { sprite, material, born: 0, life: 1, grow: 1, rise: 0, fade: 1 } as Puff;
  });
  const fires = makePool(fireTexture, 10, true);
  const flames = makePool(fireTexture, 48, true);
  const smokes = makePool(smokeTexture, 48, false);
  let flameIndex = 0;
  // Burning spots (wrecks, scorched ground) keep emitting flames and smoke until they burn out.
  const burns: { x: number; y: number; z: number; until: number; size: number; next: number }[] = [];
  // Debris chunks thrown by a blast, one instanced mesh.
  const MAX_DEBRIS = 60;
  const debrisGeometry = new THREE.BoxGeometry(1, 1, 1);
  const debrisMaterial = new THREE.MeshStandardMaterial({ color: '#3a3532', roughness: 0.9 });
  const debris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, MAX_DEBRIS);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  debris.count = 0;
  root.add(debris);
  const chunks: { pos: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler; size: number; until: number }[] = [];
  const trails = makePool(trailTexture, 40, false);
  let fireIndex = 0, smokeIndex = 0, trailIndex = 0;
  function emit(pool: Puff[], index: number, at: THREE.Vector3, now: number, life: number, size: number, grow: number, rise: number, opacity: number) {
    const puff = pool[index % pool.length];
    puff.sprite.position.copy(at);
    puff.sprite.scale.setScalar(size);
    puff.material.opacity = opacity;
    puff.material.rotation = Math.random() * Math.PI * 2;
    Object.assign(puff, { born: now, life, grow, rise, fade: opacity });
    puff.sprite.visible = true;
  }

  // Scorch marks share one instanced decal.
  const MAX_SCORCH = 24;
  const scorchTexture = glowTexture([[0, 'rgba(20,18,16,0.85)'], [0.55, 'rgba(30,26,22,0.55)'], [1, 'rgba(30,26,22,0)']]);
  const scorchMaterial = new THREE.MeshBasicMaterial({ map: scorchTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const scorchGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const scorches = new THREE.InstancedMesh(scorchGeometry, scorchMaterial, MAX_SCORCH);
  scorches.frustumCulled = false;
  scorches.count = 0;
  root.add(scorches);
  let scorchIndex = 0;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();
  const step = new THREE.Vector3();

  function burn(x: number, y: number, z: number, seconds: number, size: number, now: number) {
    if (burns.length > 10) burns.shift();
    burns.push({ x, y, z, until: now + seconds * 1000, size, next: 0 });
  }

  function boom(at: THREE.Vector3, radius: number, now: number) {
    for (let i = 0; i < 8; i++) {
      if (chunks.length >= MAX_DEBRIS) chunks.shift();
      const a = Math.random() * Math.PI * 2, up = 5 + Math.random() * 7, out = 3 + Math.random() * 6;
      chunks.push({ pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), rot: new THREE.Euler(), size: 0.12 + Math.random() * 0.22, until: now + 6000 });
    }
    // Small fires stay on the ground after the blast.
    burn(at.x, ground(at.x, at.z) + 0.2, at.z, 6 + Math.random() * 4, radius * 0.25, now);
    emit(fires, fireIndex++, at, now, 520, radius * 0.5, radius * 1.4, 1.5, 1);
    emit(fires, fireIndex++, pos.copy(at).add(step.set(0, 0.6, 0)), now, 380, radius * 0.35, radius, 2.5, 0.9);
    for (let i = 0; i < 6; i++) {
      pos.set(at.x + (Math.random() - 0.5) * radius * 0.6, at.y + Math.random() * radius * 0.3, at.z + (Math.random() - 0.5) * radius * 0.6);
      emit(smokes, smokeIndex++, pos, now + i * 40, 1800 + Math.random() * 900, radius * 0.4, radius * 1.1, 2.2, 0.85);
    }
    quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI * 2);
    matrix.compose(pos.set(at.x, ground(at.x, at.z) + 0.035, at.z), quat, scale.set(radius * 0.9, 1, radius * 0.9));
    scorches.setMatrixAt(scorchIndex, matrix);
    scorchIndex = (scorchIndex + 1) % MAX_SCORCH;
    scorches.count = Math.max(scorches.count, scorchIndex === 0 ? MAX_SCORCH : scorchIndex);
    scorches.instanceMatrix.needsUpdate = true;
  }

  return {
    /** Fires a projectile from `origin` along the normalised `direction`. */
    launch(kind: WeaponId, def: Projectile, origin: THREE.Vector3, direction: THREE.Vector3) {
      if (shells.length >= MAX_SHELLS) shells.shift();
      // Grenades are lobbed: add some loft so they arc.
      const vel = direction.clone().multiplyScalar(def.speed);
      if (def.gravity > 0) vel.y += def.speed * 0.28;
      shells.push({ kind, def, pos: origin.clone(), vel, age: 0, bounced: 0, trailAt: 0 });
    },
    /** A detonation not caused by a shell, e.g. a car blowing up. */
    detonate(at: THREE.Vector3, radius: number, now: number) { boom(at, radius, now); },
    /** Sets something on fire for a few seconds (a wrecked car before and after it blows). */
    burn,
    /**
     * Moves shells; `hit` returns the distance to the first solid thing along a segment (or null).
     * Returns the blasts that happened this frame for the caller to apply damage.
     */
    update(dt: number, now: number, hit: (origin: THREE.Vector3, dir: THREE.Vector3, maxT: number, kind: WeaponId) => number | null) {
      const blasts: Explosion[] = [];
      for (let i = shells.length - 1; i >= 0; i--) {
        const shell = shells[i];
        shell.age += dt;
        shell.vel.y -= shell.def.gravity * dt;
        step.copy(shell.vel).multiplyScalar(dt);
        const length = step.length();
        dir.copy(step).divideScalar(length || 1);
        const t = length > 0 ? hit(shell.pos, dir, length, shell.kind) : null;
        let explode = shell.age > shell.def.fuse;
        if (t !== null) {
          if (shell.kind === 'grenade' && shell.bounced < 2 && shell.age < shell.def.fuse) {
            // Grenades bounce off whatever they touch and keep rolling until the fuse runs out.
            shell.pos.addScaledVector(dir, Math.max(0, t - 0.05));
            const floor = ground(shell.pos.x, shell.pos.z) + 0.12;
            if (shell.pos.y <= floor + 0.15) { shell.vel.y = Math.abs(shell.vel.y) * 0.35; shell.vel.x *= 0.55; shell.vel.z *= 0.55; }
            else { shell.vel.x *= -0.4; shell.vel.z *= -0.4; }
            shell.bounced++;
          } else {
            shell.pos.addScaledVector(dir, t);
            explode = true;
          }
        } else shell.pos.add(step);
        const floor = ground(shell.pos.x, shell.pos.z) + 0.12;
        if (shell.pos.y < floor) {
          shell.pos.y = floor;
          if (shell.kind === 'grenade') { shell.vel.y = Math.abs(shell.vel.y) * 0.3; shell.vel.x *= 0.6; shell.vel.z *= 0.6; }
          else explode = true;
        }
        if (shell.kind === 'rpg' && now > shell.trailAt) {
          shell.trailAt = now + 25;
          emit(trails, trailIndex++, shell.pos, now, 700, 0.35, 1.2, 0.3, 0.7);
        }
        if (explode) {
          boom(shell.pos, shell.def.radius, now);
          blasts.push({ x: shell.pos.x, y: shell.pos.y, z: shell.pos.z, radius: shell.def.radius, damage: shell.def.damage });
          shells.splice(i, 1);
        }
      }
      let r = 0, g = 0;
      for (const shell of shells) {
        dir.copy(shell.vel).normalize();
        quat.setFromUnitVectors(forward, dir);
        matrix.compose(shell.pos, quat, scale.set(1, 1, 1));
        if (shell.kind === 'rpg') rockets.setMatrixAt(r++, matrix);
        else grenades.setMatrixAt(g++, matrix);
      }
      rockets.count = r;
      grenades.count = g;
      rockets.instanceMatrix.needsUpdate = true;
      grenades.instanceMatrix.needsUpdate = true;
      for (const spot of burns) {
        if (now > spot.until || now < spot.next) continue;
        spot.next = now + 70;
        pos.set(spot.x + (Math.random() - 0.5) * spot.size * 2, spot.y, spot.z + (Math.random() - 0.5) * spot.size * 2);
        emit(flames, flameIndex++, pos, now, 500 + Math.random() * 300, spot.size * (0.8 + Math.random() * 0.6), spot.size * 0.6, 2.2, 0.9);
        if (Math.random() < 0.35) emit(smokes, smokeIndex++, pos.setY(spot.y + spot.size), now, 1800, spot.size * 1.2, spot.size * 1.6, 2.4, 0.6);
      }
      for (let i = burns.length - 1; i >= 0; i--) if (now > burns[i].until) burns.splice(i, 1);
      let n = 0;
      for (let i = chunks.length - 1; i >= 0; i--) {
        const chunk = chunks[i];
        if (now > chunk.until) { chunks.splice(i, 1); continue; }
        chunk.vel.y -= 20 * dt;
        chunk.pos.addScaledVector(chunk.vel, dt);
        const floor = ground(chunk.pos.x, chunk.pos.z) + chunk.size / 2;
        if (chunk.pos.y < floor) { chunk.pos.y = floor; chunk.vel.multiplyScalar(0.4); chunk.vel.y = Math.abs(chunk.vel.y) * 0.3; chunk.spin.multiplyScalar(0.5); }
        chunk.rot.x += chunk.spin.x * dt; chunk.rot.y += chunk.spin.y * dt; chunk.rot.z += chunk.spin.z * dt;
        matrix.compose(chunk.pos, quat.setFromEuler(chunk.rot), scale.setScalar(chunk.size));
        debris.setMatrixAt(n++, matrix);
      }
      debris.count = n;
      debris.instanceMatrix.needsUpdate = true;
      for (const pool of [fires, flames, smokes, trails]) {
        for (const puff of pool) {
          if (!puff.sprite.visible) continue;
          const age = (now - puff.born) / puff.life;
          if (age < 0) continue;
          if (age >= 1) { puff.sprite.visible = false; continue; }
          puff.sprite.position.y += puff.rise * dt;
          puff.sprite.scale.setScalar(puff.sprite.scale.x + puff.grow * dt);
          puff.material.opacity = puff.fade * (1 - age);
        }
      }
      return blasts;
    },
    dispose() {
      scene.remove(root);
      for (const mesh of [rockets, grenades, scorches, debris]) mesh.dispose();
      debrisGeometry.dispose(); debrisMaterial.dispose();
      for (const texture of [fireTexture, smokeTexture, trailTexture, scorchTexture]) texture.dispose();
      for (const pool of [fires, flames, smokes, trails]) for (const puff of pool) puff.material.dispose();
      rocketGeometry.dispose(); grenadeGeometry.dispose(); scorchGeometry.dispose();
      shellMaterial.dispose(); scorchMaterial.dispose();
    },
  };
}
