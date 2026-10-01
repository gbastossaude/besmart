import { describe, expect, it, vi } from 'vitest';
import { BotError, backoffDelay, classify, decideRecovery } from '../../src/core/errors';
import { RingBuffer, Logger, filterLogs, sanitizeContext } from '../../src/core/logger';
import { Mutex, claimAction, pendingActions, pruneLedger, resolveAction } from '../../src/core/lock';
import { MACHINE_EVENTS, canTransition, isMachineEvent, transition } from '../../src/core/machine';
import { emptyMetrics, formatDuration, increment, recordElementWait, recordPhaseChange, summarize } from '../../src/core/metrics';
import { Scheduler, SingleFlight } from '../../src/core/scheduler';
import { applyEvent, initialRunState, startRun, tryReload } from '../../src/core/state';
import type { LogEntry } from '../../src/core/types';
import { PHASES, displayStatus } from '../../src/core/types';

describe('máquina de estados', () => {
  it('segue o fluxo feliz completo', () => {
    let p = transition('IDLE', { type: 'START' });
    expect(p).toEqual({ ok: true, phase: 'INITIALIZING', changed: true });
    const steps = ['READY', 'EVENT_LIST', 'EVENT_PAGE', 'AVAILABLE', 'ADDED_TO_CART', 'CHECKOUT_REACHED', 'COMPLETE'] as const;
    const expected = ['WAITING_PAGE', 'DETECTING_EVENT', 'WAITING_AVAILABILITY', 'SELECTING', 'CART', 'CHECKOUT', 'COMPLETED'];
    let phase = p.phase;
    steps.forEach((type, i) => {
      p = transition(phase, { type });
      expect(p.ok).toBe(true);
      expect(p.phase).toBe(expected[i]);
      phase = p.phase;
    });
  });

  it('rejeita transições inválidas e mantém a fase', () => {
    const r = transition('IDLE', { type: 'ADDED_TO_CART' });
    expect(r.ok).toBe(false);
    expect(r.phase).toBe('IDLE');
    expect(transition('COMPLETED', { type: 'AVAILABLE' }).ok).toBe(false);
    expect(transition('STOPPED', { type: 'PAUSE' }).ok).toBe(false);
  });

  it('não permite iniciar duas vezes', () => {
    expect(transition('WAITING_AVAILABILITY', { type: 'START' }).ok).toBe(false);
    expect(canTransition('SELECTING', 'START')).toBe(false);
  });

  it('STOP é aceito de qualquer fase ativa e RESET sempre volta a IDLE', () => {
    for (const phase of PHASES) {
      if (phase !== 'IDLE') expect(transition(phase, { type: 'STOP' }).phase).toBe('STOPPED');
      expect(transition(phase, { type: 'RESET' }).phase).toBe('IDLE');
    }
  });

  it('mesma fase = no-op sem erro', () => {
    expect(transition('WAITING_AVAILABILITY', { type: 'UNAVAILABLE' })).toEqual({ ok: true, phase: 'WAITING_AVAILABILITY', changed: false });
  });

  it('valida eventos recebidos por mensagem', () => {
    expect(isMachineEvent({ type: 'PAUSE', reason: 'x' })).toBe(true);
    expect(isMachineEvent({ type: 'HACK' })).toBe(false);
    expect(isMachineEvent({ type: 'PAUSE', reason: 5 })).toBe(false);
    expect(MACHINE_EVENTS.length).toBeGreaterThan(10);
  });

  it('mapeia fases para os estados exibidos', () => {
    expect(displayStatus('IDLE')).toBe('PARADO');
    expect(displayStatus('SELECTING')).toBe('EXECUTANDO');
    expect(displayStatus('WAITING_USER')).toBe('AGUARDANDO');
    expect(displayStatus('CART')).toBe('PROCESSANDO');
    expect(displayStatus('COMPLETED')).toBe('FINALIZADO');
    expect(displayStatus('TIMEOUT')).toBe('ERRO');
    expect(displayStatus('PAUSED')).toBe('PAUSADO');
  });
});

