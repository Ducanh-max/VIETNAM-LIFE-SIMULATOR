import { useSyncExternalStore } from 'react';
import { type Point } from './geo';
import { findRoute, routeLength } from './navigation';
import { deliverySpots, insideBuilding, restaurantToWorld, RESTAURANT, roadClearance, roads } from './osm';
import { addMoney, formatVnd, game, MENU, player, pushMessage } from './state';
import { addToBag, bagStore, takeOut } from './bag';

/*
 * The shops next to Bún chả Đức Anh on Phố Đinh Tiên Hoàng (cà phê, bánh mì, phở bò, nhà sách) and the Food app:
 * walk in and buy at the counter, or order on the phone and a shipper brings it on a xe máy. Prices are typical of
 * Hà Nội's old quarter in 2026.
 */
export type ShopKind = 'coffee' | 'banhmi' | 'pho' | 'books' | 'buncha';
export type ShopId = string;
export type ShopItem = { id: string; name: string; note: string; price: number; hunger: number; thirst: number; book?: boolean };
export type Shop = {
  id: ShopId; kind: ShopKind; name: string; sign: string; tagline: string; color: string; seller: string; role: string; street: string;
  /** restaurant-local x of the shopfront (see Restaurant.tsx), 0 for the bún chả shop itself; unused for street stalls */
  x: number; w: number; items: ShopItem[]; walkIn: boolean;
  /** a street stall on the pavement: where it stands (world) and the way it faces (toward the road) */
  at?: { p: Point; facing: number };
};

