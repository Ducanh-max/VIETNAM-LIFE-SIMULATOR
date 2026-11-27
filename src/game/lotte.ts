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
/**
 * Floor level above the street. Floors 1–6 (the department store) share the podium's 6 m storeys (36 m, 6 levels in
 * OSM); floors 7–65 fill the rest of the tower to floor 65 at 263 m (3,92 m each). Basements: B1 (−1) at −5 m, then
 * 3,8 m per level down to B5.
 */
export const floorY = (f: number) => (f >= 1 ? (f <= 6 ? (f - 1) * 6 : 36 + (f - 7) * 3.918) : -5 - (-f - 1) * 3.8);
const CORE_HALF_V = 4.5;
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

// ---- floors: 1–65 above ground, B1–B5 below (floor ids −1…−5) ----
export const BASEMENTS = 5;
export const floorLabel = (f: number) => (f >= 1 ? String(f) : `B${-f}`);
/** Every floor id from the bottom up: B5 … B1, 1 … 65. */
export const FLOOR_IDS = [...Array.from({ length: BASEMENTS }, (_, i) => -(BASEMENTS - i)), ...Array.from({ length: FLOORS }, (_, i) => i + 1)];
export type FloorCategory = 'parking' | 'supermarket' | 'lobby' | 'store' | 'amenity' | 'office' | 'unknown' | 'hotel' | 'deck';
export type FloorInfo = { floorId: number; displayName: string; category: FloorCategory; sceneAsset: string; availableInGame: boolean; spawnAnchor: Point };
/**
 * FloorRegistry (spec section 5): what each floor is and whether the game has a scene for it. Only floors with a
 * scene can be picked in the lift. B1 (LOTTE Mart) arrives with the next phase.
 */
export const FLOOR_REGISTRY: FloorInfo[] = FLOOR_IDS.map((f): FloorInfo => {
  const at: Point = [0, CORE_HALF_V + 2.5];
  if (f <= -2) return { floorId: f, displayName: `Hầm ${floorLabel(f)} · gửi xe`, category: 'parking', sceneAsset: 'LotteBasement', availableInGame: true, spawnAnchor: at };
  if (f === -1) return { floorId: f, displayName: 'B1 · LOTTE Mart', category: 'supermarket', sceneAsset: 'LotteMart', availableInGame: true, spawnAnchor: at };
  if (f === 1) return { floorId: f, displayName: 'Sảnh · trung tâm thương mại', category: 'lobby', sceneAsset: 'Interior:lobby', availableInGame: true, spawnAnchor: at };
  if (f <= 6) return { floorId: f, displayName: `Tầng ${f} · trung tâm thương mại`, category: 'store', sceneAsset: 'Interior:store', availableInGame: true, spawnAnchor: at };
  if (f === 7) return { floorId: f, displayName: 'Tầng 7 · tiện ích khách sạn', category: 'amenity', sceneAsset: 'Interior:office', availableInGame: true, spawnAnchor: at };
  if (f <= 31) return { floorId: f, displayName: `Tầng ${f} · văn phòng`, category: 'office', sceneAsset: 'Interior:office', availableInGame: true, spawnAnchor: at };
  if (f === 32) return { floorId: f, displayName: 'Tầng 32', category: 'unknown', sceneAsset: 'Interior:office', availableInGame: true, spawnAnchor: at };
  if (f <= 64) return { floorId: f, displayName: `Tầng ${f} · khách sạn / căn hộ`, category: 'hotel', sceneAsset: 'Interior:hotel', availableInGame: true, spawnAnchor: at };
  return { floorId: f, displayName: 'Tầng 65 · Đài quan sát Hanoi Sky', category: 'deck', sceneAsset: 'Interior:deck', availableInGame: true, spawnAnchor: at };
});
export const floorInfo = (f: number) => FLOOR_REGISTRY.find((x) => x.floorId === f) ?? FLOOR_REGISTRY[BASEMENTS];

