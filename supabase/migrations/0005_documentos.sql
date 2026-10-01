-- ============================================================
--  0005 — Documentos de clientes (Supabase Storage)
--  Incremental e idempotente.
--
--  Arquivos (RG, CNH, comprovantes, propostas, apólices, boletos) ficam no
--  bucket PRIVADO "documentos", no caminho clientes/<id do cliente>/<arquivo>.
--  Quem enxerga o cliente enxerga os documentos dele — a mesma regra da
--  carteira, aplicada no banco e no Storage. Nada é público: a tela abre cada
--  arquivo por um link temporário (60 segundos).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Quem pode ver (e portanto anexar documento a) um cliente: a regra da carteira.
create or replace function public.posso_ver_cliente(cliente text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.sou_ativo() and (public.vejo_tudo()
         or exists (select 1 from public.clientes c where c.id = cliente and c.dono = auth.uid()))
$$;
revoke all on function public.posso_ver_cliente(text) from public, anon;
grant execute on function public.posso_ver_cliente(text) to authenticated;

create table if not exists public.documentos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   text not null,
  contrato_id  text,
  nome         text not null check (length(nome) between 1 and 200),
  categoria    text not null default 'Outro',
  caminho      text not null unique,
  tipo_mime    text,
  tamanho      bigint check (tamanho is null or tamanho between 0 and 20971520),
  enviado_por  uuid default auth.uid(),
  enviado_em   timestamptz not null default now(),
  constraint documentos_caminho_do_cliente check (caminho like 'clientes/' || cliente_id || '/%')
);
comment on table public.documentos is
  'Metadados dos arquivos do bucket privado "documentos". Sem chave estrangeira para clientes de propósito: se o cliente for excluído e depois restaurado pela lixeira, os documentos voltam junto.';
create index if not exists documentos_cliente_idx on public.documentos (cliente_id, enviado_em desc);
alter table public.documentos enable row level security;

drop policy if exists documentos_sel on public.documentos;
create policy documentos_sel on public.documentos for select to authenticated
  using ((select public.posso_ver_cliente(cliente_id)));
drop policy if exists documentos_ins on public.documentos;
create policy documentos_ins on public.documentos for insert to authenticated
  with check (enviado_por = (select auth.uid()) and (select public.posso_ver_cliente(cliente_id)));
drop policy if exists documentos_del on public.documentos;
create policy documentos_del on public.documentos for delete to authenticated
  using ((select public.sou_gestor()) or (enviado_por = (select auth.uid()) and (select public.posso_ver_cliente(cliente_id))));
revoke update, truncate on public.documentos from anon, authenticated;
revoke all on public.documentos from anon;

-- Storage: as mesmas regras, olhando o id do cliente no caminho do arquivo.
drop policy if exists erbe_documentos_sel on storage.objects;
create policy erbe_documentos_sel on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = 'clientes'
         and public.posso_ver_cliente((storage.foldername(name))[2]));
drop policy if exists erbe_documentos_ins on storage.objects;
create policy erbe_documentos_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = 'clientes'
              and public.posso_ver_cliente((storage.foldername(name))[2]));
drop policy if exists erbe_documentos_del on storage.objects;
create policy erbe_documentos_del on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (public.sou_gestor()
         or (owner = auth.uid() and public.posso_ver_cliente((storage.foldername(name))[2]))));

-- A auditoria passa a registrar documentos (quem anexou e quem excluiu o quê).
create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hdr jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  origem text := coalesce(hdr->>'x-erbe-origem', case when auth.uid() is null then 'sql/servidor' else 'api' end);
  mud jsonb; antes jsonb; depois jsonb; rid text;
begin
  if tg_table_name in ('perfis','documentos') then
    antes  := case when tg_op <> 'INSERT' then to_jsonb(old) - 'criado_em' end;
    depois := case when tg_op <> 'DELETE' then to_jsonb(new) - 'criado_em' end;
  elsif tg_table_name = 'config' then
    antes := case when tg_op <> 'INSERT' then old.dados end;
    depois := case when tg_op <> 'DELETE' then new.dados end;
  else
    antes := case when tg_op <> 'INSERT' then old.dados || jsonb_build_object('_dono', old.dono) end;
    depois := case when tg_op <> 'DELETE' then new.dados || jsonb_build_object('_dono', new.dono) end;
  end if;
  rid := case when tg_op = 'DELETE' then old.id::text else new.id::text end;

  if tg_op = 'UPDATE' then
    mud := public._diferenca(antes, depois);
    if mud = '{}'::jsonb then return null; end if;
    insert into public.auditoria (quem, tabela, registro_id, acao, mudancas, origem)
    values (auth.uid(), tg_table_name, rid, 'UPDATE', mud, origem);
  elsif tg_op = 'INSERT' then
    insert into public.auditoria (quem, tabela, registro_id, acao, mudancas, origem)
    values (auth.uid(), tg_table_name, rid, 'INSERT',
            case when tg_table_name = 'documentos' then jsonb_build_object('nome', jsonb_build_object('de', null, 'para', depois->'nome')) end, origem);
  else
    insert into public.auditoria (quem, tabela, registro_id, acao, registro, origem)
    values (auth.uid(), tg_table_name, rid, 'DELETE', antes, origem);
  end if;
  return null;
end $$;
revoke all on function public.auditar() from public, anon, authenticated;
drop trigger if exists trg_auditar_documentos on public.documentos;
create trigger trg_auditar_documentos after insert or delete on public.documentos
  for each row execute function public.auditar();

do $$ begin
  begin
    alter publication supabase_realtime add table public.documentos;
  exception when duplicate_object then null;
  end;
end $$;
