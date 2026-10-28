import * as THREE from 'three';
import { HEROES, SHIELD_DURATION, shieldPosition, type HeroId, type HeroPower, type PowerPoint } from './powers';

/** Small, procedural costumes: no downloaded models or textures. */
export function createHeroLook(parent: THREE.Group) {
  const root = new THREE.Group(); parent.add(root);
  const outfits = new Map<HeroId, THREE.Group>();
  const mesh = (group: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, glow = false) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4, ...(glow ? { emissive: color, emissiveIntensity: 1.5 } : {}) });
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); group.add(m); return m;
  };
  const cube = (group: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => mesh(group, new THREE.BoxGeometry(sx, sy, sz), color, x, y, z);
  const disk = (group: THREE.Group, color: string, x: number, y: number, z: number, radius: number) => mesh(group, new THREE.CylinderGeometry(radius, radius, 0.08, 20), color, x, y, z);
  for (const id of ['ironman', 'thor', 'hulk', 'captain'] as const) { const group = new THREE.Group(); group.visible = false; root.add(group); outfits.set(id, group); }
  const iron = outfits.get('ironman')!;
  cube(iron, '#a72431', 0, 1.48, 0, 1.02, 1, 0.62);
  cube(iron, '#dcad48', 0, 2.23, 0.2, 0.69, 0.53, 0.48);
  cube(iron, '#d53b37', -0.65, 1.75, 0, 0.4, 0.4, 0.53); cube(iron, '#d53b37', 0.65, 1.75, 0, 0.4, 0.4, 0.53);
  mesh(iron, new THREE.SphereGeometry(0.16, 10, 6), '#83f4ff', 0, 1.62, 0.37, true);
  const jets = new THREE.Group(); iron.add(jets);
  for (const x of [-0.27, 0.27]) mesh(jets, new THREE.ConeGeometry(0.16, 0.8, 8), '#86ecff', x, -0.22, 0, true).rotation.z = Math.PI;
  const thor = outfits.get('thor')!;
  cube(thor, '#505d71', 0, 1.46, 0, 0.98, 0.98, 0.6);
  cube(thor, '#b52b37', 0, 1.26, -0.45, 1.15, 1.76, 0.11);
  for (const x of [-0.27, 0.27]) for (const y of [1.35, 1.76]) mesh(thor, new THREE.SphereGeometry(0.14, 8, 6), '#d0deeb', x, y, 0.35);
  cube(thor, '#765235', 0.88, 1.16, 0.13, 0.12, 0.9, 0.12); cube(thor, '#c3d9e8', 0.88, 1.65, 0.13, 0.8, 0.48, 0.45);
  const hulk = outfits.get('hulk')!;
  cube(hulk, '#72ad49', 0, 1.5, 0, 1.45, 1.1, 0.85);
  for (const x of [-0.93, 0.93]) { mesh(hulk, new THREE.SphereGeometry(0.42, 10, 7), '#72ad49', x, 1.67, 0); cube(hulk, '#79b34c', x, 1.17, 0.1, 0.48, 0.56, 0.55); }
  mesh(hulk, new THREE.SphereGeometry(0.45, 10, 7), '#79b34c', 0, 2.23, 0.06);
  cube(hulk, '#71548d', 0, 0.87, 0, 1.05, 0.48, 0.63);
  const captain = outfits.get('captain')!;
  cube(captain, '#2b5791', 0, 1.5, 0, 1.01, 0.98, 0.61);
  cube(captain, '#f6f0e1', 0, 1.64, 0.34, 0.2, 0.45, 0.06); cube(captain, '#f6f0e1', 0, 1.65, 0.35, 0.5, 0.14, 0.06);
  const shield = new THREE.Group(); shield.position.set(-0.76, 1.35, 0.32); shield.rotation.x = Math.PI / 2; captain.add(shield);
  for (const [radius, color, y] of [[0.58, '#c83740', 0], [0.43, '#f5eee4', 0.05], [0.3, '#b9283b', 0.1], [0.18, '#3472a3', 0.15]] as const) disk(shield, color, 0, y, 0, radius);
  return { root, update(id: HeroId, flying: boolean, time: number) { root.visible = id !== 'none'; for (const [key, group] of outfits) group.visible = key === id; jets.visible = flying; jets.scale.y = 0.85 + Math.sin(time * 35) * 0.15; } };
}

