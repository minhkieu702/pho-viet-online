import * as THREE from 'three';
import { BIKES, type BikeId } from './bikes';
import { WEAPONS, formatCash, type WeaponId } from './weapons';

/**
 * Inside the shops you can buy from: the gun store, the motorbike showroom and the hospital. Each is a
 * closed room built far off the map (the camera looks away from the city), stocked with exactly what the
 * shop sells using the game's own models, with price tags, a clerk and a customer (the player). The game
 * moves the camera in while the shop is open and can fly it to any product.
 */
export type InteriorKind = 'gun' | 'bike' | 'hospital';
type Vec3 = [number, number, number];
/** `grow`: the object is centred on the product (a gun holder, a turntable) so it can scale and turn in place. */
type Product = { id: string; object: THREE.Object3D; center: THREE.Vector3; eye: THREE.Vector3; tag: THREE.Sprite | null; spin: number; grow: boolean; label: () => string };
type Room = { group: THREE.Group; eye: THREE.Vector3; look: THREE.Vector3; products: Map<string, Product>; clerk: THREE.Object3D | null };
export type InteriorFactories = {
  gun: (id: Exclude<WeaponId, 'fists'>) => THREE.Object3D;
  bike: (id: BikeId, color: string) => THREE.Object3D;
  person: (shirt: string, hair?: string) => THREE.Object3D;
};
export type ShopInfo = { owned: WeaponId[]; bike: BikeId };

/** Rooms sit this far down the -z axis, so the city is always behind the camera. */
const ORIGIN_Z = -2400;
const PI = Math.PI;

