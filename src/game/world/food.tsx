import { useMemo } from 'react';
import * as THREE from 'three';
import type { MenuId } from '../state';
import { Instances, trs } from './Instances';
import { rng } from './textures';

/* Real-world sizes in metres. Every set is laid out around its own origin on the table top. */

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

const foodMaterials = () => once('food-mats', () => {
  // Grilled pork: caramelised brown with charred grill-bar stripes and fat streaks.
  const charTex = canvasTexture(128, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#8a4a22'); g.addColorStop(1, '#6b3417');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 64);
    const r = rng(5);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(40,16,6,.55)' : 'rgba(196,120,60,.45)'; ctx.fillRect(r() * 128, r() * 64, 2 + r() * 6, 1 + r() * 3); }
    ctx.fillStyle = 'rgba(25,10,4,.75)'; for (let x = 6; x < 128; x += 18) ctx.fillRect(x, 0, 5, 64);
    ctx.fillStyle = 'rgba(240,210,170,.35)'; for (let i = 0; i < 6; i++) ctx.fillRect(0, 8 + i * 9 + r() * 3, 128, 2);
  });
  const pattyTex = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#5e2f14'; ctx.fillRect(0, 0, 64, 64);
    const r = rng(9);
    for (let i = 0; i < 200; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(28,12,4,.6)' : 'rgba(160,90,45,.5)'; ctx.beginPath(); ctx.arc(r() * 64, r() * 64, 0.6 + r() * 2.2, 0, Math.PI * 2); ctx.fill(); }
  });
  const noodleTex = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(190,184,168,.55)'; ctx.lineWidth = 1;
    for (let y = 2; y < 128; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= 128; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.2 + y) * 1.2); ctx.stroke(); }
  });
  const ceramicTex = canvasTexture(256, 32, (ctx) => {
    ctx.fillStyle = '#f7f5ef'; ctx.fillRect(0, 0, 256, 32);
    ctx.strokeStyle = '#2d5aa8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(256, 6); ctx.stroke();
    ctx.lineWidth = 1.5; for (let x = 0; x < 256; x += 16) { ctx.beginPath(); ctx.arc(x + 8, 16, 5, 0, Math.PI); ctx.stroke(); }
  });
  ceramicTex.wrapS = THREE.RepeatWrapping;
  const weaveTex = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#b98c52'; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#a07440' : '#cfa266'; ctx.fillRect(x + 1, y + 1, 6, 6); }
  });
  weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping; weaveTex.repeat.set(4, 4);
  return {
    ceramic: new THREE.MeshStandardMaterial({ map: ceramicTex, roughness: 0.25, side: THREE.DoubleSide }),
    plain: new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 0.3, side: THREE.DoubleSide }),
    broth: new THREE.MeshPhysicalMaterial({ color: '#d99a45', roughness: 0.08, transmission: 0.25, transparent: true, opacity: 0.88, clearcoat: 1 }),
    char: new THREE.MeshStandardMaterial({ map: charTex, roughness: 0.55 }),
    patty: new THREE.MeshStandardMaterial({ map: pattyTex, roughness: 0.6 }),
    noodle: new THREE.MeshStandardMaterial({ map: noodleTex, color: '#fbfaf4', roughness: 0.55 }),
    papaya: new THREE.MeshStandardMaterial({ color: '#d9e6b0', roughness: 0.4 }),
    carrot: new THREE.MeshStandardMaterial({ color: '#f08a2e', roughness: 0.45 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide }),
    weave: new THREE.MeshStandardMaterial({ map: weaveTex, roughness: 0.85, side: THREE.DoubleSide }),
    garlic: new THREE.MeshStandardMaterial({ color: '#f3ead0', roughness: 0.5 }),
    chili: new THREE.MeshStandardMaterial({ color: '#d4241b', roughness: 0.35 }),
    lime: new THREE.MeshStandardMaterial({ color: '#7fb33a', roughness: 0.4 }),
    limeFlesh: new THREE.MeshStandardMaterial({ color: '#d4e98e', roughness: 0.35 }),
    bamboo: new THREE.MeshStandardMaterial({ color: '#d7b77a', roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#d5d8da', roughness: 0.25, metalness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.35, thickness: 0.004 }),
    ice: new THREE.MeshPhysicalMaterial({ color: '#eef8ff', roughness: 0.15, transmission: 0.6, transparent: true, opacity: 0.7 }),
    tray: new THREE.MeshStandardMaterial({ color: '#c7cbcd', roughness: 0.3, metalness: 0.8 }),
  };
});

