import { BufferAttribute, BufferGeometry, Mesh } from 'three';

// In the supplied GLB the outside face of the gate's south pier runs along
// local Z=11.90 m. The reconstruction includes broken, paper-thin sheets
// protruding to Z=12.66 at its foot. Two separate stone sheets and the loose
// plaster fringe are visible in the matched temple camera.
const gateMaterials = new Set([
  'Di sản v2 | Gờ bậc và đá chạm',
  'Di sản v2 | Vữa vôi của cổng và tường',
]);

export function trimGateBase(mesh: Mesh): (() => void) | undefined {
  if (Array.isArray(mesh.material) || !gateMaterials.has(mesh.material.name)) return;
  const source = mesh.geometry;
  const index = source.index;
  if (!index) return;
  const position = source.getAttribute('position');
  const inFringe = (i: number) => position.getZ(i) > 12.05
    && position.getX(i) > 10.9 && position.getX(i) < 12.85
    && position.getY(i) < 2.65;
  const visible = new Uint32Array(index.count);
  let count = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (inFringe(a) && inFringe(b) && inFringe(c)) continue;
    visible[count++] = a;
    visible[count++] = b;
    visible[count++] = c;
  }
  if (count === index.count) return;
  // Share the GLB vertex/normal/UV buffers. Only the gameplay clone receives
  // the smaller index, leaving the source scene and review viewer untouched.
  const trimmed = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) trimmed.setAttribute(name, attribute);
  trimmed.setIndex(new BufferAttribute(visible.subarray(0, count), 1));
  trimmed.boundingBox = source.boundingBox;
  trimmed.boundingSphere = source.boundingSphere;
  mesh.geometry = trimmed;
  return () => {
    mesh.geometry = source;
    // These buffers are owned by the shared source geometry.
    for (const name of Object.keys(trimmed.attributes)) trimmed.deleteAttribute(name);
    trimmed.dispose();
  };
}
