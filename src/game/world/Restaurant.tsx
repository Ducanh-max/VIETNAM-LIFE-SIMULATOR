import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerObstacles, type Obstacle, type Point } from '../geo';
import { RESTAURANT, restaurantToWorld, worldToRestaurant } from '../osm';
import { jobActions } from '../job';
import { drinkLevels, firstDrink, mealDuration, SEAT_Z, SET, STOOL_TOP, TABLE_D, TABLE_TOP, TABLE_W } from '../meal';
import { actions, bike, game, MENU, player, useGame, type MenuId, type Order } from '../state';
import { Bottle, BunChaSet, DishStack, DrinkSet, GrillClamp, Tray } from './food';
import { NameTag, Person, type PersonAnim } from './Person';
import { facadeTexture, rng } from './textures';

/* Local frame: x along Phố Đinh Tiên Hoàng, +z out of the shopfront toward the lake. Units: metres. */
const W = RESTAURANT.width; // 9
const D = RESTAURANT.depth; // 15
const HW = W / 2;
const HD = D / 2;
const H1 = 3.6; // ground floor height
const UPPER = 2; // upper storeys
const STOREY = 3.3;

type Table = { x: number; z: number; npc?: { side: 1 | -1; shirt: string; pants: string; hair?: string; seed: number }; outside?: boolean };
const TABLES: Table[] = [
  { x: -2.1, z: 4.4 }, { x: 2.1, z: 4.4, npc: { side: -1, shirt: '#3c6e9e', pants: '#2a2a2a', seed: 1 } },
  { x: -2.1, z: 1.2 }, { x: 2.1, z: 1.2 },
  { x: -2.1, z: -2.0, npc: { side: 1, shirt: '#b8433a', pants: '#3a3f4a', hair: '#2b1d14', seed: 2 } }, { x: 2.1, z: -2.0 },
  { x: -0.6, z: HD + 1.5, outside: true },
];
const HOME: Point = [1.0, -4.3];
const GRILL: Point = [-3.4, HD + 1.4];
const DESK: Point = [-3.3, -3.8];
const BOSS: Point = [-4.05, -3.8];

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

