/** Weapon catalogue shared by the engine and the store UI. Prices are in thousands of đồng. */
export type WeaponId = 'fists' | 'pistol' | 'shotgun' | 'smg';
export type WeaponDef = {
  id: WeaponId;
  name: string;
  price: number;
  fireRate: number;
  auto: boolean;
  pellets: number;
  spread: number;
  range: number;
  force: number;
  description: string;
};

export const WEAPONS: WeaponDef[] = [
  { id: 'fists', name: 'Tay không', price: 0, fireRate: 2.4, auto: false, pellets: 1, spread: 0, range: 2.2, force: 7, description: 'Đẩy ngã người đứng ngay trước mặt.' },
  { id: 'pistol', name: 'Súng lục', price: 100, fireRate: 3.5, auto: false, pellets: 1, spread: 0.012, range: 48, force: 9, description: 'Gọn nhẹ, bắn từng phát chính xác.' },
  { id: 'shotgun', name: 'Súng săn', price: 250, fireRate: 1.15, auto: false, pellets: 7, spread: 0.1, range: 24, force: 6.5, description: 'Tầm gần, một phát hất văng mục tiêu.' },
  { id: 'smg', name: 'Tiểu liên', price: 400, fireRate: 11, auto: true, pellets: 1, spread: 0.045, range: 40, force: 5, description: 'Giữ chuột hoặc F để bắn liên tục.' },
];

/** Pay for one completed coffee delivery, in thousands of đồng. */
export const DELIVERY_PAY = 100;

export function weaponById(id: WeaponId) {
  return WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0];
}

export function formatCash(thousands: number) {
  return `${(thousands * 1000).toLocaleString('vi-VN')}đ`;
}
