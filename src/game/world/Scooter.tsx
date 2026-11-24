import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/*
 * The shop's delivery scooter: a Honda Wave-style underbone 110 cc (red/black), modelled part by part:
 * spoked alloy wheels with tyres and brakes, telescopic fork, handlebar cowl with headlight, speedo and
 * mirrors, leg shield, step-through floor, sculpted side panels, long seat, engine with finned cylinder,
 * exhaust with heat shield, swing-arm with chain case and twin shocks, rear rack and an insulated
 * delivery box. Units are metres; the bike faces +z and stands on y = 0.
 */
export const WHEEL_R = 0.285;
const FRONT_Z = 0.63;
const REAR_Z = -0.6;
export const WHEELBASE = FRONT_Z - REAR_Z;
const HEAD = new THREE.Vector3(0, 0.84, 0.47); // steering head
const FORK_LEN = Math.hypot(HEAD.y - WHEEL_R, FRONT_Z - HEAD.z);
const RAKE = Math.atan2(FRONT_Z - HEAD.z, HEAD.y - WHEEL_R); // fork leans forward at the bottom
/** Where the rider's hips sit (top of the seat, bike space). */
export const SEAT = new THREE.Vector3(0, 0.82, -0.27);
const BAR = new THREE.Vector3(0, 0.17, -0.06); // handlebar centre in the steering (fork) frame

