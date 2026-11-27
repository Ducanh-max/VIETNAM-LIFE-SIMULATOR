import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, insidePolygon, type Point } from '../geo';
import { BASEMENT_RING, basementBlockers, CABIN, CORE, floorY, fromRamp, lift, RAMP, toRamp, toTower } from '../lotte';
import { addToCart, cartCount, cartTotal, CATEGORY_NAME, mart, payCart, PRODUCTS, productById, shelfLeft, useMart, type Category, type MeshVariant, type Product } from '../lotteMart';
import { formatVnd, game, player, useGame } from '../state';

/*
 * LOTTE Mart, B1 of Lotte Center (spec section 8). A game layout over the basement outline: produce tables (rau củ,
 * trái cây), glass counters for fresh food, freezer chests, drinks fridges, shelves of confectionery and housewares,
 * a bakery table; four tills with conveyor, scanner and register by the lift; trolleys and baskets at the entrance;
 * section and promotion signs; cashiers, a stocker and shoppers. The street ramp to B2 passes through this level
 * inside a wall along the south-east side. Products are instanced (one InstancedMesh per shape).
 *
 * Flow: take a trolley or a basket (E) → walk up to a shelf (E) and add or remove items → a till (E) → pay → the
 * receipt, and the goods go in the backpack.
 */
const F = -1;
const H = 4.0;
const SECTIONS: Category[] = ['rau', 'traicay', 'tuoi', 'donglanh', 'banhkeo', 'douong', 'giadung', 'banhmi'];
type Fixture = { s: number; t0: number; t1: number; cat: Category; kind: 'table' | 'case' | 'freezer' | 'shelf' | 'fridge' | 'bakery' };
const KIND: Record<Category, Fixture['kind']> = { rau: 'table', traicay: 'table', tuoi: 'case', donglanh: 'freezer', banhkeo: 'shelf', douong: 'fridge', giadung: 'shelf', banhmi: 'bakery' };
/**
 * Tills (tower local, counters along u) on the south side of the lift core, customers on the side away from the core;
 * the trolley / basket bay between them. (North of the core the outline ends only ~6 m from the lift doors.)
 */
const TILLS: Point[] = [[-17, -10], [-10, -10], [10, -10], [17, -10]];
const BAY: Point = [0, -12];
const nearCore = (u: number, v: number) => Math.abs(u) < 21 && v > -16 && v < 12;
const inRampWall = (s: number, t: number) => t < RAMP.strips.A[1] + 1.5 && s > -1 && s < RAMP.S1 + 8;

