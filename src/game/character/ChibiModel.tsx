import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { browGeometry, cheekGeometry, chibiGeometry, eyeArcGeometry, eyeGeometry, FACE, mouthGeometries, PLAYER_DIMENSIONS, surf, surfRot, type ChibiGeo, type Lod, type MouthKey } from './chibiGeometry';
import type { Outfit } from './outfit';

/*
 * The chibi low-poly character used by the player and every NPC: one hierarchical Group rig, a big
 * round head with a simple mesh face (oval eyes with highlights, small brows, a nose dot, swappable
 * mouth shapes, blush), 5–10 rounded hair clumps, mitten hands with a finger clump and a thumb, and
 * three levels of detail picked by camera distance. All geometry comes from chibiGeometry.ts (cached,
 * vertex-coloured, one shared matte material).
 */
export { PLAYER_DIMENSIONS } from './chibiGeometry';
export type { Lod } from './chibiGeometry';
export type Expression = 'neutral' | 'smile' | 'happy' | 'laugh' | 'surprised' | 'sad' | 'angry' | 'confused' | 'talking' | 'eating' | 'drinking' | 'blink' | 'closed' | 'wink';
export type HandPose = 'relaxed' | 'fist' | 'grip' | 'pinch' | 'open' | 'phone' | 'wheel' | 'chopsticks' | 'cup' | 'wave';
export type PlayerRig = {
  root: THREE.Group; hips: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group;
  shoulderL: THREE.Group; elbowL: THREE.Group; handL: THREE.Group;
  shoulderR: THREE.Group; elbowR: THREE.Group; handR: THREE.Group;
  hipL: THREE.Group; kneeL: THREE.Group; hipR: THREE.Group; kneeR: THREE.Group;
  /** The crossbody bag's pivot (null without a sling bag), for a little swing. */
  bag: THREE.Group | null;
  /** Attachment points: palm centres, the mouth, the seat contact under the hips. */
  anchors: { handL: THREE.Group; handR: THREE.Group; mouth: THREE.Group; seat: THREE.Group };
  /** Set the pose of one hand ('L' = character's left). Blends smoothly. */
  setHand: (side: 'L' | 'R', pose: HandPose) => void;
  /** The level of detail currently shown. */
  lod: () => Lod;
};
const D = PLAYER_DIMENSIONS;

/** One matte, vertex-coloured material shared by every chibi character. */
export const CHIBI_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
const CHEEK_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

// Face geometry shared by every character (brows are per hair colour).
const FACE_GEO = { eye: [eyeGeometry(0), eyeGeometry(1)], arc: eyeArcGeometry(), mouths: mouthGeometries(), cheeks: cheekGeometry() };
const MOUTH_KEYS = Object.keys(FACE_GEO.mouths) as MouthKey[];
const browCache = new Map<string, THREE.BufferGeometry>();
const browFor = (c: string) => { let g = browCache.get(c); if (!g) { g = browGeometry(c); browCache.set(c, g); } return g; };

