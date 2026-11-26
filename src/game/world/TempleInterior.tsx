import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Instances, trs } from './Instances';
import { materials } from './materials';
import { Roof } from './Roof';
import { plaqueTexture, rng } from './textures';

/*
 * Walk-in temple halls for Đền Ngọc Sơn. Each hall is built in its own frame: x runs along the temple
 * axis (front = −x, toward the gate), z across. Floors sit on a 0.5 m stone platform.
 */
export const PLATFORM = 0.5;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

let made: ReturnType<typeof make> | null = null;
function make() {
  // Bát Tràng terracotta floor tiles, 30 cm.
  const floor = canvasTexture(256, 256, (ctx) => {
    const r = rng(12);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = Math.round((r() - 0.5) * 26);
      ctx.fillStyle = `rgb(${158 + v},${74 + v / 2},${48 + v / 3})`; ctx.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
    ctx.globalAlpha = 0.1; for (let i = 0; i < 600; i++) { ctx.fillStyle = '#2a120a'; ctx.fillRect(r() * 256, r() * 256, 2, 2); }
  }, [1, 1]);
  // Red lacquer with gold cloud/dragon scroll bands, for altar fronts and beams.
  const lacquer = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#8e1a12'; ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#d8ad4f'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, 240, 112);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); const cx = 28 + i * 40; ctx.arc(cx, 64, 14, 0.2, Math.PI * 1.7); ctx.arc(cx + 12, 58, 7, Math.PI, Math.PI * 2.6); ctx.stroke(); }
    ctx.fillStyle = '#d8ad4f'; ctx.fillRect(8, 22, 240, 3); ctx.fillRect(8, 103, 240, 3);
  });
  // Column: red lacquer with a gold dragon coil band.
  const column = canvasTexture(64, 256, (ctx) => {
    ctx.fillStyle = '#a3241a'; ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = '#d8ad4f'; ctx.fillRect(0, 18, 64, 5); ctx.fillRect(0, 236, 64, 5);
    ctx.strokeStyle = 'rgba(216,173,79,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); for (let y = 30; y < 230; y += 2) ctx.lineTo(32 + Math.sin(y * 0.09) * 26, y); ctx.stroke();
  });
  const silk = canvasTexture(64, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, '#9e1010'); g.addColorStop(0.5, '#d22a20'); g.addColorStop(1, '#9e1010');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#e8c15a'; ctx.fillRect(0, 108, 64, 8);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; for (let x = 4; x < 64; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
  }, [3, 1]);
  // Mottled olive-grey leathery skin of the softshell turtle.
  const shellTex = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#4a4a34'; ctx.fillRect(0, 0, 256, 128);
    const r = rng(31);
    for (let i = 0; i < 260; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(30,30,20,.35)' : 'rgba(140,135,96,.3)'; ctx.beginPath(); ctx.arc(r() * 256, r() * 128, 2 + r() * 7, 0, Math.PI * 2); ctx.fill(); }
  });
  return {
    floor: new THREE.MeshStandardMaterial({ map: floor, roughness: 0.75 }),
    lacquer: new THREE.MeshStandardMaterial({ map: lacquer, roughness: 0.4 }),
    column: new THREE.MeshStandardMaterial({ map: column, roughness: 0.4 }),
    silk: new THREE.MeshStandardMaterial({ map: silk, roughness: 0.7, side: THREE.DoubleSide }),
    bronze: new THREE.MeshStandardMaterial({ color: '#6d5530', metalness: 0.85, roughness: 0.35 }),
    darkBronze: new THREE.MeshStandardMaterial({ color: '#3f3524', metalness: 0.8, roughness: 0.45 }),
    gilt: new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.9, roughness: 0.28 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#4e1a12', roughness: 0.8, side: THREE.DoubleSide }),
    candle: new THREE.MeshStandardMaterial({ color: '#c81e1e', roughness: 0.6 }),
    flame: new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 3 }),
    ember: new THREE.MeshStandardMaterial({ color: '#ff6a2a', emissive: '#ff4a10', emissiveIntensity: 2.5 }),
    stick: new THREE.MeshStandardMaterial({ color: '#b5332a', roughness: 0.8 }),
    lantern: new THREE.MeshStandardMaterial({ color: '#e0261b', emissive: '#ff5a2a', emissiveIntensity: 0.6, roughness: 0.6 }),
    drumSkin: new THREE.MeshStandardMaterial({ color: '#d9c49a', roughness: 0.7 }),
    shell: new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.65 }),
    skin: new THREE.MeshStandardMaterial({ color: '#4f4c3a', roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: '#e8f4f6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }), // no transmission: it re-renders the whole scene each frame
    wood: new THREE.MeshStandardMaterial({ color: '#5a321f', roughness: 0.6 }),
    orange: new THREE.MeshStandardMaterial({ color: '#f08a1c', roughness: 0.5 }),
    pomelo: new THREE.MeshStandardMaterial({ color: '#b9cc48', roughness: 0.5 }),
    banana: new THREE.MeshStandardMaterial({ color: '#f2d548', roughness: 0.5 }),
    lotus: new THREE.MeshStandardMaterial({ color: '#f4a6c4', roughness: 0.5, emissive: '#5a1a2c', emissiveIntensity: 0.1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f7d2c', roughness: 0.6 }),
  };
}
export function templeMats() { return (made ??= make()); }

/** Painted wooden board: horizontal (hoành phi) or vertical (câu đối). */
function Board({ text, vertical = false, width, height, position, rotation = [0, 0, 0] }: { text: string; vertical?: boolean; width: number; height: number; position: [number, number, number]; rotation?: [number, number, number] }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture(text, vertical), roughness: 0.45 }), [text, vertical]);
  return <mesh position={position} rotation={rotation} material={material}><planeGeometry args={[width, height]} /></mesh>;
}

