import * as THREE from 'three';
import { bridgeEnds, canWalk, groundHeight, type Point } from './geo';
import { findRoute, routeLength } from './navigation';
import { buildings, deliverySpots, RESTAURANT, restaurantToWorld, roads } from './osm';
import { LOTTE, lotteDoor } from './lotte';
import { addMoney, bike, formatVnd, game, player, pushMessage } from './state';
import { WHEEL_R } from './world/Scooter';

/*
 * Đen SM — an (original, fictional) electric ride-hailing app on the phone. Pick a place, see the fare,
 * book an Đen Bike: a driver rides over along the real streets, you hop on the back (E) and get taken
 * there; the fare comes out of the wallet when you arrive.
 */
export type Place = { name: string; note: string; x: number; z: number };
export type Vehicle = 'bike' | 'car';
export type Ride = { stage: 'arriving' | 'waiting' | 'riding'; vehicle: Vehicle; dest: Place; fare: number; distance: number; driver: string; plate: string };
export const VEHICLES: Record<Vehicle, { name: string; note: string; speed: number; seats: number; perKm: number; per100: number }> = {
  bike: { name: 'Đen Bike', note: 'Xe máy điện · 1 khách', speed: 50 / 3.6, seats: 1, perKm: 18_000, per100: 1_800 },
  car: { name: 'Đen Car', note: 'Ô tô điện 4 chỗ · điều hoà', speed: 70 / 3.6, seats: 4, perKm: 34_000, per100: 3_400 },
};
/** Shortest trip Đen SM takes (real street distance): shorter places can't be booked and no shorter requests come in. */
export const MIN_TRIP = 1000;

const DRIVERS = ['Anh Minh', 'Anh Quân', 'Chị Hạnh', 'Anh Toàn', 'Anh Sơn', 'Chị Vy'];

/** Pickup/drop-off point near a spot: the nearest doorstep on a named street, else the spot itself. */
function curbNear(x: number, z: number): Point {
  let best: Point = [x, z]; let bestD = 160;
  for (const s of deliverySpots) { const d = Math.hypot(s.p[0] - x, s.p[1] - z); if (d < bestD) { bestD = d; best = s.p; } }
  return best;
}

let placesCache: Place[] | null = null;
export function places(): Place[] {
  if (placesCache) return placesCache;
  const list: Place[] = [];
  const byName = (name: string, note: string, label = name) => {
    const b = buildings.find((x) => x.name === name);
    if (b) { const [x, z] = curbNear(b.center[0], b.center[1]); list.push({ name: label, note, x, z }); }
  };
  const [rx, rz] = restaurantToWorld(0, RESTAURANT.depth / 2 + 2);
  list.push({ name: 'Bún chả Đức Anh', note: 'Phố Đinh Tiên Hoàng', x: rx, z: rz });
  const away: Point = [bridgeEnds[0][0] - bridgeEnds[1][0], bridgeEnds[0][1] - bridgeEnds[1][1]];
  const al = Math.hypot(away[0], away[1]);
  list.push({ name: 'Cầu Thê Húc · Đền Ngọc Sơn', note: 'Lối vào đền, bờ đông Hồ Gươm', x: bridgeEnds[0][0] + (away[0] / al) * 9, z: bridgeEnds[0][1] + (away[1] / al) * 9 });
  if (LOTTE) { const [x, z] = lotteDoor(); list.push({ name: 'Lotte Center Hà Nội', note: '54 Liễu Giai · đài quan sát tầng 65', x, z }); }
  byName('Nhà hát Lớn', 'Quảng trường Cách mạng Tháng Tám');
  byName('Nhà thờ Lớn', 'Phố Nhà Chung');
  byName('Tràng Tiền Plaza', 'Phố Tràng Tiền');
  byName('Nhà tù Hỏa Lò', 'Phố Hỏa Lò', 'Di tích Nhà tù Hỏa Lò');
  byName('Chợ Hàng Da', 'Phố Hàng Da');
  byName('Đền Bạch Mã', 'Phố Hàng Buồm · Phố cổ');
  byName('Tháp Hòa Phong', 'Bờ đông nam Hồ Gươm');
  const taHien = roads.find((r) => r.name === 'Phố Tạ Hiện');
  if (taHien) { const p = taHien.points[Math.floor(taHien.points.length / 2)]; const [x, z] = curbNear(p[0], p[1]); list.push({ name: 'Phố bia Tạ Hiện', note: 'Phố cổ, sôi động buổi tối', x, z }); }
  const hangDao = roads.find((r) => r.name === 'Phố Hàng Đào');
  if (hangDao) { const p = hangDao.points[Math.floor(hangDao.points.length / 2)]; const [x, z] = curbNear(p[0], p[1]); list.push({ name: 'Phố Hàng Đào', note: 'Phố cổ, phía bắc hồ', x, z }); }
  return (placesCache = list);
}