/** Lathe-turned bowl: radius r, height h, thin wall. */
const bowlGeometry = (r: number, h: number) => once(`bowl-${r}-${h}`, () => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(r * 0.45 + r * 0.55 * Math.sin(t * Math.PI / 2), h * t)); }
  for (let i = 10; i >= 0; i--) { const t = i / 10; pts.push(new THREE.Vector2(r * 0.42 + r * 0.53 * Math.sin(t * Math.PI / 2) - 0.003, h * t + 0.004)); }
  return new THREE.LatheGeometry(pts, 32);
});
const plateGeometry = (r: number) => once(`plate-${r}`, () => new THREE.LatheGeometry([
  new THREE.Vector2(0, 0.002), new THREE.Vector2(r * 0.7, 0.002), new THREE.Vector2(r * 0.85, 0.008), new THREE.Vector2(r, 0.016), new THREE.Vector2(r - 0.004, 0.018), new THREE.Vector2(r * 0.84, 0.011), new THREE.Vector2(r * 0.68, 0.006), new THREE.Vector2(0, 0.006),
], 36));

/** Bún rối: a loose nest of thin rice-noodle strands, as one tube following a random coil. */
const noodleNest = (seed: number) => once(`nest-${seed}`, () => {
  const r = rng(seed);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 70; i++) {
    const a = i * 0.9 + r() * 0.6;
    const rad = 0.012 + r() * 0.026;
    points.push(new THREE.Vector3(Math.cos(a) * rad, 0.004 + (i / 70) * 0.028 + r() * 0.006, Math.sin(a) * rad * 0.8));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 420, 0.0016, 5, false);
});
/** Herb leaf: a cupped ellipse. */
const leafGeometry = once('leaf', () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.quadraticCurveTo(0.5, 0.35, 0, 1); shape.quadraticCurveTo(-0.5, 0.35, 0, 0);
  const g = new THREE.ShapeGeometry(shape, 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, x * x * 0.8); }
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2);
  return g;
});

/**
 * Bún chả Hà Nội, as served: a bowl of warm sweet-sour dipping broth (nước chấm) holding char-grilled
 * pork belly slices (chả miếng) and patties (chả viên) with green papaya and carrot; a plate of bún;
 * a woven basket of fresh herbs (xà lách, tía tô, kinh giới, húng); garlic-chili and lime; chopsticks.
 * `eaten` (0..1) empties the bowl and plate as the player eats.
 */
