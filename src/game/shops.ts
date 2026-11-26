import { useSyncExternalStore } from 'react';
import { type Point } from './geo';
import { findRoute, routeLength } from './navigation';
import { restaurantToWorld, RESTAURANT } from './osm';
import { addMoney, formatVnd, game, MENU, player, pushMessage } from './state';
import { addToBag, bagStore, takeOut } from './bag';

/*
 * The shops next to Bún chả Đức Anh on Phố Đinh Tiên Hoàng (cà phê, bánh mì, phở bò, nhà sách) and the Food app:
 * walk in and buy at the counter, or order on the phone and a shipper brings it on a xe máy. Prices are typical of
 * Hà Nội's old quarter in 2026.
 */
export type ShopId = 'coffee' | 'banhmi' | 'pho' | 'books' | 'buncha';
export type ShopItem = { id: string; name: string; note: string; price: number; hunger: number; thirst: number; book?: boolean };
export type Shop = {
  id: ShopId; name: string; sign: string; tagline: string; color: string; seller: string; role: string;
  /** restaurant-local x of the shopfront (see Restaurant.tsx), 0 for the bún chả shop itself */
  x: number; w: number; items: ShopItem[]; walkIn: boolean;
};

const HW = RESTAURANT.width / 2;
export const SHOPS: Shop[] = [
  { id: 'coffee', name: 'Cà phê Phố Cổ', sign: 'CÀ PHÊ', tagline: 'Cà phê phin · trà đá vỉa hè', color: '#5a3a24', seller: 'Cô Lan', role: 'Pha cà phê', x: -(HW + 6.4), w: 4.2, walkIn: true, items: [
    { id: 'den', name: 'Cà phê đen đá', note: 'Phin nhôm, đậm đặc', price: 20_000, hunger: 0, thirst: 30 },
    { id: 'nau', name: 'Cà phê nâu đá', note: 'Phin với sữa đặc', price: 25_000, hunger: 4, thirst: 32 },
    { id: 'trung', name: 'Cà phê trứng', note: 'Kem trứng đánh bông, kiểu Hà Nội', price: 35_000, hunger: 10, thirst: 22 },
    { id: 'tra', name: 'Trà đá', note: 'Cốc to, uống ngay vỉa hè', price: 5_000, hunger: 0, thirst: 28 },
  ] },
  { id: 'banhmi', name: 'Bánh mì Phố Cổ', sign: 'BÁNH MÌ', tagline: 'Bánh mì giòn nóng · pate nhà làm', color: '#c8641e', seller: 'Chị Hoa', role: 'Bán bánh mì', x: -(HW + 2.1), w: 4.2, walkIn: true, items: [
    { id: 'pate', name: 'Bánh mì pate', note: 'Pate gan, chả lụa, dưa góp, rau mùi', price: 25_000, hunger: 32, thirst: 0 },
    { id: 'trung', name: 'Bánh mì trứng', note: 'Hai trứng ốp la, xì dầu, ớt', price: 20_000, hunger: 28, thirst: 0 },
    { id: 'dacbiet', name: 'Bánh mì đặc biệt', note: 'Thịt nguội, xá xíu, pate, chả, trứng', price: 35_000, hunger: 45, thirst: 0 },
    { id: 'suadau', name: 'Sữa đậu nành', note: 'Chai 300ml, ướp lạnh', price: 10_000, hunger: 6, thirst: 25 },
  ] },
  { id: 'pho', name: 'Phở bò Gia truyền', sign: 'PHỞ BÒ', tagline: 'Nước dùng ninh xương 12 tiếng', color: '#a3251c', seller: 'Bác Hùng', role: 'Nấu phở', x: HW + 2.1, w: 4.2, walkIn: true, items: [
    { id: 'tai', name: 'Phở bò tái', note: 'Thịt bò tái, hành lá, nước dùng trong', price: 40_000, hunger: 62, thirst: 12 },
    { id: 'chin', name: 'Phở bò chín', note: 'Thịt bò chín thái mỏng', price: 40_000, hunger: 62, thirst: 12 },
    { id: 'dacbiet', name: 'Phở đặc biệt', note: 'Tái, chín, nạm, gầu, trứng chần', price: 55_000, hunger: 80, thirst: 14 },
    { id: 'quay', name: 'Quẩy', note: 'Hai chiếc, chấm nước phở', price: 5_000, hunger: 8, thirst: 0 },
    { id: 'tra', name: 'Trà đá', note: 'Cốc to', price: 5_000, hunger: 0, thirst: 28 },
  ] },
  { id: 'books', name: 'Nhà sách Tràng Tiền', sign: 'NHÀ SÁCH', tagline: 'Sách văn học · bản đồ · bưu thiếp', color: '#6b2f6b', seller: 'Anh Minh', role: 'Bán sách', x: HW + 6.4, w: 4.2, walkIn: true, items: [
    { id: 'demen', name: 'Dế Mèn phiêu lưu ký', note: 'Tô Hoài', price: 60_000, hunger: 0, thirst: 0, book: true },
    { id: 'sodo', name: 'Số đỏ', note: 'Vũ Trọng Phụng', price: 85_000, hunger: 0, thirst: 0, book: true },
    { id: 'kieu', name: 'Truyện Kiều', note: 'Nguyễn Du', price: 70_000, hunger: 0, thirst: 0, book: true },
    { id: 'hanoi36', name: 'Hà Nội băm sáu phố phường', note: 'Thạch Lam', price: 75_000, hunger: 0, thirst: 0, book: true },
    { id: 'map', name: 'Bản đồ du lịch Hà Nội', note: 'Gấp, song ngữ', price: 30_000, hunger: 0, thirst: 0, book: true },
  ] },
  { id: 'buncha', name: 'Bún chả Đức Anh', sign: 'BÚN CHẢ', tagline: 'Chả nướng than hoa · đặc sản Hà Nội', color: '#b3261e', seller: 'Đức Anh', role: 'Ông chủ quán', x: 0, w: RESTAURANT.width, walkIn: false,
    items: MENU.map((m) => ({ id: m.id, name: m.name, note: m.note, price: m.price, hunger: m.hunger, thirst: m.thirst })) },
];
export const shopById = (id: ShopId) => SHOPS.find((s) => s.id === id)!;
/** Pavement in front of a shop (world), where the shipper picks up. */
export const shopFront = (s: Shop): Point => restaurantToWorld(s.x, RESTAURANT.depth / 2 + 2.2);