/** Bronze three-legged incense burner (đỉnh đồng) with a lion knob. */
function Censer({ scale = 1 }: { scale?: number }) {
  const t = templeMats();
  return <group scale={scale}>
    {[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14]} material={t.darkBronze}><cylinderGeometry args={[0.025, 0.035, 0.16, 6]} /></mesh>; })}
    <mesh position={[0, 0.25, 0]} scale={[1, 0.8, 1]} material={t.bronze} castShadow><sphereGeometry args={[0.2, 18, 12]} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[s * 0.2, 0.36, 0]} rotation={[0, 0, Math.PI / 2]} material={t.bronze}><torusGeometry args={[0.05, 0.015, 6, 12]} /></mesh>)}
    <mesh position={[0, 0.42, 0]} material={t.bronze}><cylinderGeometry args={[0.16, 0.19, 0.06, 18]} /></mesh>
    <mesh position={[0, 0.5, 0]} material={t.bronze}><coneGeometry args={[0.14, 0.14, 18]} /></mesh>
    <mesh position={[0, 0.6, 0]} material={t.gilt}><sphereGeometry args={[0.05, 10, 8]} /></mesh>
  </group>;
}

/** Bowl of incense with a few burning sticks and drifting smoke. */
function IncenseBowl() {
  const t = templeMats();
  const smoke = useRef<THREE.Group>(null);
  const puff = useMemo(() => canvasTexture(64, 64, (ctx) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(230,230,230,.6)'); g.addColorStop(1, 'rgba(230,230,230,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); }), []);
  const mats = useMemo(() => Array.from({ length: 6 }, () => new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.3 })), [puff]);
  const sticks = useMemo(() => { const r = rng(8); return Array.from({ length: 9 }, () => ({ x: (r() - 0.5) * 0.08, z: (r() - 0.5) * 0.08, tilt: (r() - 0.5) * 0.25, h: 0.28 + r() * 0.08 })); }, []);
  useFrame((_, dt) => {
    smoke.current?.children.forEach((c, i) => {
      const k = ((c.userData.t ?? i / 6) + dt * 0.12) % 1; c.userData.t = k;
      c.position.set(Math.sin(k * 6 + i) * 0.06, 0.4 + k * 1.4, Math.cos(k * 5 + i) * 0.05);
      const s = 0.08 + k * 0.45; c.scale.set(s, s, s); mats[i].opacity = 0.28 * (1 - k);
    });
  });
  return <group>
    <mesh position={[0, 0.07, 0]} material={t.bronze}><cylinderGeometry args={[0.1, 0.08, 0.14, 16]} /></mesh>
    {sticks.map((s, i) => <group key={i} position={[s.x, 0.12, s.z]} rotation={[s.tilt, 0, s.tilt * 0.6]}>
      <mesh position={[0, s.h / 2, 0]} material={t.stick}><cylinderGeometry args={[0.003, 0.003, s.h, 4]} /></mesh>
      <mesh position={[0, s.h, 0]} material={t.ember}><sphereGeometry args={[0.006, 6, 4]} /></mesh>
    </group>)}
    <group ref={smoke}>{mats.map((m, i) => <sprite key={i} material={m} />)}</group>
  </group>;
}

