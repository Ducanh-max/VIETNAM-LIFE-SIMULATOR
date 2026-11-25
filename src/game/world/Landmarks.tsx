import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, insidePolygon, registerBlocker, registerHeight, registerObstacles, type Obstacle, type Point } from '../geo';
import { baDinhFlagBase, lakes, landmarkFootprint, lawns } from '../osm';
import { trs, unitBox, Instances } from './Instances';
import { materials } from './materials';
import { cornerCurlGeometry, curvedRoofGeometry } from './roofGeometry';
import { latticeTexture, limeStoneTexture } from './textures';

/*
 * Hand-modelled landmarks of Ba Đình and Văn Miếu, each placed and turned on its OpenStreetMap footprint.
 * Sizes come from the Vietnamese / English Wikipedia articles (read 25/11/2026); see docs/round-7/LANDMARKS.md
 * for every figure, its source, and what is my own estimate.
 *  - Lăng Chủ tịch Hồ Chí Minh: 21,6 m high, 41,2 m wide, three layers (stepped base, colonnade of square grey
 *    granite columns, stepped roof), inscription "CHỦ TỊCH HỒ-CHÍ-MINH" in dark red stone on the front, entrance
 *    facing east onto Quảng trường Ba Đình, two 65 m viewing stands to the north and south.
 *  - Quảng trường Ba Đình: 210 grass squares (7 across × 30 deep) with 1,4 m paths, a 30 m flagpole in the middle.
 *  - Cột cờ Hà Nội: three square brick tiers 42,5 × 3,1 m, 27 × 3,7 m, 12,8 × 5,1 m (doors E, S, W on the top tier),
 *    an octagonal shaft (sides 2,13 m, 18,2 m high), a 3,3 m lantern with 8 windows and an 8 m flagpole.
 *  - Chùa Một Cột: a 3 × 3 m shrine with a four-cornered tiled roof on one stone pillar (1,2 m across, 4 m above
 *    ground) in the square pond Linh Chiểu, with a stair from the bank.
 *  - Văn Miếu: Khuê Văn Các (6,8 m square base on four brick pillars, a square upper pavilion with round windows and
 *    eight roof planes) and the Văn Miếu Môn gate.
 */

type Frame = { o: Point; x: Point; rot: number };
const local = (f: Frame, u: number, v: number): Point => [f.o[0] + f.x[0] * u - f.x[1] * v, f.o[1] + f.x[1] * u + f.x[0] * v];
const toLocal = (f: Frame, p: Point): Point => { const dx = p[0] - f.o[0], dz = p[1] - f.o[1]; return [dx * f.x[0] + dz * f.x[1], -dx * f.x[1] + dz * f.x[0]]; };
const centroid = (r: Point[]): Point => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
/** A frame whose local +x is `x` (unit, world XZ); `rot` is the matching three.js Y rotation. */
const frame = (o: Point, x: Point): Frame => ({ o, x, rot: Math.atan2(-x[1], x[0]) });
function longestEdge(ring: Point[]) {
  let best = 0, a = ring[0], b = ring[1];
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > best) { best = l; a = p; b = q; } }
  return { a, b, len: best, dir: [(b[0] - a[0]) / best, (b[1] - a[1]) / best] as Point, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point };
}
const obstacle = (f: Frame, u: number, v: number, hu: number, hv: number): Obstacle => { const [x, z] = local(f, u, v); return { x, z, hx: hu, hz: hv, angle: f.rot }; };

