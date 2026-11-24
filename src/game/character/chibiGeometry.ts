import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { deform, lathe, smoothProfile, softBox, T, taperTube, V3 } from './geometry';
import type { HairStyle, Outfit } from './outfit';

/*
 * Geometry of the chibi low-poly characters (player and every NPC), built from code only.
 *
 * Proportions: about 1.5 m tall, head + hair ≈ 40 %, torso ≈ 30 %, legs + shoes ≈ 30 %. Every bone's
 * static parts are merged into ONE geometry with per-vertex colours, drawn with one shared matte
 * material, so a whole character is ~20 draw calls and all characters share materials. Geometry is
 * cached per outfit + LOD and shared by every character wearing the same outfit; nothing is created
 * in the render loop.
 *
 * Rig convention (all THREE.Group): faces +z, the character's LEFT is +x, feet on y = 0.
 *   root › hips › hipL/R (thigh) › kneeL/R (shin + shoe)
 *              › spine (torso, bag) › shoulderL/R (upper arm) › elbowL/R (forearm) › handL/R (palm, fingers, thumb)
 *                                   › neck › head (face, hair, ears)
 */
export type Lod = 0 | 1 | 2;
export const PLAYER_DIMENSIONS = {
  hipY: 0.5, // hips group above the ground
  spineY: 0.04, // spine pivot above the hips
  hipX: 0.08, hipDrop: 0.03, // hip joints relative to the hips group
  thigh: 0.2, shin: 0.2, ankle: 0.07, // knee → ankle, ankle → ground (sole)
  shoulderX: 0.19, shoulderY: 0.3, // spine space
  upperArm: 0.17, forearm: 0.15, hand: 0.05, // shoulder → elbow, elbow → wrist, wrist → palm centre
  neckY: 0.37, // spine space
  headY: 0.235, // neck space: the head centre (very short chibi neck)
  sitHip: 0.34, // hips group height when seated on a low plastic stool
  height: 1.5,
};
const D = PLAYER_DIMENSIONS;
/** Head ellipsoid half-axes (x, y, front z, back z). */
export const HEAD = { a: 0.25, b: 0.225, c: 0.225, back: 0.235 };
/** Face layout in head space. */
export const FACE = { eyeX: 0.088, eyeY: -0.012, browY: 0.07, mouthY: -0.1, cheekX: 0.15, cheekY: -0.075 };

/** z of the front of the head surface at (x, y). */
export function surf(x: number, y: number) { return HEAD.c * Math.sqrt(Math.max(0, 1 - (x / HEAD.a) ** 2 - (y / HEAD.b) ** 2)); }
/** Orientation (Euler x, y) of the head surface normal at (x, y) on the face. */
export function surfRot(x: number, y: number): [number, number] {
  const z = surf(x, y);
  const n = V3(x / HEAD.a ** 2, y / HEAD.b ** 2, z / HEAD.c ** 2).normalize();
  return [-Math.asin(n.y), Math.atan2(n.x, n.z)];
}

// ---- colour helpers and the vertex-colour baker ---------------------------------
const C = (hex: string) => new THREE.Color(hex);
export const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
type CP = { g: THREE.BufferGeometry; c: string; t?: THREE.Matrix4 };

