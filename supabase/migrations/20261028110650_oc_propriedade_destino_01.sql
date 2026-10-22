-- OC-PROPRIEDADE-DESTINO-01 (P24) — a "Propriedade de destino" da venda nao era gravada (Gabriel 21/10): o campo existe na tela, mas
-- a OC nao tinha coluna e o Salvar nao o mandava; reabrir voltava vazio. Mesmo molde do OC-TIPO-VENDA-01 (20261028110620/110630):
--   1. coluna `propriedade_destino` (texto livre), so' na venda;
--   2. `oc_salvar_rascunho` grava a chave do payload (ausente preserva);
--   3. `oc_editar_dados_operacao` aceita a chave com a OC FECHADA (e' cadastral: nao mexe em valor, cabeca, data nem financeiro),
--      com antes/depois no evento `editar_dados`.
-- A saida do rebanho NAO herda: na venda, `lancamentos.fazenda_destino` ja' guarda o nome do comprador (FASE 0: 38 das 105 iguais ao
-- comprador e 34 contendo o nome dele) — herdar trocaria um dado pelo outro. Nada existente e' preenchido aqui (espera OK).

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-PROPRIEDADE-DESTINO-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-PROPRIEDADE-DESTINO-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

ALTER TABLE public.zoo_operacoes_comerciais ADD COLUMN propriedade_destino text;
ALTER TABLE public.zoo_operacoes_comerciais ADD CONSTRAINT zoo_operacoes_comerciais_propriedade_destino_check
  CHECK (propriedade_destino IS NULL OR tipo_operacao = 'venda');
COMMENT ON COLUMN public.zoo_operacoes_comerciais.propriedade_destino IS
  'OC-PROPRIEDADE-DESTINO-01 — a propriedade para onde o gado vendido vai (texto livre). So'' na venda.';

SELECT pg_temp._trocar('public.oc_salvar_rascunho(uuid, uuid, integer, jsonb)'::regprocedure, '28f55116c3af724a296ea00d2776aab3', ARRAY[
  $a$  IF p_payload ? 'tipo_venda' THEN
    UPDATE public.zoo_operacoes_comerciais SET tipo_venda = NULLIF(p_payload->>'tipo_venda', '') WHERE id = p_operacao_id;
  END IF;$a$,
  $a$  IF p_payload ? 'tipo_venda' THEN
    UPDATE public.zoo_operacoes_comerciais SET tipo_venda = NULLIF(p_payload->>'tipo_venda', '') WHERE id = p_operacao_id;
  END IF;
  -- OC-PROPRIEDADE-DESTINO-01: a propriedade de destino do payload (so' a venda a manda; vazio = sem)
  IF p_payload ? 'propriedade_destino' THEN
    UPDATE public.zoo_operacoes_comerciais SET propriedade_destino = NULLIF(btrim(p_payload->>'propriedade_destino'), '') WHERE id = p_operacao_id;
  END IF;$a$
]);

SELECT pg_temp._trocar('public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer)'::regprocedure, '03c2dc408b0b14ffa87a2a89cba7ee63', ARRAY[
  $a$ARRAY['contraparte_id','observacoes','numero_documento','tipo_venda'];$a$,
  $a$ARRAY['contraparte_id','observacoes','numero_documento','tipo_venda','propriedade_destino'];$a$,
  $b$  -- OC-TIPO-VENDA-01: o tipo de venda e' classificacao$b$,
  $b$  -- OC-PROPRIEDADE-DESTINO-01: so' a venda tem propriedade de destino
  IF p_payload ? 'propriedade_destino' AND v_op.tipo_operacao IS DISTINCT FROM 'venda' THEN
    RAISE EXCEPTION 'Propriedade de destino so existe na venda. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  -- OC-TIPO-VENDA-01: o tipo de venda e' classificacao$b$,
  $c$    tipo_venda       = CASE WHEN p_payload ? 'tipo_venda'       THEN NULLIF(p_payload->>'tipo_venda','')           ELSE tipo_venda       END,$c$,
  $c$    tipo_venda       = CASE WHEN p_payload ? 'tipo_venda'       THEN NULLIF(p_payload->>'tipo_venda','')           ELSE tipo_venda       END,
    propriedade_destino = CASE WHEN p_payload ? 'propriedade_destino' THEN NULLIF(btrim(p_payload->>'propriedade_destino'),'') ELSE propriedade_destino END,$c$,
  $d$  IF p_payload ? 'tipo_venda'        THEN v_antes := v_antes || jsonb_build_object('tipo_venda',        to_jsonb(v_op.tipo_venda)); END IF;$d$,
  $d$  IF p_payload ? 'tipo_venda'        THEN v_antes := v_antes || jsonb_build_object('tipo_venda',        to_jsonb(v_op.tipo_venda)); END IF;
  IF p_payload ? 'propriedade_destino' THEN v_antes := v_antes || jsonb_build_object('propriedade_destino', to_jsonb(v_op.propriedade_destino)); END IF;$d$,
  $e$  IF p_payload ? 'tipo_venda'        THEN v_depois := v_depois || jsonb_build_object('tipo_venda',        to_jsonb(v_novo.tipo_venda)); END IF;$e$,
  $e$  IF p_payload ? 'tipo_venda'        THEN v_depois := v_depois || jsonb_build_object('tipo_venda',        to_jsonb(v_novo.tipo_venda)); END IF;
  IF p_payload ? 'propriedade_destino' THEN v_depois := v_depois || jsonb_build_object('propriedade_destino', to_jsonb(v_novo.propriedade_destino)); END IF;$e$
]);

DO $confere$
BEGIN
  IF position('propriedade_destino' in pg_get_functiondef('public.oc_salvar_rascunho(uuid, uuid, integer, jsonb)'::regprocedure)) = 0
     OR position('to_jsonb(v_novo.propriedade_destino)' in pg_get_functiondef('public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'OC-PROPRIEDADE-DESTINO-01: conferencia final falhou';
  END IF;
END $confere$;
