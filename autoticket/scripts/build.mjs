#!/usr/bin/env node
/**
 * Build da extensão.
 *  - Bundles com esbuild (background ESM, content/popup/options IIFE).
 *  - Gera o manifest a partir de static/manifest.base.json + hosts dos perfis
 *    (fonte única: os domínios do manifest SÃO os domínios dos perfis).
 *  - --e2e: inclui perfil de teste para http://127.0.0.1 (saída em dist-e2e/).
 *  - --watch: rebuild incremental.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const e2e = args.has('--e2e');
const watch = args.has('--watch');
const outdir = join(root, e2e ? 'dist-e2e' : 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

async function loadProfiles() {
  const dir = join(root, 'src/site/profiles');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))));
}

function hostPatterns(host) {
  const h = host.replace(/^\*\./, '').replace(/^www\./, '');
  // "*.dominio" também casa com o domínio sem subdomínio.
  return [`https://*.${h}/*`];
}

async function makeManifest() {
  const base = JSON.parse(await readFile(join(root, 'static/manifest.base.json'), 'utf8'));
  // Perfis E2E (127.0.0.1) entram só via e2eMatches (http), nunca como https://*.<ip>.
  const profiles = await loadProfiles();
  const hosts = [...new Set(profiles.flatMap((p) => p.hosts))].sort();
  const siteMatches = hosts.flatMap(hostPatterns);
  // Fila virtual externa: o robô só OBSERVA (detecta e espera), nunca interage.
  const observeMatches = ['https://*.queue-it.net/*'];
  const e2eMatches = e2e ? ['http://127.0.0.1/*'] : [];
  const matches = [...siteMatches, ...observeMatches, ...e2eMatches];
  return {
    ...base,
    name: e2e ? `${base.name} (E2E)` : base.name,
    version: pkg.version,
    host_permissions: matches,
    content_scripts: [{ matches, js: ['content.js'], run_at: 'document_idle', all_frames: false }],
    web_accessible_resources: [{ resources: ['sounds/alert.wav'], matches }],
  };
}

const e2eProfiles = e2e ? [JSON.parse(await readFile(join(root, 'tests/e2e/mock-profile.json'), 'utf8'))] : [];

const common = {
  bundle: true,
  target: ['chrome120'],
  sourcemap: e2e ? 'inline' : false,
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  define: {
    __E2E__: JSON.stringify(e2e),
    __E2E_PROFILES__: JSON.stringify(e2eProfiles),
  },
};

const entries = [
  { entryPoints: [join(root, 'src/extension/background/index.ts')], outfile: join(outdir, 'background.js'), format: 'esm' },
  { entryPoints: [join(root, 'src/extension/content/index.ts')], outfile: join(outdir, 'content.js'), format: 'iife' },
  { entryPoints: [join(root, 'src/extension/popup/index.ts')], outfile: join(outdir, 'popup.js'), format: 'iife' },
  { entryPoints: [join(root, 'src/extension/options/index.ts')], outfile: join(outdir, 'options.js'), format: 'iife' },
];

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  for (const f of ['popup.html', 'options.html', 'ui.css']) await cp(join(root, 'static', f), join(outdir, f));
  await cp(join(root, 'static/icons'), join(outdir, 'icons'), { recursive: true });
  await cp(join(root, 'static/sounds'), join(outdir, 'sounds'), { recursive: true });
  await writeFile(join(outdir, 'manifest.json'), JSON.stringify(await makeManifest(), null, 2));
}

await rm(outdir, { recursive: true, force: true });
await copyStatic();
if (watch) {
  const ctxs = await Promise.all(entries.map((e) => context({ ...common, ...e })));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log(`[build] observando alterações → ${outdir}`);
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
  console.log(`[build] ok → ${outdir}`);
}
