import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { bake, deform, lathe, smoothProfile, softBox, T, taperTube, V3, type Part } from './geometry';
import type { HairStyle, Outfit } from './outfit';

/*
 * Stylised, medium low-poly Vietnamese character built entirely from custom procedural meshes:
 * a sculpted head (forehead, cheeks, jaw, chin) with eyes that blink and look around, lids, brows that
 * move, a nose, shaped ears and a mouth with 13 expressions; layered hair locks in three tones; an open
 * zip jacket with seams, zipper, flap pockets, collar, ribbed hem and cuffs over a crew-neck tee and a
 * cream hood with drawstrings; cargo trousers with pockets, seams, knee folds and rolled cuffs; sneakers
 * with outsole, midsole, tongue, laces and stripes; hands with a palm, four two-segment fingers and a
 * thumb that open, grip, pinch and wave; a crossbody bag or a backpack.
 *
 * Rig (all THREE.Group, L = the character's left = +X, faces +Z, feet on y = 0):
 *   root › hips › hipL/R › kneeL/R (shoe attached)
 *              › spine › shoulderL/R › elbowL/R › handL/R (fingers)
 *                      › neck › head
 * Static parts of each bone are merged into one mesh per material (≈ 45 draw calls per character).
 */
export type Expression = 'neutral' | 'smile' | 'happy' | 'laugh' | 'surprised' | 'sad' | 'angry' | 'confused' | 'talking' | 'eating' | 'drinking' | 'blink' | 'closed';
export type HandPose = 'relaxed' | 'fist' | 'grip' | 'pinch' | 'open' | 'phone' | 'wheel';
export type Detail = 'high' | 'low';
export type PlayerRig = {
  root: THREE.Group; hips: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group;
  shoulderL: THREE.Group; elbowL: THREE.Group; handL: THREE.Group;
  shoulderR: THREE.Group; elbowR: THREE.Group; handR: THREE.Group;
  hipL: THREE.Group; kneeL: THREE.Group; hipR: THREE.Group; kneeR: THREE.Group;
  /** Set the finger pose of one hand ('L' = character's left). Blends smoothly. */
  setHand: (side: 'L' | 'R', pose: HandPose) => void;
};
export const PLAYER_DIMENSIONS = { hipY: 0.92, thigh: 0.4, shin: 0.42, shoulderY: 1.36, shoulderX: 0.22, upperArm: 0.3, forearm: 0.27, neckY: 1.45, headY: 1.635 };
const D = PLAYER_DIMENSIONS;
/** The head sits a little lower on the neck than the rig's nominal head joint. */
export const HEAD_DROP = 0.035;

// ---- materials (shared across all characters by colour) ----------------------
const matCache = new Map<string, THREE.Material>();
function mat(color: string, opts: { rough?: number; side?: THREE.Side; vc?: boolean; opacity?: number; emissive?: string; metal?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.9}|${opts.side ?? 0}|${opts.vc ? 1 : 0}|${opts.opacity ?? 1}|${opts.emissive ?? ''}|${opts.metal ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: opts.vc ? '#ffffff' : color, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0, side: opts.side ?? THREE.FrontSide, vertexColors: !!opts.vc,
      transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, depthWrite: (opts.opacity ?? 1) >= 1,
      emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissive ? 0.5 : 0,
    });
    matCache.set(key, m);
  }
  return m;
}
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

/** Material palette of one outfit; part keys refer to these. */
function palette(o: Outfit) {
  return {
    skin: mat(o.skin, { rough: 0.78 }), skinShade: mat(shade(o.skin, 0.9), { rough: 0.8 }), skinDeep: mat(shade(o.skin, 0.72), { rough: 0.85 }),
    headVC: mat('#fff', { rough: 0.78, vc: true }),
    hair: mat(o.hair, { rough: 0.72 }), hairLight: mat(o.hairLight, { rough: 0.62 }), hairDark: mat(o.hairDark, { rough: 0.8 }),
    tee: mat(o.tee), teeShade: mat(shade(o.tee, 0.86)),
    jacket: mat(o.jacket, { side: THREE.DoubleSide }), jacketLight: mat(o.jacketLight), jacketDark: mat(o.jacketDark), trim: mat(o.jacketTrim), lining: mat(shade(o.jacketDark, 0.8), { side: THREE.BackSide }),
    hood: mat(o.hood ?? '#e5dccc'), hoodShade: mat(shade(o.hood ?? '#e5dccc', 0.86)),
    pants: mat(o.pants), pantsLight: mat(o.pantsLight), pantsDark: mat(o.pantsDark), cuff: mat(o.pantsCuff), cuffLining: mat(shade(o.pantsCuff, 1.25)),
    sock: mat('#ece8e0'),
    shoe: mat(o.shoe, { rough: 0.7 }), sole: mat(o.shoeSole, { rough: 0.85 }), outsole: mat(shade(o.shoeSole, 0.82)), stripe: mat(o.shoeStripe, { rough: 0.6 }), lace: mat(shade(o.shoe, 0.94)),
    bag: mat('#2b2a29', { rough: 0.6 }), bagDark: mat('#1c1b1a', { rough: 0.65 }), metal: mat('#9b9c9e', { rough: 0.35, metal: 0.6 }), orange: mat('#e8873a', { rough: 0.45 }),
    eyeWhite: mat('#f7f4ef', { rough: 0.4 }), iris: mat('#3a2419', { rough: 0.35 }), pupil: mat('#0e0a09', { rough: 0.3 }), shine: mat('#ffffff', { rough: 0.2, emissive: '#ffffff' }),
    lash: mat('#1c1716', { rough: 0.6 }), brow: mat(o.hairDark, { rough: 0.8 }), lip: mat('#a2554a', { rough: 0.6 }), mouthIn: mat('#5a1e1a', { rough: 0.7 }), teeth: mat('#f7f3ea', { rough: 0.4 }), tongue: mat('#df7a72', { rough: 0.6 }),
    blush: mat('#f08f80', { rough: 0.9, opacity: 0.32 }),
    apron: mat(o.apron ?? '#1d1d1f'), hat: mat(o.hatColor, { rough: 0.7 }), nonla: mat('#d9c38a', { rough: 0.85 }), visor: mat('#20262c', { rough: 0.15, opacity: 0.85 }), glasses: mat('#26201c', { rough: 0.4 }),
  };
}
type Pal = ReturnType<typeof palette>;

