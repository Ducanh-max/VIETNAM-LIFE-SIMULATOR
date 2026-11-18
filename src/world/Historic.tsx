import { Suspense, lazy, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { bridgeEnds, templeCenter, turtleCenter, type Point } from './geo';
import type { TimeOfDay } from './Landscape';
import { landmarkAssets } from './landmarkAssets';

const LandmarkModel = lazy(() => import('./LandmarkModel'));

const limestone = new THREE.MeshStandardMaterial({ color: '#c5baa0', roughness: 0.92 });
const agedStone = new THREE.MeshStandardMaterial({ color: '#9a927c', roughness: 0.98 });
const darkOpening = new THREE.MeshStandardMaterial({ color: '#41433b', roughness: 0.95 });
const redPaint = new THREE.MeshStandardMaterial({ color: '#a9231c', roughness: 0.52, metalness: 0.05 });
const bridgeDeckPaint = new THREE.MeshStandardMaterial({ color: '#aa3225', roughness: 0.66, side: THREE.DoubleSide });
const roofTile = new THREE.MeshStandardMaterial({ color: '#6f3d32', roughness: 0.86 });
const templeWall = new THREE.MeshStandardMaterial({ color: '#d7c39d', roughness: 0.9 });
const timber = new THREE.MeshStandardMaterial({ color: '#643d31', roughness: 0.7 });
const gold = new THREE.MeshStandardMaterial({ color: '#b69a58', metalness: 0.25, roughness: 0.55 });
const mutedRed = new THREE.MeshStandardMaterial({ color: '#813b30', roughness: 0.8 });

function weatheredStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(256, 256);
  let seed = 1509;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const grain = (random() - 0.5) * 26;
    const age = Math.sin(x * 0.045 + y * 0.018) * 7 + Math.sin(x * 0.12 - y * 0.063) * 4;
    const stain = y > 170 ? (y - 170) * 0.12 : 0;
    image.data[i] = 210 + grain + age - stain;
    image.data[i + 1] = 199 + grain + age - stain;
    image.data[i + 2] = 169 + grain + age - stain * 0.8;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.2, 0.2);
  texture.anisotropy = 4;
  return texture;
}

