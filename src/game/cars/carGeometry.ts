import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tyreRadius, type CarSpec } from './carSpecs';

/*
 * Procedural car builder (vehicle bible sections 05–08): a lofted body whose side really steps in round the wheels
 * (dark arch liners, wheels never through the panels), a hollow greenhouse with separate glass, pillars and roof,
 * doors and the tailgate cut out of the same skin as their own pivot groups (with inner trims), wheels in
 * steer > spin groups, emissive light groups, small exterior details and, at LOD0, the whole cabin.
 * Static pieces are merged per material so a car is a few dozen draw calls up close and a handful far away.
 *
 * Car frame: +Z forward, Y up, +X = the car's left (driver side). All sizes in metres, from CarSpec.
 */
export type DoorId = 'FL' | 'FR' | 'RL' | 'RR';
export type MatKey = 'paint' | 'black' | 'silver' | 'chrome' | 'tyre' | 'glass' | 'glassPrivacy' | 'glassDark' | 'liner' | 'leather' | 'dash' | 'carpet' | 'headliner'
  | 'drl' | 'lowBeam' | 'brake' | 'tail' | 'turn' | 'reverse' | 'grille' | 'emblem' | 'plate' | 'screen' | 'red' | 'mirror';
export type CarParts = {
  root: THREE.Group;
  doors: Partial<Record<DoorId, { group: THREE.Group; slide: boolean; side: 1 | -1; len: number }>>;
  tailgate: THREE.Group | null;
  wheels: { steer: THREE.Group; spin: THREE.Group; front: boolean }[];
  steeringWheel: THREE.Group | null;
  seatFold: THREE.Group[];
  wipers: THREE.Group[];
  /** passenger anchors: hip position (car frame) per seat id */
  seats: { id: string; row: number; hip: THREE.Vector3 }[];
  screen: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } | null;
  tris: number;
};

// ---------------- geometry accumulation ----------------
class Batch {
  private lists = new Map<MatKey, THREE.BufferGeometry[]>();
  private tris = new Map<MatKey, number[]>();
  tri(k: MatKey, ...p: number[]) { let l = this.tris.get(k); if (!l) { l = []; this.tris.set(k, l); } l.push(...p); }
  quad(k: MatKey, a: number[], b: number[], c: number[], d: number[]) { this.tri(k, ...a, ...b, ...c); this.tri(k, ...a, ...c, ...d); }
  add(k: MatKey, g: THREE.BufferGeometry, m?: THREE.Matrix4) { const gg = (g.index ? g.toNonIndexed() : g.clone()); for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n); if (!gg.getAttribute('normal')) gg.computeVertexNormals(); if (m) gg.applyMatrix4(m); let l = this.lists.get(k); if (!l) { l = []; this.lists.set(k, l); } l.push(gg); }
  box(k: MatKey, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.add(k, new THREE.BoxGeometry(sx, sy, sz), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  }
  /** Meshes, one per material; `smooth` keys get welded vertices and smooth normals. */
  build(mats: (k: MatKey) => THREE.Material, smooth: MatKey[] = []) {
    const out: THREE.Mesh[] = []; let tris = 0;
    const keys = new Set<MatKey>([...this.lists.keys(), ...this.tris.keys()]);
    for (const k of keys) {
      const parts = [...(this.lists.get(k) ?? [])];
      const t = this.tris.get(k);
      if (t?.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3)); g.computeVertexNormals(); parts.push(g); }
      if (!parts.length) continue;
      let g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
      if (smooth.includes(k)) { g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); }
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      const mesh = new THREE.Mesh(g, mats(k)); mesh.castShadow = k === 'paint' || k === 'black'; out.push(mesh);
    }
    return { meshes: out, tris };
  }
}

// ---------------- body profile ----------------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function sectionAt(spec: CarSpec, t: number) {
  const s = spec.sections; let i = 0; while (i < s.length - 2 && t > s[i + 1][0]) i++;
  const k = Math.min(1, Math.max(0, (t - s[i][0]) / (s[i + 1][0] - s[i][0])));
  return { rw: lerp(s[i][1], s[i + 1][1], k), rh: lerp(s[i][2], s[i + 1][2], k) };
}
type Prof = { hw: number; ys: number; yb: number };
function profAt(spec: CarSpec, z: number): Prof {
  const L = spec.length, t = z / L; const { rw, rh } = sectionAt(spec, t);
  let hw = (spec.width / 2) * rw; const ys = spec.height * rh;
  // plan-view rounding of the nose and tail
  const nl = spec.id === 'luhanh' ? 0.42 : 0.32; const nose = z - (L / 2 - nl), tail = -L / 2 + 0.28 - z;
  if (nose > 0) hw *= 1 - (spec.id === 'luhanh' ? 0.17 : 0.13) * (nose / nl) ** 2;
  let ysR = ys; if (nose > 0 && spec.id === 'luhanh') ysR -= 0.07 * (nose / nl) ** 2.2; // rounded leading edge of the hood
  if (tail > 0) hw *= 1 - (spec.id === 'luhanh' ? 0.07 : 0.1) * (tail / 0.28) ** 2;
  // the bumpers lift the underside at both overhangs
  const fo = z - (spec.axleF + 0.35), ro = spec.axleR - 0.35 - z;
  const yb = spec.clearance + Math.max(0, fo) * 0.18 + Math.max(0, ro) * 0.22;
  return { hw, ys: ysR, yb };
}
/**
 * Half profile from the bottom centre to the top centre: [x, y][]. The side (from index 2 to TOP − 1) has `sideN`
 * extra points so the wheel arches come out round; TOP is the first point of the hood / deck surface.
 */
function halfProfile(p: Prof, sideN: number): [number, number][] {
  const { hw, ys, yb } = p; const crown = 0.03; const out: [number, number][] = [[0, yb], [hw * 0.85, yb], [hw * 0.965, yb + 0.05], [hw * 0.99, yb + 0.16]];
  // the side bulges a little at mid height; above the crease line (u > 0,76) it steps in, so light breaks along it
  for (let k = 1; k <= sideN; k++) { const u = k / (sideN + 1); out.push([hw * (0.99 + 0.01 * Math.sin(Math.PI * Math.min(1, u / 0.76)) - (u > 0.76 ? 0.007 : 0)), lerp(yb + 0.16, ys - 0.1, u)]); }
  out.push([hw * 0.982, ys - 0.1], [hw * 0.962, ys - 0.035], [hw * 0.925, ys - 0.005], [hw * 0.62, ys + crown * 0.85], [0, ys + crown]);
  return out;
}
const topIndex = (sideN: number) => 4 + sideN + 2;

