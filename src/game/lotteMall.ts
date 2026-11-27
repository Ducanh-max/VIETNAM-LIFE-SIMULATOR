import { useSyncExternalStore } from 'react';
import { addToBag } from './bag';
import type { Outfit } from './character/outfit';
import { registerExtraShop, type ShopItem } from './shops';
import { addMoney, formatVnd, game, setOutfit } from './state';

/*
 * The department store on floors 1–6 of Lotte Center (spec section 9). The floor plan by trade follows the spec's
 * suggestion, not a confirmed directory, and every brand here is made up. Clothes, shoes, hats, glasses and bags
 * change the chibi's outfit (try on first, then buy); other goods go in the backpack; café and restaurant food can be
 * eaten from the backpack. Prices are game prices, set here.
 */
export type MallItem = { id: string; name: string; price: number; outfit?: Partial<Outfit>; hunger?: number; thirst?: number; keep?: boolean };
export type MallShop = { id: string; floor: number; name: string; trade: string; color: string; items: MallItem[] };
const C = (name: string, price: number, outfit: Partial<Outfit>, id = name): MallItem => ({ id, name, price, outfit });
const G = (name: string, price: number, id = name): MallItem => ({ id, name, price, keep: true });
const E = (name: string, price: number, hunger: number, thirst: number, id = name): MallItem => ({ id, name, price, hunger, thirst });
const tee = (c: string) => ({ top: 'tee' as const, tee: c });
const jacket = (c: string, light: string, dark: string) => ({ top: 'jacket' as const, jacket: c, jacketLight: light, jacketDark: dark, jacketTrim: dark });
const pants = (c: string, light: string, dark: string, extra: Partial<Outfit> = {}) => ({ pants: c, pantsLight: light, pantsDark: dark, pantsCuff: light, shorts: false, skirt: false, ...extra });

