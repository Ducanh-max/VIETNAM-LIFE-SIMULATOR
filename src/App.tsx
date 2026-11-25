import { Canvas } from '@react-three/fiber';
import { memo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { mapAttribution, type Point } from './game/geo';
import { qualityConfig, World, type Quality, type TimeOfDay } from './game/World';
import { actions, game, useGame } from './game/state';
import { NameEntry, VietnamMap } from './ui/Entry';
import { BossDialog, JobPanel, MenuPanel, NeedsHud, PromptAndToast, Speedometer } from './ui/Hud';
import { LiftPanel } from './game/world/Lotte';
import { MultiplayerPanel, roomFromUrl } from './ui/MultiplayerPanel';
import { RentalPanel } from './ui/RentalPanel';
import { joinGame, net, onNet } from './game/net';
import { Minimap, Phone } from './ui/Phone';
import { loadPlayerName, savePlayerName } from './ui/player';
import { vietnamTimeOfDay } from './ui/vietnamTime';

type ExplorerMode = 'home' | 'game';
type Panel = 'settings' | 'about' | 'help' | null;
const buildSha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || import.meta.env.VITE_BUILD_COMMIT;
const buildLabel = buildSha ? buildSha.slice(0, 7) : 'localhost';

const MemoWorld = memo(World);

function Icon({ name }: { name: 'settings' | 'pause' | 'play' | 'close' | 'compass' }) {
  const paths = {
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.9 1.9-.06-.06A1.65 1.65 0 0 0 16 18.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.05V21h-2.7v-.95A1.65 1.65 0 0 0 10.4 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06-1.9-1.9.06-.06A1.65 1.65 0 0 0 7 15a1.65 1.65 0 0 0-1.65-1.45H4.4v-2.7h.95A1.65 1.65 0 0 0 7 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06 1.9-1.9.06.06A1.65 1.65 0 0 0 10.4 6a1.65 1.65 0 0 0 1.5-1.65V3.4h2.7v.95A1.65 1.65 0 0 0 16 6a1.65 1.65 0 0 0 1.82-.33l.06-.06 1.9 1.9-.06.06A1.65 1.65 0 0 0 19.4 9.4a1.65 1.65 0 0 0 1.65 1.45H22v2.7h-.95A1.65 1.65 0 0 0 19.4 15z" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
    play: <path d="m8 5 11 7-11 7V5z" />,
    close: <><path d="M5 5 19 19M19 5 5 19" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2z" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [mode, setMode] = useState<ExplorerMode>(window.location.hash === '#play' && loadPlayerName() ? 'game' : 'home');
  const [panel, setPanel] = useState<Panel>(null);
  const [time, setTime] = useState<TimeOfDay>(() => (import.meta.env.DEV && (new URLSearchParams(location.search).get('time') as TimeOfDay | null)) || vietnamTimeOfDay()); // ?time=day for tests
  const [playerName, setPlayerName] = useState(loadPlayerName);
  const [mpOpen, setMpOpen] = useState(() => !!roomFromUrl());
  const [netCount, setNetCount] = useState(0);
  useEffect(() => onNet(() => setNetCount(net.room ? net.remotes.size + 1 : 0)), []);
  // an invite link (?room=CODE) joins that room as soon as the game starts
  useEffect(() => { const c = roomFromUrl(); if (mode === 'game' && c && !net.room && net.status !== 'full') void joinGame(c); }, [mode]);
  const [renaming, setRenaming] = useState(false);
  const [quality, setQuality] = useState<Quality>('medium');
  const [freeCamera, setFreeCamera] = useState(false);
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(0);
  const [position, setPosition] = useState<Point>([0, 0]);
  const config = qualityConfig[quality];
  const phase = useGame((s) => s.phase);
  const dialog = useGame((s) => s.dialog);
  const phone = useGame((s) => s.phone);
  const menuOpen = phase === 'menu';
  const controlsPaused = paused || panel !== null || menuOpen || dialog !== null;

  useEffect(() => {
    const onHash = () => setMode(window.location.hash === '#play' ? 'game' : 'home');
    const onEscape = () => {
      if (document.pointerLockElement) document.exitPointerLock();
      else if (game.get().phone) game.set({ phone: false });
      else if (menuOpen) actions.closeMenu();
      else if (game.get().dialog) game.set({ dialog: null });
      else if (panel) setPanel(null);
      else if (mode === 'game') setPaused((value) => !value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onEscape();
      if (event.code === 'KeyP' && !event.repeat && mode === 'game' && !paused && panel === null && !menuOpen && !game.get().dialog) {
        event.preventDefault();
        game.set({ phone: !game.get().phone });
      }
      if (event.code === 'KeyV' && !event.repeat && mode === 'game' && !paused && panel === null) {
        event.preventDefault();
        setFreeCamera((value) => !value);
      }
    };
    // right-drag orbits the camera: never open the browser menu while playing
    const noMenu = (event: MouseEvent) => { if (mode === 'game') event.preventDefault(); };
    window.addEventListener('contextmenu', noMenu);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mode, panel, menuOpen, paused]);

  const start = () => {
    window.location.hash = 'play';
    setMode('game');
    setPaused(false);
    setFreeCamera(false);
    setPanel('help');
  };
  const returnHome = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    window.location.hash = 'home';
    setMode('home');
    setPaused(false);
    setFreeCamera(false);
    setPanel(null);
  };
  const lockPointer = () => {
    if (mode === 'game' && !controlsPaused && !document.pointerLockElement) document.querySelector('canvas')?.requestPointerLock();
  };
  const openPanel = (next: Panel) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setPanel(next);
  };

  return <main className="app-shell text-stone-100" data-mode={mode}>
    {mode === 'game' && <div className="scene-wrap" onClick={lockPointer} role="presentation">
      <Canvas key={quality} camera={{ position: [70, 8, -205], fov: 55, near: 0.1, far: 2000 }} dpr={Math.min(window.devicePixelRatio || 1, config.dpr)} shadows={config.shadow > 0}
        gl={{ antialias: config.antialias, powerPreference: 'high-performance' }} onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}>
        <MemoWorld paused={controlsPaused} time={time} quality={quality} freeCamera={freeCamera} onFps={setFps} onPosition={setPosition} />
      </Canvas>
    </div>}

    {mode === 'home' ? (!playerName || renaming
      ? <NameEntry initialName={playerName} onSubmit={(name) => { savePlayerName(name); setPlayerName(name); setRenaming(false); }} />
      : <VietnamMap playerName={playerName} onEnter={start} onRename={() => setRenaming(true)} onAbout={() => openPanel('about')} />
    ) : <>
      <header className="game-header">
        <div className="game-brand" onClick={returnHome} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') returnHome(); }}>ĐỜI VIỆT<span> / HÀ NỘI 3D</span></div>
        <div className="game-actions"><button title="Chơi cùng bạn bè" aria-label="Chơi cùng bạn bè" className={netCount ? 'mp-on' : ''} onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setMpOpen(!mpOpen); }}>👥{netCount ? <small>{netCount}</small> : null}</button><button title="Điện thoại (P)" aria-label="Điện thoại" onClick={() => game.set({ phone: !phone })}>📱</button><button title="Trợ giúp" aria-label="Trợ giúp" onClick={() => openPanel('help')}>?</button><button title="Cài đặt" aria-label="Cài đặt" onClick={() => openPanel('settings')}><Icon name="settings" /></button><button title={paused ? 'Tiếp tục' : 'Tạm dừng'} aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'} onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setPaused(!paused); }}><Icon name={paused ? 'play' : 'pause'} /></button></div>
      </header>
      <div className="area-tag"><Icon name="compass" /><span>{freeCamera ? 'CHẾ ĐỘ DRONE' : 'ĐANG KHÁM PHÁ'}<strong>Hồ Hoàn Kiếm, Hà Nội</strong>{playerName && <em className="area-player">{playerName}</em>}<small>Commit {buildLabel}</small></span></div>
      {freeCamera && <div className="drone-reticle" aria-hidden="true">+</div>}
      <div className="game-bottom"><span>W A S D <b>{freeCamera ? 'Bay ngang' : 'Di chuyển'}</b></span><span>← ↑ ↓ → <b>Xoay góc nhìn</b></span><span>{freeCamera ? 'SPACE / CTRL' : 'SHIFT'} <b>{freeCamera ? 'Lên / xuống' : 'Chạy'}</b></span><span>V <b>{freeCamera ? 'Về nhân vật' : 'Bật drone'}</b></span>{!freeCamera && <span>E <b>Tương tác</b></span>}{!freeCamera && <span>F <b>Lên / xuống xe</b></span>}{!freeCamera && <span>P <b>Điện thoại</b></span>}<span className="fps-pill">{position[0].toFixed(0)} : {position[1].toFixed(0)} · {fps || '—'} FPS</span></div>
      <NeedsHud />
      <Speedometer />
      <RentalPanel />
      {mpOpen && <MultiplayerPanel onClose={() => setMpOpen(false)} />}
      <LiftPanel />
      <PromptAndToast />
      <JobPanel />
      {!freeCamera && <Minimap onOpen={() => game.set({ phone: true })} />}
      {phone && !paused && !panel && <Phone onClose={() => game.set({ phone: false })} />}
      {menuOpen && !paused && !panel && <MenuPanel />}
      {dialog === 'boss' && !paused && !panel && <BossDialog />}
      {!panel && !paused && !menuOpen && !dialog && !phone && <button className="capture-tip" onClick={lockPointer}>Nhấp vào cảnh để điều khiển camera</button>}
      {paused && !panel && <div className="pause-scrim"><div className="pause-card"><span className="modal-kicker">TẠM DỪNG</span><h2>Dừng chân bên hồ.</h2><p>Thành phố vẫn ở đây khi bạn quay lại.</p><button className="primary-button" onClick={() => setPaused(false)}><Icon name="play" /> Tiếp tục</button><button className="text-button" onClick={returnHome}>Về bản đồ Việt Nam →</button></div></div>}
    </>}

    {panel && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={panel === 'settings' ? 'Cài đặt' : panel === 'about' ? 'Giới thiệu dự án' : 'Hướng dẫn chơi'}>
      <button className="modal-close" aria-label="Đóng" onClick={() => setPanel(null)}><Icon name="close" /></button>
      {panel === 'settings' ? <><span className="modal-kicker">TUỲ CHỈNH TRẢI NGHIỆM</span><h2>Cài đặt</h2><p>Chọn ánh sáng và chất lượng phù hợp với máy của bạn.</p>
        <div className="setting-group"><label>Thời điểm trong ngày</label><div className="segmented">{([['day', 'Ban ngày'], ['sunset', 'Hoàng hôn'], ['night', 'Ban đêm']] as const).map(([value, label]) => <button key={value} className={time === value ? 'selected' : ''} onClick={() => setTime(value)}>{label}</button>)}</div></div>
        <div className="setting-group"><label>Chất lượng đồ họa</label><div className="segmented quality">{(['low', 'medium', 'high', 'ultra'] as Quality[]).map((value) => <button key={value} className={quality === value ? 'selected' : ''} onClick={() => setQuality(value)}>{value.toUpperCase()}</button>)}</div></div>
        <div className="setting-group toggle-row"><div><label>Chế độ drone</label><small>Nhấn V để bật/tắt. Space/Ctrl để lên/xuống, Shift để bay nhanh.</small></div><button className={`toggle ${freeCamera ? 'on' : ''}`} role="switch" aria-checked={freeCamera} onClick={() => setFreeCamera(!freeCamera)}><span /></button></div>
        <button className="primary-button modal-primary" onClick={() => setPanel(null)}>Áp dụng</button>
      </> : panel === 'about' ? <><span className="modal-kicker">VỀ ĐỜI VIỆT</span><h2>Một thế giới bắt đầu từ Hà Nội.</h2><p>ĐỜI VIỆT là bản thử nghiệm game web 3D mô phỏng Việt Nam. Phiên bản này tập trung vào cảnh quan Hồ Hoàn Kiếm, Cầu Thê Húc, Đền Ngọc Sơn và Tháp Rùa.</p><p>Bờ hồ, vị trí các đảo, toàn bộ đường phố và hơn 9.000 toà nhà quanh hồ lấy theo dữ liệu OpenStreetMap. Tháp Rùa, Cầu Thê Húc, Đền Ngọc Sơn, cây cối và phố xá đều được dựng hoàn toàn bằng Three.js, không dùng file mô hình ngoài.</p><p>Phiên bản triển khai: <strong>commit {buildLabel}</strong>.</p><div className="about-stats"><div><strong>01</strong><span>Khu vực</span></div><div><strong>03</strong><span>Chế độ ánh sáng</span></div><div><strong>04</strong><span>Mức đồ họa</span></div></div><button className="primary-button modal-primary" onClick={mode === 'home' ? start : () => setPanel(null)}>{mode === 'home' ? 'Bắt đầu khám phá' : 'Quay lại game'} <span>↗</span></button></> : <><span className="modal-kicker">HƯỚNG DẪN KHÁM PHÁ</span><h2>Dạo bước bên Hồ Gươm.</h2><div className="help-grid"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Di chuyển</span></div><div><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd><span>Xoay góc nhìn</span></div><div><kbd>SHIFT</kbd><span>Chạy / bay nhanh</span></div><div><kbd>V</kbd><span>Bật / tắt drone</span></div><div><kbd>SPACE</kbd><kbd>CTRL</kbd><span>Drone lên / xuống</span></div><div><kbd>ESC</kbd><span>Thoát con trỏ</span></div><div><kbd>E</kbd><span>Ngồi / gọi món / ăn</span></div><div><kbd>M</kbd><span>Gọi thêm món</span></div><div><kbd>F</kbd><span>Lên / xuống xe máy</span></div><div><kbd>P</kbd><span>Điện thoại · bản đồ</span></div></div><p>Nhấp vào cảnh để khóa con trỏ và xoay camera bằng chuột, hoặc giữ chuột phải rồi kéo; cuộn chuột để phóng to, thu nhỏ. Bạn có thể đi qua Cầu Thê Húc vào thăm bên trong Đền Ngọc Sơn, hoặc dạo khắp các phố quanh hồ (dựng theo OpenStreetMap).</p><p>Thanh <b>No bụng</b> và <b>Nước</b> giảm dần khi bạn đi lại. Đói hoặc khát quá sẽ đi chậm hẳn! Quán <b>Bún chả Đức Anh</b> nằm ngay bên kia phố Đinh Tiên Hoàng, đối diện Cầu Thê Húc: vào ngồi một bàn trống, nhấn <kbd>E</kbd> để gọi món. Muốn kiếm tiền? Gặp <b>ông chủ Đức Anh</b> ở quầy thu ngân để nhận việc ship bún chả bằng xe máy.</p><button className="primary-button modal-primary" onClick={() => setPanel(null)}>Bắt đầu đi dạo <span>↗</span></button></>}
    </section></div>}
    <div className="attribution">Dữ liệu bản đồ © {mapAttribution}</div>
  </main>;
}

export default App;
