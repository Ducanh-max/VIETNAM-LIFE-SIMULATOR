import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, type Point } from '../geo';
import { seatState, standUp, type Seat } from '../bag';
import { basketCount, basketTotal, shopById, shopStore, type Basket, type ShopId } from '../shops';
import { addMoney, formatVnd, game, player } from '../state';
import { Bowl } from './HeldItems';
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

/** One thing eaten at the table, in order: each bowl, then the quẩy (dipped in the broth), then the trà đá. */
export type Course = { kind: 'bowl' | 'quay' | 'tea'; item: string; n: number };
export type Dine = {
  shop: ShopId; basket: Basket; table: DineTable; seat: Seat; stage: 'cooking' | 'serving' | 'served' | 'eating' | 'done'; t: number;
  /** courses in order, the one being eaten, and how far into it (0…1) */
  courses: Course[]; course: number; progress: number;
  /** a second press within this time confirms leaving with food still coming / on the table */
  confirmUntil: number;
};
/** Seconds per course: the first bowl includes taking a lime wedge and squeezing it. */
export const courseSeconds = (c: Course) => (c.kind === 'bowl' ? (c.n === 0 ? 17 : 14) : 5);
export const LIME = 0.16; // the share of the first bowl spent on the lime
function coursesOf(id: ShopId, basket: Basket): Course[] {
  const shop = shopById(id); const out: Course[] = [];
  let bowls = 0;
  for (const it of shop.items) if (it.hunger >= 40) for (let k = 0; k < (basket[it.id] ?? 0); k++) out.push({ kind: 'bowl', item: it.id, n: bowls++ });
  for (let k = 0; k < (basket.quay ?? 0); k++) out.push({ kind: 'quay', item: 'quay', n: k });
  for (let k = 0; k < (basket.tra ?? 0); k++) out.push({ kind: 'tea', item: 'tra', n: k });
  return out;
}
let dine: Dine | null = null;
const subs = new Set<() => void>();
export const dineStore = {
  get: () => dine,
  set(d: Dine | null) { dine = d; subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
const useDine = () => useSyncExternalStore(dineStore.subscribe, () => dine);
export const DINE_SECONDS = 14; // a bowl of phở, noodles and broth
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
  const courses = coursesOf(id, basket);
  dineStore.set({ shop: id, basket, table, seat, stage: 'cooking', t: 6 + Math.min(6, courses.filter((c) => c.kind === 'bowl').length * 1.5), courses, course: 0, progress: 0, confirmUntil: 0 });
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
/** Leave the table: a second press within 3 s confirms when food is still coming or still on the table. */
function leave(cur: Dine, what: string) {
  const now = performance.now();
  if (now < cur.confirmUntil) { standUp(); return; }
  cur.confirmUntil = now + 3000;
  game.toast(`${what} Bấm E lần nữa trong 3 giây để đứng dậy.`);
}

/* Things on the table besides the bowls (bowl-local frame: +x is the eater's left, +z away from them). */
const TEA_AT: [number, number, number] = [0.19, 0, -0.04];
const QUAY_AT: [number, number, number] = [-0.21, 0, 0.1];
export const LIME_AT: [number, number, number] = [-0.19, 0, -0.06];
/** Where the k-th waiting bowl stands, and where empty bowls are pushed. */
const waitingAt = (k: number): [number, number, number] => [-0.04 + (k % 2 ? 0.2 : 0), 0, 0.2 + Math.floor(k / 2) * 0.17];
const emptyAt = (k: number): [number, number, number] => [0.24, 0.03 * k, 0.16];

let tableMats: Record<string, THREE.Material> | null = null;
const TM = () => (tableMats ??= {
  glass: new THREE.MeshStandardMaterial({ color: '#eef6fb', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }),
  tea: new THREE.MeshStandardMaterial({ color: '#b8721f', roughness: 0.1, transparent: true, opacity: 0.85 }),
  ice: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.6 }),
  plate: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.35 }),
  quay: new THREE.MeshStandardMaterial({ color: '#d99a3a', roughness: 0.7 }),
  lime: new THREE.MeshStandardMaterial({ color: '#7cc142', roughness: 0.5 }),
  limeIn: new THREE.MeshStandardMaterial({ color: '#e2f2a8', roughness: 0.5 }),
});
/** A tall glass of trà đá that empties as it is drunk. */
function TeaGlass({ level, inHand }: { level: () => number; inHand?: () => boolean }) {
  const m = TM(); const fill = useRef<THREE.Mesh>(null); const root = useRef<THREE.Group>(null);
  useFrame(() => { if (root.current) root.current.visible = !inHand?.(); if (fill.current) { const k = Math.max(0.04, level()); fill.current.scale.y = k; fill.current.position.y = 0.006 + 0.05 * k; } });
  return <group ref={root}>
    <mesh position={[0, 0.06, 0]} material={m.glass}><cylinderGeometry args={[0.034, 0.028, 0.12, 14, 1, true]} /></mesh>
    <mesh ref={fill} position={[0, 0.056, 0]} material={m.tea}><cylinderGeometry args={[0.031, 0.026, 0.1, 14]} /></mesh>
    {[0, 1, 2].map((i) => <mesh key={i} position={[Math.cos(i * 2) * 0.012, 0.09 + i * 0.008, Math.sin(i * 2) * 0.012]} rotation={[i, i, 0]} material={m.ice}><boxGeometry args={[0.02, 0.02, 0.02]} /></mesh>)}
  </group>;
}
/** A plate of quẩy: two golden twin sticks per portion; they go as they are dipped and eaten. */
function QuayPlate({ left }: { left: () => number }) {
  const m = TM(); const g = useRef<THREE.Group>(null);
  useFrame(() => { const n = left(); g.current?.children.forEach((c, i) => { if (i > 0) c.visible = i - 1 < n * 2; }); });
  return <group ref={g}>
    <mesh position={[0, 0.006, 0]} material={m.plate}><cylinderGeometry args={[0.08, 0.07, 0.012, 18]} /></mesh>
    {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[(i % 3 - 1) * 0.03, 0.022 + Math.floor(i / 3) * 0.018, (i % 2) * 0.012 - 0.006]} rotation={[0, 0.3 + (i % 3) * 0.2, Math.PI / 2]} material={m.quay}><capsuleGeometry args={[0.009, 0.1, 3, 6]} /></mesh>)}
  </group>;
}
/** The saucer of lime wedges by the bowl; one wedge is taken for the squeeze. */
function LimeSaucer({ taken }: { taken: () => boolean }) {
  const m = TM(); const w = useRef<THREE.Group>(null);
  useFrame(() => { if (w.current) w.current.visible = !taken(); });
  return <group>
    <mesh position={[0, 0.006, 0]} material={m.plate}><cylinderGeometry args={[0.045, 0.04, 0.012, 16]} /></mesh>
    {[0, 1].map((i) => <group key={i} position={[-0.012 + i * 0.024, 0.02, 0.01]} rotation={[0, i, Math.PI / 2]}><mesh material={m.lime}><sphereGeometry args={[0.014, 8, 6, 0, Math.PI]} /></mesh><mesh material={m.limeIn}><circleGeometry args={[0.0135, 8, 0, Math.PI]} /></mesh></group>)}
    <group ref={w} position={[0, 0.02, -0.014]} rotation={[0, 2, Math.PI / 2]}><mesh material={m.lime}><sphereGeometry args={[0.014, 8, 6, 0, Math.PI]} /></mesh><mesh material={m.limeIn}><circleGeometry args={[0.0135, 8, 0, Math.PI]} /></mesh></group>
  </group>;
}

