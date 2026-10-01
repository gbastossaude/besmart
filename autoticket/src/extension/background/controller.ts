import { BotError } from '../../core/errors';
import type { Logger } from '../../core/logger';
import { Mutex, claimAction, pendingActions, pruneLedger, resolveAction } from '../../core/lock';
import type { MachineEvent } from '../../core/machine';
import { increment, recordElementWait, summarize } from '../../core/metrics';
import { applyEvent, newRunId, recordAction, recordError, recordPage, startRun, tryReload } from '../../core/state';
import type { Phase, RunState } from '../../core/types';
import { displayStatus, isActivePhase } from '../../core/types';
import type { ReportExtras, RunSnapshot } from '../../site/flows';
import { findProfileForHost } from '../../site/profiles';
import type { SiteProfile } from '../../site/types';
import type { LogStore } from '../../storage/logs';
import type { Settings } from '../../storage/schema';
import { validateSettings } from '../../storage/schema';
import type { RunStore } from '../../storage/state';
import { displayUrl, hostnameOf } from '../../utils/url';
import type { BackgroundMessage, CheckItem, HelloResponse, StartResponse, StatusResponse } from '../shared/messages';

export interface TabInfo {
  id: number;
  url?: string;
  discarded?: boolean;
  status?: string;
}

/** Dependências injetadas (Chrome real em produção, mocks nos testes). */
export interface ControllerDeps {
  runs: RunStore;
  logs: LogStore;
  logger: Logger;
  getSettings(): Promise<Settings>;
  getProfiles(settings: Settings): SiteProfile[];
  tabs: {
    get(tabId: number): Promise<TabInfo | null>;
    send(tabId: number, msg: BackgroundMessage): Promise<unknown>;
    reload(tabId: number): Promise<void>;
    setAutoDiscardable(tabId: number, value: boolean): Promise<void>;
    inject(tabId: number): Promise<void>;
    activate(tabId: number): Promise<void>;
  };
  hasHostPermission(url: string): Promise<boolean>;
  notify(kind: 'user' | 'cart' | 'done' | 'error' | 'paused', title: string, message: string): void;
  setBadge(state: RunState): void;
  alarms: {
    set(name: string, when: number, periodMinutes?: number): void;
    clear(name: string): void;
  };
  now(): number;
}

export const ALARM_WATCHDOG = 'watchdog';
export const ALARM_SCHEDULED = 'scheduled-start';

/**
 * Eventos que significam progresso real (zeram o contador de falhas consecutivas).
 * Reconhecer a página (EVENT_PAGE) ou ver disponibilidade (AVAILABLE) NÃO conta:
 * senão um passo que sempre falha geraria retries sem fim. UNAVAILABLE conta porque
 * indica página saudável (a condição de erro passou).
 */
const PROGRESS_EVENTS = new Set<MachineEvent['type']>(['UNAVAILABLE', 'ADDED_TO_CART', 'CHECKOUT_REACHED', 'COMPLETE']);

/**
 * Dono único do estado da execução. Toda leitura-modificação-escrita passa
 * pelo Mutex → sem condições de corrida entre mensagens simultâneas.
 * Garante no máximo UMA execução ativa (lock por aba).
 */
export class RunController {
  private readonly mutex = new Mutex();
  private nextRefreshAt: number | null = null;
  private watchdogRecoveryAt = 0;

  constructor(private readonly d: ControllerDeps) {}

  private get log(): Logger {
    return this.d.logger;
  }

  // ───────────────────────────── consultas ─────────────────────────────

  async status(): Promise<StatusResponse> {
    const run = await this.d.runs.get();
    const now = this.d.now();
    const settings = await this.d.getSettings();
    const profile = run.profileId ? this.d.getProfiles(settings).find((p) => p.id === run.profileId) : undefined;
    return {
      run,
      display: displayStatus(run.phase),
      summary: summarize(run.metrics, run.phase, run.startedAt, now),
      profileName: profile?.name,
      now,
      nextRefreshAt: this.nextRefreshAt,
    };
  }

