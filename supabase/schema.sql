-- ============================================================
--  Erbe · Central — esquema completo do banco (GERADO, não edite à mão)
--  Fonte: supabase/migrations/*.sql · gerado por scripts/build-schema.mjs
--  Supabase → SQL Editor → cole este arquivo inteiro → Run.
--  Pode rodar mais de uma vez: não apaga nem duplica nada.
-- ============================================================

-- >>>>>>>>>> 0001_base.sql
-- ============================================================
--  Erbe · Central — esquema do banco (Supabase / PostgreSQL)
--
--  Cole este arquivo inteiro no SQL Editor do Supabase e execute.
--  Pode rodar mais de uma vez: tudo é "if not exists" / "or replace".
--
--  A CONTA MASTER é definida pelo e-mail abaixo. Quem entrar com ele
--  vira gestor automaticamente. Qualquer outra pessoa entra como
--  PENDENTE e não enxerga nada até o master liberar.
-- ============================================================

-- Troque aqui se um dia o e-mail do master mudar.
create or replace function public.email_master()
returns text language sql immutable as $$
  select 'gbastossaude@gmail.com'::text
$$;

-- ------------------------------------------------------------
-- 1. Perfis — uma linha por pessoa que acessa o sistema
-- ------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users on delete cascade,
  nome        text,
  email       text,
  papel       text not null default 'corretor'
              check (papel in ('gestor','corretor','assistente')),
  status      text not null default 'pendente'
              check (status in ('pendente','ativo','bloqueado')),
  ver_tudo    boolean not null default false,
  meta        numeric not null default 0,
  split_pct   numeric not null default 50,
  criado_em   timestamptz not null default now()
);

comment on table public.perfis is
  'Papel e situação de acesso de cada pessoa. status=pendente não vê dado nenhum.';

-- ------------------------------------------------------------
-- 2. Funções de apoio às políticas
--    security definer para poderem ler perfis sem cair na própria RLS
-- ------------------------------------------------------------
create or replace function public.sou_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'ativo' from public.perfis where id = auth.uid()), false)
$$;

create or replace function public.sou_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'gestor' and status = 'ativo'
                   from public.perfis where id = auth.uid()), false)
$$;

-- Quem enxerga a carteira inteira: gestor, assistente, e corretor liberado
create or replace function public.vejo_tudo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'ativo'
                     and (papel in ('gestor','assistente') or ver_tudo)
                   from public.perfis where id = auth.uid()), false)
$$;

-- ------------------------------------------------------------
-- 3. Cadastro automático ao criar a conta
--    O e-mail master entra como gestor ativo; o resto, pendente.
-- ------------------------------------------------------------
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Só o e-mail master nasce gestor. Antes, "o primeiro a se cadastrar" também
  -- virava gestor: se alguém se cadastrasse antes do master, ficava com a chave.
  eh_master boolean := lower(new.email) = lower(public.email_master());
begin
  insert into public.perfis (id, nome, email, papel, status, ver_tudo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    new.email,
    case when eh_master then 'gestor' else 'corretor' end,
    case when eh_master then 'ativo'  else 'pendente' end,
    eh_master
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_ao_criar_usuario on auth.users;
create trigger trg_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- Rede de segurança: se o master já existia antes deste script, promove.
update public.perfis
   set papel = 'gestor', status = 'ativo', ver_tudo = true
 where lower(email) = lower(public.email_master());

-- ------------------------------------------------------------
-- 4. Tabelas de dados
--    Cada registro guarda o objeto inteiro em `dados` (jsonb) — é o
--    mesmo formato que a tela já usa — e repete em colunas só o que a
--    segurança precisa enxergar: quem é o dono.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads','clientes','contratos','vidas','tarefas','despesas'] loop
    execute format($f$
      create table if not exists public.%I (
        id              text primary key,
        dono            uuid not null default auth.uid() references auth.users on delete cascade,
        dados           jsonb not null default '{}'::jsonb,
        atualizado_em   timestamptz not null default now(),
        atualizado_por  uuid default auth.uid()
      );
      create index if not exists %I on public.%I (dono);
    $f$, t, t||'_dono_idx', t);
  end loop;
end $$;

-- Configuração da corretora: uma linha só, compartilhada
create table if not exists public.config (
  id            text primary key default 'app',
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.config (id, dados) values ('app','{}'::jsonb)
  on conflict (id) do nothing;

-- Vidas: uma linha por pessoa coberta. O acesso segue o contrato dela.
comment on table public.vidas is
  'Pessoas cobertas por um contrato. dados->>contratoId liga a vida ao contrato; dono repete o corretor do contrato para a RLS resolver sem join.';
create index if not exists vidas_contrato_idx on public.vidas ((dados->>'contratoId'));
create index if not exists vidas_cliente_idx  on public.vidas ((dados->>'clienteId'));
create index if not exists vidas_status_idx   on public.vidas ((dados->>'status'));

-- Índices que a carteira grande pede: buscar contrato por cliente sem varrer a tabela
create index if not exists contratos_cliente_idx on public.contratos ((dados->>'clienteId'));
create index if not exists clientes_doc_idx      on public.clientes  ((dados->>'doc'));

-- Trilha de atividade
create table if not exists public.atividade (
  id        text primary key,
  quem      uuid default auth.uid() references auth.users on delete set null,
  quando    timestamptz not null default now(),
  dados     jsonb not null default '{}'::jsonb
);
create index if not exists atividade_quando_idx on public.atividade (quando desc);
comment on table public.atividade is
  'Histórico completo: quem alterou, quando, e o que mudou (dados->mudancas traz valor anterior e novo). Nada é apagado por idade — é a trilha de auditoria da corretora.';

-- ------------------------------------------------------------
-- 5. Row Level Security — aqui a permissão passa a ser de verdade
-- ------------------------------------------------------------
alter table public.perfis    enable row level security;
alter table public.leads     enable row level security;
alter table public.clientes  enable row level security;
alter table public.contratos enable row level security;
alter table public.vidas     enable row level security;
alter table public.tarefas   enable row level security;
alter table public.despesas  enable row level security;
alter table public.config    enable row level security;
alter table public.atividade enable row level security;

-- Perfis: cada um lê o próprio; quem vê tudo lê a equipe; só gestor altera os outros
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select
  using (id = auth.uid() or public.vejo_tudo());

drop policy if exists perfis_meu_update on public.perfis;
create policy perfis_meu_update on public.perfis for update
  using (id = auth.uid()) with check (id = auth.uid());

-- A política acima deixa cada pessoa atualizar a PRÓPRIA linha — o que, sozinho,
-- permitia a um corretor pendente se promover a gestor pela chave pública.
-- Esta trava garante que só o gestor mexe em papel, situação, alcance, meta e split.
-- (auth.uid() nulo = comando rodado no SQL Editor pelo dono do projeto: liberado.)
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.sou_gestor() then
    if new.papel     is distinct from old.papel
    or new.status    is distinct from old.status
    or new.ver_tudo  is distinct from old.ver_tudo
    or new.meta      is distinct from old.meta
    or new.split_pct is distinct from old.split_pct
    or new.email     is distinct from old.email
    or new.id        is distinct from old.id then
      raise exception 'Somente o gestor altera papel, situação, alcance, meta ou split.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_perfil on public.perfis;
create trigger trg_proteger_perfil before update on public.perfis
  for each row execute function public.proteger_perfil();

drop policy if exists perfis_gestor_update on public.perfis;
create policy perfis_gestor_update on public.perfis for update
  using (public.sou_gestor()) with check (public.sou_gestor());

drop policy if exists perfis_gestor_insert on public.perfis;
create policy perfis_gestor_insert on public.perfis for insert
  with check (public.sou_gestor());

drop policy if exists perfis_gestor_delete on public.perfis;
create policy perfis_gestor_delete on public.perfis for delete
  using (public.sou_gestor());

-- Dados da operação: quem vê tudo alcança a carteira inteira;
-- corretor alcança apenas o que é dele.
do $$
declare t text;
begin
  foreach t in array array['leads','clientes','contratos','tarefas'] loop
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format($f$create policy %I on public.%I for select
      using (public.sou_ativo() and (public.vejo_tudo() or dono = auth.uid()))$f$, t||'_sel', t);

    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format($f$create policy %I on public.%I for insert
      with check (public.sou_ativo() and (public.vejo_tudo() or dono = auth.uid()))$f$, t||'_ins', t);

    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format($f$create policy %I on public.%I for update
      using (public.sou_ativo() and (public.vejo_tudo() or dono = auth.uid()))
      with check (public.sou_ativo() and (public.vejo_tudo() or dono = auth.uid()))$f$, t||'_upd', t);

    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format($f$create policy %I on public.%I for delete
      using (public.sou_ativo() and (public.vejo_tudo() or dono = auth.uid()))$f$, t||'_del', t);
  end loop;
end $$;

-- Vidas: quem enxerga o contrato enxerga quem está nele — e só isso.
-- A regra consulta o contrato em vez do dono gravado na vida: se o contrato
-- mudar de corretor, as vidas vão junto, sem ficar com o antigo.
-- (A consulta a contratos já passa pela RLS de contratos.)
drop policy if exists vidas_sel on public.vidas;
create policy vidas_sel on public.vidas for select
  using (public.sou_ativo() and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));
drop policy if exists vidas_ins on public.vidas;
create policy vidas_ins on public.vidas for insert
  with check (public.sou_ativo() and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));
drop policy if exists vidas_upd on public.vidas;
create policy vidas_upd on public.vidas for update
  using (public.sou_ativo() and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'))
  with check (public.sou_ativo() and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));
drop policy if exists vidas_del on public.vidas;
create policy vidas_del on public.vidas for delete
  using (public.sou_ativo() and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));

-- Contrato apagado leva junto as vidas dele: CPF e nascimento não ficam órfãos no banco.
create or replace function public.apagar_vidas_do_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.vidas where dados->>'contratoId' = old.id;
  return old;
end $$;
drop trigger if exists trg_apagar_vidas on public.contratos;
create trigger trg_apagar_vidas after delete on public.contratos
  for each row execute function public.apagar_vidas_do_contrato();

-- Despesas são da corretora: só gestor
drop policy if exists despesas_sel on public.despesas;
create policy despesas_sel on public.despesas for select using (public.sou_gestor());
drop policy if exists despesas_ins on public.despesas;
create policy despesas_ins on public.despesas for insert with check (public.sou_gestor());
drop policy if exists despesas_upd on public.despesas;
create policy despesas_upd on public.despesas for update using (public.sou_gestor()) with check (public.sou_gestor());
drop policy if exists despesas_del on public.despesas;
create policy despesas_del on public.despesas for delete using (public.sou_gestor());

-- Config: todo mundo ativo lê, só gestor escreve
drop policy if exists config_sel on public.config;
create policy config_sel on public.config for select using (public.sou_ativo());
drop policy if exists config_upd on public.config;
create policy config_upd on public.config for update using (public.sou_gestor()) with check (public.sou_gestor());
drop policy if exists config_ins on public.config;
create policy config_ins on public.config for insert with check (public.sou_gestor());

-- Atividade: qualquer ativo registra o que fez; gestor lê tudo, os demais só o próprio
drop policy if exists atividade_sel on public.atividade;
create policy atividade_sel on public.atividade for select
  using (public.sou_gestor() or quem = auth.uid());
drop policy if exists atividade_ins on public.atividade;
create policy atividade_ins on public.atividade for insert
  with check (public.sou_ativo() and quem = auth.uid());
drop policy if exists atividade_del on public.atividade;
create policy atividade_del on public.atividade for delete using (public.sou_gestor());

-- ------------------------------------------------------------
-- 6. Tempo real — o que um digita aparece na tela do outro
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['perfis','leads','clientes','contratos','vidas','tarefas','despesas','config','atividade'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 7. Carimbo de atualização
-- ------------------------------------------------------------
create or replace function public.carimbar()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['leads','clientes','contratos','vidas','tarefas','despesas'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_carimbo_'||t, t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.carimbar()', 'trg_carimbo_'||t, t);
  end loop;
end $$;

-- >>>>>>>>>> 0002_seguranca_auditoria.sql
-- ============================================================
--  0002 — Segurança no banco, auditoria do servidor e desempenho da RLS
--
--  Incremental e idempotente: pode rodar mais de uma vez e não apaga nem
--  reescreve dado nenhum. Aplica depois de 0001_base.sql.
--
--  O que muda:
--   1. As regras que antes existiam só na tela passam a valer no banco:
--      - só o gestor exclui cliente e contrato;
--      - quem não vê o lado da corretora não altera split nem imposto do
--        contrato, não desfaz nem altera parcela já recebida e não "recebe"
--        valor diferente do previsto.
--   2. Apagar um usuário no painel do Supabase NÃO apaga mais a carteira dele
--      (antes: on delete cascade levava clientes, contratos, vidas...).
--      Use transferir_carteira() antes de remover alguém.
--   3. Trilha de auditoria gravada pelo próprio banco (tabela auditoria):
--      não depende do navegador, não pode ser apagada nem editada por ninguém
--      pela API, guarda o valor anterior e o novo e o registro inteiro quando
--      algo é excluído (dá para recuperar).
--   4. A tabela atividade passa a ser só de inclusão (ninguém apaga).
--   5. Políticas reescritas com (select ...) — o Postgres avalia a função uma
--      vez por consulta, não uma vez por linha. Muda muito com carteira grande.
--   6. Funções de apoio: transferir_carteira() e cliente_por_documento().
-- ============================================================

-- ------------------------------------------------------------
-- 1. Quem enxerga o lado da corretora (espelha veCorretora() da tela):
--    gestor, ou corretor que o gestor liberou em "Alcance".
-- ------------------------------------------------------------
create or replace function public.vejo_corretora()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'ativo' and (papel = 'gestor' or (papel = 'corretor' and ver_tudo))
                   from public.perfis where id = auth.uid()), false)
$$;

-- ------------------------------------------------------------
-- 2. Políticas com avaliação única por consulta + exclusão só pelo gestor
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads','clientes','contratos','tarefas'] loop
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format($f$create policy %I on public.%I for select to authenticated
      using ((select public.sou_ativo()) and ((select public.vejo_tudo()) or dono = (select auth.uid())))$f$, t||'_sel', t);

    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check ((select public.sou_ativo()) and ((select public.vejo_tudo()) or dono = (select auth.uid())))$f$, t||'_ins', t);

    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using ((select public.sou_ativo()) and ((select public.vejo_tudo()) or dono = (select auth.uid())))
      with check ((select public.sou_ativo()) and ((select public.vejo_tudo()) or dono = (select auth.uid())))$f$, t||'_upd', t);

    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    if t in ('clientes','contratos') then
      -- Excluir cliente ou contrato leva histórico e comissão conciliada: só o gestor.
      execute format($f$create policy %I on public.%I for delete to authenticated
        using ((select public.sou_gestor()))$f$, t||'_del', t);
    else
      execute format($f$create policy %I on public.%I for delete to authenticated
        using ((select public.sou_ativo()) and ((select public.vejo_tudo()) or dono = (select auth.uid())))$f$, t||'_del', t);
    end if;
  end loop;
end $$;

drop policy if exists vidas_sel on public.vidas;
create policy vidas_sel on public.vidas for select to authenticated
  using ((select public.sou_ativo()) and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));
drop policy if exists vidas_ins on public.vidas;
create policy vidas_ins on public.vidas for insert to authenticated
  with check ((select public.sou_ativo()) and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));
drop policy if exists vidas_upd on public.vidas;
create policy vidas_upd on public.vidas for update to authenticated
  using ((select public.sou_ativo()) and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'))
  with check ((select public.sou_ativo()) and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));
drop policy if exists vidas_del on public.vidas;
create policy vidas_del on public.vidas for delete to authenticated
  using ((select public.sou_ativo()) and exists (select 1 from public.contratos c where c.id = vidas.dados->>'contratoId'));

drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select public.vejo_tudo()));
drop policy if exists perfis_meu_update on public.perfis;
create policy perfis_meu_update on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists perfis_gestor_update on public.perfis;
create policy perfis_gestor_update on public.perfis for update to authenticated
  using ((select public.sou_gestor())) with check ((select public.sou_gestor()));
drop policy if exists perfis_gestor_insert on public.perfis;
create policy perfis_gestor_insert on public.perfis for insert to authenticated
  with check ((select public.sou_gestor()));
drop policy if exists perfis_gestor_delete on public.perfis;
create policy perfis_gestor_delete on public.perfis for delete to authenticated
  using ((select public.sou_gestor()));

drop policy if exists despesas_sel on public.despesas;
create policy despesas_sel on public.despesas for select to authenticated using ((select public.sou_gestor()));
drop policy if exists despesas_ins on public.despesas;
create policy despesas_ins on public.despesas for insert to authenticated with check ((select public.sou_gestor()));
drop policy if exists despesas_upd on public.despesas;
create policy despesas_upd on public.despesas for update to authenticated using ((select public.sou_gestor())) with check ((select public.sou_gestor()));
drop policy if exists despesas_del on public.despesas;
create policy despesas_del on public.despesas for delete to authenticated using ((select public.sou_gestor()));

drop policy if exists config_sel on public.config;
create policy config_sel on public.config for select to authenticated using ((select public.sou_ativo()));
drop policy if exists config_upd on public.config;
create policy config_upd on public.config for update to authenticated using ((select public.sou_gestor())) with check ((select public.sou_gestor()));
drop policy if exists config_ins on public.config;
create policy config_ins on public.config for insert to authenticated with check ((select public.sou_gestor()));

-- Atividade: só inclusão. Ninguém apaga nem edita o histórico pela API.
drop policy if exists atividade_sel on public.atividade;
create policy atividade_sel on public.atividade for select to authenticated
  using ((select public.sou_gestor()) or quem = (select auth.uid()));
drop policy if exists atividade_ins on public.atividade;
create policy atividade_ins on public.atividade for insert to authenticated
  with check ((select public.sou_ativo()) and quem = (select auth.uid()));
drop policy if exists atividade_del on public.atividade;
revoke update, delete, truncate on public.atividade from anon, authenticated;

-- Quem não tem sessão não tem por que tocar em tabela nenhuma.
revoke all on public.perfis, public.leads, public.clientes, public.contratos, public.vidas,
              public.tarefas, public.despesas, public.config, public.atividade from anon;

-- ------------------------------------------------------------
-- 3. Apagar um usuário não apaga mais a carteira dele
--    (troca on delete cascade por on delete restrict no "dono")
-- ------------------------------------------------------------
do $$
declare t text; c text;
begin
  foreach t in array array['leads','clientes','contratos','vidas','tarefas','despesas'] loop
    select con.conname into c
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
     where con.conrelid = format('public.%I', t)::regclass and con.contype = 'f' and a.attname = 'dono'
     limit 1;
    if c is not null then
      execute format('alter table public.%I drop constraint %I', t, c);
    end if;
    execute format('alter table public.%I add constraint %I foreign key (dono) references auth.users(id) on delete restrict',
                   t, t||'_dono_fkey');
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Contrato: regras financeiras valendo no banco
-- ------------------------------------------------------------
-- Chave de uma parcela para comparar versões: tipo, data, valor, recebido.
create or replace function public._parcela_chave(p jsonb, com_recebimento boolean)
returns text language sql immutable as $$
  select concat_ws('|',
    coalesce(nullif(p->>'tipo',''), 'agenciamento'),
    coalesce(left(p->>'vence', 10), ''),
    round(coalesce(nullif(p->>'valor','')::numeric, 0), 2)::text,
    case when com_recebimento then round(coalesce(nullif(p->>'valorRecebido','')::numeric, nullif(p->>'valor','')::numeric, 0), 2)::text end,
    case when com_recebimento then coalesce(left(p->>'recebidoEm', 10), '') end)
$$;

-- Lista de parcelas de um status, como "multiconjunto": cada chave ganha #1, #2...
create or replace function public._parcelas_marcadas(arr jsonb, so_recebidas boolean, com_recebimento boolean)
returns text[] language sql immutable as $$
  select coalesce(array_agg(k || '#' || n order by k, n), '{}')
    from (
      select k, row_number() over (partition by k) as n
        from (
          select public._parcela_chave(p, com_recebimento) as k
            from jsonb_array_elements(case when jsonb_typeof(arr) = 'array' then arr else '[]'::jsonb end) p
           where (p->>'status' = 'recebido') = so_recebidas
        ) x
    ) y
$$;

create or replace function public.proteger_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  split_dono numeric;
  rec_antes text[]; rec_depois text[]; novas text[]; prev_antes text[];
  k text; base text;
begin
  -- SQL Editor / service role (sem usuário) e quem vê o lado da corretora: livre.
  if auth.uid() is null or public.vejo_corretora() then
    return new;
  end if;

  -- Split e imposto: só o gestor define. O valor é imposto pelo banco.
  select split_pct into split_dono from public.perfis where id = new.dono;
  if tg_op = 'INSERT' then
    -- upsert de contrato que já existe: o PostgreSQL dispara o BEFORE INSERT com a
    -- linha proposta e, havendo conflito, o BEFORE UPDATE. Quem confere é o UPDATE.
    if exists (select 1 from public.contratos where id = new.id) then
      return new;
    end if;
    new.dados := jsonb_set(new.dados - 'impostoPct', '{splitPct}', to_jsonb(coalesce(split_dono, 0)));
    if exists (select 1 from jsonb_array_elements(coalesce(new.dados->'comissoes','[]'::jsonb)) p
                where p->>'status' = 'recebido') then
      raise exception 'Somente o gestor registra contrato com parcela já recebida.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.dados ? 'splitPct' then
    new.dados := jsonb_set(new.dados, '{splitPct}', old.dados->'splitPct');
  else
    new.dados := jsonb_set(new.dados, '{splitPct}', to_jsonb(coalesce(split_dono, 0)));
  end if;
  if old.dados ? 'impostoPct' then
    new.dados := jsonb_set(new.dados, '{impostoPct}', old.dados->'impostoPct');
  else
    new.dados := new.dados - 'impostoPct';
  end if;

  -- Parcela recebida não volta, não muda de valor e não some.
  rec_antes  := public._parcelas_marcadas(old.dados->'comissoes', true, true);
  rec_depois := public._parcelas_marcadas(new.dados->'comissoes', true, true);
  if not (rec_antes <@ rec_depois) then
    raise exception 'Somente o gestor desfaz, altera ou exclui uma parcela já recebida.' using errcode = '42501';
  end if;

  -- Parcela que passou a recebida: precisa existir como prevista na versão
  -- anterior, com a mesma data e o mesmo valor, e ser recebida pelo valor previsto.
  select coalesce(array_agg(x), '{}') into novas from unnest(rec_depois) x where x <> all(rec_antes);
  if array_length(novas, 1) > 0 then
    prev_antes := public._parcelas_marcadas(old.dados->'comissoes', false, false);
    foreach k in array novas loop
      -- k = tipo|vence|valor|valorRecebido|recebidoEm#n
      if split_part(k, '|', 3) <> split_part(k, '|', 4) then
        raise exception 'O recebimento deve ser pelo valor previsto. Para registrar outro valor, fale com o gestor.' using errcode = '42501';
      end if;
      base := concat_ws('|', split_part(k, '|', 1), split_part(k, '|', 2), split_part(k, '|', 3));
      if not exists (select 1 from unnest(prev_antes) p where p like base || '#%') then
        raise exception 'Parcela recebida não confere com o cronograma anterior.' using errcode = '42501';
      end if;
      -- consome a parcela prevista correspondente (duas iguais não viram três recebidas)
      prev_antes := array_remove(prev_antes, (select p from unnest(prev_antes) p where p like base || '#%' limit 1));
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_contrato on public.contratos;
create trigger trg_proteger_contrato before insert or update on public.contratos
  for each row execute function public.proteger_contrato();

-- ------------------------------------------------------------
-- 5. Consistência mínima dos registros (só vale para gravações novas:
--    NOT VALID não reprova nada do que já está no banco)
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads','clientes','contratos','vidas','tarefas','despesas'] loop
    if not exists (select 1 from pg_constraint where conname = t||'_dados_coerentes') then
      execute format($f$alter table public.%I add constraint %I check (
        jsonb_typeof(dados) = 'object' and (dados->>'id' is null or dados->>'id' = id)) not valid$f$, t, t||'_dados_coerentes');
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'contratos_dominios') then
    alter table public.contratos add constraint contratos_dominios check (
      coalesce(dados->>'pilar', 'saude') in ('saude','seguros','consorcios')
      and coalesce(dados->>'status', 'proposta') in ('proposta','implantado','ativo','suspenso','cancelado')
      and coalesce(jsonb_typeof(dados->'comissoes'), 'array') in ('array','null')) not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. Auditoria do servidor
-- ------------------------------------------------------------
create table if not exists public.auditoria (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  quem         uuid,
  tabela       text not null,
  registro_id  text not null,
  acao         text not null check (acao in ('INSERT','UPDATE','DELETE')),
  mudancas     jsonb,          -- {campo: {"de": antes, "para": depois}}; listas: {"saiu": [...], "entrou": [...]}
  registro     jsonb,          -- DELETE: o registro inteiro, para recuperar
  origem       text
);
comment on table public.auditoria is
  'Trilha de auditoria gravada por gatilho: quem, quando, o que mudou (antes e depois). Só inclusão; nem o gestor apaga pela API.';
create index if not exists auditoria_registro_idx on public.auditoria (tabela, registro_id, quando desc);
create index if not exists auditoria_quando_idx on public.auditoria (quando desc);
create index if not exists auditoria_quem_idx on public.auditoria (quem, quando desc);

alter table public.auditoria enable row level security;
drop policy if exists auditoria_sel on public.auditoria;
create policy auditoria_sel on public.auditoria for select to authenticated using ((select public.sou_gestor()));
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;
revoke all on public.auditoria from anon;

-- Diferença entre duas versões de "dados", campo a campo. Listas (cronograma de
-- comissão, histórico do lead) registram só os itens que saíram e entraram.
create or replace function public._diferenca(antes jsonb, depois jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k,
           case when jsonb_typeof(a) = 'array' and jsonb_typeof(d) = 'array' then
             jsonb_build_object(
               'saiu',   coalesce((select jsonb_agg(x) from jsonb_array_elements(a) x
                                    where not exists (select 1 from jsonb_array_elements(d) y where y = x)), '[]'::jsonb),
               'entrou', coalesce((select jsonb_agg(x) from jsonb_array_elements(d) x
                                    where not exists (select 1 from jsonb_array_elements(a) y where y = x)), '[]'::jsonb))
           else jsonb_build_object('de', a, 'para', d) end), '{}'::jsonb)
    from (
      select k, antes->k as a, depois->k as d
        from (select jsonb_object_keys(coalesce(antes,'{}'::jsonb)) as k
              union select jsonb_object_keys(coalesce(depois,'{}'::jsonb))) ks
       where k not in ('atualizadoEm','atualizadoPor','atualizadoPorNome')
    ) c
   where a is distinct from d
$$;

create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hdr jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  origem text := coalesce(hdr->>'x-erbe-origem', case when auth.uid() is null then 'sql/servidor' else 'api' end);
  mud jsonb; antes jsonb; depois jsonb; rid text;
begin
  if tg_table_name = 'perfis' then
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
    if mud = '{}'::jsonb then return null; end if;      -- nada mudou de fato
    insert into public.auditoria (quem, tabela, registro_id, acao, mudancas, origem)
    values (auth.uid(), tg_table_name, rid, 'UPDATE', mud, origem);
  elsif tg_op = 'INSERT' then
    insert into public.auditoria (quem, tabela, registro_id, acao, origem)
    values (auth.uid(), tg_table_name, rid, 'INSERT', origem);
  else
    insert into public.auditoria (quem, tabela, registro_id, acao, registro, origem)
    values (auth.uid(), tg_table_name, rid, 'DELETE', antes, origem);
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['perfis','leads','clientes','contratos','vidas','tarefas','despesas','config'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_auditar_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.auditar()', 'trg_auditar_'||t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 7. Transferir carteira (corretor que sai da equipe, redistribuição)
--    Leva leads, clientes, contratos, tarefas e vidas de um usuário para
--    outro, atualizando também responsável/corretor dentro dos registros.
-- ------------------------------------------------------------
create or replace function public.transferir_carteira(de uuid, para uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_leads int; n_cli int; n_ctr int; n_tar int; n_vid int;
begin
  if auth.uid() is not null and not public.sou_gestor() then
    raise exception 'Somente o gestor transfere carteira.' using errcode = '42501';
  end if;
  if de is null or para is null or de = para then
    raise exception 'Informe dois usuários diferentes.';
  end if;
  if not exists (select 1 from public.perfis where id = para and status = 'ativo') then
    raise exception 'O destino precisa ser um usuário ativo.';
  end if;
  update public.leads set dono = para,
    dados = case when dados->>'responsavel' = de::text then jsonb_set(dados, '{responsavel}', to_jsonb(para::text)) else dados end
   where dono = de;
  get diagnostics n_leads = row_count;
  update public.clientes set dono = para,
    dados = case when dados->>'responsavel' = de::text then jsonb_set(dados, '{responsavel}', to_jsonb(para::text)) else dados end
   where dono = de;
  get diagnostics n_cli = row_count;
  update public.contratos set dono = para,
    dados = case when dados->>'corretor' = de::text then jsonb_set(dados, '{corretor}', to_jsonb(para::text)) else dados end
   where dono = de;
  get diagnostics n_ctr = row_count;
  update public.tarefas set dono = para,
    dados = case when dados->>'responsavel' = de::text then jsonb_set(dados, '{responsavel}', to_jsonb(para::text)) else dados end
   where dono = de;
  get diagnostics n_tar = row_count;
  update public.vidas set dono = para where dono = de;
  get diagnostics n_vid = row_count;
  return jsonb_build_object('leads', n_leads, 'clientes', n_cli, 'contratos', n_ctr, 'tarefas', n_tar, 'vidas', n_vid);
end $$;
revoke all on function public.transferir_carteira(uuid, uuid) from public, anon;
grant execute on function public.transferir_carteira(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. Cliente único na corretora inteira
--    A RLS impede o corretor de ver o cliente do colega — e por isso a trava de
--    CPF/CNPJ duplicado feita na tela não enxergava duplicidade entre carteiras.
--    Esta função responde só o necessário: se o documento existe, de quem é e
--    (se quem pergunta pode ver) o id do cadastro.
-- ------------------------------------------------------------
create index if not exists clientes_doc_digitos_idx
  on public.clientes ((regexp_replace(coalesce(dados->>'doc',''), '\D', '', 'g')));

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
     and length(regexp_replace(coalesce(doc,''), '\D', '', 'g')) >= 11
     and regexp_replace(coalesce(c.dados->>'doc',''), '\D', '', 'g') = regexp_replace(doc, '\D', '', 'g')
     and (exceto is null or c.id <> exceto)
   limit 1
$$;
revoke all on function public.cliente_por_documento(text, text) from public, anon;
grant execute on function public.cliente_por_documento(text, text) to authenticated;

-- As funções internas não precisam ser chamadas pela API.
revoke all on function public._parcela_chave(jsonb, boolean) from public, anon, authenticated;
revoke all on function public._parcelas_marcadas(jsonb, boolean, boolean) from public, anon, authenticated;
revoke all on function public._diferenca(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.auditar() from public, anon, authenticated;
revoke all on function public.proteger_contrato() from public, anon, authenticated;

