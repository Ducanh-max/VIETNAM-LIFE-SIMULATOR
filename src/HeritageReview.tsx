import { Canvas } from '@react-three/fiber';
import { Clone, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { landmarkAssets } from './world/landmarkAssets';

type Asset = 'tower' | 'temple' | 'bridge';
const assets: Record<Asset, { label: string; url: string | null }> = {
  tower: { label: 'Tháp Rùa', url: landmarkAssets.turtleTower },
  temple: { label: 'Đền Ngọc Sơn', url: landmarkAssets.ngocSonTemple },
  bridge: { label: 'Cầu Thê Húc', url: landmarkAssets.theHucBridge },
};

class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Không tải được mô hình GLB để xem trước:', error); }
  render() {
    return this.state.failed
      ? <Html center><div className="heritage-review-message">Không tải được GLB. Kiểm tra Console và đường dẫn asset.</div></Html>
      : this.props.children;
  }
}

/** Show only the current Blender GLB. Old procedural landmarks are intentionally excluded. */
function GlbModel({ url, onLoaded }: { url: string; onLoaded: (url: string) => void }) {
  const { scene } = useGLTF(url, '/draco/');
  const placement = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    const scale = 14 / span;
    return {
      scale,
      position: [-center.x * scale, 3 - center.y * scale, -center.z * scale] as [number, number, number],
    };
  }, [scene]);
  useEffect(() => { onLoaded(url); }, [onLoaded, url]);
  return <group position={placement.position} scale={placement.scale}><Clone object={scene} castShadow receiveShadow /></group>;
}

function ReviewScene({ url, onLoaded }: { url: string | null; onLoaded: (url: string) => void }) {
  return <>
    <color attach="background" args={['#8c9799']} />
    <hemisphereLight args={['#eaf2f2', '#7b776d', 2.2]} />
    <directionalLight position={[25, 40, 25]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} />
    {url
      ? <LoadBoundary key={url}><Suspense fallback={<Html center><div className="heritage-review-message">Đang tải GLB…</div></Html>}>
          <GlbModel url={url} onLoaded={onLoaded} />
        </Suspense></LoadBoundary>
      : <Html center><div className="heritage-review-message">Chưa cấu hình GLB cho công trình này.</div></Html>}
    <gridHelper args={[35, 35, '#b9c1c1', '#a6b0b0']} position={[0, 0, 0]} />
    <OrbitControls makeDefault enableDamping target={[0, 3, 0]} minDistance={2} maxDistance={150} />
  </>;
}

export default function HeritageReview() {
  const [asset, setAsset] = useState<Asset>('tower');
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const chooseAsset = (next: Asset) => { setAsset(next); setLoadedUrl(null); };
  const selected = assets[asset];

  return <main className="heritage-review">
    <header className="heritage-review-header">
      <div>
        <strong>ĐỜI VIỆT · XEM MÔ HÌNH GLB</strong>
        <small>Chỉ hiển thị các mô hình Blender mới, không dùng mô hình dựng bằng code trước đây.</small>
      </div>
      <nav aria-label="Chọn mô hình xem thử">
        {(Object.keys(assets) as Asset[]).map(key =>
          <button key={key} className={asset === key ? 'active' : ''} onClick={() => chooseAsset(key)}>
            {assets[key].label}
          </button>
        )}
        <a href={asset === 'tower' ? '/#play' : '/?assetDebug=1&view=temple#play'}>Xem trong game</a>
      </nav>
    </header>
    <div className="heritage-review-versions">
      <span>{loadedUrl ? `Đã tải: ${loadedUrl}` : selected.url ? 'Đang tải GLB…' : 'Chưa có GLB'}</span>
    </div>
    <div className="heritage-review-canvas">
      <Canvas key={asset} camera={{ position: [22, 17, 22], fov: 50, near: 0.05, far: 300 }}
        dpr={[1, 1.5]} shadows gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}>
        <ReviewScene url={selected.url} onLoaded={setLoadedUrl} />
      </Canvas>
    </div>
    <aside className="heritage-review-note">
      {selected.label}: GLB xuất từ mô hình Blender của bạn. Kéo chuột để xoay và cuộn để phóng to.
      Mô hình cũ đã bị loại khỏi trang xem trước và scene gameplay. Tỷ lệ xem ở đây chỉ phục vụ kiểm tra mô hình, không phải tọa độ trong bản đồ.
    </aside>
  </main>;
}
