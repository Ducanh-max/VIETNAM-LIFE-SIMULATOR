import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CarControl } from './CarModel';
import { CAR_SPECS, type ModelId } from './carSpecs';
import { VEHICLES, modelAsset } from './vehicleRegistry';

/*
 * VehicleVisual for cars modelled in Blender (tools/blender/vehicles): loads the LOD0 / LOD1 / LOD2 GLBs (meshopt),
 * recolours the "Paint" material, tints the glass, draws the dashboard screen and the plate, and animates the standard
 * nodes: Door_*_Pivot (hinged or sliding), Trunk_Pivot, Wheel_*_Spin / Wheel_F*_Steer, SteeringWheel_Pivot,
 * SeatFold_R3, and the Light_* materials. Anchors (Anchor_CameraInterior, Anchor_RearSeats, …) are read for the viewer.
 */
let carEnv: THREE.Texture | null = null;
function ensureEnv(gl: THREE.WebGLRenderer) { if (!carEnv) { const pm = new THREE.PMREMGenerator(gl); carEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } return carEnv; }
const paintCache = new Map<string, THREE.Material>();
const paintMat = (hex: string, env: THREE.Texture) => { let m = paintCache.get(hex); if (!m) { m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 0.85 }); paintCache.set(hex, m); } return m; };
let glassMat: THREE.Material | null = null;
function plateTexture(text: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56; const x = c.getContext('2d')!;
  x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 256, 56); x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(3, 3, 250, 50);
  x.fillStyle = '#111'; x.font = 'bold 38px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
}
export function drawScreen(canvas: HTMLCanvasElement, tex: THREE.Texture, c: CarControl, name: string) {
  const x = canvas.getContext('2d')!; const W = canvas.width, H = canvas.height;
  x.fillStyle = '#0b1219'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#7fd4ff'; x.font = 'bold 52px Arial'; x.textAlign = 'center'; x.fillText(String(Math.round(Math.abs(c.speed) * 3.6)), W * 0.16, 70); x.font = '18px Arial'; x.fillText('km/h', W * 0.16, 96);
  x.fillStyle = '#ffd36b'; x.font = 'bold 40px Arial'; x.fillText(c.gear, W * 0.34, 74);
  x.fillStyle = '#2b3a46'; x.fillRect(W * 0.05, 108, W * 0.36, 10); x.fillStyle = c.fuel < 0.15 ? '#ff5a4a' : '#5be38a'; x.fillRect(W * 0.05, 108, W * 0.36 * c.fuel, 10);
  x.fillStyle = '#16232e'; x.fillRect(W * 0.52, 8, W * 0.46, H - 16); x.strokeStyle = '#3a5568'; x.lineWidth = 3;
  for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(W * 0.52, 20 + i * 24); x.lineTo(W * 0.98, 30 + i * 20); x.stroke(); }
  x.fillStyle = '#7fd4ff'; x.beginPath(); x.moveTo(W * 0.75, H / 2 - 12); x.lineTo(W * 0.75 + 9, H / 2 + 10); x.lineTo(W * 0.75 - 9, H / 2 + 10); x.fill();
  x.fillStyle = '#cfd8de'; x.font = '16px Arial'; x.textAlign = 'left'; x.fillText(`Sen Việt · ${name}`, W * 0.54, H - 16);
  tex.needsUpdate = true;
}

const CABIN_MATS = new Set(['Dash', 'Leather', 'LeatherDark', 'Carpet', 'Headliner', 'Wood', 'BuckleRed']);
type Rig = {
  doors: { node: THREE.Object3D; base: THREE.Vector3; side: 1 | -1; sliding: boolean; id: 'FL' | 'FR' | 'RL' | 'RR' }[];
  trunk: THREE.Object3D | null; spins: THREE.Object3D[]; steers: THREE.Object3D[]; steering: THREE.Object3D | null; folds: THREE.Object3D[];
};
/** Viewer eye points (car frame) read from the model's anchors. */
export const anchorsOf = new Map<ModelId, { driver: THREE.Vector3; rear: THREE.Vector3 }>();