export function BunChaSet({ eaten = 0 }: { eaten?: number }) {
  const m = foodMaterials();
  const left = 1 - eaten;
  const parts = useMemo(() => {
    const r = rng(77);
    const slices: THREE.Matrix4[] = []; const patties: THREE.Matrix4[] = [];
    const papaya: THREE.Matrix4[] = []; const carrot: THREE.Matrix4[] = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r() * 0.4; slices.push(trs(Math.cos(a) * 0.035, 0.05 + r() * 0.006, Math.sin(a) * 0.035, a + 1.2, 0.05, 0.007, 0.028, (r() - 0.5) * 0.5, (r() - 0.5) * 0.4)); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; patties.push(trs(Math.cos(a) * 0.022, 0.054, Math.sin(a) * 0.022, r() * 3, 0.036, 0.018, 0.032)); }
    for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2; const d = 0.02 + r() * 0.04; (i % 3 ? papaya : carrot).push(trs(Math.cos(a) * d, 0.047, Math.sin(a) * d, r() * 3, 0.022, 0.002, 0.012, (r() - 0.5) * 0.4)); }
    const herbs: THREE.Matrix4[] = []; const herbColors: THREE.Color[] = [];
    const kinds = [['#9fcf5e', 0.11, 0.08], ['#6e2f5f', 0.06, 0.045], ['#4f8a34', 0.045, 0.03], ['#3f7d2c', 0.035, 0.025]] as const;
    for (let i = 0; i < 46; i++) {
      const [color, len, wid] = kinds[i < 10 ? 0 : i < 22 ? 1 : i < 34 ? 2 : 3];
      const a = r() * Math.PI * 2; const d = r() * 0.075;
      herbs.push(trs(Math.cos(a) * d, 0.02 + r() * 0.035, Math.sin(a) * d, r() * Math.PI * 2, wid / 0.5 * 0.5, 1, len, (r() - 0.5) * 0.9, (r() - 0.5) * 0.9));
      herbColors.push(new THREE.Color(color).offsetHSL(0, 0, (r() - 0.5) * 0.08));
    }
    const garlic: THREE.Matrix4[] = []; const chili: THREE.Matrix4[] = [];
    for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; const d = r() * 0.022; (i % 2 ? garlic : chili).push(trs(Math.cos(a) * d, 0.012, Math.sin(a) * d, r() * 3, i % 2 ? 0.007 : 0.006, 0.0015, i % 2 ? 0.007 : 0.006)); }
    return { slices, patties, papaya, carrot, herbs, herbColors, garlic, chili };
  }, []);
  const ring = useMemo(() => new THREE.TorusGeometry(0.5, 0.25, 6, 12).rotateX(Math.PI / 2), []);
  const disc = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 16), []);
  const meatScale = Math.max(0.0001, left);
  return <group>
    {/* nước chấm bowl, centre front */}
    <group position={[0, 0, 0.07]}>
      <mesh geometry={bowlGeometry(0.075, 0.06)} material={m.ceramic} castShadow receiveShadow />
      <mesh position={[0, 0.002, 0]} material={m.plain}><cylinderGeometry args={[0.03, 0.032, 0.004, 24]} /></mesh>
      <mesh position={[0, 0.03 + 0.016 * left, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.broth}><circleGeometry args={[0.052 + 0.014 * left, 32]} /></mesh>
      <group scale={[meatScale, meatScale, meatScale]} position={[0, -0.01 * eaten, 0]}>
        <Instances geometry={disc} material={m.char} matrices={parts.slices} castShadow={false} />
        <Instances geometry={pattySphere} material={m.patty} matrices={parts.patties} castShadow={false} />
        <Instances geometry={disc} material={m.papaya} matrices={parts.papaya} castShadow={false} receiveShadow={false} />
        <Instances geometry={disc} material={m.carrot} matrices={parts.carrot} castShadow={false} receiveShadow={false} />
      </group>
    </group>
    {/* plate of bún rối */}
    <group position={[-0.17, 0, -0.05]}>
      <mesh geometry={plateGeometry(0.1)} material={m.ceramic} castShadow receiveShadow />
      <group scale={[1, Math.max(0.05, left), 1]}>
        {[[0, 0, 0], [0.035, 0, 0.02], [-0.03, 0, 0.028], [0.005, 0.012, -0.03], [-0.01, 0.02, 0.005]].map((p, i) => (left > i * 0.2 ? <mesh key={i} geometry={noodleNest(30 + i)} material={m.noodle} position={p as [number, number, number]} rotation={[0, i * 1.3, 0]} castShadow /> : null))}
      </group>
    </group>
    {/* rổ rau sống */}
    <group position={[0.16, 0, -0.07]}>
      <mesh material={m.weave} castShadow receiveShadow><cylinderGeometry args={[0.1, 0.085, 0.03, 28, 1, true]} /></mesh>
      <mesh position={[0, 0.002, 0]} material={m.weave}><cylinderGeometry args={[0.086, 0.086, 0.004, 28]} /></mesh>
      <Instances geometry={leafGeometry} material={m.leaf} matrices={parts.herbs} colors={parts.herbColors} castShadow={false} />
      {/* lime wedges */}
      {[0, 1].map((i) => <group key={i} position={[0.05 - i * 0.03, 0.045, 0.05]} rotation={[0, i * 0.8, Math.PI / 2]}>
        <mesh material={m.lime}><cylinderGeometry args={[0.016, 0.016, 0.02, 12, 1, false, 0, Math.PI]} /></mesh>
        <mesh position={[0, 0, 0]} rotation={[0, 0, 0]} material={m.limeFlesh}><boxGeometry args={[0.031, 0.02, 0.001]} /></mesh>
      </group>)}
    </group>
    {/* tỏi ớt dish */}
    <group position={[-0.02, 0, -0.14]}>
      <mesh geometry={plateGeometry(0.035)} material={m.plain} castShadow />
      <Instances geometry={disc} material={m.garlic} matrices={parts.garlic} castShadow={false} />
      <Instances geometry={ring} material={m.chili} matrices={parts.chili} castShadow={false} />
    </group>
    {/* chopsticks and spoon */}
    <group position={[0.1, 0.006, 0.12]} rotation={[0, 0.25, 0]}>
      {[-0.008, 0.008].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.bamboo} castShadow><cylinderGeometry args={[0.0028, 0.0042, 0.24, 6]} /></mesh>)}
    </group>
    <group position={[0.17, 0.006, 0.1]} rotation={[0, -0.3, 0]}>
      <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]} material={m.steel}><boxGeometry args={[0.012, 0.11, 0.003]} /></mesh>
      <mesh position={[0, 0.004, 0.035]} scale={[1, 0.3, 1.4]} material={m.steel}><sphereGeometry args={[0.018, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
    </group>
  </group>;
}
const pattySphere = new THREE.SphereGeometry(0.5, 14, 10);

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
    ctx.fillStyle = '#1f5fb4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold italic 26px Georgia, serif';
    ctx.fillText('LaVie', 64, 33); ctx.fillText('LaVie', 192, 33);
  }), roughness: 0.4,
}));

