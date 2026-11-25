import map from '../data/hoanKiem.json';

/** World units are metres. +X east, -Z north, origin at map.center (OSM). */
export type Point = [number, number];

const latitude = map.center.lat * Math.PI / 180;
const METERS_PER_LON = 111_320 * Math.cos(latitude);
const METERS_PER_LAT = 111_320;

export function project([lon, lat]: number[]): Point {
  return [(lon - map.center.lon) * METERS_PER_LON, -(lat - map.center.lat) * METERS_PER_LAT];
}

function openRing(points: Point[]) {
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
}

/** Chaikin smoothing on a closed ring (no repeated end point). */
export function smoothRing(points: Point[], passes = 2): Point[] {
  let ring = openRing(points);
  for (let pass = 0; pass < passes; pass++) {
    const next: Point[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    ring = next;
  }
  return ring;
}

function signedArea(ring: Point[]) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function offsetOnce(ring: Point[], meters: number, orientation: number): Point[] {
  return ring.map((point, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const next = ring[(i + 1) % ring.length];
    const tx = next[0] - prev[0];
    const tz = next[1] - prev[1];
    const length = Math.hypot(tx, tz) || 1;
    return [point[0] + (tz / length) * orientation * meters, point[1] + (-tx / length) * orientation * meters];
  });
}

function laplace(ring: Point[], w: number): Point[] {
  return ring.map((p, i) => {
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[(i + 1) % ring.length];
    return [p[0] + w * ((a[0] + b[0]) / 2 - p[0]), p[1] + w * ((a[1] + b[1]) / 2 - p[1])];
  });
}
/** Taubin smoothing step: removes folds without shrinking the ring. */
export function relaxRing(ring: Point[]) { return relax(ring); }
function relax(ring: Point[]): Point[] {
  return laplace(laplace(ring, 0.5), -0.53);
}

/**
 * Offsets a closed ring outward (positive) or inward (negative). Works in ~1 m steps with a
 * light relaxation after each, so concave bends round off instead of folding over themselves.
 * The vertex count is preserved, so rings at different offsets can be stitched into bands.
 */
export function offsetRing(ring: Point[], meters: number): Point[] {
  const orientation = signedArea(ring) > 0 ? 1 : -1;
  const steps = Math.max(1, Math.ceil(Math.abs(meters)));
  let out = ring;
  for (let i = 0; i < steps; i++) {
    out = offsetOnce(out, meters / steps, orientation);
    if (Math.abs(meters) > 1.5) out = relax(out);
  }
  return out;
}

export function ringLength(ring: Point[]) {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Evenly spaced samples along a closed ring with their tangent direction. */
export function sampleRing(ring: Point[], spacing: number) {
  const samples: { point: Point; angle: number }[] = [];
  let carry = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    let t = carry;
    while (t < length) {
      samples.push({ point: [a[0] + (b[0] - a[0]) * (t / length), a[1] + (b[1] - a[1]) * (t / length)], angle });
      t += spacing;
    }
    carry = t - length;
  }
  return samples;
}

export function centerOf(points: Point[]): Point {
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
}

export function insidePolygon([x, z]: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (((zi > z) !== (zj > z)) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dz);
}

// ---- Hồ Hoàn Kiếm layout -------------------------------------------------
export const shore = smoothRing(map.lake.coordinates[0].map(project), 2);
const islandRings = map.lake.coordinates.slice(1).map((ring) => smoothRing(ring.map(project), 2));
export const templeIsland = islandRings[0];
export const turtleIsland = islandRings[1];
export const templeCenter = centerOf(templeIsland);
export const turtleCenter = centerOf(turtleIsland);
export const bridgeEnds = map.landmarks['Cầu Thê Húc'][0].geojson.coordinates.map(project) as Point[];

/** Rings that define the lakeside layout, measured outward from the waterline. */
export const PROMENADE_WIDTH = 9;
export const ROAD_INNER = 12;
export const ROAD_OUTER = 24;
export const BUILDING_LINE = 30;
/**
 * Street rings are iso-distance contours around the shoreline (marching squares on a
 * distance field), so inlets round off naturally and the rings never fold over.
 */
const contourCache = new Map<number, Point[]>();
function distanceToRing(p: Point, ring: Point[]) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = distanceToSegment(p, ring[i], ring[(i + 1) % ring.length]);
    if (d < best) best = d;
  }
  return best;
}
const coarseShore = shore.filter((_, i) => i % 2 === 0);
let field: { x0: number; z0: number; cell: number; nx: number; nz: number; values: Float32Array } | null = null;
function distanceField() {
  if (field) return field;
  const cell = 3;
  const x0 = -330; const z0 = -500;
  const nx = Math.ceil(660 / cell) + 1; const nz = Math.ceil(1000 / cell) + 1;
  const values = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const p: Point = [x0 + i * cell, z0 + j * cell];
    const d = distanceToRing(p, coarseShore);
    values[j * nx + i] = insidePolygon(p, coarseShore) ? -d : d;
  }
  return (field = { x0, z0, cell, nx, nz, values });
}
/** Signed distance to the lake shore (negative on the water), from the cached 3 m field. */
export function distanceToShore([x, z]: Point): number {
  const { x0, z0, cell, nx, nz, values } = distanceField();
  const fx = (x - x0) / cell; const fz = (z - z0) / cell;
  if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return 200;
  const i = Math.floor(fx); const j = Math.floor(fz); const tx = fx - i; const tz = fz - j;
  const v = (a: number, b: number) => values[b * nx + a];
  return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - tz) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * tz;
}
export function streetRing(meters: number): Point[] {
  const key = Math.round(meters * 100);
  if (contourCache.has(key)) return contourCache.get(key)!;
  const { x0, z0, cell, nx, nz, values } = distanceField();
  const v = (i: number, j: number) => values[j * nx + i] - meters;
  const edgePoint = (i0: number, j0: number, i1: number, j1: number): Point => {
    const a = v(i0, j0); const b = v(i1, j1); const t = a / (a - b);
    return [x0 + (i0 + (i1 - i0) * t) * cell, z0 + (j0 + (j1 - j0) * t) * cell];
  };
  const segments: [Point, Point][] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = (v(i, j) > 0 ? 1 : 0) | (v(i + 1, j) > 0 ? 2 : 0) | (v(i + 1, j + 1) > 0 ? 4 : 0) | (v(i, j + 1) > 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const e = [edgePoint(i, j, i + 1, j), edgePoint(i + 1, j, i + 1, j + 1), edgePoint(i, j + 1, i + 1, j + 1), edgePoint(i, j, i, j + 1)];
    const table: Record<number, [number, number][]> = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
      8: [[2, 3]], 9: [[2, 0]], 10: [[0, 1], [2, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
    };
    for (const [a, b] of table[c]) segments.push([e[a], e[b]]);
  }
  // Chain segments into loops by matching endpoints.
  const keyOf = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const byStart = new Map<string, number[]>();
  segments.forEach((sgm, i) => { const k = keyOf(sgm[0]); byStart.set(k, [...(byStart.get(k) ?? []), i]); });
  const used = new Uint8Array(segments.length);
  let best: Point[] = [];
  for (let s0 = 0; s0 < segments.length; s0++) {
    if (used[s0]) continue;
    const loop: Point[] = [];
    let cur = s0;
    while (cur >= 0 && !used[cur]) {
      used[cur] = 1;
      loop.push(segments[cur][0]);
      const next = (byStart.get(keyOf(segments[cur][1])) ?? []).find((n) => !used[n]);
      cur = next ?? -1;
    }
    if (loop.length > best.length) best = loop;
  }
  // Light smoothing and even resampling.
  let ring = best;
  for (let k = 0; k < 3; k++) ring = laplace(ring, 0.5);
  contourCache.set(key, ring);
  return ring;
}
export const promenadeEdge = streetRing(PROMENADE_WIDTH);
export const roadInner = streetRing(ROAD_INNER);
export const roadOuter = streetRing(ROAD_OUTER);
export const buildingLine = streetRing(BUILDING_LINE);

export const BRIDGE_DECK_BASE = 0.56;
export const BRIDGE_ARCH = 1.45;
export const ISLAND_HEIGHT = 0.55;
export const GROUND_HEIGHT = 0.32;

export function bridgeT(point: Point) {
  const [a, b] = bridgeEnds;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  return Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)));
}

