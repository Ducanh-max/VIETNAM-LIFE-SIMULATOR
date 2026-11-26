import { useEffect, useMemo, useRef } from 'react';
import { registerSeats, type Seat } from '../bag';
import { Condiments, registerDineTables, type DineTable } from './Dine';
import * as THREE from 'three';
import { RESTAURANT, restaurantToWorld } from '../osm';
import { SHOPS, type Shop } from '../shops';
import { Instances, trs, unitBox } from './Instances';
import { NameTag, Person, type PersonAnim } from './Person';
import { facadeTexture, rng } from './textures';

/*
 * The four tube houses either side of Bún chả Đức Anh, now open for business: cà phê, bánh mì, phở bò and a
 * bookshop. Each is a narrow nhà ống with its shutter rolled up, a 7,5 m deep shop room (tiled floor, counter,
 * goods, strip lights, the seller) and the family's storeys above. Drawn in the restaurant's local frame
 * (x along the street, +z out of the shopfront).
 */
const D = RESTAURANT.depth;
const HD = D / 2;
export const SHOP_G = 3.4; // ground-floor height
export const SHOP_DEPTH = 7.5; // depth of the open shop room
const PHO_TOP = 0.62; // the phở tables
const OPEN_H = 2.8; // height of the shop opening under the signboard
const FLOORS: Record<string, { floors: number; variant: number }> = { coffee: { floors: 3, variant: 1 }, banhmi: { floors: 4, variant: 0 }, pho: { floors: 5, variant: 2 }, books: { floors: 3, variant: 1 } };
export const walkInShops = SHOPS.filter((s) => s.walkIn);

