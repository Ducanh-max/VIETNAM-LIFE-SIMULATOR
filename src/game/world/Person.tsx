import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { HumanModel, type Expression, type PlayerRig } from '../character/HumanModel';
import { npcOutfit, type NpcRole, type Outfit } from '../character/outfit';

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
 * Hà Nội locals (waiter, grill cook, owner, diners, customers, drivers) on the shared character system:
 * the same rig and body as the player, dressed from an NPC outfit. Animation is driven through a mutable
 * `anim` object so NPC logic can change pose every frame without React re-renders.
 */
export function Person({ anim, shirt = '#f3efe6', pants = '#2d3442', skin, hair, apron, hat, children, seed = 0, role = 'middleAged', outfit }: {
  anim: PersonAnim; shirt?: string; pants?: string; skin?: string; hair?: string; apron?: string; hat?: string; children?: ReactNode; seed?: number; role?: NpcRole; outfit?: Outfit;
}) {
  const o = useMemo(() => outfit ?? npcOutfit(role, seed, {
    top: apron ? 'tee' : 'shirt', tee: shirt, hood: null, sling: false, backpack: false,
    pants, pantsLight: '#' + new THREE.Color(pants).multiplyScalar(1.25).getHexString(), pantsDark: '#' + new THREE.Color(pants).multiplyScalar(0.75).getHexString(), pantsCuff: pants, cargo: false, shorts: false, skirt: false,
    ...(skin ? { skin } : {}), ...(hair ? { hair, hairLight: hair, hairDark: hair } : {}),
    apron: apron ?? null, hat: hat ? 'nonla' : 'none', hatColor: hat ?? '#d9c38a',
  }), [outfit, role, seed, shirt, pants, skin, hair, apron, hat]);
  const rig = useRef<PlayerRig>(null);
  const phase = useRef(seed * 3.7);
  const expr: Expression = anim.mode === 'wave' ? 'happy' : anim.mode === 'eat' ? 'eating' : 'neutral';
  useFrame((_, dt) => {
    const r = rig.current; if (!r || !r.hips) return;
    const a = anim;
    phase.current += dt * (a.mode === 'walk' || a.mode === 'carry' ? 4 + a.speed * 1.3 : a.mode === 'fan' ? 9 : 2.2);
    const s = Math.sin(phase.current);
    const sitting = a.mode === 'sit' || a.mode === 'eat' || a.mode === 'fan';
    r.hips.position.y = sitting ? 0.4 : 0.92 + ((a.mode === 'walk' || a.mode === 'carry') ? Math.abs(s) * 0.03 : 0);
    const legs = (thigh: number, knee: number, swing = 0) => {
      r.hipL.rotation.set(thigh + swing, 0, 0.02); r.hipR.rotation.set(thigh - swing, 0, -0.02);
      r.kneeL.rotation.set(knee + Math.max(0, -swing) * 1.1, 0, 0); r.kneeR.rotation.set(knee + Math.max(0, swing) * 1.1, 0, 0);
    };
    if (sitting) legs(-1.6, 1.7);
    else { const sw = (a.mode === 'walk' || a.mode === 'carry') ? Math.min(1, a.speed / 4) * s * 0.55 : 0; legs(0, 0.05, sw); }
    const arm = (side: 1 | -1, sx: number, sz: number, ex: number) => {
      const sh = side === 1 ? r.shoulderL : r.shoulderR; const el = side === 1 ? r.elbowL : r.elbowR;
      sh.rotation.set(sx, 0, sz); el.rotation.set(ex, 0, 0);
    };
    if (a.mode === 'carry') { arm(1, -0.55, 0.25, -1.0); arm(-1, -0.55, -0.25, -1.0); r.setHand('L', 'open'); r.setHand('R', 'open'); }
    else if (a.mode === 'wave') { arm(-1, -0.2, -2.4 + s * 0.3, -0.6); arm(1, 0, 0.08, -0.1); r.setHand('R', 'open'); }
    else if (a.mode === 'fan') { arm(-1, -0.8, -0.35 - s * 0.35, -0.9); arm(1, -0.6, 0.2, -0.9); r.setHand('R', 'grip'); }
    else if (a.mode === 'eat') { const bite = Math.max(0, s); arm(-1, -0.7 - bite * 0.5, -0.2, -1.1 - bite * 0.7); arm(1, -0.55, 0.2, -1.0); r.setHand('R', 'pinch'); }
    else if (a.mode === 'sit') { arm(1, -0.45, 0.12, -0.8); arm(-1, -0.45, -0.12, -0.8); }
    else if (a.mode === 'walk') { const sw = Math.min(1, a.speed / 4) * s * 0.5; arm(1, -sw, 0.08, -0.2); arm(-1, sw, -0.08, -0.2); }
    else { arm(1, Math.sin(phase.current * 0.4) * 0.04, 0.08, -0.15); arm(-1, -Math.sin(phase.current * 0.4) * 0.04, -0.08, -0.15); }
    r.head.rotation.x = a.mode === 'eat' ? 0.25 : 0;
  });
  return <group>
    <HumanModel ref={rig} outfit={o} expression={expr} detail="low" idleLook={anim.mode === 'stand'} />
    {children}
  </group>;
}