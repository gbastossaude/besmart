import type { LogEntry, LogLevel } from './types';
import { LOG_LEVEL_ORDER } from './types';

/** Buffer circular de tamanho fixo: memória limitada para logs. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(private capacity: number) {
    if (capacity < 1) throw new Error('capacity must be >= 1');
  }

  push(...values: T[]): void {
    this.items.push(...values);
    const overflow = this.items.length - this.capacity;
    if (overflow > 0) this.items.splice(0, overflow);
  }

  resize(capacity: number): void {
    this.capacity = Math.max(1, capacity);
    this.push();
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

export type LogSink = (entry: LogEntry) => void;

export interface LoggerOptions {
  debug: boolean;
  /** Espelha no console do navegador (útil em desenvolvimento). */
  console?: boolean;
  now?: () => number;
}

/** Logger com níveis. DEBUG só é emitido quando o modo debug está ligado. */
export class Logger {
  constructor(
    private readonly src: string,
    private readonly sink: LogSink,
    private options: LoggerOptions,
  ) {}

  setDebug(debug: boolean): void {
    this.options = { ...this.options, debug };
  }

  child(src: string): Logger {
    return new Logger(`${this.src}/${src}`, this.sink, this.options);
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.emit('DEBUG', msg, ctx);
  }
  info(msg: string, ctx?: Record<string, unknown>): void {
    this.emit('INFO', msg, ctx);
  }
  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.emit('WARNING', msg, ctx);
  }
  error(msg: string, ctx?: Record<string, unknown>): void {
    this.emit('ERROR', msg, ctx);
  }
  success(msg: string, ctx?: Record<string, unknown>): void {
    this.emit('SUCCESS', msg, ctx);
  }

  private emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (level === 'DEBUG' && !this.options.debug) return;
    const entry: LogEntry = { t: (this.options.now ?? Date.now)(), level, src: this.src, msg };
    if (ctx && Object.keys(ctx).length > 0) entry.ctx = sanitizeContext(ctx);
    if (this.options.console) {
      const line = `[${level}] ${this.src}: ${msg}`;
      if (level === 'ERROR') console.error(line, ctx ?? '');
      else if (level === 'WARNING') console.warn(line, ctx ?? '');
      else console.log(line, ctx ?? '');
    }
    this.sink(entry);
  }
}

const MAX_CTX_STRING = 300;

/** Remove valores grandes/sensíveis do contexto antes de persistir. */
export function sanitizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (/pass|senha|token|cookie|authorization|cpf|document/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') out[key] = value.length > MAX_CTX_STRING ? `${value.slice(0, MAX_CTX_STRING)}…` : value;
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
    else if (value === undefined) continue;
    else {
      try {
        const json = JSON.stringify(value);
        out[key] = json.length > MAX_CTX_STRING ? `${json.slice(0, MAX_CTX_STRING)}…` : JSON.parse(json);
      } catch {
        out[key] = String(value);
      }
    }
  }
  return out;
}

export function filterLogs(entries: LogEntry[], minLevel: LogLevel): LogEntry[] {
  const min = LOG_LEVEL_ORDER[minLevel];
  return entries.filter((e) => LOG_LEVEL_ORDER[e.level] >= min);
}

export function formatLog(entry: LogEntry): string {
  const time = new Date(entry.t).toLocaleTimeString('pt-BR', { hour12: false });
  return `${time} [${entry.level}] ${entry.msg}`;
}
