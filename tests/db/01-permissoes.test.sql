-- Permissões no banco: cada promessa da tela precisa valer pela API também.
-- Roda como superusuário e troca de papel com _como(uuid) (ver 00-supabase-stub.sql).
\set QUIET on
create or replace function _ok(c boolean, d text) returns text language plpgsql as $$
begin if c is not true then raise exception 'FALHOU: %', d; end if; return 'ok - ' || d; end $$;
create or replace function _barrado(cmd text, d text) returns text language plpgsql as $$
begin
  begin execute cmd; exception when others then return 'ok - ' || d || '  [' || sqlerrm || ']'; end;
  raise exception 'FALHOU (deveria ter sido barrado): %', d;
end $$;

-- ---------- usuários: o trigger de cadastro cria os perfis ----------
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001', 'gbastossaude@gmail.com', '{"nome":"Guilherme"}'),
 ('00000000-0000-4000-8000-00000000000a', 'ana@erbe.com',  '{"nome":"Ana"}'),
 ('00000000-0000-4000-8000-00000000000b', 'beto@erbe.com', '{"nome":"Beto"}'),
 ('00000000-0000-4000-8000-0000000000c1', 'caio@erbe.com', '{"nome":"Caio"}'),
 ('00000000-0000-4000-8000-0000000000d1', 'novo@erbe.com', '{"nome":"Novo"}');
select _ok((select papel = 'gestor' and status = 'ativo' from perfis where email = 'gbastossaude@gmail.com'), 'e-mail master nasce gestor ativo');
select _ok((select papel = 'corretor' and status = 'pendente' from perfis where email = 'novo@erbe.com'), 'qualquer outro nasce corretor pendente');
update perfis set status = 'ativo', split_pct = 40 where email = 'ana@erbe.com';
update perfis set status = 'ativo', split_pct = 50 where email = 'beto@erbe.com';
update perfis set status = 'ativo', papel = 'assistente' where email = 'caio@erbe.com';

\set G '''00000000-0000-4000-8000-000000000001'''
\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set C '''00000000-0000-4000-8000-0000000000c1'''
\set P '''00000000-0000-4000-8000-0000000000d1'''

-- ---------- carteira de exemplo (gravada como dono do projeto) ----------
insert into clientes (id, dono, dados) values
 ('cli-a', :A, '{"id":"cli-a","nome":"Alfa","doc":"11.222.333/0001-81","responsavel":"00000000-0000-4000-8000-00000000000a"}'),
 ('cli-b', :B, '{"id":"cli-b","nome":"Beta","doc":"22.333.444/0001-90","responsavel":"00000000-0000-4000-8000-00000000000b"}');
insert into contratos (id, dono, dados) values
 ('ctr-a', :A, '{"id":"ctr-a","clienteId":"cli-a","clienteNome":"Alfa","pilar":"saude","status":"ativo","corretor":"00000000-0000-4000-8000-00000000000a","splitPct":40,"valorBase":1000,
   "comissoes":[{"n":1,"tipo":"agenciamento","pct":100,"valor":1000,"vence":"2026-01-10","status":"recebido","recebidoEm":"2026-01-12","valorRecebido":1000},
                {"n":2,"tipo":"agenciamento","pct":50,"valor":500,"vence":"2026-02-10","status":"previsto","recebidoEm":"","valorRecebido":null},
                {"n":3,"tipo":"agenciamento","pct":50,"valor":500,"vence":"2026-03-10","status":"previsto","recebidoEm":"","valorRecebido":null}]}'),
 ('ctr-b', :B, '{"id":"ctr-b","clienteId":"cli-b","clienteNome":"Beta","pilar":"saude","status":"ativo","corretor":"00000000-0000-4000-8000-00000000000b","splitPct":50,"valorBase":800,"comissoes":[]}');
insert into vidas (id, dono, dados) values
 ('vida-a', :A, '{"id":"vida-a","nome":"João","doc":"123.456.789-09","contratoId":"ctr-a","status":"ativa"}'),
 ('vida-b', :B, '{"id":"vida-b","nome":"Maria","doc":"987.654.321-00","contratoId":"ctr-b","status":"ativa"}');
insert into despesas (id, dono, dados) values ('des-1', :G, '{"id":"des-1","descricao":"Aluguel","valor":3000}');
insert into leads (id, dono, dados) values ('lead-a', :A, '{"id":"lead-a","nome":"Delta","etapa":"novo"}');

