/* =====================================================================
   ATOS SISTEMA — forms.js
   Formulários e ações em modal usados por várias telas.
   Toda gravação passa pela API; as regras de permissão são validadas
   no servidor (RLS/triggers). A interface só orienta o usuário.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, toast, modal, form, dates, digits, confirmDialog, badge, empty } = global.U;
  const API = global.API;
  const App = global.App;

  const done = (m, msg, cb, arg) => { m && m.close(); if (msg) toast(msg); App.refreshCounts(); if (cb) cb(arg); else App.reload(); };
  const saving = (btn, on) => { if (btn) { btn.disabled = on; btn.dataset.l = btn.dataset.l || btn.textContent; btn.textContent = on ? 'Salvando…' : btn.dataset.l; } };
  const btnSave = (label, fn) => { const b = h('button', { class: 'btn primary', onclick: async () => { saving(b, true); try { await fn(); } catch (e) { App.err(e); } finally { saving(b, false); } } }, label); return b; };
  const cancel = () => h('button', { class: 'btn ghost', onclick: e => { const x = e.target.closest('.modal, .drawer'); if (x) x.querySelector('.modal-head .icon-btn, .drawer-head .icon-btn').click(); } }, 'Cancelar');

  // ------------------------------------------------------------------
  // Duplicidade (mostra sem vazar dados de outra carteira)
  // ------------------------------------------------------------------
  function dupBox() {
    const box = h('div', { class: 'span-all', hidden: true });
    box.check = async (cpf, tel, email, ignorar) => {
      if (!cpf && !(tel && digits(tel).length >= 8) && !email) { box.hidden = true; return; }
      try {
        const r = await API.rpc('verificar_duplicidade', { p_cpf: cpf || null, p_telefone: tel || null, p_email: email || null, p_ignorar: ignorar || null });
        clear(box);
        if (!r.length) { box.hidden = true; return; }
        box.hidden = false;
        box.appendChild(h('div', { class: 'bulkbar', style: { background: 'rgba(242,169,59,.1)', borderColor: 'rgba(242,169,59,.45)', color: '#F7C77A', flexDirection: 'column', alignItems: 'stretch', gap: '6px' } },
          h('div', { class: 'row' }, icon('alert', 16), 'Possível lead duplicado encontrado'),
          r.map(d => h('div', { class: 'row', style: { fontWeight: 600, color: 'var(--text-2)', fontSize: '12.5px' } },
            badge(d.tipo, d.tipo === 'lead' ? 'var(--blue-2)' : 'var(--ok)'),
            d.visivel ? h('a', { href: '#/' + (d.tipo === 'lead' ? 'leads/' : 'clientes/') + d.id, onclick: () => document.querySelectorAll('.layer').forEach(l => l.remove()) }, d.nome) : h('span', null, 'Registro protegido'),
            h('span', { class: 'muted' }, [d.status, d.responsavel].filter(Boolean).join(' · ')), h('span', { class: 'dim', style: { marginLeft: 'auto' } }, 'por ' + d.criterio)))));
      } catch (e) { box.hidden = true; }
    };
    return box;
  }

  // ------------------------------------------------------------------
  // LEAD (cadastro rápido e completo)
  // ------------------------------------------------------------------
  function lead(existing, { onSaved, full = !!existing } = {}) {
    const isEdit = !!existing;
    const v = existing ? { ...existing, whatsapp: fmt.phone(existing.whatsapp), telefone: existing.telefone ? fmt.phone(existing.telefone) : '', cpf: existing.cpf ? fmt.cpf(existing.cpf) : '', cnpj: existing.cnpj ? fmt.cnpj(existing.cnpj) : '' }
      : { num_vidas: 1, tipo_pessoa: 'PF', modalidade: 'individual', corretor_id: App.is('corretor') ? App.me.id : null };
    const corretorField = App.gestor() && !isEdit ? [{ name: 'corretor_id', label: 'Corretor responsável', type: 'select', options: App.opt.corretores(), empty: App.is('supervisor') ? 'Fila da equipe (distribuir depois)' : 'Sem corretor (distribuir depois)' }] : [];
    const quick = [
      { name: 'nome', label: 'Nome', required: true, span: 2 },
      { name: 'whatsapp', label: 'WhatsApp', mask: 'phone', inputmode: 'tel' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'num_vidas', label: 'Número de vidas', type: 'number', min: 1 },
      { name: 'source_id', label: 'Origem', type: 'select', options: App.opt.srcs() },
      ...corretorField,
      { name: 'observacao', label: 'Observação', type: 'textarea', span: 2, rows: 2 },
    ];
    const extra = [
      { section: 'Dados comerciais' },
      { name: 'tipo_pessoa', label: 'Pessoa', type: 'select', required: true, options: [{ value: 'PF', label: 'Pessoa física' }, { value: 'PJ', label: 'Pessoa jurídica' }] },
      { name: 'modalidade', label: 'Modalidade', type: 'select', required: true, options: App.opt.modalidades() },
      { name: 'empresa', label: 'Empresa (PJ)' }, { name: 'cnpj', label: 'CNPJ', mask: 'cnpj' },
      { name: 'faixa_etaria', label: 'Faixa etária', type: 'select', options: ['0-18', '19-23', '24-28', '29-33', '34-38', '39-43', '44-48', '49-53', '54-58', '59+'].map(x => ({ value: x, label: x })) },
      { name: 'campaign_id', label: 'Campanha', type: 'select', options: App.opt.camps() },
      { name: 'operator_id', label: 'Operadora de interesse', type: 'select', options: App.opt.ops() },
      { name: 'product_id', label: 'Plano de interesse', type: 'select', options: App.opt.prods() },
      { name: 'valor_pretendido', label: 'Valor pretendido (R$/mês)', type: 'number', step: '0.01' },
      { name: 'prioritario', label: 'Prioritário', type: 'checkbox', checkLabel: '⭐ Marcar como prioritário' },
      { section: 'Dados pessoais' },
      { name: 'cpf', label: 'CPF', mask: 'cpf' }, { name: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
      { name: 'telefone', label: 'Telefone', mask: 'phone' }, { name: 'cidade', label: 'Cidade' },
      { name: 'uf', label: 'UF', type: 'select', options: App.opt.ufs() },
    ];
    const fields = full ? [...quick, ...extra] : quick;
    const wrap = h('div');
    const dup = dupBox();
    let f;
    const paint = (fl) => {
      const cur = f ? f.values() : v;
      f = form(fl, { ...v, ...cur });
      clear(wrap).append(f);
      f.insertBefore(dup, f.firstChild);
      const chk = () => { const x = f.values(); dup.check(x.cpf, x.whatsapp || x.telefone, x.email, existing && existing.id); };
      ['whatsapp', 'email', 'cpf', 'telefone'].forEach(n => { const i = f.querySelector('#f_' + n); if (i) i.addEventListener('blur', chk); });
      const op = f.querySelector('#f_operator_id'), pr = f.querySelector('#f_product_id');
      if (op && pr) op.addEventListener('change', () => { const sel = pr.value; clear(pr).append(h('option', { value: '' }, '—'), ...App.opt.prods(op.value || null).map(o => h('option', { value: o.value, selected: o.value === sel || null }, o.label))); });
      if (isEdit) chk();
    };
    paint(fields);
    let expanded = full;
    const more = !full ? h('button', { class: 'btn ghost', onclick: () => { expanded = !expanded; paint(expanded ? [...quick, ...extra] : quick); more.textContent = expanded ? 'Menos campos' : 'Completar cadastro'; } }, 'Completar cadastro') : null;
    const m = modal({
      title: isEdit ? 'Editar lead' : 'Novo lead', subtitle: isEdit ? existing.nome : 'Cadastro rápido — complete depois na página do lead', size: 'lg', body: wrap,
      footer: [more, h('span', { class: 'grow' }), cancel(null), btnSave(isEdit ? 'Salvar alterações' : 'Criar lead', async () => {
        if (!f.validate()) return;
        const x = f.values();
        const row = { ...x, whatsapp: digits(x.whatsapp), telefone: digits(x.telefone), cpf: digits(x.cpf), cnpj: digits(x.cnpj), num_vidas: x.num_vidas || 1 };
        if (row.tipo_pessoa === undefined) delete row.tipo_pessoa;
        Object.keys(row).forEach(k => { if (row[k] === undefined) delete row[k]; });
        if (!isEdit && !row.whatsapp && !row.email && !row.telefone) return toast('Informe ao menos WhatsApp, telefone ou e-mail', 'err');
        let saved;
        if (isEdit) { delete row.corretor_id; saved = await API.update('leads', existing.id, row); }
        else saved = await API.insert('leads', row);
        m.close(); toast(isEdit ? 'Lead atualizado' : 'Lead criado');
        App.refreshCounts();
        if (onSaved) onSaved(saved); else if (!isEdit) App.go('/leads/' + saved.id); else App.reload();
      })],
    });
    return m;
  }

  // ------------------------------------------------------------------
  // Distribuição / transferência
  // ------------------------------------------------------------------
  function distribute(leads, { onDone } = {}) {
    const list = Array.isArray(leads) ? leads : [leads];
    const temResp = list.some(l => l.corretor_id);
    let modo = 'manual';
    const body = h('div', { class: 'stack' });
    const segs = h('div', { class: 'seg' });
    const opts = [['manual', 'Escolher corretor'], ['auto', 'Automático (regras + rodízio)'], ...(list.length > 1 ? [['lote', 'Rodízio entre selecionados']] : [])];
    let f;
    const paint = () => {
      clear(segs).append(...opts.map(([k, l]) => h('button', { class: modo === k ? 'on' : '', onclick: () => { modo = k; paint(); } }, l)));
      const fields = modo === 'manual' ? [{ name: 'corretor', label: 'Corretor', type: 'select', required: true, options: App.opt.corretores().filter(o => list.length > 1 || o.value !== list[0].corretor_id) }]
        : modo === 'lote' ? [] : [];
      if (temResp && modo !== 'auto') fields.push({ name: 'motivo', label: 'Motivo da transferência', type: 'textarea', required: true, rows: 2, placeholder: 'Ex.: férias do corretor, redistribuição por inatividade…' });
      f = form(fields, {}, { cols: 1 });
      const extra = modo === 'lote' ? h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'field' }, h('label', null, 'Corretores do rodízio')),
        h('div', { class: 'grid g2', style: { gap: '6px' } }, App.lk.corretores.map(c => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: c.id, class: 'rr', checked: true }), c.nome + (c.team_nome ? ' · ' + c.team_nome : ''))))) : null;
      const info = modo === 'auto' ? h('p', { class: 'muted', style: { margin: 0 } }, 'O sistema aplica as regras de distribuição (origem, campanha, produto, região) e escolhe o próximo corretor disponível no rodízio da equipe.') : null;
      clear(body).append(h('div', { class: 'muted' }, `${list.length} lead(s) selecionado(s)` + (temResp ? ' — já possuem responsável; a transferência fica registrada no histórico.' : '.')), segs, info, extra, f);
    };
    paint();
    const m = modal({ title: temResp ? 'Transferir leads' : 'Distribuir leads', size: 'md', body, footer: [cancel(null), btnSave('Confirmar', async () => {
      if (!f.validate()) return;
      const v = f.values();
      if (modo === 'manual') {
        if (list.length === 1) await API.rpc('distribuir_lead', { p_lead: list[0].id, p_corretor: v.corretor, p_motivo: v.motivo || null, p_metodo: 'manual' });
        else { const r = await API.rpc('distribuir_leads_lote', { p_leads: list.map(l => l.id), p_corretores: [v.corretor], p_motivo: v.motivo || null }); if (r.erros) toast(`${r.erros} lead(s) não puderam ser distribuídos`, 'err'); }
      } else if (modo === 'auto') {
        if (list.length === 1) { const r = await API.rpc('distribuir_automatico', { p_lead: list[0].id }); if (!r.ok) return toast(r.mensagem, 'err'); toast('Distribuído para ' + r.corretor_nome); }
        else { const r = await API.rpc('distribuir_leads_lote', { p_leads: list.map(l => l.id), p_corretores: null, p_motivo: null }); toast(`${r.distribuidos} distribuído(s)` + (r.erros ? `, ${r.erros} sem corretor disponível` : '')); }
      } else {
        const ids = [...body.querySelectorAll('.rr:checked')].map(i => i.value);
        if (!ids.length) return toast('Selecione ao menos um corretor', 'err');
        const r = await API.rpc('distribuir_leads_lote', { p_leads: list.map(l => l.id), p_corretores: ids, p_motivo: v.motivo || 'Distribuição em lote' });
        toast(`${r.distribuidos} distribuído(s)` + (r.erros ? `, ${r.erros} com erro` : ''));
      }
      done(m, modo === 'manual' ? 'Distribuição registrada' : null, onDone);
    })] });
  }

  function loss(leadRow, { status, onDone, etapa } = {}) {
    status = status || (etapa && (App.lk.stagesMap[etapa] || {}).status_padrao) || (App.lk.statusMap.perdido ? 'perdido' : null);
    const f = form([
      { name: 'status', label: 'Situação', type: 'select', required: true, options: App.lk.statuses.filter(s => s.exige_motivo && s.ativo).map(s => ({ value: s.codigo, label: s.nome })) },
      { name: 'motivo', label: 'Motivo da perda', type: 'select', required: true, options: App.opt.lrs() },
      { name: 'obs', label: 'Observação', type: 'textarea', rows: 2, span: 2 },
    ], { status }, { cols: 2 });
    const m = modal({ title: 'Marcar como perdido', subtitle: leadRow.nome, size: 'md', body: f, footer: [cancel(null), btnSave('Confirmar perda', async () => {
      if (!f.validate()) return; const v = f.values();
      await API.rpc('alterar_status_lead', { p_lead: leadRow.id, p_status: v.status, p_loss_reason: v.motivo, p_obs: v.obs });
      done(m, 'Lead marcado como perdido', onDone);
    })] });
  }

  // ------------------------------------------------------------------
  // Atividade (ligação, WhatsApp, e-mail...)
  // ------------------------------------------------------------------
  function activity(target, { tipo = 'ligacao', onDone } = {}) {
    const f = form([
      { name: 'tipo', label: 'Tipo de contato', type: 'select', required: true, options: [['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['reuniao', 'Reunião'], ['visita', 'Visita'], ['outro', 'Outro']].map(([value, label]) => ({ value, label })) },
      { name: 'efetivo', label: 'Resultado', type: 'select', required: true, options: [{ value: '1', label: 'Contato realizado' }, { value: '0', label: 'Sem sucesso (não atendeu / sem resposta)' }] },
      { name: 'resultado', label: 'Detalhe', type: 'select', options: ['respondeu', 'atendeu', 'agendou', 'pediu_retorno', 'nao_atendeu', 'caixa_postal', 'sem_resposta', 'numero_errado'].map(x => ({ value: x, label: x.replace(/_/g, ' ') })) },
      { name: 'descricao', label: 'Anotação', type: 'textarea', rows: 3, span: 2 },
    ], { tipo, efetivo: '1' }, { cols: 2 });
    const m = modal({ title: 'Registrar contato', subtitle: target.nome, size: 'md', body: f, footer: [cancel(null), btnSave('Registrar', async () => {
      if (!f.validate()) return; const v = f.values();
      await API.rpc('registrar_atividade', { p_lead: target.lead_id || null, p_client: target.client_id || null, p_tipo: v.tipo, p_efetivo: v.efetivo === '1', p_resultado: v.resultado, p_descricao: v.descricao });
      done(m, 'Contato registrado na timeline', onDone);
    })] });
  }

  // ------------------------------------------------------------------
  // Follow-up
  // ------------------------------------------------------------------
  const FU_TIPOS = [['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['reuniao', 'Reunião'], ['retorno', 'Retorno'], ['envio_proposta', 'Envio de proposta'], ['cobranca_documentos', 'Cobrança de documentos'], ['negociacao', 'Negociação']].map(([value, label]) => ({ value, label }));
  const PRIOS = [['baixa', 'Baixa'], ['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente']].map(([value, label]) => ({ value, label }));
  async function pickLeadField(target) {
    if (target && (target.lead_id || target.client_id || target.sale_id)) return null;
    const { rows } = await API.list('v_leads', { select: 'id,nome,etapa_tipo', neq: { etapa_tipo: 'perdido' }, order: [['updated_at', false]], limit: 300 });
    return { name: 'lead_id', label: 'Lead', type: 'select', options: rows.map(r => ({ value: r.id, label: r.nome })), empty: '— sem vínculo —' };
  }
  async function followup(target = {}, { existing, onDone } = {}) {
    const leadF = existing ? null : await pickLeadField(target);
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(10, 0, 0, 0);
    const respOpts = App.gestor() ? [{ name: 'responsavel_id', label: 'Responsável', type: 'select', options: [{ value: App.me.id, label: App.me.nome + ' (eu)' }, ...App.opt.corretores()] }] : [];
    const f = form([
      ...(leadF ? [{ ...leadF, span: 2 }] : []),
      { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: FU_TIPOS },
      { name: 'agendado_para', label: 'Data e hora', type: 'datetime-local', required: true },
      { name: 'prioridade', label: 'Prioridade', type: 'select', required: true, options: PRIOS },
      { name: 'lembrete_min', label: 'Lembrete', type: 'select', options: [[0, 'Sem lembrete'], [5, '5 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']].map(([value, label]) => ({ value, label })) },
      ...respOpts,
      { name: 'observacao', label: 'Observação', type: 'textarea', rows: 2, span: 2 },
    ], existing ? existing : { tipo: 'ligacao', prioridade: 'normal', lembrete_min: 15, agendado_para: amanha.toISOString(), responsavel_id: target.responsavel_id || App.me.id }, { cols: 2 });
    const m = modal({ title: existing ? 'Editar follow-up' : 'Agendar follow-up', subtitle: target.nome || existing?.nome_contato, size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values();
      const row = { tipo: v.tipo, agendado_para: v.agendado_para, prioridade: v.prioridade, lembrete_min: v.lembrete_min == null ? null : Number(v.lembrete_min), observacao: v.observacao, responsavel_id: v.responsavel_id || target.responsavel_id || App.me.id };
      if (existing) await API.update('followups', existing.id, row);
      else await API.insert('followups', { ...row, lead_id: v.lead_id || target.lead_id || null, client_id: target.client_id || null, sale_id: target.sale_id || null });
      done(m, existing ? 'Follow-up atualizado' : 'Follow-up agendado', onDone);
    })] });
  }
  function concluirFollowup(fu, { onDone } = {}) {
    const f = form([
      { name: 'resultado', label: 'Resultado do contato', type: 'textarea', rows: 2, span: 2, required: true },
      { name: 'registrar', label: 'Registrar na timeline', type: 'checkbox', checkLabel: 'Registrar também como contato realizado', span: 2 },
      { section: 'Próximo passo (opcional)' },
      { name: 'proximo', label: 'Próximo follow-up', type: 'datetime-local' },
      { name: 'tipo', label: 'Tipo', type: 'select', options: FU_TIPOS },
    ], { registrar: true, tipo: fu.tipo }, { cols: 2 });
    const m = modal({ title: 'Concluir follow-up', subtitle: fu.nome_contato, size: 'md', body: f, footer: [cancel(null), btnSave('Concluir', async () => {
      if (!f.validate()) return; const v = f.values();
      if (v.registrar && (fu.lead_id || fu.client_id)) {
        const t = { ligacao: 'ligacao', whatsapp: 'whatsapp', email: 'email', reuniao: 'reuniao' }[fu.tipo] || 'outro';
        await API.rpc('registrar_atividade', { p_lead: fu.lead_id || null, p_client: fu.client_id || null, p_tipo: t, p_efetivo: true, p_resultado: 'followup', p_descricao: v.resultado });
      }
      await API.rpc('concluir_followup', { p_id: fu.id, p_resultado: v.resultado, p_proximo: v.proximo, p_tipo_proximo: v.tipo, p_obs_proximo: null });
      done(m, v.proximo ? 'Concluído e próximo follow-up agendado' : 'Follow-up concluído', onDone);
    })] });
  }

  // ------------------------------------------------------------------
  // Tarefas e agenda
  // ------------------------------------------------------------------
  async function task(target = {}, { existing, onDone } = {}) {
    const leadF = existing ? null : await pickLeadField(target);
    const pz = new Date(); pz.setDate(pz.getDate() + 1); pz.setHours(18, 0, 0, 0);
    const respOptions = App.gestor() ? [{ value: App.me.id, label: App.me.nome + ' (eu)' }, ...App.opt.corretores(), ...(App.is('admin', 'gerente') ? App.opt.supervisores() : [])] : [{ value: App.me.id, label: App.me.nome }];
    const f = form([
      { name: 'titulo', label: 'Título', required: true, span: 2 },
      ...(leadF ? [{ ...leadF, span: 2 }] : []),
      { name: 'responsavel_id', label: 'Responsável', type: 'select', required: true, options: respOptions },
      { name: 'prioridade', label: 'Prioridade', type: 'select', required: true, options: PRIOS },
      { name: 'prazo', label: 'Prazo', type: 'datetime-local' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['aberta', 'Aberta'], ['em_andamento', 'Em andamento'], ['concluida', 'Concluída'], ['cancelada', 'Cancelada']].map(([value, label]) => ({ value, label })) },
      { name: 'descricao', label: 'Descrição', type: 'textarea', rows: 3, span: 2 },
    ], existing || { prioridade: 'normal', status: 'aberta', prazo: pz.toISOString(), responsavel_id: target.responsavel_id || App.me.id }, { cols: 2 });
    const m = modal({ title: existing ? 'Editar tarefa' : 'Nova tarefa', subtitle: target.nome, size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values();
      const row = { titulo: v.titulo, descricao: v.descricao, responsavel_id: v.responsavel_id, prioridade: v.prioridade, prazo: v.prazo, status: v.status };
      if (existing) await API.update('tasks', existing.id, row);
      else await API.insert('tasks', { ...row, lead_id: v.lead_id || target.lead_id || null, client_id: target.client_id || null, sale_id: target.sale_id || null });
      done(m, existing ? 'Tarefa atualizada' : 'Tarefa criada', onDone);
    })] });
  }
  // ------------------------------------------------------------------
  // Agenda: compromissos, reuniões e treinamentos com convites
  // ------------------------------------------------------------------
  const EV_TIPOS = [['reuniao', 'Reunião'], ['treinamento', 'Treinamento'], ['ligacao', 'Ligação'], ['retorno', 'Retorno'], ['compromisso', 'Compromisso'], ['visita', 'Visita'], ['vencimento', 'Vencimento'], ['outro', 'Outro']].map(([value, label]) => ({ value, label }));
  const EV_LABEL = Object.fromEntries(EV_TIPOS.map(x => [x.value, x.label]));
  const LEMBRETES = [[0, 'Sem lembrete'], [5, '5 minutos antes'], [10, '10 minutos antes'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes']].map(([value, label]) => ({ value, label }));
  const RESP = { aceito: ['Confirmado', 'var(--ok)'], recusado: ['Recusou', 'var(--bad)'], talvez: ['Talvez', 'var(--warn)'], pendente: ['Aguardando', 'var(--muted)'] };
  const convidaveis = () => App.lk.users.filter(u => u.status === 'ativo' && u.id !== App.me.id);

  /** seletor de pessoas com busca e atalhos (minha equipe, supervisores, todos) */
  function peoplePicker(selected = new Set(), { locked = new Set() } = {}) {
    const box = h('div', { class: 'pp' });
    const list = h('div', { class: 'pp-list' });
    const count = h('span', { class: 'muted' });
    let term = '';
    const users = convidaveis().sort((a, b) => a.nome.localeCompare(b.nome));
    const paint = () => {
      clear(list);
      const t = term.toLowerCase();
      users.filter(u => !t || (u.nome + ' ' + (u.team_nome || '') + ' ' + (u.email || '')).toLowerCase().includes(t)).forEach(u => list.appendChild(
        h('label', { class: 'pp-item' + (selected.has(u.id) ? ' on' : '') }, h('input', { type: 'checkbox', checked: selected.has(u.id) || null, disabled: locked.has(u.id) || null, onchange: e => { e.target.checked ? selected.add(u.id) : selected.delete(u.id); paint(); } }),
          U.avatar(u.nome, 24), h('span', { class: 'grow' }, h('b', null, u.nome), h('small', null, [App.PAPEIS[u.papel], u.team_nome].filter(Boolean).join(' · '))))));
      count.textContent = selected.size ? selected.size + ' convidado(s)' : 'Ninguém convidado';
    };
    const add = ids => { ids.forEach(i => selected.add(i)); paint(); };
    const atalhos = [];
    if (App.is('supervisor')) atalhos.push(['Minha equipe', () => add(users.filter(u => u.supervisor_id === App.me.id).map(u => u.id))]);
    if (App.is('gerente', 'admin')) atalhos.push(['Supervisores', () => add(users.filter(u => u.papel === 'supervisor').map(u => u.id))], ['Corretores', () => add(users.filter(u => u.papel === 'corretor').map(u => u.id))]);
    if (App.is('admin')) atalhos.push(['Gerentes', () => add(users.filter(u => u.papel === 'gerente').map(u => u.id))]);
    box.append(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, h('input', { type: 'search', class: 'search-f', placeholder: 'Buscar pessoa ou equipe…', style: { flex: '1 1 180px' }, oninput: e => { term = e.target.value; paint(); } }),
      atalhos.map(([l, fn]) => h('button', { type: 'button', class: 'btn xs', onclick: fn }, icon('plus', 12), l)),
      h('button', { type: 'button', class: 'btn xs ghost', onclick: () => { [...selected].filter(i => !locked.has(i)).forEach(i => selected.delete(i)); paint(); } }, 'Limpar')), list, count);
    box.selected = selected;
    paint();
    return box;
  }

  async function event(target = {}, { existing, date, onDone, tipo } = {}) {
    const leadF = existing ? null : await pickLeadField(target);
    const ini = date ? new Date(date + 'T10:00:00') : (() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d; })();
    const atuais = existing ? await API.all('event_participants', { eq: { event_id: existing.id } }) : [];
    const sel = new Set(atuais.map(p => p.usuario_id));
    const f = form([
      { name: 'titulo', label: 'Título', required: true, span: 2 },
      { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: EV_TIPOS },
      { name: 'lembrete_min', label: 'Lembrete', type: 'select', options: LEMBRETES, hint: 'Notifica você e os convidados' },
      { name: 'inicio', label: 'Início', type: 'datetime-local', required: true },
      { name: 'fim', label: 'Fim', type: 'datetime-local' },
      { name: 'local', label: 'Local' },
      { name: 'link_reuniao', label: 'Link da reunião', placeholder: 'https://meet.google.com/…' },
      ...(leadF ? [{ ...leadF, span: 2 }] : []),
      ...(App.gestor() ? [{ name: 'responsavel_id', label: 'Responsável', type: 'select', options: [{ value: App.me.id, label: App.me.nome + ' (eu)' }, ...App.opt.corretores()] }] : []),
      { name: 'descricao', label: 'Pauta / descrição', type: 'textarea', rows: 2, span: 2 },
      { name: 'convidados_externos', label: 'Convidados externos (e-mails, opcional)', span: 2, placeholder: 'cliente@empresa.com.br, parceiro@email.com', hint: 'Não recebem notificação no sistema — use "Compartilhar" para enviar o convite' },
    ], existing ? { ...existing, lembrete_min: existing.lembrete_min ?? 30 } : { tipo: tipo || 'reuniao', lembrete_min: 30, inicio: ini.toISOString(), fim: new Date(ini.getTime() + 3600e3).toISOString(), responsavel_id: App.me.id }, { cols: 2 });
    const picker = peoplePicker(sel);
    const body = h('div', { class: 'stack' }, f, h('div', { class: 'form-section' }, 'Convidar pessoas do sistema'), picker);
    const m = modal({ title: existing ? 'Editar compromisso' : 'Novo compromisso', subtitle: 'Reuniões e treinamentos com convite, confirmação de presença e lembrete', size: 'lg', body, footer: [
      existing ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Cancelar compromisso', message: 'Os convidados serão avisados do cancelamento.', confirm: 'Cancelar compromisso', danger: true })) { try { await API.softDelete('events', existing.id); done(m, 'Compromisso cancelado', onDone); } catch (e) { App.err(e); } } } }, 'Excluir') : null,
      h('span', { class: 'grow' }), cancel(null), btnSave('Salvar', async () => {
        if (!f.validate()) return; const v = f.values();
        if (v.fim && v.inicio && v.fim < v.inicio) return toast('O fim precisa ser depois do início', 'err');
        const row = { titulo: v.titulo, tipo: v.tipo, local: v.local, link_reuniao: v.link_reuniao, lembrete_min: Number(v.lembrete_min || 0), convidados_externos: v.convidados_externos, inicio: v.inicio, fim: v.fim, descricao: v.descricao, responsavel_id: v.responsavel_id || App.me.id };
        let ev;
        if (existing) ev = await API.update('events', existing.id, row); else ev = await API.insert('events', { ...row, lead_id: v.lead_id || target.lead_id || null, client_id: target.client_id || null });
        const novos = [...sel].filter(id => !atuais.some(p => p.usuario_id === id));
        const sairam = atuais.filter(p => !sel.has(p.usuario_id));
        if (novos.length) await API.rpc('convidar_evento', { p_evento: ev.id, p_usuarios: novos });
        for (const p of sairam) await API.rpc('remover_convidado', { p_evento: ev.id, p_usuario: p.usuario_id });
        done(m, novos.length ? `Compromisso salvo · ${novos.length} convite(s) enviado(s)` : 'Compromisso salvo', onDone);
      })] });
  }

  // Convite para compartilhar fora do sistema (WhatsApp, e-mail, calendário)
  const pad2 = n => String(n).padStart(2, '0');
  const icsDate = iso => { const d = new Date(iso); return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`; };
  function conviteTexto(e) {
    const quando = new Date(e.inicio).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
    return [`📅 ${EV_LABEL[e.tipo] || 'Compromisso'}: ${e.titulo}`, `🕒 ${quando}${e.fim ? ' às ' + fmt.time(e.fim) : ''}`, e.local ? `📍 ${e.local}` : null, e.link_reuniao ? `🔗 ${e.link_reuniao}` : null,
      e.descricao ? `\n${e.descricao}` : null, `\nOrganizador: ${e.organizador_nome || e.responsavel_nome || App.me.nome}`].filter(Boolean).join('\n');
  }
  function icsFile(e) {
    const esc = t => String(t || '').replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const fim = e.fim || new Date(new Date(e.inicio).getTime() + 3600e3).toISOString();
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atos Sistema//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST', 'BEGIN:VEVENT', `UID:${e.id}@atos`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(e.inicio)}`, `DTEND:${icsDate(fim)}`, `SUMMARY:${esc(e.titulo)}`, `LOCATION:${esc(e.link_reuniao || e.local)}`, `DESCRIPTION:${esc(conviteTexto(e))}`,
      ...(e.lembrete_min > 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', `TRIGGER:-PT${e.lembrete_min}M`, 'END:VALARM'] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function gcalLink(e) {
    const fim = e.fim || new Date(new Date(e.inicio).getTime() + 3600e3).toISOString();
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.titulo) + '&dates=' + icsDate(e.inicio) + '/' + icsDate(fim)
      + '&details=' + encodeURIComponent(conviteTexto(e)) + '&location=' + encodeURIComponent(e.link_reuniao || e.local || '');
  }
  function shareEvent(e, anchor) {
    const txt = conviteTexto(e);
    U.menu(anchor, [
      { label: 'Copiar convite', icon: 'note', onClick: async () => { try { await navigator.clipboard.writeText(txt); toast('Convite copiado'); } catch (er) { U.modal({ title: 'Convite', size: 'md', body: h('pre', { class: 'mono', style: { whiteSpace: 'pre-wrap', margin: 0 } }, txt) }); } } },
      { label: 'Enviar por WhatsApp', icon: 'whatsapp', onClick: () => window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener') },
      { label: 'Enviar por e-mail', icon: 'mail', onClick: () => { location.href = 'mailto:' + encodeURIComponent(e.convidados_externos || '') + '?subject=' + encodeURIComponent('Convite: ' + e.titulo) + '&body=' + encodeURIComponent(txt); } },
      { label: 'Adicionar ao Google Agenda', icon: 'calendar', onClick: () => window.open(gcalLink(e), '_blank', 'noopener') },
      { label: 'Baixar arquivo .ics (Outlook, Apple)', icon: 'download', onClick: () => { if (global.ATOS_PREVIEW) return toast('Na prévia o download fica bloqueado; na versão publicada o arquivo é baixado.', 'info'); U.download((e.titulo || 'convite').replace(/[^\w-]+/g, '-') + '.ics', icsFile(e), 'text/calendar;charset=utf-8'); } },
    ]);
  }

  /** detalhe do compromisso: convidados, confirmação e compartilhamento */
  async function eventDetail(id, { onDone } = {}) {
    const e = await API.get('v_events', id);
    if (!e) return toast('Compromisso não encontrado ou sem acesso', 'err');
    const parts = await API.all('v_event_participants', { eq: { event_id: id } });
    const podeEditar = App.is('admin') || e.created_by === App.me.id || e.responsavel_id === App.me.id || (App.is('gerente', 'supervisor') && (e.supervisor_id === App.me.id || e.gerente_id === App.me.id));
    const resp = async r => { try { await API.rpc('responder_convite', { p_evento: id, p_resposta: r }); d.close(); toast(r === 'aceito' ? 'Presença confirmada' : r === 'recusado' ? 'Convite recusado' : 'Resposta registrada'); onDone ? onDone() : App.reload(); } catch (er) { App.err(er); } };
    const row = (ic, label, val) => val ? h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '10px' } }, icon(ic, 16, 'muted'), h('div', null, h('div', { class: 'cell-sub' }, label), h('div', null, val))) : null;
    const quando = new Date(e.inicio).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + (e.fim ? ' – ' + fmt.time(e.fim) : '');
    const cont = { aceito: 0, talvez: 0, recusado: 0, pendente: 0 }; parts.forEach(p => cont[p.resposta]++);
    const body = h('div', { class: 'stack' },
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, badge(EV_LABEL[e.tipo] || e.tipo, e.tipo === 'treinamento' ? 'var(--cyan)' : 'var(--blue-2)', 'square'),
        e.lembrete_min > 0 ? badge('Lembrete ' + (LEMBRETES.find(l => l.value === e.lembrete_min) || { label: e.lembrete_min + ' min antes' }).label.toLowerCase(), 'var(--muted)') : badge('Sem lembrete', 'var(--muted)'),
        new Date(e.inicio) < new Date() ? badge('Encerrado', 'var(--muted)', 'dot') : null),
      row('clock', 'Quando', quando), row('pin', 'Local', e.local),
      e.link_reuniao ? row('external', 'Link da reunião', h('a', { href: e.link_reuniao, target: '_blank', rel: 'noopener' }, e.link_reuniao)) : null,
      row('user', 'Organizador', e.organizador_nome || e.responsavel_nome), row('leads', 'Vínculo', e.nome_contato ? h('a', { href: e.lead_id ? '#/leads/' + e.lead_id : '#/clientes/' + e.client_id }, e.nome_contato) : null),
      e.descricao ? h('div', { class: 'card', style: { padding: '10px 12px', whiteSpace: 'pre-wrap' } }, e.descricao) : null,
      e.minha_resposta ? h('div', { class: 'invite-box' }, h('div', { class: 'grow' }, h('b', null, 'Você foi convidado'), h('div', { class: 'cell-sub' }, 'Sua resposta: ' + RESP[e.minha_resposta][0])),
        h('button', { class: 'btn sm' + (e.minha_resposta === 'aceito' ? ' primary' : ''), onclick: () => resp('aceito') }, icon('check', 14), 'Vou'),
        h('button', { class: 'btn sm' + (e.minha_resposta === 'talvez' ? ' primary' : ''), onclick: () => resp('talvez') }, 'Talvez'),
        h('button', { class: 'btn sm' + (e.minha_resposta === 'recusado' ? ' danger' : ''), onclick: () => resp('recusado') }, 'Não vou')) : null,
      h('div', { class: 'section-title', style: { margin: '6px 0 0' } }, `Convidados (${parts.length})`, parts.length ? h('span', { class: 'muted', style: { fontWeight: 500, marginLeft: '8px', fontSize: '12px' } }, `${cont.aceito} confirmados · ${cont.talvez} talvez · ${cont.recusado} recusaram · ${cont.pendente} aguardando`) : null),
      parts.length ? h('div', { class: 'list' }, parts.sort((a, b) => a.usuario_nome.localeCompare(b.usuario_nome)).map(p => h('div', { class: 'list-item' }, U.avatar(p.usuario_nome, 28),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, p.usuario_nome), h('div', { class: 'li-sub' }, [App.PAPEIS[p.usuario_papel], p.usuario_equipe].filter(Boolean).join(' · '))),
        badge(RESP[p.resposta][0], RESP[p.resposta][1], 'dot')))) : h('p', { class: 'muted', style: { margin: 0 } }, 'Nenhum convidado do sistema.'),
      e.convidados_externos ? row('mail', 'Convidados externos', e.convidados_externos) : null);
    const shareBtn = h('button', { class: 'btn', onclick: ev => shareEvent(e, ev.currentTarget) }, icon('external', 15), 'Compartilhar convite');
    const d = U.drawer({ title: e.titulo, subtitle: 'Agenda', size: 'md', body, footer: [shareBtn, h('span', { class: 'grow' }),
      e.link_reuniao ? h('a', { class: 'btn', href: e.link_reuniao, target: '_blank', rel: 'noopener' }, 'Entrar na reunião') : null,
      podeEditar ? h('button', { class: 'btn primary', onclick: () => { d.close(); event({}, { existing: e, onDone }); } }, icon('edit', 15), 'Editar e convidar') : null] });
  }

  // ------------------------------------------------------------------
  // Cotação e proposta
  // ------------------------------------------------------------------
  function opProd(f) {
    const op = f.querySelector('#f_operator_id'), pr = f.querySelector('#f_product_id');
    if (op && pr) op.addEventListener('change', () => { clear(pr).append(h('option', { value: '' }, '—'), ...App.opt.prods(op.value || null).map(o => h('option', { value: o.value }, o.label))); });
  }
  function quote(leadRow, { existing, onDone } = {}) {
    const f = form([
      { name: 'operator_id', label: 'Operadora', type: 'select', required: true, options: App.opt.ops() },
      { name: 'product_id', label: 'Produto', type: 'select', options: App.opt.prods(existing ? existing.operator_id : leadRow.operator_id) },
      { name: 'num_vidas', label: 'Vidas', type: 'number', min: 1 },
      { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number', step: '0.01', required: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['elaboracao', 'Em elaboração'], ['enviada', 'Enviada ao cliente'], ['aceita', 'Aceita'], ['recusada', 'Recusada']].map(([value, label]) => ({ value, label })) },
      { name: 'observacao', label: 'Observação', type: 'textarea', rows: 2, span: 2 },
    ], existing || { operator_id: leadRow.operator_id, product_id: leadRow.product_id, num_vidas: leadRow.num_vidas, valor_mensal: leadRow.valor_pretendido, status: 'enviada' }, { cols: 2 });
    opProd(f);
    const m = modal({ title: existing ? 'Editar cotação' : 'Nova cotação', subtitle: leadRow.nome, size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values();
      if (existing) await API.update('quotes', existing.id, v); else await API.insert('quotes', { ...v, lead_id: leadRow.id });
      done(m, 'Cotação salva', onDone);
    })] });
  }
  function proposal(leadRow, { existing, onDone } = {}) {
    const f = form([
      { name: 'numero', label: 'Número da proposta' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['rascunho', 'Rascunho'], ['enviada', 'Enviada'], ['em_analise', 'Em análise'], ['pendencia', 'Pendência'], ['aprovada', 'Aprovada'], ['recusada', 'Recusada'], ['cancelada', 'Cancelada']].map(([value, label]) => ({ value, label })) },
      { name: 'operator_id', label: 'Operadora', type: 'select', required: true, options: App.opt.ops() },
      { name: 'product_id', label: 'Produto', type: 'select', options: App.opt.prods(existing ? existing.operator_id : leadRow.operator_id) },
      { name: 'num_vidas', label: 'Vidas', type: 'number', min: 1 },
      { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number', step: '0.01', required: true },
      { name: 'observacao', label: 'Observação', type: 'textarea', rows: 2, span: 2 },
    ], existing || { operator_id: leadRow.operator_id, product_id: leadRow.product_id, num_vidas: leadRow.num_vidas, valor_mensal: leadRow.valor_cotacao || leadRow.valor_pretendido, status: 'enviada' }, { cols: 2 });
    opProd(f);
    const m = modal({ title: existing ? 'Atualizar proposta' : 'Registrar proposta', subtitle: leadRow.nome || existing?.nome_contato, size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values();
      if (existing) await API.update('proposals', existing.id, v); else await API.insert('proposals', { ...v, lead_id: leadRow.id });
      done(m, 'Proposta salva', onDone);
    })] });
  }

  // ------------------------------------------------------------------
  // Conversão lead → cliente + venda
  // ------------------------------------------------------------------
  function depRows(container, initial = []) {
    const rows = [];
    const add = (d = {}) => {
      const r = h('div', { class: 'form cols-3', style: { gridTemplateColumns: '1.4fr 1fr 1fr 1fr auto', alignItems: 'end', marginBottom: '8px' } },
        U.field({ name: 'dn_' + rows.length, label: 'Nome' }, d.nome), U.field({ name: 'dp_' + rows.length, label: 'Parentesco', type: 'select', options: ['cônjuge', 'filho(a)', 'pai', 'mãe', 'sócio', 'funcionário', 'outro'].map(x => ({ value: x, label: x })) }, d.parentesco),
        U.field({ name: 'dd_' + rows.length, label: 'Nascimento', type: 'date' }, d.data_nascimento), U.field({ name: 'dv_' + rows.length, label: 'Valor (R$)', type: 'number', step: '0.01' }, d.valor),
        h('button', { class: 'icon-btn', 'aria-label': 'Remover', onclick: () => { r.remove(); rows.splice(rows.indexOf(r), 1); } }, icon('trash', 16)));
      rows.push(r); container.appendChild(r);
    };
    initial.forEach(add);
    return { add, values: () => rows.map(r => { const g = s => r.querySelector(`[id^="f_${s}"]`).value || null; return { nome: g('dn_'), parentesco: g('dp_'), data_nascimento: g('dd_'), valor: g('dv_') ? Number(g('dv_')) : null }; }).filter(d => d.nome) };
  }
  function convert(leadRow, { onDone } = {}) {
    const PJ = leadRow.tipo_pessoa === 'PJ';
    const semCorretor = !leadRow.corretor_id;
    if (semCorretor && !App.can('leads.distribuir')) { toast('Este lead ainda não tem corretor responsável. Peça ao supervisor para distribuí-lo.', 'err'); return; }
    const f = form([
      ...(semCorretor ? [{ section: 'Responsável' }, { name: 'corretor_id', label: 'Corretor responsável pela venda', type: 'select', required: true, options: App.opt.corretores(), span: 2, hint: 'O lead está na fila; ele será distribuído para este corretor antes da conversão.' }] : []),
      { section: 'Venda' },
      { name: 'operator_id', label: 'Operadora', type: 'select', required: true, options: App.opt.ops() },
      { name: 'product_id', label: 'Produto', type: 'select', options: App.opt.prods(leadRow.operator_id) },
      { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number', step: '0.01', required: true },
      { name: 'num_vidas', label: 'Número de vidas', type: 'number', min: 1, required: true },
      { name: 'numero_proposta', label: 'Número da proposta' },
      { name: 'status', label: 'Onde a venda está', type: 'select', required: true, options: [['proposta_enviada', 'Venda fechada — iniciar a implantação'], ['em_analise', 'Já enviada à operadora (em análise)'], ['aprovada', 'Já aprovada pela operadora'], ['implantada', 'Já implantada']].map(([value, label]) => ({ value, label })),
        hint: 'A venda entra na Implantação nesta etapa. As comissões nascem quando a operadora aprovar.' },
      { name: 'data_venda', label: 'Data da venda', type: 'date', required: true },
      { name: 'vigencia', label: 'Início de vigência', type: 'date' },
      { section: 'Cliente' },
      PJ ? { name: 'razao_social', label: 'Razão social' } : { name: 'cpf', label: 'CPF', mask: 'cpf' },
      PJ ? { name: 'cnpj', label: 'CNPJ', mask: 'cnpj' } : { name: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
      { name: 'cep', label: 'CEP', mask: 'cep' }, { name: 'endereco', label: 'Endereço' }, { name: 'numero', label: 'Número' }, { name: 'bairro', label: 'Bairro' },
      { name: 'cidade', label: 'Cidade' }, { name: 'uf', label: 'UF', type: 'select', options: App.opt.ufs() },
    ], { operator_id: leadRow.operator_id, product_id: leadRow.product_id, valor_mensal: leadRow.valor_cotacao || leadRow.valor_pretendido, num_vidas: leadRow.num_vidas, status: 'proposta_enviada', data_venda: dates.today(),
      cpf: leadRow.cpf ? fmt.cpf(leadRow.cpf) : '', cnpj: leadRow.cnpj ? fmt.cnpj(leadRow.cnpj) : '', razao_social: leadRow.empresa, data_nascimento: leadRow.data_nascimento, cidade: leadRow.cidade, uf: leadRow.uf }, { cols: 2 });
    opProd(f);
    const depWrap = h('div');
    const deps = depRows(depWrap);
    const body = h('div', { class: 'stack' }, f, h('div', { class: 'form-section' }, 'Dependentes / beneficiários'), depWrap, h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: () => deps.add() }, icon('plus', 14), 'Adicionar dependente'));
    const m = modal({ title: 'Aprovado — enviar para a implantação', subtitle: `${leadRow.nome} vira cliente e a venda entra na Implantação`, size: 'lg', body, footer: [cancel(null), btnSave('Enviar para implantação', async () => {
      if (!f.validate()) return; const v = f.values();
      if (semCorretor) { await API.rpc('distribuir_lead', { p_lead: leadRow.id, p_corretor: v.corretor_id, p_motivo: 'Distribuído na conversão em cliente', p_metodo: 'manual' }); delete v.corretor_id; }
      const r = await API.rpc('converter_em_cliente', { p_lead: leadRow.id, p_dados: { ...v, cpf: digits(v.cpf), cnpj: digits(v.cnpj), cep: digits(v.cep), dependentes: deps.values() } });
      const etapa = ((App.lk.implStages || []).find(x => x.codigo === r.implantacao_etapa) || {}).nome;
      m.close(); toast(`${leadRow.nome} aprovado — enviado para a Implantação${etapa ? ' (' + etapa + ')' : ''}`); App.refreshCounts();
      if (onDone) onDone(r); else App.go('/vendas/' + r.sale_id);
    })] });
  }

  // ------------------------------------------------------------------
  // Cliente, venda, dependente, pendência, documento
  // ------------------------------------------------------------------
  function client(existing, { onDone } = {}) {
    const v = existing ? { ...existing, cpf: existing.cpf ? fmt.cpf(existing.cpf) : '', cnpj: existing.cnpj ? fmt.cnpj(existing.cnpj) : '', whatsapp: fmt.phone(existing.whatsapp), telefone: existing.telefone ? fmt.phone(existing.telefone) : '' } : { tipo_pessoa: 'PF', status: 'implantacao', num_vidas: 1, data_venda: dates.today() };
    const f = form([
      { name: 'tipo_pessoa', label: 'Pessoa', type: 'select', required: true, options: [{ value: 'PF', label: 'Pessoa física' }, { value: 'PJ', label: 'Pessoa jurídica' }] },
      { name: 'nome', label: 'Nome / responsável', required: true },
      { name: 'razao_social', label: 'Razão social (PJ)' }, { name: 'cnpj', label: 'CNPJ', mask: 'cnpj' },
      { name: 'cpf', label: 'CPF', mask: 'cpf' }, { name: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
      { name: 'whatsapp', label: 'WhatsApp', mask: 'phone' }, { name: 'telefone', label: 'Telefone', mask: 'phone' },
      { name: 'email', label: 'E-mail', type: 'email', span: 2 },
      { section: 'Endereço' },
      { name: 'cep', label: 'CEP', mask: 'cep' }, { name: 'endereco', label: 'Logradouro' }, { name: 'numero', label: 'Número' }, { name: 'complemento', label: 'Complemento' },
      { name: 'bairro', label: 'Bairro' }, { name: 'cidade', label: 'Cidade' }, { name: 'uf', label: 'UF', type: 'select', options: App.opt.ufs() },
      { section: 'Plano atual' },
      { name: 'operator_id', label: 'Operadora', type: 'select', options: App.opt.ops() }, { name: 'product_id', label: 'Plano', type: 'select', options: App.opt.prods(existing?.operator_id) },
      { name: 'num_vidas', label: 'Vidas', type: 'number', min: 1 }, { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number', step: '0.01' },
      { name: 'numero_proposta', label: 'Nº da proposta' }, { name: 'carteirinha', label: 'Nº da carteirinha' },
      { name: 'data_venda', label: 'Data da venda', type: 'date' }, { name: 'vigencia', label: 'Vigência', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['ativo', 'Ativo'], ['implantacao', 'Implantação'], ['pendencia', 'Pendência'], ['cancelado', 'Cancelado'], ['inadimplente', 'Inadimplente'], ['migracao', 'Migração'], ['renovacao', 'Renovação']].map(([value, label]) => ({ value, label })) },
      ...(!existing && App.gestor() ? [{ name: 'corretor_id', label: 'Corretor responsável', type: 'select', required: true, options: App.opt.corretores() }] : []),
    ], v, { cols: 2 });
    opProd(f);
    const m = modal({ title: existing ? 'Editar cliente' : 'Novo cliente', size: 'lg', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const x = f.values();
      const row = { ...x, cpf: digits(x.cpf), cnpj: digits(x.cnpj), whatsapp: digits(x.whatsapp), telefone: digits(x.telefone), cep: digits(x.cep) };
      Object.keys(row).forEach(k => row[k] === undefined && delete row[k]);
      let saved;
      if (existing) { delete row.corretor_id; saved = await API.update('clients', existing.id, row); } else saved = await API.insert('clients', row);
      m.close(); toast('Cliente salvo');
      if (onDone) onDone(saved); else if (!existing) App.go('/clientes/' + saved.id); else App.reload();
    })] });
  }

  async function saleForClient(cli, { existing, onDone } = {}) {
    let clientOpts = null;
    if (!cli && !existing) {
      const { rows } = await API.list('v_clients', { select: 'id,nome,corretor_id', order: [['nome', true]], limit: 1000 });
      if (!rows.length) { toast('Cadastre um cliente antes ou converta um lead aprovado.', 'info'); return; }
      clientOpts = rows.map(r => ({ value: r.id, label: r.nome }));
    }
    const base = existing || { client_id: cli?.id, operator_id: cli?.operator_id, product_id: cli?.product_id, num_vidas: cli?.num_vidas || 1, valor_mensal: cli?.valor_mensal, status: 'proposta_enviada', data_venda: dates.today() };
    const f = form([
      ...(clientOpts ? [{ name: 'client_id', label: 'Cliente', type: 'select', required: true, options: clientOpts, span: 2 }] : []),
      { name: 'operator_id', label: 'Operadora', type: 'select', required: true, options: App.opt.ops() }, { name: 'product_id', label: 'Produto', type: 'select', options: App.opt.prods(base.operator_id) },
      { name: 'tipo_plano', label: 'Tipo de plano', type: 'select', options: App.opt.modalidades() },
      { name: 'num_vidas', label: 'Vidas', type: 'number', min: 1, required: true },
      { name: 'valor_mensal', label: 'Valor mensal (R$)', type: 'number', step: '0.01', required: true },
      { name: 'numero_proposta', label: 'Nº da proposta' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['proposta_enviada', 'Venda realizada'], ['em_analise', 'Em análise'], ['pendencia', 'Pendência'], ['aprovada', 'Aprovada'], ['implantada', 'Implantada'], ['recusada', 'Recusada'], ['cancelada', 'Cancelada']].map(([value, label]) => ({ value, label })) },
      { name: 'data_venda', label: 'Data da venda', type: 'date', required: true }, { name: 'vigencia', label: 'Vigência', type: 'date' },
      { name: 'data_implantacao', label: 'Data de implantação', type: 'date' },
      { name: 'source_id', label: 'Origem', type: 'select', options: App.opt.srcs() },
      { name: 'motivo_cancelamento', label: 'Motivo do cancelamento/recusa', type: 'textarea', rows: 2, span: 2 },
    ], base, { cols: 2 });
    opProd(f);
    const m = modal({ title: existing ? 'Editar venda' : 'Nova venda', subtitle: cli?.nome || existing?.cliente_nome, size: 'lg', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values();
      if (['cancelada', 'recusada'].includes(v.status) && !v.motivo_cancelamento) return toast('Informe o motivo do cancelamento/recusa', 'err');
      let saved;
      if (existing) {
        if (existing.status !== v.status && !(await confirmDialog({ title: 'Alterar status da venda', message: `Confirmar mudança de "${existing.status}" para "${v.status}"? Isso atualiza implantação, comissões e o cliente.` }))) return;
        saved = await API.update('sales', existing.id, v);
      } else {
        const c = cli || (await API.get('v_clients', v.client_id));
        saved = await API.insert('sales', { ...v, client_id: c.id, corretor_id: c.corretor_id, supervisor_id: c.supervisor_id, gerente_id: c.gerente_id, lead_id: c.lead_id || null });
      }
      m.close(); toast('Venda salva'); App.refreshCounts();
      if (onDone) onDone(saved); else if (!existing) App.go('/vendas/' + saved.id); else App.reload();
    })] });
  }

  function dependent(cli, { existing, onDone } = {}) {
    const f = form([
      { name: 'nome', label: 'Nome', required: true, span: 2 }, { name: 'cpf', label: 'CPF', mask: 'cpf' }, { name: 'data_nascimento', label: 'Nascimento', type: 'date' },
      { name: 'parentesco', label: 'Parentesco', type: 'select', options: ['cônjuge', 'filho(a)', 'pai', 'mãe', 'sócio', 'funcionário', 'outro'].map(x => ({ value: x, label: x })) },
      { name: 'product_id', label: 'Plano', type: 'select', options: App.opt.prods(cli.operator_id) }, { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['ativo', 'Ativo'], ['implantacao', 'Implantação'], ['cancelado', 'Cancelado'], ['suspenso', 'Suspenso']].map(([value, label]) => ({ value, label })) },
    ], existing ? { ...existing, cpf: existing.cpf ? fmt.cpf(existing.cpf) : '' } : { status: 'ativo', product_id: cli.product_id }, { cols: 2 });
    const m = modal({ title: existing ? 'Editar dependente' : 'Novo dependente', subtitle: cli.nome, size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values(); v.cpf = digits(v.cpf);
      if (existing) await API.update('dependents', existing.id, v); else await API.insert('dependents', { ...v, client_id: cli.id });
      done(m, 'Dependente salvo', onDone);
    })] });
  }

  function pendency(target, { existing, onDone } = {}) {
    const f = form([
      { name: 'descricao', label: 'Descrição da pendência', type: 'textarea', rows: 2, required: true, span: 2 },
      { name: 'prazo', label: 'Prazo', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: [['aberta', 'Aberta'], ['resolvida', 'Resolvida'], ['cancelada', 'Cancelada']].map(([value, label]) => ({ value, label })) },
      { name: 'resolucao', label: 'Resolução', type: 'textarea', rows: 2, span: 2 },
    ], existing || { status: 'aberta', prazo: dates.addDays(dates.today(), 3) }, { cols: 2 });
    const m = modal({ title: existing ? 'Atualizar pendência' : 'Nova pendência', size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values();
      if (existing) await API.update('pendencies', existing.id, v); else await API.insert('pendencies', { ...v, sale_id: target.sale_id || null, lead_id: target.lead_id || null, client_id: target.client_id || null });
      done(m, 'Pendência salva', onDone);
    })] });
  }

  const DOC_TIPOS = [['rg', 'RG'], ['cpf', 'CPF'], ['cnh', 'CNH'], ['comprovante_residencia', 'Comprovante de residência'], ['cartao_cnpj', 'Cartão CNPJ'], ['contrato_social', 'Contrato social'], ['carteirinha', 'Carteirinha atual'], ['carta_permanencia', 'Carta de permanência'], ['proposta', 'Proposta'], ['declaracao_saude', 'Declaração de saúde'], ['outro', 'Outro']];
  const DOC_LABEL = Object.fromEntries(DOC_TIPOS);
  function document_(target, { onDone } = {}) {
    const file = h('input', { type: 'file', id: 'f_arquivo', accept: '.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx' });
    const f = form([
      { name: 'tipo', label: 'Tipo de documento', type: 'select', required: true, options: DOC_TIPOS.map(([value, label]) => ({ value, label })) },
      { name: 'sensivel', label: 'Sensível', type: 'checkbox', checkLabel: 'Documento sensível (acesso restrito)', hint: 'Marque para declaração de saúde e dados médicos (LGPD).' },
    ], { tipo: 'rg' }, { cols: 2 });
    f.querySelector('#f_tipo').addEventListener('change', e => { f.querySelector('#f_sensivel').checked = e.target.value === 'declaracao_saude'; });
    const body = h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', { for: 'f_arquivo' }, 'Arquivo (até 20 MB)'), file), f);
    const m = modal({ title: 'Anexar documento', subtitle: target.nome, size: 'md', body, footer: [cancel(null), btnSave('Enviar', async () => {
      const fl = file.files[0]; if (!fl) return toast('Selecione um arquivo', 'err');
      if (fl.size > 20 * 1024 * 1024) return toast('Arquivo acima de 20 MB', 'err');
      const v = f.values();
      const ent = target.sale_id ? 'venda' : target.client_id ? 'cliente' : 'lead';
      const path = `${App.me.id}/${ent}/${Date.now()}-${fl.name.normalize('NFD').replace(/[^\w.-]+/g, '_')}`;
      await API.upload(path, fl);
      await API.insert('documents', { lead_id: target.lead_id || null, client_id: target.client_id || null, sale_id: target.sale_id || null, tipo: v.tipo, sensivel: !!v.sensivel, nome_arquivo: fl.name, storage_path: path, tamanho: fl.size, mime: fl.type });
      done(m, 'Documento anexado', onDone);
    })] });
  }
  async function openDoc(d) {
    if (!d.storage_path) return toast('Documento de exemplo — sem arquivo anexado na demonstração.', 'info');
    try { const url = await API.fileUrl(d.storage_path); window.open(url, '_blank', 'noopener'); } catch (e) { App.err(e); }
  }

  function transferClient(cli, { onDone } = {}) {
    const f = form([{ name: 'corretor', label: 'Novo corretor responsável', type: 'select', required: true, options: App.opt.corretores().filter(o => o.value !== cli.corretor_id) },
      { name: 'motivo', label: 'Motivo', type: 'textarea', rows: 2, required: true }], {}, { cols: 1 });
    const m = modal({ title: 'Transferir cliente', subtitle: cli.nome + ' — a produção das vendas continua com quem vendeu', size: 'md', body: f, footer: [cancel(null), btnSave('Transferir', async () => {
      if (!f.validate()) return; const v = f.values();
      await API.rpc('transferir_cliente', { p_client: cli.id, p_corretor: v.corretor, p_motivo: v.motivo });
      done(m, 'Cliente transferido', onDone);
    })] });
  }

  // ------------------------------------------------------------------
  // Metas
  // ------------------------------------------------------------------
  function goal(existing, { onDone } = {}) {
    const escopos = App.is('admin') ? [['empresa', 'Empresa'], ['gerente', 'Gerente'], ['supervisor', 'Supervisor'], ['equipe', 'Equipe'], ['corretor', 'Corretor']] : [['supervisor', 'Supervisor'], ['equipe', 'Equipe'], ['corretor', 'Corretor']];
    const f = form([
      { name: 'escopo', label: 'Meta de', type: 'select', required: true, options: escopos.map(([value, label]) => ({ value, label })) },
      { name: 'usuario_id', label: 'Pessoa', type: 'select', options: [...App.opt.corretores(), ...App.opt.supervisores(), ...App.opt.gerentes()] },
      { name: 'goal_team_id', label: 'Equipe', type: 'select', options: App.opt.teams() },
      { name: 'mes', label: 'Mês', type: 'month', required: true },
      { name: 'tipo', label: 'Tipo de meta', type: 'select', required: true, options: [['valor', 'Valor vendido (R$/mês)'], ['qtd_vendas', 'Quantidade de vendas'], ['vidas', 'Número de vidas'], ['conversao', 'Conversão (%)']].map(([value, label]) => ({ value, label })) },
      { name: 'valor_meta', label: 'Meta', type: 'number', step: '0.01', required: true },
      { name: 'operator_id', label: 'Operadora (opcional)', type: 'select', options: App.opt.ops() },
      { name: 'product_id', label: 'Produto (opcional)', type: 'select', options: App.opt.prods() },
    ], existing ? { ...existing, mes: existing.mes.slice(0, 7) } : { escopo: 'corretor', tipo: 'valor', mes: dates.today().slice(0, 7) }, { cols: 2 });
    const m = modal({ title: existing ? 'Editar meta' : 'Nova meta', size: 'md', body: f, footer: [cancel(null), btnSave('Salvar', async () => {
      if (!f.validate()) return; const v = f.values(); v.mes = v.mes + '-01';
      if (['corretor', 'supervisor', 'gerente'].includes(v.escopo) && !v.usuario_id) return toast('Escolha a pessoa', 'err');
      if (v.escopo === 'equipe' && !v.goal_team_id) return toast('Escolha a equipe', 'err');
      if (v.escopo !== 'equipe') v.goal_team_id = null; if (!['corretor', 'supervisor', 'gerente'].includes(v.escopo)) v.usuario_id = null;
      if (existing) await API.update('goals', existing.id, v); else await API.insert('goals', v);
      done(m, 'Meta salva', onDone);
    })] });
  }

  // ------------------------------------------------------------------
  // Importação de leads (CSV / Excel) com mapeamento de colunas
  // ------------------------------------------------------------------
  const IMPORT_FIELDS = [['nome', 'Nome *'], ['whatsapp', 'WhatsApp'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['cpf', 'CPF'], ['data_nascimento', 'Nascimento'], ['cidade', 'Cidade'], ['uf', 'UF'],
    ['empresa', 'Empresa'], ['cnpj', 'CNPJ'], ['num_vidas', 'Nº de vidas'], ['valor_pretendido', 'Valor pretendido'], ['modalidade', 'Modalidade'], ['observacao', 'Observação']];
  const GUESS = { nome: /^(nome|name|cliente|contato)/i, whatsapp: /whats|celular|cel\b|mobile/i, telefone: /^(tel|fone|phone)/i, email: /mail/i, cpf: /cpf/i, data_nascimento: /nasc|birth/i, cidade: /cidade|city/i, uf: /^(uf|estado|state)$/i,
    empresa: /empresa|company|raz/i, cnpj: /cnpj/i, num_vidas: /vida|lives|qtd/i, valor_pretendido: /valor|or[cç]amento|budget/i, modalidade: /modal|tipo/i, observacao: /obs|mensagem|message|nota/i };
  function parseCSV(text) {
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }
  function importLeads() {
    let data = null;
    const body = h('div', { class: 'stack' });
    const step1 = () => {
      const file = h('input', { type: 'file', id: 'imp_file', accept: '.csv,.xlsx,.xls,.txt' });
      file.addEventListener('change', async () => {
        const fl = file.files[0]; if (!fl) return;
        try {
          if (/\.xlsx?$/i.test(fl.name)) {
            await U.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            const wb = XLSX.read(await fl.arrayBuffer(), { type: 'array', cellDates: true });
            data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }).filter(r => r.some(x => String(x ?? '').trim()));
          } else data = parseCSV(await fl.text());
          if (!data || data.length < 2) return toast('Arquivo sem linhas de dados', 'err');
          step2();
        } catch (e) { App.err(e); }
      });
      const exemplo = 'nome;whatsapp;email;num_vidas;cidade;uf\nMaria Souza;11988887777;maria@email.com;3;São Paulo;SP';
      clear(body).append(h('p', { class: 'muted', style: { margin: 0 } }, 'Envie um arquivo CSV (separado por ; ou ,) ou Excel. A primeira linha deve conter os nomes das colunas.'),
        h('div', { class: 'field' }, h('label', { for: 'imp_file' }, 'Arquivo'), file),
        h('div', { class: 'card', style: { padding: '12px' } }, h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '6px' } }, 'Exemplo de CSV:'), h('pre', { class: 'mono', style: { margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px' } }, exemplo)),
        h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: () => { data = parseCSV(exemplo + '\nCarlos Lima;21977776666;carlos@email.com;1;Rio de Janeiro;RJ\nEmpresa Teste;11966665555;rh@teste.com;12;Osasco;SP'); step2(); } }, 'Usar arquivo de exemplo'));
    };
    const step2 = () => {
      const header = data[0].map(x => String(x ?? '').trim());
      const rows = data.slice(1);
      const map = {};
      const selects = IMPORT_FIELDS.map(([k, l]) => {
        const guess = header.findIndex(hd => GUESS[k] && GUESS[k].test(hd));
        const sel = h('select', { id: 'map_' + k }, h('option', { value: '' }, '— ignorar —'), header.map((hd, i) => h('option', { value: i, selected: i === guess || null }, hd || `Coluna ${i + 1}`)));
        return h('div', { class: 'field' }, h('label', { for: 'map_' + k }, l), sel);
      });
      const opts = form([
        { name: 'modo', label: 'Se encontrar duplicado (CPF, telefone ou e-mail)', type: 'select', required: true, options: [['ignorar', 'Ignorar a linha'], ['atualizar', 'Atualizar o lead existente'], ['importar', 'Importar mesmo assim']].map(([value, label]) => ({ value, label })), span: 2 },
        ...(App.gestor() ? [{ name: 'corretor', label: 'Atribuir ao corretor', type: 'select', options: App.opt.corretores(), empty: 'Sem corretor (fila para distribuição)' }] : []),
        { name: 'source', label: 'Origem', type: 'select', options: App.opt.srcs() },
        { name: 'campaign', label: 'Campanha', type: 'select', options: App.opt.camps() },
      ], { modo: 'ignorar' }, { cols: 2 });
      const prev = U.table(header.map((hd, i) => ({ label: hd || `Col ${i + 1}`, render: r => r[i] ?? '' })), rows.slice(0, 5).map((r, i) => ({ ...r, id: i })), { dense: true });
      clear(body).append(h('div', { class: 'row' }, badge(`${rows.length} linhas encontradas`, 'var(--blue-2)'), h('span', { class: 'muted' }, 'Confira o mapeamento das colunas:')),
        h('div', { class: 'form cols-3' }, selects), h('div', { class: 'form-section' }, 'Opções'), opts, h('div', { class: 'form-section' }, 'Prévia'), prev);
      body.run = async () => {
        IMPORT_FIELDS.forEach(([k]) => { const v = body.querySelector('#map_' + k).value; if (v !== '') map[k] = Number(v); });
        if (map.nome === undefined) return toast('Mapeie a coluna "Nome"', 'err');
        const linhas = rows.map(r => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, r[i] !== undefined && String(r[i]).trim() !== '' ? String(r[i]).trim() : null])));
        linhas.forEach(l => { if (l.modalidade) { const m = String(l.modalidade).toLowerCase(); l.modalidade = /empres|pme|pj/.test(m) ? 'empresarial' : /famil/.test(m) ? 'familiar' : /ades/.test(m) ? 'adesao' : 'individual'; if (l.modalidade === 'empresarial') l.tipo_pessoa = 'PJ'; }
          if (l.data_nascimento && /^\d{2}\/\d{2}\/\d{4}$/.test(l.data_nascimento)) { const [d, mo, y] = l.data_nascimento.split('/'); l.data_nascimento = `${y}-${mo}-${d}`; }
          if (l.valor_pretendido) l.valor_pretendido = Number(String(l.valor_pretendido).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')) || null; });
        const o = opts.values();
        const r = await API.rpc('importar_leads', { p_linhas: linhas, p_modo_duplicado: o.modo, p_corretor: o.corretor || null, p_source: o.source || null, p_campaign: o.campaign || null });
        clear(body).append(h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Importados'), h('div', { class: 'kpi-value ok-t' }, r.inseridos)),
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Atualizados'), h('div', { class: 'kpi-value blue-t' }, r.atualizados)),
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Ignorados'), h('div', { class: 'kpi-value' }, r.ignorados)),
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Erros'), h('div', { class: 'kpi-value ' + (r.erros.length ? 'bad-t' : '') }, r.erros.length))),
          r.erros.length ? U.table([{ label: 'Linha', key: 'linha' }, { label: 'Erro', key: 'erro' }], r.erros.map((e, i) => ({ ...e, id: i })), { dense: true }) : null);
        body.run = null; runBtn.textContent = 'Concluir'; runBtn.onclick = () => { m.close(); App.refreshCounts(); App.go('/leads'); };
      };
    };
    const runBtn = h('button', { class: 'btn primary', onclick: async () => { if (!body.run) return toast('Selecione um arquivo', 'err'); runBtn.disabled = true; try { await body.run(); } catch (e) { App.err(e); } finally { runBtn.disabled = false; } } }, 'Importar');
    const m = modal({ title: 'Importar leads', subtitle: 'CSV ou Excel, com detecção de duplicidade', size: 'xl', body, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), runBtn] });
    step1();
  }

  // ------------------------------------------------------------------
  // Grade de comissão por produto (quanto a corretora recebe e quanto paga a cada grade)
  // ------------------------------------------------------------------
  const gradeCols = () => [['corretora', 'Corretora recebe', 'var(--ok)'], ['supervisor', 'Supervisor', 'var(--cyan)'], ...App.lk.grades.filter(g => g.ativo).map(g => [g.codigo, g.nome, g.cor])];
  const MAX_PARC = 3;
  function gridEditor(linhas = [], { readonly = false } = {}) {
    const cols = gradeCols();
    const data = new Map();
    linhas.forEach(l => { if (l.parcela > MAX_PARC) return; if (!data.has(l.parcela)) data.set(l.parcela, {}); data.get(l.parcela)[l.beneficiario] = Number(l.percentual); });
    let n = Math.min(MAX_PARC, Math.max(1, ...[...data.keys()]));
    let simul = 1000;
    const wrap = h('div', { class: 'grid-editor' });
    const num = v => { const t = String(v ?? '').replace('%', '').replace(',', '.').trim(); return t === '' || isNaN(Number(t)) ? null : Number(t); };
    const val = (p, c) => (data.get(p) || {})[c];
    const soma = c => { let t = 0, tem = false; for (let p = 1; p <= n; p++) { const v = val(p, c); if (v != null) { t += v; tem = true; } } return tem ? t : null; };
    const margem = p => { const v = val(p, 'corretora'); if (v == null) return null; return v - Math.max(0, ...cols.slice(2).map(([c]) => val(p, c) || 0)) - (val(p, 'supervisor') || 0); };
    const margemTot = () => { let t = null; for (let p = 1; p <= n; p++) { const m = margem(p); if (m != null) t = (t || 0) + m; } return t; };
    const money = v => v == null ? '—' : fmt.money(simul * v / 100);
    const refs = {};
    const atualiza = () => {
      cols.forEach(([c]) => { const t = soma(c); refs['t_' + c].textContent = t == null ? '—' : fmt.pct(t); refs['r_' + c].textContent = money(t); });
      for (let p = 1; p <= n; p++) { const m = margem(p); refs['m_' + p].textContent = m == null ? '—' : fmt.pct(m); refs['m_' + p].classList.toggle('bad-t', m != null && m < 0); }
      const mt = margemTot(); refs.mt.textContent = mt == null ? '—' : fmt.pct(mt); refs.mr.textContent = money(mt); refs.mt.classList.toggle('bad-t', mt != null && mt < 0);
    };
    const paint = () => {
      const head = h('tr', null, h('th', null, 'Parcela'), cols.map(([c, l, cor], i) => h('th', { class: 'a-right' }, h('span', { class: 'gcol', style: { '--c': cor } }, c === 'corretora' ? 'Corretora' : l), i >= 2 ? h('small', { class: 'th-sub' }, 'repasse') : i === 1 ? h('small', { class: 'th-sub' }, 'repasse') : h('small', { class: 'th-sub' }, 'recebe')),
        ), h('th', { class: 'a-right', title: 'Corretora recebe − maior repasse de grade − supervisor' }, 'Margem mín.'));
      const body = Array.from({ length: n }, (_, i) => i + 1).map(p => {
        refs['m_' + p] = h('td', { class: 'a-right mono muted' });
        return h('tr', null, h('td', null, h('b', null, p + 'ª parcela')), cols.map(([c]) => h('td', { class: 'a-right' }, readonly ? (val(p, c) != null ? fmt.pct(val(p, c)) : h('span', { class: 'dim' }, '—'))
          : h('span', { class: 'pct-wrap' }, h('input', { class: 'pct-in', inputmode: 'decimal', 'aria-label': `${c} ${p}ª parcela`, value: val(p, c) ?? '', placeholder: '0', oninput: e => { if (!data.has(p)) data.set(p, {}); data.get(p)[c] = num(e.target.value); atualiza(); } }), h('i', null, '%')))), refs['m_' + p]);
      });
      const tot = h('tr', { class: 'tot-row' }, h('td', null, h('b', null, 'Total')), cols.map(([c]) => (refs['t_' + c] = h('td', { class: 'a-right tot' }))), (refs.mt = h('td', { class: 'a-right tot' })));
      const rs = h('tr', { class: 'rs-row' }, h('td', null, 'Em R$'), cols.map(([c]) => (refs['r_' + c] = h('td', { class: 'a-right mono' }))), (refs.mr = h('td', { class: 'a-right mono muted' })));
      const t = h('table', { class: 'tbl grade-tbl' }, h('thead', null, head), h('tbody', null, body), h('tfoot', null, tot, rs));
      const bar = h('div', { class: 'grade-bar' },
        h('div', { class: 'field' }, h('label', null, 'Quantidade de parcelas'), readonly ? h('b', null, n + (n > 1 ? ' parcelas' : ' parcela'))
          : h('div', { class: 'seg', role: 'group', 'aria-label': 'Quantidade de parcelas' }, [1, 2, 3].map(k => h('button', { type: 'button', class: k === n ? 'on' : '', onclick: () => { for (let p = k + 1; p <= MAX_PARC; p++) data.delete(p); n = k; paint(); } }, k === 1 ? '1 parcela' : k + ' parcelas')))),
        h('div', { class: 'field' }, h('label', { for: 'sim_mens' }, 'Simular com mensalidade de'), h('input', { id: 'sim_mens', type: 'number', min: 0, step: '0.01', value: simul, style: { width: '150px' }, oninput: e => { simul = Number(e.target.value) || 0; atualiza(); } })),
        h('div', { class: 'muted grade-help' }, 'Percentuais sobre a mensalidade, em cada parcela (máximo 3). Deixe em branco ou 0 onde não há comissão — essa parcela não aparece para o corretor. A linha "Total" soma as parcelas.'));
      clear(wrap).append(bar, h('div', { class: 'table-wrap dense' }, t));
      atualiza();
    };
    wrap.getLinhas = () => { const out = []; data.forEach((row, p) => { if (p > n) return; Object.entries(row).forEach(([b, v]) => { if (v != null) out.push({ beneficiario: b, parcela: p, percentual: v }); }); }); return out; };
    wrap.validar = () => {
      const l = wrap.getLinhas();
      if (!l.length) return null;
      if (!l.some(x => x.beneficiario === 'corretora')) return 'Informe quanto a corretora recebe (coluna "Corretora recebe").';
      for (let p = 1; p <= n; p++) { const m = margem(p); if (m != null && m < 0) return `Na ${p}ª parcela o repasse é maior do que a corretora recebe. Confira os valores.`; }
      return null;
    };
    paint();
    return wrap;
  }
  async function productGrid(prod, { onDone } = {}) {
    const linhas = await API.all('product_commission_grid', { eq: { product_id: prod.id }, order: [['parcela', true]] });
    const ed = gridEditor(linhas);
    const m = modal({ title: 'Grade de comissão', subtitle: `${prod.nome} · ${prod.operadora_nome || ''}`, size: 'xl', body: h('div', { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0, fontSize: '12.5px' } }, 'Coluna "Corretora recebe": o que a operadora paga à corretora. Demais colunas: o que a corretora paga ao supervisor e a cada grade de corretor. A venda aprovada gera as parcelas com esses percentuais conforme a grade do corretor.'), ed),
      footer: [cancel(null), btnSave('Salvar grade', async () => { const aviso = ed.validar(); if (aviso && aviso.startsWith('Informe')) return toast(aviso, 'err'); if (aviso && !(await confirmDialog({ title: 'Repasse maior que o recebido', message: aviso + ' Deseja salvar mesmo assim?', confirm: 'Salvar mesmo assim' }))) return; const n = await API.rpc('salvar_grade_produto', { p_product: prod.id, p_linhas: ed.getLinhas() }); done(m, n ? `Grade salva (${n} valores)` : 'Grade removida — o produto volta a usar as regras de comissão', onDone); })] });
  }
  // Importação da grade (CSV/Excel): operadora; produto; parcela; corretora; supervisor; ouro; prata; bronze; externo
  const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function importGrade({ onDone } = {}) {
    let data = null;
    const body = h('div', { class: 'stack' });
    const cols = gradeCols();
    const modelo = ['operadora;produto;parcela;' + cols.map(c => c[0]).join(';'), 'Amil;Amil S380 QC;1;200;10;' + cols.slice(2).map((c, i) => 120 - i * 20).join(';'), 'Amil;Amil S380 QC;2;100;5;' + cols.slice(2).map((c, i) => Math.max(0, 50 - i * 10)).join(';')].join('\n');
    const step1 = () => {
      const file = h('input', { type: 'file', id: 'grade_file', accept: '.csv,.xlsx,.xls,.txt' });
      file.addEventListener('change', async () => {
        const fl = file.files[0]; if (!fl) return;
        try {
          if (/\.xlsx?$/i.test(fl.name)) {
            await U.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            const wb = XLSX.read(await fl.arrayBuffer(), { type: 'array' });
            data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }).filter(r => r.some(x => String(x ?? '').trim()));
          } else data = parseCSV(await fl.text());
          if (!data || data.length < 2) return toast('Arquivo sem linhas de dados', 'err');
          step2();
        } catch (e) { App.err(e); }
      });
      clear(body).append(h('p', { class: 'muted', style: { margin: 0 } }, 'Uma linha por produto e parcela. Colunas: operadora, produto, parcela, corretora (quanto a corretora recebe) e uma coluna para o supervisor e para cada grade de corretor (código ou nome da grade). Valores em % da mensalidade.'),
        h('div', { class: 'field' }, h('label', { for: 'grade_file' }, 'Arquivo CSV ou Excel'), file),
        h('div', { class: 'card', style: { padding: '12px' } }, h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '6px' } }, 'Modelo:'), h('pre', { class: 'mono', style: { margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px' } }, modelo)),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { data = parseCSV(modelo); step2(); } }, 'Usar o modelo de exemplo'),
          h('button', { class: 'btn sm ghost', onclick: async () => { if (global.ATOS_PREVIEW) return toast('Na prévia o download fica bloqueado.', 'info');
            const g = await API.all('v_commission_grid', { order: [['operadora_nome', true], ['produto_nome', true], ['parcela', true]] }); const m = new Map();
            g.forEach(x => { const k = x.operadora_nome + '|' + x.produto_nome + '|' + x.parcela; if (!m.has(k)) m.set(k, { operadora: x.operadora_nome, produto: x.produto_nome, parcela: x.parcela }); m.get(k)[x.beneficiario] = String(x.percentual).replace('.', ','); });
            U.download('grade-comissao-' + dates.today() + '.csv', U.toCSV([{ label: 'operadora', key: 'operadora' }, { label: 'produto', key: 'produto' }, { label: 'parcela', key: 'parcela' }, ...cols.map(c => ({ label: c[0], key: c[0] }))], [...m.values()])); } }, icon('download', 14), 'Baixar grade atual')));
    };
    const step2 = () => {
      const header = data[0].map(x => semAcento(x));
      const idx = n => header.findIndex(x => x === n || x.startsWith(n));
      const iOp = idx('operadora'), iPr = header.findIndex(x => /produto|plano/.test(x)), iPa = idx('parcela');
      const benef = cols.map(([c, l]) => [c, header.findIndex(x => x === c || x === semAcento(l) || (c === 'corretora' && /corretora|recebe|empresa/.test(x)) || (c !== 'corretora' && x === semAcento(App.lk.gradeMap[c] ? App.lk.gradeMap[c].nome : c)))]).filter(([, i]) => i >= 0);
      if (iPr < 0 || iPa < 0) return toast('O arquivo precisa das colunas "produto" e "parcela"', 'err');
      const linhas = data.slice(1).map(r => ({ operadora: iOp >= 0 ? r[iOp] : '', produto: r[iPr], parcela: Number(String(r[iPa] || '').replace(/\D/g, '')) || null, valores: Object.fromEntries(benef.map(([c, i]) => [c, r[i] != null ? String(r[i]).replace('%', '').trim() : ''])) })).filter(l => l.produto && l.parcela);
      const opts = form([{ name: 'criar', label: 'Produtos não encontrados', type: 'checkbox', checkLabel: 'Criar operadora e produto automaticamente' }], { criar: false }, { cols: 1 });
      clear(body).append(h('div', { class: 'row' }, badge(`${linhas.length} linha(s)`, 'var(--blue-2)'), h('span', { class: 'muted' }, 'Colunas reconhecidas: ' + benef.map(([c]) => (cols.find(x => x[0] === c) || [])[1]).join(', '))), opts,
        U.table([{ label: 'Operadora', key: 'operadora' }, { label: 'Produto', key: 'produto' }, { label: 'Parc.', key: 'parcela', align: 'right' }, ...benef.map(([c]) => ({ label: (cols.find(x => x[0] === c) || [])[1], align: 'right', render: l => l.valores[c] || '—' }))],
          linhas.slice(0, 12).map((l, i) => ({ ...l, id: i })), { dense: true }), linhas.length > 12 ? h('div', { class: 'muted', style: { fontSize: '12px' } }, `… e mais ${linhas.length - 12} linha(s)`) : null);
      body.run = async () => {
        const r = await API.rpc('importar_grade_comissao', { p_linhas: linhas, p_criar_produtos: !!opts.values().criar });
        clear(body).append(h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Produtos atualizados'), h('div', { class: 'kpi-value ok-t' }, r.produtos)),
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Produtos criados'), h('div', { class: 'kpi-value blue-t' }, r.criados)),
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Percentuais gravados'), h('div', { class: 'kpi-value' }, r.valores)),
          h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'Não encontrados'), h('div', { class: 'kpi-value ' + (r.nao_encontrados.length ? 'bad-t' : '') }, r.nao_encontrados.length))),
          r.nao_encontrados.length ? U.table([{ label: 'Operadora', key: 'operadora' }, { label: 'Produto não encontrado', key: 'produto' }], r.nao_encontrados.map((x, i) => ({ ...x, id: i })), { dense: true }) : null);
        body.run = null; runBtn.textContent = 'Concluir'; runBtn.onclick = () => { m.close(); App.loadLookups().then(() => onDone ? onDone() : App.reload()); };
      };
    };
    const runBtn = h('button', { class: 'btn primary', onclick: async () => { if (!body.run) return toast('Selecione um arquivo', 'err'); runBtn.disabled = true; try { await body.run(); } catch (e) { App.err(e); } finally { runBtn.disabled = false; } } }, 'Importar grade');
    const m = modal({ title: 'Importar grade de comissão', subtitle: 'Substitui a grade dos produtos presentes no arquivo', size: 'xl', body, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), runBtn] });
    step1();
  }

  global.Forms = { gridEditor, productGrid, importGrade, gradeCols, parseCSV: t => parseCSV(t), lead, distribute, loss, activity, followup, concluirFollowup, task, event, eventDetail, shareEvent, peoplePicker, EV_LABEL, quote, proposal, convert, client, saleForClient, dependent, pendency, document: document_, openDoc, transferClient, goal, importLeads,
    FU_TIPOS, PRIOS, DOC_LABEL };
})(window);
