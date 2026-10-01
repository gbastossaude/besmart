import type { ErrorInfo, ErrorKind, Phase } from './types';

/**
 * Sistema de falhas: toda falha vira um BotError classificado
 * (transitória, recuperável, permanente, configuração, ambiente) e a política
 * de recuperação decide entre retry com backoff, pausa ou erro definitivo.
 */

export const ERROR_CODES = {
  ELEMENT_TIMEOUT: 'transient',
  NAVIGATION_TIMEOUT: 'transient',
  PAGE_LOAD_TIMEOUT: 'transient',
  SERVER_ERROR_PAGE: 'transient',
  NETWORK: 'transient',
  STEP_FAILED: 'recoverable',
  SOLD_OUT: 'recoverable',
  ACTION_REJECTED: 'recoverable',
  ACTION_UNCONFIRMED: 'recoverable',
  UNEXPECTED_PAGE: 'recoverable',
  SELECTION_EXHAUSTED: 'recoverable',
  BLOCKED: 'permanent',
  RELOAD_LIMIT: 'permanent',
  CONFIG_INVALID: 'config',
  PROFILE_MISSING: 'config',
  PERMISSION_MISSING: 'config',
  TAB_GONE: 'environment',
  CONTEXT_INVALIDATED: 'environment',
  CONTENT_UNREACHABLE: 'environment',
  BROWSER_RESTARTED: 'environment',
  UNKNOWN: 'recoverable',
  ABORTED: 'environment',
} as const satisfies Record<string, ErrorKind>;

export type ErrorCode = keyof typeof ERROR_CODES;

export class BotError extends Error {
  readonly code: ErrorCode;
  readonly kind: ErrorKind;
  readonly context: Record<string, string | number | boolean | null>;

  constructor(code: ErrorCode, message: string, context: Record<string, string | number | boolean | null> = {}) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.kind = ERROR_CODES[code];
    this.context = context;
  }

  toInfo(now: number, phase?: Phase): ErrorInfo {
    return { kind: this.kind, code: this.code, message: this.message, at: now, phase, context: this.context };
  }
}

export class AbortedError extends BotError {
  constructor(message = 'Operação cancelada') {
    super('ABORTED', message);
    this.name = 'AbortedError';
  }
}

export function isAbort(err: unknown): boolean {
  if (err instanceof AbortedError) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/** Converte qualquer erro lançado em BotError classificado. */
export function classify(err: unknown): BotError {
  if (err instanceof BotError) return err;
  if (isAbort(err)) return new AbortedError();
  const message = err instanceof Error ? err.message : String(err);
  if (/Extension context invalidated|Receiving end does not exist/i.test(message)) {
    return new BotError('CONTEXT_INVALIDATED', message);
  }
  if (/No tab with id/i.test(message)) return new BotError('TAB_GONE', message);
  if (/Failed to fetch|NetworkError|net::ERR_/i.test(message)) return new BotError('NETWORK', message);
  return new BotError('UNKNOWN', message);
}

export interface RecoveryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
}

export type RecoveryDecision =
  | { action: 'retry'; delayMs: number; attempt: number }
  | { action: 'pause'; reason: string }
  | { action: 'fail'; reason: string };

/**
 * Decide o que fazer após uma falha.
 *  - transitória: retry com backoff até `maxAttempts`, depois pausa;
 *  - recuperável: no máximo metade das tentativas (mín. 1), depois pausa;
 *  - permanente / configuração / ambiente: pausa imediatamente (usuário decide).
 */
export function decideRecovery(
  error: BotError,
  attempt: number,
  policy: RecoveryPolicy,
  random: () => number = Math.random,
): RecoveryDecision {
  const label = `${error.code}: ${error.message}`;
  switch (error.kind) {
    case 'transient': {
      if (attempt >= policy.maxAttempts) return { action: 'pause', reason: `Limite de tentativas atingido (${label})` };
      return { action: 'retry', delayMs: backoffDelay(attempt, policy, random), attempt: attempt + 1 };
    }
    case 'recoverable': {
      const limit = Math.max(1, Math.floor(policy.maxAttempts / 2));
      if (attempt >= limit) return { action: 'pause', reason: `Não foi possível recuperar (${label})` };
      return { action: 'retry', delayMs: backoffDelay(attempt, policy, random), attempt: attempt + 1 };
    }
    case 'config':
      return { action: 'pause', reason: `Configuração: ${error.message}` };
    case 'environment':
      return { action: 'pause', reason: `Ambiente: ${error.message}` };
    case 'permanent':
      return { action: 'fail', reason: label };
  }
}

/** Backoff exponencial com jitter parcial (±20%), limitado a `maxDelayMs`. */
export function backoffDelay(attempt: number, policy: Pick<RecoveryPolicy, 'baseDelayMs' | 'maxDelayMs' | 'factor'>, random: () => number = Math.random): number {
  const raw = policy.baseDelayMs * Math.pow(policy.factor, Math.max(0, attempt));
  const capped = Math.min(policy.maxDelayMs, raw);
  const jitter = 0.8 + random() * 0.4;
  return Math.round(Math.min(policy.maxDelayMs, capped * jitter));
}