function useRestaurantMaterials() {
  return useMemo(() => {
    const sign = canvasTexture(1024, 192, (ctx) => {
      ctx.fillStyle = '#b3160f'; ctx.fillRect(0, 0, 1024, 192);
      ctx.strokeStyle = '#f6d24a'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 1004, 172);
      ctx.fillStyle = '#ffe14d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 92px "Be Vietnam Pro", Arial, sans-serif';
      ctx.fillText('BÚN CHẢ ĐỨC ANH', 512, 84, 960);
      ctx.fillStyle = '#ffffff'; ctx.font = '600 30px "Be Vietnam Pro", Arial, sans-serif';
      ctx.fillText('ĐẶC SẢN HÀ NỘI  ·  BÚN CHẢ CHẤM NƯỚNG THAN HOA', 512, 152, 960);
    });
    const vertical = canvasTexture(128, 512, (ctx) => {
      ctx.fillStyle = '#fff6d0'; ctx.fillRect(0, 0, 128, 512);
      ctx.fillStyle = '#c4170f'; ctx.fillRect(8, 8, 112, 496);
      ctx.fillStyle = '#ffe14d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 64px "Be Vietnam Pro", Arial, sans-serif';
      ['B', 'Ú', 'N', '', 'C', 'H', 'Ả'].forEach((ch, i) => ctx.fillText(ch, 64, 50 + i * 66));
    });
    const menu = canvasTexture(512, 640, (ctx) => {
      ctx.fillStyle = '#1e3b2f'; ctx.fillRect(0, 0, 512, 640);
      ctx.strokeStyle = '#d9b46a'; ctx.lineWidth = 6; ctx.strokeRect(12, 12, 488, 616);
      ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center'; ctx.font = 'bold 50px "Be Vietnam Pro", Arial, sans-serif';
      ctx.fillText('THỰC ĐƠN', 256, 80);
      ctx.font = '22px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillStyle = '#e8e2cf'; ctx.fillText('Bún chả Đức Anh · Đinh Tiên Hoàng', 256, 118);
      ctx.textAlign = 'left';
      MENU.forEach((item, i) => {
        const y = 190 + i * 88;
        ctx.fillStyle = i === 0 ? '#ffd35c' : '#ffffff'; ctx.font = `bold ${i === 0 ? 34 : 30}px "Be Vietnam Pro", Arial, sans-serif`;
        ctx.fillText(item.name, 40, y);
        ctx.textAlign = 'right'; ctx.fillText(`${item.price / 1000}k`, 472, y); ctx.textAlign = 'left';
        ctx.fillStyle = '#bcd0c4'; ctx.font = '17px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText(item.note.slice(0, 44), 40, y + 30);
      });
      ctx.fillStyle = '#d9b46a'; ctx.textAlign = 'center'; ctx.font = 'italic 22px Georgia, serif'; ctx.fillText('Bún chả là đặc sản — ăn kèm rau sống, tỏi ớt, chanh', 256, 610);
    });
    const floor = canvasTexture(128, 128, (ctx) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? '#c9b89a' : '#e4d8c0'; ctx.fillRect(x * 32, y * 32, 32, 32); }
      ctx.strokeStyle = 'rgba(90,70,50,.25)'; for (let i = 0; i <= 128; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke(); }
    }, [W / 1.2, D / 1.2]);
    const wall = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#efe6cf'; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#f7f7f4'; ctx.fillRect(0, 170, 256, 86);
      ctx.strokeStyle = 'rgba(120,130,140,.35)'; for (let x = 0; x <= 256; x += 21) { ctx.beginPath(); ctx.moveTo(x, 170); ctx.lineTo(x, 256); ctx.stroke(); }
      for (let y = 170; y <= 256; y += 21) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
      ctx.fillStyle = '#2d5aa8'; ctx.fillRect(0, 166, 256, 5);
    }, [4, 1]);
    const facade = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#e8d49a'; ctx.fillRect(0, 0, 256, 256);
      const r = rng(4);
      ctx.globalAlpha = 0.1; for (let i = 0; i < 40; i++) { ctx.fillStyle = '#5a4a2a'; ctx.fillRect(r() * 256, r() * 256, 2, 20 + r() * 50); } ctx.globalAlpha = 1;
      for (let f = 0; f < 2; f++) {
        const top = f * 128;
        for (const x of [40, 152]) {
          ctx.fillStyle = '#f2ead6'; ctx.fillRect(x - 6, top + 14, 76, 92);
          ctx.fillStyle = '#2f6b4f'; ctx.fillRect(x, top + 20, 64, 82);
          ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let s = top + 24; s < top + 100; s += 6) ctx.fillRect(x + 3, s, 58, 1.5);
          ctx.fillRect(x + 31, top + 20, 2, 82);
        }
        ctx.fillStyle = '#3c3a36'; ctx.fillRect(14, top + 98, 228, 4); for (let x = 16; x < 242; x += 8) ctx.fillRect(x, top + 98, 2, 22);
        ctx.fillStyle = '#4b7d3a'; for (let p = 0; p < 6; p++) { ctx.beginPath(); ctx.arc(24 + r() * 208, top + 96, 6 + r() * 5, 0, Math.PI * 2); ctx.fill(); }
      }
    });
    const fridge = canvasTexture(128, 256, (ctx) => {
      ctx.fillStyle = '#dfe9ee'; ctx.fillRect(0, 0, 128, 256);
      const colors = ['#123a8c', '#c8102e', '#1c8a3a', '#9cc8ea'];
      for (let shelf = 0; shelf < 5; shelf++) {
        ctx.fillStyle = '#b8c4ca'; ctx.fillRect(0, 40 + shelf * 44, 128, 3);
        for (let i = 0; i < 9; i++) { ctx.fillStyle = colors[(i + shelf) % 4]; ctx.fillRect(6 + i * 13, 14 + shelf * 44, 10, 26); }
      }
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, 50, 256);
    });
    return {
      sign: new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.25, roughness: 0.5 }),
      vertical: new THREE.MeshStandardMaterial({ map: vertical, emissive: '#ffffff', emissiveMap: vertical, emissiveIntensity: 0.35, roughness: 0.5 }),
      menu: new THREE.MeshStandardMaterial({ map: menu, roughness: 0.7 }),
      floor: new THREE.MeshStandardMaterial({ map: floor, roughness: 0.6 }),
      wall: new THREE.MeshStandardMaterial({ map: wall, roughness: 0.85 }),
      facade: new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }),
      side: new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.95 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.25, metalness: 0.85 }),
      blue: new THREE.MeshStandardMaterial({ color: '#2f68c4', roughness: 0.45 }),
      red: new THREE.MeshStandardMaterial({ color: '#d3302a', roughness: 0.45 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: '#7a4f2e', roughness: 0.7 }),
      shutter: new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.5, metalness: 0.6 }),
      tube: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4fbff', emissiveIntensity: 1.6 }),
      coal: new THREE.MeshStandardMaterial({ color: '#3a1a0a', emissive: '#ff5a1a', emissiveIntensity: 1.8, roughness: 0.9 }),
      fridge: new THREE.MeshStandardMaterial({ map: fridge, emissive: '#ffffff', emissiveMap: fridge, emissiveIntensity: 0.4, roughness: 0.2 }),
      pot: new THREE.MeshStandardMaterial({ color: '#a7aaab', roughness: 0.3, metalness: 0.9 }),
      tissue: new THREE.MeshStandardMaterial({ color: '#e45b7a', roughness: 0.6 }),
      sauce: new THREE.MeshStandardMaterial({ color: '#b5651d', roughness: 0.2, transparent: true, opacity: 0.85 }),
    };
  }, []);
}

