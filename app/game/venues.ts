import type { VenueKind } from './map/consts';
import type { Service } from './services';

/**
 * What the nightlife strip sells. Everything happens off-screen: paying fades the screen out and back,
 * then the effect applies (services.ts applyEffect: health, a tipsy spell, points, time passing, lying low).
 * Prices in thousands of đồng.
 */
export type { Effect, Service, ServiceEffect } from './services';
export type VenueDef = { title: string; intro: string; services: Service[] };

/** Venues you walk into (the beer garden is a counter with stools out front: counters.ts 'biahoi'). */
export type VenueRoom = Exclude<VenueKind, 'beer'>;

export const VENUE_SERVICES: Record<VenueRoom, VenueDef> = {
  bar: {
    title: 'Gọi đồ uống',
    intro: 'Quầy bar ánh đèn neon, nhạc nhẹ. Uống nhiều sẽ say và đi lảo đảo một lúc.',
    services: [
      { id: 'beer', name: 'Bia tươi', price: 20, description: 'Một ly bia mát lạnh · +10 máu, hơi say.', effect: { heal: 10, drunk: 35 } },
      { id: 'cocktail', name: 'Cocktail Neon', price: 60, description: 'Pha chế đặc biệt của quán · +20 máu, say vừa.', effect: { heal: 20, drunk: 70 } },
      { id: 'whisky', name: 'Rượu mạnh', price: 120, description: 'Một chai cho cả bàn · +35 máu, say khướt.', effect: { heal: 35, drunk: 130 } },
    ],
  },
  karaoke: {
    title: 'Thuê phòng hát',
    intro: 'Phòng cách âm, màn hình lớn, loa xịn. Hát xong ra về nhẹ cả người.',
    services: [
      { id: 'sing', name: 'Hát 1 giờ', price: 80, description: 'Phòng thường · +30 máu, +80 điểm.', effect: { heal: 30, score: 80, hours: 1 } },
      { id: 'vip', name: 'Phòng VIP', price: 220, description: 'Phòng VIP kèm đồ uống · hồi đầy máu, +200 điểm, hơi say.', effect: { full: true, score: 200, drunk: 40, hours: 2 } },
    ],
  },
  club: {
    title: 'Vào vũ trường',
    intro: 'DJ, đèn laser và sàn nhảy chật kín người. Chỉ dành cho người từ 18 tuổi.',
    services: [
      { id: 'dance', name: 'Vé vào cửa', price: 100, description: 'Nhảy tới khuya · +20 máu, +150 điểm.', effect: { heal: 20, score: 150, hours: 2 } },
      { id: 'vip', name: 'Bàn VIP', price: 300, description: 'Bàn riêng cạnh sàn nhảy · hồi đầy máu, +300 điểm, say.', effect: { full: true, score: 300, drunk: 60, hours: 3 } },
    ],
  },
  spa: {
    title: 'Chọn liệu trình',
    intro: 'Không gian yên tĩnh, tinh dầu thơm. Thư giãn để hồi sức.',
    services: [
      { id: 'sauna', name: 'Xông hơi', price: 60, description: 'Phòng xông gỗ thông · +40 máu.', effect: { heal: 40, hours: 1 } },
      { id: 'massage', name: 'Massage thư giãn', price: 150, description: 'Massage toàn thân 90 phút · hồi đầy máu.', effect: { full: true, hours: 2 } },
    ],
  },
  motel: {
    title: 'Thuê phòng',
    intro: 'Phòng sạch, kín đáo, không hỏi han. Nghỉ ở đây cũng là cách lánh mặt cảnh sát.',
    services: [
      { id: 'rest', name: 'Nghỉ 2 giờ', price: 100, description: 'Chợp mắt một lúc · hồi đầy máu, thời gian trôi 2 giờ.', effect: { full: true, hours: 2 } },
      { id: 'night', name: 'Qua đêm', price: 220, description: 'Ngủ tới 7 giờ sáng · hồi đầy máu, cảnh sát mất dấu nếu bị truy nã tối đa 2 sao.', effect: { full: true, wakeAt: 7, hide: 2 } },
    ],
  },
};

export function serviceOf(venue: VenueRoom, id: string) {
  return VENUE_SERVICES[venue].services.find((s) => s.id === id) ?? null;
}
