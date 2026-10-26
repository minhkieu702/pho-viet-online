/**
 * Where "PHỐ VIỆT: SEN TRONG BÙN" happens, locked onto the district map (Wave 0, W0-MAP; the decision record is
 * E:/pvo-work/story-decisions.md). Pure data, no three.js/DOM, no generator imports: every site is a real place
 * of today's map (An Hòa and Quận 1 · Bến Nghé, door coordinates read from city.ts), a district stamp (KHO 7 and
 * the cargo ship in Quận 4) or a stretch of road or river, with the phase that builds it (P0 now, P1 the next
 * slices), so content is scheduled in the order the map grows. Rooms that are not on the map are spaces
 * (SPACES): walkable sets in the off-map band, entered from a site.
 * Axes are the game's: +x east (downstream), +z south (inland), the river at -z. A yaw is the way something faces
 * (0 is +z, PI/2 is +x). Content refers to a site as 'id' and to one of its spots as 'id.spot' (sitePlaces()).
 * Story text never hard-codes street names (design 1 renames z -108 east of x 135 to Tôn Đức Thắng in step 14):
 * it names sites, and the HUD reads street names from the road graph.
 * Checked by E:/pvo-work/story/map/check-sites.mts (land, water, roads, colliders, doors, phases, mission lists).
 */
import type { DistrictId, Phase } from '../map/districts.ts';

/**
 * door: a building's door (equal to city.ts BUILDINGS[building].door); stop: a bus or coach stop; alley, yard: open
 * ground behind or between buildings; roof, deck: a walkable top at `y`; stamp: a district stamp (stamps.ts);
 * road: a scene on the carriageway; water: on the river; pier: on a dock; spot: a point on the ground; route: a
 * polyline (tails, chases), its first point at (x, z).
 */
export type SiteKind = 'door' | 'stop' | 'alley' | 'yard' | 'roof' | 'deck' | 'stamp' | 'road' | 'water' | 'pier' | 'spot' | 'route';
/**
 * A named point inside a site. Unless flagged it stands on dry land, clear of colliders by `r` (default 0.45, a
 * person; 1.0 where the player's bike is put) and off the asphalt. road: on the carriageway on purpose; water: on
 * open water; solid: inside a footprint or on a roof (y), not tested against colliders; air: above the ground (a
 * helicopter, a gondola). level: the walkable surface a solid spot is on ('roof', 'deck'), as SpacePort.level()
 * reports it, so `reach … level` and teleports agree on it.
 */
export type Spot = { x: number; z: number; y?: number; yaw?: number; r?: number; road?: true; water?: true; solid?: true; air?: true; level?: string; note?: string };
export type Site = {
  name: string; district: DistrictId; phase: Phase; kind: SiteKind;
  x: number; z: number; y?: number; yaw?: number;
  /** Today's building (city.ts BUILDINGS id) whose door, footprint or roof this is. */
  building?: number;
  door?: { x: number; z: number };
  /** The district stamp (map/stamps.ts STORY_STAMPS id) this site is. */
  stamp?: string;
  /** Off-map spaces entered from here (SPACES ids). */
  spaces?: string[];
  /** Footprint of a yard, alley or scene [minX, maxX, minZ, maxZ]; also the exclusion area while a mission runs. */
  area?: [number, number, number, number];
  spots?: Record<string, Spot>;
  /**
   * x,z pairs. Road routes run on the carriageway, on the centre line or in the lane of their direction (traffic
   * keeps right: eastbound on the south side, northbound on the east side); boat routes on open water.
   */
  route?: number[];
  /** Route segments (0-based) that leave the carriageway on purpose (a slot or loading-bay exit, a crash): clear ground at r 0.5. */
  free?: number[];
  /** Phase-gated alternatives: the site that stands in until this one is built. */
  fallback?: string;
  notes: string;
};

const H = Math.PI / 2, PI = Math.PI;