/** z samples: coarse along the body, dense through the wheel arches, exact at door cuts and pillars. */
function zSamples(spec: CarSpec, coarse: number, dense: number) {
  const L = spec.length, r = tyreRadius(spec.tyre) + 0.05; const zs = new Set<number>();
  for (let z = -L / 2; z <= L / 2 + 1e-6; z += coarse) zs.add(+z.toFixed(4));
  for (const a of [spec.axleF, spec.axleR]) for (let z = a - r - 0.02; z <= a + r + 0.02; z += dense) zs.add(+z.toFixed(4));
  for (const t of [spec.doors.front[0], spec.doors.front[1], spec.doors.rear[0], spec.doors.rear[1], spec.glass.ws0, spec.glass.ws1, spec.glass.roof1, spec.glass.tail, ...spec.pillars]) zs.add(+(t * L).toFixed(4));
  zs.add(L / 2); zs.add(-L / 2);
  return [...zs].filter((z) => z >= -L / 2 - 1e-6 && z <= L / 2 + 1e-6).sort((a, b) => a - b);
}

// ---------------- the builder ----------------
export function buildCar(spec: CarSpec, lod: 0 | 1 | 2 | 3, mats: (k: MatKey) => THREE.Material): CarParts {
  const root = new THREE.Group(); root.name = `${spec.id}-lod${lod}`;
  const L = spec.length, H = spec.height;
  const r = tyreRadius(spec.tyre), tw = spec.tyre[0] / 1000;
  const parts: CarParts = { root, doors: {}, tailgate: null, wheels: [], steeringWheel: null, seatFold: [], wipers: [], seats: [], screen: null, tris: 0 };
  if (lod === 3) return buildLod3(spec, parts, mats);

  const body = new Batch(); const tgB = new Batch();
  const doorB: Partial<Record<DoorId, Batch>> = {};
  const zDoorF: [number, number] = [spec.doors.front[1] * L, spec.doors.front[0] * L];
  const zDoorR: [number, number] = [spec.doors.rear[1] * L, spec.doors.rear[0] * L];
  const zWs0 = spec.glass.ws0 * L, zWs1 = spec.glass.ws1 * L, zRoof1 = spec.glass.roof1 * L, zTail = spec.glass.tail * L;
  const split = lod === 0; // doors, tailgate as separate groups
  const zs = zSamples(spec, lod === 0 ? 0.08 : lod === 1 ? 0.22 : 0.9, lod === 0 ? 0.03 : lod === 1 ? 0.07 : 0.26);
  const archR = r + 0.045, innerX = spec.track / 2 - tw / 2 - 0.04;
  const isSuv = spec.id !== 'luhanh';
  const SIDE_N = lod === 0 ? 9 : lod === 1 ? 3 : 1; const TOP = topIndex(SIDE_N);
  // profile rings (with arch recesses) for every z
  const rings = zs.map((z) => {
    const p = profAt(spec, z); const half = halfProfile(p, SIDE_N);
    const pts = half.map(([x, y]) => {
      let arch = false;
      for (const a of [spec.axleF, spec.axleR]) if ((z - a) ** 2 + (y - r) ** 2 < archR * archR && x > innerX) { x = innerX; arch = true; }
      return { x, y, arch };
    });
    return { z, p, pts };
  });
  const doorOf = (z: number, y: number, p: Prof): 'F' | 'R' | null => {
    if (!split || y < p.yb + 0.16 || y > p.ys) return null;
    if (z > zDoorF[0] && z < zDoorF[1]) return 'F';
    if (z > zDoorR[0] && z < zDoorR[1]) return 'R';
    return null;
  };
  const inCabin = (z: number) => z < zWs0 && z > zTail;
  // lower body loft
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1]; const zm = (A.z + B.z) / 2; const pm = profAt(spec, zm);
    for (let j = 0; j < A.pts.length - 1; j++) {
      if (j >= TOP && inCabin(zm)) continue; // open above the belt inside the cabin
      for (const side of [1, -1] as const) {
        const v = (q: { x: number; y: number }, z: number) => [q.x * side, q.y, z];
        const a = A.pts[j], b = A.pts[j + 1], c = B.pts[j + 1], d = B.pts[j];
        const ym = (a.y + b.y + c.y + d.y) / 4;
        const liner = a.arch || b.arch || c.arch || d.arch;
        let k: MatKey = liner ? 'liner' : (isSuv && j <= 2) || j === 0 ? 'black' : 'paint';
        const door = !liner && j >= 2 && j < TOP ? doorOf(zm, ym, pm) : null;
        // winding: outward on the left (+X) side, mirrored on the right
        const [p0, p1, p2, p3] = side > 0 ? [v(a, A.z), v(b, A.z), v(c, B.z), v(d, B.z)] : [v(a, A.z), v(d, B.z), v(c, B.z), v(b, A.z)];
        if (door) { const id = (door + (side > 0 ? 'L' : 'R')) as DoorId; (doorB[id] ??= new Batch()).quad(k, p0, p1, p2, p3); }
        else if (split && zm < zTail + 0.12 && ym > pm.yb + 0.42 && j >= 3) tgB.quad(k, p0, p1, p2, p3);
        else body.quad(k, p0, p1, p2, p3);
      }
    }
  }
  // nose and tail caps
  for (const [ring, front] of [[rings[rings.length - 1], true], [rings[0], false]] as const) {
    const loop: [number, number][] = [...ring.pts.map((q) => [q.x, q.y] as [number, number]), ...[...ring.pts].reverse().slice(1, -1).map((q) => [-q.x, q.y] as [number, number])];
    const cy = (ring.p.yb + ring.p.ys) / 2;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const P0 = [0, cy, ring.z], P1 = [a[0], a[1], ring.z], P2 = [b[0], b[1], ring.z];
      const yC = (a[1] + b[1] + cy) / 3;
      const tri = [...P0, ...P2, ...P1]; // same winding for both caps (the loop runs the other way round seen from behind)
      if (!front && split && yC > ring.p.yb + 0.42) tgB.tri('paint', ...tri); else body.tri(yC < ring.p.yb + 0.2 ? 'black' : 'paint', ...tri);
    }
  }
  // ---------------- greenhouse ----------------
  const roofY = (z: number, p: Prof) => {
    if (z >= zWs1) return lerp(H, p.ys, (z - zWs1) / (zWs0 - zWs1));
    if (z >= zRoof1) return H - 0.012 * ((z - zRoof1) / (zWs1 - zRoof1)) ** 2;
    return lerp(H - 0.01, spec.glass.tailY * H, (zRoof1 - z) / (zRoof1 - zTail));
  };
  const gz = zs.filter((z) => z <= zWs0 + 1e-6 && z >= zTail - 1e-6);
  const gh = gz.map((z) => { const p = profAt(spec, z); const y = roofY(z, p); const wb = p.hw * 0.93; const wr = p.hw * 0.86; const w = lerp(wb, wr, Math.min(1, Math.max(0, (y - p.ys) / (H - p.ys)))); return { z, p, y, wb, w }; });
  const pillarAt = (z: number) => spec.pillars.some((t) => Math.abs(z - t * L) < (spec.id === 'luhanh' ? 0.07 : 0.06));
  for (let i = 0; i < gh.length - 1; i++) {
    const A = gh[i], B = gh[i + 1]; const zm = (A.z + B.z) / 2;
    // top: windshield / roof / rear glass, slight crown across
    const top: MatKey = zm > zWs1 ? (lod === 0 ? 'glass' : 'glassDark') : zm > zRoof1 ? 'paint' : (lod === 0 ? 'glassPrivacy' : 'glassDark');
    const N = 4;
    for (let k = 0; k < N; k++) {
      const x0 = -1 + (2 * k) / N, x1 = -1 + (2 * (k + 1)) / N;
      const P = (g: typeof A, s: number) => [g.w * s, g.y + 0.02 * (1 - s * s) * (g.y > g.p.ys + 0.05 ? 1 : 0), g.z];
      const q = [P(A, x0), P(A, x1), P(B, x1), P(B, x0)];
      const dst = split && zm < zRoof1 ? tgB : body;
      dst.quad(top === 'paint' && isSuv ? 'paint' : top, q[0], q[3], q[2], q[1]);
    }
    // sides: glass with pillars; A pillar (painted) ahead of the windshield top
    for (const side of [1, -1] as const) {
      const a = [A.wb * side, A.p.ys, A.z], b = [A.w * side, A.y, A.z], c = [B.w * side, B.y, B.z], d = [B.wb * side, B.p.ys, B.z];
      const ym = (A.y + B.y) / 2;
      let k: MatKey = lod === 0 ? (zm < spec.pillars[0] * L - 0.08 ? 'glassPrivacy' : 'glass') : 'glassDark';
      if (zm > zWs1) k = 'black'; else if (pillarAt(zm)) k = 'black';
      if (spec.cPillar !== undefined && zm < spec.cPillar * L) k = 'paint';
      if (spec.id === 'luhanh' && Math.abs(zm - spec.pillars[2] * L) < 0.085) k = 'silver'; // the bright D-pillar piece
      const quad = side > 0 ? [a, b, c, d] : [a, d, c, b];
      const door = split && ym > 0 && (zm > zDoorF[0] && zm < zDoorF[1] ? 'F' : zm > zDoorR[0] && zm < zDoorR[1] ? 'R' : null);
      if (door && zm < zWs1) { const id = (door + (side > 0 ? 'L' : 'R')) as DoorId; (doorB[id] ??= new Batch()).quad(k, quad[0], quad[1], quad[2], quad[3]); }
      else if (split && zm < zRoof1) tgB.quad(k, quad[0], quad[1], quad[2], quad[3]);
      else body.quad(k, quad[0], quad[1], quad[2], quad[3]);
      // chrome window line along the belt (moves with the doors)
      if (spec.chromeBelt && lod < 2 && zm < zWs0 - 0.12 && (spec.cPillar === undefined || zm > spec.cPillar * L - 0.02)) {
        const ox = 1.004, sq = [[A.wb * side * ox, A.p.ys - 0.005, A.z], [A.wb * side * ox, A.p.ys + 0.022, A.z], [B.wb * side * ox, B.p.ys + 0.022, B.z], [B.wb * side * ox, B.p.ys - 0.005, B.z]];
        const sqq = side > 0 ? sq : [sq[0], sq[3], sq[2], sq[1]];
        const dst = door && zm < zWs1 ? doorB[(door + (side > 0 ? 'L' : 'R')) as DoorId]! : body;
        dst.quad('chrome', sqq[0], sqq[1], sqq[2], sqq[3]);
      }
      // window rubber along the roof edge
      if (lod === 0 && zm < zWs1) body.quad('black', [A.w * side * 1.001, A.y - 0.03, A.z], [A.w * side * 1.001, A.y, A.z], [B.w * side * 1.001, B.y, B.z], [B.w * side * 1.001, B.y - 0.03, B.z]);
    }
  }
  // the panel under the rear glass (top of the tailgate) closing the greenhouse at the tail
  { const g = gh[0]; const dst = split ? tgB : body; const q = [[-g.wb, g.p.ys, g.z], [-g.w, g.y, g.z], [g.w, g.y, g.z], [g.wb, g.p.ys, g.z]]; dst.quad('paint', q[0], q[1], q[2], q[3]); dst.quad('paint', q[0], q[3], q[2], q[1]); }

  // ---------------- details, lights ----------------
  frontAndRear(spec, lod, body, tgB, split);
  if (lod < 2) sideDetails(spec, lod, body, doorB, split, zDoorF, zDoorR, zWs0, zWs1, zRoof1);
  // wheel-arch trims: a dark band round each arch on the body side (covers the stepped edge of the recess)
  if (lod < 2) for (const a of [spec.axleF, spec.axleR]) for (const sd of [1, -1]) {
    const p = profAt(spec, a); const ring = new THREE.RingGeometry(archR - 0.015, archR + 0.055, lod === 0 ? 24 : 12, 1, 0, Math.PI);
    ring.rotateY(sd * Math.PI / 2); // into the side plane, facing out
    const m = new THREE.Matrix4().makeTranslation(sd * (p.hw + 0.009), r, a);
    body.add('black', ring, m);
    if (lod === 0) { const back = ring.clone(); back.rotateY(Math.PI); body.add('black', back, new THREE.Matrix4().makeTranslation(sd * (p.hw + 0.007), r, a)); }
  }

  // ---------------- interior (LOD0 only) ----------------
  const interior = new THREE.Group(); interior.name = 'InteriorRoot';
  if (lod === 0) buildInterior(spec, interior, parts, mats, zWs0, zTail);

  // ---------------- assemble ----------------
  const visual = new THREE.Group(); visual.name = 'VisualRoot'; root.add(visual);
  const b = body.build(mats, ['paint']); b.meshes.forEach((m) => visual.add(m)); parts.tris += b.tris;
  if (split) {
    for (const id of Object.keys(doorB) as DoorId[]) {
      const side = id.endsWith('L') ? 1 : -1; const front = id.startsWith('F');
      const zr = front ? zDoorF : zDoorR; const p = profAt(spec, zr[1]);
      const slide = !front && spec.doorType === 'slidingRear';
      const g = new THREE.Group(); g.name = `Door${id}`;
      // hinge at the door's front edge on the body side
      const pivot = new THREE.Vector3(side * p.hw, 0, zr[1]); g.position.copy(pivot);
      const db = doorB[id]!;
      // inner trim panel (leather / dark), door handle inside
      const pin = profAt(spec, (zr[0] + zr[1]) / 2);
      const x = side * (pin.hw - 0.07), len = zr[1] - zr[0];
      db.box('leather', 0.03, pin.ys - pin.yb - 0.3, len - 0.08, x, (pin.ys + pin.yb + 0.25) / 2, (zr[0] + zr[1]) / 2);
      db.box('dash', 0.06, 0.05, len * 0.5, x - side * 0.02, pin.ys - 0.18, (zr[0] + zr[1]) / 2);
      const built = db.build(mats, ['paint']);
      built.meshes.forEach((m) => { m.position.sub(pivot); g.add(m); }); parts.tris += built.tris;
      visual.add(g); parts.doors[id] = { group: g, slide, side, len };
    }
    const tg = new THREE.Group(); tg.name = 'TailgatePivot'; const pivot = new THREE.Vector3(0, H - 0.02, zRoof1); tg.position.copy(pivot);
    const tb = tgB.build(mats, ['paint']); tb.meshes.forEach((m) => { m.position.sub(pivot); tg.add(m); }); parts.tris += tb.tris;
    visual.add(tg); parts.tailgate = tg;
  }
  // wheels
  const wheel = wheelGeometry(spec, lod, mats);
  for (const [z, front] of [[spec.axleF, true], [spec.axleR, false]] as const) for (const side of [1, -1]) {
    const steer = new THREE.Group(); steer.position.set(side * spec.track / 2, r, z);
    const spin = new THREE.Group(); steer.add(spin);
    for (const m of wheel.meshes) { const mm = m.clone(); if (side < 0) mm.scale.x = -1; spin.add(mm); }
    visual.add(steer); parts.wheels.push({ steer, spin, front });
  }
  parts.tris += wheel.tris * 4;
  if (lod === 0) { visual.add(interior); parts.tris += countTris(interior); }
  return parts;
}
function countTris(o: THREE.Object3D) { let t = 0; o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { const g = m.geometry; t += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } }); return t; }

