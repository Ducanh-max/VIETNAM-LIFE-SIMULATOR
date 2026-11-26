import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, insidePolygon, type Point } from '../geo';
import { BASEMENT_RING, basementBlockers, CABIN, CORE, floorLabel, floorY, fromRamp, fromTower, gates, inBasementPlate, lift, RAMP, RAMPS, toRamp, toTower } from '../lotte';
import { closeSession, currentQuote, openSession, parking, paySession, saveParking, slotAt, slots, TIER_NAME, VEHICLE_NAME, type ParkingSlot, type ParkVehicle } from '../lotteParking';
import { addMoney, bike, formatVnd, game, player, useGame } from '../state';
import { jobActions } from '../job';

/*
 * Lotte Center basement parking, B2–B5 (spec section 6). A game layout, not the building's real plan: rows of car
 * bays (2,5 × 5 m) and motorbike bays (0,9 × 2 m) on a grid square to the podium's south-west wall, 6 m aisles, 0,8 m
 * columns with yellow/black feet, lane arrows, speed bumps, convex mirrors, white LED strips, level / zone / EXIT
 * signs and a green or red light over every bay. Ramps (lotte.ts RAMP): street ↔ B2 in strip A, B2 ↔ B3 and B4 ↔ B5
 * in strip B, B3 ↔ B4 in strip C. The ticket booth with its attendant stands at the foot of the street ramp on B2;
 * the exit barrier is near the top of that ramp.
 *
 * Only the floor the player is on is drawn; bays, columns, lights and parked cars are instanced.
 */