/** Wide, low steel-topped table (room for the whole bún chả spread) with two plastic stools. */
function DiningTable({ t, mats, bare = false }: { t: Table; mats: ReturnType<typeof useRestaurantMaterials>; bare?: boolean }) {
  return <group position={[t.x, 0, t.z]}>
    <mesh position={[0, TABLE_TOP - 0.015, 0]} material={mats.steel} castShadow receiveShadow><boxGeometry args={[TABLE_W, 0.03, TABLE_D]} /></mesh>
    <mesh position={[0, TABLE_TOP - 0.04, 0]} material={mats.steel}><boxGeometry args={[TABLE_W - 0.06, 0.03, TABLE_D - 0.06]} /></mesh>
    {[-1, 1].flatMap((a) => [-1, 1].map((b) => <mesh key={`${a}${b}`} position={[a * (TABLE_W / 2 - 0.06), TABLE_TOP / 2, b * (TABLE_D / 2 - 0.06)]} material={mats.steel}><cylinderGeometry args={[0.018, 0.018, TABLE_TOP, 6]} /></mesh>))}
    {[-1, 1].map((s) => <group key={s} position={[0, 0, s * SEAT_Z]}>
      <mesh position={[0, STOOL_TOP - 0.02, 0]} material={s > 0 ? mats.blue : mats.red} castShadow><cylinderGeometry args={[0.15, 0.16, 0.04, 16]} /></mesh>
      <mesh position={[0, (STOOL_TOP - 0.04) / 2, 0]} material={s > 0 ? mats.blue : mats.red}><cylinderGeometry args={[0.13, 0.16, STOOL_TOP - 0.04, 12, 1, true]} /></mesh>
    </group>)}
    {/* condiments at the end of the table: tissues, chopstick tube, fish-sauce jar, chilli sauce */}
    {!bare && <group position={[TABLE_W / 2 - 0.12, 0, 0]}>
      <mesh position={[0, TABLE_TOP + 0.04, -0.2]} material={mats.tissue} castShadow><boxGeometry args={[0.14, 0.08, 0.08]} /></mesh>
      <mesh position={[0, TABLE_TOP + 0.08, -0.04]} material={mats.steel} castShadow><cylinderGeometry args={[0.035, 0.035, 0.16, 10]} /></mesh>
      <mesh position={[0, TABLE_TOP + 0.05, 0.1]} material={mats.sauce}><cylinderGeometry args={[0.03, 0.035, 0.1, 10]} /></mesh>
      <mesh position={[0, TABLE_TOP + 0.06, 0.22]} material={mats.red}><cylinderGeometry args={[0.022, 0.026, 0.12, 8]} /></mesh>
    </group>}
  </group>;
}

