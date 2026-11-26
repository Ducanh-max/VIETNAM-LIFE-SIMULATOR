import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { bagStore } from '../bag';
import { shopById, type ShopId } from '../shops';
import type { MenuId } from '../state';
import { Bottle } from './food';

/*
 * Things in the player's hands, at the chibi's scale (the bún chả props in food.tsx use the same scale): a crusty
 * bánh mì with its filling, a bowl of phở with noodles and herbs, quẩy, iced cà phê in a glass, egg coffee in a cup,
 * trà đá, a bottle of soy milk, the bún chả take-away, cans, and books (closed in the hand, open when reading).
 * Food goes down as it is eaten (progress from the bag store).
 */
let mats: ReturnType<typeof make> | null = null;
function make() {
  const m = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  return {
    crust: m('#c9893f', { roughness: 0.75 }), crumb: m('#f2dfb6'), pate: m('#9a5a3c'), herb: m('#3f8f3a'), pickle: m('#e98a3a'), meat: m('#d98c8c'), egg: m('#f7d24a'),
    bowl: m('#f4f1ea', { roughness: 0.35 }), rim: m('#2f68c4'), broth: m('#c8893a', { roughness: 0.15 }), noodle: m('#f6f1e0'), beef: m('#b8574a'), onion: m('#9fd36b'),
    glass: new THREE.MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.05, transparent: true, opacity: 0.35 }), coffee: m('#2b170d', { roughness: 0.1 }), milkCoffee: m('#7a4a2a', { roughness: 0.1 }),
    tea: new THREE.MeshStandardMaterial({ color: '#b5701d', roughness: 0.1, transparent: true, opacity: 0.8 }), ice: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.6 }),
    cup: m('#f6f3ec', { roughness: 0.3 }), foam: m('#f2d27a', { roughness: 0.4 }), soy: m('#f3ead2'), cap: m('#2f8a4a'), quay: m('#d99a3a', { roughness: 0.7 }),
    paper: m('#fbf8ef', { roughness: 0.9 }), bag: m('#f0ece2', { roughness: 0.9 }),
  };
}
const M = () => (mats ??= make());
const BOOK_COLORS: Record<string, string> = { demen: '#2f8a4a', sodo: '#b3261e', kieu: '#8a6a2f', hanoi36: '#2f5a8a', map: '#e0a72a' };

function coverTexture(title: string, color: string) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 176; const ctx = c.getContext('2d')!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 176);
  ctx.strokeStyle = 'rgba(255,240,200,.8)'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, 112, 160);
  ctx.fillStyle = '#fff6dc'; ctx.textAlign = 'center'; ctx.font = 'bold 15px "Be Vietnam Pro", Arial, sans-serif';
  const words = title.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 12) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  lines.push(cur.trim());
  lines.forEach((l, i) => ctx.fillText(l, 64, 60 + i * 20));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A book: closed (in the hand) or open with two pages facing up. */
function Book({ id, title, open }: { id: string; title: string; open: boolean }) {
  const cover = useMemo(() => new THREE.MeshStandardMaterial({ map: coverTexture(title, BOOK_COLORS[id] ?? '#6b2f6b'), roughness: 0.7 }), [id, title]);
  const side = useMemo(() => new THREE.MeshStandardMaterial({ color: BOOK_COLORS[id] ?? '#6b2f6b', roughness: 0.7 }), [id]);
  const m = M();
  const W = 0.11, H = 0.15, T = 0.022;
  if (!open) return <mesh material={[side, side, side, side, cover, side]} castShadow><boxGeometry args={[W, H, T]} /></mesh>;
  return <group rotation={[-Math.PI / 2, 0, 0]}>
    {[-1, 1].map((s) => <group key={s} rotation={[0, s * 0.18, 0]}>
      <mesh position={[s * W / 2, 0, -0.004]} material={side}><boxGeometry args={[W, H, 0.004]} /></mesh>
      <mesh position={[s * (W / 2 - 0.004), 0, 0.004]} material={m.paper}><boxGeometry args={[W - 0.01, H - 0.01, 0.012]} /></mesh>
    </group>)}
  </group>;
}

function BanhMi({ id }: { id: string }) {
  const m = M(); const g = useRef<THREE.Group>(null);
  useFrame(() => { const h = bagStore.get().held; if (g.current) g.current.scale.x = 1 - 0.75 * (h?.progress ?? 0); });
  return <group ref={g} rotation={[0, 0, 0.1]}>
    <mesh material={m.crust} scale={[0.11, 0.035, 0.04]} castShadow><sphereGeometry args={[1, 16, 10]} /></mesh>
    {/* the split loaf with its filling showing */}
    <mesh position={[0, 0.02, 0.005]} material={id === 'trung' ? m.egg : m.pate} scale={[0.09, 0.012, 0.022]}><sphereGeometry args={[1, 12, 6]} /></mesh>
    <mesh position={[0.02, 0.03, 0.012]} material={m.herb} scale={[0.05, 0.01, 0.02]}><sphereGeometry args={[1, 8, 5]} /></mesh>
    {id !== 'trung' && <mesh position={[-0.03, 0.028, 0.01]} material={m.pickle} scale={[0.04, 0.008, 0.016]}><sphereGeometry args={[1, 8, 5]} /></mesh>}
    {id === 'dacbiet' && <mesh position={[0.0, 0.026, -0.008]} material={m.meat} scale={[0.07, 0.008, 0.016]}><sphereGeometry args={[1, 8, 5]} /></mesh>}
    <mesh position={[0.06, -0.004, 0]} material={m.paper} scale={[0.05, 0.04, 0.045]}><sphereGeometry args={[1, 10, 6, 0, Math.PI]} /></mesh>
  </group>;
}

