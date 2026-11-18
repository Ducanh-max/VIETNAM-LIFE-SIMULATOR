import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { bridgeEnds, centerOf, shore, type Point } from './geo';
import type { TimeOfDay } from './Landscape';

type Building = { x: number; z: number; yaw: number; width: number; depth: number; floors: number; detailed: boolean; index: number };
const center = centerOf(shore);

function makeBuildings(): Building[] {
  const placements: Building[] = [];
  let walked = 0;
  let next = 0;
  for (let i = 0; i < shore.length - 1; i++) {
    const a = shore[i];
    const b = shore[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= walked + length) {
      if (next >= walked) {
        const t = (next - walked) / length;
        const sx = THREE.MathUtils.lerp(a[0], b[0], t);
        const sz = THREE.MathUtils.lerp(a[1], b[1], t);
        const rx = sx - center[0];
        const rz = sz - center[1];
        const radius = Math.hypot(rx, rz);
        const ox = rx / radius;
        const oz = rz / radius;
        const distanceToBridge = Math.hypot(sx - bridgeEnds[0][0], sz - bridgeEnds[0][1]);
        const detailed = distanceToBridge < 170 || (sx > 42 && sz < 60 && sz > -205);
        const index = placements.length;
        placements.push({ x: sx + ox * 37, z: sz + oz * 37, yaw: Math.atan2(-ox, -oz),
          width: 8.4 + (index * 3 % 5) * 0.55, depth: 11.5 + (index * 7 % 4) * 1.05,
          floors: 2 + (index * 5 % 4), detailed, index });
      }
      next += 15.5;
    }
    walked += length;
  }
  return placements;
}

export const buildings = makeBuildings();

export function isBuildingCollision(point: Point): boolean {
  for (const building of buildings) {
    const dx = point[0] - building.x;
    const dz = point[1] - building.z;
    if (dx * dx + dz * dz > 380) continue;
    const c = Math.cos(building.yaw);
    const s = Math.sin(building.yaw);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    if (Math.abs(localX) < building.width / 2 + 0.4 && Math.abs(localZ) < building.depth / 2 + 0.4) return true;
  }
  return false;
}

const palette = ['#c6b69c', '#d0c4af', '#d9c7b0', '#b9c3b8', '#d3b8a7', '#b9b6a8', '#c7c0af'];
const signs = [
  ['CÀ PHÊ HỒ GƯƠM', '#7c3e27'], ['BÚN CHẢ HÀ NỘI', '#9b382b'], ['TIỆM SÁCH PHỐ CỔ', '#304e45'],
  ['PHỞ GÀ 36', '#80522b'], ['TRÀ SEN TÂY HỒ', '#4d624a'], ['BÁNH MÌ HÀ NỘI', '#bd6c35'],
  ['GỐM & QUÀ VIỆT', '#3c5662'], ['HIỆU ẢNH BỜ HỒ', '#6f3b43'],
];
const signCache = new Map<string, THREE.CanvasTexture>();

function signTexture(label: string, background: string): THREE.CanvasTexture {
  const cached = signCache.get(label);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#d9ba7d';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#f8edcd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 38px "Be Vietnam Pro", Arial';
  ctx.fillText(label, 256, 64, 478);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  signCache.set(label, texture);
  return texture;
}

