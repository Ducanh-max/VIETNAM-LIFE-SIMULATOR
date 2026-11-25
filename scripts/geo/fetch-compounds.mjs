// Adds "compounds" to src/data/hoanKiemOsm.json: OSM areas that are not rows of houses — temples and pagodas,
// schools, hospitals, barracks and government sites, museums, historic sites, squares, car parks, building sites.
// The game's filler houses (osm.ts, where OSM has no building footprints along a street) never go inside them.
// Usage: node scripts/geo/fetch-compounds.mjs   (also run by fetch-osm-hoan-kiem.mjs)
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../../src/data/hoanKiemOsm.json', import.meta.url);
const lake = JSON.parse(await readFile(new URL('../../src/data/hoanKiem.json', import.meta.url), 'utf8'));
const { lat: cLat, lon: cLon } = lake.center;
const mLon = 111_320 * Math.cos(cLat * Math.PI / 180);
const toLocal = ({ lat, lon }) => [+((lon - cLon) * mLon).toFixed(1), +(-(lat - cLat) * 111_320).toFixed(1)];
const data = JSON.parse(await readFile(file, 'utf8'));
const areas = data.bbox.split(' + ');
const query = `[out:json][timeout:200];(
${areas.map((a) => `way["landuse"~"^(religious|military|education|government|cemetery|construction|railway)$"](${a}); way["amenity"~"^(school|university|college|kindergarten|hospital|place_of_worship|parking)$"][!"building"](${a}); way["historic"][!"building"](${a}); way["tourism"~"^(museum|attraction)$"][!"building"](${a}); way["place"="square"](${a});`).join('\n')}
);out tags geom;`;
const endpoints = (process.env.OVERPASS ? [process.env.OVERPASS] : []).concat(['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']);
let res;
for (const url of endpoints) {
  try {
    const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'doi-viet-map-builder' } });
    if (!r.ok) throw new Error(`${r.status}`);
    res = await r.json(); break;
  } catch (error) { console.warn(`${url} failed: ${error.message}`); }
}
if (!res) throw new Error('All Overpass endpoints failed');
const seen = new Set();
const compounds = [];
for (const el of res.elements) {
  if (el.type !== 'way' || !el.geometry || seen.has(el.id) || el.tags?.highway) continue;
  seen.add(el.id);
  let p = el.geometry.map(toLocal);
  if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p = p.slice(0, -1);
  if (p.length < 3) continue;
  const t = el.tags ?? {};
  compounds.push({ p, n: t.name, k: t.landuse ?? t.amenity ?? t.historic ?? t.tourism ?? t.place });
}
data.compounds = compounds;
await writeFile(file, JSON.stringify(data));
console.log(`compounds ${compounds.length}`);
