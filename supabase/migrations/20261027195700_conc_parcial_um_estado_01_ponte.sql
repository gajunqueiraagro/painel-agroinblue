-- CONC-PARCIAL-UM-ESTADO-01 passo 1, parte 1 de 2 (Gabriel, 11/10/2026): A OC ENXERGA O RECEBIMENTO PARCIAL DA CONFERENCIA.
-- O defeito (Santa Rita, OC 8eff43fa): titulo de 150.000 com um PIX de 100.000 casado pelo bloco; o titulo segue programado e a
-- OC dizia liquidado 0 — a ponte (oc_sincronizar_liquidacao_de_financeiro) so' olhava realizado/conciliado.
-- (1) _fn_lancamento_aplicado_vivo: o dono de "quanto entrou" (soma dos vinculos vivos). Interna, fechada.
-- (2) a ponte ganha UM ramo: titulo NAO realizado com aplicado vivo > 0 grava a MESMA linha automatica com valor = aplicado
--     vivo e data = a do ultimo extrato vivo. Realizado: como antes (valor inteiro). Sem aplicado: estorna, como antes.
-- (3) D4: fn_vincular_extrato_lancamento (o 1:1) RECUSA extrato menor que o saldo livre de TITULO DE OC — ele promoveria o
--     titulo inteiro com dinheiro a menos. Sem OC: como antes. O gatilho de promocao nao muda.
-- PATCH GUARDADO POR md5: ponte 208b60e1bbc3b0d7acbd898ac309659d -> 0235c5b36b982227bfbcea932b441ed4 (6 ancoras);
-- vincular 6dbfb0dc012aa35bfe3736e5b0bc1743 -> b090d0cd3bc5d7512526152994ceae85 (1 ancora). Assinatura, SECURITY, search_path e ACL nao mudam.
-- NENHUM DADO E' ALTERADO: o conserto do caso antigo e' script a' parte, com o SIM do Gabriel.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._fn_lancamento_aplicado_vivo(p_lancamento_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- quanto ja' entrou/saiu no banco por conta deste lancamento: os vinculos VIVOS de conciliacao. "Quanto falta" = valor - isto.
  SELECT COALESCE(sum(abs(c.valor_aplicado)), 0)
    FROM public.conciliacao_bancaria_itens c
   WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL;
$function$;
REVOKE ALL ON FUNCTION public._fn_lancamento_aplicado_vivo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_lancamento_aplicado_vivo(uuid) TO service_role;

DO $mig$
DECLARE
  v_oid oid := 'public.oc_sincronizar_liquidacao_de_financeiro(uuid)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) IS DISTINCT FROM '208b60e1bbc3b0d7acbd898ac309659d' THEN RAISE EXCEPTION 'ponte: corpo de origem inesperado (md5 %)', md5(v_src); END IF;
  v_novo := v_src;
  v_a := v_a || $a$  v_valor numeric;
BEGIN
$a$::text;
  v_b := v_b || $b$  v_valor numeric;
  v_aplicado numeric := 0;
  v_data_ap date;
  v_parcial boolean := false;
BEGIN
$b$::text;
  v_a := v_a || $a$  v_liquidado := (v_f.status_transacao IN ('realizado','conciliado') AND v_f.cancelado IS NOT TRUE);
$a$::text;
  v_b := v_b || $b$  v_liquidado := (v_f.status_transacao IN ('realizado','conciliado') AND v_f.cancelado IS NOT TRUE);
  -- CONC-PARCIAL-UM-ESTADO-01: titulo NAO realizado com dinheiro ja' conciliado (o parcial do bloco). O que entrou e' a soma dos
  -- vinculos vivos (dono: _fn_lancamento_aplicado_vivo); a data e' a do ultimo extrato vivo. Nunca arredonda.
  IF NOT v_liquidado AND v_f.cancelado IS NOT TRUE THEN
    v_aplicado := public._fn_lancamento_aplicado_vivo(p_financeiro_lancamento_id);
    IF v_aplicado > 0 THEN
      v_parcial := true;
      SELECT max(e.data_movimento) INTO v_data_ap
        FROM public.conciliacao_bancaria_itens c JOIN public.extrato_bancario_v2 e ON e.id = c.extrato_id
       WHERE c.lancamento_id = p_financeiro_lancamento_id AND c.desfeito_em IS NULL;
    END IF;
  END IF;