export function createInteriors(scene: THREE.Scene, make: InteriorFactories) {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  geometries.push(box, cyl);
  const cache = new Map<string, THREE.Material>();
  const mat = (color: string, roughness = 0.8, metalness = 0) => {
    const key = `${color}|${roughness}|${metalness}`;
    let m = cache.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); cache.set(key, m); materials.push(m); }
    return m;
  };
  const glow = (color: string) => {
    const key = `glow|${color}`;
    let m = cache.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); cache.set(key, m); materials.push(m); }
    return m;
  };
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe3e6', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false });
  materials.push(glass);

  function put(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, at: Vec3, size: Vec3, rot: Vec3 = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    mesh.scale.set(...size);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }
  const cube = (parent: THREE.Object3D, color: string | THREE.Material, at: Vec3, size: Vec3, rot: Vec3 = [0, 0, 0]) =>
    put(parent, box, typeof color === 'string' ? mat(color) : color, at, size, rot);
  const drum = (parent: THREE.Object3D, color: string | THREE.Material, at: Vec3, radius: number, height: number, rot: Vec3 = [0, 0, 0]) =>
    put(parent, cyl, typeof color === 'string' ? mat(color) : color, at, [radius, height, radius], rot);

  /** A canvas text panel: price tags, signs and posters. */
  function textPanel(lines: { text: string; size: number; color: string; weight?: number }[], background: string, width = 512, height = 192, border?: string) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(4, 4, width - 8, height - 8, 22);
    ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 8; ctx.stroke(); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lines.reduce((sum, l) => sum + l.size * 1.2, 0);
    let y = height / 2 - total / 2;
    for (const line of lines) {
      ctx.font = `${line.weight ?? 800} ${line.size}px Arial, sans-serif`;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, width / 2, y + line.size * 0.6, width - 30);
      y += line.size * 1.2;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }
  function sign(parent: THREE.Object3D, lines: Parameters<typeof textPanel>[0], background: string, at: Vec3, width: number, rotY = 0, border?: string) {
    const texture = textPanel(lines, background, 512, 160, border);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    materials.push(material);
    const plane = new THREE.PlaneGeometry(width, width * 160 / 512);
    geometries.push(plane);
    const mesh = new THREE.Mesh(plane, material);
    mesh.position.set(...at);
    mesh.rotation.y = rotY;
    parent.add(mesh);
    return mesh;
  }
  /** A price tag floating by a product; its text is redrawn when ownership changes. */
  function tag(parent: THREE.Object3D, at: Vec3, scale = 0.62) {
    const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    materials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...at);
    sprite.scale.set(scale * 2.6, scale, 1);
    sprite.renderOrder = 3;
    parent.add(sprite);
    return sprite;
  }
  function writeTag(sprite: THREE.Sprite, text: string) {
    const [name, price] = text.split('\n');
    const old = (sprite.material as THREE.SpriteMaterial).map;
    const texture = textPanel([{ text: name, size: 54, color: '#233b32' }, { text: price ?? '', size: 46, color: price?.startsWith('Đ') ? '#3f6f9f' : '#c25a33' }], '#fffaf0f2', 512, 196, '#233b3233');
    (sprite.material as THREE.SpriteMaterial).map = texture;
    sprite.material.needsUpdate = true;
    if (old) { old.dispose(); textures.splice(textures.indexOf(old), 1); }
  }

  /** Floor, ceiling and four walls of a `w` × `d` room, `h` tall; the camera side is +z. */
  function shell(group: THREE.Group, w: number, d: number, h: number, floor: string, wall: string, ceiling = '#ece8dc') {
    cube(group, floor, [0, -0.05, 0], [w, 0.1, d]);
    cube(group, ceiling, [0, h + 0.05, 0], [w, 0.1, d]);
    cube(group, wall, [0, h / 2, -d / 2 - 0.1], [w, h, 0.2]);
    cube(group, wall, [0, h / 2, d / 2 + 0.1], [w, h, 0.2]);
    cube(group, wall, [-w / 2 - 0.1, h / 2, 0], [0.2, h, d]);
    cube(group, wall, [w / 2 + 0.1, h / 2, 0], [0.2, h, d]);
    // Skirting and ceiling lights.
    for (const [x, z, sx, sz] of [[0, -d / 2 + 0.02, w, 0.04], [-w / 2 + 0.02, 0, 0.04, d], [w / 2 - 0.02, 0, 0.04, d]] as const) cube(group, '#3b3a35', [x, 0.06, z], [sx, 0.12, sz]);
    for (let x = -w / 2 + w / 6; x < w / 2; x += w / 3) for (const z of [-d / 4, d / 4]) cube(group, glow('#fff4dc'), [x, h - 0.02, z], [1.4, 0.04, 0.5]);
  }

  function room(index: number) {
    const group = new THREE.Group();
    group.position.set(index * 80, 0, ORIGIN_Z);
    group.visible = false;
    scene.add(group);
    return group;
  }
  const world = (group: THREE.Group, local: Vec3) => new THREE.Vector3(...local).add(group.position);
  const product = (r: Room, id: string, object: THREE.Object3D, center: Vec3, eye: Vec3, label: () => string, tagAt: Vec3 | null, o: { spin?: number; tagScale?: number; grow?: boolean } = {}) => {
    const sprite = tagAt ? tag(r.group, tagAt, o.tagScale ?? 0.5) : null;
    r.products.set(id, { id, object, center: world(r.group, center), eye: world(r.group, eye), tag: sprite, spin: o.spin ?? 0, grow: o.grow ?? false, label });
  };
  const tyre = new THREE.TorusGeometry(0.32, 0.11, 8, 18);
  geometries.push(tyre);
  let info: ShopInfo = { owned: ['fists'], bike: 'scooter' };

  // ---- Gun store: pegboard wall of guns, a glass counter, ammo shelves, posters and a neon sign. ----
  const gun: Room = { group: room(0), eye: new THREE.Vector3(), look: new THREE.Vector3(), products: new Map(), clerk: null };
  {
    const g = gun.group;
    shell(g, 10, 8, 3.4, '#5a4636', '#68736c', '#3f423e');
    for (let x = -4.6; x <= 4.6; x += 0.46) cube(g, '#4c3b2e', [x, 0.003, 0], [0.02, 0.01, 8]);
    // Pegboard with a frame and a stencilled header.
    cube(g, '#b99f74', [0, 2.05, -3.88], [8.2, 2.3, 0.06]);
    cube(g, '#3b2f25', [0, 3.24, -3.86], [8.4, 0.12, 0.1]);
    cube(g, '#3b2f25', [0, 0.86, -3.86], [8.4, 0.12, 0.1]);
    for (let x = -3.9; x <= 3.9; x += 0.3) for (let y = 1.05; y <= 3.1; y += 0.3) cube(g, '#8e7754', [x, y, -3.84], [0.03, 0.03, 0.01]);
    sign(g, [{ text: 'TIỆM SÚNG AN HÒA', size: 64, color: '#ffcf5a' }, { text: 'VŨ KHÍ • ĐẠN DƯỢC • 24/7', size: 32, color: '#f2e2c0', weight: 600 }], '#1d2a24', [0, 3.0, -3.8], 2.6, 0, '#ffcf5a');
    const racks: [Exclude<WeaponId, 'fists'>, Vec3, number][] = [
      ['shotgun', [-2.6, 2.5, -3.7], 1.5], ['smg', [2.6, 2.5, -3.7], 1.7], ['rpg', [0, 2.05, -3.68], 1.3],
      ['grenade', [-2.5, 1.6, -3.7], 1.8], ['pistol', [2.5, 1.6, -3.7], 2.4],
    ];
    for (const [id, at, scale] of racks) {
      const holder = new THREE.Group();
      holder.position.set(...at);
      const model = make.gun(id);
      model.scale.setScalar(scale);
      model.rotation.y = PI / 2;
      holder.add(model);
      g.add(holder);
      for (const dx of [-0.35, 0.35]) cube(g, '#2a2622', [at[0] + dx, at[1] - 0.12, -3.8], [0.05, 0.05, 0.2]);
      const def = WEAPONS.find((w) => w.id === id)!;
      product(gun, id, holder, at, [at[0] * 0.55, at[1] + 0.1, -1.0], () => `${def.name}\n${info.owned.includes(id) ? 'Đã có' : formatCash(def.price)}`, [at[0], at[1] - 0.52, -3.55], { tagScale: 0.42, grow: true });
    }
    // Glass display counter with pistols and boxes inside, and a till.
    cube(g, '#2f2a25', [0, 0.35, -1.5], [5.6, 0.7, 0.8]);
    put(g, box, glass, [0, 0.87, -1.5], [5.6, 0.34, 0.8]);
    cube(g, '#c8c2b2', [0, 1.05, -1.5], [5.7, 0.03, 0.85]);
    for (let i = 0; i < 4; i++) {
      const p = make.gun('pistol');
      p.scale.setScalar(1.6);
      p.rotation.set(0, PI / 2 + 0.3 * (i - 1.5), 0);
      p.position.set(-2 + i * 1.3, 0.78, -1.5);
      g.add(p);
    }
    cube(g, '#1e2422', [2.2, 1.2, -1.55], [0.5, 0.26, 0.4]);
    cube(g, '#4fbf7a', [2.2, 1.35, -1.42], [0.3, 0.12, 0.02]);
    // Ammo shelves on the left wall: one shelf of boxes per gun.
    const ammoColors: Record<string, string> = { pistol: '#c9a227', shotgun: '#b83c2e', smg: '#3f6f9f', grenade: '#5f7a3a', rpg: '#6b4a32' };
    const shelfIds: Exclude<WeaponId, 'fists'>[] = ['pistol', 'shotgun', 'smg', 'grenade', 'rpg'];
    shelfIds.forEach((id, row) => {
      const y = 0.45 + row * 0.55;
      cube(g, '#6a5440', [-4.75, y, -0.6], [0.45, 0.05, 3.4]);
      const stack = new THREE.Group();
      g.add(stack);
      for (let k = 0; k < 7; k++) cube(stack, ammoColors[id], [-4.72, y + 0.14, -2 + k * 0.45], [0.32, 0.22, 0.34]);
      const def = WEAPONS.find((w) => w.id === id)!;
      product(gun, `ammo-${id}`, stack, [-4.7, y + 0.15, -0.6], [-2.4, y + 0.6, 1.2], () => `Đạn ${def.name.toLowerCase()}\n+${def.ammoPack} viên · ${formatCash(def.ammoPrice)}`, [-4.2, y + 0.32, 1.25], { tagScale: 0.32 });
    });
    // A shooting target poster, a flag and a camouflage net on the right wall.
    sign(g, [{ text: '◎', size: 120, color: '#c0392b' }, { text: 'TẬP BẮN MỖI NGÀY', size: 30, color: '#233b32' }], '#f2ede0', [4.86, 1.9, -1.4], 1.6, -PI / 2);
    cube(g, '#4b5a35', [4.85, 2.6, 1.4], [0.04, 1.2, 2.2]);
    gun.clerk = make.person('#3f4a3a', '#1d1916');
    gun.clerk.position.set(1.2, 0, -2.45);
    g.add(gun.clerk);
    gun.eye.copy(world(g, [0, 2.15, 3.7]));
    gun.look.copy(world(g, [0, 1.55, -3.2]));
  }

  // ---- Motorbike showroom: turntables in an arc, the horse in a straw stall, a repair corner. ----
  const bike: Room = { group: room(1), eye: new THREE.Vector3(), look: new THREE.Vector3(), products: new Map(), clerk: null };
  {
    const g = bike.group;
    shell(g, 16, 10, 4, '#e6e2d6', '#f1efe8');
    for (let x = -7.5; x <= 7.5; x += 1) cube(g, '#d3cfc2', [x, 0.004, 0], [0.025, 0.01, 10]);
    for (let z = -4.5; z <= 4.5; z += 1) cube(g, '#d3cfc2', [0, 0.004, z], [16, 0.01, 0.025]);
    cube(g, '#5e927c', [0, 1.2, -4.88], [16, 0.25, 0.04]);
    sign(g, [{ text: 'CỬA HÀNG XE MÁY AN HÒA', size: 58, color: '#ffffff' }, { text: 'XE MỚI • SỬA CHỮA • BẢO HÀNH', size: 30, color: '#d8efe2', weight: 600 }], '#2f5a48', [0, 3.15, -4.86], 5.2);
    // Shop window onto the street on the right wall.
    cube(g, '#9fb6bf', [7.88, 1.9, -0.6], [0.04, 2.2, 5]);
    cube(g, '#c9b48a', [7.86, 1.25, -0.6], [0.03, 0.9, 5]);
    for (const z of [-3.1, -0.6, 1.9]) cube(g, '#4a4f4c', [7.84, 1.9, z], [0.06, 2.3, 0.08]);
    const stands: [BikeId, Vec3][] = [['cub', [-5.6, 0, -1.6]], ['scooter', [-2.8, 0, -2.4]], ['vespa', [0, 0, -2.7]], ['sport', [2.8, 0, -2.4]]];
    for (const [id, at] of stands) {
      const def = BIKES.find((b) => b.id === id)!;
      drum(g, '#3a3f3c', [at[0], 0.08, at[2]], 1.25, 0.16);
      drum(g, glow('#9fe0c0'), [at[0], 0.17, at[2]], 1.27, 0.02);
      const turntable = new THREE.Group();
      turntable.position.set(at[0], 0.18, at[2]);
      const model = make.bike(id, def.color);
      model.rotation.y = 0.6;
      turntable.add(model);
      g.add(turntable);
      product(bike, id, turntable, [at[0], 0.8, at[2]], [at[0] * 0.75, 1.8, at[2] + 3.9], () => `${def.name}\n${info.bike === id ? 'Đang dùng' : formatCash(def.price)}`, [at[0], 2.15, at[2]], { spin: 0.35, grow: true });
    }
    // The horse stands on straw behind a low wooden fence.
    {
      const at: Vec3 = [5.9, 0, -2.2];
      cube(g, '#d9b65a', [at[0], 0.04, at[2]], [3, 0.08, 2.6]);
      for (const dx of [-1.4, 1.4]) cube(g, '#7a5a3c', [at[0] + dx, 0.5, at[2] + 1.2], [0.1, 1, 0.1]);
      cube(g, '#7a5a3c', [at[0], 0.8, at[2] + 1.25], [2.9, 0.1, 0.06]);
      cube(g, '#c9a24a', [at[0] + 1, 0.3, at[2] - 0.8], [0.9, 0.6, 0.6]);
      const def = BIKES.find((b) => b.id === 'horse')!;
      const stall = new THREE.Group();
      stall.position.set(at[0], 0.08, at[2]);
      const model = make.bike('horse', def.color);
      model.rotation.y = -0.9;
      stall.add(model);
      g.add(stall);
      product(bike, 'horse', stall, [at[0], 1.2, at[2]], [4.2, 2.1, 1.4], () => `${def.name}\n${info.bike === 'horse' ? 'Đang dùng' : formatCash(def.price)}`, [at[0], 2.55, at[2]], { grow: true });
    }
    // Repair corner: workbench, tool board, tyres and oil cans.
    const repair = new THREE.Group();
    g.add(repair);
    cube(repair, '#7a5a3c', [-6.6, 0.85, -4.3], [2.4, 0.08, 0.9]);
    for (const dx of [-1.1, 1.1]) cube(repair, '#4a3a2c', [-6.6 + dx, 0.42, -4.3], [0.08, 0.84, 0.8]);
    cube(repair, '#c9c2b0', [-6.6, 2.1, -4.86], [2.4, 1.3, 0.04]);
    for (let i = 0; i < 6; i++) cube(repair, '#55595b', [-7.5 + i * 0.36, 2.1, -4.82], [0.06, 0.7, 0.03], [0, 0, (i % 2 ? 1 : -1) * 0.25]);
    for (let i = 0; i < 4; i++) put(repair, tyre, mat('#1c1f21', 0.9), [-7.4, 0.11 + i * 0.22, -2.8], [1, 1, 1], [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) drum(repair, i % 2 ? '#c0392b' : '#e2b53a', [-5.4 + i * 0.32, 1.04, -4.25], 0.11, 0.3);
    product(bike, 'repair', repair, [-6.6, 1.1, -4], [-4.6, 2.0, -0.6], () => 'Sửa xe\n', null);
    bike.clerk = make.person('#2f5a48', '#2a2220');
    bike.clerk.position.set(-4.2, 0, -3.8);
    bike.clerk.rotation.y = 0.5;
    g.add(bike.clerk);
    bike.eye.copy(world(g, [0, 2.7, 4.6]));
    bike.look.copy(world(g, [0, 0.9, -2]));
  }

  // ---- Hospital: reception, waiting chairs, a bed with a curtain and a monitor, a medicine cabinet. ----
  const hospital: Room = { group: room(2), eye: new THREE.Vector3(), look: new THREE.Vector3(), products: new Map(), clerk: null };
  {
    const g = hospital.group;
    shell(g, 12, 9, 3.4, '#cfd9d6', '#eef3f1', '#f4f6f4');
    cube(g, '#7fc4b0', [0, 1.05, -4.38], [12, 0.18, 0.04]);
    sign(g, [{ text: '✚ BỆNH VIỆN AN HÒA', size: 60, color: '#ffffff' }, { text: 'KHÁM • BĂNG BÓ • CẤP CỨU 24/7', size: 30, color: '#e3f5ee', weight: 600 }], '#2f8a6a', [0, 2.85, -4.36], 4.2);
    // Reception desk on the left with a nurse behind it.
    cube(g, '#e8ecea', [-3.6, 0.55, -1.2], [2.8, 1.1, 0.7]);
    cube(g, '#7fc4b0', [-3.6, 1.12, -1.2], [2.9, 0.05, 0.8]);
    cube(g, '#20262a', [-3.2, 1.35, -1.3], [0.5, 0.36, 0.05]);
    // Waiting chairs along the right wall.
    for (let i = 0; i < 4; i++) {
      const z = -1.6 + i * 0.75;
      cube(g, '#3f7fbf', [5.3, 0.45, z], [0.6, 0.08, 0.6]);
      cube(g, '#3f7fbf', [5.6, 0.75, z], [0.08, 0.6, 0.6]);
      cube(g, '#9aa3a6', [5.3, 0.22, z], [0.05, 0.45, 0.05]);
    }
    // The bed: frame, mattress, pillow and sheet, a curtain rail, an IV stand and a heart monitor.
    const bed = new THREE.Group();
    g.add(bed);
    cube(bed, '#c9d2d4', [0.6, 0.4, -2.9], [1.1, 0.1, 2.2]);
    for (const dx of [-0.5, 0.5]) for (const dz of [-1, 1]) cube(bed, '#9aa3a6', [0.6 + dx, 0.2, -2.9 + dz], [0.05, 0.4, 0.05]);
    cube(bed, '#ffffff', [0.6, 0.52, -2.9], [1.0, 0.14, 2.1]);
    cube(bed, '#ffffff', [0.6, 0.66, -3.75], [0.7, 0.14, 0.35]);
    cube(bed, '#8fc7e8', [0.6, 0.61, -2.6], [1.04, 0.04, 1.3]);
    cube(bed, '#bdc6c8', [0.6, 0.85, -4.0], [1.1, 0.9, 0.06]);
    cube(bed, '#9aa3a6', [-0.6, 2.4, -2.9], [0.04, 0.04, 2.6]);
    cube(bed, '#7fc4b0', [-0.6, 1.5, -2.2], [0.03, 1.8, 1.0]);
    drum(bed, '#b9c2c4', [1.55, 1.0, -3.5], 0.025, 2);
    cube(bed, '#e6f2f8', [1.55, 1.85, -3.5], [0.18, 0.28, 0.06]);
    cube(bed, '#1d2326', [-0.15, 1.35, -3.85], [0.55, 0.4, 0.12]);
    cube(bed, glow('#5fe08a'), [-0.15, 1.35, -3.78], [0.45, 0.03, 0.01]);
    product(hospital, 'heal', bed, [0.6, 0.7, -2.9], [1.8, 2.1, 0.4], () => 'Khám & hồi máu\n', null);
    // Medicine cabinet with bottles.
    cube(g, '#f6f8f8', [-4.4, 1.6, -4.25], [2.0, 2.0, 0.35]);
    put(g, box, glass, [-4.4, 1.6, -4.06], [1.9, 1.9, 0.02]);
    for (let shelf = 0; shelf < 3; shelf++) for (let i = 0; i < 6; i++) drum(g, ['#e05a5a', '#f2c94c', '#5e9fd0', '#7fc4b0'][(i + shelf) % 4], [-5.1 + i * 0.28, 0.95 + shelf * 0.6, -4.2], 0.06, 0.22);
    cube(g, '#e05a5a', [-4.4, 2.75, -4.05], [0.3, 0.08, 0.01]);
    cube(g, '#e05a5a', [-4.4, 2.75, -4.05], [0.08, 0.3, 0.01]);
    hospital.clerk = make.person('#f2f2ee', '#2a2220');
    hospital.clerk.position.set(-3.6, 0, -2.0);
    g.add(hospital.clerk);
    const doctor = make.person('#dfe8ea', '#1d1916');
    doctor.position.set(2.1, 0, -2.3);
    doctor.rotation.y = -0.6;
    g.add(doctor);
    hospital.eye.copy(world(g, [0.5, 2.3, 3.9]));
    hospital.look.copy(world(g, [0, 1.1, -2.6]));
  }

  const rooms: Record<InteriorKind, Room> = { gun, bike, hospital };
  // Price tags get their text now that every product exists.
  // The customer: the player, seen from behind just inside the door.
  const visitor = make.person('#e77641');
  scene.add(visitor);
  visitor.visible = false;
  let current: InteriorKind | null = null;
  let hovered: string | null = null;
  const tmp = new THREE.Vector3();

  function refreshTags() {
    for (const r of Object.values(rooms)) for (const p of r.products.values()) if (p.tag) writeTag(p.tag, p.label());
  }
  refreshTags();

  return {
    get current() { return current; },
    /** Shows one shop's room (or none) and places the player in its doorway. */
    show(kind: InteriorKind | null) {
      current = kind;
      for (const [k, r] of Object.entries(rooms)) r.group.visible = k === kind;
      visitor.visible = kind !== null;
      if (kind) {
        const r = rooms[kind];
        visitor.position.copy(r.eye).setY(0).add(tmp.set(-1.9, 0, -2.9));
        visitor.rotation.y = PI;
      }
    },
    /** Who owns what, for the price tags. */
    setInfo(next: ShopInfo) {
      if (next.bike === info.bike && next.owned.join() === info.owned.join()) return;
      info = { owned: [...next.owned], bike: next.bike };
      refreshTags();
    },
    /** The camera's resting view in a shop, or its view of one product. */
    view(kind: InteriorKind, productId: string | null) {
      const r = rooms[kind];
      const p = productId ? r.products.get(productId) : undefined;
      return p ? { eye: p.eye, look: p.center } : { eye: r.eye, look: r.look };
    },
    /** The product under a ray (a click or the pointer in the shop), if any. */
    pick(ray: THREE.Raycaster) {
      if (!current) return null;
      let best: { id: string; distance: number } | null = null;
      for (const p of rooms[current].products.values()) {
        const hit = ray.intersectObject(p.object, true)[0];
        if (hit && (!best || hit.distance < best.distance)) best = { id: p.id, distance: hit.distance };
      }
      return best?.id ?? null;
    },
    setHovered(id: string | null) { hovered = id; },
    update(dt: number, time: number) {
      if (!current) return;
      const r = rooms[current];
      // The product under the pointer (or picked in the panel) grows a little and turns to show itself.
      for (const p of r.products.values()) {
        if (!p.grow) continue;
        const on = p.id === hovered;
        p.object.scale.setScalar(THREE.MathUtils.damp(p.object.scale.x, on ? 1.08 : 1, 10, dt));
        if (p.spin) p.object.rotation.y += dt * p.spin * (on ? 2.2 : 1);
        else p.object.rotation.y = on ? p.object.rotation.y + dt * 0.9 : THREE.MathUtils.damp(p.object.rotation.y, 0, 6, dt);
      }
      // The clerk shifts their weight now and then.
      if (r.clerk) r.clerk.rotation.z = Math.sin(time * 0.8) * 0.02;
    },
    dispose() {
      for (const r of Object.values(rooms)) scene.remove(r.group);
      scene.remove(visitor);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
