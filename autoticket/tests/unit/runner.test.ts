// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Runner } from '../../src/site/flows';
import { createHarness, disposeAllRunners, eventPage, sectorsHtml, until } from './harness';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  disposeAllRunners();
  vi.useRealTimers();
});

/** Instala o comportamento do botão "adicionar" na página simulada. */
function wireAdd(mode: 'ok' | 'reject-first' | 'silent' | 'badge', counter: { adds: number }) {
  document.querySelector('#add')!.addEventListener('click', () => {
    counter.adds++;
    const fb = document.querySelector('#feedback')!;
    if (mode === 'reject-first' && counter.adds === 1) {
      setTimeout(() => (fb.innerHTML = '<div role="alert">Limite atingido para este setor</div>'), 100);
      return;
    }
    if (mode === 'silent') return;
    if (mode === 'badge') {
      setTimeout(() => document.querySelector('#cart-count')!.setAttribute('data-count', '1'), 100);
      return;
    }
    setTimeout(() => (fb.innerHTML = '<div role="alert">Adicionado ao carrinho!</div>'), 100);
  });
}

describe('Runner + Controller (fluxo completo, sem Chrome)', () => {
  it('fluxo feliz: disponível → seleciona → adiciona UMA vez → carrinho → checkout → concluído', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Leste' }, { name: 'Sul' }, { name: 'Norte' }] });
    const counter = { adds: 0 };
    wireAdd('ok', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'CART');
    expect(counter.adds).toBe(1);
    expect((document.querySelector('#qty') as HTMLSelectElement).value).toBe('2');
    const s = await h.state();
    expect(s.ledger['critical#1']?.status).toBe('confirmed');
    expect(s.lastAction).toMatch(/Adicionar ao carrinho/);
    // Prioridade: "Norte" é a 1ª preferência, mesmo sendo o último no DOM.
    expect(h.logs.some((l) => /Setor: Norte/.test(l.msg))).toBe(true);

    await h.navigate('https://mock.test/cart', '<a id="go-checkout" href="#">Finalizar</a>');
    document.querySelector('#go-checkout')!.addEventListener('click', () => {
      setTimeout(() => {
        h.location.href = 'https://mock.test/checkout';
        document.body.innerHTML = '<h1>Pagamento</h1>';
      }, 100);
    });
    await until(async () => (await h.state()).phase === 'COMPLETED');
    expect((await h.state()).reason).toMatch(/pagamento manualmente/);
    expect(h.sent.some((m) => m.type === 'bg/halt')).toBe(true);
    expect(h.runner?.isStopped).toBe(true);
    expect(h.runner?.schedulerStats()).toMatchObject({ timers: 0, observers: 0, disposed: true });
  });

  it('elementos atrasados (SPA): reage à mutação do DOM sem polling e sem recarregar', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ opener: true });
    const counter = { adds: 0 };
    wireAdd('ok', counter);
    document.querySelector('#open-picker')!.addEventListener('click', () => {
      setTimeout(() => (document.querySelector('#picker')!.innerHTML = sectorsHtml([{ name: 'Norte' }])), 600);
    });
    await h.start();
    await until(async () => (await h.state()).phase === 'CART');
    expect(counter.adds).toBe(1);
    expect(h.location.reloads).toBe(0);
  });

  it('indisponível: aguarda e agenda UM refresh no intervalo configurado; disponibilidade por mutação cancela o refresh', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    const counter = { adds: 0 };
    wireAdd('ok', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    await vi.advanceTimersByTimeAsync(9_000);
    expect(h.location.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(h.location.reloads).toBe(1);
    // nova página (reload) ainda esgotada → mais um ciclo; depois libera via DOM
    const r = await h.navigate('https://mock.test/event/1', eventPage({ sectors: [{ name: 'Norte', soldOut: true }] }));
    wireAdd('ok', counter);
    expect(r).not.toBeNull();
    await vi.advanceTimersByTimeAsync(3_000);
    document.querySelector('#picker')!.innerHTML = sectorsHtml([{ name: 'Norte' }]);
    await until(async () => (await h.state()).phase === 'CART');
    expect(h.location.reloads).toBe(1);
    expect(counter.adds).toBe(1);
    expect((await h.state()).reloads).toHaveLength(1);
  });

  it('CAPTCHA: pausa em WAITING_USER, não interage, e retoma sozinho quando resolvido', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage() + '<div id="form_captcha"><img id="img_captcha"><button id="captcha-btn">ok</button></div>';
    const captchaClicks = vi.fn();
    document.querySelector('#captcha-btn')!.addEventListener('click', captchaClicks);
    const counter = { adds: 0 };
    wireAdd('ok', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_USER');
    expect((await h.state()).reason).toMatch(/CAPTCHA/);
    expect(h.notifications.some((n) => n.startsWith('user:'))).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(counter.adds).toBe(0);
    expect(captchaClicks).not.toHaveBeenCalled();
    expect(h.location.reloads).toBe(0);
    document.querySelector('#form_captcha')!.remove(); // usuário resolveu
    await until(async () => (await h.state()).phase === 'CART');
    expect(counter.adds).toBe(1);
  });

  it('seleção rejeitada pelo site: marca falha e tenta a próxima preferência (limitado)', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte' }, { name: 'Sul' }] });
    const counter = { adds: 0 };
    wireAdd('reject-first', counter);
    await h.start();
    await until(async () => counter.adds === 1);
    // Remove a mensagem de erro antes da 2ª tentativa (como um toast que some).
    await until(async () => !!(await h.state()).ledger['critical#1'] && (await h.state()).ledger['critical#1']!.status === 'failed');
    document.querySelector('#feedback')!.innerHTML = '';
    await until(async () => (await h.state()).phase === 'CART');
    const s = await h.state();
    expect(counter.adds).toBe(2);
    expect(s.ledger['critical#2']?.status).toBe('confirmed');
    expect(h.logs.some((l) => /Setor: Sul/.test(l.msg))).toBe(true);
  });

  it('IDEMPOTÊNCIA: clique sem confirmação → pausa; reload NÃO repete o clique', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage();
    const counter = { adds: 0 };
    wireAdd('silent', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'PAUSED');
    expect(counter.adds).toBe(1);
    const s = await h.state();
    expect(s.ledger['critical#1']?.status).toBe('pending');
    expect(s.reason).toMatch(/Verifique o carrinho/);

    // Página recarrega sozinha: content script novo NÃO age (execução pausada).
    const r = await h.navigate('https://mock.test/event/1', eventPage());
    wireAdd('silent', counter);
    expect(r).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(counter.adds).toBe(1);
  });

  it('IDEMPOTÊNCIA: reload no meio da confirmação com ação pendente → não repete; confirma pelo indicador do carrinho', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage();
    const counter = { adds: 0 };
    wireAdd('silent', counter);
    await h.start();
    await until(async () => counter.adds === 1);
    // Antes do timeout de confirmação a página recarrega e mostra o carrinho com 1 item.
    await h.navigate('https://mock.test/event/1', eventPage().replace('data-count="0"', 'data-count="1"'));
    wireAdd('silent', counter);
    await until(async () => (await h.state()).phase === 'COMPLETED');
    expect(counter.adds).toBe(1);
    expect((await h.state()).ledger['critical#1']?.status).toBe('confirmed');
  });

  it('retomar após ambiguidade: o usuário decide; ação pendente vira "falha" e uma nova tentativa é permitida', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage();
    const counter = { adds: 0 };
    wireAdd('silent', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'PAUSED');
    document.body.innerHTML = eventPage();
    wireAdd('ok', counter);
    expect(await h.controller.resume()).toBe(true);
    await h.attach();
    await until(async () => (await h.state()).phase === 'CART');
    expect(counter.adds).toBe(2);
    const s = await h.state();
    expect(s.ledger['critical#1']?.status).toBe('failed');
    expect(s.ledger['critical#2']?.status).toBe('confirmed');
  });

  it('página de erro do servidor: retry com backoff limitado e depois pausa (sem loop infinito)', async () => {
    const h = createHarness();
    document.body.innerHTML = '<h1>503 Service Unavailable</h1>';
    await h.start();
    for (let i = 0; i < 3; i++) {
      await until(async () => (await h.state()).phase === 'RETRYING');
      await until(() => h.location.reloads === i + 1, 5_000);
      await h.navigate('https://mock.test/event/1', '<h1>503 Service Unavailable</h1>');
    }
    await until(async () => (await h.state()).phase === 'PAUSED');
    const s = await h.state();
    expect(s.reason).toMatch(/Limite de tentativas/);
    expect(s.lastError?.code).toBe('SERVER_ERROR_PAGE');
    expect(h.location.reloads).toBe(3);
  });

  it('mutações/visibilidade durante o backoff não contam a mesma falha duas vezes', async () => {
    const h = createHarness({ settings: { retry: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 2000, factor: 2 } } });
    document.body.innerHTML = '<h1>503 Service Unavailable</h1><div id="x"></div>';
    await h.start();
    await until(async () => (await h.state()).phase === 'RETRYING');
    for (let i = 0; i < 10; i++) {
      document.querySelector('#x')!.className = `c${i}`;
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(50);
    }
    expect((await h.state()).attempts).toBe(1);
    expect((await h.state()).errorCount).toBe(1);
    await until(() => h.location.reloads === 1, 5_000);
    expect(h.location.reloads).toBe(1);
  });

  it('erro transitório seguido de recuperação zera o contador de tentativas', async () => {
    const h = createHarness();
    document.body.innerHTML = '<h1>504 Gateway Timeout</h1>';
    await h.start();
    await until(() => h.location.reloads === 1);
    expect((await h.state()).attempts).toBe(1);
    await h.navigate('https://mock.test/event/1', eventPage({ sectors: [{ name: 'Norte', soldOut: true }] }));
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY' && (await h.state()).attempts === 0);
    expect((await h.state()).retries).toBe(1);
  });

  it('modo Simulação: executa a seleção mas NÃO clica em adicionar', async () => {
    const h = createHarness({ settings: { behavior: { mode: 'dry-run', refreshIntervalSec: 10, notifications: false, sound: false } } });
    document.body.innerHTML = eventPage();
    const counter = { adds: 0 };
    wireAdd('ok', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'PAUSED');
    expect(counter.adds).toBe(0);
    expect((await h.state()).reason).toMatch(/Simulação/);
    expect(document.querySelector('#add')!.getAttribute('data-autoticket-highlight')).toMatch(/simulação/i);
  });

  it('PARADA DE EMERGÊNCIA: cancela timers/observers; nada mais acontece mesmo com o DOM mudando', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    const counter = { adds: 0 };
    wireAdd('ok', counter);
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    await h.controller.emergencyStop();
    expect((await h.state()).phase).toBe('STOPPED');
    expect(h.runner?.isStopped).toBe(true);
    expect(h.runner?.schedulerStats()).toEqual({ timers: 0, observers: 0, cleanups: 0, disposed: true });
    document.querySelector('#picker')!.innerHTML = sectorsHtml([{ name: 'Norte' }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(counter.adds).toBe(0);
    expect(h.location.reloads).toBe(0);
    expect(h.alarms.has('watchdog')).toBe(false);
  });

  it('pausar e retomar', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    await h.controller.pause();
    expect((await h.state()).phase).toBe('PAUSED');
    expect(h.runner?.isStopped).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.location.reloads).toBe(0);
    expect(await h.controller.resume()).toBe(true);
    await h.attach();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
  });

  it('elemento crítico nunca aparece: timeout → recuperação controlada', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage().replace('<button id="add">Adicionar ao carrinho</button>', '');
    await h.start();
    await until(async () => (await h.state()).phase === 'RETRYING');
    const s = await h.state();
    expect(s.lastError?.code).toBe('ELEMENT_TIMEOUT');
    await until(() => h.location.reloads === 1, 5_000);
  });

  it('passo que sempre falha NÃO gera retries infinitos: pausa após o limite', async () => {
    const h = createHarness();
    const noAdd = () => eventPage().replace('<button id="add">Adicionar ao carrinho</button>', '');
    document.body.innerHTML = noAdd();
    await h.start();
    for (let i = 1; i <= 3; i++) {
      await until(() => h.location.reloads === i, 10_000);
      await h.navigate('https://mock.test/event/1', noAdd());
    }
    await until(async () => (await h.state()).phase === 'PAUSED', 10_000);
    expect(h.location.reloads).toBe(3);
    expect((await h.state()).reason).toMatch(/Limite de tentativas/);
  });

  it('página desconhecida: espera limitada e depois avisa o usuário (sem navegar sozinho)', async () => {
    const h = createHarness({ url: 'https://mock.test/institucional' });
    document.body.innerHTML = '<main>Sobre nós</main>';
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_PAGE');
    await vi.advanceTimersByTimeAsync(5_100);
    const s = await h.state();
    expect(s.phase).toBe('WAITING_USER');
    expect(s.reason).toMatch(/não reconhecida/);
    expect(h.location.reloads + h.location.assigned.length).toBe(0);
  });

  it('teto de recarregamentos por hora pausa o robô', async () => {
    const h = createHarness({ settings: { behavior: { refreshIntervalSec: 10, maxReloadsPerHour: 2, notifications: false, sound: false } } });
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    await h.start();
    for (let i = 0; i < 2; i++) {
      await until(() => h.location.reloads === i + 1, 15_000);
      await h.navigate('https://mock.test/event/1', eventPage({ sectors: [{ name: 'Norte', soldOut: true }] }));
    }
    await until(async () => (await h.state()).phase === 'PAUSED', 15_000);
    expect((await h.state()).reason).toMatch(/recarregamentos/);
    expect(h.location.reloads).toBe(2);
  });

  it('lista de eventos: abre o evento pelas palavras-chave', async () => {
    const h = createHarness({ url: 'https://mock.test/events', settings: { target: { eventKeywords: ['Vasco'], sectors: ['Norte'] } } });
    document.body.innerHTML = `
      <div class="event-card"><a href="/event/1">Flamengo x Botafogo</a></div>
      <div class="event-card"><a href="/event/2">Flamengo x Vasco</a></div>`;
    const clicked: string[] = [];
    document.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        clicked.push(a.textContent ?? '');
      }),
    );
    await h.start();
    await until(() => clicked.length === 1);
    expect(clicked).toEqual(['Flamengo x Vasco']);
    expect((await h.state()).phase).toBe('DETECTING_EVENT');
  });

  it('aba fechada pausa a execução; navegador reiniciado não continua sozinho', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    await h.controller.onBrowserStartup();
    expect((await h.state()).phase).toBe('PAUSED');
    expect((await h.state()).lastError?.code).toBe('BROWSER_RESTARTED');
    expect(await h.attach()).toBeNull();
  });

  it('ESTRESSE: DOM mudando sem parar não gera processamento proporcional (debounce + execução única)', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] }) + '<div id="noise"></div>';
    const tickSpy = vi.spyOn(Runner.prototype as unknown as { tick: () => Promise<void> }, 'tick');
    await h.start();
    await until(async () => (await h.state()).phase === 'WAITING_AVAILABILITY');
    tickSpy.mockClear();
    const noise = document.querySelector('#noise')!;
    // 400 mutações em 8s (a cada 20ms)
    for (let i = 0; i < 400; i++) {
      noise.textContent = String(i);
      noise.appendChild(document.createElement('span'));
      await vi.advanceTimersByTimeAsync(20);
    }
    // Em fase "quieta" o debounce é de 1s: no máximo ~10 ciclos para 400 mutações.
    expect(tickSpy.mock.calls.length).toBeLessThanOrEqual(12);
    expect(h.runner?.schedulerStats().observers).toBe(1);
  });

  it('ESTRESSE: sequência de reloads/navegações não cria execuções concorrentes', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    await h.start();
    const runners: Runner[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await h.navigate('https://mock.test/event/1', eventPage({ sectors: [{ name: 'Norte', soldOut: true }] }));
      if (r) runners.push(r);
      await vi.advanceTimersByTimeAsync(100);
    }
    const alive = runners.filter((r) => !r.isStopped);
    expect(alive).toHaveLength(1);
    expect(runners.slice(0, -1).every((r) => r.schedulerStats().disposed)).toBe(true);
  });

  it('runner de execução antiga é recusado (runId diferente)', async () => {
    const h = createHarness();
    document.body.innerHTML = eventPage({ sectors: [{ name: 'Norte', soldOut: true }] });
    await h.start();
    const old = (await h.state()).runId;
    await h.controller.stop();
    await h.controller.start(1);
    expect(await h.controller.report(1, old, { type: 'AVAILABLE' })).toBeNull();
    expect(await h.controller.claim(1, old, 'critical#1', 'x')).toMatchObject({ granted: false });
  });
});
