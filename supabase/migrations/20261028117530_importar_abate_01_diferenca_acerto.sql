-- IMPORTAR-ABATE-01 · D-ABATE-1 (decisão do Gabriel, FILA 11/11 18:25): a DIFERENÇA ENTRE A SOMA DAS FAIXAS E O TOTAL IMPRESSO NO ACERTO
-- vira COMPONENTE EXPLÍCITO na OC — nunca arredonda, nunca recusa calado. Regra geral (SaaS), achada no caso real SM-LT06 (Minerva José
-- Bonifácio, OC 77562): as 3 faixas do acerto somam 119.771,06 (= a NF); o total impresso no acerto diz 119.771,07 e o líquido a pagar
-- (119.531,53) sai dele. A 117510 conferia "soma dos líquidos dos lotes = recebimento" e recusava (119.531,52 × 119.531,53).
--
-- O que muda (só a `oc_importar_abate` e os dois resumos dela; nada de dado de cliente):
--   - o pacote ganha `diferenca_acerto: { valor, texto }` (valor com sinal: + o acerto paga mais que as faixas, − paga menos);
--   - com valor ≠ 0: o texto é obrigatório e o documento ACERTO do pacote tem de trazer o componente `diferenca_acerto` com o MESMO valor
--     (natureza 'acrescimo' se +, 'desconto_comercial' se −) — o componente é gravado pelo `oc_documento_registrar` de sempre e aparece no
--     documento, na prévia e na trilha;
--   - a conferência passa a ser: soma dos líquidos dos lotes + diferença do acerto = recebimento (meio centavo). A do bruto da NF
--     (líquido + retenções = bruto da NF) NÃO muda: as faixas são a NF;
--   - o evento 'importar_abate' guarda a diferença; os resumos (D1 "a mesma NF já está no sistema") comparam a diferença também
--     (OC sem o componente e pacote sem a chave = 0 dos dois lados: as comparações de hoje não mudam).
--   - A BASE (a2', Chat 12/11 09:05): no abate a base do recebimento é o valor acordado = soma dos líquidos dos lotes (oc_salvar_abate),
--     sem tolerância. A explicação 'outra_receita' nasce sem caixa e a conciliação recusa extrato maior que título da OC: o centavo só
--     casa no banco se ENTRAR NA BASE. Então a oc_salvar_abate soma `_oc_diferenca_do_acerto` (o componente vivo do acerto vivo; 0 em
--     toda OC de 12/11: medido 0 componentes) no acordado do realizado, e a importação registra os documentos ANTES do abate (antes:
--     no fim). A `_oc_base_saldo_operacao` não muda.
-- Patch da `oc_importar_abate` guardado por md5 (o corpo de hoje = o da 117510, 13d3b211…; 5 âncoras, cada uma 1×); o da `oc_salvar_abate`
-- guardado por md5 (639220e1…; 1 âncora).
SET LOCAL lock_timeout = '2s';

-- os resumos: corpo de hoje + a chave `diferenca_acerto` (guardados pelo md5 de hoje)
DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._oc_importar_resumo_da_oc(uuid)'::regprocedure) <> 'bb0f5b88af6da70ba2e67f4752b1c7fe'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._oc_importar_resumo_do_pacote(jsonb)'::regprocedure) <> 'fd8784d50608a70889f5bbcde4790146' THEN
    RAISE EXCEPTION '117530: os resumos da importacao nao sao os da 117510 (md5) — parar';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public._oc_importar_resumo_da_oc(p_operacao_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'data', o.data_operacao,
    'lotes', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', l.ordem, 'cab', l.qtd_negociada, 'categoria', l.categoria_negociada,
                         'peso_vivo_medio_kg', round(l.peso_medio_negociado_kg, 2), 'peso_carcaca_kg', round(a.peso_carcaca_kg, 2),
                         'preco_arroba', round(a.preco_arroba, 4), 'valor_liquido', round(a.valor_liquido, 2),
                         'senar', round(coalesce(a.senar_valor, 0), 2), 'funrural', round(coalesce(a.funrural_valor, 0), 2)) ORDER BY l.ordem)
                         FROM public.zoo_operacao_lotes l
                         LEFT JOIN public.zoo_operacao_abate a ON a.operacao_lote_id = l.id AND a.cenario = 'realizado'
                        WHERE l.operacao_id = o.id), '[]'::jsonb),
    'recebimento', (SELECT jsonb_build_object('valor', round(sum(pt.valor), 2), 'vencimento', min(pt.data_vencimento))
                      FROM public.zoo_operacao_partes pt
                     WHERE pt.operacao_id = o.id AND NOT pt.cancelada AND pt.componente = 'recebimento'),
    'documentos', coalesce((SELECT jsonb_agg(d.especie || ':' || coalesce(d.numero, '') ORDER BY d.especie, d.numero)
                              FROM public.zoo_operacao_documentos d WHERE d.operacao_id = o.id AND NOT d.cancelado), '[]'::jsonb),
    'diferenca_acerto', (SELECT round(coalesce(sum(CASE c.natureza WHEN 'desconto_comercial' THEN -c.valor ELSE c.valor END), 0), 2)
                           FROM public.zoo_operacao_documento_componentes c
                           JOIN public.zoo_operacao_documentos d ON d.id = c.documento_id
                          WHERE d.operacao_id = o.id AND NOT d.cancelado AND NOT c.cancelado
                            AND d.especie = 'acerto' AND c.tipo = 'diferenca_acerto'))
    FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id