function plaqueTexture(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#422d23';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#b9975a';
  ctx.lineWidth = 6;
  ctx.strokeRect(9, 9, 494, 110);
  ctx.fillStyle = '#ead6a2';
  ctx.font = 'bold 42px "Be Vietnam Pro", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roofGeometry(width: number, depth: number, rise: number) {
  const columns = 16;
  const rows = 10;
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let iz = 0; iz <= rows; iz++) {
    const tz = iz / rows;
    const z = (tz - 0.5) * depth;
    for (let ix = 0; ix <= columns; ix++) {
      const tx = ix / columns;
      const x = (tx - 0.5) * width;
      const edge = Math.abs(x) / (width / 2);
      const end = Math.abs(z) / (depth / 2);
      const y = rise * (1 - edge) + 0.26 * Math.pow(edge, 8) + 0.2 * Math.pow(end, 8);
      vertices.push(x, y, z);
      uv.push(tx * 3, tz * 4);
      if (ix < columns && iz < rows) {
        const a = iz * (columns + 1) + ix;
        indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roofTilesTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#71473a';
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    const y = row * 16;
    ctx.fillStyle = row % 3 === 0 ? '#87503d' : '#805040';
    ctx.fillRect(0, y, 256, 14);
    ctx.strokeStyle = '#4b312a';
    ctx.lineWidth = 2;
    for (let x = -16; x < 272; x += 32) {
      const shift = row % 2 ? 16 : 0;
      ctx.beginPath();
      ctx.moveTo(x + shift, y);
      ctx.lineTo(x + shift, y + 15);
      ctx.stroke();
    }
    ctx.strokeStyle = '#a66a4c';
    ctx.beginPath();
    ctx.moveTo(0, y + 14);
    ctx.lineTo(256, y + 14);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

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

function TowerTier({ width, depth, height, y, openings, wall }: { width: number; depth: number; height: number; y: number; openings: number; wall: THREE.Material }) {
  const front = useMemo(() => archWallGeometry(width, height, openings), [width, height, openings]);
  const side = useMemo(() => archWallGeometry(depth, height, Math.max(1, openings - 1)), [depth, height, openings]);
  return <group position={[0, y, 0]}>
    <mesh geometry={front} material={wall} castShadow receiveShadow position={[0, 0, depth / 2 - 0.2]} />
    <mesh geometry={front} material={wall} castShadow receiveShadow position={[0, 0, -depth / 2 + 0.2]} rotation={[0, Math.PI, 0]} />
    <mesh geometry={side} material={wall} castShadow receiveShadow position={[width / 2 - 0.2, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
    <mesh geometry={side} material={wall} castShadow receiveShadow position={[-width / 2 + 0.2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
    <mesh position={[0, height * 0.46, 0]} castShadow><boxGeometry args={[width - 0.7, height * 0.5, depth - 0.7]} /><primitive object={darkOpening} attach="material" /></mesh>
    <mesh position={[0, height + 0.06, 0]} castShadow receiveShadow><boxGeometry args={[width + 0.65, 0.34, depth + 0.65]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[0, height + 0.27, 0]} castShadow><boxGeometry args={[width + 0.3, 0.15, depth + 0.3]} /><primitive object={limestone} attach="material" /></mesh>
    <mesh position={[0, height + 0.42, 0]} castShadow><boxGeometry args={[width + 0.88, 0.13, depth + 0.88]} /><primitive object={wall} attach="material" /></mesh>
    <mesh position={[0, 0.27, depth / 2 + 0.1]} castShadow><boxGeometry args={[width + 0.25, 0.2, 0.5]} /><primitive object={agedStone} attach="material" /></mesh>
    {Array.from({ length: openings - 1 }, (_, i) => <mesh key={i} position={[-width / 2 + (i + 1) * width / openings, height / 2, depth / 2 + 0.1]} castShadow><boxGeometry args={[0.23, height - 0.2, 0.24]} /><primitive object={agedStone} attach="material" /></mesh>)}
    {[-1, 1].map((sideSign) => [-1, 1].map((other) => <mesh key={`${sideSign}-${other}`} position={[sideSign * (width / 2 - 0.08), height / 2, other * (depth / 2 - 0.08)]} castShadow><boxGeometry args={[0.25, height, 0.25]} /><primitive object={agedStone} attach="material" /></mesh>))}
  </group>;
}

export function TurtleTower({ time }: { time: TimeOfDay }) {
  const [x, z] = turtleCenter;
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ map: weatheredStoneTexture(), roughness: 0.95 }), []);
  return <group position={[x, 0.32, z]}>
    <mesh position={[0, 0.48, 0]} castShadow receiveShadow><boxGeometry args={[14.2, 0.96, 10.8]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[0, 1.05, 0]} castShadow receiveShadow><boxGeometry args={[13.1, 0.22, 9.8]} /><primitive object={limestone} attach="material" /></mesh>
    <TowerTier width={11.8} depth={8.5} height={3.15} y={1.18} openings={3} wall={wall} />
    <TowerTier width={9.15} depth={6.5} height={2.8} y={4.74} openings={3} wall={wall} />
    <TowerTier width={6.55} depth={4.65} height={2.45} y={7.94} openings={2} wall={wall} />
    <mesh position={[0, 10.8, 0]} castShadow><boxGeometry args={[7.3, 0.35, 5.4]} /><primitive object={agedStone} attach="material" /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} position={[sign * 3.05, 11.22, 0]} castShadow><boxGeometry args={[0.42, 0.55, 5.1]} /><primitive object={limestone} attach="material" /></mesh>)}
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, 11.22, sign * 2.13]} castShadow><boxGeometry args={[6.2, 0.55, 0.42]} /><primitive object={limestone} attach="material" /></mesh>)}
    <mesh position={[0, 11.85, 0]} castShadow><cylinderGeometry args={[0.34, 0.55, 0.9, 8]} /><primitive object={agedStone} attach="material" /></mesh>
    {time !== 'day' && <pointLight position={[1, 6, 3]} color="#ffd09b" intensity={time === 'night' ? 34 : 16} distance={34} decay={2} />}
  </group>;
}

function Beam({ from, to, radius, material }: { from: THREE.Vector3; to: THREE.Vector3; radius: number; material: THREE.Material }) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const middle = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return <mesh position={middle} quaternion={quaternion} castShadow><cylinderGeometry args={[radius, radius, direction.length(), 7]} /><primitive object={material} attach="material" /></mesh>;
}

function bridgePoint(t: number) {
  const [start, end] = bridgeEnds;
  return new THREE.Vector3(THREE.MathUtils.lerp(start[0], end[0], t), 0.56 + Math.sin(Math.PI * t) * 1.45, THREE.MathUtils.lerp(start[1], end[1], t));
}

