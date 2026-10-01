-- =====================================================================
--  ATOS SISTEMA — SQL COMPLETO
--  Serve para instalar do zero E para atualizar um banco já instalado
--  (pode ser executado novamente sem perder dados).
--  Depois rode o 07_supabase_storage_cron.sql.
-- =====================================================================


-- =====================================================================
--  ATOS SISTEMA — 01_estrutura.sql
--  Tabelas, relacionamentos, constraints e índices
--  Banco: Supabase (PostgreSQL 15+)
--  Execute os arquivos na ordem 01 → 07 no SQL Editor do Supabase.
-- =====================================================================

-- gen_random_uuid() é nativo no PostgreSQL 13+
create schema if not exists private;   -- funções internas (não expostas na API)

-- Em atualizações: remove as views públicas (são recriadas mais adiante),
-- para que alterações de colunas nunca sejam bloqueadas por dependências.
do $$
declare v record;
begin
  for v in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('drop view if exists public.%I cascade', v.table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RBAC: papéis e permissões
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  codigo      text primary key,
  nome        text not null,
  nivel       int  not null
);

create table if not exists public.permissions (
  codigo      text primary key,
  modulo      text not null,
  descricao   text not null
);

create table if not exists public.role_permissions (
  role        text not null references public.roles(codigo) on delete cascade,
  permission  text not null references public.permissions(codigo) on delete cascade,
  primary key (role, permission)
);

-- ---------------------------------------------------------------------
-- Usuários (perfil ligado ao auth.users) e equipes
-- Hierarquia: Gerente → Supervisor → Corretor
--   corretor.supervisor_id  = supervisor responsável
--   corretor.gerente_id     = gerente do supervisor (preenchido automaticamente)
--   supervisor.gerente_id   = gerente responsável
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  supervisor_id uuid,
  gerente_id    uuid,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  deleted_at    timestamptz
);

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null default '',
  email          text not null,
  telefone       text,
  papel          text not null default 'corretor' references public.roles(codigo),
  status         text not null default 'pendente' check (status in ('pendente','ativo','inativo')),
  team_id        uuid references public.teams(id),
  supervisor_id  uuid references public.profiles(id),
  gerente_id     uuid references public.profiles(id),
  disponivel     boolean not null default true,   -- disponível para receber leads agora
  recebe_leads   boolean not null default true,   -- participa da distribuição automática
  ufs            text[] not null default '{}',    -- regiões atendidas (distribuição por região)
  ultimo_lead_em timestamptz,                     -- controle do rodízio
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid,
  deleted_at     timestamptz,
  constraint profiles_sem_auto_hierarquia check (supervisor_id is distinct from id and gerente_id is distinct from id)
);

alter table public.teams drop constraint if exists teams_supervisor_fk;
alter table public.teams add constraint teams_supervisor_fk foreign key (supervisor_id) references public.profiles(id);
alter table public.teams drop constraint if exists teams_gerente_fk;
alter table public.teams add constraint teams_gerente_fk foreign key (gerente_id) references public.profiles(id);

create index if not exists profiles_papel_idx      on public.profiles(papel);
create index if not exists profiles_supervisor_idx on public.profiles(supervisor_id);
create index if not exists profiles_gerente_idx    on public.profiles(gerente_id);
create index if not exists profiles_team_idx       on public.profiles(team_id);
create index if not exists teams_supervisor_idx    on public.teams(supervisor_id);
create index if not exists teams_gerente_idx       on public.teams(gerente_id);

-- ---------------------------------------------------------------------
-- Cadastros configuráveis (nada fixo no código)
-- ---------------------------------------------------------------------
create table if not exists public.operators (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text,
  registro_ans text,
  site         text,
  cor          text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid, updated_by uuid, deleted_at timestamptz
);
create unique index if not exists operators_nome_uk on public.operators(lower(nome)) where deleted_at is null;

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  operator_id     uuid not null references public.operators(id),
  nome            text not null,
  ramo            text not null default 'saude',   -- saude, odonto, vida, seguro, consorcio, previdencia, beneficios...
  tipo            text not null default 'pme',     -- individual, familiar, adesao, pme, empresarial
  abrangencia     text,                            -- municipal, regional, estadual, nacional
  segmentacao     text,                            -- ambulatorial, hospitalar, amb+hosp+obst...
  acomodacao      text,                            -- enfermaria, apartamento
  coparticipacao  boolean not null default false,
  min_vidas       int,
  max_vidas       int,
  vigencia        text,
  observacoes     text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  constraint products_vidas_ck check (min_vidas is null or max_vidas is null or min_vidas <= max_vidas)
);
create index if not exists products_operator_idx on public.products(operator_id);

create table if not exists public.lead_sources (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);

create table if not exists public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  source_id    uuid references public.lead_sources(id),
  inicio       date,
  fim          date,
  investimento numeric(14,2),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);

-- Etapas do CRM (Kanban) — personalizáveis
create table if not exists public.pipeline_stages (
  codigo         text primary key,
  nome           text not null,
  ordem          int  not null,
  cor            text not null default '#3B82F6',
  tipo           text not null default 'aberto' check (tipo in ('aberto','ganho','perdido')),
  status_padrao  text,          -- status aplicado ao mover o card para esta etapa
  ativo          boolean not null default true
);

-- Status do lead — personalizáveis, cada um aponta para uma etapa do Kanban
create table if not exists public.lead_statuses (
  codigo       text primary key,
  nome         text not null,
  etapa        text not null references public.pipeline_stages(codigo),
  ordem        int  not null,
  cor          text not null default '#64748B',
  exige_motivo boolean not null default false,   -- exige motivo de perda
  ativo        boolean not null default true
);

create table if not exists public.loss_reasons (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  ordem  int not null default 0,
  ativo  boolean not null default true
);

