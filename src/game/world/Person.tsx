import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';

/** Floating name label above an NPC ("Đạt · Nướng chả"). */
export function NameTag({ name, role, y = 2.35, color = '#e6bd83' }: { name: string; role?: string; y?: number; color?: string }) {
  const material = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(16,38,34,.82)';
    const r = 26; ctx.beginPath(); ctx.moveTo(r, 8); ctx.arcTo(504, 8, 504, 120, r); ctx.arcTo(504, 120, 8, 120, r); ctx.arcTo(8, 120, 8, 8, r); ctx.arcTo(8, 8, 504, 8, r); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 50px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText(name, 256, role ? 50 : 64, 470);
    if (role) { ctx.fillStyle = color; ctx.font = '600 28px "Be Vietnam Pro", Arial, sans-serif'; ctx.fillText(role, 256, 96, 470); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true });
  }, [name, role, color]);
  return <sprite material={material} position={[0, y, 0]} scale={[1.1, 0.275, 1]} />;
}

export type PersonAnim = { mode: 'stand' | 'walk' | 'sit' | 'eat' | 'fan' | 'carry' | 'wave'; speed: number };

/**
 * Low-poly Hà Nội local used for NPCs (waiter, grill cook, diners). Animation is driven through a
 * mutable `anim` object so NPC logic can change pose every frame without React re-renders.
 */
export function Person({ anim, shirt = '#f3efe6', pants = '#2d3442', skin = '#c99a78', hair = '#1b1715', apron, hat, children, seed = 0 }: {
  anim: PersonAnim; shirt?: string; pants?: string; skin?: string; hair?: string; apron?: string; hat?: string; children?: ReactNode; seed?: number;
}) {
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const phase = useRef(seed * 3.7);
  const mats = useMemo(() => ({
    shirt: new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85 }),
    skin: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
    hair: new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 }),
    apron: apron ? new THREE.MeshStandardMaterial({ color: apron, roughness: 0.8 }) : null,
    hat: hat ? new THREE.MeshStandardMaterial({ color: hat, roughness: 0.8 }) : null,
    shoe: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 }),
  }), [shirt, pants, skin, hair, apron, hat]);
  useFrame((_, dt) => {
    const a = anim;
    phase.current += dt * (a.mode === 'walk' || a.mode === 'carry' ? 4 + a.speed * 1.3 : a.mode === 'fan' ? 9 : 2.2);
    const s = Math.sin(phase.current);
    const L0 = legs[0].current, L1 = legs[1].current, A0 = arms[0].current, A1 = arms[1].current;
    if (!L0 || !L1 || !A0 || !A1 || !body.current) return;
    const sitting = a.mode === 'sit' || a.mode === 'eat' || a.mode === 'fan';
    body.current.position.y = sitting ? -0.52 : (a.mode === 'walk' || a.mode === 'carry') ? Math.abs(s) * 0.04 : 0;
    if (sitting) {
      L0.rotation.set(-1.35, 0, 0.1); L1.rotation.set(-1.35, 0, -0.1);
    } else {
      const swing = (a.mode === 'walk' || a.mode === 'carry') ? Math.min(1, a.speed / 4) * s * 0.55 : 0;
      L0.rotation.set(swing, 0, 0); L1.rotation.set(-swing, 0, 0);
    }
    if (a.mode === 'wave') { A0.rotation.set(-0.3, 0, -2.5 + Math.sin(phase.current * 3) * 0.35); A1.rotation.set(0, 0, -0.06); }
    else if (a.mode === 'carry') { A0.rotation.set(-1.25, 0, 0.25); A1.rotation.set(-1.25, 0, -0.25); }
    else if (a.mode === 'fan') { A0.rotation.set(-0.9, 0, 0.3 + s * 0.35); A1.rotation.set(-0.6, 0, -0.1); }
    else if (a.mode === 'eat') { const bite = Math.max(0, s); A0.rotation.set(-0.9 - bite * 0.9, 0, 0.15); A1.rotation.set(-0.75, 0, -0.1); }
    else if (a.mode === 'sit') { A0.rotation.set(-0.5, 0, 0.1); A1.rotation.set(-0.5, 0, -0.1); }
    else if (a.mode === 'walk') { const swing = Math.min(1, a.speed / 4) * s * 0.5; A0.rotation.set(-swing, 0, 0.05); A1.rotation.set(swing, 0, -0.05); }
    else { A0.rotation.set(Math.sin(phase.current * 0.4) * 0.05, 0, 0.06); A1.rotation.set(-Math.sin(phase.current * 0.4) * 0.05, 0, -0.06); }
    if (head.current) head.current.rotation.set(a.mode === 'eat' ? 0.25 : 0, Math.sin(phase.current * 0.21) * 0.25, 0);
  });
  return <group ref={body}>
    <mesh position={[0, 1.25, 0]} castShadow material={mats.shirt}><capsuleGeometry args={[0.23, 0.5, 6, 12]} /></mesh>
    {mats.apron && <mesh position={[0, 1.08, 0.2]} castShadow material={mats.apron}><boxGeometry args={[0.42, 0.62, 0.04]} /></mesh>}
    <mesh position={[0, 0.98, 0]} castShadow material={mats.pants}><cylinderGeometry args={[0.24, 0.23, 0.16, 12]} /></mesh>
    <group ref={head}>
      <mesh position={[0, 1.66, 0]} material={mats.skin}><cylinderGeometry args={[0.07, 0.08, 0.12, 8]} /></mesh>
      <mesh position={[0, 1.84, 0]} castShadow material={mats.skin}><sphereGeometry args={[0.17, 16, 12]} /></mesh>
      <mesh position={[0, 1.92, -0.02]} castShadow material={mats.hair}><sphereGeometry args={[0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1]} /></mesh>
      {mats.hat && <mesh position={[0, 2.0, 0]} castShadow material={mats.hat}><coneGeometry args={[0.36, 0.2, 18]} /></mesh>}
    </group>
    {[-1, 1].map((side, i) => <group key={`l${side}`} ref={legs[i]} position={[side * 0.12, 0.92, 0]}>
      <mesh position={[0, -0.42, 0]} castShadow material={mats.pants}><capsuleGeometry args={[0.09, 0.62, 4, 8]} /></mesh>
      <mesh position={[0, -0.86, 0.06]} castShadow material={mats.shoe}><boxGeometry args={[0.15, 0.09, 0.3]} /></mesh>
    </group>)}
    {[-1, 1].map((side, i) => <group key={`a${side}`} ref={arms[i]} position={[side * 0.3, 1.52, 0]}>
      <mesh position={[0, -0.3, 0]} castShadow material={mats.shirt}><capsuleGeometry args={[0.07, 0.45, 4, 8]} /></mesh>
      <mesh position={[0, -0.6, 0]} material={mats.skin}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
    </group>)}
    {children}
  </group>;
}
