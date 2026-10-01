// =====================================================================
//  ATOS SISTEMA — Edge Function "convidar-usuario"
//  Convida um usuário por e-mail (somente administradores).
//  A chave de serviço fica SOMENTE aqui, no servidor (variável de ambiente
//  SUPABASE_SERVICE_ROLE_KEY, que o Supabase já injeta automaticamente).
//  Corpo: { nome, email, papel, team_id?, gerente_id?, grade_comissao? }
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const auth = req.headers.get('Authorization') || '';

  // 1) quem está chamando precisa ser administrador ativo
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: 'Faça login novamente' }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: me } = await admin.from('profiles').select('papel,status').eq('id', u.user.id).maybeSingle();
  if (!me || me.papel !== 'admin' || me.status !== 'ativo') return json({ error: 'Somente o administrador convida usuários' }, 403);

  // 2) validação
  let b: Record<string, string | null>;
  try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.nome || '').trim();
  const papel = String(b.papel || 'corretor');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !nome) return json({ error: 'Informe nome e e-mail válidos' }, 400);
  if (!['admin', 'gerente', 'supervisor', 'corretor'].includes(papel)) return json({ error: 'Papel inválido' }, 400);

  // 3) convite (a pessoa recebe o e-mail para criar a senha)
  const redirectTo = req.headers.get('origin') || undefined;
  const { data: inv, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo });
  if (error) return json({ error: error.message.includes('already') ? 'Este e-mail já tem cadastro' : error.message }, 400);

  // 4) perfil já aprovado com papel, equipe e grade de comissão
  const patch: Record<string, unknown> = { nome, papel, status: 'ativo' };
  if (papel === 'corretor') { patch.team_id = b.team_id || null; patch.grade_comissao = b.grade_comissao || 'bronze'; }
  if (papel === 'supervisor') patch.gerente_id = b.gerente_id || null;
  const { error: e2 } = await admin.from('profiles').update(patch).eq('id', inv.user!.id);
  if (e2) return json({ ok: true, aviso: 'Convite enviado, mas ajuste o perfil em Configurações: ' + e2.message });
  return json({ ok: true, id: inv.user!.id });
});
