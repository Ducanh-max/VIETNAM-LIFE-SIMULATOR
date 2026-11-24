import { useEffect, useRef, useState } from 'react';
import { jobActions } from '../game/job';
import { nav, updateNav } from '../game/navigation';
import { fareFor, places, rideActions, taxi, type Place } from '../game/ride';
import { formatVnd, game, player, useGame } from '../game/state';
import { drawMap, headingUpRotation, mapBase } from './mapCanvas';
import { useVietnamClock, VIETNAM_TZ } from './vietnamTime';

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const hhmm = new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** Round heading-up minimap with the delivery route; also keeps the route fresh. */
export function Minimap({ onOpen }: { onOpen: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const info = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    mapBase();
    let raf = 0; let lastNav = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - lastNav > 600) { lastNav = t; updateNav(); }
      const c = canvas.current; if (!c) return;
      const ctx = c.getContext('2d')!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = c.clientWidth * dpr;
      if (c.width !== size) { c.width = c.height = size; }
      drawMap(ctx, size, size, { cx: player.position.x, cz: player.position.z, scale: 1.5 * dpr, rotation: headingUpRotation() }, { circle: true });
      if (info.current) info.current.textContent = nav.route && nav.target ? `${fmtDist(nav.length)} · ${nav.target.label}` : '';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <button className="minimap" onClick={onOpen} title="Mở bản đồ (P)" aria-label="Mở bản đồ">
    <canvas ref={canvas} />
    <span className="minimap-north" aria-hidden="true">B</span>
    <span className="minimap-info" ref={info} />
  </button>;
}

type App = 'home' | 'map' | 'orders' | 'wallet' | 'messages' | 'contacts' | 'den';

/** Full map app: north-up, drag to pan, wheel or buttons to zoom, follows the player until dragged. */
function MapApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ cx: 0, cz: 0, scale: 1.2, follow: true, drag: null as null | { x: number; y: number; cx: number; cz: number } });
  const info = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = canvas.current; if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth * dpr, h = c.clientHeight * dpr;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const s = state.current;
      if (s.follow) { s.cx = player.position.x; s.cz = player.position.z; }
      drawMap(c.getContext('2d')!, w, h, { cx: s.cx, cz: s.cz, scale: s.scale * dpr, rotation: 0 });
      if (info.current) {
        const j = game.get().job;
        info.current.textContent = nav.route && nav.target
          ? `${j?.stage === 'deliver' ? 'Giao cho' : 'Về'} ${nav.target.label} · ${fmtDist(nav.length)} · ~${Math.max(1, Math.round(nav.length / 7 / 60))} phút đi xe`
          : 'Chưa có đơn giao. Gặp ông chủ Đức Anh ở quán để nhận việc ship.';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const zoom = (k: number) => { state.current.scale = Math.min(6, Math.max(0.25, state.current.scale * k)); };
  return <div className="app-map">
    <canvas ref={canvas}
      onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); const s = state.current; s.drag = { x: e.clientX, y: e.clientY, cx: s.cx, cz: s.cz }; s.follow = false; }}
      onPointerMove={(e) => { const s = state.current; if (!s.drag) return; s.cx = s.drag.cx - (e.clientX - s.drag.x) / s.scale; s.cz = s.drag.cz - (e.clientY - s.drag.y) / s.scale; }}
      onPointerUp={() => { state.current.drag = null; }} />
    <div className="map-controls">
      <button onClick={() => zoom(1.3)} aria-label="Phóng to">+</button>
      <button onClick={() => zoom(1 / 1.3)} aria-label="Thu nhỏ">−</button>
      <button onClick={() => { state.current.follow = true; }} aria-label="Về vị trí của tôi">◎</button>
    </div>
    <div className="map-info" ref={info} />
  </div>;
}

