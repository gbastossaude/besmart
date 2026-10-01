import type { Phase } from './types';
import { isActivePhase } from './types';

/**
 * Máquina de estados pura. Toda mudança de fase passa por `transition`, que
 * valida a transição. Nada aqui tem efeito colateral: quem aplica o resultado
 * é o RunController (background).
 */

export const MACHINE_EVENTS = [
  'START',
  'READY',
  'PAGE_WAIT',
  'EVENT_LIST',
  'EVENT_PAGE',
  'UNAVAILABLE',
  'AVAILABLE',
  'ADDED_TO_CART',
  'CHECKOUT_REACHED',
  'COMPLETE',
  'NEED_USER',
  'RETRY',
  'TIMEOUT',
  'FAIL',
  'PAUSE',
  'RESUME',
  'STOP',
  'RESET',
] as const;

export type MachineEventType = (typeof MACHINE_EVENTS)[number];

/** Evento da máquina. `reason` é a explicação exibida ao usuário. */
export interface MachineEvent {
  type: MachineEventType;
  reason?: string;
}

export function isMachineEvent(value: unknown): value is MachineEvent {
  const v = value as MachineEvent;
  return !!v && typeof v === 'object' && (MACHINE_EVENTS as readonly string[]).includes(v.type) && (v.reason === undefined || typeof v.reason === 'string');
}

export type TransitionResult =
  | { ok: true; phase: Phase; changed: boolean }
  | { ok: false; phase: Phase; error: string };

type Rule = { from: (p: Phase) => boolean; to: Phase };

const anyOf =
  (...phases: Phase[]) =>
  (p: Phase) =>
    phases.includes(p);
const active = (p: Phase) => isActivePhase(p);
const activeOr =
  (...phases: Phase[]) =>
  (p: Phase) =>
    isActivePhase(p) || phases.includes(p);

/** Tabela de transições. Uma única regra por evento mantém o comportamento previsível. */
const RULES: Record<MachineEventType, Rule> = {
  START: { from: anyOf('IDLE', 'STOPPED', 'COMPLETED', 'ERROR', 'TIMEOUT'), to: 'INITIALIZING' },
  READY: { from: anyOf('INITIALIZING'), to: 'WAITING_PAGE' },
  PAGE_WAIT: { from: active, to: 'WAITING_PAGE' },
  EVENT_LIST: {
    from: anyOf('WAITING_PAGE', 'DETECTING_EVENT', 'WAITING_AVAILABILITY', 'RETRYING', 'WAITING_USER', 'SELECTING'),
    to: 'DETECTING_EVENT',
  },
  EVENT_PAGE: {
    from: anyOf('WAITING_PAGE', 'DETECTING_EVENT', 'WAITING_AVAILABILITY', 'RETRYING', 'WAITING_USER', 'SELECTING'),
    to: 'WAITING_AVAILABILITY',
  },
  UNAVAILABLE: { from: anyOf('WAITING_AVAILABILITY', 'SELECTING', 'DETECTING_EVENT'), to: 'WAITING_AVAILABILITY' },
  AVAILABLE: { from: anyOf('WAITING_AVAILABILITY', 'SELECTING'), to: 'SELECTING' },
  ADDED_TO_CART: {
    from: anyOf('SELECTING', 'WAITING_PAGE', 'WAITING_AVAILABILITY', 'DETECTING_EVENT', 'RETRYING', 'WAITING_USER', 'CART'),
    to: 'CART',
  },
  CHECKOUT_REACHED: { from: anyOf('CART', 'WAITING_PAGE', 'WAITING_USER', 'RETRYING', 'CHECKOUT'), to: 'CHECKOUT' },
  COMPLETE: { from: anyOf('CART', 'CHECKOUT', 'WAITING_USER', 'WAITING_PAGE'), to: 'COMPLETED' },
  NEED_USER: { from: active, to: 'WAITING_USER' },
  RETRY: { from: activeOr('TIMEOUT'), to: 'RETRYING' },
  TIMEOUT: { from: active, to: 'TIMEOUT' },
  FAIL: { from: activeOr('TIMEOUT'), to: 'ERROR' },
  PAUSE: { from: activeOr('TIMEOUT', 'ERROR', 'PAUSED'), to: 'PAUSED' },
  RESUME: { from: anyOf('PAUSED', 'ERROR', 'TIMEOUT'), to: 'WAITING_PAGE' },
  STOP: { from: (p) => p !== 'IDLE', to: 'STOPPED' },
  RESET: { from: () => true, to: 'IDLE' },
};

export function transition(current: Phase, event: MachineEvent): TransitionResult {
  const rule = RULES[event.type];
  if (!rule) return { ok: false, phase: current, error: `Evento desconhecido: ${String(event.type)}` };
  if (rule.to === current) return { ok: true, phase: current, changed: false };
  if (!rule.from(current)) {
    return { ok: false, phase: current, error: `Transição inválida: ${current} --${event.type}--> ${rule.to}` };
  }
  return { ok: true, phase: rule.to, changed: true };
}

export function canTransition(current: Phase, type: MachineEventType): boolean {
  const rule = RULES[type];
  return rule.to === current || rule.from(current);
}

export function targetOf(type: MachineEventType): Phase {
  return RULES[type].to;
}
