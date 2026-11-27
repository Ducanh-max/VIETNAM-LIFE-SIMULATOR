import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, insidePolygon, type Point } from '../geo';
import { ATRIUM, ESC_LANES, ESCALATORS, escalatorHere, floorY, fromRamp, inPodiumPlate, lift, LOTTE, mallBlockers, MALL_TOP, RAMP, toRamp, toTower, towerRing } from '../lotte';
import { buy, closeShop, MALL_SHOPS, mall, owned, tryOn, useMall, type MallShop } from '../lotteMall';
import { bike, formatVnd, game, player, useGame } from '../state';

/*
 * Department store, floors 1–6 of Lotte Center (spec section 9): the podium's 6 m storeys around a central atrium
 * with criss-cross escalators (lotte.ts ESCALATORS), shop units with glass fronts, signs, mannequins, racks, a mirror and
 * a till; cream polished stone floor (#E5DFD1), white ceiling (#F4F3EF) with downlights, stone-clad columns, glass
 * railings with black handrails, benches, planters, a directory board and an information desk on floor 1. Only the
 * player's floor is drawn (with the floor below seen through the atrium). The shops' trades follow the spec's
 * suggested floor plan and their brands are made up (lotteMall.ts).
 */
const H = 5.6;
type Unit = { s: number; t0: number; t1: number; front: number; face: 1 | -1; shop: MallShop | null };
const UNIT_W = 8;
/** Shop units along the podium's long walls (ramp frame), shops of this floor first, the rest shuttered. */
function unitsFor(f: number): Unit[] {
  const out: Unit[] = [];
  const ok = (s: number, t: number) => { const [u, v] = fromRamp(s, t); return inPodiumPlate(u, v); };
  for (const band of [{ t0: 2.5, t1: 10.5, face: 1 as const }, { t0: 34.5, t1: 41.5, face: -1 as const }]) {
    for (let s = 4; s + UNIT_W <= 78; s += UNIT_W) {
      if (f === 1 && band.face === 1 && s < RAMP.S1 + 4) continue; // floor 1: the street ramp runs behind a wall there
      const sc = s + UNIT_W / 2;
      if (!(ok(s + 0.3, band.t0) && ok(s + UNIT_W - 0.3, band.t0) && ok(s + 0.3, band.t1) && ok(s + UNIT_W - 0.3, band.t1))) continue;
      out.push({ s: sc, t0: band.t0, t1: band.t1, front: band.face === 1 ? band.t1 : band.t0, face: band.face, shop: null });
    }
  }
  const shops = MALL_SHOPS.filter((x) => x.floor === f);
  // open shops nearest the escalators
  const byDist = [...out].sort((a, b) => Math.abs(a.s - (ATRIUM.s0 + ATRIUM.s1) / 2) - Math.abs(b.s - (ATRIUM.s0 + ATRIUM.s1) / 2));
  shops.forEach((sh, i) => { if (byDist[i]) byDist[i].shop = sh; });
  return out;
}
const UNITS = new Map<number, Unit[]>();
const unitsOf = (f: number) => { let u = UNITS.get(f); if (!u) { u = unitsFor(f); UNITS.set(f, u); } return u; };
/** Columns (ramp frame): two lines along the aisles, every 9 m, clear of the atrium. */
const COLUMNS: Point[] = [];
for (const t of [17.5, 33.2]) for (let s = 6; s < 78; s += 9) if (!(s > ATRIUM.s0 - 1 && s < ATRIUM.s1 + 1 && t > ATRIUM.t0 - 1 && t < ATRIUM.t1 + 1)) { const [u, v] = fromRamp(s, t); if (inPodiumPlate(u, v)) COLUMNS.push([s, t]); }
const BENCHES: Point[] = [[ATRIUM.s0 - 5, 21], [ATRIUM.s1 + 5, 21], [ATRIUM.s0 - 5, 28], [ATRIUM.s1 + 5, 28]];
mallBlockers.push((u, v, f) => {
  if (f < 1 || f > MALL_TOP) return false;
  const [s, t] = toRamp(u, v);
  for (const [cs, ct] of COLUMNS) if (Math.abs(s - cs) < 0.55 && Math.abs(t - ct) < 0.55) return true;
  for (const [bs, bt] of BENCHES) if (Math.abs(s - bs) < 1.0 && Math.abs(t - bt) < 0.3) return true;
  for (const un of unitsOf(f)) {
    // partition walls between units and the till counter at the back
    if (t > un.t0 && t < un.t1 && (Math.abs(s - (un.s - UNIT_W / 2)) < 0.12 || Math.abs(s - (un.s + UNIT_W / 2)) < 0.12)) return true;
    if (un.shop && Math.abs(s - un.s) < 1.3 && Math.abs(t - (un.face === 1 ? un.t0 + 1.6 : un.t1 - 1.6)) < 0.45) return true;
    if (!un.shop && t > un.t0 && t < un.t1 && Math.abs(s - un.s) < UNIT_W / 2 && Math.abs(t - un.front) < 0.2) return true; // shutter
  }
  if (f === 1 && s > -1 && s < RAMP.S1 + 4 && Math.abs(t - (RAMP.strips.A[1] + 0.8)) < 0.2) return true; // wall along the street ramp
  return false;
});

