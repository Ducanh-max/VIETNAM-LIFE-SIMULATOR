import { forwardRef, useMemo } from 'react';
import { ChibiModel, type Expression, type Lod, type PlayerRig } from './character/ChibiModel';
import { PLAYER_OUTFIT, type Outfit } from './character/outfit';

export type { Expression, HandPose, PlayerRig } from './character/ChibiModel';
export { PLAYER_DIMENSIONS } from './character/ChibiModel';

/**
 * The player character: the shared chibi model dressed in the player's outfit, with real shadows and
 * all three LODs (full detail up close). While shipping, the crossbody bag becomes the delivery backpack.
 */
export const PlayerModel = forwardRef<PlayerRig, { expression?: Expression; shipperBag?: boolean; outfit?: Outfit; idleLook?: boolean; lod?: Lod }>(
  function PlayerModel({ expression = 'neutral', shipperBag = false, outfit = PLAYER_OUTFIT, idleLook = false, lod }, ref) {
    const o = useMemo(() => (shipperBag ? { ...outfit, sling: false, backpack: true } : outfit), [outfit, shipperBag]);
    return <ChibiModel ref={ref} outfit={o} expression={expression} idleLook={idleLook} castShadow lodLevels={lod === undefined ? [0, 1, 2] : [lod, lod, lod]} lodDistances={[16, 45]} />;
  });
