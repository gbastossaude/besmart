import type { ErrorCode } from '../core/errors';
import { BotError, classify, decideRecovery, isAbort } from '../core/errors';
import type { Logger } from '../core/logger';
import type { ClaimResult } from '../core/lock';
import type { MachineEvent } from '../core/machine';
import { Scheduler, SingleFlight, debounce } from '../core/scheduler';
import type { ErrorInfo, LedgerEntry, PageKind, Phase } from '../core/types';
import { isActivePhase } from '../core/types';
import type { Settings } from '../storage/schema';
import { highlight, waitForCondition } from '../utils/dom';
import { containsAny } from '../utils/text';
import { displayUrl, hostnameOf, hostMatches, matchesAnyUrlRule } from '../utils/url';
import { clickElement, feedbackHas, setQuantity } from './actions';
import { GENERIC_SOLD_OUT_TEXTS, PageContext, USER_REASONS, detectPage } from './detectors';
import { anyPresent, rankCandidates, resolveAll, resolveClickable } from './selectors';
import type { Candidate } from './selectors';
import type { ClickStep, PickStep, SiteProfile, Step } from './types';

/**
 * FLUXO do robô na página (content script). Orientado a eventos:
 * MutationObserver + navegação disparam `tick()` (debounced, execução única),
 * sem polling agressivo. Toda decisão de fase é validada pelo background.
 */

export interface RunSnapshot {
  runId: string;
  phase: Phase;
  reason?: string;
  /** Falhas consecutivas (zera quando há progresso). */
  attempts: number;
  ledger: Record<string, LedgerEntry>;
  counters: Record<string, number>;
}

export interface ReportExtras {
  page?: { url: string; kind: PageKind };
  action?: string;
  error?: ErrorInfo;
  counter?: string;
  elementWaitMs?: number;
  nextRefreshAt?: number | null;
}

export interface Bridge {
  /** Envia evento da máquina de estados. Retorna o estado oficial (ou null se a execução não pertence mais a esta aba). */
  report(event: MachineEvent | null, extras?: ReportExtras): Promise<RunSnapshot | null>;
  claim(key: string, url: string): Promise<ClaimResult>;
  resolve(key: string, status: 'confirmed' | 'failed', note?: string): Promise<void>;
  /** Pede autorização para recarregar (o background aplica o teto por hora). */
  requestReload(): Promise<boolean>;
  heartbeat(): void;
  playSound(): void;
}

export interface RunnerDeps {
  doc: Document;
  win: Window;
  profile: SiteProfile;
  settings: Settings;
  bridge: Bridge;
  logger: Logger;
  now?: () => number;
  random?: () => number;
}

const CRITICAL_PREFIX = 'critical#';
const PROCEED_KEY = 'proceed-checkout';

export class Runner {
  private scheduler = new Scheduler();
  private readonly flight: SingleFlight;
  private snapshot: RunSnapshot;
  private pageUrl = '';
  private lastKind: PageKind | null = null;
  private refreshCancel: (() => void) | null = null;
  private loadingTimerCancel: (() => void) | null = null;
  /** Candidatos que falharam nesta página (não tentar de novo antes de recarregar). */
  private triedThisPage = new Set<string>();
  private navigatedToEvent = false;
  private prefixDone = false;
  private cartEnteredAt: number | null = null;
  private graceTimerArmed = false;
  private unknownTimerArmed = false;
  private recoveryPending = false;
  private stopped = false;
  private readonly now: () => number;
  private readonly log: Logger;
  private highlights: Array<() => void> = [];

  constructor(
    private readonly deps: RunnerDeps,
    initial: RunSnapshot,
  ) {
    this.snapshot = initial;
    this.now = deps.now ?? Date.now;
    this.log = deps.logger;
    this.flight = new SingleFlight(() => this.tick());
  }

