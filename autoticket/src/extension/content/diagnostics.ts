import { PageContext, detectPage } from '../../site/detectors';
import { rankCandidates, resolveAll } from '../../site/selectors';
import type { SiteProfile } from '../../site/types';
import type { Settings } from '../../storage/schema';
import { highlight } from '../../utils/dom';
import type { SelectorReport } from '../shared/messages';

/**
 * Teste de seletores (sem clicar em nada): classifica a página, mostra quantos
 * elementos cada passo encontra, qual estratégia (principal/fallback) funcionou
 * e destaca os elementos por alguns segundos. Ferramenta para adaptar perfis.
 */
export function runSelectorTest(doc: Document, url: string, profile: SiteProfile, settings: Settings): SelectorReport {
  const detection = detectPage(profile, new PageContext(doc, url));
  const cleanups: Array<() => void> = [];
  const steps: SelectorReport['steps'] = profile.steps.map((step) => {
    const sels = step.kind === 'pick' ? step.items : step.kind === 'click' ? step.target : step.kind === 'wait' ? step.for : [...(step.input ?? []), ...(step.increment ?? [])];
    const r = resolveAll(doc, sels);
    r.elements.slice(0, 20).forEach((el) => cleanups.push(highlight(el, step.label, step.kind === 'click' && step.critical ? '#dc2626' : '#2563eb')));
    let candidates: string[] | undefined;
    if (step.kind === 'pick') {
      const prefs = step.source === 'sectors' ? settings.target.sectors : step.source === 'categories' ? settings.target.categories : step.source === 'events' ? settings.target.eventKeywords : [];
      candidates = rankCandidates(r.elements, prefs, { textIn: step.textIn, soldOutTexts: profile.texts?.soldOut ?? [] })
        .slice(0, 10)
        .map((c) => `${c.soldOut ? '✗ ' : '✓ '}${c.text.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
    return { id: step.id, label: step.label, kind: step.kind, found: r.elements.length, strategy: r.strategy, candidates };
  });
  setTimeout(() => cleanups.forEach((c) => c()), 8000);
  return { profileId: profile.id, url, pageKind: detection.kind, signal: detection.signal, steps };
}