const HW = RESTAURANT.width / 2;
export const SHOPS: Shop[] = [
  { id: 'coffee', kind: 'coffee', street: 'Phố Đinh Tiên Hoàng', name: 'Cà phê Phố Cổ', sign: 'CÀ PHÊ', tagline: 'Cà phê phin · trà đá vỉa hè', color: '#5a3a24', seller: 'Cô Lan', role: 'Pha cà phê', x: -(HW + 6.4), w: 4.2, walkIn: true, items: [
    { id: 'den', name: 'Cà phê đen đá', note: 'Phin nhôm, đậm đặc', price: 20_000, hunger: 0, thirst: 30 },
    { id: 'nau', name: 'Cà phê nâu đá', note: 'Phin với sữa đặc', price: 25_000, hunger: 4, thirst: 32 },
    { id: 'trung', name: 'Cà phê trứng', note: 'Kem trứng đánh bông, kiểu Hà Nội', price: 35_000, hunger: 10, thirst: 22 },
    { id: 'tra', name: 'Trà đá', note: 'Cốc to, uống ngay vỉa hè', price: 5_000, hunger: 0, thirst: 28 },
  ] },
  { id: 'banhmi', kind: 'banhmi', street: 'Phố Đinh Tiên Hoàng', name: 'Bánh mì Phố Cổ', sign: 'BÁNH MÌ', tagline: 'Bánh mì giòn nóng · pate nhà làm', color: '#c8641e', seller: 'Chị Hoa', role: 'Bán bánh mì', x: -(HW + 2.1), w: 4.2, walkIn: true, items: [
    { id: 'pate', name: 'Bánh mì pate', note: 'Pate gan, chả lụa, dưa góp, rau mùi', price: 25_000, hunger: 32, thirst: 0 },
    { id: 'trung', name: 'Bánh mì trứng', note: 'Hai trứng ốp la, xì dầu, ớt', price: 20_000, hunger: 28, thirst: 0 },
    { id: 'dacbiet', name: 'Bánh mì đặc biệt', note: 'Thịt nguội, xá xíu, pate, chả, trứng', price: 35_000, hunger: 45, thirst: 0 },
    { id: 'suadau', name: 'Sữa đậu nành', note: 'Chai 300ml, ướp lạnh', price: 10_000, hunger: 6, thirst: 25 },
  ] },
  { id: 'pho', kind: 'pho', street: 'Phố Đinh Tiên Hoàng', name: 'Phở bò Gia truyền', sign: 'PHỞ BÒ', tagline: 'Nước dùng ninh xương 12 tiếng', color: '#a3251c', seller: 'Bác Hùng', role: 'Nấu phở', x: HW + 2.1, w: 4.2, walkIn: true, items: [
    { id: 'chin', name: 'Phở bò', note: 'Thịt bò chín thái mỏng, hành lá, nước dùng trong', price: 40_000, hunger: 62, thirst: 12 },
    { id: 'ga', name: 'Phở gà', note: 'Thịt gà ta xé, lá chanh thái chỉ', price: 40_000, hunger: 60, thirst: 12 },
    { id: 'tai', name: 'Phở tái', note: 'Thịt bò tái chần nước dùng sôi', price: 45_000, hunger: 64, thirst: 12 },
    { id: 'dacbiet', name: 'Phở đặc biệt', note: 'Tái, chín, nạm, gầu, trứng chần', price: 55_000, hunger: 80, thirst: 14 },
    { id: 'quay', name: 'Quẩy', note: 'Hai chiếc, chấm nước phở', price: 5_000, hunger: 8, thirst: 0 },
    { id: 'tra', name: 'Trà đá', note: 'Cốc to', price: 5_000, hunger: 0, thirst: 28 },
  ] },
  { id: 'books', kind: 'books', street: 'Phố Đinh Tiên Hoàng', name: 'Nhà sách Tràng Tiền', sign: 'NHÀ SÁCH', tagline: 'Sách văn học · bản đồ · bưu thiếp', color: '#6b2f6b', seller: 'Anh Minh', role: 'Bán sách', x: HW + 6.4, w: 4.2, walkIn: true, items: [
    { id: 'demen', name: 'Dế Mèn phiêu lưu ký', note: 'Tô Hoài', price: 60_000, hunger: 0, thirst: 0, book: true },
    { id: 'sodo', name: 'Số đỏ', note: 'Vũ Trọng Phụng', price: 85_000, hunger: 0, thirst: 0, book: true },
    { id: 'kieu', name: 'Truyện Kiều', note: 'Nguyễn Du', price: 70_000, hunger: 0, thirst: 0, book: true },
    { id: 'hanoi36', name: 'Hà Nội băm sáu phố phường', note: 'Thạch Lam', price: 75_000, hunger: 0, thirst: 0, book: true },
    { id: 'map', name: 'Bản đồ du lịch Hà Nội', note: 'Gấp, song ngữ', price: 30_000, hunger: 0, thirst: 0, book: true },
  ] },
  { id: 'buncha', kind: 'buncha', street: 'Phố Đinh Tiên Hoàng', name: 'Bún chả Đức Anh', sign: 'BÚN CHẢ', tagline: 'Chả nướng than hoa · đặc sản Hà Nội', color: '#b3261e', seller: 'Đức Anh', role: 'Ông chủ quán', x: 0, w: RESTAURANT.width, walkIn: false,
    items: MENU.map((m) => ({ id: m.id, name: m.name, note: m.note, price: m.price, hunger: m.hunger, thirst: m.thirst })) },
];

/*
 * Street stalls elsewhere in the city, the way Hà Nội eats: a phở gánh or a bánh mì cart with plastic stools on
 * the pavement, a cà phê or trà đá corner. Each stands on the pavement of its street (the doorstep spot nearest the
 * middle of the street's longest stretch). Names are generic, not real brands.
 */
