import { useEffect, useState } from 'react';
import { inReturnBay, RENT_PRICES, RENTAL, rentalActions, rentalCost, type RentKind } from '../game/rental';
import { bike, formatVnd, game, useGame } from '../game/state';

const fmtTime = (ms: number) => { const m = Math.floor(ms / 60_000), s = Math.floor((ms % 60_000) / 1000); return `${m} phút ${String(s).padStart(2, '0')} giây`; };
function useTick(ms = 1000) { const [, f] = useState(0); useEffect(() => { const id = setInterval(() => f((n) => n + 1), ms); return () => clearInterval(id); }, [ms]); }

/** The rental counter: price list, rent a scooter or a car, or settle up when the vehicle is in the return bay. */
export function RentalPanel() {
  const open = useGame((s) => s.rentalOpen);
  const rental = useGame((s) => s.rental);
  const money = useGame((s) => s.money);
  useTick();
  if (!open) return null;
  const close = () => game.set({ rentalOpen: false });
  return <div className="rent-panel" role="dialog" aria-label={RENTAL.name}>
    <div className="rent-head"><b>{RENTAL.name}</b><span>{RENTAL.street}</span><button onClick={close} aria-label="Đóng">✕</button></div>
    {rental ? <>
      <p>Chú Tuấn: "Xe {RENT_PRICES[rental.kind].name.toLowerCase()} biển <b>{rental.plate}</b> của cháu đây."</p>
      <div className="rent-bill"><span>Thời gian thuê</span><b>{fmtTime(Date.now() - rental.startedAt)}</b><span>Tạm tính</span><b>{formatVnd(rentalCost(rental.kind, Date.now() - rental.startedAt))}</b><span>Đã cọc</span><b>{formatVnd(rental.deposit)}</b></div>
      {inReturnBay(bike.position.x, bike.position.z)
        ? <button className="rent-primary" onClick={() => rentalActions.giveBack()}>Trả xe và thanh toán</button>
        : <p className="rent-warn">Xe chưa nằm trong ô trả xe (vạch vàng trước tiệm). Lái xe vào ô rồi nói chuyện lại với chú Tuấn.</p>}
    </> : <>
      <p>Chú Tuấn: "Thuê xe máy hay ô tô cháu? Tính tiền theo thời gian thực, làm tròn mỗi 10 phút."</p>
      {(['bike', 'car'] as RentKind[]).map((k) => { const p = RENT_PRICES[k]; return <div key={k} className="rent-row">
        <div><b>{k === 'bike' ? '🛵' : '🚗'} {p.name}</b><small>{p.seats} chỗ · cọc {formatVnd(p.deposit)}</small><small>{formatVnd(p.first)} cho 10 phút đầu, {formatVnd(p.step)} mỗi 10 phút tiếp theo, tối đa {formatVnd(p.cap)}</small></div>
        <button disabled={money < p.deposit} onClick={() => rentalActions.rent(k)}>{money < p.deposit ? 'Không đủ cọc' : `Thuê · cọc ${formatVnd(p.deposit)}`}</button>
      </div>; })}
      <small className="rent-note">Trả xe: lái về ô trả xe trước tiệm, bấm E nói chuyện với chú Tuấn. Tiền thuê trừ vào cọc, phần dư hoàn lại. Xe thuê không dùng để chạy Đen SM.</small>
    </>}
  </div>;
}

/** Phone app: the running rental (time, cost so far, where the vehicle is). */
export function RentalApp({ onRoute }: { onRoute: () => void }) {
  const rental = useGame((s) => s.rental);
  useTick();
  if (!rental) return <div className="app-page"><h4>Thuê xe</h4><p>Bạn chưa thuê xe. Ghé <b>{RENTAL.name}</b> ở {RENTAL.street} (cách quán bún chả khoảng {(RENTAL.routeToBunCha / 1000).toFixed(1)} km) để thuê xe máy hoặc ô tô theo giờ.</p><button className="den-button" onClick={onRoute}>Chỉ đường tới tiệm</button></div>;
  const ms = Date.now() - rental.startedAt; const p = RENT_PRICES[rental.kind];
  return <div className="app-page">
    <h4>Thuê xe · {p.name}</h4>
    <div className="rent-bill"><span>Biển số</span><b>{rental.plate}</b><span>Thời gian</span><b>{fmtTime(ms)}</b><span>Tạm tính</span><b>{formatVnd(rentalCost(rental.kind, ms))}</b><span>Cọc</span><b>{formatVnd(rental.deposit)}</b></div>
    <small>{formatVnd(p.first)} 10 phút đầu · {formatVnd(p.step)}/10 phút · tối đa {formatVnd(p.cap)}</small>
    <button className="den-button" onClick={onRoute}>Chỉ đường về tiệm trả xe</button>
  </div>;
}
