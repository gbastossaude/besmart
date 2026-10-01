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
