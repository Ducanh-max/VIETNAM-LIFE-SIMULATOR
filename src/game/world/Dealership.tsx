import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerBlocker, type Point } from '../geo';
import { CarModel, newControl, type CarControl } from '../cars/CarModel';
import { GltfCar, PrivateFullCar, anchorsOf } from '../cars/GltfCar';
import { PRIVATE_CAR_URL } from '../privateBuild';
import { BRANDS, VEHICLES, modelAsset } from '../cars/vehicleRegistry';
import { cabinFloor, seatRows } from '../cars/carGeometry';
import { buyCar, carPrices, cars, useCars } from '../cars/carRegistry';
import { CAR_COLORS, CAR_SPECS, tyreRadius, type ModelId } from '../cars/carSpecs';
import { useAdmin } from '../admin';
import { formatVnd, game, player, useGame } from '../state';
import { useState } from 'react';

/*
 * "Ô tô Đời Việt" dealership on the open paved lot beside Phố Kim Mã (bible section 10): a glass pavilion facing the
 * street with the three cars on slow turntables. At a car, E opens the viewer: the camera orbits the car (or jumps to
 * the front / side / rear / top / three-quarter views, or the driver's seat), you choose the colour, open the doors
 * and tailgate, fold the last row, read the spec sheet and buy with game money. Bought cars wait on the forecourt.
 */
const SITE = { x: -3990, z: -195 }; // centre of the pavilion; the street is to the north (−z)
const PAV = { w: 26, d: 16, h: 6 };
const DISPLAY: { model: ModelId; dx: number }[] = [{ model: 'luhanh', dx: -8.5 }, { model: 'phonho', dx: 0 }, { model: 'doixa', dx: 8.5 }];
const FORECOURT = (i: number) => ({ x: SITE.x - 10 + (i % 6) * 4, z: SITE.z - PAV.d / 2 - 6, heading: Math.PI });
export const VIEWS = ['orbit', 'front', 'side', 'rear', 'top', 'front34', 'rear34', 'interior'] as const;
export type View = (typeof VIEWS)[number];
const viewState = { view: 'orbit' as View, t: 0, seat: 'driver' as 'driver' | 'rear' };
/** A car body: the downloaded model where we have one (the procedural car shows while it loads), else the procedural car. */
/** The Blender model loads only while the player is near the showroom (lazy loading); the procedural car stands in meanwhile. */
const showroomNear = { v: false, subs: new Set<() => void>() };
function useShowroomNear() { const [, f] = useState(0); useEffect(() => { const cb = () => f((n) => n + 1); showroomNear.subs.add(cb); return () => { showroomNear.subs.delete(cb); }; }, []); return showroomNear.v; }
function AnyCar({ model, paint, plate, control }: { model: ModelId; paint: string; plate: string; control: React.RefObject<CarControl> }) {
  const near = useShowroomNear();
  const proc = <CarModel model={model} paint={paint} control={control} plate={plate} />;
  if (PRIVATE_CAR_URL && model === 'luhanh' && near) return <Suspense fallback={proc}><PrivateFullCar url={PRIVATE_CAR_URL} model={model} paint={paint} /></Suspense>;
  if (!modelAsset(model) || !near) return proc;
  return <Suspense fallback={proc}><GltfCar model={model} paint={paint} plate={plate} control={control} /></Suspense>;
}

const disp = (i: number) => ({ x: SITE.x + DISPLAY[i].dx, z: SITE.z + 1 });
// pavilion walls (front open in the middle), turntables
registerBlocker(([x, z]) => {
  const lx = x - SITE.x, lz = z - SITE.z; const hw = PAV.w / 2, hd = PAV.d / 2;
  if (Math.abs(lx) < hw + 0.2 && Math.abs(lz) < hd + 0.2) {
    const nearWall = Math.abs(lx) > hw - 0.2 || lz > hd - 0.2 || (lz < -hd + 0.2 && Math.abs(lx) > 3);
    if (nearWall) return true;
    for (let i = 0; i < DISPLAY.length; i++) { const d = disp(i); if (Math.hypot(x - d.x, z - d.z) < 3.2) return true; }
  }
  return false;
});