/** Handlebar grip position in bike space for a given steering angle (side −1 = right grip). */
export function GRIP(side: number, steer: number) {
  return new THREE.Vector3(side * 0.31, BAR.y, BAR.z)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), steer)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), -RAKE)
    .add(HEAD);
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const box = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#d22a1f'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#ffd34a'; ctx.fillRect(0, 380, 512, 26);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 74px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText('BÚN CHẢ', 256, 150);
    ctx.fillText('ĐỨC ANH', 256, 240);
    ctx.font = '600 34px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText('GIAO HÀNG TẬN NƠI', 256, 330);
    ctx.fillStyle = '#7a120c'; ctx.font = 'bold 30px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText('Phố Đinh Tiên Hoàng · Hà Nội', 256, 455);
  });
  const plate = canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 244, 148);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 54px Arial';
    ctx.fillText('29-B1', 128, 50); ctx.fillText('688.68', 128, 115);
  });
  const dial = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.8 + (i / 12) * Math.PI * 1.4; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); ctx.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); ctx.stroke(); }
    ctx.fillStyle = '#f33'; ctx.save(); ctx.translate(64, 64); ctx.rotate(Math.PI * 1.1); ctx.fillRect(0, -2, 46, 4); ctx.restore();
    ctx.fillStyle = '#eee'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.fillText('km/h', 64, 96);
  });
  const seat = canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = '#1c1b1a'; ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([3, 3]); ctx.strokeRect(6, 6, 116, 52);
    ctx.fillStyle = 'rgba(255,255,255,.04)'; for (let y = 10; y < 60; y += 6) ctx.fillRect(0, y, 128, 2);
  });
  return {
    red: new THREE.MeshPhysicalMaterial({ color: '#c3161b', roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
    black: new THREE.MeshPhysicalMaterial({ color: '#191919', roughness: 0.35, clearcoat: 0.6 }),
    matte: new THREE.MeshStandardMaterial({ color: '#232323', roughness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 }),
    alloy: new THREE.MeshStandardMaterial({ color: '#b9bec2', roughness: 0.28, metalness: 0.85 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e8eaec', roughness: 0.08, metalness: 1 }),
    engine: new THREE.MeshStandardMaterial({ color: '#7d8186', roughness: 0.45, metalness: 0.7 }),
    exhaust: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.4, metalness: 0.8 }),
    lens: new THREE.MeshStandardMaterial({ color: '#f6f8ff', emissive: '#fff6d8', emissiveIntensity: 1.2, roughness: 0.05 }),
    tail: new THREE.MeshStandardMaterial({ color: '#b3120f', emissive: '#ff2a1a', emissiveIntensity: 0.6, roughness: 0.15 }),
    amber: new THREE.MeshStandardMaterial({ color: '#f59a1b', emissive: '#a35500', emissiveIntensity: 0.3, roughness: 0.2 }),
    mirror: new THREE.MeshStandardMaterial({ color: '#9fb4c4', roughness: 0.02, metalness: 1 }),
    seat: new THREE.MeshStandardMaterial({ map: seat, roughness: 0.6 }),
    box: new THREE.MeshStandardMaterial({ map: box, roughness: 0.45 }),
    boxPlain: new THREE.MeshStandardMaterial({ color: '#d22a1f', roughness: 0.45 }),
    plate: new THREE.MeshStandardMaterial({ map: plate, roughness: 0.5, side: THREE.DoubleSide }),
    dial: new THREE.MeshStandardMaterial({ map: dial, emissive: '#ffffff', emissiveMap: dial, emissiveIntensity: 0.2, roughness: 0.2 }),
  };
}
const M = () => (mats ??= makeMats());

/** Side-profile panel: a 2D (z, y) outline extruded `width` across x, centred, softly bevelled. */
function profilePanel(points: [number, number][], width: number, bevel = 0.02) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
/** Smooth outline through control points (closed). */
function smooth(points: [number, number][], n = 48): [number, number][] {
  const curve = new THREE.CatmullRomCurve3(points.map(([z, y]) => new THREE.Vector3(z, y, 0)), true, 'centripetal');
  return curve.getPoints(n).slice(0, -1).map((p) => [p.x, p.y]);
}

/** Five-spoke alloy wheel with tyre, rim and hub (axis along x). */
function Wheel({ disc = false }: { disc?: boolean }) {
  const m = M();
  const spokes = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2), []);
  return <group>
    <mesh material={m.tyre} rotation={[0, Math.PI / 2, 0]} castShadow><torusGeometry args={[WHEEL_R - 0.043, 0.043, 14, 40]} /></mesh>
    {/* tread blocks */}
    {Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; return <mesh key={i} material={m.tyre} position={[0, Math.sin(a) * (WHEEL_R - 0.004), Math.cos(a) * (WHEEL_R - 0.004)]} rotation={[a, 0, 0]}><boxGeometry args={[0.05, 0.008, 0.016]} /></mesh>; })}
    <mesh material={m.alloy} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.2, 0.011, 8, 40]} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} material={m.alloy} position={[s * 0.022, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.2, 0.008, 6, 40]} /></mesh>)}
    <mesh material={m.black} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.198, 0.198, 0.04, 40, 1, true]} /></mesh>
    <mesh material={m.alloy} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.048, 0.048, 0.11, 18]} /></mesh>
    {spokes.map((a) => <group key={a} rotation={[a, 0, 0]}>
      <mesh material={m.alloy} position={[0, 0.125, 0]}><boxGeometry args={[0.022, 0.155, 0.02]} /></mesh>
      <mesh material={m.alloy} position={[0, 0.125, 0.012]} rotation={[0.25, 0, 0]}><boxGeometry args={[0.016, 0.15, 0.012]} /></mesh>
    </group>)}
    {disc
      ? <><mesh material={m.chrome} position={[-0.045, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.11, 0.11, 0.004, 32]} /></mesh>
        <mesh material={m.black} position={[-0.055, 0.08, 0.06]}><boxGeometry args={[0.03, 0.06, 0.05]} /></mesh></>
      : <mesh material={m.engine} position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.075, 0.075, 0.03, 24]} /></mesh>}
  </group>;
}

/** Coil-over rear shock between two points. */
function Shock({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const m = M();
  const len = from.distanceTo(to);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()), [from, to]);
  return <group position={from.clone().add(to).multiplyScalar(0.5)} quaternion={q}>
    <mesh material={m.chrome}><cylinderGeometry args={[0.012, 0.012, len, 8]} /></mesh>
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} material={m.red} position={[0, -len * 0.32 + i * len * 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.024, 0.006, 6, 14]} /></mesh>)}
    <mesh material={m.black} position={[0, len * 0.4, 0]}><cylinderGeometry args={[0.022, 0.022, len * 0.2, 10]} /></mesh>
  </group>;
}

export type BikePose = { position: THREE.Vector3; heading: number; steer: number; lean: number; wheel: number; riding: boolean };