type FaceParams = { eye: number; eyeW?: number; arc?: 'both' | 'left'; brow: number; browY: number; mouth: MouthKey; anim?: 'talk' | 'chew'; blush: number; tilt?: number; asym?: number };
const FACES: Record<Expression, FaceParams> = {
  neutral: { eye: 1, brow: 0, browY: 0, mouth: 'neutral', blush: 0.85 },
  smile: { eye: 0.92, brow: 0.05, browY: 0.003, mouth: 'smile', blush: 1 },
  happy: { eye: 0.88, brow: 0.1, browY: 0.005, mouth: 'open', blush: 1.1 },
  laugh: { eye: 1, arc: 'both', brow: 0.15, browY: 0.008, mouth: 'laugh', blush: 1.25 },
  surprised: { eye: 1.22, eyeW: 1.08, brow: 0.12, browY: 0.016, mouth: 'o', blush: 0.9 },
  sad: { eye: 0.82, brow: 0.5, browY: 0.004, mouth: 'frown', blush: 0.55, tilt: 0.08 },
  angry: { eye: 0.78, brow: -0.55, browY: -0.007, mouth: 'frown', blush: 0.7 },
  confused: { eye: 0.95, brow: 0.2, browY: 0.006, mouth: 'flat', blush: 0.8, tilt: 0.16, asym: 1 },
  talking: { eye: 1, brow: 0.08, browY: 0.004, mouth: 'open', anim: 'talk', blush: 0.95 },
  eating: { eye: 1, arc: 'both', brow: 0.1, browY: 0.004, mouth: 'smile', anim: 'chew', blush: 1.15 },
  drinking: { eye: 0.55, brow: 0.05, browY: 0.002, mouth: 'o', blush: 0.9 },
  blink: { eye: 0.08, brow: 0, browY: 0, mouth: 'neutral', blush: 0.85 },
  closed: { eye: 0.08, brow: 0.05, browY: 0, mouth: 'smile', blush: 0.9 },
  wink: { eye: 1, arc: 'left', brow: 0.1, browY: 0.006, mouth: 'smile', blush: 1.1 },
};
/** Finger-clump curl and thumb [forward, inward] per hand pose. */
const HANDS: Record<HandPose, [number, number, number]> = {
  relaxed: [0.35, 0.2, 0.3], fist: [1.5, 0.9, 0.6], grip: [1.1, 0.8, 0.4], cup: [1.05, 0.7, 0.35], pinch: [0.85, 0.9, 0.5], chopsticks: [0.85, 0.9, 0.5],
  open: [0, 0, -0.15], wave: [0, 0, -0.2], phone: [0.95, 0.3, 0.3], wheel: [1.25, 0.6, 0.3],
};

type Props = {
  outfit: Outfit; expression?: Expression; idleLook?: boolean; castShadow?: boolean;
  /** LOD shown [near, middle, far] and the distances (m) between them. Player: [0,1,2]; NPCs: [1,2,2]. */
  lodLevels?: [Lod, Lod, Lod]; lodDistances?: [number, number];
};

