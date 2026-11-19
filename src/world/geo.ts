import map from '../data/hoanKiem.json';

export type Point = [number, number];
const latitude = map.center.lat * Math.PI / 180;
const METERS_PER_LON = 111_320 * Math.cos(latitude);
const METERS_PER_LAT = 111_320;

export function project([lon, lat]: number[]): Point {
  return [(lon - map.center.lon) * METERS_PER_LON, -(lat - map.center.lat) * METERS_PER_LAT];
}

function softenClosedRing(points: Point[]): Point[] {
  const ring = points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
    ? points.slice(0, -1) : points;
  const smooth: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    smooth.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    smooth.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  smooth.push([...smooth[0]] as Point);
  return smooth;
}

export const shore = softenClosedRing(map.lake.coordinates[0].map(project));
export const islands = map.lake.coordinates.slice(1).map((ring) => ring.map(project));
export const turtleIsland = islands[1];
export const templeIsland = islands[0];
export const bridgeEnds = map.landmarks['Cầu Thê Húc'][0].geojson.coordinates.map(project) as Point[];

export function centerOf(points: Point[]): Point {
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

export const turtleCenter = centerOf(turtleIsland);
export const templeCenter = centerOf(templeIsland);

const [shoreEnd, islandEnd] = bridgeEnds;
const spanX = islandEnd[0] - shoreEnd[0];
const spanZ = islandEnd[1] - shoreEnd[1];
const spanLength = Math.hypot(spanX, spanZ);
export const bridgeDirection: Point = [spanX / spanLength, spanZ / spanLength];

// The Blender gate faces local +X. Its surveyed clear opening is centred
// on Z=7.60; the city-facing jamb face is at X=12.93 (one unit = one metre).
export const templeYaw = Math.atan2(templeCenter[1] - islandEnd[1], islandEnd[0] - templeCenter[0]);
const tc = Math.cos(templeYaw);
const ts = Math.sin(templeYaw);
const gateFront: Point = [islandEnd[0] + bridgeDirection[0] * 1.55, islandEnd[1] + bridgeDirection[1] * 1.55];
export const templePlacement: [number, number, number] = [
  gateFront[0] - tc * 12.93 - ts * 7.6, -1.55,
  gateFront[1] + ts * 12.93 - tc * 7.6,
];

export function offsetPolygon(points: Point[], meters: number): Point[] {
  const center = centerOf(points);
  return points.map(([x, z]) => {
    const dx = x - center[0];
    const dz = z - center[1];
    const radius = Math.hypot(dx, dz) || 1;
    return [x + dx / radius * meters, z + dz / radius * meters];
  });
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

function insideHeritageBuilding([x, z]: Point): boolean {
  const dx = x - templePlacement[0];
  const dz = z - templePlacement[2];
  const localX = dx * tc - dz * ts;
  const localZ = dx * ts + dz * tc;
  // Leave 0.52 m on either side of the axis for the avatar centre, with
  // shoulder clearance inside the ~1.7 m clear opening through the jambs.
  if (localX > 9.54 && localX < 13.23 && localZ > 3.1 && localZ < 12.1) {
    return Math.abs(localZ - 7.6) > 0.52;
  }
  // Rectangular collision for the halls in the coordinate frame of the GLB.
  const mainHall = localX > -16 && localX < -4.4 && localZ > -4.9 && localZ < 8.1;
  const rearHall = localX > -9.2 && localX < -3.5 && localZ > -11.1 && localZ < -8.1;
  return mainHall || rearHall;
}

export function canWalk(point: Point, heritageTempleLoaded = false): boolean {
  if (Math.abs(point[0]) > 205 || Math.abs(point[1]) > 390) return false;
  if (!insidePolygon(point, shore)) return true;
  if (insidePolygon(point, templeIsland)) {
    if (heritageTempleLoaded) return !insideHeritageBuilding(point);
    const [cx, cz] = templeCenter;
    const inMainHall = Math.abs(point[0] - (cx - 10)) < 6.5 && Math.abs(point[1] - (cz + 0.5)) < 7.5;
    const inSideHall = Math.abs(point[0] - (cx + 2.2)) < 5.1 && Math.abs(point[1] - (cz - 0.2)) < 6.0;
    return !inMainHall && !inSideHall;
  }
  if (distanceToSegment(point, bridgeEnds[0], bridgeEnds[1]) < 1.25) return true;
  return false;
}

export function positionOnBridge(point: Point): number {
  const [a, b] = bridgeEnds;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return distanceToSegment(point, a, b) < 1.55 ? 0.35 + Math.sin(Math.PI * t) * 2.4 : 0.35;
}

export const mapAttribution = map.source;
