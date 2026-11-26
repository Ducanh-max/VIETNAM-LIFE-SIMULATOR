import { useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import * as THREE from 'three';

/**
 * Draws its children only while the camera is within \`r\` metres of \`at\` (with a little hysteresis). Detailed
 * places (Đền Ngọc Sơn and its interior, the bún chả shop row, the landmarks, the street stalls) are hundreds of
 * small meshes each: drawing them from across the city cost frames for things hidden by fog and buildings.
 */
export function Near({ at, r, children }: { at: [number, number]; r: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const o = g.current; if (!o) return;
    const d = Math.hypot(camera.position.x - at[0], camera.position.z - at[1]);
    if (o.visible && d > r * 1.08) o.visible = false;
    else if (!o.visible && d < r) o.visible = true;
  });
  return <group ref={g}>{children}</group>;
}