function Pavilion() {
  const mats = useMemo(() => {
    const sign = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x = c.getContext('2d')!; x.fillStyle = '#23262A'; x.fillRect(0, 0, 1024, 128); x.fillStyle = '#f1f0eb'; x.font = 'bold 72px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Ô TÔ ĐỜI VIỆT · SHOWROOM', 512, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    return {
      floor: new THREE.MeshStandardMaterial({ color: '#d9dcde', roughness: 0.18, metalness: 0.1 }), roof: new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#bcd6e2', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
      frame: new THREE.MeshStandardMaterial({ color: '#23262A', roughness: 0.4, metalness: 0.4 }), wall: new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.8 }),
      table: new THREE.MeshStandardMaterial({ color: '#9aa0a5', roughness: 0.3, metalness: 0.5 }), sign: new THREE.MeshBasicMaterial({ map: sign }),
    };
  }, []);
  const { w, d, h } = PAV;
  return <group position={[SITE.x, GROUND_HEIGHT, SITE.z]}>
    <mesh material={mats.floor} position={[0, 0.03, 0]} receiveShadow><boxGeometry args={[w, 0.06, d]} /></mesh>
    <mesh material={mats.roof} position={[0, h, 0]} castShadow><boxGeometry args={[w + 1.2, 0.35, d + 1.2]} /></mesh>
    <mesh material={mats.wall} position={[0, h / 2, d / 2]}><boxGeometry args={[w, h, 0.3]} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} material={mats.glass} position={[s * w / 2, h / 2, 0]}><boxGeometry args={[0.04, h, d]} /></mesh>)}
    {[-1, 1].map((s) => <mesh key={`f${s}`} material={mats.glass} position={[s * (w / 4 + 1.5), h / 2, -d / 2]}><boxGeometry args={[w / 2 - 3, h, 0.04]} /></mesh>)}
    {[-w / 2, -3, 3, w / 2].flatMap((x) => [-d / 2, d / 2].map((z) => <mesh key={`${x}${z}`} material={mats.frame} position={[x, h / 2, z]}><boxGeometry args={[0.18, h, 0.18]} /></mesh>))}
    <mesh material={mats.frame} position={[0, h - 0.6, -d / 2]}><boxGeometry args={[6, 0.08, 0.1]} /></mesh>
    <mesh material={mats.sign} position={[0, h + 0.75, -d / 2 - 0.62]} rotation={[0, Math.PI, 0]}><planeGeometry args={[12, 1.5]} /></mesh>
    {DISPLAY.map((dd, i) => <mesh key={i} material={mats.table} position={[dd.dx, 0.08, 1]}><cylinderGeometry args={[3.1, 3.1, 0.1, 40]} /></mesh>)}
  </group>;
}

/** A display car on its turntable (slowly turning unless it is being viewed). */
function DisplayCar({ i }: { i: number }) {
  const viewer = useCars((s) => s.viewer);
  const model = DISPLAY[i].model; const active = viewer?.model === model;
  const ctl = useRef<CarControl>(newControl());
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const c = ctl.current; c.doors = active && viewer ? { FL: viewer.doors, FR: viewer.doors, RL: viewer.doors, RR: viewer.doors, TG: viewer.tailgate } : {}; c.seatsFolded = !!(active && viewer?.fold);
    if (g.current && !active) g.current.rotation.y += Math.min(dt, 0.05) * 0.12;
  });
  const d = disp(i);
  return <group ref={g} position={[d.x, GROUND_HEIGHT + 0.13, d.z]} rotation={[0, Math.PI * 0.85, 0]} name={`display-${model}`}>
    <AnyCar model={model} paint={active && viewer ? viewer.color : CAR_COLORS[(i * 2) % CAR_COLORS.length].hex} control={ctl} plate="SHOWROOM" />
  </group>;
}

/** Owned cars parked where they were left. */
function OwnedCars() {
  const list = useCars((s) => s.cars);
  return <>{list.map((c) => <group key={c.vehicleId} position={[c.parked.x, GROUND_HEIGHT, c.parked.z]} rotation={[0, c.parked.heading, 0]}><OwnedCarModel id={c.vehicleId} /></group>)}</>;
}
function OwnedCarModel({ id }: { id: string }) {
  const car = useCars((s) => s.cars.find((c) => c.vehicleId === id))!; const ctl = useRef<CarControl>({ ...newControl(), fuel: car.fuel / car.fuelCapacity });
  return <AnyCar model={car.modelId} paint={car.color} plate={car.plate} control={ctl} />;
}

