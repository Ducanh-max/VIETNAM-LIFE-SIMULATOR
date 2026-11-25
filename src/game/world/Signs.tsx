import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { distanceToShore, GROUND_HEIGHT, type Point } from '../geo';
import { insideBuilding, osmNodes, roadClearance, roads, type Road } from '../osm';
import { TOWER, toTower } from '../lotte';
import { Instances, trs, unitBox, unitCylinder } from './Instances';

/*
 * Traffic signs and signals after QCVN 41:2024/BGTVT, drawn as simple low-poly panels:
 *   P.102 Cấm đi ngược chiều (at the far end of every one-way street), I.407a Đường một chiều (at its start),
 *   P.127 Tốc độ tối đa (OSM maxspeed, else 50 km/h on main streets and 40 km/h in town streets),
 *   P.131a Cấm đỗ xe (along main streets), W.224 Người đi bộ cắt ngang (at OSM crossings on main streets),
 *   P.103a Cấm xe ô tô (at the ends of pedestrian streets), P.123a/b Cấm rẽ trái/phải (at some signalised
 *   junctions), blue street-name blades at both ends of named streets, and traffic lights at every OSM
 *   traffic_signals node, cycling green → yellow → red with crossing directions in opposite phase.
 * All sign faces are one merged mesh with a texture atlas (one draw call), name blades another, poles and
 * signal housings are instanced, and lamp colours are updated a few times a second.
 */
type Icon = 'noEntry' | 'oneway' | 'speed30' | 'speed40' | 'speed50' | 'speed60' | 'noParking' | 'pedestrian' | 'noCar' | 'noLeft' | 'noRight';
const ICONS: Icon[] = ['noEntry', 'oneway', 'speed30', 'speed40', 'speed50', 'speed60', 'noParking', 'pedestrian', 'noCar', 'noLeft', 'noRight'];
const CELL = 128;

