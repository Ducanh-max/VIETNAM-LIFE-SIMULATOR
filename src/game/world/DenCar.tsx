import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { BikePose } from './Scooter';

/*
 * The game's compact sedan (player's car, rental cars, Đen SM cars), after the owner's reference picture:
 * soft low-poly body with a sloping fastback roof, black lower bumper and grille with an original emblem
 * (a chrome ring round a four-point star — not a real brand), slim swept-back headlights, round fog
 * lamps, mirrors with orange indicators, door handles, five-spoke alloys, red tail lamps and plates.
 * `plain` = a private/rental car in `color` (white, red, grey, blue); otherwise the Đen SM livery
 * (dark body, green stripe, the app's name on the doors and a roof sign). Faces +z, wheels on y = 0.
 * Length 4.4 m, width 1.76 m, roof 1.55 m.
 */
export const CAR_WHEEL_R = 0.31;
/** Rear-right passenger seat (hip point) and driver seat (front left: Vietnam drives on the right), car space. */
export const CAR_PASSENGER = new THREE.Vector3(-0.36, 0.5, -0.55);
export const CAR_DRIVER = new THREE.Vector3(0.36, 0.5, 0.25);
/** Avatars are drawn a little smaller inside the cabin so the big chibi heads clear the roof. */
export const CABIN_SCALE = 0.84;
export const CAR_COLORS = { white: '#f1f1ee', red: '#c3222a', grey: '#5d6268', blue: '#2f5fc0' } as const;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/** Side profile (z, y) smoothed and extruded across the car. */
function panel(points: [number, number][], width: number, bevel: number, smooth: number) {
  const outline = new THREE.CatmullRomCurve3(points.map(([z, y]) => new THREE.Vector3(z, y, 0)), true, 'centripetal').getPoints(smooth).map((v) => new THREE.Vector2(v.x, v.y));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: Math.min(0.03, bevel), bevelSegments: 2, curveSegments: 4 }); // round the sides, keep the outline's length
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
/** A thin box from a to b (pillars). */
function bar(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number) {
  const g = new THREE.BoxGeometry(w, d, a.distanceTo(b));
  const m = new THREE.Matrix4().lookAt(b, a, new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

let mats: ReturnType<typeof make> | null = null;
function make() {
  const logo = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 38px "Be Vietnam Pro", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Đen', 98, 34); ctx.fillStyle = '#16c784'; ctx.fillText('SM', 170, 34);
  });
  const plate = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, 256, 64); ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = '#111'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('30A-123.45', 128, 34);
  });
  return {
    den: new THREE.MeshPhysicalMaterial({ color: '#202327', roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    black: new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#33424d', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.6 }),
    green: new THREE.MeshStandardMaterial({ color: '#16c784', emissive: '#0c6e48', emissiveIntensity: 0.3, roughness: 0.4 }),
    led: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f2f6ff', emissiveIntensity: 1.4 }),
    fog: new THREE.MeshStandardMaterial({ color: '#fff4cc', emissive: '#ffd27a', emissiveIntensity: 1.2 }),
    tail: new THREE.MeshStandardMaterial({ color: '#b3120f', emissive: '#ff2a1a', emissiveIntensity: 0.8 }),
    amber: new THREE.MeshStandardMaterial({ color: '#ff9a1a', emissive: '#c25e00', emissiveIntensity: 0.6 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.25, metalness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#dfe2e5', roughness: 0.12, metalness: 1 }),
    logo: new THREE.MeshStandardMaterial({ map: logo, emissive: '#ffffff', emissiveMap: logo, emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
    plate: new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ color: '#cbbfa8', roughness: 0.85 }),
    dash: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.7 }),
  };
}
const M = () => (mats ??= make());
const paints = new Map<string, THREE.Material>();
function paint(c: string) { let p = paints.get(c); if (!p) paints.set(c, (p = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 }))); return p; }

let geoCache: ReturnType<typeof makeGeo> | null = null;
function makeGeo() {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    body: panel([[2.16, 0.3], [2.23, 0.5], [2.16, 0.7], [1.95, 0.8], [1.2, 0.91], [0.92, 0.95], [-1.4, 0.98], [-1.9, 1.0], [-2.15, 0.93], [-2.21, 0.72], [-2.18, 0.34], [-1.7, 0.27], [1.7, 0.27]], 1.76, 0.12, 28),
    // fastback greenhouse: raked windscreen, roof, long sloping rear window down to a short boot
    cabin: panel([[0.95, 0.92], [0.55, 1.22], [0.18, 1.45], [-0.55, 1.5], [-1.0, 1.36], [-1.55, 1.0], [-0.6, 0.93]], 1.5, 0.09, 22),
    roof: panel([[0.16, 1.45], [0.05, 1.52], [-0.6, 1.55], [-0.85, 1.48], [-0.3, 1.46]], 1.42, 0.05, 12),
    pillars: [1, -1].flatMap((s) => [
      bar(V(s * 0.73, 0.94, 0.93), V(s * 0.66, 1.46, 0.18), 0.06, 0.08),
      bar(V(s * 0.75, 0.95, -0.25), V(s * 0.7, 1.5, -0.3), 0.06, 0.09),
      bar(V(s * 0.75, 0.98, -1.5), V(s * 0.68, 1.42, -0.95), 0.06, 0.16),
    ]),
  };
}
const G = () => (geoCache ??= makeGeo());

