import { Clone, useGLTF } from '@react-three/drei';
import { useEffect } from 'react';

export default function LandmarkModel({ url, position, rotationY = 0, onLoaded }: { url: string; position: [number, number, number]; rotationY?: number; onLoaded?: () => void }) {
  const { scene } = useGLTF(url, '/draco/');
  useEffect(() => { onLoaded?.(); }, [onLoaded]);
  return <group position={position} rotation={[0, rotationY, 0]}><Clone object={scene} castShadow receiveShadow /></group>;
}
