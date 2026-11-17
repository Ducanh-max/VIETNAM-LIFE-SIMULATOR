import { useMemo } from 'react';
import * as THREE from 'three';
import { bridgeEnds, templeCenter, turtleCenter, type Point } from './geo';
import type { TimeOfDay } from './Landscape';

const limestone = new THREE.MeshStandardMaterial({ color: '#c5baa0', roughness: 0.92 });
const agedStone = new THREE.MeshStandardMaterial({ color: '#9a927c', roughness: 0.98 });
const darkOpening = new THREE.MeshStandardMaterial({ color: '#41433b', roughness: 0.95 });
const redPaint = new THREE.MeshStandardMaterial({ color: '#a9231c', roughness: 0.52, metalness: 0.05 });
const roofTile = new THREE.MeshStandardMaterial({ color: '#6f3d32', roughness: 0.86 });
const templeWall = new THREE.MeshStandardMaterial({ color: '#d7c39d', roughness: 0.9 });
const timber = new THREE.MeshStandardMaterial({ color: '#643d31', roughness: 0.7 });

function archWallGeometry(width: number, height: number, openings: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  const bayWidth = width / openings;
  for (let index = 0; index < openings; index++) {
    const center = -width / 2 + bayWidth * (index + 0.5);
    const half = bayWidth * 0.31;
    const bottom = 0.28;
    const spring = height * 0.62;
    const top = height * 0.84;
    const hole = new THREE.Path();
    hole.moveTo(center - half, bottom);
    hole.lineTo(center + half, bottom);
    hole.lineTo(center + half, spring);
    hole.quadraticCurveTo(center + half, top, center, top);
    hole.quadraticCurveTo(center - half, top, center - half, spring);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 1, curveSegments: 8 });
  geometry.computeVertexNormals();
  return geometry;
}

function TowerTier({ width, depth, height, y, openings }: { width: number; depth: number; height: number; y: number; openings: number }) {
  const front = useMemo(() => archWallGeometry(width, height, openings), [width, height, openings]);
  const side = useMemo(() => archWallGeometry(depth, height, Math.max(1, openings - 1)), [depth, height, openings]);
  return <group position={[0, y, 0]}>
    <mesh geometry={front} material={limestone} castShadow receiveShadow position={[0, 0, depth / 2 - 0.2]} />
    <mesh geometry={front} material={limestone} castShadow receiveShadow position={[0, 0, -depth / 2 + 0.2]} rotation={[0, Math.PI, 0]} />
    <mesh geometry={side} material={limestone} castShadow receiveShadow position={[width / 2 - 0.2, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
    <mesh geometry={side} material={limestone} castShadow receiveShadow position={[-width / 2 + 0.2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
    <mesh position={[0, height * 0.46, 0]} castShadow><boxGeometry args={[width - 0.7, height * 0.5, depth - 0.7]} /><primitive object={darkOpening} attach="material" /></mesh>
    <mesh position={[0, height + 0.06, 0]} castShadow receiveShadow><boxGeometry args={[width + 0.65, 0.34, depth + 0.65]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[0, height + 0.27, 0]} castShadow><boxGeometry args={[width + 0.3, 0.15, depth + 0.3]} /><primitive object={limestone} attach="material" /></mesh>
    {[-1, 1].map((sideSign) => [-1, 1].map((other) => <mesh key={`${sideSign}-${other}`} position={[sideSign * (width / 2 - 0.08), height / 2, other * (depth / 2 - 0.08)]} castShadow><boxGeometry args={[0.25, height, 0.25]} /><primitive object={agedStone} attach="material" /></mesh>))}
  </group>;
}

export function TurtleTower({ time }: { time: TimeOfDay }) {
  const [x, z] = turtleCenter;
  return <group position={[x, 0.32, z]}>
    <mesh position={[0, 0.55, 0]} castShadow receiveShadow><boxGeometry args={[17.5, 1.1, 12.8]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[0, 1.18, 0]} castShadow receiveShadow><boxGeometry args={[16.5, 0.18, 11.8]} /><primitive object={limestone} attach="material" /></mesh>
    <TowerTier width={14.8} depth={9.8} height={3.5} y={1.28} openings={3} />
    <TowerTier width={11.4} depth={7.4} height={3.05} y={5.15} openings={3} />
    <TowerTier width={7.3} depth={4.9} height={2.65} y={8.55} openings={2} />
    <mesh position={[0, 11.65, 0]} castShadow><boxGeometry args={[8, 0.38, 5.7]} /><primitive object={agedStone} attach="material" /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} position={[sign * 3.35, 12.1, 0]} castShadow><boxGeometry args={[0.55, 0.7, 5.4]} /><primitive object={limestone} attach="material" /></mesh>)}
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, 12.1, sign * 2.3]} castShadow><boxGeometry args={[7.2, 0.7, 0.48]} /><primitive object={limestone} attach="material" /></mesh>)}
    <mesh position={[0, 12.85, 0]} castShadow><cylinderGeometry args={[0.42, 0.66, 1.1, 8]} /><primitive object={agedStone} attach="material" /></mesh>
    {time !== 'day' && <pointLight position={[1, 6, 3]} color="#ffd09b" intensity={time === 'night' ? 34 : 16} distance={34} decay={2} />}
  </group>;
}