/** Merge parts into one non-indexed geometry with per-vertex colours (position, normal, color). */
export function bakeVC(parts: CP[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const list = parts.map(({ g, c, t }) => {
    let geo = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') geo.deleteAttribute(name);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (t) geo = geo.applyMatrix4(t);
    if (!geo.getAttribute('color')) {
      const col = C(c); const n = geo.getAttribute('position').count; const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    return geo;
  });
  const merged = mergeGeometries(list, false)!;
  merged.computeBoundingSphere();
  return merged;
}

const sphere = (w: number, h: number) => new THREE.SphereGeometry(1, w, h);
/** Per-LOD pick. */
const q = <X,>(lod: Lod, a: X, b: X, c: X) => (lod === 0 ? a : lod === 1 ? b : c);

// ---- head & hair --------------------------------------------------------------------
const dirAE = (a: number, e: number) => V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
function headPoint(d: THREE.Vector3, off: number) {
  return V3(d.x * (HEAD.a + off), d.y * (HEAD.b + off), d.z * ((d.z > 0 ? HEAD.c : HEAD.back) + off));
}
const CAP = 0.032; // hair cap offset above the scalp (volume)

/**
 * A rounded hair clump: a flattened tube that hugs the head along a path from (a0, e0) to (a1, e1)
 * (azimuth from the front toward +x, elevation), starts buried in the cap, swells, and tapers to a
 * soft point lifted `tip` off the head; `drop` lets long hair fall straight down past the head.
 */
type Clump = { a0: number; e0: number; a1: number; e1: number; r: number; tip?: number; drop?: number; tone?: 0 | 1 | 2 };
function clumpGeometry(c: Clump, segs: number, radial: number) {
  const pts: THREE.Vector3[] = []; const outs: THREE.Vector3[] = [];
  const tip = c.tip ?? 0.012;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const d = dirAE(c.a0 + (c.a1 - c.a0) * t, c.e0 + (c.e1 - c.e0) * t).normalize();
    const rise = Math.min(1, t / 0.35);
    const off = -0.015 + (CAP + 0.03) * (rise * rise * (3 - 2 * rise)) + tip * t * t;
    pts.push(headPoint(d, off)); outs.push(d);
  }
  if (c.drop) {
    const end = pts[pts.length - 1]; const out = outs[outs.length - 1].clone().setY(0).normalize();
    pts.pop(); outs.pop();
    const n = 3;
    for (let k = 0; k <= n; k++) { const f = k / n; pts.push(end.clone().add(V3(0, -c.drop * f, 0)).addScaledVector(out, 0.012 * f)); outs.push(out.clone()); }
  }
  const N = pts.length - 1;
  // chunky clump: swells quickly, stays full, then closes to a soft point
  const radius = (t: number) => c.r * (t < 0.3 ? 0.7 + t : 1 - Math.pow((t - 0.3) / 0.7, 1.7));
  const pos: number[] = []; const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const tan = pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const out = outs[i].clone().addScaledVector(tan, -outs[i].dot(tan)).normalize();
    const side = tan.clone().cross(out).normalize();
    const r = Math.max(0, radius(t));
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const p = pts[i].clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(out, Math.sin(a) * r * 0.72);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), a2 = a + radial, b2 = b + radial;
    idx.push(a, a2, b, b, a2, b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Hair styles: the cap's coverage and the clumps that give the silhouette (5–10 per style). */
function hairStyle(style: HairStyle): { cap: number; clumps: Clump[]; tail?: boolean; bun?: boolean } {
  const P = Math.PI;
  const sides = (a1: number, e1: number, r: number, drop = 0): Clump[] => [1, -1].map((s) => ({ a0: s * 1.0, e0: 0.8, a1: s * a1, e1, r, drop, tone: 0 }));
  const back = (e1: number, r: number, drop = 0): Clump[] => [
    { a0: P, e0: 0.95, a1: P, e1, r, drop, tone: 2 },
    { a0: P - 0.75, e0: 0.85, a1: P - 0.6, e1: e1 + 0.08, r: r * 0.95, drop, tone: 2 },
    { a0: -(P - 0.75), e0: 0.85, a1: -(P - 0.6), e1: e1 + 0.08, r: r * 0.95, drop, tone: 2 },
  ];
  switch (style) {
    case 'short': return { cap: 1.5, clumps: [
      { a0: 0.25, e0: 1.1, a1: 0.05, e1: 0.55, r: 0.062, tip: 0.006 }, { a0: -0.35, e0: 1.05, a1: -0.55, e1: 0.55, r: 0.06, tip: 0.006 },
      ...sides(1.25, 0.18, 0.055), { a0: 0.4, e0: 1.45, a1: 2.0, e1: 1.0, r: 0.07, tip: 0.012, tone: 1 }, ...back(-0.3, 0.07).slice(0, 2),
    ] };
    case 'thin': return { cap: 1.42, clumps: [
      { a0: 0.3, e0: 1.2, a1: 0.6, e1: 0.75, r: 0.05, tip: 0.004 }, ...sides(1.4, 0.12, 0.045), ...back(-0.25, 0.055).slice(0, 2),
    ] };
    case 'fringe': return { cap: 1.6, clumps: [
      ...[-0.6, -0.2, 0.2, 0.6].map((a): Clump => ({ a0: a * 0.6, e0: 1.15, a1: a, e1: 0.3, r: 0.066, tip: 0.008 })),
      ...sides(1.3, -0.12, 0.065), ...back(-0.42, 0.08).slice(0, 3),
    ] };
    case 'side': return { cap: 1.55, clumps: [
      { a0: 0.45, e0: 1.2, a1: -0.55, e1: 0.42, r: 0.085, tip: 0.02, tone: 1 }, { a0: 0.55, e0: 1.0, a1: -0.05, e1: 0.4, r: 0.07, tip: 0.012 },
      { a0: 0.5, e0: 1.1, a1: 1.05, e1: 0.45, r: 0.066, tip: 0.01 }, ...sides(1.3, 0.05, 0.06), ...back(-0.38, 0.08),
    ] };
    case 'bob': return { cap: 1.7, clumps: [
      { a0: 0.3, e0: 1.15, a1: 0.15, e1: 0.36, r: 0.07, tip: 0.008 }, { a0: -0.3, e0: 1.15, a1: -0.45, e1: 0.36, r: 0.068, tip: 0.008 },
      ...[1, -1].flatMap((s): Clump[] => [{ a0: s * 0.9, e0: 0.85, a1: s * 1.15, e1: -0.15, r: 0.075, drop: 0.12 }, { a0: s * 1.7, e0: 0.85, a1: s * 1.95, e1: -0.2, r: 0.08, drop: 0.1, tone: 2 }]),
      ...back(-0.3, 0.085, 0.1).slice(0, 3),
    ] };
    case 'long': return { cap: 1.72, clumps: [
      { a0: 0.35, e0: 1.15, a1: 0.25, e1: 0.36, r: 0.068, tip: 0.008 }, { a0: -0.3, e0: 1.15, a1: -0.55, e1: 0.36, r: 0.068, tip: 0.008 },
      ...[1, -1].flatMap((s): Clump[] => [{ a0: s * 0.9, e0: 0.85, a1: s * 1.2, e1: -0.2, r: 0.075, drop: 0.3 }, { a0: s * 1.8, e0: 0.85, a1: s * 2.1, e1: -0.25, r: 0.08, drop: 0.34, tone: 2 }]),
      ...back(-0.3, 0.09, 0.36).slice(0, 3),
    ] };
    case 'ponytail': return { cap: 1.6, tail: true, clumps: [
      { a0: 0.3, e0: 1.15, a1: 0.2, e1: 0.4, r: 0.066, tip: 0.008 }, { a0: -0.3, e0: 1.15, a1: -0.5, e1: 0.4, r: 0.066, tip: 0.008 },
      ...sides(1.3, -0.05, 0.06), { a0: P, e0: 1.2, a1: P, e1: 0.3, r: 0.08, tip: 0.0, tone: 2 },
    ] };
    case 'bun': return { cap: 1.6, bun: true, clumps: [
      { a0: 0.3, e0: 1.15, a1: 0.25, e1: 0.42, r: 0.064, tip: 0.008 }, { a0: -0.3, e0: 1.15, a1: -0.5, e1: 0.42, r: 0.064, tip: 0.008 },
      ...sides(1.3, -0.02, 0.058), ...back(-0.25, 0.075).slice(0, 1),
    ] };
    case 'swept':
    default: return { cap: 1.55, clumps: [
      // messy chibi fringe: three chunky clumps from the crown falling over the forehead, stopping above the brows
      { a0: 0.05, e0: 1.45, a1: -0.1, e1: 0.36, r: 0.1, tip: 0.02, tone: 1 },
      { a0: 0.45, e0: 1.35, a1: 0.66, e1: 0.38, r: 0.094, tip: 0.024 },
      { a0: -0.45, e0: 1.35, a1: -0.68, e1: 0.4, r: 0.094, tip: 0.026 },
      // the back, layered down to the nape with the tips flicking out
      { a0: Math.PI, e0: 1.3, a1: Math.PI, e1: -0.42, r: 0.105, tip: 0.026, tone: 2 },
      { a0: 2.3, e0: 1.25, a1: 2.15, e1: -0.28, r: 0.1, tip: 0.03, tone: 2 },
      { a0: -2.3, e0: 1.25, a1: -2.15, e1: -0.28, r: 0.1, tip: 0.03, tone: 2 },
      // sides over the top of the ears, and two fuller tufts behind them
      { a0: 1.0, e0: 1.2, a1: 1.32, e1: 0.06, r: 0.088, tip: 0.02 },
      { a0: -1.0, e0: 1.2, a1: -1.32, e1: 0.06, r: 0.088, tip: 0.02 },
      { a0: 1.75, e0: 1.45, a1: 1.8, e1: 0.5, r: 0.1, tip: 0.034, tone: 1 },
      { a0: -1.75, e0: 1.45, a1: -1.8, e1: 0.5, r: 0.1, tip: 0.034, tone: 1 },
    ] };
  }
}

function hairParts(o: Outfit, lod: Lod): CP[] {
  const st = hairStyle(o.hairStyle);
  const hatOn = o.hat !== 'none';
  const P: CP[] = [];
  const tones = [o.hair, o.hairLight, o.hairDark];
  // cap: a sphere slice tilted back, so it covers the crown and the back but leaves the forehead
  const cap = new THREE.SphereGeometry(1, q(lod, 14, 10, 8), q(lod, 7, 5, 4), 0, Math.PI * 2, 0, st.cap);
  cap.rotateX(-0.5);
  deform(cap, (v) => { v.set(v.x * (HEAD.a + CAP), v.y * (HEAD.b + CAP), v.z * ((v.z > 0 ? HEAD.c : HEAD.back) + CAP)); });
  P.push({ g: cap, c: o.hair });
  const clumps = lod === 2 ? [st.clumps[0], st.clumps[3]].filter(Boolean) : st.clumps;
  for (const c of clumps) {
    const cc = hatOn ? { ...c, tip: Math.min(c.tip ?? 0.012, 0.004) } : c;
    P.push({ g: clumpGeometry(cc, q(lod, 4, 3, 2), q(lod, 5, 4, 4)), c: tones[c.tone ?? 0] });
  }
  if (st.tail) {
    P.push({ g: taperTube([V3(0, 0.06, -0.24), V3(0, 0.02, -0.3), V3(0, -0.08, -0.31), V3(0, -0.2, -0.27)], 0.05, 0.012, { tubular: q(lod, 6, 4, 3), radial: q(lod, 7, 5, 4), bulge: 0.35 }), c: o.hair });
    P.push({ g: new THREE.TorusGeometry(0.035, 0.012, 4, q(lod, 10, 8, 6)), c: '#c84b5c', t: T(0, 0.05, -0.245, 0.4) });
  }
  if (st.bun) P.push({ g: sphere(q(lod, 10, 8, 6), q(lod, 8, 6, 4)), c: o.hair, t: T(0, 0.17, -0.17, 0, 0, 0, 0.085, 0.08, 0.085) });
  return P;
}

function headParts(o: Outfit, lod: Lod): CP[] {
  const P: CP[] = [];
  const skinDark = shade(o.skin, 0.88);
  const head = deform(sphere(q(lod, 22, 12, 8), q(lod, 15, 9, 6)), (v) => {
    let { x, z } = v; const y = v.y;
    if (y < -0.25) { const k = (-y - 0.25) / 0.75; x *= 1 - 0.1 * Math.pow(k, 1.4); if (z > 0) z *= 1 - 0.05 * k; } // soft small chin
    v.set(x * HEAD.a, y * HEAD.b, z * (z > 0 ? HEAD.c : HEAD.back));
  });
  P.push({ g: head, c: o.skin });
  // ears: rounded ovals with a darker inner bowl
  for (const s of [-1, 1]) {
    if (lod < 2) P.push({ g: sphere(q(lod, 7, 5, 4), q(lod, 5, 4, 3)), c: o.skin, t: T(s * 0.243, -0.03, -0.01, 0, s * 0.3, 0, 0.03, 0.052, 0.042) });
  }
  // nose: just a tiny oval bump
  if (lod < 2) P.push({ g: sphere(5, 3), c: skinDark, t: T(0, -0.052, surf(0, -0.052) - 0.002, 0, 0, 0, 0.02, 0.013, 0.012) });
  if (lod === 2) {
    // far away the face is static: dark oval eyes, a small mouth and pink cheeks baked into the head
    for (const s of [-1, 1]) {
      const [rx, ry] = surfRot(s * FACE.eyeX, FACE.eyeY);
      P.push({ g: sphere(4, 3), c: '#282321', t: T(s * FACE.eyeX, FACE.eyeY, surf(s * FACE.eyeX, FACE.eyeY) - 0.004, rx, ry, 0, 0.034, 0.05, 0.012) });
    }
  }
  P.push(...hairParts(o, lod));
  P.push(...headExtras(o, lod));
  return P;
}

function headExtras(o: Outfit, lod: Lod): CP[] {
  const P: CP[] = [];
  if (o.hat === 'cap') {
    P.push({ g: new THREE.SphereGeometry(1, q(lod, 14, 10, 8), q(lod, 7, 5, 4), 0, Math.PI * 2, 0, Math.PI / 2), c: o.hatColor, t: T(0, 0.04, -0.01, -0.18, 0, 0, HEAD.a + 0.05, HEAD.b + 0.06, HEAD.c + 0.06) });
    P.push({ g: softBox(0.13, 0.01, 0.1, 0.5, q(lod, 10, 8, 6), 4), c: o.hatColor, t: T(0, 0.085, 0.27, 0.18) });
    if (lod < 2) P.push({ g: sphere(6, 4), c: shade(o.hatColor, 0.8), t: T(0, 0.31, -0.03, 0, 0, 0, 0.02, 0.012, 0.02) });
  }
  if (o.hat === 'helmet') {
    P.push({ g: new THREE.SphereGeometry(1, q(lod, 16, 12, 8), q(lod, 8, 6, 4), 0, Math.PI * 2, 0, Math.PI / 2), c: o.hatColor, t: T(0, 0.02, -0.01, -0.15, 0, 0, HEAD.a + 0.07, HEAD.b + 0.08, HEAD.back + 0.07) });
    P.push({ g: softBox(0.2, 0.012, 0.06, 0.5, 10, 4), c: shade(o.hatColor, 0.75), t: T(0, 0.07, 0.25, 0.25) });
    if (lod < 2) for (const s of [-1, 1]) P.push({ g: taperTube([V3(s * 0.24, 0.0, 0.02), V3(s * 0.2, -0.18, 0.08), V3(0, -0.24, 0.1)], 0.006, 0.006, { tubular: 5, radial: 3 }), c: '#1d1d1f' });
  }
  if (o.hat === 'nonla') P.push({ g: lathe([[0.38, 0], [0.35, 0.014], [0.01, 0.22]], q(lod, 20, 14, 10)), c: '#d9c38a', t: T(0, 0.15, -0.01) });
  if (o.glasses && lod < 2) {
    for (const s of [-1, 1]) {
      const z = surf(s * FACE.eyeX, FACE.eyeY) + 0.026;
      const ring = Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return V3(s * FACE.eyeX + Math.cos(a) * 0.05, FACE.eyeY + Math.sin(a) * 0.045, z - Math.abs(Math.cos(a)) * 0.01 * (s * Math.cos(a) > 0 ? 1.6 : 0.4)); });
      P.push({ g: taperTube(ring, 0.006, 0.006, { tubular: q(lod, 14, 10, 8), radial: 4 }), c: '#2b2420' });
      P.push({ g: taperTube([V3(s * 0.137, FACE.eyeY + 0.01, z - 0.03), V3(s * 0.22, FACE.eyeY + 0.015, 0.1), V3(s * 0.25, -0.0, -0.02)], 0.005, 0.005, { tubular: 5, radial: 3 }), c: '#2b2420' });
    }
    P.push({ g: taperTube([V3(-0.04, FACE.eyeY + 0.015, surf(0.04, 0) + 0.026), V3(0, FACE.eyeY + 0.024, surf(0, 0) + 0.02), V3(0.04, FACE.eyeY + 0.015, surf(0.04, 0) + 0.026)], 0.005, 0.005, { tubular: 4, radial: 3 }), c: '#2b2420' });
  }
  return P;
}