const H = 3.4; // clear height
const MAT = {
  floor: '#62686B', ceiling: '#8a8e90', wall: '#9aa0a3', paintW: '#e9ecee', paintY: '#EFBD29', dark: '#27292B', led: '#f4f8ff',
};
type Bay = { s: number; t: number; type: ParkVehicle; code: string };
/** Bay layout for one floor, in the ramp frame (s along the south-west wall, t inward). */
function layout(f: number) {
  const bays: Bay[] = []; const cols: Point[] = [];
  const { strips, S1 } = RAMP;
  const stripEnd = strips.C[1] + 1;
  const ok = (s: number, t: number, hw: number, hl: number, yaw = 0) => {
    // all four corners inside the plate, clear of the lift core, landing and ramps
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (const [a, b] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) {
      const ss = s + a * c - b * sn, tt = t + a * sn + b * c; const [u, v] = fromRamp(ss, tt);
      if (!insidePolygon([u, v], BASEMENT_RING)) return false;
      if (Math.abs(u) < CORE.halfU + 2 && v > -CORE.halfV - 2 && v < CORE.halfV + 9) return false;
      if (tt < stripEnd && ss > -1 && ss < S1 + 8) return false;
    }
    return true;
  };
  // rows across t: [bays 5 m][aisle 6 m][bays 5 m] repeating; a column every three car bays at the row line
  let row = 0;
  for (let t = stripEnd + 0.5; t < 120; t += 16, row++) {
    for (const side of [0, 1]) {
      const tc = t + (side ? 13.5 : 2.5);
      const moto = f === -2 && row % 2 === 0 && side === 0; // B2: the first row of each pair holds motorbikes
      let k = 0;
      for (let s = -40; s < 140; s += moto ? 1.0 : 2.6) {
        const w = moto ? 0.9 : 2.5, l = moto ? 2 : 5;
        if (!ok(s, tc, w / 2, l / 2, Math.PI / 2)) continue;
        k++;
        bays.push({ s, t: tc, type: moto ? 'motorcycle' : 'car', code: `${floorLabel(f)}-${'ABCD'[row % 4]}${String(k).padStart(2, '0')}` });
        if (!moto && k % 3 === 0) { const ct = tc + (side ? -2.9 : 2.9); if (ok(s + 1.3, ct, 0.45, 0.45)) cols.push([s + 1.3, ct]); }
      }
    }
  }
  return { bays, cols };
}
const LAYOUT = new Map<number, ReturnType<typeof layout>>();
const layoutFor = (f: number) => { let l = LAYOUT.get(f); if (!l) { l = layout(f); LAYOUT.set(f, l); } return l; };
// register every bay as a ParkingSlot (tower-local centre and yaw) and the columns as blockers
for (const f of [-2, -3, -4, -5]) for (const b of layoutFor(f).bays) {
  const [u, v] = fromRamp(b.s, b.t); const yawRamp = Math.atan2(RAMP.n[1], RAMP.n[0]); // bays run along t (inward)
  const sl: ParkingSlot = { slotId: b.code, floorId: f, vehicleType: b.type, position: [u, v], rotation: yawRamp, w: b.type === 'car' ? 2.5 : 0.9, l: b.type === 'car' ? 5 : 2, occupied: false, vehicleId: null };
  slots.push(sl);
}
// NPC cars take about half of the car bays (never the player's: the player's bay is re-checked below)
{ let seed = 7; for (const sl of slots) { seed = (seed * 1103515245 + 12345) >>> 0; if ((seed >>> 8) % 100 < (sl.vehicleType === 'car' ? 48 : 60)) { sl.occupied = true; sl.vehicleId = `npc-${seed % 997}`; } } }
basementBlockers.push((u, v, f) => {
  const [s, t] = toRamp(u, v);
  for (const c of layoutFor(f).cols) if (Math.abs(s - c[0]) < 0.6 && Math.abs(t - c[1]) < 0.6) return true;
  if (f === -2 && Math.hypot(s - BOOTH[0], t - BOOTH[1]) < 1.6) return true;
  // NPC cars in their bays block (so nobody drives through them)
  for (const sl of slots) if (sl.floorId === f && sl.occupied && sl.vehicleId !== 'player') {
    const dx = u - sl.position[0], dz = v - sl.position[1]; const c = Math.cos(sl.rotation), sn = Math.sin(sl.rotation);
    if (Math.abs(dx * c + dz * sn) < sl.l / 2 - 0.3 && Math.abs(-dx * sn + dz * c) < sl.w / 2 - 0.2) return true;
  }
  return false;
});
/** Ticket booth beside the foot of the street ramp on B2 (ramp frame). */
const BOOTH: Point = [RAMP.S1 + 4, RAMP.strips.A[1] + 3];

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const tmpM = new THREE.Matrix4(); const tmpQ = new THREE.Quaternion(); const tmpE = new THREE.Euler();
function inst(list: { p: [number, number, number]; s: [number, number, number]; yaw?: number; color?: string }[], geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
  list.forEach((it, i) => { tmpQ.setFromEuler(tmpE.set(0, it.yaw ?? 0, 0)); tmpM.compose(new THREE.Vector3(...it.p), tmpQ, new THREE.Vector3(...it.s)); m.setMatrixAt(i, tmpM); if (it.color) m.setColorAt(i, new THREE.Color(it.color)); });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  return m;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const signTex = (text: string, bg = '#1d4f8f', fg = '#fff') => canvasTex(512, 192, (c) => {
  c.fillStyle = bg; c.fillRect(0, 0, 512, 192); c.fillStyle = fg; let px = 112; c.font = `bold ${px}px Arial`;
  while (c.measureText(text).width > 480 && px > 20) { px -= 4; c.font = `bold ${px}px Arial`; } // shrink to fit
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 100);
});
let M: ReturnType<typeof mk> | null = null;
function mk() {
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  return {
    floor: std(MAT.floor, { roughness: 0.45, metalness: 0.05 }),
    ceiling: std(MAT.ceiling, { side: THREE.BackSide }), // the slab seen from below only (from above it stays see-through)
    wall: std(MAT.wall, { side: THREE.DoubleSide }),
    paintW: std(MAT.paintW, { polygonOffset: true, polygonOffsetFactor: -4 }),
    paintY: std(MAT.paintY, { polygonOffset: true, polygonOffsetFactor: -4 }),
    column: std('#b9bcbe'), foot: std(MAT.paintY), stripe: std(MAT.dark),
    led: new THREE.MeshBasicMaterial({ color: MAT.led }),
    green: new THREE.MeshBasicMaterial({ color: '#2fe26a' }), red: new THREE.MeshBasicMaterial({ color: '#ff3b30' }),
    car: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }), glass: std('#2a3540', { roughness: 0.2 }),
    tyre: std(MAT.dark), mirror: std('#d9e3ea', { metalness: 0.9, roughness: 0.1 }), mirrorRim: std('#f08a24'),
    booth: std('#d8d4cc'), boothGlass: new THREE.MeshStandardMaterial({ color: '#bcd6e2', transparent: true, opacity: 0.35, depthWrite: false }),
    arm: std('#f2f2f2'), armStripe: std('#d51d32'), skin: std('#e2b48f'), shirt: std('#1d4f8f'), trousers: std('#2b2f36'),
    ramp: std('#6e7376', { roughness: 0.6 }),
    lid: new THREE.MeshBasicMaterial({ color: '#15181a', side: THREE.DoubleSide }),
    tunnel: std('#8d9295', { side: THREE.DoubleSide }),
  };
}
const mats = () => (M ??= mk());
const SIGN_CACHE = new Map<string, THREE.MeshBasicMaterial>();
const signMat = (text: string, bg?: string) => { const k = text + bg; let m = SIGN_CACHE.get(k); if (!m) { m = new THREE.MeshBasicMaterial({ map: signTex(text, bg) }); SIGN_CACHE.set(k, m); } return m; };