/** Brass candlestick with a red candle and a lit flame. */
function Candle() {
  const t = templeMats();
  return <group>
    <mesh position={[0, 0.02, 0]} material={t.gilt}><cylinderGeometry args={[0.08, 0.1, 0.04, 14]} /></mesh>
    <mesh position={[0, 0.22, 0]} material={t.gilt}><cylinderGeometry args={[0.018, 0.025, 0.4, 8]} /></mesh>
    <mesh position={[0, 0.43, 0]} material={t.gilt}><cylinderGeometry args={[0.06, 0.03, 0.03, 12]} /></mesh>
    <mesh position={[0, 0.54, 0]} material={t.candle}><cylinderGeometry args={[0.025, 0.025, 0.2, 10]} /></mesh>
    <mesh position={[0, 0.67, 0]} scale={[1, 1.8, 1]} material={t.flame}><sphereGeometry args={[0.014, 8, 6]} /></mesh>
  </group>;
}

/** Five-fruit tray (mâm ngũ quả): pomelo, oranges and a bunch of bananas on a gilded stand. */
function FruitTray() {
  const t = templeMats();
  const oranges = useMemo(() => { const r = rng(21); return Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2; return trs(Math.cos(a) * 0.13, 0.2 + r() * 0.02, Math.sin(a) * 0.13, 0, 0.08); }); }, []);
  return <group>
    <mesh position={[0, 0.06, 0]} material={t.gilt}><cylinderGeometry args={[0.06, 0.1, 0.12, 12]} /></mesh>
    <mesh position={[0, 0.13, 0]} material={t.gilt}><cylinderGeometry args={[0.22, 0.18, 0.03, 20]} /></mesh>
    <mesh position={[0, 0.27, 0]} material={t.pomelo}><sphereGeometry args={[0.1, 14, 10]} /></mesh>
    <Instances geometry={fruitSphere} material={t.orange} matrices={oranges} castShadow={false} />
    {[0, 1, 2, 3].map((i) => <mesh key={i} position={[-0.08 + i * 0.04, 0.2, 0.15]} rotation={[0.3, 0, 0.9 + i * 0.1]} material={t.banana}><capsuleGeometry args={[0.018, 0.12, 4, 8]} /></mesh>)}
  </group>;
}
const fruitSphere = new THREE.SphereGeometry(0.5, 12, 8);

/** Vase of lotus flowers. */
function LotusVase() {
  const t = templeMats();
  return <group>
    <mesh position={[0, 0.14, 0]} scale={[1, 1.4, 1]} material={t.bronze}><sphereGeometry args={[0.09, 14, 10]} /></mesh>
    <mesh position={[0, 0.3, 0]} material={t.bronze}><cylinderGeometry args={[0.05, 0.035, 0.12, 12]} /></mesh>
    {[0, 1, 2, 3, 4].map((i) => { const a = i * 1.26; return <group key={i} position={[Math.cos(a) * 0.04, 0.35, Math.sin(a) * 0.04]} rotation={[Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3]}>
      <mesh position={[0, 0.2, 0]} material={t.leaf}><cylinderGeometry args={[0.004, 0.004, 0.4, 4]} /></mesh>
      <mesh position={[0, 0.42, 0]} material={t.lotus}><coneGeometry args={[0.045, 0.09, 8]} /></mesh>
    </group>; })}
  </group>;
}

