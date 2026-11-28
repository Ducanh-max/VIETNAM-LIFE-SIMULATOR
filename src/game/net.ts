import { joinRoom, type Room } from 'trystero';
import * as THREE from 'three';
import type { Outfit } from './character/outfit';
import { commitRoomPayment, formatVnd, game, markRoomPaymentSent, pushMessage, type RoomPayment } from './state';
import { PRIVATE_BUILD } from './privateBuild';

/*
 * Playing together: up to 10 browsers in a room, connected peer-to-peer over WebRTC with trystero (the
 * signalling goes through public Nostr relays; no game server, so it works from a static Vercel site).
 * Each player broadcasts its pose ~12 times a second; positions are interpolated on the receiving side.
 * Wallet, needs, jobs and orders stay local. Private builds can test peer-to-peer virtual transfers; they are not a server ledger. Vehicles: the driver is the authority over its seats —
 * passengers ask for a seat, the driver grants the first free one (scooter 2, car 5 incl. the driver).
 */
export const APP_ID = 'doi-viet-hanoi-3d';
export const MAX_PLAYERS = 10;
export type VehicleKind = 'wave' | 'denbike' | 'dencar' | 'rentbike' | 'rentcar';
export const isCar = (k: VehicleKind | null | undefined) => k === 'dencar' || k === 'rentcar';
export const seatCount = (k: VehicleKind) => (isCar(k) ? 5 : 2);

export type NetVehicle = { kind: VehicleKind; x: number; y: number; z: number; h: number; steer: number; lean: number; wheel: number; color: string; seats: (string | null)[] };
/** What each player sends: `a` = animation hint ('walk' speed in `s`, 'sit', 'eat', 'phone', 'ride', 'drive', 'passenger'). */
export type NetPose = { t: number; x: number; y: number; z: number; yaw: number; a: string; s: number; e: string; v: NetVehicle | null; ride: { host: string; seat: number } | null };
export type Remote = { id: string; name: string; outfit: Outfit | null; poses: NetPose[]; last: number; shown: NetPose | null };

type PayPacket = { id: string; room: string; from: string; to: string; amount: number; note: string };
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function getWalletId(): string {
  const key = 'doi-viet-room-wallet-id-v1';
  const existing = localStorage.getItem(key);
  if (isUuid(existing)) return existing;
  const id = crypto.randomUUID(); localStorage.setItem(key, id); return id;
}
const walletId = PRIVATE_BUILD ? getWalletId() : '';
type Status = 'off' | 'connecting' | 'online' | 'full' | 'error';
export const net = {
  room: null as Room | null,
  code: '',
  status: 'off' as Status,
  message: '',
  selfId: '',
  remotes: new Map<string, Remote>(),
  payPeers: new Map<string, string>(),
  paySend: null as null | { transfer: (p: PayPacket, peer: string) => void; ack: (p: PayPacket, peer: string) => void },

  /** Seat this player holds in someone else's vehicle. */
  riding: null as null | { host: string; seat: number; since?: number },
  /** Seats of the vehicle this player drives (index 0 = driver = me). */
  seats: [] as (string | null)[],
  listeners: new Set<() => void>(),
  send: null as null | { pose: (p: NetPose) => void; hello: (h: { name: string; outfit: Outfit }, to?: string) => void; seatReq: (r: { seat: number | null; leave?: boolean }, to: string) => void; seatRes: (r: { ok: boolean; seat: number; reason?: string }, to: string) => void; chat: (m: string) => void },
  chat: [] as { from: string; text: string; at: number }[],
  pendingSeat: null as null | ((r: { ok: boolean; seat: number; reason?: string }) => void),
};
const notify = () => {
  if (net.status === 'online') net.message = net.remotes.size ? `Đã vào phòng ${net.code} · ${net.remotes.size + 1}/${MAX_PLAYERS} người` : `Phòng ${net.code} đã mở. Gửi mã hoặc link cho bạn bè (chưa có ai khác).`;
  net.listeners.forEach((f) => f());
};
export function onNet(f: () => void) { net.listeners.add(f); return () => { net.listeners.delete(f); }; }

export function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

