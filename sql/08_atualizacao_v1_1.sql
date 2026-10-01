-- =====================================================================
--  ATOS SISTEMA — 08_atualizacao_v1_1.sql            (versão 1.1)
--
--  • Grades de comissão (Ouro, Prata, Bronze, Externo) por corretor
--  • Grade por produto: quanto a corretora recebe e quanto paga a cada
--    grade de corretor (e ao supervisor), parcela a parcela
--  • Etapas do CRM, status do lead e etapas da implantação editáveis
--    e excluíveis (com transferência dos registros)
--  • Convites de agenda (reuniões e treinamentos) com resposta e lembrete
--  • Presença: quem está online agora
--  • Notificações: novo lead para a gestão e SLA de atendimento atrasado
--  • (1.2) Relacionamento, desempenho, ranking ao vivo, logotipo das equipes
--  • (1.3) CRM integrado à implantação: lead "Aprovado" entra na etapa
--    inicial da implantação e o CRM mostra em que etapa ela está
--
--  Pode ser executado em um banco novo (depois do 01 a 06) ou em um
--  banco da versão 1.0. Pode ser executado mais de uma vez.
-- =====================================================================

-- =====================================================================
-- A. ESTRUTURA
-- =====================================================================

-- A1. Grades de comissão dos corretores ------------------------------
create table if not exists public.commission_grades (
  codigo      text primary key check (codigo ~ '^[a-z0-9_]{2,30}$' and codigo not in ('corretora','supervisor')),
  nome        text not null,
  ordem       int  not null default 0,
  cor         text not null default '#5B8DFF',
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into public.commission_grades(codigo, nome, ordem, cor, descricao)
select * from (values
  ('ouro',    'Ouro',    1, '#E3B341', 'Corretores de maior produção'),
  ('prata',   'Prata',   2, '#B8C2D1', 'Corretores intermediários'),
  ('bronze',  'Bronze',  3, '#C98A5A', 'Corretores em desenvolvimento'),
  ('externo', 'Externo', 4, '#3CC8F2', 'Parceiros e corretores externos')) v
where not exists (select 1 from public.commission_grades);

alter table public.profiles add column if not exists grade_comissao text default 'bronze';
alter table public.profiles drop constraint if exists profiles_grade_fk;
alter table public.profiles add constraint profiles_grade_fk foreign key (grade_comissao) references public.commission_grades(codigo) on update cascade;
update public.profiles set grade_comissao = 'bronze'
 where grade_comissao is null and papel = 'corretor' and exists (select 1 from public.commission_grades where codigo = 'bronze');

-- A2. Grade de comissão por produto -----------------------------------
--   beneficiario: 'corretora' (o que a corretora RECEBE da operadora),
--                 'supervisor' (repasse ao supervisor) ou o código de uma grade
--   percentual  : % da mensalidade, em cada parcela
create table if not exists public.product_commission_grid (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  beneficiario  text not null,
  parcela       int  not null,
  percentual    numeric(8,2) not null check (percentual >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  unique (product_id, beneficiario, parcela)
);
create index if not exists pcg_product_idx on public.product_commission_grid(product_id);
-- percentual zero = sem comissão na parcela: não fica gravado (não aparece para o corretor)
delete from public.product_commission_grid where percentual = 0;
-- a grade tem no máximo 3 parcelas (1ª, 2ª e 3ª)
alter table public.product_commission_grid drop constraint if exists product_commission_grid_parcela_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pcg_parcela_max3') then
    alter table public.product_commission_grid add constraint pcg_parcela_max3 check (parcela between 1 and 3) not valid;
  end if;
end $$;
create index if not exists pcg_benef_idx on public.product_commission_grid(beneficiario);

alter table public.commissions add column if not exists grade text;
alter table public.commissions add column if not exists origem_calculo text;   -- grade | regra | padrao

-- A3. Etapas do CRM e status editáveis --------------------------------
alter table public.pipeline_stages add column if not exists grupo text;
alter table public.pipeline_stages add column if not exists sistema boolean not null default false;
alter table public.pipeline_stages drop constraint if exists pipeline_stages_grupo_ck;
update public.pipeline_stages set grupo = case codigo
    when 'novos' then 'entrada' when 'contato' then 'atendimento' when 'qualificacao' then 'atendimento'
    when 'cotacao' then 'negociacao' when 'negociacao' then 'negociacao'
    when 'proposta' then 'proposta' when 'analise' then 'proposta' when 'pendencia' then 'proposta'
    else case tipo when 'ganho' then 'ganho' when 'perdido' then 'perdido' else 'atendimento' end end
 where grupo is null;
alter table public.pipeline_stages add constraint pipeline_stages_grupo_ck
  check (grupo in ('entrada','atendimento','negociacao','proposta','ganho','perdido'));
alter table public.pipeline_stages alter column grupo set not null;
update public.pipeline_stages set sistema = true where codigo in ('novos','aprovado','implantado','perdido');

alter table public.lead_statuses add column if not exists sistema boolean not null default false;
update public.lead_statuses set sistema = true where codigo in ('novo','aprovado','implantado','perdido');

-- A4. Etapas da implantação (antes fixas no código) --------------------
create table if not exists public.implementation_stages (
  codigo        text primary key check (codigo ~ '^[a-z0-9_]{2,40}$'),
  nome          text not null,
  ordem         int  not null,
  cor           text not null default '#3B82F6',
  status_venda  text check (status_venda in ('em_analise','pendencia','aprovada','implantada','cancelada')),
  inicial       boolean not null default false,
  sistema       boolean not null default false,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
insert into public.implementation_stages(codigo, nome, ordem, cor, status_venda, inicial, sistema)
select * from (values
  ('venda_realizada',   'Venda realizada',      1, '#60A5FA', null,         true,  true),
  ('documentacao',      'Documentação',         2, '#818CF8', null,         false, false),
  ('enviado_operadora', 'Enviado à operadora',  3, '#3B82F6', 'em_analise', false, false),
  ('em_analise',        'Em análise',           4, '#2563EB', 'em_analise', false, false),
  ('pendencia',         'Pendência',            5, '#F59E0B', 'pendencia',  false, false),
  ('aprovado',          'Aprovado',             6, '#10B981', 'aprovada',   false, true),
  ('implantado',        'Implantado',           7, '#059669', 'implantada', false, true),
  ('cancelado',         'Cancelado',           99, '#EF4444', 'cancelada',  false, true)) v
where not exists (select 1 from public.implementation_stages);

alter table public.implementations drop constraint if exists implementations_etapa_check;
alter table public.implementations drop constraint if exists implementations_etapa_fk;
alter table public.implementations add constraint implementations_etapa_fk
  foreign key (etapa) references public.implementation_stages(codigo) on update cascade;
create index if not exists implementations_lead_idx on public.implementations(lead_id, created_at desc) where deleted_at is null;

-- A5. Agenda: convites, treinamentos, link e lembrete ------------------
alter table public.events add column if not exists link_reuniao text;
alter table public.events add column if not exists lembrete_min int default 30;
alter table public.events add column if not exists lembrete_enviado_em timestamptz;
alter table public.events add column if not exists convidados_externos text;
alter table public.events drop constraint if exists events_tipo_check;
alter table public.events add constraint events_tipo_check
  check (tipo in ('reuniao','treinamento','ligacao','retorno','compromisso','vencimento','visita','outro'));

create table if not exists public.event_participants (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  usuario_id        uuid not null references public.profiles(id) on delete cascade,
  resposta          text not null default 'pendente' check (resposta in ('pendente','aceito','recusado','talvez')),
  respondido_em     timestamptz,
  lembrete_enviado  boolean not null default false,
  convidado_por     uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  unique (event_id, usuario_id)
);
create index if not exists event_participants_user_idx on public.event_participants(usuario_id, event_id);

-- A6. Presença (quem está online) --------------------------------------
create table if not exists public.user_presence (
  usuario_id   uuid primary key references public.profiles(id) on delete cascade,
  visto_em     timestamptz not null default now(),
  entrou_em    timestamptz not null default now(),
  saiu_em      timestamptz,
  tela         text,
  dispositivo  text
);

-- A7. SLA: controle de alerta por lead ---------------------------------
alter table public.leads add column if not exists sla_alerta smallint not null default 0;  -- 0 ok | 1 avisou corretor | 2 avisou supervisor
-- evita uma enxurrada de alertas antigos logo após a atualização
update public.leads set sla_alerta = 2
 where sla_alerta = 0 and primeiro_contato_em is null and coalesce(assigned_at, distribuido_em, entrada_em) < now() - interval '1 hour';

-- A8. Configurações e permissões novas --------------------------------
insert into public.settings(chave, valor, descricao) values
  ('notificacoes', '{"novo_lead_supervisor":true,"novo_lead_gerente":false,"sla_corretor":true,"sla_supervisor":true,"sla_fila":true}',
   'Avisos automáticos: novo lead para a gestão e SLA de atendimento atrasado')
on conflict (chave) do nothing;

with novas as (
  insert into public.permissions(codigo, modulo, descricao) values
    ('presenca.ver', 'Equipe', 'Ver quem está online e a última atividade da equipe')
  on conflict (codigo) do nothing returning codigo)
insert into public.role_permissions(role, permission)
select r.role, n.codigo from novas n cross join (values ('admin'), ('gerente'), ('supervisor')) r(role)
on conflict do nothing;

-- A9. Relacionamento com o cliente, ranking e logotipo das equipes -------
alter table public.clients    add column if not exists lembrete_contato_em timestamptz;   -- último lembrete de "manter contato"
alter table public.clients    add column if not exists aniversario_avisado_em date;        -- último aviso de aniversário do titular
alter table public.dependents add column if not exists aniversario_avisado_em date;
alter table public.teams      add column if not exists logo text;                          -- imagem (data URL, até ~200 KB)
alter table public.teams      add column if not exists cor text;
alter table public.teams drop constraint if exists teams_logo_tamanho;
alter table public.teams add constraint teams_logo_tamanho check (logo is null or length(logo) <= 300000);

insert into public.settings(chave, valor, descricao) values
  ('relacionamento', jsonb_build_object(
      'aniversario', true, 'aniversario_dias_antes', 0, 'dependentes', true, 'contato', true, 'contato_dias', 60, 'contato_max_dia', 5, 'hora', 8,
      'msg_aniversario', 'Olá, {primeiro_nome}! 🎉 Hoje é um dia especial e eu não poderia deixar de desejar um feliz aniversário! Que seja um novo ano de muita saúde, alegria e conquistas. Conte sempre comigo. Um abraço, {corretor}.',
      'msg_aniversario_dependente', 'Olá, {primeiro_nome}! Passando para desejar um feliz aniversário a {dependente}! 🎉 Muita saúde e alegria para toda a família. Um abraço, {corretor}.',
      'msg_contato', 'Olá, {primeiro_nome}, tudo bem? Aqui é {corretor}. Passando para saber como está a experiência com o seu plano {operadora} e se posso ajudar em algo. Estou à disposição!'),
   'Lembretes de relacionamento: aniversários e manter contato com clientes'),
  ('ranking', '{"visibilidade":"empresa"}', 'Ranking: "empresa" = todos veem o ranking geral (só totais); "hierarquia" = cada um vê a sua estrutura')
on conflict (chave) do nothing;

-- =====================================================================
-- B. FUNÇÕES DE APOIO
-- =====================================================================
create or replace function private.grupo_etapa(p_etapa text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select grupo from public.pipeline_stages where codigo = p_etapa
$$;

create or replace function private.etapas_do_grupo(variadic p_grupos text[])
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(codigo), '{}') from public.pipeline_stages where grupo = any(p_grupos)
$$;

create or replace function private.proximo_aniversario(p_nasc date, p_hoje date)
returns date language plpgsql immutable as $$
declare y int := extract(year from p_hoje)::int; m int; d int; r date;
begin
  if p_nasc is null then return null; end if;
  m := extract(month from p_nasc)::int; d := extract(day from p_nasc)::int;
  for i in 0..1 loop
    r := make_date(y + i, m, case when m = 2 and d = 29 and not ((y + i) % 4 = 0 and ((y + i) % 100 <> 0 or (y + i) % 400 = 0)) then 28 else d end);
    if r >= p_hoje then return r; end if;
  end loop;
  return r;
end $$;

create or replace function private.hoje_sp()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function private.minha_grade()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select grade_comissao from public.profiles where id = auth.uid() and papel = 'corretor' and status = 'ativo'
$$;

create or replace function private.pode_ver_perfil(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles x
     where x.id = p_usuario and x.status = 'ativo' and x.deleted_at is null
       and (x.id = auth.uid()
         or private.papel() = 'admin'
         or (private.papel() = 'gerente'    and x.gerente_id    = auth.uid())
         or (private.papel() = 'supervisor' and x.supervisor_id = auth.uid())
         or x.id = any(coalesce(private.meus_superiores(), '{}'::uuid[]))))
$$;

create or replace function private.participa_evento(p_evento uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.event_participants where event_id = p_evento and usuario_id = auth.uid())
$$;

create or replace function private.pode_ver_evento(p_evento uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.participa_evento(p_evento) or exists (
    select 1 from public.events e where e.id = p_evento and e.deleted_at is null
       and (private.pode_ver(e.corretor_id, e.supervisor_id, e.gerente_id) or e.responsavel_id = auth.uid() or e.created_by = auth.uid()))
$$;

create or replace function private.pode_editar_evento(p_evento uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.events e where e.id = p_evento and e.deleted_at is null
       and (private.papel() = 'admin' or e.created_by = auth.uid() or e.responsavel_id = auth.uid()
            or (private.papel() in ('gerente','supervisor') and private.pode_ver(e.corretor_id, e.supervisor_id, e.gerente_id))))
$$;

-- =====================================================================
-- C. REGRAS AUTOMÁTICAS ATUALIZADAS
-- =====================================================================

-- Temperatura: usa o GRUPO da etapa (funciona com etapas personalizadas)
create or replace function private.calc_temperatura(l public.leads)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v int := 0; g text := private.grupo_etapa(l.etapa);
begin
  if l.tentativas_contato >= 1 then v := v + 1; end if;
  if l.tentativas_contato >= 3 then v := v + 1; end if;
  if g = 'negociacao' then v := v + 2; elsif g = 'proposta' then v := v + 3; end if;
  if l.valor_cotacao is not null then v := v + 1; end if;
  if l.ultimo_contato_em > now() - interval '24 hours' then v := v + 1;
  elsif coalesce(l.ultimo_contato_em, l.entrada_em) < now() - interval '72 hours' then v := v - 2; end if;
  if l.proximo_followup_em between now() and now() + interval '24 hours' then v := v + 1; end if;
  if l.prioritario then v := v + 1; end if;
  if l.entrada_em > now() - interval '24 hours' and l.primeiro_contato_em is null then v := v + 2; end if;  -- lead recém-chegado
  return case when v >= 4 then 'quente' when v >= 2 then 'morno' else 'frio' end;
end $$;

-- Leads antes de gravar (acrescenta: reinício do SLA a cada nova atribuição)
create or replace function private.tg_leads_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_st public.lead_statuses; v_etapa public.pipeline_stages;
begin
  new.cpf      := private.so_digitos(new.cpf);
  new.cnpj     := private.so_digitos(new.cnpj);
  new.telefone := private.so_digitos(new.telefone);
  new.whatsapp := private.so_digitos(new.whatsapp);
  new.email    := nullif(lower(trim(new.email)), '');
  new.uf       := upper(nullif(trim(new.uf), ''));

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select * into v_st from public.lead_statuses where codigo = new.status;
    new.etapa := v_st.etapa;
  elsif new.etapa is distinct from old.etapa then
    select * into v_etapa from public.pipeline_stages where codigo = new.etapa;
    select * into v_st from public.lead_statuses where codigo = new.status;
    if v_st.etapa is distinct from new.etapa then
      new.status := coalesce(v_etapa.status_padrao, (select codigo from public.lead_statuses where etapa = new.etapa order by ordem limit 1));
      if new.status is null then
        raise exception 'A etapa "%" não tem nenhum status cadastrado', v_etapa.nome using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
  end if;

  select * into v_st from public.lead_statuses where codigo = new.status;
  if v_st.exige_motivo and new.loss_reason_id is null then
    raise exception 'Informe o motivo da perda para marcar o lead como "%"', v_st.nome using errcode = '23514';
  end if;
  if not v_st.exige_motivo then
    new.loss_reason_id := null; new.motivo_perda_obs := null;
  end if;

  if new.corretor_id is not null and (tg_op = 'INSERT' or new.corretor_id is distinct from old.corretor_id) then
    new.assigned_at    := now();
    new.assigned_by    := auth.uid();
    new.distribuido_em := coalesce(new.distribuido_em, now());
    new.alerta_nivel   := 0;
    if new.primeiro_contato_em is null then new.sla_alerta := 0; end if;
  end if;

  if new.temperatura_auto then
    new.temperatura := private.calc_temperatura(new);
  end if;
  return new;
end $$;

-- Leads depois de gravar (acrescenta: aviso de novo lead para supervisor/gerente)
create or replace function private.tg_leads_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_motivo text := nullif(current_setting('atos.motivo', true), '');
  v_metodo text := coalesce(nullif(current_setting('atos.metodo', true), ''), 'manual');
  v_cfg jsonb := private.setting('notificacoes', '{}');
  v_diff jsonb; v_nome_st text; v_nome_perda text; v_nome_ant text; v_nome_novo text; e record;
  v_sup_avisado boolean := false; v_corr uuid;
begin
  if tg_op = 'INSERT' then
    perform private.historico(new.id, 'criacao', 'Lead criado', null, jsonb_build_object('status', new.status));
    if new.corretor_id is not null then
      insert into public.lead_assignments(lead_id, corretor_anterior, corretor_novo, distribuido_por, metodo, motivo)
      values (new.id, null, new.corretor_id, auth.uid(), v_metodo, v_motivo);
      update public.profiles set ultimo_lead_em = now() where id = new.corretor_id;
      if new.corretor_id is distinct from auth.uid() then
        perform private.notificar(new.corretor_id, 'lead_recebido', 'Novo lead recebido', new.nome, '#/leads/' || new.id, new.id);
      end if;
    elsif coalesce((private.setting('distribuicao')->>'automatica_ao_criar')::boolean, false) then
      select * into e from private.escolher_corretor(new.id, null);
      if e.corretor is not null then
        perform private.atribuir(new.id, e.corretor, coalesce('Regra: ' || e.regra, 'Rodízio'), e.metodo);
      elsif new.supervisor_id is not null then
        perform private.notificar(new.supervisor_id, 'novo_lead', 'Novo lead na fila da equipe', new.nome, '#/leads/' || new.id, new.id);
        v_sup_avisado := true;
      end if;
    elsif new.supervisor_id is not null then
      perform private.notificar(new.supervisor_id, 'novo_lead', 'Novo lead na fila da equipe', new.nome, '#/leads/' || new.id, new.id);
      v_sup_avisado := true;
    end if;

    -- aviso de novo lead para a gestão
    select corretor_id into v_corr from public.leads where id = new.id;
    if not v_sup_avisado and new.supervisor_id is not null and new.supervisor_id is distinct from auth.uid()
       and coalesce((v_cfg->>'novo_lead_supervisor')::boolean, true) then
      perform private.notificar(new.supervisor_id, 'novo_lead', 'Novo lead na equipe',
        new.nome || coalesce(' → ' || private.nome_usuario(v_corr), ''), '#/leads/' || new.id, new.id);
    end if;
    if new.gerente_id is not null and new.gerente_id is distinct from auth.uid()
       and coalesce((v_cfg->>'novo_lead_gerente')::boolean, false) then
      perform private.notificar(new.gerente_id, 'novo_lead', 'Novo lead na estrutura',
        new.nome || coalesce(' → ' || private.nome_usuario(v_corr), ''), '#/leads/' || new.id, new.id);
    end if;
    return new;
  end if;

  if new.corretor_id is distinct from old.corretor_id then
    select nome into v_nome_ant  from public.profiles where id = old.corretor_id;
    select nome into v_nome_novo from public.profiles where id = new.corretor_id;
    insert into public.lead_assignments(lead_id, corretor_anterior, corretor_novo, distribuido_por, metodo, motivo)
    values (new.id, old.corretor_id, new.corretor_id, auth.uid(), v_metodo, v_motivo);
    perform private.historico(new.id,
      case when old.corretor_id is null then 'distribuicao' else 'responsavel' end,
      case when old.corretor_id is null then 'Lead distribuído para ' || coalesce(v_nome_novo,'—')
           else 'Responsável alterado: ' || coalesce(v_nome_ant,'—') || ' → ' || coalesce(v_nome_novo,'—') end,
      v_motivo, jsonb_build_object('anterior', old.corretor_id, 'novo', new.corretor_id, 'metodo', v_metodo));
    if new.corretor_id is not null then
      update public.profiles set ultimo_lead_em = now() where id = new.corretor_id;
      perform private.notificar(new.corretor_id, 'lead_recebido', 'Lead atribuído a você', new.nome, '#/leads/' || new.id, new.id);
    end if;
    update public.followups set responsavel_id = case when responsavel_id = old.corretor_id then new.corretor_id else responsavel_id end
     where lead_id = new.id and status = 'pendente';
    update public.tasks set responsavel_id = case when responsavel_id = old.corretor_id then new.corretor_id else responsavel_id end
     where lead_id = new.id and status in ('aberta','em_andamento');
    update public.followups  set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id;
    update public.tasks      set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id;
    update public.quotes     set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id;
    update public.proposals  set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id and client_id is null;
    update public.activities set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id;
    update public.notes      set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id;
    update public.documents  set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id and client_id is null;
    update public.events     set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id;
    update public.pendencies set corretor_id = new.corretor_id, supervisor_id = new.supervisor_id, gerente_id = new.gerente_id, team_id = new.team_id where lead_id = new.id and sale_id is null;
  elsif new.supervisor_id is distinct from old.supervisor_id or new.gerente_id is distinct from old.gerente_id then
    perform private.historico(new.id, 'responsavel', 'Estrutura responsável alterada', v_motivo, null);
  end if;

  if new.status is distinct from old.status and (select exige_motivo from public.lead_statuses where codigo = new.status) then
    update public.followups set status = 'cancelado' where lead_id = new.id and status = 'pendente';
  end if;

  if new.status is distinct from old.status then
    select nome into v_nome_st from public.lead_statuses where codigo = new.status;
    select nome into v_nome_perda from public.loss_reasons where id = new.loss_reason_id;
    perform private.historico(new.id, 'status',
      'Status: ' || coalesce((select nome from public.lead_statuses where codigo = old.status), old.status) || ' → ' || coalesce(v_nome_st, new.status),
      case when v_nome_perda is not null then 'Motivo: ' || v_nome_perda || coalesce(' — ' || new.motivo_perda_obs, '') end,
      jsonb_build_object('de', old.status, 'para', new.status, 'etapa', new.etapa));
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    perform private.historico(new.id, 'exclusao', 'Lead excluído (arquivado)', null, null);
  end if;

  v_diff := private.json_diff(to_jsonb(old), to_jsonb(new))
            - array['corretor_id','supervisor_id','gerente_id','team_id','status','etapa','temperatura','assigned_at','assigned_by',
                    'distribuido_em','alerta_nivel','sla_alerta','ultimo_contato_em','primeiro_contato_em','tentativas_contato','proximo_followup_em',
                    'deleted_at','valor_cotacao','client_id','loss_reason_id','motivo_perda_obs'];
  if v_diff <> '{}'::jsonb then
    perform private.historico(new.id, 'alteracao', 'Dados atualizados',
      (select string_agg(k, ', ') from jsonb_object_keys(v_diff) k), v_diff);
  end if;
  return new;
end $$;

-- Atividades: só usa status automáticos que ainda existirem
create or replace function private.tg_atividade_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_titulo text; l public.leads; v_novo text;
begin
  if new.lead_id is null then return new; end if;
  select * into l from public.leads where id = new.lead_id;
  if l.status = 'novo' then v_novo := case when new.efetivo then 'contato_realizado' else 'tentativa_contato' end;
  elsif l.status = 'tentativa_contato' and new.efetivo then v_novo := 'contato_realizado';
  end if;
  if v_novo is not null and not exists (select 1 from public.lead_statuses where codigo = v_novo) then
    v_novo := (select s.status_padrao from public.pipeline_stages s where s.grupo = 'atendimento' and s.ativo and s.status_padrao is not null order by s.ordem limit 1);
  end if;
  update public.leads set
      ultimo_contato_em   = greatest(coalesce(ultimo_contato_em, new.realizado_em), new.realizado_em),
      primeiro_contato_em = coalesce(primeiro_contato_em, new.realizado_em),
      tentativas_contato  = tentativas_contato + 1,
      alerta_nivel        = 0,
      status              = coalesce(v_novo, status)
   where id = new.lead_id;
  v_titulo := case new.tipo when 'ligacao' then 'Ligação' when 'whatsapp' then 'WhatsApp' when 'email' then 'E-mail'
                            when 'reuniao' then 'Reunião' when 'visita' then 'Visita' else 'Contato' end
              || case when new.efetivo then ' realizado' else ' — sem sucesso' end
              || coalesce(' (' || new.resultado || ')', '');
  perform private.historico(new.lead_id, new.tipo, v_titulo, new.descricao, jsonb_build_object('activity_id', new.id));
  return new;
end $$;

-- Perfis: grade de comissão também só pode ser alterada pelo administrador
create or replace function private.tg_profiles_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_papel text := private.papel();
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and coalesce(v_papel,'') <> 'admin' then
    if new.papel is distinct from old.papel or new.status is distinct from old.status
       or new.team_id is distinct from old.team_id or new.supervisor_id is distinct from old.supervisor_id
       or new.gerente_id is distinct from old.gerente_id or new.email is distinct from old.email
       or new.recebe_leads is distinct from old.recebe_leads or new.deleted_at is distinct from old.deleted_at
       or new.grade_comissao is distinct from old.grade_comissao then
      raise exception 'Apenas o administrador altera papel, status, grade ou hierarquia de usuários' using errcode = '42501';
    end if;
  end if;

  if new.papel = 'corretor' then
    if new.team_id is not null then
      select supervisor_id into new.supervisor_id from public.teams where id = new.team_id;
    end if;
    new.gerente_id := (select gerente_id from public.profiles where id = new.supervisor_id);
    if new.grade_comissao is null then
      new.grade_comissao := (select codigo from public.commission_grades where ativo order by (codigo = 'bronze') desc, ordem limit 1);
    end if;
  elsif new.papel = 'supervisor' then
    new.supervisor_id := null;
    new.team_id := coalesce((select id from public.teams where supervisor_id = new.id and deleted_at is null order by created_at limit 1), new.team_id);
  else
    new.supervisor_id := null; new.gerente_id := null; new.team_id := null;
  end if;
  return new;
end $$;

-- Implantação: mapeamento venda ↔ etapa passa a vir da tabela editável
create or replace function private.impl_para_venda(p text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select status_venda from public.implementation_stages where codigo = p
$$;
create or replace function private.venda_para_impl(p text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select codigo from public.implementation_stages
   where status_venda = case p when 'recusada' then 'cancelada' else p end
   order by ordem desc limit 1
$$;
create or replace function private.etapa_impl_inicial()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select codigo from public.implementation_stages where inicial order by ordem limit 1),
                  (select codigo from public.implementation_stages order by ordem limit 1))
$$;

-- Comissões: grade do produto × grade do corretor (com regras antigas como reserva)
create or replace function private.gerar_comissoes(p_sale uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.sales; r public.commission_rules; v_padrao jsonb; i int; v_parc int;
        v_emp numeric; v_cor numeric; v_sup numeric; v_base date; v_grade text; p record;
begin
  select * into s from public.sales where id = p_sale;
  if not found then return; end if;
  v_base  := coalesce(s.vigencia, s.data_venda);
  v_grade := (select grade_comissao from public.profiles where id = s.corretor_id);

  -- 1) Grade de comissão do produto
  if s.product_id is not null and exists (select 1 from public.product_commission_grid where product_id = s.product_id and beneficiario = 'corretora') then
    for p in select distinct parcela from public.product_commission_grid where product_id = s.product_id order by parcela loop
      v_emp := coalesce((select percentual from public.product_commission_grid where product_id = s.product_id and beneficiario = 'corretora' and parcela = p.parcela), 0);
      v_cor := coalesce((select percentual from public.product_commission_grid where product_id = s.product_id and beneficiario = v_grade and parcela = p.parcela), 0);
      v_sup := case when s.supervisor_id is null then 0 else
               coalesce((select percentual from public.product_commission_grid where product_id = s.product_id and beneficiario = 'supervisor' and parcela = p.parcela), 0) end;
      insert into public.commissions(sale_id, lead_id, client_id, operator_id, rule_id, parcela, valor_venda, grade, origem_calculo,
                                     comissao_prevista, comissao_corretor, comissao_supervisor, comissao_empresa, data_prevista, status)
      values (s.id, s.lead_id, s.client_id, s.operator_id, null, p.parcela, s.valor_mensal, v_grade, 'grade',
              round(s.valor_mensal * v_emp / 100, 2), round(s.valor_mensal * v_cor / 100, 2), round(s.valor_mensal * v_sup / 100, 2),
              round(s.valor_mensal * v_emp / 100, 2) - round(s.valor_mensal * v_cor / 100, 2) - round(s.valor_mensal * v_sup / 100, 2),
              (v_base + (p.parcela * interval '1 month'))::date, 'prevista')
      on conflict (sale_id, parcela) do nothing;
    end loop;
    return;
  end if;

  -- 2) Regras de comissão (legado) ou 3) percentual padrão
  select * into r from public.commission_rules c
   where c.ativo
     and (c.operator_id   is null or c.operator_id   = s.operator_id)
     and (c.product_id    is null or c.product_id    = s.product_id)
     and (c.corretor_id   is null or c.corretor_id   = s.corretor_id)
     and (c.supervisor_id is null or c.supervisor_id = s.supervisor_id)
     and (c.campaign_id   is null or c.campaign_id   = s.campaign_id)
   order by (c.corretor_id is not null)::int * 16 + (c.product_id is not null)::int * 8 + (c.campaign_id is not null)::int * 4
          + (c.supervisor_id is not null)::int * 2 + (c.operator_id is not null)::int desc, c.created_at
   limit 1;
  v_padrao := private.setting('comissao_padrao', '{"pct_empresa":100,"pct_corretor":40,"pct_supervisor":10,"parcelas":1}');
  v_emp  := coalesce(r.pct_empresa,    (v_padrao->>'pct_empresa')::numeric);
  v_cor  := coalesce(r.pct_corretor,   (v_padrao->>'pct_corretor')::numeric);
  v_sup  := coalesce(r.pct_supervisor, (v_padrao->>'pct_supervisor')::numeric);
  v_parc := coalesce(r.parcelas,       (v_padrao->>'parcelas')::int);
  for i in 1..v_parc loop
    insert into public.commissions(sale_id, lead_id, client_id, operator_id, rule_id, parcela, valor_venda, grade, origem_calculo,
                                   comissao_prevista, comissao_corretor, comissao_supervisor, comissao_empresa, data_prevista, status)
    values (s.id, s.lead_id, s.client_id, s.operator_id, r.id, i, s.valor_mensal, v_grade, case when r.id is null then 'padrao' else 'regra' end,
            round(s.valor_mensal * v_emp / 100, 2), round(s.valor_mensal * v_cor / 100, 2), round(s.valor_mensal * v_sup / 100, 2),
            round(s.valor_mensal * v_emp / 100, 2) - round(s.valor_mensal * v_cor / 100, 2) - round(s.valor_mensal * v_sup / 100, 2),
            (v_base + (i * interval '1 month'))::date, 'prevista')
    on conflict (sale_id, parcela) do nothing;
  end loop;
end $$;

create or replace function private.tg_venda_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text := case when tg_op = 'UPDATE' then old.status end; v_impl text;
begin
  if tg_op = 'INSERT' then
    insert into public.implementations(sale_id, lead_id, client_id, etapa, responsavel_id)
    values (new.id, new.lead_id, new.client_id, coalesce(private.venda_para_impl(new.status), private.etapa_impl_inicial()), new.corretor_id)
    on conflict (sale_id) do nothing;
    perform private.historico(new.lead_id, 'venda', 'Venda registrada', 'R$ ' || to_char(new.valor_mensal, 'FM999G999G990D00') || '/mês — ' || new.num_vidas || ' vida(s)', jsonb_build_object('sale_id', new.id));
  end if;

  if tg_op = 'INSERT' or new.status is distinct from v_old then
    update public.proposals set status = case new.status when 'proposta_enviada' then 'enviada' when 'implantada' then 'aprovada' else new.status end
     where sale_id = new.id and deleted_at is null
       and status is distinct from (case new.status when 'proposta_enviada' then 'enviada' when 'implantada' then 'aprovada' else new.status end);
    v_impl := private.venda_para_impl(new.status);
    if tg_op = 'UPDATE' and v_impl is not null then
      update public.implementations set etapa = v_impl
       where sale_id = new.id and private.impl_para_venda(etapa) is distinct from (case new.status when 'recusada' then 'cancelada' else new.status end);
    end if;

    if new.status in ('aprovada','implantada') and coalesce(v_old,'') not in ('aprovada','implantada') then
      perform private.gerar_comissoes(new.id);
      perform private.avancar_lead(new.lead_id, 'aprovado');
      perform private.historico(new.lead_id, 'aprovacao', 'Venda aprovada pela operadora', null, jsonb_build_object('sale_id', new.id));
      perform private.notificar(new.corretor_id, 'venda_aprovada', 'Venda aprovada', 'R$ ' || to_char(new.valor_mensal, 'FM999G999G990D00') || '/mês', '#/vendas/' || new.id, new.id);
      perform private.notificar(new.supervisor_id, 'venda_aprovada', 'Venda aprovada na equipe', 'R$ ' || to_char(new.valor_mensal, 'FM999G999G990D00') || '/mês', '#/vendas/' || new.id, new.id);
    end if;

    if new.status = 'implantada' and coalesce(v_old,'') <> 'implantada' then
      update public.clients set status = 'ativo', vigencia = coalesce(vigencia, new.vigencia) where id = new.client_id and status in ('implantacao','pendencia');
      perform private.avancar_lead(new.lead_id, 'implantado');
      perform private.historico(new.lead_id, 'implantacao', 'Plano implantado', null, jsonb_build_object('sale_id', new.id));
      perform private.notificar(new.corretor_id, 'venda_implantada', 'Venda implantada', null, '#/vendas/' || new.id, new.id);
    end if;

    if new.status = 'pendencia' and coalesce(v_old,'') <> 'pendencia' then
      update public.clients set status = 'pendencia' where id = new.client_id and status = 'implantacao';
      perform private.historico(new.lead_id, 'pendencia', 'Venda com pendência na operadora', null, jsonb_build_object('sale_id', new.id));
      perform private.notificar(new.corretor_id, 'pendencia', 'Pendência na venda', null, '#/vendas/' || new.id, new.id);
    end if;

    if new.status in ('cancelada','recusada') and coalesce(v_old,'') not in ('cancelada','recusada') then
      update public.commissions set status = case when status in ('recebida','paga') then 'estornada' else 'cancelada' end
       where sale_id = new.id and status not in ('cancelada','estornada');
      if new.status = 'cancelada' then
        update public.clients set status = 'cancelado' where id = new.client_id
           and not exists (select 1 from public.sales s2 where s2.client_id = new.client_id and s2.id <> new.id and s2.status in ('aprovada','implantada') and s2.deleted_at is null);
      end if;
      perform private.historico(new.lead_id, 'cancelamento',
        case when new.status = 'recusada' then 'Venda recusada pela operadora' else 'Venda cancelada' end, new.motivo_cancelamento, jsonb_build_object('sale_id', new.id));
    end if;
  end if;
  return new;
end $$;

-- Etapas do CRM: tipo derivado do grupo; toda etapa nova ganha um status
create or replace function private.tg_etapa_crm_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.grupo is null then
    new.grupo := case new.tipo when 'ganho' then 'ganho' when 'perdido' then 'perdido' else 'atendimento' end;
  end if;
  new.tipo := case new.grupo when 'ganho' then 'ganho' when 'perdido' then 'perdido' else 'aberto' end;
  if tg_op = 'UPDATE' then
    if new.codigo is distinct from old.codigo then
      raise exception 'O código da etapa não pode ser alterado' using errcode = '23514';
    end if;
    if old.sistema and new.grupo is distinct from old.grupo then
      raise exception 'A etapa "%" é usada pelas automações; o grupo dela não pode mudar', old.nome using errcode = '23514';
    end if;
    if old.ativo and not new.ativo and exists (select 1 from public.leads where etapa = old.codigo and deleted_at is null) then
      raise exception 'Mova os leads da etapa "%" antes de desativá-la', old.nome using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function private.tg_etapa_crm_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cod text;
begin
  if not exists (select 1 from public.lead_statuses where etapa = new.codigo) then
    v_cod := new.codigo;
    if exists (select 1 from public.lead_statuses where codigo = v_cod) then v_cod := new.codigo || '_st'; end if;
    insert into public.lead_statuses(codigo, nome, etapa, ordem, cor, exige_motivo)
    values (v_cod, new.nome, new.codigo, coalesce((select max(ordem) from public.lead_statuses), 0) + 1, new.cor, new.grupo = 'perdido');
    update public.pipeline_stages set status_padrao = v_cod where codigo = new.codigo and status_padrao is null;
  end if;
  return null;
end $$;

-- Status: não muda código; ao trocar de etapa, os leads acompanham
create or replace function private.tg_status_lead_antes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.codigo is distinct from old.codigo then
    raise exception 'O código do status não pode ser alterado' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.sistema and (new.etapa is distinct from old.etapa or new.exige_motivo is distinct from old.exige_motivo) then
    raise exception 'O status "%" é usado pelas automações; só nome, cor e ordem podem mudar', old.nome using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.tg_status_lead_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.etapa is distinct from old.etapa then
    update public.leads set etapa = new.etapa where status = new.codigo and etapa is distinct from new.etapa;
  end if;
  return null;
end $$;

-- Etapas da implantação: só uma inicial
create or replace function private.tg_etapa_impl_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.codigo is distinct from old.codigo then
    raise exception 'O código da etapa não pode ser alterado' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.sistema and new.status_venda is distinct from old.status_venda then
    raise exception 'A etapa "%" é usada pelas automações; só nome, cor e ordem podem mudar', old.nome using errcode = '23514';
  end if;
  if new.inicial then
    update public.implementation_stages set inicial = false where codigo <> new.codigo and inicial;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Agenda: reinicia lembrete ao mudar horário; avisa convidados de mudanças
create or replace function private.tg_evento_antes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.inicio is distinct from old.inicio or new.lembrete_min is distinct from old.lembrete_min) then
    new.lembrete_enviado_em := null;
  end if;
  return new;
end $$;

create or replace function private.tg_evento_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_quando text := to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
begin
  if new.deleted_at is not null and old.deleted_at is null then
    insert into public.notifications(usuario_id, tipo, titulo, mensagem, link, ref_id)
    select p.usuario_id, 'evento_cancelado', 'Cancelado: ' || new.titulo, v_quando, '#/agenda', new.id
      from public.event_participants p where p.event_id = new.id and p.usuario_id is distinct from auth.uid() and p.resposta <> 'recusado';
  elsif new.deleted_at is null and (new.inicio is distinct from old.inicio or new.local is distinct from old.local
        or new.link_reuniao is distinct from old.link_reuniao or new.titulo is distinct from old.titulo) then
    if new.inicio is distinct from old.inicio then
      update public.event_participants set lembrete_enviado = false where event_id = new.id;
    end if;
    insert into public.notifications(usuario_id, tipo, titulo, mensagem, link, ref_id)
    select p.usuario_id, 'evento_alterado', 'Alterado: ' || new.titulo, 'Agora em ' || v_quando || coalesce(' · ' || new.local, ''), '#/agenda?evento=' || new.id, new.id
      from public.event_participants p where p.event_id = new.id and p.usuario_id is distinct from auth.uid() and p.resposta <> 'recusado';
  end if;
  return new;
end $$;

-- =====================================================================
-- D. LIGAÇÃO DOS TRIGGERS NOVOS
-- =====================================================================
drop trigger if exists a20_etapa_crm on public.pipeline_stages;
create trigger a20_etapa_crm before insert or update on public.pipeline_stages for each row execute function private.tg_etapa_crm_antes();
drop trigger if exists z10_etapa_crm on public.pipeline_stages;
create trigger z10_etapa_crm after insert on public.pipeline_stages for each row execute function private.tg_etapa_crm_depois();

drop trigger if exists a20_status_lead on public.lead_statuses;
create trigger a20_status_lead before update on public.lead_statuses for each row execute function private.tg_status_lead_antes();
drop trigger if exists z10_status_lead on public.lead_statuses;
create trigger z10_status_lead after update on public.lead_statuses for each row execute function private.tg_status_lead_depois();

drop trigger if exists a20_etapa_impl on public.implementation_stages;
create trigger a20_etapa_impl before insert or update on public.implementation_stages for each row execute function private.tg_etapa_impl_antes();

drop trigger if exists a30_evento on public.events;
create trigger a30_evento before update on public.events for each row execute function private.tg_evento_antes();
drop trigger if exists z20_evento on public.events;
create trigger z20_evento after update on public.events for each row execute function private.tg_evento_depois();

do $$
declare t text;
begin
  foreach t in array array['commission_grades','implementation_stages'] loop
    execute format('drop trigger if exists z90_auditoria on public.%I', t);
    execute format('create trigger z90_auditoria after insert or update or delete on public.%I for each row execute function private.tg_auditoria()', t);
  end loop;
  execute 'drop trigger if exists a00_carimbo on public.product_commission_grid';
  execute 'create trigger a00_carimbo before insert or update on public.product_commission_grid for each row execute function private.tg_carimbo()';
end $$;

-- =====================================================================
-- E. SEGURANÇA (RLS) DAS TABELAS NOVAS E AJUSTES
-- =====================================================================
alter table public.commission_grades enable row level security;
alter table public.implementation_stages enable row level security;
do $$
declare t text;
begin
  foreach t in array array['commission_grades','implementation_stages'] loop
    execute format('drop policy if exists cad_select on public.%I', t);
    execute format('drop policy if exists cad_write on public.%I', t);
    execute format('create policy cad_select on public.%I for select to authenticated using ((select private.papel()) is not null)', t);
    execute format('create policy cad_write on public.%I for all to authenticated using ((select private.papel()) = ''admin'') with check ((select private.papel()) = ''admin'')', t);
  end loop;
end $$;

-- Grade por produto: gestão com permissão vê tudo; corretor vê só a própria grade
alter table public.product_commission_grid enable row level security;
drop policy if exists pcg_select on public.product_commission_grid;
drop policy if exists pcg_write on public.product_commission_grid;
create policy pcg_select on public.product_commission_grid for select to authenticated using (
      (select private.papel()) = 'admin'
   or (select private.tem_permissao('comissoes.ver'))
   or beneficiario = (select private.minha_grade())
   or (beneficiario = 'supervisor' and (select private.papel()) = 'supervisor'));
create policy pcg_write on public.product_commission_grid for all to authenticated
  using ((select private.papel()) = 'admin') with check ((select private.papel()) = 'admin');

-- Agenda: convidados enxergam o compromisso para o qual foram convidados
drop policy if exists escopo_select on public.events;
create policy escopo_select on public.events for select to authenticated using (
        (select private.papel()) = 'admin'
     or ((select private.papel()) = 'gerente'    and gerente_id    = (select auth.uid()))
     or ((select private.papel()) = 'supervisor' and supervisor_id = (select auth.uid()))
     or ((select private.papel()) = 'corretor'   and corretor_id   = (select auth.uid()))
     or responsavel_id = (select auth.uid())
     or created_by = (select auth.uid())
     or ((select private.papel()) is not null and private.participa_evento(id)));

alter table public.event_participants enable row level security;
drop policy if exists evp_select on public.event_participants;
create policy evp_select on public.event_participants for select to authenticated using (
  (select private.papel()) is not null and (usuario_id = (select auth.uid()) or private.pode_ver_evento(event_id)));

-- Presença: cada um vê a própria; a gestão vê a da sua estrutura
alter table public.user_presence enable row level security;
drop policy if exists pres_select on public.user_presence;
create policy pres_select on public.user_presence for select to authenticated using (
     usuario_id = (select auth.uid())
  or ((select private.tem_permissao('presenca.ver')) and exists (select 1 from public.profiles p where p.id = usuario_id)));

grant select, insert, update, delete on public.commission_grades, public.implementation_stages, public.product_commission_grid to authenticated;
grant select on public.event_participants, public.user_presence to authenticated;
revoke insert, update, delete on public.event_participants, public.user_presence from authenticated;

-- =====================================================================
-- F. VIEWS (recriadas com as colunas novas)
-- =====================================================================
do $$
declare v record;
begin
  for v in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('drop view if exists public.%I cascade', v.table_name);
  end loop;
end $$;

create view public.managers    with (security_invoker = true) as select * from public.profiles where papel = 'gerente'    and deleted_at is null;
create view public.supervisors with (security_invoker = true) as select * from public.profiles where papel = 'supervisor' and deleted_at is null;
create view public.brokers     with (security_invoker = true) as select * from public.profiles where papel = 'corretor'   and deleted_at is null;

create view public.v_profiles with (security_invoker = true) as
select p.*, t.nome as team_nome,
       private.nome_usuario(p.supervisor_id) as supervisor_nome,
       private.nome_usuario(p.gerente_id)    as gerente_nome,
       r.nome as papel_nome,
       g.nome as grade_nome, g.cor as grade_cor
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  left join public.roles r on r.codigo = p.papel
  left join public.commission_grades g on g.codigo = p.grade_comissao
 where p.deleted_at is null;

create view public.v_presence with (security_invoker = true) as
select p.id, p.nome, p.email, p.papel, p.team_id, t.nome as team_nome, p.supervisor_id,
       private.nome_usuario(p.supervisor_id) as supervisor_nome, p.gerente_id,
       pr.visto_em, pr.entrou_em, pr.saiu_em, pr.tela, pr.dispositivo,
       case when pr.visto_em is null then 'offline'
            when pr.saiu_em is not null and pr.saiu_em >= pr.visto_em then 'offline'
            when pr.visto_em > now() - interval '2 minutes' then 'online'
            when pr.visto_em > now() - interval '15 minutes' then 'ausente'
            else 'offline' end as situacao,
       (select count(*) from public.activities a
         where a.usuario_id = p.id and a.deleted_at is null
           and a.realizado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) as atividades_hoje
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  left join public.user_presence pr on pr.usuario_id = p.id
 where p.deleted_at is null and p.status = 'ativo';

create view public.v_teams with (security_invoker = true) as
select t.*, private.nome_usuario(t.supervisor_id) as supervisor_nome, private.nome_usuario(t.gerente_id) as gerente_nome,
       (select count(*) from public.profiles p where p.team_id = t.id and p.papel = 'corretor' and p.deleted_at is null) as corretores
  from public.teams t where t.deleted_at is null;

create view public.v_leads with (security_invoker = true) as
select l.*,
       private.nome_usuario(l.corretor_id)   as corretor_nome,
       private.nome_usuario(l.supervisor_id) as supervisor_nome,
       private.nome_usuario(l.gerente_id)    as gerente_nome,
       t.nome   as team_nome,
       o.nome   as operadora_nome,
       p.nome   as produto_nome,
       src.nome as origem_nome,
       c.nome   as campanha_nome,
       st.nome  as status_nome,
       st.cor   as status_cor,
       ps.nome  as etapa_nome,
       ps.ordem as etapa_ordem,
       ps.tipo  as etapa_tipo,
       lr.nome  as motivo_perda_nome,
       round(extract(epoch from (now() - l.etapa_desde)) / 3600)::int as horas_na_etapa,
       case when l.primeiro_contato_em is not null
            then round(extract(epoch from (l.primeiro_contato_em - coalesce(l.distribuido_em, l.entrada_em))) / 60)::int end as minutos_primeiro_contato,
       ps.grupo as etapa_grupo,
       case when l.primeiro_contato_em is null and l.corretor_id is not null
            then round(extract(epoch from (now() - coalesce(l.assigned_at, l.distribuido_em, l.entrada_em))) / 60)::int end as minutos_aguardando,
       im.id as implantacao_id, im.sale_id as implantacao_sale_id, im.etapa as implantacao_etapa,
       im.etapa_nome as implantacao_etapa_nome, im.etapa_cor as implantacao_etapa_cor, im.status_venda as implantacao_status_venda
  from public.leads l
  left join lateral (
    select i.id, i.sale_id, i.etapa, ist.nome as etapa_nome, ist.cor as etapa_cor, ist.status_venda
      from public.implementations i
      join public.sales s on s.id = i.sale_id and s.deleted_at is null
      left join public.implementation_stages ist on ist.codigo = i.etapa
     where i.lead_id = l.id and i.deleted_at is null
     order by i.created_at desc limit 1) im on true
  left join public.teams t          on t.id  = l.team_id
  left join public.operators o      on o.id  = l.operator_id
  left join public.products p       on p.id  = l.product_id
  left join public.lead_sources src on src.id = l.source_id
  left join public.campaigns c      on c.id  = l.campaign_id
  left join public.lead_statuses st on st.codigo = l.status
  left join public.pipeline_stages ps on ps.codigo = l.etapa
  left join public.loss_reasons lr  on lr.id = l.loss_reason_id
 where l.deleted_at is null;

create view public.v_clients with (security_invoker = true) as
select c.*,
       private.nome_usuario(c.corretor_id)   as corretor_nome,
       private.nome_usuario(c.supervisor_id) as supervisor_nome,
       private.nome_usuario(c.gerente_id)    as gerente_nome,
       o.nome as operadora_nome, p.nome as produto_nome,
       (select count(*) from public.dependents d where d.client_id = c.id and d.deleted_at is null) as dependentes
  from public.clients c
  left join public.operators o on o.id = c.operator_id
  left join public.products p  on p.id = c.product_id
 where c.deleted_at is null;

create view public.v_sales with (security_invoker = true) as
select s.*,
       cl.nome as cliente_nome, cl.cpf as cliente_cpf, cl.cnpj as cliente_cnpj,
       private.nome_usuario(s.corretor_id)   as corretor_nome,
       private.nome_usuario(s.supervisor_id) as supervisor_nome,
       private.nome_usuario(s.gerente_id)    as gerente_nome,
       o.nome as operadora_nome, p.nome as produto_nome, src.nome as origem_nome, cp.nome as campanha_nome,
       i.etapa as implantacao_etapa,
       (select count(*) from public.pendencies pe where pe.sale_id = s.id and pe.status = 'aberta' and pe.deleted_at is null) as pendencias_abertas,
       t.nome as team_nome, ist.nome as implantacao_etapa_nome
  from public.sales s
  left join public.clients cl       on cl.id = s.client_id
  left join public.operators o      on o.id = s.operator_id
  left join public.products p       on p.id = s.product_id
  left join public.lead_sources src on src.id = s.source_id
  left join public.campaigns cp     on cp.id = s.campaign_id
  left join public.implementations i on i.sale_id = s.id
  left join public.implementation_stages ist on ist.codigo = i.etapa
  left join public.teams t          on t.id = s.team_id
 where s.deleted_at is null;

create view public.v_quotes with (security_invoker = true) as
select q.*, l.nome as lead_nome, o.nome as operadora_nome, p.nome as produto_nome, private.nome_usuario(q.corretor_id) as corretor_nome
  from public.quotes q
  left join public.leads l on l.id = q.lead_id
  left join public.operators o on o.id = q.operator_id
  left join public.products p on p.id = q.product_id
 where q.deleted_at is null;

create view public.v_proposals with (security_invoker = true) as
select pr.*, coalesce(l.nome, cl.nome) as nome_contato, l.nome as lead_nome, cl.nome as cliente_nome,
       o.nome as operadora_nome, p.nome as produto_nome, private.nome_usuario(pr.corretor_id) as corretor_nome,
       round(extract(epoch from (now() - pr.status_desde)) / 3600)::int as horas_no_status
  from public.proposals pr
  left join public.leads l on l.id = pr.lead_id
  left join public.clients cl on cl.id = pr.client_id
  left join public.operators o on o.id = pr.operator_id
  left join public.products p on p.id = pr.product_id
 where pr.deleted_at is null;

create view public.v_implementations with (security_invoker = true) as
select i.*, s.operator_id, s.product_id, s.valor_mensal, s.num_vidas, s.numero_proposta, s.data_venda, s.status as venda_status, s.vigencia,
       cl.nome as cliente_nome, o.nome as operadora_nome, p.nome as produto_nome,
       private.nome_usuario(i.corretor_id) as corretor_nome, private.nome_usuario(i.responsavel_id) as responsavel_nome,
       (select count(*) from public.pendencies pe where pe.sale_id = i.sale_id and pe.status = 'aberta' and pe.deleted_at is null) as pendencias_abertas,
       round(extract(epoch from (now() - i.etapa_desde)) / 3600)::int as horas_na_etapa,
       ist.nome as etapa_nome, ist.cor as etapa_cor, ist.ordem as etapa_ordem, ist.status_venda as etapa_status_venda
  from public.implementations i
  join public.sales s on s.id = i.sale_id
  left join public.clients cl on cl.id = i.client_id
  left join public.operators o on o.id = s.operator_id
  left join public.products p on p.id = s.product_id
  left join public.implementation_stages ist on ist.codigo = i.etapa
 where i.deleted_at is null and s.deleted_at is null;

create view public.v_implementation_events with (security_invoker = true) as
select e.*, private.nome_usuario(e.usuario_id) as usuario_nome from public.implementation_events e;

create view public.v_pendencies with (security_invoker = true) as
select pe.*, coalesce(cl.nome, l.nome) as nome_contato, private.nome_usuario(pe.corretor_id) as corretor_nome,
       (pe.status = 'aberta' and pe.prazo < current_date) as atrasada
  from public.pendencies pe
  left join public.clients cl on cl.id = pe.client_id
  left join public.leads l on l.id = pe.lead_id
 where pe.deleted_at is null;

create view public.v_followups with (security_invoker = true) as
select f.*,
       coalesce(l.nome, cl.nome) as nome_contato,
       coalesce(l.whatsapp, l.telefone, cl.whatsapp, cl.telefone) as telefone_contato,
       l.temperatura as lead_temperatura,
       private.nome_usuario(f.responsavel_id) as responsavel_nome,
       private.nome_usuario(f.corretor_id)    as corretor_nome,
       case when f.status <> 'pendente' then f.status
            when f.agendado_para < now() then 'atrasado'
            when (f.agendado_para at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date then 'hoje'
            else 'proximo' end as situacao
  from public.followups f
  left join public.leads l on l.id = f.lead_id
  left join public.clients cl on cl.id = f.client_id
 where f.deleted_at is null;

create view public.v_tasks with (security_invoker = true) as
select t.*, coalesce(l.nome, cl.nome) as nome_contato,
       private.nome_usuario(t.responsavel_id) as responsavel_nome,
       private.nome_usuario(t.created_by)     as criado_por_nome,
       (t.status in ('aberta','em_andamento') and t.prazo < now()) as atrasada
  from public.tasks t
  left join public.leads l on l.id = t.lead_id
  left join public.clients cl on cl.id = t.client_id
 where t.deleted_at is null;

create view public.v_events with (security_invoker = true) as
select e.*, coalesce(l.nome, cl.nome) as nome_contato, private.nome_usuario(e.responsavel_id) as responsavel_nome,
       private.nome_usuario(e.created_by) as organizador_nome,
       (select count(*) from public.event_participants p where p.event_id = e.id) as convidados,
       (select count(*) from public.event_participants p where p.event_id = e.id and p.resposta = 'aceito') as confirmados,
       (select p.resposta from public.event_participants p where p.event_id = e.id and p.usuario_id = auth.uid()) as minha_resposta
  from public.events e
  left join public.leads l on l.id = e.lead_id
  left join public.clients cl on cl.id = e.client_id
 where e.deleted_at is null;

create view public.v_event_participants with (security_invoker = true) as
select ep.*, private.nome_usuario(ep.usuario_id) as usuario_nome, pf.email as usuario_email, pf.papel as usuario_papel,
       tm.nome as usuario_equipe
  from public.event_participants ep
  left join public.profiles pf on pf.id = ep.usuario_id
  left join public.teams tm on tm.id = pf.team_id;

create view public.v_activities with (security_invoker = true) as
select a.*, coalesce(l.nome, cl.nome) as nome_contato, private.nome_usuario(a.usuario_id) as usuario_nome
  from public.activities a
  left join public.leads l on l.id = a.lead_id
  left join public.clients cl on cl.id = a.client_id
 where a.deleted_at is null;

create view public.v_notes with (security_invoker = true) as
select n.*, private.nome_usuario(n.autor_id) as autor_nome from public.notes n where n.deleted_at is null;

create view public.v_documents with (security_invoker = true) as
select d.*, private.nome_usuario(d.enviado_por) as enviado_por_nome from public.documents d where d.deleted_at is null;

create view public.v_lead_history with (security_invoker = true) as
select h.*, coalesce(private.nome_usuario(h.usuario_id), 'Sistema') as usuario_nome from public.lead_history h;

create view public.v_lead_assignments with (security_invoker = true) as
select a.*, private.nome_usuario(a.corretor_anterior) as anterior_nome, private.nome_usuario(a.corretor_novo) as novo_nome,
       coalesce(private.nome_usuario(a.distribuido_por), 'Sistema') as distribuido_por_nome
  from public.lead_assignments a;

create view public.v_commissions with (security_invoker = true) as
select c.*, cl.nome as cliente_nome, o.nome as operadora_nome, s.data_venda, s.numero_proposta,
       private.nome_usuario(c.corretor_id) as corretor_nome, private.nome_usuario(c.supervisor_id) as supervisor_nome,
       g.nome as grade_nome, pr.nome as produto_nome
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  left join public.clients cl on cl.id = c.client_id
  left join public.operators o on o.id = c.operator_id
  left join public.commission_grades g on g.codigo = c.grade
  left join public.products pr on pr.id = s.product_id
 where c.deleted_at is null;

create view public.v_commission_grid with (security_invoker = true) as
select gr.*, p.nome as produto_nome, p.operator_id, o.nome as operadora_nome, p.tipo as produto_tipo, p.ativo as produto_ativo,
       case gr.beneficiario when 'corretora' then 'Corretora' when 'supervisor' then 'Supervisor' else cg.nome end as beneficiario_nome,
       cg.ordem as grade_ordem
  from public.product_commission_grid gr
  join public.products p on p.id = gr.product_id
  join public.operators o on o.id = p.operator_id
  left join public.commission_grades cg on cg.codigo = gr.beneficiario
 where p.deleted_at is null;

create view public.v_products with (security_invoker = true) as
select p.*, o.nome as operadora_nome,
       (select count(distinct gr.parcela) from public.product_commission_grid gr where gr.product_id = p.id and gr.beneficiario = 'corretora') as grade_parcelas
  from public.products p join public.operators o on o.id = p.operator_id where p.deleted_at is null;

create view public.v_campaigns with (security_invoker = true) as
select c.*, s.nome as origem_nome from public.campaigns c left join public.lead_sources s on s.id = c.source_id where c.deleted_at is null;

create view public.v_goals with (security_invoker = true) as
select g.*, private.nome_usuario(g.usuario_id) as usuario_nome, t.nome as equipe_nome, o.nome as operadora_nome, p.nome as produto_nome
  from public.goals g
  left join public.teams t on t.id = g.goal_team_id
  left join public.operators o on o.id = g.operator_id
  left join public.products p on p.id = g.product_id
 where g.deleted_at is null;

create view public.v_dependents with (security_invoker = true) as
select d.*, p.nome as produto_nome from public.dependents d left join public.products p on p.id = d.product_id where d.deleted_at is null;

create view public.v_relacionamento with (security_invoker = true) as
select c.id, c.nome, c.tipo_pessoa, c.razao_social, c.whatsapp, c.telefone, c.email, c.data_nascimento, c.status, c.vigencia, c.num_vidas,
       c.corretor_id, c.supervisor_id, c.gerente_id, c.team_id, c.created_at, c.lembrete_contato_em, c.aniversario_avisado_em,
       private.nome_usuario(c.corretor_id) as corretor_nome, o.nome as operadora_nome, p.nome as produto_nome,
       u.ultimo_contato_em,
       (private.hoje_sp() - coalesce(u.ultimo_contato_em, c.created_at)::date) as dias_sem_contato,
       private.proximo_aniversario(c.data_nascimento, private.hoje_sp()) as proximo_aniversario,
       (private.proximo_aniversario(c.data_nascimento, private.hoje_sp()) - private.hoje_sp()) as dias_para_aniversario,
       case when c.data_nascimento is not null then extract(year from age(private.proximo_aniversario(c.data_nascimento, private.hoje_sp()), c.data_nascimento))::int end as idade_no_aniversario
  from public.clients c
  left join public.operators o on o.id = c.operator_id
  left join public.products p on p.id = c.product_id
  left join lateral (select max(a.realizado_em) as ultimo_contato_em from public.activities a where a.client_id = c.id and a.deleted_at is null and a.efetivo) u on true
 where c.deleted_at is null and c.status <> 'cancelado' and c.anonimizado_em is null;

create view public.v_aniversarios_dependentes with (security_invoker = true) as
select d.id, d.nome, d.parentesco, d.data_nascimento, d.client_id, c.nome as cliente_nome, c.whatsapp, c.telefone, c.corretor_id, c.supervisor_id, c.gerente_id, c.team_id,
       private.nome_usuario(c.corretor_id) as corretor_nome, o.nome as operadora_nome,
       private.proximo_aniversario(d.data_nascimento, private.hoje_sp()) as proximo_aniversario,
       (private.proximo_aniversario(d.data_nascimento, private.hoje_sp()) - private.hoje_sp()) as dias_para_aniversario,
       extract(year from age(private.proximo_aniversario(d.data_nascimento, private.hoje_sp()), d.data_nascimento))::int as idade_no_aniversario
  from public.dependents d
  join public.clients c on c.id = d.client_id
  left join public.operators o on o.id = c.operator_id
 where d.deleted_at is null and d.status <> 'cancelado' and d.data_nascimento is not null and c.deleted_at is null and c.status <> 'cancelado';

create view public.v_audit_logs with (security_invoker = true) as
select a.*, coalesce(private.nome_usuario(a.usuario_id), 'Sistema') as usuario_nome from public.audit_logs a;

create view public.v_distribution_rules with (security_invoker = true) as
select r.*, s.nome as origem_nome, c.nome as campanha_nome, p.nome as produto_nome, t.nome as equipe_nome,
       private.nome_usuario(r.corretor_id) as corretor_nome
  from public.distribution_rules r
  left join public.lead_sources s on s.id = r.source_id
  left join public.campaigns c on c.id = r.campaign_id
  left join public.products p on p.id = r.product_id
  left join public.teams t on t.id = r.team_id;

create view public.v_commission_rules with (security_invoker = true) as
select r.*, o.nome as operadora_nome, p.nome as produto_nome, private.nome_usuario(r.corretor_id) as corretor_nome,
       private.nome_usuario(r.supervisor_id) as supervisor_nome, c.nome as campanha_nome
  from public.commission_rules r
  left join public.operators o on o.id = r.operator_id
  left join public.products p on p.id = r.product_id
  left join public.campaigns c on c.id = r.campaign_id;

grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- =====================================================================
-- G. RPCs NOVAS
-- =====================================================================

-- G0. Comissões do corretor/supervisor: parcela sem valor não aparece --
create or replace function public.minhas_comissoes(p_inicio date default null, p_fim date default null)
returns table(id uuid, sale_id uuid, cliente_nome text, operadora_nome text, parcela int, valor_venda numeric,
              minha_comissao numeric, data_prevista date, data_recebida date, status text)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from (
    select c.id, c.sale_id, cl.nome as cliente_nome, o.nome as operadora_nome, c.parcela, c.valor_venda,
           case when c.corretor_id = auth.uid() then c.comissao_corretor else c.comissao_supervisor end as minha_comissao,
           c.data_prevista, c.data_recebida, c.status
      from public.commissions c
      left join public.clients cl on cl.id = c.client_id
      left join public.operators o on o.id = c.operator_id
     where c.deleted_at is null
       and private.papel() is not null
       and (c.corretor_id = auth.uid() or (c.supervisor_id = auth.uid() and private.papel() = 'supervisor'))
       and (p_inicio is null or c.data_prevista >= p_inicio)
       and (p_fim is null or c.data_prevista <= p_fim)) x
   where coalesce(x.minha_comissao, 0) > 0
   order by min(x.data_prevista) over (partition by x.sale_id) desc, x.sale_id, x.parcela
$$;

create or replace function public.processar_alertas()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg jsonb := private.setting('leads_parados', '{"alerta_corretor_horas":24,"alerta_supervisor_horas":48,"redistribuir_horas":72,"redistribuir_auto":false}');
  h1 interval := make_interval(hours => (cfg->>'alerta_corretor_horas')::int);
  h2 interval := make_interval(hours => (cfg->>'alerta_supervisor_horas')::int);
  h3 interval := make_interval(hours => (cfg->>'redistribuir_horas')::int);
  l record; fu record; pr record; g record; n1 int := 0; n2 int := 0; n3 int := 0; n4 int := 0; e record;
begin
  if auth.uid() is not null and coalesce(private.papel(), '') <> 'admin' then
    raise exception 'Rotina reservada ao sistema' using errcode = '42501';
  end if;

  for l in select le.* from public.leads le join public.pipeline_stages ps on ps.codigo = le.etapa
            where le.deleted_at is null and ps.tipo = 'aberto' and le.corretor_id is not null
              and coalesce(le.ultimo_contato_em, le.distribuido_em, le.entrada_em) < now() - h1 and le.alerta_nivel < 3 loop
    if coalesce(l.ultimo_contato_em, l.distribuido_em, l.entrada_em) < now() - h3 and l.alerta_nivel < 3 then
      perform private.notificar(l.supervisor_id, 'lead_parado', 'Lead elegível para redistribuição', l.nome || ' — sem movimentação', '#/leads/' || l.id, l.id);
      update public.leads set alerta_nivel = 3 where id = l.id;
      if coalesce((cfg->>'redistribuir_auto')::boolean, false) then
        select * into e from private.escolher_corretor(l.id, l.corretor_id);
        if e.corretor is not null then perform private.atribuir(l.id, e.corretor, 'Redistribuição automática por inatividade', 'redistribuicao'); end if;
      end if;
      n3 := n3 + 1;
    elsif coalesce(l.ultimo_contato_em, l.distribuido_em, l.entrada_em) < now() - h2 and l.alerta_nivel < 2 then
      perform private.notificar(l.supervisor_id, 'lead_parado', 'Lead sem atendimento na equipe', l.nome || ' — ' || coalesce(private.nome_usuario(l.corretor_id), ''), '#/leads/' || l.id, l.id);
      update public.leads set alerta_nivel = 2 where id = l.id;
      n2 := n2 + 1;
    elsif l.alerta_nivel < 1 then
      perform private.notificar(l.corretor_id, 'lead_sem_atendimento', 'Lead sem atendimento', l.nome, '#/leads/' || l.id, l.id);
      update public.leads set alerta_nivel = 1 where id = l.id;
      n1 := n1 + 1;
    end if;
  end loop;

  -- lembretes e follow-ups vencidos
  for fu in select f.*, coalesce(le.nome, cl.nome) contato from public.followups f
              left join public.leads le on le.id = f.lead_id left join public.clients cl on cl.id = f.client_id
             where f.status = 'pendente' and f.deleted_at is null and f.alerta_enviado < 2
               and f.agendado_para < now() + make_interval(mins => coalesce(f.lembrete_min, 15)) loop
    if fu.agendado_para < now() then
      perform private.notificar(coalesce(fu.responsavel_id, fu.corretor_id), 'followup_vencido', 'Follow-up vencido', fu.contato, case when fu.lead_id is not null then '#/leads/' || fu.lead_id end, fu.id);
      update public.followups set alerta_enviado = 2 where id = fu.id;
    elsif fu.alerta_enviado < 1 then
      perform private.notificar(coalesce(fu.responsavel_id, fu.corretor_id), 'followup_proximo', 'Follow-up em breve', fu.contato || ' às ' || to_char(fu.agendado_para at time zone 'America/Sao_Paulo', 'HH24:MI'), case when fu.lead_id is not null then '#/leads/' || fu.lead_id end, fu.id);
      update public.followups set alerta_enviado = 1 where id = fu.id;
    end if;
    n4 := n4 + 1;
  end loop;

  -- propostas paradas (> 48h) — um aviso a cada 48h
  for pr in select p.* from public.proposals p where p.deleted_at is null and p.status in ('enviada','em_analise','pendencia')
             and p.status_desde < now() - interval '48 hours'
             and not exists (select 1 from public.notifications n where n.ref_id = p.id and n.tipo = 'proposta_parada' and n.created_at > now() - interval '48 hours') loop
    perform private.notificar(pr.corretor_id, 'proposta_parada', 'Proposta parada há mais de 48h', coalesce('nº ' || pr.numero, ''), case when pr.lead_id is not null then '#/leads/' || pr.lead_id end, pr.id);
  end loop;

  -- aniversários e manter contato: ver private.lembretes_relacionamento() (rotina de 1 minuto)

  -- metas próximas (≥ 80%) e atingidas (≥ 100%)
  for g in select go.id, go.usuario_id, go.valor_meta,
                  (select coalesce(sum(s.valor_mensal), 0) from public.sales s where s.corretor_id = go.usuario_id and s.deleted_at is null
                      and s.status in ('aprovada','implantada') and date_trunc('month', s.data_venda) = go.mes) as realizado
             from public.goals go
            where go.deleted_at is null and go.escopo = 'corretor' and go.tipo = 'valor' and go.valor_meta > 0
              and go.mes = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date loop
    if g.realizado >= g.valor_meta and not exists (select 1 from public.notifications n where n.ref_id = g.id and n.tipo = 'meta_atingida') then
      perform private.notificar(g.usuario_id, 'meta_atingida', 'Meta do mês atingida! 🎯', null, '#/metas', g.id);
    elsif g.realizado >= 0.8 * g.valor_meta and g.realizado < g.valor_meta and not exists (select 1 from public.notifications n where n.ref_id = g.id and n.tipo = 'meta_proxima') then
      perform private.notificar(g.usuario_id, 'meta_proxima', 'Você está a menos de 20% da meta', null, '#/metas', g.id);
    end if;
  end loop;

  return jsonb_build_object('alertas_corretor', n1, 'alertas_supervisor', n2, 'redistribuiveis', n3, 'followups', n4);
end $$;

-- Lembretes de relacionamento (uma vez por dia, a partir da hora configurada)
create or replace function private.lembretes_relacionamento(p_forcar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg jsonb := private.setting('relacionamento', '{}');
  v_hoje date := private.hoje_sp();
  v_alvo date := private.hoje_sp() + coalesce((cfg->>'aniversario_dias_antes')::int, 0);
  v_dias int := greatest(7, coalesce((cfg->>'contato_dias')::int, 60));
  v_max int := greatest(1, coalesce((cfg->>'contato_max_dia')::int, 5));
  c record; n_aniv int := 0; n_dep int := 0; n_cont int := 0; v_quando text;
begin
  if not p_forcar then
    if coalesce(private.setting('relacionamento_ultimo') #>> '{}', '') = v_hoje::text then return jsonb_build_object('executado', false); end if;
    if extract(hour from now() at time zone 'America/Sao_Paulo') < coalesce((cfg->>'hora')::int, 8) then return jsonb_build_object('executado', false); end if;
  end if;
  insert into public.settings(chave, valor, descricao) values ('relacionamento_ultimo', to_jsonb(v_hoje::text), 'Controle interno')
  on conflict (chave) do update set valor = excluded.valor, updated_at = now();
  v_quando := case when v_alvo = v_hoje then 'hoje' when v_alvo = v_hoje + 1 then 'amanhã' else to_char(v_alvo, 'DD/MM') end;

  if coalesce((cfg->>'aniversario')::boolean, true) then
    for c in select cl.* from public.clients cl
              where cl.deleted_at is null and cl.corretor_id is not null and cl.status <> 'cancelado' and cl.anonimizado_em is null
                and private.proximo_aniversario(cl.data_nascimento, v_hoje) = v_alvo
                and coalesce(cl.aniversario_avisado_em, '1900-01-01') < v_hoje - 300 loop
      perform private.notificar(c.corretor_id, 'aniversario', 'Aniversário ' || v_quando || ': ' || c.nome,
        'Mensagem de parabéns pronta para enviar' || coalesce(' · ' || (extract(year from age(v_alvo, c.data_nascimento))::int) || ' anos', ''),
        '#/relacionamento?cliente=' || c.id || '&msg=aniversario', c.id);
      update public.clients set aniversario_avisado_em = v_hoje where id = c.id;
      n_aniv := n_aniv + 1;
    end loop;
    if coalesce((cfg->>'dependentes')::boolean, true) then
      for c in select d.id, d.nome, d.client_id, cl.nome as cliente, cl.corretor_id from public.dependents d join public.clients cl on cl.id = d.client_id
                where d.deleted_at is null and d.status <> 'cancelado' and cl.deleted_at is null and cl.corretor_id is not null and cl.status <> 'cancelado'
                  and private.proximo_aniversario(d.data_nascimento, v_hoje) = v_alvo
                  and coalesce(d.aniversario_avisado_em, '1900-01-01') < v_hoje - 300 loop
        perform private.notificar(c.corretor_id, 'aniversario', 'Aniversário ' || v_quando || ': ' || c.nome || ' (dependente)',
          'Família de ' || c.cliente || ' · mensagem pronta para enviar', '#/relacionamento?cliente=' || c.client_id || '&msg=aniversario_dependente&dep=' || c.id, c.client_id);
        update public.dependents set aniversario_avisado_em = v_hoje where id = c.id;
        n_dep := n_dep + 1;
      end loop;
    end if;
  end if;

  if coalesce((cfg->>'contato')::boolean, true) then
    for c in select * from (
               select cl.id, cl.nome, cl.corretor_id,
                      (v_hoje - coalesce((select max(a.realizado_em) from public.activities a where a.client_id = cl.id and a.deleted_at is null and a.efetivo), cl.created_at)::date) as dias,
                      row_number() over (partition by cl.corretor_id order by coalesce((select max(a.realizado_em) from public.activities a where a.client_id = cl.id and a.deleted_at is null and a.efetivo), cl.created_at)) as ordem
                 from public.clients cl
                where cl.deleted_at is null and cl.corretor_id is not null and cl.status in ('ativo','renovacao','migracao','inadimplente') and cl.anonimizado_em is null
                  and (cl.lembrete_contato_em is null or cl.lembrete_contato_em < now() - make_interval(days => v_dias))) x
             where x.dias >= v_dias and x.ordem <= v_max loop
      perform private.notificar(c.corretor_id, 'manter_contato', 'Hora de falar com ' || c.nome, 'Sem contato há ' || c.dias || ' dias · mensagem pronta para enviar',
        '#/relacionamento?cliente=' || c.id || '&msg=contato', c.id);
      update public.clients set lembrete_contato_em = now() where id = c.id;
      n_cont := n_cont + 1;
    end loop;
  end if;
  return jsonb_build_object('executado', true, 'aniversarios', n_aniv, 'dependentes', n_dep, 'contato', n_cont);
end $$;

create or replace function public.executar_lembretes_relacionamento()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(private.papel(), '') <> 'admin' then raise exception 'Somente o administrador executa a rotina manualmente' using errcode = '42501'; end if;
  return private.lembretes_relacionamento(true);
end $$;

-- Ranking comercial (somente totais por corretor; nenhum dado de lead ou cliente)
create or replace function public.ranking_comercial(p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_papel text := private.papel(); v_uid uuid := auth.uid();
  v_vis text := coalesce(private.setting('ranking', '{}')->>'visibilidade', 'empresa');
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_ganho text[] := private.etapas_do_grupo('ganho'); r jsonb;
begin
  if v_papel is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by x.valor desc, x.nome), '[]') into r from (
    select c.id, c.nome, c.team_id, t.nome as equipe, t.logo as equipe_logo, t.cor as equipe_cor,
           c.supervisor_id, private.nome_usuario(c.supervisor_id) as supervisor, c.gerente_id, private.nome_usuario(c.gerente_id) as gerente,
           case when v_papel <> 'corretor' and private.pode_ver_perfil(c.id) then c.grade_comissao end as grade,
           (c.id = v_uid) as eu,
           sv.vendas, sv.valor, sv.vidas, lr.leads, lr.convertidos,
           case when lr.leads = 0 then 0 else round(100.0 * lr.convertidos / lr.leads, 1) end as conversao,
           (select sum(g.valor_meta) from public.goals g where g.deleted_at is null and g.escopo = 'corretor' and g.usuario_id = c.id and g.tipo = 'valor'
               and g.mes = date_trunc('month', p_fim)::date) as meta,
           (select coalesce(sum(s2.valor_mensal), 0) from public.sales s2 where s2.corretor_id = c.id and s2.deleted_at is null and s2.status in ('aprovada','implantada')
               and s2.data_venda >= date_trunc('month', p_fim)::date and s2.data_venda < (date_trunc('month', p_fim) + interval '1 month')::date) as realizado_mes
      from public.profiles c
      left join public.teams t on t.id = c.team_id
      cross join lateral (select count(*) as vendas, coalesce(sum(s.valor_mensal), 0) as valor, coalesce(sum(s.num_vidas), 0) as vidas
                            from public.sales s where s.corretor_id = c.id and s.deleted_at is null and s.status in ('aprovada','implantada')
                             and s.data_venda between p_inicio and p_fim) sv
      cross join lateral (select count(*) as leads, count(*) filter (where l.client_id is not null or l.etapa = any(v_ganho)) as convertidos
                            from public.leads l where l.corretor_id = c.id and l.deleted_at is null and l.entrada_em >= v_ini and l.entrada_em < v_fim) lr
     where c.papel = 'corretor' and c.status = 'ativo' and c.deleted_at is null
       and (v_vis = 'empresa' or v_papel = 'admin' or c.id = v_uid
            or (v_papel = 'gerente' and c.gerente_id = v_uid) or (v_papel = 'supervisor' and c.supervisor_id = v_uid))) x;
  return r;
end $$;

-- G1. Grade de comissão ----------------------------------------------
-- p_linhas: [{beneficiario, parcela, percentual}]  (substitui a grade do produto)
create or replace function public.salvar_grade_produto(p_product uuid, p_linhas jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; n int := 0; v_b text;
begin
  if coalesce(private.papel(), '') <> 'admin' then
    raise exception 'Somente o administrador altera a grade de comissão' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products where id = p_product and deleted_at is null) then
    raise exception 'Produto não encontrado' using errcode = '23503';
  end if;
  delete from public.product_commission_grid where product_id = p_product;
  for r in select * from jsonb_array_elements(coalesce(p_linhas, '[]')) loop
    v_b := lower(trim(r->>'beneficiario'));
    -- em branco ou zero = sem comissão nesta parcela (não é gravado)
    if coalesce(r->>'percentual', '') = '' or replace(r->>'percentual', ',', '.')::numeric = 0 then continue; end if;
    if v_b not in ('corretora','supervisor') and not exists (select 1 from public.commission_grades where codigo = v_b) then
      raise exception 'Grade "%" não existe', v_b using errcode = '23503';
    end if;
    if coalesce((r->>'parcela')::int, 0) not between 1 and 3 then
      raise exception 'A grade aceita no máximo 3 parcelas (informada: %ª)', r->>'parcela' using errcode = '23514';
    end if;
    if (r->>'percentual')::numeric < 0 then
      raise exception 'Percentual não pode ser negativo' using errcode = '23514';
    end if;
    insert into public.product_commission_grid(product_id, beneficiario, parcela, percentual)
    values (p_product, v_b, (r->>'parcela')::int, (r->>'percentual')::numeric);
    n := n + 1;
  end loop;
  if n > 0 and not exists (select 1 from public.product_commission_grid where product_id = p_product and beneficiario = 'corretora') then
    raise exception 'Informe quanto a corretora recebe em cada parcela (coluna Corretora)' using errcode = '23514';
  end if;
  insert into public.audit_logs(usuario_id, acao, tabela, registro_id, novo)
  values (auth.uid(), 'grade_comissao', 'products', p_product, jsonb_build_object('linhas', p_linhas));
  return n;
end $$;

-- p_linhas: [{operadora, produto, parcela, valores:{corretora:..., supervisor:..., ouro:..., ...}}]
create or replace function public.importar_grade_comissao(p_linhas jsonb, p_criar_produtos boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; k text; v text; v_op uuid; v_prod uuid; v_chave text;
        v_mapa jsonb := '{}'; v_nao jsonb := '[]'; v_criados int := 0; v_atual int := 0; v_linhas int := 0; v_prods uuid[] := '{}';
begin
  if coalesce(private.papel(), '') <> 'admin' then
    raise exception 'Somente o administrador importa a grade de comissão' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_linhas, '[]')) loop
    if coalesce(trim(r->>'produto'), '') = '' or coalesce(r->>'parcela', '') = '' then continue; end if;
    if (r->>'parcela')::int not between 1 and 3 then
      raise exception 'Produto "%": a grade aceita no máximo 3 parcelas (a planilha tem a %ª)', r->>'produto', r->>'parcela' using errcode = '23514';
    end if;
    v_chave := lower(trim(coalesce(r->>'operadora', ''))) || '|' || lower(trim(r->>'produto'));
    if v_mapa ? v_chave then
      v_prod := (v_mapa->>v_chave)::uuid;
    else
      select id into v_op from public.operators where lower(nome) = lower(trim(r->>'operadora')) and deleted_at is null limit 1;
      v_prod := null;
      if v_op is not null then
        select id into v_prod from public.products where operator_id = v_op and lower(nome) = lower(trim(r->>'produto')) and deleted_at is null limit 1;
      else
        select id into v_prod from public.products where lower(nome) = lower(trim(r->>'produto')) and deleted_at is null limit 1;
      end if;
      if v_prod is null and p_criar_produtos and coalesce(trim(r->>'operadora'), '') <> '' then
        if v_op is null then
          insert into public.operators(nome) values (trim(r->>'operadora')) returning id into v_op;
        end if;
        insert into public.products(operator_id, nome) values (v_op, trim(r->>'produto')) returning id into v_prod;
        v_criados := v_criados + 1;
      end if;
      if v_prod is null then
        v_nao := v_nao || jsonb_build_object('operadora', r->>'operadora', 'produto', r->>'produto');
        v_mapa := v_mapa || jsonb_build_object(v_chave, null);
        continue;
      end if;
      v_mapa := v_mapa || jsonb_build_object(v_chave, v_prod);
      delete from public.product_commission_grid where product_id = v_prod;
      v_prods := v_prods || v_prod;
    end if;
    if v_prod is null then continue; end if;
    for k, v in select * from jsonb_each_text(coalesce(r->'valores', '{}')) loop
      if coalesce(trim(v), '') = '' or replace(trim(v), ',', '.')::numeric = 0 then continue; end if;
      k := lower(trim(k));
      if k not in ('corretora','supervisor') and not exists (select 1 from public.commission_grades where codigo = k) then continue; end if;
      insert into public.product_commission_grid(product_id, beneficiario, parcela, percentual)
      values (v_prod, k, (r->>'parcela')::int, replace(v, ',', '.')::numeric)
      on conflict (product_id, beneficiario, parcela) do update set percentual = excluded.percentual;
      v_linhas := v_linhas + 1;
    end loop;
  end loop;
  v_atual := coalesce(array_length(v_prods, 1), 0);
  insert into public.audit_logs(usuario_id, acao, tabela, novo)
  values (auth.uid(), 'grade_comissao_importacao', 'product_commission_grid',
          jsonb_build_object('produtos', v_atual, 'criados', v_criados, 'valores', v_linhas));
  return jsonb_build_object('produtos', v_atual, 'criados', v_criados, 'valores', v_linhas, 'nao_encontrados', v_nao);
end $$;

create or replace function public.excluir_grade(p_codigo text, p_destino text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(private.papel(), '') <> 'admin' then raise exception 'Somente o administrador exclui grades' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where grade_comissao = p_codigo and deleted_at is null) then
    if p_destino is null or p_destino = p_codigo or not exists (select 1 from public.commission_grades where codigo = p_destino) then
      raise exception 'Escolha a grade para onde os corretores desta grade serão movidos' using errcode = '23514';
    end if;
    update public.profiles set grade_comissao = p_destino where grade_comissao = p_codigo;
  end if;
  delete from public.product_commission_grid where beneficiario = p_codigo;
  update public.commissions set grade = null where grade = p_codigo;
  delete from public.commission_grades where codigo = p_codigo;
end $$;

-- G2. Exclusão de etapas e status (com transferência dos registros) ----
create or replace function public.excluir_etapa_crm(p_codigo text, p_destino text default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.pipeline_stages; d public.pipeline_stages; n int := 0;
begin
  if coalesce(private.papel(), '') <> 'admin' then raise exception 'Somente o administrador exclui etapas' using errcode = '42501'; end if;
  select * into s from public.pipeline_stages where codigo = p_codigo;
  if not found then raise exception 'Etapa não encontrada' using errcode = '23503'; end if;
  if s.sistema then
    raise exception 'A etapa "%" é usada pelas automações. Você pode renomear, mudar cor e ordem, mas não excluir.', s.nome using errcode = '23514';
  end if;
  select * into d from public.pipeline_stages where codigo = p_destino and codigo <> p_codigo;
  if not found then raise exception 'Escolha a etapa que vai receber os leads e os status desta etapa' using errcode = '23514'; end if;
  perform set_config('atos.motivo', 'Etapa "' || s.nome || '" excluída', true);
  insert into public.lead_history(lead_id, tipo, titulo, usuario_id)
  select id, 'etapa', 'Etapa "' || s.nome || '" excluída — lead movido para "' || d.nome || '"', auth.uid()
    from public.leads where etapa = s.codigo;
  get diagnostics n = row_count;
  -- os status da etapa passam para a etapa destino (os leads acompanham)
  update public.lead_statuses set etapa = d.codigo where etapa = s.codigo and not sistema;
  update public.leads set etapa = d.codigo where etapa = s.codigo;
  update public.pipeline_stages set status_padrao = d.status_padrao where status_padrao in (select codigo from public.lead_statuses where etapa = s.codigo);
  delete from public.pipeline_stages where codigo = s.codigo;
  perform set_config('atos.motivo', '', true);
  return n;
end $$;

create or replace function public.excluir_status_lead(p_codigo text, p_destino text default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.lead_statuses; d public.lead_statuses; n int := 0;
begin
  if coalesce(private.papel(), '') <> 'admin' then raise exception 'Somente o administrador exclui status' using errcode = '42501'; end if;
  select * into s from public.lead_statuses where codigo = p_codigo;
  if not found then raise exception 'Status não encontrado' using errcode = '23503'; end if;
  if s.sistema then
    raise exception 'O status "%" é usado pelas automações. Você pode renomear e mudar a cor, mas não excluir.', s.nome using errcode = '23514';
  end if;
  if not exists (select 1 from public.lead_statuses where etapa = s.etapa and codigo <> s.codigo) then
    raise exception 'Este é o único status da etapa. Crie outro status nela ou exclua a etapa.' using errcode = '23514';
  end if;
  select * into d from public.lead_statuses where codigo = p_destino and codigo <> p_codigo;
  if exists (select 1 from public.leads where status = s.codigo) then
    if not found then raise exception 'Escolha o status que vai receber os leads' using errcode = '23514'; end if;
    if d.exige_motivo and not s.exige_motivo then
      raise exception 'Escolha um status de destino que não exija motivo de perda' using errcode = '23514';
    end if;
    insert into public.lead_history(lead_id, tipo, titulo, usuario_id)
    select id, 'status', 'Status "' || s.nome || '" excluído — lead passou para "' || d.nome || '"', auth.uid()
      from public.leads where status = s.codigo;
    update public.leads set status = d.codigo where status = s.codigo;
    get diagnostics n = row_count;
  end if;
  update public.pipeline_stages set status_padrao = coalesce(d.codigo, (select codigo from public.lead_statuses where etapa = s.etapa and codigo <> s.codigo order by ordem limit 1))
   where status_padrao = s.codigo;
  delete from public.lead_statuses where codigo = s.codigo;
  return n;
end $$;

create or replace function public.excluir_etapa_implantacao(p_codigo text, p_destino text default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.implementation_stages; d public.implementation_stages; n int := 0;
begin
  if coalesce(private.papel(), '') <> 'admin' then raise exception 'Somente o administrador exclui etapas' using errcode = '42501'; end if;
  select * into s from public.implementation_stages where codigo = p_codigo;
  if not found then raise exception 'Etapa não encontrada' using errcode = '23503'; end if;
  if s.sistema then
    raise exception 'A etapa "%" é usada pelas automações. Você pode renomear, mudar cor e ordem, mas não excluir.', s.nome using errcode = '23514';
  end if;
  if exists (select 1 from public.implementations where etapa = s.codigo) then
    select * into d from public.implementation_stages where codigo = p_destino and codigo <> p_codigo;
    if not found then raise exception 'Escolha a etapa que vai receber as implantações' using errcode = '23514'; end if;
    perform set_config('atos.obs', 'Etapa "' || s.nome || '" excluída', true);
    update public.implementations set etapa = d.codigo where etapa = s.codigo;
    get diagnostics n = row_count;
    perform set_config('atos.obs', '', true);
  end if;
  delete from public.implementation_stages where codigo = s.codigo;
  return n;
end $$;

-- G3. Convites da agenda ---------------------------------------------
create or replace function public.convidar_evento(p_evento uuid, p_usuarios uuid[])
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; u uuid; n int := 0;
begin
  select * into e from public.events where id = p_evento and deleted_at is null;
  if not found or not private.pode_editar_evento(p_evento) then
    raise exception 'Compromisso não encontrado ou sem permissão para convidar' using errcode = '42501';
  end if;
  foreach u in array coalesce(p_usuarios, '{}') loop
    if u = coalesce(e.responsavel_id, e.created_by) then continue; end if;
    if not private.pode_ver_perfil(u) then
      raise exception 'Você só pode convidar pessoas da sua estrutura' using errcode = '42501';
    end if;
    insert into public.event_participants(event_id, usuario_id, convidado_por) values (p_evento, u, auth.uid())
    on conflict (event_id, usuario_id) do nothing;
    if found then
      n := n + 1;
      perform private.notificar(u, 'convite_evento', 'Convite: ' || e.titulo,
        to_char(e.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || coalesce(' · ' || e.local, '') || ' · por ' || coalesce(private.nome_usuario(auth.uid()), ''),
        '#/agenda?evento=' || e.id, e.id);
    end if;
  end loop;
  return n;
end $$;

create or replace function public.remover_convidado(p_evento uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  select * into e from public.events where id = p_evento and deleted_at is null;
  if not found or not private.pode_editar_evento(p_evento) then
    raise exception 'Sem permissão para alterar os convidados' using errcode = '42501';
  end if;
  delete from public.event_participants where event_id = p_evento and usuario_id = p_usuario;
  if found then
    perform private.notificar(p_usuario, 'evento_cancelado', 'Você foi removido de: ' || e.titulo, null, '#/agenda', e.id);
  end if;
end $$;

create or replace function public.responder_convite(p_evento uuid, p_resposta text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; v_org uuid;
begin
  if p_resposta not in ('aceito','recusado','talvez') then raise exception 'Resposta inválida' using errcode = '23514'; end if;
  update public.event_participants set resposta = p_resposta, respondido_em = now()
   where event_id = p_evento and usuario_id = auth.uid();
  if not found then raise exception 'Convite não encontrado' using errcode = '42501'; end if;
  select * into e from public.events where id = p_evento;
  v_org := coalesce(e.created_by, e.responsavel_id);
  if v_org is distinct from auth.uid() then
    perform private.notificar(v_org, 'resposta_convite',
      coalesce(private.nome_usuario(auth.uid()), 'Convidado') || case p_resposta when 'aceito' then ' confirmou presença' when 'recusado' then ' recusou o convite' else ' talvez participe' end,
      e.titulo, '#/agenda?evento=' || e.id, e.id);
  end if;
end $$;

-- G4. Presença ---------------------------------------------------------
create or replace function public.registrar_presenca(p_tela text default null, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.papel() is null then return; end if;
  insert into public.user_presence(usuario_id, visto_em, entrou_em, tela, dispositivo)
  values (auth.uid(), now(), now(), left(p_tela, 60), left(p_dispositivo, 40))
  on conflict (usuario_id) do update set
    entrou_em   = case when public.user_presence.visto_em < now() - interval '15 minutes'
                         or (public.user_presence.saiu_em is not null and public.user_presence.saiu_em >= public.user_presence.visto_em)
                       then now() else public.user_presence.entrou_em end,
    visto_em    = now(),
    saiu_em     = null,
    tela        = coalesce(excluded.tela, public.user_presence.tela),
    dispositivo = coalesce(excluded.dispositivo, public.user_presence.dispositivo);
end $$;

create or replace function public.registrar_saida()
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.user_presence set saiu_em = now() where usuario_id = auth.uid();
$$;

-- G5. Alertas rápidos (a cada minuto): SLA, lembretes de agenda e follow-up
create or replace function public.processar_alertas_rapidos()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sla jsonb := private.setting('sla', '{"meta1_min":5,"meta2_min":15}');
  v_cfg jsonb := private.setting('notificacoes', '{}');
  m1 interval := make_interval(mins => coalesce((v_sla->>'meta1_min')::int, 5));
  m2 interval := make_interval(mins => coalesce((v_sla->>'meta2_min')::int, 15));
  l record; ev record; fu record; n_sla int := 0; n_ev int := 0; n_fu int := 0; v_min int;
begin
  if auth.uid() is not null and coalesce(private.papel(), '') <> 'admin' then
    raise exception 'Rotina reservada ao sistema' using errcode = '42501';
  end if;

  -- SLA do primeiro contato (leads atribuídos nas últimas 24h)
  for l in select le.* from public.leads le join public.pipeline_stages ps on ps.codigo = le.etapa
            where le.deleted_at is null and ps.tipo = 'aberto' and le.primeiro_contato_em is null and le.sla_alerta < 2
              and coalesce(le.assigned_at, le.distribuido_em, le.entrada_em) > now() - interval '24 hours'
              and coalesce(le.assigned_at, le.distribuido_em, le.entrada_em) < now() - m1 loop
    v_min := round(extract(epoch from now() - coalesce(l.assigned_at, l.distribuido_em, l.entrada_em)) / 60);
    if l.corretor_id is null then
      -- lead parado na fila, sem distribuição
      if coalesce((v_cfg->>'sla_fila')::boolean, true) and l.sla_alerta < 1 then
        perform private.notificar(coalesce(l.supervisor_id, l.gerente_id), 'sla_atrasado', 'Lead aguardando distribuição há ' || v_min || ' min', l.nome, '#/leads/' || l.id, l.id);
      end if;
      update public.leads set sla_alerta = 2 where id = l.id;
    elsif coalesce(l.assigned_at, l.distribuido_em, l.entrada_em) < now() - m2 then
      if coalesce((v_cfg->>'sla_supervisor')::boolean, true) then
        perform private.notificar(l.supervisor_id, 'sla_atrasado', 'SLA estourado: ' || v_min || ' min sem contato',
          l.nome || ' · ' || coalesce(private.nome_usuario(l.corretor_id), ''), '#/leads/' || l.id, l.id);
      end if;
      if l.sla_alerta < 1 and coalesce((v_cfg->>'sla_corretor')::boolean, true) then
        perform private.notificar(l.corretor_id, 'sla_atrasado', 'Lead sem contato há ' || v_min || ' min', l.nome, '#/leads/' || l.id, l.id);
      end if;
      update public.leads set sla_alerta = 2 where id = l.id;
    elsif l.sla_alerta < 1 then
      if coalesce((v_cfg->>'sla_corretor')::boolean, true) then
        perform private.notificar(l.corretor_id, 'sla_atrasado', 'SLA: faça o primeiro contato agora (' || v_min || ' min)', l.nome, '#/leads/' || l.id, l.id);
      end if;
      update public.leads set sla_alerta = 1 where id = l.id;
    end if;
    n_sla := n_sla + 1;
  end loop;

  -- Lembretes de compromissos (organizador, responsável e convidados que não recusaram)
  for ev in select e.* from public.events e
             where e.deleted_at is null and e.lembrete_enviado_em is null and coalesce(e.lembrete_min, 0) > 0
               and e.inicio > now() and e.inicio <= now() + make_interval(mins => e.lembrete_min) loop
    insert into public.notifications(usuario_id, tipo, titulo, mensagem, link, ref_id)
    select distinct u, 'evento_proximo', 'Em ' || greatest(1, round(extract(epoch from ev.inicio - now()) / 60))::int || ' min: ' || ev.titulo,
           coalesce(ev.link_reuniao, ev.local), '#/agenda?evento=' || ev.id, ev.id
      from (select coalesce(ev.responsavel_id, ev.created_by) as u
            union select p.usuario_id from public.event_participants p where p.event_id = ev.id and p.resposta <> 'recusado') x
     where u is not null;
    update public.events set lembrete_enviado_em = now() where id = ev.id;
    update public.event_participants set lembrete_enviado = true where event_id = ev.id;
    n_ev := n_ev + 1;
  end loop;

  -- Lembretes de follow-up (mais precisos que a rotina de 15 min)
  for fu in select f.*, coalesce(le.nome, cl.nome) contato from public.followups f
              left join public.leads le on le.id = f.lead_id left join public.clients cl on cl.id = f.client_id
             where f.status = 'pendente' and f.deleted_at is null and f.alerta_enviado < 1
               and f.agendado_para > now() and f.agendado_para <= now() + make_interval(mins => coalesce(f.lembrete_min, 15)) loop
    perform private.notificar(coalesce(fu.responsavel_id, fu.corretor_id), 'followup_proximo', 'Follow-up em breve',
      fu.contato || ' às ' || to_char(fu.agendado_para at time zone 'America/Sao_Paulo', 'HH24:MI'),
      case when fu.lead_id is not null then '#/leads/' || fu.lead_id end, fu.id);
    update public.followups set alerta_enviado = 1 where id = fu.id;
    n_fu := n_fu + 1;
  end loop;

  return jsonb_build_object('sla', n_sla, 'eventos', n_ev, 'followups', n_fu, 'relacionamento', private.lembretes_relacionamento(false));
end $$;

-- G6. CRM → Implantação ------------------------------------------------
-- Quando o lead chega na etapa "Aprovado" do CRM ele vira cliente, a venda
-- entra na etapa inicial da implantação e o lead fica na primeira etapa de
-- "ganho" do funil. Daí em diante a implantação conduz: aprovação da
-- operadora gera as comissões e "Implantado" leva o lead para Implantado.
create or replace function public.converter_em_cliente(p_lead uuid, p_dados jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare l public.leads; v_cli uuid; v_sale uuid; d jsonb; v_etapa text; v_impl text;
        v_status text := coalesce(nullif(p_dados->>'status', ''), 'aprovada');
begin
  select * into l from public.leads where id = p_lead and deleted_at is null;
  if not found then raise exception 'Lead não encontrado' using errcode = '42501'; end if;
  if l.client_id is not null then raise exception 'Este lead já foi convertido em cliente' using errcode = '23505'; end if;

  insert into public.clients(tipo_pessoa, nome, razao_social, cpf, cnpj, data_nascimento, telefone, whatsapp, email,
      cep, endereco, numero, complemento, bairro, cidade, uf, lead_id, operator_id, product_id, num_vidas, data_venda, vigencia,
      valor_mensal, numero_proposta, status, source_id, corretor_id, supervisor_id, gerente_id)
  values (l.tipo_pessoa, coalesce(nullif(p_dados->>'nome',''), l.nome),
      case when l.tipo_pessoa = 'PJ' then coalesce(nullif(p_dados->>'razao_social',''), l.empresa) end,
      private.so_digitos(coalesce(p_dados->>'cpf', l.cpf)), private.so_digitos(coalesce(p_dados->>'cnpj', l.cnpj)),
      coalesce((p_dados->>'data_nascimento')::date, l.data_nascimento), l.telefone, l.whatsapp, l.email,
      p_dados->>'cep', p_dados->>'endereco', p_dados->>'numero', p_dados->>'complemento', p_dados->>'bairro',
      coalesce(p_dados->>'cidade', l.cidade), coalesce(p_dados->>'uf', l.uf), l.id,
      coalesce((p_dados->>'operator_id')::uuid, l.operator_id), coalesce((p_dados->>'product_id')::uuid, l.product_id),
      coalesce((p_dados->>'num_vidas')::int, l.num_vidas), coalesce((p_dados->>'data_venda')::date, current_date),
      (p_dados->>'vigencia')::date,
      coalesce((p_dados->>'valor_mensal')::numeric, l.valor_cotacao, l.valor_pretendido, 0),
      p_dados->>'numero_proposta',
      case when v_status = 'implantada' then 'ativo' else 'implantacao' end,
      l.source_id, l.corretor_id, l.supervisor_id, l.gerente_id)
  returning id into v_cli;

  if jsonb_typeof(p_dados->'dependentes') = 'array' then
    for d in select * from jsonb_array_elements(p_dados->'dependentes') loop
      insert into public.dependents(client_id, nome, cpf, data_nascimento, parentesco, valor, product_id)
      values (v_cli, d->>'nome', private.so_digitos(d->>'cpf'), (d->>'data_nascimento')::date, d->>'parentesco',
              (d->>'valor')::numeric, coalesce((d->>'product_id')::uuid, (p_dados->>'product_id')::uuid, l.product_id));
    end loop;
  end if;

  insert into public.sales(client_id, lead_id, operator_id, product_id, tipo_plano, num_vidas, valor_mensal, numero_proposta,
                           data_venda, vigencia, source_id, campaign_id, status, corretor_id, supervisor_id, gerente_id)
  values (v_cli, l.id, coalesce((p_dados->>'operator_id')::uuid, l.operator_id), coalesce((p_dados->>'product_id')::uuid, l.product_id),
          coalesce(p_dados->>'tipo_plano', l.modalidade), coalesce((p_dados->>'num_vidas')::int, l.num_vidas),
          coalesce((p_dados->>'valor_mensal')::numeric, l.valor_cotacao, l.valor_pretendido, 0), p_dados->>'numero_proposta',
          coalesce((p_dados->>'data_venda')::date, current_date), (p_dados->>'vigencia')::date, l.source_id, l.campaign_id,
          v_status, l.corretor_id, l.supervisor_id, l.gerente_id)
  returning id into v_sale;

  update public.proposals set client_id = v_cli, sale_id = v_sale
   where lead_id = l.id and status not in ('recusada','cancelada') and sale_id is null;

  -- o lead vai para a primeira etapa de "ganho" do CRM (ex.: Aprovado),
  -- a não ser que a própria venda já o tenha levado para lá
  select codigo into v_etapa from public.pipeline_stages where grupo = 'ganho' and ativo order by ordem limit 1;
  update public.leads
     set client_id = v_cli,
         etapa = case when v_etapa is not null and private.grupo_etapa(etapa) is distinct from 'ganho' then v_etapa else etapa end
   where id = l.id;

  select i.etapa into v_impl from public.implementations i where i.sale_id = v_sale;
  perform private.historico(l.id, 'aprovacao', 'Lead convertido em cliente',
    'Enviado para a implantação — etapa ' || coalesce((select nome from public.implementation_stages where codigo = v_impl), v_impl, '—'),
    jsonb_build_object('client_id', v_cli, 'sale_id', v_sale));
  return jsonb_build_object('client_id', v_cli, 'sale_id', v_sale, 'implantacao_etapa', v_impl);
end $$;

-- =====================================================================
-- H. DASHBOARDS E INDICADORES (agora baseados no GRUPO da etapa)
-- =====================================================================
create or replace function public.dashboard_metricas(p_inicio date, p_fim date, p_filtros jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  f jsonb := coalesce(p_filtros, '{}');
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_hoje timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_sla jsonb := private.setting('sla', '{"meta1_min":5,"meta2_min":15}');
  v_ganho text[] := private.etapas_do_grupo('ganho');
  v_perdido text[] := private.etapas_do_grupo('perdido');
  v_atend text[] := private.etapas_do_grupo('atendimento');
  v_negoc text[] := private.etapas_do_grupo('negociacao');
  r jsonb; v_meta numeric;
begin
  v_meta := private.meta_valor(p_fim, f);

  with
  ll as materialized (select l.* from public.leads l
   where l.deleted_at is null
     and (f->>'corretor_id'   is null or l.corretor_id   = (f->>'corretor_id')::uuid)
     and (f->>'supervisor_id' is null or l.supervisor_id = (f->>'supervisor_id')::uuid)
     and (f->>'gerente_id'    is null or l.gerente_id    = (f->>'gerente_id')::uuid)
     and (f->>'team_id'       is null or l.team_id       = (f->>'team_id')::uuid)
     and (f->>'operator_id'   is null or l.operator_id   = (f->>'operator_id')::uuid)
     and (f->>'product_id'    is null or l.product_id    = (f->>'product_id')::uuid)
     and (f->>'source_id'     is null or l.source_id     = (f->>'source_id')::uuid)
     and (f->>'campaign_id'   is null or l.campaign_id   = (f->>'campaign_id')::uuid)),
  ss as materialized (select s.* from public.sales s
   where s.deleted_at is null
     and (f->>'corretor_id'   is null or s.corretor_id   = (f->>'corretor_id')::uuid)
     and (f->>'supervisor_id' is null or s.supervisor_id = (f->>'supervisor_id')::uuid)
     and (f->>'gerente_id'    is null or s.gerente_id    = (f->>'gerente_id')::uuid)
     and (f->>'team_id'       is null or s.team_id       = (f->>'team_id')::uuid)
     and (f->>'operator_id'   is null or s.operator_id   = (f->>'operator_id')::uuid)
     and (f->>'product_id'    is null or s.product_id    = (f->>'product_id')::uuid)
     and (f->>'source_id'     is null or s.source_id     = (f->>'source_id')::uuid)
     and (f->>'campaign_id'   is null or s.campaign_id   = (f->>'campaign_id')::uuid)),
  lp as (select * from ll where entrada_em >= v_ini and entrada_em < v_fim),
  sv as (select * from ss where status in ('aprovada','implantada') and data_venda between p_inicio and p_fim),
  aberto as (select l.* from ll l join public.pipeline_stages ps on ps.codigo = l.etapa where ps.tipo = 'aberto'),
  q as (select * from public.quotes where deleted_at is null and enviada_em >= v_ini and enviada_em < v_fim and lead_id in (select id from ll)),
  p as (select * from public.proposals where deleted_at is null and lead_id in (select id from ll)),
  fu as (select * from public.followups where deleted_at is null and status = 'pendente' and agendado_para < now()
           and (f->>'corretor_id' is null or corretor_id = (f->>'corretor_id')::uuid)
           and (f->>'supervisor_id' is null or supervisor_id = (f->>'supervisor_id')::uuid)
           and (f->>'team_id' is null or team_id = (f->>'team_id')::uuid)),
  tk as (select * from public.tasks where deleted_at is null and status in ('aberta','em_andamento')
           and (f->>'corretor_id' is null or corretor_id = (f->>'corretor_id')::uuid or responsavel_id = (f->>'corretor_id')::uuid)
           and (f->>'supervisor_id' is null or supervisor_id = (f->>'supervisor_id')::uuid)),
  cl as (select * from public.clients where deleted_at is null
           and (f->>'corretor_id' is null or corretor_id = (f->>'corretor_id')::uuid)
           and (f->>'supervisor_id' is null or supervisor_id = (f->>'supervisor_id')::uuid)
           and (f->>'team_id' is null or team_id = (f->>'team_id')::uuid)
           and (f->>'operator_id' is null or operator_id = (f->>'operator_id')::uuid)
           and (f->>'product_id' is null or product_id = (f->>'product_id')::uuid)),
  rm as (select * from ss where status in ('aprovada','implantada') and data_venda >= date_trunc('month', p_fim)::date
           and data_venda < (date_trunc('month', p_fim) + interval '1 month')::date),
  sla as (select extract(epoch from (primeiro_contato_em - coalesce(distribuido_em, entrada_em))) / 60 as m
            from lp where primeiro_contato_em is not null)
  select jsonb_build_object(
    'cards', jsonb_build_object(
      'leads_recebidos',     (select count(*) from lp),
      'leads_novos',         (select count(*) from ll where status = 'novo'),
      'leads_atendimento',   (select count(*) from ll where etapa = any(v_atend)),
      'leads_negociacao',    (select count(*) from ll where etapa = any(v_negoc)),
      'cotacoes_enviadas',   (select count(*) from q),
      'propostas_enviadas',  (select count(*) from p where enviada_em >= v_ini and enviada_em < v_fim),
      'propostas_analise',   (select count(*) from p where status = 'em_analise'),
      'vendas_aprovadas',    (select count(*) from sv),
      'vendas_implantadas',  (select count(*) from ss where status = 'implantada' and data_implantacao between p_inicio and p_fim),
      'vendas_em_implantacao', (select count(*) from ss where status in ('proposta_enviada','em_analise','pendencia')),
      'vendas_canceladas',   (select count(*) from ss where status in ('cancelada','recusada') and coalesce(cancelada_em, status_desde) >= v_ini and coalesce(cancelada_em, status_desde) < v_fim),
      'clientes_ativos',     (select count(*) from cl where status = 'ativo'),
      'followups_atrasados', (select count(*) from fu),
      'tarefas_pendentes',   (select count(*) from tk),
      'valor_vendido',       (select coalesce(sum(valor_mensal), 0) from sv),
      'vidas_vendidas',      (select coalesce(sum(num_vidas), 0) from sv),
      'ticket_medio',        (select coalesce(round(avg(valor_mensal), 2), 0) from sv),
      'conversao_leads',     (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where client_id is not null or etapa = any(v_ganho)) / count(*), 1) end from lp),
      'conversao_propostas', (select case when (select count(*) from p where enviada_em >= v_ini and enviada_em < v_fim) = 0 then 0
                                          else round(100.0 * (select count(*) from sv) / (select count(*) from p where enviada_em >= v_ini and enviada_em < v_fim), 1) end),
      'meta_valor',          v_meta,
      'realizado_mes',       (select coalesce(sum(valor_mensal), 0) from rm),
      'meta_pct',            case when coalesce(v_meta, 0) = 0 then null else round(100 * (select coalesce(sum(valor_mensal), 0) from rm) / v_meta, 1) end
    ),
    'funil', (select coalesce(jsonb_agg(jsonb_build_object('etapa', ps.codigo, 'nome', ps.nome, 'cor', ps.cor,
                 'qtd', (select count(*) from lp where not (lp.etapa = any(v_perdido)) and coalesce(private.ordem_etapa(lp.etapa), 0) >= ps.ordem)) order by ps.ordem), '[]')
                from public.pipeline_stages ps where ps.ativo and ps.grupo <> 'perdido'),
    'vendas_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'qtd', x.qtd, 'valor', x.valor, 'vidas', x.vidas) order by m), '[]')
                     from generate_series(date_trunc('month', p_fim) - interval '11 months', date_trunc('month', p_fim), interval '1 month') m
                     cross join lateral (select count(*) qtd, coalesce(sum(valor_mensal), 0) valor, coalesce(sum(num_vidas), 0) vidas from ss
                                          where status in ('aprovada','implantada') and date_trunc('month', data_venda) = m) x),
    'por_corretor', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select sv.corretor_id as id, private.nome_usuario(sv.corretor_id) as nome, count(*) qtd, sum(valor_mensal) valor, sum(num_vidas) vidas
                        from sv where sv.corretor_id is not null group by sv.corretor_id limit 15) x),
    'por_supervisor', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select sv.supervisor_id as id, private.nome_usuario(sv.supervisor_id) as nome, count(*) qtd, sum(valor_mensal) valor, sum(num_vidas) vidas
                        from sv where sv.supervisor_id is not null group by sv.supervisor_id) x),
    'por_equipe', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select sv.team_id as id, coalesce(t.nome, 'Sem equipe') as nome, count(*) qtd, sum(sv.valor_mensal) valor, sum(sv.num_vidas) vidas
                        from sv left join public.teams t on t.id = sv.team_id group by sv.team_id, t.nome) x),
    'por_operadora', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select coalesce(o.nome, 'Sem operadora') nome, count(*) qtd, sum(sv.valor_mensal) valor, sum(sv.num_vidas) vidas
                        from sv left join public.operators o on o.id = sv.operator_id group by 1) x),
    'por_produto', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select coalesce(pr.nome, 'Sem produto') nome, count(*) qtd, sum(sv.valor_mensal) valor, sum(sv.num_vidas) vidas
                        from sv left join public.products pr on pr.id = sv.product_id group by 1 limit 12) x),
    'por_origem', (select coalesce(jsonb_agg(x order by x.leads desc), '[]') from (
                      select coalesce(src.nome, 'Sem origem') nome, count(*) leads,
                             count(*) filter (where lp.client_id is not null or lp.etapa = any(v_ganho)) vendas,
                             round(100.0 * count(*) filter (where lp.client_id is not null or lp.etapa = any(v_ganho)) / count(*), 1) conversao
                        from lp left join public.lead_sources src on src.id = lp.source_id group by 1) x),
    'conversao_corretor', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
                      select lp.corretor_id id, private.nome_usuario(lp.corretor_id) nome, count(*) leads,
                             count(*) filter (where lp.client_id is not null or lp.etapa = any(v_ganho)) vendas,
                             round(100.0 * count(*) filter (where lp.client_id is not null or lp.etapa = any(v_ganho)) / count(*), 1) conversao
                        from lp where lp.corretor_id is not null group by lp.corretor_id limit 15) x),
    'conversao_equipe', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
                      select coalesce(t.nome, 'Sem equipe') nome, count(*) leads,
                             count(*) filter (where lp.client_id is not null or lp.etapa = any(v_ganho)) vendas,
                             round(100.0 * count(*) filter (where lp.client_id is not null or lp.etapa = any(v_ganho)) / count(*), 1) conversao
                        from lp left join public.teams t on t.id = lp.team_id group by 1) x),
    'metas_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'meta', private.meta_valor(m::date, f),
                     'realizado', (select coalesce(sum(valor_mensal), 0) from ss where status in ('aprovada','implantada') and date_trunc('month', data_venda) = m)) order by m), '[]')
                    from generate_series(date_trunc('month', p_fim) - interval '5 months', date_trunc('month', p_fim), interval '1 month') m),
    'atencao', jsonb_build_object(
      'leads_sem_contato',     (select count(*) from aberto where primeiro_contato_em is null),
      'followups_vencidos',    (select count(*) from fu),
      'propostas_paradas',     (select count(*) from p where status in ('enviada','em_analise','pendencia') and status_desde < now() - interval '48 hours'),
      'implantacoes_paradas',  (select count(*) from ss s join public.implementations i on i.sale_id = s.id and i.deleted_at is null
                                 where s.status in ('proposta_enviada','em_analise','pendencia') and i.etapa_desde < now() - interval '48 hours'),
      'vendas_pendencia',      (select count(*) from ss s where s.status = 'pendencia' or exists (select 1 from public.pendencies pe where pe.sale_id = s.id and pe.status = 'aberta' and pe.deleted_at is null)),
      'quentes_sem_interacao', (select count(*) from aberto where temperatura = 'quente' and (ultimo_contato_em is null or ultimo_contato_em < v_hoje)),
      'sla_atrasado',          (select count(*) from aberto where primeiro_contato_em is null and corretor_id is not null
                                   and coalesce(assigned_at, distribuido_em, entrada_em) < now() - make_interval(mins => coalesce((v_sla->>'meta2_min')::int, 15))
                                   and coalesce(assigned_at, distribuido_em, entrada_em) > now() - interval '7 days')
    ),
    'sla', jsonb_build_object(
      'tempo_medio_min', (select round(avg(m)::numeric, 1) from sla),
      'pct_meta1',       (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where m <= (v_sla->>'meta1_min')::numeric) / count(*), 1) end from sla),
      'pct_meta2',       (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where m <= (v_sla->>'meta2_min')::numeric) / count(*), 1) end from sla),
      'meta1_min',       (v_sla->>'meta1_min')::int,
      'meta2_min',       (v_sla->>'meta2_min')::int,
      'sem_atendimento', (select count(*) from aberto where primeiro_contato_em is null)
    )
  ) into r;
  return r;
