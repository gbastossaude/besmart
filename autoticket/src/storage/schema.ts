import type { SiteProfile, Step, Sel } from '../site/types';
import { isValidRegexRule } from '../utils/url';

/**
 * CONFIGURAÇÃO centralizada. Todos os valores ajustáveis (timeouts, limites,
 * intervalos) moram aqui — nada espalhado pelo código.
 */

export const SETTINGS_VERSION = 1;

export type RunMode = 'live' | 'dry-run';

export interface Settings {
  schemaVersion: number;
  target: {
    /** Palavras-chave para achar o evento na lista (ex.: "Flamengo x Vasco"). */
    eventKeywords: string[];
    /** URL direta do evento (opcional). Se definida, o robô navega para ela a partir da lista. */
    eventUrl: string;
    /** Setores em ordem de prioridade. Vazio ou "*" = qualquer setor disponível. */
    sectors: string[];
    /** Categorias/tipos de ingresso em ordem de prioridade (ex.: "Inteira"). */
    categories: string[];
    /** Quantidade desejada. O robô nunca excede o limite exibido pelo site. */
    quantity: number;
  };
  behavior: {
    mode: RunMode;
    /** Ao chegar no carrinho, clicar em "continuar para o checkout" (nunca paga). */
    autoProceedToCheckout: boolean;
    /** Intervalo entre recarregamentos enquanto aguarda disponibilidade (s). */
    refreshIntervalSec: number;
    /** Teto de recarregamentos por hora (proteção contra comportamento agressivo). */
    maxReloadsPerHour: number;
    /** Quantas opções (setor/categoria) tentar antes de pausar. */
    maxSelectionAttempts: number;
    /** Início agendado (ISO local, ex.: 2026-10-01T10:00). Vazio = imediato. */
    scheduledStart: string;
    notifications: boolean;
    sound: boolean;
    /** Minutos aguardando o usuário (CAPTCHA/fila/login) antes de pausar. 0 = sem limite. */
    userWaitLimitMin: number;
  };
  timeouts: {
    pageLoadMs: number;
    elementMs: number;
    selectionMs: number;
    cartConfirmMs: number;
    checkoutMs: number;
    /** Sem sinal de vida da aba por este tempo → watchdog verifica. */
    heartbeatStaleMs: number;
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    factor: number;
  };
  logging: {
    debug: boolean;
    maxEntries: number;
  };
  profiles: {
    /** IDs de perfis embutidos desativados. */
    disabled: string[];
    /** Perfis personalizados (substituem embutidos de mesmo id). */
    custom: SiteProfile[];
  };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_VERSION,
  target: { eventKeywords: [], eventUrl: '', sectors: [], categories: [], quantity: 1 },
  behavior: {
    mode: 'live',
    autoProceedToCheckout: true,
    refreshIntervalSec: 30,
    maxReloadsPerHour: 90,
    maxSelectionAttempts: 6,
    scheduledStart: '',
    notifications: true,
    sound: true,
    userWaitLimitMin: 0,
  },
  timeouts: {
    pageLoadMs: 30_000,
    elementMs: 10_000,
    selectionMs: 45_000,
    cartConfirmMs: 20_000,
    checkoutMs: 30_000,
    heartbeatStaleMs: 90_000,
  },
  retry: { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 120_000, factor: 2 },
  logging: { debug: false, maxEntries: 500 },
  profiles: { disabled: [], custom: [] },
};

/** Limites aplicados na normalização (evitam configurações perigosas). */
export const LIMITS = {
  quantity: [1, 10],
  refreshIntervalSec: [10, 3600],
  maxReloadsPerHour: [1, 240],
  maxSelectionAttempts: [1, 50],
  userWaitLimitMin: [0, 24 * 60],
  pageLoadMs: [5_000, 180_000],
  elementMs: [1_000, 120_000],
  selectionMs: [5_000, 300_000],
  cartConfirmMs: [3_000, 180_000],
  checkoutMs: [5_000, 300_000],
  heartbeatStaleMs: [30_000, 600_000],
  maxAttempts: [1, 20],
  baseDelayMs: [250, 60_000],
  maxDelayMs: [1_000, 900_000],
  factor: [1, 5],
  maxEntries: [50, 5_000],
} as const satisfies Record<string, readonly [number, number]>;

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 50);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Normaliza dados vindos do storage/formulário: preenche padrões, aplica
 * limites e descarta campos desconhecidos (migração tolerante).
 */
