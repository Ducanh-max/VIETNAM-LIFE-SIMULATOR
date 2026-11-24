import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * Procedural mesh helpers for the stylised characters: lathed garments, tapered curved tubes (hair locks,
 * straps, seams, fingers), superellipsoids (soft boxes) and a baker that merges the static parts of one
 * bone into a single mesh per material, so a detailed character stays at a few dozen draw calls.
 */
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
}

/** Lathe around Y from a [radius, y] profile (bottom → top). Optional open sector for jackets. */
export function lathe(profile: [number, number][], segments = 16, phiStart = 0, phiLength = Math.PI * 2) {
  // three's lathe sweeps from +z toward +x; rotate so phi = 0 faces +z (the front)
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), segments, phiStart, phiLength);
  g.computeVertexNormals();
  return g;
}

/** Smooth a coarse [r, y] profile with Catmull-Rom so lathed shapes have soft curves. */
export function smoothProfile(points: [number, number][], samples = 14): [number, number][] {
  const c = new THREE.CatmullRomCurve3(points.map(([r, y]) => V3(r, y, 0)), false, 'centripetal');
  return c.getPoints(samples).map((p) => [p.x, p.y]);
}

/**
 * Tube along a curve with a radius that goes from r0 to r1 (with an optional bulge), and an optional
 * flattening so it reads as a ribbon — used for hair locks, brows, straps, seams and drawstrings.
 */
export function taperTube(points: THREE.Vector3[], r0: number, r1: number, opts: { tubular?: number; radial?: number; flat?: number; bulge?: number; closed?: boolean; twist?: number } = {}) {
  const { tubular = 10, radial = 6, flat = 1, bulge = 0, twist = 0 } = opts;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos: number[] = []; const nor: number[] = []; const uv: number[] = []; const idx: number[] = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const P = curve.getPointAt(t);
    const N = frames.normals[i].clone(); const B = frames.binormals[i].clone();
    if (twist) { const a = twist * t; const n2 = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)); B.copy(B.clone().multiplyScalar(Math.cos(a)).addScaledVector(N, -Math.sin(a))); N.copy(n2); }
    const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a) * flat, ny = Math.sin(a);
      const d = N.clone().multiplyScalar(nx).addScaledVector(B, ny);
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r);
      const n = N.clone().multiplyScalar(Math.cos(a) / Math.max(flat, 0.2)).addScaledVector(B, Math.sin(a)).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Superellipsoid: a box with soft, rounded edges (power < 1 → boxier). */
export function softBox(sx: number, sy: number, sz: number, power = 0.35, w = 12, h = 8) {
  const g = new THREE.SphereGeometry(1, w, h);
  const p = g.getAttribute('position');
  const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), power);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, f(p.getX(i)) * sx, f(p.getY(i)) * sy, f(p.getZ(i)) * sz);
  g.computeVertexNormals();
  return g;
}

/** Deform every vertex of a geometry in place. */
export function deform(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void) {
  const p = g.getAttribute('position'); const v = V3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}

/** A part of a bone's static geometry. */
export type Part = { g: THREE.BufferGeometry; m: string; t?: THREE.Matrix4 };

/** Merge parts into one geometry per material key. */
export function bake(parts: Part[]) {
  const byMat = new Map<string, THREE.BufferGeometry[]>();
  for (const { g, m, t } of parts) {
    let geo = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (t) geo = geo.applyMatrix4(t);
    const list = byMat.get(m);
    if (list) list.push(geo); else byMat.set(m, [geo]);
  }
  return [...byMat.entries()].map(([m, list]) => {
    const merged = mergeGeometries(list, false)!;
    merged.computeBoundingSphere();
    return { m, g: merged };
  });
}

export const triCount = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
