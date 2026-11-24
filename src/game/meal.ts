import * as THREE from 'three';
import { PLAYER_DIMENSIONS } from './character/chibiGeometry';
import type { MenuId, Order } from './state';

/*
 * Shared layout of a served table and the scripted eating/drinking motions, so the restaurant
 * (which draws the dishes) and the player avatar (which reaches for them) agree on every position.
 *
 * "Set frame": origin at the table centre on the table top, +z points toward the diner, +x to the
 * diner's left-hand side as seen from above when facing −z... i.e. the diner's RIGHT hand is at −x
 * in avatar space, which is +x in the set frame (the set is rotated 180° to face the diner).
 */
export const TABLE_TOP = 0.46; // low street-food table, sized for the chibi diners
export const TABLE_W = 1.25; // along x
export const TABLE_D = 0.82; // along z
export const SEAT_Z = 0.58; // stool distance from the table centre
export const STOOL_TOP = 0.25; // low plastic stool

/** Dish positions in the set frame (x, z). */
export const SET = {
  broth: [0.035, 0.18],
  bun: [0.23, 0.05],
  herbs: [-0.16, 0.01],
  pickle: [-0.13, 0.26],
  chili: [-0.02, -0.09],
  chopsticks: [0.17, 0.32],
  drink: [-0.31, 0.23], // can at +0.05, glass at −0.045 from here (within the left hand's reach)
  extra: [0.02, -0.3], // a second portion, pushed to the far side
} as const;
export const CAN_OFFSET = 0.05;
export const GLASS_OFFSET = -0.045;

/** Body space of the seated avatar: the body group is lowered SEAT_DROP so the hips sit on the stool. */
export const SEAT_DROP = PLAYER_DIMENSIONS.hipY - PLAYER_DIMENSIONS.sitHip;
const BODY_DROP = SEAT_DROP;
export function setToBody(sx: number, sy: number, sz: number, out = new THREE.Vector3()) {
  return out.set(-sx, TABLE_TOP + sy + BODY_DROP, SEAT_Z - sz);
}

export type MealAction = { kind: 'bite' | 'pour' | 'sip'; start: number; dur: number };
const DUR = { bite: 3.8, pour: 3.6, sip: 2.8 } as const;
export const firstDrink = (order: Order) => (['pepsi', 'coca', 'sevenup', 'lavie'] as MenuId[]).find((id) => (order[id] ?? 0) > 0) as Exclude<MenuId, 'buncha'> | undefined;

export function mealScript(order: Order): MealAction[] {
  const food = (order.buncha ?? 0) > 0;
  const drink = !!firstDrink(order);
  const kinds: MealAction['kind'][] = food && drink ? ['bite', 'bite', 'pour', 'sip', 'bite', 'sip'] : food ? ['bite', 'bite', 'bite'] : ['pour', 'sip', 'sip'];
  let t = 0;
  return kinds.map((kind) => { const a = { kind, start: t, dur: DUR[kind] }; t += DUR[kind]; return a; });
}
export const mealDuration = (order: Order) => mealScript(order).reduce((s, a) => s + a.dur, 0);

/** Which action is running at overall progress p (0..1), its local 0..1 time, and counts done so far. */
export function mealAt(order: Order, p: number) {
  const script = mealScript(order);
  const total = script.reduce((s, a) => s + a.dur, 0);
  const t = p * total;
  let bites = 0; let sips = 0; let poured = false;
  for (const a of script) {
    if (t < a.start + a.dur) return { action: a, u: (t - a.start) / a.dur, bites, sips, poured, bitesTotal: script.filter((x) => x.kind === 'bite').length, sipsTotal: script.filter((x) => x.kind === 'sip').length };
    if (a.kind === 'bite') bites++; else if (a.kind === 'sip') sips++; else poured = true;
  }
  return { action: null, u: 1, bites, sips, poured, bitesTotal: script.filter((x) => x.kind === 'bite').length, sipsTotal: script.filter((x) => x.kind === 'sip').length };
}

/** Glass fill (0..1) and how much food is gone (0..1) at overall progress p. */
export function drinkLevels(order: Order, p: number) {
  const m = mealAt(order, p);
  const FULL = 0.85;
  let glass = m.poured ? FULL : 0;
  if (m.action?.kind === 'pour') glass = FULL * THREE.MathUtils.clamp((m.u - 0.47) / 0.25, 0, 1);
  const perSip = FULL / Math.max(1, m.sipsTotal);
  glass -= perSip * m.sips;
  if (m.action?.kind === 'sip') glass -= perSip * THREE.MathUtils.clamp((m.u - 0.56) / 0.18, 0, 1);
  let food = m.bites;
  if (m.action?.kind === 'bite' && m.u > 0.88) food += 1;
  return { glass: Math.max(0, glass), food: m.bitesTotal ? Math.min(1, food / m.bitesTotal) : 0, canHeld: m.action?.kind === 'pour' && m.u > 0.2 && m.u < 0.92, glassHeld: m.action?.kind === 'sip' && m.u > 0.22 && m.u < 0.9 };
}

/** Piecewise keyframe track with smoothstep easing. */
export function track<T>(u: number, keys: [number, T][], lerp: (a: T, b: T, t: number) => T): T {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, a] = keys[i]; const [u1, b] = keys[i + 1];
    if (u <= u1) { const t = (u - u0) / Math.max(1e-6, u1 - u0); return lerp(a, b, t * t * (3 - 2 * t)); }
  }
  return keys[keys.length - 1][1];
}
export const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
export const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