// ---------------- fascia: grille, lamps, bumpers, emblem, plates ----------------
function frontAndRear(spec: CarSpec, lod: number, body: Batch, tg: Batch, split: boolean) {
  const L = spec.length; const zf = L / 2, zr = -L / 2;
  const pf = profAt(spec, zf - 0.01), pr = profAt(spec, zr + 0.01);
  const ysF = pf.ys, hwF = pf.hw, ybF = pf.yb;
  const id = spec.id;
  const e = 0.012; // proud of the cap
  // grille
  if (id === 'luhanh') {
    // a wide grille nearly the full width of the face, framed in chrome, fine mesh
    const gw = hwF * 2 - 0.34, gt = ysF - 0.07, gb = ybF + 0.3;
    body.box('grille', gw, gt - gb, 0.02, 0, (gt + gb) / 2, zf + e);
    body.box('chrome', gw + 0.04, 0.022, 0.026, 0, gt + 0.005, zf + e); body.box('chrome', gw - 0.1, 0.018, 0.026, 0, gb - 0.005, zf + e);
    for (const s of [1, -1]) body.box('chrome', 0.02, gt - gb, 0.026, s * (gw / 2 + 0.01), (gt + gb) / 2, zf + e);
    for (let i = 1; i < 4; i++) body.box('silver', gw - 0.06, 0.008, 0.024, 0, gb + (gt - gb) * i / 4, zf + e); // horizontal bars of the mesh
  } else if (id === 'phonho') {
    // tiger-nose: a wide upper band between the lamps, pinched waist, a narrower lower part; bright frame and top bar
    body.box('grille', 1.06, 0.17, 0.02, 0, ysF - 0.16, zf + e);
    body.box('grille', 0.84, 0.13, 0.02, 0, ysF - 0.31, zf + e);
    body.box('chrome', 1.1, 0.02, 0.026, 0, ysF - 0.065, zf + e); // the bar linking both lamps
    for (const s of [1, -1]) { body.box('chrome', 0.018, 0.17, 0.026, s * 0.54, ysF - 0.16, zf + e, 0, 0, s * 0.12); body.box('chrome', 0.018, 0.14, 0.026, s * 0.43, ysF - 0.31, zf + e, 0, 0, -s * 0.25); }
    body.box('chrome', 0.84, 0.016, 0.026, 0, ysF - 0.38, zf + e);
  } else {
    body.box('grille', 1.0, ysF - 0.12 - 0.42, 0.02, 0, (ysF - 0.12 + 0.42) / 2, zf + e);
    body.box('silver', 0.06, ysF - 0.12 - 0.42, 0.025, 0.52, (ysF - 0.12 + 0.42) / 2, zf + e); body.box('silver', 0.06, ysF - 0.12 - 0.42, 0.025, -0.52, (ysF - 0.12 + 0.42) / 2, zf + e);
  }
  // headlamps and DRLs
  for (const s of [1, -1]) {
    if (id === 'luhanh') {
      // slim vertical lamp at each corner of the face, an LED line over the grille joining them
      body.box('black', 0.13, 0.4, 0.025, s * (hwF - 0.1), ysF - 0.26, zf + e - 0.004);
      body.box('lowBeam', 0.05, 0.3, 0.03, s * (hwF - 0.12), ysF - 0.25, zf + e);
      body.box('drl', 0.018, 0.38, 0.032, s * (hwF - 0.055), ysF - 0.25, zf + e);
      if (s > 0) body.box('drl', hwF * 2 - 0.2, 0.016, 0.032, 0, ysF - 0.035, zf + e); // the line over the grille
      body.box('turn', 0.1, 0.03, 0.031, s * (hwF - 0.1), ysF - 0.47, zf + e);
      // fog lamp and dark side intake in the lower corners
      body.box('black', 0.16, 0.14, 0.025, s * (hwF - 0.13), ybF + 0.2, zf + e); body.box('lowBeam', 0.08, 0.025, 0.03, s * (hwF - 0.13), ybF + 0.22, zf + e);
    } else if (id === 'phonho') {
      // slim lamp unit at the upper corner: dark housing, LED line on top, a row of projectors
      body.box('black', 0.26, 0.11, 0.025, s * (hwF - 0.19), ysF - 0.11, zf + e - 0.004);
      body.box('drl', 0.26, 0.022, 0.03, s * (hwF - 0.19), ysF - 0.065, zf + e);
      body.box('drl', 0.022, 0.1, 0.03, s * (hwF - 0.065), ysF - 0.11, zf + e);
      for (const k of [0, 1, 2]) body.box('lowBeam', 0.05, 0.04, 0.03, s * (hwF - 0.27 + k * 0.07), ysF - 0.12, zf + e);
      body.box('turn', 0.18, 0.018, 0.031, s * (hwF - 0.2), ysF - 0.155, zf + e);
      // vertical fog / LED stacks in the bumper corners
      body.box('black', 0.1, 0.24, 0.03, s * (hwF - 0.14), ybF + 0.24, zf + e);
      for (const k of [0, 1, 2, 3]) body.box('lowBeam', 0.035, 0.035, 0.032, s * (hwF - 0.14), ybF + 0.15 + k * 0.055, zf + e);
    } else {
      body.box('drl', hwF * 2 - 0.4, 0.025, 0.03, 0, ysF - 0.03, zf + e);
      body.box('black', 0.14, 0.32, 0.025, s * (hwF - 0.13), ysF - 0.2, zf + e - 0.004); body.box('lowBeam', 0.07, 0.2, 0.03, s * (hwF - 0.13), ysF - 0.19, zf + e); // vertical clusters at the corners
      body.box('turn', 0.1, 0.05, 0.031, s * (hwF - 0.13), ysF - 0.38, zf + e);
    }
  }
  // lower front bumper: intake, silver skid plate, fog lamps, plate
  body.box('black', id === 'luhanh' ? 1.3 : 1.1, 0.12, 0.02, 0, ybF + 0.12, zf + e);
  body.box('silver', id === 'luhanh' ? 1.0 : id === 'phonho' ? 1.05 : 0.85, id === 'phonho' ? 0.07 : 0.05, 0.03, 0, ybF + 0.04, zf + e);
  if (lod === 0 && id !== 'phonho') for (const s of [1, -1]) body.box('lowBeam', 0.08, 0.04, 0.03, s * (hwF - 0.25), ybF + 0.12, zf + e + 0.002);
  body.box('plate', 0.52, 0.11, 0.01, 0, ybF + 0.25, zf + e + 0.008);
  body.box('emblem', 0.13, 0.13, 0.01, 0, ysF - 0.04, zf + e + 0.01);
  // rear
  const ysR = pr.ys, hwR = pr.hw, ybR = pr.yb; const zb = zr - e;
  const T = split ? tg : body; // lamps on the tailgate move with it
  if (spec.rearLamps === 'barAndCorners') {
    T.box('black', hwR * 2 - 0.16, 0.08, 0.025, 0, ysR - 0.06, zb + 0.004);
    T.box('tail', hwR * 2 - 0.18, 0.03, 0.03, 0, ysR - 0.06, zb); // full-width bar
    for (const s of [1, -1]) {
      body.box('black', 0.1, 0.46, 0.025, s * (hwR - 0.06), ysR - 0.24, zb + 0.004);
      body.box('tail', 0.035, 0.44, 0.03, s * (hwR - 0.035), ysR - 0.24, zb); body.box('brake', 0.05, 0.14, 0.031, s * (hwR - 0.075), ysR - 0.14, zb - 0.002);
      body.box('turn', 0.05, 0.07, 0.031, s * (hwR - 0.075), ysR - 0.3, zb - 0.002); body.box('reverse', 0.05, 0.07, 0.031, s * (hwR - 0.075), ysR - 0.39, zb - 0.002);
      body.box('tail', 0.12, 0.03, 0.031, s * (hwR - 0.15), ybR + 0.2, zb - 0.004); // bumper reflector
    }
  } else if (spec.rearLamps === 'joinedBar') {
    T.box('tail', hwR * 2 - 0.3, 0.035, 0.03, 0, ysR - 0.04, zb);
    T.box('black', hwR * 2 - 0.3, 0.05, 0.025, 0, ysR - 0.04, zb + 0.004);
    for (const s of [1, -1]) {
      body.box('black', 0.2, 0.26, 0.025, s * (hwR - 0.11), ysR - 0.13, zb + 0.004);
      body.box('tail', 0.04, 0.24, 0.03, s * (hwR - 0.04), ysR - 0.13, zb); body.box('tail', 0.18, 0.03, 0.03, s * (hwR - 0.11), ysR - 0.03, zb);
      body.box('brake', 0.13, 0.05, 0.031, s * (hwR - 0.12), ysR - 0.09, zb - 0.002); body.box('turn', 0.1, 0.035, 0.031, s * (hwR - 0.12), ysR - 0.16, zb - 0.002);
      body.box('reverse', 0.08, 0.04, 0.031, s * (hwR - 0.12), ysR - 0.21, zb - 0.002);
      body.box('tail', 0.035, 0.14, 0.031, s * (hwR - 0.08), ybR + 0.17, zb - 0.002); // bumper reflector
    }
  } else {
    // paired vertical lamps on each side, nothing joining them across the tailgate
    for (const s of [1, -1]) for (const dx of [0.05, 0.14]) { body.box('tail', 0.045, 0.34, 0.03, s * (hwR - dx), ysR - 0.14, zb); }
    for (const s of [1, -1]) { body.box('brake', 0.13, 0.08, 0.031, s * (hwR - 0.1), ysR - 0.06, zb - 0.002); body.box('turn', 0.13, 0.05, 0.031, s * (hwR - 0.1), ysR - 0.26, zb - 0.002); body.box('reverse', 0.1, 0.04, 0.031, s * 0.45, ybR + 0.18, zb - 0.002); }
  }
  T.box('plate', 0.52, 0.11, 0.01, 0, ysR - 0.32, zb - 0.004);
  T.box('emblem', 0.12, 0.12, 0.01, 0, ysR - 0.14, zb - 0.006);
  if (lod === 0) T.box('brake', 0.3, 0.02, 0.02, 0, spec.height * spec.glass.tailY + 0.02, zb + 0.03); // high-mount stop lamp
  body.box('black', hwR * 2 - 0.2, 0.14, 0.03, 0, ybR + 0.08, zb);
  body.box('silver', spec.id === 'luhanh' ? 1.3 : 0.9, spec.id === 'luhanh' ? 0.06 : 0.04, 0.035, 0, ybR + 0.03, zb - 0.002);
  if (spec.id === 'luhanh') for (let i = -3; i <= 3; i++) body.box('black', 0.02, 0.05, 0.036, i * 0.14, ybR + 0.03, zb - 0.004); // diffuser fins
  // underbody: dark tray so the car is never see-through from below
  body.box('black', spec.width - 0.3, 0.02, spec.length - 0.6, 0, spec.clearance + 0.01, 0);
}

