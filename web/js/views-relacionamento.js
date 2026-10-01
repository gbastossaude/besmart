/* =====================================================================
   ATOS SISTEMA — views-relacionamento.js
   Relacionamento com o cliente: aniversários (titular e dependentes),
   lembrete de manter contato e mensagens prontas para enviar.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, toast, avatar } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Forms = global.Forms;

  const MSG_PADRAO = {
    msg_aniversario: 'Olá, {primeiro_nome}! 🎉 Hoje é um dia especial e eu não poderia deixar de desejar um feliz aniversário! Que seja um novo ano de muita saúde, alegria e conquistas. Conte sempre comigo. Um abraço, {corretor}.',
    msg_aniversario_dependente: 'Olá, {primeiro_nome}! Passando para desejar um feliz aniversário a {dependente}! 🎉 Muita saúde e alegria para toda a família. Um abraço, {corretor}.',
    msg_contato: 'Olá, {primeiro_nome}, tudo bem? Aqui é {corretor}. Passando para saber como está a experiência com o seu plano {operadora} e se posso ajudar em algo. Estou à disposição!',
  };
  const cfg = () => ({ contato_dias: 60, ...MSG_PADRAO, ...(App.lk.settings.relacionamento || {}) });
  const primeiro = n => String(n || '').trim().split(/\s+/)[0] || '';
  const doisNomes = n => String(n || '').trim().split(/\s+/).slice(0, 2).join(' ');
  const diaSemana = d => U.toDate(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const quando = dd => dd === 0 ? 'Hoje' : dd === 1 ? 'Amanhã' : 'Em ' + dd + ' dias';

  /** Mensagem pronta (aniversário, aniversário do dependente ou manter contato) */
  async function mensagem(clienteId, tipo = 'contato', { depId, onDone } = {}) {
    const c = await API.get('v_relacionamento', clienteId);
    if (!c) return toast('Cliente não encontrado ou fora da sua carteira', 'err');
    const dep = depId ? await API.get('v_aniversarios_dependentes', depId) : null;
    const k = tipo === 'aniversario_dependente' ? 'msg_aniversario_dependente' : tipo === 'aniversario' ? 'msg_aniversario' : 'msg_contato';
    const vars = { nome: c.nome, primeiro_nome: primeiro(c.nome), corretor: doisNomes(c.corretor_nome || App.me.nome), operadora: c.operadora_nome, produto: c.produto_nome,
      idade: tipo === 'aniversario' ? c.idade_no_aniversario : dep ? dep.idade_no_aniversario : '', dependente: dep ? primeiro(dep.nome) : '', empresa: (App.lk.settings.empresa || {}).nome || 'Atos' };
    const txt = h('textarea', { id: 'msg_rel', rows: 6, style: { width: '100%' } }, App.preencherMensagem(cfg()[k], vars));
    const tel = c.whatsapp || c.telefone;
    const titulo = tipo === 'contato' ? 'Manter contato' : 'Mensagem de aniversário';
    const registrar = async (canal) => {
      await API.rpc('registrar_atividade', { p_lead: null, p_tipo: canal, p_efetivo: true, p_resultado: 'mensagem_relacionamento',
        p_descricao: (tipo === 'contato' ? 'Mensagem de relacionamento' : 'Parabéns de aniversário' + (dep ? ' (' + dep.nome + ')' : '')) + ': ' + txt.value.slice(0, 180), p_client: c.id });
    };
    const info = [tipo === 'contato' ? `Sem contato há ${c.dias_sem_contato} dia(s)` : null, c.operadora_nome, c.produto_nome, App.gestor() ? 'Responsável: ' + (c.corretor_nome || '—') : null].filter(Boolean).join(' · ');
    const m = U.modal({ title: titulo, subtitle: (dep ? dep.nome + ' · dependente de ' : '') + c.nome, size: 'md', body: h('div', { class: 'stack' },
      h('div', { class: 'rel-head' }, h('span', { class: 'rel-ic ' + (tipo === 'contato' ? 'ct' : 'bd') }, icon(tipo === 'contato' ? 'whatsapp' : 'star', 18)),
        h('div', { class: 'grow' }, h('div', { class: 'cell-main' }, dep ? `${dep.nome} faz ${dep.idade_no_aniversario} anos` : tipo === 'contato' ? c.nome : `${c.nome}${c.idade_no_aniversario ? ' faz ' + c.idade_no_aniversario + ' anos' : ''}`),
          h('div', { class: 'cell-sub' }, info))),
      h('div', { class: 'field' }, h('label', { for: 'msg_rel' }, 'Mensagem (pode editar antes de enviar)'), txt),
      tel ? h('div', { class: 'muted', style: { fontSize: '12px' } }, 'WhatsApp: ' + fmt.phone(tel)) : h('div', { class: 'bulkbar', style: { background: 'rgba(242,169,59,.1)', borderColor: 'rgba(242,169,59,.45)', color: '#F7C77A' } }, icon('alert', 15), h('span', null, 'Cliente sem WhatsApp cadastrado — copie a mensagem e envie pelo canal que preferir.'))),
      footer: [
        h('button', { class: 'btn ghost', onclick: async () => { try { await navigator.clipboard.writeText(txt.value); toast('Mensagem copiada'); } catch (e) { txt.select(); toast('Selecione e copie a mensagem', 'info'); } } }, icon('note', 15), 'Copiar'),
        h('button', { class: 'btn', onclick: async () => { try { await registrar('outro'); m.close(); toast('Contato registrado no histórico do cliente'); App.refreshCounts(); onDone && onDone(); } catch (e) { App.err(e); } } }, icon('check', 15), 'Já enviei'),
        h('span', { class: 'grow' }),
        tel ? h('button', { class: 'btn primary wa', onclick: async () => {
          global.open(U.waLink(tel, txt.value), '_blank', 'noopener');
          try { await registrar('whatsapp'); m.close(); toast('WhatsApp aberto e contato registrado'); App.refreshCounts(); onDone && onDone(); } catch (e) { App.err(e); } } }, icon('whatsapp', 16), 'Enviar pelo WhatsApp') : null] });
  }
  Forms.mensagemRelacionamento = mensagem;

  // ------------------------------------------------------------------
  // Tela Relacionamento
  // ------------------------------------------------------------------
  Views.relacionamento = async function (params) {
    const state = { aba: params.q.aba || (params.q.msg === 'contato' ? 'contato' : 'aniversarios'), corretor: null, janela: 30, busca: '' };
    const wrap = h('div'); const kpis = h('div', { class: 'kpis', style: { marginBottom: '14px' } }); const tabBar = h('div'); const bar = h('div', { class: 'filters' }); const body = h('div');
    let clientes = [], deps = [];
    const load = async () => {
      [clientes, deps] = await Promise.all([API.all('v_relacionamento', { order: [['nome', true]] }), API.all('v_aniversarios_dependentes', { order: [['dias_para_aniversario', true]] })]);
      paint();
    };
    const filtro = r => (!state.corretor || r.corretor_id === state.corretor) && (!state.busca || (r.nome + ' ' + (r.cliente_nome || '')).toLowerCase().includes(state.busca.toLowerCase()));
    const paint = () => {
      const C = cfg();
      const aniv = [...clientes.filter(c => c.dias_para_aniversario !== null && c.dias_para_aniversario !== undefined).map(c => ({ ...c, dep: false })),
        ...deps.map(d => ({ ...d, dep: true }))].filter(filtro).sort((a, b) => a.dias_para_aniversario - b.dias_para_aniversario || a.nome.localeCompare(b.nome));
      const semContato = clientes.filter(c => ['ativo', 'renovacao', 'migracao', 'inadimplente'].includes(c.status) && c.dias_sem_contato >= C.contato_dias).filter(filtro).sort((a, b) => b.dias_sem_contato - a.dias_sem_contato);
      const hoje = aniv.filter(a => a.dias_para_aniversario === 0), sem7 = aniv.filter(a => a.dias_para_aniversario <= 7), mes = aniv.filter(a => (a.proximo_aniversario || '').slice(0, 7) === dates.today().slice(0, 7));
      clear(kpis).append(
        App.kpi('Aniversariantes hoje', fmt.int(hoje.length), { hero: true, state: hoje.length ? '#E3B341' : null, onClick: () => { state.aba = 'aniversarios'; state.janela = 0; paint(); } }),
        App.kpi('Próximos 7 dias', fmt.int(sem7.length), { onClick: () => { state.aba = 'aniversarios'; state.janela = 7; paint(); } }),
        App.kpi('Aniversariantes do mês', fmt.int(mes.length)),
        App.kpi(`Sem contato há ${C.contato_dias}+ dias`, fmt.int(semContato.length), { state: semContato.length ? 'var(--warn)' : 'var(--ok)', onClick: () => { state.aba = 'contato'; paint(); } }));
      clear(tabBar).appendChild(U.tabs([{ key: 'aniversarios', label: 'Aniversários', count: sem7.length }, { key: 'contato', label: 'Manter contato', count: semContato.length }, { key: 'modelos', label: 'Mensagens prontas' }], state.aba, k => { state.aba = k; paint(); }));
      clear(bar).append(state.aba !== 'modelos' ? h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar cliente…', value: state.busca, oninput: U.debounce(e => { state.busca = e.target.value; paint(); }, 250) }) : null,
        state.aba === 'aniversarios' ? h('div', { class: 'seg' }, [[0, 'Hoje'], [7, '7 dias'], [30, '30 dias'], [366, 'Ano todo']].map(([k, l]) => h('button', { class: state.janela === k ? 'on' : '', onclick: () => { state.janela = k; paint(); } }, l))) : null,
        App.gestor() && state.aba !== 'modelos' ? h('select', { 'aria-label': 'Corretor', onchange: e => { state.corretor = e.target.value || null; paint(); } }, h('option', { value: '' }, 'Todos os corretores'), App.opt.corretores().map(o => h('option', { value: o.value, selected: state.corretor === o.value || null }, o.label))) : null);
      clear(body);
      if (state.aba === 'aniversarios') {
        const lista = aniv.filter(a => a.dias_para_aniversario <= state.janela);
        if (!lista.length) { body.appendChild(empty('Nenhum aniversário neste período', 'Cadastre a data de nascimento dos clientes e dependentes para receber os lembretes.')); return; }
        const grupos = U.groupBy(lista, a => a.dias_para_aniversario === 0 ? 'Hoje' : a.dias_para_aniversario === 1 ? 'Amanhã' : a.dias_para_aniversario <= 7 ? 'Próximos 7 dias' : a.dias_para_aniversario <= 31 ? 'Próximos 30 dias' : 'Mais adiante');
        for (const [g, itens] of grupos) {
          body.append(h('div', { class: 'section-title' }, g + ` · ${itens.length}`), h('div', { class: 'card rel-list' }, itens.map(a => {
            const cid = a.dep ? a.client_id : a.id, tel = a.whatsapp || a.telefone;
            return h('div', { class: 'list-item rel-item' + (a.dias_para_aniversario === 0 ? ' today' : '') },
              h('span', { class: 'rel-date' }, h('b', null, U.toDate(a.proximo_aniversario).getDate()), h('small', null, U.toDate(a.proximo_aniversario).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''))),
              avatar(a.nome, 34),
              h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, a.nome, a.dep ? h('span', { class: 'badge square', style: { '--c': 'var(--cyan)', marginLeft: '8px' } }, a.parentesco || 'dependente') : null),
                h('div', { class: 'li-sub' }, [a.idade_no_aniversario ? `faz ${a.idade_no_aniversario} anos` : null, quando(a.dias_para_aniversario) + ' · ' + diaSemana(a.proximo_aniversario), a.dep ? 'família de ' + a.cliente_nome : a.operadora_nome, App.gestor() ? a.corretor_nome : null].filter(Boolean).join(' · '))),
              h('button', { class: 'btn sm ' + (a.dias_para_aniversario <= 1 ? 'primary' : ''), onclick: () => mensagem(cid, a.dep ? 'aniversario_dependente' : 'aniversario', { depId: a.dep ? a.id : null, onDone: load }) }, icon(tel ? 'whatsapp' : 'note', 14), 'Enviar parabéns'),
              h('button', { class: 'icon-btn sm', 'aria-label': 'Abrir cliente', onclick: () => App.go('/clientes/' + cid) }, icon('chevronRight', 16)));
          })));
        }
      } else if (state.aba === 'contato') {
        body.append(h('div', { class: 'bulkbar' }, icon('clock', 15), h('span', null, `Clientes ativos sem contato registrado há ${C.contato_dias} dias ou mais. Todo dia o responsável recebe até ${C.contato_max_dia || 5} lembretes, começando pelos mais antigos. Enviar a mensagem registra o contato automaticamente.`)),
          U.table([
            { label: 'Cliente', render: c => h('div', { class: 'person' }, avatar(c.nome, 30), h('div', null, h('div', { class: 'cell-main' }, c.nome), h('div', { class: 'cell-sub' }, [c.operadora_nome, c.produto_nome].filter(Boolean).join(' · ')))) },
            { label: 'Último contato', render: c => c.ultimo_contato_em ? fmt.date(c.ultimo_contato_em) : h('span', { class: 'dim' }, 'nenhum registrado') },
            { label: 'Dias sem contato', align: 'right', render: c => h('b', { class: c.dias_sem_contato >= 2 * C.contato_dias ? 'bad-t' : 'warn-t' }, fmt.int(c.dias_sem_contato)) },
            { label: 'Vidas', align: 'right', key: 'num_vidas' },
            { label: 'Vigência', render: c => c.vigencia ? fmt.date(c.vigencia) : '—' },
            App.gestor() ? { label: 'Responsável', render: c => App.person(c.corretor_nome, 22) } : null,
            { label: '', render: c => h('button', { class: 'btn xs primary', onclick: () => mensagem(c.id, 'contato', { onDone: load }) }, icon('whatsapp', 13), 'Enviar mensagem') },
          ].filter(Boolean), semContato, { onRow: c => App.go('/clientes/' + c.id), emptyText: 'Todos os clientes tiveram contato recente. 👏' }));
      } else {
        const admin = App.is('admin');
        const campos = [['msg_aniversario', 'Aniversário do cliente'], ['msg_aniversario_dependente', 'Aniversário de dependente'], ['msg_contato', 'Manter contato']];
        const areas = {};
        body.append(h('div', { class: 'bulkbar' }, icon('note', 15), h('span', null, 'Use as variáveis {primeiro_nome}, {nome}, {corretor}, {operadora}, {produto}, {idade}, {dependente} e {empresa} — elas são trocadas pelos dados de cada cliente.')),
          h('div', { class: 'grid g3' }, campos.map(([k, l]) => App.card(l, h('div', { class: 'stack' },
            (areas[k] = h('textarea', { rows: 7, disabled: !admin || null, 'aria-label': l }, C[k])),
            h('div', { class: 'msg-preview' }, h('small', null, 'Exemplo:'), App.preencherMensagem(C[k], { nome: 'Mariana Souza', primeiro_nome: 'Mariana', corretor: doisNomes(App.me.nome), operadora: 'Amil', produto: 'S380', idade: 35, dependente: 'Lucas', empresa: (App.lk.settings.empresa || {}).nome })))))),
          admin ? h('div', { class: 'row', style: { marginTop: '12px' } }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: async () => {
            const v = { ...(App.lk.settings.relacionamento || {}) }; campos.forEach(([k]) => { v[k] = areas[k].value.trim() || MSG_PADRAO[k]; });
            try { if (App.lk.settings.relacionamento) await API.update('settings', 'relacionamento', { valor: v }, 'chave'); else await API.insert('settings', { chave: 'relacionamento', valor: v, descricao: 'Lembretes de relacionamento' }); await App.loadLookups(); toast('Mensagens salvas'); }
            catch (e) { App.err(e); } } }, 'Salvar mensagens')) : h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Somente o administrador altera os modelos. Na hora de enviar, você pode editar o texto.'));
      }
    };
    wrap.append(App.pageHead('Relacionamento', { eyebrow: 'Pós-venda', desc: 'Aniversários de clientes e dependentes e lembretes para manter contato — com a mensagem pronta para enviar pelo WhatsApp.' }), kpis, tabBar, bar, body);
    await load();
    if (params.q.cliente) mensagem(params.q.cliente, params.q.msg || 'contato', { depId: params.q.dep || null, onDone: load });
    return wrap;
  };

  /** cartão "Relacionamento de hoje" (Minha carteira) */
  App.relacionamentoHoje = async function () {
    const [cl, dp] = await Promise.all([API.all('v_relacionamento', { lte: { dias_para_aniversario: 1 }, order: [['dias_para_aniversario', true]] }), API.all('v_aniversarios_dependentes', { lte: { dias_para_aniversario: 1 } })]);
    const C = cfg();
    const contato = (await API.list('v_relacionamento', { gte: { dias_sem_contato: C.contato_dias }, in: { status: ['ativo', 'renovacao', 'migracao', 'inadimplente'] }, order: [['dias_sem_contato', false]], limit: 3, count: true }));
    const itens = [...cl.map(c => ({ id: c.id, nome: c.nome, sub: quando(c.dias_para_aniversario) + (c.idade_no_aniversario ? ` · faz ${c.idade_no_aniversario} anos` : ''), tipo: 'aniversario' })),
      ...dp.map(d => ({ id: d.client_id, dep: d.id, nome: d.nome, sub: quando(d.dias_para_aniversario) + ' · dependente de ' + d.cliente_nome, tipo: 'aniversario_dependente' })),
      ...contato.rows.map(c => ({ id: c.id, nome: c.nome, sub: `Sem contato há ${c.dias_sem_contato} dias`, tipo: 'contato' }))];
    if (!itens.length) return null;
    return App.card('Relacionamento de hoje', h('div', { class: 'list' }, itens.slice(0, 6).map(it => h('div', { class: 'list-item' },
      h('span', { class: 'rel-ic ' + (it.tipo === 'contato' ? 'ct' : 'bd') }, icon(it.tipo === 'contato' ? 'whatsapp' : 'star', 15)),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, it.nome), h('div', { class: 'li-sub' }, it.sub)),
      h('button', { class: 'btn xs primary', onclick: () => mensagem(it.id, it.tipo, { depId: it.dep, onDone: () => App.reload() }) }, it.tipo === 'contato' ? 'Mensagem' : 'Parabéns')))),
      { sub: 'Mensagens prontas', right: h('button', { class: 'btn xs ghost', onclick: () => App.go('/relacionamento') }, 'Ver tudo') });
  };
})(window);