/** A ramp slab with low side walls, between two floors (tower-local coordinates, drawn in the tower group). */
function rampGeometry(strip: 'A' | 'B' | 'C', y0: number, y1: number) {
  const [a, b] = RAMP.strips[strip]; const pos: number[] = [];
  const n = 24; const s0 = RAMP.S0, s1 = RAMP.S1;
  const P = (s: number, t: number, y: number) => { const [u, v] = fromRamp(s, t); return [u, y, v]; };
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const ya = y0 + (y1 - y0) * (i / n), yb = y0 + (y1 - y0) * ((i + 1) / n);
    const q = [P(sa, a, ya), P(sb, a, yb), P(sb, b, yb), P(sa, b, ya)];
    pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]); // top face (both windings below cover the underside)
    pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
    // kerb walls 1 m high both sides
    for (const t of [a, b]) { const w0 = P(sa, t, ya), w1 = P(sb, t, yb); pos.push(...w0, ...w1, w1[0], w1[1] + 1, w1[2], ...w0, w1[0], w1[1] + 1, w1[2], w0[0], w0[1] + 1, w0[2]); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

function NpcCars({ f }: { f: number }) {
  const m = mats();
  const meshes = useMemo(() => {
    const palette = ['#f1f1ee', '#c3222a', '#5d6268', '#2f5fc0', '#1d1f22', '#b8bcc0', '#7a1f2a'];
    const bodies: Parameters<typeof inst>[0] = [], cabins: Parameters<typeof inst>[0] = [], wheels: Parameters<typeof inst>[0] = [];
    for (const sl of slots) {
      if (sl.floorId !== f || !sl.occupied || sl.vehicleId === 'player') continue;
      const y = 0; const yaw = -sl.rotation; // drawn inside the floor's group, which is already at the floor level
      const col = palette[Math.abs(hashStr(sl.slotId)) % palette.length] ?? '#cccccc';
      if (sl.vehicleType === 'car') {
        bodies.push({ p: [sl.position[0], y + 0.55, sl.position[1]], s: [4.3, 0.75, 1.75], yaw, color: col });
        cabins.push({ p: [sl.position[0] - Math.cos(sl.rotation) * 0.2, y + 1.15, sl.position[1] - Math.sin(sl.rotation) * 0.2], s: [2.3, 0.55, 1.6], yaw });
        for (const [a, b] of [[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]]) wheels.push({ p: [sl.position[0] + Math.cos(sl.rotation) * a - Math.sin(sl.rotation) * b, y + 0.32, sl.position[1] + Math.sin(sl.rotation) * a + Math.cos(sl.rotation) * b], s: [0.64, 0.64, 0.24], yaw });
      } else {
        bodies.push({ p: [sl.position[0], y + 0.55, sl.position[1]], s: [1.75, 0.5, 0.42], yaw, color: col });
        wheels.push({ p: [sl.position[0] + Math.cos(sl.rotation) * 0.65, y + 0.28, sl.position[1] + Math.sin(sl.rotation) * 0.65], s: [0.56, 0.56, 0.14], yaw });
        wheels.push({ p: [sl.position[0] - Math.cos(sl.rotation) * 0.65, y + 0.28, sl.position[1] - Math.sin(sl.rotation) * 0.65], s: [0.56, 0.56, 0.14], yaw });
      }
    }
    return [inst(bodies, unitBox, m.car), inst(cabins, unitBox, m.glass), inst(wheels, unitBox, m.tyre)];
  }, [f, m]);
  useEffect(() => () => meshes.forEach((x) => x.dispose()), [meshes]);
  return <>{meshes.map((x, i) => <primitive key={i} object={x} />)}</>;
}
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/** One basement floor: slab, ceiling, walls, ramps, bays, columns, lights, signs, booth. Drawn in the tower group. */
export function LotteBasement({ f }: { f: number }) {
  const m = mats();
  const y = GROUND_HEIGHT + floorY(f);
  const L = layoutFor(f);
  const data = useMemo(() => {
    const ring = BASEMENT_RING;
    const shape = new THREE.Shape(ring.map(([u, v]) => new THREE.Vector2(u, -v)));
    const slab = new THREE.ShapeGeometry(shape); slab.rotateX(-Math.PI / 2);
    // walls round the outline, carried up to a dark lid just under the street: the vehicle chase camera can rise above
    // the 3,4 m ceiling (which is see-through from above, a cutaway), but never sees the city from underneath
    const top = GROUND_HEIGHT - 0.35 - y;
    const wp: number[] = [];
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; wp.push(a[0], 0, a[1], b[0], 0, b[1], b[0], top, b[1], a[0], 0, a[1], b[0], top, b[1], a[0], top, a[1]); }
    const walls = new THREE.BufferGeometry(); walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); walls.computeVertexNormals();
    const yawBay = -Math.atan2(RAMP.n[1], RAMP.n[0]); const yawAisle = -Math.atan2(RAMP.e[1], RAMP.e[0]);
    const lines: Parameters<typeof inst>[0] = [], lights: Parameters<typeof inst>[0] = [], leds: Parameters<typeof inst>[0] = [];
    for (const b of L.bays) {
      const w = b.type === 'car' ? 2.5 : 0.9, l = b.type === 'car' ? 5 : 2;
      for (const side of [-1, 1]) { const [u, v] = fromRamp(b.s + side * w / 2, b.t); lines.push({ p: [u, 0.02, v], s: [l, 0.01, 0.1], yaw: yawBay }); }
      const st = slotAt(f, ...fromRamp(b.s, b.t));
      const [lu, lv] = fromRamp(b.s, b.t + (b.t > 0 ? 0 : 0)); lights.push({ p: [lu, H - 0.12, lv], s: [0.18, 0.08, 0.18], color: st?.occupied ? '#ff3b30' : '#2fe26a' });
    }
    // LED strips along every aisle (between row pairs), every 6 m
    const rowsT = [...new Set(L.bays.map((b) => Math.round(b.t)))];
    for (const t of rowsT) for (let s = -40; s < 140; s += 6) { const [u, v] = fromRamp(s, t + 5.5); if (inBasementPlate(u, v)) leds.push({ p: [u, H - 0.05, v], s: [4.2, 0.04, 0.16], yaw: yawAisle }); }
    const colsBody = L.cols.map(([s, t]) => { const [u, v] = fromRamp(s, t); return { p: [u, H / 2, v] as [number, number, number], s: [0.8, H, 0.8] as [number, number, number], yaw: yawAisle }; });
    const feet = L.cols.map(([s, t]) => { const [u, v] = fromRamp(s, t); return { p: [u, 0.45, v] as [number, number, number], s: [0.84, 0.9, 0.84] as [number, number, number], yaw: yawAisle }; });
    const stripes = L.cols.flatMap(([s, t]) => [0.15, 0.55].map((h) => { const [u, v] = fromRamp(s, t); return { p: [u, h, v] as [number, number, number], s: [0.86, 0.14, 0.86] as [number, number, number], yaw: yawAisle }; }));
    // aisle arrows and speed bumps
    const arrows: Parameters<typeof inst>[0] = [], bumps: Parameters<typeof inst>[0] = [];
    for (const t of rowsT) for (let s = -30; s < 130; s += 18) { const [u, v] = fromRamp(s, t + 8); if (inBasementPlate(u, v) && !L.bays.some((b) => Math.abs(b.s - s) < 2 && Math.abs(b.t - t - 8) < 3)) { arrows.push({ p: [u, 0.02, v], s: [2.4, 0.01, 0.35], yaw: yawAisle }); arrows.push({ p: [u + RAMP.e[0] * 1.2, 0.02, v + RAMP.e[1] * 1.2], s: [0.9, 0.01, 0.9], yaw: yawAisle + Math.PI / 4 }); } }
    for (const k of ['A', 'B', 'C'] as const) { const [a, bb] = RAMP.strips[k]; const [u, v] = fromRamp(RAMP.S1 + 3, (a + bb) / 2); bumps.push({ p: [u, 0.05, v], s: [0.5, 0.1, bb - a - 0.4], yaw: yawAisle }); }
    return {
      slab, walls, top,
      inst: [inst(lines, unitBox, m.paintW), inst(lights, unitBox, new THREE.MeshBasicMaterial({ color: '#ffffff' })), inst(leds, unitBox, m.led), inst(colsBody, unitBox, m.column), inst(feet, unitBox, m.foot), inst(stripes, unitBox, m.stripe), inst(arrows, unitBox, m.paintW), inst(bumps, unitBox, m.paintY)],
      yawAisle, yawBay,
    };
  }, [f, m, L]);
  useEffect(() => () => { data.inst.forEach((x) => x.dispose()); data.slab.dispose(); data.walls.dispose(); }, [data]);
  // ramps that touch this floor
  const ramps = useMemo(() => RAMPS.filter((r) => r.strip !== 'A' && (r.l0 === f || r.l1 === f)).map((r) => ({ key: `${r.strip}${r.l0}`, geo: rampGeometry(r.strip, GROUND_HEIGHT + floorY(r.l0), GROUND_HEIGHT + floorY(r.l1)) })), [f]);
  useEffect(() => () => ramps.forEach((r) => r.geo.dispose()), [ramps]);
  // signs: level plates on columns, zone letters over aisles, EXIT at the ramps, P at the lift
  const signs = useMemo(() => {
    const out: { p: [number, number, number]; yaw: number; text: string; bg?: string; w: number }[] = [];
    L.cols.forEach(([s, t], i) => { if (i % 4) return; const [u, v] = fromRamp(s - 0.42, t); out.push({ p: [u, 1.9, v], yaw: data.yawAisle + Math.PI / 2, text: floorLabel(f), bg: '#1d4f8f', w: 0.7 }); });
    const rowsT = [...new Set(L.bays.map((b) => Math.round(b.t)))];
    rowsT.forEach((t, i) => { const [u, v] = fromRamp(10, t + 5.5); if (inBasementPlate(u, v)) out.push({ p: [u, H - 0.45, v], yaw: data.yawBay, text: `KHU ${'ABCD'[i % 4]}`, bg: '#2f7d32', w: 1.2 }); });
    for (const r of RAMPS) if (r.l0 === f || r.l1 === f) {
      const [a, b] = RAMP.strips[r.strip]; const atS = r.l0 === f ? RAMP.S0 - 1.5 : RAMP.S1 + 4.5; const up = (r.l0 === f ? r.l1 : r.l0) > f;
      const [u, v] = fromRamp(atS, (a + b) / 2);
      const to = r.l0 === f ? r.l1 : r.l0; const label = to === 1 ? 'EXIT ▲ Ra đường' : `${up ? '▲' : '▼'} ${floorLabel(to)}`;
      out.push({ p: [u, H - 0.5, v], yaw: data.yawAisle + (r.l0 === f ? Math.PI / 2 : -Math.PI / 2), text: label, bg: to === 1 ? '#2f7d32' : '#1d4f8f', w: 1.6 });
    }
    out.push({ p: [0, 2.9, CORE.halfV + 0.2], yaw: 0, text: `P · ${floorLabel(f)} · THANG MÁY`, bg: '#1d4f8f', w: 2.4 });
    return out;
  }, [f, L, data]);
  // convex mirrors at the ramp mouths
  const mirrors = useMemo(() => RAMPS.filter((r) => r.l0 === f || r.l1 === f).map((r) => { const [, b] = RAMP.strips[r.strip]; const [u, v] = fromRamp(r.l0 === f ? RAMP.S0 - 2 : RAMP.S1 + 2, b + 0.3); return [u, v] as Point; }), [f]);
  const [bu, bv] = fromRamp(BOOTH[0], BOOTH[1]);
  const gateArm = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (gateArm.current) gateArm.current.rotation.z = THREE.MathUtils.damp(gateArm.current.rotation.z, gates.exitClosed() ? 0 : 1.35, 5, Math.min(dt, 0.05)); });
  const [gu, gv] = fromRamp(RAMP.S0 + 1.3, RAMP.strips.A[0] + 0.3);
  return <group position={[0, y, 0]}>
    <mesh geometry={data.slab} material={m.floor} />{/* no shadows down here: the sun's shadow map would paint the tower's shadow on the basement floor */}
    <mesh geometry={data.slab} material={m.ceiling} position={[0, H, 0]} />
    <mesh geometry={data.walls} material={m.wall} />
    <mesh geometry={data.slab} material={m.lid} position={[0, data.top, 0]} />
    {data.inst.map((x, i) => <primitive key={i} object={x} />)}
    {/* the lift core in the basement, with the landing doors drawn by the tower's Interior for floors ≥ 1 — here plain walls round the cabin shaft */}
    <mesh material={m.wall} position={[0, H / 2, -CORE.halfV]}><boxGeometry args={[CORE.halfU * 2, H, 0.3]} /></mesh>
    {[-1, 1].map((sd) => <mesh key={sd} material={m.wall} position={[sd * CORE.halfU, H / 2, 0]}><boxGeometry args={[0.3, H, CORE.halfV * 2]} /></mesh>)}
    {[-1, 1].map((sd) => <mesh key={`f${sd}`} material={m.wall} position={[sd * (CORE.halfU + CABIN.u1) / 2, H / 2, CORE.halfV]}><boxGeometry args={[CORE.halfU - CABIN.u1, H, 0.3]} /></mesh>)}
    <mesh material={m.wall} position={[0, (H + 2.4) / 2, CORE.halfV]}><boxGeometry args={[CABIN.u1 * 2, H - 2.4, 0.3]} /></mesh>
    {signs.map((s, i) => <mesh key={i} material={signMat(s.text, s.bg)} position={s.p} rotation={[0, s.yaw, 0]}><planeGeometry args={[s.w, s.w * 0.375]} /></mesh>)}
    {mirrors.map(([u, v], i) => <group key={i} position={[u, 2.4, v]}>
      <mesh material={m.mirrorRim}><cylinderGeometry args={[0.42, 0.42, 0.06, 20]} /></mesh>
      <mesh material={m.mirror} position={[0, 0.035, 0]}><sphereGeometry args={[0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3]} /></mesh>
    </group>)}
    {f === -2 && <group position={[bu, 0, bv]} rotation={[0, data.yawAisle, 0]}>
      {/* ticket booth and its attendant */}
      <mesh material={m.booth} position={[0, 0.55, 0]}><boxGeometry args={[2.2, 1.1, 1.6]} /></mesh>
      <mesh material={m.boothGlass} position={[0, 1.65, 0]}><boxGeometry args={[2.2, 1.1, 1.6]} /></mesh>
      <mesh material={m.booth} position={[0, 2.25, 0]}><boxGeometry args={[2.4, 0.12, 1.8]} /></mesh>
      <mesh material={signMat('THU PHÍ', '#d51d32')} position={[0, 2.55, 0.92]}><planeGeometry args={[1.2, 0.45]} /></mesh>
      <group position={[0.3, 0, 0]}>
        <mesh material={m.trousers} position={[0, 0.45, 0]}><boxGeometry args={[0.36, 0.9, 0.24]} /></mesh>
        <mesh material={m.shirt} position={[0, 1.2, 0]}><boxGeometry args={[0.46, 0.6, 0.28]} /></mesh>
        <mesh material={m.skin} position={[0, 1.68, 0]}><sphereGeometry args={[0.2, 12, 8]} /></mesh>
      </group>
    </group>}
    {f === -2 && <group position={[gu, 0, gv]} rotation={[0, data.yawBay, 0]}>
      {/* exit barrier: a striped arm across the street ramp near its top (it rises when the ticket is paid) */}
      <mesh material={m.booth} position={[0, 0.5, 0]}><boxGeometry args={[0.35, 1, 0.35]} /></mesh>
      <group ref={gateArm} position={[0, 0.95, 0]}>
        <mesh material={m.arm} position={[2.9, 0, 0]}><boxGeometry args={[5.6, 0.1, 0.1]} /></mesh>
        {[1, 2.4, 3.8, 5.2].map((x) => <mesh key={x} material={m.armStripe} position={[x, 0, 0]}><boxGeometry args={[0.45, 0.11, 0.11]} /></mesh>)}
      </group>
    </group>}
    <NpcCars f={f} />
    {/* ramps are in tower-local world heights: undo this group's lift */}
    <group position={[0, -y, 0]}>{ramps.map((r) => <mesh key={r.key} geometry={r.geo} material={m.ramp} />)}</group>
  </group>;
}