function drawIcon(ctx: CanvasRenderingContext2D, icon: Icon, x: number, y: number) {
  const c = x + CELL / 2, m = y + CELL / 2, r = CELL / 2 - 6;
  const ring = (fill: string) => { ctx.fillStyle = '#d4202a'; ctx.beginPath(); ctx.arc(c, m, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(c, m, r * 0.78, 0, Math.PI * 2); ctx.fill(); };
  const slash = () => { ctx.strokeStyle = '#d4202a'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(c - r * 0.55, m - r * 0.55); ctx.lineTo(c + r * 0.55, m + r * 0.55); ctx.stroke(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (icon === 'noEntry') { ctx.fillStyle = '#d4202a'; ctx.beginPath(); ctx.arc(c, m, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(c - r * 0.7, m - r * 0.16, r * 1.4, r * 0.32); return; }
  if (icon === 'oneway') {
    ctx.fillStyle = '#1257b8'; ctx.fillRect(x + 8, y + 8, CELL - 16, CELL - 16); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(x + 12, y + 12, CELL - 24, CELL - 24);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(c, y + 22); ctx.lineTo(c + 26, y + 52); ctx.lineTo(c + 10, y + 52); ctx.lineTo(c + 10, y + 106); ctx.lineTo(c - 10, y + 106); ctx.lineTo(c - 10, y + 52); ctx.lineTo(c - 26, y + 52); ctx.closePath(); ctx.fill(); return;
  }
  if (icon.startsWith('speed')) { ring('#fff'); ctx.fillStyle = '#111'; ctx.font = 'bold 50px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon.slice(5), c, m + 3); return; }
  if (icon === 'noParking') { ring('#1257b8'); slash(); return; }
  if (icon === 'pedestrian') {
    ctx.fillStyle = '#d4202a'; ctx.beginPath(); ctx.moveTo(c, y + 8); ctx.lineTo(x + CELL - 8, y + CELL - 14); ctx.lineTo(x + 8, y + CELL - 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f7c600'; ctx.beginPath(); ctx.moveTo(c, y + 26); ctx.lineTo(x + CELL - 24, y + CELL - 24); ctx.lineTo(x + 24, y + CELL - 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(c + 2, y + 52, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(c + 1, y + 60); ctx.lineTo(c - 3, y + 80); ctx.lineTo(c - 12, y + 96); ctx.moveTo(c - 3, y + 80); ctx.lineTo(c + 9, y + 96); ctx.moveTo(c - 10, y + 70); ctx.lineTo(c + 12, y + 68); ctx.stroke();
    ctx.fillStyle = '#111'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 36 + i * 15, y + 100, 9, 4); return;
  }
  if (icon === 'noCar') {
    ring('#fff'); ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.moveTo(c - 30, m + 10); ctx.lineTo(c - 26, m - 4); ctx.lineTo(c - 14, m - 16); ctx.lineTo(c + 14, m - 16); ctx.lineTo(c + 26, m - 4); ctx.lineTo(c + 30, m + 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(c - 17, m + 12, 7, 0, Math.PI * 2); ctx.arc(c + 17, m + 12, 7, 0, Math.PI * 2); ctx.fill(); slash(); return;
  }
  // no left / right turn: black bent arrow, red slash
  ring('#fff'); const s = icon === 'noLeft' ? -1 : 1;
  ctx.strokeStyle = '#111'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(c - s * 4, m + 30); ctx.lineTo(c - s * 4, m - 4); ctx.quadraticCurveTo(c - s * 4, m - 14, c + s * 8, m - 14); ctx.lineTo(c + s * 18, m - 14); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(c + s * 30, m - 14); ctx.lineTo(c + s * 16, m - 28); ctx.lineTo(c + s * 16, m); ctx.closePath(); ctx.fill(); slash();
}

const atlas = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d')!;
  ICONS.forEach((icon, i) => drawIcon(ctx, icon, (i % 8) * CELL, Math.floor(i / 8) * CELL));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
const iconUV = (icon: Icon) => { const i = ICONS.indexOf(icon); return [(i % 8) / 8, 1 - (Math.floor(i / 8) + 1) / 2, ((i % 8) + 1) / 8, 1 - Math.floor(i / 8) / 2]; };

type Placed = { p: Point; face: Point; icon?: Icon; name?: string; h?: number };
const len = (r: Road) => r.points.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - r.points[i - 1][0], p[1] - r.points[i - 1][1]) : 0), 0);
const unit = (a: Point, b: Point): Point => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const right = (d: Point): Point => [-d[1], d[0]]; // x east, z south: right-hand side of travel direction d
/** Point at distance s along a road and the travel direction there. */
function along(r: Road, s: number): { p: Point; d: Point } {
  let acc = 0;
  for (let i = 0; i < r.points.length - 1; i++) {
    const a = r.points[i], b = r.points[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s) { const t = (s - acc) / (l || 1); return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: unit(a, b) }; }
    acc += l;
  }
  const n = r.points.length; return { p: r.points[n - 1], d: unit(r.points[n - 2], r.points[n - 1]) };
}
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link']);
const TOWN = new Set([...MAIN, 'residential', 'unclassified']);
const speedIcon = (r: Road): Icon => { const v = r.maxspeed ?? (['trunk', 'primary', 'secondary'].includes(r.kind) ? 50 : 40); return v <= 30 ? 'speed30' : v <= 40 ? 'speed40' : v <= 50 ? 'speed50' : 'speed60'; };

/** Where every sign goes (computed once). */
function layout() {
  const signs: Placed[] = []; const blades: Placed[] = [];
  // a sign for traffic moving in direction d at point p: on the right-hand verge, facing the oncoming driver
  // Signs go on the pavement: at least 0.6 m outside every carriageway (including crossing streets) and not
  // inside a building. Try the right-hand verge, a little further out, then a few metres along the road.
  // the driveway and drop-off in front of Lotte's entrance: no sign posts standing in it
  const lotteForecourt = (q: Point) => { const [u, v] = toTower(q); return u > TOWER.halfU - 1 && u < TOWER.halfU + 30 && Math.abs(v) < 14; };
  const spot = (p: Point, d: Point, n: Point, o: number): Point | null => {
    audit.total++;
    if (roadClearance([p[0] + n[0] * o, p[1] + n[1] * o]) < 0.3) audit.oldInRoad++; // where the old rule put it
    for (const along of [0, -3, 3, -6, 6, -10]) for (const extra of [0, 0.6, 1.2, 2]) {
      const q: Point = [p[0] + d[0] * along + n[0] * (o + extra), p[1] + d[1] * along + n[1] * (o + extra)];
      if (roadClearance(q) >= 0.6 && !insideBuilding(q, 0.2) && distanceToShore(q) > 1 && !lotteForecourt(q)) return q;
    }
    audit.skipped++;
    return null;
  };
  const put = (r: Road, p: Point, d: Point, icon: Icon, h = 2.3) => { const n = right(d); const q = spot(p, d, n, r.width / 2 + 0.7); if (q) signs.push({ p: q, face: [-d[0], -d[1]], icon, h }); };
  for (const r of roads) {
    if (r.points.length < 2) continue;
    const L = len(r);
    if (r.kind === 'pedestrian') {
      if (L > 20) { const a = along(r, 4), b = along(r, L - 4); put(r, a.p, a.d, 'noCar'); put(r, b.p, [-b.d[0], -b.d[1]], 'noCar'); }
      continue;
    }
    if (!TOWN.has(r.kind)) continue;
    if (r.oneway && L > 25) {
      const a = along(r, Math.min(L / 2, 10)); put(r, a.p, a.d, 'oneway');
      const b = along(r, Math.max(L / 2, L - 9)); put(r, b.p, [-b.d[0], -b.d[1]], 'noEntry'); // drivers coming the wrong way at the far end (back from the junction)
    }
    if (L > 110) for (let s = 30; s < L - 20; s += 320) {
      const a = along(r, s); put(r, a.p, a.d, speedIcon(r), 2.2);
      if (!r.oneway) { const b = along(r, L - s); put(r, b.p, [-b.d[0], -b.d[1]], speedIcon(r), 2.2); }
    }
    if (MAIN.has(r.kind) && L > 150) for (let s = 110; s < L - 40; s += 260) { const a = along(r, s); put(r, a.p, a.d, 'noParking', 2.1); }
    if (r.name && L > 45) for (const s of [6, L - 6]) {
      const a = along(r, s); const n = right(a.d); const q = spot(a.p, a.d, n, r.width / 2 + 1.0);
      if (q) blades.push({ p: q, face: n, name: r.name, h: 2.9 });
    }
  }
  // OSM crossings and signals: find the street through each node
  const nearestRoad = (p: Point) => {
    let best: { r: Road; d: Point; dist: number } | null = null;
    for (const r of roads) {
      if (!TOWN.has(r.kind)) continue;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        if (Math.min(a[0], b[0]) - 12 > p[0] || Math.max(a[0], b[0]) + 12 < p[0] || Math.min(a[1], b[1]) - 12 > p[1] || Math.max(a[1], b[1]) + 12 < p[1]) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
        const dist = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
        if (dist < 6 && (!best || dist < best.dist)) best = { r, d: unit(a, b), dist };
      }
    }
    return best;
  };
  const lights: { p: Point; face: Point; phase: number }[] = [];
  osmNodes.forEach((n, k) => {
    const hit = nearestRoad(n.p); if (!hit) return;
    const { r, d } = hit;
    if (n.kind === 'crossing') {
      if (!MAIN.has(r.kind)) return;
      put(r, [n.p[0] - d[0] * 12, n.p[1] - d[1] * 12], d, 'pedestrian', 2.2);
      if (!r.oneway) put(r, [n.p[0] + d[0] * 12, n.p[1] + d[1] * 12], [-d[0], -d[1]], 'pedestrian', 2.2);
    } else if (n.kind === 'traffic_signals') {
      // signals for each approach; the two axes of a junction alternate (half a cycle apart)
      const axis = (Math.atan2(d[0], d[1]) + Math.PI) % Math.PI < Math.PI / 2 ? 0 : 0.5;
      const cluster = Math.sin(Math.round(n.p[0] / 40) * 12.9 + Math.round(n.p[1] / 40) * 78.2) * 0.5 + 0.5;
      for (const dir of r.oneway ? [d] : [d, [-d[0], -d[1]] as Point]) {
        const nn = right(dir); const q = spot([n.p[0] - dir[0] * 3, n.p[1] - dir[1] * 3], [-dir[0], -dir[1]], nn, r.width / 2 + 0.6);
        if (q) lights.push({ p: q, face: [-dir[0], -dir[1]], phase: (cluster + axis) % 1 });
      }
      if (k % 7 === 0) put(r, [n.p[0] - d[0] * 18, n.p[1] - d[1] * 18], d, k % 2 ? 'noLeft' : 'noRight', 2.2);
    }
  });
  // automated check: posts inside any carriageway (must be 0)
  for (const s of [...signs, ...blades]) if (roadClearance(s.p) < 0.3) audit.inRoad++;
  for (const l of lights) if (roadClearance(l.p) < 0.3) audit.inRoad++;
  return { signs, blades, lights };
}
const audit = { skipped: 0, inRoad: 0, oldInRoad: 0, total: 0 };

/** Merged quads facing `face` (double-sided for blades), with UVs into an atlas. */
function quads(items: { p: Point; face: Point; h: number; w: number; hgt: number; uv: number[]; both?: boolean }[]) {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  for (const it of items) {
    const [fx, fz] = it.face; const sx = -fz, sz = fx; // across the face
    const y0 = GROUND_HEIGHT + it.h - it.hgt / 2, y1 = y0 + it.hgt;
    const hw = it.w / 2;
    const [u0, v0, u1, v1] = it.uv;
    const sides = it.both ? [1, -1] : [1];
    for (const s of sides) {
      const ox = it.p[0] + fx * 0.03 * s, oz = it.p[1] + fz * 0.03 * s;
      // texture left on the viewer's left (the viewer looks along −face)
      const ax = ox + sx * hw * s, az = oz + sz * hw * s, bx = ox - sx * hw * s, bz = oz - sz * hw * s;
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      for (let i = 0; i < 6; i++) nor.push(fx * s, 0, fz * s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

/** Name blades: the street names are drawn into an atlas of 400×64 px cells. */
function nameAtlas(names: string[]) {
  const cols = 5, cw = 400, ch = 64;
  const rows = Math.ceil(names.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cw; c.height = Math.max(64, rows * ch);
  const ctx = c.getContext('2d')!;
  const index = new Map<string, number[]>();
  names.forEach((name, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    ctx.fillStyle = '#1257b8'; ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px "Be Vietnam Pro", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.replace(/^Phố |^Đường /, '').toUpperCase(), x + cw / 2, y + ch / 2 + 1, cw - 24);
    index.set(name, [x / c.width, 1 - (y + ch) / c.height, (x + cw) / c.width, 1 - y / c.height]);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { texture: t, index };
}

const CYCLE = 30; // s: green 13, yellow 3, red 14
const LAMP = { red: new THREE.Color('#ff2a1a'), yellow: new THREE.Color('#ffc21a'), green: new THREE.Color('#1fe06a'), off: new THREE.Color('#2a2b2e') };

export function Signs() {
  const data = useMemo(() => {
    const { signs, blades, lights } = layout();
    const faces = quads(signs.map((s) => ({ p: s.p, face: s.face, h: s.h ?? 2.3, w: s.icon === 'oneway' ? 0.62 : 0.62, hgt: 0.62, uv: iconUV(s.icon!) })));
    const names = [...new Set(blades.map((b) => b.name!))];
    const atlasN = nameAtlas(names);
    const bladeGeo = quads(blades.map((b) => ({ p: b.p, face: b.face, h: b.h ?? 2.9, w: 1.25, hgt: 0.2, uv: atlasN.index.get(b.name!)!, both: true })));
    const poles = [...signs.map((s) => trs(s.p[0] - s.face[0] * 0.05, GROUND_HEIGHT + ((s.h ?? 2.3) - 0.31) / 2, s.p[1] - s.face[1] * 0.05, 0, 0.06, (s.h ?? 2.3) - 0.31, 0.06)),
      ...blades.map((b) => trs(b.p[0], GROUND_HEIGHT + (b.h ?? 2.9) / 2, b.p[1], 0, 0.07, (b.h ?? 2.9) + 0.1, 0.07)),
      ...lights.map((l) => trs(l.p[0], GROUND_HEIGHT + 1.6, l.p[1], 0, 0.11, 3.2, 0.11))];
    const housings = lights.map((l) => trs(l.p[0] + l.face[0] * 0.12, GROUND_HEIGHT + 3.25, l.p[1] + l.face[1] * 0.12, Math.atan2(l.face[0], l.face[1]), 0.3, 0.86, 0.22));
    const counts: Record<string, number> = {};
    for (const s of signs) counts[s.icon!] = (counts[s.icon!] ?? 0) + 1;
    counts.streetName = blades.length; counts.trafficLights = lights.length; counts.postsInRoad = audit.inRoad; counts.skippedNoRoom = audit.skipped; counts.oldRuleInRoad = audit.oldInRoad; counts.placementsTried = audit.total;
    if (import.meta.env.DEV) (window as unknown as { __signs?: unknown }).__signs = { counts, lights, signs };
    return { faces, bladeGeo, nameTex: atlasN.texture, poles, housings, lights };
  }, []);
  const mats = useMemo(() => ({
    face: new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    blade: new THREE.MeshStandardMaterial({ map: data.nameTex, roughness: 0.6 }),
    pole: new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.5, metalness: 0.5 }),
    housing: new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.6 }),
    lamp: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  }), [data]);
  // lamps: 3 per head (red top, yellow, green bottom), colours updated from the cycle
  const lamps = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.CircleGeometry(0.085, 12), mats.lamp, data.lights.length * 3);
    data.lights.forEach((l, i) => {
      for (let k = 0; k < 3; k++) {
        const mat = new THREE.Matrix4().compose(new THREE.Vector3(l.p[0] + l.face[0] * 0.235, GROUND_HEIGHT + 3.52 - k * 0.27, l.p[1] + l.face[1] * 0.235), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(l.face[0], l.face[1]), 0)), new THREE.Vector3(1, 1, 1));
        m.setMatrixAt(i * 3 + k, mat); m.setColorAt(i * 3 + k, LAMP.off);
      }
    });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    return m;
  }, [data, mats]);
  const tick = useRef(0);
  useFrame((state, dt) => {
    tick.current -= dt; if (tick.current > 0) return; tick.current = 0.25;
    const t = state.clock.elapsedTime;
    data.lights.forEach((l, i) => {
      const u = ((t / CYCLE + l.phase) % 1) * CYCLE;
      const on = u < 13 ? 2 : u < 16 ? 1 : 0; // 2 green, 1 yellow, 0 red
      lamps.setColorAt(i * 3, on === 0 ? LAMP.red : LAMP.off);
      lamps.setColorAt(i * 3 + 1, on === 1 ? LAMP.yellow : LAMP.off);
      lamps.setColorAt(i * 3 + 2, on === 2 ? LAMP.green : LAMP.off);
    });
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  });
  return <group>
    <mesh geometry={data.faces} material={mats.face} />
    <mesh geometry={data.bladeGeo} material={mats.blade} />
    <Instances geometry={unitCylinder} material={mats.pole} matrices={data.poles} castShadow={false} />
    <Instances geometry={unitBox} material={mats.housing} matrices={data.housings} castShadow={false} />
    <primitive object={lamps} />
  </group>;
}