// ---------------- side details: mirrors, handles, sills, gaps, fuel flap, roof rails, spoiler, wipers ----------------
function sideDetails(spec: CarSpec, lod: number, body: Batch, doorB: Partial<Record<DoorId, Batch>>, split: boolean, zF: [number, number], zR: [number, number], zWs0: number, zWs1: number, zRoof1: number) {
  const L = spec.length, H = spec.height;
  for (const s of [1, -1]) {
    // mirrors on the front doors (with an amber repeater)
    const pm = profAt(spec, zWs0 - 0.12); const mx = s * (pm.hw * 0.93 + 0.13), my = pm.ys + 0.1, mz = zWs0 - 0.16;
    const MB = split ? doorB[(s > 0 ? 'FL' : 'FR') as DoorId] : body;
    if (MB) {
      const shell = new THREE.SphereGeometry(1, lod === 0 ? 14 : 8, lod === 0 ? 8 : 5); MB.add('paint', shell, new THREE.Matrix4().compose(new THREE.Vector3(mx, my, mz), new THREE.Quaternion(), new THREE.Vector3(0.115, 0.07, 0.055)));
      MB.box('black', 0.1, 0.035, 0.07, mx - s * 0.09, my - 0.045, mz + 0.01); // stalk to the door
      MB.box('mirror', 0.19, 0.11, 0.004, mx, my, mz - 0.052);
      MB.box('turn', 0.12, 0.012, 0.02, mx + s * 0.02, my - 0.035, mz + 0.035, 0, s * 0.3, 0);
    }
    // door handles
    for (const [zr, id] of [[zF, 'F'], [zR, 'R']] as const) {
      const z = (zr[0] + zr[1]) / 2 - 0.15; const p = profAt(spec, z);
      const D = split ? doorB[(id + (s > 0 ? 'L' : 'R')) as DoorId] : body;
      D?.box(spec.id === 'luhanh' && id === 'R' ? 'silver' : 'black', 0.03, 0.035, 0.18, s * (p.hw * 0.975 + 0.012), p.ys - 0.09, z);
    }
    // door gap lines on the skin (front and rear edges of each door)
    if (lod === 0) for (const z of [zF[0], zF[1], zR[0], zR[1]]) { const p = profAt(spec, z); body.box('black', 0.004, p.ys - p.yb - 0.18, 0.006, s * (p.hw + 0.001), (p.ys + p.yb + 0.16) / 2, z); }
    // sill / cladding strip between the arches
    const r = tyreRadius(spec.tyre); const zs0 = spec.axleR + r + 0.08, zs1 = spec.axleF - r - 0.08; const pmid = profAt(spec, 0);
    body.box('black', 0.05, 0.09, zs1 - zs0, s * (pmid.hw * 0.97), pmid.yb + 0.08, (zs0 + zs1) / 2);
    if (spec.id === 'luhanh') body.box('silver', 0.012, 0.012, zR[1] - zR[0], s * (profAt(spec, zR[0]).hw * 0.99), profAt(spec, zR[0]).ys - 0.14, (zR[0] + zR[1]) / 2); // sliding-door rail
    // roof rails
    if (spec.roofRails) { const pr = profAt(spec, (spec.glass.ws1 * L + zRoof1) / 2); body.box(spec.id === 'luhanh' ? 'silver' : 'black', 0.04, 0.05, spec.glass.ws1 * L - zRoof1 - 0.1, s * pr.hw * 0.78, H + 0.04, (spec.glass.ws1 * L + zRoof1) / 2); }
  }
  // fuel flap (left rear quarter) and a shark-fin antenna
  { const z = spec.axleR + 0.55; const p = profAt(spec, z); body.box('paint', 0.006, 0.16, 0.16, p.hw * 0.995 + 0.002, p.ys - 0.18, z); body.box('black', 0.003, 0.17, 0.004, p.hw + 0.004, p.ys - 0.18, z + 0.08); }
  body.box('black', 0.06, 0.06, 0.18, 0, H + 0.03, zRoof1 + 0.25);
  if (spec.spoiler) body.box('paint', W2(spec) * 1.5, 0.03, 0.18, 0, H + 0.005, zRoof1 - 0.02);
  // hood crease lines
  if (lod === 0) { const z0 = zWs0 + 0.05, z1 = L / 2 - 0.25; const p = profAt(spec, (z0 + z1) / 2); for (const s of [1, -1]) body.box('paint', 0.02, 0.012, z1 - z0, s * p.hw * 0.45, p.ys + 0.022, (z0 + z1) / 2); body.box('black', p.hw * 1.7, 0.006, 0.006, 0, p.ys + 0.024, zWs0 + 0.04); }
  void zWs1;
}
const W2 = (spec: CarSpec) => (spec.width / 2) * 0.86 * 0.9;