let identity: { name: string; outfit: Outfit } = { name: 'Người chơi', outfit: null as unknown as Outfit };
export function setIdentity(name: string, outfit: Outfit) {
  const changed = identity.name !== name || JSON.stringify(identity.outfit) !== JSON.stringify(outfit);
  identity = { name, outfit };
  if (changed && net.send) net.send.hello(identity);
}

/** Join (or create) a room by code. Resolves to the status after the full-room check. */
export async function joinGame(code: string) {
  code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code) return;
  // already in (or joining) this room: the welcome screen and the invite-link effect may both ask
  if (net.code === code && (net.status === 'connecting' || net.status === 'online')) return;
  net.code = code; net.status = 'connecting';
  await leaveGame(true);
  net.code = code; net.status = 'connecting'; net.message = 'Đang tìm bạn bè trong phòng…'; notify();
  let room: Room;
  try { room = joinRoom({ appId: APP_ID }, code); } catch (e) { net.status = 'error'; net.message = `Không kết nối được: ${(e as Error).message}`; notify(); return; }
  net.room = room;
  const pose = room.makeAction<NetPose>('pose');
  const hello = room.makeAction<{ name: string; outfit: Outfit }>('hello');
  const seatReq = room.makeAction<{ seat: number | null; leave?: boolean }>('seatReq');
  const seatRes = room.makeAction<{ ok: boolean; seat: number; reason?: string }>('seatRes');
  const chat = room.makeAction<string>('chat');
  const payHello = room.makeAction<string>('payHello');
  const payTransfer = room.makeAction<PayPacket>('payTransfer');
  const payAck = room.makeAction<PayPacket>('payAck');
  if (PRIVATE_BUILD) {
    net.paySend = {
      transfer: (p, peer) => { void Promise.resolve(payTransfer.send(p, { target: peer })).catch(() => { /* stays pending */ }); },
      ack: (p, peer) => { void Promise.resolve(payAck.send(p, { target: peer })).catch(() => { /* retry will receive another ack */ }); },
    };
    payHello.onMessage((id, { peerId }) => {
      if (net.room !== room || !isUuid(id) || id === walletId) return;
      const previous = net.payPeers.get(peerId);
      if (previous && previous !== id) return;
      if (!previous) {
        net.payPeers.set(peerId, id);
        void Promise.resolve(payHello.send(walletId, { target: peerId })).catch(() => {});
        notify();
      }
    });
    const validPacket = (p: PayPacket, peer: string) => net.room === room && p && isUuid(p.id) && p.room === code &&
      isUuid(p.from) && isUuid(p.to) && p.from !== p.to && Number.isSafeInteger(p.amount) && p.amount > 0 &&
      p.amount <= 1_000_000_000 && typeof p.note === 'string' && p.note.length <= 100 && net.payPeers.has(peer);
    const matches = (r: RoomPayment, p: PayPacket) => r.id === p.id && r.room === p.room && r.from === p.from && r.to === p.to && r.amount === p.amount && r.note === p.note;
    payTransfer.onMessage((p, { peerId }) => {
      if (!validPacket(p, peerId) || p.to !== walletId || p.from !== net.payPeers.get(peerId)) return;
      const old = game.get().roomPayments.find((r) => r.id === p.id);
      if (old) {
        if (old.status === 'received' && matches(old, p)) net.paySend?.ack(p, peerId);
        return;
      }
      const name = net.remotes.get(peerId)?.name ?? 'Bạn cùng phòng';
      try {
        if (!commitRoomPayment({ ...p, peerName: name, at: Date.now(), status: 'received' })) return;
      } catch { return; } // do not acknowledge a credit that could not be persisted
      net.paySend?.ack(p, peerId);
      game.toast('Đời Việt Pay: nhận ' + formatVnd(p.amount) + ' từ ' + name);
      pushMessage('Đời Việt Pay', 'Bạn nhận ' + formatVnd(p.amount) + ' từ ' + name + (p.note ? ' · ' + p.note : ''));
    });
    payAck.onMessage((p, { peerId }) => {
      if (!validPacket(p, peerId) || p.from !== walletId || p.to !== net.payPeers.get(peerId)) return;
      const old = game.get().roomPayments.find((r) => r.id === p.id);
      if (!old || old.status !== 'pending' || !matches(old, p)) return;
      try {
        if (markRoomPaymentSent(p.id)) game.toast('Đã chuyển ' + formatVnd(p.amount) + ' cho ' + old.peerName);
      } catch { /* stays pending for retry */ }
    });
  }
  net.send = {
    pose: (p) => { void pose.send(p); },
    hello: (h, to) => { void hello.send(h, to ? { target: to } : undefined); },
    seatReq: (r, to) => { void seatReq.send(r, { target: to }); },
    seatRes: (r, to) => { void seatRes.send(r, { target: to }); },
    chat: (m) => { void chat.send(m.slice(0, 160)); net.chat.push({ from: identity.name, text: m.slice(0, 160), at: Date.now() }); notify(); },
  };
  const remote = (id: string) => { let r = net.remotes.get(id); if (!r) { r = { id, name: '…', outfit: null, poses: [], last: performance.now(), shown: null }; net.remotes.set(id, r); } return r; };
  room.onPeerJoin(({ peerId }) => {
    remote(peerId);
    if (PRIVATE_BUILD) void Promise.resolve(payHello.send(walletId, { target: peerId })).catch(() => {});
    if (identity.outfit) net.send?.hello(identity, peerId);
    notify();
  });
  room.onPeerLeave(({ peerId }) => {
    net.remotes.delete(peerId); net.payPeers.delete(peerId);
    const i = net.seats.indexOf(peerId); if (i > 0) net.seats[i] = null;
    if (net.riding?.host === peerId) net.riding = null;
    notify();
  });
  hello.onMessage((h, { peerId }) => { const r = remote(peerId); r.name = String(h.name).slice(0, 24); r.outfit = h.outfit; notify(); });
  pose.onMessage((p, { peerId }) => {
    const r = remote(peerId); r.last = performance.now();
    r.poses.push({ ...p, t: performance.now() });
    if (r.poses.length > 6) r.poses.shift();
  });
  // the driver hands out seats
  seatReq.onMessage((req, { peerId }) => {
    if (req.leave) { const i = net.seats.indexOf(peerId); if (i > 0) net.seats[i] = null; return; }
    if (!net.seats.length) { net.send?.seatRes({ ok: false, seat: -1, reason: 'Xe không còn người lái.' }, peerId); return; }
    const already = net.seats.indexOf(peerId);
    if (already > 0) { net.send?.seatRes({ ok: true, seat: already }, peerId); return; }
    const free = net.seats.findIndex((s, i) => i > 0 && !s);
    if (free < 0) { net.send?.seatRes({ ok: false, seat: -1, reason: 'Xe đã đủ chỗ.' }, peerId); return; }
    net.seats[free] = peerId;
    net.send?.seatRes({ ok: true, seat: free }, peerId);
  });
  seatRes.onMessage((res) => { net.pendingSeat?.(res); net.pendingSeat = null; });
  chat.onMessage((m, { peerId }) => { net.chat.push({ from: net.remotes.get(peerId)?.name ?? '?', text: String(m).slice(0, 160), at: Date.now() }); if (net.chat.length > 30) net.chat.shift(); notify(); });
  room.onError?.(() => { if (net.status === 'connecting') { net.message = 'Lỗi kết nối, đang thử lại…'; notify(); } });
  try { const self = await room.getSelf(); net.selfId = self.peerId; } catch { /* ignore */ }
  // give it a moment to discover who is already here, then enforce the 10-player limit
  await new Promise((r) => setTimeout(r, 4000));
  if (net.room !== room) return;
  const others = Object.keys(room.getPeers()).length;
  if (others >= MAX_PLAYERS) {
    await leaveGame();
    net.status = 'full'; net.message = `Phòng ${code} đã đủ ${MAX_PLAYERS} người. Bạn đang chơi một mình.`; notify();
    return;
  }
  net.status = 'online';
  net.message = others ? `Đã vào phòng ${code} · ${others + 1}/${MAX_PLAYERS} người` : `Phòng ${code} đã mở. Gửi mã hoặc link cho bạn bè (chưa có ai khác).`;
  notify();
}
export async function leaveGame(keepCode = false) {
  const r = net.room;
  net.room = null; net.send = null; net.paySend = null; net.payPeers.clear(); net.remotes.clear(); net.riding = null; net.seats = [];
  if (!keepCode) { net.status = 'off'; net.message = ''; net.code = ''; }
  notify();
  if (r) { try { await r.leave(); } catch { /* ignore */ } }
}