/** Blocking rectangles [x, z, hx, hz] in the restaurant frame: side walls, the closed back of the house, counters. */
export function shopObstacles(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const s of walkInShops) {
    const hw = s.w / 2;
    out.push([s.x - hw + 0.06, HD - SHOP_DEPTH / 2, 0.08, SHOP_DEPTH / 2], [s.x + hw - 0.06, HD - SHOP_DEPTH / 2, 0.08, SHOP_DEPTH / 2]);
    out.push([s.x, -HD + (D - SHOP_DEPTH) / 2, hw, (D - SHOP_DEPTH) / 2]); // the house behind the shop room
    for (const c of counters(s)) out.push(c);
  }
  return out;
}
/** Counters and fittings (restaurant frame) per shop. */
function counters(s: Shop): [number, number, number, number][] {
  const back = HD - SHOP_DEPTH;
  switch (s.id) {
    case 'banhmi': return [[s.x - 0.9, HD - 1.4, 0.75, 0.4], [s.x + 0.6, back + 1.6, 1.3, 0.35]];
    case 'pho': return [[s.x + 1.0, HD - 1.6, 0.85, 0.45], [s.x - 1.0, back + 2.4, 0.45, 0.45], [s.x - 1.0, back + 4.6, 0.45, 0.45]];
    case 'books': return [[s.x - 1.75, back + SHOP_DEPTH / 2, 0.22, SHOP_DEPTH / 2 - 0.6], [s.x + 1.75, back + SHOP_DEPTH / 2, 0.22, SHOP_DEPTH / 2 - 0.6], [s.x, back + 3.6, 0.6, 0.9], [s.x, back + 1.0, 1.0, 0.35]];
    case 'coffee': return [[s.x, back + 1.2, 1.4, 0.4], [s.x - 1.0, HD - 2.0, 0.3, 0.3], [s.x + 1.0, HD - 3.6, 0.3, 0.3]];
    default: return [];
  }
}
/** Where the seller stands (restaurant frame) and which way they face. */
export function sellerSpot(s: Shop): [number, number, number] {
  const back = HD - SHOP_DEPTH;
  switch (s.id) {
    case 'banhmi': return [s.x + 0.15, HD - 2.0, -0.5];
    case 'pho': return [s.x + 1.0, HD - 2.6, 0];
    case 'books': return [s.x, back + 0.4, 0];
    default: return [s.x - 0.4, back + 0.5, 0];
  }
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function signTexture(s: Shop) {
  return canvasTex(512, 128, (ctx) => {
    ctx.fillStyle = s.color; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#f6e2a0'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#fff3c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 60px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText(s.sign, 256, 54, 480);
    ctx.font = '600 20px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(s.tagline.toUpperCase(), 256, 100, 480);
  });
}
function priceBoard(s: Shop) {
  return canvasTex(256, 320, (ctx) => {
    ctx.fillStyle = '#20302a'; ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = '#d9b46a'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 244, 308);
    ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center'; ctx.font = 'bold 28px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText(s.sign, 128, 44, 230);
    ctx.textAlign = 'left'; ctx.font = '600 17px "Be Vietnam Pro", Arial, sans-serif';
    s.items.slice(0, 6).forEach((it, i) => { ctx.fillStyle = '#ffffff'; ctx.fillText(it.name, 18, 90 + i * 40, 160); ctx.textAlign = 'right'; ctx.fillStyle = '#ffd35c'; ctx.fillText(`${it.price / 1000}k`, 238, 90 + i * 40); ctx.textAlign = 'left'; });
  });
}

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const tile = canvasTex(128, 128, (ctx) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? '#d8cdb8' : '#efe7d6'; ctx.fillRect(x * 32, y * 32, 32, 32); } });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(3.5, 6);
  return {
    floor: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.55 }),
    wall: new THREE.MeshStandardMaterial({ color: '#f1ead8', roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#f7f4ec', roughness: 0.9 }),
    side: new THREE.MeshStandardMaterial({ color: '#d4c8b0', roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: '#d9dde0', roughness: 0.35, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: '#dff3ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.7 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#4a2e1c', roughness: 0.7 }),
    bread: new THREE.MeshStandardMaterial({ color: '#d99a4e', roughness: 0.6 }),
    tube: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4fbff', emissiveIntensity: 1.6 }),
    shutter: new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.5, metalness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: '#d3302a', roughness: 0.45 }),
    blue: new THREE.MeshStandardMaterial({ color: '#2f68c4', roughness: 0.45 }),
    bowl: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.4 }),
    broth: new THREE.MeshStandardMaterial({ color: '#c88a3c', roughness: 0.2 }),
    book: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
    steam: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }),
  };
}
const S = () => (shared ??= makeShared());

function B({ p, s, m }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material }) {
  return <mesh position={p} scale={s} geometry={unitBox} material={m} castShadow receiveShadow />;
}

function Stools({ at }: { at: [number, number][] }) {
  const m = S();
  return <>{at.map(([x, z], i) => <mesh key={i} position={[x, 0.2, z]} material={i % 2 ? m.blue : m.red} castShadow><cylinderGeometry args={[0.13, 0.15, 0.4, 10]} /></mesh>)}</>;
}