end $$;

create or replace function public.desempenho_corretores(p_inicio date, p_fim date, p_filtros jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  f jsonb := coalesce(p_filtros, '{}');
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_ganho text[] := private.etapas_do_grupo('ganho');
  v_perdido text[] := private.etapas_do_grupo('perdido');
  v_fechado text[] := private.etapas_do_grupo('ganho', 'perdido');
  r jsonb;
begin
  select coalesce(jsonb_agg(x order by x.valor desc, x.nome), '[]') into r from (
    select c.id, c.nome, c.team_id, t.nome as equipe, c.supervisor_id, private.nome_usuario(c.supervisor_id) as supervisor,
      c.gerente_id, private.nome_usuario(c.gerente_id) as gerente, c.grade_comissao as grade,
      lr.leads_recebidos, lr.leads_trabalhados, lr.sem_atendimento, lr.perdidos, lr.tempo_primeiro_contato_min, lr.convertidos,
      (select count(*) from public.activities a where a.corretor_id = c.id and a.deleted_at is null and a.realizado_em >= v_ini and a.realizado_em < v_fim) as tentativas,
      (select count(*) from public.quotes q where q.corretor_id = c.id and q.deleted_at is null and q.enviada_em >= v_ini and q.enviada_em < v_fim) as cotacoes,
      (select count(*) from public.proposals pr where pr.corretor_id = c.id and pr.deleted_at is null and pr.enviada_em >= v_ini and pr.enviada_em < v_fim) as propostas,
      sv.vendas, sv.valor, sv.vidas,
      case when sv.vendas = 0 then 0 else round(sv.valor / sv.vendas, 2) end as ticket_medio,
      case when lr.leads_recebidos = 0 then 0 else round(100.0 * lr.convertidos / lr.leads_recebidos, 1) end as conversao,
      (select count(*) from public.followups fu where fu.corretor_id = c.id and fu.status = 'concluido' and fu.concluido_em >= v_ini and fu.concluido_em < v_fim) as followups_realizados,
      (select count(*) from public.followups fu where fu.corretor_id = c.id and fu.status = 'pendente' and fu.deleted_at is null and fu.agendado_para < now()) as followups_atrasados,
      (select sum(g.valor_meta) from public.goals g where g.deleted_at is null and g.escopo = 'corretor' and g.usuario_id = c.id and g.tipo = 'valor' and g.mes = date_trunc('month', p_fim)::date) as meta,
      (select coalesce(sum(s2.valor_mensal), 0) from public.sales s2 where s2.corretor_id = c.id and s2.deleted_at is null and s2.status in ('aprovada','implantada')
          and s2.data_venda >= date_trunc('month', p_fim)::date and s2.data_venda < (date_trunc('month', p_fim) + interval '1 month')::date) as realizado_mes
    from public.profiles c
    left join public.teams t on t.id = c.team_id
    cross join lateral (
      select count(*) filter (where l.entrada_em >= v_ini and l.entrada_em < v_fim) as leads_recebidos,
             count(*) filter (where l.entrada_em >= v_ini and l.entrada_em < v_fim and l.tentativas_contato > 0) as leads_trabalhados,
             count(*) filter (where l.primeiro_contato_em is null and not (l.etapa = any(v_fechado))) as sem_atendimento,
             count(*) filter (where l.etapa = any(v_perdido) and l.updated_at >= v_ini and l.updated_at < v_fim) as perdidos,
             count(*) filter (where l.entrada_em >= v_ini and l.entrada_em < v_fim and (l.client_id is not null or l.etapa = any(v_ganho))) as convertidos,
             round(avg(extract(epoch from (l.primeiro_contato_em - coalesce(l.distribuido_em, l.entrada_em))) / 60)
                   filter (where l.primeiro_contato_em is not null and l.entrada_em >= v_ini and l.entrada_em < v_fim))::int as tempo_primeiro_contato_min
        from public.leads l where l.corretor_id = c.id and l.deleted_at is null) lr
    cross join lateral (
      select count(*) as vendas, coalesce(sum(s.valor_mensal), 0) as valor, coalesce(sum(s.num_vidas), 0) as vidas
        from public.sales s where s.corretor_id = c.id and s.deleted_at is null and s.status in ('aprovada','implantada')
         and s.data_venda between p_inicio and p_fim) sv
   where c.papel = 'corretor' and c.deleted_at is null and c.status <> 'pendente'
     and (f->>'supervisor_id' is null or c.supervisor_id = (f->>'supervisor_id')::uuid)
     and (f->>'gerente_id'    is null or c.gerente_id    = (f->>'gerente_id')::uuid)
     and (f->>'team_id'       is null or c.team_id       = (f->>'team_id')::uuid)
     and (f->>'corretor_id'   is null or c.id            = (f->>'corretor_id')::uuid)
  ) x;
  return r;
end $$;

create or replace function public.inteligencia_comercial(p_inicio date, p_fim date)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_dias_mes numeric := extract(day from (date_trunc('month', p_fim) + interval '1 month - 1 day'));
  v_prop numeric := least(1, extract(day from p_fim) / v_dias_mes);
  v_ganho text[] := private.etapas_do_grupo('ganho');
  v_perdido text[] := private.etapas_do_grupo('perdido');
  v_perto text[] := private.etapas_do_grupo('negociacao', 'proposta');
  r jsonb;
begin
  select jsonb_build_object(
    'precisam_atencao', (select coalesce(jsonb_agg(x), '[]') from (
        select l.id, l.nome, l.temperatura, l.etapa, private.nome_usuario(l.corretor_id) corretor,
               case when l.primeiro_contato_em is null then 'Sem primeiro contato'
                    when l.proximo_followup_em < now() then 'Follow-up vencido'
                    else 'Quente sem interação há mais de 24h' end as motivo
          from public.leads l join public.pipeline_stages ps on ps.codigo = l.etapa
         where l.deleted_at is null and ps.tipo = 'aberto'
           and (l.primeiro_contato_em is null or l.proximo_followup_em < now()
                or (l.temperatura = 'quente' and coalesce(l.ultimo_contato_em, l.entrada_em) < now() - interval '24 hours'))
         order by (l.temperatura = 'quente') desc, l.entrada_em limit 12) x),
    'esquecidos', (select coalesce(jsonb_agg(x), '[]') from (
        select l.id, l.nome, l.etapa, private.nome_usuario(l.corretor_id) corretor,
               extract(day from now() - coalesce(l.ultimo_contato_em, l.entrada_em))::int as dias
          from public.leads l join public.pipeline_stages ps on ps.codigo = l.etapa
         where l.deleted_at is null and ps.tipo = 'aberto' and coalesce(l.ultimo_contato_em, l.entrada_em) < now() - interval '7 days'
           and (l.proximo_followup_em is null or l.proximo_followup_em < now())
         order by coalesce(l.ultimo_contato_em, l.entrada_em) limit 12) x),
    'implantacoes_paradas', (select coalesce(jsonb_agg(x), '[]') from (
        select i.id, i.sale_id, i.lead_id, cl.nome, i.etapa, ist.nome etapa_nome, ist.cor etapa_cor, private.nome_usuario(s.corretor_id) corretor,
               round(extract(epoch from now() - i.etapa_desde) / 3600)::int horas
          from public.implementations i join public.sales s on s.id = i.sale_id and s.deleted_at is null
          left join public.clients cl on cl.id = i.client_id left join public.implementation_stages ist on ist.codigo = i.etapa
         where i.deleted_at is null and s.status in ('proposta_enviada','em_analise','pendencia') and i.etapa_desde < now() - interval '72 hours'
         order by i.etapa_desde limit 12) x),
    'propostas_paradas', (select coalesce(jsonb_agg(x), '[]') from (
        select pr.id, pr.lead_id, coalesce(l.nome, cl.nome) nome, pr.status, pr.numero, private.nome_usuario(pr.corretor_id) corretor,
               round(extract(epoch from now() - pr.status_desde) / 3600)::int horas
          from public.proposals pr left join public.leads l on l.id = pr.lead_id left join public.clients cl on cl.id = pr.client_id
         where pr.deleted_at is null and pr.status in ('enviada','em_analise','pendencia') and pr.status_desde < now() - interval '72 hours'
         order by pr.status_desde limit 12) x),
    'abaixo_meta', (select coalesce(jsonb_agg(x), '[]') from (
        select d->>'id' id, d->>'nome' nome, (d->>'meta')::numeric meta, (d->>'realizado_mes')::numeric realizado,
               round(100 * (d->>'realizado_mes')::numeric / nullif((d->>'meta')::numeric, 0), 1) pct,
               round(100 * v_prop, 1) esperado_pct
          from jsonb_array_elements(public.desempenho_corretores(date_trunc('month', p_fim)::date, p_fim)) d
         where (d->>'meta') is not null and (d->>'realizado_mes')::numeric < (d->>'meta')::numeric * v_prop
         order by 5 nulls first limit 12) x),
    'melhores_origens', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
        select coalesce(s.nome, 'Sem origem') nome, count(*) leads,
               count(*) filter (where l.client_id is not null or l.etapa = any(v_ganho)) vendas,
               round(100.0 * count(*) filter (where l.client_id is not null or l.etapa = any(v_ganho)) / count(*), 1) conversao
          from public.leads l left join public.lead_sources s on s.id = l.source_id
         where l.deleted_at is null and l.entrada_em >= v_ini and l.entrada_em < v_fim group by 1 having count(*) >= 3) x),
    'campanhas', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
        select c.nome, count(*) leads,
               count(*) filter (where l.client_id is not null or l.etapa = any(v_ganho)) vendas,
               round(100.0 * count(*) filter (where l.client_id is not null or l.etapa = any(v_ganho)) / count(*), 1) conversao
          from public.leads l join public.campaigns c on c.id = l.campaign_id
         where l.deleted_at is null and l.entrada_em >= v_ini and l.entrada_em < v_fim group by 1) x),
    'produtos', (select coalesce(jsonb_agg(x order by x.qtd desc), '[]') from (
        select coalesce(p.nome, 'Sem produto') nome, count(*) qtd, sum(s.valor_mensal) valor
          from public.sales s left join public.products p on p.id = s.product_id
         where s.deleted_at is null and s.status in ('aprovada','implantada') and s.data_venda between p_inicio and p_fim group by 1 limit 8) x),
    'operadoras', (select coalesce(jsonb_agg(x order by x.qtd desc), '[]') from (
        select coalesce(o.nome, 'Sem operadora') nome, count(*) qtd, sum(s.valor_mensal) valor
          from public.sales s left join public.operators o on o.id = s.operator_id
         where s.deleted_at is null and s.status in ('aprovada','implantada') and s.data_venda between p_inicio and p_fim group by 1 limit 8) x),
    'motivos_perda', (select coalesce(jsonb_agg(x order by x.qtd desc), '[]') from (
        select coalesce(lr.nome, 'Não informado') nome, count(*) qtd
          from public.leads l left join public.loss_reasons lr on lr.id = l.loss_reason_id
         where l.deleted_at is null and l.etapa = any(v_perdido) and l.updated_at >= v_ini and l.updated_at < v_fim group by 1) x),
    'proximos_fechamento', (select coalesce(jsonb_agg(x), '[]') from (
        select l.id, l.nome, l.etapa, l.temperatura, coalesce(l.valor_cotacao, l.valor_pretendido) valor, private.nome_usuario(l.corretor_id) corretor
          from public.leads l
         where l.deleted_at is null and l.etapa = any(v_perto)
         order by (l.temperatura = 'quente') desc, private.ordem_etapa(l.etapa) desc, coalesce(l.valor_cotacao, l.valor_pretendido) desc nulls last limit 12) x)
  ) into r;
  return r;