describe('estado de execução', () => {
  it('startRun cria execução nova e recusa se já ativa', () => {
    const r = startRun(initialRunState(0), { tabId: 3, profileId: 'p', now: 10, runId: 'r1' });
    expect(r.ok).toBe(true);
    expect(r.state).toMatchObject({ phase: 'INITIALIZING', tabId: 3, runId: 'r1', startedAt: 10 });
    const again = startRun(r.state, { tabId: 3, profileId: 'p', now: 11, runId: 'r2' });
    expect(again.ok).toBe(false);
  });

  it('acumula tempo por fase e conta retries', () => {
    let s = startRun(initialRunState(0), { tabId: 1, profileId: 'p', now: 0, runId: 'r' }).state;
    s = applyEvent(s, { type: 'READY' }, 1000).state;
    s = applyEvent(s, { type: 'RETRY', reason: 'x' }, 3000).state;
    expect(s.retries).toBe(1);
    expect(s.metrics.timeInPhase.WAITING_PAGE).toBe(2000);
    expect(s.reason).toBe('x');
  });

  it('teto de reloads por hora (janela deslizante)', () => {
    let s = initialRunState(0);
    for (let i = 0; i < 3; i++) {
      const r = tryReload(s, i * 1000, 3);
      expect(r.allowed).toBe(true);
      s = r.state;
    }
    expect(tryReload(s, 5000, 3).allowed).toBe(false);
    expect(tryReload(s, 3_600_000 + 1000, 3).allowed).toBe(true);
  });
});

describe('erros e recuperação', () => {
  const policy = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 10_000, factor: 2 };

  it('classifica erros desconhecidos', () => {
    expect(classify(new Error('Extension context invalidated.')).code).toBe('CONTEXT_INVALIDATED');
    expect(classify(new Error('Failed to fetch')).kind).toBe('transient');
    expect(classify('x').code).toBe('UNKNOWN');
    const e = new BotError('BLOCKED', 'b');
    expect(classify(e)).toBe(e);
  });

  it('transitório: retry com backoff limitado e depois pausa', () => {
    const err = new BotError('SERVER_ERROR_PAGE', '503');
    const d0 = decideRecovery(err, 0, policy, () => 0.5);
    expect(d0).toEqual({ action: 'retry', delayMs: 1000, attempt: 1 });
    const d3 = decideRecovery(err, 3, policy, () => 0.5);
    expect(d3).toMatchObject({ action: 'retry', delayMs: 8000 });
    expect(decideRecovery(err, 4, policy).action).toBe('pause');
  });

  it('permanente falha; configuração/ambiente pausam imediatamente', () => {
    expect(decideRecovery(new BotError('BLOCKED', 'x'), 0, policy).action).toBe('fail');
    expect(decideRecovery(new BotError('CONFIG_INVALID', 'x'), 0, policy).action).toBe('pause');
    expect(decideRecovery(new BotError('TAB_GONE', 'x'), 0, policy).action).toBe('pause');
  });

  it('recuperável tem metade das tentativas', () => {
    const err = new BotError('STEP_FAILED', 'x');
    expect(decideRecovery(err, 1, policy).action).toBe('retry');
    expect(decideRecovery(err, 2, policy).action).toBe('pause');
  });

  it('backoff nunca passa do máximo, mesmo com jitter', () => {
    for (let a = 0; a < 20; a++) expect(backoffDelay(a, policy, () => 1)).toBeLessThanOrEqual(policy.maxDelayMs);
  });
});

