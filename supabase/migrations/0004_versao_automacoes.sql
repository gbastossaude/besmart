-- ============================================================
--  0004 — Edição simultânea sem perda e automações do servidor
--  Incremental e idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Controle de versão (concorrência otimista)
--    Antes: duas pessoas editando o mesmo contrato — a última gravação apagava
--    a outra sem aviso. Agora cada linha tem "versao". O aplicativo envia a
--    versão que leu; se outra pessoa gravou no meio, o banco recusa com uma
--    mensagem clara e a tela mostra a versão atual.
--    Compatível com o aplicativo antigo: quem não envia "versao" não é barrado.
-- ------------------------------------------------------------
create or replace function public.controlar_versao()
returns trigger language plpgsql as $$
begin
  if new.versao is distinct from old.versao then
    raise exception 'Outra pessoa alterou este registro enquanto você editava. A versão atual foi carregada — confira e salve de novo.'
      using errcode = '40001';
  end if;
  new.versao := old.versao + 1;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['leads','clientes','contratos','vidas','tarefas','despesas'] loop
    execute format('alter table public.%I add column if not exists versao integer not null default 1', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_versao_'||t, t);
    execute format('create trigger %I before update on public.%I for each row execute function public.controlar_versao()', 'trg_versao_'||t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Automações (cada uma resolve um esquecimento real da operação)
--    As tarefas automáticas levam dados.auto = true e uma chave única
--    (dados.chaveAuto): rodar de novo não duplica nada.
-- ------------------------------------------------------------
create or replace function public._tarefa_auto(chave text, dono uuid, titulo text, tipo text, vence date,
                                               ref_tipo text, ref_id text, ref_nome text)
returns boolean language plpgsql security definer set search_path = public as $$
declare novo_id text := 'auto-' || md5(chave);
begin
  if exists (select 1 from public.tarefas where id = novo_id) then return false; end if;
  insert into public.tarefas (id, dono, dados) values (novo_id, dono, jsonb_build_object(
    'id', novo_id, 'titulo', titulo, 'tipo', tipo, 'vence', vence::text, 'status', 'aberta',
    'responsavel', dono::text, 'refTipo', ref_tipo, 'refId', ref_id, 'refNome', ref_nome,
    'criadoEm', current_date::text, 'auto', true, 'chaveAuto', chave));
  return true;
end $$;
revoke all on function public._tarefa_auto(text, uuid, text, text, date, text, text, text) from public, anon, authenticated;

-- 2a. Contrato implantado: agenda a conferência do primeiro boleto e das
--     carteirinhas 15 dias depois. É o momento em que o cliente mais cancela
--     por problema operacional — e o que mais se esquece de acompanhar.
create or replace function public.automacao_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dados->>'status' in ('implantado','ativo')
     and coalesce(old.dados->>'status', 'proposta') = 'proposta' then
    perform public._tarefa_auto('implantacao:' || new.id, new.dono,
      'Pós-implantação: conferir 1º boleto e carteirinhas — ' || coalesce(new.dados->>'clienteNome', ''),
      'Ligação', current_date + 15, 'cliente', new.dados->>'clienteId', new.dados->>'clienteNome');
  end if;
  return null;
end $$;
drop trigger if exists trg_automacao_contrato on public.contratos;
create trigger trg_automacao_contrato after update of dados on public.contratos
  for each row execute function public.automacao_contrato();

-- 2b. Rotina diária (gerar_tarefas_automaticas):
--   - proposta parada há 7 dias ou mais sem nenhuma alteração → follow-up;
--   - contrato ativo que vence em até 45 dias → preparar a renovação.
--   Rodar à mão: select public.gerar_tarefas_automaticas();
--   Agendar: ativar a extensão pg_cron no Supabase (Database → Extensions) e
--   rodar esta migration de novo — o agendamento é criado sozinho (7h, Brasília).
create or replace function public.gerar_tarefas_automaticas()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_prop int := 0; n_ren int := 0;
begin
  if auth.uid() is not null and not public.sou_gestor() then
    raise exception 'Somente o gestor executa as automações.' using errcode = '42501';
  end if;
  for r in
    select id, dono, dados, atualizado_em from public.contratos
     where dados->>'status' = 'proposta' and atualizado_em < now() - interval '7 days'
  loop
    if public._tarefa_auto('proposta-parada:' || r.id || ':' || to_char(r.atualizado_em, 'YYYYMMDD'), r.dono,
         'Proposta parada há ' || (current_date - r.atualizado_em::date) || ' dias — ' || coalesce(r.dados->>'clienteNome',''),
         'Follow-up', current_date, 'cliente', r.dados->>'clienteId', r.dados->>'clienteNome') then
      n_prop := n_prop + 1;
    end if;
  end loop;
  for r in
    select id, dono, dados from public.contratos
     where dados->>'status' in ('ativo','implantado')
       and nullif(dados->>'fim','') is not null
       and (dados->>'fim')::date between current_date and current_date + 45
  loop
    if public._tarefa_auto('renovacao:' || r.id || ':' || (r.dados->>'fim'), r.dono,
         'Renovação: ' || coalesce(r.dados->>'clienteNome','') || ' vence em ' || to_char((r.dados->>'fim')::date, 'DD/MM/YYYY'),
         'Reunião', greatest(current_date, (r.dados->>'fim')::date - 30), 'cliente', r.dados->>'clienteId', r.dados->>'clienteNome') then
      n_ren := n_ren + 1;
    end if;
  end loop;
  return jsonb_build_object('propostas_paradas', n_prop, 'renovacoes', n_ren);
end $$;
revoke all on function public.gerar_tarefas_automaticas() from public, anon;
grant execute on function public.gerar_tarefas_automaticas() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'erbe-tarefas-automaticas';
    perform cron.schedule('erbe-tarefas-automaticas', '0 10 * * *', 'select public.gerar_tarefas_automaticas()');
  end if;
end $$;
