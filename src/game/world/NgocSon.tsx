import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bridgeEnds, insidePolygon, ISLAND_HEIGHT, offsetRing, registerObstacles, sampleRing, templeCenter, templeIsland, type Obstacle, type Point } from '../geo';
import { Instances, trs, unitBox } from './Instances';
import { materials } from './materials';
import { Roof } from './Roof';
import { grassTexture, limeStoneTexture, pavingTexture, plaqueTexture, rng } from './textures';
import { Trees, type Tree } from './Vegetation';

/** Temple axis: origin at the bridge landing, local +X points into the temple. */
const landing = bridgeEnds[1];
const axisAngle = Math.atan2(templeCenter[1] - landing[1], templeCenter[0] - landing[0]);
const rotationY = -axisAngle;
function toWorld(x: number, z: number): Point {
  const c = Math.cos(axisAngle);
  const s = Math.sin(axisAngle);
  return [landing[0] + x * c - z * s, landing[1] + x * s + z * c];
}

/** Red timber hall on a stone platform: front colonnade, lattice walls and a curved tiled roof. */
function Hall({ x, z = 0, width, depth, height, roofRise = 2.4, double = false, label }: { x: number; z?: number; width: number; depth: number; height: number; roofRise?: number; double?: boolean; label?: string }) {
  const m = materials();
  const plaque = useMemo(() => label ? new THREE.MeshStandardMaterial({ map: plaqueTexture(label), roughness: 0.5 }) : null, [label]);
  const columns = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    const n = Math.max(4, Math.round(width / 2.2));
    for (let i = 0; i <= n; i++) for (const row of [-1, 1]) list.push(trs(row * (depth / 2 + 0.7), 0.5 + height / 2, -width / 2 + (width * i) / n, 0, 0.36, height, 0.36));
    return list;
  }, [width, depth, height]);
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[depth + 2.6, 0.5, width + 1.4]} /><primitive object={m.warmStone} attach="material" /></mesh>
    <mesh position={[0, 0.5 + height / 2, 0]} castShadow receiveShadow material={[m.lattice, m.lattice, m.darkRed, m.darkRed, m.darkRed, m.darkRed]}>
      <boxGeometry args={[depth, height, width]} />
    </mesh>
    <Instances geometry={columnGeometry} material={m.red} matrices={columns} />
    {/* beams over the colonnade */}
    {[-1, 1].map((row) => <mesh key={row} position={[row * (depth / 2 + 0.7), 0.5 + height + 0.1, 0]} castShadow><boxGeometry args={[0.4, 0.35, width + 0.4]} /><primitive object={m.darkRed} attach="material" /></mesh>)}
    <group rotation={[0, Math.PI / 2, 0]}>
      {double && <Roof width={width + 3.4} depth={depth + 4.2} rise={0.7} y={0.5 + height + 0.25} ridge={width * 0.9} curl={0.55} dragons={false} />}
      <Roof width={width + 2.6} depth={depth + 3.4} rise={roofRise} y={0.5 + height + (double ? 1.2 : 0.3)} ridge={width * 0.6} curl={0.75} pearl />
      {double && <mesh position={[0, 0.5 + height + 0.75, 0]} castShadow material={[m.darkRed, m.darkRed, m.darkRed, m.darkRed, m.lattice, m.lattice]}><boxGeometry args={[width - 0.6, 0.9, depth - 0.6]} /></mesh>}
    </group>
    {plaque && <mesh position={[-(depth / 2 + 0.02), 0.5 + height - 0.55, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[Math.min(4, width * 0.4), 1]} /><primitive object={plaque} attach="material" /></mesh>}
  </group>;
}

const columnGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