/** The street-ramp portal seen from outside: a dark mouth in the podium's north-west wall, a sign and the entry barrier. */
export function LottePortal() {
  const m = mats();
  const [a, b] = RAMP.strips.A;
  const [u, v] = fromRamp(-0.4, (a + b) / 2); // just proud of the podium wall
  const ramp = useMemo(() => rampGeometry('A', GROUND_HEIGHT, GROUND_HEIGHT + floorY(-2)), []);
  // the ramp's tunnel: walls from the ramp up to just under the street, and a lid where the ramp is deep enough
  const tunnel = useMemo(() => {
    const top = GROUND_HEIGHT - 0.35; const yAt = (s: number) => GROUND_HEIGHT + floorY(-2) * Math.min(1, Math.max(0, (s - RAMP.S0) / (RAMP.S1 - RAMP.S0)));
    const wp: number[] = [], lp: number[] = [];
    const P = (s: number, t: number, yy: number) => { const [u, v] = fromRamp(s, t); return [u, yy, v]; };
    for (let s = 0.5; s < RAMP.S1 + 6; s += 2.5) {
      const s2 = s + 2.5;
      if (yAt(s) < top) for (const t of [a, b]) { const q = [P(s, t, yAt(s)), P(s2, t, yAt(s2)), P(s2, t, top), P(s, t, top)]; wp.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); }
      if (yAt(s) < top - 2.6) { const q = [P(s, a, top), P(s2, a, top), P(s2, b, top), P(s, b, top)]; lp.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); }
    }
    const mk = (p: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g; };
    return { walls: mk(wp), lid: mk(lp) };
  }, [a, b]);
  const yaw = -Math.atan2(RAMP.e[1], RAMP.e[0]);
  return <>
    <mesh geometry={ramp} material={m.ramp} />
    <mesh geometry={tunnel.walls} material={m.tunnel} />
    <mesh geometry={tunnel.lid} material={m.lid} />
    <group position={[u, GROUND_HEIGHT, v]} rotation={[0, yaw - Math.PI / 2, 0]}>{/* faces out of the tunnel, towards the street */}
      <mesh material={m.stripe} position={[0, 1.6, 0.01]}><planeGeometry args={[b - a, 3.2]} /></mesh>
      <mesh material={signMat('P  LOTTE CENTER · HẦM GỬI XE', '#1d4f8f')} position={[0, 3.6, 0.02]}><planeGeometry args={[5.4, 0.9]} /></mesh>
      <mesh material={m.paintY} position={[0, 3.25, 0.03]}><planeGeometry args={[b - a, 0.18]} /></mesh>
    </group>
  </>;
}