-- Configurações gerais (SLA, leads parados, distribuição...)
create table if not exists public.settings (
  chave       text primary key,
  valor       jsonb not null,
  descricao   text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Regras de distribuição automática
create table if not exists public.distribution_rules (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  prioridade   int  not null default 100,     -- menor = avaliada primeiro
  source_id    uuid references public.lead_sources(id),
  campaign_id  uuid references public.campaigns(id),
  product_id   uuid references public.products(id),
  uf           text,
  team_id      uuid references public.teams(id),     -- destino: equipe
  corretor_id  uuid references public.profiles(id),  -- destino: corretor fixo
  metodo       text not null default 'rodizio' check (metodo in ('rodizio','disponibilidade','fixo')),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

-- ---------------------------------------------------------------------
-- LEADS
-- Toda tabela operacional carrega corretor_id / supervisor_id / gerente_id / team_id
-- (preenchidos por trigger). As políticas RLS usam essas colunas.
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                    uuid primary key default gen_random_uuid(),
  -- dados pessoais
  nome                  text not null,
  cpf                   text,
  data_nascimento       date,
  telefone              text,
  whatsapp              text,
  email                 text,
  cidade                text,
  uf                    text,
  -- comercial
  tipo_pessoa           text not null default 'PF' check (tipo_pessoa in ('PF','PJ')),
  modalidade            text not null default 'individual' check (modalidade in ('individual','familiar','empresarial','adesao')),
  empresa               text,
  cnpj                  text,
  num_vidas             int not null default 1 check (num_vidas > 0),
  faixa_etaria          text,
  operator_id           uuid references public.operators(id),
  product_id            uuid references public.products(id),
  valor_pretendido      numeric(14,2),
  valor_cotacao         numeric(14,2),
  source_id             uuid references public.lead_sources(id),
  campaign_id           uuid references public.campaigns(id),
  entrada_em            timestamptz not null default now(),
  observacao            text,
  -- responsáveis
  corretor_id           uuid references public.profiles(id),
  supervisor_id         uuid references public.profiles(id),
  gerente_id            uuid references public.profiles(id),
  team_id               uuid references public.teams(id),
  -- funil
  status                text not null default 'novo' references public.lead_statuses(codigo),
  etapa                 text not null default 'novos' references public.pipeline_stages(codigo),
  etapa_desde           timestamptz not null default now(),
  temperatura           text not null default 'morno' check (temperatura in ('quente','morno','frio')),
  temperatura_auto      boolean not null default true,
  prioritario           boolean not null default false,
  loss_reason_id        uuid references public.loss_reasons(id),
  motivo_perda_obs      text,
  -- SLA e contato
  distribuido_em        timestamptz,
  primeiro_contato_em   timestamptz,
  ultimo_contato_em     timestamptz,
  proximo_followup_em   timestamptz,
  tentativas_contato    int not null default 0,
  alerta_nivel          int not null default 0,   -- 0 ok | 1 alertou corretor | 2 alertou supervisor | 3 elegível p/ redistribuição
  -- conversão
  client_id             uuid,
  -- integrações futuras
  origem_externa        text,
  id_externo            text,
  -- controle
  anonimizado_em        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  deleted_at            timestamptz,
  assigned_at           timestamptz,
  assigned_by           uuid
);
create index if not exists leads_corretor_idx    on public.leads(corretor_id) where deleted_at is null;
create index if not exists leads_supervisor_idx  on public.leads(supervisor_id) where deleted_at is null;
create index if not exists leads_gerente_idx     on public.leads(gerente_id) where deleted_at is null;
create index if not exists leads_status_idx      on public.leads(status);
create index if not exists leads_etapa_idx       on public.leads(etapa);
create index if not exists leads_entrada_idx     on public.leads(entrada_em desc);
create index if not exists leads_source_idx      on public.leads(source_id);
create index if not exists leads_campaign_idx    on public.leads(campaign_id);
create index if not exists leads_cpf_idx         on public.leads(cpf);
create index if not exists leads_email_idx       on public.leads(lower(email));
create index if not exists leads_whatsapp_idx    on public.leads(whatsapp);
create index if not exists leads_followup_idx    on public.leads(proximo_followup_em);

create table if not exists public.lead_assignments (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references public.leads(id) on delete cascade,
  corretor_anterior  uuid references public.profiles(id),
  corretor_novo      uuid references public.profiles(id),
  distribuido_por    uuid references public.profiles(id),
  metodo             text not null default 'manual',   -- manual, rodizio, equipe, disponibilidade, origem, campanha, produto, regiao, lote, redistribuicao
  motivo             text,
  created_at         timestamptz not null default now()
);
create index if not exists lead_assignments_lead_idx on public.lead_assignments(lead_id, created_at desc);

-- Timeline do lead (nada relevante se perde)
create table if not exists public.lead_history (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  tipo        text not null,     -- criacao, alteracao, distribuicao, responsavel, ligacao, whatsapp, email, reuniao, observacao, cotacao, proposta, status, etapa, documento, pendencia, aprovacao, implantacao, cancelamento, followup, tarefa
  titulo      text not null,
  descricao   text,
  dados       jsonb,
  usuario_id  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists lead_history_lead_idx on public.lead_history(lead_id, created_at desc);

-- ---------------------------------------------------------------------
-- CLIENTES, DEPENDENTES, VENDAS
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  tipo_pessoa       text not null default 'PF' check (tipo_pessoa in ('PF','PJ')),
  nome              text not null,
  razao_social      text,
  cpf               text,
  cnpj              text,
  data_nascimento   date,
  telefone          text,
  whatsapp          text,
  email             text,
  cep               text,
  endereco          text,
  numero            text,
  complemento       text,
  bairro            text,
  cidade            text,
  uf                text,
  lead_id           uuid references public.leads(id),
  operator_id       uuid references public.operators(id),
  product_id        uuid references public.products(id),
  num_vidas         int not null default 1,
  data_venda        date,
  vigencia          date,
  valor_mensal      numeric(14,2),
  numero_proposta   text,
  carteirinha       text,
  status            text not null default 'implantacao' check (status in ('ativo','implantacao','pendencia','cancelado','inadimplente','migracao','renovacao')),
  source_id         uuid references public.lead_sources(id),
  corretor_id       uuid references public.profiles(id),
  supervisor_id     uuid references public.profiles(id),
  gerente_id        uuid references public.profiles(id),
  team_id           uuid references public.teams(id),
  anonimizado_em    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  assigned_at timestamptz, assigned_by uuid
);
create index if not exists clients_corretor_idx   on public.clients(corretor_id) where deleted_at is null;
create index if not exists clients_supervisor_idx on public.clients(supervisor_id) where deleted_at is null;
create index if not exists clients_gerente_idx    on public.clients(gerente_id) where deleted_at is null;
create index if not exists clients_cpf_idx        on public.clients(cpf);
create index if not exists clients_cnpj_idx       on public.clients(cnpj);
create index if not exists clients_status_idx     on public.clients(status);

alter table public.leads drop constraint if exists leads_client_fk;
alter table public.leads add constraint leads_client_fk foreign key (client_id) references public.clients(id);

create table if not exists public.dependents (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  nome             text not null,
  cpf              text,
  data_nascimento  date,
  parentesco       text,
  product_id       uuid references public.products(id),
  valor            numeric(14,2),
  status           text not null default 'ativo' check (status in ('ativo','implantacao','cancelado','suspenso')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists dependents_client_idx on public.dependents(client_id);

create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete cascade,
  client_id       uuid references public.clients(id),
  sale_id         uuid,
  operator_id     uuid references public.operators(id),
  product_id      uuid references public.products(id),
  num_vidas       int,
  valor_mensal    numeric(14,2),
  detalhes        jsonb,
  status          text not null default 'elaboracao' check (status in ('elaboracao','enviada','aceita','recusada')),
  enviada_em      timestamptz,
  observacao      text,
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists quotes_lead_idx on public.quotes(lead_id);

create table if not exists public.proposals (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id),
  client_id       uuid references public.clients(id),
  sale_id         uuid,
  quote_id        uuid references public.quotes(id),
  numero          text,
  operator_id     uuid references public.operators(id),
  product_id      uuid references public.products(id),
  num_vidas       int,
  valor_mensal    numeric(14,2),
  status          text not null default 'enviada' check (status in ('rascunho','enviada','em_analise','pendencia','aprovada','recusada','cancelada')),
  enviada_em      timestamptz default now(),
  aberta_em       timestamptz,     -- abertura da proposta pelo cliente (integração futura)
  status_desde    timestamptz not null default now(),
  observacao      text,
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists proposals_lead_idx on public.proposals(lead_id);
create index if not exists proposals_status_idx on public.proposals(status);
create index if not exists proposals_numero_idx on public.proposals(numero);

create table if not exists public.sales (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients(id),
  lead_id           uuid references public.leads(id),
  proposal_id       uuid references public.proposals(id),
  operator_id       uuid references public.operators(id),
  product_id        uuid references public.products(id),
  tipo_plano        text,
  num_vidas         int not null default 1,
  valor_mensal      numeric(14,2) not null default 0,
  valor_total       numeric(14,2),
  numero_proposta   text,
  data_venda        date not null default current_date,
  data_implantacao  date,
  vigencia          date,
  source_id         uuid references public.lead_sources(id),
  campaign_id       uuid references public.campaigns(id),
  status            text not null default 'proposta_enviada' check (status in ('proposta_enviada','em_analise','pendencia','aprovada','implantada','recusada','cancelada')),
  status_desde      timestamptz not null default now(),
  cancelada_em      timestamptz,
  motivo_cancelamento text,
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  assigned_at timestamptz, assigned_by uuid
);
create index if not exists sales_corretor_idx   on public.sales(corretor_id) where deleted_at is null;
create index if not exists sales_supervisor_idx on public.sales(supervisor_id) where deleted_at is null;
create index if not exists sales_gerente_idx    on public.sales(gerente_id) where deleted_at is null;
create index if not exists sales_data_idx       on public.sales(data_venda desc);
create index if not exists sales_status_idx     on public.sales(status);
create index if not exists sales_numero_idx     on public.sales(numero_proposta);

alter table public.quotes    drop constraint if exists quotes_sale_fk;
alter table public.quotes    add  constraint quotes_sale_fk foreign key (sale_id) references public.sales(id);
alter table public.proposals drop constraint if exists proposals_sale_fk;
alter table public.proposals add  constraint proposals_sale_fk foreign key (sale_id) references public.sales(id);

-- Implantação (pós-venda operacional)
create table if not exists public.implementations (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null unique references public.sales(id) on delete cascade,
  lead_id        uuid references public.leads(id),
  client_id      uuid references public.clients(id),
  etapa          text not null default 'venda_realizada' check (etapa in ('venda_realizada','documentacao','enviado_operadora','em_analise','pendencia','aprovado','implantado','cancelado')),
  etapa_desde    timestamptz not null default now(),
  responsavel_id uuid references public.profiles(id),
  protocolo      text,
  observacoes    text,
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);

create table if not exists public.implementation_events (
  id                 uuid primary key default gen_random_uuid(),
  implementation_id  uuid not null references public.implementations(id) on delete cascade,
  etapa_anterior     text,
  etapa              text not null,
  descricao          text,
  protocolo          text,
  usuario_id         uuid references public.profiles(id),
  created_at         timestamptz not null default now()
);
create index if not exists impl_events_idx on public.implementation_events(implementation_id, created_at desc);

create table if not exists public.pendencies (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads(id),
  client_id     uuid references public.clients(id),
  sale_id       uuid references public.sales(id),
  descricao     text not null,
  prazo         date,
  status        text not null default 'aberta' check (status in ('aberta','resolvida','cancelada')),
  resolvida_em  timestamptz,
  resolucao     text,
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists pendencies_sale_idx on public.pendencies(sale_id) where status = 'aberta';

-- ---------------------------------------------------------------------
-- ATIVIDADES, FOLLOW-UPS, TAREFAS, AGENDA, NOTAS
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads(id) on delete cascade,
  client_id     uuid references public.clients(id),
  sale_id       uuid references public.sales(id),
  tipo          text not null check (tipo in ('ligacao','whatsapp','email','reuniao','visita','outro')),
  resultado     text,           -- atendeu, nao_atendeu, respondeu, sem_resposta, agendou...
  efetivo       boolean not null default true,   -- houve contato de fato
  descricao     text,
  realizado_em  timestamptz not null default now(),
  usuario_id    uuid references public.profiles(id),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists activities_lead_idx on public.activities(lead_id, realizado_em desc);
create index if not exists activities_corretor_idx on public.activities(corretor_id, realizado_em desc);

create table if not exists public.followups (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete cascade,
  client_id       uuid references public.clients(id),
  sale_id         uuid references public.sales(id),
  tipo            text not null default 'ligacao' check (tipo in ('ligacao','whatsapp','email','reuniao','retorno','envio_proposta','cobranca_documentos','negociacao')),
  agendado_para   timestamptz not null,
  prioridade      text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  observacao      text,
  lembrete_min    int default 15,
  status          text not null default 'pendente' check (status in ('pendente','concluido','cancelado')),
  concluido_em    timestamptz,
  resultado       text,
  alerta_enviado  smallint not null default 0,   -- 1 = lembrete enviado | 2 = aviso de vencido enviado
  responsavel_id  uuid references public.profiles(id),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists followups_agenda_idx on public.followups(status, agendado_para);
create index if not exists followups_lead_idx on public.followups(lead_id);
create index if not exists followups_corretor_idx on public.followups(corretor_id, status);

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text,
  lead_id         uuid references public.leads(id) on delete cascade,
  client_id       uuid references public.clients(id),
  sale_id         uuid references public.sales(id),
  responsavel_id  uuid references public.profiles(id),
  prioridade      text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  prazo           timestamptz,
  status          text not null default 'aberta' check (status in ('aberta','em_andamento','concluida','cancelada')),
  concluida_em    timestamptz,
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists tasks_resp_idx on public.tasks(responsavel_id, status);
create index if not exists tasks_prazo_idx on public.tasks(status, prazo);

create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  tipo            text not null default 'reuniao' check (tipo in ('reuniao','ligacao','retorno','compromisso','vencimento','visita','outro')),
  inicio          timestamptz not null,
  fim             timestamptz,
  local           text,
  descricao       text,
  lead_id         uuid references public.leads(id) on delete cascade,
  client_id       uuid references public.clients(id),
  sale_id         uuid references public.sales(id),
  responsavel_id  uuid references public.profiles(id),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists events_inicio_idx on public.events(inicio);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads(id) on delete cascade,
  client_id   uuid references public.clients(id),
  sale_id     uuid references public.sales(id),
  texto       text not null,
  fixada      boolean not null default false,
  autor_id    uuid references public.profiles(id),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists notes_lead_idx on public.notes(lead_id);
create index if not exists notes_client_idx on public.notes(client_id);

-- ---------------------------------------------------------------------
-- DOCUMENTOS (arquivos no Supabase Storage, bucket privado "documentos")
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads(id),
  client_id     uuid references public.clients(id),
  sale_id       uuid references public.sales(id),
  proposal_id   uuid references public.proposals(id),
  tipo          text not null,       -- rg, cpf, cnh, comprovante_residencia, cartao_cnpj, contrato_social, carteirinha, carta_permanencia, proposta, declaracao_saude, outro
  nome_arquivo  text not null,
  storage_path  text,
  tamanho       bigint,
  mime          text,
  sensivel      boolean not null default false,   -- ex.: declaração de saúde (dado sensível LGPD)
  enviado_por   uuid references public.profiles(id),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz
);
create index if not exists documents_lead_idx on public.documents(lead_id);
create index if not exists documents_client_idx on public.documents(client_id);

-- ---------------------------------------------------------------------
-- METAS e COMISSÕES
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  escopo        text not null check (escopo in ('empresa','gerente','supervisor','corretor','equipe')),
  usuario_id    uuid references public.profiles(id),
  goal_team_id  uuid references public.teams(id),
  mes           date not null,          -- primeiro dia do mês
  tipo          text not null check (tipo in ('qtd_vendas','valor','vidas','conversao')),
  valor_meta    numeric(14,2) not null check (valor_meta >= 0),
  operator_id   uuid references public.operators(id),
  product_id    uuid references public.products(id),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  constraint goals_mes_ck check (extract(day from mes) = 1)
);
create index if not exists goals_mes_idx on public.goals(mes, escopo);

create table if not exists public.commission_rules (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  operator_id     uuid references public.operators(id),
  product_id      uuid references public.products(id),
  corretor_id     uuid references public.profiles(id),
  supervisor_id   uuid references public.profiles(id),
  campaign_id     uuid references public.campaigns(id),
  pct_empresa     numeric(7,2) not null default 100,  -- % da mensalidade recebido pela corretora (por parcela)
  pct_corretor    numeric(7,2) not null default 50,   -- % da mensalidade repassado ao corretor
  pct_supervisor  numeric(7,2) not null default 10,   -- % da mensalidade repassado ao supervisor
  parcelas        int not null default 1 check (parcelas between 1 and 24),
  ativo           boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid
);

create table if not exists public.commissions (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid not null references public.sales(id) on delete cascade,
  lead_id               uuid references public.leads(id),
  client_id             uuid references public.clients(id),
  operator_id           uuid references public.operators(id),
  rule_id               uuid references public.commission_rules(id),
  parcela               int not null default 1,
  valor_venda           numeric(14,2) not null default 0,
  comissao_prevista     numeric(14,2) not null default 0,
  comissao_recebida     numeric(14,2),
  comissao_corretor     numeric(14,2) not null default 0,
  comissao_supervisor   numeric(14,2) not null default 0,
  comissao_empresa      numeric(14,2) not null default 0,
  data_prevista         date,
  data_recebida         date,
  status                text not null default 'prevista' check (status in ('prevista','em_processamento','recebida','paga','cancelada','estornada')),
  corretor_id uuid references public.profiles(id), supervisor_id uuid references public.profiles(id),
  gerente_id uuid references public.profiles(id), team_id uuid references public.teams(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  unique (sale_id, parcela)
);
create index if not exists commissions_status_idx on public.commissions(status, data_prevista);

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES e AUDITORIA
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.profiles(id) on delete cascade,
  tipo        text not null,
  titulo      text not null,
  mensagem    text,
  link        text,
  ref_id      uuid,
  lida        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(usuario_id, lida, created_at desc);

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  usuario_id   uuid,
  acao         text not null,        -- login, criacao, edicao, exclusao, distribuicao, transferencia, status, responsavel...
  tabela       text,
  registro_id  uuid,
  anterior     jsonb,
  novo         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_reg_idx on public.audit_logs(tabela, registro_id);
create index if not exists audit_logs_data_idx on public.audit_logs(created_at desc);

-- Eventos recebidos de integrações (webhooks, Meta Leads, site, WhatsApp...)
create table if not exists public.integration_events (
  id           bigint generated always as identity primary key,
  provedor     text not null,
  payload      jsonb not null,
  processado   boolean not null default false,
  lead_id      uuid references public.leads(id),
  erro         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Visões de apoio exigidas no modelo (gerentes / supervisores / corretores)
-- ---------------------------------------------------------------------
create or replace view public.managers    with (security_invoker = true) as select * from public.profiles where papel = 'gerente'    and deleted_at is null;
create or replace view public.supervisors with (security_invoker = true) as select * from public.profiles where papel = 'supervisor' and deleted_at is null;
create or replace view public.brokers     with (security_invoker = true) as select * from public.profiles where papel = 'corretor'   and deleted_at is null;


-- =====================================================================
--  ATOS SISTEMA — 02_funcoes_triggers.sql
--  Funções internas de hierarquia, carimbo de propriedade, histórico,
--  auditoria e regras automáticas (executadas no servidor).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identidade e hierarquia do usuário logado
-- ---------------------------------------------------------------------
create or replace function private.papel()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select p.papel from public.profiles p
   where p.id = auth.uid() and p.status = 'ativo' and p.deleted_at is null
$$;

create or replace function private.tem_permissao(p_codigo text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.papel() = 'admin', false)
      or exists (select 1 from public.role_permissions rp
                  where rp.role = private.papel() and rp.permission = p_codigo)
$$;

-- Regra central de visibilidade de qualquer registro operacional
create or replace function private.pode_ver(p_corretor uuid, p_supervisor uuid, p_gerente uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(case private.papel()
    when 'admin'      then true
    when 'gerente'    then p_gerente    = auth.uid()
    when 'supervisor' then p_supervisor = auth.uid()
    when 'corretor'   then p_corretor   = auth.uid()
    else false end, false)
$$;

-- O usuário logado pode atribuir registros a este corretor?
create or replace function private.pode_gerir_corretor(p_corretor uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles c
     where c.id = p_corretor and c.papel = 'corretor' and c.status = 'ativo' and c.deleted_at is null
       and case private.papel()
             when 'admin'      then true
             when 'gerente'    then c.gerente_id    = auth.uid()
             when 'supervisor' then c.supervisor_id = auth.uid()
             else false end)
$$;

create or replace function private.hierarquia_de(p_usuario uuid,
  out corretor_id uuid, out supervisor_id uuid, out gerente_id uuid, out team_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.profiles;
begin
  select * into r from public.profiles where id = p_usuario;
  if not found then return; end if;
  if r.papel = 'corretor' then
    corretor_id := r.id; supervisor_id := r.supervisor_id; gerente_id := r.gerente_id; team_id := r.team_id;
  elsif r.papel = 'supervisor' then
    supervisor_id := r.id; gerente_id := r.gerente_id;
    team_id := (select t.id from public.teams t where t.supervisor_id = r.id and t.deleted_at is null order by t.created_at limit 1);
  elsif r.papel = 'gerente' then
    gerente_id := r.id;
  end if;
end $$;

create or replace function private.so_digitos(t text)
returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(t,''), '\D', '', 'g'), '') $$;

create or replace function private.setting(p_chave text, p_padrao jsonb default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select valor from public.settings where chave = p_chave), p_padrao)
$$;

-- ---------------------------------------------------------------------
-- 2. Utilitários de histórico / notificação
-- ---------------------------------------------------------------------
create or replace function private.historico(p_lead uuid, p_tipo text, p_titulo text, p_descricao text default null, p_dados jsonb default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_lead is null then return; end if;
  insert into public.lead_history(lead_id, tipo, titulo, descricao, dados, usuario_id)
  values (p_lead, p_tipo, p_titulo, p_descricao, p_dados, auth.uid());
end $$;

create or replace function private.notificar(p_usuario uuid, p_tipo text, p_titulo text, p_mensagem text default null, p_link text default null, p_ref uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_usuario is null then return; end if;
  insert into public.notifications(usuario_id, tipo, titulo, mensagem, link, ref_id)
  values (p_usuario, p_tipo, p_titulo, p_mensagem, p_link, p_ref);
end $$;

create or replace function private.json_diff(p_old jsonb, p_new jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('de', p_old -> n.key, 'para', n.value)), '{}'::jsonb)
    from jsonb_each(p_new) n
   where n.value is distinct from (p_old -> n.key)
     and n.key not in ('updated_at','updated_by','etapa_desde','status_desde')
$$;

create or replace function private.ordem_etapa(p_etapa text)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select ordem from public.pipeline_stages where codigo = p_etapa
$$;

-- Avança o lead no funil apenas para frente (nunca retrocede automaticamente)
create or replace function private.avancar_lead(p_lead uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_atual text; v_tipo text; v_nova text;
begin
  if p_lead is null then return; end if;
  select l.etapa, s.tipo into v_atual, v_tipo
    from public.leads l join public.pipeline_stages s on s.codigo = l.etapa where l.id = p_lead;
  select etapa into v_nova from public.lead_statuses where codigo = p_status;
  if v_atual is null or v_nova is null or v_tipo <> 'aberto' and p_status not in ('implantado') then return; end if;
  if private.ordem_etapa(v_nova) > private.ordem_etapa(v_atual) then
    update public.leads set status = p_status where id = p_lead;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Carimbo de datas e autoria (created_by / updated_by / updated_at)
-- ---------------------------------------------------------------------
create or replace function private.tg_carimbo()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    new.updated_by := coalesce(new.updated_by, auth.uid());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Propriedade: leads / clients / sales (registros "raiz")
-- ---------------------------------------------------------------------
create or replace function private.tg_dono_raiz()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_papel text := private.papel(); h record;
begin
  -- Corretor só cria registros para si mesmo e nunca transfere
  if v_papel = 'corretor' then
    if tg_op = 'INSERT' then
      new.corretor_id := auth.uid();
    elsif new.corretor_id is distinct from old.corretor_id then
      raise exception 'Corretor não pode transferir registros para outro responsável' using errcode = '42501';
    end if;
  end if;

  -- Exclusão (soft delete) apenas por gestão
  if tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at
     and auth.uid() is not null and coalesce(v_papel,'') not in ('admin','gerente','supervisor') then
    raise exception 'Sem permissão para excluir este registro' using errcode = '42501';
  end if;

  if new.corretor_id is not null then
    select * into h from private.hierarquia_de(new.corretor_id);
    if h.corretor_id is null then
      raise exception 'O responsável informado não é um corretor válido' using errcode = '23514';
    end if;
    new.supervisor_id := h.supervisor_id;
    new.gerente_id    := h.gerente_id;
    new.team_id       := h.team_id;
  else
    -- registro sem corretor (fila da equipe / da gerência)
    if tg_op = 'INSERT' and new.supervisor_id is null and new.gerente_id is null then
      if v_papel = 'supervisor' then new.supervisor_id := auth.uid();
      elsif v_papel = 'gerente' then new.gerente_id := auth.uid();
      end if;
    end if;
    if new.supervisor_id is not null then
      select * into h from private.hierarquia_de(new.supervisor_id);
      new.gerente_id := h.gerente_id;
      new.team_id    := h.team_id;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Propriedade herdada: registros filhos herdam do lead / venda / cliente
-- ---------------------------------------------------------------------
create or replace function private.tg_dono_herdado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare j jsonb := to_jsonb(new); c uuid; s uuid; g uuid; t uuid; h record; v_dono uuid; v_pai boolean := true;
begin
  if (j->>'lead_id') is not null then
    select corretor_id, supervisor_id, gerente_id, team_id into c, s, g, t from public.leads where id = (j->>'lead_id')::uuid;
  elsif (j->>'sale_id') is not null then
    select corretor_id, supervisor_id, gerente_id, team_id into c, s, g, t from public.sales where id = (j->>'sale_id')::uuid;
  elsif (j->>'client_id') is not null then
    select corretor_id, supervisor_id, gerente_id, team_id into c, s, g, t from public.clients where id = (j->>'client_id')::uuid;
  else
    v_pai := false;
    v_dono := coalesce((j->>'responsavel_id')::uuid, auth.uid());
    select * into h from private.hierarquia_de(v_dono);
    c := h.corretor_id; s := h.supervisor_id; g := h.gerente_id; t := h.team_id;
  end if;

  -- não permite vincular a um registro que o usuário não enxerga
  if v_pai and auth.uid() is not null and not private.pode_ver(c, s, g) then
    raise exception 'Sem permissão para vincular a este registro' using errcode = '42501';
  end if;

  new.corretor_id := c; new.supervisor_id := s; new.gerente_id := g; new.team_id := t;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. Metas: propriedade conforme o escopo
-- ---------------------------------------------------------------------
create or replace function private.tg_dono_meta()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare h record;
begin
  new.mes := date_trunc('month', new.mes)::date;
  new.corretor_id := null; new.supervisor_id := null; new.gerente_id := null; new.team_id := null;
  if new.escopo in ('corretor','supervisor','gerente') and new.usuario_id is not null then
    select * into h from private.hierarquia_de(new.usuario_id);
    new.corretor_id := h.corretor_id; new.supervisor_id := h.supervisor_id; new.gerente_id := h.gerente_id; new.team_id := h.team_id;
  elsif new.escopo = 'equipe' and new.goal_team_id is not null then
    select supervisor_id, gerente_id, id into new.supervisor_id, new.gerente_id, new.team_id from public.teams where id = new.goal_team_id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 7. LEADS — regras antes de gravar
-- ---------------------------------------------------------------------
create or replace function private.calc_temperatura(l public.leads)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v int := 0; o int := coalesce(private.ordem_etapa(l.etapa), 1);
begin
  if l.tentativas_contato >= 1 then v := v + 1; end if;
  if l.tentativas_contato >= 3 then v := v + 1; end if;
  if o between 4 and 4 then v := v + 1; elsif o between 5 and 6 then v := v + 2; elsif o between 7 and 8 then v := v + 3; end if;
  if l.valor_cotacao is not null then v := v + 1; end if;
  if l.ultimo_contato_em > now() - interval '24 hours' then v := v + 1;
  elsif coalesce(l.ultimo_contato_em, l.entrada_em) < now() - interval '72 hours' then v := v - 2; end if;
  if l.proximo_followup_em between now() and now() + interval '24 hours' then v := v + 1; end if;
  if l.prioritario then v := v + 1; end if;
  if l.entrada_em > now() - interval '24 hours' and l.primeiro_contato_em is null then v := v + 2; end if;  -- lead recém-chegado
  return case when v >= 4 then 'quente' when v >= 2 then 'morno' else 'frio' end;
end $$;

create or replace function private.tg_leads_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_st public.lead_statuses; v_etapa public.pipeline_stages;
begin
  -- normalização para busca e detecção de duplicidade
  new.cpf      := private.so_digitos(new.cpf);
  new.cnpj     := private.so_digitos(new.cnpj);
  new.telefone := private.so_digitos(new.telefone);
  new.whatsapp := private.so_digitos(new.whatsapp);
  new.email    := nullif(lower(trim(new.email)), '');
  new.uf       := upper(nullif(trim(new.uf), ''));

  -- sincroniza status ↔ etapa do Kanban
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select * into v_st from public.lead_statuses where codigo = new.status;
    new.etapa := v_st.etapa;
  elsif new.etapa is distinct from old.etapa then
    select * into v_etapa from public.pipeline_stages where codigo = new.etapa;
    select * into v_st from public.lead_statuses where codigo = new.status;
    if v_st.etapa is distinct from new.etapa then
      new.status := coalesce(v_etapa.status_padrao, (select codigo from public.lead_statuses where etapa = new.etapa order by ordem limit 1));
    end if;
  end if;

  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
  end if;

  -- motivo de perda obrigatório
  select * into v_st from public.lead_statuses where codigo = new.status;
  if v_st.exige_motivo and new.loss_reason_id is null then
    raise exception 'Informe o motivo da perda para marcar o lead como "%"', v_st.nome using errcode = '23514';
  end if;
  if not v_st.exige_motivo then
    new.loss_reason_id := null; new.motivo_perda_obs := null;
  end if;

  -- atribuição
  if new.corretor_id is not null and (tg_op = 'INSERT' or new.corretor_id is distinct from old.corretor_id) then
    new.assigned_at    := now();
    new.assigned_by    := auth.uid();
    new.distribuido_em := coalesce(new.distribuido_em, now());
    new.alerta_nivel   := 0;
  end if;

  if new.temperatura_auto then
    new.temperatura := private.calc_temperatura(new);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 8. LEADS — depois de gravar: histórico, distribuição, notificações
-- ---------------------------------------------------------------------
create or replace function private.tg_leads_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_motivo text := nullif(current_setting('atos.motivo', true), '');
  v_metodo text := coalesce(nullif(current_setting('atos.metodo', true), ''), 'manual');
  v_diff jsonb; v_nome_st text; v_nome_perda text; v_nome_ant text; v_nome_novo text; e record;
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
      end if;
    elsif new.supervisor_id is not null then
      perform private.notificar(new.supervisor_id, 'novo_lead', 'Novo lead na fila da equipe', new.nome, '#/leads/' || new.id, new.id);
    end if;
    return new;
  end if;

  -- troca de responsável
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
    -- registros vinculados acompanham o novo responsável (histórico é preservado)
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
    -- lead perdido: follow-ups pendentes são cancelados
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
                    'distribuido_em','alerta_nivel','ultimo_contato_em','primeiro_contato_em','tentativas_contato','proximo_followup_em',
                    'deleted_at','valor_cotacao','client_id','loss_reason_id','motivo_perda_obs'];
  if v_diff <> '{}'::jsonb then
    perform private.historico(new.id, 'alteracao', 'Dados atualizados',
      (select string_agg(k, ', ') from jsonb_object_keys(v_diff) k), v_diff);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 9. Guarda de perfis (ninguém altera o próprio papel / hierarquia)
-- ---------------------------------------------------------------------
create or replace function private.tg_profiles_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_papel text := private.papel();
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and coalesce(v_papel,'') <> 'admin' then
    if new.papel is distinct from old.papel or new.status is distinct from old.status
       or new.team_id is distinct from old.team_id or new.supervisor_id is distinct from old.supervisor_id
       or new.gerente_id is distinct from old.gerente_id or new.email is distinct from old.email
       or new.recebe_leads is distinct from old.recebe_leads or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Apenas o administrador altera papel, status ou hierarquia de usuários' using errcode = '42501';
    end if;
  end if;

  if new.papel = 'corretor' then
    if new.team_id is not null then
      select supervisor_id into new.supervisor_id from public.teams where id = new.team_id;
    end if;
    new.gerente_id := (select gerente_id from public.profiles where id = new.supervisor_id);
  elsif new.papel = 'supervisor' then
    new.supervisor_id := null;
    new.team_id := coalesce((select id from public.teams where supervisor_id = new.id and deleted_at is null order by created_at limit 1), new.team_id);
  else
    new.supervisor_id := null; new.gerente_id := null; new.team_id := null;
  end if;
  return new;
end $$;

create or replace function private.realinhar_corretor(p_corretor uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare h record; t text;
begin
  select * into h from private.hierarquia_de(p_corretor);
  if h.corretor_id is null then return; end if;
  foreach t in array array['leads','clients','sales','quotes','proposals','implementations','pendencies','activities',
                           'followups','tasks','events','notes','documents','commissions','goals'] loop
    execute format('update public.%I set supervisor_id = $1, gerente_id = $2, team_id = $3 where corretor_id = $4
                     and (supervisor_id is distinct from $1 or gerente_id is distinct from $2 or team_id is distinct from $3)', t)
      using h.supervisor_id, h.gerente_id, h.team_id, p_corretor;
  end loop;
end $$;

create or replace function private.tg_profiles_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t text;
begin
  if new.papel = 'corretor' and (new.supervisor_id is distinct from old.supervisor_id or new.gerente_id is distinct from old.gerente_id
                                 or new.team_id is distinct from old.team_id) then
    perform private.realinhar_corretor(new.id);
    insert into public.audit_logs(usuario_id, acao, tabela, registro_id, anterior, novo)
    values (auth.uid(), 'hierarquia', 'profiles', new.id,
            jsonb_build_object('supervisor_id', old.supervisor_id, 'gerente_id', old.gerente_id, 'team_id', old.team_id),
            jsonb_build_object('supervisor_id', new.supervisor_id, 'gerente_id', new.gerente_id, 'team_id', new.team_id));
  end if;
  if new.papel = 'supervisor' and new.gerente_id is distinct from old.gerente_id then
    update public.teams set gerente_id = new.gerente_id where supervisor_id = new.id;
    update public.profiles set gerente_id = new.gerente_id where supervisor_id = new.id and papel = 'corretor';
    foreach t in array array['leads','clients','sales','goals'] loop
      execute format('update public.%I set gerente_id = $1 where supervisor_id = $2 and corretor_id is null', t)
        using new.gerente_id, new.id;
    end loop;
  end if;
  return new;
end $$;

create or replace function private.tg_teams_antes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.gerente_id := coalesce((select gerente_id from public.profiles where id = new.supervisor_id), new.gerente_id);
  return new;
end $$;

create or replace function private.tg_teams_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    update public.profiles set team_id = new.id where id = new.supervisor_id and papel = 'supervisor' and team_id is distinct from new.id;
    update public.profiles set supervisor_id = new.supervisor_id where team_id = new.id and papel = 'corretor';
  end if;
  return new;
end $$;

-- Novo usuário do Supabase Auth → perfil pendente (o e-mail master vira admin)
create or replace function private.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_master text := coalesce(private.setting('admin_master_email') #>> '{}', 'gbastossaude@gmail.com');
begin
  insert into public.profiles(id, email, nome, papel, status)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          case when lower(new.email) = lower(v_master) then 'admin' else 'corretor' end,
          case when lower(new.email) = lower(v_master) then 'ativo' else 'pendente' end)
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 10. Atividades → atualizam SLA, tentativas e timeline do lead
-- ---------------------------------------------------------------------
create or replace function private.tg_atividade_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_titulo text; l public.leads;
begin
  if new.lead_id is null then return new; end if;
  select * into l from public.leads where id = new.lead_id;
  update public.leads set
      ultimo_contato_em   = greatest(coalesce(ultimo_contato_em, new.realizado_em), new.realizado_em),
      primeiro_contato_em = coalesce(primeiro_contato_em, new.realizado_em),
      tentativas_contato  = tentativas_contato + 1,
      alerta_nivel        = 0,
      status = case when status = 'novo' then case when new.efetivo then 'contato_realizado' else 'tentativa_contato' end
                    when status = 'tentativa_contato' and new.efetivo then 'contato_realizado'
                    else status end
   where id = new.lead_id;
  v_titulo := case new.tipo when 'ligacao' then 'Ligação' when 'whatsapp' then 'WhatsApp' when 'email' then 'E-mail'
                            when 'reuniao' then 'Reunião' when 'visita' then 'Visita' else 'Contato' end
              || case when new.efetivo then ' realizado' else ' — sem sucesso' end
              || coalesce(' (' || new.resultado || ')', '');
  perform private.historico(new.lead_id, new.tipo, v_titulo, new.descricao, jsonb_build_object('activity_id', new.id));
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 11. Follow-ups → próximo follow-up do lead + timeline
-- ---------------------------------------------------------------------
create or replace function private.tg_followup_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  r := coalesce(new, old);
  if r.lead_id is not null then
    update public.leads set proximo_followup_em = (
      select min(agendado_para) from public.followups
       where lead_id = r.lead_id and status = 'pendente' and deleted_at is null)
     where id = r.lead_id;
    if tg_op = 'INSERT' then
      perform private.historico(r.lead_id, 'followup', 'Follow-up agendado para ' || to_char(new.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), new.observacao, jsonb_build_object('tipo', new.tipo));
    elsif tg_op = 'UPDATE' and new.status = 'concluido' and old.status <> 'concluido' then
      perform private.historico(r.lead_id, 'followup', 'Follow-up concluído', new.resultado, jsonb_build_object('tipo', new.tipo));
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 12. Cotações e propostas → avançam o funil
-- ---------------------------------------------------------------------
create or replace function private.tg_status_desde()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then new.status_desde := now(); end if;
  return new;
end $$;

create or replace function private.tg_cotacao_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'INSERT' and new.status = 'elaboracao' then
    perform private.avancar_lead(new.lead_id, 'cotacao_elaboracao');
  end if;
  if new.status = 'enviada' and (tg_op = 'INSERT' or old.status <> 'enviada') then
    update public.quotes set enviada_em = coalesce(enviada_em, now()) where id = new.id and enviada_em is null;
    update public.leads set valor_cotacao = new.valor_mensal where id = new.lead_id;
    perform private.historico(new.lead_id, 'cotacao', 'Cotação enviada',
      coalesce((select nome from public.operators where id = new.operator_id), '') || coalesce(' — R$ ' || to_char(new.valor_mensal, 'FM999G999G990D00'), ''),
      jsonb_build_object('quote_id', new.id));
    perform private.avancar_lead(new.lead_id, 'cotacao_enviada');
  end if;
  return new;
end $$;

create or replace function private.tg_proposta_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rot text;
begin
  if new.lead_id is null then return new; end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_rot := case new.status when 'enviada' then 'Proposta enviada' when 'em_analise' then 'Proposta em análise'
              when 'pendencia' then 'Proposta com pendência' when 'aprovada' then 'Proposta aprovada'
              when 'recusada' then 'Proposta recusada' when 'cancelada' then 'Proposta cancelada' else 'Proposta registrada' end;
    perform private.historico(new.lead_id, 'proposta', v_rot || coalesce(' nº ' || new.numero, ''), new.observacao, jsonb_build_object('proposal_id', new.id));
    perform private.avancar_lead(new.lead_id, case new.status when 'enviada' then 'proposta_enviada' when 'em_analise' then 'em_analise'
                                                              when 'pendencia' then 'pendencia' else null end);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 13. Vendas → implantação, comissões, cliente, funil, notificações
-- ---------------------------------------------------------------------
create or replace function private.venda_para_impl(p text) returns text language sql immutable as $$
  select case p when 'em_analise' then 'em_analise' when 'pendencia' then 'pendencia' when 'aprovada' then 'aprovado'
                when 'implantada' then 'implantado' when 'cancelada' then 'cancelado' when 'recusada' then 'cancelado' else null end
$$;
create or replace function private.impl_para_venda(p text) returns text language sql immutable as $$
  select case p when 'enviado_operadora' then 'em_analise' when 'em_analise' then 'em_analise' when 'pendencia' then 'pendencia'
                when 'aprovado' then 'aprovada' when 'implantado' then 'implantada' when 'cancelado' then 'cancelada' else null end
$$;

create or replace function private.gerar_comissoes(p_sale uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.sales; r public.commission_rules; v_padrao jsonb; i int; v_parc int;
        v_emp numeric; v_cor numeric; v_sup numeric; v_base date;
begin
  select * into s from public.sales where id = p_sale;
  if not found then return; end if;
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
  v_base := coalesce(s.vigencia, s.data_venda);
  for i in 1..v_parc loop
    insert into public.commissions(sale_id, lead_id, client_id, operator_id, rule_id, parcela, valor_venda,
                                   comissao_prevista, comissao_corretor, comissao_supervisor, comissao_empresa, data_prevista, status)
    values (s.id, s.lead_id, s.client_id, s.operator_id, r.id, i, s.valor_mensal,
            round(s.valor_mensal * v_emp / 100, 2), round(s.valor_mensal * v_cor / 100, 2),
            round(s.valor_mensal * v_sup / 100, 2),
            round(s.valor_mensal * v_emp / 100, 2) - round(s.valor_mensal * v_cor / 100, 2) - round(s.valor_mensal * v_sup / 100, 2),
            (v_base + (i * interval '1 month'))::date, 'prevista')
    on conflict (sale_id, parcela) do nothing;
  end loop;
end $$;

create or replace function private.tg_venda_antes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_desde := now();
    if new.status = 'cancelada' then new.cancelada_em := coalesce(new.cancelada_em, now()); end if;
    if new.status = 'implantada' then new.data_implantacao := coalesce(new.data_implantacao, current_date); end if;
  end if;
  if new.valor_total is null then new.valor_total := new.valor_mensal * 12; end if;
  new.numero_proposta := nullif(trim(new.numero_proposta), '');
  return new;
end $$;

create or replace function private.tg_venda_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text := case when tg_op = 'UPDATE' then old.status end; v_impl text; v_cli text;
begin
  if tg_op = 'INSERT' then
    insert into public.implementations(sale_id, lead_id, client_id, etapa, responsavel_id)
    values (new.id, new.lead_id, new.client_id, coalesce(private.venda_para_impl(new.status), 'venda_realizada'), new.corretor_id)
    on conflict (sale_id) do nothing;
    perform private.historico(new.lead_id, 'venda', 'Venda registrada', 'R$ ' || to_char(new.valor_mensal, 'FM999G999G990D00') || '/mês — ' || new.num_vidas || ' vida(s)', jsonb_build_object('sale_id', new.id));
  end if;

  if tg_op = 'INSERT' or new.status is distinct from v_old then
    -- propostas vinculadas acompanham o status da venda
    update public.proposals set status = case new.status when 'proposta_enviada' then 'enviada' when 'implantada' then 'aprovada' else new.status end
     where sale_id = new.id and deleted_at is null
       and status is distinct from (case new.status when 'proposta_enviada' then 'enviada' when 'implantada' then 'aprovada' else new.status end);
    -- sincroniza implantação (sem laço)
    v_impl := private.venda_para_impl(new.status);
    if tg_op = 'UPDATE' and v_impl is not null then
      update public.implementations set etapa = v_impl
       where sale_id = new.id and private.impl_para_venda(etapa) is distinct from new.status;
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

-- ---------------------------------------------------------------------
-- 14. Implantação → eventos e sincronização com a venda
-- ---------------------------------------------------------------------
create or replace function private.tg_impl_antes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then new.etapa_desde := now(); end if;
  return new;
end $$;

create or replace function private.tg_impl_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_venda text;
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa or new.protocolo is distinct from old.protocolo then
    insert into public.implementation_events(implementation_id, etapa_anterior, etapa, descricao, protocolo, usuario_id)
    values (new.id, case when tg_op = 'UPDATE' then old.etapa end, new.etapa,
            nullif(current_setting('atos.obs', true), ''), new.protocolo, auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then
    v_venda := private.impl_para_venda(new.etapa);
    if v_venda is not null then
      update public.sales set status = v_venda where id = new.sale_id and status is distinct from v_venda;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 15. Pendências, documentos e notas
-- ---------------------------------------------------------------------
create or replace function private.tg_pendencia_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead uuid;
begin
  v_lead := coalesce(new.lead_id, (select lead_id from public.sales where id = new.sale_id));
  if tg_op = 'INSERT' then
    perform private.historico(v_lead, 'pendencia', 'Pendência aberta', new.descricao, jsonb_build_object('pendency_id', new.id));
    perform private.notificar(new.corretor_id, 'pendencia', 'Nova pendência', new.descricao, case when new.sale_id is not null then '#/vendas/' || new.sale_id end, new.id);
  elsif new.status = 'resolvida' and old.status <> 'resolvida' then
    update public.pendencies set resolvida_em = now() where id = new.id and resolvida_em is null;
    perform private.historico(v_lead, 'pendencia', 'Pendência resolvida', coalesce(new.resolucao, new.descricao), jsonb_build_object('pendency_id', new.id));
  end if;
  return new;
end $$;

create or replace function private.tg_documento_depois()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.historico(coalesce(new.lead_id, (select lead_id from public.sales where id = new.sale_id)),
    'documento', 'Documento anexado: ' || new.nome_arquivo, new.tipo, jsonb_build_object('document_id', new.id));
  return new;
end $$;

create or replace function private.tg_autor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'notes' then new.autor_id := auth.uid();
    elsif tg_table_name = 'documents' then new.enviado_por := auth.uid();
    elsif tg_table_name = 'activities' then new.usuario_id := coalesce(new.usuario_id, auth.uid());
    end if;
  end if;
  if tg_table_name = 'followups' then
    if new.status = 'concluido' then new.concluido_em := coalesce(new.concluido_em, now()); end if;
  elsif tg_table_name = 'tasks' then
    if new.status = 'concluida' then new.concluida_em := coalesce(new.concluida_em, now()); end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 16. Auditoria genérica (valor anterior → valor novo)
-- ---------------------------------------------------------------------
create or replace function private.tg_auditoria()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_acao text; v_ant jsonb; v_novo jsonb; v_diff jsonb;
begin
  if tg_op = 'INSERT' then
    v_acao := 'criacao'; v_novo := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_acao := 'exclusao'; v_ant := to_jsonb(old);
  else
    v_diff := private.json_diff(to_jsonb(old), to_jsonb(new))
              - array['ultimo_lead_em','ultimo_contato_em','primeiro_contato_em','tentativas_contato','proximo_followup_em',
                      'temperatura','alerta_nivel','etapa_desde','status_desde'];
    if v_diff = '{}'::jsonb then return new; end if;
    select jsonb_object_agg(k, v_diff->k->'de'), jsonb_object_agg(k, v_diff->k->'para')
      into v_ant, v_novo from jsonb_object_keys(v_diff) k;
    v_acao := case
      when v_diff ? 'deleted_at' then 'exclusao'
      when v_diff ? 'corretor_id' then 'transferencia'
      when v_diff ? 'status' then 'status'
      when v_diff ? 'papel' then 'permissao'
      else 'edicao' end;
    if tg_table_name = 'commissions' then v_acao := 'comissao_' || v_acao; end if;
  end if;
  insert into public.audit_logs(usuario_id, acao, tabela, registro_id, anterior, novo)
  values (auth.uid(), v_acao, tg_table_name, coalesce((to_jsonb(coalesce(new, old))->>'id')::uuid, null), v_ant, v_novo);
  return coalesce(new, old);
exception when invalid_text_representation then
  insert into public.audit_logs(usuario_id, acao, tabela, registro_id, anterior, novo)
  values (auth.uid(), v_acao, tg_table_name, null, v_ant, v_novo);
  return coalesce(new, old);
end $$;

-- =====================================================================
--  LIGAÇÃO DOS TRIGGERS
-- =====================================================================
do $$
declare t text;
begin
  -- carimbo de autoria/datas
  foreach t in array array['teams','profiles','operators','products','lead_sources','campaigns','distribution_rules','leads',
    'clients','dependents','quotes','proposals','sales','implementations','pendencies','activities','followups','tasks',
    'events','notes','documents','goals','commission_rules','commissions'] loop
    execute format('drop trigger if exists a00_carimbo on public.%I', t);
    execute format('create trigger a00_carimbo before insert or update on public.%I for each row execute function private.tg_carimbo()', t);
  end loop;

  -- propriedade raiz
  foreach t in array array['leads','clients','sales'] loop
    execute format('drop trigger if exists a10_dono on public.%I', t);
    execute format('create trigger a10_dono before insert or update on public.%I for each row execute function private.tg_dono_raiz()', t);
  end loop;

  -- propriedade herdada
  foreach t in array array['quotes','proposals','implementations','pendencies','activities','followups','tasks','events',
                           'notes','documents','commissions'] loop
    execute format('drop trigger if exists a10_dono on public.%I', t);
    execute format('create trigger a10_dono before insert or update on public.%I for each row execute function private.tg_dono_herdado()', t);
  end loop;

  -- auditoria
  foreach t in array array['leads','clients','sales','proposals','implementations','commissions','profiles','teams','goals',
                           'commission_rules','operators','products','settings','distribution_rules','documents','dependents',
                           'lead_statuses','pipeline_stages','role_permissions'] loop
    execute format('drop trigger if exists z90_auditoria on public.%I', t);
    execute format('create trigger z90_auditoria after insert or update or delete on public.%I for each row execute function private.tg_auditoria()', t);
  end loop;

  foreach t in array array['notes','documents','activities','followups','tasks'] loop
    execute format('drop trigger if exists a05_autor on public.%I', t);
    execute format('create trigger a05_autor before insert or update on public.%I for each row execute function private.tg_autor()', t);
  end loop;
end $$;

drop trigger if exists a10_dono on public.goals;
create trigger a10_dono before insert or update on public.goals for each row execute function private.tg_dono_meta();

drop trigger if exists a20_leads_antes on public.leads;
create trigger a20_leads_antes before insert or update on public.leads for each row execute function private.tg_leads_antes();
drop trigger if exists z10_leads_depois on public.leads;
create trigger z10_leads_depois after insert or update on public.leads for each row execute function private.tg_leads_depois();

drop trigger if exists a20_profiles_antes on public.profiles;
create trigger a20_profiles_antes before insert or update on public.profiles for each row execute function private.tg_profiles_antes();
drop trigger if exists z10_profiles_depois on public.profiles;
create trigger z10_profiles_depois after update on public.profiles for each row execute function private.tg_profiles_depois();

drop trigger if exists a20_teams_antes on public.teams;
create trigger a20_teams_antes before insert or update on public.teams for each row execute function private.tg_teams_antes();
drop trigger if exists z10_teams_depois on public.teams;
create trigger z10_teams_depois after insert or update on public.teams for each row execute function private.tg_teams_depois();

drop trigger if exists z10_atividade on public.activities;
create trigger z10_atividade after insert on public.activities for each row execute function private.tg_atividade_depois();

drop trigger if exists z10_followup on public.followups;
create trigger z10_followup after insert or update or delete on public.followups for each row execute function private.tg_followup_depois();

drop trigger if exists a20_status_desde on public.proposals;
create trigger a20_status_desde before insert or update on public.proposals for each row execute function private.tg_status_desde();
drop trigger if exists z10_cotacao on public.quotes;
create trigger z10_cotacao after insert or update on public.quotes for each row execute function private.tg_cotacao_depois();
drop trigger if exists z10_proposta on public.proposals;
create trigger z10_proposta after insert or update on public.proposals for each row execute function private.tg_proposta_depois();

drop trigger if exists a20_venda_antes on public.sales;
create trigger a20_venda_antes before insert or update on public.sales for each row execute function private.tg_venda_antes();
drop trigger if exists z10_venda_depois on public.sales;
create trigger z10_venda_depois after insert or update on public.sales for each row execute function private.tg_venda_depois();

drop trigger if exists a20_impl_antes on public.implementations;
create trigger a20_impl_antes before insert or update on public.implementations for each row execute function private.tg_impl_antes();
drop trigger if exists z10_impl_depois on public.implementations;
create trigger z10_impl_depois after insert or update on public.implementations for each row execute function private.tg_impl_depois();

drop trigger if exists z10_pendencia on public.pendencies;
create trigger z10_pendencia after insert or update on public.pendencies for each row execute function private.tg_pendencia_depois();

drop trigger if exists z10_documento on public.documents;
create trigger z10_documento after insert on public.documents for each row execute function private.tg_documento_depois();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.tg_novo_usuario();


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


-- =====================================================================
--  ATOS SISTEMA — 05_rpc.sql
--  Funções chamadas pelo front-end (supabase.rpc).
--  • SECURITY INVOKER  → roda com o usuário logado: RLS se aplica.
--  • SECURITY DEFINER  → valida permissão explicitamente antes de agir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DISTRIBUIÇÃO DE LEADS
-- ---------------------------------------------------------------------
create or replace function private.atribuir(p_lead uuid, p_corretor uuid, p_motivo text, p_metodo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('atos.motivo', coalesce(p_motivo, ''), true);
  perform set_config('atos.metodo', coalesce(p_metodo, 'manual'), true);
  update public.leads set corretor_id = p_corretor where id = p_lead;
  perform set_config('atos.motivo', '', true);
  perform set_config('atos.metodo', '', true);
end $$;

create or replace function public.distribuir_lead(p_lead uuid, p_corretor uuid, p_motivo text default null, p_metodo text default 'manual')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.leads;
begin
  if coalesce(private.papel(), '') not in ('admin','gerente','supervisor') then
    raise exception 'Somente administrador, gerente ou supervisor distribuem leads' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead and deleted_at is null;
  if not found or not private.pode_ver(l.corretor_id, l.supervisor_id, l.gerente_id) then
    raise exception 'Lead não encontrado' using errcode = '42501';
  end if;
  if not private.pode_gerir_corretor(p_corretor) then
    raise exception 'O corretor escolhido não pertence à sua estrutura' using errcode = '42501';
  end if;
  if l.corretor_id = p_corretor then return; end if;
  if l.corretor_id is not null and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da transferência' using errcode = '23514';
  end if;
  perform private.atribuir(p_lead, p_corretor, p_motivo, coalesce(p_metodo, 'manual'));
end $$;

-- Escolhe o corretor pela regra de distribuição + rodízio (sem atribuir)
create or replace function private.escolher_corretor(p_lead uuid, p_excluir uuid default null, out corretor uuid, out metodo text, out regra text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare l public.leads; r public.distribution_rules; v_papel text := private.papel(); v_uid uuid := auth.uid();
begin
  select * into l from public.leads where id = p_lead;
  select * into r from public.distribution_rules d
   where d.ativo
     and (d.source_id   is null or d.source_id   = l.source_id)
     and (d.campaign_id is null or d.campaign_id = l.campaign_id)
     and (d.product_id  is null or d.product_id  = l.product_id)
     and (d.uf          is null or d.uf          = l.uf)
   order by d.prioridade,
            (d.campaign_id is not null)::int + (d.product_id is not null)::int + (d.source_id is not null)::int + (d.uf is not null)::int desc
   limit 1;
  regra := r.nome;

  if r.id is not null and r.metodo = 'fixo' and r.corretor_id is not null and r.corretor_id is distinct from p_excluir then
    corretor := r.corretor_id; metodo := 'regra';
    return;
  end if;

  select c.id into corretor
    from public.profiles c
   where c.papel = 'corretor' and c.status = 'ativo' and c.deleted_at is null and c.recebe_leads
     and c.id is distinct from p_excluir
     and (r.team_id is null or c.team_id = r.team_id)
     and (l.supervisor_id is null or c.supervisor_id = l.supervisor_id)
     and (l.gerente_id is null or c.gerente_id = l.gerente_id)
     and (coalesce(r.metodo, 'rodizio') <> 'disponibilidade' or c.disponivel)
     and case when v_uid is null then true
              when v_papel = 'admin' then true
              when v_papel = 'gerente' then c.gerente_id = v_uid
              when v_papel = 'supervisor' then c.supervisor_id = v_uid
              else false end
   order by (l.uf is not null and l.uf = any(c.ufs)) desc, c.disponivel desc, c.ultimo_lead_em nulls first, c.nome
   limit 1;
  metodo := case when r.id is null then 'rodizio'
                 when r.team_id is not null then 'equipe'
                 when r.metodo = 'disponibilidade' then 'disponibilidade'
                 when r.campaign_id is not null then 'campanha'
                 when r.product_id is not null then 'produto'
                 when r.uf is not null then 'regiao'
                 when r.source_id is not null then 'origem'
                 else 'rodizio' end;
end $$;

create or replace function public.distribuir_automatico(p_lead uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.leads; e record;
begin
  if auth.uid() is not null and coalesce(private.papel(), '') not in ('admin','gerente','supervisor') then
    raise exception 'Sem permissão para distribuir leads' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead and deleted_at is null;
  if not found or (auth.uid() is not null and not private.pode_ver(l.corretor_id, l.supervisor_id, l.gerente_id)) then
    raise exception 'Lead não encontrado' using errcode = '42501';
  end if;
  select * into e from private.escolher_corretor(p_lead, l.corretor_id);
  if e.corretor is null then
    return jsonb_build_object('ok', false, 'mensagem', 'Nenhum corretor disponível para esta regra');
  end if;
  perform private.atribuir(p_lead, e.corretor,
    case when l.corretor_id is not null then 'Redistribuição automática' else coalesce('Regra: ' || e.regra, 'Rodízio') end, e.metodo);
  return jsonb_build_object('ok', true, 'corretor_id', e.corretor, 'corretor_nome', private.nome_usuario(e.corretor), 'metodo', e.metodo);
end $$;

-- Distribuição em lote: rodízio entre os corretores escolhidos (ou automático)
create or replace function public.distribuir_leads_lote(p_leads uuid[], p_corretores uuid[] default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; i int := 0; v_ok int := 0; v_err int := 0; n int := coalesce(array_length(p_corretores, 1), 0);
begin
  foreach v_id in array p_leads loop
    begin
      if n > 0 then
        perform public.distribuir_lead(v_id, p_corretores[(i % n) + 1], coalesce(p_motivo, 'Distribuição em lote'), 'lote');
      else
        perform public.distribuir_automatico(v_id);
      end if;
      v_ok := v_ok + 1;
    exception when others then v_err := v_err + 1;
    end;
    i := i + 1;
  end loop;
  return jsonb_build_object('distribuidos', v_ok, 'erros', v_err);
end $$;

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create or replace function public.mover_etapa(p_lead uuid, p_etapa text, p_loss_reason uuid default null, p_obs text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.leads
     set etapa = p_etapa,
         loss_reason_id = coalesce(p_loss_reason, loss_reason_id),
         motivo_perda_obs = coalesce(p_obs, motivo_perda_obs)
   where id = p_lead and deleted_at is null;
  if not found then raise exception 'Lead não encontrado' using errcode = '42501'; end if;
end $$;

create or replace function public.alterar_status_lead(p_lead uuid, p_status text, p_loss_reason uuid default null, p_obs text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.leads
     set status = p_status,
         loss_reason_id = coalesce(p_loss_reason, loss_reason_id),
         motivo_perda_obs = coalesce(p_obs, motivo_perda_obs)
   where id = p_lead and deleted_at is null;
  if not found then raise exception 'Lead não encontrado' using errcode = '42501'; end if;
end $$;

create or replace function public.registrar_atividade(p_lead uuid, p_tipo text, p_efetivo boolean default true,
  p_resultado text default null, p_descricao text default null, p_client uuid default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.activities(lead_id, client_id, tipo, efetivo, resultado, descricao)
  values (p_lead, p_client, p_tipo, p_efetivo, p_resultado, p_descricao) returning id into v_id;
  return v_id;
end $$;

create or replace function public.concluir_followup(p_id uuid, p_resultado text default null,
  p_proximo timestamptz default null, p_tipo_proximo text default null, p_obs_proximo text default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare f public.followups; v_novo uuid;
begin
  update public.followups set status = 'concluido', resultado = p_resultado where id = p_id and status = 'pendente' returning * into f;
  if not found then raise exception 'Follow-up não encontrado ou já concluído' using errcode = '42501'; end if;
  if p_proximo is not null then
    insert into public.followups(lead_id, client_id, sale_id, tipo, agendado_para, prioridade, observacao, responsavel_id)
    values (f.lead_id, f.client_id, f.sale_id, coalesce(p_tipo_proximo, f.tipo), p_proximo, f.prioridade, p_obs_proximo, f.responsavel_id)
    returning id into v_novo;
  end if;
  return v_novo;
end $$;

-- ---------------------------------------------------------------------
-- CONVERSÃO LEAD → CLIENTE + VENDA
-- p_dados: {operator_id, product_id, valor_mensal, num_vidas, numero_proposta, data_venda, vigencia,
--           tipo_plano, status, cpf, cnpj, endereco..., dependentes:[{nome,cpf,data_nascimento,parentesco,valor}]}
-- ---------------------------------------------------------------------
create or replace function public.converter_em_cliente(p_lead uuid, p_dados jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare l public.leads; v_cli uuid; v_sale uuid; d jsonb;
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
      case when coalesce(p_dados->>'status', 'aprovada') = 'implantada' then 'ativo' else 'implantacao' end,
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
          coalesce(p_dados->>'status', 'aprovada'), l.corretor_id, l.supervisor_id, l.gerente_id)
  returning id into v_sale;

  update public.proposals set client_id = v_cli, sale_id = v_sale
   where lead_id = l.id and status not in ('recusada','cancelada') and sale_id is null;
  update public.leads set client_id = v_cli where id = l.id;
  perform private.historico(l.id, 'aprovacao', 'Lead convertido em cliente', null, jsonb_build_object('client_id', v_cli, 'sale_id', v_sale));
  return jsonb_build_object('client_id', v_cli, 'sale_id', v_sale);
end $$;

-- Transferência de carteira de cliente (a produção da venda permanece com quem vendeu)
create or replace function public.transferir_cliente(p_client uuid, p_corretor uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.clients;
begin
  if coalesce(private.papel(), '') not in ('admin','gerente','supervisor') then
    raise exception 'Sem permissão para transferir clientes' using errcode = '42501';
  end if;
  select * into c from public.clients where id = p_client and deleted_at is null;
  if not found or not private.pode_ver(c.corretor_id, c.supervisor_id, c.gerente_id) then
    raise exception 'Cliente não encontrado' using errcode = '42501';
  end if;
  if not private.pode_gerir_corretor(p_corretor) then
    raise exception 'O corretor escolhido não pertence à sua estrutura' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da transferência' using errcode = '23514'; end if;
  update public.clients set corretor_id = p_corretor, assigned_at = now(), assigned_by = auth.uid() where id = p_client;
  update public.followups set responsavel_id = p_corretor where client_id = p_client and lead_id is null and sale_id is null and status = 'pendente';
  update public.tasks     set responsavel_id = p_corretor where client_id = p_client and lead_id is null and sale_id is null and status in ('aberta','em_andamento');
  update public.notes     set updated_at = now() where client_id = p_client and lead_id is null and sale_id is null;
  update public.documents set updated_at = now() where client_id = p_client and lead_id is null and sale_id is null;
  update public.events    set updated_at = now() where client_id = p_client and lead_id is null and sale_id is null;
  insert into public.audit_logs(usuario_id, acao, tabela, registro_id, anterior, novo)
  values (auth.uid(), 'transferencia_cliente', 'clients', p_client, jsonb_build_object('corretor_id', c.corretor_id),
          jsonb_build_object('corretor_id', p_corretor, 'motivo', p_motivo));
end $$;

-- ---------------------------------------------------------------------
-- IMPLANTAÇÃO
-- ---------------------------------------------------------------------
create or replace function public.avancar_implantacao(p_impl uuid, p_etapa text default null, p_obs text default null, p_protocolo text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.implementations;
begin
  select * into i from public.implementations where id = p_impl and deleted_at is null;
  if not found or not private.pode_ver(i.corretor_id, i.supervisor_id, i.gerente_id) then
    raise exception 'Implantação não encontrada' using errcode = '42501';
  end if;
  perform set_config('atos.obs', coalesce(p_obs, ''), true);
  if coalesce(p_etapa, i.etapa) <> i.etapa or coalesce(p_protocolo, i.protocolo) is distinct from i.protocolo then
    update public.implementations set etapa = coalesce(p_etapa, etapa), protocolo = coalesce(p_protocolo, protocolo) where id = p_impl;
  elsif coalesce(p_obs, '') <> '' then
    insert into public.implementation_events(implementation_id, etapa_anterior, etapa, descricao, protocolo, usuario_id)
    values (p_impl, i.etapa, i.etapa, p_obs, i.protocolo, auth.uid());
  end if;
  perform set_config('atos.obs', '', true);
end $$;

-- ---------------------------------------------------------------------
-- DUPLICIDADE (não revela dados de registros fora da carteira do usuário)
-- ---------------------------------------------------------------------
create or replace function public.verificar_duplicidade(p_cpf text default null, p_telefone text default null, p_email text default null, p_ignorar uuid default null)
returns table(tipo text, id uuid, visivel boolean, nome text, status text, responsavel text, criterio text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_cpf text := private.so_digitos(p_cpf); v_tel text := private.so_digitos(p_telefone);
        v_email text := nullif(lower(trim(p_email)), '');
begin
  if private.papel() is null then return; end if;
  if v_tel is not null and length(v_tel) < 8 then v_tel := null; end if;
  if v_cpf is null and v_tel is null and v_email is null then return; end if;

  return query
  select 'lead'::text, l.id, v.ok,
         case when v.ok then l.nome end,
         case when v.ok then (select s.nome from public.lead_statuses s where s.codigo = l.status) end,
         case when v.ok then private.nome_usuario(l.corretor_id)
              else 'Registro pertence a outra carteira — fale com seu supervisor' end,
         concat_ws(', ', case when v_cpf is not null and (l.cpf = v_cpf or l.cnpj = v_cpf) then 'CPF/CNPJ' end,
                         case when v_tel is not null and (right(l.telefone,10) = right(v_tel,10) or right(l.whatsapp,10) = right(v_tel,10)) then 'Telefone' end,
                         case when v_email is not null and l.email = v_email then 'E-mail' end)
    from public.leads l
    cross join lateral (select private.pode_ver(l.corretor_id, l.supervisor_id, l.gerente_id) as ok) v
   where l.deleted_at is null and l.id is distinct from p_ignorar
     and ((v_cpf is not null and (l.cpf = v_cpf or l.cnpj = v_cpf))
       or (v_tel is not null and (right(l.telefone,10) = right(v_tel,10) or right(l.whatsapp,10) = right(v_tel,10)))
       or (v_email is not null and l.email = v_email))
  union all
  select 'cliente'::text, c.id, v.ok,
         case when v.ok then c.nome end,
         case when v.ok then c.status end,
         case when v.ok then private.nome_usuario(c.corretor_id)
              else 'Cliente pertence a outra carteira — fale com seu supervisor' end,
         concat_ws(', ', case when v_cpf is not null and (c.cpf = v_cpf or c.cnpj = v_cpf) then 'CPF/CNPJ' end,
                         case when v_tel is not null and (right(private.so_digitos(c.telefone),10) = right(v_tel,10) or right(private.so_digitos(c.whatsapp),10) = right(v_tel,10)) then 'Telefone' end,
                         case when v_email is not null and lower(c.email) = v_email then 'E-mail' end)
    from public.clients c
    cross join lateral (select private.pode_ver(c.corretor_id, c.supervisor_id, c.gerente_id) as ok) v
   where c.deleted_at is null
     and ((v_cpf is not null and (c.cpf = v_cpf or c.cnpj = v_cpf))
       or (v_tel is not null and (right(private.so_digitos(c.telefone),10) = right(v_tel,10) or right(private.so_digitos(c.whatsapp),10) = right(v_tel,10)))
       or (v_email is not null and lower(c.email) = v_email))
  limit 10;
end $$;

-- ---------------------------------------------------------------------
-- BUSCA GLOBAL (respeita RLS)
-- ---------------------------------------------------------------------
create or replace function public.busca_global(p_termo text)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare t text := '%' || trim(p_termo) || '%'; d text := private.so_digitos(p_termo); r jsonb;
begin
  if length(trim(coalesce(p_termo,''))) < 2 then return '[]'::jsonb; end if;
  if d is not null and length(d) < 3 then d := null; end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into r from (
    (select 'lead' as tipo, l.id, l.nome as titulo,
            concat_ws(' · ', l.empresa, (select s.nome from public.lead_statuses s where s.codigo = l.status), private.nome_usuario(l.corretor_id)) as sub
       from public.leads l
      where l.deleted_at is null and (l.nome ilike t or l.email ilike t or l.empresa ilike t
            or (d is not null and (l.cpf like '%'||d||'%' or l.cnpj like '%'||d||'%' or l.telefone like '%'||d||'%' or l.whatsapp like '%'||d||'%')))
      order by l.updated_at desc limit 8)
    union all
    (select 'cliente', c.id, c.nome, concat_ws(' · ', c.razao_social, c.status, private.nome_usuario(c.corretor_id))
       from public.clients c
      where c.deleted_at is null and (c.nome ilike t or c.razao_social ilike t or c.email ilike t or c.numero_proposta ilike t or c.carteirinha ilike t
            or (d is not null and (c.cpf like '%'||d||'%' or c.cnpj like '%'||d||'%' or private.so_digitos(c.telefone) like '%'||d||'%' or private.so_digitos(c.whatsapp) like '%'||d||'%')))
      order by c.updated_at desc limit 8)
    union all
    (select 'venda', s.id, coalesce(cl.nome, 'Venda') || coalesce(' · nº ' || s.numero_proposta, ''), s.status
       from public.sales s left join public.clients cl on cl.id = s.client_id
      where s.deleted_at is null and s.numero_proposta ilike t
      limit 5)
  ) x;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- IMPORTAÇÃO DE LEADS (CSV/Excel já mapeados no front-end)
-- p_modo_duplicado: 'ignorar' | 'atualizar' | 'importar'
-- ---------------------------------------------------------------------
create or replace function public.importar_leads(p_linhas jsonb, p_modo_duplicado text default 'ignorar',
  p_corretor uuid default null, p_source uuid default null, p_campaign uuid default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare r jsonb; dup record; v_ins int := 0; v_upd int := 0; v_ign int := 0; v_erros jsonb := '[]'; n int := 0;
begin
  if p_corretor is not null and private.papel() <> 'corretor' and not private.pode_gerir_corretor(p_corretor) then
    raise exception 'O corretor escolhido não pertence à sua estrutura' using errcode = '42501';
  end if;
  perform set_config('atos.metodo', 'importacao', true);
  for r in select * from jsonb_array_elements(p_linhas) loop
    n := n + 1;
    begin
      if coalesce(trim(r->>'nome'), '') = '' then raise exception 'Nome em branco'; end if;
      select * into dup from public.verificar_duplicidade(r->>'cpf', coalesce(r->>'whatsapp', r->>'telefone'), r->>'email') where tipo = 'lead' limit 1;
      if dup.id is not null and p_modo_duplicado = 'ignorar' then
        v_ign := v_ign + 1; continue;
      elsif dup.id is not null and p_modo_duplicado = 'atualizar' then
        if not dup.visivel then
          v_ign := v_ign + 1;
          v_erros := v_erros || jsonb_build_object('linha', n, 'erro', 'Duplicado em outra carteira — não atualizado');
          continue;
        end if;
        update public.leads set
          nome = coalesce(nullif(r->>'nome',''), nome), email = coalesce(nullif(r->>'email',''), email),
          telefone = coalesce(nullif(r->>'telefone',''), telefone), whatsapp = coalesce(nullif(r->>'whatsapp',''), whatsapp),
          cidade = coalesce(nullif(r->>'cidade',''), cidade), uf = coalesce(nullif(r->>'uf',''), uf),
          num_vidas = coalesce((r->>'num_vidas')::int, num_vidas), observacao = coalesce(nullif(r->>'observacao',''), observacao)
         where id = dup.id;
        v_upd := v_upd + 1; continue;
      end if;
      insert into public.leads(nome, cpf, data_nascimento, telefone, whatsapp, email, cidade, uf, tipo_pessoa, modalidade, empresa, cnpj,
                               num_vidas, valor_pretendido, source_id, campaign_id, observacao, corretor_id)
      values (trim(r->>'nome'), r->>'cpf', (r->>'data_nascimento')::date, r->>'telefone', coalesce(r->>'whatsapp', r->>'telefone'), r->>'email',
              r->>'cidade', r->>'uf', coalesce(nullif(r->>'tipo_pessoa',''), 'PF'), coalesce(nullif(r->>'modalidade',''), 'individual'),
              r->>'empresa', r->>'cnpj', coalesce((r->>'num_vidas')::int, 1), (r->>'valor_pretendido')::numeric,
              coalesce((r->>'source_id')::uuid, p_source), coalesce((r->>'campaign_id')::uuid, p_campaign), r->>'observacao', p_corretor);
      v_ins := v_ins + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_object('linha', n, 'erro', sqlerrm);
    end;
  end loop;
  perform set_config('atos.metodo', '', true);
  return jsonb_build_object('inseridos', v_ins, 'atualizados', v_upd, 'ignorados', v_ign, 'erros', v_erros);
end $$;

-- ---------------------------------------------------------------------
-- PERFIL, NOTIFICAÇÕES, LGPD
-- ---------------------------------------------------------------------
create or replace function public.atualizar_meu_perfil(p_nome text default null, p_telefone text default null, p_disponivel boolean default null)
returns void language sql security invoker set search_path = public, pg_temp as $$
  update public.profiles set nome = coalesce(nullif(trim(p_nome), ''), nome), telefone = coalesce(p_telefone, telefone),
         disponivel = coalesce(p_disponivel, disponivel)
   where id = auth.uid();
$$;

create or replace function public.marcar_notificacoes_lidas(p_ids uuid[] default null)
returns void language sql security invoker set search_path = public, pg_temp as $$
  update public.notifications set lida = true where usuario_id = auth.uid() and not lida and (p_ids is null or id = any(p_ids));
$$;

create or replace function public.registrar_login()
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs(usuario_id, acao, tabela, registro_id) select auth.uid(), 'login', 'profiles', auth.uid() where auth.uid() is not null;
$$;

create or replace function public.anonimizar_lead(p_lead uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(private.papel(), '') <> 'admin' then raise exception 'Somente o administrador pode anonimizar dados' using errcode = '42501'; end if;
  update public.leads set nome = 'Titular anonimizado', cpf = null, cnpj = null, telefone = null, whatsapp = null, email = null,
         data_nascimento = null, observacao = null, anonimizado_em = now() where id = p_lead;
  update public.clients set nome = 'Titular anonimizado', cpf = null, telefone = null, whatsapp = null, email = null,
         data_nascimento = null, endereco = null, numero = null, complemento = null, cep = null, anonimizado_em = now()
   where lead_id = p_lead;
  update public.lead_history set descricao = null, dados = null where lead_id = p_lead and tipo in ('alteracao');
end $$;

-- ---------------------------------------------------------------------
-- COMISSÕES DO PRÓPRIO USUÁRIO (sem expor margem da empresa)
-- ---------------------------------------------------------------------
create or replace function public.minhas_comissoes(p_inicio date default null, p_fim date default null)
returns table(id uuid, sale_id uuid, cliente_nome text, operadora_nome text, parcela int, valor_venda numeric,
              minha_comissao numeric, data_prevista date, data_recebida date, status text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.sale_id, cl.nome, o.nome, c.parcela, c.valor_venda,
         case when c.corretor_id = auth.uid() then c.comissao_corretor else c.comissao_supervisor end,
         c.data_prevista, c.data_recebida, c.status
    from public.commissions c
    left join public.clients cl on cl.id = c.client_id
    left join public.operators o on o.id = c.operator_id
   where c.deleted_at is null
     and private.papel() is not null
     and (c.corretor_id = auth.uid() or (c.supervisor_id = auth.uid() and private.papel() = 'supervisor'))
     and (p_inicio is null or c.data_prevista >= p_inicio)
     and (p_fim is null or c.data_prevista <= p_fim)
   order by c.data_prevista desc
$$;

-- ---------------------------------------------------------------------
-- DASHBOARD (SECURITY INVOKER → respeita a hierarquia automaticamente)
-- p_filtros: {corretor_id, supervisor_id, gerente_id, team_id, operator_id, product_id, source_id, campaign_id}
-- ---------------------------------------------------------------------
create or replace function private.meta_valor(p_mes date, f jsonb, p_tipo text default 'valor')
returns numeric language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v numeric; v_papel text := private.papel(); v_mes date := date_trunc('month', p_mes)::date;
begin
  if f->>'corretor_id' is not null then
    select sum(valor_meta) into v from public.goals where deleted_at is null and mes = v_mes and tipo = p_tipo and escopo = 'corretor' and usuario_id = (f->>'corretor_id')::uuid;
    return v;
  end if;
  if f->>'supervisor_id' is null and f->>'team_id' is null and f->>'gerente_id' is null then
    if v_papel = 'admin' then
      select sum(valor_meta) into v from public.goals where deleted_at is null and mes = v_mes and tipo = p_tipo and escopo = 'empresa';
    else
      select sum(valor_meta) into v from public.goals where deleted_at is null and mes = v_mes and tipo = p_tipo and usuario_id = auth.uid();
    end if;
    if v is not null then return v; end if;
  end if;
  select sum(valor_meta) into v from public.goals g
   where g.deleted_at is null and g.mes = v_mes and g.tipo = p_tipo and g.escopo = 'corretor'
     and (f->>'supervisor_id' is null or g.supervisor_id = (f->>'supervisor_id')::uuid)
     and (f->>'gerente_id'    is null or g.gerente_id    = (f->>'gerente_id')::uuid)
     and (f->>'team_id'       is null or g.team_id       = (f->>'team_id')::uuid);
  return v;
end $$;

create or replace function public.dashboard_metricas(p_inicio date, p_fim date, p_filtros jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  f jsonb := coalesce(p_filtros, '{}');
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_hoje timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  v_sla jsonb := private.setting('sla', '{"meta1_min":5,"meta2_min":15}');
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
      'leads_atendimento',   (select count(*) from ll where etapa in ('contato','qualificacao')),
      'leads_negociacao',    (select count(*) from ll where etapa in ('cotacao','negociacao')),
      'cotacoes_enviadas',   (select count(*) from q),
      'propostas_enviadas',  (select count(*) from p where enviada_em >= v_ini and enviada_em < v_fim),
      'propostas_analise',   (select count(*) from p where status = 'em_analise'),
      'vendas_aprovadas',    (select count(*) from sv),
      'vendas_implantadas',  (select count(*) from ss where status = 'implantada' and data_implantacao between p_inicio and p_fim),
      'vendas_canceladas',   (select count(*) from ss where status in ('cancelada','recusada') and coalesce(cancelada_em, status_desde) >= v_ini and coalesce(cancelada_em, status_desde) < v_fim),
      'clientes_ativos',     (select count(*) from cl where status = 'ativo'),
      'followups_atrasados', (select count(*) from fu),
      'tarefas_pendentes',   (select count(*) from tk),
      'valor_vendido',       (select coalesce(sum(valor_mensal), 0) from sv),
      'vidas_vendidas',      (select coalesce(sum(num_vidas), 0) from sv),
      'ticket_medio',        (select coalesce(round(avg(valor_mensal), 2), 0) from sv),
      'conversao_leads',     (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where client_id is not null or etapa in ('aprovado','implantado')) / count(*), 1) end from lp),
      'conversao_propostas', (select case when (select count(*) from p where enviada_em >= v_ini and enviada_em < v_fim) = 0 then 0
                                          else round(100.0 * (select count(*) from sv) / (select count(*) from p where enviada_em >= v_ini and enviada_em < v_fim), 1) end),
      'meta_valor',          v_meta,
      'realizado_mes',       (select coalesce(sum(valor_mensal), 0) from rm),
      'meta_pct',            case when coalesce(v_meta, 0) = 0 then null else round(100 * (select coalesce(sum(valor_mensal), 0) from rm) / v_meta, 1) end
    ),
    'funil', (select coalesce(jsonb_agg(jsonb_build_object('etapa', ps.codigo, 'nome', ps.nome, 'cor', ps.cor,
                 'qtd', (select count(*) from lp where lp.etapa <> 'perdido' and coalesce(private.ordem_etapa(lp.etapa), 0) >= ps.ordem)) order by ps.ordem), '[]')
                from public.pipeline_stages ps where ps.ativo and ps.tipo <> 'perdido'),
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
    'por_operadora', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select coalesce(o.nome, 'Sem operadora') nome, count(*) qtd, sum(sv.valor_mensal) valor, sum(sv.num_vidas) vidas
                        from sv left join public.operators o on o.id = sv.operator_id group by 1) x),
    'por_produto', (select coalesce(jsonb_agg(x order by x.valor desc), '[]') from (
                      select coalesce(pr.nome, 'Sem produto') nome, count(*) qtd, sum(sv.valor_mensal) valor, sum(sv.num_vidas) vidas
                        from sv left join public.products pr on pr.id = sv.product_id group by 1 limit 12) x),
    'por_origem', (select coalesce(jsonb_agg(x order by x.leads desc), '[]') from (
                      select coalesce(src.nome, 'Sem origem') nome, count(*) leads,
                             count(*) filter (where lp.client_id is not null or lp.etapa in ('aprovado','implantado')) vendas,
                             round(100.0 * count(*) filter (where lp.client_id is not null or lp.etapa in ('aprovado','implantado')) / count(*), 1) conversao
                        from lp left join public.lead_sources src on src.id = lp.source_id group by 1) x),
    'conversao_corretor', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
                      select lp.corretor_id id, private.nome_usuario(lp.corretor_id) nome, count(*) leads,
                             count(*) filter (where lp.client_id is not null or lp.etapa in ('aprovado','implantado')) vendas,
                             round(100.0 * count(*) filter (where lp.client_id is not null or lp.etapa in ('aprovado','implantado')) / count(*), 1) conversao
                        from lp where lp.corretor_id is not null group by lp.corretor_id limit 15) x),
    'conversao_equipe', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
                      select coalesce(t.nome, 'Sem equipe') nome, count(*) leads,
                             count(*) filter (where lp.client_id is not null or lp.etapa in ('aprovado','implantado')) vendas,
                             round(100.0 * count(*) filter (where lp.client_id is not null or lp.etapa in ('aprovado','implantado')) / count(*), 1) conversao
                        from lp left join public.teams t on t.id = lp.team_id group by 1) x),
    'metas_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'meta', private.meta_valor(m::date, f),
                     'realizado', (select coalesce(sum(valor_mensal), 0) from ss where status in ('aprovada','implantada') and date_trunc('month', data_venda) = m)) order by m), '[]')
                    from generate_series(date_trunc('month', p_fim) - interval '5 months', date_trunc('month', p_fim), interval '1 month') m),
    'atencao', jsonb_build_object(
      'leads_sem_contato',     (select count(*) from aberto where primeiro_contato_em is null),
      'followups_vencidos',    (select count(*) from fu),
      'propostas_paradas',     (select count(*) from p where status in ('enviada','em_analise','pendencia') and status_desde < now() - interval '48 hours'),
      'vendas_pendencia',      (select count(*) from ss s where s.status = 'pendencia' or exists (select 1 from public.pendencies pe where pe.sale_id = s.id and pe.status = 'aberta' and pe.deleted_at is null)),
      'quentes_sem_interacao', (select count(*) from aberto where temperatura = 'quente' and (ultimo_contato_em is null or ultimo_contato_em < v_hoje))
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

-- ---------------------------------------------------------------------
-- DESEMPENHO POR CORRETOR (Equipe, Performance, Ranking)
-- ---------------------------------------------------------------------
create or replace function public.desempenho_corretores(p_inicio date, p_fim date, p_filtros jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  f jsonb := coalesce(p_filtros, '{}');
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  r jsonb;
begin
  select coalesce(jsonb_agg(x order by x.valor desc, x.nome), '[]') into r from (
    select c.id, c.nome, c.team_id, t.nome as equipe, c.supervisor_id, private.nome_usuario(c.supervisor_id) as supervisor,
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
             count(*) filter (where l.primeiro_contato_em is null and l.etapa not in ('perdido','aprovado','implantado')) as sem_atendimento,
             count(*) filter (where l.etapa = 'perdido' and l.updated_at >= v_ini and l.updated_at < v_fim) as perdidos,
             count(*) filter (where l.entrada_em >= v_ini and l.entrada_em < v_fim and (l.client_id is not null or l.etapa in ('aprovado','implantado'))) as convertidos,
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

-- ---------------------------------------------------------------------
-- INTELIGÊNCIA COMERCIAL (regras sobre dados reais — nada inventado)
-- ---------------------------------------------------------------------
create or replace function public.inteligencia_comercial(p_inicio date, p_fim date)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_dias_mes numeric := extract(day from (date_trunc('month', p_fim) + interval '1 month - 1 day'));
  v_prop numeric := least(1, extract(day from p_fim) / v_dias_mes);
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
               count(*) filter (where l.client_id is not null or l.etapa in ('aprovado','implantado')) vendas,
               round(100.0 * count(*) filter (where l.client_id is not null or l.etapa in ('aprovado','implantado')) / count(*), 1) conversao
          from public.leads l left join public.lead_sources s on s.id = l.source_id
         where l.deleted_at is null and l.entrada_em >= v_ini and l.entrada_em < v_fim group by 1 having count(*) >= 3) x),
    'campanhas', (select coalesce(jsonb_agg(x order by x.conversao desc), '[]') from (
        select c.nome, count(*) leads,
               count(*) filter (where l.client_id is not null or l.etapa in ('aprovado','implantado')) vendas,
               round(100.0 * count(*) filter (where l.client_id is not null or l.etapa in ('aprovado','implantado')) / count(*), 1) conversao
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
         where l.deleted_at is null and l.etapa = 'perdido' and l.updated_at >= v_ini and l.updated_at < v_fim group by 1) x),
    'proximos_fechamento', (select coalesce(jsonb_agg(x), '[]') from (
        select l.id, l.nome, l.etapa, l.temperatura, coalesce(l.valor_cotacao, l.valor_pretendido) valor, private.nome_usuario(l.corretor_id) corretor
          from public.leads l
         where l.deleted_at is null and l.etapa in ('negociacao','proposta','analise','pendencia')
         order by (l.temperatura = 'quente') desc, private.ordem_etapa(l.etapa) desc, coalesce(l.valor_cotacao, l.valor_pretendido) desc nulls last limit 12) x)
  ) into r;
  return r;
end $$;

-- Contexto estruturado de um lead para futuros recursos de IA (somente fatos do sistema)
create or replace function public.contexto_ia_lead(p_lead uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'lead', to_jsonb(l) - array['cpf','cnpj','data_nascimento'],
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('quando', h.created_at, 'tipo', h.tipo, 'titulo', h.titulo, 'descricao', h.descricao) order by h.created_at desc), '[]')
                   from (select * from public.lead_history where lead_id = l.id order by created_at desc limit 50) h),
    'followups_pendentes', (select count(*) from public.followups f where f.lead_id = l.id and f.status = 'pendente' and f.deleted_at is null),
    'cotacoes', (select count(*) from public.quotes q where q.lead_id = l.id and q.deleted_at is null),
    'propostas', (select coalesce(jsonb_agg(jsonb_build_object('status', p.status, 'desde', p.status_desde)), '[]') from public.proposals p where p.lead_id = l.id and p.deleted_at is null))
  from public.v_leads l where l.id = p_lead
$$;

-- ---------------------------------------------------------------------
-- ROTINA AUTOMÁTICA (pg_cron a cada 15 min): leads parados, lembretes,
-- follow-ups vencidos, propostas paradas, aniversariantes, metas
-- ---------------------------------------------------------------------
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

  -- aniversariantes do dia (uma vez por dia)
  if coalesce(private.setting('ultimo_aniversario') #>> '{}', '') <> to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') then
    insert into public.notifications(usuario_id, tipo, titulo, mensagem, link, ref_id)
    select c.corretor_id, 'aniversario', 'Cliente aniversariante hoje', c.nome, '#/clientes/' || c.id, c.id
      from public.clients c
     where c.deleted_at is null and c.corretor_id is not null and c.status = 'ativo'
       and to_char(c.data_nascimento, 'MM-DD') = to_char(now() at time zone 'America/Sao_Paulo', 'MM-DD');
    insert into public.settings(chave, valor, descricao) values ('ultimo_aniversario', to_jsonb(to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')), 'Controle interno')
    on conflict (chave) do update set valor = excluded.valor, updated_at = now();
  end if;

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

-- ---------------------------------------------------------------------
-- ENTRADA DE LEADS EXTERNOS (Edge Function / webhook com service_role)
-- ---------------------------------------------------------------------
create or replace function public.receber_lead_externo(p_provedor text, p_payload jsonb, p_distribuir boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ev bigint; v_lead uuid; v_src uuid; v_camp uuid;
begin
  insert into public.integration_events(provedor, payload) values (p_provedor, p_payload) returning id into v_ev;
  select id into v_src from public.lead_sources where lower(nome) = lower(coalesce(p_payload->>'origem', p_provedor)) limit 1;
  select id into v_camp from public.campaigns where lower(nome) = lower(p_payload->>'campanha') limit 1;
  insert into public.leads(nome, telefone, whatsapp, email, cidade, uf, num_vidas, source_id, campaign_id, observacao, origem_externa, id_externo, modalidade, empresa)
  values (coalesce(nullif(p_payload->>'nome',''), 'Lead sem nome'), p_payload->>'telefone', coalesce(p_payload->>'whatsapp', p_payload->>'telefone'),
          p_payload->>'email', p_payload->>'cidade', p_payload->>'uf', coalesce((p_payload->>'num_vidas')::int, 1), v_src, v_camp,
          p_payload->>'mensagem', p_provedor, p_payload->>'id', coalesce(nullif(p_payload->>'modalidade',''), 'individual'), p_payload->>'empresa')
  returning id into v_lead;
  update public.integration_events set processado = true, lead_id = v_lead where id = v_ev;
  if p_distribuir then perform public.distribuir_automatico(v_lead); end if;
  return v_lead;
exception when others then
  update public.integration_events set erro = sqlerrm where id = v_ev;
  raise;
end $$;

-- Privilégios das RPCs
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
  public.inteligencia_comercial(date, date), public.contexto_ia_lead(uuid), public.processar_alertas()
to authenticated;
-- receber_lead_externo: somente service_role (Edge Function)


-- =====================================================================
--  ATOS SISTEMA — 06_config_inicial.sql
--  Configuração inicial (papéis, permissões, funil, status, origens,
--  motivos de perda, operadoras de exemplo e parâmetros).
--  Tudo pode ser editado depois pelo Administrador em Configurações.
-- =====================================================================

insert into public.roles(codigo, nome, nivel) values
  ('admin','Administrador',100), ('gerente','Gerente',70), ('supervisor','Supervisor',50), ('corretor','Corretor',10)
on conflict (codigo) do update set nome = excluded.nome, nivel = excluded.nivel;

insert into public.permissions(codigo, modulo, descricao) values
  ('usuarios.gerir',        'Equipe',        'Criar, editar e desativar usuários'),
  ('configuracoes.gerir',   'Configurações', 'Alterar operadoras, produtos, status e parâmetros'),
  ('leads.distribuir',      'Leads',         'Distribuir e redistribuir leads'),
  ('leads.importar',        'Leads',         'Importar leads via CSV/Excel'),
  ('leads.excluir',         'Leads',         'Excluir (arquivar) leads'),
  ('clientes.transferir',   'Clientes',      'Transferir clientes entre corretores'),
  ('equipe.ver',            'Equipe',        'Ver gestão da equipe e performance'),
  ('metas.definir',         'Metas',         'Definir metas da estrutura'),
  ('comissoes.ver',         'Comissões',     'Ver comissões da estrutura'),
  ('comissoes.editar',      'Comissões',     'Registrar recebimentos e pagamentos'),
  ('documentos.sensiveis',  'Documentos',    'Ver documentos sensíveis (ex.: declaração de saúde)'),
  ('relatorios.exportar',   'Relatórios',    'Exportar relatórios'),
  ('auditoria.ver',         'Auditoria',     'Consultar logs de auditoria')
on conflict (codigo) do update set modulo = excluded.modulo, descricao = excluded.descricao;

insert into public.role_permissions(role, permission)
select 'admin', codigo from public.permissions
on conflict do nothing;

-- Permissões padrão dos demais papéis: só na primeira instalação
-- (depois o Administrador ajusta em Configurações e isso é preservado)
insert into public.role_permissions(role, permission)
select v.r, v.p from (values
  ('gerente','leads.distribuir'), ('gerente','leads.importar'), ('gerente','leads.excluir'), ('gerente','clientes.transferir'),
  ('gerente','equipe.ver'), ('gerente','metas.definir'), ('gerente','comissoes.ver'), ('gerente','documentos.sensiveis'),
  ('gerente','relatorios.exportar'),
  ('supervisor','leads.distribuir'), ('supervisor','leads.importar'), ('supervisor','leads.excluir'),
  ('supervisor','clientes.transferir'), ('supervisor','equipe.ver'), ('supervisor','relatorios.exportar'),
  ('corretor','relatorios.exportar')) v(r, p)
where not exists (select 1 from public.role_permissions where role <> 'admin')
on conflict do nothing;

-- Etapas do Kanban (só na primeira instalação — as editadas/excluídas são preservadas)
insert into public.pipeline_stages(codigo, nome, ordem, cor, tipo, status_padrao)
select * from (values
  ('novos',       'Novos',        1, '#60A5FA', 'aberto',  'novo'),
  ('contato',     'Contato',      2, '#38BDF8', 'aberto',  'contato_realizado'),
  ('qualificacao','Qualificação', 3, '#22D3EE', 'aberto',  'qualificado'),
  ('cotacao',     'Cotação',      4, '#818CF8', 'aberto',  'cotacao_elaboracao'),
  ('negociacao',  'Negociação',   5, '#A78BFA', 'aberto',  'negociacao'),
  ('proposta',    'Proposta',     6, '#3B82F6', 'aberto',  'proposta_enviada'),
  ('analise',     'Análise',      7, '#2563EB', 'aberto',  'em_analise'),
  ('pendencia',   'Pendência',    8, '#F59E0B', 'aberto',  'pendencia'),
  ('aprovado',    'Aprovado',     9, '#10B981', 'ganho',   'aprovado'),
  ('implantado',  'Implantado',  10, '#059669', 'ganho',   'implantado'),
  ('perdido',     'Perdido',     99, '#EF4444', 'perdido', 'perdido')) v
where not exists (select 1 from public.pipeline_stages)
on conflict (codigo) do nothing;

-- Status do lead (só na primeira instalação)
insert into public.lead_statuses(codigo, nome, etapa, ordem, cor, exige_motivo)
select * from (values
  ('novo',               'Novo',                  'novos',        1, '#60A5FA', false),
  ('tentativa_contato',  'Tentativa de contato',  'contato',      2, '#38BDF8', false),
  ('em_atendimento',     'Em atendimento',        'contato',      3, '#38BDF8', false),
  ('contato_realizado',  'Contato realizado',     'contato',      4, '#0EA5E9', false),
  ('qualificado',        'Qualificado',           'qualificacao', 5, '#22D3EE', false),
  ('cotacao_elaboracao', 'Cotação em elaboração', 'cotacao',      6, '#818CF8', false),
  ('cotacao_enviada',    'Cotação enviada',       'cotacao',      7, '#6366F1', false),
  ('negociacao',         'Negociação',            'negociacao',   8, '#A78BFA', false),
  ('follow_up',          'Follow-up',             'negociacao',   9, '#8B5CF6', false),
  ('proposta_enviada',   'Proposta enviada',      'proposta',    10, '#3B82F6', false),
  ('em_analise',         'Em análise',            'analise',     11, '#2563EB', false),
  ('pendencia',          'Pendência',             'pendencia',   12, '#F59E0B', false),
  ('aprovado',           'Aprovado',              'aprovado',    13, '#10B981', false),
  ('implantado',         'Implantado',            'implantado',  14, '#059669', false),
  ('perdido',            'Perdido',               'perdido',     15, '#EF4444', true),
  ('sem_interesse',      'Sem interesse',         'perdido',     16, '#F87171', true),
  ('sem_contato',        'Sem contato',           'perdido',     17, '#FB7185', true),
  ('cancelado',          'Cancelado',             'perdido',     18, '#DC2626', true)) v
where not exists (select 1 from public.lead_statuses)
on conflict (codigo) do nothing;

insert into public.loss_reasons(nome, ordem)
select v.nome, v.ordem from (values ('Preço',1), ('Sem retorno',2), ('Fechou com concorrente',3), ('Rede insuficiente',4),
  ('Carência',5), ('Operadora',6), ('Desistência',7), ('Sem perfil',8), ('Dados inválidos',9), ('Outro',10)) v(nome, ordem)
where not exists (select 1 from public.loss_reasons);

insert into public.lead_sources(nome)
select v.nome from (values ('Google Ads'), ('Meta Ads'), ('Instagram'), ('Facebook'), ('Site'), ('Indicação'), ('WhatsApp'),
  ('Lista'), ('Parceiro'), ('Cliente'), ('Prospecção'), ('Outro')) v(nome)
where not exists (select 1 from public.lead_sources);

-- Operadoras de exemplo (editáveis / desativáveis — nada fixo no código)
insert into public.operators(nome)
select v.nome from (values ('Amil'), ('Bradesco Saúde'), ('SulAmérica'), ('Porto Saúde'), ('Unimed'), ('Assim'),
  ('Klini'), ('Hapvida'), ('NotreDame Intermédica'), ('Alice')) v(nome)
where not exists (select 1 from public.operators);

insert into public.settings(chave, valor, descricao) values
  ('empresa',          '{"nome":"Atos","slogan":"Gestão comercial para corretoras"}', 'Identificação exibida no sistema'),
  ('admin_master_email', '"gbastossaude@gmail.com"', 'E-mail que vira administrador automaticamente no primeiro acesso'),
  ('sla',              '{"meta1_min":5,"meta2_min":15}', 'Metas de tempo até o primeiro atendimento (minutos)'),
  ('leads_parados',    '{"alerta_corretor_horas":24,"alerta_supervisor_horas":48,"redistribuir_horas":72,"redistribuir_auto":false}', 'Regras de leads sem movimentação'),
  ('distribuicao',     '{"automatica_ao_criar":false}', 'Distribuir automaticamente leads criados sem corretor'),
  ('comissao_padrao',  '{"pct_empresa":100,"pct_corretor":40,"pct_supervisor":10,"parcelas":1}', 'Regra usada quando nenhuma regra específica se aplica')
on conflict (chave) do nothing;


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