/** Ice-filled glass next to a cold can or a 500 ml Lavie bottle. `drunk` (0..1) empties it. */
export function DrinkSet({ id, drunk = 0 }: { id: Exclude<MenuId, 'buncha'>; drunk?: number }) {
  const m = foodMaterials();
  const ice = useMemo(() => { const r = rng(id.length * 7); return Array.from({ length: 5 }, () => trs((r() - 0.5) * 0.03, 0.03 + r() * 0.05, (r() - 0.5) * 0.03, r() * 3, 0.018, 0.018, 0.018, r(), r())); }, [id]);
  const left = 1 - drunk;
  const liquid = id === 'lavie' ? '#dfeffa' : id === 'sevenup' ? '#eef6d8' : '#3a1a0c';
  const liquidMat = useMemo(() => new THREE.MeshStandardMaterial({ color: liquid, roughness: 0.1, transparent: true, opacity: id === 'lavie' || id === 'sevenup' ? 0.35 : 0.9 }), [liquid, id]);
  return <group>
    {id === 'lavie'
      ? <group position={[0.05, 0, 0]}>
          <mesh position={[0, 0.1, 0]} material={m.glass}><cylinderGeometry args={[0.032, 0.032, 0.2, 18]} /></mesh>
          <mesh position={[0, 0.09, 0]} material={lavieLabel()}><cylinderGeometry args={[0.0325, 0.0325, 0.06, 18, 1, true]} /></mesh>
          <mesh position={[0, 0.215, 0]} material={m.glass}><cylinderGeometry args={[0.012, 0.03, 0.03, 14]} /></mesh>
          <mesh position={[0, 0.235, 0]}><cylinderGeometry args={[0.014, 0.014, 0.016, 12]} /><meshStandardMaterial color="#1f5fb4" roughness={0.5} /></mesh>
          {left > 0.02 && <mesh position={[0, 0.095 * left, 0]} material={liquidMat}><cylinderGeometry args={[0.03, 0.03, 0.19 * left, 16]} /></mesh>}
        </group>
      : <group position={[0.05, 0, 0]}>
          <mesh position={[0, 0.061, 0]} material={canMaterial(id)} castShadow><cylinderGeometry args={[0.033, 0.033, 0.112, 24]} /></mesh>
          <mesh position={[0, 0.119, 0]} material={m.steel}><cylinderGeometry args={[0.027, 0.033, 0.006, 24]} /></mesh>
          <mesh position={[0, 0.003, 0]} material={m.steel}><cylinderGeometry args={[0.033, 0.027, 0.006, 24]} /></mesh>
        </group>}
    {/* glass with ice */}
    <group position={[-0.03, 0, 0]}>
      <mesh position={[0, 0.06, 0]} material={m.glass}><cylinderGeometry args={[0.036, 0.03, 0.12, 20, 1, true]} /></mesh>
      <mesh position={[0, 0.002, 0]} material={m.glass}><cylinderGeometry args={[0.03, 0.03, 0.004, 20]} /></mesh>
      <Instances geometry={iceCube} material={m.ice} matrices={ice} castShadow={false} />
      {left > 0.02 && <mesh position={[0, 0.005 + 0.045 * left, 0]} material={liquidMat}><cylinderGeometry args={[0.031 + 0.002 * left, 0.029, 0.09 * left, 18]} /></mesh>}
    </group>
  </group>;
}
const iceCube = new THREE.BoxGeometry(1, 1, 1);

