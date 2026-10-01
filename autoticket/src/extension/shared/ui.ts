import { formatDuration } from '../../core/metrics';
import type { DisplayStatus, LogEntry, Phase } from '../../core/types';
import type { UiMessage } from './messages';

/** Helpers compartilhados entre popup e opções (sem framework). */

export async function ask<T>(msg: UiMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(msg)) as T;
}

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | number | ((ev: Event) => void) | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Elemento ausente: ${sel}`);
  return el;
}

export const STATUS_CLASS: Record<DisplayStatus, string> = {
  PARADO: 'st-stopped',
  EXECUTANDO: 'st-running',
  AGUARDANDO: 'st-waiting',
  PROCESSANDO: 'st-processing',
  PAUSADO: 'st-paused',
  FINALIZADO: 'st-done',
  ERRO: 'st-error',
};

export const PHASE_LABEL: Record<Phase, string> = {
  IDLE: 'Ocioso',
  INITIALIZING: 'Inicializando',
  WAITING_PAGE: 'Aguardando página',
  DETECTING_EVENT: 'Procurando evento',
  WAITING_AVAILABILITY: 'Aguardando disponibilidade',
  SELECTING: 'Selecionando ingressos',
  CART: 'No carrinho',
  CHECKOUT: 'Checkout',
  COMPLETED: 'Concluído',
  WAITING_USER: 'Aguardando você',
  RETRYING: 'Recuperando',
  TIMEOUT: 'Tempo esgotado',
  ERROR: 'Erro',
  PAUSED: 'Pausado',
  STOPPED: 'Parado',
};

export function timeAgo(t: number | undefined, now: number): string {
  if (!t) return '—';
  const diff = now - t;
  if (diff < 1500) return 'agora';
  return `há ${formatDuration(diff)}`;
}

export function clockTime(t: number | undefined): string {
  return t ? new Date(t).toLocaleTimeString('pt-BR', { hour12: false }) : '—';
}

export function logLine(e: LogEntry): HTMLElement {
  return h(
    'div',
    { class: `log log-${e.level.toLowerCase()}`, title: e.ctx ? JSON.stringify(e.ctx) : undefined },
    h('span', { class: 'log-time' }, clockTime(e.t)),
    h('span', { class: 'log-level' }, e.level),
    h('span', { class: 'log-msg' }, e.msg),
  );
}

export function download(filename: string, content: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Recarrega a UI quando o estado/log mudar (debounced), sem polling. */
export function onStorageChange(keys: string[], fn: () => void, ms = 250): void {
  let t: ReturnType<typeof setTimeout> | null = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !keys.some((k) => k in changes)) return;
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  });
}
