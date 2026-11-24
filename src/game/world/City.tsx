import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildingLine, GROUND_HEIGHT, insidePolygon, registerObstacles, sampleRing, streetRing, type Obstacle } from '../geo';
import { Instances, trs, unitBox } from './Instances';
import { facadeTexture, rng, roofTileTexture, type FacadeStyle } from './textures';

const FLOOR = 3.4;
const styles: { style: FacadeStyle; bays: number; floors: number[]; depth: [number, number]; side: string; weight: number }[] = [
  { style: 'tube', bays: 1, floors: [4, 5, 6], depth: [14, 20], side: '#cfc4ad', weight: 0.42 },
  { style: 'shop', bays: 2, floors: [3, 4], depth: [12, 16], side: '#d8ccb4', weight: 0.25 },
  { style: 'colonial', bays: 3, floors: [2, 3], depth: [14, 18], side: '#e2c27a', weight: 0.2 },
  { style: 'modern', bays: 3, floors: [6, 8], depth: [16, 20], side: '#c9cfd2', weight: 0.13 },
];

type Placed = { key: string; style: typeof styles[number]; variant: number; floors: number; matrix: THREE.Matrix4; x: number; z: number; w: number; d: number; h: number; angle: number };

/**
 * The street wall around the lake: Hà Nội tube houses, shophouses with Vietnamese signs,
 * yellow French colonial villas and a few modern blocks. Each facade type is one InstancedMesh.
 */
export function City() {
  const placed = useMemo(() => {
    const r = rng(2024);
    const list: Placed[] = [];
    const samples = sampleRing(buildingLine, 1);
    let i = 0;
    let sinceGap = 0;
    while (i < samples.length) {
      const pick = r();
      let acc = 0;
      const style = styles.find((s) => (acc += s.weight) >= pick) ?? styles[0];
      const w = style.bays * 4;
      if (sinceGap > 70 + r() * 40) { i += 12; sinceGap = 0; continue; } // side street
      const mid = samples[Math.min(samples.length - 1, i + Math.floor(w / 2))];
      i += w + (r() < 0.2 ? 1 : 0);
      sinceGap += w;
      const a = mid.angle;
      let nx = Math.sin(a);
      let nz = -Math.cos(a);
      // make n point toward the lake
      if (!insidePolygon([mid.point[0] + nx * 3, mid.point[1] + nz * 3], buildingLine)) { nx = -nx; nz = -nz; }
      const d = style.depth[0] + r() * (style.depth[1] - style.depth[0]);
      const floors = style.floors[Math.floor(r() * style.floors.length)];
      const variant = Math.floor(r() * 3);
      const h = floors * FLOOR;
      const x = mid.point[0] - nx * (d / 2 + 0.2);
      const z = mid.point[1] - nz * (d / 2 + 0.2);
      const angle = Math.atan2(nx, nz);
      list.push({ key: `${style.style}-${variant}-${floors}`, style, variant, floors, matrix: trs(x, GROUND_HEIGHT + h / 2, z, angle, w - 0.15, h, d), x, z, w, d, h, angle });
    }
    return list;
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const p of placed) map.set(p.key, [...(map.get(p.key) ?? []), p]);
    return [...map.values()].map((items) => {
      const { style, variant, floors } = items[0];
      const facade = facadeTexture(style.style, variant, floors).clone();
      facade.needsUpdate = true;
      facade.repeat.set(style.bays, 1);
      const front = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 });
      const side = new THREE.MeshStandardMaterial({ color: style.side, roughness: 0.95 });
      const top = new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 0.95 });
      return { key: items[0].key, materials: [side, side, top, top, front, side], matrices: items.map((p) => p.matrix) };
    });
  }, [placed]);

  const extras = useMemo(() => {
    const r = rng(77);
    const tanks: THREE.Matrix4[] = [];
    const parapets: THREE.Matrix4[] = [];
    const roofs: THREE.Matrix4[] = [];
    const awnings: THREE.Matrix4[] = [];
    const awningColors: THREE.Color[] = [];
    for (const p of placed) {
      const top = GROUND_HEIGHT + p.h;
      const local = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.angle).add(new THREE.Vector3(p.x, 0, p.z));
      if (p.style.style === 'colonial') {
        const c = local(0, top, 0);
        roofs.push(trs(c.x, c.y, c.z, p.angle, p.w + 0.6, 2.4, p.d + 0.4));
      } else {
        const front = local(0, top + 0.45, p.d / 2 - 0.1);
        parapets.push(trs(front.x, front.y, front.z, p.angle, p.w - 0.1, 0.9, 0.2));
        if (r() < 0.7) { const t = local((r() - 0.5) * (p.w - 2), top + 0.75, (r() - 0.5) * (p.d - 4)); tanks.push(trs(t.x, t.y, t.z, 0, 1.1, 1.5, 1.1, 0, Math.PI / 2)); }
      }
      if (p.style.style === 'shop' || p.style.style === 'tube') {
        const aw = local(0, GROUND_HEIGHT + 3.0, p.d / 2 + 0.7);
        awnings.push(trs(aw.x, aw.y, aw.z, p.angle, p.w - 0.4, 0.08, 1.5, -0.25));
        awningColors.push(new THREE.Color(['#c0392b', '#2e6f9e', '#e0a526', '#3d8b4f', '#d9d4c7'][Math.floor(r() * 5)]));
      }
    }
    return { tanks, parapets, roofs, awnings, awningColors };
  }, [placed]);

  useEffect(() => registerObstacles(placed.map((p): Obstacle => ({ x: p.x, z: p.z, hx: p.w / 2, hz: p.d / 2, angle: p.angle }))), [placed]);

  const roofMaterial = useMemo(() => { const t = roofTileTexture().clone(); t.needsUpdate = true; t.repeat.set(3, 2); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); }, []);
  const plain = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfc8b8', roughness: 0.9 }), []);
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9ced1', metalness: 0.7, roughness: 0.3 }), []);
  const canvas = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }), []);
  return <group>
    <Backdrop />
    {groups.map((g) => <InstancedBoxes key={g.key} materials={g.materials} matrices={g.matrices} />)}
    <Instances geometry={prismGeometry} material={roofMaterial} matrices={extras.roofs} />
    <Instances geometry={unitBox} material={plain} matrices={extras.parapets} />
    <Instances geometry={tankGeometry} material={steel} matrices={extras.tanks} />
    <Instances geometry={unitBox} material={canvas} matrices={extras.awnings} colors={extras.awningColors} />
  </group>;
}

const tankGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const prismGeometry = (() => {
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();

function InstancedBoxes({ materials, matrices }: { materials: THREE.Material[]; matrices: THREE.Matrix4[] }) {
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(unitBox, materials, matrices.length);
    matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    return instanced;
  }, [materials, matrices]);
  return <primitive object={mesh} />;
}

/** Distant city blocks behind the lakefront: one instanced draw call with a generic window texture. */
function Backdrop() {
  const { matrices, colors } = useMemo(() => {
    const r = rng(909);
    const m: THREE.Matrix4[] = [];
    const c: THREE.Color[] = [];
    for (const offset of [50, 74, 100, 128]) {
      for (const { point, angle } of sampleRing(streetRing(offset), 13 + offset * 0.08)) {
        if (r() < 0.15) continue;
        const w = 9 + r() * 10;
        const d = 10 + r() * 12;
        const h = (offset > 90 ? 12 : 9) + r() * (offset > 90 ? 22 : 12);
        m.push(trs(point[0], GROUND_HEIGHT + h / 2, point[1], -angle, w, h, d));
        c.push(new THREE.Color().setHSL(0.1 + r() * 0.04, 0.25 + r() * 0.2, 0.75 + r() * 0.15));
      }
    }
    return { matrices: m, colors: c };
  }, []);
  const material = useMemo(() => {
    const t = facadeTexture('tube', 0, 4).clone();
    t.needsUpdate = true;
    t.repeat.set(3, 2);
    const wall = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: '#9a958c', roughness: 0.95 });
    return [wall, wall, roof, roof, wall, wall];
  }, []);
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(unitBox, material, matrices.length);
    matrices.forEach((m, i) => instanced.setMatrixAt(i, m));
    colors.forEach((c, i) => instanced.setColorAt(i, c));
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    return instanced;
  }, [material, matrices, colors]);
  return <primitive object={mesh} />;
}
