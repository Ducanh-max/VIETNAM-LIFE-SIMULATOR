import { useState } from 'react';
import { playAsGuest, resetPassword, signIn, signInGoogle, signOut, signUp, useAccount } from '../game/account';

type Tab = 'login' | 'signup' | 'forgot';

/** Đăng nhập / Đăng ký / Quên mật khẩu, Google, or play without an account. */
export function AccountForm({ onDone, onGuest }: { onDone: () => void; onGuest?: () => void }) {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (f: () => Promise<void>) => { setBusy(true); setMsg(null); try { await f(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); } };
  const submit = () => run(async () => {
    if (tab === 'login') { await signIn(email, password); onDone(); }
    else if (tab === 'signup') {
      if (!name.trim()) throw new Error('Bạn nhập tên hiển thị trong game nhé.');
      const confirm = await signUp(email, password, name);
      if (confirm) setMsg({ ok: true, text: 'Đã tạo tài khoản! Kiểm tra Gmail và bấm vào link xác nhận, rồi quay lại đăng nhập.' });
      else onDone();
    } else { await resetPassword(email); setMsg({ ok: true, text: 'Đã gửi email đặt lại mật khẩu. Kiểm tra hộp thư (cả mục Spam) nhé.' }); }
  });
  return <div className="account-form">
    <div className="account-tabs">
      <button className={tab === 'login' ? 'on' : ''} onClick={() => { setTab('login'); setMsg(null); }}>Đăng nhập</button>
      <button className={tab === 'signup' ? 'on' : ''} onClick={() => { setTab('signup'); setMsg(null); }}>Đăng ký</button>
    </div>
    <button className="account-google" disabled={busy} onClick={() => run(signInGoogle)}><span>G</span> Đăng nhập bằng Google</button>
    <div className="account-or">hoặc dùng email (Gmail)</div>
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} onKeyDown={(e) => e.stopPropagation()}>
      {tab === 'signup' && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị trong game" maxLength={24} autoComplete="nickname" />}
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (ví dụ ten@gmail.com)" autoComplete="email" required />
      {tab !== 'forgot' && <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} minLength={6} required />}
      <button className="welcome-primary" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : tab === 'login' ? 'Đăng nhập' : tab === 'signup' ? 'Tạo tài khoản' : 'Gửi email đặt lại mật khẩu'}</button>
    </form>
    {msg && <p className={`account-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
    {tab === 'login' && <button className="welcome-link small" onClick={() => { setTab('forgot'); setMsg(null); }}>Quên mật khẩu?</button>}
    {tab === 'forgot' && <button className="welcome-link small" onClick={() => { setTab('login'); setMsg(null); }}>← Quay lại đăng nhập</button>}
    {onGuest && <button className="welcome-link" onClick={() => { playAsGuest(); onGuest(); }}>Chơi không cần tài khoản</button>}
  </div>;
}

/** The signed-in account in Settings: name, email, admin badge, sign out (or a sign-in form). */
export function AccountCard() {
  const user = useAccount((s) => s.user);
  const name = useAccount((s) => s.name);
  const admin = useAccount((s) => s.admin);
  const [open, setOpen] = useState(false);
  if (!user) return open ? <AccountForm onDone={() => setOpen(false)} /> : <div className="account-card"><span>Đang chơi không có tài khoản.</span><button className="text-button" onClick={() => setOpen(true)}>Đăng nhập / Đăng ký</button></div>;
  return <div className="account-card">
    <div><strong>{name}</strong>{admin && <em className="account-admin">ADMIN</em>}<small>{user.email}</small></div>
    <button className="text-button" onClick={() => void signOut()}>Đăng xuất</button>
  </div>;
}
