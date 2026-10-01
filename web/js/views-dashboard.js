/* =====================================================================
   ATOS SISTEMA — views-dashboard.js
   Dashboard (por papel), Minha Carteira e Inteligência Comercial.
   Os números vêm de RPCs SECURITY INVOKER: o banco já filtra pela
   hierarquia do usuário logado.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, avatar, badge } = global.U;
  const API = global.API, App = global.App, Charts = global.Charts, Views = global.Views;

  const escopoTexto = () => {
    if (App.is('admin')) return 'Toda a operação';
    if (App.is('gerente')) return `Sua gerência · ${App.lk.teams.length} equipe(s) · ${App.lk.corretores.length} corretor(es)`;
    if (App.is('supervisor')) return `${App.me.team_nome || 'Sua equipe'} · ${App.lk.corretores.length} corretor(es)`;
    return 'Somente a sua carteira';
  };
  const prevPeriod = (ini, fim) => { const a = U.toDate(ini), b = U.toDate(fim); const d = Math.round((b - a) / 864e5) + 1; return [dates.addDays(ini, -d), dates.addDays(ini, -1)]; };
  function delta(cur, prev, { inverse = false, pp = false } = {}) {
    if (prev === null || prev === undefined || cur === null || cur === undefined) return null;
    const diff = pp ? cur - prev : (prev === 0 ? (cur ? 100 : 0) : 100 * (cur - prev) / Math.abs(prev));
    if (Math.abs(diff) < 0.05) return h('span', { class: 'muted' }, '= período anterior');
    const good = inverse ? diff < 0 : diff > 0;
    return h('span', { class: good ? 'ok-t' : 'bad-t' }, (diff > 0 ? '▲ ' : '▼ ') + fmt.num(Math.abs(diff)) + (pp ? ' p.p.' : '%'), h('span', { class: 'muted' }, ' vs anterior'));
  }
  function kpi(label, value, { foot, hero, onClick, state } = {}) {
    return h('div', { class: 'kpi' + (hero ? ' hero' : '') + (onClick ? ' link' : ''), onclick: onClick || null, role: onClick ? 'button' : null, tabindex: onClick ? '0' : null },
      state ? h('span', { class: 'state', style: { background: state } }) : null,
      h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), foot ? h('div', { class: 'kpi-foot' }, foot) : null);
  }
  const card = (title, body, { sub, right, cls = '' } = {}) => h('section', { class: 'card ' + cls }, h('div', { class: 'card-head' }, h('h3', null, title), sub ? h('span', { class: 'sub' }, sub) : null, right ? h('div', { class: 'right' }, right) : null), h('div', { class: 'card-body' }, body));
  App.card = card; App.kpi = kpi;

  function attention(a) {
    const it = (n, t, c, go) => h('button', { class: 'att' + (n ? '' : ' zero'), style: { '--c': c }, onclick: () => App.go(go) }, h('span', { class: 'att-bar' }), h('span', { class: 'att-n' }, fmt.int(n)), h('span', { class: 'att-t' }, t));
    return h('div', { class: 'attention' },
      a.sla_atrasado !== undefined ? it(a.sla_atrasado, 'leads com SLA estourado', 'var(--bad)', '/leads?f=sla') : null,
      it(a.leads_sem_contato, 'leads sem contato', 'var(--bad)', '/leads?f=sem_contato'),
      it(a.followups_vencidos, 'follow-ups vencidos', 'var(--bad)', '/followups?aba=atrasado'),
      a.implantacoes_paradas !== undefined ? it(a.implantacoes_paradas, 'implantações paradas há mais de 48h', 'var(--warn)', '/implantacao?f=paradas') : null,
      it(a.vendas_pendencia, 'vendas com pendências', 'var(--warn)', '/implantacao?f=pendencia'),
      it(a.quentes_sem_interacao, 'leads quentes sem interação hoje', 'var(--cyan)', '/leads?f=quentes_sem_interacao'));
  }

  /** Painel reutilizável (dashboard geral e dashboard de um corretor) */
  async function painel(state, { fixo = {}, titulo = true } = {}) {
    const f = { ...App.filtrosAtivos(state), ...fixo };
    const [pi, pf] = prevPeriod(state.ini, state.fim);
    const [d, p] = await Promise.all([
      API.rpc('dashboard_metricas', { p_inicio: state.ini, p_fim: state.fim, p_filtros: f }),
      API.rpc('dashboard_metricas', { p_inicio: pi, p_fim: pf, p_filtros: f }),
    ]);
    const c = d.cards, cp = p.cards;
    const gestao = App.gestor() && !fixo.corretor_id;
    const metaFoot = c.meta_valor ? `${fmt.money0(c.realizado_mes)} de ${fmt.money0(c.meta_valor)}` : 'Meta não definida';

    const out = h('div', { class: 'stack', style: { gap: '0' } });
    out.append(
      h('div', { class: 'section-title', style: { marginTop: titulo ? '0' : '8px' } }, 'Precisa de atenção'),
      attention(d.atencao),
      h('div', { class: 'section-title' }, 'Resultado do período'),
      h('div', { class: 'grid g-kpi-meta' },
        h('div', { class: 'kpis k3' },
          kpi('Valor vendido (mensalidades)', fmt.money0(c.valor_vendido), { hero: true, foot: delta(c.valor_vendido, cp.valor_vendido) }),
          kpi('Vendas aprovadas', fmt.int(c.vendas_aprovadas), { foot: delta(c.vendas_aprovadas, cp.vendas_aprovadas), onClick: () => App.go('/vendas') }),
          kpi('Ticket médio', fmt.money0(c.ticket_medio), { foot: delta(c.ticket_medio, cp.ticket_medio) }),
          kpi('Vidas vendidas', fmt.int(c.vidas_vendidas), { foot: delta(c.vidas_vendidas, cp.vidas_vendidas) }),
          kpi('Conversão de leads', fmt.pct(c.conversao_leads), { foot: delta(c.conversao_leads, cp.conversao_leads, { pp: true }) }),
          kpi('Em implantação', fmt.int(c.vendas_em_implantacao || 0), { foot: 'aguardando aprovação da operadora', onClick: () => App.go('/implantacao') })),
        h('div', { class: 'kpi', style: { alignItems: 'center', justifyContent: 'center', gap: '4px' } },
          h('div', { class: 'kpi-label' }, 'Meta do mês'), Charts.ring(c.meta_pct, { size: 104 }), h('div', { class: 'kpi-foot', style: { textAlign: 'center' } }, metaFoot))),
      h('div', { class: 'kpis', style: { marginTop: '10px' } },
        kpi('Leads recebidos', fmt.int(c.leads_recebidos), { foot: delta(c.leads_recebidos, cp.leads_recebidos), onClick: () => App.go('/leads') }),
        kpi('Leads novos', fmt.int(c.leads_novos), { onClick: () => App.go('/leads?status=novo'), state: c.leads_novos ? 'var(--blue)' : null }),
        kpi('Em atendimento', fmt.int(c.leads_atendimento), { onClick: () => App.go('/crm') }),
        kpi('Em negociação', fmt.int(c.leads_negociacao), { onClick: () => App.go('/crm') }),
        kpi('Cotações enviadas', fmt.int(c.cotacoes_enviadas), { foot: delta(c.cotacoes_enviadas, cp.cotacoes_enviadas) }),
        kpi('Vendas implantadas', fmt.int(c.vendas_implantadas), { onClick: () => App.go('/implantacao') }),
        kpi('Vendas canceladas', fmt.int(c.vendas_canceladas), { state: c.vendas_canceladas ? 'var(--bad)' : null, foot: delta(c.vendas_canceladas, cp.vendas_canceladas, { inverse: true }) }),
        kpi('Clientes ativos', fmt.int(c.clientes_ativos), { onClick: () => App.go('/clientes?status=ativo') }),
        kpi('Follow-ups atrasados', fmt.int(c.followups_atrasados), { state: c.followups_atrasados ? 'var(--bad)' : 'var(--ok)', onClick: () => App.go('/followups?aba=atrasado') }),
        kpi('Tarefas pendentes', fmt.int(c.tarefas_pendentes), { onClick: () => App.go('/tarefas') })),
      h('div', { class: 'section-title' }, 'Funil e produção'),
      h('div', { class: 'grid g-main' },
        card('Funil comercial', Charts.funnel(d.funil, { onClick: s => App.go('/leads?etapa=' + s.etapa) }), { sub: 'Leads que entraram no período e chegaram a cada etapa' }),
        card('SLA de atendimento', h('div', { class: 'stack' },
          h('div', { class: 'kpis', style: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))' } },
            kpi('Tempo médio até 1º contato', fmt.minutes(d.sla.tempo_medio_min)),
            kpi('Sem atendimento', fmt.int(d.sla.sem_atendimento), { state: d.sla.sem_atendimento ? 'var(--bad)' : 'var(--ok)', onClick: () => App.go('/leads?f=sem_contato') }),
            kpi(`Atendidos em até ${d.sla.meta1_min} min`, fmt.pct(d.sla.pct_meta1)),
            kpi(`Atendidos em até ${d.sla.meta2_min} min`, fmt.pct(d.sla.pct_meta2))),
          h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Tempo entre a distribuição do lead e o primeiro contato registrado. Metas configuráveis em Configurações.')))),
      h('div', { class: 'grid g2', style: { marginTop: '14px' } },
        card('Vendas por mês', Charts.columns(d.vendas_mes.map(m => ({ label: fmt.month(m.mes), value: m.valor })), { format: fmt.moneyShort, barLabel: 'Valor vendido (mensalidades)' }), { sub: 'Últimos 12 meses' }),
        card('Meta × realizado', Charts.columns(d.metas_mes.map(m => ({ label: fmt.month(m.mes), value: m.realizado, line: m.meta })), { format: fmt.moneyShort, color: 'var(--blue-2)', barLabel: 'Realizado', lineLabel: 'Meta' }), { sub: 'Evolução das metas — 6 meses' })),
      h('div', { class: 'grid g3', style: { marginTop: '14px' } },
        card('Vendas por operadora', Charts.hbars(d.por_operadora.map(x => ({ label: x.nome, value: x.valor, qtd: x.qtd })), { format: fmt.moneyShort, sub: x => x.qtd + ' venda(s)' })),
        card('Vendas por produto', Charts.hbars(d.por_produto.slice(0, 8).map(x => ({ label: x.nome, value: x.valor, qtd: x.qtd })), { format: fmt.moneyShort, color: 'var(--cyan)', sub: x => x.qtd + ' venda(s)' })),
        card('Origem dos leads', Charts.hbars(d.por_origem.slice(0, 8).map(x => ({ label: x.nome, value: x.leads, conv: x.conversao })), { color: 'var(--blue-2)', sub: x => fmt.pct(x.conv) + ' conv.' }), { sub: 'Leads e conversão' })));

    if (gestao) {
      out.append(h('div', { class: 'section-title' }, 'Equipe'),
        h('div', { class: 'grid g2' },
          card('Vendas por corretor', Charts.hbars(d.por_corretor.slice(0, 10).map(x => ({ label: x.nome, value: x.valor, qtd: x.qtd, id: x.id })), { format: fmt.moneyShort, sub: x => x.qtd + ' venda(s)', onClick: x => App.go('/equipe/' + x.id) })),
          card('Conversão por corretor', Charts.hbars(d.conversao_corretor.slice(0, 10).map(x => ({ label: x.nome, value: x.conversao, leads: x.leads, id: x.id })), { format: fmt.pct, max: 100, color: 'var(--ok)', sub: x => x.leads + ' leads', onClick: x => App.go('/equipe/' + x.id) }))),
        h('div', { class: 'grid g2', style: { marginTop: '14px' } },
          card('Vendas por equipe', Charts.hbars((d.por_equipe || []).map(x => ({ label: x.nome, value: x.valor, qtd: x.qtd, id: x.id })), { format: fmt.moneyShort, color: '#8B7CF6', sub: x => x.qtd + ' venda(s)', onClick: x => x.id && App.go('/vendas?visao=corretor&equipe=' + x.id) }), { right: h('button', { class: 'btn xs ghost', onclick: () => App.go('/vendas?visao=equipe') }, 'Detalhar') }),
          App.is('admin', 'gerente') ? card('Vendas por supervisor', Charts.hbars(d.por_supervisor.map(x => ({ label: x.nome, value: x.valor, qtd: x.qtd })), { format: fmt.moneyShort, color: 'var(--blue-2)', sub: x => x.qtd + ' venda(s)' })) : null,
          card('Conversão por equipe', Charts.hbars(d.conversao_equipe.map(x => ({ label: x.nome, value: x.conversao, leads: x.leads })), { format: fmt.pct, max: 100, color: 'var(--ok)', sub: x => x.leads + ' leads' }))));
      if (App.is('admin', 'gerente')) out.append(h('div', { style: { marginTop: '14px' } }, await comparativoSupervisores(state)));
    }
    return out;
  }
  App.painel = painel;

  async function comparativoSupervisores(state) {
    const dp = await API.rpc('desempenho_corretores', { p_inicio: state.ini, p_fim: state.fim, p_filtros: App.filtrosAtivos(state) });
    const g = new Map();
    dp.forEach(r => { const k = r.supervisor_id || '-'; if (!g.has(k)) g.set(k, { id: k, nome: r.supervisor || 'Sem supervisor', equipe: r.equipe, corretores: 0, leads: 0, vendas: 0, valor: 0, vidas: 0, conv: 0, meta: 0, real: 0, atras: 0 });
      const x = g.get(k); x.corretores++; x.leads += r.leads_recebidos; x.vendas += r.vendas; x.valor += r.valor; x.vidas += r.vidas; x.conv += r.convertidos; x.meta += r.meta || 0; x.real += r.realizado_mes; x.atras += r.followups_atrasados; });
    const rows = [...g.values()].sort((a, b) => b.valor - a.valor);
    return card('Comparativo entre supervisores', U.table([
      { label: 'Supervisor', render: r => h('div', null, h('div', { class: 'cell-main' }, r.nome), h('div', { class: 'cell-sub' }, (r.equipe || '') + ' · ' + r.corretores + ' corretor(es)')) },
      { label: 'Leads', align: 'right', render: r => fmt.int(r.leads) },
      { label: 'Vendas', align: 'right', render: r => fmt.int(r.vendas) },
      { label: 'Conversão', align: 'right', render: r => fmt.pct(r.leads ? 100 * r.conv / r.leads : 0) },
      { label: 'Produção', align: 'right', render: r => fmt.money0(r.valor) },
      { label: 'Vidas', align: 'right', render: r => fmt.int(r.vidas) },
      { label: 'Meta do mês', render: r => r.meta ? h('div', { style: { minWidth: '140px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px' } }, h('span', null, fmt.pct(100 * r.real / r.meta)), h('span', { class: 'muted' }, fmt.money0(r.meta))), h('div', { class: 'meta-bar' }, h('div', { style: { width: Math.min(100, 100 * r.real / r.meta) + '%' } }))) : '—' },
      { label: 'Follow-ups atrasados', align: 'right', render: r => r.atras ? h('span', { class: 'bad-t' }, r.atras) : '0' },
    ], rows), { sub: 'Equipes da estrutura' });
  }

  // ------------------------------------------------------------------
  // QUEM ESTÁ ONLINE
  // ------------------------------------------------------------------
  const SIT = { online: ['Online', 'var(--ok)'], ausente: ['Ausente', 'var(--warn)'], offline: ['Offline', 'var(--muted)'] };
  const presDot = s => h('span', { class: 'pres-dot ' + s, title: SIT[s][0] });
  async function onlineCard() {
    const body = h('div', null, U.skeleton(2));
    const el = card('Quem está online agora', body, { sub: 'Atualiza sozinho', right: h('button', { class: 'btn xs ghost', onclick: () => App.go('/online') }, 'Ver equipe') , cls: 'online-card' });
    const paint = async () => {
      try {
        const rows = (await API.all('v_presence', {})).filter(r => r.id !== App.me.id);
        const on = rows.filter(r => r.situacao === 'online'), aus = rows.filter(r => r.situacao === 'ausente');
        clear(body).append(h('div', { class: 'row', style: { gap: '16px', flexWrap: 'wrap', marginBottom: '10px' } },
          h('div', { class: 'pres-kpi' }, presDot('online'), h('b', null, on.length), ' online'), h('div', { class: 'pres-kpi' }, presDot('ausente'), h('b', null, aus.length), ' ausente(s)'),
          h('div', { class: 'pres-kpi muted' }, presDot('offline'), h('b', null, rows.length - on.length - aus.length), ' offline')),
          on.length + aus.length ? h('div', { class: 'pres-list' }, [...on, ...aus].slice(0, 14).map(r => h('button', { class: 'pres-chip', title: `${r.nome} · ${r.tela || ''} · visto ${fmt.rel(r.visto_em)}`, onclick: () => r.papel === 'corretor' ? App.go('/equipe/' + r.id) : App.go('/online') },
            h('span', { class: 'pres-av' }, avatar(r.nome, 26), presDot(r.situacao)), h('span', { class: 'pres-name' }, r.nome.split(' ').slice(0, 2).join(' '), h('small', null, r.tela || App.PAPEIS[r.papel]))))) : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Ninguém da sua estrutura está online agora.'));
      } catch (e) { clear(body).appendChild(h('div', { class: 'muted' }, 'Presença indisponível.')); }
    };
    await paint();
    const t = setInterval(() => { if (!document.body.contains(el)) return clearInterval(t); paint(); }, 30000);
    return el;
  }
  Views.online = async function () {
    if (!App.can('presenca.ver')) return empty('Acesso restrito', 'Somente a gestão com permissão vê quem está online.');
    const state = { sit: 'todos', team: null, busca: '' };
    const wrap = h('div'); const bar = h('div', { class: 'filters' }); const body = h('div'); const kpis = h('div', { class: 'kpis', style: { marginBottom: '14px' } });
    let rows = [];
    const paint = () => {
      const t = state.busca.toLowerCase();
      const vis = rows.filter(r => (state.sit === 'todos' || r.situacao === state.sit) && (!state.team || r.team_id === state.team) && (!t || r.nome.toLowerCase().includes(t)))
        .sort((a, b) => ['online', 'ausente', 'offline'].indexOf(a.situacao) - ['online', 'ausente', 'offline'].indexOf(b.situacao) || (b.visto_em || '').localeCompare(a.visto_em || ''));
      const c = k => rows.filter(r => r.situacao === k).length;
      clear(kpis).append(App.kpi('Online agora', fmt.int(c('online')), { hero: true, state: 'var(--ok)', onClick: () => { state.sit = 'online'; paint(); } }), App.kpi('Ausentes (sem ação há 2–15 min)', fmt.int(c('ausente')), { state: 'var(--warn)', onClick: () => { state.sit = 'ausente'; paint(); } }),
        App.kpi('Offline', fmt.int(c('offline')), { onClick: () => { state.sit = 'offline'; paint(); } }), App.kpi('Atividades registradas hoje', fmt.int(U.sum(rows, r => Number(r.atividades_hoje) || 0))));
      clear(body).appendChild(U.table([
        { label: 'Pessoa', render: r => h('div', { class: 'person' }, h('span', { class: 'pres-av' }, avatar(r.nome, 30), presDot(r.situacao)), h('div', null, h('div', { class: 'cell-main' }, r.nome), h('div', { class: 'cell-sub' }, [App.PAPEIS[r.papel], r.team_nome].filter(Boolean).join(' · ')))) },
        { label: 'Situação', render: r => badge(SIT[r.situacao][0], SIT[r.situacao][1], 'dot') },
        { label: 'Onde está', render: r => r.situacao === 'offline' ? h('span', { class: 'dim' }, '—') : (r.tela || '—') },
        { label: 'Última atividade', render: r => r.visto_em ? h('span', { title: fmt.datetime(r.visto_em) }, fmt.rel(r.visto_em)) : h('span', { class: 'dim' }, 'nunca acessou') },
        { label: 'Conectado desde', render: r => r.situacao !== 'offline' && r.entrou_em ? fmt.time(r.entrou_em) : '—' },
        { label: 'Dispositivo', render: r => h('span', { class: 'muted' }, r.dispositivo || '—') },
        { label: 'Atividades hoje', align: 'right', render: r => fmt.int(r.atividades_hoje || 0) },
        App.is('admin', 'gerente') ? { label: 'Supervisor', render: r => r.supervisor_nome || '—' } : null,
      ].filter(Boolean), vis, { onRow: r => r.papel === 'corretor' && App.go('/equipe/' + r.id), emptyText: 'Ninguém nesta situação.' }));
    };
    const load = async () => { rows = (await API.all('v_presence', { order: [['nome', true]] })).filter(r => r.id !== App.me.id); paint(); };
    bar.append(h('div', { class: 'seg' }, [['todos', 'Todos'], ['online', 'Online'], ['ausente', 'Ausentes'], ['offline', 'Offline']].map(([k, l]) => h('button', { class: state.sit === k ? 'on' : '', onclick: e => { state.sit = k; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); paint(); } }, l))),
      h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar pessoa…', oninput: e => { state.busca = e.target.value; paint(); } }),
      App.is('admin', 'gerente') ? h('select', { 'aria-label': 'Equipe', onchange: e => { state.team = e.target.value || null; paint(); } }, h('option', { value: '' }, 'Todas as equipes'), App.opt.teams().map(o => h('option', { value: o.value }, o.label))) : null,
      h('span', { class: 'grow' }), h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Atualiza a cada 20 segundos'));
    wrap.append(App.pageHead('Quem está online', { eyebrow: 'Equipe em tempo real', desc: 'Presença da sua estrutura: quem está conectado, em qual tela e a última atividade. Online = ação nos últimos 2 minutos.' }), kpis, bar, body);
    await load();
    const t = setInterval(() => { if (!document.body.contains(wrap)) return clearInterval(t); load().catch(() => {}); }, 20000);
    return wrap;
  };

  // ------------------------------------------------------------------
  Views.dashboard = async function () {
    const state = Object.assign(App.initPeriod('mes'), U.store('dash.f') || {});
    const wrap = h('div');
    const body = h('div');
    const render = async () => {
      U.store('dash.f', App.filtrosAtivos(state));
      clear(body).appendChild(U.skeleton(10));
      try { const [p, oc] = await Promise.all([painel(state), App.can('presenca.ver') ? onlineCard() : null]); clear(body).append(oc || '', p); } catch (e) { clear(body).appendChild(empty('Erro ao carregar o dashboard', e.message)); }
      clear(filters).append(App.periodPicker(state, render, ['hoje', 'semana', 'mes', 'mes_anterior', 'trimestre', 'ano']),
        ...App.hierFilters(state, render, { equipe: true, operadora: true, produto: true, origem: true, campanha: true }));
    };
    const filters = h('div', { class: 'filters' });
    const first = App.me.nome.split(' ')[0];
    wrap.append(App.pageHead('Dashboard', { eyebrow: `Olá, ${first} · ${escopoTexto()}`, actions: [h('button', { class: 'btn', onclick: () => App.go('/inteligencia') }, icon('sparkles', 16), 'Inteligência comercial')] }), filters, body);
    render();
    return wrap;
  };

  // ------------------------------------------------------------------
  // MINHA CARTEIRA (corretor)
  // ------------------------------------------------------------------
  Views.carteira = async function (params) {
    const state = App.initPeriod('mes');
    const wrap = h('div');
    const aba = params.q.aba || 'hoje';
    const agoraIso = new Date().toISOString();
    const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
    const [d, fus, quentes, dp] = await Promise.all([
      API.rpc('dashboard_metricas', { p_inicio: state.ini, p_fim: state.fim, p_filtros: {} }),
      API.list('v_followups', { eq: { status: 'pendente' }, lte: { agendado_para: fimHoje.toISOString() }, order: [['agendado_para', true]], limit: 40 }),
      API.list('v_leads', { eq: { temperatura: 'quente', etapa_tipo: 'aberto' }, order: [['ultimo_contato_em', true]], limit: 8 }),
      API.rpc('desempenho_corretores', { p_inicio: state.ini, p_fim: state.fim, p_filtros: { corretor_id: App.me.id } }),
    ]);
    const c = d.cards, me = dp[0] || {};
    const agenda = card('Hoje', fus.rows.length ? h('div', { class: 'list' }, fus.rows.map(f => h('div', { class: 'list-item clickable', onclick: () => f.lead_id ? App.go('/leads/' + f.lead_id) : App.go('/followups') },
      h('span', { class: 'sev', style: { '--c': f.situacao === 'atrasado' ? 'var(--bad)' : 'var(--blue)' } }),
      h('div', { class: 'mono', style: { width: '52px', color: f.situacao === 'atrasado' ? '#FF8986' : 'var(--text-2)' } }, f.situacao === 'atrasado' ? fmt.dateShort(f.agendado_para) : fmt.time(f.agendado_para)),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, f.nome_contato || '—'), h('div', { class: 'li-sub' }, (Forms.FU_TIPOS.find(x => x.value === f.tipo) || {}).label + (f.observacao ? ' · ' + f.observacao : ''))),
      h('button', { class: 'btn xs', onclick: e => { e.stopPropagation(); Forms.concluirFollowup(f); } }, icon('check', 14), 'Concluir'))))
      : empty('Agenda do dia livre', 'Nenhum follow-up para hoje ou atrasado.'), { sub: `${fus.rows.filter(f => f.situacao === 'atrasado').length} atrasado(s)`, right: h('button', { class: 'btn sm', onclick: () => Forms.followup() }, icon('plus', 14), 'Follow-up') });
    const hot = card('Leads quentes', quentes.rows.length ? h('div', { class: 'list' }, quentes.rows.map(l => h('div', { class: 'list-item clickable', onclick: () => App.go('/leads/' + l.id) },
      U.tempChip(l.temperatura), h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, l.nome), h('div', { class: 'li-sub' }, l.etapa_nome + ' · último contato ' + fmt.rel(l.ultimo_contato_em))),
      l.whatsapp ? h('a', { class: 'icon-btn sm', href: U.waLink(l.whatsapp), target: '_blank', rel: 'noopener', title: 'Abrir WhatsApp', onclick: e => e.stopPropagation() }, icon('whatsapp', 16)) : null)))
      : empty('Nenhum lead quente agora', 'Leads avançados no funil e com contato recente aparecem aqui.'));
    const meta = card('Minha meta', h('div', { class: 'row', style: { gap: '18px', alignItems: 'center' } }, Charts.ring(c.meta_pct, { size: 112 }),
      h('div', { class: 'stack', style: { gap: '6px' } }, h('div', null, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Realizado no mês'), h('div', { class: 'kpi-value' }, fmt.money0(c.realizado_mes))),
        h('div', { class: 'muted', style: { fontSize: '12.5px' } }, c.meta_valor ? `Meta ${fmt.money0(c.meta_valor)} · faltam ${fmt.money0(Math.max(0, c.meta_valor - c.realizado_mes))}` : 'Meta ainda não definida'))));

    const tabs = [['hoje', 'Resumo'], ['leads', 'Meus leads'], ['clientes', 'Meus clientes'], ['vendas', 'Minhas vendas'], ['implantacao', 'Minhas implantações'], ['followups', 'Meus follow-ups'], ['producao', 'Minha produção']];
    const tabBody = h('div');
    const setTab = async k => {
      clear(tabBar).appendChild(U.tabs(tabs.map(([key, label]) => ({ key, label })), k, setTab));
      clear(tabBody).appendChild(U.skeleton(6));
      let node;
      if (k === 'hoje') node = h('div', { class: 'grid g-main' }, h('div', { class: 'stack' }, agenda, hot), h('div', { class: 'stack' }, App.relacionamentoHoje ? await App.relacionamentoHoje().catch(() => null) : null, meta,
        card('Meu funil', Charts.funnel(d.funil, { onClick: s => App.go('/leads?etapa=' + s.etapa) }), { sub: 'Leads do mês' })));
      else if (k === 'leads') node = await Views._leadsTable({ fixed: {}, compact: true });
      else if (k === 'clientes') { const { rows } = await API.list('v_clients', { order: [['created_at', false]], limit: 100 }); node = Views._clientsTable(rows); }
      else if (k === 'vendas') { const { rows } = await API.list('v_sales', { order: [['data_venda', false]], limit: 100 }); node = Views._salesTable(rows); }
      else if (k === 'implantacao') { App.go('/implantacao'); return; }
      else if (k === 'followups') { App.go('/followups'); return; }
      else if (k === 'producao') node = await painel(state, { fixo: { corretor_id: App.me.id }, titulo: false });
      clear(tabBody).appendChild(node);
    };
    const tabBar = h('div');
    wrap.append(App.pageHead('Minha Carteira', { eyebrow: 'Área operacional do corretor', desc: 'Seus leads, clientes, vendas, implantações e follow-ups — somente os que estão sob sua responsabilidade.',
      actions: [h('button', { class: 'btn', onclick: () => Forms.followup() }, icon('clock', 16), 'Follow-up'), h('button', { class: 'btn primary', onclick: () => Forms.lead() }, icon('plus', 16), 'Novo lead')] }),
      h('div', { class: 'kpis', style: { marginBottom: '18px' } },
        kpi('Vendido no mês', fmt.money0(c.valor_vendido), { hero: true, foot: `${c.vendas_aprovadas} venda(s) · ${c.vidas_vendidas} vida(s)` }),
        kpi('Leads em aberto', fmt.int(c.leads_novos + c.leads_atendimento + c.leads_negociacao), { onClick: () => App.go('/crm') }),
        kpi('Follow-ups atrasados', fmt.int(c.followups_atrasados), { state: c.followups_atrasados ? 'var(--bad)' : 'var(--ok)', onClick: () => App.go('/followups?aba=atrasado') }),
        kpi('Conversão', fmt.pct(c.conversao_leads), { foot: 'leads do mês' }),
        kpi('1º contato (média)', fmt.minutes(me.tempo_primeiro_contato_min), { foot: 'meta: ' + d.sla.meta1_min + ' min' }),
        kpi('Clientes ativos', fmt.int(c.clientes_ativos), { onClick: () => setTab('clientes') })),
      tabBar, tabBody);
    setTab(aba);
    return wrap;
  };

  // ------------------------------------------------------------------
  // INTELIGÊNCIA COMERCIAL
  // ------------------------------------------------------------------
  Views.inteligencia = async function () {
    const state = App.initPeriod('90d');
    const wrap = h('div'); const body = h('div'); const filters = h('div', { class: 'filters' });
    const ETAPA = c => (App.lk.stagesMap[c] || {}).nome || c;
    const leadList = (arr, sub, emptyTxt) => arr.length ? h('div', { class: 'list' }, arr.map(x => h('div', { class: 'list-item clickable', onclick: () => App.go('/leads/' + (x.lead_id || x.id)) },
      x.temperatura ? U.tempChip(x.temperatura) : null, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, x.nome || '—'), h('div', { class: 'li-sub' }, sub(x))), icon('chevronRight', 16)))) : empty('Nada por aqui', emptyTxt);
    const render = async () => {
      clear(filters).append(App.periodPicker(state, render, ['30d', '90d', 'mes', 'trimestre', 'ano']));
      clear(body).appendChild(U.skeleton(10));
      const ic = await API.rpc('inteligencia_comercial', { p_inicio: state.ini, p_fim: state.fim });
      clear(body).append(
        h('div', { class: 'grid g3' },
          card('Leads que precisam de atenção', leadList(ic.precisam_atencao, x => [x.motivo, ETAPA(x.etapa), x.corretor].filter(Boolean).join(' · '), 'Nenhum lead crítico.'), { sub: 'Sem contato, follow-up vencido ou quente parado' }),
          card('Leads esquecidos', leadList(ic.esquecidos, x => `${x.dias} dias sem interação · ${ETAPA(x.etapa)}${x.corretor ? ' · ' + x.corretor : ''}`, 'Nenhum lead parado há mais de 7 dias.'), { sub: 'Mais de 7 dias sem interação e sem follow-up futuro' }),
          card('Oportunidades próximas do fechamento', leadList(ic.proximos_fechamento, x => [ETAPA(x.etapa), x.valor ? fmt.money0(x.valor) + '/mês' : null, x.corretor].filter(Boolean).join(' · '), 'Nenhuma oportunidade avançada.'), { sub: 'Negociação, proposta e análise' })),
        h('div', { class: 'grid g2', style: { marginTop: '14px' } },
          card('Implantações sem movimentação', (ic.implantacoes_paradas || []).length ? U.table([
            { label: 'Cliente', render: x => h('span', { class: 'cell-main' }, x.nome || '—') },
            { label: 'Etapa', render: x => U.badge(x.etapa_nome || x.etapa, x.etapa_cor || 'var(--warn)') }, { label: 'Parada há', align: 'right', render: x => fmt.hours(x.horas) }, { label: 'Corretor', render: x => x.corretor || '—' }],
            ic.implantacoes_paradas, { onRow: x => App.go('/vendas/' + x.sale_id), dense: true }) : empty('Nenhuma implantação parada', 'Vendas sem mudança de etapa na implantação há mais de 72h aparecem aqui.'), { sub: 'Mais de 72h na mesma etapa, antes da aprovação' }),
          card('Corretores abaixo da meta', ic.abaixo_meta.length ? U.table([
            { label: 'Corretor', render: x => App.person(x.nome) }, { label: 'Realizado', align: 'right', render: x => fmt.money0(x.realizado) }, { label: 'Meta', align: 'right', render: x => fmt.money0(x.meta) },
            { label: 'Atingido', render: x => h('div', { style: { minWidth: '120px' } }, h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12px' } }, h('span', { class: 'bad-t' }, fmt.pct(x.pct)), h('span', { class: 'muted' }, 'esperado ' + fmt.pct(x.esperado_pct))),
              h('div', { class: 'meta-bar' }, h('div', { style: { width: Math.min(100, x.pct || 0) + '%', background: 'var(--warn)' } }), h('span', { class: 'exp', style: { left: Math.min(100, x.esperado_pct) + '%' } }))) }],
            ic.abaixo_meta, { onRow: x => App.gestor() && App.go('/equipe/' + x.id), dense: true }) : empty('Todos no ritmo', 'Nenhum corretor abaixo do ritmo esperado para o mês.'), { sub: 'Comparado ao ritmo proporcional do mês' })),
        h('div', { class: 'grid g4', style: { marginTop: '14px' } },
          card('Melhores origens', Charts.hbars(ic.melhores_origens.map(x => ({ label: x.nome, value: x.conversao, leads: x.leads })), { format: fmt.pct, max: 100, color: 'var(--ok)', sub: x => x.leads + ' leads' }), { sub: 'Conversão (mín. 3 leads)' }),
          card('Campanhas', Charts.hbars(ic.campanhas.map(x => ({ label: x.nome, value: x.conversao, leads: x.leads })), { format: fmt.pct, max: 100, color: 'var(--cyan)', sub: x => x.leads + ' leads' }), { sub: 'Conversão por campanha' }),
          card('Produtos mais vendidos', Charts.hbars(ic.produtos.map(x => ({ label: x.nome, value: x.qtd, valor: x.valor })), { sub: x => fmt.moneyShort(x.valor) })),
          card('Operadoras mais vendidas', Charts.hbars(ic.operadoras.map(x => ({ label: x.nome, value: x.qtd, valor: x.valor })), { color: 'var(--blue-2)', sub: x => fmt.moneyShort(x.valor) }))),
        h('div', { class: 'grid g2', style: { marginTop: '14px' } },
          card('Motivos de perda', Charts.hbars(ic.motivos_perda.map(x => ({ label: x.nome, value: x.qtd })), { color: 'var(--bad)' }), { sub: 'Leads perdidos no período' }),
          card('Como funciona', h('div', { class: 'stack', style: { gap: '8px', fontSize: '13px', color: 'var(--text-2)' } },
            h('p', { style: { margin: 0 } }, 'Todas as recomendações são regras aplicadas sobre os dados reais do sistema, respeitando o que você tem permissão para ver. Nada é estimado ou inventado.'),
            h('ul', { style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' } },
              h('li', null, 'Atenção: lead sem primeiro contato, follow-up vencido ou lead quente sem interação há 24h.'),
              h('li', null, 'Esquecido: mais de 7 dias sem interação e nenhum follow-up futuro.'),
              h('li', null, 'Abaixo da meta: realizado menor que o ritmo proporcional do mês.'),
              h('li', null, 'A estrutura já está preparada para resumos e sugestões por IA (função contexto_ia_lead).'))))));
    };
    wrap.append(App.pageHead('Inteligência Comercial', { eyebrow: 'Recomendações baseadas nos dados', desc: 'O que merece ação agora: leads esquecidos, implantações paradas, corretores fora do ritmo e o que está convertendo melhor.' }), filters, body);
    render();
    return wrap;
  };
})(window);
