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
    '23505': 'Registro duplicado.',
    '23503': 'Este registro está vinculado a outros dados.',
    'PGRST116': 'Registro não encontrado ou sem permissão de acesso.',
  };
  function friendly(err) {
    if (!err) return 'Erro desconhecido';
    const m = err.message || String(err);
    if (/row-level security/i.test(m)) return MSG['42501'];
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    if (err.code && MSG[err.code] && !/[áéíóúãç]/i.test(m)) return MSG[err.code];
    return m.replace(/^ERROR:\s*/, '');
  }
  class ApiError extends Error { constructor(e) { super(friendly(e)); this.code = e && e.code; this.raw = e; } }

  // ------------------------------------------------------------------
  // Supabase
  // ------------------------------------------------------------------
  function SupabaseBackend(cfg) {
    const sb = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'atos-auth' },
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
      async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new ApiError(error); await sb.rpc('registrar_login'); },
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
      async upload(path, file) { const { error } = await sb.storage.from('documentos').upload(path, file, { upsert: false }); if (error) throw new ApiError(error); return path; },
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
      document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('app').innerHTML = '<div class="boot"><div class="login-card" style="text-align:center"><h2>Não foi possível carregar a conexão com o banco</h2><p class="muted">O arquivo js/vendor/supabase.js não foi encontrado. Publique a pasta web completa no Netlify.</p></div></div>';
      });
      throw new Error('Biblioteca do Supabase não carregada');
    }
    backend = SupabaseBackend(cfg);
  } else backend = global.DemoBackend.create();
  console.info('[Atos] modo:', backend.mode, hasSupabase ? cfg.SUPABASE_URL : '(sem config.js preenchido)');

  global.API = backend;
  global.ApiError = ApiError;
  global.apiFriendly = friendly;
})(window);
