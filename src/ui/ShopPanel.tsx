import { useEffect, useMemo, useState } from 'react';
import { formatVnd, useGame } from '../game/state';
import { basketCount, basketTotal, buyAtCounter, cancelFood, cookSeconds, FOOD_SPEED, placeFoodOrder, quoteDelivery, SHOPS, shopById, shopStore, useShops, type Basket, type Shop, type ShopId } from '../game/shops';

function ItemList({ shop, basket, setBasket }: { shop: Shop; basket: Basket; setBasket: (b: Basket) => void }) {
  const change = (id: string, d: number) => setBasket({ ...basket, [id]: Math.max(0, Math.min(5, (basket[id] ?? 0) + d)) });
  return <ul className="menu-list">
    {shop.items.map((it) => <li key={it.id}>
      <div className="menu-info">
        <strong>{it.name}</strong>
        <small>{it.note}</small>
        {(it.hunger > 0 || it.thirst > 0) && <small className="menu-effect">{it.hunger > 0 && `+${it.hunger} no`}{it.hunger > 0 && it.thirst > 0 && ' · '}{it.thirst > 0 && `+${it.thirst} nước`}</small>}
      </div>
      <span className="menu-price">{formatVnd(it.price)}</span>
      <div className="qty">
        <button aria-label={`Bớt ${it.name}`} onClick={() => change(it.id, -1)}>−</button>
        <b>{basket[it.id] ?? 0}</b>
        <button aria-label={`Thêm ${it.name}`} onClick={() => change(it.id, 1)}>+</button>
      </div>
    </li>)}
  </ul>;
}

/** Buying at the counter of one of the shops next to Bún chả Đức Anh. */
export function ShopCounterPanel() {
  const id = useShops((s) => s.counter);
  const money = useGame((s) => s.money);
  const [basket, setBasket] = useState<Basket>({});
  useEffect(() => { setBasket({}); }, [id]);
  if (!id) return null;
  const shop = shopById(id);
  const total = basketTotal(shop, basket);
  const close = () => shopStore.set({ counter: null });
  return <div className="modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <section className="modal-card menu-card" role="dialog" aria-modal="true" aria-label={shop.name}>
      <button className="modal-close" aria-label="Đóng" onClick={close}>✕</button>
      <span className="modal-kicker">{shop.tagline.toUpperCase()} · PHỐ ĐINH TIÊN HOÀNG</span>
      <h2>{shop.name}</h2>
      <p>{shop.seller} ({shop.role.toLowerCase()}) chào bạn. {shop.id === 'books' ? 'Sách mua xong cho vào túi.' : 'Mua xong ăn uống luôn tại quán.'}</p>
      <ItemList shop={shop} basket={basket} setBasket={setBasket} />
      <div className="menu-total"><span>Tổng cộng <small>(Ví: {formatVnd(money)})</small></span><strong>{formatVnd(total)}</strong></div>
      <button className="primary-button modal-primary" disabled={!basketCount(basket) || total > money} onClick={() => buyAtCounter(id, basket)}>
        {total > money ? 'Không đủ tiền' : `Mua · ${formatVnd(total)}`}
      </button>
    </section>
  </div>;
}

/** The phone's Food app: pick a shop, pick dishes, a shipper brings them on a xe máy. */
export function FoodApp() {
  const food = useShops((s) => s.food);
  const money = useGame((s) => s.money);
  const [shopId, setShopId] = useState<ShopId | null>(null);
  const [basket, setBasket] = useState<Basket>({});
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const q = useMemo(() => (shopId && !food ? quoteDelivery(shopId) : null), [shopId, food]);
  if (food) {
    const shop = shopById(food.shop);
    const left = Math.max(0, Math.ceil((food.readyAt - performance.now()) / 1000));
    return <div className="food-app">
      <div className="food-status">
        <strong>{shop.name}</strong>
        <span>{basketCount(food.basket)} món · {formatVnd(food.food)} + ship {formatVnd(food.fee)}</span>
        <b>{food.stage === 'cooking' ? `Quán đang chuẩn bị… (${left} giây)` : food.stage === 'riding' ? `Shipper ${food.shipper} đang chở tới bạn` : `Shipper ${food.shipper} đã tới, ra nhận đồ (E)`}</b>
        <small>Quãng đường {(food.distance / 1000).toFixed(1)} km · xe máy khoảng {Math.round(FOOD_SPEED * 3.6)} km/h</small>
      </div>
      {food.stage === 'cooking' && <button className="text-button" onClick={cancelFood}>Huỷ đơn (hoàn tiền)</button>}
    </div>;
  }
  if (!shopId) return <div className="food-app">
    <p className="food-hint">Đặt món từ các quán phố Đinh Tiên Hoàng, shipper chở tới tận chỗ bạn đứng.</p>
    <ul className="food-shops">{SHOPS.filter((s) => s.id !== 'books').map((s) => <li key={s.id}><button onClick={() => { setShopId(s.id); setBasket({}); }}>
      <span className="food-dot" style={{ background: s.color }} /><span><strong>{s.name}</strong><small>{s.tagline} · chuẩn bị ~{Math.round(cookSeconds(s.id) / 60) || 1} phút</small></span><b>›</b>
    </button></li>)}</ul>
  </div>;
  const shop = shopById(shopId);
  const sub = basketTotal(shop, basket);
  const total = sub + (q?.fee ?? 0);
  return <div className="food-app">
    <button className="text-button" onClick={() => setShopId(null)}>‹ Các quán</button>
    <h3>{shop.name}</h3>
    <ItemList shop={shop} basket={basket} setBasket={setBasket} />
    <div className="food-sum">
      <span>Tiền món <b>{formatVnd(sub)}</b></span>
      <span>Phí ship {q ? `(${(q.distance / 1000).toFixed(1)} km)` : ''} <b>{q ? formatVnd(q.fee) : '—'}</b></span>
      <span>Giao trong khoảng <b>{q ? `${q.minutes} phút` : '—'}</b></span>
      <span className="food-total">Tổng <b>{formatVnd(total)}</b></span>
    </div>
    <button className="primary-button" disabled={!q || !basketCount(basket) || total > money} onClick={() => { if (placeFoodOrder(shopId, basket)) setShopId(null); }}>
      {!q ? 'Không tìm được đường giao' : total > money ? 'Không đủ tiền' : `Đặt giao · ${formatVnd(total)}`}
    </button>
  </div>;
}