  get phase(): Phase {
    return this.snapshot.phase;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Para diagnóstico/testes de vazamento. */
  schedulerStats() {
    return this.scheduler.stats();
  }

  start(): void {
    const { doc, win } = this.deps;
    this.pageUrl = win.location.href;
    const fast = debounce(this.scheduler, 200, () => void this.flight.run());
    const slow = debounce(this.scheduler, 1000, () => void this.flight.run());
    const onMutation = () => (this.isQuietPhase() ? slow() : fast());
    this.scheduler.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'class'],
    }, onMutation);
    // Navegação SPA (hash/history) e retorno de aba em segundo plano.
    this.scheduler.listen(win, 'popstate', fast);
    this.scheduler.listen(win, 'hashchange', fast);
    this.scheduler.listen(doc, 'visibilitychange', fast);
    this.scheduler.every(20_000, () => this.deps.bridge.heartbeat());
    clearAllHighlights(doc);
    this.log.debug('Runner iniciado', { url: displayUrl(this.pageUrl), phase: this.phase });
    void this.flight.run();
  }

  /** Cancela timers, observers e operações pendentes (STOP / emergência / pausa). */
  stop(reason = 'stop'): void {
    if (this.stopped) return;
    this.stopped = true;
    this.scheduler.dispose();
    this.log.debug('Runner encerrado', { reason });
  }

  /** Força uma reavaliação (ex.: background pediu). */
  poke(): void {
    void this.flight.run();
  }

  private isQuietPhase(): boolean {
    return this.phase === 'WAITING_USER' || this.phase === 'WAITING_AVAILABILITY';
  }

  // ───────────────────────────── ciclo principal ─────────────────────────────

  private async tick(): Promise<void> {
    if (this.stopped || !isActivePhase(this.phase)) return;
    // Recuperação já agendada: não reavaliar (evita contar a mesma falha várias vezes).
    if (this.recoveryPending) return;
    const url = this.deps.win.location.href;
    if (url !== this.pageUrl) this.onUrlChange(url);

    const ctx = new PageContext(this.deps.doc, url);
    const detection = detectPage(this.deps.profile, ctx);
    if (detection.kind !== this.lastKind) {
      this.log.debug(`Página identificada: ${detection.kind}`, { signal: detection.signal, url: displayUrl(url) });
      this.lastKind = detection.kind;
      if (detection.kind !== 'LOADING') this.cancelLoadingTimer();
    }

    try {
      await this.handle(detection.kind, ctx);
    } catch (err) {
      if (isAbort(err) || this.stopped) return;
      await this.handleFailure(err, detection.kind);
    }
  }

  private onUrlChange(url: string): void {
    this.log.debug('URL mudou (navegação SPA)', { from: displayUrl(this.pageUrl), to: displayUrl(url) });
    this.pageUrl = url;
    this.triedThisPage.clear();
    this.prefixDone = false;
    this.unknownTimerArmed = false;
    this.cancelRefresh();
    this.cancelLoadingTimer();
    this.clearHighlights();
  }

  private async handle(kind: PageKind, ctx: PageContext): Promise<void> {
    const page = { url: ctx.url, kind };
    switch (kind) {
      case 'BLOCKED':
        this.cancelRefresh();
        await this.report({ type: 'PAUSE', reason: USER_REASONS.BLOCKED ?? 'Bloqueado' }, { page });
        return;
      case 'CHALLENGE':
      case 'QUEUE':
      case 'LOGIN':
        this.cancelRefresh();
        if (this.phase !== 'WAITING_USER' || this.snapshot.reason !== USER_REASONS[kind]) {
          this.log.warn(USER_REASONS[kind] ?? 'Ação do usuário necessária', { page: kind });
          await this.report({ type: 'NEED_USER', reason: USER_REASONS[kind] ?? 'Ação do usuário necessária' }, { page });
          this.deps.bridge.playSound();
        }
        return;
      case 'ERROR_PAGE':
        throw new BotError('SERVER_ERROR_PAGE', 'O site exibiu uma página de erro');
      case 'LOADING':
        this.armLoadingTimer();
        return;
      case 'UNKNOWN':
        await this.handleUnknown(page);
        return;
      case 'SUCCESS':
        await this.report({ type: 'COMPLETE', reason: 'Página de confirmação detectada' }, { page });
        return;
      case 'CHECKOUT':
        await this.handleCheckout(page);
        return;
      case 'CART':
        await this.handleCart(ctx, page);
        return;
      case 'EVENT_LIST':
        await this.handleEventList(ctx, page);
        return;
      case 'EVENT':
        await this.handleEvent(ctx, page);
        return;
    }
  }

  // ───────────────────────────── handlers por página ─────────────────────────

  private async handleUnknown(page: { url: string; kind: PageKind }): Promise<void> {
    if (this.phase === 'WAITING_USER') return; // usuário está navegando; aguardar.
    await this.report({ type: 'PAGE_WAIT', reason: 'Aguardando uma página reconhecida do site' }, { page });
    // Espera limitada: depois do timeout, avisa o usuário (sem navegar por conta própria).
    if (this.unknownTimerArmed) return;
    this.unknownTimerArmed = true;
    this.scheduler.timeout(() => {
      if (this.lastKind !== 'UNKNOWN' || this.stopped) return;
      this.log.warn('Página não reconhecida por muito tempo', { url: displayUrl(this.deps.win.location.href) });
      void this.report({ type: 'NEED_USER', reason: 'Página não reconhecida — abra a página do evento (ou ajuste o perfil do site).' }, { page });
    }, this.deps.settings.timeouts.pageLoadMs);
  }

  private async handleCheckout(page: { url: string; kind: PageKind }): Promise<void> {
    await this.resolvePendingCritical('confirmed', 'checkout alcançado');
    await this.report({ type: 'CHECKOUT_REACHED', reason: 'Checkout aberto' }, { page });
    if (!isActivePhase(this.phase)) return;
    this.deps.bridge.playSound();
    await this.report({ type: 'COMPLETE', reason: 'Checkout aberto — finalize o pagamento manualmente.' }, { page });
  }

  private async handleCart(ctx: PageContext, page: { url: string; kind: PageKind }): Promise<void> {
    await this.resolvePendingCritical('confirmed', 'carrinho alcançado');
    if (this.phase !== 'CART') {
      await this.report({ type: 'ADDED_TO_CART', reason: 'Ingresso(s) no carrinho' }, { page, counter: 'cartReached' });
      this.log.success('Ingresso(s) no carrinho');
      this.deps.bridge.playSound();
    }
    if (!isActivePhase(this.phase)) return;

    const { settings, profile } = this.deps;
    const proceedSels = profile.cart?.proceed;
    if (!settings.behavior.autoProceedToCheckout || !proceedSels?.length) {
      await this.report({ type: 'COMPLETE', reason: 'Ingresso(s) no carrinho — finalize a compra manualmente.' }, { page });
      return;
    }
    const entry = this.snapshot.ledger[PROCEED_KEY];
    if (entry && entry.status !== 'failed') {
      // Já clicamos em "continuar" nesta execução: não repetir automaticamente.
      await this.report({ type: 'COMPLETE', reason: 'Carrinho pronto — siga para o pagamento manualmente.' }, { page });
      return;
    }
    const { element } = await this.waitClickable(proceedSels, this.deps.settings.timeouts.elementMs, 'botão de checkout', true);
    if (!element) {
      await this.report({ type: 'COMPLETE', reason: 'Carrinho pronto — botão de checkout não encontrado; continue manualmente.' }, { page });
      return;
    }
    if (settings.behavior.mode === 'dry-run') {
      this.mark(element, 'checkout (simulação)');
      await this.report({ type: 'PAUSE', reason: 'Simulação: clicaria em "continuar para o checkout".' }, { page });
      return;
    }
    const claim = await this.deps.bridge.claim(PROCEED_KEY, ctx.url);
    if (!claim.granted) return;
    clickElement(element);
    await this.report(null, { action: 'Clique: continuar para o checkout' });
    try {
      await waitForCondition(
        () => {
          const k = detectPage(profile, new PageContext(this.deps.doc, this.deps.win.location.href)).kind;
          return k === 'CHECKOUT' || k === 'SUCCESS' ? k : null;
        },
        { timeoutMs: settings.timeouts.checkoutMs, signal: this.scheduler.signal, code: 'NAVIGATION_TIMEOUT', description: 'checkout' },
      );
      await this.deps.bridge.resolve(PROCEED_KEY, 'confirmed');
      void this.flight.run();
    } catch (err) {
      if (isAbort(err)) throw err;
      await this.report({ type: 'COMPLETE', reason: 'Carrinho pronto — o checkout não abriu a tempo; continue manualmente.' }, { page });
    }
  }

  private async handleEventList(ctx: PageContext, page: { url: string; kind: PageKind }): Promise<void> {
    const { settings, profile } = this.deps;
    await this.report({ type: 'EVENT_LIST', reason: 'Procurando o evento' }, { page });
    if (!isActivePhase(this.phase)) return;

    const eventUrl = settings.target.eventUrl;
    if (eventUrl) {
      if (this.navigatedToEvent) return;
      if (!this.isAllowedNavigation(eventUrl)) {
        throw new BotError('CONFIG_INVALID', 'A URL do evento não pertence a um domínio do perfil ativo');
      }
      if (matchesAnyUrlRule(ctx.url, [eventUrl])) return;
      this.navigatedToEvent = true;
      await this.report(null, { action: 'Navegando para a URL do evento' });
      this.deps.win.location.assign(eventUrl);
      return;
    }

    if (!profile.eventList || settings.target.eventKeywords.length === 0) {
      await this.report({ type: 'NEED_USER', reason: 'Abra a página do evento (configure palavras-chave ou URL do evento para automatizar).' }, { page });
      return;
    }
    const items = resolveAll(this.deps.doc, profile.eventList.items).elements;
    const candidates = rankCandidates(items, settings.target.eventKeywords, {
      textIn: profile.eventList.textIn,
      soldOutTexts: this.soldOutTexts(),
    }).filter((c) => !c.soldOut);
    const best = candidates[0];
    if (!best) {
      await this.report({ type: 'UNAVAILABLE', reason: 'Evento ainda não disponível na lista' }, { page });
      this.scheduleRefresh();
      return;
    }
    const target = this.clickTargetFor(best.element, profile.eventList.clickTarget) ?? best.element.closest('a') ?? best.element;
    clickElement(target);
    await this.report(null, { action: `Abrindo evento: ${best.text.slice(0, 80)}` });
  }

  private async handleEvent(ctx: PageContext, page: { url: string; kind: PageKind }): Promise<void> {
    const { profile, settings } = this.deps;

    // 0) Já está no carrinho: nunca selecionar de novo. Dá um tempo para o site
    //    navegar sozinho até o carrinho; se não navegar, encerra entregando ao usuário.
    if (this.phase === 'CART' || this.phase === 'CHECKOUT') {
      const grace = settings.timeouts.cartConfirmMs;
      const elapsed = this.now() - (this.cartEnteredAt ?? this.now());
      if (this.cartEnteredAt === null) this.cartEnteredAt = this.now();
      if (elapsed < grace) {
        if (!this.graceTimerArmed) {
          this.graceTimerArmed = true;
          this.scheduler.timeout(() => {
            this.graceTimerArmed = false;
            void this.flight.run();
          }, grace - elapsed + 50);
        }
        return;
      }
      await this.report({ type: 'COMPLETE', reason: 'Ingresso(s) no carrinho — abra o carrinho e finalize a compra manualmente.' }, { page });
      return;
    }

    // 1) Já existe item no carrinho por ação nossa?
    const pending = this.pendingCritical();
    if (pending && anyPresent(this.deps.doc, profile.dom?.cartFilled)) {
      await this.deps.bridge.resolve(pending, 'confirmed', 'indicador de carrinho');
      await this.report({ type: 'ADDED_TO_CART', reason: 'Item confirmado no carrinho' }, { page, counter: 'cartAdds' });
      this.log.success('Item confirmado no carrinho');
      this.deps.bridge.playSound();
      void this.flight.run();
      return;
    }
    // 2) Ação crítica anterior sem confirmação (ex.: página recarregou no meio): NUNCA repetir sozinho.
    if (pending) {
      await this.report(
        { type: 'PAUSE', reason: 'Não foi possível confirmar se a última tentativa entrou no carrinho. Verifique o carrinho; depois use "Retomar".' },
        { page },
      );
      return;
    }
    if (this.failedCriticalCount() >= settings.behavior.maxSelectionAttempts) {
      throw new BotError('SELECTION_EXHAUSTED', `Limite de ${settings.behavior.maxSelectionAttempts} tentativas de seleção atingido`);
    }

    if (this.phase !== 'WAITING_AVAILABILITY' && this.phase !== 'SELECTING') {
      await this.report({ type: 'EVENT_PAGE', reason: 'Página do evento — verificando disponibilidade' }, { page });
      if (!isActivePhase(this.phase)) return;
    }

    // 3) Disponibilidade (passo "probe" ou o primeiro "pick").
    const steps = profile.steps;
    const probe = this.probeStep();
    const probeIdx = probe ? steps.indexOf(probe) : -1;
    let startIdx = 0;
    if (probe) {
      const itemsExist = resolveAll(this.deps.doc, probe.items).elements.length > 0;
      if (!itemsExist && probeIdx > 0 && !this.prefixDone) {
        // Passos "abridores" antes da lista (ex.: botão INGRESSOS) — executados uma vez por página.
        this.prefixDone = true;
        await this.runPrefix(steps.slice(0, probeIdx), probe);
      }
      startIdx = Math.max(0, probeIdx);
      const available = this.availableCandidates(probe);
      if (available.length === 0) {
        const prefs = this.preferencesFor(probe);
        const reason = `Aguardando disponibilidade${prefs.length ? `: ${prefs.slice(0, 4).join(', ')}` : ''} (atualiza a cada ${settings.behavior.refreshIntervalSec}s)`;
        // Também informa quando havia falhas: página saudável zera o contador de tentativas.
        if (this.phase !== 'WAITING_AVAILABILITY' || this.snapshot.attempts > 0 || this.snapshot.reason !== reason) {
          await this.report({ type: 'UNAVAILABLE', reason }, { page });
        }
        this.scheduleRefresh();
        return;
      }
      this.log.info('Disponibilidade detectada', { opcoes: available.slice(0, 3).map((c) => c.text.slice(0, 40)) });
    }

    // 4) Seleção.
    this.cancelRefresh();
    await this.report({ type: 'AVAILABLE', reason: 'Disponível — selecionando' }, { page });
    if (this.phase !== 'SELECTING') return;
    await this.runSelection(ctx, startIdx);
  }

  /** Executa passos anteriores à lista (todos tratados como opcionais) e espera a lista surgir. */
  private async runPrefix(prefix: Step[], probe: PickStep): Promise<void> {
    const { settings } = this.deps;
    for (const step of prefix) {
      if (step.kind === 'click' && !step.critical) {
        const { element } = await this.waitClickable(step.target, Math.min(step.timeoutMs ?? 3000, settings.timeouts.elementMs), step.label, true);
        if (!element) continue;
        clickElement(element);
        await this.report(null, { action: `Clique: ${step.label}` });
      } else if (step.kind === 'wait') {
        await this.waitFor(() => (anyPresent(this.deps.doc, step.for) ? true : null), step.timeoutMs ?? settings.timeouts.elementMs, { ...step, optional: true });
      }
    }
    await this.waitFor(
      () => (resolveAll(this.deps.doc, probe.items).elements.length > 0 ? true : null),
      settings.timeouts.elementMs,
      { ...probe, optional: true },
    );
  }

  // ───────────────────────────── seleção (passos do perfil) ──────────────────

  private probeStep(): PickStep | undefined {
    const picks = this.deps.profile.steps.filter((s): s is PickStep => s.kind === 'pick');
    return picks.find((s) => s.probe) ?? picks[0];
  }

  private preferencesFor(step: PickStep): string[] {
    const t = this.deps.settings.target;
    switch (step.source) {
      case 'sectors':
        return t.sectors;
      case 'categories':
        return t.categories;
      case 'events':
        return t.eventKeywords;
      case 'any':
        return [];
    }
  }

  private soldOutTexts(): string[] {
    return [...GENERIC_SOLD_OUT_TEXTS, ...(this.deps.profile.texts?.soldOut ?? [])];
  }

  private availableCandidates(step: PickStep): Candidate[] {
    const items = resolveAll(this.deps.doc, step.items).elements;
    return rankCandidates(items, this.preferencesFor(step), { textIn: step.textIn, soldOutTexts: this.soldOutTexts() }).filter(
      (c) => !c.soldOut && !this.triedThisPage.has(`${step.id}:${c.text}`),
    );
  }

  private async runSelection(ctx: PageContext, startIdx: number): Promise<void> {
    const { profile, settings } = this.deps;
    const deadline = this.now() + settings.timeouts.selectionMs;
    let picked: Element | null = null;
    const chosen: string[] = [];

    for (const step of profile.steps.slice(startIdx)) {
      if (this.stopped) return;
      const remaining = deadline - this.now();
      if (remaining <= 0) throw new BotError('ELEMENT_TIMEOUT', 'Tempo de seleção esgotado', { step: step.id });
      const timeout = Math.min(step.timeoutMs ?? settings.timeouts.elementMs, remaining);

      switch (step.kind) {
        case 'pick': {
          const cand = await this.waitFor(() => this.availableCandidates(step)[0] ?? null, timeout, step);
          if (!cand) break; // opcional e ausente
          chosen.push(cand.text.slice(0, 60));
          const target = this.clickTargetFor(cand.element, step.clickTarget) ?? cand.element;
          this.triedThisPage.add(`${step.id}:${cand.text}`);
          clickElement(target);
          picked = cand.element;
          await this.report(null, { action: `${step.label}: ${cand.text.slice(0, 80)}` });
          break;
        }
        case 'quantity': {
          const scope = step.scope === 'picked' && picked ? picked : this.deps.doc;
          const field = await this.waitFor(() => (anyPresent(scope, step.input) || anyPresent(scope, step.increment) ? true : null), timeout, step);
          if (!field) break;
          const q = await setQuantity(scope, settings.target.quantity, step, this.scheduler);
          if (!q.ok) throw new BotError('STEP_FAILED', 'Não foi possível definir a quantidade', { step: step.id });
          if (q.capped) this.log.warn(`O site limita a quantidade a ${q.applied} (pedido: ${settings.target.quantity})`);
          await this.report(null, { action: `Quantidade: ${q.applied}` });
          break;
        }
        case 'wait': {
          await this.waitFor(() => (anyPresent(this.deps.doc, step.for) ? true : null), timeout, step);
          break;
        }
        case 'click': {
          if (step.critical) {
            await this.criticalClick(step, timeout, ctx, chosen.join(' › '));
            return;
          }
          const { element } = await this.waitClickable(step.target, timeout, step.label, !!step.optional);
          if (!element) break;
          clickElement(element);
          await this.report(null, { action: `Clique: ${step.label}` });
          break;
        }
      }
    }
    // Perfil sem passo crítico: a seleção termina aqui; o carrinho é detectado pela navegação.
  }

  private async criticalClick(step: ClickStep, timeout: number, ctx: PageContext, selection: string): Promise<void> {
    const { settings, profile } = this.deps;
    const { element } = await this.waitClickable(step.target, timeout, step.label, false);
    if (!element) throw new BotError('STEP_FAILED', `Botão "${step.label}" não encontrado`);

    if (settings.behavior.mode === 'dry-run') {
      this.mark(element, `${step.label} (NÃO clicado — simulação)`);
      await this.report({ type: 'PAUSE', reason: `Simulação concluída: clicaria em "${step.label}" (${selection}).` });
      return;
    }

    const key = `${CRITICAL_PREFIX}${this.failedCriticalCount() + 1}`;
    const claim = await this.deps.bridge.claim(key, ctx.url);
    if (!claim.granted) {
      this.log.warn('Ação crítica já registrada nesta execução — não será repetida', { key, status: claim.status });
      return;
    }
    const failedBefore = feedbackHas(this.deps.doc, profile.texts?.actionFailed);
    clickElement(element);
    this.log.info(`Clique crítico: ${step.label}`, { selecao: selection });
    await this.report(null, { action: `Clique: ${step.label} (${selection})`, counter: 'criticalClicks' });

    // Confirmação: carrinho (URL/DOM/mensagem) ou rejeição (mensagem nova de erro).
    const started = this.now();
    let outcome: 'ok' | 'fail';
    try {
      outcome = await waitForCondition<'ok' | 'fail'>(
        () => {
          const url = this.deps.win.location.href;
          const kind = detectPage(profile, new PageContext(this.deps.doc, url)).kind;
          if (kind === 'CART' || kind === 'CHECKOUT') return 'ok';
          if (anyPresent(this.deps.doc, profile.dom?.cartFilled)) return 'ok';
          if (feedbackHas(this.deps.doc, profile.texts?.cartConfirmed)) return 'ok';
          if (!failedBefore && feedbackHas(this.deps.doc, [...(profile.texts?.actionFailed ?? []), ...this.soldOutTexts()])) return 'fail';
          return null;
        },
        { timeoutMs: settings.timeouts.cartConfirmMs, signal: this.scheduler.signal, code: 'ACTION_UNCONFIRMED', description: 'confirmação do carrinho' },
      );
    } catch (err) {
      if (isAbort(err)) throw err;
      // Resultado desconhecido: manter "pending" e pausar. Nunca clicar de novo por conta própria.
      await this.report(
        { type: 'PAUSE', reason: 'Clique em "adicionar" sem confirmação a tempo. Verifique o carrinho; depois use "Retomar".' },
        { error: classify(err).toInfo(this.now(), this.phase) },
      );
      return;
    }
    await this.report(null, { elementWaitMs: this.now() - started });
    if (outcome === 'ok') {
      await this.deps.bridge.resolve(key, 'confirmed');
      await this.report({ type: 'ADDED_TO_CART', reason: 'Item adicionado ao carrinho' }, { counter: 'cartAdds' });
      this.log.success(`Adicionado ao carrinho: ${selection}`);
      this.deps.bridge.playSound();
      void this.flight.run();
      return;
    }
    await this.deps.bridge.resolve(key, 'failed', 'site rejeitou');
    this.log.warn(`Site rejeitou a seleção (${selection}); tentando próxima opção`);
    await this.report({ type: 'UNAVAILABLE', reason: 'Seleção rejeitada pelo site — tentando outra opção' }, { counter: 'selectionRejected' });
    // Reavalia (outra opção desta página, ou espera por refresh).
    this.scheduler.timeout(() => void this.flight.run(), 500);
  }

  // ───────────────────────────── utilidades de espera/ledger ─────────────────

  private async waitFor<T>(check: () => T | null, timeoutMs: number, step: Step): Promise<T | null> {
    const started = this.now();
    try {
      const v = await waitForCondition(() => check() ?? null, {
        timeoutMs,
        signal: this.scheduler.signal,
        code: 'ELEMENT_TIMEOUT',
        description: step.label,
      });
      const waited = this.now() - started;
      if (waited > 0) await this.report(null, { elementWaitMs: waited });
      if (waited > timeoutMs / 2) this.log.warn(`Elemento demorou para aparecer: ${step.label}`, { ms: waited });
      return v;
    } catch (err) {
      if (!isAbort(err) && step.optional) {
        this.log.debug(`Passo opcional ignorado: ${step.label}`);
        return null;
      }
      throw err;
    }
  }

  private async waitClickable(sels: ClickStep['target'], timeoutMs: number, label: string, optional: boolean): Promise<{ element: Element | null }> {
    try {
      const element = await waitForCondition(() => resolveClickable(this.deps.doc, sels).element, {
        timeoutMs,
        signal: this.scheduler.signal,
        code: 'ELEMENT_TIMEOUT',
        description: label,
      });
      const strategy = resolveClickable(this.deps.doc, sels).strategy;
      if (strategy > 0) this.log.warn(`Seletor principal falhou para "${label}"; fallback ${strategy} usado`);
      return { element };
    } catch (err) {
      if (!isAbort(err) && optional) return { element: null };
      throw err;
    }
  }

  private clickTargetFor(el: Element, css?: string): Element | null {
    if (!css) return null;
    return el.querySelector(css);
  }

  private pendingCritical(): string | undefined {
    return Object.entries(this.snapshot.ledger).find(([k, e]) => k.startsWith(CRITICAL_PREFIX) && e.status === 'pending')?.[0];
  }

  private failedCriticalCount(): number {
    return Object.entries(this.snapshot.ledger).filter(([k, e]) => k.startsWith(CRITICAL_PREFIX) && e.status === 'failed').length;
  }

  private async resolvePendingCritical(status: 'confirmed' | 'failed', note: string): Promise<void> {
    const pending = this.pendingCritical();
    if (pending) {
      await this.deps.bridge.resolve(pending, status, note);
      this.snapshot = { ...this.snapshot, ledger: { ...this.snapshot.ledger, [pending]: { ...this.snapshot.ledger[pending]!, status } } };
    }
  }

  private isAllowedNavigation(url: string): boolean {
    if (!/^https:\/\//i.test(url)) return false;
    const host = hostnameOf(url);
    return this.deps.profile.hosts.some((h) => hostMatches(host, h));
  }

  // ───────────────────────────── refresh / timeouts / falhas ─────────────────

  private scheduleRefresh(): void {
    if (this.refreshCancel || this.stopped) return;
    const delay = this.deps.settings.behavior.refreshIntervalSec * 1000;
    const at = this.now() + delay;
    void this.report(null, { nextRefreshAt: at });
    this.log.debug(`Próxima atualização em ${Math.round(delay / 1000)}s`);
    this.refreshCancel = this.scheduler.timeout(() => {
      this.refreshCancel = null;
      void this.reloadPage('Atualizando página (aguardando disponibilidade)');
    }, delay);
  }

  private cancelRefresh(): void {
    if (this.refreshCancel) {
      this.refreshCancel();
      this.refreshCancel = null;
      void this.report(null, { nextRefreshAt: null });
    }
  }

  private armLoadingTimer(): void {
    if (this.loadingTimerCancel) return;
    this.loadingTimerCancel = this.scheduler.timeout(() => {
      this.loadingTimerCancel = null;
      if (this.lastKind === 'LOADING') {
        void this.handleFailure(new BotError('PAGE_LOAD_TIMEOUT', 'A página não terminou de carregar a tempo'), 'LOADING');
      }
    }, this.deps.settings.timeouts.pageLoadMs);
  }

  private cancelLoadingTimer(): void {
    this.loadingTimerCancel?.();
    this.loadingTimerCancel = null;
  }

  /** Recarrega a página se permitido (fase + teto do background). Retorna se recarregou. */
  private async reloadPage(why: string): Promise<boolean> {
    if (this.stopped || !isActivePhase(this.phase)) return false;
    if (this.phase === 'WAITING_USER' || this.phase === 'CART' || this.phase === 'CHECKOUT') return false;
    const allowed = await this.deps.bridge.requestReload();
    if (!allowed || this.stopped) return false;
    this.log.info(why);
    this.deps.win.location.reload();
    return true;
  }

  private async handleFailure(err: unknown, kind: PageKind): Promise<void> {
    if (this.stopped) return;
    const error = classify(err);
    if (error.code === 'ABORTED') return;
    const info = error.toInfo(this.now(), this.phase);
    const decision = decideRecovery(error, this.snapshot.attempts, this.deps.settings.retry, this.deps.random);
    this.log.error(`Falha (${error.kind}): ${error.message}`, { code: error.code, pagina: kind });
    if (decision.action === 'retry') {
      await this.report({ type: 'RETRY', reason: `Recuperação ${decision.attempt}/${this.deps.settings.retry.maxAttempts}: ${error.message}` }, { error: info, counter: 'retries' });
      this.log.info(`Recuperação iniciada em ${Math.round(decision.delayMs / 1000)}s`);
      this.recoveryPending = true;
      this.scheduler.timeout(async () => {
        const reloaded = await this.reloadPage('Recarregando para recuperação');
        if (!reloaded && !this.stopped) {
          // Não recarregou (ex.: fase mudou): volta a avaliar a página atual.
          this.recoveryPending = false;
          void this.flight.run();
        }
      }, decision.delayMs);
      return;
    }
    const event: MachineEvent = decision.action === 'pause' ? { type: 'PAUSE', reason: decision.reason } : { type: 'FAIL', reason: decision.reason };
    await this.report(event, { error: info });
  }

  private lastReportSig = '';

  private async report(event: MachineEvent | null, extras?: ReportExtras): Promise<void> {
    if (this.stopped) return;
    // Evita mensagens/escritas repetidas: mesmo evento, mesmo motivo, mesma página.
    const onlyStatus = !extras || (extras.action === undefined && extras.error === undefined && extras.counter === undefined && extras.elementWaitMs === undefined && extras.nextRefreshAt === undefined);
    const sig = `${event?.type ?? '-'}|${event?.reason ?? ''}|${extras?.page?.kind ?? ''}|${extras?.page?.url ?? ''}`;
    if (onlyStatus && sig === this.lastReportSig && (!event || event.type !== 'RETRY')) return;
    this.lastReportSig = sig;
    const snap = await this.deps.bridge.report(event, extras);
    if (!snap) {
      this.stop('execução não pertence mais a esta aba');
      return;
    }
    this.snapshot = snap;
    if (!isActivePhase(snap.phase)) this.stop(`fase ${snap.phase}`);
  }

  private mark(el: Element, label: string): void {
    this.highlights.push(highlight(el, label));
    this.log.info(`Simulação: ${label}`);
  }

  private clearHighlights(): void {
    for (const h of this.highlights) h();
    this.highlights = [];
  }
}

/** Remove destaques deixados por uma simulação anterior. */
export function clearAllHighlights(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll('[data-autoticket-highlight]'))) {
    const html = el as HTMLElement;
    html.style.outline = '';
    html.style.outlineOffset = '';
    html.removeAttribute('data-autoticket-highlight');
  }
}

/** Helper exportado para testes: verifica se um texto indica esgotado. */
export function looksSoldOut(text: string, extra: readonly string[] = []): boolean {
  return containsAny(text, [...GENERIC_SOLD_OUT_TEXTS, ...extra]);
}

export type { ErrorCode };
