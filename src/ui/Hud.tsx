import { useEffect, useRef, useState } from 'react';
import { jobActions, pickupPoint } from '../game/job';
import { actions, formatVnd, game, MENU, orderCount, orderTotal, player, useGame, view, type MenuId, type Order } from '../game/state';

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
    {prompt && phase !== 'menu' && <div className="action-prompt">{prompt.key && <kbd>{prompt.key}</kbd>}<span>{prompt.text}</span></div>}
    {phase === 'eating' && <div className="eat-bar"><span>Đang ăn…</span><div><i style={{ width: `${eat * 100}%` }} /></div></div>}
    {visibleToast && <div className="game-toast" key={toast?.id}>{visibleToast}</div>}
  </>;
}

/** Conversation with the owner, Đức Anh: take or quit the shipper job. */
export function BossDialog() {
  const job = useGame((s) => s.job);
  const close = () => game.set({ dialog: null });
  return <div className="modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <section className="modal-card dialog-card" role="dialog" aria-modal="true" aria-label="Nói chuyện với ông chủ Đức Anh">
      <span className="modal-kicker">ÔNG CHỦ QUÁN · BÚN CHẢ ĐỨC ANH</span>
      <h2>Đức Anh</h2>
      {!job ? <>
        <p className="dialog-line">“Chào cháu! Dạo này quán đông, khách gọi ship liên tục mà chú thiếu người. Cháu có muốn làm shipper cho quán không?”</p>
        <p className="dialog-line">“Quán có sẵn con Wave đỏ với thùng giữ nhiệt. Cháu ra chỗ <b>anh Đạt</b> ở bếp than ngoài cửa lấy túi bún chả, chở đến tận nhà khách. Mỗi đơn chú trả <b>20.000–65.000đ</b> tuỳ xa gần, giao nhanh thì khách còn bo thêm.”</p>
        <div className="dialog-tips"><span><kbd>F</kbd> lên / xuống xe</span><span><kbd>W</kbd><kbd>S</kbd> ga / phanh</span><span><kbd>A</kbd><kbd>D</kbd> rẽ</span><span><kbd>SHIFT</kbd> tăng tốc</span></div>
        <button className="primary-button modal-primary" onClick={() => jobActions.accept()}>Dạ, cháu nhận việc!</button>
        <button className="text-button dialog-secondary" onClick={close}>Để cháu suy nghĩ đã</button>
      </> : <>
        <p className="dialog-line">{job.done ? `“Hôm nay cháu giao được ${job.done} đơn rồi, ${formatVnd(job.earned)} đấy. Giỏi lắm!”` : '“Sao rồi cháu? Ra chỗ anh Đạt lấy đơn đi, khách đang chờ.”'}</p>
        <p className="dialog-line">{job.stage === 'deliver' && job.delivery ? `“Đơn của ${job.delivery.customer} ở ${job.delivery.street} còn đang chờ đấy, đi nhanh kẻo nguội!”` : '“Đơn tiếp theo anh Đạt đang gói, cháu ra lấy nhé.”'}</p>
        <button className="primary-button modal-primary" onClick={close}>Dạ, cháu đi ngay</button>
        <button className="text-button dialog-secondary" onClick={() => jobActions.quit()}>Cháu xin nghỉ hôm nay</button>
      </>}
    </section>
  </div>;
}

/** Current delivery: customer, street, distance, a compass arrow and the clock. */
export function JobPanel() {
  const job = useGame((s) => s.job);
  const arrow = useRef<HTMLSpanElement>(null);
  const dist = useRef<HTMLElement>(null);
  const timer = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const j = game.get().job;
      const target = j?.stage === 'deliver' && j.delivery ? j.delivery.dest : pickupPoint();
      if (!target) return;
      const dx = target.x - player.position.x; const dz = target.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (dist.current) dist.current.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
      // camera forward is (-sin yaw, -cos yaw); arrow angle relative to it
      const bearing = Math.atan2(dx, dz); const camHeading = Math.atan2(-Math.sin(view.yaw), -Math.cos(view.yaw));
      if (arrow.current) arrow.current.style.transform = `rotate(${(-(bearing - camHeading)) * 180 / Math.PI}deg)`;
      if (timer.current && j?.delivery) {
        const left = Math.round(j.delivery.timeLimit - (performance.now() - j.delivery.startedAt) / 1000);
        timer.current.textContent = left >= 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Quá giờ';
        timer.current.className = left < 0 ? 'late' : left < 20 ? 'hurry' : '';
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!job) return null;
  const d = job.delivery;
  return <div className="job-panel">
    <span className="job-arrow" ref={arrow} aria-hidden="true">➤</span>
    <div className="job-body">
      <span className="job-kicker">SHIPPER · BÚN CHẢ ĐỨC ANH</span>
      {job.stage === 'deliver' && d
        ? <><strong>{d.portions} suất cho {d.customer}</strong><small>{d.street} · <b ref={dist}>—</b> · còn <b ref={timer}>—</b></small><small>Tiền ship {formatVnd(d.pay)} · giao đúng giờ được bo</small></>
        : <><strong>Về quán lấy đơn ở chỗ anh Đạt</strong><small>Bếp than trước cửa quán · <b ref={dist}>—</b></small></>}
      <small className="job-stats">Đã giao {job.done} đơn · {formatVnd(job.earned)}</small>
    </div>
  </div>;
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
