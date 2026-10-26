/**
 * Campaign-wide text constants every chapter inserts with {@key} (story-decisions.md 14: the fictional brands, so a
 * rename is one line here). They load with the campaign index (content/index.ts CAMPAIGN.text), so a catalog
 * holding any subset of chapters resolves them.
 * - app / appSign / code: the delivery app (wordmark, shop-sign spelling, order-code prefix '{@code}-0413'). "ĐơnƠi"
 *   ("hey, an order!") replaces GiaoLẹ, which read as Giao Hàng Nhanh ("lẹ" is Southern for "nhanh").
 * - ring / ringUpper: the ring's name. Never print it with a company-type word (công ty, tập đoàn, tín dụng,
 *   logistics, group): "Sen Vàng Logistics", "Tập đoàn Sen Vàng" and "Sen Vàng Việt Nam" are registered companies.
 *   The golden-lotus logo carries the motif on props (the van pass reads "SV · XE ƯU TIÊN").
 * Before ship, check the final names on the registries (masothue, chogia) and the app stores.
 */
export const COMMON: Record<string, string> = {
  app: 'ĐơnƠi',
  appSign: 'ĐƠN ƠI',
  code: 'DO',
  ring: 'Sen Vàng',
  ringUpper: 'SEN VÀNG',
  bank: 'NGÂN HÀNG KIM THÀNH',
  saved: 'Đã lưu',
  fiction: 'Mọi nhân vật, công ty, tổ chức trong truyện đều là hư cấu.',
};
