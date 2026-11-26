import { useFrame } from '@react-three/fiber';
import { groundHeight } from '../geo';
import { bagStore, nearestSeat, seatState, sitOn, standUp, stepHeld } from '../bag';
import { bike, game, player } from '../state';
import { shopStore } from '../shops';
import { dineStore, tableOfSeat } from './Dine';

/**
 * Sitting down on any bench or stool (E near it, E again to get up), and the clock for eating and drinking what
 * you took out of the balo. Reading starts by itself when you sit with a book in your hands (ui/Backpack.tsx).
 */
export function Seats({ paused }: { paused: boolean }) {
  useFrame((_, delta) => {
    if (paused) return;
    stepHeld(Math.min(delta, 0.05));
    const s = game.get();
    if (seatState.mine && !player.seat) seatState.mine = null; // someone else stood the player up
    if (seatState.mine && bike.riding) standUp();
    if (seatState.mine) {
      const reading = bagStore.get().held?.kind === 'book';
      game.offer({ id: 'stand-up', text: reading ? 'Đứng dậy (đang đọc sách)' : 'Đứng dậy', key: 'E', priority: 6, run: () => standUp() });
      return;
    }
    if (player.seat || bike.riding || s.phase !== 'none' || s.ride?.stage === 'riding') return;
    const seat = nearestSeat([player.position.x, player.position.z], 1.1);
    if (!seat) return;
    const book = bagStore.get().held?.kind === 'book';
    const table = tableOfSeat(seat);
    game.offer({ id: 'sit-seat', text: table ? 'Ngồi xuống & gọi phở' : `${seat.kind === 'bench' ? 'Ngồi xuống ghế đá' : 'Ngồi xuống ghế'}${book ? ' đọc sách' : ''}`, key: 'E', priority: table ? 7 : 4, run: () => {
      sitOn(seat, groundHeight(seat.p));
      if (table && !dineStore.get()) shopStore.set({ counter: table.shop, dine: true });
    } });
  });
  return null;
}
