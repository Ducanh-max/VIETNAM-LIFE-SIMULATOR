import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerBlocker, registerHeight } from '../geo';
import { CABIN, cabinAt, cabinFloorShown, CORE, floorY, FLOOR_H, FLOORS, inCabin, insideTower, LOTTE, lift, lotteBlocks, lotteHeight, sendLift, stepLift, taper, toTower, TOWER, TOWER_TOP } from '../lotte';
import { game, player, useGame } from '../state';

/*
 * Lotte Center Hà Nội: a glass tower tapering from 56 × 32 m to the crown at 272 m beside a six-storey
 * podium, with a walk-in lobby, a working lift (see lotte.ts) and the interior of the floor you are on:
 * department store (1–6), offices (7–32), hotel corridors (33–64) and the glass observation deck (65).
 * Only the player's floor and the cabin are drawn inside; the outside is one merged shaft mesh.
 */
const ROUND = 7;
function roundedRing(hu: number, hv: number, r: number, seg = 5) {
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [[hu - r, hv - r, 0], [-hu + r, hv - r, Math.PI / 2], [-hu + r, -hv + r, Math.PI], [hu - r, -hv + r, Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return pts;
}
/** Tapered rounded shaft from y0 to y1 (tower local: x = u, z = v), UVs: u by perimeter (4 m bays), v by floors. */
function shaft(y0: number, y1: number, scale = 1, rings = 14) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let ringLen = 0;
  for (let k = 0; k <= rings; k++) {
    const y = y0 + ((y1 - y0) * k) / rings; const s = taper(y) * scale;
    const ring = roundedRing(TOWER.halfU * s, TOWER.halfV * s, ROUND * s);
    ringLen = ring.length;
    let acc = 0;
    for (let i = 0; i <= ring.length; i++) {
      const p = ring[i % ring.length]; if (i) { const q = ring[i - 1]; acc += Math.hypot(p[0] - q[0], p[1] - q[1]); }
      pos.push(p[0], y, p[1]); uv.push(acc / 8, y / FLOOR_H);
    }
  }
  const w = ringLen + 1;
  for (let k = 0; k < rings; k++) for (let i = 0; i < ringLen; i++) { const a = k * w + i, b = a + w; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function cap(y: number, scale: number) {
  const s = taper(y) * scale; const ring = roundedRing(TOWER.halfU * s, TOWER.halfV * s, ROUND * s);
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, rep = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let M: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const glass = canvasTex(128, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#7f98a6'); g.addColorStop(1, '#5c7482');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, 64, 128);
    c.fillStyle = '#c8d0d4'; c.fillRect(0, 112, 128, 16); // floor band
    c.fillStyle = '#9aa6ad'; for (const x of [0, 64]) c.fillRect(x, 0, 4, 128); // mullions
  }, true);
  const podium = canvasTex(128, 128, (c) => {
    c.fillStyle = '#d9d4ca'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#56656e'; c.fillRect(8, 30, 112, 70);
    c.fillStyle = '#c3bcb0'; for (const x of [40, 72, 104]) c.fillRect(x, 30, 4, 70);
  }, true);
  const sign = canvasTex(512, 96, (c) => {
    c.fillStyle = '#c8102e'; c.fillRect(0, 0, 512, 96);
    c.fillStyle = '#fff'; c.font = 'bold 54px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LOTTE CENTER', 256, 50);
  });
  return {
    glass: new THREE.MeshStandardMaterial({ map: glass, roughness: 0.18, metalness: 0.55 }),
    podium: new THREE.MeshStandardMaterial({ map: podium, roughness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: '#8f989d', roughness: 0.7 }),
    frame: new THREE.MeshStandardMaterial({ color: '#c9cfd3', roughness: 0.3, metalness: 0.8 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.35 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#7d5a4a', roughness: 0.95 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.9, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.85 }),
    core: new THREE.MeshStandardMaterial({ color: '#c9b79a', roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: '#b9bec2', roughness: 0.25, metalness: 0.9 }),
    window: new THREE.MeshPhysicalMaterial({ color: '#bcd6e2', roughness: 0.05, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    desk: new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.6 }),
    rack: new THREE.MeshStandardMaterial({ color: '#3e4246', roughness: 0.5 }),
    goods: new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.7 }),
    light: new THREE.MeshBasicMaterial({ color: '#fff8e6' }),
  };
}
const mats = () => (M ??= makeMats());

/** A floor's purpose, after the article (hotel 33–64, store 1–6, deck 65; the rest offices). */
const floorKind = (f: number) => (f === 65 ? 'deck' : f >= 33 ? 'hotel' : f >= 7 ? 'office' : f === 1 ? 'lobby' : 'store');
const FLOOR_NAME: Record<string, string> = { lobby: 'Sảnh · Lotte Department Store', store: 'Lotte Department Store', office: 'Văn phòng', hotel: 'Lotte Hotel Hanoi', deck: 'Đài quan sát Hanoi Sky' };

function Interior({ f, doorsRef, display }: { f: number; doorsRef: React.RefObject<THREE.Group[]>; display: THREE.Texture }) {
  const m = mats();
  const s = taper(floorY(f));
  const hu = TOWER.halfU * s - 0.4, hv = TOWER.halfV * s - 0.4;
  const kind = floorKind(f);
  const H = kind === 'deck' ? 4.6 : 3.6;
  const items = useMemo(() => {
    const boxes: { p: [number, number, number]; s: [number, number, number]; m: keyof ReturnType<typeof makeMats> }[] = [];
    if (kind === 'office') for (let u = -hu + 3; u < hu - 3; u += 4) for (const v of [-hv + 3, hv - 3]) if (Math.abs(u) > CORE.halfU + 1.5 || Math.abs(v) > CORE.halfV + 2) boxes.push({ p: [u, 0.38, v], s: [2.6, 0.06, 1.2], m: 'desk' }, { p: [u, 0.19, v], s: [0.08, 0.38, 1.0], m: 'rack' });
    if (kind === 'hotel') {
      // corridor round the core, rooms along the facade: partition walls with doors
      for (let u = -hu + 4; u < hu - 1; u += 4.2) for (const side of [-1, 1]) boxes.push({ p: [u, H / 2, side * (CORE.halfV + 3.6)], s: [0.15, H, 0.15], m: 'wall' }, { p: [u, H / 2, side * (CORE.halfV + 3.6 + (hv - CORE.halfV - 3.6) / 2)], s: [0.12, H, hv - CORE.halfV - 3.6], m: 'wall' });
      for (const side of [-1, 1]) for (let u = -hu + 2; u < hu - 2; u += 4.2) boxes.push({ p: [u + 1.1, H / 2 - 0.4, side * (CORE.halfV + 3.6)], s: [2.4, H - 0.8, 0.12], m: 'wall' });
    }
    if (kind === 'store') for (let u = -hu + 4; u < hu - 3; u += 5) for (const v of [-hv + 3.5, hv - 3.5]) boxes.push({ p: [u, 0.9, v], s: [3, 1.8, 0.6], m: 'rack' }, { p: [u, 1.3, v + Math.sign(v) * -0.32], s: [2.6, 0.5, 0.05], m: 'goods' });
    if (kind === 'lobby') boxes.push({ p: [hu - 9, 0.55, -hv + 4], s: [5, 1.1, 1.2], m: 'desk' }, { p: [hu - 9, 1.15, -hv + 4], s: [5.2, 0.08, 1.4], m: 'steel' });
    if (kind === 'deck') for (let u = -hu + 6; u < hu - 4; u += 8) boxes.push({ p: [u, 0.25, hv - 1.8], s: [2.4, 0.45, 0.6], m: 'desk' }, { p: [u, 0.25, -hv + 1.8], s: [2.4, 0.45, 0.6], m: 'desk' });
    return boxes;
  }, [kind, hu, hv, H]);
  const ring = useMemo(() => roundedRing(hu + 0.3, hv + 0.3, ROUND * s - 0.4), [hu, hv, s]);
  const windowGeo = useMemo(() => {
    // floor-to-ceiling glass (on floor 1 with the door gap on the east face)
    const pos: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (f === 1 && a[0] > hu && b[0] > hu && Math.abs((a[1] + b[1]) / 2) < 2.6) continue;
      pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], H, b[1], a[0], 0, a[1], b[0], H, b[1], a[0], H, a[1]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  }, [ring, f, hu, H]);
  const slab = useMemo(() => { const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))); const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); return g; }, [ring]);
  return <group position={[0, GROUND_HEIGHT + floorY(f), 0]}>
    <mesh geometry={slab} material={kind === 'hotel' ? m.carpet : m.floor} position={[0, 0.02, 0]} receiveShadow />
    <mesh geometry={slab} material={m.ceiling} position={[0, H, 0]} />
    <mesh geometry={windowGeo} material={m.window} />
    {/* the lift core: walls round it, the landing doorway on the +v face */}
    <mesh material={m.core} position={[0, H / 2, -CORE.halfV]}><boxGeometry args={[CORE.halfU * 2, H, 0.3]} /></mesh>
    {[-1, 1].map((sd) => <mesh key={sd} material={m.core} position={[sd * CORE.halfU, H / 2, 0]}><boxGeometry args={[0.3, H, CORE.halfV * 2]} /></mesh>)}
    {[-1, 1].map((sd) => <mesh key={`f${sd}`} material={m.core} position={[sd * (CORE.halfU + CABIN.u1) / 2, H / 2, CORE.halfV]}><boxGeometry args={[CORE.halfU - CABIN.u1, H, 0.3]} /></mesh>)}
    <mesh material={m.core} position={[0, (H + 2.4) / 2, CORE.halfV]}><boxGeometry args={[CABIN.u1 * 2, H - 2.4, 0.3]} /></mesh>
    {/* landing doors (slide open when the cabin is here) and the floor display above them */}
    {[-1, 1].map((sd, i) => <group key={`d${sd}`} ref={(g) => { if (g && doorsRef.current) doorsRef.current[i] = g; }} position={[sd * 0.65, 1.2, CORE.halfV + 0.17]}>
      <mesh material={m.steel}><boxGeometry args={[1.3, 2.4, 0.05]} /></mesh>
    </group>)}
    <mesh position={[0, 2.75, CORE.halfV + 0.17]}><planeGeometry args={[0.9, 0.34]} /><meshBasicMaterial map={display} /></mesh>
    {kind === 'lobby' && <mesh material={m.sign} position={[0, 2.9, -CORE.halfV - 0.17]} rotation={[0, Math.PI, 0]}><planeGeometry args={[5, 0.94]} /></mesh>}
    {items.map((b, i) => <mesh key={i} material={m[b.m] as THREE.Material} position={b.p}><boxGeometry args={b.s} /></mesh>)}
    {/* ceiling lights */}
    {Array.from({ length: Math.floor(hu / 4) }, (_, i) => -hu + 4 + i * 8).flatMap((u) => [-hv + 4, hv - 4].map((v) => <mesh key={`${u}${v}`} material={m.light} position={[u, H - 0.02, v]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[2.4, 0.5]} /></mesh>))}
  </group>;
}