/** Only for trusted private rooms. Peer identities and balances are not server authenticated. */
export function sendRoomPayment(peerId: string, amount: number, note: string): string | null {
  if (!PRIVATE_BUILD || !net.room || net.status !== 'online' || !net.paySend) return 'Bạn chưa kết nối phòng chơi.';
  const target = net.payPeers.get(peerId);
  const peer = net.remotes.get(peerId);
  if (!peer || !target || target === walletId) return 'Người nhận không còn trong phòng hoặc chưa cập nhật game.';
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) return 'Số tiền không hợp lệ.';
  if (amount > game.get().money) return 'Số dư không đủ.';
  const packet: PayPacket = { id: crypto.randomUUID(), room: net.code, from: walletId, to: target, amount, note: note.trim().slice(0, 100) };
  try {
    if (!commitRoomPayment({ ...packet, peerName: peer.name, at: Date.now(), status: 'pending' })) return 'Không thể ghi giao dịch.';
  } catch { return 'Không thể lưu ví trên trình duyệt.'; }
  net.paySend.transfer(packet, peerId);
  return null;
}
export function retryRoomPayment(id: string): string | null {
  if (!PRIVATE_BUILD || !net.room || net.status !== 'online' || !net.paySend) return 'Bạn chưa kết nối phòng chơi.';
  const p = game.get().roomPayments.find((x) => x.id === id && x.status === 'pending');
  if (!p || p.room !== net.code || p.from !== walletId) return 'Hãy vào lại đúng phòng của giao dịch.';
  const peer = [...net.payPeers].find(([key, v]) => v === p.to && net.remotes.has(key))?.[0];
  if (!peer) return 'Người nhận chưa kết nối lại.';
  const { room, from, to, amount, note } = p;
  net.paySend.transfer({ id, room, from, to, amount, note }, peer);
  return null;
}