const unitBox = new THREE.BoxGeometry(1, 1, 1);
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const label = (text: string, bg: string, fg = '#fff', w = 512, h = 128) => canvasTex(w, h, (c) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; let px = Math.round(h * 0.55); c.font = `bold ${px}px Arial`;
  while (c.measureText(text).width > w * 0.9 && px > 12) { px -= 3; c.font = `bold ${px}px Arial`; }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 3);
});
let M: ReturnType<typeof mk> | null = null;
function mk() {
  const std = (color: string, x: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...x });
  return {
    floor: std('#E5DFD1', { roughness: 0.25 }), ceiling: std('#F4F3EF', { side: THREE.BackSide }), wall: std('#efe9dd', { side: THREE.DoubleSide }),
    stone: std('#d9d2c3', { roughness: 0.4 }), dark: std('#27292B'), steel: std('#b9bec2', { metalness: 0.6, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: '#d4e8f0', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ color: '#fff8e8' }), shutter: std('#9aa0a3', { metalness: 0.4 }), wood: std('#97764F'),
    mannequin: std('#f0ece4'), mirror: std('#dfe8ee', { metalness: 0.9, roughness: 0.05 }), plant: std('#3f7d3a'), pot: std('#b9b3a8'),
    screen: new THREE.MeshBasicMaterial({ color: '#2f6fb3' }), cloth: new THREE.MeshStandardMaterial({ roughness: 0.8 }), step: std('#4a4e52', { metalness: 0.5, roughness: 0.4 }),
  };
}
const mats = () => (M ??= mk());
const SIGN = new Map<string, THREE.MeshBasicMaterial>();
const signMat = (text: string, bg: string, fg = '#fff') => { const k = `${text}|${bg}`; let m = SIGN.get(k); if (!m) { m = new THREE.MeshBasicMaterial({ map: label(text, bg, fg) }); SIGN.set(k, m); } return m; };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
function inst(list: { p: [number, number, number]; s: [number, number, number]; yaw?: number; pitch?: number; color?: string }[], mat: THREE.Material, geo: THREE.BufferGeometry = unitBox) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
  list.forEach((it, i) => { tmpQ.setFromEuler(tmpE.set(0, it.yaw ?? 0, it.pitch ?? 0, 'YXZ')); tmpM.compose(new THREE.Vector3(...it.p), tmpQ, new THREE.Vector3(...it.s)); m.setMatrixAt(i, tmpM); if (it.color) m.setColorAt(i, new THREE.Color(it.color)); });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; return m;
}

/** The podium slab of a floor (atrium cut out above floor 1). */
function slabGeometry(f: number) {
  const ring = LOTTE.podiumRing;
  const shape = new THREE.Shape(ring.map(([u, v]) => new THREE.Vector2(u, -v)));
  if (f >= 2) {
    const hole = [[ATRIUM.s0 + 1, ATRIUM.t0], [ATRIUM.s1 - 1, ATRIUM.t0], [ATRIUM.s1 - 1, ATRIUM.t1], [ATRIUM.s0 + 1, ATRIUM.t1]].map(([s, t]) => { const [u, v] = fromRamp(s, t); return new THREE.Vector2(u, -v); });
    shape.holes.push(new THREE.Path(hole));
  }
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); return g;
}

