// Fetches streets and building footprints around Hồ Hoàn Kiếm from OpenStreetMap (Overpass API)
// and writes them, projected to local metres, to src/data/hoanKiemOsm.json.
// Usage: node scripts/geo/fetch-osm-hoan-kiem.mjs
import { readFile, writeFile } from 'node:fs/promises';

const lake = JSON.parse(await readFile(new URL('../../src/data/hoanKiem.json', import.meta.url), 'utf8'));
const { lat: cLat, lon: cLon } = lake.center;
const mLon = 111_320 * Math.cos(cLat * Math.PI / 180);
const toLocal = ({ lat, lon }) => [(lon - cLon) * mLon, -(lat - cLat) * 111_320];

// Hồ Gươm, the whole old quarter up to Đồng Xuân market, the French quarter (Tràng Tiền, Nhà hát Lớn, Hai Bà Trưng,
// Bà Triệu, Hàng Bài) and Nhà thờ Lớn / Lý Quốc Sư to the west: about ±1.3 km around the lake centre.
const bbox = '21.0175,105.8405,21.0405,105.8645';
// Plus a corridor west to Lotte Center Hà Nội (54 Liễu Giai) along Tràng Thi, Điện Biên Phủ, Nguyễn Thái Học, Kim Mã and Liễu Giai.
const corridor = '21.0255,105.8090,21.0355,105.8405';
// Ba Đình: Quảng trường Ba Đình, Lăng Chủ tịch Hồ Chí Minh, Phủ Chủ tịch, Chùa Một Cột, Hoàng thành Thăng Long (Đoan Môn).
const baDinh = '21.0300,105.8300,21.0405,105.8405';
// Công viên Thủ Lệ (the zoo and Hồ Thủ Lệ) west of Lotte, between Kim Mã, Đào Tấn and Đường Bưởi.
const thuLe = '21.0270,105.8015,21.0350,105.8090';
const areas = [bbox, corridor, baDinh, thuLe];
const query = `[out:json][timeout:300];(
${areas.map((a) => `  way["highway"](${a}); way["building"](${a}); way["leisure"~"park|garden"](${a}); way["tourism"="zoo"](${a});
  way["natural"="water"](${a}); relation["natural"="water"](${a}); way["landuse"="grass"](${a});
  node["highway"~"^(traffic_signals|stop|give_way|crossing)$"](${a});`).join(String.fromCharCode(10))}
);out body geom;`;

const endpoints = (process.env.OVERPASS ? [process.env.OVERPASS] : []).concat(['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']);
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

