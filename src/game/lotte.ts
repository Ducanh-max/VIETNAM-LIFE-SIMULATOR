import { GROUND_HEIGHT, insidePolygon, offsetRing, project, type Point } from './geo';

/*
 * Lotte Center Hà Nội (54 Liễu Giai, Ba Đình). Figures from the Wikipedia article "Lotte Center Hanoi"
 * (read 24/11/2026): 65 floors, roof 272 m, top floor 267 m, department store on levels 1–6, Lotte
 * Hotel Hanoi on floors 33–64, observation deck "Hanoi Sky" on floor 65, lifts at 6 m/s (that figure is
 * marked "citation needed" on the page). Plan and heights of the tower and podium: see the OSM note below.
 *
 * Gameplay: walk in through the lobby door on the tower's east face, call the lift (E), step in, pick a
 * floor 1–65 on the panel; the cabin closes, accelerates to 6 m/s and carries you up or down with the
 * floor counter running; the doors open and you can walk out on that floor. Upper floors are confined to
 * the tower's floor plate; floor 65 is the glass-walled observation deck.
 */
export const FLOORS = 65;
export const FLOOR_H = 4.05; // floor-to-floor: floor 67 ("PH", top floor) at 267 m
export const TOWER_TOP = 272;
export const floorY = (f: number) => (f - 1) * FLOOR_H;
const SPEED = 6; // m/s
const ACCEL = 1.1; // m/s²
/*
 * Plan and heights from OpenStreetMap (© OpenStreetMap contributors, ODbL), read 26/11/2026:
 *  - way 727570330 "building:part", 65 levels, height 272, glass: the tower. Its outline is a bow tie: ~88 m long,
 *    38 m across at both ends and only ~24 m at the middle, where a groove ~4 m wide and 2–2.5 m deep cuts into both
 *    long faces. That is the vertical split seen in every photo, and why the two leaves catch the light differently.
 *  - way 1195985607 "building:part", 6 levels, height 36, glass: the podium, wrapping the tower's south and west.
 * The áo dài waist (the plan drawing in a little at mid-height and the groove opening wider towards the crown)
 * is read from photos (znews aerial 2014, Thornton Tomasetti night facade), not from measurements.
 */
const TOWER_LL: [number, number][] = [[21.0318738, 105.8123383], [21.0321962, 105.8122183], [21.0322609, 105.8126135], [21.0322388, 105.812617], [21.0322517, 105.8126584], [21.0322721, 105.8126503], [21.0324512, 105.8130273], [21.0321399, 105.8131252], [21.0320635, 105.8127269], [21.0320807, 105.8127208], [21.0320685, 105.8126824], [21.0320512, 105.8126912]];
const PODIUM_LL: [number, number][] = [[21.0318738, 105.8123383], [21.0321962, 105.8122183], [21.0322609, 105.8126135], [21.0322388, 105.812617], [21.0322517, 105.8126584], [21.0322721, 105.8126503], [21.0324512, 105.8130273], [21.0326727, 105.8121497], [21.0319716, 105.8119467]];
export const PODIUM_H = 36;
export const ROUND = 0;
/** Plan scale at height y: full size at the base and the crown, ~4 % narrower at mid-height (the áo dài waist). */
export const taper = (y: number) => 1 - 0.04 * Math.sin(Math.PI * Math.min(1, Math.max(0, y / 268)));

