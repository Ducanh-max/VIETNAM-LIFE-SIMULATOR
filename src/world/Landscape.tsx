import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { bridgeEnds, centerOf, islands, offsetPolygon, shore, templeIsland, turtleIsland, type Point } from './geo';

function shapeFor(points: Point[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  return shape;
}

function fillGeometry(points: Point[]): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(shapeFor(points));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function ringGeometry(outer: Point[], inner: Point[]): THREE.ShapeGeometry {
  const shape = shapeFor(outer);
  const hole = new THREE.Path();
  inner.forEach(([x, z], index) => index ? hole.lineTo(x, -z) : hole.moveTo(x, -z));
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function surfaceMaps(kind: 'stone' | 'asphalt' | 'grass') {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  for (const canvas of [colorCanvas, normalCanvas, roughCanvas]) {
    canvas.width = size;
    canvas.height = size;
  }
  const contexts = [colorCanvas, normalCanvas, roughCanvas].map((canvas) => canvas.getContext('2d')!);
  const images = contexts.map((ctx) => ctx.createImageData(size, size));
  let seed = kind === 'stone' ? 42 : kind === 'asphalt' ? 91 : 19;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bases = kind === 'stone' ? [150, 146, 132] : kind === 'asphalt' ? [51, 57, 56] : [77, 106, 65];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grit = (random() - 0.5) * (kind === 'asphalt' ? 36 : 24);
      const seam = kind === 'stone' && (y % 42 < 2 || (x + (Math.floor(y / 42) % 2) * 32) % 64 < 2) ? -36 : 0;
      for (let channel = 0; channel < 3; channel++) images[0].data[i + channel] = bases[channel] + grit + seam;
      images[1].data[i] = 128 + grit * 0.35;
      images[1].data[i + 1] = 128 + grit * 0.35;
      images[1].data[i + 2] = 255;
      const roughness = kind === 'asphalt' ? 218 : kind === 'stone' ? 196 : 240;
      for (let channel = 0; channel < 3; channel++) images[2].data[i + channel] = roughness + grit * 0.3;
      for (const image of images) image.data[i + 3] = 255;
    }
  }
  images.forEach((image, index) => contexts[index].putImageData(image, 0, 0));
  return [colorCanvas, normalCanvas, roughCanvas].map((canvas, index) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === 'stone' ? 0.14 : 0.055, kind === 'stone' ? 0.14 : 0.055);
    texture.anisotropy = 4;
    if (index === 0) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

const waterVertex = `
  uniform float uTime;
  varying vec2 vWorld;
  varying vec3 vNormal;
  void main() {
    vWorld = position.xz;
    vec3 displaced = position;
    displaced.y += sin(position.x * 0.25 + uTime * 0.8) * 0.035;
    displaced.y += sin(position.z * 0.2 - uTime * 0.58) * 0.025;
    vNormal = normalize(vec3(-0.06 * cos(position.x * 0.25 + uTime * 0.8), 1.0, -0.04 * cos(position.z * 0.2 - uTime * 0.58)));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;
const waterFragment = `
  uniform float uTime;
  uniform vec3 uWater;
  uniform vec3 uSky;
  varying vec2 vWorld;
  varying vec3 vNormal;
  void main() {
    float a = sin(vWorld.x * 0.52 + vWorld.y * 0.11 + uTime * 0.95);
    float b = sin(vWorld.y * 0.35 - vWorld.x * 0.14 - uTime * 0.7);
    float c = sin((vWorld.x + vWorld.y) * 0.12 + uTime * 0.4);
    float wave = a * b * 0.5 + c * 0.2;
    float glint = pow(max(0.0, a * b), 12.0) * 0.13;
    vec3 color = mix(uWater, uSky, 0.23 + wave * 0.055 + glint);
    color += vec3(0.05, 0.09, 0.08) * pow(max(0.0, vNormal.y), 16.0) * glint;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export type TimeOfDay = 'day' | 'sunset' | 'night';

function LakeWater({ time }: { time: TimeOfDay }) {
  const geometry = useMemo(() => {
    const shape = shapeFor(shore);
    islands.forEach((island) => {
      const hole = new THREE.Path();
      island.forEach(([x, z], index) => index ? hole.lineTo(x, -z) : hole.moveTo(x, -z));
      hole.closePath();
      shape.holes.push(hole);
    });
    const value = new THREE.ShapeGeometry(shape);
    value.rotateX(-Math.PI / 2);
    return value;
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWater: { value: new THREE.Color('#205e5b') },
      uSky: { value: new THREE.Color('#8bbab5') },
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    side: THREE.DoubleSide,
  }), []);
  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
    material.uniforms.uWater.value.set(time === 'night' ? '#102c36' : time === 'sunset' ? '#405d66' : '#205e5b');
    material.uniforms.uSky.value.set(time === 'night' ? '#5d7d8a' : time === 'sunset' ? '#e79a78' : '#9cc7be');
  });
  return <mesh geometry={geometry} material={material} position={[0, 0.06, 0]} />;
}

