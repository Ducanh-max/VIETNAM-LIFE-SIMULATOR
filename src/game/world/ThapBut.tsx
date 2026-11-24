import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bridgeEnds, GROUND_HEIGHT, registerObstacles, type Obstacle, type Point } from '../geo';
import { Instances, trs } from './Instances';
import { materials } from './materials';
import { limeStoneTexture, plaqueTexture, rng } from './textures';

/*
 * The approach to Đền Ngọc Sơn on the Đinh Tiên Hoàng shore: Tháp Bút (the Pen Tower) on its rocky
 * mound, Núi Độc Tôn, and Đài Nghiên, the gate crowned by an ink-slab carried on three frogs.
 * Proportions are approximate.
 */
const [S, E] = bridgeEnds;
const A = (() => { const dx = S[0] - E[0], dz = S[1] - E[1], l = Math.hypot(dx, dz); return [dx / l, dz / l] as Point; })(); // shore-ward
const N: Point = [-A[1], A[0]];
const heading = Math.atan2(A[0], A[1]); // rotation.y that points local +z shore-ward
const at = (along: number, side: number): Point => [S[0] + A[0] * along + N[0] * side, S[1] + A[1] * along + N[1] * side];
const TOWER = at(8.5, 7.5);
const GATE = at(4.4, 0);

function PenTower() {
  const m = materials();
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ map: limeStoneTexture('#c9c2ae'), roughness: 0.95 }), []);
  const inscription = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture('寫青天', true), roughness: 0.6 }), []);
  const rocks = useMemo(() => {
    const r = rng(66); const list: THREE.Matrix4[] = []; const tint: THREE.Color[] = [];
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2; const d = 1.2 + r() * 2.0; const s = 0.6 + r() * 0.9;
      list.push(trs(Math.cos(a) * d, 0.3 + (2.2 - d) * 0.45 + r() * 0.3, Math.sin(a) * d, r() * 6, s * 1.3, s, s, r(), r()));
      tint.push(new THREE.Color().setHSL(0.1, 0.06, 0.38 + r() * 0.18));
    }
    return { list, tint };
  }, []);
  const tiers = [
    { w: 1.5, h: 1.6 }, { w: 1.3, h: 1.35 }, { w: 1.12, h: 1.2 }, { w: 0.96, h: 1.05 }, { w: 0.82, h: 1.1 },
  ];
  let y = 1.5; // top of the mound plinth
  return <group>
    {/* Núi Độc Tôn: rocky mound with shrubs */}
    <Instances geometry={rock} material={m.rock} matrices={rocks.list} colors={rocks.tint} />
    <mesh position={[0, 0.75, 0]} material={m.warmStone} castShadow receiveShadow><cylinderGeometry args={[1.5, 2.6, 1.5, 10]} /></mesh>
    <mesh position={[0, 1.45, 0]} material={stone} castShadow><boxGeometry args={[2.0, 0.2, 2.0]} /></mesh>
    {tiers.map((t, i) => {
      const base = y; y += t.h + 0.18;
      return <group key={i} position={[0, base, 0]}>
        <mesh position={[0, t.h / 2, 0]} material={stone} castShadow receiveShadow><boxGeometry args={[t.w, t.h, t.w]} /></mesh>
        <mesh position={[0, t.h + 0.09, 0]} material={stone} castShadow><boxGeometry args={[t.w + 0.3, 0.18, t.w + 0.3]} /></mesh>
        {i === tiers.length - 1 && [0, 1, 2, 3].map((k) => <mesh key={k} position={[Math.sin(k * Math.PI / 2) * (t.w / 2 + 0.01), t.h / 2, Math.cos(k * Math.PI / 2) * (t.w / 2 + 0.01)]} rotation={[0, k * Math.PI / 2, 0]} material={inscription}><planeGeometry args={[0.3, 0.9]} /></mesh>)}
      </group>;
    })}
    {/* the brush tip */}
    <mesh position={[0, y + 0.3, 0]} material={stone} castShadow><sphereGeometry args={[0.36, 14, 10]} /></mesh>
    <mesh position={[0, y + 0.95, 0]} material={stone} castShadow><coneGeometry args={[0.3, 1.1, 14]} /></mesh>
  </group>;
}
const rock = new THREE.DodecahedronGeometry(0.5, 0);

function InkSlabGate() {
  const m = materials();
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ map: limeStoneTexture('#d6cfbb'), roughness: 0.92 }), []);
  const arch = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-2.4, 0); shape.lineTo(2.4, 0); shape.lineTo(2.4, 3.6); shape.lineTo(-2.4, 3.6); shape.lineTo(-2.4, 0);
    const hole = new THREE.Path();
    hole.moveTo(-1.25, 0); hole.lineTo(-1.25, 2.2); hole.absarc(0, 2.2, 1.25, Math.PI, 0, true); hole.lineTo(1.25, 0); hole.lineTo(-1.25, 0);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false, curveSegments: 18 });
    g.translate(0, 0, -0.5);
    return g;
  }, []);
  const plaque = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture('Đài Nghiên'), roughness: 0.5 }), []);
  return <group>
    <mesh geometry={arch} material={stone} position={[0, 0, 0]} castShadow receiveShadow />
    <mesh position={[0, 3.7, 0]} material={stone} castShadow><boxGeometry args={[5.0, 0.2, 1.2]} /></mesh>
    <mesh position={[0, 3.15, 0.51]} material={plaque}><planeGeometry args={[1.6, 0.4]} /></mesh>
    {/* three stone frogs carrying the peach-shaped ink slab */}
    {[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + 0.5; return <group key={i} position={[Math.cos(a) * 0.45, 3.8, Math.sin(a) * 0.3]} rotation={[0, -a, 0]}>
      <mesh position={[0, 0.14, 0]} scale={[1.2, 0.8, 1]} material={m.rock}><sphereGeometry args={[0.18, 10, 8]} /></mesh>
      <mesh position={[0.17, 0.2, 0]} material={m.rock}><sphereGeometry args={[0.09, 8, 6]} /></mesh>
    </group>; })}
    <mesh position={[0, 4.18, 0]} scale={[1, 0.18, 0.75]} material={stone} castShadow><sphereGeometry args={[0.85, 18, 10]} /></mesh>
    <mesh position={[0.62, 4.2, 0]} rotation={[0, 0, -0.5]} material={stone}><coneGeometry args={[0.18, 0.4, 10]} /></mesh>
  </group>;
}

export function NgocSonApproach() {
  useEffect(() => {
    const list: Obstacle[] = [
      { x: TOWER[0], z: TOWER[1], hx: 2.3, hz: 2.3, angle: heading },
      // gate piers either side of the arch
      ...[-1, 1].map((s): Obstacle => { const [x, z] = at(4.4, s * 1.85); return { x, z, hx: 0.55, hz: 0.5, angle: heading }; }),
    ];
    return registerObstacles(list);
  }, []);
  return <group>
    <group position={[TOWER[0], GROUND_HEIGHT, TOWER[1]]} rotation={[0, heading, 0]}><PenTower /></group>
    <group position={[GATE[0], GROUND_HEIGHT, GATE[1]]} rotation={[0, heading, 0]}><InkSlabGate /></group>
  </group>;
}

// Dev hook for screenshot scripts.
if (import.meta.env.DEV) (window as unknown as { __thapbut?: unknown }).__thapbut = { TOWER, GATE, A, N };