$function$;

CREATE OR REPLACE FUNCTION public._oc_importar_resumo_do_pacote(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
    'data', (p->>'data_abate')::date,
    'lotes', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', (l->>'ordem')::int, 'cab', (l->>'cab')::int, 'categoria', p->>'categoria',
                         'peso_vivo_medio_kg', round((p->>'peso_vivo_medio_kg')::numeric, 2), 'peso_carcaca_kg', round((l->>'peso_carcaca_kg')::numeric, 2),
                         'preco_arroba', round((l->>'preco_arroba')::numeric, 4), 'valor_liquido', round((l->>'valor_liquido')::numeric, 2),
                         'senar', round(coalesce((l->>'senar')::numeric, 0), 2), 'funrural', round(coalesce((l->>'funrural')::numeric, 0), 2))
                         ORDER BY (l->>'ordem')::int)
                         FROM jsonb_array_elements(p->'lotes') l), '[]'::jsonb),
    'recebimento', jsonb_build_object('valor', round((p->'recebimento'->>'valor')::numeric, 2), 'vencimento', (p->'recebimento'->>'vencimento')::date),
    'documentos', coalesce((SELECT jsonb_agg((d->>'especie') || ':' || coalesce(d->>'numero', '') ORDER BY d->>'especie', d->>'numero')
                              FROM jsonb_array_elements(p->'documentos') d), '[]'::jsonb),
    'diferenca_acerto', round(coalesce((p->'diferenca_acerto'->>'valor')::numeric, 0), 2))
$function$;

