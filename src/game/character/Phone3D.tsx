import { useMemo } from 'react';
import * as THREE from 'three';
import { softBox } from './geometry';

/** The player's smartphone as a 3D prop: rounded body, glass screen with the Đời Việt home screen, camera bump, buttons and speaker. */
export function Phone3D() {
  const parts = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#1d3d5c'); g.addColorStop(0.5, '#2a6b6a'); g.addColorStop(1, '#e8a24a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '300 34px Arial'; ctx.fillText(new Date().toTimeString().slice(0, 5), 64, 62);
    ctx.font = 'bold 11px Arial'; ctx.fillText('ĐỜI VIỆT', 64, 80);
    const colors = ['#2f8cff', '#e8542f', '#1f9d55', '#7a4ff0', '#f0a020', '#0b0b0c', '#16c784', '#d94b7a'];
    colors.forEach((col, i) => { ctx.fillStyle = col; const x = 16 + (i % 4) * 26, y = 110 + Math.floor(i / 4) * 30; ctx.beginPath(); ctx.roundRect(x, y, 20, 20, 5); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(44, 244, 40, 3);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return {
      body: softBox(0.036, 0.075, 0.0045, 0.25, 12, 10),
      frame: new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.35, metalness: 0.6 }),
      screen: new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.8, roughness: 0.15 }),
      dark: new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.2 }),
    };
  }, []);
  return <group>
    <mesh geometry={parts.body} material={parts.frame} castShadow />
    <mesh material={parts.screen} position={[0, 0, 0.0047]}><planeGeometry args={[0.066, 0.142]} /></mesh>
    <mesh material={parts.dark} position={[0, 0.066, 0.0049]}><planeGeometry args={[0.018, 0.004]} /></mesh>
    <mesh material={parts.dark} position={[-0.018, 0.058, -0.0052]}><boxGeometry args={[0.022, 0.022, 0.003]} /></mesh>
    {[0, 1].map((k) => <mesh key={k} material={parts.dark} position={[-0.024 + k * 0.009, 0.064 - k * 0.006, -0.0068]}><cylinderGeometry args={[0.0035, 0.0035, 0.002, 10]} /></mesh>)}
    <mesh material={parts.frame} position={[0.0372, 0.03, 0]}><boxGeometry args={[0.002, 0.016, 0.003]} /></mesh>
    <mesh material={parts.frame} position={[-0.0372, 0.035, 0]}><boxGeometry args={[0.002, 0.012, 0.003]} /></mesh>
    <mesh material={parts.frame} position={[-0.0372, 0.018, 0]}><boxGeometry args={[0.002, 0.012, 0.003]} /></mesh>
  </group>;
}
