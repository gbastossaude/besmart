import { AbortedError } from './errors';

/**
 * Dono único de timers, observers e listeners de um ciclo de execução.
 * `dispose()` cancela tudo de uma vez (botão de emergência, pausa, troca de
 * página), evitando timers órfãos, observers duplicados e vazamento de memória.
 */
export class Scheduler {
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly observers = new Set<MutationObserver>();
  private readonly cleanups = new Set<() => void>();
  private readonly controller = new AbortController();
  private disposed = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** setTimeout rastreado. Retorna função de cancelamento. */
  timeout(fn: () => void, ms: number): () => void {
    if (this.disposed) return () => undefined;
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      if (!this.disposed) fn();
    }, Math.max(0, ms));
    this.timers.add(handle);
    return () => {
      clearTimeout(handle);
      this.timers.delete(handle);
    };
  }

  /**
   * Execução periódica sem sobreposição: o próximo ciclo só é agendado depois
   * que o anterior termina (inclusive se for assíncrono).
   */
  every(ms: number, fn: () => void | Promise<void>): () => void {
    let stopped = false;
    let cancelCurrent: () => void = () => undefined;
    const loop = () => {
      cancelCurrent = this.timeout(async () => {
        if (stopped) return;
        try {
          await fn();
        } finally {
          if (!stopped && !this.disposed) loop();
        }
      }, ms);
    };
    loop();
    return () => {
      stopped = true;
      cancelCurrent();
    };
  }

  observe(target: Node, options: MutationObserverInit, callback: MutationCallback): () => void {
    if (this.disposed) return () => undefined;
    const observer = new MutationObserver(callback);
    observer.observe(target, options);
    this.observers.add(observer);
    return () => {
      observer.disconnect();
      this.observers.delete(observer);
    };
  }

  listen<K extends string>(
    target: EventTarget,
    type: K,
    handler: (ev: Event) => void,
    options?: AddEventListenerOptions,
  ): () => void {
    if (this.disposed) return () => undefined;
    target.addEventListener(type, handler, options);
    const cleanup = () => {
      target.removeEventListener(type, handler, options);
      this.cleanups.delete(cleanup);
    };
    this.cleanups.add(cleanup);
    return cleanup;
  }

  /** Registra limpeza arbitrária executada no dispose. */
  onDispose(fn: () => void): void {
    if (this.disposed) {
      fn();
      return;
    }
    this.cleanups.add(fn);
  }

  /** Espera cancelável: rejeita com AbortedError no dispose. */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new AbortedError());
        return;
      }
      const cancel = this.timeout(() => {
        this.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        cancel();
        reject(new AbortedError());
      };
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  stats(): { timers: number; observers: number; cleanups: number; disposed: boolean } {
    return { timers: this.timers.size, observers: this.observers.size, cleanups: this.cleanups.size, disposed: this.disposed };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const o of this.observers) o.disconnect();
    this.observers.clear();
    for (const c of [...this.cleanups]) {
      try {
        c();
      } catch {
        /* limpeza nunca deve impedir as demais */
      }
    }
    this.cleanups.clear();
  }
}

/**
 * Garante uma única execução simultânea de uma função assíncrona.
 * Chamadas durante a execução são coalescidas em UMA nova execução ao final.
 */
export class SingleFlight {
  private running = false;
  private pending = false;

  constructor(private readonly fn: () => Promise<void>) {}

  get busy(): boolean {
    return this.running;
  }

  async run(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.pending = false;
        await this.fn();
      } while (this.pending);
    } finally {
      this.running = false;
    }
  }
}

/** Debounce simples ligado a um Scheduler (cancelado no dispose). */
export function debounce(scheduler: Scheduler, ms: number, fn: () => void): () => void {
  let cancel: (() => void) | null = null;
  return () => {
    cancel?.();
    cancel = scheduler.timeout(() => {
      cancel = null;
      fn();
    }, ms);
  };
}