/** Douglas–Peucker; vertices flagged in `fixed` (nodes shared with other ways: junctions) are always kept. */
function simplify(points, tolerance, fixed) {
  if (points.length < 3) return points;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  if (fixed) fixed.forEach((f, i) => { if (f) keep[i] = 1; });
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

// how many ways use each node: junction nodes must survive simplification so streets stay connected
const uses = new Map();
for (const el of data.elements) if (el.type === 'way' && el.tags?.highway && el.nodes) for (const n of new Set(el.nodes)) uses.set(n, (uses.get(n) ?? 0) + 1);
const seenWays = new Set();
const skip = new Set(['steps', 'corridor', 'elevator', 'proposed', 'construction', 'platform', 'bus_stop']);
const roads = [];
const buildings = [];
const parks = [];
// lakes and ponds other than Hồ Gươm (Hồ Thủ Lệ, Hồ Văn, Hồ Văn Chương, the pond of Chùa Một Cột…)
const water = [];
// lawns (the 210 grass squares of Quảng trường Ba Đình are mapped as landuse=grass)
const grass = [];
/** Joins a multipolygon relation's outer (or inner) member ways into closed rings. */
function stitch(members, inner = false) {
  const segs = members.filter((m) => m.type === 'way' && (m.role === 'inner') === inner && m.geometry).map((m) => m.geometry.map(toLocal));
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    for (let guard = 0; guard < 200 && segs.length; guard++) {
      const end = ring.at(-1); const near = (p) => Math.hypot(p[0] - end[0], p[1] - end[1]) < 0.5;
      const i = segs.findIndex((g) => near(g[0]) || near(g.at(-1)));
      if (i < 0) break;
      const g = segs.splice(i, 1)[0];
      ring = ring.concat(near(g[0]) ? g.slice(1) : g.slice().reverse().slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
const closed = (pts, tol) => { let p = simplify(pts, tol).map((q) => round(q, 0.5)); if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p = p.slice(0, -1); return p.length >= 3 ? p : null; };
// traffic signals, stop / give-way signs and pedestrian crossings mapped as nodes
const nodes = [];
const seenNodes = new Set();
for (const el of data.elements) {
  if (el.type !== 'node' || seenNodes.has(el.id) || !el.tags?.highway) continue;
  seenNodes.add(el.id);
  nodes.push({ t: el.tags.highway, p: round(toLocal(el), 0.1) });
}
const seenRel = new Set();
for (const el of data.elements) {
  if (el.type !== 'relation' || seenRel.has(el.id) || !el.members) continue;
  seenRel.add(el.id);
  // islands (inner rings) go with the outer ring that contains them
  const holes = stitch(el.members, true).map((r) => closed(r, 0.7)).filter(Boolean);
  const inside = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (const ring of stitch(el.members)) { const p = closed(ring, 1); if (!p) continue; const h = holes.filter((q) => inside(q[0], p)); water.push(h.length ? { p, h, n: el.tags?.name } : { p, n: el.tags?.name }); }
}
for (const el of data.elements) {
  if (el.type !== 'way' || !el.geometry || seenWays.has(el.id)) continue;
  seenWays.add(el.id);
  const t = el.tags ?? {};
  const pts = el.geometry.map(toLocal);
  if (t.highway && !skip.has(t.highway) && t.area !== 'yes') {
    const fixed = el.nodes ? el.nodes.map((n) => (uses.get(n) ?? 0) > 1) : null;
    const p = simplify(pts, 0.8, fixed).map((q) => round(q, 0.1));
    if (p.length < 2) continue;
    roads.push({ n: t.name ?? '', h: t.highway, l: num(t.lanes), o: t.oneway === 'yes' ? 1 : t.oneway === '-1' ? -1 : undefined, w: num(t.width), ms: num(t.maxspeed), p });
  } else if (t.building) {
    let p = simplify(pts, 0.7).map((q) => round(q, 0.5));
    if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p = p.slice(0, -1);
    if (p.length < 3) continue;
    buildings.push({ p, lv: num(t['building:levels']), h: num(t.height), n: t.name, k: t.building === 'yes' ? undefined : t.building });
  } else if (t.natural === 'water') {
    const p = closed(pts, 1); if (p) water.push({ p, n: t.name });
  } else if (t.landuse === 'grass') {
    const p = closed(pts, 0.5); if (p) grass.push({ p, n: t.name });
  } else if (t.leisure || t.tourism === 'zoo') {
    let p = simplify(pts, 1).map((q) => round(q, 0.5));
    if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p = p.slice(0, -1);
    if (p.length >= 3) parks.push({ p, n: t.name });
  }
}
const out = { source: 'OpenStreetMap contributors (ODbL 1.0)', fetched: new Date().toISOString().slice(0, 10), bbox: areas.join(' + '), roads, buildings, parks, water, grass, nodes };
await writeFile(new URL('../../src/data/hoanKiemOsm.json', import.meta.url), JSON.stringify(out));
console.log(`roads ${roads.length}, buildings ${buildings.length}, parks ${parks.length}, water ${water.length}, grass ${grass.length}, nodes ${nodes.length} (${[...new Set(nodes.map((n) => n.t))].map((k) => `${k} ${nodes.filter((n) => n.t === k).length}`).join(', ')})`);
await import("./fix-roads.mjs");
await import("./fetch-compounds.mjs");