describe('Scheduler', () => {
  it('dispose cancela timers, observers e listeners', async () => {
    vi.useFakeTimers();
    const s = new Scheduler();
    const fn = vi.fn();
    s.timeout(fn, 100);
    const target = new EventTarget();
    const handler = vi.fn();
    s.listen(target, 'x', handler);
    expect(s.stats()).toMatchObject({ timers: 1, cleanups: 1 });
    s.dispose();
    vi.advanceTimersByTime(500);
    target.dispatchEvent(new Event('x'));
    expect(fn).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(s.stats()).toEqual({ timers: 0, observers: 0, cleanups: 0, disposed: true });
    vi.useRealTimers();
  });

  it('every() não sobrepõe execuções assíncronas', async () => {
    vi.useFakeTimers();
    const s = new Scheduler();
    let running = 0;
    let maxRunning = 0;
    let calls = 0;
    s.every(10, async () => {
      running++;
      calls++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 50));
      running--;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(maxRunning).toBe(1);
    expect(calls).toBeGreaterThan(3);
    s.dispose();
    const before = calls;
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBeLessThanOrEqual(before + 1);
    vi.useRealTimers();
  });

  it('sleep é cancelado pelo dispose', async () => {
    const s = new Scheduler();
    const p = s.sleep(10_000);
    s.dispose();
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('SingleFlight coalesce chamadas concorrentes em uma reexecução', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const sf = new SingleFlight(async () => {
      calls++;
      if (calls === 1) await new Promise<void>((r) => (release = r));
    });
    const first = sf.run();
    void sf.run();
    void sf.run();
    void sf.run();
    release();
    await first;
    expect(calls).toBe(2);
  });
});

describe('logger e métricas', () => {
  it('RingBuffer mantém só os N mais recentes', () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1, 2, 3, 4, 5);
    expect(rb.toArray()).toEqual([3, 4, 5]);
    rb.resize(2);
    expect(rb.toArray()).toEqual([4, 5]);
  });

  it('DEBUG só aparece com modo debug', () => {
    const out: LogEntry[] = [];
    const log = new Logger('t', (e) => out.push(e), { debug: false });
    log.debug('oculto');
    log.info('visível');
    log.setDebug(true);
    log.debug('agora sim');
    expect(out.map((e) => e.msg)).toEqual(['visível', 'agora sim']);
    expect(filterLogs(out, 'INFO').length).toBe(1);
  });

  it('contexto sensível é mascarado e truncado', () => {
    const c = sanitizeContext({ password: 'x', token: 'y', big: 'a'.repeat(1000), n: 1, obj: { a: 1 } });
    expect(c.password).toBe('[redacted]');
    expect(c.token).toBe('[redacted]');
    expect(String(c.big).length).toBeLessThan(400);
    expect(c.obj).toEqual({ a: 1 });
  });

  it('métricas: tempo por fase, contadores e esperas', () => {
    let m = emptyMetrics(0);
    m = recordPhaseChange(m, 'WAITING_PAGE', 500);
    m = increment(m, 'reloads');
    m = increment(m, 'reloads');
    m = recordElementWait(m, 100);
    m = recordElementWait(m, 300);
    const s = summarize(m, 'SELECTING', 0, 1500);
    expect(s.timeInPhase).toMatchObject({ WAITING_PAGE: 500, SELECTING: 1000 });
    expect(s.counters.reloads).toBe(2);
    expect(s.avgElementWaitMs).toBe(200);
    expect(s.maxElementWaitMs).toBe(300);
    expect(formatDuration(65_000)).toBe('1m 05s');
  });
});

describe('locks e idempotência', () => {
  it('Mutex serializa operações concorrentes', async () => {
    const m = new Mutex();
    const order: string[] = [];
    let counter = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        m.run(async () => {
          const read = counter;
          await new Promise((r) => setTimeout(r, 5 - i));
          counter = read + 1;
          order.push(String(i));
        }),
      ),
    );
    expect(counter).toBe(5);
    expect(order).toEqual(['1', '2', '3', '4', '5']);
  });

  it('Mutex continua após erro', async () => {
    const m = new Mutex();
    await expect(m.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(m.run(() => 42)).resolves.toBe(42);
  });

  it('ledger: pendente/confirmada nunca são concedidas de novo; falha libera', () => {
    let l = {};
    const a = claimAction(l, 'k', 1);
    expect(a.result.granted).toBe(true);
    l = a.ledger;
    expect(claimAction(l, 'k', 2).result).toMatchObject({ granted: false, status: 'pending' });
    expect(pendingActions(l)).toEqual(['k']);
    l = resolveAction(l, 'k', 'confirmed', 3);
    expect(claimAction(l, 'k', 4).result.granted).toBe(false);
    l = resolveAction(l, 'k', 'failed', 5);
    expect(claimAction(l, 'k', 6).result.granted).toBe(true);
  });

  it('ledger é podado', () => {
    const l: Record<string, { status: 'confirmed'; at: number }> = {};
    for (let i = 0; i < 150; i++) l[`k${i}`] = { status: 'confirmed', at: i };
    const p = pruneLedger(l, 100);
    expect(Object.keys(p)).toHaveLength(100);
    expect(p.k149).toBeDefined();
    expect(p.k0).toBeUndefined();
  });
});
