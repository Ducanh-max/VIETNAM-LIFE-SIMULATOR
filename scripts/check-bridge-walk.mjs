// Run the same X-then-Z collision checks as the keyboard controller.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
try {
  const { bridgeEnds, bridgeDirection, canWalk, positionOnBridge, templePlacement, templeYaw } =
    await server.ssrLoadModule('/src/world/geo.ts');
  const { isBuildingCollision } = await server.ssrLoadModule('/src/world/Urban.tsx');
  const [shore, island] = bridgeEnds;
  const c = Math.cos(templeYaw);
  const s = Math.sin(templeYaw);
  const fromTemple = (x, z) => [templePlacement[0] + c * x + s * z, templePlacement[2] - s * x + c * z];
  const midpoint = [(shore[0] + island[0]) / 2, (shore[1] + island[1]) / 2];
  const stopPoints = [shore, midpoint, island, fromTemple(12.93, 7.6), fromTemple(9.84, 7.6), fromTemple(7.5, 7.6)];
  for (const speed of [5.2, 9]) {
    const at = [shore[0] - bridgeDirection[0] * 5.5, shore[1] - bridgeDirection[1] * 5.5];
    for (const goal of stopPoints) {
      let distance;
      while ((distance = Math.hypot(goal[0] - at[0], goal[1] - at[1])) > 1e-6) {
        const fraction = Math.min(1, speed * 0.05 / distance);
        const candidate = at.map((p, i) => p + (goal[i] - p) * fraction);
        for (const [x, z] of [[candidate[0], at[1]], candidate]) {
          assert(canWalk([x, z], true) && !isBuildingCollision([x, z]), `Route blocked at (${x}, ${z})`);
        }
        at.splice(0, 2, ...candidate);
        assert(positionOnBridge(at) >= .35);
      }
    }
  }
  for (const side of [-1, 1]) {
    const across = [
      midpoint[0] - side * bridgeDirection[1] * 1.45,
      midpoint[1] + side * bridgeDirection[0] * 1.45,
    ];
    assert(!canWalk(across, true), 'Cannot leave bridge over water');
    assert(!canWalk(fromTemple(11.38, 7.6 + side * .9), true), 'Cannot pass through a gate jamb');
  }
  assert(Math.abs(positionOnBridge(midpoint) - 2.75) < .001);
  console.log('Walk and run passed at 50 ms steps. Stops (x, y, z):',
    stopPoints.map(p => [p[0], positionOnBridge(p), p[1]].map(v => v.toFixed(2)).join(', ')).join(' → '));
} finally {
  await server.close();
}
