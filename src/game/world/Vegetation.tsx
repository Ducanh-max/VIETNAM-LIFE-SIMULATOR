import { useMemo } from 'react';
import * as THREE from 'three';
import { Instances, trs } from './Instances';
import { materials } from './materials';
import { rng } from './textures';

/**
 * Hà Nội's trees: sấu (tall, dense dark crown), bàng (flat tiers of big leaves, some turning red), xà cừ (huge, wide,
 * old), phượng (flat umbrella, red flowers in summer), lộc vừng (low, leaning over the lake, red catkins), liễu rủ
 * (willow), plus the generic shade / blossom / banyan. `whitewash`: the lower trunk painted with lime, as on
 * Hà Nội's streets.
 */
export type TreeKind = 'shade' | 'willow' | 'blossom' | 'banyan' | 'sau' | 'bang' | 'xacu' | 'phuong' | 'locvung';
export type Tree = { x: number; z: number; y?: number; scale?: number; kind: TreeKind; whitewash?: boolean };
const SHAPE: Partial<Record<TreeKind, { tall: number; wide: number; trunk: number; blobs: number; flat: number; color: () => [number, number, number] }>> = {
  sau: { tall: 9, wide: 5.2, trunk: 1.6, blobs: 3, flat: 1, color: () => [0.27, 0.5, 0.2] },
  xacu: { tall: 11, wide: 9.5, trunk: 2.6, blobs: 4, flat: 0.85, color: () => [0.25, 0.32, 0.28] },
  bang: { tall: 6.5, wide: 7.5, trunk: 1.9, blobs: 3, flat: 0.45, color: () => [0.22, 0.5, 0.3] },
  phuong: { tall: 6, wide: 8.5, trunk: 1.8, blobs: 3, flat: 0.5, color: () => [0.26, 0.45, 0.32] },
  locvung: { tall: 4.2, wide: 5.5, trunk: 1.8, blobs: 2, flat: 0.7, color: () => [0.24, 0.45, 0.3] },
};

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
const limeWash = new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.95 });
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
    const wash: THREE.Matrix4[] = [];
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
      const sh = SHAPE[tree.kind];
      if (sh) {
        const h = sh.tall * s;
        trunks.push(trs(tree.x, y, tree.z, r() * 6, sh.trunk * s, h, sh.trunk * s, lean * (tree.kind === 'locvung' ? 3 : 1), lean));
        if (tree.whitewash) wash.push(trs(tree.x, y, tree.z, 0, sh.trunk * s * 1.12, 1.1, sh.trunk * s * 1.12));
        for (let i = 0; i < sh.blobs; i++) {
          const angle = r() * Math.PI * 2;
          const off = i === 0 ? 0 : sh.wide * 0.27 * s;
          // bàng grows in flat stacked tiers
          const tier = tree.kind === 'bang' ? -i * 1.3 * s : (i === 0 ? 0.5 : -0.3 + r() * 0.8) * s;
          const target = i % 2 ? b : a;
          const w = sh.wide * s * (i === 0 ? 0.45 : 0.33) * (tree.kind === 'bang' ? 1 - i * 0.12 : 1);
          target.push(trs(tree.x + (tree.kind === 'bang' ? 0 : Math.cos(angle) * off), y + h + tier, tree.z + (tree.kind === 'bang' ? 0 : Math.sin(angle) * off), r() * 6, w, w * sh.flat * 0.8, w));
          const [hh, ss, ll] = sh.color();
          const flower = (tree.kind === 'phuong' && r() < 0.55) || (tree.kind === 'bang' && r() < 0.15);
          const color = flower ? new THREE.Color().setHSL(0.01 + r() * 0.03, 0.75, 0.45 + r() * 0.08) : new THREE.Color().setHSL(hh + (r() - 0.5) * 0.04, ss + (r() - 0.5) * 0.1, ll + (r() - 0.5) * 0.06);
          (i % 2 ? bColor : aColor).push(color);
        }
        if (tree.kind === 'locvung') for (let i = 0; i < 8; i++) { // red catkins hanging under the crown
          const angle = r() * Math.PI * 2, rad = (0.8 + r() * 1.6) * s;
          strands.push(trs(tree.x + Math.cos(angle) * rad, y + h - 0.2 * s, tree.z + Math.sin(angle) * rad, 0, 0.12 * s, (0.6 + r() * 0.5) * s, 0.12 * s));
          strandColor.push(new THREE.Color().setHSL(0.98, 0.7, 0.42 + r() * 0.08));
        }
        continue;
      }
      const tall = tree.kind === 'banyan' ? 6.5 : tree.kind === 'blossom' ? 3.6 : 7.5;
      const wide = tree.kind === 'banyan' ? 8.5 : tree.kind === 'blossom' ? 4.2 : 6.2;
      const h = tall * s;
      trunks.push(trs(tree.x, y, tree.z, r() * 6, (tree.kind === 'banyan' ? 3 : 1.7) * s, h, (tree.kind === 'banyan' ? 3 : 1.7) * s, lean, lean));
      if (tree.whitewash) wash.push(trs(tree.x, y, tree.z, 0, (tree.kind === 'banyan' ? 3 : 1.7) * s * 1.12, 1.1, (tree.kind === 'banyan' ? 3 : 1.7) * s * 1.12));
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
    return { trunks, wash, a, aColor, b, bColor, strands, strandColor };
  }, [trees, seed]);
  const strandMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide, flatShading: true }), []);
  return <group>
    <Instances geometry={trunkGeometry} material={m.bark} matrices={data.trunks} />
    {data.wash.length > 0 && <Instances geometry={trunkGeometry} material={limeWash} matrices={data.wash} castShadow={false} />}
    <Instances geometry={canopyA} material={m.leaf} matrices={data.a} colors={data.aColor} />
    <Instances geometry={canopyB} material={m.leaf} matrices={data.b} colors={data.bColor} />
    <Instances geometry={strandGeometry} material={strandMaterial} matrices={data.strands} colors={data.strandColor} castShadow={false} />
  </group>;
}