export function normalizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const t = obj(r.target);
  const b = obj(r.behavior);
  const to = obj(r.timeouts);
  const re = obj(r.retry);
  const lg = obj(r.logging);
  const pr = obj(r.profiles);
  const customProfiles = Array.isArray(pr.custom) ? (pr.custom as SiteProfile[]).filter((p) => validateProfile(p).length === 0) : [];
  return {
    schemaVersion: SETTINGS_VERSION,
    target: {
      eventKeywords: strList(t.eventKeywords),
      eventUrl: typeof t.eventUrl === 'string' ? t.eventUrl.trim() : '',
      sectors: strList(t.sectors),
      categories: strList(t.categories),
      quantity: Math.round(clamp(t.quantity, LIMITS.quantity, d.target.quantity)),
    },
    behavior: {
      mode: b.mode === 'dry-run' ? 'dry-run' : 'live',
      autoProceedToCheckout: bool(b.autoProceedToCheckout, d.behavior.autoProceedToCheckout),
      refreshIntervalSec: Math.round(clamp(b.refreshIntervalSec, LIMITS.refreshIntervalSec, d.behavior.refreshIntervalSec)),
      maxReloadsPerHour: Math.round(clamp(b.maxReloadsPerHour, LIMITS.maxReloadsPerHour, d.behavior.maxReloadsPerHour)),
      maxSelectionAttempts: Math.round(clamp(b.maxSelectionAttempts, LIMITS.maxSelectionAttempts, d.behavior.maxSelectionAttempts)),
      scheduledStart: typeof b.scheduledStart === 'string' ? b.scheduledStart.trim() : '',
      notifications: bool(b.notifications, d.behavior.notifications),
      sound: bool(b.sound, d.behavior.sound),
      userWaitLimitMin: Math.round(clamp(b.userWaitLimitMin, LIMITS.userWaitLimitMin, d.behavior.userWaitLimitMin)),
    },
    timeouts: {
      pageLoadMs: clamp(to.pageLoadMs, LIMITS.pageLoadMs, d.timeouts.pageLoadMs),
      elementMs: clamp(to.elementMs, LIMITS.elementMs, d.timeouts.elementMs),
      selectionMs: clamp(to.selectionMs, LIMITS.selectionMs, d.timeouts.selectionMs),
      cartConfirmMs: clamp(to.cartConfirmMs, LIMITS.cartConfirmMs, d.timeouts.cartConfirmMs),
      checkoutMs: clamp(to.checkoutMs, LIMITS.checkoutMs, d.timeouts.checkoutMs),
      heartbeatStaleMs: clamp(to.heartbeatStaleMs, LIMITS.heartbeatStaleMs, d.timeouts.heartbeatStaleMs),
    },
    retry: {
      maxAttempts: Math.round(clamp(re.maxAttempts, LIMITS.maxAttempts, d.retry.maxAttempts)),
      baseDelayMs: clamp(re.baseDelayMs, LIMITS.baseDelayMs, d.retry.baseDelayMs),
      maxDelayMs: clamp(re.maxDelayMs, LIMITS.maxDelayMs, d.retry.maxDelayMs),
      factor: clamp(re.factor, LIMITS.factor, d.retry.factor),
    },
    logging: {
      debug: bool(lg.debug, d.logging.debug),
      maxEntries: Math.round(clamp(lg.maxEntries, LIMITS.maxEntries, d.logging.maxEntries)),
    },
    profiles: {
      disabled: strList(pr.disabled),
      custom: customProfiles,
    },
  };
}