function Beam({ from, to, radius, material }: { from: THREE.Vector3; to: THREE.Vector3; radius: number; material: THREE.Material }) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const middle = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return <mesh position={middle} quaternion={quaternion} castShadow><cylinderGeometry args={[radius, radius, direction.length(), 7]} /><primitive object={material} attach="material" /></mesh>;
}

export function TheHucBridge() {
  const [start, end] = bridgeEnds;
  const posts = Array.from({ length: 16 }, (_, i) => {
    const t = i / 15;
    return {
      x: THREE.MathUtils.lerp(start[0], end[0], t),
      z: THREE.MathUtils.lerp(start[1], end[1], t),
      y: 0.65 + Math.sin(Math.PI * t) * 1.55,
    };
  });
  const normal = new THREE.Vector2(-(end[1] - start[1]), end[0] - start[0]).normalize();
  return <group>
    {posts.slice(0, -1).map((post, i) => {
      const next = posts[i + 1];
      const center = new THREE.Vector3((post.x + next.x) / 2, (post.y + next.y) / 2, (post.z + next.z) / 2);
      const length = Math.hypot(next.x - post.x, next.z - post.z);
      const angle = -Math.atan2(next.z - post.z, next.x - post.x);
      return <group key={i}>
        <mesh position={center} rotation={[0, angle, 0]} castShadow receiveShadow><boxGeometry args={[length + 0.08, 0.18, 2.7]} /><primitive object={redPaint} attach="material" /></mesh>
        <mesh position={[center.x, center.y - 0.17, center.z]} rotation={[0, angle, 0]} castShadow><boxGeometry args={[length + 0.08, 0.22, 2.9]} /><primitive object={timber} attach="material" /></mesh>
        {[-1, 1].map((sign) => {
          const a = new THREE.Vector3(post.x + normal.x * 1.38 * sign, post.y + 1.02, post.z + normal.y * 1.38 * sign);
          const b = new THREE.Vector3(next.x + normal.x * 1.38 * sign, next.y + 1.02, next.z + normal.y * 1.38 * sign);
          return <group key={sign}>
            <Beam from={a} to={b} radius={0.105} material={redPaint} />
            <Beam from={new THREE.Vector3(a.x, a.y - 0.55, a.z)} to={new THREE.Vector3(b.x, b.y - 0.55, b.z)} radius={0.075} material={redPaint} />
          </group>;
        })}
      </group>;
    })}
    {posts.map((post, i) => [-1, 1].map((sign) => <group key={`${i}-${sign}`} position={[post.x + normal.x * 1.38 * sign, post.y, post.z + normal.y * 1.38 * sign]}>
      <mesh position={[0, 0.52, 0]} castShadow><boxGeometry args={[0.19, 1.18, 0.19]} /><primitive object={redPaint} attach="material" /></mesh>
      <mesh position={[0, 1.16, 0]} castShadow><sphereGeometry args={[0.15, 8, 6]} /><primitive object={redPaint} attach="material" /></mesh>
      {i % 3 === 0 && <mesh position={[0, -post.y / 2, 0]} castShadow><cylinderGeometry args={[0.22, 0.24, post.y, 8]} /><primitive object={redPaint} attach="material" /></mesh>}
    </group>))}
  </group>;
}

function TiledRoof({ width, depth, y }: { width: number; depth: number; y: number }) {
  const slope = Math.hypot(width / 2 + 1.1, 2.5);
  return <group>
    {[-1, 1].map((sign) => <group key={sign}>
      <mesh position={[sign * width / 4, y + 1.25, 0]} rotation={[0, 0, -sign * 0.36]} castShadow receiveShadow><boxGeometry args={[slope + 1.1, 0.22, depth + 1.9]} /><primitive object={roofTile} attach="material" /></mesh>
      {Array.from({ length: Math.floor(depth / 0.9) }, (_, i) => <mesh key={i} position={[sign * width / 4, y + 1.35, -depth / 2 + i * 0.9]} rotation={[0, 0, -sign * 0.36]}><boxGeometry args={[slope + 1.1, 0.035, 0.08]} /><meshStandardMaterial color="#9a5b45" roughness={0.9} /></mesh>)}
    </group>)}
    <mesh position={[0, y + 2.57, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.16, 0.16, depth + 2.1, 8]} /><primitive object={agedStone} attach="material" /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, y + 2.72, sign * (depth / 2 + 0.8)]} castShadow><sphereGeometry args={[0.28, 8, 8]} /><primitive object={agedStone} attach="material" /></mesh>)}
  </group>;
}

