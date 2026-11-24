import * as THREE from 'three';

/**
 * Vietnamese hip roof (mái chồng diêm style): concave slopes, a straight ridge and
 * eave corners that curl upward (đầu đao). Base is centred at y = 0.
 * width/depth are the eave extents; ridge is the ridge length along X.
 */
export function curvedRoofGeometry(width: number, depth: number, rise: number, { ridge = width * 0.45, curl = 0.9, segments = 20 } = {}) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hw = width / 2;
  const hd = depth / 2;
  const ridgeHalf = Math.min(ridge / 2, hw - 0.01);
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const u = (i / segments) * 2 - 1;
      const v = (j / segments) * 2 - 1;
      const x = u * hw;
      const z = v * hd;
      // Normalised distance from the ridge line to the eave (0 at ridge, 1 at eave).
      const dx = Math.max(0, Math.abs(x) - ridgeHalf) / (hw - ridgeHalf);
      const dz = Math.abs(z) / hd;
      const m = Math.min(1, Math.max(dx, dz));
      const concave = Math.pow(1 - m, 1.6);
      const corner = Math.pow(Math.min(Math.abs(u), 1), 6) * Math.pow(Math.min(Math.abs(v), 1), 6);
      const edge = Math.pow(m, 8);
      const y = rise * concave + curl * (corner * 1.0 + edge * 0.18);
      positions.push(x, y, z);
      uvs.push(x, z + y);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
    const a = j * row + i;
    indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Upturned dragon-tail ornament for a roof corner, as a tapered tube. */
export function cornerCurlGeometry(length = 1.1, lift = 0.8) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(length * 0.55, lift * 0.15, 0),
    new THREE.Vector3(length * 0.9, lift * 0.55, 0),
    new THREE.Vector3(length * 0.8, lift, 0),
    new THREE.Vector3(length * 0.6, lift * 1.05, 0),
  ]);
  return new THREE.TubeGeometry(curve, 16, 0.08, 6, false);
}

/** Ridge ornament: a stylised dragon/cloud scroll used on ridge ends. */
export function ridgeDragonGeometry(size = 1) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25 * size, 0.35 * size, 0),
    new THREE.Vector3(0.05 * size, 0.7 * size, 0),
    new THREE.Vector3(-0.3 * size, 0.6 * size, 0),
    new THREE.Vector3(-0.25 * size, 0.35 * size, 0),
    new THREE.Vector3(-0.05 * size, 0.4 * size, 0),
  ]);
  return new THREE.TubeGeometry(curve, 24, 0.09 * size, 7, false);
}
