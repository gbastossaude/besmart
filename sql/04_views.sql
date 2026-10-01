-- =====================================================================
--  ATOS SISTEMA — 04_views.sql
--  Views de leitura para o front-end. Todas com security_invoker = true:
--  as políticas RLS das tabelas base continuam valendo integralmente.
-- =====================================================================

create or replace function private.nome_usuario(p_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select nome from public.profiles where id = p_id
$$;
grant execute on function private.nome_usuario(uuid) to authenticated;

create or replace view public.v_profiles with (security_invoker = true) as
select p.*, t.nome as team_nome,
       private.nome_usuario(p.supervisor_id) as supervisor_nome,
       private.nome_usuario(p.gerente_id)    as gerente_nome,
       r.nome as papel_nome
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  left join public.roles r on r.codigo = p.papel
 where p.deleted_at is null;

create or replace view public.v_teams with (security_invoker = true) as
select t.*, private.nome_usuario(t.supervisor_id) as supervisor_nome, private.nome_usuario(t.gerente_id) as gerente_nome,
       (select count(*) from public.profiles p where p.team_id = t.id and p.papel = 'corretor' and p.deleted_at is null) as corretores
  from public.teams t where t.deleted_at is null;

create or replace view public.v_leads with (security_invoker = true) as
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
            then round(extract(epoch from (l.primeiro_contato_em - coalesce(l.distribuido_em, l.entrada_em))) / 60)::int end as minutos_primeiro_contato
  from public.leads l
  left join public.teams t          on t.id  = l.team_id
  left join public.operators o      on o.id  = l.operator_id
  left join public.products p       on p.id  = l.product_id
  left join public.lead_sources src on src.id = l.source_id
  left join public.campaigns c      on c.id  = l.campaign_id
  left join public.lead_statuses st on st.codigo = l.status
  left join public.pipeline_stages ps on ps.codigo = l.etapa
  left join public.loss_reasons lr  on lr.id = l.loss_reason_id
 where l.deleted_at is null;

create or replace view public.v_clients with (security_invoker = true) as
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

create or replace view public.v_sales with (security_invoker = true) as
select s.*,
       cl.nome as cliente_nome, cl.cpf as cliente_cpf, cl.cnpj as cliente_cnpj,
       private.nome_usuario(s.corretor_id)   as corretor_nome,
       private.nome_usuario(s.supervisor_id) as supervisor_nome,
       private.nome_usuario(s.gerente_id)    as gerente_nome,
       o.nome as operadora_nome, p.nome as produto_nome, src.nome as origem_nome, cp.nome as campanha_nome,
       i.etapa as implantacao_etapa,
       (select count(*) from public.pendencies pe where pe.sale_id = s.id and pe.status = 'aberta' and pe.deleted_at is null) as pendencias_abertas
  from public.sales s
  left join public.clients cl       on cl.id = s.client_id
  left join public.operators o      on o.id = s.operator_id
  left join public.products p       on p.id = s.product_id
  left join public.lead_sources src on src.id = s.source_id
  left join public.campaigns cp     on cp.id = s.campaign_id
  left join public.implementations i on i.sale_id = s.id
 where s.deleted_at is null;

create or replace view public.v_quotes with (security_invoker = true) as
select q.*, l.nome as lead_nome, o.nome as operadora_nome, p.nome as produto_nome, private.nome_usuario(q.corretor_id) as corretor_nome
  from public.quotes q
  left join public.leads l on l.id = q.lead_id
  left join public.operators o on o.id = q.operator_id
  left join public.products p on p.id = q.product_id
 where q.deleted_at is null;

create or replace view public.v_proposals with (security_invoker = true) as
select pr.*, coalesce(l.nome, cl.nome) as nome_contato, l.nome as lead_nome, cl.nome as cliente_nome,
       o.nome as operadora_nome, p.nome as produto_nome, private.nome_usuario(pr.corretor_id) as corretor_nome,
       round(extract(epoch from (now() - pr.status_desde)) / 3600)::int as horas_no_status
  from public.proposals pr
  left join public.leads l on l.id = pr.lead_id
  left join public.clients cl on cl.id = pr.client_id
  left join public.operators o on o.id = pr.operator_id
  left join public.products p on p.id = pr.product_id
 where pr.deleted_at is null;

create or replace view public.v_implementations with (security_invoker = true) as
select i.*, s.operator_id, s.product_id, s.valor_mensal, s.num_vidas, s.numero_proposta, s.data_venda, s.status as venda_status, s.vigencia,
       cl.nome as cliente_nome, o.nome as operadora_nome, p.nome as produto_nome,
       private.nome_usuario(i.corretor_id) as corretor_nome, private.nome_usuario(i.responsavel_id) as responsavel_nome,
       (select count(*) from public.pendencies pe where pe.sale_id = i.sale_id and pe.status = 'aberta' and pe.deleted_at is null) as pendencias_abertas,
       round(extract(epoch from (now() - i.etapa_desde)) / 3600)::int as horas_na_etapa
  from public.implementations i
  join public.sales s on s.id = i.sale_id
  left join public.clients cl on cl.id = i.client_id
  left join public.operators o on o.id = s.operator_id
  left join public.products p on p.id = s.product_id
 where i.deleted_at is null and s.deleted_at is null;

create or replace view public.v_implementation_events with (security_invoker = true) as
select e.*, private.nome_usuario(e.usuario_id) as usuario_nome from public.implementation_events e;

create or replace view public.v_pendencies with (security_invoker = true) as
select pe.*, coalesce(cl.nome, l.nome) as nome_contato, private.nome_usuario(pe.corretor_id) as corretor_nome,
       (pe.status = 'aberta' and pe.prazo < current_date) as atrasada
  from public.pendencies pe
  left join public.clients cl on cl.id = pe.client_id
  left join public.leads l on l.id = pe.lead_id
 where pe.deleted_at is null;

create or replace view public.v_followups with (security_invoker = true) as
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

create or replace view public.v_tasks with (security_invoker = true) as
select t.*, coalesce(l.nome, cl.nome) as nome_contato,
       private.nome_usuario(t.responsavel_id) as responsavel_nome,
       private.nome_usuario(t.created_by)     as criado_por_nome,
       (t.status in ('aberta','em_andamento') and t.prazo < now()) as atrasada
  from public.tasks t
  left join public.leads l on l.id = t.lead_id
  left join public.clients cl on cl.id = t.client_id
 where t.deleted_at is null;

create or replace view public.v_events with (security_invoker = true) as
select e.*, coalesce(l.nome, cl.nome) as nome_contato, private.nome_usuario(e.responsavel_id) as responsavel_nome
  from public.events e
  left join public.leads l on l.id = e.lead_id
  left join public.clients cl on cl.id = e.client_id
 where e.deleted_at is null;

create or replace view public.v_activities with (security_invoker = true) as
select a.*, coalesce(l.nome, cl.nome) as nome_contato, private.nome_usuario(a.usuario_id) as usuario_nome
  from public.activities a
  left join public.leads l on l.id = a.lead_id
  left join public.clients cl on cl.id = a.client_id
 where a.deleted_at is null;

create or replace view public.v_notes with (security_invoker = true) as
select n.*, private.nome_usuario(n.autor_id) as autor_nome from public.notes n where n.deleted_at is null;

create or replace view public.v_documents with (security_invoker = true) as
select d.*, private.nome_usuario(d.enviado_por) as enviado_por_nome from public.documents d where d.deleted_at is null;

create or replace view public.v_lead_history with (security_invoker = true) as
select h.*, coalesce(private.nome_usuario(h.usuario_id), 'Sistema') as usuario_nome from public.lead_history h;

create or replace view public.v_lead_assignments with (security_invoker = true) as
select a.*, private.nome_usuario(a.corretor_anterior) as anterior_nome, private.nome_usuario(a.corretor_novo) as novo_nome,
       coalesce(private.nome_usuario(a.distribuido_por), 'Sistema') as distribuido_por_nome
  from public.lead_assignments a;

create or replace view public.v_commissions with (security_invoker = true) as
select c.*, cl.nome as cliente_nome, o.nome as operadora_nome, s.data_venda, s.numero_proposta,
       private.nome_usuario(c.corretor_id) as corretor_nome, private.nome_usuario(c.supervisor_id) as supervisor_nome
  from public.commissions c
  join public.sales s on s.id = c.sale_id
  left join public.clients cl on cl.id = c.client_id
  left join public.operators o on o.id = c.operator_id
 where c.deleted_at is null;

create or replace view public.v_products with (security_invoker = true) as
select p.*, o.nome as operadora_nome from public.products p join public.operators o on o.id = p.operator_id where p.deleted_at is null;

create or replace view public.v_campaigns with (security_invoker = true) as
select c.*, s.nome as origem_nome from public.campaigns c left join public.lead_sources s on s.id = c.source_id where c.deleted_at is null;

create or replace view public.v_goals with (security_invoker = true) as
select g.*, private.nome_usuario(g.usuario_id) as usuario_nome, t.nome as equipe_nome, o.nome as operadora_nome, p.nome as produto_nome
  from public.goals g
  left join public.teams t on t.id = g.goal_team_id
  left join public.operators o on o.id = g.operator_id
  left join public.products p on p.id = g.product_id
 where g.deleted_at is null;

create or replace view public.v_dependents with (security_invoker = true) as
select d.*, p.nome as produto_nome from public.dependents d left join public.products p on p.id = d.product_id where d.deleted_at is null;

create or replace view public.v_audit_logs with (security_invoker = true) as
select a.*, coalesce(private.nome_usuario(a.usuario_id), 'Sistema') as usuario_nome from public.audit_logs a;

create or replace view public.v_distribution_rules with (security_invoker = true) as
select r.*, s.nome as origem_nome, c.nome as campanha_nome, p.nome as produto_nome, t.nome as equipe_nome,
       private.nome_usuario(r.corretor_id) as corretor_nome
  from public.distribution_rules r
  left join public.lead_sources s on s.id = r.source_id
  left join public.campaigns c on c.id = r.campaign_id
  left join public.products p on p.id = r.product_id
  left join public.teams t on t.id = r.team_id;

create or replace view public.v_commission_rules with (security_invoker = true) as
select r.*, o.nome as operadora_nome, p.nome as produto_nome, private.nome_usuario(r.corretor_id) as corretor_nome,
       private.nome_usuario(r.supervisor_id) as supervisor_nome, c.nome as campanha_nome
  from public.commission_rules r
  left join public.operators o on o.id = r.operator_id
  left join public.products p on p.id = r.product_id
  left join public.campaigns c on c.id = r.campaign_id;

grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
