-- IMPORTAR-ABATE-01 · INCENTIVO NO BÔNUS PRECOCE (achado do Code 6, 12/11 22:23, antes de criar a Pureza). As OCs da Fortunceres lançadas à
-- mão guardam o crédito do acerto ("Incentivo Proape-Precoce/MS") em `zoo_operacao_abate.bonus_precoce_valor`; a importação (117537) põe o
-- incentivo DENTRO do `valor_liquido` do lote mas não no bônus — a linha do abate ficava "base − SENAR ≠ líquido" e a tela do abate, que
-- recalcula base + bônus − retenções, tiraria o incentivo do líquido no próximo Salvar.
--
-- O que muda (só a `oc_importar_abate`; nada de dado de cliente): o `incentivo` do lote do pacote vai também a `bonus_precoce_valor`
-- (fonte 'reais') na linha do abate. O líquido é o mesmo; lote sem incentivo (SM-LT06 e os pacotes de hoje) = igual. Patch guardado por md5
-- do corpo de hoje (o da 117537, a7e27be7…) e por âncora que casa 1×; a definição é a do próprio banco (cabeçalho, SECURITY DEFINER, acesso).
SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  v_src text; v_def text;
  a text := $a1$'funrural_fonte', 'reais') ELSE '{}'::jsonb END);$a1$;
  b text := $n1$'funrural_fonte', 'reais') ELSE '{}'::jsonb END
                 -- 117538: o incentivo do acerto (já dentro do líquido) é o bônus precoce da linha do abate, como nas OCs feitas à mão
                 || CASE WHEN coalesce((l->>'incentivo')::numeric, 0) > 0
                         THEN jsonb_build_object('bonus_precoce_valor', (l->>'incentivo')::numeric, 'bonus_precoce_fonte', 'reais') ELSE '{}'::jsonb END);$n1$;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public.oc_importar_abate(uuid, jsonb, boolean)'::regprocedure;
  IF md5(v_src) <> 'a7e27be7ad89ae54a79f41b5ff090526' THEN
    RAISE EXCEPTION '117538: a oc_importar_abate nao e'' a da 117537 (md5 %) — parar', md5(v_src); END IF;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION '117538: a ancora da oc_importar_abate nao casa exatamente 1x — parar'; END IF;
  EXECUTE replace(v_def, a, b);
END
$patch$;
