import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, type Point } from '../geo';
import { seatState, type Seat } from '../bag';
import { basketCount, basketTotal, shopById, shopStore, type Basket, type ShopId } from '../shops';
import { addMoney, formatVnd, game, player } from '../state';
import { Bowl, HeldModel } from './HeldItems';
import { NameTag, Person, type PersonAnim } from './Person';
import { Tray } from './food';

/*
 * Eating phở at the table, the way the bún chả shop works: sit on a stool at a phở table and the order sheet opens;
 * the cook makes the bowl, the waiter carries it on a tray to your table, and you eat it there. The avatar holds
 * the chopsticks in the right hand and the spoon in the left, squeezes lime over the bowl first, then alternates
 * noodles and broth (see Avatar.tsx). Every phở table has its condiments: tương ớt, tương đen, sa tế, lime,
 * a chopstick holder, spoons and tissues.
 */
export type DineTable = { shop: ShopId; center: Point; top: number; seats: Seat[]; waiterHome: Point; waiter: string };
const tables: DineTable[] = [];
export function registerDineTables(list: DineTable[]) { tables.push(...list); return () => { for (const t of list) { const i = tables.indexOf(t); if (i >= 0) tables.splice(i, 1); } }; }
export const tableOfSeat = (s: Seat | null) => (s ? tables.find((t) => t.seats.includes(s)) ?? null : null);

export type Dine = { shop: ShopId; basket: Basket; table: DineTable; seat: Seat; stage: 'cooking' | 'serving' | 'served' | 'eating' | 'done'; t: number; progress: number };
let dine: Dine | null = null;
const subs = new Set<() => void>();
export const dineStore = {
  get: () => dine,
  set(d: Dine | null) { dine = d; subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
const useDine = () => useSyncExternalStore(dineStore.subscribe, () => dine);
export const DINE_SECONDS = 20; // squeezing the lime, then noodles and broth until the bowl is empty
/** Where the bowl sits on the table in front of the seat (world), and its height. */
export function bowlSpot(d: { table: DineTable; seat: Seat }): THREE.Vector3 {
  const f: Point = [Math.sin(d.seat.facing), Math.cos(d.seat.facing)];
  return new THREE.Vector3(d.seat.p[0] + f[0] * 0.36, GROUND_HEIGHT + d.table.top, d.seat.p[1] + f[1] * 0.36);
}

/** Order from the table (called by the counter panel opened at a table). */
export function placeDine(id: ShopId, basket: Basket) {
  const seat = seatState.mine; const table = tableOfSeat(seat);
  if (!seat || !table || table.shop !== id) return;
  const shop = shopById(id); const total = basketTotal(shop, basket);
  if (!basketCount(basket)) return;
  if (total > game.get().money) { game.toast(`Không đủ tiền: cần ${formatVnd(total)}.`); return; }
  addMoney(-total, `Ăn tại ${shop.name} (${basketCount(basket)} món)`);
  shopStore.set({ counter: null, dine: false });
  dineStore.set({ shop: id, basket, table, seat, stage: 'cooking', t: 7, progress: 0 });
  game.toast(`Đã gọi món · ${formatVnd(total)}. ${shop.seller} đang chần bánh phở, chan nước dùng…`);
}

/** Bottles, jars and the chopstick holder in the middle of a phở table (local frame: table top at y = 0). */
export function Condiments() {
  const m = useMemo(() => ({
    chili: new THREE.MeshStandardMaterial({ color: '#c8231a', roughness: 0.35 }),
    hoisin: new THREE.MeshStandardMaterial({ color: '#3a1d12', roughness: 0.35 }),
    sate: new THREE.MeshStandardMaterial({ color: '#d8501c', roughness: 0.3, transparent: true, opacity: 0.9 }),
    lid: new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.4 }),
    plate: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.4 }),
    lime: new THREE.MeshStandardMaterial({ color: '#5fae3a', roughness: 0.5 }),
    limeIn: new THREE.MeshStandardMaterial({ color: '#d6ef9a', roughness: 0.5 }),
    bamboo: new THREE.MeshStandardMaterial({ color: '#d9bf86', roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.3, metalness: 0.6 }),
    tissue: new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.9 }),
    box: new THREE.MeshStandardMaterial({ color: '#e45b7a', roughness: 0.6 }),
  }), []);
  return <group>
    {/* tương ớt and tương đen in squeeze bottles */}
    <mesh position={[-0.12, 0.07, 0]} material={m.chili} castShadow><cylinderGeometry args={[0.022, 0.025, 0.13, 12]} /></mesh>
    <mesh position={[-0.12, 0.145, 0]} material={m.chili}><coneGeometry args={[0.012, 0.03, 8]} /></mesh>
    <mesh position={[-0.07, 0.07, 0.03]} material={m.hoisin} castShadow><cylinderGeometry args={[0.022, 0.025, 0.13, 12]} /></mesh>
    <mesh position={[-0.07, 0.145, 0.03]} material={m.hoisin}><coneGeometry args={[0.012, 0.03, 8]} /></mesh>
    {/* sa tế in a little glass jar */}
    <mesh position={[-0.01, 0.03, 0.02]} material={m.sate}><cylinderGeometry args={[0.024, 0.024, 0.06, 12]} /></mesh>
    <mesh position={[-0.01, 0.064, 0.02]} material={m.lid}><cylinderGeometry args={[0.026, 0.026, 0.01, 12]} /></mesh>
    {/* a saucer of lime wedges and fresh chilli */}
    <mesh position={[0.06, 0.006, 0.02]} material={m.plate}><cylinderGeometry args={[0.05, 0.045, 0.012, 16]} /></mesh>
    {[0, 1, 2].map((i) => <mesh key={i} position={[0.05 + i * 0.016, 0.022, 0.01 + (i % 2) * 0.02]} rotation={[0, i, Math.PI / 2]} material={i === 1 ? m.limeIn : m.lime}><sphereGeometry args={[0.016, 8, 6, 0, Math.PI]} /></mesh>)}
    {/* the chopstick holder and the spoon cup */}
    <mesh position={[0.12, 0.05, -0.03]} material={m.steel}><cylinderGeometry args={[0.025, 0.025, 0.1, 12, 1, true]} /></mesh>
    {Array.from({ length: 10 }, (_, i) => <mesh key={`c${i}`} position={[0.12 + Math.cos(i * 2.4) * 0.012, 0.1, -0.03 + Math.sin(i * 2.4) * 0.012]} rotation={[Math.cos(i) * 0.08, 0, Math.sin(i) * 0.08]} material={m.bamboo}><cylinderGeometry args={[0.003, 0.003, 0.2, 5]} /></mesh>)}
    <mesh position={[0.17, 0.035, 0.02]} material={m.steel}><cylinderGeometry args={[0.022, 0.02, 0.07, 12, 1, true]} /></mesh>
    {[0, 1, 2].map((i) => <mesh key={`s${i}`} position={[0.17 + (i - 1) * 0.008, 0.07, 0.02]} rotation={[0.2 * (i - 1), 0, 0.15]} material={m.lid}><boxGeometry args={[0.012, 0.08, 0.006]} /></mesh>)}
    {/* tissues */}
    <mesh position={[0.02, 0.03, -0.07]} material={m.box}><boxGeometry args={[0.1, 0.06, 0.05]} /></mesh>
    <mesh position={[0.02, 0.07, -0.07]} material={m.tissue}><boxGeometry args={[0.03, 0.03, 0.02]} /></mesh>
  </group>;
}

