-- =====================================================================
--  ATOS SISTEMA — 07_supabase_storage_cron.sql
--  Recursos específicos do Supabase: busca rápida, permissões do Auth,
--  bucket de documentos, notificações em tempo real e rotinas agendadas.
--  Execute DEPOIS do atos_completo.sql. Pode ser executado novamente.
-- =====================================================================

-- Busca rápida por nome (trigram)
-- (funciona com o pg_trgm instalado no schema "extensions" ou no "public")
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists leads_nome_trgm    on public.leads   using gin (nome %I.gin_trgm_ops)', s);
  execute format('create index if not exists leads_empresa_trgm on public.leads   using gin (empresa %I.gin_trgm_ops)', s);
  execute format('create index if not exists clients_nome_trgm  on public.clients using gin (nome %I.gin_trgm_ops)', s);
exception when others then
  raise notice 'Índices de busca rápida não criados (%). O sistema funciona normalmente sem eles.', sqlerrm;
end $$;

-- O serviço de autenticação precisa executar o gatilho que cria o perfil
grant usage on schema private to supabase_auth_admin;
grant execute on function private.tg_novo_usuario() to supabase_auth_admin;
grant execute on function private.setting(text, jsonb) to supabase_auth_admin;
grant select on public.settings to supabase_auth_admin;

-- Funções chamadas pelas Edge Functions / rotinas
grant execute on function public.receber_lead_externo(text, jsonb, boolean) to service_role;
grant execute on function public.processar_alertas() to service_role;
grant execute on function public.processar_alertas_rapidos() to service_role;

-- ---------------------------------------------------------------------
-- Storage: bucket privado "documentos" (20 MB por arquivo)
-- Caminho: <tipo>/<id do registro>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists atos_docs_upload on storage.objects;
create policy atos_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos');

drop policy if exists atos_docs_read on storage.objects;
create policy atos_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name));

drop policy if exists atos_docs_delete on storage.objects;
create policy atos_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (owner = auth.uid() or (select private.papel()) = 'admin'));

-- ---------------------------------------------------------------------
-- Tempo real: notificações chegam na hora (sem recarregar a página)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Rotinas agendadas (pg_cron)
--   atos_alertas : a cada 15 min — leads parados, redistribuição, metas
--   atos_rapidos : a cada minuto — SLA atrasado, lembretes da agenda e follow-ups
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('atos_alertas', 'atos_rapidos');
  perform cron.schedule('atos_alertas', '*/15 * * * *', 'select public.processar_alertas()');
  perform cron.schedule('atos_rapidos', '* * * * *',    'select public.processar_alertas_rapidos()');
end $$;
