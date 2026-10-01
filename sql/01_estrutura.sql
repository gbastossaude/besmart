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
