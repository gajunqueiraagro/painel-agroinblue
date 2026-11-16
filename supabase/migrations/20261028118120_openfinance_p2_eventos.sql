-- OPENFINANCE-PILOTO-01 · P2 — a FILA DE AVISOS da Pluggy (Gabriel 16/11 11:24: as contas reais dependem do webhook não-localhost).
-- O mínimo para o webhook existir: cada aviso que chega (item/created, item/updated, transactions/created|updated|deleted, …) vira UMA linha
-- com os campos de uma lista fechada; o connect token e o registro do webhook deixam a sua linha (quem pediu, para qual cliente).
-- NÃO guarda transação, link, saldo, nome nem documento: a busca relê pela API com a API key, depois (P3, com a conexão e o cofre).
--   1. openfinance_eventos (só leitura para o admin AgroinBlue; escrita só pela interna)
--   2. _fn_openfinance_evento_registrar — INTERNA, sem usuário (as Edge Functions com a service_role); a reentrega da Pluggy (o mesmo
--      eventId) não duplica; `client_user_id` que é o id de um cliente vira o `cliente_id`
-- Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.openfinance_eventos') is not null then raise exception 'OPENFINANCE-P2: a tabela já existe: refazer.'; end if;
end $$;

create table public.openfinance_eventos (
  id              uuid primary key default gen_random_uuid(),
  recebido_em     timestamptz not null default now(),
  origem          text not null check (origem in ('pluggy_webhook', 'agroinblue')),
  evento          text not null check (evento ~ '^[a-z_]+/[a-z_]+$' and length(evento) <= 80),
  event_id        text check (length(event_id) <= 128),
  item_id         text check (length(item_id) <= 128),
  account_id      text check (length(account_id) <= 128),
  client_user_id  text check (length(client_user_id) <= 128),
  connector_id    text check (length(connector_id) <= 32),
  triggered_by    text check (length(triggered_by) <= 32),
  n_transacoes    integer check (n_transacoes >= 0),
  erro_codigo     text check (length(erro_codigo) <= 64),
  ip              text check (length(ip) <= 64),
  cliente_id      uuid references public.clientes(id),
  autor           uuid,
  processado_em   timestamptz,
  resultado       text,
  check ((origem = 'agroinblue') = (evento like 'agroinblue/%'))
);
-- a Pluggy tenta de novo (na hora, +15 min, +2 h): o mesmo eventId entra uma vez
create unique index ux_openfinance_eventos_event_id on public.openfinance_eventos (event_id) where event_id is not null;
create index ix_openfinance_eventos_item on public.openfinance_eventos (item_id, recebido_em desc) where item_id is not null;
create index ix_openfinance_eventos_abertos on public.openfinance_eventos (recebido_em) where processado_em is null and origem = 'pluggy_webhook';

alter table public.openfinance_eventos enable row level security;
-- por enquanto SÓ o admin AgroinBlue lê (o item ainda não está ligado a uma conexão do cliente: isso é a P3)
create policy openfinance_eventos_select on public.openfinance_eventos for select to authenticated
  using (public.is_admin_agroinblue((select auth.uid())));
revoke all on public.openfinance_eventos from public, anon, authenticated;
grant select on public.openfinance_eventos to authenticated;
grant all on public.openfinance_eventos to service_role;

create function public._fn_openfinance_evento_registrar(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cu text := left(nullif(btrim(p->>'client_user_id'), ''), 128);
  v_cli uuid;
  v_id uuid;
begin
  if coalesce(p->>'origem', '') not in ('pluggy_webhook', 'agroinblue') or coalesce(p->>'evento', '') !~ '^[a-z_]+/[a-z_]+$' then
    raise exception 'OPENFINANCE: aviso inválido.' using errcode = '22023';
  end if;
  if v_cu ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select c.id into v_cli from clientes c where c.id = v_cu::uuid;
  end if;
  insert into openfinance_eventos (origem, evento, event_id, item_id, account_id, client_user_id, connector_id, triggered_by, n_transacoes,
                                   erro_codigo, ip, cliente_id, autor)
  values (p->>'origem', left(p->>'evento', 80), left(nullif(btrim(p->>'event_id'), ''), 128), left(p->>'item_id', 128),
          left(p->>'account_id', 128), v_cu, left(p->>'connector_id', 32), left(p->>'triggered_by', 32),
          greatest((p->>'n_transacoes')::integer, 0), left(p->>'erro_codigo', 64), left(p->>'ip', 64), v_cli,
          case when coalesce(p->>'autor', '') ~* '^[0-9a-f-]{36}$' then (p->>'autor')::uuid end)
  on conflict (event_id) where event_id is not null do nothing
  returning id into v_id;
  return jsonb_build_object('ok', true, 'novo', v_id is not null, 'id', v_id, 'cliente_id', v_cli);
end $$;
revoke all on function public._fn_openfinance_evento_registrar(jsonb) from public, anon, authenticated;
grant execute on function public._fn_openfinance_evento_registrar(jsonb) to service_role;