-- ================= ANÔNIMO =================
select _como(null);
select _barrado('select 1 from clientes', 'anônimo não lê clientes (sem privilégio)');
select _barrado('select 1 from contratos', 'anônimo não lê contratos');
select _sair();

-- ================= PENDENTE =================
select _como(:P);
select _ok((select count(*) from clientes) = 0, 'pendente não enxerga cliente nenhum');
select _ok((select count(*) from contratos) = 0, 'pendente não enxerga contrato nenhum');
select _barrado($$insert into leads (id, dono, dados) values ('lead-p', '00000000-0000-4000-8000-0000000000d1', '{"id":"lead-p"}')$$, 'pendente não cria lead');
select _barrado($$update perfis set papel = 'gestor', status = 'ativo' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'pendente não se promove a gestor');
select _ok((select count(*) from config) = 0, 'pendente não lê a configuração');
select _sair();

-- ================= CORRETOR A =================
select _como(:A);
select _ok((select count(*) from clientes) = 1 and (select id from clientes) = 'cli-a', 'corretor vê só os próprios clientes');
select _ok((select count(*) from contratos) = 1, 'corretor vê só os próprios contratos');
select _ok((select count(*) from vidas) = 1 and (select id from vidas) = 'vida-a', 'corretor vê só as vidas dos próprios contratos (CPF do colega fica fora)');
select _ok((select count(*) from despesas) = 0, 'corretor não vê despesas');
select _ok((select count(*) from perfis) = 1, 'corretor lê apenas o próprio perfil');
select _barrado($$update perfis set split_pct = 90 where id = '00000000-0000-4000-8000-00000000000a'$$, 'corretor não altera o próprio split');
select _barrado($$update perfis set papel = 'gestor' where id = '00000000-0000-4000-8000-00000000000a'$$, 'corretor não se promove');
update perfis set nome = 'Ana Souza' where id = :A;
select _ok((select nome from perfis where id = :A) = 'Ana Souza', 'corretor muda o próprio nome');
select _barrado($$insert into clientes (id, dono, dados) values ('cli-x', '00000000-0000-4000-8000-00000000000b', '{"id":"cli-x"}')$$, 'corretor não cria registro em nome do colega');
select _barrado($$update clientes set dono = '00000000-0000-4000-8000-00000000000b' where id = 'cli-a'$$, 'corretor não passa cliente para o colega');
update contratos set dados = dados || '{"numero":"X"}' where id = 'ctr-b';
select _sair();
select _ok((select dados->>'numero' from contratos where id = 'ctr-b') is null, 'corretor não altera contrato do colega');
select _como(:A);

-- exclusão: só o gestor
delete from clientes where id = 'cli-a';
delete from contratos where id = 'ctr-a';
select _sair();
select _ok((select count(*) from clientes where id = 'cli-a') = 1, 'corretor não exclui cliente (nem o próprio)');
select _ok((select count(*) from contratos where id = 'ctr-a') = 1, 'corretor não exclui contrato (nem o próprio)');
select _como(:A);

-- split e imposto: o banco mantém o valor definido pelo gestor
update contratos set dados = jsonb_set(dados, '{splitPct}', '100') || '{"impostoPct": 0}' where id = 'ctr-a';
select _sair();
select _ok((select (dados->>'splitPct')::numeric from contratos where id = 'ctr-a') = 40, 'corretor não aumenta o próprio split no contrato');
select _ok(not (select dados ? 'impostoPct' from contratos where id = 'ctr-a'), 'corretor não define imposto do contrato');
select _como(:A);

-- contrato novo do corretor: split vem do perfil, não do que foi enviado
insert into contratos (id, dono, dados) values ('ctr-a2', :A, '{"id":"ctr-a2","clienteId":"cli-a","pilar":"saude","status":"proposta","splitPct":95,"impostoPct":0,"comissoes":[]}');
select _sair();
select _ok((select (dados->>'splitPct')::numeric from contratos where id = 'ctr-a2') = 40, 'contrato novo do corretor recebe o split do perfil');
select _como(:A);
select _barrado($$insert into contratos (id, dono, dados) values ('ctr-a3', '00000000-0000-4000-8000-00000000000a', '{"id":"ctr-a3","comissoes":[{"tipo":"agenciamento","vence":"2026-01-01","valor":9999,"status":"recebido","valorRecebido":9999}]}')$$,
  'corretor não cria contrato com parcela já recebida');

