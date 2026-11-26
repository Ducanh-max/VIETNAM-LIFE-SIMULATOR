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

function Stools({ at, red = false }: { at: [number, number][]; red?: boolean }) {
  const m = S();
  return <>{at.map(([x, z], i) => <group key={i} position={[x, 0, z]}>
    <mesh position={[0, 0.38, 0]} material={red || i % 2 === 0 ? m.red : m.blue} castShadow><boxGeometry args={[0.3, 0.04, 0.3]} /></mesh>
    <mesh position={[0, 0.18, 0]} material={red || i % 2 === 0 ? m.red : m.blue}><cylinderGeometry args={[0.12, 0.16, 0.36, 4, 1, true]} /></mesh>
  </group>)}</>;
}

/*
 * The phở shop's dining room, after the owner's reference picture: pink-beige plaster over a grey wainscot,
 * patterned encaustic floor tiles, a dark pendant lamp with a warm bulb over the tables, a cream "Phở Hà Nội" sign
 * with a red border and a steaming bowl, a framed painting of Tháp Rùa on Hồ Gươm, a hanging pothos in the corner
 * and a chalkboard menu with the shop's prices.
 */
function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
let phoMats: Record<string, THREE.Material> | null = null;
function phoMaterials(s: Shop) {
  if (phoMats) return phoMats;
  const tile = tex(128, 128, (c) => {
    c.fillStyle = '#e9e6e0'; c.fillRect(0, 0, 128, 128);
    for (const [ox, oy] of [[0, 0], [64, 0], [0, 64], [64, 64]]) {
      c.fillStyle = '#7d8590'; c.beginPath(); c.moveTo(ox + 32, oy + 6); c.lineTo(ox + 58, oy + 32); c.lineTo(ox + 32, oy + 58); c.lineTo(ox + 6, oy + 32); c.closePath(); c.fill();
      c.fillStyle = '#e9e6e0'; c.beginPath(); c.arc(ox + 32, oy + 32, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#9aa1aa'; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.ellipse(ox + 32 + Math.cos(a) * 7, oy + 32 + Math.sin(a) * 7, 6, 3, a, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = 'rgba(80,80,80,.35)'; c.strokeRect(ox + 0.5, oy + 0.5, 63, 63);
    }
  }, [6, 11]);
  const sign = tex(512, 176, (c) => {
    c.fillStyle = '#fbf1dc'; c.fillRect(0, 0, 512, 176);
    c.strokeStyle = '#c0281c'; c.lineWidth = 12; c.strokeRect(8, 8, 496, 160); c.lineWidth = 3; c.strokeRect(22, 22, 468, 132);
    // the steaming bowl
    c.fillStyle = '#c0281c'; c.beginPath(); c.ellipse(105, 96, 58, 12, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(47, 96); c.quadraticCurveTo(105, 165, 163, 96); c.closePath(); c.fill();
    c.fillStyle = '#f2c46a'; c.beginPath(); c.ellipse(105, 96, 50, 8, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c0281c'; c.lineWidth = 5; for (const x of [88, 105, 122]) { c.beginPath(); c.moveTo(x, 78); c.bezierCurveTo(x - 10, 64, x + 10, 54, x, 38); c.stroke(); }
    c.lineWidth = 4; c.beginPath(); c.moveTo(150, 80); c.lineTo(205, 52); c.stroke();
    c.fillStyle = '#c0281c'; c.font = 'italic bold 74px "Playfair Display", Georgia, serif'; c.textBaseline = 'middle'; c.fillText('Phở Hà Nội', 196, 96, 296);
  });
  const painting = tex(256, 192, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#9cc8e8'); g.addColorStop(0.55, '#d8ecf2'); g.addColorStop(0.56, '#5f8f7a'); g.addColorStop(1, '#3f6e62'); c.fillStyle = g; c.fillRect(0, 0, 256, 192);
    c.fillStyle = '#3f7a3a'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(i * 32, 104, 22 + (i % 3) * 6, 0, Math.PI * 2); c.fill(); }
    // Tháp Rùa on its island
    c.fillStyle = '#5e7a3f'; c.beginPath(); c.ellipse(128, 132, 46, 8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#efe8d8'; c.fillRect(104, 92, 48, 38); c.fillRect(112, 70, 32, 22); c.fillRect(118, 54, 20, 16);
    c.fillStyle = '#6b5a4a'; for (const [x, y, w, h] of [[110, 104, 8, 14], [124, 104, 8, 14], [138, 104, 8, 14], [118, 76, 6, 10], [132, 76, 6, 10]]) { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + 3); c.arc(x + w / 2, y + 3, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 6; i++) c.fillRect(40 + i * 30, 150 + (i % 2) * 10, 22, 2);
    c.fillStyle = 'rgba(239,232,216,.45)'; c.fillRect(110, 140, 36, 18);
  });
  const board = tex(320, 420, (c) => {
    c.fillStyle = '#26282a'; c.fillRect(0, 0, 320, 420);
    c.strokeStyle = '#e8b422'; c.lineWidth = 16; c.strokeRect(8, 8, 304, 404);
    c.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % 300 + 10, (i * 97) % 400 + 10, 40, 2);
    c.fillStyle = '#f4f1e8'; c.font = 'italic bold 66px "Be Vietnam Pro", Georgia, serif'; c.fillText('Phở', 38, 96);
    c.strokeStyle = '#f2b636'; c.lineWidth = 4; c.beginPath(); c.moveTo(40, 112); c.quadraticCurveTo(110, 104, 170, 116); c.stroke();
    c.strokeStyle = '#f4f1e8'; c.lineWidth = 3; c.beginPath(); c.ellipse(240, 92, 40, 9, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(200, 92); c.quadraticCurveTo(240, 145, 280, 92); c.stroke();
    for (const x of [228, 242, 256]) { c.beginPath(); c.moveTo(x, 76); c.bezierCurveTo(x - 6, 64, x + 6, 56, x, 44); c.stroke(); }
    c.font = 'italic 34px "Be Vietnam Pro", Georgia, serif';
    s.items.filter((it) => it.hunger >= 40).slice(0, 4).forEach((it, i) => { c.fillStyle = '#f4f1e8'; c.fillText(it.name, 30, 178 + i * 58, 200); c.fillStyle = '#f2b636'; c.textAlign = 'right'; c.fillText(`${it.price / 1000}k`, 292, 178 + i * 58); c.textAlign = 'left'; });
  });
  return (phoMats = {
    floor: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.5 }),
    plaster: new THREE.MeshStandardMaterial({ color: '#e7cfc4', roughness: 0.95 }),
    wainscot: new THREE.MeshStandardMaterial({ color: '#9a9c9c', roughness: 0.8 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.6 }),
    painting: new THREE.MeshStandardMaterial({ map: painting, roughness: 0.7 }),
    board: new THREE.MeshStandardMaterial({ map: board, roughness: 0.85 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#2b2e30', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }),
    bulb: new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffcc6a', emissiveIntensity: 2.4 }),
    pot: new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#7fb33a', roughness: 0.6, side: THREE.DoubleSide }),
    leaf2: new THREE.MeshStandardMaterial({ color: '#a8c84a', roughness: 0.6, side: THREE.DoubleSide }),
  });
}
function PhoInterior({ s }: { s: Shop }) {
  const m = phoMaterials(s);
  const hw = s.w / 2; const back = HD - SHOP_DEPTH; const zc = HD - SHOP_DEPTH / 2; const x0 = s.x - hw + 0.13, x1 = s.x + hw - 0.13;
  const leaves = useMemo(() => {
    const out: { p: [number, number, number]; r: number; k: number }[] = [];
    for (let strand = 0; strand < 5; strand++) for (let i = 0; i < 9; i++) out.push({ p: [Math.cos(strand * 1.3) * 0.12 + Math.sin(i) * 0.03, -0.1 - i * 0.12 - strand * 0.05, Math.sin(strand * 1.3) * 0.12], r: strand + i, k: (strand + i) % 2 });
    return out;
  }, []);
  return <group>
    {/* floor tiles and the walls: grey wainscot below, pink-beige plaster above */}
    <mesh position={[s.x, 0.035, zc]} rotation={[-Math.PI / 2, 0, 0]} material={m.floor} receiveShadow><planeGeometry args={[s.w - 0.24, SHOP_DEPTH - 0.1]} /></mesh>
    {[x0, x1].map((x) => <group key={x}>
      <mesh position={[x, 0.5, zc]} material={m.wainscot}><boxGeometry args={[0.02, 1.0, SHOP_DEPTH - 0.1]} /></mesh>
      <mesh position={[x, 1.0 + (OPEN_H + 0.3 - 1.0) / 2, zc]} material={m.plaster}><boxGeometry args={[0.02, OPEN_H + 0.3 - 1.0, SHOP_DEPTH - 0.1]} /></mesh>
    </group>)}
    <mesh position={[s.x, 0.5, back + 0.13]} material={m.wainscot}><boxGeometry args={[s.w - 0.26, 1.0, 0.02]} /></mesh>
    <mesh position={[s.x, 1.0 + (OPEN_H + 0.3 - 1.0) / 2, back + 0.13]} material={m.plaster}><boxGeometry args={[s.w - 0.26, OPEN_H + 0.3 - 1.0, 0.02]} /></mesh>
    {/* "Phở Hà Nội" over the back wall, Tháp Rùa on the right wall, the chalkboard on the left */}
    <mesh position={[s.x, 2.25, back + 0.16]} material={m.sign}><boxGeometry args={[2.0, 0.69, 0.04]} /></mesh>
    <group position={[x1 - 0.03, 1.95, back + 2.2]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh material={m.frame}><boxGeometry args={[1.0, 0.78, 0.04]} /></mesh>
      <mesh position={[0, 0, 0.022]} material={m.painting}><planeGeometry args={[0.88, 0.66]} /></mesh>
    </group>
    <group position={[x0 + 0.03, 1.55, back + 3.6]} rotation={[0, Math.PI / 2, 0]}>
      <mesh material={m.board}><boxGeometry args={[0.95, 1.25, 0.03]} /></mesh>
    </group>
    {/* the pendant lamps over the tables */}
    {[2.4, 4.6].map((dz) => <group key={dz} position={[s.x - 1.0, OPEN_H + 0.3, back + dz]}>
      <mesh position={[0, -0.25, 0]} material={m.lamp}><cylinderGeometry args={[0.006, 0.006, 0.5, 4]} /></mesh>
      <mesh position={[0, -0.6, 0]} material={m.lamp}><coneGeometry args={[0.24, 0.22, 18, 1, true]} /></mesh>
      <mesh position={[0, -0.7, 0]} material={m.bulb}><sphereGeometry args={[0.06, 12, 8]} /></mesh>
      <pointLight position={[0, -0.8, 0]} color="#ffc978" intensity={3} distance={4} decay={1.6} />
    </group>)}
    {/* a pothos trailing from a pot hung in the front corner */}
    <group position={[x0 + 0.3, OPEN_H + 0.05, HD - 1.0]}>
      <mesh position={[0, 0, 0]} material={m.pot}><cylinderGeometry args={[0.13, 0.1, 0.16, 12]} /></mesh>
      {leaves.map((l, i) => <mesh key={i} position={l.p} rotation={[l.r * 0.7, l.r * 1.1, 0.4]} material={l.k ? m.leaf : m.leaf2}><circleGeometry args={[0.05, 6]} /></mesh>)}
    </group>
  </group>;
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
      <PhoInterior s={s} />
      {/* the phở counter at the front: a big pot of broth, bowls, herbs; two low tables inside */}
      <B p={[s.x + 1.0, 0.45, HD - 1.6]} s={[1.7, 0.9, 0.9]} m={m.steel} />
      <mesh position={[s.x + 1.3, 1.2, HD - 1.6]} material={m.steel} castShadow><cylinderGeometry args={[0.32, 0.3, 0.6, 18]} /></mesh>
      <mesh position={[s.x + 1.3, 1.49, HD - 1.6]} material={m.broth}><cylinderGeometry args={[0.3, 0.3, 0.02, 18]} /></mesh>
      <mesh position={[s.x + 1.3, 2.0, HD - 1.6]} material={m.steam}><cylinderGeometry args={[0.22, 0.32, 0.9, 12, 1, true]} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[s.x + 0.6, 0.95 + i * 0.07, HD - 1.6]} material={m.bowl}><cylinderGeometry args={[0.13, 0.08, 0.07, 14]} /></mesh>)}
      {[2.4, 4.6].map((dz) => <group key={dz}>
        {/* brushed stainless table: a top with a rim and four legs */}
        <B p={[s.x - 1.0, PHO_TOP - 0.02, back + dz]} s={[0.84, 0.04, 0.84]} m={m.steel} />
        <B p={[s.x - 1.0, PHO_TOP - 0.08, back + dz]} s={[0.78, 0.08, 0.78]} m={m.steel} />
        {[-1, 1].flatMap((a) => [-1, 1].map((b) => <B key={`${a}${b}`} p={[s.x - 1.0 + a * 0.36, (PHO_TOP - 0.1) / 2, back + dz + b * 0.36]} s={[0.035, PHO_TOP - 0.1, 0.035]} m={m.steel} />))}
        <group position={[s.x - 1.0, PHO_TOP, back + dz]} rotation={[0, Math.PI / 2, 0]}><Condiments /></group>
        <Stools red at={[[s.x - 1.0, back + dz - 0.7], [s.x - 1.0, back + dz + 0.7], [s.x - 0.2, back + dz]]} />
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
    {s.id !== 'pho' && <mesh position={[s.x + (s.id === 'banhmi' ? -1 : 1) * (hw - 0.13), 1.8, back + 3.0]} rotation={[0, (s.id === 'banhmi' ? 1 : -1) * Math.PI / 2, 0]} material={mats.board}><planeGeometry args={[0.9, 1.12]} /></mesh>}
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
