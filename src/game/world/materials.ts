import * as THREE from 'three';
import { graniteTexture, latticeTexture, limeStoneTexture, roofTileTexture } from './textures';

let made: ReturnType<typeof make> | null = null;
function make() {
  const tiles = roofTileTexture().clone();
  tiles.needsUpdate = true;
  tiles.repeat.set(0.6, 0.6);
  return {
    red: new THREE.MeshStandardMaterial({ color: '#c42a20', roughness: 0.45, metalness: 0.03 }),
    darkRed: new THREE.MeshStandardMaterial({ color: '#8e1e16', roughness: 0.55 }),
    gold: new THREE.MeshStandardMaterial({ color: '#c9a24f', metalness: 0.6, roughness: 0.35 }),
    timber: new THREE.MeshStandardMaterial({ color: '#5e3a2a', roughness: 0.75 }),
    stone: new THREE.MeshStandardMaterial({ map: limeStoneTexture(), roughness: 0.95 }),
    warmStone: new THREE.MeshStandardMaterial({ map: limeStoneTexture('#d9d0bb'), roughness: 0.92 }),
    granite: new THREE.MeshStandardMaterial({ map: graniteTexture(), roughness: 0.9 }),
    lattice: new THREE.MeshStandardMaterial({ map: latticeTexture(), roughness: 0.55 }),
    roof: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.82, side: THREE.DoubleSide }),
    ridge: new THREE.MeshStandardMaterial({ color: '#d8d2c2', roughness: 0.7 }),
    rock: new THREE.MeshStandardMaterial({ color: '#8d877a', roughness: 1, flatShading: true }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#6a5442', roughness: 1 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffbf5e', emissiveIntensity: 0.4 }),
    iron: new THREE.MeshStandardMaterial({ color: '#23292a', roughness: 0.5, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 1 }),
  };
}
export function materials() { return (made ??= make()); }