$b$::text;
  v_a := v_a || $a$  IF v_liquidado AND v_elegivel THEN
$a$::text;
  v_b := v_b || $b$  IF (v_liquidado OR v_parcial) AND v_elegivel THEN
$b$::text;
  v_a := v_a || $a$    v_valor := abs(v_f.valor);
$a$::text;
  v_b := v_b || $b$    v_valor := CASE WHEN v_liquidado THEN abs(v_f.valor) ELSE v_aplicado END;
$b$::text;
  v_a := v_a || $a$    v_data := COALESCE(v_f.data_pagamento, CURRENT_DATE);
$a$::text;
  v_b := v_b || $b$    v_data := CASE WHEN v_liquidado THEN COALESCE(v_f.data_pagamento, CURRENT_DATE) ELSE COALESCE(v_data_ap, CURRENT_DATE) END;
$b$::text;
  v_a := v_a || $a$  ELSIF NOT v_liquidado THEN
$a$::text;
  v_b := v_b || $b$  ELSIF NOT v_liquidado AND NOT v_parcial THEN
$b$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN RAISE EXCEPTION 'ponte: a ancora % nao casa exatamente 1x', i; END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) IS DISTINCT FROM '0235c5b36b982227bfbcea932b441ed4' THEN RAISE EXCEPTION 'ponte: corpo de destino inesperado (md5 %)', md5(v_novo); END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_sincronizar_liquidacao_de_financeiro(p_financeiro_lancamento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'ponte: ACL, SECURITY DEFINER ou configuracao mudaram no replace';
  END IF;
END
$mig$;

DO $mig$
DECLARE
  v_oid oid := 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text; v_b text;
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) IS DISTINCT FROM '6dbfb0dc012aa35bfe3736e5b0bc1743' THEN RAISE EXCEPTION 'vincular: corpo de origem inesperado (md5 %)', md5(v_src); END IF;
  v_a := $a$    RAISE EXCEPTION 'sobre_aplicacao: valor (%) excede o saldo livre do lancamento', v_valor;
  END IF;
$a$;
  v_b := v_a || $b$  -- CONC-PARCIAL-UM-ESTADO-01 (D4, Gabriel 11/10/2026): este caminho (1:1) promove o titulo INTEIRO a realizado no primeiro
  -- vinculo. Em TITULO DE OC (parte viva) com extrato MENOR que o saldo livre, a OC liquidaria o valor cheio com dinheiro a
  -- menos: recusa e manda ao bloco, que trata o parcial. Lancamento sem OC e par exato: como sempre.
  IF v_valor < abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id)
     AND EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = p_lancamento_id AND pt.cancelada = false) THEN
    RAISE EXCEPTION 'Este título é de operação comercial e o valor do extrato é menor que o do título. Faça o recebimento parcial pela Conferência (bloco). Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
$b$;
  IF (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'vincular: a ancora nao casa exatamente 1x'; END IF;
  v_novo := replace(v_src, v_a, v_b);
  IF md5(v_novo) IS DISTINCT FROM 'b090d0cd3bc5d7512526152994ceae85' THEN RAISE EXCEPTION 'vincular: corpo de destino inesperado (md5 %)', md5(v_novo); END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_vincular_extrato_lancamento(p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric DEFAULT NULL::numeric, p_dupla_ponta boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'vincular: ACL, SECURITY DEFINER ou configuracao mudaram no replace';
  END IF;
END
$mig$;
