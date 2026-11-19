/**
 * Landmark source-of-truth check. Run before production build.
 * The approved Blender GLBs must be used; no rejected procedural landmark
 * may silently return as a loading/error fallback.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const gameplay = readFileSync(join(root, 'src/world/Historic.tsx'), 'utf8');
const review = readFileSync(join(root, 'src/HeritageReview.tsx'), 'utf8');
const mapping = readFileSync(join(root, 'src/world/landmarkAssets.ts'), 'utf8');
const oldComponents = ['TurtleTower', 'NgocSonTemple', 'TheHucBridge'];

for (const name of oldComponents) {
  const declaration = new RegExp('\\b(?:function|class|const)\\s+' + name + '\\b');
  assert(!declaration.test(gameplay), 'Rejected procedural model defined in Historic.tsx: ' + name);
  assert(!new RegExp('\\b' + name + '\\b').test(review),
    'Review page still depends on a rejected procedural model: ' + name);
}
for (const relative of readdirSync(join(root, 'src'), { recursive: true })) {
  if (!/\.(ts|tsx)$/.test(relative)) continue;
  const source = readFileSync(join(root, 'src', relative), 'utf8');
  for (const name of oldComponents) {
    assert(!new RegExp('\\b' + name + '\\b').test(source),
      'Legacy landmark referenced in ' + relative + ': ' + name);
  }
  assert(!source.includes('/models/thap-rua.glb')
    && !source.includes('/models/review/ngoc-son-the-huc-review.glb'),
    'Legacy GLB referenced in ' + relative);
}
assert(!existsSync(join(root, 'public/models/thap-rua.glb'))
  && !existsSync(join(root, 'public/models/review/ngoc-son-the-huc-review.glb')),
  'Legacy GLB is still published in public/models');
assert(!gameplay.includes('fallback={<TurtleTower')
  && !gameplay.includes('fallback={<NgocSonTemple')
  && !gameplay.includes('fallback={<TheHucBridge'),
  'Rejected procedural fallback detected in landmark scene');

const required = [
  ['turtleTower', 'thap-rua-heritage.glb'],
  ['theHucBridge', 'cau-the-huc-heritage.glb'],
  ['ngocSonTemple', 'den-ngoc-son-heritage.glb'],
];

for (const [key, file] of required) {
  const line = mapping.split(String.fromCharCode(10)).find(line => line.includes(key + ':'));
  assert(line && line.includes(file), 'Expected approved GLB mapping for ' + key + ': ' + file);
  const path = join(root, 'public', 'models', file);
  assert(existsSync(path), 'Required GLB is missing: ' + path);
  assert(statSync(path).size > 10000, 'GLB is unexpectedly small: ' + file);
}
console.log('Landmark check OK: three approved Blender GLBs mapped, old procedural scene disabled.');
