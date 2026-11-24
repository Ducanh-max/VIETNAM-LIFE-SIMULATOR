import { useMemo } from 'react';
import * as THREE from 'three';
import { distanceToShore, GROUND_HEIGHT, insidePolygon, type Point } from '../geo';
import { insideBuilding, parks, roadClearance, roads, type Road } from '../osm';
import { Instances, trs, unitBox, unitCylinder } from './Instances';
import { materials } from './materials';
import { asphaltTexture, grassTexture, rng } from './textures';
import { Trees, type Tree } from './Vegetation';

const ROAD_Y = GROUND_HEIGHT + 0.03;

function repeated(texture: THREE.Texture, u: number, v: number) {
  const t = texture.clone();
  t.needsUpdate = true;
  t.repeat.set(u, v);
  return t;
}

/** Flat ribbon along a polyline with mitred joins and round end caps; UVs are world metres. */
function pushRibbon(out: number[], points: Point[], half: number, y: number) {
  const n = points.length;
  const left: Point[] = []; const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)]; const b = points[Math.min(n - 1, i + 1)];
    let d0x = p[0] - a[0], d0z = p[1] - a[1], d1x = b[0] - p[0], d1z = b[1] - p[1];
    const l0 = Math.hypot(d0x, d0z) || 1; const l1 = Math.hypot(d1x, d1z) || 1;
    d0x /= l0; d0z /= l0; d1x /= l1; d1z /= l1;
    if (i === 0) { d0x = d1x; d0z = d1z; }
    if (i === n - 1) { d1x = d0x; d1z = d0z; }
    let tx = d0x + d1x, tz = d0z + d1z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const miter = Math.min(2.2, 1 / Math.max(0.2, nx * -d1z + nz * d1x));
    left.push([p[0] + nx * half * miter, p[1] + nz * half * miter]);
    right.push([p[0] - nx * half * miter, p[1] - nz * half * miter]);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = left[i], b = right[i], c = right[i + 1], d = left[i + 1];
    out.push(a[0], y, a[1], d[0], y, d[1], b[0], y, b[1], b[0], y, b[1], d[0], y, d[1], c[0], y, c[1]);
  }
  // round caps / junction fillers
  for (const i of [0, n - 1]) pushDisc(out, points[i], half, y);
  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1], p = points[i], b = points[i + 1];
    const turn = Math.abs(Math.atan2(b[1] - p[1], b[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]));
    if (Math.min(turn, Math.PI * 2 - turn) > 0.45) pushDisc(out, p, half, y);
  }
}
function pushDisc(out: number[], c: Point, r: number, y: number, segments = 14) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2; const a1 = ((i + 1) / segments) * Math.PI * 2;
    out.push(c[0], y, c[1], c[0] + Math.cos(a1) * r, y, c[1] + Math.sin(a1) * r, c[0] + Math.cos(a0) * r, y, c[1] + Math.sin(a0) * r);
  }
}
function flatGeometry(positions: number[], uvScale = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) { uv[j] = positions[i] * uvScale; uv[j + 1] = -positions[i + 2] * uvScale; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.computeBoundingSphere();
  return g;
}

/** Walk along a polyline, calling back every `spacing` metres with position and heading. */
function along(points: Point[], spacing: number, offset: number, visit: (p: Point, dir: Point) => void) {
  let carry = offset;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]; const b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) continue;
    const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let t = carry;
    while (t < len) { visit([a[0] + dir[0] * t, a[1] + dir[1] * t], dir); t += spacing; }
    carry = t - len;
  }
}
const roadLength = (r: Road) => r.points.reduce((s, p, i) => i ? s + Math.hypot(p[0] - r.points[i - 1][0], p[1] - r.points[i - 1][1]) : 0, 0);

