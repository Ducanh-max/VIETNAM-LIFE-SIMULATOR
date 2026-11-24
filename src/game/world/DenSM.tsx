import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { rideActions, stepTaxi, taxi } from '../ride';
import { game, player, useGame } from '../state';
import { NameTag, Person, type PersonAnim } from './Person';
import { ScooterModel, SEAT } from './Scooter';

/** The Đen SM driver and electric bike: rides to the player, waits, then carries them to the destination. */
export function DenSM({ paused }: { paused: boolean }) {
  const ride = useGame((s) => s.ride);
  const driverAnim = useRef<PersonAnim>({ mode: 'sit', speed: 0 });
  const arrived = useRef(0);
  useFrame((_, delta) => {
    const r = game.get().ride;
    if (!r || paused) return;
    const dt = Math.min(delta, 0.05);
    if (r.stage === 'arriving') {
      if (stepTaxi(dt, 7.5)) { game.set({ ride: { ...r, stage: 'waiting' } }); game.toast(`${r.driver} đã tới! Ra xe Đen SM và bấm E để lên xe.`); }
    } else if (r.stage === 'waiting') {
      const d = Math.hypot(player.position.x - taxi.position.x, player.position.z - taxi.position.z);
      if (d < 3.2) game.offer({ id: 'board', text: `Lên xe Đen SM của ${r.driver}`, key: 'E', priority: 8, run: () => rideActions.board() });
      else game.offer({ id: 'taxi-wait', text: `${r.driver} đang đợi bạn ở xe Đen SM (${Math.round(d)} m)`, key: null, priority: 2 });
    } else if (r.stage === 'riding') {
      if (stepTaxi(dt, 9)) {
        arrived.current += dt;
        if (arrived.current > 0.6) { arrived.current = 0; rideActions.finish(); }
      } else game.offer({ id: 'taxi-ride', text: `Đang đi tới ${r.dest.name}…`, key: null, priority: 2 });
    }
  });
  if (!ride) return null;
  return <ScooterModel pose={taxi} livery="den">
    {/* driver in the Đen SM green jacket */}
    <group position={[0, SEAT.y - 0.4, SEAT.z]}>
      <Person anim={driverAnim.current} shirt="#16c784" pants="#1b1b1d" hair="#111214" seed={11} />
      <NameTag name={ride.driver} role="Tài xế Đen SM" y={2.15} color="#16c784" />
    </group>
  </ScooterModel>;
}
