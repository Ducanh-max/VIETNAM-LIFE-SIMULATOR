import type { VehicleKind } from './net';

/*
 * Lotte Center basement parking (B2–B5): fee rules, bays, the player's ticket.
 *
 * Fees follow the owner's spec (section 7), all configurable here and charged in game money only:
 *  bicycle 3.000đ a visit, motorbike 5.000đ a visit (20.000đ if the stay crosses midnight), car 40.000đ per started
 *  hour. Car members get free minutes per day (Lime 120, Green 180, Orange 360, taken from the AVENUEL tiers the spec
 *  cites); free = min(stay, today's allowance left), charged = max(0, stay − free), fee = ceil(charged / 60) × 40.000đ.
 *
 * Time: the game has no persistent in-game clock yet, so a stay is measured in real minutes between entry and exit
 * (saved with the ticket, so a reload does not reset it). Nothing here depends on the frame rate.
 */
export const parkingConfig = {
  rates: { bicycle: 3_000, motorcycle: 5_000, motorcycleOvernight: 20_000, carPerHour: 40_000 },
  membershipFreeMinutes: { none: 0, lime: 120, green: 180, orange: 360 } as Record<Tier, number>,
};
export type Tier = 'none' | 'lime' | 'green' | 'orange';
export const TIER_NAME: Record<Tier, string> = { none: 'Khách thường', lime: 'Lime', green: 'Green', orange: 'Orange' };
export type ParkVehicle = 'car' | 'motorcycle' | 'bicycle';
export const VEHICLE_NAME: Record<ParkVehicle, string> = { car: 'Ô tô', motorcycle: 'Xe máy', bicycle: 'Xe đạp' };
export const vehicleTypeOf = (k: VehicleKind): ParkVehicle => (k === 'dencar' || k === 'rentcar' ? 'car' : 'motorcycle');

/** The spec's quote function: the fee for one stay. */
export function quoteParking({ vehicleType, elapsedMinutes, tier = 'none', usedFreeMinutes = 0, overnight = false, eligible = false }: {
  vehicleType: ParkVehicle; elapsedMinutes: number; tier?: Tier; usedFreeMinutes?: number; overnight?: boolean; eligible?: boolean;
}) {
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) throw new Error('Invalid parking duration');
  if (vehicleType === 'car') {
    const allowance = eligible ? (parkingConfig.membershipFreeMinutes[tier] ?? 0) : 0;
    const freeMinutes = Math.min(elapsedMinutes, Math.max(0, allowance - Math.max(0, usedFreeMinutes)));
    const chargedMinutes = Math.max(0, elapsedMinutes - freeMinutes);
    return { freeMinutes, chargedMinutes, fee: Math.ceil(chargedMinutes / 60) * parkingConfig.rates.carPerHour };
  }
  if (vehicleType === 'motorcycle') return { freeMinutes: 0, chargedMinutes: elapsedMinutes, fee: overnight ? parkingConfig.rates.motorcycleOvernight : parkingConfig.rates.motorcycle };
  if (vehicleType === 'bicycle') return { freeMinutes: 0, chargedMinutes: elapsedMinutes, fee: parkingConfig.rates.bicycle };
  throw new Error('Unsupported vehicle type');
}

// ---- bays ----
export type ParkingSlot = {
  slotId: string; floorId: number; vehicleType: ParkVehicle;
  /** Centre in tower-local metres [u, v] and yaw of the bay's long side (radians, tower local). */
  position: [number, number]; rotation: number; w: number; l: number;
  occupied: boolean; vehicleId: string | null;
};
export const slots: ParkingSlot[] = [];
export function slotAt(floorId: number, u: number, v: number): ParkingSlot | null {
  for (const s of slots) {
    if (s.floorId !== floorId) continue;
    const dx = u - s.position[0], dz = v - s.position[1]; const c = Math.cos(s.rotation), sn = Math.sin(s.rotation);
    const a = dx * c + dz * sn, b = -dx * sn + dz * c;
    if (Math.abs(a) < s.l / 2 && Math.abs(b) < s.w / 2) return s;
  }
  return null;
}

