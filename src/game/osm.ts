import osm from '../data/hoanKiemOsm.json';
import { bridgeEnds, distanceToSegment, distanceToShore, insidePolygon, shore, type Point } from './geo';

/**
 * Streets, building footprints and parks around Hồ Hoàn Kiếm from OpenStreetMap
 * (scripts/geo/fetch-osm-hoan-kiem.mjs). Coordinates are already local metres
 * (+X east, +Z south, origin at the lake centre used by geo.ts).
 */
type RawRoad = { n: string; h: string; l?: number; o?: number; w?: number; p: number[][] };
type RawBuilding = { p: number[][]; lv?: number; h?: number; n?: string; k?: string };
type RawPark = { p: number[][]; n?: string };

export type Road = { name: string; kind: string; width: number; oneway: boolean; lanes: number; points: Point[] };
export type Building = { ring: Point[]; floors: number; height: number; name?: string; kind?: string; area: number; center: Point; seed: number };
export type Park = { ring: Point[]; name?: string };

const vehicleKinds = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian', 'trunk']);
const baseWidth: Record<string, number> = {
  trunk: 16, primary: 14, primary_link: 7, secondary: 11, secondary_link: 7, tertiary: 9, tertiary_link: 6,
  residential: 6.5, unclassified: 6, living_street: 4.5, pedestrian: 6, service: 3.6,
};

function roadWidth(r: RawRoad) {
  if (r.w && r.w > 2 && r.w < 30) return r.w;
  const base = baseWidth[r.h] ?? 5;
  if (r.l && r.h !== 'service') return Math.max(base * 0.8, Math.min(18, r.l * 3.2 + 1.5));
  return base;
}

const centroid = (ring: Point[]): Point => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
function polygonArea(ring: Point[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i]; const q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a / 2);
}
function hash(x: number, z: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Vehicle roads (footways are left out: in OSM they are mostly separately mapped sidewalks). */
export const roads: Road[] = (osm.roads as RawRoad[])
  .filter((r) => vehicleKinds.has(r.h))
  .map((r) => ({ name: r.n, kind: r.h, width: roadWidth(r), oneway: !!r.o, lanes: r.l ?? (r.h === 'service' ? 1 : 2), points: r.p as Point[] }))
  // Drop anything mapped over the water (e.g. the bridge or lake paths).
  .filter((r) => { const mid = r.points[Math.floor(r.points.length / 2)]; return !insidePolygon(mid, shore); });

// ---- Road spatial index ---------------------------------------------------
const CELL = 16;
type Seg = { a: Point; b: Point; half: number; road: Road };
const segGrid = new Map<string, Seg[]>();
const cellKey = (i: number, j: number) => `${i},${j}`;
for (const road of roads) {
  for (let i = 0; i < road.points.length - 1; i++) {
    const a = road.points[i]; const b = road.points[i + 1];
    const seg: Seg = { a, b, half: road.width / 2, road };
    const pad = seg.half + 2;
    const i0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL); const i1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL);
    const j0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL); const j1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
    for (let x = i0; x <= i1; x++) for (let z = j0; z <= j1; z++) {
      const k = cellKey(x, z);
      const list = segGrid.get(k);
      if (list) list.push(seg); else segGrid.set(k, [seg]);
    }
  }
}

/** Distance from a point to the nearest road edge (negative = on the carriageway). */
export function roadClearance(p: Point, ignore?: Road) {
  const list = segGrid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)));
  if (!list) return Infinity;
  let best = Infinity;
  for (const s of list) {
    if (s.road === ignore) continue;
    const d = distanceToSegment(p, s.a, s.b) - s.half;
    if (d < best) best = d;
  }
  return best;
}

// Raw footprint lookup, used to site the restaurant before the final building list exists.
const rawRings = (osm.buildings as RawBuilding[]).map((b) => b.p as Point[]);
const rawGrid = new Map<string, number[]>();
rawRings.forEach((ring, index) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    const k = cellKey(i, j); const list = rawGrid.get(k);
    if (list) list.push(index); else rawGrid.set(k, [index]);
  }
});
const rawBig = rawRings.map((ring) => polygonArea(ring) > 260);
/** A large footprint (a public building, not a shophouse) at this point: the restaurant must not replace it. */
function bigBuildingAt(p: Point) {
  return (rawGrid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL))) ?? []).some((i) => rawBig[i] && insidePolygon(p, rawRings[i]));
}
function rawBuildingAt(p: Point) {
  return (rawGrid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL))) ?? []).some((i) => insidePolygon(p, rawRings[i]));
}