function layout() {
  const fx: Fixture[] = [];
  const ok = (s: number, t: number) => { const [u, v] = fromRamp(s, t); return insidePolygon([u, v], BASEMENT_RING) && !nearCore(u, v) && !inRampWall(s, t); };
  let k = 0;
  for (let s = -40; s < 140; s += 4.6) {
    for (let t = 12; t < 120; t += 11) {
      // a fixture 1,2 m deep along s and up to 8 m long along t, shortened to fit
      let t0 = t, t1 = t + 8;
      while (t0 < t1 && !(ok(s - 0.6, t0) && ok(s + 0.6, t0))) t0 += 0.5;
      while (t1 > t0 && !(ok(s - 0.6, t1) && ok(s + 0.6, t1))) t1 -= 0.5;
      if (t1 - t0 < 3) continue;
      let all = true; for (let q = t0; q <= t1; q += 1) if (!ok(s, q)) { all = false; break; }
      if (!all) continue;
      fx.push({ s, t0, t1, cat: SECTIONS[Math.floor(k / 3) % SECTIONS.length], kind: 'shelf' }); k++;
    }
  }
  for (const f of fx) f.kind = KIND[f.cat];
  return fx;
}
const FIXTURES = layout();
basementBlockers.push((u, v, f) => {
  if (f !== F) return false;
  const [s, t] = toRamp(u, v);
  if (inRampWall(s, t)) return true; // the street ramp to B2 runs through here, behind a wall
  for (const x of FIXTURES) if (Math.abs(s - x.s) < 0.85 && t > x.t0 - 0.25 && t < x.t1 + 0.25) return true;
  for (const [tu, tv] of TILLS) if (Math.abs(u - tu) < 2.0 && Math.abs(v - tv) < 0.55) return true;
  return false;
});

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const GEO: Record<MeshVariant, THREE.BufferGeometry> = {
  // low-poly on purpose: there are thousands of these
  tomato: new THREE.IcosahedronGeometry(0.06, 0), apple: new THREE.IcosahedronGeometry(0.055, 0), orange: new THREE.IcosahedronGeometry(0.06, 0),
  cabbage: new THREE.IcosahedronGeometry(0.11, 0), watermelon: new THREE.IcosahedronGeometry(0.16, 0).scale(1.3, 1, 1),
  carrot: new THREE.ConeGeometry(0.025, 0.18, 4).rotateZ(Math.PI / 2), banana: new THREE.CapsuleGeometry(0.025, 0.14, 1, 4).rotateZ(1.2),
  tray: new THREE.BoxGeometry(0.28, 0.05, 0.2), box: new THREE.BoxGeometry(0.16, 0.22, 0.08), bag: new THREE.BoxGeometry(0.16, 0.24, 0.06),
  bottle: new THREE.CylinderGeometry(0.035, 0.035, 0.24, 5), can: new THREE.CylinderGeometry(0.033, 0.033, 0.12, 5),
  pot: new THREE.CylinderGeometry(0.11, 0.1, 0.12, 8), pan: new THREE.CylinderGeometry(0.13, 0.12, 0.04, 8), bowl: new THREE.SphereGeometry(0.07, 6, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  loaf: new THREE.CapsuleGeometry(0.05, 0.14, 1, 5).rotateZ(Math.PI / 2),
};
const tmpM = new THREE.Matrix4(); const tmpQ = new THREE.Quaternion(); const tmpE = new THREE.Euler(); const tmpV = new THREE.Vector3(); const tmpS = new THREE.Vector3(1, 1, 1);
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, rep = 0) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); } return t;
}
const label = (text: string, bg: string, fg = '#fff', w = 512, h = 128) => canvasTex(w, h, (c) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; let px = Math.round(h * 0.6); c.font = `bold ${px}px Arial`;
  while (c.measureText(text).width > w * 0.92 && px > 12) { px -= 3; c.font = `bold ${px}px Arial`; }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 3);
});
let M: ReturnType<typeof mk> | null = null;
function mk() {
  const std = (color: string, x: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...x });
  const tiles = canvasTex(128, 128, (c) => { c.fillStyle = '#E5DFD1'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#d8d1c0'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64); c.fillStyle = '#c9c1ae'; c.fillRect(0, 63, 128, 2); c.fillRect(63, 0, 2, 128); }, 1);
  return {
    floor: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.35 }), tilesTex: tiles,
    ceiling: std('#F4F3EF', { side: THREE.BackSide }), wall: std('#efece4', { side: THREE.DoubleSide }), lid: new THREE.MeshBasicMaterial({ color: '#15181a', side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
    wood: std('#97764F'), metal: std('#c9cfd3', { metalness: 0.4, roughness: 0.4 }), white: std('#f4f2ee'), dark: std('#27292B'),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }),
    fridge: std('#e8ecef'), red: std('#d51d32'), belt: std('#2b2f36', { roughness: 0.9 }), screen: new THREE.MeshBasicMaterial({ color: '#3fa7ff' }),
    trolley: std('#b9bec2', { metalness: 0.6, roughness: 0.35 }), basket: std('#d51d32'),
    product: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    skin: std('#e2b48f'), uniform: std('#d51d32'), apron: std('#2f7d32'), trousers: std('#2b2f36'), shirt2: std('#5b7fa6'), shirt3: std('#e0a21b'),
  };
}
const mats = () => (M ??= mk());

