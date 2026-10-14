-- OC-LISTA-FINANC-CC-01 — `oc_conta_corrente_lote` nao tem regra propria: para cada OC em conta corrente o envelope do lote e'
-- o topo de `oc_conta_corrente(id)` (sem linhas, explicacoes e despesas); no modelo titulo, nulo. So' leitura, numa transacao
-- revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   L1 para TODA OC em conta corrente de cada cliente (como o admin, papel authenticated): envelope do lote = topo do dono
--   L2 OC no modelo titulo: envelope nulo, modelo 'titulo', contagens presentes
--   L3 contagens: docs_operacao = documentos vivos da OC, contados direto
--   L4 sem usuario e gestor de outro cliente: 42501; id de outro cliente fica fora do retorno
--   L5 ACL: anon nao executa; authenticated executa
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $teste$
DECLARE
  k record; n_oc int := 0; n_dif int := 0; v jsonb; e jsonb; t record; d int;
  c_admin constant text := '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}';
  c_gestor_nj constant text := '{"sub":"9200e0d0-095f-4ab8-a31a-3052a0faaf56","role":"authenticated"}';
  v_nj uuid; v_outro uuid; v_op_outro uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', c_admin, true);
  SET LOCAL ROLE authenticated;

  -- L1
  FOR k IN SELECT DISTINCT o.cliente_id FROM zoo_operacoes_comerciais o WHERE o.modelo_financeiro = 'conta_corrente' LOOP
    v := public.oc_conta_corrente_lote(k.cliente_id,
           ARRAY(SELECT o.id FROM zoo_operacoes_comerciais o WHERE o.cliente_id = k.cliente_id));
    FOR t IN SELECT o.id FROM zoo_operacoes_comerciais o WHERE o.cliente_id = k.cliente_id AND o.modelo_financeiro = 'conta_corrente' LOOP
      n_oc := n_oc + 1;
      e := public.oc_conta_corrente(t.id) - 'linhas' - 'explicacoes' - 'despesas';
      IF (v -> t.id::text -> 'envelope') IS DISTINCT FROM e THEN n_dif := n_dif + 1; END IF;
    END LOOP;
  END LOOP;
  IF n_oc = 0 THEN RAISE EXCEPTION 'L1: conjunto vazio nao e'' prova'; END IF;
  IF n_dif <> 0 THEN RAISE EXCEPTION 'L1: % de % OCs com envelope diferente do dono', n_dif, n_oc; END IF;

  -- L2
  SELECT o.id, o.cliente_id INTO t FROM zoo_operacoes_comerciais o WHERE o.modelo_financeiro = 'titulo' LIMIT 1;
  IF t.id IS NULL THEN RAISE EXCEPTION 'L2: sem OC no modelo titulo para provar'; END IF;
  v := public.oc_conta_corrente_lote(t.cliente_id, ARRAY[t.id]);
  IF (v -> t.id::text ->> 'modelo') IS DISTINCT FROM 'titulo'
     OR jsonb_typeof(v -> t.id::text -> 'envelope') IS DISTINCT FROM 'null'
     OR (v -> t.id::text -> 'docs_operacao') IS NULL OR (v -> t.id::text -> 'docs_financeiro') IS NULL THEN
    RAISE EXCEPTION 'L2: titulo devolveu %', v -> t.id::text;
  END IF;

  -- L3 (uma OC com documento da operacao)
  SELECT o.id, o.cliente_id INTO t FROM zoo_operacoes_comerciais o
   WHERE EXISTS (SELECT 1 FROM zoo_operacao_documentos dd WHERE dd.operacao_id = o.id AND dd.cancelado IS NOT TRUE) LIMIT 1;
  SELECT count(*) INTO d FROM zoo_operacao_documentos dd WHERE dd.operacao_id = t.id AND dd.cancelado IS NOT TRUE;
  v := public.oc_conta_corrente_lote(t.cliente_id, ARRAY[t.id]);
  IF d = 0 OR (v -> t.id::text ->> 'docs_operacao')::int IS DISTINCT FROM d THEN
    RAISE EXCEPTION 'L3: docs_operacao % x direto %', v -> t.id::text ->> 'docs_operacao', d;
  END IF;

  -- L4
  SELECT id INTO v_nj FROM clientes WHERE nome = 'NJ Pecuária';
  SELECT o.cliente_id, o.id INTO v_outro, v_op_outro FROM zoo_operacoes_comerciais o WHERE o.cliente_id <> v_nj LIMIT 1;
  v := public.oc_conta_corrente_lote(v_nj, ARRAY[v_op_outro]);
  IF v ? v_op_outro::text THEN RAISE EXCEPTION 'L4: OC de outro cliente entrou no retorno'; END IF;
  PERFORM set_config('request.jwt.claims', c_gestor_nj, true);
  BEGIN
    PERFORM public.oc_conta_corrente_lote(v_outro, ARRAY[v_op_outro]);
    RAISE EXCEPTION 'L4: gestor de outro cliente nao foi recusado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.oc_conta_corrente_lote(v_nj, ARRAY[v_op_outro]);
    RAISE EXCEPTION 'L4: sem usuario nao foi recusado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- L5
  IF has_function_privilege('anon', 'public.oc_conta_corrente_lote(uuid, uuid[])', 'EXECUTE') THEN RAISE EXCEPTION 'L5: anon executa'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.oc_conta_corrente_lote(uuid, uuid[])', 'EXECUTE') THEN RAISE EXCEPTION 'L5: authenticated nao executa'; END IF;

  RAISE EXCEPTION 'OK oc_lista_financ_cc_01 (L1-L5; % OCs em conta corrente conferidas no L1)', n_oc;
END $teste$;
ROLLBACK;