/** Hạc chầu: a bronze crane standing on a turtle's back, the classic guardian pair beside Vietnamese altars. */
function CraneOnTurtle({ mirror = 1 }: { mirror?: number }) {
  const t = templeMats();
  const neck = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0, 0.25, 0.18), new THREE.Vector3(0, 0.55, 0.1), new THREE.Vector3(0, 0.75, 0.16)]), 20, 0.025, 6), []);
  return <group scale={[mirror, 1, 1]}>
    {/* turtle */}
    <mesh position={[0, 0.12, 0]} scale={[1, 0.5, 1.25]} material={t.darkBronze} castShadow><sphereGeometry args={[0.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    <mesh position={[0, 0.1, 0.34]} material={t.darkBronze}><sphereGeometry args={[0.06, 10, 8]} /></mesh>
    {/* crane legs */}
    {[-0.05, 0.05].map((x) => <mesh key={x} position={[x, 0.45, 0]} material={t.bronze}><cylinderGeometry args={[0.012, 0.012, 0.6, 5]} /></mesh>)}
    <group position={[0, 0.85, 0]}>
      <mesh scale={[0.7, 0.6, 1.2]} material={t.bronze} castShadow><sphereGeometry args={[0.16, 14, 10]} /></mesh>
      <mesh position={[0, 0.05, -0.2]} rotation={[0.5, 0, 0]} scale={[0.6, 0.15, 1]} material={t.bronze}><sphereGeometry args={[0.14, 10, 6]} /></mesh>
      <mesh geometry={neck} material={t.bronze} />
      <mesh position={[0, 0.76, 0.17]} material={t.bronze}><sphereGeometry args={[0.04, 10, 8]} /></mesh>
      <mesh position={[0, 0.75, 0.25]} rotation={[Math.PI / 2, 0, 0]} material={t.gilt}><coneGeometry args={[0.012, 0.12, 6]} /></mesh>
    </group>
  </group>;
}

/** Hương án: carved altar table with censer, candles, fruit, lotus and the crane pair. */
export function Altar({ width = 2.2 }: { width?: number }) {
  const t = templeMats();
  return <group>
    <mesh position={[0, 0.5, 0]} material={[t.lacquer, t.lacquer, t.gilt, t.wood, t.lacquer, t.lacquer]} castShadow receiveShadow><boxGeometry args={[0.9, 1.0, width]} /></mesh>
    <mesh position={[0, 1.02, 0]} material={t.gilt}><boxGeometry args={[1.0, 0.05, width + 0.12]} /></mesh>
    <group position={[0, 1.045, 0]}><Censer /></group>
    {[-1, 1].map((s) => <group key={s} position={[0.15, 1.045, s * (width / 2 - 0.25)]}><Candle /></group>)}
    {[-1, 1].map((s) => <group key={`f${s}`} position={[-0.05, 1.045, s * 0.55]}><FruitTray /></group>)}
    {[-1, 1].map((s) => <group key={`v${s}`} position={[0.25, 1.045, s * 0.85]}><LotusVase /></group>)}
    <group position={[-0.32, 1.045, 0]}><IncenseBowl /></group>
    {[-1, 1].map((s) => <group key={`c${s}`} position={[-0.9, 0, s * (width / 2 + 0.25)]} rotation={[0, -Math.PI / 2, 0]}><CraneOnTurtle mirror={s} /></group>)}
  </group>;
}

/** Gilded shrine cabinet (khám) with a seated statue and red silk curtains, for the rear sanctuary. */
export function Shrine({ width = 3.2 }: { width?: number }) {
  const t = templeMats();
  const statue = (scale: number, robe: THREE.Material) => <group scale={scale}>
    <mesh position={[0, 0.35, 0]} material={robe} castShadow><boxGeometry args={[0.7, 0.7, 0.8]} /></mesh>
    <mesh position={[0, 0.9, 0]} scale={[1, 1.15, 0.85]} material={robe} castShadow><sphereGeometry args={[0.34, 16, 12]} /></mesh>
    <mesh position={[0, 1.38, 0]} material={t.gilt}><sphereGeometry args={[0.17, 14, 10]} /></mesh>
    <mesh position={[0, 1.58, 0]} material={t.darkBronze}><cylinderGeometry args={[0.13, 0.17, 0.2, 12]} /></mesh>
    <mesh position={[0, 1.6, 0]} rotation={[0, 0, Math.PI / 2]} material={t.darkBronze}><boxGeometry args={[0.04, 0.6, 0.04]} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[-0.2, 0.75, s * 0.32]} rotation={[0, 0, 0.6]} material={robe}><capsuleGeometry args={[0.08, 0.35, 4, 8]} /></mesh>)}
    <mesh position={[-0.3, 0.92, 0]} rotation={[0, 0, 0.2]} material={t.gilt}><boxGeometry args={[0.05, 0.35, 0.08]} /></mesh>
  </group>;
  return <group>
    {/* stepped plinth */}
    <mesh position={[0, 0.3, 0]} material={t.lacquer} castShadow receiveShadow><boxGeometry args={[1.6, 0.6, width + 0.4]} /></mesh>
    <mesh position={[0.15, 0.75, 0]} material={t.lacquer}><boxGeometry args={[1.2, 0.3, width]} /></mesh>
    {/* cabinet frame */}
    {[-1, 1].map((s) => <mesh key={s} position={[0.2, 2.0, s * (width / 2 - 0.05)]} material={t.gilt}><boxGeometry args={[1.1, 2.2, 0.1]} /></mesh>)}
    <mesh position={[0.2, 3.15, 0]} material={t.lacquer}><boxGeometry args={[1.2, 0.3, width + 0.2]} /></mesh>
    <mesh position={[0.72, 2.0, 0]} material={t.wood}><boxGeometry args={[0.06, 2.2, width - 0.1]} /></mesh>
    {/* main seated figure in gold, two attendants in red robes */}
    <group position={[0.15, 0.9, 0]} rotation={[0, -Math.PI / 2, 0]}>{statue(1, t.gilt)}</group>
    {[-1, 1].map((s) => <group key={`a${s}`} position={[0.05, 0.9, s * (width / 2 - 0.45)]} rotation={[0, -Math.PI / 2, 0]}>{statue(0.62, t.lacquer)}</group>)}
    {/* curtains drawn to the sides */}
    {[-1, 1].map((s) => <mesh key={`c${s}`} position={[-0.38, 2.0, s * (width / 2 - 0.25)]} rotation={[0, Math.PI / 2, 0]} material={t.silk}><planeGeometry args={[0.5, 2.2]} /></mesh>)}
    <mesh position={[-0.38, 3.0, 0]} rotation={[0, Math.PI / 2, 0]} material={t.silk}><planeGeometry args={[width, 0.4]} /></mesh>
  </group>;
}

