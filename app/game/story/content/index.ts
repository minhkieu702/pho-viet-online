import type { CampaignIndex, Catalog, ChapterMeta, ChapterModule } from '../types.ts';
import { COMMON } from '../text/vi/common.ts';

/**
 * Campaign index and lazy chapter loading. The index is a tiny static table (titles, order, minutes, lunar
 * dates) that the menu and chapter select can read without loading any script; each chapter's missions,
 * evidence, cast, boards and texts live in their own module (content/chNN.ts exporting `chapter`), loaded
 * with a dynamic import the first time it is needed so free roam and the first load pay nothing.
 * A content batch registers its chapter by adding one line to LOADERS when the file lands.
 */

const ch = (n: number, title: string, sub: string, lunar: [number, number], summary: string, missions: [string, string, number][]): ChapterMeta => ({
  n, id: `ch${String(n).padStart(2, '0')}`, title, summary, lunar: { month: lunar[0], day: lunar[1] },
  card: { text: `CHƯƠNG ${n}`, sub }, missions: missions.map(([id, t, minutes]) => ({ id, title: t, minutes })),
});

export const CAMPAIGN: CampaignIndex = {
  id: 'sen-trong-bun',
  title: 'Phố Việt: Sen Trong Bùn',
  /** {@app}, {@bank}…: the brand constants every chapter inserts. */
  text: COMMON,
  chapters: [
    ch(1, 'Lên Phố', 'LÊN PHỐ', [7, 23], 'Tín rời cù lao Tân Thuận lên phố chạy giao hàng, trả món nợ đè lên nhà mình.', [
      ['c1-m1', 'Chuyến xe đò sáng sớm', 6], ['c1-m2', 'Đơn hàng đầu tiên', 6], ['c1-m3', 'Bốn mươi triệu', 6]]),
    ch(2, 'Đơn Hàng Lúc Nửa Đêm', 'ĐƠN HÀNG LÚC NỬA ĐÊM', [8, 1], 'Một đơn hàng không tên, một tờ hóa đơn viết vội: "CỨU TỤI EM".', [
      ['c2-m1', 'Phòng số 7', 6], ['c2-m2', 'Bám đuôi lúc ba giờ', 7], ['c2-m3', 'Cái kho bên sông', 8]]),
    ch(3, 'Không Ai Tin', 'KHÔNG AI TIN', [8, 2], 'Trình báo xong thì cái kho bị dọn sạch trong một đêm. Chỉ hai người chịu tin Tín.', [
      ['c3-m1', 'Trình báo', 6], ['c3-m2', 'Kho trống', 5], ['c3-m3', 'Ông thầy sửa xe', 8]]),
    ch(4, 'Người Tuyển Dụng', 'NGƯỜI TUYỂN DỤNG', [8, 4], 'Trong cuốn sổ của văn phòng việc làm có tên em gái Tín.', [
      ['c4-m1', 'Cơm trưa cho văn phòng Ánh Dương', 7], ['c4-m2', 'Tấm ảnh trong sổ', 7], ['c4-m3', 'Mưa trên gác xép', 5]]),
    ch(5, 'Bóng Trong Đèn Neon', 'BÓNG TRONG ĐÈN NEON', [8, 6], 'Lần theo những đơn hàng trống vào phố đèn, nơi thằng bạn thân đang nợ ngập đầu.', [
      ['c5-m1', 'Đơn hàng không tên', 7], ['c5-m2', 'Spa nửa đêm', 7], ['c5-m3', 'Vũ trường Moonlight', 7]]),
    ch(6, 'Kẻ Phản Bội', 'KẺ PHẢN BỘI', [8, 8], 'Một lời hẹn ở chùa, một đêm cháy tiệm, và người thầy không về nữa.', [
      ['c6-m1', 'Cuộc hẹn ở chùa', 5], ['c6-m2', 'Lửa ở tiệm xe', 9], ['c6-m3', 'Bến sông lúc rạng đông', 6]]),
    ch(7, 'Sà Lan Số 07', 'SÀ LAN SỐ 07', [8, 10], 'Đêm mùng mười, Tín bơi ra chiếc sà lan chở người.', [
      ['c7-m1', 'Trinh sát trên sông', 5], ['c7-m2', 'Đêm mùng mười', 9], ['c7-m3', 'Ca nô đuổi bắt', 7]]),
    ch(8, 'Người Đàn Bà Từ Thiện', 'NGƯỜI ĐÀN BÀ TỪ THIỆN', [8, 11], 'Gương mặt thật đằng sau những tấm băng rôn từ thiện.', [
      ['c8-m1', 'Người tuyển dụng sa lưới', 7], ['c8-m2', 'Giờ thăm bệnh', 5], ['c8-m3', 'Dạ tiệc ở Nhà Hát', 7], ['c8-m4', 'Két sắt tầng 20', 8]]),
    ch(9, 'Truy Nã', 'TRUY NÃ', [8, 13], 'Cả thành phố đi tìm một cậu shipper.', [
      ['c9-m1', 'Cả thành phố tìm tôi', 6], ['c9-m2', 'Bia hơi và đoạn ghi âm', 7], ['c9-m3', 'Quang trở về', 7]]),
    ch(10, 'Đêm Rằm', 'ĐÊM RẰM', [8, 15], 'Phố đèn mất điện giữa đêm Rằm, và cánh cửa xuống tầng hầm B2.', [
      ['c10-m1', 'Rước đèn và mất điện', 6], ['c10-m2', 'Tầng hầm B2', 9], ['c10-m3', 'Cường Sẹo', 7], ['c10-m4', 'Còn hai đơn', 3]]),
    ch(11, 'Giao Tận Tay', 'GIAO TẬN TAY', [8, 15], 'Đơn hàng cuối cùng phải giao tận tay.', [
      ['c11-m1', 'Xe đông lạnh', 7], ['c11-m2', 'Tầng 68', 6], ['c11-m3', 'Sân đỗ trực thăng', 7], ['c11-m4', 'Mùa sen', 4]]),
  ],
};
export const MISSION_IDS: readonly string[] = CAMPAIGN.chapters.flatMap((c) => c.missions.map((m) => m.id));