export function ScooterModel({ pose }: { pose: BikePose }) {
  const m = M();
  const root = useRef<THREE.Group>(null);
  const steerGroup = useRef<THREE.Group>(null);
  const front = useRef<THREE.Group>(null);
  const rear = useRef<THREE.Group>(null);
  const stand = useRef<THREE.Group>(null);
  const geo = useMemo(() => ({
    nose: profilePanel(smooth([[0.4, 0.34], [0.52, 0.44], [0.57, 0.63], [0.56, 0.84], [0.5, 0.94], [0.42, 0.9], [0.43, 0.66], [0.36, 0.46]]), 0.22, 0.025),
    shield: profilePanel(smooth([[0.3, 0.3], [0.39, 0.4], [0.44, 0.64], [0.44, 0.84], [0.4, 0.86], [0.38, 0.64], [0.33, 0.42], [0.26, 0.33]]), 0.44, 0.015),
    tunnel: profilePanel(smooth([[0.38, 0.74], [0.3, 0.52], [0.24, 0.36], [0.14, 0.33], [0.2, 0.42], [0.3, 0.66]]), 0.12, 0.02),
    rear: profilePanel(smooth([[0.0, 0.36], [-0.02, 0.56], [-0.16, 0.7], [-0.5, 0.72], [-0.78, 0.68], [-0.9, 0.6], [-0.78, 0.52], [-0.45, 0.47], [-0.18, 0.38]]), 0.3, 0.035),
    lower: profilePanel(smooth([[0.06, 0.24], [0.02, 0.38], [-0.18, 0.4], [-0.38, 0.44], [-0.42, 0.36], [-0.25, 0.25], [-0.05, 0.2]]), 0.24, 0.02),
    frame: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([HEAD.clone().add(new THREE.Vector3(0, -0.05, -0.02)), new THREE.Vector3(0, 0.55, 0.36), new THREE.Vector3(0, 0.34, 0.22), new THREE.Vector3(0, 0.33, 0.0), new THREE.Vector3(0, 0.4, -0.15)]), 30, 0.03, 10),
    pipe: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.2, 0.2), new THREE.Vector3(0.07, 0.12, 0.12), new THREE.Vector3(0.15, 0.13, -0.08), new THREE.Vector3(0.17, 0.24, -0.36)]), 30, 0.021, 10),
    mirrorStem: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, 0.1, 0), new THREE.Vector3(0.07, 0.2, -0.02)]), 12, 0.006, 6),
  }), []);
  useFrame(() => {
    if (!root.current) return;
    root.current.position.copy(pose.position);
    root.current.rotation.set(0, pose.heading, pose.lean, 'YXZ');
    if (steerGroup.current) steerGroup.current.rotation.y = pose.steer;
    if (front.current) front.current.rotation.x = pose.wheel;
    if (rear.current) rear.current.rotation.x = pose.wheel;
    if (stand.current) stand.current.visible = !pose.riding && Math.abs(pose.lean) < 0.01;
  });
  const shockL = useMemo(() => [new THREE.Vector3(0.115, 0.31, -0.56), new THREE.Vector3(0.125, 0.64, -0.46)] as const, []);
  return <group ref={root}>
    {/* rear wheel on the swing-arm */}
    <group ref={rear} position={[0, WHEEL_R, REAR_Z]}><Wheel /></group>
    {[-1, 1].map((s) => <mesh key={`sa${s}`} material={m.black} position={[s * 0.085, 0.28, (REAR_Z - 0.12) / 2]} rotation={[-0.02, 0, 0]}><boxGeometry args={[0.03, 0.05, Math.abs(REAR_Z + 0.12) + 0.06]} /></mesh>)}
    <mesh material={m.black} position={[-0.105, 0.3, -0.36]}><boxGeometry args={[0.025, 0.09, 0.5]} /></mesh>
    {[-1, 1].map((s) => <Shock key={`sh${s}`} from={new THREE.Vector3(s * shockL[0].x, shockL[0].y, shockL[0].z)} to={new THREE.Vector3(s * shockL[1].x, shockL[1].y, shockL[1].z)} />)}
    {/* rear fender, tail light, indicators, plate */}
    <mesh material={m.black} position={[0, WHEEL_R, REAR_Z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.32, 0.32, 0.13, 24, 1, true, Math.PI * 0.42, Math.PI * 0.66]} /></mesh>
    <mesh material={m.tail} position={[0, 0.63, -0.9]} rotation={[0.35, 0, 0]}><boxGeometry args={[0.15, 0.055, 0.04]} /></mesh>
    {[-1, 1].map((s) => <mesh key={`ti${s}`} material={m.amber} position={[s * 0.12, 0.6, -0.88]}><sphereGeometry args={[0.022, 10, 8]} /></mesh>)}
    <mesh material={m.plate} position={[0, 0.47, -0.93]} rotation={[0.35, Math.PI, 0]}><planeGeometry args={[0.19, 0.12]} /></mesh>
    {/* body panels */}
    <mesh geometry={geo.rear} material={m.red} castShadow />
    <mesh geometry={geo.lower} material={m.matte} castShadow />
    <mesh geometry={geo.shield} material={m.black} castShadow />
    <mesh geometry={geo.tunnel} material={m.red} castShadow />
    <mesh geometry={geo.frame} material={m.black} />
    {/* black trim stripe along the side panels */}
    {[-1, 1].map((s) => <mesh key={`st${s}`} material={m.black} position={[s * 0.152, 0.6, -0.42]} rotation={[0.06, 0, 0]}><boxGeometry args={[0.006, 0.03, 0.62]} /></mesh>)}
    {/* step-through floor with rubber ribs */}
    <mesh material={m.matte} position={[0, 0.31, 0.13]} castShadow><boxGeometry args={[0.28, 0.03, 0.34]} /></mesh>
    {Array.from({ length: 6 }, (_, i) => <mesh key={`fr${i}`} material={m.black} position={[0, 0.327, 0.0 + i * 0.05]}><boxGeometry args={[0.26, 0.006, 0.012]} /></mesh>)}
    {/* long seat */}
    <mesh material={m.seat} position={[0, 0.755, -0.38]} rotation={[Math.PI / 2, 0, 0]} scale={[1.18, 1, 0.55]} castShadow><capsuleGeometry args={[0.125, 0.5, 8, 16]} /></mesh>
    {/* rear rack and grab rail */}
    {[-1, 1].map((s) => <mesh key={`rk${s}`} material={m.alloy} position={[s * 0.12, 0.79, -0.72]}><boxGeometry args={[0.018, 0.018, 0.34]} /></mesh>)}
    {[-0.58, -0.72, -0.86].map((z) => <mesh key={`rb${z}`} material={m.alloy} position={[0, 0.79, z]}><boxGeometry args={[0.26, 0.014, 0.014]} /></mesh>)}
    {/* insulated delivery box */}
    <group position={[0, 0.8 + 0.215, -0.73]}>
      <RoundedBox args={[0.44, 0.43, 0.42]} radius={0.04} smoothness={4} material={m.box} castShadow />
      <mesh position={[0, 0.16, 0]} material={m.black}><boxGeometry args={[0.452, 0.012, 0.432]} /></mesh>
      <mesh position={[0, 0.1, -0.215]} material={m.chrome}><boxGeometry args={[0.07, 0.03, 0.012]} /></mesh>
    </group>
    {/* engine: crankcase, finned cylinder angled forward, carburettor, kick lever */}
    <RoundedBox args={[0.25, 0.22, 0.32]} radius={0.04} smoothness={3} position={[0, 0.25, -0.08]} material={m.engine} castShadow />
    <group position={[0, 0.27, 0.12]} rotation={[1.25, 0, 0]}>
      <mesh material={m.engine}><cylinderGeometry args={[0.055, 0.06, 0.14, 16]} /></mesh>
      {Array.from({ length: 6 }, (_, i) => <mesh key={`fn${i}`} material={m.engine} position={[0, -0.05 + i * 0.022, 0]}><boxGeometry args={[0.15, 0.008, 0.13]} /></mesh>)}
    </group>
    <mesh material={m.engine} position={[0.08, 0.36, 0.0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.03, 0.08, 12]} /></mesh>
    <mesh material={m.chrome} position={[0.14, 0.24, -0.16]} rotation={[0.9, 0, 0]}><boxGeometry args={[0.015, 0.16, 0.02]} /></mesh>
    {/* exhaust with muffler and chrome heat shield */}
    <mesh geometry={geo.pipe} material={m.exhaust} />
    <mesh material={m.exhaust} position={[0.17, 0.29, -0.55]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.05, 0.045, 0.36, 18]} /></mesh>
    <mesh material={m.chrome} position={[0.185, 0.3, -0.52]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.058, 0.058, 0.24, 18, 1, true, -Math.PI * 0.15, Math.PI * 0.8]} /></mesh>
    <mesh material={m.chrome} position={[0.17, 0.29, -0.74]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.02, 0.02, 0.04, 10]} /></mesh>
    {/* foot pegs: rider (folded into the floor) and passenger */}
    {[-1, 1].map((s) => <mesh key={`pp${s}`} material={m.matte} position={[s * 0.19, 0.31, -0.36]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.014, 0.014, 0.09, 8]} /></mesh>)}
    {/* side stand */}
    <group ref={stand} position={[0.11, 0.25, -0.08]} rotation={[0, 0, 0.45]}><mesh material={m.black} position={[0, -0.12, 0]}><cylinderGeometry args={[0.01, 0.012, 0.26, 6]} /></mesh></group>

    {/* ---- steering assembly: rotates about the raked steering axis */}
    <group position={HEAD.toArray()} rotation={[-RAKE, 0, 0]}>
      <group ref={steerGroup}>
        {/* fork legs: black dust covers over chrome stanchions */}
        {[-1, 1].map((s) => <group key={`fk${s}`} position={[s * 0.075, 0, 0]}>
          <mesh material={m.chrome} position={[0, -FORK_LEN * 0.3, 0]}><cylinderGeometry args={[0.016, 0.016, FORK_LEN * 0.6, 10]} /></mesh>
          <mesh material={m.alloy} position={[0, -FORK_LEN * 0.78, 0]}><cylinderGeometry args={[0.024, 0.022, FORK_LEN * 0.44, 10]} /></mesh>
        </group>)}
        <mesh material={m.black} position={[0, -0.04, 0]}><boxGeometry args={[0.2, 0.035, 0.06]} /></mesh>
        <group ref={front} position={[0, -FORK_LEN, 0]}><Wheel disc /></group>
        {/* front fender */}
        <mesh material={m.red} position={[0, -FORK_LEN, 0]} rotation={[RAKE, 0, Math.PI / 2]}><cylinderGeometry args={[0.31, 0.31, 0.12, 24, 1, true, Math.PI * 0.15, Math.PI * 0.62]} /></mesh>
        {/* nose cowl wrapping the head, with headlight, indicators */}
        <group rotation={[RAKE, 0, 0]} position={[0, 0, 0]}>
          <mesh geometry={geo.nose} material={m.red} position={[0, -HEAD.y, -HEAD.z]} castShadow />
          <mesh material={m.lens} position={[0, -0.04, 0.115]} rotation={[0.25, 0, 0]} scale={[1.5, 1, 0.6]}><sphereGeometry args={[0.05, 18, 12]} /></mesh>
          {[-1, 1].map((s) => <mesh key={`fi${s}`} material={m.amber} position={[s * 0.105, 0.0, 0.06]}><sphereGeometry args={[0.02, 10, 8]} /></mesh>)}
        </group>
        {/* handlebar, grips, levers, switchgear */}
        <group position={BAR.toArray()} rotation={[RAKE, 0, 0]}>
          <mesh material={m.chrome} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.011, 0.011, 0.56, 10]} /></mesh>
          {[-1, 1].map((s) => <group key={`gr${s}`}>
            <mesh material={m.matte} position={[s * 0.31, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.017, 0.016, 0.11, 12]} /></mesh>
            <mesh material={m.alloy} position={[s * 0.26, -0.005, 0.045]} rotation={[0, s * 0.25, 0]}><boxGeometry args={[0.12, 0.008, 0.016]} /></mesh>
            <mesh material={m.black} position={[s * 0.22, 0.005, 0]}><boxGeometry args={[0.04, 0.035, 0.04]} /></mesh>
            {/* round mirror on a stalk */}
            <group position={[s * 0.19, 0.01, -0.01]} scale={[s, 1, 1]}>
              <mesh geometry={geo.mirrorStem} material={m.black} />
              <group position={[0.07, 0.21, -0.02]}>
                <mesh material={m.black} rotation={[Math.PI / 2 - 0.15, 0, 0]}><cylinderGeometry args={[0.055, 0.055, 0.02, 20]} /></mesh>
                <mesh material={m.mirror} position={[0, 0, -0.011]} rotation={[-0.15, 0, 0]}><circleGeometry args={[0.05, 20]} /></mesh>
              </group>
            </group>
          </group>)}
          {/* handlebar cover and speedometer */}
          <RoundedBox args={[0.3, 0.07, 0.13]} radius={0.03} smoothness={3} position={[0, 0.03, 0.01]} material={m.red} />
          <mesh material={m.dial} position={[0, 0.067, -0.01]} rotation={[-Math.PI / 2 + 0.4, 0, 0]}><circleGeometry args={[0.045, 24]} /></mesh>
        </group>
      </group>
    </group>
  </group>;
}
