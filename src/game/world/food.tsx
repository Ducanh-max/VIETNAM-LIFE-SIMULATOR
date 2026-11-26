import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAN_OFFSET, GLASS_OFFSET, SET } from '../meal';
import type { MenuId } from '../state';
import { Instances, trs } from './Instances';
import { rng } from './textures';

/* Real-world sizes in metres. Every set is laid out around its own origin on the table top (see meal.ts). */

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export const foodMaterials = () => once('food-mats', () => {
  // Caramelised grilled pork: glossy mahogany with dark char flecks and grill bars.
  const charTex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 70); g.addColorStop(0, '#a5481b'); g.addColorStop(1, '#6a2a0e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const r = rng(5);
    for (let i = 0; i < 260; i++) { ctx.fillStyle = r() < 0.55 ? 'rgba(30,10,3,.55)' : 'rgba(210,120,50,.45)'; ctx.beginPath(); ctx.arc(r() * 128, r() * 128, 0.8 + r() * 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(25,8,2,.7)'; ctx.lineWidth = 5; for (let x = 10; x < 128; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 20, 128); ctx.stroke(); }
  });
  const noodleTex = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#f7f5ee'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(200,194,178,.7)'; ctx.lineWidth = 1;
    for (let y = 1; y < 128; y += 2.5) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= 128; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.25 + y * 1.7) * 0.9); ctx.stroke(); }
  });
  noodleTex.wrapS = noodleTex.wrapT = THREE.RepeatWrapping;
  const ceramicTex = canvasTexture(512, 64, (ctx) => {
    ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#2350a3'; ctx.fillRect(0, 6, 512, 5); ctx.fillRect(0, 52, 512, 3);
    ctx.strokeStyle = '#2350a3'; ctx.lineWidth = 2.2;
    for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.arc(x + 16, 30, 9, 0, Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 16, 28, 4, Math.PI, 0); ctx.stroke(); }
  });
  ceramicTex.wrapS = THREE.RepeatWrapping;
  const weaveTex = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#b07a3e'; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#9a6630' : '#d6a35e'; ctx.fillRect(x + 1, y + 1, 6, 6); }
  });
  weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping; weaveTex.repeat.set(6, 2);
  const lettuceTex = canvasTexture(64, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, '#e6f2b8'); g.addColorStop(0.4, '#9fd25a'); g.addColorStop(1, '#58a83a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
    ctx.strokeStyle = 'rgba(240,250,210,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(32, 128); ctx.lineTo(32, 10); ctx.stroke();
    ctx.lineWidth = 1; for (let y = 110; y > 20; y -= 14) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(4, y - 18); ctx.moveTo(32, y); ctx.lineTo(60, y - 18); ctx.stroke(); }
  });
  const perillaTex = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#4c8a3a'; ctx.fillRect(0, 0, 64, 64);
    const g = ctx.createRadialGradient(32, 40, 4, 32, 40, 40); g.addColorStop(0, 'rgba(130,40,110,.9)'); g.addColorStop(1, 'rgba(130,40,110,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(200,170,210,.6)'; ctx.beginPath(); ctx.moveTo(32, 64); ctx.lineTo(32, 6); ctx.stroke();
  });
  return {
    ceramic: new THREE.MeshPhysicalMaterial({ map: ceramicTex, roughness: 0.18, clearcoat: 0.8, side: THREE.DoubleSide }),
    plain: new THREE.MeshPhysicalMaterial({ color: '#fbfaf6', roughness: 0.2, clearcoat: 0.8, side: THREE.DoubleSide }),
    broth: new THREE.MeshPhysicalMaterial({ color: '#c8571f', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9 }),
    lightBroth: new THREE.MeshPhysicalMaterial({ color: '#e9a25a', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.75 }),
    char: new THREE.MeshPhysicalMaterial({ map: charTex, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
    noodle: new THREE.MeshStandardMaterial({ map: noodleTex, color: '#ffffff', roughness: 0.5 }),
    scallion: new THREE.MeshStandardMaterial({ color: '#4f9e2f', roughness: 0.4 }),
    scallionWhite: new THREE.MeshStandardMaterial({ color: '#d9ecb8', roughness: 0.4 }),
    papaya: new THREE.MeshStandardMaterial({ color: '#e7efc4', roughness: 0.35 }),
    carrot: new THREE.MeshStandardMaterial({ color: '#f07a1a', roughness: 0.35 }),
    lettuce: new THREE.MeshStandardMaterial({ map: lettuceTex, roughness: 0.55, side: THREE.DoubleSide }),
    perilla: new THREE.MeshStandardMaterial({ map: perillaTex, roughness: 0.55, side: THREE.DoubleSide }),
    herb: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, side: THREE.DoubleSide }),
    weave: new THREE.MeshStandardMaterial({ map: weaveTex, roughness: 0.85, side: THREE.DoubleSide }),
    garlic: new THREE.MeshStandardMaterial({ color: '#f1e6c4', roughness: 0.45 }),
    chili: new THREE.MeshStandardMaterial({ color: '#d61f14', roughness: 0.3 }),
    seed: new THREE.MeshStandardMaterial({ color: '#f4e7a6', roughness: 0.5 }),
    shallot: new THREE.MeshStandardMaterial({ color: '#b5732e', roughness: 0.6 }),
    bamboo: new THREE.MeshStandardMaterial({ color: '#d8b675', roughness: 0.55 }),
    steel: new THREE.MeshStandardMaterial({ color: '#d5d8da', roughness: 0.22, metalness: 0.9 }),
    // plain see-through glass and ice: a transmission material makes three.js render the whole city a second time
    // into a texture every frame (the biggest FPS cost in the game), for a barely visible difference
    glass: new THREE.MeshStandardMaterial({ color: '#eef6fb', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    ice: new THREE.MeshStandardMaterial({ color: '#f0f9ff', roughness: 0.1, transparent: true, opacity: 0.7 }),
    tray: new THREE.MeshStandardMaterial({ color: '#c7cbcd', roughness: 0.3, metalness: 0.8 }),
  };
});

