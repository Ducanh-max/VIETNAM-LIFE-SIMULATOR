import { useEffect, useState } from 'react';
import { joinGame, leaveGame, makeCode, MAX_PLAYERS, net, onNet } from '../game/net';

/** Room code from the invite link (?room=ABC123). */
export function roomFromUrl() {
  const c = new URLSearchParams(location.search).get('room');
  return c ? c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) : '';
}
const inviteLink = (code: string) => `${location.origin}${location.pathname}?room=${code}#play`;

/** "Chơi cùng bạn bè": create a room or join one by code, copy the invite link, see who is in, chat. */
export function MultiplayerPanel({ onClose }: { onClose: () => void }) {
  const [, force] = useState(0);
  useEffect(() => onNet(() => force((n) => n + 1)), []);
  const [code, setCode] = useState(net.code || roomFromUrl());
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
  const online = net.status === 'online' || net.status === 'connecting';
  const players = [...net.remotes.values()];
  const create = () => { const c = makeCode(); setCode(c); void joinGame(c); history.replaceState(null, '', `?room=${c}#play`); };
  const join = () => { if (code.trim()) { void joinGame(code); history.replaceState(null, '', `?room=${code.trim().toUpperCase()}#play`); } };
  return <div className="mp-panel" role="dialog" aria-label="Chơi cùng bạn bè">
    <div className="mp-head"><b>Chơi cùng bạn bè</b><button onClick={onClose} aria-label="Đóng">✕</button></div>
    {!online ? <>
      <p className="mp-note">Tối đa {MAX_PLAYERS} người một phòng. Các máy nối trực tiếp với nhau (WebRTC), không cần đăng ký. Ví, đói/khát và việc làm vẫn là của riêng bạn.</p>
      <button className="mp-primary" onClick={create}>Tạo phòng mới</button>
      <div className="mp-join"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Nhập mã phòng (6 ký tự)" maxLength={12} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') join(); }} /><button onClick={join}>Vào phòng</button></div>
      {net.message && <p className={`mp-status ${net.status}`}>{net.message}</p>}
    </> : <>
      <div className="mp-code"><span>Mã phòng</span><strong>{net.code}</strong></div>
      <button className="mp-primary" onClick={() => { void navigator.clipboard?.writeText(inviteLink(net.code)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Đã copy link mời ✓' : 'Copy link mời bạn bè'}</button>
      <p className={`mp-status ${net.status}`}>{net.message}</p>
      <ul className="mp-list">
        <li><i className="dot me" />Bạn</li>
        {players.map((p) => <li key={p.id}><i className={`dot ${performance.now() - p.last < 3000 ? 'on' : 'lag'}`} />{p.name}{performance.now() - p.last > 3000 ? ' · mất kết nối…' : ''}</li>)}
      </ul>
      <small className="mp-count">{players.length + 1}/{MAX_PLAYERS} người</small>
      <div className="mp-chat">
        {net.chat.slice(-5).map((c, i) => <div key={i}><b>{c.from}:</b> {c.text}</div>)}
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Nhắn cho cả phòng…" maxLength={160} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && msg.trim()) { net.send?.chat(msg.trim()); setMsg(''); } }} />
      </div>
      <button className="mp-leave" onClick={() => { void leaveGame(); history.replaceState(null, '', `${location.pathname}#play`); }}>Rời phòng (chơi một mình)</button>
      <small className="mp-note">Nếu mạng chặn WebRTC (một số wifi công ty/trường học), hai máy có thể không thấy nhau.</small>
    </>}
  </div>;
}
