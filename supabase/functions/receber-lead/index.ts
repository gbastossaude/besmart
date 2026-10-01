// =====================================================================
//  ATOS SISTEMA — Edge Function "receber-lead"
//  Recebe leads de site, landing pages, Meta Leads, Google Ads, etc.
//  Segurança: header "x-atos-token" igual ao segredo ATOS_WEBHOOK_TOKEN
//  (defina em Edge Functions → Secrets). A chave de serviço nunca sai daqui.
//  POST JSON: { nome, whatsapp, email, num_vidas, uf, origem, campanha, ... }
//  Query opcional: ?provedor=site|meta|google  &distribuir=false
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-atos-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const segredo = Deno.env.get('ATOS_WEBHOOK_TOKEN');
  if (!segredo || req.headers.get('x-atos-token') !== segredo) return json({ error: 'Token inválido' }, 401);

  let payload: Record<string, unknown>;
  const ct = req.headers.get('content-type') || '';
  try {
    payload = ct.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(await req.text())) : await req.json();
  } catch { return json({ error: 'Corpo inválido' }, 400); }

  const q = new URL(req.url).searchParams;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('receber_lead_externo', {
    p_provedor: q.get('provedor') || String(payload.provedor || 'site'),
    p_payload: payload,
    p_distribuir: q.get('distribuir') !== 'false',
  });
  if (error) return json({ error: error.message }, 400);
  // a notificação "novo lead" para supervisor/gerente e o SLA são disparados pelo banco
  return json({ ok: true, lead_id: data });
});
