import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence, createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut as fbSignOut,
  updateProfile, type Auth, type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { savePlayerName } from '../ui/player';
import { setAdmin } from './admin';

/*
 * Accounts on Firebase Auth: Google, or email + password (with a verification email). The web config below is public
 * by design (security comes from Firebase's rules). Admins: a Firestore document vlife_admins/{lowercase email} that
 * only that verified user can read (firestore.rules); no admin address is in this code. Playing without an account
 * stays possible.
 */
const env = import.meta.env as Record<string, string | undefined>;
const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyAYUh_lozj_7CAOPA9a4wllyPnb-spzx44',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'doi-viet-3d.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'doi-viet-3d',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:96785615385:web:75d2e18fcfa43913027888',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'doi-viet-3d.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '96785615385',
};
/** False until the Firebase project's web config is filled in (then accounts work; until then only guest play). */
export const accountsReady = !!(config.apiKey && config.projectId && config.appId);
let auth: Auth | null = null; let db: Firestore | null = null;
if (accountsReady) {
  const app = initializeApp(config);
  auth = getAuth(app); auth.languageCode = 'vi';
  db = getFirestore(app);
  void setPersistence(auth, browserLocalPersistence);
}

type AccountState = { ready: boolean; user: User | null; name: string; admin: boolean; guest: boolean };
let st: AccountState = { ready: !accountsReady, user: null, name: '', admin: false, guest: localStorage.getItem('doi-viet-guest') === '1' };
const subs = new Set<() => void>();
const set = (p: Partial<AccountState>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const accountStore = { get: () => st, subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; } };
export function useAccount<T>(sel: (s: AccountState) => T): T { return useSyncExternalStore(accountStore.subscribe, () => sel(st)); }

const displayName = (u: User) => u.displayName || u.email?.split('@')[0] || 'Người chơi';
async function apply(user: User | null) {
  if (!user) { set({ ready: true, user: null, name: '', admin: false }); setAdmin(false); return; }
  const name = displayName(user);
  savePlayerName(name); // the account's name is the multiplayer nickname
  localStorage.removeItem('doi-viet-guest');
  set({ ready: true, user, name, guest: false });
  let admin = false;
  try { if (db && user.email && user.emailVerified) admin = (await getDoc(doc(db, 'vlife_admins', user.email.toLowerCase()))).exists(); } catch { admin = false; }
  set({ admin }); setAdmin(admin);
}
if (auth) onAuthStateChanged(auth, (u) => void apply(u));

/** Firebase errors in Vietnamese. */
export function viError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const m: Record<string, string> = {
    'auth/invalid-credential': 'Sai email hoặc mật khẩu.', 'auth/wrong-password': 'Sai email hoặc mật khẩu.', 'auth/user-not-found': 'Sai email hoặc mật khẩu.',
    'auth/invalid-email': 'Địa chỉ email không hợp lệ.', 'auth/email-already-in-use': 'Email này đã có tài khoản. Bạn đăng nhập hoặc dùng "Quên mật khẩu".',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự (nên có cả chữ và số).', 'auth/too-many-requests': 'Bạn thử nhiều lần quá, đợi một chút rồi thử lại nhé.',
    'auth/network-request-failed': 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
    'auth/operation-not-allowed': 'Cách đăng nhập này chưa được bật trên máy chủ.', 'auth/unauthorized-domain': 'Trang web này chưa được phép đăng nhập (cần thêm vào Authorized domains của Firebase).',
    'auth/account-exists-with-different-credential': 'Email này đã đăng ký bằng cách khác (email + mật khẩu). Bạn đăng nhập bằng mật khẩu nhé.',
  };
  return m[code] ?? `Có lỗi: ${(e as { message?: string })?.message ?? String(e)}`;
}
const need = () => { if (!auth) throw new Error('Đăng nhập chưa được cài đặt xong trên máy chủ. Bạn chơi không cần tài khoản trước nhé.'); return auth; };
const wrap = async <T,>(f: () => Promise<T>) => { try { return await f(); } catch (e) { throw new Error((e as Error).message?.startsWith('Đăng nhập chưa') ? (e as Error).message : viError(e)); } };

export async function signIn(email: string, password: string) {
  const r = await wrap(() => signInWithEmailAndPassword(need(), email.trim(), password));
  if (!r.user.emailVerified) {
    await sendEmailVerification(r.user).catch(() => undefined);
    await fbSignOut(need());
    throw new Error('Email chưa được xác nhận. Mình vừa gửi lại thư xác nhận, mở Gmail bấm link rồi đăng nhập lại nhé.');
  }
}
/** Creates the account and sends the verification email; returns true (the user must confirm before logging in). */
export async function signUp(email: string, password: string, name: string) {
  await wrap(async () => {
    const r = await createUserWithEmailAndPassword(need(), email.trim(), password);
    await updateProfile(r.user, { displayName: name.trim() });
    await sendEmailVerification(r.user);
    await fbSignOut(need());
  });
  return true;
}
export async function signInGoogle() {
  await wrap(async () => {
    const provider = new GoogleAuthProvider();
    const mobile = window.matchMedia?.('(pointer: coarse)').matches;
    if (mobile) await signInWithRedirect(need(), provider); else await signInWithPopup(need(), provider);
  });
}
export async function resetPassword(email: string) { await wrap(() => sendPasswordResetEmail(need(), email.trim())); }
export async function signOut() { if (auth) await fbSignOut(auth); }
export function playAsGuest() { localStorage.setItem('doi-viet-guest', '1'); set({ guest: true }); }
