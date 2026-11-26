import { useSyncExternalStore } from 'react';
import { nearestWalkable } from './geo';
import { bike, game, player } from './state';

/*
 * Admin tools: teleport anywhere on the map and an endless wallet. Off by default; \`setAdmin\` will be switched on by
 * the account system for admin accounts (the admin list lives on the server, not in this code).
 */
let admin = false;
const subs = new Set<() => void>();
export const isAdmin = () => admin;
export function setAdmin(on: boolean) { admin = on; subs.forEach((f) => f()); if (on) game.toast('Chế độ admin: tiền vô hạn, dịch chuyển tới mọi nơi (trong app Bản đồ).'); }
export function useAdmin() { return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => admin); }

export const ADMIN_MONEY = 999_999_999;
/** Keep the admin's wallet full (called every frame). */
export function topUpAdmin() { if (admin && game.get().money < ADMIN_MONEY) game.set({ money: ADMIN_MONEY }); }

/** Put the player at the walkable spot nearest to (x, z). */
export function teleportTo(x: number, z: number, label = 'điểm đã chọn') {
  if (!admin) return false;
  if (bike.riding) { game.toast('Xuống xe trước khi dịch chuyển nhé.'); return false; }
  if (player.seat) { game.toast('Đứng dậy trước khi dịch chuyển nhé.'); return false; }
  const p = nearestWalkable([x, z], 60);
  if (!p) { game.toast('Chỗ này không đứng được, chọn chỗ khác nhé.'); return false; }
  player.teleport?.(p[0], p[1]);
  game.toast(`Đã dịch chuyển tới ${label}.`);
  return true;
}

if (import.meta.env.DEV) (window as unknown as { __admin?: unknown }).__admin = { setAdmin, teleportTo, isAdmin };
