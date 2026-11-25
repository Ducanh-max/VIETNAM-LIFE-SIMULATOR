import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { avatarAnim } from '../Avatar';
import { npcOutfit } from '../character/outfit';
import { canWalk, type Point } from '../geo';
import { isCar, leaveSeat, net, onNet, requestSeat, sample, seatCount, setIdentity, type NetPose, type NetVehicle, type Remote, type VehicleKind } from '../net';
import { taxi } from '../ride';
import { bike, game, player } from '../state';
import { loadPlayerName } from '../../ui/player';
import { CAR_DRIVER, DenCarModel } from './DenCar';
import { NameTag, Person, SIT_HIP, type PersonAnim } from './Person';
import { PILLION, ScooterModel, SEAT } from './Scooter';

/*
 * The other players in the room: their chibi (with their own outfit and name), the vehicle they drive with
 * whoever sits in it, plus this player's side of the sync — broadcasting its pose ~12 times a second,
 * handing out seats in the vehicle it drives, and riding along in a friend's vehicle (F to get on/off).
 */
/** Hip point of each seat in vehicle space: scooter = driver + 1 pillion, car = driver, front passenger, 3 rear. */
export function seatPos(kind: VehicleKind, i: number): THREE.Vector3 {
  if (!isCar(kind)) return i === 0 ? new THREE.Vector3(0, SEAT.y, SEAT.z + 0.2) : PILLION.clone();
  return [CAR_DRIVER.clone(), new THREE.Vector3(-0.38, 0.56, 0.35), new THREE.Vector3(0.42, 0.56, -0.62), new THREE.Vector3(0, 0.56, -0.62), new THREE.Vector3(-0.42, 0.56, -0.62)][i] ?? CAR_DRIVER.clone();
}
const pose = (v: NetVehicle) => ({ position: new THREE.Vector3(v.x, v.y, v.z), heading: v.h, steer: v.steer, lean: v.lean, wheel: v.wheel, riding: true });

/** Animation for a remote player on foot, from its state name. */
function footAnim(a: string, s: number): PersonAnim['mode'] {
  if (a === 'WALK' || a === 'RUN' || a === 'SPRINT') return 'walk';
  if (a === 'SITTING' || a === 'SIT_DOWN' || a === 'INTERACTING') return 'sit';
  if (a === 'EATING' || a === 'DRINKING') return 'eat';
  if (a === 'USING_PHONE') return 'phone';
  if (a === 'TALKING') return 'talk';
  if (a === 'WAVING') return 'wave';
  return s > 0.3 ? 'walk' : 'stand';
}

function RemoteVehicle({ v, driver }: { v: NetVehicle; driver: Remote }) {
  const p = useMemo(() => pose(v), []); // eslint-disable-line react-hooks/exhaustive-deps
  // the models read this pose object every frame; keep it on the interpolated vehicle
  useFrame(() => { const s = driver.shown?.v; if (s) { p.position.set(s.x, s.y, s.z); p.heading = s.h; p.steer = s.steer; p.lean = s.lean; p.wheel = s.wheel; } });
  const people = v.seats.map((id, i) => ({ id, i })).filter((s) => s.id && s.id !== net.selfId);
  const seated = people.map(({ id, i }) => {
    const r = id === driver.id ? driver : net.remotes.get(id!);
    if (!r) return null;
    const sp = seatPos(v.kind, i);
    const anim: PersonAnim = { mode: i === 0 ? (isCar(v.kind) ? 'drive' : 'ride') : 'sit', speed: 0 };
    return <group key={id ?? i} position={[sp.x, sp.y - SIT_HIP, sp.z]}>
      <Person anim={anim} outfit={r.outfit ?? npcOutfit('youngMan', 7)} seed={i} />
      <NameTag name={r.name} y={1.75} color="#7cc4ff" />
    </group>;
  });
  return isCar(v.kind)
    ? <DenCarModel pose={p} plain={v.kind === 'rentcar'} color={v.color}>{seated}</DenCarModel>
    : <ScooterModel pose={p} livery={v.kind === 'denbike' ? 'den' : v.kind === 'rentbike' ? 'rent' : 'shop'} color={v.color}>{seated}</ScooterModel>;
}