function OrdersApp() {
  const job = useGame((s) => s.job);
  const txns = useGame((s) => s.txns);
  const [left, setLeft] = useState('');
  const [confirm, setConfirm] = useState<'cancel' | 'quit' | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const d = game.get().job?.delivery;
      if (!d) { setLeft(''); return; }
      const s = Math.round(d.timeLimit - (performance.now() - d.startedAt) / 1000);
      setLeft(s >= 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Quá giờ');
    }, 500);
    return () => clearInterval(id);
  }, []);
  const d = job?.delivery;
  const earnings = txns.filter((t) => t.text.startsWith('Tiền ship') || t.text.includes('bo thêm'));
  return <div className="app-page">
    <h3>Đơn giao hàng</h3>
    {!job && <p className="app-empty">Bạn chưa nhận việc. Vào quán Bún chả Đức Anh, nói chuyện với ông chủ ở quầy thu ngân để làm shipper.</p>}
    {job && !d && <div className="order-card"><b>Về quán lấy đơn</b><span>Anh Đạt đang gói bún chả ở bếp than trước cửa.</span><span>Còn cách {fmtDist(nav.length || 0)}</span></div>}
    {d && <div className="order-card active">
      <span className="order-tag">ĐANG GIAO</span>
      <b>{d.portions} suất bún chả · {d.customer}</b>
      <span>📍 {d.street}</span>
      <span>⏱ Còn {left} · 🛵 {fmtDist(nav.length || d.distance)}</span>
      <span>💵 Tiền ship {formatVnd(d.pay)} · giao đúng giờ được bo</span>
    </div>}
    {job && <div className="order-stats"><div><strong>{job.done}</strong><span>đơn đã giao</span></div><div><strong>{formatVnd(job.earned)}</strong><span>thu nhập hôm nay</span></div></div>}
    {job && <div className="order-actions">
      {confirm === null && <>
        {d && <button className="danger-outline" onClick={() => setConfirm('cancel')}>Huỷ đơn này</button>}
        <button className="danger" onClick={() => setConfirm('quit')}>Nghỉ việc shipper</button>
      </>}
      {confirm && <div className="confirm-box">
        <p>{confirm === 'cancel' ? `Huỷ đơn của ${d?.customer}? Khách sẽ không nhận được hàng và bạn không được trả tiền ship.` : `Nghỉ việc hôm nay? Xe Wave sẽ được trả lại quán. Bạn đã giao ${job.done} đơn, kiếm ${formatVnd(job.earned)}.`}</p>
        <div><button onClick={() => setConfirm(null)}>Không</button><button className="danger" onClick={() => { if (confirm === 'cancel') jobActions.cancel(); else jobActions.quit(); setConfirm(null); }}>{confirm === 'cancel' ? 'Huỷ đơn' : 'Nghỉ việc'}</button></div>
      </div>}
    </div>}
    {earnings.length > 0 && <><h4>Lịch sử</h4><ul className="txn-list">{earnings.slice(0, 8).map((t, i) => <li key={i}><span>{t.text}<small>{hhmm.format(t.at)}</small></span><b className="plus">+{formatVnd(t.amount)}</b></li>)}</ul></>}
  </div>;
}

function WalletApp() {
  const money = useGame((s) => s.money);
  const txns = useGame((s) => s.txns);
  return <div className="app-page">
    <div className="wallet-card"><span>Số dư ví</span><strong>{formatVnd(money)}</strong><small>Đời Việt Pay · {player.position ? 'Hà Nội' : ''}</small></div>
    <h4>Giao dịch gần đây</h4>
    {txns.length === 0 ? <p className="app-empty">Chưa có giao dịch.</p>
      : <ul className="txn-list">{txns.slice(0, 20).map((t, i) => <li key={i}><span>{t.text}<small>{hhmm.format(t.at)}</small></span><b className={t.amount >= 0 ? 'plus' : 'minus'}>{t.amount >= 0 ? '+' : '−'}{formatVnd(Math.abs(t.amount))}</b></li>)}</ul>}
  </div>;
}

