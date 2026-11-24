import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import {
  bridgeEnds, distanceToSegment, promenadeEdge, streetRing, GROUND_HEIGHT, offsetRing, roadInner, sampleRing, shore,
  templeIsland, turtleIsland, type Point,
} from '../geo';
import { Instances, trs, unitBox } from './Instances';
import { materials } from './materials';
import { roadClearance } from '../osm';
import { grassTexture, pavingTexture, rng, waterNormals } from './textures';
import { Trees, type Tree } from './Vegetation';

export type TimeOfDay = 'day' | 'sunset' | 'night';

/** Flat band between two closed rings (outer minus inner); UVs are world metres. */
function ringBand(inner: Point[], outer: Point[], y: number) {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes.push(new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
  return g;
}

/** Vertical wall ribbon along a ring (lake embankment). */
function wallRibbon(ring: Point[], bottom: number, top: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let distance = 0;
  const n = ring.length;
  for (let i = 0; i <= n; i++) {
    const a = ring[i % n];
    if (i > 0) { const p = ring[(i - 1) % n]; distance += Math.hypot(a[0] - p[0], a[1] - p[1]); }
    positions.push(a[0], bottom, a[1], a[0], top, a[1]);
    uvs.push(distance / 4, 0, distance / 4, (top - bottom));
    if (i < n) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function repeated(texture: THREE.Texture, u: number, v: number) {
  const t = texture.clone();
  t.needsUpdate = true;
  t.repeat.set(u, v);
  return t;
}

/** Hồ Gươm water. High quality uses a planar-reflection water shader; lower settings use a cheap animated normal-mapped surface. */
function Lake({ reflections, time, sun }: { reflections: boolean; time: TimeOfDay; sun: THREE.Vector3 }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(shore.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const island of [templeIsland, turtleIsland]) shape.holes.push(new THREE.Path(offsetRing(island, -0.3).map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const waterColor = time === 'night' ? '#10282c' : time === 'sunset' ? '#4a6a62' : '#4d8a84';
  const water = useMemo(() => {
    if (!reflections) return null;
    const normals = waterNormals();
    const w = new Water(geometry, {
      textureWidth: 512, textureHeight: 512, waterNormals: normals, sunDirection: sun.clone().normalize(),
      sunColor: 0xfff2d8, waterColor: new THREE.Color(waterColor), distortionScale: 1.6, fog: true, alpha: 1,
    });
    w.position.y = 0.02;
    w.receiveShadow = true;
    return w;
  }, [reflections, geometry, sun, waterColor]);
  const simple = useMemo(() => {
    const normals = repeated(waterNormals(), 1 / 9, 1 / 9);
    return new THREE.MeshStandardMaterial({ color: waterColor, roughness: 0.12, metalness: 0.15, normalMap: normals, normalScale: new THREE.Vector2(0.22, 0.22) });
  }, [waterColor]);
  useFrame((_, dt) => {
    if (water) (water.material as THREE.ShaderMaterial).uniforms.time.value += dt * 0.35;
    else if (simple.normalMap) simple.normalMap.offset.x += dt * 0.004;
  });
  return <>
    {water ? <primitive object={water} /> : <mesh geometry={geometry} material={simple} position={[0, 0.02, 0]} receiveShadow />}
    {/* lake bed so the embankment does not show a void at grazing angles */}
    <mesh geometry={geometry} position={[0, -1.2, 0]}><meshBasicMaterial color="#14251f" /></mesh>
  </>;
}

/** Lake wall, promenade and green verge; the streets beyond come from OpenStreetMap (Streets.tsx). */
function Ground() {
  const m = materials();
  const mats = useMemo(() => ({
    paving: new THREE.MeshStandardMaterial({ map: repeated(pavingTexture(), 1 / 3, 1 / 3), roughness: 0.9 }),
    sidewalk: new THREE.MeshStandardMaterial({ map: repeated(pavingTexture(), 1 / 3, 1 / 3), color: '#d8d2c8', roughness: 0.9 }),
    grass: new THREE.MeshStandardMaterial({ map: repeated(grassTexture(), 1 / 6, 1 / 6), roughness: 0.95 }),
    granite: m.granite,
    curb: new THREE.MeshStandardMaterial({ color: '#b9b4a8', roughness: 0.85 }),
    outer: new THREE.MeshStandardMaterial({ map: repeated(pavingTexture(), 1 / 3, 1 / 3), color: '#bdb6aa', roughness: 0.95 }),
  }), [m.granite]);
  const geometry = useMemo(() => {
    const coping = offsetRing(shore, 0.55);
    const verge = promenadeEdge;
    return {
      wall: wallRibbon(shore, -1.2, GROUND_HEIGHT + 0.12),
      coping: ringBand(shore, coping, GROUND_HEIGHT + 0.12),
      promenade: ringBand(coping, verge, GROUND_HEIGHT),
      grass: ringBand(verge, roadInner, GROUND_HEIGHT + 0.02),
      curbIn: wallRibbon(roadInner, GROUND_HEIGHT - 0.05, GROUND_HEIGHT + 0.02),
    };
  }, []);
  const corridorGround = useMemo(() => {
    const g = new THREE.PlaneGeometry(3340, 1240, 1, 1);
    g.rotateX(-Math.PI / 2); g.translate(-2950, 0, -190);
    const uv = g.getAttribute('uv'); const pos = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    return g;
  }, []);
  const outerGround = useMemo(() => {
    const shape = new THREE.Shape([new THREE.Vector2(-1400, -1400), new THREE.Vector2(1400, -1400), new THREE.Vector2(1400, 1400), new THREE.Vector2(-1400, 1400)]);
    shape.holes.push(new THREE.Path(streetRing(12 - 0.3).map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    const pos = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    return g;
  }, []);
  return <group>
    <mesh geometry={geometry.wall} material={mats.granite} receiveShadow />
    <mesh geometry={geometry.coping} material={mats.curb} receiveShadow />
    <mesh geometry={geometry.promenade} material={mats.paving} receiveShadow />
    <mesh geometry={geometry.grass} material={mats.grass} receiveShadow />
    <mesh geometry={geometry.curbIn} material={mats.curb} />
    {/* pavement under the whole district; OSM roads and buildings sit on top */}
    <mesh geometry={outerGround} position={[0, GROUND_HEIGHT - 0.02, 0]} receiveShadow><primitive object={mats.outer} attach="material" /></mesh>
    {/* ground under the corridor west to Lotte (x −4600…−1300) */}
    <mesh geometry={corridorGround} position={[0, GROUND_HEIGHT - 0.02, 0]} receiveShadow><primitive object={mats.outer} attach="material" /></mesh>
  </group>;
}

/** Cast-iron lamp posts, benches and the lakeside trees (willows on the water's edge, shade trees behind). */
function StreetLife({ time }: { time: TimeOfDay }) {
  const m = materials();
  const { trees, poles, lanterns, benches, benchLegs } = useMemo(() => {
    const r = rng(17);
    const list: Tree[] = [];
    const nearBridge = (p: Point) => distanceToSegment(p, bridgeEnds[0], [bridgeEnds[0][0] + (bridgeEnds[0][0] - bridgeEnds[1][0]) * 0.4, bridgeEnds[0][1] + (bridgeEnds[0][1] - bridgeEnds[1][1]) * 0.4]) < 7;
    for (const { point } of sampleRing(offsetRing(shore, 1.6), 17)) if (!nearBridge(point) && r() < 0.85) list.push({ x: point[0] + (r() - 0.5), z: point[1] + (r() - 0.5), y: GROUND_HEIGHT, kind: 'willow', scale: 0.9 + r() * 0.3 });
    for (const { point } of sampleRing(streetRing(10.5), 11)) if (!nearBridge(point) && roadClearance(point) > 1.5) list.push({ x: point[0], z: point[1], y: GROUND_HEIGHT, kind: r() < 0.12 ? 'blossom' : r() < 0.2 ? 'banyan' : 'shade', scale: 0.9 + r() * 0.35 });
    const pole: THREE.Matrix4[] = [];
    const lamp: THREE.Matrix4[] = [];
    for (const { point } of sampleRing(offsetRing(shore, 4.2), 22)) {
      if (nearBridge(point)) continue;
      pole.push(trs(point[0], GROUND_HEIGHT + 2.1, point[1], 0, 0.14, 4.2, 0.14));
      pole.push(trs(point[0], GROUND_HEIGHT + 0.35, point[1], 0, 0.34, 0.7, 0.34));
      lamp.push(trs(point[0], GROUND_HEIGHT + 4.45, point[1], 0, 0.55, 0.62, 0.55));
    }
    const bench: THREE.Matrix4[] = [];
    const legs: THREE.Matrix4[] = [];
    for (const { point, angle } of sampleRing(streetRing(7.4), 26)) {
      if (nearBridge(point) || r() < 0.3) continue;
      bench.push(trs(point[0], GROUND_HEIGHT + 0.45, point[1], -angle, 1.8, 0.08, 0.5));
      bench.push(trs(point[0] + Math.sin(angle) * 0.22, GROUND_HEIGHT + 0.75, point[1] - Math.cos(angle) * 0.22, -angle, 1.8, 0.4, 0.06));
      legs.push(trs(point[0], GROUND_HEIGHT + 0.22, point[1], -angle, 1.6, 0.44, 0.42));
    }
    return { trees: list, poles: pole, lanterns: lamp, benches: bench, benchLegs: legs };
  }, []);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffc46b', emissiveIntensity: time === 'night' ? 2.2 : time === 'sunset' ? 0.8 : 0.05, roughness: 0.4 }), [time]);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.8 }), []);
  return <group>
    <Trees trees={trees} seed={3} />
    <Instances geometry={unitCylinder} material={m.iron} matrices={poles} castShadow={false} /> {/* thin poles: their sub-texel shadows shimmer as streaks */}
    <Instances geometry={lampGeometry} material={glow} matrices={lanterns} castShadow={false} />
    <Instances geometry={unitBox} material={wood} matrices={benches} />
    <Instances geometry={unitBox} material={m.iron} matrices={benchLegs} />
  </group>;
}
const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const lampGeometry = new THREE.SphereGeometry(0.5, 12, 10);

export function Lakeside({ time, reflections, sun }: { time: TimeOfDay; reflections: boolean; sun: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  return <group ref={group}>
    <Lake reflections={reflections} time={time} sun={sun} />
    <Ground />
    <StreetLife time={time} />
  </group>;
}