end $$;

-- =====================================================================
-- I. PRIVILÉGIOS
-- =====================================================================
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.distribuir_lead(uuid, uuid, text, text), public.distribuir_automatico(uuid), public.distribuir_leads_lote(uuid[], uuid[], text),
  public.mover_etapa(uuid, text, uuid, text), public.alterar_status_lead(uuid, text, uuid, text),
  public.registrar_atividade(uuid, text, boolean, text, text, uuid), public.concluir_followup(uuid, text, timestamptz, text, text),
  public.converter_em_cliente(uuid, jsonb), public.transferir_cliente(uuid, uuid, text), public.avancar_implantacao(uuid, text, text, text),
  public.verificar_duplicidade(text, text, text, uuid), public.busca_global(text),
  public.importar_leads(jsonb, text, uuid, uuid, uuid), public.atualizar_meu_perfil(text, text, boolean),
  public.marcar_notificacoes_lidas(uuid[]), public.registrar_login(), public.anonimizar_lead(uuid),
  public.minhas_comissoes(date, date), public.dashboard_metricas(date, date, jsonb), public.desempenho_corretores(date, date, jsonb),
  public.inteligencia_comercial(date, date), public.contexto_ia_lead(uuid), public.processar_alertas(),
  public.salvar_grade_produto(uuid, jsonb), public.importar_grade_comissao(jsonb, boolean), public.excluir_grade(text, text),
  public.excluir_etapa_crm(text, text), public.excluir_status_lead(text, text), public.excluir_etapa_implantacao(text, text),
  public.convidar_evento(uuid, uuid[]), public.remover_convidado(uuid, uuid), public.responder_convite(uuid, text),
  public.registrar_presenca(text, text), public.registrar_saida(), public.processar_alertas_rapidos(),
  public.ranking_comercial(date, date), public.executar_lembretes_relacionamento()
to authenticated;