export const ChibiModel = forwardRef<PlayerRig, Props>(function ChibiModel({ outfit: o, expression = 'neutral', idleLook = false, castShadow = false, lodLevels = [0, 1, 2], lodDistances = [14, 40] }, ref) {
  const levelsKey = lodLevels.join();
  const key = JSON.stringify(o);
  const geos = useMemo(() => [...new Set(lodLevels)].sort().map((l) => ({ l: l as Lod, g: chibiGeometry(o, l as Lod) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, levelsKey]);
  const lodObjs = useMemo(() => new Set<THREE.Object3D>(), [geos]);
  const cur = useRef<Lod>(lodLevels[0]);
  const reg = (l: Lod | 'face') => (obj: THREE.Object3D | null) => {
    if (!obj) return;
    obj.userData.lodTag = l; lodObjs.add(obj);
    obj.visible = l === 'face' ? cur.current < 2 : l === cur.current;
  };
  const r = {
    root: useRef<THREE.Group>(null!), hips: useRef<THREE.Group>(null!), spine: useRef<THREE.Group>(null!), neck: useRef<THREE.Group>(null!), head: useRef<THREE.Group>(null!),
    shoulderL: useRef<THREE.Group>(null!), elbowL: useRef<THREE.Group>(null!), handL: useRef<THREE.Group>(null!),
    shoulderR: useRef<THREE.Group>(null!), elbowR: useRef<THREE.Group>(null!), handR: useRef<THREE.Group>(null!),
    hipL: useRef<THREE.Group>(null!), kneeL: useRef<THREE.Group>(null!), hipR: useRef<THREE.Group>(null!), kneeR: useRef<THREE.Group>(null!),
  };
  const chest = useRef<THREE.Group>(null);
  const bag = useRef<THREE.Group>(null);
  const anchors = { handL: useRef<THREE.Group>(null!), handR: useRef<THREE.Group>(null!), mouth: useRef<THREE.Group>(null!), seat: useRef<THREE.Group>(null!) };
  const fingers = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const thumbs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const eyes = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const eyeOpen = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const eyeArc = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const brows = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const mouths = useRef<Partial<Record<MouthKey, THREE.Mesh>>>({});
  const mouthGroup = useRef<THREE.Group>(null);
  const cheeks = useRef<THREE.Mesh>(null);
  const handTarget = useRef<HandPose[]>(['relaxed', 'relaxed']);
  const handCur = useRef<number[][]>([[...HANDS.relaxed], [...HANDS.relaxed]]);
  useImperativeHandle(ref, () => ({
    ...(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.current])) as Omit<PlayerRig, 'setHand' | 'bag' | 'anchors' | 'lod'>),
    bag: bag.current,
    anchors: { handL: anchors.handL.current, handR: anchors.handR.current, mouth: anchors.mouth.current, seat: anchors.seat.current },
    setHand: (side: 'L' | 'R', pose: HandPose) => { handTarget.current[side === 'L' ? 0 : 1] = pose; },
    lod: () => cur.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [geos]);
  useEffect(() => () => { lodObjs.clear(); }, [lodObjs]);

  const st = useRef({ t: Math.random() * 10, look: 0, lookTarget: 0, lookAt: 3, blinkAt: 2 + Math.random() * 3, blinkT: -1, eye: 1, eyeW: 1, brow: 0, browY: 0, blush: 0.85, tilt: 0, mouthT: 0, mouthI: 0, lodCheck: 0, band: 0 });
  const wp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current; s.t += dt;
    // ---- level of detail by camera distance (checked a few times a second, with hysteresis)
    s.lodCheck -= dt;
    if (s.lodCheck <= 0 && r.root.current) {
      s.lodCheck = 0.25;
      r.root.current.getWorldPosition(wp);
      const d = wp.distanceTo(state.camera.position);
      const cb = s.band;
      const band = d < lodDistances[0] + (cb === 0 ? 1 : -1) ? 0 : d < lodDistances[1] + (cb <= 1 ? 1 : -1) ? 1 : 2;
      s.band = band;
      const next = lodLevels[band];
      if (next !== cur.current) {
        cur.current = next;
        lodObjs.forEach((obj) => { const l = obj.userData.lodTag; obj.visible = l === 'face' ? next < 2 : l === next; });
      }
      r.root.current.userData.lod = cur.current;
    }
    const near = cur.current < 2;
    // ---- breathing and idle look-around
    if (chest.current) { const b = Math.sin(s.t * 1.8); chest.current.scale.set(o.build * (1 + b * 0.008), 1 + b * 0.012, o.build * (1 + b * 0.014)); }
    s.lookAt -= dt;
    if (s.lookAt <= 0) { s.lookAt = 2.5 + Math.random() * 4; s.lookTarget = idleLook ? (Math.random() - 0.5) * 0.8 : 0; }
    if (!idleLook) s.lookTarget = 0;
    s.look += (s.lookTarget - s.look) * Math.min(1, dt * 2.5);
    const f = FACES[expression];
    s.tilt += ((f.tilt ?? 0) + (idleLook ? Math.sin(s.t * 0.5) * 0.05 : 0) - s.tilt) * Math.min(1, dt * 4);
    if (r.neck.current) r.neck.current.rotation.set(Math.sin(s.t * 1.8) * 0.012, s.look, s.tilt + Math.sin(s.t * 0.7) * 0.01);
    if (!near) return;
    // ---- hands: finger clump curl and thumb, blended
    for (let h = 0; h < 2; h++) {
      const side = h === 0 ? 1 : -1; const target = HANDS[handTarget.current[h]]; const c = handCur.current[h];
      for (let k = 0; k < 3; k++) c[k] += (target[k] - c[k]) * Math.min(1, dt * 14);
      fingers[h].current?.rotation.set(0, 0, -side * c[0]);
      thumbs[h].current?.rotation.set(c[1], 0, -side * c[2]);
    }
    // ---- face: blink, eye shape, brows, mouth, blush
    s.blinkAt -= dt;
    if (s.blinkAt <= 0 && s.blinkT < 0) { s.blinkT = 0; s.blinkAt = 2 + Math.random() * 3; }
    let blink = 1;
    if (s.blinkT >= 0) { s.blinkT += dt; blink = 1 - 0.92 * Math.sin(Math.min(1, s.blinkT / 0.14) * Math.PI); if (s.blinkT > 0.14) s.blinkT = -1; }
    const k = 1 - Math.exp(-dt * 12);
    s.eye += (f.eye - s.eye) * k; s.eyeW += ((f.eyeW ?? 1) - s.eyeW) * k;
    s.brow += (f.brow - s.brow) * k; s.browY += (f.browY - s.browY) * k;
    let blush = f.blush;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1; // 0 = left eye (+x)
      const arc = f.arc === 'both' || (f.arc === 'left' && i === 0);
      const eo = eyeOpen[i].current, ea = eyeArc[i].current;
      if (eo) eo.visible = !arc;
      if (ea) ea.visible = arc;
      eyes[i].current?.scale.set(s.eyeW, arc ? 1 : Math.max(0.06, s.eye * blink), 1);
      const b = brows[i].current;
      if (b) { const asym = (f.asym ?? 0) * (i === 0 ? 0.25 : -0.1); b.position.y = FACE.browY + s.browY + asym * 0.02; b.rotation.z = -side * s.brow * 0.45 + asym; }
    }
    // mouth: shape by expression; talking cycles shapes, chewing alternates and puffs the cheeks
    let mk = f.mouth; let ms = 1;
    if (f.anim === 'talk') { s.mouthT -= dt; if (s.mouthT <= 0) { s.mouthT = 0.09 + Math.random() * 0.08; s.mouthI = (s.mouthI + 1 + Math.floor(Math.random() * 2)) % 4; } mk = (['open', 'o', 'smile', 'open'] as MouthKey[])[s.mouthI]; }
    if (f.anim === 'chew') { const c = Math.sin(s.t * 9); mk = c > 0 ? 'o' : 'smile'; ms = c > 0 ? 0.55 + c * 0.25 : 1; blush += Math.max(0, -c) * 0.15; }
    for (const key of MOUTH_KEYS) { const m = mouths.current[key]; if (m) m.visible = key === mk; }
    if (mouthGroup.current) mouthGroup.current.scale.set(1, ms, 1);
    s.blush += (blush - s.blush) * k;
    if (cheeks.current) { cheeks.current.visible = s.blush > 0.3; cheeks.current.scale.set(0.75 + s.blush * 0.25, 0.75 + s.blush * 0.25, 1); }
  });

  // ---- rendering ----------------------------------------------------------------------------
  const m = (pick: (g: ChibiGeo) => THREE.BufferGeometry | null) => geos.map(({ l, g }) => {
    const geo = pick(g);
    return geo ? <mesh key={l} ref={reg(l)} geometry={geo} material={CHIBI_MATERIAL} castShadow={castShadow} /> : null;
  });
  const hand = (side: 1 | -1, handRef: RefObject<THREE.Group>, anchor: RefObject<THREE.Group>) => {
    const h = side === 1 ? 0 : 1;
    return <group ref={handRef} position={[0, -D.forearm, 0]}>
      {m((g) => g.palm)}
      {m((g) => g.mitten)}
      <group ref={fingers[h]} position={[0, -0.048, 0]}>{m((g) => g.fingers)}</group>
      <group ref={thumbs[h]} position={[-side * 0.006, -0.018, 0.034]}>{m((g) => g.thumb)}</group>
      <group ref={anchor} position={[-side * 0.03, -0.05, 0]} />
    </group>;
  };
  const arm = (side: 1 | -1, shoulder: RefObject<THREE.Group>, elbow: RefObject<THREE.Group>, handRef: RefObject<THREE.Group>, anchor: RefObject<THREE.Group>) =>
    <group ref={shoulder} position={[side * D.shoulderX, D.shoulderY, 0]} rotation={[0, 0, side * 0.08]}>
      {m((g) => (side === 1 ? g.upperL : g.upperR))}
      <group ref={elbow} position={[0, -D.upperArm, 0]} rotation={[-0.1, 0, 0]}>
        {m((g) => g.fore)}
        {hand(side, handRef, anchor)}
      </group>
    </group>;
  const leg = (side: 1 | -1, hip: RefObject<THREE.Group>, knee: RefObject<THREE.Group>) =>
    <group ref={hip} position={[side * D.hipX, -D.hipDrop, 0]}>
      {m((g) => (side === 1 ? g.thighL : g.thighR))}
      <group ref={knee} position={[0, -D.thigh, 0]}>{m((g) => g.shin)}</group>
    </group>;
  const [mrx] = surfRot(0, FACE.mouthY);
  const brow = browFor(o.hairDark);
  return <group ref={r.root} scale={o.height} userData={{ chibi: true }}>
    <group ref={r.hips} position={[0, D.hipY, 0]}>
      {m((g) => g.pelvis)}
      <group ref={anchors.seat} position={[0, -0.1, 0]} />
      {leg(1, r.hipL, r.kneeL)}
      {leg(-1, r.hipR, r.kneeR)}
      <group ref={r.spine} position={[0, D.spineY, 0]}>
        <group ref={chest}>
          {m((g) => g.torso)}
          {o.logo && <group ref={reg('face')}>{logoDecals(o)}</group>}
          {o.sling && <group ref={bag} position={[-0.16, 0.0, 0.142]} rotation={[0, -0.75, 0]}>{m((g) => g.bag)}</group>}
        </group>
        {arm(1, r.shoulderL, r.elbowL, r.handL, anchors.handL)}
        {arm(-1, r.shoulderR, r.elbowR, r.handR, anchors.handR)}
        <group ref={r.neck} position={[0, D.neckY, 0]}>
          {m((g) => g.neck)}
          <group ref={r.head} position={[0, D.headY, 0]}>
            {m((g) => g.head)}
            {/* animated face (LOD 0/1); at LOD 2 a static face is baked into the head */}
            <group ref={reg('face')}>
              {[1, -1].map((side, i) => {
                const [rx, ry] = surfRot(side * FACE.eyeX, FACE.eyeY);
                return <group key={side} ref={eyes[i]} position={[side * FACE.eyeX, FACE.eyeY, surf(side * FACE.eyeX, FACE.eyeY)]} rotation={[rx, ry, 0]}>
                  <mesh ref={eyeOpen[i]} geometry={FACE_GEO.eye[cur.current === 0 ? 0 : 1]} material={CHIBI_MATERIAL} />
                  <mesh ref={eyeArc[i]} geometry={FACE_GEO.arc} material={CHIBI_MATERIAL} visible={false} />
                </group>;
              })}
              {[1, -1].map((side, i) => {
                const [rx, ry] = surfRot(side * FACE.eyeX, FACE.browY);
                return <group key={`b${side}`} ref={brows[i]} position={[side * FACE.eyeX, FACE.browY, surf(side * FACE.eyeX, FACE.browY) + 0.003]} rotation={[rx, ry, 0]}>
                  <mesh geometry={brow} material={CHIBI_MATERIAL} />
                </group>;
              })}
              <mesh ref={cheeks} geometry={FACE_GEO.cheeks} material={CHEEK_MATERIAL} />
              <group position={[0, FACE.mouthY, surf(0, FACE.mouthY) + 0.002]} rotation={[mrx, 0, 0]}>
                <group ref={mouthGroup}>
                  {MOUTH_KEYS.map((key) => <mesh key={key} ref={(mm) => { if (mm) mouths.current[key] = mm; }} geometry={FACE_GEO.mouths[key]} material={CHIBI_MATERIAL} visible={key === 'neutral'} />)}
                </group>
              </group>
            </group>
            <group ref={anchors.mouth} position={[0, FACE.mouthY, surf(0, FACE.mouthY)]} />
          </group>
        </group>
      </group>
    </group>
  </group>;
});

