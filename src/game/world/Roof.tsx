import { useMemo } from 'react';
import * as THREE from 'three';
import { materials } from './materials';
import { cornerCurlGeometry, curvedRoofGeometry, ridgeDragonGeometry } from './roof';

/** A complete tiled roof: curved surface, ridge beam, corner curls and ridge dragons. */
export function Roof({ width, depth, rise, y = 0, ridge, curl = 0.7, dragons = true, pearl = false }: {
  width: number; depth: number; rise: number; y?: number; ridge?: number; curl?: number; dragons?: boolean; pearl?: boolean;
}) {
  const m = materials();
  const ridgeLength = ridge ?? width * 0.45;
  const surface = useMemo(() => curvedRoofGeometry(width, depth, rise, { ridge: ridgeLength, curl }), [width, depth, rise, ridgeLength, curl]);
  const curlGeometry = useMemo(() => cornerCurlGeometry(Math.min(width, depth) * 0.16, curl * 0.9 + 0.2), [width, depth, curl]);
  const dragon = useMemo(() => ridgeDragonGeometry(Math.max(0.6, rise * 0.55)), [rise]);
  const hw = width / 2;
  const hd = depth / 2;
  return <group position={[0, y, 0]}>
    <mesh geometry={surface} material={m.roof} castShadow receiveShadow />
    {/* eave fascia */}
    <mesh position={[0, -0.08, 0]} castShadow><boxGeometry args={[width * 0.86, 0.16, depth * 0.86]} /><primitive object={m.timber} attach="material" /></mesh>
    {/* ridge */}
    <mesh position={[0, rise + 0.08, 0]} castShadow><boxGeometry args={[ridgeLength + 0.3, 0.26, 0.3]} /><primitive object={m.ridge} attach="material" /></mesh>
    {/* hip ridges */}
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
      const from = new THREE.Vector3(sx * ridgeLength / 2, rise + 0.05, 0);
      const to = new THREE.Vector3(sx * hw * 0.93, curl * 0.85, sz * hd * 0.93);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const dir = to.clone().sub(from);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
      return <mesh key={`${sx}${sz}`} position={mid} quaternion={q} castShadow><boxGeometry args={[dir.length(), 0.18, 0.2]} /><primitive object={m.ridge} attach="material" /></mesh>;
    }))}
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`c${sx}${sz}`} geometry={curlGeometry} material={m.ridge} position={[sx * hw * 0.9, curl * 0.8, sz * hd * 0.9]}
      rotation={[0, Math.atan2(-sz * hd, sx * hw), 0]} castShadow />))}
    {dragons && [-1, 1].map((sx) => <mesh key={`d${sx}`} geometry={dragon} material={m.ridge} position={[sx * (ridgeLength / 2 + 0.1), rise + 0.2, 0]} scale={[sx, 1, 1]} castShadow />)}
    {pearl && <group position={[0, rise + 0.22, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow><sphereGeometry args={[0.28, 14, 10]} /><primitive object={m.gold} attach="material" /></mesh>
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.12, 0.2, 0.3, 8]} /><primitive object={m.ridge} attach="material" /></mesh>
    </group>}
  </group>;
}
