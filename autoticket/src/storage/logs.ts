import { RingBuffer } from '../core/logger';
import type { LogEntry } from '../core/types';
import type { KeyValueArea } from './area';
import { STORAGE_KEYS } from './area';

/**
 * LOG persistente com limite fixo (ring buffer). Escritas agrupadas a cada
 * `flushDelayMs` — o log nunca cresce indefinidamente nem grava a cada linha.
 */
export class LogStore {
  private buffer: RingBuffer<LogEntry>;
  private loaded: Promise<void> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly area: KeyValueArea,
    capacity: number,
    private readonly flushDelayMs = 1500,
  ) {
    this.buffer = new RingBuffer<LogEntry>(capacity);
  }

  private ensureLoaded(): Promise<void> {
    this.loaded ??= (async () => {
      const saved = await this.area.get<LogEntry[]>(STORAGE_KEYS.logs);
      if (Array.isArray(saved)) {
        const current = this.buffer.toArray();
        this.buffer.clear();
        this.buffer.push(...saved.filter(isLogEntry), ...current);
      }
    })();
    return this.loaded;
  }

  setCapacity(capacity: number): void {
    this.buffer.resize(capacity);
  }

  append(...entries: LogEntry[]): void {
    this.buffer.push(...entries);
    this.flushTimer ??= setTimeout(() => void this.flush(), this.flushDelayMs);
  }

  async all(): Promise<LogEntry[]> {
    await this.ensureLoaded();
    return this.buffer.toArray();
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.ensureLoaded();
    await this.area.set({ [STORAGE_KEYS.logs]: this.buffer.toArray() });
  }

  async clear(): Promise<void> {
    this.buffer.clear();
    this.loaded = Promise.resolve();
    await this.area.set({ [STORAGE_KEYS.logs]: [] });
  }
}

export function isLogEntry(v: unknown): v is LogEntry {
  const e = v as LogEntry;
  return !!e && typeof e.t === 'number' && typeof e.msg === 'string' && typeof e.level === 'string';
}
