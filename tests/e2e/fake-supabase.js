/* Supabase falso, em memória, para os testes E2E.
   Substitui vendor/supabase.js no navegador do teste. Imita o que o sistema usa:
   auth, from().select/upsert/insert/update/delete com filtros, paginação por
   range() com o teto de 1000 linhas do PostgREST, RLS simplificada (a mesma
   lógica do schema) e o tempo real (postgres_changes).
   Estado inicial: window.__FAKE_DB__ = { users:[...], tables:{ nome:[linhas] } } */
(function () {
  "use strict";
  const MAX_ROWS = 1000;
  const semente = window.__FAKE_DB__ || {};
  const db = { tables: {}, users: semente.users || [], log: [], session: null, listeners: [], authCbs: [], falhas: semente.falhas || {} };
  for (const t of ["perfis", "leads", "clientes", "contratos", "vidas", "tarefas", "despesas", "config", "atividade", "auditoria"]) {
    db.tables[t] = JSON.parse(JSON.stringify((semente.tables || {})[t] || []));
  }
  if (semente.sessionUserId) {
    const u = db.users.find(x => x.id === semente.sessionUserId);
    if (u) db.session = sessaoDe(u);
  }
  function sessaoDe(u) { return { access_token: "fake", user: { id: u.id, email: u.email, user_metadata: { nome: u.nome } } }; }

  const uid = () => db.session && db.session.user.id;
  const perfil = () => db.tables.perfis.find(p => p.id === uid());
  const ativo = () => !!(perfil() && perfil().status === "ativo");
  const gestor = () => ativo() && perfil().papel === "gestor";
  const vejoTudo = () => ativo() && (["gestor", "assistente"].includes(perfil().papel) || perfil().ver_tudo);
  const DONO = ["leads", "clientes", "contratos", "tarefas"];

  function podeLer(t, r) {
    if (!uid()) return false;
    if (t === "perfis") return r.id === uid() || vejoTudo();
    if (DONO.includes(t)) return ativo() && (vejoTudo() || r.dono === uid());
    if (t === "vidas") return ativo() && db.tables.contratos.some(c => c.id === (r.dados || {}).contratoId && podeLer("contratos", c));
    if (t === "despesas") return gestor();
    if (t === "config") return ativo();
    if (t === "atividade") return gestor() || r.quem === uid();
    if (t === "auditoria") return gestor();
    return false;
  }
  function podeEscrever(t, r, op) {
    if (!uid()) return false;
    if (t === "perfis") return op === "update" ? (r.id === uid() || gestor()) : gestor();
    if (DONO.includes(t)) {
      if (op === "delete" && ["clientes", "contratos"].includes(t)) return gestor();
      return ativo() && (vejoTudo() || r.dono === uid());
    }
    if (t === "vidas") return podeLer("vidas", r);
    if (t === "despesas" || t === "config") return gestor();
    if (t === "atividade") return op === "insert" && ativo() && r.quem === uid();
    return false;
  }
  const erroRls = t => ({ message: `new row violates row-level security policy for table "${t}"`, code: "42501" });

  function emitir(t, tipo, novo, velho) {
    const payload = { schema: "public", table: t, eventType: tipo, new: novo || {}, old: velho || {} };
    setTimeout(() => {
      for (const l of db.listeners) {
        if (l.filtro.table && l.filtro.table !== t) continue;
        if (l.filtro.event && l.filtro.event !== "*" && l.filtro.event !== tipo) continue;
        // o tempo real respeita a RLS de leitura
        if (tipo !== "DELETE" && !podeLer(t, novo)) continue;
        try { l.cb(payload); } catch (e) { console.error(e); }
      }
    }, 5);
  }

  const campo = (r, c) => {
    const m = /^(\w+)->>(\w+)$/.exec(c);
    return m ? (r[m[1]] || {})[m[2]] : r[c];
  };

  class Q {
    constructor(t) { this.t = t; this.f = []; this.modo = "select"; this.ord = null; this.lim = null; this.rng = null; this.um = null; this.opts = {}; this.retorna = false; }
    select(cols, opts) { if (this.modo !== "select") this.retorna = true; else this.opts = opts || {}; return this; }
    eq(c, v) { this.f.push(r => String(campo(r, c)) === String(v)); return this; }
    neq(c, v) { this.f.push(r => String(campo(r, c)) !== String(v)); return this; }
    in(c, vs) { this.f.push(r => vs.map(String).includes(String(campo(r, c)))); return this; }
    gt(c, v) { this.f.push(r => campo(r, c) > v); return this; }
    gte(c, v) { this.f.push(r => campo(r, c) >= v); return this; }
    lt(c, v) { this.f.push(r => campo(r, c) < v); return this; }
    lte(c, v) { this.f.push(r => campo(r, c) <= v); return this; }
    order(c, o) { this.ord = { c, asc: !(o && o.ascending === false) }; return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    maybeSingle() { this.um = "maybe"; return this; }
    single() { this.um = "single"; return this; }
    upsert(v, o) { this.modo = "upsert"; this.payload = [].concat(v); this.opts = o || {}; return this; }
    insert(v) { this.modo = "insert"; this.payload = [].concat(v); return this; }
    update(v) { this.modo = "update"; this.payload = v; return this; }
    delete() { this.modo = "delete"; return this; }
    then(ok, erro) { return Promise.resolve().then(() => this.run()).then(ok, erro); }
    run() {
      const t = this.t, tab = db.tables[t];
      const falha = db.falhas[t + ":" + this.modo];
      if (falha) return { data: null, error: { message: falha } };
      db.log.push({ t, modo: this.modo, payload: this.payload });
      if (!tab) return { data: null, error: { message: `relation "${t}" does not exist` } };
      if (this.modo === "select") {
        let linhas = tab.filter(r => podeLer(t, r)).filter(r => this.f.every(fn => fn(r)));
        if (this.ord) { const { c, asc } = this.ord; linhas.sort((a, b) => (String(campo(a, c)) < String(campo(b, c)) ? -1 : String(campo(a, c)) > String(campo(b, c)) ? 1 : 0) * (asc ? 1 : -1)); }
        const total = linhas.length;
        if (this.rng) linhas = linhas.slice(this.rng[0], this.rng[1] + 1);
        if (this.lim != null) linhas = linhas.slice(0, this.lim);
        linhas = linhas.slice(0, MAX_ROWS);
        const data = JSON.parse(JSON.stringify(linhas));
        if (this.um) return { data: data[0] || null, error: (this.um === "single" && !data[0]) ? { message: "no rows" } : null };
        return { data, error: null, count: this.opts.count ? total : null };
      }
      if (this.modo === "upsert" || this.modo === "insert") {
        const feitos = [];
        for (const v of this.payload) {
          const linha = Object.assign({ dono: uid() }, JSON.parse(JSON.stringify(v)));
          if (t === "atividade" && linha.quem === undefined) linha.quem = uid();
          const i = tab.findIndex(r => r.id === linha.id);
          if (i >= 0 && this.modo === "insert") return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
          if (i >= 0 && (!podeLer(t, tab[i]) || !podeEscrever(t, tab[i], "update"))) return { data: null, error: erroRls(t) };
          if (!podeEscrever(t, linha, i >= 0 ? "update" : "insert")) return { data: null, error: erroRls(t) };
          linha.atualizado_em = new Date().toISOString();
          const velho = i >= 0 ? tab[i] : null;
          if (velho && velho.dados && linha.dados && t !== "atividade") {
            const mud = {};
            for (const k of new Set([...Object.keys(velho.dados), ...Object.keys(linha.dados)]))
              if (!/^atualizado/.test(k) && JSON.stringify(velho.dados[k]) !== JSON.stringify(linha.dados[k])) mud[k] = { de: velho.dados[k] ?? null, para: linha.dados[k] ?? null };
            if (Object.keys(mud).length) db.tables.auditoria.push({ id: db.tables.auditoria.length + 1, quando: new Date().toISOString(), quem: uid(), tabela: t, registro_id: linha.id, acao: "UPDATE", mudancas: mud });
          }
          if (i >= 0) tab[i] = Object.assign({}, tab[i], linha); else tab.push(linha);
          feitos.push(linha);
          emitir(t, velho ? "UPDATE" : "INSERT", linha, velho ? { id: velho.id } : null);
        }
        return { data: this.retorna ? feitos : null, error: null };
      }
      if (this.modo === "update") {
        const alvo = tab.filter(r => podeLer(t, r)).filter(r => this.f.every(fn => fn(r)));
        for (const r of alvo) {
          const novo = Object.assign({}, r, this.payload);
          if (!podeEscrever(t, novo, "update")) return { data: null, error: erroRls(t) };
          if (t === "perfis" && !gestor() && ["papel", "status", "ver_tudo", "meta", "split_pct"].some(k => k in this.payload && this.payload[k] !== r[k])) {
            return { data: null, error: { message: "Somente o gestor altera papel, situação, alcance, meta ou split.", code: "42501" } };
          }
          Object.assign(r, this.payload);
          emitir(t, "UPDATE", r, { id: r.id });
        }
        return { data: null, error: null };
      }
      if (this.modo === "delete") {
        const alvo = tab.filter(r => podeLer(t, r)).filter(r => this.f.every(fn => fn(r)));
        const permitidos = alvo.filter(r => podeEscrever(t, r, "delete"));
        alvo.length = 0; alvo.push(...permitidos);
        db.tables[t] = tab.filter(r => !alvo.includes(r));
        for (const r of alvo) {
          emitir(t, "DELETE", null, { id: r.id });
          if (r.dados) db.tables.auditoria.push({ id: db.tables.auditoria.length + 1, quando: new Date().toISOString(), quem: uid(), tabela: t, registro_id: r.id, acao: "DELETE", registro: Object.assign({}, r.dados, { _dono: r.dono }) });
        }
        return { data: this.retorna ? alvo.map(r => ({ id: r.id })) : null, error: null };
      }
      return { data: null, error: { message: "modo desconhecido" } };
    }
  }

  function avisarAuth(evento) { for (const cb of db.authCbs) setTimeout(() => cb(evento, db.session), 0); }
  const client = {
    from: t => new Q(t),
    rpc: async (nome, args) => {
      if (nome === "cliente_por_documento") {
        if (!ativo()) return { data: [], error: null };
        const n = v => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
        const c = db.tables.clientes.find(r => n((r.dados || {}).doc) === n(args.doc) && r.id !== args.exceto);
        if (!c) return { data: [], error: null };
        const v = vejoTudo() || c.dono === uid();
        const p = db.tables.perfis.find(x => x.id === c.dono);
        return { data: [{ id: v ? c.id : null, nome: v ? c.dados.nome : null, responsavel: p ? p.nome : "outro membro da equipe", visivel: v }], error: null };
      }
      return { data: null, error: { message: `function ${nome} does not exist` } };
    },
    auth: {
      getSession: async () => ({ data: { session: db.session }, error: null }),
      onAuthStateChange: cb => { db.authCbs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async ({ email, password }) => {
        const u = db.users.find(x => x.email === email && x.password === password);
        if (!u) return { data: {}, error: { message: "Invalid login credentials" } };
        db.session = sessaoDe(u); avisarAuth("SIGNED_IN");
        return { data: { session: db.session }, error: null };
      },
      signUp: async ({ email, password, options }) => {
        if (db.users.some(x => x.email === email)) return { data: {}, error: { message: "User already registered" } };
        const u = { id: crypto.randomUUID(), email, password, nome: options && options.data && options.data.nome };
        db.users.push(u);
        db.tables.perfis.push({ id: u.id, nome: u.nome, email, papel: "corretor", status: "pendente", ver_tudo: false, meta: 0, split_pct: 50 });
        db.session = sessaoDe(u); avisarAuth("SIGNED_IN");
        return { data: { session: db.session, user: db.session.user }, error: null };
      },
      signInWithOtp: async () => ({ data: {}, error: null }),
      signOut: async () => { db.session = null; avisarAuth("SIGNED_OUT"); return { error: null }; }
    },
    channel: () => {
      const ch = {
        on: (_tipo, filtro, cb) => { db.listeners.push({ filtro: filtro || {}, cb }); return ch; },
        subscribe: cb => { if (cb) setTimeout(() => cb("SUBSCRIBED"), 0); return ch; },
        unsubscribe: () => {}
      };
      return ch;
    },
    removeChannel: () => {}
  };
  window.supabase = { createClient: () => client };
  // Ganchos para o teste: inspecionar e simular mudança vinda de outro usuário.
  window.__fake = {
    db,
    externo(t, tipo, linha) {
      const tab = db.tables[t];
      const i = tab.findIndex(r => r.id === linha.id);
      if (tipo === "DELETE") { db.tables[t] = tab.filter(r => r.id !== linha.id); emitir(t, "DELETE", null, { id: linha.id }); return; }
      if (i >= 0) tab[i] = linha; else tab.push(linha);
      emitir(t, i >= 0 ? "UPDATE" : "INSERT", linha, i >= 0 ? { id: linha.id } : null);
    },
    selects: () => db.log.filter(x => x.modo === "select").length
  };
})();
