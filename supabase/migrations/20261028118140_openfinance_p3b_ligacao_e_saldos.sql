-- OPENFINANCE-P3b · LIGAÇÃO + SALDO DO BANCO (desenho aprovado 16/11: corte 14/11, piloto por gesto, nada concilia sozinho).
--   1. openfinance_contas_permitidas.conta_bancaria_id ganha a FK (a conta do sistema onde o extrato cai) e "uma conta do sistema recebe
--      de UMA conta viva da Pluggy".
--   2. _fn_openfinance_conta_ligar_sistema — INTERNA (service_role, INVOKER): liga (ou desliga, p_conta nulo) a conta permitida à conta
--      do sistema. Só conta do MESMO cliente, ativa, corrente ('cc'); a permitida tem de ser BANK e viva. Trilha em openfinance_eventos;
--      p_simular = a prévia.
--   3. openfinance_saldos — o saldo que o BANCO informou (balance + updatedAt da Pluggy) a cada leitura; nada se sobrescreve, nada ajusta
--      o saldo do mês. A mesma foto (mesma conta, mesma hora do banco, mesmo valor) não repete linha.
--   4. _fn_openfinance_saldo_registrar — INTERNA (service_role, INVOKER): grava a leitura só de conta permitida, viva e ligada.
-- Sem dado de cliente (a ligação da Vera é gesto do admin depois, pela tela).
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.openfinance_saldos') is not null then raise exception 'OPENFINANCE-P3b: a tabela já existe: refazer.'; end if;
  if exists (select 1 from public.openfinance_contas_permitidas where conta_bancaria_id is not null) then
    raise exception 'OPENFINANCE-P3b: já há conta ligada antes da FK: conferir.';
  end if;
end $$;

alter table public.openfinance_contas_permitidas
  add constraint fk_openfinance_contas_permitidas_conta foreign key (conta_bancaria_id) references public.financeiro_contas_bancarias(id);
create unique index ux_openfinance_contas_permitidas_conta_viva on public.openfinance_contas_permitidas (conta_bancaria_id)
  where ativo and conta_bancaria_id is not null;

-- p_conta nulo = desliga a ligação (a permitida continua; só não lança em conta nenhuma)
create function public._fn_openfinance_conta_ligar_sistema(p_cliente uuid, p_permitida uuid, p_conta uuid, p_autor uuid, p_simular boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v openfinance_contas_permitidas;
  c financeiro_contas_bancarias;
begin
  if p_cliente is null or p_permitida is null or p_autor is null or p_simular is null then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  select * into v from openfinance_contas_permitidas where id = p_permitida and ativo;
  if v.id is null or v.cliente_id is distinct from p_cliente then
    raise exception 'OPENFINANCE: esta conta do banco não está permitida para este cliente.' using errcode = '42501';
  end if;
  if v.tipo <> 'BANK' then
    raise exception 'OPENFINANCE: cartão não lança em conta corrente.' using errcode = '22023';
  end if;
  if p_conta is not null then
    select * into c from financeiro_contas_bancarias where id = p_conta;
    if c.id is null or c.cliente_id is distinct from p_cliente then
      raise exception 'OPENFINANCE: a conta do sistema não é deste cliente.' using errcode = '42501';
    end if;
    if not coalesce(c.ativa, false) or c.tipo_conta is distinct from 'cc' then
      raise exception 'OPENFINANCE: só conta corrente ativa recebe o extrato do banco.' using errcode = '22023';
    end if;
    if exists (select 1 from openfinance_contas_permitidas o where o.ativo and o.conta_bancaria_id = p_conta and o.id <> v.id) then
      raise exception 'OPENFINANCE: esta conta do sistema já recebe de outra conta do banco.' using errcode = '23505';
    end if;
  end if;
  if p_simular or v.conta_bancaria_id is not distinct from p_conta then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'antes', v.conta_bancaria_id, 'depois', p_conta,
                              'mudou', v.conta_bancaria_id is distinct from p_conta);
  end if;
  update openfinance_contas_permitidas set conta_bancaria_id = p_conta where id = v.id;
  insert into openfinance_eventos (origem, evento, item_id, account_id, client_user_id, cliente_id, autor, resultado)
  values ('agroinblue', 'agroinblue/conta_ligada', v.item_id, v.account_id, p_cliente::text, p_cliente, p_autor,
          format('antes %s · depois %s', coalesce(v.conta_bancaria_id::text, '—'), coalesce(p_conta::text, '—')));
  return jsonb_build_object('ok', true, 'simulado', false, 'antes', v.conta_bancaria_id, 'depois', p_conta, 'mudou', true);
end $$;
revoke all on function public._fn_openfinance_conta_ligar_sistema(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public._fn_openfinance_conta_ligar_sistema(uuid, uuid, uuid, uuid, boolean) to service_role;

create table public.openfinance_saldos (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes(id),
  conta_permitida_id uuid not null references public.openfinance_contas_permitidas(id),
  conta_bancaria_id  uuid not null references public.financeiro_contas_bancarias(id),
  saldo              numeric(16, 2) not null,
  saldo_em           timestamptz,           -- quando o BANCO atualizou (updatedAt da Pluggy); nulo = o banco não disse
  lido_em            timestamptz not null default now(),
  lido_por           uuid not null
);
create index ix_openfinance_saldos_conta on public.openfinance_saldos (conta_bancaria_id, lido_em desc);

alter table public.openfinance_saldos enable row level security;
create policy openfinance_saldos_select on public.openfinance_saldos for select to authenticated
  using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_saldos from public, anon, authenticated;
grant select on public.openfinance_saldos to authenticated;
grant all on public.openfinance_saldos to service_role;

create function public._fn_openfinance_saldo_registrar(p_item text, p_account text, p_saldo numeric, p_saldo_em timestamptz, p_autor uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v openfinance_contas_permitidas;
  u openfinance_saldos;
begin
  if coalesce(p_item, '') = '' or coalesce(p_account, '') = '' or p_saldo is null or p_autor is null then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  select * into v from openfinance_contas_permitidas where ativo and item_id = p_item and account_id = p_account;
  if v.id is null then
    raise exception 'OPENFINANCE: conta do banco não permitida.' using errcode = '42501';
  end if;
  if v.conta_bancaria_id is null then
    raise exception 'OPENFINANCE: conta do banco sem conta do sistema ligada.' using errcode = '22023';
  end if;
  -- a mesma foto do banco não repete linha
  select * into u from openfinance_saldos s
   where s.conta_permitida_id = v.id and s.conta_bancaria_id = v.conta_bancaria_id
     and s.saldo = round(p_saldo, 2) and s.saldo_em is not distinct from p_saldo_em
   order by s.lido_em desc limit 1;
  if u.id is not null then
    return jsonb_build_object('ok', true, 'novo', false, 'id', u.id);
  end if;
  insert into openfinance_saldos (cliente_id, conta_permitida_id, conta_bancaria_id, saldo, saldo_em, lido_por)
  values (v.cliente_id, v.id, v.conta_bancaria_id, round(p_saldo, 2), p_saldo_em, p_autor)
  returning * into u;
  return jsonb_build_object('ok', true, 'novo', true, 'id', u.id);
end $$;
revoke all on function public._fn_openfinance_saldo_registrar(text, text, numeric, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public._fn_openfinance_saldo_registrar(text, text, numeric, timestamptz, uuid) to service_role;
