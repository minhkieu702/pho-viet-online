/**
 * The hand-authored district layout format (critique step 13, design 2's generator, design 1's districts): what a
 * map author writes for one district, and the defaults the generator (gen/*, build-district.ts) applies. A layout
 * is pure data: arterial polylines with their class and cross-section, junction hints, waterways with typed banks,
 * water-only bridge decks, landmark and story stamps, fixtures (port gear) and fences, zoning by block, street
 * business mixes, curb-use rules and the portal nodes (today's fence ends) where the district joins the legacy grid. Everything else (blocks, hẻm, lots, buildings, dressing) is generated from
 * hash-keyed streams, so the same layout always gives the same district.
 * Coordinates are game metres: x east, z south (the river is north). Polylines and polygons are flat x,z pairs.
 */
import type { DistrictId } from '../districts.ts';
import type { Control, RoadClass } from '../roads.ts';
import type { BuildingKind, TreeSpecies } from '../../city.ts';

/**
 * What a block is used for. tube: nhà ống rows (the default); market: a chợ hall with stalls and shop rows; warehouse:
 * kho and port sheds; apartment: chung cư cũ slabs around courtyards; villa: biệt thự behind garden walls; pagoda,
 * church: a walled compound in a tube-house block; park: the whole block is green; school: a school and its yard;
 * night: a food and drink street (quán nhậu, ốc, bia), busy in the evening.
 */
export type ZoneKind = 'tube' | 'market' | 'warehouse' | 'apartment' | 'villa' | 'pagoda' | 'church' | 'park' | 'school' | 'night';
/**
 * A bank: kè (concrete wall with a railing and a narrow walk), promenade (wide public walk), mud (bùn: stilt houses
 * reach out over the water), wharf (quay apron for ships and cranes).
 */
export type BankKind = 'ke' | 'promenade' | 'mud' | 'wharf';
/** What a road's curb is used for on one side: motos on the sidewalk band, car bays, night loading, buses, nothing. */
export type CurbUse = 'moto' | 'car' | 'loading' | 'bus' | 'none';

/**
 * A street the author draws. `pts` runs from one end to the other (x,z pairs); an end on a portal joins the legacy
 * grid there; where streets cross or one ends on another, the generator makes a node. Class R1 is today's road
 * (14 m asphalt, a boulevard with `lanes: 2` and a wider `half`), R2 a street, hem an alley (motos and people only).
 */
export type ArterialSpec = {
  id: string; name: string; cls: RoadClass; pts: number[];
  /** Asphalt half-width and sidewalk width (curb to frontage); defaults per class (roads.ts ROAD_CLASSES). */
  half?: number; sidewalk?: number;
  /** Car lanes per direction (R1, R2); the moto lane is extra. */
  lanes?: number;
  /** 1: traffic only in pts order, -1: only against it. */
  oneWay?: 0 | 1 | -1;
  speed?: number;
  /** Curb use on the right and left of pts order (default moto both sides; car bays need half >= CURB.carBayMinHalf). */
  curb?: [CurbUse, CurbUse];
  /** A bus route runs here: shelters about every BUS_SPACING metres, alternating sides. */
  bus?: boolean;
  /** AI traffic may use it (default true). */
  traffic?: boolean;
  /** Hours the road is closed to vehicles (walking street, night market), e.g. [19, 2]. */
  closedHours?: [number, number];
  /** Tree species along it (default by class and district style). */
  trees?: TreeSpecies;
  /** The businesses its frontage lots open (gen/buildings.ts STREET_MIXES), e.g. 'oc' for an ốc and seafood night street. */
  mix?: StreetMix;
};
/** A street's business mix: 'oc', the ốc and seafood night street (Vĩnh Khánh). */
export type StreetMix = 'oc';

/** Control at the node nearest (x, z) (within 4 m). 'roundabout' is kept as data until roads.ts can expand it. */
export type JunctionHint = { x: number; z: number; control: Control | 'roundabout'; radius?: number };

/** One stretch of a waterway's outline with its own bank kind: polygon edges from..to (indices, inclusive). */
export type BankSpan = { from: number; to: number; kind: BankKind };
export type WaterwaySpec = {
  id: string; name: string; kind: 'river' | 'canal' | 'basin';
  /** Outline, x,z pairs, either winding. */
  poly: number[];
  /** Default bank for every edge; `banks` overrides spans of edges. */
  bank: BankKind; banks?: BankSpan[];
  /** Water surface (default WATER_LEVEL). */
  level?: number;
};

/**
 * A deck carrying arterial `road` over waterway `over` (decks never cross roads: those need the layered ground of
 * step 20). `yHint` is the deck height at mid-span above street level; it ramps back down over `ramp` metres past
 * each bank (default yHint / 0.067: design 1's 6.7 % ramps).
 */