/** A bounded reusable pool; effects never accumulate meshes after long sessions. */
export function createPowerEffects(scene: THREE.Scene) {
  const root = new THREE.Group(); scene.add(root);
  const geometries = [new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.TorusGeometry(1, 0.055, 5, 40), new THREE.CylinderGeometry(0.65, 0.65, 0.14, 24)];
  const axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const slots = Array.from({ length: 16 }, () => {
    const group = new THREE.Group(); group.visible = false; root.add(group);
    const mat = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 1, depthWrite: false });
    const beam = new THREE.Mesh(geometries[0], mat), ring = new THREE.Mesh(geometries[1], mat), shield = new THREE.Mesh(geometries[2], mat);
    const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(27), 3));
    const boltMat = new THREE.LineBasicMaterial({ color: '#b9efff', transparent: true, depthWrite: false });
    const bolt = new THREE.Line(boltGeo, boltMat); group.add(beam, ring, shield, bolt);
    return { group, beam, ring, shield, bolt, mat, boltMat, boltGeo, kind: 'ironman' as HeroPower, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, start: -Infinity, duration: 0, home: undefined as (() => PowerPoint) | undefined };
  });
  let cursor = 0;
  return {
    cast(kind: HeroPower, from: PowerPoint, to: PowerPoint, now: number, home?: () => PowerPoint) {
      const slot = slots[cursor++ % slots.length]; slot.kind = kind; slot.from = { ...from }; slot.to = { ...to }; slot.start = now; slot.home = home;
      slot.duration = kind === 'captain' ? SHIELD_DURATION * 1000 : kind === 'hulk' ? 650 : 450;
      slot.mat.color.set(HEROES.find((h) => h.id === kind)!.color); slot.group.visible = true;
      slot.beam.visible = kind === 'ironman'; slot.ring.visible = kind === 'thor' || kind === 'hulk'; slot.shield.visible = kind === 'captain'; slot.bolt.visible = kind === 'thor';
      if (kind === 'ironman') { direction.set(to.x - from.x, to.y - from.y, to.z - from.z); slot.beam.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2); slot.beam.scale.set(0.13, direction.length(), 0.13); slot.beam.quaternion.setFromUnitVectors(axis, direction.normalize()); }
      slot.ring.position.set(to.x, to.y - (kind === 'hulk' ? 1 : 0.8), to.z); slot.ring.rotation.x = Math.PI / 2;
      if (kind === 'thor') { const positions = slot.boltGeo.attributes.position; for (let i = 0; i < 9; i++) positions.setXYZ(i, to.x + (i === 8 ? 0 : Math.sin(i * 7.1) * 0.9), to.y + (8 - i) * 2.5, to.z + (i === 8 ? 0 : Math.cos(i * 5.3) * 0.7)); positions.needsUpdate = true; slot.boltGeo.computeBoundingSphere(); }
    },
    update(now: number) {
      for (const slot of slots) {
        const age = now - slot.start, t = age / slot.duration;
        if (t >= 1 || t < 0) { slot.group.visible = false; continue; }
        slot.mat.opacity = slot.kind === 'captain' ? 1 : Math.max(0, 1 - t); slot.boltMat.opacity = Math.max(0, 1 - t);
        if (slot.kind === 'captain') { const p = shieldPosition(slot.from, slot.to, age / 1000, slot.home?.()); slot.shield.position.set(p.x, p.y, p.z); slot.shield.rotation.set(Math.PI / 2, t * 25, t * 20); }
        else slot.ring.scale.setScalar((slot.kind === 'hulk' ? 7 : 3.6) * t + 0.2);
      }
    },
    clear() { for (const slot of slots) { slot.start = -Infinity; slot.group.visible = false; slot.home = undefined; } },
    dispose() { scene.remove(root); geometries.forEach((g) => g.dispose()); slots.forEach((s) => { s.mat.dispose(); s.boltMat.dispose(); s.boltGeo.dispose(); }); root.clear(); },
  };
}