export function GltfCar({ model, paint, plate = '30A-000.00', control }: { model: ModelId; paint: string; plate?: string; control: React.RefObject<CarControl> }) {
  const a = modelAsset(model)!; const v = VEHICLES[model]; const spec = CAR_SPECS[model]; const { gl } = useThree();
  const g0 = useGLTF(a.lod0, false, true), g1 = useGLTF(a.lod1, false, true), g2 = useGLTF(a.lod2, false, true);
  const built = useMemo(() => {
    const env = ensureEnv(gl);
    glassMat ??= new THREE.MeshPhysicalMaterial({ color: '#1d2a33', roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, envMap: env, envMapIntensity: 0.6, side: THREE.DoubleSide });
    const lights = new Map<string, THREE.MeshStandardMaterial>(); // per car: light state is per car
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const screenTex = new THREE.CanvasTexture(canvas); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.flipY = false;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, side: THREE.DoubleSide }); const plateMat = new THREE.MeshBasicMaterial({ map: plateTexture(plate) });
    const rigs: Rig[] = [];
    const levels = [g0, g1, g2].map((g) => {
      const root = g.scene.clone(true);
      root.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = false; m.receiveShadow = false;
        const mat = m.material as THREE.MeshStandardMaterial; const n = mat.name;
        if (n === 'Paint') { m.material = paintMat(paint, env); m.castShadow = true; } // only the painted shell casts shadows (cheap)
        else if (n === 'Glass' || n === 'GlassDark') { m.material = glassMat!; m.castShadow = false; }
        else if (n === 'Screen') m.material = screenMat;
        else if (n === 'Plate') m.material = plateMat;
        else if (n.startsWith('Light_')) { let lm = lights.get(n); if (!lm) { lm = mat.clone(); lights.set(n, lm); } m.material = lm; m.castShadow = false; }
        else if (n === 'CollisionProxy_Body' || m.name.startsWith('CollisionProxy')) m.visible = false;
        else if (mat.metalness > 0.5) { mat.envMap = env; mat.envMapIntensity = 0.9; }
        else if (CABIN_MATS.has(n) && !mat.userData.lit) { mat.emissive = mat.color.clone().multiplyScalar(0.55); mat.userData.lit = true; } // soft cabin light so the interior reads in the dark
        if (m.name.startsWith('CollisionProxy')) m.visible = false;
      });
      const rig: Rig = { doors: [], trunk: root.getObjectByName('Trunk_Pivot') ?? null, spins: [], steers: [], steering: root.getObjectByName('SteeringWheel_Pivot') ?? null, folds: [] };
      for (const id of ['FL', 'FR', 'RL', 'RR'] as const) { const n = root.getObjectByName(`Door_${id}_Pivot`); if (n) rig.doors.push({ node: n, base: n.position.clone(), side: id.endsWith('L') ? 1 : -1, sliding: id.startsWith('R') && v.doorType === 'slidingRear', id }); }
      for (const id of ['FL', 'FR', 'RL', 'RR']) { const n = root.getObjectByName(`Wheel_${id}_Spin`); if (n) rig.spins.push(n); }
      for (const id of ['FL', 'FR']) { const n = root.getObjectByName(`Wheel_${id}_Steer`); if (n) rig.steers.push(n); }
      root.traverse((o) => { if (o.name.startsWith('SeatFold_')) rig.folds.push(o); });
      rigs.push(rig);
      return root;
    });
    const lod = new THREE.LOD(); lod.name = 'VehicleRoot';
    levels.forEach((l, i) => lod.addLevel(l, v.lodDistances[i], 0.1));
    // anchors -> viewer eye points
    levels[0].updateMatrixWorld(true);
    const pos = (n: string) => { const o = levels[0].getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
    const driver = pos('Anchor_CameraInterior') ?? new THREE.Vector3(0.4, 1.3, 0.3); const rs = pos('Anchor_RearSeats');
    return { lod, rigs, lights, screen: { canvas, tex: screenTex }, eyes: { driver, rear: rs ? rs.clone().add(new THREE.Vector3(-0.3, 0.64, -0.1)) : driver.clone() } };
  }, [g0, g1, g2, paint, plate, gl, v]);
  useEffect(() => { anchorsOf.set(model, built.eyes); }, [model, built]);
  const st = useRef({ door: {} as Record<string, number>, fold: 0, spin: 0, screen: 0, blink: 0 });
  const r = v.wheelRadius;
  useFrame((s, delta) => {
    const c = control.current; if (!c) return; const dt = Math.min(delta, 0.05); const t = st.current;
    const moving = Math.abs(c.speed) > 0.3;
    for (const id of ['FL', 'FR', 'RL', 'RR', 'TG'] as const) {
      const want = c.doors[id] && !moving ? 1 : 0; const cur = t.door[id] ?? 0;
      t.door[id] = THREE.MathUtils.clamp(cur + (want ? 1 : -1) * dt / (id === 'TG' ? 1.6 : 0.9), 0, 1);
    }
    const ease = (k: number) => k * k * (3 - 2 * k);
    t.fold = THREE.MathUtils.damp(t.fold, c.seatsFolded ? 1 : 0, 5, dt); t.spin += (c.speed * dt) / r;
    for (const rig of built.rigs) {
      for (const d of rig.doors) {
        const e = ease(t.door[d.id] ?? 0);
        if (d.sliding) d.node.position.set(d.base.x + d.side * Math.min(1, e * 4) * 0.12, d.base.y, d.base.z - Math.max(0, (e - 0.25) / 0.75) * 0.85);
        else d.node.rotation.y = -d.side * e * 1.05;
      }
      if (rig.trunk) rig.trunk.rotation.x = -ease(t.door.TG ?? 0) * 1.2;
      for (const f of rig.folds) f.rotation.x = t.fold * 1.35;
      for (const w of rig.spins) w.rotation.x = t.spin;
      for (const w of rig.steers) w.rotation.y = c.steer * 0.55;
      if (rig.steering) rig.steering.rotation.z = c.steer * 2.4;
    }
    t.blink += dt; const on = Math.floor(t.blink / 0.4) % 2 === 0; const L = built.lights;
    const set = (n: string, k: number) => { const m = L.get(n); if (m) m.emissiveIntensity = k; };
    set('Light_Head', c.lights.low ? 3 : 0.3); set('Light_DRL', 2.2); set('Light_Tail', c.lights.low ? 1.6 : 0.9);
    set('Light_Brake', c.lights.brake ? 3 : 0.25); set('Light_Reverse', c.lights.reverse ? 2.5 : 0.05); set('Light_Indicator', c.lights.turn !== 'none' && on ? 3 : 0.05);
    if (s.clock.elapsedTime - t.screen > 0.16) { t.screen = s.clock.elapsedTime; drawScreen(built.screen.canvas, built.screen.tex, c, spec.name); }
  });
  return <primitive object={built.lod} />;
}