/** The preserved giant turtle of Hồ Gươm in its glass case. */
export function TurtleSpecimen() {
  const t = templeMats();
  const label = useMemo(() => new THREE.MeshStandardMaterial({ map: plaqueTexture('Tiêu bản Rùa Hồ Gươm'), roughness: 0.5 }), []);
  return <group>
    <mesh position={[0, 0.4, 0]} material={t.wood} castShadow receiveShadow><boxGeometry args={[2.7, 0.8, 1.6]} /></mesh>
    <group position={[0, 0.8, 0]}>
      {/* Rafetus softshell: smooth leathery carapace (no scutes), long neck, snouted head, four flippers */}
      <mesh position={[0, 0.2, 0]} scale={[1.95, 0.45, 1.35]} material={t.shell} castShadow><sphereGeometry args={[0.55, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <mesh position={[1.17, 0.18, 0]} rotation={[0, 0, -0.2]} material={t.skin}><capsuleGeometry args={[0.1, 0.25, 4, 10]} /></mesh>
      <mesh position={[1.42, 0.24, 0]} scale={[1.3, 0.8, 1]} material={t.skin}><sphereGeometry args={[0.11, 12, 10]} /></mesh>
      {[[0.6, 1], [0.6, -1], [-0.7, 1], [-0.7, -1]].map(([x, s]) => <mesh key={`${x}${s}`} position={[x, 0.12, s * 0.7]} rotation={[0, s * (x > 0 ? 0.5 : -0.5), 0]} scale={[1, 0.25, x > 0 ? 1.8 : 1.2]} material={t.skin}><sphereGeometry args={[0.14, 10, 8]} /></mesh>)}
    </group>
    {/* glass case */}
    <mesh position={[0, 1.55, 0]} material={t.glass}><boxGeometry args={[2.6, 1.5, 1.5]} /></mesh>
    {[-1, 1].flatMap((a) => [-1, 1].map((b) => <mesh key={`${a}${b}`} position={[a * 1.3, 1.55, b * 0.75]} material={t.gilt}><boxGeometry args={[0.04, 1.5, 0.04]} /></mesh>))}
    <mesh position={[0, 2.31, 0]} material={t.wood}><boxGeometry args={[2.7, 0.05, 1.6]} /></mesh>
    <mesh position={[-0.81, 0.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={label}><planeGeometry args={[1.4, 0.35]} /></mesh>
  </group>;
}

/** Ceremonial drum on a red stand and a bronze bell in its frame. */
export function DrumAndBell() {
  const t = templeMats();
  return <group>
    <group position={[0, 0, -1.2]}>
      {[-1, 1].map((s) => <mesh key={s} position={[0, 0.7, s * 0.55]} material={t.lacquer}><boxGeometry args={[0.12, 1.4, 0.12]} /></mesh>)}
      <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]} material={t.lacquer} castShadow><cylinderGeometry args={[0.42, 0.42, 0.7, 20]} /></mesh>
      {[-1, 1].map((s) => <mesh key={`s${s}`} position={[0, 1.15, s * 0.351]} rotation={[Math.PI / 2, 0, 0]} material={t.drumSkin}><circleGeometry args={[0.41, 20]} /></mesh>)}
    </group>
    <group position={[0, 0, 1.2]}>
      {[-1, 1].map((s) => <mesh key={s} position={[0, 1.0, s * 0.5]} material={t.lacquer}><boxGeometry args={[0.12, 2.0, 0.12]} /></mesh>)}
      <mesh position={[0, 2.0, 0]} material={t.lacquer}><boxGeometry args={[0.16, 0.14, 1.2]} /></mesh>
      <mesh position={[0, 1.45, 0]} material={t.darkBronze} castShadow><cylinderGeometry args={[0.22, 0.3, 0.7, 18]} /></mesh>
      <mesh position={[0, 1.85, 0]} material={t.darkBronze}><sphereGeometry args={[0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  </group>;
}

/** Hanging red lantern. */
export function Lantern() {
  const t = templeMats();
  return <group>
    <mesh position={[0, 0.35, 0]} material={t.darkBronze}><cylinderGeometry args={[0.005, 0.005, 0.7, 4]} /></mesh>
    <mesh scale={[1, 0.85, 1]} material={t.lantern}><sphereGeometry args={[0.2, 14, 10]} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[0, s * 0.17, 0]} material={t.gilt}><cylinderGeometry args={[0.08, 0.08, 0.04, 12]} /></mesh>)}
    <mesh position={[0, -0.32, 0]} material={t.gilt}><cylinderGeometry args={[0.01, 0.03, 0.2, 6]} /></mesh>
  </group>;
}

export type HallProps = {
  x: number; width: number; depth: number; height: number; roofRise?: number; double?: boolean;
  label?: string; openFront?: boolean; openBack?: boolean; couplet?: [string, string]; children?: React.ReactNode;
};

/**
 * Walk-in hall: stone platform, red outer colonnade, lattice-door front (three middle bays open),
 * solid side walls, terracotta floor, two rows of lacquered inner columns, a timber ceiling,
 * a gilded name board and couplets, and whatever furnishing is passed as children.
 */
export function TempleHall({ x, width, depth, height, roofRise = 2.4, double = false, label, openFront = true, openBack = false, couplet, children }: HallProps) {
  const m = materials();
  const t = templeMats();
  const floorMat = useMemo(() => { const mat = t.floor.clone(); mat.map = t.floor.map!.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(depth / 2.4, width / 2.4); return mat; }, [t.floor, depth, width]);
  const y0 = PLATFORM;
  const outer = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    const n = Math.max(4, Math.round(width / 2.2));
    for (let i = 0; i <= n; i++) for (const row of [-1, 1]) list.push(trs(row * (depth / 2 + 0.7), y0 + height / 2, -width / 2 + (width * i) / n, 0, 0.36, height, 0.36));
    return list;
  }, [width, depth, height, y0]);
  const inner = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    const n = Math.max(2, Math.round(depth / 2.6));
    for (let i = 0; i <= n; i++) for (const row of [-1, 1]) list.push(trs(-depth / 2 + 0.5 + ((depth - 1) * i) / n, y0 + height / 2, row * width * 0.22, 0, 0.32, height, 0.32));
    return list;
  }, [width, depth, height, y0]);
  const bay = width / 5;
  const wallT = 0.18;
  const front = (side: -1 | 1, open: boolean) => {
    const xw = side * depth / 2;
    if (!open) return <mesh position={[xw, y0 + height / 2, 0]} material={m.lattice} castShadow receiveShadow><boxGeometry args={[wallT, height, width]} /></mesh>;
    const opening = side < 0 ? bay * 3 : 3.0;
    const solid = (width - opening) / 2;
    return <>{[-1, 1].map((s) => <mesh key={s} position={[xw, y0 + height / 2, s * (opening / 2 + solid / 2)]} material={m.lattice} castShadow receiveShadow><boxGeometry args={[wallT, height, solid]} /></mesh>)}
      <mesh position={[xw, y0 + height - 0.3, 0]} material={t.lacquer}><boxGeometry args={[wallT + 0.02, 0.6, opening]} /></mesh>
      {/* lattice door leaves folded back against the solid bays */}
      {side < 0 && [-1, 1].map((s) => <mesh key={`d${s}`} position={[xw + 0.5, y0 + (height - 0.6) / 2, s * (opening / 2 - 0.05)]} rotation={[0, Math.PI / 2, 0]} material={m.lattice}><boxGeometry args={[1.0, height - 0.6, 0.06]} /></mesh>)}
    </>;
  };
  return <group position={[x, 0, 0]}>
    <mesh position={[0, PLATFORM / 2, 0]} castShadow receiveShadow material={m.warmStone}><boxGeometry args={[depth + 2.6, PLATFORM, width + 1.4]} /></mesh>
    <mesh position={[0, PLATFORM + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={floorMat} receiveShadow><planeGeometry args={[depth, width]} /></mesh>
    {/* side walls */}
    {[-1, 1].map((s) => <mesh key={s} position={[0, y0 + height / 2, s * width / 2]} material={m.darkRed} castShadow receiveShadow><boxGeometry args={[depth, height, wallT]} /></mesh>)}
    {front(-1, openFront)}
    {front(1, openBack)}
    <mesh position={[0, y0 + height + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} material={t.ceiling}><planeGeometry args={[depth, width]} /></mesh>
    <Instances geometry={columnGeometry} material={m.red} matrices={outer} />
    <Instances geometry={columnGeometry} material={t.column} matrices={inner} />
    {[-1, 1].map((row) => <mesh key={`b${row}`} position={[row * (depth / 2 + 0.7), y0 + height + 0.1, 0]} castShadow material={m.darkRed}><boxGeometry args={[0.4, 0.35, width + 0.4]} /></mesh>)}
    {/* interior tie beams across the hall */}
    {[-1, 0, 1].map((k) => <mesh key={`t${k}`} position={[k * depth * 0.3, y0 + height - 0.25, 0]} material={t.lacquer}><boxGeometry args={[0.28, 0.3, width - 0.2]} /></mesh>)}
    <group rotation={[0, Math.PI / 2, 0]}>
      {double && <Roof width={width + 3.4} depth={depth + 4.2} rise={0.7} y={y0 + height + 0.25} ridge={width * 0.9} curl={0.55} dragons={false} />}
      <Roof width={width + 2.6} depth={depth + 3.4} rise={roofRise} y={y0 + height + (double ? 1.2 : 0.3)} ridge={width * 0.6} curl={0.75} pearl />
      {double && <mesh position={[0, y0 + height + 0.75, 0]} castShadow material={[m.darkRed, m.darkRed, m.darkRed, m.darkRed, m.lattice, m.lattice]}><boxGeometry args={[width - 0.6, 0.9, depth - 0.6]} /></mesh>}
    </group>
    {label && <>
      <Board text={label} width={Math.min(4, width * 0.4)} height={1} position={[-(depth / 2 + 0.12), y0 + height - 0.55, 0]} rotation={[0, -Math.PI / 2, 0]} />
      {/* the same name board hung inside over the altar */}
      <Board text={label} width={2.6} height={0.65} position={[depth * 0.3 - 0.16, y0 + height - 0.75, 0]} rotation={[0, -Math.PI / 2, 0]} />
    </>}
    {couplet && [-1, 1].map((s, i) => <Board key={`c${s}`} text={couplet[i]} vertical width={0.36} height={1.9} position={[-(depth / 2) + 0.5 - 0.17, y0 + height * 0.55, s * width * 0.22]} rotation={[0, -Math.PI / 2, 0]} />)}
    {children}
  </group>;
}
const columnGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