// ---------------- wheels ----------------
/** A spoke: thin in x, `len` along y, tapering from wIn (hub) to wOut (rim), its outer end set back like a dished wheel. */
function spokeGeometry(len: number, wIn: number, wOut: number, depth: number) {
  const g = new THREE.BoxGeometry(depth, len, 1); const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / len + 0.5; p.setZ(i, p.getZ(i) * lerp(wIn, wOut, t)); p.setX(i, p.getX(i) - t * 0.02); }
  g.computeVertexNormals(); return g;
}
function wheelGeometry(spec: CarSpec, lod: number, mats: (k: MatKey) => THREE.Material) {
  const r = tyreRadius(spec.tyre), tw = spec.tyre[0] / 1000, rimR = (spec.tyre[2] * 0.0254) / 2 * 0.96;
  const seg = lod === 0 ? 24 : lod === 1 ? 14 : 8;
  const B = new Batch();
  const rot = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  // tyre: a lathed section (bead, bulging sidewall, rounded shoulder, flat tread) round the wheel axis
  const h = tw / 2; const prof = lod === 2 ? [[rimR, -h + 0.02], [r, -h + 0.03], [r, h - 0.03], [rimR, h - 0.02]] : [[rimR, -h + 0.015], [r - 0.06, -h], [r - 0.018, -h + 0.008], [r - 0.002, -h + 0.035], [r, -h + 0.06], [r, h - 0.06], [r - 0.002, h - 0.035], [r - 0.018, h - 0.008], [r - 0.06, h], [rimR + 0.005, h - 0.012]];
  const tyreG = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), seg); B.add('tyre', tyreG, rot);
  const inner = new THREE.CircleGeometry(rimR, seg); inner.rotateY(-Math.PI / 2); B.add('black', inner, new THREE.Matrix4().makeTranslation(-h + 0.03, 0, 0));
  // rim: a dished barrel and a dark face behind the spokes
  const barrel = new THREE.LatheGeometry([new THREE.Vector2(rimR, h - 0.012), new THREE.Vector2(rimR * 0.97, h - 0.04), new THREE.Vector2(rimR * 0.95, -h + 0.05)], seg); B.add('silver', barrel, rot);
  const face = new THREE.CircleGeometry(rimR * 0.95, seg); face.rotateY(Math.PI / 2); B.add(lod === 0 ? 'black' : 'silver', face, new THREE.Matrix4().makeTranslation(h - 0.07, 0, 0));
  if (lod <= 1) {
    const n = spec.rim === 'geometric10' ? 10 : spec.rim === 'double5' ? 10 : 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (spec.rim === 'double5' ? (i % 2 ? 0.12 : -0.12) : 0);
      const len = rimR * 0.86; const wid = spec.rim === 'sharp20' ? 0.022 : spec.rim === 'geometric10' ? 0.05 : 0.04;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(h - 0.03, Math.cos(a) * (len / 2 + 0.035), Math.sin(a) * (len / 2 + 0.035)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, 0)), new THREE.Vector3(1, 1, 1));
      B.add('silver', spokeGeometry(len, wid * 0.55, wid, 0.028), m);
      if (spec.rim === 'geometric10' && i % 2 === 0) { const m2 = new THREE.Matrix4().compose(new THREE.Vector3(tw / 2 - 0.018, Math.cos(a + 0.31) * rimR * 0.7, Math.sin(a + 0.31) * rimR * 0.7), new THREE.Quaternion().setFromEuler(new THREE.Euler(-a - 0.31 - Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)); B.add('silver', new THREE.BoxGeometry(0.018, rimR * 0.42, 0.03), m2); }
    }
    const lip = new THREE.RingGeometry(rimR * 0.93, rimR, seg); lip.rotateY(Math.PI / 2); B.add('silver', lip, new THREE.Matrix4().makeTranslation(tw / 2 - 0.01, 0, 0));
    const hub = new THREE.CylinderGeometry(0.06, 0.065, 0.035, 16); hub.rotateZ(Math.PI / 2); B.add('silver', hub, new THREE.Matrix4().makeTranslation(h - 0.02, 0, 0));
    const cap = new THREE.CylinderGeometry(0.032, 0.032, 0.012, 16); cap.rotateZ(Math.PI / 2); B.add('emblem', cap, new THREE.Matrix4().makeTranslation(h - 0.0, 0, 0));
    if (lod === 0) for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const nut = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6); nut.rotateZ(Math.PI / 2); B.add('chrome', nut, new THREE.Matrix4().makeTranslation(h - 0.005, Math.cos(a) * 0.045, Math.sin(a) * 0.045)); }
    if (lod === 0) { const disc = new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.025, 20); disc.rotateZ(Math.PI / 2); B.add('liner', disc, new THREE.Matrix4().makeTranslation(tw / 2 - 0.08, 0, 0)); }
  }
  return B.build(mats);
}