function Goods({ s }: { s: Shop }) {
  const m = S(); const back = HD - SHOP_DEPTH;
  const books = useMemo(() => {
    if (s.id !== 'books') return { mats: [] as THREE.Matrix4[], colors: [] as THREE.Color[] };
    const r = rng(77); const mats: THREE.Matrix4[] = []; const colors: THREE.Color[] = [];
    const palette = ['#b3261e', '#2f68c4', '#1f8a5b', '#e0a72a', '#6b2f6b', '#2b2a28', '#d9d2c0', '#c8641e'];
    for (const side of [-1, 1]) for (let shelf = 0; shelf < 5; shelf++) {
      let z = back + 0.8;
      while (z < HD - 0.9) { const t = 0.04 + r() * 0.05; const h = 0.22 + r() * 0.1; mats.push(trs(s.x + side * 1.72, 0.3 + shelf * 0.42 + h / 2, z, 0, 0.2, h, t)); colors.push(new THREE.Color(palette[Math.floor(r() * palette.length)])); z += t + 0.01; }
    }
    for (let i = 0; i < 18; i++) { mats.push(trs(s.x - 0.45 + (i % 6) * 0.18, 0.86 + Math.floor(i / 6) * 0.04, back + 3.6 - 0.4 + (Math.floor(i / 6)) * 0.35, (r() - 0.5) * 0.3, 0.15, 0.035, 0.22)); colors.push(new THREE.Color(palette[i % palette.length])); }
    return { mats, colors };
  }, [s]);
  const loaves = useMemo(() => Array.from({ length: 14 }, (_, i) => trs(s.x - 1.35 + (i % 7) * 0.13, 1.05 + Math.floor(i / 7) * 0.1, HD - 1.45 + (Math.floor(i / 7) - 0.5) * 0.18, 0, 0.09, 0.07, 0.3)), [s]);
  switch (s.id) {
    case 'banhmi': return <group>
      {/* the glass bánh mì cart at the front, loaves stacked inside, pate and fillings on top */}
      <B p={[s.x - 0.9, 0.45, HD - 1.4]} s={[1.5, 0.9, 0.8]} m={m.steel} />
      <B p={[s.x - 0.9, 1.15, HD - 1.4]} s={[1.5, 0.5, 0.8]} m={m.glass} />
      <Instances geometry={unitBox} material={m.bread} matrices={loaves} />
      <B p={[s.x - 0.9, 1.42, HD - 1.4]} s={[1.5, 0.04, 0.8]} m={m.steel} />
      {[-0.4, 0, 0.4].map((dx) => <mesh key={dx} position={[s.x - 0.9 + dx, 1.5, HD - 1.4]} material={dx ? m.red : m.broth}><cylinderGeometry args={[0.1, 0.1, 0.12, 12]} /></mesh>)}
      <B p={[s.x + 0.6, 0.45, back + 1.6]} s={[2.6, 0.9, 0.7]} m={m.wood} />
      <Stools at={[[s.x + 1.2, HD - 2.4], [s.x + 0.6, HD - 3.4]]} />
    </group>;
    case 'pho': return <group>
      {/* the phở counter at the front: a big pot of broth, bowls, herbs; two low tables inside */}
      <B p={[s.x + 1.0, 0.45, HD - 1.6]} s={[1.7, 0.9, 0.9]} m={m.steel} />
      <mesh position={[s.x + 1.3, 1.2, HD - 1.6]} material={m.steel} castShadow><cylinderGeometry args={[0.32, 0.3, 0.6, 18]} /></mesh>
      <mesh position={[s.x + 1.3, 1.49, HD - 1.6]} material={m.broth}><cylinderGeometry args={[0.3, 0.3, 0.02, 18]} /></mesh>
      <mesh position={[s.x + 1.3, 2.0, HD - 1.6]} material={m.steam}><cylinderGeometry args={[0.22, 0.32, 0.9, 12, 1, true]} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[s.x + 0.6, 0.95 + i * 0.07, HD - 1.6]} material={m.bowl}><cylinderGeometry args={[0.13, 0.08, 0.07, 14]} /></mesh>)}
      {[2.4, 4.6].map((dz) => <group key={dz}>
        <B p={[s.x - 1.0, PHO_TOP / 2, back + dz]} s={[0.8, PHO_TOP, 0.8]} m={m.steel} />
        <group position={[s.x - 1.0, PHO_TOP, back + dz]} rotation={[0, Math.PI / 2, 0]}><Condiments /></group>
        <Stools at={[[s.x - 1.0, back + dz - 0.7], [s.x - 1.0, back + dz + 0.7], [s.x - 0.2, back + dz]]} />
      </group>)}
    </group>;
    case 'books': return <group>
      {/* shelves down both walls, a table of new titles in the middle, the till at the back */}
      {[-1, 1].map((side) => <group key={side}>
        <B p={[s.x + side * 1.75, 1.1, back + SHOP_DEPTH / 2]} s={[0.36, 2.2, SHOP_DEPTH - 1.2]} m={m.darkWood} />
      </group>)}
      <B p={[s.x, 0.42, back + 3.6]} s={[1.2, 0.84, 1.8]} m={m.wood} />
      <Instances geometry={unitBox} material={m.book} matrices={books.mats} colors={books.colors} castShadow={false} />
      <B p={[s.x, 0.5, back + 1.0]} s={[2.0, 1.0, 0.6]} m={m.wood} />
    </group>;
    default: return <group>
      {/* cà phê: counter with phin filters and a kettle at the back, low tables and plastic stools */}
      <B p={[s.x, 0.5, back + 1.2]} s={[2.8, 1.0, 0.7]} m={m.wood} />
      {[-0.8, -0.5, -0.2].map((dx) => <mesh key={dx} position={[s.x + dx, 1.08, back + 1.2]} material={m.steel}><cylinderGeometry args={[0.05, 0.04, 0.12, 10]} /></mesh>)}
      <mesh position={[s.x + 0.7, 1.12, back + 1.2]} material={m.steel}><cylinderGeometry args={[0.12, 0.14, 0.22, 14]} /></mesh>
      {[[-1.0, HD - 2.0], [1.0, HD - 3.6]].map(([dx, z]) => <group key={z}>
        <B p={[s.x + dx, 0.22, z]} s={[0.55, 0.44, 0.55]} m={m.wood} />
        <Stools at={[[s.x + dx - 0.5, z], [s.x + dx + 0.5, z]]} />
      </group>)}
    </group>;
  }
}