function TempleHall({ x, z, width, depth, height }: { x: number; z: number; width: number; depth: number; height: number }) {
  return <group position={[x, 0.35, z]}>
    <mesh position={[0, 0.4, 0]} castShadow receiveShadow><boxGeometry args={[width + 1.4, 0.8, depth + 1.4]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[0, 0.95 + height / 2, 0]} castShadow receiveShadow><boxGeometry args={[width, height, depth]} /><primitive object={templeWall} attach="material" /></mesh>
    {[-1, 1].map((side) => [-1, 1].map((other) => <mesh key={`${side}-${other}`} position={[side * (width / 2 - 0.45), height / 2 + 1, other * (depth / 2 + 0.1)]} castShadow><cylinderGeometry args={[0.25, 0.27, height + 0.3, 8]} /><primitive object={redPaint} attach="material" /></mesh>))}
    <mesh position={[width / 2 + 0.02, 2.1, 0]}><boxGeometry args={[0.08, 2.9, 2.7]} /><primitive object={timber} attach="material" /></mesh>
    <mesh position={[width / 2 + 0.08, 2.15, 0]}><boxGeometry args={[0.08, 2.3, 1.5]} /><primitive object={darkOpening} attach="material" /></mesh>
    <TiledRoof width={width + 0.8} depth={depth + 0.8} y={height + 0.95} />
  </group>;
}

function Gate({ position, width = 5 }: { position: [number, number, number]; width?: number }) {
  return <group position={position}>
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, 2.25, sign * width / 2]} castShadow><boxGeometry args={[0.7, 4.5, 0.7]} /><primitive object={templeWall} attach="material" /></mesh>)}
    <mesh position={[0, 4.3, 0]} castShadow><boxGeometry args={[0.8, 0.6, width + 0.9]} /><primitive object={redPaint} attach="material" /></mesh>
    <mesh position={[0, 4.6, 0]} castShadow><boxGeometry args={[1.4, 0.18, width + 1.4]} /><primitive object={roofTile} attach="material" /></mesh>
    <mesh position={[0.05, 3.4, 0]}><boxGeometry args={[0.83, 0.55, 2.3]} /><meshStandardMaterial color="#282e2a" roughness={0.85} /></mesh>
  </group>;
}

export function NgocSonTemple({ time }: { time: TimeOfDay }) {
  const [cx, cz] = templeCenter;
  const [, islandEnd] = bridgeEnds;
  const yardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b8ae93', roughness: 0.98 }), []);
  return <group>
    <mesh position={[cx - 2, 0.4, cz]} receiveShadow><boxGeometry args={[34, 0.2, 24]} /><primitive object={yardMaterial} attach="material" /></mesh>
    <TempleHall x={cx - 10} z={cz + 0.5} width={12} depth={14} height={4.3} />
    <TempleHall x={cx + 2.2} z={cz - 0.2} width={9} depth={11} height={3.7} />
    <Gate position={[islandEnd[0] - 1.4, 0.42, islandEnd[1]]} />
    {[-1, 1].map((sign) => <group key={sign} position={[cx - 3, 0.3, cz + sign * 10.6]}>
      <mesh castShadow position={[0, 1.4, 0]}><boxGeometry args={[24, 2.8, 0.32]} /><primitive object={templeWall} attach="material" /></mesh>
      <mesh castShadow position={[0, 3.0, 0]}><boxGeometry args={[25, 0.27, 0.75]} /><primitive object={roofTile} attach="material" /></mesh>
    </group>)}
    {[-1, 1].map((sign) => <group key={`planter-${sign}`} position={[cx + 7, 0.35, cz + sign * 8]}>
      <mesh position={[0, 0.4, 0]} castShadow><cylinderGeometry args={[1.55, 1.6, 0.8, 12]} /><primitive object={agedStone} attach="material" /></mesh>
      <mesh position={[0, 3.4, 0]} castShadow><cylinderGeometry args={[0.37, 0.52, 5.6, 7]} /><meshStandardMaterial color="#564631" roughness={1} /></mesh>
      <mesh position={[0, 7, 0]} castShadow><icosahedronGeometry args={[4, 1]} /><meshStandardMaterial color="#3d613e" roughness={1} flatShading /></mesh>
    </group>)}
    {time !== 'day' && <pointLight position={[cx + 1, 6, cz]} color="#ffb667" intensity={time === 'night' ? 45 : 19} distance={35} decay={2} />}
  </group>;
}

export function Landmarks({ time }: { time: TimeOfDay }) {
  return <>
    <TurtleTower time={time} />
    <TheHucBridge />
    <NgocSonTemple time={time} />
  </>;
}

export const landmarkPositions: Record<string, Point> = {
  'Tháp Rùa': turtleCenter,
  'Đền Ngọc Sơn': templeCenter,
  'Cầu Thê Húc': [(bridgeEnds[0][0] + bridgeEnds[1][0]) / 2, (bridgeEnds[0][1] + bridgeEnds[1][1]) / 2],
};
