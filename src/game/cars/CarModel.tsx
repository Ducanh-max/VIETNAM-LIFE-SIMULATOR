import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildCar, type CarParts, type DoorId, type MatKey } from './carGeometry';
import { CAR_SPECS, TRIM, tyreRadius, type ModelId } from './carSpecs';

/*
 * One car (vehicle bible section 08): VehicleRoot > THREE.LOD (LOD0 with doors, tailgate, interior; LOD1–3 simpler,
 * with hysteresis) and the animation state: doors CLOSED / OPENING / OPEN / CLOSING with easing on deltaTime (they
 * will not open while the car moves), the MPV's rear doors slide out and back along their rail, the tailgate lifts,
 * the last row folds, wheels spin from distance / radius and steer, the steering wheel follows, and the dashboard
 * screens redraw at ~6 Hz with the game's speed, fuel and gear.
 */
export type DoorState = 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING';
export type CarControl = {
  doors: Partial<Record<DoorId | 'TG', boolean>>; seatsFolded: boolean;
  speed: number; steer: number; lights: { low: boolean; brake: boolean; reverse: boolean; turn: 'none' | 'left' | 'right' | 'hazard' };
  fuel: number; gear: 'P' | 'R' | 'N' | 'D';
};
export const newControl = (): CarControl => ({ doors: {}, seatsFolded: false, speed: 0, steer: 0, lights: { low: false, brake: false, reverse: false, turn: 'none' }, fuel: 0.8, gear: 'P' });

// ---- shared materials (one set per paint / interior colour) ----
const matCache = new Map<string, THREE.Material>();
const std = (key: string, make: () => THREE.Material) => { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; };
function emblemTexture() {
  // an original emblem: a ring with a stylised lotus leaf, not any manufacturer's mark
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
  x.fillStyle = '#23262A'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#d9dfe3'; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#d9dfe3'; x.beginPath(); x.moveTo(64, 26); x.quadraticCurveTo(96, 64, 64, 100); x.quadraticCurveTo(32, 64, 64, 26); x.fill();
  x.fillStyle = '#23262A'; x.fillRect(62, 34, 4, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function plateTexture(text: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56; const x = c.getContext('2d')!;
  x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 256, 56); x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(3, 3, 250, 50);
  x.fillStyle = '#111'; x.font = 'bold 38px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function grilleTexture(model: ModelId) {
  // polygon mesh patterns per body (hexagonal blocks with silver accents for the MPV, a fine diamond for the others)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')!;
  x.fillStyle = '#16181b'; x.fillRect(0, 0, 256, 128);
  const step = model === 'luhanh' ? 22 : model === 'doixa' ? 16 : 12;
  for (let row = 0; row < 128 / step + 1; row++) for (let col = 0; col < 256 / step + 1; col++) {
    const cx = col * step + (row % 2 ? step / 2 : 0), cy = row * step * 0.86;
    x.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; const px = cx + Math.cos(a) * step * 0.42, py = cy + Math.sin(a) * step * 0.42; k ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.closePath(); x.fillStyle = model === 'luhanh' && (row + col) % 3 === 0 ? '#7f878c' : '#2c3035'; x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export type LightMats = { drl: THREE.MeshStandardMaterial; low: THREE.MeshStandardMaterial; brake: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial; turn: THREE.MeshStandardMaterial; reverse: THREE.MeshStandardMaterial };
function materialsFor(model: ModelId, paint: string, plate: string) {
  const spec = CAR_SPECS[model];
  const light = (color: string, on: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: on, roughness: 0.3 });
  // light materials are per car (their state is per car); the rest are shared
  const lights: LightMats = { drl: light(TRIM.ledWhite, 1.2), low: light('#cfdae2', 0.25), brake: light(TRIM.ledRed, 0.2), tail: light(TRIM.ledRed, 0.5), turn: light(TRIM.amber, 0.05), reverse: light('#f4f4f4', 0.05) };
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTexture(plate) });
  const get = (k: MatKey): THREE.Material => {
    switch (k) {
      case 'paint': return std(`paint${paint}`, () => new THREE.MeshStandardMaterial({ color: paint, roughness: 0.42, metalness: 0.25 }));
      case 'black': return std('black', () => new THREE.MeshStandardMaterial({ color: TRIM.black, roughness: 0.8 }));
      case 'silver': return std('silver', () => new THREE.MeshStandardMaterial({ color: TRIM.silver, roughness: 0.35, metalness: 0.6 }));
      case 'chrome': return std('chrome', () => new THREE.MeshStandardMaterial({ color: '#e4e8ea', roughness: 0.15, metalness: 0.9 }));
      case 'tyre': return std('tyre', () => new THREE.MeshStandardMaterial({ color: TRIM.tyre, roughness: 0.9 }));
      case 'glass': return std('glass', () => new THREE.MeshStandardMaterial({ color: TRIM.glass, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide }));
      case 'glassPrivacy': return std('glassPrivacy', () => new THREE.MeshStandardMaterial({ color: '#1a252d', roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }));
      case 'glassDark': return std('glassDark', () => new THREE.MeshStandardMaterial({ color: TRIM.glass, roughness: 0.25, metalness: 0.3 }));
      case 'liner': return std('liner', () => new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.95, side: THREE.DoubleSide }));
      case 'leather': return std(`leather${spec.interior}`, () => new THREE.MeshStandardMaterial({ color: spec.interior, roughness: 0.7 }));
      case 'dash': return std('dash', () => new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.75 }));
      case 'carpet': return std('carpet', () => new THREE.MeshStandardMaterial({ color: '#1e2023', roughness: 0.95 }));
      case 'headliner': return std('headliner', () => new THREE.MeshStandardMaterial({ color: '#cfc9bd', roughness: 0.9, side: THREE.DoubleSide }));
      case 'grille': return std(`grille${model}`, () => new THREE.MeshStandardMaterial({ map: grilleTexture(model), roughness: 0.6 }));
      case 'emblem': return std('emblem', () => new THREE.MeshStandardMaterial({ map: emblemTexture(), roughness: 0.4, metalness: 0.4 }));
      case 'plate': return plateMat;
      case 'red': return std('redbuckle', () => new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.5 }));
      case 'mirror': return std('mirrorglass', () => new THREE.MeshStandardMaterial({ color: '#7d93a0', roughness: 0.05, metalness: 0.9 }));
      case 'screen': return std('screen', () => new THREE.MeshBasicMaterial({ color: '#0d1620' }));
      case 'drl': return lights.drl; case 'lowBeam': return lights.low; case 'brake': return lights.brake; case 'tail': return lights.tail; case 'turn': return lights.turn; case 'reverse': return lights.reverse;
    }
  };
  return { get, lights };
}

