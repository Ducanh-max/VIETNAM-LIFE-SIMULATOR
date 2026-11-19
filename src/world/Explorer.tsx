import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { bridgeDirection, bridgeEnds, canWalk, positionOnBridge, type Point } from './geo';
import { isBuildingCollision } from './Urban';
import { reviewPose } from './reviewViews';

export type ExplorerMode = 'home' | 'game';

function Person({ walking, running }: { walking: { current: boolean }; running: { current: boolean } }) {
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const swing = walking.current ? Math.sin(clock.elapsedTime * (running.current ? 13 : 8)) * (running.current ? 0.65 : 0.42) : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.7;
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.7;
  });
  return <group>
    <mesh position={[0, 1.2, 0]} castShadow><capsuleGeometry args={[0.31, 0.8, 6, 10]} /><meshStandardMaterial color="#eee3ca" roughness={0.9} /></mesh>
    <mesh position={[0, 2.02, 0]} castShadow><sphereGeometry args={[0.25, 12, 10]} /><meshStandardMaterial color="#b78d70" roughness={0.88} /></mesh>
    <mesh position={[0, 2.2, -0.05]} castShadow><sphereGeometry args={[0.255, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#292927" roughness={1} /></mesh>
    <mesh position={[0, 1.27, -0.27]} castShadow><boxGeometry args={[0.42, 0.55, 0.15]} /><meshStandardMaterial color="#3d5a50" roughness={0.82} /></mesh>
    {[-1, 1].map((sign) => <group key={`leg-${sign}`} ref={sign < 0 ? leftLeg : rightLeg} position={[sign * 0.17, 0.77, 0]}>
      <mesh position={[0, -0.31, 0]} castShadow><capsuleGeometry args={[0.105, 0.5, 4, 8]} /><meshStandardMaterial color="#3b4448" roughness={0.9} /></mesh>
      <mesh position={[0, -0.71, 0.11]} castShadow><boxGeometry args={[0.22, 0.13, 0.39]} /><meshStandardMaterial color="#332d29" /></mesh>
    </group>)}
    {[-1, 1].map((sign) => <group key={`arm-${sign}`} ref={sign < 0 ? leftArm : rightArm} position={[sign * 0.39, 1.63, 0]}>
      <mesh position={[0, -0.38, 0]} castShadow><capsuleGeometry args={[0.1, 0.53, 4, 8]} /><meshStandardMaterial color="#e2d4ba" roughness={0.9} /></mesh>
    </group>)}
  </group>;
}

export function Explorer({ mode, paused, freeCamera, onFps, onPosition, heritageTempleLoaded }: {
  mode: ExplorerMode;
  paused: boolean;
  freeCamera: boolean;
  onFps: (fps: number) => void;
  onPosition: (position: Point) => void;
  heritageTempleLoaded: boolean;
}) {
  const { camera, gl } = useThree();
  const position = useRef(new THREE.Vector3(bridgeEnds[0][0] - bridgeDirection[0] * 5.5, 0.35, bridgeEnds[0][1] - bridgeDirection[1] * 5.5));
  const freePosition = useRef(new THREE.Vector3(bridgeEnds[0][0] + 28, 13, bridgeEnds[0][1] + 35));
  const avatar = useRef<THREE.Group>(null);
  const keys = useRef(new Set<string>());
  const yaw = useRef(Math.atan2(bridgeEnds[0][0] - bridgeEnds[1][0], bridgeEnds[0][1] - bridgeEnds[1][1]));
  const pitch = useRef(0.2);
  const walking = useRef(false);
  const running = useRef(false);
  const sampleTime = useRef(0);
  const frames = useRef(0);
  const homeTime = useRef(0);
  const cameraTarget = useRef(new THREE.Vector3());
  const initialReviewPose = useRef(reviewPose);
  useEffect(() => {
    if (freeCamera && mode === 'game') {
      freePosition.current.copy(camera.position);
      freePosition.current.y = Math.max(4, freePosition.current.y);
      const pose = initialReviewPose.current;
      if (pose) {
        freePosition.current.set(...pose.eye);
        camera.position.copy(freePosition.current);
        const [dx, dy, dz] = new THREE.Vector3(...pose.target).sub(camera.position).toArray();
        yaw.current = Math.atan2(-dx, -dz);
        pitch.current = Math.atan2(-dy, Math.hypot(dx, dz));
        initialReviewPose.current = undefined;
      }
      keys.current.clear();
    }
  }, [freeCamera, mode, camera]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) || (freeCamera && ['Space', 'ControlLeft', 'ControlRight'].includes(event.code))) event.preventDefault();
      keys.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const onMouse = (event: MouseEvent) => {
      if (mode !== 'game' || paused || document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * 0.0026;
      pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * 0.002, -0.2, 1.1);
    };
    const onBlur = () => keys.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouse);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouse);
    };
  }, [mode, paused, freeCamera, gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    sampleTime.current += delta;
    frames.current++;
    if (sampleTime.current >= 1) {
      onFps(Math.round(frames.current / sampleTime.current));
      frames.current = 0;
      sampleTime.current = 0;
      onPosition(freeCamera ? [freePosition.current.x, freePosition.current.z] : [position.current.x, position.current.z]);
    }
    if (mode === 'home') {
      homeTime.current += dt * 0.11;
      const t = homeTime.current;
      const desired = new THREE.Vector3(142 + Math.sin(t) * 20, 72 + Math.sin(t * 0.65) * 7, -143 + Math.cos(t) * 18);
      camera.position.lerp(desired, 1 - Math.exp(-1.6 * dt));
      cameraTarget.current.set(-4, 0, -164);
      camera.lookAt(cameraTarget.current);
      if (avatar.current) avatar.current.visible = false;
      return;
    }
    if (avatar.current) avatar.current.visible = !freeCamera;
    if (paused) return;
    const turnSpeed = 1.65 * dt;
    const tiltSpeed = 1.15 * dt;
    if (keys.current.has('ArrowLeft')) yaw.current += turnSpeed;
    if (keys.current.has('ArrowRight')) yaw.current -= turnSpeed;
    if (keys.current.has('ArrowUp')) pitch.current -= tiltSpeed;
    if (keys.current.has('ArrowDown')) pitch.current += tiltSpeed;
    pitch.current = THREE.MathUtils.clamp(pitch.current, -0.2, 1.1);
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const direction = new THREE.Vector3();
    if (keys.current.has('KeyW')) direction.add(forward);
    if (keys.current.has('KeyS')) direction.sub(forward);
    if (keys.current.has('KeyD')) direction.add(right);
    if (keys.current.has('KeyA')) direction.sub(right);
    walking.current = direction.lengthSq() > 0;
    running.current = walking.current && (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight'));
    if (walking.current) direction.normalize();
    if (freeCamera) {
      const speed = (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight') ? 42 : 20) * dt;
      freePosition.current.addScaledVector(direction, speed);
      if (keys.current.has('Space') || keys.current.has('KeyE')) freePosition.current.y += speed;
      if (keys.current.has('ControlLeft') || keys.current.has('ControlRight') || keys.current.has('KeyQ')) freePosition.current.y -= speed;
      freePosition.current.y = THREE.MathUtils.clamp(freePosition.current.y, 2, 180);
      camera.position.lerp(freePosition.current, 1 - Math.exp(-13 * dt));
      camera.lookAt(camera.position.clone().add(forward).add(new THREE.Vector3(0, -Math.tan(pitch.current), 0)));
      return;
    }
    const step = direction.multiplyScalar((running.current ? 9 : 5.2) * dt);
    const current = position.current;
    const nextX: Point = [current.x + step.x, current.z];
    if (canWalk(nextX, heritageTempleLoaded) && !isBuildingCollision(nextX)) current.x = nextX[0];
    const nextZ: Point = [current.x, current.z + step.z];
    if (canWalk(nextZ, heritageTempleLoaded) && !isBuildingCollision(nextZ)) current.z = nextZ[1];
    // The camera already damps its motion. Feet must follow the deck directly
    // or uphill motion sinks the character into the planks, especially at a run.
    current.y = positionOnBridge([current.x, current.z]);
    if (avatar.current) {
      avatar.current.position.copy(current);
      if (walking.current) avatar.current.rotation.y = THREE.MathUtils.damp(avatar.current.rotation.y, Math.atan2(-step.x, -step.z), 12, dt);
    }
    const distance = 10.5;
    const desired = current.clone().addScaledVector(forward, -Math.cos(pitch.current) * distance);
    desired.y += 2.2 + Math.sin(pitch.current) * distance;
    camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    camera.lookAt(current.x + forward.x * 5, current.y + 1.7, current.z + forward.z * 5);
  });

  return <group ref={avatar} position={position.current.toArray()}><Person walking={walking} running={running} /></group>;
}
