-- OC-VINCULAR-CANDIDATAS-01b — coerencia: OC toda paga COM diferenca passa a ser selecionavel como a de diferenca zero (Gabriel, 05/10/2026).
--
-- A lista ja' devolvia a marca `pagas_com_diferenca` e o valor; a TELA deixava a linha apagada. Agora a linha se escolhe
-- ("criar item", a regra de 26/09: o vincular nao julga repeticao) e o sistema EXPLICA: o vincular devolve — e grava na trilha —
-- o aviso `parcelas_pagas_com_diferenca {diferenca}` quando cria item numa OC cujos compromissos daquele item estao todos pagos
-- sem somar o combinado. A diferenca continua na OC (entrada do OC-AJUSTE-DIFERENCA-01); nada e' arredondado.
--
-- 1. `_oc_vinculo_diferenca_parcelas(compromisso)`: valor do compromisso − soma das parcelas vivas, ao centavo (nulo sem
--    parcela). UM dono: sai da lista (onde estava escrita) e passa a ser lida pela lista e pelo vincular.
-- 2. `oc_candidatas_vinculo` 05cbc9b2485d6399268baa106937d3fb -> ec17660f802317b0e351f499b60b42de (1 ancora: a subconsulta vira a chamada do dono; retorno identico).
-- 3. `oc_vincular_lancamento` d72b7db7bdef3626109346f44805fb56 -> 5f9f5d221ccf59a8c922c853085e829e (1 ancora: o aviso).
-- Patch guardado por md5 (origem, ancora 1x, destino). So' funcoes; nenhum dado.

CREATE OR REPLACE FUNCTION public._oc_vinculo_diferenca_parcelas(p_compromisso_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT round(c.valor_total - sum(pp.valor), 2)
    FROM public.zoo_operacao_compromissos c
    JOIN public.zoo_operacao_programacoes pr ON pr.compromisso_id = c.id AND pr.status = 'ativa'
    JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id AND pp.status <> 'cancelada'
   WHERE c.id = p_compromisso_id
   GROUP BY c.id, c.valor_total;
$function$;
-- funcao nova nasce fechada (01C): a lista e' INVOKER e a chama como quem consulta
REVOKE ALL ON FUNCTION public._oc_vinculo_diferenca_parcelas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_diferenca_parcelas(uuid) TO authenticated, service_role;

DO $pc$
DECLARE
  v_oid oid; v_src text; v_novo text; v_def text; v_a text; v_b text;
BEGIN
  SELECT p.oid, p.prosrc, pg_get_functiondef(p.oid) INTO v_oid, v_src, v_def FROM pg_proc p
   WHERE p.proname = 'oc_candidatas_vinculo' AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) <> '05cbc9b2485d6399268baa106937d3fb' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_candidatas_vinculo com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pca1$               (SELECT round(c.valor_total - sum(pp2.valor), 2)
                  FROM public.zoo_operacao_programacoes pr2
                  JOIN public.zoo_operacao_parcelas_programacao pp2 ON pp2.programacao_id = pr2.id AND pp2.status <> 'cancelada'
                 WHERE pr2.compromisso_id = c.id AND pr2.status = 'ativa') AS dif$pca1$;
  v_b := $pcb1$               public._oc_vinculo_diferenca_parcelas(c.id) AS dif   -- um dono, lido tambem pelo vincular$pcb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_candidatas_vinculo, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> 'ec17660f802317b0e351f499b60b42de' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_candidatas_vinculo com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  -- a definicao inteira (assinatura, linguagem, volatilidade, SECURITY, search_path) e' a de hoje: so' o corpo troca
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_candidatas_vinculo: corpo nao localizado na definicao'; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $pc$;

DO $pv$
DECLARE
  v_oid oid; v_src text; v_novo text; v_def text; v_a text; v_b text;
BEGIN
  SELECT p.oid, p.prosrc, pg_get_functiondef(p.oid) INTO v_oid, v_src, v_def FROM pg_proc p
   WHERE p.proname = 'oc_vincular_lancamento' AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) <> 'd72b7db7bdef3626109346f44805fb56' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_vincular_lancamento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pva1$  IF v_op.fazenda_id IS NOT NULL AND v_l.fazenda_id IS NOT NULL AND v_op.fazenda_id <> v_l.fazenda_id THEN
$pva1$;
  v_b := $pvb1$  -- OC-VINCULAR-CANDIDATAS-01b: item NOVO numa OC cujos compromissos deste item estao todos pagos mas nao somam o combinado
  -- (a diferenca ao centavo). O vinculo entra como item novo e a diferenca CONTINUA na OC — o aviso diz, e vai para a trilha.
  IF v_comp_acao = 'criado' AND EXISTS (
       SELECT 1 FROM public.zoo_operacao_compromissos c
        WHERE c.operacao_id = v_op.id AND c.status <> 'cancelado' AND c.natureza = v_natureza AND c.componente = v_componente
          AND public._oc_vinculo_compromisso_liquidado(c.id) AND public._oc_vinculo_diferenca_parcelas(c.id) <> 0) THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'parcelas_pagas_com_diferenca', 'diferenca',
      (SELECT sum(public._oc_vinculo_diferenca_parcelas(c.id)) FROM public.zoo_operacao_compromissos c
        WHERE c.operacao_id = v_op.id AND c.status <> 'cancelado' AND c.natureza = v_natureza AND c.componente = v_componente
          AND public._oc_vinculo_compromisso_liquidado(c.id))));
  END IF;
  IF v_op.fazenda_id IS NOT NULL AND v_l.fazenda_id IS NOT NULL AND v_op.fazenda_id <> v_l.fazenda_id THEN
$pvb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_vincular_lancamento, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '5f9f5d221ccf59a8c922c853085e829e' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_vincular_lancamento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  -- a definicao inteira (assinatura, linguagem, volatilidade, SECURITY, search_path) e' a de hoje: so' o corpo troca
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: oc_vincular_lancamento: corpo nao localizado na definicao'; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $pv$;

DO $conf$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid, p.proname, md5(p.prosrc) m FROM pg_proc p
            WHERE p.proname IN ('oc_candidatas_vinculo', 'oc_vincular_lancamento', '_oc_vinculo_diferenca_parcelas') LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR (r.proname = 'oc_candidatas_vinculo' AND r.m <> 'ec17660f802317b0e351f499b60b42de')
       OR (r.proname = 'oc_vincular_lancamento' AND r.m <> '5f9f5d221ccf59a8c922c853085e829e') THEN
      RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01b: % fora do esperado (md5 %)', r.proname, r.m; END IF;
  END LOOP;
END $conf$;
