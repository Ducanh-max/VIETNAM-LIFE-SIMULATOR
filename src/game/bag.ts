import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { type Point } from './geo';
import { shopById, shopKind, type ShopId, type ShopItem } from './shops';
import { formatVnd, game, player } from './state';

/*
 * The balo (backpack): take-away food and drinks and the books you buy go in it. Open it (button or B) to take
 * something out: food and drinks are eaten in your hands, a book is read sitting down on a ghế đá or a stool.
 * Also the seats: every bench and stool registers here, and E sits you down on the nearest free one.
 */
export type BagItem = { uid: number; shop: ShopId; item: string };
/** What the player holds right now: eating / drinking it (progress 0…1), or a book open in their hands. */
export type Held = { uid: number; shop: ShopId; item: string; kind: 'food' | 'drink' | 'book'; progress: number };
type BagState = { items: BagItem[]; open: boolean; held: Held | null; page: number };

const KEY = 'doi-viet-bag-v1';
let nextUid = 1;
function load(): BagItem[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as BagItem[]; if (Array.isArray(v)) { nextUid = Math.max(1, ...v.map((i) => i.uid + 1)); return v.filter((i) => i && i.shop && i.item); } } catch { /* fresh bag */ }
  return [];
}
let st: BagState = { items: load(), open: false, held: null, page: 0 };
const subs = new Set<() => void>();
const save = () => localStorage.setItem(KEY, JSON.stringify(st.items));
export const bagStore = {
  get: () => st,
  set(patch: Partial<BagState>) { st = { ...st, ...patch }; if ('items' in patch) save(); subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useBag<T>(sel: (s: BagState) => T): T { return useSyncExternalStore(bagStore.subscribe, () => sel(st)); }

export const itemOf = (b: { shop: ShopId; item: string }): ShopItem => shopById(b.shop).items.find((i) => i.id === b.item)!;
export const kindOf = (b: { shop: ShopId; item: string }): Held['kind'] => { const it = itemOf(b); return it.book ? 'book' : it.thirst > it.hunger ? 'drink' : 'food'; };

/** Put bought things in the bag. */
export function addToBag(shop: ShopId, basket: Record<string, number>) {
  const items = [...st.items];
  for (const [item, n] of Object.entries(basket)) for (let k = 0; k < n; k++) items.push({ uid: nextUid++, shop, item });
  bagStore.set({ items });
}

/** Take something out of the bag: start eating / drinking it, or open the book. */
export function takeOut(uid: number) {
  const b = st.items.find((i) => i.uid === uid); if (!b) return;
  if (itemOf(b).keep) { game.toast(`${itemOf(b).name}: để dành trong balo (mang về nhà dùng).`); return; }
  if (st.held) putAway();
  const kind = kindOf(b);
  bagStore.set({ held: { ...b, kind, progress: 0 }, open: false, page: 0 });
  const it = itemOf(b);
  if (kind === 'book') game.toast(player.seat ? `Mở "${it.name}" ra đọc.` : `Đã lấy "${it.name}" ra. Tìm một ghế đá hay ghế đẩu, bấm E để ngồi xuống đọc.`);
  else game.toast(kind === 'drink' ? `Uống ${it.name}…` : `Ăn ${it.name}…`);
}
/** Put what you hold back in the bag (a half-eaten dish goes back as it was). */
export function putAway() {
  if (!st.held) return;
  bagStore.set({ held: null, page: 0 });
}
/** Seconds to finish a dish or a drink. */
export const eatSeconds = (h: Held) => (h.kind === 'drink' ? 6 : shopKind(h.shop) === 'pho' || h.shop === 'buncha' ? 12 : 9);
/** Advance eating / drinking; applies the hunger and thirst when finished. */
export function stepHeld(dt: number) {
  const h = st.held; if (!h || h.kind === 'book') return;
  const progress = Math.min(1, h.progress + dt / eatSeconds(h));
  if (progress < 1) { st = { ...st, held: { ...h, progress } }; return; } // per-frame progress without re-rendering React
  const it = itemOf(h); const g = game.get();
  game.set({ hunger: Math.min(100, g.hunger + it.hunger), thirst: Math.min(100, g.thirst + it.thirst) });
  bagStore.set({ held: null, items: st.items.filter((i) => i.uid !== h.uid) });
  game.toast(h.kind === 'drink' ? `Đã uống hết ${it.name}. Mát cả người!` : `Đã ăn hết ${it.name}. Ngon quá!`);
}
export const bagLabel = (b: BagItem) => { const it = itemOf(b); return `${it.name} · ${shopById(b.shop).name}`; };
export const bagValue = () => st.items.reduce((s, b) => s + itemOf(b).price, 0);
export { formatVnd };

// ---- seats -----------------------------------------------------------------------------------------
/** A place to sit: where the hips go (world), the way the sitter faces (yaw: forward = (sin, cos)), seat height. */
export type Seat = { p: Point; facing: number; height: number; kind: 'bench' | 'stool' };
const seats: Seat[] = [];
export function registerSeats(list: Seat[]) { seats.push(...list); return () => { for (const s of list) { const i = seats.indexOf(s); if (i >= 0) seats.splice(i, 1); } }; }
export function nearestSeat(p: Point, r = 1.3) {
  let best: Seat | null = null; let bd = r;
  for (const s of seats) { const d = Math.hypot(s.p[0] - p[0], s.p[1] - p[1]); if (d < bd) { bd = d; best = s; } }
  return best;
}
/** The low plastic stool the avatar's seated pose is made for (seat.position.y is shifted for taller seats). */
const STOOL = 0.25;
export const seatState = { mine: null as Seat | null };
export function sitOn(s: Seat, ground: number) {
  const fwd = new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing));
  player.seat = { position: new THREE.Vector3(s.p[0], ground + (s.height - STOOL), s.p[1]), facing: s.facing, look: new THREE.Vector3(s.p[0] + fwd.x * 1.2, ground + s.height + 0.5, s.p[1] + fwd.z * 1.2) };
  seatState.mine = s;
  if (document.pointerLockElement) document.exitPointerLock();
}
export function standUp() { if (seatState.mine) { player.seat = null; seatState.mine = null; } }

if (import.meta.env.DEV) (window as unknown as { __bag?: unknown }).__bag = { bagStore, addToBag, takeOut, putAway, seats, nearestSeat, sitOn, standUp, seatState };
