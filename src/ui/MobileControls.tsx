import { useEffect, useRef, useState } from 'react';
import { goLandscape, isRotated, setDevice, suggestedDevice, useDevice } from './device';
import { game, useGame } from '../game/state';

/*
 * Touch controls for playing on a phone. They drive the game through the same inputs as a keyboard and mouse:
 * the joystick presses W/A/S/D (and Shift when pushed all the way), dragging the right half of the screen turns
 * the camera like a right-mouse drag, two fingers pinch to zoom like the wheel, and the buttons send E, F, V, P.
 * No keyboard letters on screen: buttons carry icons, the action prompt is itself a big button ("Chạm để …"), and
 * messages that mention keys are reworded for touch. When the game is turned by CSS (phone held upright, see
 * device.ts) touch movement is turned back into the game's frame.
 */
/** Screen-space touch movement → the game's frame (turned 90° clockwise when rotated). */
const toGame = (dx: number, dy: number): [number, number] => (isRotated() ? [dy, -dx] : [dx, dy]);
/** "Bấm E để …" → "Chạm để …", key names out of messages. */
export const touchText = (t: string) => t
  .replace(/[Bb]ấm E( và)? /g, (m) => (m[0] === 'B' ? 'Chạm nút ' : 'chạm nút ')).replace(/[Nn]hấn E /g, 'chạm ')
  .replace(/ ?((E|F|B|P))/g, '').replace(/(B để mở)/g, '(nút 🎒)').replace(/phím B/g, 'nút 🎒').replace(/(phím B)/g, '').replace(/B để mở/g, 'nút 🎒 để mở')
  .replace(/M: Gọi thêm/g, 'Gọi thêm').replace(/bấm F/gi, 'chạm nút xe');
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
    let [x, y] = toGame((t.clientX - (r.left + r.width / 2)) / R, (t.clientY - (r.top + r.height / 2)) / R);
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
        const [mx, my] = toGame(t.clientX - lt.x, t.clientY - lt.y);
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx * 1.6, movementY: my * 1.2, bubbles: true } as MouseEventInit));
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

  // the first tap in the game asks for fullscreen + landscape (allowed only from a user gesture)
  useEffect(() => {
    if (device !== 'mobile') return;
    const once = () => { void goLandscape(); window.removeEventListener('pointerdown', once); };
    window.addEventListener('pointerdown', once);
    return () => window.removeEventListener('pointerdown', once);
  }, [device]);

  if (device !== 'mobile') return null;
  return <div className="touch-ui">
    <TouchPrompt />
    <TouchToast />
    <div ref={stick} className="touch-stick"
      onTouchStart={(e) => { const t = e.changedTouches[0]; stickTouch.current = t.identifier; onStick(t); }}
      onTouchMove={(e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === stickTouch.current) onStick(t); }}
      onTouchEnd={releaseStick} onTouchCancel={releaseStick}>
      <span className="touch-knob" style={{ transform: `translate(${knob[0] * 38}px, ${knob[1] * 38}px)` }} />
    </div>
    <div className="touch-buttons">
      <button className="touch-btn main" aria-label="Tương tác" onPointerDown={(e) => { e.preventDefault(); tap('KeyE', 'e'); }}>🤚<small>Tương tác</small></button>
      <button className="touch-btn" aria-label="Lên / xuống xe" onPointerDown={(e) => { e.preventDefault(); tap('KeyF', 'f'); }}>🛵<small>Lên xe</small></button>
      <button className={`touch-btn ${run ? 'on' : ''}`} aria-label="Chạy" onPointerDown={(e) => { e.preventDefault(); setRun((r) => !r); }}>🏃<small>Chạy</small></button>
      <button className="touch-btn" aria-label="Drone" onPointerDown={(e) => { e.preventDefault(); tap('KeyV', 'v'); }}>🚁<small>Drone</small></button>
      <button className="touch-btn" aria-label="Điện thoại" onPointerDown={(e) => { e.preventDefault(); tap('KeyP', 'p'); }}>📱<small>Điện thoại</small></button>
      <button className="touch-btn" aria-label="Toàn màn hình, xoay ngang" onPointerDown={(e) => { e.preventDefault(); void goLandscape(); }}>⛶<small>Xoay ngang</small></button>
    </div>
  </div>;
}

/** The current action as a big button: tap it to do it (instead of "press E"). */
function TouchPrompt() {
  const prompt = useGame((s) => s.prompt);
  const phase = useGame((s) => s.phase);
  if (!prompt || phase === 'menu') return null;
  const text = touchText(prompt.text);
  if (!prompt.key) return <div className="touch-prompt info">{text}</div>;
  const more = /M: Gọi thêm/.test(prompt.text);
  return <div className="touch-prompt-row">
    <button className="touch-prompt" onPointerDown={(e) => { e.preventDefault(); tap(prompt.key === 'F' ? 'KeyF' : 'KeyE', prompt.key === 'F' ? 'f' : 'e'); }}>👆 Chạm để {text.charAt(0).toLowerCase() + text.slice(1)}</button>
    {more && <button className="touch-prompt small" onPointerDown={(e) => { e.preventDefault(); tap('KeyM', 'm'); }}>🍜 Gọi thêm</button>}
  </div>;
}
/** Game messages, worded for touch. */
function TouchToast() {
  const toast = useGame((s) => s.toast);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; setText(touchText(toast.text)); const id = setTimeout(() => setText(null), 4200); return () => clearTimeout(id); }, [toast]);
  return text ? <div className="touch-toast">{text}</div> : null;
}
void game;

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
