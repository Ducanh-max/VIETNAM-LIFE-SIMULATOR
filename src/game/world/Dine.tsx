import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, type Point } from '../geo';
import { seatState, standUp, type Seat } from '../bag';
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

/**
 * The things on every phở table (local frame: table top at y = 0): a wooden caddy with a bundle of bamboo chopsticks,
 * a pepper shaker, tương ớt in a red squeeze bottle and nước mắm / xì dầu in a dark bottle; a wooden tissue box;
 * a plate of fresh herbs (húng quế, ngò gai) with lime wedges and bean sprouts; a little dish of fresh red chilli.
 */
let condMats: Record<string, THREE.Material> | null = null;
export function Condiments() {
  const m = (condMats ??= {
    wood: new THREE.MeshStandardMaterial({ color: '#9a6a3e', roughness: 0.7 }),
    bamboo: new THREE.MeshStandardMaterial({ color: '#d9bf86', roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.25, metalness: 0.7 }),
    chili: new THREE.MeshStandardMaterial({ color: '#d42a1c', roughness: 0.3 }),
    cap: new THREE.MeshStandardMaterial({ color: '#f29a1e', roughness: 0.4 }),
    soy: new THREE.MeshStandardMaterial({ color: '#2a160c', roughness: 0.15, transparent: true, opacity: 0.92 }),
    tissue: new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.9 }),
    plate: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.35 }),
    herb: new THREE.MeshStandardMaterial({ color: '#3f9a3a', roughness: 0.6, side: THREE.DoubleSide }),
    herb2: new THREE.MeshStandardMaterial({ color: '#5cb84a', roughness: 0.6, side: THREE.DoubleSide }),
    lime: new THREE.MeshStandardMaterial({ color: '#7cc142', roughness: 0.5 }),
    limeIn: new THREE.MeshStandardMaterial({ color: '#e2f2a8', roughness: 0.5 }),
    sprout: new THREE.MeshStandardMaterial({ color: '#f4f0dc', roughness: 0.6 }),
    redChili: new THREE.MeshStandardMaterial({ color: '#e0261a', roughness: 0.4 }),
  });
  return <group>
    {/* the wooden caddy: chopstick cup, pepper, chilli sauce, fish sauce */}
    <group position={[-0.1, 0, -0.12]}>
      <mesh position={[0, 0.012, 0]} material={m.wood} castShadow><boxGeometry args={[0.2, 0.024, 0.09]} /></mesh>
      <mesh position={[-0.065, 0.06, 0]} material={m.wood}><boxGeometry args={[0.055, 0.1, 0.055]} /></mesh>
      {Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[-0.065 + ((i % 4) - 1.5) * 0.008, 0.15, ((Math.floor(i / 4)) - 1.5) * 0.008]} rotation={[((i % 3) - 1) * 0.04, 0, ((i % 4) - 1.5) * 0.03]} material={m.bamboo}><cylinderGeometry args={[0.003, 0.0022, 0.2, 5]} /></mesh>)}
      <mesh position={[-0.01, 0.05, 0.012]} material={m.steel}><cylinderGeometry args={[0.014, 0.016, 0.055, 12]} /></mesh>
      <mesh position={[-0.01, 0.08, 0.012]} material={m.steel}><sphereGeometry args={[0.014, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <mesh position={[0.035, 0.07, 0]} material={m.chili} castShadow><cylinderGeometry args={[0.018, 0.02, 0.1, 12]} /></mesh>
      <mesh position={[0.035, 0.135, 0]} material={m.cap}><coneGeometry args={[0.012, 0.035, 10]} /></mesh>
      <mesh position={[0.075, 0.07, 0]} material={m.soy} castShadow><cylinderGeometry args={[0.017, 0.019, 0.1, 12]} /></mesh>
      <mesh position={[0.075, 0.135, 0]} material={m.soy}><cylinderGeometry args={[0.006, 0.012, 0.035, 10]} /></mesh>
    </group>
    {/* wooden tissue box */}
    <group position={[0.12, 0, -0.12]}>
      <mesh position={[0, 0.035, 0]} material={m.wood} castShadow><boxGeometry args={[0.09, 0.07, 0.07]} /></mesh>
      <mesh position={[0, 0.08, 0]} material={m.tissue} rotation={[0, 0.3, 0.2]}><boxGeometry args={[0.035, 0.03, 0.025]} /></mesh>
    </group>
    {/* the herb plate: húng, ngò gai, lime wedges, bean sprouts */}
    <group position={[-0.06, 0, 0.06]}>
      <mesh position={[0, 0.006, 0]} material={m.plate}><cylinderGeometry args={[0.075, 0.065, 0.012, 20]} /></mesh>
      {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[Math.cos(i * 0.9) * 0.03, 0.022 + (i % 3) * 0.006, Math.sin(i * 0.9) * 0.025 - 0.012]} rotation={[-0.6 + (i % 2) * 0.3, i * 0.8, 0.2]} material={i % 2 ? m.herb : m.herb2}><circleGeometry args={[0.018, 6]} /></mesh>)}
      {[0, 1, 2].map((i) => <group key={`l${i}`} position={[0.035 - i * 0.022, 0.022, 0.035]} rotation={[0, i * 0.7, Math.PI / 2]}><mesh material={m.lime}><sphereGeometry args={[0.014, 8, 6, 0, Math.PI]} /></mesh><mesh material={m.limeIn}><circleGeometry args={[0.0135, 8, 0, Math.PI]} /></mesh></group>)}
      {Array.from({ length: 8 }, (_, i) => <mesh key={`s${i}`} position={[0.03 + Math.cos(i) * 0.012, 0.018, -0.03 + Math.sin(i * 1.7) * 0.012]} rotation={[Math.PI / 2, 0, i * 0.8]} material={m.sprout}><cylinderGeometry args={[0.0018, 0.0018, 0.03, 4]} /></mesh>)}
    </group>
    {/* fresh chilli in a little dish */}
    <group position={[0.07, 0, 0.07]}>
      <mesh position={[0, 0.008, 0]} material={m.plate}><cylinderGeometry args={[0.03, 0.022, 0.016, 14]} /></mesh>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[Math.cos(i) * 0.012, 0.018, Math.sin(i) * 0.012]} rotation={[Math.PI / 2, 0, 0]} material={m.redChili}><cylinderGeometry args={[0.006, 0.006, 0.003, 8]} /></mesh>)}
    </group>
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
    if (seatState.mine !== cur.seat) {
      if (cur.stage === 'cooking' || cur.stage === 'serving') { const shop = shopById(cur.shop); addMoney(basketTotal(shop, cur.basket), `Hoàn tiền · ${shop.name} (rời bàn trước khi có món)`); game.toast('Bạn đã rời bàn, quán hoàn lại tiền.'); }
      else if (cur.stage !== 'done') game.toast('Bạn đã rời bàn.');
      dineStore.set(null); return;
    }
    if (paused) return;
    const w = waiter.current;
    if (cur.stage === 'cooking') {
      cur.t -= dt;
      game.offer({ id: 'dine-cook', text: `Đứng dậy (${shopById(cur.shop).seller} đang làm phở cho bạn…)`, key: 'E', priority: 7, run: () => standUp() });
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
        game.toast('Húp cạn nước dùng! Phở ngon, ấm bụng. Bấm E để đứng dậy, M để gọi thêm.');
      } else game.offer({ id: 'dine-eating', text: cur.progress < 0.12 ? 'Đứng dậy (đang vắt chanh vào bát phở…)' : 'Đứng dậy (đang ăn phở…)', key: 'E', priority: 7, run: () => standUp() });
    } else if (cur.stage === 'done') {
      game.offer({ id: 'dine-done', text: 'Đứng dậy · M: Gọi thêm', key: 'E', priority: 8, run: () => standUp() });
    } else if (cur.stage === 'serving') {
      game.offer({ id: 'dine-serving', text: `Đứng dậy (${cur.table.waiter} đang bưng phở ra…)`, key: 'E', priority: 7, run: () => standUp() });
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
  // M after the bowl is empty: order again at the same table
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const x = dineStore.get(); if (e.code !== 'KeyM' || e.repeat || !x || x.stage !== 'done') return; if (document.pointerLockElement) document.exitPointerLock(); const id = x.shop; dineStore.set(null); shopStore.set({ counter: id, dine: true }); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
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
      {carrying && <group position={[0, 0.78, 0.36]}><Tray><Bowl shop="pho" id={main} progress={() => 0} steam /></Tray></group>}
    </group>
    {onTable && bowl && <group position={bowl} rotation={[0, f, 0]}>
      <Bowl shop="pho" id={main} steam={d.stage !== 'done'} progress={() => { const x = dineStore.get(); return x ? (x.stage === 'done' ? 1 : x.progress < 0.12 ? 0 : ease((x.progress - 0.12) / 0.88)) : 0; }} />
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