export type BridgeSpec = { id: string; name: string; road: string; over: string; yHint: number; ramp?: number };

export type StampKind = 'landmark' | 'story' | 'market' | 'pagoda' | 'church' | 'warehouse' | 'apartment' | 'park' | 'school' | 'police' | 'hospital';
/** Another way into a stamp's building besides its door: a hatch or loading dock in a wall, a ladder to the roof (facing out along yaw). */
export type StampWay = { kind: 'door' | 'hatch' | 'dock' | 'ladder'; x: number; z: number; yaw: number };
/**
 * A reserved footprint the generator builds as authored: lots that touch it (or its `yard` apron) are skipped.
 * The footprint is a box `w` wide (along the front) and `d` deep around (x, z), facing `yaw` (the way its door
 * looks: 0 is +z, PI/2 is +x). Story stamps keep an `anchor` id missions refer to.
 */
export type StampSpec = {
  id: string; kind: StampKind; name: string; subtitle?: string;
  x: number; z: number; w: number; d: number; yaw: number;
  h?: number; storeys?: number; building?: BuildingKind; color?: string;
  /** Where its door is (just outside a wall), when not the middle of the front wall (a warehouse's side door). */
  entrance?: { x: number; z: number };
  /** Clear apron around the footprint (yards, aprons, a courtyard in front). */
  yard?: number;
  /** Mission anchor id (story stamps), e.g. 'kho7'. */
  anchor?: string;
  /** Other ways in (kept clear: nothing stands within 1.2 m in front of them). */
  ways?: StampWay[];
};

/** Port gear and yard stock a layout places as authored. */
export type FixtureKind = 'container' | 'reefer' | 'crate' | 'pallet' | 'drums' | 'bollard' | 'booth' | 'crane-leg';
/**
 * A fixture: a box `w` along its right and `d` along its forward (yaw as stamps), `h` tall (containers 2.6 m a tier).
 * The generator keeps lots and dressing off it and makes it a collider; one that does not fit is a layout error.
 */
export type FixtureSpec = { id: string; kind: FixtureKind; x: number; z: number; w: number; d: number; yaw: number; h: number };
/**
 * A fence or wall along `pts`, `h` tall, laid in panels with posts between. It opens only at its `gates` (`w` wide,
 * centred on the point of the line nearest (x, z)): a panel that meets anything else (a building, a door's way out,
 * a walking line, a road) is a layout error, so a perimeter is closed wherever the layout says.
 */
export type FenceSpec = { id: string; kind: 'fence' | 'wall'; pts: number[]; h: number; gates?: { name: string; x: number; z: number; w: number }[] };

/** Zoning: blocks whose centre lies inside `poly` (or the block holding point `at`) get `zone`; first match wins. */
export type ZoningSpec = { zone: ZoneKind; poly?: number[]; at?: [number, number]; name?: string };

/** Where the district joins the legacy grid: a legacy node (today's fence ends at x 352 or z 137.5) and the arterial ending there. */
export type PortalSpec = { id: string; x: number; z: number; road: string };

/** Curb-use rules (plan decision 10). */
export type CurbRules = {
  /** The moto parking band, metres in from the frontage line: [2.3, 0.6] is 10.2–11.9 m from the centre of today's R1 roads. */
  motoBand: [number, number];
  /** Car bays only where the asphalt half-width is at least this. */
  carBayMinHalf: number;
  bayDepth: number;
  /** No bays or curb stalls this close to a node (design 1). */
  junctionClear: number;
};
export const CURB: CurbRules = { motoBand: [2.3, 0.6], carBayMinHalf: 9, bayDepth: 2.2, junctionClear: 20 };