function RemoteWalker({ r }: { r: Remote }) {
  const g = useRef<THREE.Group>(null);
  const anim = useRef<PersonAnim>({ mode: 'stand', speed: 0 });
  useFrame(() => {
    const s = r.shown; if (!g.current) return;
    g.current.visible = !!s && !s.v && !s.ride;
    if (!s) return;
    g.current.position.set(s.x, s.y, s.z); g.current.rotation.set(0, s.yaw, 0);
    anim.current.mode = footAnim(s.a, s.s); anim.current.speed = s.s;
  });
  return <group ref={g}>
    <Person anim={anim.current} outfit={r.outfit ?? npcOutfit('youngMan', 7)} seed={3} />
    <NameTag name={r.name} y={1.85} color="#7cc4ff" />
  </group>;
}

export function Multiplayer() {
  const [, force] = useState(0);
  useEffect(() => onNet(() => force((n) => n + 1)), []);
  const acc = useRef(0);
  const lastOutfit = useRef<unknown>(null);
  const [vehicles, setVehicles] = useState<string>('');
  useFrame((_, delta) => {
    if (!net.send) { if (net.riding) { net.riding = null; taxi.passenger = false; } return; }
    const now = performance.now();
    // interpolated poses of everyone else
    let vkey = '';
    net.remotes.forEach((r) => { r.shown = sample(r, now); if (r.shown?.v) vkey += `${r.id}:${r.shown.v.kind}:${r.shown.v.seats.join(',')};`; });
    if (vkey !== vehicles) setVehicles(vkey);
    // identity (name + the outfit/uniform being worn)
    if (avatarAnim.outfit && avatarAnim.outfit !== lastOutfit.current) { lastOutfit.current = avatarAnim.outfit; setIdentity(loadPlayerName() || 'Người chơi', avatarAnim.outfit); }
    // seats of the vehicle I drive
    if (bike.riding && !taxi.passenger) {
      const n = seatCount(bike.kind);
      if (net.seats.length !== n) net.seats = Array.from({ length: n }, (_, i) => (i === 0 ? net.selfId : net.seats[i] ?? null));
    } else if (net.seats.length) net.seats = [];
    // riding in a friend's vehicle
    if (net.riding) {
      const host = net.remotes.get(net.riding.host);
      const hv = host?.shown?.v;
      // just got on: the driver's updates take a moment to list us in the seat
      const fresh = performance.now() - (net.riding.since ?? 0) < 2500;
      if (!fresh && (!hv || !hv.seats.includes(net.selfId))) {
        // the driver got off or we lost them: step off beside the vehicle
        const at = hv ?? host?.shown;
        leaveSeat(); taxi.passenger = false; taxi.seatOffset = null;
        if (at) for (const side of [1, -1]) { const h = 'h' in at ? at.h : at.yaw; const p: Point = [at.x + Math.cos(h) * 1.6 * side, at.z - Math.sin(h) * 1.6 * side]; if (canWalk(p)) { player.teleport?.(p[0], p[1]); break; } }
        game.toast('Bạn đã xuống xe.');
      } else if (hv) {
        taxi.passenger = true; taxi.vehicle = isCar(hv.kind) ? 'car' : 'bike';
        taxi.position.set(hv.x, hv.y, hv.z); taxi.heading = hv.h; taxi.lean = hv.lean; taxi.speed = Math.abs(host!.shown!.s);
        taxi.seatOffset = isCar(hv.kind) ? seatPos(hv.kind, net.riding.seat) : null;
        game.offer({ id: 'leave-friend', text: `Xuống xe của ${host!.name}`, key: 'F', priority: 9, run: () => {
          const p: Point = [hv.x + Math.cos(hv.h) * 1.6, hv.z - Math.sin(hv.h) * 1.6];
          leaveSeat(); taxi.passenger = false; taxi.seatOffset = null; player.teleport?.(p[0], p[1]);
        } });
      }
    } else if (!bike.riding && !player.seat && !game.get().ride) {
      // offer a seat in a friend's vehicle standing nearby
      let best: Remote | null = null; let bd = Infinity;
      net.remotes.forEach((r) => { const v = r.shown?.v; if (!v) return; const d = Math.hypot(v.x - player.position.x, v.z - player.position.z); if (d < (isCar(v.kind) ? 3.6 : 2.4) && d < bd) { bd = d; best = r; } });
      if (best) {
        const r = best as Remote; const v = r.shown!.v!;
        const free = v.seats.filter((s, i) => i > 0 && !s).length;
        game.offer(free ? { id: 'board-friend', text: `Lên xe của ${r.name} (${free} chỗ trống)`, key: 'F', priority: 9, run: () => {
          void requestSeat(r.id).then((res) => { if (res.ok) { net.riding = { host: r.id, seat: res.seat, since: performance.now() }; game.toast(`Đã lên xe của ${r.name}.`); } else game.toast(res.reason ?? 'Không lên được xe.'); });
        } } : { id: 'board-full', text: `Xe của ${r.name} đã đủ chỗ`, key: null, priority: 5 });
      }
    }
    // broadcast my pose ~12×/s
    acc.current += delta;
    if (acc.current < 1 / 12) return;
    acc.current = 0;
    const a = player.avatar; if (!a) return;
    const wp = a.getWorldPosition(new THREE.Vector3());
    const mine: NetPose = {
      t: 0, x: wp.x, y: wp.y, z: wp.z, yaw: a.rotation.y, a: avatarAnim.state, s: bike.riding ? Math.abs(bike.speed) : player.position.distanceTo(prevPos.current) * 12, e: avatarAnim.expr,
      v: bike.riding && !taxi.passenger ? { kind: bike.kind, x: bike.position.x, y: bike.position.y, z: bike.position.z, h: bike.heading, steer: bike.steer, lean: bike.lean, wheel: bike.wheel, color: bike.color, seats: net.seats } : null,
      ride: net.riding ? { host: net.riding.host, seat: net.riding.seat } : null,
    };
    prevPos.current.copy(player.position);
    net.send.pose(mine);
  });
  const prevPos = useRef(new THREE.Vector3());
  if (!net.room) return null;
  const list = [...net.remotes.values()];
  return <group>
    {list.map((r) => <RemoteWalker key={r.id} r={r} />)}
    {bike.riding && net.seats.some((s, i) => i > 0 && s) && <MyPassengers seats={net.seats.join(',')} />}
    {list.filter((r) => r.shown?.v).map((r) => <RemoteVehicle key={`v${r.id}:${r.shown!.v!.kind}`} v={r.shown!.v!} driver={r} />)}
  </group>;
}


/** Friends sitting in the vehicle I drive (their own avatars are drawn by them; this is how I see them). */
function MyPassengers({ seats }: { seats: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { if (g.current) { g.current.position.copy(bike.position); g.current.rotation.set(0, bike.heading, isCar(bike.kind) ? 0 : bike.lean, 'YXZ'); } });
  return <group ref={g}>
    {seats.split(',').map((id, i) => {
      if (i === 0 || !id) return null;
      const r = net.remotes.get(id); if (!r) return null;
      const sp = seatPos(bike.kind, i);
      return <group key={id} position={[sp.x, sp.y - SIT_HIP, sp.z]}>
        <Person anim={{ mode: 'sit', speed: 0 }} outfit={r.outfit ?? npcOutfit('youngMan', 7)} seed={i} />
        <NameTag name={r.name} y={1.75} color="#7cc4ff" />
      </group>;
    })}
  </group>;
}
