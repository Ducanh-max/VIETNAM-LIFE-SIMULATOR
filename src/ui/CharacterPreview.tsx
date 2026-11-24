import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { Avatar } from '../game/Avatar';
import type { Expression } from '../game/PlayerLook';

const EXPRESSIONS: { id: Expression; label: string }[] = [
  { id: 'neutral', label: 'Bình thường' },
  { id: 'happy', label: 'Vui vẻ' },
  { id: 'surprised', label: 'Ngạc nhiên' },
];

function Turntable({ expression }: { expression: { current: Expression | null } }) {
  const group = useRef<THREE.Group>(null);
  const speed = useRef(0);
  useFrame((_, dt) => { if (group.current) group.current.rotation.y += dt * 0.6; });
  return <group ref={group} position={[0, -1.05, 0]}><Avatar speed={speed} expressionOverride={expression} /></group>;
}

/** Turntable preview of the player character on the destination screen. */
export function CharacterPreview({ name }: { name: string }) {
  const [expr, setExpr] = useState<Expression>('happy');
  const ref = useRef<Expression | null>('happy');
  ref.current = expr;
  return <div className="character-card">
    <span className="character-kicker">NHÂN VẬT CỦA BẠN</span>
    <strong>{name}</strong>
    <div className="character-stage">
      <Canvas camera={{ position: [0, 0.15, 3.5], fov: 32 }} dpr={[1, 2]} gl={{ antialias: true }} onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 3]} intensity={2.2} />
        <directionalLight position={[-3, 1, -2]} intensity={0.6} color="#cfe0ff" />
        <Turntable expression={ref} />
        <mesh position={[0, -1.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.6, 32]} /><meshStandardMaterial color="#2a4a42" transparent opacity={0.6} /></mesh>
      </Canvas>
    </div>
    <div className="character-moods">{EXPRESSIONS.map((e) => <button key={e.id} className={expr === e.id ? 'on' : ''} onClick={() => setExpr(e.id)}>{e.label}</button>)}</div>
  </div>;
}
