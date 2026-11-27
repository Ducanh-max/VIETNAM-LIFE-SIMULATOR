import { useSyncExternalStore } from 'react';
import { cars, type OwnedCar } from './carRegistry';

/*
 * Live state of each owned car (doors, lock, engine, air-con, cabin temperature) and the remote-key actions used by
 * the door lock icons, the driver and the phone's "My Car" app. Lock / engine / AC are saved with the car record;
 * doors start closed every session.
 */
export type DoorKey = 'FL' | 'FR' | 'RL' | 'RR' | 'TG';
export type LiveCar = { doors: Record<DoorKey, boolean>; locked: boolean; engine: boolean; ac: boolean; cabinTemp: number; flashUntil: number };
const live = new Map<string, LiveCar>();
const subs = new Set<() => void>(); let version = 0;
const emit = () => { version++; subs.forEach((f) => f()); };
export const carLive = {
  get(id: string): LiveCar {
    let s = live.get(id);
    if (!s) {
      const c = cars.get().cars.find((x) => x.vehicleId === id);
      s = { doors: { FL: false, FR: false, RL: false, RR: false, TG: false }, locked: !!c?.locked, engine: !!c?.engine, ac: !!c?.ac, cabinTemp: c?.ac ? 22 : 33, flashUntil: 0 };
      live.set(id, s);
    }
    return s;
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useCarLive<T>(id: string, sel: (s: LiveCar) => T): T { useSyncExternalStore(carLive.subscribe, () => version); return sel(carLive.get(id)); }

let audio: AudioContext | null = null;
function beep(times: number) {
  try {
    audio ??= new AudioContext(); const a = audio;
    for (let i = 0; i < times; i++) {
      const o = a.createOscillator(); const g = a.createGain(); o.type = 'square'; o.frequency.value = 1750; g.gain.value = 0.04;
      o.connect(g); g.connect(a.destination); const t = a.currentTime + i * 0.22; o.start(t); o.stop(t + 0.12);
    }
  } catch { /* no audio */ }
}
function save(id: string, patch: Partial<OwnedCar>) { cars.set({ cars: cars.get().cars.map((c) => (c.vehicleId === id ? { ...c, ...patch } : c)) }); }

export const carActions = {
  /** Toggle one door / the boot. Returns a message when it cannot (locked). */
  toggleDoor(id: string, d: DoorKey): string | null {
    const s = carLive.get(id);
    if (s.locked) return 'Xe đang khoá. Mở khoá trong app My Car trên điện thoại.';
    s.doors = { ...s.doors, [d]: !s.doors[d] }; emit(); return null;
  },
  setLocked(id: string, on: boolean) {
    const s = carLive.get(id); s.locked = on;
    if (on) s.doors = { FL: false, FR: false, RL: false, RR: false, TG: false };
    s.flashUntil = performance.now() + (on ? 1200 : 700); beep(on ? 1 : 2); save(id, { locked: on }); emit();
  },
  setEngine(id: string, on: boolean) { const s = carLive.get(id); s.engine = on; save(id, { engine: on }); emit(); },
  setAc(id: string, on: boolean) { const s = carLive.get(id); s.ac = on; save(id, { ac: on }); emit(); },
  setTrunk(id: string, open: boolean): string | null {
    const s = carLive.get(id); if (s.locked && open) return 'Xe đang khoá. Mở khoá trước rồi mới mở cốp.';
    s.doors = { ...s.doors, TG: open }; emit(); return null;
  },
  closeAll(id: string) { const s = carLive.get(id); s.doors = { FL: false, FR: false, RL: false, RR: false, TG: false }; emit(); },
  /** The cabin temperature drifts toward 22 °C with the AC (engine on), toward the outside 33 °C otherwise. */
  tick(dt: number) {
    for (const [, s] of live) { const target = s.ac && s.engine ? 22 : 33; const k = Math.min(1, dt * (s.ac && s.engine ? 0.08 : 0.02)); const t = s.cabinTemp + (target - s.cabinTemp) * k; if (Math.abs(t - s.cabinTemp) > 0.001) s.cabinTemp = t; }
  },
};
let lastEmit = 0;
setInterval(() => { carActions.tick(1); const n = performance.now(); if (n - lastEmit > 1000) { lastEmit = n; emit(); } }, 1000);

