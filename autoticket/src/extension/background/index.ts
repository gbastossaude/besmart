import { Logger } from '../../core/logger';
import type { LogEntry, RunState } from '../../core/types';
import { displayStatus } from '../../core/types';
import { BUILTIN_PROFILES, effectiveProfiles } from '../../site/profiles';
import type { SiteProfile } from '../../site/types';
import { STORAGE_KEYS, chromeArea } from '../../storage/area';
import { LogStore } from '../../storage/logs';
import type { Settings } from '../../storage/schema';
import { loadSettings } from '../../storage/settings';
import { RunStore } from '../../storage/state';
import { hostToMatchPatterns } from '../../utils/url';
import type { BackgroundMessage, SelectorReport } from '../shared/messages';
import { parseContentMessage, parseUiMessage } from '../shared/messages';
import { RunController } from './controller';

/**
 * Service worker (Manifest V3). Sem setInterval nem processos permanentes:
 * o SW acorda por mensagens, alarmes e eventos de aba, e pode ser encerrado
 * pelo Chrome a qualquer momento — todo estado relevante está no storage.
 */

declare const __E2E__: boolean;
declare const __E2E_PROFILES__: SiteProfile[];

const local = chromeArea(chrome.storage.local);
let settingsCache: Settings | null = null;

async function getSettings(): Promise<Settings> {
  settingsCache ??= await loadSettings(local);
  return settingsCache;
}

function getProfiles(settings: Settings): SiteProfile[] {
  const builtins = typeof __E2E__ !== 'undefined' && __E2E__ ? [...BUILTIN_PROFILES, ...__E2E_PROFILES__] : BUILTIN_PROFILES;
  return effectiveProfiles({ builtins, custom: settings.profiles.custom, disabled: settings.profiles.disabled });
}

const logs = new LogStore(local, 500);
let debugMode = false;
const logger = new Logger('bg', (e: LogEntry) => logs.append(e), { debug: false, console: false });

void getSettings().then((s) => {
  debugMode = s.logging.debug;
  logger.setDebug(s.logging.debug);
  logs.setCapacity(s.logging.maxEntries);
});

const STATUS_BADGE: Record<string, { text: string; color: string }> = {
  PARADO: { text: '', color: '#6b7280' },
  EXECUTANDO: { text: 'ON', color: '#2563eb' },
  AGUARDANDO: { text: '…', color: '#d97706' },
  PROCESSANDO: { text: '🛒', color: '#7c3aed' },
  PAUSADO: { text: '||', color: '#6b7280' },
  FINALIZADO: { text: '✓', color: '#16a34a' },
  ERRO: { text: '!', color: '#dc2626' },
};

function setBadge(state: RunState): void {
  const status = displayStatus(state.phase);
  const badge = state.phase === 'WAITING_USER' ? { text: '!', color: '#dc2626' } : STATUS_BADGE[status]!;
  void chrome.action.setBadgeText({ text: badge.text }).catch(() => undefined);
  void chrome.action.setBadgeBackgroundColor({ color: badge.color }).catch(() => undefined);
  void chrome.action.setTitle({ title: `AutoTicket — ${status}${state.reason ? `: ${state.reason}` : ''}` }).catch(() => undefined);
}