/** Lathe-turned bowl: radius r, height h, thin wall. */
const bowlGeometry = (r: number, h: number) => once(`bowl-${r}-${h}`, () => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * 0.42 + r * 0.58 * Math.sin(t * Math.PI / 2), h * t)); }
  for (let i = 12; i >= 0; i--) { const t = i / 12; pts.push(new THREE.Vector2(r * 0.4 + r * 0.56 * Math.sin(t * Math.PI / 2) - 0.003, h * t + 0.004)); }
  return new THREE.LatheGeometry(pts, 40);
});
const plateGeometry = (r: number) => once(`plate-${r}`, () => new THREE.LatheGeometry([
  new THREE.Vector2(0, 0.002), new THREE.Vector2(r * 0.68, 0.002), new THREE.Vector2(r * 0.84, 0.008), new THREE.Vector2(r, 0.018), new THREE.Vector2(r - 0.004, 0.02), new THREE.Vector2(r * 0.83, 0.012), new THREE.Vector2(r * 0.66, 0.006), new THREE.Vector2(0, 0.006),
], 44));

/** A neat coiled bundle of bún: one fine strand wound round and round in a low dome. */
const noodleBundle = (seed: number) => once(`bundle-${seed}`, () => {
  const r = rng(seed);
  const points: THREE.Vector3[] = [];
  const turns = 9;
  for (let i = 0; i <= turns * 14; i++) {
    const t = i / (turns * 14);
    const a = t * turns * Math.PI * 2 + r() * 0.15;
    const rad = 0.026 * Math.sqrt(1 - t * 0.85) + (r() - 0.5) * 0.002;
    points.push(new THREE.Vector3(Math.cos(a) * rad, 0.004 + t * 0.022 + Math.sin(a * 3) * 0.001, Math.sin(a) * rad));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 600, 0.0019, 5, false);
});

