import { filterLogs } from '../../core/logger';
import { formatDuration } from '../../core/metrics';
import type { LogEntry, LogLevel } from '../../core/types';
import { BUILTIN_PROFILES, effectiveProfiles } from '../../site/profiles';
import type { SiteProfile } from '../../site/types';
import { STORAGE_KEYS, chromeArea } from '../../storage/area';
import type { Settings } from '../../storage/schema';
import { DEFAULT_SETTINGS, normalizeSettings, validateProfile, validateSettings } from '../../storage/schema';
import { loadSettings, saveSettings } from '../../storage/settings';
import { splitList } from '../../utils/text';
import { hostToMatchPatterns } from '../../utils/url';
import type { StatusResponse } from '../shared/messages';
import { $, PHASE_LABEL, ask, clockTime, download, h, logLine, onStorageChange } from '../shared/ui';

const area = chromeArea(chrome.storage.local);
let settings: Settings = DEFAULT_SETTINGS;

$('#version').textContent = `v${chrome.runtime.getManifest().version}`;

// ───────────────────────────── abas ─────────────────────────────
document.querySelectorAll<HTMLButtonElement>('nav [data-tab]').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('nav [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll<HTMLElement>('section[id^="tab-"]').forEach((s) => (s.hidden = s.id !== `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === 'logs') void renderLogs();
    if (btn.dataset.tab === 'diag') void renderDiag();
    if (btn.dataset.tab === 'profiles') void renderProfiles();
  }),
);

// ───────────────────────────── formulário ─────────────────────────────
const form = $('#form') as HTMLFormElement;
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

function fillForm(s: Settings): void {
  field('eventKeywords').value = s.target.eventKeywords.join('\n');
  field('eventUrl').value = s.target.eventUrl;
  field('sectors').value = s.target.sectors.join('\n');
  field('categories').value = s.target.categories.join('\n');
  field('quantity').value = String(s.target.quantity);
  field('mode').value = s.behavior.mode;
  field('refreshIntervalSec').value = String(s.behavior.refreshIntervalSec);
  field('maxReloadsPerHour').value = String(s.behavior.maxReloadsPerHour);
  field('maxSelectionAttempts').value = String(s.behavior.maxSelectionAttempts);
  field('scheduledStart').value = s.behavior.scheduledStart;
  field('userWaitLimitMin').value = String(s.behavior.userWaitLimitMin);
  field('autoProceedToCheckout').checked = s.behavior.autoProceedToCheckout;
  field('notifications').checked = s.behavior.notifications;
  field('sound').checked = s.behavior.sound;
  for (const k of Object.keys(s.timeouts) as Array<keyof Settings['timeouts']>) field(k).value = String(s.timeouts[k]);
  for (const k of Object.keys(s.retry) as Array<keyof Settings['retry']>) field(k).value = String(s.retry[k]);
  field('debug').checked = s.logging.debug;
  field('maxEntries').value = String(s.logging.maxEntries);
}

function readForm(): Settings {
  const num = (n: string) => Number(field(n).value);
  return normalizeSettings({
    ...settings,
    target: {
      eventKeywords: splitList(field('eventKeywords').value.replace(/,/g, '\n')),
      eventUrl: field('eventUrl').value,
      sectors: field('sectors').value.split('\n').map((s) => s.trim()).filter(Boolean),
      categories: field('categories').value.split('\n').map((s) => s.trim()).filter(Boolean),
      quantity: num('quantity'),
    },
    behavior: {
      mode: field('mode').value,
      refreshIntervalSec: num('refreshIntervalSec'),
      maxReloadsPerHour: num('maxReloadsPerHour'),
      maxSelectionAttempts: num('maxSelectionAttempts'),
      scheduledStart: field('scheduledStart').value,
      userWaitLimitMin: num('userWaitLimitMin'),
      autoProceedToCheckout: field('autoProceedToCheckout').checked,
      notifications: field('notifications').checked,
      sound: field('sound').checked,
    },
    timeouts: Object.fromEntries(Object.keys(settings.timeouts).map((k) => [k, num(k)])),
    retry: Object.fromEntries(Object.keys(settings.retry).map((k) => [k, num(k)])),
    logging: { debug: field('debug').checked, maxEntries: num('maxEntries') },
  });
}

async function persist(next: Settings, msg = 'Configuração salva'): Promise<void> {
  const errors = validateSettings(next);
  $('#form-errors').textContent = errors.join('\n');
  if (errors.length) return;
  settings = await saveSettings(area, next);
  fillForm(settings);
  $('#saved').textContent = `${msg} às ${clockTime(Date.now())}`;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void persist(readForm());
});
$('#restore').addEventListener('click', () => {
  if (confirm('Restaurar todos os valores padrão? (perfis personalizados são mantidos)')) {
    void persist({ ...DEFAULT_SETTINGS, profiles: settings.profiles }, 'Padrões restaurados');
  }
});
$('#export-settings').addEventListener('click', () => download('autoticket-config.json', JSON.stringify(settings, null, 2)));
$('#import-btn').addEventListener('click', () => $('#import-settings').click());
($('#import-settings') as HTMLInputElement).addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await persist(normalizeSettings(JSON.parse(await file.text())), 'Configuração importada');
  } catch (err) {
    $('#form-errors').textContent = `Arquivo inválido: ${String(err)}`;
  }
});

