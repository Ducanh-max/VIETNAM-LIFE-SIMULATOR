import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAN_OFFSET, drinkLevels, firstDrink, GLASS_OFFSET, lerpN, lerpV, mealAt, SET, setToBody, track } from './meal';
import { taxi } from './ride';
import { bike, game, player, useGame } from './state';
import { Bottle, bottleLip, Chopsticks, IceGlass, Morsel, TakeawayBag } from './world/food';
import { GRIP, PILLION, SEAT } from './world/Scooter';

/*
 * The player's avatar: two-bone arms solved by IK (so hands really hold chopsticks, a can, a glass or the
 * scooter grips) and two-bone legs (so it can sit on a stool or a scooter with the feet on the floor).
 * The avatar faces +z. "Body" space is the avatar group shifted by the current seat; the torso pivots at
 * the hips to lean forward. Held props follow the hand where the IK actually put it.
 */
const HIP = 0.92;
const THIGH = 0.44;
const SHIN = 0.44;
const L1 = 0.31; // upper arm
const L2 = 0.3; // forearm; the hand centre sits HAND beyond the wrist
const HAND = 0.045;
const SHOULDER = (side: number) => new THREE.Vector3(side * 0.31, 0.62, 0); // torso space
const MOUTH = new THREE.Vector3(0, 1.0, 0.16); // torso space
const DOWN = new THREE.Vector3(0, -1, 0);
const X = new THREE.Vector3(1, 0, 0);
const tmpQ = new THREE.Quaternion();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function toTorso(p: THREE.Vector3, lean: number) { return p.clone().sub(V(0, HIP, 0)).applyAxisAngle(X, -lean); }
function toBody(p: THREE.Vector3, lean: number) { return p.clone().applyAxisAngle(X, lean).add(V(0, HIP, 0)); }

/**
 * Two-bone IK in torso space. `pole` is the direction the elbow should point (out, down and a little
 * forward for anything done in front of the body). Returns the hand centre actually reached.
 */
function solveArm(side: number, hand: THREE.Vector3, upper: THREE.Group, fore: THREE.Group, pole = V(side * 0.85, -0.55, 0.3)) {
  const S = SHOULDER(side);
  const d = hand.clone().sub(S);
  const dir = d.clone().normalize();
  const len = THREE.MathUtils.clamp(d.length(), 0.12, L1 + L2 + HAND - 0.003);
  const lw = len - HAND; // shoulder → wrist
  const cosA = THREE.MathUtils.clamp((L1 * L1 + lw * lw - L2 * L2) / (2 * L1 * lw), -1, 1);
  const a = Math.acos(cosA);
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (p.lengthSq() < 1e-6) p.set(side, -1, 0); // pole parallel to the reach: pick any sideways bend
  p.normalize();
  const E = S.clone().addScaledVector(dir, Math.cos(a) * L1).addScaledVector(p, Math.sin(a) * L1);
  const W = S.clone().addScaledVector(dir, lw);
  upper.position.copy(S);
  upper.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, E.clone().sub(S).normalize()));
  fore.position.copy(E);
  fore.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, W.clone().sub(E).normalize()));
  return S.clone().addScaledVector(dir, len);
}