const controller = new RunController({
  runs: new RunStore(local),
  logs,
  logger,
  getSettings,
  getProfiles,
  tabs: {
    async get(tabId) {
      try {
        const t = await chrome.tabs.get(tabId);
        return { id: tabId, url: t.url ?? t.pendingUrl, discarded: t.discarded, status: t.status };
      } catch {
        return null;
      }
    },
    async send(tabId, msg: BackgroundMessage) {
      return chrome.tabs.sendMessage(tabId, msg, { frameId: 0 });
    },
    async reload(tabId) {
      await chrome.tabs.reload(tabId);
    },
    async setAutoDiscardable(tabId, value) {
      await chrome.tabs.update(tabId, { autoDiscardable: value });
    },
    async inject(tabId) {
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] });
    },
    async activate(tabId) {
      await chrome.tabs.update(tabId, { active: true });
    },
  },
  async hasHostPermission(url) {
    try {
      const origin = new URL(url).origin;
      return await chrome.permissions.contains({ origins: [`${origin}/*`] });
    } catch {
      return false;
    }
  },
  notify(kind, title, message) {
    void getSettings().then((s) => {
      if (!s.behavior.notifications) return;
      chrome.notifications.create(`autoticket-${kind}-${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `AutoTicket — ${title}`,
        message: message.slice(0, 250),
        priority: kind === 'cart' || kind === 'user' ? 2 : 0,
        requireInteraction: kind === 'cart' || kind === 'user',
      });
    });
  },
  setBadge,
  alarms: {
    set(name, when, periodMinutes) {
      void chrome.alarms.create(name, periodMinutes ? { when, periodInMinutes: periodMinutes } : { when });
    },
    clear(name) {
      void chrome.alarms.clear(name);
    },
  },
  now: () => Date.now(),
});

// ───────────────────────────── roteamento de mensagens ─────────────────────

const extensionOrigin = chrome.runtime.getURL('');

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromExtensionPage = !!sender.url && sender.url.startsWith(extensionOrigin);
  const work = fromExtensionPage ? handleUi(raw) : handleContent(raw, sender);
  work.then(sendResponse, (err: unknown) => {
    logger.error('Erro ao processar mensagem', { erro: err instanceof Error ? err.message : String(err) });
    sendResponse({ error: String(err) });
  });
  return true;
});

async function handleContent(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0) return null;
  const msg = parseContentMessage(raw);
  if (!msg) return null;
  switch (msg.type) {
    case 'content/hello':
      return controller.hello(tabId, msg.url);
    case 'run/report':
      return controller.report(tabId, msg.runId, msg.event, msg.extras ?? {});
    case 'run/claim':
      return controller.claim(tabId, msg.runId, msg.key, msg.url);
    case 'run/resolve':
      return controller.resolve(tabId, msg.runId, msg.key, msg.status, msg.note);
    case 'run/reload':
      return controller.requestReload(tabId, msg.runId);
    case 'run/heartbeat':
      return controller.heartbeat(tabId, msg.runId);
    case 'log/batch': {
      const entries = msg.entries.filter((e) => e && typeof e.msg === 'string' && (debugMode || e.level !== 'DEBUG'));
      logs.append(...entries.map((e) => ({ ...e, msg: String(e.msg).slice(0, 500), src: `tab${tabId}/${String(e.src).slice(0, 40)}` })));
      return true;
    }
  }
}

async function handleUi(raw: unknown): Promise<unknown> {
  const msg = parseUiMessage(raw);
  if (!msg) return null;
  switch (msg.type) {
    case 'ui/status':
      return controller.status();
    case 'ui/check':
      return (await controller.checklist(msg.tabId)).checks;
    case 'ui/start':
      return controller.start(msg.tabId);
    case 'ui/pause':
      return controller.pause();
    case 'ui/resume':
      return controller.resume();
    case 'ui/stop':
      return controller.stop();
    case 'ui/emergency':
      return controller.emergencyStop();
    case 'ui/reset':
      return controller.reset();
    case 'ui/logs':
      return logs.all();
    case 'ui/clear-logs':
      await logs.clear();
      return true;
    case 'ui/test-selectors':
      return testSelectors(msg.tabId);
    case 'ui/request-permission-done':
      await syncDynamicContentScripts();
      return true;
  }
}

async function testSelectors(tabId: number): Promise<SelectorReport | { error: string }> {
  const { profile, settings } = await controller.checklist(tabId);
  if (!profile) return { error: 'Nenhum perfil para esta aba' };
  const msg = { type: 'bg/test-selectors', profile, settings } as const;
  try {
    return (await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 })) as SelectorReport;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] });
      return (await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 })) as SelectorReport;
    } catch (err) {
      return { error: `Não foi possível acessar a aba: ${String(err)}` };
    }
  }
}

// ───────────────────────────── eventos do navegador ────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => void controller.onAlarm(alarm.name));
chrome.tabs.onRemoved.addListener((tabId) => void controller.onTabRemoved(tabId));
chrome.runtime.onStartup.addListener(() => void controller.onBrowserStartup());
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'emergency-stop') void controller.emergencyStop();
});
chrome.notifications?.onClicked.addListener((id) => {
  if (!id.startsWith('autoticket-')) return;
  void controller.status().then((s) => {
    if (s.run.tabId !== undefined) void chrome.tabs.update(s.run.tabId, { active: true }).catch(() => undefined);
  });
  chrome.notifications.clear(id);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
  void controller.status().then((s) => setBadge(s.run));
  void syncDynamicContentScripts();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.settings]) return;
  settingsCache = null;
  void getSettings().then((s) => {
    debugMode = s.logging.debug;
    logger.setDebug(s.logging.debug);
    logs.setCapacity(s.logging.maxEntries);
    void syncDynamicContentScripts();
  });
});

chrome.permissions.onAdded.addListener(() => void syncDynamicContentScripts());
chrome.permissions.onRemoved.addListener(() => void syncDynamicContentScripts());

const DYNAMIC_SCRIPT_ID = 'autoticket-custom-profiles';

/**
 * Perfis personalizados para domínios fora da lista embutida: o content script
 * é registrado dinamicamente só para os domínios cuja permissão foi concedida.
 */
async function syncDynamicContentScripts(): Promise<void> {
  try {
    const settings = await getSettings();
    const manifestMatches = new Set((chrome.runtime.getManifest().content_scripts ?? []).flatMap((c) => c.matches ?? []));
    const wanted: string[] = [];
    for (const p of settings.profiles.custom) {
      for (const h of p.hosts) {
        for (const pattern of hostToMatchPatterns(h)) {
          if (manifestMatches.has(pattern)) continue;
          if (await chrome.permissions.contains({ origins: [pattern] })) wanted.push(pattern);
        }
      }
    }
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
    if (wanted.length) {
      await chrome.scripting.registerContentScripts([
        { id: DYNAMIC_SCRIPT_ID, matches: [...new Set(wanted)], js: ['content.js'], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true },
      ]);
    }
  } catch (err) {
    logger.error('Falha ao registrar scripts para perfis personalizados', { erro: String(err) });
  }
}