// ---- parking flow: ticket in at the portal, the bay, paying at the barrier ----
const near = (p: Point, q: Point, r: number) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
export function useParkingFlow() {
  const [, force] = useState(0);
  useEffect(() => {
    gates.exitClosed = () => !!parking.session && parking.session.paymentStatus !== 'paid';
    return () => { gates.exitClosed = () => false; };
  }, []);
  // a vehicle left in the basement before a reload is put back in its bay
  useEffect(() => {
    const s = parking.session; if (!s?.parked || bike.riding) return;
    const [x, z] = fromTower(s.parked.u, s.parked.v);
    bike.kind = s.vehicleKind; bike.color = s.color; bike.heading = s.parked.heading; bike.position.set(x, GROUND_HEIGHT + floorY(s.parkingFloor ?? -2), z);
    const sl = slots.find((x2) => x2.slotId === s.parkingSlot); if (sl) { sl.occupied = true; sl.vehicleId = 'player'; }
  }, []);
  useFrame(() => {
    const p: Point = [player.position.x, player.position.z]; const [u, v] = toTower(p); const [rs, rt] = toRamp(u, v);
    const s = parking.session; const f = lift.playerFloor;
    // ticket at the portal (driving in from the street)
    // heading into the portal (not driving out of it)
    const inward = (() => { const a = toTower([bike.position.x, bike.position.z]), b = toTower([bike.position.x + Math.sin(bike.heading), bike.position.z + Math.cos(bike.heading)]); return (b[0] - a[0]) * RAMP.e[0] + (b[1] - a[1]) * RAMP.e[1] > 0.3; })();
    if (!s && bike.riding && inward && f === 1 && rt > RAMP.strips.A[0] && rt < RAMP.strips.A[1] && rs > -6 && rs < 2) {
      const t = openSession(bike.kind, bike.color);
      game.toast(`Đã lấy vé gửi xe: ${VEHICLE_NAME[t.vehicleType]} · biển ${t.licensePlate} · vào lúc ${new Date(t.entryTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Tìm ô trống (đèn xanh) để đỗ.`);
      force((n) => n + 1);
    }
    if (!s) return;
    // parked: the vehicle stopped in a free bay with the player off it
    const [bu, bv] = toTower([bike.position.x, bike.position.z]);
    if (!bike.riding && f < 0 && Math.abs(bike.speed) < 0.3) {
      const sl = slotAt(f, bu, bv);
      if (sl && s.parkingSlot !== sl.slotId && (!sl.occupied || sl.vehicleId === 'player') && sl.vehicleType === s.vehicleType) {
        for (const x of slots) if (x.vehicleId === 'player') { x.occupied = false; x.vehicleId = null; }
        sl.occupied = true; sl.vehicleId = 'player'; s.parkingSlot = sl.slotId; s.parkingFloor = f; s.parked = { u: bu, v: bv, heading: bike.heading }; saveParking();
        game.toast(`Đã đỗ ở ô ${sl.slotId} (${floorLabel(f)}). Vé xem trong điện thoại hoặc khi quay lại lấy xe.`);
      }
    } else if (bike.riding && s.parked) {
      for (const x of slots) if (x.vehicleId === 'player') { x.occupied = false; x.vehicleId = null; }
      s.parked = null; saveParking(); // the bay is free again; the ticket keeps its last bay for the receipt
    }
    // mount a vehicle put back after a reload (no rental or job owns it any more)
    const st = game.get();
    if (!bike.riding && !st.rental && !st.job && !st.driver && f < 0 && near(p, [bike.position.x, bike.position.z], 2.6) && s.parked) game.offer({ id: 'lotte-mount', text: `Lên xe của bạn (${s.licensePlate})`, key: 'F', priority: 7, run: () => jobActions.mount() });
    if (bike.riding && f < 0 && Math.abs(bike.speed) < 1.5 && !st.rental && !st.job && !st.driver) game.offer({ id: 'lotte-dismount', text: 'Xuống xe', key: 'F', priority: 3, run: () => jobActions.dismount() });
    // the exit barrier: stopped below it with an unpaid ticket
    if (f === -2 && rt > RAMP.strips.A[0] && rt < RAMP.strips.A[1] && rs > RAMP.S0 + 1.4 && rs < RAMP.S0 + 9 && s.paymentStatus !== 'paid') {
      game.offer({ id: 'lotte-pay', text: `Trả phí gửi xe: ${formatVnd(currentQuote()?.fee ?? 0)}`, key: 'E', priority: 9, run: () => { parkingUi.open = true; if (document.pointerLockElement) document.exitPointerLock(); game.set({}); } });
    }
    // through the barrier and out on the street: the ticket is done
    if (s.paymentStatus === 'paid' && f === 1 && !(rt > RAMP.strips.A[0] && rt < RAMP.strips.A[1] && rs > -1 && rs < RAMP.S1)) { closeSession(); force((n) => n + 1); }
  });
}

