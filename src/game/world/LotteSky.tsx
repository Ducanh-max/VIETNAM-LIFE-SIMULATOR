import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, project, type Point } from '../geo';
import { CORE, floorY, fromTower, lift, toTower, towerBlockers, towerRing } from '../lotte';
import { buySkyTicket, hasSkyTicket, sky, skyConfig, skyOpenNow, useSky } from '../lotteSky';
import { formatVnd, game, player, useGame } from '../state';

/*
 * LOTTE Hanoi Sky, floor 65 (spec section 12): the lift lobby with the ticket desk and a turnstile, the deck behind it
 * with floor-to-ceiling glass (the tower's own Interior), the glass-floored Skywalk at the east end looking straight
 * down 263 m, coin telescopes along the glass that name what you are looking at, viewing seats, a souvenir stand, a
 * photo spot, a landmark map, visitors and staff. A second ticket desk stands by the lift on B1. The view out is the
 * game's real 3D city (the haze thins up here, see World.tsx HighFog), not a picture.
 */
export const SKY_FLOOR = 65;
/** Skywalk: a glass floor panel at the east end of the deck (tower local). */
export const SKYWALK = { u0: 30, u1: 40, v0: -5, v1: 5 };
const LOBBY = (u: number, v: number) => Math.abs(u) < 9 && v > CORE.halfV - 0.6 && v < 13;
const DESK65: Point = [6.5, 8.5];
const DESK_B1: Point = [-11, 7.5];
/** Landmarks named by the telescopes and the map (WGS84; positions from public maps, rounded). */
const LANDMARKS: { name: string; lat: number; lon: number }[] = [
  { name: 'Hồ Tây', lat: 21.0545, lon: 105.819 }, { name: 'Hồ Hoàn Kiếm', lat: 21.0288, lon: 105.8525 },
  { name: 'Lăng Chủ tịch Hồ Chí Minh', lat: 21.0368, lon: 105.8347 }, { name: 'Hoàng thành Thăng Long', lat: 21.0353, lon: 105.84 },
  { name: 'Văn Miếu – Quốc Tử Giám', lat: 21.0293, lon: 105.8355 }, { name: 'Cầu Long Biên', lat: 21.0428, lon: 105.8594 },
  { name: 'Công viên Thủ Lệ', lat: 21.0315, lon: 105.8045 }, { name: 'Hồ Ngọc Khánh', lat: 21.027, lon: 105.8155 },
  { name: 'Ga Hà Nội', lat: 21.0245, lon: 105.8412 }, { name: 'Nhà hát Lớn', lat: 21.0243, lon: 105.8577 }, { name: 'Sông Hồng', lat: 21.0353, lon: 105.8665 },
];
const DIRS = ['bắc', 'đông bắc', 'đông', 'đông nam', 'nam', 'tây nam', 'tây', 'tây bắc'];
/** Distance (km) and compass direction of each landmark from the tower (world +x east, −z north). */
function landmarkTable() {
  const c = fromTower(0, 0);
  return LANDMARKS.map((l) => { const [x, z] = project([l.lon, l.lat]); const dx = x - c[0], dz = z - c[1]; const km = Math.hypot(dx, dz) / 1000; const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; return { ...l, km, bearing, dir: DIRS[Math.round(bearing / 45) % 8] }; }).sort((a, b) => a.km - b.km);
}
// the turnstile: without a ticket you stay in the lift lobby on 65
export function skyBlocks(u: number, v: number, f: number) {
  if (f !== SKY_FLOOR || hasSkyTicket()) return false;
  return !LOBBY(u, v);
}