function MessagesApp() {
  const messages = useGame((s) => s.messages);
  return <div className="app-page">
    <h3>Tin nhắn</h3>
    {messages.length === 0 ? <p className="app-empty">Chưa có tin nhắn nào.</p>
      : <ul className="msg-list">{messages.map((m, i) => <li key={i}><div className="msg-avatar">{m.from.replace(/^(Chú|Anh|Chị|Cô|Bác|Em|Bạn)\s+/, '')[0]}</div><div><b>{m.from}<small>{hhmm.format(m.at)}</small></b><p>{m.text}</p></div></li>)}</ul>}
  </div>;
}

function ContactsApp() {
  const [calling, setCalling] = useState<string | null>(null);
  const call = (who: string) => {
    const job = game.get().job;
    const lines: Record<string, string> = {
      'Bún chả Đức Anh': !job ? 'Alo, Bún chả Đức Anh nghe! Cháu muốn làm ship thì qua quán gặp chú ở quầy nhé.' : job.delivery ? `Đơn của ${job.delivery.customer} ở ${job.delivery.street} đấy, nhanh lên kẻo nguội cháu ơi!` : 'Anh Đạt gói xong đơn rồi, cháu về lấy đi!',
      'Anh Đạt (nướng chả)': 'Alo, Đạt đây! Chả đang trên than, về là có túi ngay.',
      'Anh Khánh (phục vụ)': 'Khánh nghe! Quán đang đông, có gì nhắn sau nhé.',
    };
    setCalling(lines[who] ?? '…');
  };
  return <div className="app-page">
    <h3>Danh bạ</h3>
    <ul className="contact-list">
      {['Bún chả Đức Anh', 'Anh Đạt (nướng chả)', 'Anh Khánh (phục vụ)'].map((c) => <li key={c}><span className="msg-avatar">{c[0]}</span><b>{c}</b><button onClick={() => call(c)} aria-label={`Gọi ${c}`}>📞</button></li>)}
    </ul>
    {calling && <div className="call-bubble"><small>Đang gọi…</small><p>{calling}</p><button onClick={() => setCalling(null)}>Kết thúc</button></div>}
  </div>;
}

/** Đen SM: book an electric bike ride to a landmark; follow the driver; pay from the wallet on arrival. */
function DenSMApp() {
  const ride = useGame((s) => s.ride);
  const money = useGame((s) => s.money);
  const [pick, setPick] = useState<number | null>(null);
  const list = places();
  const here = { x: player.position.x, z: player.position.z };
  const quote = (p: Place) => { const straight = Math.hypot(p.x - here.x, p.z - here.z) * 1.3; return { dist: straight, fare: fareFor(straight) }; };
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  const taxiDist = Math.round(Math.hypot(taxi.position.x - here.x, taxi.position.z - here.z));
  return <div className="app-page den-app">
    <div className="den-header"><span className="den-logo">Đen<b>SM</b></span><small>Di chuyển xanh · giá minh bạch</small></div>
    {ride ? <div className="den-trip">
      <div className="den-status">{ride.stage === 'arriving' ? `${ride.driver} đang đến đón bạn` : ride.stage === 'waiting' ? `${ride.driver} đã tới, ra xe và bấm E` : `Đang tới ${ride.dest.name}`}</div>
      <div className="den-driver"><span className="msg-avatar den-avatar">{ride.driver.split(' ').pop()![0]}</span><div><b>{ride.driver}</b><small>Đen Bike · xe máy điện · {ride.plate}</small><small>★ 4.9 · {ride.stage === 'riding' ? `còn ${fmtDist(nav.length)}` : `cách bạn ${fmtDist(taxiDist)}`}</small></div></div>
      <div className="den-route"><span>📍 Điểm đến</span><b>{ride.dest.name}</b><small>{ride.dest.note}</small></div>
      <div className="den-fare"><span>Giá cước</span><b>{formatVnd(ride.fare)}</b><small>Trả qua ví khi tới nơi</small></div>
      {ride.stage !== 'riding' && <button className="danger-outline" onClick={() => rideActions.cancel()}>Huỷ chuyến</button>}
    </div> : <>
      <h4>Bạn muốn đi đâu?</h4>
      <ul className="den-places">{list.map((p, i) => { const q = quote(p); return <li key={p.name} className={pick === i ? 'picked' : ''} onClick={() => setPick(i)}>
        <span className="den-pin">📍</span><div><b>{p.name}</b><small>{p.note} · ~{fmtDist(q.dist)}</small></div><em>{formatVnd(q.fare)}</em>
      </li>; })}</ul>
      {pick !== null && <div className="den-book">
        <div><b>Đen Bike</b><small>Xe máy điện · 1 khách · tài xế tới trong ~30 giây</small></div>
        <button className="den-button" disabled={quote(list[pick]).fare > money} onClick={() => rideActions.book(list[pick])}>Đặt xe · {formatVnd(quote(list[pick]).fare)}</button>
        <small className="den-note">Giá ước tính theo đường đi thực tế, chốt khi đặt.</small>
      </div>}
    </>}
  </div>;
}

