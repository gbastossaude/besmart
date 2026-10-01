/**
 * Site de ingressos SIMULADO para testes E2E (nada de rede externa).
 * Configurável por cenário: atraso de disponibilidade, CAPTCHA, erros 503,
 * esgotado até N carregamentos, comportamento do botão "adicionar" e ruído de DOM.
 */
import { createServer } from 'node:http';

const DEFAULT = {
  availableAfterMs: 0, // atraso (na própria página) até liberar setores; -1 = nunca
  soldOutUntilLoad: 0, // carregamentos de /event com tudo esgotado
  opener: false, // exige clicar em "Ingressos" para ver a lista
  captcha: false, // mostra um desafio até ser resolvido
  errorLoads: 0, // primeiros N carregamentos retornam 503
  addMode: 'redirect-cart', // 'redirect-cart' | 'silent' | 'reject-first'
  noise: false, // muta o DOM a cada 50ms (teste de CPU)
  sectors: ['Norte', 'Sul'],
};

export function startMockServer(port = 0) {
  let config = { ...DEFAULT };
  let state = { loads: 0, adds: 0, captchaClicks: 0, lastQty: null, solved: false };

  const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

  function eventHtml() {
    state.loads++;
    const soldOutNow = state.loads <= config.soldOutUntilLoad;
    const showCaptcha = config.captcha && !state.solved;
    return page(
      'Evento',
      `
      <header>Mock Tickets <span id="cart-count" data-count="${state.adds > 0 && config.addMode !== 'silent' ? 1 : 0}"></span></header>
      ${showCaptcha ? '<div id="form_captcha"><img id="img_captcha" alt="captcha"><button id="captcha-btn">Verificar</button></div>' : ''}
      <main>
        <h1>Flamengo x Vasco</h1>
        ${config.opener ? '<button id="open-picker">Ingressos</button>' : ''}
        <div id="picker"></div>
        <label>Qtd <select id="qty"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
        <button id="add">Adicionar ao carrinho</button>
        <div id="feedback"></div>
        <div id="noise"></div>
      </main>
      <script>
        const cfg = ${JSON.stringify(config)};
        const soldOutNow = ${soldOutNow};
        function render(available) {
          document.querySelector('#picker').innerHTML = cfg.sectors.map((s) =>
            '<div class="sector"><span class="name">' + s + '</span>' + (available ? '' : ' ESGOTADO') + '</div>').join('');
          document.querySelectorAll('.sector').forEach((el) => el.addEventListener('click', () => {
            document.querySelectorAll('.sector').forEach((x) => x.classList.remove('selected'));
            el.classList.add('selected');
          }));
        }
        function showList() {
          render(false);
          if (soldOutNow || cfg.availableAfterMs < 0) return;
          setTimeout(() => render(true), cfg.availableAfterMs);
        }
        if (cfg.opener) document.querySelector('#open-picker').addEventListener('click', () => setTimeout(showList, 400));
        else showList();
        const cap = document.querySelector('#captcha-btn');
        if (cap) cap.addEventListener('click', () => fetch('/api/captcha-click', { method: 'POST' }));
        document.querySelector('#add').addEventListener('click', async () => {
          const sector = document.querySelector('.sector.selected .name')?.textContent || '';
          const qty = document.querySelector('#qty').value;
          const r = await fetch('/api/add', { method: 'POST', body: JSON.stringify({ sector, qty }) }).then((x) => x.json());
          if (!r.ok) { document.querySelector('#feedback').innerHTML = '<div role="alert">Limite atingido para este setor</div>';
            setTimeout(() => (document.querySelector('#feedback').innerHTML = ''), 1500); return; }
          if (cfg.addMode === 'silent') return;
          setTimeout(() => (location.href = '/cart'), 300);
        });
        if (cfg.noise) { let i = 0; setInterval(() => { const n = document.querySelector('#noise'); n.textContent = String(i++); n.appendChild(document.createElement('i')); if (n.children.length > 50) n.innerHTML = ''; }, 50); }
      </script>`,
    );
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, type = 'text/html; charset=utf-8') => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    const json = (obj) => send(200, JSON.stringify(obj), 'application/json');
    const readBody = () => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

    switch (url.pathname) {
      case '/__config': {
        config = { ...DEFAULT, ...JSON.parse((await readBody()) || '{}') };
        state = { loads: 0, adds: 0, captchaClicks: 0, lastQty: null, solved: false };
        return json({ ok: true });
      }
      case '/__state':
        return json(state);
      case '/__solve':
        state.solved = true;
        return json({ ok: true });
      case '/api/captcha-click':
        state.captchaClicks++;
        return json({ ok: true });
      case '/api/add': {
        const body = JSON.parse((await readBody()) || '{}');
        state.adds++;
        state.lastQty = body.qty;
        const reject = config.addMode === 'reject-first' && state.adds === 1;
        return json({ ok: !reject });
      }
      case '/events':
        return send(200, page('Eventos', '<div class="event-card"><a href="/event/1">Flamengo x Vasco</a></div>'));
      case '/event/1':
      case '/event':
        if (state.loads < config.errorLoads) {
          state.loads++;
          return send(503, page('Erro', '<h1>503 Service Unavailable</h1>'));
        }
        return send(200, eventHtml());
      case '/cart':
        return send(200, page('Carrinho', `<h1>Carrinho</h1><p>${state.adds} item(s)</p><a id="go-checkout" href="/checkout">Finalizar compra</a>`));
      case '/checkout':
        return send(200, page('Pagamento', '<h1>Pagamento</h1><p>Escolha a forma de pagamento.</p>'));
      default:
        return send(404, page('404', 'not found'));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({ port: p, origin: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
