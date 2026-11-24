import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerBlocker, type Point } from '../geo';
import { buildings, insideBuilding, type Building } from '../osm';
import { facadeTexture, type FacadeStyle } from './textures';

const FLOOR = 3.4;
const BAY = 4;

function styleFor(b: Building): FacadeStyle {
  if (b.floors >= 9) return 'modern';
  const r = b.seed;
  const z = b.center[1];
  if (b.floors <= 1) return 'shop';
  if (z < -300) return r < 0.5 ? 'tube' : r < 0.9 ? 'shop' : 'colonial'; // Phố cổ: tube houses and shophouses
  if (z > 150) return r < 0.35 ? 'colonial' : r < 0.6 ? 'modern' : r < 0.85 ? 'tube' : 'shop'; // French quarter
  return r < 0.4 ? 'tube' : r < 0.7 ? 'shop' : r < 0.85 ? 'colonial' : 'modern';
}

/** Ring in clockwise order seen from above, so extruded walls face outward. */
function outward(ring: Point[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i]; const q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a > 0 ? [...ring].reverse() : ring;
}

type Group = { style: FacadeStyle; variant: number; texFloors: number; positions: number[]; uvs: number[] };

/**
 * Every OSM building footprint around the lake, extruded to its storey count with a Hà Nội facade
 * (tube houses in the old quarter, French villas to the south). Walls are merged per facade texture,
 * roofs into one vertex-coloured mesh, so the whole district is under a hundred draw calls.
 */
export function OsmBuildings() {
  const { groups, roof } = useMemo(() => {
    const byKey = new Map<string, Group>();
    const roofPos: number[] = [];
    const roofCol: number[] = [];
    const color = new THREE.Color();
    for (const b of buildings) {
      const style = styleFor(b);
      const variant = Math.floor(b.seed * 9973) % 2;
      const texFloors = Math.max(1, Math.min(8, b.floors));
      const key = `${style}-${variant}-${texFloors}`;
      let g = byKey.get(key);
      if (!g) byKey.set(key, (g = { style, variant, texFloors, positions: [], uvs: [] }));
      const ring = outward(b.ring);
      const y0 = GROUND_HEIGHT - 0.05;
      const y1 = GROUND_HEIGHT + b.height;
      // Tall towers repeat the facade vertically instead of stretching it.
      const vTop = b.floors > 8 ? b.height / (8 * FLOOR) : 1;
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]; const c = ring[(i + 1) % ring.length];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 0.05) continue;
        // Snap each wall to whole bays so windows are never cut in half at corners.
        const u0 = u; const u1 = u + Math.max(1, Math.round(len / BAY));
        u = u1;
        g.positions.push(a[0], y0, a[1], c[0], y0, c[1], c[0], y1, c[1], a[0], y0, a[1], c[0], y1, c[1], a[0], y1, a[1]);
        g.uvs.push(u0, 0, u1, 0, u1, vTop, u0, 0, u1, vTop, u0, vTop);
      }
      // Flat roof (or tiled for villas), triangulated from the footprint.
      const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      if (style === 'colonial') color.setHSL(0.03, 0.45, 0.36 + b.seed * 0.08);
      else if (style === 'modern') color.setHSL(0.55, 0.05, 0.55 + b.seed * 0.1);
      else color.setHSL(0.08, 0.08 + b.seed * 0.1, 0.48 + b.seed * 0.14);
      for (const [i0, i1, i2] of tris) {
        const p0 = ring[i0]; const p1 = ring[i1]; const p2 = ring[i2];
        // keep the triangle facing up
        const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        const order = cross < 0 ? [p0, p1, p2] : [p0, p2, p1];
        for (const p of order) { roofPos.push(p[0], y1, p[1]); roofCol.push(color.r, color.g, color.b); }
      }
    }
    const groups = [...byKey.values()].map((g) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const texture = facadeTexture(g.style, g.variant, g.texFloors).clone();
      texture.needsUpdate = true;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 });
      return { key: `${g.style}-${g.variant}-${g.texFloors}`, geometry, material };
    });
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
    roofGeometry.setAttribute('color', new THREE.Float32BufferAttribute(roofCol, 3));
    roofGeometry.computeVertexNormals();
    roofGeometry.computeBoundingSphere();
    return { groups, roof: roofGeometry };
  }, []);
  const roofMaterial = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), []);
  useEffect(() => registerBlocker((p) => insideBuilding(p)), []);
  useEffect(() => () => { groups.forEach((g) => { g.geometry.dispose(); g.material.dispose(); }); roof.dispose(); }, [groups, roof]);
  return <group>
    {groups.map((g) => <mesh key={g.key} geometry={g.geometry} material={g.material} castShadow receiveShadow />)}
    <mesh geometry={roof} material={roofMaterial} castShadow receiveShadow />
  </group>;
}
