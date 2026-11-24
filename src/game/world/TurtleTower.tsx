import { useMemo } from 'react';
import * as THREE from 'three';
import { ISLAND_HEIGHT, offsetRing, sampleRing, turtleCenter, turtleIsland, insidePolygon, type Point } from '../geo';
import { Instances, trs, unitBox, unitSphere } from './Instances';
import { materials } from './materials';
import { Roof } from './Roof';
import { grassTexture, rng } from './textures';

type Opening = { center: number; width: number; height: number; sill: number; round?: boolean };

/** Wall panel with pointed (Gothic) arch or round openings, extruded to `thickness`. */
function archPanel(width: number, height: number, thickness: number, openings: Opening[]) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.lineTo(-width / 2, 0);
  for (const o of openings) {
    const hole = new THREE.Path();
    if (o.round) {
      hole.absarc(o.center, o.sill + o.width / 2, o.width / 2, 0, Math.PI * 2, true);
    } else {
      const x0 = o.center - o.width / 2;
      const x1 = o.center + o.width / 2;
      const archRise = o.width * 0.75;
      const spring = o.sill + o.height - archRise;
      hole.moveTo(x0, o.sill);
      hole.lineTo(x0, spring);
      hole.quadraticCurveTo(x0, spring + archRise * 0.82, o.center, o.sill + o.height);
      hole.quadraticCurveTo(x1, spring + archRise * 0.82, x1, spring);
      hole.lineTo(x1, o.sill);
      hole.lineTo(x0, o.sill);
    }
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 10 });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

function arches(width: number, count: number, w: number, h: number, sill = 0, centerScale = 1): Opening[] {
  if (count === 1) return [{ center: 0, width: w * centerScale, height: h * (centerScale > 1 ? 1.12 : 1), sill }];
  const step = width / count;
  return Array.from({ length: count }, (_, i) => {
    const middle = count % 2 === 1 && i === (count - 1) / 2;
    return { center: -width / 2 + step * (i + 0.5), width: middle ? w * centerScale : w, height: middle ? h * 1.12 : h, sill };
  });
}

/** One storey: four arcaded walls, a dark interior, corner pilasters and a cornice. */
function Tier({ width, depth, height, y, front, side, thickness = 0.32, pilaster = 0.42 }: {
  width: number; depth: number; height: number; y: number; front: Opening[]; side: Opening[]; thickness?: number; pilaster?: number;
}) {
  const m = materials();
  const frontGeometry = useMemo(() => archPanel(width, height, thickness, front), [width, height, thickness, front]);
  const sideGeometry = useMemo(() => archPanel(depth - thickness * 2, height, thickness, side), [depth, height, thickness, side]);
  return <group position={[0, y, 0]}>
    <mesh geometry={frontGeometry} material={m.stone} position={[0, 0, depth / 2 - thickness / 2]} castShadow receiveShadow />
    <mesh geometry={frontGeometry} material={m.stone} position={[0, 0, -depth / 2 + thickness / 2]} rotation={[0, Math.PI, 0]} castShadow receiveShadow />
    <mesh geometry={sideGeometry} material={m.stone} position={[width / 2 - thickness / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow />
    <mesh geometry={sideGeometry} material={m.stone} position={[-width / 2 + thickness / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
    {/* interior shadow volume seen through the arches */}
    <mesh position={[0, height / 2, 0]}><boxGeometry args={[width - thickness * 2 - 0.4, height - 0.05, depth - thickness * 2 - 0.4]} /><primitive object={m.dark} attach="material" /></mesh>
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} position={[sx * (width / 2 - pilaster / 2 + 0.06), height / 2, sz * (depth / 2 - pilaster / 2 + 0.06)]} castShadow receiveShadow>
      <boxGeometry args={[pilaster, height, pilaster]} /><primitive object={m.warmStone} attach="material" />
    </mesh>))}
    <mesh position={[0, height + 0.12, 0]} castShadow receiveShadow><boxGeometry args={[width + 0.4, 0.24, depth + 0.4]} /><primitive object={m.warmStone} attach="material" /></mesh>
    <mesh position={[0, height - 0.08, 0]}><boxGeometry args={[width + 0.18, 0.12, depth + 0.18]} /><primitive object={m.stone} attach="material" /></mesh>
  </group>;
}

