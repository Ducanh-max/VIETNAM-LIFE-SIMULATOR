import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { BikePose } from './Scooter';

/*
 * Đen Car: a compact black electric crossover for the (fictional) Đen SM app. Low-poly but car-shaped:
 * sculpted body with bonnet, raked windscreen, glass house with pillars, roof with a lit Đen SM sign,
 * doors and handles, alloy wheels in black arches, LED light bars, mirrors, plates and a green stripe.
 * Faces +z, stands on y = 0. Length 4.3 m, width 1.8 m.
 */
export const CAR_WHEEL_R = 0.33;
/** Rear-right passenger seat (hip point) and driver seat, car space. */
export const CAR_PASSENGER = new THREE.Vector3(-0.38, 0.56, -0.62);
export const CAR_DRIVER = new THREE.Vector3(0.38, 0.56, 0.35);

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function panel(points: [number, number][], width: number, bevel: number) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
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
    ctx.fillStyle = '#111'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('30K-888.68', 128, 34);
  });
  return {
    body: new THREE.MeshPhysicalMaterial({ color: '#121315', roughness: 0.2, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
    trim: new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.75 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#2a3640', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.72 }),
    green: new THREE.MeshStandardMaterial({ color: '#16c784', emissive: '#0c6e48', emissiveIntensity: 0.3, roughness: 0.4 }),
    led: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f2f6ff', emissiveIntensity: 1.6 }),
    tail: new THREE.MeshStandardMaterial({ color: '#b3120f', emissive: '#ff2a1a', emissiveIntensity: 0.9 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: '#b8bdc2', roughness: 0.25, metalness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d8dbde', roughness: 0.1, metalness: 1 }),
    logo: new THREE.MeshStandardMaterial({ map: logo, emissive: '#ffffff', emissiveMap: logo, emissiveIntensity: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
    plate: new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.8 }),
  };
}
const M = () => (mats ??= make());

function CarWheel() {
  const m = M();
  return <group>
    <mesh material={m.tyre} rotation={[0, Math.PI / 2, 0]} castShadow><torusGeometry args={[CAR_WHEEL_R - 0.07, 0.075, 12, 32]} /></mesh>
    <mesh material={m.rim} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.2, 0.2, 0.16, 28]} /></mesh>
    {Array.from({ length: 5 }, (_, i) => <mesh key={i} material={m.trim} rotation={[(i / 5) * Math.PI * 2, 0, 0]} position={[0.081, 0, 0]}><boxGeometry args={[0.01, 0.3, 0.05]} /></mesh>)}
    <mesh material={m.chrome} position={[0.085, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.045, 0.045, 0.012, 16]} /></mesh>
  </group>;
}

export function DenCarModel({ pose, children }: { pose: BikePose; children?: ReactNode }) {
  const m = M();
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group[]>([]);
  const geo = useMemo(() => ({
    // lower body: bumpers, bonnet, belt line and boot
    body: panel([[2.17, 0.3], [2.2, 0.55], [2.12, 0.74], [1.9, 0.84], [1.0, 0.95], [-1.6, 0.98], [-2.05, 0.94], [-2.18, 0.78], [-2.18, 0.32], [-1.6, 0.26], [1.6, 0.26]], 1.8, 0.07),
    // glass house above the belt line
    cabin: panel([[1.02, 0.94], [0.32, 1.46], [-1.12, 1.5], [-1.78, 1.0], [-1.6, 0.96]], 1.58, 0.05),
    roof: panel([[0.36, 1.47], [0.28, 1.53], [-1.08, 1.56], [-1.16, 1.51]], 1.5, 0.03),
  }), []);
  useFrame(() => {
    if (!root.current) return;
    root.current.position.copy(pose.position);
    root.current.rotation.set(0, pose.heading, 0);
    for (const w of wheels.current) if (w) w.rotation.x = pose.wheel * (0.285 / CAR_WHEEL_R);
  });
  const wheelPos: [number, number, number][] = [[0.8, CAR_WHEEL_R, 1.33], [-0.8, CAR_WHEEL_R, 1.33], [0.8, CAR_WHEEL_R, -1.33], [-0.8, CAR_WHEEL_R, -1.33]];
  return <group ref={root}>
    <mesh geometry={geo.body} material={m.body} castShadow receiveShadow />
    <mesh geometry={geo.cabin} material={m.glass} />
    <mesh geometry={geo.roof} material={m.body} castShadow />
    {/* pillars */}
    {[-1, 1].flatMap((s) => [[0.68, 1.2, -0.62, 0.62], [-0.38, 1.22, 0, 0.6], [-1.45, 1.22, 0.75, 0.58]].map(([z, y, rx, h], i) => <mesh key={`${s}${i}`} material={m.body} position={[s * 0.775, y, z]} rotation={[rx, 0, 0]}><boxGeometry args={[0.05, h, 0.09]} /></mesh>))}
    {/* black wheel arches and side sills */}
    {wheelPos.map(([x, , z], i) => <mesh key={`a${i}`} material={m.trim} position={[x * 1.14, CAR_WHEEL_R, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.42, 0.42, 0.12, 20, 1, true, Math.PI * 0.05, Math.PI * 0.9]} /></mesh>)}
    {[-1, 1].map((s) => <mesh key={`sill${s}`} material={m.trim} position={[s * 0.89, 0.33, 0]}><boxGeometry args={[0.05, 0.12, 2.0]} /></mesh>)}
    {wheelPos.map((p, i) => <group key={`w${i}`} position={p} ref={(g) => { if (g) wheels.current[i] = g; }} scale={[p[0] > 0 ? 1 : -1, 1, 1]}><CarWheel /></group>)}
    {/* doors: shut lines, handles, Đen SM logo and green stripe */}
    {[-1, 1].map((s) => <group key={`door${s}`}>
      {[0.95, -0.38, -1.5].map((z) => <mesh key={z} material={m.trim} position={[s * 0.905, 0.65, z]}><boxGeometry args={[0.006, 0.6, 0.012]} /></mesh>)}
      {[0.35, -0.85].map((z) => <mesh key={`h${z}`} material={m.chrome} position={[s * 0.91, 0.82, z]}><boxGeometry args={[0.02, 0.025, 0.16]} /></mesh>)}
      <mesh material={m.green} position={[s * 0.905, 0.52, 0]}><boxGeometry args={[0.006, 0.05, 3.7]} /></mesh>
      <mesh material={m.logo} position={[s * 0.91, 0.66, -0.2]} rotation={[0, s * Math.PI / 2, 0]}><planeGeometry args={[0.9, 0.22]} /></mesh>
      {/* mirror */}
      <mesh material={m.body} position={[s * 0.98, 1.0, 0.85]}><boxGeometry args={[0.14, 0.09, 0.16]} /></mesh>
    </group>)}
    {/* LED light bars, grille, plates */}
    <mesh material={m.led} position={[0, 0.77, 2.08]}><boxGeometry args={[1.5, 0.035, 0.05]} /></mesh>
    {[-1, 1].map((s) => <mesh key={`hl${s}`} material={m.led} position={[s * 0.62, 0.7, 2.13]}><boxGeometry args={[0.28, 0.07, 0.05]} /></mesh>)}
    <mesh material={m.trim} position={[0, 0.45, 2.17]}><boxGeometry args={[1.2, 0.16, 0.05]} /></mesh>
    <mesh material={m.green} position={[0, 0.78, 2.11]}><boxGeometry args={[0.16, 0.05, 0.02]} /></mesh>
    <mesh material={m.tail} position={[0, 0.86, -2.15]}><boxGeometry args={[1.56, 0.05, 0.04]} /></mesh>
    <mesh material={m.plate} position={[0, 0.48, 2.2]}><planeGeometry args={[0.5, 0.12]} /></mesh>
    <mesh material={m.plate} position={[0, 0.58, -2.2]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.5, 0.12]} /></mesh>
    {/* lit roof sign */}
    <group position={[0, 1.66, -0.4]}>
      <RoundedBox args={[0.5, 0.17, 0.2]} radius={0.04} smoothness={3} material={m.body} />
      {[-1, 1].map((s) => <mesh key={s} material={m.logo} position={[0, 0, s * 0.101]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}><planeGeometry args={[0.44, 0.12]} /></mesh>)}
    </group>
    {/* seats seen through the glass */}
    {[[0.38, 0.35], [-0.38, 0.35], [0.38, -0.62], [-0.38, -0.62]].map(([x, z], i) => <group key={`s${i}`} position={[x, 0, z]}>
      <mesh material={m.seat} position={[0, 0.48, 0]}><boxGeometry args={[0.48, 0.12, 0.5]} /></mesh>
      <mesh material={m.seat} position={[0, 0.85, -0.25]} rotation={[-0.15, 0, 0]}><boxGeometry args={[0.46, 0.65, 0.1]} /></mesh>
    </group>)}
    {children}
  </group>;
}
