import { canWalk, type Point } from './geo';
import { jobActions } from './job';
import { addMoney, bike, formatVnd, game, player, pushMessage } from './state';

/*
 * "Thuê Xe Hồ Gươm": a scooter and car rental on the pavement of Phố Hai Bà Trưng, 935 m by road from
 * Bún chả Đức Anh (the A* street route, measured in game). Rent a scooter or a 5-seat car (deposit up
 * front), drive it anywhere, bring it back to the return bay in front of the shop and settle with the
 * owner: the time is charged per started 10 minutes of real time, taken from the deposit, the rest refunded.
 */
export const RENTAL = { name: 'Thuê Xe Hồ Gươm', street: 'Phố Hai Bà Trưng', x: -89.4, z: 460.3, facing: -0.301, routeToBunCha: 935 };
export type RentKind = 'bike' | 'car';
export const RENT_PRICES: Record<RentKind, { name: string; seats: number; deposit: number; first: number; step: number; cap: number }> = {
  bike: { name: 'Xe máy', seats: 2, deposit: 100_000, first: 10_000, step: 5_000, cap: 150_000 },
  car: { name: 'Ô tô 5 chỗ', seats: 5, deposit: 500_000, first: 50_000, step: 25_000, cap: 800_000 },
};
const BIKE_COLORS = ['#2f6fb3', '#1f9e6e', '#e0a21b', '#7a4bc2', '#e8e4dc', '#d2462f'];
const CAR_COLORS = ['#f2f2ef', '#b9bec4', '#c3222a'];
export type Rental = { kind: RentKind; startedAt: number; deposit: number; color: string; plate: string };

/** Charge for a rental that lasted `ms`: the first 10 minutes, then each started 10 minutes, capped. */
export function rentalCost(kind: RentKind, ms: number) {
  const p = RENT_PRICES[kind];
  const blocks = Math.max(1, Math.ceil(ms / 600_000));
  return Math.min(p.cap, p.first + (blocks - 1) * p.step);
}
/** Unit vectors at the shop: toward the road, and along it. */
const fwd: Point = [Math.sin(RENTAL.facing), Math.cos(RENTAL.facing)];
const side: Point = [Math.cos(RENTAL.facing), -Math.sin(RENTAL.facing)];
export const shopPoint = (f: number, s: number): Point => [RENTAL.x + fwd[0] * f + side[0] * s, RENTAL.z + fwd[1] * f + side[1] * s];
/** Return bay: the kerb lane in front of the shop. */
export const RETURN_BAY = { center: shopPoint(3.2, -6.5), radius: 6.5 };
export const inReturnBay = (x: number, z: number) => Math.hypot(x - RETURN_BAY.center[0], z - RETURN_BAY.center[1]) < RETURN_BAY.radius;

export const rentalActions = {
  rent(kind: RentKind) {
    const s = game.get(); const p = RENT_PRICES[kind];
    if (s.rental) { game.toast('Bạn đang thuê một xe rồi. Trả xe trước khi thuê xe khác nhé.'); return; }
    if (s.job || s.driver) { game.toast('Bạn đang làm việc (ship bún chả / Đen SM). Nghỉ việc trước rồi mới thuê xe.'); return; }
    if (bike.riding) { game.toast('Xuống xe đang đi trước đã.'); return; }
    if (s.money < p.deposit) { game.toast(`Không đủ tiền cọc: cần ${formatVnd(p.deposit)}, bạn còn ${formatVnd(s.money)}.`); return; }
    const color = (kind === 'car' ? CAR_COLORS : BIKE_COLORS)[Math.floor(Math.random() * (kind === 'car' ? CAR_COLORS.length : BIKE_COLORS.length))];
    const plate = `29${kind === 'car' ? 'A' : 'X'}-${100 + Math.floor(Math.random() * 899)}.${10 + Math.floor(Math.random() * 89)}`;
    addMoney(-p.deposit, `Đặt cọc thuê ${p.name.toLowerCase()} · ${RENTAL.name}`);
    const [x, z] = shopPoint(3.0, kind === 'car' ? -11 : -6.5);
    bike.position.set(x, player.position.y, z); bike.heading = RENTAL.facing + Math.PI / 2;
    bike.speed = 0; bike.steer = 0; bike.lean = 0; bike.riding = false; bike.kind = kind === 'car' ? 'rentcar' : 'rentbike'; bike.color = color;
    game.set({ rental: { kind, startedAt: Date.now(), deposit: p.deposit, color, plate }, rentalOpen: false });
    game.toast(`Đã thuê ${p.name.toLowerCase()} biển ${plate}. Xe đỗ ngay trước tiệm, bấm F để lên xe. Trả xe ở ô trả xe trước tiệm.`);
    pushMessage(RENTAL.name, `Cảm ơn bạn đã thuê ${p.name.toLowerCase()} (${plate}). Giá: ${formatVnd(p.first)} 10 phút đầu, ${formatVnd(p.step)} mỗi 10 phút tiếp theo, tối đa ${formatVnd(p.cap)}. Cọc ${formatVnd(p.deposit)}.`);
  },
  /** Settle at the shop: the vehicle must be parked in the return bay. */
  giveBack() {
    const r = game.get().rental; if (!r) return;
    if (!inReturnBay(bike.position.x, bike.position.z)) { game.toast('Đưa xe về đỗ trong ô trả xe trước tiệm đã nhé.'); return; }
    if (bike.riding) { if (Math.abs(bike.speed) > 1) { game.toast('Dừng hẳn xe đã.'); return; } jobActions.dismount(); }
    const ms = Date.now() - r.startedAt;
    const cost = rentalCost(r.kind, ms);
    const back = r.deposit - cost;
    if (back > 0) addMoney(back, `Hoàn cọc thuê xe (${formatVnd(cost)} tiền thuê)`);
    else if (back < 0) addMoney(-Math.min(game.get().money, -back), `Trả thêm tiền thuê xe`);
    bike.riding = false; bike.kind = 'wave';
    game.set({ rental: null, rentalOpen: false });
    const mins = Math.max(1, Math.ceil(ms / 60_000));
    game.toast(`Đã trả xe sau ${mins} phút · tiền thuê ${formatVnd(cost)}${back > 0 ? `, hoàn lại ${formatVnd(back)}` : back < 0 ? `, trả thêm ${formatVnd(-back)}` : ''}. Cảm ơn bạn!`);
    pushMessage(RENTAL.name, `Hoá đơn: ${mins} phút → ${formatVnd(cost)}. Cọc ${formatVnd(r.deposit)}${back >= 0 ? `, hoàn ${formatVnd(back)}` : `, trả thêm ${formatVnd(-back)}`}.`);
  },
};

/** Step off the rented vehicle beside it. */
export function stepOff() {
  for (const s of [1, -1]) {
    const p: Point = [bike.position.x + Math.cos(bike.heading) * 1.4 * s, bike.position.z - Math.sin(bike.heading) * 1.4 * s];
    if (canWalk(p)) { bike.riding = false; bike.speed = 0; player.teleport?.(p[0], p[1]); return; }
  }
}

if (import.meta.env.DEV) (window as unknown as { __rental?: unknown }).__rental = { rentalActions, rentalCost, RENTAL, RETURN_BAY };
