import { canWalk, type Point } from './geo';
import { deliverySpots, RESTAURANT, restaurantToWorld } from './osm';
import { bike, formatVnd, game, player, type Delivery } from './state';

/*
 * The shipper job at Bún chả Đức Anh: the owner hires you, you collect each bag from Đạt at the grill,
 * ride the shop scooter to the customer's door, hand it over and get paid (with a tip when on time).
 */
export const CUSTOMERS = ['Chị Lan', 'Anh Minh', 'Cô Hoa', 'Bác Tùng', 'Em Ngọc', 'Anh Hùng', 'Chị Mai', 'Chú Bình', 'Bạn Phương', 'Anh Tuấn', 'Cô Thảo', 'Anh Dũng'];

/** Parking spot for the scooter on the pavement in front of the shop, parallel to the street. */
export function bikeSpot() {
  const [x, z] = restaurantToWorld(3.0, RESTAURANT.depth / 2 + 2.4);
  return { x, z, heading: RESTAURANT.angle + Math.PI / 2 };
}

function parkBikeAtShop() {
  const s = bikeSpot();
  bike.position.set(s.x, 0.32, s.z);
  bike.heading = s.heading; bike.speed = 0; bike.steer = 0; bike.lean = 0; bike.riding = false;
}

function pickDestination(): Omit<Delivery, 'startedAt'> {
  const [sx, sz] = restaurantToWorld(0, RESTAURANT.depth / 2);
  const candidates = deliverySpots.filter((d) => { const dist = Math.hypot(d.p[0] - sx, d.p[1] - sz); return dist > 160 && dist < 650; });
  const spot = candidates[Math.floor(Math.random() * candidates.length)] ?? deliverySpots[0];
  const distance = Math.hypot(spot.p[0] - sx, spot.p[1] - sz);
  const portions = 1 + Math.floor(Math.random() * 3);
  const pay = Math.min(65_000, Math.round((16_000 + distance * 50 + portions * 3_000) / 1000) * 1000);
  return { customer: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)], street: spot.street, dest: { x: spot.p[0], z: spot.p[1] }, facing: spot.facing, portions, pay, distance, timeLimit: Math.round(45 + distance / 5.5) };
}

export const jobActions = {
  accept() {
    parkBikeAtShop();
    game.set({ job: { stage: 'pickup', delivery: null, done: 0, earned: 0 }, dialog: null });
    game.toast('Ông chủ Đức Anh: "Tốt lắm! Xe Wave với thùng giữ nhiệt để ngoài cửa. Ra chỗ anh Đạt lấy túi bún chả nhé!"');
  },
  quit() {
    const job = game.get().job;
    bike.riding = false;
    game.set({ job: null, dialog: null });
    game.toast(job && job.done ? `Hôm nay giao ${job.done} đơn, kiếm được ${formatVnd(job.earned)}. Cảm ơn cháu!` : 'Lúc nào rảnh cứ quay lại làm nhé!');
  },
  pickup() {
    const job = game.get().job;
    if (!job || job.stage !== 'pickup') return;
    const d = pickDestination();
    game.set({ job: { ...job, stage: 'deliver', delivery: { ...d, startedAt: performance.now() } } });
    game.toast(`Anh Đạt: "${d.portions} suất bún chả cho ${d.customer}, ${d.street}. Đi cẩn thận nhé!"`);
  },
  deliver() {
    const job = game.get().job;
    const d = job?.delivery;
    if (!job || !d) return;
    const seconds = (performance.now() - d.startedAt) / 1000;
    const onTime = seconds <= d.timeLimit;
    const tip = onTime ? (5 + Math.floor(Math.random() * 3) * 5) * 1000 : 0;
    const total = d.pay + tip;
    game.set({ money: game.get().money + total, job: { ...job, stage: 'pickup', delivery: null, done: job.done + 1, earned: job.earned + total } });
    game.toast(onTime
      ? `${d.customer}: "Nhanh thế, cảm ơn em!" · +${formatVnd(d.pay)} tiền ship, bo thêm ${formatVnd(tip)}. Về quán lấy đơn tiếp nhé.`
      : `${d.customer}: "Hơi lâu nhưng vẫn còn nóng." · +${formatVnd(d.pay)}. Về quán lấy đơn tiếp nhé.`);
  },
  mount() {
    if (player.seat) return;
    bike.riding = true;
    bike.speed = 0;
    game.set({}); // refresh prompts / HUD
  },
  dismount() {
    const h = bike.heading;
    // step off to the left of the bike (or right if blocked)
    for (const side of [1, -1]) {
      const p: Point = [bike.position.x + Math.cos(h) * 0.85 * side, bike.position.z - Math.sin(h) * 0.85 * side];
      if (canWalk(p)) { bike.riding = false; bike.speed = 0; bike.steer = 0; bike.lean = 0; player.teleport?.(p[0], p[1]); game.set({}); return; }
    }
    game.toast('Không có chỗ để xuống xe ở đây.');
  },
};

/** Where Đạt hands over the bags: in front of the charcoal grill. */
export function pickupPoint() {
  const [x, z] = restaurantToWorld(-3.2, RESTAURANT.depth / 2 + 2.3);
  return { x, z };
}
