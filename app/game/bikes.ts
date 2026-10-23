/** Motorbike catalogue shared by the engine and the bike shop UI. Prices are in thousands of đồng. */
export type BikeId = 'scooter' | 'cub' | 'vespa' | 'sport' | 'horse';
export type BikeDef = {
  id: BikeId;
  name: string;
  price: number;
  top: number;
  reverse: number;
  accel: number;
  turn: number;
  health: number;
  color: string;
  description: string;
};

export const BIKES: BikeDef[] = [
  { id: 'cub', name: 'Xe số Cub', price: 60, top: 17, reverse: 4, accel: 1.7, turn: 2.2, health: 80, color: '#4f86c6', description: 'Rẻ, bốc, luồn lách giỏi nhưng mau hỏng.' },
  { id: 'scooter', name: 'Xe tay ga', price: 90, top: 19, reverse: 4, accel: 1.4, turn: 2.0, health: 100, color: '#ed763e', description: 'Chiếc xe quen thuộc của cả khu phố.' },
  { id: 'vespa', name: 'Vespa cổ', price: 220, top: 21, reverse: 4, accel: 1.5, turn: 1.9, health: 140, color: '#86b8a0', description: 'Vỏ thép dày, chịu va chạm tốt.' },
  { id: 'horse', name: 'Ngựa', price: 300, top: 15, reverse: 2.5, accel: 1.9, turn: 2.5, health: 130, color: '#7a4e2e', description: 'Không cần xăng, rẽ cực gắt, phi nước đại khắp phố.' },
  { id: 'sport', name: 'Xe côn tay', price: 450, top: 27, reverse: 4, accel: 2.1, turn: 1.8, health: 110, color: '#c9493b', description: 'Nhanh nhất phố, tăng tốc cực mạnh.' },
];

// Cars steer as readily as a bike at town speeds; they just accelerate a little slower.
export const CAR_STATS = { top: 26, reverse: 7, accel: 1.4, turn: 1.9 };
export const POLICE_CAR_STATS = { top: 30, reverse: 8, accel: 1.6, turn: 2.0 };
export const MOTO_STATS = { top: 18, reverse: 4, accel: 1.5, turn: 2.0 };

export function bikeById(id: BikeId) {
  return BIKES.find((bike) => bike.id === id) ?? BIKES[1];
}

/** Repair price grows with damage; a wrecked bike costs about half of a new one to fix. */
export function repairCost(id: BikeId, health: number) {
  const def = bikeById(id);
  const missing = 1 - Math.max(0, health) / def.health;
  return missing <= 0 ? 0 : Math.ceil(10 + missing * def.price * 0.4);
}