// ---- Collision ----------------------------------------------------------
/** Oriented rectangle footprint: centre, half sizes along its local axes, rotation about Y. */
export type Obstacle = { x: number; z: number; hx: number; hz: number; angle: number };
const obstacles: Obstacle[] = [];
/** Buildings register their footprints so the player can't walk through them. */
export function registerObstacles(list: Obstacle[]) {
  obstacles.push(...list);
  return () => { for (const o of list) { const i = obstacles.indexOf(o); if (i >= 0) obstacles.splice(i, 1); } };
}
/** Extra walk blockers (e.g. OSM building footprints) registered by world components. */
const blockers: ((p: Point) => boolean)[] = [];
export function registerBlocker(test: (p: Point) => boolean) {
  blockers.push(test);
  return () => { const i = blockers.indexOf(test); if (i >= 0) blockers.splice(i, 1); };
}
function hitsObstacle([px, pz]: Point) {
  for (const test of blockers) if (test([px, pz])) return true;
  for (const o of obstacles) {
    const dx = px - o.x;
    const dz = pz - o.z;
    const c = Math.cos(o.angle);
    const s = Math.sin(o.angle);
    // inverse of a three.js Y rotation (x' = x cos + z sin, z' = -x sin + z cos)
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < o.hx && Math.abs(lz) < o.hz) return true;
  }
  return false;
}