export const SITES: Record<string, Site> = {
  // ---- D1 AN HÒA (P0) --------------------------------------------------------------------------------------
  'ben-xe-an-hoa': {
    name: 'BẾN XE AN HÒA', district: 'D1', phase: 'P0', kind: 'stop', x: -76, z: -117.95, yaw: 0,
    spots: {
      coach: { x: -76, z: -113.4, yaw: -H, road: true, note: 'the xe đò stops westbound in the curb lane, its door on the shelter side' },
      sign: { x: -79.6, z: -118.6, r: 0.3, note: 'story sign prop "BẾN XE AN HÒA · XE ĐÒ MIỀN TÂY" beside the shelter' },
      van: { x: -66, z: -102.6, yaw: H, road: true, note: 'c4-m2: the white van waits in the eastbound curb lane across from the coach; Mai is walked over to it' },
    },
    notes: 'The riverside shelter of ĐƯỜNG BỜ SÔNG (transit stop "ben-do", its bench faces the road). The Mekong xe đò drops and picks up here: c1-m1 arrival, c4-m2 Mai\'s pickup, c11-m4 goodbye. No building is renamed; the sign is a story prop.',
  },
  'cafe-co-ba': {
    name: 'CÀ PHÊ CÔ BA', district: 'D1', phase: 'P0', kind: 'door', building: 13, x: -30, z: 14.7, yaw: PI, door: { x: -30, z: 14.7 },
    spaces: ['co-ba-ground', 'attic'],
    spots: {
      pickup: { x: -32, z: 7, note: 'the existing coffee-mission pickup ring on the curb' },
      quangTable: { x: -24, z: 11, r: 0.3, note: 'café table with two seat POIs; Quang\'s table in c1-m1' },
      porchCam: { x: -30, z: 15.4, y: 3.2, solid: true, note: 'the cheap camera over the door (c5-m1 footage of the porch)' },
      backDoor: { x: -30, z: 27.3, yaw: 0, note: 'back door onto the Chợ An Hòa lane (curfew entry, c9-m3 escape)' },
      backStairs: { x: -27.4, z: 27.7, note: 'foot of the outside back stairs; Mực sleeps on the landing (stealth watchdog actor)' },
      dream: { x: -37.5, z: 28.4, r: 0.9, note: 'where Tín parks the Dream at night, by the back door' },
      raidVan: { x: -36, z: 3.6, yaw: H, road: true, note: 'c9-m3: the fake-police van stops eastbound in front' },
    },
    notes: 'Building 13 (south of ĐƯỜNG AN HÒA, door to the north) is the only CÀ PHÊ CÔ BA after RENAMES. Ground floor, kitchen, CCTV recorder and café TV are the co-ba-ground space; the attic (Lâm\'s old room, chalk wall, floor hollow) is the attic space, window view: an on-map shot from (-30, 14.4, y 8.6), just outside the north facade (z 15.5), at THÁP PHƯƠNG NAM.',
  },
  'cho-an-hoa': {
    name: 'CHỢ AN HÒA', district: 'D1', phase: 'P0', kind: 'alley', x: -31, z: 29.2, area: [-49, -12.5, 26.5, 36.5],
    spots: {
      eastMouth: { x: -10.8, z: 31.5, note: 'the lane meets ĐƯỜNG TRUNG TÂM: Hổ Vàng men block it in c9-m3' },
      westMouth: { x: -45.8, z: 30.6, note: 'the lane meets ĐƯỜNG BÀNG LĂNG' },
      stall: { x: -31, z: 29.55, note: 'market POI in front of the middle stall; browsing here blends in (c3-m3)' },
      stool: { x: -20, z: 34.45, note: 'market POI by the east stall; sit to blend in' },
    },
    notes: 'The market lane behind CÀ PHÊ CÔ BA, stalls at x -42/-31/-20. By night it is the chợ đêm of the story (there is no night market on ĐƯỜNG CHỢ CŨ): c3-m1 shake the tail, c3-m3 foot tail of Bin, c9-m3 escape.',
  },
  'xe-may-ong-tu': {
    name: 'SỬA XE TƯ', district: 'D1', phase: 'P0', kind: 'door', building: 21, x: -66.5, z: -65.7, yaw: 0, door: { x: -66.5, z: -65.7 },
    spaces: ['xe-may-shop'],
    spots: {
      backDoor: { x: -66.5, z: -78.3, yaw: PI, note: 'back door into the alley course' },
      tarp: { x: -69, z: -63.4, r: 0.9, note: 'c5-m1 dawn: the rebuilt matte-black Dream under a tarp on the sidewalk' },
      plateCar: { x: -40, z: -57.4, yaw: -H, road: true, note: 'c1-m2 observation test: the scripted car passes westbound in front of the shop' },
    },
    notes: 'Ông Tư\'s shop: the corner XE MÁY of ĐƯỜNG HOA SỮA × ĐƯỜNG BÀNG LĂNG (building 21), renamed SỬA XE TƯ; burning in c6-m2, a burnt-out variant until the epilogue, then XE MÁY ÔNG TƯ. The player\'s bike dealer (building 5, BIKE_SHOP (20,-10.9)) is never touched by the story.',
  },
  'xe-may-alley': {
    name: 'HẺM SAU TIỆM ÔNG TƯ', district: 'D1', phase: 'P0', kind: 'alley', x: -80, z: -81.3, area: [-97, -60.5, -85, -77.5],
    spots: {
      start: { x: -69, z: -80.6, note: 'course start behind the back door' },
      gravel: { x: -75, z: -79.4, note: 'gravel patch (loud)' },
      puddle: { x: -84, z: -81.5, note: 'puddles (loud)' },
      bamboo: { x: -91.5, z: -83.6, note: 'story bamboo patch: drag Bin into it' },
      eastMouth: { x: -62.6, z: -79.4, note: 'opens onto ĐƯỜNG BÀNG LĂNG' },
      westMouth: { x: -97.6, z: -83.4, note: 'opens onto ĐƯỜNG TRE XANH' },
      drop: { x: -87.5, z: -78.4, note: 'c6-m2: foot of the downpipe from the BÁNH CUỐN roof' },
    },
    notes: 'The real back alley between the ĐƯỜNG HOA SỮA row and the ĐƯỜNG BỜ SÔNG row (7.5 m wide, x -97..-60.5): c3-m3 training course (noise, shadow, peek, bolt, takedown, drag) and the c6-m2 drop into the alley.',
  },
  'xe-may-roofs': {
    name: 'MÁI DÃY HOA SỮA', district: 'D1', phase: 'P0', kind: 'roof', building: 21, x: -65, z: -72, y: 7.3,
    spots: {
      loft: { x: -66.5, z: -74.5, y: 7.3, solid: true, note: 'roof hatch over the loft' },
      climb: { x: -70.5, z: -75.2, y: 7.3, solid: true, note: 'bamboo scaffold up the PHỞ roof wall, 5.3 m (set the box down to climb)' },
      pho: { x: -76, z: -72, y: 12.6, solid: true, note: 'building 20 roof; the roof gap looks down into the shop (CS06)' },
      tank: { x: -88.6, z: -75.2, y: 10.19, solid: true, note: 'water tank on the BÁNH CUỐN roof (building 89): hide the iron box' },
      banhCuon: { x: -86.9, z: -72, y: 10.19, solid: true, note: 'building 89 roof, 2.4 m below the PHỞ roof across a 1.8 m gap' },
    },
    notes: 'c6-m2 rooftop escape with the iron box: XE MÁY (7.3) → scaffold → PHỞ (12.6) → jump down the 1.8 m gap → BÁNH CUỐN (10.19) → tank → downpipe into the alley. Real heights from city.ts.',
  },
  'cong-an-phuong': {
    name: 'CÔNG AN PHƯỜNG', district: 'D1', phase: 'P0', kind: 'door', building: 55, x: -119.7, z: -27, yaw: H, door: { x: -119.7, z: -27 },
    spaces: ['cong-an-office'],
    spots: { rack: { x: -119.2, z: -33.6, r: 0.6, note: 'motorbike rack on the moto band: Vân stops Tín here' } },
    notes: 'c3-m1. P1 adds the Hoàng Sa one-way service carriageway (x -146) behind it for the wrong-way escape.',
  },
  'cong-vien-an-hoa': {
    name: 'CÔNG VIÊN AN HÒA', district: 'D1', phase: 'P0', kind: 'yard', x: 22.4, z: -31.5, area: [13, 43, -44, -22],
    notes: 'c3-m1: break the SUV\'s line of sight through the park (cars cannot follow).',
  },
  'nha-thuoc': {
    name: 'NHÀ THUỐC', district: 'D1', phase: 'P0', kind: 'door', building: 112, x: -119.7, z: 26.68, yaw: H, door: { x: -119.7, z: 26.68 },
    notes: 'The only NHÀ THUỐC in An Hòa (ĐƯỜNG TRE XANH): its night window is the door. c2-m1 blank order, c5-m1 Quang\'s pickup.',
  },
  'benh-vien': {
    name: 'BỆNH VIỆN AN HÒA', district: 'D1', phase: 'P0', kind: 'door', building: 54, x: 119.7, z: -27, yaw: -H, door: { x: 119.7, z: -27 },
    spaces: ['hospital-ward'],
    spots: { xeom: { x: 117.4, z: -45.5, note: 'c4-m3 option: a xe ôm home (passenger API) instead of limping' } },
    notes: 'c1-m2 flower order, c4-m3 wake-up (ward space, not the display-only hospital modal), c8-m1 Diễm admitted, c8-m2 the 3rd-floor ward.',
  },
  'van-phong': {
    name: 'VĂN PHÒNG', district: 'D1', phase: 'P0', kind: 'door', building: 58, x: 119.7, z: -81, yaw: -H, door: { x: 119.7, z: -81 },
    notes: 'c1-m2 order 1: bánh mì to the office lobby.',
  },
  'banh-mi': {
    name: 'BÁNH MÌ', district: 'D1', phase: 'P0', kind: 'door', building: 41, x: -66.5, z: -44.8, yaw: PI, door: { x: -66.5, z: -44.8 },
    spots: { curb: { x: -66.5, z: -46.4, yaw: H, r: 1, note: 'the Dream on the sidewalk in front, facing east along the street (checkpoint restore of order 1)' } },
    notes: 'c1-m2 order 1 pickup, right across ĐƯỜNG HOA SỮA from Ông Tư\'s shop (keeps the name BÁNH MÌ after RENAMES).',
  },
  'tiem-hoa': {
    name: 'TIỆM HOA', district: 'D1', phase: 'P0', kind: 'door', building: 43, x: -30, z: -44.8, yaw: PI, door: { x: -30, z: -44.8 },
    spots: { curb: { x: -30, z: -46.4, yaw: H, r: 1, note: 'the Dream on the sidewalk in front, facing east (checkpoint restore of order 2)' } },
    notes: 'c1-m2 order 2 pickup (flowers for a new mother at BỆNH VIỆN AN HÒA); keeps the name TIỆM HOA.',
  },
  'pho-nong': {
    name: 'PHỞ BÒ VIÊN', district: 'D1', phase: 'P0', kind: 'door', building: 44, x: -18, z: -44.8, yaw: PI, door: { x: -18, z: -44.8 },
    spots: { curb: { x: -18, z: -46.4, yaw: -H, r: 1, note: 'the Dream on the sidewalk in front, facing west toward the drop (checkpoint restore of order 3)' } },
    notes: 'c1-m2 order 3 pickup (renamed from PHỞ CÔ BA so "Cô Ba" means one person).',
  },
  'nha-khach-pho': {
    name: 'NHÀ SỐ 48 BỜ SÔNG', district: 'D1', phase: 'P0', kind: 'door', building: 63, x: -37.96, z: -96.3, yaw: PI, door: { x: -37.96, z: -96.3 },
    notes: 'c1-m2 order 3 drop: a tube house about 140 m by road from the phở shop, inside the 90 s "cho còn nóng".',
  },
  'mua-1': {
    name: 'NHÀ SỐ 6 AN HÒA', district: 'D1', phase: 'P0', kind: 'door', building: 97, x: 90.3, z: 14.7, yaw: PI, door: { x: 90.3, z: 14.7 },
    notes: 'c1-m3 rain rush, drop 1.',
  },
  'mua-2': {
    name: 'NHÀ SỐ 61 CHỢ CŨ', district: 'D1', phase: 'P0', kind: 'door', building: 82, x: 81.9, z: 96.3, yaw: 0, door: { x: 81.9, z: 96.3 },
    notes: 'c1-m3 rain rush, drop 2.',
  },
  'mua-3': {
    name: 'NHÀ SỐ 43 CHỢ CŨ', district: 'D1', phase: 'P0', kind: 'door', building: 73, x: -81.37, z: 96.3, yaw: 0, door: { x: -81.37, z: 96.3 },
    notes: 'c1-m3 rain rush, drop 3: the ride west along ĐƯỜNG CHỢ CŨ passes Bà Sáu.',
  },
  'ba-sau-nga': {
    name: 'BÀ SÁU NGÃ XE', district: 'D1', phase: 'P0', kind: 'road', x: -30, z: 102.6, yaw: -H,
    notes: 'c1-m3 good deed: Bà Sáu\'s scooter down in the westbound moto lane of ĐƯỜNG CHỢ CŨ, in front of the pagoda (hold E to lift it); she is heading home to her stall on ĐƯỜNG TRE XANH.',
  },
  'che-ba-sau': {
    name: 'CHÈ BÀ SÁU', district: 'D1', phase: 'P0', kind: 'door', building: 116, x: -119.7, z: 92.33, yaw: H, door: { x: -119.7, z: 92.33 },
    notes: 'Bà Sáu\'s home and chè stall (renamed from CHÈ BÀ TƯ): epilogue stop.',
  },
  'xe-che-c9': {
    name: 'XE CHÈ BÀ SÁU', district: 'D1', phase: 'P0', kind: 'spot', x: 36, z: 10.3, yaw: 0,
    notes: 'c9-m1 (flag helpedBaSau): her chè cart with its tarp on the ĐƯỜNG AN HÒA sidewalk, 18 m before the checkpoint at (54, 0); she waves Tín under the tarp.',
  },
  'cp-54-0': { name: 'CHỐT ĐƯỜNG BƯU ĐIỆN', district: 'D1', phase: 'P0', kind: 'road', x: 54, z: 0, notes: 'c9-m1 checkpoint: barriers, cones, a police car on the junction.' },
  'cp-108-0': { name: 'CHỐT ĐƯỜNG BỆNH VIỆN', district: 'D1', phase: 'P0', kind: 'road', x: 108, z: 0, notes: 'c9-m1 checkpoint.' },
  'motel-hoa-hong': {
    name: 'NHÀ NGHỈ HOA HỒNG', district: 'D1', phase: 'P0', kind: 'door', building: 101, x: 90.3, z: 67.7, yaw: PI, door: { x: 90.3, z: 67.7 },
    spaces: ['motel-upstairs'],
    notes: 'c2-m1 delivery to room 7 (upstairs corridor and room 7 are the motel-upstairs space; the story entry skips the 18+ venue modal).',
  },
  'hem-sau-nha-nghi': {
    name: 'HẺM SAU NHÀ NGHỈ', district: 'D1', phase: 'P0', kind: 'alley', x: 84, z: 82, area: [61, 99.5, 79.5, 84.5],
    spots: {
      van: { x: 90.3, z: 82, yaw: H, r: 1, note: 'the white reefer van (5.5 × 2 m) idling behind the motel\'s back door' },
      vanTail: { x: 87.6, z: 82, r: 1 },
      vanNose: { x: 93, z: 82, r: 1 },
      backDoor: { x: 90.3, z: 80, yaw: 0, note: 'motel back door; the young people are walked from it into the van at 03:00' },
      lamp: { x: 88.6, z: 80.2, note: 'wall lamp: Hoa\'s note is read under it (CS02 cont.)' },
      lookout: { x: 92.6, z: 80.4, note: 'the Rắn Đen lookout with the sweeping flashlight (c2-m2 stake-out)' },
      karaokeBack: { x: 77, z: 80, yaw: 0, note: 'KARAOKE ÁNH SAO back door: c5-m1 handoff and back-window exit' },
      handoff: { x: 77.8, z: 81.4 },
      hideCrates: { x: 74.4, z: 81, note: 'stake-out hide 1: behind the karaoke\'s stacked beer crates' },
      hideBamboo: { x: 77.8, z: 82.2, note: 'stake-out hide 2: the bamboo clump at (79.2, 82.2)' },
      hideHem: { x: 87.42, z: 86.3, note: 'stake-out hide 3: the dark 2.1 m hẻm between NHÀ SỐ 61 and 63' },
      exit: { x: 99.8, z: 82, note: 'alley mouth onto ĐƯỜNG BỆNH VIỆN: the van leaves here' },
    },
    notes: 'The back alley of the strip\'s south row (5 m wide). c2-m1 van and note, c2-m2 stake-out (the van loads here, so the stake-out watches the alley, not the street), c5-m1 handoff.',
  },
  'karaoke-anh-sao': {
    name: 'KARAOKE ÁNH SAO', district: 'D1', phase: 'P0', kind: 'door', building: 39, x: 77, z: 67.7, yaw: PI, door: { x: 77, z: 67.7 },
    spaces: ['karaoke-back'], notes: 'c5-m1: staff corridor, beer storeroom, VIP betting room.',
  },
  'moonlight': {
    name: 'VŨ TRƯỜNG MOONLIGHT', district: 'D1', phase: 'P0', kind: 'door', building: 52, x: 67, z: 44.8, yaw: 0, door: { x: 67, z: 44.8 },
    spaces: ['moonlight-floor', 'moonlight-vip', 'moonlight-b2'],
    spots: {
      bouncer: { x: 64.8, z: 45.6, note: 'the bouncer at the door' },
      lion: { x: 67, z: 50.5, road: true, note: 'c10-m1: the múa lân troupe in front of the club' },
      crowd: { x: 69, z: 56.5, road: true, note: 'c10-m3: the neighbours waiting with blankets on the closed street' },
      ambulance: { x: 76, z: 50.6, yaw: -H, road: true, note: 'c10-m4: the ambulance carrying Quang' },
      vanCar: { x: 60.5, z: 59.4, yaw: H, road: true, note: 'c10-m1: Vân\'s Vios parked dark across the street' },
      brawl: { x: 61.6, z: 46.8, note: 'c10-m1: Hổ Vàng\'s fake brawl at the strip\'s west end' },
    },
    notes: 'c5-m3 dance floor and VIP lounge, c10-m2 B2 (via the staff lift), c10-m3 the alarm-lit floor. The strip is ĐƯỜNG PHƯỢNG VĨ x 54..108 (zone "Phố đêm Phượng Vĩ").',
  },
  'spa': {
    name: 'SPA & MASSAGE', district: 'D1', phase: 'P0', kind: 'door', building: 53, x: 77, z: 44.8, yaw: 0, door: { x: 77, z: 44.8 },
    spaces: ['spa-back'], notes: 'c5-m2 closed back section; c10-m1 its back door leads through the service corridor to Moonlight\'s staff lift.',
  },
  'bia-hoi': {
    name: 'BIA HƠI HÀ NỘI', district: 'D1', phase: 'P0', kind: 'door', building: 100, x: 90.3, z: 42.3, yaw: 0, door: { x: 90.3, z: 42.3 },
    spaces: ['bia-hoi-storeroom'],
    spots: {
      lucTable: { x: 94, z: 43.7, r: 0.6, note: 'Lực\'s usual plastic table under the awning; the storeroom vent opens over it' },
      drunkTable: { x: 87.2, z: 43.9, r: 0.6, note: 'the drunk who keeps squinting at Tín' },
      tinTable: { x: 98, z: 39, r: 0.6, note: 'Tín\'s table on the corner sidewalk of ĐƯỜNG BỆNH VIỆN, 6 m from Lực' },
      kegs: { x: 98.2, z: 33.6, r: 0.9, note: 'c9-m2: the keg ba gác parked by the side wall (carry 3 kegs in)' },
      backDoor: { x: 90.3, z: 29.8, yaw: PI, note: 'Tám Hổ\'s back gate onto the alley' },
      pipe: { x: 93, z: 29.6, note: 'downpipe on the back wall: the climb to the roof (c5-m2, c10-m1)' },
    },
    notes: 'Tám Hổ\'s place. It has no interior: c9-m2 plays at the sidewalk tables plus a new front storeroom (bia-hoi-storeroom) whose high vent opens over Lực\'s table. The quoted (90, 40) of the old text is inside the footprint; the back wall is z 30.5.',
  },
  'san-sau-pho-dem': {
    name: 'SÂN SAU MOONLIGHT – SPA', district: 'D1', phase: 'P0', kind: 'yard', x: 73, z: 32, area: [63.5, 84.4, 27.5, 36.4],
    spots: {
      spaBack: { x: 77, z: 35.9, yaw: PI, note: 'spa back door' },
      kitchen: { x: 66, z: 35.9, yaw: PI, note: 'Moonlight kitchen door: the c5-m3 exit' },
      loadingBay: { x: 66, z: 29, r: 1.2, note: 'Moonlight\'s loading bay: Lực\'s reefer truck leaves here at 23:00 on Rằm night' },
      drop: { x: 83.8, z: 33.4, note: 'where the climb down from the roofs lands' },
    },
    notes: 'The walled courtyard Moonlight and the spa share (back alley z 26.5..36.5, walls are story dressing; the bamboo at (69.8, 31.5) stays).',
  },
  'mai-pho-dem': {
    name: 'MÁI DÃY PHỐ ĐÊM', district: 'D1', phase: 'P0', kind: 'roof', building: 100, x: 90.3, z: 36, y: 7.11,
    spots: {
      transformer: { x: 94.6, z: 33.2, y: 7.11, solid: true, level: 'roof', note: 'c10-m1: the transformer box feeding the strip (hold E at 22:00)' },
      plank: { x: 83.3, z: 39.5, y: 7.4, solid: true, level: 'roof', note: 'plank over the 2.55 m gap to the spa\'s water-tank stand, then a 3 m ladder' },
      spa: { x: 77, z: 41, y: 10.2, solid: true, level: 'roof', note: 'spa roof (building 53)' },
      moonlight: { x: 66, z: 42, y: 7.2, solid: true, level: 'roof', note: 'Moonlight roof (building 52)' },
    },
    notes: 'Walkable roofs of the strip\'s north row (c5-m2, c10-m1): bia hơi 7.11 m, spa 10.2 m, Moonlight 7.2 m; the timing beat of c10-m1 rides the lion-dance drums.',
  },
  'pho-dem': {
    name: 'PHỐ ĐÊM PHƯỢNG VĨ', district: 'D1', phase: 'P0', kind: 'road', x: 77, z: 54, area: [54, 108, 47, 61],
    notes: 'The strip street for CS09 (drone at y 40 from x 50 to 100), CS11 (crane up from the street) and the Rằm festival state.',
  },
  'anh-duong': {
    name: 'VIỆC LÀM ÁNH DƯƠNG', district: 'D1', phase: 'P0', kind: 'door', building: 119, x: -69.61, z: 119.7, yaw: PI, door: { x: -69.61, z: 119.7 },
    spaces: ['anh-duong-office'],
    notes: 'NHÀ SỐ 46 on ĐƯỜNG CHỢ CŨ (south side, 4 floors), renamed by RENAMES; sign "LƯƠNG CAO • BAO ĂN Ở • KHÔNG CẦN KINH NGHIỆM" from chapter 1 on. c4-m1, c8-m1 start of the tail.',
  },
  'chua-an-hoa': {
    name: 'CHÙA AN HÒA', district: 'D1', phase: 'P0', kind: 'door', building: 57, x: -25.4, z: 126.2, yaw: PI, door: { x: -25.4, z: 126.2 },
    area: [-41, -13, 120, 137],
    spots: {
      gate: { x: -27, z: 118.6, note: 'outside the three-way gate (pillars at x -31.5 / -22.5)' },
      broom: { x: -24.8, z: 118.4, note: 'Thầy Minh Tịnh sweeping leaves (c9-m3)' },
      matW: { x: -30.5, z: 125.2, note: 'kneeling mats among the worshippers (c6-m1)' },
      matE: { x: -23.5, z: 125.2 },
      car: { x: -27, z: 113.4, yaw: H, road: true, note: 'Phượng\'s black car at the gate (CS05, funeral wreath in c6-m3); the c9-m3 bikers stop here' },
    },
    notes: 'Religious site: ceremony, funeral and refuge only, never combat; the c9-m3 chase and its kicks end before the gate.',
  },
  'truong-tieu-hoc': {
    name: 'TRƯỜNG TIỂU HỌC AN HÒA', district: 'D1', phase: 'P0', kind: 'door', building: 56, x: 27, z: 126.2, yaw: PI, door: { x: 27, z: 126.2 },
    spots: { gate: { x: 27, z: 118.6, note: 'school gate: Vân picks up Bống (epilogue)' } },
    notes: 'Epilogue stop.',
  },
  'nha-chi-van': {
    name: 'NHÀ MÁ CHỊ VÂN', district: 'D1', phase: 'P0', kind: 'door', building: 94, x: -94.18, z: 67.7, yaw: PI, door: { x: -94.18, z: 67.7 },
    spaces: ['van-safehouse'],
    notes: 'Vân\'s safehouse: her late mother\'s 4-storey tube house, "2 Phượng Vĩ", the quiet west end of ĐƯỜNG PHƯỢNG VĨ by ĐƯỜNG TRE XANH (the old (-110, 62) was the carriageway). No sign. c9-m1, c9-m2.',
  },
  'ben-an-hoa': {
    name: 'BẾN AN HÒA', district: 'D1', phase: 'P0', kind: 'pier', x: 2, z: -143,
    spots: {
      rental: { x: 2, z: -149.5, note: 'speedboat hire ring' },
      sunset: { x: 3.2, z: -151.2, note: 'epilogue final shot: Tín at the pier end' },
    },
    notes: 'c6-m3 Quang on the pier (foot chase z -152..-134.6), c7-m2 night start in the hired speedboat, c11-m4 final shot.',
  },
  'cho-ven-song': {
    name: 'CHỢ VEN SÔNG', district: 'D1', phase: 'P0', kind: 'spot', x: 76, z: -122,
    notes: 'c7-m1 optional prep: buy rope at the riverside stalls (market POI).',
  },
  'sa-lan-07': {
    name: 'SÀ LAN SEN VÀNG 07', district: 'D1', phase: 'P0', kind: 'water', x: 95, z: -191, yaw: H,
    area: [80, 110, -194.5, -187.5],
    spots: {
      cut: { x: 30, z: -190, water: true, note: 'c7-m2: cut the engine here, 50 m upstream of the stern, on the emptied lane' },
      ladder: { x: 79.4, z: -191, water: true, note: 'stern ladder: the speedboat is tied here (scripted reposition)' },
      fenders: { x: 92, z: -186.8, water: true, note: 'tyre fenders on the An Hòa side: climb aboard' },
      wheelhouse: { x: 84, z: -191, y: 5.5, solid: true, note: 'wheelhouse at the stern, rotating searchlight on its roof' },
      containers: { x: 100, z: -191, y: 1.6, solid: true, note: 'deck y 1.6, six 20 ft containers in two rows, 1 m side walks' },
      tug: { x: 150, z: -196, water: true, note: 'c7-m2/3: the tug arrives from downstream with Cường' },
    },
    notes: 'The traffic barge of lane -191 (boats.ts) switched to mode anchored at x 95, container-deck variant. Hull 30 × 7: clear of the speedboat lane -184.5 (envelope to -186.8) and the sampan lane -197.5; the fishing boats anchor at x 150 and -40.',
  },
  'r-thuyen-ruot': {
    name: 'CA NÔ ĐUỔI BẮT', district: 'D1', phase: 'P0', kind: 'route', x: 77, z: -191,
    route: [77, -191, 40, -186, 2, -176, -18, -188, -10, -199, 60, -199.5, 130, -199, 165, -185, 185, -165, 190, -154],
    notes: 'c7-m3 boat chase: the tug blocks the run east, so loop west past BẾN AN HÒA, cross to the far bank, run east and in to BẾN BẠCH ĐẰNG (about 360 m). River traffic stays on as obstacles.',
  },
  // ---- D2 QUẬN 1 · BẾN NGHÉ (P0) ---------------------------------------------------------------------------
  'cp-162-0': { name: 'CHỐT VÀO QUẬN 1', district: 'D2', phase: 'P0', kind: 'road', x: 162, z: 0, notes: 'c9-m1 checkpoint at the downtown entry (ĐƯỜNG ĐỒNG KHỞI × ĐƯỜNG AN HÒA); the river swim bypasses it.' },
  'nga-tu-216-54': {
    name: 'NGÃ TƯ NGUYỄN HUỆ', district: 'D2', phase: 'P0', kind: 'road', x: 216, z: -54,
    notes: 'c4-m2 scripted T-bone (CS04): the black SUV runs the red from the west.',
  },
  'nga-tu-108-54': {
    name: 'NGÃ TƯ BỆNH VIỆN – HOA SỮA', district: 'D1', phase: 'P0', kind: 'road', x: 108, z: -54,
    notes: 'c2-m2 red-light beat: a ward patrol car pulls up beside the van and waves it on.',
  },
  'ben-bach-dang': {
    name: 'BẾN BẠCH ĐẰNG', district: 'D2', phase: 'P0', kind: 'pier', x: 190, z: -143,
    spots: {
      handover: { x: 190, z: -137, note: 'river police take the rescued (blankets, hot water)' },
      blankets: { x: 186.5, z: -128.5, note: 'promenade: the female officer kneels to Bé Tí' },
      lucCars: { x: 196, z: -113.4, yaw: -H, road: true, note: 'c7-m3: Lực\'s ward cars stop on the riverside road' },
    },
    notes: 'c7-m3 arrival and handover; Tín slips away along the promenade (1-star evasion).',
  },
  'lan-can-bach-dang': {
    name: 'LAN CAN BẾN BẠCH ĐẰNG', district: 'D2', phase: 'P0', kind: 'spot', x: 219.3, z: -134.6,
    spots: {
      cab: { x: 219.3, z: -140.6, water: true, note: 'the reefer truck\'s cab hangs over the water' },
      run: { x: 218.6, z: -124, r: 1.3, note: 'the truck crosses the promenade clear of the palms at (214,-131) and (217,-117.6)' },
      arrest: { x: 223, z: -132.6, note: 'Vân arrests Lực at the broken railing' },
    },
    notes: 'c11-m1: the cab fight sends the truck straight across the Nguyễn Huệ T (216,-108), over the promenade and through the railing 29 m east of the BẠCH ĐẰNG pier, where Lộc\'s river police stand by.',
  },
  'thap-phuong-nam': {
    name: 'THÁP PHƯƠNG NAM', district: 'D2', phase: 'P0', kind: 'door', building: 154, x: 189, z: -95.3, yaw: PI, door: { x: 189, z: -95.3 },
    notes: 'Lobby with the security desk (scanner check) and the express lift (existing enterDeck fade). c6-m1 photo of the helipad from the deck, c11-m2.',
  },
  'dai-quan-sat-68': {
    name: 'ĐÀI QUAN SÁT TẦNG 68', district: 'D2', phase: 'P0', kind: 'deck', building: 154, x: 189, z: -82, y: 232.2,
    spots: {
      gate: { x: 192, z: -82, y: 232.2, yaw: H, solid: true, note: 'the story jump gate on the east edge, facing the helipad 51 m east and 64 m down ("NHẢY DÙ — TẠM NGƯNG")' },
      cafe: { x: 189, z: -79.3, y: 232.2, solid: true, note: 'moon-viewing café counter on the south edge (mooncake order)' },
      rack: { x: 186, z: -82, y: 232.2, solid: true, note: 'parachute rack on the west edge' },
      photo: { x: 191.8, z: -84.5, y: 232.2, solid: true, note: 'c6-m1: from here the black-and-gold helicopter on the roof pad is in full view (it cannot be seen from the street)' },
    },
    notes: 'The deck is the top of the central tube, walkable 6.7 m square round the spire (deckWalk). At most 6 people on it in c11-m2: the café manager, 2 deck staff at the gate, 3 moon-watchers.',
  },
  'tai-chinh': {
    name: 'TÒA THÁP TÀI CHÍNH', district: 'D2', phase: 'P0', kind: 'door', building: 155, x: 243, z: -95.3, yaw: PI, door: { x: 243, z: -95.3 },
    spots: {
      ramp: { x: 248, z: -72, yaw: 0, note: 'basement ramp mouth (dressing: a dark ramp and a roller shutter; the limo despawns behind it, there is no basement level)' },
      service: { x: 231.4, z: -80, yaw: -H, note: 'service door: the fail-forward stair after a missed landing (c11-m2)' },
    },
    notes: 'Phượng\'s tower (Sen Vàng rents the top five floors). c6-m1 tail destination, c11-m2/3.',
  },
  'san-thuong-tai-chinh': {
    name: 'SÂN ĐỖ TRỰC THĂNG', district: 'D2', phase: 'P0', kind: 'roof', building: 155, x: 243, z: -83.5, y: 168,
    area: [232, 254, -94.5, -72.5],
    spots: {
      pad: { x: 243, z: -85, y: 168, solid: true, note: 'H in a 16 m circle: the parachute landing ring; Phượng\'s helicopter parks on it, nose east' },
      stairs: { x: 235, z: -75.5, y: 168, solid: true, note: 'stair housing (south-west corner), door facing north' },
      ac: { x: 250.5, z: -75, y: 168, solid: true, note: 'AC condensers (south-east corner): Su hides behind them' },
      fuel: { x: 251.5, z: -90.5, y: 168, solid: true, note: 'fuel cart (cover in stage 2)' },
      edge: { x: 243, z: -94.2, y: 168, solid: true, note: 'the open north edge (0.25 m kerb and edge lights, no parapet): Phượng goes over here' },
      taskForce: { x: 258, z: -104, y: 176, air: true, note: 'the task-force helicopter hovers off the north-east corner, searchlight on the pad; it never lands' },
    },
    notes: 'Decision: a flat 22 × 22 m roof pad at 168 m replaces the cone spire and the 124 m cantilever (skyline.ts, world owner). Parapet 1.1 m on three sides. c11-m3, CS12.',
  },
  'nha-hat': {
    name: 'NHÀ HÁT THÀNH PHỐ', district: 'D2', phase: 'P0', kind: 'door', building: 158, x: 243, z: -12.7, yaw: 0, door: { x: 243, z: -12.7 },
    spaces: ['nha-hat-gala'],
    spots: {
      serviceLane: { x: 249, z: -36.5, note: 'service lane behind the theatre' },
      cateringVan: { x: 238, z: -36.6, yaw: H, r: 1, note: 'catering van: steal the waiter vest' },
      kitchen: { x: 243, z: -32.1, yaw: PI, note: 'kitchen door' },
    },
    notes: 'c8-m3 gala "ĐÊM SEN VÀNG — VÌ TRẺ EM MIỀN TÂY".',
  },
  'ngan-hang': {
    name: 'NGÂN HÀNG KIM THÀNH', district: 'D2', phase: 'P0', kind: 'door', building: 159, x: 282.7, z: -27, yaw: -H, door: { x: 282.7, z: -27 },
    spaces: ['bank-floor20'],
    spots: {
      gondola: { x: 283.1, z: -33, y: 76, air: true, note: 'window-cleaning gondola on the west facade at floor 20' },
      foot: { x: 282.9, z: -33, note: 'where the gondola reaches the sidewalk' },
      dream: { x: 281, z: -37.5, r: 0.9, note: 'the Dream waiting on the moto band' },
    },
    notes: 'Renamed from NGÂN HÀNG PHƯƠNG NAM (a real, merged bank). c8-m4.',
  },
  'tttm': {
    name: 'TRUNG TÂM THƯƠNG MẠI', district: 'D2', phase: 'P0', kind: 'door', building: 160, x: 203.3, z: 27, yaw: H, door: { x: 203.3, z: 27 },
    spots: {
      shippers: { x: 206.8, z: 31, note: 'lunch rush: 10+ orange-jacket riders wait here (extras on the rider wardrobe)' },
      ramp: { x: 182, z: 12.9, yaw: PI, note: 'car-park ramp mouth (dressing); the mission fades out here into Vân\'s car' },
    },
    notes: 'c9-m1 destination. No basement level: the ramp is a fade.',
  },
  'song-xanh': {
    name: 'CHUNG CƯ SÔNG XANH', district: 'D2', phase: 'P0', kind: 'door', building: 161, x: 282.7, z: 27, yaw: -H, door: { x: 282.7, z: 27 },
    notes: 'Phượng\'s penthouse (exterior only): c6-m1 end of the tail. The villa stamps are not used by this campaign.',
  },
  'phu-my': {
    name: 'CHUNG CƯ PHÚ MỸ', district: 'D2', phase: 'P0', kind: 'door', building: 163, x: 297, z: 66.7, yaw: PI, door: { x: 297, z: 66.7 },
    spaces: ['phu-my'],
    spots: { ramp: { x: 283, z: 80, yaw: -H, note: 'car-park ramp mouth onto ĐƯỜNG HÀM NGHI (Vân\'s car waits below)' } },
    notes: 'c8-m1: lobby, 12th-floor corridor, apartment 1204, fire-stair landings and car park are the phu-my space.',
  },
  'cong-vien-thanh-pho': {
    name: 'CÔNG VIÊN THÀNH PHỐ', district: 'D2', phase: 'P0', kind: 'yard', x: 240, z: 74, area: [228.5, 257.5, 66.5, 95.5],
    notes: 'Epilogue: Diễm walks Su home through the park.',
  },
  'ben-du-thuyen': {
    name: 'BẾN DU THUYỀN', district: 'D2', phase: 'P0', kind: 'pier', x: 300, z: -143,
    spots: { rental: { x: 300, z: -149.5 }, jetty: { x: 301.4, z: -137.4, note: 'Vân on the jetty with her radio (c7-m1)' } },
    notes: 'c7-m1: hire the speedboat as a tourist and cruise past the barge.',
  },
  'r-xe-tai-trang': {
    name: 'CHẠY THEO XE TẢI TRẮNG', district: 'D1', phase: 'P0', kind: 'route', x: -66, z: -102.6,
    route: [-66, -102.6, 0, -104.6, 108, -104.6, 162, -104.6, 216, -104.6, 216, -54],
    notes: 'c4-m2: the van with Mai runs east in the eastbound lanes of the riverside road (centre z -108), into Quận 1 and south down ĐẠI LỘ NGUYỄN HUỆ to the T-bone at (216,-54).',
  },
  'r-limo': {
    name: 'BÁM XE PHƯỢNG', district: 'D1', phase: 'P0', kind: 'route', x: -27, z: 113.4,
    route: [-27, 113.4, 0, 111, 0, 3, 108, 3, 216, 3, 216, -51, 228, -51, 248, -60],
    notes: 'c6-m1 low-pressure limo tail: from the pagoda gate along ĐƯỜNG TRUNG TÂM and ĐƯỜNG AN HÒA into Quận 1, up NGUYỄN HUỆ to the ramp of TÒA THÁP TÀI CHÍNH.',
  },
  'r-xe-dong-lanh': {
    name: 'XE ĐÔNG LẠNH ĐÊM RẰM', district: 'D1', phase: 'P0', kind: 'route', x: 66, z: 31.5,
    route: [66, 31.5, 54, 31.5, 54, 3, 216, 3, 216, -108, 218.8, -114, 218.6, -124, 219.3, -134.6], free: [0, 5, 6],
    notes: 'c11-m1: Moonlight\'s loading bay → ĐƯỜNG AN HÒA under the lanterns → NGUYỄN HUỆ (festival crowds, the lion dance at a junction) → it should turn east toward Cầu Khánh Hội and the cargo ship (P1) but the cab fight sends it through the railing.',
  },
  'r-bin': {
    name: 'BÁM BIN QUA CHỢ ĐÊM', district: 'D1', phase: 'P0', kind: 'route', x: -62.6, z: -79.4,
    route: [-62.6, -79.4, -62.4, -62.4, -62.4, 8.4, -62.4, 29.5, -46, 29.5, -12, 29.5],
    notes: 'c3-m3 foot tail: from the alley mouth up the ĐƯỜNG BÀNG LĂNG sidewalk into the Chợ An Hòa night market (about 2 minutes); the lane leg runs at z 29.5, in front of the stalls (z 30.8..33.2).',
  },
  'r-ve-nha': {
    name: 'ĐƯỜNG VỀ QUÁN', district: 'D1', phase: 'P0', kind: 'route', x: -76, z: -117.95,
    route: [-76, -117.95, -76, -116.4, -62.4, -116.4, -62.4, -8.4, -30, -8.4, -30, 8.4, -30, 14.7],
    notes: 'c1-m1 walk with the duffel (about 180 m, sprint off) and c4-m2 race in reverse (1:45).',
  },
  // ---- P1: Quận 4 slice (D5) and the Bến Nghé canal strip (D2) --------------------------------------------
  'r-bam-duoi': {
    name: 'BÁM ĐUÔI LÚC BA GIỜ', district: 'D1', phase: 'P1', kind: 'route', x: 99.8, z: 82,
    route: [99.8, 82, 108, 82, 108, 54, 108, -54, 108, -108, 216, -108, 324, -108, 372, -108, 450, -108, 500, -60, 570, -60, 580, -69], free: [0],
    notes: 'c2-m2 headlight-off tail, about 700 m: the alley → ĐƯỜNG BỆNH VIỆN north (red-light beat at (108,-54)) → the riverside road east through Quận 1 → Cầu Khánh Hội → Nguyễn Tất Thành → CỔNG KHO 7.',
  },
  'kho-7': {
    name: 'KHO 7', district: 'D5', phase: 'P1', kind: 'stamp', stamp: 'kho7', x: 580, z: -106, yaw: 0, door: { x: 582, z: -79.2 },
    area: [506, 640, -137.6, -76],
    spots: {
      gate: { x: 580, z: -76.2, note: 'CỔNG KHO 7 in the port fence, floodlit; "CHO THUÊ" sign in c3-m2' },
      booth: { x: 590.6, z: -77.9, solid: true, note: 'guard booth inside the gate' },
      dog: { x: 594.6, z: -78.4, note: 'the chained yard dog (barks within 6 m)' },
      fence: { x: 548, z: -103.8, note: 'climb the 2.4 m cang-tay fence (z -105) from the dark strip behind KHO SỐ 49' },
      fenceIn: { x: 548, z: -106.6, note: 'the yard side of the fence climb (ClimbLink leo-rao, far end)' },
      bike1: { x: 576, z: -77.2, yaw: 0, r: 1, note: 'c2-m3 route b: the three Rắn Đen scooters burst out of the gateway, 3.5 m apart' },
      bike2: { x: 579.5, z: -77.2, yaw: 0, r: 1 },
      bike3: { x: 583, z: -77.2, yaw: 0, r: 1 },
      crates: { x: 528.6, z: -116.8, note: 'fish-crate stacks of the west apron (1.5 m lanes)' },
      quay: { x: 563, z: -134.8, note: 'the quay apron between the warehouse and the river' },
      hatch: { x: 580, z: -133.2, yaw: PI, note: 'river-side hatch; c3-m2 drag marks lead through it to the quay edge' },
      reefers: { x: 602.4, z: -110, note: 'lane between the east wall and the reefers' },
      ladder: { x: 601.6, z: -95, note: 'foot of the ladder up the east wall' },
      roof: { x: 598, z: -95, y: 11, solid: true, level: 'roof', note: 'tin roof at the ladder head (running is loud); ClimbLink leo-thang ends here' },
      skylight: { x: 578, z: -112, y: 11, solid: true, level: 'roof', note: 'the grimy skylight: "Nhìn xuống" → CS03 PHÓNG VÔ Ổ' },
      pipeTop: { x: 561.5, z: -131.2, y: 11, solid: true, level: 'roof', note: 'roof corner over the north-west downpipe (ClimbLink tuot-ong: down to the quay)' },
      slotTop: { x: 561, z: -99, y: 11, solid: true, level: 'roof', note: 'west roof edge over the wall slot (ClimbLink chui-khe: chimney down to the Dream)' },
      hall: { x: 580, z: -110, solid: true, note: 'cold hall, packing line, cage, office whiteboard inside the hollow shell' },
      downpipe: { x: 561, z: -133.4, note: 'escape a: foot of the north-west downpipe on the quay, then into the river' },
      wallSlot: { x: 558.8, z: -99, note: 'escape b: chimney down the slot west of the warehouse to the Dream' },
    },
    notes: 'The ring\'s cold store moves here from the An Hòa promenade (KHO LẠNH SỐ 9 → "KHO 7", kho lạnh số 7). The stamp is built as a hollow shell (wall colliders, door, hatch, roof slab at 11 m with the skylight) so CS03 is one on-map shot; the interior is story-owned. Inside the port fence, crime is the ring\'s alarm, not the police.',
  },
  'khe-kho-7': {
    name: 'KHE TƯỜNG CẠNH KHO 7', district: 'D5', phase: 'P1', kind: 'spot', x: 558.8, z: -90, yaw: 0,
    spots: { mouth: { x: 558.8, z: -80.6 }, back: { x: 558.8, z: -98.6 } },
    notes: 'The 2.4 m dark gap between KHO SỐ 49 (generated) and KHO 7, outside the fence, 25 m from the gate: hide the Dream (c2-m2), escape b lands here (c2-m3). If generation moves the neighbour, any dark spot within 30 m of the gate outside the fence serves (re-run the check).',
  },
  'tau-hang': {
    name: 'TÀU HÀNG SEN VÀNG', district: 'D5', phase: 'P1', kind: 'stamp', stamp: 'cargo-ship', x: 527, z: -158, yaw: 0,
    spots: {
      lee: { x: 540, z: -144.5, water: true, note: 'escape a: the dark water between the quay and the hull ("Nổi im" here)' },
      fenders: { x: 534, z: -148.4, water: true, note: 'hide between the hull fenders while flashlights sweep from the quay' },
      gangway: { x: 527, z: -136.6, note: 'gangway foot on the quay' },
    },
    notes: 'Moored in the Khánh Hội basin (hull 95 × 16, x 479.5..574.5, z -166..-150). c2-m3 swim cover; the container ship of CS08 ("rời cảng là xong đợt cuối") and the destination of the c11-m1 truck.',
  },
  'bo-ben-nghe': {
    name: 'BỜ SÔNG CÔNG VIÊN BẾN NGHÉ', district: 'D2', phase: 'P1', kind: 'spot', x: 384, z: -133,
    spots: { climb: { x: 386, z: -136.4, note: 'promenade bank west of the canal mouth: the swimmer climbs out here' } },
    notes: 'c2-m3 dawn on the bank (both escape routes end here), on the Quận 1 canal strip built by the quan-4 layout.',
  },
  'r-thoat-q4': {
    name: 'THOÁT QUA HẺM VĨNH KHÁNH', district: 'D5', phase: 'P1', kind: 'route', x: 558.8, z: -80.6,
    route: [558.8, -80.6, 558, -63, 520, -60, 520, 0, 572, 0, 572, 24, 568, 30, 568, 54], free: [0],
    notes: 'c2-m3 escape b: three Rắn Đen scooters chase; break line of sight for 15 s in the moto-only hẻm of Vĩnh Khánh.',
  },
  'r-boi-thoat': {
    name: 'BƠI DỌC MẠN TÀU', district: 'D5', phase: 'P1', kind: 'route', x: 563, z: -138.6,
    route: [563, -138.6, 540, -144.5, 500, -144, 470, -142, 432, -141, 400, -140, 386, -138.4],
    notes: 'c2-m3 escape a: off the quay, along the ship\'s lee, past the Nhà Rồng quay (passing only) and across the canal mouth to the Bến Nghé bank (about 180 m).',
  },
  'cau-khanh-hoi': {
    name: 'CẦU KHÁNH HỘI', district: 'D2', phase: 'P1', kind: 'road', x: 411, z: -108,
    notes: 'CS01 option once Quận 4 is wired: the xe đò crosses westbound at sunrise and the camera rises to THÁP PHƯƠNG NAM ahead (P0: the coach enters along the riverside road from the east edge).',
  },
};

