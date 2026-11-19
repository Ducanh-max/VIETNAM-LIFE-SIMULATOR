import { Clone, useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Group, Mesh } from 'three';
import { landmarkAssets } from './landmarkAssets';
import { trimGateBase } from './templeGate';

export default function LandmarkModel({ url, position, rotationY = 0, onLoaded }: { url: string; position: [number, number, number]; rotationY?: number; onLoaded?: () => void }) {
  const { scene } = useGLTF(url, '/draco/');
  const instance = useRef<Group>(null);
  useLayoutEffect(() => {
    if (url !== landmarkAssets.ngocSonTemple || !instance.current) return;
    // Change only the transform on the mounted gameplay clone. The material
    // identifies the original brick paving independently of GLTFLoader's
    // object-name sanitisation. Its typical world height is -0.247 m.
    const brick = instance.current.getObjectsByProperty('type', 'Mesh').find(
      node => node instanceof Mesh && node.material.name === 'Di sản v2 | Gạch đỏ đất và mạch'
    );
    if (!brick) return;
    const initialHeight = brick.position.y;
    brick.position.y = initialHeight + 0.594;
    const restore: (() => void)[] = [];
    instance.current.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const undo = trimGateBase(node);
      if (undo) restore.push(undo);
    });
    return () => {
      brick.position.y = initialHeight;
      restore.forEach(undo => undo());
    };
  }, [url, scene]);
  useEffect(() => { onLoaded?.(); }, [onLoaded]);
  return <group ref={instance} position={position} rotation={[0, rotationY, 0]}><Clone object={scene} castShadow receiveShadow /></group>;
}
