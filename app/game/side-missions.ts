import * as THREE from 'three';
import { BUILDINGS, LANDMARKS, POIS, ROADS_X, ROADS_Z, type Building, type Point } from './city';

type Mode = 'foot' | 'vehicle' | 'any';
type Step =
  | { kind: 'go'; x: number; z: number; r: number; text: string; stay?: number; mode?: Mode; cost?: number; passenger?: 'board' | 'drop' }
  | { kind: 'collect'; points: Point[]; text: string; mode?: Mode }
  | { kind: 'chase'; text: string }
  | { kind: 'fight'; gang: number; count: number; text: string };
type MissionDef = { id: string; title: string; intro: string; reward: number; score: number; time?: number; heal?: boolean; build: (giver: Point) => Step[] };
export type Offer = { def: MissionDef; x: number; z: number };
export type SideMissionContext = {
  x: number; z: number; inVehicle: boolean; down: boolean; time: number;
  spend: (amount: number) => boolean;
  spawnThief: (x: number, z: number) => boolean;
  thiefDown: () => boolean | null;
  gangKnocks: number;
  gangTurf: (gang: number) => Point;
};
export type SideMissionView = { title: string; objective: string; timeLeft: number | null; progress: string } | null;
export type SideMissionResult = { view: SideMissionView; completed?: { title: string; reward: number; score: number; heal: boolean }; failed?: string; passenger: boolean };

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const byName = (pattern: RegExp, fallback: Building['kind']) => BUILDINGS.find((b) => pattern.test(b.name)) ?? BUILDINGS.find((b) => b.kind === fallback) ?? BUILDINGS[0];
const nearest = <T extends Point,>(list: T[], from: Point) => [...list].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
const poiOf = (kind: string, from: Point) => nearest(POIS.filter((p) => p.kind === kind), from)[0] ?? POIS[0];
const homes = () => BUILDINGS.filter((b) => b.residents > 0);
const door = (b: Building, text: string, extra: Partial<Extract<Step, { kind: 'go' }>> = {}): Step => ({ kind: 'go', x: b.door.x, z: b.door.z, r: 3, text, ...extra });
const junctions = () => ROADS_X.flatMap((x) => ROADS_Z.map((z) => ({ x, z })));
const school = () => BUILDINGS.find((b) => b.kind === 'school') ?? BUILDINGS[0];

