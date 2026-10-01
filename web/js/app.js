/* =====================================================================
   ATOS SISTEMA — app.js
   Inicialização, autenticação, shell (sidebar/topbar), roteador,
   busca global, notificações, ações rápidas e dados de referência.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, $, clear, icon, fmt, toast, modal, drawer, avatar, menu, debounce, dates, empty } = global.U;
  const API = global.API;
  const Views = global.Views = global.Views || {};

  const PAPEIS = { admin: 'Administrador', gerente: 'Gerente', supervisor: 'Supervisor', corretor: 'Corretor' };

  const App = global.App = {
    me: null, papel: null, perms: new Set(), lk: {}, route: { name: '', params: {} }, counts: {},
    can(p) { return this.papel === 'admin' || this.perms.has(p); },
    is(...papeis) { return papeis.includes(this.papel); },
    gestor() { return ['admin', 'gerente', 'supervisor'].includes(this.papel); },
    go(path) {
      const target = path.startsWith('#') ? path : '#' + path;
      try { if (location.hash !== target) { location.hash = target; return; } } catch (e) { /* ambiente sem hash */ }
      this.render(target);
    },
    reload() { this.render(this._current || '#/dashboard', true); },
    /** mostra o erro de forma compreensível; o detalhe técnico fica só no console */
    async err(e) {
      if (!e) return;
      console.error('[Atos]', e);
      const msg = e instanceof global.ApiError ? e.message : global.apiFriendly(e);
      if (e.sessao || msg === 'Sua sessão expirou. Entre novamente.') return sessaoExpirada();
      toast(msg, 'err');
    },
  };
  // qualquer promessa rejeitada sem tratamento vira um aviso claro, nunca um erro silencioso
  global.addEventListener('unhandledrejection', ev => {
    ev.preventDefault(); App.err(ev.reason);
    // se uma seção ficou "carregando" por causa da falha, mostra o erro com a opção de tentar de novo
    const motivo = ev.reason instanceof global.ApiError ? ev.reason : { message: global.apiFriendly(ev.reason) };
    if (motivo.sessao) return;
    document.querySelectorAll('#content .skel-wrap:not(.page-loading .skel-wrap)').forEach(sk => sk.replaceWith(U.errorState(motivo, () => App.reload())));
  });
  global.addEventListener('error', ev => { if (ev.error) console.error('[Atos] erro inesperado', ev.error); });

  async function sessaoExpirada() {
    if (!App.me || App._saindo) return;
    App._saindo = true;
    try { await API.signOut(); } catch (e) { /* */ }
    App._saindo = false;
    loginScreen('Sua sessão expirou. Entre novamente para continuar de onde parou.');
  }

  // ------------------------------------------------------------------
  // Conexão: aviso fixo enquanto estiver sem internet
  // ------------------------------------------------------------------
  function avisoConexao() {
    let bar = document.getElementById('offline-bar');
    if (navigator.onLine !== false) {
      if (bar) { bar.remove(); if (App.me && App._estavaOffline) { toast('Conexão restabelecida'); App.reload(); App.refreshCounts(); } }
      App._estavaOffline = false;
      return;
    }
    App._estavaOffline = true;
    if (!bar) document.body.appendChild(h('div', { id: 'offline-bar', role: 'alert' }, icon('alert', 15), 'Sem conexão com a internet. As alterações não serão salvas até a conexão voltar.'));
  }
  global.addEventListener('online', avisoConexao);
  global.addEventListener('offline', avisoConexao);

  // ------------------------------------------------------------------
  // Tema (escuro, claro ou o do sistema)
  // ------------------------------------------------------------------
  App.tema = () => U.store('tema') || 'escuro';
  App.aplicarTema = (t = App.tema()) => {
    const claro = t === 'claro' || (t === 'sistema' && global.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.dataset.theme = claro ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = claro ? '#F5F7FB' : '#05070B';
    const cs = document.querySelector('meta[name="color-scheme"]'); if (cs) cs.content = claro ? 'light' : 'dark';
  };
  App.aplicarTema();
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (App.tema() === 'sistema') App.aplicarTema(); }); } catch (e) { /* */ }

  // ------------------------------------------------------------------
  // Marca (SVG)
  // ------------------------------------------------------------------
  App.mark = (size = 30) => {
    const span = h('span', { class: 'brand-mark', style: { width: size + 'px', height: size + 'px' } });
    span.innerHTML = `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true"><rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0B1220" stroke="#2E6BFF" stroke-opacity=".55"/><path d="M8.5 24 16 7.5 23.5 24" fill="none" stroke="#2E6BFF" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><path d="M11.8 18.2h8.4" stroke="#E6EBF4" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    return span;
  };
  App.brand = (sub = 'SISTEMA') => h('div', { class: 'brand' }, App.mark(30), h('div', { class: 'brand-word' }, 'ATOS', h('small', null, sub)));

  // ------------------------------------------------------------------
  // Dados de referência (cadastros)
  // ------------------------------------------------------------------
  App.loadLookups = async function () {
    const [stages, statuses, ops, prods, srcs, camps, lrs, teams, users, settings, rp, implStages, grades] = await Promise.all([
      API.all('pipeline_stages', { order: [['ordem', true]] }), API.all('lead_statuses', { order: [['ordem', true]] }),
      API.all('operators', { isNull: ['deleted_at'], order: [['nome', true]] }), API.all('v_products', { order: [['nome', true]] }),
      API.all('lead_sources', { isNull: ['deleted_at'], order: [['nome', true]] }), API.all('v_campaigns', { order: [['nome', true]] }),
      API.all('loss_reasons', { order: [['ordem', true]] }), API.all('v_teams', { order: [['nome', true]] }),
      API.all('v_profiles', { order: [['nome', true]] }), API.all('settings', {}), API.all('role_permissions', { eq: { role: App.papel } }),
      API.all('implementation_stages', { order: [['ordem', true]] }).catch(() => []), API.all('commission_grades', { order: [['ordem', true]] }).catch(() => []),
    ]);
    const map = (arr, k = 'id') => Object.fromEntries(arr.map(x => [x[k], x]));
    App.perms = new Set(rp.map(r => r.permission));
    App.lk = {
      stages, stagesMap: map(stages, 'codigo'), statuses, statusMap: map(statuses, 'codigo'),
      ops, opsMap: map(ops), prods, prodsMap: map(prods), srcs, srcMap: map(srcs), camps, campMap: map(camps),
      lrs, lrMap: map(lrs), teams, teamMap: map(teams), users, userMap: map(users),
      corretores: users.filter(u => u.papel === 'corretor' && u.status === 'ativo'),
      supervisores: users.filter(u => u.papel === 'supervisor' && u.status === 'ativo'),
      gerentes: users.filter(u => u.papel === 'gerente' && u.status === 'ativo'),
      settings: Object.fromEntries(settings.map(s => [s.chave, s.valor])),
      implStages, implMap: map(implStages, 'codigo'), grades, gradeMap: map(grades, 'codigo'),
    };
  };
  App.opt = {
    stages: (all = true) => App.lk.stages.filter(s => s.ativo && (all || s.tipo !== 'perdido')).map(s => ({ value: s.codigo, label: s.nome })),
    statuses: () => App.lk.statuses.filter(s => s.ativo).map(s => ({ value: s.codigo, label: s.nome })),
    ops: () => App.lk.ops.filter(o => o.ativo).map(o => ({ value: o.id, label: o.nome })),
    prods: (op) => App.lk.prods.filter(p => p.ativo && (!op || p.operator_id === op)).map(p => ({ value: p.id, label: op ? p.nome : `${p.nome} · ${p.operadora_nome}` })),
    srcs: () => App.lk.srcs.filter(s => s.ativo).map(s => ({ value: s.id, label: s.nome })),
    camps: () => App.lk.camps.filter(c => c.ativo).map(c => ({ value: c.id, label: c.nome })),
    lrs: () => App.lk.lrs.filter(l => l.ativo).map(l => ({ value: l.id, label: l.nome })),
    corretores: () => App.lk.corretores.map(u => ({ value: u.id, label: u.nome + (u.team_nome ? ' · ' + u.team_nome : '') })),
    supervisores: () => App.lk.supervisores.map(u => ({ value: u.id, label: u.nome })),
    gerentes: () => App.lk.gerentes.map(u => ({ value: u.id, label: u.nome })),
    teams: () => App.lk.teams.map(t => ({ value: t.id, label: t.nome })),
    grades: () => App.lk.grades.filter(g => g.ativo).map(g => ({ value: g.codigo, label: g.nome })),
    ufs: () => ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].map(u => ({ value: u, label: u })),
    modalidades: () => [{ value: 'individual', label: 'Individual' }, { value: 'familiar', label: 'Familiar' }, { value: 'empresarial', label: 'Empresarial (PME)' }, { value: 'adesao', label: 'Adesão' }],
  };
  App.grupo = etapa => (App.lk.stagesMap[etapa] || {}).grupo || null;
  App.ganho = l => !!l.client_id || App.grupo(l.etapa) === 'ganho';
  App.perdido = l => App.grupo(l.etapa) === 'perdido';
  App.stageBadge = (codigo) => { const s = App.lk.stagesMap[codigo] || {}; return h('span', { class: 'pill-stage', style: { '--c': s.cor } }, h('i'), s.nome || codigo); };
  App.statusBadge = (codigo) => { const s = App.lk.statusMap[codigo] || {}; return U.badge(s.nome || codigo, s.cor, 'dot'); };
  /** logotipo da equipe (imagem enviada) ou selo com as iniciais na cor da equipe */
  App.teamLogo = (t, size = 32) => {
    t = t || {};
    const cor = t.cor || t.equipe_cor || '#2E6BFF', logo = t.logo || t.equipe_logo, nomeT = t.nome || t.equipe || 'Equipe';
    const box = h('span', { class: 'team-logo', style: { width: size + 'px', height: size + 'px', '--c': cor }, title: nomeT });
    if (logo) box.appendChild(h('img', { src: logo, alt: 'Logotipo ' + nomeT, loading: 'lazy' }));
    else { box.classList.add('sem'); box.style.fontSize = Math.round(size * 0.36) + 'px'; box.textContent = fmt.initials(nomeT.replace(/^equipe\s+/i, '')); }
    return box;
  };
  /** preenche um modelo de mensagem: {nome} {primeiro_nome} {corretor} {operadora} {produto} {idade} {dependente} {empresa} */
  App.preencherMensagem = (modelo, v) => String(modelo || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null && v[k] !== '' ? String(v[k]) : m.startsWith('{operadora') ? 'de saúde' : ''))
    .replace(/\s+([,.!])/g, '$1').replace(/ {2,}/g, ' ').trim();
  App.gradeBadge = (codigo) => { const g = App.lk.gradeMap[codigo]; return g ? U.badge(g.nome, g.cor, 'square grade') : h('span', { class: 'dim' }, '—'); };
  App.person = (nome, size = 24) => nome ? h('span', { class: 'person' }, avatar(nome, size), h('span', null, nome)) : h('span', { class: 'dim' }, '—');

  // ------------------------------------------------------------------
  // Boot / autenticação
  // ------------------------------------------------------------------
  const root = () => document.getElementById('app');
  function bootScreen(msg = 'Carregando') {
    clear(root()).appendChild(h('div', { class: 'boot' }, h('div', { class: 'boot-inner' }, App.brand(), h('div', { class: 'boot-bar' }, h('div')), msg)));
  }

  App.start = async function () {
    bootScreen(API.mode === 'demo' ? 'Preparando demonstração' : 'Conectando');
    try {
      await API.ready();
      const uid = await API.session();
      if (!uid) return loginScreen();
      await enter(uid);
      if (global.ATOS_LINK_SENHA) { try { history.replaceState(null, '', location.pathname + '#/dashboard'); } catch (e) { /* */ } recoveryScreen(global.ATOS_LINK_SENHA); global.ATOS_LINK_SENHA = null; }
    } catch (e) { App.err(e); loginScreen(); }
    if (API.onAuth && !App._authOuvindo) {
      App._authOuvindo = true;
      API.onAuth((ev) => {
        if (ev === 'SIGNED_OUT' && App.me && !App._saindo) loginScreen(App._saidaVoluntaria ? null : 'Sua sessão terminou. Entre novamente para continuar.');
        if (ev === 'PASSWORD_RECOVERY') recoveryScreen();
      });
    }
    avisoConexao();
  };

  async function enter(uid) {
    const me = await API.get('v_profiles', uid);
    if (!me) throw new Error('Perfil não encontrado. Fale com o administrador.');
    if (me.status !== 'ativo') { pendingScreen(me); return; }
    App.me = me; App.papel = me.papel;
    await App.loadLookups();
    shell();
    const start = (() => { try { return location.hash; } catch (e) { return ''; } })();
    App.render(start && start.length > 2 ? start : (App.papel === 'corretor' ? '#/carteira' : '#/dashboard'));
    App.refreshCounts();
    startLive();
  }

  // ------------------------------------------------------------------
  // Tempo real: presença, notificações ao vivo e lembretes
  // ------------------------------------------------------------------
  const TELAS = { dashboard: 'Dashboard', carteira: 'Minha carteira', inteligencia: 'Inteligência', crm: 'CRM', leads: 'Leads', lead360: 'Lead 360', followups: 'Follow-ups', agenda: 'Agenda', tarefas: 'Tarefas',
    vendas: 'Vendas', venda: 'Venda', implantacao: 'Implantação', clientes: 'Clientes', cliente360: 'Cliente 360', equipe: 'Equipe', corretor: 'Equipe', ranking: 'Ranking', metas: 'Metas',
    comissoes: 'Comissões', relatorios: 'Relatórios', relacionamento: 'Relacionamento', desempenho: 'Desempenho', operadoras: 'Operadoras', produtos: 'Produtos', notificacoes: 'Notificações', configuracoes: 'Configurações', online: 'Quem está online' };
  const dispositivo = () => { const ua = navigator.userAgent || ''; const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Mac OS/i.test(ua) ? 'macOS' : /Windows/i.test(ua) ? 'Windows' : 'Linux';
    const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Navegador'; return (/Mobi/i.test(ua) ? 'Celular · ' : '') + nav + ' · ' + so; };
  let live = null;
  App.presenca = () => { if (App.me) API.rpc('registrar_presenca', { p_tela: TELAS[App.route.name] || App.route.name || null, p_dispositivo: dispositivo() }).catch(() => {}); };
  const TOAST_TIPO = { sla_atrasado: 'err', evento_cancelado: 'err', convite_evento: 'info', evento_proximo: 'info', novo_lead: 'info', lead_recebido: 'info' };
  function avisar(n) {
    if (!n || !App.me || n.usuario_id !== App.me.id) return;
    App._ultimaNotif = n.created_at > (App._ultimaNotif || '') ? n.created_at : App._ultimaNotif;
    toast(n.titulo + (n.mensagem ? ' — ' + n.mensagem : ''), TOAST_TIPO[n.tipo] || 'ok', 6500);
    const bell = document.querySelector('.icon-btn.bell'); if (bell) { bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring'); }
    try { if (document.hidden && global.Notification && Notification.permission === 'granted') { const nn = new Notification('Atos · ' + n.titulo, { body: n.mensagem || '', tag: n.id }); nn.onclick = () => { global.focus(); if (n.link) App.go(n.link.replace(/^#/, '')); nn.close(); }; } } catch (e) { /* */ }
    App.refreshCounts();
  }
  async function checarNovas() {
    try {
      const { rows } = await API.list('notifications', { eq: { lida: false }, order: [['created_at', false]], limit: 5 });
      if (App._ultimaNotif === undefined) { App._ultimaNotif = rows[0] ? rows[0].created_at : ''; return; }
      rows.filter(n => n.created_at > App._ultimaNotif).reverse().forEach(avisar);
    } catch (e) { /* */ }
  }
  function startLive() {
    stopLive();
    App._ultimaNotif = undefined;
    const uid = App.me.id;
    const unsub = API.subscribe ? API.subscribe(uid, n => { if (!App._ultimaNotif || n.created_at > App._ultimaNotif) avisar(n); }) : null;
    checarNovas();
    App.presenca();
    let ultimaAcao = Date.now();
    const marca = () => { ultimaAcao = Date.now(); };
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, marca, { passive: true }));
    const t1 = setInterval(() => { if (Date.now() - ultimaAcao < 5 * 60e3 && !document.hidden) App.presenca(); }, 60e3);
    // em segundo plano não consulta o servidor; ao voltar para a aba, atualiza na hora
    const ciclo = () => { if (document.hidden) return; if (API.tick) API.tick(); checarNovas(); App.refreshCounts(); };
    const t2 = setInterval(ciclo, API.mode === 'demo' ? 20e3 : 45e3);
    let ocultoDesde = 0;
    const visib = () => { if (document.hidden) { ocultoDesde = Date.now(); return; } if (ocultoDesde && Date.now() - ocultoDesde > 30e3) { ciclo(); App.presenca(); } ocultoDesde = 0; };
    document.addEventListener('visibilitychange', visib);
    const sair = () => { try { API.rpc('registrar_saida', {}); } catch (e) { /* */ } };
    global.addEventListener('pagehide', sair);
    live = { stop() { clearInterval(t1); clearInterval(t2); unsub && unsub(); ['click', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.removeEventListener(ev, marca)); global.removeEventListener('pagehide', sair); document.removeEventListener('visibilitychange', visib); } };
  }
  function stopLive() { if (live) { live.stop(); live = null; } }
  App.stopLive = stopLive;

  function loginScreen(aviso) {
    stopLive();
    App.me = null;
    document.title = 'Entrar · Atos';
    const email = h('input', { type: 'email', id: 'login_email', placeholder: 'seu@email.com.br', autocomplete: 'username', inputmode: 'email', required: true, value: U.store('ultimo_email') || '' });
    const pw = h('input', { type: 'password', id: 'login_pw', placeholder: 'Sua senha', autocomplete: 'current-password', required: true });
    const ver = h('button', { type: 'button', class: 'pw-toggle', 'aria-label': 'Mostrar senha', 'aria-pressed': 'false',
      onclick: () => { const on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; ver.setAttribute('aria-pressed', String(on)); ver.setAttribute('aria-label', on ? 'Ocultar senha' : 'Mostrar senha'); ver.classList.toggle('on', on); pw.focus(); } }, icon('eye', 17));
    const msg = h('div', { class: 'login-msg', role: 'alert', hidden: !aviso }, aviso ? [icon('alert', 15), h('span', null, aviso)] : null);
    const btn = h('button', { class: 'btn primary lg', style: { width: '100%' }, type: 'submit' }, 'Entrar');
    const erro = texto => { clear(msg); msg.append(icon('alert', 15), h('span', null, texto)); msg.hidden = false; };
    const doLogin = async (e) => {
      e && e.preventDefault();
      const em = email.value.trim();
      if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { erro('Informe um e-mail válido.'); email.focus(); return; }
      if (!pw.value) { erro('Informe a sua senha.'); pw.focus(); return; }
      msg.hidden = true; btn.disabled = true; btn.classList.add('is-busy', 'is-busy-show'); btn.textContent = 'Entrando…';
      try { await API.signIn(em, pw.value); U.store('ultimo_email', em); await enter(await API.session()); }
      catch (er) {
        console.warn('[Atos] login', er);
        erro(er instanceof global.ApiError ? er.message : global.apiFriendly(er));
        btn.disabled = false; btn.classList.remove('is-busy', 'is-busy-show'); btn.textContent = 'Entrar'; pw.select();
      }
    };
    const demo = API.mode === 'demo' ? (() => {
      const us = API.demoUsers();
      const pickers = [
        us.find(u => u.papel === 'admin'), us.find(u => u.id === 'u-ger-carla'), us.find(u => u.id === 'u-sup-bruno'), us.find(u => u.id === 'u-cor-ana'),
      ].filter(Boolean);
      return h('div', null,
        h('div', { class: 'divider' }, 'Entrar na demonstração como'),
        h('div', { class: 'demo-users' }, pickers.map(u => h('button', { class: 'demo-user', type: 'button', onclick: async () => { await API.switchUser(u.id); await enter(u.id); } },
          avatar(u.nome, 32), h('div', { style: { minWidth: 0 } }, h('div', { class: 'r' }, PAPEIS[u.papel]), h('div', { class: 'n' }, u.nome), h('div', { class: 'muted', style: { fontSize: '11.5px' } }, u.equipe || (u.papel === 'gerente' ? 'Gerência Sul' : 'Acesso total')))))),
        h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '14px' } }, 'Dados de demonstração gerados para testar o sistema. Troque de perfil a qualquer momento para ver como cada nível de acesso enxerga os dados.'));
    })() : null;
    clear(root()).appendChild(h('div', { class: 'login' },
      h('div', { class: 'login-art' },
        App.brand('GESTÃO COMERCIAL'),
        h('div', null,
          h('div', { class: 'login-claim' }, 'Toda a operação da corretora, ', h('em', null, 'do lead à renovação.')),
          h('div', { class: 'login-flow' }, ['Lead', 'Atendimento', 'Cotação', 'Proposta', 'Venda', 'Implantação', 'Cliente', 'Pós-venda', 'Renovação']
            .flatMap((x, i, a) => i < a.length - 1 ? [h('span', null, x), h('span', { class: 'arrow' }, '→')] : [h('span', null, x)]))),
        h('div', { class: 'login-pillars' }, ['Segurança', 'Controle', 'Rastreabilidade', 'Velocidade'].map(x => h('span', null, x)))),
      h('div', { class: 'login-box' }, h('div', { class: 'login-card' },
        h('h2', null, 'Acessar o Atos'),
        h('p', { class: 'muted', style: { margin: '0 0 18px' } }, 'Use o e-mail e a senha cadastrados pela sua corretora.'),
        h('form', { class: 'stack', onsubmit: doLogin, style: { gap: '12px' }, novalidate: true },
          msg,
          h('div', { class: 'field' }, h('label', { for: 'login_email' }, 'E-mail'), email),
          h('div', { class: 'field' }, h('label', { for: 'login_pw' }, 'Senha'), h('div', { class: 'pw-wrap' }, pw, ver)),
          btn,
          h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '12.5px' } },
            h('a', { href: '#', onclick: e => { e.preventDefault(); forgot(email.value); } }, 'Esqueci minha senha'),
            h('a', { href: '#', onclick: e => { e.preventDefault(); signupModal(); } }, 'Solicitar acesso'))),
        demo))));
    setTimeout(() => { try { (email.value ? pw : email).focus({ preventScroll: true }); } catch (e) { /* */ } }, 50);
  }
  function forgot(email) {
    const f = U.form([{ name: 'email', label: 'E-mail', type: 'email', required: true }], { email }, { cols: 1 });
    const m = modal({ title: 'Recuperar senha', subtitle: 'Enviaremos um link para você criar uma nova senha.', size: 'sm', body: f, footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => { if (!f.validate()) return; try { await API.resetPassword(f.values().email); m.close(); toast('Se o e-mail estiver cadastrado, o link de redefinição chegará em instantes (confira também o spam).', 'ok', 7000); } catch (e) { App.err(e); } } }, 'Enviar link')] });
  }
  function signupModal() {
    const f = U.form([{ name: 'nome', label: 'Nome completo', required: true }, { name: 'email', label: 'E-mail', type: 'email', required: true }, { name: 'senha', label: 'Senha', type: 'password', required: true, hint: 'Mínimo de 8 caracteres' }], {}, { cols: 1 });
    const m = modal({ title: 'Solicitar acesso', subtitle: 'O administrador precisa aprovar seu cadastro e definir sua equipe.', size: 'sm', body: f,
      footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancelar'), h('button', { class: 'btn primary', onclick: async () => { if (!f.validate()) return; const v = f.values(); if ((v.senha || '').length < 8) return toast('A senha precisa ter ao menos 8 caracteres', 'err');
        try { await API.signUp(v.email, v.senha, v.nome); m.close(); toast('Cadastro enviado. Você será avisado por e-mail quando o administrador aprovar.', 'ok', 6500); } catch (e) { App.err(e); } } }, 'Enviar solicitação')] });
  }
  function pendingScreen(me) {
    clear(root()).appendChild(h('div', { class: 'boot' }, h('div', { class: 'login-card', style: { textAlign: 'center' } }, App.brand(), h('h2', { style: { marginTop: '24px' } }, me.status === 'inativo' ? 'Acesso desativado' : 'Aguardando aprovação'),
      h('p', { class: 'muted' }, me.status === 'inativo' ? 'Seu usuário está inativo. Procure o administrador.' : 'Seu cadastro foi recebido. O administrador precisa aprovar seu acesso e vincular você a uma equipe.'),
      h('button', { class: 'btn', onclick: async () => { await API.signOut(); loginScreen(); } }, 'Sair'))));
  }
  function recoveryScreen(tipo) {
    const f = U.form([{ name: 'senha', label: 'Nova senha', type: 'password', required: true, hint: 'Mínimo de 8 caracteres' }, { name: 'senha2', label: 'Repita a senha', type: 'password', required: true }], {}, { cols: 1 });
    const m = modal({ title: tipo === 'invite' ? 'Bem-vindo ao Atos — crie sua senha' : 'Definir nova senha', size: 'sm', body: f, footer: [h('button', { class: 'btn primary', onclick: async () => {
      if (!f.validate()) return; const v = f.values();
      if ((v.senha || '').length < 8) return toast('A senha precisa ter ao menos 8 caracteres', 'err');
      if (v.senha !== v.senha2) return toast('As senhas não conferem', 'err');
      try { await API.updatePassword(v.senha); m.close(); toast('Senha definida. Use-a nos próximos acessos.'); } catch (e) { App.err(e); } } }, 'Salvar senha')] });
  }

  // ------------------------------------------------------------------
  // Shell
  // ------------------------------------------------------------------
  const NAV = [
    { group: null, items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { key: 'carteira', label: 'Minha Carteira', icon: 'wallet', show: () => App.is('corretor') },
      { key: 'inteligencia', label: 'Inteligência Comercial', icon: 'sparkles' },
    ] },
    { group: 'Operação', items: [
      { key: 'crm', label: 'CRM', icon: 'kanban' },
      { key: 'leads', label: 'Leads', icon: 'leads' },
      { key: 'followups', label: 'Follow-ups', icon: 'clock', count: 'followups' },
      { key: 'agenda', label: 'Agenda', icon: 'calendar' },
      { key: 'tarefas', label: 'Tarefas', icon: 'tasks', count: 'tarefas' },
    ] },
    { group: 'Vendas', items: [
      { key: 'vendas', label: 'Vendas', icon: 'sales' },
      { key: 'implantacao', label: 'Implantação', icon: 'rocket', count: 'pendencias' },
      { key: 'clientes', label: 'Clientes', icon: 'clients' },
      { key: 'relacionamento', label: 'Relacionamento', icon: 'star', count: 'relacionamento' },
    ] },
    { group: 'Gestão', items: [
      { key: 'equipe', label: 'Equipe', icon: 'team', show: () => App.can('equipe.ver') },
      { key: 'online', label: 'Quem está online', icon: 'activity', show: () => App.can('presenca.ver'), count: 'online' },
      { key: 'desempenho', label: 'Desempenho', icon: 'activity' },
      { key: 'ranking', label: 'Ranking ao vivo', icon: 'trophy' },
      { key: 'metas', label: 'Metas', icon: 'target' },
      { key: 'comissoes', label: 'Comissões', icon: 'coins' },
      { key: 'relatorios', label: 'Relatórios', icon: 'chart' },
    ] },
    { group: 'Cadastros', items: [
      { key: 'operadoras', label: 'Operadoras', icon: 'building' },
      { key: 'produtos', label: 'Produtos', icon: 'package' },
    ] },
    { group: 'Sistema', items: [
      { key: 'notificacoes', label: 'Notificações', icon: 'bell', count: 'notif' },
      { key: 'configuracoes', label: 'Configurações', icon: 'settings', show: () => App.is('admin') },
    ] },
  ];

  function shell() {
    const nav = h('nav', { class: 'side-nav', 'aria-label': 'Menu principal' });
    NAV.forEach(g => {
      const items = g.items.filter(i => !i.show || i.show());
      if (!items.length) return;
      nav.appendChild(h('div', { class: 'nav-group' }, g.group ? h('div', { class: 'nav-label' }, g.group) : null,
        items.map(i => h('a', { class: 'nav-item', href: '#/' + i.key, dataset: { key: i.key }, onclick: () => { abrirNav(false); App._focarConteudo = true; } },
          icon(i.icon, 18), h('span', null, i.label), i.count ? h('span', { class: 'nav-count', dataset: { count: i.count }, hidden: true }) : null))));
    });
    const side = h('aside', { class: 'side' },
      h('div', { class: 'side-top' }, App.brand(App.lk.settings.empresa && App.lk.settings.empresa.nome && App.lk.settings.empresa.nome !== 'Atos' ? App.lk.settings.empresa.nome.toUpperCase() : 'SISTEMA')),
      nav,
      h('div', { class: 'side-foot' }, h('button', { class: 'me-card', onclick: e => userMenu(e.currentTarget) },
        avatar(App.me.nome, 34), h('div', { class: 'grow' }, h('div', { class: 'me-name' }, App.me.nome), h('div', { class: 'me-role' }, PAPEIS[App.papel] + (App.me.team_nome ? ' · ' + App.me.team_nome : ''))), icon('more', 16))));

    const searchInput = h('input', { type: 'search', placeholder: global.innerWidth < 600 ? 'Buscar…' : 'Buscar nome, CPF, CNPJ, telefone, e-mail, nº da proposta…', 'aria-label': 'Busca global', id: 'gsearch', readonly: true,
      onfocus: e => { e.target.blur(); globalSearch(''); } });
    const top = h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Abrir menu', 'aria-expanded': 'false', onclick: () => abrirNav(!document.querySelector('.app').classList.contains('nav-open')) }, icon('menu')),
      h('label', { class: 'search', onclick: () => globalSearch('') }, icon('search', 16), searchInput, h('span', { class: 'kbd' }, /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘ K' : 'Ctrl K')),
      h('div', { class: 'top-actions' },
        h('button', { class: 'btn primary', onclick: e => quickMenu(e.currentTarget) }, icon('plus', 16), h('span', { class: 'lbl' }, 'Novo')),
        h('button', { class: 'icon-btn bell', 'aria-label': 'Notificações', title: 'Notificações', onclick: () => notifDrawer() }, icon('bell'), h('span', { class: 'bell-dot', id: 'bellDot', hidden: true }))));

    const demoBar = API.mode === 'demo' ? h('div', { class: 'demo-bar' }, icon('eye', 15),
      h('span', null, h('b', null, 'Modo demonstração'), ' · dados de exemplo em memória, alterações somem ao recarregar. Ver como:'),
      h('select', { 'aria-label': 'Trocar perfil da demonstração', onchange: async e => { await API.switchUser(e.target.value); await enter(e.target.value); } },
        ['admin', 'gerente', 'supervisor', 'corretor'].map(p => h('optgroup', { label: PAPEIS[p] }, API.demoUsers().filter(u => u.papel === p).map(u => h('option', { value: u.id, selected: u.id === App.me.id || null }, u.nome + (u.equipe ? ' · ' + u.equipe : ''))))))) : null;

    const content = h('main', { class: 'content', id: 'content', tabindex: '-1' });
    App.observarFiltros(content);
    const pode = k => NAV.some(g => g.items.some(i => i.key === k && (!i.show || i.show())));
    const inicio = App.is('corretor') ? ['carteira', 'Carteira', 'wallet'] : ['dashboard', 'Início', 'dashboard'];
    const bottom = h('nav', { class: 'bottom-nav', 'aria-label': 'Atalhos' },
      [inicio, ['crm', 'CRM', 'kanban'], ['followups', 'Follow-ups', 'clock'], ['agenda', 'Agenda', 'calendar']].filter(([k]) => pode(k)).map(([k, l, ic]) =>
        h('a', { href: '#/' + k, dataset: { key: k } }, icon(ic, 20), h('span', null, l), k === 'followups' ? h('span', { class: 'nav-count', dataset: { count: 'followups' }, hidden: true }) : null)),
      h('button', { type: 'button', 'aria-label': 'Abrir menu completo', onclick: () => abrirNav(true) }, icon('menu', 20), h('span', null, 'Menu')));
    clear(root()).appendChild(h('div', { class: 'app' },
      h('a', { class: 'skip-link', href: '#content', onclick: e => { e.preventDefault(); content.focus(); } }, 'Pular para o conteúdo'),
      side, h('div', { class: 'main' }, demoBar, top, content), bottom,
      h('div', { class: 'nav-scrim', onclick: () => abrirNav(false), 'aria-hidden': 'true' })));
  }
  function abrirNav(on) {
    const app = document.querySelector('.app'); if (!app) return;
    app.classList.toggle('nav-open', on);
    const b = document.querySelector('.menu-btn'); if (b) b.setAttribute('aria-expanded', String(on));
    if (on) { const a = app.querySelector('.side .nav-item.active') || app.querySelector('.side .nav-item'); if (a) setTimeout(() => a.focus({ preventScroll: true }), 50); }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.app.nav-open') && !document.querySelector('.layer')) abrirNav(false); });

  function userMenu(anchor) {
    menu(anchor, [
      { label: 'Meu perfil', icon: 'user', onClick: () => profileModal() },
      { label: App.me.disponivel ? 'Pausar recebimento de leads' : 'Voltar a receber leads', icon: 'zap', onClick: async () => {
        try { await API.rpc('atualizar_meu_perfil', { p_disponivel: !App.me.disponivel }); App.me.disponivel = !App.me.disponivel; toast(App.me.disponivel ? 'Você está disponível para novos leads' : 'Recebimento de leads pausado'); } catch (e) { App.err(e); } } },
      global.Notification && Notification.permission !== 'granted' ? { label: 'Ativar alertas do navegador', icon: 'bell', onClick: async () => { try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Você receberá alertas mesmo com o Atos em segundo plano' : 'Permissão não concedida pelo navegador', p === 'granted' ? 'ok' : 'err'); } catch (e) { App.err(e); } } } : null,
      { label: 'Aparência: ' + { escuro: 'escura', claro: 'clara', sistema: 'do sistema' }[App.tema()], icon: 'eye', onClick: () => temaModal() },
      { label: 'Atalhos de teclado', icon: 'zap', onClick: () => atalhosModal() },
      '-',
      { label: 'Sair', icon: 'logout', danger: true, onClick: async () => { stopLive(); App._saidaVoluntaria = true; try { await API.rpc('registrar_saida', {}); } catch (e) { /* */ } try { await API.signOut(); } catch (e) { /* */ } App._saidaVoluntaria = false; loginScreen(); } },
    ]);
  }
  function temaModal() {
    const opc = [['escuro', 'Escura', 'Ideal para longas jornadas e ambientes com pouca luz'], ['claro', 'Clara', 'Melhor leitura em ambientes iluminados'], ['sistema', 'Igual ao sistema', 'Acompanha a configuração do computador ou celular']];
    const lista = h('div', { class: 'theme-opts', role: 'radiogroup', 'aria-label': 'Aparência' }, opc.map(([k, t, d]) => h('button', { class: 'theme-opt' + (App.tema() === k ? ' on' : ''), role: 'radio', 'aria-checked': String(App.tema() === k), type: 'button',
      onclick: () => { U.store('tema', k); App.aplicarTema(k); lista.querySelectorAll('.theme-opt').forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); }, dataset: { k } },
      h('span', { class: 'theme-sw theme-sw-' + k }), h('span', null, h('b', null, t), h('small', null, d)))));
    const m = modal({ title: 'Aparência', subtitle: 'A escolha fica salva neste navegador.', size: 'sm', body: lista, footer: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Pronto')] });
  }
  function atalhosModal() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    const k = mac ? '⌘' : 'Ctrl';
    const linhas = [[k + ' K', 'Busca global (leads, clientes, vendas)'], ['N', 'Criar novo (lead, cliente, venda…)'], ['G depois D', 'Ir para o Dashboard'], ['G depois C', 'Ir para o CRM'], ['G depois L', 'Ir para Leads'], ['G depois A', 'Ir para a Agenda'], ['Esc', 'Fechar janela ou menu aberto'], ['?', 'Mostrar estes atalhos']];
    modal({ title: 'Atalhos de teclado', size: 'sm', body: h('dl', { class: 'kv kbd-list' }, linhas.map(([a, b]) => [h('dt', null, a.split(' depois ').map((x, i) => [i ? h('span', { class: 'muted' }, ' depois ') : null, h('span', { class: 'kbd' }, x)])), h('dd', null, b)])) });
  }
  // atalhos: N (novo), G+tecla (ir para), ? (ajuda) — ignorados enquanto se digita
  let prefixoG = 0;
  document.addEventListener('keydown', e => {
    if (!App.me || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const alvo = e.target; if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
    if (document.querySelector('.layer, .popmenu')) return;
    const key = e.key.toLowerCase();
    if (Date.now() - prefixoG < 1200) {
      const destino = { d: '/dashboard', c: '/crm', l: '/leads', a: '/agenda', v: '/vendas', f: '/followups', t: '/tarefas' }[key];
      prefixoG = 0; if (destino) { e.preventDefault(); App.go(destino); } return;
    }
    if (key === 'g') { prefixoG = Date.now(); return; }
    if (key === 'n') { const b = document.querySelector('.top-actions .btn.primary'); if (b) { e.preventDefault(); quickMenu(b); } return; }
    if (e.key === '?') { e.preventDefault(); atalhosModal(); }
  });

  function profileModal() {
    const f = U.form([{ name: 'nome', label: 'Nome', required: true }, { name: 'telefone', label: 'Telefone', mask: 'phone' }, { name: 'email', label: 'E-mail', disabled: true }, { name: 'papel', label: 'Papel', disabled: true }],
      { ...App.me, telefone: fmt.phone(App.me.telefone), papel: PAPEIS[App.papel] }, { cols: 2 });
    const m = modal({ title: 'Meu perfil', body: f, footer: [
      API.mode !== 'demo' ? h('button', { class: 'btn ghost', onclick: () => recoveryScreen() }, 'Alterar senha') : null,
      h('button', { class: 'btn primary', onclick: async () => { if (!f.validate()) return; const v = f.values(); try { await API.rpc('atualizar_meu_perfil', { p_nome: v.nome, p_telefone: U.digits(v.telefone) }); App.me.nome = v.nome; document.querySelectorAll('.me-name').forEach(x => { x.textContent = v.nome; }); m.close(); toast('Perfil atualizado'); } catch (e) { App.err(e); } } }, 'Salvar')] });
  }

  function quickMenu(anchor) {
    menu(anchor, [
      { label: 'Novo lead', icon: 'leads', onClick: () => Forms.lead() },
      { label: 'Novo cliente', icon: 'clients', onClick: () => Forms.client() },
      { label: 'Nova venda', icon: 'sales', onClick: () => Forms.saleForClient() },
      { label: 'Novo follow-up', icon: 'clock', onClick: () => Forms.followup() },
      { label: 'Nova tarefa', icon: 'tasks', onClick: () => Forms.task() },
      { label: 'Novo compromisso', icon: 'calendar', onClick: () => Forms.event() },
      App.can('leads.importar') ? '-' : null,
      App.can('leads.importar') ? { label: 'Importar leads', icon: 'upload', onClick: () => Forms.importLeads() } : null,
    ]);
  }

  // ------------------------------------------------------------------
  // Busca global
  // ------------------------------------------------------------------
  function globalSearch(initial) {
    const input = h('input', { type: 'search', placeholder: 'Nome, CPF, CNPJ, telefone, e-mail, empresa ou nº da proposta', value: initial, id: 'gs_input', autocomplete: 'off' });
    const list = h('div', { class: 'gs-results' }, h('div', { class: 'muted', style: { padding: '14px 4px' } }, 'Digite ao menos 2 caracteres.'));
    let items = [], sel = 0;
    const open = it => { m.close(); App.go(it.tipo === 'lead' ? '/leads/' + it.id : it.tipo === 'cliente' ? '/clientes/' + it.id : '/vendas/' + it.id); };
    const paint = () => { clear(list); if (!items.length) { list.appendChild(h('div', { class: 'muted', style: { padding: '14px 4px' } }, input.value.trim().length < 2 ? 'Digite ao menos 2 caracteres.' : 'Nada encontrado na sua carteira.')); return; }
      items.forEach((it, i) => list.appendChild(h('button', { class: 'gs-item' + (i === sel ? ' sel' : ''), onclick: () => open(it) }, h('span', { class: 'gs-type' }, it.tipo), h('div', { class: 'grow' }, h('div', { class: 'li-title' }, it.titulo), h('div', { class: 'li-sub' }, it.sub || '')), icon('chevronRight', 16)))); };
    let seqBusca = 0;
    const run = debounce(async () => {
      const termo = input.value.trim(), seq = ++seqBusca;
      if (termo.length < 2) { items = []; paint(); return; }
      list.setAttribute('aria-busy', 'true');
      try { const r = await API.rpc('busca_global', { p_termo: termo }); if (seq !== seqBusca) return; items = r || []; sel = 0; paint(); }
      catch (e) { if (seq === seqBusca) { items = []; clear(list).appendChild(h('div', { class: 'bad-t', style: { padding: '14px 4px' }, role: 'alert' }, e.message || 'Não foi possível buscar agora.')); } }
      finally { if (seq === seqBusca) list.removeAttribute('aria-busy'); }
    }, 220);
    input.addEventListener('input', run);
    input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); paint(); e.preventDefault(); } if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); } if (e.key === 'Enter' && items[sel]) open(items[sel]); });
    const m = modal({ title: 'Busca global', subtitle: 'Resultados limitados à sua carteira e estrutura', size: 'md', body: h('div', { class: 'stack' }, input, list) });
    if (initial) run();
  }
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && App.me) { e.preventDefault(); globalSearch(''); } });

  // ------------------------------------------------------------------
  // Notificações
  // ------------------------------------------------------------------
  const NOTIF_IC = { lead_recebido: ['leads', 'var(--blue-2)'], novo_lead: ['leads', 'var(--blue-2)'], lead_sem_atendimento: ['alert', 'var(--warn)'], lead_parado: ['alert', 'var(--bad)'],
    followup_vencido: ['clock', 'var(--bad)'], followup_proximo: ['clock', 'var(--warn)'], proposta_parada: ['file', 'var(--warn)'], pendencia: ['alert', 'var(--warn)'],
    venda_aprovada: ['check', 'var(--ok)'], venda_implantada: ['rocket', 'var(--ok)'], aniversario: ['star', 'var(--cyan)'], meta_proxima: ['target', 'var(--blue-2)'], meta_atingida: ['trophy', 'var(--ok)'],
    manter_contato: ['whatsapp', 'var(--ok)'], sla_atrasado: ['zap', 'var(--bad)'], convite_evento: ['calendar', 'var(--blue-2)'], resposta_convite: ['users', 'var(--cyan)'], evento_proximo: ['bell', 'var(--warn)'], evento_alterado: ['calendar', 'var(--warn)'], evento_cancelado: ['x', 'var(--bad)'] };
  App.notifItem = (n, after) => {
    const [ic, c] = NOTIF_IC[n.tipo] || ['bell', 'var(--blue-2)'];
    const abrir = async () => { if (!n.lida) { try { await API.rpc('marcar_notificacoes_lidas', { p_ids: [n.id] }); n.lida = true; App.refreshCounts(); } catch (e) { console.warn(e); } } if (after) after(); if (n.link) App.go(n.link.replace(/^#/, '')); };
    return h('div', { class: 'notif' + (n.lida ? '' : ' unread'), role: 'button', tabindex: '0', onclick: abrir, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } } },
      h('div', { class: 'notif-ic', style: { '--c': c } }, icon(ic, 17)),
      h('div', { class: 'grow' }, h('div', { class: 'notif-t' }, n.titulo), n.mensagem ? h('div', { class: 'notif-m' }, n.mensagem) : null, h('div', { class: 'notif-d' }, fmt.rel(n.created_at))));
  };
  async function notifDrawer() {
    const body = h('div', null, U.skeleton(5));
    const d = drawer({ title: 'Notificações', size: 'md', body, footer: [h('button', { class: 'btn ghost', onclick: () => { d.close(); App.go('/notificacoes'); } }, 'Ver todas'),
      h('button', { class: 'btn', onclick: async () => { try { await API.rpc('marcar_notificacoes_lidas', { p_ids: null }); d.close(); App.refreshCounts(); toast('Notificações marcadas como lidas'); } catch (e) { App.err(e); } } }, 'Marcar todas como lidas')] });
    const carregar = async () => {
      clear(body).appendChild(U.skeleton(5));
      try {
        const { rows } = await API.list('notifications', { order: [['created_at', false]], limit: 30 });
        clear(body).appendChild(rows.length ? h('div', null, rows.map(n => App.notifItem(n, () => d.close()))) : empty('Tudo em dia', 'Você não tem notificações.', null, 'bell'));
      } catch (e) { console.warn(e); clear(body).appendChild(U.errorState(e instanceof global.ApiError ? e : { message: global.apiFriendly(e) }, carregar)); }
    };
    await carregar();
  }

  App.refreshCounts = async function () {
    if (!App.me) return;
    try {
      const agora = new Date().toISOString();
      const [fu, nt, tk, pe] = await Promise.all([
        API.list('followups', { eq: { status: 'pendente' }, lt: { agendado_para: agora }, isNull: ['deleted_at'], count: true, limit: 1, ...(App.is('corretor') ? { or: [['responsavel_id', 'eq', App.me.id], ['corretor_id', 'eq', App.me.id]] } : {}) }),
        API.list('notifications', { eq: { lida: false }, count: true, limit: 1 }),
        API.list('tasks', { in: { status: ['aberta', 'em_andamento'] }, isNull: ['deleted_at'], lt: { prazo: agora }, count: true, limit: 1 }),
        API.list('pendencies', { eq: { status: 'aberta' }, isNull: ['deleted_at'], count: true, limit: 1 }),
      ]);
      App.counts = { followups: fu.count, notif: nt.count, tarefas: tk.count, pendencias: pe.count, online: App.counts.online || 0 };
      try { const [a1, a2] = await Promise.all([API.list('v_relacionamento', { eq: { dias_para_aniversario: 0 }, count: true, limit: 1 }), API.list('v_aniversarios_dependentes', { eq: { dias_para_aniversario: 0 }, count: true, limit: 1 })]); App.counts.relacionamento = a1.count + a2.count; } catch (e) { /* */ }
      if (App.can('presenca.ver')) { try { App.counts.online = (await API.all('v_presence', { eq: { situacao: 'online' } })).filter(x => x.id !== App.me.id).length; } catch (e) { /* */ } }
      document.querySelectorAll('[data-count]').forEach(el => { const v = App.counts[el.dataset.count]; el.hidden = !v; el.textContent = v > 99 ? '99+' : v; el.classList.toggle('alert', !['notif', 'online', 'relacionamento'].includes(el.dataset.count)); el.classList.toggle('live', el.dataset.count === 'online'); el.classList.toggle('gold', el.dataset.count === 'relacionamento'); });
      const dot = $('#bellDot'); if (dot) { dot.hidden = !nt.count; dot.textContent = nt.count > 9 ? '9+' : nt.count; }
      const bell = document.querySelector('.icon-btn.bell'); if (bell) bell.setAttribute('aria-label', nt.count ? `Notificações: ${nt.count} não lida(s)` : 'Notificações');
    } catch (e) { console.warn(e); }
  };

  // ------------------------------------------------------------------
  // Roteador
  // ------------------------------------------------------------------
  const ROUTES = [
    [/^#\/dashboard$/, 'dashboard'], [/^#\/carteira$/, 'carteira'], [/^#\/inteligencia$/, 'inteligencia'], [/^#\/crm$/, 'crm'],
    [/^#\/leads$/, 'leads'], [/^#\/leads\/([\w-]+)$/, 'lead360', ['id']], [/^#\/followups$/, 'followups'], [/^#\/agenda$/, 'agenda'], [/^#\/tarefas$/, 'tarefas'],
    [/^#\/propostas$/, 'crm'], [/^#\/vendas$/, 'vendas'], [/^#\/vendas\/([\w-]+)$/, 'venda', ['id']], [/^#\/implantacao$/, 'implantacao'],
    [/^#\/clientes$/, 'clientes'], [/^#\/clientes\/([\w-]+)$/, 'cliente360', ['id']], [/^#\/equipe$/, 'equipe'], [/^#\/equipe\/([\w-]+)$/, 'corretor', ['id']],
    [/^#\/ranking$/, 'ranking'], [/^#\/online$/, 'online'], [/^#\/relacionamento$/, 'relacionamento'], [/^#\/desempenho$/, 'desempenho'], [/^#\/metas$/, 'metas'], [/^#\/comissoes$/, 'comissoes'], [/^#\/relatorios$/, 'relatorios'],
    [/^#\/operadoras$/, 'operadoras'], [/^#\/produtos$/, 'produtos'], [/^#\/notificacoes$/, 'notificacoes'], [/^#\/configuracoes(?:\/(\w+))?$/, 'configuracoes', ['tab']],
  ];
  let renderSeq = 0;
  App.render = async function (hash, keepScroll) {
    if (!App.me) return;
    const [path, qs] = String(hash || '').split('?');
    let name = null, params = {};
    for (const [re, n, keys] of ROUTES) { const m = path.match(re); if (m) { name = n; (keys || []).forEach((k, i) => params[k] = m[i + 1]); break; } }
    if (!name) { name = App.papel === 'corretor' ? 'carteira' : 'dashboard'; }
    params.q = Object.fromEntries(new URLSearchParams(qs || ''));
    App._current = hash; App.route = { name, params };
    const navKey = { lead360: 'leads', cliente360: 'clientes', venda: 'vendas', corretor: 'equipe' }[name] || name;
    if (App._telaAnterior !== name) { App._telaAnterior = name; setTimeout(() => App.presenca && App.presenca(), 400); }
    document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.key === navKey));
    const content = document.getElementById('content'); if (!content) return;
    const scroll = content.scrollTop;
    const seq = ++renderSeq;
    if (!keepScroll) { clear(content).appendChild(h('div', { class: 'page-loading' }, U.skeleton(8))); content.scrollTop = 0; }
    try {
      const view = Views[name];
      if (!view) throw new Error('Tela não encontrada');
      const node = await view(params);
      if (seq !== renderSeq) return;
      if (!keepScroll && node && node.classList) node.classList.add('enter');
      clear(content).appendChild(node);
      melhorarFiltros(content);
      if (keepScroll) content.scrollTop = scroll;
      const h1 = content.querySelector('h1');
      document.title = (h1 ? h1.textContent.trim() : (TELAS[name] || 'Atos')) + ' · Atos';
      if (!keepScroll && App._focarConteudo) { App._focarConteudo = false; content.focus({ preventScroll: true }); }
    } catch (e) {
      if (seq !== renderSeq) return;
      console.error('[Atos] tela', name, e);
      if (e && e.sessao) return sessaoExpirada();
      const msg = e instanceof global.ApiError ? e.message : (e && e.message === 'Tela não encontrada' ? 'Este endereço não existe ou foi removido.' : global.apiFriendly(e));
      clear(content).appendChild(empty('Não foi possível abrir esta tela', msg,
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn', onclick: () => App.reload() }, icon('refresh', 15), 'Tentar novamente'),
          h('button', { class: 'btn ghost', onclick: () => App.go(App.papel === 'corretor' ? '/carteira' : '/dashboard') }, 'Ir para o início')), 'alert'));
    }
    document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.key === navKey));
  };

  /**
   * Filtros no celular: em telas estreitas a barra de filtros mostra só a busca
   * e um botão "Filtros (n)" que abre os demais campos.
   */
  function melhorarFiltros(root) {
    root.querySelectorAll('.filters').forEach(f => {
      const campos = Array.from(f.querySelectorAll(':scope > select, :scope > .more-filters > select, :scope > input:not(.search-f):not([type=search]):not([type=checkbox]), :scope > .check'));
      if (campos.length < 2) { if (f._tg && f._tg.parentNode) f._tg.remove(); f.classList.remove('collapsible'); return; }
      if (!f._tg) {
        const lbl = h('span');
        const tg = h('button', { class: 'btn sm filters-toggle', type: 'button', 'aria-expanded': 'false',
          onclick: () => { const fechado = f.classList.toggle('collapsed'); tg.setAttribute('aria-expanded', String(!fechado)); } }, icon('filter', 14), lbl);
        f._tg = tg; f.classList.add('collapsed');
        f._pinta = () => {
          const n = Array.from(f.querySelectorAll(':scope > select, :scope > .more-filters > select, :scope > input:not(.search-f):not([type=search]):not([type=checkbox]), :scope > .check input:checked'))
            .filter(x => x.type === 'checkbox' || (x.value && !x.disabled)).length;
          lbl.textContent = n ? `Filtros (${n})` : 'Filtros'; tg.classList.toggle('has', !!n);
        };
        f.addEventListener('change', () => f._pinta());
      }
      f.classList.add('collapsible');
      if (f._tg.parentNode !== f) {
        const busca = f.querySelector(':scope > .search-f, :scope > input[type=search], :scope > .seg');
        f.insertBefore(f._tg, busca ? busca.nextSibling : f.firstChild);
      }
      f._pinta();
    });
  }
  // telas que montam os filtros depois de carregar também recebem o botão
  let filtrosPend = false;
  const obsFiltros = new MutationObserver(() => {
    if (filtrosPend) return; filtrosPend = true;
    requestAnimationFrame(() => { filtrosPend = false; const c = document.getElementById('content'); if (c) melhorarFiltros(c); });
  });
  App.observarFiltros = el => obsFiltros.observe(el, { childList: true, subtree: true });
  App.melhorarFiltros = melhorarFiltros;
  window.addEventListener('hashchange', () => { try { App.render(location.hash); } catch (e) { /* */ } });

  // ------------------------------------------------------------------
  // Helpers de página compartilhados
  // ------------------------------------------------------------------
  App.pageHead = (title, { eyebrow, desc, actions, crumb } = {}) => h('div', { class: 'page-head' },
    h('div', { class: 'grow' }, crumb ? h('button', { class: 'crumb', onclick: () => App.go(crumb.go || '/dashboard') }, icon('chevronLeft', 14), crumb.label) : null,
      eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h1', null, title), desc ? h('div', { class: 'desc' }, desc) : null),
    actions ? h('div', { class: 'page-actions' }, actions) : null);

  App.periodPicker = (state, onChange, opts = ['mes', 'mes_anterior', 'trimestre', 'ano']) => {
    const labels = { hoje: 'Hoje', semana: 'Semana', mes: 'Mês atual', mes_anterior: 'Mês anterior', trimestre: 'Trimestre', ano: 'Ano', '30d': '30 dias', '90d': '90 dias' };
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, opts.map(k => h('button', { class: state.periodo === k ? 'on' : '', onclick: () => { const p = dates.periodos()[k]; Object.assign(state, { periodo: k, ini: p[0], fim: p[1] }); onChange(); } }, labels[k])));
    return seg;
  };
  App.initPeriod = (k = 'mes') => { const p = dates.periodos()[k]; return { periodo: k, ini: p[0], fim: p[1] }; };

  /** filtros da hierarquia visíveis conforme o papel */
  App.hierFilters = (state, onChange, { corretor = true, supervisor = true, equipe = false, operadora = false, origem = false, campanha = false, produto = false } = {}) => {
    const sel = (key, label, options) => h('select', { 'aria-label': label, onchange: e => { state[key] = e.target.value || null; onChange(); } },
      h('option', { value: '' }, label), options.map(o => h('option', { value: o.value, selected: state[key] === o.value || null }, o.label)));
    const out = [];
    if (App.is('admin') && supervisor) out.push(sel('gerente_id', 'Todos os gerentes', App.opt.gerentes()));
    if (App.is('admin', 'gerente') && supervisor) out.push(sel('supervisor_id', 'Todos os supervisores', App.opt.supervisores()));
    if (equipe && App.is('admin', 'gerente')) out.push(sel('team_id', 'Todas as equipes', App.opt.teams()));
    if (App.gestor() && corretor) out.push(sel('corretor_id', 'Todos os corretores', App.opt.corretores()));
    const extra = [];
    if (operadora) extra.push(sel('operator_id', 'Todas as operadoras', App.opt.ops()));
    if (produto) extra.push(sel('product_id', 'Todos os produtos', App.opt.prods()));
    if (origem) extra.push(sel('source_id', 'Todas as origens', App.opt.srcs()));
    if (campanha) extra.push(sel('campaign_id', 'Todas as campanhas', App.opt.camps()));
    if (extra.length) {
      const ativos = ['operator_id', 'product_id', 'source_id', 'campaign_id'].filter(k => state[k]).length;
      const wrap = h('span', { class: 'more-filters', hidden: !(App._moreFilters || ativos) }, extra);
      out.push(h('button', { class: 'btn sm ghost', onclick: () => { App._moreFilters = wrap.hidden; wrap.hidden = !wrap.hidden; } }, icon('filter', 14), 'Filtros' + (ativos ? ` (${ativos})` : '')), wrap);
    }
    return out;
  };
  App.filtrosAtivos = (state) => { const f = {}; ['gerente_id', 'supervisor_id', 'team_id', 'corretor_id', 'operator_id', 'product_id', 'source_id', 'campaign_id'].forEach(k => { if (state[k]) f[k] = state[k]; }); return f; };

  App.exportar = async (nome, cols, rows, fmtType = 'csv') => {
    if (global.ATOS_PREVIEW) { toast('Na prévia a exportação fica bloqueada pelo navegador. Na versão publicada o arquivo é baixado normalmente.', 'info', 5200); return; }
    if (!App.can('relatorios.exportar')) return toast('Seu perfil não pode exportar relatórios', 'err');
    try {
      if (fmtType === 'csv') U.download(nome + '.csv', U.toCSV(cols, rows));
      else if (fmtType === 'xlsx') {
        await U.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const data = [cols.map(c => c.label), ...rows.map(r => cols.map(c => c.value ? c.value(r) : r[c.key]))];
        const ws = XLSX.utils.aoa_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
        XLSX.writeFile(wb, nome + '.xlsx');
      } else if (fmtType === 'pdf') {
        await U.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await U.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        const doc = new jspdf.jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait' });
        doc.setFontSize(14); doc.text(nome.replace(/-/g, ' '), 14, 16); doc.setFontSize(9); doc.text('Atos Sistema · gerado em ' + new Date().toLocaleString('pt-BR'), 14, 22);
        doc.autoTable({ startY: 27, head: [cols.map(c => c.label)], body: rows.map(r => cols.map(c => String((c.value ? c.value(r) : r[c.key]) ?? ''))), styles: { fontSize: 8 }, headStyles: { fillColor: [46, 107, 255] } });
        doc.save(nome + '.pdf');
      }
      toast('Arquivo gerado');
    } catch (e) { App.err(e); }
  };
  App.exportMenu = (anchor, nome, cols, rows) => menu(anchor, [
    { label: 'Excel (.xlsx)', icon: 'download', onClick: () => App.exportar(nome, cols, rows, 'xlsx') },
    { label: 'CSV', icon: 'download', onClick: () => App.exportar(nome, cols, rows, 'csv') },
    { label: 'PDF', icon: 'download', onClick: () => App.exportar(nome, cols, rows, 'pdf') },
  ]);

  App.PAPEIS = PAPEIS;
})(window);
