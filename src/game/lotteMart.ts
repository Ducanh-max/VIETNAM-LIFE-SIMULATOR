import { useSyncExternalStore } from 'react';
import { addToBag } from './bag';
import { registerExtraShop, type ShopItem } from './shops';
import { addMoney, formatVnd, game } from './state';

/*
 * LOTTE Mart on B1 of Lotte Center (spec section 8): a game supermarket, not the real store's plan or price list.
 * Products carry productId, name, price, stock, category, icon and meshVariant (spec), plus hunger / thirst for
 * the ones you can eat from the backpack; housewares and raw vegetables are kept (keep: true). Prices are typical
 * Hà Nội supermarket prices in 2026, set here and easy to change.
 */
export type Category = 'rau' | 'traicay' | 'tuoi' | 'donglanh' | 'banhkeo' | 'douong' | 'giadung' | 'banhmi';
export const CATEGORY_NAME: Record<Category, string> = {
  rau: 'Rau củ', traicay: 'Trái cây', tuoi: 'Thực phẩm tươi', donglanh: 'Đông lạnh', banhkeo: 'Bánh kẹo', douong: 'Đồ uống', giadung: 'Gia dụng', banhmi: 'Bánh mì',
};
export type MeshVariant = 'tomato' | 'carrot' | 'cabbage' | 'apple' | 'orange' | 'watermelon' | 'banana' | 'tray' | 'box' | 'bag' | 'bottle' | 'can' | 'pot' | 'pan' | 'bowl' | 'loaf';
export type Product = { productId: string; name: string; price: number; stock: number; category: Category; icon: string; meshVariant: MeshVariant; color: string; hunger: number; thirst: number; keep?: boolean };
export const PRODUCTS: Product[] = [
  { productId: 'ca-chua', name: 'Cà chua (500 g)', price: 18_000, stock: 40, category: 'rau', icon: '🍅', meshVariant: 'tomato', color: '#d23a2a', hunger: 0, thirst: 0, keep: true },
  { productId: 'ca-rot', name: 'Cà rốt Đà Lạt (500 g)', price: 15_000, stock: 40, category: 'rau', icon: '🥕', meshVariant: 'carrot', color: '#ef7d22', hunger: 0, thirst: 0, keep: true },
  { productId: 'bap-cai', name: 'Bắp cải (1 cái)', price: 16_000, stock: 30, category: 'rau', icon: '🥬', meshVariant: 'cabbage', color: '#8fc45a', hunger: 0, thirst: 0, keep: true },
  { productId: 'tao', name: 'Táo (1 quả)', price: 12_000, stock: 60, category: 'traicay', icon: '🍎', meshVariant: 'apple', color: '#c8202a', hunger: 8, thirst: 6 },
  { productId: 'cam', name: 'Cam sành (1 quả)', price: 10_000, stock: 60, category: 'traicay', icon: '🍊', meshVariant: 'orange', color: '#f29a1d', hunger: 6, thirst: 10 },
  { productId: 'dua-hau', name: 'Dưa hấu (miếng)', price: 25_000, stock: 20, category: 'traicay', icon: '🍉', meshVariant: 'watermelon', color: '#3e8a3a', hunger: 8, thirst: 22 },
  { productId: 'chuoi', name: 'Chuối tiêu (nải)', price: 22_000, stock: 30, category: 'traicay', icon: '🍌', meshVariant: 'banana', color: '#f2d33a', hunger: 18, thirst: 2 },
  { productId: 'thit-bo', name: 'Thịt bò (300 g)', price: 89_000, stock: 15, category: 'tuoi', icon: '🥩', meshVariant: 'tray', color: '#b8343a', hunger: 0, thirst: 0, keep: true },
  { productId: 'ca-hoi', name: 'Cá hồi phi lê (200 g)', price: 120_000, stock: 10, category: 'tuoi', icon: '🐟', meshVariant: 'tray', color: '#f08a5d', hunger: 0, thirst: 0, keep: true },
  { productId: 'kem', name: 'Kem ốc quế', price: 15_000, stock: 50, category: 'donglanh', icon: '🍦', meshVariant: 'box', color: '#f6e3c1', hunger: 6, thirst: 8 },
  { productId: 'ha-cao', name: 'Há cảo đông lạnh', price: 55_000, stock: 20, category: 'donglanh', icon: '🥟', meshVariant: 'bag', color: '#e6eef3', hunger: 0, thirst: 0, keep: true },
  { productId: 'banh-quy', name: 'Bánh quy bơ (hộp)', price: 45_000, stock: 30, category: 'banhkeo', icon: '🍪', meshVariant: 'box', color: '#2f5fc0', hunger: 14, thirst: 0 },
  { productId: 'keo', name: 'Kẹo dẻo trái cây', price: 18_000, stock: 40, category: 'banhkeo', icon: '🍬', meshVariant: 'bag', color: '#e84a8a', hunger: 6, thirst: 0 },
  { productId: 'snack', name: 'Snack khoai tây', price: 12_000, stock: 50, category: 'banhkeo', icon: '🥔', meshVariant: 'bag', color: '#f2c230', hunger: 10, thirst: 0 },
  { productId: 'nuoc', name: 'Nước khoáng 500 ml', price: 6_000, stock: 80, category: 'douong', icon: '💧', meshVariant: 'bottle', color: '#9fd0ea', hunger: 0, thirst: 30 },
  { productId: 'nuoc-cam', name: 'Nước cam ép 1 l', price: 38_000, stock: 30, category: 'douong', icon: '🧃', meshVariant: 'bottle', color: '#f29a1d', hunger: 4, thirst: 40 },
  { productId: 'tra-xanh', name: 'Trà xanh chai', price: 10_000, stock: 60, category: 'douong', icon: '🍵', meshVariant: 'bottle', color: '#5fae4a', hunger: 0, thirst: 32 },
  { productId: 'nuoc-ngot', name: 'Nước ngọt lon', price: 10_000, stock: 60, category: 'douong', icon: '🥤', meshVariant: 'can', color: '#c8202a', hunger: 2, thirst: 28 },
  { productId: 'noi', name: 'Nồi inox 20 cm', price: 249_000, stock: 8, category: 'giadung', icon: '🍲', meshVariant: 'pot', color: '#c9cfd3', hunger: 0, thirst: 0, keep: true },
  { productId: 'chao', name: 'Chảo chống dính 26 cm', price: 199_000, stock: 8, category: 'giadung', icon: '🍳', meshVariant: 'pan', color: '#2b2f36', hunger: 0, thirst: 0, keep: true },
  { productId: 'bat', name: 'Bộ 4 bát sứ', price: 89_000, stock: 12, category: 'giadung', icon: '🥣', meshVariant: 'bowl', color: '#f4f2ee', hunger: 0, thirst: 0, keep: true },
  { productId: 'banh-mi-sua', name: 'Bánh mì sữa', price: 15_000, stock: 30, category: 'banhmi', icon: '🍞', meshVariant: 'loaf', color: '#d9a35e', hunger: 20, thirst: 0 },
  { productId: 'croissant', name: 'Bánh sừng bò', price: 22_000, stock: 24, category: 'banhmi', icon: '🥐', meshVariant: 'loaf', color: '#c88a3e', hunger: 18, thirst: 0 },
];
export const productById = (id: string) => PRODUCTS.find((p) => p.productId === id);

