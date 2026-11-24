import { useMemo } from 'react';
import * as THREE from 'three';
import { Instances, trs } from './Instances';
import { materials } from './materials';
import { rng } from './textures';

export type TreeKind = 'shade' | 'willow' | 'blossom' | 'banyan';
export type Tree = { x: number; z: number; y?: number; scale?: number; kind: TreeKind };

/** Canopy blob: a few merged, slightly squashed icosahedra so silhouettes are not perfect spheres. */
function canopyGeometry(seed: number, low = false) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (low ? 4 : 6); i++) {
    const g = new THREE.IcosahedronGeometry(0.45 + r() * 0.3, low ? 0 : 1);
    g.scale(1, 0.75 + r() * 0.2, 1);
    g.translate((r() - 0.5) * 0.9, (r() - 0.3) * 0.5, (r() - 0.5) * 0.9);
    parts.push(g.toNonIndexed());
  }
  const merged = mergeGeometries(parts);
  // Jitter vertices a little for a leafy look.
  const position = merged.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i) * (0.95 + r() * 0.1), position.getY(i) * (0.95 + r() * 0.1), position.getZ(i) * (0.95 + r() * 0.1));
  merged.computeVertexNormals();
  return merged;
}

function mergeGeometries(parts: THREE.BufferGeometry[]) {
  const total = parts.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
  const positions = new Float32Array(total * 3);
  let offset = 0;
  for (const g of parts) {
    positions.set(g.getAttribute('position').array as Float32Array, offset);
    offset += g.getAttribute('position').count * 3;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return merged;
}

const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.19, 1, 7);
trunkGeometry.translate(0, 0.5, 0);
const strandGeometry = new THREE.ConeGeometry(0.5, 1, 6, 1, true);
strandGeometry.rotateX(Math.PI);
strandGeometry.translate(0, -0.5, 0);

/**
 * All lakeside trees in a handful of draw calls: trunks, two canopy shapes and
 * willow strands are each one InstancedMesh, tinted per instance.
 */
/** low uses ~80-triangle canopies for the thousands of street and garden trees away from the lake. */
export function Trees({ trees, seed = 1, low = false }: { trees: Tree[]; seed?: number; low?: boolean }) {
  const m = materials();
  const canopyA = useMemo(() => canopyGeometry(seed * 3 + 1, low), [seed, low]);
  const canopyB = useMemo(() => canopyGeometry(seed * 3 + 2, low), [seed, low]);
  const data = useMemo(() => {
    const r = rng(seed * 97 + 5);
    const trunks: THREE.Matrix4[] = [];
    const a: THREE.Matrix4[] = []; const aColor: THREE.Color[] = [];
    const b: THREE.Matrix4[] = []; const bColor: THREE.Color[] = [];
    const strands: THREE.Matrix4[] = []; const strandColor: THREE.Color[] = [];
    for (const tree of trees) {
      const s = (tree.scale ?? 1) * (0.85 + r() * 0.3);
      const y = tree.y ?? 0;
      const lean = (r() - 0.5) * 0.12;
      if (tree.kind === 'willow') {
        const h = 5.5 * s;
        trunks.push(trs(tree.x, y, tree.z, r() * 6, 1.6 * s, h, 1.6 * s, lean, lean));
        const crown = new THREE.Vector3(tree.x, y + h, tree.z);
        a.push(trs(crown.x, crown.y + 0.3 * s, crown.z, r() * 6, 1.8 * s, 0.9 * s, 1.8 * s));
        aColor.push(new THREE.Color().setHSL(0.22, 0.45, 0.42 + r() * 0.06));
        const count = 16;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + r() * 0.3;
          const radius = (1.0 + r() * 1.1) * s;
          const length = (3.2 + r() * 2.0) * s;
          strands.push(trs(crown.x + Math.cos(angle) * radius, crown.y + 0.4 * s, crown.z + Math.sin(angle) * radius, r() * 6, (0.45 + r() * 0.35) * s, length, (0.45 + r() * 0.35) * s, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15));
          strandColor.push(new THREE.Color().setHSL(0.2 + r() * 0.04, 0.5, 0.4 + r() * 0.1));
        }
        continue;
      }
      const tall = tree.kind === 'banyan' ? 6.5 : tree.kind === 'blossom' ? 3.6 : 7.5;
      const wide = tree.kind === 'banyan' ? 8.5 : tree.kind === 'blossom' ? 4.2 : 6.2;
      const h = tall * s;
      trunks.push(trs(tree.x, y, tree.z, r() * 6, (tree.kind === 'banyan' ? 3 : 1.7) * s, h, (tree.kind === 'banyan' ? 3 : 1.7) * s, lean, lean));
      const blobs = tree.kind === 'banyan' ? 4 : tree.kind === 'blossom' ? 2 : 3;
      for (let i = 0; i < blobs; i++) {
        const angle = r() * Math.PI * 2;
        const off = i === 0 ? 0 : wide * 0.28 * s;
        const target = i % 2 ? b : a;
        target.push(trs(tree.x + Math.cos(angle) * off, y + h + (i === 0 ? 0.6 : -0.3 + r() * 0.8) * s, tree.z + Math.sin(angle) * off, r() * 6, wide * s * (i === 0 ? 0.45 : 0.32), wide * s * (i === 0 ? 0.36 : 0.27), wide * s * (i === 0 ? 0.45 : 0.32)));
        const color = tree.kind === 'blossom'
          ? new THREE.Color().setHSL(0.93 + r() * 0.04, 0.55, 0.7 + r() * 0.08)
          : new THREE.Color().setHSL(0.24 + r() * 0.07, 0.42 + r() * 0.15, 0.27 + r() * 0.1);
        (i % 2 ? bColor : aColor).push(color);
      }
    }
    return { trunks, a, aColor, b, bColor, strands, strandColor };
  }, [trees, seed]);
  const strandMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), []);
  return <group>
    <Instances geometry={trunkGeometry} material={m.bark} matrices={data.trunks} />
    <Instances geometry={canopyA} material={m.leaf} matrices={data.a} colors={data.aColor} />
    <Instances geometry={canopyB} material={m.leaf} matrices={data.b} colors={data.bColor} />
    <Instances geometry={strandGeometry} material={strandMaterial} matrices={data.strands} colors={data.strandColor} castShadow={false} />
  </group>;
}
