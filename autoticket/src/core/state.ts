import type { MachineEvent } from './machine';
import { transition } from './machine';
import { emptyMetrics, recordPhaseChange } from './metrics';
import type { ErrorInfo, PageKind, RunState } from './types';
import { isActivePhase } from './types';

/** Lógica pura do estado de execução (aplicada pelo background, testável sem Chrome). */

export function newRunId(now: number, random: () => number = Math.random): string {
  return `${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

export function initialRunState(now: number): RunState {
  return {
    runId: '',
    phase: 'IDLE',
    updatedAt: now,
    attempts: 0,
    retries: 0,
    reloads: [],
    errorCount: 0,
    ledger: {},
    metrics: emptyMetrics(now),
  };
}

export interface ApplyResult {
  state: RunState;
  ok: boolean;
  changed: boolean;
  error?: string;
}

function reasonOf(event: MachineEvent): string | undefined {
  return event.reason;
}

export function applyEvent(state: RunState, event: MachineEvent, now: number): ApplyResult {
  const result = transition(state.phase, event);
  if (!result.ok) return { state, ok: false, changed: false, error: result.error };
  if (!result.changed) {
    const reason = reasonOf(event);
    const next = reason !== undefined && reason !== state.reason ? { ...state, reason, updatedAt: now } : state;
    return { state: next, ok: true, changed: false };
  }
  let next: RunState = {
    ...state,
    previousPhase: state.phase,
    phase: result.phase,
    reason: reasonOf(event),
    updatedAt: now,
    metrics: recordPhaseChange(state.metrics, state.phase, now),
  };
  if (event.type === 'RETRY') next = { ...next, retries: next.retries + 1 };
  if (!isActivePhase(next.phase) && next.phase !== 'PAUSED') next = { ...next, endedAt: now };
  if (isActivePhase(next.phase)) next = { ...next, endedAt: undefined };
  return { state: next, ok: true, changed: true };
}

/** Cria o estado de uma nova execução (START). */
export function startRun(
  previous: RunState,
  params: { tabId: number; profileId: string; now: number; runId: string; scheduledAt?: number },
): ApplyResult {
  if (isActivePhase(previous.phase)) {
    return { state: previous, ok: false, changed: false, error: 'Já existe uma execução ativa' };
  }
  // START sempre cria uma execução nova a partir de IDLE (inclusive vindo de PAUSED,
  // por decisão explícita do usuário). O ledger antigo é descartado somente aqui.
  const res = applyEvent(initialRunState(params.now), { type: 'START' }, params.now);
  if (!res.ok) return res;
  return {
    ...res,
    state: {
      ...res.state,
      runId: params.runId,
      tabId: params.tabId,
      profileId: params.profileId,
      startedAt: params.now,
      scheduledAt: params.scheduledAt,
      reason: params.scheduledAt ? `Agendado para ${new Date(params.scheduledAt).toLocaleString('pt-BR')}` : 'Inicializando',
      metrics: emptyMetrics(params.now),
    },
  };
}

export function recordError(state: RunState, info: ErrorInfo): RunState {
  return { ...state, lastError: info, errorCount: state.errorCount + 1, updatedAt: info.at };
}

export function recordAction(state: RunState, action: string, now: number): RunState {
  const metrics =
    state.metrics.timeToFirstActionMs === undefined && state.startedAt
      ? { ...state.metrics, timeToFirstActionMs: now - (state.scheduledAt ?? state.startedAt) }
      : state.metrics;
  return { ...state, lastAction: action, lastActionAt: now, updatedAt: now, metrics };
}

export function recordPage(state: RunState, url: string, kind: PageKind, now: number): RunState {
  if (state.page && state.page.url === url && state.page.kind === kind) return state;
  return { ...state, page: { url, kind, at: now }, updatedAt: now };
}

/** Janela deslizante de reloads (1h). Retorna se o reload é permitido. */
export function tryReload(state: RunState, now: number, maxPerHour: number): { state: RunState; allowed: boolean } {
  const recent = state.reloads.filter((t) => now - t < 3600_000);
  if (recent.length >= maxPerHour) return { state: { ...state, reloads: recent }, allowed: false };
  return { state: { ...state, reloads: [...recent, now], updatedAt: now }, allowed: true };
}
