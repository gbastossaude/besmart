// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, effectiveProfiles, findProfileForHost } from '../../src/site/profiles';
import { DEFAULT_SETTINGS, LIMITS, normalizeSettings, validateProfile, validateSettings } from '../../src/storage/schema';
import { parseContentMessage, parseUiMessage } from '../../src/extension/shared/messages';
import { containsAny, firstMatchIndex, normalizeText, splitList } from '../../src/utils/text';
import { displayUrl, hostMatches, hostToMatchPatterns, matchUrlRule } from '../../src/utils/url';
import e2eProfile from '../e2e/mock-profile.json';

describe('configuração', () => {
  it('normaliza dados vazios para os padrões', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('lixo')).toEqual(DEFAULT_SETTINGS);
  });

  it('aplica limites de segurança (sem polling agressivo)', () => {
    const s = normalizeSettings({ target: { quantity: 99 }, behavior: { refreshIntervalSec: 1, maxReloadsPerHour: 10_000 }, retry: { maxAttempts: 0 } });
    expect(s.target.quantity).toBe(LIMITS.quantity[1]);
    expect(s.behavior.refreshIntervalSec).toBe(LIMITS.refreshIntervalSec[0]);
    expect(s.behavior.maxReloadsPerHour).toBe(LIMITS.maxReloadsPerHour[1]);
    expect(s.retry.maxAttempts).toBe(1);
  });

  it('descarta campos desconhecidos e tipos errados', () => {
    const s = normalizeSettings({ hack: 1, target: { sectors: 'Norte', quantity: 'abc' }, behavior: { mode: 'turbo' } });
    expect((s as unknown as Record<string, unknown>).hack).toBeUndefined();
    expect(s.target.sectors).toEqual([]);
    expect(s.target.quantity).toBe(1);
    expect(s.behavior.mode).toBe('live');
  });

  it('valida URL do evento e agendamento', () => {
    expect(validateSettings(normalizeSettings({ target: { eventUrl: 'http://x.com' } }))).toHaveLength(1);
    expect(validateSettings(normalizeSettings({ behavior: { scheduledStart: 'amanhã' } }))).toHaveLength(1);
    expect(validateSettings(DEFAULT_SETTINGS)).toHaveLength(0);
  });

  it('descarta perfis personalizados inválidos', () => {
    const s = normalizeSettings({ profiles: { custom: [{ id: 'X X' }, e2eProfile] } });
    expect(s.profiles.custom).toHaveLength(0); // 127.0.0.1 não é domínio válido para perfil de usuário
  });
});

describe('perfis embutidos', () => {
  it.each(BUILTIN_PROFILES.map((p) => [p.id, p] as const))('perfil %s é válido', (_id, p) => {
    expect(validateProfile(p)).toEqual([]);
    expect(p.steps.filter((s) => s.kind === 'click' && s.critical)).toHaveLength(1);
  });

  it('ids e domínios não colidem', () => {
    const ids = BUILTIN_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const hosts = BUILTIN_PROFILES.flatMap((p) => p.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it('acha perfil por subdomínio e respeita desativados/personalizados', () => {
    expect(findProfileForHost(BUILTIN_PROFILES, 'vasco.eleventickets.com')?.id).toBe('eleventickets');
    expect(findProfileForHost(BUILTIN_PROFILES, 'www.ticketmaster.com.br')?.id).toBe('ticketmaster-br');
    expect(findProfileForHost(BUILTIN_PROFILES, 'evil-ticketmaster.com.br')).toBeUndefined();
    const custom = { ...BUILTIN_PROFILES[0]!, name: 'Meu' };
    const eff = effectiveProfiles({ builtins: BUILTIN_PROFILES, custom: [custom], disabled: ['eventim-br'] });
    expect(eff.find((p) => p.id === custom.id)?.name).toBe('Meu');
    expect(eff.find((p) => p.id === 'eventim-br')).toBeUndefined();
  });

  it('validação aponta erros úteis', () => {
    const errs = validateProfile({ id: 'ok-id', name: 'x', hosts: ['nao dominio'], pages: { event: ['re:('] }, steps: [{ id: 'a', kind: 'pick', items: [{ css: '###' }], source: 'sectors' }, { id: 'a', kind: 'zzz' }] });
    expect(errs.join('\n')).toMatch(/hosts\[0\]/);
    expect(errs.join('\n')).toMatch(/regra inválida/);
    expect(errs.join('\n')).toMatch(/CSS inválido/);
    expect(errs.join('\n')).toMatch(/duplicado/);
    expect(errs.join('\n')).toMatch(/kind/);
  });
});

describe('texto e URL', () => {
  it('normaliza acentos, caixa e espaços', () => {
    expect(normalizeText('  Leste   INFERIOR – Ação ')).toBe('leste inferior – acao');
    expect(containsAny('Setor NORTE (esgotado)', ['norte'])).toBe(true);
    expect(containsAny('qualquer', [])).toBe(false);
    expect(firstMatchIndex('Sul Superior', ['Norte', 'sul', '*'])).toBe(1);
    expect(firstMatchIndex('Oeste', ['Norte', '*'])).toBe(1);
    expect(splitList('a, b\nc;;')).toEqual(['a', 'b', 'c']);
  });

  it('regras de URL (substring e regex)', () => {
    expect(matchUrlRule('https://x.com/#!/carrinho', '#!/carrinho')).toBe(true);
    expect(matchUrlRule('https://x.com/', 're:\\.com/?$')).toBe(true);
    expect(matchUrlRule('https://x.com/a', 're:(')).toBe(false);
    expect(hostMatches('ingressos.flamengo.com.br', 'flamengo.com.br')).toBe(true);
    expect(hostMatches('flamengo.com.br.evil.com', 'flamengo.com.br')).toBe(false);
    expect(hostToMatchPatterns('www.site.com')).toEqual(['https://*.site.com/*']);
    expect(displayUrl('https://a.com/p?token=123#x')).toBe('a.com/p');
  });
});

describe('validação de mensagens', () => {
  it('rejeita mensagens malformadas', () => {
    expect(parseContentMessage(null)).toBeNull();
    expect(parseContentMessage({ type: 'run/report', runId: 'r', event: { type: 'EVIL' } })).toBeNull();
    expect(parseContentMessage({ type: 'run/resolve', runId: 'r', key: 'k', status: 'whatever' })).toBeNull();
    expect(parseContentMessage({ type: 'run/claim', runId: 'r', key: 'x'.repeat(500), url: 'u' })).toBeNull();
    expect(parseUiMessage({ type: 'ui/start', tabId: '1' })).toBeNull();
    expect(parseUiMessage({ type: 'run/report' })).toBeNull();
  });

  it('aceita mensagens válidas', () => {
    expect(parseContentMessage({ type: 'run/report', runId: 'r', event: { type: 'PAUSE', reason: 'x' } })).toMatchObject({ type: 'run/report' });
    expect(parseUiMessage({ type: 'ui/start', tabId: 4 })).toEqual({ type: 'ui/start', tabId: 4 });
  });
});
