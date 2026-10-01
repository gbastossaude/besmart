#!/usr/bin/env node
/**
 * E2E real: Chromium carrega a extensão (dist-e2e/) e opera um site simulado
 * local. Cobre fluxo completo, CAPTCHA, erro 503, refresh, ambiguidade
 * (idempotência após reload), parada de emergência e consumo de CPU.
 *
 * Uso: npm run test:e2e   (CHROME_PATH=/caminho/do/chrome para outro binário)
 */
import { chromium } from 'playwright-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockServer } from './mock-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ext = join(root, 'dist-e2e');
const executablePath = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium'].find((p) => existsSync(p));
if (!executablePath) {
  console.error('Chromium não encontrado. Defina CHROME_PATH.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

const server = await startMockServer();
const userDataDir = await mkdtemp(join(tmpdir(), 'autoticket-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath,
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(sw.url()).host;
// A instalação abre a página de opções: usamos ela como "UI" para enviar comandos.
await sleep(1000);
let ui = context.pages().find((p) => p.url().startsWith(`chrome-extension://${extId}/options.html`));
if (!ui) {
  ui = await context.newPage();
  await ui.goto(`chrome-extension://${extId}/options.html`);
}
const site = await context.newPage();

const BASE_SETTINGS = {
  target: { sectors: ['Norte', 'Sul'], quantity: 2 },
  behavior: { refreshIntervalSec: 10, notifications: false, sound: false, autoProceedToCheckout: true },
  timeouts: { elementMs: 5000, selectionMs: 15000, cartConfirmMs: 4000, pageLoadMs: 10000, checkoutMs: 8000 },
  retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 2000, factor: 2 },
  logging: { debug: true },
};

const send = (msg) => ui.evaluate((m) => chrome.runtime.sendMessage(m), msg);
const run = () => sw.evaluate(() => chrome.storage.local.get('run').then((r) => r.run));
const mockState = () => fetch(`${server.origin}/__state`).then((r) => r.json());
const configure = (cfg) => fetch(`${server.origin}/__config`, { method: 'POST', body: JSON.stringify(cfg) });

async function setSettings(extra = {}) {
  const s = structuredClone(BASE_SETTINGS);
  for (const [k, v] of Object.entries(extra)) s[k] = { ...(s[k] ?? {}), ...v };
  await sw.evaluate((value) => chrome.storage.local.set({ settings: value }), s);
}

async function siteTabId() {
  return sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0]?.id);
}

async function waitPhase(phases, timeoutMs = 30000) {
  const want = [].concat(phases);
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await run();
    if (last && want.includes(last.phase)) return last;
    await sleep(200);
  }
  throw new Error(`Fase ${want.join('|')} não atingida (atual: ${last?.phase} — ${last?.reason})`);
}

async function scenario(name, fn) {
  const t0 = Date.now();
  try {
    await send({ type: 'ui/reset' });
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: String(err?.stack || err) });
    console.log(`  ✗ ${name}\n    ${String(err?.message || err)}`);
    const logs = await send({ type: 'ui/logs' }).catch(() => []);
    console.log((logs || []).slice(-15).map((l) => `      [${l.level}] ${l.msg}`).join('\n'));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function startOn(url) {
  await site.goto(url);
  await sleep(300);
  const tabId = await siteTabId();
  const r = await send({ type: 'ui/start', tabId });
  assert(r.ok, `start falhou: ${r.message}`);
  return tabId;
}

console.log(`E2E — extensão ${extId} | site ${server.origin}`);

await scenario('fluxo completo: abridor + atraso de 2,5s + quantidade + carrinho + checkout', async () => {
  await configure({ opener: true, availableAfterMs: 2500 });
  await setSettings();
  const t0 = Date.now();
  await startOn(`${server.origin}/event/1`);
  const final = await waitPhase('COMPLETED', 30000);
  const st = await mockState();
  assert(st.adds === 1, `adds=${st.adds} (esperado 1)`);
  assert(st.lastQty === '2', `qtd=${st.lastQty}`);
  assert(site.url().endsWith('/checkout'), `url final ${site.url()}`);
  assert(/pagamento manualmente/.test(final.reason), final.reason);
  console.log(`    tempo até concluir: ${Date.now() - t0}ms (disponibilidade em 2,5s + abridor 0,4s); 1ª ação: ${final.metrics.timeToFirstActionMs}ms`);
});

await scenario('CAPTCHA: espera o usuário sem interagir e retoma sozinho', async () => {
  await configure({ captcha: true });
  await setSettings();
  await startOn(`${server.origin}/event/1`);
  const w = await waitPhase('WAITING_USER', 15000);
  assert(/CAPTCHA/.test(w.reason), w.reason);
  await sleep(4000);
  let st = await mockState();
  assert(st.adds === 0 && st.captchaClicks === 0, `interagiu: ${JSON.stringify(st)}`);
  assert(st.loads === 1, `recarregou durante CAPTCHA: loads=${st.loads}`);
  await fetch(`${server.origin}/__solve`);
  await site.evaluate(() => document.querySelector('#form_captcha')?.remove());
  await waitPhase('COMPLETED', 20000);
  st = await mockState();
  assert(st.adds === 1, `adds=${st.adds}`);
});