/** One escalator: truss, moving steps, glass balustrades and black handrails (tower-local, absolute heights). */
function Escalator({ i }: { i: number }) {
  const m = mats(); const r = ESCALATORS[i];
  const y0 = GROUND_HEIGHT + floorY(r.l0), y1 = GROUND_HEIGHT + floorY(r.l1);
  const len = Math.hypot(r.s1 - r.s0, y1 - y0); const pitch = Math.atan2(y1 - y0, r.s1 - r.s0);
  const tc = (r.t0 + r.t1) / 2, w = r.t1 - r.t0;
  const yaw = -Math.atan2(RAMP.e[1], RAMP.e[0]);
  const [cu, cv] = fromRamp((r.s0 + r.s1) / 2, tc);
  const steps = useRef<THREE.InstancedMesh>(null);
  const N = Math.floor(len / 0.4);
  useFrame((st) => {
    const im = steps.current; if (!im) return;
    const off = ((st.clock.elapsedTime * 0.5 * r.move) % 0.4 + 0.4) % 0.4;
    for (let k = 0; k < N; k++) {
      const d = (k * 0.4 + off) % (N * 0.4); const s = r.s0 + (d / len) * (r.s1 - r.s0); const y = y0 + (d / len) * (y1 - y0);
      const [u, v] = fromRamp(s, tc); tmpQ.setFromEuler(tmpE.set(0, yaw, 0)); tmpM.compose(new THREE.Vector3(u, y + 0.05, v), tmpQ, new THREE.Vector3(0.36, 0.1, w - 0.2)); im.setMatrixAt(k, tmpM);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return <group>
    <group position={[cu, (y0 + y1) / 2 - 0.35, cv]} rotation={[0, yaw, pitch, 'YXZ']}>
      <mesh material={m.steel}><boxGeometry args={[len, 0.6, w + 0.3]} /></mesh>
      {[-1, 1].map((sd) => <mesh key={sd} material={m.glass} position={[0, 0.95, sd * (w / 2 + 0.05)]}><boxGeometry args={[len, 0.9, 0.03]} /></mesh>)}
      {[-1, 1].map((sd) => <mesh key={`h${sd}`} material={m.dark} position={[0, 1.42, sd * (w / 2 + 0.05)]}><boxGeometry args={[len + 0.6, 0.06, 0.09]} /></mesh>)}
    </group>
    <instancedMesh ref={steps} args={[unitBox, m.step, N]} />
  </group>;
}

/** Floors 1–6 in the podium (drawn in the tower group). */
export function LotteMall({ f }: { f: number }) {
  const m = mats();
  const y = GROUND_HEIGHT + floorY(f);
  const units = unitsOf(f);
  const yawE = -Math.atan2(RAMP.e[1], RAMP.e[0]); const yawN = -Math.atan2(RAMP.n[1], RAMP.n[0]);
  const data = useMemo(() => {
    const slab = slabGeometry(f); const ceil = slabGeometry(1);
    // perimeter walls on the podium's own sides (not on the side it shares with the tower)
    const ring = LOTTE.podiumRing; const tb = towerRing(0, -1.5); const wp: number[] = [];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if (insidePolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tb)) continue; wp.push(a[0], 0, a[1], b[0], 0, b[1], b[0], H, b[1], a[0], 0, a[1], b[0], H, b[1], a[0], H, a[1]); }
    const walls = new THREE.BufferGeometry(); walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); walls.computeVertexNormals();
    // downlights every 4 m
    const lights: Parameters<typeof inst>[0] = [];
    for (let s = 2; s < 80; s += 4) for (let t = 2; t < 44; t += 4) { const [u, v] = fromRamp(s, t); if (inPodiumPlate(u, v) && !(f >= 2 && s > ATRIUM.s0 && s < ATRIUM.s1 && t > ATRIUM.t0 && t < ATRIUM.t1)) lights.push({ p: [u, H - 0.02, v], s: [0.35, 0.02, 0.35] }); }
    // atrium railing on floors 2–6: glass panels and a black rail round the void, open where escalators land
    const rails: Parameters<typeof inst>[0] = [], tops: Parameters<typeof inst>[0] = [];
    if (f >= 2) {
      const sA = ATRIUM.s0 + 1, sB = ATRIUM.s1 - 1;
      const edges: [number, number, number, number][] = [[sA, ATRIUM.t0, sB, ATRIUM.t0], [sA, ATRIUM.t1, sB, ATRIUM.t1], [sA, ATRIUM.t0, sA, ATRIUM.t1], [sB, ATRIUM.t0, sB, ATRIUM.t1]];
      for (const [s0, t0, s1, t1] of edges) {
        const n = Math.max(1, Math.round(Math.hypot(s1 - s0, t1 - t0) / 1.5));
        for (let k = 0; k < n; k++) {
          const sm = s0 + (s1 - s0) * (k + 0.5) / n, tm = t0 + (t1 - t0) * (k + 0.5) / n;
          if (s0 === s1 && Object.values(ESC_LANES).some(([a, b]) => tm > a - 0.4 && tm < b + 0.4)) continue; // escalator mouth
          const [u, v] = fromRamp(sm, tm); const along = s0 === s1 ? yawN : yawE; const len = Math.hypot(s1 - s0, t1 - t0) / n;
          rails.push({ p: [u, 0.55, v], s: [len - 0.05, 1.1, 0.03], yaw: along }); tops.push({ p: [u, 1.12, v], s: [len, 0.06, 0.08], yaw: along });
        }
      }
    }
    const cols = COLUMNS.map(([s, t]) => { const [u, v] = fromRamp(s, t); return { p: [u, H / 2, v] as [number, number, number], s: [1.0, H, 1.0] as [number, number, number], yaw: yawE }; });
    const benches = BENCHES.map(([s, t]) => { const [u, v] = fromRamp(s, t); return { p: [u, 0.25, v] as [number, number, number], s: [2.0, 0.45, 0.55] as [number, number, number], yaw: yawE }; });
    return { slab, ceil, walls, inst: [inst(lights, m.light), inst(rails, m.glass), inst(tops, m.dark), inst(cols, m.stone), inst(benches, m.wood)] };
  }, [f, m, yawE, yawN]);
  useEffect(() => () => { data.slab.dispose(); data.ceil.dispose(); data.walls.dispose(); data.inst.forEach((x) => x.dispose()); }, [data]);
  // shops: glass fronts, sign, racks of clothes / shelves, mannequins, mirror, till
  const shopData = useMemo(() => {
    const racks: Parameters<typeof inst>[0] = [], clothes: Parameters<typeof inst>[0] = [], dummies: Parameters<typeof inst>[0] = [], counters: Parameters<typeof inst>[0] = [], fronts: Parameters<typeof inst>[0] = [], parts: Parameters<typeof inst>[0] = [], shutters: Parameters<typeof inst>[0] = [];
    for (const un of units) {
      const back = un.face === 1 ? un.t0 : un.t1;
      for (const sd of [-1, 1]) { const [u, v] = fromRamp(un.s + sd * UNIT_W / 2, (un.t0 + un.t1) / 2); parts.push({ p: [u, H / 2, v], s: [un.t1 - un.t0, H, 0.2], yaw: yawN }); }
      if (!un.shop) { const [u, v] = fromRamp(un.s, un.front); shutters.push({ p: [u, 1.6, v], s: [UNIT_W - 0.2, 3.2, 0.08], yaw: yawE }); continue; }
      // glass front with a 3 m opening in the middle
      for (const sd of [-1, 1]) { const [u, v] = fromRamp(un.s + sd * (UNIT_W / 4 + 0.75), un.front); fronts.push({ p: [u, 1.6, v], s: [UNIT_W / 2 - 1.5, 3.2, 0.04], yaw: yawE }); }
      const seed = un.s * 7 + f;
      for (const k of [-2.4, 2.4]) {
        const [u, v] = fromRamp(un.s + k, (un.t0 + un.t1) / 2); racks.push({ p: [u, 1.5, v], s: [0.05, 0.05, 3.2], yaw: yawE });
        for (let q = -1.4; q <= 1.4; q += 0.35) { const [cu, cv] = fromRamp(un.s + k, (un.t0 + un.t1) / 2 + q); clothes.push({ p: [cu, 1.05, cv], s: [0.06, 0.8, 0.45], yaw: yawE, color: `hsl(${(seed * 37 + q * 90) % 360}, 45%, ${50 + (q * 10) % 15}%)` }); }
      }
      for (const k of [-1, 1]) { const [u, v] = fromRamp(un.s + k * 1.2, un.front - un.face * 1.2); dummies.push({ p: [u, 0.85, v], s: [0.4, 1.7, 0.25], yaw: yawN, color: un.shop.color }); }
      const [tu, tv] = fromRamp(un.s, back + un.face * 1.6); counters.push({ p: [tu, 0.5, tv], s: [2.6, 1.0, 0.7], yaw: yawE });
    }
    return [inst(racks, m.steel), inst(clothes, m.cloth), inst(dummies, m.mannequin), inst(counters, m.wood), inst(fronts, m.glass), inst(parts, m.wall), inst(shutters, m.shutter)];
  }, [units, f, m, yawE, yawN]);
  useEffect(() => () => shopData.forEach((x) => x.dispose()), [shopData]);
  const below = useMemo(() => (f >= 2 ? slabGeometry(f - 1) : null), [f]);
  useEffect(() => () => below?.dispose(), [below]);
  const escal = ESCALATORS.map((r, i) => ({ r, i })).filter(({ r }) => r.l0 === f || r.l1 === f);
  const dir = useMemo(() => { const T: Record<number, string> = { 1: 'Mỹ phẩm · Nước hoa · Trang sức · Cà phê', 2: 'Thời trang · Phụ kiện · Nhà hàng', 3: 'Thời trang trẻ · Đồ chơi · Ẩm thực', 4: 'Thời trang nam · Đồng hồ · Thể thao · Vali', 5: 'Nhà hàng · Dịch vụ khách hàng', 6: 'Sự kiện' }; return signMat(`Tầng ${f}: ${T[f]}`, '#27292B'); }, [f]);
  const [du, dv] = fromRamp(ATRIUM.s0 - 3, ATRIUM.t0 - 2);
  return <group>
    <group position={[0, y, 0]}>
      <mesh geometry={data.slab} material={m.floor} />
      <mesh geometry={data.ceil} material={m.ceiling} position={[0, H, 0]} />
      <mesh geometry={data.walls} material={m.wall} />
      {data.inst.map((x, i) => <primitive key={i} object={x} />)}
      {shopData.map((x, i) => <primitive key={`s${i}`} object={x} />)}
      {units.filter((u) => u.shop).map((un, i) => { const [u, v] = fromRamp(un.s, un.front); return <mesh key={`sg${i}`} material={signMat(`${un.shop!.name} · ${un.shop!.trade}`, un.shop!.color)} position={[u, 3.8, v]} rotation={[0, yawE + (un.face === 1 ? 0 : Math.PI), 0]}><planeGeometry args={[UNIT_W - 1, 1.0]} /></mesh>; })}
      {units.filter((u) => !u.shop).map((un, i) => { const [u, v] = fromRamp(un.s, un.front); return <mesh key={`cl${i}`} material={signMat('SẮP KHAI TRƯƠNG', '#5d6268')} position={[u, 3.8, v]} rotation={[0, yawE + (un.face === 1 ? 0 : Math.PI), 0]}><planeGeometry args={[UNIT_W - 2, 0.8]} /></mesh>; })}
      {/* directory board by the escalators, and the information desk on floor 1 */}
      <group position={[du, 0, dv]} rotation={[0, yawE, 0]}>
        <mesh material={m.dark} position={[0, 1.2, 0]}><boxGeometry args={[2.6, 2.4, 0.15]} /></mesh>
        {[0, Math.PI].map((r) => <mesh key={r} material={dir} position={[0, 1.7, 0]} rotation={[0, r, 0]}><planeGeometry args={[2.4, 0.6]} /></mesh>)}
        {[0, Math.PI].map((r) => <mesh key={`sc${r}`} material={m.screen} position={[0, 0.9, 0.08 * (r ? -1 : 1)]} rotation={[0, r, 0]}><planeGeometry args={[2.2, 1.0]} /></mesh>)}
      </group>
      {f === 1 && (() => { const [iu, iv] = fromRamp(ATRIUM.s1 + 6, ATRIUM.t0 - 3); return <group position={[iu, 0, iv]} rotation={[0, yawE, 0]}>
        <mesh material={m.wood} position={[0, 0.55, 0]}><boxGeometry args={[3.2, 1.1, 0.9]} /></mesh>
        {[0, Math.PI].map((r) => <mesh key={r} material={signMat('QUẦY THÔNG TIN · INFORMATION', '#d51d32')} position={[0, 2.4, 0]} rotation={[0, r, 0]}><planeGeometry args={[2.8, 0.5]} /></mesh>)}
      </group>; })()}
      {BENCHES.map(([s, t], i) => { const [u, v] = fromRamp(s + 2, t); return <group key={`pl${i}`} position={[u, 0, v]}><mesh material={m.pot} position={[0, 0.3, 0]}><cylinderGeometry args={[0.45, 0.38, 0.6, 10]} /></mesh><mesh material={m.plant} position={[0, 1.0, 0]}><sphereGeometry args={[0.65, 10, 8]} /></mesh></group>; })}
    </group>
    {/* the floor below, seen through the atrium */}
    {below && <mesh geometry={below} material={m.floor} position={[0, GROUND_HEIGHT + floorY(f - 1), 0]} />}
    {escal.map(({ i }) => <Escalator key={i} i={i} />)}
  </group>;
}