/** Stainless serving tray the waiter carries. */
export function Tray({ children }: { children?: React.ReactNode }) {
  const m = foodMaterials();
  return <group>
    <mesh material={m.tray} castShadow><cylinderGeometry args={[0.24, 0.23, 0.012, 32]} /></mesh>
    <group position={[0, 0.006, 0]}>{children}</group>
  </group>;
}

/** Bamboo grilling clamp (kẹp tre) full of chả, as on the charcoal brazier out front. */
export function GrillClamp() {
  const m = foodMaterials();
  const pieces = useMemo(() => { const r = rng(3); return Array.from({ length: 7 }, (_, i) => trs(-0.12 + i * 0.04, 0, (r() - 0.5) * 0.03, r() * 0.4, 0.034, 0.014, 0.05)); }, []);
  return <group>
    {[-0.012, 0.012].map((y) => <group key={y} position={[0, y, 0]}>
      {[-0.07, 0, 0.07].map((z) => <mesh key={z} position={[0, 0, z]} rotation={[0, 0, Math.PI / 2]} material={m.bamboo}><cylinderGeometry args={[0.004, 0.004, 0.34, 5]} /></mesh>)}
    </group>)}
    <mesh position={[0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={m.bamboo}><cylinderGeometry args={[0.006, 0.006, 0.16, 5]} /></mesh>
    <Instances geometry={pattySphere} material={m.patty} matrices={pieces} castShadow={false} />
  </group>;
}

/** Stack of empty bowls / clean plates for the counter. */
export function DishStack({ count = 6 }: { count?: number }) {
  const m = foodMaterials();
  return <group>{Array.from({ length: count }, (_, i) => <mesh key={i} geometry={bowlGeometry(0.075, 0.06)} material={m.ceramic} position={[0, i * 0.022, 0]} castShadow />)}</group>;
}
