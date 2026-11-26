import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerObstacles, type Obstacle, type Point } from '../geo';
import { registerSeats, seatState, type Seat } from '../bag';
import { SHOPS, shopStore, type Shop } from '../shops';
import { bike, game, player } from '../state';
import { Condiments, registerDineTables, type DineTable } from './Dine';
import { Instances, trs, unitBox, unitCylinder } from './Instances';
import { NameTag, Person, type PersonAnim } from './Person';

/*
 * Street stalls on the pavements of other streets (see shops.ts STALLS): a phở gánh with low tables and plastic
 * stools (sit down and the phở is brought to your table), a bánh mì cart, a cà phê / trà đá corner. Local frame:
 * x to the right of the stall, z toward the road (the stall faces the road); y up from the pavement.
 */
const stalls = () => SHOPS.filter((s) => s.at);
const frame = (s: Shop) => {
  const f = s.at!.facing; const fwd: Point = [Math.sin(f), Math.cos(f)]; const right: Point = [Math.cos(f), -Math.sin(f)];
  return { f, w: (x: number, z: number): Point => [s.at!.p[0] + right[0] * x + fwd[0] * z, s.at!.p[1] + right[1] * x + fwd[1] * z] };
};
/** Low tables (local x, z) of each kind of stall; stools sit either side along z. */
const TABLES: Record<string, [number, number][]> = { pho: [[1.35, 0.15], [-1.35, 0.15]], coffee: [[1.2, 0.15], [-1.2, 0.15]], banhmi: [[1.5, 0.2]], books: [], buncha: [] };
const TABLE_TOP = 0.45, TABLE_HALF = 0.3, STOOL = 0.25, SEAT_OFF = 0.56;

let mats: ReturnType<typeof make> | null = null;
function make() {
  const m = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  return { steel: m('#d9dde0', { roughness: 0.35, metalness: 0.35 }), wood: m('#8a5a34', { roughness: 0.75 }), bamboo: m('#c9a462', { roughness: 0.8 }), basket: m('#a07a3c', { roughness: 0.9 }),
    red: m('#d3302a', { roughness: 0.45 }), blue: m('#2f68c4', { roughness: 0.45 }), glass: new THREE.MeshStandardMaterial({ color: '#dff3ff', roughness: 0.05, transparent: true, opacity: 0.3 }),
    bread: m('#d99a4e'), broth: m('#c88a3c', { roughness: 0.2 }), dark: m('#2b2a28'), steam: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }) };
}
const M = () => (mats ??= make());

