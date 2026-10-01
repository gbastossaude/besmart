import type { ClaimResult } from '../../core/lock';
import type { MachineEvent } from '../../core/machine';
import { isMachineEvent } from '../../core/machine';
import type { MetricsSummary } from '../../core/metrics';
import type { DisplayStatus, LogEntry, Phase, RunState } from '../../core/types';
import type { ReportExtras, RunSnapshot } from '../../site/flows';
import type { SiteProfile } from '../../site/types';
import type { Settings } from '../../storage/schema';

/**
 * Protocolo de mensagens tipado entre content ⇄ background ⇄ popup/options.
 * Toda mensagem recebida é validada (`parse*`) antes de ser usada.
 */

// ── content → background ──
export type ContentMessage =
  | { type: 'content/hello'; url: string }
  | { type: 'run/report'; runId: string; event: MachineEvent | null; extras?: ReportExtras }
  | { type: 'run/claim'; runId: string; key: string; url: string }
  | { type: 'run/resolve'; runId: string; key: string; status: 'confirmed' | 'failed'; note?: string }
  | { type: 'run/reload'; runId: string }
  | { type: 'run/heartbeat'; runId: string }
  | { type: 'log/batch'; entries: LogEntry[] };

export type HelloResponse =
  | { active: true; snapshot: RunSnapshot; settings: Settings; profile: SiteProfile }
  | { active: false; reason?: string };

export type ClaimResponse = ClaimResult;

// ── popup/options → background ──
export type UiMessage =
  | { type: 'ui/status' }
  | { type: 'ui/start'; tabId: number }
  | { type: 'ui/pause' }
  | { type: 'ui/resume' }
  | { type: 'ui/stop' }
  | { type: 'ui/emergency' }
  | { type: 'ui/reset' }
  | { type: 'ui/test-selectors'; tabId: number }
  | { type: 'ui/logs' }
  | { type: 'ui/clear-logs' }
  | { type: 'ui/check'; tabId: number }
  | { type: 'ui/request-permission-done' };

export interface CheckItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface StartResponse {
  ok: boolean;
  checks: CheckItem[];
  message: string;
}

export interface StatusResponse {
  run: RunState;
  display: DisplayStatus;
  summary: MetricsSummary;
  profileName?: string;
  now: number;
  /** Próxima atualização programada da página (ms epoch). */
  nextRefreshAt?: number | null;
}

export interface SelectorReport {
  profileId: string;
  url: string;
  pageKind: string;
  signal: string;
  steps: Array<{ id: string; label: string; kind: string; found: number; strategy: number; candidates?: string[] }>;
}

// ── background → content ──
export type BackgroundMessage =
  | { type: 'bg/wake' }
  | { type: 'bg/halt'; reason: string; phase?: Phase }
  | { type: 'bg/ping' }
  | { type: 'bg/test-selectors'; profile: SiteProfile; settings: Settings };

// ── validação ──

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

const str = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;

export function parseContentMessage(raw: unknown): ContentMessage | null {
  if (!isObj(raw) || typeof raw.type !== 'string') return null;
  switch (raw.type) {
    case 'content/hello':
      return str(raw.url, 4000) ? { type: raw.type, url: raw.url } : null;
    case 'run/report':
      if (!str(raw.runId, 100)) return null;
      if (raw.event !== null && !isMachineEvent(raw.event)) return null;
      if (raw.extras !== undefined && !isObj(raw.extras)) return null;
      return { type: raw.type, runId: raw.runId, event: raw.event as MachineEvent | null, extras: raw.extras as ReportExtras | undefined };
    case 'run/claim':
      return str(raw.runId, 100) && str(raw.key, 100) && str(raw.url, 4000) ? { type: raw.type, runId: raw.runId, key: raw.key, url: raw.url } : null;
    case 'run/resolve':
      if (!str(raw.runId, 100) || !str(raw.key, 100)) return null;
      if (raw.status !== 'confirmed' && raw.status !== 'failed') return null;
      return { type: raw.type, runId: raw.runId, key: raw.key, status: raw.status, note: str(raw.note, 300) ? raw.note : undefined };
    case 'run/reload':
    case 'run/heartbeat':
      return str(raw.runId, 100) ? { type: raw.type, runId: raw.runId } : null;
    case 'log/batch':
      return Array.isArray(raw.entries) ? { type: raw.type, entries: (raw.entries as LogEntry[]).slice(0, 200) } : null;
    default:
      return null;
  }
}

export function parseUiMessage(raw: unknown): UiMessage | null {
  if (!isObj(raw) || typeof raw.type !== 'string' || !raw.type.startsWith('ui/')) return null;
  switch (raw.type) {
    case 'ui/start':
    case 'ui/test-selectors':
    case 'ui/check':
      return typeof raw.tabId === 'number' && Number.isInteger(raw.tabId) ? ({ type: raw.type, tabId: raw.tabId } as UiMessage) : null;
    case 'ui/status':
    case 'ui/pause':
    case 'ui/resume':
    case 'ui/stop':
    case 'ui/emergency':
    case 'ui/reset':
    case 'ui/logs':
    case 'ui/clear-logs':
    case 'ui/request-permission-done':
      return { type: raw.type } as UiMessage;
    default:
      return null;
  }
}
