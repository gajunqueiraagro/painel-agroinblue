-- CONC-PARCIAL-UM-ESTADO-01 passo 1, parte 2 de 2 (Gabriel, 11/10/2026). Depois da 20261027195700.
-- (1) GATILHO em conciliacao_bancaria_itens: todo vinculo que nasce, e' desfeito ou muda de valor CHAMA A PONTE da OC para o
--     lancamento da linha — bloco, 1:1, N:1 e os desfazer chegam a' OC pelo mesmo lugar, e desfazer devolve a OC sozinho.
--     So' age em lancamento com parte VIVA de OC; fora disso sai na primeira linha. Nao decide nada: quem decide e' a ponte.
--     O nome comeca por "trg_zz": roda DEPOIS do gatilho de promocao (ordem alfabetica), com o status ja' final.
-- (2) LEITURA fn_lancamentos_parciais(cliente): os lancamentos vivos NAO realizados com 0 < aplicado < valor, com o saldo e as
--     partes (extrato, data, conta, valor). So' leitura, tenant_ok + 42501. O aplicado vem do dono (_fn_lancamento_aplicado_vivo).
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.trg_fn_oc_ponte_ao_conciliar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                  WHERE pt.financeiro_lancamento_id = NEW.lancamento_id AND pt.cancelada = false) THEN
    RETURN NEW;
  END IF;
  PERFORM public.oc_sincronizar_liquidacao_de_financeiro(NEW.lancamento_id);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.trg_fn_oc_ponte_ao_conciliar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_zz_oc_ponte_ao_conciliar
  AFTER INSERT OR UPDATE OF desfeito_em, valor_aplicado ON public.conciliacao_bancaria_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_oc_ponte_ao_conciliar();

CREATE FUNCTION public.fn_lancamentos_parciais(p_cliente uuid)
 RETURNS TABLE(lancamento_id uuid, valor numeric, aplicado numeric, saldo numeric, partes jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT COALESCE(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT l.id, abs(l.valor), x.a, abs(l.valor) - x.a,
         (SELECT jsonb_agg(jsonb_build_object('extrato_id', c.extrato_id, 'data', e.data_movimento,
                                              'conta_id', e.conta_bancaria_id, 'valor_aplicado', abs(c.valor_aplicado))
                           ORDER BY e.data_movimento, c.id)
            FROM public.conciliacao_bancaria_itens c JOIN public.extrato_bancario_v2 e ON e.id = c.extrato_id
           WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)
    FROM public.financeiro_lancamentos_v2 l
   CROSS JOIN LATERAL (SELECT public._fn_lancamento_aplicado_vivo(l.id) AS a) x
   WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE
     AND l.status_transacao NOT IN ('realizado', 'conciliado')
     AND EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)
     AND x.a > 0 AND x.a < abs(l.valor)
   ORDER BY l.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_lancamentos_parciais(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamentos_parciais(uuid) TO authenticated, service_role;

DO $confere$
BEGIN
  IF has_function_privilege('anon', 'public.fn_lancamentos_parciais(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_lancamentos_parciais(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trg_fn_oc_ponte_ao_conciliar()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_lancamento_aplicado_vivo(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL diferente do esperado';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_zz_oc_ponte_ao_conciliar' AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION 'gatilho ausente';
  END IF;
END
$confere$;
