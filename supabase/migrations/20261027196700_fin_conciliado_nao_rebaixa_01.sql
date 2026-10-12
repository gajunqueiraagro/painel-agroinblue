-- FIN-CONCILIADO-NAO-REBAIXA-01 (Gabriel, 12/10/2026): LANCAMENTO CASADO COM O EXTRATO NAO SAI DO ESTADO EM QUE O BANCO O POS.
-- Nasce do d40adcfa (Agnaldo, 11/10): realizado e casado com o extrato, voltou a 'previsto' sem data de pagamento por um UPDATE
-- direto da tela; o vinculo seguiu vivo e a OC seguiu "Pago". Nenhum gatilho de financeiro_lancamentos_v2 olhava o vinculo, e
-- a guarda por `conciliado_em` e' cega (a coluna esta' nula em todos os lancamentos; o vinculo mora em conciliacao_bancaria_itens).
--   (1) _fin_lancamento_casado_com_extrato(lancamento): O UNICO lugar que responde "esta' casado com o extrato?". O criterio de
--       "vivo" e' o do gatilho do cancelamento (fn_cbi_desfazer_on_cancelamento): cbi.lancamento_id = id AND cbi.desfeito_em IS
--       NULL; `conciliado_em` entra no OU por coerencia. Interna, fechada (o molde de _fn_split_vivo_do_lancamento).
--   (2) fn_lancamento_casado_com_extrato(lancamento): a mesma resposta para a TELA, com guarda de tenant (42501).
--   (3) trg_guard_lancamento_casado (BEFORE UPDATE): com o lancamento casado, recusa SO' A SAIDA DO ESTADO —
--         status_transacao sai de realizado/conciliado para qualquer outro;
--         data_pagamento tinha valor e vira nula ou outra data;
--         valor muda;
--         conta_bancaria_id ou conta_destino_id tinha valor e muda (a conta da direcao: saida = bancaria, entrada = destino,
--         transferencia = as duas pernas; medido em 12/10: 4.440 saidas casadas so' com bancaria, 540 entradas so' com destino,
--         394 transferencias com as duas).
--       A PROMOCAO PASSA (programado/agendado -> realizado, pagamento nulo -> a data do extrato): nenhum escritor da
--       conciliacao foi alterado e NAO HA' chave de bypass. O gesto contrario ja' existe: desfazer a conciliacao no Espelho.
--       `cancelado` NAO e' olhado (o cancelar tem dono e ja' desfaz o vinculo). O nome ordena DEPOIS de
--       trg_00_conta_por_direcao: a conta comparada e' a ja' normalizada.
-- ⚠ CUSTO ACEITO: lancamento PARCIAL casado e ainda programado pode trocar entre previsto/programado/agendado (2 casos hoje).
-- NENHUM DADO E' ALTERADO.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._fin_lancamento_casado_com_extrato(p_lancamento_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = p_lancamento_id and l.conciliado_em is not null)
      or exists (select 1 from public.conciliacao_bancaria_itens cbi where cbi.lancamento_id = p_lancamento_id and cbi.desfeito_em is null)
$function$;
REVOKE ALL ON FUNCTION public._fin_lancamento_casado_com_extrato(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_lancamento_casado_com_extrato(p_lancamento_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cli uuid := (select l.cliente_id from public.financeiro_lancamentos_v2 l where l.id = p_lancamento_id);
begin
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  return public._fin_lancamento_casado_com_extrato(p_lancamento_id);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_lancamento_casado_com_extrato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_casado_com_extrato(uuid) TO authenticated, service_role;

CREATE FUNCTION public.guard_lancamento_casado_nao_rebaixa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if not public._fin_lancamento_casado_com_extrato(old.id) then
    return new;
  end if;
  raise exception using errcode = 'P0001',
    message = 'Lancamento casado com o extrato: desfaca a conciliacao no Espelho para alterar';
end
$function$;
REVOKE ALL ON FUNCTION public.guard_lancamento_casado_nao_rebaixa() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_lancamento_casado
  BEFORE UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  WHEN ( (old.status_transacao in ('realizado', 'conciliado')
            and new.status_transacao is distinct from old.status_transacao
            and coalesce(new.status_transacao, '') not in ('realizado', 'conciliado'))
      or (old.data_pagamento is not null and new.data_pagamento is distinct from old.data_pagamento)
      or new.valor is distinct from old.valor
      or (old.conta_bancaria_id is not null and new.conta_bancaria_id is distinct from old.conta_bancaria_id)
      or (old.conta_destino_id is not null and new.conta_destino_id is distinct from old.conta_destino_id) )
  EXECUTE FUNCTION public.guard_lancamento_casado_nao_rebaixa();

DO $confere$
begin
  if has_function_privilege('anon', 'public.fn_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fn_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._fin_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fin_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.guard_lancamento_casado_nao_rebaixa()', 'EXECUTE')
     or has_function_privilege('anon', 'public.guard_lancamento_casado_nao_rebaixa()', 'EXECUTE') then
    raise exception 'ACL diferente do esperado';
  end if;
  if (select count(*) from pg_trigger t where t.tgname = 'trg_guard_lancamento_casado' and not t.tgisinternal
        and t.tgrelid = 'public.financeiro_lancamentos_v2'::regclass) <> 1 then
    raise exception 'gatilho trg_guard_lancamento_casado ausente';
  end if;
end
$confere$;