// ---- head -------------------------------------------------------------------------
const HEAD = { a: 0.108, b: 0.118, c: 0.11, back: 0.118 };
/** Sculpted head: wider cranium, flatter forehead, cheek fullness, tapering jaw and a soft chin. Vertex colours tint the scalp under the hair. */
function headGeometry(o: Outfit, detail: Detail) {
  const g = new THREE.SphereGeometry(1, detail === 'high' ? 28 : 16, detail === 'high' ? 20 : 12);
  const colors: number[] = [];
  const skin = new THREE.Color(o.skin); const scalp = new THREE.Color(o.hairDark).lerp(new THREE.Color(o.hair), 0.3);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ux = x, uy = y, uz = z;
    // cranium a bit wider at the temples, flatter forehead
    if (y > 0.25 && z > 0.2) z *= 1 - 0.07 * (y - 0.25);
    // jaw taper and chin
    if (y < -0.15) {
      const k = Math.min(1, (-y - 0.15) / 0.85);
      x *= 1 - 0.3 * Math.pow(k, 1.4);
      if (z > 0) z *= 1 - 0.12 * k + 0.1 * k * Math.pow(Math.max(0, 1 - Math.abs(x) * 2.4), 2); // chin forward
      y -= 0.02 * k * (z > 0 ? 1 : 0.2);
    }
    // cheeks: soft fullness below the eyes at the sides of the face
    const cheek = Math.exp(-((y + 0.35) ** 2) / 0.04) * Math.exp(-((Math.abs(x) - 0.62) ** 2) / 0.05) * (z > 0 ? 1 : 0);
    x *= 1 + 0.05 * cheek; z *= 1 + 0.04 * cheek;
    // eye sockets: slight recess
    const sock = Math.exp(-((y - 0.05) ** 2) / 0.012) * Math.exp(-((Math.abs(x) - 0.4) ** 2) / 0.02) * (z > 0.6 ? 1 : 0);
    z *= 1 - 0.035 * sock;
    p.setXYZ(i, x * HEAD.a, y * HEAD.b, z * (z > 0 ? HEAD.c : HEAD.back));
    // scalp tint where hair grows (top, back, sides above the ears), skin elsewhere
    const hairZone = isHairZone(V3(ux, uy, uz), o.hairStyle);
    const c = hairZone ? scalp : skin;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
function isHairZone(d: THREE.Vector3, style: HairStyle) {
  if (style === 'thin') return d.y > 0.55;
  const front = d.z > 0.45 && d.y < 0.55; // forehead and face
  const aboveEar = Math.abs(d.x) > 0.6 && d.y < -0.05 && d.z > -0.25;
  const low = d.y < (d.z < 0 ? -0.55 : -0.15);
  return !front && !aboveEar && !low;
}
/** Point on the head surface (plus offset) for a unit direction. */
function headPoint(d: THREE.Vector3, off = 0) {
  return V3(d.x * (HEAD.a + off), d.y * (HEAD.b + off), d.z * ((d.z > 0 ? HEAD.c : HEAD.back) + off));
}

// ---- hair -------------------------------------------------------------------------
type Lock = { g: THREE.BufferGeometry; tone: 'hair' | 'hairLight' | 'hairDark' };
function hairLocks(style: HairStyle, detail: Detail): Lock[] {
  const locks: Lock[] = [];
  const tub = detail === 'high' ? 5 : 3; const rad = detail === 'high' ? 5 : 4;
  const N = style === 'thin' ? 70 : detail === 'high' ? 150 : 90;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const partX = 0.28; // side parting (character's left)
  const flow = (d: THREE.Vector3): THREE.Vector3 => {
    if (style === 'swept' && d.z > 0.3 && d.y > 0.15) return V3(-0.75, -0.8, 0.55); // fringe swept across the forehead
    if (style === 'bob' && d.z > 0.3 && d.y > 0.15) return V3(d.x > 0 ? 0.3 : -0.3, -1, 0.5);
    if (d.z < -0.15) return V3(d.x * 0.4, -1, -0.35); // back of the head, toward the nape
    if (d.x > partX) return V3(1, -0.7, -0.1);
    return V3(-0.85, -0.7, -0.05);
  };
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const th = golden * i;
    const d = V3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (!isHairZone(d, style) && !(d.y > 0.55)) continue;
    if (style === 'thin' && (i % 2)) continue;
    const top = d.y > 0.6;
    const fringe = d.z > 0.3 && d.y > 0.15;
    let len = style === 'short' ? 0.045 : style === 'thin' ? 0.035 : 0.075;
    if (fringe && (style === 'swept' || style === 'bob')) len = 0.07;
    if (style === 'bob' && d.y < 0.4) len = 0.14;
    if (style !== 'bob' && Math.abs(d.x) > 0.55 && d.y < 0.45) len *= 0.6; // short at the temples
    const steps = 4; const pts: THREE.Vector3[] = []; let dir = d.clone();
    const f = flow(d).normalize();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const side = Math.abs(d.x) > 0.55 && d.y < 0.45;
      const lift = style === 'short' || style === 'thin' ? 0.006 : top ? 0.01 + 0.024 * Math.sin(Math.PI * Math.min(1, t * 1.2)) : side ? 0.003 + 0.003 * t : 0.006 + 0.008 * t;
      const p = headPoint(dir, lift);
      // long locks hang below the equator instead of hugging the skull
      if (style === 'bob' && dir.y < -0.05) p.y -= (len * 0.6) * t;
      pts.push(p);
      const tangent = f.clone().sub(dir.clone().multiplyScalar(f.dot(dir))).normalize();
      dir = dir.clone().addScaledVector(tangent, (len / 0.11) * 0.42).normalize();
      if (fringe && dir.y < 0.42) { dir.y = 0.42; dir.normalize(); } // fringe stops above the brows
    }
    const r0 = style === 'thin' ? 0.02 : top ? 0.046 : 0.04;
    const g = taperTube(pts, r0, fringe ? 0.006 : 0.009, { tubular: tub, radial: rad, flat: 0.38, bulge: 0.35, twist: (i % 5) * 0.25 });
    const tone = top && i % 3 === 0 ? 'hairLight' : d.y < 0 || d.z < -0.5 ? 'hairDark' : 'hair';
    locks.push({ g, tone });
  }
  if (style === 'ponytail') {
    const pts = [V3(0, 0.05, -0.12), V3(0, 0.0, -0.16), V3(0, -0.08, -0.17), V3(0, -0.17, -0.15)];
    locks.push({ g: taperTube(pts, 0.035, 0.008, { tubular: 8, radial: 7, bulge: 0.4 }), tone: 'hair' });
    locks.push({ g: taperTube([V3(-0.02, 0.05, -0.115), V3(0.02, 0.05, -0.115)], 0.012, 0.012, { tubular: 2, radial: 6 }), tone: 'hairDark' });
  }
  if (style === 'bun') {
    const g = softBox(0.045, 0.04, 0.045, 0.85, 10, 8); g.translate(0, 0.09, -0.11);
    locks.push({ g, tone: 'hair' });
  }
  return locks;
}

