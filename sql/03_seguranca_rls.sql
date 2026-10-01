-- =====================================================================
--  ATOS SISTEMA — 03_seguranca_rls.sql
--  Row Level Security: a regra de acesso vive no BANCO.
--  Mesmo que alguém altere URL, ID ou chame a API diretamente,
--  o PostgreSQL só devolve registros da estrutura do usuário.
--
--   ADMIN       → tudo
--   GERENTE     → registros com gerente_id    = ele
--   SUPERVISOR  → registros com supervisor_id = ele
--   CORRETOR    → registros com corretor_id   = ele
--   Usuário pendente/inativo → nada
-- =====================================================================

create or replace function private.meus_superiores()
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select array_remove(array[p.supervisor_id, p.gerente_id], null) from public.profiles p where p.id = auth.uid()
$$;

create or replace function private.meu_time()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select team_id from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Tabelas operacionais com propriedade (corretor/supervisor/gerente)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  v_escopo text := $e$(
        (select private.papel()) = 'admin'
     or ((select private.papel()) = 'gerente'    and gerente_id    = (select auth.uid()))
     or ((select private.papel()) = 'supervisor' and supervisor_id = (select auth.uid()))
     or ((select private.papel()) = 'corretor'   and corretor_id   = (select auth.uid())))$e$;
  v_extra text;
begin
  foreach t in array array['leads','clients','sales','quotes','proposals','implementations','pendencies','activities',
                           'followups','tasks','events','notes','documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists escopo_select on public.%I', t);
    execute format('drop policy if exists escopo_insert on public.%I', t);
    execute format('drop policy if exists escopo_update on public.%I', t);
    execute format('drop policy if exists escopo_delete on public.%I', t);

    v_extra := case
      when t in ('tasks','events','followups') then ' or responsavel_id = (select auth.uid())'
      else '' end;

    if t = 'documents' then
      -- documentos sensíveis (ex.: declaração de saúde): só admin, corretor dono ou papel com permissão
      execute format('create policy escopo_select on public.%I for select to authenticated using (%s and (not sensivel or corretor_id = (select auth.uid()) or (select private.tem_permissao(''documentos.sensiveis''))))', t, v_escopo);
    else
      execute format('create policy escopo_select on public.%I for select to authenticated using (%s%s)', t, v_escopo, v_extra);
    end if;
    execute format('create policy escopo_insert on public.%I for insert to authenticated with check (%s%s)', t, v_escopo, v_extra);
    execute format('create policy escopo_update on public.%I for update to authenticated using (%s%s) with check (%s%s)', t, v_escopo, v_extra, v_escopo, v_extra);
    if t = 'notes' then
      execute format('create policy escopo_delete on public.%I for delete to authenticated using ((select private.papel()) = ''admin'' or autor_id = (select auth.uid()))', t);
    else
      execute format('create policy escopo_delete on public.%I for delete to authenticated using ((select private.papel()) = ''admin'')', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Comissões: escopo + permissão. Corretor consulta pela RPC minhas_comissoes()
-- (que não expõe a margem da empresa).
-- ---------------------------------------------------------------------
alter table public.commissions enable row level security;
drop policy if exists com_select on public.commissions;
drop policy if exists com_update on public.commissions;
drop policy if exists com_insert on public.commissions;
drop policy if exists com_delete on public.commissions;
create policy com_select on public.commissions for select to authenticated using (
      (select private.papel()) = 'admin'
   or ((select private.papel()) = 'gerente'    and gerente_id    = (select auth.uid()) and (select private.tem_permissao('comissoes.ver')))
   or ((select private.papel()) = 'supervisor' and supervisor_id = (select auth.uid()) and (select private.tem_permissao('comissoes.ver'))));
create policy com_update on public.commissions for update to authenticated
  using ((select private.papel()) = 'admin' or ((select private.tem_permissao('comissoes.editar')) and gerente_id = (select auth.uid())))
  with check ((select private.papel()) = 'admin' or ((select private.tem_permissao('comissoes.editar')) and gerente_id = (select auth.uid())));
create policy com_insert on public.commissions for insert to authenticated with check ((select private.papel()) = 'admin');
create policy com_delete on public.commissions for delete to authenticated using ((select private.papel()) = 'admin');

-- ---------------------------------------------------------------------
-- Tabelas filhas visíveis quando o registro "pai" é visível
-- ---------------------------------------------------------------------
alter table public.lead_history enable row level security;
drop policy if exists hist_select on public.lead_history;
create policy hist_select on public.lead_history for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

alter table public.lead_assignments enable row level security;
drop policy if exists assign_select on public.lead_assignments;
create policy assign_select on public.lead_assignments for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

alter table public.implementation_events enable row level security;
drop policy if exists implev_select on public.implementation_events;
create policy implev_select on public.implementation_events for select to authenticated
  using (exists (select 1 from public.implementations i where i.id = implementation_id));

alter table public.dependents enable row level security;
drop policy if exists dep_all on public.dependents;
create policy dep_all on public.dependents for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id))
  with check (exists (select 1 from public.clients c where c.id = client_id));