function OpenShop({ s }: { s: Shop }) {
  const m = S();
  const f = FLOORS[s.id];
  const h = f.floors * SHOP_G;
  const mats = useMemo(() => {
    const tex = facadeTexture('tube', f.variant, f.floors).clone(); tex.needsUpdate = true;
    tex.repeat.set(1, (f.floors - 1) / f.floors); tex.offset.set(0, 1 / f.floors); // the storeys above the shop only
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88 });
    const sign = signTexture(s);
    return { upper: [m.side, m.side, m.side, m.side, front, m.side], sign: new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.25 }), board: new THREE.MeshStandardMaterial({ map: priceBoard(s), roughness: 0.7 }) };
  }, [s, f, m]);
  const anim = useRef<PersonAnim>({ mode: 'stand', speed: 0 }).current;
  const hw = s.w / 2; const back = HD - SHOP_DEPTH; const zc = HD - SHOP_DEPTH / 2;
  const [sx, sz, sr] = sellerSpot(s);
  return <group>
    {/* storeys above, the closed back of the house, the wall over the opening */}
    <mesh position={[s.x, SHOP_G + (h - SHOP_G) / 2, 0]} material={mats.upper} castShadow receiveShadow><boxGeometry args={[s.w - 0.1, h - SHOP_G, D]} /></mesh>
    <B p={[s.x, SHOP_G / 2, -HD + (D - SHOP_DEPTH) / 2]} s={[s.w - 0.1, SHOP_G, D - SHOP_DEPTH]} m={m.side} />
    <B p={[s.x, (OPEN_H + SHOP_G) / 2, HD - 0.08]} s={[s.w - 0.1, SHOP_G - OPEN_H, 0.16]} m={m.side} />
    {/* the shop room */}
    <mesh position={[s.x, 0.03, zc]} rotation={[-Math.PI / 2, 0, 0]} material={m.floor} receiveShadow><planeGeometry args={[s.w - 0.2, SHOP_DEPTH]} /></mesh>
    <mesh position={[s.x, OPEN_H + 0.3, zc]} rotation={[Math.PI / 2, 0, 0]} material={m.ceiling}><planeGeometry args={[s.w - 0.2, SHOP_DEPTH]} /></mesh>
    {[-1, 1].map((side) => <B key={side} p={[s.x + side * (hw - 0.06), SHOP_G / 2, zc]} s={[0.12, SHOP_G, SHOP_DEPTH]} m={m.wall} />)}
    <B p={[s.x, SHOP_G / 2, back + 0.06]} s={[s.w - 0.1, SHOP_G, 0.12]} m={m.wall} />
    {[-2.2, 0.2, 2.6].map((dz) => <B key={dz} p={[s.x, OPEN_H + 0.27, zc + dz]} s={[0.06, 0.04, 1.1]} m={m.tube} />)}
    {/* rolled-up shutter, signboard, price board */}
    <mesh position={[s.x, OPEN_H + 0.12, HD - 0.12]} rotation={[0, 0, Math.PI / 2]} material={m.shutter}><cylinderGeometry args={[0.16, 0.16, s.w - 0.3, 12]} /></mesh>
    <mesh position={[s.x, OPEN_H + 0.35, HD + 0.06]} material={mats.sign} castShadow><boxGeometry args={[s.w - 0.25, 0.85, 0.1]} /></mesh>
    <mesh position={[s.x + (s.id === 'banhmi' || s.id === 'pho' ? -1 : 1) * (hw - 0.13), 1.8, back + 3.0]} rotation={[0, (s.id === 'banhmi' || s.id === 'pho' ? 1 : -1) * Math.PI / 2, 0]} material={mats.board}><planeGeometry args={[0.9, 1.12]} /></mesh>
    <Goods s={s} />
    <group position={[sx, 0, sz]} rotation={[0, sr, 0]}>
      <Person anim={anim} shirt={s.id === 'pho' ? '#f3efe6' : s.id === 'books' ? '#3c5e8a' : s.id === 'coffee' ? '#8a4f6e' : '#e2a33a'} pants="#2a2a2a" apron={s.id === 'pho' || s.id === 'banhmi' ? '#3a3a3a' : undefined} seed={20 + s.x * 3} />
      <NameTag name={s.seller} role={s.role} y={1.85} />
    </group>
  </group>;
}