/** Prompts in the mall, and the escalators carrying you (0,5 m/s). */
export function useMallFlow() {
  useFrame((_, delta) => {
    const f = lift.playerFloor;
    if (f < 1 || f > MALL_TOP) { if (mall.get().shop) closeShop(); return; }
    const p: Point = [player.position.x, player.position.z];
    const [u, v] = toTower(p); if (!inPodiumPlate(u, v)) return;
    // moving steps
    const esc = bike.riding ? null : escalatorHere(p);
    if (esc && player.teleport) {
      // carry along the escalator: its direction is RAMP.e in tower-local, turned into world by the tower's axis
      const d = Math.min(delta, 0.05) * 0.5 * esc.move; const du = RAMP.e[0] * d, dv = RAMP.e[1] * d; const D = LOTTE.dir;
      player.teleport(p[0] + D[0] * du - D[1] * dv, p[1] + D[1] * du + D[0] * dv);
      game.offer({ id: 'mall-esc', text: esc.move > 0 ? `Thang cuốn lên tầng ${esc.l1}` : `Thang cuốn xuống tầng ${esc.l0}`, key: null, priority: 6 });
      return;
    }
    const [s, t] = toRamp(u, v);
    for (const un of unitsOf(f)) if (un.shop && Math.abs(s - un.s) < UNIT_W / 2 - 0.3 && Math.abs(t - un.front) < 3) {
      const sh = un.shop;
      game.offer({ id: `mall-shop-${sh.id}`, text: `${sh.name} · ${sh.trade}: xem hàng`, key: 'E', priority: 7, run: () => { mall.set({ shop: sh.id, message: '' }); if (document.pointerLockElement) document.exitPointerLock(); } });
      return;
    }
    game.offer({ id: 'mall-floor', text: `Lotte Center · tầng ${f} · trung tâm thương mại · thang cuốn ở giữa giếng trời`, key: null, priority: 1 });
  });
}