// ---- face features (animated, LOD 0/1) -------------------------------------------------
export type MouthKey = 'neutral' | 'smile' | 'frown' | 'flat' | 'o' | 'open' | 'laugh';
const MOUTH_DARK = '#6b3a30', MOUTH_IN = '#7d2f2b', TONGUE = '#e58a84', TEETH = '#fbf8f2';
function lineMouth(pts: [number, number][]) { return taperTube(pts.map(([x, y]) => V3(x, y, 0.003)), 0.0042, 0.0042, { tubular: 8, radial: 4 }); }
function dShape(w: number, h: number, depth = 0.001) {
  const s = new THREE.Shape(); s.moveTo(-w, 0.004); s.quadraticCurveTo(0, 0.008, w, 0.004); s.quadraticCurveTo(w * 0.9, -h, 0, -h); s.quadraticCurveTo(-w * 0.9, -h, -w, 0.004);
  const g = new THREE.ShapeGeometry(s, 8); g.translate(0, 0, depth); return g;
}
export function mouthGeometries(): Record<MouthKey, THREE.BufferGeometry> {
  const tongue = (w: number, h: number) => { const g = new THREE.CircleGeometry(1, 10); g.scale(w, h, 1); return g; };
  const teeth = (w: number) => { const g = new THREE.PlaneGeometry(w * 1.5, 0.007); return g; };
  return {
    neutral: bakeVC([{ g: lineMouth([[-0.017, 0.004], [-0.008, -0.002], [0, -0.004], [0.008, -0.002], [0.017, 0.004]]), c: MOUTH_DARK }])!,
    smile: bakeVC([{ g: lineMouth([[-0.027, 0.009], [-0.014, -0.005], [0, -0.01], [0.014, -0.005], [0.027, 0.009]]), c: MOUTH_DARK }])!,
    frown: bakeVC([{ g: lineMouth([[-0.02, -0.008], [-0.01, 0.0], [0, 0.003], [0.01, 0.0], [0.02, -0.008]]), c: MOUTH_DARK }])!,
    flat: bakeVC([{ g: lineMouth([[-0.016, 0.001], [0, -0.001], [0.016, 0.001]]), c: MOUTH_DARK }])!,
    o: bakeVC([{ g: sphere(10, 6), c: MOUTH_IN, t: T(0, -0.006, 0, 0, 0, 0, 0.016, 0.02, 0.006) }, { g: tongue(0.009, 0.006), c: TONGUE, t: T(0, -0.016, 0.0062) }])!,
    open: bakeVC([{ g: dShape(0.026, 0.03), c: MOUTH_IN }, { g: tongue(0.014, 0.008), c: TONGUE, t: T(0, -0.02, 0.002) }, { g: teeth(0.014), c: TEETH, t: T(0, 0.0, 0.0025) }])!,
    laugh: bakeVC([{ g: dShape(0.036, 0.046), c: MOUTH_IN }, { g: tongue(0.02, 0.012), c: TONGUE, t: T(0, -0.031, 0.002) }, { g: teeth(0.022), c: TEETH, t: T(0, 0.0005, 0.0025) }])!,
  };
}
/** One eye: dark oval, lighter lower iris and two highlights (mirrored per side so the light comes from one side). */
export function eyeGeometry(lod: Lod) {
  return bakeVC([
    { g: sphere(q(lod, 8, 6, 4), q(lod, 6, 5, 3)), c: '#282321', t: T(0, 0, -0.006, 0, 0, 0, 0.034, 0.05, 0.016) },
    ...(lod === 0 ? [{ g: sphere(6, 4), c: '#5a3b2c', t: T(0, -0.019, 0.004, 0, 0, 0, 0.022, 0.02, 0.007) }] : []),
    { g: sphere(q(lod, 6, 4, 4), q(lod, 4, 3, 3)), c: '#ffffff', t: T(0.012, 0.017, 0.009, 0, 0, 0, 0.012, 0.013, 0.004) },
    ...(lod === 0 ? [{ g: sphere(4, 3), c: '#ffffff', t: T(-0.011, -0.015, 0.009, 0, 0, 0, 0.006, 0.006, 0.003) }] : []),
  ])!;
}
/** Closed happy eye: a ^ arc. */
export function eyeArcGeometry() { return bakeVC([{ g: taperTube([V3(-0.03, -0.012, 0.004), V3(-0.015, 0.008, 0.008), V3(0, 0.014, 0.009), V3(0.015, 0.008, 0.008), V3(0.03, -0.012, 0.004)], 0.0055, 0.0055, { tubular: 8, radial: 4 }), c: '#282321' }])!; }
export function browGeometry(color: string) { return bakeVC([{ g: taperTube([V3(-0.027, -0.004, 0), V3(-0.01, 0.004, 0.002), V3(0.01, 0.005, 0.002), V3(0.027, -0.001, 0)], 0.0065, 0.005, { tubular: 6, radial: 4, flat: 0.6 }), c: color }])!; }
export function cheekGeometry() {
  return bakeVC([1, -1].map((s) => { const [rx, ry] = surfRot(s * FACE.cheekX, FACE.cheekY); return { g: sphere(7, 4), c: '#EEA18A', t: T(s * FACE.cheekX, FACE.cheekY, surf(s * FACE.cheekX, FACE.cheekY) - 0.003, rx, ry, 0, 0.034, 0.02, 0.008) }; }))!;
}