// ---- materials and textures ----
let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    granite: new THREE.MeshStandardMaterial({ color: '#b9b8b4', roughness: 0.62 }),
    graniteDark: new THREE.MeshStandardMaterial({ color: '#6a5354', roughness: 0.35, metalness: 0.05 }),
    graniteMid: new THREE.MeshStandardMaterial({ color: '#9c9a96', roughness: 0.5 }),
    shadow: new THREE.MeshStandardMaterial({ color: '#2a2726', roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ map: limeStoneTexture('#b9a888'), roughness: 0.95 }),
    brickDark: new THREE.MeshStandardMaterial({ map: limeStoneTexture('#8f8268'), roughness: 1 }),
    path: new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    white: new THREE.MeshStandardMaterial({ color: '#efefea', roughness: 0.4, metalness: 0.3 }),
    glaze: new THREE.MeshStandardMaterial({ color: '#3f7d5e', roughness: 0.35 }),
    plaster: new THREE.MeshStandardMaterial({ color: '#ebe4d2', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#6b3a26', roughness: 0.7 }),
    lattice: new THREE.MeshStandardMaterial({ map: latticeTexture(), roughness: 0.6 }),
  };
}
const M = () => (mats ??= makeMats());

function inscription() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#6e2230'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 70px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText('CHỦ TỊCH HỒ-CHÍ-MINH', 512, 52, 1000);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function flagTexture() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 200;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#da251d'; ctx.fillRect(0, 0, 300, 200);
  ctx.fillStyle = '#ffde00'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 26 : 64; const a = -Math.PI / 2 + (i * Math.PI) / 5; const x = 150 + Math.cos(a) * r, y = 104 + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A national flag that ripples in the wind; the hoist edge is at x = 0. */
function Flag({ w, h }: { w: number; h: number }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(w, h, 16, 6).translate(w / 2, 0, 0), [w, h]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 }), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(({ clock }) => {
    const p = geo.attributes.position as THREE.BufferAttribute; const t = clock.elapsedTime;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3]; const k = x / w; p.setZ(i, Math.sin(x * 1.3 - t * 3.2) * 0.35 * k + Math.sin(x * 2.9 - t * 4.7) * 0.08 * k); }
    p.needsUpdate = true; geo.computeVertexNormals();
  });
  return <mesh geometry={geo} material={mat} castShadow />;
}

/** A small tiled hip roof with curled corners (no separate hip beams, which float above a roof this small). */
function Roof({ width, depth, rise, y = 0, ridge, curl = 0.5, pearl = false }: { width: number; depth: number; rise: number; y?: number; ridge?: number; curl?: number; dragons?: boolean; pearl?: boolean }) {
  const m = materials();
  const surface = useMemo(() => curvedRoofGeometry(width, depth, rise, { ridge: ridge ?? width * 0.45, curl }), [width, depth, rise, ridge, curl]);
  const tip = useMemo(() => cornerCurlGeometry(Math.min(width, depth) * 0.09, curl * 0.7 + 0.1), [width, depth, curl]);
  const r = ridge ?? width * 0.45;
  return <group position={[0, y, 0]}>
    <mesh geometry={surface} material={m.roof} castShadow receiveShadow />
    <mesh position={[0, rise + 0.06, 0]} castShadow><boxGeometry args={[r + 0.25, 0.2, 0.24]} /><primitive object={m.ridge} attach="material" /></mesh>
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={tip} material={m.ridge} position={[sx * width * 0.47, curl * 0.95, sz * depth * 0.47]} rotation={[0, Math.atan2(-sz * depth, sx * width), 0]} castShadow />))}
    {pearl && <mesh position={[0, rise + 0.42, 0]} castShadow><sphereGeometry args={[0.22, 14, 10]} /><primitive object={m.gold} attach="material" /></mesh>}
  </group>;
}

function Box({ p, s, m, r = 0 }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; r?: number }) {
  return <mesh position={p} scale={s} rotation={[0, r, 0]} geometry={unitBox} material={m} castShadow receiveShadow />;
}

