/**
 * Abstração mínima de chrome.storage.* para permitir testes sem navegador.
 * Chaves organizadas: CONFIGURAÇÃO (settings), ESTADO (run) e LOG (logs).
 */
export interface KeyValueArea {
  get<T>(key: string): Promise<T | undefined>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  settings: 'settings',
  run: 'run',
  logs: 'logs',
} as const;

export function chromeArea(area: chrome.storage.StorageArea): KeyValueArea {
  return {
    async get<T>(key: string) {
      const r = await area.get(key);
      return r[key] as T | undefined;
    },
    async set(values) {
      await area.set(values);
    },
    async remove(key) {
      await area.remove(key);
    },
  };
}

/** Implementação em memória (testes). */
export function memoryArea(initial: Record<string, unknown> = {}): KeyValueArea & { data: Record<string, unknown>; writes: number } {
  const store = {
    data: structuredClone(initial),
    writes: 0,
    async get<T>(key: string) {
      const v = store.data[key];
      return v === undefined ? undefined : (structuredClone(v) as T);
    },
    async set(values: Record<string, unknown>) {
      store.writes++;
      for (const [k, v] of Object.entries(values)) store.data[k] = structuredClone(v);
    },
    async remove(key: string) {
      delete store.data[key];
    },
  };
  return store;
}