/** Đắc Nguyệt Lầu style entrance: stone gatehouse with an arched door, a name plaque, couplets, two-tier roof and red side wings. */
function Gate({ x }: { x: number }) {
  const m = materials();
  const plaque = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture('Đền Ngọc Sơn'), roughness: 0.45 }), []);
  const coupletL = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture('龍飛鳳舞', true), roughness: 0.6 }), []);
  const coupletR = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture('海晏河清', true), roughness: 0.6 }), []);
  const body = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-3.2, 0); shape.lineTo(3.2, 0); shape.lineTo(3.2, 6.0); shape.lineTo(-3.2, 6.0); shape.lineTo(-3.2, 0);
    const door = new THREE.Path();
    door.moveTo(-1.15, 0); door.lineTo(-1.15, 2.6); door.absarc(0, 2.6, 1.15, Math.PI, 0, true); door.lineTo(1.15, 0); door.lineTo(-1.15, 0);
    shape.holes.push(door);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false, curveSegments: 16 });
    g.translate(0, 0, -1.6);
    return g;
  }, []);
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ map: limeStoneTexture('#dcd6c6'), roughness: 0.9 }), []);
  return <group position={[x, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
    {/* steps and platform */}
    <mesh position={[0, 0.2, 0]} receiveShadow castShadow><boxGeometry args={[7.6, 0.4, 4.4]} /><primitive object={m.warmStone} attach="material" /></mesh>
    <mesh geometry={body} material={stone} position={[0, 0.4, 0]} castShadow receiveShadow />
    {/* dark passage seen through the door */}
    <mesh position={[0, 1.8, 0]}><boxGeometry args={[2.2, 2.8, 3.1]} /><primitive object={m.dark} attach="material" /></mesh>
    <mesh position={[0, 0.4 + 4.35, 1.62]}><planeGeometry args={[3.4, 0.9]} /><primitive object={plaque} attach="material" /></mesh>
    <mesh position={[-2.25, 0.4 + 2.6, 1.62]}><planeGeometry args={[0.55, 2.8]} /><primitive object={coupletL} attach="material" /></mesh>
    <mesh position={[2.25, 0.4 + 2.6, 1.62]}><planeGeometry args={[0.55, 2.8]} /><primitive object={coupletR} attach="material" /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[s * 3.25, 0.4 + 3.2, 1.0]} castShadow><boxGeometry args={[0.6, 6.4, 0.6]} /><primitive object={stone} attach="material" /></mesh>)}
    {[-1, 1].map((s) => <mesh key={`u${s}`} position={[s * 3.25, 0.4 + 6.65, 1.0]} castShadow><boxGeometry args={[0.85, 0.5, 0.85]} /><primitive object={m.warmStone} attach="material" /></mesh>)}
    <Roof width={8.2} depth={5.2} rise={0.8} y={6.5} ridge={5.5} curl={0.55} dragons={false} />
    <mesh position={[0, 7.6, 0]} castShadow material={[m.darkRed, m.darkRed, m.darkRed, m.darkRed, m.lattice, m.lattice]}><boxGeometry args={[4.6, 1.3, 2.8]} /></mesh>
    <Roof width={6.6} depth={4.4} rise={1.5} y={8.35} ridge={3.0} curl={0.75} pearl />
    {/* red side wings with lattice windows */}
    {[-1, 1].map((s) => <group key={`w${s}`} position={[s * 6.6, 0, -0.8]}>
      <mesh position={[0, 0.25, 0]} receiveShadow><boxGeometry args={[6.4, 0.5, 4.6]} /><primitive object={m.warmStone} attach="material" /></mesh>
      <mesh position={[0, 0.5 + 1.6, 0]} castShadow receiveShadow material={[m.darkRed, m.darkRed, m.darkRed, m.darkRed, m.lattice, m.lattice]}><boxGeometry args={[6.0, 3.2, 3.6]} /></mesh>
      <Roof width={7.6} depth={5.6} rise={1.3} y={3.8} ridge={4.4} curl={0.6} dragons={false} />
    </group>)}
  </group>;
}

