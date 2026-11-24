import { useMemo } from 'react';
import * as THREE from 'three';
import { BRIDGE_ARCH, BRIDGE_DECK_BASE, bridgeEnds, GROUND_HEIGHT, insidePolygon, ISLAND_HEIGHT, shore, templeIsland, turtleIsland } from '../geo';
import { barMatrix, Instances, unitBox, unitSphere } from './Instances';
import { materials } from './materials';
import { plankTexture, rng } from './textures';

function bridgePoint(t: number) {
  const [start, end] = bridgeEnds;
  return new THREE.Vector3(THREE.MathUtils.lerp(start[0], end[0], t), BRIDGE_DECK_BASE + Math.sin(Math.PI * t) * BRIDGE_ARCH, THREE.MathUtils.lerp(start[1], end[1], t));
}

function deckGeometry(normal: THREE.Vector2) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let length = 0;
  let previous = bridgePoint(0);
  for (let i = 0; i <= 60; i++) {
    const p = bridgePoint(i / 60);
    length += p.distanceTo(previous);
    previous = p;
    for (const y of [0, -0.23]) for (const sign of [-1, 1]) {
      vertices.push(p.x + normal.x * 1.3 * sign, p.y + y, p.z + normal.y * 1.3 * sign);
      uvs.push((sign + 1) * 1.3, length);
    }
    if (i < 60) {
      const a = i * 4;
      for (const [l, r] of [[0, 1], [2, 3], [0, 2], [1, 3]]) indices.push(a + l, a + 4 + l, a + r, a + r, a + 4 + l, a + 4 + r);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function GatePillar({ position, height, rotationY, lantern = false }: { position: THREE.Vector3; height: number; rotationY: number; lantern?: boolean }) {
  const m = materials();
  return <group position={position} rotation={[0, rotationY, 0]}>
    <mesh position={[0, 0.18, 0]} castShadow receiveShadow><boxGeometry args={[0.95, 0.36, 0.95]} /><primitive object={m.stone} attach="material" /></mesh>
    <mesh position={[0, 0.36 + height / 2, 0]} castShadow receiveShadow><boxGeometry args={[0.72, height, 0.72]} /><primitive object={m.warmStone} attach="material" /></mesh>
    <mesh position={[0, 0.42 + height, 0]} castShadow><boxGeometry args={[0.9, 0.16, 0.9]} /><primitive object={m.stone} attach="material" /></mesh>
    {lantern
      ? <group position={[0, 0.5 + height, 0]}>
          <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.42, 0.42, 0.42]} /><primitive object={m.lampGlow} attach="material" /></mesh>
          <mesh position={[0, 0.52, 0]} castShadow><coneGeometry args={[0.44, 0.32, 4]} /><primitive object={m.stone} attach="material" /></mesh>
        </group>
      : <mesh position={[0, 0.72 + height, 0]} castShadow><sphereGeometry args={[0.3, 10, 8]} /><primitive object={m.warmStone} attach="material" /></mesh>}
  </group>;
}

const lotusPad = new THREE.CircleGeometry(0.5, 14);

/**
 * Cầu Thê Húc after the reference sheet: red timber bridge with X-lattice railings,
 * posts with brass caps, paired square piers, a plank deck and stone gate pillars.
 * Map position and OSM length (~46 m) are kept.
 */