// ---- face -------------------------------------------------------------------------
type ExprParams = { browY: number; browInner: number; browOuter?: number; lidUp: number; lidLow: number; line: 'neutral' | 'smile' | 'big' | 'frown' | 'flat' | null; open: [number, number] | null; teeth?: boolean; tongue?: boolean; gaze?: [number, number]; tilt?: number; asym?: number; anim?: 'talk' | 'chew' };
const EXPRESSIONS: Record<Expression, ExprParams> = {
  neutral: { browY: 0, browInner: 0, lidUp: 0, lidLow: 0, line: 'neutral', open: null },
  smile: { browY: 0.002, browInner: 0, lidUp: 0.05, lidLow: 0.2, line: 'smile', open: null },
  happy: { browY: 0.004, browInner: 0.05, lidUp: 0.1, lidLow: 0.38, line: null, open: [0.032, 0.014], teeth: true, tongue: true },
  laugh: { browY: 0.006, browInner: 0.1, lidUp: 0.62, lidLow: 0.55, line: null, open: [0.04, 0.026], teeth: true, tongue: true },
  surprised: { browY: 0.009, browInner: 0.15, lidUp: -0.18, lidLow: -0.05, line: null, open: [0.016, 0.02] },
  sad: { browY: -0.001, browInner: 0.4, lidUp: 0.28, lidLow: 0, line: 'frown', open: null, gaze: [0, -0.22] },
  angry: { browY: -0.004, browInner: -0.45, lidUp: 0.2, lidLow: 0.25, line: 'flat', open: null },
  confused: { browY: 0.002, browInner: 0.1, browOuter: 0.3, lidUp: 0.1, lidLow: 0.05, line: 'flat', open: null, tilt: 0.18, asym: 1, gaze: [0.2, 0.15] },
  talking: { browY: 0.002, browInner: 0.05, lidUp: 0, lidLow: 0.1, line: null, open: [0.026, 0.012], teeth: true, anim: 'talk' },
  eating: { browY: 0.001, browInner: 0, lidUp: 0.15, lidLow: 0.25, line: 'smile', open: [0.02, 0.006], anim: 'chew' },
  drinking: { browY: 0.002, browInner: 0.05, lidUp: 0.3, lidLow: 0.1, line: null, open: [0.013, 0.011], gaze: [0, -0.1] },
  blink: { browY: 0, browInner: 0, lidUp: 1, lidLow: 0.2, line: 'neutral', open: null },
  closed: { browY: 0.001, browInner: 0.05, lidUp: 1, lidLow: 0.3, line: 'smile', open: null },
};
function mouthLine(kind: 'neutral' | 'smile' | 'big' | 'frown' | 'flat') {
  const curve = { neutral: 0.002, smile: 0.007, big: 0.011, frown: -0.006, flat: 0 }[kind];
  const w = kind === 'big' ? 0.042 : 0.036;
  const pts = [V3(-w / 2, curve, -0.004), V3(-w / 4, curve * 0.15, 0), V3(0, 0, 0.001), V3(w / 4, curve * 0.15, 0), V3(w / 2, curve, -0.004)];
  return taperTube(pts, 0.0024, 0.0024, { tubular: 10, radial: 5 });
}
const MOUTH_LINES = { neutral: mouthLine('neutral'), smile: mouthLine('smile'), big: mouthLine('big'), frown: mouthLine('frown'), flat: mouthLine('flat') };
const mouthOpenGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.15); s.quadraticCurveTo(0, 0.28, 0.5, 0.15); s.quadraticCurveTo(0.45, -0.7, 0, -0.75); s.quadraticCurveTo(-0.45, -0.7, -0.5, 0.15);
  return new THREE.ShapeGeometry(s, 10);
})();
const teethGeo = (() => { const s = new THREE.Shape(); s.moveTo(-0.44, 0.12); s.quadraticCurveTo(0, 0.24, 0.44, 0.12); s.lineTo(0.4, -0.05); s.quadraticCurveTo(0, 0.04, -0.4, -0.05); return new THREE.ShapeGeometry(s, 8); })();
const tongueGeo = new THREE.CircleGeometry(0.5, 12);
const disc = new THREE.CircleGeometry(1, 14);
const eyeballGeo = new THREE.SphereGeometry(1, 16, 12);
const lidGeo = new THREE.SphereGeometry(1.08, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const lowLidGeo = new THREE.SphereGeometry(1.06, 16, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const lashGeo = taperTube(Array.from({ length: 9 }, (_, i) => { const a = 0.08 * Math.PI + (i / 8) * 0.84 * Math.PI; return V3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1); }), 0.11, 0.13, { tubular: 12, radial: 5, bulge: 0.35 });
const browGeo = taperTube([V3(0, 0, 0), V3(0.016, 0.006, -0.002), V3(0.034, 0.007, -0.008), V3(0.048, 0.001, -0.016)], 0.0062, 0.0026, { tubular: 8, radial: 5, flat: 0.55 });

/** Face rig driven every frame: blinking, saccades, expression blending, talking and chewing. */
function useFace(expression: Expression, detail: Detail) {
  const refs = {
    lidsUp: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)], lidsLow: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)],
    irises: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)], brows: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)],
    mouth: useRef<THREE.Group>(null), line: useRef<THREE.Mesh>(null), open: useRef<THREE.Group>(null), teeth: useRef<THREE.Mesh>(null), tongue: useRef<THREE.Mesh>(null), cheeks: useRef<THREE.Group>(null),
  };
  const st = useRef({ blinkAt: 2 + Math.random() * 3, blinkT: -1, gaze: [0, 0], gazeTarget: [0, 0], gazeAt: 1, lidUp: 0, lidLow: 0, browY: 0, browIn: 0, browOut: 0, openW: 0, openH: 0, t: Math.random() * 10 });
  useFrame((_, delta) => {
    if (detail === 'low') return;
    const dt = Math.min(delta, 0.05); const s = st.current; s.t += dt;
    const e = EXPRESSIONS[expression];
    // blink
    s.blinkAt -= dt;
    if (s.blinkAt <= 0 && s.blinkT < 0) { s.blinkT = 0; s.blinkAt = 1.8 + Math.random() * 3.8 + (Math.random() < 0.15 ? -1.6 : 0); }
    let blink = 0;
    if (s.blinkT >= 0) { s.blinkT += dt; blink = Math.sin(Math.min(1, s.blinkT / 0.16) * Math.PI); if (s.blinkT > 0.16) s.blinkT = -1; }
    // saccades
    s.gazeAt -= dt;
    if (s.gazeAt <= 0) { s.gazeAt = 1.2 + Math.random() * 2.6; s.gazeTarget = [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.18]; }
    const gt = e.gaze ? [e.gaze[0] + s.gazeTarget[0] * 0.3, e.gaze[1] + s.gazeTarget[1] * 0.3] : s.gazeTarget;
    s.gaze[0] += (gt[0] - s.gaze[0]) * Math.min(1, dt * 18); s.gaze[1] += (gt[1] - s.gaze[1]) * Math.min(1, dt * 18);
    const k = 1 - Math.exp(-dt * 10);
    s.lidUp += (Math.max(e.lidUp, blink) - s.lidUp) * (blink > 0 ? 1 : k);
    s.lidLow += (e.lidLow - s.lidLow) * k;
    s.browY += (e.browY - s.browY) * k; s.browIn += (e.browInner - s.browIn) * k; s.browOut += ((e.browOuter ?? 0) - s.browOut) * k;
    let ow = e.open ? e.open[0] : 0; let oh = e.open ? e.open[1] : 0;
    if (e.anim === 'talk') oh *= 0.35 + 0.65 * Math.abs(Math.sin(s.t * 9.5) * Math.sin(s.t * 3.7 + 1));
    if (e.anim === 'chew') oh *= Math.max(0, Math.sin(s.t * 7));
    s.openW += (ow - s.openW) * k; s.openH += (oh - s.openH) * Math.min(1, dt * 22);
    for (let i = 0; i < 2; i++) {
      const sideSign = i === 0 ? 1 : -1; // 0 = left eye (+x)
      refs.lidsUp[i].current?.rotation.set(-1.22 + (1.22 + 0.32) * THREE.MathUtils.clamp(s.lidUp, -0.25, 1), 0, 0);
      refs.lidsLow[i].current?.rotation.set(1.3 - (1.3 + 0.2) * THREE.MathUtils.clamp(s.lidLow, -0.1, 1) * 0.55, 0, 0);
      refs.irises[i].current?.position.set(s.gaze[0], s.gaze[1], 0);
      const b = refs.brows[i].current;
      if (b) {
        const asym = (e.asym ?? 0) * (i === 0 ? 1 : -0.6);
        b.position.y = 0.048 + s.browY + asym * 0.004;
        b.rotation.z = sideSign * (-s.browIn * 0.35 + s.browOut * 0.2 * (i === 0 ? 1 : -1));
      }
    }
    const m = refs.mouth.current;
    if (m) { m.rotation.z = (e.tilt ?? 0) + (e.anim === 'chew' ? Math.sin(s.t * 7) * 0.03 : 0); m.position.y = -0.062 - (e.anim === 'chew' ? Math.max(0, Math.sin(s.t * 7)) * 0.002 : 0); }
    const line = refs.line.current;
    if (line) { line.visible = !!e.line && s.openH < 0.004; if (e.line) line.geometry = MOUTH_LINES[e.line]; }
    const op = refs.open.current;
    if (op) { op.visible = s.openH > 0.002 || (!!e.open && !e.anim); op.scale.set(Math.max(0.001, s.openW), Math.max(0.001, s.openH), 1); }
    if (refs.teeth.current) refs.teeth.current.visible = !!e.teeth;
    if (refs.tongue.current) refs.tongue.current.visible = !!e.tongue || e.anim === 'talk';
    const ch = refs.cheeks.current;
    if (ch) { const puff = e.anim === 'chew' ? 1.25 + Math.max(0, Math.sin(s.t * 7)) * 0.15 : e.line === 'smile' || e.open ? 1.12 : 1; ch.scale.setScalar(puff); }
  });
  return refs;
}

