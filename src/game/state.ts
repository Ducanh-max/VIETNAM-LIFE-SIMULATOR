import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import type { Ride } from './ride';
import { loadPlayerOutfit, savePlayerOutfit, type Outfit } from './character/outfit';

/** Menu of Bún chả Đức Anh. Prices in VND. */
export type MenuId = 'buncha' | 'pepsi' | 'coca' | 'sevenup' | 'lavie';
export const MENU: { id: MenuId; name: string; note: string; price: number; hunger: number; thirst: number; kind: 'food' | 'drink' }[] = [
  { id: 'buncha', name: 'Bún chả chấm', note: 'Chả miếng + chả viên nướng than hoa, bún, rau sống, nước chấm chua ngọt', price: 50_000, hunger: 70, thirst: 8, kind: 'food' },
  { id: 'pepsi', name: 'Pepsi', note: 'Lon 330ml ướp lạnh', price: 15_000, hunger: 4, thirst: 35, kind: 'drink' },
  { id: 'coca', name: 'Coca-Cola', note: 'Lon 330ml ướp lạnh', price: 15_000, hunger: 4, thirst: 35, kind: 'drink' },
  { id: 'sevenup', name: '7 Up', note: 'Lon 330ml, vị chanh', price: 12_000, hunger: 3, thirst: 35, kind: 'drink' },
  { id: 'lavie', name: 'Nước suối Lavie', note: 'Chai 500ml', price: 8_000, hunger: 0, thirst: 45, kind: 'drink' },
];
export const menuItem = (id: MenuId) => MENU.find((m) => m.id === id)!;
export const formatVnd = (v: number) => `${v.toLocaleString('vi-VN')}đ`;

export type Order = Partial<Record<MenuId, number>>;
/** idle → seated (menu open) → cooking → serving (waiter walking) → served (food on table) → eating → finished */
export type OrderPhase = 'none' | 'menu' | 'cooking' | 'serving' | 'served' | 'eating' | 'finished';

type State = {
  hunger: number; // 100 = full
  thirst: number; // 100 = not thirsty
  money: number;
  phase: OrderPhase;
  order: Order;
  table: number; // index of the table the player sits at, -1 = standing
  eatProgress: number; // 0..1 while eating
  prompt: Prompt | null;
  /** Open conversation with an NPC (pauses controls). */
  dialog: 'boss' | null;
  job: Job | null;
  toast: { text: string; id: number } | null;
  /** Mini smartphone overlay. */
  phone: boolean;
  /** The player's outfit (modular, saved). */
  outfit: Outfit;
  /** Current Đen SM ride, if any. */
  ride: Ride | null;
  /** Wallet history (newest first) and phone messages (newest first). */
  txns: Txn[];
  messages: Message[];
};
export type Txn = { text: string; amount: number; at: number };
export type Message = { from: string; text: string; at: number };

const SAVE_KEY = 'doi-viet-needs-v1';
function load(): Pick<State, 'hunger' | 'thirst' | 'money'> {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (saved && typeof saved.hunger === 'number') return { hunger: saved.hunger, thirst: saved.thirst, money: saved.money };
  } catch { /* ignore */ }
  return { hunger: 72, thirst: 64, money: 300_000 };
}

let state: State = { ...load(), phase: 'none', order: {}, table: -1, eatProgress: 0, prompt: null, toast: null, dialog: null, job: null, phone: false, ride: null, txns: [], messages: [], outfit: loadPlayerOutfit() };

// One-time gift of 500.000đ for existing and new saves.
const BONUS_KEY = 'doi-viet-bonus-500k';
if (!localStorage.getItem(BONUS_KEY)) {
  localStorage.setItem(BONUS_KEY, '1');
  state.money += 500_000;
  state.txns = [{ text: 'Quà tặng từ Đời Việt', amount: 500_000, at: Date.now() }];
  state.messages = [{ from: 'Đời Việt', text: 'Bạn vừa được tặng 500.000đ vào ví. Chúc bạn khám phá Hồ Gươm vui vẻ!', at: Date.now() }];
  localStorage.setItem(SAVE_KEY, JSON.stringify({ hunger: state.hunger, thirst: state.thirst, money: state.money }));
}

/** Record money in/out (amount negative for spending) and keep the wallet history. */
export function addMoney(amount: number, text: string) {
  game.set({ money: state.money + amount, txns: [{ text, amount, at: Date.now() }, ...state.txns].slice(0, 60) });
}
/** Change pieces of the player's outfit and save them. */
export function setOutfit(patch: Partial<Outfit>) {
  const outfit = { ...state.outfit, ...patch };
  savePlayerOutfit(outfit);
  game.set({ outfit });
}
export function pushMessage(from: string, text: string) {
  game.set({ messages: [{ from, text, at: Date.now() }, ...state.messages].slice(0, 40) });
}
const pending: Prompt[] = [];
const listeners = new Set<() => void>();
let lastSave = 0;

export const game = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
    const now = performance.now();
    if (now - lastSave > 2000) { lastSave = now; localStorage.setItem(SAVE_KEY, JSON.stringify({ hunger: state.hunger, thirst: state.thirst, money: state.money })); }
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  toast(text: string) { game.set({ toast: { text, id: Math.random() } }); },
  /**
   * World components offer context actions every frame; the highest priority offer is committed once
   * per frame (see commitPrompts) and its `run` fires on the matching key.
   */
  offer(prompt: Prompt) { pending.push(prompt); },
};

