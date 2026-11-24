import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAN_OFFSET, drinkLevels, firstDrink, GLASS_OFFSET, lerpN, lerpV, mealAt, SET, setToBody, track } from './meal';
import { bike, game, player } from './state';
import { Bottle, bottleLip, Chopsticks, IceGlass, Morsel, TakeawayBag } from './world/food';
import { GRIP, SEAT } from './world/Scooter';

/*
 * The player's avatar with two-bone arms solved by IK, so hands can really hold chopsticks, a can,
 * a glass or the scooter grips. Coordinates: avatar faces +z; "body" space is the avatar group
 * lowered by the current seat drop; the torso pivots at the hips (y 0.92) to lean forward.
 */
const HIP = 0.92;
const L1 = 0.29; // upper arm
const L2 = 0.28; // forearm (wrist at the end; the hand sphere sits 0.045 beyond)
const HAND = 0.045;
const SHOULDER = (side: number) => new THREE.Vector3(side * 0.31, 0.6, 0); // torso space
const MOUTH = new THREE.Vector3(0, 0.86, 0.16); // torso space
const DOWN = new THREE.Vector3(0, -1, 0);
const tmpQ = new THREE.Quaternion();

/** Torso space ↔ body space. */
function toTorso(p: THREE.Vector3, lean: number) { return p.clone().sub(new THREE.Vector3(0, HIP, 0)).applyAxisAngle(new THREE.Vector3(1, 0, 0), -lean); }
function toBody(p: THREE.Vector3, lean: number) { return p.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), lean).add(new THREE.Vector3(0, HIP, 0)); }

