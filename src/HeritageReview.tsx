import { Canvas } from '@react-three/fiber';
import { Clone, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useState, type ReactNode } from 'react';
import * as THREE from 'three';

type Asset = 'tower' | 'complex';

const reviewAssets = {
  tower: '/models/review/thap-rua-game-review.glb',
  complex: '/models/review/ngoc-son-the-huc-review.glb',
} as const;

class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Html center><div className="heritage-review-message">Không tải được GLB. Hãy xem Console để biết lỗi.</div></Html> : this.props.children; }
}

function ReviewModel({ asset }: { asset: Asset }) {
  const { scene } = useGLTF(reviewAssets[asset], '/draco/');
  // The combined source remains at its original relative positions. This transform
  // only fits it in the inspection viewport; it is not a game-map placement.
  return asset === 'tower'
    ? <Clone object={scene} castShadow receiveShadow />
    : <group position={[0, -0.61, 0]} scale={0.14}><Clone object={scene} castShadow receiveShadow /></group>;
}

function ReviewScene({ asset }: { asset: Asset }) {
  return <>
    <color attach="background" args={['#8c9799']} />
    <hemisphereLight args={['#eaf2f2', '#7b776d', 2.2]} />
    <directionalLight position={[25, 40, 25]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} />
    <LoadBoundary key={asset}><Suspense fallback={<Html center><div className="heritage-review-message">Đang tải GLB…</div></Html>}><ReviewModel asset={asset} /></Suspense></LoadBoundary>
    <gridHelper args={[asset === 'tower' ? 24 : 100, asset === 'tower' ? 24 : 50, '#b9c1c1', '#a6b0b0']} position={[0, -0.04, 0]} />
    <OrbitControls makeDefault enableDamping target={asset === 'tower' ? [0, 4, 0] : [0, 5, 0]} minDistance={2} maxDistance={150} />
  </>;
}

export default function HeritageReview() {
  const [asset, setAsset] = useState<Asset>('tower');
  return <main className="heritage-review">
    <header className="heritage-review-header">
      <div><strong>ĐỜI VIỆT · XEM THỬ ASSET</strong><small>Chưa được phê duyệt hình dáng hoặc vị trí trong game</small></div>
      <nav aria-label="Chọn mô hình xem thử">
        <button className={asset === 'tower' ? 'active' : ''} onClick={() => setAsset('tower')}>Tháp Rùa</button>
        <button className={asset === 'complex' ? 'active' : ''} onClick={() => setAsset('complex')}>Đền + cầu</button>
        <a href="/?heritagePreview=tower#play">Tháp Rùa trong game ↗</a>
        <a href="/#play">Trở về game</a>
      </nav>
    </header>
    <div className="heritage-review-canvas">
      <Canvas key={asset} camera={{ position: asset === 'tower' ? [13, 10, 14] : [48, 29, 68], fov: 50, near: 0.05, far: 300 }}
        dpr={[1, 1.5]} shadows gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}>
        <ReviewScene asset={asset} />
      </Canvas>
    </div>
    <aside className="heritage-review-note">
      {asset === 'tower'
        ? 'Tháp Rùa: mesh và vật liệu từ file Blender bạn cung cấp; chuẩn hóa đều về cao 8,8 m. Kéo chuột để xoay, cuộn để phóng to.'
        : 'Đền Ngọc Sơn + Cầu Thê Húc: giữ nguyên tương quan trong file Blender. Kích thước và hướng cầu chưa khớp bản đồ OSM; đây là viewport kiểm tra asset, chưa phải vị trí gameplay.'}
    </aside>
  </main>;
}
