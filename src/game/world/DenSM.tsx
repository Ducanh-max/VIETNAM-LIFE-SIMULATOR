import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { rideActions, stepTaxi, taxi, VEHICLES } from '../ride';
import { game, player, useGame } from '../state';
import { CAR_DRIVER, DenCarModel } from './DenCar';
import { NameTag, Person, type PersonAnim } from './Person';
import { ScooterModel, SEAT } from './Scooter';

/** The Đen SM driver on an electric bike or in an electric car: comes to the player, waits, then takes them there. */
export function DenSM({ paused }: { paused: boolean }) {
  const ride = useGame((s) => s.ride);
  const driverAnim = useRef<PersonAnim>({ mode: 'sit', speed: 0 });
  const arrived = useRef(0);
  useFrame((_, delta) => {
    const r = game.get().ride;
    if (!r || paused) return;
    const dt = Math.min(delta, 0.05);
    const car = r.vehicle === 'car';
    if (r.stage === 'arriving') {
      if (stepTaxi(dt, car ? 9 : 7.5)) { game.set({ ride: { ...r, stage: 'waiting' } }); game.toast(`${r.driver} đã tới! Ra ${car ? 'ô tô' : 'xe'} Đen SM và bấm E để lên xe.`); }
    } else if (r.stage === 'waiting') {
      const d = Math.hypot(player.position.x - taxi.position.x, player.position.z - taxi.position.z);
      if (d < (car ? 3.8 : 3.2)) game.offer({ id: 'board', text: `Lên ${VEHICLES[r.vehicle].name} của ${r.driver}`, key: 'E', priority: 8, run: () => rideActions.board() });
      else game.offer({ id: 'taxi-wait', text: `${r.driver} đang đợi bạn ở ${VEHICLES[r.vehicle].name} (${Math.round(d)} m)`, key: null, priority: 2 });
    } else if (r.stage === 'riding') {
      if (stepTaxi(dt, VEHICLES[r.vehicle].speed)) {
        arrived.current += dt;
        if (arrived.current > 0.6) { arrived.current = 0; rideActions.finish(); }
      } else game.offer({ id: 'taxi-ride', text: `Đang đi tới ${r.dest.name}…`, key: null, priority: 2 });
    }
  });
  if (!ride) return null;
  const tag = <NameTag name={ride.driver} role={`Tài xế ${VEHICLES[ride.vehicle].name}`} y={2.15} color="#16c784" />;
  if (ride.vehicle === 'car') {
    return <DenCarModel pose={taxi}>
      <group position={[CAR_DRIVER.x, CAR_DRIVER.y - 0.4 * 0.78, CAR_DRIVER.z]} scale={0.78}>
        <Person anim={driverAnim.current} shirt="#16c784" pants="#1b1b1d" hair="#111214" seed={11} />
      </group>
      <group position={[0, 0.4, 0]}>{tag}</group>
    </DenCarModel>;
  }
  return <ScooterModel pose={taxi} livery="den">
    {/* driver in the Đen SM green jacket */}
    <group position={[0, SEAT.y - 0.4, SEAT.z]}>
      <Person anim={driverAnim.current} shirt="#16c784" pants="#1b1b1d" hair="#111214" seed={11} />
      {tag}
    </group>
  </ScooterModel>;
}
