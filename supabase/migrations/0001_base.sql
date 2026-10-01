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