// ---- body ---------------------------------------------------------------------------------
const zs = 0.8; // torso front-to-back squash
function torsoParts(o: Outfit, lod: Lod): CP[] {
  const P: CP[] = [];
  const seg = q(lod, 10, 8, 6); const smp = q(lod, 4, 3, 2);
  const sq = (g: THREE.BufferGeometry) => g.scale(1, 1, zs);
  P.push({ g: sq(lathe(smoothProfile([[0.135, -0.1], [0.15, -0.02], [0.162, 0.1], [0.163, 0.2], [0.145, 0.28], [0.1, 0.345], [0.055, 0.378]], smp), seg)), c: o.tee });
  const edge = (a: number, r: number, y: number) => V3(Math.sin(a) * r, y, Math.cos(a) * r * zs);
  if (o.top === 'jacket') {
    const gap = 0.8;
    const jp = smoothProfile([[0.168, -0.13], [0.174, -0.04], [0.181, 0.1], [0.181, 0.2], [0.166, 0.28], [0.127, 0.335], [0.092, 0.362]], q(lod, 6, 3, 2));
    P.push({ g: sq(lathe(jp, seg + 1, gap / 2, Math.PI * 2 - gap)), c: o.jacket });
    if (lod < 2) P.push({ g: sq(lathe([[0.175, -0.142], [0.178, -0.1]], seg, gap / 2, Math.PI * 2 - gap)), c: o.jacketDark }); // ribbed hem
    if (lod < 2) for (const s of [-1, 1]) {
      const a = s * gap / 2;
      // thick rounded front edge
      P.push({ g: taperTube([edge(a, 0.172, -0.135), edge(a, 0.178, 0.0), edge(a, 0.184, 0.15), edge(a * 1.15, 0.168, 0.27), edge(a * 1.6, 0.13, 0.335)], 0.013, 0.012, { tubular: q(lod, 5, 3, 3), radial: q(lod, 4, 3, 3) }), c: shade(o.jacket, 0.93) });
      // chest pocket with a flap
      const pa = s * 0.95; const fp = edge(pa, 0.192, 0.2);
      P.push({ g: softBox(0.046, 0.015, 0.011, 0.35, q(lod, 6, 4, 4), q(lod, 4, 3, 3)), c: o.jacketLight, t: T(fp.x, fp.y, fp.z, -0.12, pa, 0) });
    }
    if (o.hood) {
      // hood lying round the back of the neck and folded on the back, drawstrings at the front
      const ring = Array.from({ length: 9 }, (_, i) => { const a = 0.75 + (i / 8) * (Math.PI * 2 - 1.5); return V3(Math.sin(a) * 0.112, 0.352 + 0.022 * Math.max(0, -Math.cos(a)), Math.cos(a) * 0.1); });
      P.push({ g: taperTube(ring, 0.044, 0.044, { tubular: q(lod, 8, 6, 5), radial: q(lod, 5, 4, 3), flat: 0.8 }), c: o.hood });
      if (lod < 2) P.push({ g: deform(softBox(0.12, 0.1, 0.045, 0.6, q(lod, 6, 5, 4), q(lod, 5, 4, 3)), (v) => { v.z -= v.y * v.y * 2.2; }), c: o.hood, t: T(0, 0.27, -0.152, 0.32) });
      if (lod === 0) for (const s of [-1, 1]) {
        P.push({ g: taperTube([V3(s * 0.045, 0.34, 0.1), V3(s * 0.05, 0.29, 0.13), V3(s * 0.052, 0.24, 0.138)], 0.0055, 0.0055, { tubular: 3, radial: 3 }), c: o.hood });
      }
    }
  } else {
    if (o.top === 'shirt' || o.top === 'polo') {
      for (const s of [-1, 1]) P.push({ g: softBox(0.036, 0.02, 0.007, 0.4, 6, 4), c: shade(o.tee, 0.96), t: T(s * 0.042, 0.352, 0.072, -0.65, s * 0.45, s * 0.5) });
      if (lod < 2) P.push({ g: softBox(0.006, o.top === 'polo' ? 0.05 : 0.2, 0.004, 0.4, 4, 4), c: shade(o.tee, 0.85), t: T(0, o.top === 'polo' ? 0.3 : 0.15, 0.13) });
    }
    if (o.top === 'tee' && lod < 2) P.push({ g: taperTube(Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return V3(Math.sin(a) * 0.058, 0.372, Math.cos(a) * 0.058 * 0.9); }), 0.007, 0.007, { tubular: 10, radial: 4 }), c: shade(o.tee, 0.88) });
  }
  if (o.apron) {
    P.push({ g: deform(softBox(0.15, 0.2, 0.012, 0.3, q(lod, 8, 6, 6), 6), (v) => { v.z -= v.x * v.x * 1.4; }), c: o.apron, t: T(0, 0.06, 0.142) });
    P.push({ g: taperTube([V3(-0.1, 0.26, 0.13), V3(-0.06, 0.36, 0.06), V3(0, 0.38, -0.05), V3(0.06, 0.36, 0.06), V3(0.1, 0.26, 0.13)], 0.006, 0.006, { tubular: 8, radial: 3 }), c: o.apron });
  }
  if (o.backpack) {
    P.push({ g: softBox(0.14, 0.16, 0.07, 0.45, q(lod, 10, 8, 6), q(lod, 8, 6, 4)), c: '#35363C', t: T(0, 0.15, -0.2) });
    if (lod < 2) P.push({ g: softBox(0.1, 0.065, 0.025, 0.4, 8, 6), c: '#2a2b30', t: T(0, 0.08, -0.268) });
    if (lod < 2) P.push({ g: taperTube([V3(-0.03, 0.31, -0.2), V3(0, 0.34, -0.205), V3(0.03, 0.31, -0.2)], 0.008, 0.008, { tubular: 4, radial: 4 }), c: '#2a2b30' });
    for (const s of [-1, 1]) P.push({ g: taperTube([V3(s * 0.08, 0.31, -0.15), V3(s * 0.1, 0.37, -0.02), V3(s * 0.11, 0.3, 0.13), V3(s * 0.12, 0.12, 0.155), V3(s * 0.14, 0.0, 0.06)], 0.015, 0.012, { tubular: q(lod, 8, 6, 4), radial: q(lod, 4, 4, 3), flat: 0.4 }), c: '#2a2b30' });
  }
  if (o.sling) {
    // crossbody strap from the left shoulder across the chest to the right hip, and round the back
    P.push({ g: taperTube([V3(0.12, 0.35, 0.05), V3(0.1, 0.32, 0.125), V3(0.0, 0.2, 0.158), V3(-0.1, 0.08, 0.162), V3(-0.15, 0.0, 0.142)], 0.014, 0.014, { tubular: q(lod, 6, 4, 3), radial: q(lod, 3, 3, 3), flat: 0.35 }), c: '#35363C' });
    P.push({ g: taperTube([V3(0.12, 0.35, -0.03), V3(0.06, 0.28, -0.153), V3(-0.08, 0.12, -0.162), V3(-0.18, 0.0, -0.09)], 0.014, 0.014, { tubular: q(lod, 5, 3, 3), radial: q(lod, 3, 3, 3), flat: 0.35 }), c: '#35363C' });
    if (lod === 0) P.push({ g: softBox(0.016, 0.01, 0.006, 0.4, 4, 4), c: '#8f9093', t: T(0.03, 0.235, 0.16, 0, 0, 0.75) });
  }
  return P;
}
/** The crossbody bag itself (its own group, so it can swing). Pivot where the strap meets it. */
function bagParts(o: Outfit, lod: Lod): CP[] {
  if (!o.sling) return [];
  const P: CP[] = [{ g: softBox(0.088, 0.052, 0.034, 0.42, q(lod, 8, 6, 4), q(lod, 6, 4, 3)), c: '#35363C', t: T(-0.01, -0.04, 0.0) }];
  if (lod < 2) {
    P.push({ g: taperTube([V3(-0.085, -0.02, 0.034), V3(0.07, -0.02, 0.034)], 0.0028, 0.0028, { tubular: 2, radial: 3 }), c: '#26272b' });
    P.push({ g: softBox(0.0055, 0.019, 0.0045, 0.5, 4, 4), c: '#F08A24', t: T(0.055, -0.042, 0.038) });
  }
  return P;
}