// ---- body builders ----------------------------------------------------------------
function torsoParts(o: Outfit, detail: Detail): Part[] {
  const P: Part[] = [];
  const seg = detail === 'high' ? 22 : 12;
  const zs = 0.74; // front-to-back squash
  const sq = (g: THREE.BufferGeometry) => g.scale(1, 1, zs);
  // T-shirt / shirt body
  const teeProfile = smoothProfile([[0.146, -0.1], [0.15, 0.05], [0.156, 0.2], [0.158, 0.3], [0.135, 0.37], [0.085, 0.425], [0.062, 0.45]]);
  P.push({ g: sq(lathe(teeProfile, seg)), m: 'tee' });
  P.push({ g: taperTube(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return V3(Math.sin(a) * 0.064, 0.442, Math.cos(a) * 0.064 * 0.86); }), 0.007, 0.007, { tubular: 16, radial: 5 }), m: 'teeShade' });
  // soft folds on the tee
  if (detail === 'high') for (const x of [-0.035, 0.03]) P.push({ g: taperTube([V3(x, 0.05, 0.112), V3(x + 0.01, 0.12, 0.117), V3(x - 0.005, 0.2, 0.116)], 0.003, 0.0015, { tubular: 5, radial: 4, flat: 0.5 }), m: 'teeShade' });
  if (o.top === 'shirt' || o.top === 'polo') {
    for (const s of [-1, 1]) P.push({ g: softBox(0.034, 0.022, 0.006, 0.4), m: 'tee', t: T(s * 0.04, 0.43, 0.06, -0.6, s * 0.5, s * 0.55) });
    P.push({ g: softBox(0.008, o.top === 'polo' ? 0.06 : 0.26, 0.004, 0.4), m: 'teeShade', t: T(0, o.top === 'polo' ? 0.38 : 0.22, 0.118) });
    for (let k = 0; k < (o.top === 'polo' ? 2 : 5); k++) P.push({ g: new THREE.SphereGeometry(0.004, 6, 4), m: 'teeShade', t: T(0, 0.4 - k * 0.07, 0.121) });
  }
  if (o.top === 'jacket') {
    const gap = 0.6;
    const jp = smoothProfile([[0.203, -0.11], [0.2, -0.02], [0.198, 0.12], [0.207, 0.26], [0.2, 0.33], [0.168, 0.388], [0.105, 0.43], [0.088, 0.452]], 18);
    P.push({ g: sq(lathe(jp, seg + 6, gap / 2, Math.PI * 2 - gap)), m: 'jacket' });
    P.push({ g: sq(lathe(jp.map(([r, y]) => [r * 0.975, y] as [number, number]), seg, gap / 2, Math.PI * 2 - gap)), m: 'lining' });
    // ribbed hem band
    P.push({ g: sq(lathe([[0.207, -0.122], [0.209, -0.1], [0.208, -0.075]], seg, gap / 2, Math.PI * 2 - gap)), m: 'jacketDark' });
    // stand collar
    P.push({ g: sq(lathe(smoothProfile([[0.1, 0.425], [0.104, 0.47], [0.108, 0.51]], 4), seg, 0.75, Math.PI * 2 - 1.5)), m: 'jacket' });
    const edge = (a: number, r: number, y: number) => V3(Math.sin(a) * r, y, Math.cos(a) * r * zs);
    for (const s of [-1, 1]) {
      const a = s * gap / 2;
      // thick placket edge and zipper teeth
      P.push({ g: taperTube([edge(a, 0.205, -0.12), edge(a, 0.2, 0.05), edge(a, 0.208, 0.22), edge(a * 1.3, 0.17, 0.36), edge(a * 1.9, 0.11, 0.44)], 0.011, 0.009, { tubular: 14, radial: 5, flat: 0.6 }), m: 'trim' });
      if (detail === 'high') for (let k = 0; k < 10; k++) { const y = -0.1 + k * 0.038; const r = 0.2 + 0.007 * Math.sin((y + 0.1) * 6); const p = edge(a * 0.93, r + 0.004, y); P.push({ g: new THREE.BoxGeometry(0.007, 0.008, 0.006), m: 'metal', t: T(p.x, p.y, p.z, 0, a, 0) }); }
      // chest flap pockets with a snap
      const pa = s * 0.62; const pp = edge(pa, 0.212, 0.205);
      P.push({ g: softBox(0.042, 0.048, 0.007, 0.32), m: 'jacket', t: T(pp.x, pp.y, pp.z, -0.05, pa * 0.9, 0) });
      const fp = edge(pa, 0.218, 0.255);
      P.push({ g: softBox(0.046, 0.017, 0.009, 0.3), m: 'jacketLight', t: T(fp.x, fp.y, fp.z, -0.1, pa * 0.9, 0) });
      P.push({ g: new THREE.SphereGeometry(0.0055, 8, 6), m: 'metal', t: T(fp.x + Math.sin(pa) * 0.008, fp.y - 0.006, fp.z + Math.cos(pa) * 0.008) });
      // lower welt pockets
      P.push({ g: taperTube([edge(s * 1.05, 0.206, -0.02), edge(s * 0.95, 0.205, 0.07)], 0.006, 0.006, { tubular: 3, radial: 4, flat: 0.5 }), m: 'jacketDark' });
      // seams: shoulder, side, yoke
      P.push({ g: taperTube([V3(s * 0.085, 0.452, 0), V3(s * 0.14, 0.42, -0.004), V3(s * 0.19, 0.37, -0.004)], 0.0028, 0.0028, { tubular: 6, radial: 4 }), m: 'trim' });
      P.push({ g: taperTube([edge(s * Math.PI / 2, 0.206, -0.1), edge(s * Math.PI / 2, 0.21, 0.32)], 0.0026, 0.0026, { tubular: 4, radial: 4 }), m: 'trim' });
      // folds at the belly and hem
      if (detail === 'high') for (const [y, len] of [[0.02, 0.05], [0.08, 0.035]] as const) P.push({ g: taperTube([edge(s * 0.55, 0.203, y), edge(s * (0.55 + len * 6), 0.205, y + 0.012)], 0.004, 0.0015, { tubular: 4, radial: 4, flat: 0.5 }), m: 'jacketDark' });
    }
    P.push({ g: taperTube(Array.from({ length: 9 }, (_, i) => { const a = Math.PI * 0.7 + (i / 8) * Math.PI * 0.6; return edge(a, 0.204, 0.3); }), 0.0026, 0.0026, { tubular: 10, radial: 4 }), m: 'trim' });
    // zipper pull
    const zp = edge(-gap / 2 * 0.93, 0.21, 0.12);
    P.push({ g: softBox(0.006, 0.016, 0.003, 0.5), m: 'metal', t: T(zp.x, zp.y, zp.z + 0.004) });
  }
  if (o.hood && (o.top === 'jacket' || o.top === 'tee')) {
    // hood ring lying round the back of the neck, the folded hood on the back, rim and drawstrings
    const ring = Array.from({ length: 11 }, (_, i) => { const a = Math.PI / 2 + 0.75 + (i / 10) * (Math.PI * 2 - 1.5); return V3(Math.cos(a) * 0.11, 0.44 + 0.02 * Math.max(0, -Math.sin(a)), Math.sin(a) * 0.105); });
    P.push({ g: taperTube(ring, 0.04, 0.04, { tubular: 18, radial: 7, flat: 0.75 }), m: 'hood' });
    P.push({ g: deform(softBox(0.13, 0.11, 0.045, 0.6, 14, 10), (v) => { v.z -= v.y * v.y * 2.5; }), m: 'hood', t: T(0, 0.35, -0.175, 0.35) });
    P.push({ g: taperTube([V3(-0.12, 0.38, -0.15), V3(-0.09, 0.45, -0.19), V3(0, 0.47, -0.2), V3(0.09, 0.45, -0.19), V3(0.12, 0.38, -0.15)], 0.009, 0.009, { tubular: 10, radial: 5 }), m: 'hoodShade' });
    if (detail === 'high') for (const s of [-1, 1]) {
      const pts = [V3(s * 0.05, 0.43, 0.095), V3(s * 0.055, 0.38, 0.135), V3(s * 0.052, 0.3, 0.152), V3(s * 0.056, 0.24, 0.156)];
      P.push({ g: taperTube(pts, 0.004, 0.004, { tubular: 8, radial: 4 }), m: 'hood' });
      P.push({ g: new THREE.CylinderGeometry(0.0065, 0.006, 0.026, 6), m: 'hoodShade', t: T(s * 0.056, 0.225, 0.157) });
    }
  }
  if (o.apron) {
    P.push({ g: deform(softBox(0.16, 0.24, 0.012, 0.3), (v) => { v.z += -v.x * v.x * 1.5; }), m: 'apron', t: T(0, 0.1, 0.165) });
    for (const s of [-1, 1]) P.push({ g: taperTube([V3(s * 0.1, 0.33, 0.15), V3(s * 0.07, 0.44, 0.08), V3(0, 0.47, -0.06)], 0.006, 0.006, { tubular: 6, radial: 4 }), m: 'apron' });
  }
  return P;
}

