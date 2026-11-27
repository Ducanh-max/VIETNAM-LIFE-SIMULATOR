import { useState } from 'react';
import { carActions, useCarLive } from '../game/cars/carState';
import { cars, useCars } from '../game/cars/carRegistry';
import { CAR_COLORS, CAR_SPECS } from '../game/cars/carSpecs';
import { nav, updateNav } from '../game/navigation';
import { game, player } from '../game/state';

/*
 * "My Car": the phone's remote key. After buying a car you get an 8-character code (in the showroom message and in
 * Tin nhắn); typing it here pairs the phone with that car. Then, from any distance: start / stop the engine, air-con
 * (cabin temperature), lock / unlock (lights flash, beep), open / close the boot, and see where the car is.
 */
export function MyCarApp() {
  const paired = useCars((s) => s.paired); const list = useCars((s) => s.cars);
  const car = list.find((c) => c.vehicleId === paired);
  const [code, setCode] = useState(''); const [err, setErr] = useState('');
  const pair = () => {
    const c = cars.get().cars.find((x) => x.pairCode && x.pairCode === code.trim().toUpperCase());
    if (!c) { setErr(list.length ? 'Mã không đúng. Xem lại mã trong Tin nhắn của Ô tô Đời Việt.' : 'Bạn chưa có xe nào. Mua xe ở showroom Ô tô Đời Việt (phố Kim Mã) để nhận mã.'); return; }
    cars.set({ paired: c.vehicleId }); setErr(''); setCode(''); game.toast(`Đã kết nối My Car với ${CAR_SPECS[c.modelId].name} (${c.plate}).`);
  };
  if (!car) return <div style={{ padding: 14 }}>
    <div style={{ fontSize: 40, textAlign: 'center' }}>🚗</div>
    <h3 style={{ margin: '6px 0' }}>Kết nối xe của bạn</h3>
    <p style={{ fontSize: 13, color: '#555' }}>Nhập mã 8 ký tự nhận được khi mua xe (trong Tin nhắn của Ô tô Đời Việt).</p>
    <input value={code} maxLength={8} placeholder="VD: K7M2Q9XP" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') pair(); }}
      style={{ width: '100%', boxSizing: 'border-box', padding: 10, fontSize: 18, letterSpacing: 3, textAlign: 'center', borderRadius: 10, border: '1px solid #bbb' }} />
    <button onClick={pair} style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 10, border: 'none', background: '#1f7fbf', color: '#fff', fontWeight: 700 }}>Kết nối</button>
    {err && <p style={{ color: '#c0392b', fontSize: 13 }}>{err}</p>}
  </div>;
  return <Remote id={car.vehicleId} />;
}

function Remote({ id }: { id: string }) {
  const car = useCars((s) => s.cars.find((c) => c.vehicleId === id))!; const driving = useCars((s) => s.driving === id);
  const locked = useCarLive(id, (s) => s.locked); const engine = useCarLive(id, (s) => s.engine); const ac = useCarLive(id, (s) => s.ac);
  const temp = useCarLive(id, (s) => s.cabinTemp); const trunk = useCarLive(id, (s) => s.doors.TG);
  const spec = CAR_SPECS[car.modelId]; const dist = Math.hypot(car.parked.x - player.position.x, car.parked.z - player.position.z);
  const fuel = Math.round((car.fuel / car.fuelCapacity) * 100);
  const big = (on: boolean, color: string): React.CSSProperties => ({ padding: '12px 6px', borderRadius: 14, border: 'none', background: on ? color : '#e9ecef', color: on ? '#fff' : '#222', fontWeight: 700, fontSize: 13, cursor: 'pointer' });
  const say = (m: string | null) => { if (m) game.toast(m); };
  return <div style={{ padding: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div><b>{spec.name}</b><div style={{ fontSize: 12, color: '#666' }}>{car.plate} · {CAR_COLORS.find((c) => c.hex === car.color)?.name ?? ''}</div></div>
      <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 8, background: locked ? '#fde2e2' : '#e3f7e9', color: locked ? '#c0392b' : '#1e8449' }}>{locked ? '🔒 Đã khoá' : '🔓 Đã mở'}</span>
    </div>
    <div style={{ display: 'flex', gap: 8, margin: '10px 0', fontSize: 12, color: '#444' }}>
      <span>⛽ {fuel}%</span><span>🌡️ Cabin {temp.toFixed(1)}°C</span><span>{engine ? '🟢 Máy đang nổ' : '⚪ Tắt máy'}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <button style={big(engine, '#2fa35b')} onClick={() => carActions.setEngine(id, !engine)}>{engine ? '⏹ Tắt máy' : '▶ Nổ máy'}</button>
      <button style={big(ac, '#1f7fbf')} onClick={() => { if (!engine && !ac) game.toast('Điều hoà chạy khi máy nổ; đã bật sẵn, sẽ mát khi nổ máy.'); carActions.setAc(id, !ac); }}>{ac ? '❄️ Tắt điều hoà' : '❄️ Bật điều hoà'}</button>
      <button style={big(locked, '#c0392b')} onClick={() => carActions.setLocked(id, true)}>🔒 Khoá xe</button>
      <button style={big(!locked, '#e67e22')} onClick={() => carActions.setLocked(id, false)}>🔓 Mở xe</button>
      <button style={{ ...big(trunk, '#8e44ad'), gridColumn: '1 / 3' }} disabled={driving && Math.abs(0) > 0} onClick={() => say(carActions.setTrunk(id, !trunk))}>{trunk ? '⬇ Đóng cốp' : '⬆ Mở cốp'}</button>
    </div>
    <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: '#f4f6f8', fontSize: 13 }}>
      📍 Xe cách bạn khoảng {dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`}{driving ? ' (bạn đang lái)' : ''}.
      {!driving && <button style={{ display: 'block', marginTop: 6, padding: '6px 10px', borderRadius: 8, border: 'none', background: '#2f8cff', color: '#fff' }} onClick={() => { nav.custom = { x: car.parked.x, z: car.parked.z, label: `${spec.name} ${car.plate}` }; updateNav(); game.toast('Đã chỉ đường tới xe trong app Bản đồ.'); }}>🗺️ Chỉ đường tới xe</button>}
    </div>
    <button style={{ marginTop: 10, background: 'none', border: 'none', color: '#888', fontSize: 12 }} onClick={() => cars.set({ paired: null })}>Ngắt kết nối xe này</button>
  </div>;
}