/** The mini smartphone: status bar with Vietnam time and battery, a home screen and five apps. */
export function Phone({ onClose }: { onClose: () => void }) {
  const [app, setApp] = useState<App>('home');
  const { now, date } = useVietnamClock();
  const unread = useGame((s) => s.messages.length);
  const job = useGame((s) => s.job);
  const ride = useGame((s) => s.ride);
  useEffect(() => { if (document.pointerLockElement) document.exitPointerLock(); }, []);
  const battery = 87 - Math.floor((now.getMinutes() % 60) / 6);
  const apps: { id: App; name: string; icon: string; color: string; badge?: number | string }[] = [
    { id: 'map', name: 'Bản đồ', icon: '🗺️', color: '#2f8cff' },
    { id: 'orders', name: 'Đơn giao', icon: '🛵', color: '#e8542f', badge: job?.delivery ? '1' : undefined },
    { id: 'wallet', name: 'Ví tiền', icon: '💰', color: '#1f9d55' },
    { id: 'messages', name: 'Tin nhắn', icon: '💬', color: '#7a4ff0', badge: unread || undefined },
    { id: 'contacts', name: 'Danh bạ', icon: '📞', color: '#f0a020' },
    { id: 'den', name: 'Đen SM', icon: '⚡', color: '#0b0b0c', badge: ride ? '•' : undefined },
  ];
  return <div className="phone" role="dialog" aria-label="Điện thoại">
    <div className="phone-screen">
      <div className="phone-status"><b>{hhmm.format(now)}</b><span className="phone-notch" /><span>▂▄▆ 4G <i className="battery"><i style={{ width: `${battery}%` }} /></i> {battery}%</span></div>
      {app === 'home'
        ? <div className="phone-home">
            <div className="phone-clock"><strong>{hhmm.format(now)}</strong><span>{date}</span></div>
            <div className="phone-apps">{apps.map((a) => <button key={a.id} onClick={() => setApp(a.id)}><span className="app-icon" style={{ background: a.color }}>{a.icon}{a.badge && <i>{a.badge}</i>}</span><span>{a.name}</span></button>)}</div>
          </div>
        : <div className="phone-app">
            <div className="app-bar"><button onClick={() => setApp('home')} aria-label="Quay lại">‹</button><b>{apps.find((a) => a.id === app)?.name}</b></div>
            {app === 'map' && <MapApp />}
            {app === 'orders' && <OrdersApp />}
            {app === 'wallet' && <WalletApp />}
            {app === 'messages' && <MessagesApp />}
            {app === 'contacts' && <ContactsApp />}
            {app === 'den' && <DenSMApp />}
          </div>}
      <div className="phone-homebar"><button onClick={() => (app === 'home' ? onClose() : setApp('home'))} aria-label={app === 'home' ? 'Cất điện thoại' : 'Màn hình chính'} /></div>
    </div>
  </div>;
}
