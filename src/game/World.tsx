import { useFrame } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Point } from './geo';
import { Player } from './Player';
import { TheHucBridge } from './world/Bridge';
import { OsmBuildings } from './world/OsmBuildings';
import { DenSM } from './world/DenSM';
import { DriverJob } from './world/DriverJob';
import { Signs } from './world/Signs';
import { Lotte } from './world/Lotte';
import { Landmarks } from './world/Landmarks';
import { FoodShipper } from './world/FoodShipper';
import { Multiplayer } from './world/Multiplayer';
import { Rental } from './world/Rental';
import { Pedestrians } from './world/Pedestrians';
import { Interaction, Job } from './world/Job';
import { Restaurant } from './world/Restaurant';
import { Streets } from './world/Streets';
import { NgocSonApproach } from './world/ThapBut';
import { Lakeside, type TimeOfDay } from './world/Lakeside';
import { materials } from './world/materials';
import { NgocSonIsland } from './world/NgocSon';
import { TurtleIsland } from './world/TurtleTower';

export type { TimeOfDay };
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export const qualityConfig: Record<Quality, { dpr: number; shadow: number; antialias: boolean; reflections: boolean; fog: number }> = {
  low: { dpr: 1, shadow: 0, antialias: false, reflections: false, fog: 420 },
  medium: { dpr: 1.25, shadow: 1024, antialias: true, reflections: false, fog: 620 },
  high: { dpr: 1.5, shadow: 2048, antialias: true, reflections: true, fog: 800 },
  ultra: { dpr: 2, shadow: 4096, antialias: true, reflections: true, fog: 900 },
};

const lighting: Record<TimeOfDay, { sun: [number, number, number]; color: string; intensity: number; sky: string; hemi: number; ground: string }> = {
  day: { sun: [90, 140, 60], color: '#fff3dc', intensity: 3.0, sky: '#bcd6dd', hemi: 1.0, ground: '#6b6f5a' },
  sunset: { sun: [-140, 40, 70], color: '#ffb47a', intensity: 2.4, sky: '#e2a98f', hemi: 0.75, ground: '#5d4d44' },
  night: { sun: [60, 90, -70], color: '#9fb6d8', intensity: 0.45, sky: '#16222c', hemi: 0.4, ground: '#1c1d22' },
};

/**
 * Sun that follows the player so a small shadow map stays sharp. The followed point is snapped to the
 * shadow map's texel grid in light space, so shadow edges don't crawl or flicker as the player moves
 * (the striped, shimmering streaks of thin poles on the pavement), and the biases keep acne off the ground.
 */
const SHADOW_HALF = 45; // half size of the shadow camera (m)
function Sun({ time, shadow, focus }: { time: TimeOfDay; shadow: number; focus: THREE.Vector3 }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const cfg = lighting[time];
  const offset = useMemo(() => new THREE.Vector3(...cfg.sun).normalize().multiplyScalar(120), [cfg.sun]);
  const basis = useMemo(() => {
    const m = new THREE.Matrix4().lookAt(offset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    return { m, inv: m.clone().invert(), p: new THREE.Vector3() };
  }, [offset]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // snap the focus to whole shadow texels in light space
    const texel = (SHADOW_HALF * 2) / Math.max(1, shadow);
    const p = basis.p.copy(focus).applyMatrix4(basis.inv);
    p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(basis.m);
    l.position.copy(p).add(offset);
    l.target.position.copy(p);
    l.target.updateMatrixWorld();
  });
  return <directionalLight ref={light} color={cfg.color} intensity={cfg.intensity} castShadow={shadow > 0}
    shadow-mapSize={[shadow || 1, shadow || 1]} shadow-camera-left={-SHADOW_HALF} shadow-camera-right={SHADOW_HALF} shadow-camera-top={SHADOW_HALF} shadow-camera-bottom={-SHADOW_HALF}
    shadow-camera-near={20} shadow-camera-far={260} shadow-bias={-0.0006} shadow-normalBias={0.06} shadow-radius={3} />;
}

/** Up high (the Lotte observation deck, the drone) the haze recedes so the city below stays visible. */
function HighFog({ near, far }: { near: number; far: number }) {
  useFrame((state) => {
    const f = state.scene.fog as THREE.Fog | null; if (!f) return;
    const h = Math.max(0, state.camera.position.y - 20);
    f.near = near + h * 3; f.far = far + h * 9;
    const cam = state.camera as THREE.PerspectiveCamera;
    const wantFar = Math.max(2000, f.far + 200);
    if (cam.far !== wantFar) { cam.far = wantFar; cam.updateProjectionMatrix(); }
  });
  return null;
}

export function World({ time, quality, paused, freeCamera, onFps, onPosition }: {
  time: TimeOfDay; quality: Quality; paused: boolean; freeCamera: boolean; onFps: (fps: number) => void; onPosition: (p: Point) => void;
}) {
  const cfg = lighting[time];
  const q = qualityConfig[quality];
  const focus = useMemo(() => new THREE.Vector3(), []);
  const sunVector = useMemo(() => new THREE.Vector3(...cfg.sun), [cfg.sun]);
  const glow = materials().lampGlow;
  glow.emissiveIntensity = time === 'night' ? 2.4 : time === 'sunset' ? 0.9 : 0.1;
  return <>
    <color attach="background" args={[cfg.sky]} />
    <fog attach="fog" args={[cfg.sky, 120, q.fog]} />
    <HighFog near={120} far={q.fog} />
    {time !== 'night'
      ? <Sky distance={4500} sunPosition={cfg.sun} turbidity={time === 'day' ? 4 : 7} rayleigh={time === 'day' ? 1.2 : 2.6} mieCoefficient={0.004} mieDirectionalG={0.85} />
      : <Stars radius={600} depth={60} count={1500} factor={4} fade speed={0.3} />}
    <hemisphereLight args={[cfg.sky, cfg.ground, cfg.hemi]} />
    <Sun time={time} shadow={q.shadow} focus={focus} />
    <Lakeside time={time} reflections={q.reflections} sun={sunVector} />
    <Streets />
    <OsmBuildings />
    <Interaction paused={paused} />
    <Restaurant paused={paused} />
    <Job />
    <Signs />
    <Lotte />
    <Landmarks />
    <FoodShipper paused={paused} />
    <Multiplayer />
    <Rental />
    <DriverJob />
    <DenSM paused={paused} />
    <Pedestrians />
    <TheHucBridge />
    <TurtleIsland />
    <NgocSonIsland />
    <NgocSonApproach />
    <Player paused={paused} freeCamera={freeCamera} onFps={onFps} onPosition={onPosition} focus={focus} />
  </>;
}
