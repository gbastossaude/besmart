/**
 * Tipos centrais do robô. Este arquivo não depende de nenhuma API do Chrome
 * nem do DOM, para que o núcleo possa ser testado isoladamente.
 */

export const PHASES = [
  'IDLE',
  'INITIALIZING',
  'WAITING_PAGE',
  'DETECTING_EVENT',
  'WAITING_AVAILABILITY',
  'SELECTING',
  'CART',
  'CHECKOUT',
  'COMPLETED',
  'WAITING_USER',
  'RETRYING',
  'TIMEOUT',
  'ERROR',
  'PAUSED',
  'STOPPED',
] as const;

export type Phase = (typeof PHASES)[number];

/** Fases em que o robô está ativo numa aba (content script trabalhando). */
export const ACTIVE_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'INITIALIZING',
  'WAITING_PAGE',
  'DETECTING_EVENT',
  'WAITING_AVAILABILITY',
  'SELECTING',
  'CART',
  'CHECKOUT',
  'WAITING_USER',
  'RETRYING',
]);

export function isActivePhase(phase: Phase): boolean {
  return ACTIVE_PHASES.has(phase);
}

/** Estado exibido ao usuário (agrupamento das fases internas). */
export type DisplayStatus =
  | 'PARADO'
  | 'EXECUTANDO'
  | 'AGUARDANDO'
  | 'PROCESSANDO'
  | 'PAUSADO'
  | 'FINALIZADO'
  | 'ERRO';

export function displayStatus(phase: Phase): DisplayStatus {
  switch (phase) {
    case 'IDLE':
    case 'STOPPED':
      return 'PARADO';
    case 'INITIALIZING':
    case 'DETECTING_EVENT':
    case 'SELECTING':
      return 'EXECUTANDO';
    case 'WAITING_PAGE':
    case 'WAITING_AVAILABILITY':
    case 'WAITING_USER':
    case 'RETRYING':
      return 'AGUARDANDO';
    case 'CART':
    case 'CHECKOUT':
      return 'PROCESSANDO';
    case 'PAUSED':
      return 'PAUSADO';
    case 'COMPLETED':
      return 'FINALIZADO';
    case 'ERROR':
    case 'TIMEOUT':
      return 'ERRO';
  }
}

/** Tipos de página que um adaptador de site sabe reconhecer. */
export const PAGE_KINDS = [
  'UNKNOWN',
  'EVENT_LIST',
  'EVENT',
  'CART',
  'CHECKOUT',
  'SUCCESS',
  'LOGIN',
  'QUEUE',
  'CHALLENGE',
  'BLOCKED',
  'ERROR_PAGE',
  'LOADING',
] as const;

export type PageKind = (typeof PAGE_KINDS)[number];

export type ErrorKind = 'transient' | 'recoverable' | 'permanent' | 'config' | 'environment';

export interface ErrorInfo {
  kind: ErrorKind;
  code: string;
  message: string;
  at: number;
  phase?: Phase;
  context?: Record<string, string | number | boolean | null>;
}

export type ActionStatus = 'pending' | 'confirmed' | 'failed';

export interface LedgerEntry {
  status: ActionStatus;
  at: number;
  /** URL da página onde a ação foi executada (diagnóstico). */
  url?: string;
  note?: string;
}

export interface PhaseMetrics {
  /** Tempo total (ms) gasto em cada fase. */
  timeInPhase: Partial<Record<Phase, number>>;
  enteredPhaseAt: number;
  counters: Record<string, number>;
  /** Soma e quantidade de esperas por elemento, para média. */
  elementWaitMsTotal: number;
  elementWaitCount: number;
  elementWaitMsMax: number;
  /** ms entre o clique em "Iniciar" e a primeira ação real na página. */
  timeToFirstActionMs?: number;
}

export interface RunState {
  /** Identificador único de execução. Muda a cada START. */
  runId: string;
  phase: Phase;
  /** Fase anterior (útil para retomar após PAUSED/ERROR). */
  previousPhase?: Phase;
  /** Motivo legível da fase atual ("Aguardando CAPTCHA ser resolvido", etc). */
  reason?: string;
  tabId?: number;
  profileId?: string;
  startedAt?: number;
  endedAt?: number;
  updatedAt: number;
  /** Último sinal de vida do content script. */
  lastHeartbeatAt?: number;
  lastAction?: string;
  lastActionAt?: number;
  page?: { url: string; kind: PageKind; at: number };
  attempts: number;
  retries: number;
  /** Timestamps dos reloads feitos pelo robô (janela deslizante de 1h). */
  reloads: number[];
  lastError?: ErrorInfo;
  errorCount: number;
  ledger: Record<string, LedgerEntry>;
  metrics: PhaseMetrics;
  /** Início agendado (epoch ms). */
  scheduledAt?: number;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  SUCCESS: 25,
  WARNING: 30,
  ERROR: 40,
};

export interface LogEntry {
  t: number;
  level: LogLevel;
  src: string;
  msg: string;
  ctx?: Record<string, unknown>;
}
