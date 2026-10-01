#!/usr/bin/env node
/** Empacota dist/ em release/autoticket-<versão>.zip (para "Carregar sem compactação" ou distribuição). */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ não encontrado — rode "npm run build" antes.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const outDir = join(root, 'release');
mkdirSync(outDir, { recursive: true });
const zip = join(outDir, `autoticket-${version}.zip`);
rmSync(zip, { force: true });
try {
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: dist, stdio: 'inherit' });
} catch {
  // Windows sem "zip": usa PowerShell.
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dist}\\*' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });
}
console.log(`[package] ${zip}`);