function pelvisParts(o: Outfit, lod: Lod): CP[] {
  const seg = q(lod, 11, 8, 6);
  if (o.skirt) return [{ g: lathe(smoothProfile([[0.2, -0.25], [0.175, -0.12], [0.158, 0.0], [0.15, 0.06]], q(lod, 6, 4, 3)), seg).scale(1, 1, 0.85), c: o.pants }];
  const P: CP[] = [{ g: lathe(smoothProfile([[0.11, -0.11], [0.148, -0.055], [0.158, 0.02], [0.15, 0.07]], q(lod, 4, 2, 1)), seg).scale(1, 1, 0.82), c: o.pants }];
  if (lod === 0 && o.top !== 'jacket') P.push({ g: taperTube(Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return V3(Math.sin(a) * 0.152, 0.055, Math.cos(a) * 0.152 * 0.82); }), 0.008, 0.008, { tubular: 10, radial: 3 }), c: o.pantsDark });
  return P;
}
function thighParts(o: Outfit, side: number, lod: Lod): CP[] {
  const seg = q(lod, 9, 6, 5); const smp = q(lod, 3, 2, 1);
  const P: CP[] = [];
  if (o.skirt) { P.push({ g: lathe(smoothProfile([[0.044, -0.205], [0.05, -0.1], [0.055, 0.0]], smp), seg), c: o.skin }); return P; }
  if (o.shorts) {
    P.push({ g: lathe(smoothProfile([[0.078, -0.12], [0.08, -0.04], [0.082, 0.04]], smp), seg), c: o.pants });
    P.push({ g: lathe(smoothProfile([[0.044, -0.205], [0.048, -0.12], [0.05, -0.08]], smp), seg), c: o.skin });
    return P;
  }
  P.push({ g: lathe(smoothProfile([[0.074, -0.208], [0.076, -0.12], [0.08, -0.03], [0.082, 0.04]], smp), seg).scale(1, 1, 0.95), c: o.pants });
  if (o.cargo && lod < 2) {
    P.push({ g: softBox(0.014, 0.05, 0.042, 0.35, q(lod, 6, 4, 4), q(lod, 4, 3, 3)), c: o.pantsLight, t: T(side * 0.079, -0.1, 0.0) });
  }
  return P;
}
function shinParts(o: Outfit, lod: Lod): CP[] {
  const seg = q(lod, 9, 6, 5); const smp = q(lod, 2, 1, 1);
  const P: CP[] = [];
  const bare = o.shorts || o.skirt;
  if (bare) {
    P.push({ g: sphere(q(lod, 8, 6, 5), q(lod, 6, 4, 3)), c: o.skin, t: T(0, 0, 0, 0, 0, 0, 0.048) });
    P.push({ g: lathe(smoothProfile([[0.038, -0.17], [0.045, -0.08], [0.047, 0]], smp), seg), c: o.skin });
    P.push({ g: lathe([[0.042, -0.2], [0.044, -0.165]], seg), c: '#f2efe8' });
  } else {
    if (lod < 2) P.push({ g: sphere(q(lod, 7, 6, 5), q(lod, 4, 4, 3)), c: o.pants, t: T(0, 0, 0, 0, 0, 0, 0.071, 0.071, 0.068) });
    P.push({ g: lathe(smoothProfile([[0.08, -0.15], [0.078, -0.07], [0.075, 0.0]], smp), seg), c: o.pants });
    // rolled cuff
    if (lod < 2) P.push({ g: lathe(lod === 0 ? [[0.083, -0.178], [0.09, -0.165], [0.09, -0.146], [0.084, -0.134]] : [[0.088, -0.178], [0.088, -0.136]], seg), c: o.pantsCuff });
  }
  // chunky sneaker: rounded upper, thick sole, side stripes (ground at y = −0.27 in knee space)
  const G = -(D.shin + D.ankle);
  const upper = deform(sphere(q(lod, 9, 7, 6), q(lod, 6, 5, 4)), (v) => {
    v.y = Math.max(v.y, -0.45);
    if (v.z > 0.3) v.y = Math.min(v.y, 0.85 - (v.z - 0.3) * 0.95);
  });
  P.push({ g: upper, c: o.shoe, t: T(0, G + 0.065, 0.03, 0, 0, 0, 0.064, 0.062, 0.122) });
  P.push({ g: softBox(0.068, 0.02, 0.128, 0.5, q(lod, 8, 6, 5), q(lod, 4, 3, 3)), c: o.shoeSole, t: T(0, G + 0.02, 0.03) });
  if (lod === 0) for (const s of [-1, 1]) for (const k of [0, 1]) P.push({ g: taperTube([V3(s * 0.064, G + 0.035, -0.005 + k * 0.034), V3(s * 0.066, G + 0.062, 0.016 + k * 0.034), V3(s * 0.058, G + 0.088, 0.036 + k * 0.03)], 0.0065, 0.005, { tubular: 2, radial: 3 }), c: o.shoeStripe });
  if (lod === 1) for (const s of [-1, 1]) P.push({ g: softBox(0.004, 0.022, 0.03, 0.5, 3, 3), c: o.shoeStripe, t: T(s * 0.064, G + 0.06, 0.03, 0, 0, s * 0.1) });
  return P;
}