/** Đen Bike 18.000đ/km, Đen Car 34.000đ/km of the route along the streets, rounded up to each started 100 m (1,25 km → 1,3 km → 23.400đ / 44.200đ). */
export const fareFor = (meters: number, vehicle: Vehicle) => Math.max(1, Math.ceil(meters / 100)) * VEHICLES[vehicle].per100;

/** Exact route quote from the player to a place: real street distance, fare and riding time for each vehicle. */
export function quote(place: Place) {
  const trip = findRoute([player.position.x, player.position.z], [place.x, place.z]);
  if (!trip) return null;
  const distance = routeLength(trip);
  return { distance, fare: { bike: fareFor(distance, 'bike'), car: fareFor(distance, 'car') }, minutes: { bike: Math.max(1, Math.round(distance / VEHICLES.bike.speed / 60)), car: Math.max(1, Math.round(distance / VEHICLES.car.speed / 60)) } };
}

/** Live pose of the Đen Bike plus the route it is following. */
export const taxi = {
  position: new THREE.Vector3(), heading: 0, steer: 0, lean: 0, wheel: 0, riding: true,
  passenger: false,
  vehicle: 'bike' as Vehicle,
  route: [] as Point[],
  s: 0, // distance travelled along the route
  speed: 0, // current speed (m/s)
  /** Where the player sits in the car (car space), default the rear passenger seat. */
  seatOffset: null as THREE.Vector3 | null,
};