/** Instanced products on all fixtures: matrices in tower-local metres, y from this floor. */
function productInstances(fixtures: Fixture[]) {
  const lists = new Map<MeshVariant, { m: THREE.Matrix4; c: THREE.Color }[]>();
  const put = (v: MeshVariant, u: number, y: number, w: number, yaw: number, color: string) => {
    let l = lists.get(v); if (!l) { l = []; lists.set(v, l); }
    tmpQ.setFromEuler(tmpE.set(0, yaw, 0)); tmpM.compose(tmpV.set(u, y, w), tmpQ, tmpS);
    l.push({ m: tmpM.clone(), c: new THREE.Color(color).offsetHSL(0, 0, (Math.sin(u * 13.1 + w * 7.7) * 0.04)) });
  };
  const yawT = -Math.atan2(RAMP.n[1], RAMP.n[0]);
  for (const f of fixtures) {
    const prods = PRODUCTS.filter((p) => p.category === f.cat); if (!prods.length) continue;
    const len = f.t1 - f.t0;
    if (f.kind === 'table' || f.kind === 'bakery') {
      // a sloping display on both faces: rows of fruit / vegetables / bread
      for (const side of [-1, 1]) for (let r = 0; r < 2; r++) for (let q = 0.15; q < len - 0.1; q += 0.2) {
        const p = prods[Math.floor(q / (len / prods.length)) % prods.length];
        const [u, w] = fromRamp(f.s + side * (0.15 + r * 0.16), f.t0 + q + (r % 2) * 0.06);
        put(p.meshVariant, u, 0.8 + r * 0.07, w, yawT, p.color);
      }
    } else if (f.kind === 'shelf' || f.kind === 'fridge') {
      for (const side of [-1, 1]) for (let lev = 0; lev < 4; lev++) for (let q = 0.12; q < len - 0.1; q += f.kind === 'fridge' ? 0.16 : 0.3) {
        const p = prods[(Math.floor(q / 1.1) + lev) % prods.length];
        const [u, w] = fromRamp(f.s + side * 0.38, f.t0 + q);
        put(p.meshVariant, u, 0.3 + lev * 0.42 + 0.12, w, yawT + (side > 0 ? 0 : Math.PI), p.color);
      }
    } else {
      // glass counter or freezer chest: trays / packs laid flat in two rows
      for (const side of [-1, 1]) for (let q = 0.2; q < len - 0.15; q += 0.3) {
        const p = prods[Math.floor(q / 1.4) % prods.length];
        const [u, w] = fromRamp(f.s + side * 0.25, f.t0 + q);
        put(p.meshVariant, u, f.kind === 'freezer' ? 0.62 : 0.78, w, yawT, p.color);
      }
    }
  }
  const mat = mats().product;
  return [...lists].map(([v, l]) => { const im = new THREE.InstancedMesh(GEO[v], mat, l.length); l.forEach((x, i) => { im.setMatrixAt(i, x.m); im.setColorAt(i, x.c); }); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im; });
}

function Person({ p, yaw, shirt, basket }: { p: Point; yaw: number; shirt: THREE.Material; basket?: boolean }) {
  const m = mats();
  return <group position={[p[0], 0, p[1]]} rotation={[0, yaw, 0]}>
    <mesh material={m.trousers} position={[0, 0.45, 0]}><boxGeometry args={[0.36, 0.9, 0.24]} /></mesh>
    <mesh material={shirt} position={[0, 1.2, 0]}><boxGeometry args={[0.46, 0.6, 0.28]} /></mesh>
    <mesh material={m.skin} position={[0, 1.68, 0]}><sphereGeometry args={[0.2, 12, 8]} /></mesh>
    {basket && <mesh material={m.basket} position={[0.32, 0.75, 0.1]}><boxGeometry args={[0.36, 0.22, 0.26]} /></mesh>}
  </group>;
}
function Trolley({ basket = false }: { basket?: boolean }) {
  const m = mats();
  if (basket) return <mesh material={m.basket} position={[0, 0.5, 0]}><boxGeometry args={[0.42, 0.24, 0.3]} /></mesh>;
  return <group>
    <mesh material={m.trolley} position={[0, 0.75, 0]}><boxGeometry args={[0.55, 0.45, 0.85]} /></mesh>
    <mesh material={m.dark} position={[0, 1.0, -0.47]}><boxGeometry args={[0.55, 0.04, 0.04]} /></mesh>
    {[-0.22, 0.22].flatMap((x) => [-0.35, 0.35].map((z) => <mesh key={`${x}${z}`} material={m.dark} position={[x, 0.08, z]}><cylinderGeometry args={[0.06, 0.06, 0.04, 8]} /></mesh>))}
  </group>;
}