// ---- the player's ticket (one at a time), saved ----
export type ParkingSession = {
  sessionId: string; playerId: string; vehicleId: string; vehicleType: ParkVehicle; vehicleKind: VehicleKind; color: string;
  licensePlate: string; entryTime: number; exitTime: number | null; parkingFloor: number | null; parkingSlot: string | null;
  membershipTier: Tier; freeMinutes: number; totalFee: number; paymentStatus: 'open' | 'paid'; transactionId: string | null;
  /** Where the vehicle was left (tower local), so it is put back after a reload. */
  parked: { u: number; v: number; heading: number } | null;
};
type Saved = { session: ParkingSession | null; tier: Tier; free: { day: string; used: number }; history: { sessionId: string; fee: number; at: number }[] };
const KEY = 'doi-viet-lotte-parking-v1';
const today = () => new Date().toISOString().slice(0, 10);
function load(): Saved {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && typeof s === 'object') return { session: s.session ?? null, tier: s.tier ?? 'none', free: s.free ?? { day: today(), used: 0 }, history: s.history ?? [] }; } catch { /* fresh */ }
  return { session: null, tier: 'none', free: { day: today(), used: 0 }, history: [] };
}
export const parking = load();
export function saveParking() { localStorage.setItem(KEY, JSON.stringify(parking)); }
/** Today's free car minutes already used (resets each day). */
export function freeUsedToday() { if (parking.free.day !== today()) parking.free = { day: today(), used: 0 }; return parking.free.used; }

const plateFor = (seed: number) => `29${'ABCDEFGHK'[seed % 9]}-${String(100 + (seed * 7919) % 900)}.${String(10 + (seed * 104729) % 90)}`;
/** Open a ticket at the entrance barrier. */
export function openSession(kind: VehicleKind, color: string): ParkingSession {
  const now = Date.now();
  parking.session = {
    sessionId: `P${now.toString(36)}`, playerId: 'local', vehicleId: `${kind}-${color}`, vehicleType: vehicleTypeOf(kind), vehicleKind: kind, color,
    licensePlate: plateFor(now % 100000), entryTime: now, exitTime: null, parkingFloor: null, parkingSlot: null,
    membershipTier: parking.tier, freeMinutes: 0, totalFee: 0, paymentStatus: 'open', transactionId: null, parked: null,
  };
  saveParking();
  return parking.session;
}
/** The fee if the player left now. */
export function currentQuote(now = Date.now()) {
  const s = parking.session; if (!s) return null;
  const elapsedMinutes = Math.max(0, (now - s.entryTime) / 60_000);
  const overnight = new Date(s.entryTime).toDateString() !== new Date(now).toDateString();
  const q = quoteParking({ vehicleType: s.vehicleType, elapsedMinutes, tier: s.membershipTier, usedFreeMinutes: freeUsedToday(), overnight, eligible: s.membershipTier !== 'none' });
  return { ...q, elapsedMinutes, overnight };
}
/**
 * Pay once: checks the balance through `pay` (which must return false without charging when money is short), then
 * records the transaction, the free minutes used and closes the ticket. A second call does nothing.
 */
export function paySession(pay: (amount: number, text: string) => boolean): { ok: boolean; reason?: string; fee?: number } {
  const s = parking.session; if (!s) return { ok: false, reason: 'Không có vé gửi xe.' };
  if (s.paymentStatus === 'paid') return { ok: true, fee: s.totalFee };
  const q = currentQuote()!;
  if (q.fee > 0 && !pay(q.fee, `Gửi xe Lotte Center · ${VEHICLE_NAME[s.vehicleType]} ${s.licensePlate}`)) return { ok: false, reason: 'Không đủ tiền.' };
  s.exitTime = Date.now(); s.freeMinutes = q.freeMinutes; s.totalFee = q.fee; s.paymentStatus = 'paid'; s.transactionId = `T${s.exitTime.toString(36)}`;
  if (q.freeMinutes) parking.free.used = freeUsedToday() + q.freeMinutes;
  parking.history = [{ sessionId: s.sessionId, fee: q.fee, at: s.exitTime }, ...parking.history].slice(0, 20);
  saveParking();
  return { ok: true, fee: q.fee };
}
/** The car has left through the barrier: the ticket is finished. */
export function closeSession() { parking.session = null; for (const sl of slots) if (sl.vehicleId === 'player') { sl.occupied = false; sl.vehicleId = null; } saveParking(); }

if (import.meta.env.DEV) (window as unknown as { __parking?: unknown }).__parking = { parking, quoteParking, slots, currentQuote };
