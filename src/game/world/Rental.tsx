import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GROUND_HEIGHT } from '../geo';
import { jobActions } from '../job';
import { isCar } from '../net';
import { inReturnBay, RENTAL, RETURN_BAY, shopPoint } from '../rental';
import { bike, game, player, useGame } from '../state';
import { DenCarModel } from './DenCar';
import { NameTag, Person, type PersonAnim } from './Person';
import { ScooterModel } from './Scooter';

/*
 * The rental shop on Phố Hai Bà Trưng: an awning stall with its own sign, the owner (E to talk: rent or
 * settle up), a row of scooters and a car for hire at the kerb, the painted return bay, and the vehicle
 * you rented (F to get on and off).
 */
function sign() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0f5a8a'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#ffd34a'; x.fillRect(0, 104, 512, 24);
  x.fillStyle = '#fff'; x.font = 'bold 50px "Be Vietnam Pro", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('THUÊ XE HỒ GƯƠM', 256, 50);
  x.fillStyle = '#0f3a5a'; x.font = 'bold 18px Arial'; x.fillText('XE MÁY · Ô TÔ 5 CHỖ · THEO GIỜ', 256, 116);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const still = (x: number, z: number, h: number) => ({ position: new THREE.Vector3(x, 0.32, z), heading: h, steer: 0, lean: 0, wheel: 0, riding: false });

export function Rental() {
  const rental = useGame((s) => s.rental);
  const ownerAnim = useRef<PersonAnim>({ mode: 'stand', speed: 0 });
  const remind = useRef(performance.now());
  const mats = useMemo(() => ({
    sign: new THREE.MeshStandardMaterial({ map: sign(), roughness: 0.5 }),
    awning: new THREE.MeshStandardMaterial({ color: '#1f7fbf', roughness: 0.7, side: THREE.DoubleSide }),
    pole: new THREE.MeshStandardMaterial({ color: '#9aa1a6', roughness: 0.4, metalness: 0.6 }),
    desk: new THREE.MeshStandardMaterial({ color: '#d9c8a6', roughness: 0.7 }),
    paint: new THREE.MeshBasicMaterial({ color: '#f2d24a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
  }), []);
  // the fleet on display (the one you rent is drawn separately)
  const fleet = useMemo(() => {
    const h = RENTAL.facing + Math.PI / 2;
    const at = (f: number, s: number) => shopPoint(f, s);
    return {
      bikes: [[2.6, -2.4, '#1f9e6e'], [2.6, -3.6, '#e0a21b'], [2.6, -4.8, '#7a4bc2']].map(([f, s, c]) => { const [x, z] = at(f as number, s as number); return { pose: still(x, z, h), color: c as string }; }),
      car: (() => { const [x, z] = at(3.4, -11); return { pose: still(x, z, h), color: '#b9bec4' }; })(),
    };
  }, []);
  const owner = shopPoint(0.4, -0.6);
  useFrame(() => {
    const s = game.get();
    const dOwner = Math.hypot(player.position.x - owner[0], player.position.z - owner[1]);
    if (dOwner < 2.6 && !bike.riding && !s.rentalOpen) game.offer({ id: 'rental', text: s.rental ? 'Nói chuyện với chủ tiệm (trả xe)' : 'Nói chuyện với chủ tiệm Thuê Xe Hồ Gươm', key: 'E', priority: 8, run: () => { if (document.pointerLockElement) document.exitPointerLock(); game.set({ rentalOpen: true }); } });
    if (s.rentalOpen && dOwner > 4 && !bike.riding) game.set({ rentalOpen: false });
    if (!s.rental) return;
    // left the rented vehicle far away for a long time: a reminder every 3 minutes
    const away = !bike.riding && Math.hypot(player.position.x - bike.position.x, player.position.z - bike.position.z) > 150;
    const now = performance.now();
    if (!away) remind.current = now; else if (now - remind.current > 180_000) { remind.current = now; game.toast(`Xe thuê (${s.rental.plate}) đang bị bỏ ở xa. Tiền thuê vẫn tính theo thời gian, nhớ quay lại lấy và trả xe ở Thuê Xe Hồ Gươm nhé!`); }
    const car = isCar(bike.kind);
    if (bike.riding) {
      if (Math.abs(bike.speed) < 1.5) game.offer({ id: 'dismount', text: inReturnBay(bike.position.x, bike.position.z) ? 'Xuống xe (đã ở ô trả xe)' : 'Xuống xe thuê', key: 'F', priority: 3, run: () => jobActions.dismount() });
    } else if (!player.seat && Math.hypot(player.position.x - bike.position.x, player.position.z - bike.position.z) < (car ? 3.2 : 1.9)) {
      game.offer({ id: 'mount', text: `Lên ${car ? 'ô tô' : 'xe máy'} thuê (${s.rental.plate})`, key: 'F', priority: 7, run: () => jobActions.mount() });
    }
  });
  const [sx, sz] = shopPoint(0, 0);
  return <group>
    <group position={[sx, GROUND_HEIGHT, sz]} rotation={[0, RENTAL.facing, 0]}>
      {/* awning stall against the shopfront, sign on top */}
      {[-1.6, 1.6].flatMap((u) => [-0.6, 1.4].map((v) => <mesh key={`${u}${v}`} material={mats.pole} position={[u, 1.25, v]}><cylinderGeometry args={[0.04, 0.04, 2.5, 6]} /></mesh>))}
      <mesh material={mats.awning} position={[0, 2.5, 0.4]} rotation={[-0.25, 0, 0]}><boxGeometry args={[3.6, 0.05, 2.3]} /></mesh>
      <mesh material={mats.sign} position={[0, 2.95, -0.55]}><planeGeometry args={[3.2, 0.8]} /></mesh>
      <mesh material={mats.desk} position={[0.9, 0.5, 0.2]}><boxGeometry args={[1.4, 1.0, 0.6]} /></mesh>
    </group>
    <group position={[owner[0], GROUND_HEIGHT, owner[1]]} rotation={[0, RENTAL.facing, 0]}>
      <Person anim={ownerAnim.current} role="vendor" seed={41} shirt="#1f7fbf" pants="#2b2d33" />
      <NameTag name="Chú Tuấn" role="Chủ tiệm Thuê Xe Hồ Gươm" y={1.85} color="#7cc4ff" />
    </group>
    {/* return bay painted on the kerb lane */}
    <mesh material={mats.paint} position={[RETURN_BAY.center[0], GROUND_HEIGHT + 0.03, RETURN_BAY.center[1]]} rotation={[-Math.PI / 2, 0, -RENTAL.facing]}>
      <ringGeometry args={[RETURN_BAY.radius - 0.25, RETURN_BAY.radius, 40]} />
    </mesh>
    {fleet.bikes.map((b, i) => <ScooterModel key={i} pose={b.pose} livery="rent" color={b.color} />)}
    {(!rental || rental.kind !== 'car') && <DenCarModel pose={fleet.car.pose} plain color={fleet.car.color} />}
    {rental && (rental.kind === 'car' ? <DenCarModel pose={bike} plain color={rental.color} /> : <ScooterModel pose={bike} livery="rent" color={rental.color} />)}
  </group>;
}
