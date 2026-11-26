import { useThree } from '@react-three/fiber';

/** Dev only: exposes the scene and renderer to the measuring scripts. */
export function PerfProbe() {
  const { scene, gl, camera } = useThree();
  if (import.meta.env.DEV) (window as unknown as { __r3f?: unknown }).__r3f = { scene, gl, camera };
  return null;
}
