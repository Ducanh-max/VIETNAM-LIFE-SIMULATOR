import { GROUND_HEIGHT, insidePolygon, type Point } from './geo';
import { lotteFootprint } from './osm';

/*
 * Lotte Center Hà Nội (54 Liễu Giai, Ba Đình). Figures from the Wikipedia article "Lotte Center Hanoi"
 * (read 24/11/2026): 65 floors, roof 272 m, top floor 267 m, department store on levels 1–6, Lotte
 * Hotel Hanoi on floors 33–64, observation deck "Hanoi Sky" on floor 65, lifts at 6 m/s (that figure is
 * marked "citation needed" on the page). The podium is a six-storey block over the OSM footprint west of the
 * tower; the tower's plan size (56 × 32 m at the base, tapering by 14 % to the top) and its place at the east end of
 * the podium facing Liễu Giai are my approximations — the article gives neither.
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
export const TOWER = { halfU: 28, halfV: 16 };
/** Plan scale of the tower at height y (tapers towards the top). */
export const taper = (y: number) => 1 - 0.14 * Math.pow(Math.min(1, Math.max(0, y / 260)), 1.6);

// ---- frames: the podium's main axis from the footprint's longest edge, the tower at its east end ----
const fp = lotteFootprint;
const frame = (() => {
  if (!fp) return null;
  let best = 0, dir: Point = [1, 0];
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  }
  if (dir[0] < 0) dir = [-dir[0], -dir[1]]; // +u points east
  const c: Point = [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length];
  const us = fp.map((p) => (p[0] - c[0]) * dir[0] + (p[1] - c[1]) * dir[1]);
  const vs = fp.map((p) => -(p[0] - c[0]) * dir[1] + (p[1] - c[1]) * dir[0]);
  const maxU = Math.max(...us), minU = Math.min(...us); const midV = (Math.max(...vs) + Math.min(...vs)) / 2;
  const tu = maxU - TOWER.halfU - 3;
  const center: Point = [c[0] + dir[0] * tu - dir[1] * midV, c[1] + dir[1] * tu + dir[0] * midV];
  // the six-storey podium (department store) stretches west of the tower over the rest of the footprint
  const podium = { u0: minU - tu, u1: -TOWER.halfU, v0: Math.min(...vs) - midV, v1: Math.max(...vs) - midV, h: 6 * FLOOR_H };
  // the podium is the OSM footprint cut off at the tower's west face (Sutherland–Hodgman against u = −halfU),
  // so it meets the tower exactly and never pokes out round it
  const local = fp.map((_, i): Point => [us[i] - tu, vs[i] - midV]);
  const cut = -TOWER.halfU;
  const ring: Point[] = [];
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length];
    const ain = a[0] <= cut, bin = b[0] <= cut;
    if (ain) ring.push(a);
    if (ain !== bin) { const t = (cut - a[0]) / (b[0] - a[0]); ring.push([cut, a[1] + (b[1] - a[1]) * t]); }
  }
  return { dir, center, podium, podiumRing: ring, rotY: Math.atan2(-dir[1], dir[0]) };
})();
export const LOTTE = frame;
/** World point → tower local (u along the podium axis, east; v across). */
export function toTower(p: Point): Point {
  if (!frame) return [1e9, 1e9];
  const dx = p[0] - frame.center[0], dz = p[1] - frame.center[1];
  return [dx * frame.dir[0] + dz * frame.dir[1], -dx * frame.dir[1] + dz * frame.dir[0]];
}
export function fromTower(u: number, v: number): Point {
  if (!frame) return [0, 0];
  return [frame.center[0] + frame.dir[0] * u - frame.dir[1] * v, frame.center[1] + frame.dir[1] * u + frame.dir[0] * v];
}
/** Where you stand outside the lobby door. */
export const lotteDoor = (): Point => fromTower(TOWER.halfU + 4, 0);

// ---- plan layout (tower local) ----
const inner = (u: number, v: number, f: number) => { const s = taper(floorY(f)); return Math.abs(u) < TOWER.halfU * s - 0.8 && Math.abs(v) < TOWER.halfV * s - 0.8; };
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
  if (!frame || !fp) return false;
  const [u, v] = toTower(p);
  if (Math.abs(u) > 160 || Math.abs(v) > 160) return false;
  const f = lift.playerFloor;
  const here = inner(u, v, f);
  if (f > 1) {
    if (!lift.inside) return false;
    if (!here) return true; // upper floors: only the tower's floor plate
  } else {
    const towerOuter = Math.abs(u) < TOWER.halfU + 0.3 && Math.abs(v) < TOWER.halfV + 0.3;
    const door = u > TOWER.halfU - 1.5 && u < TOWER.halfU + 1 && Math.abs(v) < 2.6;
    const inPodium = insidePolygon([u, v], frame.podiumRing) || (u > -TOWER.halfU - 0.5 && u < -TOWER.halfU + 0.1 && Math.abs(v) < TOWER.halfV);
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
/** Inside the tower's walkable plate (for camera limits and showing the interior). */
export function insideTower(p: Point) {
  const [u, v] = toTower(p);
  return inner(u, v, lift.playerFloor);
}

if (import.meta.env.DEV) (window as unknown as { __lotte?: unknown }).__lotte = { lift, sendLift, lotteDoor, fromTower, toTower, LOTTE };
