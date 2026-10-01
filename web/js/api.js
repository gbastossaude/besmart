/* =====================================================================
   ATOS SISTEMA — api.js
   Camada única de dados. Dois motores com a MESMA interface:
     • SupabaseBackend → produção (PostgreSQL + RLS no servidor)
     • DemoBackend     → demonstração em memória (demo.js), que reproduz
                          as mesmas regras de acesso para testes e preview
   Opções de consulta (list):
     { select, eq:{c:v}, neq:{}, in:{c:[..]}, gte:{}, lte:{}, gt:{}, lt:{},
       isNull:[c], notNull:[c], ilike:{c:'%x%'}, or:[[c,op,v],...],
       search:{cols:[..], term}, order:[[c, asc]], limit, offset, count }
   ===================================================================== */
(function (global) {
  'use strict';

  const MSG = {
    '42501': 'Você não tem permissão para esta ação.',
    '23505': 'Já existe um registro com esses dados.',
    '23503': 'Este registro está vinculado a outros dados e não pode ser alterado assim.',
    '23502': 'Preencha todos os campos obrigatórios.',
    '23514': 'Algum dado informado não é válido. Revise os campos.',
    '22P02': 'Algum dado informado está em formato inválido.',
    '22001': 'Um dos textos informados é longo demais.',
    '22008': 'Data ou horário inválido.',
    'PGRST116': 'Registro não encontrado ou sem permissão de acesso.',
    'PGRST301': 'Sua sessão expirou. Entre novamente.',
    '57014': 'A consulta demorou demais. Tente um período menor ou mais filtros.',
  };
  const CONSTRAINT = { events_link_reuniao_http: 'O link da reunião precisa começar com https://' };
  const TECNICO = /(violates|constraint|relation "|column "|syntax error|function .*does not exist|null value in column|invalid input|duplicate key|PGRST|JWT|undefined|Cannot read|TypeError|ReferenceError|\bstack\b|at \w+ \()/i;
  /** converte qualquer erro em uma mensagem que a pessoa entende (o detalhe técnico vai para o console) */
  function friendly(err) {
    if (!err) return 'Algo deu errado. Tente novamente.';
    const m = String(err.message || err.error_description || err.msg || err || '');
    const st = Number(err.status || err.statusCode || 0);
    if (err.name === 'AbortError' || /timeout|timed out|tempo esgotado/i.test(m)) return 'O servidor demorou para responder. Verifique sua conexão e tente novamente.';
    if (/Failed to fetch|NetworkError|Network request failed|Load failed|ERR_INTERNET|fetch failed/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false))
      return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
    if (/JWT expired|invalid JWT|refresh token|session.*(missing|expired)|not authenticated|Auth session missing/i.test(m) || err.code === 'PGRST301' || st === 401) return MSG.PGRST301;
    if (/row-level security|permission denied/i.test(m)) return MSG['42501'];
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).';
    if (/User already registered|already been registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Esqueci minha senha" para recuperar o acesso.';
    if (/Password should be|weak password/i.test(m)) return 'A senha é fraca. Use ao menos 8 caracteres, misturando letras e números.';
    if (/rate limit|too many requests|For security purposes/i.test(m) || st === 429) return 'Muitas tentativas seguidas. Aguarde um minuto e tente novamente.';
    if (/Unable to validate email|invalid format.*email|email address.*invalid/i.test(m)) return 'Informe um e-mail válido.';
    for (const [c, txt] of Object.entries(CONSTRAINT)) if (m.includes(c)) return txt;
    // mensagens escritas em português pelo próprio banco (raise exception) são mostradas como estão
    if (/[áéíóúãõçÁÉÍÓÚÃÕÇ]/.test(m) && !TECNICO.test(m)) return m.replace(/^ERROR:\s*/, '');
    if (err.code && MSG[err.code]) return MSG[err.code];
    if (st >= 500 || /Internal Server Error|Bad Gateway|Service Unavailable/i.test(m)) return 'O servidor está com instabilidade no momento. Tente novamente em instantes.';
    if (st === 404) return 'O recurso solicitado não foi encontrado.';
    if (!m || TECNICO.test(m)) return 'Não foi possível concluir a operação. Tente novamente; se continuar, avise o administrador.';
    return m.replace(/^ERROR:\s*/, '');
  }
  class ApiError extends Error {
    constructor(e) {
      super(friendly(e)); this.code = e && e.code; this.raw = e;
      this.sessao = this.message === MSG.PGRST301;
      if (e && friendly(e) !== (e.message || '')) console.warn('[Atos] detalhe técnico:', e);
    }
  }

  /** fetch com limite de tempo: nenhuma tela fica esperando para sempre */
  const TIMEOUT_MS = 30000;
  function fetchComLimite(input, init = {}) {
    if (init.signal || typeof AbortController === 'undefined') return fetch(input, init);
    const ctl = new AbortController();
    const arquivo = init.body && ((typeof Blob !== 'undefined' && init.body instanceof Blob) || (typeof FormData !== 'undefined' && init.body instanceof FormData));
    const t = setTimeout(() => ctl.abort(), arquivo ? 10 * TIMEOUT_MS : TIMEOUT_MS);   // envio de arquivo tem mais tempo
    return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
  }

  // ------------------------------------------------------------------
  // Supabase
  // ------------------------------------------------------------------
  function SupabaseBackend(cfg) {
    const sb = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'atos-auth' },
      global: { fetch: fetchComLimite },
    });
    const chk = ({ data, error, count }) => { if (error) throw new ApiError(error); return { data, count }; };

    function apply(q, o = {}) {
      for (const [c, v] of Object.entries(o.eq || {})) q = q.eq(c, v);
      for (const [c, v] of Object.entries(o.neq || {})) q = q.neq(c, v);
      for (const [c, v] of Object.entries(o.in || {})) q = q.in(c, v);
      for (const [c, v] of Object.entries(o.gte || {})) q = q.gte(c, v);
      for (const [c, v] of Object.entries(o.lte || {})) q = q.lte(c, v);
      for (const [c, v] of Object.entries(o.gt || {})) q = q.gt(c, v);
      for (const [c, v] of Object.entries(o.lt || {})) q = q.lt(c, v);
      for (const c of o.isNull || []) q = q.is(c, null);
      for (const c of o.notNull || []) q = q.not(c, 'is', null);
      for (const [c, v] of Object.entries(o.ilike || {})) q = q.ilike(c, v);
      if (o.or && o.or.length) q = q.or(o.or.map(([c, op, v]) => op === 'is' ? `${c}.is.null` : `${c}.${op}.${Array.isArray(v) ? '(' + v.join(',') + ')' : v}`).join(','));
      if (o.search && o.search.term) {
        const t = o.search.term.replace(/[,()%]/g, ' ').trim();
        if (t) q = q.or(o.search.cols.map(c => `${c}.ilike.%${t}%`).join(','));
      }
      for (const [c, asc] of o.order || []) q = q.order(c, { ascending: !!asc, nullsFirst: false });
      if (o.limit) q = q.range(o.offset || 0, (o.offset || 0) + o.limit - 1);
      return q;
    }

    return {
      mode: 'supabase',
      client: sb,
      async session() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user.id : null; },
      onAuth(fn) { sb.auth.onAuthStateChange((ev, s) => fn(ev, s && s.user ? s.user.id : null)); },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new ApiError(error);
        // o registro do acesso é auditoria: se falhar, o login continua
        try { await sb.rpc('registrar_login'); } catch (e) { console.warn('[Atos] registrar_login', e); }
      },
      async signUp(email, password, nome) { const { error } = await sb.auth.signUp({ email, password, options: { data: { nome } } }); if (error) throw new ApiError(error); },
      async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw new ApiError(error); },
      async updatePassword(pw) { const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw new ApiError(error); },
      async signOut() { await sb.auth.signOut(); },
      async list(view, o = {}) {
        const r = chk(await apply(sb.from(view).select(o.select || '*', o.count ? { count: 'exact' } : undefined), o));
        return { rows: r.data || [], count: r.count ?? (r.data || []).length };
      },
      async all(view, o = {}) {
        const out = []; const page = 1000;
        for (let off = 0; ; off += page) {
          const { rows } = await this.list(view, { ...o, limit: page, offset: off });
          out.push(...rows);
          if (rows.length < page) break;
        }
        return out;
      },
      async get(view, id) { const r = chk(await sb.from(view).select('*').eq('id', id).maybeSingle()); return r.data; },
      async insert(table, row) { const r = chk(await sb.from(table).insert(row).select().single()); return r.data; },
      async insertMany(table, rows) { const r = chk(await sb.from(table).insert(rows).select()); return r.data; },
      async update(table, id, patch, key = 'id') {
        const r = chk(await sb.from(table).update(patch).eq(key, id).select());
        if (!r.data || !r.data.length) throw new ApiError({ message: MSG.PGRST116 });
        return r.data[0];
      },
      async upsert(table, row, onConflict) { const r = chk(await sb.from(table).upsert(row, { onConflict }).select()); return r.data; },
      async remove(table, id, key = 'id') { chk(await sb.from(table).delete().eq(key, id)); },
      async removeWhere(table, match) { let q = sb.from(table).delete(); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); chk(await q); },
      async softDelete(table, id) { return this.update(table, id, { deleted_at: new Date().toISOString() }); },
      async rpc(fn, params = {}) { const r = chk(await sb.rpc(fn, params)); return r.data; },
      async upload(path, file) {
        if (file && file.size > 20 * 1024 * 1024) throw new ApiError({ message: 'O arquivo tem mais de 20 MB. Reduza o tamanho e envie novamente.' });
        const { error } = await sb.storage.from('documentos').upload(path, file, { upsert: false }); if (error) throw new ApiError(error); return path;
      },
      subscribe(uid, fn) {
        try {
          const ch = sb.channel('atos-notif-' + uid)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'usuario_id=eq.' + uid }, p => fn(p.new))
            .subscribe();
          return () => { try { sb.removeChannel(ch); } catch (e) { /* */ } };
        } catch (e) { console.warn('[Atos] tempo real indisponível', e); return () => {}; }
      },
      async fileUrl(path) { const { data, error } = await sb.storage.from('documentos').createSignedUrl(path, 120); if (error) throw new ApiError(error); return data.signedUrl; },
    };
  }

  // ------------------------------------------------------------------
  // Seleção do motor
  // ------------------------------------------------------------------
  const cfg = global.ATOS_CONFIG || {};
  // guarda o link de convite/recuperação antes que o Supabase limpe a URL
  try { global.ATOS_LINK_SENHA = /type=(invite|recovery)/.test(location.hash) ? RegExp.$1 : null; } catch (e) { global.ATOS_LINK_SENHA = null; }
  let backend;
  const hasSupabase = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !global.ATOS_FORCE_DEMO && cfg.MODO !== 'demo';
  if (hasSupabase) {
    if (!global.supabase || !global.supabase.createClient) {
      // Configurado para produção, mas a biblioteca não carregou: NÃO cai na demonstração
      const aviso = () => { document.getElementById('app').innerHTML = '<div class="boot"><div class="login-card" style="text-align:center"><h2>Não foi possível carregar a conexão com o banco</h2><p class="muted">O arquivo js/vendor/supabase.js não foi encontrado. Publique a pasta web completa no Netlify e recarregue a página.</p></div></div>'; };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aviso); else aviso();
      throw new Error('Biblioteca do Supabase não carregada');
    }
    backend = SupabaseBackend(cfg);
  } else backend = global.DemoBackend.create();
  console.info('[Atos] modo:', backend.mode, hasSupabase ? cfg.SUPABASE_URL : '(sem config.js preenchido)');

  global.API = backend;
  global.ApiError = ApiError;
  global.apiFriendly = friendly;
})(window);
