import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { bridgeEnds, cameraBlocked, canWalk, groundHeight, type Point } from './geo';
import { Avatar } from './Avatar';
import { taxi } from './ride';
import { CAR_PASSENGER } from './world/DenCar';
import { bike, game, player, tickNeeds, view } from './state';
import { WHEEL_R, WHEELBASE } from './world/Scooter';

export type PlayerProps = { paused: boolean; freeCamera: boolean; onFps: (fps: number) => void; onPosition: (p: Point) => void; focus: THREE.Vector3 };

/**
 * Third-person controller: WASD to walk, Shift to run, mouse (pointer lock or drag) or arrows
 * to orbit, wheel to zoom, V toggles a free drone camera.
 */
export function Player({ paused, freeCamera, onFps, onPosition, focus }: PlayerProps) {
  const { camera, gl, scene } = useThree();
  if (import.meta.env.DEV) (window as unknown as { __vlScene?: THREE.Scene }).__vlScene = scene;
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
  const sitting = useRef(false);
  const seatYaw = useRef(0);
  const lookOffset = useRef(0);
  const lastChaseYaw = useRef(0);

  useEffect(() => { if (freeCamera) drone.current.copy(camera.position); }, [freeCamera, camera]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __vlTeleport?: (x: number, z: number, yaw?: number) => void }).__vlTeleport = (x, z, y) => { position.current.set(x, groundHeight([x, z]), z); if (y !== undefined) yaw.current = y; };
  }, []);
  // Lets world logic (getting off the scooter) put the player down at a spot.
  useEffect(() => {
    player.teleport = (x, z) => { position.current.set(x, groundHeight([x, z]), z); velocity.current.set(0, 0, 0); };
    return () => { player.teleport = null; };
  }, []);
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
    const wheel = (e: WheelEvent) => { distance.current = THREE.MathUtils.clamp(distance.current + e.deltaY * 0.01, 1.4, 22); };
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
    /**
     * Chase camera locked behind a vehicle's heading. Mouse / arrow look only adds a temporary offset
     * that eases back to zero, so the bike is always seen from behind in its direction of travel.
     */
    const chaseCamera = (heading: number, vehicleSpeed: number, dtc: number) => {
      lookOffset.current += yaw.current - lastChaseYaw.current; // mouse movement since last frame
      if (!paused) {
        if (k.has('ArrowLeft')) lookOffset.current += 1.8 * dtc;
        if (k.has('ArrowRight')) lookOffset.current -= 1.8 * dtc;
      }
      lookOffset.current = Math.atan2(Math.sin(lookOffset.current), Math.cos(lookOffset.current));
      if (vehicleSpeed > 1.5) lookOffset.current *= Math.exp(-1.6 * dtc);
      yaw.current = heading + Math.PI + lookOffset.current;
      lastChaseYaw.current = yaw.current;
      pitch.current = THREE.MathUtils.clamp(pitch.current, 0.12, 0.7);
    };
    // ---- Pillion on an Đen SM bike: the driver rides, the camera follows.
    if (taxi.passenger && !freeCamera) {
      sitting.current = false;
      velocity.current.set(0, 0, 0); speed.current = 0;
      position.current.copy(taxi.position);
      const inCar = taxi.vehicle === 'car';
      if (avatar.current) {
        if (inCar) {
          // sit in the rear passenger seat, scaled to fit the cabin
          const h = taxi.heading;
          const sx = CAR_PASSENGER.x, sz = CAR_PASSENGER.z;
          avatar.current.position.set(taxi.position.x + sx * Math.cos(h) + sz * Math.sin(h), taxi.position.y + CAR_PASSENGER.y, taxi.position.z - sx * Math.sin(h) + sz * Math.cos(h));
          avatar.current.rotation.set(0, h, 0, 'YXZ');
          avatar.current.scale.setScalar(0.78);
        } else {
          avatar.current.position.copy(taxi.position); avatar.current.rotation.set(0, taxi.heading, taxi.lean, 'YXZ');
        }
      }
      chaseCamera(taxi.heading, 9, dt);
      const camFwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const dist = Math.max(inCar ? 8 : 5, distance.current * (inCar ? 1.1 : 0.85));
      const eye = taxi.position.clone().addScaledVector(camFwd, -Math.cos(pitch.current) * dist).add(new THREE.Vector3(0, 1.7 + Math.sin(pitch.current) * dist, 0));
      camera.position.lerp(eye, 1 - Math.exp(-7 * dt));
      camera.lookAt(taxi.position.x, taxi.position.y + 1.2, taxi.position.z);
      focus.copy(taxi.position);
      player.position.copy(taxi.position);
      player.yaw = yaw.current; view.yaw = yaw.current;
      if (!paused) tickNeeds(dt, false, false);
      return;
    }
    if (avatar.current && avatar.current.scale.x !== 1) avatar.current.scale.setScalar(1);
    if (!bike.riding) { lastChaseYaw.current = yaw.current; lookOffset.current = 0; }
    // ---- Riding the delivery scooter: W/S throttle and brake, A/D steer, Shift for full throttle.
    if (bike.riding && !freeCamera) {
      sitting.current = false;
      const throttle = paused ? 0 : (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      const steerIn = paused ? 0 : (k.has('KeyA') ? 1 : 0) - (k.has('KeyD') ? 1 : 0);
      const vmax = k.has('ShiftLeft') || k.has('ShiftRight') ? 15 : 10.5; // ≈ 54 / 38 km/h
      if (throttle > 0) bike.speed = Math.min(vmax, bike.speed + (bike.speed < 0 ? 9 : 3.4) * dt);
      else if (throttle < 0) bike.speed = bike.speed > 0.2 ? Math.max(0, bike.speed - 9 * dt) : Math.max(-2.2, bike.speed - 2.4 * dt);
      else bike.speed -= Math.sign(bike.speed) * Math.min(Math.abs(bike.speed), 1.5 * dt);
      if (bike.speed > vmax) bike.speed = Math.max(vmax, bike.speed - 4 * dt);
      const maxSteer = THREE.MathUtils.lerp(0.6, 0.2, Math.min(1, Math.abs(bike.speed) / 14));
      bike.steer = THREE.MathUtils.damp(bike.steer, steerIn * maxSteer, 7, dt);
      bike.heading += (bike.speed * Math.tan(bike.steer) / WHEELBASE) * dt;
      const fwd = new THREE.Vector3(Math.sin(bike.heading), 0, Math.cos(bike.heading));
      const next = bike.position.clone().addScaledVector(fwd, bike.speed * dt);
      const dirSign = bike.speed >= 0 ? 1 : -1;
      const nose: Point = [next.x + fwd.x * 0.95 * dirSign, next.z + fwd.z * 0.95 * dirSign];
      if (canWalk([next.x, next.z]) && canWalk(nose)) { bike.position.x = next.x; bike.position.z = next.z; }
      else bike.speed *= -0.2; // bump
      bike.position.y = THREE.MathUtils.damp(bike.position.y, groundHeight([bike.position.x, bike.position.z]), 12, dt);
      bike.wheel += (bike.speed * dt) / WHEEL_R;
      bike.lean = THREE.MathUtils.damp(bike.lean, -bike.steer * Math.min(1, Math.abs(bike.speed) / 7) * 0.5, 5, dt);
      velocity.current.set(0, 0, 0);
      speed.current = 0;
      position.current.copy(bike.position);
      if (avatar.current) { avatar.current.position.copy(bike.position); avatar.current.rotation.set(0, bike.heading, bike.lean, 'YXZ'); }
      chaseCamera(bike.heading, Math.abs(bike.speed), dt);
      const camFwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      const dist = Math.max(5, distance.current * 0.85);
      const eye = bike.position.clone().addScaledVector(camFwd, -Math.cos(pitch.current) * dist).add(new THREE.Vector3(0, 1.7 + Math.sin(pitch.current) * dist, 0));
      camera.position.lerp(eye, 1 - Math.exp(-7 * dt));
      camera.lookAt(bike.position.x, bike.position.y + 1.2, bike.position.z);
      focus.copy(bike.position);
      player.position.copy(bike.position);
      player.yaw = yaw.current;
      view.yaw = yaw.current;
      if (!paused) tickNeeds(dt, false, true);
      return;
    }
    // Seated at a restaurant table: avatar on the stool, camera orbits a close-up of the food.
    const seat = player.seat;
    if (seat) {
      // Start from a three-quarter view across the table so the dishes, not the avatar's back, fill the frame.
      if (!sitting.current) { sitting.current = true; seatYaw.current = seat.facing + 0.6 - yaw.current; pitch.current = 0.45; distance.current = 7.5; }
      if (!paused && k.has('ArrowLeft')) seatYaw.current += 1.2 * dt;
      if (!paused && k.has('ArrowRight')) seatYaw.current -= 1.2 * dt;
      velocity.current.set(0, 0, 0);
      speed.current = 0;
      position.current.copy(seat.position);
      if (avatar.current) { avatar.current.position.copy(seat.position); avatar.current.rotation.y = seat.facing; }
      // Mouse look (yaw) and arrows both orbit the camera around the dishes.
      const orbit = seatYaw.current + yaw.current;
      const r = THREE.MathUtils.clamp(distance.current * 0.2, 0.8, 3.4);
      // aim between the dishes and the diner's face so every bite reaches the mouth on screen
      const aim = seat.look.clone().lerp(seat.position, 0.3).setY(seat.look.y + 0.3);
      const eye = new THREE.Vector3(aim.x + Math.sin(orbit) * r, aim.y + 0.25 + Math.max(0, pitch.current) * 1.2, aim.z + Math.cos(orbit) * r);
      camera.position.lerp(eye, 1 - Math.exp(-6 * dt));
      camera.lookAt(aim);
      focus.copy(seat.look);
      player.position.copy(position.current);
      if (!paused) tickNeeds(dt, false, false);
      return;
    }
    if (sitting.current) { sitting.current = false; }
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
    const { hunger, thirst } = game.get();
    const exhausted = hunger <= 0 || thirst <= 0;
    const running = (k.has('ShiftLeft') || k.has('ShiftRight')) && !exhausted;

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
    const target = input.multiplyScalar(running ? 8.5 : exhausted ? 2.4 : 4.2);
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
    player.position.copy(p);
    player.yaw = yaw.current;
    view.yaw = yaw.current;
    if (avatar.current && avatar.current.rotation.z !== 0) avatar.current.rotation.set(0, avatar.current.rotation.y, 0, 'XYZ');
    if (!paused) tickNeeds(dt, running && speed.current > 1, speed.current > 0.5);
    let dist = Math.min(distance.current, player.cameraMax);
    // camera collision: pull the camera in front of walls and buildings between it and the player
    for (let k = 1; k <= 10; k++) {
      const dd = (dist * k) / 10;
      const q: Point = [p.x - forward.x * Math.cos(pitch.current) * dd, p.z - forward.z * Math.cos(pitch.current) * dd];
      if (cameraBlocked(q)) { dist = Math.max(1.2, dd - 0.35); break; }
    }
    const desired = p.clone()
      .addScaledVector(forward, -Math.cos(pitch.current) * dist)
      .add(new THREE.Vector3(0, 1.6 + Math.sin(pitch.current) * dist, 0));
    desired.y = Math.max(desired.y, p.y + 0.4);
    camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    camera.lookAt(p.x, p.y + 1.5, p.z);
  });

  return <group ref={avatar} position={position.current.toArray()}><Avatar speed={speed} /></group>;
}
