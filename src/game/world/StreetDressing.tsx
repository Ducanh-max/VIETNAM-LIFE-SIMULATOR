import { useMemo } from 'react';
import * as THREE from 'three';
import { distanceToShore, GROUND_HEIGHT, type Point } from '../geo';
import { insideBuilding, isAlley, roadClearance, roads, RESTAURANT, worldToRestaurant } from '../osm';
import { Instances, trs, unitBox, unitCylinder } from './Instances';
import { rng } from './textures';

/*
 * What makes a Hà Nội street look like Hà Nội, after the owner's reference videos (a flycam tour and a street-level
 * walk through the old quarter): coloured awnings over the shopfronts, narrow vertical signboards sticking out from
 * the facades, red flags with the yellow star on brackets, concrete power poles at the kerb with sagging bundles of
 * black cables, little plastic stools on the pavement, and street trees with whitewashed trunks. Everything is placed
 * along the real OSM streets against the real building fronts, and drawn with a few instanced meshes (streamed near
 * the camera), so it costs a handful of draw calls. Sign texts are generic shop words, never brand names.
 */
const KINDS = new Set(['residential', 'tertiary', 'secondary', 'primary', 'living_street', 'unclassified']);
const SIGN_WORDS = ['PHỞ', 'CƠM', 'BÚN', 'CAFÉ', 'NHÀ NGHỈ', 'BIA HƠI', 'MAY ĐO', 'SỬA XE', 'TẠP HOÁ', 'THUỐC', 'KÍNH', 'GIÀY DÉP'];
const SIGN_COLORS = ['#b3261e', '#1f5fa8', '#e2a33a', '#1f7a52', '#7a2f8a', '#d9531e'];