function BuildingShells() {
  const walls = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    buildings.forEach((building, index) => {
      const height = building.floors * 3.35 + 1;
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), building.yaw);
      position.set(building.x, height / 2, building.z);
      scale.set(building.width, height, building.depth);
      matrix.compose(position, rotation, scale);
      walls.current?.setMatrixAt(index, matrix);
      walls.current?.setColorAt(index, new THREE.Color(palette[index % palette.length]));
      position.y = height + 0.13;
      scale.set(building.width + 0.35, 0.26, building.depth + 0.45);
      matrix.compose(position, rotation, scale);
      roofs.current?.setMatrixAt(index, matrix);
    });
    if (walls.current) {
      walls.current.instanceMatrix.needsUpdate = true;
      if (walls.current.instanceColor) walls.current.instanceColor.needsUpdate = true;
      walls.current.computeBoundingSphere();
    }
    if (roofs.current) {
      roofs.current.instanceMatrix.needsUpdate = true;
      roofs.current.computeBoundingSphere();
    }
  }, []);
  return <>
    <instancedMesh ref={walls} args={[undefined, undefined, buildings.length]} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ffffff" roughness={0.86} /></instancedMesh>
    <instancedMesh ref={roofs} args={[undefined, undefined, buildings.length]} castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#776d60" roughness={0.88} /></instancedMesh>
  </>;
}

