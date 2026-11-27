import { useSyncExternalStore } from 'react';
import { addMoney, formatVnd, game } from './state';

/*
 * Life in the tower above the mall (spec section 11): office shifts for pay (floors 8–31), hotel rooms to book
 * (floors 33–56, reception on 33), serviced apartments to rent and keep as home (57–64), the hotel amenities on 7
 * (gym inside, outdoor pool on the podium roof). Everything here is game data, editable in one place.
 */
export const lifeConfig = {
  office: { pay: 180_000, shiftSeconds: 45, firstFloor: 8, lastFloor: 31 },
  hotel: { firstFloor: 33, lastFloor: 56, receptionFloor: 33, rooms: [{ id: 'standard', name: 'Phòng Standard', price: 2_500_000 }, { id: 'deluxe', name: 'Phòng Deluxe hướng hồ', price: 3_800_000 }] },
  apartment: { firstFloor: 57, lastFloor: 64, monthly: 12_000_000 },
};
export type Booking = { room: string; floor: number; slot: number; type: string; day: string };
export type Lease = { floor: number; slot: number; since: number };
type LifeState = { shift: { floor: number; startedAt: number } | null; booking: Booking | null; lease: Lease | null; panel: 'hotel' | 'office' | 'apartment' | null; message: string };
const KEY = 'doi-viet-lotte-life-v1';
const today = () => new Date().toISOString().slice(0, 10);
function load(): Pick<LifeState, 'booking' | 'lease'> {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s) return { booking: s.booking && s.booking.day === today() ? s.booking : null, lease: s.lease ?? null }; } catch { /* fresh */ }
  return { booking: null, lease: null };
}
let st: LifeState = { shift: null, panel: null, message: '', ...load() };
const subs = new Set<() => void>();
const save = () => localStorage.setItem(KEY, JSON.stringify({ booking: st.booking, lease: st.lease }));
export const life = { get: () => st, set(p: Partial<LifeState>) { st = { ...st, ...p }; if ('booking' in p || 'lease' in p) save(); subs.forEach((f) => f()); }, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
export function useLife<T>(sel: (s: LifeState) => T): T { return useSyncExternalStore(life.subscribe, () => sel(st)); }

/** Room number like 4512 (floor 45, slot 12). */
export const roomNo = (floor: number, slot: number) => `${floor}${String(slot).padStart(2, '0')}`;
export function bookRoom(type: string, slots: number) {
  if (st.booking) { life.set({ message: `Bạn đã có phòng ${st.booking.room} hôm nay.` }); return false; }
  const t = lifeConfig.hotel.rooms.find((r) => r.id === type)!; const money = game.get().money;
  if (money < t.price) { life.set({ message: `Không đủ tiền: ${t.name} ${formatVnd(t.price)}/đêm, ví còn ${formatVnd(money)}.` }); return false; }
  const floor = lifeConfig.hotel.firstFloor + 1 + Math.floor(Math.random() * (lifeConfig.hotel.lastFloor - lifeConfig.hotel.firstFloor));
  const slot = 1 + Math.floor(Math.random() * slots);
  addMoney(-t.price, `LOTTE HOTEL · ${t.name}`);
  const booking = { room: roomNo(floor, slot), floor, slot, type: t.name, day: today() };
  life.set({ booking, message: `Đã đặt ${t.name}, phòng ${booking.room}. Đi thang máy lên tầng ${floor}, tìm cửa số ${booking.room}.` });
  game.toast(`LOTTE HOTEL: phòng ${booking.room} (tầng ${floor}). Thẻ phòng đã có trong điện thoại.`);
  return true;
}
export function rentApartment(floor: number, slot: number) {
  if (st.lease) { life.set({ message: `Bạn đang thuê căn ${roomNo(st.lease.floor, st.lease.slot)} rồi.` }); return false; }
  const money = game.get().money; const price = lifeConfig.apartment.monthly;
  if (money < price) { life.set({ message: `Không đủ tiền: tiền thuê ${formatVnd(price)}/tháng, ví còn ${formatVnd(money)}.` }); return false; }
  addMoney(-price, `Căn hộ dịch vụ Lotte Center ${roomNo(floor, slot)} · tháng đầu`);
  life.set({ lease: { floor, slot, since: Date.now() }, message: `Đã thuê căn ${roomNo(floor, slot)} và lưu làm nhà của bạn.` });
  game.toast(`Căn hộ ${roomNo(floor, slot)} giờ là nhà của bạn.`);
  return true;
}
export function startShift(floor: number) {
  if (st.shift) return;
  life.set({ shift: { floor, startedAt: Date.now() }, message: '' });
  game.toast(`Bắt đầu ca làm ở văn phòng tầng ${floor}: ngồi làm ở một bàn trống ${lifeConfig.office.shiftSeconds} giây (ở lại trên tầng này). Lương ${formatVnd(lifeConfig.office.pay)}/ca.`);
}
/** Called every frame while a shift runs: pays once at the end; leaving the floor cancels it. */
export function stepShift(floor: number) {
  const s = st.shift; if (!s) return;
  if (floor !== s.floor) { life.set({ shift: null }); game.toast('Bạn rời văn phòng giữa ca: ca làm bị huỷ, chưa có lương.'); return; }
  if (Date.now() - s.startedAt >= lifeConfig.office.shiftSeconds * 1000) {
    addMoney(lifeConfig.office.pay, `Lương ca làm văn phòng tầng ${s.floor} (Lotte Center)`);
    life.set({ shift: null }); game.toast(`Hết ca! Nhận ${formatVnd(lifeConfig.office.pay)} tiền lương.`);
  }
}

if (import.meta.env.DEV) (window as unknown as { __life?: unknown }).__life = { lifeConfig, life };
