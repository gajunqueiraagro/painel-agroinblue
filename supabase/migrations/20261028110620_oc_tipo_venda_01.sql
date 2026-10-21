-- OC-CORRECOES-01 A · OC-TIPO-VENDA-01 — o TIPO DE VENDA nao persistia (Gabriel 21/10: "ja coloquei mais de 5 vezes gado adulto;
-- salvo, fecho, nao persiste"). CAUSA (FASE 0): a OC nao tinha onde guardar o tipo — o Salvar da venda nao o mandava, a carga so' o
-- recuperava quando havia planejamento de boitel (o resto voltava vazio) e a saida do rebanho criada pela OC so' recebia 'boitel'.
-- `modalidade_comercial` NAO e' este campo: e' o dominio do abate (escala | a termo | spot), nula nas 242 OCs.
--   1. coluna `tipo_venda` ('desmama' | 'gado_adulto' | 'boitel'), so' na venda;
--   2. `oc_salvar_rascunho` grava o `tipo_venda` do payload (OC aberta);
--   3. `oc_editar_dados_operacao` (a OC FECHADA) aceita trocar entre desmama e gado adulto — e' CLASSIFICACAO (nao mexe em valor,
--      quantidade, data nem financeiro); BOITEL nao: ele tem planejamento proprio, e trocar de/para boitel segue pedindo reabrir.
--      A trilha e' o evento que a funcao ja' grava (`editar_dados`, com o payload);
--   4. `oc_registrar_movimentacao`: a saida do rebanho criada pela OC passa a herdar o tipo da OC (boitel continua pelo planejamento).
-- O que ja' existe NAO e' preenchido aqui (153 vendas vivas: 18 boitel ja' derivam do planejamento, 20 inferiveis pela saida ligada,
-- 115 sem fonte) — espera o OK do Gabriel.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-TIPO-VENDA-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-TIPO-VENDA-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ 1. A COLUNA ═══════════════════
ALTER TABLE public.zoo_operacoes_comerciais ADD COLUMN tipo_venda text;
ALTER TABLE public.zoo_operacoes_comerciais ADD CONSTRAINT zoo_operacoes_comerciais_tipo_venda_check
  CHECK (tipo_venda IS NULL OR (tipo_operacao = 'venda' AND tipo_venda IN ('desmama', 'gado_adulto', 'boitel')));
COMMENT ON COLUMN public.zoo_operacoes_comerciais.tipo_venda IS
  'OC-TIPO-VENDA-01 — o tipo de venda (desmama | gado_adulto | boitel). So'' na venda. Boitel tambem se reconhece pelo planejamento (zoo_operacao_boitel).';

-- ═══════════════════ 2. O SALVAR DA OC ABERTA ═══════════════════
SELECT pg_temp._trocar('public.oc_salvar_rascunho(uuid, uuid, integer, jsonb)'::regprocedure, '51489be17b046424363d499e55dcd314', ARRAY[
  $a$UPDATE public.zoo_operacoes_comerciais SET rascunho = NOT v_completo WHERE id = p_operacao_id;$a$,
  $a$-- OC-TIPO-VENDA-01: o tipo de venda do payload (so' a venda o manda; vazio = sem tipo)
  IF p_payload ? 'tipo_venda' THEN
    UPDATE public.zoo_operacoes_comerciais SET tipo_venda = NULLIF(p_payload->>'tipo_venda', '') WHERE id = p_operacao_id;
  END IF;
  UPDATE public.zoo_operacoes_comerciais SET rascunho = NOT v_completo WHERE id = p_operacao_id;$a$
]);

-- ═══════════════════ 3. A OC FECHADA: so' a classificacao desmama <-> gado adulto ═══════════════════
SELECT pg_temp._trocar('public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer)'::regprocedure, '3caddc14d40cafe33ab53a7879769d03', ARRAY[
  $a$v_permitidas text[] := ARRAY['contraparte_id','observacoes','numero_documento'];$a$,
  $a$v_permitidas text[] := ARRAY['contraparte_id','observacoes','numero_documento','tipo_venda'];$a$,
  $b$UPDATE public.zoo_operacoes_comerciais SET
    contraparte_id   = CASE$b$,
  $b$-- OC-TIPO-VENDA-01: o tipo de venda e' classificacao (desmama <-> gado adulto); boitel tem planejamento e pede reabrir
  IF p_payload ? 'tipo_venda' THEN
    IF v_op.tipo_operacao IS DISTINCT FROM 'venda' THEN
      RAISE EXCEPTION 'Tipo de venda so existe na venda. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
    IF v_op.tipo_venda = 'boitel' OR p_payload->>'tipo_venda' = 'boitel'
       OR EXISTS (SELECT 1 FROM public.zoo_operacao_boitel ob WHERE ob.operacao_id = p_operacao_id) THEN
      RAISE EXCEPTION 'Boitel tem planejamento próprio: para trocar de ou para boitel, reabra a operação. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
    IF NULLIF(p_payload->>'tipo_venda', '') IS NOT NULL AND p_payload->>'tipo_venda' NOT IN ('desmama', 'gado_adulto') THEN
      RAISE EXCEPTION 'Tipo de venda invalido: %. Nada foi gravado.', p_payload->>'tipo_venda' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE public.zoo_operacoes_comerciais SET
    contraparte_id   = CASE$b$,
  $c$    numero_documento = CASE WHEN p_payload ? 'numero_documento' THEN NULLIF(p_payload->>'numero_documento','')     ELSE numero_documento END,$c$,
  $c$    numero_documento = CASE WHEN p_payload ? 'numero_documento' THEN NULLIF(p_payload->>'numero_documento','')     ELSE numero_documento END,
    tipo_venda       = CASE WHEN p_payload ? 'tipo_venda'       THEN NULLIF(p_payload->>'tipo_venda','')           ELSE tipo_venda       END,$c$
]);

-- ═══════════════════ 4. A SAIDA DO REBANHO HERDA O TIPO ═══════════════════
SELECT pg_temp._trocar('public.oc_registrar_movimentacao(uuid, uuid, uuid, date, text, integer, numeric, numeric, text)'::regprocedure, '6c4e0fcc31475d7f4e370a6deaa9ac8d', ARRAY[
  $a$THEN 'boitel' ELSE NULL END;  -- DRE-FAT-BOITEL: subtipo desce ao lancamento$a$,
  $a$THEN 'boitel' ELSE v_op.tipo_venda END;  -- DRE-FAT-BOITEL: subtipo desce ao lancamento; OC-TIPO-VENDA-01: desmama/gado adulto da OC$a$
]);

DO $confere$
BEGIN
  IF position('tipo_venda' in pg_get_functiondef('public.oc_salvar_rascunho(uuid, uuid, integer, jsonb)'::regprocedure)) = 0
     OR position('''tipo_venda''' in pg_get_functiondef('public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer)'::regprocedure)) = 0
     OR position('v_op.tipo_venda' in pg_get_functiondef('public.oc_registrar_movimentacao(uuid, uuid, uuid, date, text, integer, numeric, numeric, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'OC-TIPO-VENDA-01: conferencia final falhou';
  END IF;
END $confere$;