REVOKE ALL ON FUNCTION public._oc_importar_resumo_da_oc(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_importar_resumo_do_pacote(jsonb) FROM PUBLIC, anon, authenticated;

-- a oc_importar_abate: patch guardado por md5, 3 âncoras (cada uma 1×)
DO $patch$
DECLARE
  v_def text; v_novo text; a text; b text; i int;
  ancoras text[] := ARRAY[
    -- (1) a variável da diferença
    $a1$v_soma_liq numeric; v_soma_ret numeric; v_bruto numeric;$a1$,
    -- (2) a conferência do recebimento
    $a2$  IF abs(v_soma_liq - (p_pacote->'recebimento'->>'valor')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'Importar o abate: a soma dos liquidos dos lotes (%) nao e'' o recebimento (%)', v_soma_liq, p_pacote->'recebimento'->>'valor'
      USING ERRCODE = 'P0001'; END IF;$a2$,
    -- (3) a trilha guarda a diferença
    $a3$jsonb_build_object('frente', 'IMPORTAR-ABATE-01', 'chave_nf', v_chave, 'documentos', v_ndoc, 'lotes', jsonb_array_length(v_ids)),$a3$,
    -- (4) os documentos saem do fim... (a remoção vem ANTES da inserção: o texto inserido casaria 2×)
    $a4$
    FOR d IN SELECT x FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) x LOOP
      r := public.oc_documento_registrar(v_op, p_cliente_id, (d - 'lotes') || jsonb_build_object('lotes', v_ids));
      v_ndoc := v_ndoc + 1;
    END LOOP;
$a4$,
    -- (5) ...e entram logo depois dos lotes, ANTES do abate: o componente 'diferenca_acerto' do acerto já existe quando a
    --     oc_salvar_abate grava o valor acordado (a base do recebimento)
    $a5$    END LOOP;
    r := public.oc_salvar_abate(v_op, p_cliente_id, v_ver, 'realizado', v_abate);$a5$];
  novos text[] := ARRAY[
    $n1$v_soma_liq numeric; v_soma_ret numeric; v_bruto numeric; v_dif_ac numeric; v_nat_ac text;$n1$,
    $n2$  -- D-ABATE-1 (117530): a diferença entre a soma das faixas e o total impresso no acerto vem EXPLÍCITA — no pacote
  -- (`diferenca_acerto` {valor, texto}) e como componente `diferenca_acerto` do documento ACERTO, com o mesmo valor. Entra no recebimento.
  v_dif_ac := round(coalesce((p_pacote->'diferenca_acerto'->>'valor')::numeric, 0), 2);
  IF v_dif_ac <> 0 THEN
    IF coalesce(btrim(p_pacote->'diferenca_acerto'->>'texto'), '') = '' THEN
      RAISE EXCEPTION 'Importar o abate: a diferenca do acerto (%) precisa do texto do papel', v_dif_ac USING ERRCODE = 'P0001'; END IF;
    v_nat_ac := CASE WHEN v_dif_ac > 0 THEN 'acrescimo' ELSE 'desconto_comercial' END;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) dd,
                               jsonb_array_elements(coalesce(dd->'componentes', '[]')) c
                    WHERE dd->>'especie' = 'acerto' AND c->>'tipo' = 'diferenca_acerto' AND c->>'natureza' = v_nat_ac
                      AND round((c->>'valor')::numeric, 2) = abs(v_dif_ac)) THEN
      RAISE EXCEPTION 'Importar o abate: a diferenca do acerto (%) tem de estar no documento acerto como componente "diferenca_acerto" (%)',
        v_dif_ac, v_nat_ac USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF abs(v_soma_liq + v_dif_ac - (p_pacote->'recebimento'->>'valor')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'Importar o abate: a soma dos liquidos dos lotes (%) + a diferenca do acerto (%) nao e'' o recebimento (%)',
      v_soma_liq, v_dif_ac, p_pacote->'recebimento'->>'valor' USING ERRCODE = 'P0001'; END IF;$n2$,
    $n3$jsonb_build_object('frente', 'IMPORTAR-ABATE-01', 'chave_nf', v_chave, 'documentos', v_ndoc, 'lotes', jsonb_array_length(v_ids),
                               'diferenca_acerto', p_pacote->'diferenca_acerto'),$n3$,
    $n4$
    -- (117530) os documentos já foram registrados antes do abate (o componente 'diferenca_acerto' entra no valor acordado)
$n4$,
    $n5$    END LOOP;
    -- D-ABATE-1 (117530, a2'): os documentos ANTES do abate — o componente 'diferenca_acerto' do acerto entra no valor acordado
    FOR d IN SELECT x FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) x LOOP
      r := public.oc_documento_registrar(v_op, p_cliente_id, (d - 'lotes') || jsonb_build_object('lotes', v_ids));
      v_ndoc := v_ndoc + 1;
    END LOOP;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;
    r := public.oc_salvar_abate(v_op, p_cliente_id, v_ver, 'realizado', v_abate);$n5$];