// ---- the basement: the whole OSM outline (way 727570329, tower + podium + entrance), five levels ----
const FOOT_LL: [number, number][] = [[21.0318738, 105.8123383], [21.0319716, 105.8119467], [21.0326727, 105.8121497], [21.0324512, 105.8130273], [21.0323902, 105.8132657], [21.032154, 105.8131962], [21.0321399, 105.8131252], [21.0320635, 105.8127269], [21.0320807, 105.8127208], [21.0320685, 105.8126824], [21.0320512, 105.8126912]];
const footLocal = FOOT_LL.map(([lat, lon]) => toTower(project([lon, lat])));
/** Basement outline (tower local), 0,6 m in from the outer wall. */
export const BASEMENT_RING: Point[] = offsetRing(signedArea(footLocal) > 0 ? footLocal : [...footLocal].reverse(), -0.6);
/**
 * Ramps run in three 6 m strips inside the podium's south-east wall, in a frame s (along the wall, from the south
 * corner towards the tower) / t (inward). Strip A: street ↔ B2, entered through a portal in the podium's south-west
 * wall at the south corner, where the service road round the back of the podium bends (the north-west side is lined
 * with houses in OSM, so the entrance cannot be there). Strip B: B2 ↔ B3 and, two floors lower, B4 ↔ B5. Strip C: B3 ↔ B4. Each ramp slopes
 * between s = 3 and s = 63 (60 m, about 1 in 16 per 3,8 m storey, 1 in 7 for the 8,8 m street ramp).
 */
