/**
 * Regras de URL dos perfis: texto simples (substring, sem diferenciar caixa) ou
 * expressão regular no formato `re:<padrão>`.
 */
export function matchUrlRule(url: string, rule: string): boolean {
  if (!rule) return false;
  if (rule.startsWith('re:')) {
    try {
      return new RegExp(rule.slice(3), 'i').test(url);
    } catch {
      return false;
    }
  }
  return url.toLowerCase().includes(rule.toLowerCase());
}

export function matchesAnyUrlRule(url: string, rules: readonly string[] | undefined): boolean {
  return !!rules && rules.some((r) => matchUrlRule(url, r));
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** `ingressos.flamengo.com.br` casa com host `flamengo.com.br` (sufixo de domínio). */
export function hostMatches(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  const p = pattern.toLowerCase().replace(/^\*\./, '').replace(/^www\./, '');
  return h === p || h.endsWith(`.${p}`);
}

/** Converte host de perfil em match pattern de permissão do Chrome ("*.x" também casa com "x"). */
export function hostToMatchPatterns(host: string): string[] {
  const p = host.toLowerCase().replace(/^\*\./, '').replace(/^www\./, '');
  return [`https://*.${p}/*`];
}

export function isValidRegexRule(rule: string): boolean {
  if (!rule.startsWith('re:')) return true;
  try {
    new RegExp(rule.slice(3));
    return true;
  } catch {
    return false;
  }
}

/** Remove query string e hash sensíveis para exibição/log. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}${u.hash.startsWith('#!') ? u.hash : ''}`;
  } catch {
    return url;
  }
}
