// Repairs small topology faults in src/data/hoanKiemOsm.json after fetching (idempotent):
//  - a road that dead-ends less than 4 m short of another road is extended to touch it (gaps at junctions)
//  - duplicated segments (the same two nodes on two ways) are dropped from the later way
//  - two roads that cross without a shared node get a node inserted on both at the crossing point
// Usage: node scripts/geo/fix-roads.mjs   (also run by fetch-osm-hoan-kiem.mjs)
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../../src/data/hoanKiemOsm.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const vehicle = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian', 'trunk']);
const roads = data.roads.filter((r) => vehicle.has(r.h));
const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const r1 = (v) => Math.round(v * 10) / 10;

// node degree over all roads
const deg = new Map();
for (const r of roads) for (let i = 0; i < r.p.length; i++) { const k = key(r.p[i]); deg.set(k, (deg.get(k) ?? 0) + (i === 0 || i === r.p.length - 1 ? 1 : 2)); }

// segment index
const CELL = 20;
function buildIndex() {
  const grid = new Map(); const segs = [];
  for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) {
    const s = { r, i, a: r.p[i], b: r.p[i + 1] }; segs.push(s);
    const x0 = Math.floor(Math.min(s.a[0], s.b[0]) / CELL), x1 = Math.floor(Math.max(s.a[0], s.b[0]) / CELL);
    const z0 = Math.floor(Math.min(s.a[1], s.b[1]) / CELL), z1 = Math.floor(Math.max(s.a[1], s.b[1]) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = `${x},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  }
  return { grid, segs, near: (p) => grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? [] };
}
const proj = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)); return { t, q: [a[0] + t * dx, a[1] + t * dz] }; };

// 1) close gaps: snap dead ends onto the nearest other road within 4 m (inserting a node there)
let snapped = 0;
{
  const { near } = buildIndex();
  const inserts = new Map(); // road -> [{i, t, q}]
  for (const r of roads) for (const end of [0, r.p.length - 1]) {
    const p = r.p[end]; if ((deg.get(key(p)) ?? 0) !== 1) continue;
    let best = null;
    for (const s of near(p)) {
      if (s.r === r) continue;
      const { t, q } = proj(p, s.a, s.b); const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d > 0.05 && d < 4 && (!best || d < best.d)) best = { s, t, q, d };
    }
    if (!best) continue;
    const q = [r1(best.q[0]), r1(best.q[1])];
    if (end === 0) r.p.unshift(q); else r.p.push(q);
    if (best.t > 0.001 && best.t < 0.999) { const list = inserts.get(best.s.r) ?? []; list.push({ i: best.s.i, t: best.t, q }); inserts.set(best.s.r, list); }
    snapped++;
  }
  for (const [r, list] of inserts) { list.sort((a, b) => b.i - a.i || b.t - a.t); for (const { i, q } of list) r.p.splice(i + 1, 0, q); }
}

// 2) crossings without a node: add the crossing point to both roads
let crossed = 0;
{
  const { segs, near } = buildIndex();
  const cross = (p, q, r, s) => { const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-9) return null; const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d; const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d; return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98 ? { t, u } : null; };
  const inserts = new Map();
  const add = (r, i, t, q) => { const list = inserts.get(r) ?? []; list.push({ i, t, q }); inserts.set(r, list); };
  const seen = new Set();
  for (const s of segs) for (const o of new Set([...near(s.a), ...near(s.b)])) {
    if (o.r === s.r) continue;
    const id = s.r.p === o.r.p ? '' : [segs.indexOf(s), segs.indexOf(o)].sort().join(':'); if (seen.has(id)) continue; seen.add(id);
    // bridges/tunnels aren't in this extract; only join roads of the ground network
    const c = cross(s.a, s.b, o.a, o.b); if (!c) continue;
    const q = [r1(s.a[0] + (s.b[0] - s.a[0]) * c.t), r1(s.a[1] + (s.b[1] - s.a[1]) * c.t)];
    add(s.r, s.i, c.t, q); add(o.r, o.i, c.u, q); crossed++;
  }
  for (const [r, list] of inserts) { list.sort((a, b) => b.i - a.i || b.t - a.t); for (const { i, q } of list) r.p.splice(i + 1, 0, q); }
}

// 3) duplicated segments: drop the repeated stretch from the later way
let dups = 0;
for (const r of roads) r.p = r.p.filter((q, i) => i === 0 || key(q) !== key(r.p[i - 1])); // repeated points from inserts
{
  const seenSeg = new Set();
  for (const r of roads) {
    for (let i = 0; i < r.p.length - 1; i++) {
      const k = [key(r.p[i]), key(r.p[i + 1])].sort().join('|');
      if (seenSeg.has(k)) { // split the way here: keep what comes before, the rest is checked again
        dups++; const rest = r.p.slice(i + 1); r.p = r.p.slice(0, i + 1); if (rest.length >= 2) { const copy = { ...r, p: rest }; data.roads.push(copy); roads.push(copy); } break;
      }
      seenSeg.add(k);
    }
  }
  data.roads = data.roads.filter((r) => !vehicle.has(r.h) || r.p.length >= 2);
}
await writeFile(file, JSON.stringify(data));
console.log(`fix-roads: snapped ${snapped} dead ends, joined ${crossed} crossings, dropped ${dups} duplicates`);
