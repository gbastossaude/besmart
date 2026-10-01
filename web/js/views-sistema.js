/* =====================================================================
   ATOS SISTEMA — views-sistema.js
   Operadoras, Produtos, Notificações e Configurações (admin):
   usuários, equipes, funil/status, origens/campanhas, motivos de perda,
   distribuição, permissões, parâmetros, integrações e auditoria.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, confirmDialog, toast, avatar, debounce } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Forms = global.Forms;
  const admin = () => App.is('admin');
  const ativoBadge = a => a ? badge('Ativo', 'var(--ok)', 'dot') : badge('Inativo', 'var(--muted)', 'dot');
  function crud({ title, table, fields, values, onDone, subtitle }) {
    const f = U.form(fields, values || {}, { cols: 2 });
    const m = U.modal({ title, subtitle, size: 'md', body: f, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: async () => { if (!f.validate()) return; const v = f.values(); try {
        const key = { pipeline_stages: 'codigo', lead_statuses: 'codigo', settings: 'chave', implementation_stages: 'codigo', commission_grades: 'codigo' }[table] || 'id';
        if ('status_venda' in v && !v.status_venda) v.status_venda = null;
        Object.keys(v).forEach(k => { const fd = fields.find(x => x.name === k); if (fd && fd.disabled) delete v[k]; });
        if (values && values[key]) await API.update(table, values[key], v, key); else await API.insert(table, v);
        m.close(); toast('Salvo'); await App.loadLookups(); onDone && onDone(); } catch (e) { App.err(e); } } }, 'Salvar')] });
  }

  // ------------------------------------------------------------------
  // OPERADORAS
  // ------------------------------------------------------------------
  Views.operadoras = async function () {
    const [ops, prods, sales] = await Promise.all([API.all('operators', { isNull: ['deleted_at'], order: [['nome', true]] }), API.all('v_products', {}),
      API.all('v_sales', { select: 'operator_id,valor_mensal,status', in: { status: ['aprovada', 'implantada'] }, gte: { data_venda: dates.addDays(dates.today(), -365) } })]);
    const reload = () => App.reload();
    const form = o => crud({ title: o ? 'Editar operadora' : 'Nova operadora', table: 'operators', values: o, onDone: reload, fields: [
      { name: 'nome', label: 'Nome', required: true, span: 2 }, { name: 'cnpj', label: 'CNPJ', mask: 'cnpj' }, { name: 'registro_ans', label: 'Registro ANS' },
      { name: 'site', label: 'Site' }, { name: 'cor', label: 'Cor (hex)', placeholder: '#2E6BFF' }, { name: 'ativo', label: 'Status', type: 'checkbox', checkLabel: 'Operadora ativa' }] });
    return h('div', null, App.pageHead('Operadoras', { eyebrow: 'Cadastros', desc: 'Nenhuma operadora é fixa no código: cadastre, edite, ative ou desative conforme a corretora trabalha.',
      actions: admin() ? [h('button', { class: 'btn primary', onclick: () => form({ ativo: true }) }, icon('plus', 16), 'Nova operadora')] : null }),
      U.table([
        { label: 'Operadora', render: o => h('div', { class: 'person' }, h('span', { class: 'avatar', style: { width: '30px', height: '30px', borderRadius: '8px', '--h': 220 } }, U.fmt.initials(o.nome)), h('div', null, h('div', { class: 'cell-main' }, o.nome), h('div', { class: 'cell-sub' }, o.registro_ans ? 'ANS ' + o.registro_ans : ''))) },
        { label: 'Produtos', align: 'right', render: o => prods.filter(p => p.operator_id === o.id).length },
        { label: 'Vendas (12 meses)', align: 'right', render: o => fmt.int(sales.filter(s => s.operator_id === o.id).length) },
        { label: 'Produção (12 meses)', align: 'right', render: o => fmt.money0(U.sum(sales.filter(s => s.operator_id === o.id), s => s.valor_mensal)) },
        { label: 'Status', render: o => ativoBadge(o.ativo) },
        admin() ? { label: '', render: o => h('div', { class: 'row no-row' }, h('button', { class: 'btn xs', onclick: () => form(o) }, 'Editar'),
          h('button', { class: 'btn xs ghost', onclick: async () => { try { await API.update('operators', o.id, { ativo: !o.ativo }); await App.loadLookups(); reload(); } catch (e) { App.err(e); } } }, o.ativo ? 'Desativar' : 'Ativar')) } : null,
      ].filter(Boolean), ops, { onRow: o => App.go('/produtos?op=' + o.id) }));
  };

  // ------------------------------------------------------------------
  // PRODUTOS
  // ------------------------------------------------------------------
  Views.produtos = async function (params) {
    const state = { op: params.q.op || null, search: '' };
    const wrap = h('div'); const filters = h('div', { class: 'filters' }); const body = h('div');
    const form = p => productForm(p, load, [
      { name: 'nome', label: 'Nome do produto', required: true, span: 2 }, { name: 'operator_id', label: 'Operadora', type: 'select', required: true, options: App.opt.ops() },
      { name: 'ramo', label: 'Ramo', type: 'select', required: true, options: [['saude', 'Saúde'], ['odonto', 'Odontológico'], ['vida', 'Seguro de vida'], ['seguro', 'Seguros'], ['consorcio', 'Consórcio'], ['previdencia', 'Previdência'], ['beneficios', 'Benefícios']].map(([value, label]) => ({ value, label })) },
      { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [['individual', 'Individual'], ['familiar', 'Familiar'], ['adesao', 'Adesão'], ['pme', 'PME'], ['empresarial', 'Empresarial']].map(([value, label]) => ({ value, label })) },
      { name: 'abrangencia', label: 'Abrangência', type: 'select', options: ['municipal', 'regional', 'estadual', 'nacional'].map(x => ({ value: x, label: x })) },
      { name: 'segmentacao', label: 'Segmentação' }, { name: 'acomodacao', label: 'Acomodação', type: 'select', options: [{ value: 'enfermaria', label: 'Enfermaria' }, { value: 'apartamento', label: 'Apartamento' }] },
      { name: 'coparticipacao', label: 'Coparticipação', type: 'checkbox', checkLabel: 'Com coparticipação' },
      { name: 'min_vidas', label: 'Mínimo de vidas', type: 'number', min: 1 }, { name: 'max_vidas', label: 'Máximo de vidas', type: 'number', min: 1 },
      { name: 'vigencia', label: 'Vigência' }, { name: 'ativo', label: 'Status', type: 'checkbox', checkLabel: 'Produto ativo' },
      { name: 'observacoes', label: 'Observações', type: 'textarea', rows: 2, span: 2 }]);
    const load = async () => {
      const o = { order: [['operadora_nome', true], ['nome', true]], eq: {} };
      if (state.op) o.eq.operator_id = state.op;
      if (state.search) o.search = { cols: ['nome', 'operadora_nome'], term: state.search };
      const rows = await API.all('v_products', o);
      clear(body).appendChild(U.table([
        { label: 'Produto', render: p => h('div', null, h('div', { class: 'cell-main' }, p.nome), h('div', { class: 'cell-sub' }, p.operadora_nome)) },
        { label: 'Ramo / tipo', render: p => `${p.ramo} · ${p.tipo}` }, { label: 'Abrangência', render: p => p.abrangencia || '—' }, { label: 'Segmentação', render: p => p.segmentacao || '—' },
        { label: 'Acomodação', render: p => p.acomodacao || '—' }, { label: 'Copart.', render: p => p.coparticipacao ? 'Sim' : 'Não' },
        { label: 'Vidas', render: p => [p.min_vidas, p.max_vidas].every(x => x == null) ? '—' : `${p.min_vidas ?? 1} a ${p.max_vidas ?? '∞'}` },
        App.can('comissoes.ver') ? { label: 'Grade de comissão', render: p => Number(p.grade_parcelas) ? h('button', { class: 'btn xs', onclick: e => { e.stopPropagation(); Forms.productGrid(p, { onDone: load }); } }, icon('coins', 13), p.grade_parcelas + ' parcela(s)') : admin() ? h('button', { class: 'btn xs ghost', onclick: e => { e.stopPropagation(); Forms.productGrid(p, { onDone: load }); } }, icon('plus', 13), 'Cadastrar') : h('span', { class: 'dim' }, 'sem grade') } : null,
        { label: 'Status', render: p => ativoBadge(p.ativo) },
      ].filter(Boolean), rows, { onRow: admin() ? p => form(p) : null, emptyText: 'Nenhum produto.' }));
    };
    filters.append(h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar produto…', oninput: debounce(e => { state.search = e.target.value; load(); }, 300) }),
      h('select', { 'aria-label': 'Operadora', onchange: e => { state.op = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todas as operadoras'), App.opt.ops().map(o => h('option', { value: o.value, selected: state.op === o.value || null }, o.label))));
    wrap.append(App.pageHead('Produtos e planos', { eyebrow: 'Cadastros', desc: 'Preparado para saúde, odonto, vida, seguros, consórcio, previdência e benefícios.',
      actions: admin() ? [h('button', { class: 'btn primary', onclick: () => form({ operator_id: state.op, ramo: 'saude', tipo: 'pme', ativo: true }) }, icon('plus', 16), 'Novo produto')] : null }), filters, body);
    await load();
    return wrap;
  };

  async function productForm(p, onDone, fields) {
    const values = p ? { ...p } : {};
    const f = U.form(fields, values, { cols: 2 });
    const linhas = p && p.id ? await API.all('product_commission_grid', { eq: { product_id: p.id }, order: [['parcela', true]] }) : [];
    const ed = Forms.gridEditor(linhas);
    const m = U.modal({ title: p && p.id ? 'Editar produto' : 'Novo produto', subtitle: 'Dados do plano e grade de comissão (o que a corretora recebe e o que paga a cada modalidade de corretor)', size: 'xl',
      body: h('div', { class: 'stack' }, f, h('div', { class: 'form-section' }, 'Grade de comissão deste produto'), ed),
      footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => {
        if (!f.validate()) return; const v = f.values();
        const aviso = ed.validar(); if (aviso && aviso.startsWith('Informe')) return toast(aviso, 'err');
        if (aviso && !(await U.confirmDialog({ title: 'Repasse maior que o recebido', message: aviso + ' Deseja salvar mesmo assim?', confirm: 'Salvar mesmo assim' }))) return;
        try {
          const prod = p && p.id ? await API.update('products', p.id, v) : await API.insert('products', v);
          const gl = ed.getLinhas();
          if (gl.length || linhas.length) await API.rpc('salvar_grade_produto', { p_product: prod.id, p_linhas: gl });
          m.close(); toast(gl.length ? 'Produto e grade de comissão salvos' : 'Produto salvo'); await App.loadLookups(); onDone && onDone();
        } catch (e) { App.err(e); } } }, 'Salvar')] });
  }

  // ------------------------------------------------------------------
  // NOTIFICAÇÕES
  // ------------------------------------------------------------------
  Views.notificacoes = async function () {
    const state = { apenas: false };
    const wrap = h('div'); const body = h('div');
    const load = async () => {
      const o = { order: [['created_at', false]], limit: 200 }; if (state.apenas) o.eq = { lida: false };
      const { rows } = await API.list('notifications', o);
      clear(body).appendChild(rows.length ? h('div', { class: 'card', style: { padding: '4px 14px' } }, rows.map(n => App.notifItem(n, load))) : empty('Nenhuma notificação', 'Alertas de leads, follow-ups, implantação, pendências, vendas, aniversários e metas aparecem aqui.'));
    };
    wrap.append(App.pageHead('Notificações', { eyebrow: 'Alertas internos', actions: [
      h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: e => { state.apenas = e.target.checked; load(); } }), 'Somente não lidas'),
      h('button', { class: 'btn', onclick: async () => { await API.rpc('marcar_notificacoes_lidas', { p_ids: null }); App.refreshCounts(); load(); } }, icon('check', 16), 'Marcar todas como lidas')] }), body);
    await load();
    return wrap;
  };

  // ------------------------------------------------------------------
  // CONFIGURAÇÕES (administrador)
  // ------------------------------------------------------------------
  const TABS = [['usuarios', 'Usuários'], ['equipes', 'Equipes'], ['grades', 'Grades de comissão'], ['funil', 'CRM e implantação'], ['origens', 'Origens e campanhas'], ['perdas', 'Motivos de perda'],
    ['distribuicao', 'Distribuição'], ['permissoes', 'Permissões'], ['parametros', 'Parâmetros'], ['integracoes', 'Integrações'], ['auditoria', 'Auditoria']];
  Views.configuracoes = async function ({ tab }) {
    if (!admin()) return empty('Acesso restrito', 'Somente o administrador acessa as configurações.');
    const cur = tab || 'usuarios';
    const body = h('div', null, U.skeleton(8));
    const go = k => App.go('/configuracoes/' + k);
    const wrap = h('div', null, App.pageHead('Configurações', { eyebrow: 'Administração do sistema' }), U.tabs(TABS.map(([key, label]) => ({ key, label })), cur, go), body);
    const reload = () => App.reload();
    const render = CFG[cur] || CFG.usuarios;
    clear(body).appendChild(await render(reload));
    return wrap;
  };

  const CFG = {
    async usuarios(reload) {
      const state = { search: '', papel: null, status: null };
      const box = h('div'); const tb = h('div');
      const load = async () => {
        const o = { order: [['status', false], ['nome', true]], eq: {} };
        if (state.papel) o.eq.papel = state.papel; if (state.status) o.eq.status = state.status;
        if (state.search) o.search = { cols: ['nome', 'email'], term: state.search };
        const rows = await API.all('v_profiles', o);
        const pend = rows.filter(r => r.status === 'pendente').length;
        clear(tb).append(pend ? h('div', { class: 'bulkbar', style: { background: 'rgba(242,169,59,.1)', borderColor: 'rgba(242,169,59,.45)', color: '#F7C77A' } }, icon('alert', 15), `${pend} usuário(s) aguardando aprovação.`) : null,
          U.table([
            { label: 'Usuário', render: u => h('div', { class: 'person' }, avatar(u.nome, 30), h('div', null, h('div', { class: 'cell-main' }, u.nome), h('div', { class: 'cell-sub' }, u.email))) },
            { label: 'Papel', render: u => badge(App.PAPEIS[u.papel], { admin: 'var(--bad)', gerente: 'var(--cyan)', supervisor: 'var(--blue-2)', corretor: 'var(--text-2)' }[u.papel], 'square') },
            { label: 'Equipe', render: u => u.team_nome || '—' }, { label: 'Supervisor', render: u => u.supervisor_nome || '—' }, { label: 'Gerente', render: u => u.gerente_nome || '—' },
            { label: 'Grade', render: u => u.papel === 'corretor' ? App.gradeBadge(u.grade_comissao) : '—' },
            { label: 'Recebe leads', render: u => u.papel === 'corretor' ? (u.recebe_leads ? (u.disponivel ? badge('Sim', 'var(--ok)') : badge('Pausado', 'var(--warn)')) : badge('Não', 'var(--muted)')) : '—' },
            { label: 'Status', render: u => badge(u.status, { ativo: 'var(--ok)', pendente: 'var(--warn)', inativo: 'var(--muted)' }[u.status], 'dot') },
          ], rows, { onRow: u => userForm(u, load) }));
      };
      box.append(h('div', { class: 'filters' },
        h('input', { type: 'search', class: 'search-f', placeholder: 'Nome ou e-mail…', oninput: debounce(e => { state.search = e.target.value; load(); }, 300) }),
        h('select', { onchange: e => { state.papel = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todos os papéis'), Object.entries(App.PAPEIS).map(([v, l]) => h('option', { value: v }, l))),
        h('select', { onchange: e => { state.status = e.target.value || null; load(); } }, h('option', { value: '' }, 'Todos os status'), ['pendente', 'ativo', 'inativo'].map(v => h('option', { value: v }, v))),
        h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => inviteForm(load) }, icon('plus', 16), 'Convidar usuário')), tb);
      await load();
      return box;
    },
    async equipes(reload) {
      const [teams, users] = await Promise.all([API.all('v_teams', { order: [['nome', true]] }), API.all('v_profiles', {})]);
      const form = t => Views._teamForm(t, users, reload);
      return h('div', { class: 'stack' }, h('div', { class: 'row' }, h('p', { class: 'muted grow', style: { margin: 0 } }, 'Hierarquia: Gerente → Supervisores → Corretores. Ao mudar um corretor de equipe, todos os registros dele passam automaticamente para a nova estrutura.'),
        h('button', { class: 'btn primary', onclick: () => form({ ativo: true }) }, icon('plus', 16), 'Nova equipe')),
        h('div', { class: 'grid g3' }, teams.map(t => App.card(h('span', { class: 'row', style: { gap: '10px' } }, App.teamLogo(t, 36), t.nome), h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'row' }, h('span', { class: 'muted', style: { width: '84px' } }, 'Gerente'), t.gerente_nome ? App.person(t.gerente_nome, 22) : '—'),
          h('div', { class: 'row' }, h('span', { class: 'muted', style: { width: '84px' } }, 'Supervisor'), t.supervisor_nome ? App.person(t.supervisor_nome, 22) : '—'),
          h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { class: 'muted', style: { width: '84px' } }, 'Corretores'),
            h('div', { class: 'stack', style: { gap: '6px' } }, users.filter(u => u.team_id === t.id && u.papel === 'corretor').map(u => App.person(u.nome, 22)).concat(t.corretores ? [] : [h('span', { class: 'dim' }, 'nenhum')])))),
          { sub: ativoBadge(t.ativo), right: h('button', { class: 'btn xs', onclick: () => form(t) }, 'Editar') }))));
    },
    async grades(reload) { return Views._gradesAdmin(reload); },
    async funil(reload) {
      const [stages, sts, impl] = [App.lk.stages, App.lk.statuses, App.lk.implStages];
      const GR = [['entrada', 'Entrada (novos leads)'], ['atendimento', 'Atendimento'], ['negociacao', 'Negociação'], ['proposta', 'Proposta / análise'], ['ganho', 'Ganho (venda)'], ['perdido', 'Perdido']].map(([value, label]) => ({ value, label }));
      const GRL = Object.fromEntries(GR.map(x => [x.value, x.label]));
      const SV = [['', 'Não altera a venda'], ['em_analise', 'Venda em análise'], ['pendencia', 'Venda com pendência'], ['aprovada', 'Venda aprovada'], ['implantada', 'Venda implantada'], ['cancelada', 'Venda cancelada']].map(([value, label]) => ({ value, label }));
      const lock = x => x.sistema ? h('span', { class: 'lock-tag', title: 'Usada pelas automações: pode renomear, mudar cor e ordem, mas não excluir' }, icon('lock', 12)) : null;
      const cod = t => ({ name: 'codigo', label: 'Código (sem espaços)', required: true, hint: 'Ex.: ' + t + ' — não pode ser alterado depois' });
      const acoes = (onEdit, onDel, sistema) => h('div', { class: 'row no-row', style: { gap: '4px', justifyContent: 'flex-end' } }, h('button', { class: 'icon-btn sm', 'aria-label': 'Editar', onclick: onEdit }, icon('edit', 14)),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Excluir', disabled: sistema || null, title: sistema ? 'Etapa/status do sistema' : 'Excluir', onclick: onDel }, icon('trash', 14)));
      const stForm = st => crud({ title: st ? 'Editar etapa do CRM' : 'Nova etapa do CRM', table: 'pipeline_stages', values: st, onDone: reload, subtitle: 'O grupo define como a etapa entra nos indicadores (funil, conversão, temperatura).', fields: [
        ...(st ? [] : [cod('visita_tecnica')]), { name: 'nome', label: 'Nome', required: true }, { name: 'ordem', label: 'Ordem no Kanban', type: 'number', required: true },
        { name: 'cor', label: 'Cor', type: 'color', required: true }, { name: 'grupo', label: 'Grupo', type: 'select', required: true, options: GR, disabled: st && st.sistema },
        ...(st ? [{ name: 'status_padrao', label: 'Status aplicado ao mover para a etapa', type: 'select', options: sts.filter(x => x.etapa === st.codigo).map(x => ({ value: x.codigo, label: x.nome })) }] : []),
        { name: 'ativo', label: 'Ativa', type: 'checkbox', checkLabel: 'Etapa ativa (aparece no Kanban)' }] });
      const sForm = x => crud({ title: x ? 'Editar status do lead' : 'Novo status do lead', table: 'lead_statuses', values: x, onDone: reload, fields: [
        ...(x ? [] : [cod('aguardando_documentos')]), { name: 'nome', label: 'Nome', required: true }, { name: 'etapa', label: 'Etapa do Kanban', type: 'select', required: true, options: App.opt.stages(), disabled: x && x.sistema },
        { name: 'ordem', label: 'Ordem', type: 'number', required: true }, { name: 'cor', label: 'Cor', type: 'color', required: true }, { name: 'exige_motivo', label: 'Motivo', type: 'checkbox', checkLabel: 'Exige motivo de perda', disabled: x && x.sistema },
        { name: 'ativo', label: 'Ativo', type: 'checkbox', checkLabel: 'Status ativo' }] });
      const iForm = x => crud({ title: x ? 'Editar etapa da implantação' : 'Nova etapa da implantação', table: 'implementation_stages', values: x ? { ...x, status_venda: x.status_venda || '' } : { ordem: impl.filter(i => i.status_venda !== 'cancelada').length + 1, cor: '#3B82F6', ativo: true, status_venda: '' }, onDone: reload,
        subtitle: 'Ao chegar nesta etapa, a venda pode mudar de status automaticamente.', fields: [
        ...(x ? [] : [cod('vistoria')]), { name: 'nome', label: 'Nome', required: true }, { name: 'ordem', label: 'Ordem', type: 'number', required: true }, { name: 'cor', label: 'Cor', type: 'color', required: true },
        { name: 'status_venda', label: 'Efeito na venda', type: 'select', options: SV, disabled: x && x.sistema }, { name: 'inicial', label: 'Inicial', type: 'checkbox', checkLabel: 'Etapa inicial de toda venda nova' },
        { name: 'ativo', label: 'Ativa', type: 'checkbox', checkLabel: 'Etapa ativa' }] });
      const destino = ({ titulo, texto, opcoes, rpc, codigo, obrig }) => {
        const f = U.form([{ name: 'destino', label: 'Transferir para', type: 'select', required: obrig, options: opcoes }], {}, { cols: 1 });
        const m = U.modal({ title: titulo, size: 'sm', body: h('div', { class: 'stack' }, h('p', { style: { margin: 0 } }, texto), f), footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'),
          h('button', { class: 'btn danger', onclick: async () => { if (obrig && !f.validate()) return; try { const n = await API.rpc(rpc, { p_codigo: codigo, p_destino: f.values().destino || null }); m.close(); toast(n ? `Excluído · ${n} registro(s) transferido(s)` : 'Excluído'); await App.loadLookups(); reload(); } catch (e) { App.err(e); } } }, 'Excluir')] });
      };
      const delStage = st => destino({ titulo: 'Excluir etapa "' + st.nome + '"', texto: 'Os leads e os status desta etapa vão para a etapa escolhida. O histórico de cada lead registra a mudança.', rpc: 'excluir_etapa_crm', codigo: st.codigo, obrig: true,
        opcoes: stages.filter(x => x.codigo !== st.codigo).map(x => ({ value: x.codigo, label: x.nome })) });
      const delStatus = x => destino({ titulo: 'Excluir status "' + x.nome + '"', texto: 'Leads com este status passam para o status escolhido.', rpc: 'excluir_status_lead', codigo: x.codigo, obrig: false,
        opcoes: sts.filter(y => y.codigo !== x.codigo && (!y.exige_motivo || x.exige_motivo)).map(y => ({ value: y.codigo, label: y.nome + ' · ' + ((App.lk.stagesMap[y.etapa] || {}).nome || '') })) });
      const delImpl = x => destino({ titulo: 'Excluir etapa "' + x.nome + '"', texto: 'As implantações desta etapa vão para a etapa escolhida.', rpc: 'excluir_etapa_implantacao', codigo: x.codigo, obrig: false,
        opcoes: impl.filter(y => y.codigo !== x.codigo).map(y => ({ value: y.codigo, label: y.nome })) });
      return h('div', { class: 'stack' },
        h('div', { class: 'bulkbar' }, icon('shield', 15), h('span', null, 'Etapas e status são editáveis e excluíveis. Ao excluir, você escolhe para onde vão os registros — nada fica órfão. Os marcados com cadeado são usados pelas automações (novo lead, venda aprovada, implantada, perdido) e só podem ser renomeados.')),
        h('div', { class: 'grid g-cfg' },
          App.card('Etapas do CRM (Kanban)', U.table([{ label: 'Ordem', key: 'ordem', align: 'right', width: '56px' }, { label: 'Etapa', render: x => h('span', { class: 'row', style: { gap: '6px' } }, App.stageBadge(x.codigo), lock(x)) },
            { label: 'Grupo', render: x => h('span', { class: 'muted' }, GRL[x.grupo] || x.grupo || '—') }, { label: 'Status padrão', render: x => (App.lk.statusMap[x.status_padrao] || {}).nome || '—' }, { label: '', render: x => ativoBadge(x.ativo) },
            { label: '', render: x => acoes(() => stForm(x), () => delStage(x), x.sistema) }], stages, { onRow: stForm, dense: true }),
            { right: h('button', { class: 'btn xs primary', onclick: () => stForm(null) }, icon('plus', 13), 'Etapa') }),
          App.card('Status do lead', U.table([{ label: 'Status', render: x => h('span', { class: 'row', style: { gap: '6px' } }, App.statusBadge(x.codigo), lock(x)) }, { label: 'Etapa', render: x => (App.lk.stagesMap[x.etapa] || {}).nome },
            { label: 'Motivo', render: x => x.exige_motivo ? 'Exige' : '—' }, { label: '', render: x => ativoBadge(x.ativo) }, { label: '', render: x => acoes(() => sForm(x), () => delStatus(x), x.sistema) }], sts, { onRow: sForm, dense: true }),
            { sub: 'Cada etapa tem um ou mais status', right: h('button', { class: 'btn xs primary', onclick: () => sForm({ ordem: sts.length + 1, cor: '#64748B', ativo: true }) }, icon('plus', 13), 'Status') })),
        App.card('Etapas da implantação', U.table([{ label: 'Ordem', key: 'ordem', align: 'right', width: '56px' }, { label: 'Etapa', render: x => h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'pill-stage', style: { '--c': x.cor } }, h('i'), x.nome), lock(x), x.inicial ? badge('inicial', 'var(--blue-2)') : null) },
          { label: 'Efeito na venda', render: x => h('span', { class: 'muted' }, (SV.find(y => y.value === (x.status_venda || '')) || {}).label) }, { label: '', render: x => ativoBadge(x.ativo) }, { label: '', render: x => acoes(() => iForm(x), () => delImpl(x), x.sistema) }], impl, { onRow: iForm, dense: true }),
          { sub: 'Colunas do quadro de implantação', right: h('button', { class: 'btn xs primary', onclick: () => iForm(null) }, icon('plus', 13), 'Etapa') }));
    },
    async origens(reload) {
      const sForm = s => crud({ title: 'Origem de lead', table: 'lead_sources', values: s, onDone: reload, fields: [{ name: 'nome', label: 'Nome', required: true, span: 2 }, { name: 'ativo', label: 'Ativa', type: 'checkbox', checkLabel: 'Origem ativa' }] });
      const cForm = c => crud({ title: 'Campanha', table: 'campaigns', values: c ? { id: c.id, nome: c.nome, source_id: c.source_id, inicio: c.inicio, fim: c.fim, investimento: c.investimento, ativo: c.ativo } : null, onDone: reload, fields: [
        { name: 'nome', label: 'Nome', required: true, span: 2 }, { name: 'source_id', label: 'Origem', type: 'select', options: App.opt.srcs() }, { name: 'investimento', label: 'Investimento (R$)', type: 'number', step: '0.01' },
        { name: 'inicio', label: 'Início', type: 'date' }, { name: 'fim', label: 'Fim', type: 'date' }, { name: 'ativo', label: 'Ativa', type: 'checkbox', checkLabel: 'Campanha ativa' }] });
      return h('div', { class: 'grid g2' },
        App.card('Origens', U.table([{ label: 'Origem', render: s => h('span', { class: 'cell-main' }, s.nome) }, { label: '', render: s => ativoBadge(s.ativo) }], App.lk.srcs, { onRow: sForm, dense: true }), { right: h('button', { class: 'btn xs primary', onclick: () => sForm({ ativo: true }) }, icon('plus', 13), 'Origem') }),
        App.card('Campanhas', U.table([{ label: 'Campanha', render: c => h('div', null, h('div', { class: 'cell-main' }, c.nome), h('div', { class: 'cell-sub' }, c.origem_nome || '')) }, { label: 'Período', render: c => [c.inicio, c.fim].filter(Boolean).map(fmt.date).join(' a ') || '—' },
          { label: 'Investimento', align: 'right', render: c => c.investimento ? fmt.money0(c.investimento) : '—' }, { label: '', render: c => ativoBadge(c.ativo) }], App.lk.camps, { onRow: cForm, dense: true }),
          { sub: 'Permite analisar Origem → Leads → Vendas → Receita', right: h('button', { class: 'btn xs primary', onclick: () => cForm({ ativo: true }) }, icon('plus', 13), 'Campanha') }));
    },
    async perdas(reload) {
      const f = r => crud({ title: 'Motivo de perda', table: 'loss_reasons', values: r, onDone: reload, fields: [{ name: 'nome', label: 'Motivo', required: true }, { name: 'ordem', label: 'Ordem', type: 'number' }, { name: 'ativo', label: 'Ativo', type: 'checkbox', checkLabel: 'Motivo ativo' }] });
      return App.card('Motivos de perda', U.table([{ label: 'Ordem', key: 'ordem', align: 'right', width: '70px' }, { label: 'Motivo', render: r => h('span', { class: 'cell-main' }, r.nome) }, { label: '', render: r => ativoBadge(r.ativo) }], App.lk.lrs, { onRow: f }),
        { sub: 'Obrigatório sempre que um lead é marcado como perdido', right: h('button', { class: 'btn xs primary', onclick: () => f({ ativo: true, ordem: App.lk.lrs.length + 1 }) }, icon('plus', 13), 'Motivo') });
    },
    async distribuicao(reload) {
      const rules = await API.all('v_distribution_rules', { order: [['prioridade', true]] });
      const cfg = App.lk.settings.distribuicao || {};
      const f = r => crud({ title: 'Regra de distribuição', table: 'distribution_rules', values: r ? { id: r.id, nome: r.nome, prioridade: r.prioridade, source_id: r.source_id, campaign_id: r.campaign_id, product_id: r.product_id, uf: r.uf, team_id: r.team_id, corretor_id: r.corretor_id, metodo: r.metodo, ativo: r.ativo } : null, onDone: reload, fields: [
        { name: 'nome', label: 'Nome da regra', required: true, span: 2 }, { name: 'prioridade', label: 'Prioridade (menor = primeiro)', type: 'number', required: true },
        { name: 'metodo', label: 'Método', type: 'select', required: true, options: [['rodizio', 'Rodízio'], ['disponibilidade', 'Somente disponíveis (rodízio)'], ['fixo', 'Corretor fixo']].map(([value, label]) => ({ value, label })) },
        { section: 'Quando o lead tiver…' },
        { name: 'source_id', label: 'Origem', type: 'select', options: App.opt.srcs(), empty: 'Qualquer' }, { name: 'campaign_id', label: 'Campanha', type: 'select', options: App.opt.camps(), empty: 'Qualquer' },
        { name: 'product_id', label: 'Produto', type: 'select', options: App.opt.prods(), empty: 'Qualquer' }, { name: 'uf', label: 'UF (região)', type: 'select', options: App.opt.ufs(), empty: 'Qualquer' },
        { section: '…enviar para' },
        { name: 'team_id', label: 'Equipe', type: 'select', options: App.opt.teams(), empty: 'Qualquer equipe' }, { name: 'corretor_id', label: 'Corretor (método fixo)', type: 'select', options: App.opt.corretores() },
        { name: 'ativo', label: 'Ativa', type: 'checkbox', checkLabel: 'Regra ativa' }] });
      return h('div', { class: 'stack' },
        App.card('Distribuição automática', h('div', { class: 'stack', style: { gap: '10px' } },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cfg.automatica_ao_criar || null, onchange: async e => { try { await API.update('settings', 'distribuicao', { valor: { ...cfg, automatica_ao_criar: e.target.checked } }, 'chave'); await App.loadLookups(); toast('Configuração salva'); } catch (er) { App.err(er); } } }),
            'Distribuir automaticamente todo lead criado sem corretor'),
          h('p', { class: 'muted', style: { margin: 0, fontSize: '12.5px' } }, 'A regra aplicada é a de menor prioridade que combina com o lead. Sem regra, o sistema faz rodízio entre os corretores ativos da equipe (preferindo quem atende a UF do lead e quem recebeu lead há mais tempo). Toda distribuição registra data, horário, usuário, corretor anterior, novo corretor e motivo.'))),
        App.card('Regras', U.table([{ label: 'Prior.', key: 'prioridade', align: 'right', width: '60px' }, { label: 'Regra', render: r => h('span', { class: 'cell-main' }, r.nome) },
          { label: 'Condição', render: r => [r.origem_nome, r.campanha_nome, r.produto_nome, r.uf].filter(Boolean).join(' · ') || 'Todos os leads' },
          { label: 'Destino', render: r => r.metodo === 'fixo' ? (r.corretor_nome || '—') : (r.equipe_nome || 'Rodízio geral') }, { label: 'Método', render: r => badge(r.metodo, 'var(--cyan)', 'square') }, { label: '', render: r => ativoBadge(r.ativo) }],
          rules, { onRow: f, emptyText: 'Nenhuma regra — vale o rodízio geral.' }), { right: h('button', { class: 'btn xs primary', onclick: () => f({ prioridade: 100, metodo: 'rodizio', ativo: true }) }, icon('plus', 13), 'Regra') }));
    },
    async permissoes(reload) {
      const [perms, rp] = await Promise.all([API.all('permissions', { order: [['modulo', true], ['codigo', true]] }), API.all('role_permissions', {})]);
      const has = (r, p) => rp.some(x => x.role === r && x.permission === p);
      const roles = ['gerente', 'supervisor', 'corretor'];
      return h('div', { class: 'stack' },
        h('div', { class: 'bulkbar' }, icon('shield', 15), 'A visibilidade de dados (quem vê quais leads, clientes e vendas) é garantida pela hierarquia no banco e não pode ser desligada aqui. Estas permissões controlam ações extras.'),
        App.card('Matriz de permissões', h('div', { class: 'table-wrap', style: { border: 0 } }, h('table', { class: 'tbl perm-matrix' },
          h('thead', null, h('tr', null, h('th', null, 'Permissão'), h('th', null, 'Administrador'), roles.map(r => h('th', null, App.PAPEIS[r])))),
          h('tbody', null, perms.map(p => h('tr', null, h('td', null, h('div', { class: 'cell-main' }, p.descricao), h('div', { class: 'cell-sub mono' }, p.codigo)), h('td', null, icon('check', 16, 'ok-t')),
            roles.map(r => h('td', null, h('input', { type: 'checkbox', 'aria-label': `${p.codigo} para ${r}`, checked: has(r, p.codigo) || null, onchange: async e => {
              try { if (e.target.checked) await API.insert('role_permissions', { role: r, permission: p.codigo }); else await API.removeWhere('role_permissions', { role: r, permission: p.codigo }); toast('Permissão atualizada'); }
              catch (er) { e.target.checked = !e.target.checked; App.err(er); } } }))))))))));
    },
    async parametros(reload) {
      const S = App.lk.settings;
      const f = U.form([
        { section: 'Empresa' }, { name: 'empresa_nome', label: 'Nome exibido', required: true }, { name: 'master', label: 'E-mail do administrador master', type: 'email', required: true },
        { section: 'SLA de atendimento' }, { name: 'sla1', label: 'Meta 1 (minutos)', type: 'number', min: 1, required: true }, { name: 'sla2', label: 'Meta 2 (minutos)', type: 'number', min: 1, required: true },
        { section: 'Leads parados' }, { name: 'h1', label: 'Alertar corretor após (horas)', type: 'number', min: 1, required: true }, { name: 'h2', label: 'Alertar supervisor após (horas)', type: 'number', min: 1, required: true },
        { name: 'h3', label: 'Permitir redistribuição após (horas)', type: 'number', min: 1, required: true }, { name: 'auto', label: 'Redistribuição', type: 'checkbox', checkLabel: 'Redistribuir automaticamente leads parados' },
        { section: 'Comissão padrão (sem regra específica)' }, { name: 'pe', label: '% corretora', type: 'number', step: '0.01', required: true }, { name: 'pc', label: '% corretor', type: 'number', step: '0.01', required: true },
        { name: 'ps', label: '% supervisor', type: 'number', step: '0.01', required: true }, { name: 'pp', label: 'Parcelas', type: 'number', min: 1, required: true },
        { section: 'Notificações automáticas' },
        { name: 'n_sup', label: 'Novo lead', type: 'checkbox', checkLabel: 'Avisar o supervisor quando entrar lead na equipe' }, { name: 'n_ger', label: 'Novo lead', type: 'checkbox', checkLabel: 'Avisar também o gerente' },
        { name: 'n_sla_c', label: 'SLA', type: 'checkbox', checkLabel: 'Avisar o corretor quando o SLA (meta 1) vencer' }, { name: 'n_sla_s', label: 'SLA', type: 'checkbox', checkLabel: 'Avisar o supervisor quando o SLA (meta 2) estourar' },
        { name: 'n_sla_f', label: 'Fila', type: 'checkbox', checkLabel: 'Avisar a gestão sobre lead parado na fila sem distribuição' },
        { section: 'Relacionamento com o cliente' },
        { name: 'r_aniv', label: 'Aniversário', type: 'checkbox', checkLabel: 'Lembrar o responsável do aniversário do cliente' }, { name: 'r_dep', label: 'Dependentes', type: 'checkbox', checkLabel: 'Incluir aniversário dos dependentes' },
        { name: 'r_antes', label: 'Avisar', type: 'select', options: [{ value: 0, label: 'No dia do aniversário' }, { value: 1, label: 'Um dia antes' }] },
        { name: 'r_hora', label: 'Horário do lembrete', type: 'select', options: [6, 7, 8, 9, 10, 12].map(x => ({ value: x, label: x + 'h' })) },
        { name: 'r_cont', label: 'Manter contato', type: 'checkbox', checkLabel: 'Lembrar de falar com clientes sem contato' }, { name: 'r_dias', label: 'Sem contato há (dias)', type: 'number', min: 7, required: true },
        { name: 'r_max', label: 'Lembretes de contato por corretor/dia', type: 'number', min: 1, max: 30, required: true },
        { section: 'Ranking' },
        { name: 'rk_vis', label: 'Quem vê o ranking completo', type: 'select', options: [{ value: 'empresa', label: 'Todos veem o ranking da empresa (somente totais de vendas)' }, { value: 'hierarquia', label: 'Cada um vê apenas a sua estrutura' }], span: 2 },
      ], { empresa_nome: (S.empresa || {}).nome, master: S.admin_master_email, sla1: (S.sla || {}).meta1_min, sla2: (S.sla || {}).meta2_min, h1: (S.leads_parados || {}).alerta_corretor_horas, h2: (S.leads_parados || {}).alerta_supervisor_horas,
        h3: (S.leads_parados || {}).redistribuir_horas, auto: (S.leads_parados || {}).redistribuir_auto, pe: (S.comissao_padrao || {}).pct_empresa, pc: (S.comissao_padrao || {}).pct_corretor, ps: (S.comissao_padrao || {}).pct_supervisor, pp: (S.comissao_padrao || {}).parcelas,
        n_sup: (S.notificacoes || {}).novo_lead_supervisor !== false, n_ger: !!(S.notificacoes || {}).novo_lead_gerente, n_sla_c: (S.notificacoes || {}).sla_corretor !== false, n_sla_s: (S.notificacoes || {}).sla_supervisor !== false, n_sla_f: (S.notificacoes || {}).sla_fila !== false,
        r_aniv: (S.relacionamento || {}).aniversario !== false, r_dep: (S.relacionamento || {}).dependentes !== false, r_antes: (S.relacionamento || {}).aniversario_dias_antes || 0, r_hora: (S.relacionamento || {}).hora ?? 8,
        r_cont: (S.relacionamento || {}).contato !== false, r_dias: (S.relacionamento || {}).contato_dias || 60, r_max: (S.relacionamento || {}).contato_max_dia || 5, rk_vis: (S.ranking || {}).visibilidade || 'empresa' }, { cols: 2 });
      return App.card('Parâmetros do sistema', h('div', { class: 'stack' }, f, h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn primary', onclick: async () => {
        if (!f.validate()) return; const v = f.values();
        const up = (k, valor) => API.update('settings', k, { valor }, 'chave');
        try {
          await up('empresa', { ...(S.empresa || {}), nome: v.empresa_nome }); await up('admin_master_email', v.master); await up('sla', { meta1_min: v.sla1, meta2_min: v.sla2 });
          await up('leads_parados', { alerta_corretor_horas: v.h1, alerta_supervisor_horas: v.h2, redistribuir_horas: v.h3, redistribuir_auto: !!v.auto });
          await up('comissao_padrao', { pct_empresa: v.pe, pct_corretor: v.pc, pct_supervisor: v.ps, parcelas: v.pp });
          const notif = { novo_lead_supervisor: !!v.n_sup, novo_lead_gerente: !!v.n_ger, sla_corretor: !!v.n_sla_c, sla_supervisor: !!v.n_sla_s, sla_fila: !!v.n_sla_f };
          if (S.notificacoes) await up('notificacoes', notif); else await API.insert('settings', { chave: 'notificacoes', valor: notif, descricao: 'Avisos automáticos' });
          const rel = { ...(S.relacionamento || {}), aniversario: !!v.r_aniv, dependentes: !!v.r_dep, aniversario_dias_antes: Number(v.r_antes) || 0, hora: Number(v.r_hora ?? 8), contato: !!v.r_cont, contato_dias: Math.max(7, Number(v.r_dias) || 60), contato_max_dia: Math.max(1, Number(v.r_max) || 5) };
          if (S.relacionamento) await up('relacionamento', rel); else await API.insert('settings', { chave: 'relacionamento', valor: rel, descricao: 'Lembretes de relacionamento' });
          if (S.ranking) await up('ranking', { visibilidade: v.rk_vis || 'empresa' }); else await API.insert('settings', { chave: 'ranking', valor: { visibilidade: v.rk_vis || 'empresa' }, descricao: 'Ranking' });
          await App.loadLookups(); toast('Parâmetros salvos');
        } catch (e) { App.err(e); } } }, 'Salvar parâmetros')),
        h('div', { class: 'row', style: { borderTop: '1px solid var(--line)', paddingTop: '12px', flexWrap: 'wrap' } }, h('div', { class: 'grow muted', style: { fontSize: '12.5px', minWidth: '240px' } }, 'No servidor, o SLA e os lembretes da agenda são verificados a cada minuto e os leads parados a cada 15 minutos (pg_cron). Você pode executar agora para testar.'),
          h('button', { class: 'btn', onclick: async () => { try { const r = await API.rpc('executar_lembretes_relacionamento', {}); toast(`Relacionamento: ${r.aniversarios} aniversário(s), ${r.dependentes} de dependentes, ${r.contato} lembrete(s) de contato`); App.refreshCounts(); } catch (e) { App.err(e); } } }, icon('star', 15), 'Lembretes de relacionamento agora'),
          h('button', { class: 'btn', onclick: async () => { try { const r = await API.rpc('processar_alertas_rapidos', {}); toast(`SLA: ${r.sla} lead(s) · lembretes de agenda: ${r.eventos} · follow-ups: ${r.followups}`); App.refreshCounts(); } catch (e) { App.err(e); } } }, icon('zap', 15), 'SLA e lembretes agora'),
          h('button', { class: 'btn', onclick: async () => { try { const r = await API.rpc('processar_alertas', {}); toast(`Alertas gerados: ${r.alertas_corretor} corretor, ${r.alertas_supervisor} supervisor, ${r.redistribuiveis} redistribuíveis, ${r.followups} follow-ups`); App.refreshCounts(); } catch (e) { App.err(e); } } }, icon('refresh', 15), 'Leads parados agora'))));
    },
    async integracoes() {
      const exemplo = JSON.stringify({ nome: 'Maria Souza', whatsapp: '11988887777', email: 'maria@email.com', num_vidas: 3, uf: 'SP', origem: 'Site', campanha: 'PME Outubro', mensagem: 'Quero cotação empresarial' }, null, 2);
      const item = (t, d, st) => h('div', { class: 'list-item' }, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, t), h('div', { class: 'li-sub', style: { whiteSpace: 'normal' } }, d)), badge(st, st === 'Pronto' ? 'var(--ok)' : 'var(--blue-2)'));
      return h('div', { class: 'grid g2' },
        App.card('Entrada de leads externos', h('div', { class: 'stack' },
          h('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, 'Formulários do site, landing pages, Meta Leads e Google Ads enviam para a Edge Function "receber-lead", que grava o evento em integration_events, cria o lead e aplica a distribuição automática.'),
          h('div', { class: 'field' }, h('label', null, 'Endpoint'), h('code', { class: 'mono', style: { padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: '7px', overflowWrap: 'anywhere' } }, (global.ATOS_CONFIG && global.ATOS_CONFIG.SUPABASE_URL ? global.ATOS_CONFIG.SUPABASE_URL : 'https://SEU-PROJETO.supabase.co') + '/functions/v1/receber-lead')),
          h('div', { class: 'field' }, h('label', null, 'Exemplo de payload (POST, JSON, header x-atos-token)'), h('pre', { class: 'mono', style: { margin: 0, padding: '10px', background: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: '7px', fontSize: '12px', overflowX: 'auto' } }, exemplo)))),
        App.card('Arquitetura preparada', h('div', { class: 'list' },
          item('WhatsApp', 'Botão "Abrir conversa" em leads e clientes. Tabela de atividades pronta para registrar mensagens da API oficial.', 'Pronto'),
          item('Webhooks / Meta Leads / Google Ads / Site', 'Função receber_lead_externo + Edge Function receber-lead.', 'Pronto'),
          item('E-mail e telefonia', 'Atividades do tipo e-mail/ligação com resultado e anotação — basta conectar o provedor.', 'Preparado'),
          item('Assinatura eletrônica', 'Documentos por lead/proposta/venda com storage privado.', 'Preparado'),
          item('APIs das operadoras', 'Implantação com protocolo e eventos por etapa.', 'Preparado'),
          item('Inteligência artificial', 'Função contexto_ia_lead entrega os fatos do lead (sem inventar dados) para resumo e sugestão de próxima ação.', 'Preparado'))));
    },
    async auditoria() {
      const state = { acao: null, tabela: null, page: 0 };
      const box = h('div'); const tb = h('div');
      const ACOES = ['login', 'criacao', 'edicao', 'exclusao', 'status', 'transferencia', 'transferencia_cliente', 'hierarquia', 'permissao', 'comissao_edicao', 'comissao_status'];
      const load = async () => {
        const o = { order: [['created_at', false]], limit: 50, offset: state.page * 50, count: true, eq: {} };
        if (state.acao) o.eq.acao = state.acao; if (state.tabela) o.eq.tabela = state.tabela;
        const { rows, count } = await API.list('v_audit_logs', o);
        const resumo = obj => obj ? Object.entries(obj).filter(([k]) => !['created_at', 'updated_at', 'created_by', 'updated_by', 'id'].includes(k)).slice(0, 4).map(([k, v]) => `${k}: ${v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '';
        clear(tb).append(U.table([
          { label: 'Data', render: a => h('span', { class: 'mono' }, fmt.datetime(a.created_at)) }, { label: 'Usuário', render: a => a.usuario_nome }, { label: 'Ação', render: a => badge(a.acao, a.acao.includes('exclusao') ? 'var(--bad)' : a.acao.includes('transfer') ? 'var(--cyan)' : 'var(--blue-2)', 'square') },
          { label: 'Registro', render: a => h('div', null, a.tabela || '—', a.registro_id ? h('div', { class: 'cell-sub mono' }, String(a.registro_id).slice(0, 8)) : null) },
          { label: 'Valor anterior', render: a => h('span', { class: 'cell-sub' }, resumo(a.anterior)) }, { label: 'Valor novo', render: a => h('span', { class: 'cell-sub' }, resumo(a.novo)) },
        ], rows, { dense: true, onRow: a => U.modal({ title: 'Registro de auditoria', size: 'lg', body: h('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', fontSize: '12px', margin: 0 } }, JSON.stringify(a, null, 2)) }) }),
          U.pager(state.page, 50, count, p => { state.page = p; load(); }));
      };
      box.append(h('div', { class: 'filters' },
        h('select', { onchange: e => { state.acao = e.target.value || null; state.page = 0; load(); } }, h('option', { value: '' }, 'Todas as ações'), ACOES.map(a => h('option', { value: a }, a))),
        h('select', { onchange: e => { state.tabela = e.target.value || null; state.page = 0; load(); } }, h('option', { value: '' }, 'Todas as tabelas'), ['leads', 'clients', 'sales', 'proposals', 'implementations', 'commissions', 'profiles', 'teams', 'goals', 'settings', 'role_permissions'].map(a => h('option', { value: a }, a)))), tb);
      await load();
      return box;
    },
  };

  // Equipe com logotipo (aparece no ranking) e cor
  Views._teamForm = function (t, users, onDone) {
    let logo = t ? t.logo || null : null;
    const prev = h('div', { class: 'logo-prev' });
    const pintar = () => clear(prev).append(App.teamLogo({ logo, cor: f.querySelector('#f_cor') ? f.querySelector('#f_cor').value : (t || {}).cor, nome: f.querySelector('#f_nome') ? f.querySelector('#f_nome').value || 'Equipe' : 'Equipe' }, 88));
    const f = U.form([
      { name: 'nome', label: 'Nome da equipe', required: true, span: 2 },
      { name: 'supervisor_id', label: 'Supervisor', type: 'select', required: true, options: users.filter(u => u.papel === 'supervisor').map(u => ({ value: u.id, label: u.nome + (u.gerente_nome ? ' · ' + u.gerente_nome : '') })) },
      { name: 'cor', label: 'Cor da equipe', type: 'color' },
      { name: 'ativo', label: 'Status', type: 'checkbox', checkLabel: 'Equipe ativa' }], t ? { ...t, cor: t.cor || '#2E6BFF' } : { ativo: true, cor: '#2E6BFF' }, { cols: 2 });
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', id: 'team_logo', onchange: async e => {
      try { logo = await U.imagemReduzida(e.target.files[0], 192); pintar(); } catch (er) { App.err(er); } } });
    f.addEventListener('input', pintar);
    const m = U.modal({ title: t ? 'Editar equipe' : 'Nova equipe', subtitle: 'O gerente da equipe é o gerente do supervisor escolhido. O logotipo aparece no ranking e nos painéis.', size: 'md',
      body: h('div', { class: 'stack' }, f, h('div', { class: 'form-section' }, 'Logotipo da equipe'),
        h('div', { class: 'row', style: { gap: '16px', alignItems: 'center', flexWrap: 'wrap' } }, prev,
          h('div', { class: 'stack', style: { gap: '8px' } }, h('label', { class: 'btn sm', for: 'team_logo', style: { cursor: 'pointer' } }, icon('upload', 14), logo ? 'Trocar imagem' : 'Enviar imagem'), file,
            h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { logo = null; file.value = ''; pintar(); } }, 'Remover logotipo'),
            h('span', { class: 'muted', style: { fontSize: '12px', maxWidth: '260px' } }, 'PNG, JPG, WEBP ou SVG. A imagem é reduzida automaticamente. Sem logotipo, usamos as iniciais na cor da equipe.')))),
      footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => {
        if (!f.validate()) return; const v = { ...f.values(), logo };
        try { if (t && t.id) await API.update('teams', t.id, v); else await API.insert('teams', v); m.close(); toast('Equipe salva'); await App.loadLookups(); onDone && onDone(); } catch (e) { App.err(e); } } }, 'Salvar')] });
    file.style.display = 'none';
    pintar();
  };

  function userForm(u, onDone) {
    const f = U.form([
      { name: 'nome', label: 'Nome', required: true }, { name: 'email', label: 'E-mail', disabled: true },
      { name: 'papel', label: 'Papel', type: 'select', required: true, options: Object.entries(App.PAPEIS).map(([value, label]) => ({ value, label })) },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['pendente', 'Pendente'], ['ativo', 'Ativo'], ['inativo', 'Inativo']].map(([value, label]) => ({ value, label })) },
      { name: 'team_id', label: 'Equipe (corretor)', type: 'select', options: App.opt.teams(), hint: 'Define supervisor e gerente automaticamente' },
      { name: 'gerente_id', label: 'Gerente (supervisor)', type: 'select', options: App.opt.gerentes() },
      { name: 'grade_comissao', label: 'Grade de comissão (corretor)', type: 'select', options: App.opt.grades(), hint: 'Define quanto o corretor recebe em cada produto' },
      { name: 'ufs', label: 'UFs atendidas', placeholder: 'SP, RJ', hint: 'Usado na distribuição por região' }, { name: 'telefone', label: 'Telefone', mask: 'phone' },
      { name: 'recebe_leads', label: 'Distribuição', type: 'checkbox', checkLabel: 'Participa da distribuição automática' }, { name: 'disponivel', label: 'Disponibilidade', type: 'checkbox', checkLabel: 'Disponível agora' },
    ], { ...u, ufs: (u.ufs || []).join(', '), telefone: u.telefone ? fmt.phone(u.telefone) : '' }, { cols: 2 });
    const m = U.modal({ title: 'Editar usuário', subtitle: u.status === 'pendente' ? 'Aprove o acesso definindo papel, equipe e status ativo' : u.email, size: 'md', body: f, footer: [
      h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: async () => {
        if (!f.validate()) return; const v = f.values();
        if (v.papel === 'corretor' && v.status === 'ativo' && !v.team_id) return toast('Corretor ativo precisa estar em uma equipe', 'err');
        if (v.papel === 'supervisor' && v.status === 'ativo' && !v.gerente_id) return toast('Supervisor precisa ter um gerente', 'err');
        if (u.id === App.me.id && v.papel !== 'admin' && !(await confirmDialog({ title: 'Remover seu acesso de administrador?', message: 'Você perderá acesso às configurações.', danger: true }))) return;
        const patch = { nome: v.nome, papel: v.papel, status: v.status, team_id: v.papel === 'corretor' ? v.team_id : null, gerente_id: v.papel === 'supervisor' ? v.gerente_id : null, grade_comissao: v.grade_comissao || u.grade_comissao || null,
          ufs: (v.ufs || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean), telefone: U.digits(v.telefone), recebe_leads: !!v.recebe_leads, disponivel: !!v.disponivel };
        try { await API.update('profiles', u.id, patch); m.close(); toast('Usuário atualizado'); await App.loadLookups(); onDone && onDone(); } catch (e) { App.err(e); } } }, 'Salvar')] });
  }
  function inviteForm(onDone) {
    const f = U.form([{ name: 'nome', label: 'Nome', required: true }, { name: 'email', label: 'E-mail', type: 'email', required: true },
      { name: 'papel', label: 'Papel', type: 'select', required: true, options: Object.entries(App.PAPEIS).map(([value, label]) => ({ value, label })) },
      { name: 'team_id', label: 'Equipe (corretor)', type: 'select', options: App.opt.teams() },
      { name: 'grade_comissao', label: 'Grade de comissão', type: 'select', options: App.opt.grades() }], { papel: 'corretor', grade_comissao: 'bronze' }, { cols: 2 });
    const m = U.modal({ title: 'Convidar usuário', size: 'md', body: h('div', { class: 'stack' }, f, h('p', { class: 'muted', style: { margin: 0, fontSize: '12.5px' } },
      'O convite é enviado pela Edge Function "convidar-usuario" (usa a chave de serviço no servidor, nunca no navegador). A pessoa recebe um e-mail para definir a senha. Alternativa: ela usa "Solicitar acesso" na tela de login e você aprova aqui.')),
      footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => {
        if (!f.validate()) return; const v = f.values();
        try {
          if (API.mode === 'demo') { await API.signUp(v.email, 'demo', v.nome, v.grade_comissao); toast('Na demonstração o convite cria um usuário pendente. Aprove-o na lista.'); }
          else { const { error } = await API.client.functions.invoke('convidar-usuario', { body: v }); if (error) throw error; toast('Convite enviado para ' + v.email); }
          m.close(); onDone && onDone();
        } catch (e) { App.err(e); } } }, 'Enviar convite')] });
  }
})(window);
