/* =====================================================================
   ATOS SISTEMA — views-crm.js
   CRM Kanban, lista de Leads e página 360° do lead.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, avatar, menu, confirmDialog, toast, debounce } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Forms = global.Forms;

  const star = (l, after) => h('button', { class: 'star' + (l.prioritario ? ' on' : ''), title: l.prioritario ? 'Prioritário' : 'Marcar como prioritário', 'aria-label': 'Prioritário',
    onclick: async e => { e.stopPropagation(); try { await API.update('leads', l.id, { prioritario: !l.prioritario }); l.prioritario = !l.prioritario; e.currentTarget.classList.toggle('on'); after && after(); } catch (er) { App.err(er); } } }, icon('star', 15));
  const hojeIni = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

  // Etapas de "ganho" do CRM ligadas à Implantação:
  //  • lead chega em "Aprovado" → vira cliente e a venda entra na etapa inicial da implantação
  //  • dali em diante quem conduz é a implantação (ela leva o lead para "Implantado")
  const primeiraGanho = () => (App.lk.stages.filter(s => s.ativo && s.grupo === 'ganho').sort((a, b) => a.ordem - b.ordem)[0] || {}).codigo;
  const implAtiva = l => l.implantacao_id && !['cancelada'].includes(l.implantacao_status_venda);
  async function moveLead(l, etapa, after) {
    const st = App.lk.stagesMap[etapa];
    if (!st || etapa === l.etapa) return;
    if (st.tipo === 'perdido') return Forms.loss(l, { onDone: after, etapa });
    if (st.grupo === 'ganho' && !l.client_id) return Forms.convert(l, { onDone: after });
    const mover = () => API.rpc('mover_etapa', { p_lead: l.id, p_etapa: etapa }).then(() => { toast(`${l.nome} → ${st.nome}`); after && after(); }).catch(App.err);
    if (st.grupo === 'ganho' && l.client_id && !implAtiva(l)) {
      // cliente sem venda em andamento (ex.: venda anterior cancelada) → nova venda entra na implantação
      try {
        const cli = await API.get('v_clients', l.client_id);
        return Forms.saleForClient(cli, { onDone: () => { toast('Nova venda enviada para a Implantação'); mover(); } });
      } catch (e) { return App.err(e); }
    }
    if (st.grupo === 'ganho' && implAtiva(l) && etapa !== primeiraGanho() && l.implantacao_status_venda !== 'implantada') {
      const ir = await confirmDialog({ title: 'Implantação em andamento',
        message: `A implantação de ${l.nome} está em "${l.implantacao_etapa_nome}". O lead vai para "${st.nome}" automaticamente quando a implantação for concluída.`, confirm: 'Abrir implantação' });
      if (ir) App.go('/vendas/' + l.implantacao_sale_id);
      return;
    }
    mover();
  }
  App.moveLead = moveLead;

  // Etiqueta com a etapa da implantação (cards e página do lead)
  App.implChip = (l, big) => {
    if (!l.implantacao_etapa_nome) return null;
    const et = (App.lk.implStages || []).filter(x => x.ativo && x.status_venda !== 'cancelada').sort((a, b) => a.ordem - b.ordem);
    const i = et.findIndex(x => x.codigo === l.implantacao_etapa);
    const pct = l.implantacao_status_venda === 'cancelada' ? 100 : i < 0 ? 0 : Math.round((i + 1) / et.length * 100);
    return h('a', { class: 'impl-chip' + (big ? ' big' : '') + (l.implantacao_status_venda === 'cancelada' ? ' off' : ''), href: '#/vendas/' + l.implantacao_sale_id,
      style: { '--c': l.implantacao_etapa_cor || 'var(--blue)' }, title: 'Etapa da implantação — clique para abrir', onclick: e => e.stopPropagation() },
      icon('rocket', big ? 15 : 12), h('span', null, 'Implantação'), h('b', null, l.implantacao_etapa_nome),
      h('i', { class: 'impl-bar' }, h('i', { style: { width: pct + '%' } })));
  };

  // ------------------------------------------------------------------
  // CRM KANBAN
  // ------------------------------------------------------------------
  Views.crm = async function () {
    const state = { corretor_id: null, temperatura: null, prioritario: false, source_id: null, search: '', finalizados: true, ...(U.store('crm.f') || {}) };
    const wrap = h('div'); const board = h('div', { class: 'kanban' }); const filters = h('div', { class: 'filters' });
    let leads = [];
    const load = async () => {
      U.store('crm.f', state);
      const base = { ...(state.corretor_id ? { eq: { corretor_id: state.corretor_id } } : {}) };
      const extra = o => { const x = { ...o, eq: { ...(o.eq || {}), ...(base.eq || {}) } }; if (state.temperatura) x.eq.temperatura = state.temperatura; if (state.prioritario) x.eq.prioritario = true; if (state.source_id) x.eq.source_id = state.source_id;
        if (state.search) x.search = { cols: ['nome', 'empresa', 'whatsapp', 'email'], term: state.search }; return x; };
      const reqs = [API.all('v_leads', extra({ eq: { etapa_tipo: 'aberto' }, order: [['etapa_desde', true]] }))];
      if (state.finalizados) reqs.push(API.all('v_leads', extra({ in: { etapa_tipo: ['ganho', 'perdido'] }, gte: { updated_at: dates.addDays(dates.today(), -30) }, order: [['updated_at', false]] })));
      const r = await Promise.all(reqs);
      leads = r.flat();
      paint();
    };
    const card = l => {
      const late = l.proximo_followup_em && new Date(l.proximo_followup_em) < new Date();
      const el = h('div', { class: 'kcard', draggable: 'true', dataset: { id: l.id }, onclick: e => { if (!e.target.closest('button,a')) App.go('/leads/' + l.id); } },
        h('div', { class: 'kcard-top' }, h('div', { class: 'kcard-name' }, l.nome, l.empresa ? h('div', { class: 'cell-sub' }, l.empresa) : null), star(l),
          h('button', { class: 'icon-btn sm', 'aria-label': 'Mover', onclick: e => { e.stopPropagation(); menu(e.currentTarget, App.lk.stages.filter(s => s.ativo && s.codigo !== l.etapa).map(s => ({ label: 'Mover para ' + s.nome, onClick: () => moveLead(l, s.codigo, load) }))); } }, icon('more', 15))),
        h('div', { class: 'kcard-meta' },
          l.whatsapp || l.telefone ? h('span', null, icon('phone', 12), fmt.phone(l.whatsapp || l.telefone)) : null,
          h('span', null, icon('users', 12), l.num_vidas + (l.num_vidas > 1 ? ' vidas' : ' vida')),
          l.operadora_nome ? h('span', null, icon('building', 12), l.operadora_nome) : null,
          h('span', { title: 'Tempo na etapa' }, icon('clock', 12), fmt.hours(l.horas_na_etapa))),
        h('div', { class: 'kcard-meta' },
          h('span', null, 'Último contato ', h('b', { style: { color: 'var(--text-2)' } }, l.ultimo_contato_em ? fmt.rel(l.ultimo_contato_em) : 'nenhum')),
          l.proximo_followup_em ? h('span', { class: late ? 'late' : '' }, 'Follow-up ', fmt.datetime(l.proximo_followup_em)) : null),
        App.implChip(l),
        h('div', { class: 'kcard-foot' }, U.tempChip(l.temperatura), h('span', { class: 'kcard-val' }, fmt.money0(l.valor_cotacao ?? l.valor_pretendido)),
          h('span', { class: 'grow' }), l.corretor_nome ? h('span', { title: l.corretor_nome }, avatar(l.corretor_nome, 22)) : badge('Fila', 'var(--warn)')));
      el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', l.id); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      return el;
    };
    const paint = () => {
      clear(board);
      const stages = App.lk.stages.filter(s => s.ativo && (state.finalizados || s.tipo === 'aberto'));
      for (const s of stages) {
        const items = leads.filter(l => l.etapa === s.codigo);
        const soma = items.reduce((a, l) => a + Number(l.valor_cotacao ?? l.valor_pretendido ?? 0), 0);
        const body = h('div', { class: 'kcol-body' }, items.slice(0, 60).map(card), items.length > 60 ? h('div', { class: 'kmore' }, `+ ${items.length - 60} leads — use a lista para ver todos`) : null,
          !items.length ? h('div', { class: 'kmore' }, 'Arraste leads para cá') : null);
        const col = h('div', { class: 'kcol', dataset: { etapa: s.codigo } },
          h('div', { class: 'kcol-head' }, h('div', { class: 'kcol-title', style: { '--c': s.cor } }, h('i'), s.nome, h('span', { class: 'n' }, items.length)),
            h('div', { class: 'kcol-sum' }, fmt.money0(soma) + '/mês' + (s.tipo !== 'aberto' ? ' · últimos 30 dias' : ''))), body);
        col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
        col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
        col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('drop'); const l = leads.find(x => x.id === e.dataTransfer.getData('text/plain')); if (l) moveLead(l, s.codigo, load); });
        board.appendChild(col);
      }
    };
    const search = h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar no CRM…', value: state.search, oninput: debounce(e => { state.search = e.target.value; load(); }, 300) });
    const sel = (k, label, opts) => h('select', { 'aria-label': label, onchange: e => { state[k] = e.target.value || null; load(); } }, h('option', { value: '' }, label), opts.map(o => h('option', { value: o.value, selected: state[k] === o.value || null }, o.label)));
    filters.append(search,
      App.gestor() ? sel('corretor_id', 'Todos os corretores', App.opt.corretores()) : null,
      sel('temperatura', 'Todas as temperaturas', [{ value: 'quente', label: '🔥 Quente' }, { value: 'morno', label: 'Morno' }, { value: 'frio', label: 'Frio' }]),
      sel('source_id', 'Todas as origens', App.opt.srcs()),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.prioritario || null, onchange: e => { state.prioritario = e.target.checked; load(); } }), '⭐ Prioritários'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.finalizados || null, onchange: e => { state.finalizados = e.target.checked; load(); } }), 'Mostrar aprovados/perdidos'));
    wrap.append(App.pageHead('CRM', { eyebrow: 'Pipeline comercial', desc: 'Arraste os cards entre as etapas. Cada mudança fica registrada na timeline do lead com usuário, data e horário.',
      actions: [App.is('admin') ? h('button', { class: 'btn ghost', onclick: () => App.go('/configuracoes/funil') }, icon('settings', 16), 'Etapas e status') : null, h('button', { class: 'btn', onclick: () => App.go('/leads') }, icon('list', 16), 'Ver em lista'), h('button', { class: 'btn primary', onclick: () => Forms.lead(null, { onSaved: load }) }, icon('plus', 16), 'Novo lead')] }), filters, board);
    board.appendChild(U.skeleton(6));
    await load();
    return wrap;
  };

  // ------------------------------------------------------------------
  // LISTA DE LEADS
  // ------------------------------------------------------------------
  const PRESETS = { sla: 'SLA de atendimento estourado', sem_contato: 'Sem primeiro contato', quentes_sem_interacao: 'Quentes sem interação hoje', fila: 'Sem corretor (fila)', prioritarios: 'Prioritários', abertos: 'Em aberto', perdidos: 'Perdidos' };
  Views._leadsTable = async function ({ q = {}, compact = false } = {}) {
    const state = { page: 0, size: 25, sort: ['entrada_em', false], search: '', f: q.f || null, status: q.status || null, etapa: q.etapa || null, temperatura: null, source_id: null, campaign_id: null, corretor_id: q.corretor_id || null, operator_id: null, periodo: '' };
    const sel = new Set();
    const box = h('div'); const filters = h('div', { class: 'filters' }); const bulk = h('div'); const tableBox = h('div');
    const opts = (paging = true) => {
      const o = { eq: {}, order: [state.sort, ['id', true]] };
      ['status', 'etapa', 'temperatura', 'source_id', 'campaign_id', 'corretor_id', 'operator_id'].forEach(k => { if (state[k]) o.eq[k] = state[k]; });
      if (state.f === 'sem_contato') { o.isNull = ['primeiro_contato_em']; o.eq.etapa_tipo = 'aberto'; }
      if (state.f === 'quentes_sem_interacao') { o.eq.temperatura = 'quente'; o.eq.etapa_tipo = 'aberto'; o.or = [['ultimo_contato_em', 'is', null], ['ultimo_contato_em', 'lt', hojeIni()]]; }
      if (state.f === 'fila') o.isNull = ['corretor_id'];
      if (state.f === 'sla') { const m2 = ((App.lk.settings.sla || {}).meta2_min || 15) * 60e3; o.isNull = ['primeiro_contato_em']; o.notNull = ['corretor_id']; o.eq.etapa_tipo = 'aberto'; o.lt = { assigned_at: new Date(Date.now() - m2).toISOString() }; o.gte = { assigned_at: new Date(Date.now() - 7 * 864e5).toISOString() }; }
      if (state.f === 'prioritarios') o.eq.prioritario = true;
      if (state.f === 'abertos') o.eq.etapa_tipo = 'aberto';
      if (state.f === 'perdidos') o.eq.etapa_tipo = 'perdido';
      if (state.periodo) { const p = dates.periodos()[state.periodo]; o.gte = { entrada_em: p[0] }; o.lt = { entrada_em: dates.addDays(p[1], 1) }; }
      if (state.search) { const d = U.digits(state.search); o.search = d.length >= 4 && d.length === state.search.replace(/[\s().-]/g, '').length ? { cols: ['whatsapp', 'telefone', 'cpf', 'cnpj'], term: d } : { cols: ['nome', 'email', 'empresa'], term: state.search }; }
      if (paging) { o.limit = state.size; o.offset = state.page * state.size; o.count = true; }
      return o;
    };
    const cols = [
      { label: '', width: '28px', render: l => star(l) },
      { label: 'Lead', sort: 'nome', render: l => h('div', null, h('div', { class: 'cell-main' }, l.nome), h('div', { class: 'cell-sub' }, [l.empresa, fmt.phone(l.whatsapp || l.telefone)].filter(x => x && x !== '—').join(' · ') || l.email || '—')) },
      { label: 'Etapa / status', sort: 'etapa_ordem', render: l => h('div', null, App.stageBadge(l.etapa), h('div', { class: 'cell-sub' }, l.status_nome + (l.motivo_perda_nome ? ' · ' + l.motivo_perda_nome : ''))) },
      { label: 'Temp.', render: l => U.tempChip(l.temperatura) },
      { label: 'Vidas', align: 'right', sort: 'num_vidas', render: l => l.num_vidas },
      { label: 'Valor', align: 'right', sort: 'valor_pretendido', render: l => fmt.money0(l.valor_cotacao ?? l.valor_pretendido) },
      { label: 'Origem', render: l => h('div', null, l.origem_nome || '—', l.campanha_nome ? h('div', { class: 'cell-sub' }, l.campanha_nome) : null) },
      ...(App.gestor() ? [{ label: 'Corretor', sort: 'corretor_nome', render: l => l.corretor_nome ? App.person(l.corretor_nome, 22) : badge('Fila', 'var(--warn)') }] : []),
      { label: 'Entrada', sort: 'entrada_em', render: l => h('span', { title: fmt.datetime(l.entrada_em) }, fmt.rel(l.entrada_em)) },
      { label: 'Próx. follow-up', sort: 'proximo_followup_em', render: l => l.proximo_followup_em ? h('span', { class: new Date(l.proximo_followup_em) < new Date() ? 'bad-t' : '' }, fmt.datetime(l.proximo_followup_em)) : h('span', { class: 'dim' }, '—') },
    ];
    const paintBulk = () => {
      clear(bulk);
      if (!sel.size || !App.gestor()) return;
      bulk.appendChild(h('div', { class: 'bulkbar' }, `${sel.size} selecionado(s)`, h('span', { class: 'grow' }),
        App.can('leads.distribuir') ? h('button', { class: 'btn sm', onclick: async () => { const rows = (await API.all('v_leads', { in: { id: [...sel] } })); Forms.distribute(rows, { onDone: () => { sel.clear(); load(); } }); } }, icon('shuffle', 14), 'Distribuir / transferir') : null,
        h('button', { class: 'btn sm', onclick: async () => { for (const id of sel) await API.update('leads', id, { prioritario: true }).catch(() => { }); sel.clear(); load(); toast('Marcados como prioritários'); } }, icon('star', 14), 'Prioritário'),
        App.can('leads.excluir') ? h('button', { class: 'btn sm danger', onclick: async () => { if (!(await confirmDialog({ title: 'Arquivar leads', message: `Arquivar ${sel.size} lead(s)? O histórico é preservado (exclusão lógica).`, confirm: 'Arquivar', danger: true }))) return; for (const id of sel) await API.softDelete('leads', id).catch(App.err); sel.clear(); load(); } }, icon('trash', 14), 'Arquivar') : null,
        h('button', { class: 'btn sm ghost', onclick: () => { sel.clear(); load(); } }, 'Limpar')));
    };
    const load = async () => {
      clear(tableBox).appendChild(U.skeleton(8));
      try {
        const { rows, count } = await API.list('v_leads', opts());
        clear(tableBox).append(U.table(cols, rows, { onRow: l => App.go('/leads/' + l.id), selectable: App.gestor(), selected: sel, onSelect: paintBulk, sortState: state.sort, onSort: k => { state.sort = [k, state.sort[0] === k ? !state.sort[1] : false]; load(); } }),
          U.pager(state.page, state.size, count, p => { state.page = p; load(); }));
        paintBulk();
      } catch (e) { clear(tableBox).appendChild(empty('Erro ao carregar leads', e.message)); }
    };
    const selF = (k, label, o) => h('select', { 'aria-label': label, onchange: e => { state[k] = e.target.value || null; state.page = 0; load(); } }, h('option', { value: '' }, label), o.map(x => h('option', { value: x.value, selected: state[k] === x.value || null }, x.label)));
    filters.append(
      h('input', { type: 'search', class: 'search-f', placeholder: 'Nome, e-mail, empresa, telefone, CPF…', oninput: debounce(e => { state.search = e.target.value.trim(); state.page = 0; load(); }, 300) }),
      selF('f', 'Todas as situações', Object.entries(PRESETS).map(([value, label]) => ({ value, label }))),
      selF('etapa', 'Todas as etapas', App.opt.stages()),
      selF('status', 'Todos os status', App.opt.statuses()),
      selF('temperatura', 'Temperatura', [{ value: 'quente', label: 'Quente' }, { value: 'morno', label: 'Morno' }, { value: 'frio', label: 'Frio' }]),
      selF('source_id', 'Origem', App.opt.srcs()), selF('campaign_id', 'Campanha', App.opt.camps()),
      App.gestor() ? selF('corretor_id', 'Corretor', App.opt.corretores()) : null,
      selF('operator_id', 'Operadora', App.opt.ops()),
      selF('periodo', 'Qualquer data', [{ value: 'hoje', label: 'Entraram hoje' }, { value: 'semana', label: 'Esta semana' }, { value: 'mes', label: 'Este mês' }, { value: '30d', label: 'Últimos 30 dias' }, { value: '90d', label: 'Últimos 90 dias' }]));
    box.exportar = async anchor => {
      const rows = await API.all('v_leads', opts(false));
      App.exportMenu(anchor, 'leads-' + dates.today(), [{ label: 'Nome', key: 'nome' }, { label: 'Empresa', key: 'empresa' }, { label: 'WhatsApp', value: r => fmt.phone(r.whatsapp) }, { label: 'E-mail', key: 'email' },
        { label: 'Etapa', key: 'etapa_nome' }, { label: 'Status', key: 'status_nome' }, { label: 'Temperatura', key: 'temperatura' }, { label: 'Vidas', key: 'num_vidas' }, { label: 'Valor', value: r => r.valor_cotacao ?? r.valor_pretendido },
        { label: 'Origem', key: 'origem_nome' }, { label: 'Campanha', key: 'campanha_nome' }, { label: 'Corretor', key: 'corretor_nome' }, { label: 'Supervisor', key: 'supervisor_nome' }, { label: 'Entrada', value: r => fmt.datetime(r.entrada_em) }], rows);
    };
    box.append(filters, bulk, tableBox);
    load();
    return box;
  };

  Views.leads = async function (params) {
    const list = await Views._leadsTable({ q: params.q });
    const exportBtn = h('button', { class: 'btn', onclick: e => list.exportar(e.currentTarget) }, icon('download', 16), 'Exportar');
    return h('div', null, App.pageHead('Leads', { eyebrow: 'Gestão de leads', desc: params.q.f ? 'Filtro: ' + (PRESETS[params.q.f] || params.q.f) : null,
      actions: [exportBtn, App.can('leads.importar') ? h('button', { class: 'btn', onclick: () => Forms.importLeads() }, icon('upload', 16), 'Importar') : null,
        h('button', { class: 'btn', onclick: () => App.go('/crm') }, icon('kanban', 16), 'Kanban'), h('button', { class: 'btn primary', onclick: () => Forms.lead() }, icon('plus', 16), 'Novo lead')] }), list);
  };

  // ------------------------------------------------------------------
  // LEAD 360°
  // ------------------------------------------------------------------
  const TL_IC = { criacao: ['plus', 'var(--blue-2)'], alteracao: ['edit', 'var(--muted)'], distribuicao: ['shuffle', 'var(--cyan)'], responsavel: ['swap', 'var(--cyan)'], ligacao: ['phone', 'var(--blue-2)'],
    whatsapp: ['whatsapp', 'var(--ok)'], email: ['mail', 'var(--blue-2)'], reuniao: ['users', 'var(--blue-2)'], visita: ['pin', 'var(--blue-2)'], observacao: ['note', 'var(--muted)'], cotacao: ['file', 'var(--blue-3)'],
    proposta: ['file', 'var(--blue-2)'], status: ['arrowRight', 'var(--text-2)'], etapa: ['arrowRight', 'var(--text-2)'], documento: ['clip', 'var(--muted)'], pendencia: ['alert', 'var(--warn)'],
    aprovacao: ['check', 'var(--ok)'], implantacao: ['rocket', 'var(--ok)'], cancelamento: ['x', 'var(--bad)'], followup: ['clock', 'var(--warn)'], venda: ['sales', 'var(--ok)'], exclusao: ['trash', 'var(--bad)'], outro: ['activity', 'var(--muted)'] };
  App.timeline = (items) => items.length ? h('div', { class: 'timeline' }, items.map(x => { const [ic, c] = TL_IC[x.tipo] || TL_IC.outro;
    return h('div', { class: 'tl-item' }, h('span', { class: 'tl-dot', style: { '--c': c } }, icon(ic, 11)), h('div', { class: 'tl-title' }, x.titulo), x.descricao ? h('div', { class: 'tl-desc' }, x.descricao) : null,
      h('div', { class: 'tl-meta' }, fmt.datetime(x.created_at) + ' · ' + (x.usuario_nome || 'Sistema'))); })) : empty('Sem eventos', 'A linha do tempo mostra tudo o que acontece com o registro.');

  App.notesBlock = (notes, target, reload) => {
    const ta = h('textarea', { id: 'nova_nota', rows: 2, placeholder: 'Escreva uma nota interna…' });
    const sorted = [...notes].sort((a, b) => (b.fixada - a.fixada) || (a.created_at < b.created_at ? 1 : -1));
    return h('div', { class: 'stack', style: { gap: '10px' } },
      h('div', { class: 'stack', style: { gap: '6px' } }, ta, h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn sm primary', onclick: async () => { if (!ta.value.trim()) return; try { await API.insert('notes', { ...target, texto: ta.value.trim() }); reload(); } catch (e) { App.err(e); } } }, 'Adicionar nota'))),
      sorted.length ? sorted.map(n => h('div', { class: 'note' + (n.fixada ? ' pinned' : '') }, h('div', { style: { whiteSpace: 'pre-wrap', fontSize: '13px' } }, n.texto),
        h('div', { class: 'note-meta' }, n.fixada ? h('span', { class: 'warn-t' }, '📌 Fixada') : null, h('span', null, (n.autor_nome || '—') + ' · ' + fmt.datetime(n.created_at)), h('span', { class: 'grow' }),
          h('button', { class: 'btn xs ghost', onclick: async () => { try { await API.update('notes', n.id, { fixada: !n.fixada }); reload(); } catch (e) { App.err(e); } } }, n.fixada ? 'Desafixar' : 'Fixar'),
          n.autor_id === App.me.id || App.is('admin') ? h('button', { class: 'btn xs ghost', onclick: async () => { if (await confirmDialog({ title: 'Excluir nota', message: 'Excluir esta nota?', confirm: 'Excluir', danger: true })) { try { await API.remove('notes', n.id); reload(); } catch (e) { App.err(e); } } } }, 'Excluir') : null)))
        : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Nenhuma nota.'));
  };

  App.fuList = (fus, reload) => fus.length ? h('div', { class: 'list' }, fus.map(f => {
    const c = f.situacao === 'atrasado' ? 'var(--bad)' : f.situacao === 'hoje' ? 'var(--warn)' : f.situacao === 'concluido' ? 'var(--ok)' : 'var(--blue)';
    return h('div', { class: 'list-item' + (f.status === 'pendente' ? ' clickable' : ''), title: f.status === 'pendente' ? 'Clique para editar' : null, onclick: f.status === 'pendente' ? e => { if (!e.target.closest('button')) Forms.followup({}, { existing: f, onDone: reload }); } : null }, h('span', { class: 'sev', style: { '--c': c } }),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, (Forms.FU_TIPOS.find(x => x.value === f.tipo) || {}).label + ' · ' + fmt.datetime(f.agendado_para)),
        h('div', { class: 'li-sub' }, [f.status === 'concluido' ? 'Concluído: ' + (f.resultado || '') : f.observacao, f.responsavel_nome].filter(Boolean).join(' · '))),
      U.badge(f.prioridade, { baixa: 'var(--muted)', normal: 'var(--blue-2)', alta: 'var(--warn)', urgente: 'var(--bad)' }[f.prioridade]),
      f.status === 'pendente' ? h('button', { class: 'btn xs', title: 'Concluir', onclick: () => Forms.concluirFollowup(f, { onDone: reload }) }, icon('check', 13), 'Concluir') : null);
  })) : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Nenhum follow-up.');

  App.docsList = (docs, reload) => docs.length ? h('div', { class: 'list' }, docs.map(d => h('div', { class: 'list-item' }, h('span', { class: 'notif-ic', style: { width: '30px', height: '30px' } }, icon('clip', 15)),
    h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, d.nome_arquivo), h('div', { class: 'li-sub' }, [Forms.DOC_LABEL[d.tipo] || d.tipo, d.tamanho ? Math.round(d.tamanho / 1024) + ' KB' : null, d.enviado_por_nome, fmt.date(d.created_at)].filter(Boolean).join(' · '))),
    d.sensivel ? U.badge('Sensível', 'var(--warn)', 'square') : null, h('button', { class: 'btn xs', onclick: () => Forms.openDoc(d) }, icon('eye', 13), 'Abrir'))))
    : empty('Nenhum documento', 'Anexe RG, CPF, contrato social, carta de permanência e outros.');

  Views.lead360 = async function ({ id, q }) {
    const l = await API.get('v_leads', id);
    if (!l) return empty('Lead não encontrado', 'Ele não existe ou não está sob sua responsabilidade. O acesso é controlado pela hierarquia da corretora.', h('button', { class: 'btn', onclick: () => App.go('/leads') }, 'Voltar para leads'));
    const [hist, assigns, quotes, props, fus, docs, acts, notes, tasks, sales] = await Promise.all([
      API.all('v_lead_history', { eq: { lead_id: id }, order: [['created_at', false]] }), API.all('v_lead_assignments', { eq: { lead_id: id }, order: [['created_at', false]] }),
      API.all('v_quotes', { eq: { lead_id: id }, order: [['created_at', false]] }), API.all('v_proposals', { eq: { lead_id: id }, order: [['created_at', false]] }),
      API.all('v_followups', { eq: { lead_id: id }, order: [['agendado_para', false]] }), API.all('v_documents', { eq: { lead_id: id }, order: [['created_at', false]] }),
      API.all('v_activities', { eq: { lead_id: id }, order: [['realizado_em', false]] }), API.all('v_notes', { eq: { lead_id: id } }),
      API.all('v_tasks', { eq: { lead_id: id }, order: [['prazo', true]] }), API.all('v_sales', { eq: { lead_id: id } }),
    ]);
    const reload = () => App.reload();
    const aberto = l.etapa_tipo === 'aberto';
    const tel = l.whatsapp || l.telefone;
    const moreMenu = e => menu(e.currentTarget, [
      { label: 'Editar dados', icon: 'edit', onClick: () => Forms.lead(l, { onSaved: reload }) },
      App.can('leads.distribuir') ? { label: l.corretor_id ? 'Transferir para outro corretor' : 'Distribuir', icon: 'shuffle', onClick: () => Forms.distribute(l, { onDone: reload }) } : null,
      { label: 'Nova cotação', icon: 'file', onClick: () => Forms.quote(l, { onDone: reload }) },
      { label: 'Nova tarefa', icon: 'tasks', onClick: () => Forms.task({ lead_id: l.id, nome: l.nome, responsavel_id: l.corretor_id }, { onDone: reload }) },
      { label: 'Anexar documento', icon: 'clip', onClick: () => Forms.document({ lead_id: l.id, nome: l.nome }, { onDone: reload }) },
      !l.client_id ? { label: 'Aprovar e enviar para implantação', icon: 'rocket', onClick: () => Forms.convert(l) } : null,
      l.implantacao_sale_id ? { label: 'Abrir implantação', icon: 'rocket', onClick: () => App.go('/vendas/' + l.implantacao_sale_id) } : null,
      aberto ? { label: 'Marcar como perdido', icon: 'x', danger: true, onClick: () => Forms.loss(l, { onDone: reload }) } : null,
      !aberto && App.perdido(l) ? { label: 'Reabrir lead', icon: 'refresh', onClick: async () => { try { const st = App.lk.statusMap.follow_up ? 'follow_up' : (App.lk.stages.find(x => x.ativo && ['negociacao', 'atendimento'].includes(x.grupo) && x.status_padrao) || {}).status_padrao; await API.rpc('alterar_status_lead', { p_lead: l.id, p_status: st }); reload(); } catch (er) { App.err(er); } } } : null,
      '-',
      { label: l.temperatura_auto ? 'Temperatura: automática ✓' : 'Voltar temperatura para automática', icon: 'flame', onClick: async () => { await API.update('leads', l.id, { temperatura_auto: true }).catch(App.err); reload(); } },
      ...['quente', 'morno', 'frio'].map(t => ({ label: 'Definir como ' + U.TEMP[t].label.toLowerCase(), icon: 'flame', onClick: async () => { await API.update('leads', l.id, { temperatura: t, temperatura_auto: false }).catch(App.err); reload(); } })),
      App.can('leads.excluir') ? '-' : null,
      App.can('leads.excluir') ? { label: 'Arquivar lead', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: 'Arquivar lead', message: 'O lead sai das listas, mas o histórico é preservado (exclusão lógica).', confirm: 'Arquivar', danger: true })) { try { await API.softDelete('leads', l.id); toast('Lead arquivado'); App.go('/leads'); } catch (er) { App.err(er); } } } } : null,
      App.is('admin') ? { label: 'Anonimizar dados (LGPD)', icon: 'shield', danger: true, onClick: async () => { if (await confirmDialog({ title: 'Anonimizar dados pessoais', message: 'Remove nome, CPF, telefones, e-mail e data de nascimento deste lead e do cliente vinculado. Não pode ser desfeito.', confirm: 'Anonimizar', danger: true })) { try { await API.rpc('anonimizar_lead', { p_lead: l.id }); reload(); } catch (er) { App.err(er); } } } } : null,
    ]);

    const stagesTrack = h('div', { class: 'stage-track' }, App.lk.stages.filter(s => s.ativo).map(s => {
      const cur = s.codigo === l.etapa, done = s.tipo !== 'perdido' && l.etapa !== 'perdido' && s.ordem < (l.etapa_ordem || 0);
      return h('button', { class: 'stage-step' + (cur ? (s.tipo === 'perdido' ? ' lost' : ' cur') : done ? ' done' : ''), title: 'Mover para ' + s.nome, onclick: () => moveLead(l, s.codigo, reload) }, s.nome);
    }));

    const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(p => p).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v === null || v === undefined || v === '' ? h('span', { class: 'dim' }, '—') : v)]));
    const pend = fus.filter(f => f.status === 'pendente');
    const overview = h('div', { class: 'grid g-side' },
      h('div', { class: 'stack' },
        App.card('Dados do lead', kv([
          ['WhatsApp', tel ? h('span', { class: 'row', style: { gap: '8px' } }, fmt.phone(l.whatsapp), l.whatsapp ? h('a', { href: U.waLink(l.whatsapp, `Olá, ${l.nome.split(' ')[0]}!`), target: '_blank', rel: 'noopener' }, 'Abrir conversa') : null) : null],
          ['Telefone', l.telefone ? fmt.phone(l.telefone) : null], ['E-mail', l.email], ['Pessoa', l.tipo_pessoa === 'PJ' ? 'Jurídica' : 'Física'],
          ['Modalidade', (App.opt.modalidades().find(m => m.value === l.modalidade) || {}).label], l.empresa ? ['Empresa', l.empresa] : null, l.cnpj ? ['CNPJ', fmt.cnpj(l.cnpj)] : null,
          ['CPF', l.cpf ? fmt.cpf(l.cpf) : null], ['Nascimento', l.data_nascimento ? fmt.date(l.data_nascimento) : null], ['Cidade', [l.cidade, l.uf].filter(Boolean).join(' / ')],
          ['Vidas', `${l.num_vidas}${l.faixa_etaria ? ' · faixa ' + l.faixa_etaria : ''}`], ['Interesse', [l.operadora_nome, l.produto_nome].filter(Boolean).join(' · ')],
          ['Valor pretendido', l.valor_pretendido ? fmt.money(l.valor_pretendido) + '/mês' : null], ['Valor da cotação', l.valor_cotacao ? fmt.money(l.valor_cotacao) + '/mês' : null],
          ['Origem', [l.origem_nome, l.campanha_nome].filter(Boolean).join(' · ')], ['Entrada', fmt.datetime(l.entrada_em)],
        ]), { right: h('button', { class: 'btn xs', onclick: () => Forms.lead(l, { onSaved: reload }) }, icon('edit', 13), 'Editar') }),
        App.card('SLA e contato', kv([
          ['Distribuído em', l.distribuido_em ? fmt.datetime(l.distribuido_em) : 'Aguardando distribuição'],
          ['Primeiro contato', l.primeiro_contato_em ? h('span', null, fmt.datetime(l.primeiro_contato_em), h('span', { class: l.minutos_primeiro_contato <= ((App.lk.settings.sla || {}).meta1_min || 5) ? 'ok-t' : l.minutos_primeiro_contato <= ((App.lk.settings.sla || {}).meta2_min || 15) ? 'warn-t' : 'bad-t' }, ' · ' + fmt.minutes(l.minutos_primeiro_contato))) : h('span', { class: 'bad-t' }, 'Ainda sem contato')],
          ['Último contato', l.ultimo_contato_em ? fmt.datetime(l.ultimo_contato_em) + ' (' + fmt.rel(l.ultimo_contato_em) + ')' : null], ['Tentativas', l.tentativas_contato], ['Tempo na etapa', fmt.hours(l.horas_na_etapa)],
        ])),
        l.observacao ? App.card('Observação', h('div', { style: { whiteSpace: 'pre-wrap', color: 'var(--text-2)' } }, l.observacao)) : null,
        App.card('Notas internas', App.notesBlock(notes, { lead_id: l.id }, reload))),
      h('div', { class: 'stack' },
        App.card('Responsáveis', kv([['Corretor', l.corretor_nome ? App.person(l.corretor_nome) : badge('Fila da equipe', 'var(--warn)')], ['Supervisor', l.supervisor_nome], ['Gerente', l.gerente_nome], ['Equipe', l.team_nome]]),
          { right: App.can('leads.distribuir') ? h('button', { class: 'btn xs', onclick: () => Forms.distribute(l, { onDone: reload }) }, icon('shuffle', 13), l.corretor_id ? 'Transferir' : 'Distribuir') : null }),
        App.card('Próximos follow-ups', App.fuList(pend, reload), { right: h('button', { class: 'btn xs', onclick: () => Forms.followup({ lead_id: l.id, nome: l.nome, responsavel_id: l.corretor_id }, { onDone: reload }) }, icon('plus', 13), 'Agendar') }),
        App.card('Tarefas', tasks.length ? h('div', { class: 'list' }, tasks.map(t => h('div', { class: 'list-item clickable', onclick: () => Forms.task({}, { existing: t, onDone: reload }) },
          h('input', { type: 'checkbox', checked: t.status === 'concluida' || null, onclick: e => e.stopPropagation(), onchange: async e => { await API.update('tasks', t.id, { status: e.target.checked ? 'concluida' : 'aberta' }).catch(App.err); reload(); } }),
          h('div', { class: 'li-main' }, h('div', { class: 'li-title', style: t.status === 'concluida' ? { textDecoration: 'line-through', color: 'var(--muted)' } : null }, t.titulo), h('div', { class: 'li-sub' }, [t.responsavel_nome, t.prazo ? 'prazo ' + fmt.datetime(t.prazo) : null].filter(Boolean).join(' · '))),
          t.atrasada ? U.badge('Atrasada', 'var(--bad)') : null))) : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Nenhuma tarefa.'),
          { right: h('button', { class: 'btn xs', onclick: () => Forms.task({ lead_id: l.id, nome: l.nome, responsavel_id: l.corretor_id }, { onDone: reload }) }, icon('plus', 13), 'Tarefa') }),
        App.card('Atividades recentes', acts.length ? App.timeline(acts.slice(0, 5).map(a => ({ tipo: a.tipo, titulo: ({ ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', visita: 'Visita' }[a.tipo] || 'Contato') + (a.efetivo ? '' : ' — sem sucesso'), descricao: a.descricao || a.resultado, created_at: a.realizado_em, usuario_nome: a.usuario_nome }))) : h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Nenhuma atividade registrada.'))));

    const tabsDef = [
      { key: 'geral', label: 'Visão geral' }, { key: 'timeline', label: 'Timeline', count: hist.length }, { key: 'cotacoes', label: 'Cotações', count: quotes.length },
      props.length ? { key: 'propostas', label: 'Propostas (histórico)', count: props.length } : null, { key: 'followups', label: 'Follow-ups', count: fus.length }, { key: 'documentos', label: 'Documentos', count: docs.length },
      { key: 'atividades', label: 'Atividades', count: acts.length }, { key: 'historico', label: 'Histórico', count: assigns.length }, { key: 'venda', label: 'Venda e implantação', count: sales.length || null },
    ].filter(Boolean);
    const body = h('div'); const tabBar = h('div');
    const QST = { elaboracao: 'Em elaboração', enviada: 'Enviada', aceita: 'Aceita', recusada: 'Recusada' };
    const PST = { rascunho: 'Rascunho', enviada: 'Enviada', em_analise: 'Em análise', pendencia: 'Pendência', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' };
    const PCOL = { enviada: 'var(--blue-2)', em_analise: 'var(--blue)', pendencia: 'var(--warn)', aprovada: 'var(--ok)', recusada: 'var(--bad)', cancelada: 'var(--bad)', aceita: 'var(--ok)', elaboracao: 'var(--muted)', rascunho: 'var(--muted)' };
    const setTab = k => {
      clear(tabBar).appendChild(U.tabs(tabsDef, k, setTab));
      let node;
      if (k === 'geral') node = overview;
      else if (k === 'timeline') node = App.card('Linha do tempo', App.timeline(hist), { sub: 'Tudo o que aconteceu com este lead' });
      else if (k === 'cotacoes') node = App.card('Cotações', U.table([
        { label: 'Operadora / produto', render: x => h('div', null, h('div', { class: 'cell-main' }, x.operadora_nome || '—'), h('div', { class: 'cell-sub' }, x.produto_nome || '')) },
        { label: 'Vidas', align: 'right', key: 'num_vidas' }, { label: 'Valor', align: 'right', render: x => fmt.money(x.valor_mensal) }, { label: 'Status', render: x => U.badge(QST[x.status], PCOL[x.status]) },
        { label: 'Enviada', render: x => x.enviada_em ? fmt.datetime(x.enviada_em) : '—' }, { label: 'Corretor', key: 'corretor_nome' }], quotes, { onRow: x => Forms.quote(l, { existing: x, onDone: reload }) }),
        { right: h('button', { class: 'btn xs primary', onclick: () => Forms.quote(l, { onDone: reload }) }, icon('plus', 13), 'Nova cotação') });
      else if (k === 'propostas') node = App.card('Propostas registradas antes da integração com a implantação', Views._proposalsTable(props, { onRow: x => Forms.proposal(l, { existing: x, onDone: reload }), compact: true }));
      else if (k === 'followups') node = App.card('Follow-ups', App.fuList(fus, reload), { right: h('button', { class: 'btn xs primary', onclick: () => Forms.followup({ lead_id: l.id, nome: l.nome, responsavel_id: l.corretor_id }, { onDone: reload }) }, icon('plus', 13), 'Agendar') });
      else if (k === 'documentos') node = App.card('Documentos', App.docsList(docs, reload), { sub: 'Documentos sensíveis têm acesso restrito', right: h('button', { class: 'btn xs primary', onclick: () => Forms.document({ lead_id: l.id, nome: l.nome }, { onDone: reload }) }, icon('upload', 13), 'Anexar') });
      else if (k === 'atividades') node = App.card('Atividades', U.table([
        { label: 'Quando', render: a => fmt.datetime(a.realizado_em) }, { label: 'Tipo', render: a => ({ ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', visita: 'Visita', outro: 'Outro' }[a.tipo]) },
        { label: 'Resultado', render: a => a.efetivo ? U.badge('Contato realizado', 'var(--ok)') : U.badge('Sem sucesso', 'var(--muted)') }, { label: 'Detalhe', render: a => (a.resultado || '').replace(/_/g, ' ') },
        { label: 'Anotação', render: a => a.descricao || '—' }, { label: 'Por', key: 'usuario_nome' }], acts),
        { right: h('button', { class: 'btn xs primary', onclick: () => Forms.activity({ lead_id: l.id, nome: l.nome }, { onDone: reload }) }, icon('plus', 13), 'Registrar contato') });
      else if (k === 'historico') node = h('div', { class: 'stack' },
        App.card('Distribuição e transferências', U.table([
          { label: 'Data', render: a => fmt.datetime(a.created_at) }, { label: 'De', render: a => a.anterior_nome || h('span', { class: 'dim' }, '—') }, { label: 'Para', render: a => a.novo_nome || '—' },
          { label: 'Por', key: 'distribuido_por_nome' }, { label: 'Método', render: a => U.badge(a.metodo, 'var(--cyan)', 'square') }, { label: 'Motivo', render: a => a.motivo || '—' }], assigns), { sub: 'Registro obrigatório de toda mudança de responsável' }),
        App.card('Mudanças de status e etapa', App.timeline(hist.filter(x => ['status', 'etapa', 'criacao'].includes(x.tipo)))));
      else if (k === 'venda') node = sales.length ? h('div', { class: 'stack' }, sales.map(s => App.card('Venda ' + (s.numero_proposta ? 'nº ' + s.numero_proposta : ''), kv([
        ['Cliente', h('a', { href: '#/clientes/' + s.client_id }, s.cliente_nome)], ['Status', Views._saleStatus(s.status)], ['Operadora / produto', [s.operadora_nome, s.produto_nome].filter(Boolean).join(' · ')],
        ['Valor', fmt.money(s.valor_mensal) + '/mês · ' + s.num_vidas + ' vida(s)'], ['Data da venda', fmt.date(s.data_venda)], ['Vigência', s.vigencia ? fmt.date(s.vigencia) : null], ['Implantação', s.implantacao_etapa_nome || s.implantacao_etapa]]),
        { right: h('button', { class: 'btn xs', onclick: () => App.go('/vendas/' + s.id) }, 'Abrir venda') })))
        : App.card('Venda', empty('Ainda não aprovado', 'Quando o cliente fechar, mova o lead para "Aprovado": ele vira cliente e a venda entra na Implantação.', h('button', { class: 'btn primary', onclick: () => Forms.convert(l) }, icon('rocket', 16), 'Aprovar e enviar para implantação')));
      clear(body).appendChild(node);
    };

    const wrap = h('div', null,
      h('button', { class: 'crumb', onclick: () => App.go('/leads') }, icon('chevronLeft', 14), 'Leads'),
      h('div', { class: 'l360-head' },
        h('div', { class: 'l360-title grow' }, h('div', { class: 'row', style: { gap: '8px' } }, h('h1', null, l.nome), star(l)),
          h('div', { class: 'l360-tags' }, App.statusBadge(l.status), l.corretor_nome ? App.person(l.corretor_nome, 22) : badge('Fila da equipe', 'var(--warn)'), U.tempChip(l.temperatura),
            l.temperatura_auto ? h('span', { class: 'dim', style: { fontSize: '11px' } }, '(automática)') : null,
            l.motivo_perda_nome ? badge('Motivo: ' + l.motivo_perda_nome, 'var(--bad)') : null, l.anonimizado_em ? badge('Anonimizado', 'var(--muted)') : null, App.implChip(l, true))),
        h('div', { class: 'l360-actions' },
          l.whatsapp ? h('a', { class: 'btn', href: U.waLink(l.whatsapp, `Olá, ${l.nome.split(' ')[0]}!`), target: '_blank', rel: 'noopener', style: { color: '#5FE0A8' } }, icon('whatsapp', 16), 'Abrir conversa no WhatsApp') : null,
          h('button', { class: 'btn', onclick: () => Forms.activity({ lead_id: l.id, nome: l.nome }, { onDone: reload }) }, icon('phone', 16), 'Registrar contato'),
          h('button', { class: 'btn', onclick: () => Forms.followup({ lead_id: l.id, nome: l.nome, responsavel_id: l.corretor_id }, { onDone: reload }) }, icon('clock', 16), 'Follow-up'),
          !l.client_id && aberto ? h('button', { class: 'btn primary', onclick: () => Forms.convert(l) }, icon('rocket', 16), 'Aprovado → Implantação') : null,
          h('button', { class: 'icon-btn', 'aria-label': 'Mais ações', onclick: moreMenu }, icon('more')))),
      stagesTrack, tabBar, body);
    setTab(q.aba || 'geral');
    return wrap;
  };
})(window);
