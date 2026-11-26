// Adds "rails" to src/data/hoanKiemOsm.json: OSM railway=rail ways (the north–south line past Ga Hà Nội and the
// brick viaduct along Phùng Hưng / Trần Nhật Duật towards Cầu Long Biên) with bridge / viaduct flags, and the
// level crossings (railway=level_crossing nodes) where they cross streets.
// Usage: node scripts/geo/fetch-railways.mjs   (also run by fetch-osm-hoan-kiem.mjs)
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../../src/data/hoanKiemOsm.json', import.meta.url);
const lake = JSON.parse(await readFile(new URL('../../src/data/hoanKiem.json', import.meta.url), 'utf8'));
const { lat: cLat, lon: cLon } = lake.center;
const mLon = 111_320 * Math.cos(cLat * Math.PI / 180);
const toLocal = ({ lat, lon }) => [+((lon - cLon) * mLon).toFixed(1), +(-(lat - cLat) * 111_320).toFixed(1)];
const data = JSON.parse(await readFile(file, 'utf8'));
const areas = data.bbox.split(' + ');
const query = `[out:json][timeout:120];(
${areas.map((a) => `way["railway"~"^(rail|light_rail|subway)$"](${a}); node["railway"~"^(level_crossing|crossing)$"](${a});`).join('\n')}
);out tags geom;`;
const endpoints = (process.env.OVERPASS ? [process.env.OVERPASS] : []).concat(['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']);
let res;
for (const url of endpoints) {
  try { const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'doi-viet-map-builder' } }); if (!r.ok) throw new Error(`${r.status}`); res = await r.json(); break; }
  catch (error) { console.warn(`${url} failed: ${error.message}`); }
}
if (!res) throw new Error('All Overpass endpoints failed');
const seen = new Set(); const rails = []; const crossings = [];
for (const el of res.elements) {
  if (seen.has(el.type + el.id)) continue; seen.add(el.type + el.id);
  const t = el.tags ?? {};
  if (el.type === 'node') { crossings.push(toLocal(el)); continue; }
  if (!el.geometry || el.geometry.length < 2) continue;
  rails.push({ p: el.geometry.map(toLocal), k: t.railway, b: t.bridge && t.bridge !== 'no' ? (t.bridge === 'viaduct' ? 'viaduct' : 'bridge') : undefined, l: t.layer ? +t.layer : undefined, n: t.name, g: t.gauge, s: t.service });
}
data.rails = rails; data.railCrossings = crossings;
await writeFile(file, JSON.stringify(data));
console.log(`rails ${rails.length} (${rails.filter((r) => r.b).length} on bridges/viaducts), level crossings ${crossings.length}`);
