-- IMPORTAR-ABATE-PESO-POR-LOTE-01 parte 2 (Chat 13/11 10:40, plano aprovado): DE ONDE VEIO o peso vivo do lote da OC. Com vários lotes
-- no mesmo abate e só o peso GERAL informado, o peso do lote é a MÉDIA DO ABATE e o rendimento de carcaça dele é estimado — a tela
-- põe o selo "peso médio do abate" no RC. Com o peso do próprio lote, o rendimento é o dele.
--
-- O que muda:
--   1) `zoo_operacao_lotes.peso_vivo_fonte` ('lote' | 'media_do_abate'; nulo = não se sabe: os lotes de antes desta migração).
--   2) Gatilho (a regra do nascimento, para TODO gravador): lote novo com peso nasce 'lote'; peso que MUDA vira 'lote' (quem corrige o
--      peso do lote em Reabrir › Lotes informa o dele). Nada mais é tocado na linha.
--   3) `oc_importar_abate`: com MAIS DE UM lote no pacote, o lote sem o seu `peso_vivo_kg` (levou o geral) fica 'media_do_abate'.
--      Com um lote só, o geral É o do lote ('lote').
-- Nenhum dado de cliente muda (a coluna nasce nula; o passado fica sem selo — a conferência dele é passo à parte, com prévia e OK).
SET LOCAL lock_timeout = '2s';

ALTER TABLE public.zoo_operacao_lotes ADD COLUMN peso_vivo_fonte text
  CONSTRAINT zoo_operacao_lotes_peso_vivo_fonte_check CHECK (peso_vivo_fonte IN ('lote', 'media_do_abate'));
COMMENT ON COLUMN public.zoo_operacao_lotes.peso_vivo_fonte IS
  'De onde veio o peso vivo do lote: lote (o dele) | media_do_abate (o geral do abate com vários lotes: rendimento estimado). Nulo = anterior a 117541.';

CREATE FUNCTION public._fn_oc_lote_peso_vivo_fonte() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.peso_vivo_fonte IS NULL AND NEW.peso_medio_negociado_kg IS NOT NULL THEN NEW.peso_vivo_fonte := 'lote'; END IF;
  ELSIF NEW.peso_medio_negociado_kg IS DISTINCT FROM OLD.peso_medio_negociado_kg
        AND NEW.peso_vivo_fonte IS NOT DISTINCT FROM OLD.peso_vivo_fonte THEN
    NEW.peso_vivo_fonte := CASE WHEN NEW.peso_medio_negociado_kg IS NULL THEN NULL ELSE 'lote' END;
  END IF;
  RETURN NEW;
END
$f$;
REVOKE ALL ON FUNCTION public._fn_oc_lote_peso_vivo_fonte() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_oc_lote_peso_vivo_fonte BEFORE INSERT OR UPDATE OF peso_medio_negociado_kg, peso_vivo_fonte
  ON public.zoo_operacao_lotes FOR EACH ROW EXECUTE FUNCTION public._fn_oc_lote_peso_vivo_fonte();

DO $patch$
DECLARE
  v_src text; v_def text;
  a text := $a1$    r := public.oc_salvar_lotes(v_op, p_cliente_id, v_ver, v_lotes);
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;
$a1$;
  b text := $b1$    r := public.oc_salvar_lotes(v_op, p_cliente_id, v_ver, v_lotes);
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;
    -- 117541: com vários lotes, o que levou o peso geral fica com o peso MÉDIO DO ABATE (rendimento estimado; selo na tela)
    IF jsonb_array_length(p_pacote->'lotes') > 1 THEN
      UPDATE public.zoo_operacao_lotes lo SET peso_vivo_fonte = 'media_do_abate'
       WHERE lo.operacao_id = v_op AND lo.cliente_id = p_cliente_id
         AND lo.ordem IN (SELECT (x->>'ordem')::int FROM jsonb_array_elements(p_pacote->'lotes') x
                           WHERE coalesce(nullif(x->>'peso_vivo_kg', '')::numeric, 0) <= 0);
    END IF;
$b1$;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public.oc_importar_abate(uuid, jsonb, boolean)'::regprocedure;
  IF md5(v_src) <> '85e91ff221a31762f79bc3207794b1d3' THEN
    RAISE EXCEPTION '117541: a oc_importar_abate nao e'' a da 117539 (md5 %) — parar', md5(v_src); END IF;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION '117541: a ancora da oc_importar_abate nao casa exatamente 1x — parar'; END IF;
  EXECUTE replace(v_def, a, b);
END
$patch$;
