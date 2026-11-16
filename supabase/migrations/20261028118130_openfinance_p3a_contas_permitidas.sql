-- OPENFINANCE-P3a · CONTAS PERMITIDAS (Gabriel 16/11, saída A: o consentimento do Itaú pegou o CPF inteiro do Gabriel, cotitular da Vera).
-- Só a conta que o admin MARCA vira vínculo cliente × item × accountId; o resto da conexão nunca é lido nem gravado (a P3 importa só daqui).
--   1. openfinance_contas_permitidas — o vínculo. NÃO guarda titular, CPF, saldo nem transação: só tipo + final de 4 dígitos + rótulo.
--      Nada se apaga: desmarcar = ativo false com quem/quando/motivo.
--   2. _fn_openfinance_contas_gravar — INTERNA (service_role): quem chama é a Edge Function `openfinance-contas`, que ANTES confere na
--      Pluggy que o item é deste cliente e que cada accountId é deste item. Grava a lista marcada de uma vez (liga as novas, desliga as
--      desmarcadas), com trilha em openfinance_eventos; p_simular = a prévia.
--   3. _fn_openfinance_conta_permitida — a pergunta da P3 (e do teste-trava): esta conta deste item entra? Devolve o cliente ou nulo.
-- Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.openfinance_contas_permitidas') is not null then raise exception 'OPENFINANCE-P3a: a tabela já existe: refazer.'; end if;
end $$;

create table public.openfinance_contas_permitidas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  item_id        text not null check (length(item_id) between 1 and 128),
  account_id     text not null check (length(account_id) between 1 and 128),
  tipo           text not null check (tipo in ('BANK', 'CREDIT')),
  subtipo        text check (length(subtipo) <= 32),
  final4         text check (final4 ~ '^[0-9]{4}$'),
  rotulo         text not null check (length(rotulo) between 1 and 80),
  conta_bancaria_id uuid,            -- a conta do sistema em que a P3 lança (escolhida depois; sem FK até a P3 decidir a tabela)
  ativo          boolean not null default true,
  criado_por     uuid not null,
  criado_em      timestamptz not null default now(),
  desligado_por  uuid,
  desligado_em   timestamptz,
  motivo         text check (length(motivo) <= 200),
  check (ativo = (desligado_em is null))
);
-- uma conta da Pluggy viva em UM vínculo só
create unique index ux_openfinance_contas_permitidas_viva on public.openfinance_contas_permitidas (account_id) where ativo;
create index ix_openfinance_contas_permitidas_item on public.openfinance_contas_permitidas (item_id) where ativo;

alter table public.openfinance_contas_permitidas enable row level security;
create policy openfinance_contas_permitidas_select on public.openfinance_contas_permitidas for select to authenticated
  using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_contas_permitidas from public, anon, authenticated;
grant select on public.openfinance_contas_permitidas to authenticated;
grant all on public.openfinance_contas_permitidas to service_role;

-- p_contas = [{account_id, tipo, subtipo, final4, rotulo}] = TODAS as marcadas (a lista inteira; a que não vier é desligada)
create function public._fn_openfinance_contas_gravar(p_cliente uuid, p_item text, p_contas jsonb, p_autor uuid, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dono uuid;
  v_ligar int := 0; v_desligar int := 0; v_manter int := 0;
  c jsonb;
begin
  if p_cliente is null or coalesce(p_item, '') = '' or p_autor is null or jsonb_typeof(p_contas) is distinct from 'array' then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  -- o item é do cliente que o NOSSO token gravou (o 1º item/created com cliente) — a função de borda já conferiu na Pluggy; aqui, de novo
  select e.cliente_id into v_dono from openfinance_eventos e
   where e.item_id = p_item and e.evento = 'item/created' and e.cliente_id is not null order by e.recebido_em limit 1;
  if v_dono is distinct from p_cliente then
    raise exception 'OPENFINANCE: esta conexão não é deste cliente.' using errcode = '42501';
  end if;
  for c in select * from jsonb_array_elements(p_contas) loop
    if coalesce(c->>'account_id', '') = '' or coalesce(c->>'tipo', '') not in ('BANK', 'CREDIT') or coalesce(c->>'rotulo', '') = '' then
      raise exception 'OPENFINANCE: conta inválida na lista.' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct x->>'account_id') from jsonb_array_elements(p_contas) x) <> jsonb_array_length(p_contas) then
    raise exception 'OPENFINANCE: conta repetida na lista.' using errcode = '22023';
  end if;
  if exists (select 1 from openfinance_contas_permitidas v, jsonb_array_elements(p_contas) x
              where v.ativo and v.account_id = x->>'account_id' and (v.item_id <> p_item or v.cliente_id <> p_cliente)) then
    raise exception 'OPENFINANCE: uma das contas já está ligada a outra conexão.' using errcode = '23505';
  end if;

  select count(*) into v_manter from openfinance_contas_permitidas v
   where v.ativo and v.item_id = p_item and v.account_id in (select x->>'account_id' from jsonb_array_elements(p_contas) x);
  v_ligar := jsonb_array_length(p_contas) - v_manter;
  select count(*) into v_desligar from openfinance_contas_permitidas v
   where v.ativo and v.item_id = p_item and v.account_id not in (select x->>'account_id' from jsonb_array_elements(p_contas) x);
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'ligar', v_ligar, 'manter', v_manter, 'desligar', v_desligar);
  end if;

  update openfinance_contas_permitidas v set ativo = false, desligado_por = p_autor, desligado_em = now(), motivo = 'desmarcada pelo admin'
   where v.ativo and v.item_id = p_item and v.account_id not in (select x->>'account_id' from jsonb_array_elements(p_contas) x);
  insert into openfinance_contas_permitidas (cliente_id, item_id, account_id, tipo, subtipo, final4, rotulo, criado_por)
  select p_cliente, p_item, x->>'account_id', x->>'tipo', left(nullif(x->>'subtipo', ''), 32),
         case when x->>'final4' ~ '^[0-9]{4}$' then x->>'final4' end, left(x->>'rotulo', 80), p_autor
    from jsonb_array_elements(p_contas) x
   where not exists (select 1 from openfinance_contas_permitidas v where v.ativo and v.item_id = p_item and v.account_id = x->>'account_id');
  insert into openfinance_eventos (origem, evento, item_id, client_user_id, cliente_id, autor, resultado)
  values ('agroinblue', 'agroinblue/contas_permitidas', p_item, p_cliente::text, p_cliente, p_autor,
          format('ligar %s · manter %s · desligar %s', v_ligar, v_manter, v_desligar));
  return jsonb_build_object('ok', true, 'simulado', false, 'ligar', v_ligar, 'manter', v_manter, 'desligar', v_desligar);
end $$;
revoke all on function public._fn_openfinance_contas_gravar(uuid, text, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public._fn_openfinance_contas_gravar(uuid, text, jsonb, uuid, boolean) to service_role;

-- a P3 pergunta ANTES de ler qualquer transação: só conta viva entra; nulo = não lê
create function public._fn_openfinance_conta_permitida(p_item text, p_account text) returns uuid
language sql stable security definer set search_path = public as $$
  select v.cliente_id from openfinance_contas_permitidas v where v.ativo and v.item_id = p_item and v.account_id = p_account;
$$;
revoke all on function public._fn_openfinance_conta_permitida(text, text) from public, anon, authenticated;
grant execute on function public._fn_openfinance_conta_permitida(text, text) to service_role;