function CarWheel() {
  const m = M();
  return <group>
    <mesh material={m.tyre} rotation={[0, Math.PI / 2, 0]} castShadow><torusGeometry args={[CAR_WHEEL_R - 0.07, 0.072, 6, 16]} /></mesh>
    <mesh material={m.rim} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.19, 0.19, 0.15, 12]} /></mesh>
    {Array.from({ length: 5 }, (_, i) => <group key={i} rotation={[(i / 5) * Math.PI * 2, 0, 0]}><mesh material={m.chrome} position={[0.079, 0.09, 0]}><boxGeometry args={[0.012, 0.17, 0.045]} /></mesh></group>)}
    <mesh material={m.black} position={[0.083, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.04, 0.012, 10]} /></mesh>
  </group>;
}

export function DenCarModel({ pose, children, plain = false, color }: { pose: BikePose; children?: ReactNode; plain?: boolean; color?: string }) {
  const m = M(); const g = G();
  const body = plain ? paint(color ?? CAR_COLORS.white) : m.den;
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group[]>([]);
  const steerers = useRef<THREE.Group[]>([]);
  const wheelRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    root.current.position.copy(pose.position);
    root.current.rotation.set(0, pose.heading, 0);
    for (const w of wheels.current) if (w) w.rotation.x = pose.wheel * (0.285 / CAR_WHEEL_R);
    for (const s of steerers.current) if (s) s.rotation.y = pose.steer * 0.9;
    if (wheelRef.current) wheelRef.current.rotation.z = -pose.steer * 2.6;
  });
  const wheelPos = useMemo<[number, number, number][]>(() => [[0.83, CAR_WHEEL_R, 1.3], [-0.83, CAR_WHEEL_R, 1.3], [0.83, CAR_WHEEL_R, -1.3], [-0.83, CAR_WHEEL_R, -1.3]], []);
  return <group ref={root}>
    <mesh geometry={g.body} material={body} castShadow receiveShadow />
    <mesh geometry={g.cabin} material={m.glass} />
    <mesh geometry={g.roof} material={body} castShadow />
    {g.pillars.map((p, i) => <mesh key={i} geometry={p} material={body} />)}
    {/* wheel arches (black liners), wheels; the front ones steer */}
    {wheelPos.map(([x, , z], i) => <mesh key={`a${i}`} material={m.black} position={[Math.sign(x) * 0.9, CAR_WHEEL_R + 0.02, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.39, 0.39, 0.06, 10, 1, true, Math.PI * 0.05, Math.PI * 0.9]} /></mesh>)}
    {wheelPos.map((p, i) => <group key={`w${i}`} position={p} ref={(gg) => { if (gg && p[2] > 0) steerers.current[i] = gg; }}>
      <group ref={(gg) => { if (gg) wheels.current[i] = gg; }} scale={[p[0] > 0 ? 1 : -1, 1, 1]}><CarWheel /></group>
    </group>)}
    {/* black lower bumper with round fog lamps, grille with the emblem, slim swept-back headlights */}
    <mesh material={m.black} position={[0, 0.38, 2.19]}><boxGeometry args={[1.5, 0.2, 0.1]} /></mesh>
    {[-1, 1].map((s) => <mesh key={`fg${s}`} material={m.fog} position={[s * 0.58, 0.39, 2.25]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.055, 0.055, 0.03, 12]} /></mesh>)}
    <mesh material={m.black} position={[0, 0.62, 2.2]}><boxGeometry args={[0.95, 0.17, 0.06]} /></mesh>
    {[0.58, 0.66].map((y) => <mesh key={`gr${y}`} material={m.chrome} position={[0, y, 2.235]}><boxGeometry args={[0.9, 0.012, 0.01]} /></mesh>)}
    <group position={[0, 0.66, 2.245]}>
      <mesh material={m.chrome}><torusGeometry args={[0.065, 0.011, 6, 18]} /></mesh>
      <mesh material={m.chrome} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.06, 0.06, 0.012]} /></mesh>
    </group>
    {[-1, 1].map((s) => <mesh key={`hl${s}`} material={m.led} position={[s * 0.6, 0.73, 2.08]} rotation={[0, -s * 0.45, s * 0.12]}><boxGeometry args={[0.42, 0.065, 0.12]} /></mesh>)}
    {/* mirrors with orange indicators, door handles, door shut lines */}
    {[-1, 1].map((s) => <group key={`mr${s}`} position={[s * 0.93, 1.0, 0.72]}>
      <mesh material={body}><boxGeometry args={[0.18, 0.1, 0.12]} /></mesh>
      <mesh material={m.amber} position={[s * 0.02, -0.04, 0.062]}><boxGeometry args={[0.12, 0.018, 0.01]} /></mesh>
    </group>)}
    {[-1, 1].flatMap((s) => [0.25, -0.78].map((z) => <mesh key={`dh${s}${z}`} material={m.chrome} position={[s * 0.885, 0.84, z]}><boxGeometry args={[0.02, 0.025, 0.15]} /></mesh>))}
    {[-1, 1].flatMap((s) => [0.92, -0.32, -1.45].map((z) => <mesh key={`sl${s}${z}`} material={m.black} position={[s * 0.882, 0.66, z]}><boxGeometry args={[0.004, 0.52, 0.01]} /></mesh>))}
    {/* tail lamps wrapping round the corners, rear bumper, plates */}
    {[-1, 1].map((s) => <mesh key={`tl${s}`} material={m.tail} position={[s * 0.62, 0.84, -2.16]} rotation={[0, s * 0.35, 0]}><boxGeometry args={[0.44, 0.12, 0.08]} /></mesh>)}
    <mesh material={m.black} position={[0, 0.38, -2.18]}><boxGeometry args={[1.5, 0.18, 0.1]} /></mesh>
    <mesh material={m.plate} position={[0, 0.45, 2.252]}><planeGeometry args={[0.46, 0.11]} /></mesh>
    <mesh material={m.plate} position={[0, 0.6, -2.215]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.46, 0.11]} /></mesh>
    {/* Đen SM livery: stripe, the app's name on the doors and a lit roof sign */}
    {!plain && <>
      {[-1, 1].map((s) => <group key={`dl${s}`}>
        <mesh material={m.green} position={[s * 0.884, 0.5, 0]}><boxGeometry args={[0.006, 0.05, 3.6]} /></mesh>
        <mesh material={m.logo} position={[s * 0.886, 0.68, -0.25]} rotation={[0, s * Math.PI / 2, 0]}><planeGeometry args={[0.8, 0.2]} /></mesh>
      </group>)}
      <group position={[0, 1.62, -0.35]}>
        <RoundedBox args={[0.46, 0.15, 0.18]} radius={0.04} smoothness={2} material={m.den} />
        {[-1, 1].map((s) => <mesh key={s} material={m.logo} position={[0, 0, s * 0.091]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}><planeGeometry args={[0.4, 0.11]} /></mesh>)}
      </group>
    </>}
    {/* cabin: seats, dashboard, steering wheel */}
    {[[0.36, 0.25], [-0.36, 0.25], [0.4, -0.6], [0, -0.6], [-0.4, -0.6]].map(([x, z], i) => <group key={`s${i}`} position={[x, 0, z]}>
      <mesh material={m.seat} position={[0, 0.42, 0]}><boxGeometry args={[i > 1 ? 0.38 : 0.46, 0.1, 0.46]} /></mesh>
      {i < 2 && <mesh material={m.seat} position={[0, 0.75, -0.24]} rotation={[-0.15, 0, 0]}><boxGeometry args={[0.44, 0.6, 0.1]} /></mesh>}
    </group>)}
    <mesh material={m.seat} position={[0, 0.72, -0.86]} rotation={[-0.2, 0, 0]}><boxGeometry args={[1.3, 0.55, 0.1]} /></mesh>
    <mesh material={m.dash} position={[0, 0.88, 0.85]} rotation={[-0.25, 0, 0]}><boxGeometry args={[1.45, 0.12, 0.38]} /></mesh>
    <group position={[CAR_DRIVER.x, 0.84, 0.62]} rotation={[-0.45, 0, 0]}>
      <group ref={wheelRef}>
        <mesh material={m.dash}><torusGeometry args={[0.15, 0.02, 6, 18]} /></mesh>
        <mesh material={m.dash}><boxGeometry args={[0.28, 0.03, 0.02]} /></mesh>
      </group>
    </group>
    {children}
  </group>;
}
