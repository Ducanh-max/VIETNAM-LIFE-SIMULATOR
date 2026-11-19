import { Canvas } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { memo, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Explorer, type ExplorerMode } from './world/Explorer';
import { Landmarks } from './world/Historic';
import { Landscape, type TimeOfDay } from './world/Landscape';
import { Urban } from './world/Urban';
import { ShadowUpdates } from './world/ShadowUpdates';
import { mapAttribution, type Point } from './world/geo';
import { reviewPose } from './world/reviewViews';

type Quality = 'low' | 'medium' | 'high' | 'ultra';
type Panel = 'settings' | 'about' | 'help' | null;
const buildSha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || import.meta.env.VITE_BUILD_COMMIT;
const buildLabel = buildSha ? buildSha.slice(0, 7) : 'chưa có SHA';
const showAssetDebug = new URLSearchParams(window.location.search).get('assetDebug') === '1';
type BridgeAssetStatus = { state: 'loading' | 'glb' | 'fallback'; detail?: string };
const qualityConfig: Record<Quality, { dpr: number; shadow: number; antialias: boolean }> = {
  low: { dpr: 1, shadow: 0, antialias: false },
  medium: { dpr: 1.2, shadow: 1024, antialias: true },
  high: { dpr: 1.6, shadow: 2048, antialias: true },
  ultra: { dpr: 2, shadow: 4096, antialias: true },
};

