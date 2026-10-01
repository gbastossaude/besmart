import type { Phase, PhaseMetrics } from './types';

/** Funções puras para métricas internas (tempo por etapa, contadores, esperas). */

export function emptyMetrics(now: number): PhaseMetrics {
  return {
    timeInPhase: {},
    enteredPhaseAt: now,
    counters: {},
    elementWaitMsTotal: 0,
    elementWaitCount: 0,
    elementWaitMsMax: 0,
  };
}

/** Acumula o tempo da fase que está terminando e marca a entrada na nova. */
export function recordPhaseChange(m: PhaseMetrics, leaving: Phase, now: number): PhaseMetrics {
  const spent = Math.max(0, now - m.enteredPhaseAt);
  return {
    ...m,
    timeInPhase: { ...m.timeInPhase, [leaving]: (m.timeInPhase[leaving] ?? 0) + spent },
    enteredPhaseAt: now,
  };
}

export function increment(m: PhaseMetrics, counter: string, by = 1): PhaseMetrics {
  return { ...m, counters: { ...m.counters, [counter]: (m.counters[counter] ?? 0) + by } };
}

export function recordElementWait(m: PhaseMetrics, ms: number): PhaseMetrics {
  return {
    ...m,
    elementWaitMsTotal: m.elementWaitMsTotal + ms,
    elementWaitCount: m.elementWaitCount + 1,
    elementWaitMsMax: Math.max(m.elementWaitMsMax, ms),
  };
}

export interface MetricsSummary {
  totalMs: number;
  timeInPhase: Partial<Record<Phase, number>>;
  avgElementWaitMs: number;
  maxElementWaitMs: number;
  counters: Record<string, number>;
  timeToFirstActionMs?: number;
}

export function summarize(m: PhaseMetrics, currentPhase: Phase, startedAt: number | undefined, now: number): MetricsSummary {
  const timeInPhase = { ...m.timeInPhase };
  timeInPhase[currentPhase] = (timeInPhase[currentPhase] ?? 0) + Math.max(0, now - m.enteredPhaseAt);
  return {
    totalMs: startedAt ? Math.max(0, now - startedAt) : 0,
    timeInPhase,
    avgElementWaitMs: m.elementWaitCount ? Math.round(m.elementWaitMsTotal / m.elementWaitCount) : 0,
    maxElementWaitMs: m.elementWaitMsMax,
    counters: { ...m.counters },
    timeToFirstActionMs: m.timeToFirstActionMs,
  };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(min).padStart(2, '0')}m`;
  if (min > 0) return `${min}m ${String(sec).padStart(2, '0')}s`;
  if (s > 0) return `${sec}s`;
  return `${ms}ms`;
}