function Cabin({ cabin, doors }: { cabin: React.RefObject<THREE.Group | null>; doors: React.RefObject<THREE.Group[]> }) {
  const m = mats();
  const w = CABIN.u1 - CABIN.u0, d = CABIN.v1 - CABIN.v0, cv = (CABIN.v0 + CABIN.v1) / 2;
  return <group ref={cabin}>
    <mesh material={m.floor} position={[0, 0.03, cv]}><boxGeometry args={[w, 0.06, d]} /></mesh>
    <mesh material={m.steel} position={[0, 1.3, CABIN.v0]}><boxGeometry args={[w, 2.6, 0.06]} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} material={m.steel} position={[s * w / 2, 1.3, cv]}><boxGeometry args={[0.06, 2.6, d]} /></mesh>)}
    <mesh material={m.light} position={[0, 2.58, cv]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[w - 0.3, d - 0.3]} /></mesh>
    <mesh material={m.rack} position={[w / 2 - 0.04, 1.2, CABIN.v1 - 0.4]}><boxGeometry args={[0.02, 0.5, 0.25]} /></mesh>
    {[-1, 1].map((s, i) => <group key={`cd${s}`} ref={(g) => { if (g && doors.current) doors.current[i] = g; }} position={[s * 0.65, 1.2, CABIN.v1 + 0.04]}><mesh material={m.steel}><boxGeometry args={[1.3, 2.4, 0.04]} /></mesh></group>)}
  </group>;
}

