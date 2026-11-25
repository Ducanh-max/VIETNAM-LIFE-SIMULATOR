import { distanceToShore, inWorld, type Point } from './geo';
import { pickupPoint } from './job';
import { inLake, insideBuilding, roadClearance } from './osm';
import { taxi } from './ride';
import { game, player } from './state';

/*
 * Turn-by-turn-ish routing for deliveries. The district is rasterised once into 4 m cells: carriageways
 * are cheap, pavements and squares cost more, buildings and the lake are blocked. A* over that grid
 * follows the real OSM streets, and the path is simplified into a polyline for the maps.
 */
/** Raster over the whole map: the lake district, the corridor west to Lotte, Ba Đình and Thủ Lệ (x −5260…1320, z −1320…1320). */
export const NAV = { minX: -5260, minZ: -1320, sizeX: 6580, sizeZ: 2640, cell: 4 };
const N = NAV.sizeX / NAV.cell; // row length
const NZ = NAV.sizeZ / NAV.cell;
let costs: Uint8Array | null = null; // 0 = blocked, otherwise step cost

function buildCosts() {
  const c = new Uint8Array(N * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < N; i++) {
    const p: Point = [NAV.minX + (i + 0.5) * NAV.cell, NAV.minZ + (j + 0.5) * NAV.cell];
    if (!inWorld(p)) continue;
    if (distanceToShore(p) < 0.5) continue; // lake
    const road = roadClearance(p);
    if (road < 0.5) { c[j * N + i] = 1; continue; }
    if (insideBuilding(p, 0) || inLake(p)) continue;
    c[j * N + i] = road < 4 ? 3 : 5; // pavement next to a street, or open ground
  }
  return c;
}
const cellOf = (x: number, z: number): [number, number] => [Math.floor((x - NAV.minX) / NAV.cell), Math.floor((z - NAV.minZ) / NAV.cell)];
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < NZ;

/** Nearest open cell (the player may stand inside a doorway cell marked as building). */
function nearestOpen(i: number, j: number) {
  for (let r = 0; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = i + di, b = j + dj;
    if (inGrid(a, b) && costs![b * N + a]) return [a, b] as [number, number];
  }
  return null;
}

/** Binary-heap A* with 8 neighbours. Returns world points or null. */
export function findRoute(from: Point, to: Point): Point[] | null {
  costs ??= buildCosts();
  const s = nearestOpen(...cellOf(from[0], from[1]));
  const t = nearestOpen(...cellOf(to[0], to[1]));
  if (!s || !t) return null;
  const start = s[1] * N + s[0]; const goal = t[1] * N + t[0];
  const g = new Float32Array(N * NZ).fill(Infinity);
  const came = new Int32Array(N * NZ).fill(-1);
  const closed = new Uint8Array(N * NZ);
  const heap: number[] = []; const hf: number[] = [];
  const push = (node: number, f: number) => {
    heap.push(node); hf.push(f);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop()!; const lf = hf.pop()!;
    if (heap.length) {
      heap[0] = last; hf[0] = lf; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; }
    }
    return top;
  };
  const tx = t[0], tz = t[1];
  const h = (node: number) => { const i = node % N, j = (node / N) | 0; const dx = Math.abs(i - tx), dz = Math.abs(j - tz); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)); };
  g[start] = 0; push(start, h(start));
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false; let guard = 0;
  while (heap.length && guard++ < 400_000) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const ci = cur % N, cj = (cur / N) | 0;
    for (const [di, dj, len] of dirs) {
      const ni = ci + di, nj = cj + dj;
      if (!inGrid(ni, nj)) continue;
      const nb = nj * N + ni; const cost = costs[nb];
      if (!cost || closed[nb]) continue;
      if (di && dj && (!costs[cj * N + ni] || !costs[nj * N + ci])) continue; // no corner cutting through walls
      const ng = g[cur] + len * cost;
      if (ng < g[nb]) { g[nb] = ng; came[nb] = cur; push(nb, ng + h(nb)); }
    }
  }
  if (!found) return null;
  const cells: Point[] = [];
  for (let n = goal; n !== -1; n = came[n]) cells.push([NAV.minX + ((n % N) + 0.5) * NAV.cell, NAV.minZ + (((n / N) | 0) + 0.5) * NAV.cell]);
  cells.reverse();
  cells[0] = from; cells[cells.length - 1] = to;
  return simplify(cells, 2.5);
}

function simplify(points: Point[], tol: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const [ax, az] = points[a], [bx, bz] = points[b], [px, pz] = points[i];
      const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l));
      const d = Math.hypot(px - ax - t * dx, pz - az - t * dz);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export const routeLength = (r: Point[]) => r.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0), 0);

/** Live route to the current job target, recomputed when the target changes or the player strays. */
export const nav = {
  route: null as Point[] | null,
  target: null as { x: number; z: number; label: string } | null,
  /** A destination picked in the map search (used when no job or ride sets one). */
  custom: null as { x: number; z: number; label: string } | null,
  length: 0,
  lastFrom: [Infinity, Infinity] as Point,
  lastTarget: '',
};

function distToRoute(p: Point, r: Point[]) {
  let best = Infinity;
  for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1];
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l));
    best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - az - t * dz));
  }
  return best;
}

/** Call a few times a second. */
export function updateNav() {
  const job = game.get().job;
  const ride = game.get().ride;
  const drv = game.get().driver;
  if (nav.custom && Math.hypot(player.position.x - nav.custom.x, player.position.z - nav.custom.z) < 14) { const name = nav.custom.label; nav.custom = null; game.toast(`Đã tới ${name}.`); }
  const target = drv ? (drv.fare ? (drv.stage === 'onboard' ? { x: drv.fare.dest.x, z: drv.fare.dest.z, label: `Trả khách · ${drv.fare.dest.street}` } : { x: drv.fare.pickup.x, z: drv.fare.pickup.z, label: `Đón ${drv.fare.passenger}` }) : null) : ride ? (ride.stage === 'riding' ? { x: ride.dest.x, z: ride.dest.z, label: ride.dest.name } : { x: taxi.position.x, z: taxi.position.z, label: `Xe Đen SM · ${ride.driver}` }) : !job ? null : job.stage === 'deliver' && job.delivery ? { ...job.delivery.dest, label: job.delivery.customer } : { ...pickupPoint(), label: 'Quán Bún chả Đức Anh' };
  const finalTarget = target ?? nav.custom;
  nav.target = finalTarget;
  if (!finalTarget) { nav.route = null; nav.length = 0; nav.lastTarget = ''; return; }
  const from: Point = [player.position.x, player.position.z];
  const key = `${Math.round(finalTarget.x / 12)},${Math.round(finalTarget.z / 12)}`; // a moving finalTarget (the Đen SM driver) only reroutes every ~12 m
  const strayed = nav.route ? distToRoute(from, nav.route) > 10 : true;
  if (key !== nav.lastTarget || strayed) {
    nav.route = findRoute(from, [finalTarget.x, finalTarget.z]);
    nav.lastTarget = key;
    nav.lastFrom = from;
  }
  if (nav.route) {
    // trim the part already travelled
    let best = 0; let bestD = Infinity;
    for (let i = 0; i < nav.route.length - 1; i++) {
      const d = distToRoute(from, [nav.route[i], nav.route[i + 1]]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best > 0) nav.route = [from, ...nav.route.slice(best + 1)];
    else nav.route[0] = from;
    nav.length = routeLength(nav.route);
  }
}
