-- FIN-CONSORCIO-02 · a guarda que faltou (19/10/2026). `_fn_consorcio_parcela_gravar(p_fin, p_cliente, …)` nasceu na 20261027203300
-- SECURITY DEFINER com parametro de cliente e sem guarda propria (fechada a authenticated/anon: so' a chamam as funcoes do consorcio,
-- que ja' passam por `_fn_contrato_do_usuario` / `tenant_ok`). O detector `guardaDeClienteNasMigrations` cobra a guarda na funcao:
-- migration aplicada nao se reescreve, entao a guarda entra aqui. Corpo INTEGRAL, copiado da 20261027203300, com UMA linha a mais no
-- comeco: `perform public._fn_exigir_tenant(p_cliente);` (42501 sem acesso, e sem usuario tambem). Guarda de md5 do corpo de ORIGEM
-- antes e do de DESTINO depois; a ACL (so' postgres e service_role) e o SECURITY DEFINER sao conferidos no fim.
set local lock_timeout = '2s';

do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public._fn_consorcio_parcela_gravar(uuid,uuid,uuid,jsonb,date)'::regprocedure)
     is distinct from 'b969f5a226b4161c8c8bc3625d7a34aa' then
    raise exception 'FIN-CONSORCIO-02 guarda: corpo de origem inesperado';
  end if;
end $g$;

create or replace function public._fn_consorcio_parcela_gravar(p_fin uuid, p_cliente uuid, p_id uuid, x jsonb, p_venc date) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_p numeric := (x->>'fundo_comum')::numeric + (x->>'fundo_reserva')::numeric;
        v_j numeric := (x->>'taxa_adm')::numeric + (x->>'seguro')::numeric; v_id uuid := p_id;
        v_tipo text := case when v_p = 0 then 'juros_carencia' when v_j = 0 then 'amortizacao' else 'mista' end;
begin
  perform public._fn_exigir_tenant(p_cliente);
  if v_id is null then
    insert into public.financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros,
      valor_total, valor_fundo_comum, valor_taxa_adm, valor_fundo_reserva, valor_seguro, faixa, adiada, status, tipo, ajustada)
    values (p_cliente, p_fin, (x->>'numero')::int, p_venc, v_p, v_j, v_p + v_j, (x->>'fundo_comum')::numeric, (x->>'taxa_adm')::numeric,
      (x->>'fundo_reserva')::numeric, (x->>'seguro')::numeric, (x->>'faixa')::int, (x->>'adiada')::boolean, 'pendente', v_tipo, false)
    returning id into v_id;
  else
    update public.financiamento_parcelas set data_vencimento = p_venc, valor_principal = v_p, valor_juros = v_j, valor_total = v_p + v_j,
           valor_fundo_comum = (x->>'fundo_comum')::numeric, valor_taxa_adm = (x->>'taxa_adm')::numeric,
           valor_fundo_reserva = (x->>'fundo_reserva')::numeric, valor_seguro = (x->>'seguro')::numeric, faixa = (x->>'faixa')::int,
           adiada = (x->>'adiada')::boolean, tipo = v_tipo, ajustada = false, updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end $$;

do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public._fn_consorcio_parcela_gravar(uuid,uuid,uuid,jsonb,date)'::regprocedure)
     is distinct from '1a8b57ab4f0a7e96b7753c0f3ba08dea' then
    raise exception 'FIN-CONSORCIO-02 guarda: o corpo gravado nao e'' o de destino';
  end if;
  if (select array_to_string(proacl::text[], ',') from pg_proc where oid = 'public._fn_consorcio_parcela_gravar(uuid,uuid,uuid,jsonb,date)'::regprocedure)
     is distinct from 'postgres=X/postgres,service_role=X/postgres' then
    raise exception 'FIN-CONSORCIO-02 guarda: ACL mudou';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public._fn_consorcio_parcela_gravar(uuid,uuid,uuid,jsonb,date)'::regprocedure) then
    raise exception 'FIN-CONSORCIO-02 guarda: perdeu o SECURITY DEFINER';
  end if;
end $g$;
