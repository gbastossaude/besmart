-- ============================================================
--  0003 — Registro de erros do aplicativo e CNPJ alfanumérico
--  Incremental e idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. erros_app: o navegador registra aqui erros técnicos (no máximo 20 por
--    sessão). Serve para o gestor — ou quem der manutenção — saber o que
--    quebrou, em que tela, para quem e em que versão, sem depender de o
--    usuário saber explicar. Não guarda dado de cliente.
-- ------------------------------------------------------------
create table if not exists public.erros_app (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  quem      uuid default auth.uid(),
  pagina    text,
  operacao  text,
  mensagem  text,
  pilha     text,
  versao    text,
  agente    text
);
create index if not exists erros_app_quando_idx on public.erros_app (quando desc);
alter table public.erros_app enable row level security;
-- limites de tamanho: um bug em laço não enche o banco
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'erros_app_tamanhos') then
    alter table public.erros_app add constraint erros_app_tamanhos check (
      length(coalesce(mensagem,'')) <= 1000 and length(coalesce(pilha,'')) <= 4000 and
      length(coalesce(pagina,'')) <= 100 and length(coalesce(operacao,'')) <= 200 and
      length(coalesce(versao,'')) <= 40 and length(coalesce(agente,'')) <= 300);
  end if;
end $$;
drop policy if exists erros_app_ins on public.erros_app;
create policy erros_app_ins on public.erros_app for insert to authenticated
  with check (quem = (select auth.uid()));
drop policy if exists erros_app_sel on public.erros_app;
create policy erros_app_sel on public.erros_app for select to authenticated
  using ((select public.sou_gestor()));
revoke update, delete, truncate on public.erros_app from anon, authenticated;
revoke all on public.erros_app from anon;

-- Limpeza: erro técnico com mais de 180 dias não ajuda mais ninguém.
-- (Rodar à mão ou agendar com pg_cron: select public.limpar_erros_antigos();)
create or replace function public.limpar_erros_antigos()
returns integer language sql security definer set search_path = public as $$
  with x as (delete from public.erros_app where quando < now() - interval '180 days' returning 1)
  select count(*)::int from x
$$;
revoke all on function public.limpar_erros_antigos() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Cliente único na corretora inteira
--    A RLS impede o corretor de ver o cliente do colega — e por isso a trava de
--    CPF/CNPJ duplicado feita na tela não enxergava duplicidade entre carteiras.
--    cliente_por_documento() responde só o necessário: se o documento existe, de
--    quem é e (se quem pergunta pode ver) o id e o nome do cadastro.
--    A comparação usa letras e números: desde julho/2026 o CNPJ pode ser
--    alfanumérico (12.ABC.345/01DE-35).
-- ------------------------------------------------------------
create or replace function public.doc_normalizado(v text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(v,''), '[^0-9A-Za-z]', '', 'g'))
$$;
create index if not exists clientes_doc_norm_idx on public.clientes (public.doc_normalizado(dados->>'doc'));

create or replace function public.cliente_por_documento(doc text, exceto text default null)
returns table (id text, nome text, responsavel text, visivel boolean)
language sql stable security definer set search_path = public as $$
  select case when v then c.id end,
         case when v then c.dados->>'nome' end,
         coalesce((select p.nome from public.perfis p where p.id = c.dono), 'outro membro da equipe'),
         v
    from public.clientes c
    cross join lateral (select (public.vejo_tudo() or c.dono = auth.uid()) as v) vis
   where public.sou_ativo()
     and length(public.doc_normalizado(doc)) >= 11
     and public.doc_normalizado(c.dados->>'doc') = public.doc_normalizado(doc)
     and (exceto is null or c.id <> exceto)
   limit 1
$$;
revoke all on function public.cliente_por_documento(text, text) from public, anon;
grant execute on function public.cliente_por_documento(text, text) to authenticated;