await scenario('erro 503 transitório: recupera com backoff', async () => {
  await configure({ errorLoads: 1 });
  await setSettings();
  await startOn(`${server.origin}/event/1`);
  await waitPhase('COMPLETED', 30000);
  const r = await run();
  assert(r.retries >= 1, `retries=${r.retries}`);
  assert(r.lastError?.code === 'SERVER_ERROR_PAGE', JSON.stringify(r.lastError));
});

await scenario('esgotado → refresh no intervalo (10s) → disponível', async () => {
  await configure({ soldOutUntilLoad: 1 });
  await setSettings();
  await startOn(`${server.origin}/event/1`);
  await waitPhase('WAITING_AVAILABILITY', 10000);
  await waitPhase('COMPLETED', 30000);
  const st = await mockState();
  assert(st.loads === 2, `loads=${st.loads} (esperado 2)`);
  assert(st.adds === 1, `adds=${st.adds}`);
});

await scenario('seleção rejeitada → próxima preferência', async () => {
  await configure({ addMode: 'reject-first' });
  await setSettings();
  await startOn(`${server.origin}/event/1`);
  await waitPhase('COMPLETED', 30000);
  const st = await mockState();
  assert(st.adds === 2, `adds=${st.adds} (esperado 2)`);
  const r = await run();
  assert(r.ledger['critical#1'].status === 'failed' && r.ledger['critical#2'].status === 'confirmed', JSON.stringify(r.ledger));
});

await scenario('IDEMPOTÊNCIA: sem confirmação → pausa; reload manual não repete o clique', async () => {
  await configure({ addMode: 'silent' });
  await setSettings();
  await startOn(`${server.origin}/event/1`);
  const p = await waitPhase('PAUSED', 20000);
  assert(/Verifique o carrinho/.test(p.reason), p.reason);
  await site.reload();
  await sleep(5000);
  const st = await mockState();
  assert(st.adds === 1, `adds=${st.adds} — ação duplicada!`);
  assert((await run()).phase === 'PAUSED', 'deveria continuar pausado');
});

await scenario('reinjeção do content script (ex.: extensão atualizada) não duplica a execução', async () => {
  await configure({ availableAfterMs: 4000 });
  await setSettings();
  const tabId = await startOn(`${server.origin}/event/1`);
  await waitPhase('WAITING_AVAILABILITY', 10000);
  for (let i = 0; i < 3; i++) {
    await sw.evaluate((t) => chrome.scripting.executeScript({ target: { tabId: t }, files: ['content.js'] }), tabId);
    await sleep(200);
  }
  await waitPhase('COMPLETED', 20000);
  const st = await mockState();
  assert(st.adds === 1, `adds=${st.adds} (esperado 1)`);
  const overlays = await site.evaluate(() => document.querySelectorAll('autoticket-status').length);
  assert(overlays <= 1, `${overlays} indicadores na página`);
});

await scenario('PARADA DE EMERGÊNCIA: nada mais acontece (sem refresh, sem cliques)', async () => {
  await configure({ availableAfterMs: -1 });
  await setSettings();
  await startOn(`${server.origin}/event/1`);
  await waitPhase('WAITING_AVAILABILITY', 10000);
  await send({ type: 'ui/emergency' });
  await waitPhase('STOPPED', 3000);
  const before = await mockState();
  await sleep(12000);
  const after = await mockState();
  assert(after.loads === before.loads, `recarregou após STOP (${before.loads}→${after.loads})`);
  assert(after.adds === 0, 'clicou após STOP');
  const overlay = await site.evaluate(() => !!document.querySelector('autoticket-status'));
  console.log(`    indicador na página após STOP: ${overlay ? 'visível (some em 15s)' : 'removido'}`);
});

await scenario('CPU: DOM mudando a cada 50ms por 10s — custo do robô vs. página sozinha', async () => {
  await configure({ availableAfterMs: -1, noise: true });
  await setSettings({ behavior: { refreshIntervalSec: 120 } });
  const cdp = await context.newCDPSession(site);
  await cdp.send('Performance.enable');
  const measure = async () => {
    const a = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await sleep(10000);
    const b = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    return { script: b.ScriptDuration - a.ScriptDuration, task: b.TaskDuration - a.TaskDuration, heapMB: b.JSHeapUsedSize / 1048576 };
  };
  await site.goto(`${server.origin}/event/1`);
  const baseline = await measure();
  await startOn(`${server.origin}/event/1`);
  await waitPhase('WAITING_AVAILABILITY', 10000);
  const withBot = await measure();
  await send({ type: 'ui/stop' });
  const overhead = withBot.task - baseline.task;
  console.log(
    `    página sozinha: ${(baseline.task * 1000).toFixed(0)}ms CPU/10s | com robô: ${(withBot.task * 1000).toFixed(0)}ms CPU/10s | ` +
      `custo do robô ≈ ${(overhead * 100).toFixed(2)}% de um núcleo | heap ${withBot.heapMB.toFixed(1)}MB`,
  );
  assert(overhead < 0.5, `robô consumiu ${overhead.toFixed(2)}s de CPU em 10s`);
});

await context.close();
await server.close();
await rm(userDataDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cenários E2E passaram`);
process.exit(failed.length ? 1 : 0);