/**
 * Private test build only: the full-detail test car (not in the repository, uploaded only to the private deployment).
 * It was rigged in Blender with the standard pivots (Door_*_Pivot, Trunk_Pivot, Wheel_*_Spin / _Steer,
 * SteeringWheel_Pivot) and anchors (Anchor_*, Lock_*), so doors slide / swing, the boot lifts, wheels turn and the
 * steering wheel follows; the body paint is recoloured. Lock icons sit on Lock_* anchors (see DoorLocks).
 */
export const PRIVATE_STEER_AXIS = new THREE.Vector3(0.0094, 0.8738, 0.4862).normalize();
export const rigAnchors = new Map<string, Record<string, THREE.Vector3>>();
export function PrivateRigCar({ url, model, paint, control, rigKey }: { url: string; model: ModelId; paint: string; control: React.RefObject<CarControl>; rigKey: string }) {
  const { gl } = useThree(); const g = useGLTF(url, false, true);
  const built = useMemo(() => {
    const env = ensureEnv(gl); const r = g.scene.clone(true);
    const lights: THREE.MeshStandardMaterial[] = []; const brakes: THREE.MeshStandardMaterial[] = [];
    r.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = false; m.receiveShadow = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name === 'mat_199247467' || mat.name === 'mat_199247467_uvless') { const c = mat.clone(); c.color.set(paint); c.envMap = env; c.envMapIntensity = 0.8; m.material = c; m.castShadow = true; }
      else if (mat.name.startsWith('light_head') || mat.name.startsWith('light_drl')) { const c = mat.clone(); m.material = c; lights.push(c); }
      else if (mat.name.startsWith('light_rear')) { const c = mat.clone(); m.material = c; brakes.push(c); }
      else if (mat.metalness > 0.5 && !mat.envMap) { mat.envMap = env; mat.envMapIntensity = 0.8; }
    });
    const node = (n: string) => r.getObjectByName(n) ?? null;
    const doors = (['FL', 'FR', 'RL', 'RR'] as const).map((id) => { const n = node(`Door_${id}_Pivot`); return n ? { id, n, base: n.position.clone(), side: id.endsWith('L') ? 1 : -1, slide: id.startsWith('R') } : null; }).filter(Boolean) as { id: 'FL' | 'FR' | 'RL' | 'RR'; n: THREE.Object3D; base: THREE.Vector3; side: number; slide: boolean }[];
    const steer = (['FL', 'FR'] as const).map((id) => node(`Wheel_${id}_Steer`)).filter(Boolean) as THREE.Object3D[];
    const spin = (['FL', 'FR', 'RL', 'RR'] as const).map((id) => node(`Wheel_${id}_Spin`)).filter(Boolean) as THREE.Object3D[];
    const sw = node('SteeringWheel_Pivot'); const tg = node('Trunk_Pivot');
    r.updateMatrixWorld(true);
    const anchors: Record<string, THREE.Vector3> = {};
    r.traverse((o) => { if (o.name.startsWith('Anchor_') || o.name.startsWith('Lock_')) anchors[o.name] = o.getWorldPosition(new THREE.Vector3()); });
    const ua = sw?.userData?.axis as number[] | undefined; const swAxis = ua ? new THREE.Vector3(ua[0], ua[1], ua[2]).normalize() : PRIVATE_STEER_AXIS;
    const swBase = sw ? sw.quaternion.clone() : null;
    return { r, lights, brakes, doors, steer, spin, sw, swAxis, swBase, tg, anchors };
  }, [g, paint, gl]);
  useEffect(() => {
    rigAnchors.set(rigKey, built.anchors);
    const a = built.anchors; if (a.Anchor_CameraInterior) anchorsOf.set(model, { driver: a.Anchor_CameraInterior, rear: a.Anchor_RearSeats ?? a.Anchor_CameraInterior });
  }, [built, model, rigKey]);
  const t = useRef({ door: {} as Record<string, number>, spin: 0 });
  useFrame((_, delta) => {
    const c = control.current; if (!c) return; const dt = Math.min(delta, 0.05); const s = t.current;
    const ease = (k: number) => k * k * (3 - 2 * k);
    for (const id of ['FL', 'FR', 'RL', 'RR', 'TG'] as const) { const want = c.doors[id] && Math.abs(c.speed) < 0.3 ? 1 : 0; s.door[id] = THREE.MathUtils.clamp((s.door[id] ?? 0) + (want ? 1 : -1) * dt / (id === 'TG' ? 1.4 : id.startsWith('R') ? 1.2 : 0.8), 0, 1); }
    for (const d of built.doors) {
      const e = ease(s.door[d.id] ?? 0);
      if (d.slide) d.n.position.set(d.base.x + d.side * Math.min(1, e * 4) * 0.13, d.base.y, d.base.z - Math.max(0, (e - 0.25) / 0.75) * 0.82);
      else d.n.rotation.y = -d.side * e * 1.1;
    }
    if (built.tg) built.tg.rotation.x = ease(s.door.TG ?? 0) * 1.25;
    s.spin += (c.speed * dt) / 0.37;
    for (const w of built.spin) w.rotation.x = s.spin;
    for (const w of built.steer) w.rotation.y = c.steer * 0.55;
    if (built.sw && built.swBase) { const ang = THREE.MathUtils.clamp(-c.steer * 2.6, -2.5, 2.5); built.sw.quaternion.copy(built.swBase).multiply(new THREE.Quaternion().setFromAxisAngle(built.swAxis, ang)); } // about the column's own axis, from the rest pose
    for (const m of built.lights) { m.emissiveIntensity = c.lights.low ? 3 : 1; }
    for (const m of built.brakes) { m.emissiveIntensity = c.lights.brake ? 3 : c.lights.low ? 1.2 : 0.6; }
  });
  return <primitive object={built.r} />;
}
if (import.meta.env.DEV) (window as unknown as { __rig?: unknown }).__rig = rigAnchors;
