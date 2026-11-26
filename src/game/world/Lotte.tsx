import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerBlocker, registerHeight } from '../geo';
import { insidePolygon } from '../geo';
import { DOOR_HALF, CABIN, cabinAt, cabinFloorShown, CORE, FLOOR_IDS, floorInfo, floorLabel, floorY, FLOOR_H, GROOVE_LIPS, inCabin, insideTower, LOTTE, lift, liftState, lotteBlocks, lotteHeight, sendLift, stepLevel, stepLift, taper, toTower, TOWER, TOWER_TOP, towerRing } from '../lotte';
import { LotteBasement, LottePortal, ParkingPanel, useParkingFlow } from './LotteBasement';
import { materials as worldMaterials } from './materials';
import { game, player, useGame } from '../state';

/*
 * Lotte Center Hà Nội: a 56 × 32 m glass tower to 272 m, its broad faces split by a vertical groove into two
 * leaves that draw in at mid-height and open out at the crown (the áo dài idea), beside a six-storey patterned
 * blue-glass podium, with a walk-in lobby, a working lift (see lotte.ts) and the interior of the floor you are on:
 * department store (1–6), offices (7–32), hotel corridors (33–64) and the glass observation deck (65).
 * Only the player's floor and the cabin are drawn inside; the outside is one merged shaft mesh.
 */
