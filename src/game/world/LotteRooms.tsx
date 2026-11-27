import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, insidePolygon, type Point } from '../geo';
import { AMENITY_FLOOR, ATRIUM, CORE, floorY, fromRamp, inPodiumPlate, lift, MALL_TOP, toRamp, toTower, towerBlockers, towerRing, TOWER } from '../lotte';
import { bookRoom, life, lifeConfig, rentApartment, roomNo, startShift, stepShift, useLife } from '../lotteLife';
import { formatVnd, game, player, useGame } from '../state';

/*
 * The tower above the mall (spec section 11), drawn for the player's floor only:
 *  7      hotel amenities: a gym inside the tower, the outdoor pool on the podium roof with loungers and towels
 *  8–31   offices: reception by the lift, open-plan desks, a glass meeting room; work a shift for pay (lotteLife.ts)
 *  33–56  LOTTE HOTEL: corridor round the core, numbered room doors; book at the reception on 33, then only your
 *         room opens (bed, TV, wardrobe, desk, bathroom)
 *  57–64  serviced apartments: two-bay units, some to let; the one you rent opens (living room, kitchen, bedroom)
 * plus walking NPCs on every built floor (shoppers, visitors, office staff, housekeeping). All modules, not the
 * building's real plans.
 */
const CORRIDOR = CORE.halfV + 3.6; // room fronts at |v| = 8,1 m
/** Reception desks (offices, hotel on 33): beside the lift lobby, east of the core, staff on the far side. */
const DESK: Point = [11, 6.6];
const SLOT_W = 4.2;
type Slot = { slot: number; side: 1 | -1; u0: number; u1: number };
/** Room bays along both long faces, skipping the narrow middle where the groove is. */
function slots(width = SLOT_W): Slot[] {
  const out: Slot[] = []; let n = 1;
  for (const side of [-1, 1] as const) for (let u = -TOWER.halfU + 2.5; u + width <= TOWER.halfU - 2.5; u += width) {
    if (u + width > -7 && u < 6) continue;
    out.push({ slot: n++, side, u0: u, u1: u + width });
  }
  return out;
}
const HOTEL_SLOTS = slots(); const APT_SLOTS = slots(SLOT_W * 2);
const isHotel = (f: number) => f >= lifeConfig.hotel.firstFloor && f <= lifeConfig.hotel.lastFloor;
const isApt = (f: number) => f >= lifeConfig.apartment.firstFloor && f <= lifeConfig.apartment.lastFloor;
const isOffice = (f: number) => f >= lifeConfig.office.firstFloor && f <= lifeConfig.office.lastFloor;
/** Apartments to let on a floor (a fixed pattern so they are always the same doors). */
const toLet = (f: number, s: Slot) => (f * 7 + s.slot * 3) % 5 === 0;
const ownSlot = (f: number): Slot | null => {
  const L = life.get();
  if (isHotel(f) && L.booking?.floor === f) return HOTEL_SLOTS.find((s) => s.slot === L.booking!.slot) ?? null;
  if (isApt(f) && L.lease?.floor === f) return APT_SLOTS.find((s) => s.slot === L.lease!.slot) ?? null;
  return null;
};
// rooms: partitions everywhere, the corridor wall with a door only into your own room
towerBlockers.push((u, v, f) => {
  if (!isHotel(f) && !isApt(f)) return false;
  const av = Math.abs(v); if (av < CORRIDOR - 0.15) return false;
  const list = isHotel(f) ? HOTEL_SLOTS : APT_SLOTS; const own = ownSlot(f);
  const here = list.find((s) => Math.sign(v) === s.side && u > s.u0 && u < s.u1);
  if (!here) return av > CORRIDOR - 0.15; // the dead bays in the middle and at the ends
  if (Math.abs(u - here.u0) < 0.12 || Math.abs(u - here.u1) < 0.12) return true; // partitions
  if (own !== here) return true;
  if (av < CORRIDOR + 0.15) return Math.abs(u - (here.u0 + here.u1) / 2) > 0.55; // the door
  return false;
});

