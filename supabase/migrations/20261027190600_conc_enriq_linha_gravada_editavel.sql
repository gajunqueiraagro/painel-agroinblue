-- PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL — linha GRAVADA da Mesa do Enriquecer passa a ser editavel (banco: o alinhamento e
-- as duas colunas da view; a tela e' o resto do PR).
--
-- POR QUE
-- Na Mesa, linha gravada ficava bloqueada e mandava "use Reverter"; no filho de desmembramento o Reverter responde "nada a
-- reverter" (estado_anterior NULO) e nao havia saida. O banco ja' aceitava regravar (editar_proposto nao confere
-- `aplicado`; apply_row regrava com overwrite e preserva o estado_anterior original), MAS o overwrite manda a proposta
-- INTEIRA: no filho de split apagaria o "[split: ... consol=...]" da observacao (o unico elo com o consolidado cancelado), e
-- em 1.281 das 2.665 linhas aplicadas do proto (02/10) desfaria correcoes feitas no lancamento depois da gravacao.
--
-- O QUE MUDA (decisoes do Gabriel, v2)
-- D1  `_fn_classificacao_alinhar_ao_lancamento(proposta, lancamento)`: o topo da proposta = o LANCAMENTO nas 17 chaves
--     editaveis que o lancamento tem (subcentro leva macro/grupo/centro/plano_conta_id; produto <- descricao). `_planilha`,
--     `_meta` e as duas chaves sem coluna no lancamento (`safra` texto e `categoria`, inertes: o apply_row nao as le') ficam
--     como estao. Dono UNICO de "proposta = lancamento" (o PR da proposta refeita o reusa).
--     O `fn_classificacao_editar_proposto` o chama ANTES de aplicar a edicao, so' em linha APLICADA ainda nao editada
--     depois da ultima gravacao (proposto_editado_em NULO ou <= aplicado_em). Linha nao aplicada: nada muda.
--     `update_proposto_original` nao muda (continua o COALESCE de sempre).
-- D2  gravacao = o mesmo apply_row com overwrite, que ja' grava `aplicado_em = now()` na regravacao (zera o "alterada").
-- D4  a view ganha NO FIM, sem reordenar: `tem_estado_anterior` e `proposto_editado_em`.
--
-- METODO: patch guardado por md5 de origem (ancora contada, destino conferido); CREATE OR REPLACE pelo
-- `pg_get_functiondef` com o corpo trocado — atributos e ACL ficam como estao. Nenhum UPDATE em dado de cliente.
--   editar_proposto   8a5867379bd33018c8b865b78416fc20 -> 83a28c3c200fc859ad176832c9bbb1a0
--   view (definicao)  efc468cb7a2c324b804a9c5b3af3f228 -> 94bc36f3653cf7fec6a1f5cd64e751bd
--   nova: _fn_classificacao_alinhar_ao_lancamento ba92442c9531d67b960735d82c9a7d14

-- ═══ 1. o dono de "proposta = lancamento" (D1) ═══════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_classificacao_alinhar_ao_lancamento(p_prop jsonb, p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  -- As 17 chaves de c_editaveis que o lancamento tem (+ as 4 copias do plano que andam com o subcentro): sai o que a
  -- proposta dizia, entra o lancamento (NULO no lancamento = chave ausente, e o apply_row a le' como "mantem").
  -- Sem lancamento, a proposta volta como veio.
  SELECT CASE WHEN l.id IS NULL THEN p_prop ELSE
    (COALESCE(p_prop, '{}'::jsonb) - ARRAY[
       'subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id',
       'favorecido_id','fazenda_id','produto','numero_documento','safra_id',
       'data_competencia','data_vencimento','data_pagamento','conta_bancaria_id','observacao',
       'tipo_operacao','conta_destino_id','tipo_documento','forma_pagamento','cultura','fase'])
    || jsonb_strip_nulls(jsonb_build_object(
       'subcentro', l.subcentro, 'macro_custo', l.macro_custo, 'grupo_custo', l.grupo_custo,
       'centro_custo', l.centro_custo, 'plano_conta_id', l.plano_conta_id::text,
       'favorecido_id', l.favorecido_id::text, 'fazenda_id', l.fazenda_id::text,
       'produto', l.descricao, 'numero_documento', l.numero_documento, 'safra_id', l.safra_id::text,
       'data_competencia', l.data_competencia::text, 'data_vencimento', l.data_vencimento::text,
       'data_pagamento', l.data_pagamento::text, 'conta_bancaria_id', l.conta_bancaria_id::text,
       'observacao', l.observacao, 'tipo_operacao', l.tipo_operacao, 'conta_destino_id', l.conta_destino_id::text,
       'tipo_documento', l.tipo_documento, 'forma_pagamento', l.forma_pagamento, 'cultura', l.cultura, 'fase', l.fase))
  END
  FROM (SELECT 1) AS um
  LEFT JOIN public.financeiro_lancamentos_v2 l ON l.id = p_lancamento_id
$fn$;
COMMENT ON FUNCTION public._fn_classificacao_alinhar_ao_lancamento(jsonb, uuid) IS
  'PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL: o topo da proposta = o lancamento nas chaves editaveis que ele tem (dono unico de "proposta = lancamento"); _planilha, _meta, safra e categoria ficam.';
REVOKE ALL ON FUNCTION public._fn_classificacao_alinhar_ao_lancamento(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_alinhar_ao_lancamento(jsonb, uuid) TO service_role;

-- ═══ 2. editar_proposto — patch guardado por md5 (D1) ════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text; v_def text;
  a text; b text;
BEGIN
  v_oid := 'public.fn_classificacao_editar_proposto(uuid,jsonb)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '8a5867379bd33018c8b865b78416fc20' THEN
    RAISE EXCEPTION 'editar_proposto nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$  v_prop := COALESCE(v_staging.update_proposto, '{}'::jsonb);$t$;
  b := $t$  v_prop := COALESCE(v_staging.update_proposto, '{}'::jsonb);
  -- PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL (D1): linha GRAVADA ainda nao editada depois da ultima gravacao — a base da
  -- proposta e' o LANCAMENTO (no classificado o sistema prevalece), alinhada ANTES da edicao pedida; o overwrite do
  -- apply_row passa a mudar so' o que o operador mudar. Linha nao aplicada: nada muda.
  IF v_staging.aplicado AND v_staging.match_lancamento_id IS NOT NULL
     AND (v_staging.proposto_editado_em IS NULL
          OR v_staging.proposto_editado_em <= COALESCE(v_staging.aplicado_em, '-infinity'::timestamptz)) THEN
    v_prop := public._fn_classificacao_alinhar_ao_lancamento(v_prop, v_staging.match_lancamento_id);
  END IF;$t$;
  -- o CONCEITO (a inicializacao da proposta) aparece uma vez so' — contado, nao so' a string
  IF (length(v_novo) - length(replace(v_novo, 'v_prop := COALESCE(', ''))) / length('v_prop := COALESCE(') <> 1 THEN
    RAISE EXCEPTION 'editar_proposto: a inicializacao da proposta nao aparece exatamente 1x';
  END IF;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'editar_proposto: ancora da inicializacao nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '83a28c3c200fc859ad176832c9bbb1a0' THEN
    RAISE EXCEPTION 'editar_proposto: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;

-- ═══ 3. a view (D4) — colunas novas NO FIM, patch guardado por md5 ═══════════════════════════════════════════════════
DO $v$
DECLARE
  d text;
  a constant text := $a$(s.update_proposto ->> 'fase'::text) AS proposto_fase
   FROM ($a$;
BEGIN
  d := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(d) <> 'efc468cb7a2c324b804a9c5b3af3f228' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview nao esta na definicao esperada (md5 %). Migration abortada.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: a ancora do fim do SELECT nao casa exatamente 1x';
  END IF;
  d := replace(d, a, $b$(s.update_proposto ->> 'fase'::text) AS proposto_fase,
    (s.estado_anterior IS NOT NULL) AS tem_estado_anterior,
    s.proposto_editado_em
   FROM ($b$);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || d;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.vw_classificacao_staging_preview'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview perdeu security_invoker';
  END IF;
  IF md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass)) <> '94bc36f3653cf7fec6a1f5cd64e751bd' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: definicao resultante inesperada (md5 %).',
      md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass));
  END IF;
END $v$;