function signTexture(s: Shop) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const ctx = c.getContext('2d')!;
  ctx.fillStyle = s.color; ctx.fillRect(0, 0, 256, 192); ctx.strokeStyle = '#f6e2a0'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 244, 180);
  ctx.fillStyle = '#fff3c4'; ctx.textAlign = 'center'; ctx.font = 'bold 50px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText(s.sign, 128, 82, 236);
  ctx.font = '600 18px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillStyle = '#ffffff';
  ctx.fillText(s.name.replace(s.sign, '').trim() || s.street.replace('Phố ', ''), 128, 124, 236);
  ctx.fillText(`${s.items[0].name} ${s.items[0].price / 1000}k`, 128, 156, 236);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function Stall({ s }: { s: Shop }) {
  const m = M(); const fr = useMemo(() => frame(s), [s]);
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: signTexture(s), roughness: 0.6 }), [s]);
  const anim = useRef<PersonAnim>({ mode: 'stand', speed: 0 }).current;
  const tables = TABLES[s.kind];
  const stools = useMemo(() => tables.flatMap(([x, z]) => [-1, 1].map((side) => trs(x, STOOL / 2, z + side * SEAT_OFF, 0, 0.28, STOOL, 0.28))), [tables]);
  const tableTops = useMemo(() => tables.flatMap(([x, z]) => [trs(x, TABLE_TOP - 0.02, z, 0, TABLE_HALF * 2, 0.04, TABLE_HALF * 2), trs(x, (TABLE_TOP - 0.04) / 2, z, 0, 0.05, TABLE_TOP - 0.04, 0.05)]), [tables]);
  // seats, dine tables (phở), the cart as an obstacle
  useEffect(() => {
    const seats: Seat[] = []; const dine: DineTable[] = [];
    tables.forEach(([x, z]) => {
      const pair: Seat[] = [-1, 1].map((side) => ({ p: fr.w(x, z + side * SEAT_OFF), facing: fr.f + (side < 0 ? 0 : Math.PI), height: STOOL, kind: 'stool' }));
      seats.push(...pair);
      if (s.kind === 'pho') dine.push({ shop: s.id, center: fr.w(x, z), top: TABLE_TOP, seats: pair, waiterHome: fr.w(0.6, -0.9), waiter: 'Hằng' });
    });
    const [cx, cz] = fr.w(0, -0.45);
    const obs: Obstacle[] = [{ x: cx, z: cz, hx: 0.8, hz: 0.35, angle: fr.f }];
    const a = registerSeats(seats); const b = registerDineTables(dine); const c = registerObstacles(obs);
    return () => { a(); b(); c(); };
  }, [s, fr, tables]);
  return <group position={[s.at!.p[0], GROUND_HEIGHT, s.at!.p[1]]} rotation={[0, fr.f, 0]}>
    {/* the stall itself */}
    {s.kind === 'pho' && <group position={[0, 0, -0.45]}>
      {/* đòn gánh: a bamboo pole over two baskets, the broth pot on one, bowls and herbs on the other */}
      {[-0.55, 0.55].map((x) => <mesh key={x} position={[x, 0.22, 0]} material={m.basket} castShadow><cylinderGeometry args={[0.26, 0.22, 0.44, 14]} /></mesh>)}
      <mesh position={[-0.55, 0.62, 0]} material={m.steel} castShadow><cylinderGeometry args={[0.24, 0.22, 0.36, 16]} /></mesh>
      <mesh position={[-0.55, 0.81, 0]} material={m.broth}><cylinderGeometry args={[0.22, 0.22, 0.02, 16]} /></mesh>
      <mesh position={[-0.55, 1.25, 0]} material={m.steam}><cylinderGeometry args={[0.16, 0.24, 0.8, 12, 1, true]} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[0.55, 0.47 + i * 0.06, 0]} material={m.steel}><cylinderGeometry args={[0.14, 0.09, 0.06, 14]} /></mesh>)}
      <mesh position={[0, 0.95, 0]} rotation={[0, 0, Math.PI / 2]} material={m.bamboo}><cylinderGeometry args={[0.025, 0.025, 1.7, 8]} /></mesh>
    </group>}
    {s.kind === 'banhmi' && <group position={[0, 0, -0.45]}>
      {/* the glass bánh mì cart */}
      <mesh position={[0, 0.45, 0]} material={m.steel} castShadow><boxGeometry args={[1.4, 0.9, 0.7]} /></mesh>
      <mesh position={[0, 1.13, 0]} material={m.glass}><boxGeometry args={[1.4, 0.46, 0.7]} /></mesh>
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[-0.5 + (i % 6) * 0.2, 1.0 + Math.floor(i / 6) * 0.1, (Math.floor(i / 6) - 0.5) * 0.2]} material={m.bread} scale={[0.09, 0.05, 0.03]}><sphereGeometry args={[1, 10, 6]} /></mesh>)}
      <mesh position={[0, 1.38, 0]} material={m.steel}><boxGeometry args={[1.4, 0.04, 0.7]} /></mesh>
      {[-0.5, 0.5].map((x) => <mesh key={x} position={[x, 0.12, 0.3]} rotation={[0, 0, Math.PI / 2]} material={m.dark}><cylinderGeometry args={[0.12, 0.12, 0.05, 12]} /></mesh>)}
    </group>}
    {s.kind === 'coffee' && <group position={[0, 0, -0.5]}>
      {/* a low wooden shelf with the kettle, phin filters, glasses and a big trà đá jug */}
      <mesh position={[0, 0.35, 0]} material={m.wood} castShadow><boxGeometry args={[1.2, 0.7, 0.5]} /></mesh>
      <mesh position={[-0.35, 0.82, 0]} material={m.steel}><cylinderGeometry args={[0.12, 0.14, 0.24, 14]} /></mesh>
      <mesh position={[0.3, 0.86, 0]} material={m.glass}><cylinderGeometry args={[0.12, 0.12, 0.32, 14]} /></mesh>
      {[0, 1, 2].map((i) => <mesh key={i} position={[-0.05 + i * 0.1, 0.76, 0.1]} material={m.steel}><cylinderGeometry args={[0.035, 0.03, 0.08, 10]} /></mesh>)}
    </group>}
    {/* low tables and plastic stools; condiments on the phở tables */}
    <Instances geometry={unitBox} material={m.steel} matrices={tableTops} />
    <Instances geometry={unitCylinder} material={m.blue} matrices={stools} />
    {s.kind === 'pho' && tables.map(([x, z]) => <group key={`${x}`} position={[x, TABLE_TOP, z]}><Condiments /></group>)}
    {/* the A-board with the stall's name, and the seller */}
    <group position={[-1.0, 0, -0.95]} rotation={[0, 0.25, 0]}>
      <mesh position={[0, 0.6, 0]} rotation={[-0.15, 0, 0]} material={signMat} castShadow><boxGeometry args={[0.7, 0.55, 0.03]} /></mesh>
      <mesh position={[0, 0.3, -0.08]} material={m.wood}><boxGeometry args={[0.04, 0.6, 0.04]} /></mesh>
    </group>
    <group position={[0, 0, -1.0]}>
      <Person anim={anim} shirt={s.kind === 'pho' ? '#f3efe6' : s.kind === 'coffee' ? '#5a7d5a' : '#e2a33a'} pants="#2a2a2a" hat={s.kind === 'pho' ? '#d9c38a' : undefined} seed={60 + s.id.length * 7} />
      <NameTag name={s.seller} role={s.role} y={1.85} />
    </group>
  </group>;
}

/** Buying at a stall (E near the cart); sitting at a phở stall's table opens the order sheet (Seats.tsx). */
export function StreetStalls() {
  const list = useMemo(stalls, []);
  useFrame(() => {
    if (player.seat || bike.riding || game.get().phase !== 'none' || shopStore.get().counter || seatState.mine) return;
    for (const s of list) {
      const d = Math.hypot(player.position.x - s.at!.p[0], player.position.z - s.at!.p[1]);
      if (d < 2.2) { game.offer({ id: `stall-${s.id}`, text: `Mua ở ${s.name} (${s.seller})`, key: 'E', priority: 5, run: () => { if (document.pointerLockElement) document.exitPointerLock(); shopStore.set({ counter: s.id, dine: false }); } }); break; }
    }
  });
  return <>{list.map((s) => <Stall key={s.id} s={s} />)}</>;
}
