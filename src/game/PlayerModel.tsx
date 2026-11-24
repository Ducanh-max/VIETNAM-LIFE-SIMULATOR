import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';

/*
 * Player character after the "Người Chơi" sheet, as a jointed low-poly model. The rig (root, hips,
 * spine, neck, head, shoulder/elbow/hand L/R, hip/knee L/R) is driven by Avatar.tsx.
 * L = the character's left = +X; the model faces +Z.
 */
export type Expression = 'neutral' | 'happy' | 'surprised';
export type PlayerRig = {
  root: THREE.Group; hips: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group;
  shoulderL: THREE.Group; elbowL: THREE.Group; handL: THREE.Group;
  shoulderR: THREE.Group; elbowR: THREE.Group; handR: THREE.Group;
  hipL: THREE.Group; kneeL: THREE.Group; hipR: THREE.Group; kneeR: THREE.Group;
};
export const PLAYER_DIMENSIONS = { hipY: 0.92, thigh: 0.4, shin: 0.42, shoulderY: 1.36, shoulderX: 0.22, upperArm: 0.3, forearm: 0.27, neckY: 1.45, headY: 1.635 };
export const PALETTE = {
  hair: '#3a2e2a', skin: '#efbf98', skinShade: '#e2a988', tee: '#efe9df', jacket: '#728c66', jacketDark: '#5f7856', jacketLight: '#86a07a',
  hood: '#e4d9c6', pants: '#3b3d42', cuff: '#5b5e64', shoe: '#f1ece2', sole: '#e3ddd1', stripe: '#24262b', bag: '#2f2e2d', zip: '#e58b45',
  eye: '#231b18', mouth: '#b4473f', tongue: '#e0776c', cheek: '#f0a08a',
};
const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.85) {
  const key = `${color}-${roughness}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }));
  return mats.get(key)!;
}
function tube(rTop: number, rBottom: number, h: number, seg = 7, open = false, thetaStart = 0, thetaLength = Math.PI * 2) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open, thetaStart, thetaLength);
}
function useGeometries() {
  return useMemo(() => {
    const head = new THREE.SphereGeometry(0.128, 12, 9); head.scale(1, 1.08, 1.02);
    const upper = new THREE.CapsuleGeometry(0.06, 0.17, 3, 8); upper.rotateX(Math.PI / 2); upper.scale(1.05, 0.95, 1);
    const tuft = new THREE.DodecahedronGeometry(0.05, 0); tuft.scale(1, 1.7, 0.75); tuft.translate(0, 0.045, 0);
    const hairCap = new THREE.SphereGeometry(0.142, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); hairCap.scale(1.03, 0.95, 1.05);
    const happyEye = new THREE.TorusGeometry(0.017, 0.0055, 4, 10, Math.PI);
    const smile = new THREE.CircleGeometry(0.032, 12, Math.PI, Math.PI);
    const tongue = new THREE.CircleGeometry(0.018, 10, Math.PI, Math.PI);
    return { head, upper, tuft, hairCap, happyEye, smile, tongue };
  }, []);
}
type Tuft = { p: THREE.Vector3; q: THREE.Quaternion; s: number };
const TUFTS: Tuft[] = [];
{
  const up = new THREE.Vector3(0, 1, 0);
  const add = (p: [number, number, number], d: [number, number, number], s: number, twist = 0) => {
    const dir = new THREE.Vector3(...d).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir).multiply(new THREE.Quaternion().setFromAxisAngle(up, twist));
    TUFTS.push({ p: new THREE.Vector3(...p), q, s });
  };
  const sph = (theta: number, phi: number, r: number): [number, number, number] => [Math.sin(phi) * Math.sin(theta) * r, Math.cos(phi) * r + 0.02, Math.sin(phi) * Math.cos(theta) * r];
  add(sph(0, 0, 0.1), [0.15, 1, -0.6], 1.3, 0.3);
  for (let i = 0; i < 7; i++) { const t = i * Math.PI * 2 / 7 + 0.3; const p = sph(t, 0.45, 0.11); add(p, [p[0] * 2.2, 1, p[2] * 2.2 - 0.3], 1.3, i); }
  for (let i = 0; i < 9; i++) { const t = i * Math.PI * 2 / 9 + 0.15; if (Math.cos(t) > 0.5) continue; const p = sph(t, 0.95, 0.115); add(p, [p[0] * 3, 0.7, p[2] * 3 - 0.1], 1.15, i * 2); }
  for (let i = 0; i < 5; i++) { const t = Math.PI + (i - 2) * 0.32; const p = sph(t, 1.3, 0.115); add(p, [p[0] * 2, -0.6, p[2] * 2], 0.9, i); }
  add([0.0, 0.135, 0.1], [-0.3, -1, 0.75], 0.75, 0.4); add([-0.06, 0.13, 0.095], [-0.4, -1, 0.7], 0.72, 1.1); add([0.06, 0.13, 0.095], [-0.15, -1, 0.7], 0.7, 2.0);
  add([-0.105, 0.11, 0.07], [-0.6, -0.8, 0.6], 0.7); add([0.105, 0.11, 0.07], [0.5, -0.8, 0.6], 0.7, 0.7);
}
function Face({ expression }: { expression: Expression }) {
  const g = useGeometries();
  const eye = mat(PALETTE.eye, 0.4);
  const white = mat('#ffffff', 0.3);
  const z = 0.128;
  return <group position={[0, -0.005, 0]}>
    {[-1, 1].map((s) => <group key={s} position={[s * 0.047, 0.012, z]}>
      {expression === 'happy'
        ? <mesh geometry={g.happyEye} material={eye} position={[0, -0.006, 0.004]} />
        : <>
          <mesh material={eye} scale={expression === 'surprised' ? [1.1, 1.3, 0.5] : [0.92, 1.25, 0.5]}><sphereGeometry args={[0.024, 10, 8]} /></mesh>
          <mesh material={white} position={[s * 0.006 + 0.004, 0.009, 0.01]}><sphereGeometry args={[0.0055, 6, 4]} /></mesh>
        </>}
      <mesh material={mat(PALETTE.hair)} position={[0, expression === 'surprised' ? 0.05 : 0.042, -0.004]} rotation={[0, 0, s * (expression === 'surprised' ? -0.15 : 0.08)]}><boxGeometry args={[0.036, 0.009, 0.01]} /></mesh>
    </group>)}
    {[-1, 1].map((s) => <mesh key={`c${s}`} material={mat(PALETTE.cheek, 0.9)} position={[s * 0.072, -0.03, 0.105]} rotation={[0, s * 0.6, 0]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[0.016, 8, 6]} /></mesh>)}
    <mesh material={mat(PALETTE.skinShade)} position={[0, -0.02, z + 0.008]} rotation={[0.2, 0, 0]}><coneGeometry args={[0.011, 0.02, 4]} /></mesh>
    <group position={[0, -0.058, z - 0.006]} rotation={[-0.25, 0, 0]}>
      {expression === 'surprised'
        ? <mesh material={mat(PALETTE.mouth, 0.6)} scale={[0.8, 1, 1]}><circleGeometry args={[0.014, 10]} /></mesh>
        : expression === 'happy'
          ? <><mesh geometry={g.smile} material={mat(PALETTE.mouth, 0.6)} /><mesh geometry={g.tongue} material={mat(PALETTE.tongue, 0.6)} position={[0, -0.012, 0.001]} /></>
          : <mesh geometry={g.smile} material={mat(PALETTE.mouth, 0.6)} scale={[0.7, 0.42, 1]} />}
    </group>
  </group>;
}
function Head({ expression }: { expression: Expression }) {
  const g = useGeometries();
  const hair = mat(PALETTE.hair, 0.95);
  const skin = mat(PALETTE.skin, 0.75);
  return <group>
    <mesh geometry={g.head} material={skin} castShadow />
    {[-1, 1].map((s) => <mesh key={s} material={skin} position={[s * 0.127, -0.005, -0.005]} scale={[0.45, 1, 0.75]}><sphereGeometry args={[0.03, 6, 5]} /></mesh>)}
    <mesh geometry={g.hairCap} material={hair} position={[0, 0.035, -0.012]} rotation={[-0.42, 0, 0]} castShadow />
    {TUFTS.map((t, i) => <mesh key={i} geometry={g.tuft} material={hair} position={t.p} quaternion={t.q} scale={t.s} castShadow />)}
    <Face expression={expression} />
  </group>;
}
function Shoe() {
  const g = useGeometries();
  return <group>
    <mesh material={mat(PALETTE.sole)} position={[0, 0.026, 0.035]} castShadow><boxGeometry args={[0.135, 0.052, 0.32]} /></mesh>
    <mesh geometry={g.upper} material={mat(PALETTE.shoe, 0.7)} position={[0, 0.075, 0.03]} castShadow />
    {[-1, 1].map((side) => [0, 1].map((k) => <mesh key={`${side}${k}`} material={mat(PALETTE.stripe, 0.6)} position={[side * 0.064, 0.082, 0.025 + k * 0.045]} rotation={[0.6, 0, 0]}><boxGeometry args={[0.006, 0.075, 0.018]} /></mesh>))}
    {[0, 1].map((k) => <mesh key={k} material={mat('#f7f3ea', 0.7)} position={[0, 0.112 - k * 0.012, 0.095 + k * 0.05]} rotation={[0.35, 0, 0]}><boxGeometry args={[0.122, 0.012, 0.03]} /></mesh>)}
  </group>;
}
type ModelProps = { expression?: Expression; shipperBag?: boolean };
export const PlayerModel = forwardRef<PlayerRig, ModelProps>(function PlayerModel({ expression = 'neutral', shipperBag = false }, ref) {
  const r = {
    root: useRef<THREE.Group>(null!), hips: useRef<THREE.Group>(null!), spine: useRef<THREE.Group>(null!), neck: useRef<THREE.Group>(null!), head: useRef<THREE.Group>(null!),
    shoulderL: useRef<THREE.Group>(null!), elbowL: useRef<THREE.Group>(null!), handL: useRef<THREE.Group>(null!),
    shoulderR: useRef<THREE.Group>(null!), elbowR: useRef<THREE.Group>(null!), handR: useRef<THREE.Group>(null!),
    hipL: useRef<THREE.Group>(null!), kneeL: useRef<THREE.Group>(null!), hipR: useRef<THREE.Group>(null!), kneeR: useRef<THREE.Group>(null!),
  };
  useImperativeHandle(ref, () => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.current])) as PlayerRig);
  const D = PLAYER_DIMENSIONS;
  const jacket = mat(PALETTE.jacket);
  const jacketDark = mat(PALETTE.jacketDark);
  const skin = mat(PALETTE.skin, 0.75);
  const pants = mat(PALETTE.pants, 0.9);
  const hood = mat(PALETTE.hood, 0.9);
  const strap = useMemo(() => {
    const from = new THREE.Vector3(0.13, 0.39, 0);
    const toFront = new THREE.Vector3(-0.2, 0.0, 0.13);
    const toBack = new THREE.Vector3(-0.2, 0.0, -0.11);
    const seg = (a: THREE.Vector3, b: THREE.Vector3, bulge: number) => {
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.z += bulge;
      return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.012, 4, false);
    };
    return [seg(from.clone().add(new THREE.Vector3(0, 0, 0.05)), toFront, 0.1), seg(from.clone().add(new THREE.Vector3(0, 0, -0.05)), toBack, -0.08)];
  }, []);
  const arm = (side: 1 | -1, shoulder: React.RefObject<THREE.Group>, elbow: React.RefObject<THREE.Group>, hand: React.RefObject<THREE.Group>) =>
    <group ref={shoulder} position={[side * D.shoulderX, D.shoulderY - D.hipY, 0]} rotation={[0, 0, side * 0.1]}>
      <mesh material={jacket} castShadow position={[-side * 0.015, -0.01, 0]} scale={[1.2, 0.8, 1.1]}><sphereGeometry args={[0.092, 7, 6]} /></mesh>
      <mesh material={jacket} position={[0, -D.upperArm / 2, 0]} castShadow geometry={upperSleeve} />
      <group ref={elbow} position={[0, -D.upperArm, 0]} rotation={[-0.12, 0, 0]}>
        <mesh material={jacket} castShadow><sphereGeometry args={[0.07, 7, 5]} /></mesh>
        <mesh material={jacket} position={[0, -D.forearm / 2 + 0.01, 0]} castShadow geometry={foreSleeve} />
        <mesh material={jacketDark} position={[0, -D.forearm + 0.03, 0]} castShadow><cylinderGeometry args={[0.057, 0.055, 0.045, 7]} /></mesh>
        <group ref={hand} position={[0, -D.forearm - 0.035, 0]}>
          <mesh material={skin} position={[0, -0.035, 0.005]} scale={[0.8, 1.05, 0.6]} castShadow><sphereGeometry args={[0.062, 7, 6]} /></mesh>
          <mesh material={skin} position={[-side * 0.03, -0.02, 0.03]} rotation={[0.4, 0, side * 0.5]}><capsuleGeometry args={[0.013, 0.035, 2, 5]} /></mesh>
        </group>
      </group>
    </group>;
  const leg = (side: 1 | -1, hip: React.RefObject<THREE.Group>, knee: React.RefObject<THREE.Group>) =>
    <group ref={hip} position={[side * 0.1, 0, 0]}>
      <mesh material={pants} position={[0, -D.thigh / 2, 0]} castShadow geometry={thighGeo} />
      <group ref={knee} position={[0, -D.thigh, 0]}>
        <mesh material={pants} castShadow><sphereGeometry args={[0.122, 7, 5]} /></mesh>
        <mesh material={pants} position={[0, -D.shin / 2 + 0.115, 0]} castShadow geometry={shinGeo} />
        <mesh material={mat(PALETTE.cuff, 0.9)} position={[0, -D.shin + 0.2, 0]} castShadow><cylinderGeometry args={[0.134, 0.136, 0.085, 8]} /></mesh>
        <group position={[0, -D.shin, 0.035]} scale={[1.6, 1.35, 1.3]}><Shoe /></group>
      </group>
    </group>;
  return <group ref={r.root}>
    <group ref={r.hips} position={[0, D.hipY, 0]}>
      <mesh material={pants} position={[0, 0.03, 0]} castShadow scale={[1, 0.8, 0.8]}><cylinderGeometry args={[0.2, 0.22, 0.18, 8]} /></mesh>
      {leg(1, r.hipL, r.kneeL)}
      {leg(-1, r.hipR, r.kneeR)}
      <group ref={r.spine} position={[0, 0.06, 0]}>
        <mesh material={mat(PALETTE.tee, 0.9)} position={[0, 0.22, 0.005]} castShadow scale={[1, 1, 0.72]}><cylinderGeometry args={[0.165, 0.17, 0.44, 8]} /></mesh>
        <mesh material={jacket} position={[0, 0.2, 0]} castShadow receiveShadow geometry={jacketBody} scale={[1, 1, 0.78]} />
        <mesh material={jacketDark} position={[0, -0.005, 0]} castShadow geometry={jacketHem} scale={[1, 1, 0.78]} />
        <mesh material={jacket} position={[0, 0.39, -0.01]} castShadow scale={[1.45, 0.38, 0.88]}><sphereGeometry args={[0.165, 8, 6]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} material={mat(PALETTE.jacketLight)} position={[s * 0.08, 0.2, 0.162]} rotation={[0.04, s * 0.35, 0]}><boxGeometry args={[0.014, 0.44, 0.012]} /></mesh>)}
        {[-1, 1].map((s) => <mesh key={`p${s}`} material={jacketDark} position={[s * 0.15, 0.07, 0.115]} rotation={[0, s * 0.75, 0.15 * s]}><boxGeometry args={[0.012, 0.11, 0.08]} /></mesh>)}
        <mesh material={hood} position={[0, 0.43, -0.025]} rotation={[Math.PI / 2 + 0.3, 0, Math.PI / 2 + Math.PI * 0.275 - Math.PI]} castShadow><torusGeometry args={[0.12, 0.058, 6, 12, Math.PI * 1.5]} /></mesh>
        <mesh material={hood} position={[0, 0.38, -0.13]} rotation={[0.3, 0, 0]} scale={[1.55, 1.25, 0.6]} castShadow><sphereGeometry args={[0.1, 7, 6]} /></mesh>
        {[-1, 1].map((s) => <group key={`d${s}`} position={[s * 0.05, 0.4, 0.14]}>
          <mesh material={hood} position={[0, -0.07, 0]}><cylinderGeometry args={[0.006, 0.006, 0.14, 4]} /></mesh>
          <mesh material={mat('#d6cab4')} position={[0, -0.15, 0]}><cylinderGeometry args={[0.01, 0.01, 0.025, 5]} /></mesh>
        </group>)}
        {!shipperBag && <>
          {strap.map((geo, i) => <mesh key={i} geometry={geo} material={mat(PALETTE.bag, 0.7)} position={[0, 0.06, 0]} castShadow />)}
          <group position={[-0.215, 0.04, 0.09]} rotation={[0, -0.75, 0.08]}>
            <mesh material={mat(PALETTE.bag, 0.75)} castShadow><boxGeometry args={[0.17, 0.14, 0.065]} /></mesh>
            <mesh material={mat('#3b3a39', 0.75)} position={[0, 0.045, 0.035]} rotation={[0.15, 0, 0]}><boxGeometry args={[0.172, 0.06, 0.012]} /></mesh>
            <mesh material={mat(PALETTE.zip, 0.5)} position={[0.07, 0.0, 0.037]}><boxGeometry args={[0.014, 0.04, 0.008]} /></mesh>
          </group>
        </>}
        {arm(1, r.shoulderL, r.elbowL, r.handL)}
        {arm(-1, r.shoulderR, r.elbowR, r.handR)}
        <group ref={r.neck} position={[0, D.neckY - D.hipY - 0.06, 0]}>
          <mesh material={skin} position={[0, 0.06, 0]} castShadow><cylinderGeometry args={[0.05, 0.058, 0.12, 7]} /></mesh>
          <group ref={r.head} position={[0, D.headY - D.neckY, 0.005]}>
            <group scale={1.22}><Head expression={expression} /></group>
          </group>
        </group>
      </group>
    </group>
  </group>;
});
const upperSleeve = tube(0.09, 0.074, 0.3, 7);
const foreSleeve = tube(0.074, 0.06, 0.26, 7);
const thighGeo = tube(0.125, 0.122, 0.42, 8);
const shinGeo = tube(0.122, 0.13, 0.2, 8);
const gap = 0.75;
const jacketBody = tube(0.205, 0.23, 0.46, 9, true, gap / 2, Math.PI * 2 - gap);
const jacketHem = tube(0.232, 0.226, 0.06, 9, true, gap / 2, Math.PI * 2 - gap);
mat(PALETTE.jacket).side = THREE.DoubleSide;
mat(PALETTE.jacketDark).side = THREE.DoubleSide;
