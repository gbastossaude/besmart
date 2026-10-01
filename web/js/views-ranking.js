/* =====================================================================
   ATOS SISTEMA — views-ranking.js
   Desempenho individual (mês × mês anterior) e Ranking ao vivo
   (corretores, equipes com logotipo e supervisores) com modo TV.
   ===================================================================== */
(function (global) {
  'use strict';
  const { h, clear, icon, fmt, dates, empty, badge, toast, avatar } = global.U;
  const API = global.API, App = global.App, Views = global.Views, Charts = global.Charts;

  const MEDAL = ['#E3B341', '#C3CAD6', '#C98A5A'];
  const soma = (a, k) => a.reduce((t, x) => t + (Number(x[k]) || 0), 0);
  const conv = (c, l) => l ? Math.round(1000 * c / l) / 10 : 0;

  /** variação: ▲ 12% / ▼ 3 p.p. / novo */
  function delta(cur, prev, { pp = false, inverso = false, compacto = false } = {}) {
    cur = Number(cur) || 0; prev = Number(prev) || 0;
    if (!pp && prev === 0) return cur > 0 ? h('span', { class: 'dlt up' }, compacto ? 'novo' : '▲ novo') : h('span', { class: 'dlt eq' }, '—');
    const d = pp ? cur - prev : 100 * (cur - prev) / Math.abs(prev);
    if (Math.abs(d) < 0.05) return h('span', { class: 'dlt eq' }, '=');
    const bom = inverso ? d < 0 : d > 0;
    return h('span', { class: 'dlt ' + (bom ? 'up' : 'down') }, (d > 0 ? '▲ ' : '▼ ') + fmt.num(Math.abs(d)) + (pp ? ' p.p.' : '%'));
  }
  /** mesmo período no mês/trimestre/ano anterior (ou dia/semana anterior) */
  function periodoAnterior(ini, fim, tipo) {
    if (tipo === 'hoje') return [dates.addDays(ini, -1), dates.addDays(fim, -1)];
    if (tipo === 'semana') return [dates.addDays(ini, -7), dates.addDays(fim, -7)];
    const meses = tipo === 'trimestre' ? 3 : tipo === 'ano' ? 12 : 1;
    const f = U.toDate(fim); const alvo = new Date(f.getFullYear(), f.getMonth() - meses, 1);
    const ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    return [dates.addMonths(ini, -meses), dates.iso(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(f.getDate(), ult)))];
  }
  App.periodoAnterior = periodoAnterior;
  const pessoa = (r, size) => h('span', { class: 'pr-av' }, avatar(r.nome, size), r.equipe_logo || r.equipe ? h('span', { class: 'pr-team' }, App.teamLogo({ logo: r.equipe_logo, cor: r.equipe_cor, nome: r.equipe }, Math.round(size * 0.46))) : null);

  // ------------------------------------------------------------------
  // DESEMPENHO INDIVIDUAL (mês selecionado × mês anterior)
  // ------------------------------------------------------------------
  Views.desempenho = async function (params) {
    const state = { mes: params.q.mes || dates.today().slice(0, 7), comp: 'mesmo', ordem: 'valor', ...(App.gestor() ? (U.store('desemp.f') || {}) : {}) };
    const wrap = h('div'); const bar = h('div', { class: 'filters' }); const resumo = h('div'); const body = h('div');
    const load = async () => {
      if (App.gestor()) U.store('desemp.f', App.filtrosAtivos(state));
      const ini = state.mes + '-01', hoje = dates.today(), atual = state.mes === hoje.slice(0, 7);
      const fim = atual ? hoje : dates.endOfMonth(ini);
      const pIni = dates.addMonths(ini, -1), pFimCheio = dates.endOfMonth(pIni);
      const pFim = atual && state.comp === 'mesmo' ? periodoAnterior(ini, fim, 'mes')[1] : pFimCheio;
      paintBar(atual, pIni, pFim);
      clear(body).appendChild(U.skeleton(8)); clear(resumo);
      const f = App.filtrosAtivos(state);
      const [cur, prev, vendas] = await Promise.all([
        API.rpc('desempenho_corretores', { p_inicio: ini, p_fim: fim, p_filtros: f }),
        API.rpc('desempenho_corretores', { p_inicio: pIni, p_fim: pFim, p_filtros: f }),
        API.all('v_sales', { select: 'corretor_id,data_venda,valor_mensal,status', in: { status: ['aprovada', 'implantada'] }, gte: { data_venda: dates.addMonths(ini, -5) }, lte: { data_venda: fim } })]);
      const P = Object.fromEntries(prev.map(r => [r.id, r]));
      const meses = Array.from({ length: 6 }, (_, i) => dates.addMonths(ini, i - 5).slice(0, 7));
      const serie = id => meses.map(m => vendas.filter(s => s.corretor_id === id && s.data_venda.slice(0, 7) === m).reduce((a, s) => a + Number(s.valor_mensal), 0));
      const cresc = r => { const p = P[r.id] || {}; return p.valor ? (r.valor - p.valor) / p.valor : r.valor ? 9e9 : -9e9; };
      const rows = [...cur].sort(state.ordem === 'crescimento' ? (a, b) => cresc(b) - cresc(a) : state.ordem === 'conversao' ? (a, b) => b.conversao - a.conversao || b.valor - a.valor : (a, b) => b.valor - a.valor || b.vendas - a.vendas);
      const rotulo = `${fmt.dateShort(pIni)} a ${fmt.dateShort(pFim)}`;
      // resumo da estrutura
      const t = { valor: soma(cur, 'valor'), vendas: soma(cur, 'vendas'), leads: soma(cur, 'leads_recebidos'), conv: conv(soma(cur, 'convertidos'), soma(cur, 'leads_recebidos')) };
      const tp = { valor: soma(prev, 'valor'), vendas: soma(prev, 'vendas'), leads: soma(prev, 'leads_recebidos'), conv: conv(soma(prev, 'convertidos'), soma(prev, 'leads_recebidos')) };
      clear(resumo).append(h('div', { class: 'kpis', style: { marginBottom: '16px' } },
        App.kpi(rows.length === 1 && App.is('corretor') ? 'Minha produção' : 'Produção da estrutura', fmt.money0(t.valor), { hero: true, foot: h('span', null, delta(t.valor, tp.valor), h('span', { class: 'muted' }, ' vs ' + rotulo)) }),
        App.kpi('Vendas', fmt.int(t.vendas), { foot: h('span', null, delta(t.vendas, tp.vendas), h('span', { class: 'muted' }, ' antes: ' + fmt.int(tp.vendas))) }),
        App.kpi('Conversão dos leads', fmt.pct(t.conv), { foot: h('span', null, delta(t.conv, tp.conv, { pp: true }), h('span', { class: 'muted' }, ' antes: ' + fmt.pct(tp.conv))) }),
        App.kpi('Leads recebidos', fmt.int(t.leads), { foot: h('span', null, delta(t.leads, tp.leads), h('span', { class: 'muted' }, ' antes: ' + fmt.int(tp.leads))) }),
        App.kpi('Corretores', fmt.int(rows.length), { foot: `${rows.filter(r => r.valor > (P[r.id] || {}).valor || (r.valor && !(P[r.id] || {}).valor)).length} cresceram` })));
      if (!rows.length) { clear(body).appendChild(empty('Nenhum corretor', 'Não há corretores ativos para este filtro.')); return; }
      const card = (r, i) => {
        const p = P[r.id] || { valor: 0, vendas: 0, conversao: 0, leads_recebidos: 0, ticket_medio: 0, vidas: 0 };
        const s = serie(r.id); const metaPct = r.meta ? Math.min(100, 100 * r.realizado_mes / r.meta) : null;
        const u = App.lk.userMap[r.id] || {};
        const tm = App.lk.teamMap[r.team_id] || {};
        return h('article', { class: 'perf-card', onclick: App.gestor() ? () => App.go('/equipe/' + r.id) : null },
          h('header', { class: 'perf-head' }, h('span', { class: 'perf-pos' + (i < 3 && state.ordem === 'valor' ? ' top' : ''), style: i < 3 && state.ordem === 'valor' ? { '--c': MEDAL[i] } : null }, (i + 1) + 'º'),
            pessoa({ nome: r.nome, equipe: r.equipe, equipe_logo: tm.logo, equipe_cor: tm.cor }, 42),
            h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'perf-name' }, r.nome), h('div', { class: 'cell-sub' }, [r.equipe, App.is('admin', 'gerente') ? r.supervisor : null].filter(Boolean).join(' · '))),
            App.gestor() && u.grade_comissao ? App.gradeBadge(u.grade_comissao) : null),
          h('div', { class: 'perf-main' }, h('div', null, h('div', { class: 'perf-lbl' }, 'Produção no mês'), h('div', { class: 'perf-val' }, fmt.money0(r.valor))),
            h('div', { class: 'perf-delta' }, delta(r.valor, p.valor), h('small', null, 'vs ' + fmt.money0(p.valor)))),
          h('div', { class: 'perf-grid' },
            h('div', null, h('span', null, 'Vendas'), h('b', null, fmt.int(r.vendas)), delta(r.vendas, p.vendas, { compacto: true })),
            h('div', null, h('span', null, 'Conversão'), h('b', null, fmt.pct(r.conversao)), delta(r.conversao, p.conversao, { pp: true })),
            h('div', null, h('span', null, 'Leads'), h('b', null, fmt.int(r.leads_recebidos)), delta(r.leads_recebidos, p.leads_recebidos, { compacto: true })),
            h('div', null, h('span', null, 'Ticket médio'), h('b', null, fmt.moneyShort(r.ticket_medio)), delta(r.ticket_medio, p.ticket_medio, { compacto: true }))),
          h('div', { class: 'perf-spark' }, Charts.spark(s, { color: 'var(--blue-2)', w: 220, hgt: 34 }), h('div', { class: 'perf-spark-l' }, h('span', null, fmt.month(meses[0])), h('span', null, '6 meses'), h('span', null, fmt.month(meses[5])))),
          metaPct !== null ? h('div', { class: 'perf-meta' }, h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '11.5px' } }, h('span', { class: 'muted' }, 'Meta do mês'), h('span', { class: metaPct >= 100 ? 'ok-t' : '' }, fmt.pct(100 * r.realizado_mes / r.meta) + ' de ' + fmt.moneyShort(r.meta))),
            h('div', { class: 'meta-bar' }, h('div', { style: { width: metaPct + '%', background: metaPct >= 100 ? 'var(--ok)' : 'var(--blue)' } }))) : null,
          h('footer', { class: 'perf-foot' }, `Mês anterior (${rotulo}): ${fmt.int(p.vendas)} venda(s) · ${fmt.pct(p.conversao)} de conversão`));
      };
      const grid = h('div', { class: 'perf-grid-wrap' }, rows.map(card));
      clear(body).append(grid);
      if (rows.length === 1) {
        const s = serie(rows[0].id);
        body.append(h('div', { style: { marginTop: '14px' } }, App.card('Minha produção — últimos 6 meses', Charts.columns(meses.map((m, i) => ({ label: fmt.month(m), value: s[i] })), { format: fmt.moneyShort, barLabel: 'Valor vendido' }))));
      }
    };
    const paintBar = (atual, pIni, pFim) => {
      clear(bar).append(
        h('input', { type: 'month', value: state.mes, 'aria-label': 'Mês', max: dates.today().slice(0, 7), onchange: e => { state.mes = e.target.value || state.mes; load(); } }),
        h('button', { class: 'icon-btn', 'aria-label': 'Mês anterior', onclick: () => { state.mes = dates.addMonths(state.mes + '-01', -1).slice(0, 7); load(); } }, icon('chevronLeft')),
        h('button', { class: 'icon-btn', 'aria-label': 'Próximo mês', disabled: atual || null, onclick: () => { state.mes = dates.addMonths(state.mes + '-01', 1).slice(0, 7); load(); } }, icon('chevronRight')),
        atual ? h('div', { class: 'seg', title: 'Como comparar com o mês anterior' }, [['mesmo', 'Mesmo período do mês anterior'], ['cheio', 'Mês anterior completo']].map(([k, l]) => h('button', { class: state.comp === k ? 'on' : '', onclick: () => { state.comp = k; load(); } }, l))) : h('span', { class: 'muted' }, 'Comparado ao mês anterior completo'),
        h('div', { class: 'seg' }, [['valor', 'Produção'], ['crescimento', 'Crescimento'], ['conversao', 'Conversão']].map(([k, l]) => h('button', { class: state.ordem === k ? 'on' : '', onclick: () => { state.ordem = k; load(); } }, 'Ordenar: ' + l))),
        ...(App.gestor() ? App.hierFilters(state, load, { corretor: false, equipe: true }) : []));
    };
    wrap.append(App.pageHead('Desempenho individual', { eyebrow: 'Vendas mensais e conversão', desc: App.is('corretor') ? 'Seus números do mês comparados com você mesmo no mês anterior.' : 'Cada corretor comparado com ele mesmo no mês anterior: produção, vendas, conversão dos leads e evolução de 6 meses.',
      actions: [h('button', { class: 'btn', onclick: () => App.go('/ranking') }, icon('trophy', 16), 'Ranking ao vivo')] }), bar, resumo, body);
    await load();
    return wrap;
  };

  // ------------------------------------------------------------------
  // RANKING AO VIVO (corretores · equipes · supervisores)
  // ------------------------------------------------------------------
  Views.ranking = async function (params) {
    const NIV = [['corretor', 'Corretores', 'users'], ['equipe', 'Equipes', 'team'], ['supervisor', 'Supervisores', 'user']];
    const M = { valor: ['Produção', fmt.money0], vendas: ['Vendas', fmt.int], vidas: ['Vidas', fmt.int], conversao: ['Conversão', fmt.pct] };
    const state = { ...App.initPeriod('mes'), metrica: 'valor', nivel: NIV.some(n => n[0] === params.q.nivel) ? params.q.nivel : 'corretor' };
    const wrap = h('div', { class: 'rk' }); const top = h('div'); const tabBar = h('div'); const bar = h('div', { class: 'filters' }); const podio = h('div'); const lista = h('div');
    const live = h('span', { class: 'live-pill' }, h('i'), 'AO VIVO', h('span', { class: 'live-t' }, ''));
    const valoresAntes = new Map();
    let cur = [], prev = [], atualizadoEm = 0, carregando = false, rotacao = null;

    const agrupar = (rows, key, init) => {
      const m = new Map();
      rows.forEach(r => { const k = r[key] || '—'; if (!m.has(k)) m.set(k, { key: k, ...init(r), vendas: 0, valor: 0, vidas: 0, leads: 0, convertidos: 0, meta: null, realizado_mes: 0, corretores: 0, eu: false });
        const g = m.get(k); g.vendas += r.vendas; g.valor += Number(r.valor); g.vidas += r.vidas; g.leads += r.leads; g.convertidos += r.convertidos; g.corretores++; g.realizado_mes += Number(r.realizado_mes || 0);
        if (r.meta != null) g.meta = (g.meta || 0) + Number(r.meta); if (r.eu) g.eu = true; });
      return [...m.values()].map(g => ({ ...g, conversao: conv(g.convertidos, g.leads) }));
    };
    const construir = rows => state.nivel === 'equipe' ? agrupar(rows, 'team_id', r => ({ nome: r.equipe || 'Sem equipe', logo: r.equipe_logo, cor: r.equipe_cor, sub: [r.supervisor ? 'Sup. ' + r.supervisor : null, r.gerente ? 'Ger. ' + r.gerente : null].filter(Boolean).join(' · ') }))
      : state.nivel === 'supervisor' ? agrupar(rows.filter(r => r.supervisor_id), 'supervisor_id', r => ({ nome: r.supervisor || '—', equipe: r.equipe, equipe_logo: r.equipe_logo, equipe_cor: r.equipe_cor, sub: [r.equipe, r.gerente ? 'Ger. ' + r.gerente : null].filter(Boolean).join(' · ') }))
      : rows.map(r => ({ ...r, key: r.id, sub: [r.equipe, r.supervisor ? 'Sup. ' + r.supervisor : null].filter(Boolean).join(' · ') }));
    const ordenar = a => a.sort((x, y) => (y[state.metrica] - x[state.metrica]) || (y.valor - x.valor) || x.nome.localeCompare(y.nome));
    const idTela = r => state.nivel + ':' + r.key + ':' + state.metrica;

    const load = async (silencioso) => {
      if (carregando) return; carregando = true;
      try {
        const [pi, pf] = periodoAnterior(state.ini, state.fim, state.periodo);
        [cur, prev] = await Promise.all([API.rpc('ranking_comercial', { p_inicio: state.ini, p_fim: state.fim }), API.rpc('ranking_comercial', { p_inicio: pi, p_fim: pf })]);
        state.rotuloAnt = `${fmt.dateShort(pi)}${pi !== pf ? ' a ' + fmt.dateShort(pf) : ''}`;
        atualizadoEm = Date.now(); paint(silencioso);
      } catch (e) { if (!silencioso) App.err(e); } finally { carregando = false; }
    };
    const identidade = (r, size) => state.nivel === 'equipe' ? App.teamLogo({ logo: r.logo, cor: r.cor, nome: r.nome }, size) : pessoa(r, size);
    const valorEl = (r, cls) => { const el = h('span', { class: cls }); const [, f] = M[state.metrica]; const id = idTela(r) + ':' + cls; const v = Number(r[state.metrica]) || 0;
      const tinha = valoresAntes.has(id); const antes = tinha ? valoresAntes.get(id) : 0; U.contar(el, antes, v, f); valoresAntes.set(id, v); return { el, mudou: tinha && antes !== v }; };

    const paint = (silencioso) => {
      const A = ordenar(construir(cur)), P = ordenar(construir(prev));
      const posAnt = new Map(P.map((r, i) => [r.key, i])); const antMap = new Map(P.map(r => [r.key, r]));
      const [lab, f] = M[state.metrica];
      const lider = Math.max(1, ...A.map(r => Number(r[state.metrica]) || 0));
      clear(tabBar).appendChild(U.tabs(NIV.map(([key, label]) => ({ key, label })), state.nivel, k => { state.nivel = k; paint(); }));
      // pódio
      const t3 = A.slice(0, 3);
      clear(podio);
      if (t3.length) podio.appendChild(h('div', { class: 'rk-podium' + (state.nivel === 'equipe' ? ' teams' : '') }, [1, 0, 2].filter(i => t3[i]).map(i => { const r = t3[i]; const v = valorEl(r, 'rk-pod-val'); const ant = antMap.get(r.key);
        return h('div', { class: 'rk-pod p' + (i + 1) + (r.eu ? ' eu' : ''), style: { '--m': MEDAL[i] } },
          h('div', { class: 'rk-pod-pos' }, h('span', null, (i + 1) + 'º')),
          h('div', { class: 'rk-pod-id' }, identidade(r, i === 0 ? 84 : 66)),
          h('div', { class: 'rk-pod-name' }, r.nome), h('div', { class: 'rk-pod-sub' }, r.sub || ''),
          v.el, h('div', { class: 'rk-pod-foot' }, delta(r[state.metrica], ant ? ant[state.metrica] : 0, { pp: state.metrica === 'conversao' }), h('span', { class: 'muted' }, ` ${fmt.int(r.vendas)} venda(s)`)),
          h('div', { class: 'rk-pod-base' }));
      })));
      // lista completa
      clear(lista);
      if (!A.length) { lista.appendChild(empty('Sem dados no período', 'Assim que as vendas forem aprovadas, o ranking aparece aqui.')); return; }
      lista.appendChild(h('div', { class: 'rk-list' }, A.map((r, i) => {
        const pa = posAnt.has(r.key) ? posAnt.get(r.key) : null; const mov = pa === null ? null : pa - i; const ant = antMap.get(r.key);
        const v = valorEl(r, 'rk-val');
        const pct = Math.max(2, 100 * (Number(r[state.metrica]) || 0) / lider);
        const row = h('div', { class: 'rk-row' + (i < 3 ? ' top' : '') + (r.eu ? ' eu' : ''), style: i < 3 ? { '--m': MEDAL[i] } : null, onclick: App.gestor() && state.nivel === 'corretor' ? () => App.go('/equipe/' + r.id) : null },
          h('span', { class: 'rk-pos' }, i + 1),
          h('span', { class: 'rk-mov ' + (mov === null ? 'new' : mov > 0 ? 'up' : mov < 0 ? 'down' : 'eq'), title: mov === null ? 'Sem posição no período anterior' : 'Posição no período anterior: ' + (pa + 1) + 'º' }, mov === null ? 'novo' : mov > 0 ? '▲' + mov : mov < 0 ? '▼' + Math.abs(mov) : '—'),
          identidade(r, 38),
          h('div', { class: 'rk-id' }, h('div', { class: 'rk-name' }, r.nome, r.eu ? h('span', { class: 'rk-eu' }, 'você') : null), h('div', { class: 'rk-sub' }, r.sub || (state.nivel !== 'corretor' ? r.corretores + ' corretor(es)' : ''))),
          h('div', { class: 'rk-bar' }, h('i', { style: { width: pct + '%' } })),
          v.el,
          h('div', { class: 'rk-stats' }, h('span', null, h('b', null, fmt.int(r.vendas)), r.vendas === 1 ? ' venda' : ' vendas'), h('span', null, h('b', null, fmt.int(r.vidas)), ' vidas'), h('span', null, h('b', null, fmt.pct(r.conversao)), ' conv.'),
            state.nivel !== 'corretor' ? h('span', null, h('b', null, r.corretores), ' corr.') : null),
          h('div', { class: 'rk-delta' }, delta(r[state.metrica], ant ? ant[state.metrica] : 0, { pp: state.metrica === 'conversao' }), h('small', null, 'vs ' + (ant ? f(ant[state.metrica]) : '—'))),
          r.meta ? h('div', { class: 'rk-meta', title: 'Meta do mês' }, h('div', { class: 'meta-bar' }, h('div', { style: { width: Math.min(100, 100 * r.realizado_mes / r.meta) + '%', background: r.realizado_mes >= r.meta ? 'var(--ok)' : 'var(--blue)' } })), h('small', null, fmt.pct(100 * r.realizado_mes / r.meta) + ' da meta')) : h('div', { class: 'rk-meta' }));
        if (silencioso && v.mudou) requestAnimationFrame(() => row.classList.add('flash'));
        return row;
      })), h('div', { class: 'muted rk-nota' }, `Comparado com ${state.rotuloAnt || 'o período anterior'} · ${lab} · atualiza sozinho a cada 20 segundos`));
    };
    const paintBar = () => clear(bar).append(App.periodPicker(state, () => load(), ['hoje', 'semana', 'mes', 'mes_anterior', 'trimestre', 'ano']),
      h('div', { class: 'seg' }, Object.entries(M).map(([k, [l]]) => h('button', { class: state.metrica === k ? 'on' : '', onclick: () => { state.metrica = k; paintBar(); paint(); } }, l))));
    // modo TV: tela cheia, sem menus, alternando corretores e equipes
    const sairTV = () => { document.body.classList.remove('tv-mode'); clearInterval(rotacao); rotacao = null; try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* */ } };
    const entrarTV = () => {
      document.body.classList.add('tv-mode'); try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* */ }
      clearInterval(rotacao); rotacao = setInterval(() => { if (!document.body.contains(wrap)) return sairTV(); state.nivel = state.nivel === 'corretor' ? 'equipe' : 'corretor'; paint(); }, 25000);
    };
    const escTV = e => { if (e.key === 'Escape' && document.body.classList.contains('tv-mode')) sairTV(); };
    document.addEventListener('keydown', escTV);
    clear(top).append(App.pageHead('Ranking comercial', { eyebrow: 'Tempo real', desc: 'Corretores, equipes e supervisores — posição, produção e evolução em relação ao período anterior.',
      actions: [live, h('button', { class: 'btn', onclick: () => App.go('/desempenho') }, icon('activity', 16), 'Desempenho individual'), h('button', { class: 'btn primary', onclick: entrarTV }, icon('external', 16), 'Modo TV')] }),
      h('button', { class: 'tv-exit', onclick: sairTV }, icon('x', 16), 'Sair do modo TV'));
    wrap.append(top, tabBar, bar, podio, lista);
    paintBar();
    await load();
    const tick = setInterval(() => {
      if (!document.body.contains(wrap)) { clearInterval(tick); document.removeEventListener('keydown', escTV); sairTV(); return; }
      const s = Math.round((Date.now() - atualizadoEm) / 1000); live.querySelector('.live-t').textContent = s < 5 ? ' · agora' : ` · há ${s}s`;
      if (s >= 20 && !document.hidden) load(true);
    }, 1000);
    return wrap;
  };
})(window);