BEGIN
  SELECT prosrc INTO v_def FROM pg_proc WHERE oid = 'public.oc_importar_abate(uuid, jsonb, boolean)'::regprocedure;
  IF md5(v_def) <> '13d3b211006cc106a3b3bd8ed631bbcc' THEN
    RAISE EXCEPTION '117530: a oc_importar_abate nao e'' a da 117510 (md5 %) — parar', md5(v_def); END IF;
  v_novo := v_def;
  FOR i IN 1 .. array_length(ancoras, 1) LOOP
    a := ancoras[i]; b := novos[i];
    IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION '117530: a ancora % nao casa exatamente 1x — parar', i; END IF;
    v_novo := replace(v_novo, a, b);
  END LOOP;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_importar_abate(p_cliente_id uuid, p_pacote jsonb, p_simular boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$, v_novo);
END
$patch$;

REVOKE ALL ON FUNCTION public.oc_importar_abate(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_importar_abate(uuid, jsonb, boolean) TO authenticated;

-- D-ABATE-1 (a2', Chat 12/11 09:05): a diferença do acerto EXPLÍCITA entra no valor acordado do abate (a base do recebimento).
-- Com sinal: 'acrescimo' soma, 'desconto_comercial' subtrai. Só o componente vivo do documento ACERTO vivo. Sem componente = 0.
CREATE OR REPLACE FUNCTION public._oc_diferenca_do_acerto(p_operacao_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT round(coalesce(sum(CASE c.natureza WHEN 'desconto_comercial' THEN -c.valor ELSE c.valor END), 0), 2)
    FROM public.zoo_operacao_documento_componentes c
    JOIN public.zoo_operacao_documentos d ON d.id = c.documento_id
   WHERE d.operacao_id = p_operacao_id AND NOT d.cancelado AND NOT c.cancelado
     AND d.especie = 'acerto' AND c.tipo = 'diferenca_acerto'
$function$;
REVOKE ALL ON FUNCTION public._oc_diferenca_do_acerto(uuid) FROM PUBLIC, anon, authenticated;

-- a oc_salvar_abate: o valor acordado do REALIZADO = soma dos líquidos dos lotes + a diferença do acerto (1 âncora, guardada por md5;
-- o cabeçalho, o SECURITY DEFINER, o search_path e o acesso ficam os de hoje: a definição é a do próprio banco, só o corpo muda)
DO $patch2$
DECLARE
  v_def text; v_src text;
  a text := $s1$valor_acordado = (SELECT sum(a.valor_liquido) FROM public.zoo_operacao_abate a WHERE a.operacao_id = p_operacao_id AND a.cenario = 'realizado'),$s1$;
  b text := $s2$valor_acordado = (SELECT sum(a.valor_liquido) FROM public.zoo_operacao_abate a WHERE a.operacao_id = p_operacao_id AND a.cenario = 'realizado')
                       + public._oc_diferenca_do_acerto(p_operacao_id),  -- D-ABATE-1 (117530)$s2$;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public.oc_salvar_abate(uuid, uuid, integer, text, jsonb)'::regprocedure;
  IF md5(v_src) <> '639220e156c4ae6ee3637ec547832624' THEN
    RAISE EXCEPTION '117530: a oc_salvar_abate mudou (md5 %) — parar', md5(v_src); END IF;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION '117530: a ancora da oc_salvar_abate nao casa exatamente 1x — parar'; END IF;
  EXECUTE replace(v_def, a, b);
END
$patch2$;