  /** Checklist automático antes de iniciar. Nada inicia silenciosamente com problema. */
  async checklist(tabId: number): Promise<{ checks: CheckItem[]; profile?: SiteProfile; settings: Settings; tab: TabInfo | null }> {
    const settings = await this.d.getSettings();
    const checks: CheckItem[] = [];
    const tab = await this.d.tabs.get(tabId);
    const url = tab?.url ?? '';
    checks.push({ id: 'tab', label: 'Aba acessível', ok: !!tab && /^https?:/i.test(url), detail: tab ? displayUrl(url) || 'URL indisponível (sem permissão)' : 'Aba não encontrada' });
    const profile = url ? findProfileForHost(this.d.getProfiles(settings), hostnameOf(url)) : undefined;
    checks.push({ id: 'profile', label: 'Site suportado (perfil)', ok: !!profile, detail: profile ? profile.name : 'Nenhum perfil para este domínio — crie um perfil personalizado nas Opções' });
    const perm = url ? await this.d.hasHostPermission(url) : false;
    checks.push({ id: 'permission', label: 'Permissão de acesso ao site', ok: perm, detail: perm ? undefined : 'Conceda a permissão nas Opções › Perfis' });
    const errors = validateSettings(settings);
    checks.push({ id: 'settings', label: 'Configuração válida', ok: errors.length === 0, detail: errors.join('; ') || undefined });
    const target = settings.target;
    const hasTarget = target.sectors.length > 0 || target.categories.length > 0 || target.eventKeywords.length > 0 || !!target.eventUrl;
    checks.push({
      id: 'target',
      label: 'Preferências definidas',
      ok: hasTarget,
      detail: hasTarget ? `${target.quantity} ingresso(s); setores: ${target.sectors.join(', ') || 'qualquer'}` : 'Defina ao menos setores, categorias ou o evento',
    });
    const run = await this.d.runs.get();
    let duplicate = false;
    let detail: string | undefined;
    if (isActivePhase(run.phase) && run.tabId !== undefined) {
      const other = await this.d.tabs.get(run.tabId);
      duplicate = !!other;
      detail = other ? (run.tabId === tabId ? 'Já está executando nesta aba' : `Execução ativa em outra aba (#${run.tabId}) — pare-a antes`) : undefined;
    }
    checks.push({ id: 'single', label: 'Nenhuma execução duplicada', ok: !duplicate, detail });
    return { checks, profile, settings, tab };
  }

  // ───────────────────────────── comandos do usuário ─────────────────────

  async start(tabId: number): Promise<StartResponse> {
    return this.mutex.run(async () => {
      const { checks, profile, settings, tab } = await this.checklist(tabId);
      const failed = checks.filter((c) => !c.ok);
      if (failed.length > 0 || !profile || !tab) {
        const message = `Não iniciado: ${failed.map((c) => c.label).join(', ')}`;
        this.log.warn(message);
        return { ok: false, checks, message };
      }
      const now = this.d.now();
      const previous = await this.d.runs.get();
      // Execução "ativa" cuja aba sumiu: libera o lock antes de começar outra.
      const base: RunState = isActivePhase(previous.phase) ? { ...previous, phase: 'STOPPED' } : previous;
      const scheduledAt = settings.behavior.scheduledStart ? Date.parse(settings.behavior.scheduledStart) : undefined;
      const future = scheduledAt && scheduledAt > now + 1000 ? scheduledAt : undefined;
      const res = startRun(base, { tabId, profileId: profile.id, now, runId: newRunId(now), scheduledAt: future });
      if (!res.ok) return { ok: false, checks, message: res.error ?? 'Falha ao iniciar' };
      await this.d.runs.put(res.state, true);
      this.nextRefreshAt = null;
      this.d.setBadge(res.state);
      await this.d.tabs.setAutoDiscardable(tabId, false).catch(() => undefined);
      this.d.alarms.set(ALARM_WATCHDOG, now + 30_000, 0.5);
      this.log.info(`Processo iniciado (${profile.name})`, { aba: tabId, modo: settings.behavior.mode });
      if (future) {
        this.d.alarms.set(ALARM_SCHEDULED, future);
        this.log.info(`Início agendado para ${new Date(future).toLocaleString('pt-BR')}`);
        return { ok: true, checks, message: 'Agendado' };
      }
      await this.wakeTab(tabId);
      return { ok: true, checks, message: 'Iniciado' };
    });
  }

  async pause(reason = 'Pausado pelo usuário'): Promise<void> {
    await this.command({ type: 'PAUSE', reason });
  }