const BTN = { marginLeft: 6, padding: '3px 10px', borderRadius: 6, border: '1px solid #888', background: '#f4f2ee', color: '#27292b', cursor: 'pointer' } as const;
/** The shop's panel: items, try on (clothes), buy. */
export function MallPanel() {
  const s = useMall((x) => x);
  const money = useGame((g) => g.money);
  if (!s.shop) return null;
  const sh = MALL_SHOPS.find((x) => x.id === s.shop)!; const have = owned();
  return <div className="lift-panel parking-panel" role="dialog" aria-label={sh.name}>
    <div className="lift-head"><b>{sh.name}</b><span>{sh.trade} · tầng {sh.floor} · ví {formatVnd(money)}</span></div>
    <table className="parking-table"><tbody>
      {sh.items.map((it) => <tr key={it.id}><td>{it.name}{have.includes(`${sh.id}:${it.id}`) ? ' ✓' : ''}</td><td style={{ whiteSpace: 'nowrap' }}>{formatVnd(it.price)}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{it.outfit && <button style={BTN} onClick={() => tryOn(sh.id, it)}>Thử</button>}<button style={BTN} onClick={() => buy(sh.id, it)}>Mua</button></td></tr>)}
    </tbody></table>
    {s.message && <p className="parking-msg">{s.message}</p>}
    <div className="lift-foot"><span>Thương hiệu trong game là hư cấu. Đồ mặc thử mà không mua sẽ được trả lại khi đóng.</span><button onClick={closeShop}>Đóng</button></div>
  </div>;
}

if (import.meta.env.DEV) (window as unknown as { __mall?: unknown }).__mall = { unitsOf, mall, COLUMNS };