/** The viewer camera: takes over the camera while the viewer is open (render priority 1 renders the frame itself). */
function ViewerCamera() {
  const viewer = useCars((s) => s.viewer)!; const { scene } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []); const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, dt) => {
    const car = scene.getObjectByName(`display-${viewer.model}`); if (!car) { st.gl.render(st.scene, st.camera); return; }
    viewState.t += Math.min(dt, 0.05);
    const spec = CAR_SPECS[viewer.model]; const L = spec.length, H = spec.height;
    const m = car.matrixWorld; const v = viewer.interior ? 'interior' : viewState.view;
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const R = Math.max(L, 4) * 1.25;
    if (v === 'orbit') { const a = viewState.t * 0.35; pos.copy(P(Math.sin(a) * R, H * 0.75, Math.cos(a) * R)); look.copy(P(0, H * 0.45, 0)); }
    else if (v === 'front') { pos.copy(P(0, H * 0.6, L / 2 + 4.2)); look.copy(P(0, H * 0.5, 0)); }
    else if (v === 'rear') { pos.copy(P(0, H * 0.6, -L / 2 - 4.2)); look.copy(P(0, H * 0.5, 0)); }
    else if (v === 'side') { pos.copy(P(R * 1.15, H * 0.55, 0)); look.copy(P(0, H * 0.5, 0)); }
    else if (v === 'top') { pos.copy(P(0.01, Math.min(L * 1.45, PAV.h - 0.5 - 0.13), 0)); look.copy(P(0, 0, 0)); }
    else if (v === 'front34') { pos.copy(P(R * 0.8, H * 0.9, L / 2 + 2.6)); look.copy(P(0, H * 0.45, 0.4)); }
    else if (v === 'rear34') { pos.copy(P(-R * 0.8, H * 0.9, -L / 2 - 2.6)); look.copy(P(0, H * 0.45, -0.4)); }
    else if (anchorsOf.get(viewer.model)) { const cb = anchorsOf.get(viewer.model)!; const rear = viewState.seat === 'rear'; const e = rear ? cb.rear : cb.driver; pos.copy(P(e.x, e.y, e.z)); look.copy(rear ? P(e.x * 0.3, e.y - 0.3, L / 2) : P(e.x - 0.05, e.y - 0.25, L / 2)); }
    else { const z = seatRows(spec)[0]; const eye = Math.max(H * 0.72, cabinFloor(spec) + 0.45 + 0.52); pos.copy(P(0.4, eye, z - 0.3)); look.copy(P(0.3, eye - 0.18, L / 2)); }
    st.camera.position.copy(pos); st.camera.lookAt(look);
    const cam = st.camera as THREE.PerspectiveCamera; const near = v === 'interior' ? 0.05 : 0.3; const fov = v === 'top' ? 80 : 55; if (cam.near !== near || cam.fov !== fov) { cam.near = near; cam.fov = fov; cam.updateProjectionMatrix(); }
    st.gl.render(st.scene, st.camera);
  }, 1);
  const { camera } = useThree();
  useEffect(() => () => { const cam = camera as THREE.PerspectiveCamera; cam.fov = 55; cam.near = 0.3; cam.updateProjectionMatrix(); }, [camera]);
  return null;
}

/** Dealership prompts and the viewer. Mounted in the world. */
export function Dealership() {
  const viewer = useCars((s) => s.viewer);
  const { scene } = useThree(); sceneRef = scene;
  const near = useRef(false);
  useFrame(() => {
    const p: Point = [player.position.x, player.position.z];
    const dist = Math.hypot(p[0] - SITE.x, p[1] - SITE.z); const isNear = dist < 60; near.current = isNear;
    const load = showroomNear.v ? dist < 170 : dist < 140; if (load !== showroomNear.v) { showroomNear.v = load; showroomNear.subs.forEach((cb) => cb()); }
    if (!isNear || viewer) return;
    for (let i = 0; i < DISPLAY.length; i++) { const d = disp(i); if (Math.hypot(p[0] - d.x, p[1] - d.z) < 4.6) { const s = CAR_SPECS[DISPLAY[i].model]; game.offer({ id: `dealer-${s.id}`, text: `${s.name} · ${s.kind} · ${formatVnd(carPrices[s.id])}: xem xe`, key: 'E', priority: 8, run: () => { viewState.view = 'orbit'; viewState.t = 0; cars.set({ viewer: { model: s.id, color: CAR_COLORS[0].hex, doors: false, tailgate: false, interior: false, fold: false }, message: '' }); if (document.pointerLockElement) document.exitPointerLock(); } }); return; } }
    game.offer({ id: 'dealer', text: 'Ô tô Đời Việt · showroom phố Kim Mã', key: null, priority: 1 });
  });
  return <group>
    <Pavilion />
    {DISPLAY.map((_, i) => <DisplayCar key={i} i={i} />)}
    <OwnedCars />
    {viewer && <ViewerCamera />}
  </group>;
}

