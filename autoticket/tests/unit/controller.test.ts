// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, disposeAllRunners, eventPage, until } from './harness';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
});
afterEach(() => {
  disposeAllRunners();
  vi.useRealTimers();
});

describe('checklist antes de iniciar', () => {
  it('não inicia sem perfil para o domínio e explica o motivo', async () => {
    const h = createHarness({ url: 'https://desconhecido.com/x' });
    const r = await h.controller.start(1);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'profile')?.ok).toBe(false);
    expect((await h.state()).phase).toBe('IDLE');
  });

  it('não inicia sem permissão de host', async () => {
    const h = createHarness();
    h.deps.hasHostPermission = async () => false;
    const r = await h.controller.start(1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Permissão/);
  });

  it('não inicia sem preferências definidas', async () => {
    const h = createHarness({ settings: { target: { sectors: [], categories: [], eventKeywords: [] } } });
    const r = await h.controller.start(1);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'target')?.ok).toBe(false);
  });

  it('impede execução duplicada', async () => {
    const h = createHarness();
    expect((await h.controller.start(1)).ok).toBe(true);
    const again = await h.controller.start(1);
    expect(again.ok).toBe(false);
    expect(again.checks.find((c) => c.id === 'single')?.ok).toBe(false);
  });

  it('duas chamadas simultâneas de iniciar resultam em UMA execução', async () => {
    const h = createHarness();
    const [a, b] = await Promise.all([h.controller.start(1), h.controller.start(1)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it('início agendado: não age antes do horário; no horário recarrega a página', async () => {
    const when = new Date(Date.now() + 60_000);
    const iso = new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const h = createHarness({ settings: { behavior: { scheduledStart: iso, notifications: false, sound: false } } });
    const r = await h.controller.start(1);
    expect(r.ok).toBe(true);
    expect(h.alarms.has('scheduled-start')).toBe(true);
    expect(await h.attach()).toBeNull();
    vi.setSystemTime(when.getTime() + 1000);
    await h.controller.onAlarm('scheduled-start');
    expect(h.location.reloads).toBe(1);
    expect(await h.attach()).not.toBeNull();
  });
});

describe('concorrência e idempotência no background', () => {
  it('claims simultâneos da mesma ação: só um é concedido', async () => {
    const h = createHarness();
    await h.controller.start(1);
    const runId = (await h.state()).runId;
    const results = await Promise.all(Array.from({ length: 10 }, () => h.controller.claim(1, runId, 'critical#1', 'https://mock.test/event/1')));
    expect(results.filter((r) => r.granted)).toHaveLength(1);
  });

  it('mensagens de outra aba são ignoradas', async () => {
    const h = createHarness();
    await h.controller.start(1);
    const runId = (await h.state()).runId;
    expect(await h.controller.report(99, runId, { type: 'AVAILABLE' })).toBeNull();
    expect((await h.controller.claim(99, runId, 'critical#1', 'x')).granted).toBe(false);
  });

  it('transições inválidas vindas da aba não corrompem o estado', async () => {
    const h = createHarness();
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    const runId = (await h.state()).runId;
    const snap = await h.controller.report(1, runId, { type: 'CHECKOUT_REACHED' });
    expect(snap?.phase).toBe('WAITING_AVAILABILITY');
    expect(h.logs.some((l) => /Transição ignorada/.test(l.msg))).toBe(true);
  });
});

describe('watchdog', () => {
  it('aba fechada → pausa', async () => {
    const h = createHarness();
    await h.start();
    h.closeTab();
    await h.controller.watchdog();
    expect((await h.state()).phase).toBe('PAUSED');
    expect((await h.state()).reason).toMatch(/aba/);
  });

  it('sem sinal de vida → tenta acordar; continua sem sinal → pausa com contexto', async () => {
    const h = createHarness();
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    h.runner?.stop('simula travamento');
    vi.setSystemTime(Date.now() + h.settings.timeouts.heartbeatStaleMs + 1000);
    await h.controller.watchdog();
    expect(h.sent.filter((m) => m.type === 'bg/wake').length).toBeGreaterThanOrEqual(2);
    expect((await h.state()).phase).toBe('WAITING_AVAILABILITY');
    vi.setSystemTime(Date.now() + 31_000);
    await h.controller.watchdog();
    expect((await h.state()).phase).toBe('PAUSED');
    expect((await h.state()).lastError?.code).toBe('CONTENT_UNREACHABLE');
  });

  it('refresh atrasado (aba em segundo plano) é feito pelo watchdog respeitando o teto', async () => {
    const h = createHarness();
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    await until(async () => !!(await h.controller.status()).nextRefreshAt);
    h.runner?.stop('timers congelados'); // simula throttling de aba oculta
    vi.setSystemTime(Date.now() + 10_000 + 25_000);
    await h.controller.watchdog();
    expect(h.location.reloads).toBe(1);
    expect((await h.state()).reloads).toHaveLength(1);
  });

  it('espera pelo usuário com limite configurado → pausa', async () => {
    const h = createHarness({ settings: { behavior: { userWaitLimitMin: 1, notifications: false, sound: false } } });
    document.body.innerHTML = eventPage() + '<div id="form_captcha"></div>';
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_USER');
    vi.setSystemTime(Date.now() + 61_000);
    await h.controller.heartbeat(1, (await h.state()).runId);
    await h.controller.watchdog();
    expect((await h.state()).phase).toBe('PAUSED');
  });
});

describe('logs e persistência', () => {
  it('logs têm limite fixo e são gravados em lote', async () => {
    const h = createHarness();
    for (let i = 0; i < 700; i++) h.deps.logs.append({ t: i, level: 'INFO', src: 't', msg: `m${i}` });
    const all = await h.deps.logs.all();
    expect(all).toHaveLength(500);
    expect(all.at(-1)?.msg).toBe('m699');
  });

  it('estado corrompido no storage volta para IDLE sem quebrar', async () => {
    const { sanitizeRunState } = await import('../../src/storage/state');
    expect(sanitizeRunState({ phase: 'HACKED' }, 1).phase).toBe('IDLE');
    expect(sanitizeRunState({ phase: 'PAUSED', reloads: 'x', ledger: null }, 1)).toMatchObject({ phase: 'PAUSED', reloads: [], ledger: {} });
  });

  it('redefinir limpa ledger, erros e libera o lock', async () => {
    const h = createHarness();
    await h.start();
    await h.controller.reset();
    const s = await h.state();
    expect(s).toMatchObject({ phase: 'IDLE', ledger: {}, errorCount: 0 });
    expect(s.tabId).toBeUndefined();
    expect((await h.controller.start(1)).ok).toBe(true);
  });
});