function bagParts(o: Outfit): Part[] {
  const P: Part[] = [];
  if (o.backpack) {
    P.push({ g: deform(softBox(0.14, 0.19, 0.07, 0.45, 14, 10), (v) => { v.z -= (v.y * v.y) * 0.4 - 0.0; }), m: 'bag', t: T(0, 0.22, -0.235) });
    P.push({ g: softBox(0.105, 0.075, 0.03, 0.4), m: 'bagDark', t: T(0, 0.13, -0.3) });
    P.push({ g: taperTube([V3(-0.1, 0.36, -0.305), V3(0, 0.39, -0.31), V3(0.1, 0.36, -0.305)], 0.004, 0.004, { tubular: 6, radial: 4 }), m: 'metal' });
    P.push({ g: taperTube([V3(-0.03, 0.4, -0.23), V3(0, 0.44, -0.235), V3(0.03, 0.4, -0.23)], 0.008, 0.008, { tubular: 6, radial: 5 }), m: 'bagDark' });
    for (const s of [-1, 1]) {
      P.push({ g: taperTube([V3(s * 0.07, 0.38, -0.18), V3(s * 0.1, 0.45, -0.02), V3(s * 0.11, 0.38, 0.135), V3(s * 0.12, 0.2, 0.15), V3(s * 0.17, 0.06, 0.02), V3(s * 0.12, 0.05, -0.18)], 0.017, 0.012, { tubular: 16, radial: 5, flat: 0.35 }), m: 'bagDark' });
      P.push({ g: softBox(0.014, 0.012, 0.005, 0.4), m: 'metal', t: T(s * 0.118, 0.24, 0.155) });
    }
    return P;
  }
  if (!o.sling) return P;
  const front = [V3(0.125, 0.41, 0.03), V3(0.105, 0.385, 0.115), V3(0.02, 0.28, 0.165), V3(-0.09, 0.15, 0.175), V3(-0.165, 0.05, 0.16)];
  const back = [V3(0.125, 0.41, -0.02), V3(0.07, 0.33, -0.155), V3(-0.08, 0.16, -0.165), V3(-0.2, 0.04, -0.1)];
  P.push({ g: taperTube(front, 0.014, 0.014, { tubular: 14, radial: 5, flat: 0.32 }), m: 'bag' });
  P.push({ g: taperTube(back, 0.014, 0.014, { tubular: 12, radial: 5, flat: 0.32 }), m: 'bag' });
  P.push({ g: softBox(0.02, 0.011, 0.006, 0.4), m: 'metal', t: T(-0.03, 0.22, 0.172, 0, 0, 0.75) });
  const B = T(-0.215, 0.015, 0.1, 0, -0.75, 0.06);
  const add = (g: THREE.BufferGeometry, m: string, t: THREE.Matrix4) => P.push({ g, m, t: B.clone().multiply(t) });
  add(softBox(0.095, 0.064, 0.032, 0.38, 14, 10), 'bag', T());
  add(softBox(0.097, 0.03, 0.007, 0.32), 'bagDark', T(0, 0.036, 0.03, -0.12));
  add(taperTube([V3(-0.085, 0.004, 0.034), V3(0.085, 0.004, 0.034)], 0.0025, 0.0025, { tubular: 2, radial: 4 }), 'metal', T());
  add(softBox(0.03, 0.02, 0.004, 0.4), 'bagDark', T(0.03, -0.022, 0.034));
  add(new THREE.TorusGeometry(0.012, 0.0035, 6, 12), 'orange', T(0.1, 0.02, 0.0, 0, Math.PI / 2, 0.3));
  add(softBox(0.004, 0.016, 0.004, 0.5), 'orange', T(0.08, -0.004, 0.036));
  return P;
}

function upperArmParts(o: Outfit, side: number, detail: Detail): Part[] {
  const seg = detail === 'high' ? 12 : 8;
  const P: Part[] = [];
  const longSleeve = o.top === 'jacket' || o.top === 'shirt';
  const m = o.top === 'jacket' ? 'jacket' : 'tee';
  // rounded shoulder cap blending into the torso
  P.push({ g: softBox(0.086, 0.07, 0.078, 0.85, seg, 8), m, t: T(-side * 0.012, -0.005, 0) });
  if (longSleeve) {
    P.push({ g: lathe(smoothProfile([[0.07, -0.3], [0.072, -0.22], [0.075, -0.12], [0.078, -0.04], [0.074, 0.02]], 10), seg), m });
    if (detail === 'high') for (const y of [-0.24, -0.27]) P.push({ g: taperTube([V3(-0.05, y, 0.055), V3(0, y - 0.006, 0.075), V3(0.05, y, 0.055)], 0.004, 0.004, { tubular: 6, radial: 4, flat: 0.5 }), m: o.top === 'jacket' ? 'jacketDark' : 'teeShade' });
  } else {
    P.push({ g: lathe(smoothProfile([[0.08, -0.12], [0.079, -0.06], [0.077, 0.02]], 6), seg), m });
    P.push({ g: lathe(smoothProfile([[0.05, -0.3], [0.054, -0.2], [0.058, -0.1]], 6), seg), m: 'skin' });
  }
  return P;
}
function forearmParts(o: Outfit, detail: Detail): Part[] {
  const seg = detail === 'high' ? 12 : 8;
  const P: Part[] = [];
  const longSleeve = o.top === 'jacket' || o.top === 'shirt';
  const m = o.top === 'jacket' ? 'jacket' : 'tee';
  // elbow: soft joint ball in the sleeve colour (or skin)
  P.push({ g: new THREE.SphereGeometry(longSleeve ? 0.07 : 0.05, seg, 8), m: longSleeve ? m : 'skin' });
  if (longSleeve) {
    P.push({ g: lathe(smoothProfile([[0.054, -0.235], [0.064, -0.19], [0.068, -0.1], [0.066, 0]], 10), seg), m });
    P.push({ g: lathe([[0.049, -0.278], [0.052, -0.262], [0.052, -0.24], [0.05, -0.226]], seg), m: o.top === 'jacket' ? 'jacketDark' : 'teeShade' });
    if (detail === 'high') P.push({ g: taperTube([V3(-0.04, -0.02, 0.05), V3(0, -0.03, 0.067), V3(0.04, -0.02, 0.05)], 0.004, 0.004, { tubular: 6, radial: 4, flat: 0.5 }), m: o.top === 'jacket' ? 'jacketDark' : 'teeShade' });
  } else {
    P.push({ g: lathe(smoothProfile([[0.04, -0.28], [0.046, -0.2], [0.05, -0.1], [0.05, 0]], 8), seg), m: 'skin' });
  }
  P.push({ g: lathe([[0.034, -0.31], [0.038, -0.28], [0.04, -0.26]], 10), m: 'skin' }); // wrist
  return P;
}
/** Static palm part (in the hand group: hand joint at the wrist, fingers hang along −y, palm faces −side·x). */
function palmParts(side: number): Part[] {
  return [
    { g: deform(softBox(0.017, 0.04, 0.036, 0.45, 12, 8), (v) => { v.x += side * (v.z * v.z) * 1.2; }), m: 'skin', t: T(0, -0.036, 0.002) },
  ];
}
const FINGERS = [{ z: 0.024, len: [0.025, 0.02] }, { z: 0.008, len: [0.028, 0.022] }, { z: -0.008, len: [0.027, 0.021] }, { z: -0.023, len: [0.021, 0.017] }];
const fingerSeg = (len: number, r: number) => { const g = lathe(smoothProfile([[0.0001, -len - r * 0.6], [r * 0.85, -len], [r, -len * 0.5], [r, 0]], 6), 6); return g; };
const HAND_POSES: Record<HandPose, { curl: number[]; thumb: [number, number] }> = {
  relaxed: { curl: [0.35, 0.4, 0.45, 0.5], thumb: [0.25, 0.2] },
  fist: { curl: [1.45, 1.5, 1.5, 1.5], thumb: [0.9, 0.7] },
  grip: { curl: [1.05, 1.1, 1.15, 1.2], thumb: [0.85, 0.5] },
  pinch: { curl: [0.6, 0.85, 1.3, 1.4], thumb: [0.8, 0.45] },
  open: { curl: [0.05, 0.04, 0.05, 0.08], thumb: [0.0, 0.0] },
  phone: { curl: [0.9, 0.95, 1.0, 1.05], thumb: [0.35, 0.25] },
  wheel: { curl: [1.2, 1.25, 1.3, 1.35], thumb: [0.6, 0.3] },
};

