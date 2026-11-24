import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT, registerBlocker, type Point } from '../geo';
import { buildings, insideBuilding, type Building } from '../osm';
import { facadeTexture, type FacadeStyle } from './textures';

const FLOOR = 3.4;
/** Buildings are merged per facade texture within square chunks this big, so whole chunks can be culled. */
const CHUNK = 650;
const DRAW_DISTANCE = 950; // chunks entirely farther than this from the camera are hidden (beyond the fog)
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

type Group = { style: FacadeStyle; variant: number; texFloors: number; chunk: string; positions: number[]; uvs: number[] };

/**
 * Every OSM building footprint around the lake, extruded to its storey count with a Hà Nội facade
 * (tube houses in the old quarter, French villas to the south). Walls are merged per facade texture,
 * roofs into one vertex-coloured mesh per chunk; chunks out of view are frustum-culled and chunks beyond the
 * fog are hidden, so the much larger map (old quarter to Đồng Xuân, French quarter) stays cheap.
 */
export function OsmBuildings() {
  const { groups, roofs, materials } = useMemo(() => {
    const byKey = new Map<string, Group>();
    const roofs = new Map<string, { pos: number[]; col: number[] }>();
    const color = new THREE.Color();
    for (const b of buildings) {
      const style = styleFor(b);
      const variant = Math.floor(b.seed * 9973) % 2;
      const texFloors = Math.max(1, Math.min(8, b.floors));
      const chunk = `${Math.floor(b.center[0] / CHUNK)},${Math.floor(b.center[1] / CHUNK)}`;
      const key = `${style}-${variant}-${texFloors}@${chunk}`;
      let g = byKey.get(key);
      if (!g) byKey.set(key, (g = { style, variant, texFloors, chunk, positions: [], uvs: [] }));
      let roof = roofs.get(chunk);
      if (!roof) roofs.set(chunk, (roof = { pos: [], col: [] }));
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
        for (const p of order) { roof.pos.push(p[0], y1, p[1]); roof.col.push(color.r, color.g, color.b); }
      }
    }
    // one material per facade texture, shared by every chunk
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const groups = [...byKey.values()].map((g) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mk = `${g.style}-${g.variant}-${g.texFloors}`;
      let material = materials.get(mk);
      if (!material) {
        const texture = facadeTexture(g.style, g.variant, g.texFloors).clone();
        texture.needsUpdate = true;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        materials.set(mk, (material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 })));
      }
      return { key: `${mk}@${g.chunk}`, chunk: g.chunk, geometry, material };
    });
    const roofList = [...roofs.entries()].map(([chunk, r]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(r.col, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return { chunk, geometry };
    });
    return { groups, roofs: roofList, materials: [...materials.values()] };
  }, []);
  const roofMaterial = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), []);
  useEffect(() => registerBlocker((p) => insideBuilding(p)), []);
  useEffect(() => () => { groups.forEach((g) => g.geometry.dispose()); materials.forEach((m) => { m.map?.dispose(); m.dispose(); }); roofs.forEach((r) => r.geometry.dispose()); }, [groups, roofs, materials]);
  // hide whole chunks beyond the draw distance (checked a few times a second)
  const chunkGroups = useRef(new Map<string, THREE.Group>());
  const check = useRef(0);
  useFrame((state, dt) => {
    check.current -= dt;
    if (check.current > 0) return;
    check.current = 0.4;
    const cam = state.camera.position;
    chunkGroups.current.forEach((g, chunk) => {
      const [i, j] = chunk.split(',').map(Number);
      const dx = Math.max(0, Math.abs(cam.x - (i + 0.5) * CHUNK) - CHUNK / 2), dz = Math.max(0, Math.abs(cam.z - (j + 0.5) * CHUNK) - CHUNK / 2);
      g.visible = Math.hypot(dx, dz) < DRAW_DISTANCE;
    });
  });
  const chunks = useMemo(() => [...new Set([...groups.map((g) => g.chunk), ...roofs.map((r) => r.chunk)])], [groups, roofs]);
  return <group>
    {chunks.map((c) => <group key={c} ref={(g) => { if (g) chunkGroups.current.set(c, g); else chunkGroups.current.delete(c); }}>
      {groups.filter((g) => g.chunk === c).map((g) => <mesh key={g.key} geometry={g.geometry} material={g.material} castShadow receiveShadow />)}
      {roofs.filter((r) => r.chunk === c).map((r) => <mesh key={`roof${c}`} geometry={r.geometry} material={roofMaterial} castShadow receiveShadow />)}
    </group>)}
  </group>;
}
