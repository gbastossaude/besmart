import { emptyMetrics } from '../core/metrics';
import { initialRunState } from '../core/state';
import type { RunState } from '../core/types';
import { PHASES } from '../core/types';
import type { KeyValueArea } from './area';
import { STORAGE_KEYS } from './area';

/**
 * Persistência do ESTADO de execução com cache em memória e escrita adiada
 * (coalescida). Mudanças de fase são gravadas imediatamente; atualizações
 * frequentes (heartbeat, métricas) são agrupadas para poupar disco/CPU.
 */
export class RunStore {
  private cache: RunState | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly area: KeyValueArea,
    private readonly now: () => number = Date.now,
    private readonly flushDelayMs = 1000,
  ) {}

  async get(): Promise<RunState> {
    if (this.cache) return this.cache;
    const raw = await this.area.get<RunState>(STORAGE_KEYS.run);
    this.cache = sanitizeRunState(raw, this.now());
    return this.cache;
  }

  /** Atualiza o cache; `immediate` grava já (mudança de fase, ledger). */
  async put(state: RunState, immediate: boolean): Promise<void> {
    this.cache = state;
    if (immediate) {
      await this.flush();
      return;
    }
    this.flushTimer ??= setTimeout(() => {
      void this.flush();
    }, this.flushDelayMs);
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.cache) await this.area.set({ [STORAGE_KEYS.run]: this.cache });
  }

  /** Descarta o cache (ex.: alteração externa). */
  invalidate(): void {
    this.cache = null;
  }
}

/** Valida dados lidos do storage; estado corrompido volta para IDLE em vez de quebrar. */
export function sanitizeRunState(raw: unknown, now: number): RunState {
  const r = raw as Partial<RunState> | undefined;
  if (!r || typeof r !== 'object' || !PHASES.includes(r.phase as RunState['phase'])) return initialRunState(now);
  return {
    ...initialRunState(now),
    ...r,
    attempts: Number(r.attempts) || 0,
    retries: Number(r.retries) || 0,
    errorCount: Number(r.errorCount) || 0,
    reloads: Array.isArray(r.reloads) ? r.reloads.filter((t) => typeof t === 'number') : [],
    ledger: r.ledger && typeof r.ledger === 'object' ? r.ledger : {},
    metrics: r.metrics && typeof r.metrics === 'object' ? { ...emptyMetrics(now), ...r.metrics } : emptyMetrics(now),
  } as RunState;
}