export const parkingUi = { open: false };
/** Payment panel at the exit barrier (DOM). Shows plate, times, stay, free minutes, fee and the wallet. */
export function ParkingPanel() {
  useGame((s) => s.money);
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 500); return () => clearInterval(id); }, []);
  const [msg, setMsg] = useState('');
  if (!parkingUi.open) return null;
  const s = parking.session; const q = currentQuote();
  const close = () => { parkingUi.open = false; setMsg(''); force((n) => n + 1); };
  if (!s || !q) { parkingUi.open = false; return null; }
  const money = game.get().money;
  const fmtT = (t: number) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const pay = () => {
    const r = paySession((amount, text) => { if (game.get().money < amount) return false; addMoney(-amount, text); return true; });
    if (!r.ok) { setMsg(r.reason === 'Không đủ tiền.' ? `Không đủ tiền: cần ${formatVnd(q.fee)}, ví còn ${formatVnd(money)}. Chưa trừ tiền.` : r.reason ?? ''); return; }
    game.toast(`Đã trả ${formatVnd(r.fee ?? 0)} phí gửi xe. Barie mở, mời xe ra.`); close();
  };
  return <div className="lift-panel parking-panel" role="dialog" aria-label="Thanh toán gửi xe">
    <div className="lift-head"><b>LOTTE CENTER · GỬI XE</b><span>{VEHICLE_NAME[s.vehicleType]} · {s.licensePlate}</span></div>
    <table className="parking-table"><tbody>
      <tr><td>Giờ vào</td><td>{fmtT(s.entryTime)}</td></tr>
      <tr><td>Giờ hiện tại</td><td>{fmtT(Date.now())}</td></tr>
      <tr><td>Thời gian gửi</td><td>{Math.floor(q.elapsedMinutes / 60)} giờ {Math.floor(q.elapsedMinutes % 60)} phút{q.overnight ? ' · qua đêm' : ''}</td></tr>
      <tr><td>Hội viên</td><td>{TIER_NAME[s.membershipTier]}{q.freeMinutes ? ` · miễn ${Math.round(q.freeMinutes)} phút` : ''}</td></tr>
      <tr><td>Ô đỗ</td><td>{s.parkingSlot ?? '—'}</td></tr>
      <tr className="total"><td>Phí</td><td>{formatVnd(q.fee)}</td></tr>
      <tr><td>Số dư ví</td><td>{formatVnd(money)}</td></tr>
    </tbody></table>
    {msg && <p className="parking-msg">{msg}</p>}
    <div className="lift-foot"><span>Tiền ảo trong game. Ô tô 40.000đ/giờ (làm tròn lên), xe máy 5.000đ/lượt (qua đêm 20.000đ), xe đạp 3.000đ/lượt.</span>
      <button onClick={pay} disabled={s.paymentStatus === 'paid'}>Thanh toán</button><button onClick={close}>Đóng</button></div>
  </div>;
}
