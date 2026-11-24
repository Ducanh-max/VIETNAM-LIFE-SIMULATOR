import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/*
 * The player's look, after the "Người Chơi" character sheet: a friendly young Hà Nội guy in stylised,
 * faceted low-poly — messy dark hair, big friendly eyes, cream tee under an open sage-green zip jacket
 * with a cream hood and drawstrings, a charcoal crossbody sling bag with an orange zip pull, wide
 * charcoal trousers with rolled cuffs and chunky off-white sneakers with two black stripes.
 * Every piece hangs off the existing rig (torso / head / arms / legs), so all animations still apply.
 */
export const PALETTE = { hair: '#3a302c', tee: '#ece6dc', jacket: '#6f8a62', hood: '#e2d8c6', pants: '#3b3c40', accent: '#e8a061', skin: '#e9b48e' };

let cache: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const flat = (color: string, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
  return {
    skin: flat(PALETTE.skin, 0.7),
    hair: flat(PALETTE.hair, 0.9),
    tee: flat(PALETTE.tee),
    jacket: flat(PALETTE.jacket),
    jacketDark: flat('#5d774f'),
    jacketShell: Object.assign(flat(PALETTE.jacket), { side: THREE.DoubleSide }),
    hemShell: Object.assign(flat('#5d774f'), { side: THREE.DoubleSide }),
    piping: flat('#a9bd99'),
    hood: flat(PALETTE.hood),
    pants: flat(PALETTE.pants),
    cuff: flat('#55565c'),
    shoe: flat('#efeae0', 0.7),
    sole: flat('#d9d2c4', 0.8),
    stripe: flat('#1f1f22', 0.6),
    bag: flat('#2f2d2c', 0.7),
    zip: flat(PALETTE.accent, 0.5),
    face: makeFaces(),
  };
}
export const playerMats = () => (cache ??= makeMats());

export type Expression = 'neutral' | 'happy' | 'surprised';

