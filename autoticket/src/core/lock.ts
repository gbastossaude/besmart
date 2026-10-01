import type { ActionStatus, LedgerEntry } from './types';

/**
 * Mutex baseado em cadeia de promises: serializa operações de leitura-modificação-escrita
 * do estado no service worker, eliminando condições de corrida entre mensagens simultâneas.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/**
 * Livro-razão de ações críticas (idempotência).
 * - `pending`: ação executada, resultado ainda não confirmado → NÃO repetir.
 * - `confirmed`: ação concluída → NÃO repetir.
 * - `failed`: ação comprovadamente falhou → pode tentar de novo (nova chave de tentativa).
 */
export type ClaimResult = { granted: true } | { granted: false; status: ActionStatus; at: number };

export function claimAction(
  ledger: Record<string, LedgerEntry>,
  key: string,
  now: number,
  url?: string,
): { ledger: Record<string, LedgerEntry>; result: ClaimResult } {
  const existing = ledger[key];
  if (existing && existing.status !== 'failed') {
    return { ledger, result: { granted: false, status: existing.status, at: existing.at } };
  }
  return { ledger: { ...ledger, [key]: { status: 'pending', at: now, url } }, result: { granted: true } };
}

export function resolveAction(
  ledger: Record<string, LedgerEntry>,
  key: string,
  status: Exclude<ActionStatus, 'pending'>,
  now: number,
  note?: string,
): Record<string, LedgerEntry> {
  const existing = ledger[key];
  if (!existing) return ledger;
  return { ...ledger, [key]: { ...existing, status, at: now, note } };
}

export function pendingActions(ledger: Record<string, LedgerEntry>): string[] {
  return Object.entries(ledger)
    .filter(([, e]) => e.status === 'pending')
    .map(([k]) => k);
}

/** Mantém o ledger pequeno: remove as entradas mais antigas além do limite. */
export function pruneLedger(ledger: Record<string, LedgerEntry>, max = 100): Record<string, LedgerEntry> {
  const entries = Object.entries(ledger);
  if (entries.length <= max) return ledger;
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, max));
}