/** The off-map band for every walkable story set and cutscene set (interiors.ts keeps z -2400): slot k sits at x = x0 + k·step, z, each ≤ size square. */
export const OFFMAP = { z: -3400, x0: -1200, step: 200, size: 160 } as const;
/** Spaces: walkable sets in the off-map band (or cutscene-only sets), each entered from a site. */
export const SPACES: Record<string, { name: string; site: string | null; notes: string }> = {
  'attic': { name: 'Gác xép nhà Cô Ba', site: 'cafe-co-ba', notes: 'mattress, desk, window, chalk wall (deduction board), floor hollow' },
  'co-ba-ground': { name: 'Tầng trệt quán Cô Ba', site: 'cafe-co-ba', notes: 'counter, kitchen, back stairs inside, CCTV recorder, TV (c5-m1, c8-m4, c9-m3 raid)' },
  'xe-may-shop': { name: 'Tiệm sửa xe Tư', site: 'xe-may-ong-tu', notes: 'shop floor, back room (photo, drawer), loft hatch to the roof; burning variant (c6-m2)' },
  'cong-an-office': { name: 'Công an phường', site: 'cong-an-phuong', notes: 'front desk, corridor, Lực\'s office, holding cell (epilogue)' },
  'motel-upstairs': { name: 'Hành lang lầu nhà nghỉ', site: 'motel-hoa-hong', notes: 'reception, stairs, corridor, room 7' },
  'karaoke-back': { name: 'Khu nhân viên karaoke', site: 'karaoke-anh-sao', notes: 'staff corridor, beer storeroom with back window, VIP betting room' },
  'spa-back': { name: 'Khu sau spa', site: 'spa', notes: 'corridor, manager\'s office, steam pump, storeroom; service corridor to Moonlight\'s staff lift' },
  'moonlight-floor': { name: 'Sàn nhảy Moonlight', site: 'moonlight', notes: 'dance floor, bar, stairs, front doors (c5-m3, c10-m3)' },
  'moonlight-vip': { name: 'Lầu VIP Moonlight', site: 'moonlight', notes: 'balcony, one-way-mirror lounge, service stairs, kitchen, staff lift door' },
  'moonlight-b2': { name: 'Tầng hầm B2', site: 'moonlight', notes: 'packing/cold room with freezer, CCTV office, cell corridor, cells, staff stairs; dark variant for CS01' },
  'bia-hoi-storeroom': { name: 'Kho bia hơi', site: 'bia-hoi', notes: 'front storeroom, climbable shelving, vent over Lực\'s table' },
  'anh-duong-office': { name: 'Văn phòng Ánh Dương', site: 'anh-duong', notes: 'waiting room with photo board, front desk, water cooler, back office' },
  'hospital-ward': { name: 'Khu nội trú lầu 3', site: 'benh-vien', notes: 'corridors, curtained bays, nurses\' station with 4-camera monitor, linen room, stairwell' },
  'phu-my': { name: 'Chung cư Phú Mỹ', site: 'phu-my', notes: 'lobby desk, 12th-floor corridor, apartment 1204, 3 stair landings, car park' },
  'nha-hat-gala': { name: 'Dạ tiệc Nhà Hát', site: 'nha-hat', notes: 'foyer/gala hall, kitchen, backstage, lighting catwalk, private box' },
  'bank-floor20': { name: 'Tầng 20 ngân hàng', site: 'ngan-hang', notes: 'lobby desk, stairwell (fade), floor-20 office with CCTV and fuse box, Bảo\'s office and safe' },
  'van-safehouse': { name: 'Nhà má chị Vân', site: 'nha-chi-van', notes: 'ground floor with gas ring, stairs, front room' },
  'village-tan-thuan': { name: 'Cù lao Tân Thuận', site: null, notes: 'cutscene only: stilt house, lotus pond, coach on a bridge' },
  'courtroom': { name: 'Phiên tòa', site: null, notes: 'cutscene only' },
  'airport-lounge': { name: 'Phòng chờ sân bay', site: null, notes: 'cutscene only (post-credits stinger)' },
};

