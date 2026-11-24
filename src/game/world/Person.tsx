import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { BlobShadow, ChibiModel, PLAYER_DIMENSIONS as PD, type Expression, type PlayerRig } from '../character/ChibiModel';
import { npcOutfit, type NpcRole, type Outfit } from '../character/outfit';

/** Floating name label above an NPC ("Đạt · Nướng chả"). */
export function NameTag({ name, role, y = 1.85, color = '#e6bd83' }: { name: string; role?: string; y?: number; color?: string }) {
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

export type PersonAnim = { mode: 'stand' | 'walk' | 'sit' | 'eat' | 'fan' | 'carry' | 'wave' | 'phone' | 'talk' | 'ride' | 'drive'; speed: number };
/** Hips height of a seated chibi (on a low stool or a vehicle seat: place the Person so its origin is SIT_HIP below the seat). */
export const SIT_HIP = PD.sitHip;

/**
 * Hà Nội locals (waiter, grill cook, owner, diners, customers, drivers, walkers) on the shared chibi
 * character: the same rig and factory as the player, configured from an NPC outfit (role, skin, hair
 * style/colour, clothes, accessories). Animation is driven through a mutable `anim` object so NPC logic
 * can change pose every frame without React re-renders. NPCs use LOD 1 up close and LOD 2 further away,
 * a blob shadow instead of shadow maps, and update their pose less often when far.
 */
export function Person({ anim, shirt = '#f3efe6', pants = '#2d3442', skin, hair, apron, hat, children, seed = 0, role = 'middleAged', outfit, expression }: {
  anim: PersonAnim; shirt?: string; pants?: string; skin?: string; hair?: string; apron?: string; hat?: string; children?: ReactNode; seed?: number; role?: NpcRole; outfit?: Outfit; expression?: Expression;
}) {
  const o = useMemo(() => outfit ?? npcOutfit(role, seed, {
    top: apron ? 'tee' : 'shirt', tee: shirt, hood: null, sling: false, backpack: false,
    pants, pantsLight: '#' + new THREE.Color(pants).multiplyScalar(1.25).getHexString(), pantsDark: '#' + new THREE.Color(pants).multiplyScalar(0.75).getHexString(), pantsCuff: '#' + new THREE.Color(pants).multiplyScalar(1.4).getHexString(), cargo: false, shorts: false, skirt: false,
    ...(skin ? { skin } : {}), ...(hair ? { hair, hairLight: '#' + new THREE.Color(hair).multiplyScalar(1.4).getHexString(), hairDark: '#' + new THREE.Color(hair).multiplyScalar(0.7).getHexString() } : {}),
    apron: apron ?? null, hat: hat ? 'nonla' : 'none', hatColor: hat ?? '#d9c38a',
  }), [outfit, role, seed, shirt, pants, skin, hair, apron, hat]);
  const rig = useRef<PlayerRig>(null);
  const phase = useRef(seed * 3.7);
  const skip = useRef(seed % 3);
  const acc = useRef(0);
  const expr: Expression = expression ?? (anim.mode === 'wave' ? 'happy' : anim.mode === 'eat' ? 'eating' : anim.mode === 'talk' ? 'talking' : anim.mode === 'phone' ? 'smile' : 'neutral');
  useFrame((_, delta) => {
    const r = rig.current; if (!r || !r.hips) return;
    // far NPCs (LOD 2) update their pose every third frame
    acc.current += Math.min(delta, 0.05);
    if (r.lod() === 2 && (skip.current = (skip.current + 1) % 3) !== 0) return;
    const dt = acc.current; acc.current = 0;
    const a = anim;
    const walking = a.mode === 'walk' || a.mode === 'carry';
    // walk cycle advances with distance covered (step ≈ 0.45 m)
    phase.current += walking ? (a.speed * dt / 0.45) * Math.PI : dt * (a.mode === 'fan' ? 9 : 2.2);
    const s = Math.sin(phase.current);
    const sitting = a.mode === 'sit' || a.mode === 'eat' || a.mode === 'fan' || a.mode === 'ride' || a.mode === 'drive';
    const A = walking ? Math.min(1, a.speed / 1.2) * 0.5 : 0;
    const sw = s * A;
    r.hips.position.set(0, sitting ? SIT_HIP : PD.hipY - (walking ? (PD.hipY - PD.hipDrop) * (1 - Math.cos(sw)) : 0), 0);
    r.hips.rotation.set(0, walking ? s * 0.1 : 0, 0);
    const legs = (thigh: number, knee: number, swing = 0, splay = 0.02) => {
      r.hipL.rotation.set(thigh - swing, 0, splay); r.hipR.rotation.set(thigh + swing, 0, -splay);
      r.kneeL.rotation.set(knee + (walking ? 0.6 * A * Math.max(0, Math.cos(phase.current)) * 2 : 0), 0, 0); r.kneeR.rotation.set(knee + (walking ? 0.6 * A * Math.max(0, -Math.cos(phase.current)) * 2 : 0), 0, 0);
    };
    if (a.mode === 'ride' || a.mode === 'drive') legs(-1.25, 1.0, 0, 0.16);
    else if (sitting) legs(-1.3, 1.1, 0, 0.1);
    else legs(0, 0.05, sw);
    r.spine.rotation.set(walking ? 0.04 : a.mode === 'ride' ? 0.3 : 0, walking ? -s * 0.12 : 0, 0);
    const arm = (side: 1 | -1, sx: number, sz: number, ex: number) => {
      const sh = side === 1 ? r.shoulderL : r.shoulderR; const el = side === 1 ? r.elbowL : r.elbowR;
      sh.rotation.set(sx, 0, sz); el.rotation.set(ex, 0, 0);
    };
    let hl: Parameters<PlayerRig['setHand']>[1] = 'relaxed', hr: Parameters<PlayerRig['setHand']>[1] = 'relaxed';
    if (a.mode === 'carry') { arm(1, -0.75, 0.3, -1.2); arm(-1, -0.75, -0.3, -1.2); hl = hr = 'open'; }
    else if (a.mode === 'wave') { arm(-1, -0.2, -2.5 + s * 0.35, -0.5); arm(1, 0, 0.1, -0.1); hr = 'wave'; }
    else if (a.mode === 'fan') { arm(-1, -0.9, -0.4 - s * 0.35, -0.9); arm(1, -0.7, 0.2, -0.9); hr = 'grip'; }
    else if (a.mode === 'eat') { const bite = Math.max(0, s); arm(-1, -0.9 - bite * 0.6, -0.25, -1.2 - bite * 0.8); arm(1, -0.7, 0.25, -1.0); hr = 'chopsticks'; }
    else if (a.mode === 'ride' || a.mode === 'drive') { arm(1, -1.25, 0.25, -0.3); arm(-1, -1.25, -0.25, -0.3); hl = hr = 'wheel'; }
    else if (a.mode === 'sit') { arm(1, -0.55, 0.15, -0.8); arm(-1, -0.55, -0.15, -0.8); }
    else if (a.mode === 'phone') { arm(1, -0.6, 0.35, -1.6); arm(-1, -0.5, -0.4, -1.5); hl = 'phone'; hr = 'pinch'; }
    else if (a.mode === 'talk') { arm(-1, -0.45 + s * 0.12, -0.3, -1.0); arm(1, 0.02, 0.12, -0.15); hr = 'open'; }
    else if (walking) { arm(1, sw * 0.9, 0.14, -0.25); arm(-1, -sw * 0.9, -0.14, -0.25); }
    else { arm(1, Math.sin(phase.current * 0.4) * 0.04, 0.12, -0.15); arm(-1, -Math.sin(phase.current * 0.4) * 0.04, -0.12, -0.15); }
    r.setHand('L', hl); r.setHand('R', hr);
    r.head.rotation.x = a.mode === 'eat' ? 0.25 : a.mode === 'phone' ? 0.4 : 0;
  });
  return <group>
    {!(anim.mode === 'ride' || anim.mode === 'drive') && <BlobShadow size={0.6} />}
    <ChibiModel ref={rig} outfit={o} expression={expr} idleLook={anim.mode === 'stand'} lodLevels={[1, 2, 2]} lodDistances={[11, 60]} />
    {children}
  </group>;
}