function ShopHouse({ building, time }: { building: Building; time: TimeOfDay }) {
  const { x, z, yaw, width, depth, floors, detailed, index } = building;
  const height = floors * 3.35 + 1;
  const wallColor = palette[index % palette.length];
  const variant = index % 7;
  const sign = signs[index % signs.length];
  const signMap = useMemo(() => signTexture(sign[0], sign[1]), [sign]);
  const glass = time === 'night' ? '#c8a375' : '#476267';
  const detailedFacade = useRef<THREE.Group>(null);
  const simpleFacade = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const near = detailed && (camera.position.x - x) ** 2 + (camera.position.z - z) ** 2 < 125 ** 2;
    if (detailedFacade.current) detailedFacade.current.visible = near;
    if (simpleFacade.current) simpleFacade.current.visible = !near;
  });
  return <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
    {variant % 3 === 0 ? <>
      <mesh position={[0, height + 0.63, depth / 2 - 0.25]} castShadow><boxGeometry args={[width + 0.4, 0.84, 0.35]} /><meshStandardMaterial color={wallColor} roughness={0.9} /></mesh>
      <mesh position={[0, height + 0.63, -depth / 2 + 0.25]} castShadow><boxGeometry args={[width + 0.4, 0.84, 0.35]} /><meshStandardMaterial color={wallColor} roughness={0.9} /></mesh>
    </> : <mesh position={[variant % 2 ? -width * 0.18 : width * 0.16, height + 0.71, -depth * 0.12]} castShadow><boxGeometry args={[width * 0.42, 1.15, depth * 0.38]} /><meshStandardMaterial color={wallColor} roughness={0.9} /></mesh>}
    <mesh position={[0, 1.45, depth / 2 + 0.07]}><boxGeometry args={[width - 0.5, 2.7, 0.11]} /><meshStandardMaterial color={glass} metalness={0.25} roughness={0.27} emissive={time === 'night' ? '#6e4629' : '#000000'} emissiveIntensity={time === 'night' ? 0.5 : 0} /></mesh>
    <mesh position={[0, 1.45, depth / 2 + 0.17]}><boxGeometry args={[0.11, 2.7, 0.11]} /><meshStandardMaterial color="#d5c9ae" roughness={0.8} /></mesh>
    <mesh position={[0, 1.45, depth / 2 + 0.19]}><boxGeometry args={[width - 0.6, 0.1, 0.1]} /><meshStandardMaterial color="#d5c9ae" roughness={0.8} /></mesh>
    <mesh position={[0, 3.3, depth / 2 + 0.17]}><planeGeometry args={[width - 0.25, 1.12]} /><meshBasicMaterial map={signMap} side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 3.87, depth / 2 + 0.26]} castShadow><boxGeometry args={[width + 0.45, 0.12, 0.55]} /><meshStandardMaterial color="#6f5142" roughness={0.84} /></mesh>
    <mesh position={[0, 2.18, depth / 2 + 1.18]} rotation={[0.16, 0, 0]} castShadow><boxGeometry args={[width + 0.45, 0.09, 2.1]} /><meshStandardMaterial color={sign[1]} roughness={0.78} /></mesh>
    {detailed && <group ref={detailedFacade}>
      {Array.from({ length: floors - 1 }, (_, floor) => <group key={floor} position={[0, 4.05 + floor * 3.25, depth / 2 + 0.11]}>
        {[-width * 0.23, width * 0.23].map((wx) => <group key={wx} position={[wx, 0, 0]}>
          <mesh position={[0, 0, 0.03]}><boxGeometry args={[width * 0.3, 2.2, 0.1]} /><meshStandardMaterial color={glass} metalness={0.26} roughness={0.22} emissive={time === 'night' && (floor + index) % 3 === 0 ? '#ab7245' : '#000000'} emissiveIntensity={0.55} /></mesh>
          <mesh position={[0, 0, 0.12]}><boxGeometry args={[0.08, 2.18, 0.11]} /><meshStandardMaterial color="#ebe2cf" /></mesh>
          <mesh position={[0, 0, 0.12]}><boxGeometry args={[width * 0.3, 0.08, 0.11]} /><meshStandardMaterial color="#ebe2cf" /></mesh>
          {variant === 2 || variant === 5 ? <mesh position={[0, 0, 0.2]}><boxGeometry args={[width * 0.3 + 0.22, 2.32, 0.12]} /><meshStandardMaterial color="#875e46" roughness={0.8} wireframe /></mesh> : null}
        </group>)}
        {variant !== 1 && <>
          <mesh position={[0, -1.28, 0.65]} castShadow><boxGeometry args={[width - 0.2, 0.16, 1.35]} /><meshStandardMaterial color="#a49b85" roughness={0.9} /></mesh>
          <mesh position={[0, -0.66, 1.3]}><boxGeometry args={[width - 0.3, 0.95, 0.09]} /><meshStandardMaterial color={variant % 2 ? '#776b5a' : '#4e625c'} roughness={0.62} metalness={0.18} wireframe /></mesh>
        </>}
        {variant === 3 && <mesh position={[0, 1.28, 0.3]} castShadow><boxGeometry args={[width + 0.45, 0.18, 0.7]} /><meshStandardMaterial color="#e2d9c5" roughness={0.9} /></mesh>}
      </group>)}
      {variant % 2 === 0 && <>
        <mesh position={[width / 2 - 1.45, 5.25, depth / 2 + 0.45]} castShadow><boxGeometry args={[1.45, 0.75, 0.75]} /><meshStandardMaterial color="#dad8cd" roughness={0.75} /></mesh>
        <mesh position={[width / 2 - 1.45, 5.25, depth / 2 + 0.85]}><circleGeometry args={[0.28, 12]} /><meshStandardMaterial color="#889690" /></mesh>
      </>}
    </group>}
    <group ref={simpleFacade}>
      {Array.from({ length: floors - 1 }, (_, floor) => <group key={floor} position={[0, 5 + floor * 3.2, depth / 2 + 0.08]}>
        <mesh><boxGeometry args={[width - 1.5, 1.8, 0.08]} /><meshStandardMaterial color={glass} roughness={0.28} metalness={0.2} /></mesh>
        <mesh position={[0, 0, 0.09]}><boxGeometry args={[0.12, 1.85, 0.1]} /><meshStandardMaterial color="#ddd4c2" roughness={0.85} /></mesh>
        <mesh position={[0, 0.95, 0.09]}><boxGeometry args={[width - 1.35, 0.14, 0.15]} /><meshStandardMaterial color={variant % 2 ? '#8c705b' : '#e5d8c3'} roughness={0.85} /></mesh>
        <mesh position={[0, -1.07, 0.22]}><boxGeometry args={[width - 0.6, 0.14, 0.45]} /><meshStandardMaterial color="#a29c8d" roughness={0.9} /></mesh>
        {variant % 3 === 1 && <>
          <mesh position={[0, -1.06, 0.58]} castShadow><boxGeometry args={[width - 0.45, 0.17, 0.98]} /><meshStandardMaterial color="#938d7d" roughness={0.9} /></mesh>
          <mesh position={[0, -0.66, 1.03]}><boxGeometry args={[width - 0.7, 0.75, 0.07]} /><meshStandardMaterial color="#58615b" roughness={0.75} metalness={0.15} wireframe /></mesh>
        </>}
      </group>)}
    </group>
  </group>;
}

