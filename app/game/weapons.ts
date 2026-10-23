/** Weapon catalogue shared by the engine and the store UI. Prices are in thousands of đồng. */
export type WeaponId = 'fists' | 'pistol' | 'shotgun' | 'smg' | 'grenade' | 'rpg';
/** Explosive weapons fire a projectile instead of a hitscan bullet. */
export type Projectile = { speed: number; gravity: number; fuse: number; radius: number; damage: number };
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
  damage: number;
  /** Rounds per magazine (0 = unlimited, for fists), reserve given on purchase, and a box of ammo. */
  magazine: number;
  startAmmo: number;
  ammoPack: number;
  ammoPrice: number;
  reload: number;
  projectile?: Projectile;
  description: string;
};

export const WEAPONS: WeaponDef[] = [
  { id: 'fists', name: 'Tay không', price: 0, fireRate: 2.4, auto: false, pellets: 1, spread: 0, range: 2.2, force: 7, damage: 34, magazine: 0, startAmmo: 0, ammoPack: 0, ammoPrice: 0, reload: 0, description: 'Đẩy ngã người đứng ngay trước mặt.' },
  { id: 'pistol', name: 'Súng lục', price: 100, fireRate: 3.5, auto: false, pellets: 1, spread: 0.012, range: 48, force: 9, damage: 34, magazine: 12, startAmmo: 48, ammoPack: 36, ammoPrice: 20, reload: 1.1, description: 'Gọn nhẹ, bắn từng phát chính xác.' },
  { id: 'shotgun', name: 'Súng săn', price: 250, fireRate: 1.15, auto: false, pellets: 7, spread: 0.1, range: 24, force: 6.5, damage: 15, magazine: 6, startAmmo: 18, ammoPack: 18, ammoPrice: 30, reload: 1.8, description: 'Tầm gần, một phát hất văng mục tiêu.' },
  { id: 'grenade', name: 'Súng phóng lựu', price: 650, fireRate: 1.1, auto: false, pellets: 1, spread: 0.01, range: 60, force: 0, damage: 0, magazine: 4, startAmmo: 8, ammoPack: 6, ammoPrice: 90, reload: 2.2, projectile: { speed: 24, gravity: 14, fuse: 1.8, radius: 5, damage: 120 }, description: 'Bắn cầu vồng, lựu đạn nảy rồi nổ sau 2 giây.' },
  { id: 'rpg', name: 'Bazooka', price: 900, fireRate: 0.7, auto: false, pellets: 1, spread: 0.004, range: 140, force: 0, damage: 0, magazine: 1, startAmmo: 4, ammoPack: 3, ammoPrice: 150, reload: 2.4, projectile: { speed: 44, gravity: 0, fuse: 4, radius: 6.5, damage: 170 }, description: 'Tên lửa bay thẳng, nổ tung cả xe hơi.' },
  { id: 'smg', name: 'Tiểu liên', price: 400, fireRate: 11, auto: true, pellets: 1, spread: 0.045, range: 40, force: 5, damage: 14, magazine: 30, startAmmo: 90, ammoPack: 90, ammoPrice: 40, reload: 1.6, description: 'Giữ chuột hoặc F để bắn liên tục.' },
];

/** Pay for one completed coffee delivery, in thousands of đồng. */
export const DELIVERY_PAY = 100;

export function weaponById(id: WeaponId) {
  return WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0];
}

export function formatCash(thousands: number) {
  return `${(thousands * 1000).toLocaleString('vi-VN')}đ`;
}
