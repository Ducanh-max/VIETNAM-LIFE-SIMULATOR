import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { Quaternion, Vector3 } from 'three';

// The lake, landmarks and street furniture are static. Keep the shadow map
// at its configured resolution; moving the character/camera still updates it
// every frame. A periodic refresh catches asynchronously mounted landmarks.
export function ShadowUpdates({ lighting }: { lighting: string }) {
  const gl = useThree((state) => state.gl);
  const last = useRef({ position: new Vector3(), rotation: new Quaternion(), refresh: -1 });
  useLayoutEffect(() => {
    const previous = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => { gl.shadowMap.autoUpdate = previous; };
  }, [gl, lighting]);
  useFrame(({ camera, clock }) => {
    if (!gl.shadowMap.enabled) return;
    const stamp = last.current;
    if (clock.elapsedTime - stamp.refresh < 1 &&
        stamp.position.distanceToSquared(camera.position) < 0.000001 &&
        stamp.rotation.angleTo(camera.quaternion) < 0.0001) return;
    gl.shadowMap.needsUpdate = true;
    stamp.refresh = clock.elapsedTime;
    stamp.position.copy(camera.position);
    stamp.rotation.copy(camera.quaternion);
  });
  return null;
}