/** Twenty everyday and fun side jobs around the neighbourhood. */
export const SIDE_MISSIONS: MissionDef[] = [
  { id: 'banhmi', title: 'Bánh mì cho bà Tư', intro: 'Bà Tư thèm ổ bánh mì nóng.', reward: 60, score: 20, build: (g) => [door(byName(/BÁNH MÌ/, 'food'), 'Mua bánh mì (15.000đ)', { stay: 1, cost: 15 }), { kind: 'go', x: g.x, z: g.z, r: 3, text: 'Mang bánh mì về cho bà Tư' }] },
  { id: 'busstop', title: 'Chở khách ra trạm xe buýt', intro: 'Một bác cần ra trạm xe buýt gấp.', reward: 80, score: 25, time: 100, build: (g) => [{ kind: 'go', x: g.x, z: g.z, r: 3.5, text: 'Đón khách (cần xe)', mode: 'vehicle', passenger: 'board' }, { ...poiStep('bus-stop', g, 'Chở khách tới trạm xe buýt'), mode: 'vehicle', passenger: 'drop' }] },
  { id: 'rush', title: 'Đua xe giờ cao điểm', intro: 'Qua 6 ngã tư trước khi hết giờ!', reward: 150, score: 50, time: 85, build: (g) => [{ kind: 'collect', points: nearest(junctions(), g).slice(0, 7).slice(1).sort(() => Math.random() - 0.5), text: 'Chạy qua các ngã tư', mode: 'vehicle' }] },
  { id: 'pagoda', title: 'Đi chùa thắp hương', intro: 'Ghé chùa thắp nén nhang cầu bình an.', reward: 50, score: 20, build: (g) => [{ ...poiStep('pagoda-yard', g, 'Đứng thắp hương ở sân chùa'), stay: 6 }] },
  { id: 'jog', title: 'Chạy bộ buổi sáng', intro: 'Chạy một vòng công viên cho khỏe.', reward: 70, score: 25, time: 75, build: (g) => [{ kind: 'collect', points: ring(poiOf('park', g), 9, 5), text: 'Chạy qua các mốc trong công viên', mode: 'foot' }] },
  { id: 'cat', title: 'Tìm mèo lạc', intro: 'Con mèo Mướp đi lạc đâu đó gần đây.', reward: 70, score: 25, build: (g) => [{ kind: 'collect', points: [scatter(g, 25)], text: 'Tìm con mèo Mướp' }, { kind: 'go', x: g.x, z: g.z, r: 3, text: 'Đem mèo về cho chủ' }] },
  { id: 'pho', title: 'Giao phở nóng', intro: 'Phở phải tới khi còn nóng!', reward: 110, score: 35, time: 70, build: () => [door(byName(/PHỞ/, 'food'), 'Lấy phở ở quán', { stay: 1 }), door(pick(homes()), 'Giao phở tới nhà khách')] },
  { id: 'school', title: 'Đưa cháu đi học', intro: 'Bé Na sắp trễ giờ vào lớp.', reward: 90, score: 30, time: 110, build: (g) => [{ kind: 'go', x: g.x, z: g.z, r: 3.5, text: 'Đón bé Na (cần xe)', mode: 'vehicle', passenger: 'board' }, { ...door(school(), 'Chở bé tới trường'), mode: 'vehicle', passenger: 'drop' }] },
  { id: 'thief', title: 'Bắt kẻ cướp giật', intro: 'Có kẻ vừa giật túi xách của cô Lan!', reward: 130, score: 45, time: 60, build: () => [{ kind: 'chase', text: 'Đuổi theo và hạ gục kẻ cướp' }] },
  { id: 'checkin', title: 'Chụp ảnh check-in', intro: 'Sống ảo ở ba điểm đẹp nhất phố.', reward: 120, score: 40, build: (g) => [{ ...poiStep('pagoda-yard', g, 'Chụp ảnh ở sân chùa'), stay: 2 }, { ...poiStep('square', g, 'Chụp ảnh ở quảng trường'), stay: 2 }, { ...door(byName(/BƯU ĐIỆN/, 'post'), 'Chụp ảnh trước Bưu điện'), stay: 2 }] },
  { id: 'market', title: 'Đi chợ giúp mẹ', intro: 'Mẹ nhờ mua mớ rau với ký cá.', reward: 70, score: 20, build: (g) => [{ ...poiStep('market', g, 'Mua đồ ở chợ (25.000đ)'), stay: 1, cost: 25 }, { kind: 'go', x: g.x, z: g.z, r: 3, text: 'Mang đồ về nhà' }] },
  { id: 'coffee', title: 'Cà phê với bạn', intro: 'Bạn cũ hẹn ra quán ngồi chơi.', reward: 40, score: 15, heal: true, build: (g) => [{ ...poiStep('cafe-seat', g, 'Ngồi cà phê tán gẫu'), stay: 10, mode: 'foot' }] },
  { id: 'flyers', title: 'Phát tờ rơi', intro: 'Phát tờ rơi khai trương cho 5 nhà.', reward: 100, score: 35, time: 110, build: (g) => [{ kind: 'collect', points: nearest(homes().map((h) => h.door), g).slice(1, 9).sort(() => Math.random() - 0.5).slice(0, 5), text: 'Nhét tờ rơi vào các cửa nhà' }] },
  { id: 'hospital', title: 'Thăm ông ở bệnh viện', intro: 'Ông Năm đang nằm viện, mua ít trái cây.', reward: 90, score: 30, build: () => [door(byName(/TẠP HÓA/, 'shop'), 'Mua trái cây (20.000đ)', { stay: 1, cost: 20 }), { kind: 'go', x: LANDMARKS.hospital.x, z: LANDMARKS.hospital.z, r: 3.5, text: 'Vào bệnh viện thăm ông' }] },
  { id: 'kite', title: 'Thả diều ở quảng trường', intro: 'Chiều nay gió đẹp, đi thả diều thôi.', reward: 60, score: 20, build: (g) => [{ ...poiStep('square', g, 'Thả diều ở quảng trường'), stay: 12, mode: 'foot' }] },
  { id: 'grandrace', title: 'Đua vòng quanh phố', intro: 'Một vòng quanh cả khu An Hòa!', reward: 260, score: 80, time: 150, build: () => [{ kind: 'collect', points: outerLoop(), text: 'Chạy hết vòng đua', mode: 'vehicle' }] },
  { id: 'teacher', title: 'Đưa cô giáo về nhà', intro: 'Cô Hạnh tan dạy, nhờ chở về.', reward: 90, score: 30, time: 120, build: () => [{ ...door(school(), 'Đón cô giáo ở trường (cần xe)'), mode: 'vehicle', passenger: 'board' }, { ...door(pick(homes()), 'Chở cô về nhà'), mode: 'vehicle', passenger: 'drop' }] },
  { id: 'cleanup', title: 'Dọn rác công viên', intro: 'Nhặt 6 túi rác người ta vứt bừa.', reward: 90, score: 30, time: 80, build: (g) => [{ kind: 'collect', points: Array.from({ length: 6 }, () => scatter(poiOf('park', g), 9)), text: 'Nhặt rác trong công viên', mode: 'foot' }] },
  { id: 'letter', title: 'Thư khẩn cho Bưu điện', intro: 'Lấy thư khẩn và gửi trước giờ đóng cửa.', reward: 100, score: 35, time: 75, build: () => [door(pick(homes()), 'Lấy thư ở nhà khách', { stay: 1 }), door(byName(/BƯU ĐIỆN/, 'post'), 'Gửi thư ở Bưu điện')] },
  { id: 'gang', title: 'Thách đấu băng đảng', intro: 'Dằn mặt băng Rắn Đen: hạ 3 tên.', reward: 250, score: 80, time: 120, build: () => [{ kind: 'fight', gang: 0, count: 3, text: 'Hạ gục 3 thành viên Rắn Đen' }] },
];