const label = (text: string, bg: string, fg = '#fff', w = 512, h = 128) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!;
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; let px = Math.round(h * 0.5); x.font = `bold ${px}px Arial`;
  while (x.measureText(text).width > w * 0.9 && px > 12) { px -= 3; x.font = `bold ${px}px Arial`; }
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t });
};
let M: ReturnType<typeof mk> | null = null;
function mk() {
  const std = (color: string, x: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...x });
  // the landmark map: the tower in the middle, landmarks by bearing and distance
  const mapTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d')!;
    x.fillStyle = '#f4f2ee'; x.fillRect(0, 0, 512, 512); x.strokeStyle = '#b8c3c9'; for (let r = 60; r < 260; r += 60) { x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = '#d51d32'; x.beginPath(); x.arc(256, 256, 9, 0, Math.PI * 2); x.fill(); x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.fillText('LOTTE CENTER', 256, 290);
    x.font = 'bold 18px Arial';
    for (const l of landmarkTable()) { const r = Math.min(235, l.km * 60); const a = l.bearing * Math.PI / 180; const px = 256 + Math.sin(a) * r, py = 256 - Math.cos(a) * r; x.fillStyle = '#1d4f8f'; x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill(); x.fillStyle = '#27292b'; x.fillText(l.name, px, py - 10); }
    x.fillStyle = '#27292b'; x.font = 'bold 26px Arial'; x.fillText('B', 256, 26); x.font = '16px Arial'; x.fillText('mỗi vòng 1 km', 256, 500);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  return {
    desk: std('#27292B'), deskTop: std('#c9cfd3', { metalness: 0.6, roughness: 0.3 }), red: std('#d51d32'), steel: std('#b9bec2', { metalness: 0.7, roughness: 0.3 }),
    glassFloor: new THREE.MeshStandardMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.22, roughness: 0.02, metalness: 0.1, depthWrite: false }),
    frame: std('#27292B', { metalness: 0.4 }), shelf: std('#f4f2ee'), souvenir: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    map: new THREE.MeshBasicMaterial({ map: mapTex }), skin: std('#e2b48f'), staff: std('#d51d32'), visitor1: std('#5b7fa6'), visitor2: std('#e0a21b'), visitor3: std('#3f7d3a'), trousers: std('#2b2f36'),
    signDesk: label('VÉ · TICKETS HANOI SKY', '#d51d32'), signPhoto: label('HANOI SKY · 272 m', '#1d4f8f'), signSkywalk: label('SKYWALK · SÀN KÍNH', '#27292B'),
    signGate: label('SOÁT VÉ', '#27292B'), signB1: label('VÉ ĐÀI QUAN SÁT TẦNG 65', '#d51d32'),
  };
}
const mats = () => (M ??= mk());
function Person({ p, yaw, shirt }: { p: Point; yaw: number; shirt: THREE.Material }) {
  const m = mats();
  return <group position={[p[0], 0, p[1]]} rotation={[0, yaw, 0]}>
    <mesh material={m.trousers} position={[0, 0.45, 0]}><boxGeometry args={[0.36, 0.9, 0.24]} /></mesh>
    <mesh material={shirt} position={[0, 1.2, 0]}><boxGeometry args={[0.46, 0.6, 0.28]} /></mesh>
    <mesh material={m.skin} position={[0, 1.68, 0]}><sphereGeometry args={[0.2, 12, 8]} /></mesh>
  </group>;
}
towerBlockers.push(skyBlocks);
/** Coin telescopes: evenly round the glass, each facing straight out (tower local, with its outward yaw). */
function telescopes() {
  const ring = towerRing(floorY(SKY_FLOOR), 1.1); const out: { p: Point; yaw: number; worldYaw: number }[] = [];
  const step = Math.floor(ring.length / 8);
  for (let k = 0; k < 8; k++) {
    const i = k * step; const a = ring[i], b = ring[(i + 1) % ring.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n: Point = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
    if (a[0] > 28 && Math.abs(a[1]) < 6) continue; // not on the Skywalk
    out.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], yaw: Math.atan2(n[0], n[1]), worldYaw: 0 });
  }
  return out;
}
const TELESCOPES = telescopes();