/** Two-bone IK: places the upper arm and forearm groups so the hand centre reaches `hand`. */
function solveArm(side: number, hand: THREE.Vector3, upper: THREE.Group, fore: THREE.Group, pole = new THREE.Vector3(side * 0.7, -1, -0.2)) {
  const S = SHOULDER(side);
  const d = hand.clone().sub(S);
  const reach = L1 + L2 + HAND - 0.002;
  let len = d.length();
  const dir = d.normalize();
  len = THREE.MathUtils.clamp(len, 0.08, reach);
  const lw = len - HAND * 0.9; // shoulder → wrist distance
  const cosA = THREE.MathUtils.clamp((L1 * L1 + lw * lw - L2 * L2) / (2 * L1 * lw), -1, 1);
  const a = Math.acos(cosA);
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const E = S.clone().add(dir.clone().multiplyScalar(Math.cos(a) * L1)).add(p.multiplyScalar(Math.sin(a) * L1));
  const W = S.clone().add(dir.clone().multiplyScalar(lw));
  upper.position.copy(S);
  upper.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, E.clone().sub(S).normalize()));
  fore.position.copy(E);
  fore.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, W.clone().sub(E).normalize()));
  return S.clone().add(dir.multiplyScalar(len)); // where the hand actually is
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function Avatar({ speed }: { speed: { current: number } }) {
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const upper = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const fore = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const sticks = useRef<THREE.Group>(null);
  const morsel = useRef<THREE.Group>(null);
  const heldBottle = useRef<THREE.Group>(null);
  const heldGlass = useRef<THREE.Group>(null);
  const stream = useRef<THREE.Mesh>(null);
  const bag = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const [morselKind, setMorselKind] = useState<'noodle' | 'wrap' | 'dipped'>('noodle');
  const [glassLevel, setGlassLevel] = useState(0);
  const order = game.get().order;
  const drinkId = firstDrink(order) ?? 'lavie';
  const streamMat = useMemo(() => new THREE.MeshStandardMaterial({ color: drinkId === 'lavie' || drinkId === 'sevenup' ? '#e8f4ff' : '#3a1a0c', transparent: true, opacity: 0.75, roughness: 0.1 }), [drinkId]);
  const skin = '#c99a78';

  useFrame((_, dt) => {
    const b = body.current, t = torso.current;
    const U = [upper[0].current, upper[1].current], F = [fore[0].current, fore[1].current];
    if (!b || !t || !U[0] || !U[1] || !F[0] || !F[1]) return;
    const s = game.get();
    phase.current += dt * (4 + speed.current * 1.25);
    // reset props
    let showSticks = false, showMorsel = false, showBottle = false, showGlass = false, showStream = false, showBag = false;
    let lean = 0; let headPitch = 0;
    const L = 1, R = -1; // arm sides: left arm at +x, right arm at −x
    const hip = (side: number, rot: number, splay = 0) => legs[side < 0 ? 0 : 1].current?.rotation.set(rot, 0, splay);
    /** Damp the torso toward the target lean now, and return the lean actually shown (used for all torso-space maths). */
    const applyLean = (target: number) => { t.rotation.x = THREE.MathUtils.damp(t.rotation.x, target, 12, dt); return t.rotation.x; };
    let bottlePose: { hand: THREE.Vector3; tilt: number; grip: number } | null = null;
    let glassPose: { hand: THREE.Vector3; tilt: number } | null = null;
    let streamPose: { lip: THREE.Vector3; surface: THREE.Vector3 } | null = null;

    if (bike.riding) {
      // ---- on the scooter: hips on the seat, feet on the floorboard, hands on the grips
      b.position.set(0, SEAT.y - HIP, SEAT.z);
      hip(-1, -1.05, 0.12); hip(1, -1.05, -0.12);
      lean = applyLean(0.28);
      for (const side of [R, L]) {
        const g = GRIP(side, bike.steer); // bike space
        const bodyP = V(g.x - SEAT.x, g.y - SEAT.y + HIP, g.z - SEAT.z);
        solveArm(side, toTorso(bodyP, lean), U[side < 0 ? 0 : 1]!, F[side < 0 ? 0 : 1]!, V(side * 1, -0.6, -0.3));
      }
    } else if (player.seat) {
      // ---- seated at the table
      b.position.set(0, -0.52, 0);
      hip(-1, -1.38, 0.1); hip(1, -1.38, -0.1);
      const restR = V(-0.16, 1.1, 0.4); const restL = V(0.36, 1.06, 0.36);
      const eating = s.phase === 'eating' || s.phase === 'finished' || s.phase === 'served';
      let handR = restR.clone(); let handL = restL.clone();
      if (eating) {
        showSticks = true;
        const m = mealAt(s.order, s.phase === 'eating' ? s.eatProgress : s.phase === 'finished' ? 1 : 0);
        const lv = drinkLevels(s.order, s.phase === 'eating' ? s.eatProgress : s.phase === 'finished' ? 1 : 0);
        if (Math.abs(lv.glass - glassLevel) > 0.01) setGlassLevel(lv.glass);
        const mouth = toBody(MOUTH, 0);
        const tableD = V(-0.05, -0.62, 0.78).normalize();
        const mouthD = V(0.35, 0.3, -0.88).normalize();
        let tip = restR.clone().add(tableD.clone().multiplyScalar(0.2)); let tipDir = tableD.clone();
        if (m.action?.kind === 'bite') {
          const u = m.u;
          const B = setToBody(SET.bun[0], 0, SET.bun[1]); const H = setToBody(SET.herbs[0], 0, SET.herbs[1]); const Br = setToBody(SET.broth[0], 0, SET.broth[1]);
          const rest = tip.clone();
          tip = track(u, [
            [0, rest], [0.14, B.clone().add(V(0, 0.09, 0))], [0.2, B.clone().add(V(0, 0.025, 0))], [0.3, B.clone().add(V(0, 0.11, 0))],
            [0.4, H.clone().add(V(0, 0.13, 0))], [0.46, H.clone().add(V(0, 0.065, 0))], [0.54, H.clone().add(V(0, 0.14, 0))],
            [0.62, Br.clone().add(V(0, 0.13, 0))], [0.68, Br.clone().add(V(0, 0.06, 0))], [0.74, Br.clone().add(V(0, 0.15, 0))],
            [0.85, mouth.clone().add(V(0, -0.02, 0.03))], [0.89, mouth.clone().add(V(0, -0.01, 0.02))], [1, rest],
          ], lerpV);
          tipDir = track(u, [[0, tableD], [0.74, tableD], [0.85, mouthD], [0.89, mouthD], [1, tableD]], (a, b2, k) => a.clone().lerp(b2, k).normalize());
          lean = track(u, [[0, 0.05], [0.14, 0.22], [0.4, 0.3], [0.62, 0.18], [0.85, 0.12], [1, 0.05]], lerpN);
          headPitch = track(u, [[0, 0.25], [0.74, 0.3], [0.85, 0.05], [0.9, 0.08], [1, 0.25]], lerpN);
          showMorsel = u > 0.2 && u < 0.885;
          const kind = u < 0.46 ? 'noodle' : u < 0.68 ? 'wrap' : 'dipped';
          if (kind !== morselKind) setMorselKind(kind);
          handL = restL;
        } else if (m.action && firstDrink(s.order)) {
          const id = firstDrink(s.order)!;
          const C = setToBody(SET.drink[0] + CAN_OFFSET, 0, SET.drink[1]); const G = setToBody(SET.drink[0] + GLASS_OFFSET, 0, SET.drink[1]);
          const grip = id === 'lavie' ? 0.1 : 0.06;
          const u = m.u;
          headPitch = 0.2;
          if (m.action.kind === 'pour') {
            const above = G.clone().add(V(-0.07, 0.2, 0));
            handL = track(u, [[0, restL], [0.18, C.clone().add(V(0, grip, 0))], [0.22, C.clone().add(V(0, grip, 0))], [0.36, above], [0.78, above], [0.9, C.clone().add(V(0, grip, 0))], [0.93, C.clone().add(V(0, grip, 0))], [1, restL]], lerpV);
            const tilt = track(u, [[0, 0], [0.38, 0], [0.48, -1.95], [0.7, -1.95], [0.8, 0], [1, 0]], lerpN);
            showBottle = u > 0.2 && u < 0.92;
            lean = track(u, [[0, 0.05], [0.18, 0.2], [0.36, 0.15], [0.9, 0.2], [1, 0.05]], lerpN);
            bottlePose = { hand: handL.clone(), tilt, grip };
            showStream = u > 0.47 && u < 0.72;
            if (showStream) streamPose = { lip: V(0, bottleLip(id) - grip, 0).applyAxisAngle(V(0, 0, 1), tilt).add(handL), surface: G.clone().add(V(0, 0.01 + 0.1 * lv.glass, 0)) };
          } else {
            const atMouth = toBody(MOUTH, 0).add(V(0.02, -0.13, 0.09));
            handL = track(u, [[0, restL], [0.2, G.clone().add(V(0, 0.06, 0))], [0.24, G.clone().add(V(0, 0.06, 0))], [0.46, atMouth], [0.74, atMouth], [0.86, G.clone().add(V(0, 0.06, 0))], [0.9, G.clone().add(V(0, 0.06, 0))], [1, restL]], lerpV);
            const tilt = track(u, [[0, 0], [0.46, 0], [0.56, -1.0], [0.72, -1.15], [0.8, 0], [1, 0]], lerpN);
            headPitch = track(u, [[0, 0.2], [0.46, 0], [0.56, -0.28], [0.72, -0.32], [0.8, 0.1], [1, 0.2]], lerpN);
            lean = track(u, [[0, 0.05], [0.2, 0.18], [0.46, 0], [0.86, 0.18], [1, 0.05]], lerpN);
            showGlass = u > 0.22 && u < 0.9;
            glassPose = { hand: handL.clone(), tilt };
          }
        }
        handR = tip.clone().sub(tipDir.clone().multiplyScalar(0.2));
        const al = applyLean(lean);
        if (sticks.current) {
          // chopsticks run from the hand to the tip; lay the group's +z along tipDir
          sticks.current.position.copy(toTorso(handR.clone().add(tipDir.clone().multiplyScalar(0.1)), al));
          sticks.current.quaternion.setFromUnitVectors(V(0, 0, 1), tipDir.clone().applyAxisAngle(V(1, 0, 0), -al));
        }
        if (morsel.current) morsel.current.position.copy(toTorso(tip.clone().add(V(0, -0.008, 0)), al));
        if (heldBottle.current && bottlePose) { heldBottle.current.position.copy(toTorso(bottlePose.hand, al)); heldBottle.current.rotation.set(-al, 0, bottlePose.tilt); heldBottle.current.children[0].position.set(0, -bottlePose.grip, 0); }
        if (heldGlass.current && glassPose) { heldGlass.current.position.copy(toTorso(glassPose.hand, al)); heldGlass.current.rotation.set(glassPose.tilt - al, 0, 0); heldGlass.current.children[0].position.set(0, -0.06, 0); }
        if (stream.current && streamPose) {
          const lip = toTorso(streamPose.lip, al); const surface = toTorso(streamPose.surface, al);
          stream.current.position.copy(lip.clone().add(surface).multiplyScalar(0.5));
          stream.current.scale.set(1, Math.max(0.01, lip.distanceTo(surface)), 1);
          stream.current.quaternion.setFromUnitVectors(V(0, 1, 0), lip.clone().sub(surface).normalize());
        }
      }
      const al = t.rotation.x;
      if (!eating) applyLean(0);
      solveArm(R, toTorso(handR, al), U[0]!, F[0]!);
      solveArm(L, toTorso(handL, al), U[1]!, F[1]!);
    } else {
      // ---- walking (with the takeaway bag in hand while delivering)
      const run = Math.min(1, speed.current / 5);
      const swing = run * Math.sin(phase.current) * 0.6;
      b.position.set(0, Math.abs(Math.sin(phase.current)) * 0.05 * run, 0);
      hip(-1, swing); hip(1, -swing);
      applyLean(0);
      const carrying = s.job?.stage === 'deliver';
      for (const side of [R, L]) {
        const i = side < 0 ? 0 : 1;
        const sw = (side < 0 ? -swing : swing) * 0.8;
        const dirU = V(side * 0.08, -Math.cos(sw), Math.sin(sw)).normalize();
        const S = SHOULDER(side);
        const E = S.clone().add(dirU.clone().multiplyScalar(L1));
        const dirF = dirU.clone().add(V(0, 0, 0.18 + Math.max(0, sw) * 0.4)).normalize();
        let W = E.clone().add(dirF.clone().multiplyScalar(L2));
        if (carrying && side === R) W = solveArm(R, V(-0.27, 0.12, 0.14), U[0]!, F[0]!);
        else {
          U[i]!.position.copy(S); U[i]!.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, dirU));
          F[i]!.position.copy(E); F[i]!.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, dirF));
        }
        if (carrying && side === R && bag.current) { bag.current.position.copy(W).add(V(0, -0.3, 0)); showBag = true; }
      }
    }
    if (head.current) head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, headPitch, 10, dt);
    if (sticks.current) sticks.current.visible = showSticks;
    if (morsel.current) morsel.current.visible = showMorsel;
    if (heldBottle.current) heldBottle.current.visible = showBottle;
    if (heldGlass.current) heldGlass.current.visible = showGlass;
    if (stream.current) stream.current.visible = showStream;
    if (bag.current) bag.current.visible = showBag;
  });

  return <group ref={body}>
    {[-1, 1].map((side, i) => <group key={`l${side}`} ref={legs[i]} position={[side * 0.12, HIP, 0]}>
      <mesh position={[0, -0.42, 0]} castShadow><capsuleGeometry args={[0.09, 0.62, 4, 8]} /><meshStandardMaterial color="#33415a" roughness={0.85} /></mesh>
      <mesh position={[0, -0.86, 0.06]} castShadow><boxGeometry args={[0.15, 0.09, 0.3]} /><meshStandardMaterial color="#f2f2f2" roughness={0.6} /></mesh>
    </group>)}
    <group ref={torso} position={[0, HIP, 0]}>
      <mesh position={[0, 0.33, 0]} castShadow><capsuleGeometry args={[0.24, 0.5, 6, 12]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh>
      <mesh position={[0, 0.06, 0]} castShadow><cylinderGeometry args={[0.25, 0.24, 0.16, 12]} /><meshStandardMaterial color="#2c2b2a" roughness={0.6} /></mesh>
      <mesh position={[0, 0.38, -0.22]} castShadow><boxGeometry args={[0.36, 0.42, 0.14]} /><meshStandardMaterial color="#2f5d50" roughness={0.8} /></mesh>
      <group ref={head} position={[0, 0.74, 0]}>
        <mesh><cylinderGeometry args={[0.07, 0.08, 0.12, 8]} /><meshStandardMaterial color={skin} /></mesh>
        <mesh position={[0, 0.18, 0]} castShadow><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
        <mesh position={[0, 0.26, -0.02]} castShadow><sphereGeometry args={[0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1]} /><meshStandardMaterial color="#1b1715" roughness={0.9} /></mesh>
      </group>
      {[-1, 1].map((side, i) => <group key={`a${side}`}>
        <group ref={upper[i]}><mesh position={[0, -L1 / 2, 0]} castShadow><capsuleGeometry args={[0.07, L1 - 0.06, 4, 8]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh></group>
        <group ref={fore[i]}>
          <mesh position={[0, -L2 / 2, 0]} castShadow><capsuleGeometry args={[0.058, L2 - 0.06, 4, 8]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh>
          <mesh position={[0, -L2 - HAND * 0.6, 0]}><sphereGeometry args={[0.06, 10, 8]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
      </group>)}
      <group ref={sticks} visible={false}><group position={[0, 0, 0.02]}><Chopsticks spread={0.008} /></group></group>
      <group ref={morsel} visible={false}><Morsel kind={morselKind} /></group>
      <group ref={heldBottle} visible={false}><group><Bottle id={drinkId} /></group></group>
      <group ref={heldGlass} visible={false}><group><IceGlass id={drinkId} level={glassLevel} /></group></group>
      <mesh ref={stream} visible={false} material={streamMat}><cylinderGeometry args={[0.007, 0.009, 1, 8]} /></mesh>
      <group ref={bag} visible={false}><TakeawayBag /></group>
    </group>
  </group>;
}
