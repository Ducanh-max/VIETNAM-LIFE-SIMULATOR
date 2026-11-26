import { bridgeEnds, streetRing, turtleIsland, type Point } from './geo';
import { LOTTE, lotteDoor } from './lotte';
import osmData from '../data/hoanKiemOsm.json';
import { baDinhFlagBase, buildings, deliverySpots, lakes, parks, RESTAURANT, restaurantToWorld, roads } from './osm';
import { places, roadsideNear } from './ride';
import { SHOPS, shopFront } from './shops';
import { RENTAL } from './rental';

/*
 * Place search for the phone's map and the Đen SM app: street names and named places from the OSM data,
 * plus the game's own places (the bún chả shop, the bike rental, Lotte, the lake's landmarks). Matching
 * ignores case and Vietnamese accents ("ho guom" finds "Hồ Gươm").
 */
export type SearchHit = { name: string; note: string; x: number; z: number };
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

let index: (SearchHit & { key: string })[] | null = null;
function curbNear(x: number, z: number): Point {
  let best: Point = [x, z]; let bd = 120;
  for (const s of deliverySpots) { const d = Math.hypot(s.p[0] - x, s.p[1] - z); if (d < bd) { bd = d; best = s.p; } }
  return best;
}
function build() {
  const list: SearchHit[] = [];
  const [rx, rz] = restaurantToWorld(0, RESTAURANT.depth / 2 + 2);
  list.push({ name: 'Bún chả Đức Anh', note: 'Quán ăn · phố Đinh Tiên Hoàng', x: rx, z: rz });
  list.push({ name: RENTAL.name, note: `Cho thuê xe máy, ô tô · ${RENTAL.street}`, x: RENTAL.x, z: RENTAL.z });
  if (LOTTE) { const [x, z] = lotteDoor(); list.push({ name: 'Lotte Center Hà Nội', note: '54 Liễu Giai · đài quan sát tầng 65', x, z }); }
  const away: Point = [bridgeEnds[0][0] - bridgeEnds[1][0], bridgeEnds[0][1] - bridgeEnds[1][1]]; const al = Math.hypot(away[0], away[1]);
  const gate: Point = [bridgeEnds[0][0] + (away[0] / al) * 6, bridgeEnds[0][1] + (away[1] / al) * 6];
  list.push({ name: 'Đền Ngọc Sơn', note: 'Qua cầu Thê Húc, hồ Hoàn Kiếm', x: gate[0], z: gate[1] });
  list.push({ name: 'Cầu Thê Húc', note: 'Hồ Hoàn Kiếm', x: gate[0], z: gate[1] });
  list.push({ name: 'Hồ Hoàn Kiếm (Hồ Gươm)', note: 'Bờ hồ, gần Tháp Rùa', x: gate[0], z: gate[1] });
  // Tháp Rùa stands on its island: guide to the nearest point of the lakeside promenade
  const tc: Point = [turtleIsland.reduce((s, p) => s + p[0], 0) / turtleIsland.length, turtleIsland.reduce((s, p) => s + p[1], 0) / turtleIsland.length];
  const shoreView = streetRing(4).reduce((b, p) => (Math.hypot(p[0] - tc[0], p[1] - tc[1]) < Math.hypot(b[0] - tc[0], b[1] - tc[1]) ? p : b));
  list.push({ name: 'Tháp Rùa', note: 'Ngắm từ bờ hồ gần nhất', x: shoreView[0], z: shoreView[1] });
  // landmarks of Ba Đình and Văn Miếu, Công viên Thủ Lệ, the eateries (the same places Đen SM drives to)
  if (baDinhFlagBase) { const [x, z] = roadsideNear(baDinhFlagBase[0], baDinhFlagBase[1]); list.push({ name: 'Quảng trường Ba Đình', note: 'Trước Lăng Bác · Đường Hùng Vương', x, z }); }
  for (const p of places()) list.push({ name: p.name, note: p.note, x: p.x, z: p.z });
  for (const s of SHOPS) { if (s.id === 'buncha') continue; const [x, z] = shopFront(s); list.push({ name: s.name, note: `${s.tagline} · ${s.street}`, x, z }); }
  const seen = new Set(list.map((h) => fold(h.name)));
  // named parks, lakes, temples, schools, museums… from OSM
  const centre = (r: Point[]): Point => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
  const areas: { n?: string; ring: Point[]; note: string }[] = [
    ...parks.map((p) => ({ n: p.name, ring: p.ring, note: 'Công viên · vườn hoa' })),
    ...lakes.map((l) => ({ n: l.name, ring: l.ring, note: 'Hồ nước' })),
    ...(((osmData as { compounds?: { p: number[][]; n?: string; k?: string }[] }).compounds) ?? []).map((c) => ({ n: c.n, ring: c.p as Point[], note: c.k === 'religious' ? 'Đền, chùa, nhà thờ' : c.k === 'school' || c.k === 'education' ? 'Trường học' : c.k === 'hospital' ? 'Bệnh viện' : 'Địa điểm' })),
  ];
  for (const a of areas) {
    if (!a.n || seen.has(fold(a.n))) continue;
    seen.add(fold(a.n));
    const c = centre(a.ring); const [x, z] = curbNear(c[0], c[1]);
    list.push({ name: a.n, note: a.note, x, z });
  }
  for (const b of buildings) {
    if (!b.name || seen.has(fold(b.name))) continue;
    seen.add(fold(b.name));
    const [x, z] = curbNear(b.center[0], b.center[1]);
    list.push({ name: b.name, note: b.kind ? `Địa điểm · ${b.kind}` : 'Địa điểm', x, z });
  }
  // streets: the middle of the longest stretch with that name
  const byName = new Map<string, { len: number; p: Point }>();
  for (const r of roads) {
    if (!r.name) continue;
    let len = 0; for (let i = 1; i < r.points.length; i++) len += Math.hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][1] - r.points[i - 1][1]);
    const cur = byName.get(r.name);
    if (!cur || len > cur.len) byName.set(r.name, { len, p: r.points[Math.floor(r.points.length / 2)] });
  }
  for (const [name, { p }] of byName) if (!seen.has(fold(name))) list.push({ name, note: 'Đường phố', x: p[0], z: p[1] });
  index = list.map((h) => ({ ...h, key: fold(h.name) }));
  return index;
}

/** Best matches for a query: names starting with it first, then containing all its words. */
export function searchPlaces(q: string, limit = 8): SearchHit[] {
  const f = fold(q); if (f.length < 2) return [];
  const words = f.split(/\s+/);
  const idx = index ?? build();
  const scored: [number, SearchHit][] = [];
  for (const h of idx) {
    const k = h.key; const bare = k.replace(/^(pho|duong|ngo|ngach) /, '');
    if (!words.every((w) => k.includes(w))) continue;
    const score = (k.startsWith(f) || bare.startsWith(f) ? 0 : 10) + (h.note === 'Đường phố' ? 2 : 0) + k.length / 100;
    scored.push([score, h]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map((s) => s[1]);
}