/** B1: the supermarket floor (drawn in the tower group, which handles position and rotation). */
export function LotteMart() {
  const m = mats();
  const y = GROUND_HEIGHT + floorY(F);
  const data = useMemo(() => {
    const ring = BASEMENT_RING;
    const slab = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([u, v]) => new THREE.Vector2(u, -v)))); slab.rotateX(-Math.PI / 2);
    // floor UVs in metres / 2 (tile = 1 m)
    const pos = slab.getAttribute('position'); const uv = slab.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
    const top = GROUND_HEIGHT - 0.35 - y;
    const wp: number[] = [];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; wp.push(a[0], 0, a[1], b[0], 0, b[1], b[0], top, b[1], a[0], 0, a[1], b[0], top, b[1], a[0], top, a[1]); }
    // the wall round the street ramp's strip
    const P = (s: number, t: number, yy: number) => { const [u, v] = fromRamp(s, t); return [u, yy, v]; };
    const rw = RAMP.strips.A[1] + 1.5; for (const [a, b] of [[[-1, rw], [RAMP.S1 + 8, rw]]] as [Point, Point][]) { const q = [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], top), P(a[0], a[1], top)]; wp.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); }
    const walls = new THREE.BufferGeometry(); walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); walls.computeVertexNormals();
    const products = productInstances(FIXTURES);
    // ceiling light panels every 6 m
    const lights: THREE.Matrix4[] = [];
    for (let s = -40; s < 140; s += 6) for (let t = 10; t < 120; t += 6) { const [u, v] = fromRamp(s, t); if (insidePolygon([u, v], ring) && !inRampWall(s, t)) { tmpM.compose(tmpV.set(u, H - 0.02, v), tmpQ.identity(), new THREE.Vector3(1.2, 0.02, 0.6)); lights.push(tmpM.clone()); } }
    const lightMesh = new THREE.InstancedMesh(unitBox, m.light, lights.length); lights.forEach((x, i) => lightMesh.setMatrixAt(i, x)); lightMesh.instanceMatrix.needsUpdate = true;
    return { slab, walls, top, products, lightMesh };
  }, [m, y]);
  useEffect(() => () => { data.slab.dispose(); data.walls.dispose(); data.products.forEach((x) => x.dispose()); data.lightMesh.dispose(); }, [data]);
  const yawT = -Math.atan2(RAMP.n[1], RAMP.n[0]);
  const fixtureMeshes = useMemo(() => {
    type Part = { mat: keyof ReturnType<typeof mk>; p: [number, number, number]; s: [number, number, number]; rx?: number };
    const byMat = new Map<string, THREE.Matrix4[]>();
    const g = new THREE.Matrix4(), part = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const f of FIXTURES) {
      const [u, v] = fromRamp(f.s, (f.t0 + f.t1) / 2); const len = f.t1 - f.t0;
      const parts: Part[] = f.kind === 'table' || f.kind === 'bakery'
        ? [{ mat: 'wood', p: [0, 0.4, 0], s: [len, 0.8, 1.1] }, ...[-1, 1].map((sd): Part => ({ mat: 'wood', p: [0, 0.86, sd * 0.3], s: [len, 0.04, 0.55], rx: sd * 0.35 }))]
        : f.kind === 'shelf'
          ? [{ mat: 'white', p: [0, 0.95, 0], s: [len, 1.9, 0.08] }, ...[0, 1, 2, 3].map((l): Part => ({ mat: 'white', p: [0, 0.3 + l * 0.42, 0], s: [len, 0.03, 0.9] }))]
          : f.kind === 'fridge'
            ? [{ mat: 'fridge', p: [0, 1.0, 0], s: [len, 2.0, 0.5] }, ...[-1, 1].map((sd): Part => ({ mat: 'glass', p: [0, 1.0, sd * 0.47], s: [len, 1.9, 0.02] })), ...[0, 1, 2, 3].map((l): Part => ({ mat: 'metal', p: [0, 0.3 + l * 0.42, 0], s: [len, 0.02, 0.9] }))]
            : f.kind === 'freezer'
              ? [{ mat: 'fridge', p: [0, 0.35, 0], s: [len, 0.7, 1.0] }, { mat: 'glass', p: [0, 0.85, 0], s: [len, 0.02, 1.0] }]
              : [{ mat: 'white', p: [0, 0.35, 0], s: [len, 0.7, 0.9] }, { mat: 'glass', p: [0, 0.95, 0], s: [len, 0.5, 0.9] }];
      g.compose(new THREE.Vector3(u, 0, v), q.setFromEuler(e.set(0, yawT, 0)), new THREE.Vector3(1, 1, 1));
      for (const pt of parts) {
        part.compose(new THREE.Vector3(...pt.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(pt.rx ?? 0, 0, 0)), new THREE.Vector3(...pt.s));
        let l = byMat.get(pt.mat); if (!l) { l = []; byMat.set(pt.mat, l); } l.push(g.clone().multiply(part));
      }
    }
    return [...byMat].map(([k, list]) => { const im = new THREE.InstancedMesh(unitBox, m[k as keyof typeof m] as THREE.Material, list.length); list.forEach((x, i) => im.setMatrixAt(i, x)); im.instanceMatrix.needsUpdate = true; return im; });
  }, [m, yawT]);
  useEffect(() => () => fixtureMeshes.forEach((x) => x.dispose()), [fixtureMeshes]);
  // section signs over the middle of each section's fixtures
  const signs = useMemo(() => {
    const out: { p: [number, number, number]; text: string; color: string }[] = [];
    for (const cat of SECTIONS) { const fs = FIXTURES.filter((f) => f.cat === cat); if (!fs.length) continue; const f = fs[Math.floor(fs.length / 2)]; const [u, v] = fromRamp(f.s, (f.t0 + f.t1) / 2); out.push({ p: [u, H - 0.7, v], text: CATEGORY_NAME[cat].toUpperCase(), color: cat === 'donglanh' ? '#2f6fb3' : cat === 'douong' ? '#1f9e6e' : '#d51d32' }); }
    return out;
  }, []);
  const signMats = useMemo(() => signs.map((s) => new THREE.MeshBasicMaterial({ map: label(s.text, s.color) })), [signs]);
  const promo = useMemo(() => new THREE.MeshBasicMaterial({ map: label('KHUYẾN MÃI · MUA 2 TẶNG 1', '#f2c230', '#7a0f1c') }), []);
  const martSign = useMemo(() => new THREE.MeshBasicMaterial({ map: label('LOTTE Mart', '#d51d32') }), []);
  const tillSign = useMemo(() => TILLS.map((_, i) => new THREE.MeshBasicMaterial({ map: label(`QUẦY ${i + 1}`, '#27292B') })), []);
  const bayMat = useMemo(() => new THREE.MeshBasicMaterial({ map: label('XE ĐẨY · GIỎ HÀNG', '#1d4f8f') }), []);
  // the player's trolley / basket follows in front of them
  const carry = useRef<THREE.Group>(null); const lastP = useRef<Point>([0, 0]); const heading = useRef(0);
  const carrier = useMart((s) => s.carrier);
  useFrame(() => {
    if (lift.playerFloor !== F) return;
    const [u, v] = toTower([player.position.x, player.position.z]);
    const dx = u - lastP.current[0], dz = v - lastP.current[1]; if (Math.hypot(dx, dz) > 0.03) heading.current = Math.atan2(dx, dz); lastP.current = [u, v];
    if (carry.current) { const h = heading.current; carry.current.position.set(u + Math.sin(h) * 0.9, 0, v + Math.cos(h) * 0.9); carry.current.rotation.y = h; }
  });
  return <group position={[0, y, 0]}>
    <mesh geometry={data.slab} material={m.floor} />
    <mesh geometry={data.slab} material={m.ceiling} position={[0, H, 0]} />
    <mesh geometry={data.walls} material={m.wall} />
    <mesh geometry={data.slab} material={m.lid} position={[0, data.top, 0]} />
    <primitive object={data.lightMesh} />
    {data.products.map((x, i) => <primitive key={i} object={x} />)}
    {/* lift core walls (the doors are the cabin's own) */}
    <mesh material={m.wall} position={[0, H / 2, -CORE.halfV]}><boxGeometry args={[CORE.halfU * 2, H, 0.3]} /></mesh>
    {[-1, 1].map((sd) => <mesh key={sd} material={m.wall} position={[sd * CORE.halfU, H / 2, 0]}><boxGeometry args={[0.3, H, CORE.halfV * 2]} /></mesh>)}
    {[-1, 1].map((sd) => <mesh key={`f${sd}`} material={m.wall} position={[sd * (CORE.halfU + CABIN.u1) / 2, H / 2, CORE.halfV]}><boxGeometry args={[CORE.halfU - CABIN.u1, H, 0.3]} /></mesh>)}
    <mesh material={m.wall} position={[0, (H + 2.4) / 2, CORE.halfV]}><boxGeometry args={[CABIN.u1 * 2, H - 2.4, 0.3]} /></mesh>
    <mesh material={martSign} position={[0, 3.3, CORE.halfV + 0.17]}><planeGeometry args={[3.2, 0.8]} /></mesh>
    {/* fixtures: every box of every shelf, fridge, table… as one instanced mesh per material */}
    {fixtureMeshes.map((x, i) => <primitive key={`fx${i}`} object={x} />)}
    {signs.flatMap((s, i) => [0, Math.PI].map((r) => <mesh key={`${i}${r}`} material={signMats[i]} position={s.p} rotation={[0, yawT + Math.PI / 2 + r, 0]}><planeGeometry args={[2.6, 0.65]} /></mesh>))}
    {FIXTURES.filter((_, i) => i % 7 === 3).map((f, i) => { const [u, v] = fromRamp(f.s, f.t1 + 0.6); return [0, Math.PI].map((r) => <mesh key={`p${i}${r}`} material={promo} position={[u, 1.5, v]} rotation={[0, yawT + r, 0]}><planeGeometry args={[1.4, 0.35]} /></mesh>); })}
    {/* tills: counter, conveyor, scanner, register screen, a cashier each */}
    {TILLS.map(([u, v], i) => <group key={`t${i}`} position={[u, 0, v]} rotation={[0, Math.PI, 0]}>{/* customers stand on the far side from the core */}
      <mesh material={m.white} position={[0, 0.45, 0]}><boxGeometry args={[3.6, 0.9, 0.8]} /></mesh>
      <mesh material={m.belt} position={[-0.5, 0.92, 0]}><boxGeometry args={[2.2, 0.04, 0.55]} /></mesh>
      <mesh material={m.dark} position={[0.9, 0.95, 0]}><boxGeometry args={[0.35, 0.08, 0.35]} /></mesh>
      <mesh material={m.dark} position={[1.4, 1.15, -0.2]}><boxGeometry args={[0.4, 0.3, 0.05]} /></mesh>
      <mesh material={m.screen} position={[1.4, 1.15, -0.17]}><planeGeometry args={[0.34, 0.24]} /></mesh>
      {[0, Math.PI].map((r) => <mesh key={r} material={tillSign[i]} position={[0, 2.6, 0]} rotation={[0, r, 0]}><planeGeometry args={[1.2, 0.3]} /></mesh>)}
      <mesh material={m.metal} position={[0, 2.2, 0]}><cylinderGeometry args={[0.02, 0.02, 0.8, 6]} /></mesh>
      <Person p={[1.0, -0.8]} yaw={0} shirt={m.uniform} />
    </group>)}
    {/* trolleys and baskets at the entrance */}
    <group position={[BAY[0], 0, BAY[1]]}>
      {[0, 1, 2, 3].map((k) => <group key={k} position={[-1.5, 0, -k * 0.35]}><Trolley /></group>)}
      {[0, 1, 2].map((k) => <mesh key={`b${k}`} material={m.basket} position={[1.4, 0.15 + k * 0.12, 0]}><boxGeometry args={[0.44, 0.12, 0.32]} /></mesh>)}
      <mesh material={bayMat} position={[0, 2.2, 0.6]} rotation={[0, Math.PI, 0]}><planeGeometry args={[2.4, 0.6]} /></mesh>
    </group>
    {/* a stocker and a few shoppers */}
    {FIXTURES.filter((_, i) => i % 9 === 4).slice(0, 6).map((f, i) => { const [u, v] = fromRamp(f.s + (i % 2 ? 1.3 : -1.3), (f.t0 + f.t1) / 2); return <Person key={`n${i}`} p={[u, v]} yaw={yawT + (i % 2 ? -Math.PI / 2 : Math.PI / 2)} shirt={i === 0 ? m.apron : i % 2 ? m.shirt2 : m.shirt3} basket={i > 0} />; })}
    {carrier && <group ref={carry}><Trolley basket={carrier === 'basket'} /></group>}
  </group>;
}

