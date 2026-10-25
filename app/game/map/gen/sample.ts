/**
 * A synthetic district for the validator and the preview: the layout format's worked example, never built into the
 * live map. A canal-side Khánh Hội-like quarter east of today's map (it joins the legacy fence ends at x 352): a
 * kè canal with four road bridges, a wharf with warehouses on the river, a boulevard with car bays, a diagonal
 * street, a night food street, a market, a pagoda, a church, a school, chung cư slabs, a park and a muddy creek with
 * stilt houses and five small bridges. Street names are generic Sài Gòn names, not a survey.
 */
import type { DistrictLayout } from '../layout/types.ts';

const S = 345;
export const SAMPLE_LAYOUT: DistrictLayout = {
  id: 'D5', key: 'sample', name: 'XÓM KÊNH (MẪU)',
  bounds: [352, -175, 720, -175, 720, S, 352, S],
  waterways: [
    { id: 'song', name: 'SÔNG SÀI GÒN', kind: 'river', poly: [340, -240, 740, -240, 740, -175, 340, -175], bank: 'wharf' },
    { id: 'kenh', name: 'KÊNH XÓM KÊNH', kind: 'canal', poly: [372, -190, 402, -190, 402, S + 15, 372, S + 15], bank: 'ke' },
    { id: 'rach', name: 'RẠCH BẦN', kind: 'canal', poly: [395, 262, 735, 262, 735, 280, 395, 280], bank: 'mud' },
  ],
  arterials: [
    { id: 'ben-cang', name: 'ĐƯỜNG BẾN CẢNG', cls: 'R1', pts: [352, -108, 720, -108] },
    { id: 'khanh-hoi', name: 'ĐƯỜNG KHÁNH HỘI', cls: 'R1', pts: [352, -54, 700, -54], bus: true },
    { id: 'hoang-dieu-cau', name: 'ĐẠI LỘ HOÀNG DIỆU', cls: 'R1', pts: [352, 54, 420, 54] },
    { id: 'hoang-dieu', name: 'ĐẠI LỘ HOÀNG DIỆU', cls: 'R1', pts: [420, 54, 700, 54], half: 11, sidewalk: 6, lanes: 2, curb: ['car', 'moto'], trees: 'tall' },
    { id: 'ton-dan', name: 'ĐƯỜNG TÔN ĐẢN', cls: 'R1', pts: [352, 108, 420, 108, 700, 200] },
    { id: 'van-don', name: 'ĐƯỜNG BẾN VÂN ĐỒN', cls: 'R1', pts: [420, -108, 420, S], bus: true },
    { id: 'vinh-hoi', name: 'ĐƯỜNG VĨNH HỘI', cls: 'R2', pts: [420, 0, 700, 0], sidewalk: 4.5, closedHours: [19, 2] },
    { id: 'nguyen-khoai', name: 'ĐƯỜNG NGUYỄN KHOÁI', cls: 'R2', pts: [490, -108, 490, 54], sidewalk: 4.5 },
    { id: 'xom-chieu', name: 'ĐƯỜNG XÓM CHIẾU', cls: 'R2', pts: [570, -108, 570, S], sidewalk: 4.5 },
    { id: 'le-van-linh', name: 'ĐƯỜNG LÊ VĂN LINH', cls: 'R2', pts: [640, -54, 640, 54], sidewalk: 4.5 },
    { id: 'nguyen-than-hien', name: 'ĐƯỜNG NGUYỄN THẦN HIẾN', cls: 'R2', pts: [495, 230, 495, S], sidewalk: 4.5 },
    { id: 'ton-that-thuyet', name: 'ĐƯỜNG TÔN THẤT THUYẾT', cls: 'R2', pts: [635, 230, 635, S], sidewalk: 4.5 },
    { id: 'cang-moi', name: 'ĐƯỜNG CẢNG MỚI', cls: 'R2', pts: [700, -108, 700, S], sidewalk: 4.5 },
    { id: 'doan-van-bo', name: 'ĐƯỜNG ĐOÀN VĂN BƠ', cls: 'R2', pts: [420, 230, 700, 230], sidewalk: 4.5 },
    { id: 'ben-rach', name: 'ĐƯỜNG BẾN RẠCH', cls: 'R2', pts: [420, 310, 700, 310], sidewalk: 4.5, oneWay: 1 },
    { id: 'hem-42', name: 'HẺM 42', cls: 'hem', pts: [530, 0, 530, 54], half: 2 },
    { id: 'hem-cut', name: 'HẺM 96', cls: 'hem', pts: [490, -81, 468, -81], half: 1.5 },
  ],
  junctions: [{ x: 420, z: 0, control: 'signal' }, { x: 420, z: 230, control: 'signal' }, { x: 570, z: 54, control: 'roundabout', radius: 14 }],
  bridges: [
    { id: 'cau-ben-cang', name: 'CẦU BẾN CẢNG', road: 'ben-cang', over: 'kenh', yHint: 1, ramp: 8 },
    { id: 'cau-khanh-hoi', name: 'CẦU KHÁNH HỘI', road: 'khanh-hoi', over: 'kenh', yHint: 1, ramp: 8 },
    { id: 'cau-calmette', name: 'CẦU CALMETTE', road: 'hoang-dieu-cau', over: 'kenh', yHint: 1, ramp: 8 },
    { id: 'cau-ong-lanh', name: 'CẦU ÔNG LÃNH', road: 'ton-dan', over: 'kenh', yHint: 1, ramp: 8 },
    { id: 'cau-rach-1', name: 'CẦU RẠCH BẦN 1', road: 'van-don', over: 'rach', yHint: 0.8, ramp: 7 },
    { id: 'cau-rach-2', name: 'CẦU RẠCH BẦN 2', road: 'nguyen-than-hien', over: 'rach', yHint: 0.8, ramp: 7 },
    { id: 'cau-rach-3', name: 'CẦU RẠCH BẦN 3', road: 'xom-chieu', over: 'rach', yHint: 0.8, ramp: 7 },
    { id: 'cau-rach-4', name: 'CẦU RẠCH BẦN 4', road: 'ton-that-thuyet', over: 'rach', yHint: 0.8, ramp: 7 },
    { id: 'cau-rach-5', name: 'CẦU RẠCH BẦN 5', road: 'cang-moi', over: 'rach', yHint: 0.8, ramp: 7 },
  ],
  stamps: [
    { id: 'kho9', kind: 'story', name: 'KHO 9', subtitle: 'KHO RIÊNG • KHÔNG PHẬN SỰ MIỄN VÀO', x: 655, z: -142, w: 34, d: 20, yaw: 0, h: 11, storeys: 1, building: 'office', color: '#9aa3a6', yard: 2, anchor: 'kho9', entrance: { x: 646, z: -131.2 } },
    { id: 'cong-an', kind: 'police', name: 'CÔNG AN PHƯỜNG', subtitle: 'PHƯỜNG XÓM KÊNH • TRỰC BAN 24/7', x: 452, z: -81, w: 22, d: 16, yaw: -Math.PI / 2, h: 11, storeys: 3, color: '#e9c46a', yard: 1 },
  ],
  zoning: [
    { zone: 'warehouse', poly: [402, -180, 720, -180, 720, -109, 402, -109] },
    { zone: 'park', poly: [352, -175, 372, -175, 372, S, 352, S], name: 'CÔNG VIÊN BỜ KÊNH' },
    { zone: 'market', at: [530, -27], name: 'CHỢ XÓM KÊNH' },
    { zone: 'night', at: [605, -27] },
    { zone: 'night', at: [605, 27] },
    { zone: 'park', at: [670, -27], name: 'CÔNG VIÊN KHÁNH HỘI' },
    { zone: 'pagoda', at: [455, 27], name: 'CHÙA PHÁP HOA' },
    { zone: 'church', at: [635, -81], name: 'NHÀ THỜ XÓM KÊNH' },
    { zone: 'school', at: [670, 27], name: 'TRƯỜNG TIỂU HỌC KHÁNH HỘI' },
    { zone: 'apartment', at: [635, 110], name: 'XÓM KÊNH' },
  ],
  portals: [
    { id: 'p-108', x: 352, z: -108, road: 'ben-cang' },
    { id: 'p-54', x: 352, z: -54, road: 'khanh-hoi' },
    { id: 'p54', x: 352, z: 54, road: 'hoang-dieu-cau' },
    { id: 'p108', x: 352, z: 108, road: 'ton-dan' },
  ],
};