/** Lot shapes per zone: frontage widths and depths, storeys, and the hẻm network inside its blocks. */
export type ZoneStyle = {
  width: [number, number]; depth: [number, number]; storeys: [number, number];
  /** Corner lots (wider, shops). */
  corner: [number, number];
  /** Lots along a hẻm: width and depth. */
  hemWidth: [number, number]; hemDepth: [number, number];
  /** Carve a hẻm network into deep blocks (spine, connectors every 40–80 m, through-hẻm in long blocks). */
  hem: boolean;
  /** Spine half-width (3.5 m alleys; chung cư courtyards get a 5.6 m car lane). */
  spineHalf: number;
  /** Building front set back from the lot front (villa gardens, warehouse aprons). */
  setback: number;
};
export const ZONE_STYLES: Record<ZoneKind, ZoneStyle> = {
  // Design 1's plot table: nhà ống 4–5.5 × 12–18 m (corner shops wider).
  tube: { width: [4, 6], depth: [12, 18], storeys: [2, 5], corner: [6.5, 9], hemWidth: [3.6, 5.2], hemDepth: [8, 13], hem: true, spineHalf: 1.75, setback: 0 },
  night: { width: [4, 6.5], depth: [12, 16], storeys: [2, 4], corner: [7, 9.5], hemWidth: [3.6, 5], hemDepth: [8, 12], hem: true, spineHalf: 1.75, setback: 0 },
  market: { width: [4, 5.5], depth: [12, 18], storeys: [2, 4], corner: [6.5, 9], hemWidth: [3.6, 5], hemDepth: [8, 12], hem: true, spineHalf: 1.75, setback: 0 },
  pagoda: { width: [4, 6], depth: [15, 20], storeys: [2, 4], corner: [6.5, 9], hemWidth: [3.6, 5], hemDepth: [8, 12], hem: true, spineHalf: 1.75, setback: 0 },
  church: { width: [4, 6], depth: [15, 20], storeys: [2, 4], corner: [6.5, 9], hemWidth: [3.6, 5], hemDepth: [8, 12], hem: true, spineHalf: 1.75, setback: 0 },
  school: { width: [4, 6], depth: [15, 20], storeys: [2, 4], corner: [6.5, 9], hemWidth: [3.6, 5], hemDepth: [8, 12], hem: true, spineHalf: 1.75, setback: 0 },
  warehouse: { width: [22, 36], depth: [18, 28], storeys: [1, 1], corner: [22, 36], hemWidth: [20, 30], hemDepth: [16, 22], hem: false, spineHalf: 2.8, setback: 3 },
  apartment: { width: [30, 44], depth: [12, 13], storeys: [4, 5], corner: [30, 44], hemWidth: [30, 44], hemDepth: [12, 13], hem: true, spineHalf: 2.8, setback: 2 },
  villa: { width: [14, 20], depth: [20, 26], storeys: [2, 3], corner: [16, 22], hemWidth: [12, 16], hemDepth: [16, 20], hem: false, spineHalf: 2.8, setback: 5 },
  park: { width: [0, 0], depth: [0, 0], storeys: [0, 0], corner: [0, 0], hemWidth: [0, 0], hemDepth: [0, 0], hem: false, spineHalf: 0, setback: 0 },
};

/** Water-side setbacks (bank to the first building or walk edge), metres. */
export const BANK_SETBACK: Record<BankKind, number> = { ke: 3, promenade: 8, mud: 0.5, wharf: 10 };
/** Shelters along a bus route, metres apart (design 1: stops about every 250 m). */
export const BUS_SPACING = 250;

/** Per-district look: palette for tube houses, street trees by class, how many shops face the main streets. */
export type DistrictStyle = {
  palette: string[];
  trees: Record<RoadClass, TreeSpecies | null>;
  /** Share of street-facing tube lots that open a shop, food stall or café on R1 / R2 / hẻm frontages. */
  business: Record<RoadClass, number>;
};
export const DEFAULT_STYLE: DistrictStyle = {
  palette: ['#e9cf8f', '#f0dcae', '#cfe0c8', '#e3b9a3', '#c9d7e3', '#efe6d2', '#d9a6a0', '#bcd0b5', '#f2c47a', '#d7c4dd', '#a9c9c2', '#e6c3a0', '#f3e3a0', '#b9d3e8'],
  trees: { R1: 'tall', R2: 'round', hem: null },
  business: { R1: 0.62, R2: 0.45, hem: 0.12 },
};

export type DistrictLayout = {
  /** District from districts.ts (D1..D10). */
  id: DistrictId;
  /** Stable layout key: every rng stream of this layout starts with it (e.g. 'quan-4'). */
  key: string;
  name: string;
  /** Land the layout builds on (x,z pairs); faces outside it are left alone. */
  bounds: number[];
  arterials: ArterialSpec[];
  junctions?: JunctionHint[];
  waterways?: WaterwaySpec[];
  bridges?: BridgeSpec[];
  stamps?: StampSpec[];
  fixtures?: FixtureSpec[];
  fences?: FenceSpec[];
  zoning?: ZoningSpec[];
  /** Zone of blocks no zoning entry matches (default 'tube'). */
  zone?: ZoneKind;
  portals: PortalSpec[];
  curb?: Partial<CurbRules>;
  style?: Partial<DistrictStyle>;
};

/** A minimal structural check that a module export is a layout (the validator scans layout/*.ts with it). */
export const isLayout = (v: unknown): v is DistrictLayout =>
  !!v && typeof v === 'object' && typeof (v as DistrictLayout).key === 'string' && Array.isArray((v as DistrictLayout).arterials) && Array.isArray((v as DistrictLayout).bounds);
