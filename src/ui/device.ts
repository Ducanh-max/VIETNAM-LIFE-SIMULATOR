import { useSyncExternalStore } from 'react';

/** Playing on a phone (touch controls, compact HUD, landscape) or on a laptop / desktop (keyboard and mouse). */
export type Device = 'mobile' | 'desktop';
const KEY = 'doi-viet-device';
/** What this device looks like: a touch screen without a fine pointer, or a narrow screen, suggests a phone. */
export const suggestedDevice = (): Device => (typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760) ? 'mobile' : 'desktop');
let device: Device = (() => { try { const v = localStorage.getItem(KEY); if (v === 'mobile' || v === 'desktop') return v; } catch { /* no storage */ } return suggestedDevice(); })();
const subs = new Set<() => void>();

/**
 * The game plays in landscape on a phone. Where the browser can lock the orientation (Android Chrome, after going
 * fullscreen) it does; otherwise (iPhone Safari, or with the rotation lock on) a phone held upright gets the whole
 * game turned 90° by CSS (body.rotate-landscape, see styles.css), and the touch controls turn their input to match.
 */
export const isRotated = () => typeof document !== 'undefined' && document.body.classList.contains('rotate-landscape');
function apply() {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('mobile', device === 'mobile');
  document.body.classList.toggle('rotate-landscape', device === 'mobile' && window.innerHeight > window.innerWidth);
}
apply();
if (typeof window !== 'undefined') {
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 150));
}
/** Fullscreen and a landscape lock where the browser allows it (needs a tap: call from a touch handler). */
export async function goLandscape() {
  if (device !== 'mobile') return;
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o?.lock?.('landscape');
  } catch { /* not allowed here: the CSS rotation takes over */ }
  setTimeout(apply, 300);
}
export function setDevice(d: Device) { device = d; try { localStorage.setItem(KEY, d); } catch { /* ignore */ } apply(); subs.forEach((f) => f()); }
export const getDevice = () => device;
export function useDevice() { return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => device); }