const menuOf = (kind: ShopKind) => SHOPS.find((x) => x.id === kind)!.items;
const STALLS: Omit<Shop, 'items' | 'x' | 'w' | 'walkIn'>[] = [
  { id: 'pho-lqs', kind: 'pho', name: 'Phở gánh Lý Quốc Sư', sign: 'PHỞ', tagline: 'Phở gánh vỉa hè · gần Nhà thờ Lớn', color: '#a3251c', seller: 'Bà Tư', role: 'Phở gánh', street: 'Phố Lý Quốc Sư' },
  { id: 'pho-hb', kind: 'pho', name: 'Phở bò Hàng Bạc', sign: 'PHỞ BÒ', tagline: 'Phở bò phố cổ', color: '#a3251c', seller: 'Chú Bảy', role: 'Nấu phở', street: 'Phố Hàng Bạc' },
  { id: 'banhmi-hc', kind: 'banhmi', name: 'Bánh mì Hàng Cá', sign: 'BÁNH MÌ', tagline: 'Xe bánh mì phố cổ', color: '#c8641e', seller: 'Cô Thuý', role: 'Bán bánh mì', street: 'Phố Hàng Cá' },
  { id: 'coffee-nt', kind: 'coffee', name: 'Cà phê vỉa hè Nhà Thờ', sign: 'CÀ PHÊ', tagline: 'Ngồi ghế nhựa ngắm Nhà thờ Lớn', color: '#5a3a24', seller: 'Anh Dũng', role: 'Pha cà phê', street: 'Phố Nhà Thờ' },
  { id: 'coffee-tt', kind: 'coffee', name: 'Trà đá Tràng Tiền', sign: 'TRÀ ĐÁ', tagline: 'Trà đá, cà phê gần Nhà hát Lớn', color: '#2f6b4a', seller: 'Bác Sáu', role: 'Bán trà đá', street: 'Phố Tràng Tiền' },
];
function stallSpot(street: string) {
  const own = roads.filter((r) => r.name === street);
  if (!own.length) return null;
  const longest = own.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  const mid = longest.points[Math.floor(longest.points.length / 2)];
  let best: { p: Point; facing: number } | null = null; let bd = 150;
  for (const d of deliverySpots) { if (d.street !== street) continue; const dd = Math.hypot(d.p[0] - mid[0], d.p[1] - mid[1]); if (dd < bd) { bd = dd; best = { p: d.p, facing: d.facing }; } }
  if (best) return best;
  // no doorstep found on that street: the pavement beside the middle of its longest stretch
  const i = Math.floor(longest.points.length / 2); const a = longest.points[Math.max(0, i - 1)], b = longest.points[Math.min(longest.points.length - 1, i)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const n: Point = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  for (const side of [1, -1]) { const off = longest.width / 2 + 1.6; const p: Point = [mid[0] + n[0] * off * side, mid[1] + n[1] * off * side]; if (roadClearance(p) > 0.4 && !insideBuilding(p, 0.3)) return { p, facing: Math.atan2(-n[0] * side, -n[1] * side) }; }
  return null;
}
for (const st0 of STALLS) { const at = stallSpot(st0.street); if (at) SHOPS.push({ ...st0, x: 0, w: 4, walkIn: false, items: menuOf(st0.kind), at }); }

export const shopById = (id: ShopId) => SHOPS.find((s) => s.id === id)!;
export const shopKind = (id: ShopId) => shopById(id).kind;
/** Pavement in front of a shop (world), where the shipper picks up. */
export const shopFront = (s: Shop): Point => (s.at ? [s.at.p[0] + Math.sin(s.at.facing) * 1.2, s.at.p[1] + Math.cos(s.at.facing) * 1.2] : restaurantToWorld(s.x, RESTAURANT.depth / 2 + 2.2));

// ---- a tiny store for the shop counter panel and the Food order ----------------------------------
export type Basket = Record<string, number>;
export type FoodOrder = {
  shop: ShopId; basket: Basket; food: number; fee: number; distance: number;
  stage: 'cooking' | 'riding' | 'arrived'; readyAt: number; shipper: string; reroutes: number;
};
/** `dine`: the counter panel was opened from a table (order to be brought to the table). */
type ShopState = { counter: ShopId | null; dine: boolean; food: FoodOrder | null };
let st: ShopState = { counter: null, dine: false, food: null };
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
export const cookSeconds = (id: ShopId) => { const k = shopKind(id); return k === 'banhmi' || k === 'coffee' || k === 'books' ? 15 : 30; };
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