/** Floor 65 furniture (in the tower group). The deck's glass, slab with the Skywalk hole and seats come from Interior. */
export function LotteSky() {
  const m = mats();
  const y = GROUND_HEIGHT + floorY(SKY_FLOOR);
  const souvenirs = useMemo(() => { const g = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.22, 0.12), m.souvenir, 24); const mt = new THREE.Matrix4(); for (let i = 0; i < 24; i++) { mt.makeTranslation(-1.2 + (i % 8) * 0.34, 0.55 + Math.floor(i / 8) * 0.4, 0); g.setMatrixAt(i, mt); g.setColorAt(i, new THREE.Color(`hsl(${i * 47 % 360}, 55%, 55%)`)); } g.instanceMatrix.needsUpdate = true; return g; }, [m]);
  return <group position={[0, y, 0]}>
    {/* Skywalk: glass floor with a steel frame and its sign */}
    <mesh material={m.glassFloor} position={[(SKYWALK.u0 + SKYWALK.u1) / 2, 0.01, (SKYWALK.v0 + SKYWALK.v1) / 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[SKYWALK.u1 - SKYWALK.u0, SKYWALK.v1 - SKYWALK.v0]} /></mesh>
    {[SKYWALK.v0, SKYWALK.v1].map((v) => <mesh key={v} material={m.frame} position={[(SKYWALK.u0 + SKYWALK.u1) / 2, 0.02, v]}><boxGeometry args={[SKYWALK.u1 - SKYWALK.u0, 0.04, 0.12]} /></mesh>)}
    {[SKYWALK.u0, SKYWALK.u1].map((u) => <mesh key={u} material={m.frame} position={[u, 0.02, 0]}><boxGeometry args={[0.12, 0.04, SKYWALK.v1 - SKYWALK.v0]} /></mesh>)}
    <mesh material={m.signSkywalk} position={[SKYWALK.u0 - 0.4, 3.4, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[3, 0.6]} /></mesh>
    {/* ticket desk and turnstile in the lift lobby */}
    <group position={[DESK65[0], 0, DESK65[1]]}>
      <mesh material={m.desk} position={[0, 0.55, 0]}><boxGeometry args={[2.4, 1.1, 0.8]} /></mesh>
      <mesh material={m.deskTop} position={[0, 1.12, 0]}><boxGeometry args={[2.5, 0.05, 0.9]} /></mesh>
      <mesh material={m.signDesk} position={[0, 2.6, -0.45]} rotation={[0, Math.PI, 0]}><planeGeometry args={[2.4, 0.6]} /></mesh>
      <Person p={[0, 0.8]} yaw={Math.PI} shirt={m.staff} />
    </group>
    {[-9, 9].map((u) => <group key={u} position={[u, 0, 8.5]}>
      {[-1.6, -0.6, 0.6, 1.6].map((dv) => <mesh key={dv} material={m.steel} position={[0, 0.5, dv]}><boxGeometry args={[0.6, 1.0, 0.15]} /></mesh>)}
      <mesh material={m.signGate} position={[0, 2.3, 0]} rotation={[0, u > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}><planeGeometry args={[1.4, 0.35]} /></mesh>
    </group>)}
    {/* telescopes */}
    {TELESCOPES.map((t, i) => <group key={i} position={[t.p[0], 0, t.p[1]]} rotation={[0, t.yaw, 0]}>
      <mesh material={m.steel} position={[0, 0.6, 0]}><cylinderGeometry args={[0.06, 0.09, 1.2, 10]} /></mesh>
      <mesh material={m.red} position={[0, 1.3, 0.05]} rotation={[Math.PI / 2 - 0.15, 0, 0]}><cylinderGeometry args={[0.09, 0.12, 0.45, 12]} /></mesh>
    </group>)}
    {/* souvenirs, photo spot, landmark map */}
    <group position={[-24, 0, -6]}>
      <mesh material={m.shelf} position={[0, 0.9, -0.15]}><boxGeometry args={[3, 1.8, 0.3]} /></mesh>
      <primitive object={souvenirs} position={[0, 0, 0.1]} />
    </group>
    <group position={[-30, 0, 4]}>
      <mesh material={m.frame} position={[0, 1.4, 0]}><boxGeometry args={[2.6, 2.8, 0.12]} /></mesh>
      <mesh material={m.signPhoto} position={[0, 2.5, 0.07]}><planeGeometry args={[2.3, 0.55]} /></mesh>
    </group>
    <group position={[-14, 0, -7.5]}>
      <mesh material={m.frame} position={[0, 1.3, -0.05]}><boxGeometry args={[2.2, 2.2, 0.08]} /></mesh>
      <mesh material={m.map} position={[0, 1.3, 0.0]}><planeGeometry args={[2.0, 2.0]} /></mesh>
    </group>
    {/* visitors */}
    <Person p={[18, -6]} yaw={Math.PI} shirt={m.visitor1} />
    <Person p={[33, 1]} yaw={Math.PI / 2} shirt={m.visitor2} />
    <Person p={[-20, 6]} yaw={0} shirt={m.visitor3} />
  </group>;
}
/** The ticket desk by the lift on B1 (in the tower group). */
export function SkyDeskB1() {
  const m = mats(); const y = GROUND_HEIGHT + floorY(-1);
  return <group position={[DESK_B1[0], y, DESK_B1[1]]}>
    <mesh material={m.desk} position={[0, 0.55, 0]}><boxGeometry args={[2.4, 1.1, 0.8]} /></mesh>
    <mesh material={m.deskTop} position={[0, 1.12, 0]}><boxGeometry args={[2.5, 0.05, 0.9]} /></mesh>
    <mesh material={m.signB1} position={[0, 2.6, -0.45]} rotation={[0, Math.PI, 0]}><planeGeometry args={[2.6, 0.6]} /></mesh>
    <Person p={[0, -0.8]} yaw={0} shirt={m.staff} />
  </group>;
}

const near = (u: number, v: number, p: Point, r: number) => Math.hypot(u - p[0], v - p[1]) < r;
/** Prompts on 65 and at the B1 desk. */
export function useSkyFlow() {
  const greeted = useRef(false);
  useFrame(() => {
    const f = lift.playerFloor; if (f !== SKY_FLOOR && f !== -1) { greeted.current = false; return; }
    const [u, v] = toTower([player.position.x, player.position.z]);
    const desk = f === SKY_FLOOR ? DESK65 : DESK_B1;
    if (near(u, v, desk, 2.6)) {
      game.offer(hasSkyTicket()
        ? { id: 'sky-desk', text: 'Bạn đã có vé Hanoi Sky hôm nay', key: null, priority: 6 }
        : { id: 'sky-desk', text: `Mua vé LOTTE Hanoi Sky · ${formatVnd(skyConfig.price)}`, key: 'E', priority: 8, run: () => { sky.set({ panel: true, message: '' }); if (document.pointerLockElement) document.exitPointerLock(); } });
      return;
    }
    if (f !== SKY_FLOOR) return;
    if (!hasSkyTicket() && LOBBY(u, v) && (Math.abs(u) > 7.5 || v > 11)) { game.offer({ id: 'sky-gate', text: 'Cửa soát vé: cần vé Hanoi Sky (mua ở quầy cạnh thang máy)', key: null, priority: 7 }); return; }
    if (hasSkyTicket() && !LOBBY(u, v) && !greeted.current) { greeted.current = true; game.toast('Chào mừng đến LOTTE Hanoi Sky · 65 tầng, cao 272 m. Ra Skywalk ở đầu phía đông để nhìn thẳng xuống thành phố.'); }
    if (u > SKYWALK.u0 && u < SKYWALK.u1 && v > SKYWALK.v0 && v < SKYWALK.v1) { game.offer({ id: 'sky-walk', text: 'Đang đứng trên Skywalk: sàn kính, 263 m phía dưới', key: null, priority: 5 }); return; }
    const table = landmarkTable();
    for (const t of TELESCOPES) if (near(u, v, t.p, 1.4)) {
      // what this telescope looks at: landmarks within 40° of its outward direction (world bearing)
      const [ax, az] = fromTower(t.p[0], t.p[1]); const [bx, bz] = fromTower(t.p[0] + Math.sin(t.yaw), t.p[1] + Math.cos(t.yaw));
      const bearing = (Math.atan2(bx - ax, -(bz - az)) * 180 / Math.PI + 360) % 360;
      const seen = table.filter((l) => Math.abs(((l.bearing - bearing + 540) % 360) - 180) < 40).slice(0, 3);
      game.offer({ id: 'sky-scope', text: 'Ống nhòm: nhìn ra xa', key: 'E', priority: 7, run: () => game.toast(seen.length ? `Qua ống nhòm (hướng ${DIRS[Math.round(bearing / 45) % 8]}): ${seen.map((l) => `${l.name} ${l.km.toFixed(1)} km`).join(' · ')}` : `Hướng ${DIRS[Math.round(bearing / 45) % 8]}: phố phường Ba Đình, Cầu Giấy trải dài tới chân trời.`) });
      return;
    }
    if (near(u, v, [-14, -7.5], 2.2)) { game.offer({ id: 'sky-map', text: 'Bản đồ các địa danh', key: 'E', priority: 6, run: () => game.toast(table.slice(0, 6).map((l) => `${l.name}: ${l.km.toFixed(1)} km hướng ${l.dir}`).join(' · ')) }); return; }
    if (near(u, v, [-30, 4], 2.2)) { game.offer({ id: 'sky-photo', text: 'Góc chụp ảnh "HANOI SKY · 272 m"', key: 'E', priority: 6, run: () => game.toast('Tách! Một tấm ảnh kỷ niệm trên đài quan sát cao nhất Hà Nội ngày ấy.') }); return; }
  });
}
/** Ticket panel (DOM). */
export function SkyPanel() {
  const s = useSky((x) => x); const money = useGame((g) => g.money);
  if (!s.panel) return null;
  return <div className="lift-panel parking-panel" role="dialog" aria-label="Vé Hanoi Sky">
    <div className="lift-head"><b>LOTTE HANOI SKY · TẦNG 65</b><span>Mở cửa {skyConfig.open}–{skyConfig.close}{skyOpenNow() ? '' : ' · đang đóng'}</span></div>
    <table className="parking-table"><tbody>
      <tr><td>Vé tham quan (trong ngày)</td><td>{formatVnd(skyConfig.price)}</td></tr>
      <tr><td>Số dư ví</td><td>{formatVnd(money)}</td></tr>
      <tr><td>Vé của bạn</td><td>{hasSkyTicket() ? `Có · mua ở ${s.ticket!.where === 'B1' ? 'B1' : 'tầng 65'}` : 'Chưa có'}</td></tr>
    </tbody></table>
    {s.message && <p className="parking-msg">{s.message}</p>}
    <div className="lift-foot"><span>Giá và giờ trong game. Đài quan sát có sàn kính Skywalk, ống nhòm, bản đồ địa danh.</span>
      <button onClick={() => buySkyTicket(lift.playerFloor === -1 ? 'B1' : '65')} disabled={hasSkyTicket()}>Mua vé</button><button onClick={() => sky.set({ panel: false, message: '' })}>Đóng</button></div>
  </div>;
}

if (import.meta.env.DEV) (window as unknown as { __sky?: unknown }).__sky = { TELESCOPES, SKYWALK };
