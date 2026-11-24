import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Instance sets bigger than this only draw the copies within STREAM_RADIUS of the camera. */
const STREAM_MIN = 400;
const STREAM_RADIUS = 560;

/**
 * Renders many copies of one geometry in a single draw call. Large sets (trees, street furniture over
 * the whole ±1.3 km map) are streamed: a few times a second, when the camera has moved, only the
 * copies near the camera are written into the instance buffer — still one draw call, far fewer triangles.
 */
export function Instances({ geometry, material, matrices, colors, castShadow = true, receiveShadow = true }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors?: THREE.Color[]; castShadow?: boolean; receiveShadow?: boolean;
}) {
  const stream = matrices.length > STREAM_MIN;
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
    instanced.count = matrices.length;
    matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    colors?.forEach((color, i) => instanced.setColorAt(i, color));
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.castShadow = castShadow;
    instanced.receiveShadow = receiveShadow;
    instanced.computeBoundingBox();
    instanced.computeBoundingSphere();
    if (stream) instanced.frustumCulled = false; // the streamed subset changes; it is always near the camera
    return instanced;
  }, [geometry, material, matrices, colors, castShadow, receiveShadow, stream]);
  useEffect(() => () => { mesh.dispose(); }, [mesh]);
  const s = useRef({ t: 0, last: new THREE.Vector3(Infinity, 0, 0), local: new THREE.Vector3(), inv: new THREE.Matrix4() });
  const pos = useMemo(() => (stream ? Float32Array.from(matrices.flatMap((m) => [m.elements[12], m.elements[14]])) : null), [matrices, stream]);
  useFrame((state, dt) => {
    if (!pos) return;
    const st = s.current;
    st.t -= dt;
    if (st.t > 0) return;
    st.t = 0.3;
    const cam = state.camera.position;
    if (cam.distanceToSquared(st.last) < 15 * 15) return;
    st.last.copy(cam);
    mesh.updateWorldMatrix(true, false);
    st.local.copy(cam).applyMatrix4(st.inv.copy(mesh.matrixWorld).invert());
    const r2 = STREAM_RADIUS * STREAM_RADIUS;
    let n = 0;
    for (let i = 0; i < matrices.length; i++) {
      const dx = pos[i * 2] - st.local.x, dz = pos[i * 2 + 1] - st.local.z;
      if (dx * dx + dz * dz > r2) continue;
      mesh.setMatrixAt(n, matrices[i]);
      if (colors && mesh.instanceColor) mesh.setColorAt(n, colors[i]);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
export function trs(x: number, y: number, z: number, rotY = 0, sx = 1, sy = sx, sz = sx, rotX = 0, rotZ = 0) {
  tmpQ.setFromEuler(tmpE.set(rotX, rotY, rotZ));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

/** Box-shaped bar from a to b with the given cross-section. */
export function barMatrix(a: THREE.Vector3, b: THREE.Vector3, thickness: number, depth: number) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(length, thickness, depth));
}

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitSphere = new THREE.SphereGeometry(0.5, 12, 9);
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