/** The pool on the podium roof (ramp frame centre; 20 × 7 m of water). */
const POOL = { s: (ATRIUM.s0 + ATRIUM.s1) / 2, t: (ATRIUM.t0 + ATRIUM.t1) / 2 };
towerBlockers.push((u, v, f) => { if (f !== AMENITY_FLOOR) return false; const [s, t] = toRamp(u, v); return Math.abs(s - POOL.s) < 10 && Math.abs(t - POOL.t) < 3.5; });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const label = (text: string, bg: string, fg = '#fff', w = 512, h = 128) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; let px = Math.round(h * 0.55); x.font = `bold ${px}px Arial`;
  while (x.measureText(text).width > w * 0.9 && px > 12) { px -= 3; x.font = `bold ${px}px Arial`; }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t });
};
const LABELS = new Map<string, THREE.MeshBasicMaterial>();
const lab = (text: string, bg: string) => { const k = text + bg; let m = LABELS.get(k); if (!m) { m = label(text, bg); LABELS.set(k, m); } return m; };
let M: ReturnType<typeof mk> | null = null;
function mk() {
  const std = (color: string, x: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...x });
  return {
    wall: std('#ece6da'), door: std('#7a5a3e'), doorOwn: std('#b8863e'), wood: std('#97764F'), white: std('#f4f2ee'), dark: std('#27292B'), steel: std('#b9bec2', { metalness: 0.6, roughness: 0.35 }),
    screen: new THREE.MeshBasicMaterial({ color: '#1e2a36' }), glow: new THREE.MeshBasicMaterial({ color: '#7fc8ff' }), bed: std('#f4f2ee'), duvet: std('#c9b79a'), sofa: std('#5b6f86'), rug: std('#a35a4a'),
    glass: new THREE.MeshStandardMaterial({ color: '#d4e8f0', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({ color: '#3fa7d6', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }), tile: std('#e9e4d6'), poolEdge: std('#f4f2ee'),
    lounger: std('#f4f2ee'), towel: std('#2f7dd8'), umbrella: std('#d51d32'), mat: std('#2f6b4a'), plant: std('#3f7d3a'), pot: std('#b9b3a8'),
    skin: std('#e2b48f'), trousers: std('#2b2f36'),
  };
}
const mats = () => (M ??= mk());
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
function inst(list: { p: [number, number, number]; s: [number, number, number]; yaw?: number }[], mat: THREE.Material) {
  const m = new THREE.InstancedMesh(unitBox, mat, Math.max(1, list.length)); m.count = list.length;
  list.forEach((it, i) => { tmpQ.setFromEuler(tmpE.set(0, it.yaw ?? 0, 0)); tmpM.compose(new THREE.Vector3(...it.p), tmpQ, new THREE.Vector3(...it.s)); m.setMatrixAt(i, tmpM); });
  m.instanceMatrix.needsUpdate = true; return m;
}
const Box = ({ m, p, s, yaw = 0 }: { m: THREE.Material; p: [number, number, number]; s: [number, number, number]; yaw?: number }) => <mesh material={m} position={p} rotation={[0, yaw, 0]}><boxGeometry args={s} /></mesh>;

/** Furniture inside a room bay (hotel room or apartment), facing the corridor door. */
function RoomInside({ s, apt }: { s: Slot; apt: boolean }) {
  const m = mats(); const cu = (s.u0 + s.u1) / 2; const d = s.side; const back = d * (CORRIDOR + 6.5);
  return <group>
    <Box m={m.rug} p={[cu, 0.02, d * (CORRIDOR + 3.5)]} s={[s.u1 - s.u0 - 1, 0.02, 3]} />
    {apt ? <>
      <Box m={m.sofa} p={[s.u0 + 2, 0.4, d * (CORRIDOR + 3)]} s={[2.2, 0.8, 0.9]} yaw={Math.PI / 2} />
      <Box m={m.dark} p={[s.u0 + 4.6, 0.9, d * (CORRIDOR + 3)]} s={[0.08, 0.7, 1.4]} />
      <Box m={m.white} p={[s.u1 - 1.2, 0.45, d * (CORRIDOR + 1.5)]} s={[1.8, 0.9, 0.6]} />{/* kitchen */}
      <Box m={m.steel} p={[s.u1 - 0.5, 0.9, d * (CORRIDOR + 2.6)]} s={[0.7, 1.8, 0.7]} />{/* fridge */}
      <Box m={m.wood} p={[s.u1 - 2.2, 0.38, d * (CORRIDOR + 3.6)]} s={[1.4, 0.06, 0.9]} />{/* dining table */}
      <Box m={m.bed} p={[cu + 1.5, 0.3, back]} s={[2.0, 0.5, 2.2]} /><Box m={m.duvet} p={[cu + 1.5, 0.58, back + d * 0.2]} s={[1.9, 0.08, 1.6]} />
    </> : <>
      <Box m={m.bed} p={[cu, 0.3, back]} s={[2.0, 0.5, 2.2]} /><Box m={m.duvet} p={[cu, 0.58, back + d * 0.2]} s={[1.9, 0.08, 1.6]} />
      <Box m={m.wood} p={[s.u0 + 0.5, 0.3, back]} s={[0.5, 0.6, 0.5]} />
      <Box m={m.dark} p={[s.u1 - 0.1, 1.2, d * (CORRIDOR + 4)]} s={[0.06, 0.6, 1.1]} />{/* TV */}
      <Box m={m.wood} p={[s.u1 - 0.4, 1.0, d * (CORRIDOR + 1.2)]} s={[0.6, 2.0, 1.2]} />{/* wardrobe */}
      <Box m={m.wood} p={[s.u0 + 0.5, 0.38, d * (CORRIDOR + 3)]} s={[0.7, 0.06, 1.2]} />{/* desk */}
    </>}
    <Box m={m.white} p={[s.u0 + 1, 1.2, d * (CORRIDOR + 1.1)]} s={[1.8, 2.4, 1.8]} />{/* bathroom pod */}
  </group>;
}

/** Floors 7–64 (in the tower group). */
export function LotteRooms({ f }: { f: number }) {
  const m = mats(); const y = GROUND_HEIGHT + floorY(f);
  const booking = useLife((s) => s.booking); const lease = useLife((s) => s.lease);
  const doors = useMemo(() => {
    if (!isHotel(f) && !isApt(f)) return null;
    const list = isHotel(f) ? HOTEL_SLOTS : APT_SLOTS; const walls: Parameters<typeof inst>[0] = [], leaves: Parameters<typeof inst>[0] = [];
    for (const s of list) {
      const cu = (s.u0 + s.u1) / 2, v = s.side * CORRIDOR;
      for (const [a, b] of [[s.u0, cu - 0.55], [cu + 0.55, s.u1]]) walls.push({ p: [(a + b) / 2, 1.8, v], s: [b - a, 3.6, 0.15] });
      walls.push({ p: [cu, 3.05, v], s: [1.1, 1.1, 0.15] });
      leaves.push({ p: [cu, 1.05, v + s.side * 0.02], s: [1.0, 2.1, 0.06] });
      walls.push({ p: [s.u0, 1.8, s.side * (CORRIDOR + 5)], s: [0.15, 3.6, 10] });
    }
    return { walls: inst(walls, m.wall), leaves: inst(leaves, m.door), list };
  }, [f, m]);
  const own = ownSlot(f);
  const desks = useMemo(() => {
    if (!isOffice(f)) return null;
    const ring = towerRing(floorY(f), 2.2); const d: Parameters<typeof inst>[0] = [], scr: Parameters<typeof inst>[0] = [], ch: Parameters<typeof inst>[0] = [];
    for (let u = -TOWER.halfU + 4; u < TOWER.halfU - 4; u += 3.2) for (const v of [-12, -9.5, 9.5, 12]) {
      if (Math.abs(u) < CORE.halfU + 6 && Math.abs(v) < 12.5) continue;
      if (!insidePolygon([u, v], ring)) continue;
      d.push({ p: [u, 0.74, v], s: [1.5, 0.05, 0.8] }); scr.push({ p: [u, 1.0, v + Math.sign(v) * 0.3], s: [0.6, 0.38, 0.03] }); ch.push({ p: [u, 0.45, v - Math.sign(v) * 0.55], s: [0.5, 0.9, 0.5] });
    }
    return [inst(d, m.white), inst(scr, m.screen), inst(ch, m.dark)];
  }, [f, m]);
  return <group position={[0, y, 0]}>
    {f === AMENITY_FLOOR && <Amenities />}
    {desks && <>
      {desks.map((x, i) => <primitive key={i} object={x} />)}
      <Box m={m.wood} p={[DESK[0], 0.55, DESK[1]]} s={[3, 1.1, 0.8]} /><mesh material={lab('VĂN PHÒNG · LỄ TÂN', '#27292B')} position={[DESK[0], 2.5, DESK[1] + 0.6]} rotation={[0, Math.PI, 0]}><planeGeometry args={[2.6, 0.5]} /></mesh>
      <group position={[-28, 0, -6]}>{/* glass meeting room */}
        {[[0, -2], [0, 2]].map(([x, z], i) => <Box key={i} m={m.glass} p={[x, 1.4, z]} s={[6, 2.8, 0.05]} />)}
        <Box m={m.glass} p={[3, 1.4, 0]} s={[0.05, 2.8, 4]} /><Box m={m.wood} p={[0, 0.74, 0]} s={[3.6, 0.06, 1.4]} />
      </group>
    </>}
    {doors && <>
      <primitive object={doors.walls} /><primitive object={doors.leaves} />
      {doors.list.map((s) => { const free = isApt(f) && toLet(f, s) && !lease; return <mesh key={s.slot} material={lab(isApt(f) ? (free ? `CHO THUÊ ${roomNo(f, s.slot)}` : roomNo(f, s.slot)) : roomNo(f, s.slot), free ? '#2f7d32' : s === own ? '#b8863e' : '#5d4a36')} position={[(s.u0 + s.u1) / 2, 2.45, s.side * (CORRIDOR - 0.1)]} rotation={[0, s.side > 0 ? Math.PI : 0, 0]}><planeGeometry args={[free ? 1.6 : 0.8, 0.25]} /></mesh>; })}
      {own && <RoomInside s={own} apt={isApt(f)} />}
      {f === lifeConfig.hotel.receptionFloor && <>
        <Box m={m.wood} p={[DESK[0], 0.55, DESK[1]]} s={[4, 1.1, 0.8]} />
        <mesh material={lab('LOTTE HOTEL · LỄ TÂN', '#d51d32')} position={[DESK[0], 2.5, DESK[1] + 0.6]} rotation={[0, Math.PI, 0]}><planeGeometry args={[3, 0.55]} /></mesh>
      </>}
    </>}
    {/* booking and lease badges are read live, so a new booking shows its door at once */}
    <group visible={!!booking || !!lease} />
  </group>;
}

/** Floor 7: gym in the tower, pool on the podium roof. */
function Amenities() {
  const m = mats();
  const poolC = fromRamp(POOL.s, POOL.t); const yawE = -Math.atan2(rampE()[1], rampE()[0]);
  const loungers = useMemo(() => { const out: Point[] = []; for (let k = -3; k <= 3; k++) { const [u, v] = fromRamp((ATRIUM.s0 + ATRIUM.s1) / 2 + k * 2.6, ATRIUM.t0 - 4); if (inPodiumPlate(u, v)) out.push([u, v]); } return out; }, []);
  return <group>
    {/* gym: treadmills, bikes, a bench, mats */}
    {[-30, -27, -24, -21].map((u, i) => <group key={i} position={[u, 0, -9]}><Box m={m.dark} p={[0, 0.25, 0]} s={[0.8, 0.5, 1.8]} /><Box m={m.steel} p={[0, 1.1, -0.8]} s={[0.7, 1.2, 0.1]} /></group>)}
    {[22, 25, 28].map((u, i) => <group key={`b${i}`} position={[u, 0, 9]}><Box m={m.dark} p={[0, 0.45, 0]} s={[0.4, 0.9, 1.2]} /><Box m={m.steel} p={[0, 1.0, 0.5]} s={[0.5, 0.2, 0.2]} /></group>)}
    <Box m={m.mat} p={[30, 0.02, -8]} s={[4, 0.03, 3]} /><Box m={m.steel} p={[34, 0.5, -10]} s={[2, 1, 0.4]} />
    <mesh material={lab('PHÒNG TẬP · GYM', '#27292B')} position={[-26, 2.6, -11.5]}><planeGeometry args={[2.4, 0.5]} /></mesh>
    {/* the outdoor pool on the podium roof */}
    <group position={[poolC[0], 0, poolC[1]]} rotation={[0, yawE, 0]}>
      <Box m={m.poolEdge} p={[0, 0.08, 0]} s={[22, 0.16, 9]} />
      <Box m={m.water} p={[0, 0.12, 0]} s={[20, 0.1, 7]} />
      <mesh material={lab('HỒ BƠI NGOÀI TRỜI', '#2f7dd8')} position={[0, 2.2, -5.2]}><planeGeometry args={[3, 0.6]} /></mesh>
    </group>
    {loungers.map(([u, v], i) => <group key={`l${i}`} position={[u, 0, v]} rotation={[0, yawE, 0]}>
      <Box m={m.lounger} p={[0, 0.3, 0]} s={[0.7, 0.12, 1.9]} /><Box m={m.towel} p={[0, 0.38, 0.2]} s={[0.6, 0.03, 0.9]} />
      {i % 2 === 0 && <><mesh material={m.steel} position={[0.6, 1.1, 0]}><cylinderGeometry args={[0.03, 0.03, 2.2, 6]} /></mesh><mesh material={m.umbrella} position={[0.6, 2.2, 0]}><coneGeometry args={[1.3, 0.5, 8]} /></mesh></>}
    </group>)}
  </group>;
}
const rampE = (): Point => { const a = fromRamp(0, 0), b = fromRamp(1, 0); return [b[0] - a[0], b[1] - a[1]]; };

// ---- walking NPCs on every built floor ----
type Path = Point[];
function pathsFor(f: number): Path[] {
  const loop = (s0: number, s1: number, t0: number, t1: number): Path => [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => fromRamp(s, t));
  if (f >= 1 && f <= MALL_TOP) return [loop(ATRIUM.s0 - 3, ATRIUM.s1 + 3, ATRIUM.t0 - 3, ATRIUM.t1 + 1.2), loop(ATRIUM.s0 - 6, ATRIUM.s1 + 6, ATRIUM.t0 - 5, ATRIUM.t1 + 1.2)];
  if (f === 65) { const r = towerRing(floorY(65), 2.5); return [r.filter((_, i) => i % 3 === 0)]; }
  if (isOffice(f) || f === AMENITY_FLOOR) return [[[-CORE.halfU - 2.5, -CORE.halfV - 2.5], [CORE.halfU + 2.5, -CORE.halfV - 2.5], [CORE.halfU + 2.5, CORE.halfV + 2.5], [-CORE.halfU - 2.5, CORE.halfV + 2.5]]];
  if (isHotel(f) || isApt(f)) return [[[-36, 6], [36, 6], [36, -6], [-36, -6]]];
  return [];
}
const SHIRTS = ['#5b7fa6', '#e0a21b', '#3f7d3a', '#c8342b', '#8a5cc2', '#f4f2ee', '#1d4f8f'];
/** NPCs walking loops on the player's floor (speed 1,1 m/s, a little bob), or standing at work in offices. */
export function Walkers({ f }: { f: number }) {
  const m = mats();
  const walkers = useMemo(() => {
    const ps = pathsFor(f); const out: { path: Path; len: number; off: number; color: string; speed: number }[] = [];
    ps.forEach((p, pi) => { let len = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); } const n = f <= MALL_TOP ? 4 : 2; for (let k = 0; k < n; k++) out.push({ path: p, len, off: (k / n) * len + pi * 3, color: SHIRTS[(pi * 3 + k + f) % SHIRTS.length], speed: (k % 2 ? 1 : -1) * (1.0 + 0.15 * k) }); });
    return out;
  }, [f]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    walkers.forEach((w, i) => {
      const g = refs.current[i]; if (!g) return;
      let d = ((w.off + t * w.speed) % w.len + w.len) % w.len;
      for (let k = 0; k < w.path.length; k++) {
        const a = w.path[k], b = w.path[(k + 1) % w.path.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= l) { const q = d / l; g.position.set(a[0] + (b[0] - a[0]) * q, Math.abs(Math.sin(t * 6 + i)) * 0.04, a[1] + (b[1] - a[1]) * q); g.rotation.y = Math.atan2((b[0] - a[0]) * Math.sign(w.speed), (b[1] - a[1]) * Math.sign(w.speed)); break; }
        d -= l;
      }
    });
  });
  const shirts = useMemo(() => walkers.map((w) => new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.7 })), [walkers]);
  if (!walkers.length) return null;
  return <group position={[0, GROUND_HEIGHT + floorY(f), 0]}>
    {walkers.map((_, i) => <group key={i} ref={(g) => { refs.current[i] = g; }}>
      <mesh material={m.trousers} position={[0, 0.45, 0]}><boxGeometry args={[0.34, 0.9, 0.22]} /></mesh>
      <mesh material={shirts[i]} position={[0, 1.18, 0]}><boxGeometry args={[0.44, 0.58, 0.26]} /></mesh>
      <mesh material={m.skin} position={[0, 1.64, 0]}><sphereGeometry args={[0.19, 10, 8]} /></mesh>
    </group>)}
  </group>;
}