function legParts(o: Outfit, side: number, detail: Detail): Part[] {
  const seg = detail === 'high' ? 14 : 8;
  const P: Part[] = [];
  if (o.shorts) {
    P.push({ g: lathe(smoothProfile([[0.108, -0.22], [0.11, -0.1], [0.115, 0.04]], 6), seg).scale(1, 1, 0.92), m: 'pants' });
    P.push({ g: lathe(smoothProfile([[0.062, -0.42], [0.07, -0.3], [0.075, -0.2]], 6), seg), m: 'skin' });
  } else if (o.skirt) {
    P.push({ g: lathe(smoothProfile([[0.068, -0.42], [0.075, -0.3], [0.08, -0.15], [0.085, 0.0]], 8), seg), m: 'skin' });
  } else {
    P.push({ g: lathe(smoothProfile([[0.1, -0.415], [0.102, -0.3], [0.108, -0.15], [0.113, -0.02], [0.116, 0.05]], 10), seg).scale(1, 1, 0.93), m: 'pants' });
    // outer seam and front crease folds
    P.push({ g: taperTube([V3(side * 0.112, 0.03, 0), V3(side * 0.106, -0.2, 0), V3(side * 0.1, -0.41, 0)], 0.0025, 0.0025, { tubular: 6, radial: 4 }), m: 'pantsDark' });
    if (detail === 'high') for (const y of [-0.34, -0.37]) P.push({ g: taperTube([V3(-0.06, y, 0.075), V3(0, y - 0.008, 0.096), V3(0.06, y, 0.075)], 0.0045, 0.0045, { tubular: 6, radial: 4, flat: 0.5 }), m: 'pantsDark' });
    if (detail === 'high') P.push({ g: taperTube([V3(side * 0.04, -0.02, 0.1), V3(side * 0.02, -0.12, 0.103)], 0.004, 0.002, { tubular: 4, radial: 4, flat: 0.5 }), m: 'pantsDark' });
    if (o.cargo) {
      // cargo side pocket with a flap
      P.push({ g: softBox(0.012, 0.062, 0.05, 0.35), m: 'pantsLight', t: T(side * 0.108, -0.22, 0.0, 0, 0, side * -0.04) });
      P.push({ g: softBox(0.015, 0.018, 0.054, 0.3), m: 'pants', t: T(side * 0.112, -0.155, 0.0) });
    }
  }
  return P;
}
function shinParts(o: Outfit, detail: Detail): Part[] {
  const seg = detail === 'high' ? 14 : 8;
  const P: Part[] = [];
  const bare = o.shorts || o.skirt;
  if (bare) {
    P.push({ g: new THREE.SphereGeometry(0.068, seg, 8), m: 'skin' });
    P.push({ g: lathe(smoothProfile([[0.042, -0.38], [0.05, -0.3], [0.062, -0.12], [0.066, 0]], 8), seg), m: 'skin' });
  } else {
    P.push({ g: new THREE.SphereGeometry(0.1, seg, 8).scale(1, 1, 0.93), m: 'pants' });
    P.push({ g: lathe(smoothProfile([[0.102, -0.33], [0.1, -0.2], [0.098, -0.08], [0.099, 0]], 10), seg).scale(1, 1, 0.95), m: 'pants' });
    // rolled cuff: outer roll and the lighter lining showing at the top edge
    P.push({ g: lathe(smoothProfile([[0.106, -0.385], [0.112, -0.37], [0.112, -0.335], [0.108, -0.322]], 6), seg), m: 'cuff' });
    P.push({ g: lathe([[0.108, -0.322], [0.104, -0.318], [0.1, -0.316]], seg), m: 'cuffLining' });
  }
  P.push({ g: lathe([[0.04, -0.43], [0.042, -0.39], [0.044, -0.36]], 10), m: 'sock' });
  // sneaker, ankle at (0, -0.42, 0.03): ground at y = −0.52 in knee space
  const S = T(0, -0.42, 0.03);
  const add = (g: THREE.BufferGeometry, m: string, t = T()) => P.push({ g, m, t: S.clone().multiply(t) });
  const outline = new THREE.Shape();
  const L = 0.27, Wd = 0.052;
  outline.moveTo(0, -0.075);
  outline.bezierCurveTo(Wd * 0.95, -0.075, Wd, 0.0, Wd * 0.92, 0.05);
  outline.bezierCurveTo(Wd * 1.05, 0.12, Wd * 1.0, L - 0.075 - 0.02, 0, L - 0.075);
  outline.bezierCurveTo(-Wd * 1.0, L - 0.075 - 0.02, -Wd * 1.05, 0.12, -Wd * 0.85, 0.05);
  outline.bezierCurveTo(-Wd, 0.0, -Wd * 0.95, -0.075, 0, -0.075);
  const sole = new THREE.ExtrudeGeometry(outline, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: detail === 'high' ? 10 : 5 });
  sole.rotateX(Math.PI / 2); // shape y → z (toe forward), extrusion goes down
  add(sole, 'outsole', T(0, -0.074, 0));
  const mid = new THREE.ExtrudeGeometry(outline, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: detail === 'high' ? 10 : 5 });
  mid.rotateX(Math.PI / 2); mid.scale(0.985, 1, 0.985);
  add(mid, 'sole', T(0, -0.056, 0.001));
  // upper: a rounded hull, flat at the bottom, lower at the toe, with a heel counter
  const upper = deform(new THREE.SphereGeometry(1, detail === 'high' ? 16 : 10, detail === 'high' ? 12 : 8), (v) => {
    v.y = Math.max(v.y, -0.55);
    if (v.z > 0.2) v.y = Math.min(v.y, 1 - (v.z - 0.2) * 1.05);
    v.x *= 1 - 0.1 * Math.max(0, -v.z);
  });
  add(upper, 'shoe', T(0, -0.025, 0.06, 0, 0, 0, 0.05, 0.05, 0.134));
  add(softBox(0.026, 0.034, 0.008, 0.45), 'shoe', T(0, 0.012, 0.075, -0.55)); // tongue
  if (detail === 'high') for (let k = 0; k < 4; k++) { const z = 0.085 + k * 0.022; add(softBox(0.024, 0.0035, 0.005, 0.5), 'lace', T(0, 0.012 - k * 0.008, z, -0.5)); }
  for (const s of [-1, 1]) for (const k of [0, 1]) add(taperTube([V3(s * 0.05, -0.044, 0.02 + k * 0.04), V3(s * 0.052, -0.012, 0.045 + k * 0.04), V3(s * 0.046, 0.008, 0.07 + k * 0.035)], 0.0055, 0.004, { tubular: 4, radial: 4, flat: 0.4 }), 'stripe');
  add(softBox(0.018, 0.022, 0.008, 0.4), 'stripe', T(0, -0.02, -0.075)); // heel tab
  return P;
}

