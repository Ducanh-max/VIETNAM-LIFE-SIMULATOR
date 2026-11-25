import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { groundHeight, type Point } from '../geo';
import { findRoute } from '../navigation';
import { FOOD_SPEED, receiveFood, shopById, shopFront, shopStore, useShops } from '../shops';
import { game, player, pushMessage } from '../state';
import { NameTag, Person, SIT_HIP, type PersonAnim } from './Person';
import { ScooterModel, SEAT, WHEEL_R, type BikePose } from './Scooter';

/** Position and heading at arc length s along a polyline. */
function pointAt(route: Point[], s: number) {
  let left = s;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= l || i === route.length - 2) { const t = l ? Math.min(1, left / l) : 0; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point, dir: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
    left -= l;
  }
  return { p: route[route.length - 1], dir: 0 };
}
const lengthOf = (r: Point[]) => r.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0), 0);

/**
 * The Food app's shipper: once the shop has the order ready they set off on a xe máy with a delivery box, follow the
 * streets to where the player is (re-routing if the player has walked off), stop beside them and hand the bag over.
 */
export function FoodShipper({ paused }: { paused: boolean }) {
  const food = useShops((s) => s.food);
  const pose = useRef<BikePose>({ position: new THREE.Vector3(), heading: 0, steer: 0, lean: 0, wheel: 0, riding: true }).current;
  const trip = useRef<{ route: Point[]; s: number; total: number; speed: number } | null>(null);
  const anim = useRef<PersonAnim>({ mode: 'ride', speed: 0 }).current;
  useFrame((_, delta) => {
    const f = shopStore.get().food;
    if (!f || paused) { if (!f) trip.current = null; return; }
    const dt = Math.min(delta, 0.05);
    const me: Point = [player.position.x, player.position.z];
    const go = (from: Point) => {
      const r = findRoute(from, me) ?? [from, me];
      trip.current = { route: r, s: 0, total: lengthOf(r), speed: trip.current?.speed ?? 0 };
      const st = pointAt(r, 0); pose.position.set(st.p[0], groundHeight(st.p), st.p[1]); pose.heading = st.dir;
    };
    if (f.stage === 'cooking') {
      if (performance.now() >= f.readyAt) {
        go(shopFront(shopById(f.shop)));
        shopStore.set({ food: { ...f, stage: 'riding' } });
        pushMessage(`Shipper ${f.shipper}`, `Em nhận đơn ${shopById(f.shop).name} rồi, đang chạy tới chỗ anh/chị ạ.`);
      }
      return;
    }
    const t = trip.current;
    if (!t) { go([pose.position.x, pose.position.z]); return; }
    const away = Math.hypot(me[0] - pose.position.x, me[1] - pose.position.z);
    if (f.stage === 'riding') {
      const left = t.total - t.s;
      const want = Math.min(FOOD_SPEED, Math.sqrt(2 * 4 * Math.max(0, left - 0.5)) + 0.8);
      t.speed = want > t.speed ? Math.min(want, t.speed + 3 * dt) : Math.max(want, t.speed - 6 * dt);
      t.s = Math.min(t.total, t.s + t.speed * dt);
      const { p, dir } = pointAt(t.route, t.s);
      const prev = pose.heading; let diff = dir - pose.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      pose.heading += diff * (1 - Math.exp(-6 * dt));
      pose.lean = THREE.MathUtils.damp(pose.lean, -THREE.MathUtils.clamp(((pose.heading - prev) / Math.max(dt, 1e-3)) * 0.18, -0.3, 0.3), 5, dt);
      pose.position.x = p[0]; pose.position.z = p[1];
      pose.position.y = THREE.MathUtils.damp(pose.position.y, groundHeight(p), 10, dt);
      pose.wheel += (t.speed * dt) / WHEEL_R;
      anim.speed = t.speed;
      if (t.s >= t.total - 0.05) {
        if (away > 16 && f.reroutes < 6) { shopStore.set({ food: { ...f, reroutes: f.reroutes + 1 } }); go([pose.position.x, pose.position.z]); }
        else { t.speed = 0; shopStore.set({ food: { ...f, stage: 'arrived' } }); game.toast(`Shipper ${f.shipper} đã tới với đồ ăn của bạn! Lại gần và bấm E để nhận.`); }
      }
    } else if (f.stage === 'arrived') {
      anim.speed = 0;
      if (away < 4) game.offer({ id: 'food-receive', text: `Nhận đồ ăn từ shipper ${f.shipper}`, key: 'E', priority: 8, run: () => receiveFood() });
      else if (away > 45) { shopStore.set({ food: { ...f, stage: 'riding' } }); go([pose.position.x, pose.position.z]); }
      else game.offer({ id: 'food-wait', text: `Shipper ${f.shipper} đang đợi bạn (${Math.round(away)} m)`, key: null, priority: 2 });
    }
  });
  if (!food || food.stage === 'cooking') return null;
  return <ScooterModel pose={pose} livery="shop">
    <group position={[0, SEAT.y - SIT_HIP, SEAT.z + 0.1]}>
      <Person anim={anim} shirt="#ff6a3d" pants="#2a2a2a" hair="#16120f" seed={31} />
      <NameTag name={food.shipper} role="Shipper Food" y={1.75} color="#ff8a5c" />
    </group>
  </ScooterModel>;
}