// ---------------- interior ----------------
/**
 * Seat rows (hip z): the bible's seat coordinates are marked temporary; these are placed from the windshield so the
 * driver sits about 1,1 m behind its base (dashboard and steering wheel in front, like the real cabins), rows 0,85–0,95 m
 * apart. Third rows sit over the rear axle, as in the real MPV / 7-seat SUV.
 */
export const cabinFloor = (spec: CarSpec) => spec.clearance + (spec.id === 'luhanh' ? 0.24 : 0.13);
export function seatRows(spec: CarSpec) {
  const z0 = spec.glass.ws0 * spec.length - 1.1; const gap = spec.id === 'luhanh' ? 0.95 : spec.id === 'phonho' ? 0.85 : 0.88;
  return spec.seats.map((_, i) => z0 - i * gap);
}
function buildInterior(spec: CarSpec, g: THREE.Group, parts: CarParts, mats: (k: MatKey) => THREE.Material, zWs0: number, zTail: number) {
  const B = new Batch(); const L = spec.length, H = spec.height;
  const pmid = profAt(spec, 0); const hwIn = pmid.hw - 0.09; const floorY = cabinFloor(spec); const belt = pmid.ys;
  // floor, mats, side trims below the belt, headliner
  B.box('carpet', hwIn * 2, 0.02, zWs0 - zTail - 0.2, 0, floorY, (zWs0 + zTail) / 2 - 0.05);
  for (const s of [1, -1]) for (let z = zTail + 0.05; z < zWs0 - 0.05; z += 0.2) {
    const z1 = Math.min(zWs0 - 0.05, z + 0.2); const pa = profAt(spec, z), pb = profAt(spec, z1);
    const xa = s * (pa.hw - 0.07), xb = s * (pb.hw - 0.07);
    const r0 = tyreRadius(spec.tyre); const overArch = (zz: number) => [spec.axleF, spec.axleR].some((a) => Math.abs(zz - a) < r0 + 0.12);
    const ya = overArch(z) ? r0 * 2 + 0.08 : floorY, yb2 = overArch(z1) ? r0 * 2 + 0.08 : floorY;
    const q = [[xa, ya, z], [xb, yb2, z1], [xb, pb.ys - 0.02, z1], [xa, pa.ys - 0.02, z]];
    if (s > 0) B.quad('leather', q[0], q[3], q[2], q[1]); else B.quad('leather', q[0], q[1], q[2], q[3]);
  }
  const hl = new THREE.PlaneGeometry(hwIn * 1.8, (spec.glass.ws1 * L - spec.glass.roof1 * L)); hl.rotateX(Math.PI / 2); B.add('headliner', hl, new THREE.Matrix4().makeTranslation(0, H - 0.04, (spec.glass.ws1 * L + spec.glass.roof1 * L) / 2));
  // dashboard: upper dark block, lower trim, glovebox, vents, dual screens, cluster hood
  const dz = zWs0 - 0.38; // dashboard block: its rear face 0,6 m behind the windshield base
  B.box('dash', hwIn * 2, 0.22, 0.45, 0, belt - 0.02, dz);
  B.box('leather', hwIn * 2, 0.08, 0.3, 0, belt - 0.17, dz - 0.08);
  B.box('dash', 0.35, 0.18, 0.04, -0.42, belt - 0.27, dz - 0.25);
  for (let i = 0; i < 6; i++) B.box('black', 0.14, 0.03, 0.01, -hwIn + 0.2 + i * (hwIn * 2 - 0.4) / 5, belt + 0.06, dz - 0.226);
  const screenW = spec.screens.startsWith('12') ? 0.62 : 0.52;
  // screen surface (its CanvasTexture is drawn by CarModel at 5–10 Hz)
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  parts.screen = { canvas, tex };
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenW / 4), new THREE.MeshBasicMaterial({ map: tex }));
  screenMesh.position.set(0.42 - screenW / 2 + 0.05, belt + 0.12, dz - 0.2); screenMesh.rotation.set(-0.15, Math.PI, 0); g.add(screenMesh);
  B.box('black', screenW + 0.02, screenW / 4 + 0.02, 0.02, 0.42 - screenW / 2 + 0.05, belt + 0.12, dz - 0.185, -0.15, 0, 0);
  // steering wheel (left-hand drive: driver on +X)
  const sw = new THREE.Group(); sw.position.set(0.4, belt + 0.02, dz - 0.5); sw.rotation.set(-0.35, 0, 0);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 24), mats('dash')); torus.rotation.y = 0; sw.add(torus);
  for (const a of [0, Math.PI * 0.85, Math.PI * 1.15]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.02), mats('dash')); sp.position.set(Math.sin(a) * 0.085, Math.cos(a) * -0.085, 0); sp.rotation.z = -a; sw.add(sp); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), mats('dash')); hub.rotation.x = Math.PI / 2; sw.add(hub);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 8), mats('dash')); col.rotation.x = Math.PI / 2; col.position.z = 0.16; sw.add(col);
  g.add(sw); parts.steeringWheel = sw;
  // pedals
  for (const x of [0.32, 0.45]) B.box('silver', 0.06, 0.1, 0.02, x, floorY + 0.12, dz - 0.18, 0.5, 0, 0);
  // centre console with gear selector, cupholders, wireless pad, armrest
  const cz0 = dz - 0.25, cz1 = seatRows(spec)[0] - 0.35;
  B.box('dash', 0.26, 0.32, cz0 - cz1, 0, floorY + 0.16, (cz0 + cz1) / 2);
  B.box('black', 0.14, 0.01, 0.12, 0, floorY + 0.33, cz0 - 0.12); // wireless pad
  for (const dx of [-0.05, 0.05]) B.box('black', 0.07, 0.012, 0.07, dx, floorY + 0.33, cz0 - 0.3);
  if (spec.shifter === 'rotary') B.add('chrome', new THREE.CylinderGeometry(0.035, 0.04, 0.04, 16), new THREE.Matrix4().makeTranslation(0, floorY + 0.35, cz0 - 0.45));
  else { B.box('chrome', 0.1, 0.012, 0.16, 0, floorY + 0.325, cz0 - 0.45); B.box('black', 0.025, 0.12, 0.025, 0, floorY + 0.39, cz0 - 0.45, -0.15, 0, 0); B.box('black', 0.05, 0.07, 0.07, 0, floorY + 0.46, cz0 - 0.46); }
  B.box('leather', 0.24, 0.06, 0.3, 0, floorY + 0.36, cz1 + 0.18);
  // sun visors and the mirror
  for (const s of [1, -1]) B.box('headliner', 0.32, 0.015, 0.16, s * 0.35, H - 0.08, zWs0 - 0.7);
  B.box('black', 0.2, 0.06, 0.02, 0, H - 0.14, zWs0 - 0.62);
  // seats: rows from the bible's seat z (approximate), widths from the cabin
  const rowsZ = seatRows(spec);
  spec.seats.forEach((n, row) => {
    const z = rowsZ[row]; const vip = spec.id === 'luhanh' && row === 1; const front = row === 0;
    const usable = hwIn * 2 - (front ? 0.3 : vip ? 0.35 : 0.08); const w = usable / n;
    const fold = new THREE.Group(); fold.position.set(0, floorY + 0.45, z - 0.25); g.add(fold);
    const foldable = row === spec.seats.length - 1 && row > 0;
    for (let k = 0; k < n; k++) {
      let x = -usable / 2 + w * (k + 0.5); if (front) x = (k === 0 ? 1 : -1) * (0.15 + w / 2); if (vip) x = (k === 0 ? 1 : -1) * (0.175 + w / 2);
      const sw2 = w - 0.04;
      B.box('leather', sw2, 0.12, 0.5, x, floorY + 0.38, z); // cushion
      B.box('leather', sw2 * 0.95, 0.1, 0.06, x, floorY + 0.29, z + 0.23, -0.3, 0, 0); // front bolster
      const back = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.32, 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, 0)), new THREE.Vector3(1, 1, 1));
      const head = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.72, -0.03), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      if (foldable) { const bb = new THREE.Mesh(new THREE.BoxGeometry(sw2, 0.6, 0.1), mats('leather')); bb.applyMatrix4(back); fold.add(bb); const hh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), mats('leather')); hh.applyMatrix4(head); fold.add(hh); }
      else { B.add('leather', new THREE.BoxGeometry(sw2, 0.6, 0.1), new THREE.Matrix4().makeTranslation(0, floorY + 0.45, z - 0.25).multiply(back)); B.add('leather', new THREE.BoxGeometry(0.22, 0.14, 0.08), new THREE.Matrix4().makeTranslation(0, floorY + 0.45, z - 0.25).multiply(head)); }
      // belt and red buckle
      B.box('black', 0.04, 0.55, 0.005, x + w * 0.35, floorY + 0.7, z - 0.2, -0.2, 0, 0.4);
      B.box('red', 0.03, 0.04, 0.05, x - sw2 / 2 - 0.01, floorY + 0.46, z - 0.1);
      if (vip) { B.box('leather', sw2 * 0.8, 0.05, 0.3, x, floorY + 0.28, z + 0.38, -0.9, 0, 0); for (const ds of [-1, 1]) B.box('leather', 0.06, 0.08, 0.36, x + ds * (sw2 / 2 + 0.02), floorY + 0.55, z - 0.03); } // leg rest, armrests
      parts.seats.push({ id: `R${row + 1}S${k + 1}`, row, hip: new THREE.Vector3(x, floorY + 0.45, z - 0.05) });
    }
    if (foldable) parts.seatFold.push(fold);
  });
  // cargo floor and a couple of bags
  const zc = rowsZ[rowsZ.length - 1] - 0.55; const pt = profAt(spec, zTail);
  B.box('carpet', hwIn * 1.9, 0.03, zc - zTail - 0.1, 0, pt.yb + 0.45, (zc + zTail) / 2);
  B.box('black', 0.4, 0.3, 0.25, 0.3, pt.yb + 0.62, zTail + 0.25); B.box('red', 0.32, 0.22, 0.2, -0.25, pt.yb + 0.58, zTail + 0.28);
  const built = B.build(mats); built.meshes.forEach((m) => { m.castShadow = false; g.add(m); });
}

