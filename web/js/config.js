/* =====================================================================
   ATOS SISTEMA — config.js
   Dados do projeto Supabase (Settings → API).
   A chave publishable/anon é pública por natureza: a segurança está nas
   políticas RLS do banco. NUNCA coloque a service_role/secret aqui.
   Sem URL/chave, o sistema abre em MODO DEMONSTRAÇÃO.
   ===================================================================== */
window.ATOS_CONFIG = {
  SUPABASE_URL: 'https://salzvxccocxvudxriuou.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_C6KAdF0GCW13IERqNtKFVw_M-OZRs9Q',   // chave publishable (pública)
  MODO: 'auto',            // 'auto' = Supabase se configurado | 'demo' = força demonstração
};