export function Avatar({ speed }: { speed: { current: number } }) {
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const thighs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const shins = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
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
  const drinkId = useGame((s) => firstDrink(s.order) ?? 'lavie');
  const streamMat = useMemo(() => new THREE.MeshStandardMaterial({ color: drinkId === 'lavie' || drinkId === 'sevenup' ? '#e8f4ff' : '#3a1a0c', transparent: true, opacity: 0.8, roughness: 0.1 }), [drinkId]);
  const skin = '#c99a78';

  useFrame((_, dt) => {
    const b = body.current, t = torso.current;
    const U = [upper[0].current, upper[1].current], F = [fore[0].current, fore[1].current];
    if (!b || !t || !U[0] || !U[1] || !F[0] || !F[1]) return;
    const s = game.get();
    phase.current += dt * (4 + speed.current * 1.25);
    let showSticks = false, showMorsel = false, showBottle = false, showGlass = false, showStream = false, showBag = false;
    let headPitch = 0;
    const R = -1, L = 1; // right arm at −x, left arm at +x
    const leg = (side: number, thigh: number, knee: number, splay = 0) => {
      const i = side < 0 ? 0 : 1;
      thighs[i].current?.rotation.set(thigh, 0, splay);
      shins[i].current?.rotation.set(knee, 0, 0);
    };
    /** Damp the torso toward the target lean and return the lean actually shown. */
    const lean = (target: number) => { t.rotation.x = THREE.MathUtils.damp(t.rotation.x, target, 12, dt); return t.rotation.x; };
    const arm = (side: number, target: THREE.Vector3, pole?: THREE.Vector3) => solveArm(side, target, U[side < 0 ? 0 : 1]!, F[side < 0 ? 0 : 1]!, pole);

    if (bike.riding || taxi.passenger) {
      // ---- on a scooter: hips on the seat, knees bent, feet on the floor / pegs
      const pillion = taxi.passenger;
      const seat = pillion ? PILLION : SEAT;
      b.position.set(0, seat.y - HIP, seat.z);
      leg(-1, pillion ? -1.3 : -1.45, pillion ? 1.2 : 1.25, 0.12); leg(1, pillion ? -1.3 : -1.45, pillion ? 1.2 : 1.25, -0.12);
      const al = lean(pillion ? 0.1 : 0.22);
      if (pillion) {
        arm(R, toTorso(V(-0.2, HIP + 0.05, 0.32), al), V(-1, -0.4, -0.2)); // hands resting on the thighs
        arm(L, toTorso(V(0.2, HIP + 0.05, 0.32), al), V(1, -0.4, -0.2));
      } else {
        for (const side of [R, L]) {
          const g = GRIP(side, bike.steer);
          arm(side, toTorso(V(g.x - seat.x, g.y - seat.y + HIP, g.z - seat.z), al), V(side, -0.7, -0.25));
        }
      }
    } else if (player.seat) {
      // ---- seated at the table
      b.position.set(0, -0.52, 0);
      leg(-1, -1.7, 1.85, 0.08); leg(1, -1.7, 1.85, -0.08); // low stool: knees up, feet flat
      const restR = V(-0.18, 1.1, 0.42); const restL = V(0.3, 1.08, 0.4);
      const eating = s.phase === 'eating' || s.phase === 'finished' || s.phase === 'served';
      let handR = restR.clone(); let handL = restL.clone();
      let leanTarget = 0.05;
      let tipDir = V(-0.05, -0.62, 0.78).normalize();
      let bottlePose: { tilt: number; grip: number } | null = null;
      let glassPose: { tilt: number } | null = null;
      let streamSurface: THREE.Vector3 | null = null;
      if (eating) {
        showSticks = true;
        const p = s.phase === 'eating' ? s.eatProgress : s.phase === 'finished' ? 1 : 0;
        const m = mealAt(s.order, p);
        const lv = drinkLevels(s.order, p);
        if (Math.abs(lv.glass - glassLevel) > 0.01) setGlassLevel(lv.glass);
        const mouth = toBody(MOUTH, 0);
        const tableD = V(-0.05, -0.62, 0.78).normalize();
        const mouthD = V(0.35, 0.3, -0.88).normalize();
        let tip = restR.clone().addScaledVector(tableD, 0.2);
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
          tipDir = track(u, [[0, tableD], [0.74, tableD], [0.85, mouthD], [0.89, mouthD], [1, tableD]], (a, c, k) => a.clone().lerp(c, k).normalize());
          leanTarget = track(u, [[0, 0.05], [0.14, 0.22], [0.4, 0.32], [0.62, 0.2], [0.85, 0.12], [1, 0.05]], lerpN);
          headPitch = track(u, [[0, 0.25], [0.74, 0.3], [0.85, 0.05], [0.9, 0.08], [1, 0.25]], lerpN);
          showMorsel = u > 0.2 && u < 0.885;
          const kind = u < 0.46 ? 'noodle' : u < 0.68 ? 'wrap' : 'dipped';
          if (kind !== morselKind) setMorselKind(kind);
        } else if (m.action && firstDrink(s.order)) {
          const id = firstDrink(s.order)!;
          const solo = !(s.order.buncha ?? 0);
          const dx = solo ? 0 : SET.drink[0]; const dz = solo ? 0 : SET.drink[1];
          const C = setToBody(dx + CAN_OFFSET, 0, dz); const G = setToBody(dx + GLASS_OFFSET, 0, dz);
          const grip = id === 'lavie' ? 0.1 : 0.06;
          const u = m.u;
          headPitch = 0.22;
          if (m.action.kind === 'pour') {
            // grip the can, lift it over the glass, tip it, pour, put it back
            const above = G.clone().add(V(-0.06, 0.2, 0));
            handL = track(u, [[0, restL], [0.18, C.clone().add(V(0, grip, 0))], [0.22, C.clone().add(V(0, grip, 0))], [0.36, above], [0.78, above], [0.9, C.clone().add(V(0, grip, 0))], [0.93, C.clone().add(V(0, grip, 0))], [1, restL]], lerpV);
            bottlePose = { tilt: track(u, [[0, 0], [0.38, 0], [0.48, -1.95], [0.7, -1.95], [0.8, 0], [1, 0]], lerpN), grip };
            showBottle = u > 0.2 && u < 0.92;
            leanTarget = track(u, [[0, 0.05], [0.18, 0.3], [0.36, 0.25], [0.9, 0.3], [1, 0.05]], lerpN);
            showStream = u > 0.47 && u < 0.72;
            streamSurface = G.clone().add(V(0, 0.012 + 0.1 * lv.glass, 0));
          } else {
            // grip the glass, bring it to the mouth, tip it and the head back, put it down
            const atMouth = mouth.clone().add(V(0.03, -0.12, 0.11));
            handL = track(u, [[0, restL], [0.2, G.clone().add(V(0, 0.06, 0))], [0.24, G.clone().add(V(0, 0.06, 0))], [0.46, atMouth], [0.74, atMouth], [0.86, G.clone().add(V(0, 0.06, 0))], [0.9, G.clone().add(V(0, 0.06, 0))], [1, restL]], lerpV);
            glassPose = { tilt: track(u, [[0, 0], [0.46, 0], [0.56, -1.0], [0.72, -1.2], [0.8, 0], [1, 0]], lerpN) };
            headPitch = track(u, [[0, 0.22], [0.46, 0], [0.56, -0.3], [0.72, -0.34], [0.8, 0.1], [1, 0.22]], lerpN);
            leanTarget = track(u, [[0, 0.05], [0.2, 0.3], [0.46, 0.02], [0.86, 0.3], [1, 0.05]], lerpN);
            showGlass = u > 0.22 && u < 0.9;
          }
        }
        handR = tip.clone().addScaledVector(tipDir, -0.2);
      }
      const al = lean(leanTarget);
      const hr = arm(R, toTorso(handR, al));
      const hl = arm(L, toTorso(handL, al));
      // props follow the hands where the IK actually put them
      const dirT = tipDir.clone().applyAxisAngle(X, -al);
      if (sticks.current) { sticks.current.position.copy(hr).addScaledVector(dirT, 0.08); sticks.current.quaternion.setFromUnitVectors(V(0, 0, 1), dirT); }
      if (morsel.current) morsel.current.position.copy(hr).addScaledVector(dirT, 0.2).add(V(0, -0.008, 0));
      if (heldBottle.current && bottlePose) {
        heldBottle.current.position.copy(hl);
        heldBottle.current.rotation.set(-al, 0, bottlePose.tilt);
        heldBottle.current.children[0].position.set(0, -bottlePose.grip, 0);
        if (stream.current && showStream && streamSurface) {
          const lip = V(0, bottleLip(drinkId) - bottlePose.grip, 0).applyAxisAngle(V(0, 0, 1), bottlePose.tilt).applyAxisAngle(X, -al).add(hl);
          const surface = toTorso(streamSurface, al);
          stream.current.position.copy(lip).add(surface).multiplyScalar(0.5);
          stream.current.scale.set(1, Math.max(0.01, lip.distanceTo(surface)), 1);
          stream.current.quaternion.setFromUnitVectors(V(0, 1, 0), lip.clone().sub(surface).normalize());
        }
      }
      if (heldGlass.current && glassPose) {
        heldGlass.current.position.copy(hl);
        heldGlass.current.rotation.set(glassPose.tilt - al, 0, 0);
        heldGlass.current.children[0].position.set(0, -0.06, 0);
      }
    } else {
      // ---- walking (with the takeaway bag in hand while delivering)
      const run = Math.min(1, speed.current / 5);
      const swing = run * Math.sin(phase.current) * 0.6;
      b.position.set(0, Math.abs(Math.sin(phase.current)) * 0.04 * run, 0);
      leg(-1, swing, 0.08 + Math.max(0, -swing) * 1.1); leg(1, -swing, 0.08 + Math.max(0, swing) * 1.1);
      lean(0.04 * run);
      const carrying = s.job?.stage === 'deliver';
      for (const side of [R, L]) {
        const i = side < 0 ? 0 : 1;
        if (carrying && side === R) {
          const w = arm(R, V(-0.3, 0.12, 0.12), V(-1, -0.3, -0.3));
          if (bag.current) { bag.current.position.copy(w).add(V(0, -0.3, 0)); showBag = true; }
          continue;
        }
        const sw = (side < 0 ? -swing : swing) * 0.8;
        const dirU = V(side * 0.08, -Math.cos(sw), Math.sin(sw)).normalize();
        const S = SHOULDER(side);
        const E = S.clone().addScaledVector(dirU, L1);
        const dirF = dirU.clone().add(V(0, 0, 0.18 + Math.max(0, sw) * 0.4)).normalize();
        U[i]!.position.copy(S); U[i]!.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, dirU));
        F[i]!.position.copy(E); F[i]!.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, dirF));
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
    {[-1, 1].map((side, i) => <group key={`l${side}`} ref={thighs[i]} position={[side * 0.12, HIP, 0]}>
      <mesh position={[0, -THIGH / 2, 0]} castShadow><capsuleGeometry args={[0.095, THIGH - 0.1, 4, 8]} /><meshStandardMaterial color="#33415a" roughness={0.85} /></mesh>
      <group ref={shins[i]} position={[0, -THIGH, 0]}>
        <mesh position={[0, -SHIN / 2, 0]} castShadow><capsuleGeometry args={[0.085, SHIN - 0.1, 4, 8]} /><meshStandardMaterial color="#33415a" roughness={0.85} /></mesh>
        <mesh position={[0, -SHIN + 0.02, 0.06]} castShadow><boxGeometry args={[0.15, 0.09, 0.3]} /><meshStandardMaterial color="#f2f2f2" roughness={0.6} /></mesh>
      </group>
    </group>)}
    <group ref={torso} position={[0, HIP, 0]}>
      <mesh position={[0, 0.33, 0]} castShadow><capsuleGeometry args={[0.24, 0.5, 6, 12]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh>
      <mesh position={[0, 0.06, 0]} castShadow><cylinderGeometry args={[0.25, 0.24, 0.16, 12]} /><meshStandardMaterial color="#2c2b2a" roughness={0.6} /></mesh>
      <mesh position={[0, 0.38, -0.22]} castShadow><boxGeometry args={[0.36, 0.42, 0.14]} /><meshStandardMaterial color="#2f5d50" roughness={0.8} /></mesh>
      {/* neck and head, pivoting at the base of the neck */}
      <group ref={head} position={[0, 0.78, 0]}>
        <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.065, 0.075, 0.18, 10]} /><meshStandardMaterial color={skin} /></mesh>
        <mesh position={[0, 0.27, 0.01]} castShadow><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
        <mesh position={[0, 0.35, -0.01]} castShadow><sphereGeometry args={[0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1]} /><meshStandardMaterial color="#1b1715" roughness={0.9} /></mesh>
      </group>
      {[-1, 1].map((side, i) => <group key={`a${side}`}>
        <group ref={upper[i]}><mesh position={[0, -L1 / 2, 0]} castShadow><capsuleGeometry args={[0.07, L1 - 0.08, 4, 8]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh></group>
        <group ref={fore[i]}>
          <mesh position={[0, -L2 / 2, 0]} castShadow><capsuleGeometry args={[0.058, L2 - 0.08, 4, 8]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh>
          <mesh position={[0, -L2 - HAND * 0.6, 0]}><sphereGeometry args={[0.06, 10, 8]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
      </group>)}
      <group ref={sticks} visible={false}><Chopsticks spread={0.008} /></group>
      <group ref={morsel} visible={false}><Morsel kind={morselKind} /></group>
      <group ref={heldBottle} visible={false}><group><Bottle id={drinkId} /></group></group>
      <group ref={heldGlass} visible={false}><group><IceGlass id={drinkId} level={glassLevel} /></group></group>
      <mesh ref={stream} visible={false} material={streamMat}><cylinderGeometry args={[0.007, 0.009, 1, 8]} /></mesh>
      <group ref={bag} visible={false}><TakeawayBag /></group>
    </group>
  </group>;
}