/** Terrace balustrade: corner posts with caps, rails and small balusters. */
function Balustrade({ width, depth, y, postHeight = 0.95, urns = false }: { width: number; depth: number; y: number; postHeight?: number; urns?: boolean }) {
  const m = materials();
  const { balusters, rails } = useMemo(() => {
    const b: THREE.Matrix4[] = [];
    const r: THREE.Matrix4[] = [];
    const edges: [number, number, number, number][] = [[-width / 2, depth / 2, width / 2, depth / 2], [-width / 2, -depth / 2, width / 2, -depth / 2], [width / 2, -depth / 2, width / 2, depth / 2], [-width / 2, -depth / 2, -width / 2, depth / 2]];
    for (const [x0, z0, x1, z1] of edges) {
      const length = Math.hypot(x1 - x0, z1 - z0);
      const along = x0 === x1 ? Math.PI / 2 : 0;
      r.push(trs((x0 + x1) / 2, 0.62, (z0 + z1) / 2, along, length, 0.1, 0.18));
      r.push(trs((x0 + x1) / 2, 0.07, (z0 + z1) / 2, along, length, 0.1, 0.22));
      const n = Math.floor(length / 0.26);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        b.push(trs(x0 + (x1 - x0) * t, 0.34, z0 + (z1 - z0) * t, 0, 0.09, 0.46, 0.09));
      }
    }
    return { balusters: b, rails: r };
  }, [width, depth]);
  return <group position={[0, y, 0]}>
    <Instances geometry={unitBox} material={m.warmStone} matrices={rails} />
    <Instances geometry={unitBox} material={m.stone} matrices={balusters} />
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <group key={`${sx}${sz}`} position={[sx * width / 2, 0, sz * depth / 2]}>
      <mesh position={[0, postHeight / 2, 0]} castShadow><boxGeometry args={[0.34, postHeight, 0.34]} /><primitive object={m.warmStone} attach="material" /></mesh>
      <mesh position={[0, postHeight + 0.06, 0]} castShadow><boxGeometry args={[0.44, 0.12, 0.44]} /><primitive object={m.stone} attach="material" /></mesh>
      {urns && <mesh position={[0, postHeight + 0.26, 0]} castShadow><sphereGeometry args={[0.16, 10, 8]} /><primitive object={m.warmStone} attach="material" /></mesh>}
    </group>))}
  </group>;
}

/**
 * Tháp Rùa, after the reference sheet: three arcaded storeys of weathered lime
 * masonry with pointed arches, balustraded terraces, an oculus storey under a
 * tiled skirt roof and a small crowning room with dragon ridges. About 10.5 m tall.
 */
export function TurtleTowerBuilding() {
  const t1Front = useMemo(() => arches(4.6, 3, 1.0, 2.25, 0, 1.3), []);
  const t1Side = useMemo(() => arches(3.4, 2, 0.95, 2.15), []);
  const t2Front = useMemo(() => arches(3.4, 3, 0.72, 1.7, 0.15, 1.15), []);
  const t2Side = useMemo(() => arches(2.6, 2, 0.7, 1.6, 0.15), []);
  const t3Front = useMemo<Opening[]>(() => [{ center: 0, width: 0.82, height: 0.82, sill: 0.42, round: true }], []);
  const t3Side = useMemo(() => arches(1.4, 1, 0.5, 1.0, 0.25), []);
  const t4Front = useMemo(() => arches(1.4, 3, 0.26, 0.5, 0.12), []);
  const m = materials();
  return <group>
    {/* plinth and steps */}
    <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[7.4, 0.5, 6.2]} /><primitive object={m.warmStone} attach="material" /></mesh>
    {[0, 1, 2].map((i) => <mesh key={i} position={[0, 0.08 + i * 0.14, 3.25 + (2 - i) * 0.32]} receiveShadow><boxGeometry args={[2.4, 0.16, 0.34]} /><primitive object={m.stone} attach="material" /></mesh>)}
    <Tier width={6.2} depth={5.0} height={3.2} y={0.5} front={t1Front} side={t1Side} thickness={0.36} pilaster={0.5} />
    <Balustrade width={6.3} depth={5.1} y={3.94} postHeight={1.0} />
    <Tier width={4.6} depth={3.8} height={2.4} y={3.94} front={t2Front} side={t2Side} thickness={0.3} pilaster={0.4} />
    <Balustrade width={4.7} depth={3.9} y={6.58} postHeight={0.85} urns />
    <Tier width={3.0} depth={2.6} height={1.55} y={6.58} front={t3Front} side={t3Side} thickness={0.26} pilaster={0.3} />
    <Roof width={4.1} depth={3.6} rise={0.5} y={8.1} ridge={1.6} curl={0.35} dragons={false} />
    <Tier width={1.9} depth={1.6} height={0.85} y={8.45} front={t4Front} side={t4Front.slice(0, 2)} thickness={0.18} pilaster={0.22} />
    <Roof width={3.0} depth={2.6} rise={0.85} y={9.42} ridge={1.0} curl={0.55} dragons pearl />
  </group>;
}

