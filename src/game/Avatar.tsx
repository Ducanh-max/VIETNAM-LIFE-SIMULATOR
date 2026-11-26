import { isCar } from './net';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { AnimMachine, GAIT, type AnimState } from './character/animState';
import { BlobShadow } from './character/ChibiModel';
import { FACE, surf } from './character/chibiGeometry';
import { Phone3D } from './character/Phone3D';
import { uniformFor, type Outfit } from './character/outfit';
import { CAN_OFFSET, drinkLevels, firstDrink, GLASS_OFFSET, lerpN, lerpV, mealAt, POUR, SEAT_DROP, SET, setToBody, track } from './meal';
import { PLAYER_DIMENSIONS as PD, PlayerModel, type Expression, type HandPose, type PlayerRig } from './PlayerModel';
import { taxi } from './ride';
import { bike, game, player, useGame } from './state';
import { Bottle, bottleLip, Chopsticks, IceGlass, Morsel, TakeawayBag } from './world/food';
import { GRIP, PILLION, SEAT } from './world/Scooter';
import { bagStore, useBag } from './bag';
import { shopKind } from './shops';
import { HeldModel } from './world/HeldItems';
import { DINE_SECONDS, dineForAvatar, LimeWedge, Spoon } from './world/Dine';

/*
 * The player's chibi avatar, driven by an animation state machine (IDLE, WALK, RUN, SPRINT, SIT_DOWN,
 * SITTING, STAND_UP, EATING, DRINKING, TALKING, WAVING, USING_PHONE, INTERACTING, RIDING, PASSENGER).
 * Arms are two-bone IK chains (so the mitten hands really hold chopsticks, a can, a glass, the phone or
 * the scooter grips); legs are posed so the feet stay on the ground, the stool's footrest or the scooter
 * floor. The walk/run cycle advances with the distance actually covered (no foot sliding).
 * The avatar faces +z. "Body" space is the avatar group shifted by the current seat; the torso pivots at
 * the spine to lean. Held props follow the hand where the IK actually put it.
 */
const HIP = PD.hipY;
const SPINE = PD.hipY + PD.spineY; // spine pivot; 'torso space' below means spine space
const L1 = PD.upperArm;
const L2 = PD.forearm;
const HAND = PD.hand; // palm centre beyond the wrist
const LEG = PD.hipY - PD.hipDrop; // hip joint height = leg length to the ground
const SHOULDER = (side: number) => new THREE.Vector3(side * PD.shoulderX, PD.shoulderY, 0); // spine space
const MOUTH = new THREE.Vector3(0, PD.neckY + PD.headY + FACE.mouthY, surf(0, FACE.mouthY) + 0.01); // spine space
const STICK = 0.15; // hand → chopstick tips
const SCOOTER_FWD = 0.2; // the small rider sits a little forward on the scooter seat
const DOWN = new THREE.Vector3(0, -1, 0);
const X = new THREE.Vector3(1, 0, 0);
const tmpQ = new THREE.Quaternion();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function toTorso(p: THREE.Vector3, lean: number) { return p.clone().sub(V(0, SPINE, 0)).applyAxisAngle(X, -lean); }
function toBody(p: THREE.Vector3, lean: number) { return p.clone().applyAxisAngle(X, lean).add(V(0, SPINE, 0)); }

/** Point a shoulder joint along upperDir and its elbow along foreDir (both in spine space). */
function setArm(shoulder: THREE.Group, elbow: THREE.Group, upperDir: THREE.Vector3, foreDir: THREE.Vector3) {
  shoulder.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, upperDir.clone().normalize()));
  const local = foreDir.clone().applyQuaternion(shoulder.quaternion.clone().invert());
  elbow.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, local.normalize()));
}

/**
 * Two-bone IK in torso space. `pole` is the direction the elbow should point (out, down and a little
 * back for anything done in front of the body). Returns the palm centre actually reached.
 */
function solveArm(side: number, hand: THREE.Vector3, upper: THREE.Group, fore: THREE.Group, pole = V(side * 0.85, -0.55, -0.1)) {
  const S = SHOULDER(side);
  const d = hand.clone().sub(S);
  const dir = d.clone().normalize();
  const len = THREE.MathUtils.clamp(d.length(), 0.1, L1 + L2 + HAND - 0.003);
  const lw = len - HAND; // shoulder → wrist
  const cosA = THREE.MathUtils.clamp((L1 * L1 + lw * lw - L2 * L2) / (2 * L1 * lw), -1, 1);
  const a = Math.acos(cosA);
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (p.lengthSq() < 1e-6) p.set(side, -1, 0);
  p.normalize();
  const E = S.clone().addScaledVector(dir, Math.cos(a) * L1).addScaledVector(p, Math.sin(a) * L1);
  const W = S.clone().addScaledVector(dir, lw);
  setArm(upper, fore, E.clone().sub(S).normalize(), W.clone().sub(E).normalize());
  return S.clone().addScaledVector(dir, len);
}

