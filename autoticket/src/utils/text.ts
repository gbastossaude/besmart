/** Normalização de texto para comparações robustas (acentos, caixa, espaços). */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verdadeiro se `haystack` contém algum dos termos (normalizados). Lista vazia → falso. */
export function containsAny(haystack: string, needles: readonly string[]): boolean {
  const h = normalizeText(haystack);
  if (!h) return false;
  return needles.some((n) => {
    const nn = normalizeText(n);
    return nn.length > 0 && h.includes(nn);
  });
}

/** Índice do primeiro termo encontrado (prioridade), ou -1. `*` casa com qualquer texto. */
export function firstMatchIndex(haystack: string, needles: readonly string[]): number {
  const h = normalizeText(haystack);
  for (let i = 0; i < needles.length; i++) {
    const n = normalizeText(needles[i]);
    if (n === '*') return i;
    if (n && h.includes(n)) return i;
  }
  return -1;
}

/** Divide texto de configuração (uma entrada por linha ou separada por vírgula). */
export function splitList(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