/** Charcoal brazier on the pavement with clamps of chả and rising smoke. */
function Grill({ mats }: { mats: ReturnType<typeof useRestaurantMaterials> }) {
  const smoke = useRef<THREE.Group>(null);
  const coal = useRef<THREE.PointLight>(null);
  const puffTexture = useMemo(() => canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(235,235,235,.75)'); g.addColorStop(1, 'rgba(235,235,235,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  }), []);
  const puffs = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ t: i / 14, x: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 })), []);
  const puffMats = useMemo(() => puffs.map(() => new THREE.SpriteMaterial({ map: puffTexture, transparent: true, depthWrite: false, opacity: 0.5 })), [puffs, puffTexture]);
  useFrame((state, dt) => {
    if (coal.current) coal.current.intensity = 2.2 + Math.sin(state.clock.elapsedTime * 13) * 0.4 + Math.sin(state.clock.elapsedTime * 7.3) * 0.3;
    const g = smoke.current; if (!g) return;
    g.children.forEach((child, i) => {
      const p = puffs[i];
      p.t = (p.t + dt * 0.22) % 1;
      child.position.set(p.x + p.t * 0.6, 0.75 + p.t * 3.2, p.z - p.t * 0.25);
      const s = 0.25 + p.t * 1.4; child.scale.set(s, s, s);
      puffMats[i].opacity = 0.45 * (1 - p.t);
    });
  });
  return <group position={[GRILL[0], 0, GRILL[1]]}>
    <mesh position={[0, 0.3, 0]} material={mats.dark} castShadow><cylinderGeometry args={[0.32, 0.26, 0.6, 18]} /></mesh>
    <mesh position={[0, 0.58, 0]} material={mats.coal}><cylinderGeometry args={[0.28, 0.28, 0.06, 18]} /></mesh>
    <mesh position={[0, 0.66, 0]} material={mats.steel}><cylinderGeometry args={[0.34, 0.34, 0.01, 18, 1, true]} /></mesh>
    {[-0.12, 0.08].map((z, i) => <group key={z} position={[-0.05, 0.68, z]} rotation={[0, 0.2 * (i ? -1 : 1), 0]}><GrillClamp /></group>)}
    <pointLight ref={coal} position={[0, 0.9, 0]} color="#ff7a2e" intensity={2.4} distance={4} decay={2} />
    <group ref={smoke}>{puffMats.map((mat, i) => <sprite key={i} material={mat} />)}</group>
    {/* tray of raw chả waiting */}
    <mesh position={[0.6, 0.45, 0]} material={mats.steel}><boxGeometry args={[0.4, 0.02, 0.3]} /></mesh>
    <mesh position={[0.6, 0.22, 0]} material={mats.blue}><cylinderGeometry args={[0.15, 0.17, 0.44, 12]} /></mesh>
  </group>;
}

function Building({ mats }: { mats: ReturnType<typeof useRestaurantMaterials> }) {
  const upperH = UPPER * STOREY;
  const fan = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (fan.current) fan.current.rotation.y += dt * 6; });
  const facade = useMemo(() => { const m = mats.facade.clone(); m.map = mats.facade.map!.clone(); m.map.needsUpdate = true; m.map.wrapS = THREE.RepeatWrapping; m.map.repeat.set(1, 1); return m; }, [mats.facade]);
  return <group>
    {/* floor and ceiling */}
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floor} receiveShadow><planeGeometry args={[W - 0.3, D]} /></mesh>
    <mesh position={[0, H1, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.ceiling}><planeGeometry args={[W - 0.3, D]} /></mesh>
    {/* side and back walls */}
    {[-1, 1].map((s) => <mesh key={s} position={[s * (HW - 0.08), H1 / 2, 0]} material={mats.wall} receiveShadow castShadow><boxGeometry args={[0.16, H1, D]} /></mesh>)}
    <mesh position={[0, H1 / 2, -HD + 0.08]} material={mats.wall} receiveShadow><boxGeometry args={[W, H1, 0.16]} /></mesh>
    {/* upper storeys */}
    <mesh position={[0, H1 + upperH / 2, 0]} castShadow receiveShadow material={[mats.side, mats.side, mats.side, mats.side, facade, mats.side]}><boxGeometry args={[W, upperH, D]} /></mesh>
    <mesh position={[0, H1 + upperH + 0.45, HD - 0.1]} material={mats.side} castShadow><boxGeometry args={[W, 0.9, 0.2]} /></mesh>
    {/* front lintel with the main signboard, rolled-up shutter */}
    <mesh position={[0, H1 + 0.55, HD + 0.32]} material={mats.sign} castShadow><boxGeometry args={[W - 0.2, 1.1, 0.12]} /></mesh>
    <mesh position={[0, H1 - 0.2, HD - 0.05]} rotation={[0, 0, Math.PI / 2]} material={mats.shutter}><cylinderGeometry args={[0.2, 0.2, W - 0.4, 14]} /></mesh>
    {/* vertical lightbox at the corner */}
    <mesh position={[HW + 0.35, H1 + 1.9, HD - 0.4]} rotation={[0, Math.PI / 2, 0]} material={mats.vertical} castShadow><boxGeometry args={[0.7, 2.8, 0.18]} /></mesh>
    {/* menu board on the right wall */}
    <mesh position={[HW - 0.18, 2.0, 1.0]} rotation={[0, -Math.PI / 2, 0]} material={mats.menu}><planeGeometry args={[1.5, 1.875]} /></mesh>
    {/* fluorescent tubes and a ceiling fan */}
    {[-1.5, 1.5].flatMap((x) => [-3.5, 0, 3.5].map((z) => <mesh key={`${x}${z}`} position={[x, H1 - 0.05, z]} material={mats.tube}><boxGeometry args={[0.06, 0.04, 1.2]} /></mesh>))}
    <group position={[0, H1 - 0.35, 1.2]}>
      <mesh material={mats.dark}><cylinderGeometry args={[0.02, 0.02, 0.5, 6]} /></mesh>
      <group ref={fan} position={[0, -0.25, 0]}>
        {[0, 1, 2].map((i) => <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]} position={[0, 0, 0]} material={mats.wood}><boxGeometry args={[1.1, 0.012, 0.12]} /></mesh>)}
        <mesh material={mats.dark}><cylinderGeometry args={[0.1, 0.1, 0.1, 12]} /></mesh>
      </group>
    </group>
    <pointLight position={[0, H1 - 0.5, 0.5]} color="#fff4e0" intensity={14} distance={13} decay={1.6} />
    {/* kitchen counter at the back: pots of nước chấm, bowls, bún baskets */}
    <group position={[1.6, 0, -5.3]}>
      <mesh position={[0, 0.45, 0]} material={mats.steel} castShadow receiveShadow><boxGeometry args={[4.6, 0.9, 0.75]} /></mesh>
      {[-1.6, -0.8].map((x) => <mesh key={x} position={[x, 1.08, 0]} material={mats.pot} castShadow><cylinderGeometry args={[0.24, 0.22, 0.36, 18]} /></mesh>)}
      <group position={[0.2, 0.9, 0.1]}><DishStack count={8} /></group>
      <group position={[0.5, 0.9, -0.1]}><DishStack count={5} /></group>
      <mesh position={[1.3, 0.97, 0]} material={mats.wood}><cylinderGeometry args={[0.25, 0.22, 0.12, 18, 1, true]} /></mesh>
      <mesh position={[1.3, 0.95, 0]}><cylinderGeometry args={[0.22, 0.22, 0.1, 18]} /><meshStandardMaterial color="#f6f3ea" roughness={0.6} /></mesh>
    </group>
    {/* drinks fridge with Pepsi, Coca, 7 Up and Lavie */}
    <group position={[-3.6, 0, -6.4]}>
      <mesh position={[0, 0.95, 0]} material={mats.steel} castShadow><boxGeometry args={[0.9, 1.9, 0.7]} /></mesh>
      <mesh position={[0, 0.95, 0.36]} material={mats.fridge}><planeGeometry args={[0.8, 1.75]} /></mesh>
    </group>
    <Neighbours />
    {/* cashier desk and an altar to Thần Tài, as in most Hà Nội shops */}
    <mesh position={[DESK[0], 0.5, DESK[1]]} material={mats.wood} castShadow><boxGeometry args={[0.9, 1.0, 1.4]} /></mesh>
    <mesh position={[-HW + 0.45, 1.9, -5.0]} material={mats.red}><boxGeometry args={[0.5, 0.45, 0.6]} /></mesh>
  </group>;
}

