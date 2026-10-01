/* =====================================================================
   ATOS SISTEMA — demo.js
   Motor de DEMONSTRAÇÃO em memória. Reproduz as regras do banco:
   • políticas RLS (quem vê / quem grava o quê)
   • triggers (carimbo de hierarquia, histórico, auditoria, funil,
     implantação, comissões, notificações)
   • RPCs (distribuição, conversão, dashboards, duplicidade...)
   Os dados gerados aqui são SEEDS DE DEMONSTRAÇÃO, claramente
   identificados, e somem ao recarregar a página.
   ===================================================================== */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------
  // Utilidades internas
  // ------------------------------------------------------------------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const digits = v => { const d = String(v ?? '').replace(/\D/g, ''); return d || null; };
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const HOUR = 3600e3, DAY = 86400e3;

  function err(msg, code = '42501') { const e = new Error(msg); e.code = code; return e; }

  const OWNER = ['leads', 'clients', 'sales', 'quotes', 'proposals', 'implementations', 'pendencies', 'activities', 'followups', 'tasks', 'events', 'notes', 'documents'];
  const ROOT = ['leads', 'clients', 'sales'];
  const CHILD = ['quotes', 'proposals', 'implementations', 'pendencies', 'activities', 'followups', 'tasks', 'events', 'notes', 'documents', 'commissions'];
  const CARIMBO = ['teams', 'profiles', 'operators', 'products', 'lead_sources', 'campaigns', 'distribution_rules', 'leads', 'clients', 'dependents', 'quotes', 'proposals',
    'sales', 'implementations', 'pendencies', 'activities', 'followups', 'tasks', 'events', 'notes', 'documents', 'goals', 'commission_rules', 'commissions', 'product_commission_grid'];
  const AUDIT = ['leads', 'clients', 'sales', 'proposals', 'implementations', 'commissions', 'profiles', 'teams', 'goals', 'commission_rules', 'operators', 'products',
    'settings', 'distribution_rules', 'documents', 'dependents', 'lead_statuses', 'pipeline_stages', 'role_permissions', 'commission_grades', 'implementation_stages'];
  const CADASTROS = ['operators', 'products', 'lead_sources', 'campaigns', 'pipeline_stages', 'lead_statuses', 'loss_reasons', 'roles', 'permissions', 'role_permissions', 'settings'];
  const TABLES = ['roles', 'permissions', 'role_permissions', 'teams', 'profiles', 'operators', 'products', 'lead_sources', 'campaigns', 'pipeline_stages', 'lead_statuses',
    'loss_reasons', 'settings', 'distribution_rules', 'leads', 'lead_assignments', 'lead_history', 'clients', 'dependents', 'quotes', 'proposals', 'sales', 'implementations',
    'implementation_events', 'pendencies', 'activities', 'followups', 'tasks', 'events', 'notes', 'documents', 'goals', 'commission_rules', 'commissions', 'notifications',
    'audit_logs', 'integration_events', 'commission_grades', 'product_commission_grid', 'implementation_stages', 'event_participants', 'user_presence'];
  const KEY = { roles: 'codigo', permissions: 'codigo', pipeline_stages: 'codigo', lead_statuses: 'codigo', settings: 'chave', commission_grades: 'codigo', implementation_stages: 'codigo', user_presence: 'usuario_id' };
  const GRUPOS = ['entrada', 'atendimento', 'negociacao', 'proposta', 'ganho', 'perdido'];

  const DEFAULTS = {
    leads: () => ({ status: 'novo', etapa: 'novos', temperatura: 'morno', temperatura_auto: true, prioritario: false, num_vidas: 1, tipo_pessoa: 'PF', modalidade: 'individual', tentativas_contato: 0, alerta_nivel: 0, sla_alerta: 0 }),
    clients: () => ({ status: 'implantacao', tipo_pessoa: 'PF', num_vidas: 1 }),
    sales: () => ({ status: 'proposta_enviada', num_vidas: 1, valor_mensal: 0 }),
    quotes: () => ({ status: 'elaboracao' }),
    proposals: () => ({ status: 'enviada' }),
    implementations: () => ({}),
    pendencies: () => ({ status: 'aberta' }),
    activities: () => ({ efetivo: true }),
    followups: () => ({ tipo: 'ligacao', prioridade: 'normal', status: 'pendente', lembrete_min: 15, alerta_enviado: 0 }),
    tasks: () => ({ prioridade: 'normal', status: 'aberta' }),
    events: () => ({ tipo: 'reuniao', lembrete_min: 30, lembrete_enviado_em: null }),
    notes: () => ({ fixada: false }),
    documents: () => ({ sensivel: false }),
    profiles: () => ({ papel: 'corretor', status: 'pendente', disponivel: true, recebe_leads: true, ufs: [], grade_comissao: null }),
    teams: () => ({ ativo: true }), operators: () => ({ ativo: true }), lead_sources: () => ({ ativo: true }), campaigns: () => ({ ativo: true }),
    products: () => ({ ativo: true, ramo: 'saude', tipo: 'pme', coparticipacao: false }),
    commission_rules: () => ({ pct_empresa: 100, pct_corretor: 50, pct_supervisor: 10, parcelas: 1, ativo: true }),
    distribution_rules: () => ({ prioridade: 100, metodo: 'rodizio', ativo: true }),
    dependents: () => ({ status: 'ativo' }), commissions: () => ({ parcela: 1, status: 'prevista' }), notifications: () => ({ lida: false }),
    loss_reasons: () => ({ ativo: true, ordem: 0 }), pipeline_stages: () => ({ ativo: true, tipo: 'aberto', cor: '#3B82F6', sistema: false }), lead_statuses: () => ({ ativo: true, exige_motivo: false, cor: '#64748B', sistema: false }),
    commission_grades: () => ({ ativo: true, ordem: 0, cor: '#5B8DFF' }), implementation_stages: () => ({ ativo: true, cor: '#3B82F6', inicial: false, sistema: false, status_venda: null }),
    event_participants: () => ({ resposta: 'pendente', lembrete_enviado: false }),
  };

  // ==================================================================
  function create() {
    const T = {}; TABLES.forEach(t => T[t] = []);
    let U = null;           // usuário logado (auth.uid())
    let clock = null;       // relógio controlado durante o seed
    let seq = 0, auditSeq = 0;
    const rnd = mulberry32(20260930);
    const ctx = { motivo: '', metodo: '', obs: '' };
    const blobs = {};
    const listeners = [];
    const notifSubs = [];

    const now = () => new Date(clock ?? Date.now());
    const nowISO = () => now().toISOString();
    const today = () => isoDate(now());
    const uuid = () => { seq++; const r = () => Math.floor(rnd() * 0x10000).toString(16).padStart(4, '0'); return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${pad(seq % 100)}${r().slice(0, 2)}`; };

    // --------------------------- índices simples ---------------------
    const byId = (t, id) => id == null ? null : T[t].find(r => r[KEY[t] || 'id'] === id) || null;
    const prof = id => byId('profiles', id);
    const nome = id => (prof(id) || {}).nome || null;
    const stage = c => byId('pipeline_stages', c);
    const status = c => byId('lead_statuses', c);
    const setting = (k, d) => { const s = byId('settings', k); return s ? s.valor : d; };
    const grupo = c => (stage(c) || {}).grupo || null;
    const hojeSP = () => isoDate(now());
    function proxAniv(nasc, hoje) {
      if (!nasc) return null;
      const [, m, d] = nasc.split('-').map(Number); const y0 = Number(hoje.slice(0, 4));
      for (let i = 0; i <= 1; i++) { const y = y0 + i; const bis = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); const r = `${y}-${pad(m)}-${pad(m === 2 && d === 29 && !bis ? 28 : d)}`; if (r >= hoje) return r; }
      return null;
    }
    const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);
    const idadeEm = (nasc, data) => { if (!nasc || !data) return null; let i = Number(data.slice(0, 4)) - Number(nasc.slice(0, 4)); if (data.slice(5) < nasc.slice(5)) i--; return i; };
    const ultimoContatoCliente = id => T.activities.filter(a => a.client_id === id && !a.deleted_at && a.efetivo).map(a => a.realizado_em).sort().pop() || null;
    const etapasDoGrupo = (...g) => T.pipeline_stages.filter(s => g.includes(s.grupo)).map(s => s.codigo);
    const implStage = c => byId('implementation_stages', c);

    // --------------------------- identidade --------------------------
    function papel() { const p = prof(U); return p && p.status === 'ativo' && !p.deleted_at ? p.papel : null; }
    function perm(code) { const p = papel(); return p === 'admin' || (!!p && T.role_permissions.some(r => r.role === p && r.permission === code)); }
    function podeVer(c, s, g) { const p = papel(); return p === 'admin' || (p === 'gerente' && g === U) || (p === 'supervisor' && s === U) || (p === 'corretor' && c === U); }
    const E = r => podeVer(r.corretor_id, r.supervisor_id, r.gerente_id);
    function hier(uid) {
      const r = prof(uid); const o = { corretor_id: null, supervisor_id: null, gerente_id: null, team_id: null };
      if (!r) return o;
      if (r.papel === 'corretor') return { corretor_id: r.id, supervisor_id: r.supervisor_id, gerente_id: r.gerente_id, team_id: r.team_id };
      if (r.papel === 'supervisor') { const t = T.teams.filter(x => x.supervisor_id === r.id && !x.deleted_at).sort((a, b) => a.created_at < b.created_at ? -1 : 1)[0]; return { ...o, supervisor_id: r.id, gerente_id: r.gerente_id, team_id: t ? t.id : null }; }
      if (r.papel === 'gerente') return { ...o, gerente_id: r.id };
      return o;
    }
    function minhaGrade() { const p = prof(U); return p && p.papel === 'corretor' && p.status === 'ativo' ? p.grade_comissao : null; }
    function podeVerPerfil(uid) {
      const x = prof(uid); const p = papel(); const me = prof(U) || {};
      if (!x || x.status !== 'ativo' || x.deleted_at) return false;
      return x.id === U || p === 'admin' || (p === 'gerente' && x.gerente_id === U) || (p === 'supervisor' && x.supervisor_id === U) || x.id === me.supervisor_id || x.id === me.gerente_id;
    }
    const participa = ev => T.event_participants.some(x => x.event_id === ev && x.usuario_id === U);
    function podeVerEvento(ev) { const e = byId('events', ev); return participa(ev) || (!!e && !e.deleted_at && (E(e) || e.responsavel_id === U || e.created_by === U)); }
    function podeEditarEvento(ev) { const e = byId('events', ev); const p = papel(); return !!e && !e.deleted_at && (p === 'admin' || e.created_by === U || e.responsavel_id === U || (['gerente', 'supervisor'].includes(p) && E(e))); }
    function podeGerirCorretor(cid) {
      const c = prof(cid); const p = papel();
      if (!c || c.papel !== 'corretor' || c.status !== 'ativo' || c.deleted_at) return false;
      return p === 'admin' || (p === 'gerente' && c.gerente_id === U) || (p === 'supervisor' && c.supervisor_id === U);
    }

    // --------------------------- RLS: leitura ------------------------
    function canSee(t, r) {
      const p = papel();
      if (OWNER.includes(t)) {
        if (t === 'documents') return E(r) && (!r.sensivel || r.corretor_id === U || perm('documentos.sensiveis'));
        if (t === 'events') return E(r) || (!!p && (r.responsavel_id === U || r.created_by === U || participa(r.id)));
        if (t === 'tasks' || t === 'followups') return E(r) || (!!p && r.responsavel_id === U);
        return E(r);
      }
      switch (t) {
        case 'commissions': return p === 'admin' || (p === 'gerente' && r.gerente_id === U && perm('comissoes.ver')) || (p === 'supervisor' && r.supervisor_id === U && perm('comissoes.ver'));
        case 'lead_history': case 'lead_assignments': { const l = byId('leads', r.lead_id); return !!l && canSee('leads', l); }
        case 'implementation_events': { const i = byId('implementations', r.implementation_id); return !!i && canSee('implementations', i); }
        case 'dependents': { const c = byId('clients', r.client_id); return !!c && canSee('clients', c); }
        case 'profiles': { const me = prof(U) || {}; return r.id === U || p === 'admin' || (p === 'gerente' && r.gerente_id === U) || (p === 'supervisor' && r.supervisor_id === U) || (!!U && (r.id === me.supervisor_id || r.id === me.gerente_id)); }
        case 'teams': { const me = prof(U) || {}; return p === 'admin' || (p === 'gerente' && r.gerente_id === U) || (p === 'supervisor' && r.supervisor_id === U) || (!!me.team_id && r.id === me.team_id); }
        case 'distribution_rules': return ['admin', 'gerente', 'supervisor'].includes(p);
        case 'commission_rules': return perm('comissoes.ver');
        case 'goals': return E(r);
        case 'notifications': return r.usuario_id === U;
        case 'audit_logs': return perm('auditoria.ver');
        case 'integration_events': return p === 'admin';
        case 'product_commission_grid': return p === 'admin' || perm('comissoes.ver') || (r.beneficiario === minhaGrade()) || (r.beneficiario === 'supervisor' && p === 'supervisor');
        case 'event_participants': return !!p && (r.usuario_id === U || podeVerEvento(r.event_id));
        case 'user_presence': return r.usuario_id === U || (perm('presenca.ver') && canSee('profiles', prof(r.usuario_id) || {}));
        default: return p !== null;
      }
    }
    // --------------------------- RLS: escrita ------------------------
    function canWrite(t, r, op) {
      const p = papel();
      if (OWNER.includes(t)) {
        if (op === 'delete') return p === 'admin' || (t === 'notes' && r.autor_id === U);
        return E(r) || ((t === 'tasks' || t === 'events' || t === 'followups') && !!p && r.responsavel_id === U);
      }
      switch (t) {
        case 'commissions': return op === 'update' ? (p === 'admin' || (perm('comissoes.editar') && r.gerente_id === U)) : p === 'admin';
        case 'profiles': return op === 'update' ? (r.id === U || p === 'admin') : p === 'admin';
        case 'goals': return p === 'admin' || (p === 'gerente' && r.gerente_id === U && r.escopo !== 'gerente');
        case 'notifications': return op !== 'insert' && r.usuario_id === U;
        case 'dependents': { const c = byId('clients', r.client_id); return !!c && canSee('clients', c); }
        case 'lead_history': case 'lead_assignments': case 'implementation_events': case 'audit_logs': case 'event_participants': case 'user_presence': return false;
        default: return p === 'admin';
      }
    }

    // --------------------------- histórico / notificações -----------
    function historico(lead, tipo, titulo, descricao = null, dados = null) {
      if (!lead) return;
      T.lead_history.push({ id: uuid(), lead_id: lead, tipo, titulo, descricao, dados, usuario_id: U, created_at: nowISO() });
    }
    function notificar(uid, tipo, titulo, mensagem = null, link = null, ref = null) {
      if (!uid) return;
      const n = { id: uuid(), usuario_id: uid, tipo, titulo, mensagem, link, ref_id: ref, lida: false, created_at: nowISO() };
      T.notifications.push(n);
      if (notifSubs.length && clock == null) setTimeout(() => notifSubs.slice().forEach(f => f(n)), 0);
    }
    function jsonDiff(o, n, extra = []) {
      const out = {};
      const skip = new Set(['updated_at', 'updated_by', 'etapa_desde', 'status_desde', ...extra]);
      for (const k of Object.keys(n)) if (!skip.has(k) && JSON.stringify(n[k] ?? null) !== JSON.stringify(o[k] ?? null)) out[k] = { de: o[k] ?? null, para: n[k] ?? null };
      return out;
    }
    const ordem = e => (stage(e) || {}).ordem ?? 1;
    function avancarLead(leadId, st) {
      if (!leadId || !st) return;
      const l = byId('leads', leadId); const s = status(st);
      if (!l || !s) return;
      const tipo = (stage(l.etapa) || {}).tipo;
      if (tipo !== 'aberto' && !(st === 'implantado' && grupo(l.etapa) === 'ganho')) return;
      if (ordem(s.etapa) > ordem(l.etapa)) sysUpdate('leads', leadId, { status: st });
    }

    // ==================================================================
    // TRIGGERS
    // ==================================================================
    function carimbo(t, row, old) {
      if (!CARIMBO.includes(t)) return;
      if (!old) { row.created_at = row.created_at || nowISO(); row.created_by = row.created_by ?? U; row.updated_at = nowISO(); row.updated_by = row.updated_by ?? U; }
      else { row.created_at = old.created_at; row.created_by = old.created_by; row.updated_at = nowISO(); row.updated_by = U; }
    }
    function donoRaiz(t, row, old) {
      const p = papel();
      if (p === 'corretor') {
        if (!old) row.corretor_id = U;
        else if (row.corretor_id !== old.corretor_id) throw err('Corretor não pode transferir registros para outro responsável');
      }
      if (old && row.deleted_at !== old.deleted_at && U && !['admin', 'gerente', 'supervisor'].includes(p)) throw err('Sem permissão para excluir este registro');
      if (row.corretor_id) {
        const hh = hier(row.corretor_id);
        if (!hh.corretor_id) throw err('O responsável informado não é um corretor válido', '23514');
        row.supervisor_id = hh.supervisor_id; row.gerente_id = hh.gerente_id; row.team_id = hh.team_id;
      } else {
        if (!old && !row.supervisor_id && !row.gerente_id) { if (p === 'supervisor') row.supervisor_id = U; else if (p === 'gerente') row.gerente_id = U; }
        if (row.supervisor_id) { const hh = hier(row.supervisor_id); row.gerente_id = hh.gerente_id; row.team_id = hh.team_id; }
      }
    }
    function donoHerdado(t, row) {
      let par = null;
      if (row.lead_id) par = byId('leads', row.lead_id);
      else if (row.sale_id) par = byId('sales', row.sale_id);
      else if (row.client_id) par = byId('clients', row.client_id);
      let o;
      if (row.lead_id || row.sale_id || row.client_id) {
        o = par ? { corretor_id: par.corretor_id, supervisor_id: par.supervisor_id, gerente_id: par.gerente_id, team_id: par.team_id } : { corretor_id: null, supervisor_id: null, gerente_id: null, team_id: null };
        if (U && !podeVer(o.corretor_id, o.supervisor_id, o.gerente_id)) throw err('Sem permissão para vincular a este registro');
      } else o = hier(row.responsavel_id || U);
      Object.assign(row, o);
    }
    function donoMeta(row) {
      const d = new Date(row.mes + 'T12:00:00'); row.mes = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
      Object.assign(row, { corretor_id: null, supervisor_id: null, gerente_id: null, team_id: null });
      if (['corretor', 'supervisor', 'gerente'].includes(row.escopo) && row.usuario_id) Object.assign(row, hier(row.usuario_id));
      else if (row.escopo === 'equipe' && row.goal_team_id) { const tm = byId('teams', row.goal_team_id); if (tm) Object.assign(row, { supervisor_id: tm.supervisor_id, gerente_id: tm.gerente_id, team_id: tm.id }); }
    }
    function calcTemperatura(l) {
      let v = 0; const g = grupo(l.etapa); const n = now().getTime();
      if (l.tentativas_contato >= 1) v++; if (l.tentativas_contato >= 3) v++;
      if (g === 'negociacao') v += 2; else if (g === 'proposta') v += 3;
      if (l.valor_cotacao != null) v++;
      const uc = l.ultimo_contato_em ? new Date(l.ultimo_contato_em).getTime() : null;
      if (uc && uc > n - 24 * HOUR) v++;
      else if (new Date(l.ultimo_contato_em || l.entrada_em).getTime() < n - 72 * HOUR) v -= 2;
      if (l.proximo_followup_em) { const f = new Date(l.proximo_followup_em).getTime(); if (f >= n && f <= n + 24 * HOUR) v++; }
      if (l.prioritario) v++;
      if (new Date(l.entrada_em).getTime() > n - 24 * HOUR && !l.primeiro_contato_em) v += 2;
      return v >= 4 ? 'quente' : v >= 2 ? 'morno' : 'frio';
    }
    function leadsAntes(row, old) {
      row.cpf = digits(row.cpf); row.cnpj = digits(row.cnpj); row.telefone = digits(row.telefone); row.whatsapp = digits(row.whatsapp);
      row.email = row.email ? String(row.email).trim().toLowerCase() || null : null;
      row.uf = row.uf ? String(row.uf).trim().toUpperCase() || null : null;
      if (!old || row.status !== old.status) { const s = status(row.status); if (!s) throw err('Status inválido', '23503'); row.etapa = s.etapa; }
      else if (row.etapa !== old.etapa) {
        const st = stage(row.etapa); if (!st) throw err('Etapa inválida', '23503');
        const s = status(row.status);
        if (!s || s.etapa !== row.etapa) row.status = st.status_padrao || (T.lead_statuses.filter(x => x.etapa === row.etapa).sort((a, b) => a.ordem - b.ordem)[0] || {}).codigo;
        if (!row.status) throw err(`A etapa "${st.nome}" não tem nenhum status cadastrado`, '23514');
      }
      if (!old || row.etapa !== old.etapa) row.etapa_desde = nowISO();
      const s = status(row.status);
      if (s.exige_motivo && !row.loss_reason_id) throw err(`Informe o motivo da perda para marcar o lead como "${s.nome}"`, '23514');
      if (!s.exige_motivo) { row.loss_reason_id = null; row.motivo_perda_obs = null; }
      if (row.corretor_id && (!old || row.corretor_id !== old.corretor_id)) {
        row.assigned_at = nowISO(); row.assigned_by = U; row.distribuido_em = row.distribuido_em || nowISO(); row.alerta_nivel = 0;
        if (!row.primeiro_contato_em) row.sla_alerta = 0;
      }
      if (row.temperatura_auto) row.temperatura = calcTemperatura(row);
    }
    const CHILD_OF_LEAD = ['followups', 'tasks', 'quotes', 'proposals', 'activities', 'notes', 'documents', 'events', 'pendencies'];
    function leadsDepois(row, old) {
      const motivo = ctx.motivo || null, metodo = ctx.metodo || 'manual';
      let supAvisado = false;
      if (!old) {
        historico(row.id, 'criacao', 'Lead criado', null, { status: row.status });
        if (row.corretor_id) {
          T.lead_assignments.push({ id: uuid(), lead_id: row.id, corretor_anterior: null, corretor_novo: row.corretor_id, distribuido_por: U, metodo, motivo, created_at: nowISO() });
          const pc = prof(row.corretor_id); if (pc) pc.ultimo_lead_em = nowISO();
          if (row.corretor_id !== U) notificar(row.corretor_id, 'lead_recebido', 'Novo lead recebido', row.nome, '#/leads/' + row.id, row.id);
        } else if ((setting('distribuicao') || {}).automatica_ao_criar) {
          const e = escolherCorretor(row.id, null);
          if (e.corretor) atribuir(row.id, e.corretor, e.regra ? 'Regra: ' + e.regra : 'Rodízio', e.metodo);
          else if (row.supervisor_id) { notificar(row.supervisor_id, 'novo_lead', 'Novo lead na fila da equipe', row.nome, '#/leads/' + row.id, row.id); supAvisado = true; }
        } else if (row.supervisor_id) { notificar(row.supervisor_id, 'novo_lead', 'Novo lead na fila da equipe', row.nome, '#/leads/' + row.id, row.id); supAvisado = true; }
        const cfg = setting('notificacoes', {}); const corr = (byId('leads', row.id) || row).corretor_id;
        const txt = row.nome + (corr ? ' → ' + (nome(corr) || '') : '');
        if (!supAvisado && row.supervisor_id && row.supervisor_id !== U && cfg.novo_lead_supervisor !== false) notificar(row.supervisor_id, 'novo_lead', 'Novo lead na equipe', txt, '#/leads/' + row.id, row.id);
        if (row.gerente_id && row.gerente_id !== U && cfg.novo_lead_gerente === true) notificar(row.gerente_id, 'novo_lead', 'Novo lead na estrutura', txt, '#/leads/' + row.id, row.id);
        return;
      }
      if (row.corretor_id !== old.corretor_id) {
        T.lead_assignments.push({ id: uuid(), lead_id: row.id, corretor_anterior: old.corretor_id, corretor_novo: row.corretor_id, distribuido_por: U, metodo, motivo, created_at: nowISO() });
        historico(row.id, old.corretor_id ? 'responsavel' : 'distribuicao',
          old.corretor_id ? `Responsável alterado: ${nome(old.corretor_id) || '—'} → ${nome(row.corretor_id) || '—'}` : `Lead distribuído para ${nome(row.corretor_id) || '—'}`,
          motivo, { anterior: old.corretor_id, novo: row.corretor_id, metodo });
        if (row.corretor_id) { const pc = prof(row.corretor_id); if (pc) pc.ultimo_lead_em = nowISO(); notificar(row.corretor_id, 'lead_recebido', 'Lead atribuído a você', row.nome, '#/leads/' + row.id, row.id); }
        for (const t of CHILD_OF_LEAD) for (const c of T[t]) {
          if (c.lead_id !== row.id) continue;
          if (t === 'proposals' && c.client_id) continue;
          if (t === 'documents' && c.client_id) continue;
          if (t === 'pendencies' && c.sale_id) continue;
          if (t === 'followups' && c.status === 'pendente' && c.responsavel_id === old.corretor_id) c.responsavel_id = row.corretor_id;
          if (t === 'tasks' && ['aberta', 'em_andamento'].includes(c.status) && c.responsavel_id === old.corretor_id) c.responsavel_id = row.corretor_id;
          Object.assign(c, { corretor_id: row.corretor_id, supervisor_id: row.supervisor_id, gerente_id: row.gerente_id, team_id: row.team_id });
        }
      } else if (row.supervisor_id !== old.supervisor_id || row.gerente_id !== old.gerente_id) historico(row.id, 'responsavel', 'Estrutura responsável alterada', motivo);
      if (row.status !== old.status && (status(row.status) || {}).exige_motivo) {
        T.followups.filter(f => f.lead_id === row.id && f.status === 'pendente').forEach(f => { f.status = 'cancelado'; f.updated_at = nowISO(); });
        const prox = null; row.proximo_followup_em = prox;
      }
      if (row.status !== old.status) {
        const lr = byId('loss_reasons', row.loss_reason_id);
        historico(row.id, 'status', `Status: ${(status(old.status) || {}).nome || old.status} → ${(status(row.status) || {}).nome || row.status}`,
          lr ? 'Motivo: ' + lr.nome + (row.motivo_perda_obs ? ' — ' + row.motivo_perda_obs : '') : null, { de: old.status, para: row.status, etapa: row.etapa });
      }
      if (row.deleted_at && !old.deleted_at) historico(row.id, 'exclusao', 'Lead excluído (arquivado)');
      const d = jsonDiff(old, row, ['corretor_id', 'supervisor_id', 'gerente_id', 'team_id', 'status', 'etapa', 'temperatura', 'assigned_at', 'assigned_by', 'distribuido_em', 'alerta_nivel',
        'ultimo_contato_em', 'primeiro_contato_em', 'tentativas_contato', 'proximo_followup_em', 'deleted_at', 'valor_cotacao', 'client_id', 'loss_reason_id', 'motivo_perda_obs', 'sla_alerta']);
      if (Object.keys(d).length) historico(row.id, 'alteracao', 'Dados atualizados', Object.keys(d).join(', '), d);
    }
    function profilesAntes(row, old) {
      if (old && U && papel() !== 'admin') {
        for (const k of ['papel', 'status', 'team_id', 'supervisor_id', 'gerente_id', 'email', 'recebe_leads', 'deleted_at', 'grade_comissao'])
          if ((row[k] ?? null) !== (old[k] ?? null)) throw err('Apenas o administrador altera papel, status, grade ou hierarquia de usuários');
      }
      if (row.papel === 'corretor') {
        if (row.team_id) { const tm = byId('teams', row.team_id); row.supervisor_id = tm ? tm.supervisor_id : null; }
        row.gerente_id = (prof(row.supervisor_id) || {}).gerente_id || null;
        if (!row.grade_comissao) row.grade_comissao = (T.commission_grades.filter(g => g.ativo).sort((a, b) => (b.codigo === 'bronze') - (a.codigo === 'bronze') || a.ordem - b.ordem)[0] || {}).codigo || null;
      } else if (row.papel === 'supervisor') {
        row.supervisor_id = null;
        const tm = T.teams.filter(x => x.supervisor_id === row.id && !x.deleted_at).sort((a, b) => a.created_at < b.created_at ? -1 : 1)[0];
        row.team_id = tm ? tm.id : row.team_id || null;
      } else { row.supervisor_id = null; row.gerente_id = null; row.team_id = null; }
    }
    function realinharCorretor(cid) {
      const hh = hier(cid); if (!hh.corretor_id) return;
      for (const t of [...OWNER, 'commissions', 'goals']) for (const r of T[t]) if (r.corretor_id === cid) Object.assign(r, { supervisor_id: hh.supervisor_id, gerente_id: hh.gerente_id, team_id: hh.team_id });
    }
    function profilesDepois(row, old) {
      if (!old) return;
      if (row.papel === 'corretor' && (row.supervisor_id !== old.supervisor_id || row.gerente_id !== old.gerente_id || row.team_id !== old.team_id)) {
        realinharCorretor(row.id);
        audit('hierarquia', 'profiles', row.id, { supervisor_id: old.supervisor_id, gerente_id: old.gerente_id, team_id: old.team_id }, { supervisor_id: row.supervisor_id, gerente_id: row.gerente_id, team_id: row.team_id });
      }
      if (row.papel === 'supervisor' && row.gerente_id !== old.gerente_id) {
        T.teams.filter(x => x.supervisor_id === row.id).forEach(x => x.gerente_id = row.gerente_id);
        T.profiles.filter(x => x.supervisor_id === row.id && x.papel === 'corretor').forEach(x => sysUpdate('profiles', x.id, { gerente_id: row.gerente_id }));
        for (const t of ['leads', 'clients', 'sales', 'goals']) T[t].filter(x => x.supervisor_id === row.id && !x.corretor_id).forEach(x => x.gerente_id = row.gerente_id);
      }
    }
    function teamsAntes(row) { const s = prof(row.supervisor_id); if (s) row.gerente_id = s.gerente_id; }
    function teamsDepois(row, old) {
      if (!old || row.supervisor_id !== old.supervisor_id) {
        const s = prof(row.supervisor_id); if (s && s.papel === 'supervisor' && s.team_id !== row.id) sysUpdate('profiles', s.id, { team_id: row.id });
        T.profiles.filter(p => p.team_id === row.id && p.papel === 'corretor').forEach(p => sysUpdate('profiles', p.id, { supervisor_id: row.supervisor_id }));
      }
    }
    function atividadeDepois(row) {
      if (!row.lead_id) return;
      const l = byId('leads', row.lead_id);
      let st = l.status === 'novo' ? (row.efetivo ? 'contato_realizado' : 'tentativa_contato') : (l.status === 'tentativa_contato' && row.efetivo ? 'contato_realizado' : l.status);
      if (!status(st)) st = (T.pipeline_stages.filter(s => s.grupo === 'atendimento' && s.ativo && s.status_padrao).sort((a, b) => a.ordem - b.ordem)[0] || {}).status_padrao || l.status;
      sysUpdate('leads', l.id, {
        ultimo_contato_em: !l.ultimo_contato_em || row.realizado_em > l.ultimo_contato_em ? row.realizado_em : l.ultimo_contato_em,
        primeiro_contato_em: l.primeiro_contato_em || row.realizado_em, tentativas_contato: (l.tentativas_contato || 0) + 1, alerta_nivel: 0, status: st,
      });
      const tt = { ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', visita: 'Visita' }[row.tipo] || 'Contato';
      historico(row.lead_id, row.tipo, tt + (row.efetivo ? ' realizado' : ' — sem sucesso') + (row.resultado ? ` (${row.resultado})` : ''), row.descricao, { activity_id: row.id });
    }
    function followupDepois(row, old) {
      if (!row.lead_id) return;
      const prox = T.followups.filter(f => f.lead_id === row.lead_id && f.status === 'pendente' && !f.deleted_at).map(f => f.agendado_para).sort()[0] || null;
      sysUpdate('leads', row.lead_id, { proximo_followup_em: prox });
      if (!old) historico(row.lead_id, 'followup', 'Follow-up agendado para ' + new Date(row.agendado_para).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), row.observacao, { tipo: row.tipo });
      else if (row.status === 'concluido' && old.status !== 'concluido') historico(row.lead_id, 'followup', 'Follow-up concluído', row.resultado, { tipo: row.tipo });
    }
    function cotacaoDepois(row, old) {
      if (!row.lead_id) return;
      if (!old && row.status === 'elaboracao') avancarLead(row.lead_id, 'cotacao_elaboracao');
      if (row.status === 'enviada' && (!old || old.status !== 'enviada')) {
        row.enviada_em = row.enviada_em || nowISO();
        sysUpdate('leads', row.lead_id, { valor_cotacao: row.valor_mensal });
        historico(row.lead_id, 'cotacao', 'Cotação enviada', [(byId('operators', row.operator_id) || {}).nome, row.valor_mensal != null ? 'R$ ' + Number(row.valor_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : null].filter(Boolean).join(' — '), { quote_id: row.id });
        avancarLead(row.lead_id, 'cotacao_enviada');
      }
    }
    function propostaDepois(row, old) {
      if (!row.lead_id) return;
      if (!old || row.status !== old.status) {
        const rot = { enviada: 'Proposta enviada', em_analise: 'Proposta em análise', pendencia: 'Proposta com pendência', aprovada: 'Proposta aprovada', recusada: 'Proposta recusada', cancelada: 'Proposta cancelada' }[row.status] || 'Proposta registrada';
        historico(row.lead_id, 'proposta', rot + (row.numero ? ' nº ' + row.numero : ''), row.observacao, { proposal_id: row.id });
        avancarLead(row.lead_id, { enviada: 'proposta_enviada', em_analise: 'em_analise', pendencia: 'pendencia' }[row.status]);
      }
    }
    const vendaParaImpl = s => { const v = s === 'recusada' ? 'cancelada' : s; return (T.implementation_stages.filter(x => x.status_venda === v).sort((a, b) => b.ordem - a.ordem)[0] || {}).codigo || null; };
    const implParaVenda = s => (implStage(s) || {}).status_venda || null;
    const etapaImplInicial = () => ((T.implementation_stages.filter(x => x.inicial).sort((a, b) => a.ordem - b.ordem)[0]) || [...T.implementation_stages].sort((a, b) => a.ordem - b.ordem)[0] || {}).codigo || null;
    const money = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    function gerarComissoes(saleId) {
      const s = byId('sales', saleId); if (!s) return;
      const gradeCor = (prof(s.corretor_id) || {}).grade_comissao || null;
      const rd2 = v => Math.round(v * 100) / 100;
      const base0 = new Date((s.vigencia || s.data_venda) + 'T12:00:00');
      const G = T.product_commission_grid.filter(g => s.product_id && g.product_id === s.product_id);
      if (G.some(g => g.beneficiario === 'corretora')) {
        const pct = (b, p) => Number((G.find(g => g.beneficiario === b && g.parcela === p) || {}).percentual || 0);
        for (const p of [...new Set(G.map(g => g.parcela))].sort((a, b) => a - b)) {
          if (T.commissions.some(c => c.sale_id === s.id && c.parcela === p)) continue;
          const vp = rd2(s.valor_mensal * pct('corretora', p) / 100), vc = rd2(s.valor_mensal * pct(gradeCor, p) / 100), vs = s.supervisor_id ? rd2(s.valor_mensal * pct('supervisor', p) / 100) : 0;
          sysInsert('commissions', { sale_id: s.id, lead_id: s.lead_id, client_id: s.client_id, operator_id: s.operator_id, rule_id: null, parcela: p, valor_venda: s.valor_mensal, grade: gradeCor, origem_calculo: 'grade',
            comissao_prevista: vp, comissao_corretor: vc, comissao_supervisor: vs, comissao_empresa: rd2(vp - vc - vs),
            data_prevista: isoDate(new Date(base0.getFullYear(), base0.getMonth() + p, base0.getDate())), status: 'prevista' });
        }
        return;
      }
      const score = c => (c.corretor_id ? 16 : 0) + (c.product_id ? 8 : 0) + (c.campaign_id ? 4 : 0) + (c.supervisor_id ? 2 : 0) + (c.operator_id ? 1 : 0);
      const r = T.commission_rules.filter(c => c.ativo && (!c.operator_id || c.operator_id === s.operator_id) && (!c.product_id || c.product_id === s.product_id)
        && (!c.corretor_id || c.corretor_id === s.corretor_id) && (!c.supervisor_id || c.supervisor_id === s.supervisor_id) && (!c.campaign_id || c.campaign_id === s.campaign_id))
        .sort((a, b) => score(b) - score(a) || (a.created_at < b.created_at ? -1 : 1))[0];
      const pd = setting('comissao_padrao', { pct_empresa: 100, pct_corretor: 40, pct_supervisor: 10, parcelas: 1 });
      const pe = r ? r.pct_empresa : pd.pct_empresa, pc = r ? r.pct_corretor : pd.pct_corretor, ps = r ? r.pct_supervisor : pd.pct_supervisor, np = r ? r.parcelas : pd.parcelas;
      const base = new Date((s.vigencia || s.data_venda) + 'T12:00:00');
      const rd = v => Math.round(v * 100) / 100;
      for (let i = 1; i <= np; i++) {
        if (T.commissions.some(c => c.sale_id === s.id && c.parcela === i)) continue;
        const vp = rd(s.valor_mensal * pe / 100), vc = rd(s.valor_mensal * pc / 100), vs = rd(s.valor_mensal * ps / 100);
        sysInsert('commissions', { sale_id: s.id, lead_id: s.lead_id, client_id: s.client_id, operator_id: s.operator_id, rule_id: r ? r.id : null, parcela: i, valor_venda: s.valor_mensal, grade: gradeCor, origem_calculo: r ? 'regra' : 'padrao',
          comissao_prevista: vp, comissao_corretor: vc, comissao_supervisor: vs, comissao_empresa: rd(vp - vc - vs),
          data_prevista: isoDate(new Date(base.getFullYear(), base.getMonth() + i, base.getDate())), status: 'prevista' });
      }
    }
    function vendaAntes(row, old) {
      if (!old || row.status !== old.status) {
        row.status_desde = nowISO();
        if (row.status === 'cancelada') row.cancelada_em = row.cancelada_em || nowISO();
        if (row.status === 'implantada') row.data_implantacao = row.data_implantacao || today();
      }
      if (row.valor_total == null) row.valor_total = Math.round(Number(row.valor_mensal || 0) * 12 * 100) / 100;
      row.data_venda = row.data_venda || today();
    }
    function vendaDepois(row, old) {
      const vo = old ? old.status : null;
      if (!old) {
        if (!T.implementations.some(i => i.sale_id === row.id))
          sysInsert('implementations', { sale_id: row.id, lead_id: row.lead_id, client_id: row.client_id, etapa: vendaParaImpl(row.status) || etapaImplInicial(), responsavel_id: row.corretor_id });
        historico(row.lead_id, 'venda', 'Venda registrada', `${money(row.valor_mensal)}/mês — ${row.num_vidas} vida(s)`, { sale_id: row.id });
      }
      if (!old || row.status !== vo) {
        const ps = { proposta_enviada: 'enviada', implantada: 'aprovada' }[row.status] || row.status;
        T.proposals.filter(p => p.sale_id === row.id && !p.deleted_at && p.status !== ps).forEach(p => sysUpdate('proposals', p.id, { status: ps }));
        const vi = vendaParaImpl(row.status);
        if (old && vi) { const im = T.implementations.find(i => i.sale_id === row.id); if (im && implParaVenda(im.etapa) !== (row.status === 'recusada' ? 'cancelada' : row.status)) sysUpdate('implementations', im.id, { etapa: vi }); }
        if (['aprovada', 'implantada'].includes(row.status) && !['aprovada', 'implantada'].includes(vo)) {
          gerarComissoes(row.id); avancarLead(row.lead_id, 'aprovado');
          historico(row.lead_id, 'aprovacao', 'Venda aprovada pela operadora', null, { sale_id: row.id });
          notificar(row.corretor_id, 'venda_aprovada', 'Venda aprovada', money(row.valor_mensal) + '/mês', '#/vendas/' + row.id, row.id);
          notificar(row.supervisor_id, 'venda_aprovada', 'Venda aprovada na equipe', money(row.valor_mensal) + '/mês', '#/vendas/' + row.id, row.id);
        }
        if (row.status === 'implantada' && vo !== 'implantada') {
          const c = byId('clients', row.client_id); if (c && ['implantacao', 'pendencia'].includes(c.status)) sysUpdate('clients', c.id, { status: 'ativo', vigencia: c.vigencia || row.vigencia });
          avancarLead(row.lead_id, 'implantado');
          historico(row.lead_id, 'implantacao', 'Plano implantado', null, { sale_id: row.id });
          notificar(row.corretor_id, 'venda_implantada', 'Venda implantada', null, '#/vendas/' + row.id, row.id);
        }
        if (row.status === 'pendencia' && vo !== 'pendencia') {
          const c = byId('clients', row.client_id); if (c && c.status === 'implantacao') sysUpdate('clients', c.id, { status: 'pendencia' });
          historico(row.lead_id, 'pendencia', 'Venda com pendência na operadora', null, { sale_id: row.id });
          notificar(row.corretor_id, 'pendencia', 'Pendência na venda', null, '#/vendas/' + row.id, row.id);
        }
        if (['cancelada', 'recusada'].includes(row.status) && !['cancelada', 'recusada'].includes(vo)) {
          T.commissions.filter(c => c.sale_id === row.id && !['cancelada', 'estornada'].includes(c.status)).forEach(c => sysUpdate('commissions', c.id, { status: ['recebida', 'paga'].includes(c.status) ? 'estornada' : 'cancelada' }));
          if (row.status === 'cancelada') {
            const outras = T.sales.some(s2 => s2.client_id === row.client_id && s2.id !== row.id && ['aprovada', 'implantada'].includes(s2.status) && !s2.deleted_at);
            if (!outras && row.client_id) sysUpdate('clients', row.client_id, { status: 'cancelado' });
          }
          historico(row.lead_id, 'cancelamento', row.status === 'recusada' ? 'Venda recusada pela operadora' : 'Venda cancelada', row.motivo_cancelamento, { sale_id: row.id });
        }
      }
    }
    function implAntes(row, old) {
      if (!row.etapa) row.etapa = etapaImplInicial();
      if (!implStage(row.etapa)) throw err('Etapa de implantação inválida', '23503');
      if (!old || row.etapa !== old.etapa) row.etapa_desde = nowISO();
    }
    function implDepois(row, old) {
      if (!old || row.etapa !== old.etapa || row.protocolo !== old.protocolo)
        T.implementation_events.push({ id: uuid(), implementation_id: row.id, etapa_anterior: old ? old.etapa : null, etapa: row.etapa, descricao: ctx.obs || null, protocolo: row.protocolo || null, usuario_id: U, created_at: nowISO() });
      if (old && row.etapa !== old.etapa) { const vs = implParaVenda(row.etapa); const s = byId('sales', row.sale_id); if (vs && s && s.status !== vs) sysUpdate('sales', s.id, { status: vs }); }
    }
    function pendenciaDepois(row, old) {
      const lead = row.lead_id || (byId('sales', row.sale_id) || {}).lead_id;
      if (!old) { historico(lead, 'pendencia', 'Pendência aberta', row.descricao, { pendency_id: row.id }); notificar(row.corretor_id, 'pendencia', 'Nova pendência', row.descricao, row.sale_id ? '#/vendas/' + row.sale_id : null, row.id); }
      else if (row.status === 'resolvida' && old.status !== 'resolvida') { row.resolvida_em = row.resolvida_em || nowISO(); historico(lead, 'pendencia', 'Pendência resolvida', row.resolucao || row.descricao, { pendency_id: row.id }); }
    }
    function autor(t, row, old) {
      if (!old) { if (t === 'notes') row.autor_id = U; else if (t === 'documents') row.enviado_por = U; else if (t === 'activities') { row.usuario_id = row.usuario_id || U; row.realizado_em = row.realizado_em || nowISO(); } }
      if (t === 'followups' && row.status === 'concluido') row.concluido_em = row.concluido_em || nowISO();
      if (t === 'tasks' && row.status === 'concluida') row.concluida_em = row.concluida_em || nowISO();
    }
    const AUDIT_SKIP = ['ultimo_lead_em', 'ultimo_contato_em', 'primeiro_contato_em', 'tentativas_contato', 'proximo_followup_em', 'temperatura', 'alerta_nivel', 'etapa_desde', 'status_desde'];
    function audit(acao, tabela, id, ant, novo) {
      T.audit_logs.push({ id: ++auditSeq, usuario_id: U, acao, tabela, registro_id: id, anterior: ant, novo, created_at: nowISO() });
      if (T.audit_logs.length > 4000) T.audit_logs.splice(0, 500);
    }
    function auditoria(t, row, old, op) {
      if (!AUDIT.includes(t)) return;
      if (op === 'INSERT') return audit('criacao', t, row.id || null, null, clone(row));
      if (op === 'DELETE') return audit('exclusao', t, old.id || null, clone(old), null);
      const d = jsonDiff(old, row, AUDIT_SKIP); const ks = Object.keys(d); if (!ks.length) return;
      let acao = d.deleted_at ? 'exclusao' : d.corretor_id ? 'transferencia' : d.status ? 'status' : d.papel ? 'permissao' : 'edicao';
      if (t === 'commissions') acao = 'comissao_' + acao;
      audit(acao, t, row.id || null, Object.fromEntries(ks.map(k => [k, d[k].de])), Object.fromEntries(ks.map(k => [k, d[k].para])));
    }
    function statusDesde(row, old) { if (!old || row.status !== old.status) row.status_desde = nowISO(); }

    // ---- etapas / status / implantação editáveis (v1.1)
    function etapaCrmAntes(row, old) {
      if (!row.grupo) row.grupo = row.tipo === 'ganho' ? 'ganho' : row.tipo === 'perdido' ? 'perdido' : 'atendimento';
      if (!GRUPOS.includes(row.grupo)) throw err('Grupo inválido', '23514');
      row.tipo = row.grupo === 'ganho' ? 'ganho' : row.grupo === 'perdido' ? 'perdido' : 'aberto';
      if (!old) { if (!/^[a-z0-9_]{2,40}$/.test(row.codigo || '')) throw err('Código inválido (use letras minúsculas, números e _)', '23514'); return; }
      if (row.codigo !== old.codigo) throw err('O código da etapa não pode ser alterado', '23514');
      if (old.sistema && row.grupo !== old.grupo) throw err(`A etapa "${old.nome}" é usada pelas automações; o grupo dela não pode mudar`, '23514');
      if (old.ativo && !row.ativo && T.leads.some(l => l.etapa === old.codigo && !l.deleted_at)) throw err(`Mova os leads da etapa "${old.nome}" antes de desativá-la`, '23514');
    }
    function etapaCrmDepois(row, old) {
      if (old || T.lead_statuses.some(x => x.etapa === row.codigo)) return;
      let cod = row.codigo; if (status(cod)) cod += '_st';
      T.lead_statuses.push({ codigo: cod, nome: row.nome, etapa: row.codigo, ordem: Math.max(0, ...T.lead_statuses.map(x => x.ordem)) + 1, cor: row.cor, exige_motivo: row.grupo === 'perdido', ativo: true, sistema: false });
      if (!row.status_padrao) row.status_padrao = cod;
    }
    function statusLeadAntes(row, old) {
      if (!old) { if (!stage(row.etapa)) throw err('Etapa inválida', '23503'); if (!/^[a-z0-9_]{2,40}$/.test(row.codigo || '')) throw err('Código inválido (use letras minúsculas, números e _)', '23514'); return; }
      if (row.codigo !== old.codigo) throw err('O código do status não pode ser alterado', '23514');
      if (old.sistema && (row.etapa !== old.etapa || row.exige_motivo !== old.exige_motivo)) throw err(`O status "${old.nome}" é usado pelas automações; só nome, cor e ordem podem mudar`, '23514');
    }
    function statusLeadDepois(row, old) {
      if (old && row.etapa !== old.etapa) T.leads.filter(l => l.status === row.codigo && l.etapa !== row.etapa).forEach(l => sysUpdate('leads', l.id, { etapa: row.etapa }));
    }
    function etapaImplAntes(row, old) {
      if (!old && !/^[a-z0-9_]{2,40}$/.test(row.codigo || '')) throw err('Código inválido (use letras minúsculas, números e _)', '23514');
      if (old && row.codigo !== old.codigo) throw err('O código da etapa não pode ser alterado', '23514');
      if (old && old.sistema && row.status_venda !== old.status_venda) throw err(`A etapa "${old.nome}" é usada pelas automações; só nome, cor e ordem podem mudar`, '23514');
      if (row.inicial) T.implementation_stages.forEach(x => { if (x.codigo !== row.codigo) x.inicial = false; });
      row.updated_at = nowISO();
    }
    function gradeAntes(row, old) {
      if (!old && (!/^[a-z0-9_]{2,30}$/.test(row.codigo || '') || ['corretora', 'supervisor'].includes(row.codigo))) throw err('Código de grade inválido', '23514');
      if (old && row.codigo !== old.codigo) throw err('O código da grade não pode ser alterado', '23514');
      row.updated_at = nowISO(); if (!old) row.created_at = nowISO();
    }
    function eventoAntes(row, old) { if (old && (row.inicio !== old.inicio || row.lembrete_min !== old.lembrete_min)) row.lembrete_enviado_em = null; }
    function eventoDepois(row, old) {
      if (!old) return;
      const quando = new Date(row.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const P = T.event_participants.filter(x => x.event_id === row.id && x.usuario_id !== U && x.resposta !== 'recusado');
      if (row.deleted_at && !old.deleted_at) P.forEach(x => notificar(x.usuario_id, 'evento_cancelado', 'Cancelado: ' + row.titulo, quando, '#/agenda', row.id));
      else if (!row.deleted_at && (row.inicio !== old.inicio || row.local !== old.local || row.link_reuniao !== old.link_reuniao || row.titulo !== old.titulo)) {
        if (row.inicio !== old.inicio) T.event_participants.filter(x => x.event_id === row.id).forEach(x => x.lembrete_enviado = false);
        P.forEach(x => notificar(x.usuario_id, 'evento_alterado', 'Alterado: ' + row.titulo, 'Agora em ' + quando + (row.local ? ' · ' + row.local : ''), '#/agenda?evento=' + row.id, row.id));
      }
    }

    function before(t, row, old) {
      carimbo(t, row, old);
      if (['notes', 'documents', 'activities', 'followups', 'tasks'].includes(t)) autor(t, row, old);
      if (ROOT.includes(t)) donoRaiz(t, row, old);
      if (CHILD.includes(t)) donoHerdado(t, row);
      if (t === 'goals') donoMeta(row);
      if (t === 'leads') leadsAntes(row, old);
      if (t === 'profiles') profilesAntes(row, old);
      if (t === 'teams') teamsAntes(row);
      if (t === 'proposals') { statusDesde(row, old); if (!old && !row.enviada_em && row.status !== 'rascunho') row.enviada_em = nowISO(); }
      if (t === 'sales') vendaAntes(row, old);
      if (t === 'implementations') implAntes(row, old);
      if (t === 'pipeline_stages') etapaCrmAntes(row, old);
      if (t === 'lead_statuses') statusLeadAntes(row, old);
      if (t === 'implementation_stages') etapaImplAntes(row, old);
      if (t === 'commission_grades') gradeAntes(row, old);
      if (t === 'events') eventoAntes(row, old);
    }
    function after(t, row, old) {
      if (t === 'leads') leadsDepois(row, old);
      if (t === 'profiles') profilesDepois(row, old);
      if (t === 'teams') teamsDepois(row, old);
      if (t === 'activities' && !old) atividadeDepois(row);
      if (t === 'followups') followupDepois(row, old);
      if (t === 'quotes') cotacaoDepois(row, old);
      if (t === 'proposals') propostaDepois(row, old);
      if (t === 'sales') vendaDepois(row, old);
      if (t === 'implementations') implDepois(row, old);
      if (t === 'pendencies') pendenciaDepois(row, old);
      if (t === 'pipeline_stages') etapaCrmDepois(row, old);
      if (t === 'lead_statuses') statusLeadDepois(row, old);
      if (t === 'events') eventoDepois(row, old);
      if (t === 'documents' && !old) historico(row.lead_id || (byId('sales', row.sale_id) || {}).lead_id, 'documento', 'Documento anexado: ' + row.nome_arquivo, row.tipo, { document_id: row.id });
      auditoria(t, row, old, old ? 'UPDATE' : 'INSERT');
    }

    // --------------------------- escrita -----------------------------
    function doInsert(t, data, sys) {
      if (!T[t]) throw err('Tabela desconhecida: ' + t, '42P01');
      const k = KEY[t] || 'id';
      const row = { ...(DEFAULTS[t] ? DEFAULTS[t]() : {}), ...clone(data) };
      if (k === 'id' && !row.id) row.id = uuid();
      if (T[t].some(r => r[k] === row[k])) throw err('Registro duplicado.', '23505');
      before(t, row, null);
      if (!sys && !canWrite(t, row, 'insert')) throw err('new row violates row-level security policy for table "' + t + '"');
      T[t].push(row);
      after(t, row, null);
      return row;
    }
    function doUpdate(t, id, patch, sys, key) {
      const k = key || KEY[t] || 'id';
      const cur = T[t].find(r => r[k] === id);
      if (!cur) return null;
      if (!sys && (!canSee(t, cur) || !canWrite(t, cur, 'update'))) return null;
      const old = clone(cur);
      const row = { ...clone(cur), ...clone(patch) };
      before(t, row, old);
      if (!sys && !canWrite(t, row, 'update')) throw err('new row violates row-level security policy for table "' + t + '"');
      Object.keys(cur).forEach(x => delete cur[x]); Object.assign(cur, row);
      after(t, cur, old);
      return cur;
    }
    function doDelete(t, id, sys, key) {
      const k = key || KEY[t] || 'id';
      const i = T[t].findIndex(r => r[k] === id); if (i < 0) return false;
      const cur = T[t][i];
      if (!sys && (!canSee(t, cur) || !canWrite(t, cur, 'delete'))) return false;
      T[t].splice(i, 1);
      auditoria(t, null, cur, 'DELETE');
      return true;
    }
    const sysInsert = (t, d) => doInsert(t, d, true);
    const sysUpdate = (t, id, p) => doUpdate(t, id, p, true);

    // ==================================================================
    // VIEWS
    // ==================================================================
    const nm = (t, id) => (byId(t, id) || {}).nome || null;
    const hoursSince = iso => iso ? Math.round((now() - new Date(iso)) / HOUR) : null;
    const sameDay = (a, b) => isoDate(new Date(a)) === isoDate(new Date(b));
    const VIEWS = {
      v_profiles: ['profiles', r => { const g = byId('commission_grades', r.grade_comissao) || {}; return { ...r, team_nome: nm('teams', r.team_id), supervisor_nome: nome(r.supervisor_id), gerente_nome: nome(r.gerente_id), papel_nome: (byId('roles', r.papel) || {}).nome, grade_nome: g.nome || null, grade_cor: g.cor || null }; }],
      v_presence: ['profiles', r => {
        if (r.status !== 'ativo') return null;
        const pr = T.user_presence.find(x => x.usuario_id === r.id && canSee('user_presence', x)) || {};
        const vis = pr.visto_em ? new Date(pr.visto_em).getTime() : null; const n = now().getTime();
        const sit = !vis ? 'offline' : (pr.saiu_em && pr.saiu_em >= pr.visto_em) ? 'offline' : vis > n - 2 * 60e3 ? 'online' : vis > n - 15 * 60e3 ? 'ausente' : 'offline';
        const hoje = new Date(now()); hoje.setHours(0, 0, 0, 0);
        return { id: r.id, nome: r.nome, email: r.email, papel: r.papel, team_id: r.team_id, team_nome: nm('teams', r.team_id), supervisor_id: r.supervisor_id, supervisor_nome: nome(r.supervisor_id), gerente_id: r.gerente_id,
          visto_em: pr.visto_em || null, entrou_em: pr.entrou_em || null, saiu_em: pr.saiu_em || null, tela: pr.tela || null, dispositivo: pr.dispositivo || null, situacao: sit,
          atividades_hoje: T.activities.filter(a => a.usuario_id === r.id && !a.deleted_at && new Date(a.realizado_em) >= hoje).length };
      }],
      v_teams: ['teams', r => ({ ...r, supervisor_nome: nome(r.supervisor_id), gerente_nome: nome(r.gerente_id), corretores: T.profiles.filter(p => p.team_id === r.id && p.papel === 'corretor' && !p.deleted_at).length })],
      v_leads: ['leads', r => {
        const st = status(r.status) || {}, ps = stage(r.etapa) || {};
        const im = T.implementations.filter(i => i.lead_id === r.id && !i.deleted_at && canSee('implementations', i) && !(byId('sales', i.sale_id) || { deleted_at: 1 }).deleted_at)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
        const ims = im ? implStage(im.etapa) || {} : {};
        return { ...r, implantacao_id: im ? im.id : null, implantacao_sale_id: im ? im.sale_id : null, implantacao_etapa: im ? im.etapa : null,
          implantacao_etapa_nome: ims.nome || null, implantacao_etapa_cor: ims.cor || null, implantacao_status_venda: ims.status_venda || null,
          corretor_nome: nome(r.corretor_id), supervisor_nome: nome(r.supervisor_id), gerente_nome: nome(r.gerente_id), team_nome: nm('teams', r.team_id),
          operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id), origem_nome: nm('lead_sources', r.source_id), campanha_nome: nm('campaigns', r.campaign_id),
          status_nome: st.nome, status_cor: st.cor, etapa_nome: ps.nome, etapa_ordem: ps.ordem, etapa_tipo: ps.tipo, motivo_perda_nome: nm('loss_reasons', r.loss_reason_id),
          horas_na_etapa: hoursSince(r.etapa_desde), etapa_grupo: ps.grupo || null,
          minutos_primeiro_contato: r.primeiro_contato_em ? Math.round((new Date(r.primeiro_contato_em) - new Date(r.distribuido_em || r.entrada_em)) / 60000) : null,
          minutos_aguardando: !r.primeiro_contato_em && r.corretor_id ? Math.round((now() - new Date(r.assigned_at || r.distribuido_em || r.entrada_em)) / 60000) : null };
      }],
      v_clients: ['clients', r => ({ ...r, corretor_nome: nome(r.corretor_id), supervisor_nome: nome(r.supervisor_id), gerente_nome: nome(r.gerente_id), operadora_nome: nm('operators', r.operator_id),
        produto_nome: nm('products', r.product_id), dependentes: T.dependents.filter(d => d.client_id === r.id && !d.deleted_at).length })],
      v_sales: ['sales', r => { const c = byId('clients', r.client_id) || {}; const im = T.implementations.find(i => i.sale_id === r.id) || {};
        return { ...r, cliente_nome: c.nome || null, cliente_cpf: c.cpf || null, cliente_cnpj: c.cnpj || null, corretor_nome: nome(r.corretor_id), supervisor_nome: nome(r.supervisor_id), gerente_nome: nome(r.gerente_id),
          operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id), origem_nome: nm('lead_sources', r.source_id), campanha_nome: nm('campaigns', r.campaign_id),
          implantacao_etapa: im.etapa || null, implantacao_etapa_nome: (implStage(im.etapa) || {}).nome || null, team_nome: nm('teams', r.team_id),
          pendencias_abertas: T.pendencies.filter(p => p.sale_id === r.id && p.status === 'aberta' && !p.deleted_at).length }; }],
      v_quotes: ['quotes', r => ({ ...r, lead_nome: nm('leads', r.lead_id), operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id), corretor_nome: nome(r.corretor_id) })],
      v_proposals: ['proposals', r => ({ ...r, nome_contato: nm('leads', r.lead_id) || nm('clients', r.client_id), lead_nome: nm('leads', r.lead_id), cliente_nome: nm('clients', r.client_id),
        operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id), corretor_nome: nome(r.corretor_id), horas_no_status: hoursSince(r.status_desde) })],
      v_implementations: ['implementations', r => { const s = byId('sales', r.sale_id) || {};
        return { ...r, operator_id: s.operator_id, product_id: s.product_id, valor_mensal: s.valor_mensal, num_vidas: s.num_vidas, numero_proposta: s.numero_proposta, data_venda: s.data_venda, venda_status: s.status, vigencia: s.vigencia,
          cliente_nome: nm('clients', r.client_id), operadora_nome: nm('operators', s.operator_id), produto_nome: nm('products', s.product_id), corretor_nome: nome(r.corretor_id), responsavel_nome: nome(r.responsavel_id),
          pendencias_abertas: T.pendencies.filter(p => p.sale_id === r.sale_id && p.status === 'aberta' && !p.deleted_at).length, horas_na_etapa: hoursSince(r.etapa_desde), _skip: !!s.deleted_at,
          etapa_nome: (implStage(r.etapa) || {}).nome || r.etapa, etapa_cor: (implStage(r.etapa) || {}).cor || null, etapa_ordem: (implStage(r.etapa) || {}).ordem ?? null, etapa_status_venda: (implStage(r.etapa) || {}).status_venda || null }; }],
      v_implementation_events: ['implementation_events', r => ({ ...r, usuario_nome: nome(r.usuario_id) }), true],
      v_pendencies: ['pendencies', r => ({ ...r, nome_contato: nm('clients', r.client_id) || nm('leads', r.lead_id), corretor_nome: nome(r.corretor_id), atrasada: r.status === 'aberta' && r.prazo && r.prazo < today() })],
      v_followups: ['followups', r => { const l = byId('leads', r.lead_id), c = byId('clients', r.client_id);
        const sit = r.status !== 'pendente' ? r.status : new Date(r.agendado_para) < now() ? 'atrasado' : sameDay(r.agendado_para, now()) ? 'hoje' : 'proximo';
        return { ...r, nome_contato: (l || c || {}).nome || null, telefone_contato: l ? (l.whatsapp || l.telefone) : c ? (c.whatsapp || c.telefone) : null, lead_temperatura: l ? l.temperatura : null,
          responsavel_nome: nome(r.responsavel_id), corretor_nome: nome(r.corretor_id), situacao: sit }; }],
      v_tasks: ['tasks', r => ({ ...r, nome_contato: nm('leads', r.lead_id) || nm('clients', r.client_id), responsavel_nome: nome(r.responsavel_id), criado_por_nome: nome(r.created_by),
        atrasada: ['aberta', 'em_andamento'].includes(r.status) && !!r.prazo && new Date(r.prazo) < now() })],
      v_events: ['events', r => { const P = T.event_participants.filter(x => x.event_id === r.id);
        return { ...r, nome_contato: nm('leads', r.lead_id) || nm('clients', r.client_id), responsavel_nome: nome(r.responsavel_id), organizador_nome: nome(r.created_by),
          convidados: P.length, confirmados: P.filter(x => x.resposta === 'aceito').length, minha_resposta: (P.find(x => x.usuario_id === U) || {}).resposta || null }; }],
      v_event_participants: ['event_participants', r => { const pf = prof(r.usuario_id) || {}; return { ...r, usuario_nome: pf.nome || null, usuario_email: pf.email || null, usuario_papel: pf.papel || null, usuario_equipe: nm('teams', pf.team_id) }; }, true],
      v_relacionamento: ['clients', r => {
        if (r.status === 'cancelado' || r.anonimizado_em) return null;
        const hoje = hojeSP(); const uc = ultimoContatoCliente(r.id); const pa = proxAniv(r.data_nascimento, hoje);
        return { id: r.id, nome: r.nome, tipo_pessoa: r.tipo_pessoa, razao_social: r.razao_social, whatsapp: r.whatsapp, telefone: r.telefone, email: r.email, data_nascimento: r.data_nascimento,
          status: r.status, vigencia: r.vigencia, num_vidas: r.num_vidas, corretor_id: r.corretor_id, supervisor_id: r.supervisor_id, gerente_id: r.gerente_id, team_id: r.team_id, created_at: r.created_at,
          lembrete_contato_em: r.lembrete_contato_em || null, corretor_nome: nome(r.corretor_id), operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id),
          ultimo_contato_em: uc, dias_sem_contato: diasEntre(isoDate(new Date(uc || r.created_at)), hoje), proximo_aniversario: pa, dias_para_aniversario: pa ? diasEntre(hoje, pa) : null,
          idade_no_aniversario: pa ? idadeEm(r.data_nascimento, pa) : null };
      }],
      v_aniversarios_dependentes: ['dependents', r => {
        const c = byId('clients', r.client_id); if (!c || c.deleted_at || c.status === 'cancelado' || !r.data_nascimento || r.status === 'cancelado') return null;
        const hoje = hojeSP(); const pa = proxAniv(r.data_nascimento, hoje);
        return { id: r.id, nome: r.nome, parentesco: r.parentesco, data_nascimento: r.data_nascimento, client_id: c.id, cliente_nome: c.nome, whatsapp: c.whatsapp, telefone: c.telefone,
          corretor_id: c.corretor_id, supervisor_id: c.supervisor_id, gerente_id: c.gerente_id, team_id: c.team_id, corretor_nome: nome(c.corretor_id), operadora_nome: nm('operators', c.operator_id),
          proximo_aniversario: pa, dias_para_aniversario: diasEntre(hoje, pa), idade_no_aniversario: idadeEm(r.data_nascimento, pa) };
      }],
      v_commission_grid: ['product_commission_grid', r => { const p = byId('products', r.product_id); if (!p || p.deleted_at) return null; const g = byId('commission_grades', r.beneficiario) || {};
        return { ...r, produto_nome: p.nome, operator_id: p.operator_id, operadora_nome: nm('operators', p.operator_id), produto_tipo: p.tipo, produto_ativo: p.ativo,
          beneficiario_nome: r.beneficiario === 'corretora' ? 'Corretora' : r.beneficiario === 'supervisor' ? 'Supervisor' : g.nome || r.beneficiario, grade_ordem: g.ordem ?? null }; }, true],
      v_activities: ['activities', r => ({ ...r, nome_contato: nm('leads', r.lead_id) || nm('clients', r.client_id), usuario_nome: nome(r.usuario_id) })],
      v_notes: ['notes', r => ({ ...r, autor_nome: nome(r.autor_id) })],
      v_documents: ['documents', r => ({ ...r, enviado_por_nome: nome(r.enviado_por) })],
      v_lead_history: ['lead_history', r => ({ ...r, usuario_nome: nome(r.usuario_id) || 'Sistema' }), true],
      v_lead_assignments: ['lead_assignments', r => ({ ...r, anterior_nome: nome(r.corretor_anterior), novo_nome: nome(r.corretor_novo), distribuido_por_nome: nome(r.distribuido_por) || 'Sistema' }), true],
      v_commissions: ['commissions', r => { const s = byId('sales', r.sale_id) || {}; return { ...r, cliente_nome: nm('clients', r.client_id), operadora_nome: nm('operators', r.operator_id), data_venda: s.data_venda, numero_proposta: s.numero_proposta, corretor_nome: nome(r.corretor_id), supervisor_nome: nome(r.supervisor_id),
        grade_nome: (byId('commission_grades', r.grade) || {}).nome || null, produto_nome: nm('products', s.product_id) }; }],
      v_products: ['products', r => ({ ...r, operadora_nome: nm('operators', r.operator_id), grade_parcelas: new Set(T.product_commission_grid.filter(g => g.product_id === r.id && g.beneficiario === 'corretora').map(g => g.parcela)).size })],
      v_campaigns: ['campaigns', r => ({ ...r, origem_nome: nm('lead_sources', r.source_id) })],
      v_goals: ['goals', r => ({ ...r, usuario_nome: nome(r.usuario_id), equipe_nome: nm('teams', r.goal_team_id), operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id) })],
      v_dependents: ['dependents', r => ({ ...r, produto_nome: nm('products', r.product_id) })],
      v_audit_logs: ['audit_logs', r => ({ ...r, usuario_nome: nome(r.usuario_id) || 'Sistema' }), true],
      v_distribution_rules: ['distribution_rules', r => ({ ...r, origem_nome: nm('lead_sources', r.source_id), campanha_nome: nm('campaigns', r.campaign_id), produto_nome: nm('products', r.product_id), equipe_nome: nm('teams', r.team_id), corretor_nome: nome(r.corretor_id) }), true],
      v_commission_rules: ['commission_rules', r => ({ ...r, operadora_nome: nm('operators', r.operator_id), produto_nome: nm('products', r.product_id), corretor_nome: nome(r.corretor_id), supervisor_nome: nome(r.supervisor_id), campanha_nome: nm('campaigns', r.campaign_id) }), true],
      managers: ['profiles', r => r.papel === 'gerente' ? r : null], supervisors: ['profiles', r => r.papel === 'supervisor' ? r : null], brokers: ['profiles', r => r.papel === 'corretor' ? r : null],
    };
    function rowsOf(name) {
      if (VIEWS[name]) {
        const [base, map, keepDeleted] = VIEWS[name];
        const out = [];
        for (const r of T[base]) {
          if (!keepDeleted && r.deleted_at) continue;
          if (!canSee(base, r)) continue;
          const v = map(r); if (!v || v._skip) continue;
          out.push(v);
        }
        return out;
      }
      if (!T[name]) throw err('Tabela ou view desconhecida: ' + name, '42P01');
      return T[name].filter(r => canSee(name, r));
    }

    // --------------------------- motor de consulta -------------------
    const cmp = (a, b) => { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; if (typeof a === 'number' && typeof b === 'number') return a - b; const na = Number(a), nb = Number(b); if (!isNaN(na) && !isNaN(nb) && a !== '' && b !== '' && typeof a !== 'boolean') return na - nb; return String(a).localeCompare(String(b), 'pt-BR'); };
    const eqv = (a, b) => a != null && String(a) === String(b);
    const likeRe = p => new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
    function matchOp(v, op, x) {
      switch (op) {
        case 'eq': return eqv(v, x); case 'neq': return !eqv(v, x); case 'in': return (Array.isArray(x) ? x : String(x).split(',')).some(y => eqv(v, y));
        case 'gte': return v != null && cmp(v, x) >= 0; case 'lte': return v != null && cmp(v, x) <= 0; case 'gt': return v != null && cmp(v, x) > 0; case 'lt': return v != null && cmp(v, x) < 0;
        case 'is': return v == null; case 'ilike': return v != null && likeRe(x).test(String(v)); default: return false;
      }
    }
    function query(rows, o = {}) {
      let r = rows;
      const f = (obj, op) => { for (const [c, v] of Object.entries(obj || {})) r = r.filter(x => matchOp(x[c], op, v)); };
      f(o.eq, 'eq'); f(o.neq, 'neq'); f(o.in, 'in'); f(o.gte, 'gte'); f(o.lte, 'lte'); f(o.gt, 'gt'); f(o.lt, 'lt'); f(o.ilike, 'ilike');
      for (const c of o.isNull || []) r = r.filter(x => x[c] == null);
      for (const c of o.notNull || []) r = r.filter(x => x[c] != null);
      if (o.or && o.or.length) r = r.filter(x => o.or.some(([c, op, v]) => matchOp(x[c], op, v)));
      if (o.search && o.search.term && o.search.term.trim()) { const re = likeRe('%' + o.search.term.trim() + '%'); r = r.filter(x => o.search.cols.some(c => x[c] != null && re.test(String(x[c])))); }
      if (o.order && o.order.length) r = [...r].sort((a, b) => { for (const [c, asc] of o.order) { const d = cmp(a[c], b[c]); if (d) return asc ? d : -d; } return 0; });
      const count = r.length;
      if (o.limit) r = r.slice(o.offset || 0, (o.offset || 0) + o.limit);
      return { rows: clone(r), count };
    }

    // ==================================================================
    // RPCs
    // ==================================================================
    function atribuir(lead, corretor, motivo, metodo) { ctx.motivo = motivo || ''; ctx.metodo = metodo || 'manual'; try { sysUpdate('leads', lead, { corretor_id: corretor }); } finally { ctx.motivo = ''; ctx.metodo = ''; } }
    function escolherCorretor(leadId, excluir) {
      const l = byId('leads', leadId); const p = papel();
      const score = d => (d.campaign_id ? 1 : 0) + (d.product_id ? 1 : 0) + (d.source_id ? 1 : 0) + (d.uf ? 1 : 0);
      const r = T.distribution_rules.filter(d => d.ativo && (!d.source_id || d.source_id === l.source_id) && (!d.campaign_id || d.campaign_id === l.campaign_id)
        && (!d.product_id || d.product_id === l.product_id) && (!d.uf || d.uf === l.uf)).sort((a, b) => a.prioridade - b.prioridade || score(b) - score(a))[0];
      if (r && r.metodo === 'fixo' && r.corretor_id && r.corretor_id !== excluir) return { corretor: r.corretor_id, metodo: 'regra', regra: r.nome };
      const cand = T.profiles.filter(c => c.papel === 'corretor' && c.status === 'ativo' && !c.deleted_at && c.recebe_leads && c.id !== excluir
        && (!r || !r.team_id || c.team_id === r.team_id) && (!l.supervisor_id || c.supervisor_id === l.supervisor_id) && (!l.gerente_id || c.gerente_id === l.gerente_id)
        && (!r || r.metodo !== 'disponibilidade' || c.disponivel)
        && (!U || p === 'admin' || (p === 'gerente' && c.gerente_id === U) || (p === 'supervisor' && c.supervisor_id === U)))
        .sort((a, b) => (Number(!!(l.uf && b.ufs.includes(l.uf))) - Number(!!(l.uf && a.ufs.includes(l.uf)))) || (Number(b.disponivel) - Number(a.disponivel))
          || ((a.ultimo_lead_em || '') < (b.ultimo_lead_em || '') ? -1 : (a.ultimo_lead_em || '') > (b.ultimo_lead_em || '') ? 1 : 0) || a.nome.localeCompare(b.nome));
      const metodo = !r ? 'rodizio' : r.team_id ? 'equipe' : r.metodo === 'disponibilidade' ? 'disponibilidade' : r.campaign_id ? 'campanha' : r.product_id ? 'produto' : r.uf ? 'regiao' : r.source_id ? 'origem' : 'rodizio';
      return { corretor: cand[0] ? cand[0].id : null, metodo, regra: r ? r.nome : null };
    }
    function leadVisivel(id) { const l = byId('leads', id); if (!l || l.deleted_at || !canSee('leads', l)) throw err('Lead não encontrado'); return l; }

    const inPeriod = (iso, ini, fim) => { if (!iso) return false; const d = isoDate(new Date(iso)); return d >= ini && d <= fim; };
    const inDates = (d, ini, fim) => !!d && d >= ini && d <= fim;
    const ym = d => String(d).slice(0, 7);
    const monthsBack = (fim, n) => { const d = new Date(fim + 'T12:00:00'); return Array.from({ length: n }, (_, i) => { const x = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1); return isoDate(x); }); };
    const round1 = v => Math.round(v * 10) / 10;
    const converted = l => !!l.client_id || grupo(l.etapa) === 'ganho';
    const perdidoL = l => grupo(l.etapa) === 'perdido';
    const vendido = s => ['aprovada', 'implantada'].includes(s.status);
    function filt(rows, f, cols = ['corretor_id', 'supervisor_id', 'gerente_id', 'team_id', 'operator_id', 'product_id', 'source_id', 'campaign_id']) {
      return rows.filter(r => cols.every(c => !f[c] || r[c] === f[c]));
    }
    function metaValor(mes, f, tipo = 'valor') {
      const m = mes.slice(0, 7) + '-01';
      const G = T.goals.filter(g => !g.deleted_at && canSee('goals', g) && g.mes === m && g.tipo === tipo);
      const sm = a => a.length ? a.reduce((x, g) => x + Number(g.valor_meta), 0) : null;
      if (f.corretor_id) return sm(G.filter(g => g.escopo === 'corretor' && g.usuario_id === f.corretor_id));
      if (!f.supervisor_id && !f.team_id && !f.gerente_id) {
        const own = papel() === 'admin' ? sm(G.filter(g => g.escopo === 'empresa')) : sm(G.filter(g => g.usuario_id === U));
        if (own != null) return own;
      }
      return sm(G.filter(g => g.escopo === 'corretor' && (!f.supervisor_id || g.supervisor_id === f.supervisor_id) && (!f.gerente_id || g.gerente_id === f.gerente_id) && (!f.team_id || g.team_id === f.team_id)));
    }
    function groupAgg(rows, keyFn, init, add) { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, init(r)); add(m.get(k), r); } return [...m.values()]; }

    function dashboard({ p_inicio, p_fim, p_filtros }) {
      const f = p_filtros || {};
      const sla = setting('sla', { meta1_min: 5, meta2_min: 15 });
      const L = filt(T.leads.filter(l => !l.deleted_at && canSee('leads', l)), f);
      const S = filt(T.sales.filter(s => !s.deleted_at && canSee('sales', s)), f);
      const lp = L.filter(l => inPeriod(l.entrada_em, p_inicio, p_fim));
      const sv = S.filter(s => vendido(s) && inDates(s.data_venda, p_inicio, p_fim));
      const aberto = L.filter(l => (stage(l.etapa) || {}).tipo === 'aberto');
      const leadIds = new Set(L.map(l => l.id));
      const Q = T.quotes.filter(q => !q.deleted_at && canSee('quotes', q) && leadIds.has(q.lead_id) && inPeriod(q.enviada_em, p_inicio, p_fim));
      const Pr = T.proposals.filter(p => !p.deleted_at && canSee('proposals', p) && leadIds.has(p.lead_id));
      const prPer = Pr.filter(p => inPeriod(p.enviada_em, p_inicio, p_fim));
      const FU = filt(T.followups.filter(x => !x.deleted_at && canSee('followups', x) && x.status === 'pendente' && new Date(x.agendado_para) < now()), f, ['corretor_id', 'supervisor_id', 'team_id']);
      const TK = T.tasks.filter(x => !x.deleted_at && canSee('tasks', x) && ['aberta', 'em_andamento'].includes(x.status) && (!f.corretor_id || x.corretor_id === f.corretor_id || x.responsavel_id === f.corretor_id) && (!f.supervisor_id || x.supervisor_id === f.supervisor_id));
      const CL = filt(T.clients.filter(c => !c.deleted_at && canSee('clients', c)), f, ['corretor_id', 'supervisor_id', 'team_id', 'operator_id', 'product_id']);
      const meta = metaValor(p_fim, f);
      const rm = S.filter(s => vendido(s) && ym(s.data_venda) === ym(p_fim));
      const realMes = rm.reduce((a, s) => a + Number(s.valor_mensal), 0);
      const slaM = lp.filter(l => l.primeiro_contato_em).map(l => (new Date(l.primeiro_contato_em) - new Date(l.distribuido_em || l.entrada_em)) / 60000);
      const soma = a => a.reduce((x, s) => x + Number(s.valor_mensal || 0), 0);
      const hojeIni = new Date(now()); hojeIni.setHours(0, 0, 0, 0);
      const conv = arr => arr.length ? round1(100 * arr.filter(converted).length / arr.length) : 0;
      const agg = (keyFn, nameFn) => groupAgg(sv, keyFn, r => ({ id: keyFn(r), nome: nameFn(r), qtd: 0, valor: 0, vidas: 0 }), (a, r) => { a.qtd++; a.valor += Number(r.valor_mensal); a.vidas += r.num_vidas; });
      return {
        cards: {
          leads_recebidos: lp.length, leads_novos: L.filter(l => l.status === 'novo').length, leads_atendimento: L.filter(l => grupo(l.etapa) === 'atendimento').length,
          leads_negociacao: L.filter(l => grupo(l.etapa) === 'negociacao').length, cotacoes_enviadas: Q.length, propostas_enviadas: prPer.length,
          propostas_analise: Pr.filter(p => p.status === 'em_analise').length, vendas_aprovadas: sv.length,
          vendas_implantadas: S.filter(s => s.status === 'implantada' && inDates(s.data_implantacao, p_inicio, p_fim)).length,
          vendas_em_implantacao: S.filter(s => ['proposta_enviada', 'em_analise', 'pendencia'].includes(s.status)).length,
          vendas_canceladas: S.filter(s => ['cancelada', 'recusada'].includes(s.status) && inPeriod(s.cancelada_em || s.status_desde, p_inicio, p_fim)).length,
          clientes_ativos: CL.filter(c => c.status === 'ativo').length, followups_atrasados: FU.length, tarefas_pendentes: TK.length,
          valor_vendido: soma(sv), vidas_vendidas: sv.reduce((a, s) => a + s.num_vidas, 0), ticket_medio: sv.length ? Math.round(soma(sv) / sv.length * 100) / 100 : 0,
          conversao_leads: conv(lp), conversao_propostas: prPer.length ? round1(100 * sv.length / prPer.length) : 0,
          meta_valor: meta, realizado_mes: realMes, meta_pct: meta ? round1(100 * realMes / meta) : null,
        },
        funil: T.pipeline_stages.filter(s => s.ativo && s.grupo !== 'perdido').sort((a, b) => a.ordem - b.ordem).map(s => ({ etapa: s.codigo, nome: s.nome, cor: s.cor, qtd: lp.filter(l => !perdidoL(l) && ordem(l.etapa) >= s.ordem).length })),
        vendas_mes: monthsBack(p_fim, 12).map(m => { const x = S.filter(s => vendido(s) && ym(s.data_venda) === ym(m)); return { mes: ym(m), qtd: x.length, valor: soma(x), vidas: x.reduce((a, s) => a + s.num_vidas, 0) }; }),
        por_corretor: agg(s => s.corretor_id, s => nome(s.corretor_id)).filter(x => x.id).sort((a, b) => b.valor - a.valor).slice(0, 15),
        por_supervisor: agg(s => s.supervisor_id, s => nome(s.supervisor_id)).filter(x => x.id).sort((a, b) => b.valor - a.valor),
        por_equipe: agg(s => s.team_id || null, s => nm('teams', s.team_id) || 'Sem equipe').sort((a, b) => b.valor - a.valor),
        por_operadora: agg(s => nm('operators', s.operator_id) || 'Sem operadora', s => nm('operators', s.operator_id) || 'Sem operadora').sort((a, b) => b.valor - a.valor).map(({ id, ...x }) => x),
        por_produto: agg(s => nm('products', s.product_id) || 'Sem produto', s => nm('products', s.product_id) || 'Sem produto').sort((a, b) => b.valor - a.valor).slice(0, 12).map(({ id, ...x }) => x),
        por_origem: groupAgg(lp, l => nm('lead_sources', l.source_id) || 'Sem origem', l => ({ nome: nm('lead_sources', l.source_id) || 'Sem origem', leads: 0, vendas: 0 }), (a, l) => { a.leads++; if (converted(l)) a.vendas++; })
          .map(a => ({ ...a, conversao: round1(100 * a.vendas / a.leads) })).sort((a, b) => b.leads - a.leads),
        conversao_corretor: groupAgg(lp.filter(l => l.corretor_id), l => l.corretor_id, l => ({ id: l.corretor_id, nome: nome(l.corretor_id), leads: 0, vendas: 0 }), (a, l) => { a.leads++; if (converted(l)) a.vendas++; })
          .map(a => ({ ...a, conversao: round1(100 * a.vendas / a.leads) })).sort((a, b) => b.conversao - a.conversao).slice(0, 15),
        conversao_equipe: groupAgg(lp, l => nm('teams', l.team_id) || 'Sem equipe', l => ({ nome: nm('teams', l.team_id) || 'Sem equipe', leads: 0, vendas: 0 }), (a, l) => { a.leads++; if (converted(l)) a.vendas++; })
          .map(a => ({ ...a, conversao: round1(100 * a.vendas / a.leads) })).sort((a, b) => b.conversao - a.conversao),
        metas_mes: monthsBack(p_fim, 6).map(m => ({ mes: ym(m), meta: metaValor(m, f), realizado: soma(S.filter(s => vendido(s) && ym(s.data_venda) === ym(m))) })),
        atencao: {
          leads_sem_contato: aberto.filter(l => !l.primeiro_contato_em).length, followups_vencidos: FU.length,
          propostas_paradas: Pr.filter(p => ['enviada', 'em_analise', 'pendencia'].includes(p.status) && new Date(p.status_desde) < new Date(now() - 48 * HOUR)).length,
          implantacoes_paradas: S.filter(s => ['proposta_enviada', 'em_analise', 'pendencia'].includes(s.status) && T.implementations.some(i => i.sale_id === s.id && !i.deleted_at && new Date(i.etapa_desde) < new Date(now() - 48 * HOUR))).length,
          vendas_pendencia: S.filter(s => s.status === 'pendencia' || T.pendencies.some(p => p.sale_id === s.id && p.status === 'aberta' && !p.deleted_at)).length,
          quentes_sem_interacao: aberto.filter(l => l.temperatura === 'quente' && (!l.ultimo_contato_em || new Date(l.ultimo_contato_em) < hojeIni)).length,
          sla_atrasado: aberto.filter(l => !l.primeiro_contato_em && l.corretor_id && (() => { const t = new Date(l.assigned_at || l.distribuido_em || l.entrada_em).getTime(); return t < now() - sla.meta2_min * 60e3 && t > now() - 7 * DAY; })()).length,
        },
        sla: {
          tempo_medio_min: slaM.length ? round1(slaM.reduce((a, b) => a + b, 0) / slaM.length) : null,
          pct_meta1: slaM.length ? round1(100 * slaM.filter(m => m <= sla.meta1_min).length / slaM.length) : null,
          pct_meta2: slaM.length ? round1(100 * slaM.filter(m => m <= sla.meta2_min).length / slaM.length) : null,
          meta1_min: sla.meta1_min, meta2_min: sla.meta2_min, sem_atendimento: aberto.filter(l => !l.primeiro_contato_em).length,
        },
      };
    }

    function desempenho({ p_inicio, p_fim, p_filtros }) {
      const f = p_filtros || {};
      const cs = T.profiles.filter(c => c.papel === 'corretor' && !c.deleted_at && c.status !== 'pendente' && canSee('profiles', c)
        && (!f.supervisor_id || c.supervisor_id === f.supervisor_id) && (!f.gerente_id || c.gerente_id === f.gerente_id) && (!f.team_id || c.team_id === f.team_id) && (!f.corretor_id || c.id === f.corretor_id));
      const mes = ym(p_fim);
      return cs.map(c => {
        const L = T.leads.filter(l => l.corretor_id === c.id && !l.deleted_at && canSee('leads', l));
        const lr = L.filter(l => inPeriod(l.entrada_em, p_inicio, p_fim));
        const pcs = lr.filter(l => l.primeiro_contato_em).map(l => (new Date(l.primeiro_contato_em) - new Date(l.distribuido_em || l.entrada_em)) / 60000);
        const sv = T.sales.filter(s => s.corretor_id === c.id && !s.deleted_at && canSee('sales', s) && vendido(s) && inDates(s.data_venda, p_inicio, p_fim));
        const valor = sv.reduce((a, s) => a + Number(s.valor_mensal), 0);
        const meta = T.goals.filter(g => !g.deleted_at && canSee('goals', g) && g.escopo === 'corretor' && g.usuario_id === c.id && g.tipo === 'valor' && ym(g.mes) === mes).reduce((a, g) => a + Number(g.valor_meta), null);
        const conv = lr.filter(converted).length;
        return {
          id: c.id, nome: c.nome, team_id: c.team_id, equipe: nm('teams', c.team_id), supervisor_id: c.supervisor_id, supervisor: nome(c.supervisor_id),
          gerente_id: c.gerente_id, gerente: nome(c.gerente_id), grade: c.grade_comissao || null,
          leads_recebidos: lr.length, leads_trabalhados: lr.filter(l => l.tentativas_contato > 0).length,
          sem_atendimento: L.filter(l => !l.primeiro_contato_em && !['perdido', 'ganho'].includes(grupo(l.etapa))).length,
          perdidos: L.filter(l => perdidoL(l) && inPeriod(l.updated_at, p_inicio, p_fim)).length, convertidos: conv,
          tempo_primeiro_contato_min: pcs.length ? Math.round(pcs.reduce((a, b) => a + b, 0) / pcs.length) : null,
          tentativas: T.activities.filter(a => a.corretor_id === c.id && !a.deleted_at && canSee('activities', a) && inPeriod(a.realizado_em, p_inicio, p_fim)).length,
          cotacoes: T.quotes.filter(q => q.corretor_id === c.id && !q.deleted_at && canSee('quotes', q) && inPeriod(q.enviada_em, p_inicio, p_fim)).length,
          propostas: T.proposals.filter(p => p.corretor_id === c.id && !p.deleted_at && canSee('proposals', p) && inPeriod(p.enviada_em, p_inicio, p_fim)).length,
          vendas: sv.length, valor, vidas: sv.reduce((a, s) => a + s.num_vidas, 0), ticket_medio: sv.length ? Math.round(valor / sv.length * 100) / 100 : 0,
          conversao: lr.length ? round1(100 * conv / lr.length) : 0,
          followups_realizados: T.followups.filter(x => x.corretor_id === c.id && canSee('followups', x) && x.status === 'concluido' && inPeriod(x.concluido_em, p_inicio, p_fim)).length,
          followups_atrasados: T.followups.filter(x => x.corretor_id === c.id && canSee('followups', x) && !x.deleted_at && x.status === 'pendente' && new Date(x.agendado_para) < now()).length,
          meta, realizado_mes: T.sales.filter(s => s.corretor_id === c.id && !s.deleted_at && canSee('sales', s) && vendido(s) && ym(s.data_venda) === mes).reduce((a, s) => a + Number(s.valor_mensal), 0),
        };
      }).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
    }

    function inteligencia({ p_inicio, p_fim }) {
      const L = T.leads.filter(l => !l.deleted_at && canSee('leads', l));
      const aberto = L.filter(l => (stage(l.etapa) || {}).tipo === 'aberto');
      const n = now().getTime();
      const d = new Date(p_fim + 'T12:00:00'); const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); const prop = Math.min(1, d.getDate() / diasMes);
      const lp = L.filter(l => inPeriod(l.entrada_em, p_inicio, p_fim));
      const sv = T.sales.filter(s => !s.deleted_at && canSee('sales', s) && vendido(s) && inDates(s.data_venda, p_inicio, p_fim));
      const convGroup = (rows, key) => groupAgg(rows, key, r => ({ nome: key(r), leads: 0, vendas: 0 }), (a, r) => { a.leads++; if (converted(r)) a.vendas++; }).map(a => ({ ...a, conversao: round1(100 * a.vendas / a.leads) }));
      return {
        precisam_atencao: aberto.filter(l => !l.primeiro_contato_em || (l.proximo_followup_em && new Date(l.proximo_followup_em) < now()) || (l.temperatura === 'quente' && new Date(l.ultimo_contato_em || l.entrada_em).getTime() < n - 24 * HOUR))
          .sort((a, b) => (Number(b.temperatura === 'quente') - Number(a.temperatura === 'quente')) || (a.entrada_em < b.entrada_em ? -1 : 1)).slice(0, 12)
          .map(l => ({ id: l.id, nome: l.nome, temperatura: l.temperatura, etapa: l.etapa, corretor: nome(l.corretor_id), motivo: !l.primeiro_contato_em ? 'Sem primeiro contato' : (l.proximo_followup_em && new Date(l.proximo_followup_em) < now()) ? 'Follow-up vencido' : 'Quente sem interação há mais de 24h' })),
        esquecidos: aberto.filter(l => new Date(l.ultimo_contato_em || l.entrada_em).getTime() < n - 7 * DAY && (!l.proximo_followup_em || new Date(l.proximo_followup_em) < now()))
          .sort((a, b) => (a.ultimo_contato_em || a.entrada_em) < (b.ultimo_contato_em || b.entrada_em) ? -1 : 1).slice(0, 12)
          .map(l => ({ id: l.id, nome: l.nome, etapa: l.etapa, corretor: nome(l.corretor_id), dias: Math.floor((n - new Date(l.ultimo_contato_em || l.entrada_em)) / DAY) })),
        implantacoes_paradas: T.implementations.filter(i => { const s = byId('sales', i.sale_id); return !i.deleted_at && s && !s.deleted_at && canSee('implementations', i) && ['proposta_enviada', 'em_analise', 'pendencia'].includes(s.status) && new Date(i.etapa_desde).getTime() < n - 72 * HOUR; })
          .sort((a, b) => a.etapa_desde < b.etapa_desde ? -1 : 1).slice(0, 12)
          .map(i => { const st = implStage(i.etapa) || {}; return { id: i.id, sale_id: i.sale_id, lead_id: i.lead_id, nome: nm('clients', i.client_id), etapa: i.etapa, etapa_nome: st.nome || i.etapa, etapa_cor: st.cor || null, corretor: nome((byId('sales', i.sale_id) || {}).corretor_id), horas: Math.round((n - new Date(i.etapa_desde)) / HOUR) }; }),
        propostas_paradas: T.proposals.filter(p => !p.deleted_at && canSee('proposals', p) && ['enviada', 'em_analise', 'pendencia'].includes(p.status) && new Date(p.status_desde).getTime() < n - 72 * HOUR)
          .sort((a, b) => a.status_desde < b.status_desde ? -1 : 1).slice(0, 12)
          .map(p => ({ id: p.id, lead_id: p.lead_id, nome: nm('leads', p.lead_id) || nm('clients', p.client_id), status: p.status, numero: p.numero, corretor: nome(p.corretor_id), horas: Math.round((n - new Date(p.status_desde)) / HOUR) })),
        abaixo_meta: desempenho({ p_inicio: p_fim.slice(0, 7) + '-01', p_fim, p_filtros: {} }).filter(x => x.meta != null && x.realizado_mes < x.meta * prop)
          .map(x => ({ id: x.id, nome: x.nome, meta: x.meta, realizado: x.realizado_mes, pct: x.meta ? round1(100 * x.realizado_mes / x.meta) : null, esperado_pct: round1(100 * prop) })).sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1)).slice(0, 12),
        melhores_origens: convGroup(lp, l => nm('lead_sources', l.source_id) || 'Sem origem').filter(a => a.leads >= 3).sort((a, b) => b.conversao - a.conversao),
        campanhas: convGroup(lp.filter(l => l.campaign_id), l => nm('campaigns', l.campaign_id)).sort((a, b) => b.conversao - a.conversao),
        produtos: groupAgg(sv, s => nm('products', s.product_id) || 'Sem produto', s => ({ nome: nm('products', s.product_id) || 'Sem produto', qtd: 0, valor: 0 }), (a, s) => { a.qtd++; a.valor += Number(s.valor_mensal); }).sort((a, b) => b.qtd - a.qtd).slice(0, 8),
        operadoras: groupAgg(sv, s => nm('operators', s.operator_id) || 'Sem operadora', s => ({ nome: nm('operators', s.operator_id) || 'Sem operadora', qtd: 0, valor: 0 }), (a, s) => { a.qtd++; a.valor += Number(s.valor_mensal); }).sort((a, b) => b.qtd - a.qtd).slice(0, 8),
        motivos_perda: groupAgg(L.filter(l => perdidoL(l) && inPeriod(l.updated_at, p_inicio, p_fim)), l => nm('loss_reasons', l.loss_reason_id) || 'Não informado', l => ({ nome: nm('loss_reasons', l.loss_reason_id) || 'Não informado', qtd: 0 }), a => a.qtd++).sort((a, b) => b.qtd - a.qtd),
        proximos_fechamento: L.filter(l => ['negociacao', 'proposta'].includes(grupo(l.etapa)))
          .sort((a, b) => (Number(b.temperatura === 'quente') - Number(a.temperatura === 'quente')) || (ordem(b.etapa) - ordem(a.etapa)) || ((b.valor_cotacao ?? b.valor_pretendido ?? 0) - (a.valor_cotacao ?? a.valor_pretendido ?? 0))).slice(0, 12)
          .map(l => ({ id: l.id, nome: l.nome, etapa: l.etapa, temperatura: l.temperatura, valor: l.valor_cotacao ?? l.valor_pretendido, corretor: nome(l.corretor_id) })),
      };
    }

    function verificarDuplicidade({ p_cpf, p_telefone, p_email, p_ignorar }) {
      if (!papel()) return [];
      const cpf = digits(p_cpf); let tel = digits(p_telefone); const email = p_email ? String(p_email).trim().toLowerCase() || null : null;
      if (tel && tel.length < 8) tel = null;
      if (!cpf && !tel && !email) return [];
      const r10 = v => v ? String(v).replace(/\D/g, '').slice(-10) : null;
      const out = [];
      const test = (r) => {
        const c = []; if (cpf && (r.cpf === cpf || r.cnpj === cpf)) c.push('CPF/CNPJ');
        if (tel && (r10(r.telefone) === r10(tel) || r10(r.whatsapp) === r10(tel))) c.push('Telefone');
        if (email && r.email && r.email.toLowerCase() === email) c.push('E-mail');
        return c;
      };
      for (const l of T.leads) { if (l.deleted_at || l.id === p_ignorar) continue; const c = test(l); if (!c.length) continue; const ok = canSee('leads', l);
        out.push({ tipo: 'lead', id: l.id, visivel: ok, nome: ok ? l.nome : null, status: ok ? (status(l.status) || {}).nome : null, responsavel: ok ? nome(l.corretor_id) : 'Registro pertence a outra carteira — fale com seu supervisor', criterio: c.join(', ') }); }
      for (const cl of T.clients) { if (cl.deleted_at) continue; const c = test(cl); if (!c.length) continue; const ok = canSee('clients', cl);
        out.push({ tipo: 'cliente', id: cl.id, visivel: ok, nome: ok ? cl.nome : null, status: ok ? cl.status : null, responsavel: ok ? nome(cl.corretor_id) : 'Cliente pertence a outra carteira — fale com seu supervisor', criterio: c.join(', ') }); }
      return out.slice(0, 10);
    }

    function lembretesRelacionamento(forcar) {
      const cfg = setting('relacionamento', {}) || {}; const hoje = hojeSP();
      if (!forcar) { if (setting('relacionamento_ultimo') === hoje) return { executado: false }; if (now().getHours() < (cfg.hora ?? 8)) return { executado: false }; }
      const st = byId('settings', 'relacionamento_ultimo'); if (st) st.valor = hoje; else T.settings.push({ chave: 'relacionamento_ultimo', valor: hoje, descricao: 'Controle interno', updated_at: nowISO() });
      const alvo = isoDate(new Date(new Date(hoje + 'T12:00:00').getTime() + (cfg.aniversario_dias_antes || 0) * DAY));
      const quando = alvo === hoje ? 'hoje' : 'amanhã';
      const antigo = d => !d || diasEntre(d, hoje) > 300;
      let na = 0, nd = 0, nc = 0;
      if (cfg.aniversario !== false) {
        for (const c of T.clients) {
          if (c.deleted_at || !c.corretor_id || c.status === 'cancelado' || c.anonimizado_em || proxAniv(c.data_nascimento, hoje) !== alvo || !antigo(c.aniversario_avisado_em)) continue;
          notificar(c.corretor_id, 'aniversario', `Aniversário ${quando}: ${c.nome}`, `Mensagem de parabéns pronta para enviar · ${idadeEm(c.data_nascimento, alvo)} anos`, `#/relacionamento?cliente=${c.id}&msg=aniversario`, c.id);
          c.aniversario_avisado_em = hoje; na++;
        }
        if (cfg.dependentes !== false) for (const d of T.dependents) {
          const c = byId('clients', d.client_id);
          if (d.deleted_at || d.status === 'cancelado' || !c || c.deleted_at || !c.corretor_id || c.status === 'cancelado' || proxAniv(d.data_nascimento, hoje) !== alvo || !antigo(d.aniversario_avisado_em)) continue;
          notificar(c.corretor_id, 'aniversario', `Aniversário ${quando}: ${d.nome} (dependente)`, `Família de ${c.nome} · mensagem pronta para enviar`, `#/relacionamento?cliente=${c.id}&msg=aniversario_dependente&dep=${d.id}`, c.id);
          d.aniversario_avisado_em = hoje; nd++;
        }
      }
      if (cfg.contato !== false) {
        const dias = Math.max(7, cfg.contato_dias || 60), max = Math.max(1, cfg.contato_max_dia || 5); const porCor = {};
        T.clients.filter(c => !c.deleted_at && c.corretor_id && ['ativo', 'renovacao', 'migracao', 'inadimplente'].includes(c.status) && !c.anonimizado_em
            && (!c.lembrete_contato_em || new Date(c.lembrete_contato_em) < now() - dias * DAY))
          .map(c => ({ c, ref: ultimoContatoCliente(c.id) || c.created_at })).filter(x => diasEntre(isoDate(new Date(x.ref)), hoje) >= dias)
          .sort((a, b) => a.ref < b.ref ? -1 : 1).forEach(({ c, ref }) => {
            porCor[c.corretor_id] = (porCor[c.corretor_id] || 0) + 1; if (porCor[c.corretor_id] > max) return;
            notificar(c.corretor_id, 'manter_contato', 'Hora de falar com ' + c.nome, `Sem contato há ${diasEntre(isoDate(new Date(ref)), hoje)} dias · mensagem pronta para enviar`, `#/relacionamento?cliente=${c.id}&msg=contato`, c.id);
            c.lembrete_contato_em = nowISO(); nc++;
          });
      }
      return { executado: true, aniversarios: na, dependentes: nd, contato: nc };
    }

    const RPC = {
      distribuir_lead({ p_lead, p_corretor, p_motivo, p_metodo }) {
        if (!['admin', 'gerente', 'supervisor'].includes(papel())) throw err('Somente administrador, gerente ou supervisor distribuem leads');
        const l = leadVisivel(p_lead);
        if (!podeGerirCorretor(p_corretor)) throw err('O corretor escolhido não pertence à sua estrutura');
        if (l.corretor_id === p_corretor) return null;
        if (l.corretor_id && !String(p_motivo || '').trim()) throw err('Informe o motivo da transferência', '23514');
        atribuir(p_lead, p_corretor, p_motivo, p_metodo || 'manual');
        return null;
      },
      distribuir_automatico({ p_lead }) {
        if (U && !['admin', 'gerente', 'supervisor'].includes(papel())) throw err('Sem permissão para distribuir leads');
        const l = U ? leadVisivel(p_lead) : byId('leads', p_lead);
        const e = escolherCorretor(p_lead, l.corretor_id);
        if (!e.corretor) return { ok: false, mensagem: 'Nenhum corretor disponível para esta regra' };
        atribuir(p_lead, e.corretor, l.corretor_id ? 'Redistribuição automática' : (e.regra ? 'Regra: ' + e.regra : 'Rodízio'), e.metodo);
        return { ok: true, corretor_id: e.corretor, corretor_nome: nome(e.corretor), metodo: e.metodo };
      },
      distribuir_leads_lote({ p_leads, p_corretores, p_motivo }) {
        let ok = 0, er = 0; const n = (p_corretores || []).length;
        p_leads.forEach((id, i) => { try { if (n) RPC.distribuir_lead({ p_lead: id, p_corretor: p_corretores[i % n], p_motivo: p_motivo || 'Distribuição em lote', p_metodo: 'lote' }); else RPC.distribuir_automatico({ p_lead: id }); ok++; } catch (e) { er++; } });
        return { distribuidos: ok, erros: er };
      },
      mover_etapa({ p_lead, p_etapa, p_loss_reason, p_obs }) {
        const l = leadVisivel(p_lead);
        const r = doUpdate('leads', p_lead, { etapa: p_etapa, loss_reason_id: p_loss_reason || l.loss_reason_id || null, motivo_perda_obs: p_obs ?? l.motivo_perda_obs ?? null });
        if (!r) throw err('Lead não encontrado'); return null;
      },
      alterar_status_lead({ p_lead, p_status, p_loss_reason, p_obs }) {
        const l = leadVisivel(p_lead);
        const r = doUpdate('leads', p_lead, { status: p_status, loss_reason_id: p_loss_reason || l.loss_reason_id || null, motivo_perda_obs: p_obs ?? l.motivo_perda_obs ?? null });
        if (!r) throw err('Lead não encontrado'); return null;
      },
      registrar_atividade({ p_lead, p_tipo, p_efetivo = true, p_resultado, p_descricao, p_client }) {
        return doInsert('activities', { lead_id: p_lead || null, client_id: p_client || null, tipo: p_tipo, efetivo: p_efetivo, resultado: p_resultado || null, descricao: p_descricao || null }).id;
      },
      concluir_followup({ p_id, p_resultado, p_proximo, p_tipo_proximo, p_obs_proximo }) {
        const f0 = byId('followups', p_id);
        if (!f0 || f0.status !== 'pendente' || !canSee('followups', f0)) throw err('Follow-up não encontrado ou já concluído');
        const f = doUpdate('followups', p_id, { status: 'concluido', resultado: p_resultado || null });
        if (!f) throw err('Follow-up não encontrado ou já concluído');
        if (p_proximo) return doInsert('followups', { lead_id: f.lead_id, client_id: f.client_id, sale_id: f.sale_id, tipo: p_tipo_proximo || f.tipo, agendado_para: p_proximo, prioridade: f.prioridade, observacao: p_obs_proximo || null, responsavel_id: f.responsavel_id }).id;
        return null;
      },
      converter_em_cliente({ p_lead, p_dados = {} }) {
        const l = leadVisivel(p_lead); const d = p_dados || {};
        if (l.client_id) throw err('Este lead já foi convertido em cliente', '23505');
        const st = d.status || 'aprovada';
        const c = doInsert('clients', { tipo_pessoa: l.tipo_pessoa, nome: d.nome || l.nome, razao_social: l.tipo_pessoa === 'PJ' ? (d.razao_social || l.empresa) : null,
          cpf: digits(d.cpf ?? l.cpf), cnpj: digits(d.cnpj ?? l.cnpj), data_nascimento: d.data_nascimento || l.data_nascimento || null, telefone: l.telefone, whatsapp: l.whatsapp, email: l.email,
          cep: d.cep || null, endereco: d.endereco || null, numero: d.numero || null, complemento: d.complemento || null, bairro: d.bairro || null, cidade: d.cidade || l.cidade, uf: d.uf || l.uf,
          lead_id: l.id, operator_id: d.operator_id || l.operator_id, product_id: d.product_id || l.product_id, num_vidas: d.num_vidas || l.num_vidas, data_venda: d.data_venda || today(),
          vigencia: d.vigencia || null, valor_mensal: d.valor_mensal ?? l.valor_cotacao ?? l.valor_pretendido ?? 0, numero_proposta: d.numero_proposta || null,
          status: st === 'implantada' ? 'ativo' : 'implantacao', source_id: l.source_id, corretor_id: l.corretor_id, supervisor_id: l.supervisor_id, gerente_id: l.gerente_id });
        (d.dependentes || []).forEach(x => doInsert('dependents', { client_id: c.id, nome: x.nome, cpf: digits(x.cpf), data_nascimento: x.data_nascimento || null, parentesco: x.parentesco || null, valor: x.valor ?? null, product_id: x.product_id || d.product_id || l.product_id }));
        const s = doInsert('sales', { client_id: c.id, lead_id: l.id, operator_id: d.operator_id || l.operator_id, product_id: d.product_id || l.product_id, tipo_plano: d.tipo_plano || l.modalidade,
          num_vidas: d.num_vidas || l.num_vidas, valor_mensal: d.valor_mensal ?? l.valor_cotacao ?? l.valor_pretendido ?? 0, numero_proposta: d.numero_proposta || null, data_venda: d.data_venda || today(),
          vigencia: d.vigencia || null, source_id: l.source_id, campaign_id: l.campaign_id, status: st, corretor_id: l.corretor_id, supervisor_id: l.supervisor_id, gerente_id: l.gerente_id });
        T.proposals.filter(p => p.lead_id === l.id && !['recusada', 'cancelada'].includes(p.status) && !p.sale_id).forEach(p => sysUpdate('proposals', p.id, { client_id: c.id, sale_id: s.id }));
        // CRM → implantação: o lead vai para a primeira etapa de "ganho" (Aprovado)
        const ganho = T.pipeline_stages.filter(x => x.grupo === 'ganho' && x.ativo).sort((a, b) => a.ordem - b.ordem)[0];
        const atual = byId('leads', l.id);
        doUpdate('leads', l.id, { client_id: c.id, ...(ganho && (stage(atual.etapa) || {}).grupo !== 'ganho' ? { etapa: ganho.codigo } : {}) });
        const im = T.implementations.find(i => i.sale_id === s.id) || {};
        historico(l.id, 'aprovacao', 'Lead convertido em cliente', 'Enviado para a implantação — etapa ' + ((implStage(im.etapa) || {}).nome || im.etapa || '—'), { client_id: c.id, sale_id: s.id });
        return { client_id: c.id, sale_id: s.id, implantacao_etapa: im.etapa || null };
      },
      transferir_cliente({ p_client, p_corretor, p_motivo }) {
        if (!['admin', 'gerente', 'supervisor'].includes(papel())) throw err('Sem permissão para transferir clientes');
        const c = byId('clients', p_client); if (!c || c.deleted_at || !canSee('clients', c)) throw err('Cliente não encontrado');
        if (!podeGerirCorretor(p_corretor)) throw err('O corretor escolhido não pertence à sua estrutura');
        if (!String(p_motivo || '').trim()) throw err('Informe o motivo da transferência', '23514');
        const ant = c.corretor_id;
        sysUpdate('clients', p_client, { corretor_id: p_corretor, assigned_at: nowISO(), assigned_by: U });
        for (const t of ['followups', 'tasks', 'notes', 'documents', 'events']) T[t].filter(x => x.client_id === p_client && !x.lead_id && !x.sale_id).forEach(x => {
          if ((t === 'followups' && x.status === 'pendente') || (t === 'tasks' && ['aberta', 'em_andamento'].includes(x.status))) x.responsavel_id = p_corretor;
          sysUpdate(t, x.id, {});
        });
        audit('transferencia_cliente', 'clients', p_client, { corretor_id: ant }, { corretor_id: p_corretor, motivo: p_motivo });
        return null;
      },
      avancar_implantacao({ p_impl, p_etapa, p_obs, p_protocolo }) {
        const i = byId('implementations', p_impl); if (!i || i.deleted_at || !canSee('implementations', i)) throw err('Implantação não encontrada');
        ctx.obs = p_obs || '';
        try {
          if ((p_etapa || i.etapa) !== i.etapa || (p_protocolo && p_protocolo !== i.protocolo)) sysUpdate('implementations', p_impl, { etapa: p_etapa || i.etapa, protocolo: p_protocolo || i.protocolo || null });
          else if (p_obs) T.implementation_events.push({ id: uuid(), implementation_id: i.id, etapa_anterior: i.etapa, etapa: i.etapa, descricao: p_obs, protocolo: i.protocolo || null, usuario_id: U, created_at: nowISO() });
        } finally { ctx.obs = ''; }
        return null;
      },
      verificar_duplicidade: verificarDuplicidade,
      busca_global({ p_termo }) {
        const t = String(p_termo || '').trim(); if (t.length < 2) return [];
        const re = likeRe('%' + t + '%'); let d = digits(t); if (d && d.length < 3) d = null;
        const has = v => v != null && re.test(String(v)); const hd = v => d && v && String(v).replace(/\D/g, '').includes(d);
        const L = T.leads.filter(l => !l.deleted_at && canSee('leads', l) && (has(l.nome) || has(l.email) || has(l.empresa) || hd(l.cpf) || hd(l.cnpj) || hd(l.telefone) || hd(l.whatsapp)))
          .sort((a, b) => a.updated_at < b.updated_at ? 1 : -1).slice(0, 8).map(l => ({ tipo: 'lead', id: l.id, titulo: l.nome, sub: [l.empresa, (status(l.status) || {}).nome, nome(l.corretor_id)].filter(Boolean).join(' · ') }));
        const C = T.clients.filter(c => !c.deleted_at && canSee('clients', c) && (has(c.nome) || has(c.razao_social) || has(c.email) || has(c.numero_proposta) || has(c.carteirinha) || hd(c.cpf) || hd(c.cnpj) || hd(c.telefone) || hd(c.whatsapp)))
          .sort((a, b) => a.updated_at < b.updated_at ? 1 : -1).slice(0, 8).map(c => ({ tipo: 'cliente', id: c.id, titulo: c.nome, sub: [c.razao_social, c.status, nome(c.corretor_id)].filter(Boolean).join(' · ') }));
        const S = T.sales.filter(s => !s.deleted_at && canSee('sales', s) && has(s.numero_proposta)).slice(0, 5).map(s => ({ tipo: 'venda', id: s.id, titulo: (nm('clients', s.client_id) || 'Venda') + (s.numero_proposta ? ' · nº ' + s.numero_proposta : ''), sub: s.status }));
        return [...L, ...C, ...S];
      },
      importar_leads({ p_linhas, p_modo_duplicado = 'ignorar', p_corretor, p_source, p_campaign }) {
        if (p_corretor && papel() !== 'corretor' && !podeGerirCorretor(p_corretor)) throw err('O corretor escolhido não pertence à sua estrutura');
        let ins = 0, upd = 0, ign = 0; const erros = [];
        ctx.metodo = 'importacao';
        try {
          p_linhas.forEach((r, i) => {
            try {
              if (!String(r.nome || '').trim()) throw err('Nome em branco');
              const dup = verificarDuplicidade({ p_cpf: r.cpf, p_telefone: r.whatsapp || r.telefone, p_email: r.email }).find(x => x.tipo === 'lead');
              if (dup && p_modo_duplicado === 'ignorar') { ign++; return; }
              if (dup && p_modo_duplicado === 'atualizar') {
                if (!dup.visivel) { ign++; erros.push({ linha: i + 1, erro: 'Duplicado em outra carteira — não atualizado' }); return; }
                const patch = {}; ['nome', 'email', 'telefone', 'whatsapp', 'cidade', 'uf', 'observacao'].forEach(k => { if (r[k]) patch[k] = r[k]; }); if (r.num_vidas) patch.num_vidas = Number(r.num_vidas);
                doUpdate('leads', dup.id, patch); upd++; return;
              }
              doInsert('leads', { nome: String(r.nome).trim(), cpf: r.cpf || null, data_nascimento: r.data_nascimento || null, telefone: r.telefone || null, whatsapp: r.whatsapp || r.telefone || null,
                email: r.email || null, cidade: r.cidade || null, uf: r.uf || null, tipo_pessoa: r.tipo_pessoa || 'PF', modalidade: r.modalidade || 'individual', empresa: r.empresa || null, cnpj: r.cnpj || null,
                num_vidas: Number(r.num_vidas) || 1, valor_pretendido: r.valor_pretendido ? Number(r.valor_pretendido) : null, source_id: r.source_id || p_source || null, campaign_id: r.campaign_id || p_campaign || null,
                observacao: r.observacao || null, corretor_id: p_corretor || null });
              ins++;
            } catch (e) { erros.push({ linha: i + 1, erro: e.message }); }
          });
        } finally { ctx.metodo = ''; }
        return { inseridos: ins, atualizados: upd, ignorados: ign, erros };
      },
      atualizar_meu_perfil({ p_nome, p_telefone, p_disponivel }) {
        const me = prof(U); const patch = {};
        if (p_nome && p_nome.trim()) patch.nome = p_nome.trim(); if (p_telefone != null) patch.telefone = p_telefone; if (p_disponivel != null) patch.disponivel = p_disponivel;
        doUpdate('profiles', me.id, patch); return null;
      },
      marcar_notificacoes_lidas({ p_ids }) { T.notifications.filter(n => n.usuario_id === U && !n.lida && (!p_ids || p_ids.includes(n.id))).forEach(n => n.lida = true); return null; },
      registrar_login() { if (U) audit('login', 'profiles', U, null, null); return null; },
      anonimizar_lead({ p_lead }) {
        if (papel() !== 'admin') throw err('Somente o administrador pode anonimizar dados');
        sysUpdate('leads', p_lead, { nome: 'Titular anonimizado', cpf: null, cnpj: null, telefone: null, whatsapp: null, email: null, data_nascimento: null, observacao: null, anonimizado_em: nowISO() });
        T.clients.filter(c => c.lead_id === p_lead).forEach(c => sysUpdate('clients', c.id, { nome: 'Titular anonimizado', cpf: null, telefone: null, whatsapp: null, email: null, data_nascimento: null, endereco: null, numero: null, complemento: null, cep: null, anonimizado_em: nowISO() }));
        T.lead_history.filter(h => h.lead_id === p_lead && h.tipo === 'alteracao').forEach(h => { h.descricao = null; h.dados = null; });
        return null;
      },
      minhas_comissoes({ p_inicio, p_fim }) {
        const p = papel(); if (!p) return [];
        const primeira = {}; T.commissions.forEach(c => { if (!primeira[c.sale_id] || c.data_prevista < primeira[c.sale_id]) primeira[c.sale_id] = c.data_prevista; });
        return T.commissions.filter(c => !c.deleted_at && (c.corretor_id === U || (p === 'supervisor' && c.supervisor_id === U)) && (!p_inicio || c.data_prevista >= p_inicio) && (!p_fim || c.data_prevista <= p_fim))
          .sort((a, b) => (primeira[b.sale_id] || '').localeCompare(primeira[a.sale_id] || '') || a.sale_id.localeCompare(b.sale_id) || a.parcela - b.parcela)
          .map(c => ({ id: c.id, sale_id: c.sale_id, cliente_nome: nm('clients', c.client_id), operadora_nome: nm('operators', c.operator_id), parcela: c.parcela, valor_venda: c.valor_venda,
            minha_comissao: c.corretor_id === U ? c.comissao_corretor : c.comissao_supervisor, data_prevista: c.data_prevista, data_recebida: c.data_recebida || null, status: c.status }))
          .filter(c => Number(c.minha_comissao) > 0);
      },
      // ---- v1.1: grade de comissão
      salvar_grade_produto({ p_product, p_linhas }) {
        if (papel() !== 'admin') throw err('Somente o administrador altera a grade de comissão');
        const pr = byId('products', p_product); if (!pr || pr.deleted_at) throw err('Produto não encontrado', '23503');
        const novas = [];
        for (const r of p_linhas || []) {
          const b = String(r.beneficiario || '').trim().toLowerCase();
          if (r.percentual === '' || r.percentual == null || Number(String(r.percentual).replace(',', '.')) === 0) continue;
          if (!['corretora', 'supervisor'].includes(b) && !byId('commission_grades', b)) throw err(`Grade "${b}" não existe`, '23503');
          const parc = Number(r.parcela); if (!(parc >= 1 && parc <= 3)) throw err(`A grade aceita no máximo 3 parcelas (informada: ${r.parcela}ª)`, '23514');
          const pct = Number(String(r.percentual).replace(',', '.')); if (!(pct >= 0)) throw err('Percentual inválido', '23514');
          novas.push({ product_id: p_product, beneficiario: b, parcela: parc, percentual: pct });
        }
        if (novas.length && !novas.some(x => x.beneficiario === 'corretora')) throw err('Informe quanto a corretora recebe em cada parcela (coluna Corretora)', '23514');
        T.product_commission_grid = T.product_commission_grid.filter(g => g.product_id !== p_product);
        novas.forEach(x => sysInsert('product_commission_grid', x));
        audit('grade_comissao', 'products', p_product, null, { linhas: p_linhas });
        return novas.length;
      },
      importar_grade_comissao({ p_linhas, p_criar_produtos = false }) {
        if (papel() !== 'admin') throw err('Somente o administrador importa a grade de comissão');
        const mapa = {}; const nao = []; let criados = 0, valores = 0; const prods = new Set();
        for (const r of p_linhas || []) {
          const pn = String(r.produto || '').trim(), on = String(r.operadora || '').trim();
          if (!pn || r.parcela === '' || r.parcela == null) continue;
          if (!(Number(r.parcela) >= 1 && Number(r.parcela) <= 3)) throw err(`Produto "${pn}": a grade aceita no máximo 3 parcelas (a planilha tem a ${r.parcela}ª)`, '23514');
          const chave = on.toLowerCase() + '|' + pn.toLowerCase();
          let pid;
          if (chave in mapa) pid = mapa[chave];
          else {
            let op = T.operators.find(o => !o.deleted_at && o.nome.toLowerCase() === on.toLowerCase());
            let pr = T.products.find(x => !x.deleted_at && x.nome.toLowerCase() === pn.toLowerCase() && (!op || x.operator_id === op.id));
            if (!pr && p_criar_produtos && on) { if (!op) op = sysInsert('operators', { nome: on }); pr = sysInsert('products', { operator_id: op.id, nome: pn }); criados++; }
            pid = pr ? pr.id : null; mapa[chave] = pid;
            if (!pid) { nao.push({ operadora: on, produto: pn }); continue; }
            T.product_commission_grid = T.product_commission_grid.filter(g => g.product_id !== pid); prods.add(pid);
          }
          if (!pid) continue;
          for (const [k0, v] of Object.entries(r.valores || {})) {
            if (v == null || String(v).trim() === '') continue;
            const k = k0.trim().toLowerCase();
            if (!['corretora', 'supervisor'].includes(k) && !byId('commission_grades', k)) continue;
            const pct = Number(String(v).replace(',', '.')); if (isNaN(pct) || pct === 0) continue;
            const ex = T.product_commission_grid.find(g => g.product_id === pid && g.beneficiario === k && g.parcela === Number(r.parcela));
            if (ex) ex.percentual = pct; else sysInsert('product_commission_grid', { product_id: pid, beneficiario: k, parcela: Number(r.parcela), percentual: pct });
            valores++;
          }
        }
        audit('grade_comissao_importacao', 'product_commission_grid', null, null, { produtos: prods.size, criados, valores });
        return { produtos: prods.size, criados, valores, nao_encontrados: nao };
      },
      excluir_grade({ p_codigo, p_destino }) {
        if (papel() !== 'admin') throw err('Somente o administrador exclui grades');
        if (T.profiles.some(x => x.grade_comissao === p_codigo && !x.deleted_at)) {
          if (!p_destino || p_destino === p_codigo || !byId('commission_grades', p_destino)) throw err('Escolha a grade para onde os corretores desta grade serão movidos', '23514');
          T.profiles.filter(x => x.grade_comissao === p_codigo).forEach(x => { x.grade_comissao = p_destino; });
        }
        T.product_commission_grid = T.product_commission_grid.filter(g => g.beneficiario !== p_codigo);
        T.commissions.filter(c => c.grade === p_codigo).forEach(c => c.grade = null);
        doDelete('commission_grades', p_codigo, true);
        return null;
      },
      excluir_etapa_crm({ p_codigo, p_destino }) {
        if (papel() !== 'admin') throw err('Somente o administrador exclui etapas');
        const st = stage(p_codigo); if (!st) throw err('Etapa não encontrada', '23503');
        if (st.sistema) throw err(`A etapa "${st.nome}" é usada pelas automações. Você pode renomear, mudar cor e ordem, mas não excluir.`, '23514');
        const d = p_destino !== p_codigo ? stage(p_destino) : null; if (!d) throw err('Escolha a etapa que vai receber os leads e os status desta etapa', '23514');
        const L = T.leads.filter(l => l.etapa === st.codigo);
        ctx.motivo = `Etapa "${st.nome}" excluída`;
        try {
          L.forEach(l => historico(l.id, 'etapa', `Etapa "${st.nome}" excluída — lead movido para "${d.nome}"`));
          T.lead_statuses.filter(x => x.etapa === st.codigo && !x.sistema).forEach(x => sysUpdate('lead_statuses', x.codigo, { etapa: d.codigo }));
          T.leads.filter(l => l.etapa === st.codigo).forEach(l => sysUpdate('leads', l.id, { etapa: d.codigo }));
        } finally { ctx.motivo = ''; }
        doDelete('pipeline_stages', st.codigo, true);
        return L.length;
      },
      excluir_status_lead({ p_codigo, p_destino }) {
        if (papel() !== 'admin') throw err('Somente o administrador exclui status');
        const st = status(p_codigo); if (!st) throw err('Status não encontrado', '23503');
        if (st.sistema) throw err(`O status "${st.nome}" é usado pelas automações. Você pode renomear e mudar a cor, mas não excluir.`, '23514');
        if (!T.lead_statuses.some(x => x.etapa === st.etapa && x.codigo !== st.codigo)) throw err('Este é o único status da etapa. Crie outro status nela ou exclua a etapa.', '23514');
        const d = p_destino !== p_codigo ? status(p_destino) : null;
        const L = T.leads.filter(l => l.status === st.codigo);
        if (L.length) {
          if (!d) throw err('Escolha o status que vai receber os leads', '23514');
          if (d.exige_motivo && !st.exige_motivo) throw err('Escolha um status de destino que não exija motivo de perda', '23514');
          L.forEach(l => { historico(l.id, 'status', `Status "${st.nome}" excluído — lead passou para "${d.nome}"`); sysUpdate('leads', l.id, { status: d.codigo }); });
        }
        const subst = d ? d.codigo : (T.lead_statuses.filter(x => x.etapa === st.etapa && x.codigo !== st.codigo).sort((a, b) => a.ordem - b.ordem)[0] || {}).codigo;
        T.pipeline_stages.filter(x => x.status_padrao === st.codigo).forEach(x => x.status_padrao = subst);
        doDelete('lead_statuses', st.codigo, true);
        return L.length;
      },
      excluir_etapa_implantacao({ p_codigo, p_destino }) {
        if (papel() !== 'admin') throw err('Somente o administrador exclui etapas');
        const st = implStage(p_codigo); if (!st) throw err('Etapa não encontrada', '23503');
        if (st.sistema) throw err(`A etapa "${st.nome}" é usada pelas automações. Você pode renomear, mudar cor e ordem, mas não excluir.`, '23514');
        const I = T.implementations.filter(i => i.etapa === st.codigo);
        if (I.length) {
          const d = p_destino !== p_codigo ? implStage(p_destino) : null; if (!d) throw err('Escolha a etapa que vai receber as implantações', '23514');
          ctx.obs = `Etapa "${st.nome}" excluída`;
          try { I.forEach(i => sysUpdate('implementations', i.id, { etapa: d.codigo })); } finally { ctx.obs = ''; }
        }
        doDelete('implementation_stages', st.codigo, true);
        return I.length;
      },
      // ---- v1.1: convites da agenda
      convidar_evento({ p_evento, p_usuarios }) {
        const e = byId('events', p_evento);
        if (!e || e.deleted_at || !podeEditarEvento(p_evento)) throw err('Compromisso não encontrado ou sem permissão para convidar');
        let n = 0;
        for (const u of p_usuarios || []) {
          if (u === (e.responsavel_id || e.created_by)) continue;
          if (!podeVerPerfil(u)) throw err('Você só pode convidar pessoas da sua estrutura');
          if (T.event_participants.some(x => x.event_id === p_evento && x.usuario_id === u)) continue;
          sysInsert('event_participants', { id: uuid(), event_id: p_evento, usuario_id: u, convidado_por: U, created_at: nowISO() }); n++;
          notificar(u, 'convite_evento', 'Convite: ' + e.titulo, new Date(e.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (e.local ? ' · ' + e.local : '') + ' · por ' + (nome(U) || ''), '#/agenda?evento=' + e.id, e.id);
        }
        return n;
      },
      remover_convidado({ p_evento, p_usuario }) {
        const e = byId('events', p_evento);
        if (!e || e.deleted_at || !podeEditarEvento(p_evento)) throw err('Sem permissão para alterar os convidados');
        const i = T.event_participants.findIndex(x => x.event_id === p_evento && x.usuario_id === p_usuario);
        if (i >= 0) { T.event_participants.splice(i, 1); notificar(p_usuario, 'evento_cancelado', 'Você foi removido de: ' + e.titulo, null, '#/agenda', e.id); }
        return null;
      },
      responder_convite({ p_evento, p_resposta }) {
        if (!['aceito', 'recusado', 'talvez'].includes(p_resposta)) throw err('Resposta inválida', '23514');
        const x = T.event_participants.find(y => y.event_id === p_evento && y.usuario_id === U); if (!x) throw err('Convite não encontrado');
        x.resposta = p_resposta; x.respondido_em = nowISO();
        const e = byId('events', p_evento); const org = e.created_by || e.responsavel_id;
        if (org !== U) notificar(org, 'resposta_convite', (nome(U) || 'Convidado') + (p_resposta === 'aceito' ? ' confirmou presença' : p_resposta === 'recusado' ? ' recusou o convite' : ' talvez participe'), e.titulo, '#/agenda?evento=' + e.id, e.id);
        return null;
      },
      // ---- v1.1: presença
      registrar_presenca({ p_tela, p_dispositivo }) {
        if (!papel()) return null;
        T.user_presence.filter(x => x._sim && x.usuario_id !== U).forEach(x => { x.visto_em = new Date(now() - Math.floor(Math.random() * 50e3)).toISOString(); });
        const ex = T.user_presence.find(x => x.usuario_id === U); const n = nowISO();
        if (!ex) T.user_presence.push({ usuario_id: U, visto_em: n, entrou_em: n, saiu_em: null, tela: p_tela || null, dispositivo: p_dispositivo || null });
        else {
          if (new Date(ex.visto_em) < now() - 15 * 60e3 || (ex.saiu_em && ex.saiu_em >= ex.visto_em)) ex.entrou_em = n;
          Object.assign(ex, { visto_em: n, saiu_em: null, tela: p_tela || ex.tela, dispositivo: p_dispositivo || ex.dispositivo });
        }
        return null;
      },
      registrar_saida() { const ex = T.user_presence.find(x => x.usuario_id === U); if (ex) ex.saiu_em = nowISO(); return null; },
      processar_alertas_rapidos() {
        if (U && papel() !== 'admin') throw err('Rotina reservada ao sistema');
        const sla = setting('sla', { meta1_min: 5, meta2_min: 15 }), cfg = setting('notificacoes', {});
        const m1 = (sla.meta1_min || 5) * 60e3, m2 = (sla.meta2_min || 15) * 60e3, n = now().getTime();
        let nSla = 0, nEv = 0, nFu = 0;
        for (const l of T.leads) {
          if (l.deleted_at || (stage(l.etapa) || {}).tipo !== 'aberto' || l.primeiro_contato_em || (l.sla_alerta || 0) >= 2) continue;
          const ref = new Date(l.assigned_at || l.distribuido_em || l.entrada_em).getTime();
          if (ref < n - DAY || ref > n - m1) continue;
          const min = Math.round((n - ref) / 60e3);
          if (!l.corretor_id) { if (cfg.sla_fila !== false && (l.sla_alerta || 0) < 1) notificar(l.supervisor_id || l.gerente_id, 'sla_atrasado', `Lead aguardando distribuição há ${min} min`, l.nome, '#/leads/' + l.id, l.id); l.sla_alerta = 2; }
          else if (ref < n - m2) {
            if (cfg.sla_supervisor !== false) notificar(l.supervisor_id, 'sla_atrasado', `SLA estourado: ${min} min sem contato`, l.nome + ' · ' + (nome(l.corretor_id) || ''), '#/leads/' + l.id, l.id);
            if ((l.sla_alerta || 0) < 1 && cfg.sla_corretor !== false) notificar(l.corretor_id, 'sla_atrasado', `Lead sem contato há ${min} min`, l.nome, '#/leads/' + l.id, l.id);
            l.sla_alerta = 2;
          } else if ((l.sla_alerta || 0) < 1) { if (cfg.sla_corretor !== false) notificar(l.corretor_id, 'sla_atrasado', `SLA: faça o primeiro contato agora (${min} min)`, l.nome, '#/leads/' + l.id, l.id); l.sla_alerta = 1; }
          nSla++;
        }
        for (const e of T.events) {
          if (e.deleted_at || e.lembrete_enviado_em || !(e.lembrete_min > 0)) continue;
          const t = new Date(e.inicio).getTime(); if (t <= n || t > n + e.lembrete_min * 60e3) continue;
          const dest = new Set([e.responsavel_id || e.created_by, ...T.event_participants.filter(x => x.event_id === e.id && x.resposta !== 'recusado').map(x => x.usuario_id)].filter(Boolean));
          dest.forEach(u => notificar(u, 'evento_proximo', `Em ${Math.max(1, Math.round((t - n) / 60e3))} min: ${e.titulo}`, e.link_reuniao || e.local || null, '#/agenda?evento=' + e.id, e.id));
          e.lembrete_enviado_em = nowISO(); T.event_participants.filter(x => x.event_id === e.id).forEach(x => x.lembrete_enviado = true); nEv++;
        }
        for (const f of T.followups) {
          if (f.status !== 'pendente' || f.deleted_at || f.alerta_enviado >= 1) continue;
          const t = new Date(f.agendado_para).getTime(); if (t <= n || t > n + (f.lembrete_min || 15) * 60e3) continue;
          notificar(f.responsavel_id || f.corretor_id, 'followup_proximo', 'Follow-up em breve', (nm('leads', f.lead_id) || nm('clients', f.client_id) || '') + ' às ' + new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), f.lead_id ? '#/leads/' + f.lead_id : null, f.id);
          f.alerta_enviado = 1; nFu++;
        }
        return { sla: nSla, eventos: nEv, followups: nFu, relacionamento: lembretesRelacionamento(false) };
      },
      ranking_comercial({ p_inicio, p_fim }) {
        const p = papel(); if (!p) return [];
        const vis = (setting('ranking', {}) || {}).visibilidade || 'empresa';
        const mes = ym(p_fim);
        return T.profiles.filter(c => c.papel === 'corretor' && c.status === 'ativo' && !c.deleted_at
            && (vis === 'empresa' || p === 'admin' || c.id === U || (p === 'gerente' && c.gerente_id === U) || (p === 'supervisor' && c.supervisor_id === U)))
          .map(c => {
            const tm = byId('teams', c.team_id) || {};
            const sv = T.sales.filter(s => s.corretor_id === c.id && !s.deleted_at && vendido(s) && inDates(s.data_venda, p_inicio, p_fim));
            const L = T.leads.filter(l => l.corretor_id === c.id && !l.deleted_at && inPeriod(l.entrada_em, p_inicio, p_fim));
            const conv = L.filter(converted).length;
            const metas = T.goals.filter(g => !g.deleted_at && g.escopo === 'corretor' && g.usuario_id === c.id && g.tipo === 'valor' && ym(g.mes) === mes);
            return { id: c.id, nome: c.nome, team_id: c.team_id, equipe: tm.nome || null, equipe_logo: tm.logo || null, equipe_cor: tm.cor || null,
              supervisor_id: c.supervisor_id, supervisor: nome(c.supervisor_id), gerente_id: c.gerente_id, gerente: nome(c.gerente_id),
              grade: p !== 'corretor' && podeVerPerfil(c.id) ? c.grade_comissao : null, eu: c.id === U,
              vendas: sv.length, valor: Math.round(sv.reduce((a, s) => a + Number(s.valor_mensal), 0) * 100) / 100, vidas: sv.reduce((a, s) => a + s.num_vidas, 0),
              leads: L.length, convertidos: conv, conversao: L.length ? round1(100 * conv / L.length) : 0,
              meta: metas.length ? metas.reduce((a, g) => a + Number(g.valor_meta), 0) : null,
              realizado_mes: T.sales.filter(s => s.corretor_id === c.id && !s.deleted_at && vendido(s) && ym(s.data_venda) === mes).reduce((a, s) => a + Number(s.valor_mensal), 0) };
          }).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
      },
      executar_lembretes_relacionamento() { if (papel() !== 'admin') throw err('Somente o administrador executa a rotina manualmente'); return lembretesRelacionamento(true); },
      dashboard_metricas: dashboard,
      desempenho_corretores: desempenho,
      inteligencia_comercial: inteligencia,
      contexto_ia_lead({ p_lead }) { const l = leadVisivel(p_lead); return { lead: l, timeline: T.lead_history.filter(h => h.lead_id === l.id).slice(-50) }; },
      processar_alertas() {
        if (U && papel() !== 'admin') throw err('Rotina reservada ao sistema');
        const cfg = setting('leads_parados', { alerta_corretor_horas: 24, alerta_supervisor_horas: 48, redistribuir_horas: 72, redistribuir_auto: false });
        const n = now().getTime(); let n1 = 0, n2 = 0, n3 = 0, n4 = 0;
        for (const l of T.leads) {
          if (l.deleted_at || !l.corretor_id || (stage(l.etapa) || {}).tipo !== 'aberto' || l.alerta_nivel >= 3) continue;
          const ref = new Date(l.ultimo_contato_em || l.distribuido_em || l.entrada_em).getTime();
          if (ref < n - cfg.redistribuir_horas * HOUR) {
            notificar(l.supervisor_id, 'lead_parado', 'Lead elegível para redistribuição', l.nome + ' — sem movimentação', '#/leads/' + l.id, l.id); sysUpdate('leads', l.id, { alerta_nivel: 3 }); n3++;
            if (cfg.redistribuir_auto) { const e = escolherCorretor(l.id, l.corretor_id); if (e.corretor) atribuir(l.id, e.corretor, 'Redistribuição automática por inatividade', 'redistribuicao'); }
          } else if (ref < n - cfg.alerta_supervisor_horas * HOUR && l.alerta_nivel < 2) {
            notificar(l.supervisor_id, 'lead_parado', 'Lead sem atendimento na equipe', l.nome + ' — ' + (nome(l.corretor_id) || ''), '#/leads/' + l.id, l.id); sysUpdate('leads', l.id, { alerta_nivel: 2 }); n2++;
          } else if (ref < n - cfg.alerta_corretor_horas * HOUR && l.alerta_nivel < 1) {
            notificar(l.corretor_id, 'lead_sem_atendimento', 'Lead sem atendimento', l.nome, '#/leads/' + l.id, l.id); sysUpdate('leads', l.id, { alerta_nivel: 1 }); n1++;
          }
        }
        for (const f of T.followups) {
          if (f.status !== 'pendente' || f.deleted_at || f.alerta_enviado >= 2) continue;
          const t = new Date(f.agendado_para).getTime(); const contato = nm('leads', f.lead_id) || nm('clients', f.client_id);
          if (t < n) { notificar(f.responsavel_id || f.corretor_id, 'followup_vencido', 'Follow-up vencido', contato, f.lead_id ? '#/leads/' + f.lead_id : null, f.id); f.alerta_enviado = 2; n4++; }
          else if (t < n + (f.lembrete_min || 15) * 60000 && f.alerta_enviado < 1) { notificar(f.responsavel_id || f.corretor_id, 'followup_proximo', 'Follow-up em breve', contato, f.lead_id ? '#/leads/' + f.lead_id : null, f.id); f.alerta_enviado = 1; n4++; }
        }
        return { alertas_corretor: n1, alertas_supervisor: n2, redistribuiveis: n3, followups: n4 };
      },
    };

    // ==================================================================
    // SEED DE DEMONSTRAÇÃO
    // ==================================================================
    function seed() {
      const R = mulberry32(7);
      const pick = a => a[Math.floor(R() * a.length)];
      const wpick = (items) => { const tot = items.reduce((a, x) => a + x[1], 0); let r = R() * tot; for (const [v, w] of items) { if ((r -= w) <= 0) return v; } return items[0][0]; };
      const between = (a, b) => a + R() * (b - a);
      const ri = (a, b) => Math.floor(between(a, b + 1));
      const as = (uid, fn) => { const p = U; U = uid; try { return fn(); } finally { U = p; } };
      const at = (ms, fn) => { const p = clock; clock = ms; try { return fn(); } finally { clock = p; } };
      const NOW = Date.now();

      // ---- configuração (igual ao 06_config_inicial.sql)
      [['admin', 'Administrador', 100], ['gerente', 'Gerente', 70], ['supervisor', 'Supervisor', 50], ['corretor', 'Corretor', 10]].forEach(([codigo, n, nivel]) => T.roles.push({ codigo, nome: n, nivel }));
      [['usuarios.gerir', 'Equipe', 'Criar, editar e desativar usuários'], ['configuracoes.gerir', 'Configurações', 'Alterar operadoras, produtos, status e parâmetros'],
        ['leads.distribuir', 'Leads', 'Distribuir e redistribuir leads'], ['leads.importar', 'Leads', 'Importar leads via CSV/Excel'], ['leads.excluir', 'Leads', 'Excluir (arquivar) leads'],
        ['clientes.transferir', 'Clientes', 'Transferir clientes entre corretores'], ['equipe.ver', 'Equipe', 'Ver gestão da equipe e performance'], ['metas.definir', 'Metas', 'Definir metas da estrutura'],
        ['comissoes.ver', 'Comissões', 'Ver comissões da estrutura'], ['comissoes.editar', 'Comissões', 'Registrar recebimentos e pagamentos'],
        ['documentos.sensiveis', 'Documentos', 'Ver documentos sensíveis (ex.: declaração de saúde)'], ['relatorios.exportar', 'Relatórios', 'Exportar relatórios'], ['auditoria.ver', 'Auditoria', 'Consultar logs de auditoria'],
        ['presenca.ver', 'Equipe', 'Ver quem está online e a última atividade da equipe']]
        .forEach(([codigo, modulo, descricao]) => T.permissions.push({ codigo, modulo, descricao }));
      T.permissions.forEach(p => T.role_permissions.push({ role: 'admin', permission: p.codigo }));
      ['leads.distribuir', 'leads.importar', 'leads.excluir', 'clientes.transferir', 'equipe.ver', 'metas.definir', 'comissoes.ver', 'documentos.sensiveis', 'relatorios.exportar', 'presenca.ver'].forEach(p => T.role_permissions.push({ role: 'gerente', permission: p }));
      ['leads.distribuir', 'leads.importar', 'leads.excluir', 'clientes.transferir', 'equipe.ver', 'relatorios.exportar', 'presenca.ver'].forEach(p => T.role_permissions.push({ role: 'supervisor', permission: p }));
      T.role_permissions.push({ role: 'corretor', permission: 'relatorios.exportar' });
      [['novos', 'Novos', 1, '#60A5FA', 'aberto', 'novo'], ['contato', 'Contato', 2, '#38BDF8', 'aberto', 'contato_realizado'], ['qualificacao', 'Qualificação', 3, '#22D3EE', 'aberto', 'qualificado'],
        ['cotacao', 'Cotação', 4, '#818CF8', 'aberto', 'cotacao_elaboracao'], ['negociacao', 'Negociação', 5, '#A78BFA', 'aberto', 'negociacao'], ['proposta', 'Proposta', 6, '#3B82F6', 'aberto', 'proposta_enviada'],
        ['analise', 'Análise', 7, '#2563EB', 'aberto', 'em_analise'], ['pendencia', 'Pendência', 8, '#F59E0B', 'aberto', 'pendencia'], ['aprovado', 'Aprovado', 9, '#10B981', 'ganho', 'aprovado'],
        ['implantado', 'Implantado', 10, '#059669', 'ganho', 'implantado'], ['perdido', 'Perdido', 99, '#EF4444', 'perdido', 'perdido']]
        .forEach(([codigo, n, o, cor, tipo, sp]) => T.pipeline_stages.push({ codigo, nome: n, ordem: o, cor, tipo, status_padrao: sp, ativo: true,
          grupo: { novos: 'entrada', contato: 'atendimento', qualificacao: 'atendimento', cotacao: 'negociacao', negociacao: 'negociacao', proposta: 'proposta', analise: 'proposta', pendencia: 'proposta' }[codigo] || tipo,
          sistema: ['novos', 'aprovado', 'implantado', 'perdido'].includes(codigo) }));
      [['novo', 'Novo', 'novos', '#60A5FA'], ['tentativa_contato', 'Tentativa de contato', 'contato', '#38BDF8'], ['em_atendimento', 'Em atendimento', 'contato', '#38BDF8'], ['contato_realizado', 'Contato realizado', 'contato', '#0EA5E9'],
        ['qualificado', 'Qualificado', 'qualificacao', '#22D3EE'], ['cotacao_elaboracao', 'Cotação em elaboração', 'cotacao', '#818CF8'], ['cotacao_enviada', 'Cotação enviada', 'cotacao', '#6366F1'],
        ['negociacao', 'Negociação', 'negociacao', '#A78BFA'], ['follow_up', 'Follow-up', 'negociacao', '#8B5CF6'], ['proposta_enviada', 'Proposta enviada', 'proposta', '#3B82F6'], ['em_analise', 'Em análise', 'analise', '#2563EB'],
        ['pendencia', 'Pendência', 'pendencia', '#F59E0B'], ['aprovado', 'Aprovado', 'aprovado', '#10B981'], ['implantado', 'Implantado', 'implantado', '#059669'], ['perdido', 'Perdido', 'perdido', '#EF4444', true],
        ['sem_interesse', 'Sem interesse', 'perdido', '#F87171', true], ['sem_contato', 'Sem contato', 'perdido', '#FB7185', true], ['cancelado', 'Cancelado', 'perdido', '#DC2626', true]]
        .forEach(([codigo, n, etapa, cor, ex], i) => T.lead_statuses.push({ codigo, nome: n, etapa, ordem: i + 1, cor, exige_motivo: !!ex, ativo: true, sistema: ['novo', 'aprovado', 'implantado', 'perdido'].includes(codigo) }));
      [['ouro', 'Ouro', 1, '#E3B341', 'Corretores de maior produção'], ['prata', 'Prata', 2, '#B8C2D1', 'Corretores intermediários'], ['bronze', 'Bronze', 3, '#C98A5A', 'Corretores em desenvolvimento'],
        ['externo', 'Externo', 4, '#3CC8F2', 'Parceiros e corretores externos']].forEach(([codigo, n, o, cor, d]) => T.commission_grades.push({ codigo, nome: n, ordem: o, cor, descricao: d, ativo: true, created_at: nowISO(), updated_at: nowISO() }));
      [['venda_realizada', 'Venda realizada', 1, '#60A5FA', null, true, true], ['documentacao', 'Documentação', 2, '#818CF8', null, false, false], ['enviado_operadora', 'Enviado à operadora', 3, '#3B82F6', 'em_analise', false, false],
        ['em_analise', 'Em análise', 4, '#2563EB', 'em_analise', false, false], ['pendencia', 'Pendência', 5, '#F59E0B', 'pendencia', false, false], ['aprovado', 'Aprovado', 6, '#10B981', 'aprovada', false, true],
        ['implantado', 'Implantado', 7, '#059669', 'implantada', false, true], ['cancelado', 'Cancelado', 99, '#EF4444', 'cancelada', false, true]]
        .forEach(([codigo, n, o, cor, sv, ini, sis]) => T.implementation_stages.push({ codigo, nome: n, ordem: o, cor, status_venda: sv, inicial: ini, sistema: sis, ativo: true, created_at: nowISO(), updated_at: nowISO() }));
      ['Preço', 'Sem retorno', 'Fechou com concorrente', 'Rede insuficiente', 'Carência', 'Operadora', 'Desistência', 'Sem perfil', 'Dados inválidos', 'Outro'].forEach((n, i) => T.loss_reasons.push({ id: uuid(), nome: n, ordem: i + 1, ativo: true }));
      const SRC = {}; ['Google Ads', 'Meta Ads', 'Instagram', 'Facebook', 'Site', 'Indicação', 'WhatsApp', 'Lista', 'Parceiro', 'Cliente', 'Prospecção', 'Outro'].forEach(n => { const r = { id: uuid(), nome: n, ativo: true, created_at: nowISO() }; T.lead_sources.push(r); SRC[n] = r.id; });
      [['empresa', { nome: 'Atos', slogan: 'Gestão comercial para corretoras' }, 'Identificação exibida no sistema'], ['admin_master_email', 'gbastossaude@gmail.com', 'E-mail que vira administrador automaticamente no primeiro acesso'],
        ['sla', { meta1_min: 5, meta2_min: 15 }, 'Metas de tempo até o primeiro atendimento (minutos)'],
        ['leads_parados', { alerta_corretor_horas: 24, alerta_supervisor_horas: 48, redistribuir_horas: 72, redistribuir_auto: false }, 'Regras de leads sem movimentação'],
        ['distribuicao', { automatica_ao_criar: false }, 'Distribuir automaticamente leads criados sem corretor'],
        ['comissao_padrao', { pct_empresa: 100, pct_corretor: 40, pct_supervisor: 10, parcelas: 1 }, 'Regra usada quando nenhuma regra específica se aplica'],
        ['notificacoes', { novo_lead_supervisor: true, novo_lead_gerente: false, sla_corretor: true, sla_supervisor: true, sla_fila: true }, 'Avisos automáticos: novo lead para a gestão e SLA de atendimento atrasado'],
        ['relacionamento', { aniversario: true, aniversario_dias_antes: 0, dependentes: true, contato: true, contato_dias: 60, contato_max_dia: 5, hora: 8,
          msg_aniversario: 'Olá, {primeiro_nome}! 🎉 Hoje é um dia especial e eu não poderia deixar de desejar um feliz aniversário! Que seja um novo ano de muita saúde, alegria e conquistas. Conte sempre comigo. Um abraço, {corretor}.',
          msg_aniversario_dependente: 'Olá, {primeiro_nome}! Passando para desejar um feliz aniversário a {dependente}! 🎉 Muita saúde e alegria para toda a família. Um abraço, {corretor}.',
          msg_contato: 'Olá, {primeiro_nome}, tudo bem? Aqui é {corretor}. Passando para saber como está a experiência com o seu plano {operadora} e se posso ajudar em algo. Estou à disposição!' }, 'Lembretes de relacionamento'],
        ['ranking', { visibilidade: 'empresa' }, 'Ranking: empresa ou hierarquia']]
        .forEach(([chave, valor, descricao]) => T.settings.push({ chave, valor, descricao, updated_at: nowISO() }));

      const OPS = {}; const PRODS = [];
      const catalogo = {
        'Amil': [['Amil S380 QC', 'pme', 'regional', 'enfermaria', true, 2, 29], ['Amil S450 QP', 'pme', 'nacional', 'apartamento', false, 2, 99], ['Amil Bronze Individual', 'individual', 'regional', 'enfermaria', true, 1, 1]],
        'Bradesco Saúde': [['Bradesco Efetivo III', 'pme', 'nacional', 'enfermaria', false, 3, 29], ['Bradesco Nacional Flex', 'pme', 'nacional', 'apartamento', false, 3, 99]],
        'SulAmérica': [['SulAmérica Exato', 'pme', 'regional', 'enfermaria', true, 2, 29], ['SulAmérica Clássico', 'pme', 'nacional', 'apartamento', false, 2, 99], ['SulAmérica Adesão Direto', 'adesao', 'estadual', 'enfermaria', true, 1, 10]],
        'Porto Saúde': [['Porto Bronze', 'pme', 'estadual', 'enfermaria', true, 2, 29], ['Porto Prata', 'pme', 'nacional', 'apartamento', false, 2, 99]],
        'Unimed': [['Unimed Estilo', 'familiar', 'municipal', 'enfermaria', true, 1, 8], ['Unimed Nacional Flex', 'pme', 'nacional', 'apartamento', false, 2, 99]],
        'Assim': [['Assim Max', 'individual', 'municipal', 'enfermaria', true, 1, 1]],
        'Klini': [['Klini Referência', 'pme', 'municipal', 'apartamento', false, 2, 29]],
        'Hapvida': [['Hapvida Mix', 'familiar', 'regional', 'enfermaria', true, 1, 8]],
        'NotreDame Intermédica': [['NotreDame Smart 300', 'pme', 'regional', 'enfermaria', true, 2, 29], ['NotreDame Advance 600', 'pme', 'regional', 'apartamento', false, 2, 99]],
        'Alice': [['Alice Equilíbrio', 'pme', 'estadual', 'apartamento', false, 3, 99]],
      };
      const PRECO = { enfermaria: [290, 520], apartamento: [480, 980] };
      for (const [op, prods] of Object.entries(catalogo)) {
        const o = { id: uuid(), nome: op, ativo: true, created_at: nowISO(), updated_at: nowISO() }; T.operators.push(o); OPS[op] = o.id;
        for (const [n, tipo, abr, aco, cop, mn, mx] of prods) { const p = { id: uuid(), operator_id: o.id, nome: n, ramo: 'saude', tipo, abrangencia: abr, segmentacao: 'Amb + Hosp + Obst', acomodacao: aco, coparticipacao: cop, min_vidas: mn, max_vidas: mx, vigencia: 'Dia 1 ou 10', observacoes: null, ativo: true, created_at: nowISO(), updated_at: nowISO() }; T.products.push(p); PRODS.push(p); }
      }

      // ---- usuários e equipes
      const mk = (id, nome, email, papel, extra = {}) => { T.profiles.push({ ...DEFAULTS.profiles(), id, nome, email, papel, status: 'ativo', telefone: '119' + String(ri(10000000, 99999999)), created_at: new Date(NOW - 200 * DAY).toISOString(), updated_at: nowISO(), ...extra }); return id; };
      const ADM = mk('u-admin', 'Guilherme Bastos', 'gbastossaude@gmail.com', 'admin');
      const G1 = mk('u-ger-carla', 'Carla Mendes', 'carla.mendes@atos.demo', 'gerente');
      const G2 = mk('u-ger-rafael', 'Rafael Souza', 'rafael.souza@atos.demo', 'gerente');
      const S1 = mk('u-sup-bruno', 'Bruno Lima', 'bruno.lima@atos.demo', 'supervisor', { gerente_id: G1 });
      const S2 = mk('u-sup-juliana', 'Juliana Rocha', 'juliana.rocha@atos.demo', 'supervisor', { gerente_id: G1 });
      const S3 = mk('u-sup-thiago', 'Thiago Alves', 'thiago.alves@atos.demo', 'supervisor', { gerente_id: G2 });
      const team = (nome, sup) => { const t = { id: uuid(), nome, supervisor_id: sup, gerente_id: prof(sup).gerente_id, ativo: true, created_at: new Date(NOW - 200 * DAY).toISOString(), updated_at: nowISO() }; T.teams.push(t); prof(sup).team_id = t.id; return t.id; };
      const TA = team('Equipe Alpha', S1), TB = team('Equipe Beta', S2), TD = team('Equipe Delta', S3);
      const logoSvg = (letra, c1, c2, forma) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>${forma === 'escudo' ? '<path d="M48 4 86 16v30c0 24-17 38-38 46C27 84 10 70 10 46V16z" fill="url(#g)"/>' : forma === 'hex' ? '<path d="M48 4 88 27v42L48 92 8 69V27z" fill="url(#g)"/>' : '<circle cx="48" cy="48" r="44" fill="url(#g)"/>'}<text x="48" y="61" text-anchor="middle" font-family="Georgia,serif" font-size="42" font-weight="700" fill="#fff">${letra}</text></svg>`);
      Object.assign(byId('teams', TA), { logo: logoSvg('α', '#2E6BFF', '#0B2A7A', 'escudo'), cor: '#2E6BFF' });
      Object.assign(byId('teams', TB), { logo: logoSvg('β', '#3CC8F2', '#0E5A73', 'hex'), cor: '#3CC8F2' });
      Object.assign(byId('teams', TD), { logo: logoSvg('Δ', '#8B7CF6', '#3B2A8C', 'circulo'), cor: '#8B7CF6' });
      const GRADE = { 'u-cor-ana': 'ouro', 'u-cor-mariana': 'ouro', 'u-cor-fernanda': 'prata', 'u-cor-camila': 'prata', 'u-cor-diego': 'bronze', 'u-cor-lucas': 'bronze', 'u-cor-pedro': 'bronze', 'u-cor-rodrigo': 'externo' };
      const cor = (id, nome, email, tm, ufs, peso) => { const t = byId('teams', tm); mk(id, nome, email, 'corretor', { team_id: tm, supervisor_id: t.supervisor_id, gerente_id: t.gerente_id, ufs, grade_comissao: GRADE[id] || 'bronze' }); return [id, peso]; };
      const CORS = [
        cor('u-cor-ana', 'Ana Paula Freitas', 'ana.freitas@atos.demo', TA, ['SP'], 1.4), cor('u-cor-diego', 'Diego Martins', 'diego.martins@atos.demo', TA, ['SP'], 1.0),
        cor('u-cor-fernanda', 'Fernanda Costa', 'fernanda.costa@atos.demo', TA, ['SP', 'MG'], 1.1), cor('u-cor-lucas', 'Lucas Pereira', 'lucas.pereira@atos.demo', TB, ['SP'], 0.9),
        cor('u-cor-mariana', 'Mariana Silva', 'mariana.silva@atos.demo', TB, ['SP', 'PR'], 1.25), cor('u-cor-pedro', 'Pedro Henrique Ramos', 'pedro.ramos@atos.demo', TD, ['RJ'], 1.0),
        cor('u-cor-camila', 'Camila Nunes', 'camila.nunes@atos.demo', TD, ['RJ', 'ES'], 1.15), cor('u-cor-rodrigo', 'Rodrigo Dias', 'rodrigo.dias@atos.demo', TD, ['RJ'], 0.8),
      ];
      T.profiles.push({ ...DEFAULTS.profiles(), id: 'u-pendente', nome: 'Patrícia Gomes', email: 'patricia.gomes@atos.demo', papel: 'corretor', status: 'pendente', grade_comissao: 'bronze', created_at: new Date(NOW - 1 * DAY).toISOString(), updated_at: nowISO() });
      const skill = Object.fromEntries(CORS);

      // ---- campanhas, regras
      const CAMP = {};
      [['PME Outubro', 'Meta Ads', -40, 30, 4500], ['Adesão Profissionais Liberais', 'Google Ads', -120, 10, 6200], ['Indicação Premiada', 'Indicação', -170, 60, 1500], ['Google — Plano Empresarial', 'Google Ads', -90, 20, 8000]]
        .forEach(([n, s, i, f, inv]) => { const c = { id: uuid(), nome: n, source_id: SRC[s], inicio: isoDate(new Date(NOW + i * DAY)), fim: isoDate(new Date(NOW + f * DAY)), investimento: inv, ativo: true, created_at: nowISO(), updated_at: nowISO() }; T.campaigns.push(c); CAMP[n] = c.id; });
      as(ADM, () => {
        doInsert('commission_rules', { nome: 'Amil PME', operator_id: OPS['Amil'], pct_empresa: 200, pct_corretor: 80, pct_supervisor: 15, parcelas: 2 });
        doInsert('commission_rules', { nome: 'SulAmérica', operator_id: OPS['SulAmérica'], pct_empresa: 150, pct_corretor: 60, pct_supervisor: 12, parcelas: 1 });
        doInsert('commission_rules', { nome: 'Bradesco Saúde', operator_id: OPS['Bradesco Saúde'], pct_empresa: 180, pct_corretor: 70, pct_supervisor: 12, parcelas: 2 });
        doInsert('commission_rules', { nome: 'Campanha PME Outubro (bônus)', campaign_id: CAMP['PME Outubro'], pct_empresa: 200, pct_corretor: 90, pct_supervisor: 15, parcelas: 1 });
        // grade de comissão por produto: [corretora, ouro, prata, bronze, externo, supervisor] por parcela
        const GRID = {
          'Amil S380 QC': [[200, 120, 100, 80, 140, 10], [100, 50, 40, 30, 0, 5]], 'Amil S450 QP': [[220, 130, 110, 90, 150, 10], [100, 50, 40, 30, 0, 5]],
          'Bradesco Efetivo III': [[180, 110, 95, 75, 130, 10], [100, 40, 30, 20, 0, 5], [50, 20, 15, 10, 0, 0]], 'Bradesco Nacional Flex': [[200, 120, 100, 80, 140, 10], [100, 45, 35, 25, 0, 5], [50, 20, 15, 10, 0, 0]],
          'SulAmérica Exato': [[150, 90, 75, 60, 110, 8]], 'SulAmérica Clássico': [[170, 100, 85, 70, 120, 10]],
          'Porto Bronze': [[160, 95, 80, 65, 115, 8], [60, 25, 20, 15, 0, 3]], 'Porto Prata': [[180, 105, 90, 75, 125, 10], [60, 25, 20, 15, 0, 3]],
          'NotreDame Smart 300': [[150, 90, 75, 60, 110, 8]], 'Alice Equilíbrio': [[200, 115, 100, 85, 140, 10]],
        };
        const BEN = ['corretora', 'ouro', 'prata', 'bronze', 'externo', 'supervisor'];
        for (const [pn, parcelas] of Object.entries(GRID)) {
          const pr = PRODS.find(x => x.nome === pn); if (!pr) continue;
          RPC.salvar_grade_produto({ p_product: pr.id, p_linhas: parcelas.flatMap((vals, i) => vals.map((v, j) => ({ beneficiario: BEN[j], parcela: i + 1, percentual: v }))) });
        }
        doInsert('distribution_rules', { nome: 'Campanha PME Outubro → Equipe Alpha', prioridade: 10, campaign_id: CAMP['PME Outubro'], team_id: TA, metodo: 'rodizio' });
        doInsert('distribution_rules', { nome: 'Rio de Janeiro → Equipe Delta', prioridade: 20, uf: 'RJ', team_id: TD, metodo: 'rodizio' });
        doInsert('distribution_rules', { nome: 'Adesão → corretores disponíveis', prioridade: 50, campaign_id: CAMP['Adesão Profissionais Liberais'], metodo: 'disponibilidade' });
      });

      // ---- leads
      const NOMES = ['Ana', 'Beatriz', 'Carlos', 'Daniela', 'Eduardo', 'Fabiana', 'Gabriel', 'Helena', 'Igor', 'Juliana', 'Karina', 'Leonardo', 'Marcelo', 'Natália', 'Otávio', 'Paula', 'Renata', 'Sérgio', 'Tatiane', 'Vinícius',
        'Amanda', 'Bruno', 'Cláudia', 'Felipe', 'Gustavo', 'Isabela', 'João', 'Larissa', 'Mateus', 'Priscila', 'Rafael', 'Simone', 'Thiago', 'Vanessa', 'André', 'Camila', 'Diego', 'Elaine', 'Fernando', 'Letícia', 'Rodrigo', 'Aline'];
      const SOBRE = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Teixeira'];
      const EMP1 = ['Nova', 'Prime', 'Vértice', 'Horizonte', 'Alfa', 'Atlântica', 'Pinheiros', 'Paulista', 'Central', 'Aurora', 'Solar', 'Imperial', 'Delta', 'Ômega', 'Litoral', 'Serra', 'Rio', 'Vale'];
      const EMP2 = ['Tecnologia', 'Engenharia', 'Contabilidade', 'Odontologia', 'Advocacia', 'Logística', 'Comércio', 'Arquitetura', 'Consultoria', 'Alimentos', 'Clínica', 'Transportes', 'Marketing', 'Educação'];
      const CID = { SP: ['São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'Campinas', 'São Bernardo do Campo'], RJ: ['Rio de Janeiro', 'Niterói', 'Duque de Caxias'], MG: ['Belo Horizonte', 'Uberlândia'], PR: ['Curitiba', 'Londrina'], ES: ['Vitória'] };
      const DDD = { SP: '11', RJ: '21', MG: '31', PR: '41', ES: '27' };
      const perdaW = [['Preço', 30], ['Sem retorno', 22], ['Fechou com concorrente', 14], ['Rede insuficiente', 9], ['Carência', 6], ['Desistência', 9], ['Sem perfil', 5], ['Dados inválidos', 3], ['Operadora', 2]];
      const LR = n => T.loss_reasons.find(x => x.nome === n).id;
      const byTeamUF = { SP: [TA, TB], MG: [TA], PR: [TB], RJ: [TD], ES: [TD] };
      const corretoresDe = tm => CORS.filter(([id]) => prof(id).team_id === tm);
      const SUPOF = { [TA]: S1, [TB]: S2, [TD]: S3 };
      const OBS = ['Quer manter o hospital atual na rede', 'Pediu comparativo com o plano atual', 'Prefere contato por WhatsApp após as 18h', 'Tem urgência — plano atual reajustou 25%', 'Empresa com sócios e 2 funcionários', 'Gestante na família, verificar carência',
        'Indicado por cliente ativo', 'Quer coparticipação para reduzir mensalidade', 'Busca rede forte na zona sul', 'Precisa de reembolso'];
      const RESULT_NEG = ['nao_atendeu', 'caixa_postal', 'sem_resposta'];
      const PEND = ['Falta comprovante de residência do titular', 'Carta de permanência ilegível', 'Declaração de saúde incompleta', 'Divergência no CNPJ do contrato social', 'Falta RG do dependente'];

      const leadsCriados = [];
      for (let d = 240; d >= 0; d--) {
        const day = new Date(NOW - d * DAY); const dow = day.getDay();
        let n = dow === 0 ? ri(0, 1) : dow === 6 ? ri(0, 2) : ri(1, 3) + (d < 75 ? 1 : 0) + (d < 30 && R() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const t0 = new Date(day); t0.setHours(ri(8, 20), ri(0, 59), ri(0, 59), 0);
          if (t0.getTime() > NOW - 20 * 60e3) t0.setTime(NOW - ri(25, 300) * 60e3);
          const uf = wpick([['SP', 64], ['RJ', 20], ['MG', 7], ['PR', 6], ['ES', 3]]);
          const tm = pick(byTeamUF[uf]);
          const cands = corretoresDe(tm);
          const cid = wpick(cands);
          const modal = wpick([['individual', 26], ['familiar', 30], ['empresarial', 38], ['adesao', 6]]);
          const pj = modal === 'empresarial';
          const vidas = modal === 'individual' ? 1 : modal === 'familiar' ? ri(2, 5) : modal === 'adesao' ? ri(1, 3) : wpick([[ri(2, 5), 50], [ri(6, 15), 35], [ri(16, 45), 15]]);
          const fn = pick(NOMES), sn = pick(SOBRE), sn2 = pick(SOBRE);
          const src = wpick([['Meta Ads', 25], ['Google Ads', 20], ['Site', 12], ['Indicação', 12], ['Instagram', 10], ['WhatsApp', 8], ['Parceiro', 5], ['Cliente', 3], ['Prospecção', 3], ['Lista', 2]]);
          let camp = null;
          if (src === 'Meta Ads' && d < 40 && R() < 0.6) camp = CAMP['PME Outubro'];
          else if (src === 'Google Ads' && R() < 0.45) camp = modal === 'adesao' || R() < 0.4 ? CAMP['Adesão Profissionais Liberais'] : CAMP['Google — Plano Empresarial'];
          else if (src === 'Indicação' && R() < 0.5) camp = CAMP['Indicação Premiada'];
          const prodCands = PRODS.filter(p => (pj ? ['pme'] : modal === 'adesao' ? ['adesao', 'individual'] : ['individual', 'familiar', 'pme']).includes(p.tipo) && (p.min_vidas || 1) <= vidas && (p.max_vidas || 99) >= vidas);
          const prod = R() < 0.7 && prodCands.length ? pick(prodCands) : null;
          const faixa = PRECO[prod ? prod.acomodacao : 'enfermaria'];
          const preco = Math.round(between(faixa[0], faixa[1]) * vidas * (pj ? 0.9 : 1) * 100) / 100;
          const tel = DDD[uf] + '9' + String(ri(10000000, 99999999));
          const base = {
            nome: pj ? `${fn} ${sn}` : `${fn} ${sn} ${sn2}`, tipo_pessoa: pj ? 'PJ' : 'PF', modalidade: modal, empresa: pj ? `${pick(EMP1)} ${pick(EMP2)} Ltda` : null,
            cnpj: pj ? String(ri(10, 99)) + String(ri(100000, 999999)) + '0001' + String(ri(10, 99)) : null, cpf: !pj && R() < 0.55 ? String(ri(100000000, 999999999)) + String(ri(10, 99)) : null,
            whatsapp: tel, telefone: R() < 0.3 ? DDD[uf] + '3' + String(ri(1000000, 9999999)) : null, email: `${fn}.${sn}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() + ri(1, 99) + '@' + pick(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.br']),
            cidade: pick(CID[uf]), uf, num_vidas: vidas, faixa_etaria: pick(['0-18', '19-23', '24-28', '29-33', '34-38', '39-43', '44-48', '49-53', '54-58', '59+']),
            operator_id: prod ? prod.operator_id : (R() < 0.3 ? pick(Object.values(OPS)) : null), product_id: prod ? prod.id : null,
            valor_pretendido: R() < 0.7 ? Math.round(preco * between(0.85, 1.1)) : null, source_id: SRC[src], campaign_id: camp, entrada_em: t0.toISOString(),
            observacao: R() < 0.35 ? pick(OBS) : null, prioritario: R() < 0.06,
            data_nascimento: !pj && R() < 0.5 ? isoDate(new Date(1965 + ri(0, 38), ri(0, 11), ri(1, 28))) : null,
          };
          // Criação: fila do supervisor → distribuição | site/webhook → rodízio | corretor
          const via = wpick([['sup', 55], ['sys', 28], ['cor', 17]]);
          let lead;
          const ageDays = (NOW - t0.getTime()) / DAY;
          const semDistrib = ageDays < 1.2 && R() < 0.35;
          if (via === 'cor') lead = at(t0.getTime(), () => as(cid, () => doInsert('leads', base)));
          else if (via === 'sup') {
            lead = at(t0.getTime(), () => as(SUPOF[tm], () => doInsert('leads', base)));
            if (!semDistrib) at(t0.getTime() + ri(3, 45) * 60e3, () => as(SUPOF[tm], () => { ctx.metodo = pick(['manual', 'manual', 'rodizio']); try { RPC.distribuir_lead({ p_lead: lead.id, p_corretor: cid, p_metodo: ctx.metodo }); } finally { ctx.metodo = ''; } }));
          } else {
            lead = at(t0.getTime(), () => as(null, () => sysInsert('leads', { ...base, origem_externa: src === 'Site' ? 'site' : 'meta_leads', id_externo: 'ext-' + ri(100000, 999999), supervisor_id: SUPOF[tm] })));
            if (!semDistrib) at(t0.getTime() + ri(1, 5) * 1000, () => as(null, () => { const e = escolherCorretor(lead.id, null); atribuir(lead.id, e.corretor || cid, e.regra ? 'Regra: ' + e.regra : 'Rodízio', e.metodo); }));
          }
          leadsCriados.push({ id: lead.id, t0: t0.getTime(), ageDays, pj, vidas, preco, prod, uf });
        }
      }

      // ---- progressão comercial de cada lead
      for (const L0 of leadsCriados) { try { progredir(L0); } catch (e) { if (global.ATOS_DEBUG) console.warn('seed lead', e); } }
      function progredir(L0) {
        const l = byId('leads', L0.id);
        const cid = l.corretor_id; if (!cid) return;
        const sk = skill[cid] || 1;
        let t = new Date(l.distribuido_em || l.entrada_em).getTime();
        const limit = NOW - 10 * 60e3;
        const step = (ms, fn) => { t += ms; if (t > limit) return false; at(t, () => as(cid, fn)); return true; };
        const age = L0.ageDays;
        // resposta
        if (age < 0.12 && R() < 0.6) return;
        const resp = wpick([[ri(1, 5), 38 * sk], [ri(6, 15), 25], [ri(16, 60), 20], [ri(61, 240), 12], [ri(241, 1440), 5]]) * 60e3;
        if (age < 3 && R() < 0.12 / sk) return; // ainda sem atendimento
        let ok = step(resp, () => RPC.registrar_atividade({ p_lead: l.id, p_tipo: pick(['ligacao', 'whatsapp', 'whatsapp']), p_efetivo: R() < 0.55, p_resultado: null }));
        if (!ok) return;
        if (byId('leads', l.id).status === 'tentativa_contato') {
          if (!step(ri(2, 26) * HOUR, () => RPC.registrar_atividade({ p_lead: l.id, p_tipo: pick(['ligacao', 'whatsapp']), p_efetivo: R() < 0.8, p_resultado: R() < 0.2 ? pick(RESULT_NEG) : 'respondeu' }))) return;
        }
        const cur = () => byId('leads', l.id);
        const perder = (motivoW) => step(ri(1, 6) * DAY, () => RPC.mover_etapa({ p_lead: l.id, p_etapa: 'perdido', p_loss_reason: LR(motivoW || wpick(perdaW)), p_obs: null }));
        if (cur().status === 'tentativa_contato') { if (age > 10 && R() < 0.7) step(ri(3, 8) * DAY, () => RPC.alterar_status_lead({ p_lead: l.id, p_status: 'sem_contato', p_loss_reason: LR('Sem retorno') })); return; }
        // funil
        const pWin = Math.min(0.46, 0.25 * sk + (L0.pj ? 0.04 : 0) + (sk > 1.2 ? 0.05 : 0));
        const r = R();
        const alvo = r < pWin ? 'venda' : r < pWin + 0.45 ? 'perda' : 'aberto';
        const paradaPerda = wpick([['qualificacao', 30], ['cotacao', 35], ['negociacao', 20], ['proposta', 15]]);
        const paradaAberto = wpick([['qualificacao', 20], ['cotacao', 30], ['negociacao', 25], ['proposta', 15], ['analise', 10]]);
        const fim = alvo === 'venda' ? 'venda' : alvo === 'perda' ? paradaPerda : paradaAberto;
        const ORD = ['qualificacao', 'cotacao', 'negociacao', 'proposta', 'analise', 'venda'];
        const chega = e => ORD.indexOf(e) <= ORD.indexOf(fim);
        if (!step(ri(2, 30) * HOUR, () => { RPC.alterar_status_lead({ p_lead: l.id, p_status: 'qualificado' }); if (R() < 0.5) doInsert('notes', { lead_id: l.id, texto: pick(OBS), fixada: R() < 0.3 }); })) return;
        if (alvo === 'perda' && fim === 'qualificacao') { perder(); return; }
        let quote;
        const op = L0.prod ? L0.prod.operator_id : pick(Object.values(OPS));
        const pr = L0.prod || PRODS.find(p => p.operator_id === op) || null;
        if (chega('cotacao')) {
          if (!step(ri(4, 48) * HOUR, () => { quote = doInsert('quotes', { lead_id: l.id, operator_id: op, product_id: pr ? pr.id : null, num_vidas: L0.vidas, valor_mensal: L0.preco, status: 'elaboracao' }); })) return;
          if (!step(ri(2, 30) * HOUR, () => { doUpdate('quotes', quote.id, { status: 'enviada' }); RPC.registrar_atividade({ p_lead: l.id, p_tipo: 'email', p_efetivo: true, p_resultado: 'cotacao_enviada', p_descricao: 'Cotação comparativa enviada' }); })) return;
          if (R() < 0.5) step(ri(1, 3) * DAY, () => doInsert('quotes', { lead_id: l.id, operator_id: pick(Object.values(OPS)), num_vidas: L0.vidas, valor_mensal: Math.round(L0.preco * between(0.9, 1.25) * 100) / 100, status: 'enviada' }));
        }
        if (alvo === 'perda' && fim === 'cotacao') { perder(); return; }
        if (chega('negociacao')) { if (!step(ri(1, 4) * DAY, () => { RPC.alterar_status_lead({ p_lead: l.id, p_status: 'negociacao' }); RPC.registrar_atividade({ p_lead: l.id, p_tipo: pick(['ligacao', 'reuniao', 'whatsapp']), p_efetivo: true, p_resultado: 'negociando' }); })) return; }
        if (alvo === 'perda' && fim === 'negociacao') { perder(); return; }
        let prop; const numProp = String(ri(1000000, 9999999));
        if (chega('proposta')) { if (!step(ri(1, 5) * DAY, () => { prop = doInsert('proposals', { lead_id: l.id, quote_id: quote ? quote.id : null, numero: numProp, operator_id: op, product_id: pr ? pr.id : null, num_vidas: L0.vidas, valor_mensal: L0.preco, status: 'enviada' }); })) return; }
        if (alvo === 'perda' && fim === 'proposta') { if (R() < 0.6) step(ri(1, 3) * DAY, () => doUpdate('proposals', prop.id, { status: 'recusada' })); perder(pick(['Preço', 'Fechou com concorrente', 'Desistência', 'Carência'])); return; }
        if (chega('analise')) { if (!step(ri(1, 3) * DAY, () => doUpdate('proposals', prop.id, { status: 'em_analise' }))) return; }
        if (alvo !== 'venda') {
          // oportunidades antigas que ficaram paradas acabam perdidas (sem retorno / desistência)
          if (age > 40 && R() < 0.85) perder(wpick([['Sem retorno', 50], ['Desistência', 20], ['Preço', 20], ['Fechou com concorrente', 10]]));
          return;
        }
        // venda
        const vig = new Date(t + ri(8, 25) * DAY); const vigencia = isoDate(new Date(vig.getFullYear(), vig.getMonth(), R() < 0.5 ? 1 : 10));
        let conv;
        if (!step(ri(2, 8) * DAY, () => { conv = RPC.converter_em_cliente({ p_lead: l.id, p_dados: { operator_id: op, product_id: pr ? pr.id : null, valor_mensal: L0.preco, num_vidas: L0.vidas, numero_proposta: numProp, vigencia, status: 'proposta_enviada',
          dependentes: L0.vidas > 1 && !L0.pj ? Array.from({ length: Math.min(3, L0.vidas - 1) }, (_, i) => ({ nome: `${pick(NOMES)} ${l.nome.split(' ').slice(-1)[0]}`, parentesco: i === 0 ? 'cônjuge' : 'filho(a)', data_nascimento: isoDate(new Date(1985 + ri(0, 30), ri(0, 11), ri(1, 28))), valor: Math.round(L0.preco / L0.vidas * 100) / 100 })) : [] } }); })) return;
        const impl = T.implementations.find(i => i.sale_id === conv.sale_id);
        const idade = (NOW - t) / DAY;
        const dests = idade > 25 ? ['documentacao', 'enviado_operadora', 'aprovado', 'implantado'] : idade > 12 ? ['documentacao', 'enviado_operadora', 'aprovado'] : idade > 5 ? ['documentacao', 'enviado_operadora'] : ['documentacao'];
        const comPend = R() < 0.22;
        let brk = false;
        for (const e of dests) {
          if (e === 'aprovado' && comPend) {
            let pen;
            if (!step(ri(1, 3) * DAY, () => { RPC.avancar_implantacao({ p_impl: impl.id, p_etapa: 'pendencia', p_obs: 'Operadora solicitou documentação complementar' }); pen = doInsert('pendencies', { sale_id: conv.sale_id, descricao: pick(PEND), prazo: isoDate(new Date(t + 3 * DAY)) }); })) { brk = true; break; }
            if (idade < 9) { brk = true; break; }
            if (!step(ri(1, 4) * DAY, () => doUpdate('pendencies', pen.id, { status: 'resolvida', resolucao: 'Documento reenviado' }))) { brk = true; break; }
          }
          if (!step(ri(1, 4) * DAY, () => RPC.avancar_implantacao({ p_impl: impl.id, p_etapa: e, p_obs: e === 'enviado_operadora' ? 'Proposta protocolada no portal da operadora' : null, p_protocolo: e === 'enviado_operadora' ? 'PRT-' + ri(100000, 999999) : null }))) { brk = true; break; }
        }
        if (!brk && idade > 60 && R() < 0.05) step(ri(20, 40) * DAY, () => as(SUPOF[l.team_id] || ADM, () => doUpdate('sales', conv.sale_id, { status: 'cancelada', motivo_cancelamento: 'Cliente solicitou cancelamento — inadimplência' })));
      }

      // ---- metas (6 meses), calibradas pelo histórico real de cada corretor
      as(ADM, () => {
        const vend = {};
        T.sales.filter(sv => ['aprovada', 'implantada'].includes(sv.status)).forEach(sv => { const k = sv.corretor_id + '|' + sv.data_venda.slice(0, 7); vend[k] = (vend[k] || 0) + Number(sv.valor_mensal); });
        const media = cid => { const vals = Object.entries(vend).filter(([k]) => k.startsWith(cid + '|')).map(([, v]) => v); return vals.length ? vals.reduce((a, b) => a + b, 0) / 7 : 2500; };
        for (let k = -5; k <= 0; k++) {
          const d = new Date(NOW); const mes = isoDate(new Date(d.getFullYear(), d.getMonth() + k, 1));
          let tot = 0; const porSup = {}, porGer = {};
          for (const [cid] of CORS) {
            const v = Math.max(2500, Math.round(media(cid) * between(0.95, 1.3) / 100) * 100); tot += v;
            const pc = prof(cid); porSup[pc.supervisor_id] = (porSup[pc.supervisor_id] || 0) + v; porGer[pc.gerente_id] = (porGer[pc.gerente_id] || 0) + v;
            doInsert('goals', { escopo: 'corretor', usuario_id: cid, mes, tipo: 'valor', valor_meta: v });
            doInsert('goals', { escopo: 'corretor', usuario_id: cid, mes, tipo: 'qtd_vendas', valor_meta: Math.max(2, Math.round(v / 2600)) });
          }
          for (const [sp, v] of Object.entries(porSup)) doInsert('goals', { escopo: 'supervisor', usuario_id: sp, mes, tipo: 'valor', valor_meta: v });
          for (const [g, v] of Object.entries(porGer)) doInsert('goals', { escopo: 'gerente', usuario_id: g, mes, tipo: 'valor', valor_meta: v });
          doInsert('goals', { escopo: 'empresa', mes, tipo: 'valor', valor_meta: Math.round(tot * 1.05 / 1000) * 1000 });
        }
      });

      // ---- follow-ups pendentes, tarefas, agenda
      const abertos = T.leads.filter(l => l.corretor_id && (stage(l.etapa) || {}).tipo === 'aberto');
      for (const l of abertos) {
        const cid = l.corretor_id;
        if (R() < 0.18 && l.ultimo_contato_em) {
          const past = new Date(l.ultimo_contato_em).getTime() + ri(1, 3) * DAY;
          if (past < NOW - HOUR) {
            const f = at(new Date(l.ultimo_contato_em).getTime() + HOUR, () => as(cid, () => doInsert('followups', { lead_id: l.id, tipo: pick(['ligacao', 'whatsapp', 'negociacao']), agendado_para: new Date(past).toISOString(), prioridade: pick(['normal', 'alta']), observacao: 'Retomar negociação', responsavel_id: cid })));
            if (R() < 0.5) at(past + 2 * HOUR, () => as(cid, () => RPC.concluir_followup({ p_id: f.id, p_resultado: 'Cliente pediu mais prazo' })));
          }
        }
        if (!l.primeiro_contato_em && R() < 0.4) continue;
        const r = R();
        const when = r < 0.22 ? NOW - ri(2, 72) * HOUR : r < 0.5 ? (() => { const d = new Date(NOW); d.setHours(ri(9, 19), pick([0, 15, 30, 45]), 0, 0); return d.getTime(); })() : NOW + ri(1, 7) * DAY + ri(-3, 3) * HOUR;
        at(Math.min(NOW - 5 * 60e3, new Date(l.ultimo_contato_em || l.entrada_em).getTime() + 30 * 60e3), () => as(cid, () => doInsert('followups', {
          lead_id: l.id, tipo: pick(['ligacao', 'whatsapp', 'retorno', 'envio_proposta', 'cobranca_documentos', 'negociacao', 'reuniao']), agendado_para: new Date(when).toISOString(),
          prioridade: wpick([['normal', 55], ['alta', 30], ['urgente', 8], ['baixa', 7]]), observacao: pick([null, 'Confirmar rede credenciada', 'Enviar comparativo atualizado', 'Cobrar documentos do sócio', 'Ligar após reunião de sócios', 'Validar carência do plano atual']), responsavel_id: cid,
        })));
      }
      const TASKS = ['Enviar tabela atualizada', 'Cobrar documentos pendentes', 'Conferir proposta antes do envio', 'Agendar reunião com sócios', 'Solicitar carta de permanência', 'Revisar cotação com coparticipação', 'Confirmar vigência com a operadora'];
      for (let i = 0; i < 34; i++) {
        const [cid] = pick(CORS); const L = T.leads.filter(l => l.corretor_id === cid && (stage(l.etapa) || {}).tipo === 'aberto'); const l = L.length ? pick(L) : null;
        const criador = R() < 0.4 ? prof(cid).supervisor_id : cid;
        const st = wpick([['aberta', 50], ['em_andamento', 15], ['concluida', 30], ['cancelada', 5]]);
        at(NOW - ri(1, 12) * DAY, () => as(criador, () => { const tk = doInsert('tasks', { titulo: pick(TASKS), descricao: l ? 'Referente a ' + l.nome : null, lead_id: l ? l.id : null, responsavel_id: cid, prioridade: wpick([['normal', 50], ['alta', 30], ['urgente', 10], ['baixa', 10]]), prazo: new Date(NOW + ri(-4, 8) * DAY + ri(-5, 5) * HOUR).toISOString() }); if (st !== 'aberta') as(cid, () => doUpdate('tasks', tk.id, { status: st })); }));
      }
      as(S1, () => at(NOW - 2 * DAY, () => doInsert('tasks', { titulo: 'Revisar leads parados da equipe', responsavel_id: S1, prioridade: 'alta', prazo: new Date(NOW + DAY).toISOString() })));
      as(G1, () => at(NOW - 3 * DAY, () => doInsert('tasks', { titulo: 'Fechamento mensal com supervisores', responsavel_id: G1, prioridade: 'normal', prazo: new Date(NOW + 2 * DAY).toISOString() })));
      for (let i = 0; i < 26; i++) {
        const [cid] = pick(CORS); const L = T.leads.filter(l => l.corretor_id === cid && ['negociacao', 'proposta', 'cotacao'].includes(l.etapa)); const l = L.length ? pick(L) : null;
        const d = new Date(NOW + ri(-3, 12) * DAY); d.setHours(ri(9, 18), pick([0, 30]), 0, 0);
        as(cid, () => at(NOW - 3 * DAY, () => doInsert('events', { titulo: l ? pick(['Reunião de apresentação', 'Assinatura da proposta', 'Call de negociação']) + ' — ' + l.nome.split(' ')[0] : pick(['Treinamento de produto', 'Reunião de equipe', 'Visita a parceiro']),
          tipo: l ? pick(['reuniao', 'ligacao', 'visita']) : 'compromisso', inicio: d.toISOString(), fim: new Date(d.getTime() + pick([30, 45, 60]) * 60e3).toISOString(), local: pick(['Online (Meet)', 'Escritório', 'Cliente', null]), lead_id: l ? l.id : null, responsavel_id: cid })));
      }

      // ---- reuniões e treinamentos com convites
      const inicioEm = (dias, hora, min = 0) => { const d = new Date(NOW + dias * DAY); d.setHours(hora, min, 0, 0); return d.getTime(); };
      const responder = (ev, uid, resp) => as(uid, () => at(NOW - ri(1, 20) * HOUR, () => RPC.responder_convite({ p_evento: ev.id, p_resposta: resp })));
      const reuniao = (org, dados, convidados, respostas = 0.7) => at(NOW - ri(2, 4) * DAY, () => as(org, () => {
        const ev = doInsert('events', { responsavel_id: org, lembrete_min: 30, ...dados });
        RPC.convidar_evento({ p_evento: ev.id, p_usuarios: convidados });
        convidados.forEach(u => { if (R() < respostas) responder(ev, u, wpick([['aceito', 75], ['talvez', 15], ['recusado', 10]])); });
        return ev;
      }));
      const timeDe = sup => T.profiles.filter(x => x.supervisor_id === sup && x.papel === 'corretor' && x.status === 'ativo').map(x => x.id);
      [[S1, 1], [S2, 2], [S3, 3]].forEach(([sup, dia]) => {
        const i0 = inicioEm(dia, 9, 0);
        reuniao(sup, { titulo: 'Reunião semanal da equipe', tipo: 'reuniao', inicio: new Date(i0).toISOString(), fim: new Date(i0 + 60 * 60e3).toISOString(), local: 'Sala de reuniões', link_reuniao: 'https://meet.google.com/atos-' + ri(100, 999), descricao: 'Pipeline da semana, leads parados e metas.' }, timeDe(sup));
      });
      const tr = inicioEm(2, 14, 30);
      reuniao(G1, { titulo: 'Treinamento: portfólio Bradesco e Amil PME', tipo: 'treinamento', inicio: new Date(tr).toISOString(), fim: new Date(tr + 90 * 60e3).toISOString(), local: 'Online', link_reuniao: 'https://meet.google.com/atos-treino', descricao: 'Regras de aceitação, carências e nova grade de comissão.' },
        [S1, S2, ...timeDe(S1), ...timeDe(S2)], 0.8);
      const tr2 = inicioEm(5, 10, 0);
      reuniao(ADM, { titulo: 'Treinamento do sistema Atos — gestores', tipo: 'treinamento', inicio: new Date(tr2).toISOString(), fim: new Date(tr2 + 60 * 60e3).toISOString(), local: 'Online', link_reuniao: 'https://meet.google.com/atos-sistema', descricao: 'Distribuição, SLA, grade de comissão e painel de quem está online.' },
        [G1, G2, S1, S2, S3], 0.6);
      const logo = NOW + 25 * 60e3;
      at(NOW - 3 * HOUR, () => as(S1, () => { const ev = doInsert('events', { titulo: 'Alinhamento rápido — leads do dia', tipo: 'reuniao', inicio: new Date(logo).toISOString(), fim: new Date(logo + 20 * 60e3).toISOString(), local: 'Online', link_reuniao: 'https://meet.google.com/atos-alinhamento', lembrete_min: 30, responsavel_id: S1 }); RPC.convidar_evento({ p_evento: ev.id, p_usuarios: timeDe(S1) }); }));
      const passado = inicioEm(-4, 9, 0);
      reuniao(S1, { titulo: 'Reunião semanal da equipe', tipo: 'reuniao', inicio: new Date(passado).toISOString(), fim: new Date(passado + 60 * 60e3).toISOString(), local: 'Sala de reuniões', lembrete_min: 30 }, timeDe(S1), 1);
      T.events.filter(e => new Date(e.inicio).getTime() < NOW).forEach(e => { e.lembrete_enviado_em = e.inicio; });

      // ---- comissões: recebimentos e pagamentos
      for (const c of T.commissions) {
        if (['cancelada', 'estornada'].includes(c.status)) continue;
        const dp = new Date(c.data_prevista + 'T12:00:00').getTime();
        if (dp < NOW - 20 * DAY) { c.status = 'paga'; c.comissao_recebida = c.comissao_prevista; c.data_recebida = isoDate(new Date(dp + ri(0, 5) * DAY)); }
        else if (dp < NOW) { c.status = R() < 0.6 ? 'recebida' : 'em_processamento'; if (c.status === 'recebida') { c.comissao_recebida = c.comissao_prevista; c.data_recebida = isoDate(new Date(dp + ri(0, 3) * DAY)); } }
      }
      // pendências abertas em vendas ainda em análise
      T.sales.filter(sv => ['em_analise', 'aprovada'].includes(sv.status)).slice(0, 4).forEach((sv, i) => as(sv.corretor_id, () => at(NOW - ri(4, 60) * HOUR, () =>
        doInsert('pendencies', { sale_id: sv.id, descricao: PEND[i % PEND.length], prazo: isoDate(new Date(NOW + ri(-2, 4) * DAY)) }))));
      // aniversariantes de hoje (para o alerta)
      const act = T.clients.filter(c => c.status === 'ativo' && c.tipo_pessoa === 'PF');
      const nascEm = dias => { const d = new Date(NOW + dias * DAY); return isoDate(new Date(1965 + ri(0, 35), d.getMonth(), d.getDate())); };
      [0, 0, 0, 1, 2, 4, 6, 9, 13, 20, 26].forEach((dd, i) => { if (act[i]) act[i].data_nascimento = nascEm(dd); });
      T.dependents.filter(d => !d.deleted_at).slice(0, 3).forEach((d, i) => { d.data_nascimento = isoDate(new Date(2008 + ri(0, 12), new Date(NOW + [0, 3, 11][i] * DAY).getMonth(), new Date(NOW + [0, 3, 11][i] * DAY).getDate())); });

      // ---- ajustes finais com o relógio real
      clock = null;
      as(null, () => { for (const l of T.leads) if (l.temperatura_auto) l.temperatura = calcTemperatura(l); });
      as(null, () => RPC.processar_alertas());
      as(null, () => RPC.processar_alertas_rapidos());
      as(null, () => { if (setting('relacionamento_ultimo') !== hojeSP()) lembretesRelacionamento(true); });
      // quem está online agora (demonstração)
      [['u-sup-bruno', 0.2, 'Dashboard', 'Chrome · Windows'], ['u-cor-ana', 0.4, 'CRM', 'Chrome · Windows'], ['u-cor-diego', 0.9, 'Leads', 'Celular · Android'], ['u-cor-mariana', 1.2, 'Agenda', 'Safari · iPhone'],
        ['u-cor-pedro', 0.5, 'Lead 360', 'Chrome · macOS'], ['u-ger-carla', 1.5, 'Ranking', 'Chrome · macOS'], ['u-cor-fernanda', 8, 'Follow-ups', 'Chrome · Windows'], ['u-cor-camila', 12, 'Vendas', 'Celular · Android'],
        ['u-cor-lucas', 140, 'CRM', 'Chrome · Windows', true], ['u-sup-juliana', 55, 'Equipe', 'Edge · Windows', true], ['u-cor-rodrigo', 60 * 50, 'Leads', 'Celular · iPhone', true]]
        .forEach(([id, min, tela, disp, saiu]) => { const v = new Date(NOW - min * 60e3).toISOString(); T.user_presence.push({ usuario_id: id, visto_em: v, entrou_em: new Date(NOW - (min + ri(20, 240)) * 60e3).toISOString(), saiu_em: saiu ? v : null, tela, dispositivo: disp, _sim: !saiu && min < 2 }); });
      const porUser = groupBy(T.notifications, n => n.usuario_id);
      T.notifications = [];
      for (const [, arr] of porUser) { arr.sort((a, b) => a.created_at < b.created_at ? 1 : -1); arr.slice(0, 40).forEach((n, i) => { n.lida = i >= 7; T.notifications.push(n); }); }
      // documentos de exemplo (sem arquivo real)
      T.clients.slice(0, 30).forEach(c => as(c.corretor_id, () => at(new Date(c.created_at).getTime() + HOUR, () => {
        doInsert('documents', { client_id: c.id, tipo: c.tipo_pessoa === 'PJ' ? 'cartao_cnpj' : 'rg', nome_arquivo: (c.tipo_pessoa === 'PJ' ? 'cartao-cnpj' : 'rg-titular') + '.pdf', tamanho: ri(80, 900) * 1024, mime: 'application/pdf', storage_path: null });
        if (R() < 0.5) doInsert('documents', { client_id: c.id, tipo: 'declaracao_saude', nome_arquivo: 'declaracao-de-saude.pdf', tamanho: ri(80, 400) * 1024, mime: 'application/pdf', sensivel: true, storage_path: null });
      })));
    }
    function groupBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

    // ==================================================================
    // API pública (mesma interface do Supabase)
    // ==================================================================
    const t0 = performance.now();
    seed();
    const seedMs = Math.round(performance.now() - t0);
    let lastUser = null; try { lastUser = sessionStorage.getItem('atos.demo.user'); } catch (e) { /* sem storage */ }
    if (lastUser && prof(lastUser) && prof(lastUser).status === 'ativo') U = lastUser;

    const delay = v => new Promise(r => setTimeout(() => r(v), 40 + Math.random() * 60));
    const wrap = fn => (...a) => { try { return delay(fn(...a)); } catch (e) { return new Promise((_, rej) => setTimeout(() => rej(e), 30)); } };
    const api = {
      mode: 'demo', seedMs,
      session: wrap(() => U),
      onAuth(fn) { listeners.push(fn); },
      signIn: wrap((email) => {
        const p = T.profiles.find(x => x.email.toLowerCase() === String(email || '').trim().toLowerCase());
        if (!p) throw err('E-mail não encontrado na demonstração. Use um dos perfis listados.');
        if (p.status !== 'ativo') throw err('Seu acesso ainda não foi aprovado pelo administrador.');
        U = p.id; try { sessionStorage.setItem('atos.demo.user', U); } catch (e) { /* */ }
        audit('login', 'profiles', U, null, null);
        return null;
      }),
      signUp: wrap((email, pw, nomeU, grade) => {
        if (T.profiles.some(x => x.email === email)) throw err('E-mail já cadastrado.', '23505');
        T.profiles.push({ ...DEFAULTS.profiles(), id: uuid(), nome: nomeU || email.split('@')[0], email, papel: 'corretor', status: 'pendente', grade_comissao: grade || 'bronze', created_at: nowISO(), updated_at: nowISO() });
        return null;
      }),
      resetPassword: wrap(() => null),
      updatePassword: wrap(() => null),
      signOut: wrap(() => { U = null; try { sessionStorage.removeItem('atos.demo.user'); } catch (e) { /* */ } return null; }),
      switchUser: wrap(id => { U = id; try { sessionStorage.setItem('atos.demo.user', id); } catch (e) { /* */ } return null; }),
      demoUsers() { return T.profiles.filter(p => p.status === 'ativo').map(p => ({ id: p.id, nome: p.nome, email: p.email, papel: p.papel, equipe: nm('teams', p.team_id) })); },
      list: wrap((view, o) => query(rowsOf(view), o || {})),
      all: wrap((view, o) => query(rowsOf(view), { ...(o || {}), limit: null }).rows),
      get: wrap((view, id) => { const r = rowsOf(view).find(x => x.id === id); return r ? clone(r) : null; }),
      insert: wrap((t, row) => clone(doInsert(t, row, false))),
      insertMany: wrap((t, rows) => rows.map(r => clone(doInsert(t, r, false)))),
      update: wrap((t, id, patch, key) => { const r = doUpdate(t, id, patch, false, key); if (!r) throw err('Registro não encontrado ou sem permissão de acesso.'); return clone(r); }),
      upsert: wrap((t, row) => { const k = KEY[t] || 'id'; const ex = T[t].find(r => r[k] === row[k]); return [clone(ex ? doUpdate(t, row[k], row, false) : doInsert(t, row, false))]; }),
      remove: wrap((t, id, key) => { if (!doDelete(t, id, false, key)) throw err('Registro não encontrado ou sem permissão de acesso.'); return null; }),
      removeWhere: wrap((t, match) => { const rows = T[t].filter(r => Object.entries(match).every(([k, v]) => r[k] === v)); if (!rows.length) return null; if (!canWrite(t, rows[0], 'delete')) throw err('Você não tem permissão para esta ação.'); T[t] = T[t].filter(r => !rows.includes(r)); rows.forEach(r => auditoria(t, null, r, 'DELETE')); return null; }),
      softDelete: wrap((t, id) => { const r = doUpdate(t, id, { deleted_at: nowISO() }, false); if (!r) throw err('Registro não encontrado ou sem permissão de acesso.'); return clone(r); }),
      rpc: wrap((fn, params) => { if (!RPC[fn]) throw err('Função não encontrada: ' + fn, '42883'); return clone(RPC[fn](params || {})); }),
      upload: wrap((path, file) => { blobs[path] = URL.createObjectURL(file); return path; }),
      fileUrl: wrap(path => { if (!blobs[path]) throw err('Arquivo de exemplo sem conteúdo na demonstração.', '404'); return blobs[path]; }),
      tick() { const p = U; U = null; try { RPC.processar_alertas_rapidos(); } catch (e) { /* */ } finally { U = p; } },
      subscribe(uid, fn) { const f = n => { if (n.usuario_id === uid) fn(clone(n)); }; notifSubs.push(f); return () => { const i = notifSubs.indexOf(f); if (i >= 0) notifSubs.splice(i, 1); }; },
      _debug: { T, get U() { return U; } },
    };
    return api;
  }

  global.DemoBackend = { create };
})(window);
