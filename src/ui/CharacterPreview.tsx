import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { Avatar } from '../game/Avatar';
import { HAIR_PRESETS, JACKET_PRESETS } from '../game/character/outfit';
import type { Expression } from '../game/PlayerModel';
import { setOutfit, useGame } from '../game/state';

const EXPRESSIONS: { id: Expression; label: string }[] = [
  { id: 'neutral', label: 'Bình thường' }, { id: 'smile', label: 'Mỉm cười' }, { id: 'happy', label: 'Vui vẻ' }, { id: 'laugh', label: 'Cười lớn' },
  { id: 'surprised', label: 'Ngạc nhiên' }, { id: 'sad', label: 'Buồn' }, { id: 'angry', label: 'Tức giận' }, { id: 'confused', label: 'Bối rối' },
  { id: 'talking', label: 'Nói chuyện' }, { id: 'eating', label: 'Đang ăn' }, { id: 'drinking', label: 'Đang uống' }, { id: 'closed', label: 'Nhắm mắt' },
];

function Turntable({ expression, close }: { expression: { current: Expression | null }; close: boolean }) {
  const group = useRef<THREE.Group>(null);
  const speed = useRef(0);
  useFrame((state, dt) => {
    if (group.current) group.current.rotation.y += dt * (close ? 0.25 : 0.6);
    const cam = state.camera;
    const target = close ? new THREE.Vector3(0, 0.66, 1.25) : new THREE.Vector3(0, 0.15, 3.5);
    cam.position.lerp(target, 1 - Math.exp(-dt * 5));
    cam.lookAt(0, close ? 0.58 : 0.0, 0);
  });
  return <group ref={group} position={[0, -0.95, 0]}><Avatar speed={speed} expressionOverride={expression} /></group>;
}

/** Turntable preview of the player character, with expressions and a few outfit options (saved). */
export function CharacterPreview({ name }: { name: string }) {
  const [expr, setExpr] = useState<Expression>('smile');
  const [close, setClose] = useState(false);
  const outfit = useGame((s) => s.outfit);
  const ref = useRef<Expression | null>('smile');
  ref.current = expr;
  return <div className="character-card">
    <span className="character-kicker">NHÂN VẬT CỦA BẠN</span>
    <strong>{name}</strong>
    <div className="character-stage">
      <Canvas camera={{ position: [0, 0.15, 3.5], fov: 32 }} dpr={[1, 2]} gl={{ antialias: true }} onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}>
        <hemisphereLight args={['#fff6e8', '#3a4a44', 0.9]} />
        <directionalLight position={[2, 3, 3]} intensity={2.0} />
        <directionalLight position={[-3, 1.5, -2]} intensity={0.8} color="#cfe0ff" />
        <Turntable expression={ref} close={close} />
        <mesh position={[0, -0.955, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.6, 32]} /><meshStandardMaterial color="#2a4a42" transparent opacity={0.6} /></mesh>
      </Canvas>
      <button className="character-zoom" onClick={() => setClose(!close)}>{close ? 'Toàn thân' : 'Cận mặt'}</button>
    </div>
    <select className="character-select" value={expr} onChange={(e) => setExpr(e.target.value as Expression)} aria-label="Biểu cảm">
      {EXPRESSIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
    </select>
    <div className="character-swatches"><span>Áo khoác</span>{JACKET_PRESETS.map((p) => <button key={p.name} title={p.name} aria-label={p.name} className={outfit.jacket === p.jacket ? 'on' : ''} style={{ background: p.jacket }} onClick={() => setOutfit({ jacket: p.jacket, jacketLight: p.light, jacketDark: p.dark, jacketTrim: p.trim })} />)}</div>
    <div className="character-swatches"><span>Tóc</span>{HAIR_PRESETS.map((p) => <button key={p.name} title={p.name} aria-label={p.name} className={outfit.hair === p.hair ? 'on' : ''} style={{ background: p.hair }} onClick={() => setOutfit({ hair: p.hair, hairLight: p.light, hairDark: p.dark })} />)}</div>
    <div className="character-swatches"><span>Phụ kiện</span>
      <button className={`chip ${outfit.sling ? 'on' : ''}`} onClick={() => setOutfit({ sling: !outfit.sling, backpack: false })}>Túi chéo</button>
      <button className={`chip ${outfit.backpack ? 'on' : ''}`} onClick={() => setOutfit({ backpack: !outfit.backpack, sling: false })}>Balo</button>
      <button className={`chip ${outfit.glasses ? 'on' : ''}`} onClick={() => setOutfit({ glasses: !outfit.glasses })}>Kính</button>
      <button className={`chip ${outfit.hat === 'cap' ? 'on' : ''}`} onClick={() => setOutfit({ hat: outfit.hat === 'cap' ? 'none' : 'cap', hatColor: '#1d1d1f' })}>Mũ</button>
    </div>
  </div>;
}