/** Trấn Ba Đình: small open pavilion with a two-tier roof. */
function Pavilion({ x, z }: { x: number; z: number }) {
  const m = materials();
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.3, 0]} receiveShadow castShadow><boxGeometry args={[4.6, 0.6, 4.6]} /><primitive object={m.warmStone} attach="material" /></mesh>
    {[-1, 1].flatMap((a) => [-1, 1].map((b) => <mesh key={`${a}${b}`} position={[a * 1.6, 0.6 + 1.4, b * 1.6]} castShadow><cylinderGeometry args={[0.16, 0.18, 2.8, 10]} /><primitive object={m.red} attach="material" /></mesh>))}
    <Roof width={5.2} depth={5.2} rise={0.9} y={3.4} ridge={0.4} curl={0.6} dragons={false} />
    <mesh position={[0, 4.4, 0]} castShadow><boxGeometry args={[2.4, 0.7, 2.4]} /><primitive object={m.darkRed} attach="material" /></mesh>
    <Roof width={3.8} depth={3.8} rise={1.2} y={4.75} ridge={0.2} curl={0.6} dragons={false} pearl />
  </group>;
}

/** Ceremonial banner pole with a red-and-gold flag, as in the reference. */
function BannerPole({ x, z }: { x: number; z: number }) {
  const m = materials();
  const flag = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#c7261b'; ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(8, 8, 48, 230);
    ctx.fillStyle = '#c7261b'; ctx.fillRect(16, 18, 32, 200);
    ctx.fillStyle = '#2f7a3d'; for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 64, 6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.7 });
  }, []);
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.5, 0.7]} /><primitive object={m.warmStone} attach="material" /></mesh>
    <mesh position={[0, 4.5, 0]} castShadow><cylinderGeometry args={[0.06, 0.09, 8.6, 8]} /><primitive object={m.timber} attach="material" /></mesh>
    <mesh position={[0, 8.9, 0]}><coneGeometry args={[0.14, 0.4, 8]} /><primitive object={m.gold} attach="material" /></mesh>
    <mesh position={[0, 6.4, 0.45]} rotation={[0, Math.PI / 2, 0.05]}><planeGeometry args={[0.85, 3.6]} /><primitive object={flag} attach="material" /></mesh>
  </group>;
}

/** Island ground, rock edging, lawns and courtyard paving. */
function IslandGround() {
  const m = materials();
  const grass = useMemo(() => {
    const t = grassTexture().clone(); t.needsUpdate = true; t.repeat.set(1 / 6, 1 / 6);
    return new THREE.MeshStandardMaterial({ map: t, color: '#a4c98a', roughness: 0.95 });
  }, []);
  const paving = useMemo(() => {
    const t = pavingTexture().clone(); t.needsUpdate = true; t.repeat.set(1 / 4, 1 / 4);
    return new THREE.MeshStandardMaterial({ map: t, color: '#e6ddd0', roughness: 0.9 });
  }, []);
  const { ground, rocks, rockColors } = useMemo(() => {
    const shape = new THREE.Shape(templeIsland.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: ISLAND_HEIGHT + 0.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.4, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.6, 0);
    const r = rng(404);
    const list: THREE.Matrix4[] = [];
    const tint: THREE.Color[] = [];
    for (const { point } of sampleRing(offsetRing(templeIsland, 0.35), 0.8)) {
      if (Math.hypot(point[0] - landing[0], point[1] - landing[1]) < 2.4) continue;
      const s = 0.6 + r() * 0.55;
      list.push(trs(point[0], ISLAND_HEIGHT * 0.4, point[1], r() * 6, s * 1.3, s * 0.8, s, r(), r()));
      tint.push(new THREE.Color().setHSL(0.1, 0.05, 0.42 + r() * 0.2));
    }
    return { ground: g, rocks: list, rockColors: tint };
  }, []);
  return <group>
    <mesh geometry={ground} material={grass} receiveShadow />
    <Instances geometry={rockGeometry} material={m.rock} matrices={rocks} colors={rockColors} />
    {/* paved courtyard along the temple axis */}
    <mesh position={[...toWorldV(15, 0, ISLAND_HEIGHT + 0.015)]} rotation={[-Math.PI / 2, 0, -axisAngle]} receiveShadow><planeGeometry args={[30, 13]} /><primitive object={paving} attach="material" /></mesh>
  </group>;
}
const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0);
function toWorldV(x: number, z: number, y: number): [number, number, number] { const [wx, wz] = toWorld(x, z); return [wx, y, wz]; }