export type MissionSites = { title: string; phase: Phase; sites: string[]; spaces?: string[]; later?: string[]; notes?: string };
/** Every mission's places. `phase` is the latest phase among `sites`; `later` are upgrades that switch on once their phase is built. */
export const MISSION_SITES: Record<string, MissionSites> = {
  'c1-m1': { title: 'Chuyến xe đò sáng sớm', phase: 'P0', sites: ['ben-xe-an-hoa', 'r-ve-nha', 'cafe-co-ba'], spaces: ['attic', 'village-tan-thuan', 'moonlight-b2'], later: ['cau-khanh-hoi'] },
  'c1-m2': { title: 'Đơn hàng đầu tiên', phase: 'P0', sites: ['xe-may-ong-tu', 'banh-mi', 'van-phong', 'tiem-hoa', 'benh-vien', 'pho-nong', 'nha-khach-pho'], spaces: ['xe-may-shop'] },
  'c1-m3': { title: 'Bốn mươi triệu', phase: 'P0', sites: ['mua-1', 'mua-2', 'ba-sau-nga', 'mua-3', 'cafe-co-ba'], spaces: ['attic', 'village-tan-thuan'] },
  'c2-m1': { title: 'Phòng số 7', phase: 'P0', sites: ['nha-thuoc', 'pho-dem', 'motel-hoa-hong', 'hem-sau-nha-nghi'], spaces: ['motel-upstairs'] },
  'c2-m2': { title: 'Bám đuôi lúc ba giờ', phase: 'P1', sites: ['hem-sau-nha-nghi', 'r-bam-duoi', 'nga-tu-108-54', 'khe-kho-7', 'kho-7'] },
  'c2-m3': { title: 'Cái kho bên sông', phase: 'P1', sites: ['kho-7', 'tau-hang', 'r-boi-thoat', 'khe-kho-7', 'r-thoat-q4', 'bo-ben-nghe'], notes: 'no rooftop kitchen: the An Hòa rooftop route is cut' },
  'c3-m1': { title: 'Trình báo', phase: 'P0', sites: ['cong-an-phuong', 'cho-an-hoa', 'cong-vien-an-hoa', 'cafe-co-ba'], spaces: ['cong-an-office'] },
  'c3-m2': { title: 'Kho trống', phase: 'P1', sites: ['kho-7'], notes: 'scrubbed day variant of the hollow shell' },
  'c3-m3': { title: 'Ông thầy sửa xe', phase: 'P0', sites: ['xe-may-ong-tu', 'xe-may-alley', 'r-bin', 'cho-an-hoa'], spaces: ['xe-may-shop'] },
  'c4-m1': { title: 'Cơm trưa cho văn phòng Ánh Dương', phase: 'P0', sites: ['anh-duong'], spaces: ['anh-duong-office'] },
  'c4-m2': { title: 'Tấm ảnh trong sổ', phase: 'P0', sites: ['cafe-co-ba', 'r-ve-nha', 'ben-xe-an-hoa', 'r-xe-tai-trang', 'nga-tu-216-54'], spaces: ['attic', 'village-tan-thuan'] },
  'c4-m3': { title: 'Mưa trên gác xép', phase: 'P0', sites: ['benh-vien', 'cafe-co-ba'], spaces: ['hospital-ward', 'attic'] },
  'c5-m1': { title: 'Đơn hàng không tên', phase: 'P0', sites: ['cafe-co-ba', 'xe-may-ong-tu', 'nha-thuoc', 'karaoke-anh-sao', 'hem-sau-nha-nghi'], spaces: ['co-ba-ground', 'karaoke-back'] },
  'c5-m2': { title: 'Spa nửa đêm', phase: 'P0', sites: ['bia-hoi', 'mai-pho-dem', 'san-sau-pho-dem', 'spa'], spaces: ['spa-back'] },
  'c5-m3': { title: 'Vũ trường Moonlight', phase: 'P0', sites: ['moonlight', 'san-sau-pho-dem'], spaces: ['moonlight-floor', 'moonlight-vip'] },
  'c6-m1': { title: 'Cuộc hẹn ở chùa', phase: 'P0', sites: ['chua-an-hoa', 'r-limo', 'tai-chinh', 'thap-phuong-nam', 'dai-quan-sat-68', 'song-xanh'] },
  'c6-m2': { title: 'Lửa ở tiệm xe', phase: 'P0', sites: ['xe-may-ong-tu', 'xe-may-roofs', 'xe-may-alley'], spaces: ['xe-may-shop'] },
  'c6-m3': { title: 'Bến sông lúc rạng đông', phase: 'P0', sites: ['ben-an-hoa', 'chua-an-hoa'] },
  'c7-m1': { title: 'Trinh sát trên sông', phase: 'P0', sites: ['cafe-co-ba', 'cho-ven-song', 'ben-du-thuyen', 'sa-lan-07'] },
  'c7-m2': { title: 'Đêm mùng mười', phase: 'P0', sites: ['ben-an-hoa', 'sa-lan-07'] },
  'c7-m3': { title: 'Ca nô đuổi bắt', phase: 'P0', sites: ['sa-lan-07', 'r-thuyen-ruot', 'ben-bach-dang'] },
  'c8-m1': { title: 'Người tuyển dụng sa lưới', phase: 'P0', sites: ['anh-duong', 'phu-my', 'benh-vien'], spaces: ['phu-my'] },
  'c8-m2': { title: 'Giờ thăm bệnh', phase: 'P0', sites: ['benh-vien'], spaces: ['hospital-ward'] },
  'c8-m3': { title: 'Dạ tiệc ở Nhà Hát', phase: 'P0', sites: ['nha-hat'], spaces: ['nha-hat-gala'] },
  'c8-m4': { title: 'Két sắt tầng 20', phase: 'P0', sites: ['ngan-hang', 'cafe-co-ba'], spaces: ['bank-floor20', 'co-ba-ground'] },
  'c9-m1': { title: 'Cả thành phố tìm tôi', phase: 'P0', sites: ['cafe-co-ba', 'cp-54-0', 'xe-che-c9', 'cp-108-0', 'cp-162-0', 'tttm', 'nha-chi-van'], spaces: ['attic', 'co-ba-ground', 'van-safehouse', 'village-tan-thuan'] },
  'c9-m2': { title: 'Bia hơi và đoạn ghi âm', phase: 'P0', sites: ['bia-hoi', 'san-sau-pho-dem', 'hem-sau-nha-nghi', 'nha-chi-van'], spaces: ['bia-hoi-storeroom', 'van-safehouse'] },
  'c9-m3': { title: 'Quang trở về', phase: 'P0', sites: ['cafe-co-ba', 'cho-an-hoa', 'chua-an-hoa'], spaces: ['co-ba-ground'] },
  'c10-m1': { title: 'Rước đèn và mất điện', phase: 'P0', sites: ['pho-dem', 'moonlight', 'bia-hoi', 'mai-pho-dem', 'san-sau-pho-dem', 'spa'], spaces: ['spa-back', 'moonlight-vip'] },
  'c10-m2': { title: 'Tầng hầm B2', phase: 'P0', sites: ['moonlight'], spaces: ['moonlight-b2'] },
  'c10-m3': { title: 'Cường Sẹo', phase: 'P0', sites: ['moonlight', 'pho-dem'], spaces: ['moonlight-floor'] },
  'c10-m4': { title: 'Còn hai đơn', phase: 'P0', sites: ['moonlight'] },
  'c11-m1': { title: 'Xe đông lạnh', phase: 'P0', sites: ['san-sau-pho-dem', 'r-xe-dong-lanh', 'lan-can-bach-dang', 'ben-bach-dang'], later: ['tau-hang'] },
  'c11-m2': { title: 'Tầng 68', phase: 'P0', sites: ['tai-chinh', 'thap-phuong-nam', 'dai-quan-sat-68', 'san-thuong-tai-chinh'] },
  'c11-m3': { title: 'Sân đỗ trực thăng', phase: 'P0', sites: ['san-thuong-tai-chinh'] },
  'c11-m4': { title: 'Mùa sen', phase: 'P0', sites: ['xe-may-ong-tu', 'cafe-co-ba', 'che-ba-sau', 'truong-tieu-hoc', 'cong-vien-thanh-pho', 'ben-xe-an-hoa', 'ben-an-hoa'], spaces: ['courtroom', 'airport-lounge', 'village-tan-thuan', 'cong-an-office'] },
};