export function Lotte() {
  const m = mats();
  const geo = useMemo(() => {
    if (!LOTTE) return null;
    const top65 = floorY(FLOORS) + FLOOR_H;
    const pd = LOTTE.podium;
    const podium = new THREE.BoxGeometry(pd.u1 - pd.u0, pd.h, pd.v1 - pd.v0);
    podium.translate((pd.u0 + pd.u1) / 2, GROUND_HEIGHT + pd.h / 2, (pd.v0 + pd.v1) / 2);
    const uv = podium.getAttribute('uv'); const pos = podium.getAttribute('position'); const nor = podium.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) { const along = Math.abs(nor.getX(i)) > 0.5 ? pos.getZ(i) : pos.getX(i); uv.setXY(i, along / 6, pos.getY(i) / FLOOR_H); }
    return {
      shaft: shaft(GROUND_HEIGHT + FLOOR_H, GROUND_HEIGHT + top65),
      band: shaft(GROUND_HEIGHT, GROUND_HEIGHT + FLOOR_H, 1, 1),
      crown: shaft(GROUND_HEIGHT + top65, GROUND_HEIGHT + 267 + 1.5, 0.82, 2),
      roof: cap(GROUND_HEIGHT + 267 + 1.5, 0.82),
      shoulder: cap(GROUND_HEIGHT + top65, 1),
      podium,
      parapet: roundedRing(TOWER.halfU * taper(268) * 0.82, TOWER.halfV * taper(268) * 0.82, ROUND * 0.7),
    };
  }, []);
  const cabin = useRef<THREE.Group>(null);
  const cabinDoors = useRef<THREE.Group[]>([]);
  const landingDoors = useRef<THREE.Group[]>([]);
  const [floor, setFloor] = useState(1);
  const [near, setNear] = useState(false);
  const display = useMemo(() => canvasTex(128, 48, () => {}), []);
  const lastShown = useRef('');
  useEffect(() => { const a = registerBlocker(lotteBlocks); const b = registerHeight(lotteHeight); return () => { a(); b(); }; }, []);
  useFrame((_, delta) => {
    if (!LOTTE) return;
    const dt = Math.min(delta, 0.05);
    stepLift(dt);
    const p: [number, number] = [player.position.x, player.position.z];
    const [u, v] = toTower(p);
    const isNear = Math.abs(u) < 260 && Math.abs(v) < 260;
    if (isNear !== near) setNear(isNear);
    if (!isNear) return;
    const inside = insideTower(p);
    lift.inside = inside;
    if (!inside && lift.playerFloor !== 1 && !lift.riding) lift.playerFloor = 1;
    if (lift.playerFloor !== floor) setFloor(lift.playerFloor);
    // cabin and doors
    if (cabin.current) cabin.current.position.y = GROUND_HEIGHT + lift.cabinY;
    const open = lift.doors;
    cabinDoors.current.forEach((g, i) => { if (g) g.position.x = (i ? 1 : -1) * (0.65 + open * 1.2); });
    const here = cabinAt(lift.playerFloor) ? open : 0;
    landingDoors.current.forEach((g, i) => { if (g) g.position.x = (i ? 1 : -1) * (0.65 + here * 1.2); });
    // floor display
    const shown = `${cabinFloorShown()}${lift.moving ? (lift.cabinV > 0 ? '▲' : '▼') : ''}`;
    if (shown !== lastShown.current) {
      lastShown.current = shown;
      const c = display.image as HTMLCanvasElement; const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#0d0f10'; ctx.fillRect(0, 0, 128, 48); ctx.fillStyle = '#ff9a2e'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(shown, 64, 26);
      display.needsUpdate = true;
    }
    // camera limits indoors
    const inCab = inCabin(u, v) && (lift.riding || cabinAt(lift.playerFloor));
    if (inside) player.cameraMax = inCab ? 2.2 : 4; else if (player.cameraMax === 2.2 || player.cameraMax === 4) player.cameraMax = Infinity;
    if (lift.panel && !inCab) lift.panel = false;
    // prompts
    const s = game.get();
    if (s.ride || player.seat) return;
    if (inCab && !lift.riding) {
      game.offer({ id: 'lift-panel', text: `Thang máy Lotte · tầng ${lift.cabinFloor}: chọn tầng (1–${FLOORS})`, key: 'E', priority: 9, run: () => { lift.panel = true; lift.doorWant = 1; lift.doorTimer = 999; if (document.pointerLockElement) document.exitPointerLock(); game.set({}); } });
    } else if (lift.riding) {
      game.offer({ id: 'lift-ride', text: `Đang lên/xuống… tầng ${cabinFloorShown()} → ${lift.target}`, key: null, priority: 9 });
    } else if (inside && Math.abs(u) < 2.5 && v > CORE.halfV && v < CORE.halfV + 3) {
      game.offer(cabinAt(lift.playerFloor) && lift.doors > 0.5
        ? { id: 'lift-in', text: 'Bước vào thang máy', key: null, priority: 8 }
        : { id: 'lift-call', text: lift.moving ? `Thang đang tới · tầng ${cabinFloorShown()}` : 'Gọi thang máy', key: lift.moving ? null : 'E', priority: 8, run: () => sendLift(lift.playerFloor, false) });
    } else if (inside) {
      game.offer({ id: 'lotte-floor', text: `Lotte Center · tầng ${lift.playerFloor} · ${FLOOR_NAME[floorKind(lift.playerFloor)]}`, key: null, priority: 1 });
    }
  });
  if (!LOTTE || !geo) return null;
  return <group position={[LOTTE.center[0], 0, LOTTE.center[1]]} rotation={[0, LOTTE.rotY, 0]}>
    <mesh geometry={geo.podium} material={m.podium} castShadow receiveShadow />
    <mesh geometry={geo.shaft} material={m.glass} castShadow />
    <mesh geometry={geo.shoulder} material={m.roof} />
    <mesh geometry={geo.crown} material={m.glass} />
    <mesh geometry={geo.roof} material={m.roof} />
    {/* open-air top ("Top of Hanoi"): a frame parapet up to 272 m */}
    {geo.parapet.filter((_, i) => i % 3 === 0).map(([x, z], i) => <mesh key={i} material={m.frame} position={[x, GROUND_HEIGHT + (268.5 + TOWER_TOP) / 2, z]}><boxGeometry args={[0.35, TOWER_TOP - 268.5, 0.35]} /></mesh>)}
    <mesh material={m.sign} position={[TOWER.halfU * taper(270) + 0.1, GROUND_HEIGHT + 258, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[16, 3]} /></mesh>
    <mesh material={m.sign} position={[0, GROUND_HEIGHT + LOTTE.podium.h - 3, LOTTE.podium.v1 + 0.1]}><planeGeometry args={[18, 3.4]} /></mesh>
    {/* lobby storefront on floor 1 and the entrance canopy */}
    <mesh material={m.frame} position={[TOWER.halfU + 1.5, GROUND_HEIGHT + 3.6, 0]}><boxGeometry args={[3, 0.25, 7]} /></mesh>
    {near && <>
      <Interior key={floor} f={floor} doorsRef={landingDoors} display={display} />
      <group position={[0, 0, 0]}><Cabin cabin={cabin} doors={cabinDoors} /></group>
    </>}
    {/* the ground-floor glass is part of Interior; seen from outside when far, a plain glass band */}
    {(!near || floor > 1) && <mesh geometry={geo.band} material={m.glass} />}
  </group>;
}

/** The lift's floor panel: buttons 1–65, opened from inside the cabin. */
export function LiftPanel() {
  useGame((s) => s.prompt?.id);
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 200); return () => clearInterval(id); }, []);
  if (!lift.panel) return null;
  return <div className="lift-panel" role="dialog" aria-label="Bảng chọn tầng">
    <div className="lift-head"><b>LOTTE CENTER</b><span>Thang máy · đang ở tầng {lift.cabinFloor}</span></div>
    <div className="lift-grid">
      {Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((f) => <button key={f} className={f === lift.cabinFloor ? 'here' : f === 65 ? 'deck' : ''} onClick={() => { sendLift(f, true); force((n) => n + 1); }}>{f}</button>)}
    </div>
    <div className="lift-foot"><span>65 · Đài quan sát Hanoi Sky · 33–64 Khách sạn · 7–32 Văn phòng · 1–6 Trung tâm thương mại</span><button onClick={() => { lift.panel = false; lift.doorTimer = 2; force((n) => n + 1); }}>Đóng</button></div>
  </div>;
}
