import { useEffect, useRef, useState } from 'react';
import { setDevice, suggestedDevice, useDevice } from './device';

/*
 * Touch controls for playing on a phone. They drive the game through the same inputs as a keyboard and mouse:
 * the joystick presses W/A/S/D (and Shift when pushed all the way), dragging the right half of the screen turns
 * the camera like a right-mouse drag, two fingers pinch to zoom like the wheel, and the buttons send E, F, V, P, B.
 */
const key = (type: 'keydown' | 'keyup', code: string, k: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true }));
const tap = (code: string, k: string) => { key('keydown', code, k); setTimeout(() => key('keyup', code, k), 60); };
const canvas = () => document.querySelector('canvas');

export function MobileControls() {
  const device = useDevice();
  const stick = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const [run, setRun] = useState(false);
  const held = useRef(new Set<string>());
  const stickTouch = useRef<number | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const pinch = useRef<number | null>(null);

  // joystick → W/A/S/D (+ Shift at full tilt)
  const setKeys = (want: Set<string>) => {
    const names: Record<string, string> = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ShiftLeft: 'Shift' };
    for (const c of held.current) if (!want.has(c)) key('keyup', c, names[c]);
    for (const c of want) if (!held.current.has(c)) key('keydown', c, names[c]);
    held.current = want;
  };
  const onStick = (t: { clientX: number; clientY: number }) => {
    const el = stick.current; if (!el) return;
    const r = el.getBoundingClientRect(); const R = r.width / 2;
    let x = (t.clientX - (r.left + R)) / R, y = (t.clientY - (r.top + R)) / R;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    setKnob([x, y]);
    const want = new Set<string>();
    if (y < -0.35) want.add('KeyW'); if (y > 0.35) want.add('KeyS');
    if (x < -0.35) want.add('KeyA'); if (x > 0.35) want.add('KeyD');
    if (Math.hypot(x, y) > 0.92 || run) want.add('ShiftLeft');
    setKeys(want);
  };
  const releaseStick = () => { stickTouch.current = null; setKnob([0, 0]); setKeys(run ? new Set(['ShiftLeft']) : new Set()); };

  // camera: drag on the right of the screen = right-mouse drag; pinch = wheel
  useEffect(() => {
    if (device !== 'mobile') return;
    const start = (e: TouchEvent) => {
      const c = canvas(); if (!c || e.target !== c) return;
      if (e.touches.length === 2) { pinch.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); return; }
      const t = e.changedTouches[0];
      if (!lookTouch.current) { lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY }; c.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); }
    };
    const move = (e: TouchEvent) => {
      const c = canvas(); if (!c) return;
      if (e.touches.length === 2 && pinch.current !== null) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: (pinch.current - d) * 3, bubbles: true })); pinch.current = d; e.preventDefault(); return;
      }
      const lt = lookTouch.current; if (!lt) return;
      for (const t of Array.from(e.changedTouches)) if (t.identifier === lt.id) {
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: (t.clientX - lt.x) * 1.6, movementY: (t.clientY - lt.y) * 1.2, bubbles: true } as MouseEventInit));
        lt.x = t.clientX; lt.y = t.clientY; e.preventDefault();
      }
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
      const lt = lookTouch.current;
      if (lt && Array.from(e.changedTouches).some((t) => t.identifier === lt.id)) { lookTouch.current = null; window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })); }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end); setKeys(new Set()); };
  }, [device]);
  useEffect(() => { if (stickTouch.current === null) setKeys(run ? new Set(['ShiftLeft']) : new Set()); }, [run]);

  if (device !== 'mobile') return null;
  return <div className="touch-ui">
    <div ref={stick} className="touch-stick"
      onTouchStart={(e) => { const t = e.changedTouches[0]; stickTouch.current = t.identifier; onStick(t); }}
      onTouchMove={(e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === stickTouch.current) onStick(t); }}
      onTouchEnd={releaseStick} onTouchCancel={releaseStick}>
      <span className="touch-knob" style={{ transform: `translate(${knob[0] * 38}px, ${knob[1] * 38}px)` }} />
    </div>
    <div className="touch-buttons">
      <button className="touch-btn main" onPointerDown={(e) => { e.preventDefault(); tap('KeyE', 'e'); }}>E<small>Tương tác</small></button>
      <button className="touch-btn" onPointerDown={(e) => { e.preventDefault(); tap('KeyF', 'f'); }}>F<small>Xe</small></button>
      <button className={`touch-btn ${run ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); setRun((r) => !r); }}>⇧<small>Chạy</small></button>
      <button className="touch-btn" onPointerDown={(e) => { e.preventDefault(); tap('KeyV', 'v'); }}>V<small>Drone</small></button>
      <button className="touch-btn" onPointerDown={(e) => { e.preventDefault(); tap('KeyP', 'p'); }}>📱<small>Điện thoại</small></button>
    </div>
  </div>;
}

/** "Chơi bằng: Điện thoại / Laptop" for the start screen and the settings. */
export function DevicePicker({ compact = false }: { compact?: boolean }) {
  const device = useDevice();
  return <div className={`device-picker ${compact ? 'compact' : ''}`}>
    <span>Chơi bằng</span>
    <div className="segmented">
      <button className={device === 'mobile' ? 'selected' : ''} onClick={() => setDevice('mobile')}>📱 Điện thoại</button>
      <button className={device === 'desktop' ? 'selected' : ''} onClick={() => setDevice('desktop')}>💻 Laptop · máy tính</button>
    </div>
    {!compact && <small>{suggestedDevice() === 'mobile' ? 'Máy này có màn hình cảm ứng: nên chọn Điện thoại.' : 'Máy này dùng bàn phím và chuột: nên chọn Laptop.'} Đổi lại được trong Cài đặt.</small>}
  </div>;
}
