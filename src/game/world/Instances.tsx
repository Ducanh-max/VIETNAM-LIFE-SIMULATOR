import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/** Renders many copies of one geometry in a single draw call. */
export function Instances({ geometry, material, matrices, colors, castShadow = true, receiveShadow = true }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors?: THREE.Color[]; castShadow?: boolean; receiveShadow?: boolean;
}) {
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
    return instanced;
  }, [geometry, material, matrices, colors, castShadow, receiveShadow]);
  useEffect(() => () => { mesh.dispose(); }, [mesh]);
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
