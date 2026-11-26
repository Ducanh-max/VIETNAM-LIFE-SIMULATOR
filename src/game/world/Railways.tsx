import { useMemo } from 'react';
import * as THREE from 'three';
import osm from '../../data/hoanKiemOsm.json';
import { GROUND_HEIGHT, inWorld, type Point } from '../geo';
import { roadClearance, roads } from '../osm';
import { Instances, trs, unitBox, unitCylinder } from './Instances';
import { rng } from './textures';

/*
 * The railways from OpenStreetMap: the North–South line into Ga Hà Nội with its yard, and the Hà Nội – Đồng Đăng
 * line that runs on the old French brick viaduct through the city towards Cầu Long Biên. Ground track: a gravel
 * ballast bed, concrete sleepers every 0,6 m, two rusty rails (metre gauge, 1 000 mm) with a worn steel top, and
 * weeds between the sleepers. Viaduct track: a deck on brick piers with low parapets. Cầu Long Biên's steel truss
 * where it is inside the map. Level crossings: red-and-white barrier arms (raised: no trains yet) and warning boards.
 * Everything is instanced (sleepers and the like are streamed near the camera).
 */
type RawRail = { p: number[][]; k: string; b?: 'bridge' | 'viaduct'; l?: number; n?: string; s?: string };
const RAILS = ((osm as { rails?: RawRail[] }).rails ?? []).filter((r) => r.k === 'rail');
const CROSSINGS = (((osm as { railCrossings?: number[][] }).railCrossings) ?? []) as Point[];
const GAUGE = 1.0, DECK = 6.2;

function along(points: Point[], step: number, visit: (p: Point, dir: Point, t: number) => void) {
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.01) continue;
    const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    for (let t = carry; t < len; t += step) visit([a[0] + d[0] * t, a[1] + d[1] * t], d, i + t / len);
    carry = (carry - len) % step; if (carry < 0) carry += step;
  }
}
/** A straight piece between two points as a box (centre, yaw, length). */
function piece(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
  const mid = a.clone().add(b).multiplyScalar(0.5); const v = b.clone().sub(a); const L = v.length();
  return new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.normalize()), new THREE.Vector3(w, h, L));
}