/** Ruffled leaf: a shape bent into a cup with wavy edges. */
const leafGeometry = (kind: 'lettuce' | 'small') => once(`leaf-${kind}`, () => {
  const shape = new THREE.Shape();
  if (kind === 'lettuce') { shape.moveTo(0, 0); shape.bezierCurveTo(0.7, 0.1, 0.65, 0.9, 0, 1); shape.bezierCurveTo(-0.65, 0.9, -0.7, 0.1, 0, 0); }
  else { shape.moveTo(0, 0); shape.quadraticCurveTo(0.55, 0.35, 0, 1); shape.quadraticCurveTo(-0.55, 0.35, 0, 0); }
  const g = new THREE.ShapeGeometry(shape, 10);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i);
    const ruffle = kind === 'lettuce' ? Math.sin(Math.atan2(y - 0.5, x) * 9) * 0.06 * Math.abs(x) * 2 : 0;
    pos.setZ(i, x * x * 0.9 + y * y * 0.25 + ruffle);
    uv.setXY(i, x + 0.5, y);
  }
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2);
  return g;
});
/** Flower-cut slice of carrot or green papaya, as in the pickles bowl. */
const flowerSlice = once('flower', () => {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 50; i++) { const a = (i / 50) * Math.PI * 2; const rr = 0.5 + Math.cos(a * 5) * 0.12; const x = Math.cos(a) * rr; const y = Math.sin(a) * rr; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
});
const disc = once('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 18));
const ring = once('ring', () => new THREE.TorusGeometry(0.5, 0.22, 6, 14).rotateX(Math.PI / 2));
const sphere = once('sphere', () => new THREE.SphereGeometry(0.5, 16, 12));
const cube = once('cube', () => new THREE.BoxGeometry(1, 1, 1));

/** Wisps of steam above the warm dipping broth. */
function Steam({ height = 0.25 }: { height?: number }) {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => once('steam-tex', () => canvasTexture(64, 64, (ctx) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); })), []);
  const mats = useMemo(() => Array.from({ length: 6 }, () => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.3 })), [tex]);
  useFrame((_, dt) => {
    group.current?.children.forEach((c, i) => {
      const k = ((c.userData.t ?? i / 6) + dt * 0.25) % 1; c.userData.t = k;
      c.position.set(Math.sin(k * 7 + i * 2) * 0.02, 0.05 + k * height, Math.cos(k * 5 + i) * 0.02);
      const s = 0.04 + k * 0.1; c.scale.set(s, s * 1.4, s); mats[i].opacity = 0.32 * Math.sin(k * Math.PI);
    });
  });
  return <group ref={group}>{mats.map((m, i) => <sprite key={i} material={m} />)}</group>;
}

/**
 * Bún chả Hà Nội as served: bowl of warm nước chấm with caramelised chả patties and scallion, steam rising;
 * a blue-rimmed plate of neat bún bundles; a woven basket heaped with lettuce, tía tô and herbs; pickled
 * carrot and papaya flowers; sliced chilli and minced garlic; bamboo chopsticks.
 * `eaten` is 0..1; `showChopsticks` false while the diner is holding them.
 */
