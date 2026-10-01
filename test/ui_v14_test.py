"""Testes de interface da v1.4 (prévia em modo demonstração, Playwright).
Login com validação, tema claro, celular (navegação inferior, filtros e
tabelas em cartões), segurança do link de reunião, CSV seguro e botões ocupados."""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(BASE, 'dist', 'atos-preview.html')
falhas = []
def ok(c, m):
    print(('  ✓ ' if c else '  ✗ FALHOU: ') + m)
    if not c: falhas.append(m)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PW_CHROMIUM') or None)

    def nova(w, hgt):
        pg = b.new_page(viewport={'width': w, 'height': hgt})
        for d in ('fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'):
            pg.route(f'**/{d}/**', lambda r: r.abort())
        pg.erros = []
        pg.on('pageerror', lambda e: pg.erros.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('.demo-user', timeout=30000)
        return pg

    def abrir(pg, r):
        pg.evaluate(f"location.hash = '#/{r}'"); time.sleep(0.3)
        pg.wait_for_function("!document.querySelector('#content .page-loading')", timeout=15000); time.sleep(0.4)

    print('# Login')
    pg = nova(1280, 860)
    pg.fill('#login_email', 'invalido'); pg.click('button[type=submit]')
    ok('e-mail válido' in pg.inner_text('.login-msg'), 'login valida o e-mail antes de enviar')
    pg.fill('#login_email', 'ana@exemplo.com'); pg.click('button[type=submit]')
    ok('senha' in pg.inner_text('.login-msg').lower(), 'login pede a senha')
    pg.click('.pw-toggle'); ok(pg.get_attribute('#login_pw', 'type') == 'text', 'botão mostra a senha')

    print('# Erros amigáveis')
    msgs = pg.evaluate("""[apiFriendly(new TypeError('Failed to fetch')), apiFriendly({ message: 'JWT expired', code: 'PGRST301' }),
      apiFriendly({ message: 'Internal Server Error', status: 500 }), apiFriendly(new TypeError("Cannot read properties of undefined (reading 'x')")),
      apiFriendly({ message: 'new row for relation "events" violates check constraint "events_link_reuniao_http"', code: '23514' }),
      apiFriendly({ name: 'AbortError', message: 'The operation was aborted' })]""")
    ok('Sem conexão' in msgs[0], 'falha de rede → mensagem de conexão')
    ok('sessão expirou' in msgs[1], 'token expirado → sessão expirada')
    ok('instabilidade' in msgs[2], 'erro 500 → servidor instável')
    ok('undefined' not in msgs[3] and 'Cannot' not in msgs[3], 'erro de programação não aparece cru: ' + msgs[3])
    ok('https://' in msgs[4], 'restrição do link de reunião explicada')
    ok('demorou' in msgs[5], 'tempo esgotado explicado')

    print('# Segurança')
    ok(pg.evaluate("U.safeHref('javascript:alert(1)')") == '#', 'href javascript: bloqueado')
    ok(pg.evaluate("U.safeUrl('https://meet.google.com/x')") == 'https://meet.google.com/x', 'link https aceito')
    csv = pg.evaluate("U.toCSV([{ label: 'Nome', key: 'n' }], [{ n: '=HYPERLINK(\"http://x\")' }, { n: '-12,5' }])")
    ok("'=HYPERLINK" in csv and '\n-12,5' in csv, 'CSV neutraliza fórmulas e mantém números negativos')

    pg.evaluate("API.switchUser('u-admin').then(() => App.start())"); pg.wait_for_selector('.side-nav', timeout=15000); time.sleep(0.5)
    err = pg.evaluate("API.insert('events', { titulo: 'X', tipo: 'reuniao', inicio: new Date().toISOString(), link_reuniao: 'javascript:alert(1)' }).then(() => 'gravou', e => e.message)")
    ok('https://' in err, 'link de reunião javascript: recusado: ' + err)

    print('# Botão ocupado')
    estado = pg.evaluate("""(async () => { let n = 0; const b = U.h('button', { onclick: () => new Promise(r => setTimeout(() => { n++; r(); }, 300)) }, 'Salvar');
      document.body.appendChild(b); b.click(); b.click(); b.click(); const durante = b.disabled; await new Promise(r => setTimeout(r, 450)); b.remove(); return [durante, b.disabled, n]; })()""")
    ok(estado[0] and not estado[1] and estado[2] == 1, 'clique triplo executa a ação uma vez e reabilita o botão: ' + str(estado))

    print('# Modal acessível')
    pg.click('.top-actions .btn.primary'); time.sleep(0.2)
    ok(pg.evaluate("document.activeElement.classList.contains('popmenu-item')"), 'menu "Novo" recebe o foco')
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_selector('.modal', timeout=5000); time.sleep(0.2)
    ok(pg.evaluate("!!document.querySelector('.modal[aria-labelledby]')"), 'janela com título acessível')
    pg.keyboard.press('Escape'); time.sleep(0.3)
    ok(pg.locator('.modal').count() == 0, 'Esc fecha a janela')
    pg.click('.modal-foot .btn.primary') if pg.locator('.modal-foot').count() else None
    pg.evaluate("Forms.lead()"); time.sleep(0.3)
    pg.click('.modal-foot .btn.primary'); time.sleep(0.3)
    ok(pg.locator('.field.invalid .field-err').count() >= 1, 'campos obrigatórios mostram o erro no próprio campo')
    pg.keyboard.press('Escape'); time.sleep(0.3)

    print('# Tema claro')
    pg.evaluate("U.store('tema', 'claro'); App.aplicarTema('claro')"); time.sleep(0.5)
    ok(pg.evaluate("document.documentElement.dataset.theme") == 'light', 'tema claro aplicado')
    bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    ok(bg in ('rgb(244, 246, 250)',), 'fundo claro: ' + bg)
    pg.evaluate("U.store('tema', 'escuro'); App.aplicarTema('escuro')")
    ok(pg.evaluate("document.documentElement.dataset.theme") == 'dark', 'volta ao tema escuro')
    ok(not pg.erros, 'desktop sem erro de JavaScript: ' + str(pg.erros[:3]))
    pg.close()

    print('# Celular')
    pg = nova(390, 844)
    pg.evaluate("API.switchUser('u-admin').then(() => App.start())"); pg.wait_for_selector('.side-nav', timeout=15000); time.sleep(0.5)
    ok(pg.locator('.bottom-nav').is_visible(), 'navegação inferior visível')
    abrir(pg, 'leads')
    ok(pg.locator('.filters-toggle').is_visible(), 'botão "Filtros" no celular')
    ok(not pg.locator('.filters > select').first.is_visible(), 'filtros recolhidos por padrão')
    pg.click('.filters-toggle'); time.sleep(0.2)
    ok(pg.locator('.filters > select').first.is_visible(), 'filtros abrem ao tocar')
    ok(pg.evaluate("getComputedStyle(document.querySelector('.stack-sm .tbl tbody tr')).display") == 'flex', 'tabela vira cartões')
    ok(pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), 'sem rolagem horizontal na página')
    for r in ['dashboard', 'crm', 'vendas', 'clientes', 'comissoes', 'agenda', 'followups', 'ranking', 'relatorios', 'configuracoes/usuarios']:
        abrir(pg, r)
        sw = pg.evaluate("Math.max(document.documentElement.scrollWidth, document.querySelector('#content').scrollWidth)")
        ok(sw <= 391, f'{r}: sem rolagem horizontal ({sw}px)')
    pg.click('.bottom-nav button'); time.sleep(0.3)
    ok(pg.evaluate("document.querySelector('.app').classList.contains('nav-open')"), 'botão Menu abre o menu lateral')
    pg.keyboard.press('Escape'); time.sleep(0.3)
    ok(not pg.evaluate("document.querySelector('.app').classList.contains('nav-open')"), 'Esc fecha o menu lateral')
    ok(not pg.erros, 'celular sem erro de JavaScript: ' + str(pg.erros[:3]))
    b.close()

print('\nResultado UI v1.4:', 'OK' if not falhas else f'{len(falhas)} falha(s)')
sys.exit(1 if falhas else 0)
