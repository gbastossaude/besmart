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