/** Narrow tube houses either side, so the shop sits in a proper street row. */
const NEIGHBOURS = [
  { x: -(HW + 2.1), w: 4.2, floors: 4, variant: 0 }, { x: -(HW + 6.4), w: 4.2, floors: 5, variant: 1 },
  { x: HW + 2.1, w: 4.2, floors: 5, variant: 2 }, { x: HW + 6.4, w: 4.2, floors: 3, variant: 1 },
];
function Neighbours() {
  const parts = useMemo(() => NEIGHBOURS.map((n) => {
    const tex = facadeTexture('tube', n.variant, n.floors).clone(); tex.needsUpdate = true;
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88 });
    const side = new THREE.MeshStandardMaterial({ color: '#d4c8b0', roughness: 0.95 });
    return { ...n, h: n.floors * 3.4, materials: [side, side, side, side, front, side] };
  }), []);
  return <>{parts.map((p, i) => <mesh key={i} position={[p.x, p.h / 2, 0]} material={p.materials} castShadow receiveShadow><boxGeometry args={[p.w - 0.1, p.h, D]} /></mesh>)}</>;
}

/** One waiter state for the whole restaurant. */
type WaiterTask = { route: Point[]; leg: number; mode: 'out' | 'back' | 'idle' | 'wait'; wait: number };