/** Prompts for the mart (call from a component that runs every frame while near Lotte). */
export function useMartFlow() {
  useFrame(() => {
    if (lift.playerFloor !== F) { const s0 = mart.get(); if (s0.shelf || s0.checkout) mart.set({ shelf: null, checkout: false }); return; }
    const [u, v] = toTower([player.position.x, player.position.z]); const [s, t] = toRamp(u, v);
    const st = mart.get();
    if (Math.hypot(u - BAY[0], v - BAY[1]) < 2.8) {
      if (!st.carrier) {
        // trolleys stand on the left of the bay, baskets on the right
        const basket = u > BAY[0];
        game.offer({ id: 'mart-trolley', text: basket ? 'Lấy giỏ hàng (tối đa 12 món)' : 'Lấy xe đẩy', key: 'E', priority: 8, run: () => mart.set({ carrier: basket ? 'basket' : 'trolley', message: '' }) });
      } else if (!cartCount()) game.offer({ id: 'mart-return', text: `Trả ${st.carrier === 'basket' ? 'giỏ' : 'xe đẩy'}`, key: 'E', priority: 8, run: () => mart.set({ carrier: null }) });
      return;
    }
    for (const [tu, tv] of TILLS) if (Math.abs(u - tu) < 2.2 && v < tv - 0.4 && v > tv - 2.6) {
      if (cartCount()) game.offer({ id: 'mart-till', text: `Thanh toán · ${cartCount()} món · ${formatVnd(cartTotal())}`, key: 'E', priority: 9, run: () => { mart.set({ checkout: true, shelf: null }); if (document.pointerLockElement) document.exitPointerLock(); } });
      else game.offer({ id: 'mart-till-empty', text: 'Quầy thu ngân · giỏ của bạn đang trống', key: null, priority: 4 });
      return;
    }
    for (const f of FIXTURES) if (Math.abs(s - f.s) < 2.1 && t > f.t0 - 0.5 && t < f.t1 + 0.5) {
      game.offer({ id: `mart-shelf-${f.cat}`, text: `Xem kệ ${CATEGORY_NAME[f.cat]}`, key: 'E', priority: 7, run: () => { mart.set({ shelf: f.cat, checkout: false }); if (document.pointerLockElement) document.exitPointerLock(); } });
      return;
    }
    game.offer({ id: 'mart-floor', text: `LOTTE Mart · B1${st.carrier ? ` · ${st.carrier === 'basket' ? 'giỏ' : 'xe đẩy'}: ${cartCount()} món · ${formatVnd(cartTotal())}` : ' · lấy xe đẩy ở lối vào'}`, key: null, priority: 1 });
  });
}