// ---- uniform logos (own simple designs) ----------------------------------------------
const LOGO_PLANE = new THREE.PlaneGeometry(1, 1);
const logoMats = new Map<string, THREE.Material>();
function logoMaterial(kind: 'bcda' | 'densm') {
  let m = logoMats.get(kind);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  const round = (x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.fill(); };
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 'bcda') {
    // a cream badge: a steaming bowl on the left, the shop's name on the right
    ctx.fillStyle = '#f6e7c1'; round(4, 4, 248, 120, 26);
    ctx.fillStyle = '#c8342b'; ctx.beginPath(); ctx.arc(54, 70, 34, 0, Math.PI); ctx.fill(); ctx.fillRect(18, 66, 72, 6);
    ctx.strokeStyle = '#c8342b'; ctx.lineWidth = 5; for (const x of [42, 54, 66]) { ctx.beginPath(); ctx.moveTo(x, 54); ctx.quadraticCurveTo(x - 8, 40, x, 26); ctx.stroke(); }
    ctx.fillStyle = '#8f2119'; ctx.font = 'bold 34px Arial, sans-serif'; ctx.fillText('BÚN CHẢ', 172, 46);
    ctx.fillStyle = '#c8342b'; ctx.font = 'bold 30px Arial, sans-serif'; ctx.fillText('ĐỨC ANH', 172, 88);
  } else {
    // a green lightning bolt in a ring and the app name
    ctx.fillStyle = '#0f1012'; round(4, 4, 248, 120, 22);
    ctx.strokeStyle = '#16c784'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(56, 64, 38, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#16c784'; ctx.beginPath(); ctx.moveTo(62, 30); ctx.lineTo(40, 70); ctx.lineTo(56, 70); ctx.lineTo(48, 100); ctx.lineTo(74, 56); ctx.lineTo(58, 56); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px Arial, sans-serif'; ctx.fillText('Đen', 150, 64);
    ctx.fillStyle = '#16c784'; ctx.fillText('SM', 222, 64);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  logoMats.set(kind, m);
  return m;
}
/** Chest badge on the left side and a big print on the back (or on the delivery backpack). */
function logoDecals(o: Outfit) {
  const mat = logoMaterial(o.logo!);
  const jacket = o.top === 'jacket';
  const r = jacket ? 0.181 : 0.163;
  const cx = jacket ? 0.11 : 0.1; const a = Math.asin(cx / r);
  const cz = Math.cos(a) * r * 0.8 + 0.005; const ny = Math.atan2(cx / (r * r), cz / (r * r * 0.64));
  return <>
    <mesh geometry={LOGO_PLANE} material={mat} position={[cx, jacket ? 0.12 : 0.2, cz]} rotation={[0, ny, 0]} scale={[0.08, 0.04, 1]} />
    {o.backpack
      ? <mesh geometry={LOGO_PLANE} material={mat} position={[0, 0.15, -0.272]} rotation={[0, Math.PI, 0]} scale={[0.2, 0.1, 1]} />
      : <mesh geometry={LOGO_PLANE} material={mat} position={[0, 0.19, -(r * 0.8 + 0.006)]} rotation={[0, Math.PI, 0]} scale={[0.18, 0.09, 1]} />}
  </>;
}

// ---- blob shadow ---------------------------------------------------------------------------
const blobTexture = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const BLOB_MATERIAL = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const BLOB_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Soft round contact shadow on the ground, shared by all characters (cheaper than shadow maps). */
export function BlobShadow({ size = 0.62, y = 0.012 }: { size?: number; y?: number }) {
  return <mesh geometry={BLOB_GEOMETRY} material={BLOB_MATERIAL} position={[0, y, 0]} scale={[size, 1, size * 0.85]} renderOrder={1} />;
}