-- conciliação: receber pelo valor previsto pode; desfazer, alterar ou inflar não
update contratos set dados = jsonb_set(dados, '{comissoes,1}', '{"n":2,"tipo":"agenciamento","pct":50,"valor":500,"vence":"2026-02-10","status":"recebido","recebidoEm":"2026-02-11","valorRecebido":500}') where id = 'ctr-a';
select _sair();
select _ok((select dados->'comissoes'->1->>'status' from contratos where id = 'ctr-a') = 'recebido', 'corretor marca parcela prevista como recebida');
select _como(:A);
select _barrado($$update contratos set dados = jsonb_set(dados, '{comissoes,0,status}', '"previsto"') where id = 'ctr-a'$$, 'corretor não desfaz recebimento');
select _barrado($$update contratos set dados = jsonb_set(dados, '{comissoes,0,valorRecebido}', '1500') where id = 'ctr-a'$$, 'corretor não altera valor de parcela recebida');
select _barrado($$update contratos set dados = jsonb_set(dados, '{comissoes}', (dados->'comissoes') - 0) where id = 'ctr-a'$$, 'corretor não exclui parcela recebida');
select _barrado($$update contratos set dados = jsonb_set(dados, '{comissoes,2}', '{"n":3,"tipo":"agenciamento","valor":5000,"vence":"2026-03-10","status":"recebido","recebidoEm":"2026-03-10","valorRecebido":5000}') where id = 'ctr-a'$$, 'corretor não infla e recebe a parcela no mesmo passo');
select _barrado($$update contratos set dados = jsonb_set(dados, '{comissoes,2}', '{"n":3,"tipo":"agenciamento","valor":500,"vence":"2026-03-10","status":"recebido","recebidoEm":"2026-03-10","valorRecebido":800}') where id = 'ctr-a'$$, 'corretor não recebe valor diferente do previsto');
select _barrado($$update contratos set dados = jsonb_set(dados, '{comissoes}', (dados->'comissoes') || '[{"tipo":"bonus","vence":"2026-04-01","valor":300,"status":"recebido","valorRecebido":300}]') where id = 'ctr-a'$$, 'corretor não inventa parcela recebida');
-- o fluxo normal da tela continua: mudar a mensalidade refaz as previstas
update contratos set dados = jsonb_set(jsonb_set(dados, '{valorBase}', '1100'), '{comissoes,2,valor}', '550') where id = 'ctr-a';
select _sair();
select _ok((select (dados->'comissoes'->2->>'valor')::numeric from contratos where id = 'ctr-a') = 550, 'corretor ainda corrige a mensalidade e as parcelas previstas acompanham');
select _como(:A);
-- upsert (o que a tela faz) também passa pelas regras
select _barrado($$insert into contratos (id, dono, dados) select id, dono, jsonb_set(dados, '{comissoes,0,status}', '"previsto"') from contratos where id = 'ctr-a' on conflict (id) do update set dados = excluded.dados$$, 'upsert também não desfaz recebimento');
insert into contratos (id, dono, dados) select id, dono, jsonb_set(dados, '{numero}', '"PROP-1"') from contratos where id = 'ctr-a' on conflict (id) do update set dados = excluded.dados;
select _ok((select dados->>'numero' from contratos where id = 'ctr-a') = 'PROP-1', 'upsert comum do corretor funciona');

-- auditoria e atividade
select _ok((select count(*) from auditoria) = 0, 'corretor não lê a auditoria');
select _barrado($$insert into auditoria (tabela, registro_id, acao) values ('x','y','INSERT')$$, 'ninguém grava na auditoria pela API');
insert into atividade (id, quem, dados) values ('atv-1', :A, '{"evento":"teste"}');
select _barrado($$insert into atividade (id, quem, dados) values ('atv-2', '00000000-0000-4000-8000-00000000000b', '{}')$$, 'atividade não pode ser registrada em nome de outro');
select _ok(exists (select 1 from public.cliente_por_documento('22.333.444/0001-90')), 'corretor descobre CNPJ já cadastrado na carteira do colega');
select _ok((select visivel = false and id is null and nome is null and responsavel = 'Beto' from public.cliente_por_documento('22333444000190')), '... sem ver os dados do cliente do colega');
select _barrado($$select public.transferir_carteira('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a')$$, 'corretor não transfere carteira');
select _sair();

