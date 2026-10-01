-- =====================================================================
--  ATOS SISTEMA — 09_atualizacao_v1_4.sql
--  Correções e reforços da v1.4. Pode ser executado várias vezes.
--   • datas "de hoje" no fuso de São Paulo (o banco roda em UTC: entre
--     21h e 0h uma venda/implantação ficava com a data do dia seguinte)
--   • link de reunião aceita somente http(s) — bloqueia javascript: e afins
--   • índices para as consultas de relacionamento e comissões
-- =====================================================================

-- ---------------------------------------------------------------------
-- Datas no fuso de São Paulo
-- ---------------------------------------------------------------------
alter table public.sales alter column data_venda set default private.hoje_sp();

create or replace function private.tg_venda_antes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_desde := now();
    if new.status = 'cancelada' then new.cancelada_em := coalesce(new.cancelada_em, now()); end if;
    if new.status = 'implantada' then new.data_implantacao := coalesce(new.data_implantacao, private.hoje_sp()); end if;
  end if;
  if new.valor_total is null then new.valor_total := new.valor_mensal * 12; end if;
  new.numero_proposta := nullif(trim(new.numero_proposta), '');
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Link da reunião: somente http:// ou https://
-- (um link "javascript:..." executaria código na sessão de quem clicasse)
-- ---------------------------------------------------------------------
update public.events
   set link_reuniao = null
 where link_reuniao is not null and link_reuniao !~* '^https?://[^\s]+$';
update public.events set link_reuniao = nullif(trim(link_reuniao), '') where link_reuniao is not null;

alter table public.events drop constraint if exists events_link_reuniao_http;
alter table public.events add constraint events_link_reuniao_http
  check (link_reuniao is null or (link_reuniao ~* '^https?://[^\s]+$' and length(link_reuniao) <= 2000));

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
-- último contato do cliente (Relacionamento, Minha carteira, lembretes diários)
create index if not exists activities_client_idx on public.activities(client_id, realizado_em desc)
  where deleted_at is null and efetivo;
create index if not exists followups_client_idx on public.followups(client_id) where client_id is not null;
create index if not exists commissions_corretor_idx on public.commissions(corretor_id, data_prevista) where deleted_at is null;
create index if not exists events_criador_idx on public.events(created_by, inicio);