/** A white ceramic Chinese soup spoon (thìa), held at the end of its handle (origin). */
export function Spoon() {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 0.3 }), []);
  return <group>
    <mesh position={[0, 0, 0.04]} material={m}><boxGeometry args={[0.012, 0.006, 0.08]} /></mesh>
    <mesh position={[0, -0.004, 0.095]} scale={[0.024, 0.012, 0.032]} material={m}><sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
  </group>;
}

/** A lime wedge, squeezed over the bowl. */
export function LimeWedge() {
  const m = useMemo(() => ({ skin: new THREE.MeshStandardMaterial({ color: '#5fae3a', roughness: 0.5 }), flesh: new THREE.MeshStandardMaterial({ color: '#d6ef9a', roughness: 0.5 }) }), []);
  return <group rotation={[0, 0, Math.PI / 2]}>
    <mesh material={m.skin}><sphereGeometry args={[0.02, 10, 8, 0, Math.PI]} /></mesh>
    <mesh material={m.flesh} rotation={[0, 0, 0]}><circleGeometry args={[0.019, 10, 0, Math.PI]} /></mesh>
  </group>;
}

const ease = (x: number) => x * x * (3 - 2 * x);
/** The waiter, the bowl on the table and the flow (cooking → carried over → eaten). */
export function DineWorld({ paused }: { paused: boolean }) {
  const d = useDine();
  const waiter = useRef<THREE.Group>(null);
  const anim = useRef<PersonAnim>({ mode: 'stand', speed: 0 }).current;
  const walk = useRef<{ from: Point; to: Point; s: number; back: boolean } | null>(null);
  useFrame((_, delta) => {
    const cur = dineStore.get(); const dt = Math.min(delta, 0.05);
    if (!cur) { walk.current = null; return; }
    // leaving the seat ends the meal
    if (seatState.mine !== cur.seat) { if (cur.stage !== 'done') game.toast('Bạn đã rời bàn.'); dineStore.set(null); return; }
    if (paused) return;
    const w = waiter.current;
    if (cur.stage === 'cooking') {
      cur.t -= dt;
      game.offer({ id: 'dine-cook', text: `${shopById(cur.shop).seller} đang làm phở cho bạn…`, key: null, priority: 7 });
      if (cur.t <= 0) {
        const c = cur.table.center; const h = cur.table.waiterHome; const dx = c[0] - h[0], dz = c[1] - h[1]; const l = Math.hypot(dx, dz) || 1;
        walk.current = { from: h, to: [c[0] - (dx / l) * 0.65, c[1] - (dz / l) * 0.65], s: 0, back: false };
        dineStore.set({ ...cur, stage: 'serving' });
      }
    } else if (cur.stage === 'served') {
      game.offer({ id: 'dine-eat', text: 'Ăn phở (vắt chanh rồi ăn)', key: 'E', priority: 7, run: () => { const x = dineStore.get(); if (x) dineStore.set({ ...x, stage: 'eating', progress: 0 }); } });
    } else if (cur.stage === 'eating') {
      cur.progress = Math.min(1, cur.progress + dt / DINE_SECONDS);
      if (cur.progress >= 1) {
        const shop = shopById(cur.shop); const g = game.get(); let hunger = g.hunger, thirst = g.thirst;
        for (const it of shop.items) { const n = cur.basket[it.id] ?? 0; hunger += it.hunger * n; thirst += it.thirst * n; }
        game.set({ hunger: Math.min(100, hunger), thirst: Math.min(100, thirst) });
        dineStore.set({ ...cur, stage: 'done' });
        game.toast('Húp cạn nước dùng! Phở ngon, ấm bụng. Bấm E để đứng dậy.');
      } else game.offer({ id: 'dine-eating', text: cur.progress < 0.12 ? 'Vắt chanh vào bát phở…' : 'Đang ăn phở…', key: null, priority: 7 });
    }
    // the waiter carries the tray over and walks back
    const wk = walk.current;
    if (w) {
      if (wk) {
        wk.s += dt * 1.3;
        const L = Math.hypot(wk.to[0] - wk.from[0], wk.to[1] - wk.from[1]) || 1;
        const k = Math.min(1, wk.s / L);
        w.position.set(wk.from[0] + (wk.to[0] - wk.from[0]) * k, GROUND_HEIGHT, wk.from[1] + (wk.to[1] - wk.from[1]) * k);
        w.rotation.y = Math.atan2(wk.to[0] - wk.from[0], wk.to[1] - wk.from[1]);
        anim.mode = wk.back ? 'walk' : 'carry'; anim.speed = 1.3;
        if (k >= 1) {
          if (!wk.back) { const x = dineStore.get(); if (x && x.stage === 'serving') dineStore.set({ ...x, stage: 'served' }); walk.current = { from: wk.to, to: wk.from, s: 0, back: true }; }
          else { walk.current = null; anim.mode = 'stand'; anim.speed = 0; }
        }
      } else {
        const h = cur.table.waiterHome; w.position.set(h[0], GROUND_HEIGHT, h[1]); anim.mode = 'stand'; anim.speed = 0;
      }
    }
  });
  const bowl = useMemo(() => (d ? bowlSpot(d) : null), [d]);
  if (!d) return null;
  const main = shopById(d.shop).items.find((it) => (d.basket[it.id] ?? 0) > 0 && it.hunger >= 40)?.id ?? 'tai';
  const extras = shopById(d.shop).items.filter((it) => it.id !== main && (d.basket[it.id] ?? 0) > 0).slice(0, 2);
  const carrying = d.stage === 'serving' && walk.current && !walk.current.back;
  const onTable = d.stage === 'served' || d.stage === 'eating' || d.stage === 'done';
  const f = d.seat.facing;
  return <group>
    <group ref={waiter} position={[d.table.waiterHome[0], GROUND_HEIGHT, d.table.waiterHome[1]]}>
      <Person anim={anim} shirt="#ffffff" pants="#1d1d1f" apron="#a3251c" seed={41} />
      <NameTag name={d.table.waiter} role="Phục vụ" />
      {carrying && <group position={[0, 0.78, 0.36]}><Tray><Bowl shop="pho" id={main} progress={() => 0} /></Tray></group>}
    </group>
    {onTable && bowl && <group position={bowl} rotation={[0, f, 0]}>
      <Bowl shop="pho" id={main} progress={() => { const x = dineStore.get(); return x ? (x.stage === 'done' ? 1 : x.progress < 0.12 ? 0 : ease((x.progress - 0.12) / 0.88)) : 0; }} />
      {extras.map((it, i) => <group key={it.id} position={[0.16 * (i ? -1 : 1), 0, 0.02]}><HeldModel shop={d.shop} item={it.id} /></group>)}
    </group>}
  </group>;
}

/** For the avatar: where the bowl is relative to the seated body, and the meal's progress. */
export function dineForAvatar() {
  const x = dineStore.get();
  if (!x || !player.seat || seatState.mine !== x.seat) return null;
  return { stage: x.stage, progress: x.progress, tableTop: x.table.top, seatHeight: x.seat.height };
}

if (import.meta.env.DEV) (window as unknown as { __dine?: unknown }).__dine = { dineStore, tables, placeDine };
