import { canWalk, type Point } from './geo';
import { jobActions } from './job';
import { findRoute, routeLength } from './navigation';
import { deliverySpots } from './osm';
import { fareFor, MIN_TRIP } from './ride';
import { addMoney, bike, formatVnd, game, player, pushMessage, type Fare } from './state';

/*
 * Working as an Đen SM driver: sign up in the Đen SM app, pick Đen Bike (electric scooter) or Đen Car
 * (electric car), put on the uniform, and take ride requests: drive to the passenger waiting at the
 * curb, stop and let them on (E), drive them to their destination and let them off (E). The fare is
 * the real street distance of the trip at the app's rate (Bike 18.000đ / Car 34.000đ per km, rounded up per 100 m;
 * trips are 1 km or longer),
 * plus sometimes a tip and a star rating. One job at a time: not while shipping bún chả.
 */
export const PASSENGERS = ['Chị Thu', 'Anh Nam', 'Cô Liên', 'Bạn Khoa', 'Chú Hải', 'Em Vy', 'Anh Đức', 'Chị Trang', 'Bác Sơn', 'Bạn Linh', 'Anh Phúc', 'Cô Yến'];

/** Put the Đen vehicle down next to the player, facing the way the camera looks. */
function placeVehicle(kind: 'denbike' | 'dencar') {
  const h = player.yaw + Math.PI;
  const side = kind === 'dencar' ? 2.2 : 1.3;
  bike.position.set(player.position.x + 1.5, player.position.y, player.position.z);
  for (const s of [1, -1, 2, -2]) {
    const p: Point = [player.position.x + Math.cos(h) * side * s, player.position.z - Math.sin(h) * side * s];
    if (canWalk(p)) { bike.position.set(p[0], player.position.y, p[1]); break; }
  }
  bike.heading = h; bike.speed = 0; bike.steer = 0; bike.lean = 0; bike.riding = false; bike.kind = kind;
}

function pickSpot(from: Point, min: number, max: number, avoid?: Point) {
  const c = deliverySpots.filter((d) => { const r = Math.hypot(d.p[0] - from[0], d.p[1] - from[1]); return r > min && r < max && (!avoid || Math.hypot(d.p[0] - avoid[0], d.p[1] - avoid[1]) > 60); });
  return c[Math.floor(Math.random() * c.length)] ?? deliverySpots[Math.floor(Math.random() * deliverySpots.length)];
}

function newFare(vehicle: 'bike' | 'car'): Fare | null {
  const at: Point = [bike.position.x, bike.position.z];
  for (let attempt = 0; attempt < 10; attempt++) {
    const pick = pickSpot(at, 70, 380);
    const drop = pickSpot(pick.p, 750, 1900, at);
    const route = findRoute(pick.p, drop.p);
    if (!route) continue;
    const distance = routeLength(route);
    if (distance < MIN_TRIP) continue; // Đen SM only takes trips of 1 km or more
    return {
      passenger: PASSENGERS[Math.floor(Math.random() * PASSENGERS.length)], seed: 20 + Math.floor(Math.random() * 400),
      pickup: { x: pick.p[0], z: pick.p[1], facing: pick.facing, street: pick.street }, dest: { x: drop.p[0], z: drop.p[1], street: drop.street },
      distance, fare: fareFor(distance, vehicle), requestedAt: performance.now(),
    };
  }
  return null;
}