function bridgeDeckGeometry(normal: THREE.Vector2) {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const p = bridgePoint(i / 60);
    for (const y of [0, -0.23]) for (const sign of [-1, 1]) vertices.push(p.x + normal.x * 1.35 * sign, p.y + y, p.z + normal.y * 1.35 * sign);
    if (i < 60) {
      const a = i * 4;
      for (const [l, r] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {
        indices.push(a + l, a + 4 + l, a + r, a + r, a + 4 + l, a + 4 + r);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function TheHucBridge() {
  const [start, end] = bridgeEnds;
  const normal = useMemo(() => new THREE.Vector2(-(end[1] - start[1]), end[0] - start[0]).normalize(), [start, end]);
  const deck = useMemo(() => bridgeDeckGeometry(normal), [normal]);
  const rails = useMemo(() => [-1, 1].flatMap((sign) => [0.55, 1.03].map((height) => {
    const points = Array.from({ length: 31 }, (_, i) => {
      const p = bridgePoint(i / 30);
      return new THREE.Vector3(p.x + normal.x * 1.37 * sign, p.y + height, p.z + normal.y * 1.37 * sign);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 50, height > 1 ? 0.085 : 0.065, 6, false);
  })), [normal]);
  const sideBeams = useMemo(() => [-1, 1].map((sign) => {
    const points = Array.from({ length: 31 }, (_, i) => {
      const p = bridgePoint(i / 30);
      return new THREE.Vector3(p.x + normal.x * 1.16 * sign, p.y - 0.36, p.z + normal.y * 1.16 * sign);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 50, 0.18, 7, false);
  }), [normal]);
  return <group>
    <mesh geometry={deck} material={bridgeDeckPaint} castShadow receiveShadow />
    {rails.map((geometry, index) => <mesh key={index} geometry={geometry} material={redPaint} castShadow />)}
    {sideBeams.map((geometry, index) => <mesh key={`beam-${index}`} geometry={geometry} material={mutedRed} castShadow />)}
    {Array.from({ length: 16 }, (_, i) => {
      const p = bridgePoint(i / 15);
      return <group key={i}>
        <mesh position={[p.x, p.y - 0.23, p.z]} rotation={[0, -Math.atan2(end[1] - start[1], end[0] - start[0]), 0]} castShadow><boxGeometry args={[0.085, 0.025, 2.56]} /><primitive object={timber} attach="material" /></mesh>
        {[-1, 1].map((sign) => <group key={sign} position={[p.x + normal.x * 1.37 * sign, p.y, p.z + normal.y * 1.37 * sign]}>
          <mesh position={[0, 0.52, 0]} castShadow><boxGeometry args={[0.15, 1.16, 0.15]} /><primitive object={redPaint} attach="material" /></mesh>
          <mesh position={[0, 1.14, 0]}><sphereGeometry args={[0.13, 8, 6]} /><primitive object={gold} attach="material" /></mesh>
        </group>)}
      </group>;
    })}
    {[2, 5, 8, 11, 14].map((index) => {
      const p = bridgePoint(index / 15);
      return [-1, 1].map((sign) => <Beam key={`${index}-${sign}`} from={new THREE.Vector3(p.x + normal.x * 1.05 * sign, 0.08, p.z + normal.y * 1.05 * sign)} to={new THREE.Vector3(p.x + normal.x * 1.05 * sign, p.y - 0.24, p.z + normal.y * 1.05 * sign)} radius={0.15} material={redPaint} />);
    })}
  </group>;
}

function TiledRoof({ width, depth, y, rise = 2.15 }: { width: number; depth: number; y: number; rise?: number }) {
  const geometry = useMemo(() => roofGeometry(width + 2.1, depth + 2.4, rise), [width, depth, rise]);
  const texture = useMemo(() => roofTilesTexture(), []);
  const tileMaterial = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, color: '#bd9c89', side: THREE.DoubleSide, roughness: 0.88 }), [texture]);
  const eaves = useMemo(() => [-1, 1].map((side) => {
    const points = Array.from({ length: 17 }, (_, i) => {
      const z = (i / 16 - 0.5) * (depth + 2.4);
      const end = Math.abs(z) / ((depth + 2.4) / 2);
      return new THREE.Vector3(side * (width + 2.1) / 2, 0.26 + 0.2 * Math.pow(end, 8), z);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, 0.14, 6, false);
  }), [width, depth]);
  return <group>
    <mesh position={[0, y, 0]} geometry={geometry} material={tileMaterial} castShadow receiveShadow />
    <mesh position={[0, y - 0.12, 0]} castShadow><boxGeometry args={[width + 1.6, 0.15, depth + 1.8]} /><primitive object={timber} attach="material" /></mesh>
    {eaves.map((edge, index) => <mesh key={index} position={[0, y, 0]} geometry={edge} material={roofTile} castShadow />)}
    {[-1, 1].map((side) => <mesh key={side} position={[side * (width / 2 + 0.86), y + 0.04, 0]} castShadow><boxGeometry args={[0.28, 0.33, depth + 1.8]} /><primitive object={timber} attach="material" /></mesh>)}
    <mesh position={[0, y + rise + 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.18, 0.18, depth + 2.6, 8]} /><primitive object={gold} attach="material" /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, y + rise + 0.13, sign * (depth / 2 + 1.1)]} castShadow><coneGeometry args={[0.35, 0.7, 8]} /><primitive object={gold} attach="material" /></mesh>)}
  </group>;
}

