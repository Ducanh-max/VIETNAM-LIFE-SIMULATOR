import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { carActions, carLive, useCarLive, type DoorKey } from '../cars/carState';
import { cars, useCars } from '../cars/carRegistry';
import { rigAnchors } from '../cars/GltfCar';
import { CAR_SPECS } from '../cars/carSpecs';
import { jobActions } from '../job';
import { bike, game, player } from '../state';

/*
 * Owned cars you can drive (E to get in / out, C for the camera: chase, driver's seat, bonnet) and door lock icons on
 * each door and the boot. Driving reuses the game's own vehicle controller (the `bike` pose with car handling:
 * throttle, brake, reverse, steering, sliding along walls, staying on the ground); this file only swaps in our car,
 * seats the driver, adds the extra cameras and the HUD buttons.
 */
export type CamMode = 'chase' | 'driver' | 'hood';
export const drive = { cam: 'chase' as CamMode, subs: new Set<() => void>() };
const setCam = (m: CamMode) => { drive.cam = m; drive.subs.forEach((f) => f()); };
export const cycleCam = () => setCam(drive.cam === 'chase' ? 'driver' : drive.cam === 'driver' ? 'hood' : 'chase');
function useCam() { const [, f] = useState(0); useEffect(() => { const cb = () => f((n) => n + 1); drive.subs.add(cb); return () => { drive.subs.delete(cb); }; }, []); return drive.cam; }

/** Get into an owned car (from the parked spot). */
export function startDriving(id: string) {
  const c = cars.get().cars.find((x) => x.vehicleId === id); if (!c) return;
  if (game.get().rental) { game.toast('Bạn đang thuê xe. Trả xe thuê trước đã.'); return; }
  if (game.get().job || game.get().driver) { game.toast('Đang làm ca giao hàng / Đen SM. Nghỉ ca trước rồi mới lái xe riêng nhé.'); return; }
  if (carLive.get(id).locked) { game.toast('Xe đang khoá. Mở khoá trong app My Car trên điện thoại.'); return; }
  carActions.closeAll(id);
  bike.position.set(c.parked.x, player.position.y, c.parked.z); bike.heading = c.parked.heading; bike.speed = 0; bike.steer = 0; bike.lean = 0;
  bike.kind = 'rentcar'; bike.color = c.color;
  cars.set({ driving: id }); carActions.setEngine(id, true);
  jobActions.mount(); setCam('chase');
  game.toast(`Đã lên ${CAR_SPECS[c.modelId].name}. W/S ga, phanh, lùi · A/D lái · C đổi góc camera · E xuống xe.`);
}
/** Get out: the car stays where it stopped. */
export function stopDriving() {
  const id = cars.get().driving; if (!id) return;
  if (Math.abs(bike.speed) > 1.5) { game.toast('Dừng hẳn xe đã.'); return; }
  const parked = { x: bike.position.x, z: bike.position.z, heading: bike.heading };
  jobActions.dismount(); if (bike.riding) return; // no room to step out
  bike.kind = 'wave';
  cars.set({ driving: null, cars: cars.get().cars.map((c) => (c.vehicleId === id ? { ...c, parked } : c)) });
}

/** E prompts for owned cars (anywhere in the city). */
export function OwnedCarPrompts() {
  useFrame(() => {
    const st = cars.get();
    if (st.driving) {
      if (!bike.riding) { cars.set({ driving: null }); return; } // dismounted some other way
      if (Math.abs(bike.speed) < 1.5) game.offer({ id: 'owncar-out', text: 'Xuống xe', key: 'E', priority: 6, run: stopDriving });
      return;
    }
    if (bike.riding || player.seat || st.viewer) return;
    let best: string | null = null, bd = 3.8;
    for (const c of st.cars) { const d = Math.hypot(player.position.x - c.parked.x, player.position.z - c.parked.z); if (d < bd) { bd = d; best = c.vehicleId; } }
    if (best) { const c = st.cars.find((x) => x.vehicleId === best)!; game.offer({ id: 'owncar-in', text: `Lái ${CAR_SPECS[c.modelId].name} (${c.plate})${carLive.get(best).locked ? ' · đang khoá' : ''}`, key: 'E', priority: 8, run: () => startDriving(best!) }); }
  });
  return null;
}

