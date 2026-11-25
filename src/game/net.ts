import { joinRoom, type Room } from 'trystero';
import * as THREE from 'three';
import type { Outfit } from './character/outfit';

/*
 * Playing together: up to 10 browsers in a room, connected peer-to-peer over WebRTC with trystero (the
 * signalling goes through public Nostr relays; no game server, so it works from a static Vercel site).
 * Each player broadcasts its pose ~12 times a second; positions are interpolated on the receiving side.
 * Wallet, needs, jobs and orders stay local. Vehicles: the driver is the authority over its seats —
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

type Status = 'off' | 'connecting' | 'online' | 'full' | 'error';
export const net = {
  room: null as Room | null,
  code: '',
  status: 'off' as Status,
  message: '',
  selfId: '',
  remotes: new Map<string, Remote>(),
  /** Seat this player holds in someone else's vehicle. */
  riding: null as null | { host: string; seat: number },
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
  await leaveGame();
  code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code) return;
  net.code = code; net.status = 'connecting'; net.message = 'Đang tìm bạn bè trong phòng…'; notify();
  let room: Room;
  try { room = joinRoom({ appId: APP_ID }, code); } catch (e) { net.status = 'error'; net.message = `Không kết nối được: ${(e as Error).message}`; notify(); return; }
  net.room = room;
  const pose = room.makeAction<NetPose>('pose');
  const hello = room.makeAction<{ name: string; outfit: Outfit }>('hello');
  const seatReq = room.makeAction<{ seat: number | null; leave?: boolean }>('seatReq');
  const seatRes = room.makeAction<{ ok: boolean; seat: number; reason?: string }>('seatRes');
  const chat = room.makeAction<string>('chat');
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
    if (identity.outfit) net.send?.hello(identity, peerId);
    notify();
  });
  room.onPeerLeave(({ peerId }) => {
    net.remotes.delete(peerId);
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
export async function leaveGame() {
  const r = net.room;
  net.room = null; net.send = null; net.remotes.clear(); net.riding = null; net.seats = []; net.status = 'off'; net.message = ''; net.code = '';
  notify();
  if (r) { try { await r.leave(); } catch { /* ignore */ } }
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