/** The waiter, everything ordered on the table and the flow (cooking → carried over → eaten course by course). */
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
      else if (cur.stage !== 'done') game.toast('Bạn đã rời bàn khi chưa ăn hết.');
      dineStore.set(null); return;
    }
    if (paused) return;
    const w = waiter.current;
    const shop = shopById(cur.shop);
    if (cur.stage === 'cooking') {
      cur.t -= dt;
      game.offer({ id: 'dine-cook', text: `${shop.seller} đang làm phở cho bạn… (bấm 2 lần để huỷ & đứng dậy)`, key: 'E', priority: 7, run: () => leave(cur, 'Đứng dậy bây giờ sẽ huỷ đơn (quán hoàn tiền).') });
      if (cur.t <= 0) {
        const c = cur.table.center; const h = cur.table.waiterHome; const dx = c[0] - h[0], dz = c[1] - h[1]; const l = Math.hypot(dx, dz) || 1;
        walk.current = { from: h, to: [c[0] - (dx / l) * 0.65, c[1] - (dz / l) * 0.65], s: 0, back: false };
        dineStore.set({ ...cur, stage: 'serving' });
      }
    } else if (cur.stage === 'serving') {
      game.offer({ id: 'dine-serving', text: `${cur.table.waiter} đang bưng món ra…`, key: null, priority: 7 });
    } else if (cur.stage === 'served') {
      game.offer({ id: 'dine-eat', text: 'Ăn (lấy chanh vắt vào phở rồi ăn)', key: 'E', priority: 7, run: () => { const x = dineStore.get(); if (x) dineStore.set({ ...x, stage: 'eating', course: 0, progress: 0 }); } });
    } else if (cur.stage === 'eating') {
      const c = cur.courses[cur.course];
      cur.progress = Math.min(1, cur.progress + dt / courseSeconds(c));
      if (cur.progress >= 1) {
        // this course is finished: its fullness now, then the next one
        const it = shop.items.find((x) => x.id === c.item); const g = game.get();
        if (it) game.set({ hunger: Math.min(100, g.hunger + it.hunger), thirst: Math.min(100, g.thirst + it.thirst) });
        if (cur.course + 1 < cur.courses.length) dineStore.set({ ...cur, course: cur.course + 1, progress: 0 });
        else { dineStore.set({ ...cur, stage: 'done', progress: 1 }); game.toast('Ăn hết sạch! Phở ngon, ấm bụng. Bấm E để đứng dậy, M để gọi thêm.'); }
      } else {
        const what = c.kind === 'tea' ? 'Đang uống trà đá' : c.kind === 'quay' ? 'Đang chấm quẩy vào nước phở' : c.n === 0 && cur.progress < LIME ? 'Đang vắt chanh vào bát phở' : `Đang ăn bát phở ${c.n + 1}/${cur.courses.filter((x) => x.kind === 'bowl').length}`;
        game.offer({ id: 'dine-eating', text: `${what}… (bấm 2 lần để đứng dậy)`, key: 'E', priority: 7, run: () => leave(cur, 'Bạn chưa ăn hết.') });
      }
    } else if (cur.stage === 'done') {
      game.offer({ id: 'dine-done', text: 'Đứng dậy · M: Gọi thêm', key: 'E', priority: 8, run: () => standUp() });
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
  // M after everything is eaten: order again at the same table
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const x = dineStore.get(); if (e.code !== 'KeyM' || e.repeat || !x || x.stage !== 'done') return; if (document.pointerLockElement) document.exitPointerLock(); const id = x.shop; dineStore.set(null); shopStore.set({ counter: id, dine: true }); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const bowl = useMemo(() => (d ? bowlSpot(d) : null), [d?.seat, d?.table]);
  if (!d) return null;
  const bowls = d.courses.filter((c) => c.kind === 'bowl');
  const quays = d.courses.filter((c) => c.kind === 'quay');
  const teas = d.courses.filter((c) => c.kind === 'tea');
  const carrying = d.stage === 'serving' && walk.current && !walk.current.back;
  const onTable = d.stage === 'served' || d.stage === 'eating' || d.stage === 'done';
  const f = d.seat.facing;
  const idxOf = (c: Course) => d.courses.indexOf(c);
  const doneWith = (c: Course) => { const x = dineStore.get(); if (!x) return 1; const i = idxOf(c); return x.stage === 'done' || x.course > i ? 1 : x.course < i || x.stage !== 'eating' ? 0 : x.progress; };
  const current = d.stage === 'eating' ? d.courses[d.course] : null;
  const bowlNow = current?.kind === 'bowl' ? current : bowls.find((b) => doneWith(b) < 1) ?? null;
  return <group>
    <group ref={waiter} position={[d.table.waiterHome[0], GROUND_HEIGHT, d.table.waiterHome[1]]}>
      <Person anim={anim} shirt="#ffffff" pants="#1d1d1f" apron="#a3251c" seed={41} />
      <NameTag name={d.table.waiter} role="Phục vụ" />
      {carrying && <group position={[0, 0.78, 0.36]}><Tray>
        {bowls.slice(0, 3).map((b, i) => <group key={i} position={[(i - (Math.min(3, bowls.length) - 1) / 2) * 0.15, 0, 0]} scale={0.85}><Bowl shop="pho" id={b.item} progress={() => 0} steam={i === 0} /></group>)}
        {teas.length > 0 && <group position={[0.13, 0, 0.08]} scale={0.85}><TeaGlass level={() => 1} /></group>}
      </Tray></group>}
    </group>
    {onTable && bowl && <group position={bowl} rotation={[0, f, 0]}>
      {/* the bowl being eaten in front, the others waiting behind, empty ones pushed aside */}
      {bowls.map((b, i) => {
        const front = b === bowlNow;
        const waitingIdx = bowls.filter((x, j) => j < i && x !== bowlNow && doneWith(x) < 1).length;
        const emptyIdx = bowls.filter((x, j) => j < i && doneWith(x) >= 1).length;
        const full = doneWith(b) >= 1 && !front;
        const at = front ? [0, 0, 0] as [number, number, number] : full ? emptyAt(emptyIdx) : waitingAt(waitingIdx);
        return <group key={i} position={at}>
          <Bowl shop="pho" id={b.item} steam={!full} progress={() => { const p = doneWith(b); return b.n === 0 ? (p < LIME ? 0 : ease((p - LIME) / (1 - LIME))) : ease(p); }} />
        </group>;
      })}
      <group position={LIME_AT}><LimeSaucer taken={() => { const x = dineStore.get(); return !!x && (x.stage === 'done' || x.course > 0 || (x.stage === 'eating' && x.progress > LIME * 0.4)); }} /></group>
      {quays.length > 0 && <group position={QUAY_AT}><QuayPlate left={() => quays.reduce((s, q) => s + (1 - doneWith(q)), 0)} /></group>}
      {teas.map((tc, i) => <group key={i} position={[TEA_AT[0] + i * 0.075, 0, TEA_AT[2]]}><TeaGlass level={() => 1 - doneWith(tc)} inHand={() => { const x = dineStore.get(); return !!x && x.stage === 'eating' && x.courses[x.course] === tc && x.progress > 0.2 && x.progress < 0.95; }} /></group>)}
    </group>}
  </group>;
}

/** For the avatar: the meal's state, the course being eaten and where things are (bowl-local, see DineWorld). */
export function dineForAvatar() {
  const x = dineStore.get();
  if (!x || !player.seat || seatState.mine !== x.seat) return null;
  const c = x.stage === 'eating' ? x.courses[x.course] : null;
  return { stage: x.stage, progress: x.progress, kind: c?.kind ?? null, lime: !!c && c.kind === 'bowl' && c.n === 0, tableTop: x.table.top, seatHeight: x.seat.height, teaAt: TEA_AT, quayAt: QUAY_AT, limeAt: LIME_AT };
}

if (import.meta.env.DEV) (window as unknown as { __dine?: unknown }).__dine = { dineStore, tables, placeDine, coursesOf };
