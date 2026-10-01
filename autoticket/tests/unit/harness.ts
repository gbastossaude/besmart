import { vi } from 'vitest';
import { Logger } from '../../src/core/logger';
import type { LogEntry } from '../../src/core/types';
import { RunController } from '../../src/extension/background/controller';
import type { ControllerDeps, TabInfo } from '../../src/extension/background/controller';
import type { BackgroundMessage } from '../../src/extension/shared/messages';
import { Runner } from '../../src/site/flows';
import type { Bridge } from '../../src/site/flows';
import type { SiteProfile } from '../../src/site/types';
import { memoryArea } from '../../src/storage/area';
import { LogStore } from '../../src/storage/logs';
import type { Settings } from '../../src/storage/schema';
import { normalizeSettings } from '../../src/storage/schema';
import { RunStore } from '../../src/storage/state';

export const TEST_PROFILE: SiteProfile = {
  id: 'mock',
  name: 'Mock',
  version: 1,
  verified: true,
  hosts: ['mock.test'],
  pages: { eventList: ['/events'], event: ['/event'], cart: ['/cart'], checkout: ['/checkout'], login: ['/login'] },
  dom: { cartFilled: [{ css: '#cart-count[data-count]:not([data-count="0"])' }] },
  texts: { soldOut: ['esgotado'], actionFailed: ['limite atingido'], cartConfirmed: ['adicionado ao carrinho'] },
  eventList: { items: [{ css: '.event-card' }], clickTarget: 'a' },
  steps: [
    { id: 'abrir', kind: 'click', label: 'Abrir ingressos', optional: true, timeoutMs: 1000, target: [{ css: 'button#open-picker' }] },
    { id: 'setor', kind: 'pick', label: 'Setor', source: 'sectors', probe: true, items: [{ css: '.sector', textIn: '.name' }], textIn: '.name' },
    { id: 'quantidade', kind: 'quantity', label: 'Quantidade', optional: true, timeoutMs: 1000, input: [{ css: 'select#qty' }] },
    { id: 'adicionar', kind: 'click', label: 'Adicionar ao carrinho', critical: true, target: [{ css: 'button#add', text: ['adicionar'] }] },
  ],
  cart: { proceed: [{ css: 'a#go-checkout' }] },
};

/** Runners vivos de todos os harnesses (para limpeza entre testes). */
const liveRunners = new Set<Runner>();

export function disposeAllRunners(): void {
  for (const r of liveRunners) r.stop('fim do teste');
  liveRunners.clear();
}

export interface HarnessOptions {
  settings?: Record<string, unknown>;
  profile?: SiteProfile;
  url?: string;
}

/** Location falso (jsdom não navega): registra reload/assign. */
export class FakeLocation {
  reloads = 0;
  assigned: string[] = [];
  constructor(public href: string) {}
  reload = () => {
    this.reloads++;
  };
  assign = (url: string) => {
    this.assigned.push(url);
  };
}

/**
 * Liga o Runner (content) ao RunController (background) real, com storage em
 * memória — exercita o sistema inteiro sem Chrome.
 */
