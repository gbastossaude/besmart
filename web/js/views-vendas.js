/* =====================================================================
   ATOS SISTEMA — views-vendas.js
   Vendas, Implantação e Clientes (lista + visão 360°).
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, menu, confirmDialog, toast, debounce } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Forms = global.Forms, Charts = global.Charts;

  const SALE = { proposta_enviada: ['Venda realizada', 'var(--blue-2)'], em_analise: ['Em análise', 'var(--blue)'], pendencia: ['Pendência', 'var(--warn)'], aprovada: ['Aprovada', 'var(--ok)'],
    implantada: ['Implantada', '#10B981'], recusada: ['Recusada', 'var(--bad)'], cancelada: ['Cancelada', 'var(--bad)'] };
  const PROP = { rascunho: ['Rascunho', 'var(--muted)'], enviada: ['Enviada', 'var(--blue-2)'], em_analise: ['Em análise', 'var(--blue)'], pendencia: ['Pendência', 'var(--warn)'], aprovada: ['Aprovada', 'var(--ok)'], recusada: ['Recusada', 'var(--bad)'], cancelada: ['Cancelada', 'var(--bad)'] };
  const CLI = { ativo: ['Ativo', 'var(--ok)'], implantacao: ['Implantação', 'var(--blue-2)'], pendencia: ['Pendência', 'var(--warn)'], cancelado: ['Cancelado', 'var(--bad)'], inadimplente: ['Inadimplente', 'var(--bad)'], migracao: ['Migração', 'var(--cyan)'], renovacao: ['Renovação', 'var(--cyan)'] };
  // Etapas da implantação vêm do cadastro (editáveis em Configurações)
  const implEtapas = (todas) => (App.lk.implStages || []).filter(x => todas || (x.ativo && x.status_venda !== 'cancelada')).map(x => [x.codigo, x.nome, x.cor, x.status_venda]);
  const implNome = k => ((App.lk.implStages || []).find(x => x.codigo === k) || {}).nome || k;
  const implCancel = () => ((App.lk.implStages || []).find(x => x.status_venda === 'cancelada') || {}).codigo;
  Views._saleStatus = s => badge((SALE[s] || [s])[0], (SALE[s] || [])[1], 'dot');
  const propStatus = s => badge((PROP[s] || [s])[0], (PROP[s] || [])[1], 'dot');
  const cliStatus = s => badge((CLI[s] || [s])[0], (CLI[s] || [])[1], 'dot');
  const kv = pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v === null || v === undefined || v === '' ? h('span', { class: 'dim' }, '—') : v)]));

  // ------------------------------------------------------------------
  // Tabelas reutilizáveis
  // ------------------------------------------------------------------
  Views._proposalsTable = (rows, { onRow, compact } = {}) => U.table([
    { label: 'Contato', render: p => h('div', null, h('div', { class: 'cell-main' }, p.nome_contato || '—'), h('div', { class: 'cell-sub mono' }, p.numero ? 'nº ' + p.numero : 'sem número')) },
    { label: 'Operadora / produto', render: p => h('div', null, p.operadora_nome || '—', h('div', { class: 'cell-sub' }, p.produto_nome || '')) },
    { label: 'Vidas', align: 'right', render: p => p.num_vidas ?? '—' }, { label: 'Valor', align: 'right', render: p => fmt.money(p.valor_mensal) },
    { label: 'Status', render: p => propStatus(p.status) },
    { label: 'No status há', render: p => h('span', { class: p.horas_no_status > 48 && ['enviada', 'em_analise', 'pendencia'].includes(p.status) ? 'warn-t' : '' }, fmt.hours(p.horas_no_status)) },
    compact ? null : { label: 'Enviada', render: p => p.enviada_em ? fmt.date(p.enviada_em) : '—' },
    App.gestor() && !compact ? { label: 'Corretor', render: p => App.person(p.corretor_nome, 22) } : null,
  ].filter(Boolean), rows, { onRow: onRow || (p => p.lead_id ? App.go('/leads/' + p.lead_id + '?aba=propostas') : p.client_id && App.go('/clientes/' + p.client_id)), emptyText: 'Nenhuma proposta.' });

  Views._salesTable = rows => U.table([
    { label: 'Cliente', render: s => h('div', null, h('div', { class: 'cell-main' }, s.cliente_nome || '—'), h('div', { class: 'cell-sub mono' }, s.numero_proposta ? 'nº ' + s.numero_proposta : '')) },
    { label: 'Operadora / produto', render: s => h('div', null, s.operadora_nome || '—', h('div', { class: 'cell-sub' }, s.produto_nome || '')) },
    { label: 'Vidas', align: 'right', key: 'num_vidas' }, { label: 'Mensal', align: 'right', render: s => fmt.money(s.valor_mensal) },
    { label: 'Status', render: s => h('div', null, Views._saleStatus(s.status), s.pendencias_abertas ? h('div', { class: 'cell-sub warn-t' }, s.pendencias_abertas + ' pendência(s)') : null) },
    { label: 'Venda', render: s => fmt.date(s.data_venda) }, { label: 'Vigência', render: s => s.vigencia ? fmt.date(s.vigencia) : '—' },
    App.gestor() ? { label: 'Corretor', render: s => App.person(s.corretor_nome, 22) } : null,
  ].filter(Boolean), rows, { onRow: s => App.go('/vendas/' + s.id), emptyText: 'Nenhuma venda.' });

  Views._clientsTable = rows => U.table([
    { label: 'Cliente', render: c => h('div', null, h('div', { class: 'cell-main' }, c.nome), h('div', { class: 'cell-sub' }, c.razao_social || fmt.doc(c.cnpj || c.cpf))) },
    { label: 'Plano', render: c => h('div', null, c.operadora_nome || '—', h('div', { class: 'cell-sub' }, c.produto_nome || '')) },
    { label: 'Vidas', align: 'right', render: c => c.num_vidas + (c.dependentes ? ` (${c.dependentes} dep.)` : '') }, { label: 'Mensal', align: 'right', render: c => fmt.money(c.valor_mensal) },
    { label: 'Status', render: c => cliStatus(c.status) }, { label: 'Vigência', render: c => c.vigencia ? fmt.date(c.vigencia) : '—' },
    App.gestor() ? { label: 'Responsável', render: c => App.person(c.corretor_nome, 22) } : null,
  ].filter(Boolean), rows, { onRow: c => App.go('/clientes/' + c.id), emptyText: 'Nenhum cliente.' });

  // ------------------------------------------------------------------
  // VENDAS
  // ------------------------------------------------------------------
  Views.vendas = async function (params) {
    const state = { ...App.initPeriod('ano'), status: params.q.status || null, corretor_id: params.q.corretor || null, team_id: params.q.equipe || null, operator_id: null, product_id: null, source_id: null, search: '',
      visao: App.gestor() ? (params.q.visao || 'geral') : 'geral' };
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div'); const kpis = h('div', { class: 'kpis', style: { marginBottom: '14px' } }); const viewBar = h('div');
    let rows = [];
    const grupos = (list, keyFn, init) => { const m = new Map(); list.forEach(s => { const k = keyFn(s) || '—'; if (!m.has(k)) m.set(k, { ...init(s), qtd: 0, valor: 0, vidas: 0, analise: 0, canceladas: 0 }); const g = m.get(k);
      if (['aprovada', 'implantada'].includes(s.status)) { g.qtd++; g.valor += Number(s.valor_mensal || 0); g.vidas += s.num_vidas || 0; }
      else if (['em_analise', 'pendencia', 'proposta_enviada'].includes(s.status)) g.analise++; else g.canceladas++; }); return [...m.values()].sort((a, b) => b.valor - a.valor); };
    const agrupado = (lista, tipo) => {
      const totalV = U.sum(lista, g => g.valor) || 1;
      const cols = [
        { label: '#', width: '36px', render: g => h('span', { class: 'rank-n' }, lista.indexOf(g) + 1) },
        tipo === 'equipe' ? { label: 'Equipe', render: g => h('div', null, h('div', { class: 'cell-main' }, g.nome), h('div', { class: 'cell-sub' }, [g.supervisor ? 'Sup. ' + g.supervisor : null, g.gerente ? 'Ger. ' + g.gerente : null].filter(Boolean).join(' · '))) }
          : { label: 'Corretor', render: g => h('div', { class: 'person' }, U.avatar(g.nome, 28), h('div', null, h('div', { class: 'cell-main' }, g.nome), h('div', { class: 'cell-sub' }, [g.equipe, g.supervisor].filter(Boolean).join(' · ')))) },
        tipo === 'corretor' ? { label: 'Grade', render: g => g.grade ? badge(g.grade.nome, g.grade.cor, 'square') : '—' } : { label: 'Corretores', align: 'right', render: g => g.corretores.size },
        { label: 'Vendas', align: 'right', render: g => fmt.int(g.qtd) }, { label: 'Produção mensal', align: 'right', render: g => h('b', null, fmt.money0(g.valor)) },
        { label: 'Vidas', align: 'right', render: g => fmt.int(g.vidas) }, { label: 'Ticket médio', align: 'right', render: g => fmt.money0(g.qtd ? g.valor / g.qtd : 0) },
        { label: 'Aguardando', align: 'right', render: g => g.analise || '—' }, { label: 'Canc./recus.', align: 'right', render: g => g.canceladas ? h('span', { class: 'bad-t' }, g.canceladas) : '—' },
        { label: '% do total', render: g => h('div', { class: 'share' }, h('div', { class: 'share-bar' }, h('i', { style: { width: Math.round(100 * g.valor / totalV) + '%' } })), h('span', null, fmt.pct(100 * g.valor / totalV))) },
      ];
      return U.table(cols, lista, { onRow: g => { if (tipo === 'equipe') { state.team_id = g.id === '—' ? null : g.id; } else state.corretor_id = g.id; state.visao = 'geral'; load(); }, emptyText: 'Nenhuma venda no período.' });
    };
    const load = async () => {
      const o = { eq: {}, gte: { data_venda: state.ini }, lte: { data_venda: state.fim }, order: [['data_venda', false]] };
      ['status', 'corretor_id', 'operator_id', 'product_id', 'source_id', 'supervisor_id', 'gerente_id', 'team_id'].forEach(k => { if (state[k]) o.eq[k] = state[k]; });
      if (state.search) o.search = { cols: ['cliente_nome', 'numero_proposta'], term: state.search };
      clear(body).appendChild(U.skeleton(6));
      rows = await API.all('v_sales', o);
      const ok = rows.filter(s => ['aprovada', 'implantada'].includes(s.status));
      const tot = U.sum(ok, s => s.valor_mensal);
      clear(kpis).append(App.kpi('Vendas aprovadas', fmt.int(ok.length), { hero: true, foot: fmt.money0(tot) + '/mês' }),
        App.kpi('Vidas', fmt.int(U.sum(ok, s => s.num_vidas))), App.kpi('Ticket médio', fmt.money0(ok.length ? tot / ok.length : 0)),
        App.kpi('Aguardando aprovação', fmt.int(rows.filter(s => ['em_analise', 'pendencia', 'proposta_enviada'].includes(s.status)).length), { foot: 'na implantação', onClick: () => App.go('/implantacao') }),
        App.kpi('Canceladas / recusadas', fmt.int(rows.filter(s => ['cancelada', 'recusada'].includes(s.status)).length), { state: 'var(--bad)' }));
      if (App.gestor()) clear(viewBar).append(U.tabs([{ key: 'geral', label: 'Geral' }, { key: 'equipe', label: 'Por equipe' }, { key: 'corretor', label: 'Por corretor' }], state.visao, k => { state.visao = k; load(); }));
      const ativos = [state.team_id ? ['Equipe', (App.lk.teamMap[state.team_id] || {}).nome, () => { state.team_id = null; load(); }] : null, state.corretor_id ? ['Corretor', (App.lk.userMap[state.corretor_id] || {}).nome, () => { state.corretor_id = null; load(); }] : null].filter(Boolean);
      const chips = ativos.length ? h('div', { class: 'row', style: { gap: '6px', marginBottom: '10px' } }, ativos.map(([l, n, fn]) => h('button', { class: 'chip-f', onclick: fn }, l + ': ' + (n || '—'), icon('x', 12)))) : null;
      if (state.visao === 'equipe') {
        const lista = grupos(rows, s => s.team_id, s => ({ id: s.team_id || '—', nome: s.team_nome || 'Sem equipe', supervisor: s.supervisor_nome, gerente: s.gerente_nome, corretores: new Set() }));
        rows.forEach(s => { const g = lista.find(x => x.id === (s.team_id || '—')); if (g && s.corretor_id) g.corretores.add(s.corretor_id); });
        clear(body).append(chips || '', h('div', { class: 'stack' }, App.card('Vendas por equipe', agrupado(lista, 'equipe'), { sub: 'Clique para ver as vendas da equipe' }),
          App.card('Produção por equipe', Charts.hbars(lista.map(g => ({ label: g.nome, value: g.valor, qtd: g.qtd })), { format: fmt.moneyShort, sub: x => x.qtd + ' venda(s)' }))));
      } else if (state.visao === 'corretor') {
        const lista = grupos(rows, s => s.corretor_id, s => { const u = App.lk.userMap[s.corretor_id] || {}; return { id: s.corretor_id, nome: s.corretor_nome || '—', equipe: s.team_nome, supervisor: s.supervisor_nome, grade: u.grade_nome ? { nome: u.grade_nome, cor: u.grade_cor } : null }; });
        clear(body).append(chips || '', App.card('Vendas por corretor', agrupado(lista, 'corretor'), { sub: 'Clique para ver as vendas do corretor' }));
      } else clear(body).append(chips || '', Views._salesTable(rows));
      clear(filters).append(App.periodPicker(state, load, ['mes', 'mes_anterior', 'trimestre', 'ano']), h('input', { type: 'search', class: 'search-f', placeholder: 'Cliente ou nº da proposta…', value: state.search, oninput: debounce(e => { state.search = e.target.value; load(); }, 300) }),
        h('select', { 'aria-label': 'Status', onchange: e => { state.status = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todos os status'), Object.entries(SALE).map(([v, [l]]) => h('option', { value: v, selected: state.status === v || null }, l))),
        ...App.hierFilters(state, load, { operadora: true, produto: true, origem: true, equipe: true }));
    };
    const exp = h('button', { class: 'btn', onclick: e => App.exportMenu(e.currentTarget, 'vendas-' + dates.today(), [{ label: 'Cliente', key: 'cliente_nome' }, { label: 'Nº proposta', key: 'numero_proposta' }, { label: 'Operadora', key: 'operadora_nome' }, { label: 'Produto', key: 'produto_nome' },
      { label: 'Vidas', key: 'num_vidas' }, { label: 'Mensal', key: 'valor_mensal' }, { label: 'Status', value: r => (SALE[r.status] || [r.status])[0] }, { label: 'Implantação', key: 'implantacao_etapa_nome' }, { label: 'Data venda', value: r => fmt.date(r.data_venda) }, { label: 'Vigência', value: r => r.vigencia ? fmt.date(r.vigencia) : '' },
      { label: 'Corretor', key: 'corretor_nome' }, { label: 'Supervisor', key: 'supervisor_nome' }, { label: 'Origem', key: 'origem_nome' }], rows) }, icon('download', 16), 'Exportar');
    wrap.append(App.pageHead('Vendas', { eyebrow: 'Módulo de vendas', desc: App.gestor() ? 'Visão geral, por equipe e por corretor — somente da sua estrutura.' : null, actions: [exp, h('button', { class: 'btn primary', onclick: () => Forms.saleForClient() }, icon('plus', 16), 'Nova venda')] }), filters, kpis, viewBar, body);
    await load();
    return wrap;
  };

  Views.venda = async function ({ id }) {
    const s = await API.get('v_sales', id);
    if (!s) return empty('Venda não encontrada', 'Ela não existe ou está fora da sua estrutura.', h('button', { class: 'btn', onclick: () => App.go('/vendas') }, 'Voltar'));
    const [impl, pend, docs, fus] = await Promise.all([API.list('v_implementations', { eq: { sale_id: id } }), API.all('v_pendencies', { eq: { sale_id: id }, order: [['created_at', false]] }),
      API.all('v_documents', { eq: { sale_id: id } }), API.all('v_followups', { eq: { sale_id: id } })]);
    const im = impl.rows[0];
    const ev = im ? await API.all('v_implementation_events', { eq: { implementation_id: im.id }, order: [['created_at', false]] }) : [];
    let com = [];
    if (App.can('comissoes.ver')) com = await API.all('v_commissions', { eq: { sale_id: id }, order: [['parcela', true]] });
    else com = (await API.rpc('minhas_comissoes', {})).filter(c => c.sale_id === id);
    const reload = () => App.reload();
    return h('div', null,
      App.pageHead(s.cliente_nome || 'Venda', { crumb: { label: 'Vendas', go: '/vendas' }, eyebrow: 'Venda' + (s.numero_proposta ? ' · proposta nº ' + s.numero_proposta : ''),
        actions: [h('button', { class: 'btn', onclick: () => App.go('/clientes/' + s.client_id) }, icon('clients', 16), 'Cliente'), s.lead_id ? h('button', { class: 'btn', onclick: () => App.go('/leads/' + s.lead_id) }, icon('leads', 16), 'Lead') : null,
          h('button', { class: 'btn primary', onclick: () => Forms.saleForClient(null, { existing: s, onDone: reload }) }, icon('edit', 16), 'Editar venda')] }),
      h('div', { class: 'grid g-side' },
        h('div', { class: 'stack' },
          App.card('Dados da venda', kv([['Status', Views._saleStatus(s.status)], ['Operadora', s.operadora_nome], ['Produto', s.produto_nome], ['Tipo de plano', s.tipo_plano], ['Vidas', s.num_vidas],
            ['Valor mensal', fmt.money(s.valor_mensal)], ['Data da venda', fmt.date(s.data_venda)], ['Etapa da implantação', s.implantacao_etapa_nome], ['Data de implantação', s.data_implantacao ? fmt.date(s.data_implantacao) : null],
            ['Vigência', s.vigencia ? fmt.date(s.vigencia) : null], ['Origem', [s.origem_nome, s.campanha_nome].filter(Boolean).join(' · ')], s.motivo_cancelamento ? ['Motivo cancelamento', s.motivo_cancelamento] : null])),
          im ? App.card('Implantação', h('div', { class: 'stack' }, h('div', { class: 'stage-track' }, implEtapas().map(([k, l, , sv], j, arr) => { const i = arr.findIndex(x => x[0] === im.etapa);
            return h('button', { class: 'stage-step' + (k === im.etapa ? (sv === 'pendencia' ? ' lost' : ' cur') : i >= 0 && j < i ? ' done' : ''), onclick: () => implDrawer(im, reload, k) }, l); })),
            kv([['Protocolo', im.protocolo ? h('span', { class: 'mono' }, im.protocolo) : null], ['Responsável', im.responsavel_nome], ['Na etapa há', fmt.hours(im.horas_na_etapa)]]),
            App.timeline(ev.map(e => ({ tipo: e.etapa === 'pendencia' ? 'pendencia' : e.etapa === 'implantado' ? 'implantacao' : 'status', titulo: (e.etapa_anterior && e.etapa_anterior !== e.etapa ? implNome(e.etapa_anterior) + ' → ' : '') + implNome(e.etapa), descricao: [e.descricao, e.protocolo ? 'Protocolo ' + e.protocolo : null].filter(Boolean).join(' · '), created_at: e.created_at, usuario_nome: e.usuario_nome })))),
            { right: h('button', { class: 'btn xs', onclick: () => implDrawer(im, reload) }, 'Atualizar etapa') }) : null,
          App.card('Comissões', com.length ? U.table([{ label: 'Parcela', render: c => h('b', null, c.parcela + 'ª') }, { label: 'Prevista para', render: c => fmt.date(c.data_prevista) },
            ...(App.can('comissoes.ver') ? [{ label: 'Corretora recebe', align: 'right', render: c => fmt.money(c.comissao_prevista) }, { label: 'Corretor', align: 'right', render: c => h('span', null, fmt.money(c.comissao_corretor), c.grade_nome ? h('div', { class: 'cell-sub' }, 'grade ' + c.grade_nome) : null) }, { label: 'Supervisor', align: 'right', render: c => fmt.money(c.comissao_supervisor) }, { label: 'Margem', align: 'right', render: c => fmt.money(c.comissao_empresa) }]
              : [{ label: 'Minha comissão', align: 'right', render: c => fmt.money(c.minha_comissao) }]),
            { label: 'Status', render: c => badge(c.status.replace('_', ' '), { prevista: 'var(--blue-2)', em_processamento: 'var(--cyan)', recebida: 'var(--ok)', paga: '#10B981', cancelada: 'var(--bad)', estornada: 'var(--bad)' }[c.status]) }], com, { dense: true })
            : h('div', { class: 'muted', style: { fontSize: '13px' } }, ['aprovada', 'implantada'].includes(s.status) && !App.can('comissoes.ver') ? 'Nenhuma parcela com comissão para você nesta venda.' : 'As comissões são geradas quando a operadora aprovar a venda (etapa "Aprovado" da implantação).'))),
        h('div', { class: 'stack' },
          App.card('Responsáveis', kv([['Corretor', App.person(s.corretor_nome)], ['Supervisor', s.supervisor_nome], ['Gerente', s.gerente_nome]])),
          App.card('Pendências', pend.length ? h('div', { class: 'list' }, pend.map(p => h('div', { class: 'list-item clickable', onclick: () => Forms.pendency({}, { existing: p, onDone: reload }) },
            h('span', { class: 'sev', style: { '--c': p.status === 'aberta' ? 'var(--warn)' : 'var(--ok)' } }), h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, p.descricao), h('div', { class: 'li-sub' }, (p.status === 'aberta' ? 'Prazo ' + (p.prazo ? fmt.date(p.prazo) : '—') : 'Resolvida ' + fmt.rel(p.resolvida_em)))),
            p.atrasada ? badge('Atrasada', 'var(--bad)') : badge(p.status, p.status === 'aberta' ? 'var(--warn)' : 'var(--ok)'))))
            : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Nenhuma pendência.'), { right: h('button', { class: 'btn xs', onclick: () => Forms.pendency({ sale_id: s.id }, { onDone: reload }) }, icon('plus', 13), 'Pendência') }),
          App.card('Documentos', App.docsList(docs, reload), { right: h('button', { class: 'btn xs', onclick: () => Forms.document({ sale_id: s.id, nome: s.cliente_nome }, { onDone: reload }) }, icon('upload', 13), 'Anexar') }),
          App.card('Follow-ups', App.fuList(fus, reload), { right: h('button', { class: 'btn xs', onclick: () => Forms.followup({ sale_id: s.id, nome: s.cliente_nome, responsavel_id: s.corretor_id }, { onDone: reload }) }, icon('plus', 13), 'Agendar') }))));
  };

  // ------------------------------------------------------------------
  // IMPLANTAÇÃO
  // ------------------------------------------------------------------
  function implDrawer(im, onDone, etapaInicial) {
    const f = U.form([
      { name: 'etapa', label: 'Etapa', type: 'select', required: true, options: implEtapas(true).filter(x => x[0] === im.etapa || (App.lk.implStages.find(y => y.codigo === x[0]) || {}).ativo).map(([value, label]) => ({ value, label })) },
      { name: 'protocolo', label: 'Protocolo da operadora' },
      { name: 'obs', label: 'Observação (fica no histórico)', type: 'textarea', rows: 3, span: 2 },
    ], { etapa: etapaInicial || im.etapa, protocolo: im.protocolo }, { cols: 2 });
    const m = U.modal({ title: 'Atualizar implantação', subtitle: `${im.cliente_nome || ''} · ${im.operadora_nome || ''}`, size: 'md', body: h('div', { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0, fontSize: '12.5px' } }, 'A etapa da implantação sincroniza automaticamente o status da venda (análise, pendência, aprovada, implantada) e do cliente.'), f),
      footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => {
        const v = f.values();
        if (v.etapa === implCancel() && !(await confirmDialog({ title: 'Cancelar implantação', message: 'A venda será cancelada e as comissões previstas também. Confirmar?', confirm: 'Cancelar venda', danger: true }))) return;
        try { await API.rpc('avancar_implantacao', { p_impl: im.id, p_etapa: v.etapa, p_obs: v.obs, p_protocolo: v.protocolo }); m.close(); toast('Implantação atualizada'); App.refreshCounts(); onDone && onDone(); } catch (e) { App.err(e); } } }, 'Salvar')] });
  }
  Views.implantacao = async function (params) {
    const state = { f: params.q.f || null, corretor_id: null, operator_id: null };
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const board = h('div', { class: 'kanban impl-board' });
    const load = async () => {
      const o = { eq: {}, order: [['etapa_desde', true]] };
      if (state.corretor_id) o.eq.corretor_id = state.corretor_id;
      if (state.operator_id) o.eq.operator_id = state.operator_id;
      let rows = await API.all('v_implementations', o);
      rows = rows.filter(r => r.etapa_status_venda !== 'cancelada' && !(r.etapa_status_venda === 'implantada' && new Date(r.etapa_desde) < new Date(Date.now() - 30 * 864e5)));
      if (state.f === 'pendencia') rows = rows.filter(r => r.pendencias_abertas > 0 || r.etapa_status_venda === 'pendencia');
      if (state.f === 'paradas') rows = rows.filter(r => !['aprovada', 'implantada'].includes(r.venda_status) && r.horas_na_etapa > 48);
      clear(board);
      implEtapas().forEach(([k, l, cor, sv]) => {
        const items = rows.filter(r => r.etapa === k);
        board.appendChild(h('div', { class: 'kcol' }, h('div', { class: 'kcol-head' }, h('div', { class: 'kcol-title', style: { '--c': cor } }, h('i'), l, h('span', { class: 'n' }, items.length)),
          h('div', { class: 'kcol-sum' }, fmt.money0(U.sum(items, x => x.valor_mensal)) + '/mês' + (sv === 'implantada' ? ' · últimos 30 dias' : ''))),
          h('div', { class: 'kcol-body' }, items.length ? items.map(r => h('div', { class: 'kcard', style: { cursor: 'pointer' }, onclick: () => App.go('/vendas/' + r.sale_id) },
            h('div', { class: 'kcard-top' }, h('div', { class: 'kcard-name' }, r.cliente_nome || '—'),
              r.lead_id ? h('button', { class: 'icon-btn sm', title: 'Abrir o lead no CRM', 'aria-label': 'Abrir lead', onclick: e => { e.stopPropagation(); App.go('/leads/' + r.lead_id); } }, icon('leads', 15)) : null,
              h('button', { class: 'icon-btn sm', title: 'Atualizar etapa', 'aria-label': 'Atualizar etapa', onclick: e => { e.stopPropagation(); implDrawer(r, load); } }, icon('arrowRight', 15))),
            h('div', { class: 'kcard-meta' }, h('span', null, icon('building', 12), r.operadora_nome || '—'), h('span', null, icon('users', 12), r.num_vidas + ' vida(s)'), r.protocolo ? h('span', { class: 'mono' }, r.protocolo) : null),
            h('div', { class: 'kcard-foot' }, h('span', { class: 'kcard-val' }, fmt.money0(r.valor_mensal)), h('span', { class: r.horas_na_etapa > 72 && sv !== 'implantada' ? 'late' : 'muted' }, fmt.hours(r.horas_na_etapa) + ' na etapa'),
              h('span', { class: 'grow' }), r.pendencias_abertas ? badge(r.pendencias_abertas + ' pend.', 'var(--warn)') : null, U.avatar(r.corretor_nome, 22)))) : h('div', { class: 'kmore' }, 'Nenhuma venda nesta etapa'))));
      });
    };
    const sel = (k, label, o) => h('select', { 'aria-label': label, onchange: e => { state[k] = e.target.value || null; load(); } }, h('option', { value: '' }, label), o.map(x => h('option', { value: x.value, selected: state[k] === x.value || null }, x.label)));
    filters.append(sel('f', 'Todas', [{ value: 'pendencia', label: 'Somente com pendência' }, { value: 'paradas', label: 'Paradas há mais de 48h' }]), App.gestor() ? sel('corretor_id', 'Todos os corretores', App.opt.corretores()) : null, sel('operator_id', 'Todas as operadoras', App.opt.ops()));
    wrap.append(App.pageHead('Implantação', { eyebrow: 'Pós-venda operacional', desc: 'Lead aprovado no CRM entra aqui automaticamente: ' + implEtapas().map(x => x[1]).join(' → ') + '.',
      actions: App.is('admin') ? [h('button', { class: 'btn', onclick: () => App.go('/configuracoes/funil') }, icon('settings', 15), 'Editar etapas')] : null }), filters, board);
    await load();
    return wrap;
  };

  // ------------------------------------------------------------------
  // CLIENTES
  // ------------------------------------------------------------------
  Views.clientes = async function (params) {
    const state = { page: 0, size: 25, status: params.q.status || null, operator_id: null, corretor_id: null, search: '' };
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div');
    const load = async () => {
      const o = { eq: {}, order: [['created_at', false]], limit: state.size, offset: state.page * state.size, count: true };
      ['status', 'operator_id', 'corretor_id'].forEach(k => { if (state[k]) o.eq[k] = state[k]; });
      if (state.search) { const d = U.digits(state.search); o.search = d.length >= 4 && d.length === state.search.replace(/[\s./-]/g, '').length ? { cols: ['cpf', 'cnpj', 'whatsapp', 'telefone'], term: d } : { cols: ['nome', 'razao_social', 'email', 'numero_proposta', 'carteirinha'], term: state.search }; }
      clear(body).appendChild(U.skeleton(6));
      const { rows, count } = await API.list('v_clients', o);
      clear(body).append(Views._clientsTable(rows), U.pager(state.page, state.size, count, p => { state.page = p; load(); }));
    };
    const sel = (k, label, o) => h('select', { 'aria-label': label, onchange: e => { state[k] = e.target.value || null; state.page = 0; load(); } }, h('option', { value: '' }, label), o.map(x => h('option', { value: x.value, selected: state[k] === x.value || null }, x.label)));
    filters.append(h('input', { type: 'search', class: 'search-f', placeholder: 'Nome, CPF/CNPJ, e-mail, carteirinha…', oninput: debounce(e => { state.search = e.target.value.trim(); state.page = 0; load(); }, 300) }),
      sel('status', 'Todos os status', Object.entries(CLI).map(([value, [label]]) => ({ value, label }))), sel('operator_id', 'Todas as operadoras', App.opt.ops()), App.gestor() ? sel('corretor_id', 'Todos os corretores', App.opt.corretores()) : null);
    wrap.append(App.pageHead('Clientes', { eyebrow: 'Carteira de clientes', actions: [h('button', { class: 'btn primary', onclick: () => Forms.client() }, icon('plus', 16), 'Novo cliente')] }), filters, body);
    await load();
    return wrap;
  };

  Views.cliente360 = async function ({ id }) {
    const c = await API.get('v_clients', id);
    if (!c) return empty('Cliente não encontrado', 'Ele não existe ou não está sob sua responsabilidade.', h('button', { class: 'btn', onclick: () => App.go('/clientes') }, 'Voltar'));
    const [deps, sales, docs, notes, acts, fus, props, hist] = await Promise.all([
      API.all('v_dependents', { eq: { client_id: id }, order: [['nome', true]] }), API.all('v_sales', { eq: { client_id: id }, order: [['data_venda', false]] }),
      API.all('v_documents', { eq: { client_id: id }, order: [['created_at', false]] }), API.all('v_notes', { eq: { client_id: id } }),
      API.all('v_activities', { eq: { client_id: id }, order: [['realizado_em', false]] }), API.all('v_followups', { eq: { client_id: id }, order: [['agendado_para', false]] }),
      API.all('v_proposals', { eq: { client_id: id }, order: [['created_at', false]] }), c.lead_id ? API.all('v_lead_history', { eq: { lead_id: c.lead_id }, order: [['created_at', false]] }) : [],
    ]);
    let com = [];
    const saleIds = new Set(sales.map(s => s.id));
    if (App.can('comissoes.ver')) com = await API.all('v_commissions', { eq: { client_id: id }, order: [['data_prevista', false]] });
    else com = (await API.rpc('minhas_comissoes', {})).filter(x => saleIds.has(x.sale_id));
    { const pri = {}; com.forEach(x => { if (!pri[x.sale_id] || x.data_prevista < pri[x.sale_id]) pri[x.sale_id] = x.data_prevista; });
      com.sort((a, b) => pri[b.sale_id].localeCompare(pri[a.sale_id]) || String(a.sale_id).localeCompare(String(b.sale_id)) || a.parcela - b.parcela); }
    const reload = () => App.reload();
    const tel = c.whatsapp || c.telefone;
    const relacionamento = [
      ...acts.map(a => ({ tipo: a.tipo, titulo: ({ ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', visita: 'Visita' }[a.tipo] || 'Contato') + (a.efetivo ? '' : ' — sem sucesso'), descricao: a.descricao, created_at: a.realizado_em, usuario_nome: a.usuario_nome })),
      ...fus.filter(f => f.status === 'concluido').map(f => ({ tipo: 'followup', titulo: 'Follow-up concluído', descricao: f.resultado, created_at: f.concluido_em, usuario_nome: f.responsavel_nome })),
      ...hist,
    ].sort((a, b) => a.created_at < b.created_at ? 1 : -1);
    const endereco = [c.endereco, c.numero, c.complemento, c.bairro, c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade, c.cep ? 'CEP ' + c.cep : null].filter(Boolean).join(', ');
    return h('div', null,
      App.pageHead(c.nome, { crumb: { label: 'Clientes', go: '/clientes' }, eyebrow: 'Visão 360° do cliente',
        actions: [tel ? h('a', { class: 'btn', href: U.waLink(tel), target: '_blank', rel: 'noopener', style: { color: 'var(--ok-text)' } }, icon('whatsapp', 16), 'WhatsApp') : null,
          h('button', { class: 'btn', onclick: () => Forms.activity({ client_id: c.id, nome: c.nome }, { onDone: reload }) }, icon('phone', 16), 'Registrar atendimento'),
          h('button', { class: 'btn', onclick: () => Forms.followup({ client_id: c.id, nome: c.nome, responsavel_id: c.corretor_id }, { onDone: reload }) }, icon('clock', 16), 'Follow-up'),
          h('button', { class: 'btn primary', onclick: () => Forms.saleForClient(c) }, icon('plus', 16), 'Nova venda'),
          h('button', { class: 'icon-btn', 'aria-label': 'Mais ações', onclick: e => menu(e.currentTarget, [
            { label: 'Editar cliente', icon: 'edit', onClick: () => Forms.client(c, { onDone: reload }) },
            { label: 'Adicionar dependente', icon: 'users', onClick: () => Forms.dependent(c, { onDone: reload }) },
            { label: 'Anexar documento', icon: 'clip', onClick: () => Forms.document({ client_id: c.id, nome: c.nome }, { onDone: reload }) },
            App.can('clientes.transferir') ? { label: 'Transferir para outro corretor', icon: 'shuffle', onClick: () => Forms.transferClient(c, { onDone: reload }) } : null,
            c.lead_id ? { label: 'Abrir lead de origem', icon: 'leads', onClick: () => App.go('/leads/' + c.lead_id) } : null]) }, icon('more'))] }),
      h('div', { class: 'row wrap', style: { marginTop: '-8px', marginBottom: '16px' } }, cliStatus(c.status), App.person(c.corretor_nome, 22), c.operadora_nome ? badge(c.operadora_nome, 'var(--blue-2)', 'square') : null),
      h('div', { class: 'grid g-side' },
        h('div', { class: 'stack' },
          App.card('Dados cadastrais', kv([['Tipo', c.tipo_pessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'], c.razao_social ? ['Razão social', c.razao_social] : null, ['CPF / CNPJ', fmt.doc(c.cnpj || c.cpf)],
            ['Nascimento', c.data_nascimento ? fmt.date(c.data_nascimento) : null], ['WhatsApp', c.whatsapp ? fmt.phone(c.whatsapp) : null], ['Telefone', c.telefone ? fmt.phone(c.telefone) : null], ['E-mail', c.email], ['Endereço', endereco]]),
            { right: h('button', { class: 'btn xs', onclick: () => Forms.client(c, { onDone: reload }) }, icon('edit', 13), 'Editar') }),
          App.card('Plano atual', kv([['Operadora', c.operadora_nome], ['Plano', c.produto_nome], ['Vidas', c.num_vidas], ['Valor mensal', c.valor_mensal ? fmt.money(c.valor_mensal) : null], ['Nº da proposta', c.numero_proposta ? h('span', { class: 'mono' }, c.numero_proposta) : null],
            ['Carteirinha', c.carteirinha ? h('span', { class: 'mono' }, c.carteirinha) : null], ['Data da venda', c.data_venda ? fmt.date(c.data_venda) : null], ['Vigência', c.vigencia ? fmt.date(c.vigencia) : null]])),
          App.card('Dependentes', deps.length ? U.table([{ label: 'Nome', render: d => h('span', { class: 'cell-main' }, d.nome) }, { label: 'Parentesco', key: 'parentesco' }, { label: 'Nascimento', render: d => d.data_nascimento ? fmt.date(d.data_nascimento) : '—' },
            { label: 'CPF', render: d => d.cpf ? fmt.cpf(d.cpf) : '—' }, { label: 'Valor', align: 'right', render: d => d.valor ? fmt.money(d.valor) : '—' }, { label: 'Status', render: d => badge(d.status, d.status === 'ativo' ? 'var(--ok)' : 'var(--muted)') }], deps, { dense: true, onRow: d => Forms.dependent(c, { existing: d, onDone: reload }) })
            : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Nenhum dependente cadastrado.'), { right: h('button', { class: 'btn xs', onclick: () => Forms.dependent(c, { onDone: reload }) }, icon('plus', 13), 'Dependente') }),
          App.card('Histórico de contratos', Views._salesTable(sales)),
          props.length ? App.card('Propostas anteriores', Views._proposalsTable(props, { compact: true, onRow: p => Forms.proposal({ nome: c.nome }, { existing: p, onDone: reload }) })) : null,
          App.card('Pagamentos e comissões relacionadas', com.length ? U.table([{ label: 'Parcela', render: x => x.parcela + 'ª' }, { label: 'Previsto', render: x => fmt.date(x.data_prevista) }, { label: 'Recebido', render: x => x.data_recebida ? fmt.date(x.data_recebida) : '—' },
            { label: App.can('comissoes.ver') ? 'Comissão (empresa)' : 'Minha comissão', align: 'right', render: x => fmt.money(App.can('comissoes.ver') ? x.comissao_prevista : x.minha_comissao) }, { label: 'Status', render: x => badge(x.status.replace('_', ' '), 'var(--blue-2)') }], com, { dense: true })
            : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Sem comissões visíveis para o seu perfil.'))),
        h('div', { class: 'stack' },
          App.card('Responsável', kv([['Corretor', App.person(c.corretor_nome)], ['Supervisor', c.supervisor_nome], ['Gerente', c.gerente_nome]]),
            { right: App.can('clientes.transferir') ? h('button', { class: 'btn xs', onclick: () => Forms.transferClient(c, { onDone: reload }) }, icon('shuffle', 13), 'Transferir') : null }),
          App.card('Follow-ups', App.fuList(fus.filter(f => f.status === 'pendente'), reload), { right: h('button', { class: 'btn xs', onclick: () => Forms.followup({ client_id: c.id, nome: c.nome, responsavel_id: c.corretor_id }, { onDone: reload }) }, icon('plus', 13), 'Agendar') }),
          App.card('Documentos', App.docsList(docs, reload), { right: h('button', { class: 'btn xs', onclick: () => Forms.document({ client_id: c.id, nome: c.nome }, { onDone: reload }) }, icon('upload', 13), 'Anexar') }),
          App.card('Observações', App.notesBlock(notes, { client_id: c.id }, reload)),
          App.card('Histórico de relacionamento', App.timeline(relacionamento.slice(0, 40))))));
  };
})(window);
