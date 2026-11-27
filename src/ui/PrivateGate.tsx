import { getApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import { accountsReady, signIn, signInGoogle, signOut, useAccount, viError } from '../game/account';
import { PRIVATE_BUILD } from '../game/privateBuild';

/*
 * Private test build (VITE_PRIVATE_BUILD=true): the whole app sits behind a sign-in gate. Only admins (vlife_admins)
 * and invited testers (vlife_testers/{lowercase email}) get in; Firestore rules let a user read only their own tester
 * document and let only admins add or remove testers. Admins get a small panel to manage the list in the game.
 * Nothing here runs in the normal (public) build.
 */
const db = () => getFirestore(getApp());
const box: React.CSSProperties = { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#111b1a', color: '#eef1f3', fontFamily: 'Be Vietnam Pro, Arial, sans-serif', zIndex: 1000 };
const card: React.CSSProperties = { width: 'min(420px, 92vw)', background: '#1c2624', border: '1px solid #3a4a46', borderRadius: 16, padding: 22, boxShadow: '0 10px 40px rgba(0,0,0,.4)' };
const btn: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 15 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 8, border: '1px solid #4a5a56', background: '#0f1716', color: '#eef1f3', margin: '4px 0 8px' };

export function PrivateGate({ children }: { children: ReactNode }) {
  const ready = useAccount((s) => s.ready); const user = useAccount((s) => s.user); const admin = useAccount((s) => s.admin);
  const [tester, setTester] = useState<boolean | null>(null); const [err, setErr] = useState('');
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('');
  useEffect(() => {
    let live = true; setTester(null);
    if (!user?.email) return;
    getDoc(doc(db(), 'vlife_testers', user.email.toLowerCase())).then((d) => { if (live) setTester(d.exists()); }).catch(() => { if (live) setTester(false); });
    return () => { live = false; };
  }, [user]);
  if (!PRIVATE_BUILD) return <>{children}</>;
  if (import.meta.env.DEV && (import.meta.env as Record<string, string>).VITE_GATE_OFF === 'true') return <>{children}</>; // local screenshots only, never in a build
  if (!accountsReady) return <div style={box}><div style={card}>Bản thử nghiệm riêng chưa cấu hình tài khoản.</div></div>;
  if (!ready || (user && tester === null && !admin)) return <div style={box}><div style={card}>Đang kiểm tra quyền truy cập…</div></div>;
  if (!user) return <div style={box}><div style={card}>
    <h2 style={{ margin: '0 0 6px', color: '#ffd36b' }}>ĐỜI VIỆT · bản thử nghiệm riêng</h2>
    <p style={{ margin: '0 0 14px', color: '#c3c9cd', fontSize: 14 }}>Trang này chỉ dành cho người được mời. Đăng nhập bằng email đã được cấp quyền.</p>
    <button style={{ ...btn, width: '100%', background: '#e0313f', color: '#fff', marginBottom: 12 }} onClick={() => { setErr(''); signInGoogle().catch((e) => setErr(viError(e))); }}>Đăng nhập bằng Google</button>
    <div style={{ fontSize: 13, color: '#9aa3a9' }}>hoặc email và mật khẩu</div>
    <input style={input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
    <input style={input} placeholder="Mật khẩu" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
    <button style={{ ...btn, width: '100%', background: '#f4f2ee', color: '#23262a' }} onClick={() => { setErr(''); signIn(email, pass).catch((e) => setErr(viError(e))); }}>Đăng nhập</button>
    {err && <p style={{ color: '#ff8a80', fontSize: 13 }}>{err}</p>}
  </div></div>;
  if (!admin && !tester) return <div style={box}><div style={card}>
    <h2 style={{ margin: '0 0 6px', color: '#ffd36b' }}>Bạn chưa được cấp quyền</h2>
    <p style={{ color: '#c3c9cd', fontSize: 14 }}>Tài khoản <b>{user.email}</b> chưa có trong danh sách người được xem bản thử nghiệm này. Hãy nhờ người quản lý thêm email của bạn.</p>
    <button style={{ ...btn, background: '#f4f2ee', color: '#23262a' }} onClick={() => void signOut()}>Đăng xuất</button>
  </div></div>;
  return <>{children}{admin && <TesterAdmin />}</>;
}

/** Admin-only: add / remove the emails allowed into the private build. */
function TesterAdmin() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.code === 'Digit0' || e.code === 'Numpad0') && !e.repeat && (e.target as HTMLElement)?.tagName !== 'INPUT') setOpen((o) => !o); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []); const [list, setList] = useState<string[]>([]); const [email, setEmail] = useState(''); const [msg, setMsg] = useState('');
  const user = useAccount((s) => s.user);
  const load = () => getDocs(collection(db(), 'vlife_testers')).then((s) => setList(s.docs.map((d) => d.id).sort())).catch((e) => setMsg(String(e?.message ?? e)));
  useEffect(() => { if (open) void load(); }, [open]);
  const add = async () => {
    const e = email.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setMsg('Email chưa đúng.'); return; }
    try { await setDoc(doc(db(), 'vlife_testers', e), { addedBy: user?.email ?? '', addedAt: serverTimestamp() }); setEmail(''); setMsg(`Đã cấp quyền cho ${e}.`); void load(); } catch (er) { setMsg(String((er as Error).message)); }
  };
  const remove = async (e: string) => { try { await deleteDoc(doc(db(), 'vlife_testers', e)); setMsg(`Đã thu quyền của ${e}.`); void load(); } catch (er) { setMsg(String((er as Error).message)); } };
  return <div style={{ position: 'fixed', left: 16, bottom: 70, zIndex: 900, fontFamily: 'Be Vietnam Pro, Arial, sans-serif' }}>

    {open && <div style={{ ...card, width: 340, color: '#eef1f3' }}>
      <b style={{ color: '#ffd36b' }}>Người được xem bản thử nghiệm</b> <span style={{ fontSize: 11, color: '#9aa3a9' }}>(phím 0 để ẩn/hiện)</span>
      <p style={{ fontSize: 12, color: '#9aa3a9', margin: '4px 0 8px' }}>Thêm email để cấp quyền; người đó đăng nhập bằng đúng email này là vào được. Admin luôn vào được.</p>
      <div style={{ display: 'flex', gap: 6 }}><input style={{ ...input, margin: 0 }} placeholder="email@vidu.com" value={email} onChange={(e) => setEmail(e.target.value)} /><button style={{ ...btn, background: '#2fa35b', color: '#fff' }} onClick={() => void add()}>Thêm</button></div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0', maxHeight: 220, overflowY: 'auto' }}>
        {list.length === 0 && <li style={{ fontSize: 13, color: '#9aa3a9' }}>Chưa có ai.</li>}
        {list.map((e) => <li key={e} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 14 }}>{e}<button style={{ ...btn, padding: '4px 8px', fontSize: 12, background: '#5a2a2a', color: '#fff' }} onClick={() => void remove(e)}>Thu quyền</button></li>)}
      </ul>
      {msg && <p style={{ fontSize: 12, color: '#c3c9cd' }}>{msg}</p>}
      <button style={{ ...btn, background: '#f4f2ee', color: '#23262a' }} onClick={() => setOpen(false)}>Đóng</button>
    </div>}
  </div>;
}