export function createHarness(opts: HarnessOptions = {}) {
  const profile = opts.profile ?? TEST_PROFILE;
  const settings: Settings = normalizeSettings({
    target: { sectors: ['Norte', 'Sul'], quantity: 2 },
    behavior: { refreshIntervalSec: 10, notifications: false, sound: false },
    timeouts: { elementMs: 1000, selectionMs: 5000, cartConfirmMs: 3000, pageLoadMs: 5000, checkoutMs: 5000 },
    retry: { maxAttempts: 3, baseDelayMs: 250, maxDelayMs: 1000, factor: 2 },
    ...opts.settings,
  });
  const area = memoryArea();
  const logs: LogEntry[] = [];
  const logger = new Logger('test', (e) => logs.push(e), { debug: true });
  const location = new FakeLocation(opts.url ?? 'https://mock.test/event/1');
  const tab: TabInfo = { id: 1, url: location.href };
  const sent: BackgroundMessage[] = [];
  const notifications: string[] = [];
  const alarms = new Map<string, number>();
  const deps: ControllerDeps = {
    runs: new RunStore(area, () => Date.now(), 10),
    logs: new LogStore(area, 500, 10),
    logger,
    getSettings: async () => settings,
    getProfiles: () => [profile],
    tabs: {
      get: async (id) => (id === tab.id && !tabClosed ? { ...tab, url: location.href } : null),
      send: async (_id, msg) => {
        sent.push(msg);
        if (msg.type === 'bg/halt') runner?.stop(msg.reason);
        return { ok: true };
      },
      reload: async () => location.reload(),
      setAutoDiscardable: async () => undefined,
      inject: async () => undefined,
      activate: async () => undefined,
    },
    hasHostPermission: async () => true,
    notify: (kind, title) => notifications.push(`${kind}:${title}`),
    setBadge: () => undefined,
    alarms: { set: (n, w) => alarms.set(n, w), clear: (n) => alarms.delete(n) },
    now: () => Date.now(),
  };
  const controller = new RunController(deps);
  let runner: Runner | null = null;
  let tabClosed = false;
  const sounds = vi.fn();

  const win = {
    location,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
  } as unknown as Window;

  function bridgeFor(runId: string): Bridge {
    return {
      report: (event, extras) => controller.report(1, runId, event, extras),
      claim: (key, url) => controller.claim(1, runId, key, url),
      resolve: (key, status, note) => controller.resolve(1, runId, key, status, note),
      requestReload: () => controller.requestReload(1, runId),
      heartbeat: () => void controller.heartbeat(1, runId),
      playSound: sounds,
    };
  }

  /** Simula o content script carregando na aba (hello → Runner). */
  async function attach(): Promise<Runner | null> {
    runner?.stop('reattach');
    const resp = await controller.hello(1, location.href);
    if (!resp.active) return null;
    runner = new Runner({ doc: document, win, profile: resp.profile, settings: resp.settings, bridge: bridgeFor(resp.snapshot.runId), logger }, resp.snapshot);
    liveRunners.add(runner);
    runner.start();
    return runner;
  }

  /** Simula reload/navegação: o runner antigo morre e um novo nasce. */
  async function navigate(url: string, html?: string): Promise<Runner | null> {
    runner?.stop('navegação');
    location.href = url;
    if (html !== undefined) document.body.innerHTML = html;
    return attach();
  }

  return {
    controller,
    deps,
    settings,
    logs,
    location,
    sent,
    notifications,
    alarms,
    sounds,
    get runner() {
      return runner;
    },
    attach,
    navigate,
    closeTab() {
      tabClosed = true;
    },
    async state() {
      return deps.runs.get();
    },
    async start() {
      const r = await controller.start(1);
      if (!r.ok) throw new Error(r.message);
      return attach();
    },
  };
}

export function eventPage(opts: { sectors?: Array<{ name: string; soldOut?: boolean }>; opener?: boolean; qty?: number[]; addBehavior?: string } = {}): string {
  const sectors = opts.sectors ?? [{ name: 'Norte' }];
  const list = sectors
    .map((s) => `<div class="sector" data-name="${s.name}"><span class="name">${s.name}</span>${s.soldOut ? ' ESGOTADO' : ''}</div>`)
    .join('');
  const qty = (opts.qty ?? [1, 2, 3, 4]).map((n) => `<option value="${n}">${n}</option>`).join('');
  return `
    <header><span id="cart-count" data-count="0">0</span></header>
    <main>
      ${opts.opener ? '<button id="open-picker">Ingressos</button><div id="picker"></div>' : `<div id="picker">${list}</div>`}
      <select id="qty">${qty}</select>
      <button id="add">Adicionar ao carrinho</button>
      <div id="feedback"></div>
    </main>`;
}

export function sectorsHtml(sectors: Array<{ name: string; soldOut?: boolean }>): string {
  return sectors.map((s) => `<div class="sector"><span class="name">${s.name}</span>${s.soldOut ? ' ESGOTADO' : ''}</div>`).join('');
}

/** Avança timers falsos e microtarefas até a condição ser verdadeira. */
export async function until(cond: () => boolean | Promise<boolean>, maxMs = 20_000, stepMs = 50): Promise<void> {
  for (let t = 0; t <= maxMs; t += stepMs) {
    if (await cond()) return;
    await vi.advanceTimersByTimeAsync(stepMs);
  }
  throw new Error('condição não atingida');
}