/** The facade texture repeats every 32 m round the tower and every 16 floors up it. */
const FACADE_U = 32, FACADE_FLOORS = 16;
/** The shaft from y0 to y1 (tower local: x = u, z = v), its rings following towerRing; UVs per FACADE_U / FACADE_FLOORS. */
function shaft(y0: number, y1: number, scale = 1, rings = 14) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let ringLen = 0;
  for (let k = 0; k <= rings; k++) {
    const y = y0 + ((y1 - y0) * k) / rings;
    const ring = towerRing(y - GROUND_HEIGHT).map(([u, v]): [number, number] => [u * scale, v * scale]);
    ringLen = ring.length;
    let acc = 0;
    for (let i = 0; i <= ring.length; i++) {
      const p = ring[i % ring.length]; if (i) { const q = ring[i - 1]; acc += Math.hypot(p[0] - q[0], p[1] - q[1]); }
      pos.push(p[0], y, p[1]); uv.push(acc / FACADE_U, (y - GROUND_HEIGHT) / (FLOOR_H * FACADE_FLOORS));
    }
  }
  const w = ringLen + 1;
  for (let k = 0; k < rings; k++) for (let i = 0; i < ringLen; i++) { const a = k * w + i, b = a + w; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Floor-1 glass of the tower seen from outside, with the lobby door opening on the east face. */
function lobbyBand() {
  const ring = towerRing(0);
  const pos: number[] = [], uv: number[] = [];
  const y0 = GROUND_HEIGHT - 0.02, y1 = GROUND_HEIGHT + FLOOR_H + 0.02;
  let acc = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u0 = acc / FACADE_U, u1 = (acc + l) / FACADE_U; acc += l;
    if (a[0] > TOWER.halfU - 0.5 && b[0] > TOWER.halfU - 0.5 && Math.abs((a[1] + b[1]) / 2) < DOOR_HALF) continue; // the door
    // counter-clockwise ring seen from above: this winding faces outward
    pos.push(a[0], y0, a[1], a[0], y1, a[1], b[0], y0, b[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y1, b[1]);
    const t = 1 / FACADE_FLOORS; uv.push(u0, 0, u0, t, u1, 0, u1, 0, u0, t, u1, t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function cap(y: number, scale: number, inset = 0) {
  const ring = towerRing(y - GROUND_HEIGHT, inset).map(([u, v]): [number, number] => [u * scale, v * scale]);
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
/** A small deterministic random sequence, so the facade looks the same on every load. */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
/** Colours of the spec sheet (section 13): glass, glass highlight, aluminium, brand red. */
const C = { glass: '#548EB4', light: '#A8CBDC', alu: '#B8C3C9', red: '#D51D32' };
function shade(hex: string, k: number) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }
/**
 * Facade atlas: 32 m round × 16 floors up. 20 panes of 1.6 m per row, a frit spandrel band at each slab, silver
 * mullions; every pane a slightly different blue with the sky's highlight in its upper part. The night map
 * draws the same grid with uneven lit windows (whole lit runs on some floors, scattered rooms on others).
 */
function facadeMaps() {
  const W = 512, H = 1024, cols = 20, rows = FACADE_FLOORS; const pw = W / cols, ph = H / rows;
  const r = rng(54);
  const day = document.createElement('canvas'); day.width = W; day.height = H; const d = day.getContext('2d')!;
  const night = document.createElement('canvas'); night.width = W; night.height = H; const n = night.getContext('2d')!;
  n.fillStyle = '#0c1c2c'; n.fillRect(0, 0, W, H); // unlit glass still reads faintly blue against the night sky
  for (let row = 0; row < rows; row++) {
    const busy = r(); // how busy this floor is tonight
    for (let col = 0; col < cols; col++) {
      const x = col * pw, y = row * ph; const k = 0.9 + r() * 0.2; const sky = r() < 0.18;
      const g = d.createLinearGradient(0, y, 0, y + ph);
      g.addColorStop(0, sky ? C.light : shade('#7fb0cf', k)); g.addColorStop(0.55, shade(C.glass, k)); g.addColorStop(1, shade('#3f7397', k));
      d.fillStyle = g; d.fillRect(x, y, pw, ph);
      if ((busy > 0.72 && r() < 0.75) || r() < busy * 0.28) {
        n.fillStyle = r() < 0.7 ? '#ffd9a0' : '#e8f0ff'; n.globalAlpha = 0.45 + r() * 0.4; n.fillRect(x + 1, y + ph * 0.14, pw - 2, ph * 0.86 - 2); n.globalAlpha = 1;
      }
    }
    d.fillStyle = '#6f8ea3'; d.fillRect(0, row * ph, W, ph * 0.13); // frit spandrel at the slab
    d.fillStyle = C.alu; d.fillRect(0, row * ph, W, 2);
  }
  d.fillStyle = C.alu; for (let col = 0; col < cols; col++) d.fillRect(col * pw, 0, 2, H);
  const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  return { day: tex(day), night: tex(night) };
}
/** A text sign: letters in `fg` on `bg` (transparent background when null), shrunk to fit the width. */
function textSign(text: string, fg: string, bg: string | null, w = 1024, h = 192, px = 132) {
  return canvasTex(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    let size = px; c.font = `bold ${size}px Arial, sans-serif`;
    while (c.measureText(text).width > w * 0.92 && size > 10) { size -= 4; c.font = `bold ${size}px Arial, sans-serif`; }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 4);
  });
}
function makeMats() {
  const facade = facadeMaps();
  // podium: blue glass behind a geometric (diamond) aluminium frame; one floor and 6 m per repeat
  const podium = canvasTex(256, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#78a9c8'); g.addColorStop(1, '#3e7398');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = C.alu; c.lineWidth = 5;
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * 128, 256); c.lineTo(k * 128 + 256, 0); c.stroke(); c.beginPath(); c.moveTo(k * 128, 0); c.lineTo(k * 128 + 256, 256); c.stroke(); }
    c.fillStyle = '#d4dbe0'; c.fillRect(0, 0, 256, 14); c.fillStyle = C.alu; c.fillRect(0, 252, 256, 4);
  }, true);
  const podiumNight = canvasTex(256, 256, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256);
    const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,230,190,.25)'); g.addColorStop(1, 'rgba(255,236,200,.75)');
    c.fillStyle = g; c.fillRect(0, 14, 256, 238);
  }, true);
  const signMat = (t: THREE.Texture, transparent = false) => new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.6, transparent, alphaTest: transparent ? 0.4 : 0 });
  // billboard on the podium: a made-up sale poster (no real brand artwork)
  const billboard = canvasTex(1024, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 1024, 512); g.addColorStop(0, '#f7c948'); g.addColorStop(1, '#e8553f');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(80 + i * 120, 420 - (i % 3) * 60, 40 + (i % 4) * 18, 0, Math.PI * 2); c.fill(); }
    c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = 'bold 92px Arial, sans-serif'; c.fillText('ĐẠI TIỆC MUA SẮM', 512, 190);
    c.font = 'bold 150px Arial, sans-serif'; c.fillStyle = '#7a0f1c'; c.fillText('GIẢM 50%', 512, 350);
    c.font = '44px Arial, sans-serif'; c.fillStyle = '#fff'; c.fillText('Tầng 1–6 · Trung tâm thương mại', 512, 450);
  });
  const sign = textSign('LOTTE CENTER', '#fff', C.red, 512, 96, 54);
  return {
    glass: new THREE.MeshStandardMaterial({ map: facade.day, emissive: '#ffffff', emissiveMap: facade.night, emissiveIntensity: 0, roughness: 0.22, metalness: 0.12 }),
    crown: new THREE.MeshStandardMaterial({ map: facade.day, emissive: '#ffffff', emissiveMap: facade.night, emissiveIntensity: 0, roughness: 0.22, metalness: 0.12, side: THREE.DoubleSide }),
    podium: new THREE.MeshStandardMaterial({ map: podium, emissive: '#ffffff', emissiveMap: podiumNight, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 }),
    fin: new THREE.MeshStandardMaterial({ color: C.alu, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }),
    brand: signMat(textSign('LOTTE', C.red, null, 1024, 256, 210), true),
    signCenter: signMat(textSign('LOTTE CENTER Hanoi', C.red, '#ffffff')),
    signHotel: signMat(textSign('LOTTE HOTEL', '#ffffff', C.red)),
    signStore: signMat(textSign('DEPARTMENT STORE', C.red, '#ffffff')),
    signMart: signMat(textSign('LOTTE Mart', '#ffffff', C.red)),
    billboard: signMat(billboard),
    stone: new THREE.MeshStandardMaterial({ color: '#8d9194', roughness: 0.8 }),
    planter: new THREE.MeshStandardMaterial({ color: '#b9b3a8', roughness: 0.85 }),
    shrub: new THREE.MeshStandardMaterial({ color: '#4f7f3a', roughness: 0.9 }),
    canopyGlass: new THREE.MeshStandardMaterial({ color: '#cfe2ea', roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
    roof: new THREE.MeshStandardMaterial({ color: '#8f989d', roughness: 0.7 }),
    frame: new THREE.MeshStandardMaterial({ color: '#c9cfd3', roughness: 0.3, metalness: 0.8 }),
    sign: signMat(sign),
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
    const plate = towerRing(floorY(f), 1.6);
    return boxes.filter((b) => insidePolygon([b.p[0], b.p[2]], plate));
  }, [kind, hu, hv, H, f]);
  const ring = useMemo(() => towerRing(floorY(f), 0.1), [f]);
  const windowGeo = useMemo(() => {
    // floor-to-ceiling glass (on floor 1 with the door gap on the east face)
    const pos: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (f === 1 && a[0] > hu && b[0] > hu && Math.abs((a[1] + b[1]) / 2) < DOOR_HALF) continue;
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
    {Array.from({ length: Math.floor(hu / 4) }, (_, i) => -hu + 4 + i * 8).flatMap((u) => [-hv + 4, hv - 4].filter((v) => insidePolygon([u, v], ring)).map((v) => <mesh key={`${u}${v}`} material={m.light} position={[u, H - 0.02, v]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[2.4, 0.5]} /></mesh>))}
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
    // a podium wall that is shared with the tower (its south side) gets no sign
    const tb = towerRing(0, -1.5);
    const insideTowerish = (a: [number, number], b: [number, number]) => insidePolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tb);
    const pd = LOTTE.podium;
    // podium: the OSM footprint west of the tower, extruded to six storeys, standing on the ground;
    // ExtrudeGeometry's groups are [caps, walls]: a plain roof on top, patterned glass round the sides
    const shape = new THREE.Shape(LOTTE.podiumRing.map(([u, v]) => new THREE.Vector2(u, -v)));
    const podium = new THREE.ExtrudeGeometry(shape, { depth: pd.h, bevelEnabled: false });
    podium.rotateX(-Math.PI / 2); podium.translate(0, GROUND_HEIGHT, 0);
    podium.computeVertexNormals();
    const uv = podium.getAttribute('uv'); const pos = podium.getAttribute('position'); const nor = podium.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) { const along = Math.abs(nor.getX(i)) > 0.5 ? pos.getZ(i) : pos.getX(i) + pos.getZ(i); uv.setXY(i, along / 6, (pos.getY(i) - GROUND_HEIGHT) / (pd.h / 6)); }
    // podium signs: on its four longest outside walls (not the one against the tower), facing out
    const ring = LOTTE.podiumRing;
    const walls = ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, b, len }; })
      .filter((w) => w.len > 12 && !insideTowerish(w.a, w.b))
      .sort((p, q) => q.len - p.len).slice(0, 4)
      .map(({ a, b, len }) => {
        const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; let n = [-d[1], d[0]];
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (insidePolygon([mid[0] + n[0], mid[1] + n[1]], ring)) n = [-n[0], -n[1]];
        return { mid, n, len, yaw: Math.atan2(n[0], n[1]) };
      });
    // vertical aluminium fins along both edges of the groove on each broad face, standing 0.7 m proud
    const finPos: number[] = [];
    const levels = 24;
    for (let k = 0; k < levels; k++) {
      const y0 = FLOOR_H + ((268 - FLOOR_H) * k) / levels, y1 = FLOOR_H + ((268 - FLOOR_H) * (k + 1)) / levels;
      const r0 = towerRing(y0), r1 = towerRing(y1);
      for (const i of GROOVE_LIPS) {
        const at = (r: [number, number][], y: number, out: number) => { const [u, v] = r[i]; return [u, GROUND_HEIGHT + y, v + Math.sign(v) * out]; };
        const p = [at(r0, y0, 0), at(r0, y0, 0.8), at(r1, y1, 0), at(r1, y1, 0.8)];
        finPos.push(...p[0], ...p[2], ...p[1], ...p[1], ...p[2], ...p[3]);
      }
    }
    const fins = new THREE.BufferGeometry(); fins.setAttribute('position', new THREE.Float32BufferAttribute(finPos, 3)); fins.computeVertexNormals();
    const yb = 255; const rb = towerRing(yb);
    /** The facade edge of ring rb nearest to local point (u, v): its middle, outward normal and yaw for a plane. */
    const faceAt = (u: number, v: number) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < rb.length; i++) { const a = rb[i], b = rb[(i + 1) % rb.length]; const d = Math.hypot((a[0] + b[0]) / 2 - u, (a[1] + b[1]) / 2 - v); if (d < bd) { bd = d; best = i; } }
      const a = rb[best], b = rb[(best + 1) % rb.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; // outward for a counter-clockwise ring
      const t = (u - a[0]) * (b[0] - a[0]) / (l * l) + (v - a[1]) * (b[1] - a[1]) / (l * l);
      const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return { p: [m[0] + n[0] * 0.25, GROUND_HEIGHT + yb, m[1] + n[1] * 0.25] as const, r: Math.atan2(n[0], n[1]) };
    };
    return {
      shaft: shaft(GROUND_HEIGHT + FLOOR_H, GROUND_HEIGHT + 268, 1, 24),
      band: lobbyBand(),
      // the facade runs on 4 m past the roof as an open screen round the rooftop terrace (seen from inside too)
      crown: shaft(GROUND_HEIGHT + 268, GROUND_HEIGHT + TOWER_TOP, 1, 1),
      roof: cap(GROUND_HEIGHT + 268, 1, 0.3),
      podium, walls, fins,
      // "LOTTE" high on the right-hand leaf of both broad faces and on the east end, like the photos
      brand: [{ ...faceAt(TOWER.halfU * 0.55, TOWER.halfV), w: 24 }, { ...faceAt(-TOWER.halfU * 0.55, -TOWER.halfV), w: 24 }, { ...faceAt(TOWER.halfU, 0), w: 20 }],
    };
  }, []);
  const cabin = useRef<THREE.Group>(null);
  const entry = useRef<THREE.Group>(null);
  const wasInCab = useRef(false);
  const cabinDoors = useRef<THREE.Group[]>([]);
  const landingDoors = useRef<THREE.Group[]>([]);
  const [floor, setFloor] = useState(1);
  const [near, setNear] = useState(false);
  const display = useMemo(() => canvasTex(128, 48, () => {}), []);
  const lastShown = useRef('');
  useEffect(() => { const a = registerBlocker(lotteBlocks); const b = registerHeight(lotteHeight); return () => { a(); b(); }; }, []);
  // arrival chime (two soft tones) when the cabin reaches the floor you are on or carries you
  useEffect(() => {
    let ctx: AudioContext | null = null;
    lift.onArrive = () => {
      if (!lift.inside) return;
      try {
        ctx ??= new AudioContext();
        [880, 660].forEach((hz, i) => { const o = ctx!.createOscillator(), g = ctx!.createGain(); o.frequency.value = hz; o.type = 'sine'; const t0 = ctx!.currentTime + i * 0.28; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.08, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6); o.connect(g).connect(ctx!.destination); o.start(t0); o.stop(t0 + 0.65); });
      } catch { /* audio not available */ }
    };
    return () => { lift.onArrive = null; };
  }, []);
  useParkingFlow();
  useFrame((_, delta) => {
    if (!LOTTE) return;
    const dt = Math.min(delta, 0.05);
    stepLift(dt);
    const lamp = worldMaterials().lampGlow.emissiveIntensity; const glow = lamp > 2 ? 1 : lamp > 0.5 ? 0.3 : 0;
    if (m.podium.emissiveIntensity !== glow) { m.glass.emissiveIntensity = m.crown.emissiveIntensity = glow * 0.75; m.podium.emissiveIntensity = glow * 0.55; }
    const p: [number, number] = [player.position.x, player.position.z];
    const [u, v] = toTower(p);
    const isNear = Math.abs(u) < 260 && Math.abs(v) < 260;
    if (isNear !== near) setNear(isNear);
    if (!isNear) return;
    stepLevel(p); // up or down a basement ramp
    const inside = insideTower(p);
    lift.inside = inside;
    if (!inside && lift.playerFloor !== 1 && !lift.riding) lift.playerFloor = 1;
    if (lift.playerFloor !== floor) setFloor(lift.playerFloor);
    // sliding entrance doors: open when someone is within 6 m of them
    if (entry.current) {
      const open = lift.playerFloor === 1 && Math.abs(u - TOWER.halfU) < 6 && Math.abs(v) < DOOR_HALF + 2 ? 1 : 0;
      entry.current.children.forEach((d, i) => { const s = i ? 1 : -1; const target = s * (DOOR_HALF / 2 + open * (DOOR_HALF - 0.4)); d.position.z = THREE.MathUtils.damp(d.position.z, target, 6, dt); });
    }
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
    if (inside) player.cameraMax = inCab ? 2.2 : lift.playerFloor < 0 ? 3.2 : 4; else if (player.cameraMax === 2.2 || player.cameraMax === 4 || player.cameraMax === 3.2) player.cameraMax = Infinity;
    if (lift.panel && !inCab) lift.panel = false;
    // prompts
    const s = game.get();
    if (s.ride || player.seat) return;
    // walking into the cabin opens the floor panel by itself (once per entry)
    if (inCab && !lift.riding && !wasInCab.current && !lift.panel) { lift.panel = true; lift.doorWant = 1; lift.doorTimer = 999; if (document.pointerLockElement) document.exitPointerLock(); game.set({}); }
    wasInCab.current = inCab && !lift.riding;
    // standing in front of the lift with the cabin here: the doors open for you, like a real lift button
    const atLanding = inside && Math.abs(u) < 6 && v > CABIN.v1 - 0.2 && v < CORE.halfV + 6;
    if (atLanding && cabinAt(lift.playerFloor) && !lift.panel) { lift.doorWant = 1; lift.doorTimer = Math.max(lift.doorTimer, 2); }
    if (inCab && !lift.riding) {
      game.offer({ id: 'lift-panel', text: `Thang máy Lotte · tầng ${floorLabel(lift.cabinFloor)}: chọn tầng (B5–65)`, key: 'E', priority: 9, run: () => { lift.panel = true; lift.doorWant = 1; lift.doorTimer = 999; if (document.pointerLockElement) document.exitPointerLock(); game.set({}); } });
    } else if (lift.riding) {
      game.offer({ id: 'lift-ride', text: `Đang lên/xuống… tầng ${cabinFloorShown()} → ${floorLabel(lift.target)}`, key: null, priority: 9 });
    } else if (atLanding) {
      game.offer(cabinAt(lift.playerFloor) && lift.doors > 0.5
        ? { id: 'lift-in', text: 'Cửa thang đã mở · bước vào thang máy', key: null, priority: 8 }
        : { id: 'lift-call', text: lift.moving ? `Thang đang tới · tầng ${cabinFloorShown()}` : 'Gọi thang máy', key: lift.moving ? null : 'E', priority: 8, run: () => sendLift(lift.playerFloor, false) });
    } else if (inside) {
      game.offer({ id: 'lotte-floor', text: `Lotte Center · ${floorInfo(lift.playerFloor).displayName} · thang máy ở giữa${lift.playerFloor < 0 ? ' hầm' : ' sảnh'}`, key: null, priority: 1 });
    }
  });
  if (!LOTTE || !geo) return null;
  return <group position={[LOTTE.center[0], 0, LOTTE.center[1]]} rotation={[0, LOTTE.rotY, 0]}>
    <mesh geometry={geo.podium} material={[m.roof, m.podium]} castShadow receiveShadow />
    {geo.walls.map((w, i) => {
      const sign = [m.signCenter, m.signStore, m.signMart, m.signHotel][i]; const wide = Math.min(w.len * 0.55, 26);
      return <group key={i} position={[w.mid[0] + w.n[0] * 0.12, 0, w.mid[1] + w.n[1] * 0.12]} rotation={[0, w.yaw, 0]}>
        <mesh material={sign} position={[0, GROUND_HEIGHT + 30, 0]}><planeGeometry args={[wide, wide * 0.1875]} /></mesh>
        {i === 0 && <mesh material={m.billboard} position={[0, GROUND_HEIGHT + 17, 0]}><planeGeometry args={[Math.min(w.len * 0.45, 18), Math.min(w.len * 0.45, 18) / 2]} /></mesh>}
      </group>;
    })}
    <mesh geometry={geo.shaft} material={m.glass} castShadow />
    <mesh geometry={geo.crown} material={m.crown} />
    <mesh geometry={geo.roof} material={m.roof} />
    <mesh geometry={geo.fins} material={m.fin} />
    {geo.brand.map((b, i) => <mesh key={i} material={m.brand} position={b.p as unknown as [number, number, number]} rotation={[0, b.r, 0]}><planeGeometry args={[b.w, b.w / 4]} /></mesh>)}
    {/* entrance: a glass canopy in a slim steel frame on two posts over the lobby door, the name above it */}
    <mesh material={m.frame} position={[TOWER.halfU + 3, GROUND_HEIGHT + 3.75, 0]}><boxGeometry args={[6, 0.18, DOOR_HALF * 2 + 3]} /></mesh>
    <mesh material={m.canopyGlass} position={[TOWER.halfU + 3, GROUND_HEIGHT + 3.86, 0]}><boxGeometry args={[5.7, 0.04, DOOR_HALF * 2 + 2.7]} /></mesh>
    {[-DOOR_HALF - 1.2, DOOR_HALF + 1.2].map((v) => <mesh key={v} material={m.frame} position={[TOWER.halfU + 5.6, GROUND_HEIGHT + 1.85, v]}><cylinderGeometry args={[0.13, 0.13, 3.7, 10]} /></mesh>)}
    <mesh material={m.sign} position={[TOWER.halfU + 0.12, GROUND_HEIGHT + 4.6, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[7, 1.25]} /></mesh>
    {/* two low grey stone steps up to the door, and planters with clipped shrubs either side */}
    {[0, 1].map((k) => <mesh key={`st${k}`} material={m.stone} position={[TOWER.halfU + 1.2 + (1 - k) * 0.8, GROUND_HEIGHT + 0.04 + k * 0.04, 0]} receiveShadow><boxGeometry args={[2.4 - k * 0.8, 0.08, DOOR_HALF * 2 + 1.6 - k * 0.6]} /></mesh>)}
    {[-1, 1].flatMap((sd) => [0, 1].map((k) => <group key={`pl${sd}${k}`} position={[TOWER.halfU + 2.2 + k * 4, GROUND_HEIGHT, sd * (DOOR_HALF + 3.6)]}>
      <mesh material={m.planter} position={[0, 0.3, 0]} castShadow><boxGeometry args={[2.6, 0.6, 1.4]} /></mesh>
      <mesh material={m.shrub} position={[0, 0.85, 0]} scale={[1.2, 0.55, 0.6]}><sphereGeometry args={[1, 10, 6]} /></mesh>
    </group>))}
    {/* door frame and the sliding glass doors (they part as you walk up) */}
    {[-DOOR_HALF, DOOR_HALF].map((v) => <mesh key={`jamb${v}`} material={m.frame} position={[TOWER.halfU, GROUND_HEIGHT + 1.5, v]}><boxGeometry args={[0.5, 3, 0.25]} /></mesh>)}
    <mesh material={m.frame} position={[TOWER.halfU, GROUND_HEIGHT + 3.05, 0]}><boxGeometry args={[0.5, 0.2, DOOR_HALF * 2]} /></mesh>
    <group ref={entry}>{[-1, 1].map((s) => <mesh key={`sd${s}`} material={m.window} position={[TOWER.halfU, GROUND_HEIGHT + 1.45, s * DOOR_HALF / 2]}><boxGeometry args={[0.06, 2.9, DOOR_HALF - 0.1]} /></mesh>)}</group>
    <mesh position={[TOWER.halfU + 2.2, GROUND_HEIGHT + 0.09, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}><planeGeometry args={[DOOR_HALF * 2 - 1, 3.5]} /><meshStandardMaterial color="#7a1f2a" roughness={0.9} /></mesh>
    <LottePortal />
    {near && <>
      {floor >= 1 ? <Interior key={floor} f={floor} doorsRef={landingDoors} display={display} /> : <LotteBasement key={floor} f={floor} />}
      <group position={[0, 0, 0]}><Cabin cabin={cabin} doors={cabinDoors} /></group>
    </>}
    {/* the ground-floor glass is part of Interior; seen from outside when far, a plain glass band */}
    <mesh geometry={geo.band} material={m.glass} />
  </group>;
}

const LIFT_STATE_VI = { IDLE: 'chờ', OPENING: 'đang mở cửa', OPEN: 'cửa mở', CLOSING: 'đang đóng cửa', MOVING: 'đang chạy', ARRIVED: 'đã tới' } as const;
/** The lift's floor panel (B5–B1, 1–65; floors without a scene are greyed out), opened from inside the cabin; also hosts the parking payment panel. */
export function LiftPanel() {
  useGame((s) => s.prompt?.id);
  const [, force] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 200); return () => clearInterval(id); }, []);
  if (!lift.panel) return <ParkingPanel />;
  return <div className="lift-panel" role="dialog" aria-label="Bảng chọn tầng">
    <div className="lift-head"><b>LOTTE CENTER</b><span>Thang máy · tầng {floorLabel(lift.cabinFloor)} · {LIFT_STATE_VI[liftState()]}</span></div>
    <div className="lift-grid">
      {[...FLOOR_IDS].reverse().map((f) => { const info = floorInfo(f); return <button key={f} title={info.displayName} disabled={!info.availableInGame} className={f === lift.cabinFloor ? 'here' : f === 65 ? 'deck' : f < 0 ? 'basement' : ''} onClick={() => { if (!sendLift(f, true)) setNote(info.availableInGame ? 'Thang đang bận, chờ một chút.' : `${info.displayName}: chưa mở trong game.`); force((n) => n + 1); }}>{floorLabel(f)}</button>; })}
    </div>
    {note && <p className="parking-msg">{note}</p>}
    <div className="lift-foot"><span>65 · Hanoi Sky · 33–64 Khách sạn/căn hộ · 8–31 Văn phòng · 7 Tiện ích · 1–6 TTTM · B1 LOTTE Mart (sắp mở) · B2–B5 Gửi xe</span><button onClick={() => { lift.panel = false; lift.doorTimer = 2; force((n) => n + 1); }}>Đóng</button></div>
  </div>;
}
