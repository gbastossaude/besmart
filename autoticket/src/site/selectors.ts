import { isElementEnabled, isElementVisible, safeQueryAll, textOf } from '../utils/dom';
import { containsAny, firstMatchIndex } from '../utils/text';
import type { Sel } from './types';

/**
 * Resolução de seletores com fallback. Cada Sel combina CSS + texto opcional,
 * para não depender apenas de classes geradas ou posição no DOM.
 */

export interface Resolved {
  elements: Element[];
  /** Índice da estratégia que funcionou (0 = principal). -1 = nenhuma. */
  strategy: number;
}

export function matchesSel(el: Element, sel: Sel): boolean {
  if (sel.visible !== false && !isElementVisible(el)) return false;
  if (sel.text && sel.text.length > 0) {
    const source = sel.textIn ? el.querySelector(sel.textIn) : el;
    if (!containsAny(textOf(source), sel.text)) return false;
  }
  return true;
}

export function resolveAll(root: ParentNode, sels: readonly Sel[] | undefined): Resolved {
  if (!sels) return { elements: [], strategy: -1 };
  for (let i = 0; i < sels.length; i++) {
    const sel = sels[i];
    if (!sel) continue;
    const found = safeQueryAll(root, sel.css).filter((el) => matchesSel(el, sel));
    if (found.length > 0) return { elements: found, strategy: i };
  }
  return { elements: [], strategy: -1 };
}

export function resolveFirst(root: ParentNode, sels: readonly Sel[] | undefined): { element: Element | null; strategy: number } {
  const r = resolveAll(root, sels);
  return { element: r.elements[0] ?? null, strategy: r.strategy };
}

/** Primeiro elemento clicável (visível + habilitado). */
export function resolveClickable(root: ParentNode, sels: readonly Sel[] | undefined): { element: Element | null; strategy: number; disabled: boolean } {
  const r = resolveAll(root, sels);
  const enabled = r.elements.find(isElementEnabled) ?? null;
  return { element: enabled, strategy: r.strategy, disabled: r.elements.length > 0 && !enabled };
}

export function anyPresent(root: ParentNode, sels: readonly Sel[] | undefined): boolean {
  return resolveAll(root, sels).elements.length > 0;
}

export interface Candidate {
  element: Element;
  text: string;
  /** Posição na lista de preferências do usuário (menor = mais prioritário). */
  priority: number;
  soldOut: boolean;
}

/**
 * Lista candidatos (setores/categorias/eventos) que casam com as preferências,
 * ordenados por prioridade. Itens esgotados/desabilitados são marcados.
 */
export function rankCandidates(
  items: Element[],
  preferences: readonly string[],
  opts: { textIn?: string; soldOutTexts: readonly string[] },
): Candidate[] {
  const prefs = preferences.length > 0 ? preferences : ['*'];
  const out: Candidate[] = [];
  for (const element of items) {
    const source = opts.textIn ? element.querySelector(opts.textIn) : element;
    const text = textOf(source ?? element).trim();
    const priority = firstMatchIndex(text, prefs);
    if (priority < 0) continue;
    const soldOut = !isElementEnabled(element) || containsAny(textOf(element), opts.soldOutTexts);
    out.push({ element, text, priority, soldOut });
  }
  // sort estável: mantém a ordem do DOM entre itens de mesma prioridade
  return out.sort((a, b) => a.priority - b.priority);
}
