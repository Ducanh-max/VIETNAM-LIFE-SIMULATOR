import { useSyncExternalStore } from 'react';
import { addMoney, formatVnd, game } from '../state';
import { CAR_COLORS, CAR_SPECS, type ModelId } from './carSpecs';

/*
 * Vehicle registry (bible section 10): the cars the player owns, bought with game money at the dealership. Each record
 * keeps modelId, trim, colour, ownerId, vehicleId, seats, the game price, fuel, inventory slots, feature flags and where
 * it is parked. Saved in localStorage with a schema version; no meshes in JSON.
 */
export type OwnedCar = {
  vehicleId: string; modelId: ModelId; trim: string; color: string; ownerId: string; seatCapacity: number; priceGame: number;
  fuelCapacity: number; fuel: number; inventorySlots: number; featureFlags: string[]; plate: string;
  parked: { x: number; z: number; heading: number };
};
type RegState = { cars: OwnedCar[]; viewer: { model: ModelId; color: string; doors: boolean; tailgate: boolean; interior: boolean; fold: boolean } | null; message: string };
const KEY = 'doi-viet-cars-v1'; const SCHEMA = 1;
function load(): OwnedCar[] { try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.schema === SCHEMA && Array.isArray(s.cars)) return s.cars; } catch { /* fresh */ } return []; }
let st: RegState = { cars: load(), viewer: null, message: '' };
const subs = new Set<() => void>();
export const cars = { get: () => st, set(p: Partial<RegState>) { st = { ...st, ...p }; if ('cars' in p) localStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, cars: st.cars })); subs.forEach((f) => f()); }, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
export function useCars<T>(sel: (s: RegState) => T): T { return useSyncExternalStore(cars.subscribe, () => sel(st)); }
/** Prices are configurable here (game money; the bible quotes the maker's listed prices). */
export const carPrices: Record<ModelId, number> = { luhanh: CAR_SPECS.luhanh.priceGame, phonho: CAR_SPECS.phonho.priceGame, doixa: CAR_SPECS.doixa.priceGame };
const plateFor = (n: number) => `30A-${String(100 + (n * 7919) % 900)}.${String(10 + (n * 104729) % 90)}`;
/** Buy once: checks the wallet first, charges a single time, issues a vehicleId and parks the car outside. */
export function buyCar(model: ModelId, color: string, spot: { x: number; z: number; heading: number }) {
  const price = carPrices[model]; const money = game.get().money; const spec = CAR_SPECS[model];
  if (money < price) { cars.set({ message: `Không đủ tiền: ${spec.name} giá ${formatVnd(price)}, ví còn ${formatVnd(money)}.` }); return null; }
  addMoney(-price, `Mua ô tô ${spec.name} (${CAR_COLORS.find((c) => c.hex === color)?.name ?? color})`);
  const n = Date.now();
  const car: OwnedCar = { vehicleId: `V${n.toString(36)}`, modelId: model, trim: spec.trim, color, ownerId: 'local', seatCapacity: spec.seats.reduce((a, b) => a + b, 0), priceGame: price, fuelCapacity: spec.tankL, fuel: spec.tankL * 0.6, inventorySlots: spec.inventorySlots, featureFlags: spec.featureFlags, plate: plateFor(n % 100000), parked: spot };
  cars.set({ cars: [...st.cars, car], message: `Chúc mừng! Bạn đã mua ${spec.name}, biển ${car.plate}. Xe đỗ ngay trước showroom.` });
  game.toast(`Đã mua ${spec.name} · ${formatVnd(price)} · biển ${car.plate}`);
  return car;
}

if (import.meta.env.DEV) (window as unknown as { __cars?: unknown }).__cars = { cars, carPrices };
