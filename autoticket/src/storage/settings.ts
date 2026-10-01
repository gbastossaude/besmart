import type { KeyValueArea } from './area';
import { STORAGE_KEYS } from './area';
import type { Settings } from './schema';
import { normalizeSettings } from './schema';

export async function loadSettings(area: KeyValueArea): Promise<Settings> {
  return normalizeSettings(await area.get(STORAGE_KEYS.settings));
}

export async function saveSettings(area: KeyValueArea, value: unknown): Promise<Settings> {
  const normalized = normalizeSettings(value);
  await area.set({ [STORAGE_KEYS.settings]: normalized });
  return normalized;
}