export const MALL_SHOPS: MallShop[] = [
  // 1: cosmetics, perfume, jewellery, luxury fashion, café
  { id: 'mall-sen', floor: 1, name: 'Sen Hồng', trade: 'Mỹ phẩm', color: '#e86a92', items: [G('Son môi đỏ', 320_000), G('Kem chống nắng', 280_000), G('Mặt nạ dưỡng da (5 miếng)', 150_000)] },
  { id: 'mall-huong', floor: 1, name: 'Hương Phố', trade: 'Nước hoa', color: '#8a5cc2', items: [G('Nước hoa hoa nhài 50 ml', 1_250_000), G('Nước hoa gỗ trầm 50 ml', 1_480_000)] },
  { id: 'mall-ngoc', floor: 1, name: 'Ngọc Trai Hạ Long', trade: 'Trang sức', color: '#c9a646', items: [G('Vòng ngọc trai', 2_400_000), G('Nhẫn bạc', 690_000)] },
  { id: 'mall-may', floor: 1, name: 'Mây Trắng', trade: 'Thời trang cao cấp', color: '#2b2f36', items: [C('Áo khoác dạ đen', 3_200_000, jacket('#22242a', '#3a3d45', '#15161a'), 'ao-da'), C('Sơ mi lụa trắng', 1_850_000, { top: 'shirt', tee: '#f4f2ee' }, 'so-mi-lua')] },
  { id: 'mall-cafe', floor: 1, name: 'Cà Phê Tầng Một', trade: 'Cà phê', color: '#5a3a24', items: [E('Cà phê sữa đá', 45_000, 4, 30, 'cfsua'), E('Trà đào cam sả', 55_000, 2, 34, 'tradao'), E('Bánh sừng bò', 39_000, 16, 0, 'banh')] },
  // 2: fashion, accessories, restaurant
  { id: 'mall-lua', floor: 2, name: 'Lụa Hà Thành', trade: 'Thời trang nữ', color: '#c8342b', items: [C('Váy hoa nhí', 590_000, pants('#c85a7a', '#e07a96', '#9a3c58', { skirt: true }), 'vay'), C('Áo phông hồng', 220_000, tee('#f2a8bd'), 'tee-hong')] },
  { id: 'mall-gio', floor: 2, name: 'Gió Mùa', trade: 'Phụ kiện', color: '#2f7d6b', items: [C('Kính râm', 350_000, { glasses: true }, 'kinh'), C('Mũ lưỡi trai đỏ', 180_000, { hat: 'cap', hatColor: '#c8342b' }, 'mu-do'), C('Túi đeo chéo', 420_000, { sling: true, backpack: false }, 'tui')] },
  { id: 'mall-bep', floor: 2, name: 'Bếp Việt', trade: 'Nhà hàng', color: '#a3251c', items: [E('Bún chả Hà Nội', 85_000, 45, 10, 'buncha'), E('Nem rán (4 cái)', 60_000, 25, 0, 'nem'), E('Trà đá', 10_000, 0, 30, 'trada')] },
  // 3: youth fashion, toys, food
  { id: 'mall-pho', floor: 3, name: 'Phố Xinh', trade: 'Thời trang trẻ', color: '#f29a1d', items: [C('Áo phông vàng', 190_000, tee('#f2c230'), 'tee-vang'), C('Quần short jean', 290_000, pants('#3f6aa8', '#5a85c2', '#2c4e80', { shorts: true }), 'short'), C('Áo hoodie xanh', 450_000, jacket('#3f6aa8', '#5a85c2', '#2c4e80'), 'hoodie')] },
  { id: 'mall-ti', floor: 3, name: 'Tí Hon', trade: 'Đồ chơi', color: '#2f5fc0', items: [G('Gấu bông', 250_000), G('Xếp hình 500 mảnh', 320_000), G('Ô tô điều khiển', 590_000)] },
  { id: 'mall-an', floor: 3, name: 'Ăn Vặt Phố Cổ', trade: 'Ẩm thực', color: '#e0662f', items: [E('Bánh tráng trộn', 35_000, 18, 2, 'banhtrang'), E('Trà sữa trân châu', 45_000, 10, 28, 'trasua'), E('Xúc xích nướng', 25_000, 14, 0, 'xucxich')] },
  // 4: menswear, watches, sports, luggage
  { id: 'mall-quan', floor: 4, name: 'Quân Tử', trade: 'Thời trang nam', color: '#35363c', items: [C('Sơ mi xanh nhạt', 520_000, { top: 'shirt', tee: '#bcd6ea' }, 'so-mi-xanh'), C('Quần âu đen', 650_000, pants('#22242a', '#3a3d45', '#15161a'), 'quan-au'), C('Áo polo trắng', 380_000, { top: 'polo', tee: '#f4f2ee' }, 'polo')] },
  { id: 'mall-gio2', floor: 4, name: 'Thời Gian', trade: 'Đồng hồ', color: '#7a6a3a', items: [G('Đồng hồ dây da', 1_900_000), G('Đồng hồ thể thao', 1_150_000)] },
  { id: 'mall-song', floor: 4, name: 'Sông Hồng Sport', trade: 'Thể thao', color: '#1f9e6e', items: [C('Giày chạy bộ xanh', 1_290_000, { shoe: '#2f7dd8', shoeSole: '#f4f2ee', shoeStripe: '#f4f2ee' }, 'giay-chay'), C('Giày trắng đế bằng', 890_000, { shoe: '#f4f2ee', shoeSole: '#dcd8cf', shoeStripe: '#c8342b' }, 'giay-trang'), C('Balo thể thao', 690_000, { backpack: true, sling: false }, 'balo')] },
  { id: 'mall-vali', floor: 4, name: 'Phương Nam', trade: 'Vali', color: '#5d6268', items: [G('Vali kéo 24 inch', 1_890_000), G('Túi du lịch', 750_000)] },
  // 5: restaurants, customer service, family services
  { id: 'mall-lau', floor: 5, name: 'Lẩu Nấm Đà Lạt', trade: 'Nhà hàng', color: '#7a4b2a', items: [E('Lẩu nấm (1 người)', 150_000, 55, 20, 'lau'), E('Nước sấu đá', 25_000, 0, 32, 'sau')] },
  { id: 'mall-banh', floor: 5, name: 'Bánh Ngọt Ngọc', trade: 'Tiệm bánh', color: '#d98aa6', items: [E('Bánh kem dâu (miếng)', 45_000, 20, 0, 'kem'), E('Bánh su kem (3 cái)', 35_000, 15, 0, 'su')] },
  { id: 'mall-cskh', floor: 5, name: 'Chăm Sóc Khách Hàng', trade: 'Dịch vụ', color: '#1d4f8f', items: [G('Thẻ quà tặng 200.000đ', 200_000), G('Gói quà', 20_000)] },
  // 6: events
  { id: 'mall-sukien', floor: 6, name: 'Hội chợ Tầng 6', trade: 'Sự kiện', color: '#d51d32', items: [G('Vé xem triển lãm', 80_000), G('Móc khoá Lotte Center', 45_000), E('Kem tươi', 20_000, 6, 10, 'kemtuoi')] },
];
// edible and kept goods go through the backpack, which knows items by shop
for (const sh of MALL_SHOPS) registerExtraShop({
  id: sh.id, kind: 'mart', name: sh.name, sign: sh.name, tagline: sh.trade, color: sh.color, seller: 'Nhân viên', role: sh.trade, street: 'Lotte Center',
  x: 0, w: 0, walkIn: false,
  items: sh.items.map((i): ShopItem => ({ id: i.id, name: i.name, note: sh.trade, price: i.price, hunger: i.hunger ?? 0, thirst: i.thirst ?? 0, keep: i.keep || !!i.outfit })),
});

