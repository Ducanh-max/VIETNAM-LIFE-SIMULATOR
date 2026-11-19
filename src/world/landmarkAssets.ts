/** Set a path only after a licensed GLB has been optimized and checked at game scale. */
const bridgeVersion = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || import.meta.env.VITE_BUILD_COMMIT || 'bridge-deck-height-1';
export const landmarkAssets: Record<'turtleTower' | 'theHucBridge' | 'ngocSonTemple', string | null> = {
  turtleTower: '/models/thap-rua-heritage.glb',
  theHucBridge: `/models/cau-the-huc-heritage.glb?v=${bridgeVersion.slice(0, 12)}`,
  ngocSonTemple: '/models/den-ngoc-son-heritage.glb',
};
