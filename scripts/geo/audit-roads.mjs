// Audits the OSM street network in src/data/hoanKiemOsm.json and prints the problems it finds:
// connected components of the drivable graph, dead ends that stop just short of another road (gaps),
// duplicated segments, crossings without a shared node, roads running through building footprints,
// and widths that do not fit the road class. Usage: node scripts/geo/audit-roads.mjs [--json]
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../../src/data/hoanKiemOsm.json', import.meta.url), 'utf8'));
const vehicle = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian', 'trunk']);
const roads = data.roads.filter((r) => vehicle.has(r.h));
const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

// ---- graph and components
const adj = new Map();
const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a).add(b); adj.get(b).add(a); };
for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) link(key(r.p[i]), key(r.p[i + 1]));
const seen = new Set(); const comps = [];
for (const n of adj.keys()) {
  if (seen.has(n)) continue;
  let size = 0; const stack = [n]; seen.add(n);
  while (stack.length) { const c = stack.pop(); size++; for (const m of adj.get(c)) if (!seen.has(m)) { seen.add(m); stack.push(m); } }
  comps.push(size);
}
comps.sort((a, b) => b - a);

// ---- segment index
const segs = [];
for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) segs.push({ a: r.p[i], b: r.p[i + 1], r });
const CELL = 20; const grid = new Map();
segs.forEach((s, i) => {
  const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / CELL), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / CELL);
  const z0 = Math.floor(Math.min(s.a[1], s.b[1]) / CELL), z1 = Math.floor(Math.max(s.a[1], s.b[1]) / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = `${x},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
});
const near = (p) => grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? [];
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };

// ---- dead ends that stop within 4 m of another road without joining it (gaps)
let deadEnds = 0; const gaps = [];
for (const [n, nb] of adj) {
  if (nb.size !== 1) continue;
  deadEnds++;
  const p = n.split(',').map(Number);
  for (const i of near(p)) {
    const s = segs[i];
    if (key(s.a) === n || key(s.b) === n || nb.has(key(s.a)) || nb.has(key(s.b))) continue;
    const d = distSeg(p, s.a, s.b);
    if (d > 0.05 && d < 4) { gaps.push({ at: p, d: +d.toFixed(2), to: s.r.n || s.r.h }); break; }
  }
}

// ---- duplicated segments (same two nodes on two ways)
const segKeys = new Map(); let dup = 0;
for (const s of segs) { const k = [key(s.a), key(s.b)].sort().join('|'); segKeys.set(k, (segKeys.get(k) ?? 0) + 1); }
for (const v of segKeys.values()) if (v > 1) dup += v - 1;

// ---- crossings without a node (excluding layered bridges/tunnels is not possible from this extract)
const cross = (p, q, r, s) => { const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-9) return false; const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d; const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d; return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98; };
let crossings = 0; const crossAt = [];
segs.forEach((s, i) => {
  const cand = new Set([...near(s.a), ...near(s.b)]);
  for (const j of cand) { if (j <= i) continue; const o = segs[j]; if (o.r === s.r) continue; if (cross(s.a, s.b, o.a, o.b)) { crossings++; if (crossAt.length < 12) crossAt.push([s.r.n || s.r.h, o.r.n || o.r.h]); } }
});

// ---- roads through buildings (segment midpoints inside a footprint)
const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c; } return c; };
const bgrid = new Map();
data.buildings.forEach((b, i) => { const xs = b.p.map((q) => q[0]), zs = b.p.map((q) => q[1]); for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++) for (let z = Math.floor(Math.min(...zs) / CELL); z <= Math.floor(Math.max(...zs) / CELL); z++) { const k = `${x},${z}`; if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(i); } });
let through = 0;
for (const s of segs) {
  if (s.r.h === 'service' || s.r.h === 'pedestrian') continue; // service ways often run into courtyards/under arcades
  const m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
  if ((bgrid.get(`${Math.floor(m[0] / CELL)},${Math.floor(m[1] / CELL)}`) ?? []).some((i) => inside(m, data.buildings[i].p))) through++;
}

// ---- widths
const odd = roads.filter((r) => r.w && (r.w < 2.5 || r.w > 30)).length;
const report = { roads: roads.length, segments: segs.length, components: comps.length, largestComponentNodes: comps[0], smallComponents: comps.slice(1).filter((c) => c < 6).length, deadEnds, gapsUnder4m: gaps.length, duplicateSegments: dup, crossingsWithoutNode: crossings, segmentsThroughBuildings: through, oddWidthTags: odd, oneway: roads.filter((r) => r.o).length };
console.log(JSON.stringify(report, null, 1));
if (process.argv.includes('--json')) console.log(JSON.stringify({ gaps: gaps.slice(0, 30), crossAt }, null, 1));
