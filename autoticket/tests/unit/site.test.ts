// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PageContext, detectPage } from '../../src/site/detectors';
import { rankCandidates, resolveAll, resolveClickable } from '../../src/site/selectors';
import { maxAllowed, setQuantity } from '../../src/site/actions';
import { Scheduler } from '../../src/core/scheduler';
import type { SiteProfile } from '../../src/site/types';
import { waitForCondition } from '../../src/utils/dom';

const profile: SiteProfile = {
  id: 'test',
  name: 'Teste',
  version: 1,
  hosts: ['mock.test'],
  pages: { eventList: ['/events'], event: ['/event'], cart: ['/cart'], checkout: ['/checkout'], login: ['/login'] },
  dom: { loading: [{ css: '#loading' }], blocked: [{ css: '#blocked' }] },
  texts: { soldOut: ['esgotado'] },
  steps: [],
};

const detect = (url: string) => detectPage(profile, new PageContext(document, url)).kind;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('detecção de página', () => {
  it('classifica por URL', () => {
    document.body.innerHTML = '<main>conteúdo</main>';
    expect(detect('https://mock.test/event/1')).toBe('EVENT');
    expect(detect('https://mock.test/cart')).toBe('CART');
    expect(detect('https://mock.test/checkout')).toBe('CHECKOUT');
    expect(detect('https://mock.test/events')).toBe('EVENT_LIST');
    expect(detect('https://mock.test/login')).toBe('LOGIN');
    expect(detect('https://mock.test/outra')).toBe('UNKNOWN');
  });

  it('sinais de proteção vencem sinais de fluxo (nunca agir sobre desafio)', () => {
    document.body.innerHTML = '<main>Evento</main><iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?k=1&size=normal"></iframe>';
    expect(detect('https://mock.test/event/1')).toBe('CHALLENGE');
    document.body.innerHTML = '<p>Please confirm you are human</p>';
    expect(detect('https://mock.test/event/1')).toBe('CHALLENGE');
    document.body.innerHTML = '<p>Acesso bloqueado</p>';
    expect(detect('https://mock.test/event/1')).toBe('BLOCKED');
    document.body.innerHTML = '<div id="blocked">x</div>';
    expect(detect('https://mock.test/event/1')).toBe('BLOCKED');
  });

  it('ignora o selo invisível do reCAPTCHA v3', () => {
    document.body.innerHTML = '<main>Evento</main><div class="grecaptcha-badge"><iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?k=1&size=invisible"></iframe></div>';
    expect(detect('https://mock.test/event/1')).toBe('EVENT');
  });

  it('fila virtual por URL e por texto', () => {
    document.body.innerHTML = '<p>Aguarde</p>';
    expect(detect('https://mock.queue-it.net/?c=x')).toBe('QUEUE');
    document.body.innerHTML = '<p>Sua posição na fila: 123</p>';
    expect(detect('https://mock.test/event/1')).toBe('QUEUE');
  });

  it('página de erro do servidor e página em branco/carregando', () => {
    document.body.innerHTML = '<h1>503 Service Unavailable</h1>';
    expect(detect('https://mock.test/event/1')).toBe('ERROR_PAGE');
    document.body.innerHTML = '';
    expect(detect('https://mock.test/event/1')).toBe('LOADING');
    document.body.innerHTML = '<div id="loading">...</div><main>x</main>';
    expect(detect('https://mock.test/event/1')).toBe('LOADING');
  });

  it('lê o texto da página no máximo uma vez por ciclo', () => {
    document.body.innerHTML = '<main>Evento</main>';
    const ctx = new PageContext(document, 'https://mock.test/event');
    const first = ctx.bodyText;
    document.body.innerHTML = '<main>mudou</main>';
    expect(ctx.bodyText).toBe(first);
  });
});

describe('seletores com fallback', () => {
  it('usa fallback quando o seletor principal some e informa a estratégia', () => {
    document.body.innerHTML = '<button class="new-btn">Adicionar ao carrinho</button>';
    const r = resolveAll(document, [{ css: '#old-id' }, { css: 'button', text: ['adicionar'] }]);
    expect(r.strategy).toBe(1);
    expect(r.elements).toHaveLength(1);
  });

  it('exige texto quando definido e ignora elementos ocultos/desabilitados', () => {
    document.body.innerHTML = `
      <button style="display:none">Comprar</button>
      <button disabled>Comprar</button>
      <div hidden><button>Comprar</button></div>
      <button>Voltar</button>`;
    const r = resolveClickable(document, [{ css: 'button', text: ['comprar'] }]);
    expect(r.element).toBeNull();
    expect(r.disabled).toBe(true);
  });

  it('ranqueia por prioridade do usuário e marca esgotados', () => {
    document.body.innerHTML = `
      <div class="s"><span class="n">Sul</span></div>
      <div class="s"><span class="n">Norte</span> ESGOTADO</div>
      <div class="s"><span class="n">Leste Inferior</span></div>
      <div class="s"><span class="n">Oeste</span></div>`;
    const items = resolveAll(document, [{ css: '.s' }]).elements;
    const ranked = rankCandidates(items, ['Norte', 'Leste', 'Sul'], { textIn: '.n', soldOutTexts: ['esgotado'] });
    expect(ranked.map((c) => [c.text, c.soldOut])).toEqual([
      ['Norte', true],
      ['Leste Inferior', false],
      ['Sul', false],
    ]);
    expect(rankCandidates(items, [], { textIn: '.n', soldOutTexts: [] })).toHaveLength(4);
  });
});

describe('quantidade', () => {
  it('respeita o limite do select (nunca excede o site)', async () => {
    document.body.innerHTML = '<select id="q"><option value="1">1</option><option value="2">2</option></select>';
    const sel = document.querySelector('select')!;
    expect(maxAllowed(sel)).toBe(2);
    const s = new Scheduler();
    const r = await setQuantity(document, 4, { input: [{ css: '#q' }] }, s);
    expect(r).toMatchObject({ ok: true, applied: 2, capped: true, method: 'select' });
    expect(sel.value).toBe('2');
    s.dispose();
  });

  it('usa botão + até atingir a quantidade', async () => {
    document.body.innerHTML = '<input type="number" value="0"><button class="plus">+</button>';
    const input = document.querySelector('input')!;
    document.querySelector('.plus')!.addEventListener('click', () => (input.value = String(Number(input.value) + 1)));
    const s = new Scheduler();
    const r = await setQuantity(document, 3, { increment: [{ css: '.plus' }] }, s);
    expect(r).toMatchObject({ ok: true, applied: 3, method: 'increment' });
    s.dispose();
  });
});

describe('espera orientada a eventos (MutationObserver)', () => {
  it('resolve quando o elemento aparece com atraso', async () => {
    setTimeout(() => (document.body.innerHTML = '<b id="x">ok</b>'), 30);
    const el = await waitForCondition(() => document.querySelector('#x'), { timeoutMs: 1000 });
    expect(el?.id).toBe('x');
  });

  it('expira com erro classificado quando o elemento não aparece', async () => {
    await expect(waitForCondition(() => document.querySelector('#nunca'), { timeoutMs: 50, description: 'botão' })).rejects.toMatchObject({
      code: 'ELEMENT_TIMEOUT',
      kind: 'transient',
    });
  });

  it('é cancelável por AbortSignal', async () => {
    const ac = new AbortController();
    const p = waitForCondition(() => null, { timeoutMs: 10_000, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