/** What the player ordered, laid out on the table in the set frame (see meal.ts). */
function TableSpread({ order, progress, inHand }: { order: Order; progress: number; inHand: boolean }) {
  const lv = drinkLevels(order, progress);
  const first = firstDrink(order);
  const bowls = order.buncha ?? 0;
  const others = (Object.keys(order) as MenuId[]).filter((id) => id !== 'buncha').flatMap((id) => Array.from({ length: order[id] ?? 0 }, () => id as Exclude<MenuId, 'buncha'>)).slice(first ? 1 : 0, 4);
  return <group>
    {bowls > 0 && <BunChaSet eaten={lv.food} showChopsticks={!inHand} />}
    {bowls > 1 && <group position={[SET.extra[0], 0, SET.extra[1]]} rotation={[0, Math.PI, 0]} scale={0.62}><BunChaSet steam={false} /></group>}
    {first && <group position={[bowls ? SET.drink[0] : 0, 0, bowls ? SET.drink[1] : 0]}><DrinkSet id={first} glassLevel={lv.glass} canHeld={inHand && lv.canHeld} glassHeld={inHand && lv.glassHeld} /></group>}
    {others.map((id, i) => <group key={i} position={[0.42 - i * 0.1, 0, -0.3]}><Bottle id={id} /></group>)}
  </group>;
}

/** Bún chả and drinks on the waiter's tray. */
function TrayLoad({ order }: { order: Order }) {
  const drinks = (Object.keys(order) as MenuId[]).filter((id) => id !== 'buncha') as Exclude<MenuId, 'buncha'>[];
  return <group>
    {(order.buncha ?? 0) > 0 && <group scale={0.62} position={[0.03, 0, 0]}><BunChaSet steam={false} /></group>}
    {drinks.slice(0, 3).map((id, i) => <group key={id} position={[-0.17, 0, -0.08 + i * 0.08]}><Bottle id={id} /></group>)}
  </group>;
}

