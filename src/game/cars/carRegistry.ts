import { useSyncExternalStore } from 'react';
import { isAdmin } from '../admin';
import { addMoney, formatVnd, game, pushMessage } from '../state';
import { CAR_COLORS, CAR_SPECS, type ModelId } from './carSpecs';
import { PRIVATE_BUILD } from '../privateBuild';
/** The private test build keeps bought cars and the My Car pairing for this visit only (a reload starts empty). */
const PERSIST = !PRIVATE_BUILD;

/*
 * Vehicle registry (bible section 10): the cars the player owns, bought with game money at the dealership. Each record
 * keeps modelId, trim, colour, ownerId, vehicleId, seats, the game price, fuel, inventory slots, feature flags and where
 * it is parked. Saved in localStorage with a schema version; no meshes in JSON.
 */
export type OwnedCar = {
  vehicleId: string; modelId: ModelId; trim: string; color: string; ownerId: string; seatCapacity: number; priceGame: number;
  fuelCapacity: number; fuel: number; inventorySlots: number; featureFlags: string[]; plate: string;
  parked: { x: number; z: number; heading: number };
  /** remote key: the code to type into the phone's My Car app, and the remembered lock / engine / AC state */
  pairCode?: string; locked?: boolean; engine?: boolean; ac?: boolean;
};
type RegState = { cars: OwnedCar[]; driving: string | null; paired: string | null; viewer: { model: ModelId; color: string; doors: boolean; tailgate: boolean; interior: boolean; fold: boolean } | null; message: string };
const KEY = 'doi-viet-cars-v1'; const SCHEMA = 1;
function code8() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = new Uint32Array(8); crypto.getRandomValues(r); return Array.from(r, (x) => A[x % A.length]).join(''); }
export const newPairCode = code8;
function load(): OwnedCar[] { if (!PERSIST) return []; try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.schema === SCHEMA && Array.isArray(s.cars)) return (s.cars as OwnedCar[]).map((c) => (c.pairCode ? c : { ...c, pairCode: code8() })); } catch { /* fresh */ } return []; }
const PAIR_KEY = 'doi-viet-mycar-v1';
let st: RegState = { cars: load(), viewer: null, message: '', driving: null, paired: PERSIST ? localStorage.getItem(PAIR_KEY) : null };
const subs = new Set<() => void>();
export const cars = { get: () => st, set(p: Partial<RegState>) { st = { ...st, ...p }; if (PERSIST && 'cars' in p) localStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, cars: st.cars })); if (PERSIST && 'paired' in p) { if (st.paired) localStorage.setItem(PAIR_KEY, st.paired); else localStorage.removeItem(PAIR_KEY); } subs.forEach((f) => f()); }, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
export function useCars<T>(sel: (s: RegState) => T): T { return useSyncExternalStore(cars.subscribe, () => sel(st)); }
/** Prices are configurable here (game money; the bible quotes the maker's listed prices). */
export const carPrices: Record<ModelId, number> = { luhanh: CAR_SPECS.luhanh.priceGame, phonho: CAR_SPECS.phonho.priceGame, doixa: CAR_SPECS.doixa.priceGame };
const plateFor = (n: number) => `30A-${String(100 + (n * 7919) % 900)}.${String(10 + (n * 104729) % 90)}`;
/** Buy once: checks the wallet first, charges a single time, issues a vehicleId and parks the car outside. */
export function buyCar(model: ModelId, color: string, spot: { x: number; z: number; heading: number }) {
  const price = carPrices[model]; const money = game.get().money; const spec = CAR_SPECS[model];
  const colorName = CAR_COLORS.find((c) => c.hex === color)?.name ?? color;
  // admins have the endless wallet (topped up to 999.999.999đ, less than the MPV's price): they get cars for free
  const admin = isAdmin();
  if (!admin && money < price) { cars.set({ message: `Chưa đủ tiền: ${spec.name} giá ${formatVnd(price)}, ví còn ${formatVnd(money)} (thiếu ${formatVnd(price - money)}).` }); return null; }
  if (admin) addMoney(0, `Mua ô tô ${spec.name} (${colorName}) · admin, không trừ tiền`);
  else addMoney(-price, `Mua ô tô ${spec.name} (${colorName})`);
  const n = Date.now();
  const car: OwnedCar = { vehicleId: `V${n.toString(36)}`, modelId: model, trim: spec.trim, color, ownerId: 'local', seatCapacity: spec.seats.reduce((a, b) => a + b, 0), priceGame: price, fuelCapacity: spec.tankL, fuel: spec.tankL * 0.6, inventorySlots: spec.inventorySlots, featureFlags: spec.featureFlags, plate: plateFor(n % 100000), parked: spot, pairCode: code8(), locked: false, engine: false, ac: false };
  cars.set({ cars: [...st.cars, car], message: `Đã mua ${spec.name} màu ${colorName}, biển ${car.plate}. Xe đỗ ngay trước cửa showroom. Mã chìa khoá My Car: ${car.pairCode} (đã gửi vào Tin nhắn).` });
  pushMessage('Ô tô Đời Việt', `Cảm ơn bạn đã mua ${spec.name} biển ${car.plate}. Mã kết nối chìa khoá từ xa: ${car.pairCode}. Mở app My Car trên điện thoại, nhập mã này để kết nối với xe.`);
  game.toast(`Đã mua ${spec.name} · ${admin ? 'admin, miễn phí' : formatVnd(price)} · biển ${car.plate}`);
  return car;
}

if (import.meta.env.DEV) (window as unknown as { __cars?: unknown }).__cars = { cars, carPrices };
