import type { PageKind } from '../core/types';
import { textOf } from '../utils/dom';
import { containsAny } from '../utils/text';
import { matchUrlRule, matchesAnyUrlRule } from '../utils/url';
import { anyPresent } from './selectors';
import type { Sel, SiteProfile } from './types';

/**
 * Sinais genéricos de mecanismos de proteção. O robô NUNCA interage com eles:
 * apenas os reconhece para pausar e chamar o usuário (CAPTCHA, fila, bloqueio).
 */
export const GENERIC_CHALLENGE_SELS: Sel[] = [
  // reCAPTCHA v2 visível (checkbox ou desafio). O selo invisível do v3 (.grecaptcha-badge) é ignorado.
  { css: 'iframe[src*="recaptcha"][src*="/anchor"]:not([src*="size=invisible"])' },
  { css: 'iframe[src*="recaptcha"][src*="/bframe"]' },
  { css: 'iframe[title="reCAPTCHA"]:not([src*="size=invisible"])' },
  { css: 'iframe[src*="hcaptcha.com"]' },
  { css: 'iframe[src*="challenges.cloudflare.com"]' },
  { css: '#challenge-form, #challenge-stage, #cf-challenge-running' },
  { css: 'iframe[src*="captcha-delivery.com"]' },
  { css: 'iframe[src*="awswaf"], #captcha-container, awswaf-captcha' },
  { css: '#form_captcha, #img_captcha' },
];

export const GENERIC_CHALLENGE_TEXTS = [
  'confirm you are human',
  'verify you are human',
  'verifique se voce e humano',
  'confirme que voce e humano',
  'verificacao de seguranca',
  'nao sou um robo',
  "i'm not a robot",
];

export const GENERIC_QUEUE_TEXTS = [
  'voce esta na fila',
  'sua posicao na fila',
  'position in the queue',
  'you are now in line',
  'waiting room',
  'sala de espera',
];

export const GENERIC_QUEUE_URLS = ['queue-it.net', 're:/(waitingroom|waiting-room|fila-virtual)'];

export const GENERIC_BLOCKED_TEXTS = ['acesso bloqueado', 'access denied', 'you have been blocked', 'request blocked', 'acesso negado'];

export const GENERIC_ERROR_TEXTS = [
  'bad gateway',
  '504 gateway',
  'gateway timeout',
  '502 bad',
  '503 service',
  'service unavailable',
  'upstream request timeout',
  'encontrou um erro interno',
  'erro interno do servidor',
  'internal server error',
  "we couldn't load your content",
];

export const GENERIC_SOLD_OUT_TEXTS = ['esgotado', 'indisponivel', 'sold out', 'agotado', 'nao disponivel'];

/**
 * Contexto de avaliação de UM ciclo: o texto da página é lido no máximo uma vez
 * (innerText força layout; recalcular a cada consulta seria desperdício de CPU).
 */
export class PageContext {
  private bodyTextCache: string | null = null;

  constructor(
    readonly doc: Document,
    readonly url: string,
  ) {}

  get bodyText(): string {
    if (this.bodyTextCache === null) {
      const body = this.doc.body;
      // Limita o volume analisado: páginas gigantes não precisam ser lidas inteiras.
      this.bodyTextCache = body ? textOf(body).slice(0, 60_000) : '';
    }
    return this.bodyTextCache;
  }

  has(sels: readonly Sel[] | undefined): boolean {
    return anyPresent(this.doc, sels);
  }

  textHas(needles: readonly string[] | undefined): boolean {
    return !!needles && needles.length > 0 && containsAny(this.bodyText, needles);
  }
}

export interface Detection {
  kind: PageKind;
  /** Sinal que determinou a classificação (diagnóstico). */
  signal: string;
}

/**
 * Classifica a página. A precedência é importante: sinais de proteção/erro
 * vencem sinais de fluxo, para que o robô nunca aja sobre um desafio.
 */