// ---- head accessories --------------------------------------------------------------
function headExtras(o: Outfit): Part[] {
  const P: Part[] = [];
  if (o.hat === 'nonla') P.push({ g: lathe([[0.3, -0.005], [0.27, 0.01], [0.01, 0.17]], 18), m: 'nonla', t: T(0, 0.1, -0.01) });
  if (o.hat === 'cap') {
    P.push({ g: new THREE.SphereGeometry(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m: 'hat', t: T(0, 0.035, -0.005, -0.12, 0, 0, 1, 0.85, 1.05) });
    P.push({ g: softBox(0.085, 0.006, 0.065, 0.5), m: 'hat', t: T(0, 0.04, 0.13, 0.08) });
  }
  if (o.hat === 'helmet') {
    P.push({ g: new THREE.SphereGeometry(0.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m: 'hat', t: T(0, 0.01, -0.005, -0.1, 0, 0, 1, 0.95, 1.08) });
    P.push({ g: taperTube([V3(-0.1, 0.0, 0.11), V3(0, 0.02, 0.15), V3(0.1, 0.0, 0.11)], 0.01, 0.01, { tubular: 8, radial: 5, flat: 0.5 }), m: 'hat' });
    P.push({ g: taperTube([V3(-0.1, -0.02, 0.0), V3(-0.06, -0.15, 0.04), V3(0, -0.17, 0.06), V3(0.06, -0.15, 0.04), V3(0.1, -0.02, 0.0)], 0.004, 0.004, { tubular: 10, radial: 4, flat: 0.4 }), m: 'bagDark' });
  }
  if (o.glasses) {
    for (const s of [-1, 1]) {
      const ring = Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return V3(s * 0.04 + Math.cos(a) * 0.024, 0.006 + Math.sin(a) * 0.017, 0.112); });
      P.push({ g: taperTube(ring, 0.0024, 0.0024, { tubular: 16, radial: 4 }), m: 'glasses' });
      P.push({ g: taperTube([V3(s * 0.064, 0.012, 0.105), V3(s * 0.099, 0.014, 0.05), V3(s * 0.1, 0.0, -0.02)], 0.002, 0.002, { tubular: 6, radial: 4 }), m: 'glasses' });
    }
    P.push({ g: taperTube([V3(-0.016, 0.012, 0.114), V3(0, 0.016, 0.117), V3(0.016, 0.012, 0.114)], 0.002, 0.002, { tubular: 4, radial: 4 }), m: 'glasses' });
  }
  return P;
}

function earParts(side: number): Part[] {
  const E = T(side * 0.098, -0.012, -0.01, 0, side * 0.25, 0);
  const rim = [V3(0, 0.026, 0.006), V3(side * 0.006, 0.034, -0.012), V3(side * 0.008, 0.012, -0.026), V3(side * 0.006, -0.014, -0.02), V3(side * 0.004, -0.03, -0.006), V3(0, -0.032, 0.006)];
  return [
    { g: taperTube(rim, 0.0075, 0.007, { tubular: 10, radial: 5, flat: 0.55 }), m: 'skin', t: E },
    { g: softBox(0.006, 0.026, 0.016, 0.7), m: 'skinShade', t: E.clone().multiply(T(side * 0.003, 0.0, -0.008)) },
    { g: softBox(0.008, 0.03, 0.018, 0.8), m: 'skin', t: E.clone().multiply(T(-side * 0.004, 0, 0.004)) },
  ];
}

// ---- component ------------------------------------------------------------------------
type Props = { outfit: Outfit; expression?: Expression; detail?: Detail; idleLook?: boolean; castShadow?: boolean };

/** One bone's merged static meshes. */
function Baked({ parts, pal, shadow }: { parts: { m: string; g: THREE.BufferGeometry }[]; pal: Pal; shadow: boolean }) {
  return <>{parts.map((p) => <mesh key={p.m} geometry={p.g} material={(pal as unknown as Record<string, THREE.Material>)[p.m]} castShadow={shadow && p.m !== 'blush'} receiveShadow />)}</>;
}