function signAtlas() {
  const c = document.createElement('canvas'); c.width = 64 * SIGN_WORDS.length; c.height = 256; const ctx = c.getContext('2d')!;
  SIGN_WORDS.forEach((w, i) => {
    const x = i * 64;
    ctx.fillStyle = SIGN_COLORS[i % SIGN_COLORS.length]; ctx.fillRect(x, 0, 64, 256);
    ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4; ctx.strokeRect(x + 4, 4, 56, 248);
    ctx.fillStyle = '#fff6dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const letters = [...w.replace(' ', '')]; const step = Math.min(44, 220 / letters.length);
    ctx.font = `bold ${Math.min(36, step * 0.9)}px "Be Vietnam Pro", Arial, sans-serif`;
    letters.forEach((ch, k) => ctx.fillText(ch, x + 32, 128 + (k - (letters.length - 1) / 2) * step));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** A vertical sign geometry showing word k of the atlas on both faces. */
function signGeometry(k: number) {
  const g = new THREE.BoxGeometry(1, 1, 1); const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = k / SIGN_WORDS.length, u1 = (k + 1) / SIGN_WORDS.length;
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
  return g;
}
function flagTexture() {
  const c = document.createElement('canvas'); c.width = 96; c.height = 64; const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#da251d'; ctx.fillRect(0, 0, 96, 64); ctx.fillStyle = '#ffde00'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22; const a = -Math.PI / 2 + (i * Math.PI) / 5; const x = 48 + Math.cos(a) * r, y = 34 + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Yaw then pitch about the object's own x axis (trs applies its Euler angles in the wrong order for a tilt). */
const yawPitch = (x: number, y: number, z: number, yaw: number, pitch: number, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const awningGeometry = (() => { const g = new THREE.BoxGeometry(1, 0.06, 1); g.translate(0, 0, 0.5); return g; })(); // hinged at the facade

/** The facade behind a pavement point: distance along n to the first building wall (or null). */
function facadeAt(p: Point, n: Point, from: number, to: number) {
  for (let t = from; t <= to; t += 0.5) if (insideBuilding([p[0] + n[0] * t, p[1] + n[1] * t], 0)) return t;
  return null;
}
/** Not on the Bún chả Đức Anh row (its shops are modelled by hand). */
const offRestaurantRow = (q: Point) => { const [rx, rz] = worldToRestaurant(q); return !(Math.abs(rx) < RESTAURANT.width / 2 + 11 && rz > -RESTAURANT.depth / 2 - 2 && rz < RESTAURANT.depth / 2 + 8); };

export function StreetDressing() {
  const d = useMemo(() => {
    const r = rng(1607);
    const awnings: THREE.Matrix4[] = []; const awningColors: THREE.Color[] = [];
    const signs: THREE.Matrix4[][] = SIGN_WORDS.map(() => []);
    const brackets: THREE.Matrix4[] = []; const flags: THREE.Matrix4[] = [];
    const poles: THREE.Matrix4[] = []; const cables: THREE.Matrix4[] = []; const coils: THREE.Matrix4[] = [];
    const stools: THREE.Matrix4[] = []; const stoolColors: THREE.Color[] = [];
    const awningPalette = ['#2f7a4a', '#b3261e', '#1f5fa8', '#d9531e', '#e2c23a', '#2a8f8a', '#8a2f2f'];
    const stoolPalette = ['#d3302a', '#2f68c4', '#e2a33a'];
    for (const road of roads) {
      if (!KINDS.has(road.kind) && !isAlley(road.name, road.kind)) continue;
      const alley = isAlley(road.name, road.kind);
      for (const side of [1, -1]) {
        let lastPole: THREE.Vector3 | null = null; let carry = r() * 6; let poleCarry = 8 + r() * 10;
        for (let i = 0; i < road.points.length - 1; i++) {
          const a = road.points[i], b = road.points[i + 1];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1) continue;
          const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; const n: Point = [-dir[1] * side, dir[0] * side];
          const yaw = Math.atan2(n[0], n[1]); // facing out of the facade toward the street (+z local = n)
          // ---- along the shopfronts: awnings, vertical signs, flags, stools
          for (let t = carry; t < len; t += 4.2 + r() * 2.5) {
            const p: Point = [a[0] + dir[0] * t, a[1] + dir[1] * t];
            const f = facadeAt(p, n, road.width / 2 + 0.5, road.width / 2 + 7);
            if (f === null) continue;
            const wall: Point = [p[0] + n[0] * (f - 0.05), p[1] + n[1] * (f - 0.05)];
            if (distanceToShore(wall) < 12 || !offRestaurantRow(wall)) continue;
            const out: Point = [-n[0], -n[1]]; // from the wall toward the street
            const at = (o: number, along = 0): [number, number] => [wall[0] + out[0] * o + dir[0] * along, wall[1] + out[1] * o + dir[1] * along];
            const face = Math.atan2(out[0], out[1]);
            const room = f - road.width / 2; // pavement depth in front of this house
            if (r() < 0.6 && room > 1.2) { // awning, tilted down toward the street
              const w = 2.6 + r() * 1.4, dep = Math.min(1.6, room - 0.2);
              const [x, z] = at(0); awnings.push(yawPitch(x, GROUND_HEIGHT + 2.9, z, face, 0.3, w, 1, dep)); // sloping down toward the street
              awningColors.push(new THREE.Color(awningPalette[Math.floor(r() * awningPalette.length)]));
            }
            if (r() < (alley ? 0.25 : 0.5)) { // a vertical signboard sticking out from the facade
              const h = 1.6 + r() * 1.6; const [x, z] = at(0.45, (r() - 0.5) * 1.5); const k = Math.floor(r() * SIGN_WORDS.length);
              signs[k].push(trs(x, GROUND_HEIGHT + 3.4 + h / 2 + r() * 1.5, z, face + Math.PI / 2, 0.06, h, 0.7));
            }
            if (r() < 0.14) { // a red flag on a bracket
              const [x, z] = at(0.35, 0.9); const y = GROUND_HEIGHT + 3.3;
              brackets.push(yawPitch(x, y, z, face, -0.5, 0.03, 0.03, 0.7));
              const [fx, fz] = at(0.7, 0.9); flags.push(trs(fx, y - 0.05, fz, face + Math.PI / 2, 0.9, 0.6, 1, 0, 0));
            }
            if (!alley && room > 2.2 && r() < 0.08) { // plastic stools out on the pavement
              for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
                const [x, z] = at(0.9 + r() * Math.min(1.5, room - 1.2), (r() - 0.5) * 2.2);
                if (roadClearance([x, z]) < 0.3) continue;
                stools.push(trs(x, GROUND_HEIGHT + 0.14, z, 0, 0.3, 0.28, 0.3)); stoolColors.push(new THREE.Color(stoolPalette[Math.floor(r() * 3)]));
              }
            }
            void yaw;
          }
          carry = Math.max(0, carry - len);
          // ---- power poles at the kerb, cables strung from pole to pole
          if (alley) continue;
          for (let t = poleCarry; t < len; t += 28 + r() * 8) {
            const p: Point = [a[0] + dir[0] * t, a[1] + dir[1] * t]; const off = road.width / 2 + 0.45;
            const q: Point = [p[0] + n[0] * off, p[1] + n[1] * off];
            if (distanceToShore(q) < 10 || insideBuilding(q, 0.3) || roadClearance(q) < 0.15 || !offRestaurantRow(q)) { lastPole = null; continue; }
            const H = 7.5; poles.push(trs(q[0], GROUND_HEIGHT + H / 2, q[1], 0, 0.24, H, 0.24));
            const top = new THREE.Vector3(q[0], GROUND_HEIGHT + H - 0.6, q[1]);
            if (r() < 0.5) coils.push(trs(q[0] + n[0] * 0.25, GROUND_HEIGHT + 5.6, q[1] + n[1] * 0.25, 0, 0.32, 0.5, 0.32));
            if (lastPole && lastPole.distanceTo(top) < 50) {
              // 5 cables, each sagging in the middle (two straight halves)
              for (let k = 0; k < 5; k++) {
                const dy = -k * 0.18, dz = (k % 2 ? 0.12 : -0.12);
                const A = lastPole.clone().add(new THREE.Vector3(n[0] * dz, dy, n[1] * dz)), B = top.clone().add(new THREE.Vector3(n[0] * dz, dy, n[1] * dz));
                const M = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.9 - k * 0.1, 0));
                for (const [s0, s1] of [[A, M], [M, B]]) {
                  const mid = s0.clone().add(s1).multiplyScalar(0.5); const v = s1.clone().sub(s0); const L = v.length();
                  const m = new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.normalize()), new THREE.Vector3(0.025, 0.025, L));
                  cables.push(m);
                }
              }
            }
            lastPole = top;
          }
          poleCarry = 6;
        }
      }
    }
    return { awnings, awningColors, signs, brackets, flags, poles, cables, coils, stools, stoolColors };
  }, []);
  const m = useMemo(() => {
    const atlas = signAtlas();
    return {
      awning: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }),
      sign: new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, emissive: '#ffffff', emissiveMap: atlas, emissiveIntensity: 0.12 }),
      signGeo: SIGN_WORDS.map((_, k) => signGeometry(k)),
      iron: new THREE.MeshStandardMaterial({ color: '#3a3a38', roughness: 0.5, metalness: 0.5 }),
      flag: new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide }),
      flagGeo: new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0),
      concrete: new THREE.MeshStandardMaterial({ color: '#9c9a93', roughness: 0.9 }),
      cable: new THREE.MeshBasicMaterial({ color: '#141414' }),
      stool: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
      stoolGeo: new THREE.CylinderGeometry(0.42, 0.5, 1, 8),
    };
  }, []);
  return <group>
    <Instances geometry={awningGeometry} material={m.awning} matrices={d.awnings} colors={d.awningColors} />
    {d.signs.map((list, k) => list.length > 0 && <Instances key={k} geometry={m.signGeo[k]} material={m.sign} matrices={list} castShadow={false} />)}
    <Instances geometry={unitBox} material={m.iron} matrices={d.brackets} castShadow={false} />
    <Instances geometry={m.flagGeo} material={m.flag} matrices={d.flags} castShadow={false} />
    <Instances geometry={unitCylinder} material={m.concrete} matrices={d.poles} castShadow={false} />
    <Instances geometry={unitCylinder} material={m.cable} matrices={d.coils} castShadow={false} />
    <Instances geometry={unitBox} material={m.cable} matrices={d.cables} castShadow={false} receiveShadow={false} />
    <Instances geometry={m.stoolGeo} material={m.stool} matrices={d.stools} colors={d.stoolColors} castShadow={false} />
  </group>;
}
