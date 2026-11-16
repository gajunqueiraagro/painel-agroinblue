-- OPENFINANCE-P3a · 118131 — a INTERNA `_fn_openfinance_contas_gravar` passa a SECURITY INVOKER (o gate
-- `guardaDeClienteNasMigrations.test.ts` reprovou a 118130: SECURITY DEFINER com parâmetro de cliente e sem guarda). O molde é a 116070.
-- ⚠ NADA MUDA NO RESULTADO: só a service_role a chama (as Edge Functions `openfinance-contas` e `openfinance-desconectar`, que conferem o
-- admin e o dono do item na Pluggy antes); a service_role tem os grants das duas tabelas e passa pela RLS. Continua fechada (REVOKE de
-- PUBLIC/anon/authenticated), agora sem atravessar a RLS por conta própria.
-- O corpo é o da 118130, byte a byte; muda só `create` → `create or replace` e `security definer` → `security invoker` (o diff prova).
set lock_timeout = '2s';

create or replace function public._fn_openfinance_contas_gravar(p_cliente uuid, p_item text, p_contas jsonb, p_autor uuid, p_simular boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
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