function sampleRing(points: Point[], spacing: number): { point: Point; outward: Point; tangent: Point }[] {
  const samples = [];
  const center = centerOf(points);
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const count = Math.max(1, Math.round(length / spacing));
    for (let step = 0; step < count; step++) {
      const t = step / count;
      const point: Point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
      const radius = Math.hypot(point[0] - center[0], point[1] - center[1]);
      samples.push({ point, outward: [(point[0] - center[0]) / radius, (point[1] - center[1]) / radius] as Point,
        tangent: [(end[0] - start[0]) / length, (end[1] - start[1]) / length] as Point });
    }
  }
  return samples;
}

export function StreetFurniture({ time }: { time: TimeOfDay }) {
  const samples = useMemo(() => sampleRing(shore, 13).filter(({ point }) => Math.hypot(point[0] - bridgeEnds[0][0], point[1] - bridgeEnds[0][1]) > 9), []);
  const treeTrunks = useRef<THREE.InstancedMesh>(null);
  const treeCrowns = useRef<THREE.InstancedMesh>(null);
  const treeCrowns2 = useRef<THREE.InstancedMesh>(null);
  const lampPosts = useRef<THREE.InstancedMesh>(null);
  const lampHeads = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    samples.forEach(({ point, outward }, i) => {
      const x = point[0] + outward[0] * 5.5;
      const z = point[1] + outward[1] * 5.5;
      const height = 6.5 + (i * 31 % 7) * 0.46;
      position.set(x, height / 2, z);
      scale.set(0.7, height, 0.7);
      matrix.compose(position, quaternion, scale);
      treeTrunks.current?.setMatrixAt(i, matrix);
      position.set(x, height + 1.5, z);
      scale.set(5.4 + i % 3, 5.2, 5.4 + i % 3);
      matrix.compose(position, quaternion, scale);
      treeCrowns.current?.setMatrixAt(i, matrix);
      position.set(x + 1.4, height + 3.1, z - 0.6);
      scale.set(4.5, 4.1, 4.5);
      matrix.compose(position, quaternion, scale);
      treeCrowns2.current?.setMatrixAt(i, matrix);
      position.set(x + outward[0] * 3, 2.9, z + outward[1] * 3);
      scale.set(0.16, 5.8, 0.16);
      matrix.compose(position, quaternion, scale);
      lampPosts.current?.setMatrixAt(i, matrix);
      position.y = 5.9;
      scale.set(0.72, 0.72, 0.72);
      matrix.compose(position, quaternion, scale);
      lampHeads.current?.setMatrixAt(i, matrix);
    });
    for (const ref of [treeTrunks, treeCrowns, treeCrowns2, lampPosts, lampHeads]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [samples]);
  return <>
    <instancedMesh ref={treeTrunks} args={[undefined, undefined, samples.length]} castShadow receiveShadow><cylinderGeometry args={[0.55, 0.78, 1, 7]} /><meshStandardMaterial color="#65533d" roughness={0.96} /></instancedMesh>
    <instancedMesh ref={treeCrowns} args={[undefined, undefined, samples.length]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#315b3d" roughness={0.98} flatShading /></instancedMesh>
    <instancedMesh ref={treeCrowns2} args={[undefined, undefined, samples.length]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#4a7547" roughness={0.98} flatShading /></instancedMesh>
    <instancedMesh ref={lampPosts} args={[undefined, undefined, samples.length]}><cylinderGeometry args={[1, 1, 1, 6]} /><meshStandardMaterial color="#313d3b" metalness={0.6} roughness={0.4} /></instancedMesh>
    <instancedMesh ref={lampHeads} args={[undefined, undefined, samples.length]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={time === 'day' ? '#efe5bf' : '#ffcc82'} emissive="#ffbb66" emissiveIntensity={time === 'day' ? 0 : time === 'sunset' ? 1.2 : 2.6} /></instancedMesh>
    {samples.filter((_, index) => index % 3 === 0).map(({ point, outward, tangent }, index) => <group key={index} position={[point[0] + outward[0] * 3, 0.45, point[1] + outward[1] * 3]} rotation={[0, Math.atan2(tangent[0], tangent[1]), 0]}>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}><boxGeometry args={[2.6, 0.17, 0.65]} /><meshStandardMaterial color="#a49377" roughness={0.9} /></mesh>
      <mesh position={[0, 0.76, -0.28]}><boxGeometry args={[2.6, 0.68, 0.13]} /><meshStandardMaterial color="#82745f" roughness={0.9} /></mesh>
      {[-0.9, 0.9].map((x) => <mesh key={x} position={[x, 0.14, 0]}><boxGeometry args={[0.15, 0.4, 0.5]} /><meshStandardMaterial color="#58584b" /></mesh>)}
    </group>)}
  </>;
}

export function Landscape({ time }: { time: TimeOfDay }) {
  const [stoneMap, stoneNormal, stoneRough] = useMemo(() => surfaceMaps('stone'), []);
  const [roadMap, roadNormal, roadRough] = useMemo(() => surfaceMaps('asphalt'), []);
  const [grassMap, grassNormal, grassRough] = useMemo(() => surfaceMaps('grass'), []);
  const sidewalk = useMemo(() => ringGeometry(offsetPolygon(shore, 11), shore), []);
  const road = useMemo(() => ringGeometry(offsetPolygon(shore, 28), offsetPolygon(shore, 11)), []);
  const curb = useMemo(() => ringGeometry(offsetPolygon(shore, 1.2), shore), []);
  const islandGeometries = useMemo(() => [fillGeometry(templeIsland), fillGeometry(turtleIsland)], []);
  const laneMarks = useMemo(() => sampleRing(offsetPolygon(shore, 20), 9).filter((_, i) => i % 2 === 0), []);
  return <>
    <mesh receiveShadow position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1300, 1300]} /><meshStandardMaterial map={grassMap} normalMap={grassNormal} roughnessMap={grassRough} roughness={1} /></mesh>
    <LakeWater time={time} />
    <mesh geometry={sidewalk} receiveShadow position={[0, 0.14, 0]}><meshStandardMaterial map={stoneMap} normalMap={stoneNormal} roughnessMap={stoneRough} roughness={0.9} /></mesh>
    <mesh geometry={road} receiveShadow position={[0, 0.08, 0]}><meshStandardMaterial map={roadMap} normalMap={roadNormal} roughnessMap={roadRough} roughness={0.94} /></mesh>
    <mesh geometry={curb} receiveShadow position={[0, 0.24, 0]}><meshStandardMaterial color="#b8b4a5" roughness={0.92} /></mesh>
    {islandGeometries.map((geometry, index) => <mesh key={index} geometry={geometry} receiveShadow position={[0, 0.28, 0]}><meshStandardMaterial map={index ? stoneMap : grassMap} roughness={1} /></mesh>)}
    {laneMarks.map(({ point, tangent }, index) => <mesh key={index} position={[point[0], 0.095, point[1]]} rotation={[-Math.PI / 2, 0, Math.atan2(tangent[1], tangent[0])]}><planeGeometry args={[4.2, 0.2]} /><meshBasicMaterial color="#e7dca8" /></mesh>)}
    <StreetFurniture time={time} />
  </>;
}