const longSleeve = (o: Outfit) => o.top === 'jacket' || o.top === 'shirt';
const sleeveColor = (o: Outfit) => (o.top === 'jacket' ? o.jacket : o.tee);
function upperArmParts(o: Outfit, side: number, lod: Lod): CP[] {
  const seg = q(lod, 8, 6, 5); const smp = q(lod, 2, 1, 1);
  const c = sleeveColor(o);
  const P: CP[] = [{ g: sphere(q(lod, 7, 6, 5), q(lod, 5, 4, 3)), c, t: T(-side * 0.012, -0.01, 0, 0, 0, 0, 0.07) }];
  if (longSleeve(o)) P.push({ g: lathe(smoothProfile([[0.06, -0.175], [0.063, -0.09], [0.067, -0.01]], smp), seg), c });
  else {
    P.push({ g: lathe(smoothProfile([[0.064, -0.085], [0.066, -0.01]], smp), seg), c });
    P.push({ g: lathe(smoothProfile([[0.037, -0.175], [0.041, -0.07]], smp), seg), c: o.skin });
  }
  return P;
}
function forearmParts(o: Outfit, lod: Lod): CP[] {
  const seg = q(lod, 8, 6, 5); const smp = q(lod, 2, 1, 1);
  if (!longSleeve(o)) return [
    { g: sphere(q(lod, 8, 6, 5), q(lod, 6, 4, 3)), c: o.skin, t: T(0, 0, 0, 0, 0, 0, 0.039) },
    { g: lathe(smoothProfile([[0.031, -0.152], [0.036, -0.07], [0.038, 0]], smp), seg), c: o.skin },
  ];
  const c = sleeveColor(o);
  return [
    { g: sphere(q(lod, 7, 6, 5), q(lod, 4, 4, 3)), c, t: T(0, 0, 0, 0, 0, 0, 0.058) },
    { g: lathe(smoothProfile([[0.052, -0.13], [0.055, -0.06], [0.057, 0]], smp), seg), c },
    ...(lod < 2 ? [{ g: lathe([[0.056, -0.152], [0.058, -0.126]], seg), c: o.top === 'jacket' ? o.jacketDark : shade(o.tee, 0.9) }] : []),
  ];
}
/** Mitten hand: palm (in the hand group, wrist at the origin, palm facing −side·x). */
function palmParts(o: Outfit, lod: Lod): CP[] {
  return [
    { g: lathe([[0.03, -0.01], [0.033, 0.02]], q(lod, 6, 5, 5)), c: o.skin },
    { g: softBox(0.027, 0.036, 0.04, 0.6, q(lod, 5, 5, 4), q(lod, 4, 4, 3)), c: o.skin, t: T(0, -0.028, 0) },
  ];
}
const fingerParts = (o: Outfit, lod: Lod): CP[] => [{ g: softBox(0.024, 0.03, 0.04, 0.65, q(lod, 5, 5, 4), q(lod, 4, 4, 3)), c: o.skin, t: T(0, -0.025, 0) }];
const thumbParts = (o: Outfit, lod: Lod): CP[] => [{ g: softBox(0.013, 0.022, 0.013, 0.6, q(lod, 5, 4, 4), 3), c: o.skin, t: T(0, -0.016, 0.004) }];
const mittenParts = (o: Outfit): CP[] => [
  { g: softBox(0.028, 0.06, 0.042, 0.6, 5, 3), c: o.skin, t: T(0, -0.042, 0) },
];

