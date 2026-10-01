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