function StreetVehicle({ position, rotation = 0, car = false }: { position: [number, number, number]; rotation?: number; car?: boolean }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    {car ? <>
      <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[1.7, 0.7, 3.4]} /><meshStandardMaterial color="#d9d5c9" metalness={0.45} roughness={0.35} /></mesh>
      <mesh position={[0, 1.22, -0.12]} castShadow><boxGeometry args={[1.5, 0.7, 1.8]} /><meshStandardMaterial color="#4f686c" metalness={0.22} roughness={0.25} /></mesh>
      {[-1.1, 1.1].map((z) => [-0.78, 0.78].map((x) => <mesh key={`${z}-${x}`} position={[x, 0.42, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.36, 0.36, 0.16, 12]} /><meshStandardMaterial color="#222725" /></mesh>))}
    </> : <>
      {[-0.95, 0.95].map((z) => <mesh key={z} position={[0, 0.42, z]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.4, 0.09, 8, 16]} /><meshStandardMaterial color="#252a29" roughness={0.75} /></mesh>)}
      <mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[0.55, 0.27, 1.5]} /><meshStandardMaterial color="#a62f27" metalness={0.4} roughness={0.38} /></mesh>
      <mesh position={[0, 1.02, -0.3]}><boxGeometry args={[0.48, 0.14, 0.7]} /><meshStandardMaterial color="#292a27" /></mesh>
      <mesh position={[0, 1.2, 0.75]} rotation={[0.3, 0, 0]}><boxGeometry args={[0.5, 0.08, 0.12]} /><meshStandardMaterial color="#a9aaa3" metalness={0.55} /></mesh>
    </>}
  </group>;
}

function Pedestrian({ position, color }: { position: [number, number, number]; color: string }) {
  return <group position={position}>
    <mesh position={[0, 2.05, 0]} castShadow><sphereGeometry args={[0.21, 8, 8]} /><meshStandardMaterial color="#b78b6a" /></mesh>
    <mesh position={[0, 1.4, 0]} castShadow><capsuleGeometry args={[0.29, 0.6, 4, 8]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
    {[-0.16, 0.16].map((x) => <mesh key={x} position={[x, 0.52, 0]} castShadow><cylinderGeometry args={[0.08, 0.1, 1.05, 6]} /><meshStandardMaterial color="#333b3b" /></mesh>)}
  </group>;
}

export function Urban({ time }: { time: TimeOfDay }) {
  const shoreStart = bridgeEnds[0];
  return <>
    <BuildingShells />
    {buildings.map((building) => <ShopHouse key={building.index} building={building} time={time} />)}
    {Array.from({ length: 12 }, (_, i) => {
      const z = shoreStart[1] + (i - 5) * 13;
      const x = 110 + Math.sin(i * 0.7) * 7;
      return <StreetVehicle key={i} position={[x, 0.32, z]} rotation={Math.PI / 2 + (i % 3 - 1) * 0.05} car={i % 4 === 0} />;
    })}
    {Array.from({ length: 12 }, (_, i) => <Pedestrian key={i} position={[shoreStart[0] + 6 + (i * 17 % 37), 0.28, shoreStart[1] + (i - 6) * 9]} color={['#a34b38', '#d0ba93', '#3b6063', '#657256'][i % 4]} />)}
    {Array.from({ length: 9 }, (_, i) => <mesh key={`zebra-${i}`} position={[shoreStart[0] + 16 + i * 1.8, 0.16, shoreStart[1] - 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.0, 5.5]} /><meshBasicMaterial color="#e5e2d4" /></mesh>)}
  </>;
}