export function Railways() {
  const d = useMemo(() => {
    const r = rng(1880);
    const ballast: THREE.Matrix4[] = []; const sleepers: THREE.Matrix4[] = []; const rails: THREE.Matrix4[] = []; const tops: THREE.Matrix4[] = [];
    const weeds: THREE.Matrix4[] = []; const weedColors: THREE.Color[] = [];
    const deck: THREE.Matrix4[] = []; const piers: THREE.Matrix4[] = []; const parapets: THREE.Matrix4[] = [];
    const truss: THREE.Matrix4[] = [];
    for (const rail of RAILS) {
      const pts = rail.p as Point[];
      // the Hà Nội – Đồng Đăng line runs on the 1902 brick viaduct (the arches along Phùng Hưng) all the way from north of
      // Ga Hà Nội to Cầu Long Biên, though OSM only tags a few pieces of it as bridges
      const onViaduct = /Đồng Đăng/.test(rail.n ?? '') && pts.every((q) => q[1] < 140);
      const elevated = !!rail.b || (rail.l ?? 0) >= 1 || onViaduct;
      const longBien = /Long Biên/.test(rail.n ?? '');
      const y0 = GROUND_HEIGHT + (elevated ? (longBien ? 8 : DECK) : 0);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (!inWorld(a) && !inWorld(b)) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
        const n: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
        const A = (o: number, y: number) => new THREE.Vector3(a[0] + n[0] * o, y, a[1] + n[1] * o);
        const B = (o: number, y: number) => new THREE.Vector3(b[0] + n[0] * o, y, b[1] + n[1] * o);
        const onRoad = !elevated && roadClearance([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) < -0.5 && len < 30;
        if (!elevated && !onRoad) ballast.push(piece(A(0, y0 + 0.08), B(0, y0 + 0.08), 2.8, 0.16));
        if (elevated) {
          deck.push(piece(A(0, y0 - 0.35), B(0, y0 - 0.35), longBien ? 5 : 4.2, 0.7));
          for (const s of [-1, 1]) parapets.push(piece(A(s * (longBien ? 2.4 : 2.0), y0 + 0.35), B(s * (longBien ? 2.4 : 2.0), y0 + 0.35), 0.18, 0.7));
          ballast.push(piece(A(0, y0 + 0.08), B(0, y0 + 0.08), 2.6, 0.16));
        }
        for (const s of [-1, 1]) {
          rails.push(piece(A(s * GAUGE / 2, y0 + 0.27), B(s * GAUGE / 2, y0 + 0.27), 0.07, 0.13));
          tops.push(piece(A(s * GAUGE / 2, y0 + 0.345), B(s * GAUGE / 2, y0 + 0.345), 0.055, 0.02));
        }
        if (longBien) {
          // the riveted steel truss: top and bottom chords on both sides, and diagonals every 6 m
          for (const s of [-1, 1]) for (const yy of [0, 7]) truss.push(piece(A(s * 2.6, y0 + yy), B(s * 2.6, y0 + yy), 0.35, 0.45));
          for (let t = 0; t + 6 <= len; t += 6) for (const s of [-1, 1]) {
            const P = (u: number, y: number) => new THREE.Vector3(a[0] + (b[0] - a[0]) * (u / len) + n[0] * s * 2.6, y, a[1] + (b[1] - a[1]) * (u / len) + n[1] * s * 2.6);
            truss.push(piece(P(t, y0), P(t + 3, y0 + 7), 0.22, 0.22), piece(P(t + 3, y0 + 7), P(t + 6, y0), 0.22, 0.22), piece(P(t, y0), P(t, y0 + 7), 0.2, 0.2));
          }
        }
      }
      // sleepers, weeds and viaduct piers along the line
      along(pts, 0.6, (p, dir) => {
        if (!inWorld(p)) return;
        const yaw = Math.atan2(dir[0], dir[1]);
        if (!elevated && roadClearance(p) < -0.3) return; // the road surface covers the level crossings
        sleepers.push(trs(p[0], y0 + 0.19, p[1], yaw, 1.9, 0.14, 0.22));
        if (!elevated && r() < 0.18) {
          const off = (r() - 0.5) * 2.4; weeds.push(trs(p[0] - dir[1] * off, y0 + 0.2, p[1] + dir[0] * off, r() * 6, 0.25 + r() * 0.3, 0.12 + r() * 0.12, 0.25 + r() * 0.3));
          weedColors.push(new THREE.Color().setHSL(0.22 + r() * 0.08, 0.45, 0.3 + r() * 0.12));
        }
      });
      if (elevated) along(pts, longBien ? 18 : 9, (p, dir) => {
        if (!inWorld(p) || roadClearance(p) < 0) return; // keep the streets under the viaduct clear
        const yaw = Math.atan2(dir[0], dir[1]);
        piers.push(trs(p[0], GROUND_HEIGHT + (y0 - GROUND_HEIGHT - 0.7) / 2, p[1], yaw, longBien ? 4.2 : 3.6, y0 - GROUND_HEIGHT - 0.7, 1.6));
      });
    }
    // level crossings: two barrier posts with raised red-and-white arms, a warning board on each side
    const posts: THREE.Matrix4[] = []; const arms: THREE.Matrix4[] = []; const boards: THREE.Matrix4[] = [];
    for (const c of CROSSINGS) {
      if (!inWorld(c)) continue;
      // the road through the crossing, for its direction and width
      let best: { dir: Point; half: number; d: number } | null = null;
      for (const rd of roads) for (let i = 0; i < rd.points.length - 1; i++) {
        const a = rd.points[i], b = rd.points[i + 1]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / l2)); const dd = Math.hypot(a[0] + dx * t - c[0], a[1] + dz * t - c[1]);
        if (!best || dd < best.d) { const l = Math.sqrt(l2); best = { dir: [dx / l, dz / l], half: rd.width / 2, d: dd }; }
      }
      if (!best || best.d > 6) continue;
      const nx = -best.dir[1], nz = best.dir[0];
      for (const along of [-4, 4]) for (const s of [-1, 1]) {
        const px = c[0] + best.dir[0] * along + nx * s * (best.half + 0.7), pz = c[1] + best.dir[1] * along + nz * s * (best.half + 0.7);
        if (s > 0) { posts.push(trs(px, GROUND_HEIGHT + 0.6, pz, 0, 0.18, 1.2, 0.18)); arms.push(trs(px, GROUND_HEIGHT + 1.2 + 2.2, pz, Math.atan2(nx, nz), 0.09, 4.4, 0.09)); }
        else boards.push(trs(px, GROUND_HEIGHT + 2.0, pz, Math.atan2(best.dir[0], best.dir[1]) + (along > 0 ? Math.PI : 0), 0.9, 0.9, 0.04));
      }
    }
    return { ballast, sleepers, rails, tops, weeds, weedColors, deck, piers, parapets, truss, posts, arms, boards };
  }, []);
  const m = useMemo(() => {
    const brick = document.createElement('canvas'); brick.width = 128; brick.height = 128; const b = brick.getContext('2d')!;
    b.fillStyle = '#7a3e2a'; b.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < 128; x += 32) { b.fillStyle = `hsl(14, 45%, ${30 + ((x * 7 + y * 3) % 11)}%)`; b.fillRect(x + 1, y + 1, 30, 14); }
    const bt = new THREE.CanvasTexture(brick); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.colorSpace = THREE.SRGBColorSpace;
    const stripes = document.createElement('canvas'); stripes.width = 16; stripes.height = 128; const s = stripes.getContext('2d')!;
    for (let i = 0; i < 8; i++) { s.fillStyle = i % 2 ? '#ffffff' : '#d3241c'; s.fillRect(0, i * 16, 16, 16); }
    const st = new THREE.CanvasTexture(stripes); st.colorSpace = THREE.SRGBColorSpace;
    const warn = document.createElement('canvas'); warn.width = 128; warn.height = 128; const w = warn.getContext('2d')!;
    w.fillStyle = '#ffd400'; w.beginPath(); w.moveTo(64, 6); w.lineTo(122, 116); w.lineTo(6, 116); w.closePath(); w.fill(); w.strokeStyle = '#d3241c'; w.lineWidth = 10; w.stroke();
    w.fillStyle = '#111'; w.font = 'bold 22px "Be Vietnam Pro", Arial'; w.textAlign = 'center'; w.fillText('CHÚ Ý', 64, 76); w.fillText('TÀU HOẢ', 64, 100);
    const wt = new THREE.CanvasTexture(warn); wt.colorSpace = THREE.SRGBColorSpace;
    return {
      ballast: new THREE.MeshStandardMaterial({ color: '#7d766c', roughness: 1 }),
      sleeper: new THREE.MeshStandardMaterial({ color: '#a8a39a', roughness: 0.95 }),
      rust: new THREE.MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.8, metalness: 0.3 }),
      steel: new THREE.MeshStandardMaterial({ color: '#b9bec2', roughness: 0.25, metalness: 0.9 }),
      weed: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      brick: new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 }),
      deck: new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.9 }),
      truss: new THREE.MeshStandardMaterial({ color: '#4a4f52', roughness: 0.6, metalness: 0.5 }),
      post: new THREE.MeshStandardMaterial({ color: '#e8e8e2', roughness: 0.6 }),
      arm: new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 }),
      board: new THREE.MeshStandardMaterial({ map: wt, roughness: 0.6, transparent: true, alphaTest: 0.5 }),
      weedGeo: new THREE.IcosahedronGeometry(1, 0),
    };
  }, []);
  return <group>
    <Instances geometry={unitBox} material={m.ballast} matrices={d.ballast} castShadow={false} />
    <Instances geometry={unitBox} material={m.sleeper} matrices={d.sleepers} castShadow={false} />
    <Instances geometry={unitBox} material={m.rust} matrices={d.rails} castShadow={false} />
    <Instances geometry={unitBox} material={m.steel} matrices={d.tops} castShadow={false} receiveShadow={false} />
    <Instances geometry={m.weedGeo} material={m.weed} matrices={d.weeds} colors={d.weedColors} castShadow={false} />
    <Instances geometry={unitBox} material={m.deck} matrices={d.deck} />
    <Instances geometry={unitBox} material={m.brick} matrices={d.piers} />
    <Instances geometry={unitBox} material={m.brick} matrices={d.parapets} />
    <Instances geometry={unitBox} material={m.truss} matrices={d.truss} />
    <Instances geometry={unitCylinder} material={m.post} matrices={d.posts} castShadow={false} />
    <Instances geometry={unitCylinder} material={m.arm} matrices={d.arms} castShadow={false} />
    <Instances geometry={unitBox} material={m.board} matrices={d.boards} castShadow={false} />
  </group>;
}
