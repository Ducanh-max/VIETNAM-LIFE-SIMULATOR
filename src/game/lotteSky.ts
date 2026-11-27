import { useSyncExternalStore } from 'react';
import { addMoney, formatVnd, game } from './state';

/*
 * LOTTE Hanoi Sky, floor 65 (spec section 12): tickets sold at a desk on B1 and on 65 itself, a turnstile between the
 * lift lobby and the deck, the glass-floored Skywalk. Published facts quoted in the spec: tickets at B1 or 65, opening
 * 9:30–22:30. The game's price and hours are set here (game money only). Opening hours are shown, and only enforced
 * when `enforceHours` is on, because the game has no in-game clock yet and would otherwise lock the deck at night
 * for anyone playing late.
 */
export const skyConfig = { price: 230_000, open: '09:30', close: '22:30', enforceHours: false };
export function skyOpenNow(d = new Date()) {
  if (!skyConfig.enforceHours) return true;
  const m = d.getHours() * 60 + d.getMinutes(); const [oh, om] = skyConfig.open.split(':').map(Number); const [ch, cm] = skyConfig.close.split(':').map(Number);
  return m >= oh * 60 + om && m < ch * 60 + cm;
}
type SkyState = { ticket: { day: string; boughtAt: number; where: 'B1' | '65' } | null; panel: boolean; message: string; used: boolean };
const KEY = 'doi-viet-hanoi-sky-v1';
const today = () => new Date().toISOString().slice(0, 10);
function load(): SkyState['ticket'] { try { const t = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return t && t.day === today() ? t : null; } catch { return null; } }
let st: SkyState = { ticket: load(), panel: false, message: '', used: false };
const subs = new Set<() => void>();
export const sky = { get: () => st, set(p: Partial<SkyState>) { st = { ...st, ...p }; subs.forEach((f) => f()); }, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
export function useSky<T>(sel: (s: SkyState) => T): T { return useSyncExternalStore(sky.subscribe, () => sel(st)); }
/** A valid ticket for today. */
export const hasSkyTicket = () => !!st.ticket && st.ticket.day === today();
export function buySkyTicket(where: 'B1' | '65') {
  if (hasSkyTicket()) { sky.set({ message: 'Bạn đã có vé hôm nay rồi.' }); return false; }
  if (!skyOpenNow()) { sky.set({ message: `Đài quan sát đang đóng cửa (mở ${skyConfig.open}–${skyConfig.close}).` }); return false; }
  const money = game.get().money;
  if (money < skyConfig.price) { sky.set({ message: `Không đủ tiền: vé ${formatVnd(skyConfig.price)}, ví còn ${formatVnd(money)}.` }); return false; }
  addMoney(-skyConfig.price, 'Vé LOTTE Hanoi Sky (tầng 65)');
  const ticket = { day: today(), boughtAt: Date.now(), where };
  localStorage.setItem(KEY, JSON.stringify(ticket));
  sky.set({ ticket, message: `Đã mua vé Hanoi Sky (${formatVnd(skyConfig.price)}). Lên tầng 65 bằng thang máy, quẹt vé ở cửa soát vé.` });
  game.toast('Đã mua vé LOTTE Hanoi Sky. Vé dùng trong hôm nay.');
  return true;
}