type Loader = () => Promise<{ chapter: ChapterModule } | ChapterModule>;
/** One line per built chapter, e.g. `1: () => import('./ch01.ts'),`. */
const LOADERS: Record<number, Loader> = {
  1: () => import('./ch01.ts'),
  2: () => import('./ch02.ts'),
};
const cache = new Map<number, Promise<ChapterModule | null>>();

/** Registers (or replaces) a chapter loader: content batches, tests and dev tools. */
export function registerChapter(n: number, load: Loader) {
  LOADERS[n] = load;
  cache.delete(n);
}
export const builtChapters = () => Object.keys(LOADERS).map(Number).sort((a, b) => a - b);
/** The chapter module, loaded once; null when the chapter is not built yet. Import errors propagate. */
export function loadChapter(n: number): Promise<ChapterModule | null> {
  let p = cache.get(n);
  if (!p) {
    const load = LOADERS[n];
    p = load ? load().then((m) => ('missions' in m ? m : m.chapter)) : Promise.resolve(null);
    p.catch(() => cache.delete(n));
    cache.set(n, p);
  }
  return p;
}
/**
 * A catalog with the given chapters (default: every built one) merged in. The runner module is imported
 * lazily too, so importing this index stays cheap for the menu.
 */
export async function loadCatalog(chapters: number[] = builtChapters(), into?: Catalog): Promise<Catalog> {
  const { buildCatalog, addModule } = await import('../runner.ts');
  const cat = into ?? buildCatalog(CAMPAIGN);
  for (const n of chapters) { const m = await loadChapter(n); if (m) addModule(cat, m); }
  return cat;
}
