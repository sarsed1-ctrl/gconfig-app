#!/usr/bin/env node
/**
 * GLB compression pipeline (DRACO + meshopt + KTX2 textures).
 *
 * Prerequisites:
 *   npm install -g @gltf-transform/cli
 *
 * Usage:
 *   node scripts/compress-models.mjs ./raw-models ./public/models
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [inputDir = './raw-models', outputDir = './public/models'] = process.argv.slice(2);

if (!existsSync(inputDir)) {
  console.error(`Input directory not found: ${inputDir}`);
  console.error('Place source GLB/GLTF files in raw-models/ then re-run.');
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir).filter((f) => /\.(glb|gltf)$/i.test(f));

if (files.length === 0) {
  console.log('No GLB/GLTF files found in', inputDir);
  process.exit(0);
}

for (const file of files) {
  const input = join(inputDir, file);
  const out = join(outputDir, basename(file, file.includes('.glb') ? '.glb' : '.gltf') + '.glb');
  console.log(`Compressing ${file} → ${out}`);

  const cmd = [
    'npx @gltf-transform/cli optimize',
    `"${input}"`,
    `"${out}"`,
    '--compress draco',
    '--texture-compress ktx2',
    '--texture-size 2048',
    '--simplify-ratio 0.85',
    '--join',
    '--prune',
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch (e) {
    console.error(`Failed: ${file}`, e.message);
  }
}

console.log('Done. DRACO geometry + KTX2 (ASTC/ETC1S on GPU) applied.');