// ---- prompts ----
export function useRoomsFlow() {
  useFrame(() => {
    const f = lift.playerFloor; stepShift(f);
    if (f < AMENITY_FLOOR || f > 64) return;
    const [u, v] = toTower([player.position.x, player.position.z]); const L = life.get();
    if (L.shift) { const left = Math.max(0, lifeConfig.office.shiftSeconds - (Date.now() - L.shift.startedAt) / 1000); game.offer({ id: 'office-shift', text: `Đang làm ca văn phòng · còn ${Math.ceil(left)} giây · lương ${formatVnd(lifeConfig.office.pay)}`, key: null, priority: 5 }); return; }
    const atDesk = () => Math.abs(u - DESK[0]) < 2.4 && v < DESK[1] - 0.3 && v > DESK[1] - 2.6;
    if (isOffice(f) && atDesk()) { game.offer({ id: 'office-job', text: `Làm một ca văn phòng · ${lifeConfig.office.shiftSeconds} giây · ${formatVnd(lifeConfig.office.pay)}`, key: 'E', priority: 8, run: () => startShift(f) }); return; }
    if (f === lifeConfig.hotel.receptionFloor && atDesk()) { game.offer({ id: 'hotel-desk', text: L.booking ? `Phòng của bạn: ${L.booking.room} (tầng ${L.booking.floor})` : 'Lễ tân LOTTE HOTEL: đặt phòng', key: L.booking ? null : 'E', priority: 8, run: () => { life.set({ panel: 'hotel', message: '' }); if (document.pointerLockElement) document.exitPointerLock(); } }); return; }
    if (isApt(f) && !L.lease) for (const s of APT_SLOTS) if (toLet(f, s) && Math.abs(v - s.side * (CORRIDOR - 1)) < 1.4 && Math.abs(u - (s.u0 + s.u1) / 2) < 1.5) {
      game.offer({ id: 'apt-rent', text: `Thuê căn hộ ${roomNo(f, s.slot)} · ${formatVnd(lifeConfig.apartment.monthly)}/tháng`, key: 'E', priority: 8, run: () => rentApartment(f, s.slot) }); return;
    }
    const own = ownSlot(f);
    if (own && Math.sign(v) === own.side && Math.abs(v) > CORRIDOR + 4 && u > own.u0 && u < own.u1) { game.offer({ id: 'room-rest', text: isApt(f) ? 'Nhà của bạn · nghỉ ngơi' : `Phòng ${roomNo(f, own.slot)} · nghỉ ngơi`, key: 'E', priority: 7, run: () => game.toast('Bạn nằm nghỉ một lúc, nhìn ra thành phố qua cửa kính. Thật thư thái!') }); return; }
    if (f === AMENITY_FLOOR && inPodiumPlate(u, v)) { game.offer({ id: 'pool', text: 'Hồ bơi ngoài trời · bơi vài vòng', key: 'E', priority: 6, run: () => { const g = game.get(); game.set({ thirst: Math.max(0, g.thirst - 5) }); game.toast('Bạn bơi vài vòng, nước mát rượi. Bơi xong hơi khát nước.'); } }); }
  });
}
/** Hotel booking panel. */
export function RoomsPanel() {
  const s = useLife((x) => x); const money = useGame((g) => g.money);
  if (s.panel !== 'hotel') return null;
  return <div className="lift-panel parking-panel" role="dialog" aria-label="LOTTE HOTEL">
    <div className="lift-head"><b>LOTTE HOTEL · LỄ TÂN</b><span>Tầng 33–56 · ví {formatVnd(money)}</span></div>
    <table className="parking-table"><tbody>
      {lifeConfig.hotel.rooms.map((r) => <tr key={r.id}><td>{r.name}</td><td>{formatVnd(r.price)}/đêm</td><td><button onClick={() => bookRoom(r.id, HOTEL_SLOTS.length)} disabled={!!s.booking}>Đặt</button></td></tr>)}
    </tbody></table>
    {s.message && <p className="parking-msg">{s.message}</p>}
    <div className="lift-foot"><span>Giá trong game. Nhận phòng xong, chỉ cửa phòng của bạn mở được.</span><button onClick={() => life.set({ panel: null, message: '' })}>Đóng</button></div>
  </div>;
}

if (import.meta.env.DEV) (window as unknown as { __rooms?: unknown }).__rooms = { HOTEL_SLOTS, APT_SLOTS, CORRIDOR, DESK };
