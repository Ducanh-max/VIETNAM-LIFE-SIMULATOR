import { Clone, useGLTF } from '@react-three/drei';

export default function LandmarkModel({ url, position, rotationY = 0 }: { url: string; position: [number, number, number]; rotationY?: number }) {
  const { scene } = useGLTF(url);
  return <group position={position} rotation={[0, rotationY, 0]}><Clone object={scene} castShadow receiveShadow /></group>;
}
