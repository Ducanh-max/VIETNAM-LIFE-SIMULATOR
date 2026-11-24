import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { driverActions } from '../driver';
import { GROUND_HEIGHT } from '../geo';
import { jobActions } from '../job';
import { bike, game, player, useGame } from '../state';
import { CAR_PASSENGER, DenCarModel } from './DenCar';
import { Waypoint } from './Job';
import { NameTag, Person, SIT_HIP, type PersonAnim } from './Person';
import { PILLION, ScooterModel } from './Scooter';

/**
 * The Đen SM driver job in the world: the player's Đen Bike / Đen Car (F to get on and off), the
 * passenger waiting at the curb with a waypoint (E to let them on once stopped next to them), riding
 * along on the pillion or the back seat, and the drop-off point (E to let them off).
 */
export function DriverJob() {
  const driver = useGame((s) => s.driver);
  const waitAnim = useRef<PersonAnim>({ mode: 'stand', speed: 0 });
  const rideAnim = useRef<PersonAnim>({ mode: 'sit', speed: 0 });
  const waiting = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = game.get();
    const d = s.driver;
    if (!d) return;
    driverActions.tick();
    const car = bike.kind === 'dencar';
    const name = car ? 'Đen Car' : 'Đen Bike';
    const reach = car ? 3.2 : 1.9;
    if (bike.riding) {
      if (Math.abs(bike.speed) < 1.5) game.offer({ id: 'dismount', text: `Xuống ${name}`, key: 'F', priority: 3, run: () => jobActions.dismount() });
    } else if (!player.seat && Math.hypot(player.position.x - bike.position.x, player.position.z - bike.position.z) < reach) {
      game.offer({ id: 'mount', text: `Lên ${name}`, key: 'F', priority: 7, run: () => jobActions.mount() });
    }
    const f = d.fare;
    if (!f) return;
    const slow = bike.riding && Math.abs(bike.speed) < 1.2;
    if (d.stage === 'pickup') {
      const near = Math.hypot(bike.position.x - f.pickup.x, bike.position.z - f.pickup.z);
      if (near < (car ? 6 : 4.5)) game.offer(slow ? { id: 'board', text: `Đón ${f.passenger} lên xe`, key: 'E', priority: 9, run: () => driverActions.board() } : { id: 'board-slow', text: `Dừng xe lại để đón ${f.passenger}`, key: null, priority: 4 });
      else if (!bike.riding) game.offer({ id: 'go-pickup', text: `Lên xe và tới đón ${f.passenger} · ${Math.round(near)} m`, key: null, priority: 1 });
      // the passenger waves when the car comes near
      waitAnim.current.mode = near < 30 ? 'wave' : 'phone';
      if (waiting.current) waiting.current.rotation.y = near < 30 ? Math.atan2(bike.position.x - f.pickup.x, bike.position.z - f.pickup.z) : f.pickup.facing;
    } else if (d.stage === 'onboard') {
      const near = Math.hypot(bike.position.x - f.dest.x, bike.position.z - f.dest.z);
      if (near < (car ? 7 : 5)) game.offer(slow ? { id: 'dropoff', text: `Trả ${f.passenger} · nhận ${f.fare.toLocaleString('vi-VN')}đ`, key: 'E', priority: 9, run: () => driverActions.dropoff() } : { id: 'drop-slow', text: 'Dừng xe lại để trả khách', key: null, priority: 4 });
    }
  });
  if (!driver) return null;
  const f = driver.fare;
  const car = driver.vehicle === 'car';
  const passenger = f && driver.stage === 'onboard'
    ? <Person anim={rideAnim.current} role="tourist" seed={f.seed} />
    : null;
  return <group>
    {car
      ? <DenCarModel pose={bike}>{passenger && <group position={[CAR_PASSENGER.x, CAR_PASSENGER.y - SIT_HIP, CAR_PASSENGER.z]}>{passenger}</group>}</DenCarModel>
      : <ScooterModel pose={bike} livery="den">{passenger && <group position={[0, PILLION.y - SIT_HIP, PILLION.z - 0.04]}>{passenger}</group>}</ScooterModel>}
    {f && driver.stage === 'pickup' && <group position={[f.pickup.x, GROUND_HEIGHT, f.pickup.z]}>
      <Waypoint />
      <group ref={waiting} rotation={[0, f.pickup.facing, 0]}>
        <Person anim={waitAnim.current} role="tourist" seed={f.seed} />
        <NameTag name={f.passenger} role={`Khách Đen SM · ${f.pickup.street}`} y={1.85} color="#16c784" />
      </group>
    </group>}
    {f && driver.stage === 'onboard' && <group position={[f.dest.x, GROUND_HEIGHT, f.dest.z]}><Waypoint /></group>}
  </group>;
}
