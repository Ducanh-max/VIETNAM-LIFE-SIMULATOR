import { Canvas } from '@react-three/fiber';
import { Clone, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { NgocSonTemple, TheHucBridge } from './world/Historic';
import { templeCenter } from './world/geo';

type Asset = 'tower' | 'complex';
type Version = 'current' | 'candidate';

const reviewAssets = {
  tower: '/models/thap-rua-heritage.glb',
  complex: '/models/review/ngoc-son-the-huc-review.glb',
} as const;

class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Html center><div className="heritage-review-message">Không tải được GLB. Hãy xem Console để biết lỗi.</div></Html> : this.props.children; }
}

function GlbModel({ asset, version, onLoaded }: { asset: Asset; version: Version; onLoaded: (url: string) => void }) {
  const url = version === 'current' ? '/models/thap-rua.glb?v=8m8-architecture' : reviewAssets[asset];
  const { scene } = useGLTF(url, '/draco/');
  useEffect(() => onLoaded(url), [onLoaded, url]);
  // The combined source remains at its original relative positions. This transform
  // only fits it in the inspection viewport; it is not a game-map placement.
  return asset === 'tower'
    ? <Clone object={scene} castShadow receiveShadow />
    : <group position={[0, -0.61, 0]} scale={0.14}><Clone object={scene} castShadow receiveShadow /></group>;
}

function ReviewScene({ asset, version, onLoaded }: { asset: Asset; version: Version; onLoaded: (url: string) => void }) {
  return <>
    <color attach="background" args={['#8c9799']} />
    <hemisphereLight args={['#eaf2f2', '#7b776d', 2.2]} />
    <directionalLight position={[25, 40, 25]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} />
    {asset === 'complex' && version === 'current'
      ? <group position={[-templeCenter[0], -0.28, -templeCenter[1]]}>
          <NgocSonTemple time="day" /><TheHucBridge />
        </group>
      : <LoadBoundary key={`${asset}-${version}`}>
          <Suspense fallback={<Html center><div className="heritage-review-message">Đang tải GLB…</div></Html>}>
            <GlbModel asset={asset} version={version} onLoaded={onLoaded} />
          </Suspense>
        </LoadBoundary>}
    <gridHelper args={[asset === 'tower' ? 24 : 100, asset === 'tower' ? 24 : 50, '#b9c1c1', '#a6b0b0']} position={[0, -0.04, 0]} />
    <OrbitControls makeDefault enableDamping target={asset === 'tower' ? [0, 4, 0] : [0, 5, 0]} minDistance={2} maxDistance={150} />
  </>;
}

export default function HeritageReview() {
  const [asset, setAsset] = useState<Asset>('tower');
  const [version, setVersion] = useState<Version>('candidate');
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const chooseAsset = (next: Asset) => { setAsset(next); setVersion('candidate'); setLoadedUrl(null); };
  const chooseVersion = (next: Version) => { setVersion(next); setLoadedUrl(null); };
  return <main className="heritage-review">
    <header className="heritage-review-header">
      <div><strong>ĐỜI VIỆT · SO SÁNH MÔ HÌNH</strong><small>Chọn cùng công trình, chuyển bản trước / GLB từ file Blender của bạn</small></div>
      <nav aria-label="Chọn mô hình xem thử">
        <button className={asset === 'tower' ? 'active' : ''} onClick={() => chooseAsset('tower')}>Tháp Rùa</button>
        <button className={asset === 'complex' ? 'active' : ''} onClick={() => chooseAsset('complex')}>Đền + cầu</button>
        <a href={asset === 'complex' ? '/?assetDebug=1&view=temple#play' : '/#play'}>
          {asset === 'complex' ? 'Xem đền và cầu trong game' : 'Trở về game'}
        </a>
      </nav>
    </header>
    <div className="heritage-review-versions" role="group" aria-label="Chọn phiên bản mô hình">
      <button className={version === 'current' ? 'active' : ''} onClick={() => chooseVersion('current')}>Bản trước</button>
      <button className={version === 'candidate' ? 'active' : ''} onClick={() => chooseVersion('candidate')}>
        {asset === 'complex' ? 'Cụm Blender gốc' : 'GLB từ Blender'}
      </button>
      <span>{asset === 'complex' && version === 'current' ? 'Mô hình procedural trước đây' : loadedUrl ? `Đã tải: ${loadedUrl}` : 'Đang tải GLB…'}</span>
    </div>
    <div className="heritage-review-canvas">
      <Canvas key={`${asset}-${version}`} camera={{ position: asset === 'tower' ? [13, 10, 14] : [48, 29, 68], fov: 50, near: 0.05, far: 300 }}
        dpr={[1, 1.5]} shadows gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}>
        <ReviewScene asset={asset} version={version} onLoaded={setLoadedUrl} />
      </Canvas>
    </div>
    <aside className="heritage-review-note">
      {asset === 'tower'
        ? 'Tháp Rùa: mô hình và màu từ file Blender bạn cung cấp, cao 8,8 m. Kéo chuột để xoay, cuộn để phóng to. Bản trước là GLB cũ.'
        : 'Trang này lưu cụm đền và cầu từ file Blender gốc. Chọn “Xem đền và cầu trong game” để nhìn lan can đã sửa và chân cổng trên đảo từ cùng một góc máy.'}
    </aside>
  </main>;
}
