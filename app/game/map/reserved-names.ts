/**
 * Sign names the story keeps unique on the whole map (app/game/story/sites.ts and its RENAMES): the district
 * generator never prints them, and no generated shop is kept by "CÔ BA" (only Cô Ba's café in An Hòa is).
 * scripts/story-sites.test.mjs fails when a story site names a sign that is missing here.
 */
export const RESERVED_SIGNS: ReadonlySet<string> = new Set([
  'BÁNH MÌ PHÚC', 'CHÈ BÀ SÁU', 'CHÈ BƯỞI', 'CÀ PHÊ CÔ BA', 'CÀ PHÊ VỢT', 'NGÂN HÀNG KIM THÀNH', 'NHÀ SÁCH HÙNG',
  'NHÀ THUỐC HẠNH', 'PHỞ CHỊ BẢY', 'QUÁN CƠM DÌ SÁU', 'SỬA XE TƯ', 'TIỆM HOA CÔ THU', 'TẠP HÓA NGỌC', 'VIỆC LÀM ÁNH DƯƠNG',
  'BIA HƠI HÀ NỘI', 'KARAOKE ÁNH SAO', 'NHÀ NGHỈ HOA HỒNG', 'VŨ TRƯỜNG MOONLIGHT', 'SPA & MASSAGE', 'CHÙA AN HÒA',
  'BỆNH VIỆN AN HÒA', 'CÔNG AN PHƯỜNG', 'TRƯỜNG TIỂU HỌC AN HÒA', 'NHÀ HÁT THÀNH PHỐ', 'TRUNG TÂM THƯƠNG MẠI',
  'THÁP PHƯƠNG NAM', 'TÒA THÁP TÀI CHÍNH', 'CHUNG CƯ PHÚ MỸ', 'CHUNG CƯ SÔNG XANH', 'VĂN PHÒNG',
]);
export const reservedSign = (name: string) => RESERVED_SIGNS.has(name) || name.includes('CÔ BA');