/** The plastic stools in the shops, as seats: restaurant-frame x, z and the way the sitter faces (local dx, dz). */
function shopStools(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const s of walkInShops) {
    const back = HD - SHOP_DEPTH;
    if (s.id === 'banhmi') out.push([s.x + 1.2, HD - 2.4, 0, -1], [s.x + 0.6, HD - 3.4, 0, -1]);
    if (s.id === 'pho') for (const dz of [2.4, 4.6]) out.push([s.x - 1.0, back + dz - 0.7, 0, 1], [s.x - 1.0, back + dz + 0.7, 0, -1], [s.x - 0.2, back + dz, -1, 0]);
    if (s.id === 'coffee') for (const [dx, z] of [[-1.0, HD - 2.0], [1.0, HD - 3.6]]) out.push([s.x + dx - 0.5, z, 1, 0], [s.x + dx + 0.5, z, -1, 0]);
  }
  return out;
}

export function StreetShops() {
  useEffect(() => {
    const seats = shopStools().map(([x, z, dx, dz]): Seat => ({ p: restaurantToWorld(x, z), facing: RESTAURANT.angle + Math.atan2(dx, dz), height: 0.4, kind: 'stool' }));
    // the phở shop's two tables: their three stools each, the waiter starting by the counter
    const pho = walkInShops.find((s) => s.id === 'pho');
    const dine: DineTable[] = [];
    if (pho) for (const dz of [2.4, 4.6]) {
      const c = restaurantToWorld(pho.x - 1.0, HD - SHOP_DEPTH + dz);
      dine.push({ shop: 'pho', center: c, top: PHO_TOP, seats: seats.filter((st) => Math.hypot(st.p[0] - c[0], st.p[1] - c[1]) < 0.9), waiterHome: restaurantToWorld(pho.x + 0.2, HD - 3.2), waiter: 'Chị Mai' });
    }
    const a = registerSeats(seats); const b = registerDineTables(dine);
    return () => { a(); b(); };
  }, []);
  return <>{walkInShops.map((s) => <OpenShop key={s.id} s={s} />)}</>;
}