/** Asphalt carriageways with a kerb edge, centre dashes and zebra crossings. */
function Roads() {
  const data = useMemo(() => {
    const asphalt: number[] = [];
    const kerb: number[] = [];
    const dashes: THREE.Matrix4[] = [];
    const zebra: THREE.Matrix4[] = [];
    for (const road of roads) {
      const half = road.width / 2;
      pushRibbon(kerb, road.points, half + 0.35, ROAD_Y - 0.008);
      pushRibbon(asphalt, road.points, half, ROAD_Y);
      if (!road.oneway && road.width >= 8 && road.kind !== 'service') {
        along(road.points, 7, 3, (p, d) => {
          if (roadClearance(p, road) < -1) return; // keep junctions clean
          dashes.push(trs(p[0], ROAD_Y + 0.02, p[1], -Math.atan2(d[1], d[0]), 3.2, 0.02, 0.16));
        });
      }
      // Zebra crossings at both ends of the bigger streets.
      if (road.width >= 6.5 && road.kind !== 'service' && roadLength(road) > 30) {
        for (const end of [0, 1]) {
          const pts = end ? [...road.points].reverse() : road.points;
          const a = pts[0], b = pts[1];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 14) continue;
          const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
          const c: Point = [a[0] + d[0] * 9, a[1] + d[1] * 9];
          const nx = -d[1], nz = d[0];
          const angle = -Math.atan2(d[1], d[0]);
          for (let s = -half + 0.5; s <= half - 0.5; s += 1.0) zebra.push(trs(c[0] + nx * s, ROAD_Y + 0.022, c[1] + nz * s, angle, 3, 0.02, 0.5));
        }
      }
    }
    return { asphalt: flatGeometry(asphalt, 1 / 6), kerb: flatGeometry(kerb), dashes, zebra };
  }, []);
  const mats = useMemo(() => ({
    asphalt: new THREE.MeshStandardMaterial({ map: repeated(asphaltTexture(), 1, 1), roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    kerb: new THREE.MeshStandardMaterial({ color: '#c3bdb1', roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    // paint sits above the asphalt's polygon offset so stripes are never partly swallowed by an overlapping street
    paint: new THREE.MeshStandardMaterial({ color: '#f1eee4', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  }), []);
  return <group>
    <mesh geometry={data.kerb} material={mats.kerb} receiveShadow />
    <mesh geometry={data.asphalt} material={mats.asphalt} receiveShadow />
    <Instances geometry={unitBox} material={mats.paint} matrices={data.dashes} castShadow={false} />
    <Instances geometry={unitBox} material={mats.paint} matrices={data.zebra} castShadow={false} />
  </group>;
}

/** Blue Hà Nội street-name plates ("PHỐ HÀNG KHAY / Q. HOÀN KIẾM") on posts, all from one texture atlas. */
function StreetSigns() {
  const data = useMemo(() => {
    const named = roads.filter((r) => r.name && r.kind !== 'service');
    const names = [...new Set(named.map((r) => r.name))];
    const cols = 4; const slotW = 512; const slotH = 96;
    const rows = Math.ceil(names.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * slotW; canvas.height = Math.max(1, rows) * slotH;
    const ctx = canvas.getContext('2d')!;
    names.forEach((name, i) => {
      const x = (i % cols) * slotW; const y = Math.floor(i / cols) * slotH;
      ctx.fillStyle = '#1d4f9e'; ctx.fillRect(x, y, slotW, slotH);
      ctx.strokeStyle = '#f4f6fa'; ctx.lineWidth = 5; ctx.strokeRect(x + 7, y + 7, slotW - 14, slotH - 14);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 40px "Be Vietnam Pro", Arial, sans-serif';
      ctx.fillText(name.toUpperCase(), x + slotW / 2, y + 40, slotW - 40);
      ctx.font = '600 17px "Be Vietnam Pro", Arial, sans-serif';
      ctx.fillText('QUẬN HOÀN KIẾM · HÀ NỘI', x + slotW / 2, y + 74, slotW - 60);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const positions: number[] = []; const uvs: number[] = [];
    const posts: THREE.Matrix4[] = [];
    const placed: Point[] = [];
    for (const road of named) {
      const length = roadLength(road);
      if (length < 25) continue;
      const slot = names.indexOf(road.name);
      const u0 = (slot % cols) / cols, u1 = u0 + 1 / cols;
      const v1 = 1 - Math.floor(slot / cols) / rows, v0 = v1 - 1 / rows;
      const spacing = Math.max(60, Math.min(140, length / 2));
      along(road.points, spacing, Math.min(length / 2, 18), (p, d) => {
        for (const side of [1, -1]) {
          const off = road.width / 2 + 1.3;
          const q: Point = [p[0] - d[1] * off * side, p[1] + d[0] * off * side];
          if (insideBuilding(q, 0.6) || roadClearance(q) < 0.4 || distanceToShore(q) < 3) continue;
          if (placed.some((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) < 30)) continue;
          placed.push(q);
          posts.push(trs(q[0], GROUND_HEIGHT + 1.5, q[1], 0, 0.08, 3.0, 0.08));
          // plate parallel to the street, readable from both sides
          const w = 1.35, h = 0.25, y = GROUND_HEIGHT + 2.75;
          const ax = d[0] * w / 2, az = d[1] * w / 2;
          const nx = -d[1] * 0.02 * side, nz = d[0] * 0.02 * side;
          for (const face of [1, -1]) {
            const sx = ax * face, sz = az * face;
            const ox = q[0] + nx * face, oz = q[1] + nz * face;
            positions.push(ox - sx, y - h, oz - sz, ox + sx, y - h, oz + sz, ox + sx, y + h, oz + sz, ox - sx, y - h, oz - sz, ox + sx, y + h, oz + sz, ox - sx, y + h, oz - sz);
            uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
          }
          break;
        }
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, material: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, side: THREE.DoubleSide }), posts };
  }, []);
  return <group>
    <mesh geometry={data.geometry} material={data.material} />
    <Instances geometry={unitCylinder} material={materials().iron} matrices={data.posts} castShadow={false} />
  </group>;
}

/** Vườn hoa (public gardens) from OSM with lawns and trees. */
function Parks() {
  const data = useMemo(() => {
    const positions: number[] = [];
    const trees: Tree[] = [];
    const r = rng(311);
    for (const park of parks) {
      const contour = park.ring.map(([x, z]) => new THREE.Vector2(x, z));
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
        const p0 = park.ring[a], p1 = park.ring[b], p2 = park.ring[c];
        const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        for (const p of cross < 0 ? [p0, p1, p2] : [p0, p2, p1]) positions.push(p[0], GROUND_HEIGHT + 0.025, p[1]);
      }
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of park.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let x = x0 + 4; x < x1; x += 9) for (let z = z0 + 4; z < z1; z += 9) {
        const p: Point = [x + (r() - 0.5) * 5, z + (r() - 0.5) * 5];
        if (!insidePolygon(p, park.ring) || insideBuilding(p, 2) || roadClearance(p) < 2) continue;
        trees.push({ x: p[0], z: p[1], y: GROUND_HEIGHT, kind: r() < 0.15 ? 'blossom' : r() < 0.3 ? 'banyan' : 'shade', scale: 0.8 + r() * 0.4 });
      }
    }
    return { geometry: flatGeometry(positions, 1 / 6), trees };
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: repeated(grassTexture(), 1, 1), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), []);
  return <group>
    <mesh geometry={data.geometry} material={material} receiveShadow />
    <Trees trees={data.trees} seed={21} low />
  </group>;
}

/** Sấu and bàng trees lining the main streets, set on the pavement between kerb and shopfronts. */
function StreetTrees() {
  const trees = useMemo(() => {
    const r = rng(812);
    const list: Tree[] = [];
    for (const road of roads) {
      if (!['primary', 'secondary', 'tertiary', 'trunk'].includes(road.kind)) continue;
      along(road.points, 13, r() * 6, (p, d) => {
        for (const side of [1, -1]) {
          const off = road.width / 2 + 1.4;
          const q: Point = [p[0] - d[1] * off * side, p[1] + d[0] * off * side];
          if (distanceToShore(q) < 15 || insideBuilding(q, 1.4) || roadClearance(q) < 0.8) continue;
          if (r() < 0.25) continue;
          list.push({ x: q[0], z: q[1], y: GROUND_HEIGHT, kind: r() < 0.08 ? 'blossom' : 'shade', scale: 0.75 + r() * 0.3 });
        }
      });
    }
    return list;
  }, []);
  return <Trees trees={trees} seed={33} low />;
}

/** Rows of parked xe máy on the pavements: the most Hà Nội street detail of all. */
function ParkedScooters() {
  const data = useMemo(() => {
    const r = rng(4242);
    const bodies: THREE.Matrix4[] = []; const colors: THREE.Color[] = [];
    const seats: THREE.Matrix4[] = []; const wheels: THREE.Matrix4[] = []; const bars: THREE.Matrix4[] = [];
    const palette = ['#c0392b', '#1f3b73', '#e6e1d6', '#151515', '#7b8a8e', '#2f6d4f', '#d4a017', '#8e1e3c'];
    // Clusters of 3–9 bikes with gaps between them; about 2 500 bikes in total.
    let cluster = 0;
    for (const road of roads) {
      if (!['residential', 'tertiary', 'secondary', 'living_street', 'unclassified'].includes(road.kind)) continue;
      along(road.points, 1.15, r() * 4, (p, d) => {
        if (bodies.length > 2600) return;
        if (cluster <= 0) { if (r() < 0.975) return; cluster = 3 + Math.floor(r() * 7); }
        cluster--;
        const side = r() < 0.5 ? 1 : -1;
        const off = road.width / 2 + 1.1;
        const q: Point = [p[0] - d[1] * off * side, p[1] + d[0] * off * side];
        if (distanceToShore(q) < 14 || insideBuilding(q, 0.9) || roadClearance(q) < 0.5) return;
        // parked nose-in, perpendicular to the kerb
        const heading = Math.atan2(d[0], d[1]) + Math.PI / 2 * side + (r() - 0.5) * 0.25;
        const fx = Math.sin(heading), fz = Math.cos(heading);
        const at = (f: number, y: number) => [q[0] + fx * f, y, q[1] + fz * f] as const;
        const [bx, by, bz] = at(0, GROUND_HEIGHT + 0.5);
        bodies.push(trs(bx, by, bz, heading, 0.32, 0.42, 1.45));
        colors.push(new THREE.Color(palette[Math.floor(r() * palette.length)]));
        const [sx, sy, sz] = at(-0.15, GROUND_HEIGHT + 0.8);
        seats.push(trs(sx, sy, sz, heading, 0.3, 0.1, 0.7));
        for (const f of [-0.55, 0.6]) { const [wx, wy, wz] = at(f, GROUND_HEIGHT + 0.25); wheels.push(trs(wx, wy, wz, heading, 0.1, 0.5, 0.5, 0, 0)); }
        const [hx, hy, hz] = at(0.62, GROUND_HEIGHT + 1.0);
        bars.push(trs(hx, hy, hz, heading, 0.62, 0.05, 0.05));
      });
    }
    return { bodies, colors, seats, wheels, bars };
  }, []);
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.3 }),
    seat: new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.7 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
  }), []);
  return <group>
    <Instances geometry={unitBox} material={mats.body} matrices={data.bodies} colors={data.colors} castShadow={false} />
    <Instances geometry={unitBox} material={mats.seat} matrices={data.seats} castShadow={false} />
    <Instances geometry={wheelGeometry} material={mats.tyre} matrices={data.wheels} castShadow={false} />
    <Instances geometry={unitBox} material={materials().iron} matrices={data.bars} castShadow={false} />
  </group>;
}
const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2);

export function Streets() {
  return <group>
    <Roads />
    <Parks />
    <StreetTrees />
    <StreetSigns />
    <ParkedScooters />
  </group>;
}
