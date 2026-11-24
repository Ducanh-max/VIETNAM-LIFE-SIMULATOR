import { forwardRef } from 'react';
import { HumanModel, type Detail, type Expression, type PlayerRig } from './character/HumanModel';
import { PLAYER_OUTFIT, type Outfit } from './character/outfit';

export type { Expression, HandPose, PlayerRig } from './character/HumanModel';
export { PLAYER_DIMENSIONS } from './character/HumanModel';

/**
 * The player character: the shared HumanModel dressed in the player's outfit. While shipping, the
 * crossbody bag is swapped for the delivery backpack.
 */
export const PlayerModel = forwardRef<PlayerRig, { expression?: Expression; shipperBag?: boolean; outfit?: Outfit; idleLook?: boolean; detail?: Detail }>(
  function PlayerModel({ expression = 'neutral', shipperBag = false, outfit = PLAYER_OUTFIT, idleLook = false, detail = 'high' }, ref) {
    const o = shipperBag ? { ...outfit, sling: false, backpack: true } : outfit;
    return <HumanModel ref={ref} outfit={o} expression={expression} idleLook={idleLook} detail={detail} />;
  });