/** Debug hook: the current animation state (read by tests). */
export const avatarAnim = { state: 'IDLE' as AnimState, outfit: null as Outfit | null, expr: 'neutral' as string };

export function Avatar({ speed, expressionOverride }: { speed: { current: number }; expressionOverride?: { current: Expression | null } }) {
  const body = useRef<THREE.Group>(null);
  const rig = useRef<PlayerRig>(null);
  const propSpace = useRef<THREE.Group>(null);
  const blob = useRef<THREE.Group>(null);
  const [expr, setExpr] = useState<Expression>('neutral');
  const shipping = useGame((s) => !!s.job);
  const driverVehicle = useGame((s) => s.driver?.vehicle ?? null);
  const ownOutfit = useGame((s) => s.outfit);
  // hired → wear the work uniform; quit → back to the outfit chosen in the character panel
  const outfit = useMemo(() => (shipping ? uniformFor(ownOutfit, 'shipper') : driverVehicle ? uniformFor(ownOutfit, driverVehicle === 'car' ? 'denCar' : 'denBike') : ownOutfit), [ownOutfit, shipping, driverVehicle]);
  avatarAnim.outfit = outfit;
  const [idleLook, setIdleLook] = useState(false);
  const sitBlend = useRef(0);
  const phone3d = useRef<THREE.Group>(null);
  const heldRef = useRef<THREE.Group>(null);
  const spoonRef = useRef<THREE.Group>(null);
  const limeRef = useRef<THREE.Group>(null);
  const held = useBag((s) => s.held);
  const seatedNow = useRef(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const sticks = useRef<THREE.Group>(null);
  const morsel = useRef<THREE.Group>(null);
  const heldBottle = useRef<THREE.Group>(null);
  const heldGlass = useRef<THREE.Group>(null);
  const stream = useRef<THREE.Mesh>(null);
  const bag = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const machine = useMemo(() => new AnimMachine(), []);
  const clock = useRef({ t: 0, dialogAt: -1, interactAt: -10, gait: 0 });
  const [morselKind, setMorselKind] = useState<'noodle' | 'wrap' | 'dipped'>('noodle');
  const [glassLevel, setGlassLevel] = useState(0);
  const [bottleOpen, setBottleOpen] = useState(false);
  const drinkId = useGame((s) => firstDrink(s.order) ?? 'lavie');
  const streamMat = useMemo(() => new THREE.MeshStandardMaterial({ color: drinkId === 'lavie' ? '#e8f4ff' : drinkId === 'sevenup' ? '#e6f5cf' : '#4a2210', transparent: true, opacity: drinkId === 'lavie' ? 0.55 : 0.8, roughness: 0.1 }), [drinkId]);
  const expression = useRef<Expression>('neutral');
  const mood = useRef<{ kind: Expression; until: number; toast: number }>({ kind: 'neutral', until: 0, toast: 0 });

  // E (interact) gives a short reach-forward gesture when standing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'KeyE' && !e.repeat) clock.current.interactAt = clock.current.t; };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const b = body.current, R0 = rig.current, pr = propSpace.current;
    if (!b || !R0 || !pr || !R0.spine) return;
    const t = R0.spine;
    const s = game.get();
    const c = clock.current; c.t += dt;
    if (s.dialog && c.dialogAt < 0) c.dialogAt = c.t; else if (!s.dialog) c.dialogAt = -1;
    sitBlend.current = THREE.MathUtils.damp(sitBlend.current, player.seat ? 1 : 0, 5, dt);
    const k = sitBlend.current;
    const mealNow = s.phase === 'eating' ? mealAt(s.order, s.eatProgress) : null;
    const state = machine.update({
      speed: speed.current, sitBlend: k, seated: !!player.seat, onScooter: bike.riding && !taxi.passenger && !isCar(bike.kind), driving: bike.riding && !taxi.passenger && isCar(bike.kind), pillion: taxi.passenger && taxi.vehicle !== 'car', inCar: taxi.passenger && taxi.vehicle === 'car',
      meal: mealNow?.action?.kind ?? null, ordering: s.phase === 'menu', dialog: !!s.dialog, dialogAge: c.dialogAt < 0 ? 0 : c.t - c.dialogAt, phone: s.phone, interactAge: c.t - c.interactAt,
    }, dt);
    avatarAnim.state = state;

    let showSticks = false, showMorsel = false, showBottle = false, showGlass = false, showStream = false, showBag = false, showPhone = false;
    // something from the balo in the hands: eaten in bites / sips, or a book held open to read
    const H = s.phase === 'none' ? bagStore.get().held : null;
    let showHeld = false, showSpoon = false, showLime = false;
    const bite = (period: number) => { const u = (c.t % period) / period; return u < 0.3 ? 0 : u < 0.45 ? (u - 0.3) / 0.15 : u < 0.7 ? 1 : u < 0.85 ? 1 - (u - 0.7) / 0.15 : 0; };
    let headPitch = 0;
    const R = -1, L = 1; // right arm at −x, left arm at +x
    const leg = (side: number, thigh: number, knee: number, splay = 0) => {
      const i = side < 0 ? 0 : 1;
      (i ? R0.hipL : R0.hipR).rotation.set(thigh, 0, splay);
      (i ? R0.kneeL : R0.kneeR).rotation.set(knee, 0, 0);
    };
    /** Damp the torso toward the target lean and return the lean actually shown. */
    const lean = (target: number) => { t.rotation.x = THREE.MathUtils.damp(t.rotation.x, target, 10, dt); pr.rotation.x = t.rotation.x; return t.rotation.x; };
    const arm = (side: number, target: THREE.Vector3, pole?: THREE.Vector3) => solveArm(side, target, side < 0 ? R0.shoulderR : R0.shoulderL, side < 0 ? R0.elbowR : R0.elbowL, pole);
    let handPoseL: HandPose = 'relaxed', handPoseR: HandPose = 'relaxed';
    let idle = false; let mouthState: Expression | null = null;
    // hips start neutral every frame; states add sway / twist
    R0.hips.position.set(0, HIP, 0); R0.hips.rotation.set(0, 0, 0);
    t.rotation.y = 0; t.rotation.z = 0;
    if (R0.bag) R0.bag.rotation.x = THREE.MathUtils.damp(R0.bag.rotation.x, 0, 4, dt);
    if (blob.current) blob.current.visible = state !== 'DRIVING' && (state !== 'PASSENGER' || taxi.vehicle !== 'car');

    if (state === 'DRIVING') {
      // ---- driver's seat of the Đen Car (root at the hip point): feet to the pedals, hands on the wheel, turning with it
      b.position.set(0, -HIP, 0);
      leg(-1, -1.35, 1.2, 0.05); leg(1, -1.35, 1.25, -0.05);
      const al = lean(0.02);
      const turn = -bike.steer * 1.6;
      for (const side of [R, L]) {
        const a = (side < 0 ? Math.PI * 0.85 : Math.PI * 0.15) + turn; // hands at ~10 and 2 o'clock on the wheel
        arm(side, toTorso(V(Math.cos(a) * 0.16, HIP + 0.4 + Math.sin(a) * 0.15, 0.42), al), V(side, -0.6, -0.3)); // the wheel, in the avatar's (cabin-scaled) units
      }
      handPoseL = handPoseR = 'wheel';
      headPitch = -0.05;
    } else if (state === 'PASSENGER' && taxi.vehicle === 'car') {
      // ---- back seat of an Đen SM car: the avatar root sits at the hip point (placed by the controller)
      b.position.set(0, -HIP, 0);
      leg(-1, -1.45, 1.35, 0.06); leg(1, -1.45, 1.35, -0.06);
      const al = lean(-0.04);
      arm(R, toTorso(V(-0.14, HIP + 0.02, 0.22), al), V(-1, -0.4, -0.2));
      arm(L, toTorso(V(0.14, HIP + 0.02, 0.22), al), V(1, -0.4, -0.2));
      idle = true;
    } else if (state === 'RIDING' || state === 'PASSENGER') {
      // ---- on a scooter: hips on the seat, knees bent, feet on the floor board; hands on the grips
      const pillion = state === 'PASSENGER';
      const seat = pillion ? PILLION : SEAT;
      const fwd = pillion ? 0.04 : SCOOTER_FWD;
      b.position.set(0, seat.y - HIP, seat.z + fwd);
      leg(-1, pillion ? -1.15 : -1.25, pillion ? 0.95 : 1.0, 0.16); leg(1, pillion ? -1.15 : -1.25, pillion ? 0.95 : 1.0, -0.16);
      const al = lean(pillion ? 0.08 : 0.42);
      if (pillion) {
        arm(R, toTorso(V(-0.15, HIP + 0.02, 0.24), al), V(-1, -0.4, -0.2)); // hands resting on the thighs
        arm(L, toTorso(V(0.15, HIP + 0.02, 0.24), al), V(1, -0.4, -0.2));
      } else {
        handPoseL = handPoseR = 'wheel';
        for (const side of [R, L]) {
          const g = GRIP(side, bike.steer);
          arm(side, toTorso(V(g.x - seat.x, g.y - seat.y + HIP, g.z - seat.z - fwd), al), V(side, -0.6, -0.3));
        }
        headPitch = -0.12;
      }
    } else if (player.seat) {
      // ---- SIT_DOWN / SITTING / EATING / DRINKING / INTERACTING at the table (low plastic stool)
      b.position.set(0, -SEAT_DROP * k, 0);
      leg(-1, -1.3 * k, 0.05 + 1.05 * k, 0.1 * k); leg(1, -1.3 * k, 0.05 + 1.05 * k, -0.1 * k);
      const restR = V(-0.13, 0.67, 0.27); const restL = V(0.14, 0.66, 0.25);
      const eating = s.phase === 'eating' || s.phase === 'finished' || s.phase === 'served';
      let handR = restR.clone(); let handL = restL.clone();
      let leanTarget = 0.06;
      let tipDir = V(-0.05, -0.62, 0.78).normalize();
      let bottlePose: { tilt: number; grip: number } | null = null;
      let glassPose: { tilt: number } | null = null;
      let streamSurface: THREE.Vector3 | null = null;
      if (state === 'INTERACTING') {
        // reading the menu and waving the waiter over
        handR = V(-0.2, 0.98 + Math.sin(c.t * 9) * 0.03, 0.18); handPoseR = 'wave'; headPitch = 0.12;
      }
      if (eating) {
        showSticks = s.phase === 'eating';
        if (showSticks) handPoseR = 'chopsticks';
        const p = s.phase === 'eating' ? s.eatProgress : s.phase === 'finished' ? 1 : 0;
        const m = mealAt(s.order, p);
        const lv = drinkLevels(s.order, p);
        if (Math.abs(lv.glass - glassLevel) > 0.01) setGlassLevel(lv.glass);
        const mouth = toBody(MOUTH, t.rotation.x);
        const tableD = V(-0.05, -0.62, 0.78).normalize();
        const mouthD = V(0.2, 0.62, -0.75).normalize();
        let tip = restR.clone().addScaledVector(tableD, STICK);
        let rightBusy = false;
        headPitch = 0.22;
        if (m.action?.kind === 'bite') {
          const u = m.u;
          const B = setToBody(SET.bun[0], 0, SET.bun[1]); const H = setToBody(SET.herbs[0], 0, SET.herbs[1]); const Br = setToBody(SET.broth[0], 0, SET.broth[1]);
          const rest = tip.clone();
          // pick noodles → a herb leaf → dip in the broth → up to the mouth → back
          tip = track(u, [
            [0, rest], [0.14, B.clone().add(V(0, 0.08, 0))], [0.2, B.clone().add(V(0, 0.025, 0))], [0.3, B.clone().add(V(0, 0.1, 0))],
            [0.4, H.clone().add(V(0, 0.12, 0))], [0.46, H.clone().add(V(0, 0.06, 0))], [0.54, H.clone().add(V(0, 0.13, 0))],
            [0.62, Br.clone().add(V(0, 0.12, 0))], [0.68, Br.clone().add(V(0, 0.05, 0))], [0.74, Br.clone().add(V(0, 0.14, 0))],
            [0.85, mouth.clone().add(V(0, -0.012, 0.012))], [0.89, mouth.clone().add(V(0, -0.006, 0.006))], [1, rest],
          ], lerpV);
          tipDir = track(u, [[0, tableD], [0.74, tableD], [0.85, mouthD], [0.89, mouthD], [1, tableD]], (a, c2, kk) => a.clone().lerp(c2, kk).normalize());
          leanTarget = track(u, [[0, 0.06], [0.14, 0.28], [0.4, 0.36], [0.62, 0.28], [0.85, 0.08], [1, 0.06]], lerpN);
          headPitch = track(u, [[0, 0.25], [0.74, 0.3], [0.85, -0.05], [0.9, 0.0], [1, 0.25]], lerpN);
          showMorsel = u > 0.2 && u < 0.885;
          if (u > 0.84) mouthState = 'eating';
          const kind = u < 0.46 ? 'noodle' : u < 0.68 ? 'wrap' : 'dipped';
          if (kind !== morselKind) setMorselKind(kind);
        } else if (m.action && firstDrink(s.order)) {
          const id = firstDrink(s.order)!;
          const dx = SET.drink[0]; const dz = SET.drink[1];
          const C = setToBody(dx + CAN_OFFSET, 0, dz); const G = setToBody(dx + GLASS_OFFSET, 0, dz);
          const grip = id === 'lavie' ? 0.1 : 0.06;
          const u = m.u;
          if (lv.opened !== bottleOpen) setBottleOpen(lv.opened);
          if (m.action.kind === 'pour') {
            rightBusy = true;
            // left hand steadies the glass; right hand picks up the bottle, opens it, tips it over the glass so
            // the lip stays above the glass while it pours, stands it up and puts it back
            const P = POUR;
            const tilt = track(u, [[0, 0], [P.over, 0], [P.tip, -1.6], [P.stop, -2.05], [P.upright, 0], [1, 0]], lerpN);
            const lipOff = V(0, bottleLip(id) - grip, 0).applyAxisAngle(V(0, 0, 1), tilt);
            const BOFF = V(0.035, 0, 0); // bottle axis is this far from the palm, toward the glass
            const pourAt = G.clone().add(V(0, 0.165, 0)).sub(lipOff).sub(BOFF); // hand such that the lip is 4 cm over the glass rim
            const held = C.clone().add(V(0, grip, 0)).sub(BOFF); const lifted = held.clone().add(V(0, 0.08, 0.02));
            const pop = id === 'lavie' ? 0 : Math.max(0, Math.sin(((u - P.lift) / (P.open + 0.03 - P.lift)) * Math.PI)) * (u > P.lift && u < P.open + 0.03 ? 1 : 0);
            handR = track(u, [[0, restR], [P.grab, held], [P.lift, lifted], [P.open + 0.03, lifted.clone().add(V(0, pop * 0.01, 0))], [P.over, pourAt], [P.stop, pourAt], [P.upright, pourAt], [P.down, held], [1, restR]], lerpV);
            if (P.over < u && u < P.upright) handR.copy(pourAt);
            const atGlass = G.clone().add(V(0.04, 0.05, 0));
            const capAt = lifted.clone().add(V(0.015, bottleLip(id) - grip + 0.01, 0));
            const twist = id === 'lavie' && u > P.lift && u < P.open + 0.04;
            handL = track(u, [[0, restL], [P.grab, atGlass], [1 - 0.08, atGlass], [1, restL]], lerpV);
            if (twist) { handL = capAt.clone().add(V(Math.sin(c.t * 22) * 0.006, 0, Math.cos(c.t * 22) * 0.006)); handPoseL = 'pinch'; }
            else if (u > P.grab * 0.8 && u < 0.95) handPoseL = 'cup';
            bottlePose = { tilt, grip };
            showBottle = u > P.grab && u < P.down;
            if (showBottle) handPoseR = 'grip';
            showSticks = false;
            headPitch = 0.38;
            leanTarget = track(u, [[0, 0.06], [P.grab, 0.28], [P.over, 0.24], [P.down, 0.28], [1, 0.06]], lerpN);
            showStream = u > P.tip + 0.01 && u < P.stop - 0.01;
            streamSurface = G.clone().add(V(0, 0.012 + 0.1 * lv.glass, 0));
          } else {
            // grip the glass, bring it to the mouth, tip it and the head back, put it down
            const atMouth = mouth.clone().add(V(0.02, -0.075, 0.085));
            handL = track(u, [[0, restL], [0.2, G.clone().add(V(0, 0.06, 0))], [0.24, G.clone().add(V(0, 0.06, 0))], [0.46, atMouth], [0.74, atMouth], [0.86, G.clone().add(V(0, 0.06, 0))], [0.9, G.clone().add(V(0, 0.06, 0))], [1, restL]], lerpV);
            glassPose = { tilt: track(u, [[0, 0], [0.46, 0], [0.56, -1.0], [0.72, -1.2], [0.8, 0], [1, 0]], lerpN) };
            headPitch = track(u, [[0, 0.22], [0.46, 0], [0.56, -0.3], [0.72, -0.34], [0.8, 0.1], [1, 0.22]], lerpN);
            leanTarget = track(u, [[0, 0.06], [0.2, 0.34], [0.46, 0.02], [0.86, 0.34], [1, 0.06]], lerpN);
            showGlass = u > 0.22 && u < 0.9;
            if (showGlass) handPoseL = 'cup';
            if (u > 0.44 && u < 0.76) mouthState = 'drinking';
          }
        }
        if (!rightBusy) handR = tip.clone().addScaledVector(tipDir, -STICK);
      }
      // phở at a table: lime squeezed over the bowl first, then chopsticks (right) and spoon (left) in turn
      const D = s.phase === 'none' && !H ? dineForAvatar() : null;
      const ez = (x: number) => x * x * (3 - 2 * x);
      const bite01 = (x: number) => (x < 0.4 ? ez(x / 0.4) : x < 0.6 ? 1 : ez(1 - (x - 0.6) / 0.4));
      if (D && !eating) {
        const lift = D.seatHeight - 0.25; // the seat raises the avatar this much above the low stool it was posed for
        const bowlB = V(0, D.tableTop - lift + 0.05, 0.36);
        const mouthB = toBody(MOUTH, t.rotation.x);
        handR = V(-0.12, bowlB.y + 0.08, 0.27); handL = V(0.12, bowlB.y + 0.07, 0.27);
        if (D.stage === 'eating' || D.stage === 'served' || D.stage === 'done') { showSticks = true; handPoseR = 'chopsticks'; showSpoon = true; handPoseL = 'grip'; }
        if (D.stage === 'eating') {
          const u = D.progress;
          if (u < 0.12) {
            // squeezing the lime wedge over the bowl (the chopsticks wait on the table edge)
            showSticks = false; showLime = true; handPoseR = 'fist';
            handR = bowlB.clone().add(V(-0.03, 0.11 + Math.sin((u / 0.12) * Math.PI * 8) * 0.008, -0.03));
            headPitch = 0.3;
          } else {
            const secs = (u - 0.12) * DINE_SECONDS; const cyc = (secs % 3.4) / 3.4;
            const a = cyc < 0.55 ? bite01(cyc / 0.55) : 0; const b = cyc >= 0.55 ? bite01((cyc - 0.55) / 0.45) : 0;
            const down = V(-0.05, -0.62, 0.78).normalize(); const up = V(0.2, 0.62, -0.75).normalize();
            tipDir = down.clone().lerp(up, a * 0.7).normalize();
            const tip = bowlB.clone().add(V(-0.01, 0.02, -0.02)).lerp(mouthB.clone().add(V(0, -0.02, 0.05)), a);
            handR = tip.clone().addScaledVector(tipDir, -STICK);
            handL = bowlB.clone().add(V(0.05, 0.05, -0.03)).lerp(mouthB.clone().add(V(0.04, -0.05, 0.07)), b);
            headPitch = 0.28 * (1 - Math.max(a, b));
            if (a > 0.8) mouthState = 'eating';
            if (a > 0.05 && a < 0.97) { showMorsel = true; if (morselKind !== 'noodle') setMorselKind('noodle'); } // noodles hanging from the chopsticks
          }
        }
      }
      let heldAt: 'R' | 'mid' | null = null;
      if (H && !eating) {
        if (H.kind === 'book') { handR = V(-0.09, 0.86, 0.3); handL = V(0.09, 0.86, 0.3); handPoseR = 'grip'; handPoseL = 'grip'; headPitch = 0.42; heldAt = 'mid'; }
        else {
          const mouthB = toBody(MOUTH, t.rotation.x).add(V(-0.03, -0.07, 0.09));
          const restB = V(-0.11, 0.78, 0.3);
          handR = restB.clone().lerp(mouthB, bite(H.kind === 'drink' ? 3 : 2.6)); handPoseR = 'grip'; heldAt = 'R';
          if (shopKind(H.shop) === 'pho' || (H.shop === 'buncha' && H.item === 'buncha')) { handL = V(0.08, 0.74, 0.3); handPoseL = 'grip'; }
        }
      }
      // blend the seated reach in as the avatar settles onto the stool
      const al = lean(leanTarget * k);
      const hr = arm(R, toTorso(handR, al));
      const hl = arm(L, toTorso(handL, al));
      if (spoonRef.current && showSpoon) { spoonRef.current.position.copy(hl).add(V(0.0, -0.005, 0.01)); spoonRef.current.rotation.set(0.35 - al, -0.4, 0); }
      if (limeRef.current && showLime) { limeRef.current.position.copy(hr).add(V(0.01, -0.03, 0.02)); limeRef.current.rotation.set(-al, 0, 0); }
      if (heldAt && heldRef.current) {
        showHeld = true;
        if (heldAt === 'mid') { heldRef.current.position.copy(hr).add(hl).multiplyScalar(0.5).add(V(0, 0.02, 0.03)); heldRef.current.rotation.set(0.75 - al, 0, 0); }
        else { heldRef.current.position.copy(hr).add(V(0.01, -0.01, 0.02)); heldRef.current.rotation.set(-al, 0, 0); }
      }
      const dirT = tipDir.clone().applyAxisAngle(X, -al);
      if (sticks.current) { sticks.current.position.copy(hr).addScaledVector(dirT, STICK - 0.12); sticks.current.quaternion.setFromUnitVectors(V(0, 0, 1), dirT); }
      if (morsel.current) morsel.current.position.copy(hr).addScaledVector(dirT, STICK).add(V(0, -0.008, 0));
      if (heldBottle.current && bottlePose) {
        // the bottle sits in the right hand's palm: its grip point at the palm, tilted toward the glass
        heldBottle.current.position.copy(hr).add(V(0.035, 0, 0).applyAxisAngle(X, -al));
        heldBottle.current.rotation.set(-al, 0, bottlePose.tilt);
        heldBottle.current.children[0].position.set(0, -bottlePose.grip, 0);
        if (stream.current && showStream && streamSurface) {
          const lip = V(0, bottleLip(drinkId) - bottlePose.grip, 0).applyAxisAngle(V(0, 0, 1), bottlePose.tilt).applyAxisAngle(X, -al).add(heldBottle.current.position);
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
      // ---- IDLE / WALK / RUN / SPRINT / STAND_UP / TALKING / WAVING / USING_PHONE / INTERACTING
      const sp = speed.current;
      const move = THREE.MathUtils.smoothstep(sp, 0.15, 1.2); // 0 standing … 1 moving
      const runK = THREE.MathUtils.smoothstep(sp, GAIT.run - 0.4, GAIT.sprint + 0.6); // walk → run blend
      const stepLen = THREE.MathUtils.lerp(0.48, 0.86, runK); // metres per step
      // the cycle advances with the distance covered: one half cycle (π) per step → no foot sliding
      phase.current += (sp * dt / stepLen) * Math.PI;
      const ph = phase.current;
      const A = THREE.MathUtils.lerp(0.5, 0.95, runK) * move; // thigh swing amplitude
      const sw = Math.sin(ph) * A; // right thigh (+ = back)
      const kneeK = THREE.MathUtils.lerp(0.55, 1.5, runK) * move;
      const kneeR = 0.05 + kneeK * Math.max(0, -Math.cos(ph));
      const kneeL = 0.05 + kneeK * Math.max(0, Math.cos(ph));
      // the stance leg stays straight under the hips: drop the hips by how far the legs spread
      const drop = LEG * (1 - Math.cos(sw)) * (1 - runK * 0.5);
      const flight = runK * 0.035 * Math.abs(Math.sin(ph * 2 + 0.6));
      const lerp = THREE.MathUtils.lerp;
      b.position.set(0, -drop + flight - SEAT_DROP * k, 0);
      leg(-1, lerp(sw, -1.3, k), lerp(kneeR, 1.1, k), 0.02); leg(1, lerp(-sw, -1.3, k), lerp(kneeL, 1.1, k), -0.02);
      // hips twist with the stride, the torso counter-rotates; running leans forward
      R0.hips.rotation.y = Math.sin(ph) * 0.12 * move;
      t.rotation.y = -Math.sin(ph) * 0.16 * move;
      lean(lerp(0.03, 0.24, runK) * move);
      if (R0.bag) R0.bag.rotation.x = Math.sin(ph * 2) * 0.12 * move;
      idle = state === 'IDLE';
      if (idle) {
        // weight shift from foot to foot, feet stay planted
        const w = Math.sin(c.t * 0.9);
        R0.hips.position.x = w * 0.008; R0.hips.rotation.z = w * 0.025;
        leg(-1, 0, 0.05 + Math.max(0, w) * 0.08, 0.02 - w * 0.025); leg(1, 0, 0.05 + Math.max(0, -w) * 0.08, -0.02 - w * 0.025);
      }
      showPhone = state === 'USING_PHONE';
      const carrying = s.job?.stage === 'deliver';
      for (const side of [R, L]) {
        if (H && !showPhone && !carrying) {
          if (H.kind === 'book') {
            // the closed book carried in front of the chest (sit down on a bench or stool to read it)
            const w = arm(side, V(side * 0.07, 0.24, 0.24), V(side, -0.6, -0.2));
            if (side === R) { handPoseR = 'grip'; if (heldRef.current) { heldRef.current.position.copy(w).add(V(0.07, 0.02, 0.02)); heldRef.current.rotation.set(-0.3, 0, 0); showHeld = true; } } else handPoseL = 'grip';
            continue;
          }
          if (side === R) {
            const w = arm(R, V(-0.1, 0.18, 0.24).lerp(MOUTH.clone().add(V(-0.03, -0.07, 0.08)), bite(H.kind === 'drink' ? 3 : 2.6)), V(-1, -0.6, -0.2));
            handPoseR = 'grip';
            if (heldRef.current) { heldRef.current.position.copy(w).add(V(0.01, -0.01, 0.02)); heldRef.current.rotation.set(0, 0, 0); showHeld = true; }
            continue;
          }
          if (shopKind(H.shop) === 'pho' || (H.shop === 'buncha' && H.item === 'buncha')) { arm(L, V(0.07, 0.15, 0.24), V(1, -0.6, -0.2)); handPoseL = 'grip'; continue; }
        }
        if (showPhone && side === L) {
          // holding the phone in front of the chest, looking down at it; the other hand taps
          const hl = arm(L, V(0.04, 0.27, 0.25), V(1, -0.6, -0.2));
          handPoseL = 'phone'; headPitch = 0.35;
          if (phone3d.current) { phone3d.current.position.copy(hl).add(V(-0.025, 0.01, 0.02)); phone3d.current.rotation.set(-1.05, 0.15, 0); }
          continue;
        }
        if (showPhone && side === R) { arm(R, V(-0.02, 0.28 + Math.max(0, Math.sin(c.t * 7)) * 0.015, 0.29), V(-1, -0.6, -0.2)); handPoseR = 'pinch'; continue; }
        if (carrying && side === R) {
          handPoseR = 'grip';
          const w = arm(R, V(-0.24, 0.0, 0.08), V(-1, -0.3, -0.3));
          if (bag.current) { bag.current.position.copy(w).add(V(0, -0.28, 0)); showBag = true; }
          continue;
        }
        if (state === 'WAVING' && side === R) { arm(R, V(-0.27, 0.56, 0.06 + Math.sin(c.t * 11) * 0.05), V(-1, -0.2, -0.3)); handPoseR = 'wave'; continue; }
        if (state === 'TALKING' && side === R) { const g = Math.sin(c.t * 3.1); arm(R, V(-0.16, 0.1 + g * 0.03, 0.2), V(-1, -0.5, -0.2)); handPoseR = 'open'; continue; }
        if (state === 'INTERACTING' && side === R) { const u = Math.min(1, (c.t - c.interactAt) / 0.3); arm(R, V(-0.14, 0.1 + u * 0.06, 0.18 + u * 0.12), V(-1, -0.5, -0.2)); handPoseR = 'open'; continue; }
        // natural swing: the arm opposite each leg swings forward; running bends the elbows
        const a = (side < 0 ? sw : -sw) * 0.9 + (idle ? Math.sin(c.t * 0.9 + side) * 0.025 : 0);
        const e = lerp(0.18, 1.35, runK) * Math.max(move, 0.3) + Math.max(0, a) * 0.3;
        setArm(side < 0 ? R0.shoulderR : R0.shoulderL, side < 0 ? R0.elbowR : R0.elbowL, V(side * 0.16, -Math.cos(a), Math.sin(a)), V(side * 0.08, -Math.cos(a + e), Math.sin(a + e)));
        if (runK > 0.5) { if (side < 0) handPoseR = 'fist'; else handPoseL = 'fist'; }
      }
    }
    // ---- facial expression: happy while eating / after good news, surprised when starving or on bad news
    const toast = s.toast;
    if (toast && toast.id !== mood.current.toast) {
      mood.current.toast = toast.id;
      const good = /(Ngon|cảm ơn|Cảm ơn|bo thêm|Đã tới|Tốt lắm|Mát lạnh)/.test(toast.text);
      const bad = /(huỷ|Không đủ|Đói|Khát|đói|khát|Quá giờ)/.test(toast.text);
      const tipped = /bo thêm|Nhanh thế/.test(toast.text);
      const kind: Expression = good ? (tipped ? 'laugh' : 'happy') : /huỷ/.test(toast.text) ? 'sad' : /Không đủ|Không có chỗ/.test(toast.text) ? 'confused' : 'surprised';
      if (good || bad || kind === 'confused') mood.current = { kind, until: performance.now() + 3500, toast: toast.id };
    }
    expression.current = expressionOverride?.current ? expressionOverride.current : performance.now() < mood.current.until ? mood.current.kind
      : mouthState ? mouthState
      : state === 'WAVING' ? 'happy'
      : s.dialog ? 'talking'
      : s.phase === 'eating' ? 'smile' : s.phase === 'finished' ? 'happy'
      : s.phone ? 'smile'
      : s.hunger < 15 || s.thirst < 15 ? 'sad' : 'neutral';
    if (expression.current !== expr) setExpr(expression.current);
    avatarAnim.expr = expression.current;
    R0.head.rotation.x = THREE.MathUtils.damp(R0.head.rotation.x, headPitch, 10, dt);
    if (sticks.current) sticks.current.visible = showSticks;
    if (morsel.current) morsel.current.visible = showMorsel;
    if (heldBottle.current) heldBottle.current.visible = showBottle;
    if (heldGlass.current) heldGlass.current.visible = showGlass;
    if (stream.current) stream.current.visible = showStream;
    if (bag.current) bag.current.visible = showBag;
    if (heldRef.current) heldRef.current.visible = showHeld;
    if (spoonRef.current) spoonRef.current.visible = showSpoon;
    if (limeRef.current) limeRef.current.visible = showLime;
    const reading = !!H && H.kind === 'book' && !!player.seat;
    if (reading !== readingOpen) setReadingOpen(reading);
    seatedNow.current = !!player.seat;
    if (phone3d.current) phone3d.current.visible = showPhone;
    R0.setHand('L', handPoseL); R0.setHand('R', handPoseR);
    if (idle !== idleLook) setIdleLook(idle);
  });

  return <group>
    <group ref={blob}><BlobShadow size={0.62} /></group>
    <group ref={body}>
      <PlayerModel ref={rig} expression={expr} outfit={outfit} idleLook={idleLook} />
      {/* held props live in a frame that follows the spine */}
      <group ref={propSpace} position={[0, SPINE, 0]}>
        <group ref={sticks} visible={false}><Chopsticks spread={0.008} /></group>
        <group ref={morsel} visible={false}><Morsel kind={morselKind} /></group>
        <group ref={heldBottle} visible={false}><group><Bottle id={drinkId} open={bottleOpen} /></group></group>
        <group ref={heldGlass} visible={false}><group><IceGlass id={drinkId} level={glassLevel} /></group></group>
        <mesh ref={stream} visible={false} material={streamMat}><cylinderGeometry args={[0.005, 0.008, 1, 8]} /></mesh>
        <group ref={bag} visible={false} scale={0.85}><TakeawayBag /></group>
        <group ref={phone3d} visible={false}><Phone3D /></group>
        <group ref={spoonRef} visible={false}><Spoon /></group>
        <group ref={limeRef} visible={false}><LimeWedge /></group>
        <group ref={heldRef} visible={false}>{held && <HeldModel shop={held.shop} item={held.item} open={readingOpen} />}</group>
      </group>
    </group>
  </group>;
}