// ---- a tiny store for the shop counter panel and the Food order ----------------------------------
export type Basket = Record<string, number>;
export type FoodOrder = {
  shop: ShopId; basket: Basket; food: number; fee: number; distance: number;
  stage: 'cooking' | 'riding' | 'arrived'; readyAt: number; shipper: string; reroutes: number;
};
type ShopState = { counter: ShopId | null; food: FoodOrder | null };
let st: ShopState = { counter: null, food: null };
const subs = new Set<() => void>();
export const shopStore = {
  get: () => st,
  set(patch: Partial<ShopState>) { st = { ...st, ...patch }; subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useShops<T>(sel: (s: ShopState) => T): T { return useSyncExternalStore(shopStore.subscribe, () => sel(st)); }

export const basketTotal = (shop: Shop, b: Basket) => shop.items.reduce((s, it) => s + it.price * (b[it.id] ?? 0), 0);
export const basketCount = (b: Basket) => Object.values(b).reduce((s, n) => s + n, 0);
/**
 * Buy at the counter. Everything goes in the balo; with `eatNow` the first dish or drink comes straight out and you
 * eat it there (the rest, and books, stay in the bag).
 */
export function buyAtCounter(id: ShopId, b: Basket, eatNow = true) {
  const shop = shopById(id); const total = basketTotal(shop, b);
  if (!basketCount(b)) return;
  if (total > game.get().money) { game.toast(`Không đủ tiền: cần ${formatVnd(total)}.`); return; }
  addMoney(-total, `${shop.name} (${basketCount(b)} món)`);
  const before = new Set(bagStore.get().items.map((i) => i.uid));
  addToBag(id, b);
  shopStore.set({ counter: null });
  const fresh = bagStore.get().items.filter((i) => !before.has(i.uid));
  const first = fresh.find((i) => !shop.items.find((x) => x.id === i.item)?.book);
  if (eatNow && first) takeOut(first.uid);
  else game.toast(`Đã mua ${basketCount(b)} món · ${formatVnd(total)}. Đã cho vào balo (B để mở).`);
}

// ---- Food app: delivery by a shipper on a xe máy --------------------------------------------------
export const FOOD_SPEED = 10.5; // m/s, about 38 km/h on the main streets
/** Shipping fee: 15.000đ for the first 2 km, then 5.000đ per km (rounded up to each started km). */
export const deliveryFee = (m: number) => 15_000 + Math.max(0, Math.ceil((m - 2000) / 1000)) * 5_000;
export const cookSeconds = (id: ShopId) => (id === 'banhmi' || id === 'coffee' || id === 'books' ? 15 : 30);
/** Route length from the shop to the player (street distance). */
export function quoteDelivery(id: ShopId) {
  const r = findRoute(shopFront(shopById(id)), [player.position.x, player.position.z]);
  if (!r) return null;
  const distance = routeLength(r);
  return { distance, fee: deliveryFee(distance), minutes: Math.max(1, Math.round((cookSeconds(id) + distance / FOOD_SPEED) / 60)) };
}
const SHIPPERS = ['Tuấn', 'Hải', 'Long', 'Trang', 'Phong', 'Ngọc'];
export function placeFoodOrder(id: ShopId, b: Basket) {
  if (st.food) { game.toast('Bạn đang có một đơn đồ ăn đang giao.'); return false; }
  const shop = shopById(id); const food = basketTotal(shop, b);
  const q = quoteDelivery(id);
  if (!q) { game.toast('Không tìm được đường giao tới chỗ bạn.'); return false; }
  const total = food + q.fee;
  if (!basketCount(b)) return false;
  if (total > game.get().money) { game.toast(`Không đủ tiền: cần ${formatVnd(total)}.`); return false; }
  addMoney(-total, `Food · ${shop.name} (${formatVnd(food)} + ship ${formatVnd(q.fee)})`);
  const shipper = SHIPPERS[Math.floor(Math.random() * SHIPPERS.length)];
  shopStore.set({ food: { shop: id, basket: b, food, fee: q.fee, distance: q.distance, stage: 'cooking', readyAt: performance.now() + cookSeconds(id) * 1000, shipper, reroutes: 0 } });
  game.toast(`Đã đặt ${basketCount(b)} món ở ${shop.name}. Khoảng ${q.minutes} phút nữa shipper tới.`);
  return true;
}
/** The shipper hands the bag over: it goes in the balo. */
export function receiveFood() {
  const f = st.food; if (!f) return;
  const shop = shopById(f.shop);
  addToBag(f.shop, f.basket);
  pushMessage(`Shipper ${f.shipper}`, `Đơn ${shop.name} đã giao xong. Chúc bạn ngon miệng!`);
  shopStore.set({ food: null });
  game.toast(`Đã nhận đồ từ ${shop.name}, cất vào balo. Mở balo (B) để ăn.`);
}
export function cancelFood() {
  const f = st.food; if (!f || f.stage !== 'cooking') return;
  addMoney(f.food + f.fee, `Hoàn tiền đơn Food · ${shopById(f.shop).name}`);
  shopStore.set({ food: null });
  game.toast('Đã huỷ đơn, tiền đã hoàn về ví.');
}

if (import.meta.env.DEV) (window as unknown as { __shops?: unknown }).__shops = { shopStore, SHOPS, placeFoodOrder, receiveFood, quoteDelivery, shopFront };