  async resume(): Promise<boolean> {
    return this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!run.tabId || (run.phase !== 'PAUSED' && run.phase !== 'ERROR' && run.phase !== 'TIMEOUT')) return false;
      const tab = await this.d.tabs.get(run.tabId);
      if (!tab) {
        this.log.warn('Não é possível retomar: a aba da execução foi fechada');
        return false;
      }
      const now = this.d.now();
      // Ações pendentes sem confirmação: o usuário verificou e decidiu continuar.
      let ledger = run.ledger;
      for (const key of pendingActions(ledger)) ledger = resolveAction(ledger, key, 'failed', now, 'liberada pelo usuário ao retomar');
      const res = applyEvent({ ...run, ledger, attempts: 0 }, { type: 'RESUME', reason: 'Retomado pelo usuário' }, now);
      if (!res.ok) return false;
      await this.d.runs.put(res.state, true);
      this.d.setBadge(res.state);
      await this.d.tabs.setAutoDiscardable(run.tabId, false).catch(() => undefined);
      this.d.alarms.set(ALARM_WATCHDOG, now + 30_000, 0.5);
      this.log.info('Execução retomada');
      await this.wakeTab(run.tabId);
      return true;
    });
  }

  async stop(reason = 'Parado pelo usuário'): Promise<void> {
    await this.command({ type: 'STOP', reason });
  }

  /**
   * BOTÃO DE EMERGÊNCIA: grava STOPPED primeiro (nada mais é autorizado),
   * depois cancela timers/observers na aba, libera o lock e salva tudo.
   */
  async emergencyStop(): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      const now = this.d.now();
      const res = applyEvent(run, { type: 'STOP', reason: 'PARADA DE EMERGÊNCIA' }, now);
      await this.d.runs.put(res.state, true);
      await this.afterTerminal(res.state, 'PARADA DE EMERGÊNCIA');
      this.d.alarms.clear(ALARM_SCHEDULED);
      this.log.warn('PARADA DE EMERGÊNCIA acionada — timers, observers e operações canceladas');
      await this.d.logs.flush();
    });
  }

  async reset(): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (run.tabId !== undefined) await this.halt(run.tabId, 'Estado redefinido');
      const res = applyEvent(run, { type: 'RESET' }, this.d.now());
      const clean: RunState = { ...res.state, runId: '', tabId: undefined, profileId: undefined, ledger: {}, attempts: 0, retries: 0, reloads: [], lastError: undefined, errorCount: 0, reason: undefined, lastAction: undefined, page: undefined, startedAt: undefined, endedAt: undefined, scheduledAt: undefined };
      await this.d.runs.put(clean, true);
      this.d.setBadge(clean);
      this.d.alarms.clear(ALARM_WATCHDOG);
      this.d.alarms.clear(ALARM_SCHEDULED);
      this.nextRefreshAt = null;
      this.log.info('Estado redefinido');
    });
  }

  private async command(event: MachineEvent): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      const res = applyEvent(run, event, this.d.now());
      if (!res.ok) {
        this.log.debug(`Comando ignorado: ${res.error}`);
        return;
      }
      await this.d.runs.put(res.state, true);
      if (res.changed) await this.onPhaseChanged(run, res.state);
    });
  }

  // ───────────────────────────── mensagens do content script ─────────────

  async hello(tabId: number, url: string): Promise<HelloResponse> {
    return this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (run.tabId !== tabId || !isActivePhase(run.phase)) return { active: false };
      if (run.scheduledAt && run.scheduledAt > this.d.now()) return { active: false, reason: 'agendado' };
      const settings = await this.d.getSettings();
      const profile = this.d.getProfiles(settings).find((p) => p.id === run.profileId);
      if (!profile) return { active: false, reason: 'perfil removido' };
      let state = run;
      if (run.phase === 'INITIALIZING') {
        const res = applyEvent(run, { type: 'READY', reason: 'Aguardando página' }, this.d.now());
        state = res.state;
        this.log.info('Extensão inicializada na aba', { url: displayUrl(url) });
      }
      state = { ...state, lastHeartbeatAt: this.d.now() };
      await this.d.runs.put(state, state.phase !== run.phase);
      if (state.phase !== run.phase) this.d.setBadge(state);
      return { active: true, snapshot: toSnapshot(state), settings, profile };
    });
  }

  async report(tabId: number, runId: string, event: MachineEvent | null, extras: ReportExtras = {}): Promise<RunSnapshot | null> {
    return this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!this.owns(run, tabId, runId)) return null;
      const now = this.d.now();
      let state: RunState = { ...run, lastHeartbeatAt: now };
      let immediate = false;
      if (extras.page) state = recordPage(state, extras.page.url, extras.page.kind, now);
      if (extras.action) {
        state = recordAction(state, extras.action, now);
        this.log.info(extras.action);
      }
      if (extras.counter) state = { ...state, metrics: increment(state.metrics, extras.counter) };
      if (typeof extras.elementWaitMs === 'number' && extras.elementWaitMs >= 0) {
        state = { ...state, metrics: recordElementWait(state.metrics, extras.elementWaitMs) };
      }
      if (extras.nextRefreshAt !== undefined) this.nextRefreshAt = extras.nextRefreshAt;
      if (extras.error) {
        state = recordError(state, { ...extras.error, at: now });
        immediate = true;
      }
      if (event) {
        const res = applyEvent(state, event, now);
        if (!res.ok) {
          this.log.warn(`Transição ignorada: ${res.error}`);
        } else {
          state = res.state;
          if (PROGRESS_EVENTS.has(event.type)) state = { ...state, attempts: 0 };
          if (event.type === 'RETRY') state = { ...state, attempts: state.attempts + 1 };
          if (res.changed) {
            immediate = true;
            await this.d.runs.put(state, true);
            await this.onPhaseChanged(run, state);
            return toSnapshot(state);
          }
        }
      }
      await this.d.runs.put(state, immediate);
      return toSnapshot(state);
    });
  }

  async claim(tabId: number, runId: string, key: string, url: string) {
    return this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!this.owns(run, tabId, runId)) return { granted: false as const, status: 'confirmed' as const, at: 0 };
      if (!isActivePhase(run.phase)) return { granted: false as const, status: 'confirmed' as const, at: 0 };
      const { ledger, result } = claimAction(run.ledger, key, this.d.now(), displayUrl(url));
      if (result.granted) {
        await this.d.runs.put({ ...run, ledger: pruneLedger(ledger) }, true);
        this.log.debug(`Ação registrada: ${key}`);
      }
      return result;
    });
  }

  async resolve(tabId: number, runId: string, key: string, status: 'confirmed' | 'failed', note?: string): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!this.owns(run, tabId, runId)) return;
      await this.d.runs.put({ ...run, ledger: resolveAction(run.ledger, key, status, this.d.now(), note) }, true);
    });
  }

  /** Autoriza (ou não) um reload, aplicando o teto por hora. */
  async requestReload(tabId: number, runId: string): Promise<boolean> {
    return this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!this.owns(run, tabId, runId) || !isActivePhase(run.phase)) return false;
      const settings = await this.d.getSettings();
      const { state, allowed } = tryReload(run, this.d.now(), settings.behavior.maxReloadsPerHour);
      if (!allowed) {
        const res = applyEvent(state, { type: 'PAUSE', reason: `Limite de ${settings.behavior.maxReloadsPerHour} recarregamentos/hora atingido` }, this.d.now());
        const err = new BotError('RELOAD_LIMIT', 'Teto de recarregamentos por hora atingido').toInfo(this.d.now(), run.phase);
        await this.d.runs.put(recordError(res.state, err), true);
        await this.onPhaseChanged(run, res.state);
        return false;
      }
      this.nextRefreshAt = null;
      await this.d.runs.put({ ...state, metrics: increment(state.metrics, 'reloads') }, false);
      return true;
    });
  }

  async heartbeat(tabId: number, runId: string): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!this.owns(run, tabId, runId)) return;
      await this.d.runs.put({ ...run, lastHeartbeatAt: this.d.now() }, false);
    });
  }

  // ───────────────────────────── eventos do navegador ────────────────────

  async onTabRemoved(tabId: number): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (run.tabId !== tabId || !isActivePhase(run.phase)) return;
      const res = applyEvent(run, { type: 'PAUSE', reason: 'A aba da execução foi fechada' }, this.d.now());
      await this.d.runs.put(res.state, true);
      await this.onPhaseChanged(run, res.state);
    });
  }

  /**
   * Reinício do navegador: o estado é recuperado, mas NUNCA continua sozinho
   * (uma ação crítica poderia ser duplicada). Fica PAUSADO aguardando o usuário.
   */
  async onBrowserStartup(): Promise<void> {
    await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!isActivePhase(run.phase)) return;
      const pending = pendingActions(run.ledger);
      const reason = pending.length
        ? 'Navegador reiniciado com ação pendente de confirmação. Verifique o carrinho antes de retomar.'
        : 'Navegador reiniciado. Verifique a página e use "Retomar" para continuar.';
      const res = applyEvent(run, { type: 'PAUSE', reason }, this.d.now());
      const err = new BotError('BROWSER_RESTARTED', reason).toInfo(this.d.now(), run.phase);
      await this.d.runs.put(recordError(res.state, err), true);
      this.d.setBadge(res.state);
      this.log.warn(reason);
    });
  }

  async onAlarm(name: string): Promise<void> {
    if (name === ALARM_SCHEDULED) await this.onScheduledStart();
    else if (name === ALARM_WATCHDOG) await this.watchdog();
  }

  private async onScheduledStart(): Promise<void> {
    const tabId = await this.mutex.run(async () => {
      const run = await this.d.runs.get();
      if (!isActivePhase(run.phase) || !run.scheduledAt || run.tabId === undefined) return undefined;
      await this.d.runs.put({ ...run, scheduledAt: undefined, reason: 'Horário agendado atingido' }, true);
      this.log.info('Horário agendado atingido — recarregando a página e iniciando');
      return run.tabId;
    });
    if (tabId !== undefined) await this.d.tabs.reload(tabId).catch(() => this.wakeTab(tabId));
  }

  /**
   * Watchdog (chrome.alarms, a cada 30s, só durante execução): detecta aba
   * fechada/descartada, content script travado, refresh atrasado em aba em
   * segundo plano e espera excessiva por ação do usuário.
   */
  async watchdog(): Promise<void> {
    const action = await this.mutex.run(async (): Promise<null | { kind: 'reload' | 'wake'; tabId: number }> => {
      const run = await this.d.runs.get();
      if (!isActivePhase(run.phase) || run.tabId === undefined) {
        this.d.alarms.clear(ALARM_WATCHDOG);
        return null;
      }
      if (run.scheduledAt && run.scheduledAt > this.d.now()) return null;
      const now = this.d.now();
      const settings = await this.d.getSettings();
      const tab = await this.d.tabs.get(run.tabId);
      if (!tab) {
        const res = applyEvent(run, { type: 'PAUSE', reason: 'A aba da execução não existe mais' }, now);
        await this.d.runs.put(res.state, true);
        await this.onPhaseChanged(run, res.state);
        return null;
      }
      if (run.phase === 'WAITING_USER' && settings.behavior.userWaitLimitMin > 0) {
        const since = run.metrics.enteredPhaseAt;
        if (now - since > settings.behavior.userWaitLimitMin * 60_000) {
          const res = applyEvent(run, { type: 'PAUSE', reason: 'Tempo de espera pela ação do usuário esgotado' }, now);
          await this.d.runs.put(res.state, true);
          await this.onPhaseChanged(run, res.state);
          return null;
        }
      }
      // Refresh atrasado (Chrome limita timers de abas em segundo plano).
      if (this.nextRefreshAt && now - this.nextRefreshAt > 20_000 && (run.phase === 'WAITING_AVAILABILITY' || run.phase === 'DETECTING_EVENT')) {
        const { state, allowed } = tryReload(run, now, settings.behavior.maxReloadsPerHour);
        await this.d.runs.put(state, false);
        this.nextRefreshAt = null;
        if (allowed) {
          this.log.info('Atualização atrasada (aba em segundo plano) — recarregando pelo watchdog');
          return { kind: 'reload', tabId: run.tabId };
        }
      }
      const stale = !run.lastHeartbeatAt || now - run.lastHeartbeatAt > settings.timeouts.heartbeatStaleMs;
      if (!stale) return null;
      if (now - this.watchdogRecoveryAt < settings.timeouts.heartbeatStaleMs) {
        // Já tentamos recuperar recentemente e continua sem sinal: pausar com contexto.
        const reason = tab.discarded ? 'A aba foi descartada pelo Chrome' : 'A aba parou de responder';
        const res = applyEvent(run, { type: 'PAUSE', reason: `${reason}. Verifique a página e use "Retomar".` }, now);
        const err = new BotError('CONTENT_UNREACHABLE', reason).toInfo(now, run.phase);
        await this.d.runs.put(recordError(res.state, err), true);
        await this.onPhaseChanged(run, res.state);
        return null;
      }
      this.watchdogRecoveryAt = now;
      this.log.warn('Sem sinal da aba — tentando recuperar', { descartada: !!tab.discarded });
      return { kind: tab.discarded ? 'reload' : 'wake', tabId: run.tabId };
    });
    if (!action) return;
    if (action.kind === 'reload') await this.d.tabs.reload(action.tabId).catch(() => undefined);
    else await this.wakeTab(action.tabId);
  }

  // ───────────────────────────── efeitos colaterais ─────────────────────

  private owns(run: RunState, tabId: number, runId: string): boolean {
    return run.tabId === tabId && run.runId === runId && !!runId;
  }

  private async wakeTab(tabId: number): Promise<void> {
    try {
      await this.d.tabs.send(tabId, { type: 'bg/wake' });
    } catch {
      // Content script ausente (aba aberta antes da instalação/atualização): injeta.
      try {
        await this.d.tabs.inject(tabId);
      } catch (err) {
        this.log.error('Não foi possível ativar o robô na aba', { erro: String(err) });
      }
    }
  }

  private async halt(tabId: number, reason: string, phase?: Phase): Promise<void> {
    await this.d.tabs.send(tabId, { type: 'bg/halt', reason, phase }).catch(() => undefined);
  }

  private async onPhaseChanged(before: RunState, after: RunState): Promise<void> {
    this.d.setBadge(after);
    const reason = after.reason ?? '';
    this.log.debug(`Fase: ${before.phase} → ${after.phase}`, { motivo: reason });
    switch (after.phase) {
      case 'WAITING_USER':
        this.d.notify('user', 'Ação necessária', reason || 'O robô precisa de você na aba do site.');
        if (after.tabId !== undefined) await this.d.tabs.activate(after.tabId).catch(() => undefined);
        break;
      case 'CART':
        this.d.notify('cart', 'Ingresso no carrinho!', reason || 'Finalize a compra.');
        if (after.tabId !== undefined) await this.d.tabs.activate(after.tabId).catch(() => undefined);
        break;
      case 'COMPLETED':
        this.log.success(reason || 'Operação concluída');
        this.d.notify('done', 'Robô finalizado', reason || 'Operação concluída.');
        await this.afterTerminal(after, reason);
        break;
      case 'ERROR':
      case 'TIMEOUT':
        this.log.error(reason || 'Erro');
        this.d.notify('error', 'Robô com erro', reason || 'Veja o diagnóstico.');
        await this.afterTerminal(after, reason);
        break;
      case 'PAUSED':
        this.log.warn(`Pausado: ${reason}`);
        this.d.notify('paused', 'Robô pausado', reason);
        await this.afterTerminal(after, reason);
        break;
      case 'STOPPED':
      case 'IDLE':
        this.log.info(reason || 'Parado');
        await this.afterTerminal(after, reason);
        break;
      default:
        break;
    }
  }

  /** Libera recursos ao sair do modo ativo: timers na aba, alarme, lock de descarte. */
  private async afterTerminal(state: RunState, reason: string): Promise<void> {
    this.d.setBadge(state);
    this.nextRefreshAt = null;
    this.d.alarms.clear(ALARM_WATCHDOG);
    if (state.phase !== 'PAUSED') this.d.alarms.clear(ALARM_SCHEDULED);
    if (state.tabId !== undefined) {
      await this.halt(state.tabId, reason || state.phase, state.phase);
      await this.d.tabs.setAutoDiscardable(state.tabId, true).catch(() => undefined);
    }
  }
}

export function toSnapshot(run: RunState): RunSnapshot {
  return {
    runId: run.runId,
    phase: run.phase,
    reason: run.reason,
    attempts: run.attempts,
    ledger: run.ledger,
    counters: run.metrics.counters,
  };
}

export function isTerminal(phase: Phase): boolean {
  return phase === 'COMPLETED' || phase === 'STOPPED' || phase === 'ERROR' || phase === 'IDLE';
}
