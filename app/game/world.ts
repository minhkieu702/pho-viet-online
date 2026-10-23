import * as THREE from 'three';

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };

/** An original, deliberately compact Vietnamese neighbourhood. All artwork is generated locally. */
export function buildWorld(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'Pho Viet neighbourhood';
  scene.add(root);
  const colliders: Collider[] = [];
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; matrices: THREE.Matrix4[]; shadow: boolean }>();
  const primitiveGeometries: Record<string, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 7),
    ball: new THREE.IcosahedronGeometry(1, 0),
  };
  geometries.push(...Object.values(primitiveGeometries));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const rotation = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const people: { object: THREE.Group; centerX: number; centerZ: number; phase: number; axis: 'x' | 'z' }[] = [];
  const waterWaves: THREE.Mesh[] = [];

  function shape(kind: string, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tilt = 0, shadow = true) {
    const key = `${kind}:${color}:${shadow}`;
    let batch = batches.get(key);
    if (!batch) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
      materials.push(material);
      batch = { geometry: primitiveGeometries[kind], material, matrices: [], shadow };
      batches.set(key, batch);
    }
    rotation.set(0, yaw, tilt);
    quaternion.setFromEuler(rotation);
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    batch.matrices.push(matrix.clone());
  }
  function box(color: string, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, shadow = true) {
    shape('box', color, x, y, z, w, h, d, yaw, 0, shadow);
  }
  function collider(x: number, z: number, w: number, d: number) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  function sign(text: string, subtitle: string, color: string, x: number, y: number, z: number, w: number, h: number, yaw = 0, background = '#f3e4c7') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.strokeRect(16, 16, 992, 224);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 94px Arial, sans-serif'; ctx.fillText(text, 512, 107, 930);
    ctx.font = '500 31px Arial, sans-serif'; ctx.fillText(subtitle, 512, 194, 900);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    const geometry = new THREE.PlaneGeometry(w, h);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .95, side: THREE.DoubleSide });
    geometries.push(geometry); materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw;
    root.add(mesh);
  }
  function tree(x: number, z: number, size = 1) {
    shape('cylinder', '#8e6549', x, 1.9 * size, z, .2 * size, 3.8 * size, .2 * size);
    shape('ball', '#689b6b', x, 4.6 * size, z, 2.15 * size, 2.35 * size, 2.15 * size);
    shape('ball', '#87b477', x - .7 * size, 5.35 * size, z + .25, 1.5 * size, 1.65 * size, 1.6 * size);
    shape('ball', '#4f875c', x + 1.05 * size, 4.25 * size, z - .25, 1.45 * size, 1.5 * size, 1.5 * size);
    box('#d5c7b3', x, .17, z, 2.5 * size, .28, 2.5 * size);
    box('#8a996e', x, .32, z, 2.1 * size, .05, 2.1 * size);
    collider(x, z, .65, .65);
  }
  function palm(x: number, z: number) {
    shape('cylinder', '#b39b76', x, 3.1, z, .22, 6.2, .22);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      box('#659671', x + Math.sin(a) * 1.55, 6.2, z + Math.cos(a) * 1.55, .85, .18, 3.8, a);
      shape('ball', '#759f75', x + Math.sin(a) * 1.7, 6, z + Math.cos(a) * 1.7, .65, .25, 1.1, a);
    }
  }
  function bench(x: number, z: number, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const part = (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: string) => box(color, x + lx * c + lz * s, ly, z - lx * s + lz * c, w, h, d, yaw);
    part(0, .7, 0, 2.7, .22, .8, '#b58255');
    part(0, 1.3, -.35, 2.7, .85, .15, '#b58255');
    part(-1, .35, 0, .12, .7, .65, '#51645d'); part(1, .35, 0, .12, .7, .65, '#51645d');
  }
  function stool(x: number, z: number, color = '#cf6251') {
    box(color, x, .5, z, .65, .16, .65);
    for (const dx of [-.23, .23]) for (const dz of [-.23, .23]) box(color, x + dx, .24, z + dz, .1, .48, .1);
  }
  function table(x: number, z: number) {
    shape('cylinder', '#dfd3ba', x, .9, z, .85, .12, .85);
    shape('cylinder', '#65766c', x, .48, z, .09, .85, .09);
    shape('cylinder', '#65766c', x, .1, z, .45, .12, .45);
    shape('cylinder', '#dfc19a', x + .2, 1.06, z, .11, .22, .11);
    shape('cylinder', '#684932', x + .2, 1.18, z, .09, .02, .09);
  }
  function streetLamp(x: number, z: number) {
    shape('cylinder', '#586c65', x, 3.2, z, .075, 6.4, .075);
    box('#586c65', x + .6, 6.35, z, 1.25, .13, .13);
    box('#e9d8a7', x + 1.1, 6.25, z, .65, .12, .35);
  }
  function house(x: number, z: number, w: number, h: number, d: number, color: string, name: string, subtitle: string, facing = 0, index = 0) {
    const front = d / 2;
    const c = Math.cos(facing), s = Math.sin(facing);
    const part = (lx: number, ly: number, lz: number, pw: number, ph: number, pd: number, pc: string) => box(pc, x + lx * c + lz * s, ly, z - lx * s + lz * c, pw, ph, pd, facing);
    collider(x, z, w, d);
    part(0, h / 2, 0, w, h, d, color);
    part(0, .25, 0, w + .12, .5, d + .1, '#d1bea5');
    part(0, h + .18, 0, w + .45, .35, d + .5, '#e7d9bd');
    part(0, h + .45, -d / 2 + .13, w, .55, .27, color);
    for (const side of [-1, 1]) part(side * (w / 2 - .12), h / 2, front + .06, .27, h, .19, '#eadfc9');
    // Shop entrance and folding shutters on the ground floor.
    part(0, 1.8, front + .035, w - .9, 3.25, .12, '#365d57');
    part(-w * .22, 1.8, front + .13, w * .27, 2.8, .06, '#7caaa1');
    part(w * .16, 1.8, front + .13, w * .32, 2.8, .06, '#90b5a8');
    part(0, 1.8, front + .2, .12, 3.1, .08, '#e7d9bd');
    part(-w * .09, 1.6, front + .26, .08, .45, .08, '#e7d9bd');
    for (let floor = 5.2; floor < h - .8; floor += 3.2) {
      for (const dx of [-w * .24, w * .24]) {
        part(dx, floor, front + .1, w * .29, 2.3, .15, '#e8ddc4');
        part(dx, floor, front + .2, w * .24, 1.95, .12, '#527a73');
        part(dx, floor, front + .29, .08, 2, .1, '#d4c9ae');
        part(dx, floor, front + .29, w * .24, .08, .1, '#d4c9ae');
      }
      if (index % 3 !== 1) {
        part(0, floor - 1.2, front + .55, w - .9, .18, 1.5, '#e7d9bd');
        part(0, floor - .5, front + 1.2, w - 1.05, .08, .08, '#516e62');
        for (let k = -w / 2 + .75; k < w / 2 - .5; k += .6) part(k, floor - .85, front + 1.2, .055, .7, .055, '#516e62');
        part(w * .25, floor - .95, front + .75, .55, .4, .5, '#bd7956');
        shape('ball', '#659671', x + w * .25 * c + (front + .75) * s, floor - .55, z - w * .25 * s + (front + .75) * c, .45, .5, .45);
      }
    }
    const sy = Math.min(h - .65, 3.8);
    part(0, sy, front + .23, w - .45, 1.25, .22, '#e7d9bd');
    sign(name, subtitle, index % 3 === 0 ? '#b14635' : '#245b4f', x + (front + .36) * s, sy, z + (front + .36) * c, w - .65, 1.1, facing);
    // Segmented striped shop canopy.
    for (let aw = 0; aw < 8; aw++) {
      part(-w / 2 + .35 + (aw + .5) * (w - .7) / 8, 2.98, front + 1.2, (w - .7) / 8, .16, 2, aw % 2 ? '#f3e6ca' : index % 2 ? '#5e927c' : '#cf795d');
      part(-w / 2 + .35 + (aw + .5) * (w - .7) / 8, 2.78, front + 2.12, (w - .7) / 8, .35, .1, aw % 2 ? '#f3e6ca' : index % 2 ? '#5e927c' : '#cf795d');
    }
    if (index % 2 === 0) {
      shape('cylinder', '#a8bcb9', x - w * .22, h + .95, z - 1, .85, 1.5, .85);
      box('#758e86', x - w * .22, h + .24, z - 1, 2, .16, 2);
      part(w * .23, h + .45, -1, 2.2, .4, 1.4, '#c5b99f');
    }
  }

  // Warm paving, three cross streets, clear shoulders, and an uninterrupted road network.
  box('#b4b99a', 0, -.22, 0, 210, .42, 210, 0, false);
  box('#d7d1bb', 0, -.01, 0, 180, .12, 180, 0, false);
  const roads = [-54, 0, 54];
  for (const road of roads) {
    box('#a7aaa1', road, .005, 0, 20, .15, 180, 0, false);
    box('#a7aaa1', 0, .006, road, 180, .15, 20, 0, false);
    box('#727f7b', road, .025, 0, 14, .08, 182, 0, false);
    box('#727f7b', 0, .026, road, 182, .08, 14, 0, false);
    for (let i = -85; i < 89; i += 9) {
      if (roads.every(r => Math.abs(r - i) > 10)) {
        box('#e3d4a7', road, .075, i, .17, .015, 3.2, 0, false);
        box('#e3d4a7', i, .076, road, 3.2, .015, .17, 0, false);
      }
    }
    for (const crossing of roads) {
      for (const side of [-1, 1]) for (let stripe = -5; stripe <= 5; stripe += 1.5) {
        box('#d9dac7', road + stripe, .078, crossing + side * 10, .8, .015, 2.5, 0, false);
        box('#d9dac7', road + side * 10, .079, crossing + stripe, 2.5, .015, .8, 0, false);
      }
    }
  }
  const colors = ['#ddbd84', '#a1beb1', '#d68f76', '#e4d9ba', '#9eb7bd', '#c9b2bb'];
  const shops = [
    ['CÀ PHÊ CÔ BA', 'CÀ PHÊ PHIN • TỪ 1998'], ['BÁNH MÌ', 'NÓNG GIÒN MỖI NGÀY'],
    ['TẠP HÓA', 'CHUYỆN NHỎ MỖI NGÀY'], ['TIỆM HOA', 'MỘT CHÚT TƯƠI VUI'],
    ['PHỞ CÔ BA', 'PHỞ BÒ • PHỞ GÀ'], ['XE MÁY', 'SỬA XE • THAY NHỚT'],
    ['NHÀ SÁCH', 'SÁCH VÀ NHỮNG GIẤC MƠ'], ['BÚN CHẢ', 'BẾP NHÀ • VỊ QUEN'],
  ];
  let houseIndex = 0;
  const addHouse = (x: number, z: number, w: number, h: number, facing: number, preferred?: number) => {
    const id = preferred ?? houseIndex % shops.length;
    const isPostOffice = x === 66 && z === -40;
    house(x, z, w, h, 11, isPostOffice ? '#dfb16f' : colors[houseIndex % colors.length], isPostOffice ? 'BƯU ĐIỆN' : shops[id][0], isPostOffice ? 'GỬI MỘT CHÚT THƯƠNG' : shops[id][1], isPostOffice ? 0 : facing, houseIndex++);
  };
  for (const x of [-76, -65, -42, -31, -20, 20, 31, 42, 66, 77]) addHouse(x, -18, 9.7, 7.4 + (houseIndex % 3) * 3.15, 0, x === -31 ? 0 : undefined);
  for (const x of [-76, -65, -42, -30, -18, 20, 32, 43, 66, 77]) addHouse(x, 21, 10, 7.1 + (houseIndex % 3) * 2.8, Math.PI, x === -30 ? 0 : undefined);
  for (const x of [-76, -65, -42, -30, -18, 20, 32, 43, 66, 77]) addHouse(x, -72, 10, 7.3 + (houseIndex % 3) * 2.65, 0);
  for (const x of [-76, -65, -42, -30, -18, 20, 32, 43, 66, 77]) addHouse(x, 74, 10, 6.6 + (houseIndex % 3) * 2.7, Math.PI);
  for (const x of [-76, -65, -42, -30, -18, 66, 77]) addHouse(x, -40, 10, 6.8 + (houseIndex % 2) * 3, Math.PI);
  for (const x of [-76, -65, -42, -30, -18, 66, 77]) addHouse(x, 42, 10, 7.2 + (houseIndex % 2) * 3, 0);

  // A small green square is the district's landmark and gathering place.
  box('#91ad83', 28, .14, -33, 30, .2, 22, 0, false);
  box('#d8cfb2', 28, .25, -33, 28, .05, 3, 0, false);
  box('#d8cfb2', 28, .251, -33, 3, .05, 20, 0, false);
  shape('cylinder', '#d6c8ad', 28, .42, -33, 3.5, .42, 3.5);
  shape('cylinder', '#78a9a0', 28, .66, -33, 3.1, .04, 3.1);
  shape('cylinder', '#d6c8ad', 28, 1, -33, .75, 1.1, .75);
  shape('ball', '#e7d7b0', 28, 1.8, -33, .55, .6, .55);
  collider(28, -33, 7, 7);
  for (const [tx, tz] of [[17, -40], [39, -40], [17, -26], [39, -26]]) tree(tx, tz, 1.15);
  bench(22, -38); bench(34, -28, Math.PI); bench(35, -37, Math.PI / 2);
  sign('CÔNG VIÊN NHỎ', 'HẸN NHAU DƯỚI TÁN CÂY', '#315b49', 28, 2.4, -22.3, 6.8, 1.25);
  box('#567465', 25.2, 1.2, -22.4, .12, 2.4, .12); box('#567465', 30.8, 1.2, -22.4, .12, 2.4, .12);

  // Open tiled neighbourhood square on the opposite block.
  box('#d9cbb3', 29, .16, 38, 29, .22, 17, 0, false);
  for (let i = 0; i < 7; i++) box('#c3bca6', 16 + i * 4.2, .28, 38, .055, .015, 16.8, 0, false);
  for (let i = 0; i < 4; i++) box('#c3bca6', 29, .28, 30 + i * 5.2, 28.8, .015, .055, 0, false);
  for (const [tx, tz] of [[17, 33], [42, 33], [17, 44], [42, 44]]) palm(tx, tz);
  bench(23, 43); bench(35, 43); bench(42, 38, Math.PI / 2);
  // Café furniture, kept away from the mission pickup at (-32, 7).
  for (const [tx, tz] of [[-39, -9.5], [-26, -9.5], [-38, 11], [-24, 11]]) {
    table(tx, tz); stool(tx - 1.25, tz); stool(tx + 1.25, tz, '#698b81');
  }
  // Low-poly market stalls give the southern side street a distinct silhouette.
  for (let i = 0; i < 3; i++) {
    const x = -42 + i * 11;
    box('#ba8b61', x, 1, 32, 4.7, 1.5, 2.4);
    for (const dx of [-2.1, 2.1]) box('#8d7458', x + dx, 1.8, 32, .12, 3.2, .12);
    for (let stripe = 0; stripe < 6; stripe++) box(stripe % 2 ? '#efdeb9' : '#d79555', x - 2.5 + (stripe + .5) * 5 / 6, 3.5, 32, 5 / 6, .2, 3.6);
    for (let n = 0; n < 8; n++) shape('ball', n % 3 ? '#e4ad58' : '#86a169', x - 1.7 + (n % 4) * 1.1, 1.93, 31.6 + Math.floor(n / 4) * .7, .38, .33, .38);
    collider(x, 32, 4.7, 2.4);
  }
  // Street trees and lamps stay off the driveable carriageway.
  for (const road of [-54, 0, 54]) {
    for (const along of [-81, -61, -42, -16, 18, 43, 68, 84]) {
      if (roads.some(r => Math.abs(r - along) < 10)) continue;
      if (!(road === 0 && (along === -42 || along === -16))) tree(along, road + 9.2, .72);
      streetLamp(along + 3.4, road - 9.2);
    }
  }

  // A river beyond the northern playable edge and a riverside promenade.
  box('#6eaaa3', 0, -.24, -115, 280, .16, 48, 0, false);
  box('#bbaf96', 0, -.05, -90, 184, .55, 4, 0, false);
  box('#e2cfaa', 0, .45, -91.3, 184, .28, .45);
  for (let x = -89; x <= 90; x += 5) box('#d6c4a1', x, .7, -91.3, .3, 1.2, .35);
  for (let x = -79; x <= 80; x += 22) { palm(x, -86); bench(x + 4, -86, Math.PI); }
  for (let i = 0; i < 22; i++) {
    const geometry = new THREE.PlaneGeometry(2 + (i % 4) * 1.4, .14);
    const material = new THREE.MeshBasicMaterial({ color: '#b5d2b7', transparent: true, opacity: .32 });
    geometries.push(geometry); materials.push(material);
    const wave = new THREE.Mesh(geometry, material);
    wave.rotation.x = -Math.PI / 2;
    wave.position.set(-90 + ((i * 31) % 180), -.145, -97 - ((i * 7) % 28));
    root.add(wave); waterWaves.push(wave);
  }
  // A distant skyline frames the map without obstructing the playable streets.
  for (let i = 0; i < 18; i++) {
    const x = -130 + i * 16;
    const h = 10 + (i * 13 % 24);
    box(i % 2 ? '#b9c4b6' : '#c6c6b5', x, h / 2, -151 - (i % 3) * 8, 10 + i % 4, h, 12);
    for (let floor = 3; floor < h - 1; floor += 4) box('#a4b7af', x, floor, -144.9 - (i % 3) * 8, 7, .9, .04, 0, false);
  }

  function pedestrian(x: number, z: number, color: string, phase: number, axis: 'x' | 'z') {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, roughness: .9 });
    const skin = new THREE.MeshStandardMaterial({ color: '#d3a179', roughness: .9 });
    const pants = new THREE.MeshStandardMaterial({ color: '#536c69', roughness: .9 });
    materials.push(material, skin, pants);
    const body = new THREE.Mesh(primitiveGeometries.box, material); body.scale.set(.58, .78, .38); body.position.y = 1.13;
    const head = new THREE.Mesh(primitiveGeometries.ball, skin); head.scale.set(.28, .3, .28); head.position.y = 1.85;
    group.add(body, head);
    for (const dx of [-.16, .16]) { const leg = new THREE.Mesh(primitiveGeometries.box, pants); leg.scale.set(.2, .68, .23); leg.position.set(dx, .4, 0); group.add(leg); }
    if (phase % 2 < 1) {
      const hatMat = new THREE.MeshStandardMaterial({ color: '#e5cf92', roughness: 1 }); materials.push(hatMat);
      const hat = new THREE.Mesh(primitiveGeometries.cone, hatMat); hat.scale.set(.52, .3, .52); hat.position.y = 2.14; group.add(hat);
    }
    group.position.set(x, .12, z); group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    root.add(group); people.push({ object: group, centerX: x, centerZ: z, phase, axis });
  }
  pedestrian(-22, -8.7, '#db9876', 0, 'x'); pedestrian(28, 8.8, '#86a799', 2.6, 'x');
  pedestrian(8.7, -30, '#d4b164', 5, 'z'); pedestrian(-45, -62.7, '#bca5b7', 7.3, 'x');
  pedestrian(62.7, 29, '#8caaa9', 9.3, 'z'); pedestrian(-26, 62.7, '#d18469', 11.2, 'x');

  // Instancing keeps the detailed neighbourhood practical on ordinary laptops.
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    batch.matrices.forEach((m, index) => mesh.setMatrixAt(index, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = batch.shadow; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return {
    colliders,
    update(time: number) {
      people.forEach(({ object, centerX, centerZ, phase, axis }) => {
        const t = time * .2 + phase;
        const offset = Math.sin(t) * 5.5;
        object.position.set(centerX + (axis === 'x' ? offset : 0), .12 + Math.abs(Math.sin(time * 4 + phase)) * .035, centerZ + (axis === 'z' ? offset : 0));
        object.rotation.y = (axis === 'x' ? Math.PI / 2 : 0) + (Math.cos(t) < 0 ? Math.PI : 0);
      });
      waterWaves.forEach((wave, i) => { wave.position.x += Math.sin(time * .3 + i) * .002; });
    },
    dispose() {
      scene.remove(root);
      textures.forEach(t => t.dispose());
      materials.forEach(m => m.dispose());
      geometries.forEach(g => g.dispose());
      root.clear();
    },
  };
}
