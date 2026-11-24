import { shore, templeIsland, turtleIsland, type Point } from '../game/geo';
import { nav } from '../game/navigation';
import { buildings, parks, RESTAURANT, roads } from '../game/osm';
import { player, view } from '../game/state';

/*
 * The district map, drawn once from the OSM data into an offscreen canvas (north up, 1.25 px per metre),
 * then blitted with pan / zoom / rotation by the minimap and the phone's map app, with the live route,
 * the destination, the shop and the player arrow drawn on top.
 */
const MIN = -820;
const SPAN = 1640;
const S = 1.25; // px per metre in the base image
let base: HTMLCanvasElement | null = null;

const majorKinds = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
function drawPoly(ctx: CanvasRenderingContext2D, ring: Point[]) {
  ctx.beginPath();
  ring.forEach(([x, z], i) => { const px = (x - MIN) * S, py = (z - MIN) * S; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.closePath();
}

export function mapBase() {
  if (base) return base;
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(SPAN * S);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ece6d8'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#b9d99a'; for (const p of parks) { drawPoly(ctx, p.ring); ctx.fill(); }
  // streets: casing then fill, minor first
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sorted = [...roads].sort((a, b) => a.width - b.width);
  for (const pass of [0, 1]) for (const r of sorted) {
    ctx.strokeStyle = pass ? (majorKinds.has(r.kind) ? '#fff6dc' : '#ffffff') : '#c9bfae';
    ctx.lineWidth = Math.max(2, r.width * S) + (pass ? 0 : 2);
    ctx.beginPath();
    r.points.forEach(([x, z], i) => { const px = (x - MIN) * S, py = (z - MIN) * S; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
  }
  ctx.fillStyle = '#d6cdbd'; ctx.strokeStyle = '#bfb5a3'; ctx.lineWidth = 0.6;
  for (const b of buildings) { drawPoly(ctx, b.ring); ctx.fill(); ctx.stroke(); }
  // Hồ Gươm with its islands
  ctx.fillStyle = '#7fc1d6'; drawPoly(ctx, shore); ctx.fill();
  ctx.strokeStyle = '#5a9fb6'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#9fcf84'; for (const isl of [templeIsland, turtleIsland]) { drawPoly(ctx, isl); ctx.fill(); }
  ctx.fillStyle = '#2f6f86'; ctx.font = 'italic 600 22px "Be Vietnam Pro", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Hồ Hoàn Kiếm', (0 - MIN) * S, (60 - MIN) * S);
  ctx.font = '600 12px "Be Vietnam Pro", Arial'; ctx.fillStyle = '#7a2d1a';
  ctx.fillText('Đền Ngọc Sơn', (templeIsland[0][0] - MIN) * S, (templeIsland[0][1] - 18 - MIN) * S);
  // street names along the bigger streets, once per street
  const seen = new Map<string, Point[]>();
  ctx.font = '600 11px "Be Vietnam Pro", Arial';
  for (const r of [...roads].sort((a, b) => b.width - a.width)) {
    if (!r.name || r.kind === 'service' || r.points.length < 2) continue;
    let len = 0; for (let i = 1; i < r.points.length; i++) len += Math.hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][1] - r.points[i - 1][1]);
    if (len < 70) continue;
    const mid = Math.floor((r.points.length - 1) / 2);
    const a = r.points[mid], b = r.points[mid + 1];
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    const placed = seen.get(r.name) ?? [];
    if (placed.some((p) => Math.hypot(p[0] - cx, p[1] - cz) < 220)) continue;
    placed.push([cx, cz]); seen.set(r.name, placed);
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const label = r.name.replace(/^Phố /, '').replace(/^Đường /, '');
    ctx.save(); ctx.translate((cx - MIN) * S, (cz - MIN) * S); ctx.rotate(ang);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(label, 0, 0);
    ctx.fillStyle = '#4a4036'; ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  base = c;
  return c;
}

export type MapView = { cx: number; cz: number; scale: number; rotation: number }; // scale: screen px per metre

/** Draw the map into `ctx` (size w×h) centred on (cx, cz) world metres. */
export function drawMap(ctx: CanvasRenderingContext2D, w: number, h: number, v: MapView, opts: { circle?: boolean } = {}) {
  const img = mapBase();
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (opts.circle) { ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); ctx.clip(); }
  ctx.fillStyle = '#ece6d8'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(v.rotation);
  ctx.scale(v.scale, v.scale);
  ctx.translate(-v.cx, -v.cz);
  // world → image: (x - MIN) * S
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, MIN, MIN, SPAN, SPAN);
  // route
  const r = nav.route;
  if (r && r.length > 1) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [color, width] of [['rgba(20,60,140,.55)', 9], ['#2f8cff', 5.5]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width / v.scale;
      ctx.beginPath(); r.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z))); ctx.stroke();
    }
  }
  // shop marker
  const [sx, sz] = RESTAURANT.center;
  marker(ctx, sx, sz, '#d22a1f', '🍜', v);
  if (nav.target && (Math.hypot(nav.target.x - sx, nav.target.z - sz) > 20)) marker(ctx, nav.target.x, nav.target.z, '#ffb400', '📍', v);
  // player arrow (points along the camera heading on north-up maps)
  ctx.save();
  ctx.translate(player.position.x, player.position.z);
  ctx.rotate(Math.atan2(-Math.cos(view.yaw), -Math.sin(view.yaw)) + Math.PI / 2);
  ctx.scale(1 / v.scale, 1 / v.scale);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1f6fff'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
}

function marker(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, glyph: string, v: MapView) {
  ctx.save();
  ctx.translate(x, z);
  ctx.rotate(-v.rotation);
  ctx.scale(1 / v.scale, 1 / v.scale);
  ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, -16, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(0, 0); ctx.lineTo(6, -8); ctx.fill();
  ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, 0, -16);
  ctx.restore();
}

/** Rotation that puts the camera's forward direction at the top of a heading-up map. */
export function headingUpRotation() {
  const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  return -Math.PI / 2 - Math.atan2(fz, fx);
}