-- ================= ASSISTENTE =================
select _como(:C);
select _ok((select count(*) from clientes) = 2, 'assistente vê a carteira inteira');
select _ok((select count(*) from despesas) = 0, 'assistente não vê despesas');
update contratos set dados = jsonb_set(dados, '{splitPct}', '10') where id = 'ctr-b';
select _sair();
select _ok((select (dados->>'splitPct')::numeric from contratos where id = 'ctr-b') = 50, 'assistente não altera split');
select _como(:C);
delete from contratos where id = 'ctr-b';
select _sair();
select _ok((select count(*) from contratos where id = 'ctr-b') = 1, 'assistente não exclui contrato');

-- ================= GESTOR =================
select _como(:G);
select _ok((select count(*) from despesas) = 1, 'gestor vê despesas');
update contratos set dados = jsonb_set(dados, '{comissoes,0,status}', '"previsto"') where id = 'ctr-a';
select _ok((select dados->'comissoes'->0->>'status' from contratos where id = 'ctr-a') = 'previsto', 'gestor desfaz recebimento');
update contratos set dados = jsonb_set(dados, '{splitPct}', '45') where id = 'ctr-a';
select _ok((select (dados->>'splitPct')::numeric from contratos where id = 'ctr-a') = 45, 'gestor altera split');
select _ok((select count(*) from auditoria where tabela = 'contratos' and registro_id = 'ctr-a' and acao = 'UPDATE') >= 3, 'cada alteração de contrato vira linha de auditoria');
select _ok((select mudancas->'splitPct' = '{"de":40,"para":45}'::jsonb from auditoria where tabela = 'contratos' and registro_id = 'ctr-a' order by id desc limit 1), 'auditoria guarda valor anterior e novo');
select _ok((select jsonb_array_length(mudancas->'comissoes'->'saiu') = 1 and jsonb_array_length(mudancas->'comissoes'->'entrou') = 1
              from auditoria where registro_id = 'ctr-a' and mudancas ? 'comissoes' order by id desc limit 1), 'mudança no cronograma registra só a parcela que mudou');
select _ok((select quem = '00000000-0000-4000-8000-000000000001'::uuid from auditoria order by id desc limit 1), 'auditoria registra quem fez');
delete from contratos where id = 'ctr-a2';
select _ok((select registro->>'clienteId' = 'cli-a' from auditoria where registro_id = 'ctr-a2' and acao = 'DELETE'), 'exclusão guarda o registro inteiro (dá para recuperar)');
select _barrado($$delete from auditoria$$, 'nem o gestor apaga a auditoria pela API');
select _barrado($$update auditoria set quem = null$$, 'nem o gestor edita a auditoria pela API');
select _barrado($$delete from atividade$$, 'atividade é só inclusão: nem o gestor apaga');
select _sair();
select _ok((select count(*) from atividade) = 1, '... e o registro continua lá');
select _como(:G);
select _ok((public.transferir_carteira('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a')->>'contratos')::int = 1, 'gestor transfere a carteira de um corretor');
select _sair();
select _ok((select dono = '00000000-0000-4000-8000-00000000000a'::uuid and dados->>'corretor' = '00000000-0000-4000-8000-00000000000a' from contratos where id = 'ctr-b'), 'contrato transferido muda de dono e de corretor');
select _ok((select dono = '00000000-0000-4000-8000-00000000000a'::uuid from vidas where id = 'vida-b'), 'vidas acompanham a transferência');

-- ================= INTEGRIDADE =================
select _barrado($$delete from auth.users where email = 'ana@erbe.com'$$, 'apagar usuário com carteira é barrado (antes apagava tudo em cascata)');
select _ok((select count(*) from clientes where dono = '00000000-0000-4000-8000-00000000000a') >= 1, 'carteira continua lá');
delete from auth.users where email = 'novo@erbe.com';
select _ok((select count(*) from perfis where email = 'novo@erbe.com') = 0, 'usuário sem carteira pode ser removido');
select _barrado($$insert into clientes (id, dono, dados) values ('cli-z', '00000000-0000-4000-8000-00000000000a', '{"id":"outro"}')$$, 'id dentro de dados precisa bater com o id da linha');
select _barrado($$insert into contratos (id, dono, dados) values ('ctr-z', '00000000-0000-4000-8000-00000000000a', '{"id":"ctr-z","status":"inventado"}')$$, 'situação de contrato fora da lista é recusada');
delete from contratos where id = 'ctr-a';
select _ok((select count(*) from vidas where dados->>'contratoId' = 'ctr-a') = 0, 'apagar contrato apaga as vidas dele');