// ---------------- LOD3: silhouette only ----------------
function buildLod3(spec: CarSpec, parts: CarParts, mats: (k: MatKey) => THREE.Material) {
  const B = new Batch(); const p = profAt(spec, 0); const L = spec.length;
  B.box('paint', p.hw * 2, p.ys - spec.clearance - 0.1, L - 0.1, 0, (p.ys + spec.clearance + 0.1) / 2, 0);
  const z0 = spec.glass.ws0 * L, z1 = spec.glass.tail * L;
  B.box('glassDark', p.hw * 1.75, spec.height - p.ys, z0 - z1 - 0.3, 0, (spec.height + p.ys) / 2, (z0 + z1) / 2 - 0.1);
  const r = tyreRadius(spec.tyre);
  for (const z of [spec.axleF, spec.axleR]) for (const s of [1, -1]) B.add('tyre', new THREE.CylinderGeometry(r, r, 0.22, 8).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(s * spec.track / 2, r, z));
  for (const s of [1, -1]) { B.box('lowBeam', 0.2, 0.08, 0.02, s * (p.hw - 0.2), p.ys - 0.15, L / 2); B.box('tail', 0.2, 0.08, 0.02, s * (p.hw - 0.2), p.ys - 0.15, -L / 2); }
  const b = B.build(mats); const visual = new THREE.Group(); visual.name = 'VisualRoot'; b.meshes.forEach((m) => visual.add(m)); parts.root.add(visual); parts.tris = b.tris;
  return parts;
}