-- ---------------------------------------------------------------------
-- Usuários e equipes
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists prof_select on public.profiles;
drop policy if exists prof_update on public.profiles;
drop policy if exists prof_delete on public.profiles;
create policy prof_select on public.profiles for select to authenticated using (
      id = (select auth.uid())
   or (select private.papel()) = 'admin'
   or ((select private.papel()) = 'gerente'    and gerente_id    = (select auth.uid()))
   or ((select private.papel()) = 'supervisor' and supervisor_id = (select auth.uid()))
   or id = any(coalesce((select private.meus_superiores()), '{}'::uuid[])));
create policy prof_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.papel()) = 'admin')
  with check (id = (select auth.uid()) or (select private.papel()) = 'admin');
create policy prof_delete on public.profiles for delete to authenticated using ((select private.papel()) = 'admin');

alter table public.teams enable row level security;
drop policy if exists teams_select on public.teams;
drop policy if exists teams_write on public.teams;
create policy teams_select on public.teams for select to authenticated using (
      (select private.papel()) = 'admin'
   or ((select private.papel()) = 'gerente'    and gerente_id    = (select auth.uid()))
   or ((select private.papel()) = 'supervisor' and supervisor_id = (select auth.uid()))
   or id = (select private.meu_time()));
create policy teams_write on public.teams for all to authenticated
  using ((select private.papel()) = 'admin') with check ((select private.papel()) = 'admin');

-- ---------------------------------------------------------------------
-- Cadastros: leitura para usuários ativos, escrita apenas admin
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['operators','products','lead_sources','campaigns','pipeline_stages','lead_statuses','loss_reasons',
                           'roles','permissions','role_permissions','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists cad_select on public.%I', t);
    execute format('drop policy if exists cad_write on public.%I', t);
    execute format('create policy cad_select on public.%I for select to authenticated using ((select private.papel()) is not null)', t);
    execute format('create policy cad_write on public.%I for all to authenticated using ((select private.papel()) = ''admin'') with check ((select private.papel()) = ''admin'')', t);
  end loop;
end $$;

alter table public.distribution_rules enable row level security;
drop policy if exists dr_select on public.distribution_rules;
drop policy if exists dr_write on public.distribution_rules;
create policy dr_select on public.distribution_rules for select to authenticated using ((select private.papel()) in ('admin','gerente','supervisor'));
create policy dr_write on public.distribution_rules for all to authenticated
  using ((select private.papel()) = 'admin') with check ((select private.papel()) = 'admin');

alter table public.commission_rules enable row level security;
drop policy if exists cr_select on public.commission_rules;
drop policy if exists cr_write on public.commission_rules;
create policy cr_select on public.commission_rules for select to authenticated using ((select private.tem_permissao('comissoes.ver')));
create policy cr_write on public.commission_rules for all to authenticated
  using ((select private.papel()) = 'admin') with check ((select private.papel()) = 'admin');

-- ---------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------
alter table public.goals enable row level security;
drop policy if exists goals_select on public.goals;
drop policy if exists goals_write on public.goals;
create policy goals_select on public.goals for select to authenticated using (
        (select private.papel()) = 'admin'
     or ((select private.papel()) = 'gerente'    and gerente_id    = (select auth.uid()))
     or ((select private.papel()) = 'supervisor' and supervisor_id = (select auth.uid()))
     or ((select private.papel()) = 'corretor'   and corretor_id   = (select auth.uid())));
create policy goals_write on public.goals for all to authenticated
  using ((select private.papel()) = 'admin' or ((select private.papel()) = 'gerente' and gerente_id = (select auth.uid()) and escopo <> 'gerente'))
  with check ((select private.papel()) = 'admin' or ((select private.papel()) = 'gerente' and gerente_id = (select auth.uid()) and escopo <> 'gerente'));

-- ---------------------------------------------------------------------
-- Notificações (somente as próprias), auditoria (admin), integrações (admin)
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;
drop policy if exists notif_own on public.notifications;
drop policy if exists notif_upd on public.notifications;
drop policy if exists notif_del on public.notifications;
create policy notif_own on public.notifications for select to authenticated using (usuario_id = (select auth.uid()));
create policy notif_upd on public.notifications for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy notif_del on public.notifications for delete to authenticated using (usuario_id = (select auth.uid()));

alter table public.audit_logs enable row level security;
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using ((select private.tem_permissao('auditoria.ver')));

alter table public.integration_events enable row level security;
drop policy if exists integ_admin on public.integration_events;
create policy integ_admin on public.integration_events for all to authenticated
  using ((select private.papel()) = 'admin') with check ((select private.papel()) = 'admin');

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- tabelas gravadas apenas pelo servidor (triggers/RPC)
revoke insert, update, delete on public.lead_history, public.lead_assignments, public.implementation_events, public.audit_logs from authenticated;
revoke insert on public.notifications from authenticated;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