-- ================= 0003: erros do app e CNPJ alfanumérico =================
insert into clientes (id, dono, dados) values ('cli-alfa', '00000000-0000-4000-8000-00000000000a', '{"id":"cli-alfa","nome":"Alfanum","doc":"12.ABC.345/01DE-35"}');
select _como('00000000-0000-4000-8000-00000000000a');
select _ok((select nome = 'Alfanum' from public.cliente_por_documento('12abc34501de35')), 'CNPJ alfanumérico encontrado com ou sem máscara');
select _ok(not exists (select 1 from public.cliente_por_documento('12.000.345/0100-35')), 'letras não são descartadas na comparação');
insert into erros_app (pagina, operacao, mensagem) values ('clientes', 'desenhar clientes', 'TypeError: x');
select _ok((select count(*) from erros_app) = 0, 'corretor registra erro mas não lê a tabela');
select _barrado($$insert into erros_app (quem, mensagem) values ('00000000-0000-4000-8000-00000000000b', 'falso')$$, 'erro não pode ser registrado em nome de outro');
select _barrado($$insert into erros_app (mensagem) values (repeat('x', 5000))$$, 'mensagem gigante é recusada');
select _sair();
select _como('00000000-0000-4000-8000-000000000001');
select _ok((select count(*) from erros_app) = 1, 'gestor lê os erros registrados');
select _barrado($$delete from erros_app$$, 'erros não são apagados pela API');
select _sair();

-- ================= 0004: versão e automações =================
insert into clientes (id, dono, dados) values ('cli-v', '00000000-0000-4000-8000-00000000000a', '{"id":"cli-v","nome":"Versão"}');
select _ok((select versao from clientes where id = 'cli-v') = 1, 'registro nasce na versão 1');
select _como('00000000-0000-4000-8000-00000000000a');
update clientes set dados = dados || '{"cidade":"Recife"}', versao = 1 where id = 'cli-v';
select _ok((select versao from clientes where id = 'cli-v') = 2, 'gravação com a versão lida avança a versão');
select _barrado($$update clientes set dados = dados || '{"cidade":"Olinda"}', versao = 1 where id = 'cli-v'$$, 'gravação em cima de versão antiga é recusada (edição simultânea)');
select _barrado($$insert into clientes (id, dono, dados, versao) values ('cli-v', '00000000-0000-4000-8000-00000000000a', '{"id":"cli-v","nome":"X"}', 1) on conflict (id) do update set dados = excluded.dados, versao = excluded.versao$$, 'upsert com versão antiga também é recusado');
update clientes set dados = dados || '{"uf":"PE"}' where id = 'cli-v';
select _ok((select versao = 3 and dados->>'uf' = 'PE' from clientes where id = 'cli-v'), 'aplicativo antigo (sem versão) continua gravando');
select _sair();

-- contrato implantado gera a tarefa de pós-implantação (uma vez só)
insert into contratos (id, dono, dados) values ('ctr-imp', '00000000-0000-4000-8000-00000000000a', '{"id":"ctr-imp","clienteId":"cli-v","clienteNome":"Versão","status":"proposta","comissoes":[]}');
update contratos set dados = jsonb_set(dados, '{status}', '"implantado"') where id = 'ctr-imp';
update contratos set dados = jsonb_set(dados, '{status}', '"ativo"') where id = 'ctr-imp';
select _ok((select count(*) from tarefas where dados->>'chaveAuto' = 'implantacao:ctr-imp') = 1, 'implantação gera uma tarefa automática de pós-venda');
select _ok((select dono = '00000000-0000-4000-8000-00000000000a'::uuid and (dados->>'vence')::date = current_date + 15 from tarefas where dados->>'chaveAuto' = 'implantacao:ctr-imp'), '... para o corretor do contrato, em 15 dias');