/** Validação semântica usada no checklist antes de iniciar. */
export function validateSettings(s: Settings): string[] {
  const errors: string[] = [];
  if (s.target.eventUrl && !/^https:\/\//i.test(s.target.eventUrl)) errors.push('A URL do evento deve começar com https://');
  if (s.behavior.scheduledStart && Number.isNaN(Date.parse(s.behavior.scheduledStart))) {
    errors.push('Data/hora de início agendado inválida');
  }
  if (s.retry.maxDelayMs < s.retry.baseDelayMs) errors.push('O atraso máximo de retry deve ser ≥ ao atraso base');
  return errors;
}

function validateSels(sels: unknown, path: string, errors: string[], required = false): void {
  if (sels === undefined) {
    if (required) errors.push(`${path}: obrigatório`);
    return;
  }
  if (!Array.isArray(sels) || (required && sels.length === 0)) {
    errors.push(`${path}: deve ser uma lista de seletores`);
    return;
  }
  (sels as Sel[]).forEach((s, i) => {
    if (!s || typeof s.css !== 'string' || !s.css.trim()) errors.push(`${path}[${i}].css: obrigatório`);
    else if (!isValidCss(s.css)) errors.push(`${path}[${i}].css: seletor CSS inválido (${s.css})`);
    if (s && s.text !== undefined && !Array.isArray(s.text)) errors.push(`${path}[${i}].text: deve ser lista`);
  });
}

function isValidCss(css: string): boolean {
  if (typeof document === 'undefined') return true;
  try {
    document.createDocumentFragment().querySelector(css);
    return true;
  } catch {
    return false;
  }
}

/** Valida um perfil de site (importação/edição na tela de opções). */
export function validateProfile(p: unknown): string[] {
  const errors: string[] = [];
  const prof = p as SiteProfile;
  if (!prof || typeof prof !== 'object') return ['Perfil deve ser um objeto JSON'];
  if (typeof prof.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(prof.id)) errors.push('id: use 2–40 caracteres [a-z0-9-]');
  if (typeof prof.name !== 'string' || !prof.name.trim()) errors.push('name: obrigatório');
  if (!Array.isArray(prof.hosts) || prof.hosts.length === 0) errors.push('hosts: informe ao menos um domínio');
  else prof.hosts.forEach((h, i) => {
    if (typeof h !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h)) errors.push(`hosts[${i}]: domínio inválido`);
  });
  if (!prof.pages || typeof prof.pages !== 'object') errors.push('pages: obrigatório');
  else {
    for (const [k, rules] of Object.entries(prof.pages)) {
      if (!Array.isArray(rules)) errors.push(`pages.${k}: deve ser lista`);
      else rules.forEach((r, i) => {
        if (typeof r !== 'string' || !isValidRegexRule(r)) errors.push(`pages.${k}[${i}]: regra inválida`);
      });
    }
  }
  if (prof.dom) for (const [k, sels] of Object.entries(prof.dom)) validateSels(sels, `dom.${k}`, errors);
  if (prof.eventList) validateSels(prof.eventList.items, 'eventList.items', errors, true);
  if (prof.cart?.proceed) validateSels(prof.cart.proceed, 'cart.proceed', errors);
  if (!Array.isArray(prof.steps)) errors.push('steps: deve ser lista');
  else {
    const ids = new Set<string>();
    prof.steps.forEach((s: Step, i) => {
      const path = `steps[${i}]`;
      if (!s || typeof s.id !== 'string' || !s.id) errors.push(`${path}.id: obrigatório`);
      else if (ids.has(s.id)) errors.push(`${path}.id: duplicado (${s.id})`);
      else ids.add(s.id);
      switch (s?.kind) {
        case 'pick':
          validateSels(s.items, `${path}.items`, errors, true);
          if (!['sectors', 'categories', 'events', 'any'].includes(s.source)) errors.push(`${path}.source: inválido`);
          break;
        case 'quantity':
          if (!s.input && !s.increment) errors.push(`${path}: informe input ou increment`);
          validateSels(s.input, `${path}.input`, errors);
          validateSels(s.increment, `${path}.increment`, errors);
          break;
        case 'click':
          validateSels(s.target, `${path}.target`, errors, true);
          break;
        case 'wait':
          validateSels(s.for, `${path}.for`, errors, true);
          break;
        default:
          errors.push(`${path}.kind: deve ser pick | quantity | click | wait`);
      }
    });
    const criticals = prof.steps.filter((s) => s?.kind === 'click' && s.critical).length;
    if (criticals > 1) errors.push('steps: apenas um passo pode ser "critical" (adicionar ao carrinho)');
  }
  return errors;
}