// ---- Bún chả Đức Anh: a shophouse on Phố Đinh Tiên Hoàng facing the Thê Húc bridge ----
const away = (() => {
  const dx = bridgeEnds[0][0] - bridgeEnds[1][0]; const dz = bridgeEnds[0][1] - bridgeEnds[1][1];
  const l = Math.hypot(dx, dz); return [dx / l, dz / l] as Point;
})();
export const RESTAURANT = (() => {
  // Search the lake-facing side of Phố Đinh Tiên Hoàng for the plot nearest the bridge where a
  // 9 × 15 m shophouse fits behind a 3 m pavement without touching any carriageway.
  const width = 9;
  const depth = 15;
  const start = bridgeEnds[0];
  let best: { front: Point; normal: Point; score: number } | null = null;
  for (const road of roads) {
    if (road.name !== 'Phố Đinh Tiên Hoàng') continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]; const b = road.points[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (let t = 6; t < len - 6; t += 2) {
        const p: Point = [a[0] + d[0] * t, a[1] + d[1] * t];
        for (const side of [1, -1]) {
          const n: Point = [-d[1] * side, d[0] * side]; // points away from the street
          const off = road.width / 2 + 3.2;
          const front: Point = [p[0] + n[0] * off, p[1] + n[1] * off];
          // must be across the street from the lake, i.e. the plot runs away from the water
          if (distanceToShore(front) < 25 || distanceToShore([front[0] + n[0] * 20, front[1] + n[1] * 20]) < distanceToShore(p) + 15) continue;
          let ok = true;
          for (let u = -1; u <= 1 && ok; u += 0.25) for (let v = 0; v <= 1 && ok; v += 0.25) {
            const q: Point = [front[0] + d[0] * u * (width / 2 + 8.5) + n[0] * v * depth, front[1] + d[1] * u * (width / 2 + 8.5) + n[1] * v * depth];
            if (roadClearance(q) < (v === 0 ? 1.5 : 0.8) || bigBuildingAt(q)) ok = false;
          }
          if (!ok) continue;
          // Prefer a gap inside an existing row of houses so the shop reads as part of the street.
          const neighbours = [1, -1].filter((s) => rawBuildingAt([front[0] + d[0] * s * (width / 2 + 3) + n[0] * 6, front[1] + d[1] * s * (width / 2 + 3) + n[1] * 6])).length;
          const score = Math.hypot(front[0] - start[0], front[1] - start[1]) - neighbours * 60;
          if (!best || score < best.score) best = { front, normal: n, score };
        }
      }
    }
  }
  const fallbackFront: Point = [start[0] + away[0] * 60, start[1] + away[1] * 60];
  const front = best?.front ?? fallbackFront;
  const n = best?.normal ?? away;
  const center: Point = [front[0] + n[0] * depth / 2, front[1] + n[1] * depth / 2];
  // Local frame: +z points out of the shopfront toward the street, +x along the street.
  const angle = Math.atan2(-n[0], -n[1]);
  return { front, center, angle, width, depth };
})();

/** Restaurant-local (x along the street, z out of the shopfront) → world. */
export function restaurantToWorld(x: number, z: number): Point {
  const c = Math.cos(RESTAURANT.angle); const s = Math.sin(RESTAURANT.angle);
  return [RESTAURANT.center[0] + x * c + z * s, RESTAURANT.center[1] - x * s + z * c];
}
export function worldToRestaurant([wx, wz]: Point): Point {
  const dx = wx - RESTAURANT.center[0]; const dz = wz - RESTAURANT.center[1];
  const c = Math.cos(RESTAURANT.angle); const s = Math.sin(RESTAURANT.angle);
  return [dx * c - dz * s, dx * s + dz * c];
}
const restaurantRect = (() => {
  const hw = RESTAURANT.width / 2 + 9; const hd = RESTAURANT.depth / 2 + 4; // shop plus two neighbours each side
  return [restaurantToWorld(-hw, -hd), restaurantToWorld(hw, -hd), restaurantToWorld(hw, hd), restaurantToWorld(-hw, hd)];
})();

// ---- Buildings --------------------------------------------------------------
const FLOOR = 3.4;
function overlapsRect(ring: Point[], rect: Point[]) {
  return ring.some((p) => insidePolygon(p, rect)) || rect.some((p) => insidePolygon(p, ring)) || insidePolygon(centroid(ring), rect);
}
export const buildings: Building[] = (osm.buildings as RawBuilding[]).flatMap((b) => {
  const ring = b.p as Point[];
  const center = centroid(ring);
  // Landmarks on the lake are modelled by hand.
  if (insidePolygon(center, shore)) return [];
  if (overlapsRect(ring, restaurantRect)) return [];
  const area = polygonArea(ring);
  if (area < 6) return [];
  const seed = hash(center[0], center[1]);
  let floors = b.lv ?? (area < 45 ? 2 + Math.floor(seed * 2) : area < 160 ? 3 + Math.floor(seed * 2) : area < 700 ? 4 + Math.floor(seed * 3) : 5 + Math.floor(seed * 4));
  if (b.k === 'roof' || b.k === 'kiosk') floors = 1;
  if (b.k === 'church' || b.k === 'cathedral') floors = Math.max(floors, 5);
  floors = Math.max(1, Math.min(30, Math.round(floors)));
  const height = b.h && b.h > 2 ? b.h : floors * FLOOR + (floors > 1 ? 0.4 : 0);
  return [{ ring, floors, height, name: b.n, kind: b.k, area, center, seed }];
});

const buildingGrid = new Map<string, number[]>();
buildings.forEach((b, index) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of b.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    const k = cellKey(i, j);
    const list = buildingGrid.get(k);
    if (list) list.push(index); else buildingGrid.set(k, [index]);
  }
});

/** True when a point is inside an OSM building footprint (with a small skin so the camera stays outside walls). */
export function insideBuilding(p: Point, skin = 0.25) {
  const list = buildingGrid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)));
  if (!list) return false;
  for (const i of list) {
    const ring = buildings[i].ring;
    if (insidePolygon(p, ring)) return true;
    if (skin > 0) for (let k = 0; k < ring.length; k++) if (distanceToSegment(p, ring[k], ring[(k + 1) % ring.length]) < skin) return true;
  }
  return false;
}

export const parks: Park[] = (osm.parks as RawPark[])
  .map((p) => ({ ring: p.p as Point[], name: p.n }))
  .filter((p) => !insidePolygon(centroid(p.ring), shore) && polygonArea(p.ring) > 80 && polygonArea(p.ring) < 40_000);

export const osmAttribution = osm.source;

// Dev hook for screenshot scripts.
if (import.meta.env.DEV) (window as unknown as { __restaurant?: unknown }).__restaurant = { ...RESTAURANT, toWorld: restaurantToWorld };