function Bowl({ shop, id }: { shop: ShopId; id: string }) {
  const m = M(); const level = useRef<THREE.Group>(null);
  useFrame(() => { const h = bagStore.get().held; if (level.current) { const p = h?.progress ?? 0; level.current.position.y = 0.045 - p * 0.03; level.current.scale.setScalar(1 - p * 0.25); } });
  const r = 0.07;
  return <group>
    <mesh position={[0, 0.03, 0]} material={m.bowl} castShadow><cylinderGeometry args={[r, r * 0.55, 0.06, 20, 1, true]} /></mesh>
    <mesh position={[0, 0.002, 0]} material={m.bowl}><cylinderGeometry args={[r * 0.55, r * 0.55, 0.004, 16]} /></mesh>
    <mesh position={[0, 0.058, 0]} material={m.rim} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r, 0.003, 6, 24]} /></mesh>
    <group ref={level}>
      <mesh material={shop === 'buncha' ? m.pate : m.broth}><cylinderGeometry args={[r * 0.92, r * 0.92, 0.004, 20]} /></mesh>
      {shop !== 'buncha' && Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[Math.cos(i) * 0.03, 0.004, Math.sin(i * 1.7) * 0.03]} rotation={[0, i, 0]} material={m.noodle}><boxGeometry args={[0.07, 0.004, 0.006]} /></mesh>)}
      {[0, 1, 2].map((i) => <mesh key={`b${i}`} position={[-0.02 + i * 0.022, 0.006, 0.012 - i * 0.01]} rotation={[0, i * 0.7, 0]} material={shop === 'buncha' ? m.crust : m.beef}><boxGeometry args={[0.03, 0.005, 0.02]} /></mesh>)}
      {[0, 1, 2, 3].map((i) => <mesh key={`h${i}`} position={[Math.cos(i * 1.6) * 0.035, 0.008, Math.sin(i * 1.6) * 0.035]} material={m.onion}><boxGeometry args={[0.012, 0.004, 0.012]} /></mesh>)}
      {id === 'dacbiet' && <mesh position={[0.025, 0.01, -0.02]} material={m.egg} scale={[0.016, 0.01, 0.016]}><sphereGeometry args={[1, 10, 6]} /></mesh>}
    </group>
  </group>;
}

function Glass({ liquid, ice = true, level = 1 }: { liquid: THREE.Material; ice?: boolean; level?: number }) {
  const m = M(); const fill = useRef<THREE.Mesh>(null);
  useFrame(() => { const h = bagStore.get().held; const p = (h?.progress ?? 0); if (fill.current) { const k = Math.max(0.05, level * (1 - p)); fill.current.scale.y = k; fill.current.position.y = 0.005 + 0.045 * k; } });
  return <group>
    <mesh position={[0, 0.05, 0]} material={m.glass}><cylinderGeometry args={[0.032, 0.027, 0.1, 16, 1, true]} /></mesh>
    <mesh ref={fill} position={[0, 0.05, 0]} material={liquid}><cylinderGeometry args={[0.029, 0.025, 0.09, 16]} /></mesh>
    {ice && [0, 1, 2].map((i) => <mesh key={i} position={[Math.cos(i * 2) * 0.012, 0.07 + i * 0.008, Math.sin(i * 2) * 0.012]} rotation={[i, i * 0.5, 0]} material={m.ice}><boxGeometry args={[0.018, 0.018, 0.018]} /></mesh>)}
  </group>;
}

/** The model for a held item (from the shop data). */
export function HeldModel({ shop, item, open = false }: { shop: ShopId; item: string; open?: boolean }) {
  const m = M();
  const it = shopById(shop).items.find((x) => x.id === item);
  if (!it) return null;
  if (it.book) return <Book id={item} title={it.name} open={open} />;
  if (shop === 'banhmi') return item === 'suadau'
    ? <group><mesh position={[0, 0.05, 0]} material={m.soy}><cylinderGeometry args={[0.022, 0.024, 0.1, 14]} /></mesh><mesh position={[0, 0.105, 0]} material={m.cap}><cylinderGeometry args={[0.012, 0.012, 0.014, 10]} /></mesh></group>
    : <BanhMi id={item} />;
  if (shop === 'pho') {
    if (item === 'quay') return <group rotation={[0, 0, 0.2]}>{[-1, 1].map((s) => <mesh key={s} position={[0, 0, s * 0.012]} material={m.quay} scale={[0.09, 0.012, 0.012]}><sphereGeometry args={[1, 10, 6]} /></mesh>)}</group>;
    if (item === 'tra') return <Glass liquid={m.tea} />;
    return <Bowl shop="pho" id={item} />;
  }
  if (shop === 'coffee') {
    if (item === 'trung') return <group>
      <mesh position={[0, 0.03, 0]} material={m.cup}><cylinderGeometry args={[0.03, 0.024, 0.06, 16, 1, true]} /></mesh>
      <mesh position={[0, 0.058, 0]} material={m.foam}><cylinderGeometry args={[0.028, 0.028, 0.008, 16]} /></mesh>
      <mesh position={[0, 0.002, 0]} material={m.cup}><cylinderGeometry args={[0.05, 0.05, 0.004, 18]} /></mesh>
    </group>;
    return <Glass liquid={item === 'tra' ? m.tea : item === 'nau' ? m.milkCoffee : m.coffee} />;
  }
  if (shop === 'buncha') {
    if (item === 'buncha') return <Bowl shop="buncha" id={item} />;
    return <Bottle id={item as Exclude<MenuId, 'buncha'>} open />;
  }
  return null;
}