// ───────────────────────────── perfis ─────────────────────────────

async function hasPermission(p: SiteProfile): Promise<boolean> {
  return chrome.permissions.contains({ origins: p.hosts.flatMap(hostToMatchPatterns) });
}

async function renderProfiles(): Promise<void> {
  const all = effectiveProfiles({ builtins: BUILTIN_PROFILES, custom: settings.profiles.custom, disabled: [] });
  const list = $('#profile-list');
  const rows = await Promise.all(
    all.map(async (p) => {
      const isCustom = settings.profiles.custom.some((c) => c.id === p.id);
      const enabled = !settings.profiles.disabled.includes(p.id);
      const granted = await hasPermission(p);
      const toggle = h('input', { type: 'checkbox', checked: enabled, title: 'Ativo' }) as HTMLInputElement;
      toggle.addEventListener('change', () => {
        const disabled = new Set(settings.profiles.disabled);
        if (toggle.checked) disabled.delete(p.id);
        else disabled.add(p.id);
        void persist({ ...settings, profiles: { ...settings.profiles, disabled: [...disabled] } }, 'Perfis atualizados').then(renderProfiles);
      });
      const actions = h('div', { class: 'row' });
      if (!granted) {
        actions.append(
          h('button', {
            type: 'button',
            onclick: async () => {
              // Pedido de permissão precisa de gesto do usuário — só os domínios deste perfil.
              const ok = await chrome.permissions.request({ origins: p.hosts.flatMap(hostToMatchPatterns) });
              if (ok) await ask({ type: 'ui/request-permission-done' });
              void renderProfiles();
            },
          }, 'Conceder permissão'),
        );
      }
      if (isCustom) {
        actions.append(
          h('button', {
            type: 'button',
            onclick: () => {
              if (!confirm(`Remover o perfil personalizado "${p.name}"?`)) return;
              void persist({ ...settings, profiles: { ...settings.profiles, custom: settings.profiles.custom.filter((c) => c.id !== p.id) } }, 'Perfil removido').then(renderProfiles);
            },
          }, 'Remover'),
        );
      }
      return h(
        'div',
        { class: 'card profile' },
        h(
          'div',
          {},
          h('label', { class: 'check' }, toggle, h('strong', {}, p.name)),
          h('small', {}, `${p.id} · v${p.version} · ${p.hosts.join(', ')}`),
          h('div', {},
            h('span', { class: `badge ${p.verified ? 'ok' : 'warn'}` }, p.verified ? 'verificado' : 'não verificado'), ' ',
            isCustom ? h('span', { class: 'badge' }, 'personalizado') : null, ' ',
            h('span', { class: `badge ${granted ? 'ok' : 'warn'}` }, granted ? 'permissão concedida' : 'sem permissão'),
          ),
          p.notes ? h('div', {}, h('small', {}, p.notes)) : null,
        ),
        actions,
      );
    }),
  );
  list.replaceChildren(...rows);
  const select = $('#profile-template') as HTMLSelectElement;
  select.replaceChildren(h('option', { value: '__new' }, 'Novo perfil (modelo)'), ...all.map((p) => h('option', { value: p.id }, p.name)));
}

const TEMPLATE: SiteProfile = {
  id: 'meu-site',
  name: 'Meu site',
  version: 1,
  verified: false,
  hosts: ['exemplo.com.br'],
  pages: { event: ['/evento/'], cart: ['/carrinho'], checkout: ['/checkout'], login: ['/login'] },
  texts: { soldOut: ['esgotado'], actionFailed: ['nao foi possivel'] },
  steps: [
    { id: 'setor', kind: 'pick', label: 'Setor', source: 'sectors', probe: true, items: [{ css: '.setor' }] },
    { id: 'quantidade', kind: 'quantity', label: 'Quantidade', optional: true, input: [{ css: 'select.quantidade' }] },
    { id: 'adicionar', kind: 'click', label: 'Adicionar ao carrinho', critical: true, target: [{ css: 'button', text: ['adicionar ao carrinho'] }] },
  ],
};

$('#load-template').addEventListener('click', () => {
  const id = ($('#profile-template') as HTMLSelectElement).value;
  const all = effectiveProfiles({ builtins: BUILTIN_PROFILES, custom: settings.profiles.custom, disabled: [] });
  const p = id === '__new' ? TEMPLATE : all.find((x) => x.id === id);
  ($('#profile-json') as HTMLTextAreaElement).value = JSON.stringify(p ?? TEMPLATE, null, 2);
  $('#profile-errors').textContent = '';
});