export const RAMP = (() => {
  const pr = frame.podiumRing;
  const A = pr.reduce((m, p) => (p[1] < m[1] ? p : m)); const B = pr.reduce((m, p) => (p[0] > m[0] ? p : m));
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]); const e: Point = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  let n: Point = [-e[1], e[0]];
  const c = pr.reduce((s, p) => [s[0] + p[0] / pr.length, s[1] + p[1] / pr.length], [0, 0]);
  if ((c[0] - A[0]) * n[0] + (c[1] - A[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { A, e, n, len, S0: 3, S1: 63, strips: { A: [1, 7], B: [7.5, 13.5], C: [14, 20] } as Record<'A' | 'B' | 'C', [number, number]> };
})();
export const toRamp = (u: number, v: number): Point => { const du = u - RAMP.A[0], dv = v - RAMP.A[1]; return [du * RAMP.e[0] + dv * RAMP.e[1], du * RAMP.n[0] + dv * RAMP.n[1]]; };
export const fromRamp = (s: number, t: number): Point => [RAMP.A[0] + RAMP.e[0] * s + RAMP.n[0] * t, RAMP.A[1] + RAMP.e[1] * s + RAMP.n[1] * t];
type Strip = 'A' | 'B' | 'C';
/**
 * Every slope between floors: the basement ramps (strips A–C) and the mall's escalators, all in the ramp frame. Each
 * runs along s from s0 (floor l0) to s1 (floor l1) inside the lane t0…t1; `move` is the escalator's travel along s
 * (+1, −1) or 0 for a fixed ramp; `tail` is how far past s1 the lane stays part of it (the ramps' run-out onto B2).
 */
export type Slope = { id: string; t0: number; t1: number; s0: number; s1: number; l0: number; l1: number; move: number; tail: number; strip?: Strip };
const strip = (k: Strip, l0: number, l1: number): Slope => ({ id: `${k}${l0}`, t0: RAMP.strips[k][0], t1: RAMP.strips[k][1], s0: RAMP.S0, s1: RAMP.S1, l0, l1, move: 0, tail: 6, strip: k });
/** Ramps: strip, the floor at the s = S0 end, the floor at the s = S1 end. */
export const RAMPS: { strip: Strip; l0: number; l1: number }[] = [
  { strip: 'A', l0: 1, l1: -2 }, { strip: 'B', l0: -3, l1: -2 }, { strip: 'B', l0: -5, l1: -4 }, { strip: 'C', l0: -4, l1: -3 },
];
/**
 * The atrium in the middle of the podium (ramp frame) and its escalators, 30° like real ones: 6 m up over 10,4 m.
 * Up escalators climb +s, down ones run −s; consecutive floors alternate between two lanes of each, so that a lane
 * never holds two escalators touching the same floor (you walk round the void to the next one, as in a real mall).
 */
export const ATRIUM = { s0: 30, s1: 41.4, t0: 23.6, t1: 32.6 };
const ESC_RUN = 10.4;
export const ESC_LANES = { U1: [24.0, 25.4], U2: [25.8, 27.2], D1: [28.8, 30.2], D2: [30.6, 32.0] } as Record<'U1' | 'U2' | 'D1' | 'D2', [number, number]>;
export const ESCALATORS: Slope[] = [];
for (let f = 1; f <= 5; f++) {
  const [ua, ub] = ESC_LANES[f % 2 ? 'U1' : 'U2'], [da, db] = ESC_LANES[f % 2 ? 'D1' : 'D2'];
  const s0 = ATRIUM.s0 + 0.5, s1 = s0 + ESC_RUN;
  ESCALATORS.push({ id: `up${f}`, t0: ua, t1: ub, s0, s1, l0: f, l1: f + 1, move: 1, tail: 0 });
  ESCALATORS.push({ id: `dn${f}`, t0: da, t1: db, s0, s1, l0: f, l1: f + 1, move: -1, tail: 0 });
}
export const SLOPES: Slope[] = [...RAMPS.map((r) => strip(r.strip, r.l0, r.l1)), ...ESCALATORS];
/** The slope you are on (or about to step onto) at floor L, or null. */
function rampHere(u: number, v: number, L: number) {
  const [s, t] = toRamp(u, v);
  for (const r of SLOPES) {
    if (r.l0 !== L && r.l1 !== L) continue;
    if (t <= r.t0 || t >= r.t1) continue;
    const lo = r.move ? r.s0 - 0.6 : -0.5, hi = r.s1 + (r.move ? 0.6 : r.tail);
    if (s < lo || s > hi) continue;
    if (r.strip && r.l0 === 1 && s < 0) continue; // outside the street portal
    const k01 = Math.min(1, Math.max(0, (s - r.s0) / (r.s1 - r.s0)));
    return { r, s, t, y: GROUND_HEIGHT + floorY(r.l0) + (floorY(r.l1) - floorY(r.l0)) * k01 };
  }
  return null;
}
/** The escalator under you, if any (for the moving steps). */
export function escalatorHere(p: Point) {
  const [u, v] = toTower(p); const h = rampHere(u, v, lift.playerFloor); if (!h || !h.r.move) return null;
  // carried between the comb plates; let go just before the far landing so you step off onto the floor
  const a = h.r.move > 0 ? h.r.s0 + 0.1 : h.r.s0 + 0.6, b = h.r.move > 0 ? h.r.s1 - 0.6 : h.r.s1 - 0.1;
  return h.s > a && h.s < b ? h.r : null;
}
/** Change level when you reach the far end of a slope (called every frame with the player's or vehicle's position). */
export function stepLevel(p: Point) {
  const [u, v] = toTower(p); const L = lift.playerFloor; if (lift.riding) return;
  const h = rampHere(u, v, L); if (!h) return;
  if (h.r.l0 === L && h.s > h.r.s1 - 0.4) lift.playerFloor = h.r.l1;
  else if (h.r.l1 === L && h.s < h.r.s0 + 0.4) lift.playerFloor = h.r.l0;
}
/** Extra blockers on the basement levels (columns, booth…), registered by world/LotteBasement. Arguments: u, v, floor. */
export const basementBlockers: ((u: number, v: number, f: number) => boolean)[] = [];
/** Extra blockers on the mall floors 1–6 (shop counters, benches…), registered by world/LotteMall. */
export const mallBlockers: ((u: number, v: number, f: number) => boolean)[] = [];
/** Extra blockers on any tower floor above the street (the Hanoi Sky turnstile…), registered by world components. */
export const towerBlockers: ((u: number, v: number, f: number) => boolean)[] = [];
/** Exit barrier at the top of the street ramp: closed while the player's ticket is unpaid (set by the parking UI). */
export const gates = { exitClosed: () => false };
export const inBasementPlate = (u: number, v: number) => insidePolygon([u, v], BASEMENT_RING);
/** Mall floors 1–6 cover the podium as well as the tower. */
export const MALL_TOP = 6;
/** Hotel amenities: the gym inside, the outdoor pool on the podium roof (36 m). */
export const AMENITY_FLOOR = 7;
const PODIUM_IN = offsetRing(signedArea(frame.podiumRing) > 0 ? frame.podiumRing : [...frame.podiumRing].reverse(), -0.8);
export const inPodiumPlate = (u: number, v: number) => insidePolygon([u, v], PODIUM_IN);
/** The atrium void on floors 2–6 (railings round it), except where an escalator serving this floor lands. */
export function inAtriumVoid(u: number, v: number, f: number) {
  if (f < 2 || f > MALL_TOP) return false;
  const [s, t] = toRamp(u, v);
  return s > ATRIUM.s0 + 1 && s < ATRIUM.s1 - 1 && t > ATRIUM.t0 && t < ATRIUM.t1;
}

// ---- plan layout (tower local) ----
const inner = (u: number, v: number, f: number) => {
  if (f < 0) return inBasementPlate(u, v);
  if ((f <= MALL_TOP || f === AMENITY_FLOOR) && inPodiumPlate(u, v)) return true; // floor 7 opens onto the podium roof (pool)
  if (Math.abs(u) > TOWER.halfU + 2 || Math.abs(v) > TOWER.halfV + 2) return false;
  return insidePolygon([u, v], towerRingCached(floorY(f), 0.8));
};
/** Half width of the lobby entrance on the tower's east face (a 9 m glass front with sliding doors). */
export const DOOR_HALF = 4.5;
export const CORE = { halfU: 7, halfV: CORE_HALF_V };
export const CABIN = { u0: -1.3, u1: 1.3, v0: 2.0, v1: 4.1 }; // the lift cabin, its door at v = 4.5 facing +v
const inCore = (u: number, v: number) => Math.abs(u) < CORE.halfU && Math.abs(v) < CORE.halfV;
export const inCabin = (u: number, v: number) => u > CABIN.u0 && u < CABIN.u1 && v > CABIN.v0 && v < CABIN.v1;
const inDoorway = (u: number, v: number) => u > CABIN.u0 && u < CABIN.u1 && v >= CABIN.v1 && v < CORE.halfV + 0.1;

// ---- the lift: ElevatorController (spec 10.1) ----
export type LiftState = 'IDLE' | 'OPENING' | 'OPEN' | 'CLOSING' | 'MOVING' | 'ARRIVED';
export const lift = {
  playerFloor: 1, // floor the player is on (or left from while riding)
  cabinY: 0, cabinV: 0, cabinFloor: 1, target: 1,
  moving: false, riding: false, doors: 0, // 0 closed … 1 open
  doorWant: 0, doorTimer: 0,
  arrive: 0, // seconds left in ARRIVED before the doors open
  panel: false,
  inside: false, // player inside the tower or basement
  queue: [] as number[], // landing calls made while the cabin was busy, served in order
  onArrive: null as ((f: number) => void) | null,
};
/** The cabin is standing at floor f (also during ARRIVED, when its doors have not opened yet: you must not be pushed out). */
export const cabinAt = (f: number) => !lift.moving && lift.cabinFloor === f;
export function liftState(): LiftState {
  if (lift.moving) return 'MOVING';
  if (lift.arrive > 0) return 'ARRIVED';
  if (lift.doorWant && lift.doors < 1) return 'OPENING';
  if (lift.doors >= 1) return 'OPEN';
  if (lift.doors > 0) return 'CLOSING';
  return 'IDLE';
}
/** Send the cabin to a floor (doors close first). `withPlayer` when the player is inside. False when refused or queued. */
export function sendLift(f: number, withPlayer: boolean): boolean {
  f = Math.round(f);
  if (!FLOOR_IDS.includes(f) || !floorInfo(f).availableInGame) return false;
  const busy = lift.moving || lift.arrive > 0 || lift.target !== lift.cabinFloor;
  if (busy) { if (!withPlayer && !lift.queue.includes(f)) lift.queue.push(f); return false; } // no overlapping trips
  if (f === lift.cabinFloor) { lift.doorWant = 1; lift.doorTimer = 6; return true; }
  lift.target = f; lift.riding = withPlayer; lift.doorWant = 0; lift.panel = false;
  return true;
}

/** Advance the lift: doors, then travel with a trapezoidal speed profile. */
export function stepLift(dt: number) {
  if (lift.arrive > 0) { lift.arrive -= dt; if (lift.arrive <= 0) { lift.doorWant = 1; lift.doorTimer = 6; } return; }
  // doors
  lift.doors = Math.max(0, Math.min(1, lift.doors + (lift.doorWant ? 1 : -1) * dt / 1.1));
  if (lift.doorWant && lift.doors >= 1) { lift.doorTimer -= dt; if (lift.doorTimer <= 0 && !lift.panel) lift.doorWant = 0; }
  // a queued landing call once the cabin is free and its doors have shut
  if (!lift.moving && lift.target === lift.cabinFloor && lift.queue.length && lift.doors <= 0 && !lift.doorWant && !lift.panel) {
    const next = lift.queue.shift()!; if (next === lift.cabinFloor) { lift.doorWant = 1; lift.doorTimer = 6; } else { lift.target = next; lift.riding = false; }
  }
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
      lift.riding = false; lift.arrive = 0.6; // ARRIVED: chime, then the doors open
      lift.onArrive?.(lift.cabinFloor);
    }
  }
}
/** The floor the cabin is passing (for the displays), as its label. */
export const cabinFloorShown = () => { let best = 1, bd = Infinity; for (const f of FLOOR_IDS) { const d = Math.abs(floorY(f) - lift.cabinY); if (d < bd) { bd = d; best = f; } } return floorLabel(best); };

