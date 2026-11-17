import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../src/data/hoanKiem.json', import.meta.url), 'utf8'));
const metersPerLon = 111_320 * Math.cos(source.center.lat * Math.PI / 180);
const toMeters = ([lon, lat]) => [(lon - source.center.lon) * metersPerLon, -(lat - source.center.lat) * 111_320];
const [lake, jadeIsland, turtleIsland] = source.lake.coordinates.map((ring) => ring.map(toMeters));
const bounds = (points) => ({
  left: Math.min(...points.map(([x]) => x)), right: Math.max(...points.map(([x]) => x)),
  north: Math.min(...points.map(([, z]) => z)), south: Math.max(...points.map(([, z]) => z)),
});
const mean = (points) => points.reduce(([x, z], point) => [x + point[0] / points.length, z + point[1] / points.length], [0, 0]);
const bridge = source.landmarks['Cầu Thê Húc'][0].geojson.coordinates.map(toMeters);
const temple = mean(jadeIsland);
const turtle = mean(turtleIsland);
const b = bounds(lake);
const bridgeLength = Math.hypot(bridge[1][0] - bridge[0][0], bridge[1][1] - bridge[0][1]);

assert.equal(source.lake.type, 'Polygon');
assert.equal(source.lake.coordinates.length, 3, 'Expect lake shore and two islands');
assert.ok(b.south - b.north > 550 && b.south - b.north < 750, 'Lake should have a realistic north-south extent');
assert.ok(b.right - b.left > 200 && b.right - b.left < 350, 'Lake should have a realistic east-west extent');
assert.ok(temple[1] < turtle[1] - 250, 'Ngọc Sơn must be north of Tháp Rùa');
assert.ok(bridgeLength > 40 && bridgeLength < 55, 'Thê Húc bridge should be about 45m long');
assert.ok(Math.hypot(bridge[1][0] - temple[0], bridge[1][1] - temple[1]) < 30, 'Bridge should connect near Ngọc Sơn island');

console.log(`Map geometry OK — lake ${Math.round(b.south - b.north)}m × ${Math.round(b.right - b.left)}m, bridge ${bridgeLength.toFixed(1)}m.`);