function parseEditor(): { profile?: SiteProfile; errors: string[] } {
  try {
    const profile = JSON.parse(($('#profile-json') as HTMLTextAreaElement).value) as SiteProfile;
    return { profile, errors: validateProfile(profile) };
  } catch (err) {
    return { errors: [`JSON inválido: ${String(err)}`] };
  }
}

$('#validate-profile').addEventListener('click', () => {
  const { errors } = parseEditor();
  $('#profile-errors').textContent = errors.length ? errors.join('\n') : '✓ Perfil válido';
});
$('#save-profile').addEventListener('click', async () => {
  const { profile, errors } = parseEditor();
  $('#profile-errors').textContent = errors.join('\n');
  if (!profile || errors.length) return;
  const custom = [...settings.profiles.custom.filter((c) => c.id !== profile.id), profile];
  await persist({ ...settings, profiles: { ...settings.profiles, custom } }, `Perfil "${profile.name}" salvo`);
  if (!(await hasPermission(profile))) {
    $('#profile-errors').textContent = 'Perfil salvo. Clique em "Conceder permissão" na lista para permitir o acesso ao domínio.';
  }
  void renderProfiles();
});
$('#export-profiles').addEventListener('click', () => {
  const all = effectiveProfiles({ builtins: BUILTIN_PROFILES, custom: settings.profiles.custom, disabled: [] });
  download('autoticket-perfis.json', JSON.stringify(all, null, 2));
});

// ───────────────────────────── logs ─────────────────────────────
let logCache: LogEntry[] = [];

async function renderLogs(): Promise<void> {
  logCache = await ask<LogEntry[]>({ type: 'ui/logs' });
  const level = ($('#log-level') as HTMLSelectElement).value as LogLevel;
  const q = ($('#log-search') as HTMLInputElement).value.toLowerCase();
  const items = filterLogs(logCache, level).filter((e) => !q || e.msg.toLowerCase().includes(q));
  $('#log-list').replaceChildren(...items.slice(-1000).reverse().map(logLine));
}
$('#log-level').addEventListener('change', () => void renderLogs());
$('#log-search').addEventListener('input', () => void renderLogs());
$('#export-logs').addEventListener('click', () => download(`autoticket-logs-${Date.now()}.json`, JSON.stringify(logCache, null, 2)));
$('#clear-logs').addEventListener('click', async () => {
  if (!confirm('Apagar todos os logs?')) return;
  await ask({ type: 'ui/clear-logs' });
  void renderLogs();
});

// ───────────────────────────── diagnóstico ─────────────────────────────
async function renderDiag(): Promise<void> {
  const s = await ask<StatusResponse>({ type: 'ui/status' });
  const m = s.summary;
  const rows: Array<[string, string]> = [
    ['Fase', `${PHASE_LABEL[s.run.phase]} (${s.run.phase})`],
    ['Tempo total', formatDuration(m.totalMs)],
    ['Tempo até a 1ª ação', m.timeToFirstActionMs !== undefined ? formatDuration(m.timeToFirstActionMs) : '—'],
    ['Espera média por elemento', `${m.avgElementWaitMs} ms (máx. ${m.maxElementWaitMs} ms)`],
    ['Retries', String(s.run.retries)],
    ['Erros', String(s.run.errorCount)],
    ...Object.entries(m.timeInPhase).map(([k, v]) => [`Tempo em ${k}`, formatDuration(v ?? 0)] as [string, string]),
    ...Object.entries(m.counters).map(([k, v]) => [`Contador: ${k}`, String(v)] as [string, string]),
  ];
  $('#metrics').replaceChildren(...rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))));
  const ledger = Object.entries(s.run.ledger);
  $('#ledger').replaceChildren(
    h('tr', {}, h('th', {}, 'Ação'), h('th', {}, 'Status'), h('th', {}, 'Quando'), h('th', {}, 'Nota')),
    ...ledger.map(([k, e]) => h('tr', {}, h('td', {}, k), h('td', {}, e.status), h('td', {}, clockTime(e.at)), h('td', {}, e.note ?? e.url ?? ''))),
  );
  $('#raw').textContent = JSON.stringify(s.run, null, 2);
}
$('#diag-refresh').addEventListener('click', () => void renderDiag());
$('#diag-reset').addEventListener('click', async () => {
  if (!confirm('Redefinir o estado da execução?')) return;
  await ask({ type: 'ui/reset' });
  void renderDiag();
});

// ───────────────────────────── inicialização ─────────────────────────────
onStorageChange([STORAGE_KEYS.settings], async () => {
  settings = await loadSettings(area);
});
onStorageChange([STORAGE_KEYS.logs], () => {
  if (!$('#tab-logs').hidden) void renderLogs();
}, 800);
onStorageChange([STORAGE_KEYS.run], () => {
  if (!$('#tab-diag').hidden) void renderDiag();
}, 800);

void loadSettings(area).then((s) => {
  settings = s;
  fillForm(s);
});