-- rotina diária: proposta parada e renovação, sem duplicar
insert into contratos (id, dono, dados) values
 ('ctr-par', '00000000-0000-4000-8000-00000000000a', '{"id":"ctr-par","clienteNome":"Parada","status":"proposta","comissoes":[]}'),
 ('ctr-ren', '00000000-0000-4000-8000-00000000000a', jsonb_build_object('id','ctr-ren','clienteNome','Renova','status','ativo','fim',(current_date + 20)::text,'comissoes','[]'::jsonb));
alter table contratos disable trigger trg_carimbo_contratos;
update contratos set atualizado_em = now() - interval '10 days' where id = 'ctr-par';
alter table contratos enable trigger trg_carimbo_contratos;
select _ok((select (public.gerar_tarefas_automaticas()->>'propostas_paradas')::int) >= 1, 'rotina cria follow-up de proposta parada');
select _ok((select (public.gerar_tarefas_automaticas()->>'propostas_paradas')::int) = 0, 'rodar de novo não duplica');
select _ok((select count(*) from tarefas where dados->>'chaveAuto' like 'renovacao:ctr-ren:%') = 1, 'contrato vencendo em 45 dias gera tarefa de renovação');
select _como('00000000-0000-4000-8000-00000000000a');
select _barrado($$select public.gerar_tarefas_automaticas()$$, 'corretor não dispara a rotina');
select _sair();

-- ================= 0005: documentos =================
select _ok((select not public from storage.buckets where id = 'documentos'), 'bucket de documentos é privado');
insert into clientes (id, dono, dados) values ('cli-doc', '00000000-0000-4000-8000-00000000000b', '{"id":"cli-doc","nome":"Do Beto"}');
select _como('00000000-0000-4000-8000-00000000000b');
insert into storage.objects (bucket_id, name) values ('documentos', 'clientes/cli-doc/rg.pdf');
insert into documentos (cliente_id, nome, categoria, caminho, tipo_mime, tamanho) values ('cli-doc', 'RG.pdf', 'Documento pessoal', 'clientes/cli-doc/rg.pdf', 'application/pdf', 1000);
select _ok((select count(*) from documentos where cliente_id = 'cli-doc') = 1, 'corretor anexa documento ao próprio cliente');
select _barrado($$insert into documentos (cliente_id, nome, caminho) values ('cli-doc', 'x', 'clientes/outro/x.pdf')$$, 'caminho precisa ser a pasta do próprio cliente');
select _barrado($$update documentos set nome = 'outro' where cliente_id = 'cli-doc'$$, 'documento não é editado pela API (só incluído ou excluído)');
select _sair();
select _como('00000000-0000-4000-8000-00000000000a');
select _ok((select count(*) from documentos where cliente_id = 'cli-doc') = 0, 'outro corretor não vê o documento');
select _ok((select count(*) from storage.objects where name = 'clientes/cli-doc/rg.pdf') = 0, '... nem o arquivo no Storage');
select _barrado($$insert into storage.objects (bucket_id, name) values ('documentos', 'clientes/cli-doc/intruso.pdf')$$, 'outro corretor não envia arquivo para cliente que não é dele');
delete from storage.objects where name = 'clientes/cli-doc/rg.pdf';
select _sair();
select _ok((select count(*) from storage.objects where name = 'clientes/cli-doc/rg.pdf') = 1, 'outro corretor não apaga o arquivo');
select _como('00000000-0000-4000-8000-0000000000c1');
select _ok((select count(*) from documentos where cliente_id = 'cli-doc') = 1, 'assistente (vê a carteira toda) vê o documento');
delete from documentos where cliente_id = 'cli-doc';
select _sair();
select _ok((select count(*) from documentos where cliente_id = 'cli-doc') = 1, 'assistente não exclui documento que não enviou');
select _como('00000000-0000-4000-8000-000000000001');
delete from documentos where cliente_id = 'cli-doc';
select _sair();
select _ok((select count(*) from documentos where cliente_id = 'cli-doc') = 0, 'gestor exclui documento');
select _ok((select count(*) from auditoria where tabela = 'documentos') = 2, 'auditoria registra quem anexou e quem excluiu');
select _como(null);
select _barrado($$select 1 from documentos$$, 'anônimo não lê documentos');
select _sair();
