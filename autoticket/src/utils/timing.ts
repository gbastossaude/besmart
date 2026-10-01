import { AbortedError, BotError } from '../core/errors';
import type { ErrorCode } from '../core/errors';

/** sleep cancelável por AbortSignal. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(handle);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Aplica timeout a uma promise. Nenhuma operação importante espera para sempre. */
export function withTimeout<T>(promise: Promise<T>, ms: number, code: ErrorCode, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new BotError(code, message, { timeoutMs: ms })), ms);
    promise.then(
      (v) => {
        clearTimeout(handle);
        resolve(v);
      },
      (e) => {
        clearTimeout(handle);
        reject(e);
      },
    );
  });
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number, now: () => number = Date.now): (...args: A) => void {
  let last = -Infinity;
  return (...args: A) => {
    const t = now();
    if (t - last >= ms) {
      last = t;
      fn(...args);
    }
  };
}