export function TheHucBridge() {
  const m = materials();
  const [start, end] = bridgeEnds;
  const normal = useMemo(() => new THREE.Vector2(-(end[1] - start[1]), end[0] - start[0]).normalize(), [start, end]);
  const deck = useMemo(() => deckGeometry(normal), [normal]);
  const deckMaterial = useMemo(() => new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.82, side: THREE.DoubleSide }), []);
  const lotus = useMemo(() => ({
    leaf: new THREE.MeshStandardMaterial({ color: '#4f8a3c', roughness: 0.75, side: THREE.DoubleSide }),
    flower: new THREE.MeshStandardMaterial({ color: '#f29bbd', roughness: 0.6, emissive: '#5a1a2c', emissiveIntensity: 0.15 }),
  }), []);
  const heading = -Math.atan2(end[1] - start[1], end[0] - start[0]);
  const parts = useMemo(() => {
    const posts: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    const bars: THREE.Matrix4[] = [];
    const piers: THREE.Matrix4[] = [];
    const pads: THREE.Matrix4[] = [];
    const flowers: THREE.Matrix4[] = [];
    const side = (p: THREE.Vector3, offset: number, y = 0) => new THREE.Vector3(p.x + normal.x * offset, p.y + y, p.z + normal.y * offset);
    const panels = 15;
    const rail = 1.36;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    for (let i = 0; i <= panels; i++) {
      const p = bridgePoint(i / panels);
      const endPost = i === 0 || i === panels;
      for (const sign of [-1, 1]) {
        const base = side(p, rail * sign);
        const h = endPost ? 1.35 : 1.18;
        posts.push(new THREE.Matrix4().compose(base.clone().setY(base.y + h / 2 - 0.05), q, new THREE.Vector3(0.17, h, 0.17)));
        const c = endPost ? 0.3 : 0.24;
        caps.push(new THREE.Matrix4().compose(base.clone().setY(base.y + h + 0.02), q, new THREE.Vector3(c, c, c)));
        const foot = side(p, 1.05 * sign);
        const top = p.y - 0.25;
        piers.push(new THREE.Matrix4().compose(new THREE.Vector3(foot.x, (top - 1.2) / 2, foot.z), q, new THREE.Vector3(0.36, top + 1.2, 0.36)));
      }
      piers.push(barMatrix(side(p, -1.3, -0.3), side(p, 1.3, -0.3), 0.22, 0.26));
      if (i === panels) break;
      const n = bridgePoint((i + 1) / panels);
      for (const sign of [-1, 1]) {
        const a = side(p, rail * sign);
        const b = side(n, rail * sign);
        const at = (v: THREE.Vector3, y: number) => v.clone().setY(v.y + y);
        bars.push(barMatrix(at(a, 1.02), at(b, 1.02), 0.11, 0.13));
        bars.push(barMatrix(at(a, 0.2), at(b, 0.2), 0.08, 0.09));
        bars.push(barMatrix(at(a, 0.2), at(b, 1.02), 0.06, 0.06));
        bars.push(barMatrix(at(a, 1.02), at(b, 0.2), 0.06, 0.06));
        bars.push(barMatrix(at(a, 0.61), at(b, 0.61), 0.05, 0.05));
      }
    }
    const r = rng(7);
    for (let k = 0; k < 120; k++) {
      const p = bridgePoint(r());
      const offset = (r() < 0.5 ? -1 : 1) * (3 + r() * 14);
      const x = p.x + normal.x * offset + (r() - 0.5) * 6;
      const z = p.z + normal.y * offset + (r() - 0.5) * 6;
      if (!insidePolygon([x, z], shore) || insidePolygon([x, z], templeIsland) || insidePolygon([x, z], turtleIsland)) continue;
      const s = 0.55 + r() * 0.6;
      pads.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.07, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, r() * Math.PI * 2)), new THREE.Vector3(s, s, s)));
      if (r() < 0.3) flowers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.3, z), new THREE.Quaternion(), new THREE.Vector3(0.26, 0.22, 0.26)));
    }
    return { posts, caps, bars, piers, pads, flowers };
  }, [normal, heading]);
  const along = new THREE.Vector3(end[0] - start[0], 0, end[1] - start[1]).normalize();
  const gate = (t: number, sign: number, outward: number, y: number) => {
    const p = bridgePoint(t);
    return new THREE.Vector3(p.x + normal.x * 1.75 * sign + along.x * outward, y, p.z + normal.y * 1.75 * sign + along.z * outward);
  };
  return <group>
    <mesh geometry={deck} material={deckMaterial} castShadow receiveShadow />
    <Instances geometry={unitBox} material={m.red} matrices={parts.posts} />
    <Instances geometry={unitSphere} material={m.gold} matrices={parts.caps} />
    <Instances geometry={unitBox} material={m.red} matrices={parts.bars} />
    <Instances geometry={unitBox} material={m.darkRed} matrices={parts.piers} />
    <Instances geometry={lotusPad} material={lotus.leaf} matrices={parts.pads} castShadow={false} />
    <Instances geometry={unitSphere} material={lotus.flower} matrices={parts.flowers} castShadow={false} />
    {[-1, 1].map((sign) => <GatePillar key={`s${sign}`} position={gate(0, sign, -1.6, GROUND_HEIGHT)} height={1.7} rotationY={heading} lantern />)}
    {[-1, 1].map((sign) => <GatePillar key={`e${sign}`} position={gate(1, sign, 0.6, ISLAND_HEIGHT)} height={1.35} rotationY={heading} />)}
  </group>;
}
