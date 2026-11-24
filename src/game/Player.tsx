import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { bridgeEnds, canWalk, groundHeight, type Point } from './geo';

/** Simple stylised Hà Nội resident: white shirt, dark trousers, animated limbs. */
function Character({ speed }: { speed: { current: number } }) {
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const body = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    phase.current += dt * (4 + speed.current * 1.25);
    const swing = Math.min(1, speed.current / 5) * Math.sin(phase.current) * 0.6;
    legs[0].current?.rotation.set(swing, 0, 0);
    legs[1].current?.rotation.set(-swing, 0, 0);
    arms[0].current?.rotation.set(-swing * 0.8, 0, 0.05);
    arms[1].current?.rotation.set(swing * 0.8, 0, -0.05);
    if (body.current) body.current.position.y = Math.abs(Math.sin(phase.current)) * 0.05 * Math.min(1, speed.current / 5);
  });
  const skin = '#c99a78';
  return <group ref={body}>
    <mesh position={[0, 1.25, 0]} castShadow><capsuleGeometry args={[0.24, 0.5, 6, 12]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh>
    <mesh position={[0, 0.98, 0]} castShadow><cylinderGeometry args={[0.25, 0.24, 0.16, 12]} /><meshStandardMaterial color="#2c2b2a" roughness={0.6} /></mesh>
    <mesh position={[0, 1.66, 0]}><cylinderGeometry args={[0.07, 0.08, 0.12, 8]} /><meshStandardMaterial color={skin} /></mesh>
    <mesh position={[0, 1.84, 0]} castShadow><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
    <mesh position={[0, 1.92, -0.02]} castShadow><sphereGeometry args={[0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1]} /><meshStandardMaterial color="#1b1715" roughness={0.9} /></mesh>
    <mesh position={[0, 1.3, -0.22]} castShadow><boxGeometry args={[0.36, 0.42, 0.14]} /><meshStandardMaterial color="#2f5d50" roughness={0.8} /></mesh>
    {[-1, 1].map((s, i) => <group key={`l${s}`} ref={legs[i]} position={[s * 0.12, 0.92, 0]}>
      <mesh position={[0, -0.42, 0]} castShadow><capsuleGeometry args={[0.09, 0.62, 4, 8]} /><meshStandardMaterial color="#33415a" roughness={0.85} /></mesh>
      <mesh position={[0, -0.86, 0.06]} castShadow><boxGeometry args={[0.15, 0.09, 0.3]} /><meshStandardMaterial color="#f2f2f2" roughness={0.6} /></mesh>
    </group>)}
    {[-1, 1].map((s, i) => <group key={`a${s}`} ref={arms[i]} position={[s * 0.31, 1.52, 0]}>
      <mesh position={[0, -0.3, 0]} castShadow><capsuleGeometry args={[0.07, 0.45, 4, 8]} /><meshStandardMaterial color="#f3efe6" roughness={0.85} /></mesh>
      <mesh position={[0, -0.6, 0]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color={skin} /></mesh>
    </group>)}
  </group>;
}

export type PlayerProps = { paused: boolean; freeCamera: boolean; onFps: (fps: number) => void; onPosition: (p: Point) => void; focus: THREE.Vector3 };

/**
 * Third-person controller: WASD to walk, Shift to run, mouse (pointer lock or drag) or arrows
 * to orbit, wheel to zoom, V toggles a free drone camera.
 */
export function Player({ paused, freeCamera, onFps, onPosition, focus }: PlayerProps) {
  const { camera, gl } = useThree();
  const start = bridgeEnds[0];
  const away = new THREE.Vector2(start[0] - bridgeEnds[1][0], start[1] - bridgeEnds[1][1]).normalize();
  const position = useRef(new THREE.Vector3(start[0] + away.x * 7, 0.32, start[1] + away.y * 7));
  const velocity = useRef(new THREE.Vector3());
  const yaw = useRef(Math.atan2(away.x, away.y));
  const pitch = useRef(0.28);
  const distance = useRef(7.5);
  const keys = useRef(new Set<string>());
  const avatar = useRef<THREE.Group>(null);
  const speed = useRef(0);
  const drone = useRef(new THREE.Vector3());
  const fps = useRef({ time: 0, frames: 0 });
  const dragging = useRef(false);

  useEffect(() => { if (freeCamera) drone.current.copy(camera.position); }, [freeCamera, camera]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const look = (dx: number, dy: number) => {
      yaw.current -= dx * 0.0028;
      pitch.current = THREE.MathUtils.clamp(pitch.current + dy * 0.0022, -0.15, 1.25);
    };
    const move = (e: MouseEvent) => {
      if (paused) return;
      if (document.pointerLockElement === gl.domElement || dragging.current) look(e.movementX, e.movementY);
    };
    const pressed = (e: MouseEvent) => { if (e.button === 2) dragging.current = true; };
    const released = () => { dragging.current = false; };
    const wheel = (e: WheelEvent) => { distance.current = THREE.MathUtils.clamp(distance.current + e.deltaY * 0.01, 3, 22); };
    const blur = () => keys.current.clear();
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('mousemove', move);
    gl.domElement.addEventListener('mousedown', pressed);
    gl.domElement.addEventListener('contextmenu', menu);
    window.addEventListener('mouseup', released);
    gl.domElement.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', move);
      gl.domElement.removeEventListener('mousedown', pressed);
      gl.domElement.removeEventListener('contextmenu', menu);
      window.removeEventListener('mouseup', released);
      gl.domElement.removeEventListener('wheel', wheel);
    };
  }, [gl, paused]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    fps.current.time += delta;
    fps.current.frames++;
    if (fps.current.time >= 1) {
      onFps(Math.round(fps.current.frames / fps.current.time));
      onPosition([position.current.x, position.current.z]);
      fps.current = { time: 0, frames: 0 };
    }
    // Dev hook for screenshots: window.__vlCam = [x, y, z, tx, ty, tz]
    const debugCam = (window as unknown as { __vlCam?: number[] }).__vlCam;
    (window as unknown as { __vlInfo?: unknown }).__vlInfo = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
    if (import.meta.env.DEV || debugCam) {
      if (debugCam) { camera.position.set(debugCam[0], debugCam[1], debugCam[2]); camera.lookAt(debugCam[3], debugCam[4], debugCam[5]); focus.set(debugCam[3], 0, debugCam[5]); return; }
    }
    const k = keys.current;
    if (!paused) {
      if (k.has('ArrowLeft')) yaw.current += 1.8 * dt;
      if (k.has('ArrowRight')) yaw.current -= 1.8 * dt;
      if (k.has('ArrowUp')) pitch.current = Math.max(-0.15, pitch.current - 1.2 * dt);
      if (k.has('ArrowDown')) pitch.current = Math.min(1.25, pitch.current + 1.2 * dt);
    }
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const input = new THREE.Vector3();
    if (!paused) {
      if (k.has('KeyW')) input.add(forward);
      if (k.has('KeyS')) input.sub(forward);
      if (k.has('KeyD')) input.add(right);
      if (k.has('KeyA')) input.sub(right);
    }
    if (input.lengthSq()) input.normalize();
    const running = k.has('ShiftLeft') || k.has('ShiftRight');

    if (freeCamera) {
      const s = (running ? 45 : 18) * dt;
      drone.current.addScaledVector(input, s);
      if (k.has('Space') || k.has('KeyE')) drone.current.y += s;
      if (k.has('ControlLeft') || k.has('KeyQ')) drone.current.y -= s;
      drone.current.y = THREE.MathUtils.clamp(drone.current.y, 2, 250);
      camera.position.lerp(drone.current, 1 - Math.exp(-10 * dt));
      const lookDir = forward.clone().multiplyScalar(Math.cos(pitch.current)).setY(-Math.sin(pitch.current));
      camera.lookAt(camera.position.clone().add(lookDir));
      focus.copy(camera.position).addScaledVector(lookDir, 40);
      if (avatar.current) avatar.current.visible = true;
      return;
    }

    // Smooth acceleration so movement does not feel twitchy.
    const target = input.multiplyScalar(running ? 8.5 : 4.2);
    velocity.current.lerp(target, 1 - Math.exp(-10 * dt));
    speed.current = velocity.current.length();
    const p = position.current;
    const step = velocity.current.clone().multiplyScalar(dt);
    const nx: Point = [p.x + step.x, p.z];
    if (canWalk(nx)) p.x = nx[0]; else velocity.current.x = 0;
    const nz: Point = [p.x, p.z + step.z];
    if (canWalk(nz)) p.z = nz[1]; else velocity.current.z = 0;
    p.y = THREE.MathUtils.damp(p.y, groundHeight([p.x, p.z]), 14, dt);
    if (avatar.current) {
      avatar.current.position.copy(p);
      if (speed.current > 0.3) {
        const heading = Math.atan2(velocity.current.x, velocity.current.z);
        let diff = heading - avatar.current.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        avatar.current.rotation.y += diff * (1 - Math.exp(-12 * dt));
      }
    }
    focus.copy(p);
    const desired = p.clone()
      .addScaledVector(forward, -Math.cos(pitch.current) * distance.current)
      .add(new THREE.Vector3(0, 1.6 + Math.sin(pitch.current) * distance.current, 0));
    camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    camera.lookAt(p.x, p.y + 1.5, p.z);
  });

  return <group ref={avatar} position={position.current.toArray()}><Character speed={speed} /></group>;
}