function pointAt(route: Point[], s: number) {
  let acc = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s) { const t = (s - acc) / (l || 1); return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point, dir: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
    acc += l;
  }
  const a = route[route.length - 2] ?? route[0], b = route[route.length - 1];
  return { p: b, dir: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export const rideActions = {
  book(place: Place, vehicle: Vehicle = 'bike') {
    const s = game.get();
    if (s.ride) return;
    if (bike.riding) { game.toast('Bạn đang lái xe Wave của quán, xuống xe trước đã nhé.'); return; }
    const from: Point = [player.position.x, player.position.z];
    const trip = findRoute(from, [place.x, place.z]);
    if (!trip) { game.toast('Đen SM chưa tìm được đường tới đó, bạn chọn điểm khác nhé.'); return; }
    const distance = routeLength(trip);
    if (distance < MIN_TRIP) { game.toast(`Chuyến này chỉ ${Math.round(distance)} m. Đen SM nhận chuyến từ 1 km trở lên.`); return; }
    const fare = fareFor(distance, vehicle);
    if (fare > s.money) { game.toast(`Không đủ tiền: chuyến này ${formatVnd(fare)}.`); return; }
    // the driver starts a couple of blocks away and rides to you
    const near = deliverySpots.filter((d) => { const dd = Math.hypot(d.p[0] - from[0], d.p[1] - from[1]); return dd > 90 && dd < 200; });
    const start = near[Math.floor(Math.random() * near.length)]?.p ?? [from[0] + 60, from[1]];
    const approach = findRoute(start, from) ?? [start, from];
    taxi.route = approach; taxi.s = 0; taxi.speed = 0; taxi.passenger = false; taxi.vehicle = vehicle; taxi.seatOffset = null;
    const first = pointAt(approach, 0);
    taxi.position.set(first.p[0], groundHeight(first.p), first.p[1]); taxi.heading = first.dir;
    const driver = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
    const plate = vehicle === 'car' ? `30K-${100 + Math.floor(Math.random() * 899)}.${10 + Math.floor(Math.random() * 89)}` : `29-MĐ ${100 + Math.floor(Math.random() * 899)}.${10 + Math.floor(Math.random() * 89)}`;
    game.set({ ride: { stage: 'arriving', vehicle, dest: place, fare, distance, driver, plate } });
    pushMessage('Đen SM', `${driver} (${VEHICLES[vehicle].name} ${plate}) đang đến đón bạn. Chuyến tới ${place.name} · ${(distance / 1000).toFixed(2)} km · ${formatVnd(fare)}.`);
  },
  cancel() {
    const r = game.get().ride;
    if (!r || r.stage === 'riding') return;
    taxi.passenger = false;
    game.set({ ride: null });
    game.toast('Đã huỷ chuyến Đen SM.');
  },
  board() {
    const r = game.get().ride;
    if (!r || r.stage !== 'waiting') return;
    const trip = findRoute([taxi.position.x, taxi.position.z], [r.dest.x, r.dest.z]);
    if (!trip) { game.toast('Tài xế không tìm được đường, thử lại sau nhé.'); return; }
    taxi.route = trip; taxi.s = 0; taxi.speed = 0; taxi.passenger = true;
    game.set({ ride: { ...r, stage: 'riding' } });
    game.toast(`${r.driver}: "Mình đi ${r.dest.name} nhé, bám chắc vào!"`);
  },
  finish() {
    const r = game.get().ride;
    if (!r) return;
    taxi.passenger = false;
    const h = taxi.heading;
    for (const side of [1, -1]) {
      const off = taxi.vehicle === 'car' ? 1.5 : 0.9;
      const p: Point = [taxi.position.x + Math.cos(h) * off * side, taxi.position.z - Math.sin(h) * off * side];
      if (canWalk(p)) { player.teleport?.(p[0], p[1]); break; }
    }
    addMoney(-r.fare, `Đen SM · ${r.dest.name}`);
    game.set({ ride: null });
    game.toast(`Đã tới ${r.dest.name}. Thanh toán ${formatVnd(r.fare)} qua ví. Cảm ơn bạn đã đi Đen SM!`);
    pushMessage('Đen SM', `Chuyến tới ${r.dest.name} hoàn tất · ${formatVnd(r.fare)}. Đánh giá ${r.driver} ★★★★★ nhé!`);
  },
};

/** Advance the Đen Bike along its route. Returns true when the route end is reached. */
/**
 * Drive along the route like the player does: accelerate to the town cruising speed (Đen Bike 50 km/h,
 * Đen Car 70 km/h), slow down for sharp turns ahead and brake to stop exactly at the end.
 */
export function stepTaxi(dt: number, cruise: number) {
  const total = routeLength(taxi.route);
  const left = total - taxi.s;
  // how sharply the road bends over the next stretch (chord directions, so the raster route's small zigzags don't count)
  const look = Math.max(14, taxi.speed * 2);
  const P0 = pointAt(taxi.route, taxi.s).p, P1 = pointAt(taxi.route, Math.min(total, taxi.s + look / 2)).p, P2 = pointAt(taxi.route, Math.min(total, taxi.s + look)).p;
  const a1 = Math.atan2(P1[0] - P0[0], P1[1] - P0[1]), a2 = Math.atan2(P2[0] - P1[0], P2[1] - P1[1]);
  let turn = Math.abs(a2 - a1); turn = Math.min(turn, Math.PI * 2 - turn);
  const curveLimit = turn > 1.1 ? 5.5 : turn > 0.7 ? 8.5 : turn > 0.4 ? 13 : cruise;
  const stopLimit = Math.sqrt(2 * 5 * Math.max(0, left - 0.3)); // brake at 5 m/s² to stop on the spot
  const want = Math.min(cruise, curveLimit, stopLimit);
  taxi.speed = want > taxi.speed ? Math.min(want, taxi.speed + 3.6 * dt) : Math.max(want, taxi.speed - 7 * dt);
  taxi.speed = Math.max(taxi.speed, Math.min(1.5, left / Math.max(dt, 1e-3))); // creep the last metres
  const speed = taxi.speed;
  taxi.s = Math.min(total, taxi.s + speed * dt);
  const { p, dir } = pointAt(taxi.route, taxi.s);
  const prev = taxi.heading;
  let diff = dir - taxi.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  taxi.heading += diff * (1 - Math.exp(-6 * dt));
  const turnRate = (taxi.heading - prev) / Math.max(dt, 1e-3);
  taxi.steer = THREE.MathUtils.damp(taxi.steer, THREE.MathUtils.clamp(turnRate * 0.25, -0.5, 0.5), 6, dt);
  taxi.lean = THREE.MathUtils.damp(taxi.lean, -THREE.MathUtils.clamp(turnRate * 0.18, -0.35, 0.35), 5, dt);
  taxi.position.x = p[0]; taxi.position.z = p[1];
  taxi.position.y = THREE.MathUtils.damp(taxi.position.y, groundHeight(p), 10, dt);
  taxi.wheel += (speed * dt) / WHEEL_R;
  if (taxi.s >= total - 0.05) { taxi.speed = 0; return true; }
  return false;
}

// Dev hook for test scripts.
if (import.meta.env.DEV) (window as unknown as { __taxi?: unknown }).__taxi = { taxi, rideActions, places, findRoute, routeLength, stepTaxi, VEHICLES };
