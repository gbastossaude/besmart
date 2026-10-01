import { formatDuration } from '../../core/metrics';
import type { LogEntry } from '../../core/types';
import { isActivePhase } from '../../core/types';
import { displayUrl } from '../../utils/url';
import type { CheckItem, SelectorReport, StartResponse, StatusResponse } from '../shared/messages';
import { $, PHASE_LABEL, STATUS_CLASS, ask, clockTime, h, logLine, onStorageChange, timeAgo } from '../shared/ui';

let last: StatusResponse | null = null;

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function setText(sel: string, text: string): void {
  $(sel).textContent = text;
}

function render(s: StatusResponse): void {
  last = s;
  const { run } = s;
  const pill = $('#pill');
  pill.className = `pill ${STATUS_CLASS[s.display]}`;
  pill.textContent = s.display;
  setText('#phase', PHASE_LABEL[run.phase]);
  setText('#profile', s.profileName ? `· ${s.profileName}` : '');
  setText('#reason', run.reason ?? '');

  const active = isActivePhase(run.phase);
  ($('#start') as HTMLButtonElement).disabled = active;
  ($('#pause') as HTMLButtonElement).disabled = !active;
  ($('#resume') as HTMLButtonElement).disabled = !(run.phase === 'PAUSED' || run.phase === 'ERROR' || run.phase === 'TIMEOUT');
  ($('#stop') as HTMLButtonElement).disabled = run.phase === 'IDLE' || run.phase === 'STOPPED';
  renderClock();

  setText('#d-phase', `${run.phase}${run.previousPhase ? ` (antes: ${run.previousPhase})` : ''}`);
  setText('#d-action', run.lastAction ? `${run.lastAction} (${clockTime(run.lastActionAt)})` : '—');
  setText('#d-retries', `${run.attempts} consecutivas / ${run.retries} no total · erros: ${run.errorCount}`);
  setText('#d-reloads', String(run.reloads.filter((t) => s.now - t < 3600_000).length));
  setText('#d-error', run.lastError ? `[${run.lastError.kind}] ${run.lastError.code}: ${run.lastError.message} (${clockTime(run.lastError.at)})` : '—');
  setText('#d-page', run.page ? `${run.page.kind} · ${displayUrl(run.page.url)}` : '—');
}

/** Atualiza só os campos de tempo (1×/s enquanto o popup está aberto). */
function renderClock(): void {
  if (!last) return;
  const now = Date.now();
  const { run } = last;
  const end = isActivePhase(run.phase) || run.phase === 'PAUSED' ? now : (run.endedAt ?? now);
  setText('#d-elapsed', run.startedAt ? formatDuration(end - run.startedAt) : '—');
  setText('#d-activity', timeAgo(run.lastHeartbeatAt ?? run.updatedAt, now));
  const next = last.nextRefreshAt;
  setText('#d-refresh', next ? (next > now ? `em ${formatDuration(next - now)}` : 'agora') : '—');
}

async function refresh(): Promise<void> {
  render(await ask<StatusResponse>({ type: 'ui/status' }));
  const logs = await ask<LogEntry[]>({ type: 'ui/logs' });
  const box = $('#logs');
  box.replaceChildren(...logs.slice(-25).reverse().map(logLine));
}

function showChecks(checks: CheckItem[], message = ''): void {
  $('#checks-box').hidden = false;
  $('#checks').replaceChildren(...checks.map((c) => h('li', { class: c.ok ? 'ok' : 'fail' }, c.label, c.detail ? h('small', {}, ` — ${c.detail}`) : null)));
  setText('#start-msg', message);
}

function bind(id: string, fn: () => Promise<unknown>): void {
  $(id).addEventListener('click', async () => {
    const btn = $(id) as HTMLButtonElement;
    btn.disabled = true;
    try {
      await fn();
    } finally {
      await refresh();
    }
  });
}

bind('#start', async () => {
  const tabId = await activeTabId();
  if (tabId === null) return;
  const r = await ask<StartResponse>({ type: 'ui/start', tabId });
  showChecks(r.checks, r.message);
});
bind('#pause', () => ask({ type: 'ui/pause' }));
bind('#resume', () => ask({ type: 'ui/resume' }));
bind('#stop', () => ask({ type: 'ui/stop' }));
bind('#emergency', () => ask({ type: 'ui/emergency' }));
bind('#reset', async () => {
  if (confirm('Redefinir o estado? A execução atual será encerrada e o histórico de ações apagado.')) await ask({ type: 'ui/reset' });
});
bind('#check', async () => {
  const tabId = await activeTabId();
  if (tabId !== null) showChecks(await ask<CheckItem[]>({ type: 'ui/check', tabId }));
});
bind('#test', async () => {
  const tabId = await activeTabId();
  if (tabId === null) return;
  const r = await ask<SelectorReport | { error: string }>({ type: 'ui/test-selectors', tabId });
  const out = $('#test-out');
  $('#test-box').hidden = false;
  if ('error' in r) {
    out.replaceChildren(h('div', { class: 'errors' }, r.error));
    return;
  }
  out.replaceChildren(
    h('div', {}, `Página: `, h('strong', {}, r.pageKind), h('small', {}, ` (${r.signal})`)),
    h(
      'table',
      {},
      h('tr', {}, h('th', {}, 'Passo'), h('th', {}, 'Achados'), h('th', {}, 'Seletor')),
      ...r.steps.map((s) =>
        h(
          'tr',
          {},
          h('td', {}, s.label, s.candidates?.length ? h('div', {}, h('small', {}, s.candidates.join(' · '))) : null),
          h('td', {}, String(s.found)),
          h('td', {}, s.strategy < 0 ? '✗ nenhum' : s.strategy === 0 ? 'principal' : `fallback ${s.strategy}`),
        ),
      ),
    ),
  );
});
$('#options').addEventListener('click', () => void chrome.runtime.openOptionsPage());

onStorageChange(['run', 'logs'], () => void refresh());
void refresh();
// Relógio local apenas enquanto o popup está aberto (fecha junto com ele).
(function tick() {
  renderClock();
  setTimeout(tick, 1000);
})();