/** The twelve scripted cutscenes of story-final.md: their mission, places and sets. */
export const CUTSCENE_SITES: Record<string, { mission: string; phase: Phase; sites: string[]; spaces?: string[]; later?: string[]; notes?: string }> = {
  cs01_mo_dau: { mission: 'c1-m1', phase: 'P0', sites: ['ben-xe-an-hoa'], spaces: ['moonlight-b2', 'village-tan-thuan'], later: ['cau-khanh-hoi'], notes: 'P0: the coach enters along the riverside road from the east edge' },
  cs02_phong_so_7: { mission: 'c2-m1', phase: 'P0', sites: ['hem-sau-nha-nghi'], spaces: ['motel-upstairs'] },
  cs03_phong_vo_o: { mission: 'c2-m3', phase: 'P1', sites: ['kho-7'], notes: 'one on-map shot: skylight → hollow shell interior' },
  cs04_anh_hai: { mission: 'c4-m2', phase: 'P0', sites: ['r-xe-tai-trang', 'nga-tu-216-54'], spaces: ['attic', 'village-tan-thuan'] },
  cs05_sen_bi_hai: { mission: 'c6-m1', phase: 'P0', sites: ['chua-an-hoa'] },
  cs06_lua_tiem_xe: { mission: 'c6-m2', phase: 'P0', sites: ['xe-may-ong-tu', 'xe-may-roofs'], spaces: ['xe-may-shop'] },
  cs07_container_07: { mission: 'c7-m2', phase: 'P0', sites: ['sa-lan-07'] },
  cs08_gia_cua_im_lang: { mission: 'c8-m3', phase: 'P0', sites: ['nha-hat'], spaces: ['nha-hat-gala'] },
  cs09_dem_ram_mat_dien: { mission: 'c10-m1', phase: 'P0', sites: ['pho-dem', 'mai-pho-dem', 'moonlight'], spaces: ['moonlight-b2'] },
  cs10_doan_tu: { mission: 'c10-m2', phase: 'P0', sites: ['moonlight'], spaces: ['moonlight-b2'] },
  cs11_dem_toi_nam: { mission: 'c10-m3', phase: 'P0', sites: ['moonlight', 'pho-dem'], spaces: ['moonlight-floor'] },
  cs12_giao_tan_tay: { mission: 'c11-m3', phase: 'P0', sites: ['san-thuong-tai-chinh'] },
};

