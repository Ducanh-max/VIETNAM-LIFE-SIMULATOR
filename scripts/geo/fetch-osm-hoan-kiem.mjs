// Fetches streets and building footprints around Hồ Hoàn Kiếm from OpenStreetMap (Overpass API)
// and writes them, projected to local metres, to src/data/hoanKiemOsm.json.
// Usage: node scripts/geo/fetch-osm-hoan-kiem.mjs
import { readFile, writeFile } from 'node:fs/promises';

const lake = JSON.parse(await readFile(new URL('../../src/data/hoanKiem.json', import.meta.url), 'utf8'));
const { lat: cLat, lon: cLon } = lake.center;
const mLon = 111_320 * Math.cos(cLat * Math.PI / 180);
const toLocal = ({ lat, lon }) => [(lon - cLon) * mLon, -(lat - cLat) * 111_320];

const bbox = '21.0215,105.8445,21.0362,105.8605';
const query = `[out:json][timeout:120];(
  way["highway"](${bbox});
  way["building"](${bbox});
  way["leisure"~"park|garden"](${bbox});
);out geom tags;`;

const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let data;
for (const url of endpoints) {
  try {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'doi-viet-map-builder' } });
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
    break;
  } catch (error) { console.warn(`${url} failed: ${error.message}`); }
}
if (!data) throw new Error('All Overpass endpoints failed');

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bestD = sq;
    const [ax, az] = points[a]; const [bx, bz] = points[b];
    const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz || 1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((points[i][0] - ax) * dx + (points[i][1] - az) * dz) / len));
      const ex = points[i][0] - ax - t * dx, ez = points[i][1] - az - t * dz;
      const d = ex * ex + ez * ez;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
const round = (p, step) => [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step].map((v) => +v.toFixed(1));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

const skip = new Set(['steps', 'corridor', 'elevator', 'proposed', 'construction', 'platform', 'bus_stop']);
const roads = [];
const buildings = [];
const parks = [];
for (const el of data.elements) {
  if (el.type !== 'way' || !el.geometry) continue;
  const t = el.tags ?? {};
  const pts = el.geometry.map(toLocal);
  if (t.highway && !skip.has(t.highway) && t.area !== 'yes') {
    const p = simplify(pts, 0.8).map((q) => round(q, 0.1));
    if (p.length < 2) continue;
    roads.push({ n: t.name ?? '', h: t.highway, l: num(t.lanes), o: t.oneway === 'yes' ? 1 : undefined, w: num(t.width), p });
  } else if (t.building) {
    let p = simplify(pts, 0.7).map((q) => round(q, 0.5));
    if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p = p.slice(0, -1);
    if (p.length < 3) continue;
    buildings.push({ p, lv: num(t['building:levels']), h: num(t.height), n: t.name, k: t.building === 'yes' ? undefined : t.building });
  } else if (t.leisure) {
    let p = simplify(pts, 1).map((q) => round(q, 0.5));
    if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p = p.slice(0, -1);
    if (p.length >= 3) parks.push({ p, n: t.name });
  }
}
const out = { source: 'OpenStreetMap contributors (ODbL 1.0)', fetched: new Date().toISOString().slice(0, 10), bbox, roads, buildings, parks };
await writeFile(new URL('../../src/data/hoanKiemOsm.json', import.meta.url), JSON.stringify(out));
console.log(`roads ${roads.length}, buildings ${buildings.length}, parks ${parks.length}`);
