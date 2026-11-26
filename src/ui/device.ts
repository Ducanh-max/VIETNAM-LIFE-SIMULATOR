import { useSyncExternalStore } from 'react';

/** Playing on a phone (touch controls, compact HUD) or on a laptop / desktop (keyboard and mouse). */
export type Device = 'mobile' | 'desktop';
const KEY = 'doi-viet-device';
/** What this device looks like: a touch screen without a fine pointer, or a narrow screen, suggests a phone. */
export const suggestedDevice = (): Device => (typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760) ? 'mobile' : 'desktop');
let device: Device = (() => { try { const v = localStorage.getItem(KEY); if (v === 'mobile' || v === 'desktop') return v; } catch { /* no storage */ } return suggestedDevice(); })();
const subs = new Set<() => void>();
const apply = () => { if (typeof document !== 'undefined') document.body.classList.toggle('mobile', device === 'mobile'); };
apply();
export function setDevice(d: Device) { device = d; try { localStorage.setItem(KEY, d); } catch { /* ignore */ } apply(); subs.forEach((f) => f()); }
export const getDevice = () => device;
export function useDevice() { return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => device); }