export function detectPage(profile: SiteProfile, ctx: PageContext): Detection {
  const { url } = ctx;
  const dom = profile.dom ?? {};
  const texts = profile.texts ?? {};

  if (matchesAnyUrlRule(url, profile.pages.blocked) || ctx.has(dom.blocked)) return { kind: 'BLOCKED', signal: 'blocked:profile' };
  if (ctx.has(GENERIC_CHALLENGE_SELS) || ctx.has(dom.challenge)) return { kind: 'CHALLENGE', signal: 'challenge:dom' };
  if (matchesAnyUrlRule(url, GENERIC_QUEUE_URLS) || matchesAnyUrlRule(url, profile.pages.queue) || ctx.has(dom.queue)) {
    return { kind: 'QUEUE', signal: 'queue:url/dom' };
  }
  if (ctx.textHas(GENERIC_CHALLENGE_TEXTS) || ctx.textHas(texts.challenge)) return { kind: 'CHALLENGE', signal: 'challenge:text' };
  if (ctx.textHas(GENERIC_BLOCKED_TEXTS) || ctx.textHas(texts.blocked)) return { kind: 'BLOCKED', signal: 'blocked:text' };
  if (ctx.textHas(GENERIC_QUEUE_TEXTS) || ctx.textHas(texts.queue)) return { kind: 'QUEUE', signal: 'queue:text' };
  if (ctx.has(dom.error) || ctx.textHas(GENERIC_ERROR_TEXTS) || ctx.textHas(texts.error)) return { kind: 'ERROR_PAGE', signal: 'error' };
  if (isBlankPage(ctx)) return { kind: 'LOADING', signal: 'blank' };

  // Sinais de DOM fortes (específicos do perfil) para etapas finais.
  if (ctx.has(dom.success)) return { kind: 'SUCCESS', signal: 'success:dom' };
  if (ctx.has(dom.checkout)) return { kind: 'CHECKOUT', signal: 'checkout:dom' };
  if (ctx.has(dom.cart)) return { kind: 'CART', signal: 'cart:dom' };
  if (ctx.has(dom.login)) return { kind: 'LOGIN', signal: 'login:dom' };
  if (ctx.has(dom.loading)) return { kind: 'LOADING', signal: 'loading' };

  // URL: vence a regra mais específica (ex.: "/events" vence "/event").
  const byUrl = bestUrlMatch(url, [
    ['SUCCESS', profile.pages.success],
    ['CHECKOUT', profile.pages.checkout],
    ['CART', profile.pages.cart],
    ['LOGIN', profile.pages.login],
    ['EVENT', profile.pages.event],
    ['EVENT_LIST', profile.pages.eventList],
  ]);
  if (byUrl) return { kind: byUrl, signal: `${byUrl.toLowerCase()}:url` };

  if (ctx.has(dom.event)) return { kind: 'EVENT', signal: 'event:dom' };
  if (ctx.has(dom.eventList)) return { kind: 'EVENT_LIST', signal: 'eventList:dom' };
  return { kind: 'UNKNOWN', signal: 'none' };
}

function bestUrlMatch(url: string, candidates: Array<[PageKind, string[] | undefined]>): PageKind | null {
  let best: PageKind | null = null;
  let bestLen = 0;
  for (const [kind, rules] of candidates) {
    for (const rule of rules ?? []) {
      if (rule.length > bestLen && matchUrlRule(url, rule)) {
        best = kind;
        bestLen = rule.length;
      }
    }
  }
  return best;
}

function isBlankPage(ctx: PageContext): boolean {
  const body = ctx.doc.body;
  if (!body) return true;
  return body.children.length === 0 && ctx.bodyText.trim() === '';
}

/** Página exige ação humana? (o robô espera passivamente, sem interagir) */
export function needsUser(kind: PageKind): boolean {
  return kind === 'CHALLENGE' || kind === 'QUEUE' || kind === 'LOGIN';
}

export const USER_REASONS: Partial<Record<PageKind, string>> = {
  CHALLENGE: 'Verificação de segurança/CAPTCHA na tela — resolva manualmente; o robô retoma sozinho depois.',
  QUEUE: 'Na fila virtual — aguardando sua vez (o robô não recarrega nem interage com a fila).',
  LOGIN: 'Login necessário — faça login no site; o robô retoma sozinho depois.',
  BLOCKED: 'O site bloqueou o acesso. Robô pausado — verifique a página antes de continuar.',
};