// the backpack knows items by shop: register the mart as a shop (not drawn on any street)
registerExtraShop({
  id: 'lottemart', kind: 'mart', name: 'LOTTE Mart', sign: 'LOTTE Mart', tagline: 'Siêu thị tầng B1 Lotte Center', color: '#d51d32', seller: 'Thu ngân', role: 'Thu ngân', street: 'Phố Liễu Giai',
  x: 0, w: 0, walkIn: false,
  items: PRODUCTS.map((p): ShopItem => ({ id: p.productId, name: p.name, note: CATEGORY_NAME[p.category], price: p.price, hunger: p.hunger, thirst: p.thirst, keep: p.keep })),
});

// ---- the cart (trolley or basket) and checkout ----
type MartState = { carrier: 'trolley' | 'basket' | null; cart: Record<string, number>; shelf: Category | null; checkout: boolean; message: string; receipt: { lines: string[]; total: number; at: number } | null };
let st: MartState = { carrier: null, cart: {}, shelf: null, checkout: false, message: '', receipt: null };
const subs = new Set<() => void>();
export const mart = {
  get: () => st,
  set(patch: Partial<MartState>) { st = { ...st, ...patch }; subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useMart<T>(sel: (s: MartState) => T): T { return useSyncExternalStore(mart.subscribe, () => sel(st)); }
/** Stock left on the shelf (stock minus what is in the cart). */
export const shelfLeft = (p: Product) => p.stock - (st.cart[p.productId] ?? 0);
export const cartCount = () => Object.values(st.cart).reduce((a, b) => a + b, 0);
export const cartTotal = () => Object.entries(st.cart).reduce((s, [id, n]) => s + (productById(id)?.price ?? 0) * n, 0);
export function addToCart(id: string, n = 1) {
  const p = productById(id); if (!p) return;
  if (!st.carrier) { mart.set({ message: 'Lấy xe đẩy hoặc giỏ ở lối vào trước đã.' }); return; }
  const cap = st.carrier === 'basket' ? 12 : 60;
  if (n > 0 && cartCount() >= cap) { mart.set({ message: st.carrier === 'basket' ? 'Giỏ đầy rồi (12 món). Lấy xe đẩy nếu mua nhiều.' : 'Xe đẩy đầy rồi.' }); return; }
  const have = st.cart[id] ?? 0; const next = Math.max(0, Math.min(p.stock, have + n));
  if (n > 0 && next === have) { mart.set({ message: `${p.name}: hết hàng trên kệ.` }); return; }
  const cart = { ...st.cart }; if (next) cart[id] = next; else delete cart[id];
  mart.set({ cart, message: '' });
}
/** Pay at the till: checks the wallet first (nothing changes when it is short), then stock, receipt and the backpack. */
export function payCart(): boolean {
  const total = cartTotal(); if (!total) { mart.set({ message: 'Giỏ đang trống.' }); return false; }
  const money = game.get().money;
  if (money < total) { mart.set({ message: `Không đủ tiền: cần ${formatVnd(total)}, ví còn ${formatVnd(money)}. Bỏ bớt món rồi thanh toán lại.` }); return false; }
  const lines = Object.entries(st.cart).map(([id, n]) => { const p = productById(id)!; p.stock -= n; return `${p.icon} ${p.name} × ${n} = ${formatVnd(p.price * n)}`; });
  addMoney(-total, `LOTTE Mart · ${cartCount()} món`);
  addToBag('lottemart', st.cart);
  mart.set({ cart: {}, checkout: false, receipt: { lines, total, at: Date.now() }, message: '' });
  game.toast(`Đã thanh toán ${formatVnd(total)} ở LOTTE Mart. Hàng đã cho vào balo (B).`);
  return true;
}