// ---- the shop panel state; trying on keeps the old outfit to put back ----
type MallState = { shop: string | null; trying: string | null; before: Outfit | null; message: string };
let st: MallState = { shop: null, trying: null, before: null, message: '' };
const subs = new Set<() => void>();
export const mall = { get: () => st, set(p: Partial<MallState>) { st = { ...st, ...p }; subs.forEach((f) => f()); }, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; } };
export function useMall<T>(sel: (s: MallState) => T): T { return useSyncExternalStore(mall.subscribe, () => sel(st)); }
const OWNED = 'doi-viet-wardrobe-v1';
export const owned = (): string[] => { try { return JSON.parse(localStorage.getItem(OWNED) ?? '[]'); } catch { return []; } };
export function tryOn(shopId: string, item: MallItem) {
  if (!item.outfit) return;
  if (!st.before) mall.set({ before: { ...game.get().outfit } });
  setOutfit(item.outfit); mall.set({ trying: `${shopId}:${item.id}`, message: `Đang mặc thử: ${item.name}. Mua thì giữ luôn, đóng bảng thì trả lại đồ cũ.` });
}
/** Close the shop: anything only tried on comes off again. */
export function closeShop() { if (st.before) setOutfit(st.before); mall.set({ shop: null, trying: null, before: null, message: '' }); }
export function buy(shopId: string, item: MallItem) {
  const money = game.get().money;
  if (money < item.price) { mall.set({ message: `Không đủ tiền: cần ${formatVnd(item.price)}, ví còn ${formatVnd(money)}.` }); return false; }
  const shop = MALL_SHOPS.find((s) => s.id === shopId)!;
  addMoney(-item.price, `${shop.name} (Lotte Center) · ${item.name}`);
  if (item.outfit) {
    setOutfit(item.outfit);
    localStorage.setItem(OWNED, JSON.stringify([...new Set([...owned(), `${shopId}:${item.id}`])]));
    mall.set({ before: null, trying: null, message: `Đã mua và mặc ${item.name}.` });
  } else {
    addToBag(shopId, { [item.id]: 1 });
    mall.set({ message: `Đã mua ${item.name}, để trong balo (B).` });
  }
  game.toast(`${shop.name}: đã mua ${item.name} · ${formatVnd(item.price)}`);
  return true;
}