export const driverActions = {
  /** Sign up from the Đen SM app. */
  accept(vehicle: 'bike' | 'car') {
    const s = game.get();
    if (s.rental) { game.toast('Bạn đang thuê xe. Trả xe ở Thuê Xe Hồ Gươm rồi mới chạy Đen SM được (không dùng xe thuê để chạy).'); return; }
    if (s.job) { game.toast('Bạn đang ship bún chả cho quán. Nghỉ việc ship trước rồi mới chạy Đen SM được nhé.'); return; }
    if (s.ride) { game.toast('Bạn đang đặt một chuyến Đen SM, hoàn tất hoặc huỷ chuyến trước đã.'); return; }
    if (player.seat) { game.toast('Đứng dậy khỏi bàn trước đã nhé.'); return; }
    placeVehicle(vehicle === 'car' ? 'dencar' : 'denbike');
    game.set({ driver: { vehicle, stage: 'free', fare: null, trips: 0, earned: 0, stars: [], nextAt: performance.now() + 4000 } });
    const name = vehicle === 'car' ? 'Đen Car' : 'Đen Bike';
    game.toast(`Đã nhận việc tài xế ${name}! Đồng phục đã mặc. Xe ở ngay cạnh bạn: bấm F để lên xe, cuốc đầu tiên sẽ tới sau vài giây.`);
    pushMessage('Đen SM Tài xế', `Chào mừng bạn gia nhập đội ${name}. Bật app khi lái xe để nhận cuốc; giá ${vehicle === 'car' ? '34.000đ' : '18.000đ'}/km theo đường phố (làm tròn mỗi 100 m), cuốc từ 1 km trở lên.`);
  },
  /** Called every frame while working. */
  tick() {
    const d = game.get().driver;
    if (!d || d.stage !== 'free' || !bike.riding || performance.now() < d.nextAt) return;
    const fare = newFare(d.vehicle);
    if (!fare) { game.set({ driver: { ...d, nextAt: performance.now() + 3000 } }); return; }
    game.set({ driver: { ...d, stage: 'pickup', fare } });
    game.toast(`Cuốc mới: đón ${fare.passenger} ở ${fare.pickup.street}, tới ${fare.dest.street} · ${(fare.distance / 1000).toFixed(2)} km · ${formatVnd(fare.fare)}`);
    pushMessage(fare.passenger, `Mình đang đợi ở ${fare.pickup.street}, bạn tới đón nhé!`);
  },
  board() {
    const d = game.get().driver;
    if (!d || d.stage !== 'pickup' || !d.fare) return;
    game.set({ driver: { ...d, stage: 'onboard' } });
    game.toast(`${d.fare.passenger}: "Chào bạn! Cho mình tới ${d.fare.dest.street} nhé."`);
  },
  dropoff() {
    const d = game.get().driver;
    const f = d?.fare;
    if (!d || !f || d.stage !== 'onboard') return;
    const minutes = (performance.now() - f.requestedAt) / 60000;
    const quick = minutes < 1.2 + f.distance / 450;
    const stars = quick ? 5 : Math.random() < 0.6 ? 4 : 5;
    const tip = quick && Math.random() < 0.5 ? (2 + Math.floor(Math.random() * 4)) * 5000 : 0;
    addMoney(f.fare, `Đen SM · chở ${f.passenger} (${(f.distance / 1000).toFixed(2)} km)`);
    if (tip) addMoney(tip, `${f.passenger} bo thêm (Đen SM)`);
    game.set({ driver: { ...d, stage: 'free', fare: null, trips: d.trips + 1, earned: d.earned + f.fare + tip, stars: [...d.stars, stars], nextAt: performance.now() + 5000 } });
    game.toast(`${f.passenger} đánh giá ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} · +${formatVnd(f.fare)}${tip ? `, bo thêm ${formatVnd(tip)}` : ''}. Đợi cuốc tiếp theo nhé.`);
    pushMessage('Đen SM Tài xế', `Hoàn thành cuốc chở ${f.passenger}: ${formatVnd(f.fare)}${tip ? ` + bo ${formatVnd(tip)}` : ''} · ${stars}★`);
  },
  /** Drop the current request (from the phone). */
  cancel() {
    const d = game.get().driver;
    if (!d?.fare) return;
    const f = d.fare;
    game.set({ driver: { ...d, stage: 'free', fare: null, nextAt: performance.now() + 6000 } });
    pushMessage(f.passenger, d.stage === 'onboard' ? 'Sao lại huỷ giữa đường vậy bạn? Thôi mình xuống đây.' : 'Ơ, bạn huỷ cuốc của mình à? Thôi mình đặt xe khác.');
    game.toast(`Đã huỷ cuốc của ${f.passenger}.`);
  },
  quit() {
    const d = game.get().driver;
    if (!d) return;
    if (bike.riding) jobActions.dismount();
    bike.riding = false; bike.kind = 'wave';
    game.set({ driver: null });
    const avg = d.stars.length ? (d.stars.reduce((a, b) => a + b, 0) / d.stars.length).toFixed(1) : '–';
    game.toast(d.trips ? `Kết thúc ca Đen SM: ${d.trips} cuốc, ${formatVnd(d.earned)}, đánh giá trung bình ${avg}★.` : 'Đã nghỉ chạy Đen SM.');
    pushMessage('Đen SM Tài xế', d.trips ? `Ca hôm nay: ${d.trips} cuốc · ${formatVnd(d.earned)} · ${avg}★. Cảm ơn bạn!` : 'Hẹn gặp lại bạn ở ca sau.');
  },
};

// Dev hook for test scripts.
if (import.meta.env.DEV) (window as unknown as { __driver?: unknown }).__driver = driverActions;