/** Walkable extent: the OSM street map covers roughly ±820 m around the lake. */
/** True when a camera position would be inside a building, wall or other blocker. */
export function cameraBlocked(p: Point) { return hitsObstacle(p); }

export const WORLD_LIMIT = { x: 1300, z: 1300 }; // the lake district: about ±1.3 km around the lake
/** The corridor west along Tràng Thi, Nguyễn Thái Học, Kim Mã and Liễu Giai to Lotte Center Hà Nội. */
export const CORRIDOR = { x0: -4500, x1: -1200, z0: -740, z1: 360 };
/** Ba Đình (Quảng trường Ba Đình, Lăng Chủ tịch Hồ Chí Minh, Chùa Một Cột, Hoàng thành) north of the corridor. */
export const BA_DINH = { x0: -2340, x1: -1200, z0: -1300, z1: -130 };
/** Công viên Thủ Lệ, west of Lotte. */
export const THU_LE = { x0: -5250, x1: -4480, z0: -690, z1: 200 };
const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
/** Inside the mapped area (the district, the corridor to Lotte, Ba Đình or Thủ Lệ). */
export function inWorld([x, z]: Point) {
  return (Math.abs(x) <= WORLD_LIMIT.x && Math.abs(z) <= WORLD_LIMIT.z) || inRect(x, z, CORRIDOR) || inRect(x, z, BA_DINH) || inRect(x, z, THU_LE);
}

const templeWalk = offsetRing(templeIsland, -0.6);
const bridgeShore = offsetRing(shore, 1.5);

export function canWalk(point: Point): boolean {
  if (!inWorld(point)) return false;
  if (hitsObstacle(point)) return false;
  if (!insidePolygon(point, shore)) return true;
  if (insidePolygon(point, templeWalk)) return true;
  return distanceToSegment(point, bridgeEnds[0], bridgeEnds[1]) < 1.05;
}

/** Raised floors (temple platforms, steps) registered by world components; the highest wins. */
const heightProviders: ((p: Point) => number | null)[] = [];
export function registerHeight(provider: (p: Point) => number | null) {
  heightProviders.push(provider);
  return () => { const i = heightProviders.indexOf(provider); if (i >= 0) heightProviders.splice(i, 1); };
}
export function groundHeight(point: Point): number {
  let raised: number | null = null;
  for (const provider of heightProviders) { const h = provider(point); if (h !== null && (raised === null || h > raised)) raised = h; }
  if (raised !== null) return raised;
  if (distanceToSegment(point, bridgeEnds[0], bridgeEnds[1]) < 1.6 && insidePolygon(point, bridgeShore)) {
    const t = bridgeT(point);
    return BRIDGE_DECK_BASE + Math.sin(Math.PI * t) * BRIDGE_ARCH;
  }
  if (insidePolygon(point, templeIsland)) return ISLAND_HEIGHT;
  return GROUND_HEIGHT;
}

export const mapAttribution = map.source;

// Dev hook for test scripts.
if (import.meta.env.DEV) (window as unknown as { __geo?: unknown }).__geo = { canWalk, groundHeight, streetRing };
