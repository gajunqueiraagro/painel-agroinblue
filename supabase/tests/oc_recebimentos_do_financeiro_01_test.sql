-- OC-CORRECOES-01 C3 · OC-CC-BUSCAR-01 — `oc_recebimentos_do_financeiro`: os vinculaveis de sempre + o do comprador que a regra exclui,
-- com o motivo. So' leitura; termina em RAISE 'OK'.
--   B1 IGUALDADE: em 20 OCs de conta corrente reais (venda, compra, abate), os vinculaveis (sem motivo) sao EXATAMENTE os de
--      `oc_recebimentos_vinculaveis`
--   B2 o caso real (0731374f): os avulsos do comprador `eabe167e` e `54465071` aparecem do comprador, com "já está nesta operação"
--   B3 todo excluido devolvido e' do comprador (o de outro favorecido continua de fora, como sempre)
--   B4 ACL: anon sem EXECUTE
set local statement_timeout = '120s';
DO $t$
DECLARE op uuid; n int := 0; s text;
BEGIN
  for op in select id from public.zoo_operacoes_comerciais where modelo_financeiro = 'conta_corrente' and status_comercial <> 'cancelada'
             order by created_at desc limit 20 loop
    if exists (select lancamento_id from public.oc_recebimentos_do_financeiro(op) where motivo_excluido is null
               except select lancamento_id from public.oc_recebimentos_vinculaveis(op))
       or exists (select lancamento_id from public.oc_recebimentos_vinculaveis(op)
                  except select lancamento_id from public.oc_recebimentos_do_financeiro(op) where motivo_excluido is null)
      then raise exception 'B1 vinculaveis divergem na OC %', op; end if;
    if exists (select 1 from public.oc_recebimentos_do_financeiro(op) where motivo_excluido is not null and not do_comprador)
      then raise exception 'B3 excluido de outro favorecido na OC %', op; end if;
    n := n + 1;
  end loop;
  select string_agg(left(lancamento_id::text, 8) || '=' || motivo_excluido, ',' order by lancamento_id) into s
    from public.oc_recebimentos_do_financeiro('0731374f-77ef-4769-b583-a311b30047e1')
   where lancamento_id in ('eabe167e-edd4-4f9f-ab16-a680e820406f', '54465071-387d-477e-b51d-b317e0d40b47') and do_comprador;
  if s is null or s not like '54465071=já está nesta operação%,eabe167e=já está nesta operação%' then raise exception 'B2 caso real: %', s; end if;
  if has_function_privilege('anon', 'public.oc_recebimentos_do_financeiro(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.oc_recebimentos_do_financeiro(uuid)', 'EXECUTE') then raise exception 'B4 ACL'; end if;
  RAISE EXCEPTION 'OK (% OCs)', n;
END $t$;