// ---- collision and floor height, registered with the world (see world/Lotte.tsx) ----
export function lotteBlocks(p: Point): boolean {
  const [u, v] = toTower(p);
  if (Math.abs(u) > 160 || Math.abs(v) > 160) return false;
  const f = lift.playerFloor;
  const ramp = rampHere(u, v, f);
  if (ramp) {
    // on a slope: its side walls / balustrades, and the exit barrier near the top of the street ramp
    const r = ramp.r; const inRun = r.move ? ramp.s > r.s0 + 0.3 && ramp.s < r.s1 - 0.3 : ramp.s > 0.5 && ramp.s < r.s1;
    if ((ramp.t < r.t0 + 0.3 || ramp.t > r.t1 - 0.3) && inRun) return true;
    if (r.strip === 'A' && f === -2 && ramp.s > RAMP.S0 + 1 && ramp.s < RAMP.S0 + 1.6 && gates.exitClosed()) return true;
    return false;
  }
  const here = inner(u, v, f);
  if (f < 0) {
    if (!here) return true; // basement walls
    for (const test of basementBlockers) if (test(u, v, f)) return true;
    // a ramp strip whose ramp does not serve this floor overhead is low: plain floor; strips serving it are handled above
  } else if (f > 1) {
    if (!lift.inside) return false;
    if (!here) return true; // upper floors: only the floor plate (tower, plus the podium on 2–6)
    if (inAtriumVoid(u, v, f)) return true; // railings round the atrium
    if (f <= MALL_TOP) for (const test of mallBlockers) if (test(u, v, f)) return true;
    for (const test of towerBlockers) if (test(u, v, f)) return true;
  } else {
    const towerOuter = Math.abs(u) < TOWER.halfU + 1 && Math.abs(v) < TOWER.halfV + 1 && insidePolygon([u, v], towerRingCached(0, -0.3));
    const door = u > TOWER.halfU - 1.5 && u < TOWER.halfU + 1 && Math.abs(v) < DOOR_HALF;
    const inPodium = insidePolygon([u, v], frame.podiumRing);
    const [ps, pt] = toRamp(u, v); const podiumDoor = ps > -1.2 && ps < 1.6 && Math.abs(pt - 28) < 3; // glass doors in the south-west wall, off the service road
    if ((inPodium || towerOuter) && !here && !door && !podiumDoor) return true;
    if (here && lift.inside) for (const test of mallBlockers) if (test(u, v, f)) return true;
  }
  if (inCore(u, v)) {
    const cabinHere = (cabinAt(f) || lift.riding) && (inCabin(u, v) || inDoorway(u, v));
    if (!cabinHere) return true;
    if (inDoorway(u, v) && lift.doors < 0.7) return true;
  }
  return false;
}
export function lotteHeight(p: Point): number | null {
  const [u, v] = toTower(p);
  const f = lift.playerFloor;
  { const r = rampHere(u, v, f); if (r) return r.y; }
  if (!inner(u, v, f)) return null;
  if ((inCabin(u, v) || inDoorway(u, v)) && (lift.riding || cabinAt(f))) return GROUND_HEIGHT + lift.cabinY;
  return GROUND_HEIGHT + floorY(f);
}
/** Inside the tower's footprint (plan only, any floor). */
export function insideTowerPlan(p: Point) { const [u, v] = toTower(p); return Math.abs(u) < TOWER.halfU + 1 && Math.abs(v) < TOWER.halfV + 1 && insidePolygon([u, v], towerRingCached(0, -1)); }
/** Inside the tower's walkable plate on the player's floor, or anywhere in the basement / on a ramp below the street. */
export function insideTower(p: Point) {
  const [u, v] = toTower(p);
  if (lift.playerFloor < 0) return inBasementPlate(u, v) || !!rampHere(u, v, lift.playerFloor);
  return inner(u, v, lift.playerFloor);
}

if (import.meta.env.DEV) (window as unknown as { __lotte?: unknown }).__lotte = { lift, sendLift, lotteDoor, fromTower, toTower, LOTTE, RAMP, fromRamp, toRamp, liftState, ESCALATORS, ATRIUM, insideTower, towerRingCached, floorY };
