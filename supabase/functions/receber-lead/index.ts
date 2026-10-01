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
const LIMITE_BYTES = 64 * 1024;   // um lead nunca passa disso; evita abuso

/** comparação em tempo constante (não revela o token por diferença de tempo) */
function mesmoToken(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const segredo = Deno.env.get('ATOS_WEBHOOK_TOKEN');
  if (!segredo || !mesmoToken(req.headers.get('x-atos-token') || '', segredo)) return json({ error: 'Token inválido' }, 401);

  let payload: Record<string, unknown>;
  const ct = req.headers.get('content-type') || '';
  try {
    const texto = await req.text();
    if (texto.length > LIMITE_BYTES) return json({ error: 'Corpo grande demais' }, 413);
    payload = ct.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(texto)) : JSON.parse(texto);
  } catch { return json({ error: 'Corpo inválido' }, 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'Envie um objeto JSON com os dados do lead' }, 400);

  const q = new URL(req.url).searchParams;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('receber_lead_externo', {
    p_provedor: q.get('provedor') || String(payload.provedor || 'site'),
    p_payload: payload,
    p_distribuir: q.get('distribuir') !== 'false',
  });
  if (error) {
    // detalhe técnico só no log da função; quem envia recebe uma mensagem simples
    console.error('receber_lead_externo', error);
    const msg = /[áéíóúãç]/i.test(error.message) && !/violates|constraint|column|relation/i.test(error.message) ? error.message : 'Não foi possível registrar o lead. Confira os campos enviados.';
    return json({ error: msg }, 400);
  }
  // a notificação "novo lead" para supervisor/gerente e o SLA são disparados pelo banco
  return json({ ok: true, lead_id: data });
});