/** The little island: rock edging, lawn, flowering shrubs, a path and garden lamps. */
export function TurtleIsland() {
  const m = materials();
  const grass = useMemo(() => {
    const texture = grassTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(1 / 6, 1 / 6);
    return new THREE.MeshStandardMaterial({ map: texture, color: '#9cc77a', roughness: 0.95 });
  }, []);
  const { ground, rocks, rockColors, shrubs, shrubColors, flowers, lamps } = useMemo(() => {
    const local = turtleIsland.map(([x, z]) => [x - turtleCenter[0], z - turtleCenter[1]] as Point);
    const shape = new THREE.Shape(local.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: ISLAND_HEIGHT + 0.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.4, bevelSegments: 2 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -0.6, 0);
    const r = rng(303);
    const rockList: THREE.Matrix4[] = [];
    const rockTint: THREE.Color[] = [];
    for (const { point } of sampleRing(offsetRing(local, 0.35), 0.75)) {
      const s = 0.55 + r() * 0.5;
      rockList.push(trs(point[0], ISLAND_HEIGHT * 0.4, point[1], r() * 6, s * 1.3, s * 0.8, s, r(), r()));
      rockTint.push(new THREE.Color().setHSL(0.1, 0.06, 0.45 + r() * 0.2));
    }
    const inner = offsetRing(local, -1.6);
    const shrubList: THREE.Matrix4[] = [];
    const shrubTint: THREE.Color[] = [];
    const flowerList: THREE.Matrix4[] = [];
    for (let i = 0; i < 160 && shrubList.length < 46; i++) {
      const p: Point = [(r() - 0.5) * 24, (r() - 0.5) * 28];
      if (!insidePolygon(p, inner) || (Math.abs(p[0]) < 4.6 && Math.abs(p[1]) < 4)) continue;
      if (Math.abs(p[0]) < 1.3 && p[1] > 0) continue; // path to the steps
      const s = 0.6 + r() * 0.8;
      shrubList.push(trs(p[0], ISLAND_HEIGHT + s * 0.3, p[1], r() * 6, s * 1.3, s * 0.8, s * 1.2));
      shrubTint.push(new THREE.Color().setHSL(0.27 + r() * 0.06, 0.55, 0.16 + r() * 0.08));
      if (r() < 0.65) for (let f = 0; f < 4; f++) flowerList.push(trs(p[0] + (r() - 0.5) * s, ISLAND_HEIGHT + s * 0.62, p[1] + (r() - 0.5) * s, 0, 0.18));
    }
    const lampList = [[-4.6, 4.6], [4.6, 4.6], [-4.6, -4.4], [4.6, -4.4]] as Point[];
    return { ground: geometry, rocks: rockList, rockColors: rockTint, shrubs: shrubList, shrubColors: shrubTint, flowers: flowerList, lamps: lampList };
  }, []);
  const flowerMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f07fae', roughness: 0.6 }), []);
  return <group position={[turtleCenter[0], 0, turtleCenter[1]]}>
    <mesh geometry={ground} material={grass} receiveShadow />
    <Instances geometry={dodeca} material={m.rock} matrices={rocks} colors={rockColors} />
    <Instances geometry={unitSphere} material={m.leaf} matrices={shrubs} colors={shrubColors} />
    <Instances geometry={unitSphere} material={flowerMaterial} matrices={flowers} castShadow={false} />
    <mesh position={[0, ISLAND_HEIGHT + 0.02, 7]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[2, 8]} /><primitive object={m.warmStone} attach="material" /></mesh>
    {lamps.map(([x, z], i) => <group key={i} position={[x, ISLAND_HEIGHT, z]}>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.3, 0.6, 0.3]} /><primitive object={m.dark} attach="material" /></mesh>
      <mesh position={[0, 0.72, 0]}><boxGeometry args={[0.36, 0.3, 0.36]} /><primitive object={m.lampGlow} attach="material" /></mesh>
      <mesh position={[0, 0.92, 0]}><coneGeometry args={[0.32, 0.18, 4]} /><primitive object={m.dark} attach="material" /></mesh>
    </group>)}
    <group position={[0, ISLAND_HEIGHT, 0]}><TurtleTowerBuilding /></group>
  </group>;
}

const dodeca = new THREE.DodecahedronGeometry(0.5, 0);