/** The whole car, as a group in the car frame (+Z forward); place / rotate it from outside. */
export function CarModel({ model, paint, plate = '30A-000.00', control, lodOverride, onParts }: {
  model: ModelId; paint: string; plate?: string; control: React.RefObject<CarControl>; lodOverride?: 0 | 1 | 2 | 3; onParts?: (p: CarParts[], lod: THREE.LOD) => void;
}) {
  const spec = CAR_SPECS[model];
  const { lod, levels, lights } = useMemo(() => {
    const M = materialsFor(model, paint, plate);
    const levels = ([0, 1, 2, 3] as const).map((l) => buildCar(spec, l, M.get));
    const lod = new THREE.LOD(); lod.name = 'VehicleRoot';
    const dist = [0, 18, 45, 110];
    levels.forEach((p, i) => lod.addLevel(p.root, dist[i], 0.12)); // 12 % hysteresis between levels
    return { lod, levels, lights: M.lights };
  }, [model, paint, plate, spec]);
  useEffect(() => { onParts?.(levels, lod); }, [levels, lod, onParts]);
  useEffect(() => () => { lod.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }, [lod]);
  const anim = useRef({ door: {} as Record<string, number>, fold: 0, spin: 0, lastScreen: 0, blink: 0 });
  const r = tyreRadius(spec.tyre);
  useFrame((st, delta) => {
    const dt = Math.min(delta, 0.05); const c = control.current; if (!c) return;
    if (lodOverride !== undefined) { lod.autoUpdate = false; lod.levels.forEach((lv, i) => (lv.object.visible = i === lodOverride)); } else lod.autoUpdate = true;
    const moving = Math.abs(c.speed) > 0.3;
    const p0 = levels[0];
    // doors and tailgate: eased 0..1, never opening while moving
    for (const id of ['FL', 'FR', 'RL', 'RR', 'TG'] as const) {
      const want = c.doors[id] && !moving ? 1 : 0; const cur = anim.current.door[id] ?? 0;
      const next = THREE.MathUtils.clamp(cur + (want ? 1 : -1) * dt / (id === 'TG' ? 1.6 : 0.9), 0, 1); anim.current.door[id] = next;
      const e = next * next * (3 - 2 * next);
      if (id === 'TG') { if (p0.tailgate) p0.tailgate.rotation.x = e * 1.25; continue; }
      const d = p0.doors[id]; if (!d) continue;
      if (d.slide) { const out = Math.min(1, e * 4) * 0.12; const back = Math.max(0, (e - 0.25) / 0.75) * d.len * 0.92; const base = (d.group.userData.base ??= d.group.position.clone()) as THREE.Vector3; d.group.position.set(base.x + d.side * out, base.y, base.z - back); }
      else d.group.rotation.y = -d.side * e * 1.15;
    }
    // last row folds (only when nobody sits there: the caller decides)
    anim.current.fold = THREE.MathUtils.damp(anim.current.fold, c.seatsFolded ? 1 : 0, 5, dt);
    for (const f of p0.seatFold) f.rotation.x = anim.current.fold * 1.35;
    // wheels and steering
    anim.current.spin += (c.speed * dt) / r;
    for (const lv of levels) for (const w of lv.wheels) { w.spin.rotation.x = anim.current.spin; if (w.front) w.steer.rotation.y = c.steer * 0.55; }
    if (p0.steeringWheel) p0.steeringWheel.rotation.z = -c.steer * 2.4;
    // lights
    anim.current.blink += dt; const on = Math.floor(anim.current.blink / 0.4) % 2 === 0;
    lights.low.emissiveIntensity = c.lights.low ? 2.2 : 0.25;
    lights.brake.emissiveIntensity = c.lights.brake ? 2.6 : 0.2;
    lights.reverse.emissiveIntensity = c.lights.reverse ? 2 : 0.05;
    lights.turn.emissiveIntensity = c.lights.turn !== 'none' && on ? 2.4 : 0.05;
    // dashboard screens at ~6 Hz
    const scr = p0.screen;
    if (scr && st.clock.elapsedTime - anim.current.lastScreen > 0.16) {
      anim.current.lastScreen = st.clock.elapsedTime;
      const x = scr.canvas.getContext('2d')!; const W = scr.canvas.width, H = scr.canvas.height;
      x.fillStyle = '#0b1219'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#7fd4ff'; x.font = 'bold 52px Arial'; x.textAlign = 'center'; x.fillText(String(Math.round(Math.abs(c.speed) * 3.6)), W * 0.16, 70); x.font = '18px Arial'; x.fillText('km/h', W * 0.16, 96);
      x.fillStyle = '#ffd36b'; x.font = 'bold 40px Arial'; x.fillText(c.gear, W * 0.34, 74);
      x.fillStyle = '#2b3a46'; x.fillRect(W * 0.05, 108, W * 0.36, 10); x.fillStyle = c.fuel < 0.15 ? '#ff5a4a' : '#5be38a'; x.fillRect(W * 0.05, 108, W * 0.36 * c.fuel, 10);
      // right half: a little map with the car arrow and the car's name
      x.fillStyle = '#16232e'; x.fillRect(W * 0.52, 8, W * 0.46, H - 16); x.strokeStyle = '#3a5568'; x.lineWidth = 3;
      for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(W * 0.52, 20 + i * 24); x.lineTo(W * 0.98, 30 + i * 20); x.stroke(); }
      x.fillStyle = '#7fd4ff'; x.beginPath(); x.moveTo(W * 0.75, H / 2 - 12); x.lineTo(W * 0.75 + 9, H / 2 + 10); x.lineTo(W * 0.75 - 9, H / 2 + 10); x.fill();
      x.fillStyle = '#cfd8de'; x.font = '16px Arial'; x.textAlign = 'left'; x.fillText(spec.name, W * 0.54, H - 16);
      scr.tex.needsUpdate = true;
    }
  });
  return <primitive object={lod} />;
}