/** While driving: seat the avatar in our car, add the driver's-seat and bonnet cameras (renders the frame itself). */
export function DriveCamera({ rigKey }: { rigKey: string }) {
  const mode = useCam(); const { camera } = useThree();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.code === 'KeyC' && !e.repeat && (e.target as HTMLElement)?.tagName !== 'INPUT') cycleCam(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => () => { const a = player.avatar as THREE.Object3D | null | undefined; if (a) a.visible = true; const cam = camera as THREE.PerspectiveCamera; cam.near = 0.3; cam.updateProjectionMatrix(); }, [camera]);
  // mouse-look in the driver's / bonnet camera: with the pointer locked, or by dragging while the cursor is free
  const lookRef = useRef({ yaw: 0, pitch: 0, last: 0, drag: false });
  useEffect(() => {
    const L = lookRef.current;
    const move = (e: MouseEvent) => {
      if (drive.cam === 'chase') return;
      if (!document.pointerLockElement && !L.drag) return;
      L.yaw = THREE.MathUtils.clamp(L.yaw - e.movementX * 0.0035, -2.1, 2.1); L.pitch = THREE.MathUtils.clamp(L.pitch - e.movementY * 0.0035, -1.05, 1.05); L.last = performance.now();
    };
    const down = (e: MouseEvent) => { if ((e.target as HTMLElement)?.tagName === 'CANVAS') L.drag = true; };
    const up = () => { L.drag = false; };
    window.addEventListener('mousemove', move); window.addEventListener('mousedown', down); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mousedown', down); window.removeEventListener('mouseup', up); };
  }, []);
  const m = new THREE.Matrix4(); const v = new THREE.Vector3(); const look = new THREE.Vector3();
  useFrame((st) => {
    const a = rigAnchors.get(rigKey); const av = player.avatar as THREE.Object3D | null | undefined;
    m.makeRotationY(bike.heading).setPosition(bike.position);
    if (av && a?.Anchor_DriverSeat) { av.position.copy(v.copy(a.Anchor_DriverSeat).applyMatrix4(m)); av.position.y -= 0.42; av.visible = mode === 'chase'; }
    const cam = st.camera as THREE.PerspectiveCamera;
    if (mode !== 'chase' && a) {
      const eye = mode === 'driver' ? a.Anchor_CameraInterior : (a.Anchor_CameraHood ?? a.Anchor_CameraInterior);
      if (eye) {
        cam.position.copy(v.copy(eye).applyMatrix4(m));
        const L = lookRef.current;
        if (Math.abs(bike.speed) > 2 && performance.now() - L.last > 1500) { L.yaw *= 0.95; L.pitch *= 0.95; } // drift back to straight ahead when driving off
        const pitch = L.pitch - (mode === 'driver' ? 0.02 : 0.03);
        look.set(eye.x + Math.sin(L.yaw) * Math.cos(pitch) * 6, eye.y + Math.sin(pitch) * 6, eye.z + Math.cos(L.yaw) * Math.cos(pitch) * 6).applyMatrix4(m); cam.lookAt(look);
        const near = 0.05; if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
      }
    } else if (cam.near !== 0.3) { cam.near = 0.3; cam.updateProjectionMatrix(); }
    st.gl.render(st.scene, st.camera);
  }, 1);
  return null;
}

/** On-screen buttons while driving (touch friendly): camera and get out. */
export function DriveHud() {
  const driving = useCars((s) => s.driving); const mode = useCam();
  if (!driving) return null;
  const b: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid #8d9399', background: 'rgba(20,22,24,.85)', color: '#eef1f3', fontWeight: 700, cursor: 'pointer' };
  return <div style={{ position: 'fixed', right: 18, bottom: 230, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 25 }}>
    <button style={b} onClick={cycleCam}>📷 C · {mode === 'chase' ? 'Sau xe' : mode === 'driver' ? 'Ghế lái' : 'Nắp capo'}</button>
    <button style={b} onClick={stopDriving}>🚪 E · Xuống xe</button>
  </div>;
}

/** Lock icons on every door and the boot: closed doors show a lock, a click opens / closes (unless the car is locked). */
export function DoorLocks({ rigKey, liveId, show }: { rigKey: string; liveId: string; show: boolean }) {
  const doors = useCarLive(liveId, (s) => s.doors); const locked = useCarLive(liveId, (s) => s.locked);
  const g = useRef<THREE.Group>(null); const [near, setNear] = useState(false); const [facing, setFacing] = useState('');
  const tmp = new THREE.Vector3(); const w = new THREE.Vector3();
  useFrame(({ camera }) => {
    if (!g.current) return; g.current.getWorldPosition(tmp);
    const n = show && Math.hypot(player.position.x - tmp.x, player.position.z - tmp.z) < 9 && !cars.get().driving; if (n !== near) setNear(n);
    // only the doors on the side facing the camera (the car body would hide the others)
    const a = rigAnchors.get(rigKey); if (!a || !n) return; let f = '';
    for (const d of ['FL', 'FR', 'RL', 'RR', 'TG']) { const p = a[`Lock_${d}`]; if (!p) continue; w.copy(p); w.y = 0; g.current.localToWorld(w.clone()); const pw = g.current.localToWorld(w.clone()); if ((pw.x - tmp.x) * (camera.position.x - tmp.x) + (pw.z - tmp.z) * (camera.position.z - tmp.z) > 0) f += d; }
    if (f !== facing) setFacing(f);
  });
  const a = rigAnchors.get(rigKey);
  return <group ref={g}>{near && a && (['FL', 'FR', 'RL', 'RR', 'TG'] as DoorKey[]).map((d) => {
    const p = a[`Lock_${d}`]; if (!p || !facing.includes(d)) return null; const open = doors[d];
    return <Html key={d} position={p.toArray()} center zIndexRange={[20, 0]}>
      <button title={open ? 'Đóng cửa' : locked ? 'Xe đang khoá' : 'Mở cửa'} onClick={(e) => { e.stopPropagation(); const msg = carActions.toggleDoor(liveId, d); if (msg) game.toast(msg); }}
        style={{ width: 30, height: 30, borderRadius: 15, border: `2px solid ${open ? '#7fd4ff' : locked ? '#ff6a6a' : '#ffd36b'}`, background: 'rgba(15,18,20,.8)', color: '#fff', fontSize: 15, cursor: 'pointer', padding: 0, lineHeight: '26px' }}>{open ? '✕' : locked ? '🔒' : '🔓'}</button>
    </Html>;
  })}</group>;
}