export function Restaurant({ paused }: { paused: boolean }) {
  const mats = useRestaurantMaterials();
  const phase = useGame((s) => s.phase);
  const table = useGame((s) => s.table);
  const order = useGame((s) => s.order);
  const eatProgress = useGame((s) => s.eatProgress);
  const [carrying, setCarrying] = useState(false);
  const waiter = useRef<THREE.Group>(null);
  const waiterAnim = useRef<PersonAnim>({ mode: 'stand', speed: 0 });
  const cookAnim = useRef<PersonAnim>({ mode: 'fan', speed: 0 });
  const bossAnim = useRef<PersonAnim>({ mode: 'stand', speed: 0 });
  const dinerAnims = useRef<PersonAnim[]>(TABLES.map(() => ({ mode: 'eat', speed: 0 })));
  const task = useRef<WaiterTask>({ route: [HOME], leg: 0, mode: 'idle', wait: 0 });

  // Walls, counter, fridge, desk, tables and the grill block the player.
  useEffect(() => {
    const local: [number, number, number, number][] = [
      [-(HW - 0.08), 0, 0.12, HD], [HW - 0.08, 0, 0.12, HD], [0, -HD + 0.08, HW, 0.12],
      [1.6, -5.3, 2.3, 0.4], [-3.6, -6.4, 0.45, 0.35], [DESK[0], DESK[1], 0.45, 0.7], [BOSS[0], BOSS[1], 0.25, 0.25],
      [GRILL[0], GRILL[1], 0.45, 0.4], [GRILL[0] + 0.6, GRILL[1], 0.2, 0.2], [GRILL[0] - 0.65, GRILL[1], 0.25, 0.25],
      ...TABLES.map((t): [number, number, number, number] => [t.x, t.z, TABLE_W / 2, TABLE_D / 2]),
      ...NEIGHBOURS.map((n): [number, number, number, number] => [n.x, 0, n.w / 2, HD]),
    ];
    const list = local.map(([x, z, hx, hz]): Obstacle => { const [wx, wz] = restaurantToWorld(x, z); return { x: wx, z: wz, hx, hz, angle: RESTAURANT.angle }; });
    return registerObstacles(list);
  }, []);

  // M orders more once the meal is finished.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.repeat || e.code !== 'KeyM' || game.get().phase !== 'finished') return;
      if (document.pointerLockElement) document.exitPointerLock();
      actions.orderMore();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);

  // Order flow: cooking → Khánh walks the tray over → served.
  useEffect(() => {
    if (phase === 'cooking') task.current = { route: [HOME], leg: 0, mode: 'wait', wait: order.buncha ? 6 : 2.5 };
  }, [phase, order]);

  const sitAt = (i: number) => {
    const t = TABLES[i];
    const local = worldToRestaurant([player.position.x, player.position.z]);
    const side = local[1] > t.z ? 1 : -1; // the stool nearest to where the player stands
    const [sx, sz] = restaurantToWorld(t.x, t.z + side * SEAT_Z);
    const [lx, lz] = restaurantToWorld(t.x, t.z);
    player.seat = { position: new THREE.Vector3(sx, GROUND_HEIGHT, sz), facing: RESTAURANT.angle + (side > 0 ? Math.PI : 0), look: new THREE.Vector3(lx, GROUND_HEIGHT + TABLE_TOP + 0.05, lz) };
    if (document.pointerLockElement) document.exitPointerLock();
    game.set({ phase: 'menu', table: i, order: {} });
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = game.get();
    const local = worldToRestaurant([player.position.x, player.position.z]);
    const inside = Math.abs(local[0]) < HW && local[1] > -HD && local[1] < HD + 0.3;
    player.cameraMax = inside && !bike.riding ? 3.4 : Infinity;
    const near = (p: Point, r: number) => Math.hypot(local[0] - p[0], local[1] - p[1]) < r;

    // ---- context actions
    if (!bike.riding) {
      if (s.phase === 'none') {
        let best = -1; let bestD = 1.4;
        TABLES.forEach((t, i) => { if (t.npc) return; const d = Math.hypot(local[0] - t.x, local[1] - t.z); if (d < bestD) { bestD = d; best = i; } });
        if (best >= 0) game.offer({ id: `sit${best}`, text: 'Ngồi xuống & gọi món', key: 'E', priority: 5, run: () => sitAt(best) });
        else if (near([BOSS[0] + 1.4, BOSS[1]], 1.7)) game.offer({ id: 'boss', text: 'Nói chuyện với ông chủ Đức Anh', key: 'E', priority: 6, run: () => { if (document.pointerLockElement) document.exitPointerLock(); game.set({ dialog: 'boss' }); } });
        else if (s.job?.stage === 'pickup' && near([GRILL[0] - 0.2, GRILL[1] + 0.9], 2.0)) game.offer({ id: 'pickup', text: 'Nhận túi bún chả từ anh Đạt', key: 'E', priority: 6, run: () => jobActions.pickup() });
        else if (Math.abs(local[0]) < HW + 4 && local[1] > -HD && local[1] < HD + 6 && !s.job) game.offer({ id: 'info-shop', text: 'Bún chả Đức Anh — ngồi bàn trống để gọi món, hoặc gặp ông chủ ở quầy để xin việc ship', key: null, priority: 1 });
      } else if (s.phase === 'cooking') game.offer({ id: 'cooking', text: 'Anh Đạt đang nướng chả trên than hoa…', key: null, priority: 4 });
      else if (s.phase === 'serving') game.offer({ id: 'serving', text: 'Anh Khánh đang bưng món ra bàn…', key: null, priority: 4 });
      else if (s.phase === 'served') game.offer({ id: 'eat', text: 'Ăn ngay', key: 'E', priority: 5, run: () => game.set({ phase: 'eating', eatProgress: 0 }) });
      else if (s.phase === 'eating') game.offer({ id: 'eating', text: 'Đang thưởng thức…', key: null, priority: 4 });
      else if (s.phase === 'finished') game.offer({ id: 'done', text: 'Đứng dậy  ·  M: Gọi thêm', key: 'E', priority: 5, run: () => actions.standUp() });
    }

    // ---- eating progress (follows the scripted bites and sips)
    if (s.phase === 'eating' && !paused && !(window as unknown as { __freezeMeal?: boolean }).__freezeMeal) {
      const next = Math.min(1, s.eatProgress + dt / mealDuration(s.order));
      if (next >= 1) actions.finishMeal(); else game.set({ eatProgress: next });
    }

    // ---- Khánh, the waiter
    const w = waiter.current;
    const tk = task.current;
    if (w) {
      if (tk.mode === 'wait') {
        waiterAnim.current.mode = 'stand';
        tk.wait -= dt;
        if (tk.wait <= 0 && s.phase === 'cooking' && s.table >= 0) {
          const t = TABLES[s.table];
          const side = t.x > 0 ? 1 : -1;
          const route: Point[] = t.outside ? [HOME, [1.05, -4.0], [1.05, HD + 0.5], [t.x + TABLE_W / 2 + 0.35, t.z]] : [HOME, [side * 1.0, -4.0], [side * 1.0, t.z]];
          task.current = { route, leg: 0, mode: 'out', wait: 0 };
          setCarrying(true);
          game.set({ phase: 'serving' });
        }
      } else if (tk.mode === 'out' || tk.mode === 'back') {
        const target = tk.route[tk.leg + 1];
        if (!target) {
          if (tk.mode === 'out') {
            setCarrying(false);
            game.set({ phase: 'served' });
            task.current = { route: [...tk.route].reverse(), leg: 0, mode: 'back', wait: 0 };
          } else task.current = { route: [HOME], leg: 0, mode: 'idle', wait: 0 };
        } else {
          const dx = target[0] - w.position.x; const dz = target[1] - w.position.z;
          const dist = Math.hypot(dx, dz);
          const step = 1.35 * dt;
          if (dist <= step) { w.position.x = target[0]; w.position.z = target[1]; tk.leg++; }
          else { w.position.x += (dx / dist) * step; w.position.z += (dz / dist) * step; }
          let diff = Math.atan2(dx, dz) - w.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          w.rotation.y += diff * (1 - Math.exp(-10 * dt));
          waiterAnim.current.mode = tk.mode === 'out' ? 'carry' : 'walk';
          waiterAnim.current.speed = 1.35;
        }
      } else {
        waiterAnim.current.mode = 'stand';
        let diff = Math.PI * 0.15 - w.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        w.rotation.y += diff * (1 - Math.exp(-4 * dt));
      }
    }
  });

  const served = (phase === 'served' || phase === 'eating' || phase === 'finished') && table >= 0;
  const t = table >= 0 ? TABLES[table] : null;
  const playerSide = t && player.seat ? (worldToRestaurant([player.seat.position.x, player.seat.position.z])[1] > t.z ? 1 : -1) : 1;
  const inHand = phase === 'eating'; // chopsticks are picked up to eat and put back down when finished

  return <group position={[RESTAURANT.center[0], GROUND_HEIGHT, RESTAURANT.center[1]]} rotation={[0, RESTAURANT.angle, 0]}>
    <Building mats={mats} />
    {TABLES.map((tb, i) => <DiningTable key={i} t={tb} mats={mats} bare={served && i === table} />)}
    <Grill mats={mats} />
    {/* Đạt, the grill cook, fanning the coals in a nón lá */}
    <group position={[GRILL[0] - 0.65, 0, GRILL[1]]} rotation={[0, Math.PI / 2, 0]}>
      <Person anim={cookAnim.current} shirt="#5a7d5a" pants="#3a3226" hat="#d9c38a" skin="#b98a68" seed={4} />
      <mesh position={[0, STOOL_TOP / 2, 0]} material={mats.red}><cylinderGeometry args={[0.13, 0.15, STOOL_TOP, 12]} /></mesh>
      <NameTag name="Đạt" role="Nướng chả" y={1.65} />
    </group>
    {/* Đức Anh, the owner, behind the cashier desk */}
    <group position={[BOSS[0], 0, BOSS[1]]} rotation={[0, Math.PI / 2, 0]}>
      <Person anim={bossAnim.current} shirt="#2f4f7a" pants="#2a2a2a" hair="#3a3a3a" skin="#c4946f" seed={9} />
      <NameTag name="Đức Anh" role="Ông chủ quán" y={1.9} color="#ffd35c" />
    </group>
    {/* diners already eating */}
    {TABLES.map((tb, i) => tb.npc ? <group key={`n${i}`}>
      <group position={[tb.x, 0, tb.z + tb.npc.side * SEAT_Z]} rotation={[0, tb.npc.side > 0 ? Math.PI : 0, 0]}>
        <Person anim={dinerAnims.current[i]} shirt={tb.npc.shirt} pants={tb.npc.pants} hair={tb.npc.hair} seed={tb.npc.seed} />
      </group>
      <group position={[tb.x, TABLE_TOP, tb.z]} rotation={[0, tb.npc.side > 0 ? 0 : Math.PI, 0]}>
        <BunChaSet eaten={0.35} steam={false} />
        <group position={[SET.drink[0], 0, SET.drink[1]]}><DrinkSet id={i % 2 ? 'coca' : 'lavie'} glassLevel={0.5} /></group>
      </group>
    </group> : null)}
    {/* Khánh, the waiter, in a white shirt and black apron */}
    <group ref={waiter} position={[HOME[0], 0, HOME[1]]}>
      <Person anim={waiterAnim.current} shirt="#ffffff" pants="#1d1d1f" apron="#1d1d1f" seed={7} />
      <NameTag name="Khánh" role="Phục vụ" />
      {carrying && <group position={[0, 0.78, 0.36]}><Tray><TrayLoad order={order} /></Tray></group>}
    </group>
    {served && t && <group position={[t.x, TABLE_TOP, t.z]} rotation={[0, playerSide > 0 ? 0 : Math.PI, 0]}><TableSpread order={order} progress={phase === 'finished' ? 1 : eatProgress} inHand={inHand} /></group>}
  </group>;
}
