import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { npcOutfit, type NpcRole } from '../character/outfit';
import { GROUND_HEIGHT, sampleRing, streetRing, type Point } from '../geo';
import { player } from '../state';
import { Person, type PersonAnim } from './Person';

/*
 * Hà Nội residents strolling, jogging and sightseeing round Hồ Gươm on the lakeside promenade. Each walks
 * a lane along the path at their own pace and direction, steps aside for the player and for each other,
 * pauses now and then to look at the lake or check their phone, and is hidden and not updated when far
 * from the player.
 */
const ROLES: NpcRole[] = ['youngMan', 'youngWoman', 'student', 'office', 'elder', 'tourist', 'jogger', 'shopper', 'middleAged', 'youngWoman', 'elder', 'tourist', 'student', 'youngMan', 'jogger', 'shopper'];
const COUNT = ROLES.length;

type Walker = { s: number; dir: 1 | -1; speed: number; lane: number; pause: number; side: number; anim: PersonAnim };

export function Pedestrians() {
  const path = useMemo(() => {
    const pts = sampleRing(streetRing(6.2), 2).map((p) => p.point);
    const cum = [0];
    for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    return { pts, cum, total: cum[cum.length - 1] };
  }, []);
  const walkers = useMemo<Walker[]>(() => ROLES.map((role, i) => ({
    s: (i / COUNT) * path.total + Math.random() * 20, dir: i % 3 === 0 ? -1 : 1,
    speed: role === 'jogger' ? 2.6 : role === 'elder' ? 0.8 : 1.05 + Math.random() * 0.4,
    lane: (Math.random() - 0.5) * 2.4, pause: 0, side: 0, anim: { mode: 'walk', speed: 1.2 },
  })), [path]);
  const outfits = useMemo(() => ROLES.map((role, i) => npcOutfit(role, 100 + i * 13)), []);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const at = (s: number): { p: Point; dir: number; n: Point } => {
    const { pts, cum, total } = path;
    const t = ((s % total) + total) % total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= t) lo = mid; else hi = mid; }
    const a = pts[lo % pts.length], b = pts[(lo + 1) % pts.length];
    const k = (t - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
    const dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1;
    return { p: [a[0] + dx * k, a[1] + dz * k], dir: Math.atan2(dx, dz), n: [-dz / l, dx / l] };
  };
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    walkers.forEach((w, i) => {
      const g = groups.current[i]; if (!g) return;
      const here = at(w.s);
      const far = Math.hypot(here.p[0] - player.position.x, here.p[1] - player.position.z) > 75;
      g.visible = !far;
      if (far) { w.s += w.dir * w.speed * dt; return; } // keep moving, skip the rest
      // occasional pause to look at the lake / phone
      if (w.pause > 0) { w.pause -= dt; w.anim.mode = 'stand'; w.anim.speed = 0; }
      else {
        if (Math.random() < dt * 0.02) w.pause = 2 + Math.random() * 4;
        w.s += w.dir * w.speed * dt;
        w.anim.mode = 'walk'; w.anim.speed = w.speed * 1.3;
      }
      // avoidance: side-step away from the player and from walkers just ahead
      let push = 0;
      const px = player.position.x, pz = player.position.z;
      const dP = Math.hypot(here.p[0] - px, here.p[1] - pz);
      if (dP < 2.2) push += Math.sign((px - here.p[0]) * here.n[0] + (pz - here.p[1]) * here.n[1]) * -(2.2 - dP);
      for (let j = 0; j < walkers.length; j++) {
        if (j === i) continue;
        const ds = Math.abs(walkers[j].s - w.s);
        if (ds < 1.6 && Math.abs(walkers[j].lane + walkers[j].side - w.lane - w.side) < 0.8) push += (w.lane + w.side >= walkers[j].lane + walkers[j].side ? 1 : -1) * 0.6;
      }
      w.side = THREE.MathUtils.damp(w.side, THREE.MathUtils.clamp(push, -1.6, 1.6), 3, dt);
      const off = w.lane + w.side;
      const now = at(w.s);
      g.position.set(now.p[0] + now.n[0] * off, GROUND_HEIGHT, now.p[1] + now.n[1] * off);
      const heading = w.pause > 0 ? now.dir + Math.PI / 2 * (w.dir > 0 ? -1 : 1) : now.dir + (w.dir < 0 ? Math.PI : 0);
      let diff = heading - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * (1 - Math.exp(-6 * dt));
    });
  });
  return <group>
    {walkers.map((w, i) => <group key={i} ref={(g) => { groups.current[i] = g; }}>
      <Person anim={w.anim} outfit={outfits[i]} seed={i} />
    </group>)}
  </group>;
}
