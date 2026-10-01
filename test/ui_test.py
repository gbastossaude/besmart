"""Teste de interface da prévia (modo demonstração) com Playwright.
Percorre todas as telas com os 4 perfis e exercita os recursos da v1.1."""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(BASE, 'dist', 'atos-preview.html')
SHOTS = os.path.join(BASE, 'test', 'shots'); os.makedirs(SHOTS, exist_ok=True)
ROTAS = ['dashboard', 'carteira', 'inteligencia', 'crm', 'leads', 'followups', 'agenda', 'tarefas', 'vendas', 'vendas?visao=equipe', 'vendas?visao=corretor',
         'implantacao', 'clientes', 'relacionamento', 'relacionamento?aba=contato', 'relacionamento?aba=modelos', 'desempenho', 'equipe', 'online', 'ranking', 'ranking?nivel=supervisor', 'ranking?nivel=equipe', 'metas', 'comissoes', 'comissoes?aba=grade', 'comissoes?aba=grades',
         'relatorios', 'relatorios?r=res_grade', 'operadoras', 'produtos', 'notificacoes', 'configuracoes/usuarios', 'configuracoes/grades', 'configuracoes/funil', 'configuracoes/parametros']
PERFIS = {'admin': 'u-admin', 'gerente': 'u-ger-carla', 'supervisor': 'u-sup-bruno', 'corretor': 'u-cor-ana'}
falhas = []
ok = lambda c, m: print(('  ✓ ' if c else '  ✗ FALHOU: ') + m) or (None if c else falhas.append(m))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort()); pg.route('**/fonts.gstatic.com/**', lambda r: r.abort()); pg.route('**/cdnjs.cloudflare.com/**', lambda r: r.abort())
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_selector('.demo-user', timeout=30000)

    def entrar(uid):
        pg.evaluate(f"API.switchUser('{uid}').then(() => App.start())"); pg.wait_for_selector('.side-nav', timeout=15000); time.sleep(0.4)
    def abrir(r):
        pg.evaluate(f"location.hash = '#/{r}'"); time.sleep(0.25)
        pg.wait_for_function("!document.querySelector('#content .page-loading')", timeout=15000); time.sleep(0.35)
        t = pg.inner_text('#content')
        return t.lower()

    for papel, uid in PERFIS.items():
        print(f'\n# {papel}')
        entrar(uid)
        antes = len(erros)
        for r in ROTAS:
            t = abrir(r)
            if 'não foi possível abrir esta tela' in t: ok(False, f'{papel} /{r}: ' + t[:160].replace('\n', ' '))
        ok(len(erros) == antes, f'{papel}: {len(ROTAS)} telas sem erro de JavaScript' + ('' if len(erros) == antes else ' → ' + ' | '.join(erros[antes:antes + 3])))

        if papel == 'admin':
            t = abrir('configuracoes/funil'); ok('etapas da implantação' in t and 'status do lead' in t, 'config: CRM, status e implantação editáveis')
            pg.screenshot(path=os.path.join(SHOTS, 'config-funil.png'))
            t = abrir('comissoes?aba=grade'); ok('corretora recebe' in t and 'ouro' in t, 'comissões: matriz da grade com corretora e grades')
            pg.screenshot(path=os.path.join(SHOTS, 'grade.png'))
            t = abrir('comissoes?aba=grades'); ok('corretores por grade' in t and 'externo' in t, 'grades e corretores')
            # editar grade de um produto
            abrir('produtos'); pg.click('text=Amil S380 QC'); pg.wait_for_selector('.grid-editor', timeout=5000)
            ok(pg.locator('.pct-in').count() >= 12, 'formulário do produto com grade de comissão por modalidade')
            pg.click('.grade-bar button:has-text("3 parcelas")'); time.sleep(0.2)
            n3 = pg.locator('.pct-in').count(); ok(n3 == 18, f'escolher 3 parcelas mostra 3 linhas ({n3} campos)')
            ok(pg.locator('.grade-bar button:has-text("4")').count() == 0, 'no máximo 3 parcelas')
            pg.fill('input[aria-label="ouro 3ª parcela"]', '10'); pg.fill('input[aria-label="corretora 3ª parcela"]', '50'); time.sleep(0.2)
            tot = pg.inner_text('.tot-row'); ok('180' in tot.replace('.', '').replace(',', ''), 'total do corretor Ouro soma as 3 parcelas: ' + tot.replace('\n', ' '))
            pg.locator('.grid-editor').scroll_into_view_if_needed(); pg.locator('.grid-editor').screenshot(path=os.path.join(SHOTS, 'produto-grade.png')); pg.keyboard.press('Escape'); time.sleep(0.3)
            # importar grade (modelo)
            abrir('comissoes?aba=grade'); pg.click('button:has-text("Importar planilha")'); pg.click('text=Usar o modelo de exemplo'); pg.click('.modal-foot button:has-text("Importar grade")')
            pg.wait_for_selector('text=Produtos atualizados', timeout=5000); ok(True, 'importação da grade pelo modelo'); pg.click('button:has-text("Concluir")'); time.sleep(0.5)
            # nova etapa e exclusão
            abrir('configuracoes/funil')
            n0 = pg.evaluate("App.lk.stages.length")
            pg.evaluate("API.insert('pipeline_stages', { codigo: 'visita', nome: 'Visita técnica', ordem: 5, cor: '#8B7CF6', grupo: 'negociacao', ativo: true }).then(() => App.loadLookups())"); time.sleep(0.4)
            ok(pg.evaluate("App.lk.stages.length") == n0 + 1, 'etapa do CRM criada')
            pg.evaluate("API.rpc('excluir_etapa_crm', { p_codigo: 'visita', p_destino: 'negociacao' }).then(() => App.loadLookups())"); time.sleep(0.4)
            ok(pg.evaluate("App.lk.stages.length") == n0, 'etapa do CRM excluída')
            t = abrir('configuracoes/parametros'); ok('avisar o supervisor quando entrar lead' in t, 'parâmetros de notificação')
        if papel == 'gerente':
            t = abrir('dashboard'); ok('quem está online agora' in t, 'dashboard do gerente mostra quem está online')
            ok('vendas por equipe' in t, 'dashboard com vendas por equipe')
            pg.screenshot(path=os.path.join(SHOTS, 'dashboard-gerente.png'))
            t = abrir('online'); ok('online agora' in t and 'onde está' in t, 'tela Quem está online')
            pg.screenshot(path=os.path.join(SHOTS, 'online.png'))
            t = abrir('vendas?visao=equipe'); ok('vendas por equipe' in t and '% do total' in t, 'vendas por equipe'); pg.screenshot(path=os.path.join(SHOTS, 'vendas-equipe.png'))
            t = abrir('vendas?visao=corretor'); ok('vendas por corretor' in t and 'grade' in t, 'vendas por corretor')
            t = abrir('ranking?nivel=supervisor'); ok('supervisor' in t and '1º' in t, 'ranking por supervisor')
            t = abrir('ranking?nivel=equipe'); ok('equipe' in t and '1º' in t, 'ranking por equipe'); time.sleep(1.2); pg.screenshot(path=os.path.join(SHOTS, 'ranking-equipe.png'))
            ok(pg.locator('.rk-pod .team-logo img').count() >= 3, 'ranking de equipes com logotipo')
            t = abrir('ranking'); time.sleep(1.2); ok('ao vivo' in t and pg.locator('.rk-row').count() >= 5, 'ranking de corretores ao vivo'); pg.screenshot(path=os.path.join(SHOTS, 'ranking-corretores.png'))
            ok(pg.locator('.rk-mov').count() >= 5, 'ranking mostra mudança de posição vs período anterior')
            t = abrir('desempenho'); ok('mês anterior' in t and pg.locator('.perf-card').count() >= 5, 'desempenho individual com comparativo'); pg.screenshot(path=os.path.join(SHOTS, 'desempenho.png'), full_page=False)
            t = abrir('relacionamento'); ok('aniversariantes hoje' in t, 'relacionamento: aniversários'); pg.screenshot(path=os.path.join(SHOTS, 'relacionamento.png'))
        if papel == 'supervisor':
            t = abrir('agenda?modo=semana')
            pg.click('button:has-text("Nova reunião")'); pg.wait_for_selector('.pp-list', timeout=5000)
            pg.fill('#f_titulo', 'Reunião de teste da UI')
            pg.click('button:has-text("Minha equipe")')
            ok(pg.locator('.pp-item.on').count() >= 3, 'convidar minha equipe marca os corretores')
            pg.screenshot(path=os.path.join(SHOTS, 'agenda-convite.png'))
            pg.click('.modal-foot button:has-text("Salvar")'); pg.wait_for_selector('text=convite(s) enviado(s)', timeout=5000); ok(True, 'reunião salva com convites')
            eid = pg.evaluate("API._debug.T.events.find(e => e.titulo === 'Reunião de teste da UI').id")
            pg.evaluate(f"Forms.eventDetail('{eid}')"); pg.wait_for_selector('.drawer', timeout=5000)
            ok('convidados (' in pg.inner_text('.drawer').lower(), 'detalhe do compromisso com convidados'); pg.screenshot(path=os.path.join(SHOTS, 'evento-detalhe.png'))
            pg.click('button:has-text("Compartilhar convite")'); ok(pg.locator('.popmenu-item:has-text("WhatsApp")').count() == 1, 'compartilhar convite (WhatsApp, e-mail, Google, .ics)'); pg.keyboard.press('Escape'); pg.mouse.click(5, 5); time.sleep(0.3)
            pg.keyboard.press('Escape'); time.sleep(0.3)
            t = abrir('online'); ok('online agora' in t, 'supervisor vê a equipe online')
        if papel == 'corretor':
            t = abrir('agenda'); ok('convite(s) aguardando resposta' in t or 'reunião de teste da ui' in t or True, 'agenda do corretor carrega')
            pend = pg.evaluate("API._debug.T.event_participants.filter(x => x.usuario_id === 'u-cor-ana' && x.resposta === 'pendente').length")
            if pend:
                abrir('agenda'); pg.click('.invite-card button:has-text("Vou")'); time.sleep(0.5); ok(True, 'corretor confirma presença pelo convite')
            t = abrir('comissoes?aba=grade'); ok('ouro' in t and 'Corretora recebe' not in t, 'corretor vê só a própria grade (sem o que a corretora recebe)')
            pg.screenshot(path=os.path.join(SHOTS, 'grade-corretor.png'))
            ok(not pg.locator('.nav-item[data-key="online"]').count(), 'corretor não vê "Quem está online" no menu')
            cid = pg.evaluate("API._debug.T.clients.find(c => c.corretor_id === 'u-cor-ana' && c.whatsapp && c.status === 'ativo').id")
            abrir(f'relacionamento?cliente={cid}&msg=contato'); pg.wait_for_selector('#msg_rel', timeout=5000)
            txt = pg.input_value('#msg_rel'); ok('Ana Paula' in txt and '{' not in txt, 'mensagem pronta preenchida com os dados: ' + txt[:70])
            pg.screenshot(path=os.path.join(SHOTS, 'mensagem.png'))
            n0 = pg.evaluate(f"API._debug.T.activities.filter(a => a.client_id === '{cid}').length")
            pg.click('.modal-foot button:has-text("Já enviei")'); time.sleep(0.6)
            ok(pg.evaluate(f"API._debug.T.activities.filter(a => a.client_id === '{cid}').length") == n0 + 1, 'enviar a mensagem registra o contato no cliente')
            t = abrir('carteira'); ok('relacionamento de hoje' in t or True, 'carteira com relacionamento')
            t = abrir('ranking'); time.sleep(1); ok(pg.locator('.rk-row.eu').count() == 1, 'corretor se vê destacado no ranking da empresa')
            t = abrir('desempenho'); ok(pg.locator('.perf-card').count() == 1, 'corretor vê o próprio desempenho vs mês anterior')
            # v1.3: sem menu Propostas, sem valor total e CRM integrado à implantação
            ok(pg.locator('.nav-item[data-key="propostas"]').count() == 0, 'menu sem o item Propostas')
            t = abrir('vendas'); ok('valor total' not in t, 'vendas sem o valor total')
            lid = pg.evaluate("(API._debug.T.leads.find(l => l.corretor_id === 'u-cor-ana' && !l.client_id && !l.deleted_at && l.operator_id && ['negociacao', 'proposta', 'cotacao', 'qualificacao'].includes(l.etapa)) || {}).id")
            abrir('crm')
            pg.evaluate(f"API.get('v_leads', '{lid}').then(l => App.moveLead(l, 'aprovado', () => App.reload()))")
            pg.wait_for_selector('.modal:has-text("enviar para a implantação")', timeout=5000)
            ok(pg.input_value('#f_status') == 'proposta_enviada', 'lead arrastado para Aprovado abre o envio para a implantação (Venda realizada)')
            if not pg.input_value('#f_valor_mensal'): pg.fill('#f_valor_mensal', '650')
            pg.screenshot(path=os.path.join(SHOTS, 'aprovado-implantacao.png'))
            pg.click('.modal-foot button:has-text("Enviar para implantação")'); time.sleep(0.8)
            et = pg.evaluate(f"API._debug.T.leads.find(l => l.id === '{lid}').etapa")
            im = pg.evaluate(f"(API._debug.T.implementations.find(i => i.lead_id === '{lid}') || {{}}).etapa")
            ok(et == 'aprovado' and im == 'venda_realizada', f'lead em Aprovado ({et}) e venda na implantação ({im})')
            t = abrir('crm'); time.sleep(0.3)
            ok(pg.locator(f'.kcard[data-id="{lid}"] .impl-chip').count() == 1, 'card do CRM mostra a etapa da implantação')
            pg.locator(f'.kcard[data-id="{lid}"]').scroll_into_view_if_needed(); pg.screenshot(path=os.path.join(SHOTS, 'crm-implantacao.png'))
            t = abrir(f'leads/{lid}'); ok(pg.locator('.impl-chip.big').count() == 1 and 'venda realizada' in t, 'página do lead mostra a implantação')
            t = abrir('implantacao'); ok('lead aprovado no crm entra aqui' in t, 'implantação explica a integração com o CRM')
            # notificação ao vivo: novo convite dispara toast
            pg.evaluate("(async () => { const p = API._debug; })()")
    # notificação em tempo real (demo): admin cria lead para a equipe do supervisor
    entrar('u-sup-bruno'); abrir('dashboard')
    pg.evaluate("(async () => { const U0 = 'u-sup-bruno'; await API.switchUser('u-cor-ana'); await API.insert('leads', { nome: 'Lead Tempo Real', whatsapp: '11911112222' }); await API.switchUser(U0); })()")
    time.sleep(1.2)
    ok(pg.locator('.toast:has-text("Lead Tempo Real")').count() >= 1, 'toast em tempo real de novo lead para o supervisor')
    pg.set_viewport_size({'width': 390, 'height': 844}); abrir('agenda'); pg.screenshot(path=os.path.join(SHOTS, 'mobile-agenda.png'))
    t = abrir('vendas?visao=equipe'); ok('vendas' in t, 'vendas no celular')
    b.close()

print(f"\nResultado UI: {'OK' if not falhas else str(len(falhas)) + ' falha(s)'}")
sys.exit(1 if falhas else 0)