export const HumanModel = forwardRef<PlayerRig, Props>(function HumanModel({ outfit: o, expression = 'neutral', detail = 'high', idleLook = false, castShadow = true }, ref) {
  const pal = useMemo(() => palette(o), [o]);
  const key = JSON.stringify(o) + detail;
  const geo = useMemo(() => {
    const head = headGeometry(o, detail);
    const hair = hairLocks(o.hairStyle, detail);
    return {
      head,
      hairBaked: bake(hair.map((l) => ({ g: l.g, m: l.tone }))),
      headExtras: bake([...headExtras(o), ...earParts(1), ...earParts(-1),
        { g: deform(new THREE.SphereGeometry(1, 10, 8), (v) => { if (v.z > 0.3) v.y -= (v.z - 0.3) * 0.5; }), m: 'skinShade', t: T(0, -0.024, 0.104, 0.15, 0, 0, 0.0095, 0.014, 0.011) },
      ]),
      neck: bake([{ g: lathe(smoothProfile([[0.054, -0.02], [0.05, 0.06], [0.052, 0.13]], 5), 12), m: 'skin' }]),
      torso: bake([...torsoParts(o, detail), ...bagParts(o)]),
      pelvis: bake(o.skirt
        ? [{ g: lathe(smoothProfile([[0.24, -0.38], [0.21, -0.2], [0.18, 0.0], [0.17, 0.09]], 10), detail === 'high' ? 20 : 12).scale(1, 1, 0.82), m: 'pants' }]
        : [{ g: lathe(smoothProfile([[0.17, -0.11], [0.2, -0.04], [0.197, 0.06], [0.19, 0.1]], 8), detail === 'high' ? 20 : 12).scale(1, 1, 0.8), m: 'pants' },
          { g: taperTube(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return V3(Math.sin(a) * 0.193, 0.085, Math.cos(a) * 0.193 * 0.8); }), 0.008, 0.008, { tubular: 16, radial: 4 }), m: 'pantsDark' },
          ...(detail === 'high' ? [-1, 1].map((s): Part => ({ g: taperTube([V3(s * 0.07, 0.07, 0.15), V3(s * 0.13, 0.0, 0.135), V3(s * 0.165, -0.04, 0.1)], 0.004, 0.004, { tubular: 5, radial: 4, flat: 0.5 }), m: 'pantsDark' })) : []),
          ...(detail === 'high' ? [-1, 1].map((s): Part => ({ g: softBox(0.045, 0.05, 0.006, 0.35), m: 'pantsLight', t: T(s * 0.08, -0.02, -0.152) })) : []),
        ]),
      upperL: bake(upperArmParts(o, 1, detail)), upperR: bake(upperArmParts(o, -1, detail)),
      fore: bake(forearmParts(o, detail)),
      palmL: bake(palmParts(1)), palmR: bake(palmParts(-1)),
      legL: bake(legParts(o, 1, detail)), legR: bake(legParts(o, -1, detail)),
      shin: bake(shinParts(o, detail)),
      fingers: FINGERS.map((f) => [fingerSeg(f.len[0], 0.0085), fingerSeg(f.len[1], 0.0078)]),
      thumb: [fingerSeg(0.022, 0.0095), fingerSeg(0.018, 0.0085)],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => { geo.head.dispose(); }, [geo]);

  const r = {
    root: useRef<THREE.Group>(null!), hips: useRef<THREE.Group>(null!), spine: useRef<THREE.Group>(null!), neck: useRef<THREE.Group>(null!), head: useRef<THREE.Group>(null!),
    shoulderL: useRef<THREE.Group>(null!), elbowL: useRef<THREE.Group>(null!), handL: useRef<THREE.Group>(null!),
    shoulderR: useRef<THREE.Group>(null!), elbowR: useRef<THREE.Group>(null!), handR: useRef<THREE.Group>(null!),
    hipL: useRef<THREE.Group>(null!), kneeL: useRef<THREE.Group>(null!), hipR: useRef<THREE.Group>(null!), kneeR: useRef<THREE.Group>(null!),
    chest: useRef<THREE.Group>(null!),
  };
  // finger joints: [hand][finger 0..4 (4 = thumb)][segment 0..1]
  const fingerRefs = useRef<THREE.Group[][][]>([[[], [], [], [], []], [[], [], [], [], []]]);
  const handTarget = useRef<HandPose[]>(['relaxed', 'relaxed']);
  const handCur = useRef<number[][]>([[0.35, 0.4, 0.45, 0.5, 0.25, 0.2], [0.35, 0.4, 0.45, 0.5, 0.25, 0.2]]);
  useImperativeHandle(ref, () => ({
    ...(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'chest').map(([k, v]) => [k, v.current])) as Omit<PlayerRig, 'setHand'>),
    setHand: (side: 'L' | 'R', pose: HandPose) => { handTarget.current[side === 'L' ? 0 : 1] = pose; },
  }), []);
  const face = useFace(expression, detail);
  const idle = useRef({ t: Math.random() * 10, look: 0, lookTarget: 0, lookAt: 3 });
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = idle.current; s.t += dt;
    // breathing and idle look-around
    if (r.chest.current) { const b = Math.sin(s.t * 1.7); r.chest.current.scale.set(1 + b * 0.006, 1 + b * 0.01, 1 + b * 0.012); }
    s.lookAt -= dt;
    if (s.lookAt <= 0) { s.lookAt = 3 + Math.random() * 4; s.lookTarget = idleLook ? (Math.random() - 0.5) * 0.7 : 0; }
    if (!idleLook) s.lookTarget = 0;
    s.look += (s.lookTarget - s.look) * Math.min(1, dt * 2.2);
    if (r.neck.current) r.neck.current.rotation.set(Math.sin(s.t * 1.7) * 0.012, s.look, Math.sin(s.t * 0.6) * 0.012);
    // fingers
    if (detail === 'high') for (let h = 0; h < 2; h++) {
      const pose = HAND_POSES[handTarget.current[h]]; const cur = handCur.current[h]; const side = h === 0 ? 1 : -1;
      const target = [...pose.curl, ...pose.thumb];
      for (let k = 0; k < 6; k++) cur[k] += (target[k] - cur[k]) * Math.min(1, dt * 14);
      for (let f = 0; f < 4; f++) {
        const seg = fingerRefs.current[h][f];
        if (seg[0]) seg[0].rotation.z = -side * cur[f];
        if (seg[1]) seg[1].rotation.z = -side * cur[f] * 1.1;
      }
      const th = fingerRefs.current[h][4];
      if (th[0]) th[0].rotation.set(cur[4] * 0.9, 0, -side * (0.5 + cur[4] * 0.4));
      if (th[1]) th[1].rotation.set(cur[5], 0, 0);
    }
  });

  const sh = castShadow;
  const hand = (side: 1 | -1) => {
    const h = side === 1 ? 0 : 1;
    return <>
      <Baked parts={side === 1 ? geo.palmL : geo.palmR} pal={pal} shadow={sh} />
      {detail === 'high'
        ? <>
          {FINGERS.map((f, i) => <group key={i} ref={(g) => { if (g) fingerRefs.current[h][i][0] = g; }} position={[side * 0.002, -0.07, f.z]}>
            <mesh geometry={geo.fingers[i][0]} material={pal.skin} castShadow={sh} />
            <group ref={(g) => { if (g) fingerRefs.current[h][i][1] = g; }} position={[0, -f.len[0], 0]}>
              <mesh geometry={geo.fingers[i][1]} material={pal.skin} castShadow={sh} />
            </group>
          </group>)}
          <group ref={(g) => { if (g) fingerRefs.current[h][4][0] = g; }} position={[-side * 0.006, -0.022, 0.034]}>
            <mesh geometry={geo.thumb[0]} material={pal.skin} castShadow={sh} />
            <group ref={(g) => { if (g) fingerRefs.current[h][4][1] = g; }} position={[0, -0.022, 0]}><mesh geometry={geo.thumb[1]} material={pal.skin} /></group>
          </group>
        </>
        : <mesh material={pal.skin} position={[0, -0.075, 0]} scale={[0.017, 0.022, 0.034]} geometry={mittenGeo} castShadow={sh} />}
    </>;
  };
  const arm = (side: 1 | -1, shoulder: React.RefObject<THREE.Group>, elbow: React.RefObject<THREE.Group>, handRef: React.RefObject<THREE.Group>) =>
    <group ref={shoulder} position={[side * D.shoulderX, D.shoulderY - D.hipY - 0.06, 0]} rotation={[0, 0, side * 0.1]}>
      <Baked parts={side === 1 ? geo.upperL : geo.upperR} pal={pal} shadow={sh} />
      <group ref={elbow} position={[0, -D.upperArm, 0]} rotation={[-0.12, 0, 0]}>
        <Baked parts={geo.fore} pal={pal} shadow={sh} />
        <group ref={handRef} position={[0, -D.forearm - 0.035, 0]}>{hand(side)}</group>
      </group>
    </group>;
  const leg = (side: 1 | -1, hip: React.RefObject<THREE.Group>, knee: React.RefObject<THREE.Group>) =>
    <group ref={hip} position={[side * 0.1, 0, 0]}>
      <Baked parts={side === 1 ? geo.legL : geo.legR} pal={pal} shadow={sh} />
      <group ref={knee} position={[0, -D.thigh, 0]}><Baked parts={geo.shin} pal={pal} shadow={sh} /></group>
    </group>;
  const E = 0.043; // eye x offset
  return <group ref={r.root} scale={o.height}>
    <group ref={r.hips} position={[0, D.hipY, 0]}>
      <Baked parts={geo.pelvis} pal={pal} shadow={sh} />
      {leg(1, r.hipL, r.kneeL)}
      {leg(-1, r.hipR, r.kneeR)}
      <group ref={r.spine} position={[0, 0.06, 0]}>
        <group ref={r.chest} scale={[o.build, 1, o.build]}><Baked parts={geo.torso} pal={pal} shadow={sh} /></group>
        {arm(1, r.shoulderL, r.elbowL, r.handL)}
        {arm(-1, r.shoulderR, r.elbowR, r.handR)}
        <group ref={r.neck} position={[0, D.neckY - D.hipY - 0.06, 0]}>
          <Baked parts={geo.neck} pal={pal} shadow={sh} />
          <group ref={r.head} position={[0, D.headY - D.neckY - HEAD_DROP, 0.008]}>
            <mesh geometry={geo.head} material={pal.headVC} castShadow={sh} receiveShadow />
            <Baked parts={geo.hairBaked} pal={pal} shadow={sh} />
            <Baked parts={geo.headExtras} pal={pal} shadow={sh} />
            {/* eyes: eyeball, iris + pupil + highlights (gaze), upper/lower lids with lashes (blink) */}
            {[1, -1].map((side, i) => <group key={side} position={[side * E, 0.006, 0.089]} rotation={[0.02, side * 0.28, 0]} scale={[0.026, 0.023, 0.012]}>
              <mesh geometry={eyeballGeo} material={pal.eyeWhite} />
              <group ref={face.irises[i]}>
                <mesh geometry={disc} material={pal.iris} position={[0, 0, 0.985]} scale={0.66} />
                <mesh geometry={disc} material={pal.pupil} position={[0, -0.02, 0.99]} scale={0.32} />
                <mesh geometry={disc} material={pal.shine} position={[side * -0.22 + 0.1, 0.28, 0.995]} scale={0.17} />
                <mesh geometry={disc} material={pal.shine} position={[side * 0.18, -0.26, 0.995]} scale={0.08} />
              </group>
              <group ref={face.lidsUp[i]}><mesh geometry={lidGeo} material={pal.skin} /><mesh geometry={lashGeo} material={pal.lash} /></group>
              <group ref={face.lidsLow[i]}><mesh geometry={lowLidGeo} material={pal.skinShade} /></group>
            </group>)}
            {[1, -1].map((side, i) => <group key={`b${side}`} ref={face.brows[i]} position={[side * 0.019, 0.048, 0.103]}>
              <mesh geometry={browGeo} material={pal.brow} scale={[side, 1, 1]} />
            </group>)}
            <group ref={face.cheeks}>{[1, -1].map((side) => <mesh key={side} geometry={disc} material={pal.blush} position={[side * 0.058, -0.03, 0.094]} rotation={[0, side * 0.55, 0]} scale={[0.015, 0.009, 1]} />)}</group>
            <group ref={face.mouth} position={[0, -0.062, 0.1]} rotation={[-0.2, 0, 0]}>
              <mesh ref={face.line} geometry={MOUTH_LINES.neutral} material={pal.lip} />
              <group ref={face.open} position={[0, 0, 0.002]} visible={false}>
                <mesh geometry={mouthOpenGeo} material={pal.mouthIn} />
                <mesh ref={face.teeth} geometry={teethGeo} material={pal.teeth} position={[0, 0, 0.001]} />
                <mesh ref={face.tongue} geometry={tongueGeo} material={pal.tongue} position={[0, -0.42, 0.001]} scale={[0.6, 0.4, 1]} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  </group>;
});
const mittenGeo = softBox(1, 1, 1, 0.6, 8, 6);