/** Context action shown above the bottom bar. key null = information only. */
export type Prompt = { id: string; text: string; key: 'E' | 'F' | null; priority?: number; run?: () => void };
/** Called once per frame before other world logic: shows last frame's best offer. */
export function commitPrompts() {
  let best: Prompt | null = null;
  for (const p of pending) if (!best || (p.priority ?? 0) > (best.priority ?? 0)) best = p;
  pending.length = 0;
  const cur = state.prompt;
  if (!best) { if (cur) game.set({ prompt: null }); return; }
  if (!cur || cur.id !== best.id || cur.text !== best.text || cur.key !== best.key) game.set({ prompt: best });
  else state.prompt = best; // keep the freshest callback without re-rendering
}

export function useGame<T>(select: (s: State) => T): T {
  return useSyncExternalStore(game.subscribe, () => select(state));
}

export const orderTotal = (order: Order) => Object.entries(order).reduce((sum, [id, n]) => sum + menuItem(id as MenuId).price * (n ?? 0), 0);
export const orderCount = (order: Order) => Object.values(order).reduce((s, n) => s + (n ?? 0), 0);

/** Live player pose shared between the controller and world props (no React re-render). */
export const player = {
  position: new THREE.Vector3(),
  yaw: 0,
  /** When set, the controller snaps the avatar onto this seat and shows the table close-up. */
  seat: null as null | { position: THREE.Vector3; facing: number; look: THREE.Vector3 },
  /** Indoors the follow camera is pulled in so walls don't hide the avatar. */
  cameraMax: Infinity,
  teleport: null as null | ((x: number, z: number) => void),
};

/** Restaurant flow, called from the menu UI and the in-world prompts. */
export const actions = {
  placeOrder(order: Order) {
    const total = orderTotal(order);
    if (!orderCount(order)) return;
    if (total > state.money) { game.toast(`Không đủ tiền: cần ${formatVnd(total)}, bạn còn ${formatVnd(state.money)}.`); return; }
    addMoney(-total, `Ăn tại Bún chả Đức Anh (${orderCount(order)} món)`);
    game.set({ phase: 'cooking', order, eatProgress: 0 });
    game.toast(`Đã gọi món · ${formatVnd(total)}. Chờ chút, chả đang nướng trên than hoa!`);
  },
  closeMenu() { if (state.phase === 'menu') actions.standUp(); },
  orderMore() { game.set({ phase: 'menu', order: {}, eatProgress: 0 }); },
  standUp() {
    player.seat = null;
    game.set({ phase: 'none', table: -1, order: {}, eatProgress: 0 });
  },
  /** Apply what was eaten and drunk. */
  finishMeal() {
    let hunger = state.hunger; let thirst = state.thirst;
    for (const [id, n] of Object.entries(state.order)) { const item = menuItem(id as MenuId); hunger += item.hunger * (n ?? 0); thirst += item.thirst * (n ?? 0); }
    game.set({ phase: 'finished', hunger: Math.min(100, hunger), thirst: Math.min(100, thirst), eatProgress: 1 });
    game.toast(state.order.buncha ? 'Ngon tuyệt! Chả nướng thơm lừng, nước chấm chua ngọt vừa miệng.' : 'Mát lạnh cả người!');
  },
};

/** Hunger/thirst drain per second (full → empty in ~14 and ~10 minutes of walking; running drains faster). */
export function tickNeeds(dt: number, running: boolean, moving: boolean) {
  const factor = running ? 1.8 : moving ? 1.15 : 1;
  const hunger = Math.max(0, state.hunger - dt * (100 / 840) * factor);
  const thirst = Math.max(0, state.thirst - dt * (100 / 600) * factor);
  if (Math.floor(hunger) !== Math.floor(state.hunger) || Math.floor(thirst) !== Math.floor(state.thirst)) {
    if (state.hunger >= 20 && hunger < 20) game.toast('Bụng đói cồn cào rồi… đi kiếm gì ăn thôi! Quán Bún chả Đức Anh ngay phố Đinh Tiên Hoàng.');
    if (state.thirst >= 20 && thirst < 20) game.toast('Khát khô cổ! Gọi một chai nước nhé.');
    game.set({ hunger, thirst });
  } else {
    state.hunger = hunger; state.thirst = thirst;
  }
}

// ---- Shipper job ------------------------------------------------------------
export type Delivery = { customer: string; street: string; dest: { x: number; z: number }; facing: number; portions: number; pay: number; distance: number; startedAt: number; timeLimit: number };
export type Job = { stage: 'pickup' | 'deliver'; delivery: Delivery | null; done: number; earned: number };

/** The shop's delivery scooter. Mutable pose, updated by the rider controller. */
export const bike = {
  position: new THREE.Vector3(),
  heading: 0,
  speed: 0,
  steer: 0,
  lean: 0,
  wheel: 0,
  riding: false,
};

/** Camera heading, for the HUD compass arrow. */
export const view = { yaw: 0 };

// Dev hook for test scripts.
if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = { game, bike, player, actions };
