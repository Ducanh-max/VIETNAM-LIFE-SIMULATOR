import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bridgeEnds, insidePolygon, ISLAND_HEIGHT, offsetRing, registerHeight, registerObstacles, sampleRing, templeCenter, templeIsland, type Obstacle, type Point } from '../geo';
import { Instances, trs, unitBox } from './Instances';
import { materials } from './materials';
import { Roof } from './Roof';
import { grassTexture, limeStoneTexture, pavingTexture, plaqueTexture, rng } from './textures';
import { Altar, DrumAndBell, Lantern, PLATFORM, Shrine, TempleHall, TurtleSpecimen } from './TempleInterior';
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
    {/* open passage through the gatehouse: stone floor under the arch */}
    <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[2.3, 3.2]} /><primitive object={m.warmStone} attach="material" /></mesh>
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
    // The bevel adds 0.2 m on top of the extrusion depth: drop it so the lawn sits exactly at ISLAND_HEIGHT.
    g.translate(0, -0.8, 0);
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
      ...HALLS.flatMap(hallWalls), // hall walls (the halls themselves are walk-in)
      [18 + 1.4, 0, 0.55, 1.5], [18, -5.0, 0.5, 1.9], // Bái đường altar, drum and bell
      [24.5, 4.6, 1.4, 0.85], // turtle specimen case
      [31 + 1.2, 0, 0.85, 1.85], [31 - 0.5, 0, 0.55, 1.5], // Hậu cung shrine and altar
      [10, 9.5, 2.0, 2.0], // pavilion
    ];
    const list: Obstacle[] = local.map(([x, z, hx, hz]) => { const [wx, wz] = toWorld(x, z); return { x: wx, z: wz, hx, hz, angle: rotationY }; });
    const unregister = registerObstacles(list);
    // Hall platforms raise the floor so the player walks up into the halls.
    const unheight = registerHeight((p) => {
      const [lx, lz] = toLocal(p);
      for (const h of HALLS) if (Math.abs(lx - h.x) < h.depth / 2 + 1.3 && Math.abs(lz) < h.width / 2 + 0.7) return ISLAND_HEIGHT + PLATFORM;
      if (Math.abs(lx - 4.2) < 2.2 && Math.abs(lz) < 3.8) return ISLAND_HEIGHT + 0.4; // gatehouse floor
      return null;
    });
    return () => { unregister(); unheight(); };
  }, []);
  return <group>
    <IslandGround />
    <Trees trees={trees} seed={9} />
    <group position={[landing[0], ISLAND_HEIGHT, landing[1]]} rotation={[0, rotationY, 0]}>
      <Gate x={4.2} />
      <BannerPole x={1.8} z={-4.6} />
      <BannerPole x={1.8} z={4.6} />
      <Pavilion x={10} z={9.5} />
      {/* Bái đường (front hall): name board, couplets, altar with crane pair, drum and bell */}
      <TempleHall {...HALLS[0]} label="Ngọc Sơn Từ" couplet={['文章千古在', '山水一廳中']} openBack>
        <group position={[1.4, PLATFORM, 0]}><Altar /></group>
        <group position={[0, PLATFORM, -5.0]}><DrumAndBell /></group>
        {[-1.6, 0, 1.6].map((x) => <group key={x} position={[x, PLATFORM + 3.0, 0]}><Lantern /></group>)}
        <pointLight position={[0, PLATFORM + 2.6, 0]} color="#ffbe7a" intensity={6} distance={11} decay={1.6} />
      </TempleHall>
      {/* Trung đường (middle hall, double roof): the preserved Hồ Gươm turtle */}
      <TempleHall {...HALLS[1]} double openBack>
        <group position={[0, PLATFORM, 4.6]}><TurtleSpecimen /></group>
        {[-4, 4].map((z) => <group key={z} position={[0, PLATFORM + 3.2, z]}><Lantern /></group>)}
      </TempleHall>
      {/* Hậu cung (rear sanctuary): gilded shrine with seated statues behind the main altar */}
      <TempleHall {...HALLS[2]}>
        <group position={[1.2, PLATFORM, 0]}><Shrine /></group>
        <group position={[-0.5, PLATFORM, 0]}><Altar width={2.0} /></group>
        <pointLight position={[-0.4, PLATFORM + 2.4, 0]} color="#ffb067" intensity={5} distance={9} decay={1.6} />
      </TempleHall>
      <Instances geometry={unitBox} material={materials().warmStone} matrices={courtyardWall} />
    </group>
  </group>;
}

/** Walk-in halls on the temple axis (local x), front toward the gate. */
const HALLS = [
  { x: 18, width: 14, depth: 5.6, height: 3.4 },
  { x: 24.5, width: 14, depth: 5.6, height: 3.6 },
  { x: 31, width: 11, depth: 5, height: 3.2 },
];
/** Side walls and the solid bays of the front/back walls, as [x, z, hx, hz] in temple coordinates. */
function hallWalls(h: typeof HALLS[number], i: number): [number, number, number, number][] {
  const walls: [number, number, number, number][] = [[h.x, -h.width / 2, h.depth / 2, 0.15], [h.x, h.width / 2, h.depth / 2, 0.15]];
  const frontOpen = (h.width / 5) * 3;
  const backOpen = i < 2 ? 3.0 : 0;
  for (const [x, open] of [[h.x - h.depth / 2, frontOpen], [h.x + h.depth / 2, backOpen]]) {
    const solid = (h.width - open) / 2;
    for (const s of [-1, 1]) walls.push([x, s * (open / 2 + solid / 2), 0.15, solid / 2]);
  }
  return walls;
}
function toLocal([wx, wz]: Point): Point {
  const dx = wx - landing[0]; const dz = wz - landing[1];
  const c = Math.cos(axisAngle); const s = Math.sin(axisAngle);
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** Low perimeter wall around the courtyard. */
const courtyardWall: THREE.Matrix4[] = [
  trs(20, 0.45, -11, 0, 26, 0.9, 0.35), trs(20, 0.45, 11, 0, 26, 0.9, 0.35),
];

// Dev hook for screenshot scripts.
if (import.meta.env.DEV) (window as unknown as { __temple?: unknown }).__temple = { toWorld };
