/**
 * Approved heritage GLB landmarks only.
 *
 * The old procedural Tháp Rùa, Đền Ngọc Sơn and Cầu Thê Húc have been
 * removed from the render pipeline. GLB failures are reported, never
 * silently replaced by an obsolete model.
 */
import { Component, Suspense, lazy, useCallback, useEffect, type ReactNode } from 'react';
import {
  bridgeEnds,
  templeCenter,
  templePlacement,
  templeYaw,
  turtleCenter,
  type Point,
} from './geo';
import type { TimeOfDay } from './Landscape';
import { landmarkAssets } from './landmarkAssets';

const LandmarkModel = lazy(() => import('./LandmarkModel'));

class LandmarkErrorBoundary extends Component<
  { children: ReactNode; onFailure?: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onFailure?.(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LandmarkSlot({
  name, url, position, rotationY = 0, onLoaded, onFailure,
}: {
  name: string;
  url: string | null;
  position: [number, number, number];
  rotationY?: number;
  onLoaded?: () => void;
  onFailure?: (error: Error) => void;
}) {
  useEffect(() => {
    if (!url) onFailure?.(new Error(`Thiếu asset GLB: ${name}`));
  }, [url, name, onFailure]);

  if (!url) return null;

  return (
    <LandmarkErrorBoundary key={url} onFailure={onFailure}>
      <Suspense fallback={null}>
        <LandmarkModel url={url} position={position} rotationY={rotationY} onLoaded={onLoaded} />
      </Suspense>
    </LandmarkErrorBoundary>
  );
}

export function Landmarks({
  onBridgeAssetStatus, onTempleLoaded,
}: {
  time: TimeOfDay;
  onBridgeAssetStatus?: (status: 'glb' | 'fallback', detail?: string) => void;
  onTempleLoaded: (loaded: boolean) => void;
}) {
  const reportTempleLoaded = useCallback(() => onTempleLoaded(true), [onTempleLoaded]);
  const reportTempleFailure = useCallback((error: Error) => {
    onTempleLoaded(false);
    console.error('Đền Ngọc Sơn GLB không thể tải; mô hình cũ đã bị vô hiệu hóa.', error);
  }, [onTempleLoaded]);
  const reportBridgeLoaded = useCallback(() => onBridgeAssetStatus?.('glb'), [onBridgeAssetStatus]);
  const reportBridgeFailure = useCallback((error: Error) => {
    onBridgeAssetStatus?.('fallback', error.message);
    console.error('Cầu Thê Húc GLB không thể tải; cầu cũ đã bị vô hiệu hóa.', error);
  }, [onBridgeAssetStatus]);
  const reportTowerFailure = useCallback((error: Error) => {
    console.error('Tháp Rùa GLB không thể tải; tháp cũ đã bị vô hiệu hóa.', error);
  }, []);

  const [bridgeStart, bridgeEnd] = bridgeEnds;
  return (
    <>
      <LandmarkSlot
        name="Tháp Rùa" url={landmarkAssets.turtleTower}
        position={[turtleCenter[0], 0.28, turtleCenter[1]]}
        onFailure={reportTowerFailure}
      />
      <LandmarkSlot
        name="Cầu Thê Húc" url={landmarkAssets.theHucBridge}
        position={[bridgeStart[0], 0.35, bridgeStart[1]]}
        rotationY={Math.atan2(bridgeEnd[1] - bridgeStart[1], bridgeStart[0] - bridgeEnd[0])}
        onLoaded={reportBridgeLoaded}
        onFailure={reportBridgeFailure}
      />
      <LandmarkSlot
        name="Đền Ngọc Sơn" url={landmarkAssets.ngocSonTemple}
        position={templePlacement}
        rotationY={templeYaw}
        onLoaded={reportTempleLoaded}
        onFailure={reportTempleFailure}
      />
    </>
  );
}

export const landmarkPositions: Record<string, Point> = {
  'Tháp Rùa': turtleCenter,
  'Đền Ngọc Sơn': templeCenter,
  'Cầu Thê Húc': [
    (bridgeEnds[0][0] + bridgeEnds[1][0]) / 2,
    (bridgeEnds[0][1] + bridgeEnds[1][1]) / 2,
  ],
};