const specRows = (m: ModelId): [string, string][] => {
  const s = CAR_SPECS[m]; const r = tyreRadius(s.tyre);
  const engine = m === 'luhanh' ? '2.2 diesel · 199 hp · 440 Nm · 8AT · cầu trước' : m === 'phonho' ? '1.5 xăng · 113 hp · 144 Nm · CVT · cầu trước' : '2.5 xăng · 177 hp · 232 Nm · 6AT · cầu trước';
  return [['Kiểu', s.kind], ['Dài × rộng × cao', `${s.length} × ${s.width} × ${s.height} m`], ['Chiều dài cơ sở', `${s.wheelbase} m`], ['Khoảng sáng gầm', `${s.clearance} m`],
    ['Ghế', `${s.seats.reduce((a, b) => a + b, 0)} chỗ (${s.seats.join(' + ')})`], ['Động cơ', engine], ['Lốp', `${s.tyre[0]}/${s.tyre[1]} R${s.tyre[2]} (bán kính ${r.toFixed(3)} m)`],
    ['Màn hình', s.screens], ['Bình nhiên liệu', `${s.tankL} L`], ['Giá (tiền trong game)', formatVnd(carPrices[m])]];
};
/** Viewer panel (DOM): colours, views, doors, tailgate, seats, interior, buy. */
export function DealerPanel() {
  const viewer = useCars((s) => s.viewer); const msg = useCars((s) => s.message); const money = useGame((g) => g.money); const owned = useCars((s) => s.cars.length);
  const admin = useAdmin(); const [confirm, setConfirm] = useState(false);
  if (!viewer) return null;
  const asset = modelAsset(viewer.model); const veh = VEHICLES[viewer.model];
  const price = carPrices[viewer.model]; const enough = admin || money >= price; const colorName = CAR_COLORS.find((c) => c.hex === viewer.color)?.name ?? '';
  const s = CAR_SPECS[viewer.model]; const set = (p: Partial<NonNullable<typeof viewer>>) => cars.set({ viewer: { ...viewer, ...p } });
  const btn = { margin: 3, padding: '4px 9px', borderRadius: 6, border: '1px solid #777', background: '#f4f2ee', color: '#23262a', cursor: 'pointer' } as const;
  const buyBtn = { padding: '9px 14px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer' } as const;
  return <div className="lift-panel parking-panel" role="dialog" aria-label={s.name} style={{ maxWidth: 440, maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
    <div className="lift-head"><b>Ô TÔ ĐỜI VIỆT · {s.name.toUpperCase()}</b><span>{s.kind} · ví {admin ? 'admin (không trừ tiền)' : formatVnd(money)}</span></div>
    <div style={{ background: '#2a2d30', borderRadius: 12, padding: 10, margin: '4px 0 8px' }}>
      <div style={{ fontSize: 13, color: '#c3c9cd' }}>Giá {s.name} · màu {colorName}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#ffd36b', margin: '2px 0 8px' }}>{formatVnd(price)}</div>
      {!confirm && <button style={{ ...buyBtn, width: '100%', background: enough ? '#e0313f' : '#5a5f63', color: '#fff' }} onClick={() => { if (enough) { setConfirm(true); cars.set({ message: '' }); } else cars.set({ message: `Chưa đủ tiền: còn thiếu ${formatVnd(price - money)}. Đi làm kiếm thêm rồi quay lại nhé.` }); }}>{enough ? `Mua xe · ${formatVnd(price)}` : `Chưa đủ tiền · thiếu ${formatVnd(price - money)}`}</button>}
      {confirm && <div><div style={{ fontSize: 14, marginBottom: 6 }}>Mua {s.name} màu {colorName} với giá {admin ? '0đ (admin)' : formatVnd(price)}?</div>
        <div style={{ display: 'flex', gap: 8 }}><button style={{ ...buyBtn, flex: 1, background: '#2fa35b', color: '#fff' }} onClick={() => { buyCar(viewer.model, viewer.color, FORECOURT(owned)); setConfirm(false); }}>Xác nhận mua</button>
          <button style={{ ...buyBtn, flex: 1, background: '#f4f2ee', color: '#23262a' }} onClick={() => setConfirm(false)}>Huỷ</button></div></div>}
      {msg && <p className="parking-msg" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
    <div>{CAR_COLORS.map((c) => <button key={c.id} title={c.name} onClick={() => set({ color: c.hex })} style={{ ...btn, width: 28, height: 28, padding: 0, background: c.hex, outline: viewer.color === c.hex ? '3px solid #ffd36b' : 'none' }} />)}</div>
    <div>{VIEWS.filter((v) => v !== 'interior').map((v) => <button key={v} style={btn} onClick={() => { viewState.view = v; set({ interior: false }); }}>{{ orbit: 'Xoay 360°', front: 'Trước', side: 'Hông', rear: 'Sau', top: 'Trên', front34: 'Chéo trước', rear34: 'Chéo sau', interior: 'Nội thất' }[v]}</button>)}
      <button style={btn} onClick={() => { viewState.seat = 'driver'; set({ interior: !viewer.interior }); }}>{viewer.interior ? 'Ra ngoài' : 'Vào ghế lái'}</button>
      {asset && <button style={btn} onClick={() => { viewState.seat = 'rear'; set({ interior: true }); }}>Ngồi ghế sau</button>}</div>
    <div><><button style={btn} onClick={() => set({ doors: !viewer.doors })}>{viewer.doors ? 'Đóng cửa' : s.doorType === 'slidingRear' ? 'Mở cửa (cửa sau trượt)' : 'Mở cửa'}</button>
      <button style={btn} onClick={() => set({ tailgate: !viewer.tailgate })}>{viewer.tailgate ? 'Đóng cốp' : 'Mở cốp'}</button></>
      <button style={btn} onClick={() => set({ fold: !viewer.fold })}>{viewer.fold ? 'Dựng hàng ghế cuối' : 'Gập hàng ghế cuối'}</button></div>
    <table className="parking-table"><tbody>{specRows(viewer.model).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
    <p style={{ fontSize: 11, color: '#9aa3a9', margin: '6px 0' }}>Thương hiệu {BRANDS[veh.brandId].displayBrand} · {asset ? 'mô hình Blender, thiết kế gốc của ĐỜI VIỆT' : 'mô hình tạm, bản Blender đang làm'}.</p>
    <div className="lift-foot"><span>Mẫu xe và tên trong game là hư cấu, kích thước theo xe thật cùng loại.</span>
      <button onClick={() => { setConfirm(false); cars.set({ viewer: null, message: '' }); }}>Đóng</button></div>
  </div>;
}

let sceneRef: THREE.Object3D | null = null;
function lodStats(model: ModelId) {
  const scene = sceneRef; if (!scene) return null;
  const car = scene.getObjectByName(`display-${model}`); const lod = car?.getObjectByName('VehicleRoot') as THREE.LOD | undefined; if (!lod) return null;
  return lod.levels.map((lv) => { let tris = 0, meshes = 0; lv.object.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { meshes++; const g = mm.geometry; tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } }); return { tris: Math.round(tris), meshes }; });
}
if (import.meta.env.DEV) (window as unknown as { __dealer?: unknown }).__dealer = { lodStats, SITE, open: (model: ModelId, view: View = 'orbit', extra = {}) => { viewState.view = view; viewState.t = 0; cars.set({ viewer: { model, color: CAR_COLORS[0].hex, doors: false, tailgate: false, interior: false, fold: false, ...extra } }); }, setView: (v: View) => { viewState.view = v; }, setSeat: (s: 'driver' | 'rear') => { viewState.seat = s; } };
