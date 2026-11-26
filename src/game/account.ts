import { createClient, type Session, type User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { savePlayerName } from '../ui/player';
import { setAdmin } from './admin';

/*
 * Accounts: email + password (with Gmail confirmation) or Google, on Supabase. The URL and the publishable key are
 * public by design (they only allow what the database's row-level rules allow). Admin rights are decided on the
 * server: the rpc \`vlife_is_admin\` answers true only for confirmed accounts listed there, so no admin address is in
 * this code. Playing without an account stays possible.
 */
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://pbzwndfzhqawzgnzmcte.supabase.co';
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_ciTYswJA3GjWpKPaiYf6Ug_wpcB3f2r';
export const supabase = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'doi-viet-auth' } });

type AccountState = { ready: boolean; user: User | null; name: string; admin: boolean; guest: boolean };
let st: AccountState = { ready: false, user: null, name: '', admin: false, guest: localStorage.getItem('doi-viet-guest') === '1' };
const subs = new Set<() => void>();
const set = (p: Partial<AccountState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const accountStore = { get: () => st, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; } };
export function useAccount<T>(sel: (s: AccountState) => T): T { return useSyncExternalStore(accountStore.subscribe, () => sel(st)); }

const displayName = (u: User) => (u.user_metadata?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Người chơi') as string;

async function apply(session: Session | null) {
  const user = session?.user ?? null;
  if (!user) { set({ ready: true, user: null, name: '', admin: false }); setAdmin(false); return; }
  const name = displayName(user);
  savePlayerName(name); // the account's name is the multiplayer nickname
  localStorage.removeItem('doi-viet-guest');
  set({ ready: true, user, name, guest: false });
  try {
    const { data, error } = await supabase.rpc('vlife_is_admin');
    const admin = !error && data === true;
    set({ admin }); setAdmin(admin);
  } catch { set({ admin: false }); setAdmin(false); }
}
void supabase.auth.getSession().then(({ data }) => apply(data.session));
supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => void apply(session), 0); });

/** Supabase errors in Vietnamese. */
export function viError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return 'Sai email hoặc mật khẩu.';
  if (/Email not confirmed/i.test(m)) return 'Email chưa được xác nhận. Mở Gmail và bấm vào link xác nhận trước nhé.';
  if (/User already registered|already been registered/i.test(m)) return 'Email này đã có tài khoản. Bạn đăng nhập hoặc dùng "Quên mật khẩu".';
  if (/Password should be at least|password.*(short|weak)/i.test(m)) return 'Mật khẩu cần ít nhất 6 ký tự (nên có cả chữ và số).';
  if (/valid email|invalid.*email|Unable to validate email/i.test(m)) return 'Địa chỉ email không hợp lệ.';
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'Đăng nhập bằng Google chưa được bật trên máy chủ. Bạn dùng email + mật khẩu trước nhé.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Bạn thao tác hơi nhanh, đợi một chút rồi thử lại nhé.';
  if (/fetch|network/i.test(m)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return `Có lỗi: ${m}`;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(viError(error));
}
/** Returns true when the account still has to be confirmed from the email. */
export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(viError(error));
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error(viError({ message: 'User already registered' }));
  return !data.session;
}
export async function signInGoogle() {
  // ask the server first whether Google sign-in is switched on, so a disabled provider gives a clear message here
  try { const r = await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } }); const j = await r.json(); if (j?.external && j.external.google === false) throw new Error(viError({ message: 'provider is not enabled' })); } catch (e) { if ((e as Error).message.startsWith('Đăng nhập bằng Google')) throw e; }
  const keep = new URLSearchParams(location.search).get('room');
  const redirectTo = location.origin + location.pathname + (keep ? `?room=${encodeURIComponent(keep)}` : '');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw new Error(viError(error));
}
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(viError(error));
}
export async function signOut() { await supabase.auth.signOut(); }
export function playAsGuest() { localStorage.setItem('doi-viet-guest', '1'); set({ guest: true }); }
