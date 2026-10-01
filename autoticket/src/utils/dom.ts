import { AbortedError, BotError } from '../core/errors';
import type { ErrorCode } from '../core/errors';

/** Utilitários de DOM sem dependências (substituem jQuery do código legado). */

export function isElementVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const html = el as HTMLElement;
  if (html.hidden) return false;
  const view = el.ownerDocument.defaultView;
  if (view) {
    const style = view.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (style.opacity === '0') return false;
  }
  // jsdom não calcula layout; em navegador real getClientRects() vazio = sem caixa renderizada.
  if (typeof html.getClientRects === 'function' && isRealLayout(el.ownerDocument)) {
    return html.getClientRects().length > 0;
  }
  // Ancestral oculto
  let parent = el.parentElement;
  while (parent) {
    if (parent.hidden) return false;
    if (view) {
      const st = view.getComputedStyle(parent);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    parent = parent.parentElement;
  }
  return true;
}

let layoutProbe: WeakMap<Document, boolean> | undefined;
function isRealLayout(doc: Document): boolean {
  layoutProbe ??= new WeakMap();
  const cached = layoutProbe.get(doc);
  if (cached !== undefined) return cached;
  const real = !/jsdom/i.test(doc.defaultView?.navigator?.userAgent ?? '');
  layoutProbe.set(doc, real);
  return real;
}

export function isElementEnabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest('fieldset[disabled]')) return false;
  const cls = el.getAttribute('class') ?? '';
  return !/(^|\s)(disabled|is-disabled|btn-disabled)(\s|$)/i.test(cls);
}

export function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const html = el as HTMLElement;
  // innerText respeita visibilidade; jsdom não implementa → textContent.
  const t = typeof html.innerText === 'string' && html.innerText !== '' ? html.innerText : el.textContent;
  return t ?? '';
}

export function safeQueryAll(root: ParentNode, css: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(css));
  } catch {
    return [];
  }
}

export interface WaitOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  /** Código de erro em caso de timeout. */
  code?: ErrorCode;
  description?: string;
  root?: Node;
}

/**
 * Espera uma condição usando MutationObserver (sem polling). A condição é
 * reavaliada somente quando o DOM muda, com timeout obrigatório.
 */
export function waitForCondition<T>(check: () => T | null | undefined | false, options: WaitOptions): Promise<T> {
  const doc = (options.root?.ownerDocument ?? (options.root as Document | undefined)) || document;
  const root = options.root ?? doc.documentElement;
  return new Promise<T>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const first = check();
    if (first) {
      resolve(first);
      return;
    }
    let scheduled = false;
    const finish = (fn: () => void) => {
      observer.disconnect();
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const evaluate = () => {
      scheduled = false;
      let value: T | null | undefined | false;
      try {
        value = check();
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      if (value) finish(() => resolve(value as T));
    };
    const observer = new MutationObserver(() => {
      // Coalesce rajadas de mutações num único check por microtarefa.
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(evaluate);
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new BotError(options.code ?? 'ELEMENT_TIMEOUT', `Tempo esgotado aguardando ${options.description ?? 'elemento'}`, {
            timeoutMs: options.timeoutMs,
          }),
        ),
      );
    }, options.timeoutMs);
    const onAbort = () => finish(() => reject(new AbortedError()));
    options.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Destaque visual temporário (modo simulação / teste de seletores). */
export function highlight(el: Element, label: string, color = '#f59e0b'): () => void {
  const html = el as HTMLElement;
  const prevOutline = html.style.outline;
  const prevOffset = html.style.outlineOffset;
  html.style.outline = `3px solid ${color}`;
  html.style.outlineOffset = '2px';
  html.setAttribute('data-autoticket-highlight', label);
  return () => {
    html.style.outline = prevOutline;
    html.style.outlineOffset = prevOffset;
    html.removeAttribute('data-autoticket-highlight');
  };
}