// ---------------------------------------------------------------------------------------------
// Lăng Chủ tịch Hồ Chí Minh and Quảng trường Ba Đình
// ---------------------------------------------------------------------------------------------
const LANG_DEPTH = 36; // east–west extent of the stepped base (fits the OSM footprint)
const LANG_WIDTH = 41.2; // Wikipedia
// the two 65 m viewing stands, where OSM maps them (about 10 m in front of the mausoleum's centre, 61,5 m either side)
const STAND_U = 10, STAND_V = 61.5;
function langFrame(): Frame | null {
  const fp = landmarkFootprint('Lăng Chủ tịch Hồ Chí Minh'); if (!fp) return null;
  const e = longestEdge(fp); const c = centroid(fp);
  // outward normal of the longest (east) edge: the front, facing the square
  let n: Point = [-e.dir[1], e.dir[0]];
  if ((e.mid[0] - c[0]) * n[0] + (e.mid[1] - c[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return frame([e.mid[0] - n[0] * LANG_DEPTH / 2, e.mid[1] - n[1] * LANG_DEPTH / 2], n);
}

function Lang({ f }: { f: Frame }) {
  const m = M();
  const text = useMemo(() => new THREE.MeshBasicMaterial({ map: inscription(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  useEffect(() => registerObstacles([
    obstacle(f, 0, 0, LANG_DEPTH / 2, LANG_WIDTH / 2),
    ...[-1, 1].map((s) => obstacle(f, STAND_U, s * STAND_V, 8, 32.5)),
  ]), [f]);
  const cols = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    const hu = 14, hv = 15, n = 10; // colonnade 28 × 30 m, 10 square columns a side (column count is my estimate)
    for (let i = 0; i < n; i++) { const t = -hv + (i * 2 * hv) / (n - 1); list.push(trs(hu, 0, t, 0, 1.1, 1, 1.1), trs(-hu, 0, t, 0, 1.1, 1, 1.1)); }
    for (let i = 1; i < n - 1; i++) { const t = -hu + (i * 2 * hu) / (n - 1); list.push(trs(t, 0, hv, 0, 1.1, 1, 1.1), trs(t, 0, -hv, 0, 1.1, 1, 1.1)); }
    return list.map((mx) => mx.premultiply(new THREE.Matrix4().makeTranslation(0, 3.6 + 4.2, 0)).multiply(new THREE.Matrix4().makeScale(1, 8.4, 1)));
  }, []);
  const steps = useMemo(() => { // the two 65 m viewing stands: seven grey steps rising away from the square
    const list: THREE.Matrix4[] = [];
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) { const d = 16 - k * 2; list.push(trs(STAND_U - 8 + d / 2, 0.25 + k * 0.5, s * STAND_V, 0, d, 0.5, 65)); }
    return list;
  }, []);
  const g = GROUND_HEIGHT;
  return <group position={[f.o[0], g, f.o[1]]} rotation={[0, f.rot, 0]}>
    {/* stepped base (bậc thềm tam cấp) */}
    <Box p={[0, 0.6, 0]} s={[LANG_DEPTH, 1.2, LANG_WIDTH]} m={m.granite} />
    <Box p={[-0.6, 1.8, 0]} s={[LANG_DEPTH - 3.2, 1.2, LANG_WIDTH - 2.4]} m={m.granite} />
    <Box p={[-1.0, 3.0, 0]} s={[LANG_DEPTH - 5.6, 1.2, LANG_WIDTH - 5.2]} m={m.graniteDark} />
    {/* front stair in the middle of the base */}
    {[0, 1, 2, 3, 4, 5].map((k) => <Box key={k} p={[LANG_DEPTH / 2 + 1.2 - k * 0.55, 0.3 + k * 0.6, 0]} s={[1.1, 0.6, 9]} m={m.granite} />)}
    {/* the hall behind the colonnade */}
    <Box p={[-0.5, 7.8, 0]} s={[24, 8.4, 26]} m={m.graniteDark} />
    <Box p={[11.6, 6.0, 0]} s={[0.4, 4.6, 3.4]} m={m.shadow} />
    <Instances geometry={unitBox} material={m.granite} matrices={cols} />
    {/* entablature with the inscription, then the stepped roof (three low steps) */}
    <Box p={[0, 14.1, 0]} s={[30.4, 4.2, 32.4]} m={m.granite} />
    <mesh position={[15.22, 14.0, 0]} rotation={[0, Math.PI / 2, 0]} material={text}><planeGeometry args={[28, 2.9]} /></mesh>
    <Box p={[0, 16.6, 0]} s={[30.8, 0.8, 32.8]} m={m.graniteMid} />
    <Box p={[0, 17.8, 0]} s={[28.4, 1.6, 30.4]} m={m.granite} />
    <Box p={[0, 19.4, 0]} s={[26.0, 1.6, 28.0]} m={m.granite} />
    <Box p={[0, 20.9, 0]} s={[23.6, 1.4, 25.6]} m={m.granite} />
    <Instances geometry={unitBox} material={m.granite} matrices={steps} />
  </group>;
}

/** The lawn of Quảng trường Ba Đình in front of the mausoleum: 7 × 30 grass squares with 1,4 m paths, flagpole in the middle. */
function BaDinhSquare({ f }: { f: Frame }) {
  const m = M();
  const data = useMemo(() => {
    const lawn = lawns.filter((l) => { const c = toLocal(f, centroid(l.ring)); return c[0] > 20 && c[0] < 200 && Math.abs(c[1]) < 200; })
      .sort((a, b) => b.ring.length * 0 + area(b.ring) - area(a.ring))[0];
    if (!lawn) return null;
    const pts = lawn.ring.map((p) => toLocal(f, p));
    const u0 = Math.min(...pts.map((p) => p[0])) + 2, u1 = Math.max(...pts.map((p) => p[0])) - 2;
    const v0 = Math.min(...pts.map((p) => p[1])) + 2, v1 = Math.max(...pts.map((p) => p[1])) - 2;
    const list: THREE.Matrix4[] = [];
    const y = 0.045, w = 1.4;
    for (let i = 0; i <= 7; i++) { const u = u0 + ((u1 - u0) * i) / 7; list.push(trs(u, y, (v0 + v1) / 2, 0, w, 0.02, v1 - v0 + w)); }
    for (let j = 0; j <= 30; j++) { const v = v0 + ((v1 - v0) * j) / 30; list.push(trs((u0 + u1) / 2, y, v, 0, u1 - u0 + w, 0.02, w)); }
    // the flagpole stands on the mausoleum's axis where OSM maps its base, else mid-lawn
    return { list, pole: baDinhFlagBase ? toLocal(f, baDinhFlagBase) : [(u0 + u1) / 2, 0] as Point };
  }, [f]);
  useEffect(() => { if (!data) return; return registerObstacles([obstacle(f, data.pole[0], data.pole[1], 3.2, 3.2)]); }, [f, data]);
  if (!data) return null;
  return <group position={[f.o[0], GROUND_HEIGHT, f.o[1]]} rotation={[0, f.rot, 0]}>
    <Instances geometry={unitBox} material={m.path} matrices={data.list} castShadow={false} />
    <group position={[data.pole[0], 0, data.pole[1]]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow><cylinderGeometry args={[4, 4.4, 0.6, 32]} /><primitive object={m.granite} attach="material" /></mesh>
      <mesh position={[0, 15.3, 0]} castShadow><cylinderGeometry args={[0.12, 0.22, 30, 12]} /><primitive object={m.white} attach="material" /></mesh>
      <mesh position={[0, 30.4, 0]}><sphereGeometry args={[0.22, 12, 8]} /><primitive object={materials().gold} attach="material" /></mesh>
      <group position={[0.15, 27.5, 0]} rotation={[0, 0.6, 0]}><Flag w={6} h={4} /></group>
    </group>
  </group>;
}
function area(r: Point[]) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }

// ---------------------------------------------------------------------------------------------
// Cột cờ Hà Nội
// ---------------------------------------------------------------------------------------------
function Tier({ y, s0, s1, h, m }: { y: number; s0: number; s1: number; h: number; m: THREE.Material }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(s1 / Math.SQRT2, s0 / Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4), [s0, s1, h]);
  return <mesh geometry={geo} material={m} position={[0, y + h / 2, 0]} castShadow receiveShadow />;
}
function Parapet({ y, s, m }: { y: number; s: number; m: THREE.Material }) {
  const list = useMemo(() => {
    const out: THREE.Matrix4[] = []; const n = Math.max(4, Math.round(s / 2.2));
    for (let side = 0; side < 4; side++) for (let i = 0; i < n; i++) {
      const t = -s / 2 + (s * (i + 0.5)) / n; const rot = (side * Math.PI) / 2; const c = Math.cos(rot), sn = Math.sin(rot);
      const x = t * c + (s / 2 - 0.2) * sn, z = -t * sn + (s / 2 - 0.2) * c;
      out.push(trs(x, y + 0.45, z, rot, (s / n) * 0.62, 0.9, 0.4));
    }
    return out;
  }, [y, s]);
  return <Instances geometry={unitBox} material={m} matrices={list} />;
}
function CotCo({ f }: { f: Frame }) {
  const m = M();
  useEffect(() => registerObstacles([obstacle(f, 0, 0, 21.25, 21.25)]), [f]);
  const shaft = useMemo(() => new THREE.CylinderGeometry(2.45, 2.78, 18.2, 8, 1), []);
  const windows = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (let k = 0; k < 8; k++) for (let r = 0; r < 5; r++) { if ((k + r) % 2) continue; const a = (k + 0.5) * Math.PI / 4; const y = 15 + r * 3.2; const rad = 2.72 - (y - 11.9) / 18.2 * 0.3; out.push(trs(Math.sin(a) * rad, y, Math.cos(a) * rad, a, 0.55, 0.75, 0.12)); }
    return out;
  }, []);
  const y1 = 3.1, y2 = y1 + 3.7, y3 = y2 + 5.1, yTop = y3 + 18.2;
  return <group position={[f.o[0], GROUND_HEIGHT, f.o[1]]} rotation={[0, f.rot, 0]}>
    <Tier y={0} s0={42.5} s1={41.6} h={y1} m={m.brick} />
    <Parapet y={y1} s={41.6} m={m.brick} />
    <Tier y={y1} s0={27} s1={26.2} h={3.7} m={m.brick} />
    <Parapet y={y2} s={26.2} m={m.brick} />
    <Tier y={y2} s0={12.8} s1={12.2} h={5.1} m={m.brick} />
    {/* doors on the east, south and west faces of the top tier (none on the north) */}
    {[0, 1, 3].map((k) => { const a = k * Math.PI / 2; return <Box key={k} p={[Math.sin(a + Math.PI / 2) * 6.3, y2 + 1.6, Math.cos(a + Math.PI / 2) * 6.3]} s={[0.3, 3.0, 1.8]} r={a} m={m.shadow} />; })}
    {/* stairs up the two lower tiers on the south side */}
    <Box p={[0, y1 / 2, 21.25 + 1.6]} s={[3, y1, 3.2]} m={m.brickDark} />
    <Box p={[0, y1 + 3.7 / 2, 13.5 + 1.6]} s={[3, 3.7, 3.2]} m={m.brickDark} />
    <mesh geometry={shaft} material={m.brick} position={[0, y3 + 9.1, 0]} castShadow receiveShadow />
    <Instances geometry={unitBox} material={m.shadow} matrices={windows} castShadow={false} />
    {/* the lantern: 3,3 m, eight windows, and the flagpole */}
    <mesh position={[0, yTop + 1.65, 0]} castShadow><cylinderGeometry args={[2.0, 2.2, 3.3, 8]} /><primitive object={m.brick} attach="material" /></mesh>
    {Array.from({ length: 8 }, (_, k) => { const a = (k + 0.5) * Math.PI / 4; return <Box key={k} p={[Math.sin(a) * 2.05, yTop + 1.7, Math.cos(a) * 2.05]} s={[0.7, 1.4, 0.15]} r={a} m={m.shadow} />; })}
    <mesh position={[0, yTop + 3.5, 0]} castShadow><cylinderGeometry args={[1.6, 2.4, 0.4, 8]} /><primitive object={m.brickDark} attach="material" /></mesh>
    <mesh position={[0, yTop + 3.7 + 4, 0]} castShadow><cylinderGeometry args={[0.1, 0.2, 8, 10]} /><primitive object={m.white} attach="material" /></mesh>
    <group position={[0.1, yTop + 10.3, 0]} rotation={[0, 0.9, 0]}><Flag w={6} h={4} /></group>
  </group>;
}

// ---------------------------------------------------------------------------------------------
// Chùa Một Cột (Liên Hoa Đài)
// ---------------------------------------------------------------------------------------------
const PLATFORM_Y = 4.3; // floor of the shrine above the ground (pillar 4 m + beams)
function hull(points: Point[]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Point[] = [], up: Point[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function motCotSetup() {
  const fp = landmarkFootprint('Chùa Một Cột'); const pond = lakes.find((l) => l.name === 'Hồ Linh Chiểu');
  if (!fp || !pond) return null;
  const c = centroid(fp); const h = hull(pond.ring);
  // the stair comes in along the narrow strip of bank cut into the pond: the pond vertex nearest the shrine
  const tip = pond.ring.reduce((b, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(b[0] - c[0], b[1] - c[1]) ? p : b));
  let d: Point = [tip[0] - c[0], tip[1] - c[1]]; const dl = Math.hypot(d[0], d[1]) || 1; d = [d[0] / dl, d[1] / dl];
  // snap to the pond's square edges
  const e = longestEdge(h); const cands: Point[] = [e.dir, [-e.dir[1], e.dir[0]], [-e.dir[0], -e.dir[1]], [e.dir[1], -e.dir[0]]];
  const x = cands.reduce((b, q) => (q[0] * d[0] + q[1] * d[1] > b[0] * d[0] + b[1] * d[1] ? q : b));
  const f = frame(c, x);
  let reach = 2; while (reach < 20 && insidePolygon(local(f, reach, 0), h)) reach += 0.25;
  return { f, pond: pond.ring, hull: h, reach: reach + 0.6 };
}
function ChuaMotCot({ s }: { s: NonNullable<ReturnType<typeof motCotSetup>> }) {
  const m = M(); const { f, reach } = s;
  const onStair = (u: number, v: number) => u > 1.2 && u < reach && Math.abs(v) < 0.75;
  const onDeck = (u: number, v: number) => Math.abs(u) < 1.75 && Math.abs(v) < 1.75;
  useEffect(() => {
    const block = registerBlocker((p) => {
      const [u, v] = toLocal(f, p); if (Math.abs(u) > 14 || Math.abs(v) > 14) return false;
      if (onStair(u, v) || (onDeck(u, v) && !(Math.abs(u) < 1.2 && Math.abs(v) < 1.2))) return false;
      if (Math.abs(u) < 1.2 && Math.abs(v) < 1.2) return true; // the altar inside the shrine
      return insidePolygon(p, s.pond);
    });
    const height = registerHeight((p) => {
      const [u, v] = toLocal(f, p);
      if (onDeck(u, v)) return GROUND_HEIGHT + PLATFORM_Y;
      if (onStair(u, v)) return GROUND_HEIGHT + PLATFORM_Y * (1 - (u - 1.75) / (reach - 1.75));
      return null;
    });
    return () => { block(); height(); };
  }, [f, reach]);
  const stairs = useMemo(() => {
    const out: THREE.Matrix4[] = []; const n = Math.ceil((reach - 1.75) / 0.3);
    for (let k = 0; k < n; k++) { const u = reach - (k + 0.5) * ((reach - 1.75) / n); const top = PLATFORM_Y * (k + 1) / n; const h = Math.min(top, 0.7); out.push(trs(u, top - h / 2, 0, 0, (reach - 1.75) / n + 0.02, h, 1.5)); }
    // brick side walls of the flight, as sloped slabs
    const run = reach - 1.75, len = Math.hypot(run, PLATFORM_Y), tilt = Math.atan2(PLATFORM_Y, run);
    for (const sv of [-0.82, 0.82]) out.push(trs(1.75 + run / 2, PLATFORM_Y / 2 + 0.05, sv, 0, len, 0.75, 0.16, 0, -tilt));
    return out;
  }, [reach]);
  const rail = useMemo(() => { // green glazed balustrade round the pond
    const out: THREE.Matrix4[] = []; const r = s.hull;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      const n = Math.max(1, Math.round(l / 1.2));
      for (let k = 0; k < n; k++) { // in short pieces, leaving the gap where the stair comes in
        const t = (k + 0.5) / n; const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const [u, v] = toLocal(f, p); if (u > 0 && Math.abs(v) < 1.3) continue;
        out.push(trs(p[0], GROUND_HEIGHT + 0.4, p[1], ang, l / n + 0.05, 0.8, 0.3));
      }
    }
    return out;
  }, [s]);
  const struts = useMemo(() => Array.from({ length: 8 }, (_, k) => { const a = (k * Math.PI) / 4; return { a, x: Math.cos(a) * 0.9, z: Math.sin(a) * 0.9 }; }), []);
  return <group>
    <Instances geometry={unitBox} material={m.glaze} matrices={rail} />
    <group position={[f.o[0], GROUND_HEIGHT, f.o[1]]} rotation={[0, f.rot, 0]}>
      {/* the single stone pillar */}
      <mesh position={[0, 1.8, 0]} castShadow receiveShadow><cylinderGeometry args={[0.6, 0.6, 4.2, 20]} /><primitive object={materials().stone} attach="material" /></mesh>
      {/* the timber brackets opening like a lotus from the pillar top to the platform */}
      {struts.map((s2, k) => <mesh key={k} position={[s2.x, 3.65, s2.z]} rotation={[0, -s2.a, -0.75]} castShadow><boxGeometry args={[1.5, 0.16, 0.16]} /><primitive object={m.wood} attach="material" /></mesh>)}
      <Box p={[0, PLATFORM_Y - 0.15, 0]} s={[3.5, 0.3, 3.5]} m={m.wood} />
      {/* the shrine, 3 × 3 m: posts, lattice walls with the door to the stair, railing */}
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => <Box key={`${a}${b}`} p={[a * 1.4, PLATFORM_Y + 1.1, b * 1.4]} s={[0.2, 2.2, 0.2]} m={materials().darkRed} />))}
      <Box p={[-1.38, PLATFORM_Y + 1.0, 0]} s={[0.08, 2.0, 2.6]} m={m.lattice} />
      <Box p={[0, PLATFORM_Y + 1.0, 1.38]} s={[2.6, 2.0, 0.08]} m={m.lattice} />
      <Box p={[0, PLATFORM_Y + 1.0, -1.38]} s={[2.6, 2.0, 0.08]} m={m.lattice} />
      <Box p={[1.38, PLATFORM_Y + 1.85, 0]} s={[0.1, 0.4, 2.6]} m={materials().darkRed} />
      <Box p={[-0.9, PLATFORM_Y + 0.6, 0]} s={[0.6, 1.2, 1.2]} m={materials().darkRed} />
      <Roof width={5.6} depth={5.6} rise={1.5} y={PLATFORM_Y + 2.2} ridge={0.5} curl={0.55} pearl />
      {/* the stair from the bank */}
      <Instances geometry={unitBox} material={m.brick} matrices={stairs} />
    </group>
  </group>;
}

