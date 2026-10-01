import { Logger } from '../../core/logger';
import type { ClaimResult } from '../../core/lock';
import type { LogEntry } from '../../core/types';
import { isActivePhase } from '../../core/types';
import type { Bridge, RunSnapshot } from '../../site/flows';
import { Runner } from '../../site/flows';
import type { BackgroundMessage, ContentMessage, HelloResponse } from '../shared/messages';
import { runSelectorTest } from './diagnostics';
import { Overlay } from './overlay';

/**
 * Content script (apenas no frame principal). Fica inerte até o background
 * confirmar que ESTA aba é a dona da execução — abas não controladas não
 * criam observers nem timers.
 */

const REPLACE_EVENT = 'autoticket:replace';
const g = globalThis as unknown as Record<string, unknown>;

// Uma nova injeção (ex.: extensão atualizada, ou reinjeção pelo background) sempre
// substitui a anterior: a instância antiga recebe o evento e se desliga por completo.
document.dispatchEvent(new CustomEvent(REPLACE_EVENT));
main();

function main(): void {
  let runner: Runner | null = null;
  let runId = '';
  let orphaned = false;
  let logQueue: LogEntry[] = [];
  let logTimer: ReturnType<typeof setTimeout> | null = null;
  let soundEnabled = true;
  let lastSoundAt = 0;
  const overlay = new Overlay(document, () => {
    if (!runner || runner.isStopped) {
      overlay.remove();
      return;
    }
    void send({ type: 'run/report', runId, event: { type: 'STOP', reason: 'Parado pelo botão na página' } });
  });

  const logger = new Logger('page', (entry) => {
    logQueue.push(entry);
    if (logQueue.length > 200) logQueue = logQueue.slice(-200);
    logTimer ??= setTimeout(flushLogs, 500);
  }, { debug: false });

  function flushLogs(): void {
    logTimer = null;
    if (!logQueue.length || orphaned) return;
    const entries = logQueue;
    logQueue = [];
    void send({ type: 'log/batch', entries });
  }

  /** Envio seguro: se a extensão foi recarregada, este script fica órfão e se desliga. */
  async function send<T = unknown>(msg: ContentMessage): Promise<T | null> {
    if (orphaned) return null;
    try {
      return (await chrome.runtime.sendMessage(msg)) as T;
    } catch (err) {
      if (/context invalidated/i.test(String(err)) || !chrome.runtime?.id) shutdown('contexto da extensão invalidado');
      return null;
    }
  }

  function shutdown(reason: string): void {
    orphaned = true;
    runner?.stop(reason);
    runner = null;
    overlay.remove();
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      /* contexto já inválido */
    }
  }

  function makeBridge(id: string): Bridge {
    return {
      report: async (event, extras) => {
        const snap = await send<RunSnapshot | null>({ type: 'run/report', runId: id, event, extras });
        if (snap) overlay.show(snap.phase, snap.reason);
        return snap;
      },
      claim: async (key, url) => (await send<ClaimResult>({ type: 'run/claim', runId: id, key, url })) ?? { granted: false, status: 'pending', at: 0 },
      resolve: async (key, status, note) => {
        await send({ type: 'run/resolve', runId: id, key, status, note });
      },
      requestReload: async () => (await send<boolean>({ type: 'run/reload', runId: id })) === true,
      heartbeat: () => void send({ type: 'run/heartbeat', runId: id }),
      playSound: () => {
        const now = Date.now();
        if (!soundEnabled || now - lastSoundAt < 5000) return;
        lastSoundAt = now;
        try {
          void new Audio(chrome.runtime.getURL('sounds/alert.wav')).play().catch(() => undefined);
        } catch {
          /* autoplay bloqueado */
        }
      },
    };
  }

  async function hello(): Promise<void> {
    const resp = await send<HelloResponse>({ type: 'content/hello', url: location.href });
    if (!resp || !resp.active) {
      if (runner) {
        runner.stop('inativo');
        runner = null;
      }
      return;
    }
    if (runner && !runner.isStopped && runId === resp.snapshot.runId) {
      runner.poke();
      return;
    }
    runner?.stop('nova execução');
    runId = resp.snapshot.runId;
    soundEnabled = resp.settings.behavior.sound;
    logger.setDebug(resp.settings.logging.debug);
    overlay.show(resp.snapshot.phase, resp.snapshot.reason);
    runner = new Runner(
      { doc: document, win: window, profile: resp.profile, settings: resp.settings, bridge: makeBridge(runId), logger },
      resp.snapshot,
    );
    runner.start();
  }

  function onMessage(raw: unknown, sender: chrome.runtime.MessageSender, sendResponse: (r?: unknown) => void): boolean {
    if (sender.id !== chrome.runtime.id) return false;
    const msg = raw as BackgroundMessage;
    switch (msg?.type) {
      case 'bg/wake':
        void hello();
        sendResponse({ ok: true });
        return false;
      case 'bg/halt':
        runner?.stop(msg.reason);
        runner = null;
        flushLogs();
        // Mostra o estado final por alguns segundos e some.
        if (msg.phase) overlay.show(msg.phase, msg.reason);
        setTimeout(() => {
          if (!runner) overlay.remove();
        }, 15_000);
        sendResponse({ ok: true });
        return false;
      case 'bg/ping':
        sendResponse({ alive: true, running: !!runner && !runner.isStopped, phase: runner?.phase ?? null });
        return false;
      case 'bg/test-selectors':
        sendResponse(runSelectorTest(document, location.href, msg.profile, msg.settings));
        return false;
      default:
        return false;
    }
  }

  chrome.runtime.onMessage.addListener(onMessage);
  document.addEventListener(REPLACE_EVENT, () => shutdown('substituído por nova instância'), { once: true });
  // Volta do bfcache (botão voltar): o script não é reinjetado, então revalida.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) void hello();
  });
  window.addEventListener('pagehide', () => flushLogs());
  void hello();

  // Exposto só para depuração manual no console da aba.
  g.__autoticketDebug__ = () => ({ runId, running: !!runner && !runner.isStopped, phase: runner?.phase, active: runner ? isActivePhase(runner.phase) : false, scheduler: runner?.schedulerStats() });
}