export type ChibiGeo = {
  head: THREE.BufferGeometry; neck: THREE.BufferGeometry; torso: THREE.BufferGeometry; bag: THREE.BufferGeometry | null; pelvis: THREE.BufferGeometry;
  thighL: THREE.BufferGeometry; thighR: THREE.BufferGeometry; shin: THREE.BufferGeometry;
  upperL: THREE.BufferGeometry; upperR: THREE.BufferGeometry; fore: THREE.BufferGeometry;
  palm: THREE.BufferGeometry | null; fingers: THREE.BufferGeometry | null; thumb: THREE.BufferGeometry | null; mitten: THREE.BufferGeometry | null;
  tris: number;
};
const cache = new Map<string, ChibiGeo>();
const outfitKey = (o: Outfit) => JSON.stringify(o);

/** Geometry of one outfit at one LOD, cached and shared by every character wearing it. */
export function chibiGeometry(o: Outfit, lod: Lod): ChibiGeo {
  const key = outfitKey(o) + '|' + lod;
  const hit = cache.get(key); if (hit) return hit;
  const g: ChibiGeo = {
    head: bakeVC(headParts(o, lod))!,
    neck: bakeVC([{ g: lathe([[0.056, -0.02], [0.052, 0.1]], q(lod, 7, 5, 4)), c: o.skin }])!,
    torso: bakeVC(torsoParts(o, lod))!,
    bag: bakeVC(bagParts(o, lod)),
    pelvis: bakeVC(pelvisParts(o, lod))!,
    thighL: bakeVC(thighParts(o, 1, lod))!, thighR: bakeVC(thighParts(o, -1, lod))!,
    shin: bakeVC(shinParts(o, lod))!,
    upperL: bakeVC(upperArmParts(o, 1, lod))!, upperR: bakeVC(upperArmParts(o, -1, lod))!,
    fore: bakeVC(forearmParts(o, lod))!,
    palm: lod < 2 ? bakeVC(palmParts(o, lod)) : null,
    fingers: lod < 2 ? bakeVC(fingerParts(o, lod)) : null,
    thumb: lod < 2 ? bakeVC(thumbParts(o, lod)) : null,
    mitten: lod === 2 ? bakeVC(mittenParts(o)) : null,
    tris: 0,
  };
  const t = (x: THREE.BufferGeometry | null) => (x ? x.getAttribute('position').count / 3 : 0);
  g.tris = t(g.head) + t(g.neck) + t(g.torso) + t(g.bag) + t(g.pelvis) + t(g.thighL) + t(g.thighR) + 2 * t(g.shin) + t(g.upperL) + t(g.upperR) + 2 * t(g.fore) + 2 * (t(g.palm) + t(g.fingers) + t(g.thumb) + t(g.mitten));
  cache.set(key, g);
  return g;
}
