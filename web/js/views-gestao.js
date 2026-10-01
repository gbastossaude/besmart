/* =====================================================================
   ATOS SISTEMA — views-gestao.js
   Gestão da Equipe, Dashboard do corretor, Ranking, Metas, Comissões
   e Central de Relatórios.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, confirmDialog, toast, avatar } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Forms = global.Forms, Charts = global.Charts;

  const metaCell = (real, meta, exp) => meta ? h('div', { style: { minWidth: '130px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px' } }, h('span', { class: real >= meta ? 'ok-t' : '' }, fmt.pct(100 * real / meta)), h('span', { class: 'muted' }, fmt.moneyShort(meta))),
    h('div', { class: 'meta-bar' }, h('div', { style: { width: Math.min(100, 100 * real / meta) + '%', background: real >= meta ? 'var(--ok)' : 'var(--blue)' } }), exp ? h('span', { class: 'exp', style: { left: Math.min(100, exp) + '%' } }) : null)) : h('span', { class: 'dim' }, 'sem meta');
  const ritmo = () => { const d = new Date(); return 100 * d.getDate() / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };

  // ------------------------------------------------------------------
  // GESTÃO DA EQUIPE
  // ------------------------------------------------------------------
  Views.equipe = async function () {
    if (!App.can('equipe.ver')) return empty('Acesso restrito', 'A gestão de equipe é exclusiva de supervisores, gerentes e administradores.');
    const state = { ...App.initPeriod('mes'), ...(U.store('eq.f') || {}) };
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div');
    const load = async () => {
      U.store('eq.f', App.filtrosAtivos(state));
      clear(filters).append(App.periodPicker(state, load, ['semana', 'mes', 'mes_anterior', 'trimestre', 'ano']), ...App.hierFilters(state, load, { corretor: false, equipe: true }));
      clear(body).appendChild(U.skeleton(8));
      const rows = await API.rpc('desempenho_corretores', { p_inicio: state.ini, p_fim: state.fim, p_filtros: App.filtrosAtivos(state) });
      const tot = k => U.sum(rows, r => r[k]);
      const cols = [
        { label: 'Corretor', sort: 'nome', render: r => h('div', { class: 'person' }, avatar(r.nome, 28), h('div', null, h('div', { class: 'cell-main' }, r.nome), h('div', { class: 'cell-sub' }, [r.equipe, App.is('admin', 'gerente') ? r.supervisor : null].filter(Boolean).join(' · ')))) },
        { label: 'Leads', align: 'right', render: r => fmt.int(r.leads_recebidos) },
        { label: 'Atendidos', align: 'right', render: r => h('span', null, fmt.int(r.leads_trabalhados), r.sem_atendimento ? h('div', { class: 'cell-sub bad-t' }, r.sem_atendimento + ' sem contato') : null) },
        { label: '1º contato', align: 'right', render: r => fmt.minutes(r.tempo_primeiro_contato_min) },
        { label: 'Cotações', align: 'right', render: r => fmt.int(r.cotacoes) },
        { label: 'Vendas', align: 'right', render: r => h('b', null, fmt.int(r.vendas)) }, { label: 'Conversão', align: 'right', render: r => fmt.pct(r.conversao) },
        { label: 'Produção', align: 'right', render: r => h('b', null, fmt.money0(r.valor)) }, { label: 'Vidas', align: 'right', render: r => fmt.int(r.vidas) },
        { label: 'Follow-ups atrasados', align: 'right', render: r => r.followups_atrasados ? h('span', { class: 'bad-t' }, r.followups_atrasados) : '0' },
        { label: 'Meta do mês', render: r => metaCell(r.realizado_mes, r.meta, ritmo()) },
      ];
      clear(body).append(
        h('div', { class: 'kpis', style: { marginBottom: '14px' } },
          App.kpi('Corretores', fmt.int(rows.length)), App.kpi('Leads recebidos', fmt.int(tot('leads_recebidos'))), App.kpi('Vendas', fmt.int(tot('vendas'))),
          App.kpi('Produção', fmt.money0(tot('valor')), { hero: true }), App.kpi('Conversão média', fmt.pct(tot('leads_recebidos') ? 100 * tot('convertidos') / tot('leads_recebidos') : 0)),
          App.kpi('Leads sem atendimento', fmt.int(tot('sem_atendimento')), { state: tot('sem_atendimento') ? 'var(--bad)' : 'var(--ok)', onClick: () => App.go('/leads?f=sem_contato') })),
        U.table(cols, rows, { onRow: r => App.go('/equipe/' + r.id), emptyText: 'Nenhum corretor na sua estrutura.' }),
        h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'A marca vertical na barra de meta indica o ritmo esperado para hoje. Clique no corretor para abrir o dashboard individual.'));
    };
    wrap.append(App.pageHead('Gestão da equipe', { eyebrow: App.is('supervisor') ? (App.me.team_nome || 'Sua equipe') : 'Sua estrutura', desc: 'Produtividade individual com os números reais do período.',
      actions: [h('button', { class: 'btn', onclick: () => App.go('/ranking') }, icon('trophy', 16), 'Ranking')] }), filters, body);
    await load();
    return wrap;
  };

  Views.corretor = async function ({ id }) {
    const p = App.lk.userMap[id] || await API.get('v_profiles', id);
    if (!p || p.papel !== 'corretor') return empty('Corretor não encontrado', 'Ele não faz parte da sua estrutura.', h('button', { class: 'btn', onclick: () => App.go('/equipe') }, 'Voltar'));
    const state = App.initPeriod('mes');
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div');
    const load = async () => {
      clear(filters).append(App.periodPicker(state, load, ['semana', 'mes', 'mes_anterior', 'trimestre', 'ano']));
      clear(body).appendChild(U.skeleton(10));
      const [painel, dp] = await Promise.all([App.painel(state, { fixo: { corretor_id: id }, titulo: false }), API.rpc('desempenho_corretores', { p_inicio: state.ini, p_fim: state.fim, p_filtros: { corretor_id: id } })]);
      const d = dp[0] || {};
      clear(body).append(App.card('Indicadores de produtividade', h('div', { class: 'kpis' },
        App.kpi('Leads recebidos', fmt.int(d.leads_recebidos)), App.kpi('Leads trabalhados', fmt.int(d.leads_trabalhados)), App.kpi('Tempo até 1º contato', fmt.minutes(d.tempo_primeiro_contato_min)),
        App.kpi('Tentativas de contato', fmt.int(d.tentativas)), App.kpi('Cotações enviadas', fmt.int(d.cotacoes)),
        App.kpi('Vendas', fmt.int(d.vendas)), App.kpi('Conversão', fmt.pct(d.conversao)), App.kpi('Ticket médio', fmt.money0(d.ticket_medio)), App.kpi('Valor vendido', fmt.money0(d.valor)),
        App.kpi('Vidas', fmt.int(d.vidas)), App.kpi('Follow-ups realizados', fmt.int(d.followups_realizados)), App.kpi('Leads sem atendimento', fmt.int(d.sem_atendimento), { state: d.sem_atendimento ? 'var(--bad)' : null }),
        App.kpi('Leads perdidos', fmt.int(d.perdidos)))), painel);
    };
    wrap.append(App.pageHead(p.nome, { crumb: { label: 'Equipe', go: '/equipe' }, eyebrow: 'Dashboard individual · ' + [p.team_nome, p.supervisor_nome].filter(Boolean).join(' · '),
      actions: [h('button', { class: 'btn', onclick: () => App.go('/leads?corretor_id=' + id) }, icon('leads', 16), 'Leads do corretor')] }), filters, body);
    await load();
    return wrap;
  };

  // RANKING e DESEMPENHO INDIVIDUAL: ver views-ranking.js

  // ------------------------------------------------------------------
  // METAS
  // ------------------------------------------------------------------
  Views.metas = async function () {
    const state = { mes: dates.today().slice(0, 7) };
    const wrap = h('div'); const bar = h('div', { class: 'filters' }); const body = h('div');
    const TIPOS = { valor: ['Valor vendido', fmt.money0], qtd_vendas: ['Quantidade de vendas', fmt.int], vidas: ['Vidas', fmt.int], conversao: ['Conversão', fmt.pct] };
    const ESC = { empresa: 'Empresa', gerente: 'Gerente', supervisor: 'Supervisor', equipe: 'Equipe', corretor: 'Corretor' };
    const podeEditar = App.is('admin', 'gerente');
    const load = async () => {
      const ini = state.mes + '-01', fim = dates.endOfMonth(ini);
      clear(bar).append(h('input', { type: 'month', value: state.mes, 'aria-label': 'Mês', onchange: e => { state.mes = e.target.value || state.mes; load(); } }),
        h('button', { class: 'btn sm', onclick: () => { state.mes = dates.addMonths(ini, -1).slice(0, 7); load(); } }, icon('chevronLeft', 14), 'Mês anterior'),
        h('button', { class: 'btn sm', onclick: () => { state.mes = dates.today().slice(0, 7); load(); } }, 'Mês atual'));
      clear(body).appendChild(U.skeleton(8));
      const [goals, sales, leads] = await Promise.all([
        API.all('v_goals', { eq: { mes: ini }, order: [['escopo', true], ['usuario_nome', true]] }),
        API.all('v_sales', { in: { status: ['aprovada', 'implantada'] }, gte: { data_venda: ini }, lte: { data_venda: fim } }),
        API.all('v_leads', { select: 'id,corretor_id,supervisor_id,gerente_id,team_id,client_id,etapa', gte: { entrada_em: ini }, lt: { entrada_em: dates.addDays(fim, 1) } })]);
      const realizado = g => {
        const S = sales.filter(s => (!g.operator_id || s.operator_id === g.operator_id) && (!g.product_id || s.product_id === g.product_id) && (
          g.escopo === 'empresa' ? true : g.escopo === 'corretor' ? s.corretor_id === g.usuario_id : g.escopo === 'supervisor' ? s.supervisor_id === g.usuario_id : g.escopo === 'gerente' ? s.gerente_id === g.usuario_id : s.team_id === g.goal_team_id));
        if (g.tipo === 'valor') return U.sum(S, s => s.valor_mensal);
        if (g.tipo === 'qtd_vendas') return S.length;
        if (g.tipo === 'vidas') return U.sum(S, s => s.num_vidas);
        const L = leads.filter(l => g.escopo === 'empresa' ? true : g.escopo === 'corretor' ? l.corretor_id === g.usuario_id : g.escopo === 'supervisor' ? l.supervisor_id === g.usuario_id : g.escopo === 'gerente' ? l.gerente_id === g.usuario_id : l.team_id === g.goal_team_id);
        return L.length ? 100 * L.filter(App.ganho).length / L.length : 0;
      };
      const rows = goals.map(g => ({ ...g, real: realizado(g) }));
      const exp = state.mes === dates.today().slice(0, 7) ? ritmo() : 100;
      const mine = rows.find(g => g.tipo === 'valor' && (App.is('admin') ? g.escopo === 'empresa' : g.usuario_id === App.me.id));
      clear(body).append(
        mine ? h('div', { class: 'grid g-kpi-meta', style: { marginBottom: '14px' } }, h('div', { class: 'kpis' },
          App.kpi('Meta de valor', fmt.money0(mine.valor_meta), { hero: true, foot: (ESC[mine.escopo] || '') + (mine.usuario_nome ? ' · ' + mine.usuario_nome : '') }), App.kpi('Realizado', fmt.money0(mine.real)),
          App.kpi('Falta', fmt.money0(Math.max(0, mine.valor_meta - mine.real))), App.kpi('Ritmo esperado hoje', fmt.pct(exp))),
          h('div', { class: 'kpi', style: { alignItems: 'center' } }, h('div', { class: 'kpi-label' }, 'Atingimento'), Charts.ring(100 * mine.real / mine.valor_meta, { size: 104 }))) : null,
        U.table([
          { label: 'Meta de', render: g => h('div', null, h('div', { class: 'cell-main' }, g.usuario_nome || g.equipe_nome || 'Empresa'), h('div', { class: 'cell-sub' }, ESC[g.escopo] + [g.operadora_nome, g.produto_nome].filter(Boolean).map(x => ' · ' + x).join(''))) },
          { label: 'Tipo', render: g => TIPOS[g.tipo][0] }, { label: 'Meta', align: 'right', render: g => TIPOS[g.tipo][1](g.valor_meta) }, { label: 'Realizado', align: 'right', render: g => h('b', null, TIPOS[g.tipo][1](g.real)) },
          { label: 'Atingimento', render: g => h('div', { style: { minWidth: '160px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px' } }, h('span', { class: g.real >= g.valor_meta ? 'ok-t' : '' }, fmt.pct(g.valor_meta ? 100 * g.real / g.valor_meta : 0))),
            h('div', { class: 'meta-bar' }, h('div', { style: { width: Math.min(100, g.valor_meta ? 100 * g.real / g.valor_meta : 0) + '%', background: g.real >= g.valor_meta ? 'var(--ok)' : 'var(--blue)' } }), h('span', { class: 'exp', style: { left: exp + '%' } }))) },
          podeEditar ? { label: '', width: '80px', render: g => h('button', { class: 'btn xs ghost', onclick: async e => { e.stopPropagation(); if (await confirmDialog({ title: 'Excluir meta', message: 'Excluir esta meta?', confirm: 'Excluir', danger: true })) { try { await API.softDelete('goals', g.id); load(); } catch (er) { App.err(er); } } } }, 'Excluir') } : null,
        ].filter(Boolean), rows, { onRow: podeEditar ? g => Forms.goal(g, { onDone: load }) : null, emptyText: 'Nenhuma meta cadastrada para este mês.' }));
    };
    wrap.append(App.pageHead('Metas', { eyebrow: 'Realizado × meta', desc: 'Metas por corretor, supervisor, gerente, equipe ou empresa — em valor, quantidade, vidas ou conversão.',
      actions: podeEditar ? [h('button', { class: 'btn primary', onclick: () => Forms.goal(null, { onDone: load }) }, icon('plus', 16), 'Nova meta')] : null }), bar, body);
    await load();
    return wrap;
  };

  // ------------------------------------------------------------------
  // COMISSÕES
  // ------------------------------------------------------------------
  const CST = { prevista: ['Prevista', 'var(--blue-2)'], em_processamento: ['Em processamento', 'var(--cyan)'], recebida: ['Recebida', 'var(--ok)'], paga: ['Paga', '#10B981'], cancelada: ['Cancelada', 'var(--bad)'], estornada: ['Estornada', 'var(--bad)'] };
  const cst = s => badge(CST[s][0], CST[s][1], 'dot');
  Views.comissoes = async function (params) {
    const gestor = App.can('comissoes.ver');
    const state = { ...App.initPeriod('ano'), status: null, corretor_id: null, operator_id: null, aba: params && params.q.aba || (gestor ? 'lancamentos' : 'minhas') };
    const wrap = h('div'); const bar = h('div', { class: 'filters' }); const body = h('div'); const tabBar = h('div');
    const load = async () => {
      if (state.aba === 'grade') { clear(bar); clear(body).appendChild(U.skeleton(8)); clear(body).appendChild(await Views._gradeMatrix()); return; }
      if (state.aba === 'grades') { clear(bar); clear(body).appendChild(U.skeleton(8)); clear(body).appendChild(await Views._gradesAdmin(load)); return; }
      clear(bar).append(App.periodPicker(state, load, ['mes', 'mes_anterior', 'trimestre', 'ano']),
        h('select', { 'aria-label': 'Status', onchange: e => { state.status = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todos os status'), Object.entries(CST).map(([v, [l]]) => h('option', { value: v, selected: state.status === v || null }, l))),
        gestor && App.gestor() ? h('select', { 'aria-label': 'Corretor', onchange: e => { state.corretor_id = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todos os corretores'), App.opt.corretores().map(o => h('option', { value: o.value, selected: state.corretor_id === o.value || null }, o.label))) : null);
      clear(body).appendChild(U.skeleton(8));
      if (!gestor) {
        clear(bar).append(App.periodPicker(state, load, ['mes', 'mes_anterior', 'trimestre', 'ano']),
          h('select', { 'aria-label': 'Status', onchange: e => { state.status = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todos os status'), Object.entries(CST).map(([v, [l]]) => h('option', { value: v, selected: state.status === v || null }, l))));
        let rows = await API.rpc('minhas_comissoes', { p_inicio: state.ini, p_fim: dates.addMonths(state.fim, 24) });
        rows = rows.filter(r => r.data_prevista >= state.ini && (!state.status || r.status === state.status));
        { const pri = {}; rows.forEach(r => { if (!pri[r.sale_id] || r.data_prevista < pri[r.sale_id]) pri[r.sale_id] = r.data_prevista; });
          rows.sort((a, b) => pri[b.sale_id].localeCompare(pri[a.sale_id]) || String(a.sale_id).localeCompare(String(b.sale_id)) || a.parcela - b.parcela); }
        const s = k => U.sum(rows.filter(r => k.includes(r.status)), r => r.minha_comissao);
        clear(body).append(h('div', { class: 'kpis', style: { marginBottom: '14px' } }, App.kpi('A receber (prevista)', fmt.money(s(['prevista', 'em_processamento'])), { hero: true }), App.kpi('Paga', fmt.money(s(['paga']))), App.kpi('Recebida pela corretora', fmt.money(s(['recebida']))),
          App.kpi('Canceladas / estornadas', fmt.money(s(['cancelada', 'estornada'])), { state: 'var(--bad)' })),
          U.table([{ label: 'Cliente', render: r => h('span', { class: 'cell-main' }, r.cliente_nome || '—') }, { label: 'Operadora', key: 'operadora_nome' }, { label: 'Parcela', align: 'right', render: r => h('b', null, r.parcela + 'ª') },
            { label: 'Mensalidade', align: 'right', render: r => fmt.money(r.valor_venda) }, { label: 'Minha comissão', align: 'right', render: r => h('b', null, fmt.money(r.minha_comissao)) },
            { label: 'Previsão', render: r => fmt.date(r.data_prevista) }, { label: 'Status', render: r => cst(r.status) }], rows, { onRow: r => App.go('/vendas/' + r.sale_id), emptyText: 'Nenhuma comissão no período.' }),
          h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'Você vê somente a sua parte de cada comissão. Valores da corretora não são exibidos para o seu perfil.'));
        return;
      }
      if (state.aba === 'regras') {
        const rules = await API.all('v_commission_rules', { order: [['nome', true]] });
        clear(body).append(h('div', { class: 'bulkbar' }, icon('alert', 15), 'As regras só são usadas para produtos SEM grade de comissão cadastrada. Produtos com grade usam a grade do produto × a grade do corretor.'), U.table([{ label: 'Regra', render: r => h('div', null, h('div', { class: 'cell-main' }, r.nome), h('div', { class: 'cell-sub' }, [r.operadora_nome, r.produto_nome, r.campanha_nome, r.corretor_nome, r.supervisor_nome].filter(Boolean).join(' · ') || 'Todas as vendas')) },
          { label: '% corretora', align: 'right', render: r => fmt.pct(r.pct_empresa) }, { label: '% corretor', align: 'right', render: r => fmt.pct(r.pct_corretor) }, { label: '% supervisor', align: 'right', render: r => fmt.pct(r.pct_supervisor) },
          { label: 'Parcelas', align: 'right', key: 'parcelas' }, { label: 'Ativa', render: r => r.ativo ? badge('Ativa', 'var(--ok)') : badge('Inativa', 'var(--muted)') }], rules,
          { onRow: App.is('admin') ? r => Views._ruleForm(r, load) : null, emptyText: 'Nenhuma regra. Sem regra específica, vale o percentual padrão das configurações.' }),
          h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'Percentuais aplicados sobre a mensalidade de cada parcela. Quando várias regras servem, vale a mais específica (corretor > produto > campanha > supervisor > operadora).'));
        return;
      }
      const o = { gte: { data_prevista: state.ini }, lte: { data_prevista: dates.addMonths(state.fim, 24) }, order: [['data_prevista', false]], eq: {} };
      if (state.status) o.eq.status = state.status; if (state.corretor_id) o.eq.corretor_id = state.corretor_id;
      // agrupado por venda, com as parcelas em ordem (1ª, 2ª, 3ª)
      const rows = (await API.all('v_commissions', o)).filter(r => r.data_prevista >= state.ini)
        .sort((a, b) => String(b.data_venda || '').localeCompare(String(a.data_venda || '')) || String(a.sale_id).localeCompare(String(b.sale_id)) || a.parcela - b.parcela);
      const s = (st, k) => U.sum(rows.filter(r => st.includes(r.status)), r => r[k]);
      const edit = App.can('comissoes.editar');
      const acao = async (r, status) => {
        const patch = { status };
        if (status === 'recebida') { patch.comissao_recebida = r.comissao_prevista; patch.data_recebida = dates.today(); }
        if (status === 'estornada' && !(await confirmDialog({ title: 'Estornar comissão', message: 'Registrar estorno desta parcela?', confirm: 'Estornar', danger: true }))) return;
        try { await API.update('commissions', r.id, patch); toast('Comissão atualizada'); load(); } catch (e) { App.err(e); }
      };
      clear(body).append(h('div', { class: 'kpis', style: { marginBottom: '14px' } },
        App.kpi('Comissão prevista', fmt.money0(s(['prevista', 'em_processamento'], 'comissao_prevista')), { hero: true }), App.kpi('Recebida', fmt.money0(s(['recebida', 'paga'], 'comissao_recebida'))),
        App.kpi('Parte dos corretores', fmt.money0(s(['prevista', 'em_processamento', 'recebida', 'paga'], 'comissao_corretor'))), App.kpi('Parte dos supervisores', fmt.money0(s(['prevista', 'em_processamento', 'recebida', 'paga'], 'comissao_supervisor'))),
        App.kpi('Margem da corretora', fmt.money0(s(['prevista', 'em_processamento', 'recebida', 'paga'], 'comissao_empresa'))), App.kpi('Canceladas / estornadas', fmt.money0(s(['cancelada', 'estornada'], 'comissao_prevista')), { state: 'var(--bad)' })),
        U.table([
          { label: 'Cliente / venda', render: r => h('div', null, h('div', { class: 'cell-main' }, r.cliente_nome || '—'), h('div', { class: 'cell-sub' }, [r.operadora_nome, r.numero_proposta ? 'nº ' + r.numero_proposta : null].filter(Boolean).join(' · '))) },
          { label: 'Parc.', align: 'right', render: r => h('b', null, r.parcela + 'ª') }, { label: 'Mensalidade', align: 'right', render: r => fmt.money(r.valor_venda) },
          { label: 'Prevista', align: 'right', render: r => fmt.money(r.comissao_prevista) }, { label: 'Recebida', align: 'right', render: r => r.comissao_recebida != null ? fmt.money(r.comissao_recebida) : '—' },
          { label: 'Corretor', align: 'right', render: r => h('div', null, Number(r.comissao_corretor) ? fmt.money(r.comissao_corretor) : h('span', { class: 'dim', title: 'Sem repasse ao corretor nesta parcela' }, '—'), h('div', { class: 'cell-sub' }, [r.corretor_nome, r.grade_nome].filter(Boolean).join(' · '))) }, { label: 'Supervisor', align: 'right', render: r => fmt.money(r.comissao_supervisor) },
          { label: 'Empresa', align: 'right', render: r => fmt.money(r.comissao_empresa) }, { label: 'Previsão', render: r => fmt.date(r.data_prevista) }, { label: 'Status', render: r => cst(r.status) },
          edit ? { label: '', render: r => h('div', { class: 'row no-row', style: { gap: '4px' } },
            ['prevista', 'em_processamento'].includes(r.status) ? h('button', { class: 'btn xs', onclick: () => acao(r, 'recebida') }, 'Recebida') : null,
            r.status === 'recebida' ? h('button', { class: 'btn xs ok', onclick: () => acao(r, 'paga') }, 'Pagar') : null,
            ['recebida', 'paga'].includes(r.status) ? h('button', { class: 'btn xs ghost', onclick: () => acao(r, 'estornada') }, 'Estornar') : null) } : null,
        ].filter(Boolean), rows, { onRow: r => App.go('/vendas/' + r.sale_id), emptyText: 'Nenhuma comissão no período.' }));
    };
    const abas = gestor ? [{ key: 'lancamentos', label: 'Lançamentos' }, { key: 'grade', label: 'Grade de comissão' }, { key: 'grades', label: 'Grades e corretores' }, { key: 'regras', label: 'Regras (sem grade)' }]
      : [{ key: 'minhas', label: 'Minhas comissões' }, { key: 'grade', label: App.is('supervisor') ? 'Grade do supervisor' : 'Minha grade' }];
    const setAba = k => { state.aba = k; clear(tabBar).appendChild(U.tabs(abas, k, k2 => { setAba(k2); load(); })); };
    setAba(state.aba);
    const minhaGrade = App.me.grade_nome ? h('span', null, ' Sua grade: ', App.gradeBadge(App.me.grade_comissao)) : null;
    wrap.append(App.pageHead(gestor ? 'Comissões' : 'Minhas comissões', { eyebrow: 'Comissionamento', desc: gestor ? 'O que a corretora recebe de cada operadora e o que paga a supervisores e corretores (Ouro, Prata, Bronze, Externo…), parcela a parcela.' : h('span', null, 'Sua parte das comissões das vendas que você realizou.', App.is('corretor') ? minhaGrade : null),
      actions: gestor && App.is('admin') ? [h('button', { class: 'btn', onclick: () => Forms.importGrade({ onDone: () => { setAba('grade'); load(); } }) }, icon('upload', 16), 'Importar grade'), h('button', { class: 'btn', onclick: () => Views._ruleForm(null, () => { setAba('regras'); load(); }) }, icon('plus', 16), 'Nova regra')] : null }), tabBar, bar, body);
    await load();
    return wrap;
  };
  // Matriz de grade: produto × parcela × (corretora, supervisor, grades)
  Views._gradeMatrix = async function () {
    const [grid, prods] = await Promise.all([API.all('v_commission_grid', { order: [['operadora_nome', true], ['produto_nome', true], ['parcela', true]] }), App.can('comissoes.ver') ? API.all('v_products', { order: [['nome', true]] }) : []]);
    const state = { op: null, busca: '' };
    const box = h('div'); const tb = h('div');
    const admin = App.is('admin');
    const cols = Forms.gradeCols().filter(([c]) => grid.some(g => g.beneficiario === c));
    const paint = () => {
      const t = state.busca.toLowerCase();
      const m = new Map();
      grid.filter(g => (!state.op || g.operator_id === state.op) && (!t || (g.produto_nome + ' ' + g.operadora_nome).toLowerCase().includes(t))).forEach(g => {
        const k = g.product_id + '|' + g.parcela; if (!m.has(k)) m.set(k, { id: k, product_id: g.product_id, produto: g.produto_nome, operadora: g.operadora_nome, parcela: g.parcela, v: {} }); m.get(k).v[g.beneficiario] = Number(g.percentual); });
      const rows = [];
      [...m.values()].forEach((r, i, arr) => { rows.push(r); const prox = arr[i + 1];
        if (!prox || prox.product_id !== r.product_id) { const ps = arr.filter(x => x.product_id === r.product_id); if (ps.length > 1) { const v = {}; ps.forEach(x => Object.entries(x.v).forEach(([k, n]) => { v[k] = (v[k] || 0) + n; })); rows.push({ id: r.product_id + '|t', product_id: r.product_id, total: true, parcela: ps.length, v }); } } });
      const semGrade = prods.filter(p => p.ativo && !Number(p.grade_parcelas) && (!state.op || p.operator_id === state.op));
      clear(tb).append(
        rows.length ? U.table([
          { label: 'Produto', render: r => r.total ? h('span', { class: 'muted' }, 'Total das parcelas') : r.parcela === Math.min(...rows.filter(x => x.product_id === r.product_id && !x.total).map(x => x.parcela)) ? h('div', null, h('div', { class: 'cell-main' }, r.produto), h('div', { class: 'cell-sub' }, r.operadora)) : h('span', { class: 'dim' }, '↳') },
          { label: 'Parcela', render: r => r.total ? h('b', { class: 'blue-t' }, r.parcela + ' parc.') : h('b', null, r.parcela + 'ª') },
          ...cols.map(([c, l, cor]) => ({ label: h('span', { class: 'gcol', style: { '--c': cor } }, l), align: 'right', render: r => r.v[c] != null ? h(r.total ? 'b' : 'span', { class: c === 'corretora' ? 'ok-t' : '' }, fmt.pct(r.v[c])) : h('span', { class: 'dim' }, '—') })),
          App.can('comissoes.ver') ? { label: 'Margem mín.', align: 'right', render: r => r.v.corretora == null ? '—' : h('span', { class: 'mono muted' }, fmt.pct(r.v.corretora - Math.max(0, ...cols.slice(2).map(([c]) => r.v[c] || 0)) - (r.v.supervisor || 0))) } : null,
        ].filter(Boolean), rows, { dense: true, onRow: admin ? r => { const b = rows.find(x => x.product_id === r.product_id && !x.total); Forms.productGrid({ id: r.product_id, nome: b.produto, operadora_nome: b.operadora }, { onDone: () => App.reload() }); } : null })
          : empty('Nenhuma grade cadastrada', admin ? 'Cadastre a grade em cada produto (Produtos → Grade) ou importe uma planilha.' : 'A administração ainda não cadastrou a grade de comissão dos produtos.'),
        semGrade.length ? App.card(`Produtos sem grade (${semGrade.length})`, h('div', { class: 'chips' }, semGrade.map(p => h('button', { class: 'chip-f', disabled: !admin || null, onclick: () => Forms.productGrid(p, { onDone: () => App.reload() }) }, p.nome, h('span', { class: 'dim' }, ' · ' + p.operadora_nome)))),
          { sub: 'Estes produtos usam as regras de comissão (aba "Regras") ou o percentual padrão.' }) : null);
    };
    box.append(h('div', { class: 'filters' },
      h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar produto…', oninput: U.debounce(e => { state.busca = e.target.value; paint(); }, 200) }),
      h('select', { 'aria-label': 'Operadora', onchange: e => { state.op = e.target.value || null; paint(); } }, h('option', { value: '' }, 'Todas as operadoras'), App.opt.ops().map(o => h('option', { value: o.value }, o.label))),
      h('span', { class: 'grow' }),
      admin ? h('button', { class: 'btn', onclick: () => Forms.importGrade({ onDone: () => App.reload() }) }, icon('upload', 15), 'Importar planilha') : null,
      admin ? h('button', { class: 'btn primary', onclick: () => {
        const f = U.form([{ name: 'p', label: 'Produto', type: 'select', required: true, options: App.opt.prods() }], {}, { cols: 1 });
        const m = U.modal({ title: 'Preencher grade manualmente', subtitle: 'Escolha o produto', size: 'sm', body: f, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'),
          h('button', { class: 'btn primary', onclick: () => { if (!f.validate()) return; const p = App.lk.prodsMap[f.values().p]; m.close(); Forms.productGrid(p, { onDone: () => App.reload() }); } }, 'Continuar')] });
      } }, icon('edit', 15), 'Preencher grade') : null),
      !App.can('comissoes.ver') ? h('div', { class: 'bulkbar' }, icon('lock', 15), App.is('supervisor') ? 'Você vê o percentual repassado ao supervisor em cada produto.' : h('span', null, 'Você vê somente os percentuais da sua grade', App.me.grade_comissao ? h('span', null, ' (', App.gradeBadge(App.me.grade_comissao), ')') : null, '. O que a corretora recebe não é exibido.')) : null,
      tb);
    paint();
    return box;
  };

  // Grades (Ouro, Prata, Bronze, Externo…) e corretores de cada grade
  Views._gradesAdmin = async function (reload) {
    const admin = App.is('admin');
    const [grades, users] = await Promise.all([API.all('commission_grades', { order: [['ordem', true]] }), API.all('v_profiles', { eq: { papel: 'corretor' }, order: [['nome', true]] })]);
    const ativos = users.filter(u => u.status !== 'inativo');
    const gForm = g => {
      const f = U.form([...(g ? [] : [{ name: 'codigo', label: 'Código', required: true, placeholder: 'diamante', hint: 'Letras minúsculas, sem espaço — usado na planilha' }]), { name: 'nome', label: 'Nome', required: true },
        { name: 'cor', label: 'Cor', type: 'color' }, { name: 'ordem', label: 'Ordem', type: 'number' }, { name: 'descricao', label: 'Descrição', span: 2 }, { name: 'ativo', label: 'Status', type: 'checkbox', checkLabel: 'Grade ativa' }],
        g || { cor: '#5B8DFF', ordem: grades.length + 1, ativo: true }, { cols: 2 });
      const m = U.modal({ title: g ? 'Editar grade' : 'Nova grade de comissão', size: 'md', body: f, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => {
        if (!f.validate()) return; const v = f.values(); if (v.codigo) v.codigo = v.codigo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_');
        try { if (g) await API.update('commission_grades', g.codigo, v, 'codigo'); else await API.insert('commission_grades', v); m.close(); toast('Grade salva'); await App.loadLookups(); reload(); } catch (e) { App.err(e); } } }, 'Salvar')] });
    };
    const excluir = async g => {
      const n = ativos.filter(u => u.grade_comissao === g.codigo).length;
      const f = U.form([{ name: 'destino', label: 'Mover os corretores desta grade para', type: 'select', required: n > 0, options: grades.filter(x => x.codigo !== g.codigo).map(x => ({ value: x.codigo, label: x.nome })) }], {}, { cols: 1 });
      const m = U.modal({ title: 'Excluir grade ' + g.nome, size: 'sm', body: h('div', { class: 'stack' }, h('p', { style: { margin: 0 } }, n ? `${n} corretor(es) estão nesta grade.` : 'Nenhum corretor está nesta grade.', ' Os percentuais desta grade nos produtos serão removidos. Comissões já geradas não mudam.'), n ? f : null),
        footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn danger', onclick: async () => { if (n && !f.validate()) return; try { await API.rpc('excluir_grade', { p_codigo: g.codigo, p_destino: n ? f.values().destino : null }); m.close(); toast('Grade excluída'); await App.loadLookups(); reload(); } catch (e) { App.err(e); } } }, 'Excluir grade')] });
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'grid g4' }, grades.map(g => { const qt = ativos.filter(u => u.grade_comissao === g.codigo);
        return h('div', { class: 'card grade-card', style: { '--c': g.cor } }, h('div', { class: 'row' }, h('span', { class: 'grade-dot' }), h('b', { class: 'grow' }, g.nome), g.ativo ? null : badge('Inativa', 'var(--muted)'),
          admin ? h('button', { class: 'icon-btn sm', 'aria-label': 'Editar grade', onclick: () => gForm(g) }, icon('edit', 14)) : null, admin ? h('button', { class: 'icon-btn sm', 'aria-label': 'Excluir grade', onclick: () => excluir(g) }, icon('trash', 14)) : null),
          h('div', { class: 'grade-n' }, qt.length, h('small', null, ' corretor(es)')), h('div', { class: 'cell-sub' }, g.descricao || h('span', { class: 'mono' }, g.codigo)),
          h('div', { class: 'grade-people' }, qt.slice(0, 8).map(u => U.avatar(u.nome, 24)), qt.length > 8 ? h('span', { class: 'muted' }, '+' + (qt.length - 8)) : null)); }),
        admin ? h('button', { class: 'card grade-card add', onclick: () => gForm(null) }, icon('plus', 20), 'Nova grade') : null),
      App.card('Corretores por grade', U.table([
        { label: 'Corretor', render: u => h('div', { class: 'person' }, U.avatar(u.nome, 28), h('div', null, h('div', { class: 'cell-main' }, u.nome), h('div', { class: 'cell-sub' }, [u.team_nome, u.supervisor_nome].filter(Boolean).join(' · ')))) },
        { label: 'Status', render: u => badge(u.status, { ativo: 'var(--ok)', pendente: 'var(--warn)' }[u.status] || 'var(--muted)', 'dot') },
        { label: 'Grade de comissão', render: u => admin ? h('select', { class: 'grade-sel', 'aria-label': 'Grade de ' + u.nome, onchange: async e => { try { await API.update('profiles', u.id, { grade_comissao: e.target.value }); toast(`${u.nome} → ${(App.lk.gradeMap[e.target.value] || {}).nome}`); await App.loadLookups(); } catch (er) { App.err(er); e.target.value = u.grade_comissao || ''; } } },
          grades.map(g => h('option', { value: g.codigo, selected: g.codigo === u.grade_comissao || null }, g.nome))) : App.gradeBadge(u.grade_comissao) },
      ], ativos, { dense: true, emptyText: 'Nenhum corretor visível.' }), { sub: admin ? 'Altere a grade e as próximas vendas aprovadas já usam o novo percentual' : 'Somente o administrador altera a grade' }));
  };

  Views._ruleForm = (r, onDone) => {
    const f = U.form([{ name: 'nome', label: 'Nome da regra', required: true, span: 2 },
      { name: 'operator_id', label: 'Operadora', type: 'select', options: App.opt.ops(), empty: 'Qualquer' }, { name: 'product_id', label: 'Produto', type: 'select', options: App.opt.prods(), empty: 'Qualquer' },
      { name: 'campaign_id', label: 'Campanha', type: 'select', options: App.opt.camps(), empty: 'Qualquer' }, { name: 'corretor_id', label: 'Corretor', type: 'select', options: App.opt.corretores(), empty: 'Qualquer' },
      { name: 'supervisor_id', label: 'Supervisor', type: 'select', options: App.opt.supervisores(), empty: 'Qualquer' }, { name: 'parcelas', label: 'Parcelas', type: 'number', min: 1, max: 24, required: true },
      { name: 'pct_empresa', label: '% recebido pela corretora', type: 'number', step: '0.01', required: true }, { name: 'pct_corretor', label: '% repassado ao corretor', type: 'number', step: '0.01', required: true },
      { name: 'pct_supervisor', label: '% repassado ao supervisor', type: 'number', step: '0.01', required: true }, { name: 'ativo', label: 'Ativa', type: 'checkbox', checkLabel: 'Regra ativa' }],
      r || { parcelas: 1, pct_empresa: 100, pct_corretor: 40, pct_supervisor: 10, ativo: true }, { cols: 2 });
    const m = U.modal({ title: r ? 'Editar regra' : 'Nova regra de comissão', size: 'md', body: f, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: async () => { if (!f.validate()) return; const v = f.values(); try { if (r) await API.update('commission_rules', r.id, v); else await API.insert('commission_rules', v); m.close(); toast('Regra salva'); onDone && onDone(); } catch (e) { App.err(e); } } }, 'Salvar')] });
  };

  // ------------------------------------------------------------------
  // CENTRAL DE RELATÓRIOS
  // ------------------------------------------------------------------
  const conv = l => App.ganho(l);
  const agg = (rows, key, init, add) => { const m = new Map(); rows.forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, init(k, r)); add(m.get(k), r); }); return [...m.values()]; };
  const leadsBy = (L, keyFn, label) => agg(L, keyFn, k => ({ id: k, nome: k || 'Não informado', leads: 0, conv: 0, perdidos: 0 }), (a, l) => { a.leads++; if (conv(l)) a.conv++; if (App.perdido(l)) a.perdidos++; })
    .map(a => ({ ...a, conversao: a.leads ? 100 * a.conv / a.leads : 0 })).sort((a, b) => b.leads - a.leads);
  const salesBy = (S, keyFn) => agg(S, keyFn, k => ({ nome: k || 'Não informado', qtd: 0, valor: 0, vidas: 0 }), (a, s) => { a.qtd++; a.valor += Number(s.valor_mensal); a.vidas += s.num_vidas; })
    .map(a => ({ ...a, ticket: a.qtd ? a.valor / a.qtd : 0 })).sort((a, b) => b.valor - a.valor);
  const C = {
    nome: l => ({ key: 'nome', label: l || 'Nome' }), leads: { key: 'leads', label: 'Leads', align: 'right', fmt: fmt.int }, conv: { key: 'conv', label: 'Convertidos', align: 'right', fmt: fmt.int },
    conversao: { key: 'conversao', label: 'Conversão', align: 'right', fmt: fmt.pct }, perdidos: { key: 'perdidos', label: 'Perdidos', align: 'right', fmt: fmt.int },
    qtd: { key: 'qtd', label: 'Vendas', align: 'right', fmt: fmt.int }, valor: { key: 'valor', label: 'Valor (mensal)', align: 'right', fmt: fmt.money }, vidas: { key: 'vidas', label: 'Vidas', align: 'right', fmt: fmt.int },
    ticket: { key: 'ticket', label: 'Ticket médio', align: 'right', fmt: fmt.money },
  };
  const R = [
    { cat: 'Comercial', key: 'leads_periodo', t: 'Leads por período', d: 'Entrada de leads por dia/mês', data: async s => { const L = await s.leads(); const long = (U.toDate(s.fim) - U.toDate(s.ini)) / 864e5 > 62;
      return agg(L, l => (long ? l.entrada_em.slice(0, 7) : dates.iso(new Date(l.entrada_em))), k => ({ nome: k, leads: 0, conv: 0 }), (a, l) => { a.leads++; if (conv(l)) a.conv++; }).sort((a, b) => a.nome < b.nome ? -1 : 1).map(a => ({ ...a, nome: long ? fmt.month(a.nome) : fmt.date(a.nome), conversao: 100 * a.conv / a.leads })); },
      cols: [C.nome('Período'), C.leads, C.conv, C.conversao], chart: r => Charts.columns(r.slice(-24).map(x => ({ label: x.nome.slice(0, 6), value: x.leads })), { barLabel: 'Leads' }) },
    { cat: 'Comercial', key: 'leads_origem', t: 'Leads por origem', data: async s => leadsBy(await s.leads(), l => l.origem_nome), cols: [C.nome('Origem'), C.leads, C.conv, C.conversao, C.perdidos], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.leads }))) },
    { cat: 'Comercial', key: 'leads_corretor', t: 'Leads por corretor', data: async s => leadsBy(await s.leads(), l => l.corretor_nome || 'Fila (sem corretor)'), cols: [C.nome('Corretor'), C.leads, C.conv, C.conversao, C.perdidos], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.leads }))) },
    { cat: 'Comercial', key: 'conversao', t: 'Conversão por etapa do funil', data: async s => { const L = await s.leads(); return App.lk.stages.filter(x => x.ativo && x.grupo !== 'perdido').map(st => ({ nome: st.nome, leads: L.filter(l => !App.perdido(l) && (l.etapa_ordem || 0) >= st.ordem).length })).map((x, i, a) => ({ ...x, conversao: i ? (a[i - 1].leads ? 100 * x.leads / a[i - 1].leads : 0) : 100 })); },
      cols: [C.nome('Etapa'), { key: 'leads', label: 'Leads que chegaram', align: 'right', fmt: fmt.int }, { key: 'conversao', label: 'Passagem da etapa anterior', align: 'right', fmt: fmt.pct }], chart: r => Charts.funnel(r.map(x => ({ nome: x.nome, qtd: x.leads, cor: 'var(--blue)' }))) },
    { cat: 'Comercial', key: 'vendas', t: 'Vendas do período', data: async s => (await s.sales()).map(x => ({ ...x, nome: x.cliente_nome })),
      cols: [C.nome('Cliente'), { key: 'numero_proposta', label: 'Nº proposta' }, { key: 'operadora_nome', label: 'Operadora' }, { key: 'produto_nome', label: 'Produto' }, { key: 'num_vidas', label: 'Vidas', align: 'right' }, { key: 'valor_mensal', label: 'Mensal', align: 'right', fmt: fmt.money },
        { key: 'data_venda', label: 'Data', fmt: fmt.date }, { key: 'status', label: 'Status' }, { key: 'corretor_nome', label: 'Corretor' }] },
    { cat: 'Comercial', key: 'ticket', t: 'Ticket médio por corretor', data: async s => salesBy(await s.sales(), x => x.corretor_nome), cols: [C.nome('Corretor'), C.qtd, C.valor, C.ticket], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.ticket })), { format: fmt.money0 }) },
    { cat: 'Comercial', key: 'producao', t: 'Produção mensal', data: async s => salesBy(await s.sales(), x => x.data_venda.slice(0, 7)).sort((a, b) => a.nome < b.nome ? -1 : 1).map(x => ({ ...x, nome: fmt.month(x.nome) })), cols: [C.nome('Mês'), C.qtd, C.valor, C.vidas, C.ticket],
      chart: r => Charts.columns(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort, barLabel: 'Valor vendido' }) },
    { cat: 'Comercial', key: 'produtos', t: 'Produtos vendidos', data: async s => salesBy(await s.sales(), x => x.produto_nome), cols: [C.nome('Produto'), C.qtd, C.valor, C.vidas, C.ticket], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.qtd }))) },
    { cat: 'Comercial', key: 'operadoras', t: 'Operadoras vendidas', data: async s => salesBy(await s.sales(), x => x.operadora_nome), cols: [C.nome('Operadora'), C.qtd, C.valor, C.vidas, C.ticket], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort }) },
    { cat: 'Gestão', key: 'res_corretor', t: 'Resultado por corretor', data: async s => (await s.desemp()).map(x => ({ ...x, qtd: x.vendas })),
      cols: [C.nome('Corretor'), { key: 'equipe', label: 'Equipe' }, { key: 'leads_recebidos', label: 'Leads', align: 'right', fmt: fmt.int }, { key: 'cotacoes', label: 'Cotações', align: 'right' }, C.qtd,
        { key: 'conversao', label: 'Conversão', align: 'right', fmt: fmt.pct }, C.valor, C.vidas, { key: 'meta', label: 'Meta mês', align: 'right', fmt: fmt.money0 }] },
    { cat: 'Gestão', key: 'res_supervisor', t: 'Resultado por supervisor', data: async s => salesBy(await s.sales(), x => x.supervisor_nome), cols: [C.nome('Supervisor'), C.qtd, C.valor, C.vidas, C.ticket], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort }) },
    { cat: 'Gestão', key: 'res_gerente', t: 'Resultado por gerente', data: async s => salesBy(await s.sales(), x => x.gerente_nome), cols: [C.nome('Gerente'), C.qtd, C.valor, C.vidas, C.ticket] },
    { cat: 'Gestão', key: 'res_equipe', t: 'Resultado por equipe', data: async s => { const S = await s.sales(); return salesBy(S, x => x.team_nome || (App.lk.teamMap[x.team_id] || {}).nome || 'Sem equipe'); }, cols: [C.nome('Equipe'), C.qtd, C.valor, C.vidas, C.ticket], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort }) },
    { cat: 'Gestão', key: 'res_grade', t: 'Produção por grade de comissão', d: 'Ouro, Prata, Bronze, Externo…', data: async s => { const S = await s.sales(); return salesBy(S, x => (App.lk.userMap[x.corretor_id] || {}).grade_nome || 'Sem grade'); }, cols: [C.nome('Grade'), C.qtd, C.valor, C.vidas, C.ticket], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort }) },
    { cat: 'Gestão', key: 'comparativo', t: 'Comparativo mensal (12 meses)', data: async s => { const fim = s.fim; const ini = dates.addMonths(fim, -11);
      const S = await API.all('v_sales', { ...s.f('sales'), in: { status: ['aprovada', 'implantada'] }, gte: { data_venda: ini }, lte: { data_venda: fim } });
      const L = await API.all('v_leads', { ...s.f('leads'), select: 'id,entrada_em,client_id,etapa', gte: { entrada_em: ini }, lt: { entrada_em: dates.addDays(fim, 1) } });
      return Array.from({ length: 12 }, (_, i) => dates.addMonths(ini, i).slice(0, 7)).map(m => { const sm = S.filter(x => x.data_venda.startsWith(m)), lm = L.filter(x => x.entrada_em.slice(0, 7) === m);
        return { nome: fmt.month(m), leads: lm.length, conversao: lm.length ? 100 * lm.filter(conv).length / lm.length : 0, qtd: sm.length, valor: U.sum(sm, x => x.valor_mensal), vidas: U.sum(sm, x => x.num_vidas) }; }); },
      cols: [C.nome('Mês'), C.leads, C.conversao, C.qtd, C.valor, C.vidas], chart: r => Charts.columns(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort, barLabel: 'Valor vendido' }), semPeriodo: true },
    { cat: 'Operacional', key: 'implantacoes', t: 'Implantações', data: async s => API.all('v_implementations', { ...s.f('impl'), order: [['etapa_desde', true]] }).then(r => r.map(x => ({ ...x, nome: x.cliente_nome }))),
      cols: [C.nome('Cliente'), { key: 'operadora_nome', label: 'Operadora' }, { key: 'etapa_nome', label: 'Etapa' }, { key: 'protocolo', label: 'Protocolo' }, { key: 'horas_na_etapa', label: 'Horas na etapa', align: 'right' }, { key: 'pendencias_abertas', label: 'Pendências', align: 'right' }, { key: 'corretor_nome', label: 'Corretor' }], semPeriodo: true },
    { cat: 'Operacional', key: 'cancelamentos', t: 'Cancelamentos', data: async s => API.all('v_sales', { ...s.f('sales'), in: { status: ['cancelada', 'recusada'] }, order: [['status_desde', false]] }).then(r => r.filter(x => (x.cancelada_em || x.status_desde).slice(0, 10) >= s.ini && (x.cancelada_em || x.status_desde).slice(0, 10) <= s.fim).map(x => ({ ...x, nome: x.cliente_nome }))),
      cols: [C.nome('Cliente'), { key: 'operadora_nome', label: 'Operadora' }, { key: 'status', label: 'Status' }, { key: 'valor_mensal', label: 'Mensal', align: 'right', fmt: fmt.money }, { key: 'motivo_cancelamento', label: 'Motivo' }, { key: 'corretor_nome', label: 'Corretor' }] },
    { cat: 'Operacional', key: 'pendencias', t: 'Pendências abertas', data: async s => API.all('v_pendencies', { eq: { status: 'aberta' }, order: [['prazo', true]] }).then(r => r.map(x => ({ ...x, nome: x.nome_contato }))),
      cols: [C.nome('Cliente / lead'), { key: 'descricao', label: 'Pendência' }, { key: 'prazo', label: 'Prazo', fmt: fmt.date }, { key: 'corretor_nome', label: 'Corretor' }], semPeriodo: true },
    { cat: 'Marketing', key: 'leads_campanha', t: 'Leads e conversão por campanha', data: async s => leadsBy((await s.leads()).filter(l => l.campaign_id), l => l.campanha_nome), cols: [C.nome('Campanha'), C.leads, C.conv, C.conversao, C.perdidos], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.conversao })), { format: fmt.pct, max: 100, color: 'var(--ok)' }) },
    { cat: 'Marketing', key: 'vendas_campanha', t: 'Vendas por campanha', data: async s => { const S = await s.sales(); const inv = Object.fromEntries(App.lk.camps.map(c => [c.nome, c.investimento])); return salesBy(S.filter(x => x.campaign_id), x => x.campanha_nome).map(x => ({ ...x, investimento: inv[x.nome] || null, cac: inv[x.nome] && x.qtd ? inv[x.nome] / x.qtd : null })); },
      cols: [C.nome('Campanha'), C.qtd, C.valor, C.vidas, { key: 'investimento', label: 'Investimento', align: 'right', fmt: fmt.money0 }, { key: 'cac', label: 'Custo por venda', align: 'right', fmt: fmt.money0 }] },
    { cat: 'Marketing', key: 'receita_origem', t: 'Receita por origem', d: 'Origem → Leads → Vendas → Conversão → Receita', data: async s => { const L = leadsBy(await s.leads(), l => l.origem_nome); const V = salesBy(await s.sales(), x => x.origem_nome); return L.map(l => { const v = V.find(x => x.nome === l.nome) || {}; return { ...l, qtd: v.qtd || 0, valor: v.valor || 0 }; }); },
      cols: [C.nome('Origem'), C.leads, C.qtd, C.conversao, C.valor], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.valor })), { format: fmt.moneyShort }) },
    { cat: 'Marketing', key: 'motivos_perda', t: 'Motivos de perda', data: async s => { const L = (await s.leads()).filter(App.perdido); return agg(L, l => l.motivo_perda_nome || 'Não informado', k => ({ nome: k, qtd: 0 }), a => a.qtd++).sort((a, b) => b.qtd - a.qtd).map(x => ({ ...x, pct: L.length ? 100 * x.qtd / L.length : 0 })); },
      cols: [C.nome('Motivo'), { key: 'qtd', label: 'Leads perdidos', align: 'right', fmt: fmt.int }, { key: 'pct', label: '% das perdas', align: 'right', fmt: fmt.pct }], chart: r => Charts.hbars(r.map(x => ({ label: x.nome, value: x.qtd })), { color: 'var(--bad)' }) },
  ];

  Views.relatorios = async function (params) {
    const state = { ...App.initPeriod('trimestre'), rel: params.q.r || 'leads_origem' };
    const wrap = h('div'); const side = h('div', { class: 'stack', style: { gap: '4px' } }); const bar = h('div', { class: 'filters' }); const body = h('div');
    const cache = {};
    const fBase = kind => { const f = App.filtrosAtivos(state); const eq = {}; ['gerente_id', 'supervisor_id', 'team_id', 'corretor_id', 'operator_id', 'source_id', 'campaign_id', 'product_id'].forEach(k => { if (f[k]) eq[k] = f[k]; });
      if (kind === 'impl' || kind === 'proposals') { delete eq.source_id; delete eq.campaign_id; delete eq.product_id; delete eq.team_id; if (kind === 'proposals') delete eq.gerente_id; }
      return Object.keys(eq).length ? { eq } : {}; };
    const S = {
      get ini() { return state.ini; }, get fim() { return state.fim; }, f: fBase,
      leads: async () => cache.l || (cache.l = await API.all('v_leads', { ...fBase('leads'), gte: { entrada_em: state.ini }, lt: { entrada_em: dates.addDays(state.fim, 1) } })),
      sales: async () => cache.s || (cache.s = await API.all('v_sales', { ...fBase('sales'), in: { status: ['aprovada', 'implantada'] }, gte: { data_venda: state.ini }, lte: { data_venda: state.fim } })),
      desemp: async () => API.rpc('desempenho_corretores', { p_inicio: state.ini, p_fim: state.fim, p_filtros: App.filtrosAtivos(state) }),
    };
    const run = async () => {
      Object.keys(cache).forEach(k => delete cache[k]);
      const r = R.find(x => x.key === state.rel) || R[0];
      clear(side).append(...['Comercial', 'Gestão', 'Operacional', 'Marketing'].map(cat => h('div', { class: 'stack', style: { gap: '2px', marginBottom: '10px' } }, h('div', { class: 'nav-label', style: { paddingLeft: '10px' } }, cat),
        R.filter(x => x.cat === cat).map(x => h('button', { class: 'nav-item' + (x.key === r.key ? ' active' : ''), onclick: () => { state.rel = x.key; run(); } }, x.t)))));
      clear(bar).append(r.semPeriodo ? h('span', { class: 'muted' }, 'Situação atual') : App.periodPicker(state, run, ['mes', 'mes_anterior', 'trimestre', 'ano', '90d']),
        ...App.hierFilters(state, run, { equipe: true, operadora: true, origem: true, campanha: true }));
      clear(body).appendChild(U.skeleton(8));
      try {
        const rows = await r.data(S);
        const cols = r.cols.map(c => ({ ...c, render: c.fmt ? x => c.fmt(x[c.key]) : x => x[c.key] ?? '—' }));
        const expCols = r.cols.map(c => ({ label: c.label, value: x => c.fmt && c.fmt !== fmt.money && c.fmt !== fmt.money0 && c.fmt !== fmt.int ? c.fmt(x[c.key]) : x[c.key] }));
        clear(body).append(
          h('div', { class: 'row', style: { marginBottom: '12px' } }, h('div', { class: 'grow' }, h('h2', { style: { margin: 0, fontFamily: 'var(--f-display)', fontSize: '19px' } }, r.t), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, (r.d ? r.d + ' · ' : '') + (r.semPeriodo ? 'situação atual' : `${fmt.date(state.ini)} a ${fmt.date(state.fim)}`) + ` · ${rows.length} linha(s)`)),
            h('button', { class: 'btn', onclick: e => App.exportMenu(e.currentTarget, 'relatorio-' + r.key + '-' + dates.today(), expCols, rows) }, icon('download', 16), 'Exportar')),
          r.chart && rows.length ? App.card('Visualização', r.chart(rows)) : null,
          h('div', { style: { marginTop: '14px' } }, U.table(cols, rows.slice(0, 500), { emptyText: 'Sem dados para este filtro.' })));
      } catch (e) { clear(body).appendChild(empty('Erro ao gerar relatório', e.message)); }
    };
    wrap.append(App.pageHead('Relatórios', { eyebrow: 'Central de relatórios', desc: 'Comercial, gestão, operacional e marketing. Exportação em PDF, Excel ou CSV. Os dados respeitam a sua hierarquia.' }),
      h('div', { class: 'grid g-rel' }, h('div', { class: 'card', style: { padding: '10px 8px' } }, side), h('div', null, bar, body)));
    await run();
    return wrap;
  };
})(window);