/** Ngọc Sơn temple complex on its island, laid out along the bridge axis. */
export function NgocSonIsland() {
  const trees = useMemo<Tree[]>(() => {
    const r = rng(505);
    const list: Tree[] = [];
    const inner = offsetRing(templeIsland, -2.5);
    for (let i = 0; i < 400 && list.length < 20; i++) {
      const p: Point = [templeCenter[0] + (r() - 0.5) * 50, templeCenter[1] + (r() - 0.5) * 60];
      if (!insidePolygon(p, inner)) continue;
      // keep the temple axis and buildings clear
      const dx = p[0] - landing[0];
      const dz = p[1] - landing[1];
      const along = dx * Math.cos(axisAngle) + dz * Math.sin(axisAngle);
      const across = -dx * Math.sin(axisAngle) + dz * Math.cos(axisAngle);
      if (along > -2 && along < 36 && Math.abs(across) < 13) continue;
      const kind = r() < 0.28 ? 'blossom' : r() < 0.35 ? 'banyan' : 'shade';
      list.push({ x: p[0], z: p[1], y: ISLAND_HEIGHT, kind, scale: kind === 'banyan' ? 0.9 : 0.7 + r() * 0.25 });
    }
    // blossom trees flanking the gate like in the reference
    for (const side of [-1, 1]) { const [x, z] = toWorld(6, side * 9.5); list.push({ x, z, y: ISLAND_HEIGHT, kind: 'blossom', scale: 1.1 }); }
    return list;
  }, []);
  useEffect(() => {
    // Footprints in temple-local coordinates → oriented world obstacles.
    const local: [number, number, number, number][] = [
      [4.2, -2.25, 1.6, 1.0], [4.2, 2.25, 1.6, 1.0], // gate piers either side of the door
      [5.0, -6.6, 1.8, 3.0], [5.0, 6.6, 1.8, 3.0], // side wings
      [18, 0, 3.4, 7.5], [24.5, 0, 3.4, 7.5], [31, 0, 3.0, 6.0], // halls
      [10, 9.5, 2.0, 2.0], // pavilion
    ];
    const list: Obstacle[] = local.map(([x, z, hx, hz]) => { const [wx, wz] = toWorld(x, z); return { x: wx, z: wz, hx, hz, angle: rotationY }; });
    return registerObstacles(list);
  }, []);
  return <group>
    <IslandGround />
    <Trees trees={trees} seed={9} />
    <group position={[landing[0], ISLAND_HEIGHT, landing[1]]} rotation={[0, rotationY, 0]}>
      <Gate x={4.2} />
      <BannerPole x={1.8} z={-4.6} />
      <BannerPole x={1.8} z={4.6} />
      <Pavilion x={10} z={9.5} />
      <Hall x={18} width={14} depth={5.6} height={3.4} label="Ngọc Sơn Từ" />
      <Hall x={24.5} width={14} depth={5.6} height={3.6} double />
      <Hall x={31} width={11} depth={5} height={3.2} />
      {/* incense burner in the courtyard */}
      <mesh position={[11.5, 0.6, 0]} castShadow><cylinderGeometry args={[0.55, 0.45, 1.2, 12]} /><meshStandardMaterial color="#5b4a32" metalness={0.6} roughness={0.4} /></mesh>
      <Instances geometry={unitBox} material={materials().warmStone} matrices={courtyardWall} />
    </group>
  </group>;
}

/** Low perimeter wall around the courtyard. */
const courtyardWall: THREE.Matrix4[] = [
  trs(20, 0.45, -11, 0, 26, 0.9, 0.35), trs(20, 0.45, 11, 0, 26, 0.9, 0.35),
];