/** Face decals (eyes, brows, mouth, cheeks) for the three expressions on the character sheet. */
function makeFaces() {
  const draw = (kind: Expression) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const ex = [96, 160]; const ey = 122;
    ctx.lineCap = 'round';
    // cheeks
    ctx.fillStyle = 'rgba(240,130,110,.28)';
    for (const x of ex) { ctx.beginPath(); ctx.ellipse(x + (x < 128 ? -14 : 14), 160, 16, 9, 0, 0, Math.PI * 2); ctx.fill(); }
    // brows
    ctx.strokeStyle = '#2b211d'; ctx.lineWidth = 5;
    for (const x of ex) { const lift = kind === 'surprised' ? -10 : 0; ctx.beginPath(); ctx.moveTo(x - 15, ey - 30 + lift + (x < 128 ? 3 : -1)); ctx.quadraticCurveTo(x, ey - 38 + lift, x + 15, ey - 30 + lift + (x < 128 ? -1 : 3)); ctx.stroke(); }
    // eyes
    for (const x of ex) {
      if (kind === 'happy') {
        ctx.strokeStyle = '#2b211d'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(x, ey + 6, 12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      } else {
        const ry = kind === 'surprised' ? 17 : 15; const rx = kind === 'surprised' ? 12 : 10;
        ctx.fillStyle = '#231a16'; ctx.beginPath(); ctx.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 3, ey - 6, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 3, ey + 5, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    // nose
    ctx.strokeStyle = 'rgba(160,90,60,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(128, 140); ctx.quadraticCurveTo(134, 148, 128, 152); ctx.stroke();
    // mouth
    if (kind === 'happy') {
      ctx.fillStyle = '#5a1f1a'; ctx.beginPath(); ctx.moveTo(108, 170); ctx.quadraticCurveTo(128, 172, 148, 170); ctx.quadraticCurveTo(146, 196, 128, 197); ctx.quadraticCurveTo(110, 196, 108, 170); ctx.fill();
      ctx.fillStyle = '#e06a6a'; ctx.beginPath(); ctx.ellipse(128, 189, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(112, 170, 32, 5);
    } else if (kind === 'surprised') {
      ctx.fillStyle = '#5a1f1a'; ctx.beginPath(); ctx.ellipse(128, 180, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = '#5a2a22'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(114, 172); ctx.quadraticCurveTo(128, 182, 142, 172); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  };
  return { neutral: draw('neutral'), happy: draw('happy'), surprised: draw('surprised') };
}

const HEAD_R = 0.19;
// faceted geometry shared by all pieces
const headGeo = new THREE.SphereGeometry(HEAD_R, 12, 9);
const faceGeo = new THREE.SphereGeometry(HEAD_R + 0.003, 24, 18, Math.PI / 2 - 0.85, 1.7, Math.PI * 0.3, Math.PI * 0.42);
const tuft = new THREE.ConeGeometry(1, 1, 5);
const lump = new THREE.IcosahedronGeometry(1, 0);

/** Head group contents: neck, faceted head, face decal and chunky messy hair. Origin at the neck base. */
export function PlayerHead({ expression }: { expression: { current: Expression } }) {
  const m = playerMats();
  const face = useRef<THREE.Mesh>(null);
  useFrame(() => { if (face.current) face.current.material = m.face[expression.current]; });
  const hair = useMemo(() => {
    // [x, y, z, size, rotX, rotZ] relative to the head centre; cones point away from the scalp
    const parts: { p: [number, number, number]; s: [number, number, number]; r: [number, number, number]; g: THREE.BufferGeometry }[] = [];
    // crown and back: big irregular lumps
    for (const [x, y, z, s] of [[0, 0.1, -0.02, 0.17], [0.09, 0.08, -0.07, 0.13], [-0.09, 0.08, -0.07, 0.13], [0, 0.03, -0.12, 0.15], [0.11, 0.02, 0.0, 0.11], [-0.11, 0.02, 0.0, 0.11], [0, 0.13, 0.05, 0.13]] as const) parts.push({ p: [x, y, z], s: [s, s * 0.8, s], r: [x * 3, y * 9, z * 4], g: lump });
    // spiky tufts sticking up and back
    for (const [x, y, z, rx, rz] of [[0, 0.2, 0.0, -0.4, 0], [0.07, 0.19, -0.04, -0.6, -0.5], [-0.07, 0.19, -0.04, -0.6, 0.5], [0.03, 0.17, 0.08, 0.3, -0.3], [-0.05, 0.16, 0.09, 0.4, 0.4], [0, 0.12, -0.15, -1.3, 0]] as const) parts.push({ p: [x, y, z], s: [0.05, 0.11, 0.05], r: [rx, 0, rz], g: tuft });
    // fringe falling over the forehead
    for (const [x, rz] of [[-0.09, 0.5], [-0.045, 0.25], [0.0, -0.05], [0.05, -0.3], [0.095, -0.55]] as const) parts.push({ p: [x, 0.11, 0.135], s: [0.04, 0.075, 0.03], r: [Math.PI - 0.6, 0, Math.PI + rz], g: tuft });
    // short sides above the ears
    for (const sx of [-1, 1]) parts.push({ p: [sx * 0.17, 0.0, -0.03], s: [0.05, 0.1, 0.08], r: [0, 0, sx * 0.25], g: lump });
    return parts;
  }, []);
  return <group>
    <mesh position={[0, 0.07, 0]} material={m.skin}><cylinderGeometry args={[0.062, 0.072, 0.18, 7]} /></mesh>
    <group position={[0, 0.28, 0.01]}>
      <mesh geometry={headGeo} material={m.skin} scale={[1, 1.04, 0.98]} castShadow />
      <mesh ref={face} geometry={faceGeo} material={m.face.neutral} scale={[1, 1.04, 0.98]} />
      {/* ears */}
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.185, -0.01, 0]} scale={[0.03, 0.05, 0.04]} geometry={lump} material={m.skin} />)}
      {hair.map((h, i) => <mesh key={i} geometry={h.g} material={m.hair} position={h.p} scale={h.s} rotation={h.r} castShadow />)}
    </group>
  </group>;
}

/** Torso group contents (origin at the hips): tee, open jacket, hood, drawstrings, sling bag, waistband. */
export function PlayerTorso({ sling = true }: { sling?: boolean }) {
  const m = playerMats();
  const strap = useMemo(() => {
    const a = new THREE.Vector3(-0.2, 0.7, 0.13); const b = new THREE.Vector3(0.24, 0.12, 0.2);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return { mid, q, len: a.distanceTo(b) };
  }, []);
  const gap = 0.55; // open front of the jacket (radians)
  return <group>
    {/* waistband of the trousers */}
    <mesh position={[0, 0.05, 0]} material={m.pants} castShadow><cylinderGeometry args={[0.25, 0.25, 0.16, 8]} /></mesh>
    {/* cream tee */}
    <mesh position={[0, 0.4, 0]} material={m.tee} castShadow><cylinderGeometry args={[0.215, 0.235, 0.66, 8]} /></mesh>
    <mesh position={[0, 0.74, 0]} material={m.tee}><cylinderGeometry args={[0.11, 0.2, 0.06, 8]} /></mesh>
    {/* open zip jacket: a body shell with the front left open, shoulder yoke, hem, piping and pockets */}
    <mesh position={[0, 0.39, 0]} material={m.jacketShell} castShadow><cylinderGeometry args={[0.25, 0.27, 0.62, 10, 1, true, gap / 2, Math.PI * 2 - gap]} /></mesh>
    <mesh position={[0, 0.69, -0.01]} scale={[0.27, 0.1, 0.21]} geometry={lump} material={m.jacket} castShadow />
    <mesh position={[0, 0.08, 0]} material={m.hemShell}><cylinderGeometry args={[0.272, 0.272, 0.05, 10, 1, true, gap / 2, Math.PI * 2 - gap]} /></mesh>
    {[-1, 1].map((s) => <mesh key={`p${s}`} material={m.piping} position={[Math.sin(s * gap / 2) * 0.262, 0.39, Math.cos(gap / 2) * 0.262]} rotation={[0, s * gap / 2, 0]}><boxGeometry args={[0.018, 0.6, 0.012]} /></mesh>)}
    {[-1, 1].map((s) => <mesh key={`k${s}`} material={m.jacketDark} position={[s * 0.2, 0.2, 0.17]} rotation={[0, s * 0.75, 0]}><boxGeometry args={[0.11, 0.1, 0.02]} /></mesh>)}
    {/* hood resting on the shoulders and back of the neck */}
    <mesh position={[0, 0.76, -0.02]} rotation={[Math.PI / 2 + 0.2, 0, 0]} material={m.hood} castShadow><torusGeometry args={[0.13, 0.055, 6, 10]} /></mesh>
    <mesh position={[0, 0.66, -0.2]} scale={[0.17, 0.13, 0.08]} geometry={lump} material={m.hood} castShadow />
    {/* drawstrings with tips */}
    {[-1, 1].map((s) => <group key={`d${s}`} position={[s * 0.06, 0.6, 0.215]}>
      <mesh material={m.hood}><cylinderGeometry args={[0.008, 0.008, 0.18, 4]} /></mesh>
      <mesh position={[0, -0.1, 0]} material={m.hood}><cylinderGeometry args={[0.012, 0.012, 0.03, 5]} /></mesh>
    </group>)}
    {/* crossbody sling: strap from the right shoulder across the chest to a small bag at the left hip */}
    {sling && <>
      <mesh position={strap.mid} quaternion={strap.q} material={m.bag}><boxGeometry args={[0.035, strap.len, 0.012]} /></mesh>
      <mesh position={[-0.14, 0.62, -0.18]} rotation={[0.2, 0, 0.6]} material={m.bag}><boxGeometry args={[0.035, 0.35, 0.012]} /></mesh>
      <group position={[0.27, 0.1, 0.12]} rotation={[0, 0.5, 0]}>
        <mesh material={m.bag} castShadow><boxGeometry args={[0.2, 0.15, 0.07]} /></mesh>
        <mesh position={[0, 0.04, 0.036]} material={m.stripe}><boxGeometry args={[0.18, 0.006, 0.004]} /></mesh>
        <mesh position={[0.08, 0.02, 0.04]} material={m.zip}><boxGeometry args={[0.014, 0.035, 0.008]} /></mesh>
      </group>
    </>}
  </group>;
}

/** Upper arm (origin at the shoulder, pointing −y): jacket sleeve. */
export function PlayerUpperArm({ length }: { length: number }) {
  const m = playerMats();
  return <group>
    <mesh position={[0, -0.02, 0]} scale={[0.09, 0.08, 0.09]} geometry={lump} material={m.jacket} castShadow />
    <mesh position={[0, -length / 2, 0]} material={m.jacket} castShadow><cylinderGeometry args={[0.082, 0.074, length, 7]} /></mesh>
  </group>;
}

/** Forearm (origin at the elbow, pointing −y): slightly puffy sleeve, ribbed cuff and the hand. */
export function PlayerForearm({ length, hand }: { length: number; hand: number }) {
  const m = playerMats();
  return <group>
    <mesh position={[0, -0.01, 0]} scale={[0.075, 0.06, 0.075]} geometry={lump} material={m.jacket} />
    <mesh position={[0, -length * 0.45, 0]} material={m.jacket} castShadow><cylinderGeometry args={[0.074, 0.07, length * 0.85, 7]} /></mesh>
    <mesh position={[0, -length + 0.025, 0]} material={m.jacketDark}><cylinderGeometry args={[0.058, 0.058, 0.05, 7]} /></mesh>
    <mesh position={[0, -length - hand * 0.6, 0]} scale={[0.05, 0.058, 0.04]} geometry={lump} material={m.skin} />
  </group>;
}

/** Thigh (origin at the hip): wide trouser leg. */
export function PlayerThigh({ length }: { length: number }) {
  const m = playerMats();
  return <mesh position={[0, -length / 2, 0]} material={m.pants} castShadow><cylinderGeometry args={[0.112, 0.105, length + 0.04, 8]} /></mesh>;
}

/** Shin (origin at the knee): straight wide leg, rolled cuff and a chunky striped sneaker. */
export function PlayerShin({ length }: { length: number }) {
  const m = playerMats();
  return <group>
    <mesh position={[0, -length / 2 + 0.02, 0]} material={m.pants} castShadow><cylinderGeometry args={[0.105, 0.11, length - 0.04, 8]} /></mesh>
    <mesh position={[0, -length + 0.06, 0]} material={m.cuff}><cylinderGeometry args={[0.118, 0.118, 0.06, 8]} /></mesh>
    <group position={[0, -length + 0.02, 0.05]}>
      <mesh position={[0, 0.0, 0]} material={m.shoe} castShadow><boxGeometry args={[0.15, 0.09, 0.3]} /></mesh>
      <mesh position={[0, -0.05, 0.005]} material={m.sole}><boxGeometry args={[0.16, 0.035, 0.32]} /></mesh>
      <mesh position={[0, 0.03, 0.09]} scale={[0.075, 0.04, 0.07]} geometry={lump} material={m.shoe} />
      {[-1, 1].flatMap((s) => [-0.02, 0.03].map((dz) => <mesh key={`${s}${dz}`} material={m.stripe} position={[s * 0.077, 0.0, dz]} rotation={[0.6, 0, 0]}><boxGeometry args={[0.004, 0.075, 0.016]} /></mesh>))}
      {[0.02, 0.08].map((z) => <mesh key={z} material={m.sole} position={[0, 0.047, z]}><boxGeometry args={[0.155, 0.008, 0.035]} /></mesh>)}
    </group>
  </group>;
}