/** Ask a driver for a free seat. */
export function requestSeat(host: string): Promise<{ ok: boolean; seat: number; reason?: string }> {
  return new Promise((resolve) => {
    if (!net.send) { resolve({ ok: false, seat: -1, reason: 'Chưa vào phòng.' }); return; }
    net.pendingSeat = resolve;
    net.send.seatReq({ seat: null }, host);
    setTimeout(() => { if (net.pendingSeat === resolve) { net.pendingSeat = null; resolve({ ok: false, seat: -1, reason: 'Không nhận được trả lời từ người lái.' }); } }, 3000);
  });
}
export function leaveSeat() {
  if (net.riding && net.send) net.send.seatReq({ seat: null, leave: true }, net.riding.host);
  net.riding = null; notify();
}

/** Interpolated pose of a remote player ~120 ms in the past (smooth even at 12 updates/s). */
const DELAY = 120;
export function sample(r: Remote, now = performance.now()): NetPose | null {
  const ps = r.poses; if (!ps.length) return null;
  const t = now - DELAY;
  if (ps.length === 1 || t <= ps[0].t) return ps[0];
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i], b = ps[i + 1];
    if (t <= b.t) {
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      const lerpA = (x: number, y: number) => { let d = y - x; d = Math.atan2(Math.sin(d), Math.cos(d)); return x + d * k; };
      const v = a.v && b.v ? { ...b.v, x: THREE.MathUtils.lerp(a.v.x, b.v.x, k), y: THREE.MathUtils.lerp(a.v.y, b.v.y, k), z: THREE.MathUtils.lerp(a.v.z, b.v.z, k), h: lerpA(a.v.h, b.v.h), steer: THREE.MathUtils.lerp(a.v.steer, b.v.steer, k), lean: THREE.MathUtils.lerp(a.v.lean, b.v.lean, k), wheel: THREE.MathUtils.lerp(a.v.wheel, b.v.wheel, k) } : b.v;
      return { ...b, x: THREE.MathUtils.lerp(a.x, b.x, k), y: THREE.MathUtils.lerp(a.y, b.y, k), z: THREE.MathUtils.lerp(a.z, b.z, k), yaw: lerpA(a.yaw, b.yaw), s: THREE.MathUtils.lerp(a.s, b.s, k), v };
    }
  }
  return ps[ps.length - 1];
}

if (import.meta.env.DEV) (window as unknown as { __net?: unknown }).__net = { net, joinGame, leaveGame, requestSeat };