/**
 * Unique names for the places the story names (for the world owner, city.ts): legacy shop names cycle over the
 * map, so "CÀ PHÊ CÔ BA" stands on 9 houses, "PHỞ CÔ BA" on 6, "XE MÁY" on 4, "TIỆM HOA" on 5, "BÁNH MÌ" on 7. One
 * keeps each name (CÀ PHÊ CÔ BA 13, TIỆM HOA 43, BÁNH MÌ 41) and "Cô Ba" stays one woman. Renamed shops keep
 * their kind and the word side-missions.ts matches (/BÁNH MÌ/, /PHỞ/). Apply as a post-pass by id (like VENUES),
 * so the layout and RNG are untouched; `from` and `door` guard against a shifted id.
 */
export const RENAMES: { id: number; from: string; door: [number, number]; name: string; subtitle?: string }[] = [
  { id: 0, from: 'CÀ PHÊ CÔ BA', door: [-76, -11.7], name: 'CÀ PHÊ SỮA ĐÁ', subtitle: 'CÀ PHÊ PHIN • BẠC XỈU' },
  { id: 3, from: 'CÀ PHÊ CÔ BA', door: [-31, -11.7], name: 'CÀ PHÊ VỢT', subtitle: 'CÀ PHÊ VỢT • TRÀ ĐÁ' },
  { id: 8, from: 'CÀ PHÊ CÔ BA', door: [66.93, -11.7], name: 'CÀ PHÊ CÓC', subtitle: 'CÀ PHÊ • NƯỚC NGỌT' },
  { id: 16, from: 'CÀ PHÊ CÔ BA', door: [32, 14.7], name: 'CÀ PHÊ GÓC PHỐ', subtitle: 'CÀ PHÊ • SINH TỐ' },
  { id: 24, from: 'CÀ PHÊ CÔ BA', door: [-18, -65.7], name: 'CÀ PHÊ MUỐI', subtitle: 'CÀ PHÊ MUỐI • CA CAO' },
  { id: 32, from: 'CÀ PHÊ CÔ BA', door: [-41, 67.7], name: 'CÀ PHÊ ĐEN ĐÁ', subtitle: 'CÀ PHÊ RANG XAY' },
  { id: 40, from: 'CÀ PHÊ CÔ BA', door: [-76, -44.8], name: 'CÀ PHÊ SÂN VƯỜN', subtitle: 'CÀ PHÊ • TRÀ SEN' },
  { id: 48, from: 'CÀ PHÊ CÔ BA', door: [-66.5, 44.8], name: 'CÀ PHÊ NHẠC XƯA', subtitle: 'CÀ PHÊ • NHẠC TRỊNH' },
  { id: 4, from: 'PHỞ CÔ BA', door: [-20, -11.7], name: 'PHỞ CHÚ BẢY' },
  { id: 12, from: 'PHỞ CÔ BA', door: [-41, 14.7], name: 'PHỞ BÀ HAI' },
  { id: 20, from: 'PHỞ CÔ BA', door: [-76, -65.7], name: 'PHỞ GIA TRUYỀN' },
  { id: 28, from: 'PHỞ CÔ BA', door: [67, -65.7], name: 'PHỞ ĐUÔI BÒ' },
  { id: 36, from: 'PHỞ CÔ BA', door: [32, 67.7], name: 'PHỞ GÀ TA' },
  { id: 44, from: 'PHỞ CÔ BA', door: [-18, -44.8], name: 'PHỞ BÒ VIÊN' },
  { id: 5, from: 'XE MÁY', door: [20, -11.7], name: 'CỬA HÀNG XE MÁY', subtitle: 'XE MỚI • SỬA CHỮA • BẢO HÀNH' },
  { id: 21, from: 'XE MÁY', door: [-66.5, -65.7], name: 'SỬA XE TƯ', subtitle: 'SỬA XE • THAY NHỚT • VÁ VỎ' },
  { id: 29, from: 'XE MÁY', door: [77, -65.7], name: 'VÁ VỎ XE', subtitle: 'VÁ VỎ • BƠM BÁNH' },
  { id: 37, from: 'XE MÁY', door: [41.5, 67.7], name: 'RỬA XE', subtitle: 'RỬA XE MÁY • THAY NHỚT' },
  { id: 11, from: 'TIỆM HOA', door: [-66.5, 14.7], name: 'HOA TƯƠI LAN' },
  { id: 19, from: 'TIỆM HOA', door: [77, 14.7], name: 'HOA CƯỚI NGỌC' },
  { id: 27, from: 'TIỆM HOA', door: [41.5, -65.7], name: 'HOA LỤA THU' },
  { id: 35, from: 'TIỆM HOA', door: [20, 67.7], name: 'HOA KIỂNG HẰNG' },
  { id: 1, from: 'BÁNH MÌ', door: [-66.42, -11.7], name: 'BÁNH MÌ CHẢ CÁ' },
  { id: 9, from: 'BÁNH MÌ', door: [77, -11.7], name: 'BÁNH MÌ XÍU MẠI' },
  { id: 17, from: 'BÁNH MÌ', door: [41.5, 14.7], name: 'BÁNH MÌ HEO QUAY' },
  { id: 25, from: 'BÁNH MÌ', door: [20, -65.7], name: 'BÁNH MÌ ỐP LA' },
  { id: 33, from: 'BÁNH MÌ', door: [-30, 67.7], name: 'BÁNH MÌ PHÁ LẤU' },
  { id: 49, from: 'BÁNH MÌ', door: [-41, 44.8], name: 'BÁNH MÌ BÌ' },
  { id: 116, from: 'CHÈ BÀ TƯ', door: [-119.7, 92.33], name: 'CHÈ BÀ SÁU' },
  { id: 70, from: 'CHÈ BÀ TƯ', door: [81.31, -96.3], name: 'CHÈ BƯỞI' },
  { id: 119, from: 'NHÀ SỐ 46', door: [-69.61, 119.7], name: 'VIỆC LÀM ÁNH DƯƠNG', subtitle: 'LƯƠNG CAO • BAO ĂN Ở • KHÔNG CẦN KINH NGHIỆM' },
  { id: 159, from: 'NGÂN HÀNG PHƯƠNG NAM', door: [282.7, -27], name: 'NGÂN HÀNG KIM THÀNH' },
];

type Place = { x: number; z: number; y?: number; yaw?: number; r?: number; level?: string };
/** The runner's places table: every site as 'id' and every spot as 'id.spot' (PlaceDef-compatible). */
export function sitePlaces(): Record<string, Place> {
  const out: Record<string, Place> = {};
  const put = (key: string, p: Place) => {
    const q: Place = { x: p.x, z: p.z };
    if (p.y !== undefined) q.y = p.y;
    if (p.yaw !== undefined) q.yaw = p.yaw;
    if (p.r !== undefined) q.r = p.r;
    if (p.level !== undefined) q.level = p.level;
    out[key] = q;
  };
  for (const [id, s] of Object.entries(SITES)) {
    put(id, s);
    for (const [k, p] of Object.entries(s.spots ?? {})) put(`${id}.${k}`, p);
  }
  return out;
}
/** Named exclusion areas (WorldPolicy.exclusions) from the sites that have a footprint. */
export function siteAreas(): Record<string, [number, number, number, number]> {
  const out: Record<string, [number, number, number, number]> = {};
  for (const [id, s] of Object.entries(SITES)) if (s.area) out[id] = s.area;
  return out;
}