function World({ mode, paused, time, quality, freeCamera, onFps, onPosition, onBridgeAssetStatus }: {
  mode: ExplorerMode; paused: boolean; time: TimeOfDay; quality: Quality; freeCamera: boolean;
  onFps: (fps: number) => void; onPosition: (point: Point) => void;
  onBridgeAssetStatus: (status: 'glb' | 'fallback', detail?: string) => void;
}) {
  const [heritageTempleLoaded, setHeritageTempleLoaded] = useState(false);
  const sun = time === 'day' ? [120, 150, -45] : time === 'sunset' ? [-145, 48, 90] : [45, 75, -80];
  const light = time === 'day' ? '#fff3d5' : time === 'sunset' ? '#ffc08e' : '#a8bbd2';
  const ambient = time === 'day' ? 0.95 : time === 'sunset' ? 0.76 : 0.58;
  const intensity = time === 'day' ? 2.75 : time === 'sunset' ? 2.25 : 0.7;
  const background = time === 'day' ? '#a7c8cf' : time === 'sunset' ? '#cf8d85' : '#1c2b35';
  const shadows = qualityConfig[quality].shadow;
  return <>
    <color attach="background" args={[background]} />
    <fog attach="fog" args={[background, 290, quality === 'low' ? 590 : 800]} />
    {time !== 'night' && <Sky distance={450000} sunPosition={sun as [number, number, number]} inclination={time === 'day' ? 0.5 : 0.62} turbidity={time === 'day' ? 3.5 : 5.5} rayleigh={time === 'day' ? 1.6 : 2.2} />}
    {time === 'night' && <Stars radius={350} depth={80} count={750} factor={3} fade speed={0.35} />}
    <hemisphereLight args={[time === 'night' ? '#6b829b' : '#d6e9eb', '#677264', ambient]} />
    <ambientLight intensity={time === 'night' ? 0.2 : 0.18} />
    <directionalLight position={sun as [number, number, number]} color={light} intensity={intensity} castShadow={shadows > 0}
      shadow-mapSize={[shadows, shadows]} shadow-camera-left={-190} shadow-camera-right={190} shadow-camera-top={190} shadow-camera-bottom={-190}
      shadow-camera-near={1} shadow-camera-far={520} shadow-bias={-0.0003} shadow-normalBias={0.025} />
    <Landscape time={time} />
    <ShadowUpdates lighting={time} />
    <Landmarks time={time} onBridgeAssetStatus={onBridgeAssetStatus} onTempleLoaded={setHeritageTempleLoaded} />
    <Urban time={time} />
    <Explorer mode={mode} paused={paused} freeCamera={freeCamera} onFps={onFps} onPosition={onPosition} heritageTempleLoaded={heritageTempleLoaded} />
  </>;
}

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
  const [mode, setMode] = useState<ExplorerMode>(window.location.hash === '#play' ? 'game' : 'home');
  const [panel, setPanel] = useState<Panel>(null);
  const [time, setTime] = useState<TimeOfDay>('day');
  const [quality, setQuality] = useState<Quality>('high');
  const [freeCamera, setFreeCamera] = useState(Boolean(reviewPose));
  const [paused, setPaused] = useState(false);
  const [fps, setFps] = useState(0);
  const [position, setPosition] = useState<Point>([0, 0]);
  const [bridgeAssetStatus, setBridgeAssetStatus] = useState<BridgeAssetStatus>({ state: 'loading' });
  const onBridgeAssetStatus = useCallback((state: 'glb' | 'fallback', detail?: string) => {
    setBridgeAssetStatus((current) => current.state === state && current.detail === detail ? current : { state, detail });
  }, []);
  const config = qualityConfig[quality];
  const controlsPaused = paused || panel !== null;

  useEffect(() => {
    const onHash = () => setMode(window.location.hash === '#play' ? 'game' : 'home');
    const onEscape = () => {
      if (document.pointerLockElement) document.exitPointerLock();
      else if (panel) setPanel(null);
      else if (mode === 'game') setPaused((value) => !value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onEscape();
      if (event.code === 'KeyV' && !event.repeat && mode === 'game' && !paused && panel === null) {
        event.preventDefault();
        setFreeCamera((value) => !value);
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mode, panel]);

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
    <div className="scene-wrap" onClick={lockPointer} role="presentation">
      <Canvas key={quality} camera={{ position: [145, 84, -145], fov: 54, near: 0.1, far: 1500 }} dpr={Math.min(window.devicePixelRatio || 1, config.dpr)} shadows={config.shadow > 0}
        gl={{ antialias: config.antialias, powerPreference: 'high-performance' }} onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}>
        <MemoWorld mode={mode} paused={controlsPaused} time={time} quality={quality} freeCamera={freeCamera} onFps={setFps} onPosition={setPosition} onBridgeAssetStatus={onBridgeAssetStatus} />
      </Canvas>
    </div>

    {mode === 'home' ? <>
      <div className="hero-shade" />
      <header className="site-header">
        <div className="brand"><span className="brand-stamp">ĐV</span><span>ĐỜI VIỆT<small>VIETNAM LIFE SIMULATOR</small></span></div>
        <nav aria-label="Điều hướng"><button onClick={() => openPanel('about')}>Dự án</button><button onClick={() => openPanel('settings')}>Cài đặt</button></nav>
      </header>
      <section className="hero-content">
        <div className="eyebrow"><span className="eyebrow-line" /> MỘT VIỆT NAM THU NHỎ · CHƯƠNG I</div>
        <h1>Chạm vào nhịp sống<br /><em>Hà Nội.</em></h1>
        <p>Bước qua Cầu Thê Húc, dạo quanh Hồ Gươm và khám phá một góc thủ đô trong không gian 3D có thể tự do đi lại.</p>
        <div className="hero-actions"><button className="primary-button" onClick={start}><Icon name="play" /> Bắt đầu khám phá <span>↗</span></button><button className="text-button" onClick={() => openPanel('about')}>Tìm hiểu dự án <span>→</span></button></div>
        <div className="hero-meta"><span><b>01</b> KHU VỰC MỞ ĐẦU</span><i /><span><b>3D</b> KHÁM PHÁ TỰ DO</span></div>
      </section>
      <div className="hero-location"><span className="location-dot" /> HỒ HOÀN KIẾM · HÀ NỘI <span>21.0288° N · 105.8525° E</span></div>
      <div className="hero-side-label">ĐỜI VIỆT · HÀ NỘI 3D</div>
    </> : <>
      <header className="game-header">
        <div className="game-brand" onClick={returnHome} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') returnHome(); }}>ĐỜI VIỆT<span> / HÀ NỘI 3D</span></div>
        <div className="game-actions"><a className="game-review-link" href="/#heritage-review">So sánh mô hình ↗</a><button title="Trợ giúp" aria-label="Trợ giúp" onClick={() => openPanel('help')}>?</button><button title="Cài đặt" aria-label="Cài đặt" onClick={() => openPanel('settings')}><Icon name="settings" /></button><button title={paused ? 'Tiếp tục' : 'Tạm dừng'} aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'} onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setPaused(!paused); }}><Icon name={paused ? 'play' : 'pause'} /></button></div>
      </header>
      <div className="area-tag"><Icon name="compass" /><span>{freeCamera ? 'CHẾ ĐỘ DRONE' : 'ĐANG KHÁM PHÁ'}<strong>Hồ Hoàn Kiếm, Hà Nội</strong><small>Commit {buildLabel}</small></span></div>
      {showAssetDebug && <div className={`asset-debug asset-debug-${bridgeAssetStatus.state}`} role="status">
        Cầu Thê Húc: {bridgeAssetStatus.state === 'glb' ? 'GLB đã tải' : bridgeAssetStatus.state === 'fallback' ? 'Đang dùng cầu cũ (fallback)' : 'Đang tải GLB'}
        {bridgeAssetStatus.detail && <small>{bridgeAssetStatus.detail}</small>}
      </div>}
      {freeCamera && <div className="drone-reticle" aria-hidden="true">+</div>}
      <div className="game-bottom"><span>W A S D <b>{freeCamera ? 'Bay ngang' : 'Di chuyển'}</b></span><span>← ↑ ↓ → <b>Xoay góc nhìn</b></span><span>{freeCamera ? 'SPACE / CTRL' : 'SHIFT'} <b>{freeCamera ? 'Lên / xuống' : 'Chạy'}</b></span><span>V <b>{freeCamera ? 'Về nhân vật' : 'Bật drone'}</b></span><span className="fps-pill">{position[0].toFixed(0)} : {position[1].toFixed(0)} · {fps || '—'} FPS</span></div>
      {!panel && !paused && <button className="capture-tip" onClick={lockPointer}>Nhấp vào cảnh để điều khiển camera</button>}
      {paused && !panel && <div className="pause-scrim"><div className="pause-card"><span className="modal-kicker">TẠM DỪNG</span><h2>Dừng chân bên hồ.</h2><p>Thành phố vẫn ở đây khi bạn quay lại.</p><button className="primary-button" onClick={() => setPaused(false)}><Icon name="play" /> Tiếp tục</button><button className="text-button" onClick={returnHome}>Về trang chủ →</button></div></div>}
    </>}

    {panel && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={panel === 'settings' ? 'Cài đặt' : panel === 'about' ? 'Giới thiệu dự án' : 'Hướng dẫn chơi'}>
      <button className="modal-close" aria-label="Đóng" onClick={() => setPanel(null)}><Icon name="close" /></button>
      {panel === 'settings' ? <><span className="modal-kicker">TUỲ CHỈNH TRẢI NGHIỆM</span><h2>Cài đặt</h2><p>Chọn ánh sáng và chất lượng phù hợp với máy của bạn.</p>
        <div className="setting-group"><label>Thời điểm trong ngày</label><div className="segmented">{([['day', 'Ban ngày'], ['sunset', 'Hoàng hôn'], ['night', 'Ban đêm']] as const).map(([value, label]) => <button key={value} className={time === value ? 'selected' : ''} onClick={() => setTime(value)}>{label}</button>)}</div></div>
        <div className="setting-group"><label>Chất lượng đồ họa</label><div className="segmented quality">{(['low', 'medium', 'high', 'ultra'] as Quality[]).map((value) => <button key={value} className={quality === value ? 'selected' : ''} onClick={() => setQuality(value)}>{value.toUpperCase()}</button>)}</div></div>
        <div className="setting-group toggle-row"><div><label>Chế độ drone</label><small>Nhấn V để bật/tắt. Space/Ctrl để lên/xuống, Shift để bay nhanh.</small></div><button className={`toggle ${freeCamera ? 'on' : ''}`} role="switch" aria-checked={freeCamera} onClick={() => setFreeCamera(!freeCamera)}><span /></button></div>
        <button className="primary-button modal-primary" onClick={() => setPanel(null)}>Áp dụng</button>
      </> : panel === 'about' ? <><span className="modal-kicker">VỀ ĐỜI VIỆT</span><h2>Một thế giới bắt đầu từ Hà Nội.</h2><p>ĐỜI VIỆT là bản thử nghiệm game web 3D mô phỏng Việt Nam. Phiên bản này tập trung vào cảnh quan Hồ Hoàn Kiếm, Cầu Thê Húc, Đền Ngọc Sơn và Tháp Rùa.</p><p>Địa hình hồ và vị trí các đảo dựa trên dữ liệu OpenStreetMap. Các công trình hiện là mô hình 3D dựng theo cấu trúc kiến trúc tham khảo; chi tiết chuyên sâu sẽ được tiếp tục hoàn thiện.</p><p>Phiên bản triển khai: <strong>commit {buildLabel}</strong>.</p><div className="about-stats"><div><strong>01</strong><span>Khu vực</span></div><div><strong>03</strong><span>Chế độ ánh sáng</span></div><div><strong>04</strong><span>Mức đồ họa</span></div></div><button className="primary-button modal-primary" onClick={mode === 'home' ? start : () => setPanel(null)}>{mode === 'home' ? 'Bắt đầu khám phá' : 'Quay lại game'} <span>↗</span></button></> : <><span className="modal-kicker">HƯỚNG DẪN KHÁM PHÁ</span><h2>Dạo bước bên Hồ Gươm.</h2><div className="help-grid"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Di chuyển</span></div><div><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd><span>Xoay góc nhìn</span></div><div><kbd>SHIFT</kbd><span>Chạy / bay nhanh</span></div><div><kbd>V</kbd><span>Bật / tắt drone</span></div><div><kbd>SPACE</kbd><kbd>CTRL</kbd><span>Drone lên / xuống</span></div><div><kbd>ESC</kbd><span>Thoát con trỏ</span></div></div><p>Chuột cũng có thể xoay camera khi nhấp vào cảnh 3D để khóa con trỏ. Bạn có thể đi qua Cầu Thê Húc tới đảo Ngọc Sơn; bờ hồ và công trình có va chạm cơ bản.</p><button className="primary-button modal-primary" onClick={() => setPanel(null)}>Bắt đầu đi dạo <span>↗</span></button></>}
    </section></div>}
    <div className="attribution">Dữ liệu bản đồ © {mapAttribution}</div>
  </main>;
}

export default App;
