import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT } from '../geo';
import { jobActions } from '../job';
import { bike, commitPrompts, game, player, useGame } from '../state';
import { NameTag, Person, type PersonAnim } from './Person';
import { ScooterModel } from './Scooter';

/** Commits the best context action each frame and runs it on E / F. */
export function Interaction({ paused }: { paused: boolean }) {
  // Key presses are queued and resolved right after the frame's prompt is committed, so the action
  // always matches what is on screen.
  const queued = useRef<{ key: 'E' | 'F'; frames: number } | null>(null);
  useFrame(() => {
    commitPrompts();
    const q = queued.current;
    if (!q) return;
    const p = game.get().prompt;
    if (p?.key === q.key && p.run) { queued.current = null; p.run(); }
    else if (++q.frames > 3) queued.current = null;
  }, -1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || e.repeat) return;
      const key = e.code === 'KeyE' ? 'E' : e.code === 'KeyF' ? 'F' : null;
      if (key) queued.current = { key, frames: 0 };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused]);
  return null;
}

/** Glowing column and ring marking the customer's door, with a bobbing arrow. */
function Waypoint() {
  const arrow = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (arrow.current) { arrow.current.position.y = 3.2 + Math.sin(t * 3) * 0.25; arrow.current.rotation.y = t * 1.5; }
    if (ring.current) { const s = 1 + (t % 1.2) * 0.5; ring.current.scale.set(s, s, s); (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - (t % 1.2) / 1.2); }
  });
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd35c', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), []);
  return <group>
    <mesh material={beam} position={[0, 12, 0]}><cylinderGeometry args={[0.9, 0.9, 24, 24, 1, true]} /></mesh>
    <mesh ref={ring} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.1, 1.35, 40]} /><meshBasicMaterial color="#ffd35c" transparent opacity={0.7} depthWrite={false} /></mesh>
    <group ref={arrow}><mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.35, 0.7, 4]} /><meshStandardMaterial color="#ffcf3a" emissive="#ff9a00" emissiveIntensity={0.8} /></mesh></group>
  </group>;
}

/**
 * The delivery job in the world: the shop scooter (mount/dismount with F), the customer waiting at the
 * destination with a waypoint, and the hand-over with E.
 */
export function Job() {
  const job = useGame((s) => s.job);
  const customerAnim = useRef<PersonAnim>({ mode: 'stand', speed: 0 });
  const customer = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = game.get();
    if (!s.job) return;
    const dx = player.position.x - bike.position.x; const dz = player.position.z - bike.position.z;
    if (bike.riding) {
      if (Math.abs(bike.speed) < 1.5) game.offer({ id: 'dismount', text: 'Xuống xe', key: 'F', priority: 3, run: () => jobActions.dismount() });
    } else if (!player.seat && Math.hypot(dx, dz) < 1.9) {
      game.offer({ id: 'mount', text: 'Lên xe Wave của quán', key: 'F', priority: 7, run: () => jobActions.mount() });
    }
    const d = s.job.delivery;
    if (s.job.stage === 'deliver' && d) {
      const near = Math.hypot(player.position.x - d.dest.x, player.position.z - d.dest.z);
      if (near < 3.6 && (!bike.riding || Math.abs(bike.speed) < 2)) game.offer({ id: 'deliver', text: `Giao ${d.portions} suất bún chả cho ${d.customer}`, key: 'E', priority: 9, run: () => jobActions.deliver() });
      // the customer waves when you get close
      customerAnim.current.mode = near < 25 ? 'wave' : 'stand';
      if (customer.current) customer.current.rotation.y = near < 25 ? Math.atan2(player.position.x - d.dest.x, player.position.z - d.dest.z) : d.facing;
    }
  });
  if (!job) return null;
  const d = job.delivery;
  return <group>
    <ScooterModel pose={bike} />
    {job.stage === 'deliver' && d && <group position={[d.dest.x, GROUND_HEIGHT, d.dest.z]}>
      <Waypoint />
      <group ref={customer} rotation={[0, d.facing, 0]}>
        <Person anim={customerAnim.current} shirt="#d98fb0" pants="#3a3f4a" hair="#1b1715" seed={3} />
        <NameTag name={d.customer} role={`Khách · ${d.street}`} y={1.85} color="#ffd35c" />
      </group>
    </group>}
  </group>;
}