export function BunChaSet({ eaten = 0, showChopsticks = true, steam = true }: { eaten?: number; showChopsticks?: boolean; steam?: boolean }) {
  const m = foodMaterials();
  const left = 1 - eaten;
  const parts = useMemo(() => {
    const r = rng(77);
    const patties: THREE.Matrix4[] = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + r() * 0.3; const d = i === 6 ? 0 : 0.042; patties.push(trs(Math.cos(a) * d, 0.052 + (i === 6 ? 0.008 : 0), Math.sin(a) * d, r() * 3, 0.05 + r() * 0.008, 0.02, 0.044 + r() * 0.008, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25)); }
    const scallion: THREE.Matrix4[] = []; const scallionW: THREE.Matrix4[] = []; const chiliBits: THREE.Matrix4[] = [];
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2; const d = r() * 0.06; (i % 4 ? scallion : scallionW).push(trs(Math.cos(a) * d, 0.066, Math.sin(a) * d, r() * 3, 0.006, 0.003, 0.006, Math.PI / 2 * (r() < 0.3 ? 1 : 0))); }
    for (let i = 0; i < 6; i++) { const a = r() * Math.PI * 2; const d = r() * 0.05; chiliBits.push(trs(Math.cos(a) * d, 0.065, Math.sin(a) * d, r() * 3, 0.009, 0.004, 0.009)); }
    // herbs: big ruffled lettuce at the back, tía tô and smaller herbs heaped in front
    const lettuce: THREE.Matrix4[] = []; const perilla: THREE.Matrix4[] = []; const herbs: THREE.Matrix4[] = []; const herbColors: THREE.Color[] = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r() * 0.4; lettuce.push(trs(Math.cos(a) * 0.035, 0.02 + r() * 0.03, Math.sin(a) * 0.035, -a + Math.PI / 2, 0.11, 0.11, 0.13, -0.5 - r() * 0.5, 0)); }
    for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; const d = 0.02 + r() * 0.05; perilla.push(trs(Math.cos(a) * d, 0.05 + r() * 0.03, Math.sin(a) * d, r() * 6, 0.05, 0.05, 0.06, -0.2 - r() * 0.5, (r() - 0.5) * 0.4)); }
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2; const d = r() * 0.07;
      herbs.push(trs(Math.cos(a) * d, 0.055 + r() * 0.045, Math.sin(a) * d, r() * 6, 0.028, 0.028, 0.038, (r() - 0.5) * 1.2, (r() - 0.5) * 1.2));
      herbColors.push(new THREE.Color(r() < 0.5 ? '#3f8a2c' : '#2f6e24').offsetHSL(0, 0, (r() - 0.5) * 0.08));
    }
    const flowers: THREE.Matrix4[] = []; const flowerColors: THREE.Color[] = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r() * 0.3; const d = i < 8 ? 0.026 : 0; flowers.push(trs(Math.cos(a) * d, 0.036 + r() * 0.005, Math.sin(a) * d, r() * 3, 0.03, 0.03, 0.03, (r() - 0.5) * 0.3)); flowerColors.push(new THREE.Color(i % 3 ? '#f07a1a' : '#e7efc4')); }
    const chiliRings: THREE.Matrix4[] = []; const garlic: THREE.Matrix4[] = [];
    for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2; const d = r() * 0.015; chiliRings.push(trs(-0.012 + Math.cos(a) * d, 0.012 + r() * 0.004, Math.sin(a) * d, r() * 3, 0.012, 0.01, 0.012, (r() - 0.5) * 0.4)); }
    for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2; const d = r() * 0.014; garlic.push(trs(0.016 + Math.cos(a) * d, 0.011 + r() * 0.006, Math.sin(a) * d, r() * 3, 0.0035, 0.0035, 0.0035, r(), r())); }
    return { patties, scallion, scallionW, chiliBits, lettuce, perilla, herbs, herbColors, flowers, flowerColors, chiliRings, garlic };
  }, []);
  const pattyCount = Math.ceil(parts.patties.length * left);
  const patties = useMemo(() => parts.patties.slice(0, pattyCount), [parts, pattyCount]);
  const bundles = [[0, 0.004, 0], [0.05, 0, 0], [0.025, 0, 0.044], [-0.025, 0, 0.044], [-0.05, 0, 0], [-0.025, 0, -0.044], [0.025, 0, -0.044]] as [number, number, number][];
  const bundleCount = Math.ceil(bundles.length * left);
  const herbCount = Math.ceil(parts.herbs.length * (0.4 + left * 0.6));
  const herbs = useMemo(() => parts.herbs.slice(0, herbCount), [parts, herbCount]);
  const herbColors = useMemo(() => parts.herbColors.slice(0, herbCount), [parts, herbCount]);
  return <group>
    {/* bowl of nước chấm with chả */}
    <group position={[SET.broth[0], 0, SET.broth[1]]}>
      <mesh geometry={bowlGeometry(0.088, 0.066)} material={m.ceramic} castShadow receiveShadow />
      <mesh position={[0, 0.003, 0]} material={m.plain}><cylinderGeometry args={[0.034, 0.036, 0.006, 28]} /></mesh>
      <mesh position={[0, 0.054, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.broth}><circleGeometry args={[0.078, 40]} /></mesh>
      <Instances geometry={sphere} material={m.char} matrices={patties} castShadow={false} />
      {left > 0.2 && <><Instances geometry={disc} material={m.scallion} matrices={parts.scallion} castShadow={false} receiveShadow={false} />
        <Instances geometry={disc} material={m.scallionWhite} matrices={parts.scallionW} castShadow={false} receiveShadow={false} />
        <Instances geometry={disc} material={m.chili} matrices={parts.chiliBits} castShadow={false} receiveShadow={false} /></>}
      {steam && <Steam />}
    </group>
    {/* plate of bún bundles with a little garnish */}
    <group position={[SET.bun[0], 0, SET.bun[1]]}>
      <mesh geometry={plateGeometry(0.115)} material={m.ceramic} castShadow receiveShadow />
      {bundles.slice(0, bundleCount).map((p, i) => <mesh key={i} geometry={noodleBundle(40 + i)} material={m.noodle} position={p} rotation={[0, i * 0.9, 0]} castShadow />)}
      {bundleCount > 0 && <group position={[0, 0.03, 0]}>
        {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.cos(i * 1.3) * 0.008, 0, Math.sin(i * 1.3) * 0.008]} rotation={[Math.PI / 2, 0, i]} material={i % 2 ? m.scallion : m.chili}><torusGeometry args={[0.004, 0.0015, 5, 10]} /></mesh>)}
        <mesh material={m.shallot} scale={[0.012, 0.004, 0.012]} geometry={sphere} />
      </group>}
    </group>
    {/* rổ rau sống */}
    <group position={[SET.herbs[0], 0, SET.herbs[1]]}>
      <mesh material={m.weave} castShadow receiveShadow><cylinderGeometry args={[0.1, 0.085, 0.035, 32, 1, true]} /></mesh>
      <mesh position={[0, 0.034, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.weave}><torusGeometry args={[0.1, 0.006, 6, 32]} /></mesh>
      <mesh position={[0, 0.003, 0]} material={m.weave}><cylinderGeometry args={[0.086, 0.086, 0.004, 32]} /></mesh>
      <Instances geometry={leafGeometry('lettuce')} material={m.lettuce} matrices={parts.lettuce} castShadow={false} />
      <Instances geometry={leafGeometry('small')} material={m.perilla} matrices={parts.perilla} castShadow={false} />
      <Instances geometry={leafGeometry('small')} material={m.herb} matrices={herbs} colors={herbColors} castShadow={false} />
    </group>
    {/* pickled carrot and green papaya flowers */}
    <group position={[SET.pickle[0], 0, SET.pickle[1]]}>
      <mesh geometry={bowlGeometry(0.058, 0.045)} material={m.ceramic} castShadow />
      <mesh position={[0, 0.034, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.lightBroth}><circleGeometry args={[0.05, 32]} /></mesh>
      <Instances geometry={flowerSlice} material={m.herb} matrices={parts.flowers} colors={parts.flowerColors} castShadow={false} />
    </group>
    {/* sliced chilli and minced garlic */}
    <group position={[SET.chili[0], 0, SET.chili[1]]}>
      <mesh geometry={plateGeometry(0.042)} material={m.plain} castShadow />
      <Instances geometry={ring} material={m.chili} matrices={parts.chiliRings} castShadow={false} />
      <Instances geometry={cube} material={m.garlic} matrices={parts.garlic} castShadow={false} />
    </group>
    {showChopsticks && <group position={[SET.chopsticks[0], 0.006, SET.chopsticks[1]]} rotation={[0, Math.PI / 2 + 0.15, 0]}><Chopsticks /></group>}
  </group>;
}

/** Pair of bamboo chopsticks lying along local z (tips at +z), 24 cm long. */
export function Chopsticks({ spread = 0.012 }: { spread?: number }) {
  const m = foodMaterials();
  return <group>{[-1, 1].map((s) => <mesh key={s} position={[s * spread / 2, 0, 0]} rotation={[Math.PI / 2, 0, s * 0.02]} material={m.bamboo} castShadow><cylinderGeometry args={[0.0042, 0.0026, 0.24, 6]} /></mesh>)}</group>;
}

/** What the chopsticks are carrying during a bite. */
export function Morsel({ kind }: { kind: 'noodle' | 'wrap' | 'dipped' }) {
  const m = foodMaterials();
  return <group>
    <mesh geometry={noodleBundle(91)} material={m.noodle} scale={[0.7, 1.4, 0.7]} position={[0, -0.02, 0]} />
    {kind !== 'noodle' && <mesh geometry={leafGeometry('small')} material={m.perilla} scale={[0.05, 0.05, 0.06]} position={[0, 0.004, -0.02]} rotation={[0.6, 0, 0]} />}
    {kind === 'dipped' && <mesh geometry={sphere} material={m.char} scale={[0.04, 0.016, 0.035]} position={[0, 0.012, 0]} />}
  </group>;
}

const canLabel: Record<'pepsi' | 'coca' | 'sevenup', { bg: string; fg: string; text: string; band: string }> = {
  pepsi: { bg: '#123a8c', fg: '#ffffff', text: 'PEPSI', band: '#d7263d' },
  coca: { bg: '#c8102e', fg: '#ffffff', text: 'Coca-Cola', band: '#ffffff' },
  sevenup: { bg: '#1c8a3a', fg: '#ffffff', text: '7 UP', band: '#f2c230' },
};
const canMaterial = (id: 'pepsi' | 'coca' | 'sevenup') => once(`can-${id}`, () => {
  const l = canLabel[id];
  const tex = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = l.bg; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = l.band; ctx.fillRect(0, 86, 256, 10);
    ctx.fillStyle = l.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${id === 'coca' ? 30 : 38}px "Be Vietnam Pro", Arial, sans-serif`;
    ctx.fillText(l.text, 64, 54); ctx.fillText(l.text, 192, 54);
    ctx.font = '12px Arial'; ctx.fillText('330ml', 64, 110); ctx.fillText('330ml', 192, 110);
  });
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.55 });
});
const lavieLabel = () => once('lavie', () => new THREE.MeshStandardMaterial({
  map: canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = '#e9f2fb'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#1f5fb4'; ctx.fillRect(0, 0, 256, 14); ctx.fillRect(0, 50, 256, 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold italic 26px Georgia, serif';
    ctx.fillText('LaVie', 64, 33); ctx.fillText('LaVie', 192, 33);
  }), roughness: 0.4,
}));
const liquidColor = (id: Exclude<MenuId, 'buncha'>) => id === 'lavie' ? '#b9dcef' : id === 'sevenup' ? '#d9edbd' : '#3a1a0c';
const foamMaterial = () => once('foam', () => new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.9 }));
const liquidMaterial = (id: Exclude<MenuId, 'buncha'>) => once(`liquid-${id}`, () => new THREE.MeshStandardMaterial({ color: liquidColor(id), roughness: 0.1 }) /* opaque: the glass uses transmission, which hides transparent things inside it */);

/** A can (or Lavie bottle), origin at its base. */
export function Bottle({ id, open = false }: { id: Exclude<MenuId, 'buncha'>; open?: boolean }) {
  const m = foodMaterials();
  if (id === 'lavie') return <group>
    <mesh position={[0, 0.1, 0]} material={m.glass}><cylinderGeometry args={[0.032, 0.032, 0.2, 18]} /></mesh>
    <mesh position={[0, 0.09, 0]} material={lavieLabel()}><cylinderGeometry args={[0.0325, 0.0325, 0.06, 18, 1, true]} /></mesh>
    <mesh position={[0, 0.215, 0]} material={m.glass}><cylinderGeometry args={[0.012, 0.03, 0.03, 14]} /></mesh>
    {!open && <mesh position={[0, 0.235, 0]}><cylinderGeometry args={[0.014, 0.014, 0.016, 12]} /><meshStandardMaterial color="#1f5fb4" roughness={0.5} /></mesh>}
  </group>;
  return <group>
    <mesh position={[0, 0.061, 0]} material={canMaterial(id)} castShadow><cylinderGeometry args={[0.033, 0.033, 0.112, 24]} /></mesh>
    <mesh position={[0, 0.119, 0]} material={m.steel}><cylinderGeometry args={[0.027, 0.033, 0.006, 24]} /></mesh>
    {/* ring-pull: flat when closed, flipped up when opened (with the dark opening showing) */}
    <mesh position={[open ? 0.006 : 0.012, open ? 0.13 : 0.123, 0]} rotation={[0, 0, open ? 1.2 : 0]} material={m.steel}><boxGeometry args={[0.014, 0.002, 0.008]} /></mesh>
    {open && <mesh position={[-0.012, 0.1225, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.008, 10]} /><meshBasicMaterial color="#111" /></mesh>}
    <mesh position={[0, 0.003, 0]} material={m.steel}><cylinderGeometry args={[0.033, 0.027, 0.006, 24]} /></mesh>
  </group>;
}
/** Height of the pouring lip above the bottle base. */
export const bottleLip = (id: Exclude<MenuId, 'buncha'>) => (id === 'lavie' ? 0.24 : 0.122);

/** Ice-filled glass, origin at its base; `level` 0..1 of drink in it. */
export function IceGlass({ id, level, foam = 0 }: { id: Exclude<MenuId, 'buncha'>; level: number; foam?: number }) {
  const m = foodMaterials();
  const ice = useMemo(() => { const r = rng(17); return Array.from({ length: 6 }, (_, i) => trs((r() - 0.5) * 0.03, 0.025 + i * 0.014, (r() - 0.5) * 0.03, r() * 3, 0.019, 0.019, 0.019, r(), r())); }, []);
  return <group>
    <mesh position={[0, 0.06, 0]} material={m.glass}><cylinderGeometry args={[0.036, 0.03, 0.12, 22, 1, true]} /></mesh>
    <mesh position={[0, 0.003, 0]} material={m.glass}><cylinderGeometry args={[0.03, 0.03, 0.006, 22]} /></mesh>
    <Instances geometry={cube} material={m.ice} matrices={ice} castShadow={false} />
    {level > 0.02 && <mesh position={[0, 0.006 + 0.05 * level, 0]} material={liquidMaterial(id)}><cylinderGeometry args={[0.027 + 0.006 * level, 0.0265, 0.1 * level, 20]} /></mesh>}
    {/* fizz: a head of foam on top of the soda while it is poured, settling afterwards */}
    {id !== 'lavie' && foam > 0.05 && level > 0.04 && <mesh position={[0, 0.006 + 0.1 * level + 0.008 * foam, 0]} material={foamMaterial()} scale={[1, foam, 1]}><cylinderGeometry args={[0.032 + 0.003 * level, 0.031 + 0.003 * level, 0.016, 20]} /></mesh>}
  </group>;
}

/** Drink corner of a served table: can/bottle and an ice glass. Either can be "in hand" (hidden here). */
export function DrinkSet({ id, glassLevel = 0, canHeld = false, glassHeld = false, opened = false, foam = 0 }: { id: Exclude<MenuId, 'buncha'>; glassLevel?: number; canHeld?: boolean; glassHeld?: boolean; opened?: boolean; foam?: number }) {
  return <group>
    {!canHeld && <group position={[CAN_OFFSET, 0, 0]}><Bottle id={id} open={opened} /></group>}
    {!glassHeld && <group position={[GLASS_OFFSET, 0, 0]}><IceGlass id={id} level={glassLevel} foam={foam} /></group>}
  </group>;
}

/** Stainless serving tray the waiter carries. */
export function Tray({ children }: { children?: React.ReactNode }) {
  const m = foodMaterials();
  return <group>
    <mesh material={m.tray} castShadow><cylinderGeometry args={[0.26, 0.25, 0.012, 32]} /></mesh>
    <group position={[0, 0.006, 0]}>{children}</group>
  </group>;
}

/** Bamboo grilling clamp (kẹp tre) full of chả, as on the charcoal brazier out front. */
export function GrillClamp() {
  const m = foodMaterials();
  const pieces = useMemo(() => { const r = rng(3); return Array.from({ length: 7 }, (_, i) => trs(-0.12 + i * 0.04, 0, (r() - 0.5) * 0.03, r() * 0.4, 0.036, 0.016, 0.05)); }, []);
  return <group>
    {[-0.012, 0.012].map((y) => <group key={y} position={[0, y, 0]}>
      {[-0.07, 0, 0.07].map((z) => <mesh key={z} position={[0, 0, z]} rotation={[0, 0, Math.PI / 2]} material={m.bamboo}><cylinderGeometry args={[0.004, 0.004, 0.34, 5]} /></mesh>)}
    </group>)}
    <mesh position={[0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.bamboo}><cylinderGeometry args={[0.006, 0.006, 0.16, 5]} /></mesh>
    <Instances geometry={sphere} material={m.char} matrices={pieces} castShadow={false} />
  </group>;
}

/** Stack of empty bowls for the counter. */
export function DishStack({ count = 6 }: { count?: number }) {
  const m = foodMaterials();
  return <group>{Array.from({ length: count }, (_, i) => <mesh key={i} geometry={bowlGeometry(0.075, 0.06)} material={m.ceramic} position={[0, i * 0.022, 0]} castShadow />)}</group>;
}

/** Bún chả takeaway bag (for deliveries): a knotted plastic bag with boxes inside. */
export function TakeawayBag() {
  return <group>
    <mesh position={[0, 0.11, 0]} scale={[1, 1.1, 0.75]}><sphereGeometry args={[0.12, 14, 10]} /><meshStandardMaterial color="#f4f1ea" roughness={0.35} transparent opacity={0.85} /></mesh>
    <mesh position={[0, 0.06, 0]}><boxGeometry args={[0.16, 0.08, 0.12]} /><meshStandardMaterial color="#ffffff" roughness={0.6} /></mesh>
    {[-1, 1].map((s) => <mesh key={s} position={[s * 0.035, 0.25, 0]} rotation={[0, 0, s * 0.4]}><torusGeometry args={[0.03, 0.006, 6, 12]} /><meshStandardMaterial color="#f4f1ea" roughness={0.4} /></mesh>)}
  </group>;
}
