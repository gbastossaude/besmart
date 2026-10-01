import type { SiteProfile } from '../types';
import { hostMatches } from '../../utils/url';
import eleventickets from './eleventickets.json';
import futebolcard from './futebolcard.json';
import ticketmasterBr from './ticketmaster-br.json';
import eventimBr from './eventim-br.json';
import fieltorcedor from './fieltorcedor.json';
import wgl from './wgl.json';
import totalacesso from './totalacesso.json';
import bilheteriadigital from './bilheteriadigital.json';

/** Perfis embutidos. Para adicionar um site, crie um JSON aqui (ou um perfil personalizado nas Opções). */
export const BUILTIN_PROFILES: SiteProfile[] = [
  eleventickets,
  futebolcard,
  ticketmasterBr,
  eventimBr,
  fieltorcedor,
  wgl,
  totalacesso,
  bilheteriadigital,
] as SiteProfile[];

/** Hosts auxiliares onde o robô apenas OBSERVA (ex.: fila virtual), sem agir. */
export const OBSERVE_ONLY_HOSTS = ['queue-it.net'];

export interface ProfileSource {
  builtins: SiteProfile[];
  custom: SiteProfile[];
  disabled: string[];
}

/** Lista efetiva: personalizados substituem embutidos de mesmo id; desativados saem. */
export function effectiveProfiles(src: ProfileSource): SiteProfile[] {
  const byId = new Map<string, SiteProfile>();
  for (const p of src.builtins) byId.set(p.id, p);
  for (const p of src.custom) byId.set(p.id, p);
  return [...byId.values()].filter((p) => !src.disabled.includes(p.id));
}

export function findProfileForHost(profiles: SiteProfile[], hostname: string): SiteProfile | undefined {
  return profiles.find((p) => p.hosts.some((h) => hostMatches(hostname, h)));
}
