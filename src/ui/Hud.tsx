import { useEffect, useState } from 'react';
import { actions, formatVnd, MENU, orderCount, orderTotal, useGame, type MenuId, type Order } from '../game/state';

function Meter({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const low = value < 20;
  return <div className={`need ${low ? 'low' : ''}`} title={`${label}: ${Math.round(value)}%`}>
    <span className="need-icon" aria-hidden="true">{icon}</span>
    <div className="need-body">
      <div className="need-label"><b>{label}</b><span>{Math.round(value)}%</span></div>
      <div className="need-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
    </div>
  </div>;
}

/** Hunger, thirst and wallet, top-right under the header. */
export function NeedsHud() {
  const hunger = useGame((s) => s.hunger);
  const thirst = useGame((s) => s.thirst);
  const money = useGame((s) => s.money);
  return <div className="needs-hud">
    <Meter label="No bụng" value={hunger} color="linear-gradient(90deg,#e0892f,#f2c14e)" icon="🍜" />
    <Meter label="Nước" value={thirst} color="linear-gradient(90deg,#2f8fd8,#7fd0f2)" icon="💧" />
    <div className="wallet"><span>Ví</span><strong>{formatVnd(money)}</strong></div>
  </div>;
}

/** Context action ("E · Ngồi xuống & gọi món") and short toasts. */
export function PromptAndToast() {
  const prompt = useGame((s) => s.prompt);
  const toast = useGame((s) => s.toast);
  const phase = useGame((s) => s.phase);
  const eat = useGame((s) => s.eatProgress);
  const [visibleToast, setVisibleToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    setVisibleToast(toast.text);
    const id = setTimeout(() => setVisibleToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);
  return <>
    {prompt && phase !== 'menu' && <div className="action-prompt">{prompt.key !== 'info' && <kbd>E</kbd>}<span>{prompt.text}</span></div>}
    {phase === 'eating' && <div className="eat-bar"><span>Đang ăn…</span><div><i style={{ width: `${eat * 100}%` }} /></div></div>}
    {visibleToast && <div className="game-toast" key={toast?.id}>{visibleToast}</div>}
  </>;
}

/** The order sheet at Bún chả Đức Anh. */
export function MenuPanel() {
  const money = useGame((s) => s.money);
  const [order, setOrder] = useState<Order>({ buncha: 1 });
  const total = orderTotal(order);
  const change = (id: MenuId, delta: number) => setOrder((o) => ({ ...o, [id]: Math.max(0, Math.min(5, (o[id] ?? 0) + delta)) }));
  return <div className="modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) actions.closeMenu(); }}>
    <section className="modal-card menu-card" role="dialog" aria-modal="true" aria-label="Thực đơn Bún chả Đức Anh">
      <button className="modal-close" aria-label="Đóng" onClick={() => actions.closeMenu()}>✕</button>
      <span className="modal-kicker">ĐẶC SẢN HÀ NỘI · PHỐ ĐINH TIÊN HOÀNG</span>
      <h2>Bún chả Đức Anh</h2>
      <p>Chả miếng ba chỉ và chả viên nướng trên than hoa, thả vào bát nước chấm chua ngọt với đu đủ xanh, ăn cùng bún rối, rau sống, tỏi ớt và chanh.</p>
      <ul className="menu-list">
        {MENU.map((item) => <li key={item.id} className={item.id === 'buncha' ? 'signature' : ''}>
          <div className="menu-info">
            <strong>{item.name}{item.id === 'buncha' && <em>Món chính</em>}</strong>
            <small>{item.note}</small>
            <small className="menu-effect">{item.hunger > 0 && `+${item.hunger} no`}{item.hunger > 0 && item.thirst > 0 && ' · '}{item.thirst > 0 && `+${item.thirst} nước`}</small>
          </div>
          <span className="menu-price">{formatVnd(item.price)}</span>
          <div className="qty">
            <button aria-label={`Bớt ${item.name}`} onClick={() => change(item.id, -1)}>−</button>
            <b>{order[item.id] ?? 0}</b>
            <button aria-label={`Thêm ${item.name}`} onClick={() => change(item.id, 1)}>+</button>
          </div>
        </li>)}
      </ul>
      <div className="menu-total"><span>Tổng cộng <small>(Ví: {formatVnd(money)})</small></span><strong>{formatVnd(total)}</strong></div>
      <button className="primary-button modal-primary" disabled={!orderCount(order) || total > money} onClick={() => actions.placeOrder(order)}>
        {total > money ? 'Không đủ tiền' : `Gọi món · ${formatVnd(total)}`}
      </button>
    </section>
  </div>;
}