// ---- frames: the tower's long axis by principal components of its OSM outline; +u points east (to Liễu Giai) ----
const frame = (() => {
  const tw = TOWER_LL.map(([lat, lon]) => project([lon, lat]));
  const c0: Point = [tw.reduce((s, p) => s + p[0], 0) / tw.length, tw.reduce((s, p) => s + p[1], 0) / tw.length];
  let sxx = 0, sxz = 0, szz = 0;
  for (const [x, z] of tw) { const dx = x - c0[0], dz = z - c0[1]; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let dir: Point = [Math.cos(ang), Math.sin(ang)]; if (dir[0] < 0) dir = [-dir[0], -dir[1]];
  const loc = (p: Point): Point => { const dx = p[0] - c0[0], dz = p[1] - c0[1]; return [dx * dir[0] + dz * dir[1], -dx * dir[1] + dz * dir[0]]; };
  let ring = tw.map(loc);
  // centre the frame on the outline's extents
  const mu = (Math.max(...ring.map((p) => p[0])) + Math.min(...ring.map((p) => p[0]))) / 2, mv = (Math.max(...ring.map((p) => p[1])) + Math.min(...ring.map((p) => p[1]))) / 2;
  const center: Point = [c0[0] + dir[0] * mu - dir[1] * mv, c0[1] + dir[1] * mu + dir[0] * mv];
  ring = ring.map(([u, v]): Point => [u - mu, v - mv]);
  if (signedArea(ring) < 0) ring.reverse();
  // the east end (lobby door) square to the axis: OSM has its two corners 1.8 m apart along u
  const maxU = Math.max(...ring.map((p) => p[0])); const endU = ring.filter((p) => p[0] > maxU - 4).reduce((s, p, _, a) => s + p[0] / a.length, 0);
  ring = ring.map(([u, v]): Point => (u > maxU - 4 ? [endU, v] : [u, v]));
  const podiumRing = PODIUM_LL.map(([lat, lon]) => project([lon, lat])).map((p) => { const dx = p[0] - center[0], dz = p[1] - center[1]; return [dx * dir[0] + dz * dir[1], -dx * dir[1] + dz * dir[0]] as Point; });
  return { dir, center, base: ring, podiumRing, podium: { h: PODIUM_H }, rotY: Math.atan2(-dir[1], dir[0]) };
})();
function signedArea(r: Point[]) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export const LOTTE = frame;
export const TOWER = { halfU: Math.max(...frame.base.map((p) => p[0])), halfV: Math.max(...frame.base.map((p) => Math.abs(p[1]))) };
/**
 * Base outline split into pieces of ≤ 3 m (the east end into 4.5 m pieces so the lobby door's edges fall on vertices).
 * `groove` flags the vertices of the two grooves: index → which way the groove's side moves as it widens upwards.
 */
const BASE = (() => {
  const pts: Point[] = [];
  const b = frame.base; const n = b.length;
  const isGroove = (p: Point) => Math.abs(p[0]) < 8 && Math.abs(p[1]) < TOWER.halfV * 0.6;
  for (let i = 0; i < n; i++) {
    const a = b[i], c = b[(i + 1) % n]; const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const east = a[0] > TOWER.halfU - 0.01 && c[0] > TOWER.halfU - 0.01;
    const k = east ? Math.round(len / 4.5) : isGroove(a) || isGroove(c) ? 1 : Math.max(1, Math.ceil(len / 3));
    for (let j = 0; j < k; j++) {
      pts.push([a[0] + (c[0] - a[0]) * j / k, a[1] + (c[1] - a[1]) * j / k]);
    }
  }
  // groove lips are the outer vertices next to a groove bottom; mark bottoms 2, lips 1
  const g = pts.map((p) => (Math.abs(p[0]) < 8 && Math.abs(p[1]) < TOWER.halfV * 0.6 ? 2 : 0));
  const lips: number[] = [];
  for (let i = 0; i < pts.length; i++) if (!g[i] && (g[(i + 1) % pts.length] === 2 || g[(i + pts.length - 1) % pts.length] === 2)) lips.push(i);
  return { pts, bottom: g.map((x) => x === 2), lips, mid: (() => { const gs = pts.filter((_, i) => g[i] === 2); return gs.reduce((s, p) => s + p[0], 0) / Math.max(1, gs.length); })() };
})();
/** Indices of the groove lips in a towerRing (where the vertical fins stand). */
export const GROOVE_LIPS = BASE.lips;
/**
 * The tower's outline at height y (tower local [u, v]), counter-clockwise seen from above, `inset` metres in from the
 * facade. The grooves open out with height (sides move apart, bottoms sink deeper); the vertex count never changes,
 * so rings at every height line up and the shaft walls don't twist.
 */
export function towerRing(y: number, inset = 0): Point[] {
  const s = taper(y); const t = Math.min(1, Math.max(0, y / 268));
  const ring = BASE.pts.map(([u, v], i): Point => {
    let uu = u, vv = v;
    if (BASE.bottom[i] || BASE.lips.includes(i)) {
      const side = Math.sign(u - BASE.mid) || 1; uu = u + side * (BASE.bottom[i] ? 0.6 : 1.6) * Math.pow(t, 1.3);
      if (BASE.bottom[i]) vv = v - Math.sign(v) * 1.2 * t;
    }
    return [uu * s, vv * s];
  });
  return inset ? offsetRing(ring, -inset) : ring;
}
const ringCache = new Map<string, Point[]>();
/** Cached towerRing for collision tests (per floor). */
export function towerRingCached(y: number, inset: number) { const k = `${y.toFixed(2)}:${inset}`; let r = ringCache.get(k); if (!r) { r = towerRing(y, inset); ringCache.set(k, r); } return r; }
/** World point → tower local (u along the tower axis, east; v across). */
export function toTower(p: Point): Point {
  const dx = p[0] - frame.center[0], dz = p[1] - frame.center[1];
  return [dx * frame.dir[0] + dz * frame.dir[1], -dx * frame.dir[1] + dz * frame.dir[0]];
}
export function fromTower(u: number, v: number): Point {
  return [frame.center[0] + frame.dir[0] * u - frame.dir[1] * v, frame.center[1] + frame.dir[1] * u + frame.dir[0] * v];
}
/** Where you stand outside the lobby door. */
export const lotteDoor = (): Point => fromTower(TOWER.halfU + 4, 0);

// ---- plan layout (tower local) ----
const inner = (u: number, v: number, f: number) => {
  if (Math.abs(u) > TOWER.halfU + 2 || Math.abs(v) > TOWER.halfV + 2) return false;
  return insidePolygon([u, v], towerRingCached(floorY(f), 0.8));
};
/** Half width of the lobby entrance on the tower's east face (a 9 m glass front with sliding doors). */
export const DOOR_HALF = 4.5;
export const CORE = { halfU: 7, halfV: 4.5 };
export const CABIN = { u0: -1.3, u1: 1.3, v0: 2.0, v1: 4.1 }; // the lift cabin, its door at v = 4.5 facing +v
const inCore = (u: number, v: number) => Math.abs(u) < CORE.halfU && Math.abs(v) < CORE.halfV;
export const inCabin = (u: number, v: number) => u > CABIN.u0 && u < CABIN.u1 && v > CABIN.v0 && v < CABIN.v1;
const inDoorway = (u: number, v: number) => u > CABIN.u0 && u < CABIN.u1 && v >= CABIN.v1 && v < CORE.halfV + 0.1;

// ---- the lift ----
export const lift = {
  playerFloor: 1, // floor the player is on (or left from while riding)
  cabinY: 0, cabinV: 0, cabinFloor: 1, target: 1,
  moving: false, riding: false, doors: 0, // 0 closed … 1 open
  doorWant: 0, doorTimer: 0,
  panel: false,
  inside: false, // player inside the tower
  queue: [] as number[],
};
export const cabinAt = (f: number) => !lift.moving && lift.cabinFloor === f;

/** Send the cabin to a floor (doors close first). `withPlayer` when the player is inside. */
export function sendLift(f: number, withPlayer: boolean) {
  f = Math.max(1, Math.min(FLOORS, Math.round(f)));
  if (f === lift.cabinFloor && !lift.moving) { lift.doorWant = 1; lift.doorTimer = 6; return; }
  lift.target = f; lift.riding = withPlayer; lift.doorWant = 0; lift.panel = false;
}

/** Advance the lift: doors, then travel with a trapezoidal speed profile. */
export function stepLift(dt: number) {
  // doors
  lift.doors = Math.max(0, Math.min(1, lift.doors + (lift.doorWant ? 1 : -1) * dt / 1.1));
  if (lift.doorWant && lift.doors >= 1) { lift.doorTimer -= dt; if (lift.doorTimer <= 0 && !lift.panel) lift.doorWant = 0; }
  const goal = floorY(lift.target);
  if (lift.target !== lift.cabinFloor || lift.moving) {
    if (lift.doors > 0) return; // wait for the doors to close
    lift.moving = true;
    const d = goal - lift.cabinY; const dir = Math.sign(d);
    const stop = (lift.cabinV * lift.cabinV) / (2 * ACCEL);
    if (Math.abs(d) <= stop + 0.02) lift.cabinV = Math.max(0.15, Math.abs(lift.cabinV) - ACCEL * dt) * dir;
    else lift.cabinV = Math.min(SPEED, Math.abs(lift.cabinV) + ACCEL * dt) * dir;
    lift.cabinY += lift.cabinV * dt;
    if ((dir > 0 && lift.cabinY >= goal) || (dir < 0 && lift.cabinY <= goal) || dir === 0) {
      lift.cabinY = goal; lift.cabinV = 0; lift.moving = false; lift.cabinFloor = lift.target;
      if (lift.riding) lift.playerFloor = lift.target;
      lift.riding = false; lift.doorWant = 1; lift.doorTimer = 6;
    }
  }
}
/** The floor number the cabin is passing (for the displays). */
export const cabinFloorShown = () => Math.round(lift.cabinY / FLOOR_H) + 1;

// ---- collision and floor height, registered with the world (see world/Lotte.tsx) ----
export function lotteBlocks(p: Point): boolean {
  const [u, v] = toTower(p);
  if (Math.abs(u) > 160 || Math.abs(v) > 160) return false;
  const f = lift.playerFloor;
  const here = inner(u, v, f);
  if (f > 1) {
    if (!lift.inside) return false;
    if (!here) return true; // upper floors: only the tower's floor plate
  } else {
    const towerOuter = Math.abs(u) < TOWER.halfU + 1 && Math.abs(v) < TOWER.halfV + 1 && insidePolygon([u, v], towerRingCached(0, -0.3));
    const door = u > TOWER.halfU - 1.5 && u < TOWER.halfU + 1 && Math.abs(v) < DOOR_HALF;
    const inPodium = insidePolygon([u, v], frame.podiumRing);
    if ((inPodium || towerOuter) && !here && !door) return true;
  }
  if (inCore(u, v)) {
    const cabinHere = (cabinAt(f) || lift.riding) && (inCabin(u, v) || inDoorway(u, v));
    if (!cabinHere) return true;
    if (inDoorway(u, v) && lift.doors < 0.7) return true;
  }
  return false;
}
export function lotteHeight(p: Point): number | null {
  if (!frame) return null;
  const [u, v] = toTower(p);
  if (!inner(u, v, lift.playerFloor)) return null;
  if ((inCabin(u, v) || inDoorway(u, v)) && (lift.riding || cabinAt(lift.playerFloor))) return GROUND_HEIGHT + lift.cabinY;
  return GROUND_HEIGHT + floorY(lift.playerFloor);
}
/** Inside the tower's footprint (plan only, any floor). */
export function insideTowerPlan(p: Point) { const [u, v] = toTower(p); return Math.abs(u) < TOWER.halfU + 1 && Math.abs(v) < TOWER.halfV + 1 && insidePolygon([u, v], towerRingCached(0, -1)); }
/** Inside the tower's walkable plate (for camera limits and showing the interior). */
export function insideTower(p: Point) {
  const [u, v] = toTower(p);
  return inner(u, v, lift.playerFloor);
}

if (import.meta.env.DEV) (window as unknown as { __lotte?: unknown }).__lotte = { lift, sendLift, lotteDoor, fromTower, toTower, LOTTE };