function poiStep(kind: string, from: Point, text: string): Extract<Step, { kind: 'go' }> {
  const p = poiOf(kind, from);
  return { kind: 'go', x: p.x, z: p.z, r: 3, text };
}
function ring(center: Point, radius: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({ x: center.x + Math.cos(i / count * Math.PI * 2) * radius, z: center.z + Math.sin(i / count * Math.PI * 2) * radius }));
}
function scatter(center: Point, radius: number) {
  const a = Math.random() * Math.PI * 2, r = radius * (0.4 + Math.random() * 0.6);
  // Keep the point on the nearest walking line so it is always reachable.
  const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
  return { x, z };
}
function outerLoop() {
  // Round An Hòa's outer roads.
  const r = 108;
  const pts = [{ x: r, z: -r }, { x: r, z: 0 }, { x: r, z: r }, { x: 0, z: r }, { x: -r, z: r }, { x: -r, z: 0 }, { x: -r, z: -r }, { x: 0, z: -r }];
  const start = Math.floor(Math.random() * pts.length);
  return [...pts.slice(start), ...pts.slice(0, start)];
}

/** Offers, active mission state and the marker rings; one instanced ring mesh for every marker. */
export function createSideMissions(scene: THREE.Scene, ground: (x: number, z: number) => number, reachable: (p: Point) => Point) {
  const MAX_MARKERS = 16;
  const ringGeometry = new THREE.TorusGeometry(1.4, 0.09, 6, 32).rotateX(-Math.PI / 2);
  const beamGeometry = new THREE.CylinderGeometry(0.06, 0.06, 6, 6).translate(0, 3, 0);
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
  const rings = new THREE.InstancedMesh(ringGeometry, material, MAX_MARKERS);
  const beams = new THREE.InstancedMesh(beamGeometry, material, MAX_MARKERS);
  for (const mesh of [rings, beams]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh); }
  const giverColor = new THREE.Color('#f2c84b'), goalColor = new THREE.Color('#4bc4f2');
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3();

  const pool = [...SIDE_MISSIONS].sort(() => Math.random() - 0.5);
  const offers: Offer[] = [];
  function refill() {
    while (offers.length < 3 && pool.length) {
      const def = pool.shift()!;
      const where = def.id === 'teacher' ? school().door : pick(homes()).door;
      offers.push({ def, x: where.x, z: where.z });
    }
  }
  refill();
  let active: { def: MissionDef; steps: Step[]; index: number; startedAt: number; stayed: number; collected: Set<number>; passenger: boolean; knocks: number; giver: Point } | null = null;

  function finish(result: SideMissionResult, offer: MissionDef) {
    pool.push(offer);
    active = null;
    refill();
    return result;
  }

  return {
    get active() { return active; },
    offers,
    nearOffer(x: number, z: number) { return active ? null : offers.find((o) => Math.hypot(o.x - x, o.z - z) < 3.2) ?? null; },
    start(offer: Offer, time: number, ctx: SideMissionContext) {
      offers.splice(offers.indexOf(offer), 1);
      const giver = { x: offer.x, z: offer.z };
      // Every target is moved onto the walking network so it can always be reached.
      const steps = offer.def.build(giver).map((s): Step => s.kind === 'go' ? { ...s, ...reachable(s) } : s.kind === 'collect' ? { ...s, points: s.points.map(reachable) } : s);
      active = { def: offer.def, steps, index: 0, startedAt: time, stayed: 0, collected: new Set(), passenger: false, knocks: 0, giver };
      if (steps[0]?.kind === 'chase') ctx.spawnThief(giver.x + 3, giver.z + 3);
    },
    cancel() { if (active) { pool.push(active.def); active = null; refill(); } },
    update(dt: number, ctx: SideMissionContext): SideMissionResult {
      let markers = 0;
      const mark = (x: number, z: number, goal: boolean) => {
        if (markers >= MAX_MARKERS) return;
        quat.identity();
        matrix.compose(pos.set(x, ground(x, z) + 0.35, z), quat, scale.setScalar(goal ? 1.2 : 1));
        rings.setMatrixAt(markers, matrix);
        beams.setMatrixAt(markers, matrix);
        rings.setColorAt(markers, goal ? goalColor : giverColor);
        beams.setColorAt(markers, goal ? goalColor : giverColor);
        markers++;
      };
      const done = (): SideMissionResult => {
        rings.count = beams.count = markers;
        for (const mesh of [rings, beams]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
        return result;
      };
      let result: SideMissionResult = { view: null, passenger: false };
      if (!active) {
        for (const offer of offers) mark(offer.x, offer.z, false);
        return done();
      }
      const a = active;
      const elapsed = ctx.time - a.startedAt;
      const timeLeft = a.def.time ? Math.max(0, a.def.time - elapsed) : null;
      if (ctx.down) { result = finish({ view: null, failed: 'Nhiệm vụ thất bại vì bạn đã gục.', passenger: false }, a.def); return done(); }
      if (timeLeft === 0) { result = finish({ view: null, failed: `Hết giờ! "${a.def.title}" thất bại.`, passenger: false }, a.def); return done(); }
      const step = a.steps[a.index];
      let objective = step.text;
      let progress = `${a.index + 1}/${a.steps.length}`;
      const modeOk = (mode?: Mode) => !mode || mode === 'any' || (mode === 'vehicle') === ctx.inVehicle;
      const advance = () => { a.index++; a.stayed = 0; a.collected.clear(); };
      if (step.kind === 'go') {
        mark(step.x, step.z, true);
        const here = Math.hypot(ctx.x - step.x, ctx.z - step.z) < step.r;
        if (here && !modeOk(step.mode)) objective = step.mode === 'vehicle' ? 'Cần đi xe tới đây' : 'Xuống xe, đi bộ vào';
        else if (here) {
          a.stayed += dt;
          if (step.stay && a.stayed < step.stay) objective = `${step.text} · ${Math.ceil(step.stay - a.stayed)}s`;
          else if (step.cost && !ctx.spend(step.cost)) objective = 'Không đủ tiền!';
          else {
            if (step.passenger === 'board') a.passenger = true;
            if (step.passenger === 'drop') a.passenger = false;
            advance();
          }
        } else a.stayed = 0;
      } else if (step.kind === 'collect') {
        step.points.forEach((p, i) => {
          if (a.collected.has(i)) return;
          mark(p.x, p.z, true);
          if (Math.hypot(ctx.x - p.x, ctx.z - p.z) < 2.8 && modeOk(step.mode)) a.collected.add(i);
        });
        progress = `${a.collected.size}/${step.points.length}`;
        if (step.mode === 'vehicle' && !ctx.inVehicle) objective = `${step.text} (cần xe)`;
        if (step.mode === 'foot' && ctx.inVehicle) objective = `${step.text} (đi bộ)`;
        if (a.collected.size === step.points.length) advance();
      } else if (step.kind === 'chase') {
        const down = ctx.thiefDown();
        if (down === null) { result = finish({ view: null, failed: 'Kẻ cướp đã trốn thoát.', passenger: false }, a.def); return done(); }
        if (down) advance();
      } else {
        a.knocks += ctx.gangKnocks;
        const turf = ctx.gangTurf(step.gang);
        mark(turf.x, turf.z, true);
        progress = `${Math.min(a.knocks, step.count)}/${step.count}`;
        if (a.knocks >= step.count) advance();
      }
      if (a.index >= a.steps.length) {
        result = finish({ view: null, completed: { title: a.def.title, reward: a.def.reward, score: a.def.score, heal: !!a.def.heal }, passenger: false }, a.def);
        return done();
      }
      result = { view: { title: a.def.title, objective, timeLeft, progress }, passenger: a.passenger };
      return done();
    },
    dispose() {
      for (const mesh of [rings, beams]) { scene.remove(mesh); mesh.dispose(); }
      ringGeometry.dispose(); beamGeometry.dispose(); material.dispose();
    },
  };
}
