import type { Scheduler } from '../core/scheduler';
import { isElementVisible, safeQueryAll, textOf } from '../utils/dom';
import { containsAny } from '../utils/text';
import { resolveClickable, resolveFirst } from './selectors';
import type { Sel } from './types';

/**
 * Ações de baixo nível sobre a página. Somente interações que um usuário faria
 * pela interface (clique, escolha de quantidade). Nada de requisições diretas
 * a APIs internas do site.
 */

export function clickElement(el: Element): void {
  const html = el as HTMLElement;
  try {
    html.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  } catch {
    /* jsdom/elementos sem layout */
  }
  html.focus?.({ preventScroll: true });
  if (typeof html.click === 'function') html.click();
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Define valor de input/select do jeito que frameworks (React/Angular/Vue) percebem. */
export function setFieldValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function readNumber(el: Element | null): number | null {
  if (!el) return null;
  const raw = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : textOf(el);
  const n = parseInt(String(raw).replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Maior quantidade permitida por um select (opções) ou input (atributo max). */
export function maxAllowed(el: HTMLInputElement | HTMLSelectElement): number {
  if (el instanceof HTMLSelectElement) {
    const values = Array.from(el.options)
      .filter((o) => !o.disabled)
      .map((o) => parseInt(o.value, 10))
      .filter((n) => Number.isFinite(n));
    return values.length ? Math.max(...values) : 0;
  }
  const max = parseInt(el.max, 10);
  return Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
}

export interface QuantityResult {
  ok: boolean;
  applied: number;
  /** Limite do site foi menor que o pedido. */
  capped: boolean;
  method: 'input' | 'select' | 'increment' | 'none';
}

/**
 * Ajusta a quantidade respeitando o limite exibido pelo site (nunca tenta exceder).
 */
export async function setQuantity(
  scope: ParentNode,
  desired: number,
  sels: { input?: Sel[]; increment?: Sel[] },
  scheduler: Scheduler,
): Promise<QuantityResult> {
  const field = resolveFirst(scope, sels.input).element as HTMLInputElement | HTMLSelectElement | null;
  if (field && (field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
    const limit = maxAllowed(field);
    const target = Math.max(1, Math.min(desired, limit || desired));
    if (field instanceof HTMLSelectElement) {
      const option = Array.from(field.options).find((o) => parseInt(o.value, 10) === target);
      if (!option) return { ok: false, applied: 0, capped: false, method: 'select' };
      setFieldValue(field, option.value);
    } else {
      setFieldValue(field, String(target));
    }
    return { ok: true, applied: target, capped: target < desired, method: field instanceof HTMLSelectElement ? 'select' : 'input' };
  }

  if (sels.increment) {
    const display = scope.querySelector('input[type="number"], input[type="text"], .quantity, .qty, [class*="quantity"]');
    let current = readNumber(display) ?? 0;
    let clicks = 0;
    while (current < desired && clicks < desired) {
      const { element, disabled } = resolveClickable(scope, sels.increment);
      if (!element || disabled) break;
      clickElement(element);
      clicks++;
      await scheduler.sleep(150);
      const after = readNumber(display);
      current = after ?? current + 1;
    }
    return { ok: current > 0, applied: current, capped: current < desired, method: 'increment' };
  }
  return { ok: false, applied: 0, capped: false, method: 'none' };
}

/** Elementos de diálogo/alerta onde mensagens de resultado costumam aparecer. */
const FEEDBACK_CSS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="alert"]',
  '.modal.show',
  '.modal.in',
  'md-dialog',
  '.md-toast-text',
  '.toast',
  '.alert',
  '.alert-error',
  '.alert-danger',
  '.dialog-show-error',
  '.swal2-popup',
  '.error-form',
].join(',');

/** Texto de mensagens de feedback visíveis (para detectar falha da ação crítica). */
export function feedbackText(doc: Document): string {
  return safeQueryAll(doc, FEEDBACK_CSS)
    .filter((el) => isElementVisible(el))
    .map((el) => textOf(el))
    .join(' \n ')
    .slice(0, 5_000);
}

export function feedbackHas(doc: Document, needles: readonly string[] | undefined): boolean {
  return !!needles && needles.length > 0 && containsAny(feedbackText(doc), needles);
}