/** Shelf, cart and till panels (DOM). */
export function MartPanel() {
  const s = useMart((x) => x);
  const money = useGame((g) => g.money);
  const [, force] = useState(0);
  if (s.receipt && !s.shelf && !s.checkout) {
    return <div className="lift-panel parking-panel" role="dialog" aria-label="Hoá đơn">
      <div className="lift-head"><b>LOTTE Mart · HOÁ ĐƠN</b><span>{new Date(s.receipt.at).toLocaleString('vi-VN')}</span></div>
      <ul className="mart-list">{s.receipt.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div className="lift-foot"><span>Tổng: <b>{formatVnd(s.receipt.total)}</b> · hàng đã vào balo (B)</span><button onClick={() => mart.set({ receipt: null })}>Đóng</button></div>
    </div>;
  }
  if (s.shelf) {
    const prods = PRODUCTS.filter((p) => p.category === s.shelf);
    return <div className="lift-panel parking-panel" role="dialog" aria-label="Kệ hàng">
      <div className="lift-head"><b>LOTTE Mart · {CATEGORY_NAME[s.shelf]}</b><span>{s.carrier ? `${s.carrier === 'basket' ? 'Giỏ' : 'Xe đẩy'}: ${cartCount()} món · ${formatVnd(cartTotal())}` : 'Chưa lấy xe đẩy / giỏ'}</span></div>
      <table className="parking-table"><tbody>
        {prods.map((p: Product) => <tr key={p.productId}><td>{p.icon} {p.name}</td><td style={{ whiteSpace: 'nowrap' }}>{formatVnd(p.price)}</td><td style={{ whiteSpace: 'nowrap', opacity: 0.7 }}>còn {shelfLeft(p)}</td>
          <td style={{ whiteSpace: 'nowrap' }}><button onClick={() => { addToCart(p.productId, -1); force((n) => n + 1); }} disabled={!s.cart[p.productId]}>−</button> {s.cart[p.productId] ?? 0} <button onClick={() => { addToCart(p.productId, 1); force((n) => n + 1); }}>+</button></td></tr>)}
      </tbody></table>
      {s.message && <p className="parking-msg">{s.message}</p>}
      <div className="lift-foot"><span>Giá trong game. Thanh toán ở quầy cạnh thang máy.</span><button onClick={() => mart.set({ shelf: null, message: '' })}>Đóng</button></div>
    </div>;
  }
  if (s.checkout) {
    const lines = Object.entries(s.cart);
    return <div className="lift-panel parking-panel" role="dialog" aria-label="Thanh toán">
      <div className="lift-head"><b>LOTTE Mart · THANH TOÁN</b><span>{cartCount()} món</span></div>
      <table className="parking-table"><tbody>
        {lines.map(([id, n]) => { const p = productById(id)!; return <tr key={id}><td>{p.icon} {p.name}</td><td>× {n}</td><td>{formatVnd(p.price * n)}</td><td><button onClick={() => addToCart(id, -1)}>Bỏ 1</button></td></tr>; })}
        <tr className="total"><td>Tổng</td><td></td><td>{formatVnd(cartTotal())}</td><td></td></tr>
        <tr><td>Số dư ví</td><td></td><td>{formatVnd(money)}</td><td></td></tr>
      </tbody></table>
      {s.message && <p className="parking-msg">{s.message}</p>}
      <div className="lift-foot"><span>Tiền ảo trong game.</span><button onClick={() => { if (payCart()) mart.set({ carrier: null }); }}>Thanh toán</button><button onClick={() => mart.set({ checkout: false, message: '' })}>Đóng</button></div>
    </div>;
  }
  return null;
}

if (import.meta.env.DEV) (window as unknown as { __mart?: unknown }).__mart = { FIXTURES, TILLS, BAY, mart };