// ---------------------------------------------------------------------------------------------
// Văn Miếu: Khuê Văn Các and Văn Miếu Môn
// ---------------------------------------------------------------------------------------------
function footFrame(name: string) {
  const fp = landmarkFootprint(name); if (!fp) return null;
  const e = longestEdge(fp); return frame(centroid(fp), e.dir);
}
function sunWindow() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6b3a26'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1c1410'; ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c99a4e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10); ctx.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(64, 64, 10, 0, Math.PI * 2); ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function KhueVanCac({ f }: { f: Frame }) {
  const m = M();
  const sun = useMemo(() => new THREE.MeshStandardMaterial({ map: sunWindow(), roughness: 0.7 }), []);
  useEffect(() => registerObstacles([...[-1, 1].flatMap((a) => [-1, 1].map((b) => obstacle(f, a * 2.9, b * 2.9, 0.6, 0.6)))]), [f]);
  return <group position={[f.o[0], GROUND_HEIGHT, f.o[1]]} rotation={[0, f.rot, 0]}>
    <Box p={[0, 0.15, 0]} s={[7.6, 0.3, 7.6]} m={m.brickDark} />
    {/* four brick pillars, 1 m square */}
    {[-1, 1].flatMap((a) => [-1, 1].map((b) => <Box key={`${a}${b}`} p={[a * 2.9, 2.1, b * 2.9]} s={[1, 3.6, 1]} m={m.plaster} />))}
    {/* the square upper storey: floor, balcony rail, wooden walls with a round "sun" window on each side */}
    <Box p={[0, 4.05, 0]} s={[7.2, 0.3, 7.2]} m={m.wood} />
    {[0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2; return <group key={k} rotation={[0, a, 0]}>
      <Box p={[0, 4.55, 3.5]} s={[7, 0.7, 0.1]} m={m.lattice} />
      <Box p={[0, 5.4, 2.4]} s={[4.8, 2.4, 0.15]} m={m.wood} />
      <mesh position={[0, 5.45, 2.49]} material={sun}><planeGeometry args={[1.6, 1.6]} /></mesh>
    </group>; })}
    <Roof width={8.4} depth={8.4} rise={0.7} y={6.4} ridge={0.1} curl={0.55} dragons={false} />
    <Box p={[0, 7.3, 0]} s={[4.2, 1.0, 4.2]} m={m.wood} />
    <Roof width={6.2} depth={6.2} rise={1.4} y={7.8} ridge={0.1} curl={0.6} dragons={false} pearl />
  </group>;
}
function VanMieuMon({ f }: { f: Frame }) {
  const m = M();
  useEffect(() => registerObstacles([obstacle(f, 0, -3.6, 1.5, 2.2), obstacle(f, 0, 3.6, 1.5, 2.2)]), [f]);
  // a three-opening gate (tam quan): the middle bay two storeys, the upper storey smaller, on brick
  return <group position={[f.o[0], GROUND_HEIGHT, f.o[1]]} rotation={[0, f.rot, 0]}>
    {[-1, 1].map((s) => <Box key={s} p={[0, 2.2, s * 3.6]} s={[3, 4.4, 4.4]} m={m.plaster} />)}
    <Box p={[0, 4.9, 0]} s={[3.2, 1.0, 11.6]} m={m.plaster} />
    <Box p={[0, 6.3, 0]} s={[2.6, 1.8, 3.4]} m={m.plaster} />
    <Roof width={4.6} depth={13} rise={0.9} y={5.4} ridge={9} curl={0.45} dragons={false} />
    <Roof width={3.8} depth={5} rise={1.2} y={7.2} ridge={2.2} curl={0.55} />
  </group>;
}

export function Landmarks() {
  const lang = useMemo(langFrame, []);
  const cotCo = useMemo(() => footFrame('Cột cờ Hà Nội'), []);
  const motCot = useMemo(motCotSetup, []);
  const khue = useMemo(() => footFrame('Khuê Văn Các'), []);
  const mon = useMemo(() => footFrame('Văn Miếu Môn'), []);
  return <group>
    {lang && <Lang f={lang} />}
    {lang && <BaDinhSquare f={lang} />}
    {cotCo && <CotCo f={cotCo} />}
    {motCot && <ChuaMotCot s={motCot} />}
    {khue && <KhueVanCac f={khue} />}
    {mon && <VanMieuMon f={mon} />}
  </group>;
}

if (import.meta.env.DEV) (window as unknown as { __landmarks?: unknown }).__landmarks = { langFrame, motCotSetup, footFrame, local };
