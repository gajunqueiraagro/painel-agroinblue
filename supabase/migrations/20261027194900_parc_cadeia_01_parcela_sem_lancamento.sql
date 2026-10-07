-- PARC-CADEIA-01 (passo 4) — A PARCELA VIVA SEM LANCAMENTO VIVO DIZ O QUE HOUVE (Gabriel, 07/10/2026).
--
-- `fn_financiamento_situacao`, SO' com `p_detalhe`: cada parcela ganha NO FIM `lancamento_cancelado` {em, motivo} — o lancamento
-- que a parcela aponta e esta' CANCELADO (nulo quando ela nunca teve lancamento ou o dela esta' vivo). A tela do contrato escreve
-- "sem lançamento" com a data e o motivo e oferece "Recriar lançamento" / "Retirar parcela". Nenhuma regra de situacao muda.
-- SEM `p_detalhe` o retorno e' o de antes, byte a byte (o bloco novo mora dentro do `if p_detalhe`).
-- PATCH GUARDADO POR md5: 7d59c9158724a1c69ce2ee90abc3d01f -> 70a7d04bec7bb5db2319e5ebbaba6e2c (1 ancora exatamente 1x). Assinatura igual:
-- CREATE OR REPLACE; ACL, SECURITY DEFINER, STABLE e search_path conferidos depois.

DO $mig$
DECLARE
  v_oid oid := 'public.fn_financiamento_situacao(uuid, date, boolean)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_vol "char"; v_a text; v_b text;
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text, provolatile INTO v_src, v_acl, v_def, v_cfg, v_vol FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '7d59c9158724a1c69ce2ee90abc3d01f' THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 4: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_a := $a1$    v_cart := v_cart || (
      with p as (select e.p from jsonb_array_elements(v_parc) e(p)),
$a1$::text;
  v_b := $b1$    -- PARC-CADEIA-01 passo 4: a parcela viva SEM lancamento vivo deixa de ser muda — o que houve com o lancamento dela (quando
    -- foi cancelado e por que). Nulo = a parcela nunca teve lancamento, ou o dela esta' vivo. Nada aqui decide situacao.
    select coalesce(jsonb_agg(e.p || jsonb_build_object(
             'lancamento_cancelado', case when lc.id is not null
                                          then jsonb_build_object('em', lc.cancelado_em, 'motivo', lc.cancelado_motivo) end
           ) order by e.ord), '[]'::jsonb)
      into v_parc
      from jsonb_array_elements(v_parc) with ordinality e(p, ord)
      left join public.financiamento_parcelas q on q.id = (e.p->>'id')::uuid
      left join public.financeiro_lancamentos_v2 lc
             on lc.id = q.lancamento_id and coalesce(lc.cancelado, false) and (e.p->>'lancamento_id') is null;

    v_cart := v_cart || (
      with p as (select e.p from jsonb_array_elements(v_parc) e(p)),
$b1$::text;
  IF (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 4: a ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_src, v_a, v_b);
  IF md5(v_novo) <> '70a7d04bec7bb5db2319e5ebbaba6e2c' THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 4: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_financiamento_situacao(p_financiamento_id uuid, p_hoje date DEFAULT NULL::date, p_detalhe boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT provolatile FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_vol
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> '70a7d04bec7bb5db2319e5ebbaba6e2c' THEN
    RAISE EXCEPTION 'PARC-CADEIA-01 4: ACL, SECURITY DEFINER, configuracao, volatilidade ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;