function TempleHall({ x, z, width, depth, height, label }: { x: number; z: number; width: number; depth: number; height: number; label?: string }) {
  const sign = useMemo(() => label ? plaqueTexture(label) : null, [label]);
  return <group position={[x, 0.35, z]}>
    <mesh position={[0, 0.38, 0]} castShadow receiveShadow><boxGeometry args={[width + 2, 0.76, depth + 1.8]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[-0.65, 0.95 + height / 2, 0]} castShadow receiveShadow><boxGeometry args={[width - 1.3, height, depth - 1.1]} /><primitive object={templeWall} attach="material" /></mesh>
    <mesh position={[width / 2 - 0.8, 2.5, 0]}><boxGeometry args={[0.12, 3.15, depth - 1.2]} /><primitive object={mutedRed} attach="material" /></mesh>
    {Array.from({ length: 5 }, (_, i) => {
      const zz = -depth / 2 + 1.5 + i * (depth - 3) / 4;
      return <group key={i}>
        <mesh position={[width / 2 - 0.69, 2.35, zz]}><boxGeometry args={[0.09, 2.65, 1.15]} /><primitive object={i === 2 ? darkOpening : timber} attach="material" /></mesh>
        <mesh position={[width / 2 - 0.59, 2.35, zz]}><boxGeometry args={[0.06, 2.45, 0.055]} /><primitive object={gold} attach="material" /></mesh>
        <mesh position={[width / 2 + 0.35, 2.65, zz]} castShadow><cylinderGeometry args={[0.19, 0.22, 3.8, 10]} /><primitive object={redPaint} attach="material" /></mesh>
        <mesh position={[width / 2 + 0.35, 4.68, zz]} castShadow><boxGeometry args={[0.45, 0.26, 0.45]} /><primitive object={gold} attach="material" /></mesh>
      </group>;
    })}
    <mesh position={[width / 2 + 0.35, 4.55, 0]} castShadow><boxGeometry args={[0.43, 0.35, depth + 0.25]} /><primitive object={timber} attach="material" /></mesh>
    {sign && <mesh position={[width / 2 + 0.7, height + 0.05, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[Math.min(6, depth - 2), 0.82]} /><meshBasicMaterial map={sign} side={THREE.DoubleSide} /></mesh>}
    <mesh position={[width / 2 + 1.25, 0.38, 0]} receiveShadow><boxGeometry args={[1.7, 0.18, depth - 0.8]} /><primitive object={limestone} attach="material" /></mesh>
    <TiledRoof width={width + 1.4} depth={depth + 0.6} y={height + 0.95} />
  </group>;
}

function Gate({ position, width = 5 }: { position: [number, number, number]; width?: number }) {
  const sign = useMemo(() => plaqueTexture('ĐẮC NGUYỆT LÂU'), []);
  return <group position={position}>
    {[-1, 1].map((sign) => <mesh key={sign} position={[0, 2.05, sign * width / 2]} castShadow><boxGeometry args={[1.2, 4.1, 0.83]} /><primitive object={templeWall} attach="material" /></mesh>)}
    <mesh position={[0, 4.03, 0]} castShadow><boxGeometry args={[1.24, 0.5, width + 1.2]} /><primitive object={mutedRed} attach="material" /></mesh>
    <mesh position={[0, 4.42, 0]} castShadow><boxGeometry args={[1.65, 0.2, width + 1.6]} /><primitive object={agedStone} attach="material" /></mesh>
    <mesh position={[0, 5.17, 0]} castShadow><boxGeometry args={[1.35, 1.36, width - 0.5]} /><primitive object={templeWall} attach="material" /></mesh>
    <mesh position={[0.73, 5.1, 0]}><boxGeometry args={[0.08, 0.78, 2.35]} /><primitive object={darkOpening} attach="material" /></mesh>
    <mesh position={[0.81, 5.15, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2.55, 0.57]} /><meshBasicMaterial map={sign} side={THREE.DoubleSide} /></mesh>
    <TiledRoof width={1.55} depth={width + 0.2} y={6.05} rise={0.75} />
  </group>;
}

export function NgocSonTemple({ time }: { time: TimeOfDay }) {
  const [cx, cz] = templeCenter;
  const [, islandEnd] = bridgeEnds;
  const yardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b8ae93', roughness: 0.98 }), []);
  return <group>
    <mesh position={[cx - 2, 0.4, cz]} receiveShadow><boxGeometry args={[34, 0.2, 24]} /><primitive object={yardMaterial} attach="material" /></mesh>
    <TempleHall x={cx - 10} z={cz + 0.5} width={12} depth={14} height={4.3} label="ĐỀN NGỌC SƠN" />
    <TempleHall x={cx + 2.2} z={cz - 0.2} width={9} depth={11} height={3.7} />
    <Gate position={[islandEnd[0] - 1.4, 0.42, islandEnd[1]]} />
    <group position={[cx - 5, 0.34, cz + 16]}>
      <mesh position={[0, 0.35, 0]} receiveShadow><boxGeometry args={[7.5, 0.7, 7.5]} /><primitive object={agedStone} attach="material" /></mesh>
      {[-1, 1].map((x) => [-1, 1].map((z) => <mesh key={`${x}-${z}`} position={[x * 2.6, 2.5, z * 2.6]} castShadow><cylinderGeometry args={[0.2, 0.23, 4.2, 8]} /><primitive object={redPaint} attach="material" /></mesh>))}
      <mesh position={[0, 4.45, 0]} castShadow><boxGeometry args={[6.6, 0.33, 6.6]} /><primitive object={timber} attach="material" /></mesh>
      <TiledRoof width={6.7} depth={6.7} y={4.55} />
    </group>
    <group position={[bridgeEnds[0][0] + 9, 0.24, bridgeEnds[0][1] - 8]}>
      <mesh position={[0, 0.35, 0]} castShadow><boxGeometry args={[3.3, 0.7, 3.3]} /><primitive object={agedStone} attach="material" /></mesh>
      {[0, 1, 2].map((level) => <mesh key={level} position={[0, 1.25 + level * 1.65, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><cylinderGeometry args={[1.25 - level * 0.27, 1.45 - level * 0.27, 1.6, 4]} /><primitive object={templeWall} attach="material" /></mesh>)}
      <mesh position={[0, 6.25, 0]} castShadow><coneGeometry args={[0.8, 1.65, 4]} /><primitive object={gold} attach="material" /></mesh>
    </group>
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

function LandmarkSlot({ url, position, rotationY, fallback }: { url: string | null; position: [number, number, number]; rotationY?: number; fallback: ReactNode }) {
  return url ? <Suspense fallback={fallback}><LandmarkModel url={url} position={position} rotationY={rotationY} /></Suspense> : fallback;
}

export function Landmarks({ time }: { time: TimeOfDay }) {
  const [bridgeStart, bridgeEnd] = bridgeEnds;
  return <>
    <LandmarkSlot url={landmarkAssets.turtleTower} position={[turtleCenter[0], 0.28, turtleCenter[1]]} fallback={<TurtleTower time={time} />} />
    <LandmarkSlot url={landmarkAssets.theHucBridge} position={[bridgeStart[0], 0, bridgeStart[1]]}
      rotationY={Math.atan2(bridgeEnd[1] - bridgeStart[1], bridgeStart[0] - bridgeEnd[0])} fallback={<TheHucBridge />} />
    <LandmarkSlot url={landmarkAssets.ngocSonTemple} position={[templeCenter[0], 0.28, templeCenter[1]]} fallback={<NgocSonTemple time={time} />} />
  </>;
}

export const landmarkPositions: Record<string, Point> = {
  'Tháp Rùa': turtleCenter,
  'Đền Ngọc Sơn': templeCenter,
  'Cầu Thê Húc': [(bridgeEnds[0][0] + bridgeEnds[1][0]) / 2, (bridgeEnds[0][1] + bridgeEnds[1][1]) / 2],
};
