/* =====================================================================
   ATOS SISTEMA — views-operacao.js
   Follow-ups, Agenda e Central de Tarefas.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, confirmDialog, toast } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Forms = global.Forms;
  const PCOL = { baixa: 'var(--muted)', normal: 'var(--blue-2)', alta: 'var(--warn)', urgente: 'var(--bad)' };
  const FUL = Object.fromEntries(Forms.FU_TIPOS.map(x => [x.value, x.label]));
  const FUI = { ligacao: 'phone', whatsapp: 'whatsapp', email: 'mail', reuniao: 'users', retorno: 'refresh', envio_proposta: 'file', cobranca_documentos: 'clip', negociacao: 'sales' };

  // ------------------------------------------------------------------
  // FOLLOW-UPS
  // ------------------------------------------------------------------
  Views.followups = async function (params) {
    const state = { aba: params.q.aba || 'atrasado', resp: null, tipo: null };
    const wrap = h('div'); const tabBar = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div');
    const fimHoje = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); };
    const iniHoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
    const base = () => { const o = { eq: {} }; if (state.resp) o.or = [['responsavel_id', 'eq', state.resp], ['corretor_id', 'eq', state.resp]]; if (state.tipo) o.eq.tipo = state.tipo; return o; };
    const q = {
      atrasado: () => ({ ...base(), eq: { ...base().eq, status: 'pendente' }, lt: { agendado_para: new Date().toISOString() }, order: [['agendado_para', true]] }),
      hoje: () => ({ ...base(), eq: { ...base().eq, status: 'pendente' }, gte: { agendado_para: new Date().toISOString() }, lte: { agendado_para: fimHoje() }, order: [['agendado_para', true]] }),
      proximo: () => ({ ...base(), eq: { ...base().eq, status: 'pendente' }, gt: { agendado_para: fimHoje() }, order: [['agendado_para', true]] }),
      concluido: () => ({ ...base(), eq: { ...base().eq, status: 'concluido' }, gte: { concluido_em: dates.addDays(dates.today(), -30) }, order: [['concluido_em', false]] }),
    };
    const item = f => {
      const c = f.situacao === 'atrasado' ? 'var(--bad)' : f.situacao === 'hoje' ? 'var(--warn)' : f.status === 'concluido' ? 'var(--ok)' : 'var(--blue)';
      return h('div', { class: 'list-item', style: { padding: '12px 14px' } }, h('span', { class: 'sev', style: { '--c': c } }),
        h('span', { class: 'notif-ic', style: { '--c': c } }, icon(FUI[f.tipo] || 'clock', 16)),
        h('div', { style: { width: '120px', flex: 'none' } }, h('div', { class: 'mono', style: { fontWeight: 700, color: f.situacao === 'atrasado' ? 'var(--bad-text)' : 'var(--text)' } }, f.situacao === 'hoje' ? 'Hoje ' + fmt.time(f.agendado_para) : fmt.datetime(f.agendado_para)),
          h('div', { class: 'cell-sub' }, f.status === 'concluido' ? 'concluído ' + fmt.rel(f.concluido_em) : fmt.rel(f.agendado_para))),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, h('a', { href: f.lead_id ? '#/leads/' + f.lead_id : f.client_id ? '#/clientes/' + f.client_id : '#/followups' }, f.nome_contato || '—'), f.lead_temperatura ? h('span', { style: { marginLeft: '8px' } }, U.tempChip(f.lead_temperatura)) : null),
          h('div', { class: 'li-sub' }, [FUL[f.tipo], f.status === 'concluido' ? f.resultado : f.observacao, App.gestor() ? f.responsavel_nome : null].filter(Boolean).join(' · '))),
        badge(f.prioridade, PCOL[f.prioridade]),
        f.telefone_contato ? h('a', { class: 'icon-btn sm hide-sm', href: U.waLink(f.telefone_contato), target: '_blank', rel: 'noopener', title: 'Abrir WhatsApp' }, icon('whatsapp', 16)) : null,
        f.status === 'pendente' ? h('button', { class: 'btn xs', onclick: () => Forms.followup({}, { existing: f, onDone: load }) }, 'Reagendar') : null,
        f.status === 'pendente' ? h('button', { class: 'btn xs primary', onclick: () => Forms.concluirFollowup(f, { onDone: load }) }, icon('check', 13), 'Concluir') : null);
    };
    const load = async () => {
      const counts = await Promise.all(['atrasado', 'hoje', 'proximo', 'concluido'].map(k => API.list('v_followups', { ...q[k](), count: true, limit: 1 })));
      clear(tabBar).appendChild(U.tabs([
        { key: 'atrasado', label: 'Atrasados', count: counts[0].count }, { key: 'hoje', label: 'Hoje', count: counts[1].count },
        { key: 'proximo', label: 'Próximos', count: counts[2].count }, { key: 'concluido', label: 'Concluídos (30 dias)', count: counts[3].count }], state.aba, k => { state.aba = k; load(); }));
      clear(body).appendChild(U.skeleton(6));
      const { rows } = await API.list('v_followups', { ...q[state.aba](), limit: 200 });
      clear(body).appendChild(rows.length ? h('div', { class: 'card' }, h('div', { class: 'list' }, rows.map(item)))
        : empty(state.aba === 'atrasado' ? 'Nenhum follow-up atrasado' : 'Nada por aqui', state.aba === 'atrasado' ? 'Excelente — sua agenda está em dia.' : 'Agende follow-ups a partir do lead ou do botão acima.'));
      App.refreshCounts();
    };
    const sel = (k, label, o) => h('select', { 'aria-label': label, onchange: e => { state[k] = e.target.value || null; load(); } }, h('option', { value: '' }, label), o.map(x => h('option', { value: x.value }, x.label)));
    filters.append(App.gestor() ? sel('resp', 'Todos os responsáveis', [{ value: App.me.id, label: 'Somente os meus' }, ...App.opt.corretores()]) : null, sel('tipo', 'Todos os tipos', Forms.FU_TIPOS));
    wrap.append(App.pageHead('Follow-ups', { eyebrow: 'Follow-ups de hoje', desc: 'Atrasados em destaque. Concluir registra o resultado e já permite agendar o próximo passo.',
      actions: [h('button', { class: 'btn primary', onclick: () => Forms.followup({}, { onDone: load }) }, icon('plus', 16), 'Agendar follow-up')] }), filters, tabBar, body);
    await load();
    return wrap;
  };

  // ------------------------------------------------------------------
  // AGENDA (compromissos + follow-ups + tarefas)
  // ------------------------------------------------------------------
  Views.agenda = async function (params) {
    const state = { modo: params.q.modo || (window.innerWidth < 700 ? 'dia' : 'mes'), ref: dates.today(), resp: null, tipos: { events: true, followups: true, tasks: true } };
    const wrap = h('div'); const bar = h('div', { class: 'filters' }); const body = h('div'); const convites = h('div');
    const range = () => {
      if (state.modo === 'dia') return [state.ref, state.ref];
      if (state.modo === 'semana') { const s = dates.startOfWeek(state.ref); return [s, dates.addDays(s, 6)]; }
      const s = dates.startOfMonth(state.ref), gs = dates.startOfWeek(s); const e = dates.endOfMonth(state.ref); const ge = dates.addDays(dates.startOfWeek(e), 6); return [gs, ge];
    };
    const COL = { evento: 'var(--blue)', treinamento: '#8B7CF6', followup: 'var(--warn)', tarefa: 'var(--cyan)' };
    const KL = { evento: 'compromisso', treinamento: 'treinamento', followup: 'follow-up', tarefa: 'tarefa' };
    const paintConvites = async () => {
      try {
        const pend = await API.all('v_events', { eq: { minha_resposta: 'pendente' }, gte: { inicio: new Date().toISOString() }, order: [['inicio', true]] });
        clear(convites);
        if (!pend.length) return;
        convites.appendChild(h('div', { class: 'card invite-card' }, h('div', { class: 'row', style: { marginBottom: '8px' } }, icon('bell', 16, 'blue-t'), h('b', null, `Você tem ${pend.length} convite(s) aguardando resposta`)),
          h('div', { class: 'list' }, pend.map(e => h('div', { class: 'list-item' },
            h('span', { class: 'notif-ic', style: { '--c': e.tipo === 'treinamento' ? '#8B7CF6' : 'var(--blue)' } }, icon(e.tipo === 'treinamento' ? 'sparkles' : 'users', 16)),
            h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, h('a', { href: '#/agenda?evento=' + e.id, onclick: ev => { ev.preventDefault(); Forms.eventDetail(e.id, { onDone: load }); } }, e.titulo)),
              h('div', { class: 'li-sub' }, [fmt.datetime(e.inicio), e.local, 'por ' + (e.organizador_nome || e.responsavel_nome || '')].filter(Boolean).join(' · '))),
            ...[['aceito', 'Vou', 'primary'], ['talvez', 'Talvez', ''], ['recusado', 'Não vou', 'ghost']].map(([r, l, c]) => h('button', { class: 'btn xs ' + c, onclick: async () => { try { await API.rpc('responder_convite', { p_evento: e.id, p_resposta: r }); toast('Resposta enviada ao organizador'); load(); } catch (er) { App.err(er); } } }, l)))))));
      } catch (e) { console.warn(e); }
    };
    const load = async () => {
      const [a, b] = range();
      const lo = new Date(a + 'T00:00:00').toISOString(), hi = new Date(dates.addDays(b, 1) + 'T00:00:00').toISOString();
      const respF = state.resp ? { or: [['responsavel_id', 'eq', state.resp]] } : {};
      paintConvites();
      const [ev, fu, tk] = await Promise.all([
        state.tipos.events ? API.all('v_events', { gte: { inicio: lo }, lt: { inicio: hi }, ...respF, order: [['inicio', true]] }) : [],
        state.tipos.followups ? API.all('v_followups', { eq: { status: 'pendente' }, gte: { agendado_para: lo }, lt: { agendado_para: hi }, ...respF, order: [['agendado_para', true]] }) : [],
        state.tipos.tasks ? API.all('v_tasks', { in: { status: ['aberta', 'em_andamento'] }, gte: { prazo: lo }, lt: { prazo: hi }, ...respF, order: [['prazo', true]] }) : [],
      ]);
      const items = [
        ...ev.map(e => ({ k: e.tipo === 'treinamento' ? 'treinamento' : 'evento', t: e.inicio, fim: e.fim, titulo: e.titulo, conv: e.convidados, resp: e.minha_resposta,
          sub: [e.local, e.nome_contato, e.organizador_nome && e.organizador_nome !== App.me.nome ? 'por ' + e.organizador_nome : e.responsavel_nome, e.convidados ? `${e.confirmados}/${e.convidados} confirmados` : null].filter(Boolean).join(' · '),
          open: () => Forms.eventDetail(e.id, { onDone: load }) })),
        ...fu.map(f => ({ k: 'followup', t: f.agendado_para, titulo: FUL[f.tipo] + ' · ' + (f.nome_contato || ''), sub: [f.observacao, f.responsavel_nome].filter(Boolean).join(' · '), open: () => Forms.concluirFollowup(f, { onDone: load }), late: f.situacao === 'atrasado' })),
        ...tk.map(t => ({ k: 'tarefa', t: t.prazo, titulo: 'Tarefa · ' + t.titulo, sub: [t.nome_contato, t.responsavel_nome].filter(Boolean).join(' · '), open: () => Forms.task({}, { existing: t, onDone: load }) })),
      ].sort((x, y) => x.t < y.t ? -1 : 1);
      const byDay = U.groupBy(items, i => dates.iso(new Date(i.t)));
      paintBar();
      clear(body);
      if (state.modo === 'mes') {
        const [gs] = range(); const month = state.ref.slice(0, 7);
        const cal = h('div', { class: 'cal' }, ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => h('div', { class: 'cal-h' }, d)));
        for (let i = 0; i < 42; i++) {
          const d = dates.addDays(gs, i); if (i >= 35 && d.slice(0, 7) !== month) break;
          const its = byDay.get(d) || [];
          cal.appendChild(h('div', { class: 'cal-d' + (d.slice(0, 7) !== month ? ' out' : '') + (d === dates.today() ? ' today' : ''), ondblclick: () => Forms.event({}, { date: d, onDone: load }) },
            h('div', { class: 'cal-n' }, Number(d.slice(8))),
            its.slice(0, 4).map(it => h('div', { class: 'cal-ev' + (it.resp === 'pendente' ? ' pend' : ''), style: { '--c': it.late ? 'var(--bad)' : COL[it.k] }, title: it.titulo, onclick: it.open }, fmt.time(it.t) + ' ' + (it.conv ? '👥 ' : '') + it.titulo)),
            its.length > 4 ? h('button', { class: 'cal-more', style: { border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }, onclick: () => { state.modo = 'dia'; state.ref = d; load(); } }, `+${its.length - 4} mais`) : null));
        }
        body.append(cal, h('div', { class: 'legend' }, h('span', null, h('i', { class: 'sw', style: { background: COL.evento } }), 'Compromissos'), h('span', null, h('i', { class: 'sw', style: { background: COL.treinamento } }), 'Treinamentos'), h('span', null, h('i', { class: 'sw', style: { background: COL.followup } }), 'Follow-ups'),
          h('span', null, h('i', { class: 'sw', style: { background: COL.tarefa } }), 'Tarefas'), h('span', null, 'Dê dois cliques em um dia para criar um compromisso.')));
      } else {
        const [a2, b2] = range(); const days = [];
        for (let d = a2; d <= b2; d = dates.addDays(d, 1)) days.push(d);
        body.appendChild(h('div', { class: 'stack' }, days.map(d => {
          const its = byDay.get(d) || [];
          if (state.modo === 'semana' && !its.length) return h('div', { class: 'row', style: { color: 'var(--dim)', fontSize: '12.5px', padding: '4px 2px' } }, h('b', { style: { width: '150px' } }, U.toDate(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })), 'Sem compromissos');
          return h('div', { class: 'day-col' }, h('div', { class: 'section-title', style: { margin: '6px 0 2px' } }, U.toDate(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) + (d === dates.today() ? ' · hoje' : '')),
            its.length ? its.map(it => h('div', { class: 'agenda-item', style: { '--c': it.late ? 'var(--bad)' : COL[it.k] }, onclick: it.open }, h('div', { class: 'agenda-time' }, fmt.time(it.t)),
              h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'li-title' }, it.titulo), h('div', { class: 'li-sub' }, it.sub || '')), it.resp === 'pendente' ? badge('responder', 'var(--warn)') : null, badge(KL[it.k], COL[it.k], 'square')))
              : empty('Dia livre', 'Nenhum compromisso, follow-up ou tarefa.', h('button', { class: 'btn sm', onclick: () => Forms.event({}, { date: d, onDone: load }) }, icon('plus', 14), 'Compromisso')));
        })));
      }
    };
    const paintBar = () => {
      const [a, b] = range();
      const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
      const label = state.modo === 'mes' ? cap(fmt.monthLong(state.ref)) : state.modo === 'dia' ? U.toDate(state.ref).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : `${fmt.date(a)} – ${fmt.date(b)}`;
      const step = n => { state.ref = state.modo === 'mes' ? dates.addMonths(state.ref, n) : dates.addDays(state.ref, state.modo === 'semana' ? 7 * n : n); load(); };
      clear(bar).append(
        h('div', { class: 'seg' }, [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => h('button', { class: state.modo === k ? 'on' : '', onclick: () => { state.modo = k; load(); } }, l))),
        h('button', { class: 'icon-btn', 'aria-label': 'Anterior', onclick: () => step(-1) }, icon('chevronLeft')), h('button', { class: 'btn sm', onclick: () => { state.ref = dates.today(); load(); } }, 'Hoje'),
        h('button', { class: 'icon-btn', 'aria-label': 'Próximo', onclick: () => step(1) }, icon('chevronRight')), h('b', { style: { fontSize: '15px' } }, cap(label)),
        h('span', { class: 'grow' }),
        ...[['events', 'Compromissos'], ['followups', 'Follow-ups'], ['tasks', 'Tarefas']].map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.tipos[k] || null, onchange: e => { state.tipos[k] = e.target.checked; load(); } }), l)),
        App.gestor() ? h('select', { 'aria-label': 'Responsável', onchange: e => { state.resp = e.target.value || null; load(); } }, h('option', { value: '' }, 'Toda a estrutura'), h('option', { value: App.me.id, selected: state.resp === App.me.id || null }, 'Somente a minha'), App.opt.corretores().map(o => h('option', { value: o.value, selected: state.resp === o.value || null }, o.label))) : null);
    };
    wrap.append(App.pageHead('Agenda', { eyebrow: 'Integrada ao CRM', desc: 'Reuniões, treinamentos, ligações, follow-ups e prazos de tarefas em um só lugar. Convide a equipe, acompanhe as confirmações e receba lembretes.',
      actions: [h('button', { class: 'btn', onclick: () => Forms.event({}, { onDone: load, tipo: 'treinamento' }) }, icon('sparkles', 16), 'Novo treinamento'), h('button', { class: 'btn primary', onclick: () => Forms.event({}, { onDone: load }) }, icon('plus', 16), 'Nova reunião')] }), convites, bar, body);
    await load();
    if (params.q.evento) Forms.eventDetail(params.q.evento, { onDone: load });
    return wrap;
  };

  // ------------------------------------------------------------------
  // TAREFAS
  // ------------------------------------------------------------------
  Views.tarefas = async function () {
    const state = { escopo: App.gestor() ? 'todas' : 'minhas', status: 'abertas', prioridade: null, resp: null, search: '' };
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div');
    const ST = { aberta: ['Aberta', 'var(--blue-2)'], em_andamento: ['Em andamento', 'var(--cyan)'], concluida: ['Concluída', 'var(--ok)'], cancelada: ['Cancelada', 'var(--muted)'] };
    const load = async () => {
      const o = { eq: {}, order: [['prazo', true]] };
      if (state.status === 'abertas') o.in = { status: ['aberta', 'em_andamento'] }; else if (state.status) o.eq.status = state.status;
      if (state.prioridade) o.eq.prioridade = state.prioridade;
      if (state.escopo === 'minhas') o.eq.responsavel_id = App.me.id; else if (state.resp) o.eq.responsavel_id = state.resp;
      if (state.search) o.search = { cols: ['titulo', 'descricao', 'nome_contato'], term: state.search };
      clear(body).appendChild(U.skeleton(6));
      const rows = await API.all('v_tasks', o);
      const cols = [
        { label: '', width: '32px', render: t => h('input', { type: 'checkbox', 'aria-label': 'Concluir', checked: t.status === 'concluida' || null, onchange: async e => { try { await API.update('tasks', t.id, { status: e.target.checked ? 'concluida' : 'aberta' }); toast(e.target.checked ? 'Tarefa concluída' : 'Tarefa reaberta'); load(); App.refreshCounts(); } catch (er) { App.err(er); } } }) },
        { label: 'Tarefa', render: t => h('div', null, h('div', { class: 'cell-main', style: t.status === 'concluida' ? { textDecoration: 'line-through', color: 'var(--muted)' } : null }, t.titulo), h('div', { class: 'cell-sub' }, t.descricao || '')) },
        { label: 'Vínculo', render: t => t.lead_id ? h('a', { href: '#/leads/' + t.lead_id }, t.nome_contato) : t.client_id ? h('a', { href: '#/clientes/' + t.client_id }, t.nome_contato) : h('span', { class: 'dim' }, '—') },
        { label: 'Prioridade', render: t => badge(t.prioridade, PCOL[t.prioridade]) },
        { label: 'Prazo', render: t => t.prazo ? h('span', { class: t.atrasada ? 'bad-t' : '' }, fmt.datetime(t.prazo), t.atrasada ? ' · atrasada' : '') : '—' },
        { label: 'Status', render: t => badge(ST[t.status][0], ST[t.status][1], 'dot') },
        { label: 'Responsável', render: t => App.person(t.responsavel_nome, 22) }, { label: 'Criada por', render: t => h('span', { class: 'muted' }, t.criado_por_nome || '—') },
      ];
      clear(body).appendChild(U.table(cols, rows, { onRow: t => Forms.task({}, { existing: t, onDone: load }), emptyText: 'Nenhuma tarefa com estes filtros.' }));
    };
    const sel = (k, label, o, val) => h('select', { 'aria-label': label, onchange: e => { state[k] = e.target.value || null; load(); } }, label ? h('option', { value: '' }, label) : null, o.map(x => h('option', { value: x.value, selected: (val ?? state[k]) === x.value || null }, x.label)));
    filters.append(h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar tarefa…', oninput: U.debounce(e => { state.search = e.target.value; load(); }, 300) }),
      App.gestor() ? h('div', { class: 'seg' }, [['todas', 'Da estrutura'], ['minhas', 'Minhas']].map(([k, l]) => h('button', { class: state.escopo === k ? 'on' : '', onclick: e => { state.escopo = k; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); load(); } }, l))) : null,
      sel('status', null, [{ value: 'abertas', label: 'Abertas e em andamento' }, { value: 'aberta', label: 'Abertas' }, { value: 'em_andamento', label: 'Em andamento' }, { value: 'concluida', label: 'Concluídas' }, { value: 'cancelada', label: 'Canceladas' }], 'abertas'),
      sel('prioridade', 'Todas as prioridades', Forms.PRIOS),
      App.gestor() ? sel('resp', 'Todos os responsáveis', [...App.opt.corretores(), ...App.opt.supervisores()]) : null);
    wrap.append(App.pageHead('Tarefas', { eyebrow: 'Central de tarefas', desc: 'Tarefas vinculadas a leads, clientes, vendas ou à equipe.', actions: [h('button', { class: 'btn primary', onclick: () => Forms.task({}, { onDone: load }) }, icon('plus', 16), 'Nova tarefa')] }), filters, body);
    await load();
    return wrap;
  };
})(window);
